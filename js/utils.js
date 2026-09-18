/**
 * utils.js — funções utilitárias compartilhadas.
 */

const Utils = {
  // Pedido do usuário (28/08/2026): "deve aparecer a versão do app e data
  // da última atualização acima dos botões do topo" (Configurações do app —
  // ver settings.js). O app não tem um pipeline de build que carimbe
  // versão/data sozinho (é HTML/CSS/JS puro, sem empacotador — ver
  // cabeçalho de sw.js) — então este par é mantido NA MÃO, junto com
  // `CACHE_VERSION` em sw.js (mesmo número — "v292" aqui é "catalogo-v292"
  // lá): sempre que `CACHE_VERSION` for incrementado numa rodada, atualizar
  // os dois valores abaixo junto, no mesmo commit/rodada.
  APP_VERSION: 'v311',
  APP_LAST_UPDATE: '30/08/2026',

  formatDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch (e) { return iso; }
  },

  formatRelative(iso) {
    if (!iso) return '—';
    const diffMs = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diffMs / 1000);
    if (s < 60) return 'agora há pouco';
    const m = Math.floor(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `há ${d} d`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `há ${mo} mês(es)`;
    return `há ${Math.floor(mo / 12)} ano(s)`;
  },

  /** Igual a formatRelative, mas por extenso e com "ontem" — usado em textos
   *  pequenos ao lado de sugestões (ex.: lista de itens ao marcar um orb),
   *  onde "3 h"/"3 d" abreviado fica confuso perto de outro texto curto. */
  formatRelativeSuggestion(iso) {
    if (!iso) return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diffMs)) return '';
    const s = Math.floor(diffMs / 1000);
    if (s < 60) return 'agora há pouco';
    const m = Math.floor(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h} hora${h === 1 ? '' : 's'}`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'ontem';
    if (d < 7) return `há ${d} dias`;
    if (d < 30) {
      const sem = Math.floor(d / 7);
      return `há ${sem} semana${sem === 1 ? '' : 's'}`;
    }
    const mo = Math.floor(d / 30);
    if (mo < 12) return `há ${mo} mês${mo === 1 ? '' : 'es'}`;
    const an = Math.floor(mo / 12);
    return `há ${an} ano${an === 1 ? '' : 's'}`;
  },

  /**
   * Explica por que a câmera (getUserMedia) pode não estar disponível —
   * devolve null se estiver disponível aqui. O motivo mais comum, quando o
   * app é acessado por um servidor local no próprio celular (ex: SHTTPS,
   * "Localhost Lite" e afins), é o endereço usado: o navegador só libera a
   * câmera em "contextos seguros" — https://, OU http://localhost, OU
   * http://127.0.0.1 (esses dois contam como seguros mesmo sem https, mas
   * SÓ esses dois — um endereço de rede local tipo http://192.168.x.x:porta
   * NÃO conta, mesmo estando na mesma rede Wi-Fi/no mesmo aparelho). Isso é
   * uma regra do próprio navegador (spec de "Secure Contexts"), não algo
   * que este app controla.
   */
  cameraUnsupportedReason() {
    if (navigator.mediaDevices?.getUserMedia) return null;
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
      return `A câmera só é liberada pelo navegador em conexões seguras: https://, ou http://localhost / http://127.0.0.1 (contam como seguros mesmo sem https — mas SÓ esses dois). O endereço atual (${location.origin || location.href}) não se encaixa nisso. Se você está acessando por um endereço de rede (ex: http://192.168.x.x:porta), troque para http://127.0.0.1:porta ou http://localhost:porta no mesmo servidor local — geralmente resolve. Abrir o arquivo direto (file://) ou publicar o app com https também funciona.`;
    }
    return 'Este navegador não oferece suporte a acesso à câmera (a API getUserMedia não está disponível aqui).';
  },

  debounce(fn, wait = 250) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  },

  throttle(fn, wait = 100) {
    let last = 0;
    let timer = null;
    return (...args) => {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        last = now;
        fn(...args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => { last = Date.now(); fn(...args); }, remaining);
      }
    };
  },

  // [15/09/2026 UTC] NOVO -- pedido verbatim: "A troca dos botões no
  // rodapé deve ser animada, o botão que está vai sumindo em direção ao
  // seu próprio centro e o outro aparece vindo do centro até aparecer
  // completamente." Usado quando o "Modo de operação" (Conferência de
  // patrimônios/Mapeamento de ambientes, ver classicmode.js) muda com o
  // rodapé JÁ visível na tela (troca de mapa em tempo real) — a versão do
  // botão antigo encolhe/some pro próprio centro (`.footernav-btn-swap-out`,
  // ver css/style.css), e SÓ DEPOIS (`animationend`, nunca simultâneo — o
  // pedido descreve uma sequência, não os dois botões brigando pelo mesmo
  // espaço ao mesmo tempo) o botão novo nasce do centro crescendo até o
  // tamanho normal (`.footernav-btn-swap-in`). Compartilhada entre
  // js/classicmode.js (`<nav class="bottomnav">` do modo Clássico) e
  // js/bsplayout.js (painel 'Botões' do Workspace) — os 2 lugares onde o
  // rodapé de botões é desenhado (ver RODADA 56, progresso-sessao.md).
  // `oldBtn` pode ser `null` (1ª montagem, nada a animar) — nesse caso só
  // cria e devolve o botão novo direto, sem classe/animação nenhuma.
  animateFooterButtonSwap(oldBtn, buildNewBtnFn) {
    if (!oldBtn || !oldBtn.parentElement) return buildNewBtnFn();
    const parent = oldBtn.parentElement;
    const nextSibling = oldBtn.nextSibling;
    let done = false;
    const finish = () => {
      if (done) return; // 'animationend' pode disparar mais de uma vez (várias propriedades animadas) — só a 1ª conta
      done = true;
      const novo = buildNewBtnFn();
      novo.classList.add('footernav-btn-swap-in');
      if (nextSibling && nextSibling.parentElement === parent) parent.insertBefore(novo, nextSibling);
      else parent.appendChild(novo);
      oldBtn.remove();
      novo.addEventListener('animationend', () => novo.classList.remove('footernav-btn-swap-in'), { once: true });
    };
    oldBtn.classList.add('footernav-btn-swap-out');
    oldBtn.addEventListener('animationend', finish, { once: true });
    // Rede de segurança: se por algum motivo a animação não disparar (ex.:
    // `prefers-reduced-motion`/navegador sem suporte), garante a troca
    // mesmo assim depois de um tempo — nunca deixa o botão antigo "preso".
    setTimeout(finish, 400);
    return null; // o botão novo só existe depois do fim da animação (assíncrono) — chamador não precisa da referência aqui
  },

  escapeHtml(str) {
    return (str ?? '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /** Hash determinístico e SÍNCRONO de uma string — NÃO criptográfico (não
   *  precisa ser: só serve pra identificar/agrupar, nunca pra segurança).
   *  Usado como ID da conferência de patrimônio, derivado do nome dela
   *  (pedido do usuário, 26/08/2026: "O ID da conferência deve ser um hash
   *  do nome" — ver DB.computeConferenciaId/settings.js). A mesma string, em
   *  QUALQUER aparelho/navegador, sempre produz o MESMO resultado — é
   *  justamente o que se precisa aqui: duas pessoas digitando o mesmo nome
   *  de conferência em aparelhos diferentes já caem no mesmo ID, sem
   *  precisar copiar/sincronizar nada à parte.
   *  Não usa `crypto.subtle` (Web Crypto, que daria SHA-256 de verdade) de
   *  propósito: essa API só fica disponível em "contexto seguro", e
   *  file:// nem sempre conta como tal dependendo do navegador (mesma
   *  limitação já vista aqui com Service Worker — ver sw.js) — isto é só
   *  matemática pura (inteiros de 32 bits, sem I/O nem promises), funciona
   *  em qualquer lugar. Algoritmo "cyrb53" (domínio público, autor: bryc —
   *  boa distribuição pra strings curtas como um nome de conferência).
   *  Devolve sempre uma string hexadecimal de 14 caracteres. */
  hashString(str, seed = 0) {
    str = (str ?? '').toString();
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const num = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return num.toString(16).padStart(14, '0');
  },

  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },

  lerp(a, b, t) { return a + (b - a) * t; },

  easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },

  /** Redimensiona uma imagem (dataURL ou Blob) mantendo proporção, retorna dataURL JPEG. */
  async resizeImage(source, maxSize = 512, quality = 0.82) {
    const bitmap = await this.loadBitmap(source);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  },

  /** Recorta uma região (bbox — em pixels da própria imagem, formato do
   *  Tesseract: {x0,y0,x1,y1}) de um canvas/imagem, com uma margem ao redor,
   *  devolvendo um dataURL JPEG pequeno. Usado para guardar, junto de um
   *  item, só o pedacinho da foto onde o número de patrimônio foi lido. */
  cropRegion(source, bbox, paddingPx = 16) {
    if (!source || !bbox) return null;
    const sw = source.width || source.videoWidth, sh = source.height || source.videoHeight;
    if (!sw || !sh) return null;
    const x0 = Math.max(0, Math.floor(bbox.x0 - paddingPx));
    const y0 = Math.max(0, Math.floor(bbox.y0 - paddingPx));
    const x1 = Math.min(sw, Math.ceil(bbox.x1 + paddingPx));
    const y1 = Math.min(sh, Math.ceil(bbox.y1 + paddingPx));
    const w = x1 - x0, h = y1 - y0;
    if (w <= 4 || h <= 4) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(source, x0, y0, w, h, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.87);
  },

  async loadBitmap(source) {
    if (source instanceof HTMLCanvasElement || source instanceof HTMLVideoElement || source instanceof ImageBitmap) return source;
    if (source instanceof Blob) return createImageBitmap(source);
    // dataURL ou URL
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = source;
    });
  },

  toast(msg, { duration = 2600, type = 'info' } = {}) {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      document.body.appendChild(host);
    }
    // Deduplicação de toasts "exatamente iguais" (mesmo texto): em vez de
    // empilhar um elemento novo por clique/chamada repetida, reaproveita o
    // toast ainda visível com o mesmo texto e mostra um sufixo " x2", " x3",
    // etc, resetando o timeout de sumiço a cada repetição. Mensagens com
    // texto diferente continuam totalmente independentes entre si.
    if (!this._toastRegistry) this._toastRegistry = new Map();
    const registry = this._toastRegistry;
    const anterior = registry.get(msg);
    if (anterior && anterior.el.isConnected) {
      anterior.count += 1;
      anterior.el.textContent = `${msg} x${anterior.count}`;
      clearTimeout(anterior.hideTimer);
      clearTimeout(anterior.removeTimer);
      anterior.hideTimer = setTimeout(() => {
        anterior.el.classList.remove('toast--show');
        anterior.removeTimer = setTimeout(() => {
          anterior.el.remove();
          if (registry.get(msg) === anterior) registry.delete(msg);
        }, 300);
      }, duration);
      return;
    }
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--show'));
    const entry = { el, count: 1, hideTimer: null, removeTimer: null };
    registry.set(msg, entry);
    entry.hideTimer = setTimeout(() => {
      el.classList.remove('toast--show');
      entry.removeTimer = setTimeout(() => {
        el.remove();
        if (registry.get(msg) === entry) registry.delete(msg);
      }, 300);
    }, duration);
  },

  downloadJSON(obj, filename, opts) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    this.downloadBlob(blob, filename, opts);
  },

  downloadText(text, filename, mimeType = 'text/plain', opts) {
    const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
    this.downloadBlob(blob, filename, opts);
  },

  /** Gera um CSV "completo" (separador ";", amigável para Excel em pt-BR e
   *  outros programas de planilha) a partir de itens — todas as colunas. */
  itemsToCSV(items) {
    // Pedido do usuário (27/08/2026): "Inserido em" (criadoEm) removido —
    // "Criado originalmente em" (criadoOriginalmenteEm) já cumpre esse papel.
    const cols = ['patrimonio', 'descricao', 'tipo', 'setor', 'geoLat', 'geoLng', 'origemSessaoLabel', 'origemDispositivoInfo', 'origemDispositivoFingerprint', 'capturaIpPublico', 'criadoOriginalmenteEm', 'modificadoEm', 'ultimaConsultaEm'];
    const headers = ['Patrimônio', 'Descrição', 'Tipo', 'Setor', 'Latitude', 'Longitude', 'Cadastrado por', 'Aparelho', 'Impressão digital do aparelho', 'IP público (rede)', 'Criado originalmente em', 'Modificado em', 'Última consulta'];
    const escapeCsv = (v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`;
    const lines = [headers.map(escapeCsv).join(';')];
    items.forEach((it) => {
      lines.push(cols.map((c) => escapeCsv(c.endsWith('Em') && it[c] ? Utils.formatDateTime(it[c]) : it[c])).join(';'));
    });
    return '﻿' + lines.join('\r\n'); // BOM para acentuação abrir certo no Excel
  },

  /**
   * Gera um arquivo .txt "simples": cabeçalho com o setor e a data/hora, e uma
   * linha por item no formato "[patrimônio] [tipo]" — pensado para conferência
   * rápida impressa/lida, sem precisar abrir planilha nenhuma.
   */
  /** Rótulos amigáveis de cada parte de informação que pode entrar numa linha do .txt simples. */
  TXT_CAMPO_LABELS: {
    patrimonio: 'Número de patrimônio',
    descricao: 'Descrição',
    tipo: 'Tipo',
    setor: 'Setor / local',
  },

  /** Configuração padrão: só "número de patrimônio" e "tipo" vêm marcados, nesta ordem
   *  (igual ao formato usado antes desta opção existir). */
  defaultTxtCampos() {
    return [
      { key: 'patrimonio', ativo: true },
      { key: 'tipo', ativo: true },
      { key: 'descricao', ativo: false },
      { key: 'setor', ativo: false },
    ];
  },

  /** Lê a configuração salva (campos ativos/ordem + "organizar por setor") das
   *  Configurações, com reparo automático caso falte algum campo (ex.: versão
   *  nova do app adicionou um campo que essa instalação salva ainda não tem). */
  async getTxtConfig() {
    const defaults = this.defaultTxtCampos();
    let campos = defaults;
    try {
      const salvo = await window.DB?.getSetting?.('txtCampos', null);
      if (Array.isArray(salvo) && salvo.length) campos = salvo.map((c) => ({ key: c.key, ativo: !!c.ativo }));
    } catch (e) { /* usa o padrão */ }
    const chaves = new Set(campos.map((c) => c.key));
    defaults.forEach((d) => { if (!chaves.has(d.key)) campos.push({ key: d.key, ativo: false }); });

    let organizarPorSetor = false;
    try { organizarPorSetor = !!(await window.DB?.getSetting?.('txtOrganizarPorSetor', false)); } catch (e) { /* padrão: false */ }

    return { campos, organizarPorSetor };
  },

  /** Salva a configuração (chamado pela tela "Ver lista"). */
  async setTxtConfig({ campos, organizarPorSetor } = {}) {
    if (campos) { try { await window.DB?.setSetting?.('txtCampos', campos); } catch (e) { /* ignora */ } }
    if (typeof organizarPorSetor === 'boolean') { try { await window.DB?.setSetting?.('txtOrganizarPorSetor', organizarPorSetor); } catch (e) { /* ignora */ } }
  },

  /**
   * Monta o .txt simples. `campos` é uma lista ordenada de {key, ativo} — só as
   * ativas entram na linha, na ordem em que aparecem na lista. `organizarPorSetor`
   * agrupa e ordena os itens por setor/local antes de montar as linhas (em vez
   * da ordem em que foram cadastrados).
   */
  itemsToSimpleTxt(items, { setor = '', geradoEm = null, campos = null, organizarPorSetor = false } = {}) {
    const camposAtivos = (campos && campos.length ? campos : this.defaultTxtCampos()).filter((c) => c.ativo);
    const valorCampo = (it, key) => {
      if (key === 'patrimonio') return (it.patrimonio || '(sem número)').toString();
      if (key === 'descricao') return (it.descricao || '').toString();
      if (key === 'tipo') return (it.tipo || '').toString();
      if (key === 'setor') return (it.setor || '').toString();
      return '';
    };
    const linhaDoItem = (it) => {
      const partes = camposAtivos.map((c) => valorCampo(it, c.key)).filter((v) => v !== '');
      return partes.length ? partes.join(' ') : (it.patrimonio || '(sem informação)').toString();
    };

    const linhas = [];
    linhas.push(`Setor: ${setor || '(vários / não informado)'}`);
    linhas.push(`Data: ${Utils.formatDateTime(geradoEm || new Date().toISOString())}`);
    linhas.push(`Total de itens: ${items.length}`);
    linhas.push('');

    if (organizarPorSetor) {
      const grupos = new Map();
      items.forEach((it) => {
        const chave = (it.setor || '').toString().trim() || '(sem setor / local)';
        if (!grupos.has(chave)) grupos.set(chave, []);
        grupos.get(chave).push(it);
      });
      const chaves = Array.from(grupos.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
      chaves.forEach((chave, i) => {
        if (i > 0) linhas.push('');
        linhas.push(`--- ${chave} ---`);
        grupos.get(chave).forEach((it) => linhas.push(linhaDoItem(it)));
      });
    } else {
      items.forEach((it) => linhas.push(linhaDoItem(it)));
    }

    return linhas.join('\r\n');
  },

  /**
   * @param {object} opts.notify - false pra não avisar (default: avisa com o
   *   nome do arquivo). Por segurança do navegador, o site NUNCA sabe o
   *   caminho completo de onde o arquivo foi salvo (só o próprio navegador/
   *   sistema decide, normalmente a pasta "Downloads") — por isso o aviso
   *   mostra o nome do arquivo e onde normalmente cai, não um caminho exato.
   */
  downloadBlob(blob, filename, { notify = true } = {}) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (notify) {
      this.toast(`Salvo como "${filename}" (pasta de Downloads do navegador/aparelho)`, { type: 'ok', duration: 5000 });
    }
  },

  uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  },

  /**
   * Modal genérico com 2-3 botões de escolha (ex: "Substituir" / "Manter
   * ambos" / "Cancelar") — devolve o "value" do botão escolhido, ou null se
   * fechado sem escolher (toque fora do modal).
   * @param {{title:string, message?:string, choices:Array<{label:string, value:string, secondary?:boolean, danger?:boolean, title?:string}>}} opts
   * @returns {Promise<string|null>}
   */
  /** `checkbox` é opcional: { label, defaultChecked }. Quando presente, o
   *  modal ganha uma caixa de marcação acima dos botões e a Promise resolve
   *  com { value, checked } em vez de só `value` (usado, por exemplo, para
   *  um "aplicar esta escolha a todos" na importação de backup). Sem
   *  `checkbox`, o comportamento é o de sempre: resolve só com `value`. */
  showChoiceModal({ title, message, choices, checkbox }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-sheet" style="text-align:center">
          <div class="handle"></div>
          <h3 style="margin-top:0">${this.escapeHtml(title)}</h3>
          ${message ? `<p style="font-size:13px; color:var(--text-dim); white-space:pre-wrap">${this.escapeHtml(message)}</p>` : ''}
          ${checkbox ? `<label style="display:flex; align-items:center; gap:8px; justify-content:center; margin-top:10px; font-size:12.5px; color:var(--text-dim); cursor:pointer">
            <input type="checkbox" id="choice-modal-chk" ${checkbox.defaultChecked !== false ? 'checked' : ''}>
            <span>${this.escapeHtml(checkbox.label)}</span>
          </label>` : ''}
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px" id="choice-modal-actions"></div>
        </div>`;
      document.body.appendChild(modal);
      let resolved = false;
      const chkEl = checkbox ? modal.querySelector('#choice-modal-chk') : null;
      const finish = (value) => {
        if (resolved) return;
        resolved = true;
        modal.remove();
        resolve(checkbox ? { value, checked: chkEl ? chkEl.checked : false } : value);
      };
      const actions = modal.querySelector('#choice-modal-actions');
      choices.forEach((c) => {
        const btn = document.createElement('button');
        btn.className = `btn ${c.secondary ? 'secondary' : ''} ${c.danger ? 'danger' : ''} block`.replace(/\s+/g, ' ').trim();
        btn.textContent = c.label;
        if (c.title) btn.title = c.title;
        btn.onclick = () => finish(c.value);
        actions.appendChild(btn);
      });
      // checkbox.autoSubmitOnUncheck: fecha o modal IMEDIATAMENTE ao desmarcar
      // a caixa, sem esperar um clique num dos botões de escolha — usado
      // quando desmarcar já significa "não existe mais uma única regra pra
      // todos, vou decidir um por um" (ver settings.js, importação de
      // backup): esperar um clique extra num botão de cima, cujo valor nem
      // é usado na revisão item a item, era um passo redundante.
      if (checkbox?.autoSubmitOnUncheck && chkEl) {
        chkEl.addEventListener('change', () => { if (!chkEl.checked) finish(choices[0]?.value ?? null); });
      }
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) finish(null); });
    });
  },

  /** Modal que mostra N candidatos (versões diferentes de um mesmo mapa,
   *  vindas de fontes diferentes — import de backup local-vs-backup, ou
   *  "Unificar fontes diferentes" fonte-vs-fonte) e deixa escolher qual
   *  vira a BASE de uma mesclagem — pedido do usuário (28/08/2026):
   *  "Deve ser possível decidir qual mapa vai ficar. Para cada mapa, no
   *  momento da escolha, deve aparecer a quantidade... de itens/objetos/
   *  coisas que tem nele." Cada candidato mostra 3 contadores (itens/
   *  fotos/objetos da planta) como badges. Devolve o ÍNDICE do candidato
   *  escolhido (índice em `candidates`), ou `null` se fechado sem escolher.
   *  candidates: [{ label:string, sub?:string, counts:{itens,fotos,objetos} }]
   */
  showMapMergeChoiceModal({ title, message, candidates }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-sheet" style="text-align:left">
          <div class="handle"></div>
          <h3 style="margin-top:0; text-align:center">${this.escapeHtml(title)}</h3>
          ${message ? `<p style="font-size:13px; color:var(--text-dim); white-space:pre-wrap; text-align:center">${this.escapeHtml(message)}</p>` : ''}
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px" id="mapmerge-actions"></div>
        </div>`;
      document.body.appendChild(modal);
      const actions = modal.querySelector('#mapmerge-actions');
      candidates.forEach((c, idx) => {
        const btn = document.createElement('button');
        btn.className = 'btn secondary block';
        btn.style.textAlign = 'left';
        btn.style.height = 'auto';
        btn.style.padding = '10px 14px';
        btn.innerHTML = `
          <div style="font-weight:700">${this.escapeHtml(c.label)}</div>
          ${c.sub ? `<div style="font-size:11px; color:var(--text-dim); margin-top:2px">${this.escapeHtml(c.sub)}</div>` : ''}
          <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap">
            <span class="badge">🏷️ ${c.counts.itens} item(ns)</span>
            <span class="badge">📷 ${c.counts.fotos} foto(s)</span>
            <span class="badge">🧱 ${c.counts.objetos} objeto(s) na planta</span>
          </div>`;
        btn.onclick = () => { modal.remove(); resolve(idx); };
        actions.appendChild(btn);
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn secondary block';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.onclick = () => { modal.remove(); resolve(null); };
      actions.appendChild(cancelBtn);
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) { modal.remove(); resolve(null); } });
    });
  },

  /** Modal ÚNICO que lista TODOS os mapas com conflito de uma vez, cada um
   *  com dois "cartões" clicáveis (local/novo, com os mesmos 3 contadores de
   *  `showMapMergeChoiceModal`) pra escolher a versão vencedora — pedido do
   *  usuário (28/08/2026): "No importar, se há várias coisas para decidir,
   *  deve aparecer em uma única janela. Não ficar aparecendo uma janela por
   *  decisão a se tomar (como é atualmente)." Substitui abrir um modal POR
   *  mapa (era o que `Utils.importMapsWithConflictUI` fazia antes, um
   *  `showMapMergeChoiceModal` por vez dentro do loop de `DB.importMaps`).
   *  Já vem com uma escolha PADRÃO marcada em cada linha (o lado com mais
   *  itens+fotos+objetos ao todo) — o usuário só precisa clicar nas linhas
   *  que quiser mudar, e confirmar uma vez só no fim.
   *  conflicts: [{ mapId, nome, local:{itens,fotos,objetos}, novo:{itens,fotos,objetos} }]
   *  Devolve um Map(mapId -> 'manter'|'substituir'), ou `null` se cancelado. */
  showMapMergeBatchModal({ title, message, conflicts }) {
    return new Promise((resolve) => {
      const escolhas = new Map(conflicts.map((c) => {
        const totalLocal = c.local.itens + c.local.fotos + c.local.objetos;
        const totalNovo = c.novo.itens + c.novo.fotos + c.novo.objetos;
        return [c.mapId, totalNovo > totalLocal ? 'substituir' : 'manter'];
      }));
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      const linhaHtml = (c) => `
        <div class="uf-mapmerge-row" data-map-id="${this.escapeHtml(c.mapId)}" style="border:1px solid var(--border); border-radius:10px; padding:8px 10px; margin-bottom:8px">
          <div style="font-weight:700; margin-bottom:6px">🗺️ ${this.escapeHtml(c.nome)}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <button type="button" class="btn secondary sm uf-mapmerge-opt" data-map-id="${this.escapeHtml(c.mapId)}" data-value="manter" style="flex:1; min-width:150px; text-align:left; height:auto; padding:8px 10px">
              <div style="font-weight:700">📱 Já existe neste aparelho</div>
              <div style="display:flex; gap:6px; margin-top:4px; flex-wrap:wrap">
                <span class="badge">🏷️ ${c.local.itens}</span><span class="badge">📷 ${c.local.fotos}</span><span class="badge">🧱 ${c.local.objetos}</span>
              </div>
            </button>
            <button type="button" class="btn secondary sm uf-mapmerge-opt" data-map-id="${this.escapeHtml(c.mapId)}" data-value="substituir" style="flex:1; min-width:150px; text-align:left; height:auto; padding:8px 10px">
              <div style="font-weight:700">📥 Versão nova</div>
              <div style="display:flex; gap:6px; margin-top:4px; flex-wrap:wrap">
                <span class="badge">🏷️ ${c.novo.itens}</span><span class="badge">📷 ${c.novo.fotos}</span><span class="badge">🧱 ${c.novo.objetos}</span>
              </div>
            </button>
          </div>
        </div>`;
      modal.innerHTML = `
        <div class="modal-sheet" style="text-align:left; max-width:min(96vw, 640px)">
          <div class="handle"></div>
          <h3 style="margin-top:0; text-align:center">${this.escapeHtml(title)}</h3>
          ${message ? `<p style="font-size:13px; color:var(--text-dim); white-space:pre-wrap; text-align:center">${this.escapeHtml(message)}</p>` : ''}
          <div style="max-height:50vh; overflow-y:auto; margin-top:10px" id="mapmerge-batch-rows">${conflicts.map(linhaHtml).join('')}</div>
          <div style="display:flex; gap:8px; margin-top:12px">
            <button type="button" class="btn secondary block" id="mapmerge-batch-cancel">Cancelar</button>
            <button type="button" class="btn block" id="mapmerge-batch-confirm">✅ Confirmar</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const marcarSelecionado = (mapId) => {
        modal.querySelectorAll(`.uf-mapmerge-opt[data-map-id="${mapId}"]`).forEach((b) => {
          b.classList.toggle('active', b.dataset.value === escolhas.get(mapId));
        });
      };
      conflicts.forEach((c) => marcarSelecionado(c.mapId));
      modal.querySelectorAll('.uf-mapmerge-opt').forEach((btn) => {
        btn.onclick = () => {
          escolhas.set(btn.dataset.mapId, btn.dataset.value);
          marcarSelecionado(btn.dataset.mapId);
        };
      });
      modal.querySelector('#mapmerge-batch-confirm').onclick = () => { modal.remove(); resolve(escolhas); };
      modal.querySelector('#mapmerge-batch-cancel').onclick = () => { modal.remove(); resolve(null); };
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) { modal.remove(); resolve(null); } });
    });
  },

  /**
   * Fluxo completo de resolver conflitos de mapas (mesmo id que um mapa já
   * salvo neste aparelho) — usado tanto pela importação de backup
   * (settings.js) quanto por "Unificar fontes diferentes" (unify.js), pra
   * não duplicar a mesma pergunta/UI nos dois lugares. Pedido do usuário
   * (28/08/2026): "Deve haver a possibilidade de mesclar mapas... Deve ser
   * possível decidir qual mapa vai ficar." A opção "🔀 Mesclar" abre um
   * ÚNICO modal (`showMapMergeBatchModal`, ver acima) com TODOS os mapas
   * colidentes de uma vez — pedido do usuário (28/08/2026, correção):
   * "se há várias coisas para decidir, deve aparecer em uma única janela.
   * Não ficar aparecendo uma janela por decisão a se tomar" (antes desta
   * correção, cada mapa colidente abria seu PRÓPRIO modal, um atrás do
   * outro, dentro do loop de `DB.importMaps`). As decisões já vêm prontas
   * (num Map mapId -> 'manter'/'substituir') ANTES de chamar `DB.importMaps`,
   * então o loop de import não pergunta mais nada — só consulta o Map.
   * Devolve o mesmo formato de `DB.importMaps`, ou `null` se cancelado.
   */
  async importMapsWithConflictUI(maps, { title = 'Mapas já existentes encontrados', countNewSide } = {}) {
    if (!maps?.length) return { idRemap: new Map(), criados: 0, atualizados: 0, mantidos: 0, criadosMaps: [], atualizadosAntes: [] };
    const conflitos = await DB.countMapConflicts(maps);
    // `OrganizeView.invalidate()` (rodada 52, item 9 — pedido do usuário:
    // "quando a janela [Organizar] já foi montada deve ser preservada até a
    // página ser recarregada. Só deve atualizar se um mapa novo for criado
    // ou uma nova importação ocorrer...") — marca que a lista de mapas
    // cacheada em Organizar ficou desatualizada; se a tela estiver fechada
    // agora, o próximo `open()` recarrega do banco antes de mostrar algo
    // velho. Opcional (`?.`) — este arquivo carrega ANTES de organizeview.js
    // no index.html, então a checagem de existência é sempre necessária, e
    // o app inteiro deve continuar funcionando normalmente mesmo se este
    // hook nunca for chamado (não é crítico pra importação em si).
    if (!conflitos) { const r = await DB.importMaps(maps, 'ambos'); window.OrganizeView?.invalidate?.(); return r; }

    const resultado = await this.showChoiceModal({
      title,
      message: `${conflitos} de ${maps.length} mapa(s) já existem aqui (mesmo id). O que fazer com eles?`,
      choices: [
        { value: 'manter', label: '✅ Manter o que já existe aqui (ignora a versão nova)' },
        { value: 'substituir', label: '🔁 Substituir a planta pela nova', secondary: true },
        { value: 'mesclar', label: '🔀 Mesclar — escolher versão de cada mapa', secondary: true },
        { value: 'ambos', label: '➕ Manter os dois (importar como mapa novo)', secondary: true },
        { value: 'cancelar', label: 'Cancelar', secondary: true },
      ],
    });
    if (!resultado || resultado === 'cancelar') return null;
    if (resultado !== 'mesclar') { const r = await DB.importMaps(maps, resultado); window.OrganizeView?.invalidate?.(); return r; }

    // Mesclar — monta a lista COMPLETA de conflitos ANTES de perguntar nada
    // (uma leitura de contagem por mapa, sem UI ainda), pra abrir UM ÚNICO
    // modal com todas as linhas juntas, em vez de um modal por mapa.
    const pares = await DB.findMapConflicts(maps);
    const conflicts = [];
    for (const { m, existente } of pares) {
      const localCounts = await DB.countLinkedToMap(existente.id);
      const novoCounts = countNewSide ? countNewSide(m) : { itens: 0, fotos: 0 };
      conflicts.push({
        mapId: m.id,
        nome: existente.nome || m.nome || 'Ambiente',
        local: { itens: localCounts.itens, fotos: localCounts.fotos, objetos: (existente.objects || []).length },
        novo: { itens: novoCounts.itens, fotos: novoCounts.fotos, objetos: (m.objects || []).length },
      });
    }
    const decisoes = await this.showMapMergeBatchModal({
      title: 'Qual versão de cada mapa deve virar a planta?',
      message: 'A outra versão contribui só com fotos/itens vinculados àquele mapa — a planta (paredes/objetos) escolhida é a única que fica.',
      conflicts,
    });
    if (!decisoes) return null;

    // As decisões já foram todas tomadas na janela única acima — o loop de
    // `DB.importMaps` só CONSULTA o Map, sem abrir nada novo.
    const r = await DB.importMaps(maps, (m) => decisoes.get(m.id) || 'manter');
    window.OrganizeView?.invalidate?.();
    return r;
  },

  /** Janela de busca simples para escolher um item do catálogo — usada tanto
   *  pelos orbs das fotos do ambiente (ambientephotos.js) quanto pelo modo
   *  "Itens" do mapa 2D (mapview.js, marcar onde um item está na planta) e
   *  pela associação de patrimônio a objeto (mapview.js/view3d.js "Adicionar
   *  orb"/painel do objeto). Por padrão já lista os itens do ambiente
   *  passado (o caso mais comum), mas a busca cobre o catálogo inteiro.
   *  Devolve o id escolhido, ou null se cancelado.
   *
   *  Filtro (pedido do usuário, 26/08/2026): "Na janela que aparece para
   *  procurar os patrimônios, deve ter uma opção de filtro. Um botão que,
   *  quando pressionado, expande-se. Quando o filtro não estiver expandido,
   *  apenas os filtros aplicados aparecem com seus checkbox... Uma opção de
   *  'mostrar apenas os itens não marcados no mapa'. Uma checkbox associado
   *  a essa opção de 'filtro sempre visível'... Os outros filtros também
   *  devem ter esse checkbox... Uma seção de tipo... uma seção de setor
   *  (apenas para os tipos/setores já catalogados)." Cada filtro é uma
   *  entrada em `state.filters` (Map, chave única) com `{checked, pinned,
   *  label, group}`: `checked` é o filtro em si (aplicado ou não);
   *  `pinned` ("sempre visível") faz o filtro aparecer no resumo recolhido
   *  mesmo desmarcado, só pra ficar à mão pra marcar rapidinho depois. O
   *  painel expandido lista TODOS (tipo/setor só os que aparecem em pelo
   *  menos um item do catálogo agora — `tiposCatalogados`/`setoresCatalogados`
   *  abaixo, calculados a partir de `getAllSummaries()`, não do registro de
   *  nomes usado no autocomplete, que pode ter sobras de itens já excluídos).
   *  "Não marcados no mapa" = nem tem pino próprio no mapa do ambiente
   *  (`item.mapaX`/`mapaY`) nem está associado a nenhum objeto do mapa
   *  (`map.objects[].itemIds`, ver mapping.js addItemToObject/
   *  computeItemAssocIndex) — as DUAS formas de "já estar no mapa" que o
   *  app tem hoje. */
  pickItem({ ambienteId, title = 'Escolher item' } = {}) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-sheet">
          <div class="handle"></div>
          <h3 style="margin-top:0">${this.escapeHtml(title)}</h3>
          <input type="text" id="pick-item-search" class="ambphoto-pick-input" placeholder="Buscar por patrimônio, descrição, tipo…" autocomplete="off">
          <div id="pick-item-filters" class="pick-item-filters">
            <div id="pick-item-filters-collapsed" class="pick-filter-collapsed"></div>
            <div id="pick-item-filters-panel" class="pick-filter-panel hidden"></div>
          </div>
          <div id="pick-item-results" class="ambphoto-pick-results"></div>
          <button class="btn secondary block" id="pick-item-cancel" style="margin-top:10px" title="Cancelar sem escolher nenhum item">Cancelar</button>
        </div>`;
      document.body.appendChild(modal);
      const input = modal.querySelector('#pick-item-search');
      const results = modal.querySelector('#pick-item-results');
      const filtersWrap = modal.querySelector('#pick-item-filters');
      const collapsedEl = modal.querySelector('#pick-item-filters-collapsed');
      const panelEl = modal.querySelector('#pick-item-filters-panel');
      let resolved = false;
      const finish = (id) => { if (resolved) return; resolved = true; modal.remove(); resolve(id); };
      modal.querySelector('#pick-item-cancel').onclick = () => finish(null);
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) finish(null); });

      const state = { expanded: false, filters: new Map(), marcadosSet: null };
      state.filters.set('naoMarcados', { checked: false, pinned: false, label: 'Mostrar apenas itens não marcados no mapa', group: 'geral' });

      const filterRowHtml = (key, f) => `
        <label class="pick-filter-row" data-key="${this.escapeHtml(key)}">
          <input type="checkbox" class="pick-filter-chk" ${f.checked ? 'checked' : ''}>
          <span class="pick-filter-label" title="${this.escapeHtml(f.label)}">${this.escapeHtml(f.label)}</span>
          <button type="button" class="pick-filter-pin ${f.pinned ? 'active' : ''}" title="${f.pinned ? 'Sempre visível: sim (clique para não fixar)' : 'Sempre visível: não — clique para deixar este filtro sempre à vista'}">📌</button>
        </label>`;

      const renderFilters = () => {
        const entries = [...state.filters.entries()];
        const collapsedEntries = entries.filter(([, f]) => f.checked || f.pinned);
        const aplicados = entries.filter(([, f]) => f.checked).length;
        collapsedEl.innerHTML = `
          <div class="pick-filter-chips">${collapsedEntries.map(([k, f]) => filterRowHtml(k, f)).join('')}</div>
          <button type="button" id="pick-item-filters-toggle" class="pick-filter-expand-btn">${state.expanded ? '▴' : '▾'} Filtros${aplicados ? ` (${aplicados})` : ''}</button>
        `;
        panelEl.classList.toggle('hidden', !state.expanded);
        if (state.expanded) {
          const geral = entries.filter(([, f]) => f.group === 'geral');
          const tipos = entries.filter(([, f]) => f.group === 'tipo');
          const setores = entries.filter(([, f]) => f.group === 'setor');
          panelEl.innerHTML = `
            <div class="pick-filter-section">${geral.map(([k, f]) => filterRowHtml(k, f)).join('')}</div>
            ${tipos.length ? `<div class="pick-filter-section-title">Tipo</div><div class="pick-filter-section">${tipos.map(([k, f]) => filterRowHtml(k, f)).join('')}</div>` : ''}
            ${setores.length ? `<div class="pick-filter-section-title">Setor</div><div class="pick-filter-section">${setores.map(([k, f]) => filterRowHtml(k, f)).join('')}</div>` : ''}
          `;
        } else {
          panelEl.innerHTML = '';
        }
      };
      // Delegação no container inteiro (não nas linhas, refeitas a cada
      // renderFilters) — sobrevive a qualquer re-render sem precisar
      // reamarrar handler nenhum.
      filtersWrap.addEventListener('change', (e) => {
        if (!e.target.classList.contains('pick-filter-chk')) return;
        const key = e.target.closest('.pick-filter-row')?.dataset.key;
        const f = key && state.filters.get(key);
        if (!f) return;
        f.checked = e.target.checked;
        renderFilters();
        renderResults(input.value.trim());
      });
      filtersWrap.addEventListener('click', (e) => {
        if (e.target.closest('#pick-item-filters-toggle')) { state.expanded = !state.expanded; renderFilters(); return; }
        const pinBtn = e.target.closest('.pick-filter-pin');
        if (pinBtn) {
          const key = pinBtn.closest('.pick-filter-row')?.dataset.key;
          const f = key && state.filters.get(key);
          if (f) { f.pinned = !f.pinned; renderFilters(); }
        }
      });

      const anyFilterChecked = () => [...state.filters.values()].some((f) => f.checked);
      const applyFilters = (items) => {
        let out = items;
        const tiposChecados = [...state.filters.entries()].filter(([k, f]) => k.startsWith('tipo:') && f.checked).map(([, f]) => f.label);
        if (tiposChecados.length) out = out.filter((it) => tiposChecados.includes(it.tipo));
        const setoresChecados = [...state.filters.entries()].filter(([k, f]) => k.startsWith('setor:') && f.checked).map(([, f]) => f.label);
        if (setoresChecados.length) out = out.filter((it) => setoresChecados.includes(it.setor));
        if (state.filters.get('naoMarcados')?.checked && state.marcadosSet) out = out.filter((it) => !state.marcadosSet.has(it.id));
        return out;
      };

      const renderResults = async (q) => {
        let items;
        if (q) items = await window.DB.searchItems(q, { limit: 300 });
        else if (anyFilterChecked()) items = state.summaries || [];
        else items = ambienteId ? (await window.DB.getItemsByAmbiente(ambienteId)) : [];
        items = applyFilters(items);
        if (!q) items = [...items].sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
        items = items.slice(0, 30);
        results.innerHTML = items.map((it) => `
          <button type="button" class="ambphoto-pick-row" data-id="${it.id}">
            ${it.thumbDataUrl ? `<img src="${it.thumbDataUrl}" alt="">` : '<span class="ambphoto-pick-noimg">📦</span>'}
            <span class="t"><b>${this.escapeHtml(it.patrimonio || '—')}</b> ${this.escapeHtml(it.descricao || it.tipo || '')}</span>
            <span class="ambphoto-pick-time">${this.escapeHtml(this.formatRelativeSuggestion(it.criadoEm))}</span>
          </button>`).join('') || `<p style="font-size:12.5px; color:var(--text-dim); text-align:center; padding:10px 0">${q || anyFilterChecked() ? 'Nenhum item encontrado.' : 'Nenhum item neste ambiente ainda — busque pelo catálogo inteiro acima.'}</p>`;
        results.querySelectorAll('.ambphoto-pick-row').forEach((b) => { b.onclick = () => finish(b.dataset.id); });
      };

      // Carrega o dataset leve (getAllSummaries) uma vez só, pra montar as
      // seções de Tipo/Setor (só os já catalogados) e o conjunto de ids
      // "já marcados no mapa" (pino próprio OU associado a algum objeto do
      // mapa) — usado tanto pelo filtro quanto pela navegação "sem busca,
      // com algum filtro ativo" (catálogo inteiro, não só o ambiente).
      (async () => {
        const summaries = (typeof window.DB !== 'undefined') ? await window.DB.getAllSummaries() : [];
        state.summaries = summaries;
        const tiposSet = new Set(), setoresSet = new Set();
        summaries.forEach((it) => { if (it.tipo) tiposSet.add(it.tipo); if (it.setor) setoresSet.add(it.setor); });
        [...tiposSet].sort((a, b) => a.localeCompare(b)).forEach((t) => state.filters.set(`tipo:${t}`, { checked: false, pinned: false, label: t, group: 'tipo' }));
        [...setoresSet].sort((a, b) => a.localeCompare(b)).forEach((s) => state.filters.set(`setor:${s}`, { checked: false, pinned: false, label: s, group: 'setor' }));
        const mapaData = ambienteId ? await window.DB.getMap(ambienteId) : null;
        const associatedIds = new Set();
        (mapaData?.objects || []).forEach((o) => (o.itemIds || []).forEach((e) => { if (e && e.id) associatedIds.add(e.id); }));
        summaries.forEach((it) => { if (it.mapaX != null && it.mapaY != null) associatedIds.add(it.id); });
        state.marcadosSet = associatedIds;
        renderFilters();
      })();

      renderFilters();
      renderResults('');
      input.addEventListener('input', this.debounce(() => renderResults(input.value.trim()), 200));
      setTimeout(() => input.focus(), 50);
    });
  },

  /** Detecta se o app está rodando num celular/tablet (vs. PC/notebook) — usado
   *  para já pré-selecionar o cenário certo nas Configurações ("PC" ou
   *  "Celular") sem o usuário precisar escolher manualmente. */
  isMobileDevice() {
    const ua = navigator.userAgent || '';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
    try { return navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
  },

  /** Copia texto para a área de transferência — tenta a API moderna primeiro
   *  (exige contexto seguro: HTTPS ou localhost) e cai para o método antigo
   *  (funciona também em file:// e http://), já que este app precisa
   *  funcionar em qualquer um desses contextos. Devolve true/false. */
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* cai para o método abaixo */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.top = '0';
      ta.style.left = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  },
};

/**
 * Autocomplete simples e reutilizável (tipos, setores, etc.).
 * @param {HTMLInputElement} input
 * @param {() => Promise<Array<{nome:string, usos?:number}>>} listProvider
 * @param {(nome:string) => void} onSelect
 */
/**
 * @param {(nome: string) => (void|Promise<void>)} [onDelete] - opcional; quando
 *   passado, cada sugestão ganha um botão "🗑️" à direita pra remover aquela
 *   entrada específica da lista (ex: um tipo/setor digitado errado uma vez) —
 *   não mexe em nenhum item já cadastrado, só na lista de sugestões.
 * @param {{iconProvider?: (nome: string) => Promise<string|null>}} [opts] -
 *   opcional; `iconProvider` recebe o nome da sugestão e devolve um SVG
 *   (string) pra mostrar no lugar do botão de lixeira quando reconhecer o
 *   texto, ou `null` quando não reconhecer (aí a linha cai de volta pro
 *   botão de lixeira, se `onDelete` também foi passado).
 */
Utils.attachAutocomplete = function attachAutocomplete(input, listProvider, onSelect, onDelete, opts) {
  const iconProvider = opts?.iconProvider || null;
  const wrap = document.createElement('div');
  wrap.className = 'autocomplete-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const list = document.createElement('div');
  list.className = 'autocomplete-list hidden';
  wrap.appendChild(list);

  let items = [];
  let activeIdx = -1;

  const loadItems = async () => {
    items = await listProvider();
    if (iconProvider) {
      await Promise.all(items.map(async (i) => { i._iconSvg = (await iconProvider(i.nome)) || null; }));
    }
  };

  const render = (filterText) => {
    const q = (filterText || '').trim().toLowerCase();
    const filtered = q ? items.filter((i) => i.nome.toLowerCase().includes(q)) : items;
    if (filtered.length === 0) { list.classList.add('hidden'); return; }
    list.innerHTML = filtered.slice(0, 40).map((i, idx) => {
      const nomeHtml = `${Utils.escapeHtml(i.nome)}${i.usos ? `<small>${i.usos}×</small>` : ''}`;
      // Ícone reconhecido (se houver) e lixeira (se onDelete foi passado)
      // convivem — o ícone fica à ESQUERDA da lixeira, dentro do mesmo grupo
      // "ac-right", pra lixeira nunca mudar de posição em relação à borda
      // direita da linha (com ou sem ícone reconhecido ao lado dela).
      const iconHtml = i._iconSvg ? `<span class="ac-icon" title="Ícone reconhecido para este texto">${i._iconSvg}</span>` : '';
      const delHtml = onDelete ? `<button type="button" class="ac-del-btn" title="Remover &quot;${Utils.escapeHtml(i.nome)}&quot; desta lista de sugestões (não apaga nenhum item já cadastrado)">🗑️</button>` : '';
      const right = (iconHtml || delHtml) ? `<span class="ac-right">${iconHtml}${delHtml}</span>` : '';
      return `<div class="ac-row" data-idx="${idx}" data-nome="${Utils.escapeHtml(i.nome)}"><span class="ac-nome">${nomeHtml}</span>${right}</div>`;
    }).join('');
    list.classList.remove('hidden');
    activeIdx = -1;
    list.querySelectorAll('.ac-row').forEach((el) => {
      el.onmousedown = (ev) => {
        if (ev.target.closest('.ac-del-btn')) return; // o botão de excluir cuida do próprio clique
        ev.preventDefault();
        input.value = el.dataset.nome;
        list.classList.add('hidden');
        onSelect(el.dataset.nome);
      };
    });
    if (onDelete) {
      list.querySelectorAll('.ac-del-btn').forEach((btn) => {
        btn.onmousedown = async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const nome = btn.closest('.ac-row')?.dataset.nome;
          if (!nome) return;
          await onDelete(nome);
          await loadItems();
          render(input.value);
          input.focus();
        };
      });
    }
  };

  input.addEventListener('focus', async () => { await loadItems(); render(input.value); });
  input.addEventListener('input', Utils.debounce(async () => { await loadItems(); render(input.value); }, 150));
  input.addEventListener('blur', () => setTimeout(() => list.classList.add('hidden'), 150));
  input.addEventListener('keydown', (ev) => {
    const opts = [...list.querySelectorAll('.ac-row')];
    if (list.classList.contains('hidden') || opts.length === 0) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); activeIdx = Math.min(opts.length - 1, activeIdx + 1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); }
    else if (ev.key === 'Enter' && activeIdx >= 0) { ev.preventDefault(); opts[activeIdx].dispatchEvent(new Event('mousedown')); return; }
    else return;
    opts.forEach((o, i) => o.classList.toggle('active', i === activeIdx));
    opts[activeIdx]?.scrollIntoView({ block: 'nearest' });
  });

  return { refresh: async () => { await loadItems(); render(input.value); } };
};

/** Traz `el` pra frente de qualquer outro elemento que também já tenha
 *  passado por aqui — usado pelos painéis Ferramentas/Histórico/Camadas/
 *  propriedades de objeto do Mapa (pedido do usuário, rodada antiga: "o
 *  último selecionado deve ficar mais à frente que os outros, inclusive no
 *  reaparecer"). Não faz nada se `el` for nulo (painel ainda não montado).
 *  ATUALIZADO (07/09/2026), "posicionamento das janelas no app" — pedido
 *  verbatim: "Faça uma função de gerenciamento de janelas para todo o
 *  app... Para evitar ficar só aumentando cada vez mais os números de
 *  z-index a cada 'subida' para o foco, deve haver um valor padrão mais
 *  alto distante de z-index [...] conferido toda vez [...] Se não estiver,
 *  então, é aumentado." Antes, esta função tinha um contador PRÓPRIO
 *  (`_frontZCounter`) que só crescia +1 a cada chamada, pra sempre — sem
 *  nenhuma checagem, exatamente o padrão que o pedido quer evitar. Virou um
 *  wrapper fino sobre `js/windowmanager.js` (`WindowManager.focus`, que
 *  implementa o algoritmo pedido de verdade) — MESMA assinatura/contrato de
 *  sempre (recebe o elemento, devolve o novo z-index aplicado), nenhum dos
 *  ~10 lugares que já chamavam `Utils.bringToFront(el)` precisou mudar.
 *  Fallback pro comportamento antigo só no caso (não esperado em produção,
 *  windowmanager.js está sempre carregado) de `WindowManager` não existir
 *  ainda por algum motivo. */
let _frontZCounterFallback = 961;
Utils.bringToFront = function bringToFront(el) {
  if (!el) return;
  if (typeof window.WindowManager !== 'undefined') return window.WindowManager.focus(el);
  _frontZCounterFallback += 1;
  el.style.zIndex = String(_frontZCounterFallback);
  return _frontZCounterFallback;
};

/** [15/09/2026 UTC] NOVO — pedido verbatim: "Ao 'fechar' a janela, ela deve
 *  voltar para o seu z-index normal." Wrapper fino sobre `WindowManager.
 *  blur` (mesmo espírito do wrapper `Utils.bringToFront`/`WindowManager.
 *  focus` acima) — chamado no fechamento de cada janela flutuante do mapa
 *  (ver mapview.js `_hideOrRemovePanel`/`_closeObjectPickerPanel`/
 *  `_closeLayersPanelImpl`/`_closeCoresPanel`). Sem `WindowManager`
 *  (não esperado em produção), não há nada a fazer — o fallback de
 *  `bringToFront` acima também não tem noção de "z-index normal" pra
 *  devolver, então esta função só age quando o gerenciador de verdade
 *  existe. */
Utils.releaseFront = function releaseFront(el) {
  if (!el) return;
  if (typeof window.WindowManager !== 'undefined') window.WindowManager.blur(el);
};

window.Utils = Utils;
