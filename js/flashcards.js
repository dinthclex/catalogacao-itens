/**
 * flashcards.js — Visualização em flash cards (grade de cartões visuais).
 *
 * Virtualizada por LINHAS da grade (mesma técnica da tabela em table.js): só
 * as linhas de cards visíveis na tela (+ uma margem) ficam no DOM, mesmo com
 * milhares de itens — evita travar a exibição, que era o risco do modelo
 * antigo de "carregar mais 60 ao rolar" (o DOM só crescia, nunca encolhia).
 */

const FlashcardsView = {
  _container: null,
  _all: [],
  _filtered: [],
  _query: '',
  _queryRaw: '',
  _scrollTop: 0,
  _cols: 1,
  _rowH: 200,
  _minColW: 150,
  _gap: 12,
  _padTop: 12,
  _padBottom: 30,
  _onScroll: null,
  _onResize: null,

  async mount(container) {
    this._container = container;
    container.innerHTML = `
      <div class="vscroll-view-wrap">
        <div class="table-toolbar">
          <input type="search" id="fc-search" placeholder="Filtrar cartões…" title="Filtrar os cartões pelo patrimônio, descrição, tipo ou setor" value="${Utils.escapeHtml(this._queryRaw)}">
          <button class="icon-btn" id="fc-add" title="Cadastrar um novo item manualmente">+ Novo</button>
        </div>
        <div class="vgrid" id="fc-scroll">
          <div class="vgrid-spacer" id="fc-spacer"></div>
          <div class="empty-state hidden" id="fc-empty">
            <div class="ic">🗂️</div>Nenhum item encontrado.<br>
            <button class="btn" style="margin-top:12px" onclick="App.openItemForm()" title="Abrir o formulário para cadastrar o primeiro item">Cadastrar primeiro item</button>
          </div>
        </div>
      </div>
    `;
    container.querySelector('#fc-add').onclick = () => App.openItemForm();
    container.querySelector('#fc-search').oninput = Utils.debounce((e) => {
      this._queryRaw = e.target.value;
      this._query = e.target.value.trim().toLowerCase();
      this._applyFilter();
    }, 200);

    const scroll = container.querySelector('#fc-scroll');
    scroll.addEventListener('scroll', this._onScroll = () => { this._scrollTop = scroll.scrollTop; this._renderWindow(); });
    window.addEventListener('resize', this._onResize = () => { this._recalcGrid(); this._renderWindow(); });

    await this.refresh();
    if (this._scrollTop) scroll.scrollTop = this._scrollTop;
  },

  unmount() {
    const scroll = this._container?.querySelector('#fc-scroll');
    if (scroll) this._scrollTop = scroll.scrollTop;
    if (scroll && this._onScroll) scroll.removeEventListener('scroll', this._onScroll);
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._container = null;
  },

  async refresh() {
    // Ícone colorido (sem foto) desenhado em SVG na hora — ver avatar.js.
    // Carregado uma vez por refresh, reusado de forma síncrona em todos os
    // cards (_cardHtml, chamado a cada redesenho da janela visível).
    this._iconState = await Avatar.loadIconState();
    this._all = await DB.getAllItems();
    this._all.sort((a, b) => (b.modificadoEm || '').localeCompare(a.modificadoEm || ''));
    // Conjunto de patrimônios duplicados (2+ itens) — mesmo conceito usado na
    // Tabela, na Busca, no mapa e no detalhe do item (DB.getDuplicatePatrimonios).
    // Faltava só aqui nos Flash Cards, que nunca mostravam o aviso "⚠️".
    this._dupSet = await DB.getDuplicatePatrimonios();
    this._applyFilter();
  },

  _applyFilter() {
    if (!this._query) {
      this._filtered = this._all;
    } else {
      const toks = this._query.split(/\s+/).filter(Boolean);
      this._filtered = this._all.filter((it) => {
        const hay = `${it.patrimonio} ${it.descricao} ${it.tipo} ${it.setor}`.toLowerCase();
        return toks.every((t) => hay.includes(t));
      });
    }
    this._recalcGrid();
    this._renderWindow();
  },

  /** Quantas colunas cabem (como o antigo auto-fill/minmax(150px,1fr) em CSS) e
   *  a altura de cada LINHA de cards — recalculado a cada resize/filtro, pois
   *  a virtualização é por linha (todos os cards de uma linha entram/saem
   *  juntos do DOM, já que têm a mesma posição vertical). */
  _recalcGrid() {
    const scroll = this._container?.querySelector('#fc-scroll');
    if (!scroll) return;
    const width = scroll.clientWidth || 320;
    this._cols = Math.max(1, Math.floor((width + this._gap) / (this._minColW + this._gap)));
    const colW = (width - this._gap * (this._cols - 1)) / this._cols;
    // altura estimada: thumb quadrada (aspect-ratio:1) + área de texto do corpo do card
    this._rowH = colW + 78 + this._gap;
  },

  _renderWindow() {
    if (!this._container) return;
    const scroll = this._container.querySelector('#fc-scroll');
    const spacer = this._container.querySelector('#fc-spacer');
    const empty = this._container.querySelector('#fc-empty');
    if (!scroll || !spacer) return;
    const list = this._filtered;

    if (list.length === 0) {
      spacer.style.height = '0px';
      spacer.innerHTML = '';
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');

    const totalRows = Math.ceil(list.length / this._cols);
    spacer.style.height = `${totalRows * this._rowH + this._padTop + this._padBottom}px`;

    const scrollTop = scroll.scrollTop;
    const viewH = scroll.clientHeight || 600;
    const firstRow = Math.max(0, Math.floor((scrollTop - this._padTop) / this._rowH) - 2);
    const lastRow = Math.min(totalRows - 1, Math.ceil((scrollTop - this._padTop + viewH) / this._rowH) + 2);

    let html = '';
    for (let r = firstRow; r <= lastRow; r++) {
      const start = r * this._cols;
      const rowItems = list.slice(start, start + this._cols);
      if (!rowItems.length) continue;
      html += `<div class="vgrid-row" style="top:${this._padTop + r * this._rowH}px; grid-template-columns: repeat(${this._cols}, 1fr)">`;
      rowItems.forEach((it) => { html += this._cardHtml(it); });
      html += `</div>`;
    }
    spacer.innerHTML = html;
    spacer.querySelectorAll('.flashcard').forEach((el) => {
      el.onclick = () => App.showItemDetail(el.dataset.id);
    });
  },

  _cardHtml(it) {
    const iconSvg = Avatar.itemIconSvg(it, this._iconState, { size: 96 });
    const duplicado = !!(it.patrimonio && this._dupSet && this._dupSet.has(it.patrimonio.trim()));
    return `
      <div class="flashcard${duplicado ? ' flashcard--dup' : ''}" data-id="${it.id}" title="${duplicado ? 'Patrimônio duplicado — também está em outro item. ' : ''}${it.origemSessaoLabel ? 'Cadastrado por: ' + Utils.escapeHtml(it.origemSessaoLabel) : ''}">
        <div class="thumb thumb-svg">${iconSvg}</div>
        ${duplicado ? '<span class="flashcard-dup-badge" title="Patrimônio duplicado">⚠️</span>' : ''}
        <div class="body">
          <div class="patrimonio">${duplicado ? '<span style="color:#c77dff">⚠️ </span>' : ''}${Utils.escapeHtml(it.patrimonio || '—')}</div>
          <div class="descricao">${Utils.escapeHtml(it.descricao || '(sem descrição)')}</div>
          <div class="meta"><span>${Utils.escapeHtml(it.tipo || '—')}</span><span>${Utils.escapeHtml(it.setor || '')}</span></div>
        </div>
      </div>`;
  },
};

window.FlashcardsView = FlashcardsView;
