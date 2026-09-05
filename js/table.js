/**
 * table.js — Visualização em tabela, virtualizada para escalar a milhares de itens.
 * Só renderiza as linhas visíveis (janela de scroll), mantendo em memória apenas
 * um resumo leve de cada item (sem a foto original, só a miniatura).
 */

const ROW_H = 46;
// Chave de sessão do "setor da sessão" — MESMA chave usada em Capturar (ver
// capture.js _promptSessionSetor/_sessionSetor) — os dois botões (lá e aqui)
// leem/gravam o mesmo valor, então trocar num lugar já reflete no outro na
// próxima vez que a tela é aberta (cada um lê a chave de novo ao montar).
const SESSAO_SETOR_KEY = 'catalogo_setor_sessao';

// Colunas da tabela (fora a de ícone/checkbox, sempre fixa e fora de tudo
// isso) — chave curta (usada em `_colOrder`/`_colVisible`/`_colWidths`/
// `_colFilters` e no `data-col` do DOM) → campo do item / rótulo exibido.
// Pedido do usuário (28/08/2026, rodada 18): colunas agora podem ser
// reordenadas (arrastar título, ver _attachColDrag) e mostradas/escondidas
// (clique direito nos títulos, ver _openColumnVisibilityMenu) — "Patrimônio"
// é a única que nunca pode ficar escondida.
// Pedido do usuário (28/08/2026): "os outros campos dos patrimônios devem
// poder ser marcados para aparecer como colunas" — antes só existiam estas 4
// colunas (nem escondidas, nem novas podiam ser adicionadas pelo menu de
// clique direito, só mostradas/escondidas ENTRE elas). Agora o menu de
// clique direito lista TAMBÉM os outros campos do item (já presentes no
// resumo leve devolvido por DB.getAllSummaries — ver comentário lá): mapa
// (nome resolvido de `ambienteId`, ver `_mapasById`), cadastrado por, e as 3
// datas (criado/modificado/última consulta). Todos ficam DISPONÍVEIS pra
// marcar, mas só os 4 originais vêm visíveis por padrão (ver
// DEFAULT_VISIBLE_COLS/_ensureColOrder) — o usuário liga o resto conforme
// quiser.
// Pedido do usuário (28/08/2026): "O campo código de barras não deve mais
// existir" — a coluna "Cód. barras" (chave `cod`, adicionada nesta mesma
// rodada) foi REMOVIDA de novo, junto com o campo `patrimonioCodigoBarras`
// (ver db.js/app.js/utils.js).
const COL_FIELD = {
  patr: 'patrimonio', desc: 'descricao', tipo: 'tipo', setor: 'setor',
  mapa: 'ambienteId', cadastradoPor: 'origemSessaoLabel',
  criado: 'criadoOriginalmenteEm', modificado: 'modificadoEm', consulta: 'ultimaConsultaEm',
};
const COL_LABEL = {
  patr: 'Patrimônio', desc: 'Descrição', tipo: 'Tipo', setor: 'Setor',
  mapa: 'Mapa', cadastradoPor: 'Cadastrado por',
  criado: 'Criado', modificado: 'Modificado', consulta: 'Última consulta',
};
const COL_KEYS = ['patr', 'desc', 'tipo', 'setor', 'mapa', 'cadastradoPor', 'criado', 'modificado', 'consulta'];
const COL_ALWAYS_VISIBLE = 'patr';
const DEFAULT_VISIBLE_COLS = new Set(['patr', 'desc', 'tipo', 'setor']);
// Colunas de DATA — pedido do usuário (28/08/2026): "Se for algum campo de
// data, então um calendário para selecionar o período" — em vez do menu de
// valores distintos (que não faz sentido pra um timestamp único por item),
// o botão "▾" dessas colunas abre um filtro de PERÍODO (data inicial/final,
// ver _openColumnValuesMenu/_applyFilter).
const COL_DATE = new Set(['criado', 'modificado', 'consulta']);

const TableView = {
  _data: [],
  _filtered: [],
  _container: null,
  // Pedido do usuário (27/08/2026): o campo "Inserido em" (criadoEm) foi
  // removido da UI — "Criado originalmente em" (criadoOriginalmenteEm) já
  // cumpre esse papel (e é mais correto: não muda ao reimportar/sincronizar
  // num aparelho novo). Ordenação padrão trocada para ele.
  _sortBy: 'criadoOriginalmenteEm',
  _query: '',
  _selectMode: false,
  _selected: new Set(),
  _scrollTop: 0,
  // Larguras (px) das colunas redimensináveis (ver _attachColResize) — a de
  // ícone/checkbox fica sempre fixa em 44px, de fora daqui. `null` até o
  // primeiro mount(), quando é calculada a partir do espaço disponível;
  // depois disso só muda se o usuário arrastar uma borda — como os demais
  // controles de tela deste app, é só em memória: reseta pro cálculo
  // automático de novo ao recarregar a página.
  _colWidths: null,
  // Ordem/visibilidade/filtros de coluna (pedido do usuário, 28/08/2026,
  // rodada 18) — `null` até _ensureColOrder() rodar na primeira montagem
  // (mesmo padrão de `_colWidths` acima: só em memória, reseta ao recarregar).
  //  - `_colOrder`: array com as chaves de COL_KEYS na ordem de exibição
  //    (arrastável, ver _attachColDrag).
  //  - `_colVisible`: { chave: bool } — quais colunas aparecem (clique
  //    direito nos títulos, ver _openColumnVisibilityMenu); `patr` é sempre
  //    forçada a `true`, sem opção de desmarcar.
  //  - `_colFilters`: { chave: Set(valores permitidos) } — filtro por coluna
  //    (botão "▾" no título, ver _openColumnValuesMenu); ausente/Set vazio =
  //    sem filtro nessa coluna.
  _colOrder: null,
  _colVisible: null,
  _colFilters: null,

  async mount(container) {
    this._container = container;
    this._selectMode = false;
    this._selected = new Set();
    const setorAtual = sessionStorage.getItem(SESSAO_SETOR_KEY) || '';
    container.innerHTML = `
      <div class="vscroll-view-wrap">
        <div class="table-toolbar">
          <input type="search" id="tbl-search" placeholder="Filtrar por patrimônio, descrição, tipo, setor…" title="Filtrar os itens listados" value="${Utils.escapeHtml(this._query)}">
          <select id="tbl-sort" title="Ordenar a lista por este critério">
            <option value="criadoOriginalmenteEm">Criado ↓</option>
            <option value="modificadoEm">Modificado ↓</option>
            <option value="ultimaConsultaEm">Última consulta ↓</option>
            <option value="patrimonio">Patrimônio A-Z</option>
          </select>
          <button class="icon-btn" id="tbl-select-mode" title="Selecionar vários itens de uma vez, para excluir em lote">☑️ Selecionar</button>
          <button class="icon-btn" id="tbl-add" title="Cadastrar um novo item manualmente">+ Novo</button>
          <button class="icon-btn" id="tbl-setor" title="Setor usado automaticamente em todos os itens cadastrados nesta sessão (o mesmo botão de Capturar)">🏷️ ${setorAtual ? Utils.escapeHtml(setorAtual) : 'Definir setor da sessão'}</button>
        </div>
        <div class="table-selectbar hidden" id="tbl-selectbar">
          <span id="tbl-select-count">0 selecionado(s)</span>
          <button class="btn secondary sm" id="tbl-select-all" title="Selecionar todos os itens filtrados/visíveis na lista atual">Marcar todos os filtrados</button>
          <button class="btn secondary sm" id="tbl-select-none" title="Desmarcar todos">Desmarcar todos</button>
          <button class="btn danger sm" id="tbl-select-delete" title="Excluir definitivamente todos os itens selecionados">🗑️ Excluir selecionados</button>
          <button class="btn secondary sm" id="tbl-select-cancel" title="Sair do modo de seleção">Cancelar</button>
        </div>
        <div class="vtable" id="tbl-scroll">
          <div class="vtable-head" id="tbl-head"></div>
          <div class="vtable-spacer" id="tbl-spacer"></div>
        </div>
      </div>
    `;
    container.querySelector('#tbl-add').onclick = () => App.openItemForm();
    container.querySelector('#tbl-setor').onclick = () => this._promptSessionSetor();
    container.querySelector('#tbl-search').oninput = Utils.debounce((e) => {
      this._query = e.target.value;
      this._applyFilter();
    }, 200);
    const sortSel = container.querySelector('#tbl-sort');
    sortSel.value = this._sortBy;
    sortSel.onchange = (e) => {
      this._sortBy = e.target.value;
      this._load();
    };
    container.querySelector('#tbl-select-mode').onclick = () => this._setSelectMode(true);
    container.querySelector('#tbl-select-cancel').onclick = () => this._setSelectMode(false);
    container.querySelector('#tbl-select-none').onclick = () => { this._selected.clear(); this._updateSelectBar(); this._renderWindow(); };
    container.querySelector('#tbl-select-all').onclick = () => {
      this._filtered.forEach((it) => this._selected.add(it.id));
      this._updateSelectBar();
      this._renderWindow();
    };
    container.querySelector('#tbl-select-delete').onclick = () => this._deleteSelected();
    const scroll = container.querySelector('#tbl-scroll');
    scroll.addEventListener('scroll', () => { this._scrollTop = scroll.scrollTop; this._renderWindow(); });
    window.addEventListener('resize', this._onResize = () => this._renderWindow());

    this._ensureColOrder();
    this._ensureColWidths();
    this._renderHead();
    this._applyColWidths();

    await this._load();
    if (this._scrollTop) scroll.scrollTop = this._scrollTop;
  },

  /** Setor usado automaticamente em todos os itens cadastrados nesta sessão
   *  — MESMO recurso/mesma chave de sessionStorage do botão "🏷️" de
   *  Capturar (ver capture.js _promptSessionSetor), só que também
   *  disponível aqui na Tabela, como pedido: ela não CADASTRA itens, mas
   *  serve pra deixar o setor já definido antes de ir capturar, ou pra
   *  trocá-lo no meio de uma sessão sem precisar abrir a câmera. */
  _promptSessionSetor() {
    const atual = prompt('Setor/local para os itens desta sessão de captura (fica valendo até você trocar):', sessionStorage.getItem(SESSAO_SETOR_KEY) || '');
    if (atual === null) return;
    const setor = atual.trim();
    sessionStorage.setItem(SESSAO_SETOR_KEY, setor);
    const btn = this._container?.querySelector('#tbl-setor');
    if (btn) btn.textContent = '🏷️ ' + (setor || 'Definir setor da sessão');
    if (setor) Utils.toast(`Setor da sessão: ${setor}`, { type: 'ok' });
  },

  /** Garante `_colOrder`/`_colVisible`/`_colFilters` (uma vez só, na
   *  primeira montagem — depois disso só mudam por ação do usuário: arrastar
   *  título reordena `_colOrder`, clique direito mexe em `_colVisible`,
   *  botão "▾" mexe em `_colFilters`). "Patrimônio" é sempre forçada visível
   *  aqui também, por segurança, mesmo que algo externo mexa em
   *  `_colVisible` diretamente. */
  _ensureColOrder() {
    if (!this._colOrder) this._colOrder = [...COL_KEYS];
    // Pedido do usuário (28/08/2026): as colunas NOVAS (código de barras,
    // mapa, cadastrado por, datas) começam ESCONDIDAS — só as 4 de sempre
    // vêm visíveis por padrão; o resto fica disponível pra marcar no menu
    // de clique direito (ver DEFAULT_VISIBLE_COLS acima).
    if (!this._colVisible) this._colVisible = Object.fromEntries(COL_KEYS.map((c) => [c, DEFAULT_VISIBLE_COLS.has(c)]));
    if (!this._colFilters) this._colFilters = {};
    this._colVisible[COL_ALWAYS_VISIBLE] = true;
  },

  /** (Re)constrói o cabeçalho (`#tbl-head`) a partir de `_colOrder`/
   *  `_colVisible` — chamada na montagem e sempre que a ordem/visibilidade
   *  muda (arrastar título, marcar/desmarcar no menu de clique direito).
   *  Cada título agora tem, na mesma célula (pedido do usuário, 28/08/2026,
   *  rodada 18): o nome da coluna + um botão "▾" à direita (abre
   *  _openColumnValuesMenu, opções de acordo com os valores encontrados
   *  nessa coluna) + a alça de redimensionar de sempre. Clique direito em
   *  qualquer título abre _openColumnVisibilityMenu (marcar/desmarcar quais
   *  colunas aparecem). Arrastar um título reordena via _attachColDrag. */
  _renderHead() {
    const head = this._container?.querySelector('#tbl-head');
    if (!head) return;
    const cols = this._colOrder.filter((c) => this._colVisible[c]);
    head.innerHTML = '<span></span>' + cols.map((col) => `
      <span class="vtable-th" data-col="${col}" title="Arraste para reordenar a coluna">
        <span class="vtable-th-label">${Utils.escapeHtml(COL_LABEL[col] || col)}</span>
        <button type="button" class="vtable-th-menu-btn" data-col="${col}" title="Opções desta coluna">▾</button>
        <span class="vtable-resize-handle" data-col="${col}" title="Arrastar para redimensionar"></span>
      </span>`).join('');

    head.oncontextmenu = (e) => this._openColumnVisibilityMenu(e);
    head.querySelectorAll('.vtable-th-menu-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openColumnValuesMenu(btn.dataset.col, btn);
      });
    });

    this._attachColResize();
    this._attachColDrag();
  },

  /** Arrastar-para-reordenar os títulos das colunas — pedido do usuário
   *  (28/08/2026, rodada 18): "Ao clicar e arrastar um título, deve ser
   *  possível trocá-lo de posição. Use o flip, como nos botões do 'Ver
   *  lista simples'." Usa o módulo compartilhado js/flip.js
   *  (`Flip.makeSortable`, extraído de verlistasimples.js — ver comentários
   *  detalhados lá) em vez de reimplementar a técnica aqui. `ignoreSelector`
   *  cobre a alça de redimensionar e o botão "▾": nenhum dos dois deve
   *  iniciar um arraste de reordenar coluna. `axis:'x'` porque o cabeçalho é
   *  uma única linha horizontal (nunca "quebra" pra outra linha). */
  _attachColDrag() {
    const head = this._container?.querySelector('#tbl-head');
    if (!head || typeof Flip === 'undefined') return;
    const sortable = Flip.makeSortable(head, {
      itemSelector: '.vtable-th',
      ignoreSelector: '.vtable-resize-handle, .vtable-th-menu-btn',
      draggingClass: 'vtable-th-dragging',
      axis: 'x',
      onDrop: (orderedEls) => {
        const novaOrdemVisivel = orderedEls.map((el) => el.dataset.col).filter(Boolean);
        // As colunas ESCONDIDAS no momento não têm `<span>` no cabeçalho (não
        // entram em `orderedEls`) — preserva a posição relativa delas dentro
        // de `_colOrder` (concatenadas ao final) em vez de perdê-las.
        const escondidas = this._colOrder.filter((c) => !this._colVisible[c]);
        this._colOrder = [...novaOrdemVisivel, ...escondidas];
        this._applyColWidths();
        this._renderWindow();
      },
    });
    head.querySelectorAll('.vtable-th').forEach((th) => sortable.attach(th));
  },

  /** Menu (botão "▾" no título de UMA coluna) — pra colunas normais, os
   *  valores encontrados nas linhas dessa coluna (calculados a partir de
   *  TODOS os itens carregados, `_data`, não só os já filtrados — senão um
   *  valor desmarcado sumiria da própria lista de opções na vez seguinte) —
   *  marcar/desmarcar filtra a tabela por essa coluna (ver _applyFilter).
   *  Pedido do usuário (28/08/2026, rodada 18): "Ao ser clicado, deve abrir
   *  opções de acordo com o que tem nas linhas desta coluna." Pedido do
   *  usuário (28/08/2026, rodada seguinte): "Se for algum campo de data,
   *  então um calendário para selecionar o período" — colunas em COL_DATE
   *  abrem `_openColumnDateMenu` (período) em vez desta lista de valores. */
  _openColumnValuesMenu(col, anchorEl) {
    document.querySelectorAll('.vtable-valmenu, .vtable-colmenu').forEach((m) => m.remove());
    const field = COL_FIELD[col];
    if (!field) return;
    if (COL_DATE.has(col)) { this._openColumnDateMenu(col, anchorEl); return; }
    const valuesSet = new Set();
    (this._data || []).forEach((it) => { valuesSet.add(this._displayValue(col, it) || '(vazio)'); });
    const values = [...valuesSet].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const active = this._colFilters[col]; // Set ou undefined (undefined = sem filtro, tudo marcado)

    const menu = document.createElement('div');
    menu.className = 'vtable-valmenu';
    menu.innerHTML = `
      <div class="vtable-valmenu-title">${Utils.escapeHtml(COL_LABEL[col] || col)}</div>
      <div class="vtable-valmenu-actions">
        <button type="button" data-act="all">Marcar todos</button>
        <button type="button" data-act="none">Limpar</button>
      </div>
      <div class="vtable-valmenu-list">
        ${values.length ? values.map((v) => `
          <label><input type="checkbox" data-val="${Utils.escapeHtml(v)}" ${(!active || active.has(v)) ? 'checked' : ''}> ${Utils.escapeHtml(v)}</label>
        `).join('') : '<div style="padding:6px; color:var(--text-dim)">Nenhum valor ainda.</div>'}
      </div>`;
    document.body.appendChild(menu);
    const r = anchorEl.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)}px`;

    const applyFromDom = () => {
      const boxes = [...menu.querySelectorAll('input[type="checkbox"]')];
      const checked = boxes.filter((b) => b.checked).map((b) => b.dataset.val);
      if (checked.length === values.length) delete this._colFilters[col]; // tudo marcado = sem filtro
      else this._colFilters[col] = new Set(checked);
      this._applyFilter();
    };
    menu.querySelectorAll('input[type="checkbox"]').forEach((b) => { b.onchange = applyFromDom; });
    menu.querySelector('[data-act="all"]')?.addEventListener('click', () => {
      menu.querySelectorAll('input[type="checkbox"]').forEach((b) => { b.checked = true; });
      applyFromDom();
    });
    menu.querySelector('[data-act="none"]')?.addEventListener('click', () => {
      menu.querySelectorAll('input[type="checkbox"]').forEach((b) => { b.checked = false; });
      applyFromDom();
    });

    const closeOnOutside = (e) => {
      if (menu.contains(e.target) || e.target === anchorEl) return;
      menu.remove();
      document.removeEventListener('mousedown', closeOnOutside, true);
    };
    setTimeout(() => document.addEventListener('mousedown', closeOnOutside, true), 0);
  },

  /** Menu de PERÍODO (calendário De/Até) pro botão "▾" de uma coluna de
   *  DATA — pedido do usuário (28/08/2026): "Se for algum campo de data,
   *  então um calendário para selecionar o período." Dois `<input
   *  type="date">` nativos (abrem o seletor de calendário do próprio
   *  navegador/celular, sem reinventar um) — item com data VAZIA nunca
   *  aparece quando o filtro está ativo (nenhum dos dois campos vazio),
   *  igual a "sem valor" nos filtros de coluna normais (ver _applyFilter). */
  _openColumnDateMenu(col, anchorEl) {
    const atual = this._colFilters[col] || {};
    const menu = document.createElement('div');
    menu.className = 'vtable-valmenu';
    menu.innerHTML = `
      <div class="vtable-valmenu-title">${Utils.escapeHtml(COL_LABEL[col] || col)} — período</div>
      <div style="display:flex; flex-direction:column; gap:8px; padding:4px 2px">
        <label style="display:flex; flex-direction:column; gap:2px; font-size:11px; color:var(--text-dim)">De
          <input type="date" id="tbl-datefilter-from" value="${Utils.escapeHtml(atual.from || '')}">
        </label>
        <label style="display:flex; flex-direction:column; gap:2px; font-size:11px; color:var(--text-dim)">Até
          <input type="date" id="tbl-datefilter-to" value="${Utils.escapeHtml(atual.to || '')}">
        </label>
      </div>
      <div class="vtable-valmenu-actions">
        <button type="button" data-act="all">Limpar período</button>
      </div>`;
    document.body.appendChild(menu);
    const r = anchorEl.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)}px`;

    const fromEl = menu.querySelector('#tbl-datefilter-from');
    const toEl = menu.querySelector('#tbl-datefilter-to');
    const applyFromDom = () => {
      const from = fromEl.value || '';
      const to = toEl.value || '';
      if (!from && !to) delete this._colFilters[col];
      else this._colFilters[col] = { from, to };
      this._applyFilter();
    };
    fromEl.onchange = applyFromDom;
    toEl.onchange = applyFromDom;
    menu.querySelector('[data-act="all"]')?.addEventListener('click', () => {
      fromEl.value = ''; toEl.value = '';
      applyFromDom();
    });

    const closeOnOutside = (e) => {
      if (menu.contains(e.target) || e.target === anchorEl) return;
      menu.remove();
      document.removeEventListener('mousedown', closeOnOutside, true);
    };
    setTimeout(() => document.addEventListener('mousedown', closeOnOutside, true), 0);
  },

  /** Menu de clique direito nos títulos — marcar/desmarcar quais colunas
   *  aparecem na tabela. "Patrimônio" fica sempre ativa, sem opção de
   *  desmarcar (pedido do usuário, 28/08/2026, rodada 18: "A coluna
   *  patrimônio deve ficar sempre ativa — não deve haver opção para
   *  desmarcá-la."). */
  _openColumnVisibilityMenu(e) {
    e.preventDefault();
    document.querySelectorAll('.vtable-valmenu, .vtable-colmenu').forEach((m) => m.remove());
    const menu = document.createElement('div');
    menu.className = 'vtable-colmenu';
    menu.innerHTML = `
      <div class="vtable-colmenu-title">Colunas visíveis</div>
      ${COL_KEYS.map((col) => {
        const travada = col === COL_ALWAYS_VISIBLE;
        return `
        <label class="${travada ? 'disabled' : ''}" title="${travada ? 'Esta coluna não pode ser escondida' : ''}">
          <input type="checkbox" data-col="${col}" ${this._colVisible[col] ? 'checked' : ''} ${travada ? 'disabled' : ''}>
          ${Utils.escapeHtml(COL_LABEL[col] || col)}
        </label>`;
      }).join('')}`;
    document.body.appendChild(menu);
    menu.style.left = `${Math.max(4, Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(4, Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8))}px`;

    menu.querySelectorAll('input[type="checkbox"]').forEach((b) => {
      b.onchange = () => {
        const col = b.dataset.col;
        if (col === COL_ALWAYS_VISIBLE) { b.checked = true; return; }
        this._colVisible[col] = b.checked;
        this._renderHead();
        this._applyColWidths();
        this._renderWindow();
      };
    });

    const closeOnOutside = (ev) => {
      if (menu.contains(ev.target)) return;
      menu.remove();
      document.removeEventListener('mousedown', closeOnOutside, true);
    };
    setTimeout(() => document.addEventListener('mousedown', closeOnOutside, true), 0);
  },

  /** Calcula as larguras iniciais das colunas redimensináveis a partir do
   *  espaço disponível na primeira montagem — depois disso, `_colWidths`
   *  já existe e fica só do jeito que o usuário deixou (ver
   *  _attachColResize), mesmo trocando de tela e voltando. */
  _ensureColWidths() {
    if (this._colWidths) return;
    // Pedido do usuário (27/08/2026): "Descrição" ficava GIGANTE por padrão
    // (antes, sempre consumia TODO o espaço sobrando do container) — agora
    // tem um teto (DESC_DEFAULT) e só cresce até ali, largura "o suficiente"
    // pra maioria das descrições sem dominar a tela toda. "Setor" também
    // aumentou (110 → 150) por ser curto demais por padrão. Ambas continuam
    // livremente redimensionáveis à mão depois (ver _attachColResize) — isto
    // só afeta o valor INICIAL, na primeira montagem.
    const ICON_W = 44, GAP = 8, ROW_PAD = 24, PATR_W = 110, TIPO_W = 100, SETOR_W = 150, DESC_MIN = 180, DESC_DEFAULT = 240;
    const avail = this._container?.clientWidth || 900;
    const descFill = avail - ICON_W - PATR_W - TIPO_W - SETOR_W - GAP * 4 - ROW_PAD;
    const desc = Math.max(DESC_MIN, Math.min(DESC_DEFAULT, descFill));
    // Pedido do usuário (28/08/2026): larguras iniciais das colunas NOVAS
    // (começam escondidas, ver DEFAULT_VISIBLE_COLS, mas precisam de um
    // valor sensato já pronto pra quando o usuário marcar uma delas no menu
    // de clique direito — sem isto, `_colWidths[col]` ficava `undefined` e
    // quebrava o cálculo de `--tbl-cols`/o arraste de redimensionar).
    this._colWidths = {
      patr: PATR_W, desc, tipo: TIPO_W, setor: SETOR_W,
      mapa: 150, cadastradoPor: 150,
      criado: 150, modificado: 150, consulta: 150,
    };
  },

  /** Aplica `_colWidths` de fato — uma variável CSS num ancestral comum do
   *  cabeçalho (`.vtable-head`) e de CADA linha (`.vtable-row`), pra mudar
   *  as duas de uma vez só (inclusive linhas ainda nem desenhadas — a
   *  virtualização em _renderWindow() reconstrói o HTML das linhas visíveis
   *  toda hora, então elas já nascem lendo o valor atual da variável). */
  _applyColWidths() {
    const w = this._colWidths;
    if (!w || !this._container) return;
    // Segue `_colOrder`/`_colVisible` (pedido do usuário, 28/08/2026, rodada
    // 18: colunas reordenáveis/escondíveis) — só entram na lista de larguras
    // as colunas VISÍVEIS, na ordem atual; a de ícone/checkbox (44px) fica
    // sempre fixa, fora de `_colOrder`.
    const cols = (this._colOrder || COL_KEYS).filter((c) => !this._colVisible || this._colVisible[c]);
    const lista = cols.map((c) => `${w[c]}px`).join(' ');
    this._container.style.setProperty('--tbl-cols', `44px ${lista}`);
  },

  /** Liga o arrastar-pra-redimensionar de cada alça no cabeçalho (ver
   *  .vtable-resize-handle no CSS) — usa Pointer Events + setPointerCapture
   *  pra continuar seguindo o arrasto mesmo se o cursor sair da faixa fina
   *  da alça no meio do gesto. */
  _attachColResize() {
    const MIN_W = { patr: 60, desc: 140, tipo: 60, setor: 60, mapa: 60, cadastradoPor: 60, criado: 90, modificado: 90, consulta: 90 };
    this._container?.querySelectorAll('.vtable-resize-handle').forEach((handle) => {
      const col = handle.dataset.col;
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = this._colWidths[col];
        handle.classList.add('resizing');
        handle.setPointerCapture(e.pointerId);
        const onMove = (ev) => {
          const delta = ev.clientX - startX;
          this._colWidths[col] = Math.max(MIN_W[col] || 50, Math.round(startW + delta));
          this._applyColWidths();
        };
        const onUp = () => {
          handle.classList.remove('resizing');
          handle.releasePointerCapture(e.pointerId);
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
      });
      handle.addEventListener('click', (e) => e.stopPropagation());
      // Pedido do usuário (27/08/2026): "ao dar dois cliques em cima da
      // divisória de colunas, ela deve se ajustar de modo que todas as
      // linhas fiquem visíveis (apenas a largura o suficiente para isso)"
      // — mesmo gesto de "autoajustar largura da coluna" já conhecido de
      // planilhas (Excel/Sheets).
      handle.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._autoFitColumn(col);
      });
    });
  },

  /** "Autoajustar" (duplo clique na divisória, ver _attachColResize acima) —
   *  mede o texto de CADA item já carregado (não só os visíveis/filtrados no
   *  momento, pra continuar cabendo mesmo se o filtro mudar depois) com a
   *  mesma fonte usada nas linhas de verdade, e usa a maior largura
   *  encontrada (incluindo o título da própria coluna) como a nova largura —
   *  "a largura o suficiente" pedida, nem mais nem menos. */
  _autoFitColumn(col) {
    // Pedido do usuário (27/08/2026): "a largura suficiente deve ficar mais
    // justa ainda" — piso bem menor que o da alça de ARRASTAR à mão (aquele,
    // em MIN_W de _attachColResize, existe pra nunca deixar a pessoa
    // encolher demais NA MÃO); aqui o próprio texto (maior valor + título da
    // coluna, já medidos abaixo) já garante um mínimo sensato — este piso só
    // evita ficar menor que isso em colunas com dado vazio/curtíssimo.
    const AUTOFIT_MIN_W = { patr: 40, desc: 50, tipo: 40, setor: 40, mapa: 40, cadastradoPor: 40, criado: 70, modificado: 70, consulta: 70 };
    const field = COL_FIELD[col];
    if (!field || !this._colWidths) return;
    const canvas = this._measureCanvas || (this._measureCanvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    const sampleRow = this._container?.querySelector('.vtable-row');
    ctx.font = sampleRow ? getComputedStyle(sampleRow).font : '13px sans-serif';
    let max = ctx.measureText(COL_LABEL[col] || '').width;
    // Mede o texto FORMATADO (`_displayValue` — nome do mapa, data no
    // formato pt-BR etc.), não o valor bruto do campo (ex.: um ISO de data
    // é bem mais longo que "28/08/2026 14:23:10", deixaria a coluna maior
    // que o necessário).
    (this._data || []).forEach((it) => {
      const w = ctx.measureText(this._displayValue(col, it)).width;
      if (w > max) max = w;
    });
    const PADDING = 14; // respiro mínimo nas bordas da célula — só o suficiente pra não cortar a letra
    this._colWidths[col] = Math.max(AUTOFIT_MIN_W[col] || 30, Math.round(max + PADDING));
    this._applyColWidths();
  },

  unmount() {
    const scroll = this._container?.querySelector('#tbl-scroll');
    if (scroll) this._scrollTop = scroll.scrollTop;
    window.removeEventListener('resize', this._onResize);
    this._container = null;
  },

  async refresh() { await this._load(); },

  _setSelectMode(on) {
    this._selectMode = on;
    if (!on) this._selected.clear();
    const bar = this._container?.querySelector('#tbl-selectbar');
    const btn = this._container?.querySelector('#tbl-select-mode');
    if (bar) bar.classList.toggle('hidden', !on);
    if (btn) btn.textContent = on ? '☑️ Selecionando…' : '☑️ Selecionar';
    this._updateSelectBar();
    this._renderWindow();
  },

  _updateSelectBar() {
    const el = this._container?.querySelector('#tbl-select-count');
    if (el) el.textContent = `${this._selected.size} selecionado(s)`;
  },

  async _deleteSelected() {
    if (this._selected.size === 0) { Utils.toast('Nenhum item selecionado.', { type: 'warn' }); return; }
    const qtd = this._selected.size;
    if (!confirm(`Excluir definitivamente ${qtd} item(ns) selecionado(s)? (dá para desfazer logo em seguida, com Ctrl+Z ou pelo botão ↶)`)) return;
    const btn = this._container?.querySelector('#tbl-select-delete');
    const original = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Excluindo…'; }
    let ok = 0, falhas = 0;
    const excluidos = []; // snapshots completos, pra permitir desfazer o lote inteiro de uma vez
    for (const id of Array.from(this._selected)) {
      try {
        const full = await DB.getItem(id); // a tabela só tem um resumo leve — precisa do registro completo pra restaurar
        await DB.deleteItem(id);
        LocalBackup.removeItem(id);
        if (full) excluidos.push(full);
        ok++;
      } catch (e) {
        falhas++;
        console.warn('Falha ao excluir item', id, e);
      }
    }
    if (excluidos.length) {
      History.push({
        label: `excluir ${excluidos.length} item(ns)`,
        undo: async () => { for (const it of excluidos) { await DB.putItemRaw(it); LocalBackup.pushItem(it); } },
        redo: async () => { for (const it of excluidos) { await DB.deleteItem(it.id); LocalBackup.removeItem(it.id); } },
      });
    }
    EventLog.log(`Exclusão em lote: ${ok} item(ns) excluído(s)${falhas ? `, ${falhas} falha(s)` : ''}.`, { tipo: falhas ? 'erro' : 'aviso' });
    Utils.toast(falhas ? `${ok} excluído(s), ${falhas} falharam.` : `${ok} item(ns) excluído(s) ✓`, { type: falhas ? 'danger' : 'warn', duration: 4500 });
    if (btn) { btn.disabled = false; btn.textContent = original; }
    this._setSelectMode(false);
    await this._load();
  },

  async _load() {
    // Ícone colorido (sem foto) é desenhado em SVG na hora — ver avatar.js.
    // Carrega a configuração de ícones UMA VEZ aqui (é assíncrono só por
    // isso), reusada de forma síncrona a cada redesenho da janela visível
    // (_renderWindow, chamado a cada scroll) — nada de ida ao banco por linha.
    this._iconState = await Avatar.loadIconState();
    // Pedido do usuário (28/08/2026): NOVA coluna "Mapa" — `ambienteId` é só
    // um id interno, ilegível pra pessoa; carrega o nome de cada mapa UMA
    // VEZ aqui (mesmo padrão do iconState acima) pra `_displayValue`/
    // `_cellHtml` resolverem sem ida ao banco por linha.
    const maps = await DB.getAllMaps();
    this._mapasById = new Map(maps.map((m) => [m.id, m.nome || 'Ambiente']));
    const all = await DB.getAllSummaries();
    all.sort((a, b) => {
      if (this._sortBy === 'patrimonio') return (a.patrimonio || '').localeCompare(b.patrimonio || '');
      return (b[this._sortBy] || '').localeCompare(a[this._sortBy] || '');
    });
    this._data = all;
    // Conjunto de patrimônios duplicados (2+ itens) calculado a partir do
    // mesmo `all` já carregado — evita uma segunda varredura do banco (ver
    // DB.getDuplicatePatrimonios, que faz a mesma conta a partir do zero).
    const contagem = new Map();
    for (const it of all) {
      const p = (it.patrimonio || '').trim();
      if (p) contagem.set(p, (contagem.get(p) || 0) + 1);
    }
    this._dupSet = new Set([...contagem].filter(([, n]) => n >= 2).map(([p]) => p));
    this._applyFilter();
  },

  _applyFilter() {
    const q = this._query.trim().toLowerCase();
    let base = this._data;
    if (q) {
      const toks = q.split(/\s+/).filter(Boolean);
      base = base.filter((it) => {
        const hay = `${it.patrimonio} ${it.descricao} ${it.tipo} ${it.setor}`.toLowerCase();
        return toks.every((t) => hay.includes(t));
      });
    }
    // Filtros por coluna (botão "▾" no título, ver _openColumnValuesMenu) —
    // pedido do usuário (28/08/2026, rodada 18). Combinam com a busca de
    // texto acima (E lógico entre todos os filtros ativos). Colunas de DATA
    // (ver COL_DATE) guardam `{from, to}` (período) em vez de um Set de
    // valores marcados — pedido do usuário (28/08/2026): "Se for algum campo
    // de data, então um calendário para selecionar o período."
    for (const col of Object.keys(this._colFilters || {})) {
      const active = this._colFilters[col];
      if (!active) continue;
      const field = COL_FIELD[col];
      if (!field) continue;
      if (COL_DATE.has(col)) {
        const { from, to } = active;
        if (!from && !to) continue;
        base = base.filter((it) => {
          const v = it[field];
          if (!v) return false; // sem data não entra num filtro de período ativo
          const dia = String(v).slice(0, 10); // 'YYYY-MM-DD' — compara só o dia, ignora hora
          if (from && dia < from) return false;
          if (to && dia > to) return false;
          return true;
        });
        continue;
      }
      if (!active.size) continue;
      base = base.filter((it) => active.has(this._displayValue(col, it) || '(vazio)'));
    }
    this._filtered = base;
    const spacer = this._container?.querySelector('#tbl-spacer');
    if (spacer) spacer.style.height = `${this._filtered.length * ROW_H}px`;
    this._renderWindow();
  },

  /** Valor de EXIBIÇÃO (texto puro, sem HTML) de uma coluna pra um item —
   *  usado tanto por `_cellHtml` quanto pela enumeração de valores do menu
   *  "▾" (_openColumnValuesMenu) e pelo autoajuste de largura
   *  (_autoFitColumn), pra todos concordarem no mesmo texto. Pedido do
   *  usuário (28/08/2026): NOVAS colunas (código de barras/mapa/cadastrado
   *  por/datas) — "mapa" resolve `ambienteId` (id interno, ilegível) pro
   *  NOME do mapa via `_mapasById` (carregado em _load); datas usam
   *  `Utils.formatDateTime` (mesmo formato usado no resto do app). */
  _displayValue(col, it) {
    const field = COL_FIELD[col];
    if (!field) return '';
    if (col === 'mapa') {
      if (!it.ambienteId) return '';
      return this._mapasById?.get(it.ambienteId) || '(mapa removido)';
    }
    if (COL_DATE.has(col)) return Utils.formatDateTime(it[field]);
    return (it[field] || '').toString().trim();
  },

  /** Célula de uma linha, dado o item e a chave da coluna — usada por
   *  _renderWindow para montar as linhas na ordem/visibilidade atuais de
   *  `_colOrder`/`_colVisible` (pedido do usuário, 28/08/2026, rodada 18:
   *  colunas reordenáveis/escondíveis — o conteúdo de cada coluna era antes
   *  embutido direto no template da linha, em ordem fixa). Rodada seguinte
   *  (mesmo dia): colunas novas — código de barras/mapa/cadastrado por/datas
   *  — todas via `_displayValue` (texto pronto), célula genérica igual à
   *  de "Setor". */
  _cellHtml(col, it, duplicado) {
    switch (col) {
      case 'patr':
        return `<span class="cell-clip" style="font-family:monospace" title="${duplicado ? 'Patrimônio duplicado — também está em outro item' : ''}">${duplicado ? '<span style="color:#c77dff">⚠️ </span>' : ''}${Utils.escapeHtml(it.patrimonio || '—')}</span>`;
      case 'desc':
        return `<span class="cell-clip">${Utils.escapeHtml(it.descricao || '(sem descrição)')}</span>`;
      case 'tipo':
        return `<span class="cell-clip"><span class="badge">${Utils.escapeHtml(it.tipo || '—')}</span></span>`;
      case 'setor':
        return `<span class="cell-clip">${Utils.escapeHtml(it.setor || '—')}</span>`;
      case 'mapa':
      case 'cadastradoPor':
      case 'criado':
      case 'modificado':
      case 'consulta':
        return `<span class="cell-clip">${Utils.escapeHtml(this._displayValue(col, it) || '—')}</span>`;
      default:
        return '<span class="cell-clip">—</span>';
    }
  },

  _renderWindow() {
    if (!this._container) return;
    const scroll = this._container.querySelector('#tbl-scroll');
    const spacer = this._container.querySelector('#tbl-spacer');
    if (!scroll || !spacer) return;

    if (this._filtered.length === 0) {
      spacer.innerHTML = `<div class="empty-state" style="position:absolute;inset:0;">
        <div class="ic">📦</div>Nenhum item encontrado.<br>
        <button class="btn" style="margin-top:12px" onclick="App.openItemForm()" title="Abrir o formulário para cadastrar o primeiro item">Cadastrar primeiro item</button>
      </div>`;
      return;
    }

    const scrollTop = scroll.scrollTop;
    const viewH = scroll.clientHeight || 600;
    const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 6);
    const end = Math.min(this._filtered.length, Math.ceil((scrollTop + viewH) / ROW_H) + 6);

    const cols = (this._colOrder || COL_KEYS).filter((c) => !this._colVisible || this._colVisible[c]);
    let html = '';
    for (let i = start; i < end; i++) {
      const it = this._filtered[i];
      const marcado = this._selected.has(it.id);
      const iconSvg = Avatar.itemIconSvg(it, this._iconState, { size: 32 });
      const primeiraColuna = this._selectMode
        ? `<input type="checkbox" class="tbl-row-chk" ${marcado ? 'checked' : ''}>`
        : `<span class="thumb thumb-svg">${iconSvg}</span>`;
      const duplicado = !!(it.patrimonio && this._dupSet && this._dupSet.has(it.patrimonio.trim()));
      const celulas = cols.map((col) => this._cellHtml(col, it, duplicado)).join('');
      html += `
        <div class="vtable-row${marcado ? ' vtable-row--selected' : ''}" style="top:${i * ROW_H}px;height:${ROW_H}px" data-id="${it.id}" title="${it.origemSessaoLabel ? 'Cadastrado por: ' + Utils.escapeHtml(it.origemSessaoLabel) : ''}">
          <span>${primeiraColuna}</span>
          ${celulas}
        </div>`;
    }
    spacer.innerHTML = html;
    spacer.querySelectorAll('.vtable-row').forEach((row) => {
      row.onclick = () => {
        if (this._selectMode) {
          const id = row.dataset.id;
          if (this._selected.has(id)) this._selected.delete(id); else this._selected.add(id);
          this._updateSelectBar();
          this._renderWindow();
        } else {
          App.showItemDetail(row.dataset.id);
        }
      };
    });
  },
};

window.TableView = TableView;
