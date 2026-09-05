/**
 * capture.js — Tela "Fotos" (antigo botão/tela "Capturar" — só o rótulo
 * visível mudou, a rota interna continua "capturar"): câmera do celular →
 * foto → a foto é salva como uma mapPhoto de verdade (ver js/db.js
 * addAmbientePhoto) → modal de vínculo (ver _openPhotoLinkModal): a pessoa
 * escolhe entre marcar onde a foto fica na planta baixa 2D, dizer que a foto
 * É um patrimônio (abre o MESMO formulário de cadastro usado em qualquer
 * outro lugar do app, App.openItemForm, já com a foto anexada — ver
 * item.fotoAnexadaId) ou deixar sem vínculo por enquanto (a foto ainda
 * ganha uma posição automática, na periferia do que já existe no mapa, só
 * que continua contando como "sem lugar" pra 📦 Caixa — ver
 * Mapping.findPeripheralSlot/PhotoGrid.getUnsorted). O botão "✏️ Manual"
 * (sem tirar foto nenhuma) TAMBÉM abre App.openItemForm() — EXATAMENTE a
 * mesma janela usada por "Tabela"->"+ Novo" e "Cartões"->"+ Novo" (pedido do
 * usuário); o formulário próprio desta tela (antigo _openForm) foi removido,
 * já que os dois caminhos (com foto e manual) usam o mesmo formulário
 * genérico agora. Tipo fixado/setor da sessão (ver
 * _stickyTipo/_sessionSetor/syncButtons) usam as MESMAS chaves de
 * sessionStorage nos dois formulários, então "fixar" num vale no outro. O
 * código de barras (ver js/barcode.js) continua lido a cada foto — recurso
 * separado e mantido, só que agora só usado se a foto virar um patrimônio
 * (sugere o número no formulário). O OCR e o reconhecimento de objeto que
 * existiam aqui (leitura automática do número/sugestão de tipo por imagem, e
 * o modo "filmar e processar depois") foram removidos numa rodada anterior.
 */

const CaptureView = {
  _container: null,
  _stream: null,
  _video: null,
  _stickyTipo: null, // tipo fixado para preenchimento automático em lote (itens iguais em sequência)
  _sessionSetor: '', // setor preenchido uma vez para toda a sessão de captura

  async mount(container) {
    this._container = container;
    this._stickyTipo = sessionStorage.getItem('catalogo_tipo_fixo') || null;
    this._sessionSetor = sessionStorage.getItem('catalogo_setor_sessao') || '';
    container.innerHTML = `
      <div class="camera-wrap" id="cam-wrap">
        <video id="cam-video" autoplay playsinline muted></video>
        <div class="camera-topbar">
          <button class="icon-btn" id="cam-close" title="Fechar a câmera e voltar para a tabela">✕ Fechar</button>
          <div style="display:flex; gap:6px">
            <button class="icon-btn" id="cam-switch" title="Trocar entre câmera traseira e frontal">🔄</button>
          </div>
        </div>
        <div style="position:absolute; top:52px; left:12px; right:12px; z-index:5; display:flex; justify-content:center; gap:6px; flex-wrap:wrap">
          <button class="icon-btn${this._sessionSetor ? ' active' : ''}" id="cam-setor" title="Setor usado automaticamente em todos os itens desta sessão">${this._sessionSetor ? '📍 ' + Utils.escapeHtml(this._sessionSetor) : '🏷️ Definir setor da sessão'}</button>
          <button class="icon-btn" id="cam-download-session" title="Baixar os itens catalogados nesta sessão (útil sem servidor local configurado)">⬇️ Sessão (<span id="cam-session-count">0</span>)</button>
        </div>
        <div class="camera-controls" id="cam-controls-normal">
          <button class="icon-btn" id="cam-manual" title="Cadastrar um item digitando tudo manualmente, sem usar a câmera">✏️ Manual</button>
          <button class="shutter-btn" id="cam-shutter" title="Tirar foto e cadastrar o item"></button>
          <button class="icon-btn${this._stickyTipo ? ' active' : ''}" id="cam-flash" title="Fixar o tipo do item para preencher automaticamente os próximos, útil ao cadastrar vários itens iguais em sequência">${this._stickyTipo ? '📌 ' + Utils.escapeHtml(this._stickyTipo) : '📌 Fixar tipo'}</button>
        </div>
      </div>
    `;

    this._video = container.querySelector('#cam-video');
    container.querySelector('#cam-close').onclick = () => App.navigate('tabela');
    // Pedido do usuário: "Manual" deve abrir EXATAMENTE a mesma janela que "Tabela"->"+ Novo" e
    // "Cartões"->"+ Novo" usam (App.openItemForm) — o formulário próprio desta tela (antigo
    // _openForm) foi removido: o fluxo COM foto (ver _afterPhotoCaptured/_openPhotoLinkModal)
    // já usava App.openItemForm({ prefillPatrimonio }) também, então agora os dois caminhos
    // (manual e com foto) usam o mesmo formulário genérico. App.openItemForm() já prefila
    // tipo/setor sozinho a partir das MESMAS chaves de sessionStorage que esta tela usa (ver
    // _stickyTipo/_sessionSetor acima e app.js openItemForm), então nem precisa passar nada.
    container.querySelector('#cam-manual').onclick = () => App.openItemForm();
    container.querySelector('#cam-shutter').onclick = () => this._captureAndProcess();
    container.querySelector('#cam-flash').onclick = () => this._toggleStickyTipo();
    container.querySelector('#cam-setor').onclick = () => this._promptSessionSetor();
    container.querySelector('#cam-download-session').onclick = () => this._downloadSessionData();
    container.querySelector('#cam-switch').onclick = () => this._switchCamera();

    await this._refreshSessionCount();
    await this._startCamera();
    if (await DB.getSetting('geoAtivo', true)) Geo.start().catch(() => {});
  },

  /**
   * Sem servidor local configurado, os itens ficam só no navegador que os
   * cadastrou — este botão permite baixar (JSON/CSV) tudo que foi catalogado
   * nesta sessão (desde que o app foi aberto), como uma rede de segurança.
   */
  async _refreshSessionCount() {
    const inicio = sessionStorage.getItem('catalogo_sessao_inicio') || DB.nowISO();
    const itens = await DB.getItemsSince(inicio);
    const el = this._container?.querySelector('#cam-session-count');
    if (el) el.textContent = String(itens.length);
    return itens;
  },

  async _downloadSessionData() {
    const itens = await this._refreshSessionCount();
    if (itens.length === 0) { Utils.toast('Nenhum item catalogado nesta sessão ainda.', { type: 'warn' }); return; }

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet" style="text-align:center">
        <div class="handle"></div>
        <h3 style="margin-top:0">Baixar ${itens.length} item(ns) desta sessão</h3>
        <p style="font-size:12.5px; color:var(--text-dim)">
          ${(await AutoSave.isEnabled()) ? 'O salvamento automático no servidor já está ativo — isto é uma cópia extra, se quiser.' : 'Sem servidor local configurado ainda — baixar aqui garante que você não perde o que já catalogou.'}
        </p>
        <p style="font-size:11.5px; color:var(--text-dim)">
          <b>.TXT simples</b>: setor + data no topo, uma linha "patrimônio tipo" por item — pra conferência rápida.<br>
          <b>.CSV completo</b>: todas as colunas, abre em Excel/planilhas.<br>
          <b>.JSON</b>: formato completo com tudo (fotos, posição, etc.) — use este pra <i>unificar</i> depois com outros aparelhos.
        </p>
        <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap">
          <button class="btn secondary block" id="ds-txt" title="Baixar uma lista simples de texto: setor, data, e uma linha 'patrimônio tipo' por item">📄 Baixar .TXT simples</button>
          <button class="btn secondary block" id="ds-csv" title="Baixar os itens desta sessão em planilha CSV completa">⬇️ Baixar .CSV (Excel)</button>
          <button class="btn block" id="ds-json" title="Baixar os itens desta sessão em arquivo JSON completo (use para unificar com outros aparelhos depois)">⬇️ Baixar .JSON</button>
        </div>
        <button class="btn secondary block" id="ds-close" style="margin-top:8px" title="Fechar esta janela">Fechar</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#ds-close').onclick = () => modal.remove();

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    modal.querySelector('#ds-json').onclick = async () => {
      // ID sempre = hash do nome, calculado na hora (pedido do usuário,
      // 26/08/2026 — nunca mais um valor solto lido de 'conferenciaId', ver
      // DB.computeConferenciaId).
      const conferenciaNome = await DB.getSetting('conferenciaNome', '');
      Utils.downloadJSON({
        sessaoIniciadaEm: sessionStorage.getItem('catalogo_sessao_inicio'),
        conferenciaId: DB.computeConferenciaId(conferenciaNome),
        conferenciaNome,
        itens,
      }, `catalogacao-sessao-${stamp}.json`);
    };
    modal.querySelector('#ds-csv').onclick = () => {
      const csv = Utils.itemsToCSV(itens);
      Utils.downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `catalogacao-sessao-${stamp}.csv`);
    };
    modal.querySelector('#ds-txt').onclick = async () => {
      const { campos, organizarPorSetor } = await Utils.getTxtConfig();
      const txt = Utils.itemsToSimpleTxt(itens, { setor: this._sessionSetor, campos, organizarPorSetor });
      Utils.downloadBlob(new Blob([txt], { type: 'text/plain;charset=utf-8' }), `catalogacao-sessao-${stamp}.txt`);
    };
  },

  /** Pede o setor UMA VEZ (fica valendo para o resto da sessão de captura, até ser trocado). */
  _promptSessionSetor() {
    const atual = prompt('Setor/local para os itens desta sessão de captura (fica valendo até você trocar):', this._sessionSetor || '');
    if (atual === null) return;
    this._sessionSetor = atual.trim();
    sessionStorage.setItem('catalogo_setor_sessao', this._sessionSetor);
    const btn = this._container?.querySelector('#cam-setor');
    if (btn) {
      btn.textContent = this._sessionSetor ? '📍 ' + this._sessionSetor : '🏷️ Definir setor da sessão';
      btn.classList.toggle('active', !!this._sessionSetor);
    }
    if (this._sessionSetor) Utils.toast(`Setor da sessão: ${this._sessionSetor}`, { type: 'ok' });
  },

  unmount() {
    this._stopCamera();
    Geo.stop();
    this._container = null;
  },

  _facingMode: 'environment',
  _cameraError: null,

  async _startCamera() {
    this._cameraError = null;
    this._hideCameraErrorOverlay();
    // Confere ANTES de chamar getUserMedia — sem isto, quando o navegador
    // nem expõe "navigator.mediaDevices" (contexto inseguro, ver
    // Utils.cameraUnsupportedReason), a chamada abaixo lançava um erro cru
    // de JavaScript ("Cannot read properties of undefined (reading
    // 'getUserMedia')") sem nenhuma explicação do que fazer a respeito.
    const motivoIndisponivel = Utils.cameraUnsupportedReason();
    if (motivoIndisponivel) {
      console.warn('Câmera indisponível:', motivoIndisponivel);
      const e = { name: 'CameraIndisponivel', message: motivoIndisponivel };
      this._cameraError = e;
      Utils.toast('Câmera indisponível — veja os detalhes na tela.', { type: 'danger', duration: 6000 });
      this._showCameraErrorOverlay(e);
      return;
    }
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this._facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      this._video.srcObject = this._stream;
    } catch (e) {
      // Guarda o erro (em vez de só mostrar um toast que some) — sem isso, se
      // a permissão for negada, "Câmera ainda carregando…" ficava aparecendo
      // pra sempre em toda nova tentativa de captura, sem jeito de recuperar
      // sem recarregar a página inteira.
      console.warn('Erro ao acessar câmera:', e);
      this._cameraError = e;
      Utils.toast('Não foi possível acessar a câmera: ' + (e.message || e.name || e), { type: 'danger', duration: 5000 });
      this._showCameraErrorOverlay(e);
    }
  },

  /** Painel visível (não só um toast que some) com o motivo e um botão pra
   *  tentar de novo — importante principalmente quando a causa foi permissão
   *  negada: o usuário ajusta a permissão no navegador e toca em "tentar
   *  novamente" aqui mesmo, sem precisar recarregar a página. */
  _showCameraErrorOverlay(e) {
    const wrap = this._container?.querySelector('#cam-wrap');
    if (!wrap) return;
    this._hideCameraErrorOverlay();
    const negada = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
    const semCamera = e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError';
    const indisponivel = e?.name === 'CameraIndisponivel'; // ver Utils.cameraUnsupportedReason — contexto inseguro ou navegador sem suporte
    const el = document.createElement('div');
    el.id = 'cam-error-overlay';
    el.className = 'cam-error-overlay';
    el.innerHTML = `
      <div class="ic">🚫</div>
      <p>${indisponivel ? 'A câmera não está disponível neste endereço.' : negada ? 'O navegador não tem permissão para usar a câmera.' : semCamera ? 'Nenhuma câmera foi encontrada neste aparelho.' : 'Não foi possível acessar a câmera.'}</p>
      ${negada ? `<p class="d">Toque no ícone de câmera/cadeado na barra de endereço, permita o acesso à câmera para este site, e toque em "Tentar novamente" abaixo.</p>` : ''}
      ${indisponivel ? `<p class="d">${Utils.escapeHtml(e.message)}</p>` : `<p class="d" style="font-family:monospace">${Utils.escapeHtml(e?.message || e?.name || '')}</p>`}
      <button class="btn" id="cam-error-retry" title="Tentar acessar a câmera de novo, depois de ajustar a permissão/endereço">🔄 Tentar novamente</button>
      <button class="btn secondary" id="cam-error-manual" title="Cadastrar o item digitando tudo manualmente, sem usar a câmera">✏️ Cadastrar manualmente</button>
    `;
    wrap.appendChild(el);
    el.querySelector('#cam-error-retry').onclick = () => this._startCamera();
    el.querySelector('#cam-error-manual').onclick = () => App.openItemForm();
  },

  _hideCameraErrorOverlay() {
    this._container?.querySelector('#cam-error-overlay')?.remove();
  },

  _stopCamera() {
    if (this._stream) { this._stream.getTracks().forEach((t) => t.stop()); this._stream = null; }
  },

  async _switchCamera() {
    this._facingMode = this._facingMode === 'environment' ? 'user' : 'environment';
    this._stopCamera();
    await this._startCamera();
  },

  _toggleStickyTipo() {
    if (this._stickyTipo) {
      this._stickyTipo = null;
      sessionStorage.removeItem('catalogo_tipo_fixo');
      Utils.toast('Tipo fixado removido — a sugestão automática volta a decidir.');
      const btn = this._container.querySelector('#cam-flash');
      btn.textContent = '📌 Fixar tipo';
      btn.classList.remove('active');
    } else {
      const tipo = prompt('Fixar qual tipo para os próximos itens capturados (até você desativar)?', '');
      if (!tipo || !tipo.trim()) return;
      this._stickyTipo = tipo.trim();
      sessionStorage.setItem('catalogo_tipo_fixo', this._stickyTipo);
      const btn = this._container.querySelector('#cam-flash');
      btn.textContent = '📌 ' + this._stickyTipo;
      btn.classList.add('active');
      Utils.toast(`Tipo fixado: ${this._stickyTipo}`, { type: 'ok' });
    }
  },

  /** Resincroniza os textos/estado "fixado" (ícone + classe `active`, ver mount()) dos botões
   *  de tipo/setor da sessão com o que está em sessionStorage — chamado DE FORA (ver app.js
   *  openItemForm) sempre que "fixar tipo"/"setor da sessão" mudam por um caminho que não é os
   *  botões desta própria tela: o botão "✏️ Manual" (e "✏️ Cadastrar manualmente", no erro de
   *  câmera) agora abrem App.openItemForm em vez do formulário próprio desta tela (pedido do
   *  usuário: deve ser exatamente a mesma janela de Tabela/Cartões "+ Novo"), e aquele
   *  formulário genérico escreve nas MESMAS chaves de sessionStorage — sem isto, os botões do
   *  topo da câmera ficariam com o texto/ícone desatualizados até a tela ser remontada.
   *  `window.CaptureView?.syncButtons?.()` (call site em app.js) já é seguro chamar mesmo com
   *  esta tela não montada — `this._container` null faz isto virar um no-op silencioso. */
  syncButtons() {
    if (!this._container) return;
    this._stickyTipo = sessionStorage.getItem('catalogo_tipo_fixo') || null;
    this._sessionSetor = sessionStorage.getItem('catalogo_setor_sessao') || '';
    const flashBtn = this._container.querySelector('#cam-flash');
    if (flashBtn) {
      flashBtn.textContent = this._stickyTipo ? '📌 ' + this._stickyTipo : '📌 Fixar tipo';
      flashBtn.classList.toggle('active', !!this._stickyTipo);
    }
    const setorBtn = this._container.querySelector('#cam-setor');
    if (setorBtn) {
      setorBtn.textContent = this._sessionSetor ? '📍 ' + this._sessionSetor : '🏷️ Definir setor da sessão';
      setorBtn.classList.toggle('active', !!this._sessionSetor);
    }
  },

  _capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  _grabFrame() {
    const v = this._video;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas;
  },

  async _captureAndProcess() {
    if (!this._video.videoWidth) {
      // Sem isso, uma câmera que falhou (ex: permissão negada) deixava esta
      // mensagem de "carregando" aparecendo pra sempre em toda nova tentativa.
      // Agora, se já sabemos que deu erro antes, tocar em "Capturar foto" de
      // novo já TENTA A CÂMERA DE NOVO na hora — se a permissão não tiver
      // sido bloqueada de forma permanente pelo navegador (ex: o usuário só
      // fechou o aviso sem escolher, ou já mudou a permissão nas configurações
      // do site), isso já faz a opção de "permitir câmera" do navegador
      // aparecer de novo sozinha, sem precisar de nenhum passo extra.
      if (this._cameraError) {
        await this._startCamera();
        if (this._cameraError) return; // ainda sem câmera — _startCamera() já reexibe o aviso/permissão
        Utils.toast('Câmera reativada — toque em "Capturar foto" mais uma vez.', { type: 'ok' });
        return;
      }
      Utils.toast('Câmera ainda carregando…', { type: 'warn' });
      return;
    }

    const frame = this._grabFrame();

    // Código de barras: recurso separado (ver js/barcode.js) e mantido — se a
    // etiqueta tiver um, o número do patrimônio já vem sugerido CASO esta
    // foto vire um patrimônio (ver _openPhotoLinkModal abaixo, opção
    // "🏷️ Este é um patrimônio" → App.openItemForm({ prefillPatrimonio })).
    let barcodeInfo = null;
    if (Barcode.isAvailable()) {
      try { barcodeInfo = await Barcode.decode(frame); } catch (e) { barcodeInfo = null; }
    }
    const patrimonioSugerido = barcodeInfo?.code
      ? (barcodeInfo.code.toUpperCase().replace(/[^A-Z0-9\-./]/g, '') || '')
      : '';

    // Mesma qualidade/compressão já usada pelas fotos do ambiente (ver
    // ambientephotos.js _addPhotoFromFile) — esta foto passa a viver como
    // uma mapPhoto de verdade (grade "Foto", pino no mapa, visualizador de
    // sempre), não só um campo dentro de um item.
    const dataUrl = await Utils.resizeImage(frame, 2400, 0.85);
    const thumbDataUrl = await Utils.resizeImage(frame, 220, 0.75);

    await this._afterPhotoCaptured({ dataUrl, thumbDataUrl, patrimonioSugerido });
  },

  /**
   * Salva a foto recém-tirada como uma mapPhoto (ver js/db.js
   * addAmbientePhoto) e, imediatamente depois, abre o modal de vínculo
   * (pedido do usuário: "Ao tirar uma nova foto, deve-se abrir uma janela
   * para vinculação da foto com alguma coisa") — ver _openPhotoLinkModal.
   * Depois desta rodada, tirar uma foto aqui NÃO cria mais um item
   * automaticamente: o item só nasce se a própria pessoa escolher "🏷️ Este
   * é um patrimônio" no modal (o botão "✏️ Manual", sem foto nenhuma,
   * abre App.openItemForm() direto, sem passar por nada disto).
   */
  async _afterPhotoCaptured({ dataUrl, thumbDataUrl, patrimonioSugerido }) {
    const map = await DB.getOrCreateSingleMap();
    let photo;
    try {
      photo = await DB.addAmbientePhoto({ ambienteId: map.id, dataUrl, thumbDataUrl, nome: '', setor: this._sessionSetor || sessionStorage.getItem('catalogo_setor_sessao') || '' });
    } catch (err) {
      console.error('Falha ao salvar a foto:', err);
      Utils.toast('Não foi possível salvar a foto: ' + (err?.message || err), { type: 'danger', duration: 5000 });
      EventLog.log(`Falha ao salvar foto (tela Fotos): ${err?.message || err}`, { tipo: 'erro' });
      return;
    }
    this._openPhotoLinkModal(photo, { patrimonioSugerido });
  },

  /**
   * Modal com as 3 escolhas pedidas pelo usuário pra uma foto recém-tirada:
   *  1. "📍 Vincular a um lugar no mapa" — modo de escolher a posição na
   *     Planta baixa (ver MapView.enterPhotoPlacementMode).
   *  2. "🏷️ Este é um patrimônio" — abre o MESMO formulário de cadastro de
   *     patrimônio usado em qualquer outro lugar do app (App.openItemForm),
   *     já com esta foto pré-anexada (item.fotoAnexadaId — ver js/db.js).
   *  3. "Deixar sem vínculo por enquanto" — posiciona a foto sozinha, na
   *     periferia de tudo que já existe no mapa (Mapping.findPeripheralSlot),
   *     marcando `mapaAuto: true` — ela ainda aparece como pino (fácil de
   *     achar) mas continua contando como "sem lugar" pra 📦 Caixa.
   * Fechar de QUALQUER outra forma (✕ nesta função nem existe — toque fora
   * do modal) equivale à opção 3 (pedido do usuário: "Se não for definido,
   * então vai para aquele lugar... a caixa de coisas não categorizadas" —
   * mas a foto AINDA ganha uma posição no mapa, só que automática).
   */
  _openPhotoLinkModal(photo, { patrimonioSugerido = '' } = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet" style="text-align:center">
        <div class="handle"></div>
        <h3 style="margin-top:0">Nova foto — vincular a algo?</h3>
        <img src="${photo.thumbDataUrl || photo.dataUrl}" alt="" style="width:120px; height:120px; object-fit:cover; border-radius:12px; margin:0 auto 10px; display:block">
        <div style="display:flex; flex-direction:column; gap:8px">
          <button type="button" class="btn block" id="pl-mapa" title="Escolher, na planta baixa 2D, onde esta foto fica">📍 Vincular a um lugar no mapa</button>
          <button type="button" class="btn secondary block" id="pl-patr" title="Cadastrar um patrimônio novo com esta foto anexada">🏷️ Este é um patrimônio</button>
          <button type="button" class="btn secondary block" id="pl-skip" title="Guardar a foto na 📦 Caixa por enquanto — dá pra vincular depois">Deixar sem vínculo por enquanto</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // `decidido` evita disparar o "deixar sem vínculo" (fallback do toque
    // fora do modal) DEPOIS que uma das 3 opções já tiver sido escolhida —
    // sem isto, remover o modal (feito por toda opção) também dispararia o
    // listener de "mousedown fora" se o clique de alguma forma alcançasse o
    // backdrop antes de o elemento sumir do DOM.
    let decidido = false;
    const skip = () => { if (decidido) return; decidido = true; this._autoPlacePhoto(photo.id); };

    modal.addEventListener('mousedown', (e) => { if (e.target === modal) { modal.remove(); skip(); } });

    modal.querySelector('#pl-mapa').onclick = async () => {
      decidido = true;
      modal.remove();
      await App.navigate('mapa');
      await MapView.enterPhotoPlacementMode(photo.id, {
        // "Cancelar" na faixa do mapa cai no MESMO resultado de "deixar sem
        // vínculo" (pedido explícito da spec) — a foto precisa de ALGUMA
        // posição de qualquer forma.
        onCancel: (photoId) => this._autoPlacePhoto(photoId),
      });
    };

    modal.querySelector('#pl-patr').onclick = async () => {
      decidido = true;
      modal.remove();
      // NOVO (03/09/2026), pedido verbatim: "Deve haver uma separação entre
      // as fotos dos ambientes e as fotos que objetivam que apareça só o
      // número de patrimônio." — esta foto vira o anexo do item
      // (item.fotoAnexadaId), então marca `tipo: 'patrimonio'` (ver
      // js/db.js addAmbientePhoto/getPhotosByAmbiente) pra ela parar de
      // aparecer na grade/orbs de 'Mapa'->'Foto' e em 📦 Caixa — ela nunca
      // teve posição no mapa (mapaX/mapaY) mesmo, mas sem esta marcação
      // ainda contava como "foto de ambiente sem lugar" indevidamente.
      photo = await DB.saveAmbientePhoto({ ...photo, tipo: 'patrimonio' });
      App.openItemForm(null, {
        fotoAnexadaId: photo.id,
        prefillPatrimonio: patrimonioSugerido,
        onSaved: async () => { await App.navigate('tabela'); },
      });
    };

    modal.querySelector('#pl-skip').onclick = () => {
      modal.remove();
      skip();
    };
  },

  /**
   * Posiciona `photoId` automaticamente na periferia de tudo que já existe
   * no mapa (ver Mapping.findPeripheralSlot) e marca `mapaAuto: true` —
   * usado tanto pela opção 3 do modal acima quanto por um "Cancelar" no
   * meio da opção 1 (mesmo resultado nos dois casos, pedido da spec). O
   * `index` passado pra findPeripheralSlot é a contagem de fotos JÁ
   * auto-posicionadas antes desta — cada nova foto sem vínculo cai um
   * pouco mais adiante na mesma fileira, em vez de empilhar exatamente em
   * cima da anterior.
   */
  async _autoPlacePhoto(photoId) {
    try {
      const map = await DB.getOrCreateSingleMap();
      const photo = await DB.getAmbientePhoto(photoId);
      if (!photo) return;
      const todasFotos = await DB.getAllAmbientePhotos();
      const index = todasFotos.filter((f) => f.id !== photoId && f.mapaAuto === true).length;
      const slot = Mapping.findPeripheralSlot(map, index);
      await DB.saveAmbientePhoto({ ...photo, mapaX: slot.x, mapaY: slot.y, mapaPiso: slot.piso || 0, mapaAuto: true });
      await MapView._refreshMapaIfShowing?.();
      Utils.toast('Foto guardada na 📦 Caixa — dá para vincular a um lugar depois.', { type: 'ok' });
    } catch (err) {
      console.error('Falha ao posicionar foto automaticamente:', err);
      Utils.toast('Não foi possível guardar a posição da foto: ' + (err?.message || err), { type: 'danger', duration: 5000 });
    }
  },

  /** Atualiza o contador da sessão e, sem servidor configurado, lembra periodicamente de baixar um backup. */
  async _afterItemSaved() {
    const itens = await this._refreshSessionCount();
    const ativo = await AutoSave.isEnabled();
    if (!ativo && itens.length > 0 && itens.length % 5 === 0) {
      Utils.toast(`${itens.length} itens catalogados nesta sessão, sem servidor configurado — toque em "⬇️ Sessão" para baixar um backup.`, { type: 'warn', duration: 5000 });
    }
  },
};

window.CaptureView = CaptureView;
