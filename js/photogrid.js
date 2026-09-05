/**
 * photogrid.js — Duas telas complementares da aba "Mapa" (ver mapview.js
 * MapView._screen / _showScreen), abertas a partir da tela inicial de
 * entrada ("Planta baixa" | "Foto" | "📦 Caixa"):
 *
 *  - PhotoGrid.mountFotoScreen: atalho — abre a MESMA tela de "Mapa" ->
 *    "Planta baixa" -> "🖼️ Fotos" (js/ambientephotos.js/AmbientePhotos),
 *    só chamando AmbientePhotos.open() direto (não é mais uma grade de
 *    miniaturas própria — pedido do usuário).
 *
 *  - PhotoGrid.mountCaixaScreen: navegação simples (Parte 4) de tudo que
 *    ainda não tem lugar nenhum — item sem pino no mapa (mapaX/mapaY) E sem
 *    orb em foto nenhuma, ou foto sem mapaX/mapaY (ver js/db.js Parte 1).
 *    getUnsorted() abaixo é a ÚNICA fonte da verdade pra essa contagem —
 *    usada tanto aqui quanto pelo badge da tela de entrada do Mapa (ver
 *    mapview.js _mountEntryScreen), pra nunca divergir uma da outra.
 */

const PhotoGrid = {
  _map: null,

  // ---------- Parte 4: cálculo compartilhado de "sem lugar" ----------
  /** Set de itemIds referenciados por pelo menos 1 orb em qualquer foto do
   *  mapa — MESMA lógica (mesmo loop simples) que organizeview.js já usa em
   *  _computeLayout pra separar patrimônios "sem orb em foto nenhuma"; não
   *  importa direto de lá pra não acoplar as duas telas (bem diferentes em
   *  propósito), só duplica o laço — é literalmente 3 linhas. */
  async _linkedItemIdsSet(fotos) {
    const set = new Set();
    for (const f of fotos) { for (const o of (f.orbs || [])) { if (o.itemId) set.add(o.itemId); } }
    return set;
  },

  /** ÚNICA fonte da verdade pra "o que está sem lugar" — usada pelo badge
   *  da tela de entrada do Mapa (mapview.js _mountEntryScreen) E por
   *  mountCaixaScreen abaixo, pra nunca mostrar números diferentes.
   *  Recalculada do zero a cada chamada (nunca cacheada) — pedido explícito
   *  da spec, já que qualquer vínculo feito em Planta baixa/Foto muda o
   *  resultado a qualquer momento. */
  async getUnsorted() {
    const [items, todasFotos] = await Promise.all([DB.getAllItems(), DB.getAllAmbientePhotos()]);
    // NOVO (03/09/2026), pedido verbatim: "Deve haver uma separação entre as
    // fotos dos ambientes e as fotos que objetivam que apareça só o número de
    // patrimônio." — fotos `tipo: 'patrimonio'` (ver js/db.js addAmbientePhoto)
    // nunca tiveram (nem deveriam ganhar) uma posição no mapa; sem este
    // filtro elas contavam indevidamente como "foto de ambiente sem lugar"
    // aqui/no badge da tela de entrada do Mapa.
    const fotos = todasFotos.filter((f) => f.tipo !== 'patrimonio');
    const linkedIds = await this._linkedItemIdsSet(fotos);
    const itemsSemLugar = items.filter((it) => typeof it.mapaX !== 'number' && !linkedIds.has(it.id));
    const fotosSemLugar = fotos.filter((f) => typeof f.mapaX !== 'number' || typeof f.mapaY !== 'number');
    return { items: itemsSemLugar, fotos: fotosSemLugar, total: itemsSemLugar.length + fotosSemLugar.length };
  },

  /** Patrimônios sem uma posição de VERDADE no MAPA (`mapaX`/`mapaY`,
   *  descontando `mapaAuto`) — DIFERENTE de `getUnsorted()` acima. Pedido
   *  do usuário, 25/08/2026: "No 3D, nos itens, aparece que 'não há nenhum
   *  patrimônio sem lugar', onde estão? Eles podem ter vínculo de posição
   *  nas fotos, mas no mapa ainda não" — bug encontrado: a ferramenta
   *  "🏷️ Item" do 3D (ver view3d.js _initBuildHotbar) reaproveitava
   *  `getUnsorted().items` (pensada pra 📦 Caixa/badge, ver comentário
   *  grande no topo do arquivo), cuja definição de "sem lugar" EXCLUI de
   *  propósito qualquer item já vinculado a um orb de foto (`linkedIds`
   *  acima) — faz sentido pra 📦 Caixa (uma foto vinculada já é, por si só,
   *  um "lugar" pra aquele patrimônio, ver js/db.js Parte 1 comentário de
   *  `fotoAnexadaId`), mas NÃO faz sentido pra ferramenta 🏷️ Item do 3D:
   *  ela existe justamente pra criar um PINO no mapa (mapaX/mapaY) — um
   *  vínculo de foto não é um pino, então um item só-vinculado-a-foto
   *  continuava, corretamente, sem nenhum pino, mas sumia da lista de
   *  "disponíveis pra posicionar" mesmo assim. Esta função aqui ignora
   *  vínculo de foto de propósito — só olha se existe uma posição de MAPA
   *  de verdade. Inclui também `mapaAuto: true` (posição de RESERVA
   *  escolhida automaticamente pelo app pra um item ainda não posicionado
   *  de propósito, ver js/db.js Parte 1) — MESMO critério que a 📦 Caixa já
   *  documenta pra esse campo (ainda "sem lugar" até um posicionamento
   *  deliberado, que sempre grava `mapaAuto: false` — ver mapview.js
   *  `_placeItemPinAt`/`_placeNewItemPinAt` — e agora também
   *  view3d.js `_placeWithBuildTool`, ramo 'item'). */
  async getItemsSemPosicaoNoMapa() {
    const items = await DB.getAllItems();
    return items.filter((it) => typeof it.mapaX !== 'number' || typeof it.mapaY !== 'number' || it.mapaAuto === true);
  },

  // ---------- Tela "Foto" (atalho pra AmbientePhotos — ver comentário no
  // topo do arquivo) ----------
  async mountFotoScreen(container, { onClose, startPhotoId, highlightOrbId, returnToLabel } = {}) {
    this._map = await DB.getOrCreateSingleMap();
    // `startPhotoId`/`highlightOrbId` (NOVO, 04/09/2026) — repassados por
    // MapView._showScreen('foto', opts) quando esta tela é aberta pelo
    // botão "📍 Marcação em foto" da ficha do item (ver app.js
    // App.verMarcacaoEmFoto/ambientephotos.js AmbientePhotos.open); `undefined`
    // no caminho normal (nenhuma foto/orb específica pedida).
    // `returnToLabel` (NOVO, 04/09/2026 — "sistematização da pilha de
    // retorno") — nome da tela de origem, pra trocar o rótulo do botão de
    // fechar por um de retorno explícito (ver ambientephotos.js).
    await AmbientePhotos.open(this._map, { onExit: onClose, startPhotoId, highlightOrbId, returnToLabel });
  },

  unmountFotoScreen() {
    AmbientePhotos.close();
  },


  // ---------- Tela "📦 Caixa" (Parte 4) ----------
  async mountCaixaScreen(container, { onClose } = {}) {
    this._map = await DB.getOrCreateSingleMap();
    const unsorted = await this.getUnsorted();
    // CORRIGIDO (31/08/2026), pedido verbatim: "Sobre os patrimônios
    // duplicados, em qualquer lugar no app que houver a apresentação de
    // patrimônios, deve-se indicar visualmente quais estão duplicados." —
    // mesma fonte de verdade/mesmo visual (⚠️ lilás) do resto do app (ver
    // search.js, app.js showItemDetail).
    const dupSet = await DB.getDuplicatePatrimonios();
    container.innerHTML = `
      <div class="view-pad">
        <div class="photogrid-topbar caixa-topbar">
          <button type="button" class="icon-btn" id="cx-close" title="Fechar e voltar para a tela inicial do Mapa">✕ Fechar</button>
          <span class="photogrid-count">📦 ${unsorted.total} sem lugar</span>
        </div>
        <h3 class="caixa-section-title">Patrimônios sem lugar (${unsorted.items.length})</h3>
        <div class="caixa-items-list" id="cx-items">${unsorted.items.length ? '' : '<div class="empty-state"><div class="ic">✅</div>Nenhum item sem lugar.</div>'}</div>
        <h3 class="caixa-section-title">Fotos sem lugar (${unsorted.fotos.length})</h3>
        <div class="photogrid-grid" id="cx-fotos">${unsorted.fotos.length ? '' : '<div class="empty-state"><div class="ic">✅</div>Nenhuma foto sem lugar.</div>'}</div>
      </div>
    `;
    container.querySelector('#cx-close').onclick = () => onClose?.();

    const itemsEl = container.querySelector('#cx-items');
    unsorted.items.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'caixa-item-row';
      const duplicado = !!(it.patrimonio && dupSet.has(it.patrimonio.trim()));
      row.innerHTML = `
        <div class="caixa-item-row-main">
          <span class="caixa-item-patr">${duplicado ? '<span style="color:#c77dff" title="Patrimônio duplicado — também está em outro item">⚠️ </span>' : ''}${Utils.escapeHtml(it.patrimonio || '—')}</span>
          <span class="caixa-item-desc">${Utils.escapeHtml(it.descricao || '(sem descrição)')}</span>
        </div>
        <span class="badge">${Utils.escapeHtml(it.tipo || '—')}</span>
      `;
      row.onclick = () => App.showItemDetail(it.id);
      itemsEl.appendChild(row);
    });

    const fotosEl = container.querySelector('#cx-fotos');
    unsorted.fotos.forEach((foto) => {
      const tile = document.createElement('div');
      tile.className = 'photogrid-tile photogrid-tile-static';
      tile.dataset.id = foto.id;
      const img = document.createElement('img');
      img.className = 'photogrid-tile-img';
      img.src = foto.thumbDataUrl || foto.dataUrl || '';
      img.draggable = false;
      img.alt = foto.nome || 'Foto do ambiente';
      tile.appendChild(img);
      tile.onclick = () => this._openFoto(foto);
      fotosEl.appendChild(tile);
    });
  },

  /** Tela Caixa não tem loop/canvas nem arrasto — nada pra desmontar além
   *  de deixar de referenciar o DOM (que _showScreen já substitui de
   *  qualquer forma). Existe mesmo assim (em vez de MapView chamar direto
   *  "nada") pra manter a mesma forma de chamada das outras 3 sub-telas
   *  (ver MapView._unmountCurrentScreen), então trocar a implementação
   *  interna de qualquer uma delas no futuro não exige mexer em mapview.js. */
  unmountCaixaScreen() {},
};
