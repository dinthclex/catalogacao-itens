/* js/cards/map-panel-cards.js
 * Cards extraídos de `js/mapview.js` — esqueletos HTML ESTÁTICOS de painéis
 * do Mapa 2D (janela de Depuração e o seletor de tipo de Objeto), pedido
 * verbatim: "As inserções de innerHTML devem se tornar Cards". Diferente
 * dos cards de `js/cardsystem.js`/`window.ModalCards`, estes NÃO são
 * modais soltos em `document.body` — são o CONTEÚDO INICIAL de painéis já
 * criados/posicionados/arrastáveis por `mapview.js` (`_openDebugWindow`,
 * `_openObjectPickerPanel`), que continuam cuidando de wiring, posição e
 * atualização dinâmica dos dados depois de montar este esqueleto. Por isso
 * aqui é só `window.MapPanelCards.<nome>()` devolvendo a string HTML —
 * sem `wire`/`build`, o chamador liga os eventos como já fazia.
 *
 * USO (em mapview.js): `panel.innerHTML = window.MapPanelCards.debugWindow();`
 */
window.MapPanelCards = window.MapPanelCards || {};

/** Esqueleto fixo da janela "🐞 Depuração do Mapa 2D" — ver comentário
 *  grande em `MapView._openDebugWindow` (mapview.js) sobre por que esta
 *  estrutura é criada só UMA VEZ (preserva scroll de cada lista). */
window.MapPanelCards.debugWindow = () => `
      <div class="map-panel-head"><b>🐞 Depuração do Mapa 2D</b><button type="button" class="icon-btn sm map-panel-close" title="Fechar">✕</button></div>
      <div class="map-debug-body" id="map-debug-body">
        <details data-sec="win" open>
          <summary>Janelas/painéis (<span id="map-debug-win-count">0</span>)</summary>
          <div class="map-debug-tablewrap" id="map-debug-win-wrap"><table class="map-debug-table">
            <thead><tr><th>Nome</th><th>Existe</th><th>Estado</th><th>Posição X</th><th>Posição Z</th><th>Visibilidade</th></tr></thead>
            <tbody id="map-debug-win-body"></tbody>
          </table></div>
        </details>
        <details data-sec="obj">
          <summary>Objetos (<span id="map-debug-obj-count">0</span>)</summary>
          <div class="map-debug-tablewrap" id="map-debug-obj-wrap"><table class="map-debug-table">
            <thead><tr><th>id</th><th>Tipo</th><th>x, y</th></tr></thead>
            <tbody id="map-debug-obj-body"></tbody>
          </table></div>
        </details>
        <details data-sec="foto">
          <summary>Fotos (<span id="map-debug-foto-count">0</span>)</summary>
          <div class="map-debug-tablewrap" id="map-debug-foto-wrap"><table class="map-debug-table">
            <thead><tr><th>id</th><th>Nome</th><th>x, y</th></tr></thead>
            <tbody id="map-debug-foto-body"></tbody>
          </table></div>
        </details>
        <details data-sec="item">
          <summary>Itens (<span id="map-debug-item-count">0</span>)</summary>
          <div class="map-debug-tablewrap" id="map-debug-item-wrap"><table class="map-debug-table">
            <thead><tr><th>id</th><th>Rótulo</th><th>x, y</th></tr></thead>
            <tbody id="map-debug-item-body"></tbody>
          </table></div>
        </details>
      </div>
    `;

/** Esqueleto fixo do painel "🪑 Objetos — escolha o tipo" (seletor de
 *  tipo de objeto do catálogo, ver `MapView._openObjectPickerPanel`). */
window.MapPanelCards.objectPickerPanel = () => `
      <div class="map-panel-clip">
        <div class="map-obj-picker-head map-panel-head">
          <b>🪑 Objetos — escolha o tipo</b>
          <!-- NOVO (01/09/2026), item GRANDE #5 do pedido de 12 itens, verbatim:
               "Para isso deve ter um botão de 'acessar modelos', então, abre-se
               uma janela que cobre toda a tela (como nas 'configurações do
               app')." + decisão do usuário (AskUserQuestion): "No painel de
               Objetos do mapa (Recomendado)" — não em Configurações do app.
               Abre a tela cheia nova Modelos3DView (ver js/modelos3d.js,
               registrada em App.views), mesmo padrão de rota (App.navigate) já
               usado por Configurações — botão de "espaço restante" (.map-panel-
               head > b) já suporta 2+ botões à direita, ver comentário grande
               logo acima em css/style.css. -->
          <button type="button" class="icon-btn sm" id="map-obj-picker-modelos3d" title="🛠️ Acessar modelos — editar o modelo 3D (detalhado/low poly) de cada tipo de objeto padrão">🛠️</button>
          <button type="button" class="icon-btn sm" id="map-obj-picker-close" title="Fechar (o mesmo que apertar o botão Objetos de novo)">✕</button>
        </div>
        <!-- [RODADA 128] NOVO — dropdown "Organizar:", pedido do usuário
             verbatim: "no topo da janela, em baixo da barra de título e
             acima dos objetos representados, coloque um botão dropdown com
             3 opções". Ver a função _organizarCatalogoObjetos acima pro
             detalhamento de cada modo. -->
        <div class="map-obj-picker-organize-row" style="padding:6px 10px 0 10px; display:flex; align-items:center; gap:6px">
          <label for="map-obj-picker-organize" style="font-size:11px; color:var(--text-dim); white-space:nowrap">Organizar:</label>
          <select id="map-obj-picker-organize" style="flex:1; font-size:12px">
            <option value="alfabetica">Ordem alfabética</option>
            <option value="porCategoria">Por categoria</option>
            <option value="livre">Livre (arraste para reordenar)</option>
          </select>
        </div>
        <!-- [21/09/2026] NOVO -- pedido verbatim: "No mapa 2D, na janela 'Ferramentas', em
             'Objetos', deve ter um campo para buscar o nome de um objeto." Filtra a grade abaixo
             pelo rótulo (ver renderGrid em mapview.js _openObjectPickerPanel); some por completo
             com o modo "Livre" desabilitado enquanto há busca (arrastar pra reordenar não faz
             sentido numa lista já filtrada) -- ver mesmo trecho. -->
        <div class="map-obj-picker-busca-row" style="padding:6px 10px 0 10px">
          <input type="search" id="map-obj-picker-busca" placeholder="🔎 Buscar objeto…" style="width:100%; font-size:12px; box-sizing:border-box">
        </div>
        <div class="map-obj-picker-grid" id="map-obj-picker-grid"></div>
      </div>
    `;
