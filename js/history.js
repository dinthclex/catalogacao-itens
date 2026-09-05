/**
 * history.js — Desfazer/Refazer (Ctrl+Z / Ctrl+Y) globais para as mutações
 * mais "perigosas" do app: remover orb, excluir foto de ambiente, editar
 * item, excluir item (um ou em lote) e importar itens de um backup.
 *
 * Padrão "command": cada ação empurra um comando { label, undo, redo } —
 * ambos os lados são funções assíncronas que operam DIRETO no banco (por
 * id), sem depender de qual tela está aberta no momento. Isso permite
 * desfazer uma ação mesmo depois de trocar de tela, e também permite
 * refazer (redo) depois de desfazer.
 *
 * Cada comando aqui é "self-contained": ele mesmo sabe como reverter e
 * reaplicar a mutação exata que representa — quem cria o comando (em
 * ambientephotos.js, app.js, table.js, settings.js) é responsável por capturar
 * o estado "antes" ANTES de mutar, e empurrar o comando DEPOIS de já ter
 * aplicado a ação (o comando descreve uma ação já feita).
 */
const History = {
  _undo: [],
  _redo: [],
  _listeners: [],
  _alwaysShow: false,
  _widgetEl: null,
  MAX: 60,

  async init() {
    this._alwaysShow = !!(await DB.getSetting('historySempreVisivel', false));
    this._ensureWidget();
    this._updateWidget();
    document.addEventListener('keydown', (e) => {
      const el = document.activeElement;
      const editando = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (editando) return; // deixa o desfazer/refazer NATIVO do campo de texto funcionar
      const z = e.key === 'z' || e.key === 'Z';
      const y = e.key === 'y' || e.key === 'Y';
      if ((e.ctrlKey || e.metaKey) && z && !e.shiftKey) { e.preventDefault(); this.undo(); }
      else if ((e.ctrlKey || e.metaKey) && ((z && e.shiftKey) || y)) { e.preventDefault(); this.redo(); }
    });
  },

  _nextId: 1, // id único crescente de cada comando empilhado — usado pela janela de histórico (ver getTimeline/jumpTo) pra identificar cada item da lista

  /** Chamado por quem já aplicou uma mutação — empilha o comando e limpa a
   *  pilha de "refazer" (uma ação nova invalida o que dava pra refazer,
   *  mesma ideia de pilha — ver getTimeline/jumpTo abaixo). */
  push(cmd) {
    cmd.id = this._nextId++;
    this._undo.push(cmd);
    if (this._undo.length > this.MAX) this._undo.shift();
    this._redo = [];
    this._notify();
  },

  canUndo() { return this._undo.length > 0; },
  canRedo() { return this._redo.length > 0; },

  /** `{silent}` evita o toast individual — usado por jumpTo (ver abaixo)
   *  pra não empilhar um toast por passo ao pular vários de uma vez.
   *  Retorna true/false (sucesso) em vez de nada, também pro jumpTo saber
   *  quando parar. */
  async undo({ silent = false } = {}) {
    const cmd = this._undo.pop();
    if (!cmd) return false;
    try {
      await cmd.undo();
      this._redo.push(cmd);
      if (!silent) Utils.toast(`↶ Desfeito: ${cmd.label}`, { type: 'ok' });
    } catch (err) {
      console.error('Falha ao desfazer:', err);
      Utils.toast('Não foi possível desfazer essa ação — veja o console.', { type: 'danger' });
      this._undo.push(cmd); // não perde o comando por causa de uma falha
      await this._afterChange();
      return false;
    }
    await this._afterChange();
    return true;
  },

  async redo({ silent = false } = {}) {
    const cmd = this._redo.pop();
    if (!cmd) return false;
    try {
      await cmd.redo();
      this._undo.push(cmd);
      if (!silent) Utils.toast(`↷ Refeito: ${cmd.label}`, { type: 'ok' });
    } catch (err) {
      console.error('Falha ao refazer:', err);
      Utils.toast('Não foi possível refazer essa ação — veja o console.', { type: 'danger' });
      this._redo.push(cmd);
      await this._afterChange();
      return false;
    }
    await this._afterChange();
    return true;
  },

  /** Lista ÚNICA e SEQUENCIAL de todas as ações (aplicadas + as que dava pra
   *  refazer), na ordem em que aconteceram — usada pela janela de histórico
   *  (ver openPanel). `applied:false` marca as que estão "no futuro" agora
   *  (a pilha de refazer, ver _redo) — aparecem esmaecidas na lista. */
  getTimeline() {
    const past = this._undo.map((cmd) => ({ id: cmd.id, label: cmd.label, applied: true }));
    const future = [...this._redo].reverse().map((cmd) => ({ id: cmd.id, label: cmd.label, applied: false }));
    return [...past, ...future];
  },

  /** Clica num item da lista de histórico: aplica/desfaz em SEQUÊNCIA (é um
   *  histórico de ações, não dá pra "pular" — ver comentário do usuário)
   *  até esse item ficar como o ÚLTIMO aplicado. Pra trás (item mais antigo
   *  que o ponto atual): desfaz um por um. Pra frente (item mais novo,
   *  hoje esmaecido): refaz um por um. Pára na 1ª falha, sem quebrar o
   *  resto — o comando problemático fica onde estava. */
  async jumpTo(id) {
    const timeline = this.getTimeline();
    const idx = timeline.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const alvo = idx + 1; // quantos itens (desde o início) devem ficar "aplicados" depois do salto
    let passos = 0;
    while (this._undo.length > alvo) { if (!await this.undo({ silent: true })) break; passos++; }
    while (this._undo.length < alvo) { if (!await this.redo({ silent: true })) break; passos++; }
    if (passos) Utils.toast(`Histórico: ${passos} passo${passos === 1 ? '' : 's'} aplicado${passos === 1 ? '' : 's'}.`, { type: 'ok' });
    this._renderPanel();
  },

  async _afterChange() {
    await App._refreshCurrentView?.();
    await AmbientePhotos.refreshIfOpen?.();
    this._notify();
    this._renderPanel();
  },

  /** Ajusta a configuração "sempre mostrar" (chamado pela tela de Configurações). */
  async setAlwaysShow(on) {
    this._alwaysShow = !!on;
    await DB.setSetting('historySempreVisivel', this._alwaysShow);
    this._updateWidget();
  },

  onChange(fn) { this._listeners.push(fn); },
  _notify() { this._listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignora */ } }); this._updateWidget(); },

  // ---------- Widget flutuante (desfazer/refazer visível na tela) ----------
  _ensureWidget() {
    if (this._widgetEl) return;
    const el = document.createElement('div');
    el.id = 'history-widget';
    el.className = 'history-widget hidden';
    el.innerHTML = `
      <button type="button" id="history-undo" title="Desfazer (Ctrl+Z)">↶</button>
      <button type="button" id="history-redo" title="Refazer (Ctrl+Y)">↷</button>
    `;
    document.body.appendChild(el);
    el.querySelector('#history-undo').onclick = () => this.undo();
    el.querySelector('#history-redo').onclick = () => this.redo();
    this._widgetEl = el;
  },

  _updateWidget() {
    if (!this._widgetEl) return;
    const undoBtn = this._widgetEl.querySelector('#history-undo');
    const redoBtn = this._widgetEl.querySelector('#history-redo');
    const podeUndo = this.canUndo(), podeRedo = this.canRedo();
    undoBtn.disabled = !podeUndo;
    redoBtn.disabled = !podeRedo;
    undoBtn.title = podeUndo ? `Desfazer: ${this._undo[this._undo.length - 1].label} (Ctrl+Z)` : 'Nada para desfazer';
    redoBtn.title = podeRedo ? `Refazer: ${this._redo[this._redo.length - 1].label} (Ctrl+Y)` : 'Nada para refazer';
    const mostrar = this._alwaysShow || podeUndo || podeRedo;
    this._widgetEl.classList.toggle('hidden', !mostrar);
  },

  // ---------- Janela de histórico (lista clicável, estilo pilha) ----------
  // Botão de acesso fica na linha 1 do cabeçalho do Mapa (ver mapview.js
  // _mountTopbarMapa) — mas o histórico em si é GLOBAL (ações de qualquer
  // tela, ver comentário no topo do arquivo), por isso a janela mora aqui,
  // não em mapview.js, e funciona de qualquer lugar que a abra.

  _panelEl: null,
  // Posição lembrada entre fechar/abrir (pedido do usuário: o painel de
  // Histórico deve preservar onde foi deixado, não voltar sempre pro canto
  // padrão) — só em memória (dura a sessão, como o resto do estado da UI),
  // atualizada a cada arraste (ver _makeHistoryPanelDraggable) e reaplicada
  // em openPanel(). Tamanho (redimensionamento pelas alças) não faz parte
  // do pedido — continua voltando ao padrão a cada abertura, como sempre.
  _panelPos: null, // {left, top} em px — null = ainda não foi arrastado, usa o padrão

  togglePanel() { this._panelEl ? this.closePanel() : this.openPanel(); },

  openPanel() {
    if (this._panelEl) { this._renderPanel(); Utils.bringToFront(this._panelEl); return; }
    const panel = document.createElement('div');
    panel.className = 'history-panel';
    const pos = this._panelPos;
    panel.style.left = (pos ? pos.left : 10) + 'px';
    panel.style.top = (pos ? pos.top : 64) + 'px';
    panel.style.width = '300px';
    panel.style.height = '320px';
    document.body.appendChild(panel);
    this._panelEl = panel;
    // Qualquer interação (não só arrastar) conta como "selecionar" este
    // painel — deve ficar na frente de Ferramentas/Camadas (pedido do
    // usuário, ver Utils.bringToFront). Anexado no painel em si (não no
    // conteúdo interno, que é substituído por inteiro a cada _renderPanel),
    // então sobrevive a redesenhos.
    panel.addEventListener('pointerdown', () => Utils.bringToFront(panel), true);
    this._renderPanel();
    // Se a posição lembrada deixou (parte d)a janela fora da tela agora —
    // ex: a tela foi redimensionada/girada desde a última vez — só ajusta o
    // necessário pra ela aparecer inteiramente visível de novo (pedido do
    // usuário), sem descartar a posição lembrada além disso.
    if (pos) this._clampPanelIntoView(panel);
    // Abrir (inclusive reaparecer depois de oculto) conta como "selecionar"
    // este painel — deve ficar na frente de Ferramentas/Camadas (ver
    // Utils.bringToFront, pedido do usuário).
    Utils.bringToFront(panel);
  },

  /** Ajusta left/top pra o painel caber inteiro na tela (chamado ao reabrir
   *  numa posição lembrada — ver openPanel acima) — mesma ideia usada em
   *  mapview.js _makePanelDraggable durante o arraste, só que aqui é um
   *  ajuste pontual ao reabrir, não contínuo. */
  _clampPanelIntoView(panel) {
    const r = panel.getBoundingClientRect();
    const left = Utils.clamp(r.left, 0, Math.max(0, window.innerWidth - r.width));
    const top = Utils.clamp(r.top, 0, Math.max(0, window.innerHeight - r.height));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    this._panelPos = { ...(this._panelPos || {}), left, top };
  },

  closePanel() {
    if (!this._panelEl) return;
    this._panelEl.remove();
    this._panelEl = null;
  },

  /** Redesenha a lista inteira (chamado sempre que algo muda — push/undo/
   *  redo/jumpTo, ver _afterChange) — reconstrói o innerHTML por inteiro,
   *  então cabeçalho arrastável e alças de redimensionar são reanexados no
   *  final (mesmo padrão do painel de camadas em mapview.js). */
  _renderPanel() {
    const panel = this._panelEl;
    if (!panel) return;
    const timeline = this.getTimeline();
    const currentIdx = this._undo.length - 1; // último aplicado = "agora" (-1 se nada aplicado ainda)
    panel.innerHTML = `
      <div class="map-panel-clip">
        <div class="map-panel-head"><b>🕐 Histórico</b><button type="button" class="icon-btn sm map-panel-close" id="hp-close" title="Fechar">✕</button></div>
        <div class="history-panel-list" id="hp-list">
          ${timeline.length ? timeline.map((t, i) => `
            <div class="history-panel-item ${t.applied ? '' : 'future'} ${i === currentIdx ? 'current' : ''}" data-id="${t.id}" title="${Utils.escapeHtml(t.label)}">
              <span class="history-panel-item-n">${i + 1}</span>
              <span class="history-panel-item-label">${Utils.escapeHtml(t.label)}</span>
            </div>
          `).join('') : '<p class="history-panel-empty">Nenhuma ação ainda.</p>'}
        </div>
        <div class="history-panel-toolbar">
          <button type="button" class="map-layers-tbtn" id="hp-undo" title="Desfazer (Ctrl+Z)" ${this.canUndo() ? '' : 'disabled'}>↶</button>
          <button type="button" class="map-layers-tbtn" id="hp-redo" title="Refazer (Ctrl+Y)" ${this.canRedo() ? '' : 'disabled'}>↷</button>
        </div>
      </div>
    `;
    panel.querySelector('#hp-close').onclick = () => this.closePanel();
    panel.querySelector('#hp-undo').onclick = () => this.undo();
    panel.querySelector('#hp-redo').onclick = () => this.redo();
    // Clique num item: aplica em sequência até ali (ver jumpTo — é uma
    // pilha, não dá pra "pular" sem passar pelos intermediários).
    panel.querySelectorAll('.history-panel-item').forEach((row) => {
      row.addEventListener('click', () => this.jumpTo(Number(row.dataset.id)));
    });
    // Rola pra mostrar sempre o "agora" (fronteira entre aplicado/futuro).
    const list = panel.querySelector('#hp-list');
    const marco = panel.querySelector('.history-panel-item.future') || panel.querySelector('.history-panel-item:last-child');
    if (list && marco) marco.scrollIntoView({ block: 'nearest' });
    this._makeHistoryPanelDraggable(panel);
    this._makeHistoryPanelResizable(panel);
  },

  _makeHistoryPanelDraggable(panel) {
    const head = panel.querySelector('.map-panel-head');
    if (!head) return;
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0, startWidth = 0;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.map-panel-close, button')) return;
      const r = panel.getBoundingClientRect();
      startLeft = r.left; startTop = r.top; startWidth = r.width;
      startX = e.clientX; startY = e.clientY;
      dragging = true;
      head.setPointerCapture(e.pointerId);
      e.preventDefault();
      // Começar a arrastar também conta como "selecionar" este painel —
      // ver Utils.bringToFront (pedido do usuário).
      Utils.bringToFront(panel);
    });
    head.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      // Limite ESQUERDO permissivo (pode ir além da borda esquerda da
      // tela, deixando só uma faixa de 60px visível) — mesmo padrão já
      // usado nos painéis de mapview.js (_makePanelDraggable). Antes o
      // limite era travado em 0, impedindo arrastar a janela do Histórico
      // além da borda esquerda (bug relatado pelo usuário).
      const left = Utils.clamp(startLeft + (e.clientX - startX), -startWidth + 60, window.innerWidth - 60);
      const top = Utils.clamp(startTop + (e.clientY - startY), 0, window.innerHeight - 44);
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      // Lembra a posição pra reaplicar da próxima vez que o painel for
      // reaberto (ver openPanel/_panelPos acima).
      this._panelPos = { ...(this._panelPos || {}), left, top };
    });
    const stop = (e) => { dragging = false; try { head.releasePointerCapture(e.pointerId); } catch { /* já liberado */ } };
    head.addEventListener('pointerup', stop);
    head.addEventListener('pointercancel', stop);
  },

  /** 8 alças (bordas + cantos), mesmo padrão do painel de camadas
   *  (mapview.js _makePanelResizable) — reaproveita as mesmas classes CSS
   *  (.map-panel-resize-handle, com o ícone de 3 quadrados na diagonal). */
  _makeHistoryPanelResizable(panel) {
    const minWidth = 240, minHeight = 200, maxWidth = 560, maxHeight = 680;
    panel.querySelectorAll('.map-panel-resize-handle').forEach((h) => h.remove());
    const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    let resizing = false, dir = null, startX = 0, startY = 0, startW = 0, startH = 0, startLeft = 0, startTop = 0;
    const onMove = (e) => {
      if (!resizing) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      let w = startW, h = startH, left = startLeft, top = startTop;
      if (dir.includes('e')) w = Utils.clamp(startW + dx, minWidth, maxWidth);
      if (dir.includes('s')) h = Utils.clamp(startH + dy, minHeight, maxHeight);
      if (dir.includes('w')) { w = Utils.clamp(startW - dx, minWidth, maxWidth); left = startLeft + (startW - w); }
      if (dir.includes('n')) { h = Utils.clamp(startH - dy, minHeight, maxHeight); top = startTop + (startH - h); }
      panel.style.width = w + 'px'; panel.style.height = h + 'px';
      panel.style.left = left + 'px'; panel.style.top = top + 'px';
      // Redimensionar por uma borda/canto de CIMA ou ESQUERDA também desloca
      // left/top (pra manter o lado oposto fixo) — só a posição resultante é
      // lembrada (ver openPanel/_panelPos acima); tamanho não faz parte do
      // pedido do usuário, continua voltando ao padrão a cada abertura.
      this._panelPos = { left, top };
    };
    const onUp = (e, handle) => { resizing = false; dir = null; try { handle.releasePointerCapture(e.pointerId); } catch { /* já liberado */ } };
    DIRS.forEach((d) => {
      const handle = document.createElement('div');
      handle.className = `map-panel-resize-handle dir-${d}`;
      handle.title = 'Arraste para redimensionar';
      handle.addEventListener('pointerdown', (e) => {
        const r = panel.getBoundingClientRect();
        startW = r.width; startH = r.height; startLeft = r.left; startTop = r.top;
        panel.style.left = startLeft + 'px'; panel.style.top = startTop + 'px';
        panel.style.width = startW + 'px'; panel.style.height = startH + 'px';
        startX = e.clientX; startY = e.clientY;
        resizing = true; dir = d;
        handle.setPointerCapture(e.pointerId);
        e.preventDefault(); e.stopPropagation();
      });
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', (e) => onUp(e, handle));
      handle.addEventListener('pointercancel', (e) => onUp(e, handle));
      // As alças de borda (dir-e/dir-w) ficam por CIMA (z-index) de uma
      // faixa de ~10px nas bordas esquerda/direita do painel — cobrindo boa
      // parte da altura de #hp-list, que não tem margem lateral própria.
      // Isso não afeta o arrasto (pointerdown/move/up, tratados acima), mas
      // SEM isto o scroll do mouse parava de funcionar sempre que o cursor
      // caía nessa faixa — a roda do mouse "vira" um evento na alça, que
      // não é ancestral da lista, então o navegador não sabe que precisa
      // rolar ela. Repassa a rolagem manualmente pro primeiro elemento
      // rolável de verdade (scrollHeight > clientHeight) dentro do painel.
      handle.addEventListener('wheel', (e) => {
        const scrollable = [...panel.querySelectorAll('*')].find((el) => {
          const cs = getComputedStyle(el);
          return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
        });
        if (!scrollable) return;
        scrollable.scrollTop += e.deltaY;
        e.preventDefault();
      }, { passive: false });
      panel.appendChild(handle);
    });
  },
};

window.History = History;
