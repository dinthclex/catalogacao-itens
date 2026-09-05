/**
 * view3d.js — Navegação 3D em 1ª pessoa pelo ambiente mapeado.
 * Controles: W A S D mover, espaço pular, shift correr, mouse (ou arraste no
 * toque) para olhar em volta, botão esquerdo do mouse / toque no centro para
 * selecionar o item mirado (crosshair), abrindo um "flashcard 3D" (folha
 * voltada para o personagem) com as informações do item.
 *
 * Física simples (gravidade/pulo) e colisão básica contra as paredes do mapa,
 * no mesmo espírito matemático do motor (engine3d.js) — tudo sem bibliotecas.
 */

const View3D = {
  _container: null,
  _engine: null,
  _map: null,
  _running: false,
  _camera: { x: 0, y: 1.65, z: -3, yaw: 0, pitch: 0 },
  _vel: { y: 0 },
  _keys: {},
  _grounded: true,
  _joystick: { active: false, dx: 0, dy: 0, touchId: null },
  _look: { active: false, lastX: 0, lastY: 0, touchId: null },
  PLAYER_RADIUS: 0.32,
  // 1.65m — próximo da altura do olho humano em pé (pedido do usuário: "a
  // altura do ponto de vista da câmera deve ser 1,65m"; era 1.7m antes).
  EYE_HEIGHT: 1.65,
  // Degrau máximo que dá pra "subir (e agora também DESCER, ver _update
  // caso 2 da física de queda) andando" sem pular (ver
  // _surfaceHeightAt/_update). HISTÓRICO (pra quem for mexer aqui de novo):
  // 25/08/2026, 1ª versão usava 0.55m (achando que ajudaria a "subir em
  // cima dos objetos"), só que isso fazia o jogador ser erguido
  // AUTOMATICAMENTE em cima de qualquer objeto baixo (a maioria do catálogo
  // tem menos de 55cm) só de ANDAR por cima da área dele — dava a impressão
  // de "a câmera está mais alta do que devia", mesmo sem a pessoa tentar
  // subir em nada; foi reduzido pra 0.08m (só uma tolerância pra
  // imperfeições/irregularidades do próprio chão, tipo um "meio-fio"), com
  // subida em objetos mais altos ficando só por pulo (a física de queda já
  // pousa em cima de qualquer altura vinda de CIMA, sem limite nenhum — ver
  // comentário grande em _surfaceHeightAt). MESMO DIA, pedido do usuário
  // seguinte reverteu esse raciocínio de propósito: "Se houver objetos com
  // altura de até 60cm o personagem deve subir automaticamente, sem
  // precisar pular" — ou seja, o efeito "erguido sozinho ao andar por cima"
  // que motivou a redução anterior é agora o comportamento DESEJADO (com um
  // teto explícito de 60cm, coerentemente maior que a mesa de 0,74m citada
  // acima — essa continua exigindo pulo). Voltar a reduzir este valor sem
  // reler os dois pedidos do usuário desfaria um dos dois de propósito.
  STEP_MAX: 0.6,
  CROUCH_NOTE: null,

  async mount(container, { ambienteId } = {}) {
    this._container = container;
    // NOVO (02/09/2026) — garante que tipos de objeto CUSTOMIZADOS (criados
    // via "➕ Criar novo modelo" em Modelos3DView, ver js/modelos3d.js) já
    // apareçam corretamente aqui (perfil/ícone registrados em
    // OBJECT3D_PROFILES/Icons.MAP_OBJECT_EXTRAS) mesmo que o usuário nunca
    // tenha visitado a tela "modelos padrão" nesta carga de página —
    // idempotente, seguro chamar de mais de um lugar (ver
    // ensureCustomTypesRegistered em modelos3d.js).
    if (typeof Modelos3DView !== 'undefined') { await Modelos3DView.ensureCustomTypesRegistered(); }
    container.innerHTML = `
      <div class="view3d-wrap">
        <canvas id="v3d-canvas"></canvas>
        <div class="crosshair"></div>
        <!-- Pedido do usuário (03/09/2026): anel de bússola 3D — anel grosso
             branco transparente com os pontos cardeais/colaterais, centrado
             junto do crosshair. O grupo interno (.v3d-compass-ring-inner) gira
             visualmente conforme a câmera gira (ver atualização em _loop,
             perto de #v3d-pos) — a rotação usa transform:rotate(-yawDeg) pra
             manter cada rótulo alinhado com a direção real que ele indica.
             Clique num rótulo de direção gira suavemente o personagem para lá
             (ver _giroBussola3DParaDirecao/this._compassTurnTo em _update) —
             como o Pointer Lock manda TODO clique real pro <canvas> enquanto
             travado (ver onPointerLockChange abaixo), esses botões só recebem
             o clique quando o usuário já apertou Esc (destravado), que é
             exatamente o comportamento pedido. -->
        <div class="v3d-compass-ring" id="v3d-compass-ring" aria-hidden="true">
          <div class="v3d-compass-ring-inner" id="v3d-compass-ring-inner">
            <div class="v3d-compass-border"></div>
            <button type="button" class="v3d-compass-dir v3d-compass-cardeal" data-bearing="0" style="--dx:0; --dy:-1;" title="Norte">N</button>
            <button type="button" class="v3d-compass-dir v3d-compass-colateral" data-bearing="0.7853981633974483" style="--dx:0.70710678; --dy:-0.70710678;" title="Nordeste">NE</button>
            <button type="button" class="v3d-compass-dir v3d-compass-cardeal" data-bearing="1.5707963267948966" style="--dx:1; --dy:0;" title="Leste">E</button>
            <button type="button" class="v3d-compass-dir v3d-compass-colateral" data-bearing="2.356194490192345" style="--dx:0.70710678; --dy:0.70710678;" title="Sudeste">SE</button>
            <button type="button" class="v3d-compass-dir v3d-compass-cardeal" data-bearing="3.141592653589793" style="--dx:0; --dy:1;" title="Sul">S</button>
            <button type="button" class="v3d-compass-dir v3d-compass-colateral" data-bearing="3.9269908169872414" style="--dx:-0.70710678; --dy:0.70710678;" title="Sudoeste">SO</button>
            <button type="button" class="v3d-compass-dir v3d-compass-cardeal" data-bearing="4.71238898038469" style="--dx:-1; --dy:0;" title="Oeste">O</button>
            <button type="button" class="v3d-compass-dir v3d-compass-colateral" data-bearing="5.497787143782138" style="--dx:-0.70710678; --dy:-0.70710678;" title="Noroeste">NO</button>
          </div>
        </div>
        <!-- Pedido do usuário (28/08/2026): recurso visual do estado do
             Pointer Lock (1o clique pede o lock, so o 2o ja interage
             direto com o canvas) — ver comentario detalhado em
             _bindDesktopControls (onPointerLockChange) e o CSS da classe
             v3d-lockstate em style.css. -->
        <div class="v3d-lockstate" id="v3d-lockstate"><span class="v3d-lockstate-hint">🖱️ Clique para interagir com o cenário 3D</span></div>
        <div class="camera-topbar">
          <button class="icon-btn" id="v3d-close" title="Sair da visualização 3D e voltar para o Mapa">✕ Sair do 3D</button>
          <select class="icon-btn" id="v3d-mode" title="Estilo de renderização das paredes/piso">
            <option value="solido">Sólido</option>
            <option value="colorido">Colorido (câmera)</option>
            <option value="wireframe">Wireframe</option>
            <option value="hibrido">Sólido+wireframe (desempenho)</option>
          </select>
          <!-- Badge "3D" no canto (mesmo tratamento do ⚙️ de Configurações
               do mapa 2D, #map-config em mapview.js — ver .icon-btn-corner/
               .icon-btn-corner-badge em style.css, pedido do usuário: "assim
               como o ícone de configurações do 2D tem um '2D' no desenho do
               ícone, faça o mesmo para o ícone de configurações 3D"). -->
          <!-- "🧊 Novo Cubo 3D" — pedido do usuário (28/08/2026): "Onde fica o
               botão para inserir um cubo 3D no mapa 3D?" O botão já existia
               (mapview.js, barra de ferramentas do MAPA 2D), mas o pedido
               original do Modelador era "Isso fica DENTRO da visualização 3D
               já existente" — então precisa TAMBÉM existir aqui, direto na
               tela 3D, sem precisar voltar pro 2D. Cria o objeto na posição
               à frente de onde o jogador está olhando (mesma lógica de
               "objeto na mira", ver cameraForward em mapconfig.js) e entra
               direto no Modelador, em Modo de Edição. -->
          <button class="icon-btn" id="v3d-newcube3d" title="Cria um cubo novo (editável no Modelador 3D — vértices/arestas/faces) à sua frente e já abre o Modelador pra esculpi-lo">🧊 Novo Cubo</button>
          <!-- NOVO (03/09/2026), pedido verbatim (item 6): "Deve haver um
               botão de busca no 3D, para buscar patrimônios, objetos ou
               coordenadas do mapa [...] a câmera do personagem sobe vai em
               arco para o destino e pousa no destino." Ver
               _openView3DSearch/flyCameraToArc. -->
          <button class="icon-btn" id="v3d-search" title="Buscar patrimônio, objeto ou coordenada (x,y) e viajar até lá em arco">🔍 Buscar</button>
          <button class="icon-btn icon-btn-corner" id="v3d-config" title="Configurações do 3D (raycasting/destaque)">⚙️<span class="icon-btn-corner-badge">3D</span></button>
        </div>
        <div class="hud3d">
          <span>WASD mover · espaço pular · shift correr · clique seleciona</span>
          <span id="v3d-pos"></span>
          <span id="v3d-fps"></span>
        </div>
        <!-- HUD "estilo jogo" da ferramenta "📍 Adicionar orb" (pedido do
             usuário, 26/08/2026): "deve aparecer... a quantidade total de
             patrimônios já cadastrados... que faltam associar... já
             associados... A visão deve ser como um jogo o qual o objetivo é
             associar todos os patrimônios que ainda não foram associados a
             um objeto." Só visível com a ferramenta 📍 ativa — ver
             _refreshOrbHud, chamado por _selectBuildTool/_addOrbWithTool. -->
        <div class="v3d-orb-hud hidden" id="v3d-orb-hud">
          <div class="v3d-orb-hud-title">📍 Tarefa: associar os patrimônios</div>
          <div class="v3d-orb-hud-bar"><div class="v3d-orb-hud-bar-fill" id="v3d-orb-hud-fill"></div></div>
          <div class="v3d-orb-hud-stats">
            <span class="v3d-orb-hud-stat" title="Total de patrimônios cadastrados no catálogo">📦 <b id="v3d-orb-hud-total">0</b></span>
            <span class="v3d-orb-hud-stat v3d-orb-hud-stat-ok" title="Patrimônios já associados a um objeto no mapa">🔗 <b id="v3d-orb-hud-assoc">0</b></span>
            <span class="v3d-orb-hud-stat v3d-orb-hud-stat-warn" title="Patrimônios que ainda faltam associar a um objeto">❗ <b id="v3d-orb-hud-falta">0</b></span>
          </div>
          <div class="v3d-orb-hud-win hidden" id="v3d-orb-hud-win">🎉 Todos os patrimônios já foram associados!</div>
        </div>
        <div class="mobile-joystick hidden" id="v3d-joystick" title="Arraste para andar"><div class="knob"></div></div>
        <button class="mobile-jumpbtn hidden" id="v3d-jumpbtn" title="Pular">Pular</button>
        <button class="mobile-runbtn hidden" id="v3d-runbtn" title="Segurar para correr">Correr</button>
        <!-- "Inventário" de construção, estilo hotbar de jogo (pedido do
             usuário: "assim como no jogo Minecraft") — 5 ferramentas fixas
             (Mirar/nenhuma, Parede, Porta, Janela) mais 2 slots roláveis
             (Objeto/Item, cada um passeia pela própria lista com o SCROLL do
             mouse — ver _bindDesktopControls). Ver _initBuildHotbar. -->
        <div class="v3d-hotbar" id="v3d-hotbar"></div>
        <!-- "Roleta" de seleção — aparece quando a ferramenta Objeto/Item está
             ativa (pedido do usuário: "uma roleta deve aparecer no meio da
             tela um pouco para a direita. E conforme o girar da roda do
             mouse vai varrendo a lista... Se ficar algum tempo, então, o
             restante da roleta se esmaece e fica só o desenho do objeto").
             Ver _renderRoulette/_showRoulette/_hideRoulette. -->
        <div class="v3d-roulette hidden" id="v3d-roulette"><div class="v3d-roulette-list" id="v3d-roulette-list"></div></div>
        <!-- Pedido do usuário (rodada 47): "Há um botão na borda direita da
             tela em Mapa->Foto, quando clicado um menu aparece. Faça algo
             semelhante no 3D para abrir a lista com os objetos. Em vez de
             ser uma seta, faça um '+' e coloque no canto direito, logo
             abaixo da impressão do hud no canvas." — mesmo padrão do menu
             lateral de ambientephotos.js (.ambphotos-sidemenu-toggle/
             .ambphotos-sidemenu), adaptado: botão "+" (não seta) abaixo do
             HUD de FPS (não no meio vertical da tela), e o painel é uma
             TABELA (não mais uma roleta) com TODOS os objetos do catálogo
             (inclusive "Cubo", ver Icons.MAP_OBJECT_EXTRAS) — outro jeito de
             escolher o objeto ativo pro botão 📦 Objeto do rodapé colocar,
             além do rolar da roda do mouse que já existia. Ver
             _toggleObjectCatalogPanel/_renderObjectCatalogPanel. -->
        <button type="button" class="v3d-objcat-toggle" id="v3d-objcat-toggle" title="Escolher objeto para colocar (tabela)">+</button>
        <!-- HISTÓRICO (02/09/2026) resumido: este botão "+" da lateral
             ESQUERDA passou por 4 rodadas de correção do usuário. Tentei
             primeiro um botão novo separado; depois o MESMO botão do
             Modelador (mesmo id/visual); depois mirar um objeto pra editar
             ou criar um cubo novo se nada mirado; depois abrir o MESMO
             catálogo de objetos (tabela) que o botão direito abre.
             CORRIGIDO DE NOVO E DEFINITIVO (pedido verbatim): "no botão '+'
             da lateral esquerda, deve ter os botões que tinha antes. Não é
             para abrir o mesmo menu que o botão direito abre. Era só uma
             comparação da não necessidade de estar vinculado ao Modelador
             (isto deve permanecer)." Ou seja: a parte de "não precisa
             estar vinculado ao Modelador" estava CERTA (mantida — sem
             mira/raycast, sem exigir uma sessão de edição já aberta) — o
             que estava ERRADO era reaproveitar o catálogo do botão
             DIREITO. Confirmado com o usuário (AskUserQuestion): o painel
             certo é o mesmo painel "Criar" > "Adicionar Primitiva" que o
             Modelador tem no SEU PRÓPRIO botão "+" esquerdo (grupos Mesh/
             Lâmpada/Outros, PRIMITIVE_CATALOG, ver modeler-ui.js) — só
             que aqui, longe de qualquer sessão de edição em andamento,
             clicar num botão de primitiva CRIA UM OBJETO NOVO na cena
             (mesmo espírito do botão "🧊 Novo Cubo") já com aquela forma, e
             entra no Modelador editando ele — ver
             _createPrimitiveObjectAndEnter mais abaixo e
             ModelerUI.toggleSidebar/renderSidebar/_buildCriarPanelBase
             (modeler-ui.js, sidebar UNIFICADO — ver correção mais recente
             logo abaixo). A aba "Ferramentas" (Editar/
             Histórico) do Modelador NÃO aparece aqui — só faz sentido
             dentro de uma edição já em andamento, que este botão não
             pressupõe.
             CORRIGIDO/UNIFICADO PRA VALER (03/09/2026) — bug relatado: "os
             botões do Modelador acabaram ficando em cima dos botões do menu
             lateral esquerdo." Causa raiz: este botão nascia com id PRÓPRIO
             (v3d-addobj-toggle-left, na mesma posição/classe CSS do "+" que
             o Modelador desenhava com OUTRO id, m3d-sidebar-toggle) — os
             dois coexistiam no DOM sempre que o Modelador estava aberto, se
             sobrepondo. Pedido verbatim (rodada seguinte): "os dois
             [painéis], unificados." Decisão tomada: em vez de só esconder
             um dos dois enquanto o outro está ativo (paliativo já
             descartado numa 1ª tentativa), o botão/painel viraram um único
             elemento de verdade — id "m3d-sidebar-toggle"/"m3d-sidebar-
             panel", construído AQUI, uma única vez, no mount() (nunca mais
             recriado pelo Modelador) — o Modelador (modeler-ui.js) passou a
             reaproveitar ESTE MESMO elemento, só acrescentando a aba
             "Ferramentas" quando ativo (ver ModelerUI._sidebarCtx/
             toggleSidebar/renderSidebar/refreshSharedSidebar, e os ganchos
             em Modeler3D.enter/exit, modeler-core.js). Nunca mais dois
             elementos na mesma posição, porque nunca mais existe um
             segundo elemento.
             Reaproveita as MESMAS classes CSS do painel "Criar" do
             Modelador (.m3d-sidebar-panel/.m3d-sidebar-content/
             .m3d-sidebar-btngrid/.m3d-sidebar-primbtn, css/modeler3d.css —
             nenhuma delas depende de estar dentro de .m3d-root, só o
             position:absolute de .m3d-sidebar-panel/.m3d-sidebar-
             toggle, que aqui posiciona certinho em relação ao mesmo
             ancestral posicionado que já faz #v3d-objcat-panel funcionar
             do lado direito). Mantido (pedido de rodada anterior, ainda
             válido): "ao capturar o mouse, não é mais possível clicar
             ali... só é possível clicar fora dessa 'captura'" — Pointer
             Lock faz TODO clique cair no canvas (é assim que a API
             funciona: travado, o clique nunca chega num elemento
             sobreposto, mesmo visualmente por cima) — resolvido com um
             cursor VIRTUAL (this._lockCursorX/Y, acumulado de
             movementX/Y, mesma técnica já usada dentro do Modelador pro
             "cursor infinito", ver modeler-input.js
             _onMouseMove/state.mouse.vx/vy): o próprio onClick do canvas,
             quando travado, confere se esse cursor virtual está em cima
             do botão e, se estiver, chama ModelerUI.toggleSidebar(this) direto em
             vez de interagir com a cena — ver onClick/onMouseMove mais
             abaixo. O botão recebe destaque visual (classe .active) quando
             o cursor virtual passa por cima dele com o ponteiro travado. -->
        <!-- VERIFICAÇÃO (03/09/2026), pedido do usuário: "é único ou tem dois
             dele?" — resposta: ÚNICO. Confirmado lendo modeler-ui.js inteiro:
             ele só faz container.querySelector('#m3d-sidebar-toggle') (ver
             refreshSharedSidebar) pra reaproveitar ESTE elemento, nunca cria
             um botão/document.createElement próprio pra ele — é dele
             mesmo, do 3D (view3d.js), não do Modelador; o Modelador só
             acrescenta uma aba a mais dentro do painel quando está ativo. -->
        <button type="button" class="m3d-btn m3d-sidebar-toggle" id="m3d-sidebar-toggle" title="Criar / Ferramentas">+</button>
        <div class="m3d-sidebar-panel" id="m3d-sidebar-panel">
          <div class="m3d-sidebar-tabs" id="m3d-sidebar-tabs"></div>
          <div class="m3d-sidebar-content" id="m3d-sidebar-content"></div>
        </div>
        <div class="v3d-objcat-panel hidden" id="v3d-objcat-panel">
          <div class="v3d-objcat-panel-title">Objetos padrão</div>
          <div class="v3d-objcat-panel-list" id="v3d-objcat-panel-list"></div>
        </div>
        <!-- Pedido do usuário (rodada 48): "Deve haver uma animação de um
             óculos sendo colocado na câmera. Apenas um óculos 3D, com lentes
             de alguma cor que faça lembrar o raio-x." — SVG puramente
             decorativo (a mudança REAL de material já acontece no mesmo
             instante, ver _toggleGlobalXRay); a animação CSS (classe
             "v3d-xray-glasses-play", ver css/style.css) desce o óculos de
             cima da tela até o centro e depois some sozinho. -->
        <div class="v3d-xray-glasses" id="v3d-xray-glasses" aria-hidden="true">
          <svg viewBox="0 0 120 46" width="220" height="84">
            <g stroke="#1a1a1a" stroke-width="3" fill="none">
              <circle cx="30" cy="23" r="20" fill="rgba(255,60,60,0.55)"/>
              <circle cx="90" cy="23" r="20" fill="rgba(255,60,60,0.55)"/>
              <line x1="50" y1="20" x2="70" y2="20"/>
              <line x1="10" y1="12" x2="0" y2="6"/>
              <line x1="110" y1="12" x2="120" y2="6"/>
            </g>
          </svg>
        </div>
      </div>
    `;

    // Config lida ANTES de criar o motor (diferente de antes) — resolução/
    // antialiasing só têm efeito de verdade se já estiverem certos na
    // primeira montagem da cena (ver comentário no construtor de Engine3D);
    // pegar a config só DEPOIS deixaria a 1ª abertura sempre com os padrões
    // fixos, corrigindo só a partir da 2ª troca de configuração.
    const cfgInicial = (typeof MapConfig !== 'undefined') ? await MapConfig.get() : null;
    const canvas = container.querySelector('#v3d-canvas');
    this._engine = new Engine3D(canvas, cfgInicial);

    // Modo de renderização padrão (Configurações › 🧊 Visualização 3D —
    // st-rendermode/render3dModo): aplica ANTES da primeira montagem da cena
    // (_rebuildScene abaixo), e reflete no próprio seletor do cabeçalho do
    // visualizador, pra abrir já no estilo escolhido em vez de sempre "Sólido".
    const modoPadrao3D = await DB.getSetting('render3dModo', 'solido');
    this._engine.setMode(modoPadrao3D);
    const modeSelInicial = container.querySelector('#v3d-mode');
    if (modeSelInicial) modeSelInicial.value = modoPadrao3D;

    if (typeof MapConfig !== 'undefined') {
      this._onMapConfigChange = (c) => {
        // modoLuminarias3D (ver mapconfig.js/engine3d.js _tintForLight) é
        // decidido na HORA DE MONTAR a cena (luz de verdade x cor estática),
        // não algo que setConfig sozinho consiga trocar ao vivo — precisa
        // remontar a cena (setScene de novo) pra pegar efeito na hora, sem
        // exigir reabrir o 3D (diferente do antialiasing, ver painel).
        const modoAntes = this._engine?._config?.modoLuminarias3D;
        // `paredeJuncaoTipo` (pedido do usuário, seção "🧱 Parede" — ver
        // mapconfig.js) MUDA a malha construída em setScene (as "capas" de
        // quina, ver engine3d.js _buildCornerFillMesh) — mesmo motivo do
        // modoLuminarias3D acima: só `setConfig` não é suficiente, precisa
        // remontar a cena pra pegar efeito com o 3D já aberto.
        const juncaoAntes = this._engine?._config?.paredeJuncaoTipo;
        // `itemAssociado3DContorno`/`itemAssociado3DSelo` (seção "🔗 Item
        // associado", pedido do usuário 26/08/2026) — MESMO motivo das duas
        // acima: a malha do destaque (contorno/selo) é montada junto com o
        // objeto em `_buildOneObjectMesh`, não recalculada a cada quadro.
        const contornoAntes = this._engine?._config?.itemAssociado3DContorno;
        const seloAntes = this._engine?._config?.itemAssociado3DSelo;
        // `destaqueExtra3DRaioAtivo`/`destaqueExtra3DDouradoAtivo` ("Destacar
        // mais", pedido do usuário 26/08/2026, 2ª rodada — dois efeitos
        // independentes agora, ver mapconfig.js DEFAULTS) — MESMO motivo das
        // outras acima: o facho de luz/halo dourado extra (ver engine3d.js
        // _addBeaconDestaque/_addAnelDouradoDestaque3D) é montado junto com o
        // objeto/pino de item em setScene, não recalculado a cada quadro.
        const destaqueRaioAntes = this._engine?._config?.destaqueExtra3DRaioAtivo;
        const destaqueDouradoAntes = this._engine?._config?.destaqueExtra3DDouradoAtivo;
        // "Ver através das paredes" — três interruptores independentes
        // (pedido do usuário 26/08/2026, 3ª rodada: "deve ser uma subseção
        // com três opções que podem ser marcadas individualmente") — MESMO
        // motivo: o `depthTest` de cada peça (plaquinha/bolinha/flags, halo
        // dourado, facho azul) é decidido na hora de montar a malha/sprite.
        const atravesParedesPlaquinhaAntes = this._engine?._config?.itemBadge3DAtravesParedesAtivo;
        const atravesParedesDouradoAntes = this._engine?._config?.anelDourado3DAtravesParedesAtivo;
        const atravesParedesRaioAntes = this._engine?._config?.raioAzul3DAtravesParedesAtivo;
        this._engine?.setConfig(c);
        if (c.modoLuminarias3D !== modoAntes || c.paredeJuncaoTipo !== juncaoAntes
          || c.itemAssociado3DContorno !== contornoAntes || c.itemAssociado3DSelo !== seloAntes
          || c.destaqueExtra3DRaioAtivo !== destaqueRaioAntes || c.destaqueExtra3DDouradoAtivo !== destaqueDouradoAntes
          || c.itemBadge3DAtravesParedesAtivo !== atravesParedesPlaquinhaAntes
          || c.anelDourado3DAtravesParedesAtivo !== atravesParedesDouradoAntes
          || c.raioAzul3DAtravesParedesAtivo !== atravesParedesRaioAntes) this._rebuildScene();
        // Snaps da ferramenta 🧱 Parede (ver _resolveWallSnap) são lidos a
        // cada QUADRO (dentro de _updateBuildGhost, chamado no loop de
        // render) — não dá pra usar `await MapConfig.get()` ali (sem
        // `await` num laço síncrono por quadro), então a config fica
        // cacheada aqui, igual a `_camada3DConfig` logo abaixo em mount().
        this._paredeConfig = c;
        // Pedido do usuário (03/09/2026) — opção "🧭 Bússola 3D" em
        // Configurações 3D: aplica ao vivo se o usuário mudar enquanto o 3D
        // já está aberto (ver _applyBussola3DVisibilidade).
        this._applyBussola3DVisibilidade(c.bussola3DAtiva);
      };
      MapConfig.onChange(this._onMapConfigChange);
    }
    // Estado inicial do anel de bússola (config já lida acima em cfgInicial)
    // — ver DEFAULTS.bussola3DAtiva em mapconfig.js.
    this._applyBussola3DVisibilidade(cfgInicial?.bussola3DAtiva);

    const id = ambienteId || (await DB.getSetting('ambienteAtualId', null));
    this._map = id ? await DB.getMap(id) : null;
    if (!this._map) { Utils.toast('Nenhum ambiente/mapa selecionado ainda.', { type: 'warn' }); }
    else {
      Mapping.ensureNewFields(this._map); // ambientes salvos antes desta versão não têm cameras[]/objects[] ainda
      // Pedido do usuário (22/08/2026): "só pode haver itens na grade
      // associados a alguma camada" — cura paredes/objetos/etc. SEM camada
      // válida (mapas salvos antes desta correção) ANTES de montar a cena,
      // senão eles ficariam "presos visíveis" (ver isLayerVisible) mesmo
      // com todas as camadas desligadas. Ver Mapping.ensureAllElementsLayered.
      if (Mapping.ensureAllElementsLayered(this._map)) await DB.saveMap(this._map);
      await this._buildItensNoMapa();
      await this._rebuildScene();
    }
    // Camada que estava ativa no 2D no momento em que "Ver em 3D" foi
    // clicado — guardada AQUI (e não lida de novo depois) porque, uma vez
    // dentro do 3D, não há mais "a camada ativa do 2D" pra consultar ao
    // vivo (a tela do Mapa nem está montada). Usada só se a configuração
    // "⚙️ Configurações do mapa › Itens construídos dentro do 3D" (ver
    // mapconfig.js — mudou de "Configurações do app" pra cá, pedido do
    // usuário) estiver em "atual" — ver _layerIdParaNovosItens, chamado em
    // _placeWithBuildTool. Lido de `cfgInicial` (já buscado acima, não de
    // novo) — MapConfig.get() é cacheado, então não tem custo extra, só
    // evita uma 2ª leitura redundante.
    this._layerIdOrigem2D = window.MapView?._activeLayerId || null;
    this._camada3DConfig = cfgInicial?.camada3DNovosItens || 'separada';
    this._layer3DId = null; // resolvido de novo (achado ou criado) na 1ª construção deste mount — ver _layerIdParaNovosItens
    // Config da seção "🧱 Parede" (snaps/junção — ver mapconfig.js e
    // _resolveWallSnap abaixo) — lida uma vez aqui (cfgInicial já buscado
    // acima) e mantida atualizada por _onMapConfigChange, MESMO motivo de
    // `_camada3DConfig`: _updateBuildGhost roda a cada quadro, sem `await`.
    this._paredeConfig = cfgInicial || {};

    // Ponto de partida: por padrão, uma posição fixa genérica — mas se
    // alguma câmera do mapa estiver marcada como "ativa para o 3D" (botão
    // "🎥 Ver em 3D a partir desta câmera" no submenu da câmera, mapview.js —
    // só uma por vez), a visualização já abre a partir da posição/direção
    // dela, em vez do ponto fixo. `yaw` usa a MESMA conversão ângulo->direção
    // já usada pra desenhar a malha da câmera em 3D (engine3d.js setScene),
    // pra a visão inicial apontar exatamente pra onde o ícone da câmera
    // aponta no mapa 2D.
    this._camera = { x: 0, y: this.EYE_HEIGHT, z: -3, yaw: 0, pitch: 0 };
    // Pedido do usuário: alternar gravidade com Shift+Espaço (ver onKeyDown)
    // — padrão LIGADA no modo normal de navegação (mantém o comportamento
    // de sempre: andar gruda no chão/sobe em objetos, pular funciona).
    this._gravityEnabled = true;
    const camAtiva = (this._map?.cameras || []).find((c) => c.ativo3D);
    if (camAtiva) {
      const baseY = (camAtiva.piso || 0) * 2.8;
      // Conversão ângulo (convenção 2D: 0 = eixo X, ver mapview.js) -> yaw do
      // jogador. NÃO é `Math.atan2(dirX, dirZ)` (essa fórmula é a certa só
      // pra orientar MALHAS do Three.js via mesh.rotation.y — ver a câmera/
      // paredes em engine3d.js setScene) — o cameraForward/cameraForwardFlat
      // deste app (Cam3DMath.rotY, usado por lookAt/movimento) gira no
      // sentido CONTRÁRIO ao mesh.rotation.y nativo do Three.js (ver o
      // comentário grande sobre "handedness" em cameraRightFlat, no topo de
      // engine3d.js). Resolvendo forward(yaw) = (cos(angulo), sin(angulo))
      // com a rotação PRÓPRIA deste app dá yaw = angulo - 90°, não atan2.
      const yaw = (camAtiva.angulo || 0) - Math.PI / 2;
      this._camera = { x: camAtiva.x, y: baseY + this.EYE_HEIGHT, z: camAtiva.y, yaw, pitch: 0 };
    } else if (window.MapView && window.MapView._personagem2D) {
      // Pedido do usuário: "A posição e a direção do boneco no 2D deve
      // corresponder a posição e a direção do boneco no 3D [...] Ambas do
      // mesmo boneco (player ou personagem)." Sem uma câmera marcada como
      // "ativa para o 3D" (prioridade continua sendo dela, acima), usa a
      // posição/direção do personagem 2D (MapView._personagem2D, só existe
      // depois de o "🧭 Modo Navegação" ter sido usado ao menos uma vez no
      // Mapa) como ponto de partida do 3D — mesma conversão ângulo->yaw do
      // ramo camAtiva acima (mesma convenção: 0 = eixo X, sentido anti-
      // horário no 2D). `this._syncPersonagem2DAoSair`, mais abaixo em
      // unmount(), faz o caminho INVERSO ao sair do 3D, pra o personagem 2D
      // continuar de onde o jogador parou de andar no 3D — os dois sempre
      // "o mesmo boneco", só a câmera (top-down vs. 1ª pessoa) muda.
      const p2d = window.MapView._personagem2D;
      const yaw = (p2d.angulo || 0) - Math.PI / 2;
      this._camera = { x: p2d.x, y: this.EYE_HEIGHT, z: p2d.y, yaw, pitch: 0 };
    }

    // App.closeView3D (não App.navigate('mapa')) — volta pra Planta baixa
    // direto, de onde "Ver em 3D" foi clicado, em vez de reiniciar a pilha
    // do Mapa na tela de entrada (pedido do usuário, ver comentário lá).
    container.querySelector('#v3d-close').onclick = () => { document.exitPointerLock?.(); App.closeView3D(); };
    const modeSel = container.querySelector('#v3d-mode');
    modeSel.onchange = () => { this._engine.setMode(modeSel.value); this._rebuildScene(); };
    container.querySelector('#v3d-config').onclick = () => this._openMapConfig();
    // "🧊 Novo Cubo" (ver comentário grande junto do botão, acima, no HTML)
    // — mesmo caminho do botão irmão em mapview.js (Mapping.addObject +
    // Modeler3D.ensureCustomMesh + o "combinado" window.__modelerPendingObjectId
    // que mount() já lê, ver logo acima), só que a posição de nascimento é
    // 1,2m à FRENTE de onde o jogador está olhando agora (cameraForwardFlat,
    // MESMA função usada pelo movimento/mira do resto do 3D), não o centro
    // da tela do 2D — faz mais sentido "aparecer na minha frente" estando
    // dentro do próprio 3D.
    // Extraído (02/09/2026) pra `_createAndEnterNewCube3D`. Usado só pelo
    // botão "🧊 Novo Cubo" — NÃO tem mais relação com o botão "+" esquerdo
    // (ver comentário grande junto ao HTML dele: foi desvinculado do
    // Modelador e não cria mais cubo nenhum, só abre o catálogo).
    container.querySelector('#v3d-newcube3d').onclick = () => this._createAndEnterNewCube3D();
    container.querySelector('#v3d-search').onclick = () => this._openView3DSearch();

    await this._initBuildHotbar();
    container.querySelector('#v3d-objcat-toggle').onclick = () => this._toggleObjectCatalogPanel();
    // CORRIGIDO/UNIFICADO (03/09/2026), pedido verbatim: "no botão '+' da
    // lateral esquerda, deve ter os botões que tinha antes. Não é para
    // abrir o mesmo menu que o botão direito abre" + (rodada seguinte,
    // relatando o bug de sobreposição) "os dois [painéis], unificados." O
    // botão "+" esquerdo AGORA é o MESMO elemento (`#m3d-sidebar-toggle`)
    // que o Modelador usava pro seu próprio "+"/painel Ferramentas/Criar —
    // construído aqui, UMA VEZ, e reaproveitado pelo Modelador quando ele
    // entra (só ganha a aba "Ferramentas" a mais, ver
    // `ModelerUI.refreshSharedSidebar`/`_sidebarCtx`, modeler-ui.js) — nunca
    // mais dois elementos na mesma posição. Ver comentário grande junto ao
    // HTML do botão, acima.
    const addObjBtnLeft = container.querySelector('#m3d-sidebar-toggle');
    if (addObjBtnLeft) {
      this._addObjBtnEl = addObjBtnLeft;
      addObjBtnLeft.onclick = () => ModelerUI.toggleSidebar(this);
    }
    this._bindDesktopControls(canvas);
    this._bindMobileControls(container);

    this._running = true;
    this._lastT = performance.now();
    this._lastRenderT = 0;
    this._loopHandle = requestAnimationFrame((t) => this._loop(t));

    // Pedido do usuário: HUD (FPS/CPU/RAM) ancorado no canto superior
    // direito DO CANVAS (não da janela), nos dois modos (normal e
    // Modelador) — ver comentário em `Perf.setCanvasAnchor`.
    window.Perf?.setCanvasAnchor?.(container.querySelector('.view3d-wrap'));

    // "🔧 Modelar em 3D" (mapview.js, painel do objeto — pedido do usuário,
    // 28/08/2026): se o painel 2D pediu pra abrir já editando um objeto
    // específico, entra direto no modelador assim que a cena termina de
    // montar (setTimeout(0) — dá tempo do motor/scene/pickables acima
    // ficarem totalmente prontos antes do modelador mexer neles). "Combinado"
    // via `window.__modelerPendingObjectId` em vez de um parâmetro a mais em
    // mount()/App.openView3D (ver comentário grande em mapview.js
    // #obj-modelar) — mais simples, sem mudar nenhuma assinatura existente.
    if (window.__modelerPendingObjectId && this._map) {
      const pid = window.__modelerPendingObjectId;
      window.__modelerPendingObjectId = null;
      const alvo = (this._map.objects || []).find((o) => o.id === pid);
      if (alvo && window.Modeler3D) setTimeout(() => window.Modeler3D.enter(this, alvo), 0);
    }
  },

  unmount() {
    // Sessão do Modelador 3D (js/modeler/*.js) em andamento? Encerra AGORA
    // (salvando o que estava editado) antes do resto da limpeza abaixo —
    // `this._engine.dispose()`, logo adiante, destrói cena/malhas/listeners
    // que o modelador ainda referencia; sair da Visualização 3D com o
    // modelador aberto (ex.: botão "✕ Sair do 3D" clicado sem antes fechar o
    // modelador) não pode deixar listeners/estado órfãos presos no `canvas`
    // antigo (o mesmo tipo de vazamento que os outros unbinds desta função já
    // evitam para os controles do próprio View3D).
    if (window.Modeler3D?.isActive?.()) window.Modeler3D.exit({ skipRebuild: true });
    // Sobrevoo automático (rodada 48) ainda rodando ao sair do 3D — encerra
    // AGORA (grava a pose atual em `this._camera`) antes da sincronização
    // com `MapView._personagem2D` logo abaixo, senão ela gravaria a posição
    // de ANTES do sobrevoo começar (this._camera nunca é tocado enquanto ele
    // roda — ver _computeFlythroughPose/_loop).
    if (this._flythroughActive) this._finishFlythrough();
    // Desfaz a ancoragem do HUD no canvas (ver mount() acima) — volta pra
    // posição padrão (borda direita da janela) fora da Visualização 3D.
    window.Perf?.setCanvasAnchor?.(null);
    // Caminho INVERSO da sincronização feita em mount() (ver comentário lá):
    // ao sair do 3D, grava a posição/direção final do jogador de volta em
    // MapView._personagem2D, pra o pino do personagem no 2D aparecer onde a
    // pessoa realmente parou de andar no 3D (mesmo boneco, pedido do
    // usuário) — e pra uma próxima abertura do 3D (sem câmera "ativa"
    // marcada) continuar exatamente daqui. Só grava se havia mesmo uma
    // câmera montada (`this._camera` existe desde o início de mount(), mas
    // só faz sentido escrever de volta se chegou a haver mapa/cena de
    // verdade — `this._map`).
    if (this._camera && this._map && window.MapView) {
      // yaw -> ângulo 2D é o inverso exato da conversão em mount() (yaw =
      // angulo - 90°), logo angulo = yaw + 90°.
      const angulo = this._camera.yaw + Math.PI / 2;
      window.MapView._personagem2D = { x: this._camera.x, y: this._camera.z, angulo };
      // Pedido do usuário (rodada 49): "a opção 'Centrada no personagem' não
      // está funcionando [...] fui para o 3D, andei por lá, depois sai do 3D
      // e o mapa 2D fica na origem." Causa raiz: `_fitViewToMapContent`
      // (mapview.js) só roda automaticamente UMA VEZ por carregamento de
      // página (`_mapAutoFitDoneThisPageLoad`) — voltar do 3D pro 2D dentro
      // da MESMA sessão nunca disparava aquele código de novo, então a view
      // ficava congelada no valor da primeira vez que o Mapa foi aberto
      // (antes do personagem ter sido posicionado). NÃO dá pra chamar
      // `_fitViewToMapContent()` direto AQUI — `View3D.unmount()` roda ANTES
      // de `MapView.mountAfterView3D()` remontar o canvas do 2D (ver
      // app.js `closeView3D`), então o canvas/renderer ainda nem existiriam
      // nesse instante. Só marca um flag; `mapview.js` `mountAfterView3D`/
      // `_mountPlanta` consome esse flag e força o refit assim que o canvas
      // estiver pronto de novo.
      window.MapView._forceFitAfterView3D = true;
    }
    this._running = false;
    if (this._loopHandle) cancelAnimationFrame(this._loopHandle);
    document.exitPointerLock?.();
    this._unbindDesktopControls?.();
    clearTimeout(this._rouletteIdleTimer); // roleta de Objeto/Item (ver _renderRoulette) — não deixa um timer órfão disparar depois de sair do 3D
    // Libera o contexto WebGL/geometrias do motor 3D (engine3d.js, agora
    // baseado em Three.js) — sem isso, abrir/fechar a visualização 3D várias
    // vezes esgotaria o limite de contextos WebGL simultâneos do navegador.
    this._engine?.dispose?.();
    this._engine = null;
    if (this._onMapConfigChange && typeof MapConfig !== 'undefined') MapConfig.offChange(this._onMapConfigChange);
    this._onMapConfigChange = null;
    this._container = null;
  },

  /**
   * Monta a cena 3D a partir do mapa, mas primeiro "fecha" os cantos das
   * paredes (ver Mapping.analyzeWalls): retas desenhadas de forma independente
   * que não se tocam exatamente são prolongadas até se cruzarem, então o
   * canto resultante é usado para extrudar as paredes — sem isso, retas que
   * não colidem pixel-a-pixel apareceriam com uma fresta no 3D.
   */
  async _rebuildScene() {
    if (!this._map || !this._engine) return;
    const cornerJoinDist = await DB.getSetting('paredeUniaoDist', 0.5);
    // Pedido do usuário: "as camadas ativadas e desativadas na janela
    // 'camadas' devem ser aplicadas no 3D também" — filtra ANTES de fechar
    // os cantos (Mapping.analyzeWalls), pra uma parede de camada oculta nem
    // entrar no cálculo de junção de canto com as visíveis, e pra também
    // não aparecer raycastável/selecionável no 3D (ver comentário do método
    // abaixo). `this._map` em si NUNCA é filtrado — continua com tudo, é só
    // a CÓPIA usada pra montar a cena que perde o que estiver oculto.
    // Filtro de camadas ocultas (ver Mapping.filterByLayerVisibility,
    // compartilhado com a miniatura 3D do 2D — mapview.js). Como o painel
    // de Camadas só existe no 2D, não precisa reagir "ao vivo" aqui dentro:
    // a visibilidade só pode ter mudado ANTES de abrir/reconstruir o 3D.
    const mapaVisivel = Mapping.filterByLayerVisibility(this._map);
    const walls = Mapping.analyzeWalls(mapaVisivel, { cornerJoinDist });
    this._analyzedWalls = walls;
    this._engine.setScene({ ...mapaVisivel, walls });
  },

  /** Painel único de configurações do mapa 2D/3D (ver mapconfig.js), aberto
   *  aqui no contexto '3d': mostra as opções de raycasting (liga/desliga,
   *  estilo do destaque) que só fazem sentido em primeira pessoa, e a lista
   *  "cena toda" com selecionar/excluir. Diferente do 2D (que reabre um
   *  painel de edição completo por entidade), aqui "selecionar" só destaca
   *  com um toast — o 3D ainda não tem um painel de propriedades por
   *  entidade nem uma câmera que "voa até" o alvo escolhido. */
  async _openMapConfig() {
    if (!this._map) { Utils.toast('Nenhum ambiente/mapa selecionado.', { type: 'warn' }); return; }
    if (typeof MapConfig === 'undefined') { Utils.toast('Módulo de configurações não carregado.', { type: 'danger' }); return; }
    await MapConfig.open(this._map, {
      context: '3d',
      onSelect: (kind, entity) => {
        const nomes = { wall: 'Parede', camera: 'Câmera', object: 'Objeto', itemPin: 'Item' };
        Utils.toast(`${nomes[kind] || kind}: ${entity.label || entity.id}`, { type: 'ok' });
      },
      onDelete: async (kind, entity) => {
        if (kind === 'wall') Mapping.removeWall(this._map, entity.id);
        else if (kind === 'camera') Mapping.removeCamera(this._map, entity.id);
        else if (kind === 'object') Mapping.removeObject(this._map, entity.id);
        else if (kind === 'itemPin') {
          await DB.updateItem(entity.id, { mapaX: null, mapaY: null, mapaPiso: 0 });
          const items = await DB.getItemsByAmbiente(this._map.id);
          this._map.itens = items.filter((it) => typeof it.mapaX === 'number').map((it) => ({
            id: it.id, x: it.mapaX, y: it.mapaY, piso: it.mapaPiso || 0, label: it.patrimonio,
          }));
        }
        // Não espera DB.saveMap (mesmo motivo/comentário grande de
        // _afterMapMutated, acima) — só gravaria o mapa até 3s depois no
        // disco, sem NADA a ver com reconstruir a cena (que já lê
        // `this._map`, mutado em memória pelas linhas acima). Sem isto, a
        // peça excluída continuaria aparecendo na tela por até 3s.
        if (kind !== 'itemPin') DB.saveMap(this._map);
        await this._rebuildScene();
      },
    });
  },

  // ---------- "Inventário"/hotbar de construção (pedido do usuário: colocar
  // parede/porta/janela/objeto/item de DENTRO do 3D, "assim como no jogo
  // Minecraft" — scroll do mouse passeia pela lista de objetos ou itens,
  // clique fixa na posição mirada). O mapa (`this._map`) é o MESMO objeto
  // usado pelo editor 2D — qualquer coisa colocada aqui já é gravada nele
  // (DB.saveMap) e aparece no 2D normalmente na próxima vez que a Planta
  // baixa for aberta, e vice-versa (qualquer coisa colocada no 2D já
  // aparece aqui, porque a cena 3D é sempre remontada a partir do mesmo
  // `this._map` — ver _rebuildScene). Sem undo/redo (History) aqui dentro
  // por ora — escopo aceito, diferente do 2D. ----------

  /** Carrega o catálogo de objetos (mesmo de mapview.js/Icons) e a lista de
   *  patrimônios sem lugar (mesma de PhotoGrid/Caixa) pras duas listas
   *  roláveis da hotbar, e desenha a barra. Chamado uma vez no mount(). */
  async _initBuildHotbar() {
    this._buildTool = null;
    this._wallChainStart = null;
    // Rotação manual (em radianos) acumulada pelo botão do meio do mouse
    // (era o botão direito, trocado — ver handleMiddleClickAction) enquanto
    // a ferramenta Porta/Janela/Objeto está ativa — ver
    // handleMiddleClickAction em _bindDesktopControls e o uso em _updateBuildGhost/
    // _placeWithBuildTool. Pedido do usuário (24/08/2026): "o botão direito
    // do mouse deve servir para girar a porta 90 no sentido horário para
    // quem olha de cima (numa visão top-down, como no 2D)" — tanto "no ar"
    // (soma ao ângulo que a mira aponta) quanto encaixada numa parede (vira
    // `anguloExtra`, o mesmo campo que o 2D já usa pra girar uma porta/
    // janela presa à parede).
    //
    // Generalizado e trocado de 90° pra 45° (pedido do usuário, 25/08/2026:
    // "Para a colocação de portas, janelas e TODOS OS OBJETOS: Modo Padrão
    // (Snap 45°)... Clicar com o botão direito do mouse gira o objeto em
    // incrementos de 45°") — renomeado de `_buildDoorWindowRot` pra
    // `_buildManualRot` porque agora também vale pra ferramenta Objeto, não
    // só Porta/Janela (ver handleMiddleClickAction, _updateBuildGhost/
    // _placeWithBuildTool, ramo 'objeto'). Continua não se aplicando quando
    // um objeto está TRAVADO numa parede por física (ver
    // _resolveObjectWallSnap `locked`) — ali o giro é sempre paralelo à
    // parede, de propósito, senão furaria ela.
    this._buildManualRot = 0;
    // "Giro Livre" (tecla R, pedido do usuário 25/08/2026: "Ativar Giro
    // Livre: apertar R destrava os passos discretos e rotaciona
    // continuamente com base na sensibilidade do mouse... Desenhando um
    // traço pontilhado no chão, entre o ponto de eixo de giro e o ponto da
    // intersecção... do raytracing e o chão") — ver
    // _captureFreeRotatePivot/onKeyDown/_updateBuildGhost/_placeWithBuildTool.
    // `_buildFreeRotate` liga/desliga o modo; `_buildFreeRotatePivot`
    // congela POSIÇÃO (e, pra porta/janela encaixada, a parede-alvo) no
    // instante em que o modo é ativado — só o ÂNGULO (`_buildLastFreeAngle`)
    // continua variando quadro a quadro enquanto ele estiver ligado.
    this._buildFreeRotate = false;
    this._buildFreeRotatePivot = null;
    this._buildLastFreeAngle = null;
    this._buildFreeRotateFinalAngle = null; // ângulo final (com o travamento de 15° do Shift já aplicado — ver onKeyDown/_updateBuildGhost)
    this._buildFreeRotateRefAngulo = 0; // referência fixa do "transferidor" de 45° durante o Giro Livre — ver onKeyDown
    // "Alinhamento cardinal" (pedido do usuário, 25/08/2026 — ver
    // mapconfig.js DEFAULTS.portaJanelaModoAlinhamento/objetoModoAlinhamento
    // pro pedido completo): índice (0=Norte, 1=Leste, 2=Sul, 3=Oeste) da
    // direção fixa atual, na seção correspondente de "⚙️ Configurações" (ver
    // _alignmentModeAtual). O botão do meio do mouse CICLA este índice em
    // vez de somar 45° a `_buildManualRot` — ver handleMiddleClickAction.
    // Usado tanto no modo 'cardinal' (ciclado à mão, sem mais nada) quanto
    // no 'personagem' (pedido do usuário, 25/08/2026: "no modo 'conforme
    // direção do personagem', o botão do meio deve funcionar também para ir
    // trocando. O reset ocorrerá... quando mudar de direção" — ver
    // `_personagemBaseIndex` logo abaixo e o comentário grande em
    // _resolveFreeAlignmentAngle: aqui o índice também é ciclado à mão pelo
    // clique, MAS é resetado sozinho pra bater com a direção do jogador de
    // novo assim que a direção AUTOMÁTICA (a mais próxima de pra onde o
    // jogador está olhando) muda). MESMO espírito de persistência de
    // `_buildManualRot` (comentário logo acima): não é resetado ao inserir
    // uma peça, só ao trocar de ferramenta (ver _selectBuildTool) ou (só no
    // modo 'personagem') ao virar pra outra direção — a pessoa não perde a
    // direção escolhida só por ter colocado uma peça.
    this._buildCardinalIndex = 0;
    // Última direção AUTOMÁTICA (0=Norte..3=Oeste) sincronizada com
    // `_buildCardinalIndex` no modo 'personagem' — `null` força a 1ª
    // sincronização (ver _resolveFreeAlignmentAngle). Só usado nesse modo;
    // sem efeito nos outros dois ('cardinal'/'padrao').
    this._personagemBaseIndex = null;
    this._CARDINAL_LABELS = ['Norte', 'Leste', 'Sul', 'Oeste']; // ordem do ciclo, sentido horário visto de cima — mesmo sentido do giro de 45° do Modo Padrão (ver handleMiddleClickAction)
    // "Raio X" (tecla X, pedido do usuário, 25/08/2026: "deve haver um raio
    // x (ativado pela tecla X) que faz o objeto de baixo ficar transparente
    // (ou wireframe dependendo do desempenho)... Desse jeito aquelas linhas
    // prolongados até o chão poderão ser vistas") — TOGGLE (aperta de novo
    // pra sair), mesmo espírito do Giro Livre (tecla R) — ver onKeyDown. Só
    // tem efeito visível na ferramenta 📦 Objeto, quando o ghost está
    // pousado em cima de outro objeto (ver _updateBuildGhost/
    // Engine3D.setXRayTarget) — nas outras ferramentas o estado continua
    // existindo, só nunca chega a ser consultado.
    this._xrayActive = false;
    this._xrayGlobalActive = false; // Raio X do cenário inteiro (rodada 48) — ver _toggleGlobalXRay
    this._xrayGlobal = { objetos: false, paredes: false, portas: false, janelas: false }; // sub-opções por categoria (rodada 49)
    this._lastSpaceTapT = 0; // duplo-toque de Espaço pra gravidade (rodada 49) — ver onKeyDown
    this._pointerUnlockGraceUntil = 0; // ESC não deve mais "saltar" a câmera (rodada 49, refinado na 50) — ver onKeyDown/onPointerLockChange/onMouseMove
    this._flythroughActive = false; // Sobrevoo automático (rodada 48) — ver _startSceneFlythrough
    this._flythrough = null;
    // NOVO (03/09/2026), pedido verbatim (itens 1/2/6 do pedido): "Ver no
    // mapa 3D" (do patrimônio e da foto) e o botão de busca 3D ("a câmera do
    // personagem sobe vai em arco para o destino e pousa no destino") — ver
    // flyCameraTo/flyCameraToArc abaixo. Estado do voo em andamento (null =
    // nenhum), MESMO padrão arquitetural de `_flythrough`/`_flythroughActive`
    // só que independente dele (voo "vá até X", não a apresentação de
    // "Sobrevoo automático" do painel ⚙️) — os dois nunca coexistem porque
    // iniciar um cancela o outro (ver flyCameraTo/flyCameraToArc).
    this._flyToActive = false;
    this._flyTo = null;
    this._objectCatalog = (typeof Icons !== 'undefined') ? Icons.mapObjectCatalog() : [];
    this._objectIndex = 0;
    // Objetos importados de .obj (rodada 51 — ver js/objimport.js/
    // _refreshObjectCatalog): em modo servidor, tenta buscar a lista do
    // diretório de objetos já ao abrir o 3D (silencioso se não houver
    // servidor configurado/a ação ainda não existir nele — ver
    // ObjImport.tryLoadFromServer); em file:///, só entra algo na lista
    // quando o usuário importar manualmente pelo botão do painel.
    this._refreshObjectCatalog();
    window.ObjImport?.tryLoadFromServer?.().then((n) => { if (n > 0) { this._refreshObjectCatalog(); this._renderObjectCatalogPanel(); } });
    // BUG corrigido (pedido do usuário, 25/08/2026: "No 3D, nos itens,
    // aparece que 'não há nenhum patrimônio sem lugar', onde estão? Eles
    // podem ter vínculo de posição nas fotos, mas no mapa ainda não"):
    // usava `PhotoGrid.getUnsorted().items`, pensada pra 📦 Caixa/badge —
    // essa lista EXCLUI de propósito qualquer item já vinculado a um orb de
    // foto (ver photogrid.js comentário grande em getUnsorted), então um
    // item só vinculado a uma foto (sem pino no mapa) desaparecia da
    // ferramenta 🏷️ Item mesmo sem ter onde clicar pra editá-lo. Trocado
    // pra `getItemsSemPosicaoNoMapa()` — ver comentário grande lá — que
    // olha SÓ a posição de mapa de verdade (mapaX/mapaY, descontando
    // `mapaAuto`), ignorando vínculo de foto de propósito.
    this._unsortedItems = (typeof PhotoGrid !== 'undefined') ? await PhotoGrid.getItemsSemPosicaoNoMapa() : [];
    this._itemIndex = 0;
    // Roleta de câmeras fixas (pedido do usuário: "dá para fazer a roleta
    // para as câmeras também") — vem direto de `this._map.cameras`, sem
    // busca assíncrona (já faz parte do mapa carregado).
    this._cameraIndex = 0;
    this._camMode = null; // { camId, pan, tilt, zoomFov } quando "assistindo" uma câmera fixa — ver _enterCameraView
    this._renderHotbar();
  },

  _HOTBAR_SLOTS: [
    { tool: null, icon: '🎯', label: 'Mirar' },
    { tool: 'parede', icon: '🧱', label: 'Parede' },
    { tool: 'porta', icon: '🚪', label: 'Porta' },
    { tool: 'janela', icon: '🪟', label: 'Janela' },
    { tool: 'objeto', icon: '📦', label: 'Objeto' },
    { tool: 'item', icon: '🏷️', label: 'Item' },
    // "Dá para fazer a roleta para as câmeras também" / "deve ser possível
    // 'olhar' no 3D por câmeras fixas no cenário" — roleta pra escolher QUAL
    // câmera do mapa, clique CONFIRMA (entra/sai de "assistir" ela, ver
    // _placeWithBuildTool/_enterCameraView/_exitCameraView).
    { tool: 'camera', icon: '📷', label: 'Câmeras' },
    // "Recolhedor" estilo Minecraft (pedido do usuário) — clique REMOVE o
    // que estiver mirado (item/câmera/objeto/parede/porta/janela), com uma
    // animação (ver _removeWithTool/Engine3D.spawnCollectEffect/
    // spawnDemolishEffect). Sem roleta própria — não há "o que escolher",
    // só mirar e clicar.
    { tool: 'remover', icon: '🗑️', label: 'Remover' },
    // "📍 Adicionar orb" (pedido do usuário, 26/08/2026): "Assim como há nas
    // 'Fotos' o botão 'Adicionar orb'... Com ele selecionado e ao mirar um
    // objeto, abre-se a mesma janela de busca de patrimônio para poder
    // adicionar ao objeto." MESMO ícone 📍 do botão equivalente em
    // ambientephotos.js, pro usuário reconhecer a mesma ação em telas
    // diferentes. Sem roleta própria — mesmo espírito do "Remover" acima:
    // não há "o que escolher" na hotbar (a escolha em si acontece na janela
    // de busca de patrimônio, ver _addOrbWithTool), só mirar e clicar.
    { tool: 'orb', icon: '📍', label: 'Adicionar orb' },
  ],

  _renderHotbar() {
    const bar = this._container?.querySelector('#v3d-hotbar');
    if (!bar) return;
    const objEntry = this._objectCatalog[this._objectIndex];
    const itemEntry = this._unsortedItems[this._itemIndex];
    const camEntry = (this._map?.cameras || [])[this._cameraIndex];
    bar.innerHTML = this._HOTBAR_SLOTS.map((slot) => {
      const active = this._buildTool === slot.tool;
      let sub = '';
      if (slot.tool === 'objeto') sub = objEntry ? Utils.escapeHtml(objEntry.label) : (this._objectCatalog.length ? '' : '(nenhum)');
      if (slot.tool === 'item') sub = itemEntry ? Utils.escapeHtml(itemEntry.patrimonio || itemEntry.descricao || '—') : '(nenhum sem lugar)';
      if (slot.tool === 'camera') {
        const n = (this._map?.cameras || []).length;
        sub = camEntry ? `Câmera ${this._cameraIndex + 1}${this._camMode ? ' 🔴' : ''}` : (n ? '' : '(nenhuma no mapa)');
      }
      return `
        <button type="button" class="v3d-hotbar-slot ${active ? 'active' : ''}" data-tool="${slot.tool ?? ''}" title="${slot.label}${sub ? ` — ${sub}` : ''}">
          <span class="v3d-hotbar-icon">${slot.icon}</span>
          ${sub ? `<span class="v3d-hotbar-sub">${sub}</span>` : ''}
        </button>`;
    }).join('');
    bar.querySelectorAll('.v3d-hotbar-slot').forEach((btn) => {
      btn.onclick = () => this._selectBuildTool(btn.dataset.tool || null);
    });
  },

  _selectBuildTool(tool) {
    if (this._buildTool === tool) {
      // Clicar de novo na MESMA ferramenta já ativa: se for Parede com uma
      // cadeia pendente (1º ponto já clicado), isso CONCLUI a parede em vez
      // de não fazer nada — pedido do usuário ("deve ter algum jeito de
      // concluir a parede, pois o Esc só está desprendendo o cursor do 3D":
      // o navegador intercepta o Esc pra soltar o pointer lock ANTES dele
      // chegar no keydown da página, então não dava pra confiar nele sozinho
      // — ver também o botão do meio do mouse em _bindDesktopControls).
      if (tool === 'parede' && this._wallChainStart) {
        this._wallChainStart = null;
        Utils.toast('Parede concluída ✓', { type: 'ok', duration: 1500 });
        this._renderHotbar();
      }
      // Clicar de novo em 📷 já com uma câmera sendo "assistida" agora SAI
      // dela — mesmo espírito de "re-clicar conclui" da Parede acima.
      if (tool === 'camera' && this._camMode) this._exitCameraView();
      return;
    }
    // Trocar pra QUALQUER outra ferramenta enquanto se está "assistindo" uma
    // câmera fixa devolve o controle ao jogador — mouse/roda passam a
    // significar olhar/roleta de novo, não pan/tilt/zoom da câmera.
    if (this._camMode) this._exitCameraView();
    this._buildTool = tool;
    this._wallChainStart = null; // trocar de ferramenta cancela uma cadeia de parede pendente
    this._buildManualRot = 0; // idem — cada troca de ferramenta começa a rotação manual do zero
    this._buildCardinalIndex = 0; // idem — cada troca de ferramenta começa apontando pro Norte de novo
    this._personagemBaseIndex = null; // idem — força re-sincronizar com a direção do jogador na próxima peça
    this._xrayActive = false; // idem — Raio X só faz sentido na ferramenta Objeto, sai junto ao trocar
    this._buildFreeRotate = false; // idem — nunca faz sentido continuar Giro Livre trocando de ferramenta
    this._buildFreeRotatePivot = null;
    this._buildLastFreeAngle = null;
    this._buildFreeRotateFinalAngle = null;
    this._renderHotbar();
    if (tool === 'objeto' || tool === 'item' || tool === 'camera') this._showRoulette(); else this._hideRoulette();
    // HUD "estilo jogo" da ferramenta "📍 Adicionar orb" — mostra/esconde e
    // recalcula os números ao entrar/sair da ferramenta (ver _refreshOrbHud).
    this._refreshOrbHud();
    const nomes = { parede: 'Parede — clique no chão pra marcar o 1º ponto, de novo pro 2º (e segue encadeando); botão do meio, Enter ou clicar em 🧱 de novo conclui', porta: 'Porta — mire numa parede pra encaixar, ou em outro lugar pra deixar solta no ar', janela: 'Janela — mire numa parede pra encaixar, ou em outro lugar pra deixar solta no ar', objeto: 'Objeto — role o mouse pra escolher o tipo, clique pra colocar', item: 'Item — role o mouse pra escolher o patrimônio sem lugar, clique pra colocar', camera: 'Câmeras — role o mouse pra escolher qual câmera fixa, clique pra "assistir" por ela (mova o mouse pra olhar em volta, limitado; role pra zoom); clique em 📷 de novo pra sair', remover: 'Remover — mire em item/câmera/objeto/parede/porta/janela e clique pra remover da cena', orb: 'Adicionar orb — mire num objeto e clique pra abrir a busca de patrimônio e associá-lo a ele' };
    if (tool) Utils.toast(nomes[tool] || tool, { duration: 2600 });
  },

  _cycleHotbarList(dir) {
    if (this._buildTool === 'objeto' && this._objectCatalog.length) {
      this._objectIndex = (this._objectIndex + dir + this._objectCatalog.length) % this._objectCatalog.length;
      this._renderHotbar();
      this._renderRoulette({ wake: true });
    } else if (this._buildTool === 'item' && this._unsortedItems.length) {
      this._itemIndex = (this._itemIndex + dir + this._unsortedItems.length) % this._unsortedItems.length;
      this._renderHotbar();
      this._renderRoulette({ wake: true });
    } else if (this._buildTool === 'camera' && (this._map?.cameras || []).length) {
      const n = this._map.cameras.length;
      this._cameraIndex = (this._cameraIndex + dir + n) % n;
      this._renderHotbar();
      this._renderRoulette({ wake: true });
    }
  },

  // ---------- "Roleta" de seleção (Objeto/Item) — pedido do usuário: "uma
  // roleta deve aparecer no meio da tela um pouco para a direita. E
  // conforme o girar da roda do mouse vai varrendo a lista de objetos ou de
  // itens... Quando parar em um, imediatamente é selecionado [já era assim —
  // _placeWithBuildTool sempre usa o índice atual]. Se ficar algum tempo,
  // então, o restante da roleta se esmaece e fica só o desenho do objeto...
  // Isso deve ser feito para os patrimônios também (a caixa que o representa
  // deve aparecer o número, o tipo e o ícone)." Mostra até 5 entradas da
  // lista (2 antes/2 depois do índice atual) numa faixa vertical, a do meio
  // em destaque; some sozinha (classe `idle`, ver CSS) depois de um tempo
  // sem rolar, deixando só a entrada central. ----------
  _ROULETTE_IDLE_MS: 1200,

  _showRoulette() {
    const el = this._container?.querySelector('#v3d-roulette');
    if (!el) return;
    el.classList.remove('hidden');
    this._renderRoulette({ wake: true });
  },

  _hideRoulette() {
    clearTimeout(this._rouletteIdleTimer);
    this._container?.querySelector('#v3d-roulette')?.classList.add('hidden');
  },

  /** `wake:true` reseta o cronômetro de esmaecer (chamado a cada scroll) —
   *  sem isso, cada re-render (ex.: ao trocar de ferramenta) reiniciaria a
   *  animação de esmaecimento sem o usuário ter mexido em nada. */
  _renderRoulette({ wake = false } = {}) {
    const el = this._container?.querySelector('#v3d-roulette');
    const track = this._container?.querySelector('#v3d-roulette-list');
    if (!el || !track || el.classList.contains('hidden')) return;
    const isObjeto = this._buildTool === 'objeto';
    const isCamera = this._buildTool === 'camera';
    const lista = isObjeto ? this._objectCatalog : (isCamera ? (this._map?.cameras || []) : this._unsortedItems);
    const idx = isObjeto ? this._objectIndex : (isCamera ? this._cameraIndex : this._itemIndex);
    if (!lista.length) {
      track.innerHTML = `<div class="v3d-roulette-item center">${isObjeto ? 'Nenhum tipo de objeto' : (isCamera ? 'Nenhuma câmera no mapa' : 'Nenhum patrimônio sem lugar')}</div>`;
    } else {
      const RAIO = 2; // 2 entradas antes/depois da selecionada, no meio
      let html = '';
      for (let d = -RAIO; d <= RAIO; d++) {
        const i = ((idx + d) % lista.length + lista.length) % lista.length;
        const entry = lista[i];
        const center = d === 0;
        if (isObjeto) {
          html += `<div class="v3d-roulette-item ${center ? 'center' : ''}">
            <span class="v3d-roulette-ic">${entry.svg || '📦'}</span>
            <span class="v3d-roulette-label">${Utils.escapeHtml(entry.label || entry.key)}</span>
          </div>`;
        } else if (isCamera) {
          // "Dá para fazer a roleta para as câmeras também" — mesmo componente,
          // uma entrada por câmera do mapa (sem foto/nome próprio, só a ordem).
          const assistindo = this._camMode?.camId === entry.id;
          html += `<div class="v3d-roulette-item ${center ? 'center' : ''}">
            <span class="v3d-roulette-ic">${assistindo ? '🔴' : '📷'}</span>
            <span class="v3d-roulette-label">Câmera ${i + 1}</span>
          </div>`;
        } else {
          const svg = (typeof Icons !== 'undefined' && Icons.svgForAnyKey(entry.tipo)) || '🏷️';
          html += `<div class="v3d-roulette-item ${center ? 'center' : ''}">
            <span class="v3d-roulette-ic">${svg}</span>
            <span class="v3d-roulette-label">${Utils.escapeHtml(entry.patrimonio || '—')} <small>${Utils.escapeHtml(entry.tipo || '—')}</small></span>
          </div>`;
        }
      }
      track.innerHTML = html;
    }
    if (wake) {
      el.classList.remove('idle');
      clearTimeout(this._rouletteIdleTimer);
      this._rouletteIdleTimer = setTimeout(() => el.classList.add('idle'), this._ROULETTE_IDLE_MS);
    }
  },

  // ---------- Painel lateral "+" (tabela de objetos padrão) — pedido do
  // usuário (rodada 47): "Há um botão na borda direita da tela em
  // Mapa->Foto, quando clicado um menu aparece. Faça algo semelhante no 3D
  // para abrir a lista com os objetos. Em vez de ser uma seta, faça um '+' e
  // coloque no canto direito, logo abaixo da impressão do hud no canvas...
  // O menu lateral será um outro jeito para acessar os objetos [...] em vez
  // de roleta [...] será tabela." Mesmo padrão de gaveta deslizante do
  // Mapa->Foto (.ambphotos-sidemenu-toggle/.ambphotos-sidemenu), mas com "+"
  // (não seta), ancorado abaixo do HUD de FPS (não no meio vertical da
  // tela), e o conteúdo é uma TABELA com TODOS os objetos do catálogo
  // (`this._objectCatalog` — inclui "Cubo", ver Icons.MAP_OBJECT_EXTRAS),
  // outro jeito (além do rolar da roda) de escolher qual objeto fica ativo
  // pro botão 📦 Objeto do rodapé colocar. ----------
  // ---------- Painel lateral "+" ESQUERDO (Criar > Adicionar Primitiva) —
  // pedido do usuário (02/09/2026, rodada definitiva): "no botão '+' da
  // lateral esquerda, deve ter os botões que tinha antes. Não é para abrir
  // o mesmo menu que o botão direito abre." Confirmado (AskUserQuestion): é
  // o MESMO painel "Criar" > "Adicionar Primitiva" que o Modelador tem no
  // seu próprio botão "+" esquerdo (`PRIMITIVE_CATALOG`, grupos Mesh/
  // Lâmpada/Outros — ver modeler-ui.js, carregado ANTES deste arquivo, ver
  // index.html — por isso a constante já está disponível aqui como global,
  // sem precisar duplicar o catálogo). Mesmo padrão de gaveta deslizante de
  // `_toggleObjectCatalogPanel` logo abaixo, só espelhado pro lado
  // ESQUERDO e reaproveitando as classes CSS do painel "Criar" do
  // Modelador (`.m3d-sidebar-panel`/`.m3d-sidebar-content`, ver comentário
  // grande junto ao HTML do botão). ----------
  // REMOVIDO (03/09/2026) — `_toggleAddObjPanel`/`_renderAddObjPanel`
  // (painel "Criar" próprio da tela base) foram substituídos pelo sidebar
  // ÚNICO/compartilhado com o Modelador (`ModelerUI.toggleSidebar(this)`/
  // `ModelerUI.renderSidebar(this)`/`ModelerUI._buildCriarPanelBase`, ver
  // modeler-ui.js) — ver comentário grande junto ao HTML do botão "+"
  // (`#m3d-sidebar-toggle`), no topo de `mount()`.

  _toggleObjectCatalogPanel() {
    const toggle = this._container?.querySelector('#v3d-objcat-toggle');
    const panel = this._container?.querySelector('#v3d-objcat-panel');
    if (!toggle || !panel) return;
    const abrindo = panel.classList.contains('hidden');
    if (abrindo) {
      panel.classList.remove('hidden');
      // Pedido do usuário (rodada 48): "O '+' [...] está com a sua animação
      // atrasada em relação a animação do menu [...] Deve ser sincronizado."
      // Causa raiz: `toggle` NUNCA teve `display:none` (só `panel` tem, via
      // `.hidden`), então só o `panel` precisa nascer escondido-mas-presente
      // por 1 frame antes de ganhar `.open` (senão a transição CSS não
      // dispara — elemento nasceria direto no estado final). O `toggle`
      // pode — e deve — ganhar `.open` JÁ NESTE TICK, em sincronia com o
      // clique (igual ao padrão de Mapa->Foto, .ambphotos-sidemenu-toggle,
      // que nunca teve esse atraso porque nunca usa `hidden`).
      toggle.classList.add('open');
      // Pedido do usuário: "Quando o menu lateral estiver aberto, então, o
      // '+', deve virar uma seta que aponta para a direita (indicando que
      // clicando ali, a janela se recolhe)."
      toggle.textContent = '➜';
      requestAnimationFrame(() => { panel.classList.add('open'); });
      this._renderObjectCatalogPanel();
    } else {
      toggle.classList.remove('open');
      toggle.textContent = '+';
      panel.classList.remove('open');
      setTimeout(() => panel.classList.add('hidden'), 220); // espera a transição (.2s, ver CSS) antes de sumir de vez
    }
  },

  /** Recalcula `this._objectCatalog` juntando o catálogo padrão
   *  (Icons.mapObjectCatalog — mesa/coluna/cubo/etc.) com os objetos
   *  importados de .obj já em memória nesta sessão (rodada 51 — ver
   *  ObjImport.getCatalogEntries) — "para que apareça junto com os demais
   *  objetos" (pedido do usuário), na MESMA lista/roleta, não numa lista à
   *  parte. Preserva `_objectIndex` quando possível (procura pela MESMA
   *  `key` na lista nova, já que os índices podem mudar quando um item é
   *  importado); cai pra 0 se a peça atualmente selecionada não existir
   *  mais na lista nova (não deveria acontecer — a lista só cresce). */
  _refreshObjectCatalog() {
    const chaveAtual = this._objectCatalog?.[this._objectIndex]?.key;
    this._objectCatalog = [
      ...((typeof Icons !== 'undefined') ? Icons.mapObjectCatalog() : []),
      ...(window.ObjImport?.getCatalogEntries?.() || []),
    ];
    const idx = chaveAtual ? this._objectCatalog.findIndex((e) => e.key === chaveAtual) : -1;
    this._objectIndex = idx >= 0 ? idx : 0;
  },

  _renderObjectCatalogPanel() {
    const list = this._container?.querySelector('#v3d-objcat-panel-list');
    if (!list) return;
    this._refreshObjectCatalog();
    // Linha de importação (pedido do usuário, rodada 51: "um botão de
    // importar .obj para que apareça junto com os demais objetos [...]
    // Caso esteja rodando por servidor, uma requisição é feita ao servidor
    // [...] Caso esteja operando por 'file:///' deve aparecer um botão para
    // importar manualmente") — sempre no topo do painel, ANTES da lista de
    // objetos em si. Em file:///, `<input type="file">` (só ele funciona
    // sob file:// — não dá pra listar um diretório do disco só com
    // JavaScript por segurança do navegador); em servidor, um botão pra
    // repetir a busca no diretório configurado (a 1ª busca já roda sozinha
    // ao abrir o 3D, ver mount()).
    const isFile = location.protocol === 'file:';
    let html = isFile
      ? `<div class="v3d-objcat-row v3d-objcat-import">
          <label class="v3d-objcat-import-btn" title="Escolher um ou mais arquivos .obj do seu aparelho">
            📥 Importar .obj<input type="file" accept=".obj" multiple id="v3d-objcat-obj-input" style="display:none">
          </label>
        </div>`
      : `<div class="v3d-objcat-row v3d-objcat-import" id="v3d-objcat-obj-server-refresh">
          <span class="v3d-objcat-ic">🔄</span>
          <span class="v3d-objcat-label">Buscar objetos no servidor</span>
        </div>`;
    if (!this._objectCatalog.length) {
      html += `<div class="v3d-objcat-row center">Nenhum tipo de objeto</div>`;
      list.innerHTML = html;
    } else {
      this._objectCatalog.forEach((entry, i) => {
        const ativo = i === this._objectIndex;
        html += `<div class="v3d-objcat-row ${ativo ? 'active' : ''}" data-idx="${i}">
          <span class="v3d-objcat-ic">${entry.svg || '📦'}</span>
          <span class="v3d-objcat-label">${Utils.escapeHtml(entry.label || entry.key)}</span>
        </div>`;
      });
      list.innerHTML = html;
    }
    list.querySelectorAll('.v3d-objcat-row[data-idx]').forEach((row) => {
      row.onclick = () => {
        this._objectIndex = parseInt(row.dataset.idx, 10) || 0;
        // Selecionar uma linha da tabela já deixa a ferramenta 📦 Objeto
        // ativa (senão o usuário escolheria um objeto sem nenhum jeito de
        // colocá-lo, já que essa tabela é justamente "outro jeito" de
        // escolher — igual pedido pelo usuário — pro MESMO botão do rodapé).
        if (this._buildTool !== 'objeto') this._selectBuildTool('objeto'); else this._renderHotbar();
        this._renderObjectCatalogPanel();
        this._toggleObjectCatalogPanel();
      };
    });
    const fileInput = list.querySelector('#v3d-objcat-obj-input');
    if (fileInput) {
      fileInput.onchange = async () => {
        const n = await window.ObjImport?.importFiles?.(fileInput.files);
        if (n > 0) Utils.toast?.(`${n} objeto(s) .obj importado(s) ✓`, { type: 'ok' });
        this._renderObjectCatalogPanel(); // reconstrói a lista já com o(s) novo(s) item(ns)
      };
    }
    const serverRefreshRow = list.querySelector('#v3d-objcat-obj-server-refresh');
    if (serverRefreshRow) {
      serverRefreshRow.onclick = async () => {
        window.ObjImport._serverFetchTried = false; // força repetir mesmo já tendo tentado antes (ver tryLoadFromServer)
        const n = await window.ObjImport?.tryLoadFromServer?.();
        Utils.toast?.(n > 0 ? `${n} objeto(s) encontrado(s) no servidor ✓` : 'Nenhum objeto novo encontrado no servidor.', { type: n > 0 ? 'ok' : 'warn' });
        this._renderObjectCatalogPanel();
      };
    }
  },

  /** Clique com uma ferramenta de construção ativa — mira (centerRay, MESMO
   *  raio do crosshair/seleção normal) contra o chão (parede/objeto/item) ou
   *  contra as paredes (porta/janela), grava no `this._map` (Mapping, MESMAS
   *  funções do 2D) e reconstrói a cena. */
  /**
   * Qual camada (layerId) usar pra um elemento novo criado DENTRO do 3D
   * (parede/porta/janela/objeto — ver _placeWithBuildTool) — pedido do
   * usuário: "uma opção nas configurações 3D do que acontece com os itens
   * adicionados enquanto se está no 3D: colocar em uma camada separada
   * ('adicionados no 3D') ou adicionar à camada atual (a que estava
   * selecionada no 2D quando clicou em 'Ver em 3D')". `this._camada3DConfig`/
   * `this._layerIdOrigem2D` são lidos uma vez em mount() (ver lá).
   */
  /** Pedido do usuário (03/09/2026): "Deve ter uma opção nas 'configurações
   *  3D' para habilitar/desabilitar" o anel de bússola. Só alterna a classe
   *  `.hidden` no ancorador `#v3d-compass-ring` (ver CSS em style.css) — o
   *  elemento continua no DOM mesmo escondido, então _loop() pode seguir
   *  girando `#v3d-compass-ring-inner` sem precisar checar nada a cada
   *  quadro (display:none já cuida de não desenhar). `ativo` vindo de
   *  `undefined` (config nunca lida ainda) é tratado como ligado — mesmo
   *  padrão de outras opções "ligadas por padrão" deste arquivo (ver
   *  `!== false` usado no painel de mapconfig.js). */
  _applyBussola3DVisibilidade(ativo) {
    const el = this._container?.querySelector('#v3d-compass-ring');
    if (el) el.classList.toggle('hidden', ativo === false);
  },

  _layerIdParaNovosItens() {
    if (!this._map) return null;
    if (this._camada3DConfig === 'atual') return this._layerIdOrigem2D || null;
    // 'separada' (padrão): acha a camada "Adicionados no 3D" já criada
    // nesta sessão/mapa, ou cria na primeira vez que for realmente
    // necessário (não na abertura do 3D — só quem chega a construir algo
    // ganha a camada extra, sem poluir mapas onde ninguém nunca usou isso).
    if (!this._layer3DId) {
      const existente = (this._map.layers || []).find((l) => l.nome === 'Adicionados no 3D');
      this._layer3DId = existente ? existente.id : Mapping.addLayer(this._map, 'Adicionados no 3D').id;
    }
    return this._layer3DId;
  },

  // ---------- Sistema de encaixe (snap) da ferramenta 🧱 Parede — pedido do
  // usuário (24/08/2026): grade magnética configurável, modificador por
  // tecla (Shift/Alt, com opção de inverter a lógica), snap de interseção
  // de grade/vértice/quina/meio de parede, travamento de ângulo, guias
  // inteligentes e "cursor fantasma com efeito mola". Configurável em
  // "⚙️ Configurações do mapa" › 🧱 Parede (ver mapconfig.js). ----------

  /** Modo LIVRE agora (tecla modificadora segurada, considerando a opção de
   *  inverter a lógica) — "Segurar Shift ou Alt: Desativa a grade e libera
   *  o desenho em qualquer coordenada/ângulo" (pedido do usuário), com
   *  `paredeModificadorInvertido` trocando o sentido (encaixe começa
   *  DESLIGADO, a tecla LIGA em vez de desligar). Função à parte (não só
   *  dentro de _resolveWallSnap) porque _placeWithBuildTool também precisa
   *  saber disto pra decidir se aplica o comprimento mínimo de parede. */
  _isWallFreeModeNow() {
    const cfg = this._paredeConfig || {};
    const mod = cfg.paredeModificador || 'shift';
    const tecla = mod === 'shift' ? (this._keys.ShiftLeft || this._keys.ShiftRight)
      : mod === 'alt' ? (this._keys.AltLeft || this._keys.AltRight) : false;
    return cfg.paredeModificadorInvertido ? !tecla : tecla;
  },

  /** Encaixe no CENTRO do quadrado de 1m do chão está ATIVO agora, pra
   *  posicionar Porta/Janela "no ar" (longe de qualquer parede) — pedido do
   *  usuário, 25/08/2026: "deve haver uma seção da porta nas 'configurações
   *  3D', deve haver o snap atual (no centro do bloco) e outras opções como
   *  tem para a parede" — ver mapconfig.js DEFAULTS/seção "🚪 Porta / Janela"
   *  (`portaSnapCentroBlocoAtivo`/`portaSnapModificador`/
   *  `portaSnapModificadorInvertido`), usado por _updateBuildGhost/
   *  _placeWithBuildTool/_captureFreeRotatePivot (ramo "no ar" de
   *  porta/janela — encaixada numa parede não usa isto, a posição já é
   *  travada na própria parede).
   *
   *  MESMO mecanismo de "Modificador por tecla" de _isWallFreeModeNow logo
   *  acima, com o SENTIDO PADRÃO INVERTIDO: lá o padrão é LIVRE (grade
   *  ligada por padrão? não — lá é o desenho de parede, cuja grade já vem
   *  ligada por padrão e a tecla DESLIGA); aqui o padrão é TRAVADO (pedido
   *  do usuário: "o travar no centro do bloco deve ser o padrão") e a tecla
   *  LIBERA — por isso o `!tecla` na conta final, ao contrário de lá.
   *  `portaSnapModificadorInvertido` desfaz essa inversão (volta a "segurar
   *  a tecla TRAVA", o comportamento original de antes disto virar padrão).
   *  `portaSnapCentroBlocoAtivo === false` desliga o recurso por completo,
   *  nenhuma tecla liga de volta. */
  _isDoorSnapActiveNow() {
    const cfg = this._paredeConfig || {};
    if (cfg.portaSnapCentroBlocoAtivo === false) return false;
    const mod = cfg.portaSnapModificador || 'shift';
    const tecla = mod === 'shift' ? (this._keys.ShiftLeft || this._keys.ShiftRight)
      : mod === 'alt' ? (this._keys.AltLeft || this._keys.AltRight) : false;
    return cfg.portaSnapModificadorInvertido ? tecla : !tecla;
  },

  /** Snap magnético de grade está ATIVO agora, pra posicionar Objeto "no ar"
   *  (não travado numa parede por física) — pedido do usuário, 25/08/2026:
   *  "Faça o 'Snap magnético de grade', tecla modificadora e o 'inverter
   *  lógica' para os demais objetos também" — ver mapconfig.js DEFAULTS/
   *  seção "📦 Objeto" (`objetoSnapGradeAtivo`/`objetoSnapGradeTamanho`/
   *  `objetoSnapModificador`/`objetoSnapModificadorInvertido`), usado por
   *  _updateBuildGhost/_placeWithBuildTool/_captureFreeRotatePivot (ramo
   *  'objeto', só antes de/quando NÃO travado numa parede —
   *  _resolveObjectWallSnap continua tendo a palavra final nesse caso, como
   *  sempre teve). MESMA polaridade/mecanismo de _isWallFreeModeNow acima
   *  (não a invertida de _isDoorSnapActiveNow): grade LIGADA por padrão, a
   *  tecla modificadora DESLIGA. */
  _isObjectGridSnapActiveNow() {
    const cfg = this._paredeConfig || {};
    if (cfg.objetoSnapGradeAtivo === false) return false;
    const mod = cfg.objetoSnapModificador || 'shift';
    const tecla = mod === 'shift' ? (this._keys.ShiftLeft || this._keys.ShiftRight)
      : mod === 'alt' ? (this._keys.AltLeft || this._keys.AltRight) : false;
    return cfg.objetoSnapModificadorInvertido ? tecla : !tecla;
  },

  /** Aplica o snap magnético de grade (ver _isObjectGridSnapActiveNow acima)
   *  a um ponto (x,z) — MESMA fórmula de `_resolveWallSnap`
   *  (`Math.round(rawX/g)*g`), extraída pra cá porque agora tem 3 call
   *  sites (_updateBuildGhost/_placeWithBuildTool/_captureFreeRotatePivot)
   *  em vez de 1 só. */
  _applyObjectGridSnap(x, z) {
    if (!this._isObjectGridSnapActiveNow()) return { x, z };
    const cfg = this._paredeConfig || {};
    const g = Math.max(0.01, Number(cfg.objetoSnapGradeTamanho) || 0.2);
    return { x: Math.round(x / g) * g, z: Math.round(z / g) * g };
  },

  /** Seção "🐞 Debug" de ⚙️ Configurações (pedido do usuário, 25/08/2026:
   *  "deve haver uma seção nas 'configurações 3D' para opções de debug. O
   *  'transferidor' e o 'prolongamento de linhas tracejadas do objeto'
   *  devem ser opcionais cada um. Marcados por padrão") — os dois só
   *  DESLIGAM quando o valor salvo é explicitamente `false`
   *  (`!== false`, mesmo padrão de "ligado por padrão" já usado em
   *  `_isDoorSnapActiveNow`/config nunca carregada ainda/chave ainda não
   *  existente no banco de quem já usava o app antes desta opção existir).
   *  Ver mapconfig.js DEFAULTS.debugTransferidorAtivo/
   *  debugProlongamentoAtivo. */
  _isDebugTransferidorAtivo() {
    return (this._paredeConfig || {}).debugTransferidorAtivo !== false;
  },
  _isDebugProlongamentoAtivo() {
    return (this._paredeConfig || {}).debugProlongamentoAtivo !== false;
  },

  /** Modo de alinhamento ATUAL pra ferramenta ATUAL (`this._buildTool`) —
   *  pedido do usuário, 25/08/2026: "deve haver uma outra opção de
   *  orientação do modelo desse objeto... alinhamento do objeto, por
   *  exemplo, ficam todos sempre alinhados para o norte, independente do
   *  ângulo do jogador". Era um checkbox liga/desliga (Alinhamento cardinal:
   *  sim/não); virou uma LISTA de 3 opções (pedido do usuário, 25/08/2026:
   *  "além da opção 'alinhamento cardinal'... deve haver uma outra opção em
   *  uma lista, que é o alinhamento (norte, leste, sul e oeste) só que
   *  conforme o direcionamento do personagem (esta deverá ser a opção
   *  padrão)") — ver mapconfig.js DEFAULTS/seção "🚪 Porta / Janela"
   *  (`portaJanelaModoAlinhamento`, cobre as duas ferramentas — já
   *  compartilham a mesma seção neste painel) e seção "📦 Objeto"
   *  (`objetoModoAlinhamento`). Valores possíveis:
   *   - 'personagem' (PADRÃO): a peça vira sozinha pra uma das 4 direções
   *     fixas — a mais PRÓXIMA de pra onde o jogador está olhando/mirando
   *     no momento — sem precisar clicar. Ver _nearestCardinalAngle.
   *   - 'cardinal': a peça fica numa das 4 direções fixas, só que ESCOLHIDA
   *     à mão — o botão do meio CICLA entre elas (Norte→Leste→Sul→Oeste) em
   *     vez de acompanhar a mira. Ver _cardinalAngleAtual.
   *   - 'padrao': comportamento original do app (antes desta rodada) — gira
   *     livre acompanhando a mira, com o botão do meio somando 45° por
   *     clique (`_buildManualRot`).
   *  Lida por handleMiddleClickAction (decide o que o botão do meio faz),
   *  _resolveFreeAlignmentAngle, _updateBuildGhost e _placeWithBuildTool. */
  _alignmentModeAtual() {
    const cfg = this._paredeConfig || {};
    if (this._buildTool === 'objeto') return cfg.objetoModoAlinhamento || 'personagem';
    if (this._buildTool === 'porta' || this._buildTool === 'janela') return cfg.portaJanelaModoAlinhamento || 'personagem';
    return 'padrao';
  },

  /** Atalho: true só quando o modo ATUAL (ver _alignmentModeAtual) é
   *  'cardinal' (fixo, ciclado à mão pelo botão do meio) — usado onde só
   *  esse modo específico importa (a ciclagem em si, e o toast/bloqueio do
   *  Giro Livre que citam "Alinhamento cardinal" pelo nome). */
  _isCardinalAlignmentActiveNow() {
    return this._alignmentModeAtual() === 'cardinal';
  },

  /** Atalho: true quando o modo ATUAL é 'cardinal' OU 'personagem' — os
   *  dois modos "peça travada numa das 4 direções fixas" (um à mão, outro
   *  automático), em oposição ao 'padrao' livre. Usado pro Giro Livre (tecla
   *  R): ambos são incompatíveis com ele pelo mesmo motivo (giro livre quer
   *  controle manual contínuo; os dois travam em 4 direções fixas, um por
   *  clique, o outro sozinho seguindo a mira). */
  _isAnyFixedAlignmentActiveNow() {
    return this._alignmentModeAtual() !== 'padrao';
  },

  /** Ângulo (radianos) da direção cardinal atualmente selecionada À MÃO
   *  (`this._buildCardinalIndex`) — 0=Norte, 1=Leste (90°), 2=Sul (180°),
   *  3=Oeste (270°), sentido horário visto de cima, MESMA convenção de
   *  `angulo` já usada no resto do app (ver handleMiddleClickAction, comentário
   *  grande sobre o sentido do giro do Modo Padrão). Usada só no modo
   *  'cardinal' (ver _alignmentModeAtual), no lugar do yaw da câmera. */
  _cardinalAngleAtual() {
    return ((this._buildCardinalIndex || 0) % 4) * (Math.PI / 2);
  },

  /** Índice (0=Norte, 1=Leste, 2=Sul, 3=Oeste) da direção fixa mais PRÓXIMA
   *  de QUALQUER ângulo (radianos, qualquer sinal/tamanho) — "arredonda"
   *  pra mais perto (ex.: 40° do Norte rumo ao Leste já vira Leste, sem
   *  precisar completar os 90°). Normaliza pra [0, 2π) antes de dividir
   *  pelos passos de 90° — sem isso, um ângulo negativo (comum em atan2/yaw
   *  acumulado) arredondaria errado; o `% 4` no fim cobre o caso limite de
   *  um ângulo bem próximo de 360° arredondar "pra cima" e estourar pra 4
   *  passos (que é o mesmo que 0/Norte de novo). Usado pelo modo
   *  'personagem' — ver _resolveFreeAlignmentAngle. */
  _nearestCardinalIndex(ang) {
    const PASSO = Math.PI / 2;
    const normalizado = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.round(normalizado / PASSO) % 4;
  },

  /** Ângulo (radianos) da direção fixa mais PRÓXIMA de `ang` — mesma coisa
   *  que `_nearestCardinalIndex(ang) * (Math.PI/2)`, só que já em radianos.
   *  Ver _nearestCardinalIndex pro funcionamento completo. */
  _nearestCardinalAngle(ang) {
    return this._nearestCardinalIndex(ang) * (Math.PI / 2);
  },

  /** Ponto único que decide o ÂNGULO de uma peça posicionada LIVRE ("no
   *  ar", sem travar numa parede) — Porta/Janela/Objeto — respeitando o
   *  modo de alinhamento escolhido em ⚙️ Configurações (ver
   *  _alignmentModeAtual). `baseRaw` é sempre o ângulo "cru" de pra onde o
   *  jogador está olhando/mirando (yaw da câmera pro Objeto, direção do
   *  raio de mira pra Porta/Janela) — NUNCA inclui `_buildManualRot`: esse
   *  contador só entra em jogo no modo 'padrao', bem aqui dentro, pra não
   *  ser somado por engano nos outros dois modos (que travam numa das 4
   *  direções fixas, de propósito ignorando qualquer offset manual).
   *
   *  Modo 'personagem' (pedido do usuário, 25/08/2026: "no modo 'conforme
   *  direção do personagem', o botão do meio do mouse deve funcionar
   *  também para ir trocando. O 'reset' ocorrerá para voltar a ser
   *  'conforme direção do personagem', quando mudar de direção (por
   *  exemplo, estava norte e foi para leste, então, reseta as rotações
   *  feitas pelos cliques do botão do meio do mouse)"): a direção "de
   *  base" (a mais próxima de `baseRaw`, ver _nearestCardinalIndex) É
   *  recalculada todo quadro, mas só é FORÇADA de volta em
   *  `_buildCardinalIndex` quando ela MUDA em relação à última vez
   *  (`_personagemBaseIndex`, ver _initBuildHotbar/_selectBuildTool) — é
   *  esse re-sincronismo que funciona como o "reset" pedido: enquanto o
   *  jogador continuar olhando pra dentro do MESMO quadrante de 90°, os
   *  cliques do botão do meio (que ciclam `_buildCardinalIndex` — ver
   *  handleMiddleClickAction, MESMO índice usado pelo modo 'cardinal')
   *  ficam valendo por cima da direção automática; assim que o jogador vira
   *  o bastante pra cruzar pro quadrante de outra direção, a próxima
   *  chamada aqui detecta a mudança e SOBRESCREVE `_buildCardinalIndex` de
   *  volta pra bater com a nova direção automática, descartando qualquer
   *  ciclagem manual acumulada — exatamente o "reset" pedido. */
  _resolveFreeAlignmentAngle(baseRaw) {
    const modo = this._alignmentModeAtual();
    if (modo === 'cardinal') return this._cardinalAngleAtual();
    if (modo === 'personagem') {
      const autoIndex = this._nearestCardinalIndex(baseRaw);
      if (this._personagemBaseIndex !== autoIndex) {
        this._buildCardinalIndex = autoIndex;
        this._personagemBaseIndex = autoIndex;
      }
      return this._cardinalAngleAtual();
    }
    return baseRaw + this._buildManualRot;
  },

  /** "Funil" único de todo o sistema de encaixe — recebe o ponto CRU onde a
   *  mira bateu (rawX,rawZ, mundo) e devolve `{x,z,guides}` já com o(s)
   *  encaixe(s) aplicados + as linhas-guia pra desenhar (Engine3D.showSmartGuides).
   *  `chainStart` é o ponto anterior da cadeia (`{x,y}` — MESMA convenção
   *  de `this._wallChainStart`, `y` aqui é a coordenada Z do mundo) quando
   *  já há um 1º ponto clicado, usado pelo travamento de ângulo — `null`
   *  no 1º ponto de uma cadeia nova.
   *
   *  ORDEM DE PRIORIDADE:
   *   1. Modo livre (tecla modificadora) — desliga TODOS os encaixes
   *      abaixo ("libera o desenho em qualquer coordenada/ângulo", pedido
   *      do usuário) — só as guias inteligentes continuam ativas (são
   *      justamente uma AJUDA pro modo livre, pedido do usuário: "quando o
   *      cursor do MODO LIVRE se alinhar...").
   *   2. Encaixe de PONTO (vértice/quina, meio de parede, interseção de
   *      grade) — o que estiver mais perto dentro do raio de imã
   *      (_WALL_SNAP_RADIUS) vence e pula os passos seguintes (não faz
   *      sentido combinar dois pontos fixos diferentes).
   *   3. Sem ponto por perto: travamento de ÂNGULO (só com cadeia já
   *      iniciada) — trava a direção a partir de `chainStart` no múltiplo
   *      mais próximo do incremento configurado, mantendo a mesma
   *      distância (projetada) do ponto cru.
   *   4. Sem cadeia, ou ângulo desligado: snap de GRADE magnética.
   *  Ângulo e grade nunca se combinam no mesmo ponto, de propósito — os
   *  dois "puxariam" o ponto em direções possivelmente diferentes; como o
   *  travamento de ângulo já dá uma direção regular por conta própria,
   *  ele "ganha" quando há uma cadeia em andamento.
   */
  _WALL_SNAP_RADIUS: 0.35,
  // Incremento do travamento de ângulo do Giro Livre com Shift segurado
  // (ver onKeyDown/_updateBuildGhost, ramos 'objeto'/'porta'/'janela') —
  // pedido do usuário, 25/08/2026: "segurar o SHIFT, faz travar em ângulos
  // fixos (de 15 graus em 15 graus)". Fixo (não configurável) de propósito
  // — diferente dos 45° do Modo Padrão (esses sim configuráveis via botão
  // direito, incremento fixo em `Math.PI/4`), o pedido do usuário foi
  // específico em "15 graus", sem mencionar torná-lo ajustável.
  _FREE_ROTATE_SHIFT_STEP: Math.PI / 12,
  _resolveWallSnap(rawX, rawZ, chainStart) {
    const cfg = this._paredeConfig || {};
    const modoLivre = this._isWallFreeModeNow();
    const guides = [];
    let gx = rawX, gz = rawZ;
    if (modoLivre) {
      // Linhas-guia inteligentes (Figma/AutoCAD) — pedido do usuário:
      // "quando o cursor do modo livre se alinhar perfeitamente ao final
      // de outra parede distante no mesmo eixo, acenda uma linha
      // tracejada". Também SNAPA a coordenada correspondente quando acha
      // um alinhamento — mesmo espírito de qualquer guia inteligente de
      // verdade (Figma faz o mesmo: a guia não é só visual, ela "gruda").
      const GUIDE_TOL = 0.06;
      const walls = this._analyzedWalls || this._map?.walls || [];
      let bestX = null, bestZ = null;
      walls.forEach((w) => {
        [[w.x1, w.y1], [w.x2, w.y2]].forEach(([ex, ez]) => {
          if (Math.abs(ex - rawX) < GUIDE_TOL && (!bestX || Math.abs(ex - rawX) < Math.abs(bestX.ex - rawX))) bestX = { ex, ez };
          if (Math.abs(ez - rawZ) < GUIDE_TOL && (!bestZ || Math.abs(ez - rawZ) < Math.abs(bestZ.ez - rawZ))) bestZ = { ex, ez };
        });
      });
      if (bestX) { gx = bestX.ex; guides.push({ x1: bestX.ex, z1: bestX.ez, x2: bestX.ex, z2: rawZ }); }
      if (bestZ) { gz = bestZ.ez; guides.push({ x1: bestZ.ex, z1: bestZ.ez, x2: rawX, z2: bestZ.ez }); }
      return { x: gx, z: gz, guides };
    }

    let melhor = null;
    const considera = (px, pz) => {
      const d = Math.hypot(px - rawX, pz - rawZ);
      if (d > this._WALL_SNAP_RADIUS) return;
      if (!melhor || d < melhor.d) melhor = { x: px, z: pz, d };
    };
    const walls = this._analyzedWalls || this._map?.walls || [];
    if (cfg.paredeSnapVertice !== false || cfg.paredeSnapQuina !== false) {
      walls.forEach((w) => { considera(w.x1, w.y1); considera(w.x2, w.y2); });
    }
    if (cfg.paredeSnapMeio !== false) {
      walls.forEach((w) => considera((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2));
    }
    if (cfg.paredeSnapIntersecaoGrade !== false && this._engine?.gridIntersectionNear) {
      const g = this._engine.gridIntersectionNear(rawX, rawZ);
      if (g) considera(g.x, g.z);
    }
    if (melhor) return { x: melhor.x, z: melhor.z, guides: [] };

    if (chainStart && cfg.paredeSnapAngulo !== false) {
      const dx = rawX - chainStart.x, dz = rawZ - chainStart.y;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4) {
        const incRad = ((Number(cfg.paredeSnapAnguloIncremento) || 45) * Math.PI) / 180;
        const angSnap = Math.round(Math.atan2(dz, dx) / incRad) * incRad;
        return { x: chainStart.x + Math.cos(angSnap) * dist, z: chainStart.y + Math.sin(angSnap) * dist, guides: [] };
      }
    }

    if (cfg.paredeSnapGradeAtivo !== false) {
      const g = Math.max(0.01, Number(cfg.paredeSnapGradeTamanho) || 0.2);
      return { x: Math.round(rawX / g) * g, z: Math.round(rawZ / g) * g, guides: [] };
    }

    return { x: rawX, z: rawZ, guides: [] };
  },

  /** Parede já existente que passa perto de (px,pz) — MEIO dela, não perto
   *  de uma ponta (uma folga de MIN_SPLIT_MARGIN nas pontas já é tratada
   *  dentro do próprio Mapping.splitWallAt, que devolve null nesse caso) —
   *  usado pela "Conversão Automática de Quinas" (pedido do usuário) tanto
   *  no PONTO INICIAL quanto no PONTO FINAL de um segmento novo de parede
   *  (ver _placeWithBuildTool). `excludeIds` tira a(s) parede(s) que não
   *  fazem sentido testar (ex.: a parede ACABADA de criar neste mesmo
   *  clique). Teste por DISTÂNCIA PONTO-SEGMENTO nos dados do mapa (não um
   *  raycast contra a malha 3D) — funciona igual não importa de onde o
   *  ponto (px,pz) veio (mira numa parede, chão, ou qualquer snap acima). */
  _findWallContainingPoint(px, pz, excludeIds) {
    const TOL = 0.1; // metros — folga pra "pousar em cima" de uma parede contar como tocando nela
    let best = null;
    (this._map?.walls || []).forEach((w) => {
      if (excludeIds && excludeIds.includes(w.id)) return;
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-8) return;
      const t = Utils.clamp(((px - w.x1) * dx + (pz - w.y1) * dy) / len2, 0, 1);
      const projX = w.x1 + dx * t, projZ = w.y1 + dy * t;
      const d = Math.hypot(px - projX, pz - projZ);
      if (d > TOL) return;
      if (!best || d < best.d) best = { wall: w, d };
    });
    return best ? best.wall : null;
  },

  /** "Ignorar física" desligada (padrão) — pedido do usuário, 25/08/2026,
   *  refinado em seguida no mesmo dia: "ao apontar para uma parede, a mesa,
   *  por exemplo, deve ir costeando paralela a ela, mesmo apontando
   *  diretamente para a parede. A possibilidade de não dar é apenas quando
   *  não couber a mesa no espaço." Ou seja, isto NÃO é só evitar atravessar
   *  a parede (empurrar pra fora mantendo o giro da câmera) — perto o
   *  bastante de uma parede, o giro do objeto fica TRAVADO paralelo a ela
   *  (eixo da largura correndo junto da parede, profundidade apontando pra
   *  dentro do cômodo), IGNORANDO de propósito o yaw da câmera, e a posição
   *  desliza ao longo da parede acompanhando a mira, encostada rente a ela.
   *  Longe de qualquer parede (fora de SNAP_RANGE), posição/giro ficam
   *  livres, controlados pela mira/câmera como sempre foi. Só falha
   *  (`blocked:true`, chamador não desenha o ghost/não insere nada) quando
   *  mesmo deslizando não sobra espaço livre (canto apertado demais/objeto
   *  grande demais pro vão, testado contra TODAS as paredes por perto, não
   *  só a mais próxima). Empilhar em cima de outro objeto (raycastSurface)
   *  não passa por aqui — não é "física" pro propósito desta opção (pedido
   *  do usuário: sempre permitido, nos dois modos).
   *
   *  `w`/`d` — largura/profundidade do objeto (mesmos valores passados a
   *  Engine3D.showGhostObject), `angulo` — giro "de preferência" (yaw da
   *  câmera) usado só quando NENHUMA parede está perto o bastante pra
   *  travar o giro. `preferredWall` (opcional) — pedido do usuário
   *  (25/08/2026, refinado de novo no mesmo dia): "é raytracing. A primeira
   *  parede que o raio bater[...] não só quando aponta pro chão ou pra
   *  parte de baixo da parede[...] pode apontar pro meio ou a parte de cima
   *  que, ainda assim, a mesa deve ser desenhada costeada a essa parede."
   *  Quem chama (`_placeWithBuildTool`/`_updateBuildGhost`) faz um raycast
   *  DE VERDADE contra a malha 3D das paredes (`Engine3D.raycastWall`, MESMO
   *  raio da mira, sem se limitar ao plano do chão) — se bater em alguma,
   *  manda ela aqui já identificada, e ESSA é a parede usada, não importa a
   *  altura onde o raio bateu nela (meio/topo) nem se há outra mais perto do
   *  ponto (x,z) projetado no chão. Sem uma parede batida de verdade
   *  (mirando longe de qualquer uma, ou no chão livre por perto), cai de
   *  volta no critério antigo: a parede mais PERTO do ponto (x,z) mirado,
   *  dentro de um raio de alcance. Devolve `{x, z, angulo, blocked, locked}`
   *  — `angulo` é sempre o giro final a usar (travado na parede, ou o
   *  `angulo` recebido). `locked` (novo campo, 25/08/2026 — pedido do
   *  usuário do Giro Livre/rotação manual pra Objeto): `true` só quando uma
   *  parede de verdade constrangeu o giro/posição aqui (os dois casos de
   *  retorno da seção 4 abaixo); `false` em qualquer um dos "sem parede por
   *  perto o bastante" (fora de alcance, "ignorar física" ligado, mapa sem
   *  paredes). Consumido por view3d.js `onKeyDown`/`_captureFreeRotatePivot`
   *  pra RECUSAR entrar em Giro Livre enquanto o objeto está travado numa
   *  parede — girar livremente ali furaria a parede, o oposto do que esta
   *  função existe pra evitar. */
  _resolveObjectWallSnap(x, z, w, d, angulo, preferredWall) {
    if (this._paredeConfig?.ignorarFisica) return { x, z, angulo, blocked: false, locked: false };
    const walls = this._analyzedWalls || this._map?.walls || [];
    if (!walls.length) return { x, z, angulo, blocked: false, locked: false };
    const half = (window.WALL_THICKNESS_3D || 0.12) / 2; // ver engine3d.js WALL_THICKNESS_3D, exposta em window
    const hx = (w || 0.4) / 2, hz = (d || 0.4) / 2; // meia-largura/profundidade LOCAIS (antes de girar)
    const GAP = 0.01; // pequena folga visual — encosta sem "colar" exatamente em cima da face

    // 1) Parede-alvo: com `preferredWall` (raio da mira bateu nela de
    // verdade, ver comentário acima), é SEMPRE ela — sem checar alcance nem
    // procurar outra mais perto. Sem isso, cai no critério antigo: a mais
    // perto do ponto mirado, mesmo que ainda nem colida com o giro "de
    // preferência" — o alcance cresce com o tamanho do objeto (uma mesa
    // grande "sente" a parede de mais longe que um item pequeno).
    let nearest = null;
    const wallsToTry = preferredWall ? [preferredWall] : walls;
    for (const wall of wallsToTry) {
      const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-8) continue;
      const t = Utils.clamp(((x - wall.x1) * dx + (z - wall.y1) * dy) / len2, 0, 1);
      const projX = wall.x1 + dx * t, projZ = wall.y1 + dy * t;
      const dist = Math.hypot(x - projX, z - projZ);
      if (!nearest || dist < nearest.dist) nearest = { dx, dy, len: Math.sqrt(len2), dist, projX, projZ };
    }
    if (preferredWall) {
      if (!nearest) return { x, z, angulo, blocked: false, locked: false }; // parede degenerada (comprimento ~0) — não deveria acontecer, mas por segurança
    } else {
      const SNAP_RANGE = Math.max(w || 0.4, d || 0.4) + 1.4;
      if (!nearest || nearest.dist > SNAP_RANGE) return { x, z, angulo, blocked: false, locked: false };
    }

    // 2) Giro travado paralelo à parede — eixo LOCAL Z (profundidade) do
    // objeto aponta pra FORA dela (rumo ao lado onde o ponto mirado está,
    // pro dentro do cômodo), eixo LOCAL X (largura) corre PARALELO à
    // parede. Mesma convenção de engine3d.js objAnguloToRotY/rotation.y
    // (rotY = -angulo; local +X -> mundo (cos(angulo), sin(angulo)), local
    // +Z -> mundo (-sin(angulo), cos(angulo))) — isolando `angulo` de
    // "local +Z == (nx,nz)" dá `angulo = atan2(-nx, nz)`.
    let nx = x - nearest.projX, nz = z - nearest.projZ;
    let ndist = Math.hypot(nx, nz);
    if (ndist < 1e-6) { nx = -nearest.dy / nearest.len; nz = nearest.dx / nearest.len; } // sobre a linha central — sem lado definido, usa a perpendicular da própria parede
    else { nx /= ndist; nz /= ndist; }
    const wallAngulo = Math.atan2(-nx, nz);

    // 3) Posição encostada nessa MESMA parede, deslizando ao longo dela até
    // o ponto mirado — com o giro já travado, a extensão na direção da
    // normal é simplesmente a meia-profundidade do objeto (hz): o eixo Z
    // JÁ está alinhado com a normal, sem precisar da fórmula geral de caixa
    // orientada (essa só entra na checagem de outras paredes, abaixo).
    let px = nearest.projX + nx * (half + hz + GAP);
    let pz = nearest.projZ + nz * (half + hz + GAP);

    // 4) Confere se essa posição (giro já travado, nunca mais muda) não
    // invade NENHUMA outra parede por perto (cantos/reentrâncias
    // apertadas) — reaplica algumas vezes; se não convergir, realmente não
    // cabe ali (pedido do usuário: "a possibilidade de não dar é apenas
    // quando não couber a mesa no espaço").
    const axisXx = Math.cos(wallAngulo), axisXz = Math.sin(wallAngulo);
    const axisZx = -Math.sin(wallAngulo), axisZz = Math.cos(wallAngulo);
    const extentAlong = (ex, ez) => Math.abs(axisXx * ex + axisXz * ez) * hx + Math.abs(axisZx * ex + axisZz * ez) * hz;
    for (let iter = 0; iter < 4; iter++) {
      let pior = null; // pior (mais profunda) invasão nesta rodada
      for (const wall of walls) {
        const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-8) continue;
        const t = Utils.clamp(((px - wall.x1) * dx + (pz - wall.y1) * dy) / len2, 0, 1);
        const projX = wall.x1 + dx * t, projZ = wall.y1 + dy * t;
        let ex = px - projX, ez = pz - projZ;
        let dist = Math.hypot(ex, ez);
        if (dist < 1e-6) { const len = Math.sqrt(len2); ex = -dy / len; ez = dx / len; dist = 0; }
        else { ex /= dist; ez /= dist; }
        const precisa = half + extentAlong(ex, ez) + GAP;
        const invasao = precisa - dist;
        if (invasao > 1e-4 && (!pior || invasao > pior.invasao)) pior = { ex, ez, invasao, precisa, projX, projZ };
      }
      if (!pior) return { x: px, z: pz, angulo: wallAngulo, blocked: false, locked: true }; // sem invasão em nenhuma parede — posição válida
      px = pior.projX + pior.ex * pior.precisa;
      pz = pior.projZ + pior.ez * pior.precisa;
    }
    return { x, z, angulo, blocked: true, locked: true };
  },

  /** Congela o "eixo de giro" (pivô) no instante em que o Giro Livre é
   *  ativado (tecla R — ver onKeyDown) — pedido do usuário, 25/08/2026:
   *  "Ativar Giro Livre: apertar R destrava os passos discretos e rotaciona
   *  continuamente com base na sensibilidade do mouse... traço pontilhado no
   *  chão, entre o ponto de eixo de giro e o ponto da intersecção... do
   *  raytracing e o chão". Pra esse traço fazer sentido (um "cabo de
   *  relógio" de verdade, não um ponto que também foge da mira), a POSIÇÃO
   *  da peça trava junto com a ativação — só o ÂNGULO (calculado quadro a
   *  quadro em _updateBuildGhost/_placeWithBuildTool a partir daqui) continua
   *  livre. Faz os MESMOS raycasts que _updateBuildGhost/_placeWithBuildTool
   *  já fazem pra decidir onde a peça iria agora, só que uma vez só, aqui,
   *  guardados em `this._buildFreeRotatePivot`.
   *
   *  Devolve `null` (chamador NÃO entra em Giro Livre, mostra um aviso) em
   *  dois casos: mirando o vazio (sem chão/parede na frente), ou — só pra
   *  Objeto — a peça estaria TRAVADA numa parede por física agora
   *  (`_resolveObjectWallSnap` `locked:true`, ver comentário lá): deixar
   *  entrar ali giraria o objeto pra dentro da parede, o oposto do que
   *  aquela trava existe pra evitar. Porta/Janela NÃO tem essa restrição —
   *  encaixada numa parede ou não, sempre teve rotação manual livre (o campo
   *  `anguloExtra` já existia pra isso, ver _placeWithBuildTool). */
  _captureFreeRotatePivot() {
    const eng = this._engine;
    if (!eng?._ready) return null;
    const ray = eng.centerRay(this._camera);
    if (this._buildTool === 'objeto') {
      const entry = this._objectCatalog[this._objectIndex];
      if (!entry) return null;
      const hit = eng.raycastSurface(ray.origin, ray.dir);
      const wallHit = eng.raycastWall(ray.origin, ray.dir);
      const useWall = !!wallHit && (!hit || wallHit.distance < hit.t);
      if (!hit && !useWall) return null;
      let baseX = useWall ? wallHit.point.x : hit.x;
      let baseZ = useWall ? wallHit.point.z : hit.z;
      const baseY = useWall ? 0 : hit.y;
      // Snap magnético de grade (ver _isObjectGridSnapActiveNow/
      // _applyObjectGridSnap) — só no caso "livre" (não bateu direto numa
      // parede): precisa bater com o mesmo ponto que o ghost mostrou antes
      // de apertar R, senão o pivô "pula" pro lugar errado.
      if (!useWall) { const sn = this._applyObjectGridSnap(baseX, baseZ); baseX = sn.x; baseZ = sn.z; }
      const elevacao = baseY + (entry.key === 'luminaria' ? 3.0 : 0);
      if (baseY <= 1e-4 && elevacao < 2.6) {
        const { w, d } = eng.objectFootprint?.(entry.key) || {};
        const resolved = this._resolveObjectWallSnap(baseX, baseZ, w, d, this._camera.yaw, useWall ? wallHit.wall : null);
        if (resolved.locked) return null; // travado numa parede — Giro Livre indisponível (ver doc acima)
      }
      // `restingOnId` — id do objeto do mapa que está embaixo (só quando
      // pousado em cima de outro objeto, não no chão nem numa parede) — ver
      // Engine3D.raycastSurface/setXRayTarget/showGhostFootprintShadow.
      // Repassado pro pivô pra Sombra/Raio X (pedido do usuário, 25/08/2026)
      // continuarem funcionando durante o Giro Livre também, não só no Modo
      // Padrão (ver _updateBuildGhost, ramo Giro Livre de 'objeto').
      return { x: baseX, z: baseZ, baseY, wallId: null, restingOnId: useWall ? null : (hit?.restingOnId ?? null) };
    }
    if (this._buildTool === 'porta' || this._buildTool === 'janela') {
      const wallHit = eng.raycastWall(ray.origin, ray.dir);
      if (wallHit && wallHit.distance < 6) {
        const w = wallHit.wall;
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
        const len2 = (dx * dx + dy * dy) || 1;
        const tFrac = Utils.clamp(((wallHit.point.x - w.x1) * dx + (wallHit.point.z - w.y1) * dy) / len2, 0, 1);
        return { x: wallHit.point.x, z: wallHit.point.z, baseY: 0, wallId: w.id, posAoLongoDaParede: tFrac * Math.sqrt(len2), wallAngulo: Math.atan2(dy, dx) };
      }
      const hit = eng.raycastFloor(ray.origin, ray.dir);
      if (hit) {
        // MESMO encaixe (configurável — ver _isDoorSnapActiveNow/
        // mapconfig.js seção "🚪 Porta / Janela") que o ghost já mostra fora
        // do Giro Livre (ver _updateBuildGhost/_placeWithBuildTool) — precisa
        // bater com o que a pessoa VIU antes de apertar R, senão o pivô
        // "pula" pra um lugar diferente do que o ghost prometia.
        let x = hit.x, z = hit.z;
        if (this._isDoorSnapActiveNow()) {
          const snapped = eng.snapToFloorTileCenter?.(x, z);
          if (snapped) { x = snapped.x; z = snapped.z; }
        }
        return { x, z, baseY: 0, wallId: null };
      }
      const dist = 1.5;
      return { x: this._camera.x + ray.dir.x * dist, z: this._camera.z + ray.dir.z * dist, baseY: 0, wallId: null };
    }
    return null;
  },

  async _placeWithBuildTool() {
    const tool = this._buildTool;
    if (!tool || !this._map || !this._engine || typeof Mapping === 'undefined') return;
    const ray = this._engine.centerRay(this._camera);

    if (tool === 'parede') {
      // Ponto CRU da mira: testa uma parede PRIMEIRO (só no 1º ponto de
      // uma cadeia nova — "ligar uma parede a partir dali", pedido do
      // usuário), senão o chão como sempre.
      let rawX, rawZ;
      const wallHit = this._engine.raycastWall(ray.origin, ray.dir);
      if (!this._wallChainStart && wallHit && wallHit.distance < 6) { rawX = wallHit.point.x; rawZ = wallHit.point.z; }
      else {
        const hit = this._engine.raycastFloor(ray.origin, ray.dir);
        if (!hit) return;
        rawX = hit.x; rawZ = hit.z;
      }
      const resolved = this._resolveWallSnap(rawX, rawZ, this._wallChainStart);
      const px = resolved.x, pz = resolved.z;

      if (!this._wallChainStart) {
        // Conversão automática de quinas (pedido do usuário) já no PONTO
        // INICIAL — clicar em cima do MEIO de uma parede existente divide
        // ela ali antes de começar a nova cadeia a partir do nó criado.
        const wAlvo = this._findWallContainingPoint(px, pz, []);
        if (wAlvo) Mapping.splitWallAt(this._map, wAlvo.id, px, pz);
        this._wallChainStart = { x: px, y: pz };
        Utils.toast('Parede: clique no próximo ponto (botão do meio, Enter ou clicar em 🧱 de novo conclui).', { duration: 2600 });
        return;
      }
      const p0 = this._wallChainStart;
      const comprimento = Math.hypot(px - p0.x, pz - p0.y);
      if (comprimento < 0.05) return; // clique quase no mesmo lugar — ignora (segmento de comprimento ~0)
      // Dimensão mínima de parede (pedido do usuário) — só vale no modo
      // LIVRE (grade desligada pela tecla modificadora): no modo grade, um
      // segmento menor que uma célula já não existe de verdade.
      if (this._isWallFreeModeNow()) {
        const minimoLivre = Math.max(0.05, Number(this._paredeConfig?.paredeComprimentoMinimo) || 0.3);
        if (comprimento < minimoLivre) {
          Utils.toast(`Parede: comprimento mínimo no modo livre é ${Math.round(minimoLivre * 100)}cm.`, { type: 'warn', duration: 2000 });
          return;
        }
      }
      const novaParede = Mapping.addWall(this._map, p0.x, p0.y, px, pz, { layerId: this._layerIdParaNovosItens() });
      // Conversão automática de quinas no PONTO FINAL do segmento — mesma
      // ideia do ponto inicial acima ("quando uma parede livre toca uma
      // parede de grade, divide a parede de grade no ponto de contato
      // criando um nó compartilhado").
      const wAlvoFinal = this._findWallContainingPoint(px, pz, [novaParede.id]);
      if (wAlvoFinal) Mapping.splitWallAt(this._map, wAlvoFinal.id, px, pz);
      this._wallChainStart = { x: px, y: pz }; // encadeia — próximo clique continua a parede a partir daqui
      await this._afterMapMutated();
      return;
    }

    if (tool === 'objeto') {
      const entry = this._objectCatalog[this._objectIndex];
      if (!entry) { Utils.toast('Nenhum tipo de objeto disponível.', { type: 'warn' }); return; }
      // Giro Livre ativo (tecla R — ver onKeyDown/_captureFreeRotatePivot):
      // posição já CONGELADA no pivô capturado na hora de ativar, então nem
      // repete os raycasts de posição aqui — só finaliza com o ÂNGULO que o
      // ghost está mostrando agora (`_buildFreeRotateFinalAngle`, já com o
      // travamento de 15° do Shift aplicado se for o caso — atualizado a
      // cada quadro em _updateBuildGhost enquanto este modo está ligado).
      // MESMA peça/posição/ângulo que o ghost já prometeu, pra nunca "pular"
      // ao clicar.
      if (this._buildFreeRotate && this._buildFreeRotatePivot) {
        const piv = this._buildFreeRotatePivot;
        const elevacao = piv.baseY + (entry.key === 'luminaria' ? 3.0 : 0);
        const angulo = this._buildFreeRotateFinalAngle ?? this._buildLastFreeAngle ?? this._camera.yaw;
        const extra = { angulo, elevacao, layerId: this._layerIdParaNovosItens() };
        if (entry.key === 'mesa') Object.assign(extra, { forma: 'retangulo', largura: 1.2, profundidade: 0.6, altura: 0.74, cor: '#8a92a3' });
        else if (entry.key === 'coluna') Object.assign(extra, { forma: 'poligono', raio: 0.18, lados: 24, altura: 2.6, cor: '#9aa4b2' });
        // Pedido do usuário: "Deve ser possível colocar um novo cubo no
        // cenário 3D pelo botão do rodapé, o botão objeto [...] não deve
        // abrir automaticamente o modo Modelador, deve continuar no modo
        // normal de navegação." — forma explícita de cubo de verdade (lados
        // iguais), pelo mesmo caminho normal de `Mapping.addObject` — sem
        // `customMesh`/Modelador nenhum envolvido aqui (só entra se o
        // usuário abrir esse objeto no Modelador depois, por vontade
        // própria).
        else if (entry.key === 'cubo') Object.assign(extra, { forma: 'retangulo', largura: 0.4, profundidade: 0.4, altura: 0.4, cor: '#8a92a3' });
        const objNovo = Mapping.addObject(this._map, piv.x, piv.z, entry.key, extra);
        await this._afterObjectAddedIncremental(objNovo);
        // Inserido: sai da fixação do Giro Livre (pedido do usuário,
        // 25/08/2026: "Quando o R foi pressionado ao clicar com o botão
        // esquerdo do mouse ou com ENTER o objeto é inserido e sai da
        // fixação da rotação (desativa o R que tinha sido pressionado
        // antes)") — MESMA limpeza de estado do toggle manual de R (ver
        // onKeyDown), pra próxima peça começar do zero no Modo Padrão.
        this._buildFreeRotate = false;
        this._buildFreeRotatePivot = null;
        this._buildManualRot = 0;
        return;
      }
      // Superfície mais próxima na mira: tampo de OUTRO objeto (mesa etc.)
      // ou o chão, o que estiver mais perto — pedido do usuário: "ao mirar
      // em cima da mesa, deve ser possível colocar coisas em cima dela.
      // Atualmente, mesmo apontando para a mesa o objeto é colocado no
      // chão". `hit.y` é a elevação de onde bateu (0 = chão).
      const hit = this._engine.raycastSurface(ray.origin, ray.dir);
      // Raycast de verdade contra a malha das paredes (MESMO raio da mira,
      // sem se limitar ao plano do chão) — pedido do usuário: "é
      // raytracing. A primeira parede que o raio bater... não só quando
      // aponta pro chão... pode apontar pro meio ou a parte de cima da
      // parede". Se bater numa parede MAIS PERTO do que a superfície de
      // chão/objeto (`hit`, incluindo o caso de nem haver `hit` nenhum —
      // mirando o meio/topo da parede, o plano infinito do chão pode nem
      // cruzar num ponto válido à frente), é a parede que manda: o objeto
      // pousa no CHÃO (nunca flutuando na altura onde o raio bateu na
      // parede — uma mesa não fica pendurada só porque a mira estava no
      // meio dela) rente a ela, no ponto (x,z) onde o raio bateu.
      const wallHit = this._engine.raycastWall(ray.origin, ray.dir);
      // Colisão lateral contra objeto/porta/janela (pedido do usuário,
      // rodada 50: "posicionar os objetos um do lado do outro [...] o
      // raycasting bate nos objetos e o ghost do novo objeto é posicionado
      // ao seu lado [...] dependendo de onde bater o raio. Isso deve
      // funcionar em tudo que é objeto [...] porta, janela, cubo, objetos
      // padrão") — só testada com "Considerar colisão" ativo na config
      // unificada de "🧲 Física de colocação" (mapconfig.js); no "Modo
      // livre" (`ignorarFisica` true) fica exatamente como antes, sem
      // nenhum encosto lateral (nem contra parede — comportamento já
      // existente — nem contra objeto/porta/janela, este novo). Parede em
      // si continua com seu caminho dedicado mais completo logo abaixo
      // (`_resolveObjectWallSnap`, alinha o giro paralelo a ela).
      const lateralHit = !this._paredeConfig?.ignorarFisica ? this._engine.raycastLateral?.(ray.origin, ray.dir) : null;
      const useLateral = !!lateralHit && (!hit || lateralHit.t < hit.t) && (!wallHit || lateralHit.t < wallHit.distance);
      const useWall = !useLateral && !!wallHit && (!hit || wallHit.distance < hit.t);
      if (!hit && !useWall && !useLateral) return;
      let baseX, baseZ, baseY;
      if (useLateral) {
        // Encosta na face lateral atingida: desloca a partir do ponto de
        // impacto ao longo da normal (horizontal) da face, meia-dimensão do
        // NOVO objeto pra fora — fica rente, sem atravessar o alvo. `meia`
        // usa a maior das duas dimensões do novo objeto como folga segura
        // (aproximação: não gira a caixa orientada do alvo pra achar a
        // distância exata — suficiente pra encostar sem sobrepor no caso
        // comum de objetos/cubos/portas/janelas de tamanho modesto).
        const { w, d } = this._engine.objectFootprint?.(entry.key) || {};
        const meia = Math.max(w || 0.4, d || 0.4) / 2;
        const nx = lateralHit.normal.x, nz = lateralHit.normal.z;
        const nlen = Math.hypot(nx, nz) || 1;
        baseX = lateralHit.x + (nx / nlen) * meia;
        baseZ = lateralHit.z + (nz / nlen) * meia;
        // Base no mesmo piso do alvo encostado — objetos padrão sempre
        // pousam no chão (elevação 0); ressalva no changelog da rodada 50.
        baseY = 0;
      } else if (useWall) {
        baseX = wallHit.point.x; baseZ = wallHit.point.z; baseY = 0;
      } else {
        baseX = hit.x; baseZ = hit.z; baseY = hit.y;
      }
      // Snap magnético de grade (pedido do usuário, 25/08/2026: "Faça o
      // 'Snap magnético de grade', tecla modificadora e o 'inverter lógica'
      // para os demais objetos também" — ver _isObjectGridSnapActiveNow/
      // _applyObjectGridSnap/mapconfig.js seção "📦 Objeto") — só no caso
      // "livre" (não bateu direto numa parede nem encostou lateralmente);
      // nesses outros dois casos a posição final já foi decidida de
      // propósito (parede: por _resolveObjectWallSnap logo abaixo; lateral:
      // pelo cálculo acima), a grade só atrapalharia o encosto certinho.
      if (!useWall && !useLateral) { const sn = this._applyObjectGridSnap(baseX, baseZ); baseX = sn.x; baseZ = sn.z; }
      // Mesa/Coluna: mesmos campos EXPLÍCITOS de forma/dimensão que o painel
      // 2D usa (mapview.js _MESA_FORMA_DEF/_PILAR_FORMA_DEF) — sem isso,
      // Mapping.addObject cairia no perfil velho de OBJECT3D_PROFILES (mesa
      // vira uma placa de 5cm flutuando a 0.72m, sem pernas visíveis, porque
      // aquele perfil foi pensado só pro tampo; applyDefaultShapeToObject
      // também descarta o y0 na conversão). Passando forma:'retangulo'/
      // 'poligono' aqui, applyDefaultShapeToObject nem mexe no objeto (só
      // define o padrão pra quem ainda não tem forma explícita) e o 3D
      // desenha exatamente como o painel 2D desenharia.
      // Luminária: fica 3m ACIMA de onde a mira bateu, por padrão — pedido
      // do usuário ("apontando para o chão, será naquele exato ponto, só
      // que 3 metros acima, por padrão, para esse novo objeto luminária").
      // Seu perfil (OBJECT3D_PROFILES.luminaria, ver engine3d.js) já dá as
      // dimensões certas via applyDefaultShapeToObject, então não precisa
      // de um Object.assign de forma explícita aqui, só da elevação.
      const elevacao = baseY + (entry.key === 'luminaria' ? 3.0 : 0);
      // "Ignorar física" (pedido do usuário, 25/08/2026, refinado no mesmo
      // dia, e de novo: "ao apontar para uma parede, a mesa... deve ir
      // costeando paralela a ela, mesmo apontando diretamente para a
      // parede" / "é raytracing... pode apontar pro meio ou a parte de cima
      // da parede") — MESMO critério do ghost em _updateBuildGhost (ver
      // comentário lá): só testa parede quando pousando no chão (baseY===0)
      // abaixo do topo dela; pousar em cima de outro objeto é sempre
      // permitido. Perto de uma parede (batida pelo raio de verdade, ou
      // só perto o bastante do ponto mirado no chão — ver
      // _resolveObjectWallSnap), o GIRO final vem travado dela (não mais o
      // yaw da câmera), daí `angulo` só é decidido DEPOIS de resolver. Sem
      // posição válida: nem insere (o ghost já nem apareceria ali, mas o
      // clique é conferido de novo aqui por segurança — ex.: config mudou
      // entre um quadro e outro).
      // `+ this._buildManualRot` — passo manual de 45° acumulado pelo botão
      // direito do mouse (Modo Padrão, pedido do usuário 25/08/2026 — ver
      // handleMiddleClickAction), generalizado da Porta/Janela pro Objeto também.
      // Some da conta só quando o giro NÃO fica travado numa parede abaixo
      // (ali o giro final vem inteiro de `_resolveObjectWallSnap`, de
      // propósito, ignorando tanto a câmera quanto este passo manual).
      // Modo de alinhamento (pedido do usuário, 25/08/2026 — ver
      // _alignmentModeAtual/_resolveFreeAlignmentAngle): fora do 'padrao',
      // a base do ângulo deixa de ser o yaw da câmera e passa a ser uma das
      // 4 direções fixas — no modo 'cardinal' o botão do meio CICLA entre
      // elas (passos de 90°, ver handleMiddleClickAction); no 'personagem'
      // é automático, sempre a mais próxima de pra onde a câmera olha (ver
      // _nearestCardinalAngle) — em nenhum dos dois `_buildManualRot` entra
      // na conta (fica parado em 0, só volta a valer no modo 'padrao').
      let px = baseX, pz = baseZ, angulo = this._resolveFreeAlignmentAngle(this._camera.yaw);
      if (baseY <= 1e-4 && elevacao < 2.6) {
        const { w, d } = this._engine.objectFootprint?.(entry.key) || {};
        // BUG corrigido (pedido do usuário, 25/08/2026: "o botão direito do
        // mouse não está girando o ghost dos objetos"): este call site
        // passava `this._camera.yaw` puro em vez de `angulo` (que já inclui
        // `_buildManualRot`/o alinhamento cardinal, ver acima) — como
        // `_resolveObjectWallSnap` devolve ESSE MESMO parâmetro sem alterar
        // nos casos "sem parede por perto o bastante pra travar" (a
        // situação mais comum, objeto solto no meio do cômodo), o giro
        // manual do botão direito (e o alinhamento cardinal) era
        // silenciosamente descartado toda vez que o objeto não estava perto
        // de nenhuma parede — só sobrevivia (por acidente) quando `locked`
        // de verdade entrava em jogo, ali SIM o giro final vem inteiro da
        // parede, ignorando este parâmetro de propósito (ver comentário
        // grande da função). Passando `angulo` agora, o giro manual/
        // cardinal só é substituído quando REALMENTE travado numa parede,
        // exatamente como o comentário acima ("Some da conta só quando o
        // giro NÃO fica travado numa parede") sempre disse que deveria ser.
        const resolved = this._resolveObjectWallSnap(baseX, baseZ, w, d, angulo, useWall ? wallHit.wall : null);
        if (resolved.blocked) { Utils.toast('Sem espaço aqui — o objeto esbarraria numa parede.', { type: 'warn', duration: 2000 }); return; }
        px = resolved.x; pz = resolved.z; angulo = resolved.angulo;
      }
      const extra = { angulo, elevacao, layerId: this._layerIdParaNovosItens() };
      if (entry.key === 'mesa') {
        // 0.74m — MESMO valor de mapview.js _MESA_FORMA_DEF (pedido do
        // usuário: "a altura da mesa padrão deve ser de 74 cm").
        Object.assign(extra, { forma: 'retangulo', largura: 1.2, profundidade: 0.6, altura: 0.74, cor: '#8a92a3' });
      } else if (entry.key === 'coluna') {
        Object.assign(extra, { forma: 'poligono', raio: 0.18, lados: 24, altura: 2.6, cor: '#9aa4b2' });
      } else if (entry.key === 'cubo') {
        // Pedido do usuário (rodada 47): "Deve ser possível colocar um
        // novo cubo no cenário 3D pelo botão do rodapé, o botão objeto."
        Object.assign(extra, { forma: 'retangulo', largura: 0.4, profundidade: 0.4, altura: 0.4, cor: '#8a92a3' });
      }
      const objNovo = Mapping.addObject(this._map, px, pz, entry.key, extra);
      await this._afterObjectAddedIncremental(objNovo);
      return;
    }

    if (tool === 'item') {
      const item = this._unsortedItems[this._itemIndex];
      if (!item) { Utils.toast('Nenhum patrimônio sem lugar pra colocar.', { type: 'warn' }); return; }
      const hit = this._engine.raycastFloor(ray.origin, ray.dir);
      if (!hit) return;
      // `mapaLayerId` — BUG corrigido (pedido do usuário, 22/08/2026:
      // "Atualmente os itens adicionados pelo 3D não estão em qualquer
      // camada"): faltava aqui, diferente de parede/objeto/porta/janela
      // colocados no 3D (ver _placeWithBuildTool acima), que já usam
      // _layerIdParaNovosItens(). Mesmo campo que o pino usa no 2D (ver
      // mapview.js _placeItemPinAt/_placeNewItemPinAt).
      // `mapaAuto: false` — 2º BUG corrigido na mesma leva (pedido do
      // usuário, 25/08/2026, ver getItemsSemPosicaoNoMapa acima): faltava
      // aqui também. Sem isto, posicionar pelo 3D um item que só tinha uma
      // posição de RESERVA automática (`mapaAuto: true`, ver js/db.js Parte
      // 1) deixava a flag PRESA em `true` mesmo depois do posicionamento
      // deliberado — o item continuaria aparecendo como "sem lugar" na 📦
      // Caixa pra sempre. O 2D já grava `mapaAuto: false` em todo
      // posicionamento deliberado (ver mapview.js `_placeItemPinAt`/
      // `_placeNewItemPinAt`) — o 3D precisa fazer o mesmo.
      const patch = { mapaX: hit.x, mapaY: hit.z, mapaPiso: 0, mapaAuto: false, mapaLayerId: this._layerIdParaNovosItens() };
      if (item.ambienteId !== this._map.id) patch.ambienteId = this._map.id;
      await DB.updateItem(item.id, patch);
      this._unsortedItems.splice(this._itemIndex, 1);
      if (this._itemIndex >= this._unsortedItems.length) this._itemIndex = Math.max(0, this._unsortedItems.length - 1);
      Utils.toast('Item posicionado ✓', { type: 'ok' });
      await this._afterMapMutated({ reloadItems: true });
      this._renderHotbar();
      this._renderRoulette();
      return;
    }

    if (tool === 'porta' || tool === 'janela') {
      const isDoor = tool === 'porta';
      let x, y, extra;
      // Giro Livre ativo (tecla R — ver onKeyDown/_captureFreeRotatePivot):
      // posição (e, se encaixada, a parede-alvo) CONGELADAS no pivô
      // capturado ao ativar — só o ÂNGULO segue variando com a mira (ver
      // _updateBuildGhost, ramo espelhado). `anguloExtra` continua sendo o
      // campo salvo quando encaixada numa parede (Mapping.resolveDoorWindowPos
      // soma `wallAngulo + anguloExtra`) — por isso a conversão de volta
      // `angulo - piv.wallAngulo` aqui, pra guardar só o EXTRA sobre a
      // parede, exatamente como o Modo Padrão já fazia.
      if (this._buildFreeRotate && this._buildFreeRotatePivot) {
        const piv = this._buildFreeRotatePivot;
        const angulo = this._buildFreeRotateFinalAngle ?? this._buildLastFreeAngle ?? (piv.wallAngulo ?? this._camera.yaw);
        x = piv.x; y = piv.z;
        extra = piv.wallId
          ? { parentWallId: piv.wallId, posAoLongoDaParede: piv.posAoLongoDaParede, anguloExtra: angulo - piv.wallAngulo, layerId: this._layerIdParaNovosItens() }
          : { parentWallId: null, angulo, layerId: this._layerIdParaNovosItens() };
        if (isDoor) Mapping.addDoor(this._map, x, y, extra);
        else Mapping.addWindow(this._map, x, y, extra);
        await this._afterMapMutated();
        // Sai da fixação do Giro Livre ao inserir — ver comentário grande
        // equivalente no ramo 'objeto' de _placeWithBuildTool.
        this._buildFreeRotate = false;
        this._buildFreeRotatePivot = null;
        this._buildManualRot = 0;
        return;
      }
      const wallHit = this._engine.raycastWall(ray.origin, ray.dir);
      if (wallHit && wallHit.distance < 6) {
        const w = wallHit.wall;
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
        const len2 = (dx * dx + dy * dy) || 1;
        const tFrac = Utils.clamp(((wallHit.point.x - w.x1) * dx + (wallHit.point.z - w.y1) * dy) / len2, 0, 1);
        x = wallHit.point.x; y = wallHit.point.z;
        // `anguloExtra` — rotação manual acumulada pelo botão do meio do
        // mouse (this._buildManualRot, ver handleMiddleClickAction/_updateBuildGhost
        // acima) enquanto se mirava nesta parede — MESMO campo que o ghost já
        // usa pra pré-visualizar (precisa bater exatamente com o que o ghost
        // mostrou, senão a peça "pula" de ângulo ao ser inserida de verdade).
        extra = { parentWallId: w.id, posAoLongoDaParede: tFrac * Math.sqrt(len2), anguloExtra: this._buildManualRot, layerId: this._layerIdParaNovosItens() };
      } else {
        // Não mirando numa parede: fica "no ar", solta — mas ainda na
        // posição X/Z onde a MIRA encosta no chão, igual a qualquer outro
        // objeto (pedido do usuário: "a porta, assim como todos os objetos,
        // devem ser posicionados de acordo para onde a mira encosta no
        // chão"; antes usava uma distância fixa de 1.5m na frente da câmera,
        // que não tinha nada a ver com pra onde o jogador tava mirando de
        // verdade). Só cai de volta pra distância fixa se a mira nem chegar
        // no chão (ex.: mirando pro céu).
        const hit = this._engine.raycastFloor(ray.origin, ray.dir);
        if (hit) { x = hit.x; y = hit.z; }
        else { const dist = 1.5; x = this._camera.x + ray.dir.x * dist; y = this._camera.z + ray.dir.z * dist; }
        // Trava no CENTRO do quadrado de 1m do chão por PADRÃO (pedido do
        // usuário, 25/08/2026: "O travar no centro do bloco deve ser o
        // padrão" — antes só acontecia segurando Shift). Agora CONFIGURÁVEL
        // em "⚙️ Configurações" › 🚪 Porta/Janela (pedido do usuário, mesmo
        // dia: "deve haver uma seção da porta nas configurações 3D... e
        // outras opções como tem para a parede") — ver
        // _isDoorSnapActiveNow/mapconfig.js DEFAULTS. Por padrão de fábrica
        // continua sendo "trava sempre, Shift libera", mesmo espírito de
        // "segurar uma tecla modificadora desliga o encaixe" já usado pela
        // ferramenta 🧱 Parede (ver _isWallFreeModeNow), mas agora com
        // tecla/inversão/liga-desliga escolhíveis. MESMO encaixe que o
        // ghost já mostra (ver _updateBuildGhost) — precisa usar exatamente
        // a posição que a pessoa VIU antes de clicar, senão a peça inserida
        // "pula" pra um lugar diferente do que o ghost prometia.
        if (this._isDoorSnapActiveNow()) {
          const snapped = this._engine.snapToFloorTileCenter?.(x, y);
          if (snapped) { x = snapped.x; y = snapped.z; }
        }
        // Modo de alinhamento (pedido do usuário, 25/08/2026 — ver
        // _alignmentModeAtual/_resolveFreeAlignmentAngle acima): fora do
        // modo 'padrao' (livre), a base do ângulo "no ar" deixa de ser a
        // direção da mira e passa a ser uma das 4 direções fixas — MESMO
        // espírito do ramo 'objeto' de _placeWithBuildTool acima. Encaixada
        // numa parede (ramo `if (wallHit...)` logo acima) não passa por
        // aqui — continua sempre alinhada à própria parede, de propósito
        // (ver mapconfig.js DEFAULTS.portaJanelaModoAlinhamento).
        const anguloBase = this._resolveFreeAlignmentAngle(Math.atan2(ray.dir.z, ray.dir.x));
        extra = { parentWallId: null, angulo: anguloBase, layerId: this._layerIdParaNovosItens() };
      }
      if (isDoor) Mapping.addDoor(this._map, x, y, extra);
      else Mapping.addWindow(this._map, x, y, extra);
      await this._afterMapMutated();
      return;
    }

    if (tool === 'camera') {
      // "Deve ser possível 'olhar' no 3D por câmeras fixas no cenário... Dá
      // para fazer a roleta para as câmeras também" — a roleta já escolhe
      // QUAL câmera (this._cameraIndex); o clique aqui CONFIRMA: entra na
      // visão dela, ou sai se já for a que está sendo assistida agora (mesmo
      // toggle de re-clicar em 📷, ver _selectBuildTool).
      const camEntry = (this._map.cameras || [])[this._cameraIndex];
      if (!camEntry) { Utils.toast('Nenhuma câmera no mapa pra assistir.', { type: 'warn' }); return; }
      if (this._camMode && this._camMode.camId === camEntry.id) this._exitCameraView();
      else this._enterCameraView(camEntry.id);
      return;
    }
  },

  // ---------- "Assistir" uma câmera fixa (pedido do usuário: "deve ser
  // possível 'olhar' no 3D por câmeras fixas no cenário... Essa câmera deve
  // corresponder a projeção mostrada na tela do app, alinhada e a altura
  // correta... Dá para colocar uma rotina de movimentação padrão para o
  // player... Nas câmeras fixas, é possível mover de um lado para o outro
  // (limitado)... zoom e também inclinar para cima e para baixo de forma
  // limitada"). Enquanto ativo, `this._camera` continua sendo a posição DE
  // VERDADE do jogador (agora andando sozinho — ver _updateAutopilot), só
  // que quem é renderizado/visto na tela passa a ser a câmera fixa (ver
  // _computeWatchCameraPose, chamado em _loop) — é assim que o boneco palito
  // (cabeça de câmera) aparece andando pelo cenário: ele é o próprio
  // jogador, só visto de fora agora. ----------
  _CAM_VIEW_DEFAULT_FOV: 60,
  _CAM_VIEW_FOV_MIN: 20,
  _CAM_VIEW_FOV_MAX: 80,
  _CAM_VIEW_PAN_MAX: Math.PI * 45 / 180, // "mover de um lado para o outro (limitado tanto para um lado quanto para o outro)"
  _CAM_VIEW_TILT_MAX: Math.PI * 25 / 180, // "inclinar para cima e para baixo de forma limitada"

  _enterCameraView(camId) {
    this._camMode = { camId, pan: 0, tilt: 0, zoomFov: this._CAM_VIEW_DEFAULT_FOV };
    this._autopilotTarget = null; // força escolher um novo destino de passeio já no 1º _updateAutopilot
    this._playerWalking = false;
    // Boneco palito só aparece "quando é outra câmera sendo usada para
    // observar o cenário" (pedido do usuário) — ligado só aqui/desligado só
    // em _exitCameraView, nunca durante o andar normal em 1ª pessoa.
    this._engine?.setPlayerFigureVisible?.(true);
    this._engine?.setFov?.(this._camMode.zoomFov);
    this._renderHotbar();
  },

  _exitCameraView() {
    this._camMode = null;
    this._engine?.setPlayerFigureVisible?.(false);
    this._engine?.setFov?.(72); // FOV padrão do jogador em 1ª pessoa (ver Engine3D._initThree)
    this._renderHotbar();
  },

  /** Pose (posição/ângulo) de onde renderizar enquanto "assistindo" uma
   *  câmera fixa — MESMA conversão ângulo->yaw e altura (baseY+ALTURA_CAMERA)
   *  já usadas pra iniciar a visão 3D a partir de uma câmera (ver mount()) e
   *  pra desenhar a malha da câmera (engine3d.js setScene, ALTURA_CAMERA),
   *  pra a projeção bater exatamente com o que a malha mostra no mapa —
   *  pedido do usuário. `pan`/`tilt` (ambos limitados, ver constantes acima)
   *  só deslocam a partir dessa base, nunca saem do intervalo permitido. */
  _computeWatchCameraPose() {
    const cfg = this._camMode;
    const cam = (this._map?.cameras || []).find((c) => c.id === cfg.camId);
    if (!cam) return this._camera;
    const ALTURA_CAMERA = 1.6; // mesmo valor de engine3d.js setScene
    const baseY = (cam.piso || 0) * 2.8;
    const yaw = (cam.angulo || 0) - Math.PI / 2 + cfg.pan;
    return { x: cam.x, y: baseY + ALTURA_CAMERA, z: cam.y, yaw, pitch: cfg.tilt };
  },

  // ---------- Raio X global (rodada 48) — pedido do usuário: "deve ter um
  // botão que ativa o raio-x [...] com esse novo botão, tudo no cenário fica
  // sob efeito raio-x [...] Deve haver uma animação de um óculos sendo
  // colocado na câmera." Sub-opções por categoria (rodada 49) — pedido do
  // usuário: "deve haver subopções como 'portas', 'janelas' (mesmo
  // fechadas), 'paredes'. E uma outra opção 'tudo no cenário', se esta
  // opção for marcada, todas as outras são marcadas e desabilitadas. Voltam
  // a ficar habilitadas, se a opção 'tudo no cenário' for desativada."
  // `this._xrayGlobal` = `{ objetos, paredes, portas, janelas }` (estado de
  // cada checkbox — a lógica de "tudo no cenário" marca/desmarca e
  // habilita/desabilita os 4 checkboxes é feita no PRÓPRIO mapconfig.js, do
  // lado da UI; aqui só recebe o resultado final já combinado). Botões/
  // checkboxes em "configurações 3D" (js/mapconfig.js, seção "🎬
  // Apresentação") chamam isto direto via `window.View3D._toggleGlobalXRay`.
  // ----------
  _toggleGlobalXRay(flags) {
    const estavaAtivo = Object.values(this._xrayGlobal || {}).some(Boolean);
    this._xrayGlobal = { objetos: false, paredes: false, portas: false, janelas: false, ...flags };
    const agoraAtivo = Object.values(this._xrayGlobal).some(Boolean);
    this._xrayGlobalActive = agoraAtivo; // mantido pra retrocompatibilidade de quem só quer saber "tem algo ligado?"
    if (agoraAtivo && !estavaAtivo) this._playXRayGlassesAnimation();
    this._engine?.setGlobalXRay?.(this._xrayGlobal);
    Utils.toast(agoraAtivo ? '👓 Raio X do cenário ativado.' : 'Raio X do cenário desativado.', { duration: 1800 });
  },

  /** Óculos de raio-x "sendo colocados" — puramente decorativo (overlay 2D
   *  em cima do canvas, ver HTML `#v3d-xray-glasses` no mount()): desce de
   *  cima da tela até o centro (como se estivesse sendo posto no rosto da
   *  câmera/jogador), segura um instante, e desaparece — a mudança REAL de
   *  material (translúcido/wireframe) já foi aplicada no mesmo instante em
   *  `_toggleGlobalXRay` acima, então a animação nunca atrasa o efeito de
   *  verdade, só ilustra ele. */
  _playXRayGlassesAnimation() {
    const el = this._container?.querySelector('#v3d-xray-glasses');
    if (!el) return;
    el.classList.remove('v3d-xray-glasses-play'); // reinicia se clicado 2x rápido
    void el.offsetWidth; // força reflow — sem isso remover+adicionar a mesma classe no mesmo tick não reinicia a animação CSS
    el.classList.add('v3d-xray-glasses-play');
  },

  // ---------- Sobrevoo automático do cenário (rodada 48) — pedido do
  // usuário: "Um ponto é definido no centro da concentração de objetos em
  // todo o mapa [...] a câmera sempre fica apontando para ele [...] começa
  // de cima dando uma visão panorâmica [...] e vai girando ao redor desse
  // ponto fixo. Depois de dar uma volta completa, começa a ir descendo em y
  // e dá mais meia volta [...] Então começa a se aproximar do ponto fixo até
  // chegar nele. E o modo normal de navegação fica ativo. Em qualquer
  // momento [...] dá para apertar qualquer botão ou o mouse e o personagem é
  // 'ativado' no modo normal de navegação. Se estiver no alto, então, começa
  // a cair." Botão em "configurações 3D" (#mc-scene-flythrough).
  // MESMO padrão arquitetural de `_camMode`/`_computeWatchCameraPose`: uma
  // pose calculada à parte (`_computeFlythroughPose`) substitui só a câmera
  // RENDERIZADA (ver `_loop`), sem tocar `this._camera`/física, enquanto
  // `_update` fica em pausa total (ver o retorno antecipado lá) — ao
  // terminar (ou cancelar), `this._camera` É finalmente atualizado pra pose
  // atual, e a física normal (inclusive queda por gravidade) retoma dali.
  // ----------
  _startSceneFlythrough() {
    if (!this._map) return;
    const objs = this._map.objects || [];
    // "Centro da concentração de objetos": média das posições (x,y do
    // mapa 2D — ver Mapping.addObject) — cai na origem se não houver
    // nenhum objeto ainda.
    let cx = 0, cy = 0, raio = 6;
    if (objs.length) {
      cx = objs.reduce((s, o) => s + (o.x || 0), 0) / objs.length;
      cy = objs.reduce((s, o) => s + (o.y || 0), 0) / objs.length;
      raio = Math.max(4, ...objs.map((o) => Math.hypot((o.x || 0) - cx, (o.y || 0) - cy))) + 3;
    }
    this._flythrough = {
      target: { x: cx, y: this.EYE_HEIGHT, z: cy },
      raio,
      t0: performance.now(),
      T1: 9000, // volta completa, de cima (visão panorâmica)
      T2: 6000, // descendo + mais meia volta
      T3: 4000, // aproximação final até o ponto fixo
      yawInicio: this._camera ? this._camera.yaw : 0,
    };
    this._flythroughActive = true;
    Utils.toast('🚁 Sobrevoo automático — aperte qualquer tecla ou clique pra assumir o controle.', { duration: 3000 });
  },

  /** Direção (yaw/pitch, MESMA convenção de `this._camera` — ver
   *  Cam3DMath.cameraForward em engine3d.js) pra olhar de `pos` até `alvo`.
   *  Usado pra manter a câmera sempre apontando pro ponto fixo durante o
   *  sobrevoo (mesmo espírito do ponto-alvo fixo do Modelador — ver
   *  modeler-core.js `_updateOrbitCamera`, `state.camera.lookAt(...)`, só
   *  que aqui a câmera é a do jogo normal, yaw/pitch, não a do Three.js
   *  diretamente). */
  _yawPitchToward(pos, alvo) {
    const dx = alvo.x - pos.x, dy = alvo.y - pos.y, dz = alvo.z - pos.z;
    const distFlat = Math.hypot(dx, dz);
    return { yaw: Math.atan2(-dx, dz), pitch: Math.atan2(-dy, distFlat) };
  },

  _computeFlythroughPose() {
    const f = this._flythrough;
    if (!f) return this._camera;
    const decorridoTotal = performance.now() - f.t0;
    const alvo = f.target;
    let orbitYaw, orbitHeight, orbitDist, pos;
    if (decorridoTotal < f.T1) {
      // Fase 1: de cima, panorâmica, volta completa (2π).
      const t = decorridoTotal / f.T1;
      orbitYaw = t * Math.PI * 2;
      orbitHeight = f.raio * 1.1; // "de cima" — bem mais alto que o raio do cenário
      orbitDist = f.raio * 1.15;
    } else if (decorridoTotal < f.T1 + f.T2) {
      // Fase 2: descendo em y + mais meia volta (π) — continua a PARTIR do
      // ângulo/altura onde a fase 1 parou, sem "pulo".
      const t = (decorridoTotal - f.T1) / f.T2;
      orbitYaw = Math.PI * 2 + t * Math.PI;
      orbitHeight = f.raio * 1.1 + (f.raio * 0.35 - f.raio * 1.1) * t;
      orbitDist = f.raio * 1.15 + (f.raio * 0.7 - f.raio * 1.15) * t;
    } else {
      // Fase 3: aproximação — some a órbita, anda em linha reta da última
      // posição orbital até o próprio ponto fixo (altura do jogador normal).
      const t = Math.min(1, (decorridoTotal - f.T1 - f.T2) / f.T3);
      const ease = t * t * (3 - 2 * t);
      orbitYaw = Math.PI * 3; // ângulo final da fase 2 (2π + π)
      const alturaFim = f.raio * 0.35, distFim = f.raio * 0.7;
      const de = { x: alvo.x + distFim * Math.sin(orbitYaw), y: alvo.y + alturaFim, z: alvo.z + distFim * Math.cos(orbitYaw) };
      pos = { x: de.x + (alvo.x - de.x) * ease, y: de.y + (alvo.y - de.y) * ease, z: de.z + (alvo.z - de.z) * ease };
      // Direção congelada (mesmo yaw da órbita) — só o PITCH nivela pra 0
      // (olhando pra frente, não mais pra baixo) conforme se aproxima —
      // "então o modo normal de navegação fica ativo" já parecendo andar
      // de pé, não flutuando olhando pro chão.
      const dirDe = this._yawPitchToward(de, alvo);
      const poseAtual = { x: pos.x, y: pos.y, z: pos.z, yaw: dirDe.yaw, pitch: dirDe.pitch * (1 - ease) };
      if (t >= 1) { this._finishFlythrough(poseAtual); return this._camera; }
      return poseAtual;
    }
    pos = { x: alvo.x + orbitDist * Math.sin(orbitYaw), y: alvo.y + orbitHeight, z: alvo.z + orbitDist * Math.cos(orbitYaw) };
    const dir = this._yawPitchToward(pos, alvo);
    return { x: pos.x, y: pos.y, z: pos.z, yaw: dir.yaw, pitch: dir.pitch };
  },

  /** Chamado quando a apresentação termina naturalmente (chegou no ponto) OU
   *  é cancelada por qualquer tecla/clique (`_cancelFlythrough`) — em ambos
   *  os casos, "o modo normal de navegação fica ativo. Se estiver no alto,
   *  então, começa a cair": grava a pose atual em `this._camera` de verdade
   *  e libera `_grounded=false` pra física de queda normal assumir dali (ver
   *  `_update`) — se já estiver no chão, cai da altura zero (nada muda). */
  _finishFlythrough(pose) {
    const p = pose || this._computeFlythroughPose();
    this._camera.x = p.x; this._camera.y = p.y; this._camera.z = p.z;
    this._camera.yaw = p.yaw; this._camera.pitch = p.pitch || 0;
    this._flythroughActive = false;
    this._flythrough = null;
    this._grounded = false;
    this._vel.y = 0;
  },

  _cancelFlythrough() {
    if (!this._flythroughActive) return;
    this._finishFlythrough(this._computeFlythroughPose());
    Utils.toast('Sobrevoo interrompido — controle normal ativado.', { duration: 1800 });
  },

  _updateFlythrough(delta) {
    const f = this._flythrough;
    if (!f) { this._flythroughActive = false; return; }
    const decorrido = performance.now() - f.t0;
    if (decorrido >= f.T1 + f.T2 + f.T3) this._finishFlythrough();
  },

  // ---------- NOVO (03/09/2026) — voo genérico da câmera até um ponto do
  // mundo, pedido verbatim (item 1, "Ver no mapa 3D" do patrimônio): "se for
  // no 3D, deve haver três jeitos de mostrar. Um jeito, mostra a posição
  // centralizado na tela, normalmente. Segundo jeito, vem de um lugar
  // externo das construções 3D e alto ou simplesmente de longe (caso não
  // haja muitas construções 3D ainda) e do alto e, então, vai se
  // aproximando. Terceiro jeito: primeiro, dá 1/4 de volta de um lugar
  // externo e alto [...] depois 1/4 de volta se aproximando enquanto dá a
  // volta, ainda, até chegar ao patrimônio." Construído UMA VEZ aqui e
  // reaproveitado sem duplicar (item 2, botões equivalentes de
  // 'Mapa'->'Foto' — ver ambientephotos.js; e a busca 3D do item 6 — ver
  // flyCameraToArc logo abaixo, MESMO helper de pose/easing). MESMO padrão
  // arquitetural do Sobrevoo automático (_startSceneFlythrough/
  // _computeFlythroughPose) — só a pose RENDERIZADA muda (`_loop`), física
  // normal retoma ao final (`_finishFlyTo`). ----------

  /** Centro aproximado e "raio" do que já foi construído no mapa (objetos +
   *  paredes) — usado como referência de onde fica o "lugar externo e alto"
   *  dos modos 'decima'/'orbita'. Cai num raio genérico fixo quando o mapa
   *  ainda não tem quase nada construído — "simplesmente de longe (caso não
   *  haja muitas construções 3D ainda)", exatamente como pedido. */
  _computeBuildBoundsInfo() {
    const objs = this._map?.objects || [];
    const walls = this._map?.walls || [];
    const pts = [
      ...objs.map((o) => ({ x: o.x || 0, y: o.y || 0 })),
      ...walls.flatMap((w) => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]),
    ];
    if (!pts.length) return { cx: 0, cy: 0, raio: 15 };
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const raio = Math.max(6, ...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 4;
    return { cx, cy, raio };
  },

  /** Ponto de vantagem "externo, alto e de longe" pra chegar em `alvo`
   *  (x/y/z do mundo) — na direção que se afasta do centro do que já foi
   *  construído (pra enquadrar o conjunto/maior concentração, não só o
   *  alvo isolado), a uma distância/altura proporcionais ao tamanho do
   *  cenário (ou um valor genérico fixo, cenário praticamente vazio). */
  _computeVantagePoint(alvo) {
    const info = this._computeBuildBoundsInfo();
    let dx = alvo.x - info.cx, dz = alvo.z - info.cy;
    const dlen = Math.hypot(dx, dz);
    if (dlen < 1e-6) { dx = 0; dz = -1; } else { dx /= dlen; dz /= dlen; }
    const dist = Math.max(info.raio * 1.3, 14);
    const height = Math.max(info.raio * 0.95, 10);
    return {
      pos: { x: alvo.x + dx * dist, y: alvo.y + height, z: alvo.z + dz * dist },
      // Ângulo (mesma convenção de _computeFlythroughPose: pos = alvo +
      // dist*sin(yaw)/dist*cos(yaw)) usado como ponto de partida da órbita
      // do modo 'orbita'.
      yaw0: Math.atan2(dx, dz), dist, height,
    };
  },

  /** Helper de interpolação linear simples (usado junto de
   *  Cam3DMath.lerpAngle pros ângulos) — o resto do arquivo já assume
   *  smoothstep (`t*t*(3-2*t)`) como a curva de suavização padrão de
   *  transições de câmera (ver _camTransition/_computeFlythroughPose/
   *  _compassTurnTo acima), reaproveitada aqui pelo mesmo motivo (sem
   *  solavanco no início/fim do movimento). */
  _smoothstep(t) { return t * t * (3 - 2 * t); },

  /** Voo genérico até `(worldX, worldZ)` no plano do mapa 2D, altura
   *  `worldY` opcional (padrão = altura de visão de pessoa, EYE_HEIGHT) —
   *  ver cabeçalho da seção acima. `opts.mode`: 'direto' (corte instantâneo,
   *  visão centralizada normal) | 'decima' (vem de um vantage externo/alto/
   *  distante e se aproxima) | 'orbita' (1/4 de volta parado no vantage, +
   *  1/4 de volta se aproximando). `opts.onComplete` chamado ao terminar
   *  (ou imediatamente, no modo 'direto'). Cancela qualquer Sobrevoo
   *  automático/câmera assistida em andamento antes de começar — nunca dois
   *  "donos" da câmera renderizada ao mesmo tempo. */
  flyCameraTo(worldX, worldZ, worldY, opts = {}) {
    const mode = opts.mode || 'direto';
    const onComplete = opts.onComplete || null;
    const targetY = (typeof worldY === 'number' && !isNaN(worldY)) ? worldY : this.EYE_HEIGHT;
    const alvo = { x: worldX, y: targetY, z: worldZ };
    if (this._flythroughActive) this._cancelFlythrough();
    if (this._camMode) this._exitCameraView();
    if (window.Modeler3D?.isActive?.()) return; // sem sentido voar com o modelador aberto por cima
    if (mode === 'direto') {
      this._flyToActive = false;
      this._flyTo = null;
      this._camera.x = alvo.x; this._camera.y = alvo.y; this._camera.z = alvo.z;
      this._grounded = false; this._vel.y = 0; // deixa a física normal assentar no chão certo, se for o caso — mesmo tratamento de _finishFlythrough
      if (onComplete) onComplete();
      return;
    }
    const vantage = this._computeVantagePoint(alvo);
    const dirFinal = this._yawPitchToward(vantage.pos, alvo);
    this._flyTo = {
      mode, alvo, vantage, t0: performance.now(),
      T1: mode === 'orbita' ? 1700 : 3200, // 'orbita': 1º 1/4 de volta; 'decima': aproximação única
      T2: mode === 'orbita' ? 2600 : 0,    // 'orbita': 2º 1/4 de volta + aproximação
      yawInicial: dirFinal.yaw,
      onComplete,
    };
    this._flyToActive = true;
  },

  /** Item 6 do pedido (busca 3D): "a câmera do personagem sobe, vai em arco
   *  para o destino e pousa no destino" — trajetória PARABÓLICA (sobe e
   *  desce), diferente dos 3 modos de flyCameraTo acima (que vêm de um
   *  vantage point externo fixo) — aqui simplesmente parte de ONDE a câmera
   *  já está agora e arqueia até o alvo, olhando sempre em direção a ele. */
  flyCameraToArc(worldX, worldZ, worldY, opts = {}) {
    const onComplete = opts.onComplete || null;
    const targetY = (typeof worldY === 'number' && !isNaN(worldY)) ? worldY : this.EYE_HEIGHT;
    const alvo = { x: worldX, y: targetY, z: worldZ };
    if (this._flythroughActive) this._cancelFlythrough();
    if (this._camMode) this._exitCameraView();
    if (window.Modeler3D?.isActive?.()) return;
    const origem = { x: this._camera.x, y: this._camera.y, z: this._camera.z };
    const dist = Math.hypot(alvo.x - origem.x, alvo.z - origem.z);
    // Altura do "arco" proporcional à distância a percorrer (mínimo 3m, pra
    // "subir" ficar perceptível mesmo em destinos pertinho).
    const alturaArco = Math.max(3, dist * 0.35);
    this._flyTo = {
      mode: 'arco', alvo, origem, alturaArco,
      t0: performance.now(),
      T1: Math.min(6000, Math.max(1800, dist * 220)), // viagens longas duram mais, com teto
      T2: 0,
      onComplete,
    };
    this._flyToActive = true;
  },

  /** Pose atual do voo em andamento (`this._flyTo`) — ver `_loop`
   *  (`renderCam`). MESMA estrutura de `_computeFlythroughPose`: cada modo
   *  calcula sua própria posição/direção por fase, chamando `_finishFlyTo`
   *  sozinho quando a última fase termina. */
  _computeFlyToPose() {
    const f = this._flyTo;
    if (!f) return this._camera;
    const decorrido = performance.now() - f.t0;
    if (f.mode === 'decima') {
      const t = Math.min(1, decorrido / f.T1);
      const ease = this._smoothstep(t);
      const pos = {
        x: f.vantage.pos.x + (f.alvo.x - f.vantage.pos.x) * ease,
        y: f.vantage.pos.y + (f.alvo.y - f.vantage.pos.y) * ease,
        z: f.vantage.pos.z + (f.alvo.z - f.vantage.pos.z) * ease,
      };
      const dir = this._yawPitchToward(pos, f.alvo);
      const pose = { x: pos.x, y: pos.y, z: pos.z, yaw: dir.yaw, pitch: dir.pitch };
      if (t >= 1) { this._finishFlyTo(pose); return this._camera; }
      return pose;
    }
    if (f.mode === 'orbita') {
      let orbitYaw, orbitDist, orbitHeight;
      if (decorrido < f.T1) {
        // Fase 1: 1/4 de volta (90°) PARADO no vantage point — "primeiro, dá
        // 1/4 de volta de um lugar externo e alto (de modo que se possa ver
        // tudo já feito ou pelo menos a maior concentração na proximidade)".
        const t = this._smoothstep(Math.min(1, decorrido / f.T1));
        orbitYaw = f.yawInicial + t * (Math.PI / 2);
        orbitDist = f.vantage.dist;
        orbitHeight = f.vantage.height;
      } else {
        // Fase 2: mais 1/4 de volta (mais 90°, total 180°) SE APROXIMANDO ao
        // mesmo tempo — "depois 1/4 de volta se aproximando enquanto dá a
        // volta, ainda, até chegar ao patrimônio".
        const t = this._smoothstep(Math.min(1, (decorrido - f.T1) / f.T2));
        orbitYaw = f.yawInicial + Math.PI / 2 + t * (Math.PI / 2);
        orbitDist = f.vantage.dist * (1 - t);
        orbitHeight = f.vantage.height - (f.vantage.height - f.alvo.y) * t;
        if (t >= 1) {
          const pose = { x: f.alvo.x, y: f.alvo.y, z: f.alvo.z, yaw: f.yawInicial + Math.PI, pitch: 0 };
          this._finishFlyTo(pose);
          return this._camera;
        }
      }
      const pos = { x: f.alvo.x + orbitDist * Math.sin(orbitYaw), y: orbitHeight, z: f.alvo.z + orbitDist * Math.cos(orbitYaw) };
      const dir = this._yawPitchToward(pos, f.alvo);
      return { x: pos.x, y: pos.y, z: pos.z, yaw: dir.yaw, pitch: dir.pitch };
    }
    if (f.mode === 'arco') {
      // Trajetória parabólica simples: interpola x/z linear (com easing) e
      // soma uma "corcova" em y (sobe na 1ª metade, desce na 2ª — "sobe, vai
      // em arco para o destino e pousa no destino").
      //
      // BUG CORRIGIDO (04/09/2026), pedido verbatim (item 7): "o pouso deve
      // ficar na perspectiva da câmera do personagem (como se fosse sair
      // caminhando dali, daquele mesmo jeito). Não saltar de baixo (como um
      // mergulho) para a perspectiva normal, como é atualmente." Causa raiz
      // dupla:
      //   1) a "corcova" usava `Math.sin(t*Math.PI)` — essa curva chega a
      //      ZERO em t=1 (a altura extra some), mas a VELOCIDADE dela em
      //      t=1 não é zero (derivada de sin(πt) em t=1 é -π) — ou seja, a
      //      câmera ainda estava descendo bem rápido no ÚLTIMO quadro antes
      //      de "pousar", diferente do resto do trajeto x/z (que já usava
      //      `_smoothstep`, com velocidade zero nas pontas). Trocado por
      //      `sin(πt)²` — mesmo formato de corcova (zero em t=0 e t=1, pico
      //      em t=0.5), mas com derivada TAMBÉM zero nas duas pontas
      //      (sin(2πt) — zero em t=0 e t=1), pouso suave, sem "puxão" de
      //      última hora.
      //   2) mesmo com a corcova suave, `dir.pitch` (olhando pro alvo saído
      //      de `_yawPitchToward`) muda bruscamente quando a câmera está
      //      quase EM CIMA do alvo (qualquer resquício de altura vira um
      //      ângulo de mira acentuado pra baixo quando a distância
      //      horizontal já é pequena) — e o quadro final FORÇAVA
      //      `pitch:0` de um jeito abrupto, dando o "salto" de "mergulho"
      //      pra "perspectiva normal" reportado. Agora o pitch calculado é
      //      GRADUALMENTE puxado (fade, não um corte) pra 0 nos últimos 25%
      //      do voo (`pitchFade`, smoothstep também) — no quadro final ele
      //      já chega a 0 sozinho, por interpolação, exatamente "como se
      //      [o personagem] fosse sair caminhando dali, daquele mesmo
      //      jeito" (mesma pose padrão de 1ª pessoa que o resto do app usa
      //      ao assentar — EYE_HEIGHT/pitch 0 — nunca um pulo/corte).
      const t = Math.min(1, decorrido / f.T1);
      const ease = this._smoothstep(t);
      const pos = {
        x: f.origem.x + (f.alvo.x - f.origem.x) * ease,
        z: f.origem.z + (f.alvo.z - f.origem.z) * ease,
        y: f.origem.y + (f.alvo.y - f.origem.y) * ease + Math.pow(Math.sin(t * Math.PI), 2) * f.alturaArco,
      };
      const dir = this._yawPitchToward(pos, f.alvo);
      const pitchFade = 1 - this._smoothstep(Math.max(0, Math.min(1, (t - 0.75) / 0.25))); // 1 até t=0.75, desce suave até 0 em t=1
      const pose = { x: pos.x, y: pos.y, z: pos.z, yaw: dir.yaw, pitch: dir.pitch * pitchFade };
      if (t >= 1) { this._finishFlyTo({ x: f.alvo.x, y: f.alvo.y, z: f.alvo.z, yaw: dir.yaw, pitch: 0 }); return this._camera; }
      return pose;
    }
    return this._camera;
  },

  /** Termina o voo em andamento (chegou ou foi cancelado) — grava a pose
   *  final em `this._camera` de verdade e libera a física normal (mesmo
   *  tratamento de `_finishFlythrough`). Chama `onComplete`, se algum foi
   *  passado a flyCameraTo/flyCameraToArc. */
  _finishFlyTo(pose) {
    const p = pose || this._computeFlyToPose();
    this._camera.x = p.x; this._camera.y = p.y; this._camera.z = p.z;
    this._camera.yaw = p.yaw; this._camera.pitch = p.pitch || 0;
    const cb = this._flyTo?.onComplete;
    this._flyToActive = false;
    this._flyTo = null;
    this._grounded = false;
    this._vel.y = 0;
    if (cb) cb();
  },

  _updateFlyTo(delta) {
    const f = this._flyTo;
    if (!f) { this._flyToActive = false; return; }
    const decorrido = performance.now() - f.t0;
    const total = f.T1 + (f.T2 || 0);
    if (decorrido >= total) this._finishFlyTo();
  },
  /** NOVO (03/09/2026), pedido verbatim (item 6): "Deve haver um botão de
   *  busca no 3D, para buscar patrimônios, objetos ou coordenadas do mapa.
   *  Então, ao clicar em um botão para confirmar a viagem, a câmera do
   *  personagem sobe vai em arco para o destino e pousa no destino." MESMO
   *  padrão de modal/resultados do 2D (ver mapview.js
   *  _openMap2DSearch) — reaproveitado aqui em vez de duplicado onde dá
   *  (estrutura de linha/botão "Ir"), só a viagem final troca de
   *  `flyViewTo` (2D) pra `flyCameraToArc` (item 6, arco parabólico) em vez
   *  dos 3 modos de `flyCameraTo` (esses são só pros botões "Ver no mapa
   *  3D" dos itens 1/2 — pedido explícito do item 6 fala em "arco", um
   *  MODO À PARTE, não um dos três). */
  async _openView3DSearch() {
    if (!this._map) return;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <div style="text-align:center; font-weight:700; font-size:16px; margin:4px 0 10px">🔍 Buscar no mapa 3D</div>
        <input type="search" id="v3s-input" placeholder="Patrimônio, objeto, ou coordenada (ex.: 3,5)" autofocus style="width:100%; margin-bottom:8px">
        <div id="v3s-results" style="max-height:50vh; overflow-y:auto; display:flex; flex-direction:column; gap:6px"></div>
        <button class="btn block" id="v3s-close" style="margin-top:10px">Fechar</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#v3s-close').onclick = () => modal.remove();
    const input = modal.querySelector('#v3s-input');
    const resultsEl = modal.querySelector('#v3s-results');
    const renderRow = (label, sub, x, z) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; gap:8px; border:1px solid var(--border); border-radius:8px; padding:6px 8px';
      row.innerHTML = `<div style="flex:1"><div style="font-weight:600; font-size:13px">${Utils.escapeHtml(label)}</div><div style="font-size:11px; color:var(--text-dim)">${Utils.escapeHtml(sub)}</div></div><button class="btn secondary sm v3s-go">Ir ✈️</button>`;
      row.querySelector('.v3s-go').onclick = () => {
        modal.remove();
        this.flyCameraToArc(x, z, undefined);
      };
      resultsEl.appendChild(row);
    };
    const doSearch = async (q) => {
      resultsEl.innerHTML = '';
      const query = (q || '').trim();
      if (!query) return;
      const coordMatch = query.match(/^(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)$/);
      if (coordMatch) {
        const x = parseFloat(coordMatch[1].replace(',', '.'));
        const z = parseFloat(coordMatch[2].replace(',', '.'));
        renderRow(`📐 Coordenada (${x}, ${z})`, 'Ir direto para este ponto do mapa', x, z);
      }
      const ql = query.toLowerCase();
      (this._map.objects || []).forEach((o) => {
        const nome = o.tipo || 'Objeto';
        if (String(nome).toLowerCase().includes(ql)) renderRow(`🧊 ${nome}`, `x=${o.x.toFixed(1)} z=${o.y.toFixed(1)}`, o.x, o.y);
      });
      const items = await DB.getItemsByAmbiente(this._map.id);
      items.filter((it) => typeof it.mapaX === 'number' && !it.mapaAuto).forEach((it) => {
        const hay = `${it.patrimonio || ''} ${it.descricao || ''} ${it.tipo || ''}`.toLowerCase();
        if (hay.includes(ql)) renderRow(`📦 ${it.descricao || it.patrimonio || 'Patrimônio'}`, it.patrimonio || '', it.mapaX, it.mapaY);
      });
      if (!resultsEl.children.length) resultsEl.innerHTML = '<div style="color:var(--text-dim); font-size:13px; padding:6px">Nada encontrado.</div>';
    };
    input.addEventListener('input', Utils.debounce ? Utils.debounce(() => doSearch(input.value), 150) : () => doSearch(input.value));
    // NOVO (04/09/2026), pedido verbatim (item 6) — mesmo mecanismo de
    // mapview.js _openMap2DSearch (ver comentário grande lá): com
    // EXATAMENTE 1 resultado na lista, Enter equivale a clicar no "Ir ✈️"
    // daquela única linha.
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const rows = resultsEl.querySelectorAll('.v3s-go');
      if (rows.length === 1) { e.preventDefault(); rows[0].click(); }
    });
  },
  // ---------- fim NOVO (03/09/2026) flyCameraTo/flyCameraToArc ----------

  /** Rotina de movimentação padrão do player enquanto ele não está sendo
   *  controlado (assistindo por uma câmera fixa) — pedido do usuário: "dá
   *  para colocar uma rotina de movimentação padrão para o player, quando se
   *  está 'olhando' pelas câmeras fixas". Passeio simples: escolhe um ponto
   *  aleatório dentro dos limites do mapa (map.bounds) e anda até lá (com a
   *  MESMA colisão de parede/vão de porta aberta do andar controlado — ver
   *  _resolveCollision), escolhendo outro assim que chega perto; ao mover,
   *  gira pra encarar a direção do passeio (mesma convenção de yaw de
   *  cameraForwardFlat — ver engine3d.js Cam3DMath). */
  _updateAutopilot(delta) {
    const cam = this._camera;
    const b = this._map?.bounds;
    if (!this._autopilotTarget || Math.hypot(this._autopilotTarget.x - cam.x, this._autopilotTarget.z - cam.z) < 0.3) {
      if (b && b.maxX > b.minX && b.maxY > b.minY) {
        const margin = Math.min(0.6, (b.maxX - b.minX) / 2, (b.maxY - b.minY) / 2);
        this._autopilotTarget = {
          x: Utils.clamp(b.minX + Math.random() * (b.maxX - b.minX), b.minX + margin, b.maxX - margin),
          z: Utils.clamp(b.minY + Math.random() * (b.maxY - b.minY), b.minY + margin, b.maxY - margin),
        };
      } else {
        this._autopilotTarget = { x: cam.x, z: cam.z }; // mapa sem área conhecida ainda — fica parado no lugar
      }
    }
    const dx = this._autopilotTarget.x - cam.x, dz = this._autopilotTarget.z - cam.z;
    const dist = Math.hypot(dx, dz);
    this._playerWalking = dist > 0.05;
    if (this._playerWalking) {
      const AUTOPILOT_SPEED = 1.1; // mais devagar que o andar controlado (2.6 base) — é só um passeio de fundo
      const nx = cam.x + (dx / dist) * AUTOPILOT_SPEED * delta;
      const nz = cam.z + (dz / dist) * AUTOPILOT_SPEED * delta;
      const resolved = this._resolveCollision(nx, nz);
      cam.x = resolved.x; cam.z = resolved.z;
      // yaw que encara (dx,dz): inverso de cameraForwardFlat (ver
      // engine3d.js) — forward(yaw) = (-sin(yaw), cos(yaw)).
      cam.yaw = Math.atan2(-dx, dz);
    }
    this._playerWalkT = (this._playerWalkT || 0) + delta;
  },

  /** Busca `this._map.itens` (pinos de patrimônio) do zero em
   *  `DB.getItemsByAmbiente` — mesmo formato usado por mount()/_afterMapMutated
   *  (fatorado aqui pra não duplicar a cura de camada abaixo). Um patrimônio
   *  SEM `mapaLayerId` válido (nulo, ou apontando pra uma camada que já foi
   *  excluída) é migrado pra camada "de segurança" (Mapping.ensureSafeLayer
   *  — NÃO a primeira camada da lista, pedido do usuário: lá pode ter
   *  conteúdo de verdade dele, que não deve se misturar com o que está
   *  sendo recuperado) e gravado de VOLTA no banco — pedido do usuário
   *  (22/08/2026): "só pode haver itens na grade associados a alguma
   *  camada" — sem isso, um pino assim ficava sempre visível mesmo com
   *  TODAS as camadas desligadas (ver isLayerVisible, fail-safe pra
   *  elemento sem camada). Mesma lógica de mapview.js _refreshItensNoMapa
   *  (2D) — refeita aqui porque os pinos não vêm do `map` (são registros à
   *  parte, `DB.getItemsByAmbiente`). */
  async _buildItensNoMapa() {
    if (!this._map) return;
    const items = await DB.getItemsByAmbiente(this._map.id);
    // Mesmo `duplicado` do pino 2D (ver mapview.js _refreshItensNoMapa) —
    // pedido do usuário, 26/08/2026: "As flags devem aparecer no 3D
    // também". `it.color` (RGB 0-255, formato que engine3d.js já espera —
    // ver setScene "marcadores dos itens") tingido de roxo quando duplicado,
    // MESMA cor do anel/preenchimento roxo do pino 2D (`#c77dff`).
    const dupSet = await DB.getDuplicatePatrimonios();
    const curar = [];
    this._map.itens = items.filter((it) => typeof it.mapaX === 'number').map((it) => {
      const layerId = Mapping.resolveLayerId(this._map, it.mapaLayerId);
      if (layerId && layerId !== (it.mapaLayerId || null)) curar.push({ id: it.id, layerId });
      const duplicado = !!(it.patrimonio && dupSet.has(it.patrimonio.trim()));
      return {
        id: it.id, x: it.mapaX, y: it.mapaY, piso: it.mapaPiso || 0, label: it.patrimonio,
        // `mapaLayerId` — mesmo campo que o pino usa no 2D (ver mapview.js
        // _refreshItensNoMapa) — necessário pra _mapaComCamadasVisiveis
        // conseguir esconder/mostrar o item no 3D junto com sua camada.
        layerId,
        duplicado,
        color: duplicado ? [199, 125, 255] : undefined,
      };
    });
    for (const c of curar) await DB.updateItem(c.id, { mapaLayerId: c.layerId });
  },

  /** Persiste a mutação (mesmas funções do 2D — Mapping/DB.saveMap) e
   *  remonta a cena 3D a partir do `this._map` atualizado. `reloadItems`
   *  (só usado pela ferramenta Item) chama _buildItensNoMapa acima de novo
   *  — os pinos de item não vivem dentro de `this._map` de verdade (são
   *  `DB.getItemsByAmbiente`, ver mount()), então só `DB.saveMap` não basta
   *  pra fazer o item recém-posicionado aparecer na cena.
   *
   *  Bug relatado pelo usuário (24/08/2026): "demora para inserir um novo
   *  objeto na cena 3D. Os objetos devem ser inseridos imediatamente após o
   *  clique." Causa: `DB.saveMap` grava o mapa no cache em MEMÓRIA na hora
   *  (otimista), mas a Promise que ela devolve só resolve quando a gravação
   *  de VERDADE no IndexedDB acontece — e essa gravação é ADIADA de
   *  propósito por `DB.getMapSaveDebounceMs()` (configurável nas
   *  Configurações do app, 1s por padrão desde 25/08/2026 — era um fixo de
   *  3s antes disso; ver db.js `saveMap`/`_pendingMapSaves` — pensado pro
   *  editor 2D, que dispara uma mutação a cada arrasto/tecla, "senão
   *  martelava o disco toda hora").
   *  Este método fazia `await DB.saveMap(...)` ANTES de `_rebuildScene()` —
   *  ou seja, esperava até essa janela inteira de disco pra só DEPOIS desenhar o objeto na
   *  tela, mesmo a reconstrução da cena não dependendo nadinha desse disco
   *  (`_rebuildScene` lê direto de `this._map`, já mutado em memória por
   *  quem chamou ANTES desta função — nunca do cache/gravação do
   *  DB.saveMap). Corrigido NÃO esperando essa Promise: `_rebuildScene()`
   *  roda na hora, e a gravação de verdade no disco continua acontecendo
   *  sozinha em segundo plano (erros dela já são tratados/avisados dentro
   *  do próprio DB.saveMap/tx(), sem precisar de um catch aqui). Mesmo risco
   *  de sempre (não um risco NOVO desta correção) se o navegador fechar/
   *  cair no meio dessa janela de até 3s antes de gravar — o MESMO que já
   *  existe pra qualquer edição do mapa 2D, mitigado por `flushPendingMapSaves()`
   *  no evento `pagehide` (ver db.js). */
  async _afterMapMutated({ reloadItems = false } = {}) {
    if (reloadItems && this._map) await this._buildItensNoMapa();
    Mapping.recalcBounds(this._map);
    DB.saveMap(this._map);
    await this._rebuildScene();
  },

  /** Pedido do usuário (25/08/2026): "por algum motivo ao inserir um
   *  objeto no 3D, as coisas dão uma 'piscada'. É porque a lista de
   *  objetos que vão para o render foi atualizada? Essa piscada não deve
   *  ocorrer." Confirmado: `_afterMapMutated` (acima) reconstrói a cena 3D
   *  INTEIRA (`_rebuildScene` → `Engine3D.setScene`, que descarta e recria
   *  TODAS as paredes/portas/janelas/câmeras/objetos) mesmo quando só UM
   *  objeto novo foi colocado — caro o bastante (geometria + 1ª compilação
   *  de shader de cada material recriado) pra ocasionalmente perder um
   *  quadro bem na hora da troca, visto como a cena inteira "piscando".
   *
   *  Caminho ALTERNATIVO usado só pela ferramenta "📦 Objeto" (o caso
   *  relatado, ver as duas chamadas em `_placeWithBuildTool`): tenta
   *  `Engine3D.addObjectIncremental` (ver comentário grande lá — adiciona
   *  só a malha do objeto novo em cima da cena já existente, sem descartar
   *  nada) e só cai pro caminho de sempre (reconstrução completa) se o
   *  motor não conseguir (cena ainda não montada — 1ª vez que o 3D abre,
   *  ver `_pendingScene`/`_ready` em engine3d.js). Parede/porta/janela
   *  continuam SEMPRE por `_afterMapMutated` — essas podem afetar a junção
   *  de cantos de outras paredes ou a posição de portas/janelas presas,
   *  então precisam da reconstrução completa pra ficar tudo coerente. */
  async _afterObjectAddedIncremental(obj) {
    Mapping.recalcBounds(this._map);
    DB.saveMap(this._map);
    const addedIncremental = this._engine?.addObjectIncremental?.(obj);
    if (!addedIncremental) await this._rebuildScene();
  },

  /** "Recolhedor" de itens no 3D, estilo Minecraft (pedido do usuário: "como
   *  no Minecraft, deve ter algum recolhedor de itens (removê-los da cena)
   *  no 3D... deve haver alguma animação"). Ferramenta 🗑️ Remover da hotbar
   *  — mira em algo (mesma detecção da mira normal, `Engine3D.hoverPick`,
   *  que já cobre item/câmera/objeto/parede/porta/janela — ver
   *  engine3d.js) e o clique remove, sempre com uma animação (nunca
   *  silenciosamente, ver Engine3D.spawnCollectEffect/spawnDemolishEffect).
   *  Item/câmera/objeto ("pequenos", pedido do usuário) ganham a animação
   *  de caixa-recolhedora — entram na caixa, ela fecha e esmaece, mesmo
   *  estilo visual da roleta da hotbar. Parede/porta/janela ("outros itens
   *  grandes", pedido explícito de um jeito DIFERENTE e "criativo") se
   *  despedaçam em cacos que voam e caem, como uma pequena demolição —
   *  "não cabem numa caixinha". */
  async _removeWithTool() {
    if (!this._map || !this._engine) return;
    const hit = this._engine.hoverPick(this._camera);
    if (!hit || hit.type === 'floor') {
      Utils.toast('Mire em algo pra remover (item, câmera, objeto, parede, porta ou janela).', { type: 'warn' });
      return;
    }
    // A partir da rodada 52 a exclusão em si (animação + Mapping.remove*/
    // DB.updateItem) mora em `_confirmDeleteHit` — reaproveitada tal e qual
    // aqui (ferramenta 🗑️ Remover, que sempre excluiu na hora, sem pedir
    // confirmação) e pelo popup novo do DEL/Backspace (`_openDeleteConfirmPopup`
    // abaixo), que pede confirmação ANTES de chegar a este mesmo código.
    await this._confirmDeleteHit(hit);
  },

  /** Popup de confirmação de exclusão no 3D, estilo Blender (pedido do
   *  usuário, rodada 52, com screenshot do Blender em anexo: "Ao pressionar
   *  DEL no 3D, deve aparecer uma janelinha, como no Blender, com um botão
   *  para deletar o objeto"). MESMA mira de _removeWithTool logo acima
   *  (Engine3D.hoverPick — cobre item/câmera/objeto/parede/porta/janela),
   *  mas em vez de excluir na hora (como a ferramenta 🗑️ Remover da hotbar
   *  já faz, com animação), a tecla DEL/Backspace primeiro pede confirmação
   *  — igual o Blender faz (tecla X, Delete de novo ou Enter confirmam;
   *  Esc ou clicar fora cancela). `document.exitPointerLock` — mesmo padrão
   *  de qualquer outro cartão aberto aqui (ver _showObjectCard3D/
   *  _showCameraCard3D acima) — devolve o cursor pra dar pra clicar no
   *  botão; volta a andar sozinho ao clicar de novo no canvas, como
   *  qualquer outro cartão. */
  _openDeleteConfirmPopup() {
    if (!this._map || !this._engine) return;
    if (this._container.querySelector('.v3d-del-confirm')) return; // já tem um aberto — não empilha outro
    const hit = this._engine.hoverPick(this._camera);
    if (!hit || hit.type === 'floor') {
      Utils.toast('Mire em algo pra excluir (item, câmera, objeto, parede, porta ou janela).', { type: 'warn' });
      return;
    }
    document.exitPointerLock?.();
    const nomes = { object: 'objeto', camera: 'câmera', item: 'item', wall: 'parede', porta: 'porta', janela: 'janela' };
    const el = document.createElement('div');
    el.className = 'v3d-del-confirm';
    el.innerHTML = `
      <div class="v3d-del-confirm-title">❓ OK?</div>
      <button type="button" class="v3d-del-confirm-row" id="v3d-del-confirm-btn" title="Confirmar exclusão (também: tecla X, Delete de novo ou Enter)">
        <span>Excluir ${Utils.escapeHtml(nomes[hit.type] || hit.type)}</span><span class="v3d-del-confirm-key">X</span>
      </button>
    `;
    this._container.appendChild(el);
    const fechar = () => {
      el.remove();
      window.removeEventListener('keydown', onPopupKey, true);
      document.removeEventListener('click', onClickOutside, true);
    };
    const confirmar = async () => { fechar(); await this._confirmDeleteHit(hit); };
    el.querySelector('#v3d-del-confirm-btn').onclick = confirmar;
    // Fecha ao clicar fora da janelinha — só a partir do PRÓXIMO clique
    // (setTimeout 0), senão o mesmo clique que abriu o popup (se a tecla
    // DEL foi disparada por algum handler de clique, o que hoje não
    // acontece, mas por segurança) já o fecharia de novo no mesmo instante.
    let onClickOutside = () => {};
    setTimeout(() => {
      onClickOutside = (e) => { if (!el.contains(e.target)) fechar(); };
      document.addEventListener('click', onClickOutside, true);
    }, 0);
    const onPopupKey = (e) => {
      if (e.code === 'KeyX' || e.code === 'Delete' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmar(); }
      else if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
    };
    window.addEventListener('keydown', onPopupKey, true);
  },

  /** Efetiva a exclusão confirmada (pelo popup do DEL acima, ou direto pela
   *  ferramenta 🗑️ Remover da hotbar, que nunca pediu confirmação) — MESMA
   *  animação de sempre (spawnCollectEffect pros "pequenos" — item/câmera/
   *  objeto —, spawnDemolishEffect pros "grandes" — parede/porta/janela) e
   *  MESMA remoção de dados (Mapping.removeObject/removeCamera/removeWall/
   *  removeDoor/removeWindow, DB.updateItem pra soltar patrimônio do mapa
   *  sem excluir o item do catálogo). */
  async _confirmDeleteHit(hit) {
    if (!this._map || !this._engine) return;
    const pos = hit.center || hit.pos;
    const half = hit.obb?.half || { x: 0.4, y: 0.4, z: 0.4 };
    if (hit.type === 'object' || hit.type === 'camera' || hit.type === 'item') {
      const cor = hit.type === 'object' ? (hit.ref?.cor || '#8a92a3') : hit.type === 'camera' ? '#33383f' : '#4f8cff';
      this._engine.spawnCollectEffect(pos, cor, Math.max(half.x, half.y, half.z) * 2);
      if (hit.type === 'object') Mapping.removeObject(this._map, hit.ref.id);
      else if (hit.type === 'camera') Mapping.removeCamera(this._map, hit.ref.id);
      else if (hit.type === 'item') await DB.updateItem(hit.ref.id, { mapaX: null, mapaY: null, mapaPiso: 0 }); // solta o patrimônio do mapa, mesma ação de "Remover do mapa" — não exclui o item do catálogo
      Utils.toast('Removido 🗑️', { type: 'ok', duration: 1400 });
      await this._afterMapMutated({ reloadItems: hit.type === 'item' });
      return;
    }
    // Parede/porta/janela — não são "recolhidas numa caixinha" (pedido do
    // usuário: "outro jeito, seja criativo") — se despedaçam em cacos.
    const cor = hit.type === 'wall' ? '#cfc9bd' : hit.type === 'porta' ? '#8a5a34' : '#bfe3ff';
    this._engine.spawnDemolishEffect(pos, { x: half.x * 2, y: half.y * 2, z: half.z * 2 }, cor);
    if (hit.type === 'wall') Mapping.removeWall(this._map, hit.ref.id);
    else if (hit.type === 'porta') Mapping.removeDoor(this._map, hit.ref.id);
    else if (hit.type === 'janela') Mapping.removeWindow(this._map, hit.ref.id);
    Utils.toast('Removido 🗑️', { type: 'ok', duration: 1400 });
    await this._afterMapMutated();
  },

  /** "📍 Adicionar orb" (ferramenta da hotbar 3D, pedido do usuário
   *  26/08/2026): "Assim como há nas 'Fotos' o botão 'Adicionar orb', coloque
   *  também no 3D... Com ele selecionado e ao mirar um objeto, abre-se a
   *  mesma janela de busca de patrimônio para poder adicionar ao objeto. Por
   *  consequência, haverá um 'Item associado' ao objeto com o seu
   *  'Patrimônio'." MESMA mira/raycast de _removeWithTool logo acima
   *  (Engine3D.hoverPick — o alvo mais próximo sob a mira central), restrita
   *  a `hit.type === 'object'` — mesmo escopo do botão "🔗 Associar a um
   *  item" do painel do objeto no editor 2D (mapview.js `#obj-item-associar`,
   *  ver o comentário lá: só objetos têm essa associação, não paredes/
   *  portas/janelas/câmeras). `Utils.pickItem` é a MESMA janela de busca de
   *  patrimônio usada ali E em ambientephotos.js ("Adicionar orb" das
   *  Fotos) — reaproveitada tal e qual, sem nenhuma cópia. Sem roleta
   *  própria (ver comentário em _HOTBAR_SLOTS) — a escolha do patrimônio
   *  acontece dentro da própria janela de busca. */
  async _addOrbWithTool() {
    if (!this._map || !this._engine) return;
    const hit = this._engine.hoverPick(this._camera);
    if (!hit || hit.type !== 'object') {
      Utils.toast('Mire num objeto pra associar um patrimônio a ele.', { type: 'warn' });
      return;
    }
    const obj = hit.ref;
    // Sai do pointer lock ANTES de abrir a janela de busca — mesmo padrão de
    // qualquer outro modal aberto de dentro do 3D (ver _showFlashcard3D/
    // _showObjectCard3D/_showCameraCard3D acima), senão o teclado/mouse do
    // modal ficaria capturado pelo canvas em vez de navegar a busca.
    document.exitPointerLock?.();
    const jaTinha = obj.itemIds && obj.itemIds.length;
    const itemId = await Utils.pickItem({ ambienteId: this._map.id, title: jaTinha ? 'Associar outro patrimônio a este objeto' : 'Associar item a este objeto' });
    if (!itemId) return;
    // Pedido do usuário (27/08/2026): guarda uma CÓPIA do número do
    // patrimônio junto da associação (ver Mapping.addItemToObject) — pra
    // sobreviver caso este item seja excluído do catálogo depois (ver
    // _showOrphanPatrimonioCard3D mais abaixo).
    const itemEscolhido = await DB.getItem(itemId);
    // `Mapping.addItemToObject` ADICIONA à lista `obj.itemIds` (não substitui
    // mais — pedido do usuário 26/08/2026: um objeto pode ter mais de um
    // patrimônio associado, e o MESMO patrimônio pode estar em mais de um
    // objeto do mapa, virando uma "duplicação" com ordem 1ª/2ª/...). Mesma
    // regra usada pelo painel do editor 2D, ver mapview.js
    // `#obj-item-associar`/Mapping.addItemToObject.
    const adicionou = Mapping.addItemToObject(this._map, obj.id, itemId, itemEscolhido?.patrimonio);
    if (!adicionou) {
      Utils.toast('Este patrimônio já está associado a este objeto.', { type: 'warn' });
      return;
    }
    // _afterMapMutated já salva o mapa (DB.saveMap) e reconstrói a cena
    // (_rebuildScene) — precisa da reconstrução completa aqui (não dá pra
    // usar o caminho incremental de addObjectIncremental, que é só pra
    // OBJETO NOVO): este objeto já existe na cena, sua malha antiga (sem o
    // destaque azul de "item associado", ver engine3d.js
    // _addItemAssociadoDestaque) precisa ser substituída pela nova.
    await this._afterMapMutated();
    // Detecta duplicação (mesmo patrimônio associado a mais de um objeto do
    // mapa) e avisa em qual posição (1ª/2ª/...) esta associação ficou —
    // mesmo aviso do painel 2D, ver mapview.js `#obj-item-associar`.
    const ocorrencias = Mapping.computeItemAssocIndex(this._map).get(itemId) || [];
    if (ocorrencias.length > 1) {
      const ordinal = ocorrencias.findIndex((o) => o.objId === obj.id) + 1;
      Utils.toast(`🔁 Este patrimônio já estava associado a outro objeto — esta é a ${ordinal}ª associação dele no mapa.`, { type: 'warn', duration: 4000 });
    } else {
      Utils.toast('Item associado ✓', { type: 'ok', duration: 1600 });
    }
    // Recalcula o HUD "estilo jogo" (total/associados/faltam) — acabou de
    // mudar quantos patrimônios já têm objeto associado.
    this._refreshOrbHud();
  },

  /** Atualiza o HUD "estilo jogo" da ferramenta "📍 Adicionar orb" (pedido do
   *  usuário, 26/08/2026): "deve aparecer... a quantidade total de
   *  patrimônios já cadastrados... que faltam associar a um objeto no
   *  mapa... já associados a um objeto no mapa. A visão deve ser como um
   *  jogo o qual o objetivo é associar todos os patrimônios que ainda não
   *  foram associados." Só fica visível com a ferramenta 📍 ativa (esconde
   *  de novo ao trocar de ferramenta — ver _selectBuildTool). Usa
   *  `DB.getAllSummaries()` (leve — sem fotoDataUrl/avatarDataUrl completos,
   *  mesmo motivo de getDuplicatePatrimonios em db.js) em vez de
   *  `getAllItems()`, já que só o `id` de cada item importa aqui, não os
   *  campos pesados. "Associados" conta só ids que REALMENTE existem no
   *  catálogo agora — um `obj.itemId` órfão (item excluído depois de
   *  associado) não conta nem como associado nem some do total, só é
   *  ignorado, igual ao "(item removido)" já tratado no painel 2D. */
  async _refreshOrbHud() {
    const hud = this._container?.querySelector('#v3d-orb-hud');
    if (!hud) return;
    if (this._buildTool !== 'orb') { hud.classList.add('hidden'); return; }
    const allItems = (typeof DB !== 'undefined') ? await DB.getAllSummaries() : [];
    const total = allItems.length;
    const validIds = new Set(allItems.map((i) => i.id));
    const assocIds = new Set(
      (this._map?.objects || [])
        .flatMap((o) => (o.itemIds || []).map((e) => e && e.id))
        .filter((id) => id && validIds.has(id)),
    );
    const associados = assocIds.size;
    const faltam = Math.max(0, total - associados);
    hud.classList.remove('hidden');
    const $ = (sel) => hud.querySelector(sel);
    $('#v3d-orb-hud-total').textContent = total;
    $('#v3d-orb-hud-assoc').textContent = associados;
    $('#v3d-orb-hud-falta').textContent = faltam;
    $('#v3d-orb-hud-fill').style.width = `${total > 0 ? Math.round((associados / total) * 100) : 100}%`;
    $('#v3d-orb-hud-win').classList.toggle('hidden', !(total > 0 && faltam === 0));
  },

  /** Ghost/prévia da ferramenta de construção ativa, seguindo o cursor a
   *  cada quadro — pedido do usuário: "o objeto deve ser ido posicionando
   *  conforme o cursor do mouse e só se fixa quando clicar" (mesma ideia dos
   *  ghosts do editor 2D: mostrar exatamente onde/como vai ficar ANTES do
   *  clique). Chamado a cada quadro renderizado (ver _loop). Simplificação
   *  aceita: o ghost de objeto é uma caixa delimitadora do tamanho certo
   *  (não a malha exata — ex.: a mesa não mostra as 4 pernas no ghost, só a
   *  caixa inteira), pra não precisar duplicar toda lógica de malha real
   *  aqui; a peça de verdade (já com a malha certa) só nasce ao clicar. */
  _updateBuildGhost() {
    const eng = this._engine;
    if (!eng?._ready) return;
    eng.hideAllGhosts?.();
    // Raio X (tecla X — ver onKeyDown/_xrayActive/Engine3D.setXRayTarget)
    // começa DESLIGADO a cada quadro — só o ramo 'objeto' abaixo (o único
    // que pousa em cima de outro objeto) volta a ligar quando de fato se
    // aplica. Feito aqui em cima, ANTES de qualquer `return` antecipado
    // desta função (trocar de ferramenta, sair do modo de construção, mirar
    // o vazio etc.), pra cobrir todo caminho de saída de uma vez só, sem
    // precisar repetir a limpeza em cada um.
    eng.setXRayTarget?.(null);
    if (!this._buildTool) return;
    const ray = eng.centerRay(this._camera);
    if (this._buildTool === 'parede') {
      // MESMO critério de _placeWithBuildTool: só testa parede primeiro no
      // 1º ponto de uma cadeia nova (pedido do usuário: "ao apontar para
      // uma parede, deve ser possível ligar uma parede a partir dali") —
      // o ghost já aparece encostado na parede mirada, na cor azul-clara
      // de sempre (showGhostWall usa o MESMO material de porta/janela).
      let rawX, rawZ;
      const wallHit = eng.raycastWall(ray.origin, ray.dir);
      const mirandoParede = !this._wallChainStart && wallHit && wallHit.distance < 6;
      if (mirandoParede) { rawX = wallHit.point.x; rawZ = wallHit.point.z; }
      else {
        const hit = eng.raycastFloor(ray.origin, ray.dir);
        if (!hit) return;
        rawX = hit.x; rawZ = hit.z;
      }
      const resolved = this._resolveWallSnap(rawX, rawZ, this._wallChainStart);
      eng.showGhostWall?.(resolved.x, resolved.z, this._wallChainStart);
      // "Cursor Fantasma com Efeito Mola" + guias inteligentes (pedido do
      // usuário) — ver Engine3D.showWallSpringGhost/showSmartGuides.
      eng.showWallSpringGhost?.(rawX, rawZ, resolved.x, resolved.z);
      eng.showSmartGuides?.(resolved.guides);
      // "Ghost de seccionamento" (pedido do usuário: "ao apontar para uma
      // parede, deve aparecer um retângulo de baixo até a parte de cima da
      // parede... que se fosse clicado ali, ali seria inserida uma nova
      // parede ligada a aquela já inserida") — só faz sentido mirando uma
      // parede de verdade (não o chão), e é exatamente o mesmo caso em que
      // _placeWithBuildTool acima faria Mapping.splitWallAt nesse ponto ao
      // clicar (ver _findWallContainingPoint/"Conversão Automática de
      // Quinas"). Escondido nos outros casos por eng.hideAllGhosts() já
      // chamado no topo desta função.
      if (mirandoParede) {
        const w = wallHit.wall;
        eng.showGhostWallSection?.(resolved.x, resolved.z, w.x2 - w.x1, w.y2 - w.y1);
      }
      return;
    }
    if (this._buildTool === 'objeto') {
      const entry = this._objectCatalog[this._objectIndex];
      if (!entry) return;
      // Giro Livre ativo (tecla R — ver onKeyDown/_captureFreeRotatePivot):
      // posição CONGELADA no pivô capturado ao ativar — nem repete os
      // raycasts de posição/parede (não precisam mais rodar, a peça não sai
      // mais do lugar até desativar). Só o ÂNGULO segue variando, calculado
      // a cada quadro como a direção do pivô até onde a mira agora encosta
      // no chão (pedido do usuário: "traço pontilhado no chão, entre o
      // ponto de eixo de giro e o ponto da intersecção... do raytracing e o
      // chão" — reaproveita showSmartGuides, o MESMO recurso já usado pelas
      // guias de encaixe de parede da ferramenta 🧱, nunca ativos ao mesmo
      // tempo por serem ferramentas diferentes).
      if (this._buildFreeRotate && this._buildFreeRotatePivot) {
        const piv = this._buildFreeRotatePivot;
        const elevacao = piv.baseY + (entry.key === 'luminaria' ? 3.0 : 0);
        // Pedido do usuário, 25/08/2026: "Se o objeto está com o ghost em
        // cima de outro objeto e pressionar R, então, o tracejado tem como
        // ponto de referência o centro de rotação em cima desse objeto" —
        // raycast contra o plano NA ALTURA do pivô (`piv.baseY`), não
        // sempre y=0 (raycastFloor) — quando o objeto está em cima de uma
        // mesa, o "chão" da rotação livre é o TAMPO da mesa, não o chão de
        // verdade lá embaixo (ver Engine3D.raycastPlaneY).
        const floorHit = eng.raycastPlaneY(ray.origin, ray.dir, piv.baseY);
        // Mira quase EM CIMA do pivô: atan2(~0,~0) giraria de forma instável
        // e "nervosa" — mantém o último ângulo válido em vez de recalcular
        // com um vetor perto de zero.
        let dist = 0;
        if (floorHit) {
          dist = Math.hypot(floorHit.x - piv.x, floorHit.z - piv.z);
          if (dist > 0.05) this._buildLastFreeAngle = Math.atan2(floorHit.z - piv.z, floorHit.x - piv.x);
        }
        // SHIFT durante o Giro Livre: destrava a rotação contínua e trava
        // em ângulos fixos de 15° em 15° (pedido do usuário, 25/08/2026:
        // "Quando pressionar R para rotacionar livremente, segurar o
        // SHIFT, faz travar em ângulos fixos de 15 graus em 15 graus").
        const anguloBruto = this._buildLastFreeAngle ?? this._camera.yaw;
        const anguloTravado = this._keys.ShiftLeft || this._keys.ShiftRight;
        const angulo = anguloTravado ? Math.round(anguloBruto / this._FREE_ROTATE_SHIFT_STEP) * this._FREE_ROTATE_SHIFT_STEP : anguloBruto;
        // Guardado À PARTE de `_buildLastFreeAngle` (que continua sendo só a
        // direção CRUA da mira, usada acima pra evitar instabilidade perto
        // do pivô) — `_placeWithBuildTool` usa ESTE campo (já com o travamento
        // de 15° do Shift aplicado, se for o caso) pra inserir exatamente o
        // que o ghost está mostrando neste quadro.
        this._buildFreeRotateFinalAngle = angulo;
        eng.showGhostObject?.(piv.x, piv.z, angulo, entry.key, elevacao);
        // Traço pontilhado do pivô até o ponto mirado — com Shift travado,
        // o traço acompanha o ÂNGULO TRAVADO (mesmo raio/distância da mira
        // de verdade), pra mostrar visualmente que travou, não a mira crua.
        if (floorHit) {
          const px = anguloTravado ? piv.x + Math.cos(angulo) * dist : floorHit.x;
          const pz = anguloTravado ? piv.z + Math.sin(angulo) * dist : floorHit.z;
          eng.showSmartGuides?.([{ x1: piv.x, z1: piv.z, x2: px, z2: pz, y: piv.baseY + 0.03 }]);
        }
        // "Transferidor" de 45° em 45° também durante o Giro Livre (pedido
        // do usuário: "quando o R é pressionado, deve ter traços
        // pontilhados de 45 graus em relação ao centro de rotação do
        // objeto para servir como guia visual"). Pedido do usuário,
        // 25/08/2026 (refinamento sobre a versão anterior, que acompanhava
        // a elevação do pivô — `piv.baseY`/`elevacao` — e girava travado no
        // ângulo de referência capturado ao apertar R): "aquele
        // transferidor de 45 graus deve ficar sempre alinhado para o
        // 'norte'. E ficar fixo no nível do chão" — agora SEMPRE no chão e
        // SEMPRE norte, independente da altura do pivô ou de qualquer
        // ângulo de referência (ver showRotationProtractor, engine3d.js).
        // "🐞 Debug" (pedido do usuário, 25/08/2026): opcional, ver
        // _isDebugTransferidorAtivo/mapconfig.js DEFAULTS.
        if (this._isDebugTransferidorAtivo()) eng.showRotationProtractor?.(piv.x, piv.z);
        // Sombra/footprint pontilhada + Raio X (pedido do usuário,
        // 25/08/2026 — ver showGhostFootprintShadow/setXRayTarget) também
        // durante o Giro Livre, MESMO critério do Modo Padrão logo abaixo:
        // só quando o pivô está de fato pousado em cima de outro objeto
        // (`piv.baseY > 0`), nunca no chão de verdade nem travado numa
        // parede (esses dois casos sempre têm `piv.baseY === 0`). Também
        // opcional (ver _isDebugProlongamentoAtivo acima).
        if (piv.baseY > 1e-4 && this._isDebugProlongamentoAtivo()) {
          eng.showGhostFootprintShadow?.(piv.x, piv.z, angulo, entry.key, piv.baseY);
          eng.setXRayTarget?.(this._xrayActive ? piv.restingOnId : null);
        } else {
          eng.hideGhostFootprintShadow?.();
        }
        return;
      }
      // MESMO raycast usado pra colocar de verdade (ver _placeWithBuildTool)
      // — o ghost precisa "pousar" no tampo da mesa/no chão igual a peça
      // final vai fazer, senão mostraria uma prévia mentirosa.
      const hit = eng.raycastSurface(ray.origin, ray.dir);
      // Raycast de verdade contra a malha das paredes — MESMO critério de
      // _placeWithBuildTool (ver comentário lá): "é raytracing. A primeira
      // parede que o raio bater... pode apontar pro meio ou a parte de cima
      // da parede" que o ghost já precisa refletir, senão mostraria uma
      // prévia diferente do que vai ser colocado de verdade ao clicar.
      const wallHit = eng.raycastWall(ray.origin, ray.dir);
      // Colisão lateral contra objeto/porta/janela — MESMO critério de
      // _placeWithBuildTool (ver comentário grande lá, rodada 50): só com
      // "Considerar colisão" ativo; o ghost precisa refletir exatamente
      // onde a peça vai encostar de verdade ao clicar.
      const lateralHit = !this._paredeConfig?.ignorarFisica ? eng.raycastLateral?.(ray.origin, ray.dir) : null;
      const useLateral = !!lateralHit && (!hit || lateralHit.t < hit.t) && (!wallHit || lateralHit.t < wallHit.distance);
      const useWall = !useLateral && !!wallHit && (!hit || wallHit.distance < hit.t);
      if (hit || useWall || useLateral) {
        let baseX, baseZ, baseY;
        if (useLateral) {
          const { w, d } = eng.objectFootprint?.(entry.key) || {};
          const meia = Math.max(w || 0.4, d || 0.4) / 2;
          const nx = lateralHit.normal.x, nz = lateralHit.normal.z;
          const nlen = Math.hypot(nx, nz) || 1;
          baseX = lateralHit.x + (nx / nlen) * meia;
          baseZ = lateralHit.z + (nz / nlen) * meia;
          baseY = 0;
        } else if (useWall) {
          baseX = wallHit.point.x; baseZ = wallHit.point.z; baseY = 0;
        } else {
          baseX = hit.x; baseZ = hit.z; baseY = hit.y;
        }
        // Snap magnético de grade (ver _isObjectGridSnapActiveNow/
        // _applyObjectGridSnap) — MESMO critério do posicionamento de
        // verdade (ver _placeWithBuildTool acima): só no caso "livre".
        if (!useWall && !useLateral) { const sn = this._applyObjectGridSnap(baseX, baseZ); baseX = sn.x; baseZ = sn.z; }
        const elevacao = baseY + (entry.key === 'luminaria' ? 3.0 : 0);
        // "Ignorar física" (pedido do usuário, 25/08/2026, refinado duas
        // vezes no mesmo dia): só testa/trava na parede quando o objeto vai
        // pousar NO CHÃO (baseY === 0) e numa altura que ainda cruza a
        // parede (abaixo do topo dela, WALL_H) — pousar EM CIMA de outro
        // objeto (hit.y > 0, mesa sobre mesa etc.) é sempre permitido, não
        // passa por aqui (pedido explícito do usuário), e a luminária (bem
        // acima do topo da parede) também não faz sentido testar. Perto de
        // uma parede, o GIRO do ghost vem TRAVADO dela (ver
        // _resolveObjectWallSnap), não mais o yaw da câmera — daí `angulo`
        // só é decidido depois de resolver. Sem posição válida: some o
        // ghost (não desenha nada) em vez de mostrar uma prévia que não
        // pode ser colocada ali.
        // "Alinhamento cardinal" (ver comentário grande equivalente em
        // _placeWithBuildTool, ramo 'objeto') — o ghost precisa mostrar
        // exatamente a mesma base de ângulo que vai ser inserida de
        // verdade ao clicar, senão a peça "pularia" de ângulo na hora de
        // confirmar.
        let gx = baseX, gz = baseZ, gAngulo = this._resolveFreeAlignmentAngle(this._camera.yaw), blocked = false, locked = false;
        if (baseY <= 1e-4 && elevacao < 2.6) { // 2.6 = altura da parede (ver engine3d.js/view3d.js, hardcoded nos dois)
          const { w, d } = eng.objectFootprint?.(entry.key) || {};
          // BUG corrigido (pedido do usuário, 25/08/2026: "o botão direito do
          // mouse não está girando o ghost dos objetos") — MESMO bug/mesma
          // correção do call site equivalente em _placeWithBuildTool (ver
          // comentário grande lá): passar `gAngulo` (já com o giro manual/
          // cardinal aplicado) em vez de `this._camera.yaw` puro, senão o
          // ghost some com o giro toda vez que o objeto não está travado
          // numa parede — a situação mais comum.
          const resolved = this._resolveObjectWallSnap(baseX, baseZ, w, d, gAngulo, useWall ? wallHit.wall : null);
          gx = resolved.x; gz = resolved.z; gAngulo = resolved.angulo; blocked = resolved.blocked; locked = resolved.locked;
        }
        if (!blocked) {
          eng.showGhostObject?.(gx, gz, gAngulo, entry.key, elevacao);
          // Transferidor de 8 divisões (pedido do usuário — ver
          // engine3d.js showRotationProtractor): só mostrado quando o giro
          // manual de fato SE APLICA — travado numa parede, `_buildManualRot`
          // não conta pra nada, mostrar o transferidor ali confundiria mais
          // do que ajudaria. Sempre no chão e sempre alinhado pro norte
          // (pedido do usuário, 25/08/2026) — não mais na altura/ângulo do
          // objeto (`elevacao`/yaw da câmera não entram mais aqui).
          // "🐞 Debug" (pedido do usuário, 25/08/2026): opcional, ver
          // _isDebugTransferidorAtivo/mapconfig.js DEFAULTS.
          if (!locked && this._isDebugTransferidorAtivo()) eng.showRotationProtractor?.(gx, gz);
          // Sombra/footprint pontilhada + Raio X (pedido do usuário,
          // 25/08/2026 — ver engine3d.js showGhostFootprintShadow/
          // setXRayTarget): só quando o ghost está REALMENTE pousado em
          // cima de outro objeto — não mirando uma parede (`useWall`) nem
          // no chão de verdade (`baseY` bem próximo de 0). `hit.restingOnId`
          // (ver Engine3D.raycastSurface) é o id do objeto embaixo. Também
          // opcional (ver _isDebugProlongamentoAtivo acima).
          if (!useWall && baseY > 1e-4 && this._isDebugProlongamentoAtivo()) {
            eng.showGhostFootprintShadow?.(gx, gz, gAngulo, entry.key, baseY);
            eng.setXRayTarget?.(this._xrayActive ? hit.restingOnId : null);
          } else {
            eng.hideGhostFootprintShadow?.();
          }
        }
      }
      return;
    }
    if (this._buildTool === 'item') {
      const hit = eng.raycastFloor(ray.origin, ray.dir);
      if (hit) eng.showGhostItem?.(hit.x, hit.z);
      return;
    }
    if (this._buildTool === 'porta' || this._buildTool === 'janela') {
      // Giro Livre ativo — MESMO espírito do ramo 'objeto' acima: posição (e
      // parede-alvo, se encaixada) CONGELADAS no pivô capturado ao apertar R
      // (ver onKeyDown/_captureFreeRotatePivot), só o ÂNGULO segue a mira,
      // com o mesmo traço pontilhado (showSmartGuides) do pivô até o chão.
      if (this._buildFreeRotate && this._buildFreeRotatePivot) {
        const piv = this._buildFreeRotatePivot;
        const floorHit = eng.raycastFloor(ray.origin, ray.dir);
        let dist = 0;
        if (floorHit) {
          dist = Math.hypot(floorHit.x - piv.x, floorHit.z - piv.z);
          if (dist > 0.05) this._buildLastFreeAngle = Math.atan2(floorHit.z - piv.z, floorHit.x - piv.x);
        }
        // SHIFT trava em ângulos fixos de 15° — MESMO recurso do ramo
        // 'objeto' acima (ver comentário grande lá/_FREE_ROTATE_SHIFT_STEP).
        const anguloBruto = this._buildLastFreeAngle ?? (piv.wallAngulo ?? this._camera.yaw);
        const anguloTravado = this._keys.ShiftLeft || this._keys.ShiftRight;
        const angulo = anguloTravado ? Math.round(anguloBruto / this._FREE_ROTATE_SHIFT_STEP) * this._FREE_ROTATE_SHIFT_STEP : anguloBruto;
        // Ver comentário grande equivalente no ramo 'objeto' acima —
        // `_placeWithBuildTool` usa este campo (já com o travamento de 15°
        // aplicado) pra inserir exatamente o que o ghost está mostrando.
        this._buildFreeRotateFinalAngle = angulo;
        eng.showGhostDoorWindow?.(piv.x, piv.z, angulo, this._buildTool === 'porta');
        if (floorHit) {
          const px = anguloTravado ? piv.x + Math.cos(angulo) * dist : floorHit.x;
          const pz = anguloTravado ? piv.z + Math.sin(angulo) * dist : floorHit.z;
          eng.showSmartGuides?.([{ x1: piv.x, z1: piv.z, x2: px, z2: pz }]);
        }
        // Transferidor de 45° também no Giro Livre (ver comentário grande no
        // ramo 'objeto' acima) — sempre no chão e sempre alinhado pro norte
        // (pedido do usuário, 25/08/2026), não mais na altura da janela
        // (~1m) nem travado no ângulo de referência de antes. Opcional (ver
        // _isDebugTransferidorAtivo).
        if (this._isDebugTransferidorAtivo()) eng.showRotationProtractor?.(piv.x, piv.z);
        return;
      }
      const wallHit = eng.raycastWall(ray.origin, ray.dir);
      if (wallHit && wallHit.distance < 6) {
        // Pedido do usuário: "ao apontar para uma parede, deve mostrar o
        // ghost da porta como se ela já estivesse inserida na parede".
        // ANTES passava `angulo: null` pra showGhostDoorWindow, que por sua
        // vez tratava null como "não gira, só marca o ponto" (ver comentário
        // em showGhostDoorWindow, engine3d.js) — o ghost ficava sempre de
        // frente pra câmera/sem girar, em vez de deitado ALINHADO com a
        // parede mirada, então não parecia nada uma porta encaixada.
        // Corrigido calculando o MESMO ângulo que a peça de verdade vai
        // receber ao clicar (Mapping.resolveDoorWindowPos: ângulo da parede,
        // `atan2(dy,dx)`, mais `anguloExtra` — aqui, `_buildManualRot`, a
        // rotação manual acumulada pelo botão do meio, ver handleMiddleClickAction).
        const w = wallHit.wall;
        const wallAngulo = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
        eng.showGhostDoorWindow?.(wallHit.point.x, wallHit.point.z, wallAngulo + this._buildManualRot, this._buildTool === 'porta');
        // Transferidor de 8 divisões — mesmo recurso do ramo 'objeto' acima
        // (ver engine3d.js showRotationProtractor). Pedido do usuário,
        // 25/08/2026: sempre no chão e sempre alinhado pro norte — antes a
        // marcação acompanhava a altura da janela (~1m) e girava com o
        // ângulo da parede; agora nenhum dos dois. Opcional (ver
        // _isDebugTransferidorAtivo).
        if (this._isDebugTransferidorAtivo()) eng.showRotationProtractor?.(wallHit.point.x, wallHit.point.z);
      } else {
        // Mesmo critério do posicionamento de verdade (ver _placeWithBuildTool
        // acima): "no ar" segue a mira encostando no chão, não uma distância fixa.
        const hit = eng.raycastFloor(ray.origin, ray.dir);
        let x, z;
        if (hit) { x = hit.x; z = hit.z; }
        else { const dist = 1.5; x = this._camera.x + ray.dir.x * dist; z = this._camera.z + ray.dir.z * dist; }
        // Alinha com o CENTRO do quadrado de 1m do chão (mesma grade visual
        // do xadrez) por PADRÃO — configurável em "⚙️ Configurações" › 🚪
        // Porta/Janela (ver _isDoorSnapActiveNow/mapconfig.js DEFAULTS). Só
        // faz sentido "no ar" (sem parede) — encaixada numa parede a
        // posição já é travada na própria parede (posAoLongoDaParede), não
        // no chão.
        if (this._isDoorSnapActiveNow()) {
          const snapped = eng.snapToFloorTileCenter?.(x, z);
          if (snapped) { x = snapped.x; z = snapped.z; }
        }
        // Modo de alinhamento (ver comentário grande equivalente em
        // _placeWithBuildTool, ramo porta/janela "no ar") — o ghost precisa
        // usar exatamente a mesma base de ângulo que vai ser inserida de
        // verdade ao clicar.
        const anguloGhost = this._resolveFreeAlignmentAngle(Math.atan2(ray.dir.z, ray.dir.x));
        eng.showGhostDoorWindow?.(x, z, anguloGhost, this._buildTool === 'porta');
        // Sempre no chão e sempre alinhado pro norte (pedido do usuário,
        // 25/08/2026) — ver comentário grande no ramo 'objeto' acima.
        // Opcional (ver _isDebugTransferidorAtivo).
        if (this._isDebugTransferidorAtivo()) eng.showRotationProtractor?.(x, z);
      }
    }
  },

  _bindDesktopControls(canvas) {
    // Guarda defensiva (pedido do usuário, 25/08/2026: "um clique está
    // valendo por várias viradas") — se por qualquer motivo `mount()` for
    // chamado de novo sem um `unmount()` antes (ex.: algum caminho de
    // navegação que não devia, mas ainda assim), os listeners ANTIGOS
    // ficariam empilhados por cima dos novos — cada clique físico dispararia
    // 2x (ou mais), exatamente o sintoma relatado. Desliga qualquer binding
    // anterior antes de criar um novo, tornando esta função IDEMPOTENTE
    // (chamar de novo nunca duplica listener nenhum).
    this._unbindDesktopControls?.();
    const onKeyDown = (e) => {
      // Modelador 3D (js/modeler/*.js) ativo — pedido do usuário (28/08/2026):
      // enquanto o usuário está modelando (Object/Edit Mode, atalhos
      // G/R/S/E/1/2/3/Tab/etc. do PRÓPRIO modelador), NENHUM atalho/tecla de
      // movimento do View3D pode interferir (ex.: "5" trocaria a ferramenta
      // da hotbar pra Objeto no meio de uma digitação de eixo travado no
      // modelador). O modelador tem seu PRÓPRIO listener de teclado (também
      // em `window`, ver Modeler3D._bindEvents) — os dois nunca devem agir
      // ao mesmo tempo sobre a mesma tecla.
      if (window.Modeler3D?.isActive?.()) return;
      // "Salto" da câmera ao apertar ESC — 2ª correção (rodada 50; a da
      // rodada 49, só reagindo em `onPointerLockChange`, não bastou: o
      // usuário testou de novo e o salto continuava). Causa raiz real:
      // ESC solta o Pointer Lock por conta PRÓPRIA do navegador (não somos
      // nós que chamamos `exitPointerLock`, então não dá pra "avisar antes"
      // de verdade) e, ao devolver o cursor pra posição de tela de antes do
      // lock, o navegador dispara um `mousemove` sintético com
      // `movementX/Y` enormes — o problema é que esse `mousemove` pode
      // chegar ANTES do evento `pointerlockchange` correspondente (a ordem
      // entre os dois não é garantida — ver comentário grande em
      // `onPointerLockChange` abaixo), e nesse instante
      // `document.pointerLockElement` AINDA aponta pro canvas (o guard
      // `if (document.pointerLockElement !== canvas) return` de
      // `onMouseMove` não pega isso), então o giro sintético passava direto
      // — e o flag `_justUnlockedPointer` só era ligado depois, tarde
      // demais. Correção: como o PRÓPRIO ESC é o evento mais cedo possível
      // nessa sequência toda (sempre roda antes do navegador soltar o lock
      // de verdade), já liga aqui uma "janela de carência"
      // (`_pointerUnlockGraceUntil`, baseada em tempo real, não um flag de
      // 1 evento só — cobre também o caso de o navegador disparar MAIS de
      // um `mousemove` sintético) que `onMouseMove` passa a checar logo no
      // topo, ANTES até do guard de `pointerLockElement`.
      if (e.code === 'Escape' && document.pointerLockElement) {
        this._pointerUnlockGraceUntil = performance.now() + 300;
      }
      // Pedido do usuário (rodada 48, sobrevoo automático — ver
      // _startSceneFlythrough): "Em qualquer momento dessa apresentação do
      // cenário dá para apertar qualquer botão ou o mouse e o personagem é
      // 'ativado' no modo normal de navegação." — QUALQUER tecla cancela e
      // devolve o controle; a própria tecla apertada não faz mais nada além
      // disso neste mesmo evento (evita, por ex., que o "W" que cancelou o
      // sobrevoo também já ande um passo no mesmo instante).
      if (this._flythroughActive) { this._cancelFlythrough(); return; }
      // Pedido do usuário (rodada 49): "Troque a combinação para ativar/
      // desativar a gravidade de shift+espaço para espaço+espaço (pressionado
      // rapidamente)." — Espaço SOZINHO continua pulando normalmente (ver
      // `_jump`/`_update`, que olham `this._keys.Space` a cada quadro); só o
      // SEGUNDO toque dentro de uma janela curta (350ms, sem soltar entre um
      // toque e outro não é exigido) alterna a gravidade. Checado ANTES de
      // `this._keys[e.code] = true` (linha logo abaixo) justamente pra poder
      // cancelar o pulo deste 2º toque (senão o personagem pularia bem na
      // hora de alternar a gravidade). `!e.repeat` ignora o auto-repeat do
      // navegador quando a tecla fica segurada (não conta como um "toque"
      // novo a cada evento repetido).
      if (e.code === 'Space' && !e.repeat) {
        const agora = performance.now();
        const duploToque = this._lastSpaceTapT && (agora - this._lastSpaceTapT) < 350;
        this._lastSpaceTapT = duploToque ? 0 : agora; // zera pra um 3º toque rápido não emendar com este par
        if (duploToque) {
          e.preventDefault();
          this._gravityEnabled = !this._gravityEnabled;
          // Ao voltar a ligar a gravidade, força `_grounded = false` e zera a
          // velocidade vertical — assim ela recomeça a QUEDA (física normal)
          // a partir de onde a câmera estiver.
          if (this._gravityEnabled) { this._grounded = false; this._vel.y = 0; }
          Utils.toast?.(this._gravityEnabled ? '🌍 Gravidade ligada' : '🪶 Gravidade desligada (voo livre)', { duration: 1400 });
          this._keys[e.code] = false; // cancela o pulo deste 2º toque
          return;
        }
      }
      this._keys[e.code] = true;
      // Atalhos numéricos da hotbar (1 Mirar, 2 Parede, 3 Porta, 4 Janela, 5
      // Objeto, 6 Item, 7 Câmeras, 8 Remover) — mesmo espírito de hotbar
      // numerada de jogo. Esc
      // cancela uma parede em cadeia pendente (1º ponto já clicado, ainda
      // esperando o 2º) sem sair da ferramenta.
      // Esc também sai de "assistir" uma câmera fixa (pedido do usuário
      // implícito no fluxo — mesma tecla que já cancela outras coisas
      // pendentes nesta tela) — checado ANTES da cadeia de parede abaixo,
      // já que os dois nunca acontecem ao mesmo tempo (ferramentas
      // diferentes) mas por clareza de prioridade.
      if (e.code === 'Escape' && this._camMode) { this._exitCameraView(); return; }
      if (e.code === 'Escape' && this._wallChainStart) { this._wallChainStart = null; Utils.toast('Parede: cadeia cancelada.', { duration: 1500 }); return; }
      // Enter conclui (pedido do usuário: "o enter pode servir para
      // concluir as coisas, inclusive a parede") — mesmo efeito do botão
      // do meio/re-clicar em 🧱 (ver handleMiddleClickAction/_selectBuildTool). Só a
      // Parede tem de fato uma "cadeia pendente" pra concluir; as outras
      // ferramentas colocam de uma vez no clique, sem estado pendente.
      if (e.code === 'Enter' && document.pointerLockElement === canvas && this._buildTool === 'parede' && this._wallChainStart) {
        this._wallChainStart = null;
        Utils.toast('Parede concluída ✓', { type: 'ok', duration: 1500 });
        return;
      }
      // "DEL no 3D abre uma janelinha, como no Blender, com um botão para
      // deletar o objeto" (pedido do usuário, rodada 52, com screenshot do
      // Blender anexado). Backspace some junto — teclado americano/ABNT2
      // (Del "de verdade" pode faltar em notebook) e é o mesmo par que já
      // fecha outras coisas nesta tela). Só com o ponteiro travado (mesma
      // guarda dos outros atalhos aqui) — sem isso, DEL/Backspace continua
      // livre pra edição de texto normal em qualquer campo fora do 3D.
      if ((e.code === 'Delete' || e.code === 'Backspace') && document.pointerLockElement === canvas) {
        e.preventDefault();
        this._openDeleteConfirmPopup();
        return;
      }
      const numTool = { Digit1: null, Digit2: 'parede', Digit3: 'porta', Digit4: 'janela', Digit5: 'objeto', Digit6: 'item', Digit7: 'camera', Digit8: 'remover' }[e.code];
      if (numTool !== undefined && document.pointerLockElement === canvas) this._selectBuildTool(numTool);

      // "Giro Livre" (tecla R — pedido do usuário, 25/08/2026: "Ativar Giro
      // Livre: apertar R destrava os passos discretos e rotaciona
      // continuamente com base na sensibilidade do mouse... Alternar para
      // Modo Livre: pressionar uma tecla de alternância rápida"). É um
      // TOGGLE (aperta de novo pra sair), não "segurar" — só faz sentido nas
      // 3 ferramentas que giram peça (Porta/Janela/Objeto — ver
      // _captureFreeRotatePivot/_updateBuildGhost/_placeWithBuildTool).
      if (e.code === 'KeyR' && document.pointerLockElement === canvas && (this._buildTool === 'porta' || this._buildTool === 'janela' || this._buildTool === 'objeto')) {
        // Modo de alinhamento 'cardinal' OU 'personagem' LIGADO pra esta
        // ferramenta (ver _alignmentModeAtual/_isAnyFixedAlignmentActiveNow)
        // é incompatível com o Giro Livre de propósito — os dois travam a
        // peça numa das 4 direções fixas (um à mão, outro sozinho seguindo
        // a mira), o Giro Livre quer controle manual contínuo; não faria
        // sentido nenhum dos dois ativo junto (pedido do usuário,
        // 25/08/2026, não previu essa combinação — decisão de projeto
        // tomada aqui: o alinhamento tem prioridade, R fica sem efeito
        // enquanto ele estiver ligado, com um aviso explicando o motivo em
        // vez de simplesmente não fazer nada).
        if (!this._buildFreeRotate && this._isAnyFixedAlignmentActiveNow()) {
          Utils.toast('Giro livre desligado enquanto o Alinhamento (cardinal/personagem) estiver ativo (⚙️ Configurações).', { type: 'warn', duration: 2600 });
          return;
        }
        if (!this._buildFreeRotate) {
          const pivot = this._captureFreeRotatePivot();
          if (!pivot) {
            // Dois motivos possíveis (ver _captureFreeRotatePivot): mirando
            // o vazio, ou (só Objeto) travado numa parede por física agora —
            // nesse 2º caso girar livremente furaria a parede, por isso a
            // função recusa de propósito.
            Utils.toast('Giro livre indisponível aqui (mire num lugar válido, sem estar travado numa parede).', { type: 'warn', duration: 2400 });
            return;
          }
          this._buildFreeRotatePivot = pivot;
          this._buildFreeRotate = true;
          this._buildLastFreeAngle = null; // recalculado já no próximo quadro, ver _updateBuildGhost
          this._buildFreeRotateFinalAngle = null;
          // Ângulo de REFERÊNCIA pro "transferidor" de 45° durante o Giro
          // Livre (pedido do usuário, 25/08/2026: "quando o R é pressionado,
          // deve ter traços pontilhados de 45 graus em relação ao centro de
          // rotação do objeto para servir como guia visual") — capturado
          // UMA vez aqui (o mesmo que o Modo Padrão estaria usando neste
          // exato instante: ângulo da parede se encaixada, senão o yaw da
          // câmera) e mantido FIXO enquanto o Giro Livre durar — ver
          // _updateBuildGhost/showRotationProtractor. Se ficasse
          // recalculando com o yaw atual a cada quadro (como no Modo
          // Padrão), as marcas girariam junto enquanto a pessoa olha em
          // volta pra mirar o ângulo livre, o que não serviria de
          // referência nenhuma.
          this._buildFreeRotateRefAngulo = pivot.wallAngulo ?? this._camera.yaw;
          Utils.toast('Giro livre ativado — mire para rotacionar (Shift trava de 15° em 15°); R, clique ou Enter conclui.', { duration: 2600 });
        } else {
          // Sair do Giro Livre: simplificação aceita (documentada) — a
          // rotação manual acumulada volta a zero, igual a uma troca de
          // ferramenta (ver _selectBuildTool), em vez de tentar preservar o
          // ângulo exato entre os dois modos (que dependeria de reconverter
          // o ângulo absoluto do Giro Livre de volta pra um múltiplo de 45°
          // sobre uma referência — yaw da câmera ou ângulo da parede — que
          // pode já ter mudado enquanto se girava livremente). O usuário
          // pode reajustar com o botão do meio a partir daqui se precisar.
          this._buildFreeRotate = false;
          this._buildFreeRotatePivot = null;
          this._buildFreeRotateFinalAngle = null;
          this._buildManualRot = 0;
          Utils.toast('Giro livre desativado.', { duration: 1500 });
        }
        return;
      }

      // "Raio X" (tecla X — pedido do usuário, 25/08/2026: "deve haver um
      // raio x (ativado pela tecla X) que faz o objeto de baixo ficar
      // transparente (ou wireframe dependendo do desempenho) de modo que se
      // possa ver através dele. Desse jeito aquelas linhas prolongados até
      // o chão poderão ser vistas") — TOGGLE, mesmo espírito do Giro Livre
      // (tecla R) acima. Só faz sentido na ferramenta 📦 Objeto (a única que
      // pousa em cima de outro objeto — ver _updateBuildGhost/
      // showGhostFootprintShadow/Engine3D.setXRayTarget); o toggle não tem
      // efeito nenhum nas outras (`this._xrayActive` fica ligado sem nunca
      // ser consultado até voltar pra Objeto).
      if (e.code === 'KeyX' && document.pointerLockElement === canvas && this._buildTool === 'objeto') {
        this._xrayActive = !this._xrayActive;
        Utils.toast(this._xrayActive ? 'Raio X ativado — o que estiver embaixo do ghost fica transparente.' : 'Raio X desativado.', { duration: 1800 });
      }

      // ENTER também insere durante o Giro Livre (pedido do usuário,
      // 25/08/2026: "Quando o R foi pressionado ao clicar com o botão
      // esquerdo do mouse ou com ENTER o objeto é inserido e sai da
      // fixação da rotação") — MESMO efeito do clique esquerdo em
      // _placeWithBuildTool (que já desliga o Giro Livre sozinho ao
      // inserir, ver os ramos 'objeto'/porta-janela lá). Fora do Giro
      // Livre, Enter continua sem fazer nada aqui pras ferramentas
      // porta/janela/objeto (só a Parede tem o caso especial acima) —
      // essas sempre colocaram só no clique, sem estado pendente.
      if (e.code === 'Enter' && document.pointerLockElement === canvas && this._buildFreeRotate
        && (this._buildTool === 'porta' || this._buildTool === 'janela' || this._buildTool === 'objeto')) {
        this._placeWithBuildTool();
        return;
      }
    };
    const onKeyUp = (e) => { this._keys[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onClick = (e) => {
      // Pedido do usuário: "somente o botão esquerdo do mouse serve para
      // inserir [a porta] no mapa". O evento "click" do navegador já só
      // dispara pro botão PRIMÁRIO (esquerdo) por padrão — botão direito
      // dispara "contextmenu" (ver onContextMenu abaixo), nunca "click" — ou
      // seja, isto já era garantido pelo próprio navegador. `e.button` é
      // conferido mesmo assim, explicitamente, por clareza/robustez (ex.:
      // algum dia um listener de terceiros disparar "click" sintético com
      // outro botão) — 0 é sempre o botão esquerdo.
      if (e && typeof e.button === 'number' && e.button !== 0) return;
      // Modelador 3D ativo (ver onKeyDown acima) — não readquire o pointer
      // lock nem coloca/remove nada do View3D; o clique é do modelador
      // (seleção/gizmo/confirmar modal), tratado pelo listener PRÓPRIO dele.
      if (window.Modeler3D?.isActive?.()) return;
      // Sobrevoo automático do cenário (rodada 48 — ver _startSceneFlythrough/
      // onKeyDown acima): qualquer clique também cancela, igual a qualquer tecla.
      if (this._flythroughActive) { this._cancelFlythrough(); return; }
      // Pedido do usuário: botão "+" esquerdo (id="m3d-sidebar-toggle",
      // compartilhado com o Modelador — ver comentário grande junto ao HTML
      // dele) clicável mesmo com o Pointer Lock ativo — ver comentário
      // grande em `_isVirtualCursorOverAddObjBtn`. Como TODO clique cai
      // aqui (no canvas) enquanto travado, confere PRIMEIRO se o cursor
      // virtual está em cima do botão antes de tratar o clique como
      // navegação/interação normal da cena. Esta linha só roda com o
      // Modelador INATIVO (ver `if (window.Modeler3D?.isActive?.()) return;`
      // logo no topo deste handler) — abre o painel "Criar" (primitivas),
      // sem mira/raycast.
      if (document.pointerLockElement === canvas && this._isVirtualCursorOverAddObjBtn()) {
        ModelerUI.toggleSidebar(this);
        return;
      }
      if (document.pointerLockElement !== canvas) {
        // Cursor virtual (ver comentário acima) começa do zero em cada
        // travamento novo, na posição REAL do clique que travou (ainda
        // válida aqui, ANTES do lock entrar em vigor) — sem isto, o
        // primeiro `mousemove` depois de travar usaria `?? e.clientX`
        // (onMouseMove) só se nunca tivesse sido setado antes, deixando um
        // valor "fantasma" de um travamento anterior bem diferente da
        // posição real atual.
        this._lockCursorX = e.clientX;
        this._lockCursorY = e.clientY;
        // requestPointerLock() devolve uma Promise em navegadores modernos e
        // REJEITA (SecurityError) se chamada rápido demais depois de sair de
        // um pointer lock anterior (cooldown de proteção do próprio
        // navegador contra spam de lock/unlock) — sem o catch, isso virava
        // "Uncaught (in promise) SecurityError" no console a cada clique
        // rápido demais; não é um bug funcional (o clique seguinte já
        // funciona normal), só ruído — silenciar aqui.
        canvas.requestPointerLock?.()?.catch?.(() => {});
      } else if (this._buildTool === 'remover') {
        // "Recolhedor" estilo Minecraft (pedido do usuário) — clique REMOVE
        // o que estiver mirado, com animação (ver _removeWithTool).
        this._removeWithTool();
      } else if (this._buildTool === 'orb') {
        // "📍 Adicionar orb" (pedido do usuário, 26/08/2026) — clique ABRE a
        // janela de busca de patrimônio pro objeto mirado (ver
        // _addOrbWithTool), em vez de colocar/remover algo na cena.
        this._addOrbWithTool();
      } else if (this._buildTool) {
        // Ferramenta de construção ativa (hotbar) — clique COLOCA em vez de
        // selecionar/abrir a ficha (pedido do usuário: parede/porta/janela/
        // objeto/item colocáveis de dentro do 3D, "assim como no jogo
        // Minecraft").
        this._placeWithBuildTool();
      } else {
        this._tryPick();
      }
    };
    canvas.addEventListener('click', onClick);

    // Conclui uma parede em cadeia sem sair da ferramenta nem soltar o
    // pointer lock (o Esc sozinho não é confiável pra isso — ver comentário
    // em _selectBuildTool), e gira porta/janela/objeto — ver comentário
    // grande dentro de `handleMiddleClickAction` logo abaixo.
    //
    // HISTÓRICO da investigação até chegar aqui (pedido do usuário,
    // 25/08/2026: "o botão direito do mouse não está girando o ghost dos
    // objetos"):
    //  1) Descoberto com um `console.log`/toast de diagnóstico temporário
    //     que o próprio usuário testou: COM o ponteiro travado (pointer
    //     lock), o evento "contextmenu" do botão direito simplesmente NUNCA
    //     disparava no Chrome — só voltava a disparar depois de soltar o
    //     lock (Esc). É uma particularidade do Pointer Lock API no
    //     Chromium (faz sentido: não dá pra abrir um menu de contexto de
    //     verdade com o cursor escondido/capturado). Corrigido trocando o
    //     gatilho pra "mousedown"/"mouseup" do botão direito, que continuam
    //     disparando normalmente durante o lock.
    //  2) "Só está girando muito rápido... tem que ser por clique" e depois
    //     "ainda um clique está valendo por várias viradas": mesmo com uma
    //     máquina de estado de 2 estados dedicada (arma no mousedown,
    //     dispara no mouseup seguinte, só entre os dois — nunca 2 giros sem
    //     um mouseup no meio), o botão direito continuou girando mais de
    //     uma vez por clique físico nos testes do usuário.
    //  3) SOLUÇÃO ATUAL (pedido do usuário, 25/08/2026: "substitua pelo
    //     botão do meio do mouse. É o evento 'clique'"): trocado o botão E
    //     o mecanismo de detecção — em vez de reimplementar "o que é um
    //     clique" na mão com mousedown+mouseup (fonte dos bugs acima), usa-
    //     se o próprio conceito de "clique" que o navegador já garante
    //     disparar exatamente 1 vez por clique físico. Detalhe do DOM: o
    //     evento `click` só dispara pro botão ESQUERDO/primário (botão 0)
    //     — pro botão do MEIO (botão 1) e direito (botão 2), quem dispara é
    //     `auxclick` em vez de `click` (padrão desde o Chrome 55/2016,
    //     adotado depois pelos outros navegadores). Por isso `onMiddleClick`
    //     logo abaixo escuta os DOIS eventos (`click` e `auxclick`),
    //     filtrando por `e.button === 1` — na prática só UM dos dois chega
    //     a disparar de verdade pro botão do meio em cada navegador, nunca
    //     os dois juntos pro mesmo clique físico, então não há risco de
    //     girar em dobro nem precisa de nenhuma máquina de estado.
    const handleMiddleClickAction = () => {
      if (this._buildTool === 'parede' && this._wallChainStart) {
        this._wallChainStart = null;
        Utils.toast('Parede concluída ✓', { type: 'ok', duration: 1500 });
        return;
      }
      // Pedido do usuário (24/08/2026): "o botão direito do mouse deve
      // servir para girar a porta 90 no sentido horário para quem olha de
      // cima (numa visão top-down, como no 2D)... [também] enquanto está
      // apontando para aquela parede". Generalizado pra Objeto também, e o
      // passo trocado de 90° pra 45° (pedido do usuário, 25/08/2026: "Modo
      // Padrão (Snap 45°)... Clicar com o botão direito do mouse gira o
      // objeto em incrementos de 45°") — o GATILHO depois trocou do botão
      // direito pro botão do meio (ver comentário grande acima), mas a AÇÃO
      // em si (o que acontece ao clicar) continua exatamente a mesma. Um
      // único contador (`_buildManualRot`,
      // ver _initBuildHotbar/_selectBuildTool) cobre todos os casos — "no
      // ar" (soma direto no ângulo, _placeWithBuildTool/_updateBuildGhost) e
      // encaixada numa parede pra porta/janela (vira `anguloExtra`,
      // Mapping.resolveDoorWindowPos) — a MESMA rotação manual persiste ao
      // alternar entre mirar numa parede e mirar no vazio, então o usuário
      // não perde a rotação escolhida só por ter passado a mira por cima de
      // uma quina de parede sem querer. Sem efeito durante o Giro Livre
      // (tecla R — "destrava os passos discretos", pedido do usuário) nem
      // quando o Objeto está TRAVADO numa parede por física (nesse caso o
      // giro final é todo de `_resolveObjectWallSnap`, ignora este contador
      // de propósito) — não precisa checar nenhum dos dois casos aqui:
      // simplesmente incrementar sem efeito visível imediato é inofensivo, o
      // valor só passa a valer quando (e se) a peça sair da parede/do Giro
      // Livre de novo.
      //
      // `+= Math.PI/4` (não `-=`): mesma convenção de ângulo já usada pra
      // objetos/portas/janelas neste app (`angulo`, ver Mapping/objAnguloToRotY
      // em engine3d.js) — é a MESMA usada por `ctx.rotate(angulo)` no 2D
      // (mapview.js), onde ângulo crescente já gira no sentido horário na
      // tela (o eixo Y do canvas 2D aponta pra baixo, o que inverte o sentido
      // "matemático" de rotação positiva pro sentido horário visualmente) —
      // então incrementar aqui é a mesma coisa que girar horário "visto de
      // cima", exatamente como no 2D.
      // Modo de alinhamento (pedido do usuário, 25/08/2026 — ver
      // _alignmentModeAtual/mapconfig.js DEFAULTS): o clique se comporta
      // diferente em cada um dos 3 modos —
      //  - 'cardinal': CICLA entre as 4 direções fixas (Norte→Leste→Sul→
      //    Oeste, `_buildCardinalIndex`) em vez de somar 45° a
      //    `_buildManualRot` — os dois contadores nunca se combinam de
      //    propósito (o alinhamento cardinal SUBSTITUI a base do ângulo, não
      //    soma a ela — ver _resolveFreeAlignmentAngle). Um toast confirma a
      //    direção escolhida (mesmo espírito de feedback já usado por
      //    "Parede concluída ✓" acima) — sem isso a pessoa não tem como
      //    saber pra qual das 4 direções girou sem olhar o objeto de cima.
      //  - 'personagem' (pedido do usuário, 25/08/2026: "no modo 'conforme
      //    direção do personagem', o botão do meio do mouse deve funcionar
      //    também para ir trocando"): CICLA o MESMO `_buildCardinalIndex`
      //    do modo 'cardinal' acima — só que aqui ele volta a ser
      //    sobrescrito sozinho (o "reset" pedido) assim que o jogador vira
      //    o bastante pra mudar de quadrante de 90°, ver o comentário
      //    grande em _resolveFreeAlignmentAngle pro funcionamento completo.
      //  - 'padrao': soma 45° a `_buildManualRot`, como sempre foi.
      if (!this._buildFreeRotate && (this._buildTool === 'porta' || this._buildTool === 'janela' || this._buildTool === 'objeto')) {
        const modo = this._alignmentModeAtual();
        if (modo === 'cardinal' || modo === 'personagem') {
          this._buildCardinalIndex = (this._buildCardinalIndex + 1) % 4;
          Utils.toast(`Alinhado para ${this._CARDINAL_LABELS[this._buildCardinalIndex]}`, { duration: 1200 });
        } else {
          this._buildManualRot = (this._buildManualRot + Math.PI / 4) % (Math.PI * 2);
        }
      }
    };
    // Gatilho DE VERDADE (ver comentário grande acima) — só enquanto o
    // ponteiro está travado no canvas (fora do lock, o clique do meio nem
    // faz sentido pra esta tela — o cursor nem está escondido/capturado).
    // `e.preventDefault()` evita o autoscroll nativo do botão do meio (o
    // ícone de "bolinha com setas" que o navegador mostra ao clicar com o
    // botão do meio numa página comum).
    const onMiddleClick = (e) => {
      if (e.button !== 1 || document.pointerLockElement !== canvas) return;
      e.preventDefault();
      handleMiddleClickAction();
    };
    canvas.addEventListener('click', onMiddleClick);
    canvas.addEventListener('auxclick', onMiddleClick);
    // `mousedown` do botão do meio sozinho, só pra suprimir o autoscroll
    // nativo o quanto antes (alguns navegadores já iniciam o modo de
    // autoscroll no próprio mousedown, antes do `click`/`auxclick`
    // terminar) — NÃO dispara a rotação/conclusão de parede aqui, isso é
    // só no `onMiddleClick` acima, senão giraria em dobro por clique.
    //
    // Pedido do usuário (rodada seguinte): "Como no Blender, ao segurar
    // shift e mover a câmera com o botão do meio do mouse, ela deve se
    // deslocar lateralmente... da câmera e não do mundo... num plano
    // paralelo ao plano da tela da câmera" — `_middleButtonHeld` (só
    // rastreia se o botão do MEIO está pressionado; a ação em si mora no
    // `onMouseMove` abaixo, que já lida com o resto do "olhar em volta").
    this._middleButtonHeld = false;
    const onMouseDownMiddle = (e) => {
      if (e.button !== 1 || document.pointerLockElement !== canvas) return;
      e.preventDefault();
      this._middleButtonHeld = true;
    };
    canvas.addEventListener('mousedown', onMouseDownMiddle);
    const onMouseUpMiddle = (e) => { if (e.button === 1) this._middleButtonHeld = false; };
    document.addEventListener('mouseup', onMouseUpMiddle);
    // Botão direito: não faz mais nada nesta tela (a rotação/conclusão de
    // parede passou pro botão do meio, ver acima) — só suprime o menu de
    // contexto nativo do navegador pra não aparecer por cima da cena 3D.
    const onContextMenu = (e) => { e.preventDefault(); };
    canvas.addEventListener('contextmenu', onContextMenu);

    const onMouseMove = (e) => {
      // Janela de carência do ESC/unlock (rodada 50 — ver onKeyDown/
      // onPointerLockChange) — checada ANTES até do guard de
      // `pointerLockElement` logo abaixo, de propósito: o "salto" sintético
      // do cursor pode chegar num instante em que `pointerLockElement`
      // ainda aponta pro canvas (o guard sozinho não pega), então esta
      // checagem de TEMPO precisa vir primeiro. Baseada em tempo real (não
      // um flag de 1 evento só) pra cobrir também o caso de o navegador
      // disparar mais de um `mousemove` sintético nessa janela.
      if (performance.now() < (this._pointerUnlockGraceUntil || 0)) return;
      if (document.pointerLockElement !== canvas) return;
      // Pedido do usuário (rodada seguinte, 02/09/2026): cursor VIRTUAL
      // (mesma técnica do "cursor infinito" do Modelador, modeler-input.js
      // `_onMouseMove`/`state.mouse.vx/vy`) — com o Pointer Lock ativo,
      // `e.clientX/Y` ficam PARADOS (o cursor do sistema operacional nem se
      // move de verdade), só `movementX/Y` reporta o deslocamento real a
      // cada quadro. Acumula esse deslocamento num valor próprio
      // (`this._lockCursorX/Y`, iniciado em `onClick` na hora de travar —
      // ver lá), sem limite (pode passar longe dos limites da tela sem
      // problema — só usado pra hit-test do botão "+", nunca desenhado).
      // Feito ANTES de qualquer `return` cedo abaixo (câmera fixa etc.) pra
      // nunca ficar "parado" enquanto esses modos especiais estão ativos.
      this._lockCursorX = (this._lockCursorX ?? e.clientX) + (e.movementX || 0);
      this._lockCursorY = (this._lockCursorY ?? e.clientY) + (e.movementY || 0);
      // Destaque visual (classe .active, a mesma usada pelo Modelador
      // quando o painel lateral está aberto) enquanto o cursor virtual
      // passa por cima do botão — única pista de "mira" possível já que o
      // cursor de verdade do SO fica escondido pelo Pointer Lock.
      this._addObjBtnEl?.classList.toggle('active', this._isVirtualCursorOverAddObjBtn());
      if (this._camMode) {
        // "Assistindo" uma câmera fixa: mouse não gira o JOGADOR (que anda
        // sozinho — ver _updateAutopilot), gira/inclina a câmera fixa em
        // volta da direção original dela, dentro de um limite fixo pros dois
        // lados — pedido do usuário: "é possível mover de um lado para o
        // outro (limitado tanto para um lado quanto para o outro)... e
        // também inclinar para cima e para baixo de forma limitada".
        const cfg = this._camMode;
        cfg.pan = Utils.clamp(cfg.pan + (e.movementX || 0) * 0.0022, -this._CAM_VIEW_PAN_MAX, this._CAM_VIEW_PAN_MAX);
        cfg.tilt = Utils.clamp(cfg.tilt + (e.movementY || 0) * 0.0022, -this._CAM_VIEW_TILT_MAX, this._CAM_VIEW_TILT_MAX);
        return;
      }
      // Pedido do usuário: Shift + arrastar com o botão do MEIO desloca a
      // câmera lateralmente (esquerda/direita) e verticalmente (cima/baixo)
      // NUM PLANO PARALELO À TELA DA CÂMERA — ou seja, translada, não gira
      // (diferente do resto desta função, que só GIRA a mira). "Da câmera,
      // não do mundo": usa os eixos "direita" e "cima" DA PRÓPRIA CÂMERA
      // (que mudam conforme pra onde ela está olhando), não os eixos fixos
      // do mundo (X/Y global) — por isso o vetor "cima" é recalculado com
      // pitch E yaw (`up`, abaixo), não só um `{x:0,y:1,z:0}` fixo:
      // olhando pra cima/baixo, o "cima da tela" também inclina.
      //
      // Sentido do arraste (igual "agarrar e arrastar" o Blender/Google
      // Maps): arrastar pra DIREITA move a câmera pra ESQUERDA (o conteúdo
      // parece "seguir" o cursor pra direita); arrastar pra BAIXO move a
      // câmera pra CIMA (o conteúdo parece descer, seguindo o cursor).
      // Pedido do usuário (correção): "não está funcionando... é como se
      // nem tivesse pressionado, pois move normalmente do mesmo jeito." —
      // em vez de confiar SÓ no rastreio próprio de mousedown/mouseup
      // (`this._middleButtonHeld`, que fica fora de sincronia se o
      // navegador engolir o mousedown do botão do meio por algum motivo —
      // ex.: o autoscroll nativo do botão do meio tentando iniciar antes do
      // `preventDefault` surtir efeito), confere também `e.buttons`
      // (bitmask de VERDADE, relatado a cada `mousemove` pelo próprio
      // sistema — bit 4 = botão do meio) — qualquer um dos dois bastando já
      // é mais robusto que só um.
      const middlePressed = this._middleButtonHeld || !!(e.buttons & 4);
      if (middlePressed && e.shiftKey) {
        const right = Cam3DMath.cameraRightFlat(this._camera);
        // "cima" de verdade da câmera = mesma rotação (pitch, depois yaw)
        // aplicada ao "cima" canônico (0,1,0) — perpendicular tanto à mira
        // (cameraForward) quanto a `right`, e por isso inclina junto
        // quando a câmera olha pra cima/baixo (pitch != 0), continuando um
        // plano PARALELO à tela mesmo assim.
        const up = Cam3DMath.rotY(Cam3DMath.rotX({ x: 0, y: 1, z: 0 }, this._camera.pitch), this._camera.yaw);
        const PAN_SPEED = 0.012; // m por pixel arrastado — mesma ordem de grandeza do passo de andar (WASD)
        const dx = (e.movementX || 0) * PAN_SPEED, dy = (e.movementY || 0) * PAN_SPEED;
        this._camera.x += -right.x * dx + up.x * dy;
        this._camera.y += up.y * dy;
        this._camera.z += -right.z * dx + up.z * dy;
        return;
      }
      // Horizontal: mover o mouse para a direita deve girar a câmera para a
      // direita — isso exige AUMENTAR "yaw" (yaw crescente gira o vetor de
      // frente na direção do eixo "direita" real do Three.js — ver o
      // comentário de cameraRightFlat em engine3d.js). Vertical: mover para
      // baixo deve olhar para baixo — isso exige AUMENTAR "pitch".
      this._camera.yaw += (e.movementX || 0) * 0.0022;
      this._camera.pitch = Utils.clamp(this._camera.pitch + (e.movementY || 0) * 0.0022, -1.3, 1.3);
    };
    document.addEventListener('mousemove', onMouseMove);

    // Rolar o mouse, com a ferramenta Objeto/Item ativa, passeia pela
    // respectiva lista (catálogo de objetos / patrimônios sem lugar) —
    // pedido do usuário: "dá para usar o rolar do mouse para percorrer a
    // lista de objetos ou de itens o que estiver selecionado". Só faz
    // sentido com o ponteiro travado (dentro do jogo) — fora disso, deixa a
    // página rolar normal (não faz preventDefault).
    const onWheel = (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (this._camMode) {
        // "É possível dar zoom" (pedido do usuário) — enquanto se assiste
        // uma câmera fixa, a roda passa a ser zoom (campo de visão) em vez
        // de passear pela roleta, limitado nos dois extremos (ver
        // _CAM_VIEW_FOV_MIN/MAX) pra não virar um "olho de peixe" nem um
        // zoom absurdo.
        e.preventDefault();
        const cfg = this._camMode;
        cfg.zoomFov = Utils.clamp(cfg.zoomFov + Math.sign(e.deltaY) * 3, this._CAM_VIEW_FOV_MIN, this._CAM_VIEW_FOV_MAX);
        this._engine.setFov?.(cfg.zoomFov);
        return;
      }
      if (this._buildTool !== 'objeto' && this._buildTool !== 'item' && this._buildTool !== 'camera') return;
      e.preventDefault();
      this._cycleHotbarList(Math.sign(e.deltaY) || 1);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Pedido do usuário (03/09/2026): clique num rótulo do anel de bússola
    // gira suavemente o personagem pra aquela direção. Não precisa checar
    // Pointer Lock aqui — como documentado no HTML do anel, enquanto travado
    // o navegador manda todo clique real pro <canvas> mesmo (Pointer Lock
    // API), então estes botões só recebem o evento quando já destravado
    // (depois do Esc), que é exatamente o comportamento pedido pelo usuário.
    this._container?.querySelectorAll('.v3d-compass-dir').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bearing = parseFloat(btn.dataset.bearing) || 0;
        this._giroBussola3DParaDirecao(bearing);
      });
    });

    // Pedido do usuário (28/08/2026): recurso visual pra saber se o clique
    // já "entrou" no canvas (Pointer Lock ativo — interagindo direto com o
    // cenário 3D) ou se ainda está "fora" (precisa clicar pra habilitar).
    // `pointerlockchange` dispara tanto quando ESTE canvas trava/destrava
    // quanto quando outro elemento da página o faz — sempre confere
    // `document.pointerLockElement === canvas` explicitamente. O mesmo
    // canvas é reaproveitado pelo Modelador 3D (js/modeler/*.js — cursor
    // infinito nos arrastos G/R/S/Extrude), então o selo reflete os dois.
    const lockBadge = this._container?.querySelector('#v3d-lockstate');
    // Pedido do usuário (rodada seguinte): "A mensagem 'Clique para
    // interagir com o cenário 3D' fica aparecendo quando está no modo
    // Modelador, sendo que nesse modo já estava havendo interação." Causa
    // raiz: o selo só considera "travado"/interagindo quando o Pointer
    // Lock do NAVEGADOR está ativo no canvas — mas o Modelador 3D orbita a
    // câmera e seleciona vértices/arestas/faces sem precisar de Pointer
    // Lock nenhuma hora (só entra em Pointer Lock momentaneamente durante
    // um arrasto G/R/S) — então a dica ficava presa em "clique pra
    // interagir" o tempo todo, mesmo já dando pra interagir livremente.
    // Corrigido escondendo o selo inteiro (`display:none` via classe) quando
    // `Modeler3D.isActive()`.
    const onPointerLockChange = () => {
      // Pedido do usuário (rodada 49, refinado na 50): "Ao pressionar ESC, a
      // perspectiva da câmera deve se manter [...] dá uma saltada." Causa
      // raiz: ESC solta o Pointer Lock do navegador (comportamento nativo,
      // não interceptável) e, ao fazer isso, o SO devolve o cursor pra
      // posição de tela de antes do lock ter começado — o navegador então
      // dispara um (ou mais) `mousemove` sintético com `movementX/Y`
      // GRANDES pra refletir esse "salto" do cursor. Esse mousemove pode
      // chegar ANTES de `document.pointerLockElement` virar `null` (ordem
      // entre o último mousemove e o `pointerlockchange` não é garantida
      // entre navegadores), então o guard de `onMouseMove`
      // (`pointerLockElement !== canvas`) ainda deixava passar — girando
      // `yaw`/`pitch` de golpe. A janela de carência de verdade
      // (`_pointerUnlockGraceUntil`) já é ligada mais cedo, direto no
      // `keydown` do ESC (ver `onKeyDown`) — ESC sempre chega antes desse
      // mousemove sintético, diferente deste evento aqui, que pode chegar
      // depois. Este bloco fica só como REFORÇO pra qualquer outra forma de
      // destravar o Pointer Lock que não seja o ESC (perder o foco da
      // janela, outro código chamando `exitPointerLock`, etc.).
      if (document.pointerLockElement !== canvas) this._pointerUnlockGraceUntil = performance.now() + 300;
      // CORRIGIDO/UNIFICADO (03/09/2026) — bug relatado: "os botões do
      // Modelador acabaram ficando em cima dos botões do menu lateral
      // esquerdo." Uma 1ª tentativa aqui escondia um botão "+" separado
      // enquanto o outro (do Modelador) estava ativo — descartada a favor
      // da unificação de verdade pedida em seguida ("os dois, unificados"):
      // agora só existe UM elemento `#m3d-sidebar-toggle`/`#m3d-sidebar-
      // panel` (construído por `mount()`, nunca reconstruído), reaproveitado
      // pelo Modelador quando ativo — nunca dois botões na mesma posição,
      // então não há mais nada a esconder/mostrar aqui. Ver
      // `ModelerUI._sidebarCtx`/`refreshSharedSidebar` (modeler-ui.js) e os
      // hooks em `Modeler3D.enter`/`exit` (modeler-core.js).
      const modelerActive = !!window.Modeler3D?.isActive?.();
      if (!lockBadge) return;
      lockBadge.classList.toggle('m3d-hidden', modelerActive);
      lockBadge.classList.toggle('locked', document.pointerLockElement === canvas);
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);
    onPointerLockChange();
    // O Modelador entra/sai sem disparar `pointerlockchange` (ele não
    // trava/destrava o ponteiro ao entrar) — reavalia direto nesses dois
    // pontos também (ver Modeler3D.enter/exit em modeler-core.js).
    this._onModelerToggleForLockBadge = onPointerLockChange;

    this._unbindDesktopControls = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('click', onMiddleClick);
      canvas.removeEventListener('auxclick', onMiddleClick);
      canvas.removeEventListener('mousedown', onMouseDownMiddle);
      document.removeEventListener('mouseup', onMouseUpMiddle);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  },

  _bindMobileControls(container) {
    const isTouch = 'ontouchstart' in window;
    if (!isTouch) return;
    const canvas = container.querySelector('#v3d-canvas');
    const joy = container.querySelector('#v3d-joystick');
    const knob = joy.querySelector('.knob');
    const jumpBtn = container.querySelector('#v3d-jumpbtn');
    const runBtn = container.querySelector('#v3d-runbtn');
    [joy, jumpBtn, runBtn].forEach((el) => el.classList.remove('hidden'));

    joy.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this._joystick.active = true; this._joystick.touchId = t.identifier;
      this._joystick.originX = t.clientX; this._joystick.originY = t.clientY;
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this._joystick.active && t.identifier === this._joystick.touchId) {
          const dx = Utils.clamp(t.clientX - this._joystick.originX, -40, 40);
          const dy = Utils.clamp(t.clientY - this._joystick.originY, -40, 40);
          this._joystick.dx = dx / 40; this._joystick.dy = dy / 40;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        }
        if (this._look.active && t.identifier === this._look.touchId) {
          const dx = t.clientX - this._look.lastX, dy = t.clientY - this._look.lastY;
          this._look.lastX = t.clientX; this._look.lastY = t.clientY;
          this._camera.yaw += dx * 0.0035;
          this._camera.pitch = Utils.clamp(this._camera.pitch + dy * 0.0035, -1.3, 1.3);
        }
      }
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joystick.touchId) { this._joystick.active = false; this._joystick.dx = 0; this._joystick.dy = 0; knob.style.transform = ''; }
        if (t.identifier === this._look.touchId) { this._look.active = false; this._tryPick(); }
      }
    });
    canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      this._look.active = true; this._look.touchId = t.identifier;
      this._look.lastX = t.clientX; this._look.lastY = t.clientY;
      this._look.startX = t.clientX; this._look.startY = t.clientY; this._look.startT = performance.now();
    }, { passive: true });

    jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this._jump(); }, { passive: false });
    runBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this._keys.ShiftLeft = true; }, { passive: false });
    runBtn.addEventListener('touchend', (e) => { e.preventDefault(); this._keys.ShiftLeft = false; }, { passive: false });
  },

  _jump() {
    if (this._grounded) { this._vel.y = 6; this._grounded = false; }
  },

  // Handler original do botão "🧊 Novo Cubo" (#v3d-newcube3d, ver
  // _bindDesktopControls), virou método próprio. Chamado por ESSE botão
  // (sempre um cubo) — o botão "+" esquerdo chama `_createPrimitiveObjectAndEnter`
  // logo abaixo (mesma ideia, mas com a forma escolhida no painel "Criar").
  // Cria um objeto novo (cubo, forma padrão) 1,2m à FRENTE de onde a
  // câmera está olhando agora, garante que ele já tenha malha customizada
  // (`Modeler3D.ensureCustomMesh`) e entra no Modelador nele direto.
  _createAndEnterNewCube3D() {
    if (typeof Modeler3D === 'undefined') { Utils.toast?.('Modelador 3D não carregado.', { type: 'danger' }); return; }
    if (!this._map) { Utils.toast?.('Nenhum ambiente/mapa selecionado.', { type: 'warn' }); return; }
    document.exitPointerLock?.();
    const fwd = Cam3DMath.cameraForwardFlat(this._camera);
    const x = this._camera.x + fwd.x * 1.2, y = this._camera.z + fwd.z * 1.2;
    // CORREÇÃO (03/09/2026) — pedido do usuário: "veja o porquê está sempre
    // surgindo a camada 'Recuperados (camada original perdida)'... crio um
    // cubo, saio do 3D, então, acaba aparecendo esta camada". Causa raiz:
    // este objeto nascia SEM layerId (Mapping.addObject(...,{}) não passava
    // nenhum), então na próxima vez que o mapa era carregado/montado,
    // Mapping.ensureAllElementsLayered (ver mapping.js) encontrava um
    // elemento sem camada válida e inventava a camada de recuperação
    // "Recuperados (camada original perdida)" pra ele — mesmo a config
    // "Itens construídos dentro do 3D" = "A camada que estava ativa no 2D"
    // nunca chegava a ser respeitada aqui, só em _placeWithBuildTool (que já
    // usa _layerIdParaNovosItens() corretamente). Basta passar o mesmo
    // resolvedor de camada aqui também.
    const novo = Mapping.addObject(this._map, x, y, null, { layerId: this._layerIdParaNovosItens() });
    Modeler3D.ensureCustomMesh(novo);
    Mapping.updateObject(this._map, novo.id, { customMesh: novo.customMesh, customMeshXform: novo.customMeshXform, forma: novo.forma, largura: novo.largura, profundidade: novo.profundidade, altura: novo.altura });
    DB.saveMap(this._map);
    this._rebuildScene();
    setTimeout(() => Modeler3D.enter(this, novo), 0);
  },

  // NOVO (02/09/2026) — chamado por cada botão de primitiva do painel "+"
  // ESQUERDO (`ModelerUI._buildCriarPanelBase`, ver comentário grande lá pro pedido
  // verbatim completo). MESMO espírito de `_createAndEnterNewCube3D` logo
  // acima (objeto novo 1,2m à frente da câmera, entra editando ele no
  // Modelador direto) — só que a malha inicial vem de `entry.gerar(...)`
  // (a MESMA função geradora do catálogo do Modelador, `PRIMITIVE_CATALOG`,
  // modeler-ui.js) em vez de sempre um cubo. `largura`/`profundidade`/
  // `altura` calculados do bounding box REAL da malha gerada (mesma conta
  // de `ModelerMesh.localBBox`, já usada em vários outros lugares do
  // Modelador) — pra qualquer coisa que ainda lê essas 3 medidas fora do
  // Modelador (ex.: view de cima 2D) mostrar um tamanho plausível, não o
  // 0,5m fixo de `ensureCustomMesh` (que só serve pro cubo padrão).
  _createPrimitiveObjectAndEnter(entry) {
    if (typeof Modeler3D === 'undefined') { Utils.toast?.('Modelador 3D não carregado.', { type: 'danger' }); return; }
    if (!this._map) { Utils.toast?.('Nenhum ambiente/mapa selecionado.', { type: 'warn' }); return; }
    ModelerUI.toggleSidebar(this); // fecha o painel antes de entrar no Modelador (estava aberto — foi daqui que a primitiva veio)
    document.exitPointerLock?.();
    const fwd = Cam3DMath.cameraForwardFlat(this._camera);
    const x = this._camera.x + fwd.x * 1.2, y = this._camera.z + fwd.z * 1.2;
    // CORREÇÃO (03/09/2026) — mesmo bug/mesma causa raiz do comentário grande
    // em _createAndEnterNewCube3D logo acima ("Recuperados (camada original
    // perdida)" surgindo à toa): também faltava layerId aqui.
    const novo = Mapping.addObject(this._map, x, y, null, { layerId: this._layerIdParaNovosItens() });
    const malha = entry.gerar({ ...entry.defaultParams });
    const customMesh = {
      vertices: malha.vertices.map((v) => v.slice()),
      edges: (malha.edges || []).map((e) => e.slice()),
      faces: malha.faces.map((f) => f.slice()),
    };
    const customMeshXform = { rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    const bb = ModelerMesh.localBBox(customMesh.vertices);
    const patch = {
      customMesh, customMeshXform, forma: 'retangulo',
      largura: Math.max(0.05, bb.maxX - bb.minX),
      profundidade: Math.max(0.05, bb.maxZ - bb.minZ),
      altura: Math.max(0.05, bb.maxY - bb.minY),
      cor: novo.cor || '#8a92a3',
    };
    Mapping.updateObject(this._map, novo.id, patch);
    DB.saveMap(this._map);
    this._rebuildScene();
    setTimeout(() => Modeler3D.enter(this, novo), 0);
  },

  // Pedido do usuário: "ao capturar o mouse, não é mais possível clicar
  // ali [no botão '+'], só é possível clicar fora desse 'capturar do
  // mouse'." Causa raiz: com o Pointer Lock ativo (usado pra olhar em
  // volta na navegação normal, ver `onClick`/canvas requestPointerLock
  // mais abaixo), TODO evento de mouse — incluindo clique — é entregue ao
  // elemento travado (o <canvas>), nunca a outro elemento sobreposto
  // visualmente por cima dele, mesmo que o botão pareça estar "por cima"
  // — é assim que a API Pointer Lock funciona (sem ela, o botão receberia
  // o clique normalmente por hit-test comum). Corrigido com um cursor
  // VIRTUAL (`this._lockCursorX/Y`), acumulado de `movementX/movementY` a
  // cada `mousemove` (ver `onMouseMove` mais abaixo) — mesma técnica já
  // usada dentro do Modelador pro "cursor infinito" (`state.mouse.vx/vy`,
  // modeler-input.js `_onMouseMove`). `onClick` do canvas confere, a cada
  // clique, se esse cursor virtual cai dentro do retângulo do botão e, se
  // cair, trata como um clique NELE em vez de interagir com a cena.
  // Também usado a cada `mousemove` só pra dar um destaque visual
  // (`.active`, reaproveitada) no botão enquanto o cursor virtual passa
  // por cima dele — única pista visível de "mira" já que o cursor de
  // verdade do sistema operacional fica escondido pelo Pointer Lock.
  // Renomeado (02/09/2026) de `_isVirtualCursorOverBaseSidebarBtn` pra
  // `_isVirtualCursorOverAddObjBtn` junto com a desvinculação do botão do
  // Modelador (id próprio `_addObjBtnEl`, ver `_bindDesktopControls`).
  _isVirtualCursorOverAddObjBtn() {
    const el = this._addObjBtnEl;
    if (!el || !el.isConnected) return false;
    if (typeof this._lockCursorX !== 'number') return false;
    const r = el.getBoundingClientRect();
    return this._lockCursorX >= r.left && this._lockCursorX <= r.right
      && this._lockCursorY >= r.top && this._lockCursorY <= r.bottom;
  },

  _tryPick() {
    const ray = this._engine.centerRay(this._camera);
    const hit = this._engine.pickFromRay(ray.origin, ray.dir);
    if (!hit) return;
    if (hit.type === 'camera') this._showCameraCard3D(hit.ref);
    // NOVO (03/09/2026), pedido verbatim: "deve ser possível interagir com
    // o objeto da foto tirada" — ver o retângulo texturizado + pickable
    // 'fotoPin' criados em engine3d.js setScene (bloco "fotos vinculadas ao
    // mapa").
    else if (hit.type === 'fotoPin') this._showFotoPinCard3D(hit.ref);
    // Objeto associado a um ou mais patrimônios catalogados (obj.itemIds, ver
    // mapping.js/mapview.js) abre a(s) ficha(s) do(s) item(ns) de verdade —
    // mesmo atalho da câmera com foto associada — em vez do cartão genérico
    // "só informativo". Um único patrimônio: ficha única de sempre
    // (_showFlashcard3D). Mais de um (pedido do usuário 26/08/2026: "deve ser
    // uma lista com scroll... aparece os cards normalmente um abaixo do
    // outro"): lista rolável com todas as fichas, ver _showMultiFlashcard3D.
    // Se NENHUM dos itens associados existir mais no catálogo (excluídos
    // depois de associados), mostra o "que restou" da associação — só o
    // número do patrimônio guardado no próprio objeto (ver
    // Mapping.addItemToObject `patrimonio`), com botão pra apagar essa
    // informação residual (pedido do usuário, 27/08/2026 — ver
    // _showOrphanPatrimonioCard3D) — em vez do cartão genérico do objeto.
    else if (hit.type === 'object' && hit.ref.itemIds && hit.ref.itemIds.length) {
      const ids = hit.ref.itemIds.map((e) => e && e.id).filter(Boolean);
      Promise.all(ids.map((id) => DB.getItem(id))).then((items) => {
        const validIds = ids.filter((id, i) => items[i]);
        if (!validIds.length) this._showOrphanPatrimonioCard3D(hit.ref);
        else if (validIds.length === 1) this._showFlashcard3D({ id: validIds[0] });
        else this._showMultiFlashcard3D(validIds);
      });
    } else if (hit.type === 'object') this._showObjectCard3D(hit.ref);
    else this._showFlashcard3D(hit.ref); // item (ou pickable antigo sem `type`, por segurança)
  },

  // REMOVIDO (02/09/2026) — `_openModelerNoCentro` (handler de um botão "+"
  // NOVO que eu tinha criado por engano aqui). Ver comentário grande no HTML
  // de mount(), junto de onde o botão ficava, pra explicação completa.

  /** Cartão simples ao mirar/selecionar uma câmera do mapa em 3D — mesma
   *  ideia do atalho do modo observação do mapa 2D (mapview.js): se a câmera
   *  tiver uma foto associada, abre a tela de Fotos (a foto pode ser de
   *  OUTRO ambiente, escolhida pela galeria geral — por isso busca o
   *  ambiente dono dela antes de abrir). */
  async _showCameraCard3D(cam) {
    document.exitPointerLock?.();
    const existing = this._container.querySelector('.flashcard3d-overlay');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'flashcard3d-overlay';
    el.innerHTML = `
      <div style="text-align:center; font-weight:700; margin-bottom:8px">📷 Câmera</div>
      <div class="detail-grid">
        <div class="k">Direção</div><div class="v">${Math.round((cam.angulo || 0) * 180 / Math.PI)}°</div>
        <div class="k">Campo de visão</div><div class="v">${Math.round((cam.fov || Math.PI / 3) * 180 / Math.PI)}°</div>
      </div>
      <button class="btn block sm" id="v3d-cam-foto" ${cam.fotoId ? '' : 'disabled'} title="${cam.fotoId ? 'Abrir a foto associada a esta câmera' : 'Esta câmera não tem foto associada'}">🖼️ ${cam.fotoId ? 'Abrir foto associada' : 'Sem foto associada'}</button>
      <button class="btn secondary block sm" id="v3d-fc-close" style="margin-top:6px" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;
    this._container.appendChild(el);
    el.querySelector('#v3d-fc-close').onclick = () => el.remove();
    el.querySelector('#v3d-cam-foto').onclick = async () => {
      if (!cam.fotoId) return;
      const photo = await DB.getAmbientePhoto(cam.fotoId);
      if (!photo) { Utils.toast('A foto associada a esta câmera não foi encontrada (pode ter sido excluída).', { type: 'warn' }); return; }
      const owningMap = photo.ambienteId === this._map.id ? this._map : (await DB.getMap(photo.ambienteId)) || this._map;
      el.remove();
      // Sem onExit: fechar a tela de Fotos só remove a sobreposição dela e
      // volta a mostrar o 3D por trás, exatamente onde a pessoa estava —
      // sem navegar pra longe (e sem perder a posição/orientação na cena).
      await AmbientePhotos.open(owningMap, { startPhotoId: photo.id });
    };
  },

  /** NOVO (03/09/2026) — cartão ao mirar/selecionar o retângulo 3D de uma
   *  foto vinculada ao mapa (ver engine3d.js setScene, bloco "fotos
   *  vinculadas ao mapa", pickable tipo 'fotoPin'). MESMO espírito de
   *  `_showCameraCard3D` acima, só que aqui a foto SEMPRE existe (o
   *  retângulo só é construído quando `foto.thumbDataUrl`/`dataUrl` estão
   *  presentes) — sem estado "sem foto associada" pra tratar. `foto` aqui é
   *  o registro já achatado de `mapview.js _refreshFotosNoMapa`
   *  (`this._map.fotos`), com `id` == id da mapPhoto de verdade (js/db.js). */
  async _showFotoPinCard3D(foto) {
    document.exitPointerLock?.();
    const existing = this._container.querySelector('.flashcard3d-overlay');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'flashcard3d-overlay';
    el.innerHTML = `
      <div style="text-align:center; font-weight:700; margin-bottom:8px">🖼️ Foto no mapa</div>
      <button class="btn block sm" id="v3d-foto-abrir" title="Abrir esta foto em 'Mapa' → 'Fotos'">🖼️ Abrir foto</button>
      <button class="btn secondary block sm" id="v3d-fc-close" style="margin-top:6px" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;
    this._container.appendChild(el);
    el.querySelector('#v3d-fc-close').onclick = () => el.remove();
    el.querySelector('#v3d-foto-abrir').onclick = async () => {
      const photo = await DB.getAmbientePhoto(foto.id);
      if (!photo) { Utils.toast('Esta foto não foi encontrada (pode ter sido excluída).', { type: 'warn' }); return; }
      const owningMap = photo.ambienteId === this._map.id ? this._map : (await DB.getMap(photo.ambienteId)) || this._map;
      el.remove();
      // Mesmo padrão de AmbientePhotos.open como SOBREPOSIÇÃO (sem onExit)
      // já usado por _showCameraCard3D acima — fechar a tela de Fotos só
      // revela o 3D de novo, exatamente onde a pessoa estava.
      await AmbientePhotos.open(owningMap, { startPhotoId: photo.id });
    };
  },

  /** Cartão simples ao mirar/selecionar um objeto do mapa em 3D — só
   *  informativo (o objeto não tem "detalhes" pra ver, como um item). */
  _showObjectCard3D(obj) {
    document.exitPointerLock?.();
    const existing = this._container.querySelector('.flashcard3d-overlay');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'flashcard3d-overlay';
    const isRetangulo = obj.forma === 'retangulo';
    const isPoligono = obj.forma === 'poligono';
    // Pedido do usuário (rodada 47): "aparece, como título, apenas que se
    // trata de um polígono. Deve aparecer qual o objeto, por exemplo, se é
    // uma mesa, uma luminária, armário, gabinete, etc." — a checagem de
    // `forma` (retângulo/polígono) vinha ANTES do nome do catálogo, então
    // qualquer objeto com `forma:'poligono'` (ex.: "coluna", que SEMPRE
    // nasce com essa forma) mostrava só "Polígono (N lados)" mesmo tendo um
    // `tipo` de catálogo de verdade com nome amigável disponível
    // (Icons.labelForAnyKey). Agora o nome do catálogo tem prioridade — só
    // cai pro rótulo genérico de forma quando NÃO há tipo de catálogo (obj
    // "solto"/customizado, ex.: cubo do Modelador, que já nasce com
    // `tipo:null` — ver Modeler3D.ensureCustomMesh).
    const catalogLabel = window.Icons?.labelForAnyKey?.(obj.tipo);
    const label = catalogLabel || (isRetangulo ? 'Retângulo/quadrado'
      : isPoligono ? `Polígono (${Math.max(3, Math.round(obj.lados || 24))} lados)`
      : (obj.tipo || 'Objeto'));
    const emoji = catalogLabel ? '🏷️' : (isRetangulo ? '▭' : isPoligono ? '⬡' : '🧱');
    el.innerHTML = `
      <div style="text-align:center; font-weight:700; margin-bottom:8px">${emoji} ${Utils.escapeHtml(label)}</div>
      <button class="btn secondary block sm" id="v3d-fc-modelar" title="Editar a malha 3D deste objeto vértice a vértice, como no Blender">🔧 Modelar em 3D</button>
      <button class="btn block sm" id="v3d-fc-close" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;
    this._container.appendChild(el);
    el.querySelector('#v3d-fc-close').onclick = () => el.remove();
    // "🔧 Modelar em 3D" (pedido do usuário, 28/08/2026) — MESMO botão do
    // painel 2D (mapview.js #obj-modelar), só que aqui já dentro do 3D: não
    // precisa do "combinado" `window.__modelerPendingObjectId` (a cena já
    // está montada agora), entra direto no modelador pro MESMO objeto
    // (`this._map.objects` — a referência viva, não a cópia `obj` recebida
    // por parâmetro, que pode já estar desatualizada se este cartão ficou
    // aberto por um tempo).
    el.querySelector('#v3d-fc-modelar').onclick = () => {
      el.remove();
      const alvo = (this._map.objects || []).find((o) => o.id === obj.id) || obj;
      if (!alvo.customMesh && window.Modeler3D?.ensureCustomMesh) {
        window.Modeler3D.ensureCustomMesh(alvo);
        Mapping.updateObject(this._map, alvo.id, { customMesh: alvo.customMesh, customMeshXform: alvo.customMeshXform, forma: alvo.forma, largura: alvo.largura, profundidade: alvo.profundidade, altura: alvo.altura });
        DB.saveMap(this._map);
      }
      window.Modeler3D?.enter(this, alvo);
    };
  },

  /** Cartão do "que restou" de uma associação com um patrimônio já EXCLUÍDO
   *  do catálogo (pedido do usuário, 27/08/2026: "Se o patrimônio deixar de
   *  existir... no 3D, ao clicar em um objeto que tinha ele como vinculado,
   *  deve aparecer apenas o número do patrimônio e um botão para excluir a
   *  informação de patrimônio 'restante'"). Chamado por _tryPick quando
   *  NENHUM dos itens associados a este objeto (obj.itemIds) existe mais no
   *  catálogo. Mostra só o NÚMERO guardado em cada entrada (ver
   *  Mapping.addItemToObject `patrimonio`) — associações feitas ANTES desta
   *  mudança não têm esse número salvo (mostra um aviso genérico nesse
   *  caso) — com um botão por entrada pra apagar essa informação residual
   *  (Mapping.removeItemFromObject, que não depende do item existir mais).
   *  Uma LISTA, não um único item, porque um objeto pode ter mais de um
   *  patrimônio associado (ver mapping.js). */
  async _showOrphanPatrimonioCard3D(obj) {
    document.exitPointerLock?.();
    const existing = this._container.querySelector('.flashcard3d-overlay');
    if (existing) existing.remove();
    const entries = obj.itemIds || [];
    if (!entries.length) return;
    const el = document.createElement('div');
    el.className = 'flashcard3d-overlay';
    const rowsHtml = entries.map((e) => `
      <div class="v3d-orphan-row" style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--border)">
        <span style="font-family:monospace">${e.patrimonio ? Utils.escapeHtml(e.patrimonio) : '(número não registrado)'}</span>
        <button type="button" class="btn danger sm v3d-orphan-del" data-id="${e.id}" title="Excluir esta informação de patrimônio (o item já não existe mais no catálogo)">🗑️ Excluir</button>
      </div>`).join('');
    el.innerHTML = `
      <div style="text-align:center; font-weight:700; margin-bottom:4px">⚠️ Patrimônio excluído do catálogo</div>
      <p style="font-size:12px; color:var(--text-dim); text-align:center; margin:0 0 8px">Este objeto ainda guarda o número de um ou mais patrimônios já excluídos do catálogo:</p>
      <div>${rowsHtml}</div>
      <button class="btn secondary block sm" id="v3d-fc-close" style="margin-top:10px" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;
    this._container.appendChild(el);
    el.querySelector('#v3d-fc-close').onclick = () => el.remove();
    el.querySelectorAll('.v3d-orphan-del').forEach((btn) => {
      btn.onclick = async () => {
        Mapping.removeItemFromObject(this._map, obj.id, btn.dataset.id);
        await this._afterMapMutated();
        el.remove();
        const fresh = (this._map.objects || []).find((o) => o.id === obj.id);
        if (fresh && fresh.itemIds && fresh.itemIds.length) this._showOrphanPatrimonioCard3D(fresh);
        else Utils.toast('Informação de patrimônio removida ✓', { type: 'ok' });
      };
    });
  },

  async _showFlashcard3D(itemRef) {
    const item = await DB.getItem(itemRef.id);
    if (!item) return;
    await DB.touchLastConsulted(item.id);
    document.exitPointerLock?.();
    const existing = this._container.querySelector('.flashcard3d-overlay');
    if (existing) existing.remove();
    // Ícone do item (sem foto) desenhado em SVG na hora — ver avatar.js.
    const iconState = await Avatar.loadIconState();
    const avatarSvg = Avatar.itemIconSvg(item, iconState);
    const el = document.createElement('div');
    el.className = 'flashcard3d-overlay';
    el.innerHTML = `
      <div class="detail-avatar">${avatarSvg}</div>
      <div style="text-align:center; font-family:monospace; color:var(--text-dim)">${Utils.escapeHtml(item.patrimonio || '—')}</div>
      <div style="text-align:center; font-weight:700; margin:4px 0 8px">${Utils.escapeHtml(item.descricao || '(sem descrição)')}</div>
      <div class="detail-grid">
        <div class="k">Tipo</div><div class="v">${Utils.escapeHtml(item.tipo || '—')}</div>
        <div class="k">Setor</div><div class="v">${Utils.escapeHtml(item.setor || '—')}</div>
        <div class="k">Inserido</div><div class="v">${Utils.formatRelative(item.criadoEm)}</div>
        <div class="k">Modificado</div><div class="v">${Utils.formatRelative(item.modificadoEm)}</div>
      </div>
      <button class="btn block sm" id="v3d-fc-close" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;
    this._container.appendChild(el);
    el.querySelector('#v3d-fc-close').onclick = () => el.remove();
  },

  /** Lista rolável de fichas quando um ÚNICO objeto tem MAIS DE UM
   *  patrimônio associado (obj.itemIds, ver mapping.js addItemToObject) —
   *  pedido do usuário (26/08/2026): "Com mais de um patrimônio, deve ser uma
   *  lista com scroll. Aparece os cards normalmente um abaixo do outro."
   *  Mesmo card de _showFlashcard3D (avatar/patrimônio/descrição/grade),
   *  repetido um por item dentro de `.flashcard3d-list` (que rola por dentro
   *  — ver CSS .flashcard3d-overlay-multi/.flashcard3d-list/.flashcard3d-card
   *  em style.css), com o overlay em si maior e de altura limitada
   *  (max-height, não cresce além da tela). `itemIds` aqui já vem filtrado
   *  só com ids que EXISTEM no catálogo (ver _tryPick) — sem "(item
   *  removido)" misturado na lista, só teria sentido pro painel do editor
   *  2D onde a intenção é gerenciar as associações; aqui é só visualização. */
  async _showMultiFlashcard3D(itemIds) {
    const items = (await Promise.all(itemIds.map((id) => DB.getItem(id)))).filter(Boolean);
    if (!items.length) return;
    if (items.length === 1) { this._showFlashcard3D({ id: items[0].id }); return; }
    await Promise.all(items.map((it) => DB.touchLastConsulted(it.id)));
    document.exitPointerLock?.();
    const existing = this._container.querySelector('.flashcard3d-overlay');
    if (existing) existing.remove();
    // Ícone do item (sem foto) desenhado em SVG na hora — ver avatar.js.
    const iconState = await Avatar.loadIconState();
    const el = document.createElement('div');
    el.className = 'flashcard3d-overlay flashcard3d-overlay-multi';
    const cards = items.map((item) => `
      <div class="flashcard3d-card">
        <div class="detail-avatar">${Avatar.itemIconSvg(item, iconState)}</div>
        <div style="text-align:center; font-family:monospace; color:var(--text-dim)">${Utils.escapeHtml(item.patrimonio || '—')}</div>
        <div style="text-align:center; font-weight:700; margin:4px 0 8px">${Utils.escapeHtml(item.descricao || '(sem descrição)')}</div>
        <div class="detail-grid">
          <div class="k">Tipo</div><div class="v">${Utils.escapeHtml(item.tipo || '—')}</div>
          <div class="k">Setor</div><div class="v">${Utils.escapeHtml(item.setor || '—')}</div>
          <div class="k">Inserido</div><div class="v">${Utils.formatRelative(item.criadoEm)}</div>
          <div class="k">Modificado</div><div class="v">${Utils.formatRelative(item.modificadoEm)}</div>
        </div>
      </div>
    `).join('');
    el.innerHTML = `
      <div style="text-align:center; font-weight:700; margin-bottom:8px">🔗 Patrimônios associados a este objeto (${items.length})</div>
      <div class="flashcard3d-list">${cards}</div>
      <button class="btn block sm" id="v3d-fc-close" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;
    this._container.appendChild(el);
    el.querySelector('#v3d-fc-close').onclick = () => el.remove();
  },

  _resolveCollision(nx, nz, feetY = 0) {
    // Usa as MESMAS paredes "analisadas" (cantos fechados) que foram usadas
    // pra montar a cena visual — senão dava pra atravessar andando por uma
    // fresta num canto que visualmente já parece fechado.
    const walls = this._analyzedWalls || this._map?.walls;
    if (!walls) return { x: nx, z: nz };
    let x = nx, z = nz;
    for (const w of walls) {
      // Altura de hit-test da parede — pedido do usuário (25/08/2026): "As
      // paredes tem altura de hit test infinita? Não deve ser assim a
      // colisão deve ser apenas nas dimensões da parede." Antes, esta
      // função era 100% 2D (só x/z) — QUALQUER parede bloqueava o jogador
      // na horizontal não importa a altura dele, mesmo já tendo subido (ver
      // _surfaceHeightAt/STEP_MAX, e a física de pulo/queda em _update) em
      // cima de uma pilha de objetos mais alta que a própria parede, o que
      // fazia parecer uma "parede invisível infinita" vista de cima dela.
      // Paredes vão do chão (y=0) até `w.height` (2.6m padrão — ver
      // Mapping.addWall) — se os PÉS do jogador (`feetY`, passado por
      // _update) já estão na altura do topo da parede OU mais alto, ele
      // está literalmente por cima dela, e ESTA parede específica deixa de
      // bloquear o caminho horizontal (as outras, mais altas que os pés
      // ainda, continuam bloqueando normalmente).
      if (feetY >= (w.height ?? 2.6) - 1e-4) continue;
      const dx = w.x2 - w.x1, dz = w.y2 - w.y1;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((x - w.x1) * dx + (z - w.y1) * dz) / len2;
      t = Utils.clamp(t, 0, 1);
      // Porta ABERTA encaixada nesta parede: o trecho do vão vira
      // ATRAVESSÁVEL — a malha 3D já corta um buraco de verdade ali (ver
      // engine3d.js setScene "openings"), mas essa colisão 2D (linha
      // infinita por parede, sem noção de altura/buraco) ainda empurrava o
      // jogador pra fora bem no meio da porta aberta — bug relatado: "se a
      // porta estiver aberta, deve ser possível entrar no ambiente, mesmo
      // com a largura padrão". Só portas (não janelas — normalmente ficam
      // altas demais pra passar por baixo do peitoril, e esta colisão é só
      // 2D, sem eixo Y pra considerar isso direito).
      const len = Math.sqrt(len2);
      const tMeters = t * len;
      const dentroDeVaoAberto = (this._map?.portas || []).some((d) => {
        if (d.parentWallId !== w.id || !d.aberta) return false;
        const largura = d.largura || 0.8;
        const centro = d.posAoLongoDaParede || 0;
        return tMeters > centro - largura / 2 + 1e-3 && tMeters < centro + largura / 2 - 1e-3;
      });
      if (dentroDeVaoAberto) continue;
      const closestX = w.x1 + t * dx, closestZ = w.y1 + t * dz;
      const distX = x - closestX, distZ = z - closestZ;
      const dist = Math.hypot(distX, distZ);
      if (dist < this.PLAYER_RADIUS && dist > 1e-5) {
        const push = (this.PLAYER_RADIUS - dist);
        x += (distX / dist) * push;
        z += (distZ / dist) * push;
      }
    }
    return { x, z };
  },

  /** Maior altura de "chão" (piso OU topo de algum objeto do mapa, inclusive
   *  empilhado em cima de outro) sob o ponto (x,z) que o jogador consegue
   *  ALCANÇAR partindo da altura atual dos pés (`feetY`) — pedido do
   *  usuário (25/08/2026): "deve ser possível o personagem subir em cima
   *  dos objetos, inclusive os empilhados". ANTES a física (`_update`
   *  abaixo) só conhecia o chão fixo (y=0) — dava pra atravessar uma mesa
   *  andando, nunca ficar em pé em cima dela nem do que estivesse empilhado
   *  nela.
   *
   *  Cada objeto cujo footprint (mesma fonte usada em todo o resto do app,
   *  ver Mapping.pointInObjectFootprint) cobre (x,z) é um "degrau"
   *  candidato — o TOPO dele (`elevacao + altura`) só é aceito se: (a) já
   *  dá pra alcançar ANDANDO (não mais alto que `feetY + STEP_MAX`, um
   *  degrauzinho), OU (b) o jogador já está vindo de CIMA dele (pulou ou
   *  caiu de outro objeto mais alto — `feetY` já maior que o topo, então
   *  não tem limite nenhum: a física de queda comum, mais embaixo em
   *  `_update`, cuida de pousar suave assim que os pés cruzarem essa
   *  altura). Isso já resolve pilhas de qualquer profundidade (mesa ->
   *  impressora -> outra impressora em cima...) sem precisar andar
   *  "objeto por objeto": cada objeto empilhado já carrega sua PRÓPRIA
   *  elevação certa (ver Mapping.addObject "Empilhamento automático"), e o
   *  maior topo alcançável entre TODOS os que cobrem o ponto já vence
   *  (`best`), não só o mais recente. Sem `window.Mapping` carregado (não
   *  deveria acontecer, mas por segurança) ou nenhum objeto ali, cai pro
   *  chão (0). */
  _surfaceHeightAt(x, z, feetY) {
    let best = 0; // chão
    const Mapping = window.Mapping;
    if (!Mapping) return best;
    const objects = this._map?.objects || [];
    for (const o of objects) {
      if (!Mapping.pointInObjectFootprint(o, x, z)) continue;
      Mapping.applyDefaultShapeToObject?.(o); // garante o.altura calculada, se ainda não tiver forma explícita
      // Mapping.objectTopHeight — "imagem" (decalque chato no chão, sem
      // volume de verdade) não conta `o.altura`, só a elevação (ver
      // comentário grande lá): pedido do usuário, "coloquei uma imagem...
      // ao pular, o personagem sobe... só sai quando sai da área
      // equivalente" — sem esta exceção, QUALQUER imagem colada no chão
      // virava sem querer um degrau/bloco sólido de 0,5m.
      // CORRIGIDO (01/09/2026), pedido verbatim: "Sobre o objeto escada, no
      // 3D, deve dar para subir pela escada." Trocado `objectTopHeight(o)`
      // (altura ÚNICA pro objeto inteiro) por `objectTopHeightAt(o, x, z)`
      // — pra qualquer objeto que não seja 'escada' devolve exatamente o
      // mesmo valor de antes (ver comentário grande em mapping.js), só que
      // pra escada calcula o degrau exato em que (x,z) cai, permitindo subir
      // andando normalmente (cada degrau bem menor que STEP_MAX, abaixo).
      const top = Mapping.objectTopHeightAt(o, x, z);
      if (top <= best) continue; // já achamos algo mais alto (ou igual) nesta mesma varredura
      if (top <= feetY + this.STEP_MAX + 1e-4) best = top; // alcançável andando (degrau) ou já vindo de cima dele
    }
    return best;
  },

  _loop(t) {
    if (!this._running) return;
    const delta = Math.min(0.05, (t - this._lastT) / 1000);
    this._lastT = t;
    // Modelador 3D ativo (js/modeler/*.js) — pedido do usuário (28/08/2026):
    // o loop do View3D (física/ghosts de construção/RENDER) fica todo em
    // PAUSA enquanto o modelador está aberto — ele tem seu PRÓPRIO loop de
    // render (mesma engine/scene/câmera, ver Modeler3D._renderLoop), rodando
    // sozinho; sem este retorno antecipado os DOIS chamariam
    // `this._engine.renderer.render(...)` no mesmo quadro (desperdiçando GPU
    // à toa, mesmo sem quebrar nada visualmente) — mantém `requestAnimationFrame`
    // encadeado (this._loopHandle) só pra retomar sozinho assim que o
    // modelador for fechado, sem precisar reiniciar o loop de fora.
    if (window.Modeler3D?.isActive?.()) { this._loopHandle = requestAnimationFrame((tt) => this._loop(tt)); return; }
    // Física/input SEMPRE roda a cada quadro (mantém o movimento fluido,
    // sem soluço, mesmo com um limite de FPS ligado) — só o RENDER (a parte
    // cara pra GPU, que é o que o limite de FPS existe pra aliviar) é que é
    // pulado quando ainda não passou tempo suficiente desde o último quadro
    // desenhado. "Limite de FPS" no painel ⚙️ do 3D (mapconfig.js) — 0 =
    // sem limite (padrão, sempre desenha).
    this._update(delta);
    const fpsLimite = this._engine?._config?.fpsLimite || 0;
    const intervaloMin = fpsLimite > 0 ? 1000 / fpsLimite : 0;
    const desdeUltimoRender = t - (this._lastRenderT || 0);
    // Pergunta do usuário: "por que 'Sem limite' fica cravado em 60fps,
    // porém '60 fps' não fica mais cravado em 60?". Resposta (não é bug de
    // contagem — o HUD já conta certo desde a correção do Perf.js — é a
    // COMPARAÇÃO abaixo que é sensível demais perto do limite do monitor):
    // "Sem limite" (fpsLimite=0, intervaloMin=0) desenha em TODO tick do
    // requestAnimationFrame, sem checar nada — o navegador já entrega esses
    // ticks alinhados ao vsync do monitor (tipicamente 60Hz), então o
    // resultado é automaticamente "cravado" na cadência nativa da tela, sem
    // esforço. Já com um limite EXPLÍCITO igual (ou muito perto) da taxa
    // nativa do monitor — como "60 fps" na maioria dos monitores comuns —
    // `intervaloMin` (≈16.667ms) fica quase EXATAMENTE do tamanho do
    // intervalo real entre ticks do rAF, e ticks do rAF, na prática, não são
    // perfeitamente exatos (variam ±1-2ms de quadro a quadro por causa do
    // sistema operacional/driver de vídeo/outras abas). Um tick que chega só
    // FRAÇÕES DE MILISSEGUNDO adiantado (`desdeUltimoRender` levemente MENOR
    // que `intervaloMin`, por esse jitter normal) fica de fora da comparação
    // `>=` e é pulado — só que aí o PRÓXIMO tick só chega um período de tela
    // inteiro depois (~16.7ms depois desse), fazendo o intervalo entre dois
    // quadros DESENHADOS de verdade pular de ~16.7ms pra ~33ms (30fps
    // naquele instante) e depois voltar — um "gaguejo" (jitter) que o HUD de
    // FPS mostra como instabilidade em vez de 60 fixo. Com limites bem
    // ABAIXO da taxa nativa (30/45fps) isso não aparece, porque o alvo fica
    // longe o bastante do período do rAF pra um jitter de ±1-2ms nunca virar
    // a comparação. Corrigido com uma pequena TOLERÂNCIA (1ms) na
    // comparação: um tick "quase lá" (dentro da margem de erro normal do
    // rAF) já conta como "passou tempo suficiente", evitando esse pulo
    // espúrio bem na borda — sem isso mudar nada perceptível pra limites bem
    // abaixo da taxa nativa, onde a tolerância nunca chega a importar.
    const TOLERANCIA_JITTER_MS = 1;
    if (desdeUltimoRender >= intervaloMin - TOLERANCIA_JITTER_MS) {
      Perf.markFrameStart();
      this._updateBuildGhost();
      // "Assistindo" uma câmera fixa (ver _enterCameraView): quem é
      // renderizado passa a ser ELA (pan/tilt/zoom aplicados em cima —
      // _computeWatchCameraPose), não o jogador — que continua andando
      // sozinho por trás (_updateAutopilot) e aparece em cena como o boneco
      // palito (updatePlayerFigure), já que agora há outra câmera olhando
      // pra ele.
      // Sobrevoo automático (rodada 48) tem prioridade sobre tudo — MESMO
      // padrão de "pose renderizada substituída sem tocar this._camera" já
      // usado por _camMode/_computeWatchCameraPose logo abaixo.
      // NOVO (03/09/2026) — voos "Ver no mapa 3D"/busca 3D (flyCameraTo/
      // flyCameraToArc) têm prioridade sobre o Sobrevoo automático/câmera
      // assistida: MESMO padrão (pose calculada à parte substitui só a
      // câmera renderizada), mas na prática nunca competem de verdade — os
      // dois outros são cancelados no INÍCIO de qualquer flyCameraTo* (ver
      // lá), então só um destes três está ativo por vez.
      let renderCam = this._flyToActive ? this._computeFlyToPose()
        : this._flythroughActive ? this._computeFlythroughPose()
        : (this._camMode ? this._computeWatchCameraPose() : this._camera);
      // Pedido do usuário: transição suave ao VOLTAR do Modelador pro modo
      // normal de navegação (a metade "de entrada" fica em modeler-core.js
      // `enter()`/`_updateOrbitCamera` — ver comentário lá). `this._camera`
      // já é o valor de VERDADE desde antes (nunca foi tocado enquanto o
      // Modelador estava aberto — ver o retorno antecipado no topo deste
      // `_loop`), então só a pose RENDERIZADA (`renderCam`) é interpolada
      // aqui, sem mexer em `this._camera` nem no resto da física/input.
      if (this._camTransition && !this._camMode) {
        const tr = this._camTransition;
        const t = Math.min(1, (performance.now() - tr.t0) / tr.dur);
        const ease = t * t * (3 - 2 * t);
        renderCam = {
          x: tr.fromPos.x + (this._camera.x - tr.fromPos.x) * ease,
          y: tr.fromPos.y + (this._camera.y - tr.fromPos.y) * ease,
          z: tr.fromPos.z + (this._camera.z - tr.fromPos.z) * ease,
          yaw: Cam3DMath.lerpAngle(tr.fromYaw, this._camera.yaw, ease),
          pitch: tr.fromPitch + (this._camera.pitch - tr.fromPitch) * ease,
        };
        if (t >= 1) this._camTransition = null;
      }
      if (this._camMode) {
        this._engine.updatePlayerFigure?.(this._camera.x, this._camera.y, this._camera.z, this._camera.yaw, !!this._playerWalking, this._playerWalkT || 0);
      }
      // Só as luzes de luminária mais próximas ficam acesas (ver
      // engine3d.js updateActiveLights/comentário na constante
      // MAX_LUMINARIAS_ATIVAS) — resolve "mesmo olhando para uma parede, o
      // FPS não está aumentando" (o custo de luz é por PIXEL da tela, não
      // por objeto/direção da câmera). Usa a câmera DE VERDADE sendo
      // renderizada (renderCam), não sempre this._camera — senão, assistindo
      // por uma câmera fixa longe do jogador, as luzes "acesas" seriam as
      // mais próximas do JOGADOR (fora de tela), não do que está sendo visto.
      this._engine.updateActiveLights?.(renderCam);
      // Modo "Sólido+wireframe para desempenho" (pedido do usuário: "vai
      // desativando o sólido de alguns objetos na tela (os que não estão na
      // mira) e mudando para wireframe em tempo real a fim de fixar o fps
      // como foi definido nas configurações") — precisa de um FPS "medido"
      // pra comparar com o alvo (fpsLimite); `desdeUltimoRender` já reflete
      // o custo de render de VERDADE do quadro anterior (é a mesma conta do
      // HUD logo abaixo), só suavizado (média móvel) pra não oscilar a cada
      // quadro por causa de 1-2ms de ruído. Sem efeito nenhum fora do modo
      // 'hibrido' (ver Engine3D.updateHybridQuality, que sai na hora se
      // `this._hybridMeshes` estiver vazio).
      const fpsAtual = desdeUltimoRender > 0 ? 1000 / desdeUltimoRender : (this._fpsSmoothed || fpsLimite || 60);
      this._fpsSmoothed = this._fpsSmoothed ? this._fpsSmoothed * 0.85 + fpsAtual * 0.15 : fpsAtual;
      this._engine.updateHybridQuality?.(renderCam, this._fpsSmoothed, fpsLimite);
      this._engine.render(renderCam);
      Perf.markFrameEnd();
      // O "fps" do HUD reflete o RENDER de verdade (respeitando o limite
      // configurado), não a frequência do requestAnimationFrame em si — senão
      // o número mostrado continuaria em ~60fps mesmo com um limite mais
      // baixo ligado (física/input continuam rodando a cada rAF, só o
      // desenho é que é pulado).
      const fpsEl = this._container?.querySelector('#v3d-fps');
      if (fpsEl) fpsEl.textContent = desdeUltimoRender > 0 ? Math.round(1000 / desdeUltimoRender) + ' fps' : '';
      this._lastRenderT = t;
    }
    // Posição da câmera (x/y/z) associada a esta visualização 3D, pedida pelo
    // usuário pro HUD — mesmas coordenadas usadas pelo motor (this._camera),
    // x/z no plano do chão e y a altura (ver EYE_HEIGHT/física em _update).
    const posEl = this._container?.querySelector('#v3d-pos');
    if (posEl) {
      const c = this._camera;
      posEl.textContent = `x ${c.x.toFixed(1)} · y ${c.y.toFixed(1)} · z ${c.z.toFixed(1)}`;
    }
    // Pedido do usuário (03/09/2026): "Conforme gira no mundo 3D, a roda gira
    // na tela" — gira visualmente o anel de bússola a cada quadro conforme o
    // yaw atual da câmera. `yaw=0` é definido como "Norte" nesta app (ver
    // comentário no HTML do anel); rotate(-yawDeg) mantém cada rótulo
    // apontando pra sua direção real (yaw crescente = girando pra Leste).
    const compassInner = this._container?.querySelector('#v3d-compass-ring-inner');
    if (compassInner) {
      const yawDeg = (this._camera.yaw || 0) * 180 / Math.PI;
      compassInner.style.transform = `rotate(${-yawDeg}deg)`;
    }
    this._loopHandle = requestAnimationFrame((tt) => this._loop(tt));
  },

  // Pedido do usuário (03/09/2026): "Ao apertar esc [...] e clicando em cima
  // de uma das direções, então, a câmera do personagem é apontada para
  // aquela direção" — dispara uma transição suave de yaw (ver o consumo em
  // _update, via this._compassTurnTo) em vez de saltar instantaneamente.
  _giroBussola3DParaDirecao(bearingRad) {
    this._compassTurnTo = {
      fromYaw: this._camera.yaw || 0,
      toYaw: bearingRad,
      t0: performance.now(),
      duration: 400, // ms
    };
  },

  _update(delta) {
    // Modelador 3D ativo (js/modeler/*.js) — pedido do usuário (28/08/2026):
    // enquanto modelando, a câmera do View3D fica PARADA (o modelador tem seu
    // próprio controle de órbita da câmera, ver Modeler3D._updateOrbitCamera)
    // — sem este retorno antecipado, WASD continuaria andando o personagem
    // por baixo do modelador (this._keys não é limpo por ele, só ignorado
    // pelo onKeyDown acima) e a física/colisão de queda recalculariam
    // `cam.y` a cada quadro por cima da altura que o modelador está usando.
    if (window.Modeler3D?.isActive?.()) return;
    // Sobrevoo automático do cenário (rodada 48 — ver _startSceneFlythrough):
    // MESMO espírito do retorno antecipado do Modelador acima — enquanto a
    // apresentação roda, `this._camera`/física do jogador ficam TOTALMENTE
    // parados (a pose renderizada vem só de `_computeFlythroughPose`, ver
    // `_loop`); sai sozinho quando a apresentação termina (ver
    // `_updateFlythrough`, que zera `this._flythroughActive` no final).
    // NOVO (03/09/2026) — MESMO espírito do guard do Sobrevoo automático
    // logo abaixo: física/input do jogador ficam pausados enquanto um voo
    // "Ver no mapa 3D"/busca 3D está em andamento; a pose renderizada vem
    // só de `_computeFlyToPose` (ver `_loop`).
    if (this._flyToActive) { this._updateFlyTo(delta); return; }
    if (this._flythroughActive) { this._updateFlythrough(delta); return; }
    if (this._camMode) {
      // A câmera assistida pode ter sido apagada enquanto era assistida
      // (não deveria dar pra apagar com o 3D aberto, mas por segurança) —
      // sai sozinho da visão em vez de travar apontando pro nada.
      const camAinda = (this._map?.cameras || []).some((c) => c.id === this._camMode.camId);
      if (!camAinda) { this._exitCameraView(); }
      else { this._updateAutopilot(delta); return; }
    }
    // Pedido do usuário (03/09/2026): transição suave de yaw disparada pelo
    // clique num rótulo do anel de bússola (ver _giroBussola3DParaDirecao).
    // Propositalmente SEM `return` antecipado (diferente dos guards do
    // Modelador/sobrevoo/câmera assistida acima) — o usuário não pediu pra
    // travar o movimento durante o giro, então WASD continua funcionando
    // normalmente enquanto o yaw interpola suavemente até o alvo.
    if (this._compassTurnTo) {
      const turn = this._compassTurnTo;
      const elapsed = performance.now() - turn.t0;
      let t = Math.min(1, elapsed / turn.duration);
      const tEased = t * t * (3 - 2 * t); // smoothstep
      this._camera.yaw = Cam3DMath.lerpAngle(turn.fromYaw, turn.toYaw, tEased);
      if (t >= 1) this._compassTurnTo = null;
    }
    const cam = this._camera;
    const forward = Cam3DMath.cameraForwardFlat(cam);
    const right = Cam3DMath.cameraRightFlat(cam);
    const sprint = (this._keys.ShiftLeft || this._keys.ShiftRight) ? 2.0 : 1.0;
    // Pedido do usuário (03/09/2026): "ao mover a câmera do personagem, se
    // manter pressionado o botão do meio do mouse enquanto se move deve
    // ficar a velocidade normal dividida por 10 vezes (mais lento)" —
    // reaproveita `this._middleButtonHeld` (já existente, ligado/desligado
    // em onMouseDownMiddle/onMouseUpMiddle acima, usado também pelo
    // translate paralelo à tela) como um multiplicador extra de velocidade,
    // combinável com o sprint do Shift (ex.: Shift + botão do meio ainda
    // fica mais lento que sem Shift, só que 10x mais devagar que o normal).
    const middleSlow = this._middleButtonHeld ? 0.1 : 1.0;
    const speed = 2.6 * sprint * middleSlow;

    let mx = 0, mz = 0;
    if (this._keys.KeyW) { mx += forward.x; mz += forward.z; }
    if (this._keys.KeyS) { mx -= forward.x; mz -= forward.z; }
    if (this._keys.KeyA) { mx -= right.x; mz -= right.z; }
    if (this._keys.KeyD) { mx += right.x; mz += right.z; }
    if (this._joystick.active) {
      mx += forward.x * -this._joystick.dy + right.x * this._joystick.dx;
      mz += forward.z * -this._joystick.dy + right.z * this._joystick.dx;
    }
    const mlen = Math.hypot(mx, mz);
    if (mlen > 0.001) { mx /= mlen; mz /= mlen; }

    let nx = cam.x + mx * speed * delta;
    let nz = cam.z + mz * speed * delta;
    // Altura dos pés do quadro ANTERIOR (ainda não recalculada pra este
    // quadro) — suficiente pra decidir se cada parede bloqueia ou não (ver
    // _resolveCollision/pedido do usuário sobre altura de hit-test das
    // paredes) — 1 quadro de atraso é imperceptível (~16ms).
    const feetYAtual = cam.y - this.EYE_HEIGHT;
    const resolved = this._resolveCollision(nx, nz, feetYAtual);
    cam.x = resolved.x; cam.z = resolved.z;

    // Pular só faz sentido com gravidade ligada (senão "pular" não teria
    // chão nenhum pra puxar de volta) — ver toggle em onKeyDown (Shift+Espaço).
    if (this._keys.Space && this._gravityEnabled) this._jump();

    // Altura vertical (y): pedido do usuário (25/08/2026, reforçado de
    // novo): "o y deve ficar SEMPRE com o valor da altura do ponto de
    // vista de 1,65m. Só recebe um valor a mais caso esteja em cima de um
    // objeto naquele instante e naquela posição do mapa [...] depois de
    // sair de cima do objeto [...] nada deve ser somado ao valor padrão."
    // Três situações:
    //
    // 1) NÃO pulando/caindo (`_grounded` true) e a superfície sob os pés
    // continua ao ALCANCE de um degrau normal (diferença até STEP_MAX pra
    // cima OU pra baixo, ver STEP_MAX): `cam.y` é reatribuído DIRETO, todo
    // quadro, a partir da superfície atual (chão OU topo de algum objeto,
    // ver _surfaceHeightAt) — sem física/velocidade envolvida. Isso garante
    // que sair de cima de um objeto (andando, por um degrauzinho normal)
    // sempre volta pro valor certo NA HORA, sem chance de "ficar preso" no
    // valor antigo (bug relatado: "subi numa mesa, y ficou 2,1 e permaneceu
    // nesse valor, mesmo saindo de cima da mesa") — atribuição direta
    // elimina essa classe de bug pros casos de degrau pequeno.
    //
    // 2) NÃO pulando, mas a superfície sob os pés está bem mais BAIXA que
    // os pés atuais (mais que STEP_MAX — ex.: andou pra fora da borda de
    // uma mesa ou de uma pilha de objetos, sem pular) — pedido do usuário
    // (25/08/2026): "O cair do personagem deve usar a gravidade (ir
    // diminuindo a altura até cair no chão), não deve ir direto para o
    // chão." Em vez de "teleportar" pra baixo na hora (como o caso 1 faria
    // se não houvesse esta checagem), começa uma queda de verdade — sai de
    // `_grounded` (cai no caso 3 logo abaixo, já neste mesmo quadro, sem
    // esperar um quadro parado no ar) com velocidade vertical zerada (queda
    // "do repouso", sem nenhum impulso — diferente de _jump, que dá +6).
    //
    // 3) Pulando (`_grounded` false, ver _jump) OU acabou de cair de um
    // degrau alto (caso 2 acima) — física de queda de verdade (velocidade/
    // gravidade) até encostar em alguma superfície. É a MESMA física que já
    // permite GANHAR altura suficiente pra subir (pulando) num objeto mais
    // alto que o degrau livre (STEP_MAX) — sem isso não teria como escalar
    // uma mesa (0,74m) andando só.
    // Pedido do usuário: "Para qualquer um dos modos... para fazer a
    // gravidade deixar de agir, deve-se segurar o shift e pressionar a
    // tecla espaço" — com `this._gravityEnabled` desligado (ver onKeyDown),
    // NADA deste bloco roda: `cam.y` fica exatamente onde foi deixado
    // (inclusive por causa do pan Shift+Botão-do-meio, ver onMouseMove),
    // sem "grudar" na superfície nem cair — é o que faz o pan vertical
    // funcionar de verdade (sem gravidade ligada, ele sempre "vencia" o
    // pan, resetando `cam.y` pra altura da superfície TODO quadro).
    if (this._gravityEnabled) {
      const feetY = cam.y - this.EYE_HEIGHT;
      if (this._grounded) {
        const surfaceY = this._surfaceHeightAt(cam.x, cam.z, feetY);
        if (feetY - surfaceY > this.STEP_MAX + 1e-4) {
          this._grounded = false; // degrau alto demais pra "grudar" direto — cai de verdade (caso 3 abaixo, mesmo quadro)
        } else {
          cam.y = surfaceY + this.EYE_HEIGHT;
          this._vel.y = 0;
        }
      }
      if (!this._grounded) {
        const GRAVITY = -16;
        this._vel.y += GRAVITY * delta;
        cam.y += this._vel.y * delta;
        const GROUND_Y = this._surfaceHeightAt(cam.x, cam.z, cam.y - this.EYE_HEIGHT) + this.EYE_HEIGHT;
        if (cam.y <= GROUND_Y) { cam.y = GROUND_Y; this._vel.y = 0; this._grounded = true; }
      }
    } else {
      // Pedido do usuário (rodada 47): "Ao desativar a gravidade (com shift
      // + espaço), as setas ('para cima' e 'para baixo') não estão fazendo
      // com que a câmera do personagem varie em y." — com gravidade
      // desligada, nenhuma tecla fazia `cam.y` mudar (só o pan com
      // Shift+Botão-do-meio, ver onMouseMove) — mesma velocidade vertical
      // (VY_SPEED=2.0) já usada pela câmera livre do Modelador, ver
      // `_updateFreeCamera` em modeler-core.js.
      // NOVO (03/09/2026), pedido verbatim (item 3): "No 3D, ao desligar a
      // gravidade e ao segurar shift, o movimento vertical deve ficar mais
      // rápido, assim como do caminhar para o correr, enquanto a gravidade
      // está ligada." — reaproveita o MESMO multiplicador `sprint` já
      // calculado logo acima pro andar/correr horizontal (Shift = 2.0x, ver
      // `const sprint = ... ? 2.0 : 1.0` no início desta função), em vez de
      // inventar uma constante nova — garante que os dois "correr" (andando
      // no chão e voando sem gravidade) sempre usem exatamente a mesma
      // proporção, mesmo se o valor de `sprint` mudar no futuro.
      const VY_SPEED = 2.0 * sprint;
      if (this._keys.ArrowUp) cam.y += VY_SPEED * delta;
      if (this._keys.ArrowDown) cam.y -= VY_SPEED * delta;
    }
  },
};

window.View3D = View3D;
