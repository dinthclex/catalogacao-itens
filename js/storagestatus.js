/**
 * storagestatus.js — Selo visual no cabeçalho mostrando ONDE e COMO as
 * informações deste app estão sendo guardadas — pedido do usuário: "Vamos
 * dar uma atenção para como as coisas são guardadas no projeto. Quando o
 * projeto estiver sendo executado por 'file:///', isso deve ficar claro
 * para o usuário que os arquivos estão sendo guardados no banco de dados do
 * navegador (no caso indexedDB). Se a página foi carregada por meio de um
 * servidor, isso deve ficar claro para o usuário também... Se for servidor
 * PHP ou Node.js deve ser informado também."
 *
 * Este app SEMPRE guarda de verdade só no IndexedDB do navegador (ver
 * db.js) — isso não muda com file:// vs servidor. O que muda é só COMO a
 * página em si chegou até o navegador (arquivo local aberto direto, ou
 * baixada de um servidor html/php/node) — pedido do usuário pra deixar essa
 * diferença clara, com um desenho: o IndexedDB aparece "dentro" do desenho
 * do navegador quando é file:// (tudo vive só ali, sem servidor nenhum
 * envolvido), e "fora" dele quando é servidor (a PÁGINA veio de um
 * servidor, mesmo que os DADOS continuem só no navegador — daí o desenho
 * do banco ficar space separado, ligado por uma linha, não achando que
 * mora dentro do servidor).
 *
 * Além do IndexedDB (sempre presente, é o banco "de verdade" do app), outros
 * canais de salvamento/exportação já existem no app e só aparecem aqui
 * quando estão de fato em uso (pedido do usuário: "cada tipo de salvamento
 * deve ser representado independentemente"): localStorage (LocalBackup —
 * cópia leve de patrimônios), sessionStorage (marcador de início de sessão +
 * "tipo/setor fixado" — ver app.js _openForm), Email (email.js) e "Baixar no
 * aparelho" (Utils.downloadBlob — sempre disponível, é uma capacidade nativa
 * do navegador, não precisa configuração prévia).
 * Cookies NÃO é usado em nenhum lugar deste app (checado — nenhum
 * `document.cookie` no código-fonte), por isso nunca aparece aqui, mesmo
 * fazendo parte da lista que o usuário mencionou como possibilidade. Google
 * Drive foi removido do app inteiro (pedido do usuário) — por isso também
 * não existe mais como canal aqui.
 */
const StorageStatus = {
  // ---------- Detecção do ambiente (rodada uma vez, no mount) ----------
  _env: null, // { isFile, serverKind: 'php'|'node'|'desconhecido'|null, browser, mobile }

  async _detectEnv() {
    const isFile = location.protocol === 'file:';
    let serverKind = null;
    if (!isFile) {
      // Só dá pra tentar identificar o servidor (PHP/Node/outro) quando a
      // página REALMENTE veio de um servidor — fetch não funciona em
      // file:// (ver CONTEXTO-PROJETO.md), e não faria sentido de qualquer
      // jeito (não existe servidor nenhum nesse caso). Best-effort: alguns
      // servidores estáticos (ex.: GitHub Pages) não mandam nenhum cabeçalho
      // revelador — nesse caso fica "desconhecido", não uma adivinhação.
      try {
        const res = await fetch(location.href, { method: 'HEAD', cache: 'no-store' });
        const poweredBy = (res.headers.get('x-powered-by') || '').toLowerCase();
        const server = (res.headers.get('server') || '').toLowerCase();
        if (poweredBy.includes('php') || server.includes('php')) serverKind = 'php';
        else if (poweredBy.includes('express') || poweredBy.includes('node') || server.includes('node')) serverKind = 'node';
        else serverKind = 'desconhecido';
      } catch (e) { serverKind = 'desconhecido'; }
    }
    return { isFile, serverKind, browser: this._detectBrowser(), mobile: (typeof Utils !== 'undefined' && Utils.isMobileDevice()) || false };
  },

  /** Sniff simples de user-agent — o bastante pra escolher qual selo
   *  desenhar (ver _svgBrowserBadge), não uma detecção de verdade (não
   *  existe API confiável/padrão pra "qual navegador é este" — só pistas). */
  _detectBrowser() {
    const ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'edge';
    if (/OPR\//.test(ua) || /\bOpera\b/.test(ua)) return 'opera';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/CriOS\//.test(ua) || (/Chrome\//.test(ua) && !/Edg\//.test(ua))) return 'chrome';
    if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'safari';
    return 'outro';
  },

  // ---------- Estado por canal (usado?, sujo/limpo, quando foi a última vez) ----------
  // "esmaecido quando houve alguma mudança e ainda não foi salvo" (pedido do
  // usuário) — `dirty:true` é o estado "ainda não". `lastOkAt` é só
  // informativo (mostrado na janela de detalhe de cada canal).
  _channels: {
    indexeddb: { used: true, dirty: false, lastOkAt: null },
    localstorage: { used: false, dirty: false, lastOkAt: null },
    sessionstorage: { used: false, dirty: false, lastOkAt: null },
    email: { used: false, dirty: false, lastOkAt: null },
    download: { used: true, dirty: false, lastOkAt: null }, // sempre disponível — não depende de configuração prévia, ver comentário no topo do arquivo
  },

  /** Toda mutação de catálogo (item/mapa) "suja" os canais que ainda não
   *  rodaram desde então — chamado pelo listener de DB.onSaveStatus abaixo
   *  (cobre TODA gravação de verdade do app, ver comentário grande em
   *  db.js `tx()`), então nunca precisa ser chamado manualmente por outro
   *  arquivo. */
  _markAllDirtyExcept(exceto) {
    Object.keys(this._channels).forEach((k) => { if (k !== exceto) this._channels[k].dirty = true; });
  },

  /** Chamado quando um canal termina de gravar/exportar com sucesso — ver os
   *  ganchos no `mount()` abaixo (cada um plugado no ponto de sucesso já
   *  existente daquele módulo, sem duplicar lógica de envio nenhuma aqui). */
  markOk(channel) {
    const c = this._channels[channel];
    if (!c) return;
    c.used = true;
    c.dirty = false;
    c.lastOkAt = new Date().toISOString();
    this._renderChannels();
  },

  async mount() {
    this._env = await this._detectEnv();

    // localStorage/sessionStorage: "usados" depende só de existirem/estarem
    // habilitados, não de uma ação — já podem entrar como "limpos" na hora.
    this._channels.localstorage.used = !!(typeof LocalBackup !== 'undefined' && LocalBackup.isSupported() && LocalBackup.isEnabled());
    try { this._channels.sessionstorage.used = typeof sessionStorage !== 'undefined'; } catch (e) { this._channels.sessionstorage.used = false; }

    // Email: só conta como "em uso" se a pessoa já configurou um destino —
    // sem isso, mostrar o ícone seria prometer um canal que não faz nada ainda.
    try {
      const emailDestino = (typeof DB !== 'undefined') ? await DB.getSetting('emailDestino', '') : '';
      this._channels.email.used = !!(emailDestino || '').trim();
    } catch (e) { /* ignora */ }

    this._buildWidgetDom();
    this._renderDiagram();
    this._renderChannels();

    // ---------- Ganchos: cada canal marca "ok" no PRÓPRIO ponto de sucesso
    // já existente (nenhuma lógica de envio nova aqui, só um aviso a mais). ----------

    // IndexedDB — cobre TODA gravação de verdade do app (ver tx() em db.js);
    // 'saving' suja o resto (a mudança ainda não passou pelos outros
    // canais), 'saved' limpa só o IndexedDB.
    if (typeof DB !== 'undefined' && DB.onSaveStatus) {
      DB.onSaveStatus((status) => {
        if (status === 'saving') { this._markAllDirtyExcept(null); this._renderChannels(); }
        else if (status === 'saved') { this.markOk('indexeddb'); }
        // 'error' não marca nada — a mensagem de erro já vem do próprio db.js/app.js.
      });
    }

    // localStorage — LocalBackup.pushItem/removeItem já são chamados logo
    // depois de cada gravação de item nos MESMOS pontos que AutoSave/P2P
    // (ver localbackup.js) — encapsula os dois métodos aqui só pra saber
    // QUANDO isso aconteceu, sem duplicar a gravação em si.
    if (typeof LocalBackup !== 'undefined') {
      const origPush = LocalBackup.pushItem.bind(LocalBackup);
      LocalBackup.pushItem = (item) => { const r = origPush(item); if (LocalBackup.isEnabled()) this.markOk('localstorage'); return r; };
      const origRemove = LocalBackup.removeItem.bind(LocalBackup);
      LocalBackup.removeItem = (id) => { const r = origRemove(id); if (LocalBackup.isEnabled()) this.markOk('localstorage'); return r; };
    }

    // Baixar no aparelho — Utils.downloadBlob é o ÚNICO ponto por onde TODO
    // download deste app passa (downloadJSON/downloadText chamam ele por
    // baixo, e é usado direto em vários lugares — table.js, search.js,
    // settings.js, autoexport.js) — encapsular só aqui cobre todos de graça.
    if (typeof Utils !== 'undefined' && Utils.downloadBlob) {
      const origDownload = Utils.downloadBlob.bind(Utils);
      Utils.downloadBlob = (blob, filename, opts) => { const r = origDownload(blob, filename, opts); this.markOk('download'); return r; };
    }

    // Email — mailto SÓ ABRE o programa de email (não dá pra saber se a
    // pessoa realmente clicou "enviar" depois — limitação de qualquer app
    // 100% cliente); "ok" aqui significa "o app já fez a parte dele", não
    // "confirmado entregue" — condizente com a descrição mostrada na janela
    // de detalhe deste canal (ver _channelInfo).
    if (typeof EmailModule !== 'undefined' && EmailModule.runConfiguredExport) {
      const origRun = EmailModule.runConfiguredExport.bind(EmailModule);
      EmailModule.runConfiguredExport = async (...args) => {
        const r = await origRun(...args);
        if (r?.mailtoAberto || r?.servidorEnviado) this.markOk('email');
        return r;
      };
    }
  },

  // ---------- Ícones (SVG genéricos/estilizados — NUNCA os logos oficiais
  // de Chrome/Firefox/Edge/Safari, que são marcas registradas; são só formas
  // abstratas que sugerem cada um, com cor própria de identidade) ----------
  _ICON_STROKE: 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"',

  _svgPage() {
    return `<svg viewBox="0 0 24 24" ${this._ICON_STROKE} xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="16" height="18" rx="1.5"/>
      <path d="M7.5 8h9M7.5 12h9M7.5 16h5.5"/>
    </svg>`;
  },

  _svgDatabase() {
    return `<svg viewBox="0 0 24 24" ${this._ICON_STROKE} xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/>
      <path d="M4.5 5.5V18.5c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8V5.5"/>
      <path d="M4.5 12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8"/>
    </svg>`;
  },

  /** Selo do navegador — formas/cores abstratas (não os logos de verdade,
   *  ver comentário acima), o bastante pra reconhecer "é o Chrome" vs "é o
   *  Firefox" de relance sem reproduzir marca registrada nenhuma. */
  _svgBrowserBadge(browser) {
    const cores = { chrome: '#4f8cff', firefox: '#ff8a3d', edge: '#3ecf8e', safari: '#3dc5ff', opera: '#ff5a7a', outro: '#9aa4b2' };
    const cor = cores[browser] || cores.outro;
    const formas = {
      chrome: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 5v4.4M7 15l3.8-2.2M17 15l-3.8-2.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      firefox: '<path d="M12 4.5c4.4 0 7.5 3.4 7.5 7.4 0 4.2-3.3 7.6-7.6 7.6-3.7 0-6.8-2.6-7.4-6 .9 1.7 2.7 2.6 4.3 2 .1-1.6-.8-2.7-.8-2.7 2.2.6 3.4-.8 3.1-2.5-.2-1.2-1.4-1.9-1.4-1.9 1.7-.4 2.5.6 2.5.6-.4-2.4-2.6-3.3-2.6-3.3.7-.7 2-1.2 2.9-1.2z" fill="currentColor" stroke="none"/>',
      edge: '<path d="M4.5 12c0-4.4 3.6-7.5 7.7-7.5 2.4 0 4.3 1 5.5 2.4-3.9-1.6-8.2.5-9 4.1-.5 2.4.7 4.6 3 5.3-2.9.6-5.3-1.3-6.4-3.7-.5-.2-.8-.4-.8-.6z" fill="currentColor" stroke="none"/><path d="M8.2 15.3c1.6 2.6 5 3.9 8 2.8 1.6-.6 2.7-1.7 3.3-2.7-1.4 1-3.4 1.3-5.2.6-2.4-.9-3.6-3-3.3-5.2" stroke="currentColor" stroke-width="1.5" fill="none"/>',
      safari: '<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M15.5 8.5L11 11l-2.5 4.5L13 13l2.5-4.5z" fill="currentColor" stroke="none"/>',
      opera: '<ellipse cx="12" cy="12" rx="5" ry="7.3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
      outro: '<rect x="4.5" y="5" width="15" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 8.5h15" stroke="currentColor" stroke-width="1.5"/>',
    };
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="color:${cor}">${formas[browser] || formas.outro}</svg>`;
  },

  _svgDevice(mobile) {
    return mobile
      ? `<svg viewBox="0 0 24 24" ${this._ICON_STROKE} xmlns="http://www.w3.org/2000/svg"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg>`
      : `<svg viewBox="0 0 24 24" ${this._ICON_STROKE} xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="4" width="19" height="12.5" rx="1.5"/><path d="M8 20.5h8M12 16.5v4"/></svg>`;
  },

  _svgLocalStorage() {
    return `<svg viewBox="0 0 24 24" ${this._ICON_STROKE} xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="6" width="17" height="12" rx="1.5"/>
      <path d="M3.5 10.5h17M8 14h3"/>
    </svg>`;
  },

  _svgSessionStorage() {
    return `<svg viewBox="0 0 24 24" ${this._ICON_STROKE} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12.5" r="7.8"/>
      <path d="M12 8v4.5l3 2M9.5 2.5h5"/>
    </svg>`;
  },

  _svgEmail() {
    return `<svg viewBox="0 0 24 24" ${this._ICON_STROKE} xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5.5" width="18" height="13" rx="1.5"/>
      <path d="M3.5 6.5L12 13l8.5-6.5"/>
    </svg>`;
  },

  _svgDownload() {
    return `<svg viewBox="0 0 24 24" ${this._ICON_STROKE} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3.5v11M8 11l4 4 4-4"/>
      <path d="M4.5 17v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V17"/>
    </svg>`;
  },

  // ---------- Widget no cabeçalho ----------
  /** Insere `#storage-status-widget` no cabeçalho padrão, ENTRE o `.spacer`
   *  e os botões "👁️ Ver lista"/"⚙️ Configurações" (pedido do usuário: "vão
   *  ficar em um bloco ao lado esquerdo dos botões"). Idempotente (mesmo
   *  espírito de App._wireNav/_initSaveStatusBar). */
  _buildWidgetDom() {
    if (document.getElementById('storage-status-widget')) return;
    const bar = document.getElementById('topbar-default');
    const btnVerLista = document.getElementById('btn-verlista-top');
    if (!bar || !btnVerLista) return;
    const wrap = document.createElement('div');
    wrap.className = 'storage-status-widget';
    wrap.id = 'storage-status-widget';
    wrap.innerHTML = `
      <button type="button" class="ssw-diagram" id="ssw-diagram" title="Como as informações deste app são guardadas — toque para ver detalhes"></button>
      <div class="ssw-channels" id="ssw-channels"></div>
    `;
    bar.insertBefore(wrap, btnVerLista);
    wrap.querySelector('#ssw-diagram').onclick = () => this._openIndexedDbWindow();
  },

  /** Desenho composto: navegador (com o "selo" do navegador detectado + o
   *  ícone da própria página/app dentro) e o IndexedDB — DENTRO da caixa do
   *  navegador quando file:// (pedido do usuário), FORA dela (ligado por
   *  uma linha) quando veio de um servidor, com um selinho pequeno PHP/Node/
   *  servidor. O aparelho (PC/celular) aparece como uma moldura ao redor de
   *  tudo — "se for PC ou celular deve ficar evidente também". */
  _renderDiagram() {
    const el = document.getElementById('ssw-diagram');
    if (!el || !this._env) return;
    const { isFile, serverKind, browser, mobile } = this._env;
    const rotulo = isFile ? 'arquivo local (file:///)' : `servidor${serverKind && serverKind !== 'desconhecido' ? ' ' + serverKind.toUpperCase() : ''}`;
    el.title = `Página aberta via ${rotulo} · navegador: ${browser} · aparelho: ${mobile ? 'celular/tablet' : 'PC'} — toque para ver onde os dados ficam guardados`;
    const dbBadge = !isFile
      ? `<span class="ssw-serverkind">${serverKind === 'php' ? 'PHP' : serverKind === 'node' ? 'Node' : '?'}</span>`
      : '';
    el.innerHTML = `
      <span class="ssw-device" aria-hidden="true">${this._svgDevice(mobile)}</span>
      <span class="ssw-browserbox ${isFile ? 'ssw-browserbox--file' : 'ssw-browserbox--server'}">
        <span class="ssw-browserbadge" aria-hidden="true">${this._svgBrowserBadge(browser)}</span>
        <span class="ssw-pageicon" aria-hidden="true">${this._svgPage()}</span>
        ${isFile ? `<span class="ssw-dbicon ssw-dbicon--inside" aria-hidden="true">${this._svgDatabase()}</span>` : ''}
      </span>
      ${!isFile ? `<span class="ssw-dbicon ssw-dbicon--outside" aria-hidden="true">${this._svgDatabase()}${dbBadge}</span>` : ''}
    `;
  },

  _CHANNEL_ORDER: ['localstorage', 'sessionstorage', 'email', 'download'],
  _CHANNEL_META: {
    localstorage: { label: 'localStorage', svg: '_svgLocalStorage' },
    sessionstorage: { label: 'sessionStorage', svg: '_svgSessionStorage' },
    email: { label: 'Email', svg: '_svgEmail' },
    download: { label: 'Baixar no aparelho', svg: '_svgDownload' },
  },

  /** Ícones coloridos = "acabou de salvar tudo"; esmaecidos = "houve
   *  mudança, ainda não passou por este canal" (pedido do usuário). */
  _renderChannels() {
    const host = document.getElementById('ssw-channels');
    if (!host) return;
    host.innerHTML = this._CHANNEL_ORDER.filter((k) => this._channels[k].used).map((k) => {
      const c = this._channels[k];
      const meta = this._CHANNEL_META[k];
      return `<button type="button" class="ssw-chan ${c.dirty ? 'ssw-chan--dirty' : 'ssw-chan--ok'}" data-channel="${k}" title="${meta.label} — ${c.dirty ? 'há mudanças ainda não passadas por aqui' : 'em dia'}">${this[meta.svg]()}</button>`;
    }).join('');
    host.querySelectorAll('.ssw-chan').forEach((btn) => {
      btn.onclick = () => this._openChannelWindow(btn.dataset.channel);
    });
  },

  // ---------- Pilha de janelas (pedido do usuário: "tudo em uma janela à
  // parte (pilha de janelas, ou seja, ao 'voltar', volta para a última
  // janela)") — mesma classe visual `.modal-backdrop`/`.modal-sheet` usada
  // no resto do app (ver Utils.showChoiceModal), só que empilhável: abrir
  // uma nova NÃO remove a anterior do DOM, só a esconde; "Voltar" mostra a
  // de baixo de novo em vez de fechar tudo. ----------
  _stack: [],

  _pushWindow(html, { title } = {}) {
    this._stack.forEach((w) => { w.style.display = 'none'; });
    const el = document.createElement('div');
    el.className = 'modal-backdrop ssw-window';
    el.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <div class="ssw-window-head">
          ${this._stack.length ? '<button type="button" class="btn secondary sm ssw-back">← Voltar</button>' : '<span></span>'}
          <button type="button" class="btn secondary sm ssw-close">Fechar</button>
        </div>
        <h3 style="margin-top:6px">${Utils.escapeHtml(title || '')}</h3>
        <div class="ssw-window-body">${html}</div>
      </div>`;
    document.body.appendChild(el);
    this._stack.push(el);
    el.querySelector('.ssw-close').onclick = () => this._closeAllWindows();
    el.querySelector('.ssw-back')?.addEventListener('click', () => this._popWindow());
    el.addEventListener('mousedown', (e) => { if (e.target === el) this._closeAllWindows(); });
    return el;
  },

  _popWindow() {
    const top = this._stack.pop();
    top?.remove();
    const prev = this._stack[this._stack.length - 1];
    if (prev) prev.style.display = '';
  },

  _closeAllWindows() {
    this._stack.forEach((w) => w.remove());
    this._stack = [];
  },

  // ---------- Conteúdo das janelas ----------
  /** Janela do "diagrama" (IndexedDB + como a página foi aberta) — pedido do
   *  usuário: "uma descrição sobre cada uma das situações deve estar
   *  presente: possibilidades e limitações". */
  async _openIndexedDbWindow() {
    const { isFile, serverKind, browser, mobile } = this._env || {};
    const situacao = isFile
      ? `<p><b>Este app foi aberto direto de um arquivo no computador/aparelho</b> (endereço começando com <code>file:///</code>), sem nenhum servidor envolvido.</p>
         <p><b>Possibilidades:</b> funciona 100% offline, para sempre, sem precisar de internet nem instalar nada além do navegador; os dados ficam só neste navegador, neste aparelho.</p>
         <p><b>Limitações:</b> não dá para acessar o catálogo de outro aparelho (cada um teria sua própria cópia, sem sincronizar sozinho); alguns recursos que exigem endereço http/https de verdade (um "contexto seguro" do navegador) não funcionam assim. Apagar os dados do navegador (ex.: "limpar dados de navegação") apaga o catálogo também, já que ele mora só ali.</p>`
      : `<p><b>Este app foi carregado a partir de um servidor</b>${serverKind && serverKind !== 'desconhecido' ? ` (identificado como <b>${serverKind === 'php' ? 'PHP' : 'Node.js'}</b>, pelos cabeçalhos da resposta)` : ' (não foi possível identificar se é PHP, Node.js ou outro — o servidor não informa isso nos cabeçalhos)'}.</p>
         <p><b>Possibilidades:</b> o app pode ser aberto pelo mesmo endereço em qualquer aparelho na rede (ou na internet, se publicado assim); recursos que exigem http/https de verdade passam a funcionar.</p>
         <p><b>Limitações:</b> o servidor aqui só ENTREGA os arquivos do app (HTML/CSS/JS) — os dados do catálogo continuam guardados só no IndexedDB de CADA navegador que abre o app, não no servidor (a não ser que "🖥️ Servidor local"/"📡 Sincronização" das Configurações estejam configurados à parte — isso é outra coisa, ver o servidor PHP opcional em <code>server/</code>).</p>`;
    const counts = await this._categoryCounts();
    const c = this._channels.indexeddb;
    const html = `
      ${situacao}
      <p style="color:var(--text-dim); font-size:12.5px">Navegador detectado: <b>${Utils.escapeHtml(this._browserLabel(browser))}</b> · Aparelho: <b>${mobile ? 'celular/tablet' : 'PC'}</b></p>
      <hr style="border-color:var(--border); margin:10px 0">
      <p><b>💽 IndexedDB</b> — o banco de dados de verdade deste app, sempre usado, guarda TUDO: fotos, patrimônios e mapas, incluindo as imagens em tamanho completo. ${c.lastOkAt ? `Última gravação: ${Utils.formatRelative(c.lastOkAt)}.` : ''}</p>
      ${this._categoryBlocksHtml(counts, { fotos: true, patrimonios: true, mapas: true })}
    `;
    this._closeAllWindows();
    this._pushWindow(html, { title: '💽 Onde os dados ficam guardados' });
  },

  _browserLabel(b) {
    return { chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge', safari: 'Safari', opera: 'Opera', outro: 'não identificado' }[b] || 'não identificado';
  },

  /** Contagens reais (pedido do usuário: "deve ser possível ver o que ele
   *  salvou") — uma leitura só, reaproveitada por qualquer janela de canal
   *  que precise mostrar números. */
  async _categoryCounts() {
    try {
      const [items, maps, fotos] = await Promise.all([
        DB.getAllItems(), DB.getAllMaps(), DB.getAllAmbientePhotos(),
      ]);
      // `avatarDataUrl` NÃO conta mais aqui — é (era) só o ícone colorido
      // gerado pra item SEM foto (agora nem gravado, ver avatar.js); "tem
      // foto de verdade" é ter uma mapPhoto vinculada (fotoAnexadaId) ou,
      // em itens bem antigos, o campo legado fotoDataUrl.
      const comFoto = items.filter((it) => it.fotoDataUrl || it.fotoAnexadaId).length;
      return {
        patrimonios: items.length,
        fotosDeItens: comFoto,
        fotosDeAmbiente: fotos.length,
        mapas: maps.length,
      };
    } catch (e) { return { patrimonios: 0, fotosDeItens: 0, fotosDeAmbiente: 0, mapas: 0 }; }
  },

  /** Pedido do usuário: "deve haver itens separados. Por exemplo: imagens
   *  (fotos); patrimônios (com as informações que fazem parte do seu grupo:
   *  descrição, setor, etc); mapas (como pode ser inserido imagens e,
   *  futuramente, modelos 3D... deve ser um bloco de informações à parte)." */
  _categoryBlocksHtml(counts, { fotos, patrimonios, mapas }) {
    const blocks = [];
    if (patrimonios) blocks.push(`
      <div class="ssw-catblock">
        <b>📦 Patrimônios</b> — ${counts.patrimonios} cadastrado(s)
        <div style="color:var(--text-dim); font-size:12px">Campos do grupo: patrimônio, descrição, tipo, setor, datas de inserção/modificação, foto/avatar.</div>
      </div>`);
    if (fotos) blocks.push(`
      <div class="ssw-catblock">
        <b>🖼️ Fotos</b> — ${counts.fotosDeItens} de patrimônio(s) + ${counts.fotosDeAmbiente} de ambiente
        <div style="color:var(--text-dim); font-size:12px">Fotos anexadas a um patrimônio (avatar/foto principal) e fotos do ambiente usadas na tela "Fotos" (com os orbs marcando onde cada item está).</div>
      </div>`);
    if (mapas) blocks.push(`
      <div class="ssw-catblock">
        <b>🗺️ Mapas</b> — ${counts.mapas} ambiente(s)
        <div style="color:var(--text-dim); font-size:12px">Planta baixa (paredes/portas/janelas/câmeras/objetos/pinos de item), incluindo imagens coladas/carregadas no mapa e, futuramente, modelos 3D próprios (fora do catálogo padrão de objetos do app) — bloco à parte por natureza diferente do resto.</div>
      </div>`);
    return `<div class="ssw-catblocks">${blocks.join('')}</div>`;
  },

  /** Janela de detalhe de UM canal (localStorage/sessionStorage/Email/
   *  Download) — "o que ele salva e o que ele salvou". */
  async _openChannelWindow(channel) {
    const c = this._channels[channel];
    if (!c) return;
    const info = await this._channelInfo(channel);
    const statusLinha = `<p style="color:${c.dirty ? 'var(--warn)' : 'var(--ok)'}; font-weight:600">${c.dirty ? '⏳ Há mudanças no catálogo que ainda não passaram por aqui.' : '✓ Em dia com a última mudança conhecida.'}${c.lastOkAt ? ` Última vez: ${Utils.formatRelative(c.lastOkAt)}.` : ' Ainda não rodou nesta sessão.'}</p>`;
    const html = `${info.descricao}${statusLinha}${info.categorias ? this._categoryBlocksHtml(await this._categoryCounts(), info.categorias) : ''}`;
    this._pushWindow(html, { title: `${info.emoji} ${info.titulo}` });
  },

  async _channelInfo(channel) {
    if (channel === 'localstorage') {
      const n = (typeof LocalBackup !== 'undefined') ? LocalBackup.count() : 0;
      return {
        emoji: '🗄️', titulo: 'localStorage',
        descricao: `<p><b>Possibilidades:</b> cópia leve e independente dos patrimônios (só texto — patrimônio, tipo, descrição, setor, data), guardada separada do IndexedDB como rede de segurança simples. ${n} registro(s) guardado(s) agora.</p><p><b>Limitações:</b> bem menor em tamanho (uns 5-10MB no total, depende do navegador) — não cabem fotos; não é o catálogo "de verdade" (esse é o IndexedDB), só um resumo pra consultar rápido se algo acontecer com o principal (Configurações → "📝 Lista simples"). Pode ser desligado nas Configurações.</p>`,
        categorias: { patrimonios: true },
      };
    }
    if (channel === 'sessionstorage') {
      return {
        emoji: '⏱️', titulo: 'sessionStorage',
        descricao: `<p><b>Possibilidades:</b> guarda só conveniências desta ABA/sessão — o horário em que a sessão começou, e o "tipo"/"setor" fixado (quando marcado) pra pré-preencher o próximo cadastro sem digitar de novo.</p><p><b>Limitações:</b> não guarda patrimônios/fotos/mapas nenhum — é só uma memória de curto prazo, apagada sozinha ao fechar a aba/o navegador (por isso não tem "o que já foi salvo" pra listar aqui, ao contrário dos outros canais).</p>`,
        categorias: null,
      };
    }
    if (channel === 'email') {
      const cfg = (typeof DB !== 'undefined') ? await DB.getAllSettings() : {};
      return {
        emoji: '✉️', titulo: 'Email',
        descricao: `<p><b>Possibilidades:</b> abre o programa de email padrão do aparelho já preenchido com os itens exportados (modo "mailto"), e/ou envia para um servidor próprio configurado (webhook/PHP). Destino atual: ${Utils.escapeHtml(cfg.emailDestino || '(nenhum configurado)')}.</p><p><b>Limitações:</b> no modo "mailto", o app só ABRE o rascunho — precisa a pessoa clicar em "enviar" no próprio programa de email, sem confirmação de entrega por aqui (limitação de qualquer app 100% cliente, sem servidor de email próprio).</p>`,
        categorias: { patrimonios: true },
      };
    }
    // download
    return {
      emoji: '⬇️', titulo: 'Baixar no aparelho',
      descricao: `<p><b>Possibilidades:</b> gera um arquivo (JSON/TXT/CSV, conforme a tela) e baixa direto na pasta de Downloads do navegador/aparelho — sempre disponível, não precisa configurar nada nem ter internet.</p><p><b>Limitações:</b> o navegador nunca revela o caminho exato de onde salvou (só o nome do arquivo) — normalmente cai na pasta "Downloads" padrão; cada download é um retrato de UM momento (não fica sincronizado automaticamente depois).</p>`,
      categorias: { patrimonios: true, mapas: true },
    };
  },
};

window.StorageStatus = StorageStatus;
