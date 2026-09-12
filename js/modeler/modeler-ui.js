/**
 * modeler-ui.js — Modelador 3D: DOM da UI (toolbar, seletor de Modo, painel
 * N, menus flutuantes). Pedido do usuário (28/08/2026, rodada de ajustes):
 * "O Modo Objeto serve para mover, girar e organizar objetos inteiros na
 * cena, enquanto o Modo Editar serve para esculpir e modificar a forma e a
 * geometria de um objeto específico" — texto usado literalmente nos
 * tooltips abaixo — e "No modo editar (deve ser em português do Brasil)...
 * No modo objeto também deve ser em português do Brasil" — todo rótulo
 * (inclusive o antigo "Object Mode"/"Edit Mode" em inglês da 1ª versão) virou
 * "Modo Objeto"/"Modo Edição". Estilos em css/modeler3d.css (movidos daqui —
 * antes eram injetados via `<style>` direto no JS, ver pedido de
 * modularização no cabeçalho de modeler-core.js).
 */

/** NOVO (01/09/2026) — catálogo de primitivas da aba "Criar" → seção
 *  "Adicionar Primitiva" (item grande "barra lateral estilo Blender", ver
 *  pedido verbatim no cabeçalho de `ModelerInput.criarPrimitiva`, em
 *  modeler-input.js). Cada entrada aqui vira UM botão no submenu lateral —
 *  "faça todos esses botões como no Blender" (pedido verbatim) — dentro de um
 *  dos 3 grupos da imagem de referência enviada pelo usuário (Mesh/Lâmpada/
 *  Outros). `gerar(params)`: chama o gerador de malha certo (modeler-mesh.js)
 *  já "currificado" pros nomes de parâmetro em português usados aqui;
 *  `params`: schema dos campos numéricos editáveis (rótulo/valor inicial/
 *  passo) exibidos na região de Propriedades (`_renderCreateProps`, abaixo) —
 *  os valores INICIAIS (`defaultParams`) são os mesmos citados verbatim pelo
 *  usuário pra cada primitiva ("Círculo: inicialmente com 32 vértices e raio
 *  1", "Esfera UV: inicialmente com 32 arestas... 16 anéis... tamanho 1"
 *  etc). "Macaco: não coloque este modelo 3D, Claude" (pedido verbatim) — por
 *  isso não há entrada de macaco/Suzanne aqui. Os marcadores de Lâmpada/
 *  Outros (sem `params`, exceto Texto) são SIMPLIFICAÇÕES documentadas (ver
 *  cabeçalho dos `markerXMesh` em modeler-mesh.js) — geometria representativa
 *  fixa, não configurável, já que este Modelador não tem luzes/câmeras
 *  funcionais de verdade (única malha por sessão). */
const PRIMITIVE_CATALOG = {
  mesh: [
    {
      key: 'plano', label: 'Plano', icone: '▭',
      gerar: (p) => ModelerMesh.planeMesh(p.largura, p.profundidade),
      defaultParams: { largura: 2, profundidade: 2 },
      params: [
        { key: 'largura', label: 'Largura', value: 2, step: 0.1 },
        { key: 'profundidade', label: 'Profundidade', value: 2, step: 0.1 },
      ],
    },
    {
      key: 'cubo', label: 'Cubo', icone: '⬜',
      gerar: (p) => ModelerMesh.cubeMeshCentered(p.tamanho),
      defaultParams: { tamanho: 2 },
      params: [{ key: 'tamanho', label: 'Tamanho', value: 2, step: 0.1 }],
    },
    {
      key: 'circulo', label: 'Círculo', icone: '◯',
      gerar: (p) => ModelerMesh.circleMesh(p.vertices, p.raio),
      defaultParams: { vertices: 32, raio: 1 },
      params: [
        { key: 'vertices', label: 'Vértices', value: 32, step: 1, minDecimals: 0 },
        { key: 'raio', label: 'Raio', value: 1, step: 0.05 },
      ],
    },
    {
      key: 'esferaUV', label: 'Esfera UV', icone: '🌐',
      gerar: (p) => ModelerMesh.uvSphereMesh(p.segmentos, p.aneis, p.raio),
      defaultParams: { segmentos: 32, aneis: 16, raio: 1 },
      params: [
        { key: 'segmentos', label: 'Segmentos', value: 32, step: 1, minDecimals: 0 },
        { key: 'aneis', label: 'Anéis', value: 16, step: 1, minDecimals: 0 },
        { key: 'raio', label: 'Raio', value: 1, step: 0.05 },
      ],
    },
    {
      key: 'icoesfera', label: 'Icoesfera', icone: '🔺',
      gerar: (p) => ModelerMesh.icoSphereMesh(p.subdivisoes, p.raio),
      defaultParams: { subdivisoes: 1, raio: 1 },
      params: [
        { key: 'subdivisoes', label: 'Subdivisões', value: 1, step: 1, minDecimals: 0 },
        { key: 'raio', label: 'Raio', value: 1, step: 0.05 },
      ],
    },
    {
      key: 'cilindro', label: 'Cilindro', icone: '🥫',
      gerar: (p) => ModelerMesh.cylinderMesh(p.vertices, p.raio, p.profundidade),
      defaultParams: { vertices: 32, raio: 1, profundidade: 2 },
      params: [
        { key: 'vertices', label: 'Vértices', value: 32, step: 1, minDecimals: 0 },
        { key: 'raio', label: 'Raio', value: 1, step: 0.05 },
        { key: 'profundidade', label: 'Profundidade', value: 2, step: 0.1 },
      ],
    },
    {
      key: 'cone', label: 'Cone', icone: '🍦',
      gerar: (p) => ModelerMesh.coneMesh(p.vertices, p.raio1, p.raio2, p.profundidade),
      defaultParams: { vertices: 32, raio1: 1.5, raio2: 0, profundidade: 2 },
      params: [
        { key: 'vertices', label: 'Vértices', value: 32, step: 1, minDecimals: 0 },
        { key: 'raio1', label: 'Raio 1 (base)', value: 1.5, step: 0.05 },
        { key: 'raio2', label: 'Raio 2 (topo)', value: 0, step: 0.05 },
        { key: 'profundidade', label: 'Profundidade', value: 2, step: 0.1 },
      ],
    },
    {
      // Torus: "Um botão de toggle para definir os raios, um par de botões:
      // principal/secundário ou exterior/interior" (pedido verbatim) —
      // `torusRadii:true` sinaliza pra `_renderCreateProps` desenhar esse
      // par especial (ver lá), além dos 2 campos genéricos de segmentos
      // abaixo (`params`).
      key: 'torus', label: 'Torus', icone: '🍩',
      gerar: (p) => ModelerMesh.torusMesh(p.segMaior, p.segMenor, p.raioMaior, p.raioMenor),
      defaultParams: { segMaior: 48, segMenor: 12, raioMaior: 1, raioMenor: 0.5 },
      params: [
        { key: 'segMaior', label: 'Segmentos maiores', value: 48, step: 1, minDecimals: 0 },
        { key: 'segMenor', label: 'Segmentos menores', value: 12, step: 1, minDecimals: 0 },
      ],
      torusRadii: true,
    },
    {
      // ATUALIZADO (01/09/2026, item 9 da rodada B) — ver comentário grande
      // em `ModelerMesh.gridMesh`: `raio` (meio-tamanho, sem sentido pra um
      // plano quadrado) virou `tamanho` (tamanho TOTAL da aresta), MESMO
      // nome/MESMA convenção do Cubo (`PRIMITIVE_CATALOG.cubo`, `tamanho: 2`
      // acima) — padrão também 2, então a Grade nasce do tamanho de uma
      // face do Cubo padrão, como pedido verbatim.
      key: 'grade', label: 'Grade', icone: '▦',
      gerar: (p) => ModelerMesh.gridMesh(p.subdivX, p.subdivY, p.tamanho),
      defaultParams: { subdivX: 10, subdivY: 10, tamanho: 2 },
      params: [
        { key: 'subdivX', label: 'Subdivisões X', value: 10, step: 1, minDecimals: 0 },
        { key: 'subdivY', label: 'Subdivisões Y', value: 10, step: 1, minDecimals: 0 },
        { key: 'tamanho', label: 'Tamanho (como a face do Cubo)', value: 2, step: 0.1 },
      ],
    },
  ],
  // CORRIGIDO (02/09/2026), pedido verbatim (item 12 da rodada de 13
  // itens): "As lâmpadas devem gerar luz de verdade de acordo com o tipo de
  // lâmpada." Até aqui, os 5 marcadores abaixo eram só geometria decorativa
  // (ver o comentário grande logo acima, "este Modelador não tem luzes...
  // funcionais de verdade" — frase agora desatualizada, mantida agora só
  // como histórico da limitação ANTERIOR). Cada entrada ganhou o campo
  // `luz` — o tipo que `ModelerInput._colocarLuzDaLampada` usa pra criar o
  // `THREE.Light` de verdade correspondente, chamado logo depois do
  // `criarPrimitiva` de sempre (ver o botão, em `_buildCriarPanel`, mais
  // abaixo) — a geometria decorativa continua existindo do mesmo jeito
  // (o marcador visual, sem ela não haveria nada pra clicar/mover/apagar),
  // só ganhou uma luz de verdade "grudada" nela.
  lampada: [
    { key: 'ponto', label: 'Ponto', icone: '💡', gerar: () => ModelerMesh.markerPontoMesh(), defaultParams: {}, params: [], luz: 'ponto' },
    { key: 'sol', label: 'Sol', icone: '☀️', gerar: () => ModelerMesh.markerSolMesh(), defaultParams: {}, params: [], luz: 'sol' },
    { key: 'spot', label: 'Spot', icone: '🔦', gerar: () => ModelerMesh.markerSpotMesh(), defaultParams: {}, params: [], luz: 'spot' },
    { key: 'hemi', label: 'Hemi', icone: '🌗', gerar: () => ModelerMesh.markerHemiMesh(), defaultParams: {}, params: [], luz: 'hemi' },
    { key: 'area', label: 'Area', icone: '▬', gerar: () => ModelerMesh.markerAreaMesh(), defaultParams: {}, params: [], luz: 'area' },
  ],
  outros: [
    {
      key: 'texto', label: 'Texto', icone: '🔤',
      gerar: (p) => ModelerMesh.textoPlaceholderMesh(p.texto, p.altura, p.profundidade),
      defaultParams: { texto: 'Texto', altura: 0.3, profundidade: 0.06 },
      params: [
        { key: 'texto', label: 'Texto', value: 'Texto', isText: true },
        { key: 'altura', label: 'Altura', value: 0.3, step: 0.02 },
        { key: 'profundidade', label: 'Profundidade', value: 0.06, step: 0.01 },
      ],
    },
    { key: 'armature', label: 'Armature', icone: '🦴', gerar: () => ModelerMesh.markerArmatureMesh(), defaultParams: {}, params: [] },
    { key: 'lattice', label: 'Lattice', icone: '▧', gerar: () => ModelerMesh.markerLatticeMesh(), defaultParams: {}, params: [] },
    { key: 'empty', label: 'Empty', icone: '✛', gerar: () => ModelerMesh.markerEmptyMesh(), defaultParams: {}, params: [] },
    { key: 'speaker', label: 'Speaker', icone: '🔊', gerar: () => ModelerMesh.markerSpeakerMesh(), defaultParams: {}, params: [] },
    // "Quanto a câmera, é a câmera que já temos (deve ser como no Blender...)
    // Faça todos esses botões como no Blender" (pedido verbatim) — entra
    // aqui como o mesmo marcador/ícone já usado noutro lugar do app
    // (`markerCameraMesh`), pelo mesmo motivo dos outros marcadores acima.
    { key: 'camera', label: 'Câmera', icone: '🎥', gerar: () => ModelerMesh.markerCameraMesh(), defaultParams: {}, params: [] },
  ],
};

const ModelerUI = {
  build(state) {
    const root = document.createElement('div');
    root.className = 'm3d-root';
    root.innerHTML = ''
      + '<div class="m3d-toolbar">'
      + '  <div class="m3d-row">'
      + '    <div class="m3d-dropdown" id="m3d-mode-dd">'
      + '      <button type="button" class="m3d-btn" id="m3d-mode-btn" title="Modo Objeto: mover, girar e organizar objetos inteiros na cena. Modo Edição: esculpir e modificar a forma e a geometria de um objeto específico. (Tab alterna)">🖱️ Modo Objeto ▾</button>'
      + '    </div>'
      + '  </div>'
      // Pedido do usuário: "Deve ter um botão para alternar entre os modos
      // de posicionamento da câmera" — Orbital (padrão, sempre mira o
      // objeto) <-> Livre (voo por WASD/setas, sem mirar nada fixo). Ver
      // `Modeler3D.toggleCamPosMode`/`_updateFreeCamera`.
      + '  <div class="m3d-row">'
      + '    <button type="button" class="m3d-btn" id="m3d-campos-btn" title="Alterna entre câmera Orbital (sempre mirando o objeto) e câmera Livre (voo por WASD/setas — Shift+Espaço liga/desliga a gravidade)">🎯 Câmera: Orbital</button>'
      + '  </div>'
      + '  <div class="m3d-row" id="m3d-gizmo-row">'
      + '    <button type="button" class="m3d-btn active" data-gizmo="move" title="Gizmo de posição (G)">✥ Mover</button>'
      + '    <button type="button" class="m3d-btn" data-gizmo="rotate" title="Gizmo de rotação (R)">⟳ Girar</button>'
      + '    <button type="button" class="m3d-btn" data-gizmo="scale" title="Gizmo de escala (S)">⤢ Escalar</button>'
      + '  </div>'
      + '  <div class="m3d-row" id="m3d-selmode-row">'
      + '    <button type="button" class="m3d-btn active" data-selmode="vertex" title="Vértice (1)">● Vértice</button>'
      + '    <button type="button" class="m3d-btn" data-selmode="edge" title="Aresta (2)">╱ Aresta</button>'
      + '    <button type="button" class="m3d-btn" data-selmode="face" title="Face (3)">▲ Face</button>'
      + '    <button type="button" class="m3d-btn active" id="m3d-limit-visible" title="Limitar a seleção aos elementos visíveis (recortados pelo buffer de profundidade) — ligado (padrão): elementos ocultos aparecem esmaecidos/\'atrás do vidro\' e continuam clicáveis. Desligado: elementos ocultos não aparecem (nem são clicáveis).">'
      + '      <span class="m3d-eye-icon">👁️</span> Limitar visíveis</button>'
      + '  </div>'
      // REMOVIDO (03/09/2026), pedido verbatim: "➕ Adicionar" e "Remover:"
      // (Excluir/Mesclar/Remover Duplicados) saíram daqui e foram morar na
      // seção recolhível "Ferramentas de malha", dentro da aba vertical
      // "Ferramentas" (painel lateral esquerdo unificado, ver view3d.js) —
      // ver `ModelerUI._buildFerramentasPanel`. As linhas restantes desta
      // barra (modo/câmera/gizmo/seleção) ficam só com posição reajustada
      // (ver `.m3d-toolbar` em modeler3d.css) pra ficar perto do "Mirar" da
      // hotbar de baixo — pedido explícito do usuário, só de POSIÇÃO na
      // tela, sem formar um grupo funcional novo com a hotbar.
      + '</div>'
      // REMOVIDO (03/09/2026) — o botão "+"/submenu lateral (Ferramentas/
      // Criar) NÃO nasce mais aqui. Causa: bug relatado, "os botões do
      // Modelador acabaram ficando em cima dos botões do menu lateral
      // esquerdo" — a tela BASE do "Ver em 3D" (fora do Modelador, ver
      // view3d.js) ganhou seu PRÓPRIO botão "+"/painel nessa MESMA posição
      // numa rodada anterior, e os dois (um de cada arquivo) coexistiam no
      // DOM sempre que o Modelador estava aberto, se sobrepondo. Pedido de
      // unificação ("os dois, unificados"): agora existe UM SÓ elemento
      // `#m3d-sidebar-toggle`/`#m3d-sidebar-panel`, construído UMA VEZ por
      // `view3d.js` (mount, sobrevive a entrar/sair do Modelador) — ver
      // `toggleSidebar`/`renderSidebar` mais abaixo,
      // que agora resolvem sozinhos (por `Modeler3D.isActive()`) se devem
      // usar o `state` de uma edição em andamento (mostra a aba
      // "Ferramentas" também) ou não (só "Criar"), em vez de um `state`
      // fixo passado pelo chamador — o MESMO elemento serve os dois
      // contextos, nunca duplicado.
      + '<button type="button" class="m3d-btn m3d-exit" id="m3d-exit-btn">✕ Sair do Modelador</button>'
      // [15/09/2026] REMOVIDO -- pedido verbatim (Parte B): "o botão
      // dropdown 'Propriedades' (que aparece no lado direito da tela),
      // deve ficar dentro do botão '+' (o outro botão na lateral direita
      // da tela)." O painel flutuante próprio #m3d-npanel/#m3d-npanel-head/
      // #m3d-npanel-body (id/CSS antigos, ver .m3d-npanel em
      // modeler3d.css) SUMIU daqui -- seu conteúdo (updateNPanel, logo
      // abaixo) passa a ser escrito direto dentro da aba vertical
      // "Propriedades" do painel "+" unificado da lateral direita
      // (construído 1x por view3d.js, sobrevive a entrar/sair do
      // Modelador -- ver #v3d-proppanel-transformacao-body/
      // _renderPropriedadesPanel em view3d.js).
      + '<div class="m3d-hint">Tab: Modo Objeto/Edição · Botão direito seleciona · G/R/S mover/girar/escalar · X/Y/Z trava eixo · Enter/clique esquerdo confirma · Esc cancela · A seleciona/deseleciona tudo</div>';
    state.wrapEl.appendChild(root);
    state.rootEl = root;

    root.querySelector('#m3d-exit-btn').onclick = () => window.Modeler3D.exit();
    root.querySelector('#m3d-campos-btn').onclick = () => { ModelerInput.toggleCamPosMode(state); this.updateToolbarActive(state); };

    root.querySelector('#m3d-mode-btn').onclick = () => {
      this.showFloatingMenuAt(state, root.querySelector('#m3d-mode-btn'), [
        { label: '🧊 Modo Objeto', run: () => { if (state.mode !== 'object') ModelerInput.toggleMode(state); } },
        { label: '🔧 Modo Edição', run: () => { if (state.mode !== 'edit') ModelerInput.toggleMode(state); } },
      ]);
    };

    root.querySelectorAll('[data-gizmo]').forEach((btn) => {
      btn.onclick = () => { state.gizmoMode = btn.dataset.gizmo; this.updateToolbarActive(state); };
    });
    root.querySelectorAll('[data-selmode]').forEach((btn) => {
      btn.onclick = () => ModelerInput.setSelectMode(state, btn.dataset.selmode);
    });
    root.querySelector('#m3d-limit-visible').onclick = () => {
      state.limitToVisible = !state.limitToVisible;
      this.updateToolbarActive(state);
    };

    // REMOVIDO (03/09/2026) — bindings de #m3d-add-btn/#m3d-delete-btn/
    // #m3d-merge-btn/#m3d-removedoubles-btn (botões que saíram da barra de
    // cima) — os equivalentes agora são ligados dentro de
    // `_buildFerramentasPanel` (seção "Ferramentas de malha").

    // [15/09/2026] REMOVIDO -- ver comentário grande acima (HTML do
    // #m3d-npanel removido de build()): o cabeçalho recolhível "▸
    // Transformação" agora é o de view3d.js (#v3d-proppanel-
    // transformacao-head), ligado 1x lá (mount()) -- nada a religar aqui
    // a cada build().

    // REMOVIDO (03/09/2026) — o "+"/submenu lateral já existe (construído
    // por `view3d.js` na tela base, sobrevive a entrar/sair daqui) — nada a
    // fazer aqui além de avisar ele que agora há uma sessão ativa, pra
    // reavaliar as abas disponíveis (ganha "Ferramentas"). Ver
    // `ModelerUI.refreshSharedSidebar` chamada por `Modeler3D.enter`/`exit`
    // (modeler-core.js) — não daqui, pra funcionar mesmo se o painel foi
    // aberto ANTES de entrar (ex.: clicou numa primitiva da aba "Criar" da
    // tela base, o que já cria e entra editando, ver
    // `view3d._createPrimitiveObjectAndEnter`).

    this.updateToolbarActive(state);
    this.updateNPanel(state);
    this._renderCamLockedOverridesBar(state);
  },

  /** [14/09/2026] NOVO — pedido verbatim: "Quando for ativado o Modelador,
   *  na bandeja de baixo, onde estão os botões do 'Ver através desta
   *  foto', coloque botões de tudo que foi modificado no Modelador quando
   *  ele trabalha no modo normal [...] Um botão para cada coisa que foi
   *  desativada, por exemplo, orbitar em torno do objeto selecionado."
   *  `state.camLocked`/`state._camLockedFixedPose` só existem quando o
   *  Modelador foi aberto a partir de "Ver através desta câmera" (ver
   *  `Modeler3D.enter`, `opts.enterOrbital:false` — chamado por
   *  `view3d.js` quando `this._orbCamMode || this._fotoCamMode`) — fora
   *  disso esta função não desenha nada.
   *  [18/09/2026] REPOSICIONADO — pedido verbatim: "Tinha uma opção que,
   *  mesmo estando no modo 'Ver através desta câmera', era possível
   *  orbitar em torno do objeto selecionado para modelar com o Modelador.
   *  Se existe ainda, então, logo acima do botão 'Modo Objeto'." O botão
   *  CONTINUAVA existindo (`Modeler3D.toggleCamLockedOrbitOverride`, mesmo
   *  onclick de sempre) mas tinha ficado no lugar ERRADO: a versão
   *  original (14/09/2026, comentário acima) o anexava direto em
   *  `#v3d-fotocam-overlay` esperando encontrar ali a antiga bandeja de
   *  botões `.v3d-fotocam-overlay-controls` (pra ficar "junto com os
   *  outros botões do 'Ver através desta foto'") — só que essa bandeja foi
   *  REMOVIDA numa rodada seguinte, ainda no mesmo dia (15/09/2026, "Parte
   *  B": todos aqueles botões — Enquadramento/Escurecer o entorno/
   *  Escurecer imagem/Imagem/Propriedades/Informações — foram realocados
   *  pra dentro da aba lateral direita "Propriedades", ver
   *  `_renderPropriedadesPanel` em view3d.js). Como `#v3d-fotocam-overlay`
   *  (o wrap INTEIRO, `position:absolute;inset:0`) continuou existindo,
   *  este botão continuava sendo anexado ali com sucesso (nenhum erro),
   *  só que sem NENHUM posicionamento próprio (`.btn.secondary.sm` não tem
   *  `position` nenhuma) — caía no fluxo normal do documento, aparecendo
   *  encolhido no canto superior esquerdo da tela, longe de qualquer botão
   *  do Modelador — daí o pedido do usuário pra confirmar se ainda
   *  existia. CORRIGIDO: o botão passa a ser inserido DENTRO do próprio
   *  `.m3d-toolbar` do Modelador (`state.rootEl`), como uma NOVA primeira
   *  linha (`insertBefore` no topo) — como `.m3d-toolbar` é
   *  `flex-direction:column` ancorada por `bottom` (ver modeler3d.css), a
   *  caixa cresce PRA CIMA ao ganhar uma linha nova no topo do DOM, então
   *  esta nova linha aparece exatamente "logo acima do botão 'Modo
   *  Objeto'" (a 1ª linha de sempre da toolbar), como pedido. Estilizado
   *  com `.m3d-row`/`.m3d-btn` (visual do Modelador) em vez de
   *  `.btn.secondary.sm` (visual da tela base "Ver em 3D"), pra combinar
   *  com o resto da toolbar em que agora vive. Por estar dentro de
   *  `state.rootEl`, `dispose()` (abaixo) já remove este botão de graça
   *  junto com o resto da toolbar (`state.rootEl.remove()`) — não precisa
   *  mais de nenhuma limpeza separada por referência. Só o botão "Orbitar
   *  em torno do objeto selecionado" por enquanto — outras capacidades
   *  desativadas por `camLocked` (WASD/setas, arrastar pra girar/pan com
   *  botão do meio/direito, roda do mouse) ficam de fora desta 1ª rodada;
   *  mesmo padrão (botão que liga/desliga um "override" temporário) serve
   *  pra qualquer uma delas no futuro, se pedido. */
  _renderCamLockedOverridesBar(state) {
    if (state._camLockedOverrideRowEl) { state._camLockedOverrideRowEl.remove(); state._camLockedOverrideRowEl = null; state._camLockedOverrideBtnEl = null; }
    if (!state._camLockedFixedPose) return;
    const toolbar = state.rootEl?.querySelector('.m3d-toolbar');
    if (!toolbar) return;
    const row = document.createElement('div');
    row.className = 'm3d-row';
    row.id = 'm3d-camlocked-orbit-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'm3d-btn';
    btn.id = 'm3d-camlocked-orbit-override';
    btn.title = 'Enquanto travada em "Ver através desta câmera", o Modelador não deixa orbitar/mover a câmera. Este botão liga um orbitador TEMPORÁRIO em torno do objeto selecionado — desligue de novo pra voltar exatamente à perspectiva fixa da câmera.';
    btn.onclick = () => window.Modeler3D.toggleCamLockedOrbitOverride(state);
    row.appendChild(btn);
    toolbar.insertBefore(row, toolbar.firstChild);
    state._camLockedOverrideRowEl = row;
    state._camLockedOverrideBtnEl = btn;
    this.updateCamLockedOverrideButton(state);
  },

  updateCamLockedOverrideButton(state) {
    const btn = state._camLockedOverrideBtnEl;
    if (!btn) return;
    const orbitando = !state.camLocked;
    btn.textContent = orbitando ? '🔒 Voltar à perspectiva da câmera' : '🎯 Orbitar em torno do objeto';
    btn.classList.toggle('active', orbitando);
  },

  dispose(state) {
    // [18/09/2026] `state._camLockedOverrideRowEl`/`_camLockedOverrideBtnEl`
    // (ver `_renderCamLockedOverridesBar`) agora vivem DENTRO de
    // `state.rootEl` (viraram uma linha da própria `.m3d-toolbar`) — o
    // `state.rootEl.remove()` logo abaixo já os remove junto; só zera as
    // referências aqui, sem precisar de nenhum `.remove()` separado.
    state._camLockedOverrideRowEl = null;
    state._camLockedOverrideBtnEl = null;
    if (state.rootEl) { state.rootEl.remove(); state.rootEl = null; }
    document.querySelectorAll('.m3d-menu').forEach((m) => m.remove());
    // NOVO (01/09/2026) — o modal "Histórico do Desfazer" (ver
    // `showHistoryModal`) é anexado direto em `state.rootEl`, mas como
    // `state.rootEl` já foi removido do DOM na linha acima, qualquer overlay
    // aberto sairia junto — mesmo assim, limpa explicitamente por segurança
    // (ex.: se algum dia passar a ser anexado em `document.body` direto).
    document.querySelectorAll('.m3d-history-modal-overlay').forEach((m) => m.remove());
  },

  updateToolbarActive(state) {
    const root = state.rootEl;
    if (!root) return;
    root.querySelector('#m3d-mode-btn').textContent = state.mode === 'object' ? '🖱️ Modo Objeto ▾' : '🔧 Modo Edição ▾';
    const camPosBtn = root.querySelector('#m3d-campos-btn');
    if (camPosBtn) camPosBtn.textContent = state.camPosMode === 'free' ? '🕊️ Câmera: Livre' : '🎯 Câmera: Orbital';
    root.querySelectorAll('[data-gizmo]').forEach((b) => b.classList.toggle('active', b.dataset.gizmo === state.gizmoMode));
    root.querySelectorAll('[data-selmode]').forEach((b) => b.classList.toggle('active', b.dataset.selmode === state.selectMode));
    root.querySelector('#m3d-limit-visible').classList.toggle('active', !!state.limitToVisible);
    // Pedido do usuário: "Quando os elementos não ficarem visíveis, o ícone
    // de olho deve ser esmaecido" — ou seja, esmaecido quando DESLIGADO
    // (elementos ocultos deixam de aparecer).
    root.querySelector('.m3d-eye-icon')?.classList.toggle('m3d-eye-dim', !state.limitToVisible);
    const isEdit = state.mode === 'edit';
    root.querySelector('#m3d-selmode-row').style.display = isEdit ? 'flex' : 'none';
    // REMOVIDO (03/09/2026) — #m3d-mesh-row/#m3d-remove-row/#m3d-remove-label
    // não existem mais na barra de cima (mudaram pra seção "Ferramentas de
    // malha" na aba lateral "Ferramentas", ver `_buildFerramentasPanel`);
    // essa seção fica sempre visível ali, mesmo espírito da seção "Editar"
    // logo acima dela (que também não se esconde em Modo Objeto).
  },

  showFloatingMenu(state, items) {
    const rect = state.canvas.getBoundingClientRect();
    // BUG CORRIGIDO (03/09/2026), pedido verbatim do usuário: "No 'Ver em
    // 3D', no Modelador, quando apertar DEL para deletar um objeto, a
    // janelinha [deveria ficar] longe do cursor do mouse. Caso clique ali
    // mesmo, acaba por clicar em cima do botão 'Excluir'." Causa raiz: sem
    // um botão pra ancorar (chamado sem `anchorEl` — atalho de teclado
    // X/Delete, sem nenhum clique envolvido), o menu nascia centralizado no
    // CANVAS inteiro — na prática, quase sempre bem perto de onde o cursor
    // já estava parado (o usuário acabou de selecionar/apontar o objeto
    // ali), então um clique reflexo logo depois de apertar Delete (sem
    // mexer o mouse) caía direto em cima do 1º item do menu ("🗑️ Excluir
    // objeto"), excluindo sem querer. Correção: ancora numa posição
    // DESLOCADA da posição real do cursor (`state.mouse.vx/vy` —
    // client-space, sempre atualizado por `_onMouseMove`, inclusive fora de
    // pointer lock — ver comentário grande lá), com folga suficiente pra um
    // clique parado no MESMO lugar de antes cair fora do menu; troca de
    // lado (esquerda/direita, cima/baixo) perto das bordas do canvas pra
    // nunca nascer cortado pra fora dele.
    const GAP = 56; // folga mínima entre o cursor real e o menu, em px
    const cx = state.mouse.vx ?? (rect.left + rect.width / 2);
    const cy = state.mouse.vy ?? (rect.top + rect.height / 2);
    const menuW = 200; // largura aproximada (o menu de verdade mede a própria largura sozinho — isto é só pra decidir de que lado nascer, sem cortar)
    const itemH = 40; // altura aproximada de 1 item — mesma ideia, só pra decidir o lado vertical
    const growRight = cx + GAP + menuW <= rect.right;
    const left = growRight ? cx + GAP : Math.max(rect.left + 4, cx - GAP - menuW);
    const growDown = cy + GAP + itemH <= rect.bottom;
    const top = growDown ? cy + GAP : Math.max(rect.top + 4, cy - GAP - itemH);
    const anchor = { getBoundingClientRect: () => ({ left, bottom: top, top, width: menuW }) };
    this.showFloatingMenuAt(state, anchor, items);
  },

  /** Pedido do usuário: "O menu com as duas opções (modo objeto e modo
   *  editar) acaba ficando em baixo dos outros botões" — causa raiz: cada
   *  `.m3d-row` tem `backdrop-filter` no CSS, o que cria um novo "stacking
   *  context" por linha da toolbar (regra do CSS); como o menu era filho de
   *  dentro da PRIMEIRA `.m3d-row` (via `.m3d-dropdown`), as linhas
   *  SEGUINTES (desenhadas depois, cada uma seu próprio stacking context)
   *  acabavam cobrindo o menu por cima, mesmo com z-index alto — z-index só
   *  compara elementos dentro do MESMO stacking context. Corrigido anexando
   *  o menu sempre direto em `state.rootEl` (fora de qualquer `.m3d-row`) e
   *  usando `position:fixed` com coordenadas calculadas aqui via
   *  `getBoundingClientRect()` do botão-âncora (antes era `position:absolute`
   *  relativo ao `.m3d-dropdown` pai, dependente de ficar dentro dele). */
  showFloatingMenuAt(state, anchorEl, items) {
    document.querySelectorAll('.m3d-menu').forEach((m) => m.remove());
    const menu = document.createElement('div');
    menu.className = 'm3d-menu';
    items.forEach((it) => {
      // Pedido do usuário (menu "Delete" do Modelador, com screenshot do
      // Blender): separadores entre grupos de itens (excluir de verdade /
      // dissolver / operações de aresta) — `{separator:true}` vira uma
      // linha fina, sem botão.
      if (it.separator) { const hr = document.createElement('div'); hr.className = 'm3d-menu-sep'; menu.appendChild(hr); return; }
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.label;
      b.onclick = (ev) => { ev.stopPropagation(); menu.remove(); it.run(); };
      menu.appendChild(b);
    });
    state.rootEl.appendChild(menu);
    const r = anchorEl.getBoundingClientRect();
    menu.style.left = Math.round(r.left) + 'px';
    menu.style.top = Math.round(r.bottom + 4) + 'px';
    const closeOnce = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', closeOnce, true); } };
    setTimeout(() => document.addEventListener('mousedown', closeOnce, true), 0);
  },

  // ==================== NOVO (01/09/2026) — barra lateral estilo ====================
  // ==================== Blender (botão "+" esquerdo)              ====================
  //
  // Pedido do usuário (verbatim, ver cabeçalho de `ModelerInput.criarPrimitiva`
  // em modeler-input.js pra citação completa): abas verticais "Ferramentas"/
  // "Criar" à esquerda do submenu, texto de baixo pra cima (`writing-mode`,
  // ver CSS); dentro de "Ferramentas": seção recolhível "Editar" (Duplicar/
  // Deletar, expandida por padrão) e seção recolhível "Histórico" (Desfazer/
  // Refazer lado a lado + botão "histórico do Desfazer" abaixo); dentro de
  // "Criar": seção recolhível "Adicionar Primitiva" com os 3 grupos de botões
  // Mesh/Lâmpada/Outros (`PRIMITIVE_CATALOG`, topo do arquivo) e, embaixo,
  // numa região com scroll própria, os campos de propriedades da ÚLTIMA
  // primitiva inserida (`_renderCreateProps` — "Ajustar Última Operação",
  // ver `ModelerInput.ajustarUltimaPrimitiva`).

  // CORRIGIDO/UNIFICADO (03/09/2026) — pedido verbatim: "os botões do
  // Modelador acabaram ficando em cima dos botões do menu lateral
  // esquerdo... os dois, unificados." O "+"/painel deste sidebar agora é
  // construído UMA VEZ por `view3d.js` (dentro do próprio `mount()`,
  // sobrevive a entrar/sair do Modelador) — ESTAS funções
  // (`toggleSidebar`/`renderSidebar`) não recebem mais o `state` de uma
  // edição específica: recebem sempre `view3d` e resolvem sozinhas, a cada
  // chamada, se há uma sessão do Modelador ativa AGORA (`Modeler3D.
  // isActive()`) — usa o `state` de verdade (ganha a aba "Ferramentas")
  // quando há, ou um "estado" leve e persistente (`view3d._sidebarShell`,
  // só as 3 chaves de UI que este painel usa — `_sidebarOpen`/
  // `_sidebarTab`/`_sidebarUI` — mesmos nomes de sempre, criado sozinho na
  // 1ª chamada, ver `_sidebarCtx` logo abaixo) quando não há, pra funcionar igual nos dois
  // contextos sem duplicar nenhum elemento do DOM. Elementos sempre
  // encontrados via `view3d._container` (nunca mais `state.rootEl`, que só
  // existe durante uma sessão) — ver também `_renderCreateProps`/
  // `updateCreateProps` mais abaixo, ajustados pelo mesmo motivo.
  _sidebarCtx(view3d) {
    const ativo = typeof Modeler3D !== 'undefined' && Modeler3D.isActive?.();
    return ativo ? Modeler3D._state : (view3d._sidebarShell || (view3d._sidebarShell = { view3d, _sidebarTab: 'criar', _sidebarUI: {} }));
  },

  toggleSidebar(view3d) {
    const panel = view3d._container?.querySelector('#m3d-sidebar-panel');
    const toggle = view3d._container?.querySelector('#m3d-sidebar-toggle');
    if (!panel || !toggle) return;
    // CORRIGIDO (03/09/2026) — "aberto/fechado" é lido direto da CLASSE do
    // próprio elemento (`panel.classList.contains('open')`), não mais de
    // uma flag `_sidebarOpen` guardada no `ctx` (shell da tela base OU
    // `state` de uma edição — objetos DIFERENTES, que alternam entre si
    // conforme o Modelador entra/sai, ver `_sidebarCtx`): guardar a flag no
    // `ctx` causava dessincronia — abrir com o Modelador ativo (flag na
    // sessão real) e sair sem fechar deixava a flag do "shell" da tela
    // base, usado a partir daí, desatualizada (ainda `false` com o painel
    // fisicamente aberto), exigindo 2 cliques no "+" pra fechar de verdade.
    // O elemento do DOM é a ÚNICA fonte de verdade sobre aberto/fechado.
    const abrindo = !panel.classList.contains('open');
    panel.classList.toggle('open', abrindo);
    toggle.classList.toggle('active', abrindo);
    // Pedido do usuário: "Quando o menu lateral estiver aberto, então, o '+'
    // deve virar uma seta" (mesma convenção já usada no "+" existente do
    // lado direito, `js/view3d.js` `_toggleObjectCatalogPanel`, reaproveitada
    // aqui pro botão novo).
    // CORRIGIDO (01/09/2026), pedido verbatim: "A setinha de recolhimento
    // está apontando para a direita, deve apontar para a esquerda (indicando
    // para onde vai quando recolher)." A convenção reaproveitada acima (ver
    // comentário) veio do painel de `view3d.js`, que fica na borda DIREITA
    // da tela — lá, '➜' (aponta pra direita) está certo, porque recolher
    // empurra o painel pra FORA, rumo à borda direita. Este painel do
    // Modelador fica na borda ESQUERDA — copiar a mesma seta sem espelhar
    // apontava pro lado ERRADO (pra dentro da tela, não pra onde o painel
    // de fato vai ao recolher). Trocado por '⟸' (aponta pra esquerda).
    toggle.textContent = abrindo ? '⟸' : '+';
    if (abrindo) this.renderSidebar(view3d);
  },

  /** Reavalia as abas disponíveis e redesenha o conteúdo — chamada tanto
   *  pelo clique nas próprias abas quanto por `Modeler3D.enter`/`exit`
   *  (ver `refreshSharedSidebar` logo abaixo) sempre que uma sessão do
   *  Modelador começa/termina, pra "Ferramentas" aparecer/sumir na hora,
   *  mesmo com o painel já aberto. */
  renderSidebar(view3d) {
    const tabsEl = view3d._container?.querySelector('#m3d-sidebar-tabs');
    const contentEl = view3d._container?.querySelector('#m3d-sidebar-content');
    if (!tabsEl || !contentEl) return;
    const ctx = this._sidebarCtx(view3d);
    if (!ctx._sidebarTab) ctx._sidebarTab = 'criar';
    if (!ctx._sidebarUI) ctx._sidebarUI = { editarCollapsed: false, historicoCollapsed: false, primitivaCollapsed: false };
    const emEdicao = !!ctx.active; // só o `state` de verdade tem `active:true` (ver modeler-core.js enter) — o "shell" da tela base não
    // "Ferramentas" só existe com uma edição em andamento (Duplicar/
    // Deletar/Unir/Definir origem não fazem sentido sem um objeto sendo
    // editado) — se o painel estava na aba "Ferramentas" e a edição acabou
    // de fechar, volta sozinho pra "Criar" em vez de ficar numa aba que
    // sumiu.
    if (!emEdicao && ctx._sidebarTab === 'ferramentas') ctx._sidebarTab = 'criar';
    const abas = emEdicao ? [{ key: 'ferramentas', label: 'Ferramentas' }, { key: 'criar', label: 'Criar' }] : [{ key: 'criar', label: 'Criar' }];
    tabsEl.innerHTML = '';
    abas.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm3d-sidebar-tab' + (ctx._sidebarTab === t.key ? ' active' : '');
      b.textContent = t.label;
      // [09/09/2026] Ajuste solicitado pelo usuário (efeito colateral do item
      // "Definir origem" > "Personalizado" > escolher com o mouse): trocar de
      // aba enquanto o modo de escolher a origem pelas arestas está ativo não
      // fazia sentido deixar ligado escondido (o painel some, mas o
      // mousemove continuaria escutando/desenhando o marcador 3D) — sai do
      // modo (`exitOriginPickMode`) sempre que a aba muda pra longe de
      // "Ferramentas".
      b.onclick = () => { if (t.key !== 'ferramentas' && emEdicao) ModelerInput.exitOriginPickMode(ctx); ctx._sidebarTab = t.key; this.renderSidebar(view3d); };
      tabsEl.appendChild(b);
    });
    contentEl.innerHTML = '';
    contentEl.appendChild(
      ctx._sidebarTab === 'ferramentas' ? this._buildFerramentasPanel(ctx)
        : emEdicao ? this._buildCriarPanel(ctx)
        : this._buildCriarPanelBase(view3d, ctx),
    );
  },

  /** Chamada por `Modeler3D.enter`/`exit` (modeler-core.js) — só redesenha
   *  de verdade se o painel já estiver aberto (senão não há nada visível
   *  pra atualizar; a próxima abertura já chama `renderSidebar` sozinha). */
  refreshSharedSidebar(view3d) {
    const panel = view3d?._container?.querySelector('#m3d-sidebar-panel');
    if (panel && panel.classList.contains('open')) this.renderSidebar(view3d);
  },

  /** Aba "Criar" da tela BASE (fora de qualquer sessão do Modelador) —
   *  versão simplificada de `_buildCriarPanel` (mesmos 3 grupos de botões
   *  de primitiva, `PRIMITIVE_CATALOG`), sem a região de "Propriedades da
   *  última primitiva" nem a divisória (não há uma malha em edição pra
   *  ajustar ainda). Clicar numa primitiva CRIA um objeto novo na cena já
   *  com aquela forma e entra editando ele no Modelador (ver
   *  `view3d._createPrimitiveObjectAndEnter`) — a partir daí, reabrir este
   *  MESMO painel (agora com uma sessão ativa) mostra a versão completa
   *  (`_buildCriarPanel`) e a aba "Ferramentas" some/aparece sozinha. */
  _buildCriarPanelBase(view3d, ctx) {
    const wrap = document.createElement('div');
    wrap.className = 'm3d-sidebar-tabcontent m3d-sidebar-tabcontent-criar';
    [{ key: 'mesh', label: 'Mesh' }, { key: 'lampada', label: 'Lâmpada' }, { key: 'outros', label: 'Outros' }].forEach((grupo) => {
      const glabel = document.createElement('div'); glabel.className = 'm3d-nf-grouplabel'; glabel.textContent = grupo.label + ':';
      const grid = document.createElement('div'); grid.className = 'm3d-sidebar-btngrid';
      PRIMITIVE_CATALOG[grupo.key].forEach((entry) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'm3d-btn m3d-sidebar-primbtn'; b.title = entry.label;
        b.innerHTML = '<span class="m3d-sidebar-primicon">' + entry.icone + '</span><span>' + entry.label + '</span>';
        b.onclick = () => view3d._createPrimitiveObjectAndEnter(entry);
        grid.appendChild(b);
      });
      wrap.appendChild(glabel); wrap.appendChild(grid);
    });
    return wrap;
  },

  /** Aba "Ferramentas": seção "Editar" (Duplicar/Deletar) + seção
   *  "Histórico" (Desfazer/Refazer + botão do modal). "Os mesmos recursos do
   *  Modelador devem estar ali, inclusive combinações de teclas" (pedido
   *  verbatim) — por isso os botões chamam as MESMAS funções já ligadas ao
   *  Shift+D/X/Ctrl+Z/Ctrl+Y (`ModelerInput.triggerDuplicate`/
   *  `openRemoveMenu`/`undo`/`redo`), não uma cópia separada da lógica. */
  _buildFerramentasPanel(state) {
    const wrap = document.createElement('div');
    wrap.className = 'm3d-sidebar-tabcontent';

    const editHead = document.createElement('div'); editHead.className = 'm3d-nf-collapsible-head';
    const editArrow = document.createElement('span'); editArrow.className = 'm3d-nf-collapsible-arrow';
    const editLbl = document.createElement('span'); editLbl.textContent = 'Editar';
    editHead.appendChild(editArrow); editHead.appendChild(editLbl);
    const editBody = document.createElement('div'); editBody.className = 'm3d-nf-collapsible-body';
    const setEditCollapsed = (c) => { state._sidebarUI.editarCollapsed = c; editBody.classList.toggle('collapsed', c); editArrow.textContent = c ? '▸' : '▾'; };
    editHead.onclick = () => setEditCollapsed(!state._sidebarUI.editarCollapsed);
    setEditCollapsed(!!state._sidebarUI.editarCollapsed); // por padrão fica expandida (pedido verbatim)

    const dupBtn = document.createElement('button');
    dupBtn.type = 'button'; dupBtn.className = 'm3d-btn'; dupBtn.style.width = '100%';
    dupBtn.textContent = '📋 Duplicar (Shift+D)';
    dupBtn.onclick = () => ModelerInput.triggerDuplicate(state);
    const delBtn = document.createElement('button');
    delBtn.type = 'button'; delBtn.className = 'm3d-btn'; delBtn.style.cssText = 'width:100%; margin-top:4px;';
    delBtn.textContent = '🗑️ Deletar';
    delBtn.onclick = (e) => ModelerInput.openRemoveMenu(state, e.currentTarget);
    // NOVO (03/09/2026), pedido verbatim ("os botões: 'Duplicar', 'Deletar',
    // 'Unir' e 'definir origem'"): "Unir" reaproveita o MESMO menu Mesclar
    // já existente na barra de ferramentas de cima (🔗 Mesclar, "Remover:"),
    // `ModelerInput.openMergeMenu` — não duplica lógica nenhuma, só mais um
    // jeito de chegar no mesmo menu.
    const uniBtn = document.createElement('button');
    uniBtn.type = 'button'; uniBtn.className = 'm3d-btn'; uniBtn.style.cssText = 'width:100%; margin-top:4px;';
    uniBtn.textContent = '🔗 Unir';
    uniBtn.onclick = (e) => ModelerInput.openMergeMenu(state, e.currentTarget);
    // NOVO (03/09/2026) — "definir origem", pedido verbatim com 5 opções:
    // "centro de massa", "centralizado (em baixo)", "centralizado (em
    // cima)", "vértice selecionado" (o 1º selecionado, se houver mais de
    // um) e "personalizado" (x/y/z digitados, define onde a origem vai
    // ficar). Ver `ModelerInput.setOrigin` (modeler-input.js) pra
    // implementação — desloca a malha inteira pelo ponto escolhido e
    // compensa `state.group.position` pra o objeto não "pular" de lugar
    // visualmente ao trocar de origem.
    // [09/09/2026] ATUALIZADO, pedido verbatim: "A opção 'Personalizado
    // (x/y/z)' deve ter duas subopções. Uma que dá a possibilidade de
    // definir qualquer lugar (independente do objeto) para definir como sua
    // origem. A outra opção deve funcionar assim, deve ser possível definir
    // o ponto de origem do objeto com o cursor do mouse sobre as suas
    // arestas e vértices [...] Se estiver em 'Personalizado (x/y/z)', então,
    // deve aparecer, logo em baixo do botão de 'definir origem', três campos
    // para inserir as coordenadas [...] do mesmo jeito que é no botão
    // lateral direito em 'Propriedades', em 'Transformação'." — "Personalizado
    // (x/y/z)..." virou 2 itens (`_openOrigemCustomPanel(state,'livre'/
    // 'picking')`), que abrem o painel `#m3d-origem-custom-wrap` (ver
    // `_renderOrigemCustomPanel` abaixo) com 3 `_createNumField` (o MESMO
    // widget de 3 botões usado em "Transformação" > "Posição", ver
    // `_buildGroup`/`_buildObjectTransformPanel`) em vez dos 3 `prompt()` de
    // antes (`_promptOrigemPersonalizada`, mantida só como fallback não
    // usado por nenhum botão agora).
    const origBtn = document.createElement('button');
    origBtn.type = 'button'; origBtn.className = 'm3d-btn'; origBtn.style.cssText = 'width:100%; margin-top:4px;';
    origBtn.textContent = '⌖ Definir origem ▾';
    origBtn.onclick = (e) => {
      this.showFloatingMenuAt(state, e.currentTarget, [
        { label: '🎯 Centro de massa', run: () => { this._closeOrigemCustomPanel(state); ModelerInput.setOrigin(state, 'centroMassa'); } },
        { label: '⬇️ Centralizado (em baixo)', run: () => { this._closeOrigemCustomPanel(state); ModelerInput.setOrigin(state, 'centralizadoBaixo'); } },
        { label: '⬆️ Centralizado (em cima)', run: () => { this._closeOrigemCustomPanel(state); ModelerInput.setOrigin(state, 'centralizadoCima'); } },
        { label: '🔘 Vértice selecionado', run: () => { this._closeOrigemCustomPanel(state); ModelerInput.setOrigin(state, 'verticeSelecionado'); } },
        { label: '✏️ Personalizado — livre (x/y/z)', run: () => this._openOrigemCustomPanel(state, 'livre') },
        { label: '📐 Personalizado — sobre arestas/vértices (mouse)', run: () => this._openOrigemCustomPanel(state, 'picking') },
      ]);
    };
    const origemCustomWrap = document.createElement('div');
    origemCustomWrap.id = 'm3d-origem-custom-wrap';
    editBody.appendChild(dupBtn); editBody.appendChild(delBtn); editBody.appendChild(uniBtn); editBody.appendChild(origBtn); editBody.appendChild(origemCustomWrap);
    this._renderOrigemCustomPanel(state, origemCustomWrap);
    wrap.appendChild(editHead); wrap.appendChild(editBody);

    const histHead = document.createElement('div'); histHead.className = 'm3d-nf-collapsible-head';
    const histArrow = document.createElement('span'); histArrow.className = 'm3d-nf-collapsible-arrow';
    const histLbl = document.createElement('span'); histLbl.textContent = 'Histórico';
    histHead.appendChild(histArrow); histHead.appendChild(histLbl);
    const histBody = document.createElement('div'); histBody.className = 'm3d-nf-collapsible-body';
    const setHistCollapsed = (c) => { state._sidebarUI.historicoCollapsed = c; histBody.classList.toggle('collapsed', c); histArrow.textContent = c ? '▸' : '▾'; };
    histHead.onclick = () => setHistCollapsed(!state._sidebarUI.historicoCollapsed);
    setHistCollapsed(!!state._sidebarUI.historicoCollapsed);

    const histRow = document.createElement('div'); histRow.className = 'm3d-sidebar-histrow';
    const undoBtn = document.createElement('button'); undoBtn.type = 'button'; undoBtn.className = 'm3d-btn'; undoBtn.textContent = '↶ Desfazer';
    undoBtn.onclick = () => { ModelerInput.undo(state); this.renderSidebar(state.view3d); };
    const redoBtn = document.createElement('button'); redoBtn.type = 'button'; redoBtn.className = 'm3d-btn'; redoBtn.textContent = '↷ Refazer';
    redoBtn.onclick = () => { ModelerInput.redo(state); this.renderSidebar(state.view3d); };
    histRow.appendChild(undoBtn); histRow.appendChild(redoBtn);
    const histBtn = document.createElement('button');
    histBtn.type = 'button'; histBtn.className = 'm3d-btn'; histBtn.style.cssText = 'width:100%; margin-top:4px;';
    histBtn.textContent = '🕘 Histórico do Desfazer';
    histBtn.onclick = () => this.showHistoryModal(state);
    histBody.appendChild(histRow); histBody.appendChild(histBtn);
    wrap.appendChild(histHead); wrap.appendChild(histBody);

    // NOVO (07/09/2026), pedido verbatim: "ligar objetos separados como no
    // Blender. [...] deve ser possível agrupá-los para que, ao abrir o
    // Modelador para editá-los, seja possível modificar ambos." O
    // Modelador (mesh/gizmo/render/input, todos os outros arquivos deste
    // módulo) foi desenhado do início ao fim pra editar 1 malha de cada
    // vez (`state.obj`, ver modeler-core.js `enter()`) — reescrever pra
    // segurar VÁRIAS malhas simultâneas na mesma cena de edição seria uma
    // mudança de arquitetura grande demais pra fazer com segurança sem
    // navegador de teste real. Em vez disso, esta seção realiza "modificar
    // ambos" de um jeito honesto e seguro: lista os OUTROS membros do
    // grupo (Mapping.groupMembers, mesmo dado usado pelo painel 2D) com um
    // botão "Editar este" que SALVA a malha atual (Modeler3D.enter já faz
    // isso sozinho — reentrar chama `exit()` da sessão corrente primeiro,
    // ver modeler-core.js linha ~127) e abre o Modelador NO outro objeto,
    // sem sair da ferramenta — dá pra ir alternando entre os membros do
    // grupo, editando cada um, sem nunca "sair" do fluxo de edição.
    if (window.Mapping) {
      const membrosGrupo = Mapping.groupMembers(state.view3d._map, state.obj);
      if (state.obj.grupoId) {
        const grpHead = document.createElement('div'); grpHead.className = 'm3d-nf-collapsible-head';
        const grpArrow = document.createElement('span'); grpArrow.className = 'm3d-nf-collapsible-arrow';
        const grpLbl = document.createElement('span'); grpLbl.textContent = `Grupo (${membrosGrupo.length + 1} objetos)`;
        grpHead.appendChild(grpArrow); grpHead.appendChild(grpLbl);
        const grpBody = document.createElement('div'); grpBody.className = 'm3d-nf-collapsible-body';
        const setGrpCollapsed = (c) => { state._sidebarUI.grupoCollapsed = c; grpBody.classList.toggle('collapsed', c); grpArrow.textContent = c ? '▸' : '▾'; };
        grpHead.onclick = () => setGrpCollapsed(!state._sidebarUI.grupoCollapsed);
        setGrpCollapsed(!!state._sidebarUI.grupoCollapsed);
        if (!membrosGrupo.length) {
          const vazio = document.createElement('div'); vazio.style.cssText = 'font-size:11.5px; color:var(--m3d-text-dim,#9aa)'; vazio.textContent = 'Nenhum outro membro (grupo com 1 objeto só).';
          grpBody.appendChild(vazio);
        }
        membrosGrupo.forEach((sib) => {
          const row = document.createElement('div'); row.style.cssText = 'display:flex; align-items:center; gap:4px; margin-top:4px';
          const nomeSpan = document.createElement('span'); nomeSpan.style.cssText = 'flex:1; font-size:11.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap'; nomeSpan.textContent = `🔗 ${sib.nome || sib.tipo || '(objeto)'}`;
          const editBtn = document.createElement('button'); editBtn.type = 'button'; editBtn.className = 'm3d-btn'; editBtn.style.cssText = 'flex:none; padding:2px 8px; font-size:11px';
          editBtn.textContent = 'Editar este';
          editBtn.title = 'Salva o objeto atual e passa a editar este outro membro do grupo, sem sair do Modelador.';
          editBtn.onclick = () => window.Modeler3D.enter(state.view3d, sib);
          row.appendChild(nomeSpan); row.appendChild(editBtn);
          grpBody.appendChild(row);
        });
        wrap.appendChild(grpHead); wrap.appendChild(grpBody);
      }
    }

    // NOVO (03/09/2026), pedido verbatim: o botão "➕ Adicionar" (barra de
    // cima, modo Edição) e o "Remover:" (Excluir/Mesclar/Remover Duplicados)
    // saem da barra de cima e passam a morar aqui, numa seção recolhível
    // própria "Ferramentas de malha", dentro da aba vertical "Ferramentas" —
    // "Adicionar" vira uma seção com os botões que antes estavam dentro do
    // menu flutuante do "+Adicionar" (Extrudar/Inset/Criar Aresta-Face/
    // Subdividir/Duplicar/Excluir), agora em botões diretos (sem dropdown);
    // "Remover" (logo abaixo de "Adicionar", mesma seção recolhível) mantém
    // os 3 botões como já eram (Excluir/Mesclar continuam abrindo seus
    // próprios submenus flutuantes — "seus botões" no pedido do usuário se
    // refere aos 3 botões como já existiam, só mudando de lugar). Os botões
    // que restaram na barra de cima (modo/gizmo/seleção/câmera) foram
    // reposicionados perto do "Mirar" da hotbar — ver comentário grande em
    // `build()` e o CSS de `.m3d-toolbar` em modeler3d.css.
    const meshHead = document.createElement('div'); meshHead.className = 'm3d-nf-collapsible-head';
    const meshArrow = document.createElement('span'); meshArrow.className = 'm3d-nf-collapsible-arrow';
    const meshLbl = document.createElement('span'); meshLbl.textContent = 'Ferramentas de malha';
    meshHead.appendChild(meshArrow); meshHead.appendChild(meshLbl);
    const meshBody = document.createElement('div'); meshBody.className = 'm3d-nf-collapsible-body';
    const setMeshCollapsed = (c) => { state._sidebarUI.malhaCollapsed = c; meshBody.classList.toggle('collapsed', c); meshArrow.textContent = c ? '▸' : '▾'; };
    meshHead.onclick = () => setMeshCollapsed(!state._sidebarUI.malhaCollapsed);
    setMeshCollapsed(!!state._sidebarUI.malhaCollapsed); // por padrão expandida, mesmo espírito de "Editar" acima

    const addLbl = document.createElement('div'); addLbl.className = 'm3d-row-label'; addLbl.textContent = 'Adicionar';
    meshBody.appendChild(addLbl);
    const addItens = [
      ['⬆️ Extrudar (E)', () => ModelerInput.triggerExtrude(state)],
      ['⬜ Inset Faces (I)', () => ModelerInput.triggerInset(state)],
      ['📐 Criar Aresta/Face (F)', () => ModelerInput.triggerMakeEdgeFace(state)],
      ['🔳 Subdividir', () => ModelerInput.triggerSubdivide(state)],
      ['📋 Duplicar (Shift+D)', () => ModelerInput.triggerDuplicate(state)],
      ['🗑️ Excluir (X)', (e) => ModelerInput.openRemoveMenu(state, e.currentTarget)],
    ];
    addItens.forEach(([label, fn], i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'm3d-btn'; b.style.cssText = `width:100%;${i ? ' margin-top:4px;' : ''}`;
      b.textContent = label;
      b.onclick = (e) => fn(e);
      meshBody.appendChild(b);
    });

    const removeLbl = document.createElement('div'); removeLbl.className = 'm3d-row-label'; removeLbl.style.marginTop = '8px'; removeLbl.textContent = 'Remover';
    meshBody.appendChild(removeLbl);
    const removeExclBtn = document.createElement('button');
    removeExclBtn.type = 'button'; removeExclBtn.className = 'm3d-btn'; removeExclBtn.style.width = '100%';
    removeExclBtn.textContent = '🗑️ Excluir ▾';
    removeExclBtn.onclick = (e) => ModelerInput.openRemoveMenu(state, e.currentTarget);
    const removeMergeBtn = document.createElement('button');
    removeMergeBtn.type = 'button'; removeMergeBtn.className = 'm3d-btn'; removeMergeBtn.style.cssText = 'width:100%; margin-top:4px;';
    removeMergeBtn.textContent = '🔗 Mesclar ▾';
    removeMergeBtn.onclick = (e) => ModelerInput.openMergeMenu(state, e.currentTarget);
    const removeDoublesBtn = document.createElement('button');
    removeDoublesBtn.type = 'button'; removeDoublesBtn.className = 'm3d-btn'; removeDoublesBtn.style.cssText = 'width:100%; margin-top:4px;';
    removeDoublesBtn.title = 'Funde vértices coincidentes/quase coincidentes (da seleção, ou da malha inteira se nada estiver selecionado)';
    removeDoublesBtn.textContent = '✨ Remover Duplicados';
    removeDoublesBtn.onclick = () => ModelerInput.triggerRemoveDoubles(state);
    meshBody.appendChild(removeExclBtn); meshBody.appendChild(removeMergeBtn); meshBody.appendChild(removeDoublesBtn);

    wrap.appendChild(meshHead); wrap.appendChild(meshBody);

    return wrap;
  },

  // [09/09/2026] NOVO — painel inline de "Personalizado (x/y/z)" (ver
  // comentário grande em `_buildFerramentasPanel`, no botão "Definir
  // origem"). `state._origemCustomUI = { active, mode:'livre'|'picking',
  // accum:[x,y,z], fieldsApi }` guarda o estado (não no DOM — o sidebar
  // inteiro é reconstruído do zero a cada `renderSidebar`, mesmo espírito de
  // `state._npanelUI`/`state._sidebarUI` já usados aqui).
  //
  // `accum` é a peça chave pra fazer o ARRASTO ao vivo (clicar e arrastar o
  // botão do meio de cada campo, "o número vai alterando", pedido verbatim)
  // funcionar apesar de `ModelerInput.setOrigin` operar sempre em cima do
  // espaço LOCAL ATUAL (que muda de referência a cada chamada — vira 0,0,0
  // no ponto que acabou de virar a nova origem): `accum` lembra, na
  // referência ORIGINAL (de quando o painel abriu), pra onde a origem já foi
  // movida até agora — cada novo commit de um eixo manda pra `setOrigin` só
  // o DELTA entre o alvo novo e `accum` (não o valor absoluto do campo), e
  // depois atualiza `accum` pro alvo novo. Sem isso, arrastar o campo X
  // depois de já ter mudado Y produziria um deslocamento errado (a
  // referência de "local" already teria mudado pelo commit do Y).
  _openOrigemCustomPanel(state, mode) {
    state._origemCustomUI = { active: true, mode, accum: [0, 0, 0], fieldsApi: null };
    if (mode === 'picking') ModelerInput.enterOriginPickMode(state);
    else ModelerInput.exitOriginPickMode(state); // garante que uma sessão de picking anterior não fique "presa" ligada
    this.renderSidebar(state.view3d);
  },

  _closeOrigemCustomPanel(state) {
    if (state._origemCustomUI) state._origemCustomUI.active = false;
    ModelerInput.exitOriginPickMode(state);
  },

  /** Preenche `wrap` (`#m3d-origem-custom-wrap`, filho fixo de `editBody`,
   *  logo abaixo do botão "⌖ Definir origem ▾") com os 3 campos x/y/z — só
   *  quando `state._origemCustomUI.active`; vazio (nada aparece) o resto do
   *  tempo, exatamente o "logo em baixo do botão de 'definir origem', deve
   *  aparecer, três campos" só quando "estiver em 'Personalizado (x/y/z)'"
   *  (pedido verbatim). Reaproveita `_buildGroup`/`_createNumField` — o
   *  MESMO widget de 3 botões (seta◄ clique decrementa / meio clica-edita
   *  ou arrasta-varia / seta► clique incrementa) da seção "Transformação" >
   *  "Posição" (ver `_buildObjectTransformPanel`), pedido verbatim: "cada
   *  campo deve ser do mesmo jeito que é no botão lateral direito em
   *  'Propriedades', em 'Transformação'". */
  _renderOrigemCustomPanel(state, wrap) {
    wrap.innerHTML = '';
    const ui = state._origemCustomUI;
    if (!ui || !ui.active) return;
    wrap.style.cssText = 'margin-top:6px; padding:6px; border:1px dashed var(--m3d-border, #3a4a5c); border-radius:6px;';
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px; color:var(--m3d-text-dim,#9aa); margin-bottom:4px;';
    hint.textContent = ui.mode === 'picking'
      ? '📐 Passe o mouse sobre as arestas do objeto (segure Shift pra dar snap) e clique pra definir a origem ali — ou digite/arraste os campos abaixo.'
      : '✏️ Digite ou clique-e-arraste os campos abaixo pra mover a origem livremente.';
    wrap.appendChild(hint);

    const acc = ui.accum;
    const group = this._buildGroup('Origem:', [
      { axis: 'x', value: acc[0], step: 0.01, minDecimals: 4, onCommit: (v) => this._commitOrigemCustomAxis(state, 0, v) },
      { axis: 'y', value: acc[1], step: 0.01, minDecimals: 4, onCommit: (v) => this._commitOrigemCustomAxis(state, 1, v) },
      { axis: 'z', value: acc[2], step: 0.01, minDecimals: 4, onCommit: (v) => this._commitOrigemCustomAxis(state, 2, v) },
    ]);
    wrap.appendChild(group.el);
    ui.fieldsApi = group;

    if (ui.mode === 'picking') {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button'; cancelBtn.className = 'm3d-btn'; cancelBtn.style.cssText = 'width:100%; margin-top:4px;';
      cancelBtn.textContent = '✕ Sair do modo "escolher com o mouse"';
      cancelBtn.onclick = () => { ModelerInput.exitOriginPickMode(state); ui.mode = 'livre'; this.renderSidebar(state.view3d); };
      wrap.appendChild(cancelBtn);
    }
  },

  /** Confirma um NOVO valor (`v`, na referência ORIGINAL de quando o painel
   *  abriu) pro eixo `axisIdx` (0=x/1=y/2=z) — ver comentário grande em
   *  `_openOrigemCustomPanel` pro porquê do cálculo de delta via `accum`. */
  // LIMITAÇÃO CONHECIDA (documentada, não testada num navegador de verdade):
  // `ModelerInput.setOrigin` empurra 1 entrada de undo
  // (`ModelerMesh.pushUndo`) a CADA chamada seguida (sem debounce) —
  // arrastar (clicar-e-segurar) um destes 3 campos por muito tempo pode
  // acumular várias entradas de "Definir origem" seguidas no histórico
  // (Ctrl+Z desfaz em vários passos pequenos em vez de 1 só). Mesmo espírito
  // dos outros campos de arrasto contínuo deste painel (nenhum deles faz
  // debounce de undo hoje) — não é uma regressão introduzida aqui, só uma
  // limitação que já existia no padrão de arrasto reaproveitado.
  _commitOrigemCustomAxis(state, axisIdx, v) {
    const ui = state._origemCustomUI;
    if (!ui) return;
    const alvo = ui.accum.slice();
    alvo[axisIdx] = v;
    const delta = [alvo[0] - ui.accum[0], alvo[1] - ui.accum[1], alvo[2] - ui.accum[2]];
    // [09/09/2026] Bug relatado pelo usuário: "ao variar os valores da
    // origem pelo clicar e arrastar nas entradas de valor que tem ali, uma
    // enchurrada de notificações apareceram ('A origem já está neste
    // ponto')." Causa raiz: este método é o `onCommit` chamado a CADA
    // "tick" do arrasto contínuo (clicar-e-segurar sobre o campo, ver
    // `_buildGroup`/o widget de arrasto reaproveitado por estes 3 campos),
    // não só ao soltar — e `delta` aqui é a variação DESDE O ÚLTIMO tick,
    // não a origem nova em si. Como o arrasto dispara MUITO mais ticks do
    // que mudanças de valor visíveis (o campo arredonda pro passo/decimais
    // configurados, `step:0.01`/`minDecimals:4` acima), boa parte dos
    // ticks chega aqui com `delta` EXATAMENTE [0,0,0] (nenhuma mudança de
    // verdade desde o tick anterior) — e `ModelerInput.setOrigin` trata
    // QUALQUER `P` igual a [0,0,0] como "a origem já está nesse ponto"
    // (guarda pensada pro caso de verdade: escolher um modo/confirmar um
    // valor cujo alvo já é a origem atual — ver o guard lá, mantido
    // intacto pros outros chamadores: os botões "Centro de massa"/
    // "Centralizado"/"Vértice selecionado" e o prompt() de fallback,
    // sempre com um ALVO absoluto, nunca um delta de arrasto). Aqui, um
    // delta zero é só um tick "sem novidade" do arrasto — nunca deveria
    // nem chegar a `setOrigin` (que faria `pushUndo`/mostraria o toast à
    // toa), então corta ANTES, sem chamar nada — resolve a enchurrada de
    // toasts de uma vez, sem tocar no guard genérico (que continua válido
    // e necessário pros outros chamadores).
    if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) { ui.accum = alvo; return; }
    ModelerInput.setOrigin(state, 'personalizado', { x: delta[0], y: delta[1], z: delta[2] });
    ui.accum = alvo;
  },

  /** NÃO USADA MAIS por nenhum botão (09/09/2026) — substituída pelo painel
   *  inline `_renderOrigemCustomPanel` (3 campos estilo "Transformação", em
   *  vez de 3 `prompt()` em sequência). Mantida aqui só como referência/
   *  fallback, sem nada ligado a ela. "Definir origem" > "Personalizado" —
   *  pedido verbatim original: "nessa é possível mudar a posição pelas
   *  propriedades: x, y e z, para definir qual será a origem do objeto."
   *  Ponto em espaço LOCAL do objeto (mesma referência dos vértices em
   *  `state.cm.vertices`), não em metros do mapa. Cancelar qualquer um dos
   *  3 campos cancela a operação inteira (nenhuma alteração parcial). */
  _promptOrigemPersonalizada(state) {
    const xs = prompt('Nova origem — X (posição local, mesmo espaço dos vértices):', '0');
    if (xs == null) return;
    const ys = prompt('Nova origem — Y (posição local):', '0');
    if (ys == null) return;
    const zs = prompt('Nova origem — Z (posição local):', '0');
    if (zs == null) return;
    const x = parseFloat(String(xs).replace(',', '.'));
    const y = parseFloat(String(ys).replace(',', '.'));
    const z = parseFloat(String(zs).replace(',', '.'));
    if ([x, y, z].some((n) => isNaN(n))) { Utils.toast?.('Valor inválido — a origem não foi alterada.', { type: 'warn' }); return; }
    ModelerInput.setOrigin(state, 'personalizado', { x, y, z });
  },

  /** Aba "Criar": seção "Adicionar Primitiva" (3 grupos de botões, imagem de
   *  referência do usuário) + região de Propriedades com scroll embaixo
   *  ("Propriedades como posição, rotação, raio, vértices (se aplicável)
   *  ficam na parte de baixo do submenu em uma região com scroll" — pedido
   *  verbatim). */
  _buildCriarPanel(state) {
    const wrap = document.createElement('div');
    wrap.className = 'm3d-sidebar-tabcontent m3d-sidebar-tabcontent-criar';

    const head = document.createElement('div'); head.className = 'm3d-nf-collapsible-head';
    const arrow = document.createElement('span'); arrow.className = 'm3d-nf-collapsible-arrow';
    const lbl = document.createElement('span'); lbl.textContent = 'Adicionar Primitiva';
    head.appendChild(arrow); head.appendChild(lbl);
    const body = document.createElement('div'); body.className = 'm3d-nf-collapsible-body';
    const setCollapsed = (c) => { state._sidebarUI.primitivaCollapsed = c; body.classList.toggle('collapsed', c); arrow.textContent = c ? '▸' : '▾'; };
    head.onclick = () => setCollapsed(!state._sidebarUI.primitivaCollapsed);
    setCollapsed(!!state._sidebarUI.primitivaCollapsed);

    [{ key: 'mesh', label: 'Mesh' }, { key: 'lampada', label: 'Lâmpada' }, { key: 'outros', label: 'Outros' }].forEach((grupo) => {
      const glabel = document.createElement('div'); glabel.className = 'm3d-nf-grouplabel'; glabel.textContent = grupo.label + ':';
      const grid = document.createElement('div'); grid.className = 'm3d-sidebar-btngrid';
      PRIMITIVE_CATALOG[grupo.key].forEach((entry) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'm3d-btn m3d-sidebar-primbtn'; b.title = entry.label;
        b.innerHTML = '<span class="m3d-sidebar-primicon">' + entry.icone + '</span><span>' + entry.label + '</span>';
        b.onclick = () => {
          state._lastPrimitiveCatalog = entry;
          ModelerInput.criarPrimitiva(state, entry.gerar, { ...entry.defaultParams }, entry.label);
          // NOVO (02/09/2026) — ver comentário grande em PRIMITIVE_CATALOG.
          // lampada, acima. Só os 5 marcadores do grupo "Lâmpada" têm
          // `entry.luz`; Mesh/Outros seguem sem nenhuma luz de verdade
          // (nunca fizeram parte deste pedido).
          if (entry.luz) ModelerInput._colocarLuzDaLampada(state, entry.luz);
        };
        grid.appendChild(b);
      });
      body.appendChild(glabel); body.appendChild(grid);
    });
    // Altura salva de uma sessão de arrasto anterior (ver `_wireCriarDivider`
    // abaixo) — aplicada de novo a cada remontagem do painel (troca de aba e
    // volta, etc.), senão o ajuste do usuário se perderia a cada re-render.
    if (state._sidebarUI.primitivaHeightPx != null) {
      body.style.flex = '0 0 auto';
      body.style.height = state._sidebarUI.primitivaHeightPx + 'px';
    }
    wrap.appendChild(head); wrap.appendChild(body);

    // NOVO (01/09/2026), pedido verbatim (item 10 da rodada de 13 itens):
    // "Para o menu lateral 'Criar', uma linha divisória entre as seções
    // 'Adicionar primitiva' e 'objeto criado' deve ser posta. Clicando e
    // arrastando ela, redimensiona a divisão vertical do menu." — ver CSS
    // `.m3d-sidebar-divider` (modeler3d.css) pro visual/cursor, e
    // `_wireCriarDivider` logo abaixo pro arrasto em si. Só existe entre as
    // duas seções quando "Adicionar Primitiva" está EXPANDIDA (recolhida,
    // não há o que redimensionar — a divisória some junto, sem deixar uma
    // linha "morta" flutuando colada no cabeçalho).
    if (!state._sidebarUI.primitivaCollapsed) {
      const divider = document.createElement('div');
      divider.className = 'm3d-sidebar-divider';
      divider.id = 'm3d-sidebar-divider';
      divider.title = 'Arraste pra redimensionar';
      wrap.appendChild(divider);
      this._wireCriarDivider(state, divider, body, wrap);
    }

    const propsWrap = document.createElement('div');
    propsWrap.className = 'm3d-sidebar-props';
    propsWrap.id = 'm3d-sidebar-props';
    wrap.appendChild(propsWrap);
    this._renderCreateProps(state, propsWrap); // já preenche na 1ª montagem — `propsWrap` ainda não está anexado ao DOM aqui, por isso o alvo é passado direto (ver comentário em `_renderCreateProps`)

    return wrap;
  },

  /** Arrasto da divisória entre "Adicionar Primitiva" e "Propriedades" (ver
   *  chamada acima) — mesmo espírito de `_createNumField` (mousedown/
   *  mousemove/mouseup no `document`, não só no próprio elemento, pra não
   *  perder o arrasto se o cursor sair da faixa fina da divisória no meio do
   *  movimento). `body` (a seção "Adicionar Primitiva") ganha uma altura
   *  FIXA em pixels, calculada a partir da altura ATUAL dela no momento do
   *  mousedown + o deslocamento vertical do mouse — `propsWrap`, com
   *  `flex:1` (CSS, inalterado), sempre absorve o espaço que sobra, então
   *  redimensionar uma seção automaticamente redimensiona a outra ao
   *  contrário, sem precisar calcular a altura das duas. Clamps: nunca menor
   *  que 40px (ainda dá pra ver o cabeçalho "Mesh:"/1 linha de botões) nem
   *  maior que a altura do painel inteiro menos ~80px (deixa sempre uma
   *  fresta mínima pra "Propriedades" + a própria divisória, mesmo
   *  arrastando até o fim). */
  _wireCriarDivider(state, divider, body, wrap) {
    let startY = 0, startH = 0, dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const wrapH = wrap.getBoundingClientRect().height;
      const maxH = Math.max(40, wrapH - 80);
      const h = Utils.clamp(startH + (y - startY), 40, maxH);
      body.style.flex = '0 0 auto';
      body.style.height = h + 'px';
      state._sidebarUI.primitivaHeightPx = h;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      divider.classList.remove('m3d-sidebar-divider-dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
    const onDown = (e) => {
      dragging = true;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      startH = body.getBoundingClientRect().height;
      divider.classList.add('m3d-sidebar-divider-dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      e.preventDefault();
    };
    divider.addEventListener('mousedown', onDown);
    divider.addEventListener('touchstart', onDown, { passive: false });
  },

  /** Preenche a região de Propriedades (aba "Criar") com os campos da última
   *  primitiva inserida/ajustada (`state._lastPrimitive` — ver
   *  `ModelerInput._colocarPrimitiva`). `targetEl` opcional: passado direto
   *  por `_buildCriarPanel` na 1ª montagem (ainda não anexado ao DOM de
   *  verdade, então `querySelector` não o encontraria); chamadas
   *  POSTERIORES (edição de campo, toggle do Torus, `updateCreateProps`
   *  chamado de fora — ver modeler-input.js) omitem e caem no
   *  `querySelector`, já com o elemento anexado de verdade.
   *  CORRIGIDO (03/09/2026) — o sidebar agora é permanente em
   *  `view3d._container` (ver comentário grande acima de `_sidebarCtx`),
   *  não mais recriado dentro de `state.rootEl` a cada sessão. */
  _renderCreateProps(state, targetEl) {
    const wrap = targetEl || state.view3d?._container?.querySelector('#m3d-sidebar-props');
    if (!wrap) return;
    wrap.innerHTML = '';
    const lp = state._lastPrimitive;
    const entry = lp ? state._lastPrimitiveCatalog : null;
    if (!lp || !entry) {
      wrap.innerHTML = '<div class="m3d-sidebar-props-empty">Clique em uma primitiva acima pra inserir e editar suas propriedades aqui (posição/raio/vértices/etc.).</div>';
      return;
    }
    const title = document.createElement('div'); title.className = 'm3d-nf-grouplabel'; title.textContent = entry.label + ':';
    wrap.appendChild(title);

    entry.params.forEach((fieldCfg) => {
      if (fieldCfg.isText) {
        // "Texto" é uma string, não um número — campo de texto simples em
        // vez do widget `_createNumField` (que só entende número).
        const row = document.createElement('div'); row.className = 'm3d-sidebar-textfield';
        const flbl = document.createElement('label'); flbl.textContent = fieldCfg.label + ':';
        const inp = document.createElement('input');
        inp.type = 'text'; inp.value = lp.params[fieldCfg.key] != null ? lp.params[fieldCfg.key] : fieldCfg.value;
        inp.addEventListener('change', () => ModelerInput.ajustarUltimaPrimitiva(state, { [fieldCfg.key]: inp.value }));
        inp.addEventListener('mousedown', (ev) => ev.stopPropagation());
        row.appendChild(flbl); row.appendChild(inp);
        wrap.appendChild(row);
        return;
      }
      const val = lp.params[fieldCfg.key] != null ? lp.params[fieldCfg.key] : fieldCfg.value;
      const field = this._createNumField({
        label: fieldCfg.label + ':',
        value: val,
        step: fieldCfg.step,
        minDecimals: fieldCfg.minDecimals != null ? fieldCfg.minDecimals : 3,
        onCommit: (v) => ModelerInput.ajustarUltimaPrimitiva(state, { [fieldCfg.key]: fieldCfg.minDecimals === 0 ? Math.max(1, Math.round(v)) : v }),
      });
      wrap.appendChild(field.el);
    });

    // Par especial de raios do Torus — "Um botão de toggle para definir os
    // raios, um par de botões: principal/secundário ou exterior/interior.
    // Ficando raio principal = 1, raio secundário = 0.5 ou raio externo =
    // 'valor' [...] e raio interno = 'valor'" (pedido verbatim). O valor
    // CANÔNICO guardado em `lp.params` continua sendo sempre
    // raioMaior/raioMenor (é o que `torusMesh` espera) — o modo
    // "externo/interno" só MOSTRA/EDITA esses mesmos 2 números através de
    // outra conta (externo = maior+menor, interno = maior-menor).
    if (entry.torusRadii) {
      const modo = state._torusRadiusMode || 'principal';
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button'; toggleBtn.className = 'm3d-btn'; toggleBtn.style.cssText = 'width:100%; margin:2px 0 4px;';
      toggleBtn.textContent = modo === 'principal' ? '🔁 Raios: Principal / Secundário' : '🔁 Raios: Externo / Interno';
      toggleBtn.onclick = () => { state._torusRadiusMode = modo === 'principal' ? 'externo' : 'principal'; this._renderCreateProps(state); };
      wrap.appendChild(toggleBtn);

      const raioMaior = lp.params.raioMaior != null ? lp.params.raioMaior : 1;
      const raioMenor = lp.params.raioMenor != null ? lp.params.raioMenor : 0.5;
      if (modo === 'principal') {
        wrap.appendChild(this._createNumField({
          label: 'Principal:', value: raioMaior, step: 0.05, minDecimals: 3,
          onCommit: (v) => ModelerInput.ajustarUltimaPrimitiva(state, { raioMaior: v }),
        }).el);
        wrap.appendChild(this._createNumField({
          label: 'Secundário:', value: raioMenor, step: 0.05, minDecimals: 3,
          onCommit: (v) => ModelerInput.ajustarUltimaPrimitiva(state, { raioMenor: v }),
        }).el);
      } else {
        const externo = raioMaior + raioMenor, interno = raioMaior - raioMenor;
        wrap.appendChild(this._createNumField({
          label: 'Externo:', value: externo, step: 0.05, minDecimals: 3,
          onCommit: (novoExt) => { const i = raioMaior - raioMenor; ModelerInput.ajustarUltimaPrimitiva(state, { raioMaior: (novoExt + i) / 2, raioMenor: (novoExt - i) / 2 }); },
        }).el);
        wrap.appendChild(this._createNumField({
          label: 'Interno:', value: interno, step: 0.05, minDecimals: 3,
          onCommit: (novoInt) => { const ext = raioMaior + raioMenor; ModelerInput.ajustarUltimaPrimitiva(state, { raioMaior: (ext + novoInt) / 2, raioMenor: (ext - novoInt) / 2 }); },
        }).el);
      }
    }
  },

  /** Chamado por `ModelerInput._colocarPrimitiva` (via `?.`, opcional) toda
   *  vez que uma primitiva é inserida/ajustada — só redesenha de verdade
   *  quando a aba "Criar" está aberta e visível (senão o painel nem existe
   *  no DOM ainda / não é a aba ativa), evitando trabalho à toa a cada
   *  arraste de campo. */
  updateCreateProps(state) {
    const panel = state.view3d?._container?.querySelector('#m3d-sidebar-panel');
    if (!panel || !panel.classList.contains('open') || state._sidebarTab !== 'criar') return;
    this._renderCreateProps(state);
  },

  /** Modal "histórico do Desfazer" — "Todo o histórico do 3D aparece (uso de
   *  ferramentas, edições, modelagens, criação, exclusão, alteração
   *  individual de posição, rotação e escala, etc. Ou seja, todas as ações
   *  do app no 3D)" (pedido verbatim) — lista `state.actionLog`
   *  (`ModelerMesh._logAction`), mais recente no topo (mesma convenção do
   *  próprio Blender). */
  showHistoryModal(state) {
    document.querySelectorAll('.m3d-history-modal-overlay').forEach((m) => m.remove());
    const overlay = document.createElement('div');
    overlay.className = 'm3d-history-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    const modal = document.createElement('div');
    modal.className = 'm3d-history-modal';
    const head = document.createElement('div'); head.className = 'm3d-history-modal-head';
    const htitle = document.createElement('span'); htitle.textContent = '🕘 Histórico do Desfazer';
    const closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'm3d-btn'; closeBtn.textContent = '✕';
    closeBtn.onclick = () => overlay.remove();
    head.appendChild(htitle); head.appendChild(closeBtn);
    const list = document.createElement('div'); list.className = 'm3d-history-modal-list';
    const log = state.actionLog || [];
    if (!log.length) {
      list.innerHTML = '<div style="color:#9fb3c8; padding:8px;">Nenhuma ação registrada ainda nesta sessão.</div>';
    } else {
      [...log].reverse().forEach((entry, i) => {
        const row = document.createElement('div'); row.className = 'm3d-history-row';
        const hora = new Date(entry.timestamp).toLocaleTimeString('pt-BR');
        const idxSpan = document.createElement('span'); idxSpan.className = 'm3d-history-idx'; idxSpan.textContent = String(log.length - i);
        const lblSpan = document.createElement('span'); lblSpan.className = 'm3d-history-label'; lblSpan.textContent = entry.label || 'Ação';
        const timeSpan = document.createElement('span'); timeSpan.className = 'm3d-history-time'; timeSpan.textContent = hora;
        row.appendChild(idxSpan); row.appendChild(lblSpan); row.appendChild(timeSpan);
        list.appendChild(row);
      });
    }
    modal.appendChild(head); modal.appendChild(list);
    overlay.appendChild(modal);
    state.rootEl.appendChild(overlay);
  },

  // ---------- Painel N (Posição/Rotação/Escala/Dimensão) ----------
  //
  // Pedido do usuário (rodada seguinte, com 2 screenshots do painel
  // "Transform" do Blender como referência): os campos numéricos (antes
  // `<input type="number">` simples) viram um widget customizado estilo
  // Blender — ver `_createNumField` (o componente em si) e `_buildGroup`
  // (agrupa X/Y/Z empilhados verticalmente com o rótulo da seção acima,
  // tipo "Location:"/"Rotation:" no Blender). Também pedido: dentro do
  // painel recolhível "Propriedades" (já existia), um sub-painel recolhível
  // "Transformação" agrupando as 4 seções (Posição/Rotação/Escala/
  // Dimensões) — ver `_buildObjectTransformPanel`. O estado (recolhido ou
  // não) é guardado em `state._npanelUI` (não no DOM), já que `updateNPanel`
  // reconstrói a árvore inteira a cada chamada (troca de modo, confirmação
  // de edição etc.) — sem isso o sub-painel "esqueceria" que foi recolhido
  // toda vez que um valor fosse confirmado.

  /** Formata o valor exibido (fora de edição) de um campo numérico —
   *  pedido do usuário, com exemplo concreto: número guardado
   *  '3.123456789', exibição (fora de foco) fica '3.12345' — ou seja, modo
   *  'fixed' (Posição/Escala/Dimensões) SEMPRE mostra exatamente
   *  `cfg.minDecimals` casas decimais (arredondando se o valor guardado
   *  tiver mais, completando com zero à direita se tiver menos — é
   *  simplesmente `toFixed(N)`; a precisão TOTAL continua guardada por
   *  baixo, só a EXIBIÇÃO é limitada). O "vai até o limite da precisão do
   *  JavaScript" do pedido do usuário vale pro modo de EDIÇÃO (o valor
   *  CRU, sem essa formatação — ver `startEdit`), não pra exibição fora de
   *  foco. Modo 'rotation' segue a regra própria pedida: inteiro → sem
   *  casa decimal ('1d'), 1 casa → '1d.1d', 2 OU MAIS casas → sempre 2
   *  ('1d.2d') — mais o sufixo (ex. '°'), ficando por exemplo '-3.12°'. */
  /** Pedido do usuário (correção): "Quando o número for negativo, o '-'
   *  deve permanecer ao clicar em cima do botão da propriedade." Causa
   *  raiz identificada: `Number.prototype.toFixed` (usado aqui pra
   *  formatar) tem uma peculiaridade documentada do próprio JavaScript —
   *  ele decide se põe o "-" checando `x < 0`, e `-0 < 0` é FALSO em
   *  JavaScript (`-0` e `0` comparam como iguais) — então qualquer valor
   *  que vire exatamente `-0` (ex.: `parseFloat('-0.000000')`, que pode
   *  acontecer depois de arredondar um valor bem pertinho de zero, ver
   *  `commit` abaixo) perde o sinal na exibição, MESMO sendo o resultado
   *  de uma conta que começou negativa — e é exatamente isso que fazia
   *  parecer que clicar em "aumentar"/"diminuir" invertia a direção
   *  (relatado à parte, na Posição X: sem o "-", "-2.50" vira "2.50" e
   *  "-2.49" vira "2.49" — uma sequência que PARECE estar diminuindo,
   *  quando na verdade aumentou). Corrigido extraindo o sinal ANTES de
   *  chamar `toFixed` (só no valor ABSOLUTO), montando o "-" na mão — assim
   *  nunca depende da regrinha `x < 0` do `toFixed` pra decidir mostrar o
   *  sinal. */
  _formatNumField(v, cfg) {
    const neg = v < 0;
    const abs = Math.abs(v);
    let out;
    if (cfg.formatMode === 'rotation') {
      const s = String(abs);
      const dot = s.indexOf('.');
      const decimals = dot === -1 ? 0 : s.length - dot - 1;
      out = abs.toFixed(decimals === 0 ? 0 : decimals === 1 ? 1 : 2);
    } else {
      const min = cfg.minDecimals != null ? cfg.minDecimals : 3;
      out = abs.toFixed(min);
    }
    return (neg ? '-' : '') + out + (cfg.suffix || '');
  },

  /** O widget em si — um campo numérico estilo Blender. Pedido do usuário,
   *  bem detalhado (e ajustado numa rodada seguinte de correções):
   *  - Fora de foco: mostra rótulo (ex. "X:") à esquerda e valor formatado
   *    (`_formatNumField`) à direita, com "botões" seta SEMPRE VISÍVEIS
   *    (pedido de correção: "não só no hover, como é atualmente") nas
   *    extremidades INTERNAS do retângulo (decremento à esquerda,
   *    incremento à direita) — cada seta é um TRIÂNGULO ISÓSCELES pequeno
   *    (pedido de correção: "devem ser triângulos isósceles e devem ser
   *    menores como no Blender" — ver `.m3d-nf-arrow-l/r::before` em
   *    css/modeler3d.css, borda-triângulo simétrica, não mais
   *    `clip-path` escaleno).
   *  - Clicar (no SOLTAR o botão esquerdo, não no pressionar — pedido
   *    explícito) na seta ESQUERDA diminui, na seta DIREITA aumenta
   *    (`cfg.step`). Clicar no meio (fora das duas zonas) entra em modo de
   *    edição: substitui o rótulo+valor por um `<input>` de texto com o
   *    valor CRU (sem formatação/sufixo), focado e selecionado.
   *  - Clicar e ARRASTAR (em qualquer parte do retângulo, não só nas
   *    setas): entra num ajuste contínuo — mover o cursor pra esquerda
   *    diminui, pra direita aumenta, `PX_PER_STEP` pixels arrastados = 1
   *    `cfg.step`. Usa Pointer Lock (`requestPointerLock`, mesma técnica já
   *    usada no G/R/S do Modelador em modeler-input.js) pra dar o "cursor
   *    infinito" pedido — arrastar não esbarra na borda da tela. Cursor
   *    (pedido de correção): seta padrão o tempo todo, só vira "redimensionar"
   *    (`ew-resize`) DURANTE o arraste — ver `.dragging` em CSS.
   *  - O hover (fundo mais claro) afeta o retângulo INTEIRO de uma vez,
   *    sem destaque diferente pras zonas das setas (CSS `:hover`, não JS).
   *    Ao pressionar o botão (`.m3d-nf-pressed`) ou durante a edição
   *    (`.editing`), fica mais ESCURO (pedido de correção: "deve ficar
   *    levemente escurecido para mostrar visualmente que houve interação").
   *  cfg: { label, value, step, minDecimals, formatMode:'fixed'|'rotation',
   *  suffix, onCommit(novoValor) }. Retorna { el, setValue(v) } —
   *  `setValue` só atualiza o texto exibido (sem chamar `onCommit`), usado
   *  quando OUTRO campo do mesmo grupo muda o valor deste (ex.: editar
   *  Dimensão recalcula e precisa refletir na Escala, e vice-versa, sem
   *  reconstruir o painel inteiro no meio de um arraste). */
  _createNumField(cfg) {
    // Pedido do usuário (ajustes em cima do primeiro envio): "as setas
    // devem ser triângulos ISÓSCELES e devem ser menores como no Blender.
    // E devem ficar VISÍVEIS (não só no hover, como é atualmente)".
    //
    // Pedido do usuário (rodada seguinte, sobre um bug ainda não resolvido:
    // "o botão da esquerda deve diminuir... o da direita deve aumentar...
    // Alguns botões ficam com a lógica invertida... Vi que você implementou
    // com divs em vez de buttons. Um evento onclick por cada uma dessas
    // divs acredito que resolveria isso."): a versão anterior detectava em
    // qual seta o clique caiu calculando a posição X do SOLTAR do botão
    // relativa ao retângulo do CAMPO INTEIRO (`el.getBoundingClientRect()`,
    // `x <= ARROW_ZONE` / `x >= largura - ARROW_ZONE`) — matematicamente
    // correto SE o layout do campo for sempre exatamente o esperado, mas
    // frágil a qualquer variação (zoom da página, alguma regra CSS
    // específica de um grupo de campos, etc.) que desalinhe esse cálculo
    // do retângulo de cada SETA de verdade. Trocado agora por um listener
    // PRÓPRIO em cada `<div>` seta (`arrowL`/`arrowR`, abaixo) — decide
    // diminuir/aumentar direto pela identidade do elemento clicado, não
    // mais por aritmética de coordenada — ver `wireArrow`.
    // [11/09/2026] NOVO — pedido verbatim: "A variação do FOV está lenta
    // ainda. Deve ser imediata. É alguma coisa no Three.js, alguma
    // função?" INVESTIGADO: não é o Three.js — `Engine3D.setFov` (chamado
    // por `onCommit` deste campo, ver mapview.js `_wireCamPropsFieldset`)
    // só atribui `camera3.fov` e chama `updateProjectionMatrix()`, sem
    // NENHUMA interpolação/animação (conferido em todo `engine3d.js` — só
    // existe essa ÚNICA atribuição a `camera3.fov`). A "lentidão" sempre
    // esteve AQUI: este campo só muda o valor em `cfg.step` a cada
    // `PX_PER_STEP` pixels ARRASTADOS — pra uma faixa de até 170° (FOV),
    // isso sempre vai exigir muito mais pixels de arraste do que pra um
    // campo de metros/graus fino (offset/rotação, onde este componente
    // nasceu). Virou configurável por campo (`cfg.pxPerStep`, opcional,
    // cai no `10` de sempre se omitido) — o campo FOV (mapview.js) passa
    // um valor BEM menor, pra sentir a mudança "imediata" ao arrastar.
    const PX_PER_STEP = cfg.pxPerStep || 10; // sensibilidade do arraste

    const el = document.createElement('div');
    el.className = 'm3d-numfield';

    const arrowL = document.createElement('div'); arrowL.className = 'm3d-nf-arrow m3d-nf-arrow-l';
    const disp = document.createElement('div'); disp.className = 'm3d-nf-disp';
    const labelSpan = document.createElement('span'); labelSpan.className = 'm3d-nf-label';
    const valueSpan = document.createElement('span'); valueSpan.className = 'm3d-nf-value';
    disp.appendChild(labelSpan); disp.appendChild(valueSpan);
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'm3d-nf-input'; input.style.display = 'none';
    input.autocomplete = 'off';
    const arrowR = document.createElement('div'); arrowR.className = 'm3d-nf-arrow m3d-nf-arrow-r';

    el.appendChild(arrowL); el.appendChild(disp); el.appendChild(input); el.appendChild(arrowR);

    let curValue = cfg.value;
    let editing = false;
    let dragging = false;

    const renderDisplay = () => { labelSpan.textContent = cfg.label || ''; valueSpan.textContent = this._formatNumField(curValue, cfg); };
    renderDisplay();

    // `rawPrecision`: true preserva o valor EXATO (edição por texto — o
    // usuário pode ter digitado mais casas decimais de propósito); sem
    // isso (arraste/seta), arredonda a 6 casas só pra evitar "sujeira" de
    // ponto flutuante acumulada em somas repetidas de `cfg.step`.
    const commit = (newVal, rawPrecision) => {
      curValue = rawPrecision ? newVal : parseFloat(newVal.toFixed(6));
      renderDisplay();
      if (cfg.onCommit) cfg.onCommit(curValue);
    };

    // Pedido do usuário: "Quando um botão estiver selecionado (sendo
    // editado) ou clique (quando o botão baixou), deve ficar levemente
    // escurecido para mostrar visualmente que houve interação ali" — a
    // classe `.m3d-nf-pressed` (escurecimento, ver CSS) liga no
    // `mousedown` (independente de virar arraste ou clique simples) e
    // desliga no `mouseup`; `.editing` liga durante a edição de texto —
    // as duas usam o MESMO escurecimento visual.
    const startEdit = () => {
      editing = true;
      el.classList.add('editing');
      disp.style.display = 'none';
      input.style.display = '';
      // Pedido do usuário: "Ao clicar nos valores das propriedades, se for
      // um número inteiro, deve aparecer pelo menos uma casa decimal. Por
      // exemplo, se for o '3', então, ao clicar para editar manualmente,
      // aparece '3.0'." — `String(curValue)` sozinho mostrava "3" pra um
      // inteiro (sem casa decimal nenhuma); `Number.isInteger` detecta
      // esse caso e força `.toFixed(1)`. Valores JÁ com casas decimais
      // continuam mostrando o valor CRU, sem arredondar/cortar nada (não
      // queremos mexer na precisão de verdade, só garantir pelo menos 1
      // casa quando não há nenhuma).
      input.value = Number.isInteger(curValue) ? curValue.toFixed(1) : String(curValue);
      input.focus();
      input.select();
    };
    const endEdit = (apply) => {
      if (!editing) return;
      editing = false;
      el.classList.remove('editing');
      input.style.display = 'none';
      disp.style.display = '';
      if (apply) {
        const parsed = parseFloat(String(input.value).replace(',', '.'));
        if (!isNaN(parsed)) commit(parsed, true);
      }
      renderDisplay();
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') endEdit(true);
      else if (ev.key === 'Escape') endEdit(false);
      ev.stopPropagation(); // não deixa as teclas de atalho do Modelador (G/R/S/X/Y/Z/Tab...) reagirem enquanto se digita aqui
    });
    input.addEventListener('blur', () => endEdit(true));
    input.addEventListener('mousedown', (ev) => ev.stopPropagation());

    // Pedido do usuário: "A classe 'm3d-nf-arrow-l'... é para diminuir o
    // valor... 'm3d-nf-arrow-r'... é para aumentar" — `sign` amarra cada
    // seta à sua própria direção, sem depender de coordenada nenhuma.
    // `stopPropagation` no mousedown impede que o listener de ARRASTE do
    // campo inteiro (`el.addEventListener('mousedown', ...)` abaixo) também
    // dispare pro mesmo clique — as setas agora só clicam (como no
    // Blender), não arrastam; arrastar continua funcionando normalmente a
    // partir de qualquer outra parte do campo (`disp`, área central).
    // "Ativa no soltar, não no pressionar" (mesma regra já pedida antes
    // para o campo inteiro) — só efetiva a mudança se o botão do mouse for
    // solto AINDA sobre a própria seta (confere pelo retângulo dela no
    // momento do soltar, não pelo `event.target` do mouseup, que pode ter
    // mudado se o cursor saiu da seta entre o pressionar e o soltar).
    const wireArrow = (arrowEl, sign) => {
      arrowEl.addEventListener('mousedown', (ev) => {
        if (editing || ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        el.classList.add('m3d-nf-pressed');
        const onUp = (up) => {
          document.removeEventListener('mouseup', onUp);
          el.classList.remove('m3d-nf-pressed');
          const r = arrowEl.getBoundingClientRect();
          const inside = up.clientX >= r.left && up.clientX <= r.right && up.clientY >= r.top && up.clientY <= r.bottom;
          if (inside) commit(curValue + sign * cfg.step);
        };
        document.addEventListener('mouseup', onUp);
      });
    };
    wireArrow(arrowL, -1);
    wireArrow(arrowR, 1);

    el.addEventListener('mousedown', (ev) => {
      if (editing || ev.button !== 0) return;
      ev.preventDefault();
      el.classList.add('m3d-nf-pressed');
      let accumPx = 0;
      dragging = false;
      const startValue = curValue;
      // [11/09/2026] NOVO — pedido verbatim: "Ao clicar e arrastar o offset
      // X, o offset Y e a rotação para alterar os seus valores, acaba dando
      // um salto, em vez de ser só a variação a partir do clique." CAUSA
      // RAIZ: `el.requestPointerLock?.()` (2 linhas abaixo) é ASSÍNCRONO —
      // o navegador só efetiva o lock alguns quadros depois do pedido. É
      // quirk conhecido (mesma categoria de bug já contornado no arraste 3D
      // do Modelador via `state._cursorRebaseTo`, ver modeler-input.js) que,
      // no exato instante em que o lock finalmente engata, o PRÓXIMO evento
      // `mousemove` chega com um `movementX/Y` "espúrio" — reflete o
      // reposicionamento interno/invisível do cursor do SO feito pelo
      // navegador ao travar (não um movimento real do mouse). Sem ignorar
      // esse 1º evento pós-lock, ele entrava direto na soma de `accumPx`
      // (linha logo abaixo) juntando-se ao arraste real — dava exatamente o
      // "salto" relatado, bem na hora que o arraste "pega" o pointer lock.
      // CORRIGIDO: `pointerlockchange` marca `ignoreNextMovement`, e o
      // `onMove` seguinte descarta esse 1º movimento (sem somar a
      // `accumPx`) antes de voltar a acumular normalmente.
      let ignoreNextMovement = false;
      const onPointerLockChange = () => {
        if (document.pointerLockElement === el) ignoreNextMovement = true;
      };
      document.addEventListener('pointerlockchange', onPointerLockChange);
      const onMove = (mv) => {
        if (ignoreNextMovement) { ignoreNextMovement = false; return; }
        accumPx += mv.movementX || 0;
        if (!dragging && Math.abs(accumPx) > 3) {
          dragging = true;
          el.classList.add('dragging');
          try { el.requestPointerLock?.(); } catch (err) { /* funciona sem pointer lock também, só sem o cursor "infinito" */ }
        }
        // Pedido do usuário: "O passo de variação dos números das
        // propriedades deve ser o mesmo quando clica nos botões de
        // aumentar e diminuir e do clicar e arrastar. [...] variei a
        // posição x do objeto pelos botões... o passo estava 0.01. Depois,
        // cliquei no meio do botão e arrastei... o passo estava em 0.001."
        // Causa raiz: antes o valor mudava de forma CONTÍNUA/proporcional
        // (`(accumPx / PX_PER_STEP) * cfg.step`) — arrastar só 1px já
        // mudava o valor em `cfg.step / PX_PER_STEP` (= step/10, exatamente
        // o "0.001" visto num campo de step 0.01), sem nunca parar
        // exatamente nos múltiplos de `cfg.step`. Corrigido arredondando
        // pra QUANTIDADE INTEIRA de passos primeiro (`Math.round`) — assim
        // o valor só muda em saltos de `cfg.step` completo, IDÊNTICO ao
        // clique nas setas (cada `PX_PER_STEP` pixels arrastados = 1 passo
        // de verdade, não uma fração dele).
        if (dragging) { const steps = Math.round(accumPx / PX_PER_STEP); commit(startValue + steps * cfg.step); }
      };
      const onUp = (up) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('pointerlockchange', onPointerLockChange); // [11/09/2026] limpa o listener novo (ver comentário acima)
        el.classList.remove('m3d-nf-pressed');
        if (dragging) {
          el.classList.remove('dragging');
          if (document.pointerLockElement === el) { try { document.exitPointerLock(); } catch (err) { /* ignora */ } }
          dragging = false;
          return;
        }
        // Não houve arraste — foi um clique de verdade. Pedido do usuário:
        // "a ativação para modificar o valor deve ser no clique, mas
        // quando solta o botão esquerdo (não é quando baixa)". As setas
        // (`arrowL`/`arrowR`) já resolvem diminuir/aumentar sozinhas, com
        // seus próprios listeners (`wireArrow`, acima — `stopPropagation`
        // impede o clique delas de chegar até aqui); um clique que chega
        // até AQUI só pode ter sido no meio do campo (`disp`), então sempre
        // entra em edição.
        startEdit();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    return {
      el,
      setValue(v) { curValue = v; if (!editing) renderDisplay(); },
      // [11/09/2026] NOVO — pedido verbatim (painel "Propriedades da
      // câmera" → FOV/Distância focal virando 1 campo só com um <select>
      // de modo ao lado, ver mapview.js `_wireCamPropsFieldset`): o campo
      // precisa trocar de rótulo ("FOV: " <-> "Distância Focal: ") E de
      // sufixo ("°" <-> "mm") ao vivo, sem recriar o widget inteiro (isso
      // perderia o estado de "pressed"/drag em andamento). `cfg.label`/
      // `cfg.suffix` eram só lidos 1x na criação — `setLabel` muta o MESMO
      // `cfg` fechado por `renderDisplay`/`_formatNumField` e redesenha.
      setLabel(label, suffix, step) {
        cfg.label = label;
        if (suffix !== undefined) cfg.suffix = suffix;
        // [11/09/2026] NOVO — o campo único FOV/Distância focal também
        // precisa trocar o TAMANHO DO PASSO ao trocar de modo (2° no modo
        // FOV, 5mm no modo Milímetros — faixas bem diferentes, mesmo
        // "sentir bem" pedido pro FOV sozinho não serve pra mm). `cfg.step`
        // é lido AO VIVO por `wireArrow`/pelo arraste (mesmo objeto `cfg`
        // fechado na criação), então mutar aqui já basta.
        if (step !== undefined) cfg.step = step;
        if (!editing) renderDisplay();
      },
    };
  },

  /** Agrupa 3 campos (X/Y/Z) empilhados verticalmente com o rótulo da
   *  seção acima (ex. "Posição:") — pedido do usuário, com screenshot do
   *  Blender: "aparece acima do grupo de três botões, 'Posição:'". As
   *  bordas arredondadas do CONJUNTO (não de cada campo isolado) ficam a
   *  cargo do CSS (`.m3d-nf-group` + seletores `:first-child`/`:last-
   *  child`/`:only-child`) — pedido do usuário: só as pontas de FORA do
   *  grupo (topo do primeiro, base do último) ganham canto arredondado; os
   *  do meio ficam com canto reto. */
  _buildGroup(labelText, fieldsCfg) {
    const wrap = document.createElement('div');
    const lbl = document.createElement('div'); lbl.className = 'm3d-nf-grouplabel'; lbl.textContent = labelText;
    const groupEl = document.createElement('div'); groupEl.className = 'm3d-nf-group';
    const apiByAxis = {};
    fieldsCfg.forEach((cfg) => {
      const api = this._createNumField({
        label: cfg.axis.toUpperCase() + ':',
        value: cfg.value,
        step: cfg.step,
        minDecimals: cfg.minDecimals,
        formatMode: cfg.formatMode || 'fixed',
        suffix: cfg.suffix || '',
        onCommit: cfg.onCommit,
      });
      apiByAxis[cfg.axis] = api;
      groupEl.appendChild(api.el);
    });
    wrap.appendChild(lbl); wrap.appendChild(groupEl);
    return { el: wrap, setValue: (axis, v) => apiByAxis[axis]?.setValue(v) };
  },

  /** Painel de Transformação completo (Modo Objeto) — Posição/Rotação/
   *  Escala/Dimensões, dentro do sub-painel recolhível "Transformação"
   *  pedido pelo usuário ("no estilo de recolhimento do Blender, como na
   *  imagem... 'Transform', que recolhe as quatro seções"). Escala e
   *  Dimensões são interdependentes (mudar uma recalcula a outra a partir
   *  da bounding box local) — atualizadas via `setValue` (sem reconstruir
   *  o DOM) pra não interromper um arraste em andamento no outro campo. */
  /** [12/09/2026] REMOVIDO — pedido verbatim: "Em Propriedades, há dois
   *  dropdowns de 'Transformação' aninhados. Remova o interno, porém
   *  conserve o seu conteúdo. Para que fique do mesmo jeito que os outros 2
   *  botões: 'Fundo' e 'Câmera'." CAUSA: esta função já era chamada DENTRO
   *  da seção recolhível "Transformação" do painel unificado "+" da
   *  lateral direita (`#v3d-proppanel-transformacao`, com seu próprio
   *  cabeçalho/chevron — ver `view3d.js`), mas construía um SEGUNDO
   *  cabeçalho recolhível idêntico ("Transformação" de novo, com seta
   *  própria) por dentro — resquício de quando esta função ainda vivia num
   *  painel flutuante PRÓPRIO, sem a seção externa (ver comentário grande
   *  de `updateNPanel`, 15/09/2026). CORRIGIDO: `wrap` volta a ser só um
   *  contêiner simples (`contentWrap`), sem cabeçalho/recolhimento
   *  PRÓPRIO — igual a "Fundo"/"Câmera", cujo conteúdo vai direto no corpo
   *  da seção externa, sem sub-dropdown. `state._npanelUI.transformCollapsed`
   *  mantido no objeto de estado só por segurança (não lido em nenhum
   *  outro lugar após esta correção), sem custo.
   */
  _buildObjectTransformPanel(state) {
    const contentWrap = document.createElement('div');

    const p = state.group.position;
    const rot = { x: state.xform.rotX * 180 / Math.PI, y: state.xform.rotY * 180 / Math.PI, z: state.xform.rotZ * 180 / Math.PI };
    const sc = { x: state.xform.scaleX, y: state.xform.scaleY, z: state.xform.scaleZ };
    const bb = ModelerMesh.localBBox(state.cm.vertices);
    const dim = { x: (bb.maxX - bb.minX) * Math.abs(sc.x), y: (bb.maxY - bb.minY) * Math.abs(sc.y), z: (bb.maxZ - bb.minZ) * Math.abs(sc.z) };

    const posGroup = this._buildGroup('Posição:', [
      { axis: 'x', value: p.x, step: 0.01, minDecimals: 5, onCommit: (v) => { state.group.position.x = v; ModelerMesh.rebuildMeshGeometry(state); } },
      { axis: 'y', value: p.y, step: 0.01, minDecimals: 5, onCommit: (v) => { state.group.position.y = v; ModelerMesh.rebuildMeshGeometry(state); } },
      { axis: 'z', value: p.z, step: 0.01, minDecimals: 5, onCommit: (v) => { state.group.position.z = v; ModelerMesh.rebuildMeshGeometry(state); } },
    ]);

    // Pedido do usuário: "deve haver um botão para selecionar como a
    // rotação será feita assim como é no Blender" — lista igual à do
    // Blender (Axis Angle / 6 ordens de Euler / Quaternion), mais uma opção
    // NOVA pedida: "paralelo ao eixo do mundo" (mesmo jeito que o GIZMO de
    // rotação já gira — em torno de uma reta paralela ao eixo do mundo
    // correspondente, não composição de Euler local). `state.xform.
    // rotationMode` guarda a escolha; ver `_commitRotationField`/
    // `_setRotationMode` logo abaixo, e `ModelerGizmo.applyXformToGroup`
    // (que usa `state.group.rotation.order`, suportado nativamente pelo
    // Three.js pras 6 ordens de Euler). SIMPLIFICAÇÃO documentada (mesmo
    // espírito de outras já feitas nesta base de código, ex.: "Merge > At
    // Cursor"): "Axis Angle" e "Quaternion (WXYZ)" ainda não têm campos
    // PRÓPRIOS (eixo+ângulo / 4 componentes) — selecionáveis no menu, mas
    // aplicados como XYZ Euler por baixo, já que este app guarda a rotação
    // como 3 ângulos em Modo Objeto.
    const ROTATION_MODES = [
      { key: 'AXIS_ANGLE', label: 'Axis Angle' },
      { key: 'ZYX', label: 'ZYX Euler' },
      { key: 'ZXY', label: 'ZXY Euler' },
      { key: 'YZX', label: 'YZX Euler' },
      { key: 'YXZ', label: 'YXZ Euler' },
      { key: 'XZY', label: 'XZY Euler' },
      { key: 'XYZ', label: 'XYZ Euler' },
      { key: 'QUATERNION', label: 'Quaternion (WXYZ)' },
      { key: 'WORLD_AXIS', label: 'Paralelo ao eixo do mundo' },
    ];
    if (!state.xform.rotationMode) state.xform.rotationMode = 'XYZ';

    /** Aplica o NOVO valor (graus) de um dos 3 campos de rotação — o
     *  caminho depende do modo escolhido no dropdown (ver ROTATION_MODES):
     *  nos modos de Euler "de sempre" (inclusive Axis Angle/Quaternion,
     *  simplificados pra XYZ — ver comentário acima), o campo é um ÂNGULO
     *  ABSOLUTO de novo, igual sempre foi. Em "Paralelo ao eixo do mundo",
     *  em vez de recompor os 3 ângulos do zero, aplica só a DIFERENÇA
     *  (`delta`) como uma rotação de MUNDO por cima da orientação atual —
     *  MESMA técnica já usada pelo arraste do gizmo de rotação (ver
     *  modeler-input.js `_updateModal`, tipo 'R': `quaternion.premultiply`
     *  + releitura em Euler só pra exibição) — é isso que faz o giro
     *  acontecer "em torno de uma reta paralela ao eixo do mundo" mesmo
     *  editando pelo campo numérico, não só arrastando o gizmo. */
    const commitRotationField = (axis, newDeg) => {
      const newRad = newDeg * Math.PI / 180;
      if (state.xform.rotationMode === 'WORLD_AXIS') {
        const oldRad = axis === 'x' ? state.xform.rotX : axis === 'y' ? state.xform.rotY : state.xform.rotZ;
        const delta = newRad - oldRad;
        const THREE = state.THREE;
        const axisVec = axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
        const deltaQuat = new THREE.Quaternion().setFromAxisAngle(axisVec, delta);
        state.group.quaternion.premultiply(deltaQuat);
        const totalEuler = new THREE.Euler().setFromQuaternion(state.group.quaternion, 'XYZ');
        state.xform.rotX = totalEuler.x;
        state.xform.rotY = totalEuler.y - ModelerGizmo.objAnguloToRotY(state.obj.angulo);
        state.xform.rotZ = totalEuler.z;
      } else {
        if (axis === 'x') state.xform.rotX = newRad;
        else if (axis === 'y') state.xform.rotY = newRad;
        else state.xform.rotZ = newRad;
        ModelerGizmo.applyXformToGroup(state);
      }
      // Qualquer um dos dois caminhos pode alterar os OUTROS dois eixos
      // também (mundo: sempre, por causa da composição — Euler: só quando
      // o modo muda, ver `setRotationMode` abaixo) — atualiza os 3 campos
      // pra refletir o estado de verdade, sem reconstruir o painel inteiro.
      rotGroup.setValue('x', state.xform.rotX * 180 / Math.PI);
      rotGroup.setValue('y', state.xform.rotY * 180 / Math.PI);
      rotGroup.setValue('z', state.xform.rotZ * 180 / Math.PI);
    };

    const rotGroup = this._buildGroup('Rotação:', [
      { axis: 'x', value: rot.x, step: 0.1, formatMode: 'rotation', suffix: '°', onCommit: (v) => commitRotationField('x', v) },
      { axis: 'y', value: rot.y, step: 0.1, formatMode: 'rotation', suffix: '°', onCommit: (v) => commitRotationField('y', v) },
      { axis: 'z', value: rot.z, step: 0.1, formatMode: 'rotation', suffix: '°', onCommit: (v) => commitRotationField('z', v) },
    ]);

    /** Troca o MODO de rotação escolhido (dropdown abaixo) — pedido do
     *  usuário: trocar de modo não pode "pular" a orientação atual do
     *  objeto pra outra (ex.: os mesmos 3 ângulos numéricos, só que
     *  interpretados numa ordem de composição diferente, dão uma
     *  orientação 3D DIFERENTE). Em vez disso, guarda a orientação de
     *  VERDADE (quaternion, que não depende de ordem nenhuma), troca o
     *  modo, e RECALCULA os 3 ângulos exibidos a partir dela na ordem nova
     *  — a peça 3D não se mexe, só a representação numérica muda. */
    const setRotationMode = (mode) => {
      const THREE = state.THREE;
      const quat = state.group.quaternion.clone();
      state.xform.rotationMode = mode;
      const eulerOrders = ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'];
      const order = eulerOrders.includes(mode) ? mode : 'XYZ';
      const e = new THREE.Euler().setFromQuaternion(quat, order);
      state.xform.rotX = e.x;
      state.xform.rotY = e.y - ModelerGizmo.objAnguloToRotY(state.obj.angulo);
      state.xform.rotZ = e.z;
      ModelerGizmo.applyXformToGroup(state);
      rotGroup.setValue('x', state.xform.rotX * 180 / Math.PI);
      rotGroup.setValue('y', state.xform.rotY * 180 / Math.PI);
      rotGroup.setValue('z', state.xform.rotZ * 180 / Math.PI);
      rotModeBtn.textContent = (ROTATION_MODES.find((m) => m.key === mode)?.label || mode) + ' ▾';
    };

    const rotModeWrap = document.createElement('div');
    rotModeWrap.className = 'm3d-rotmode-wrap';
    const rotModeBtn = document.createElement('button');
    rotModeBtn.type = 'button';
    rotModeBtn.className = 'm3d-btn m3d-rotmode-btn';
    rotModeBtn.textContent = (ROTATION_MODES.find((m) => m.key === state.xform.rotationMode)?.label || 'XYZ Euler') + ' ▾';
    rotModeBtn.onclick = () => {
      this.showFloatingMenuAt(state, rotModeBtn, ROTATION_MODES.map((m) => ({
        label: (m.key === state.xform.rotationMode ? '✓ ' : '') + m.label,
        run: () => setRotationMode(m.key),
      })));
    };
    rotModeWrap.appendChild(rotModeBtn);

    const syncDimFromScale = () => {
      const bb2 = ModelerMesh.localBBox(state.cm.vertices);
      dimGroup.setValue('x', (bb2.maxX - bb2.minX) * Math.abs(state.xform.scaleX));
      dimGroup.setValue('y', (bb2.maxY - bb2.minY) * Math.abs(state.xform.scaleY));
      dimGroup.setValue('z', (bb2.maxZ - bb2.minZ) * Math.abs(state.xform.scaleZ));
    };
    const setScaleFromDim = (axis, targetVal) => {
      const bb2 = ModelerMesh.localBBox(state.cm.vertices);
      const base = { x: Math.max(1e-4, bb2.maxX - bb2.minX), y: Math.max(1e-4, bb2.maxY - bb2.minY), z: Math.max(1e-4, bb2.maxZ - bb2.minZ) };
      const key = axis === 'x' ? 'scaleX' : axis === 'y' ? 'scaleY' : 'scaleZ';
      state.xform[key] = (targetVal || 0.01) / base[axis];
      ModelerGizmo.applyXformToGroup(state);
      scaleGroup.setValue('x', state.xform.scaleX);
      scaleGroup.setValue('y', state.xform.scaleY);
      scaleGroup.setValue('z', state.xform.scaleZ);
    };

    const scaleGroup = this._buildGroup('Escala:', [
      { axis: 'x', value: sc.x, step: 0.01, minDecimals: 3, onCommit: (v) => { state.xform.scaleX = v || 0.01; ModelerGizmo.applyXformToGroup(state); syncDimFromScale(); } },
      { axis: 'y', value: sc.y, step: 0.01, minDecimals: 3, onCommit: (v) => { state.xform.scaleY = v || 0.01; ModelerGizmo.applyXformToGroup(state); syncDimFromScale(); } },
      { axis: 'z', value: sc.z, step: 0.01, minDecimals: 3, onCommit: (v) => { state.xform.scaleZ = v || 0.01; ModelerGizmo.applyXformToGroup(state); syncDimFromScale(); } },
    ]);

    const dimGroup = this._buildGroup('Dimensões:', [
      { axis: 'x', value: dim.x, step: 0.01, minDecimals: 5, onCommit: (v) => setScaleFromDim('x', v) },
      { axis: 'y', value: dim.y, step: 0.01, minDecimals: 5, onCommit: (v) => setScaleFromDim('y', v) },
      { axis: 'z', value: dim.z, step: 0.01, minDecimals: 5, onCommit: (v) => setScaleFromDim('z', v) },
    ]);

    contentWrap.appendChild(posGroup.el);
    contentWrap.appendChild(rotGroup.el);
    contentWrap.appendChild(rotModeWrap);
    contentWrap.appendChild(scaleGroup.el);
    contentWrap.appendChild(dimGroup.el);

    return contentWrap;
  },

  /** SIMPLIFICAÇÃO documentada (ver modeler-core.js cabeçalho): em Modo de
   *  Edição só a seção Posição (média da seleção) fica editável aqui —
   *  Rotação/Escala da seleção continuam disponíveis via teclado (R/S) e o
   *  gizmo. */
  _buildEditTransformPanel(state, idxs) {
    let sx = 0, sy = 0, sz = 0;
    idxs.forEach((i) => { const v = state.cm.vertices[i]; sx += v[0]; sy += v[1]; sz += v[2]; });
    const avg = { x: sx / idxs.length, y: sy / idxs.length, z: sz / idxs.length };
    const wrap = document.createElement('div');
    const group = this._buildGroup('Posição (média de ' + idxs.length + '):', [
      { axis: 'x', value: avg.x, step: 0.01, minDecimals: 5, onCommit: (v) => { const dx = v - avg.x; idxs.forEach((i) => { state.cm.vertices[i][0] += dx; }); avg.x = v; ModelerMesh.rebuildMeshGeometry(state); } },
      { axis: 'y', value: avg.y, step: 0.01, minDecimals: 5, onCommit: (v) => { const dy = v - avg.y; idxs.forEach((i) => { state.cm.vertices[i][1] += dy; }); avg.y = v; ModelerMesh.rebuildMeshGeometry(state); } },
      { axis: 'z', value: avg.z, step: 0.01, minDecimals: 5, onCommit: (v) => { const dz = v - avg.z; idxs.forEach((i) => { state.cm.vertices[i][2] += dz; }); avg.z = v; ModelerMesh.rebuildMeshGeometry(state); } },
    ]);
    wrap.appendChild(group.el);
    const note = document.createElement('div');
    note.style.cssText = 'color:#9fb3c8; font-size:11.5px; line-height:1.4; margin-top:6px;';
    note.textContent = 'Rotação/Escala da seleção: use R / S (teclado) ou o gizmo — só disponíveis em Modo Objeto neste painel.';
    wrap.appendChild(note);
    return wrap;
  },

  /** [15/09/2026] CORRIGIDO -- pedido verbatim (Parte B, ver comentário
   *  grande em `build()` acima): o destino deste conteúdo deixou de ser
   *  `#m3d-npanel-body` (painel flutuante PRÓPRIO deste arquivo,
   *  recriado a cada `build()`/sessão) e passou a ser
   *  `#v3d-proppanel-transformacao-body`, dentro da aba vertical
   *  "Propriedades" do painel unificado "+" da lateral direita --
   *  construído 1x por `view3d.js` (mount()), sobrevive a entrar/sair do
   *  Modelador. Busca via `state.view3d._container` (MESMO padrão já
   *  usado por `toggleSidebar`/`renderSidebar`/`_sidebarCtx` pro botão
   *  "+" esquerdo -- ver comentário grande lá) em vez de `state.rootEl`
   *  (que não tem mais este elemento). */
  updateNPanel(state) {
    const body = state.view3d?._container?.querySelector('#v3d-proppanel-transformacao-body');
    if (!body) return;
    if (!state._npanelUI) state._npanelUI = { transformCollapsed: false };
    body.innerHTML = '';
    if (state.mode === 'object') {
      body.appendChild(this._buildObjectTransformPanel(state));
    } else {
      const idxs = ModelerMesh.selectedVertexIndices(state);
      if (!idxs.length) { body.innerHTML = '<div style="color:#9fb3c8">Nada selecionado.</div>'; return; }
      body.appendChild(this._buildEditTransformPanel(state, idxs));
    }
  },
};

window.ModelerUI = ModelerUI;
