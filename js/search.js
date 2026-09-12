/**
 * search.js — Janela de busca dedicada: ao encontrar um item, mostra o
 * flashcard com as informações + a posição espacial (planta 2D) no mapa
 * montado durante a catalogação. Ao buscar outro item, transição suave
 * (x,y) até a nova posição. A busca só pesquisa e exibe os resultados (em
 * lista) + a posição 2D do item selecionado — o antigo alternador "2D/3D"
 * (que também permitia abrir aqui o visualizador 3D em primeira pessoa) foi
 * removido a pedido do usuário; o "Ver em 3D" continua disponível normalmente
 * a partir da tela Mapa (ver js/mapview.js, App.openView3D).
 */

const SearchView = {
  _container: null,
  _renderer2d: null,
  _currentItem: null,
  _mapsCache: {},
  _query: '',
  // NOVO (03/09/2026), pedido verbatim (item 4): "Deve poder escolher se vai
  // ser 2D ou 3D a visualização." — lembrado entre buscas nesta mesma
  // sessão (não persistido no banco — decisão de UX: escolha rápida, não
  // uma configuração permanente como as de ⚙️).
  _viewMode: '2d',
  // NOVO (03/09/2026) — controla se a lista de sugestões está "recolhida"
  // (ver item 4: "ao clicar em uma das sugestões de busca, ela preenche o
  // campo de busca. E as sugestões são recolhidas."). `true` = recolhida.
  _suggestionsCollapsed: false,

  async mount(container) {
    this._container = container;
    container.innerHTML = `
      <div class="search-shell">
        <div class="search-top" style="display:flex; gap:8px; align-items:center">
          <input type="search" id="srch-input" placeholder="Buscar por patrimônio, descrição, tipo ou setor…" autofocus title="Buscar um item já catalogado" value="${Utils.escapeHtml(this._query)}" style="flex:1">
          <!-- NOVO (03/09/2026), pedido verbatim (item 4): "Deve poder
               escolher se vai ser 2D ou 3D a visualização." -->
          <div class="seg-toggle" id="srch-viewmode" style="display:flex; border:1px solid var(--border); border-radius:8px; overflow:hidden; flex:none">
            <button type="button" class="btn secondary sm" id="srch-viewmode-2d" style="border-radius:0">2D</button>
            <button type="button" class="btn secondary sm" id="srch-viewmode-3d" style="border-radius:0">3D</button>
          </div>
        </div>
        <div class="search-results" id="srch-results"></div>
        <div class="search-stage" id="srch-stage">
          <canvas id="srch-canvas" style="width:100%;height:100%;display:block"></canvas>
          <div id="srch-empty" class="empty-state" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div class="ic">🔎</div>Busque um item para ver sua posição no mapa.
          </div>
        </div>
      </div>
    `;

    // Ícone do item (sem foto) desenhado em SVG na hora — ver avatar.js.
    this._iconState = await Avatar.loadIconState();

    const canvas = container.querySelector('#srch-canvas');
    this._renderer2d = new Map2DRenderer(canvas);

    // NOVO (03/09/2026), pedido verbatim (item 4): "Inserir um novo item de
    // busca ou refazer a mesma (tirar algum caractere e colocar o mesmo de
    // novo), faz as sugestões aparecerem (se houver)." — QUALQUER digitação
    // (mesmo resultando no mesmo texto de antes, ex.: apagar 1 caractere e
    // digitar de novo) reabre a lista recolhida por um clique de sugestão
    // anterior; `_doSearch` decide sozinho se sobra algo pra mostrar.
    container.querySelector('#srch-input').addEventListener('input', Utils.debounce((e) => {
      this._suggestionsCollapsed = false;
      this._doSearch(e.target.value);
    }, 200));
    // NOVO (04/09/2026), pedido verbatim (item 6): "No 'Buscar', se na busca
    // aparecer apenas um item como sugestão e der ENTER, então, é o mesmo
    // que clicar na sugestão." — só age quando sobra EXATAMENTE 1 linha na
    // lista de resultados (`#srch-results .search-result-row[data-id]`);
    // com 0 ou 2+ linhas, Enter não faz nada (não há "a sugestão" única pra
    // escolher sozinho). Dispara o MESMO clique de sempre (`_pickSuggestion`
    // — preenche o campo, recolhe a lista, segue pro fluxo normal de
    // seleção), nunca um atalho separado que pudesse divergir do clique.
    container.querySelector('#srch-input').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const rows = this._container?.querySelectorAll('#srch-results .search-result-row[data-id]');
      if (rows && rows.length === 1) { e.preventDefault(); this._pickSuggestion(rows[0].dataset.id); }
    });

    this._updateViewModeButtons();
    // ATUALIZADO (07/09/2026), pedido verbatim: "No 'Buscar', a apresentação
    // da busca deve ser feita ao clicar no botão 2D e 3D, não somente quando
    // for clicado na sugestão de busca." -- antes, clicar em "2D"/"3D" só
    // trocava a cor do botão (`_updateViewModeButtons`) e ficava esperando o
    // usuário clicar de novo numa sugestão pra, só aí, mostrar o item na
    // visualização escolhida -- ou seja, trocar de 2D pra 3D com um item JÁ
    // selecionado não fazia NADA visível até re-clicar na lista. Agora, se
    // já há um item selecionado (`_currentItem`), o próprio clique no botão
    // 2D/3D já reapresenta ELE MESMO no modo recém-escolhido (mesmo funil de
    // sempre, `_selectItem` -- reaproveita o `verNoMapa3D`/prévia 2D, sem
    // duplicar lógica); sem item selecionado ainda, o clique só troca o modo
    // mesmo (comportamento de sempre, nada pra apresentar ainda).
    container.querySelector('#srch-viewmode-2d').onclick = () => {
      this._viewMode = '2d';
      this._updateViewModeButtons();
      if (this._currentItem) this._selectItem(this._currentItem.id);
    };
    container.querySelector('#srch-viewmode-3d').onclick = () => {
      this._viewMode = '3d';
      this._updateViewModeButtons();
      if (this._currentItem) this._selectItem(this._currentItem.id);
    };

    // Restaura o estado da busca ao voltar para esta aba (query, resultados e
    // item selecionado) — sem isso, trocar de aba e voltar reiniciava a busca
    // do zero.
    if (this._query) this._doSearch(this._query);
    if (this._currentItem) await this._selectItem(this._currentItem.id);

    this._running = true;
    this._loop();
    SyncModule.pull().catch(() => {}); // puxa o que outros aparelhos catalogaram, se houver servidor configurado
  },

  unmount() {
    this._running = false;
    this._container = null;
  },

  _loop() {
    const step = () => {
      if (!this._running) return;
      if (this._renderer2d) this._renderer2d.render();
      requestAnimationFrame(step);
    };
    step();
  },

  /** NOVO (03/09/2026) — reflete `_viewMode` nos botões 2D/3D (ver mount). */
  _updateViewModeButtons() {
    // NOTA (03/09/2026): sem classe CSS dedicada pra "selecionado" nesta
    // rodada (css/style.css não fazia parte do escopo tocado) — estilo
    // inline simples (mesma cor de destaque `--accent` já usada no resto
    // do app) só pra indicar visualmente qual dos dois está ativo.
    const b2 = this._container?.querySelector('#srch-viewmode-2d');
    const b3 = this._container?.querySelector('#srch-viewmode-3d');
    const on = 'background:var(--accent,#4a9eff); color:#fff; border-radius:0';
    const off = 'border-radius:0';
    if (b2) b2.style.cssText = this._viewMode === '2d' ? on : off;
    if (b3) b3.style.cssText = this._viewMode === '3d' ? on : off;
  },

  async _doSearch(query) {
    this._query = query;
    const list = this._container.querySelector('#srch-results');
    // NOVO (03/09/2026), pedido verbatim (item 4): "ao clicar em uma das
    // sugestões de busca [...] as sugestões são recolhidas" — enquanto
    // recolhida (até a próxima digitação, ver listener 'input' em mount),
    // a lista fica vazia mesmo que ainda haja resultados pra mostrar.
    if (this._suggestionsCollapsed) { list.innerHTML = ''; return; }
    const results = container_safe(this._container) ? await DB.searchItems(query, { limit: 60 }) : [];
    if (!query.trim()) { list.innerHTML = ''; return; }
    if (results.length === 0) { list.innerHTML = `<div class="search-result-row">Nenhum item encontrado.</div>`; return; }
    // Duplicado = o patrimônio deste item também aparece em outro item em
    // QUALQUER lugar do catálogo (não só nestes resultados) — mesmo conceito
    // usado na tabela, no detalhe do item e nos orbs (ver DB.getDuplicatePatrimonios).
    const dupSet = await DB.getDuplicatePatrimonios();

    // Agrupa por número de patrimônio: se vários aparelhos catalogaram o MESMO
    // patrimônio, nenhum é descartado — todos ficam numa lista sob o mesmo
    // cabeçalho, cada um mostrando de qual aparelho veio.
    const groups = new Map();
    results.forEach((it) => {
      const key = (it.patrimonio || '').trim().toLowerCase() || `__sem-patrimonio__${it.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    });

    let html = '';
    for (const itens of groups.values()) {
      if (itens.length > 1) {
        html += `<div class="search-group-header">🔁 Patrimônio ${Utils.escapeHtml(itens[0].patrimonio || '—')} — ${itens.length} catálogos recebidos</div>`;
      }
      itens.forEach((it) => {
        const duplicado = !!(it.patrimonio && dupSet.has(it.patrimonio.trim()));
        const iconSvg = Avatar.itemIconSvg(it, this._iconState, { size: 40 });
        html += `
      <div class="search-result-row" data-id="${it.id}">
        <span class="thumb-svg">${iconSvg}</span>
        <div style="flex:1">
          <div style="font-weight:600; font-size:13.5px">${duplicado ? '<span style="color:#c77dff" title="Patrimônio duplicado — também está em outro item">⚠️ </span>' : ''}${Utils.escapeHtml(it.descricao || '(sem descrição)')}</div>
          <div style="font-size:11.5px; color:var(--text-dim); font-family:monospace">${Utils.escapeHtml(it.patrimonio || '—')} · ${Utils.escapeHtml(it.setor || '')}</div>
          ${it.origemSessaoLabel ? `<div style="font-size:10.5px; color:var(--text-dim)">📱 ${Utils.escapeHtml(it.origemSessaoLabel)}</div>` : ''}
        </div>
        ${typeof it.mapaX === 'number' ? '<span class="badge">📍 mapeado</span>' : '<span class="badge">sem posição</span>'}
      </div>`;
      });
    }
    list.innerHTML = html;
    list.querySelectorAll('.search-result-row[data-id]').forEach((row) => {
      row.onclick = () => this._pickSuggestion(row.dataset.id);
    });
  },

  /** NOVO (03/09/2026), pedido verbatim (item 4): "ao clicar em uma das
   *  sugestões de busca, ela preenche o campo de busca. E as sugestões são
   *  recolhidas." — chamado pelo clique numa linha da lista (antes ia
   *  direto pra `_selectItem`); preenche o campo, RECOLHE a lista (ver
   *  `_suggestionsCollapsed`/`_doSearch`) e só então segue pro mesmo fluxo
   *  de sempre (`_selectItem`). */
  async _pickSuggestion(id) {
    const item = await DB.getItem(id);
    if (!item) return;
    const input = this._container.querySelector('#srch-input');
    const texto = item.patrimonio || item.descricao || '';
    if (input) input.value = texto;
    this._query = texto;
    this._suggestionsCollapsed = true;
    this._container.querySelector('#srch-results').innerHTML = '';
    await this._selectItem(id);
  },

  async _selectItem(id) {
    const item = await DB.getItem(id);
    if (!item) return;
    await DB.touchLastConsulted(id);
    this._currentItem = item;
    this._container.querySelector('#srch-empty').style.display = 'none';

    if (!item.ambienteId || typeof item.mapaX !== 'number') {
      Utils.toast('Este item ainda não tem posição registrada no mapa.', { type: 'warn' });
      this._showFlashcardOverlay(item);
      return;
    }
    // NOVO (03/09/2026), pedido verbatim (item 4): "Deve poder escolher se
    // vai ser 2D ou 3D a visualização. Se a informação estiver em outros
    // mapas, o mapa correspondente é o que deve aparecer." — modo '3d'
    // sai desta tela de busca (que só tem uma prévia 2D embutida, ver
    // `_renderer2d`/`srch-canvas`) e navega pra Visualização 3D DE
    // VERDADE, reaproveitando os MESMOS helpers dos itens 1/2 (App.
    // verNoMapa3D já troca pro mapa certo via `ambienteId`, exatamente a
    // troca de mapa pedida aqui). Modo '2d' continua com a prévia embutida
    // desta tela (comportamento de sempre), só que agora pelo mesmo
    // funil — ver App.verNoMapa2D pra troca de mapa quando for de fato
    // navegar pra "Mapa"/Planta baixa (não usado AQUI de propósito, porque
    // a busca já tem sua própria prévia sem precisar sair da aba).
    if (this._viewMode === '3d') {
      this._showFlashcardOverlay(item);
      await App.verNoMapa3D({ x: item.mapaX, y: item.mapaY, ambienteId: item.ambienteId });
      return;
    }

    this._showFlashcardOverlay(item);

    let map = this._mapsCache[item.ambienteId];
    if (!map) { map = await DB.getMap(item.ambienteId); this._mapsCache[item.ambienteId] = map; }
    if (!map) return;
    const allItems = await DB.getItemsByAmbiente(map.id);
    map.itens = allItems.filter((it) => typeof it.mapaX === 'number').map((it) => ({
      id: it.id, x: it.mapaX, y: it.mapaY, piso: it.mapaPiso || 0, label: it.patrimonio,
    }));

    this._renderer2d.setMapData(map);
    this._renderer2d.selectedItemId = item.id;
    this._renderer2d.animateTo(item.mapaX, item.mapaY); // transição suave em x,y
  },

  _showFlashcardOverlay(item) {
    let el = this._container.querySelector('#srch-flashcard');
    if (!el) {
      el = document.createElement('div');
      el.id = 'srch-flashcard';
      el.className = 'flashcard3d-overlay';
      el.style.top = 'auto';
      el.style.bottom = '14px';
      el.style.left = '14px';
      el.style.right = 'auto';
      el.style.transform = 'none';
      this._container.querySelector('#srch-stage').appendChild(el);
    }
    const iconSvg = Avatar.itemIconSvg(item, this._iconState, { size: 56 });
    // NOVO (04/09/2026), pedido verbatim: "No 'Buscar', deve ser possível
    // ter acesso as informações do patrimônio (assim como aparece quando se
    // clica em uma linha que tenha patrimônio no 'Tabela')... Pode ser por
    // um botão de informações do patrimônio no card que fica em baixo à
    // esquerda (mantenha o texto que já aparece ali)." — mesmo texto de
    // sempre (patrimônio/descrição/tipo/setor), só com um botão "ℹ️" novo
    // ao lado, abrindo a MESMA ficha de detalhe da Tabela (App.
    // showItemDetail — nenhuma tela nova, reaproveitado 100%).
    el.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center">
        <span style="width:56px;height:56px;flex:none;display:inline-flex;border-radius:12px;overflow:hidden">${iconSvg}</span>
        <div style="flex:1; min-width:0">
          <div style="font-family:monospace; font-size:11px; color:var(--text-dim)">${Utils.escapeHtml(item.patrimonio || '—')}</div>
          <div style="font-weight:700; font-size:14px">${Utils.escapeHtml(item.descricao || '(sem descrição)')}</div>
          <div style="font-size:11.5px; color:var(--text-dim)">${Utils.escapeHtml(item.tipo || '')} · ${Utils.escapeHtml(item.setor || '')}</div>
        </div>
        <button type="button" class="icon-btn sm" id="srch-flashcard-info" title="Ver informações completas deste patrimônio" style="flex:none">ℹ️</button>
      </div>`;
    el.querySelector('#srch-flashcard-info').onclick = () => App.showItemDetail(item.id);
  },
};

function container_safe(c) { return !!c; }

window.SearchView = SearchView;
