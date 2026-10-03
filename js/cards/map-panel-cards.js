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
            <thead><tr><th>Nome</th><th>Existe</th><th>Estado</th><th>Posição X</th><th>Posição Z</th><th>Visibilidade</th><th title="Quantas vezes a janela foi criada/recriada desde que a página carregou">Reconstruções</th></tr></thead>
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
          <!-- [01/10/2026] NOVO — "coloque um botão, ao lado do campo de busca, que faz abrir uma janela em que há uma explicação de como pode ser feita a busca, com exemplos." -->
          <div style="display:flex; gap:6px; align-items:center">
            <input type="search" id="map-obj-picker-busca" placeholder="🔎 Buscar objeto…" style="flex:1; min-width:0; font-size:12px; box-sizing:border-box">
            <button type="button" class="icon-btn sm" id="map-obj-picker-busca-ajuda" title="Como buscar — explicação e exemplos (mesa;gabinete, aspas, -excluir, curinga...)">❓</button>
          </div>
        </div>
        <!-- [30/09/2026] NOVO (12ª rodada) — pedido verbatim: "Deve haver uma opção para o momento da busca. Esta opção deve alternar entre o método atual e um método que faz aparecer só os títulos com o(s) objeto(s) correspondente(s), sem deixar um grande 'espaço em branco'." Ver mapview.js _openObjectPickerPanel (buscaModo). -->
        <div class="map-obj-picker-busca-modo-row" style="padding:4px 10px 0 10px; display:flex; align-items:center; gap:6px">
          <label for="map-obj-picker-busca-modo" style="font-size:11px; color:var(--text-dim); white-space:nowrap">Ao buscar:</label>
          <select id="map-obj-picker-busca-modo" style="flex:1; font-size:12px">
            <option value="atual">Manter posições (os outros ficam invisíveis)</option>
            <option value="compacto">Compactar (só os correspondentes)</option>
          </select>
        </div>
        <div class="map-obj-picker-grid" id="map-obj-picker-grid"></div>
      </div>
    `;


/** [01/10/2026] NOVO — conteúdo da janela de ajuda da busca de Objetos (botão ❓ ao lado do campo de busca; ver
 *  `MapView._openBuscaObjetosAjuda`). A sintaxe descrita aqui é a de `compilarBuscaMulti` (mapview.js). */
window.MapPanelCards.buscaObjetosAjuda = () => `
      <div style="padding:14px 16px; max-width:460px; width:92vw; max-height:84vh; overflow:auto; font-size:13px; line-height:1.5">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px"><b style="flex:1; font-size:14px">🔎 Como buscar objetos</b><button type="button" class="icon-btn sm" id="busca-ajuda-fechar" title="Fechar">✕</button></div>
        <p style="margin:0 0 8px; color:var(--text-dim)">A busca ignora maiúsculas e acentos e olha o nome do objeto. Combine as regras abaixo como quiser.</p>
        <table style="width:100%; border-collapse:collapse; font-size:12.5px">
          <thead><tr><th align="left" style="padding:4px 6px; border-bottom:1px solid var(--border)">Digite</th><th align="left" style="padding:4px 6px; border-bottom:1px solid var(--border)">O que acontece</th></tr></thead>
          <tbody>
            <tr><td style="padding:4px 6px"><code>mesa</code></td><td style="padding:4px 6px">Objetos cujo nome contém "mesa" (também acha "Mesa redonda", "Escrivaninha mesa"...).</td></tr>
            <tr><td style="padding:4px 6px"><code>mesa;gabinete</code></td><td style="padding:4px 6px"><b>OU</b>: mostra os que têm "mesa" <u>ou</u> "gabinete". Também vale vírgula ou barra vertical: <code>mesa,gabinete</code> · <code>mesa|gabinete</code>.</td></tr>
            <tr><td style="padding:4px 6px"><code>mesa redonda</code></td><td style="padding:4px 6px"><b>E</b>: o nome precisa ter as <u>duas</u> palavras, em qualquer ordem.</td></tr>
            <tr><td style="padding:4px 6px"><code>"mesa redonda"</code> ou <code>'mesa redonda'</code></td><td style="padding:4px 6px"><b>Frase</b>: aspas duplas ou simples juntam as palavras na ordem digitada. <code>"gabinete"</code> equivale a <code>gabinete</code>.</td></tr>
            <tr><td style="padding:4px 6px"><code>mesa -redonda</code></td><td style="padding:4px 6px"><b>Excluir</b>: com "mesa", mas <u>sem</u> "redonda". Também <code>!redonda</code>.</td></tr>
            <tr><td style="padding:4px 6px"><code>ga*ete</code></td><td style="padding:4px 6px"><b>Curinga</b> <code>*</code>: qualquer trecho de texto no lugar do asterisco.</td></tr>
            <tr><td style="padding:4px 6px"><code>m?sa</code></td><td style="padding:4px 6px"><b>Curinga</b> <code>?</code>: exatamente um caractere no lugar da interrogação.</td></tr>
          </tbody>
        </table>
        <p style="margin:10px 0 4px"><b>Exemplos combinados</b></p>
        <ul style="margin:0 0 8px 18px; padding:0">
          <li><code>mesa;cadeira -gamer</code> — mesas, ou cadeiras que não sejam "gamer".</li>
          <li><code>"rack 42u";switch</code> — a frase "rack 42u", ou qualquer "switch".</li>
          <li><code>cam*;"ponto de acesso"</code> — tudo que começa com "cam" (câmera, camera...), ou a frase "ponto de acesso".</li>
        </ul>
        <p style="margin:0; color:var(--text-dim)">O texto digitado fica guardado enquanto a página não for recarregada (F5), mesmo fechando e abrindo a janela Objetos. Use o seletor "Ao buscar" para escolher entre manter as posições ou compactar o resultado.</p>
      </div>`;
