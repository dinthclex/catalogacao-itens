/**
 * engine3d.js — Motor 3D. Antes era um rasterizador manual em Canvas2D (só
 * matemática, sem WebGL) — funcionava, mas sem z-buffer de verdade (usava o
 * "algoritmo do pintor", que precisava recortar cada parede em pedacinhos de
 * 1m só para o ordenamento por profundidade não errar) e sem aceleração de
 * GPU nenhuma. Agora usa Three.js (WebGL de verdade, carregado sob demanda
 * via CDN — só quando a visualização 3D é aberta pela primeira vez, do
 * mesmo jeito que os outros pacotes de reconhecimento local, ver
 * js/libloader.js) — mais rápido, mais robusto (profundidade correta sem
 * nenhum "hack"), e permite manter os visuais melhorando no futuro sem
 * reescrever tudo de novo.
 *
 * A API pública (new Engine3D(canvas), .setScene(), .setMode(), .render(),
 * .centerRay(), .pickFromRay()) é EXATAMENTE a mesma de antes — view3d.js
 * (movimento, mouse-look, toque, pulo, colisão, HUD, flashcard) não precisou
 * mudar nada além de chamar engine.dispose() ao desmontar.
 *
 * ---------------------------------------------------------------------
 * [11/09/2026] CABEÇALHO COM ÍNDICE DE FUNÇÕES (pedido recorrente do
 * usuário, "evitar buscas exaustivas") — arquivo grande (~380KB): índice
 * pragmático, agrupado por assunto (não é toda função interna de closure,
 * só topo-de-arquivo/métodos de `class Engine3D`). Consumido quase
 * inteiramente por `js/view3d.js` (a "cola" entre jogador/UI e este motor).
 *
 * Funções soltas (fora da classe), matemática pura reaproveitada por
 * view3d.js/mapping.js:
 * - rotY(p,a)/rotX(p,a) — rotaciona um ponto 3D em torno do eixo Y/X.
 * - cameraForward(cam)/cameraForwardFlat(cam)/cameraRightFlat(cam) —
 *   vetores de direção da câmera (3D completo / projetado no plano
 *   horizontal), base de todo movimento/mira do jogador.
 * - objectPointerForward(dirAngulo,pitch) — [22/09/2026, NOVO] vetor de
 *   direção de APONTAMENTO de um OBJETO câmera/orb de foto (cone/seta,
 *   placa, retângulo amarelo/frustum — todos usam este mesmo vetor, ver
 *   `setScene`) — DISTINTO de `cameraForward` (direção de VISÃO do
 *   personagem/câmera de navegação): corrige uma inversão de 180° no eixo
 *   Z entre a convenção do mapa 2D (`dirAngulo`) e `cameraForward`, ver
 *   comentário grande dela.
 * - lerpAngle(a,b,t) — interpolação angular curta (nunca "dá a volta
 *   longa"), usada em transições suaves de yaw/pitch.
 * - buildSmoothedTriGeometry(...) — geometria de triângulos com normais
 *   suavizadas (sombreamento Gouraud-like em malhas customizadas).
 * - WALL_THICKNESS_3D/THREE_GLOBAL_URL/RECTAREA_UNIFORMS_URL — constantes
 *   de módulo (espessura de parede 3D, URLs dos scripts vendorizados do
 *   Three.js carregados sob demanda).
 *
 * `class Engine3D` — construção/inicialização:
 * - constructor(canvas, initialConfig, opts) — cria a instância, carrega
 *   Three.js sob demanda (libloader.js) e chama `_initThree`.
 * - _initThree(THREE) — monta cena/câmera/renderer/luzes base do zero.
 * - _maxLuzesReais()/_maxLuzesAtivas() — limites de luzes de verdade
 *   (sombra) vs. ativas (sem sombra), conforme `resolucao3D` da config.
 * - _buildCheckerTexture()/_buildGlassShineTexture()/_buildGlassPane(w,h)
 *   — texturas/malha procedurais (piso xadrez, brilho de vidro, painel de
 *   vidro de janela).
 *
 * Fantasmas/guias de construção (ferramenta de posicionar no "Ver em 3D"):
 * - _initHoverHighlight/_initBuildGhosts — cria as malhas reutilizáveis de
 *   destaque/fantasma.
 * - hideAllGhosts() — esconde todos os fantasmas.
 * - showGhostWallSection/showWallSpringGhost/showSmartGuides/
 *   showGhostWall/showGhostObject/showGhostItem/showGhostDoorWindow/
 *   showRotationProtractor/showGhostFootprintShadow/
 *   hideGhostFootprintShadow — cada um posiciona/mostra UM tipo de
 *   fantasma (parede, objeto, item, porta/janela, sombra de contorno,
 *   transferidor de rotação) enquanto o jogador mira o ponto de
 *   colocação.
 * - objectFootprint(tipoKey) — pegada (contorno base) de um tipo de
 *   objeto, usada pelos fantasmas acima.
 *
 * Raio-X / oclusão / culling:
 * - setXRayTarget(objId)/setGlobalXRay(flags) — "ver através das paredes"
 *   (de 1 objeto específico ou global, por categoria).
 * - _setupCullMeshes()/_setupWallOcclusionMeshes()/
 *   _updateDistanceCulling(camera) — culling por distância/oclusão de
 *   paredes (desempenho).
 * - [13/09/2026 UTC] NOVO — _buildOcclusionSectors(mapData)/_sectorIdAt(piso,x,z)/
 *   _updateSectorOcclusionCulling(camera) — oclusão por setores (paredes
 *   particionam cada andar em regiões conectadas via flood-fill; objeto
 *   num setor não visível a partir do setor da câmera nem entra no draw
 *   call), pedido do usuário pra milhares de objetos atrás de uma parede
 *   grande não custarem FPS — ver comentário grande de
 *   _buildOcclusionSectors, mais abaixo, pro sistema completo.
 * - [13/09/2026 UTC] NOVO — _updateFrameBudgetCulling(camera) — orçamento de
 *   objetos desenhados por QUADRO (mapconfig.js "Desempenho 3D", padrão
 *   1200), prioriza quem está mais perto da câmera — ver comentário grande
 *   dela pro sistema completo.
 * - _addWireframeOcclusion() — malhas de wireframe usadas só pra ocluir
 *   (sem desenhar), no modo "sólido+wireframe".
 * - _setupHybridMeshes()/updateHybridQuality(camera,fpsAtual,fpsAlvo) —
 *   modo híbrido de qualidade adaptativa (LOD por raio ao redor do
 *   jogador).
 * - _segmentsIntersect2D(...) — teste geométrico auxiliar (interseção de
 *   segmentos 2D), usado por detecção de cantos de parede.
 *
 * Personagem/câmera do jogador:
 * - _buildPlayerFigure(THREE,scene)/updatePlayerFigure(...)/
 *   setPlayerFigureVisible(visible) — malha "boneco palito" do jogador
 *   (modos espectador) e seu controle de visibilidade.
 * - setFov(deg) — campo de visão da câmera de render.
 * - setClipPlanes(nearM,farM)/clearClipPlanes() — override de
 *   near/far (ver comentário grande junto delas — "Camera Match").
 * - setCameraMeshVisible(camId,visible) — [11/09/2026, NOVO] esconde/
 *   mostra a malha caixa+cone de UMA câmera específica (usado por
 *   view3d.js `_enterCameraOrbView`/`_exitCameraOrbView`).
 * - setFotoMeshVisible(fotoId,visible) — [12/09/2026, NOVO] mesma ideia
 *   acima, mas pra malha esfera+cone(+placa) de UM "orb de foto" (usado
 *   por view3d.js `_enterFotoCameraView`/`_exitFotoCameraView`).
 * - updateActiveLights(camera) — recalcula quais luzes de luminária estão
 *   "ativas" (com sombra) mais perto da câmera.
 * - setMode(mode) — troca o modo de renderização (ex. wireframe).
 *
 * Céu/iluminação ambiente:
 * - _pixelRatioCap()/_colorSpaceEfeito()/_applyColorSpaceEfeito() —
 *   ajustes de qualidade de imagem conforme config.
 * - _renderDistance()/_fogNear(rd) — distância de renderização/neblina.
 * - _horaAtualConfigurada()/_skyPalette(THREE)/_buildCelestialBodies(THREE)/
 *   _updateSky() — ciclo dia/noite (cor do céu, sol/lua).
 * - setConfig(cfg) — aplica uma config nova (chamada quando o painel ⚙️
 *   muda algo).
 *
 * Construção da cena (a partir do mapa):
 * - setScene(mapData) — MÉTODO PRINCIPAL, reconstrói a cena 3D inteira a
 *   partir do mapa (paredes/portas/janelas/objetos/itens/câmeras/fotos/
 *   luminárias/postes/tijolos) — a maior função do arquivo.
 * - _buildOneObjectMesh(obj,wireframe,colWireframe) — malha de UM objeto
 *   comum (despacha pro builder certo conforme o tipo/perfil).
 * - _buildItemBadgeTexture/_buildCountBadgeTexture/
 *   _buildOrdinalBadgeTexture — texturas dos selos/plaquinhas 3D (item
 *   associado, contagem, ordinal de duplicidade).
 * - _addItemAssociadoDestaque/_addBeaconDestaque/_buildAnelDouradoTexture/
 *   _addAnelDouradoDestaque3D — destaques visuais de patrimônio associado
 *   (selo, feixe de luz, anel dourado).
 * - addObjectIncremental(obj) — adiciona UM objeto novo à cena já
 *   montada, sem reconstruir tudo (colocação ao vivo no "Ver em 3D").
 * - _detectWallCorners(walls)/_buildCornerFillMesh(...)/
 *   _buildPrismFromPolygon(...) — preenchimento de cantos/junções de
 *   parede (evita "buracos" nas quinas).
 * - _tintForLight(colorHex,x,y,z) — matiz de cor por proximidade de luz
 *   (usado em vertex colors).
 * - _buildStandardMaterialForObj(...) — material padrão (cor/textura) de
 *   um objeto.
 * - _rebuildTijolos(mapData)/rebuildTijolos(mapData) — malha mesclada dos
 *   "tijolos" (blocos de construção livre).
 * - _buildCustomMeshObject/_buildMoldeMesh/_buildTypeMoldeMesh/
 *   _buildMesaMesh/_buildEscadaMesh/_buildImagemMesh/
 *   _buildObjImportMesh/_buildLuminariaMesh/_buildPosteMesh — um builder
 *   de malha por TIPO/perfil de objeto especial (molde importado,
 *   mesa, escada, imagem/quadro, .obj importado, luminária, poste).
 * - _disposeGroupContents() — descarta toda a geometria/material/textura
 *   da cena anterior (evita vazamento de memória de GPU a cada
 *   setScene/troca de modo).
 *
 * Loop de render:
 * - _resize()/_presentToCanvas()/_presentFrame()/render(camera) — pipeline
 *   de redimensionamento e desenho de UM quadro (chamado por view3d.js a
 *   cada frame do rAF).
 * - _updateItemBadgeOcclusion(camera) — esconde selos "atrás" de
 *   paredes/portas/janelas quando "Plaquinhas" está com oclusão ligada.
 * - spawnCollectEffect/spawnDemolishEffect/_updateEffects — efeitos
 *   visuais temporários (coletar item, demolir).
 *
 * Raycasting (seleção/mira/colocação):
 * - centerRay(camera) — raio saindo do centro da tela (mira).
 * - raycastWall/raycastFloor/raycastPlaneY/raycastSurface/raycastLateral
 *   — cada um testa o raio contra um tipo de alvo (parede, chão, plano Y
 *   arbitrário, qualquer superfície, lateral de objeto).
 * - snapToFloorTileCenter(x,z)/gridIntersectionNear(x,z) — encaixe no
 *   centro/interseção de ladrilho do chão.
 * - pickFromRay(origin,dir) — pick genérico (o que usa `this.pickables`),
 *   base de toda seleção por clique/mira.
 * - _rayPickableT/_raySphereT/_rayPlaneT/_rayBoxT — testes de interseção
 *   raio×forma usados por `pickFromRay`.
 * - _hoverPickPixelPerfect(camera)/hoverPick(camera) — pick "sob o
 *   cursor" (modo pixel-perfect via THREE.Raycaster real, ou hitbox
 *   aproximada), usado pelo destaque ao mirar/passar o mouse.
 * - clearHoverHighlight()/_updateHoverHighlight(camera) — liga/desliga o
 *   destaque visual do alvo sob mira.
 * - _outlineLocalPoints/_convexHull2D/_drawOutline2D — contorno pontilhado
 *   2D do alvo (estilo `raycastHighlightStyle: 'outline2d'`).
 *
 * - dispose() — libera tudo (geometria/textura/listeners) ao desmontar o
 *   "Ver em 3D" — chamado por view3d.js.
 * ---------------------------------------------------------------------
 */

// ---------- Cam3DMath: matemática pura de direção da câmera ----------
// INALTERADA em relação ao motor anterior — view3d.js usa isso pro
// movimento (WASD/joystick, via cameraForwardFlat/cameraRightFlat) e a mira
// (picking, via cameraForward). Mantida aqui tal como estava para não mudar
// em nada a "sensação" de andar/olhar em volta, e também usada abaixo para
// apontar a câmera do Three.js na direção certa via THREE.Camera.lookAt()
// (evita qualquer risco de inverter sinal/convenção entre os dois sistemas
// de rotação — lookAt() sempre acerta, dado um vetor de direção correto).
function rotY(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.z * s, y: p.y, z: p.x * s + p.z * c };
}
function rotX(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}
function cameraForward(cam) {
  let d = { x: 0, y: 0, z: 1 };
  d = rotX(d, cam.pitch);
  d = rotY(d, cam.yaw);
  return d;
}
function cameraForwardFlat(cam) { return rotY({ x: 0, y: 0, z: 1 }, cam.yaw); }
// O eixo "direita" real da câmera do Three.js (construído internamente pelo
// THREE.Camera.lookAt() como cross(up, olho-alvo) = cross(direção, up)) é o
// OPOSTO do que essa convenção original (right = rotY({1,0,0})) dava — as
// duas malhas têm "handedness" diferente. Corrigido negando aqui (o único
// lugar de onde vem "direita" pra WASD/joystick strafe) em vez de mexer na
// mira (cameraForward, usada por lookAt/picking, que sempre esteve correta).
function cameraRightFlat(cam) { return rotY({ x: -1, y: 0, z: 0 }, cam.yaw); }

// [22/09/2026] NOVO — pedido verbatim do usuário: "No mapa 2D, ao colocar
// um objeto câmera sua seta aponta para o norte. O mapa 3D está com o
// norte apontando para o sul, conforme a roda de pontos cardeais (no canto
// superior direito). Deve girar 180 graus para apontar para o lado certo
// (tomando como referência o mapa 2D)." Direção de APONTAMENTO de um
// OBJETO câmera/orb de foto (cone/seta 3D que indica pra onde ele "olha")
// — DISTINTA de `cameraForward` acima, que é a direção de VISÃO do
// PERSONAGEM/câmera de navegação (yaw do jogador, nunca teve nenhum
// problema relatado, NÃO TOCADA por esta correção).
//
// CAUSA RAIZ ENCONTRADA (comparação numérica, não só suspeita): a posição
// de um objeto no mapa 2D vira posição 3D SEM NENHUM sinal invertido
// (`orb.position.set(foto.x, baseY, foto.y)`, engine3d.js `setScene` —
// mapY vira Z direto) e `Map2DRenderer.worldToScreen` (mapview.js) também
// NUNCA inverte o eixo Y (`dy=(y-cy)*zoom`, sem rotação do mapa) — ou
// seja, "para cima" na tela do mapa 2D (Y de tela menor) corresponde a
// mapY MENOR, que corresponde a Z do mundo MENOR (mundo -Z). O ângulo do
// objeto (`foto.dirAngulo`) tem seu 0° JÁ VALIDADO como "para cima" no
// mapa 2D — comentário grande em mapview.js `_drawFotoPinPreview`
// confirma numericamente: dirAngulo=0°→tela CIMA, 90°→ESQUERDA,
// 180°→BAIXO, 270°→DIREITA. Ou seja, o vetor de mundo esperado em função
// de `dirAngulo` é `(x,z) = (-sin(dirAngulo), -cos(dirAngulo))` (checado
// nos 4 ângulos cardeais contra a lista acima). Mas o cone 3D
// (`engine3d.js`, antes desta correção) calculava sua direção via
// `cameraForward({yaw:dirAngulo,...})`, que dá `(x,z) =
// (-sin(dirAngulo), +cos(dirAngulo))` — o componente Z (profundidade,
// "para frente/para trás" no mundo) sai com o SINAL TROCADO em relação ao
// que o mapa 2D define — uma inversão de 180° especificamente no eixo Z,
// não nos dois eixos (não é uma simples reflexão em torno da origem, é um
// "espelhamento" de profundidade — mesma classe de bug documentada mais
// acima nesta função, em `cameraRightFlat`, sobre `THREE.Camera.lookAt()`
// construir a base com uma "handedness" diferente da convenção original
// deste app). CORRIGIDO: usa `cameraForward` (mantida intacta, continua a
// única fonte de verdade da composição yaw+pitch/gimbal) e depois nega SÓ
// o componente Z do resultado — pitch/inclinação vertical (`y`) nunca fez
// parte do bug relatado e fica intocado. Usada em TODO lugar que precisa
// saber "pra onde este objeto câmera/orb de foto aponta" (cone/seta,
// placa da foto, retângulo amarelo/frustum — todos compartilham a mesma
// variável `dirVec` em `setScene`, ver comentário lá) — e também na POSE
// de "Ver através desta câmera" (`view3d.js _computeFotoCamPose`, que
// precisa devolver um `yaw` de CÂMERA DE VISÃO equivalente a este mesmo
// vetor, ver comentário grande lá pra a álgebra que prova a equivalência).
// [15/09/2026 UTC] Sinal de dirAngulo invertido: pedido do usuario para que o giro do cone
// (objeto Camera/Orb no 3D) seja no sentido horario visto de cima, ao aumentar os graus.
function objectPointerForward(dirAngulo, pitch) {
  const d = cameraForward({ yaw: -(dirAngulo || 0), pitch: pitch || 0 });
  return { x: d.x, y: d.y, z: -d.z };
}

// `objAnguloToRotY` (ângulo de objeto do mapa -> mesh.rotation.y do
// Three.js) mudou de casa na rodada 51 — ver js/engine3d-profiles.js
// (pedido do usuário: "Coloque em um arquivo separado do restante do
// código as 'receitas' para montar os modelos 3D dos objetos"). Continua
// visível aqui como identificador solto (scripts clássicos carregados em
// sequência compartilham o mesmo escopo de topo — ver comentário grande no
// início daquele arquivo), sem precisar de nenhum `window.` explícito.

// Interpola um ângulo (radianos) de `a` até `b` pelo CAMINHO MAIS CURTO —
// pedido do usuário: "Deve haver uma transição entre a direção e posição da
// câmera quando alterna entre os modo Modelador e o modo normal de
// navegação". Usado pra misturar `yaw` (que "dá a volta" em ±π) entre a
// direção que a câmera do Modelador estava olhando e a direção de volta do
// jogador (view3d.js `_loop`/Modeler3D `exit`) — sem isso, um yaw indo de
// +170° pra -170° (que são quase o MESMO ângulo, só passando pelo "zero" do
// outro lado) giraria a câmera quase 340° em vez dos ~20° de verdade.
function lerpAngle(a, b, t) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  else if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// [11/09/2026] NOVO — pedido verbatim: "O enquadramento deve ter medidas
// limite que são a forma do quadrado (assim como no Blender). Com a
// resolução com largura maior do que a altura, então, em cima e em baixo
// do retângulo amarelo ficam com as medidas iguais as do quadrado limite.
// Com resolução com altura maior do que a largura, então, as medidas das
// laterais do retângulo amarelo ficam iguais as medidas do quadrado
// limite." Mesma convenção do "Sensor Fit: Auto" do Blender: o valor único
// de "Propriedades da câmera" › FOV (`camProps.fov`, radianos) passa a
// valer sempre para a MAIOR dimensão da resolução (X ou Y) — como se
// houvesse um sensor QUADRADO do tamanho da maior dimensão, e o
// enquadramento de verdade (retângulo proporcional à resolução) fosse
// RECORTADO de dentro desse quadrado, sempre TOCANDO as bordas dele no
// eixo maior (por isso "em cima/embaixo" ficam do tamanho do quadrado
// quando a largura manda, e "nas laterais" quando a altura manda — são
// exatamente os 2 lados que SOBRAM do quadrado pro retângulo mais estreito
// caber dentro). ANTES desta correção, `camProps.fov` era tratado sempre
// como o FOV VERTICAL (convenção padrão do `THREE.PerspectiveCamera`),
// não importa a proporção da resolução — então uma câmera em paisagem
// (resX > resY) tinha as medidas de CIMA/BAIXO do retângulo amarelo
// SEMPRE do tamanho do quadrado (correto, é o caso vertical=eixo maior por
// coincidência só quando resY>=resX) mas as LATERAIS variavam com a
// proporção sem nenhum limite — o comportamento pedido (Blender) é o
// OPOSTO nesse caso: são as LATERAIS que deveriam bater no quadrado, e
// cima/baixo que deveriam ser recortados. `camPropsVFovRad` (abaixo)
// devolve o FOV VERTICAL DE VERDADE a usar (pra `THREE.PerspectiveCamera.
// fov`, retângulo amarelo — [19/09/2026] "plano do backdrop 'Trás'" também
// consumia isto antes desta rodada; plano REMOVIDO — todo lugar que hoje
// consome um FOV vertical, ver `_activeCamPropsVFovRad`/`_camOrbFovDeg` em
// view3d.js e o bloco `vFovRad` do retângulo amarelo abaixo, em
// `setScene`), já fazendo essa conversão — chamadores não precisam saber
// se o FOV governa a largura ou a altura, só chamam esta função uma vez
// com `fovParamRad` (o valor CRU salvo em `camProps.fov`) e a proporção. */
function camPropsVFovRad(fovParamRad, resX, resY) {
  const fov = fovParamRad || (Math.PI / 3);
  const rx = resX || 1920, ry = resY || 1080;
  if (rx >= ry) {
    // Paisagem/quadrado — `fov` é o FOV HORIZONTAL do quadrado limite (o
    // eixo maior); deriva o vertical a partir dele + da proporção (mesma
    // fórmula padrão pra converter FOV entre eixos: tan(metade) escala
    // linearmente com a proporção da tela/sensor).
    const aspect = rx / Math.max(1, ry);
    return 2 * Math.atan(Math.tan(fov / 2) / aspect);
  }
  // Retrato — `fov` já É o FOV VERTICAL do quadrado limite (o eixo maior
  // aqui é a altura) — usado direto, sem conversão nenhuma.
  return fov;
}

window.Cam3DMath = { rotY, rotX, cameraForward, cameraForwardFlat, cameraRightFlat, lerpAngle, camPropsVFovRad, objectPointerForward };

// CORRIGIDO (01/09/2026) — pedido verbatim: "O 'editar' dos modelos 3D
// parece estar com baixíssima resolução tanto para o preenchimento do
// modelo quanto para o gizmo." Mesmo algoritmo de suavização por "ângulo de
// vinco" (crease angle) aplicado em `js/modeler/modeler-mesh.js
// rebuildMeshGeometry` — extraído aqui como função solta (mesmo espírito de
// `objAnguloToRotY`, engine3d-profiles.js) pra ser reaproveitada pelos DOIS
// construtores deste arquivo que triangulam `{vertices, faces}` de uma
// malha customizada (`_buildCustomMeshObject` e `_buildMoldeMesh`, abaixo) —
// sem essa suavização, uma primitiva curva (cilindro/esfera/cone, ver o novo
// "Criar" da barra lateral estilo Blender do Modelador) desenhada aqui no
// mapa/objeto salvo ficaria facetada mesmo com muitos segmentos, apesar de
// já aparecer lisa DENTRO do Modelador (que usa a mesma função na cópia
// acima) — o objeto salvo/fora de edição precisava do mesmo tratamento.
// NOVO (07/09/2026), pedido verbatim: "Também a possibilidade de mudar de
// cor as faces. [...] Definir cor para as faces." — parâmetro NOVO
// `faceColorsRGB` (opcional; `{ [indiceDaFace]: [r,g,b] }`, 0..1 cada,
// mais uma chave especial `__default` pra faces SEM override — sempre
// preenchida por quem chama, ver `_buildCustomMeshObject`) — quando
// presente, a geometria ganha um atributo `color` por VÉRTICE (cada
// triângulo herda a cor da FACE de origem, `triFaceIdx` abaixo), pra a
// malha poder usar `vertexColors:true` no material (ver
// `_buildStandardMaterialForObj`). `faceColorsRGB` ausente/`null` = MESMO
// comportamento de sempre, sem nenhum atributo `color` (objeto sem cor por
// face customizada continua exatamente como era antes).
function buildSmoothedTriGeometry(THREE, verts, faces, faceColorsRGB) {
  const tris = [];
  const triFaceIdx = [];
  (faces || []).forEach((face, fi) => {
    if (!face || face.length < 3) return;
    for (let k = 1; k < face.length - 1; k++) {
      const ia = face[0], ib = face[k], ic = face[k + 1];
      if (!verts[ia] || !verts[ib] || !verts[ic]) continue;
      tris.push([ia, ib, ic]);
      triFaceIdx.push(fi);
    }
  });
  const geo = new THREE.BufferGeometry();
  if (!tris.length) return geo;
  const triNormals = tris.map(([ia, ib, ic]) => {
    const a = verts[ia], b = verts[ib], c = verts[ic];
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  });
  const trisPorVertice = new Map();
  tris.forEach((t, ti) => t.forEach((vi) => {
    if (!trisPorVertice.has(vi)) trisPorVertice.set(vi, []);
    trisPorVertice.get(vi).push(ti);
  }));
  const limiarCos = Math.cos(40 * Math.PI / 180);
  const positions = [];
  const normals = [];
  const colors = faceColorsRGB ? [] : null;
  tris.forEach((t, ti) => {
    const nEste = triNormals[ti];
    const corFace = colors ? (faceColorsRGB[triFaceIdx[ti]] || faceColorsRGB.__default || [1, 1, 1]) : null;
    t.forEach((vi) => {
      let sx = 0, sy = 0, sz = 0;
      trisPorVertice.get(vi).forEach((tj) => {
        const nOutro = triNormals[tj];
        const dot = nEste[0] * nOutro[0] + nEste[1] * nOutro[1] + nEste[2] * nOutro[2];
        if (dot >= limiarCos) { sx += nOutro[0]; sy += nOutro[1]; sz += nOutro[2]; }
      });
      const len = Math.hypot(sx, sy, sz) || 1;
      normals.push(sx / len, sy / len, sz / len);
      const p = verts[vi];
      positions.push(p[0], p[1], p[2]);
      if (colors) colors.push(corFace[0], corFace[1], corFace[2]);
    });
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

// `OBJECT3D_PROFILES`/`OBJECT3D_DEFAULT_PROFILE` (dimensões/forma/cor de
// cada tipo de objeto padrão) mudaram de casa na rodada 51 — ver
// js/engine3d-profiles.js. Continuam visíveis aqui como identificadores
// soltos (mesmo motivo do comentário sobre `objAnguloToRotY`, acima).

// Espessura fixa das paredes em 3D (a "espessura" configurável por parede no
// painel do 2D, ver mapview.js/mapping.js, hoje só é usada na renderização
// 2D — o 3D sempre desenhou todas as paredes com esta espessura fixa desde a
// migração pro Three.js; mantido assim aqui, só elevado a constante pra que
// o hit-test de raycasting das paredes (hoverPick) use o MESMO valor da
// malha visível, e não fique testando contra uma caixa de tamanho errado.
const WALL_THICKNESS_3D = 0.12;
// Exposta em window (mesmo padrão de OBJECT3D_DEFAULT_PROFILE acima) — pedido
// do usuário, 25/08/2026: view3d.js precisa deste MESMO valor pra testar
// colisão objeto×parede ao colocar objeto/item (ver view3d.js
// _resolveObjectWallCollision), sem duplicar o número solto em dois lugares.
window.WALL_THICKNESS_3D = WALL_THICKNESS_3D;

// `_hexToThreeColor` mudou de casa na rodada 51 — ver
// js/engine3d-profiles.js (mesmo motivo/mecanismo dos comentários acima).

// Versão fixa (pinada), como as outras bibliotecas em js/libloader.js —
// vendorizado em lib/ (era carregado do CDN jsdelivr) — o app funciona 100%
// offline, sem baixar nada de fora nem na primeira vez que o 3D abre.
//
// HISTÓRICO (duas causas reais já encontradas pro mesmo sintoma — tela 3D
// preta + toast "não consegui carregar o motor 3D" — NÃO apagar este
// histórico, ajuda a não reintroduzir nenhuma das duas):
// 1) Bare specifier: um import() dinâmico só resolve caminho relativo se
//    começar com "./"/"../"/"/" — "lib/three.module.js" sem o "./" na
//    frente era tratado como nome de pacote e REJEITADO de cara. Corrigido
//    trocando pro caminho com "./".
// 2) file:// (causa real, achada depois — o app roda direto de
//    file:///C:/.../index.html em pelo menos uma máquina do usuário, sem
//    servidor nenhum): mesmo com o caminho certo, `import()` dinâmico (e
//    também `fetch()`, tentado como fallback numa rodada anterior) SEMPRE
//    falha sob file:// no Chrome/Edge com "Failed to fetch" — cada arquivo
//    file:// é uma origem opaca isolada, e tanto o algoritmo de carregamento
//    de módulo ES quanto fetch/XHR fazem checagem de CORS, que falha nesse
//    esquema. só um <script src="..."> "clássico" (sem type="module") tem
//    uma isenção dessa checagem — é por isso que TODO o resto do app (todos
//    os outros js/*.js, carregados assim no index.html) já funciona normal
//    sob file://, e é o único jeito que também funciona pro Three.js.
//    Como three.module.js é um bundle ESM com UM ÚNICO ponto de sintaxe de
//    módulo (um `export { ... };` no final, sem nenhum `import` interno —
//    confirmado lendo o arquivo inteiro), dá pra gerar uma build "global"
//    equivalente trocando só essa linha final por `window.THREE = {...}` e
//    carregá-la como script clássico. Essa build fica em
//    `lib/three.global.js` (gerada a partir de `lib/three.module.js` — ver
//    `_loadThreeViaScriptTag` abaixo). `three.module.js` continua vendorizado
//    também, sem uso agora, caso um dia sirva de referência/precise virar
//    ESM de verdade de novo.
const THREE_GLOBAL_URL = './lib/three.global.js';
// NOVO (01/09/2026), pedido verbatim (item 12 da rodada de 13 itens): "As
// lâmpadas devem gerar luz de verdade de acordo com o tipo de lâmpada." O
// marcador "Area" do Modelador (ver PRIMITIVE_CATALOG.lampada, modeler-ui.js)
// usa um THREE.RectAreaLight de verdade — mas esse tipo de luz só ILUMINA
// alguma coisa depois que `RectAreaLightUniformsLib.init()` roda (gera as
// texturas LTC que o shader do MeshStandardMaterial usa, ver comentário
// grande no topo de `lib/RectAreaLightUniformsLib.global.js`, vendorizado
// pra este projeto do mesmo jeito que `three.module.js` virou
// `three.global.js`) — sem isso, o RectAreaLight existe mas não ilumina
// NADA, sem erro nenhum. Carregado JUNTO do Three.js (mesma tag `<script>`
// clássico via `_loadThreeViaScriptTag` abaixo), pra `init()` já ter
// rodado antes de qualquer cena que possa conter um RectAreaLight.
const RECTAREA_UNIFORMS_URL = './lib/RectAreaLightUniformsLib.global.js';

class Engine3D {
  // cfg.resolucao3D -> teto de devicePixelRatio usado pelo renderer. Maior
  // dpr = mais nítido, mas custa em pixels de verdade desenhados (quadrático
  // com a resolução) — é o botão de MAIOR impacto no FPS de todos os
  // configuráveis aqui, por isso é o primeiro que se mexe pra "ganhar FPS".
  static RESOLUCAO_DPR = { alta: 2, media: 1.5, baixa: 1 };

  // Luminárias adicionam uma luz de VERDADE cada (THREE.PointLight) — cada
  // luz a mais custa um laço extra no shader de FRAGMENTO da cena inteira
  // (todo objeto/parede/chão visível recalcula ela), diferente de geometria
  // (que só custa se estiver na tela). Um mapa com muitas luminárias só
  // acende as primeiras `MAX_LUMINARIA_LIGHTS` — as demais continuam
  // aparecendo normalmente, só sem espalhar luz própria (pedido do
  // usuário, ORIGINAL: "deve ter um limite de atuação para não pesar no
  // desempenho").
  // AJUSTADO (02/09/2026), pedido verbatim (rodada C): "Agora, à noite, ao
  // colocar uma luminária, ela deve produzir luz, inclusive no chão. Fiz um
  // teste, coloquei várias luminárias, algumas iluminam, porém outras não
  // iluminam (mesmo colocando várias). Deve ter ficado algum limite." —
  // CONFIRMADO: era exatamente este limite (12 luzes de verdade no total) +
  // `MAX_LUMINARIAS_ATIVAS` (só 4 acesas por vez, ver abaixo) — a partir da
  // 13ª luminária/poste colocado(a), nenhuma `PointLight` real era criada
  // pra ela (nunca ilumina nada, nem o chão, permanentemente, não é
  // throttling por distância). Isso tensiona com o pedido ORIGINAL (só
  // acima) que pediu esse limite justamente por causa de desempenho — em
  // vez de simplesmente aumentar um número fixo pra todo mundo (contradiz o
  // pedido antigo em telas fracas), os dois limites viraram TABELAS por
  // nível de qualidade 3D (`this._config.resolucao3D`, mesmo campo já usado
  // por `RESOLUCAO_DPR`/`_pixelRatioCap` — o usuário já escolhe esse nível
  // no painel de Configurações 3D): "baixa" preserva os números ORIGINAIS
  // (12/4, respeita o pedido antigo em hardware fraco); "média"/"alta" (o
  // padrão do app, ver `resolucao3D: 'alta'` no DEFAULTS acima) sobem bem
  // mais, cobrindo o teste do usuário ("coloquei várias") sem exigir
  // reescrever a arquitetura de limite compartilhado — ver `_maxLuzesReais`/
  // `_maxLuzesAtivas`, que leem esta tabela.
  static MAX_LUMINARIA_LIGHTS = { baixa: 12, media: 24, alta: 48 };

  // Quantas luzes de luminária ficam ACESAS ao mesmo tempo (ver
  // updateActiveLights) — distinto de MAX_LUMINARIA_LIGHTS (quantas EXISTEM
  // no total). Cada luz acesa soma um laço a mais no shader de FRAGMENTO —
  // um custo por PIXEL da tela inteira, não por objeto nem pra que lado a
  // câmera está olhando (pedido do usuário, ORIGINAL: "mesmo olhando para
  // uma parede, o FPS não está aumentando" — a parede também é feita de
  // pixels, e cada um deles calculava as luzes de qualquer jeito). Só as
  // mais PRÓXIMAS da câmera, a cada quadro, ficam ligadas — as demais
  // continuam existindo (não somem do mapa) e reacendem sozinhas se o
  // jogador chegar perto. AJUSTADO (02/09/2026) — mesmo motivo/mesma tabela
  // por `resolucao3D` documentados em MAX_LUMINARIA_LIGHTS acima.
  static MAX_LUMINARIAS_ATIVAS = { baixa: 4, media: 10, alta: 20 };

  /** Lê MAX_LUMINARIA_LIGHTS/MAX_LUMINARIAS_ATIVAS pro nível de qualidade 3D
   *  ATUAL do usuário (`this._config.resolucao3D`) — mesmo padrão de leitura
   *  já usado por `_pixelRatioCap` (RESOLUCAO_DPR). Cai em 'alta' (o mais
   *  permissivo) se o valor configurado for desconhecido/ausente — mesmo
   *  fallback já usado ali. */
  _maxLuzesReais() { return Engine3D.MAX_LUMINARIA_LIGHTS[this._config.resolucao3D] ?? Engine3D.MAX_LUMINARIA_LIGHTS.alta; }
  _maxLuzesAtivas() { return Engine3D.MAX_LUMINARIAS_ATIVAS[this._config.resolucao3D] ?? Engine3D.MAX_LUMINARIAS_ATIVAS.alta; }

  // NOVO (02/09/2026), pedido verbatim (rodada C): "O poste de luz deve
  // iluminar 3 vezes o que a luminária ilumina." — antes, `_buildLuminariaMesh`
  // e `_buildPosteMesh` tinham cada um seu `new THREE.PointLight(...)` com
  // números soltos e independentes (1.15/5.5 vs. 1.3/9 — o poste já era um
  // pouco mais forte, mas por escolha estética, não por nenhuma relação de
  // "3x"). Centralizados aqui como constantes: o poste agora lê a MESMA base
  // da luminária × 3, tanto em `intensity` (energia da luz) quanto em
  // `distance` (alcance/raio) — as duas grandezas que juntas definem "o
  // quanto uma PointLight ilumina" na prática (só triplicar a intensidade,
  // sem o alcance, deixaria o poste "mais forte só perto"; um poste de
  // iluminação pública precisa iluminar uma área bem maior que uma
  // luminária de teto, então o alcance entra na conta também).
  static LUZ_LUMINARIA_INTENSITY = 1.15;
  static LUZ_LUMINARIA_DISTANCE = 5.5;
  static LUZ_POSTE_INTENSITY = Engine3D.LUZ_LUMINARIA_INTENSITY * 3;
  static LUZ_POSTE_DISTANCE = Engine3D.LUZ_LUMINARIA_DISTANCE * 3;

  // NOVO (07/09/2026), pedido verbatim do usuário: "modularizar tudo, para
  // fazer divisões de tela como no blender reaproveitando os códigos como
  // instâncias de partes do app. Desse jeito, é possível tornar tão simples
  // quanto colocar um retângulo em algum lugar sendo exibido nele a
  // renderização 3D na resolução daquele retângulo [...] Ou também, por
  // exemplo, dá para fazer vários retângulos, cada um exibindo a
  // perspectiva de uma câmera. Com isso, deve ser possível resolver um
  // problema atual na 'miniatura 3D' no mapa 2D [...] Faça a modularização
  // do app de tal jeito que cada parte do app possa ser como um app a
  // parte."
  //
  // ==================== MODO "EYE" (opts.eye === true) ====================
  //
  // Changelog da versão anterior (setViewport/setScissor num canvas global
  // único), preservado abaixo:
  // REESCRITO (07/09/2026, mesmo dia — 2ª tentativa): a 1ª versão deste
  // modo compartilhado (`opts.shared`, ver changelog do sw.js v386/v387 pra
  // histórico) usava um <canvas> OCULTO fora do DOM + `drawImage` pra
  // copiar o resultado pro canvas visível de cada instância. Funcionava em
  // teoria, mas o usuário mandou o código de referência que ELE queria (um
  // .html de exemplo com "Sala de Monitoramento 3D — Múltiplas Câmeras"),
  // usando a técnica CLÁSSICA e muito mais simples/robusta do próprio
  // Three.js pra múltiplos viewports num contexto só:
  // `renderer.setViewport(...)` + `renderer.setScissor(...)` +
  // `renderer.setScissorTest(true)` antes de cada `renderer.render(...)`,
  // TUDO no MESMO <canvas> físico, sem canvas intermediário nenhum, sem
  // `drawImage`. Isso usava UM `<canvas>` global fixo cobrindo a janela
  // inteira (`Engine3D._globalCanvas`), com cada "olho" desenhando no
  // retângulo definido por `getBoundingClientRect()` do seu próprio canvas
  // "moldura" (nunca recebia contexto WebGL). Gerou uma sequência de bugs
  // ao longo de várias rodadas (tela azul residual ao fechar, "Ver em 3D"
  // não voltando pro mapa 2D, `display:none` sendo ignorado por
  // `!important` no CSS, piscada na tela toda ao ter "Ver em 3D" + miniatura
  // 3D simultâneos) — todos com a mesma raiz: coordenar POSIÇÃO NA TELA e
  // DPR de múltiplos "olhos" independentes disputando o MESMO canvas/buffer
  // físico é frágil por natureza (thrashing de dpr entre olhos com loops de
  // render independentes, mismatch de coordenadas, cascata de CSS).
  //
  // NOVA ARQUITETURA (07/09/2026, pedido verbatim do usuário, após enviar
  // arquivo de referência 'index2 (várias câmeras com resoluções
  // diferentes).html' e um prompt detalhado de engenharia especificando uso
  // de `THREE.WebGLRenderTarget`): "Sim, parta para a integração do
  // WebGLRenderTarget e abandonando setViewport/setScissor. Implemente tudo
  // e depois nos falamos." — `setViewport`/`setScissor`/`setScissorTest` e o
  // canvas global compartilhado (`#engine3d-global-canvas`) foram
  // COMPLETAMENTE ABANDONADOS. Cada "olho" agora tem seu próprio
  // framebuffer off-screen isolado (`THREE.WebGLRenderTarget`), com
  // resolução interna 100% independente dos outros "olhos" — sem nenhuma
  // disputa de buffer/dpr compartilhado, sem nenhuma dependência da posição
  // do elemento na tela.
  //
  // Como funciona agora:
  //
  // 1. Existe UM `THREE.WebGLRenderer` só (`Engine3D._sharedRenderer`),
  //    criado uma única vez, desenhando num <canvas> OFF-SCREEN que NUNCA é
  //    anexado ao DOM (nunca aparece na tela diretamente) — ele é só uma
  //    "fábrica de frames", nunca visível por si só. Este é o ÚNICO
  //    contexto WebGL que o app inteiro usa, ponto final (ver
  //    `_ensureSharedRenderer`).
  //
  // 2. Cada instância "eye" de Engine3D (`new Engine3D(canvasOlho, cfg,
  //    { eye: true })`) cria seu PRÓPRIO `THREE.WebGLRenderTarget(w, h)` —
  //    um framebuffer off-screen com resolução em pixels totalmente
  //    independente das outras instâncias (cada uma usa seu próprio teto de
  //    `RESOLUCAO_DPR` × o tamanho CSS do seu canvas). `canvasOlho` (o
  //    `<canvas>` que já existia no HTML de cada tela — `#map-minimap3d-
  //    canvas`, `#v3d-canvas`, etc.) agora recebe um contexto 2D comum
  //    (`getContext('2d')`, ver `this._displayCtx`) — não é mais WebGL nem
  //    uma "moldura" transparente: é a TELA final onde o resultado do
  //    render target é desenhado a cada frame.
  //
  // 3. A cada `render(camera)` desta instância: renderiza a cena NO SEU
  //    PRÓPRIO render target (`renderer.setRenderTarget(this.renderTarget)`
  //    → `renderer.render(scene, camera3)` → `renderer.setRenderTarget(null)`
  //    devolve o renderer ao estado neutro pro próximo "olho" usar), depois
  //    lê os pixels de volta pra CPU (`readRenderTargetPixels`) e desenha no
  //    `<canvas>` 2D visível daquele "olho" (`_presentToCanvas`, com um
  //    espelhamento vertical — WebGL usa origem embaixo-à-esquerda, Canvas2D
  //    usa origem em cima-à-esquerda). Como cada "olho" tem seu PRÓPRIO
  //    render target E seu PRÓPRIO canvas 2D de saída, não existe mais
  //    NENHUMA dependência de `getBoundingClientRect()`/posição na tela, nem
  //    NENHUMA disputa de buffer/dpr entre "olhos" simultâneos — o tamanho
  //    do render target vem só do tamanho CSS (`clientWidth`/`clientHeight`)
  //    do próprio canvas daquele "olho", igual ao modo não-eye de sempre.
  //
  // 4. Configurações que dependem da CRIAÇÃO do WebGLRenderer (antialiasing)
  //    continuam GLOBAIS — um recurso único compartilhado não pode ter "um
  //    antialiasing por instância" (sempre `false`, ver
  //    `_ensureSharedRenderer`). Mas a RESOLUÇÃO (`RESOLUCAO_DPR`) volta a
  //    ser 100% por instância, sem nenhum "por quadro, por quem renderizou
  //    por último" — cada "olho" tem seu próprio render target do tamanho
  //    que quiser, sempre, mesmo com vários "olhos" desenhando "ao mesmo
  //    tempo" (loops de rAF independentes, ex.: "Ver em 3D" + miniatura 3D).
  //    Cada instância continua tendo sua PRÓPRIA cena/câmera/config (luzes,
  //    distância de renderização, nº de luminárias reais, etc.) — só o
  //    contexto WebGL em si (e as opções fixas na criação dele) é que é
  //    compartilhado.
  //
  // Trade-off aceito conscientemente (avisado ao usuário no chat, não
  // testável sem navegador real): `readRenderTargetPixels` é uma leitura
  // SÍNCRONA da GPU pra CPU, que pode ter um custo de performance real,
  // principalmente pro "Ver em 3D" em tela cheia com dpr alto (mais pixels
  // pra ler por frame que a miniatura, que é pequena).
  //
  // Todos os 3 pontos do app que criam Engine3D usam `{ eye: true }` agora:
  // mapview.js (miniatura 3D), view3d.js ("Ver em 3D" em tela cheia — e o
  // Modelador 3D, que reaproveita a MESMA instância), e modelos3d.js
  // (prévia/editor de molde de objeto). Não existe mais nenhum caminho
  // "não-eye" ativo no app — mantido só como código morto documentado (ver
  // `_initThree`/`_resize`) caso algum consumidor futuro precise de um
  // contexto isolado de verdade por algum motivo (ex.: exportar uma
  // imagem/thumbnail offscreen sem afetar o que está na tela).
  constructor(canvas, initialConfig, opts) {
    this.canvas = canvas;
    this._eye = !!(opts && opts.eye);
    // [13/09/2026] NOVO — resolução de renderização CUSTOMIZADA (ver
    // mapconfig.js DEFAULTS.resolucaoCustom3D/view3d.js
    // _applyResolucaoCustom3D). `null` (padrão) = "Automática": `_resize()`
    // continua usando `clientWidth`/`clientHeight` × dpr, EXATAMENTE como
    // sempre — só quando `{w,h,fit}` é passado aqui (ou via
    // `setCustomRes3D`, chamada ao vivo pra reagir a uma mudança de config
    // sem precisar reabrir o "Ver em 3D") o render target passa a usar
    // `w`×`h` fixos em vez do tamanho do canvas — `fit` não é usado AQUI
    // dentro (é só repassado pra quem consulta `this._customRes.fit`, ver
    // view3d.js, que decide o CSS `object-fit` do canvas visível a partir
    // dele — motor 3D não mexe com CSS/DOM por conta própria). SÓ tem
    // efeito em modo "eye" (`this._eye`) — é o pipeline WebGLRenderTarget
    // dele (ver "MODO EYE" mais abaixo) que sabe desenhar numa resolução
    // diferente da do canvas; o modo não-eye (nenhuma tela usa mais, mas
    // mantido por segurança) ignora isto silenciosamente.
    this._customRes = (opts && opts.customRes && opts.customRes.w > 0 && opts.customRes.h > 0) ? { ...opts.customRes } : null;
    // [11/09/2026] NOVO — estado do gizmo "enquadramento" (retângulo
    // amarelo, ver setCameraFrustumsVisible/_fotoFrustumMeshesById).
    // [15/09/2026] o padrão tinha virado `true` (temporário, "pelo
    // momento": "No 'Ver em 3D', deixe, pelo momento, o enquadramento
    // (retângulo amarelo) de todas as câmeras sempre ativo").
    // [12/09/2026, RODADA SEGUINTE] REVERTIDO — pedido verbatim:
    // "Desabilite a impressão do amarrado amarelo de todas as câmeras.
    // Era só para testes." Confirma que a mudança de 15/09 era mesmo
    // temporária/de teste, como já documentado acima. Volta ao padrão
    // original: `false` — cada retângulo amarelo nasce OCULTO, só
    // ficando visível se o usuário ligar manualmente o botão
    // "🟨 Enquadramento" daquela câmera específica (aba lateral "Câmera",
    // ver view3d.js).
    this._frustumGizmosEnabled = false;
    // [10/09/2026] NOVO — pedido verbatim: "ao clicar em uma câmera e
    // selecionar 'Ver através desta câmera' [...] o clique está pegando a
    // própria câmera. O clique nela mesma deve ser desativado". Guarda
    // qual pickable (type+id) deve ser IGNORADO por `pickFromRay`/
    // `hoverPick`/`_hoverPickPixelPerfect` enquanto "vendo através" dela —
    // view3d.js liga isto ao entrar em `_fotoCamMode`/`_orbCamMode`
    // (`setPickExclude('fotoPin', fotoId)`/`setPickExclude('camera', camId)`)
    // e desliga ao sair (`clearPickExclude()` — ver _resetCamZoom). Sem
    // isto, o próprio orb/câmera calibrado (visível no cenário mesmo
    // enquanto se olha "através" dele) sempre "ganhava" da mira/clique por
    // estar bem na frente da câmera renderizada.
    this._pickExclude = null; // { type, id } | null
    // [10/09/2026] NOVO — ponto de tela (NDC -1..1) onde o MOUSE está,
    // enquanto `_fotoCamMode`/`_orbCamMode` ativos (ver view3d.js
    // `_pickAtClientPoint`/onMouseMove) — usado por `_updateHoverHighlight`
    // pra desenhar o MESMO destaque de mira (contorno pontilhado/hitbox/
    // tightbox, conforme a config) sob o CURSOR do mouse em vez de sob o
    // crosshair central (que nem aparece nesses modos). `null` = usa o
    // crosshair central de sempre (comportamento padrão, navegação normal).
    this._hoverScreenNdc = null;
    this.mode = 'solido'; // wireframe | solido | colorido
    this.pickables = []; // { id, pos:{x,y,z}, radius, ref, obb:{half:{x,y,z}, rotY} }
    this._ready = false;
    this._pendingScene = null;
    this._lastW = 0;
    this._lastH = 0;
    // Efeitos cosméticos de remoção (ver spawnCollectEffect/
    // spawnDemolishEffect/_updateEffects, chamado de dentro de render()) —
    // pedido do usuário: "recolhedor de itens... com animação, como no
    // Minecraft".
    this._effects = [];
    // NOVO (01/09/2026), item GRANDE #5 do pedido de 12 itens: "Deve ser
    // possível editar o modelo dos objetos 3D padrão. Também devem ter dois
    // modelos: um mais detalhado e um low poly." Moldes customizados POR
    // TIPO (não por objeto — isso já existe via obj.customMesh, ver
    // _buildCustomMeshObject), carregados 1x aqui em paralelo com o
    // Three.js (ver constructor abaixo) — na prática o Three.js (script
    // gigante) demora muito mais que esta leitura do IndexedDB, então por
    // volta de _initThree() rodar isto já resolveu quase sempre; se por
    // acaso não resolveu ainda na 1ª `setScene`, os objetos daquele tipo só
    // aparecem com o molde padrão/hard-coded até o próximo `setScene` (troca
    // de mapa, entrar/sair do modo de construção etc.) — aceitável, nunca
    // trava nem mostra objeto quebrado. Ver `refreshObjectModels()` (chamado
    // pelo editor de modelos ao salvar) pra atualizar isto e já redesenhar a
    // cena, sem precisar fechar/reabrir o 3D.
    this._objectModelsByTipo = {};
    this._carregarObjectModels();
    // Configurável pelo painel de configurações do mapa (MapConfig —
    // mapconfig.js), ver setConfig(). Valores padrão iguais a
    // MapConfig.DEFAULTS — repetidos aqui pra este arquivo não depender de
    // mapconfig.js ter carregado antes (a 3D pode, em teoria, ser usada sem
    // o menu de configurações nunca ter sido aberto). `initialConfig`
    // (passado por view3d.js, já lido do MapConfig ANTES de criar o motor)
    // deixa a config valendo já na primeira vez que a cena é montada — sem
    // isso, resolução/antialiasing só pegariam o padrão fixo na primeira
    // abertura, porque `_initThree` roda antes do primeiro `setConfig`.
    this._config = {
      raycastEnabled: true, raycastHighlightStyle: 'hitbox', raycastPrecision: 'hitbox',
      // Pedido do usuário (28/08/2026, rodada do Modelador 3D — "Não use
      // antialiasing"): o antialiasing só pode ser decidido na CRIAÇÃO do
      // WebGLRenderer (ver comentário grande em _initThree, logo abaixo,
      // sobre esta MESMA restrição) — não dá pra ligar/desligar isso
      // especificamente só enquanto o Modo de Edição do Modelador 3D
      // (js/modeler/*.js) estiver ativo, sem recriar o contexto WebGL
      // inteiro (perderia a cena/o estado da edição em andamento). Decisão
      // tomada: em vez disso, o PADRÃO do app inteiro passa a ser SEM
      // antialiasing (era `true`) — o visual "cru"/serrilhado que o próprio
      // Blender também usa no viewport por padrão (sem MSAA alto). Quem já
      // tinha "Antialiasing 3D" ligado explicitamente no painel de
      // configurações (MapConfig) continua vendo antialiasing normalmente —
      // só o PADRÃO de quem nunca mexeu nessa opção é que muda.
      renderDistance: 42, resolucao3D: 'alta', fpsLimite: 0, antialiasing3D: false,
      modoLuminarias3D: 'dinamico',
      // Ver mapconfig.js DEFAULTS (seção "🔗 Item associado") e
      // _addItemAssociadoDestaque logo abaixo.
      itemAssociado3DSelo: 'plaquinha', itemAssociado3DContorno: true,
      // "Destacar mais" (ver mapconfig.js DEFAULTS/_addBeaconDestaque/
      // _addAnelDouradoDestaque3D) e "Ver através das paredes" — três
      // interruptores independentes (ver mapconfig.js DEFAULTS.
      // itemBadge3DAtravesParedesAtivo/anelDourado3DAtravesParedesAtivo/
      // raioAzul3DAtravesParedesAtivo).
      destaqueExtra3DRaioAtivo: true, destaqueExtra3DDouradoAtivo: false,
      itemBadge3DAtravesParedesAtivo: true,
      anelDourado3DAtravesParedesAtivo: true, raioAzul3DAtravesParedesAtivo: true,
      // NOVO (07/09/2026) — ver mapconfig.js DEFAULTS.efeitoTelaEscurecida3D
      // e o comentário grande em `_initThree`/`_applyColorSpaceEfeito` pra
      // como isto é aplicado.
      efeitoTelaEscurecida3D: false,
      ...initialConfig,
    };
    this._loadPromise = Engine3D._loadThree()
      .then((THREE) => this._initThree(THREE))
      .catch((err) => {
        // Antes essa falha só ia pro console — de fora, o app ficava com uma
        // tela 3D preta, sem nenhum aviso do que deu errado (bug relatado
        // pelo usuário: "o 3D fica só uma tela preta"). Também zera o cache
        // estático da promessa (ver _loadThree abaixo): sem isso, uma
        // primeira falha (rede instável, Service Worker ainda atualizando o
        // cache do arquivo, etc.) ficava presa pra sempre — toda tentativa
        // seguinte de abrir o 3D reaproveitava essa MESMA promessa já
        // rejeitada e falhava de novo, sem nunca tentar carregar de novo.
        console.error('Falha ao carregar o motor 3D (Three.js):', err);
        Engine3D._threePromise = null;
        // Mostra o motivo REAL do erro no toast (antes era uma frase fixa,
        // igual pra qualquer causa — impossível diferenciar "sem internet" de
        // "servidor com Content-Type errado" de "WebGL indisponível" só
        // olhando a tela). Isso é o que faltava pra diagnosticar de verdade
        // quando o "não consegui carregar" volta a aparecer mesmo depois do
        // bug do bare-specifier corrigido.
        const detalhe = (err && (err.message || String(err))) || 'erro desconhecido';
        Utils.toast?.(`Não consegui carregar o motor 3D — verifique a conexão e tente "Ver em 3D" de novo. (${detalhe})`, { type: 'danger', duration: 7000 });
      });
  }

  static _loadThree() {
    if (!Engine3D._threePromise) {
      if (!window.THREE) Utils.toast?.('Carregando motor 3D (só na primeira vez)…', { duration: 3500 });
      Engine3D._threePromise = (window.THREE ? Promise.resolve(window.THREE) : Engine3D._loadThreeViaScriptTag())
        // NOVO (01/09/2026) — ver comentário grande em RECTAREA_UNIFORMS_URL,
        // acima. Encadeado nos DOIS caminhos (THREE já carregado de uma
        // sessão anterior do 3D OU carregando agora pela 1ª vez) — o "já
        // tinha window.THREE" sozinho não bastava, senão uma 2ª abertura do
        // 3D nunca chamaria isto (a Promise cacheada em `_threePromise`
        // resolveria direto pro THREE já existente).
        .then((THREE) => Engine3D._ensureRectAreaLightUniforms().then(() => THREE));
    }
    return Engine3D._threePromise;
  }

  // Carrega via <script src> clássico (ver histórico acima de
  // THREE_GLOBAL_URL) — nada de import()/fetch(), que falham sob file://.
  // Reaproveita uma tag já existente se `View3D`/`Engine3D` for aberto mais
  // de uma vez (evita injetar o script gigante repetido no <head>).
  static _loadThreeViaScriptTag() {
    return new Promise((resolve, reject) => {
      let tag = document.getElementById('three-global-script');
      if (tag) { tag.remove(); } // uma tentativa anterior pode ter falhado (ex.: arquivo ainda não existia) — tenta de novo do zero
      tag = document.createElement('script');
      tag.id = 'three-global-script';
      tag.src = THREE_GLOBAL_URL;
      tag.onload = () => {
        if (window.THREE) resolve(window.THREE);
        else reject(new Error(`${THREE_GLOBAL_URL} carregou mas não definiu window.THREE (build corrompida/desatualizada?)`));
      };
      tag.onerror = () => reject(new Error(`Falha ao carregar ${THREE_GLOBAL_URL} (arquivo ausente do lib/ ou corrompido)`));
      document.head.appendChild(tag);
    });
  }

  /** NOVO (01/09/2026) — ver comentário grande em RECTAREA_UNIFORMS_URL,
   *  acima. Carrega `lib/RectAreaLightUniformsLib.global.js` (mesma técnica
   *  de `<script>` clássico de `_loadThreeViaScriptTag`) e chama
   *  `.init()` UMA vez só (`_rectAreaUniformsPromise` cacheia — chamar
   *  `.init()` de novo recriaria as `DataTexture` à toa, sem necessidade,
   *  toda vez que uma nova cena/Modelador abre). Falha aqui NÃO derruba o
   *  carregamento do Three.js inteiro (o resto do app — paredes/objetos/
   *  outras luzes — não depende do RectAreaLight nenhum) — só avisa no
   *  console e segue; o pior caso é o marcador "Area" do Modelador ficar
   *  sem iluminar de verdade (mesmo "silenciosamente sem efeito" que já
   *  seria o padrão sem este arquivo, não uma regressão nova). */
  static _ensureRectAreaLightUniforms() {
    if (!Engine3D._rectAreaUniformsPromise) {
      Engine3D._rectAreaUniformsPromise = new Promise((resolve) => {
        if (window.RectAreaLightUniformsLib) { window.RectAreaLightUniformsLib.init(); resolve(); return; }
        const tag = document.createElement('script');
        tag.id = 'three-rectarea-uniforms-script';
        tag.src = RECTAREA_UNIFORMS_URL;
        tag.onload = () => {
          try { window.RectAreaLightUniformsLib?.init(); } catch (e) { console.warn('RectAreaLightUniformsLib.init() falhou:', e); }
          resolve();
        };
        tag.onerror = () => { console.warn(`Falha ao carregar ${RECTAREA_UNIFORMS_URL} — luz "Area" do Modelador não vai iluminar de verdade.`); resolve(); };
        document.head.appendChild(tag);
      });
    }
    return Engine3D._rectAreaUniformsPromise;
  }

  /** NOVO (01/09/2026), item GRANDE #5 — lê `DB.getAllObjectModels()` (ver
   *  db.js) e monta `this._objectModelsByTipo = { [tipo]: { detalhado,
   *  lowpoly } }` pra `_buildOneObjectMesh`/`_buildTypeMoldeMesh` consultarem
   *  na hora (síncrono) ao montar cada objeto — sem isto, cada objeto teria
   *  que esperar uma Promise individual pra saber se tem molde customizado,
   *  bem mais lento/complicado que ler uma vez e guardar em memória. */
  async _carregarObjectModels() {
    try {
      const lista = (await window.DB?.getAllObjectModels?.()) || [];
      const byTipo = {};
      lista.forEach((r) => {
        if (!r?.tipo || !r?.nivel) return;
        (byTipo[r.tipo] || (byTipo[r.tipo] = {}))[r.nivel] = r.mesh;
      });
      this._objectModelsByTipo = byTipo;
    } catch (e) { /* silencioso — sem molde nenhum, todo objeto cai no padrão hard-coded/perfil, comportamento de sempre */ }
  }

  /** Chamado pelo editor de modelos (ModelerMoldes, ver js/modeler/*.js) logo
   *  depois de salvar um molde novo/editado — releitura + reconstrução da
   *  cena JÁ ABERTA (se houver uma, ver `this.mapData`), pra quem estiver
   *  numa sessão 3D ao vivo ver o resultado sem precisar fechar e reabrir a
   *  tela. Sem cena aberta ainda (`this.mapData` null — motor recém-criado,
   *  nenhum `setScene` chamado ainda), não faz nada além de recarregar o
   *  cache — a próxima `setScene` já usa o molde novo naturalmente. */
  async refreshObjectModels() {
    await this._carregarObjectModels();
    if (this._ready && this.mapData) this.setScene(this.mapData);
  }

  /** NOVO (07/09/2026), reescrito na rodada da arquitetura WebGLRenderTarget
   *  — ver comentário grande "MODO EYE" no construtor. Cria (só na 1ª vez —
   *  cache estático, igual `Engine3D._threePromise`) o ÚNICO WebGLRenderer
   *  que o app inteiro usa em modo "eye" (`Engine3D._sharedRenderer`),
   *  desenhando num `<canvas>` OFF-SCREEN que nunca é anexado ao DOM (só
   *  serve de "fábrica de frames" pros render targets de cada "olho" — quem
   *  aparece na tela de verdade é sempre o `<canvas>` 2D de cada instância,
   *  ver `_presentToCanvas`). Reaproveitado por QUALQUER número de
   *  instâncias "eye" — é exatamente isto que evita o bug "Cannot read
   *  properties of null (reading 'precision')" (criar um 2º/3º/N-ésimo
   *  contexto WebGL simultâneo, que falha nesse hardware/driver — ver
   *  comentário grande no construtor): com o contexto compartilhado, só
   *  existe UM contexto WebGL na vida inteira da aba, não importa quantos
   *  "olhos" (miniatura, "Ver em 3D", prévia de molde, futuras câmeras)
   *  estejam ativos ao mesmo tempo.
   *  `antialias`/`outputColorSpace` são decisões GLOBAIS agora (só podem
   *  ser escolhidas na criação do renderer — não dá pra ter "um
   *  antialiasing por olho" com um contexto só) — usa sempre
   *  `antialias:false` (o padrão do app inteiro desde a rodada do
   *  Modelador, ver comentário grande em `_initThree` sobre isso, JÁ era a
   *  escolha da maioria dos usuários mesmo antes deste modo existir).
   *  Diferente da versão anterior (canvas global visível +
   *  setViewport/setScissor), este canvas NUNCA precisa de resize/dpr
   *  global nenhum — cada "olho" tem seu próprio `THREE.WebGLRenderTarget`
   *  com resolução independente (ver `_initThree`/`_resize`), então não
   *  existe mais `_resizeGlobalCanvas`/`_setGlobalCanvasVisible`/
   *  `_eyeViewportRect` nem contagem de "olhos" ativos — cada instância é
   *  totalmente isolada das outras. */
  static _ensureSharedRenderer(THREE) {
    if (!Engine3D._sharedRenderer) {
      // Canvas OFF-SCREEN de propósito: nunca é inserido no DOM
      // (`document.body.appendChild`/`insertBefore` nunca são chamados aqui)
      // — só existe pra dar um contexto WebGL ao renderer compartilhado.
      // `alpha:true` + `setClearColor(0x000000,0)` continuam necessários:
      // cada render target herda o alpha do renderer que o desenha, e sem
      // isso as áreas fora dos objetos da cena ficariam pretas em vez de
      // transparentes ao serem lidas de volta (`readRenderTargetPixels`) e
      // desenhadas no canvas 2D de cada "olho".
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = 1;
      offscreenCanvas.height = 1;
      Engine3D._sharedRenderer = new THREE.WebGLRenderer({ canvas: offscreenCanvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
      Engine3D._sharedRenderer.setClearColor(0x000000, 0);
      Engine3D._sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
      Engine3D._sharedRenderer.setPixelRatio(1); // sempre 1 aqui — o "dpr" de verdade de cada "olho" é aplicado no TAMANHO do seu próprio render target (ver _resize), nunca neste renderer
    }
    return Engine3D._sharedRenderer;
  }

  _initThree(THREE) {
    this.THREE = THREE;
    // Antialiasing só pode ser decidido na CRIAÇÃO do WebGLRenderer (não dá
    // pra ligar/desligar depois sem recriar o renderer inteiro) — por isso
    // lê de this._config aqui (já com o `initialConfig` do construtor) em
    // vez de um valor fixo. Mudar essa opção com o 3D já aberto só faz
    // efeito na próxima vez que a tela for aberta (ver painel em
    // mapconfig.js, que avisa isso no rótulo).
    // Pedido do usuário (28/08/2026, rodada do Modelador 3D — "Não use
    // antialiasing"): antialiasing só pode ser decidido na CRIAÇÃO do
    // WebGLRenderer (comentário logo acima, inalterado) — ou seja, não dá
    // pra ligar/desligar isso especificamente só enquanto o Modo de Edição
    // do modelador (js/modeler/*.js) estiver ativo sem recriar o contexto
    // WebGL inteiro (o que reiniciaria a cena/perderia estado no meio de uma
    // edição ao vivo). Decisão tomada: em vez disso, o PADRÃO deste app
    // passa a ser SEMPRE sem antialiasing (o "cru"/serrilhado que o próprio
    // Blender também usa no viewport por padrão, sem MSAA alto) — a opção
    // "Antialiasing 3D" do painel de configurações (MapConfig) continua
    // existindo e sendo respeitada (`this._config.antialiasing3D`), mas seu
    // padrão morre `false` agora (era `true`) em vez de forçar sempre `false`
    // incondicionalmente — quem já tinha essa opção LIGADA explicitamente
    // continua vendo antialiasing fora do modelador, e a pedra de toque do
    // pedido ("não use antialiasing") vale para quem nunca mexeu na opção.
    // REESCRITO (07/09/2026), arquitetura WebGLRenderTarget — ver
    // comentário grande "MODO EYE" no construtor. Em modo "eye", NUNCA
    // chama `this.canvas.getContext('webgl...')` — `this.canvas` (o
    // `<canvas>` desta instância, já existente no HTML de cada tela) recebe
    // um contexto 2D comum (`this._displayCtx`), pois é nele que o
    // resultado do render target é DESENHADO a cada frame (via
    // `_presentToCanvas`), nunca renderizado diretamente. Quem renderiza de
    // verdade é sempre `Engine3D._sharedRenderer` (off-screen, nunca visível
    // por si só — ver `_ensureSharedRenderer`), desenhando no
    // `THREE.WebGLRenderTarget` PRÓPRIO desta instância (`this.renderTarget`
    // — criado com tamanho 1x1 aqui, redimensionado de verdade por
    // `_resize()` na primeira vez que o tamanho CSS do canvas for conhecido).
    const renderer = this._eye
      ? Engine3D._ensureSharedRenderer(THREE)
      : new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this._config.antialiasing3D !== false, powerPreference: 'high-performance' });
    if (!this._eye) {
      renderer.setPixelRatio(this._pixelRatioCap());
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    this.renderer = renderer;
    if (this._eye) {
      // `depthBuffer:true`/`stencilBuffer:false` — mesmas opções que o
      // WebGLRenderer padrão usa por baixo dos panos; `RGBAFormat`+
      // `UnsignedByteType` — formato de pixel padrão de 8 bits por canal,
      // compatível com `readRenderTargetPixels` lendo direto pra um
      // `Uint8Array` (ver `_presentToCanvas`). `NearestFilter`/`LinearFilter`
      // aqui são IRRELEVANTES pro resultado final: como o caminho é
      // CPU-readback (não uma textura sendo amostrada por outro shader/quad
      // na GPU), `readRenderTargetPixels` sempre lê os texels 1:1, sem
      // filtragem nenhuma — o efeito "pixelizado" da miniatura (dpr baixo)
      // continua vindo só do CSS (`image-rendering:pixelated` em
      // `.map2d-minimap3d canvas`, ver style.css), pelo mesmo motivo de
      // sempre (canvas com poucos pixels de verdade, esticado por CSS).
      // BUG CORRIGIDO (07/09/2026), pedido verbatim: "Percebe-se na imagem
      // que as coisa estão mais claras. Atualmente, as coisas ficaram mais
      // escuras [...] As coisas devem voltar a ficar claras apenas." CAUSA
      // RAIZ: no Three.js, a conversão de espaço de cor linear -> sRGB
      // (`renderer.outputColorSpace = THREE.SRGBColorSpace`, ver logo acima
      // em `_ensureSharedRenderer`) só é aplicada automaticamente quando o
      // renderer desenha DIRETO no canvas de tela (`_currentRenderTarget
      // === null`) — ao desenhar num `WebGLRenderTarget` (nosso caso agora,
      // arquitetura desta mesma rodada), o Three.js usa o `colorSpace` da
      // TEXTURA do próprio render target pra decidir a conversão, que por
      // padrão NÃO é sRGB. Sem isto, os pixels lidos de volta por
      // `readRenderTargetPixels` saíam em espaço LINEAR (mais escuro), mas
      // eram exibidos pelo `<canvas>` 2D como se já fossem sRGB (mais claro)
      // — daí a cena inteira aparecer mais escura do que antes (quando o
      // WebGLRenderer desenhava direto no canvas global visível, aplicando
      // a conversão sozinho). Corrigido: `colorSpace: THREE.SRGBColorSpace`
      // na textura do render target — a MESMA conversão que o canvas de
      // tela sempre aplicou sozinho.
      //
      // NOVO (07/09/2026), rodada seguinte, pedido verbatim: "Coloque nas
      // 'configurações 3D', em uma seção de 'Efeitos de tela' este efeito
      // de escurecimento, quando está sem o 'colorSpace:
      // THREE.SRGBColorSpace' como opção nesta seção." — em vez de deixar
      // `colorSpace` fixo aqui, o valor inicial já vem de
      // `_colorSpaceEfeito()` (lê `this._config.efeitoTelaEscurecida3D`,
      // já disponível neste ponto — `_initThree` roda DEPOIS do
      // `initialConfig` ser mesclado no construtor). `setConfig()` também
      // reaplica isto (`_applyColorSpaceEfeito`, ver lá).
      // BUG CORRIGIDO/RESSALVA (07/09/2026), rodada seguinte, pedido
      // verbatim: "Está sendo necessário sair e entra no 'Ver em 3D' para
      // que seja aplicado [...] Se não for possível aplicar direto, coloque
      // uma informação dizendo 'saia da tela do 3D e entre novamente para
      // aplicar o efeito'." — na prática, só trocar
      // `this.renderTarget.texture.colorSpace` (via `_applyColorSpaceEfeito`)
      // NÃO bastou pra atualizar a cena já em tela, mesmo essa troca sendo a
      // forma documentada/correta do Three.js — o motivo mais provável
      // (não confirmável sem navegador de verdade nesta sessão, sem
      // Playwright) é o renderer reaproveitar o PROGRAM/shader já compilado
      // de cada material entre quadros, sem perceber que o `colorSpace` do
      // render target mudou. Continua tentando aplicar ao vivo aqui (não
      // atrapalha, e cobre o caminho "documentado"), mas o painel de
      // configurações (mapconfig.js, `mc-efeito-tela-escurecida3d`) agora
      // avisa a limitação real: sair/entrar no "Ver em 3D" de novo (que
      // recria esta instância inteira do zero, com o render target já na
      // config certa desde `_initThree`) SEMPRE aplica corretamente.
      this.renderTarget = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
        colorSpace: this._colorSpaceEfeito(),
        depthBuffer: true, stencilBuffer: false,
      });
      this._rtPixelW = 1; this._rtPixelH = 1;
      this._rtPixelBuffer = new Uint8Array(4);
      // Contexto 2D do <canvas> visível desta instância (a saída final) +
      // um canvas AUXILIAR off-screen (nunca anexado ao DOM), necessário
      // porque `putImageData` (única forma de jogar um `Uint8Array` de
      // pixels crus num canvas 2D) NÃO respeita `ctx.setTransform` — pra
      // aplicar o espelhamento vertical (WebGL: linha 0 embaixo; Canvas2D:
      // linha 0 em cima) é preciso primeiro `putImageData` num canvas
      // "cru" (sem transformar) e DEPOIS `drawImage` dele pro canvas visível
      // COM a transformação — `drawImage` (ao contrário de `putImageData`)
      // respeita `ctx.setTransform`. Ver `_presentToCanvas`.
      this._displayCtx = this.canvas.getContext('2d');
      this._rtOffscreen = document.createElement('canvas');
      this._rtOffscreen.width = 1; this._rtOffscreen.height = 1;
      this._rtOffCtx = this._rtOffscreen.getContext('2d');
      // [12/09/2026] NOVO — ver `setFotoCamBackdropMask`/`_presentToCanvas`
      // logo abaixo, pro motivo completo desta máscara existir.
      this._fotoCamMask = null;
      // [13/09/2026] NOVO — pedido verbatim: "A transparência do vidro
      // ainda está rosa, use um buffer a parte, se for ajudar a resolver
      // isso. Renderize o vidro em um buffer a parte e depois imprima-o
      // ali para que não fique rosa e sim 'normal'." Ver comentário grande
      // em `_renderGlassPass`/`_presentToCanvas` (mais abaixo) pra
      // arquitetura completa — resumo: o vidro é escondido (`visible=false`)
      // durante o render PRINCIPAL (`this.renderTarget`, nunca mais toca o
      // marcador magenta) e renderizado sozinho, DEPOIS, neste 2º render
      // target (`this._glassRenderTarget`) — TRANSPARENTE de verdade
      // (limpo com alfa=0), testando profundidade contra o que já foi
      // desenhado no 1º passo (`this._glassDepthTexture`, COMPARTILHADA
      // entre os 2 render targets — técnica padrão do Three.js pra reusar
      // profundidade entre passes sem re-renderizar a cena inteira de
      // novo). O resultado é composto por cima do canvas final (depois da
      // foto/máscara) em `_presentToCanvas`, com alfa de verdade — vidro
      // nunca mais "vê" o magenta, então nunca mais mistura com ele.
      this._glassDepthTexture = new THREE.DepthTexture(1, 1);
      this.renderTarget.depthTexture = this._glassDepthTexture;
      this._glassRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
        colorSpace: this._colorSpaceEfeito(),
        depthBuffer: true, stencilBuffer: false,
        depthTexture: this._glassDepthTexture,
      });
      this._glassPixelBuffer = new Uint8Array(4);
      // [22/09/2026] NOVO — pedido verbatim: "ao estar selecionado 'Trás'
      // e variar a opacidade [...] nem o chão e nem a neblina aparecem
      // atrás da imagem (aparece apenas a cor do céu) [...] Ao colocar a
      // opacidade = 0, então, deve ser possível ver tudo que está atrás da
      // imagem (como ver através de uma janela)." — CORREÇÃO EM 2 ROUNDS:
      // a 1ª tentativa desligava o oclusor/máscara com opacidade<1 e
      // botava a foto por CIMA de tudo (translúcida) — o usuário corrigiu:
      // "a imagem deve continuar atrás dos objetos [reais]. Você colocou
      // ela para frente." SOLUÇÃO DE VERDADE (sem tocar em nada da
      // ordem de empilhamento/oclusão principal, que fica 100% intacta):
      // um 3º render target — `_backdropEnvRenderTarget` — mesmo padrão de
      // `_glassRenderTarget`/`_renderGlassOnlyPass` (2 passes), só que
      // AO CONTRÁRIO na intenção: em vez de mostrar algo que foi ESCONDIDO
      // do passe principal (o vidro), este mostra a cena SEM o
      // oclusor/máscara do 'Trás' — ou seja, o ambiente real (chão,
      // neblina, paredes distantes) exatamente como apareceria se o
      // backdrop 'Trás' estivesse desligado. `_presentToCanvas` compõe
      // este resultado por CIMA da imagem já finalizada (foto+objetos
      // reais, intocados), mas SÓ dentro do retângulo da foto e com
      // `ctx.globalAlpha=(1-opacidade)` — recuo proporcional: opacidade=1
      // não muda nada (alfa 0, comportamento de sempre); opacidade=0
      // revela o ambiente real por completo ali (alfa 1, efeito
      // "janela"); opacidades intermediárias misturam os dois. Não precisa
      // compartilhar profundidade com o passe principal (ao contrário do
      // vidro) — é uma renderização COMPLETA e independente da cena
      // (inclusive objetos reais mais perto continuam ocluindo o chão/
      // paredes normalmente ali dentro, por conta própria).
      this._backdropEnvRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
        colorSpace: this._colorSpaceEfeito(),
        depthBuffer: true, stencilBuffer: false,
      });
      this._backdropEnvPixelBuffer = new Uint8Array(4);
      this._backdropEnvPassActive = false;
    }

    // Céu/luz de acordo com o horário REAL do relógio do dispositivo (pedido
    // do usuário: "faça o céu ficar de acordo com o período do dia... agora
    // é noite, então fica escuro mesmo" — ou seja, o escuro fixo de antes
    // não era um bug, só faltava variar com a hora) — ver _skyPalette logo
    // abaixo pros horários-chave (madrugada/amanhecer/dia/entardecer/noite).
    const scene = new THREE.Scene();
    const rd = this._renderDistance();
    // Cor/neblina de verdade só são aplicadas por _updateSky() logo abaixo
    // (junto com o Sol/Lua) — os valores aqui são só placeholders até lá.
    scene.fog = new THREE.Fog(0x05070a, this._fogNear(rd), rd);
    this.scene = scene;

    // far da câmera com folga acima da neblina (mesma proporção do valor
    // original fixo, 100/42 ≈ 2.4×) — evita o plano de corte da câmera
    // "estourar" bem em cima de onde a neblina já devia ter escondido tudo.
    // [13/09/2026] NOVO — pedido verbatim: "controles de plano de corte
    // próximo/distante (z_near/z_far)... em 'Desempenho 3D'". `this._config`
    // já tem o `initialConfig` do construtor mesclado a esta altura (ver
    // `this._config = { ...DEFAULT_CONFIG, ...initialConfig }` acima em
    // `_initThree`/constructor), então uma janela "Ver em 3D" recém-aberta
    // já nasce com o near/far persistidos, sem esperar o 1º `setConfig()`
    // (ver mapconfig.js DEFAULTS.cameraZNear/cameraZFar). `cameraZNear`
    // ausente/inválido cai no 0.1 de sempre; `cameraZFar` ausente/null (o
    // padrão — "automático") cai no MESMO cálculo dinâmico de sempre —
    // nenhuma mudança de comportamento pra quem nunca mexeu nesses campos.
    const nearInicial = (Number.isFinite(this._config.cameraZNear) && this._config.cameraZNear > 0) ? this._config.cameraZNear : 0.1;
    const farInicial = (Number.isFinite(this._config.cameraZFar) && this._config.cameraZFar > 0) ? this._config.cameraZFar : Math.max(rd * 2.4, 60);
    this.camera3 = new THREE.PerspectiveCamera(72, 1, nearInicial, farInicial);
    this.camera3.up.set(0, 1, 0);

    this._hemiLight = new THREE.HemisphereLight(0x1a2436, 0x05060a, 0.35);
    scene.add(this._hemiLight);
    const dir = new THREE.DirectionalLight(0x33445c, 0.08);
    dir.position.set(4.5, 8.5, -3);
    scene.add(dir);
    this._dirLight = dir;
    this._ambientLight = new THREE.AmbientLight(0xffffff, 0.06);
    scene.add(this._ambientLight);

    // NOVO (01/09/2026), item #10 do pedido de 12 itens, verbatim: "Implemente
    // o Sol e a Lua no cenário 3D." Antes só existia a PALETA de céu/luz
    // variando por hora (_skyPalette, comentário grande logo abaixo) — sem
    // nenhum astro visível de verdade cruzando o céu. Cria as duas esferas
    // autoiluminadas (ver _buildCelestialBodies) e já posiciona/colore tudo
    // (fundo, neblina, luzes, Sol, Lua) pro horário atual, uma única vez
    // aqui — o resto das atualizações (a cada ~30s, sem custo perceptível de
    // recalcular só 2 posições/algumas cores) acontece em render(), ver
    // _updateSky.
    this._buildCelestialBodies(THREE);
    this._lastSkyUpdateAt = 0;
    this._updateSky();

    this._group = new THREE.Group();
    scene.add(this._group);
    this._floorTexture = this._buildCheckerTexture();
    // Pedido do usuário: "todo vidro no projeto deve ser representado como no
    // Minecraft" — UMA textura só, compartilhada por TODA janela da cena
    // (mesmo espírito de _floorTexture acima — construída uma vez, nunca por
    // elemento), ver _buildGlassShineTexture/_buildGlassPane logo abaixo.
    this._glassShineTexture = this._buildGlassShineTexture();
    this._initHoverHighlight(THREE, scene);
    // Usado só quando raycastPrecision === 'pixelperfect' (ver hoverPick) —
    // testa a malha de verdade triângulo a triângulo, em vez da aproximação
    // por esfera/caixa usada no modo 'hitbox' (mais rápido, mas impreciso
    // nos cantos/bordas de formas não-esféricas).
    this._raycaster = new THREE.Raycaster();
    this._pickMeshes = [];
    // [26/09/2026] NOVO — refatoração InstancedMesh (pedido do usuário: "então,
    // refatore a engine3D", perf/organização mesmo sem milhares de objetos
    // ainda no mapa). Pool de THREE.InstancedMesh por `tipo` de objeto
    // GENÉRICO de catálogo (o ramo comum de `_buildOneObjectMesh`, não
    // mesa/luminária/poste/escada/molde/imagem/.obj/retângulo/polígono, que
    // continuam 100% como sempre foram, uma malha por objeto) — montado do
    // zero em `_rebuildInstancedPools` (chamado no fim de `setScene`).
    // DESENHO ACEITO, documentado aqui pra quem mexer depois: `this.pickables`
    // e `this._pickMeshes` continuam EXATAMENTE como sempre — uma entrada por
    // objeto, byte-idêntico a antes — o pick/raycast nunca soube nem precisa
    // saber que existe instancing (o raycaster deste projeto já é confirmado,
    // por teste ao vivo, a acertar malhas com `.visible=false`). O que muda é
    // só a malha VISÍVEL de cada objeto elegível: ela vira invisível
    // (`mesh.visible=false`) e um InstancedMesh irmão
    // (`this._instancedPools[poolKey]` — poolKey = "tipo::piso", ver
    // comentário grande de frustum culling em `_rebuildInstancedPools`,
    // 13/09/2026: o pool é por tipo+ANDAR, não só por tipo, senão a bounding
    // sphere automática do InstancedMesh cobriria o prédio inteiro e nunca
    // seria cortada pelo frustum) passa a desenhá-la, com a MESMA posição/
    // rotação (`mesh.userData._inst.matrix`,
    // cópia da matriz calculada do jeito de sempre) e a MESMA cor por
    // instância (`InstancedMesh.setColorAt`, testado disponível nesta versão
    // do three.js). Objetos incrementais (`addObjectIncremental`) NÃO entram
    // num pool (crescer um InstancedMesh já criado exigiria descartar e
    // recriar ele inteiro — mais risco que ganho pra um objeto só) — ficam
    // desenhados INDIVIDUALMENTE, do jeito de sempre, até o próximo `setScene`
    // completo (troca de andar, reabrir o mapa) reagrupar tudo nos pools —
    // igual ao próprio `_tintForLight`/luminárias incrementais logo abaixo,
    // mesmo espírito de "pequena defasagem aceita, nunca incorreção
    // permanente". `setXRayTarget`/`setGlobalXRay`/`_updateDistanceCulling`
    // foram adaptados (ver `_instancePromote`/`_instanceDemote`/
    // `_syncInstanceVisibility` abaixo) pra manter a malha individual e a
    // instância dela SEMPRE em sincronia, nunca desenhando as duas ao mesmo
    // tempo (dobraria o objeto na tela) nem nenhuma das duas (sumiria).
    this._instancedPools = {};
    // [13/09/2026] NOVO — cache das texturas procedurais de piso "Lajota" e
    // "Teto modular" (ver `_getCanvasTextureCached` abaixo). Chave = string
    // composta (tipo + dimensões reais em metros, já que o `texture.repeat`
    // depende do tamanho do objeto) — evita recriar um `<canvas>` +
    // `THREE.CanvasTexture` a cada `_buildOneObjectMesh` (chamado pra TODO
    // objeto do mapa, inclusive numa reconstrução de cena inteira com
    // centenas de objetos) quando várias instâncias do mesmo tipo/tamanho já
    // compartilhariam a mesma textura pronta. Vive na instância do motor (não
    // em `window`) pra ser descartada junto com ele (`dispose`, ver abaixo).
    this._texturaProceduralCache = {};

    this._ready = true;
    if (this._pendingScene) {
      const pending = this._pendingScene;
      this._pendingScene = null;
      this.setScene(pending);
    }
  }

  /** Textura xadrez pequena (repetida) pro chão — mesmo efeito "lowpoly" de
   *  antes (grade 2x2m alternando duas cores), agora como textura real em
   *  vez de centenas de quadrados desenhados um a um. */
  _buildCheckerTexture() {
    const THREE = this.THREE;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(42,47,56)'; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgb(34,38,46)';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    // Pedido do usuário: "os quadrados do chão devem ter o padrão de 1m x 1m
    // PARA TODO O CHÃO" — perto da câmera os quadrados de 1m já apareciam
    // certos, mas longe (ou olhando bem de raspão pro chão) o filtro padrão
    // do Three.js pra encolher texturas (minFilter = mipmap, que borra/
    // mistura cor com as vizinhas pra evitar serrilhado) ia progressivamente
    // borrando o xadrez até virar um cinza liso sem quadrado nenhum — ou
    // seja, o padrão de 1m só "existia" perto, não em todo o chão como
    // pedido. generateMipmaps=false + minFilter=NearestFilter (mesmo do
    // magFilter já usado) tira essa mistura: cada quadrado de 1m fica nítido
    // em qualquer distância (o preço é um pouco de "flicker"/serrilhado bem
    // longe, aceitável no estilo lowpoly que esse chão já usa de propósito).
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Textura do "vidro estilo Minecraft" — pedido do usuário: "todo vidro no
   *  projeto deve ser representado como no Minecraft. Não imprime nada
   *  naquela região onde tem o vidro, mas coloca um detalhe (como se fosse um
   *  brilho ou um reflexo) indicando que ali há uma superfície. Apenas esse
   *  detalhe para não pesar no desempenho, com cálculos de reflexo e
   *  translúcido e considerando luz ambiente." Ou seja: NADA de material
   *  translúcido de verdade (sem THREE.MeshPhysicalMaterial/transmission,
   *  sem reflexo de ambiente — tudo isso custa caro por pixel, recalculado
   *  todo quadro) — só uma textura ESTÁTICA e barata (desenhada uma vez, sem
   *  luz nenhuma envolvida — ver _buildGlassPane, usa MeshBasicMaterial, que
   *  não reage a luz/sombra igual o resto da cena) com: quase tudo
   *  TRANSPARENTE de propósito (canvas começa limpo, sem nada pintado — "não
   *  imprime nada naquela região"), um contorno bem sutil (só pra sugerir a
   *  borda do vidro) e uma faixa diagonal clara (o "brilho/reflexo" pedido,
   *  só um desenho estático — não é reflexo de verdade da cena). */
  _buildGlassShineTexture() {
    const THREE = this.THREE;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128); // transparente por padrão — "não imprime nada naquela região onde tem o vidro"
    // Contorno bem sutil (indica só a BORDA do painel de vidro em si, dentro
    // da moldura de metal — que é uma malha própria, ver _buildGlassPane).
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 124, 124);
    // "Brilho/reflexo" — uma faixa diagonal clara, ESTÁTICA (desenhada uma
    // vez aqui, nunca recalculada por quadro/ângulo de câmera/luz — é só um
    // desenho, não um reflexo de verdade) — o suficiente pra olho perceber
    // "isso é vidro", sem nenhum custo de reflexo/translucidez real.
    const grad = ctx.createLinearGradient(0, 128, 128, 0);
    grad.addColorStop(0.00, 'rgba(255,255,255,0)');
    grad.addColorStop(0.40, 'rgba(255,255,255,0)');
    grad.addColorStop(0.50, 'rgba(255,255,255,0.38)');
    grad.addColorStop(0.60, 'rgba(255,255,255,0)');
    grad.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Painel de vidro "Minecraft" — um plano BEM fino (não uma caixa opaca),
   *  material SEM luz nenhuma (MeshBasicMaterial — pedido do usuário: "sem
   *  considerar luz ambiente"), com a textura acima (quase tudo transparente,
   *  só um contorno+brilho estático). `depthWrite:false` evita os artefatos
   *  visuais comuns de duas malhas semi-transparentes sobrepostas ("z-fight"
   *  de transparência) sem custar nada perceptível aqui (é só UM plano fino
   *  por vidro, não uma pilha deles). Reaproveita a MESMA textura
   *  (_glassShineTexture, construída uma vez em _initThree) pra qualquer
   *  vidro da cena — janela genérica ou a de correr detalhada, ver
   *  buildDoorOrWindowMesh/buildJanelaCorrer2Folhas mais abaixo. */
  _buildGlassPane(w, h) {
    const THREE = this.THREE;
    const geo = new THREE.PlaneGeometry(Math.max(w, 0.01), Math.max(h, 0.01));
    const mat = new THREE.MeshBasicMaterial({
      map: this._glassShineTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // [12/09/2026] NOVO, [13/09/2026] REVERTIDO (tentativa de desligar o
    // vidro inteiro), [13/09/2026 — RODADA SEGUINTE] SUBSTITUÍDO DE VEZ —
    // pedido verbatim: "A transparência do vidro ainda está rosa, use um
    // buffer a parte, se for ajudar a resolver isso. Renderize o vidro em
    // um buffer a parte e depois imprima-o ali para que não fique rosa e
    // sim 'normal'." A tolerância de cor (rodada anterior) não bastou — o
    // vidro continuava rosa em partes com mais alfa (bordas mais opacas).
    // CORRIGIDO DE VERDADE, seguindo a sugestão do usuário: guarda a MALHA
    // aqui (`this._glassMeshesAtivos`, limpa a cada rebuild — ver
    // `_disposeGroupContents`) pra `_renderGlassPass` poder escondê-la do
    // render PRINCIPAL (nunca mais toca o marcador magenta) e desenhá-la
    // SOZINHA, depois, num render target à parte — ver comentário grande
    // em `_renderGlassPass`/`_presentToCanvas` pra arquitetura completa.
    if (!this._glassMeshesAtivos) this._glassMeshesAtivos = [];
    this._glassMeshesAtivos.push(mesh);
    return mesh;
  }

  /** [12/09/2026] NOVO, [13/09/2026] AJUSTADO 2x — pedido verbatim
   *  (13/09/2026, 1ª correção): "Confirmado, não precisa aparecer mais o
   *  chão quando está marcado 'Trás'." — 1ª tentativa desligava
   *  `colorWrite` do chão INTEIRO (toda a tela) enquanto 'Trás' ativo.
   *  Pedido verbatim de correção (13/09/2026, 2ª rodada): "O 'desligar' do
   *  chão, quando está marcado 'Trás' é só na região de impressão da
   *  imagem para não ter aquele problema de ser impresso só a parte de
   *  cima dela. Desligar a impressão do chão fez com que resolvesse o
   *  problema, porém o chão deve ser 'desligado', só na região de
   *  impressão da imagem para não bloqueá-la." — desligar a tela INTEIRA
   *  escondia o chão até em partes da tela fora do quadro da foto, onde
   *  ele deveria continuar aparecendo normalmente. CORRIGIDO DE VERDADE:
   *  o chão não usa mais `colorWrite` global nenhum — ver
   *  `_updateFloorMaskUniform` (chamado todo quadro, ANTES do render, por
   *  `_presentFrame`) e o `onBeforeCompile` do material do chão (criado
   *  junto com ele, em `setScene`): um pedaço de shader a mais, no
   *  FRAGMENT shader, compara `gl_FragCoord.xy` (posição do pixel na
   *  tela) contra o MESMO retângulo usado por `_presentToCanvas`
   *  (`_computeFotoCamMaskRawRect`, fonte única) — só DENTRO desse
   *  retângulo o chão pinta a cor-marcadora (pra máscara poder "furar" e
   *  revelar a foto ali) em vez da sua textura quadriculada normal; FORA
   *  dele, pinta normalmente, sem nenhuma mudança. Esta função só guarda
   *  a flag (`this._fotoCamBackdropMaskAtiva`) que `_updateFloorMaskUniform`
   *  usa; NÃO mexe mais no vidro (ver `_buildGlassPane`, acima — o vidro é
   *  resolvido pela tolerância de cor em `_presentToCanvas`, técnica
   *  diferente — ver item 19 do progresso do projeto pro motivo de usar 2
   *  técnicas diferentes pra 2 problemas parecidos).*/
  setFotoCamBackdropMaskActive(active) {
    this._fotoCamBackdropMaskAtiva = !!active;
  }

  /** [13/09/2026] NOVO — ver comentário grande em
   *  `setFotoCamBackdropMaskActive`, acima. Chamado por `_presentFrame`
   *  (mesmo lugar de sempre, ANTES de `renderer.render()` — o shader
   *  precisa dos uniforms JÁ atualizados pro quadro que está prestes a
   *  desenhar; atualizar DEPOIS não adiantaria nada). Sem custo
   *  perceptível (só matemática, nenhum acesso à GPU além de já ir
   *  atualizar os uniforms de qualquer jeito). */
  _updateFloorMaskUniform() {
    const shader = this._floorMesh?.material?.userData?.fotoCamMaskShader;
    if (!shader) return;
    const rawRect = this._fotoCamBackdropMaskAtiva ? this._computeFotoCamMaskRawRect() : null;
    if (rawRect && this._fotoCamMask?.color) {
      shader.uniforms.uFotoCamMaskAtiva.value = 1;
      shader.uniforms.uFotoCamMaskRect.value.set(rawRect.maskLeftPx, rawRect.maskRawTopPx, rawRect.maskWPx, rawRect.maskHPx);
      const [mr, mg, mb] = this._fotoCamMask.color;
      shader.uniforms.uFotoCamMaskCor.value.set(mr / 255, mg / 255, mb / 255);
    } else {
      shader.uniforms.uFotoCamMaskAtiva.value = 0;
    }
  }

  /** Malhas reaproveitadas (criadas UMA vez aqui, nunca recriadas por
   *  quadro/troca de mapa — só reposicionadas/reescaladas, ver
   *  _updateHoverHighlight) pro destaque contínuo de raycasting: o raio da
   *  mira (o MESMO de centerRay — sempre reto pra frente, passando pelo
   *  ponto da câmera e pelo centro da tela) é testado A CADA QUADRO (não só
   *  ao tocar/clicar) contra chão, paredes e os pickables já existentes
   *  (item/câmera/objeto), destacando o mais próximo. Ficam FORA de `_group`
   *  de propósito — `_disposeGroupContents` (chamado a cada troca de modo)
   *  não deve mexer nelas, senão "piscariam" a cada troca; são liberadas só
   *  no dispose() final (ver lá). Um submenu pra configurar isso (o quê
   *  destacar, cor, ligar/desligar) fica pra depois — combinado com o
   *  usuário ("ainda vamos fazer") — aqui só o destaque sempre-ligado. */
  _initHoverHighlight(THREE, scene) {
    // Opacidades baixas de propósito ("destaques mais suaves", pedido do
    // usuário) — o objetivo é dar uma pista discreta de "é nisto que você
    // está mirando", não ofuscar a cena.
    this._hoverTile = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff275, transparent: true, opacity: 0.22 }),
    );
    this._hoverTile.rotation.x = -Math.PI / 2;
    this._hoverTile.visible = false;
    scene.add(this._hoverTile);

    this._hoverWall = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff275, transparent: true, opacity: 0.2 }),
    );
    this._hoverWall.visible = false;
    scene.add(this._hoverWall);

    this._hoverPick = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff275, wireframe: true, transparent: true, opacity: 0.55 }),
    );
    this._hoverPick.visible = false;
    scene.add(this._hoverPick);

    // Canvas 2D sobreposto ao WebGL, só pro estilo de destaque "outline2d"
    // (contorno pontilhado em volta da projeção 2D do alvo, já na tela) —
    // ver _drawOutline2D. Criado como irmão do <canvas> do WebGL (mesmo
    // container, `.view3d-wrap` já é position:relative e `.view3d-wrap
    // canvas` já estica qualquer canvas filho pra 100%x100%, ver style.css).
    if (this.canvas?.parentElement) {
      this._outlineCanvas = document.createElement('canvas');
      this._outlineCanvas.className = 'v3d-hover-outline-canvas';
      this.canvas.parentElement.appendChild(this._outlineCanvas);
      this._outlineCtx = this._outlineCanvas.getContext('2d');
    }

    this._initBuildGhosts(THREE, scene);
    this._buildPlayerFigure(THREE, scene);
  }

  /** Ghosts do modo de construção em 3D (hotbar — ver view3d.js
   *  _updateBuildGhost/_placeWithBuildTool), MESMO padrão do destaque de
   *  raycasting acima (`_hoverTile`/etc): criados UMA vez, fora de `_group`
   *  (nunca destruídos por `_disposeGroupContents`, só reposicionados/
   *  escondidos), liberados só no dispose() final. Simplificação aceita: a
   *  malha de ghost é sempre uma caixa/plano genérico do TAMANHO certo, não
   *  a malha real peça-por-peça (ex.: o ghost de mesa não mostra as 4
   *  pernas) — a peça de verdade (com a malha certa) só nasce ao clicar. */
  _initBuildGhosts(THREE, scene) {
    const ghostMat = () => new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.35, depthWrite: false });
    // Compartilhado por `showGhostObject` pro ramo da mesa (`_ghostMesa`,
    // abaixo) — as 5 partes (tampo+pernas) trocam de geometria a cada
    // chamada, mas podem todas usar o MESMO material (mesma cor/opacidade
    // azulada de todo ghost), sem precisar de um `ghostMat()` novo por parte.
    this._ghostMatShared = ghostMat();
    this._ghostWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ghostMat());
    this._ghostWall.rotation.x = -Math.PI / 2;
    this._ghostWall.visible = false;
    // Pedido do usuário: o quadrado/retângulo azul claro (ghost da parede no
    // chão) ficava por baixo do destaque amarelo do estilo "Caixa justa"
    // (raycastHighlightStyle:'tightbox' — `_hoverWall` reaproveitada pra
    // destacar o ladrilho do chão sob a mira, ver _updateHoverHighlight)
    // quando os dois caem no mesmo ladrilho: os dois ficam bem rentes ao
    // chão (y≈0.02) e `_hoverWall`/`_hoverTile`/`_hoverPick` escrevem no
    // depth buffer (sem `depthWrite:false`), então o topo da caixa amarela
    // "tampava" o plano azul, mesmo ele tendo sido desenhado por cima. Tira
    // este ghost específico do teste de profundidade e força a ordem de
    // desenho por último — garante que ele sempre aparece por cima de
    // QUALQUER destaque/objeto do chão, não só do estilo "Caixa justa".
    this._ghostWall.material.depthTest = false;
    this._ghostWall.renderOrder = 999;
    scene.add(this._ghostWall);

    this._ghostWallSeg = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat());
    this._ghostWallSeg.visible = false;
    scene.add(this._ghostWallSeg);

    // "Ghost de seccionamento" (pedido do usuário) — ao mirar uma parede JÁ
    // EXISTENTE com a ferramenta 🧱 Parede (sem cadeia em andamento), uma
    // fatia fina do CHÃO até o TOPO da parede, no ponto exato onde a nova
    // parede nasceria conectada se fosse clicado ali — ver showGhostWallSection
    // (chamado por view3d.js _updateBuildGhost) e a "Conversão Automática de
    // Quinas" (Mapping.splitWallAt) que de fato acontece nesse ponto ao
    // clicar (ver view3d.js _placeWithBuildTool/_findWallContainingPoint).
    // MESMA robustez contra ficar escondido atrás de outra coisa (destaque
    // do raycasting, a própria parede mirada) que o ghost do chão acima.
    this._ghostWallSection = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat());
    this._ghostWallSection.visible = false;
    this._ghostWallSection.material.depthTest = false;
    this._ghostWallSection.renderOrder = 999;
    scene.add(this._ghostWallSection);

    this._ghostObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat());
    this._ghostObject.visible = false;
    scene.add(this._ghostObject);

    // [22/09/2026] NOVO — pedido verbatim: "o ghost do objeto 'Escada'
    // está aparecendo como uma caixa grande. Não deveria ser assim.
    // Deveria ser o próprio modelo 3D da escada azulado (para caracterizar
    // o ghost)." Até aqui, `showGhostObject` (abaixo) usava SEMPRE
    // `_ghostObject` — uma única caixa escalada pra caixa DELIMITADORA do
    // tipo (`objectFootprint`) — pra QUALQUER tipo de objeto, sem nenhum
    // caso especial pros tipos com malha PRÓPRIA (escada/mesa/luminária,
    // ver `_buildEscadaMesh`/etc.) — pra escada, essa caixa delimitadora é
    // bem maior/diferente da silhueta real (degraus), daí "caixa grande"
    // em vez de parecer uma escada. CORRIGIDO: grupo de degraus
    // PRÉ-CONSTRUÍDO (MESMO material `ghostMat()` — já nasce azulado/
    // translúcido, 0x7fe0ff/opacity .35, nada a mudar na cor pedida),
    // reaproveitando a MESMA fórmula de empilhamento de `_buildEscadaMesh`
    // (ver `showGhostObject`, mais abaixo, onde os degraus são posicionados/
    // escalados a cada quadro). Quantidade FIXA de degraus (padrão do
    // catálogo, 11) — o ghost aparece ANTES do objeto existir de verdade
    // (sem `obj.escadaDegraus` customizado pra ler ainda); a pessoa pode
    // ajustar a quantidade depois, pelo painel, como sempre.
    this._GHOST_ESCADA_DEGRAUS = 11;
    this._ghostEscada = new THREE.Group();
    for (let i = 0; i < this._GHOST_ESCADA_DEGRAUS; i++) {
      this._ghostEscada.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat()));
    }
    this._ghostEscada.visible = false;
    scene.add(this._ghostEscada);

    // [13/09/2026] NOVO — pedido verbatim: "O ghost da mesa está aparecendo
    // como uma caixa, deve ser o modelo da própria mesa azulado." Mesmo
    // padrão do `_ghostEscada` acima (grupo próprio, reaproveitando a
    // geometria REAL do objeto em vez da caixa delimitadora genérica) — ver
    // comentário grande em `_makeMesaMeshes` pra causa raiz completa e por
    // que luminária/poste NÃO foram cobertos junto. Criado sem malhas: as 5
    // partes da mesa (tampo + 4 pernas) são criadas por `_makeMesaMeshes` e
    // ANEXADAS aqui a cada chamada de `showGhostObject('mesa', ...)`, porque
    // o número/tamanho delas pode mudar com `perfil` (mesa é redimensionável
    // no 2D) — ao contrário da escada, que sempre tem o mesmo nº de degraus
    // (this._GHOST_ESCADA_DEGRAUS fixo), não dá pra pré-alocar um pool fixo
    // de partes da mesa sem reimplementar a lógica de `_makeMesaMeshes` de
    // novo aqui só pra saber quantas caixas alocar — então este grupo troca
    // de filhos (remove os antigos, adiciona os novos) a cada chamada. Isso
    // é MUITO mais barato do que parece: só acontece enquanto a pessoa está
    // efetivamente arrastando o ghost de uma mesa (poucos frames por vez, não
    // o tempo todo), e nunca mais que ~5 meshes pequenas por troca.
    this._ghostMesa = new THREE.Group();
    this._ghostMesa.visible = false;
    scene.add(this._ghostMesa);

    this._ghostItem = new THREE.Mesh(new THREE.ConeGeometry(0.26 * Math.SQRT2, 0.6, 4), ghostMat());
    this._ghostItem.visible = false;
    scene.add(this._ghostItem);

    this._ghostDoorWindow = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat());
    this._ghostDoorWindow.visible = false;
    scene.add(this._ghostDoorWindow);

    // NOVO (08/09/2026, 38a rodada), pedido verbatim: "os tijolos devem
    // ter ghost." -- MESMO padrão/material (`ghostMat()`) dos ghosts acima,
    // caixa unitária escalada em showGhostTijolo (view3d.js `_updateBuildGhost`,
    // ramo 'tijolo').
    this._ghostTijolo = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat());
    this._ghostTijolo.visible = false;
    scene.add(this._ghostTijolo);

    // CORRIGIDO (08/09/2026, 39a rodada), pedido verbatim: "O ghost da
    // cunha deve ter a forma dela. Atualmente tem a forma da Caixa." --
    // 'this._ghostTijolo' acima sempre foi uma BoxGeometry unitaria
    // escalada (certo pro formato 'caixa', errado pra 'cunha', que tem 5
    // faces com uma rampa inclinada, nao 6 faces retas). Ghost dedicado
    // pra cunha, com geometria PROPRIA reconstruida a cada quadro (barato
    // -- pura matematica, ver Tijolos.buildWedgeGeometry, sem custo de
    // criar/destruir objetos Three.js alem de atualizar os atributos do
    // BufferGeometry) em vez de escala/rotacao do THREE.Mesh (a geometria
    // de buildWedgeGeometry ja vem com posicao/rotacao EMBUTIDAS nos
    // vertices -- ver comentario dela em tijolos.js -- entao este mesh
    // fica sempre em position/rotation (0,0,0), so a geometria muda).
    this._ghostTijoloCunha = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat());
    this._ghostTijoloCunha.visible = false;
    scene.add(this._ghostTijoloCunha);

    // ---------- "Linhas-Guia Inteligentes" (pedido do usuário, "🧱 Parede" —
    // feedback visual do sistema de snap ao desenhar parede, ver view3d.js
    // _resolveWallSnap):
    //   - `_guideLines`: até 2 linhas tracejadas (uma por eixo, X e Z —
    //     estilo Figma/AutoCAD) mostrando o alinhamento com a ponta de
    //     outra parede distante — ver showSmartGuides. Criadas UMA vez (um
    //     pool fixo de 2), só a geometria é trocada a cada quadro — mesmo
    //     espírito de "nunca recriar objeto Three.js a cada frame" já
    //     usado pelos ghosts acima.
    //   (as duas esferas azuis claras que existiam aqui — `_ghostSpringDot`
    //     e `_ghostSnapSphere`, o "Cursor Fantasma com Efeito Mola" — foram
    //     removidas a pedido do usuário; showWallSpringGhost abaixo virou
    //     no-op, guardado pela ausência de `_ghostSnapSphere`.) ----------
    this._guideLines = [0, 1].map(() => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const mat = new THREE.LineDashedMaterial({ color: 0xffe27a, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.85, depthWrite: false });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      // MESMO bug encontrado e corrigido na "sombra"/prolongamento do
      // objeto mais abaixo (ver comentário grande em `_footprintDrops`) —
      // `showSmartGuides` também reescreve os pontos desta linha todo
      // quadro via `setFromPoints`, o que deixa `geometry.boundingSphere`
      // desatualizado pro frustum culling. Correção preventiva igual.
      line.frustumCulled = false;
      scene.add(line);
      return line;
    });

    // ---------- "Linha de Eixo / Transferidor" (pedido do usuário,
    // 25/08/2026 — rotação de porta/janela/objeto na colocação em 3D): "No
    // giro em 45°, exiba uma marcação circular na base do objeto mostrando
    // as 8 divisões para o jogador antecipar onde o objeto vai travar". 8
    // traços radiais (de um raio interno a um externo, tipo mostrador de
    // bússola), espaçados a 45° uns dos outros — geometria LOCAL construída
    // UMA vez só aqui (nunca muda), igual ao resto do pool de ghosts: a cada
    // quadro só a posição/rotação do objeto INTEIRO é que muda (ver
    // showRotationProtractor), nunca a geometria em si — mais barato que
    // reconstruir pontos a cada quadro (como showSmartGuides precisa fazer,
    // já que ali os dois PONTOS mudam, não só a peça inteira). Mostrado só
    // no Modo Padrão (passos de 45°, botão do meio — ver view3d.js
    // handleMiddleClickAction/_updateBuildGhost); no Giro Livre (tecla R) o feedback
    // visual passa a ser o traço pontilhado entre o pivô e a mira, via
    // showSmartGuides — nunca os dois ativos ao mesmo tempo.
    {
      const pts = [];
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const ca = Math.cos(a), sa = Math.sin(a);
        pts.push(new THREE.Vector3(ca * 0.32, 0, sa * 0.32), new THREE.Vector3(ca * 0.5, 0, sa * 0.5));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.75, depthWrite: false });
      this._protractorRing = new THREE.LineSegments(geo, mat);
      this._protractorRing.visible = false;
      scene.add(this._protractorRing);
    }

    // ---------- "Sombra"/footprint pontilhada + prolongamento de linhas até
    // o chão (pedido do usuário, 25/08/2026): "Ao apontar para cima de um
    // objeto já posto, o ghost do novo objeto fica em cima dele. Deve,
    // então, haver um prolongamento de linhas do novo objeto até o chão e
    // também como se fosse a sua sombra da parte de baixo, só que apenas o
    // retângulo (ou círculo dependendo do objeto) pontilhado." Só aparece
    // quando o ghost da ferramenta 📦 Objeto está REALMENTE pousado em cima
    // de outro objeto (não no chão de verdade, nem travado numa parede —
    // ver view3d.js _updateBuildGhost/showGhostFootprintShadow abaixo).
    // MESMO padrão de pool fixo/geometria reconstruída por quadro que
    // `_guideLines` acima (LineDashedMaterial + setFromPoints +
    // computeLineDistances) — 4 "linhas de prumo" (uma por canto do
    // retângulo, ou por um dos 4 pontos cardeais do círculo) + 1 contorno
    // fechado no chão (retângulo ou círculo, a depender da forma do
    // objeto).
    // BUG investigado (pedido do usuário, 25/08/2026: "verifique sobre o
    // prolongamento, pois às vezes não aparece todo e a parte da 'sombra'
    // no chão também") — causa raiz: `showGhostFootprintShadow` reescreve
    // os PONTOS destas linhas todo quadro com `geometry.setFromPoints(...)`
    // (a peça em si — `this._footprintOutline`/cada linha de
    // `_footprintDrops` — nunca é movida via `.position`; as coordenadas
    // já vêm em espaço de MUNDO direto nos vértices). O three.js só calcula
    // `geometry.boundingSphere` (usado pro frustum culling, decidir se some
    // desenha o objeto ou pula por estar "fora da tela") UMA vez, na
    // primeira vez que precisa dele — depois disso, trocar os pontos da
    // geometria (`setFromPoints`) NÃO invalida nem recalcula esse raio
    // sozinho. Resultado: a partir do 2º quadro em diante, o culling
    // continuava testando contra a posição/forma da PRIMEIRA vez que a
    // linha apareceu, não a posição atual — daí "às vezes não aparece
    // todo" (cada uma das 4 linhas de prumo, e o contorno, têm seu PRÓPRIO
    // raio calculado na primeira vez que CADA UMA foi mostrada, então
    // sumiam de forma inconsistente entre si conforme a câmera girava).
    // `frustumCulled = false` desliga esse corte de otimização pra estas
    // linhas — são só um punhado de segmentos finos, sempre visíveis com
    // moderação (só quando o ghost do 📦 Objeto está pousado em cima de
    // outro objeto), o custo de sempre desenhar é irrelevante.
    this._footprintDrops = [0, 1, 2, 3].map(() => {
      const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x7fe0ff, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.8, depthWrite: false }));
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      return line;
    });
    this._footprintOutline = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x7fe0ff, dashSize: 0.1, gapSize: 0.07, transparent: true, opacity: 0.8, depthWrite: false }));
    this._footprintOutline.visible = false;
    this._footprintOutline.frustumCulled = false;
    scene.add(this._footprintOutline);
  }

  hideAllGhosts() {
    // [22/09/2026] `_ghostEscada` (ver comentário grande no construtor) incluído
    // nesta lista — senão ficaria "preso" visível trocando de ferramenta com um
    // 'escada' mirado antes.
    [this._ghostWall, this._ghostWallSeg, this._ghostWallSection, this._ghostObject, this._ghostEscada, this._ghostMesa, this._ghostItem, this._ghostDoorWindow, this._ghostTijolo, this._ghostTijoloCunha, this._ghostSpringDot, this._ghostSnapSphere, this._protractorRing, this._footprintOutline, ...(this._guideLines || []), ...(this._footprintDrops || [])].forEach((m) => { if (m) m.visible = false; });
  }

  /** "Ghost de seccionamento" (pedido do usuário) — mostrado por
   *  view3d.js _updateBuildGhost quando a ferramenta 🧱 Parede está mirando
   *  uma parede JÁ EXISTENTE (sem cadeia em andamento): uma fatia fina, do
   *  CHÃO até o TOPO da parede (mesma altura de sempre, 2.6m), no ponto
   *  exato `(x,z)` onde a próxima parede nasceria conectada a esta se fosse
   *  clicado ali agora — mesma peça de _ghostWallSeg (caixa orientada ao
   *  longo da parede via `Math.atan2(wallDx, wallDz)`), só achatada numa
   *  fatia fina (em vez de esticada até um 2º ponto) em vez de um segmento
   *  inteiro. `wallDx,wallDz` é o vetor (x2-x1, y2-y1) da parede mirada, só
   *  pra orientar a fatia alinhada com ela (mesma espessura de uma parede
   *  de verdade, então fica "encaixada" na parede, não flutuando). */
  showGhostWallSection(x, z, wallDx, wallDz) {
    if (!this._ghostWallSection) return;
    const t = WALL_THICKNESS_3D;
    const wallH = 2.6;
    this._ghostWallSection.scale.set(t, wallH, t * 1.4);
    this._ghostWallSection.position.set(x, wallH / 2, z);
    this._ghostWallSection.rotation.y = Math.atan2(wallDx, wallDz);
    this._ghostWallSection.visible = true;
  }

  /** As duas esferas azuis claras de feedback do snap de parede (`_ghostSnapSphere`
   *  na posição de destino já com o encaixe aplicado, `_ghostSpringDot` na posição
   *  exata da mira) foram removidas a pedido do usuário — ver comentário em
   *  _initBuildGhosts. Esta função virou no-op (guardada pela ausência de
   *  `_ghostSnapSphere`), mantida só para não quebrar as chamadas em view3d.js. */
  showWallSpringGhost(rawX, rawZ, snapX, snapZ) {
    if (!this._ghostSnapSphere) return;
    this._ghostSnapSphere.position.set(snapX, 0.05, snapZ);
    this._ghostSnapSphere.visible = true;
    const puxou = Math.hypot(rawX - snapX, rawZ - snapZ) > 0.03;
    if (this._ghostSpringDot) {
      this._ghostSpringDot.position.set(rawX, 0.05, rawZ);
      this._ghostSpringDot.visible = puxou;
    }
  }

  /** `lines`: array de até 2 `{x1,z1,x2,z2,y}` (mundo) — uma linha tracejada
   *  por entrada, escondendo as sobrando do pool de 2 (ver _initBuildGhosts).
   *  Passar array vazio/undefined esconde as duas. `y` é OPCIONAL (padrão
   *  0.03, rente ao chão — comportamento de sempre, usado pelas guias de
   *  parede) — pedido do usuário, 25/08/2026, sobre o traço pontilhado do
   *  Giro Livre (view3d.js): "Se o objeto está com o ghost em cima de outro
   *  objeto e pressionar R... o tracejado tem como ponto de referência o
   *  centro de rotação EM CIMA desse objeto", ou seja, precisa poder ficar
   *  numa altura elevada (topo de uma mesa, por ex.) em vez de sempre no
   *  chão de verdade. */
  showSmartGuides(lines) {
    const THREE = this.THREE;
    (this._guideLines || []).forEach((line, i) => {
      const l = (lines || [])[i];
      if (!l) { line.visible = false; return; }
      const y = l.y ?? 0.03;
      line.geometry.setFromPoints([new THREE.Vector3(l.x1, y, l.z1), new THREE.Vector3(l.x2, y, l.z2)]);
      line.computeLineDistances(); // obrigatório pro LineDashedMaterial saber onde alternar traço/vão
      line.visible = true;
    });
  }

  /** Quadrado do tamanho da ESPESSURA da parede na posição mirada (pedido do
   *  usuário: "ao apontar para o chão para desenhar a parede, deve aparecer
   *  um quadrado com a espessura definida para a parede"). Com uma cadeia já
   *  iniciada (`chainStart` — 1º ponto já clicado), mostra TAMBÉM uma caixa
   *  cobrindo o trecho pendente (mesma espessura/altura de uma parede de
   *  verdade), pra visualizar o segmento que o próximo clique vai fechar. */
  showGhostWall(x, z, chainStart) {
    if (!this._ghostWall) return;
    const t = WALL_THICKNESS_3D;
    this._ghostWall.scale.set(t, t, 1);
    this._ghostWall.position.set(x, 0.02, z);
    this._ghostWall.visible = true;
    if (chainStart) {
      const dx = x - chainStart.x, dz = z - chainStart.y;
      const len = Math.hypot(dx, dz);
      if (len > 0.02) {
        const wallH = 2.6;
        this._ghostWallSeg.scale.set(t, wallH, len);
        this._ghostWallSeg.position.set((chainStart.x + x) / 2, wallH / 2, (chainStart.y + z) / 2);
        this._ghostWallSeg.rotation.y = Math.atan2(dx, dz);
        this._ghostWallSeg.visible = true;
        return;
      }
    }
    this._ghostWallSeg.visible = false;
  }

  /** Caixa delimitadora do tipo de objeto atualmente selecionado na hotbar
   *  (`OBJECT3D_PROFILES`/`OBJECT3D_DEFAULT_PROFILE`, MESMA tabela usada
   *  pela peça de verdade), seguindo o cursor — "o objeto deve ir sendo
   *  posicionado conforme o cursor do mouse e só se fixa quando clicar". */
  /** `elevacao` — metros acima do PONTO onde a mira bateu (chão ou tampo de
   *  mesa, ver view3d.js raycastSurface), a MESMA conta que o objeto de
   *  verdade recebe ao clicar (`obj.elevacao`, ver Mapping.addObject) — 0
   *  por padrão (chão, comportamento de sempre). Ignora `perfil.y0` de
   *  propósito (usado aqui antes): a elevação agora SEMPRE vem de quem
   *  chama, não do catálogo — um único lugar decide a altura. */
  /** Largura/profundidade/altura da caixa delimitadora de um tipo de objeto
   *  — MESMA lógica que showGhostObject já usava inline (extraída pra cá,
   *  25/08/2026, pra ser reaproveitada também pelo teste de colisão
   *  objeto×parede de "Ignorar física", ver view3d.js
   *  _resolveObjectWallCollision, sem duplicar a tabela de casos especiais
   *  mesa/coluna). Mesa/coluna: mesmas dimensões explícitas passadas ao
   *  colocar de verdade (ver view3d.js _placeWithBuildTool, tool 'objeto')
   *  — não o perfil velho de OBJECT3D_PROFILES (que pra mesa é só o tampo
   *  fino a 0.72m, sem pernas; a caixa genérica ficaria do tamanho errado). */
  objectFootprint(tipoKey) {
    // Objeto importado de .obj (rodada 51 — ver js/objimport.js): a caixa
    // delimitadora vem do próprio arquivo, não da tabela fixa de perfis.
    if (window.ObjImport?.isCustomKey(tipoKey)) {
      const fp = window.ObjImport.getFootprint(tipoKey);
      if (fp) return fp;
    }
    // Cálculo de verdade dos tipos de catálogo padrão mudou de casa na
    // rodada 51 — ver `computeObjectFootprint` em js/engine3d-profiles.js
    // (pedido do usuário: "receitas para montar os modelos 3D dos objetos"
    // num arquivo separado). Mantido como método fino aqui só pra não
    // obrigar quem já chama `engine.objectFootprint(...)` em vários lugares
    // (view3d.js) a mudar nada.
    return computeObjectFootprint(tipoKey);
  }

  /** NOVO (08/09/2026, 38a rodada), pedido verbatim: "os tijolos devem ter
   *  ghost." -- caixa semitransparente do TAMANHO/POSIÇÃO/ROTAÇÃO exatos de
   *  onde o próximo tijolo cairia (mesmo cálculo de view3d.js
   *  `_tijoloAimTarget`, refeito aqui de forma síncrona a cada quadro pra
   *  não depender de `await Tijolos.getConfig()` — ver comentário grande em
   *  `_updateBuildGhost`, ramo 'tijolo'). `rotY` em graus (0/90/180/270,
   *  só relevante pra 'cunha' — ver Tijolos.buildWedgeGeometry). */
  showGhostTijolo(x, y, z, sx, sy, sz, rotY, formato) {
    // CORRIGIDO (08/09/2026, 39a rodada) -- ver comentario grande no
    // construtor do ghost 'this._ghostTijoloCunha', acima: formato 'cunha'
    // usa geometria PROPRIA (5 faces, rampa) em vez da caixa escalada.
    if (formato === 'cunha') {
      if (!this._ghostTijoloCunha || !window.Tijolos?.buildWedgeGeometry) return;
      if (this._ghostTijolo) this._ghostTijolo.visible = false;
      const geo = window.Tijolos.buildWedgeGeometry({ x, y, z, sx, sy, sz, rotY: rotY || 0 });
      const bg = this._ghostTijoloCunha.geometry;
      bg.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
      bg.computeBoundingSphere();
      this._ghostTijoloCunha.position.set(0, 0, 0);
      this._ghostTijoloCunha.rotation.set(0, 0, 0);
      this._ghostTijoloCunha.visible = true;
      return;
    }
    if (!this._ghostTijolo) return;
    if (this._ghostTijoloCunha) this._ghostTijoloCunha.visible = false;
    this._ghostTijolo.scale.set(sx, sy, sz);
    this._ghostTijolo.position.set(x, y, z);
    this._ghostTijolo.rotation.y = ((rotY || 0) * Math.PI) / 180;
    this._ghostTijolo.visible = true;
  }

  showGhostObject(x, z, angulo, tipoKey, elevacao = 0) {
    // [22/09/2026] NOVO — ver comentário grande no construtor
    // (`_ghostEscada`) pro pedido/causa raiz completa: escada usa um
    // ghost de DEGRAUS empilhados (silhueta real), não a caixa genérica.
    if (tipoKey === 'escada') {
      if (!this._ghostEscada) return;
      this._ghostObject.visible = false;
      const { w: largura, d: profundidadeTotal } = this.objectFootprint(tipoKey);
      // [13/09/2026] Mesma correção de `_buildEscadaMesh`/`Mapping.objectTopHeightAt`
      // — a altura do PREVIEW (ghost) também precisa refletir a altura real
      // de andar (`mapData.alturaPiso`), não mais um valor fixo de 2m
      // desconectado — senão o ghost mostraria uma escada mais curta do que
      // a que vai realmente ser criada ao clicar (confuso pro usuário
      // posicionar). O ghost usa sempre o pool fixo de `_GHOST_ESCADA_DEGRAUS`
      // caixas (preview não precisa bater o nº exato de degraus do objeto
      // final, que só existe depois de clicar — ver comentário no
      // construtor) — só a altura TOTAL empilhada precisa estar certa.
      const alturaTotal = this.mapData?.alturaPiso || 2.8;
      const nDegraus = this._GHOST_ESCADA_DEGRAUS;
      const stepDepth = profundidadeTotal / nDegraus;
      const stepHeight = alturaTotal / nDegraus;
      const rotY = objAnguloToRotY(angulo);
      const cos = Math.cos(rotY), sin = Math.sin(rotY);
      this._ghostEscada.children.forEach((step, i) => {
        const h = stepHeight * (i + 1);
        const lx = 0, lz = -profundidadeTotal / 2 + stepDepth * (i + 0.5);
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        step.scale.set(largura, h, stepDepth);
        step.position.set(wx, elevacao + h / 2, wz);
        step.rotation.y = rotY;
      });
      this._ghostEscada.visible = true;
      return;
    }
    if (this._ghostEscada) this._ghostEscada.visible = false;
    // [13/09/2026] NOVO — ver comentário grande em `_makeMesaMeshes`/
    // `_initBuildGhosts` pra causa raiz completa: a mesa agora ganha o mesmo
    // tratamento bespoke que a escada já tinha (silhueta real — tampo + 4
    // pernas — em vez da caixa delimitadora genérica).
    if (tipoKey === 'mesa') {
      this._ghostObject.visible = false;
      if (!this._ghostMesa) return;
      const perfil = this.objectFootprint(tipoKey); // { w, d, h } — MESMA fonte usada pelo objeto real (OBJECT3D_PROFILES/mesa)
      // `_makeMesaMeshes` espera um `obj` com x/y/angulo (coordenadas do
      // MUNDO) — o ghost ainda não é um objeto salvo no mapa, então montamos
      // um `obj` temporário mínimo só com os campos que a função lê.
      const objTemp = { x, y: z, angulo };
      while (this._ghostMesa.children.length) this._ghostMesa.remove(this._ghostMesa.children[0]);
      const { meshes } = this._makeMesaMeshes(objTemp, perfil, elevacao, this._ghostMatShared);
      meshes.forEach((m) => this._ghostMesa.add(m));
      this._ghostMesa.visible = true;
      return;
    }
    if (this._ghostMesa) this._ghostMesa.visible = false;
    if (!this._ghostObject) return;
    const { w, d, h } = this.objectFootprint(tipoKey);
    this._ghostObject.scale.set(w, h, d);
    this._ghostObject.position.set(x, elevacao + h / 2, z);
    this._ghostObject.rotation.y = objAnguloToRotY(angulo); // ver objAnguloToRotY — precisa bater com a peça real ao finalizar
    this._ghostObject.visible = true;
  }

  /** Cone pequeno (mesmo tamanho do marcador de item de verdade — ver
   *  setScene, "marcadores dos itens") na posição mirada. */
  showGhostItem(x, z) {
    if (!this._ghostItem) return;
    this._ghostItem.position.set(x, 0.3, z);
    this._ghostItem.rotation.y = Math.PI / 4;
    this._ghostItem.visible = true;
  }

  /** Caixa do tamanho padrão de porta/janela (mesmos valores-padrão de
   *  Mapping.addDoor/addWindow) na posição mirada — `angulo` null quando
   *  encaixando numa parede (o ghost fica sem girar nesse caso, só marcando
   *  o ponto — simplificação aceita: a peça de verdade já nasce alinhada
   *  certo à parede ao clicar, só o GHOST prévio não gira). */
  showGhostDoorWindow(x, z, angulo, isDoor) {
    if (!this._ghostDoorWindow) return;
    const largura = isDoor ? 0.8 : 1.2;
    const altura = isDoor ? 2.1 : 1.2;
    const baseY = isDoor ? 0 : 1.0;
    this._ghostDoorWindow.scale.set(largura, altura, WALL_THICKNESS_3D);
    this._ghostDoorWindow.position.set(x, baseY + altura / 2, z);
    // 24/08/2026: usava `Math.PI/2 - angulo` (mesma fórmula errada do
    // rotY em buildDoorOrWindowMesh, ver comentário grande lá embaixo) —
    // corrigido para `objAnguloToRotY`, a MESMA função já usada por
    // mesa/objeto/luminária, pelo mesmo motivo (ver comentário completo
    // no ponto de uso real, mais abaixo neste arquivo).
    this._ghostDoorWindow.rotation.y = angulo === null ? 0 : objAnguloToRotY(angulo);
    this._ghostDoorWindow.visible = true;
  }

  /** "Transferidor" de 8 divisões — ver comentário grande em
   *  _initBuildGhosts.
   *
   *  Pedido do usuário (25/08/2026): "aquele transferidor de 45 graus deve
   *  ficar sempre alinhado para o 'norte'. E ficar fixo no nível do chão.
   *  Atualmente, ele está sendo desenhado em diversas alturas diferentes de
   *  acordo com a profundidade do raytracer no cenário 3D." Duas mudanças:
   *
   *  1) BUG DE VERDADE encontrado ao investigar: todo call site em
   *     view3d.js (_updateBuildGhost) chamava esta função como
   *     `(x, z, altura, angulo)`, mas a assinatura ANTIGA era
   *     `(x, y, z, refAngulo)` — ou seja, a coordenada Z do MUNDO (que varia
   *     livremente pelo mapa inteiro, tipicamente vários metros) entrava no
   *     eixo Y (altura) do anel, e o valor pequeno de altura (0, ~1m, ou a
   *     elevação do pivô) entrava no eixo Z (profundidade) — daí o anel
   *     "pular" pra alturas aleatórias conforme a posição no mapa, exatamente
   *     o sintoma relatado ("diversas alturas... conforme a profundidade").
   *
   *  2) Além do bug, o usuário pediu explicitamente um comportamento mais
   *     simples do que o original (que fazia o anel girar com a câmera/
   *     parede e acompanhar a elevação de um objeto embaixo, ver histórico
   *     de 25/08/2026 acima): o anel agora é SEMPRE desenhado no nível do
   *     chão (y fixo) e SEMPRE orientado pro "norte" (ângulo 0, sem girar
   *     com a câmera nem travar num ângulo de referência) — assinatura
   *     reduzida pra só `(x, z)`, sem mais parâmetro de altura nem de
   *     ângulo (ambos removidos dos call sites em view3d.js). */
  showRotationProtractor(x, z) {
    if (!this._protractorRing) return;
    this._protractorRing.position.set(x, 0.03, z);
    this._protractorRing.rotation.y = 0; // sempre "norte" — pedido do usuário, 25/08/2026
    this._protractorRing.visible = true;
  }

  /** "Sombra"/footprint pontilhada no chão + prolongamento de linhas verticais
   *  do ghost elevado até lá — pedido do usuário, 25/08/2026 (citado por
   *  inteiro em _initBuildGhosts). Chamado só por view3d.js
   *  _updateBuildGhost, e só quando o ghost da ferramenta 📦 Objeto está
   *  REALMENTE pousado em cima de outro objeto (`topoY` > 0) — no chão de
   *  verdade a "sombra" coincidiria com o próprio contorno do objeto, sem
   *  nenhum valor visual. `x,z,angulo,tipoKey` são os MESMOS parâmetros que
   *  showGhostObject já recebe (a peça pairando); `topoY` é a altura de onde
   *  ela está pousada (`hit.y`/`piv.baseY`, ver view3d.js) — as linhas
   *  descem dali até y=0. */
  showGhostFootprintShadow(x, z, angulo, tipoKey, topoY) {
    const THREE = this.THREE;
    if (!this._footprintOutline || !this._footprintDrops) return;
    const { w, d, shape } = this.objectFootprint(tipoKey);
    const FLOOR_Y = 0.02; // rente ao chão — mesma altura visual do resto dos ghosts de chão (ver showGhostWall)
    let outlinePts, cantos;
    if (shape === 'circle') {
      const r = Math.max(w, d) / 2;
      const SEG = 24; // resolução do contorno circular — só estética, sem efeito em nada mais
      outlinePts = [];
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        outlinePts.push(new THREE.Vector3(x + Math.cos(a) * r, FLOOR_Y, z + Math.sin(a) * r));
      }
      // 4 "linhas de prumo" nos 4 pontos cardeais do círculo — mesmo espírito
      // dos 4 cantos do retângulo abaixo, só que não há "canto" de verdade
      // num círculo.
      cantos = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2].map((a) => new THREE.Vector3(x + Math.cos(a) * r, FLOOR_Y, z + Math.sin(a) * r));
    } else {
      const hw = w / 2, hd = d / 2;
      // MESMA convenção de rotação de `angulo` usada no resto do app pra
      // ir de coordenada LOCAL pra MUNDO (ctx.rotate no 2D — mapview.js;
      // MESMA fórmula, só que em X/Z em vez de X/Y de tela) — precisa bater
      // exatamente com a orientação do `_ghostObject` de verdade (que usa
      // `objAnguloToRotY`, a mesma rotação só que na convenção invertida do
      // three.js — ver comentário grande no topo do arquivo), senão o
      // contorno ficaria girado errado em relação à caixa do ghost.
      const cos = Math.cos(angulo || 0), sin = Math.sin(angulo || 0);
      const corner = (lx, lz) => new THREE.Vector3(x + lx * cos - lz * sin, FLOOR_Y, z + lx * sin + lz * cos);
      const c1 = corner(-hw, -hd), c2 = corner(hw, -hd), c3 = corner(hw, hd), c4 = corner(-hw, hd);
      outlinePts = [c1, c2, c3, c4, c1]; // fechado — volta pro 1º ponto
      cantos = [c1, c2, c3, c4];
    }
    this._footprintOutline.geometry.setFromPoints(outlinePts);
    this._footprintOutline.computeLineDistances(); // obrigatório pro LineDashedMaterial (ver showSmartGuides)
    this._footprintOutline.visible = true;
    const topoReal = Math.max(topoY, FLOOR_Y);
    this._footprintDrops.forEach((line, i) => {
      const p = cantos[i];
      line.geometry.setFromPoints([new THREE.Vector3(p.x, topoReal, p.z), new THREE.Vector3(p.x, FLOOR_Y, p.z)]);
      line.computeLineDistances();
      line.visible = true;
    });
  }

  /** Esconde só a sombra/footprint (ver showGhostFootprintShadow acima) —
   *  usada por view3d.js _updateBuildGhost nos quadros em que o ghost NÃO
   *  está pousado em cima de outro objeto (`hideAllGhosts` já cobriria isto
   *  também, mas ali TUDO some, inclusive o próprio `_ghostObject`, que
   *  ainda precisa continuar visível — ver o call site). */
  hideGhostFootprintShadow() {
    if (this._footprintOutline) this._footprintOutline.visible = false;
    (this._footprintDrops || []).forEach((l) => { l.visible = false; });
  }

  /** "Raio X" (tecla X — pedido do usuário, 25/08/2026: "deve haver um raio
   *  x (ativado pela tecla X) que faz o objeto de baixo ficar transparente
   *  (ou wireframe dependendo do desempenho) de modo que se possa ver
   *  através dele. Desse jeito aquelas linhas prolongados até o chão poderão
   *  ser vistas"). `objId`: id (`obj.id` do MAPA, não a malha) do objeto a
   *  atravessar — MESMO id devolvido por `raycastSurface` em `restingOnId` —
   *  ou `null` pra desligar (restaura o material original de quem estava
   *  sendo atravessado antes, se houver). Chamado TODO quadro por
   *  view3d.js _updateBuildGhost (idempotente — só mexe de verdade quando o
   *  alvo muda, ver a guarda logo abaixo — trocar de material a cada quadro
   *  sem necessidade seria desperdício).
   *
   *  Modo do material trocado: WIREFRAME quando o modo de render 3D atual
   *  (`this.mode`) já é 'wireframe' (mais barato, reaproveita o estilo já
   *  ativo — "dependendo do desempenho", pedido do usuário) — TRANSPARENTE
   *  (opacidade bem baixa) nos outros modos ('solido'/'hibrido'/etc). Um
   *  objeto composto de várias malhas (mesa, luminária — ver
   *  _buildMesaMesh/_buildLuminariaMesh) tem TODAS elas com o MESMO
   *  `userData.pick.id`, então o filtro abaixo já pega o objeto inteiro, não
   *  só uma peça dele.
   *
   *  Interação com o modo "Sólido+wireframe para desempenho" (`this.mode
   *  === 'hibrido'`, ver updateHybridQuality/_setupHybridMeshes): aquele
   *  sistema troca `mesh.material` sozinho, TODO quadro renderizado,
   *  independente disto aqui — se uma malha atravessada continuasse na
   *  lista dele (`this._hybridMeshes`), o próximo quadro desfaria o Raio X
   *  sem avisar (ele sempre força `_solidMat`/`_wireMat`, nenhum dos dois é
   *  o material temporário do Raio X). Por isso a malha é temporariamente
   *  RETIRADA de `_hybridMeshes` enquanto atravessada, e devolvida
   *  (reinserida) ao restaurar — os dois sistemas nunca disputam a mesma
   *  malha ao mesmo tempo. */
  setXRayTarget(objId) {
    if (objId === (this._xrayObjId ?? null)) return; // nada mudou desde o quadro anterior — evita trocar material à toa
    // Restaura o material ORIGINAL de quem estava sendo atravessado antes
    // (guardado em userData ao aplicar, ver abaixo) — nunca cria um material
    // novo pra restaurar, sempre devolve a MESMA instância de antes.
    (this._xrayMeshes || []).forEach((m) => {
      if (m.userData._xrayOrigMaterial) { m.material = m.userData._xrayOrigMaterial; delete m.userData._xrayOrigMaterial; }
      // Devolve pro pool do modo híbrido, se tiver sido retirada dali abaixo.
      if (m.userData._xrayRemovedFromHybrid) {
        delete m.userData._xrayRemovedFromHybrid;
        if (this._hybridMeshes && !this._hybridMeshes.includes(m)) this._hybridMeshes.push(m);
      }
      // [26/09/2026] NOVO — ver `_instanceDemote`/comentário grande em
      // `this._instancedPools` (constructor): objeto instanciado (pool de
      // InstancedMesh por tipo) fica INVISÍVEL por padrão — devolve ele pro
      // estado invisível de sempre e restaura a instância que o desenhava.
      this._instanceDemote(m);
    });
    this._xrayObjId = objId ?? null;
    this._xrayMeshes = objId ? (this._pickMeshes || []).filter((m) => m.userData?.pick?.type === 'object' && m.userData.pick.id === objId) : [];
    if (!this._xrayMeshes.length) return;
    const THREE = this.THREE;
    const wireframeMode = this.mode === 'wireframe';
    this._xrayMeshes.forEach((m) => {
      m.userData._xrayOrigMaterial = m.material;
      m.material = wireframeMode
        ? new THREE.MeshBasicMaterial({ color: 0x78c8ff, wireframe: true })
        : new THREE.MeshBasicMaterial({ color: m.userData._xrayOrigMaterial.color || 0xffffff, transparent: true, opacity: 0.18, depthWrite: false });
      // Retirada do pool do modo híbrido enquanto atravessada — ver
      // comentário grande no topo desta função.
      if (this._hybridMeshes) {
        const idx = this._hybridMeshes.indexOf(m);
        if (idx !== -1) { this._hybridMeshes.splice(idx, 1); m.userData._xrayRemovedFromHybrid = true; }
      }
      // [26/09/2026] NOVO — "promove" a malha individual (agora invisível por
      // causa do pool de InstancedMesh, ver acima) de volta a visível — com o
      // material de Raio X já trocado na linha de cima — e zera a instância
      // dela no pool, pra nunca desenhar o objeto duas vezes ao mesmo tempo.
      this._instancePromote(m);
    });
  }

  /** Raio X GLOBAL (rodada 48, com sub-opções por categoria na rodada 49) —
   *  pedido do usuário (rodada 48): "deve haver um botão que ativa o raio-x
   *  [...] tudo dá para ver através dos objetos [...] com esse novo botão,
   *  tudo no cenário fica sob efeito raio-x." Reforçado na rodada 49: "deve
   *  haver subopções como 'portas', 'janelas' (mesmo fechadas), 'paredes'.
   *  E uma outra opção 'tudo no cenário'..." Diferente de `setXRayTarget`
   *  acima (um ÚNICO objeto, trocado a cada quadro pelo ghost de colocação):
   *  aqui `flags` é um objeto `{ objetos, paredes, portas, janelas }`
   *  (qualquer campo omitido conta como `false`) que aplica o mesmo material
   *  transparente/wireframe a TODAS as malhas do(s) TIPO(s) marcado(s) de
   *  uma vez (`userData.pick.type`: 'object'/'wall'/'porta'/'janela' — ver
   *  onde `_pickMeshes` é populado em `setScene`/`buildDoorOrWindowMesh`),
   *  e nunca é desligado sozinho a cada quadro — só quando as opções mudam
   *  de novo (via `_toggleGlobalXRay` em view3d.js). "Janelas mesmo
   *  fechadas": a malha de uma janela fechada é a MESMA de uma aberta (não
   *  existe uma noção de "aberta"/"fechada" pra janela no 3D, só pra porta,
   *  que só muda a posição da folha — nunca remove a malha), então o filtro
   *  por tipo já cobre isso de graça, sem checagem extra. Usa seu próprio
   *  array (`_xrayGlobalMeshes`) pra nunca disputar a MESMA malha com
   *  `setXRayTarget`/`_hybridMeshes` ao mesmo tempo — se os dois estiverem
   *  ativos juntos, o filtro abaixo simplesmente pula qualquer malha já sob
   *  efeito do raio X pontual. */
  setGlobalXRay(flags) {
    flags = flags || {};
    const types = [];
    if (flags.objetos) types.push('object');
    if (flags.paredes) types.push('wall');
    if (flags.portas) types.push('porta');
    if (flags.janelas) types.push('janela');
    // Sempre restaura TUDO que estava sob efeito antes — mais simples e
    // barato (uma checkbox a mais/menos não muda o custo perceptível) do que
    // tentar diferenciar quais tipos mudaram desde a última chamada.
    (this._xrayGlobalMeshes || []).forEach((m) => {
      if (m.userData._xrayGlobalOrigMaterial) { m.material = m.userData._xrayGlobalOrigMaterial; delete m.userData._xrayGlobalOrigMaterial; }
      if (m.userData._xrayGlobalRemovedFromHybrid) {
        delete m.userData._xrayGlobalRemovedFromHybrid;
        if (this._hybridMeshes && !this._hybridMeshes.includes(m)) this._hybridMeshes.push(m);
      }
      // [26/09/2026] NOVO — mesmo par promote/demote de setXRayTarget acima,
      // ver comentário grande lá e em `this._instancedPools` (constructor).
      this._instanceDemote(m);
    });
    this._xrayGlobalMeshes = [];
    this._xrayGlobalActive = types.length > 0;
    if (!types.length) return;
    const THREE = this.THREE;
    const wireframeMode = this.mode === 'wireframe';
    this._xrayGlobalMeshes = (this._pickMeshes || []).filter((m) => types.includes(m.userData?.pick?.type) && !m.userData._xrayOrigMaterial);
    this._xrayGlobalMeshes.forEach((m) => {
      m.userData._xrayGlobalOrigMaterial = m.material;
      m.material = wireframeMode
        ? new THREE.MeshBasicMaterial({ color: 0x78c8ff, wireframe: true })
        : new THREE.MeshBasicMaterial({ color: m.userData._xrayGlobalOrigMaterial.color || 0xffffff, transparent: true, opacity: 0.18, depthWrite: false });
      if (this._hybridMeshes) {
        const idx = this._hybridMeshes.indexOf(m);
        if (idx !== -1) { this._hybridMeshes.splice(idx, 1); m.userData._xrayGlobalRemovedFromHybrid = true; }
      }
      this._instancePromote(m);
    });
  }

  /** Boneco-palito do PLAYER, com "cabeça de câmera" — pedido do usuário:
   *  "o player deve ter uma representação característica no 3D. Um boneco
   *  palito com cabeça de câmera (os palitos são 3D). O boneco deve ter
   *  toda a movimentação articulada. Só aparece quando é outra câmera sendo
   *  usada para observar o cenário." — ou seja: NÃO aparece na visão em 1ª
   *  pessoa de sempre (ninguém se vê a si mesmo em 1ª pessoa), só quando
   *  "assistindo" uma câmera fixa do mapa (ver view3d.js _enterCameraView/
   *  setPlayerFigureVisible). Construído uma ÚNICA vez aqui (igual aos
   *  ghosts, ver _initBuildGhosts) — escondido por padrão, só reposicionado/
   *  reanimado a cada quadro por updatePlayerFigure, nunca recriado — pra
   *  não pesar remontando geometria toda hora. Cada "palito" é um cilindro
   *  DE VERDADE (não uma linha 2D) — pedido: "os palitos são 3D". A
   *  articulação (ombros/quadris como pivôs próprios, ver updatePlayerFigure)
   *  é o que permite o "boneco andando" ao vivo. */
  _buildPlayerFigure(THREE, scene) {
    const matCorpo = new THREE.MeshLambertMaterial({ color: 0xffcf6b });
    const matCam = new THREE.MeshLambertMaterial({ color: 0x2c313a });
    const root = new THREE.Group();
    root.visible = false;

    // Tronco — cilindro fino vertical, da altura do quadril até o pescoço.
    const ALT_QUADRIL = 0.9, ALT_OMBRO = 1.45, ALT_PESCOCO = 1.55;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, ALT_OMBRO - ALT_QUADRIL, 6), matCorpo);
    torso.position.set(0, (ALT_QUADRIL + ALT_OMBRO) / 2, 0);
    root.add(torso);

    // Cabeça-câmera — MESMO desenho (corpo + lente) da malha de câmera de
    // verdade em setScene (mapData.cameras), só menor (proporção de
    // "cabeça"), pra deixar claro que é uma câmera, não uma cabeça humana.
    const headPivot = new THREE.Group();
    headPivot.position.set(0, ALT_PESCOCO, 0);
    const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.11), matCam);
    headPivot.add(camBody);
    const camLens = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 10), matCam);
    camLens.rotation.z = Math.PI / 2; // ponta do cone apontando pro +X local (frente)
    camLens.position.set(0.11, 0, 0);
    headPivot.add(camLens);
    root.add(headPivot);

    // Braços/pernas — 1 segmento "palito" cada, pivotado no ombro/quadril
    // (Group própria pra cada um) — girar `.rotation.x` desses pivôs é o
    // ciclo de andar (ver updatePlayerFigure), tipo pêndulo, braço/perna
    // opostos em fase oposta (mesmo espírito de um boneco-palito andando).
    const braçoGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6);
    const pernaGeo = new THREE.CylinderGeometry(0.03, 0.03, ALT_QUADRIL, 6);
    const membros = {};
    [['leftArm', -1, ALT_OMBRO, 0.5], ['rightArm', 1, ALT_OMBRO, 0.5], ['leftLeg', -1, ALT_QUADRIL, ALT_QUADRIL], ['rightLeg', 1, ALT_QUADRIL, ALT_QUADRIL]].forEach(([nome, lado, altPivo, comprimento]) => {
      const ehBraço = nome.includes('Arm');
      const pivo = new THREE.Group();
      pivo.position.set(lado * (ehBraço ? 0.09 : 0.06), altPivo, 0);
      const membro = new THREE.Mesh(ehBraço ? braçoGeo : pernaGeo, matCorpo);
      membro.position.set(0, -comprimento / 2, 0); // pendurado pra BAIXO a partir do pivô, gira em torno dele
      pivo.add(membro);
      root.add(pivo);
      membros[nome] = pivo;
    });

    scene.add(root);
    this._playerFigure = { root, headPivot, ...membros };
  }

  /** `x,y,z` = MESMA convenção de this._camera (view3d.js) — `y` é a altura
   *  do OLHO (EYE_HEIGHT), não do chão; o boneco pousa os pés no chão
   *  subtraindo isso na hora de posicionar. `yaw` = MESMA convenção de
   *  this._camera.yaw (não `angulo`) — mesma conversão pra mesh.rotation.y
   *  já usada pelo ghost de objeto (ver showGhostObject) por consistência.
   *  `andando` liga a animação de passada; `t` é um relógio ACUMULADO só
   *  enquanto anda (ver view3d.js _playerWalkT), não o tempo do jogo inteiro
   *  — assim a passada sempre COMEÇA na mesma fase (perna parada = pose de
   *  pé), em vez de "congelar" no meio de um passo quando o boneco para. */
  updatePlayerFigure(x, y, z, yaw, andando, t) {
    const f = this._playerFigure;
    if (!f) return;
    const EYE_HEIGHT_APROX = 1.65; // só pra achar o chão a partir do olho — ver view3d.js EYE_HEIGHT
    f.root.position.set(x, y - EYE_HEIGHT_APROX, z);
    f.root.rotation.y = Math.atan2(Math.cos(yaw || 0), Math.sin(yaw || 0)); // mesma fórmula de showGhostObject
    const swing = andando ? Math.sin(t * 7) * 0.55 : 0;
    f.leftArm.rotation.x = swing;
    f.rightArm.rotation.x = -swing;
    f.leftLeg.rotation.x = -swing;
    f.rightLeg.rotation.x = swing;
  }

  setPlayerFigureVisible(visible) {
    if (this._playerFigure) this._playerFigure.root.visible = !!visible;
  }

  /** FOV da câmera de RENDER (`camera3`) — fixo em 72° sempre, EXCETO
   *  enquanto "assistindo" uma câmera fixa (ver view3d.js _camMode), que
   *  pode dar zoom dentro de um alcance limitado (pedido do usuário: "é
   *  possível dar zoom... de forma limitada"). `deg` já vem clampado de
   *  quem chama; aqui só aplica de verdade. */
  setFov(deg) {
    if (!this.camera3) return;
    this.camera3.fov = deg;
    this.camera3.updateProjectionMatrix();
  }

  /** [10/09/2026] NOVO -- CORRECAO do pan panoramico (Shift+botao-do-meio
   *  em "ver atraves desta camera", ver view3d.js onMouseMove). Pedido
   *  verbatim do usuario, com 2 capturas do Blender comparando antes/
   *  depois: "O shift+ botao do meio do mouse nao pode mudar a
   *  perspectiva. A perspectiva deve ser preservada [...] Na 1a imagem
   *  esta mais a esquerda. Na 2a imagem [...] a mesma perspectiva e
   *  mantida, mas todo o desenho e transladado para o lado [...] E como
   *  pegar uma foto e so move-la para o lado, a foto nao muda, mas a
   *  posicao sim." A 1a tentativa (v433) deslocava a POSICAO real de
   *  'camera3' no mundo -- isso MUDA a perspectiva de verdade (paralaxe:
   *  objetos em profundidades diferentes na cena se deslocam por
   *  quantidades DIFERENTES na tela quando a camera se move no espaco),
   *  o oposto do pedido -- alem de quebrar a calibracao da camera/orb
   *  ("ver atraves desta camera" existe justamente pra comparar o render
   *  com uma foto de referencia calibrada; mover a posicao real invalida
   *  essa comparacao). A tecnica CORRETA (a mesma do "View > Pan" do
   *  Blender quando a vista esta travada numa camera, e de uma lente de
   *  "descentramento"/"tilt-shift" de verdade): deslocar so a JANELA do
   *  frustum de projecao (equivalente a descentralizar o sensor/filme),
   *  SEM mover a camera nem girar/mudar o FOV -- a cena inteira desloca
   *  dentro do quadro, preservando 100% das linhas de fuga/paralaxe
   *  (exatamente como arrastar uma foto por baixo de uma janela/mascara
   *  fixa: o que se ve muda de POSICAO dentro da janela, mas a "foto" em
   *  si -- a perspectiva -- nunca muda). Implementado via
   *  'PerspectiveCamera.setViewOffset' nativo do Three.js (mecanismo de
   *  "lens shift"/tiled rendering): com 'fullWidth === width' e
   *  'fullHeight === height' (nenhum corte/recorte, nenhuma mudanca de
   *  FOV/zoom aparente -- so o CENTRO do frustum se desloca). Formula:
   *  a matriz de projecao off-axis do Three.js soma 'offsetX' direto em
   *  'left'/'right' (em unidades fisicas do plano near, proporcionais a
   *  'near * tan(fov/2)') quando 'width === fullWidth' -- por isso aqui
   *  'W'/'H' (a largura/altura do frustum no plano near) sao recalculados
   *  a cada chamada a partir do FOV/aspect/near ATUAIS de 'camera3' (que
   *  mudam com o zoom da roda do mouse, ver onWheel/_CAMVIEW_ZOOM_FOV_*),
   *  entao o pan continua correto em qualquer nivel de zoom. 'xFrac'/
   *  'yFrac' sao adimensionais (fracao da largura/altura do quadro,
   *  tipicamente pequenos, acumulados a partir do movimento do mouse em
   *  'view3d.js' onMouseMove) -- sinal invertido de proposito: mover o
   *  CENTRO do frustum pra direita ('offsetX' positivo) faz a CENA
   *  parecer deslocar pra ESQUERDA na tela (o oposto do que "arrastar uma
   *  foto pra direita" deve parecer), entao aqui a cena desloca na MESMA
   *  direcao do arrasto do mouse. xFrac=0/yFrac=0 limpa o offset
   *  (camera3.clearViewOffset()) -- sempre chamado ao entrar/sair de
   *  '_fotoCamMode'/'_orbCamMode' (ver view3d.js _resetCamZoom) pra nunca
   *  vazar pan pra a navegacao normal/Modelador (que reaproveitam o
   *  MESMO 'camera3'). */
  setCamPanFrac(xFrac, yFrac) {
    if (!this.camera3) return;
    const cam = this.camera3;
    if (!xFrac && !yFrac) { cam.clearViewOffset(); return; }
    const halfH = cam.near * Math.tan((cam.fov * Math.PI / 180) / 2) / (cam.zoom || 1);
    const halfW = halfH * (cam.aspect || 1);
    const W = 2 * halfW, H = 2 * halfH;
    cam.setViewOffset(W, H, -(xFrac || 0) * W, -(yFrac || 0) * H, W, H);
  }

  /** Liga a exclusão de pick (ver comentário grande em `this._pickExclude`,
   *  constructor) — chamado por view3d.js ao ENTRAR em `_fotoCamMode`/
   *  `_orbCamMode` com o `type`/`id` do próprio orb/câmera sendo visto
   *  através. */
  setPickExclude(type, id) {
    this._pickExclude = (type && id != null) ? { type, id } : null;
  }

  /** Desliga a exclusão de pick — chamado ao SAIR de `_fotoCamMode`/
   *  `_orbCamMode` (ver view3d.js `_resetCamZoom`), senão o próprio
   *  orb/câmera ficaria pra sempre impossível de selecionar depois. */
  clearPickExclude() {
    this._pickExclude = null;
  }

  /** true quando `type`/`id` batem com a exclusão ativa no momento (ver
   *  `setPickExclude`) — usado por `pickFromRay`/`hoverPick`/
   *  `_hoverPickPixelPerfect` pra pular o próprio orb/câmera calibrado. */
  _isPickExcluded(type, id) {
    const ex = this._pickExclude;
    return !!(ex && ex.type === type && ex.id === id);
  }

  /** Liga/desliga o ponto de tela usado por `_updateHoverHighlight` (ver
   *  comentário grande em `this._hoverScreenNdc`, constructor) — chamado
   *  por view3d.js `_pickAtClientPoint` (mousemove/click reais) enquanto
   *  `_fotoCamMode`/`_orbCamMode` ativos, e limpo (`clearHoverScreenPoint`)
   *  ao sair desses modos (ver `_resetCamZoom`). */
  setHoverScreenPoint(ndcX, ndcY) {
    this._hoverScreenNdc = { x: ndcX, y: ndcY };
  }

  clearHoverScreenPoint() {
    this._hoverScreenNdc = null;
  }

  /** [10/09/2026] NOVO — pedido verbatim: "No objeto câmera e no 'orb da
   *  foto' deve ser possível definir as propriedades da câmera tanto no 2D
   *  quanto no 3D. São as mesmas do Blender [...] Clipping: Start/End." Sem
   *  isto, `camera3.far` seria sempre recalculado a partir da neblina/
   *  distância de renderização a cada `render()` (ver o bloco "this.scene
   *  .fog" logo abaixo/updateProjectionMatrix), sobrescrevendo qualquer
   *  valor de recorte calibrado — os 2 campos `_clipNearOverride`/
   *  `_clipFarOverride` guardam a intenção explícita (setada só enquanto
   *  "vendo através" de uma câmera/orb calibrada — ver view3d.js
   *  _enterCameraOrbView/_exitCameraOrbView) e o bloco do fog abaixo respeita
   *  o override quando presente. `null`/valor <= 0 em qualquer um dos dois
   *  desativa aquele override específico (mantém o comportamento padrão). */
  setClipPlanes(nearM, farM) {
    if (!this.camera3) return;
    this._clipNearOverride = (typeof nearM === 'number' && nearM > 0) ? nearM : null;
    this._clipFarOverride = (typeof farM === 'number' && farM > 0) ? farM : null;
    if (this._clipNearOverride != null) this.camera3.near = this._clipNearOverride;
    if (this._clipFarOverride != null) this.camera3.far = this._clipFarOverride;
    this.camera3.updateProjectionMatrix();
  }

  /** Sai do override de recorte (ver setClipPlanes acima) — volta o `near`
   *  padrão de fábrica do Three.js/`_initThree` e deixa `far` de novo a
   *  cargo do cálculo dinâmico de neblina (bloco "this.scene.fog", abaixo). */
  clearClipPlanes() {
    this._clipNearOverride = null;
    this._clipFarOverride = null;
    if (this.camera3) { this.camera3.near = 0.1; this.camera3.updateProjectionMatrix(); } // 0.1 = mesmo valor de fábrica de _initThree (new THREE.PerspectiveCamera(72, 1, 0.1, ...))
  }

  /** [11/09/2026] NOVO — esconde/mostra a malha caixa+cone de UMA câmera
   *  específica (ver índice `this._cameraMeshesById`, montado em setScene).
   *  Chamada por view3d.js `_enterCameraOrbView`/`_exitCameraOrbView`:
   *  quando a visão do jogador está travada exatamente na pose de uma
   *  câmera "Câmeras", a malha DELA PRÓPRIA (que fica no mesmo ponto do
   *  olho de render, com o cone se estendendo pra FORA na direção de
   *  apontamento — ou seja, na direção pra onde o jogador está agora
   *  olhando A PARTIR DE) acaba renderizando dentro do próprio frustum,
   *  aparecendo como uma forma indevida "na frente" da câmera (mesma ideia
   *  de um jogo em 1ª pessoa esconder a malha do próprio corpo do jogador
   *  da câmera dele mesmo). `camId` null/inexistente é um no-op seguro. */
  setCameraMeshVisible(camId, visible) {
    const meshes = camId != null ? this._cameraMeshesById?.[camId] : null;
    if (!meshes) return;
    meshes.forEach((m) => { if (m) m.visible = visible; });
    // [14/09/2026] CORRIGIDO — pedido verbatim: "ao clicar em uma câmera e
    // selecionar 'Ver através desta câmera' [...] o cone da câmera
    // selecionada acaba voltando a parecer e fica na frente da tela." BUG
    // CONFIRMADO via Playwright (live): não era só ao entrar/sair do
    // Modelador — a malha voltava a aparecer sozinha em MENOS DE 100ms,
    // sempre, mesmo sem tocar no Modelador. Causa raiz de verdade:
    // `_updateDistanceCulling` (chamada TODO QUADRO, ver `render()`) trata
    // câmeras como qualquer outro objeto "elegível pro corte por
    // distância" (`_setupCullMeshes`, `tipo === 'camera'`) e reatribui
    // `mesh.visible = distância <= alcance` sem saber de
    // `setCameraMeshVisible`/`setFotoMeshVisible` — como a câmera sendo
    // "vista através" está a distância ZERO do próprio olho de render,
    // `0 <= alcance` é sempre verdadeiro, então o culling FORÇAVA
    // `visible=true` de volta no quadro seguinte, não importa quantas vezes
    // este método fosse chamado antes. CORRIGIDO NA RAIZ (não aqui — ver
    // `_updateDistanceCulling`/`_forcedHiddenMeshes` abaixo): este método
    // agora também mantém um Set global `this._forcedHiddenMeshes` com toda
    // malha atualmente escondida "à força" (por este método OU por
    // `setFotoMeshVisible`) — é esse Set que `_updateDistanceCulling`
    // consulta pra NUNCA reverter estas malhas de volta pra visível, não
    // importa a distância calculada.
    if (!this._forcedHiddenMeshes) this._forcedHiddenMeshes = new Set();
    meshes.forEach((m) => {
      if (!m) return;
      if (visible) this._forcedHiddenMeshes.delete(m); else this._forcedHiddenMeshes.add(m);
    });
  }

  /** [12/09/2026] NOVO — mesmo bug do cone "na frente da câmera" (ver
   *  `setCameraMeshVisible` acima), agora pro "orb de foto": esconde/mostra
   *  a malha esfera+cone (e a placa texturizada da foto, quando existe) de
   *  UM orb de foto específico (ver índice `this._fotoMeshesById`, montado
   *  em setScene, bloco "fotos vinculadas ao mapa"). Chamada por
   *  view3d.js `_enterFotoCameraView`/`_exitFotoCameraView`: diferente do
   *  "orb de câmera" (`_orbCamMode`, câmera travada DE VERDADE), "ver
   *  através desta câmera" de um orb de foto é um modo ESPECTADOR
   *  (`_fotoCamMode` — só a pose RENDERIZADA é sobrescrita, `this._camera`
   *  continua livre) — mas o olho de render fica no mesmo ponto do orb do
   *  mesmo jeito, então a própria malha dele (cone se estendendo pra FORA,
   *  na direção de apontamento — pra onde o render agora está "olhando A
   *  PARTIR DE") sofre exatamente o mesmo problema. `fotoId` null/
   *  inexistente é um no-op seguro. */
  setFotoMeshVisible(fotoId, visible) {
    const meshes = fotoId != null ? this._fotoMeshesById?.[fotoId] : null;
    if (!meshes) return;
    meshes.forEach((m) => { if (m) m.visible = visible; });
    // [14/09/2026] NOVO — mesmo mecanismo de `setCameraMeshVisible` (ver
    // comentário grande lá), espelhado aqui por consistência/segurança:
    // `_setupCullMeshes` hoje só inclui `tipo 'object'/'item'/'camera'` no
    // corte por distância (orb de foto é `tipo:'fotoPin'`, de fora dessa
    // lista) — então este orb, sozinho, não sofre o bug de "reaparecer"
    // sozinho HOJE, mas registrar aqui do mesmo jeito custa nada e blinda
    // contra qualquer mudança futura em `_setupCullMeshes` que passe a
    // incluir `'fotoPin'`.
    if (!this._forcedHiddenMeshes) this._forcedHiddenMeshes = new Set();
    meshes.forEach((m) => {
      if (!m) return;
      if (visible) this._forcedHiddenMeshes.delete(m); else this._forcedHiddenMeshes.add(m);
    });
  }

  /** [10/09/2026] NOVO — pedido verbatim: "Deve aparecer um retângulo
   *  amarelo representado o enquadramento da câmera de acordo com as
   *  propriedades da câmera ('campo de visão', aspect ratio no x e no y).
   *  O retângulo amarelo pode ser habilitado e desabilitado por um botão
   *  em algum lugar." Liga/desliga TODOS os gizmos de enquadramento
   *  (retângulo amarelo + 4 linhas até o canto, um conjunto por "orb de
   *  foto"/"Câmera" com `camProps` — ver `this._fotoFrustumMeshesById`,
   *  montado em `setScene`, bloco "fotos vinculadas ao mapa") de uma vez
   *  só — chamada por view3d.js (botão "🟨 Enquadramento", ver
   *  `_toggleFrustumGizmos`). Guarda o estado em `this._frustumGizmosEnabled`
   *  pra qualquer `setScene` FUTURO (troca de andar, nova edição) já nascer
   *  com a visibilidade certa, sem precisar o usuário clicar de novo. */
  setCameraFrustumsVisible(visible) {
    this._frustumGizmosEnabled = !!visible;
    Object.values(this._fotoFrustumMeshesById || {}).forEach((meshes) => {
      (meshes || []).forEach((m) => { if (m) m.visible = this._frustumGizmosEnabled; });
    });
  }

  /** [10/09/2026] NOVO — CORRIGIDO por pedido verbatim: "O botão de
   *  enquadramento deve ser só para a câmera atual, deve aparecer junto
   *  na barra em baixo (onde tem o botão 'Sair da câmera')." O botão
   *  global "🟨 Enquadramento" (barra superior, ligava/desligava TODAS as
   *  câmeras via `setCameraFrustumsVisible` acima) foi removido de
   *  view3d.js — substituído por este par de métodos, que mexem só no(s)
   *  gizmo(s) de UM `foto.id` por vez (o da câmera atualmente "vista
   *  através", ver `_renderFotoCamOverlay`/botão novo no rodapé). Não
   *  existe gizmo pra todo `foto.id` (só fotos/orbs com `camProps` — ver
   *  `this._fotoFrustumMeshesById`, montado em `setScene`) — daí
   *  `hasCameraFrustum` (view3d.js usa pra decidir se mostra o botão). */
  setCameraFrustumVisible(fotoId, visible) {
    const meshes = this._fotoFrustumMeshesById?.[fotoId];
    if (!meshes) return;
    meshes.forEach((m) => { if (m) m.visible = !!visible; });
  }

  isCameraFrustumVisible(fotoId) {
    const meshes = this._fotoFrustumMeshesById?.[fotoId];
    return !!(meshes && meshes[0] && meshes[0].visible);
  }

  hasCameraFrustum(fotoId) {
    return !!this._fotoFrustumMeshesById?.[fotoId];
  }

  /** [15/09/2026] NOVO — pedido verbatim: "Ao acessar 'Propriedades da
   *  câmera' e mudar os valores de largura e altura da resolução, a foto
   *  não deve ser mexida, pois estes valores são para a câmera, ou seja,
   *  ao alterá-los, o enquadramento é que muda. Ao vivo e imediatamente,
   *  devem ser aplicadas as alterações no retângulo amarelo." Recalcula
   *  só os 4 cantos (`linhaRet`/`linhasCantos`, já existentes — nunca
   *  recria a malha) a partir do `camProps` ATUAL, reaproveitando a
   *  origem/direção congeladas em `_fotoFrustumBasisById` (setScene) —
   *  MESMA fórmula usada lá (mantida em sincronia de propósito: qualquer
   *  mudança numa precisa ser espelhada na outra). Chamada por
   *  view3d.js `_activeCamPropsEditTarget()` a cada edição em
   *  "Propriedades", tanto pra `_fotoCamMode` (orb de foto) quanto pra
   *  `_orbCamMode` (câmera legada — vira no-op inofensivo, já que esse
   *  tipo nunca teve gizmo de frustum, ver `hasCameraFrustum` acima). */
  updateCameraFrustumGeometry(fotoId, camProps) {
    const meshes = this._fotoFrustumMeshesById?.[fotoId];
    const basis = this._fotoFrustumBasisById?.[fotoId];
    if (!meshes || !basis || !this.THREE) return;
    const THREE = this.THREE;
    const [linhaRet, linhasCantos] = meshes;
    const cp = camProps || {};
    const resX = cp.resolutionX ?? 1920;
    const resY = cp.resolutionY ?? 1080;
    const vFovRad = window.Cam3DMath.camPropsVFovRad(cp.fov, resX, resY);
    const aspectXY = resX / Math.max(1, resY);
    const FRUSTUM_DIST = 1.0;
    const halfH = FRUSTUM_DIST * Math.tan(vFovRad / 2);
    const halfW = halfH * aspectXY;
    const origemFr = basis.origem;
    const dirVec = basis.dirVec;
    const alvoFr = origemFr.clone().add(dirVec);
    const upMundo = Math.abs(dirVec.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const m4Fr = new THREE.Matrix4().lookAt(origemFr, alvoFr, upMundo);
    const rightFr = new THREE.Vector3().setFromMatrixColumn(m4Fr, 0);
    const upFr = new THREE.Vector3().setFromMatrixColumn(m4Fr, 1);
    const centroFr = origemFr.clone().addScaledVector(dirVec, FRUSTUM_DIST);
    const c1 = centroFr.clone().addScaledVector(rightFr, -halfW).addScaledVector(upFr, halfH);
    const c2 = centroFr.clone().addScaledVector(rightFr, halfW).addScaledVector(upFr, halfH);
    const c3 = centroFr.clone().addScaledVector(rightFr, halfW).addScaledVector(upFr, -halfH);
    const c4 = centroFr.clone().addScaledVector(rightFr, -halfW).addScaledVector(upFr, -halfH);
    linhaRet.geometry.setFromPoints([c1, c2, c3, c4, c1]);
    linhasCantos.geometry.setFromPoints([origemFr, c1, origemFr, c2, origemFr, c3, origemFr, c4]);
  }

  /** Só as `Engine3D.MAX_LUMINARIAS_ATIVAS` luzes de luminária mais PRÓXIMAS
   *  de `camera` ficam ACESAS (`.visible`, que o Three.js já respeita no
   *  cálculo de iluminação sem precisar remontar nenhuma malha) — pedido do
   *  usuário, resolvendo "mesmo olhando para uma parede, o FPS não está
   *  aumentando": cada luz acesa custa um laço a mais no shader de
   *  FRAGMENTO pra TODO pixel da tela, então o número de luzes que EXISTEM
   *  no mapa (mesmo já limitado, ver MAX_LUMINARIA_LIGHTS) importava pouco —
   *  o que pesava era quantas estavam ACESAS ao mesmo tempo,
   *  independentemente de estarem à vista ou atrás do jogador. Chamado a
   *  cada quadro renderizado (ver view3d.js _loop) — barato mesmo assim: no
   *  máximo MAX_LUMINARIA_LIGHTS itens pra ordenar por quadro (ver
   *  `_maxLuzesReais`, tabela por `resolucao3D`, AJUSTADO 02/09/2026). */
  updateActiveLights(camera) {
    const luzes = this._dynamicLights;
    if (!luzes?.length) return;
    const maxAtivas = this._maxLuzesAtivas();
    if (luzes.length <= maxAtivas) { luzes.forEach((l) => { l.visible = true; }); return; }
    luzes
      .map((l) => ({ l, d2: (l.position.x - camera.x) ** 2 + (l.position.y - camera.y) ** 2 + (l.position.z - camera.z) ** 2 }))
      .sort((a, b) => a.d2 - b.d2)
      .forEach(({ l }, i) => { l.visible = i < maxAtivas; });
  }

  setMode(mode) { this.mode = mode; }

  /** [13/09/2026] NOVO — troca (ou desliga, passando `null`) a resolução de
   *  renderização customizada com o "Ver em 3D" JÁ ABERTO (ver comentário
   *  grande sobre `this._customRes` no construtor/`_resize`) — usada por
   *  view3d.js quando a config muda ao vivo (`_onMapConfigChange`), sem
   *  precisar fechar/reabrir a tela. Só marca o novo valor e força
   *  `_resize()` a recalcular tudo no próximo quadro (zera `_lastW` pra
   *  passar pelo cache-guard mesmo se `custom.w/h` coincidir por acaso com
   *  o último tamanho já aplicado). */
  setCustomRes3D(customRes) {
    this._customRes = (customRes && customRes.w > 0 && customRes.h > 0) ? { ...customRes } : null;
    this._lastW = -1; this._lastH = -1;
  }

  _pixelRatioCap() {
    const teto = Engine3D.RESOLUCAO_DPR[this._config.resolucao3D] || Engine3D.RESOLUCAO_DPR.alta;
    return Math.min(window.devicePixelRatio || 1, teto);
  }

  /** NOVO (07/09/2026) — ver "⚙️ Configurações 3D › Efeitos de tela" no
   *  mapconfig.js (DEFAULTS.efeitoTelaEscurecida3D). Só usado em modo "eye"
   *  (o modo não-eye desenha direto no canvas de tela, onde
   *  `renderer.outputColorSpace` já resolve a conversão sozinho — este
   *  método só decide o `colorSpace` da TEXTURA do `this.renderTarget`
   *  desta instância). `THREE.SRGBColorSpace` (padrão, `efeitoTelaEscurecida3D`
   *  desligado) = visual correto/claro de sempre. `THREE.NoColorSpace`
   *  (opção ligada) = pula a conversão de propósito, reproduzindo o efeito
   *  "escurecido" que era um BUG antes de virar uma opção pedida pelo
   *  usuário (ver changelog do sw.js v398/v399 pro histórico completo). */
  _colorSpaceEfeito() {
    return this._config.efeitoTelaEscurecida3D ? this.THREE.NoColorSpace : this.THREE.SRGBColorSpace;
  }

  /** NOVO (07/09/2026) — chamado por `setConfig()` sempre que a config
   *  muda, pra reaplicar `_colorSpaceEfeito()` na textura do render target
   *  já existente, sem precisar recriá-lo. Não faz nada em modo não-eye
   *  (não existe `this.renderTarget` nesse modo — a conversão fica só em
   *  `renderer.outputColorSpace`, fixo desde `_initThree`, sem opção de
   *  "efeito escurecido" nesse modo por enquanto).
   *
   *  RESSALVA (07/09/2026), pedido verbatim do usuário: "Está sendo
   *  necessário sair e entra no 'Ver em 3D' para que seja aplicado." — na
   *  prática, esta troca sozinha NÃO é suficiente pra atualizar a cena já
   *  em tela (confirmado pelo usuário) — o mais provável é o Three.js
   *  reaproveitar o PROGRAM/shader já compilado de cada material entre
   *  quadros sem perceber a mudança. Sem navegador de verdade nesta sessão
   *  pra confirmar/corrigir a causa exata dentro do Three.js com segurança
   *  (sem Playwright, restrição do projeto), este método continua sendo
   *  chamado (não atrapalha, cobre o caminho "documentado" do Three.js),
   *  mas quem garante o efeito de verdade é sair/entrar no "Ver em 3D"
   *  (recria a instância do zero, com o render target já correto desde
   *  `_initThree`) — ver aviso correspondente no painel de configurações
   *  (mapconfig.js, `mc-efeito-tela-escurecida3d`). */
  _applyColorSpaceEfeito() {
    if (this._eye && this.renderTarget) this.renderTarget.texture.colorSpace = this._colorSpaceEfeito();
  }

  _renderDistance() { return Math.max(3, this._config.renderDistance || 42); }

  /** Início da neblina (`THREE.Fog.near`) — pedido do usuário: "distância de
   *  renderização" agora aceita um valor "customizado" livre, com mínimo de
   *  3m (ver mapconfig.js). O `near` da neblina sempre foi fixo em 8m — com
   *  as distâncias pré-definidas (20/42/80/150m) isso nunca foi problema
   *  (sempre bem menor que o `far`), mas um valor customizado pequeno (3m)
   *  ficaria com `near`(8) MAIOR que `far`(3), invertendo o intervalo da
   *  neblina (comportamento indefinido do THREE.Fog — tudo fica ou 100%
   *  encoberto ou 100% limpo, dependendo do navegador). Aqui o `near` se
   *  afasta do `far` em até 8m (igual a sempre foi, pra distâncias >=10m —
   *  `far - 8 >= 8`, resultado idêntico a antes) e encolhe pra caber
   *  dentro de distâncias menores, sempre deixando uma faixa de transição
   *  de pelo menos 2m antes do `far`. */
  _fogNear(rd) { return Math.min(8, Math.max(1, rd - 2)); }

  /** Paleta de céu/luz pro horário ATUAL do relógio do dispositivo (pedido
   *  do usuário: "faça o céu ficar de acordo com o período do dia" — antes
   *  era sempre a mesma cor escura fixa, de dia ou de noite). Interpola
   *  linearmente (THREE.Color.lerp) entre "paradas" em horários-chave —
   *  madrugada/noite fechada (escuro), amanhecer (laranja), dia (azul
   *  claro), entardecer (laranja de novo) — cobrindo as 24h num ciclo (a
   *  última parada, 24h, repete a primeira, 0h, pra fechar o ciclo sem
   *  salto). ATUALIZADO (01/09/2026, item "Sol e Lua"): não é mais chamada
   *  só uma vez — `_updateSky` (logo abaixo) volta a chamar esta função a
   *  cada ~30s (nunca quadro a quadro, o custo de recriar `THREE.Color` a
   *  cada frame não valeria a pena pra algo que muda tão devagar), pra o
   *  céu/Sol/Lua acompanharem o relógio de verdade numa sessão 3D longa,
   *  não só no instante em que a tela foi aberta.
   *
   *  NOVO (03/09/2026) — Pedido do usuário: "Coloque uma seção, nas
   *  'configurações 3D', para fazer com que se possa escolher entre manhã,
   *  dia, tarde e noite. E uma barra com vários fusos [trilha de horas do
   *  dia] ... alteram o tempo." Ver mapconfig.js DEFAULTS.horaDoDiaManual —
   *  quando não for `null`, esta função usa esse valor FIXO no lugar da
   *  hora real do relógio (`new Date()`), então tudo que já dependia de
   *  `hora` aqui (céu/luzes) e em `_updateSky` (posição do Sol/Lua) passa a
   *  refletir o horário escolhido manualmente no painel ⚙️, em vez do
   *  horário real do aparelho. */
  _horaAtualConfigurada() {
    const manual = this._config?.horaDoDiaManual;
    // [13/09/2026 UTC] Pedido: "Seguir relógio do mundo" — botão novo,
    // acima de "Seguir relógio do aparelho", mutuamente exclusivo com ele.
    // Correção explícita do usuário: "Não é para ser 'relógio do mundo'
    // é para ser 'relógio do mundo' (ou seja, todo o cenário 3D, não só o
    // prédio)". Reaproveita `RelogioMundo.getHoraAtual()` (mecanismo já
    // genérico — relógio simulado de velocidade configurável, tempo real
    // por padrão) como fonte de hora pra ISSO — céu/Sol/Lua da cena
    // inteira — sem duplicar um segundo relógio do zero. O rótulo visível
    // ao usuário (HUD) foi atualizado separadamente pra "Relógio do
    // mundo"; o nome interno do módulo/global (`RelogioMundo`) e sua
    // lógica de expediente/almoço continuam intactos (scripts de NPC já
    // dependem deles e aquilo é legitimamente sobre o prédio).
    if (manual === 'mundo') {
      // [13/09/2026 UTC] CORRIGIDO — bug relatado pelo usuário (globo
      // "preto, parado e não interativo" quando 'Seguir relógio do
      // mundo' está ativo): `RelogioMundo.getHoraAtual()` NÃO devolve um
      // número decimal — devolve um OBJETO `{horas, minutos, segundos,
      // diaDaSemana}` (ver relogio-mundo.js). O código anterior fazia
      // `typeof h === 'number'`, que é SEMPRE falso pra esse objeto, então
      // caía sempre no fallback do relógio do aparelho, SEM avisar de
      // erro nenhum — o "mundo" nunca funcionava de verdade, silenciosamente.
      const h = window.RelogioMundo?.getHoraAtual?.();
      if (h && typeof h === 'object' && !isNaN(Number(h.horas))) {
        return Number(h.horas) + Number(h.minutos || 0) / 60 + Number(h.segundos || 0) / 3600;
      }
      // RelogioMundo indisponível por algum motivo: cai pro relógio do
      // aparelho em vez de travar a cena sem luz definida.
      const now = new Date();
      return now.getHours() + now.getMinutes() / 60;
    }
    if (manual != null && !isNaN(Number(manual))) return Number(manual);
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  }

  _skyPalette(THREE) {
    const hora = this._horaAtualConfigurada();
    const PARADAS = [
      { h: 0, bg: 0x05070a, fog: 0x05070a, hemiSky: 0x1a2436, hemiGround: 0x05060a, hemiI: 0.35, dir: 0x33445c, dirI: 0.08, amb: 0.06 },
      { h: 5, bg: 0x05070a, fog: 0x05070a, hemiSky: 0x1a2436, hemiGround: 0x05060a, hemiI: 0.35, dir: 0x33445c, dirI: 0.08, amb: 0.06 },
      { h: 7, bg: 0xf2a765, fog: 0xf2a765, hemiSky: 0xffcf9e, hemiGround: 0x3a2c22, hemiI: 0.7, dir: 0xffb37a, dirI: 0.6, amb: 0.15 },
      { h: 9, bg: 0xbfe0ff, fog: 0xbfe0ff, hemiSky: 0xbfd4ff, hemiGround: 0x14181f, hemiI: 0.95, dir: 0xffffff, dirI: 0.9, amb: 0.15 },
      { h: 17, bg: 0xbfe0ff, fog: 0xbfe0ff, hemiSky: 0xbfd4ff, hemiGround: 0x14181f, hemiI: 0.95, dir: 0xffffff, dirI: 0.9, amb: 0.15 },
      { h: 19, bg: 0xe8834f, fog: 0xe8834f, hemiSky: 0xffb37a, hemiGround: 0x2a1c18, hemiI: 0.6, dir: 0xff8c4a, dirI: 0.45, amb: 0.12 },
      { h: 21, bg: 0x05070a, fog: 0x05070a, hemiSky: 0x1a2436, hemiGround: 0x05060a, hemiI: 0.35, dir: 0x33445c, dirI: 0.08, amb: 0.06 },
      { h: 24, bg: 0x05070a, fog: 0x05070a, hemiSky: 0x1a2436, hemiGround: 0x05060a, hemiI: 0.35, dir: 0x33445c, dirI: 0.08, amb: 0.06 },
    ];
    let a = PARADAS[0], b = PARADAS[PARADAS.length - 1];
    for (let i = 0; i < PARADAS.length - 1; i++) {
      if (hora >= PARADAS[i].h && hora <= PARADAS[i + 1].h) { a = PARADAS[i]; b = PARADAS[i + 1]; break; }
    }
    const t = Utils.clamp((hora - a.h) / ((b.h - a.h) || 1), 0, 1);
    const lerpNum = (x, y) => x + (y - x) * t;
    const lerpColor = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), t).getHex();
    return {
      bg: lerpColor(a.bg, b.bg), fog: lerpColor(a.fog, b.fog),
      hemiSky: lerpColor(a.hemiSky, b.hemiSky), hemiGround: lerpColor(a.hemiGround, b.hemiGround), hemiI: lerpNum(a.hemiI, b.hemiI),
      dir: lerpColor(a.dir, b.dir), dirI: lerpNum(a.dirI, b.dirI), amb: lerpNum(a.amb, b.amb),
    };
  }

  /** NOVO (01/09/2026), item #10 do pedido de 12 itens: cria as duas esferas
   *  do Sol e da Lua (chamado uma única vez, em _initThree). Geometria em
   *  RAIO UNITÁRIO (escalada depois, em _updateSky, conforme a distância de
   *  renderização atual — ver `_config.renderDistance`/mapconfig.js — pra
   *  não precisar recriar a geometria toda vez que a pessoa muda essa opção
   *  no painel ⚙️). `MeshBasicMaterial` (não reage a luz — os dois têm que
   *  parecer "acesos" mesmo à noite/no escuro) com `fog:false` (não some
   *  dissolvido pela neblina como o resto da cena, senão ficariam invisíveis
   *  na maioria das distâncias de renderização — ver `_fogNear`/`scene.fog`)
   *  e `toneMapped:false` (mantém a cor "crua", sem escurecer pelo tone
   *  mapping do resto da cena). Ambos ficam direto em `this.scene` (fora de
   *  `_group`), junto das luzes de luminária — não fazem parte do MAPA, não
   *  devem ser recriados/apagados a cada `setScene` (troca de andar/edição),
   *  só uma vez por sessão 3D (ver dispose() pra a limpeza no fim). */
  _buildCelestialBodies(THREE) {
    const sunGeo = new THREE.SphereGeometry(1, 16, 12);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false, toneMapped: false });
    this._sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this._sunMesh.visible = false; // _updateSky decide visibilidade real (acima/abaixo do horizonte) antes do 1º render
    // [13/09/2026 — ITEM B] `depthWrite:false`+`renderOrder:-2000` tinham
    // sido adicionados aqui pelo MESMO motivo do chão (ver comentário
    // grande em `setScene`, criação do `floor`) — nunca bloquear o plano 3D
    // do backdrop 'Trás'. [19/09/2026] REVERTIDO — plano removido naquela
    // rodada. [22/09/2026 — RODADA SEGUINTE] REAPLICADO — o plano 3D do
    // backdrop 'Trás' foi RESTAURADO (pedido do usuário: "volte a colocar a
    // imagem lá no fundo"); Sol/Lua fazem parte do "céu" (item B, ordem de
    // camadas pedida em 13/09/2026: "1º céu; [...] 3º foto") — nunca
    // deveriam ocluir a foto, mesmo estando geometricamente "na frente" do
    // plano (a uma distância R bem maior que o plano da foto).
    this._sunMesh.material.depthWrite = false;
    this._sunMesh.renderOrder = -2000;
    this.scene.add(this._sunMesh);

    const moonGeo = new THREE.SphereGeometry(1, 16, 12);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xd7deed, fog: false, toneMapped: false });
    this._moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this._moonMesh.visible = false;
    this._moonMesh.material.depthWrite = false;
    this._moonMesh.renderOrder = -2000;
    this.scene.add(this._moonMesh);
  }

  /** NOVO (01/09/2026), item #10 do pedido de 12 itens, verbatim: "Implemente
   *  o Sol e a Lua no cenário 3D." Reaproveita a MESMA `_skyPalette` (hora
   *  real do relógio do dispositivo) que já colore fundo/neblina/luzes —
   *  agora também posiciona Sol e Lua num arco simples cruzando o céu:
   *  nascem no horizonte às 6h/18h (o Sol às 6h, a Lua exatamente 12h
   *  depois, às 18h — sempre um "no céu" enquanto o outro está "embaixo",
   *  como no mundo real) e chegam ao ponto mais alto (zênite) ao meio-dia/
   *  meia-noite. Não é astronomia de verdade (sem latitude/estação do ano,
   *  a direção do arco é FIXA — ver `ax`/`az` abaixo) — decisão deliberada
   *  de manter simples, o pedido foi só "implemente o Sol e a Lua", não um
   *  simulador de céu preciso.
   *
   *  Direção do arco: reaproveita o MESMO eixo (4.5, -3) que já era a
   *  posição fixa da `DirectionalLight` antes desta mudança (ver
   *  _initThree) — assim o arco do Sol fica alinhado com a direção de luz
   *  "clássica" que o app já usava, em vez de uma direção nova arbitrária.
   *  A própria `DirectionalLight` passa a SEGUIR o astro que estiver acima
   *  do horizonte (Sol de dia, Lua de noite — mais fraca, já que sua cor/
   *  intensidade continuam vindo só de `sky.dir`/`sky.dirI`, sem luz própria
   *  extra) em vez de manter a direção fixa de sempre — pedido literal foi
   *  "implemente o Sol e a Lua", e a luz da cena já mudava de COR com a
   *  hora; passar a mudar de DIREÇÃO também é o que torna os dois astros
   *  novos coerentes com a iluminação, não só decoração parada no céu.
   *
   *  Chamada 1x em _initThree (posição/cor inicial) e depois a cada ~30s de
   *  dentro de render() (ver `_lastSkyUpdateAt`) — suficiente pra perceber o
   *  Sol/Lua se movendo numa sessão 3D longa, sem gastar tempo de CPU/GPU
   *  redesenhando isso a cada quadro (a hora não muda rápido o bastante pra
   *  valer o custo por frame). */
  _updateSky() {
    const THREE = this.THREE;
    if (!THREE || !this.scene) return;
    const sky = this._skyPalette(THREE);
    this.scene.background = new THREE.Color(sky.bg);
    this.scene.fog.color.setHex(sky.fog);
    this._hemiLight.color.setHex(sky.hemiSky);
    this._hemiLight.groundColor.setHex(sky.hemiGround);
    this._hemiLight.intensity = sky.hemiI;
    this._dirLight.color.setHex(sky.dir);
    this._dirLight.intensity = sky.dirI;
    // NOVO (07/09/2026), pedido verbatim: "carregar materiais e definir luz
    // ambiente [...]" — ver mapconfig.js DEFAULTS.luzAmbienteIntensidade/
    // luzAmbienteCor. `luzAmbienteIntensidade` é um MULTIPLICADOR em cima do
    // `sky.amb` calculado pelo ciclo dia/noite (1 = sem mudança nenhuma, o
    // comportamento de sempre) — não substitui o ciclo, só ajusta por cima
    // dele, então continua escurecendo à noite mesmo com a intensidade
    // aumentada de propósito.
    const luzAmbienteMult = this._config?.luzAmbienteIntensidade ?? 1;
    this._ambientLight.intensity = sky.amb * luzAmbienteMult;
    this._ambientLight.color.setHex(_hexToThreeColor(this._config?.luzAmbienteCor) ?? 0xffffff);

    // NOVO (03/09/2026) — usa `_horaAtualConfigurada()` (real OU manual, ver
    // comentário grande em _skyPalette acima) em vez de `new Date()` direto,
    // pra o Sol/Lua também obedecerem a hora escolhida no painel ⚙️.
    const hora = this._horaAtualConfigurada();
    // R = distância dos astros — sempre dentro do `far` da câmera ATUAL
    // (varia com a distância de renderização escolhida em ⚙️, ver
    // _renderDistance/setConfig), senão o Three.js simplesmente não desenha
    // (fora do frustum) e o Sol/Lua "somem" com certas configurações.
    const R = Math.max((this.camera3?.far || 60) * 0.85, 40);
    const azLen = Math.hypot(4.5, -3) || 1;
    const ax = 4.5 / azLen, az = -3 / azLen;
    const thetaFor = (h) => ((h - 6) / 12) * Math.PI; // 6h=nascer(0), 12h=zênite(π/2), 18h=ocaso(π)
    const posicionar = (mesh, theta, raioRelativo) => {
      const elev = Math.sin(theta);
      mesh.visible = elev > 0.02; // pequena margem — evita "piscar" bem em cima do horizonte
      if (!mesh.visible) return;
      const horiz = Math.cos(theta);
      mesh.position.set(ax * horiz * R, elev * R, az * horiz * R);
      mesh.scale.setScalar(R * 0.05 * raioRelativo);
    };
    posicionar(this._sunMesh, thetaFor(hora), 1);
    posicionar(this._moonMesh, thetaFor((hora + 12) % 24), 0.62);

    const astroNoCeu = this._sunMesh.visible ? this._sunMesh : (this._moonMesh.visible ? this._moonMesh : null);
    if (astroNoCeu) this._dirLight.position.copy(astroNoCeu.position).normalize().multiplyScalar(10);
    else this._dirLight.position.set(4.5, 8.5, -3); // nem Sol nem Lua acima do horizonte (crepúsculo rápido) — mantém a direção original de antes desta mudança

    this._lastSkyUpdateAt = performance.now();
  }

  /** Aplica a config do painel 2D/3D (ver mapconfig.js) — chamado uma vez ao
   *  montar a tela 3D e de novo sempre que a config mudar (MapConfig.onChange,
   *  ver view3d.js), pra reagir na hora sem precisar reabrir a visualização.
   *  Resolução e distância de renderização já aplicam AO VIVO aqui (não
   *  precisam de setScene/reabrir); antialiasing é a exceção (comentário em
   *  _initThree) — só pega na próxima vez que o 3D for montado. */
  setConfig(cfg) {
    this._config = { ...this._config, ...cfg };
    if (this.renderer) {
      // BUG CORRIGIDO (07/09/2026), arquitetura WebGLRenderTarget: em modo
      // "eye", `this.renderer` é `Engine3D._sharedRenderer` (compartilhado
      // entre TODOS os "olhos") — chamar `setPixelRatio` nele aqui afetaria
      // TODAS as instâncias, não só esta. A resolução de cada "olho" agora
      // vem do TAMANHO do seu próprio `this.renderTarget` (ver `_resize`),
      // nunca do pixelRatio do renderer compartilhado (que fica sempre 1,
      // ver `_ensureSharedRenderer`) — por isso o `setPixelRatio` só faz
      // sentido no modo não-eye (renderer próprio de verdade).
      if (!this._eye) this.renderer.setPixelRatio(this._pixelRatioCap());
      // força o _resize() do próximo quadro a reaplicar mesmo sem o
      // tamanho do canvas ter mudado (ele só age quando w/h mudam) — em modo
      // eye, `_lastDpr` também precisa zerar (o teto de RESOLUCAO_DPR pode
      // ter mudado sem o tamanho CSS do canvas mudar).
      this._lastW = 0; this._lastH = 0; this._lastDpr = 0;
      // NOVO (07/09/2026) — ver "⚙️ Configurações 3D › Efeitos de tela"
      // (mapconfig.js DEFAULTS.efeitoTelaEscurecida3D) e a RESSALVA no
      // comentário grande em `_applyColorSpaceEfeito`: garante o valor
      // certo pra próxima vez que a tela 3D for aberta, mas sozinho não é
      // garantia de efeito imediato na cena já em tela.
      this._applyColorSpaceEfeito();
    }
    if (this.scene?.fog && this.camera3) {
      const rd = this._renderDistance();
      this.scene.fog.near = this._fogNear(rd);
      this.scene.fog.far = rd;
      // [10/09/2026] NOVO — respeita `setClipPlanes` (ver comentário grande
      // lá) enquanto um override de recorte estiver ativo (câmera/orb
      // calibrada "Camera Match"), em vez de sobrescrever `far` sempre a
      // partir da distância de renderização/neblina.
      // [13/09/2026] NOVO — pedido verbatim: "controles de plano de corte
      // próximo/distante (z_near/z_far)... em 'Desempenho 3D'... deve ser
      // atualizado em tempo real". `cfg.cameraZNear`/`cameraZFar` (ver
      // mapconfig.js DEFAULTS) são o 2º nível de prioridade, ABAIXO do
      // override de câmera/orb calibrada (`_clipFarOverride`/
      // `_clipNearOverride`, que continua vencendo enquanto "vendo através"
      // de uma câmera — este painel novo não deve brigar com aquele recurso
      // já existente) — só entram quando não há override de câmera ativo.
      // `cameraZFar` ausente/null (padrão — "automático") cai no MESMO
      // cálculo de sempre (`rd*2.4`); `cameraZNear` ausente/inválido cai no
      // 0.1 de sempre — nenhuma mudança de comportamento pra quem nunca
      // mexeu nesses campos novos. Esta função já é chamada ao vivo por
      // `MapConfig.onChange` (ver view3d.js `_onMapConfigChange`), então
      // arrastar o "botão triplo" já reflete na câmera aberta sem reabrir a
      // tela — satisfaz "tempo real" sem nenhuma chamada direta adicional.
      const cfgFarUser = (Number.isFinite(this._config.cameraZFar) && this._config.cameraZFar > 0) ? this._config.cameraZFar : null;
      const cfgNearUser = (Number.isFinite(this._config.cameraZNear) && this._config.cameraZNear > 0) ? this._config.cameraZNear : null;
      this.camera3.far = (this._clipFarOverride != null) ? this._clipFarOverride : (cfgFarUser ?? Math.max(rd * 2.4, 60));
      this.camera3.near = (this._clipNearOverride != null) ? this._clipNearOverride : (cfgNearUser ?? 0.1);
      this.camera3.updateProjectionMatrix();
      // NOVO (01/09/2026), item "Sol e Lua": a posição dos dois depende do
      // `far` da câmera (ver _updateSky, R = far*0.85) — sem isto, mudar a
      // "Distância de renderização" no painel ⚙️ só reposicionaria o Sol/Lua
      // até ~30s depois (a próxima atualização periódica em render()), em
      // vez de na hora, junto com o resto desta config.
      if (this._sunMesh) this._updateSky();
    } else if (this.scene && this._sunMesh) {
      // NOVO (03/09/2026) — mesma ideia do bloco acima, mas cobrindo o caso
      // (raro, mas possível a depender da ordem de montagem) de `setConfig`
      // ser chamado antes de `scene.fog`/`camera3` existirem: sem este
      // `else`, mudar "Hora do dia" no painel ⚙️ logo ao abrir o 3D podia
      // não refletir na hora (só ~30s depois, no próximo tique periódico).
      this._updateSky();
    }
  }

  setScene(mapData) {
    this.mapData = mapData;
    this.pickables = [];
    // Índice "qual patrimônio está em quais objetos" (pedido do usuário,
    // 26/08/2026: "As flags devem aparecer no 3D também" — mesmas duas
    // flags do mapa 2D, ver mapview.js _drawItemBadges/
    // _computeItemAssocIndex): recalculado 1x por CENA (não por objeto —
    // a malha 3D é montada de uma vez em setScene, não a cada quadro como
    // o canvas 2D), reaproveitado por _addItemAssociadoDestaque abaixo pra
    // cada objeto com patrimônio associado.
    this._itemAssocIndexScene = (typeof Mapping !== 'undefined') ? Mapping.computeItemAssocIndex(mapData) : new Map();
    // Grupos de selo/flags "🔗 item associado" (ver _addItemAssociadoDestaque
    // abaixo) — usado por _updateItemBadgeOcclusion (chamado todo quadro em
    // render()) pra decidir, quando "Plaquinhas/bolinhas" está DESLIGADA em
    // "Ver através das paredes" (⚙️ Configurações 3D), se cada selo deve
    // ficar escondido atrás de uma parede/porta/janela entre ele e a câmera.
    // Recriado do zero a cada setScene, igual `_itemAssocIndexScene` acima.
    this._itemBadgeGroups = [];
    // Modo "Sólido+wireframe para desempenho" (ver updateHybridQuality) —
    // repovoado do zero a cada setScene, só quando o modo está ativo (ver
    // _setupHybridMeshes no fim deste método); limpo aqui incondicionalmente
    // pra nunca sobrar referência de malha de uma cena JÁ descartada (ver
    // _disposeGroupContents logo abaixo) se o modo mudar depois.
    this._hybridMeshes = [];
    this._hybridRadius = null; // null = sem raio nenhum restringindo ainda (ver updateHybridQuality)
    // [correção 13/09/2026] `_doorRuntime`: Map (chave = `el.id` da porta)
    // guardando as referências/estado de animação de cada porta —
    // `leafMesh`/`manetaMesh` (THREE.Mesh/Group) e `pivotInfo`/
    // `anguloAtualAnim`/`manetaAnimDur`/`manetaAnimT`/`manetaLastTargetDeg`
    // (números/objeto simples). ANTES essas referências eram guardadas
    // direto na entidade persistida (`el._doorLeafMesh` etc.) — como `el` é
    // o MESMO objeto que vive em `mapData.portas` (só filtrado/copiado
    // rasamente por Mapping.filterByLayerVisibility/filterByPiso, nunca
    // clonado fundo), isso anexava um `THREE.Mesh`/`THREE.Group` de verdade
    // (com referências circulares e contexto WebGL) na entidade real do
    // mapa — na hora de salvar o mapa no IndexedDB (`DB.saveMap`, ex.: ao
    // excluir qualquer item, que dispara um save), o `structuredClone`
    // usado por baixo dos panos pelo IndexedDB falhava
    // (`DataCloneError`/"Falha ao salvar"), porque objetos do three.js não
    // são clonáveis dessa forma. Mesmo padrão já usado em outro lugar deste
    // arquivo pra malhas ligadas a uma entidade sem contaminar os dados
    // persistidos (ver `_dynamicLights`, indexado por
    // `luz.userData.ownerObjId` em vez de guardado na entidade) — aqui
    // usamos um Map em vez de array porque o acesso é sempre por id
    // específico (uma porta de cada vez), não uma varredura completa.
    // Recriado do zero a cada setScene, igual aos outros caches acima.
    this._doorRuntime = new Map();
    // [11/09/2026] NOVO — item 1 do pedido "parte do cone aparece na frente
    // da câmera" em "Ver através desta câmera": índice camId -> [malhas
    // caixa+cone] daquela câmera, repovoado do zero a cada setScene (mesmo
    // padrão de `_itemBadgeGroups`/`_hybridMeshes` acima) — usado por
    // `setCameraMeshVisible` (ver mais abaixo, chamada por
    // `_enterCameraOrbView`/`_exitCameraOrbView` em view3d.js) pra
    // esconder/mostrar a malha da PRÓPRIA câmera cujo ponto de vista está
    // sendo usado como a câmera de render — sem isto, o cone (que se
    // estende do centro da caixa PARA FORA, na direção de apontamento —
    // exatamente a direção onde o olho de render agora está posicionado)
    // acaba entre o near plane e o resto da cena, aparecendo como uma forma
    // indevida "na frente" de tudo.
    this._cameraMeshesById = {};
    // [13/09/2026] NOVO — índice camId -> refs de malhas/luz do modelo "PS1"
    // de câmera (ver bloco "câmeras" logo abaixo e `_updateCamerasLive`,
    // chamado por view3d.js `_updateScriptLifecycle` a cada quadro). Só
    // câmeras com `cam.modeloVisual==='ps1'` entram aqui — o modelo PADRÃO
    // (caixa+cone, sem mudança nenhuma nesta rodada) não usa este índice.
    // Repovoado do zero a cada setScene, mesmo padrão de `_cameraMeshesById`.
    this._camPs1RefsById = {};
    // [correção 13/09/2026] índice objId -> `THREE.Group` do carro (ver
    // `_buildCarroMesh` mais abaixo) — MESMO problema/MESMA correção da
    // porta (ver comentário grande logo acima, sobre `_doorRuntime`): antes
    // esse Group vivia direto em `obj._carroGroup3D` (a entidade real do
    // mapa), e travava o salvamento no IndexedDB com `DataCloneError`
    // assim que o carro era construído em cena (achado pelo usuário: erro
    // "onRotationChange... could not be cloned", causado pelo Euler de
    // rotação do próprio Group anexado à entidade). Repovoado do zero a
    // cada setScene, mesmo padrão de `_camPs1RefsById`.
    this._carroRefsById = {};
    // [15/09/2026] NOVO — lista de relógios de parede/mesa montados nesta
    // cena (ver `_buildRelogioMesh` mais abaixo e `_updateRelogiosParede`,
    // chamado por view3d.js a cada quadro, MESMO padrão de
    // `_camPs1RefsById`/`_updateCamerasLive` acima): cada entrada guarda os
    // 3 meshes-filho dos ponteiros (hora/minuto/segundo) pra girar a
    // `rotation.z` deles conforme `window.RelogioMundo.getHoraAtual()`,
    // sem precisar varrer `_group.children` procurando por tipo a cada
    // quadro. Repovoada do zero a cada `setScene`, mesmo motivo de sempre
    // (trocar de andar/reconstruir a cena descarta as malhas antigas).
    this._relogiosParede = [];
    // [14/09/2026] NOVO — `this._forcedHiddenMeshes` (ver
    // `setCameraMeshVisible`/`setFotoMeshVisible`/`_updateDistanceCulling`)
    // guarda REFERÊNCIAS às malhas antigas — sem limpar aqui, um `setScene`
    // (troca de andar, edição, saída do Modelador) deixaria o Set cheio de
    // malhas ÓRFÃS (já descartadas, nunca mais no `_group`) pra sempre,
    // crescendo sem limite. Quem ainda estiver "vendo através" de uma
    // câmera/orb quando este `setScene` rodar reconstrói o Set do zero (com
    // as malhas NOVAS) logo em seguida — ver view3d.js `_rebuildScene`.
    this._forcedHiddenMeshes = new Set();
    // [12/09/2026] NOVO — mesma ideia de `_cameraMeshesById` acima, agora
    // pro "orb de foto": índice fotoId -> [malhas esfera+cone(+placa)]
    // daquele orb, repovoado do zero a cada setScene. Usado por
    // `setFotoMeshVisible` (ver mais abaixo) pra esconder a malha do
    // PRÓPRIO orb de foto sendo visto através dele em `_enterFotoCameraView`
    // (view3d.js) — mesmo bug do cone "na frente da câmera" já corrigido
    // pro orb de câmera (`_cameraMeshesById`/`setCameraMeshVisible`).
    this._fotoMeshesById = {};
    // [10/09/2026] NOVO — índice fotoId -> [linha do retângulo, linhas dos
    // 4 cantos] do gizmo de "enquadramento" (retângulo amarelo, ver
    // `setCameraFrustumsVisible` acima) — MESMO padrão de índice de
    // `_fotoMeshesById`/`_cameraMeshesById`, repovoado do zero a cada
    // `setScene`. Visibilidade inicial de cada mesh já sai de
    // `this._frustumGizmosEnabled` (ver bloco "fotos vinculadas ao mapa"),
    // então trocar de andar/reabrir o mapa preserva o estado do botão "🟨".
    this._fotoFrustumMeshesById = {};
    // [15/09/2026] NOVO — pedido verbatim: "Ao acessar 'Propriedades da
    // câmera' e mudar os valores de largura e altura da resolução [...]
    // Ao vivo e imediatamente, devem ser aplicadas as alterações no
    // retângulo amarelo." Antes desta correção a geometria do retângulo
    // amarelo (linhaRet/linhasCantos, bloco "fotos vinculadas ao mapa"
    // abaixo) só era calculada UMA VEZ aqui em `setScene` — editar
    // FOV/Resolução em "Propriedades" enquanto already dentro de "Ver
    // através desta câmera" não recalculava a malha 3D de verdade (só o
    // retângulo/box da FOTO, em view3d.js, reagia — o oposto do pedido).
    // Este índice guarda origem+direção (fixas, só mudam se o orb for
    // movido — o que reconstrói a cena via `setScene` de qualquer jeito)
    // de cada frustum, pra `updateCameraFrustumGeometry` (abaixo) poder
    // recalcular só os 4 cantos a partir do `camProps` atual, sem precisar
    // de um `setScene` inteiro.
    this._fotoFrustumBasisById = {};
    if (!this._ready) { this._pendingScene = mapData; return; } // Three.js ainda carregando (1ª vez) — aplica assim que estiver pronto
    const THREE = this.THREE;
    // Raio X (ver setXRayTarget) — as malhas atravessadas (`_xrayMeshes`)
    // estão prestes a ser descartadas por `_disposeGroupContents` logo
    // abaixo; só ESQUECE a referência aqui (sem tentar restaurar o material
    // original — não faria sentido restaurar material numa malha que já vai
    // sumir) pra não segurar ponteiro de malha morta entre uma reconstrução
    // e outra. view3d.js chama setXRayTarget de novo já no próximo quadro
    // (_updateBuildGhost roda every frame), então o estado se autocorrige
    // sozinho sem precisar de nenhum aviso especial aqui.
    this._xrayObjId = null;
    this._xrayMeshes = [];
    this._disposeGroupContents(); // limpa a cena anterior (evita vazar geometria/textura de GPU a cada troca de modo/mapa)
    // Malhas testáveis pelo THREE.Raycaster no modo 'pixelperfect' (ver
    // hoverPick) — repovoada do zero a cada setScene, junto com this.pickables.
    this._pickMeshes = [];
    // NOVO (01/09/2026), item GRANDE #5 — objetos de TIPO com os dois níveis
    // (detalhado+lowpoly) customizados viram um THREE.LOD (ver
    // `_buildTypeMoldeMesh`); repovoada do zero a cada setScene, igual
    // `_pickMeshes` — `render()` percorre esta lista todo quadro chamando
    // `.update(camera3)` (é isso que troca o nível sozinho por distância).
    this._lodObjects = [];
    // Luzes de verdade das luminárias (ver _buildLuminariaMesh) — adicionadas
    // DIRETO em `this.scene` (não em `_group`, que só guarda malhas — ver
    // _disposeGroupContents), então precisam ser removidas/recriadas à parte
    // a cada setScene, senão cada reconstrução da cena (qualquer edição no
    // modo de construção) empilharia luzes repetidas por cima.
    (this._dynamicLights || []).forEach((l) => this.scene.remove(l));
    this._dynamicLights = [];
    // Pré-passo pro modo "leve" de luminárias (ver mapconfig.js
    // modoLuminarias3D/_tintForLight) — precisa da posição de TODAS as
    // luminárias ANTES de desenhar os outros objetos (pra saber quais caem
    // no alcance de cada uma), então roda antes do loop principal de
    // `mapData.objects` mais abaixo. Só calculado quando o modo está ativo
    // (senão fica um array vazio de graça).
    this._luzesLeves = [];
    if (this._config.modoLuminarias3D === 'leve') {
      (mapData.objects || []).forEach((o) => {
        if (o.tipo !== 'luminaria') return;
        this._luzesLeves.push({ x: o.x, y: (o.piso || 0) * (mapData.alturaPiso || 2.8) + (o.elevacao || 0), z: o.y });
      });
    }

    const wallH = 2.6;
    const colWall = 0x949aa8, colItem = 0x4f8cff, colWireframe = 0x78c8ff;
    const wireframe = this.mode === 'wireframe';

    // --- piso: um único plano com textura xadrez repetida (era uma grade de
    // centenas de quadrados desenhados manualmente — o WebGL faz isso melhor
    // com uma textura tileável) ---
    const b = mapData.bounds || { minX: -8, minY: -8, maxX: 8, maxY: 8 };
    const pad = 2, cell = 2;
    const largura = Math.max((b.maxX - b.minX) + pad * 2, cell * 2);
    const profundidade = Math.max((b.maxY - b.minY) + pad * 2, cell * 2);
    const centroX = (b.minX + b.maxX) / 2, centroZ = (b.minY + b.maxY) / 2;
    // O PLANO VISUAL do piso é maior que a área mapeada (`largura`/
    // `profundidade` acima, usadas só pro destaque de raycasting — ver
    // _floorInfo mais abaixo, que continua limitado à área real do mapa):
    // pedido do usuário pra o chão parecer infinito, sem borda visível,
    // ficando "clipado" só pelo alcance de render já existente (neblina —
    // scene.fog, far = configurável agora via "Distância de renderização" no
    // painel ⚙️ do 3D, ver mapconfig.js/_renderDistance() — e o plano de
    // corte distante da câmera, camera3.far, sempre ~2.4× a neblina, ver
    // setConfig/_initThree). Basta o plano físico ser maior que essas duas
    // distâncias em qualquer direção a partir de onde o jogador possa estar:
    // um vão FIXO (não precisa reagir à config — só custa mais espaço em
    // memória/tela, não mais triângulos, é um único quad de qualquer
    // tamanho), bem maior que 2× o maior far possível entre os presets de
    // distância (o preset mais longo, 150m, dá far=360m — o pior caso,
    // jogador numa ponta olhando pra fora), garante que a borda de verdade
    // do plano nunca fique visível em NENHUM preset — a neblina/o far-plane
    // escondem tudo antes dela.
    const FLOOR_RENDER_SPAN = 900;
    const floorLargura = Math.max(largura, FLOOR_RENDER_SPAN);
    const floorProfundidade = Math.max(profundidade, FLOOR_RENDER_SPAN);
    const floorGeo = new THREE.PlaneGeometry(floorLargura, floorProfundidade);
    let floorMat;
    if (wireframe) {
      floorMat = new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true });
    } else {
      const tex = this._floorTexture;
      tex.repeat.set(floorLargura / cell, floorProfundidade / cell);
      // Alinha a FASE do padrão quadriculado com a ORIGEM DO MUNDO (0,0) —
      // pedido do usuário (03/09/2026): "o ladrilho do chão do mundo deve
      // estar 'em fase' com o mapa 2D (os ladrilhos devem partir da
      // origem, ou seja, 0, 0)". ANTES a fase era ancorada em minX/maxZ (os
      // limites da área REALMENTE mapeada, ver comentário grande logo
      // abaixo em `_floorInfo` — resolvia hover-vs-textura coincidirem
      // entre si, mas os dois juntos ainda podiam ficar fora de fase com a
      // grade do mapa 2D, que sempre conta a partir de (0,0) do mundo (ver
      // Map2DRenderer.worldToScreen(0,0) como origem da grade, mapview.js)
      // — 2 pisos com plantas de tamanhos diferentes podiam mostrar
      // ladrilhos "deslizando" de um pro outro, e sem relação com a grade
      // do 2D. Agora ancorado direto em (0,0), fixo pra qualquer mapa —
      // hover/raycast (_floorInfo.phaseX/phaseZ abaixo) usa a MESMA âncora,
      // então continuam coincidindo entre si E com o mapa 2D. Eixo Z usa o
      // mesmo sinal do eixo X (mesmo motivo de sempre — o eixo V=0 do plano
      // mapeia pra +Z, fase invertida em relação a X — ver `_floorInfo`).
      const mod1 = (x) => ((x % 1) + 1) % 1;
      tex.offset.set(
        mod1((centroX - floorLargura / 2) / cell),
        mod1(-(centroZ + floorProfundidade / 2) / cell),
      );
      floorMat = new THREE.MeshLambertMaterial({ map: tex });
      // [13/09/2026] NOVO — ver comentário grande em
      // `setFotoCamBackdropMaskActive`/`_updateFloorMaskUniform` (mais
      // abaixo nesta classe) pro motivo completo: o chão precisa "sumir"
      // (virar cor-marcadora, pra máscara poder furar) só DENTRO do
      // retângulo da foto, nunca na tela inteira. `onBeforeCompile` injeta
      // um pedaço a mais no FRAGMENT shader padrão do Lambert: compara
      // `gl_FragCoord.xy` (posição do pixel NA TELA, origem embaixo-à-
      // esquerda — mesma convenção "crua" de `_computeFotoCamMaskRawRect`/
      // `_rtPixelBuffer`, sem precisar inverter nada aqui) contra o
      // retângulo (`uFotoCamMaskRect`, atualizado todo quadro por
      // `_updateFloorMaskUniform` — ANTES do render, senão o shader
      // desenharia com o retângulo do quadro ANTERIOR); só dentro dele,
      // com a máscara ativa (`uFotoCamMaskAtiva`), substitui a cor final
      // pela cor-marcadora EXATA (`uFotoCamMaskCor`) — fora do retângulo,
      // ou com a máscara desligada, o chão pinta normalmente, sem nenhuma
      // mudança. Guardado em `material.userData.fotoCamMaskShader` (Three.js
      // pode recompilar o shader — troca de nº de luzes, p.ex — cada
      // recompilação chama este callback de novo com um objeto NOVO;
      // guardar aqui garante que `_updateFloorMaskUniform` sempre acha a
      // referência mais recente).
      floorMat.onBeforeCompile = (shader) => {
        shader.uniforms.uFotoCamMaskAtiva = { value: 0 };
        shader.uniforms.uFotoCamMaskRect = { value: new THREE.Vector4(0, 0, 0, 0) };
        shader.uniforms.uFotoCamMaskCor = { value: new THREE.Vector3(1, 0, 1) };
        shader.fragmentShader = `uniform float uFotoCamMaskAtiva;\nuniform vec4 uFotoCamMaskRect;\nuniform vec3 uFotoCamMaskCor;\n${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          if (uFotoCamMaskAtiva > 0.5) {
            vec2 fc = gl_FragCoord.xy;
            if (fc.x >= uFotoCamMaskRect.x && fc.x < (uFotoCamMaskRect.x + uFotoCamMaskRect.z)
                && fc.y >= uFotoCamMaskRect.y && fc.y < (uFotoCamMaskRect.y + uFotoCamMaskRect.w)) {
              gl_FragColor = vec4(uFotoCamMaskCor, 1.0);
            }
          }`,
        );
        floorMat.userData.fotoCamMaskShader = shader;
      };
      // Força o material a "precisar" recompilar (garante que
      // `onBeforeCompile` acima roda pelo menos 1x, mesmo que o Three.js
      // decida reaproveitar um programa de shader já compilado antes).
      floorMat.needsUpdate = true;
    }
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(centroX, 0, centroZ);
    // [13/09/2026 — ITEM B] `depthWrite:false`+`renderOrder:-2000` foram
    // adicionados aqui EXCLUSIVAMENTE por causa do plano 3D do backdrop
    // 'Trás' (view3d.js `_ensureFotoCamBackdropPlane`, transparente,
    // `depthTest:true`) — sem isso, o chão (opaco, cobrindo quase toda a
    // tela) preenchia o z-buffer e bloqueava o backdrop na maior parte do
    // quadro. [19/09/2026] REVERTIDO — o plano 3D do backdrop foi removido
    // (arquitetura simplificada pra desenho 2D em canvas), então o chão
    // tinha voltado ao comportamento padrão do Three.js.
    // [22/09/2026 — RODADA SEGUINTE] REAPLICADO — pedido verbatim do
    // usuário: "Volte a colocar a imagem lá no fundo, pois os objetos que
    // deveriam estar à frente da imagem não estão" — o plano 3D do
    // backdrop 'Trás' foi RESTAURADO (ver view3d.js
    // `_ensureFotoCamBackdropPlane`/`_updateFotoCamBackdropPlane`), então a
    // mesma razão de 13/09/2026 volta a valer: sem isto, o chão (opaco,
    // cobrindo quase toda a tela) escreve no z-buffer e bloqueia o plano
    // transparente da foto ('Trás') na maior parte do quadro, mesmo sem
    // nenhum objeto de verdade na frente. `depthTest` continua `true` (o
    // chão continua sendo ocluído normalmente por qualquer objeto real na
    // frente dele) — só `depthWrite` muda, então o chão nunca mais IMPEDE
    // outra coisa (a foto) de aparecer atrás dele, mas continua aparecendo
    // normalmente atrás de paredes/objetos reais.
    floor.material.depthWrite = false;
    floor.renderOrder = -2000;
    // [13/09/2026] NOVO — pedido verbatim: "Confirmado, não precisa
    // aparecer mais o chão quando está marcado 'Trás'." Guarda a
    // referência pra `_updateFloorMaskUniform` (ver `onBeforeCompile` do
    // material, acima, e comentário grande em `setFotoCamBackdropMaskActive`)
    // achar o shader dele todo quadro.
    this._floorMesh = floor;
    this._group.add(floor);
    floor.userData.pick = { type: 'floor' };
    this._pickMeshes.push(floor);
    // Modo wireframe: o `floor` acima usa `floorGeo` = PlaneGeometry SEM
    // subdivisão (1x1 segmento, só 2 triângulos) — de propósito, é o quad
    // gigante (FLOOR_RENDER_SPAN, ~900m) que dá a ilusão de chão "infinito"
    // (comentário acima). Só que "wireframe:true" nesse quad só desenha as
    // 4 bordas DELE (a 900m, escondidas pela neblina/far-plane) — nenhum
    // quadrado de 1m aparecia (bug relatado: "os quadrados no chão devem
    // ter o padrão de 1m x 1m para TODO o chão", e em wireframe não tinha
    // padrão nenhum). Nos modos sólido/colorido o padrão de 1m vem da
    // TEXTURA xadrez (_buildCheckerTexture), que wireframe não usa (só
    // linhas da malha, sem material com textura). Corrigida com uma SEGUNDA
    // malha, só em wireframe, sobreposta ao `floor` na mesma posição — mas
    // de LINHAS (THREE.LineSegments), não uma malha de triângulos.
    //
    // Duas rodadas de bug reportadas pelo usuário sobre esta malha:
    //  1) "os quadrados no chão no modo sólido devem corresponder aos do
    //     wireframe": a versão anterior usava PlaneGeometry(largura,
    //     profundidade, Math.round(largura), Math.round(profundidade)) —
    //     ARREDONDAR o número de segmentos pra um inteiro faz cada célula
    //     medir `largura/Math.round(largura)` metros, quase nunca 1m exato,
    //     E ancorada no CENTRO do plano (`centroX`/`centroZ`), não na mesma
    //     fase de `_floorInfo.minX`/`maxZ` que a textura xadrez do sólido já
    //     usa (ver comentário grande logo abaixo) — as duas grades ficavam
    //     quase, mas não exatamente, sobrepostas. Trocado por linhas
    //     desenhadas nó a nó, começando EXATAMENTE na mesma fase de
    //     `_floorInfo` (minX no eixo X, maxZ no eixo Z — mesma inversão de
    //     eixo documentada abaixo), com 1m cravado (`tile`), não aproximado.
    //  2) "no wireframe só está desenhando os wires onde tem luminárias... o
    //     desenho deve ser limitado pela distância de renderização, não por
    //     ter ou não luminária num lugar": a malha anterior cobria só
    //     `largura`×`profundidade` (a área REAL do mapa — onde tem
    //     parede/objeto/item, ver mapData.bounds), bem menor que o chão
    //     "infinito" do modo sólido (o quad de 900m, sempre do MESMO
    //     tamanho não importa o mapa — dá a impressão de wireframe "sumindo"
    //     longe de onde as coisas estão, ficando só perto delas — inclusive
    //     luminárias, se for isso que o mapa do usuário tinha por perto).
    //     PlaneGeometry(900,900) subdividida em 1m viraria ~1.6 MILHÃO de
    //     triângulos (era exatamente o motivo de ANTES limitar a área) —
    //     mas LineSegments não tem essa explosão quadrática: são só as
    //     LINHAS mesmo, ~900+900 delas pro mesmo alcance de 900m, poucos
    //     milhares de vértices, muito mais barato que a malha antiga JÁ era
    //     (que triangulava a área toda só pra desenhar as bordas). Mesmo
    //     alcance do chão sólido (`floorLargura`/`floorProfundidade`) —
    //     "limitado pela distância de renderização" já acontece sozinho,
    //     igual ao sólido: os dois usam a MESMA neblina (scene.fog, ver
    //     _initThree) que desvanece qualquer MeshBasicMaterial com
    //     `fog:true` (padrão) a partir de `_fogNear(rd)` até `rd` metros —
    //     nenhuma malha precisa saber a distância de renderização sozinha.
    if (wireframe) {
      const tile = cell / 2; // 1m — MESMO tileSize de _floorInfo abaixo (ver comentário lá: o quadrado visível é cell/2, não cell)
      const anchorX = 0; // mesma fase de _floorInfo.phaseX (origem do mundo, 03/09/2026 — ver comentário grande acima em tex.offset)
      const anchorZ = 0; // mesma fase de _floorInfo.phaseZ (idem, eixo Z)
      const gMinX = centroX - floorLargura / 2, gMaxX = centroX + floorLargura / 2;
      const gMinZ = centroZ - floorProfundidade / 2, gMaxZ = centroZ + floorProfundidade / 2;
      const pts = [];
      const firstX = anchorX + Math.ceil((gMinX - anchorX) / tile) * tile;
      for (let x = firstX; x <= gMaxX + 1e-6; x += tile) pts.push(new THREE.Vector3(x, 0, gMinZ), new THREE.Vector3(x, 0, gMaxZ));
      const firstZ = anchorZ + Math.ceil((gMinZ - anchorZ) / tile) * tile;
      for (let z = firstZ; z <= gMaxZ + 1e-6; z += tile) pts.push(new THREE.Vector3(gMinX, 0, z), new THREE.Vector3(gMaxX, 0, z));
      const gridGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const gridMat = new THREE.LineBasicMaterial({ color: colWireframe });
      // [11/09/2026] `gridMat.depthWrite = false`/`floorGrid.renderOrder =
      // -2000` tinham sido adicionados aqui pelo MESMO motivo do `floor`
      // sólido acima (não bloquear o plano 3D do backdrop 'Trás').
      // [19/09/2026] REVERTIDO junto — plano removido naquela rodada.
      // [22/09/2026 — RODADA SEGUINTE] REAPLICADO junto com o `floor`
      // sólido acima — o plano 3D do backdrop 'Trás' foi RESTAURADO, mesma
      // razão de sempre (não bloquear o plano transparente da foto).
      gridMat.depthWrite = false;
      // Pequeno deslocamento em Y evita "z-fighting" com o `floor` de baixo
      // (tremedeira de duas malhas coplanares disputando o mesmo pixel) —
      // pontos já em coordenadas de MUNDO (não locais), então a malha em si
      // fica na origem, só a altura Y é ajustada aqui.
      const floorGrid = new THREE.LineSegments(gridGeo, gridMat);
      floorGrid.position.set(0, 0.002, 0);
      floorGrid.renderOrder = -2000;
      this._group.add(floorGrid);
    }
    // Guardado pro destaque de raycasting no chão (hoverPick) — precisa saber
    // o tamanho do LADRILHO VISUAL e os limites reais do piso desenhado pra
    // saber ATÉ ONDE o destaque pode aparecer (fora disso, "chão" nem existe).
    //
    // IMPORTANTE: o ladrilho que a pessoa VÊ não é do tamanho de `cell`
    // (2m) — a textura xadrez (_buildCheckerTexture) já tem um sub-padrão
    // 2×2 DENTRO de cada repetição de `cell` metros (dois quadrados claros
    // e dois escuros num canvas de 64×64px, repetido a cada `cell` metros
    // via tex.repeat), então o quadrado realmente visível mede `cell/2`
    // (1m). Usar `cell` aqui destacava 4 ladrilhos de uma vez (o bug
    // relatado). Além disso, o eixo Z tem a fase INVERTIDA em relação ao
    // X: a rotação `floor.rotation.x = -Math.PI/2` mapeia o Y local do
    // plano (onde a UV V=0 começa) para Z = centroZ + profundidade/2 =
    // maxZ, não minZ (o X local não sofre esse espelhamento — U=0 cai
    // exatamente em minX). Por isso a grade de ladrilhos conta a partir de
    // minX no eixo X, mas a partir de maxZ (pra baixo) no eixo Z — ver o
    // uso de `tileSize`/`minX`/`maxZ` em hoverPick().
    // `phaseX`/`phaseZ` (03/09/2026): âncora de FASE da grade de ladrilhos,
    // separada dos limites `minX`/`maxX`/`minZ`/`maxZ` acima (que continuam
    // sendo só a ÁREA onde o destaque de raycast pode aparecer — o chão
    // "de verdade", mapeado). Fixada na ORIGEM DO MUNDO (0,0), igual à
    // textura (ver tex.offset em setScene, comentário grande lá) e à grade
    // do mapa 2D (Map2DRenderer.worldToScreen(0,0), mapview.js) — pedido do
    // usuário: "os ladrilhos devem partir da origem, ou seja, 0, 0".
    // `floorMinX`/`floorMaxX`/`floorMinZ`/`floorMaxZ` (03/09/2026) — bug
    // relatado: "ao se afastar bastante de onde tem objetos, o raycasting
    // pra dar destaque no ladrilho do chão acaba por não funcionar mais."
    // Causa: `hoverPick()` (modo padrão 'hitbox', não-pixelperfect) só
    // aceitava o hit do chão dentro de `minX`/`maxX`/`minZ`/`maxZ` — os
    // limites da área REALMENTE mapeada (walls/objetos/itens, com uma
    // margem `pad` pequena) — mas o PLANO VISUAL do chão é bem maior
    // (`floorLargura`/`floorProfundidade`, ~900m, pensado de propósito pra
    // parecer "infinito", ver comentário grande acima sobre
    // FLOOR_RENDER_SPAN): andando bem longe da área mapeada, o jogador
    // ainda VÊ o chão quadriculado (ele nunca acaba visualmente), mas o
    // destaque parava de aparecer assim que saía dos limites mapeados,
    // bem menores. Guardado aqui pra `hoverPick()` testar contra o alcance
    // VISUAL de verdade, não o mapeado.
    this._floorInfo = {
      tileSize: cell / 2,
      minX: centroX - largura / 2, maxX: centroX + largura / 2, minZ: centroZ - profundidade / 2, maxZ: centroZ + profundidade / 2,
      floorMinX: centroX - floorLargura / 2, floorMaxX: centroX + floorLargura / 2, floorMinZ: centroZ - floorProfundidade / 2, floorMaxZ: centroZ + floorProfundidade / 2,
      phaseX: 0, phaseZ: 0,
    };

    // --- paredes: UMA caixa extrudada por parede, do início ao fim dela.
    // O motor anterior precisava cortar cada parede em pedaços de ~1m só
    // para o algoritmo do pintor (sem z-buffer) ordenar a profundidade
    // certo — o WebGL testa profundidade por pixel de verdade (z-buffer),
    // então essa divisão artificial deixou de ser necessária. ---
    const wallThickness = WALL_THICKNESS_3D;
    // Porta/janela ABERTA vira um BURACO real na parede em 3D; FECHADA fica
    // só uma placa colorida encostada na parede, sem cortar nada (pedido do
    // usuário: "se estiverem fechadas, não fica o buraco. Se estiverem
    // abertas, fica o buraco na parede"). Sem lib de CSG/boolean (não
    // vendorizada neste projeto — só three.module.js puro), o "buraco" é
    // construído por SEGMENTAÇÃO: a parede vira várias caixas menores (uma
    // de cada lado do vão, mais uma verga/vergalhão acima e, se a base do
    // vão não começa no chão — ex. peitoril de janela —, um peitoril abaixo)
    // em vez de UMA caixa só — geometricamente equivalente a um buraco de
    // verdade, sem precisar de boolean 3D. Portas/janelas SOLTAS ("no ar" —
    // sem `parentWallId`) não cortam nada (não há parede-mãe) — ver o loop
    // de portas/janelas logo abaixo desta função, que desenha a malha delas
    // à parte (presa OU solta, aberta OU fechada).
    const DOOR_TYPES3D = window.DOOR_TYPES || {};
    const WINDOW_TYPES3D = window.WINDOW_TYPES || {};
    const colorFromHex = (hex, fallback) => {
      const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
      return m ? parseInt(m[1], 16) : fallback;
    };
    /** Uma caixa de parede (usada tanto pro corpo inteiro quanto por cada
     *  segmento/verga/peitoril de uma parede com vão aberto) — `t0`/`t1` em
     *  METROS ao longo da parede (a partir de x1,y1), `y0`/`y1` em altura. */
    const addWallBox = (w, t0, t1, y0, y1, dx, dz, len) => {
      const segLen = t1 - t0;
      const segH = y1 - y0;
      if (segLen <= 1e-4 || segH <= 1e-4) return;
      const ux = dx / len, uz = dz / len;
      const midT = (t0 + t1) / 2;
      const geo = new THREE.BoxGeometry(wallThickness, segH, segLen);
      let mat;
      if (wireframe) {
        mat = new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true });
      } else {
        const cor = (this.mode === 'colorido' && w.colorRGB)
          ? new THREE.Color(w.colorRGB[0] / 255, w.colorRGB[1] / 255, w.colorRGB[2] / 255)
          : new THREE.Color(colWall);
        mat = new THREE.MeshLambertMaterial({ color: cor });
      }
      const mesh = new THREE.Mesh(geo, mat);
      const cx = w.x1 + ux * midT, cz = w.y1 + uz * midT;
      const wRotY = Math.atan2(dx, dz);
      // NOVO (01/09/2026), item GRANDE #9 — "andares de verdade": cada
      // parede empilha na altura do seu próprio piso (mesmo `piso*2.8` que
      // objetos/câmeras já usavam, ver `baseY` em `_buildOneObjectMesh`)
      // — ver comentário grande em Mapping.addWall (js/mapping.js).
      const pisoY = (w.piso || 0) * (mapData.alturaPiso || 2.8);
      mesh.position.set(cx, pisoY + y0 + segH / 2, cz);
      mesh.rotation.y = wRotY;
      this._group.add(mesh);
      const wHalf = { x: wallThickness / 2, y: segH / 2, z: segLen / 2 };
      mesh.userData.pick = { type: 'wall', ref: w, center: { x: cx, y: pisoY + y0 + segH / 2, z: cz }, rotY: wRotY, half: wHalf, obb: { half: wHalf, rotY: wRotY } };
      this._pickMeshes.push(mesh);
    };
    (mapData.walls || []).forEach((w) => {
      const h = w.height || wallH;
      const dx = w.x2 - w.x1, dz = w.y2 - w.y1;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) return;
      // Vãos desta parede (porta/janela filha dela) — cada um vira um
      // intervalo [t0,t1]×[y0,y1] recortado da caixa da parede.
      //
      // 24/08/2026 — bug relatado pelo usuário: "a porta e a janela são
      // colocadas naquela posição, porém, no 3D, elas não estão aparecendo".
      // ANTES este filtro exigia `&& d.aberta` (só recortava a parede pra
      // porta/janela ABERTA) — FECHADA (o estado padrão de toda porta/janela
      // recém-criada, ver Mapping.addDoor/addWindow: `aberta:false`) não
      // recortava nada, a parede ficava uma caixa MACIÇA e INTEIRA por cima
      // da posição. A malha da folha/vidro (buildDoorOrWindowMesh, mais
      // abaixo) é mais FINA que a parede (`espMesh = wallThickness*0.3|0.85`
      // < `wallThickness` inteiro) e fica centrada exatamente no MEIO da
      // espessura da parede — ou seja, ficava 100% ENGOLIDA dentro do volume
      // opaco da caixa da parede, sem nenhum pixel dela pra fora dos dois
      // lados: literalmente invisível, por mais que a porta/janela existisse
      // certinho nos dados do mapa (por isso "são colocadas... porém não
      // aparecem" — o bug é só visual/geometria, os dados sempre estiveram
      // certos). Recortar o vão SEMPRE (aberta ou fechada) resolve: agora a
      // parede sempre tem um buraco do tamanho da porta/janela, e a malha
      // dela (fechada = placa ocupando o vão inteiro; aberta = placa fina
      // encostada na lateral, ver comentário grande abaixo) fica exposta,
      // visível dos dois lados — sem sobra: continua indistinguível de uma
      // parede maciça de longe, já que o vão fica preenchido pela própria
      // porta/janela. A COLISÃO (view3d.js, "MESMA colisão de parede/vão de
      // porta aberta") continua checando `d.aberta` por conta própria — ali
      // sim precisa continuar tratando fechada como sólida (não é possível
      // atravessar uma porta fechada) — só o CORTE VISUAL da parede aqui não
      // depende mais disso.
      const openings = [
        ...(mapData.portas || []).filter((d) => d.parentWallId === w.id).map((d) => ({
          t0: Utils.clamp((d.posAoLongoDaParede || 0) - (d.largura || 0.8) / 2, 0, len),
          t1: Utils.clamp((d.posAoLongoDaParede || 0) + (d.largura || 0.8) / 2, 0, len),
          y0: 0, y1: Math.min(h, d.altura || 2.1),
        })),
        ...(mapData.janelas || []).filter((j) => j.parentWallId === w.id).map((j) => ({
          t0: Utils.clamp((j.posAoLongoDaParede || 0) - (j.largura || 1.2) / 2, 0, len),
          t1: Utils.clamp((j.posAoLongoDaParede || 0) + (j.largura || 1.2) / 2, 0, len),
          y0: Math.min(h, j.alturaPeitoril || 0), y1: Math.min(h, (j.alturaPeitoril || 0) + (j.altura || 1.2)),
        })),
      ].filter((o) => o.t1 - o.t0 > 1e-3).sort((a, b) => a.t0 - b.t0);
      if (!openings.length) {
        // Caminho de sempre — SEM nenhum vão aberto nesta parede, uma caixa só (idêntico ao comportamento anterior).
        addWallBox(w, 0, len, 0, h, dx, dz, len);
        return;
      }
      let cursorT = 0;
      openings.forEach((o) => {
        if (o.t0 > cursorT) addWallBox(w, cursorT, o.t0, 0, h, dx, dz, len); // trecho sólido ANTES do vão
        if (o.y0 > 0) addWallBox(w, o.t0, o.t1, 0, o.y0, dx, dz, len); // peitoril (abaixo do vão)
        if (o.y1 < h) addWallBox(w, o.t0, o.t1, o.y1, h, dx, dz, len); // verga (acima do vão)
        cursorT = Math.max(cursorT, o.t1);
      });
      if (cursorT < len) addWallBox(w, cursorT, len, 0, h, dx, dz, len); // trecho sólido DEPOIS do último vão
    });

    // --- Junção das quinas ("🧱 Parede" › "Estilo de junção das quinas",
    // pedido do usuário — ver o comentário grande/equacionamento completo
    // junto de _detectWallCorners/_buildCornerFillMesh, mais abaixo neste
    // arquivo). 'atual' (padrão) não desenha NADA aqui — comportamento
    // idêntico a antes desta rodada. As "capas" são só ADICIONADAS por cima
    // das caixas retas de sempre, nunca as substituem. ---
    const wallJoinType = this._config?.paredeJuncaoTipo || 'atual';
    if (wallJoinType !== 'atual' && (mapData.walls || []).length >= 2) {
      const corners = this._detectWallCorners(mapData.walls);
      if (corners.length) {
        const capMat = wireframe
          ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true, side: THREE.DoubleSide })
          : new THREE.MeshLambertMaterial({ color: new THREE.Color(colWall), side: THREE.DoubleSide });
        corners.forEach((corner) => {
          const capMesh = this._buildCornerFillMesh(THREE, corner, wallJoinType, capMat, wallH);
          if (capMesh) this._group.add(capMesh);
        });
      }
    }

    // --- porta/janela: malha própria, presa (segue a posição/ângulo da
    // parede-mãe, calculados por Mapping.resolveDoorWindowPos) OU solta ("no
    // ar" — só desenhada na posição/altura próprias, sem parede nenhuma pra
    // se apoiar). FECHADA (padrão) é sempre desenhada — uma placa na cor do
    // tipo (DOOR_TYPES/WINDOW_TYPES, MESMA tabela usada no 2D — cores
    // correspondentes 2D/3D, pedido original do usuário) encostada na
    // parede; ABERTA também é desenhada (senão o vão ficaria vazio sem
    // nenhuma pista visual de que uma porta/janela existe ali), só que fina
    // e encostada na LATERAL do vão (like uma porta/veneziana empurrada pra
    // dentro da parede), não tampando o buraco cortado acima. ---
    // Anel fino (4 barras — cima/baixo/esquerda/direita) formando uma
    // "moldura de quadro" ao redor de um retângulo w×h — usado tanto pela
    // moldura genérica de qualquer janela (logo abaixo) quanto pela
    // armadura/folhas da janela de correr detalhada (buildJanelaCorrer2Folhas,
    // mais abaixo) — devolve peças em coordenadas LOCAIS (lx/lz giram junto
    // com a rotação do elemento; ly só soma direto na altura), não posições
    // de mundo já prontas — quem chama aplica a rotação/posição de verdade
    // (mesma técnica de _buildMesaMesh, ver comentário lá: local->mundo via
    // cos/sin da rotação em Y).
    // Versão com borda DIFERENTE entre cima/baixo (`borderTB`) e os dois
    // lados (`borderLR`) — pedido do usuário (rodada seguinte, armadura
    // interna da janela de correr): "em cima e em baixo, 4cm; e nas
    // laterais 1,5cm". `buildFrameRingParts` (logo abaixo) é só o caso
    // particular onde as quatro bordas são iguais.
    const buildFrameRingPartsTB_LR = (w, h, depth, borderTB, borderLR, mat) => {
      const meioH = Math.max(0.001, h - borderTB * 2);
      return [
        { mesh: new THREE.Mesh(new THREE.BoxGeometry(w, borderTB, depth), mat), lx: 0, ly: h / 2 - borderTB / 2, lz: 0 }, // barra de cima
        { mesh: new THREE.Mesh(new THREE.BoxGeometry(w, borderTB, depth), mat), lx: 0, ly: -(h / 2 - borderTB / 2), lz: 0 }, // barra de baixo
        { mesh: new THREE.Mesh(new THREE.BoxGeometry(borderLR, meioH, depth), mat), lx: -(w / 2 - borderLR / 2), ly: 0, lz: 0 }, // barra da esquerda
        { mesh: new THREE.Mesh(new THREE.BoxGeometry(borderLR, meioH, depth), mat), lx: (w / 2 - borderLR / 2), ly: 0, lz: 0 }, // barra da direita
      ];
    };
    const buildFrameRingParts = (w, h, depth, borderT, mat) => buildFrameRingPartsTB_LR(w, h, depth, borderT, borderT, mat);

    /** Janela de correr, 2 folhas — pedido do usuário (24/08/2026): "deve
     *  haver mais um tipo de janela", com medidas de CATÁLOGO reais (não são
     *  um "padrão sugerido" livre — o painel de propriedades, mapview.js
     *  _openWindowPanel, já preenche largura/altura/peitoril com estes MESMOS
     *  valores ao escolher `tipo: 'correr_2folhas'`, mas o desenho 3D usa as
     *  constantes fixas abaixo direto, não os campos largura/altura do
     *  elemento — pra o formato da armadura/folhas nunca ficar torto se
     *  alguém editar largura/altura na mão depois de escolher este tipo):
     *   - Armadura (moldura externa, com 2 trilhos p/ 2 folhas): limite de
     *     204,5×108cm, "espessura" (perfil de alumínio) de 0,8mm, profundidade
     *     (o quanto ocupa da parede) de 8,5cm.
     *   - Cada folha (o caixilho que desliza, com o vidro): 112×97cm, com
     *     4cm de borda de metal (feito uma moldura de quadro, por DENTRO
     *     desses 112×97 — vidro visível de 104×89cm), profundidade de 3cm.
     *   - As DUAS folhas ficam cada uma no seu trilho da MESMA armadura —
     *     como a armadura (204,5cm) é bem mais larga que UMA folha (112cm),
     *     as duas se sobrepõem no meio (2×112−204,5 = 19,5cm) — representadas
     *     aqui na posição "fechada" (uma encostada em cada lateral da
     *     armadura, se encontrando no meio), cada uma no seu Z (profundidade)
     *     pra não conflitar com a outra (dois trilhos de verdade, um um
     *     pouco mais pra fora que o outro). Sem animação de abrir puxando
     *     uma folha por cima da outra (fora do escopo pedido — a caixa
     *     "Aberta (3D)" do painel continua só controlando o buraco cortado
     *     na parede, ver `openings` acima, igual pros outros tipos).
     *  O vidro de cada folha usa o MESMO tratamento "Minecraft" (pedido do
     *  usuário: "todo vidro no projeto deve ser representado como no
     *  Minecraft") de qualquer outra janela — ver _buildGlassPane; só a
     *  moldura de metal (armadura + armadura interna + folhas) é geometria
     *  de verdade.
     *
     *  Rodada seguinte (pedido do usuário) — acrescentada uma SEGUNDA
     *  armadura, mais interna (198,5×108cm... 198,5×101cm — dentro da
     *  primeira, 204,5×108cm), profundidade também de 8,5cm, que é onde as
     *  folhas correm de verdade (a armadura externa, de 0,8mm, é só o
     *  acabamento/moldura da parede em volta):
     *   - Moldura de quadro DESIGUAL: 4cm em cima e embaixo, 1,5cm nas
     *     laterais (medidos pra DENTRO dos 198,5×101cm).
     *   - A barra de CIMA é maciça, extrudada ponta a ponta dos 8,5cm de
     *     profundidade (igual a qualquer barra "normal" deste arquivo).
     *   - A barra de BAIXO é OCA — "como no metrô de um trem": em vez de
     *     uma caixa maciça, dois trilhos finos (um pra cada folha/trilho de
     *     profundidade, ver `folhaZ` abaixo), com vão entre eles — é ali que
     *     as folhas se encaixam pra deslizar.
     *   - As duas armaduras (externa e interna) não podem "ficar voando"
     *     desconectadas — uma TERCEIRA peça, um anel bem mais FINO na
     *     profundidade (`CONECTOR_D`, bem menor que 8,5cm — "uma extrusão
     *     mais fina"), preenche exatamente o vão entre elas (a mesma conta
     *     de moldura-de-quadro, com bordas TB/LR = a metade da diferença
     *     entre os dois tamanhos de armadura), soldando as duas numa peça só. */
    const buildJanelaCorrer2Folhas = (el) => {
      const pos = (typeof Mapping !== 'undefined') ? Mapping.resolveDoorWindowPos(mapData, el) : { x: el.x, y: el.y, angulo: el.angulo || 0 };
      const FRAME_W = 2.045, FRAME_H = 1.08, FRAME_D = 0.085, FRAME_T = 0.0008;
      const ARM2_W = 1.985, ARM2_H = 1.01, ARM2_D = 0.085; // armadura interna — mesma profundidade da externa (correm as folhas nela)
      const ARM2_BORDA_TB = 0.04, ARM2_BORDA_LR = 0.015; // 4cm cima/baixo, 1,5cm laterais
      const CONECTOR_D = 0.02; // "extrusão mais fina" — só uma solda visual entre as duas armaduras, não estrutural de verdade
      const FOLHA_W = 1.12, FOLHA_H = 0.97, FOLHA_D = 0.03, FOLHA_BORDA = 0.04;
      // 92cm (pedido do usuário) — MESMO valor que o painel já preenche em
      // `alturaPeitoril` ao escolher este tipo; `!= null` (não `||`) porque
      // 0 é um peitoril válido (janela batendo no chão), não "sem valor".
      const baseY = el.alturaPeitoril != null ? el.alturaPeitoril : 0.92;
      const corMoldura = colorFromHex(WINDOW_TYPES3D[el.tipo]?.frameColor, 0xc7ccd4);
      const matMetal = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: corMoldura });
      const partsLocal = [];
      partsLocal.push(...buildFrameRingParts(FRAME_W, FRAME_H, FRAME_D, FRAME_T, matMetal)); // armadura EXTERNA — um anel só, ao redor do vão inteiro

      // Conector — preenche exatamente o vão entre a armadura externa
      // (204,5×108) e a interna (198,5×101): as bordas TB/LR abaixo são a
      // metade da diferença entre os dois tamanhos, então o anel resultante
      // encosta nas duas ao mesmo tempo, sem sobra nem vão — ver conta no
      // comentário grande acima. `CONECTOR_D` bem menor que 8,5cm ("extrusão
      // mais fina", pedido do usuário) — centrado na mesma profundidade das
      // armaduras (lz=0 em todas), só mais fino.
      const conectorBordaTB = (FRAME_H - ARM2_H) / 2, conectorBordaLR = (FRAME_W - ARM2_W) / 2;
      partsLocal.push(...buildFrameRingPartsTB_LR(FRAME_W, FRAME_H, CONECTOR_D, conectorBordaTB, conectorBordaLR, matMetal));

      // Armadura INTERNA — cima e laterais maciças (parte de cima "ponta a
      // ponta da profundidade", pedido do usuário); base tratada à parte
      // logo abaixo (oca, os trilhos).
      const meioArm2H = Math.max(0.001, ARM2_H - ARM2_BORDA_TB * 2);
      partsLocal.push({ mesh: new THREE.Mesh(new THREE.BoxGeometry(ARM2_W, ARM2_BORDA_TB, ARM2_D), matMetal), lx: 0, ly: ARM2_H / 2 - ARM2_BORDA_TB / 2, lz: 0 }); // barra de cima — maciça
      partsLocal.push({ mesh: new THREE.Mesh(new THREE.BoxGeometry(ARM2_BORDA_LR, meioArm2H, ARM2_D), matMetal), lx: -(ARM2_W / 2 - ARM2_BORDA_LR / 2), ly: 0, lz: 0 }); // lateral esquerda
      partsLocal.push({ mesh: new THREE.Mesh(new THREE.BoxGeometry(ARM2_BORDA_LR, meioArm2H, ARM2_D), matMetal), lx: (ARM2_W / 2 - ARM2_BORDA_LR / 2), ly: 0, lz: 0 }); // lateral direita

      // Deslocamento lateral de cada folha (ver conta no comentário grande
      // acima) — encostada na lateral da armadura INTERNA do seu lado (é
      // nela que as folhas correm — "é onde as duas folhas de janela
      // correm", pedido do usuário — não mais na externa). `folhaZ` deixa
      // uma folha um pouco mais pra fora e a outra um pouco mais pra dentro
      // (dois trilhos de verdade), sem furar pra fora da profundidade da
      // armadura (ARM2_D/2 = 4,25cm é bem maior que FOLHA_D/2+0,005 = 2cm).
      const folhaOffsetX = ARM2_W / 2 - FOLHA_W / 2;
      const folhaZ = FOLHA_D / 2 + 0.005;
      // Base da armadura interna — OCA ("como no metrô de um trem"): em vez
      // da barra maciça de baixo (que a armadura externa e o topo desta
      // interna têm), DOIS trilhos finos, um bem no MESMO Z de cada folha
      // (`folhaZ` acima) — é literalmente ali que a base de cada folha se
      // encaixa pra deslizar, com vão (oco) entre os dois trilhos e entre
      // eles e as bordas da profundidade (ARM2_D), em vez de uma caixa só.
      const trilhoAltura = 0.01, trilhoProfundidade = 0.012;
      const baseLy = -(ARM2_H / 2 - ARM2_BORDA_TB / 2); // mesma altura em que ficaria a barra de baixo, se fosse maciça
      [-1, 1].forEach((lado) => {
        partsLocal.push({ mesh: new THREE.Mesh(new THREE.BoxGeometry(ARM2_W, trilhoAltura, trilhoProfundidade), matMetal), lx: 0, ly: baseLy, lz: lado * folhaZ });
      });

      [-1, 1].forEach((lado) => {
        partsLocal.push(...buildFrameRingParts(FOLHA_W, FOLHA_H, FOLHA_D, FOLHA_BORDA, matMetal)
          .map((p) => ({ ...p, lx: p.lx + lado * folhaOffsetX, lz: p.lz + lado * folhaZ })));
        const glassW = FOLHA_W - FOLHA_BORDA * 2, glassH = FOLHA_H - FOLHA_BORDA * 2;
        partsLocal.push({ mesh: this._buildGlassPane(glassW, glassH), lx: lado * folhaOffsetX, ly: 0, lz: lado * folhaZ });
      });
      const rotY = objAnguloToRotY(pos.angulo || 0);
      const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
      const meshesAdded = [];
      partsLocal.forEach(({ mesh, lx, ly, lz }) => {
        mesh.position.set(pos.x + lx * cosR + lz * sinR, baseY + FRAME_H / 2 + ly, pos.y - lx * sinR + lz * cosR);
        mesh.rotation.y = rotY;
        this._group.add(mesh);
        meshesAdded.push(mesh);
      });
      const half = { x: FRAME_W / 2, y: FRAME_H / 2, z: FRAME_D / 2 };
      const posPick = { x: pos.x, y: baseY + FRAME_H / 2, z: pos.y };
      const pick = { id: el.id, type: 'janela', ref: el, pos: posPick, center: posPick, radius: Math.max(FRAME_W, FRAME_H) / 2, obb: { half, rotY } };
      this.pickables.push(pick);
      meshesAdded.forEach((m) => { m.userData.pick = pick; this._pickMeshes.push(m); });
    };

    const buildDoorOrWindowMesh = (el, kind) => {
      if (!mapData) return;
      // Pedido do usuário: "deve haver mais um tipo de janela" — a de correr
      // de 2 folhas tem geometria BEM diferente da caixa única genérica
      // abaixo (armadura + 2 folhas com trilhos, não uma placa só) —
      // delegada inteira pra buildJanelaCorrer2Folhas, acima.
      if (kind === 'janela' && el.tipo === 'correr_2folhas') { buildJanelaCorrer2Folhas(el); return; }
      const pos = (typeof Mapping !== 'undefined') ? Mapping.resolveDoorWindowPos(mapData, el) : { x: el.x, y: el.y, angulo: el.angulo || 0 };
      const largura = el.largura || (kind === 'porta' ? 0.8 : 1.2);
      const altura = el.altura || (kind === 'porta' ? 2.1 : 1.2);
      // NOVO (01/09/2026), item GRANDE #9 — "andares de verdade" (ver
      // comentário grande em Mapping.addWall/addDoor/addWindow, js/
      // mapping.js). PRESA numa parede (parentWallId): usa o piso DA PAREDE
      // (nunca o próprio `el.piso`) — a porta/janela deve sempre ficar no
      // mesmo andar físico da parede que ela corta, mesmo que `el.piso`
      // tenha ficado desatualizado (ex.: a parede foi movida pra outro piso
      // depois). SOLTA (parentWallId null): usa o próprio `el.piso`, igual a
      // qualquer objeto solto no mapa.
      const parentWallPD = el.parentWallId ? (mapData.walls || []).find((w) => w.id === el.parentWallId) : null;
      const pisoY = ((parentWallPD ? parentWallPD.piso : el.piso) || 0) * (mapData.alturaPiso || 2.8);
      const baseY = (kind === 'porta' ? 0 : (el.alturaPeitoril || 0)) + pisoY;
      const tipos = kind === 'porta' ? DOOR_TYPES3D : WINDOW_TYPES3D;
      const corHex = el.colorRGB
        ? (el.colorRGB[0] << 16) | (el.colorRGB[1] << 8) | el.colorRGB[2]
        : colorFromHex(tipos[el.tipo]?.color, kind === 'porta' ? 0x8a5a34 : 0xbfe3ff);
      // Espessura da malha: fina (encostada na parede) — "folha" da porta ou
      // vidro da janela, não a parede em si. Aberta encolhe pra ficar quase
      // rente à lateral do vão (só uma pista visual, ver comentário acima).
      const espMesh = el.aberta ? wallThickness * 0.3 : wallThickness * 0.85;
      // Pedido do usuário: "todo vidro no projeto deve ser representado como
      // no Minecraft". PORTA continua sendo sempre uma placa única sólida
      // (nunca teve vidro — só madeira/metal, ver DOOR_TYPES). JANELA
      // genérica (qualquer tipo que não seja a de correr detalhada acima)
      // passa a ser uma MOLDURA fina (4 barras, cor de `frameColor`) + um
      // painel de vidro "Minecraft" (_buildGlassPane) no meio, em vez de uma
      // única placa opaca cobrindo o vão inteiro — mais parecido com uma
      // janela de verdade (não é um bloco maciço) e mais barato (o vidro não
      // pinta quase nada da própria área, ver _buildGlassShineTexture).
      const partsLocal = []; // { mesh, lx, ly, lz } — mesma convenção de buildFrameRingParts/buildJanelaCorrer2Folhas acima
      if (kind === 'porta') {
        const geo = new THREE.BoxGeometry(largura, altura, espMesh);
        const mat = wireframe
          ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
          : new THREE.MeshLambertMaterial({ color: corHex });
        partsLocal.push({ mesh: new THREE.Mesh(geo, mat), lx: 0, ly: 0, lz: 0 });
      } else {
        // 5cm de moldura (ou menos, se a janela for pequena o bastante pra
        // isso não caber — min() de segurança) — tipos genéricos não têm
        // medida própria de moldura (só a de correr detalhada, acima, tem
        // catálogo real com 4cm por folha); 5cm é um valor razoável de
        // esquadria comum, só pra dar a mesma "moldura fina + vidro" que
        // toda janela agora tem.
        const bordaFrame = Math.min(0.05, Math.min(largura, altura) * 0.3);
        const corMoldura = colorFromHex(tipos[el.tipo]?.frameColor, 0xe8ecf2);
        const matFrame = wireframe
          ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
          : new THREE.MeshLambertMaterial({ color: corMoldura });
        partsLocal.push(...buildFrameRingParts(largura, altura, espMesh, bordaFrame, matFrame));
        const glassW = Math.max(0.02, largura - bordaFrame * 2), glassH = Math.max(0.02, altura - bordaFrame * 2);
        partsLocal.push({ mesh: this._buildGlassPane(glassW, glassH), lx: 0, ly: 0, lz: 0 });
      }
      // Ângulo — bug relatado pelo usuário: "a orientação da rotação do 2D
      // não está correspondendo no 3D... aparece 90 graus de diferença...
      // as janelas, no 3D, ainda estão ficando 90 graus diferente do 2D", e
      // também "a porta fica afastada da parede no 3D" (a folha não batia
      // com a dobradiça no canto — ver mais abaixo por que os dois sintomas
      // têm a MESMA causa).
      //
      // Fórmula ANTIGA (errada): `rotY = π/2 - angulo`, herdada por engano
      // da convenção da PAREDE (`wRotY = atan2(dx,dz)`, ver addWallBox
      // acima) — mas porta/janela NÃO usa a mesma geometria da parede: a
      // BoxGeometry da parede tem a espessura no eixo local X e o
      // COMPRIMENTO no eixo local Z (`BoxGeometry(wallThickness, segH,
      // segLen)`), enquanto a de porta/janela (logo abaixo,
      // `BoxGeometry(largura, altura, espMesh)`) tem a LARGURA no eixo
      // local X e a espessura no Z — exatamente a mesma convenção de
      // mesa/objeto/luminária (`BoxGeometry(perfil.w, perfil.h, perfil.d)`,
      // ver OBJECT3D_PROFILES/setScene no topo do arquivo), não a da
      // parede. E no 2D (`Map2DRenderer._drawDoorShape`/`_drawWindowShape`,
      // ver mapview.js) porta/janela são desenhadas do MESMO jeito que um
      // objeto (`ctx.rotate(pos.angulo)`, `largura` ao longo do eixo local
      // X) — não do jeito que uma parede é desenhada. Ou seja, porta/janela
      // precisa da MESMA fórmula já corrigida para objetos nesta rodada
      // anterior (ver `objAnguloToRotY` no topo do arquivo: `rotY =
      // -angulo`), não da fórmula da parede.
      //
      // Os dois bugs relatados eram o MESMO: com a fórmula errada, a folha
      // da porta/janela (fechada) ficava girada 90° a mais — pra quem olha,
      // parece "girada" (o sintoma da janela) e, ao mesmo tempo, como a
      // malha é um retângulo fino centralizado no MEIO do vão, girado 90°
      // ele passa a se estender pra FORA da parede em vez de ao LONGO dela
      // — o que parece "afastado"/destacado da parede (o sintoma da porta).
      // Corrigindo a rotação de base, os dois somem juntos.
      const rotY = objAnguloToRotY(pos.angulo || 0);
      let meshX = pos.x, meshZ = pos.y, meshRotY = rotY;
      // [14/09/2026] NOVO — `el.anguloAbertura` (0..90°, campo NOVO,
      // independente do booleano `el.aberta`): quando definido, tem
      // PRIORIDADE sobre `el.aberta` pra decidir o ângulo de abertura da
      // folha — permite um Script (js/components.js) animar a porta em
      // qualquer ângulo intermediário, não só aberta/fechada. `el.aberta`
      // sozinho (sem `anguloAbertura`) continua se comportando exatamente
      // como antes (0° fechada / 90° aberta) — ZERO mudança de
      // comportamento padrão pra porta sem Script.
      if (kind === 'porta') {
        const openDeg = (el.anguloAbertura !== undefined && el.anguloAbertura !== null)
          ? Math.max(0, Math.min(90, el.anguloAbertura))
          : (el.aberta ? 90 : 0);
        const phi = openDeg * Math.PI / 180;
        // Porta ABERTA (phi>0): a folha gira a partir da DOBRADIÇA, igual ao
        // símbolo arquitetônico do 2D (_drawDoorShape — hinge num CANTO do
        // vão + arco de até 90°, `el.abertura`: 'esquerda'|'direita' escolhe
        // qual ponta é fixa). Fórmula generalizada (era só phi=90° fixo,
        // antes de `anguloAbertura` existir): o centro da folha percorre um
        // arco de raio `largura/2` em torno da dobradiça — `v0` é o vetor
        // dobradiça->centro quando FECHADA (ao longo do vão) e `v1` o mesmo
        // vetor quando TOTALMENTE ABERTA (perpendicular ao vão); como os
        // dois são perpendiculares entre si e de mesmo módulo, interpolar
        // com cos(phi)/sin(phi) (em vez de lerp linear de x/z) traça o arco
        // certo pra qualquer phi intermediário — em phi=0 dá exatamente
        // `pos.x/pos.y` (fechada, sem essa conta) e em phi=90° dá
        // exatamente a fórmula antiga (aberta).
        const ang = pos.angulo || 0;
        const alongX = Math.cos(ang), alongY = Math.sin(ang); // ao longo da parede/vão
        const perpX = -Math.sin(ang), perpY = Math.cos(ang); // perpendicular — direção do giro ao abrir
        const hingeSign = el.abertura === 'esquerda' ? -1 : 1;
        const hingeX = pos.x + alongX * hingeSign * (largura / 2);
        const hingeZ = pos.y + alongY * hingeSign * (largura / 2);
        const v0x = -hingeSign * alongX * (largura / 2), v0z = -hingeSign * alongY * (largura / 2);
        const v1x = perpX * (largura / 2), v1z = perpY * (largura / 2);
        meshX = hingeX + Math.cos(phi) * v0x + Math.sin(phi) * v1x;
        meshZ = hingeZ + Math.cos(phi) * v0z + Math.sin(phi) * v1z;
        meshRotY = rotY + phi;
      }
      // `partsLocal` — UMA peça (porta) ou VÁRIAS (moldura+vidro da janela,
      // ver acima): cada uma em coordenadas LOCAIS (lx/lz giram junto com
      // meshRotY, ly só soma direto na altura) — mesma técnica de
      // _buildMesaMesh/buildJanelaCorrer2Folhas (local->mundo via cos/sin).
      // Pra porta (só 1 peça, lx=ly=lz=0) dá exatamente a mesma posição de
      // antes desta rodada — nada muda pra ela.
      const cosR = Math.cos(meshRotY), sinR = Math.sin(meshRotY);
      const meshesAdded = [];
      partsLocal.forEach(({ mesh, lx, ly, lz }) => {
        mesh.position.set(meshX + lx * cosR + lz * sinR, baseY + altura / 2 + ly, meshZ - lx * sinR + lz * cosR);
        mesh.rotation.y = meshRotY;
        this._group.add(mesh);
        meshesAdded.push(mesh);
      });
      const half = { x: largura / 2, y: altura / 2, z: espMesh / 2 };
      // `pos` (além de `center`, valor idêntico): hoverPick/pickFromRay leem
      // `p.pos` pra QUALQUER pickable (item/câmera/objeto já tinham os dois
      // campos) — faltando aqui, todo quadro em que existisse uma porta/
      // janela no ambiente quebrava `_raySphereT` (`.x` de `undefined`),
      // travando o loop de render inteiro (bug real: "tela 3D preta", já com
      // o motor carregando certo — o erro só aparecia DEPOIS do carregamento
      // funcionar, por isso não tinha aparecido nas rodadas anteriores).
      // Usa meshX/meshZ/meshRotY (não pos.x/pos.y/rotY) — o pick precisa
      // coincidir com a malha DE VERDADE, inclusive quando ela pivotou pro
      // canto da dobradiça acima.
      const posPick = { x: meshX, y: baseY + altura / 2, z: meshZ };
      const pick = { id: el.id, type: kind, ref: el, pos: posPick, center: posPick, radius: Math.max(largura, altura) / 2, obb: { half, rotY: meshRotY } };
      this.pickables.push(pick);
      // Mesma peça de `pick` em TODAS as malhas do elemento (moldura+vidro
      // da janela, ou só a peça única da porta) — mesmo padrão já usado por
      // qualquer pickable de várias malhas neste arquivo (ver _buildMesaMesh/
      // _buildLuminariaMesh: câmera, mesa, luminária) — hover/seleção/remover
      // funcionam mirando em QUALQUER pedaço, e o modo 'pixelperfect'
      // (_hoverPickPixelPerfect) também acerta a malha de verdade certinho.
      meshesAdded.forEach((m) => { m.userData.pick = pick; this._pickMeshes.push(m); });
      // [14/09/2026] NOVO — guarda a malha da folha + os dados pra
      // recalcular o arco de abertura (mesmo `pos`/`largura`/`altura`/
      // `baseY`/`rotY` usados acima) em `el._doorLeafMesh`/
      // `el._doorPivotInfo` — só pra porta (1 peça única, `meshesAdded[0]`).
      // Usado por `_updateDoorAnimations` (chamado a cada quadro por
      // `view3d.js` `_updateScriptLifecycle`) pra animar `el.anguloAbertura`
      // suavemente SEM precisar reconstruir a cena inteira a cada mudança —
      // ver `Components`/exemplo de Script "Porta Automática".
      if (kind === 'porta') {
        // [correção 13/09/2026] guardado em `this._doorRuntime` (Map por
        // id), NÃO em `el` — ver comentário grande em `setScene` sobre por
        // que anexar um THREE.Mesh direto na entidade persistida quebrava
        // o salvamento no IndexedDB.
        const rt = { leafMesh: meshesAdded[0] || null, pivotInfo: { pos, largura, altura, baseY, rotY }, manetaMesh: null };
        this._doorRuntime.set(el.id, rt);
        // [13/09/2026] NOVO — variante "porta com maçaneta" (pedido do
        // usuário: "faça uma porta com maçaneta e deve ter um script para
        // fazer a animação de movimento da maçaneta quando se dá dois
        // cliques..."). `el.comManeneta:true` é um campo NOVO e opcional —
        // sem ele, a porta continua exatamente como sempre (placa lisa sem
        // maçaneta), ZERO mudança de comportamento padrão.
        //
        // Construída como um GRUPO (cilindro fino "espelho"/rosca + alavanca
        // em L) e adicionada como FILHO de `el._doorLeafMesh` (`mesh.add`,
        // não `this._group.add`) — assim ela HERDA automaticamente toda
        // posição/rotação que `_updateDoorAnimations` já aplica na folha a
        // cada quadro (abrir/fechar), sem precisar recalcular nada aqui: o
        // grupo da maçaneta só faz sua PRÓPRIA rotação extra (eixo local Z,
        // perpendicular à face da porta) em cima disso, cuidado por
        // `_updateDoorAnimations` (ver mais abaixo, junto da animação da
        // folha) quando `anguloAbertura` muda de alvo.
        //
        // Posição local (relativa ao CENTRO da folha, já que a geometria da
        // porta é uma BoxGeometry centrada em 0,0,0): lado OPOSTO à
        // dobradiça (`hingeSign` já calculado acima pro arco de abertura),
        // altura ~1m absoluto (convertido pra offset local subtraindo
        // `altura/2`, já que o eixo Y local da folha tem origem no centro
        // dela), levemente à frente da face (metade da espessura da folha +
        // uma folga pequena) — posição típica de maçaneta real.
        const doorMesh = meshesAdded[0];
        if (el.comManeneta && doorMesh) {
          // [correção 13/09/2026] `hingeSign` foi calculado num bloco
          // `if (kind === 'porta')` ANTERIOR (linha ~3730), com escopo de
          // `const` só daquele bloco — reusá-lo aqui (bloco `if` separado)
          // dava `ReferenceError: hingeSign is not defined` e quebrava o
          // motor 3D inteiro. Mesma fórmula de lá, recalculada aqui.
          const hingeSign = el.abertura === 'esquerda' ? -1 : 1;
          const corManeta = el.colorManeta
            ? colorFromHex(el.colorManeta, 0xc9c9c9)
            : 0xc9c9c9; // metálico padrão (dourado: passar `el.colorManeta = 0xd4af37`)
          const matManeta = wireframe
            ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
            : new THREE.MeshLambertMaterial({ color: corManeta });
          // [15/09/2026 UTC] ALTERADO — pedido verbatim: "O modelo 3D da
          // porta deve ter a maçaneta voltada para o lado certo." Antes só
          // havia UM grupo de maçaneta, montado inteiro no lado +Z local da
          // folha — uma porta de verdade tem maçaneta/puxador nas DUAS
          // faces (cada lado do ambiente que a porta separa precisa abrir
          // pelo seu próprio lado); com só uma face montada, olhando a
          // porta do lado sem maçaneta ela aparecia "sem nada"/errada — o
          // sintoma batido de "voltada pro lado errado". CORRIGIDO: a
          // montagem da maçaneta virou uma função local (`montarManeta`),
          // chamada 2x — uma pro lado +Z, outra pro lado -Z (espelhada em Z
          // e também em X, já que uma maçaneta vista pelo lado de trás é a
          // imagem espelhada da vista pela frente) — cada face agora tem seu
          // próprio grupo, sempre do lado OPOSTO à dobradiça (`hingeSign`,
          // mesma lógica de antes, inalterada) em X. `rt.manetaMesh` vira um
          // array com os 2 grupos (`_updateDoorAnimations`, mais abaixo, só
          // precisa girar TODOS eles do mesmo jeito ao animar).
          const montarManeta = (ladoZ) => {
            const manetaGrupo = new THREE.Group();
            // Rosca/espelho: cilindro curto, eixo alinhado ao Z local
            // (protunde pra fora da face da porta) — `CylinderGeometry`
            // nasce com eixo Y, por isso o `rotation.x = π/2` (deita o
            // cilindro pro eixo Z).
            const rosca = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 12), matManeta);
            rosca.rotation.x = Math.PI / 2;
            rosca.position.set(0, 0, ladoZ * (espMesh / 2 + 0.02));
            manetaGrupo.add(rosca);
            // Alavanca em L: barra fina saindo da rosca — estende no sentido
            // da dobradiça (`-hingeSign` em X), formato "L" simples (2
            // caixas: a haste que sai da rosca + a ponta que dobra, ambas
            // filhas do MESMO grupo, então giram juntas na animação de
            // "girar a maçaneta"). `ladoZ` espelha a profundidade (Z) pra
            // cada face olhar pro lado certo.
            const haste = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), matManeta);
            haste.position.set(-hingeSign * 0.05, 0, ladoZ * (espMesh / 2 + 0.045));
            manetaGrupo.add(haste);
            const ponta = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.03), matManeta);
            ponta.position.set(-hingeSign * 0.095, 0, ladoZ * (espMesh / 2 + 0.06));
            manetaGrupo.add(ponta);
            // Posição do GRUPO inteiro: lado oposto à dobradiça, ~1m de
            // altura absoluta (offset local = altura alvo - metade da
            // altura da folha, já que a folha é centrada em seu próprio
            // meio) — mesma fórmula de X/Y de antes, só Z passa a depender
            // de `ladoZ`.
            manetaGrupo.position.set(-hingeSign * (largura / 2 - 0.06), 1.0 - altura / 2, 0);
            doorMesh.add(manetaGrupo);
            return manetaGrupo;
          };
          rt.manetaMesh = [montarManeta(1), montarManeta(-1)];
        }
      }
    };
    (mapData.portas || []).forEach((d) => buildDoorOrWindowMesh(d, 'porta'));
    (mapData.janelas || []).forEach((j) => buildDoorOrWindowMesh(j, 'janela'));

    // --- marcadores dos itens (pirâmides — cone de 4 lados = base quadrada) ---
    (mapData.itens || []).forEach((it) => {
      const baseY = (it.piso || 0) * (mapData.alturaPiso || 2.8);
      const r = 0.26, h = 0.6;
      const geo = new THREE.ConeGeometry(r * Math.SQRT2, h, 4);
      let mat;
      if (wireframe) {
        mat = new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true });
      } else {
        const cor = it.color
          ? new THREE.Color(it.color[0] / 255, it.color[1] / 255, it.color[2] / 255)
          : new THREE.Color(colItem);
        mat = new THREE.MeshLambertMaterial({ color: cor });
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(it.x, baseY + h / 2, it.y);
      mesh.rotation.y = Math.PI / 4;
      this._group.add(mesh);
      // Destaque extra opcional — dois efeitos independentes (pedido do
      // usuário 26/08/2026, 2ª rodada — ver DEFAULTS.destaqueExtra3DRaioAtivo/
      // destaqueExtra3DDouradoAtivo em mapconfig.js), além da própria
      // pirâmide colorida — ver _addBeaconDestaque/_addAnelDouradoDestaque3D.
      if (!wireframe) {
        if (this._config?.destaqueExtra3DRaioAtivo !== false) this._addBeaconDestaque(it.x, it.y, baseY + h, mat.color);
        if (this._config?.destaqueExtra3DDouradoAtivo) this._addAnelDouradoDestaque3D(it.x, it.y, baseY, r);
      }
      // obb: aproximação da "caixa justa" pro estilo de destaque 'tightbox' —
      // a base quadrada da pirâmide (ConeGeometry de 4 lados) tem meia-largura
      // ~r depois da rotação de 45° (que alinha as arestas aos eixos, ver
      // mesh.rotation.y acima), então rotY=0 aqui já fica correto.
      // shape:'pyramid4' — usado pelo estilo de destaque 'outline2d' pra
      // desenhar o contorno real (4 cantos da base + ápice), não uma caixa.
      const itemPos = { x: it.x, y: baseY + h * 0.5, z: it.y };
      const itemPick = { id: it.id, type: 'item', pos: itemPos, center: itemPos, radius: 0.55, ref: it, obb: { half: { x: r, y: h / 2, z: r }, rotY: 0, shape: 'pyramid4' } };
      this.pickables.push(itemPick);
      mesh.userData.pick = itemPick;
      this._pickMeshes.push(mesh);
    });

    // --- câmeras: corpo + "lente" apontando na direção configurada (ver
    // mapview.js — a MESMA convenção de ângulo do 2D: 0 = eixo X). Altura de
    // montagem fixa (câmera de parede/teto). As duas malhas são adicionadas
    // DIRETO em this._group (nada de Group aninhado) porque _disposeGroupContents
    // só percorre um nível — um Group aninhado vazaria a geometria/material
    // dos filhos dele a cada troca de modo. Por isso a posição da "lente" é
    // calculada em coordenadas do MUNDO (deslocada na direção da câmera), em
    // vez de depender de um pai com transformação local. ---
    const ALTURA_CAMERA = 1.6;
    (mapData.cameras || []).forEach((cam) => {
      const baseY = (cam.piso || 0) * (mapData.alturaPiso || 2.8);
      // [11/09/2026] CORRIGIDO — pedido verbatim, com repro exato: "crie um
      // câmera, então o desenho 2D dela tem uma seta que aponta para
      // norte. Depois, vou para o 'Ver em 3D' e a câmera (modelo 3D) e
      // também o 'Ver através dessa câmera' estão apontando para o sul."
      // A malha 3D (caixa+lente, abaixo) usava `cos(angulo)`/`sin(angulo)`
      // direto — o mapa 2D (`Map2DRenderer._drawCameraShape`, mapview.js,
      // referência que NÃO muda) também usa `cam.angulo` puro, mas com
      // sinal invertido (`-cos`/`-sin`, mesma correção aplicada em
      // view3d.js `_computeWatchCameraPose`/`_enterCameraOrbView` —
      // ver comentário grande lá pro contexto completo) — os 3
      // consumidores de `cam.angulo` (mapa 2D, esta malha, e a pose de
      // "assistir"/"ver através") precisam apontar pro MESMO lado.
      const dirX = -Math.cos(cam.angulo || 0), dirZ = -Math.sin(cam.angulo || 0);
      const rotY = Math.atan2(dirX, dirZ); // mesma convenção das paredes (atan2(dx,dz))

      // [13/09/2026] NOVO — modelo "PS1" de câmera de vigilância (pedido
      // verbatim: "novo modelo de câmera, assim como no jogo '007 the world
      // is not enough' para Play Station 1 [...] uma cúpula/base fixa +
      // uma cabeça/lente que gira horizontalmente num arco limitado, com uma
      // lucezinha vermelha piscando quando ativa"). Ativado por câmera via
      // `cam.modeloVisual==='ps1'` (campo NOVO, opcional — ausente/qualquer
      // outro valor mantém o modelo PADRÃO caixa+cone abaixo, ZERO mudança
      // pras câmeras já existentes de mapas antigos). HONESTIDADE DE ESCOPO:
      // isto é uma VARIANTE VISUAL do mesmo tipo "câmera" já existente
      // (`map.cameras`, dispatch fixo pela chave 'camera' em
      // js/objectassets.js) — não um tipo de catálogo novo/separado. O
      // dispatch de clique de TODA câmera é uma chave fixa hoje
      // (`dispatchClick3D('camera', ...)`), então criar um 2º TIPO de
      // catálogo de verdade exigiria mudar esse dispatch pra ler um campo
      // por-câmera em vários lugares do motor — risco maior de regressão
      // sem poder testar ao vivo nesta rodada. Um campo de dado
      // (`modeloVisual`) só trocando a GEOMETRIA é a via mais segura pro
      // pedido ("novo modelo" = nova aparência) sem tocar no sistema de
      // clique/card 3D já testado em produção (continua sendo o MESMO
      // `_showCameraCard3D`, agora com botões novos — ver view3d.js).
      //
      // GEOMETRIA (3-4 formas THREE básicas, nenhuma customizada):
      // - "base": CylinderGeometry curta, fixa (não gira) — o suporte de
      //   parede/teto.
      // - "cúpula": esfera achatada (scale.y reduzido) sobre a base, cor
      //   escura semi-opaca — a "bolha" translúcida clássica dessas câmeras.
      // - "cabeça/lente" (`lensHead`, um Group): cilindro fino saliente, que
      //   é o que GIRA (yaw) no vai-e-volta — ver `cam.anguloLente` abaixo e
      //   `Engine3D._updateCamerasLive`, chamado todo quadro por view3d.js.
      // - LED vermelho: esferinha pequena na cúpula + PointLight de
      //   intensidade baixíssima, ambos piscando (também em
      //   `_updateCamerasLive`) enquanto a câmera está "ativa".
      //
      // ÂNGULOS — dois campos DISTINTOS de propósito (evita reaproveitar
      // `cam.angulo` pra duas coisas ao mesmo tempo, o que quebraria o
      // modelo PADRÃO que já usa `cam.angulo` como o apontamento inteiro da
      // câmera): `cam.angulo` continua sendo a orientação FIXA de MONTAGEM
      // (pra onde a base/cúpula ficam viradas, escolhida ao criar a câmera,
      // igual sempre foi) — `cam.anguloLente` (NOVO, radianos, padrão 0) é o
      // desvio ADICIONAL da cabeça/lente em relação a essa orientação de
      // montagem, tipicamente escrito por um Script (ver assets/modelos/
      // _exemplo-script-camera-vigilancia.txt) fazendo o vai-e-volta entre
      // um mínimo e um máximo configuráveis.
      if (cam.modeloVisual === 'ps1') {
        const matCorpo = wireframe
          ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
          : new THREE.MeshLambertMaterial({ color: 0x50565f }); // cinza-metálico — "equipamento", não "objeto de cena"
        const matCupula = wireframe
          ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
          : new THREE.MeshPhongMaterial({ color: 0x1c2430, transparent: true, opacity: 0.55, shininess: 90 }); // cúpula escura semi-translúcida
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.05, 12), matCorpo);
        base.position.set(cam.x, baseY + ALTURA_CAMERA + 0.05, cam.y);
        base.rotation.y = rotY; // só estética (cilindro é simétrico no eixo Y) — mantém consistência com a direção de montagem
        this._group.add(base);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), matCupula);
        dome.scale.set(1, 0.62, 1); // "achatada" — cúpula, não bola inteira
        dome.position.set(cam.x, baseY + ALTURA_CAMERA - 0.02, cam.y);
        this._group.add(dome);
        // Cabeça/lente: Group próprio pra girar (yaw) sem mexer em base/cúpula.
        const lensHead = new THREE.Group();
        lensHead.position.set(cam.x, baseY + ALTURA_CAMERA - 0.015, cam.y);
        lensHead.rotation.y = rotY; // ponto de partida = mesma orientação de montagem (offset 0)
        const lensMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 12), matCorpo);
        lensMesh.rotation.x = Math.PI / 2; // cilindro nasce "de pé" (eixo Y) — deitado (eixo Z local) pra apontar pra frente
        lensMesh.position.set(0, 0, 0.07); // saliente à frente do centro da cúpula
        lensHead.add(lensMesh);
        // LED vermelho — esferinha emissiva + luz pontual bem fraca (não
        // deve iluminar o cômodo, só "ler" como uma lucezinha de status).
        const ledMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
        const ledMesh = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), ledMat);
        ledMesh.position.set(0.05, 0.03, 0.1);
        lensHead.add(ledMesh);
        const ledLight = new THREE.PointLight(0xff2222, 0, 0.6); // intensidade 0 = começa apagada; `_updateCamerasLive` pisca
        ledLight.position.copy(ledMesh.position);
        lensHead.add(ledLight);
        this._group.add(lensHead);
        const camPosPs1 = { x: cam.x, y: baseY + ALTURA_CAMERA, z: cam.y };
        const camPickPs1 = { id: cam.id, type: 'camera', pos: camPosPs1, center: camPosPs1, radius: 0.3, ref: cam, obb: { half: { x: 0.11, y: 0.1, z: 0.11 }, rotY, shape: 'box' } };
        this.pickables.push(camPickPs1);
        base.userData.pick = camPickPs1; dome.userData.pick = camPickPs1; lensMesh.userData.pick = camPickPs1;
        this._pickMeshes.push(base, dome, lensMesh);
        this._cameraMeshesById[cam.id] = [base, dome, lensHead]; // visibilidade (setCameraMeshVisible) cobre o grupo inteiro
        this._camPs1RefsById[cam.id] = { lensHead, ledMesh, ledMat, ledLight, montagemRotY: rotY };
        return; // NÃO monta o modelo padrão (caixa+cone) pra esta câmera
      }

      const matCam = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: 0x4fd1ff });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.16), matCam);
      body.position.set(cam.x, baseY + ALTURA_CAMERA, cam.y);
      body.rotation.y = rotY;
      this._group.add(body);
      // [10/09/2026] RE-DERIVADO DO ZERO (3ª tentativa — pedido verbatim:
      // "a ponta do cone deve ficar alinhado ao centro da caixa e dentro
      // dela [...] a base do cone deve apontar para a direção de
      // apontamento [...] a superfície da base do cone deve ficar paralela
      // com a superfície da lateral da caixa em que a ponta do cone
      // 'entrou'"). As 2 tentativas anteriores (ver histórico logo acima,
      // mantido só como referência) usavam ângulos de Euler manuais
      // (`rotation.x`/`rotation.y` combinados à mão) — frágil, alto risco
      // de sinal trocado (foi exatamente o que já deu errado 2x aqui, e o
      // mesmo tipo de bug já tinha acontecido no "orb de foto" logo abaixo
      // antes de ser trocado por quaternion). Reaproveitando aqui o MESMO
      // padrão já verificado correto no "orb de foto" (`cone.quaternion.
      // setFromUnitVectors`, ver comentário grande mais abaixo neste
      // arquivo) em vez de inventar uma 3ª variação de Euler.
      //
      // Geometria, derivada explicitamente:
      // - `ConeGeometry` nasce com a PONTA em +Y local e a BASE em −Y local
      //   (raio no plano XZ em Y=−altura/2) — documentado no comentário do
      //   orb de foto, confirmado na doc do Three.js.
      // - `body.rotation.y = rotY` já faz o eixo local +Z da caixa (a face
      //   "da frente") apontar exatamente para `dirVec` no mundo (mesma
      //   conta que `rotY = atan2(dirX, dirZ)` já usava pra `dirX,dirZ` — ver
      //   comentário grande acima, "mesma convenção das paredes"). Ou seja,
      //   a face da caixa por onde a câmera "aponta" já tem sua NORMAL
      //   exatamente igual a `dirVec` — não precisa recalcular nada extra
      //   pra achar "a face certa".
      // - `setFromUnitVectors((0,-1,0), dirVec)` gira o cone de forma que o
      //   eixo local (0,-1,0) — a direção do CENTRO até a BASE — passe a
      //   apontar pra `dirVec` no mundo. Como o eixo do cone é uma reta só,
      //   isso automaticamente deixa o eixo do cone PARALELO a `dirVec` —
      //   logo perpendicular à face da caixa (já que a normal da face É
      //   `dirVec`) — a base fica PARALELA a essa face, exatamente o pedido.
      // - Só falta posicionar: quer-se a PONTA (não o centro do cone, que é
      //   o que `mesh.position` de fato ancora) exatamente no centro da
      //   caixa. Depois da rotação, o deslocamento LOCAL da ponta
      //   (0,+altura/2,0) vira, no mundo, `-dirVec * altura/2` (sinal
      //   invertido — a ponta é o lado OPOSTO ao eixo usado no
      //   `setFromUnitVectors`). Pra ponta = centro da caixa:
      //   `posição do mesh = centroCaixa − (−dirVec·altura/2) = centroCaixa + dirVec·altura/2`.
      //   A base cai em `posição do mesh + dirVec·altura/2 = centroCaixa + dirVec·altura`.
      // - Com `altura = 0.16` (mesma medida de antes, proporção já lida como
      //   "lente" razoável pro corpo de 0.22×0.16×0.16) e meia-profundidade
      //   da caixa = 0.08: a ponta fica EXATAMENTE no centro (0.08 dentro da
      //   face — "dentro dela", não só na superfície) e a base sobra ~0.08
      //   além da face (pra fora, lendo como uma lente saliente, sem ficar
      //   nem grande nem pequena demais em relação à caixa).
      const lensH = 0.16;
      const lens = new THREE.Mesh(new THREE.ConeGeometry(0.07, lensH, 10), matCam);
      const dirVecCam = new THREE.Vector3(dirX, 0, dirZ).normalize();
      const camCenter = new THREE.Vector3(cam.x, baseY + ALTURA_CAMERA, cam.y);
      lens.position.copy(camCenter).addScaledVector(dirVecCam, lensH / 2);
      lens.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirVecCam);
      this._group.add(lens);
      const camPos = { x: cam.x, y: baseY + ALTURA_CAMERA, z: cam.y };
      const camPick = { id: cam.id, type: 'camera', pos: camPos, center: camPos, radius: 0.3, ref: cam, obb: { half: { x: 0.11, y: 0.08, z: 0.08 }, rotY, shape: 'box' } };
      this.pickables.push(camPick);
      body.userData.pick = camPick;
      lens.userData.pick = camPick;
      this._pickMeshes.push(body, lens);
      // [11/09/2026] registra as 2 malhas desta câmera pro índice usado por
      // `setCameraMeshVisible` (ver comentário grande no topo de setScene).
      this._cameraMeshesById[cam.id] = [body, lens];
    });

    // --- fotos vinculadas ao mapa (Parte 5, mapview.js this._map.fotos) —
    // NOVO (03/09/2026), pedido do usuário: "Faltou a setinha... esta
    // setinha representa o apontamento da câmera a partir do ponto de vista
    // da câmera, quando a foto foi tirada [...] as duas rotações (uma em Y,
    // outra em sequência, como gimbal, mas com movimentação cima/baixo em
    // relação à rotação sobre o eixo Y) [...] no 3D deve ter uma setinha
    // 3D." Antes, pinos de foto simplesmente não apareciam na cena 3D
    // nenhuma (só existiam no mapa 2D) — corpo mínimo: uma esfera pequena
    // (a "bolinha"/orb, mesma cor do pino 2D) + um cone apontando na direção
    // de apontamento real da câmera no momento da foto.
    // GIMBAL: `foto.dirAngulo` (yaw, giro em torno do eixo Y do mundo) e
    // `foto.rotPerp` (pitch, inclinação cima/baixo) são compostos EXATAMENTE
    // como `cameraForward()` already does pro jogador (rotX no espaço local
    // PRIMEIRO, rotY do mundo DEPOIS — ver a função no topo deste arquivo) —
    // ou seja, pitch aplicado no referencial LOCAL antes do yaw girar esse
    // referencial inteiro pro mundo; é a definição de "gimbal" pedida (as
    // duas rotações são do OBJETO/orb, nunca da imagem da foto em si, que
    // não tem representação 3D nenhuma aqui — só o marcador). Reaproveitar
    // `cameraForward` (em vez de reescrever a mesma conta) garante que os
    // dois lugares do código nunca divirjam na convenção de ângulo.
    (mapData.fotos || []).forEach((foto) => {
      const baseY = (foto.piso || 0) * (mapData.alturaPiso || 2.8) + (foto.altura || 0);
      // [22/09/2026] CORRIGIDO — era `cameraForward({yaw:foto.dirAngulo,...})`
      // direto, uma inversão de 180° no eixo Z relativo ao mapa 2D (ver
      // comentário grande de `objectPointerForward`, topo do arquivo).
      const dir = objectPointerForward(foto.dirAngulo || 0, foto.rotPerp || 0);
      const matFoto = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: 0x7cffb2 });
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), matFoto);
      orb.position.set(foto.x, baseY, foto.y);
      // Cone da seta: por padrão a ponta do ConeGeometry aponta pro +Y local
      // — `THREE.Object3D.lookAt` aponta o +Y do cone pro alvo (`ponta`)
      // quando construído a partir de um "up" alinhado ao próprio eixo do
      // cone; mais simples/direto aqui é só orientar via matriz olhando na
      // direção `dir` (mesmo truque de `body.rotation.y = rotY` da câmera
      // logo acima, generalizado pros 3 eixos com atan2/asin em vez de só Y).
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 10), matFoto);
      // [09/09/2026] Bug relatado pelo usuário: "o orb de foto é
      // representado no 3D como uma caixa e um cone, mas as posições não
      // parecem uma câmera [...] a ponta do cone deve ficar voltada para
      // dentro da caixa (encaixada), e a base do cone (que representa a
      // lente) deve apontar para o horizonte" — MESMO pedido/MESMA correção
      // de alinhamento já aplicada à ferramenta "Câmeras" logo acima (a
      // "caixa" aqui é a esfera do orb, ver `orb` acima — geometria
      // diferente, mesma ideia de "corpo da câmera"). Antes, a PONTA do
      // cone (+Y local, offset 0.16 do centro + meia-altura 0.11 = 0.27)
      // apontava pra FORA (no sentido de `dir`, ou seja, pro horizonte) e a
      // BASE ficava a 0.05 do centro do orb — DENTRO do raio da esfera
      // (0.09), mas ainda assim exatamente invertido do pedido (base
      // encaixada, ponta pra fora, em vez de ponta encaixada, base pra
      // fora). `meio` de 0.16 -> 0.14 e `cone.rotation.z = Math.PI` (extra,
      // aplicado no eixo Z — que a ordem 'YXZ' resolve PRIMEIRO, antes do
      // X/Y que apontam o eixo local pra `dir` — vira as duas pontas do
      // cone sem precisar recalcular yaw/pitch) fazem a ponta terminar em
      // 0.14-0.11=0.03 do centro do orb (bem DENTRO da esfera de raio 0.09,
      // "encaixada") e a base em 0.14+0.11=0.25 (pro lado de fora, "no
      // horizonte" — distância final bem próxima da ponta antiga, 0.27, o
      // "alcance" visual da seta não muda).
      const meio = { x: foto.x + dir.x * 0.14, y: baseY + dir.y * 0.14, z: foto.y + dir.z * 0.14 };
      cone.position.set(meio.x, meio.y, meio.z);
      // [09/09/2026] Bug relatado de novo pelo usuário (a tentativa acima,
      // via `cone.rotation.x/y` com `atan2`, NÃO resolveu — "a ponta do
      // cone ainda está apontando para baixo"): re-investigado do zero,
      // sem assumir que a conta de yaw/pitch acima estivesse certa. Causa
      // raiz de verdade: `yawCone`/`pitchCone` eram recalculados com
      // `Math.atan2` assumindo a MESMA convenção de sinal da função
      // `rotY`/`rotX` (topo do arquivo) usada pra montar `dir` — só que
      // `rotY(p,a)` (`x'=x·cosa − z·sina`) gira no sentido CONTRÁRIO da
      // rotação padrão que `cone.rotation.y = ângulo` de verdade aplica
      // (a do Three.js, right-handed: `x'=x·cosa + z·sina`) — as duas
      // funções não são inversas uma da outra. Resultado, conferido conta
      // por conta: com `foto.rotPerp` (pitch) perto de 0 — o caso mais
      // comum, foto tirada quase na horizontal — o eixo final do cone
      // acabava apontando pra (0,1,0)/(0,-1,0) do MUNDO (reto pra
      // cima/baixo) não importa o `yaw`, batendo exatamente com o relato
      // ("a ponta do cone está apontando para baixo").
      // CORRIGIDO: em vez de reconstruir ângulos de Euler (frágil — exige
      // as duas convenções de rotação baterem exatamente), alinha o cone
      // por QUATERNION direto, do jeito que o Three.js foi feito pra
      // fazer: `setFromUnitVectors(de, para)` gira o eixo LOCAL `de` até
      // apontar pro vetor `para`, sem nenhuma conversão de ângulo no meio
      // (imune a qualquer mismatch de convenção/ordem de eixos). O eixo
      // local usado como "de" é (0,-1,0) — a BASE do cone (padrão do
      // `ConeGeometry`, ponta em +Y/base em −Y) — apontada pro vetor `dir`
      // (direção real da câmera/horizonte): a base (lente) fica voltada
      // pro horizonte, e a ponta (+Y local, lado oposto) automaticamente
      // fica voltada pro CENTRO do orb (−dir) — exatamente o pedido: "a
      // ponta do cone deve entrar na bola e a base do cone deve estar
      // apontando para o horizonte". Sem precisar de nenhum
      // `rotation.order`/flip extra em Z (removido — não faz mais
      // sentido, a orientação já sai certa direto do quaternion).
      const dirVec = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirVec);
      this._group.add(orb, cone);
      // [12/09/2026] registra as malhas deste orb de foto pro índice usado
      // por `setFotoMeshVisible` (ver comentário grande no topo de
      // setScene) — a placa (quando existe foto), logo abaixo, entra neste
      // MESMO array depois de criada.
      this._fotoMeshesById[foto.id] = [orb, cone];

      // [10/09/2026] NOVO — pedido verbatim: "Deve aparecer um retângulo
      // amarelo representado o enquadramento da câmera de acordo com as
      // propriedades da câmera ('campo de visão', aspect ratio no x e no
      // y)." Reaproveita `foto.camProps` (mapview.js `_refreshFotosNoMapa`
      // -> `mapaCamProps`, já usado pelo fieldset "Propriedades da câmera",
      // ver `_camPropsFieldsetHtml`/`_wireCamPropsFieldset` em mapview.js)
      // pra desenhar um retângulo (o "quadro"/passe-partout da câmera, como
      // no Blender) + 4 linhas até os cantos, na MESMA direção `dirVec`
      // já calculada acima pro cone. Sem `camProps` ainda definido (orb
      // recém-criado, nunca aberto em "Propriedades da câmera"), cai nos
      // mesmos padrões de fábrica do fieldset em vez de não desenhar nada —
      // sempre há um enquadramento pra mostrar, só não calibrado ainda.
      // [11/09/2026] REESCRITO — pedido verbatim: "apague todas as
      // propriedades [da câmera]. Deixe apenas FOV. [...] uma seção de
      // 'Resolução' [...] Estes [...] valores influenciam no tamanho do
      // retângulo amarelo." O fieldset Blender (foco/sensor mm) SUMIU —
      // `camProps.fov` (radianos, vertical, direto) e
      // `camProps.resolutionX/resolutionY` (proporção) são as ÚNICAS fontes
      // agora — MESMA correção espelhada em view3d.js
      // `_activeCamPropsVFovRad`/`_activeCamFrameAspect` (busque por
      // "resolutionX" lá pra conferir que bate 100%, exigência de sempre
      // entre os dois arquivos).
      {
        const cp = foto.camProps || {};
        const resX = cp.resolutionX ?? 1920;
        const resY = cp.resolutionY ?? 1080;
        // [11/09/2026] CORRIGIDO — pedido verbatim: "O enquadramento deve
        // ter medidas limite que são a forma do quadrado (assim como no
        // Blender) [...]" — `camProps.fov` deixou de ser tratado sempre
        // como o FOV VERTICAL direto; agora passa por `camPropsVFovRad`
        // (ver comentário grande dela, logo acima de `window.Cam3DMath`),
        // que aplica o FOV salvo ao eixo MAIOR da resolução (convenção
        // "Sensor Fit: Auto" do Blender) e devolve o vertical de verdade a
        // usar aqui.
        const vFovRad = window.Cam3DMath.camPropsVFovRad(cp.fov, resX, resY);
        const aspectXY = resX / Math.max(1, resY);
        const FRUSTUM_DIST = 1.0; // metros — só um tamanho de visualização, não afeta o FOV real usado em "ver através desta câmera"
        const halfH = FRUSTUM_DIST * Math.tan(vFovRad / 2);
        const halfW = halfH * aspectXY;
        const origemFr = new THREE.Vector3(foto.x, baseY, foto.y);
        const alvoFr = origemFr.clone().add(dirVec);
        const upMundo = Math.abs(dirVec.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        const m4Fr = new THREE.Matrix4().lookAt(origemFr, alvoFr, upMundo);
        const rightFr = new THREE.Vector3().setFromMatrixColumn(m4Fr, 0);
        const upFr = new THREE.Vector3().setFromMatrixColumn(m4Fr, 1);
        const centroFr = origemFr.clone().addScaledVector(dirVec, FRUSTUM_DIST);
        const c1 = centroFr.clone().addScaledVector(rightFr, -halfW).addScaledVector(upFr, halfH);
        const c2 = centroFr.clone().addScaledVector(rightFr, halfW).addScaledVector(upFr, halfH);
        const c3 = centroFr.clone().addScaledVector(rightFr, halfW).addScaledVector(upFr, -halfH);
        const c4 = centroFr.clone().addScaledVector(rightFr, -halfW).addScaledVector(upFr, -halfH);
        // [13/09/2026 — ITEM B] pedido verbatim (ordem de camadas do painel
        // "🖼️ Imagem"): "[...] 5º retângulo amarelo" — sempre por cima de
        // TUDO (céu/chão/foto/resto), nos 2 modos ('Trás' e 'Frente'). Este
        // é o MESMO retângulo amarelo referenciado pelo item D ("os botões
        // 'Esticar'/'Caber'/'Cortar' são em relação ao retângulo amarelo que
        // representa os limites da câmera") — dentro de "Ver através desta
        // câmera", a câmera de render fica exatamente na origem/direção/FOV
        // desta foto, então este quadro (desenhado a `FRUSTUM_DIST`=1m à
        // frente, no aspect ratio do sensor) projeta na tela como o
        // "letterbox" exato do enquadramento da câmera. `depthTest:false`
        // (nunca ocluído por nenhum objeto entre a câmera e o quadro) +
        // `transparent:true` (empurra pro passe TRANSPARENTE do Three.js,
        // que roda depois do passe opaco inteiro) + `renderOrder:9000`
        // (bem alto) garantem que este retângulo sempre desenha por ÚLTIMO,
        // por cima de tudo. [19/09/2026 — RODADA SEGUINTE] este `renderOrder`
        // era escolhido "maior que o do plano do backdrop 'Trás' (-1000)" —
        // esse plano 3D foi removido (a foto agora vive só num `<canvas>` 2D
        // de overlay, sempre acima deste `<canvas>` WebGL/2D via CSS, ver
        // view3d.js `_updateFotoCamOverlayZoomScale`); este retângulo (o
        // guia de calibração, legítimo por si só, independente do backdrop)
        // continua com `depthTest:false`/`renderOrder:9000` normalmente,
        // sem relação nenhuma com a foto.
        const matAmarelo = new THREE.LineBasicMaterial({ color: 0xffee00, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
        const geomRet = new THREE.BufferGeometry().setFromPoints([c1, c2, c3, c4, c1]);
        const linhaRet = new THREE.LineLoop(geomRet, matAmarelo);
        const geomCantos = new THREE.BufferGeometry().setFromPoints([
          origemFr, c1, origemFr, c2, origemFr, c3, origemFr, c4,
        ]);
        const linhasCantos = new THREE.LineSegments(geomCantos, matAmarelo);
        linhaRet.visible = !!this._frustumGizmosEnabled;
        linhasCantos.visible = !!this._frustumGizmosEnabled;
        linhaRet.renderOrder = 9000;
        linhasCantos.renderOrder = 9000;
        this._group.add(linhaRet, linhasCantos);
        this._fotoFrustumMeshesById[foto.id] = [linhaRet, linhasCantos];
        // [15/09/2026] NOVO — ver comentário grande em
        // `this._fotoFrustumBasisById` (início de `setScene`) e em
        // `updateCameraFrustumGeometry` (mais abaixo).
        this._fotoFrustumBasisById[foto.id] = { origem: origemFr.clone(), dirVec: dirVec.clone() };
      }

      // [11/09/2026] CORRIGIDO — bug relatado pelo usuário: "só está sendo
      // possível acessar um objeto 'Orb de foto', se tem uma foto anexada
      // (vinculada)." Causa raiz: o registro do pickable (`pickables.push`/
      // `userData.pick`/`_pickMeshes.push`, o que faz `Engine3D.pickFromRay`
      // — e portanto o raycasting de seleção em view3d.js `_tryPick` —
      // conseguir "achar" o orb) vivia TODO dentro do bloco `if
      // (foto.thumbDataUrl || foto.dataUrl)` logo abaixo, junto com a placa
      // 3D texturizada da foto. Ou seja: a esfera+cone (`orb`/`cone`, linhas
      // acima) SEMPRE eram desenhados na cena, mas só ganhavam interação
      // quando havia imagem — um "orb de foto" recém-criado sem foto
      // vinculada ainda (ver view3d.js `_placeWithBuildTool`, ferramenta
      // 'orbfoto-novo': agora cria o registro direto, sem modal, sem
      // dataUrl) aparecia mas era invisível ao clique/seleção. CORRIGIDO
      // movendo o registro do pickable pra FORA do `if` — agora usa sempre
      // o `orb` (esfera) como malha "dona" do pick, e a placa da foto
      // (quando existe) GANHA o MESMO `fotoPick` (mesmo `id`, mesmo `ref`)
      // em vez de criar um pickable duplicado — clicar na placa OU na
      // esfera/cone leva ao mesmo cartão 3D (`view3d.js
      // _showFotoPinCard3D`), onde o usuário pode então vincular uma foto
      // (como qualquer outra propriedade) se ainda não houver uma.
      const fotoPos = { x: foto.x, y: baseY, z: foto.y };
      const fotoPick = { id: foto.id, type: 'fotoPin', pos: fotoPos, center: fotoPos, radius: 0.28, ref: foto };
      this.pickables.push(fotoPick);
      orb.userData.pick = fotoPick;
      cone.userData.pick = fotoPick;
      this._pickMeshes.push(orb, cone);

      // NOVO (03/09/2026), pedido verbatim: "No 'Ver em 3D', deve ser
      // possível interagir com o objeto da foto tirada. E o objeto da foto
      // tirada deve estar posicionado conforme a altura definida nas suas
      // propriedades com uma seta 3D saindo de uma foto (um retângulo 3D),
      // indicando o apontamento de quando ela foi tirada." — antes só
      // existia o marcador esfera+cone acima (sem pickable, "a interação
      // continua pelo pino 2D"); agora um RETÂNGULO 3D texturizado com a
      // própria foto (`foto.thumbDataUrl`, mesma miniatura já usada no
      // painel 2D — ver mapview.js _openFotoPinPopover — mais leve que a
      // imagem em resolução cheia, e mais que suficiente pro tamanho que
      // este retângulo ocupa na cena) fica no MESMO ponto do orb, com a
      // NORMAL da face alinhada a `dir` — o cone/seta já construído acima
      // fica bem na frente dela, na mesma direção, dando a impressão pedida
      // de "uma seta saindo da foto". MESMO padrão de textura de
      // `_buildImagemMesh` (TextureLoader.load(dataURL), sem cache entre
      // reconstruções de cena — ver comentário grande lá). Tamanho fixo
      // (não lê a proporção real da imagem — mesma simplificação
      // documentada em outros pontos deste arquivo, "sem navegador pra
      // calibrar visualmente"): 0,42m x 0,3m (~4:3), plano o bastante pra
      // não atravessar paredes próximas na maioria dos casos.
      if (foto.thumbDataUrl || foto.dataUrl) {
        const FW = 0.42, FH = 0.3;
        const texFoto = new THREE.TextureLoader().load(foto.thumbDataUrl || foto.dataUrl);
        const matPlaca = new THREE.MeshBasicMaterial({ map: texFoto, color: 0xffffff, side: THREE.DoubleSide, transparent: true });
        const placa = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), matPlaca);
        placa.position.set(foto.x, baseY, foto.y);
        // [09/09/2026] CORRIGIDO — bug que quebrava o carregamento inteiro do
        // motor 3D ("Não consegui abrir o 'Ver em 3D'" / "não consegui
        // carregar o motor 3D" ao tentar entrar de novo). Causa raiz: a
        // reescrita do cone da foto pra quaternion (`setFromUnitVectors`,
        // comentário grande logo acima) apagou o cálculo de `yawCone`/
        // `pitchCone` (não precisava mais deles pro cone), mas este trecho
        // — a "placa" 3D da foto, escrito ANTES da reescrita — continuou
        // lendo essas duas variáveis, que não existem mais nesta função:
        // `ReferenceError: yawCone is not defined`, lançado de dentro de
        // `setScene()` pra QUALQUER mapa com ao menos um orb de foto
        // posicionado. Como `setScene()` roda tanto direto (dentro do
        // `await` de `view3d.js` mount()) quanto dentro do `.then()` de
        // `Engine3D._loadPromise` (ver o `_pendingScene` no fim de
        // `_initThree`, logo acima), o erro aparecia embrulhado nas DUAS
        // mensagens que o usuário relatou ao mesmo tempo. Corrigido girando
        // a placa pelo MESMO método por quaternion do cone (a normal padrão
        // do `PlaneGeometry`, +Z local, apontada pro vetor `dir`) — sem
        // reintroduzir nenhuma variável de ângulo solta.
        placa.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirVec);
        this._group.add(placa);
        // [11/09/2026] `fotoPick` já foi criado/registrado ACIMA (fora
        // deste `if`, ver comentário grande) — a placa só GANHA o mesmo
        // pickable (não cria um novo `pickables.push` duplicado), pra
        // clicar na foto texturizada continuar funcionando exatamente como
        // antes, agora só compartilhando o pick com a esfera/cone.
        placa.userData.pick = fotoPick;
        this._pickMeshes.push(placa);
        // [12/09/2026] a placa também entra no índice `_fotoMeshesById`
        // deste orb (ver registro de orb/cone logo acima) — sem isto, "Ver
        // através desta câmera" continuaria mostrando a placa da própria
        // foto flutuando na frente da visão travada, mesmo com a
        // esfera/cone já escondidos.
        if (this._fotoMeshesById[foto.id]) this._fotoMeshesById[foto.id].push(placa);
      }
    });

    // --- objetos: forma simples por categoria (ver OBJECT3D_PROFILES acima),
    // OU uma forma desenhada (obj.forma: 'retangulo'|'poligono', ver
    // mapview.js._pickObjectType/_openObjectPanel) — nesse caso o "perfil" é
    // montado na hora a partir dos campos do próprio objeto (largura/
    // profundidade ou raio/lados, altura, cor) em vez de vir da tabela fixa. ---
    (mapData.objects || []).forEach((obj) => {
      const childrenBefore = this._group.children.length;
      this._buildOneObjectMesh(obj, wireframe, colWireframe);
      this._applyObjMaterialOverride(obj, childrenBefore);
    });

    // NOVO (07/09/2026), pedido verbatim: "blocos de construção" (tijolos
    // autofundíveis) — ver js/tijolos.js pro algoritmo de fusão/culling de
    // face. Construído AQUI (depois dos objetos normais, antes dos
    // pós-passos de modo híbrido/oclusão abaixo — DECISÃO DE ESCOPO: os
    // tijolos não passam pelos pós-passos de wireframe/híbrido/oclusão
    // desta rodada, só objetos "normais" — ver `_rebuildTijolos`).
    this._rebuildTijolos(mapData);

    // Pedido do usuário: "deve haver modos híbridos de visualização" — os
    // dois PÓS-PASSOS abaixo varrem `this._group` já pronto (todas as malhas
    // já construídas normalmente pelos blocos acima) em vez de espalhar
    // lógica extra em cada ponto que cria uma malha — mais simples e nunca
    // fica desatualizado se um novo tipo de malha for adicionado depois.
    if (wireframe) this._addWireframeOcclusion();
    if (this.mode === 'hibrido') this._setupHybridMeshes();
    // Ver comentário grande em `this._instancedPools` (constructor) — 1x por
    // cena inteira, depois que TODAS as malhas (`_pickMeshes`) já existem.
    this._rebuildInstancedPools();
    this._setupCullMeshes();
    this._setupWallOcclusionMeshes();
    // [13/09/2026 UTC] NOVO — ver comentário grande de _buildOcclusionSectors
    // (mais abaixo neste arquivo) pro pedido/motivo completo. Precisa rodar
    // DEPOIS de `this._floorInfo` já montado (usado como área da grade) —
    // ponto já garantido aqui, `_floorInfo` é montado bem antes deste bloco
    // de pós-passos, dentro do mesmo setScene.
    this._buildOcclusionSectors(mapData);
  }

  /** Monta (ou remonta do zero — chamado a cada `setScene`) os
   *  `THREE.InstancedMesh` de objetos genéricos de catálogo, um por `tipo`
   *  com pelo menos `LIMIAR` objetos marcados `userData._instancerEligible`
   *  (ver `_buildOneObjectMesh`) — abaixo do limiar o custo de criar/manter
   *  um InstancedMesh não compensa (poucos objetos daquele tipo continuam
   *  desenhados INDIVIDUALMENTE, do jeito de sempre, com `visible=true`
   *  normal — nada muda pra eles). As malhas antigas (do `setScene` anterior)
   *  já foram descartadas por `_disposeGroupContents` no início deste método
   *  — um InstancedMesh é só mais um filho de `this._group` (tem
   *  `.geometry`/`.material` como qualquer `THREE.Mesh` comum), então aquele
   *  descarte genérico já cobre ele de graça, sem precisar de nenhum código
   *  extra de limpeza aqui. */
  _rebuildInstancedPools() {
    const THREE = this.THREE;
    this._instancedPools = {};
    if (!this._zeroInstMatrix) this._zeroInstMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    // [13/09/2026 — RODADA "frustum culling"] MUDADO — pedido verbatim:
    // "mesmo o prédio estando com uma única face do lado de fora, o fps caiu
    // bastante, não deveria ser assim [...] implemente [frustum culling]."
    // CAUSA RAIZ CONFIRMADA (lendo `lib/three.global.js`, não só suposição):
    // o comentário antigo deste método (removido agora) dizia que a
    // bounding sphere automática de um `InstancedMesh` era calculada "só a
    // partir da geometria de UMA instância, na origem" — isso está ERRADO
    // pra esta versão do three.js: `InstancedMesh.computeBoundingSphere()`
    // (ver classe `InstancedMesh`, `lib/three.global.js`) de fato percorre
    // TODAS as `count` instâncias e faz a UNIÃO das esferas de cada uma
    // (`this.boundingSphere.union(...)` num laço `for i < count`) — o
    // cálculo em si é correto. O bug de verdade é outro: antes desta
    // mudança, havia 1 ÚNICO `InstancedMesh` por TIPO pro mapa INTEIRO (ex:
    // um só pool de "cadeira" pras 2000 cadeiras dos 40 andares do prédio)
    // — a união de todas as instâncias desse pool cobre o PRÉDIO INTEIRO, e
    // `Frustum.intersectsObject` (ver `lib/three.global.js`, classe
    // `Frustum`) só descarta o `InstancedMesh` quando a câmera não vê NADA
    // daquela esfera gigante — ou seja, o pool inteiro (milhares de
    // instâncias, TODAS as cadeiras do prédio) só é cortado quando a câmera
    // não vê o prédio inteiro; com a câmera dentro/perto do prédio olhando
    // só pra 1 andar, a esfera do pool ainda intersecta o frustum (o prédio
    // continua "no campo de visão" de longe/pelas laterais) e o three.js
    // manda desenhar as instâncias TODAS mesmo — daí o "1 face do lado de
    // fora derruba o FPS", exatamente como relatado. CORRIGIDO: os pools
    // agora são segmentados por TIPO + PISO (`obj.piso`, o mesmo campo já
    // usado pra calcular a altura Y do objeto — ver `baseY` em
    // `_buildOneObjectMesh`) — um pool de "cadeira" por ANDAR, não um só pro
    // prédio inteiro. Cada pool passa a ter uma bounding sphere do TAMANHO
    // DE UM ANDAR (bem menor que o prédio todo), então `frustumCulled` pode
    // voltar a `true` (ligado, o padrão do three.js) com segurança: quando a
    // câmera olha só pra 1 andar, o three.js agora consegue de fato pular o
    // draw call inteiro dos pools dos OUTROS 39 andares. Prédios sem
    // `obj.piso` (mapas de andar único, valor `undefined`/0 pra todo mundo)
    // caem todos no mesmo pool de sempre — nenhuma regressão nesse caso,
    // já que aí só existe "1 andar" mesmo.
    const grupos = new Map(); // poolKey ("tipo::piso") -> [mesh,...]
    this._pickMeshes.forEach((m) => {
      if (!m.userData._instancerEligible) return;
      const tipo = m.userData.pick?.ref?.tipo;
      if (!tipo) return;
      const piso = m.userData.pick?.ref?.piso || 0;
      const poolKey = tipo + '::' + piso;
      if (!grupos.has(poolKey)) grupos.set(poolKey, { tipo, piso, meshes: [] });
      grupos.get(poolKey).meshes.push(m);
    });
    const LIMIAR = 4;
    grupos.forEach(({ tipo, piso, meshes }, poolKey) => {
      if (meshes.length < LIMIAR) return; // continuam individuais — ver comentário do método
      const geo = meshes[0].geometry; // mesma forma/dimensões pra todo objeto deste tipo (ver checagem em _buildOneObjectMesh)
      // Material base BRANCO neutro — a cor de verdade (incluindo o matiz de
      // `_tintForLight`, já aplicado ao material de CADA malha individual
      // antes de chegar aqui) vem por instância via `setColorAt` abaixo
      // (multiplica a cor da instância pela cor do material base; branco =
      // não altera nada, deixa a cor da instância passar intacta).
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const inst = new THREE.InstancedMesh(geo, mat, meshes.length);
      meshes.forEach((m, i) => {
        m.updateMatrix();
        inst.setMatrixAt(i, m.matrix);
        inst.setColorAt(i, m.material.color || new THREE.Color(0xffffff));
        // `.matrix` guardado AQUI (não reaproveitado de `m.matrix` ao vivo
        // depois) porque `_instanceDemote`/`_syncInstanceVisibility` precisam
        // restaurar a transformação de verdade da instância mesmo depois de
        // ela ter sido zerada (Raio X/culling) — `m.matrix` nunca muda depois
        // de construído (o objeto individual não se move sozinho), então uma
        // cópia congelada aqui é exatamente o mesmo valor pra sempre.
        m.userData._inst = { tipo, piso, poolKey, index: i, matrix: m.matrix.clone() };
        m.visible = false; // a instância é quem desenha agora — ver comentário grande no construtor
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      // Bounding sphere calculada AQUI, com as matrizes REAIS (nenhuma ainda
      // zerada por Raio X/culling de distância) — reflete a extensão
      // espacial de verdade deste pool (1 andar, não o prédio inteiro, ver
      // comentário grande acima) e nunca precisa ser recalculada depois: um
      // objeto individual nunca se move sozinho, então a região que este
      // pool ocupa é fixa pra sempre a partir daqui. `frustumCulled = true`
      // (padrão do three.js, deixado explícito aqui só pra documentar a
      // decisão) — agora seguro porque o pool é pequeno o bastante pra o
      // corte por frustum ser útil de verdade.
      inst.computeBoundingSphere();
      inst.frustumCulled = true;
      this._group.add(inst);
      this._instancedPools[poolKey] = { mesh: inst, count: meshes.length, tipo, piso };
    });
  }

  /** Mantém a instância (`mesh.userData._inst`) de UMA malha individual em
   *  sincronia com `mesh.visible` — chamado sempre que algo de FORA da
   *  construção da cena muda essa visibilidade "ao vivo" depois de pronta
   *  (hoje só `_updateDistanceCulling`, todo quadro). Malhas sem instância
   *  (`_inst` ausente — não elegíveis, ou elegíveis mas abaixo do `LIMIAR`)
   *  não fazem nada aqui, exatamente como antes desta refatoração. Ignorado
   *  de propósito enquanto a malha está "promovida" pro Raio X pontual
   *  (`_xrayPromoted`, ver `_instancePromote`) — nesse momento é
   *  `setXRayTarget` quem manda na instância dela (zerada), não o culling. */
  _syncInstanceVisibility(mesh) {
    const inst = mesh.userData._inst;
    if (!inst || mesh.userData._xrayPromoted) return;
    const pool = this._instancedPools[inst.poolKey];
    if (!pool) return;
    pool.mesh.setMatrixAt(inst.index, mesh.visible ? inst.matrix : this._zeroInstMatrix);
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  /** "Promove" uma malha individual instanciada pro Raio X (pontual ou
   *  global): torna ela visível de verdade (quem chama já troca o material
   *  dela pro material transparente/wireframe de Raio X, ANTES ou DEPOIS de
   *  chamar isto, tanto faz) e zera a instância dela no pool, pra nunca
   *  desenhar o objeto DUAS vezes (a malha individual sob Raio X + a
   *  instância sólida normal, sobrepostas). Sem `_inst` (objeto não
   *  instanciado) não faz nada — o resto de `setXRayTarget`/`setGlobalXRay`
   *  já funciona sozinho nesse caso, exatamente como antes desta
   *  refatoração. */
  _instancePromote(mesh) {
    const inst = mesh.userData._inst;
    if (!inst) return;
    mesh.userData._xrayPromoted = true;
    mesh.visible = true;
    const pool = this._instancedPools[inst.poolKey];
    if (pool) { pool.mesh.setMatrixAt(inst.index, this._zeroInstMatrix); pool.mesh.instanceMatrix.needsUpdate = true; }
  }

  /** Desfaz `_instancePromote` — devolve a malha individual pro estado
   *  invisível de sempre e restaura a instância dela (transformação
   *  ORIGINAL, congelada em `_inst.matrix`) — não espera pelo próximo
   *  `_updateDistanceCulling` pra isso (evitaria o objeto "sumir" por um
   *  quadro se ele já estivesse fora do alcance de renderização; o próximo
   *  culling corrige de novo se for o caso, sem nenhum efeito visível
   *  perceptível — mesmo espírito de pequenas defasagens já aceitas em
   *  outros pontos deste arquivo, ver `_tintForLight`). */
  _instanceDemote(mesh) {
    const inst = mesh.userData._inst;
    if (!inst) return;
    delete mesh.userData._xrayPromoted;
    mesh.visible = false;
    const pool = this._instancedPools[inst.poolKey];
    if (pool) { pool.mesh.setMatrixAt(inst.index, inst.matrix); pool.mesh.instanceMatrix.needsUpdate = true; }
  }

  /** [13/09/2026] NOVO — pedido do usuário: "chão lajotado, teto modular
   *  (escritórios), teto de gesso com rodelas de acesso". Gera (ou devolve
   *  do cache, ver `this._texturaProceduralCache` no construtor) uma
   *  `THREE.CanvasTexture` PROCEDURAL desenhada num `<canvas>` 2D pequeno —
   *  nenhuma imagem/arquivo externo é carregado, só formas geométricas
   *  simples (retângulos de fundo + linhas de "rejunte"), técnica idêntica
   *  em espírito à do disco do relógio/mostrador do robô (outros usos de
   *  canvas 2D neste arquivo).
   *  `kind`: 'lajota' (chão lajotado — quadrados com rejunte escuro bem
   *  visível, tom cinza-claro/bege) ou 'modular' (teto modular de
   *  escritório — quadrados maiores, tom branco-gelo, linhas MAIS SUTIS que
   *  a lajota, imitando o forro de placas). `larguraM`/`profundidadeM`: o
   *  tamanho REAL do objeto (metros) — usado só pra calcular
   *  `texture.repeat` (quantas vezes o padrão de 256×256px se repete ao
   *  longo do objeto), de forma que o tamanho VISUAL de cada quadrado da
   *  textura fique em ESCALA REAL (lajota de 0.6m, placa de forro de 0.6m),
   *  não esticado/comprimido conforme o objeto é redimensionado.
   *  Cache por chave `kind+larguraM+profundidadeM` (arredondados) — o
   *  `<canvas>` em si é sempre o MESMO padrão 256×256 pra um dado `kind`
   *  (só o `repeat` muda com o tamanho), então na prática gera 1 canvas por
   *  `kind` e reaproveita entre todos os objetos do mesmo tipo/acabamento,
   *  só clonando a textura (`texture.clone()`) quando o repeat muda — clonar
   *  é bem mais barato que redesenhar o canvas do zero. */
  _getProceduralFloorTexture(kind, larguraM, profundidadeM) {
    const THREE = this.THREE;
    const TAMANHO_LAJOTA_M = kind === 'lajota' ? 0.6 : 0.6; // 60cm — mesma escala pedida pro chão lajotado e pro forro modular
    const cacheKeyCanvas = 'canvas::' + kind;
    let base = this._texturaProceduralCache[cacheKeyCanvas];
    if (!base) {
      const CANVAS_PX = 256;
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_PX; canvas.height = CANVAS_PX;
      const ctx = canvas.getContext('2d');
      if (kind === 'lajota') {
        // Chão lajotado: fundo bege/cinza-claro, linhas de rejunte
        // cinza-escuro bem marcadas (contraste alto — pedido: "linhas de
        // rejunte cinza-escuro"), um único quadrado de lajota preenchendo
        // todo o canvas (o "grid" de verdade vem do `repeat`, repetindo
        // este quadrado várias vezes pela superfície do objeto).
        ctx.fillStyle = '#d8d2c4';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        // Leve variação de tom (2 tons de bege alternados, tipo lajotas
        // "batidas" de fábricas diferentes) — puramente estético, opcional.
        ctx.fillStyle = '#dcd6c8';
        ctx.fillRect(0, 0, CANVAS_PX / 2, CANVAS_PX / 2);
        ctx.fillRect(CANVAS_PX / 2, CANVAS_PX / 2, CANVAS_PX / 2, CANVAS_PX / 2);
        ctx.strokeStyle = '#5a5448';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, CANVAS_PX - 6, CANVAS_PX - 6);
      } else {
        // Teto modular: fundo branco-gelo, linhas MAIS SUTIS (cinza claro,
        // traço fino) que a lajota — imita as juntas discretas de um forro
        // de placas de escritório, sem "gritar" tanto quanto o rejunte do
        // chão.
        ctx.fillStyle = '#f4f5f7';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        ctx.strokeStyle = '#d3d6db';
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, CANVAS_PX - 3, CANVAS_PX - 3);
      }
      base = new THREE.CanvasTexture(canvas);
      base.wrapS = base.wrapT = THREE.RepeatWrapping;
      this._texturaProceduralCache[cacheKeyCanvas] = base;
    }
    // `repeat` depende do tamanho REAL do objeto (largura/profundidade,
    // metros) — cacheado À PARTE por essa combinação, clonando a textura
    // base (mesmo canvas, `image` é compartilhada — clone() do Three.js não
    // duplica os pixels, só o objeto-textura com seus próprios wrap/repeat/
    // needsUpdate) pra não escrever um `repeat` por cima do de outro objeto
    // de tamanho diferente que já esteja usando a mesma textura-base.
    const rw = Math.max(0.1, larguraM || 10), rd = Math.max(0.1, profundidadeM || 10);
    const cacheKeyRepeat = kind + '::' + rw.toFixed(2) + 'x' + rd.toFixed(2);
    let tex = this._texturaProceduralCache[cacheKeyRepeat];
    if (!tex) {
      tex = base.clone();
      tex.needsUpdate = true;
      tex.repeat.set(rw / TAMANHO_LAJOTA_M, rd / TAMANHO_LAJOTA_M);
      this._texturaProceduralCache[cacheKeyRepeat] = tex;
    }
    return tex;
  }

  /** [15/09/2026] NOVO — textura procedural do MOSTRADOR do relógio
   *  (marcações de hora), pedido do usuário: "Também deve ter marcações
   *  das horas, além dos ponteiros, se for menos custoso em processamento,
   *  faça uma textura para as horas e imprima os ponteiros por cima."
   *  MESMO padrão de cache de `_getProceduralFloorTexture` acima (canvas 2D
   *  desenhado UMA vez, cacheado por chave, nunca redesenhado por objeto/
   *  quadro) — aqui mais simples ainda: como o disco do mostrador é sempre
   *  aplicado como UMA textura direta cobrindo o disco inteiro (sem
   *  `repeat`/mosaico como no piso — um relógio não "ladrilha" o próprio
   *  mostrador), não existe a etapa de clonar-por-tamanho; a chave de cache
   *  é só a cor de fundo (`perfil.color`, permite reaproveitar entre
   *  relógios de skins diferentes sem redesenhar o canvas de novo pra cada
   *  um).
   *
   *  DESENHO — canvas 256×256: fundo pintado com a cor do mostrador
   *  (mesma `perfil.color` do disco — ver comentário em `_buildRelogioMesh`
   *  sobre por que o material usa `color: 0xffffff` com essa textura como
   *  `map`), um círculo fino de moldura, e 12 tracinhos radiais nas
   *  posições de hora (a cada 30°) — mais GROSSOS/LONGOS nas posições
   *  12/3/6/9 (múltiplos de 90°) pra dar aquele destaque de "marcador
   *  cardinal" que a maioria dos relógios de parede tem. Os PONTEIROS
   *  continuam sendo geometria (caixas finas, `fazPonteiro` acima) — a
   *  textura cobre só o mostrador de baixo, os ponteiros ficam por CIMA
   *  dela (meshes-filho separados, ver `_buildRelogioMesh`), exatamente
   *  como pedido ("imprima os ponteiros por cima"). */
  _getProceduralMostradorTexture(corFundo) {
    const THREE = this.THREE;
    this._texturaProceduralCache = this._texturaProceduralCache || {};
    const cor = (corFundo === undefined || corFundo === null) ? 0xf2ede0 : corFundo;
    const cacheKey = 'mostrador::' + cor.toString(16);
    let tex = this._texturaProceduralCache[cacheKey];
    if (tex) return tex;
    const CANVAS_PX = 256;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_PX; canvas.height = CANVAS_PX;
    const ctx = canvas.getContext('2d');
    // [16/09/2026 UTC] ALTERADO — pedido verbatim: "faça um arquivo
    // específico do projeto [...] para gerar a textura 2D do relógio
    // (colocando a sequência de comandos de canvas para gerá-lo) e carregue
    // para gerar a mesma imagem." Os comandos de canvas (fundo/moldura/12
    // marcações de hora) que antes moravam INLINE aqui foram extraídos pra
    // `assets/js/mostrador-canvas.js` (`window.MostradorCanvas.desenhar`,
    // carregado via `<script>` no index.html ANTES deste arquivo) — usado
    // tanto por esta função (textura ao vivo, `<canvas>` de navegador de
    // verdade) quanto pela ferramenta de geração de `.glb` do relógio
    // (`ferramentas/gerar_malhas.js`, textura ASSADA em PNG, rodando em
    // Node) — MESMO código-fonte, garantindo a MESMA imagem nos dois casos.
    const corHex = '#' + ('000000' + (cor >>> 0).toString(16)).slice(-6);
    window.MostradorCanvas.desenhar(ctx, CANVAS_PX, corHex);
    tex = new THREE.CanvasTexture(canvas);
    // Sem `repeat`/wrap especial — a textura cobre o disco inteiro de uma
    // vez só (UV padrão do `CylinderGeometry` já mapeia a face circular do
    // topo/base 1:1 num círculo centralizado no quadrado da textura, que é
    // exatamente como este canvas foi desenhado).
    this._texturaProceduralCache[cacheKey] = tex;
    return tex;
  }

  /** [13/09/2026] NOVO — "Teto de gesso com rodelas de acesso" (pedido do
   *  usuário: "teto de gesso com rodelas de acesso (gabinete/chefia)").
   *  Placa lisa branca (perfil-base, igual ao "Piso"/"Teto modular") +
   *  vários discos cinza-claro finos (cilindros achatados, 15cm de
   *  diâmetro × 1cm de espessura) colados na FACE DE BAIXO da placa,
   *  distribuídos num grid regular espaçado a cada 2 metros — simula as
   *  tampas circulares de acesso a fiação/dutos comuns nesse tipo de forro
   *  em salas de gabinete/chefia. Geometria simples (sem textura nenhuma,
   *  cumpre visualmente já só com a forma) — mesmo padrão dos outros
   *  builders dedicados deste arquivo (mesa/luminária/poste/escada): recebe
   *  `perfil` já resolvido (box, w/d/h da placa) e `baseY`, monta a placa +
   *  os discos como filhos de UM `THREE.Group`, registra esse grupo (não a
   *  placa sozinha) no pick/`_group`/`_pickMeshes` igual a qualquer objeto
   *  comum, pra continuar selecionável/arrastável do jeito de sempre. */
  _buildTetoGessoMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const matPlaca = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const placaGeo = new THREE.BoxGeometry(perfil.w, perfil.h, perfil.d);
    const placa = new THREE.Mesh(placaGeo, matPlaca);
    group.add(placa);
    // Rodelas de acesso: grid espaçado a cada 2m, começando perto de uma
    // borda (não centralizado exatamente na borda, pra não cortar metade da
    // rodela pra fora da placa) — mesma ideia do grid do retículo métrico
    // (`obj.reticuloMetrico`) logo abaixo neste arquivo, só que fixo em 2m
    // e sem opção de configurar (pedido não pediu controle nenhum pro
    // usuário aqui, só o efeito visual).
    if (!wireframe) {
      const ESPACAMENTO = 2; // metros
      const RAIO_RODELA = 0.075; // 15cm de diâmetro
      const ESPESSURA_RODELA = 0.01; // 1cm
      const matRodela = new THREE.MeshLambertMaterial({ color: 0xc7cbd1 });
      const rodelaGeo = new THREE.CylinderGeometry(RAIO_RODELA, RAIO_RODELA, ESPESSURA_RODELA, 16);
      const hw = perfil.w / 2, hd = perfil.d / 2;
      const margem = Math.min(ESPACAMENTO / 2, hw, hd);
      for (let x = -hw + margem; x <= hw - margem + 1e-6; x += ESPACAMENTO) {
        for (let z = -hd + margem; z <= hd - margem + 1e-6; z += ESPACAMENTO) {
          const rodela = new THREE.Mesh(rodelaGeo, matRodela);
          // Face de BAIXO da placa: -perfil.h/2 (centro da placa é y=0 no
          // espaço local do grupo) menos metade da espessura da rodela,
          // menos uma folga mínima só pra evitar z-fighting.
          rodela.position.set(x, -perfil.h / 2 - ESPESSURA_RODELA / 2 - 0.0005, z);
          group.add(rodela);
        }
      }
    }
    const centerY = baseY + perfil.y0 + perfil.h / 2;
    group.position.set(obj.x, centerY, obj.y);
    group.rotation.y = objAnguloToRotY(obj.angulo);
    this._group.add(group);
    const raioPick = Math.max(perfil.w || 0.5, perfil.d || 0.5) * 0.6;
    const objPos = { x: obj.x, y: centerY, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: raioPick, ref: obj, obb: { half: { x: perfil.w / 2, y: perfil.h / 2, z: perfil.d / 2 }, rotY: group.rotation.y, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    group.userData.pick = objPick;
    this._pickMeshes.push(group);
    if (Array.isArray(obj.components) && obj.components.some((c) => c.type === 'Script' && c.enabled !== false)) this._tagScriptBase(group, obj, baseY);
  }

  /** [13/09/2026] NOVO — "carro dirigível" (pedido verbatim: "Faça um
   *  carro, que é possível entrar nele e sair andando [...] Deve ter
   *  rodas, vidros e um formato de carro de verdade"). Geometria composta
   *  com THREE puro, mesmo padrão dos outros builders bespoke deste
   *  arquivo (mesa/luminária/poste/escada/teto-gesso — TODAS malhas filhas
   *  de um único `THREE.Group`, registrado inteiro em `pickables`/
   *  `_pickMeshes` como se fosse UMA peça só, igual `_buildTetoGessoMesh`
   *  logo acima):
   *    - Carroceria: 1 caixa larga (base, `perfil.w x perfil.h x perfil.d`
   *      — perfil vem de `OBJECT3D_PROFILES.carro`, engine3d-profiles.js:
   *      1.75 x 1.4 x 4.3m por padrão) + 1 caixa mais estreita/baixa por
   *      cima simulando a cabine/teto (proporção fixa: 70% da largura, 45%
   *      do comprimento, 45% da altura da base — não configurável por
   *      instância nesta rodada, mesmo espírito "1 forma plausível, não um
   *      modelo fiel por tipo" documentado no topo de engine3d-profiles.js).
   *    - 4 rodas: cilindros pretos nos 4 cantos inferiores da carroceria,
   *      raio 0.32m / largura(altura do cilindro) 0.22m, EIXO alinhado ao
   *      comprimento do carro (CylinderGeometry nasce com o eixo em Y —
   *      girado 90° em Z pra "deitar", ficando com o eixo ao longo de X
   *      local do carro, que é a LARGURA — mesma convenção w=eixo local X/
   *      d=eixo local Z de todo objeto 'retangulo' deste arquivo, ver
   *      `objAnguloToRotY`).
   *    - "Vidros": planos finos (BoxGeometry bem fina, não PlaneGeometry —
   *      evita o problema de um Plane ficar invisível vista de trás/de
   *      lado por causa de backface culling, já que o jogador pode olhar o
   *      carro de qualquer ângulo) nas 2 laterais + frente + trás da
   *      cabine, material `MeshLambertMaterial({color:0x88bbdd,
   *      transparent:true, opacity:0.4})` — pedido verbatim de cor/opacidade.
   *  Cor da carroceria/cabine: `obj.cor` (mesmo campo hex de sempre,
   *  retângulo/polígono) se definido, senão `perfil.color` (vermelho
   *  default do profile, já passado por `_tintForLight` pelo chamador).
   *  Registrado no pick/`_pickMeshes` (clicável — `carro.model.js` usa
   *  `onModelClick` pra entrar no carro, ver `view3d.js
   *  _entrarNoCarro`). LIMITAÇÃO — ver comentário grande em
   *  `_updateCarrosControlados` (view3d.js) pra tudo que este carro NÃO
   *  faz ainda (colisão contra paredes, suspensão/inclinação em curva). */
  _buildCarroMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const corCarroceria = obj.cor ? _hexToThreeColor(obj.cor) : perfil.color;
    const matCarroceria = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: corCarroceria });

    // Carroceria (base) — apoiada no chão (y local 0 = topo das rodas,
    // ver `alturaRoda` abaixo definir onde a base do carro fica).
    const raioRoda = 0.32, larguraRoda = 0.22;
    const alturaCarroceria = perfil.h; // 1.4m default
    const yCarroceriaBase = raioRoda * 0.75; // carroceria fica um pouco acima do centro da roda, "encaixada" nela
    const carroceriaGeo = new THREE.BoxGeometry(perfil.w, alturaCarroceria, perfil.d);
    const carroceria = new THREE.Mesh(carroceriaGeo, matCarroceria);
    carroceria.position.set(0, yCarroceriaBase + alturaCarroceria / 2, 0);
    group.add(carroceria);

    // Cabine/teto — caixa mais estreita/baixa, centralizada e puxada um
    // pouco pra trás do centro (proporção fixa documentada no comentário
    // grande acima do método).
    const cabineW = perfil.w * 0.7, cabineD = perfil.d * 0.45, cabineH = alturaCarroceria * 0.45;
    const cabineGeo = new THREE.BoxGeometry(cabineW, cabineH, cabineD);
    const cabine = new THREE.Mesh(cabineGeo, matCarroceria);
    const yCabineBase = yCarroceriaBase + alturaCarroceria; // apoiada no topo da carroceria
    cabine.position.set(0, yCabineBase + cabineH / 2, -perfil.d * 0.05); // leve deslocamento pra trás
    group.add(cabine);

    // 4 rodas — cantos inferiores da carroceria, giradas 90° em Z (eixo do
    // cilindro passa a apontar ao longo de X local, "deitando" a roda).
    if (!wireframe) {
      const matRoda = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
      const rodaGeo = new THREE.CylinderGeometry(raioRoda, raioRoda, larguraRoda, 16);
      const offsetX = perfil.w / 2 - larguraRoda * 0.15; // roda quase na borda externa da carroceria
      const offsetZ = perfil.d / 2 - raioRoda * 1.1; // um pouco pra dentro das extremidades dianteira/traseira
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const roda = new THREE.Mesh(rodaGeo, matRoda);
          roda.rotation.z = Math.PI / 2;
          roda.position.set(sx * offsetX, raioRoda, sz * offsetZ);
          group.add(roda);
        }
      }
    }

    // "Vidros" — 4 placas finas (BoxGeometry, não Plane — ver comentário
    // grande acima do método) nas laterais/frente/trás da cabine.
    if (!wireframe) {
      const matVidro = new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.4 });
      const ESPESSURA = 0.02;
      const yVidro = yCabineBase + cabineH / 2;
      // Laterais (esquerda/direita) — placa fina ao longo de Z (comprimento
      // da cabine), quase da largura total da cabine.
      const vidroLatGeo = new THREE.BoxGeometry(ESPESSURA, cabineH * 0.65, cabineD * 0.9);
      for (const sx of [-1, 1]) {
        const vidro = new THREE.Mesh(vidroLatGeo, matVidro);
        vidro.position.set(sx * (cabineW / 2 - ESPESSURA / 2), yVidro, cabine.position.z);
        group.add(vidro);
      }
      // Frente/trás — placa fina ao longo de X (largura da cabine).
      const vidroFrenteGeo = new THREE.BoxGeometry(cabineW * 0.85, cabineH * 0.6, ESPESSURA);
      for (const sz of [-1, 1]) {
        const vidro = new THREE.Mesh(vidroFrenteGeo, matVidro);
        vidro.position.set(0, yVidro, cabine.position.z + sz * (cabineD / 2 - ESPESSURA / 2));
        group.add(vidro);
      }
    }

    const centerY = baseY + perfil.y0; // grupo já tem a geometria toda posicionada relativa ao chão (y local 0 = chão)
    group.position.set(obj.x, centerY, obj.y);
    group.rotation.y = objAnguloToRotY(obj.angulo);
    this._group.add(group);
    const alturaTotal = yCabineBase + cabineH;
    const raioPick = Math.max(perfil.w, perfil.d) * 0.6;
    const objPos = { x: obj.x, y: centerY + alturaTotal / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: raioPick, ref: obj, obb: { half: { x: perfil.w / 2, y: alturaTotal / 2, z: perfil.d / 2 }, rotY: group.rotation.y, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    group.userData.pick = objPick;
    this._pickMeshes.push(group);
    // Guarda a referência do Group real desta instância pra
    // `view3d._updateCarroCamera`/física poderem reposicionar o carro TODO
    // quadro enquanto controlado (ver `entity._velocidade` em
    // `_updateCarrosControlados`, view3d.js) sem precisar reconstruir a
    // cena a cada frame — mesmo espírito de `_camPs1RefsById`/refs vivas já
    // usadas por câmera/relógio neste arquivo. [correção 13/09/2026] Guarda
    // em `this._carroRefsById` (por id), NÃO em `obj` — ver comentário
    // grande em `setScene` sobre `_doorRuntime`/por que anexar um
    // THREE.Group direto na entidade persistida quebrava o IndexedDB.
    this._carroRefsById[obj.id] = group;
    // [13/09/2026] SEMPRE marcado (diferente do `if (temScriptAtivo)`
    // condicional usado pelos outros builders acima) — um carro não
    // precisa de nenhum `ScriptComponent` pra se mover: a física de
    // inércia (`view3d.js _updateCarrosControlados`) muda `obj.x`/`obj.y`/
    // `obj.angulo` diretamente enquanto o jogador dirige, e reaproveitar
    // `_syncScriptedObjectTransforms` (chamado TODO quadro por
    // `_updateScriptLifecycle`, ver lá) já resolve "refletir esses valores
    // na malha de verdade" de graça, sem precisar duplicar a lógica de
    // reposicionamento aqui.
    this._tagScriptBase(group, obj, baseY);
  }

  /** Constrói a malha de UM objeto e a registra em `this._group`/
   *  `this.pickables`/`this._pickMeshes` — corpo do laço `mapData.objects`
   *  de `setScene` acima, extraído pra um método próprio (pedido do
   *  usuário, 25/08/2026 — ver `addObjectIncremental` logo abaixo) pra
   *  poder ser chamado tanto dali (montagem da cena INTEIRA) quanto na
   *  colocação incremental de UM objeto novo, sem duplicar a lógica. */
  /** [15/09/2026 UTC] NOVO — pedido verbatim: "Ainda falta poder girar no z
   *  e no x. Atualmente só aparece para girar no y. A escala (x, y e z)
   *  não está aparecendo também. E deve ser aplicado em tempo real." CAUSA
   *  RAIZ: `obj.customMeshXform` (rotX/rotZ/scaleX/Y/Z) só era lido/
   *  aplicado dentro de `_buildCustomMeshObject` — ou seja, só pra objetos
   *  com malha editada vértice-a-vértice no Modelador (`obj.customMesh`).
   *  Um objeto comum do catálogo (Mesa/Cadeira/Armário/etc., a ESMAGADORA
   *  MAIORIA) nunca tinha rotX/rotZ/escala aplicados de jeito NENHUM, não
   *  importa o que fosse salvo em `customMeshXform` — por isso a UI
   *  (`ModelerUI.buildStandaloneObjectTransformPanel`) nem mostrava esses
   *  campos pra eles (`temMalha` = `!!obj.customMesh`).
   *
   *  CORREÇÃO: este método virou um WRAPPER fino em volta do antigo corpo
   *  (renomeado pra `_buildOneObjectMeshCore`, INTOCADO — todo o resto do
   *  dispatch continua 100% igual) — mesmo padrão JÁ usado neste arquivo
   *  por `_applyObjMaterialOverride` (ver logo abaixo, chamado do MESMO
   *  jeito no laço de `setScene`): mede quantos filhos `this._group` tinha
   *  ANTES de construir a malha deste objeto, constrói normalmente, e
   *  DEPOIS aplica rotX/rotZ/escala (se houver) em CIMA de TODOS os nós de
   *  topo que a construção acabou de acrescentar — funciona pra QUALQUER
   *  builder (perfil genérico com 1 malha, Mesa/Cadeira/Pilar com várias
   *  malhas soltas, `.glb`/`.obj` importado com um `THREE.Group` inteiro),
   *  sem precisar adaptar cada um deles individualmente. `obj.customMesh`
   *  é excluído aqui de propósito (`_applyObjectExtraTransform` já checa
   *  isso) — aquele caminho já aplica `customMeshXform` do jeito certo
   *  (baked direto nos vértices, `_buildCustomMeshObject`), aplicar de novo
   *  aqui por cima duplicaria a transformação. */
  _buildOneObjectMesh(obj, wireframe, colWireframe) {
    const childrenBefore = this._group.children.length;
    const baseYExtra = (obj.piso || 0) * (this.mapData?.alturaPiso || 2.8) + (obj.elevacao || 0);
    this._buildOneObjectMeshCore(obj, wireframe, colWireframe);
    this._applyObjectExtraTransform(obj, baseYExtra, childrenBefore);
  }

  /** Aplica `obj.customMeshXform.{rotX,rotZ,scaleX,scaleY,scaleZ}` (rotY
   *  já é tratado à parte via `obj.angulo`, de sempre) em cima de TODOS os
   *  nós de topo que `_buildOneObjectMeshCore` acabou de acrescentar em
   *  `this._group` — ver comentário grande no wrapper `_buildOneObjectMesh`
   *  acima pro motivo completo. Gira/escala em torno do PIVÔ do objeto
   *  (`obj.x`, `baseY`, `obj.y` — o "pé" dele, não o centro geométrico da
   *  malha, que este método não conhece de forma genérica pra todo tipo de
   *  builder) — aproximação aceitável (tombar um objeto pela base é o
   *  comportamento mais previsível pra maioria dos casos, ex. "quero essa
   *  luminária inclinada"), documentada aqui em vez de escondida. LIMITAÇÃO
   *  CONHECIDA: os `obb`/`radius` já registrados em `pickables` (área de
   *  clique) NÃO são recalculados pra refletir a escala/rotação extra — a
   *  detecção de clique pode ficar um pouco desalinhada da malha visual
   *  depois de uma escala grande; sem navegador pra testar/calibrar isso ao
   *  vivo nesta sessão, preferi não arriscar uma fórmula nova de bounding
   *  box errada silenciosamente. */
  _applyObjectExtraTransform(obj, baseY, childrenBefore) {
    if (!obj || !this._group || obj.customMesh) return;
    const xf = obj.customMeshXform;
    if (!xf) return;
    const rotX = xf.rotX || 0, rotZ = xf.rotZ || 0;
    const scaleX = xf.scaleX ?? 1, scaleY = xf.scaleY ?? 1, scaleZ = xf.scaleZ ?? 1;
    if (!rotX && !rotZ && scaleX === 1 && scaleY === 1 && scaleZ === 1) return; // caso comum (sem transformação extra) — zero custo, zero mudança
    const THREE = this.THREE;
    const pivot = new THREE.Vector3(obj.x, baseY, obj.y);
    const scaleVec = new THREE.Vector3(scaleX, scaleY, scaleZ);
    const extraQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, 0, rotZ, 'XYZ'));
    const novos = this._group.children.slice(childrenBefore);
    novos.forEach((node) => {
      if (!node) return;
      const offset = node.position.clone().sub(pivot);
      offset.multiply(scaleVec);
      offset.applyQuaternion(extraQuat);
      node.position.copy(pivot).add(offset);
      node.scale.multiply(scaleVec);
      node.quaternion.premultiply(extraQuat);
    });
  }

  /** [16/09/2026 UTC] NOVO — ver comentário grande em `_buildOneObjectMeshCore`
   *  logo abaixo (bloco "escada deve continuar sendo gerada por código").
   *  Mesma lógica de `Modeler3D._escadaFoiModificada` (js/modeler/
   *  modeler-core.js) — mantida duplicada de propósito, ver ali. */
  _escadaFoiModificada(obj) {
    const perfil = (typeof OBJECT3D_PROFILES !== 'undefined' && OBJECT3D_PROFILES.escada) || {};
    const larguraPadrao = perfil.w ?? 1.3;
    const profundidadePadrao = perfil.d ?? 3.0;
    if (obj.largura && Math.abs(obj.largura - larguraPadrao) > 1e-6) return true;
    if (obj.profundidade && Math.abs(obj.profundidade - profundidadePadrao) > 1e-6) return true;
    if (obj.escadaDegraus != null && obj.escadaDegraus !== '') {
      const alturaTotal = obj.alturaEscada || this.mapData?.alturaPiso || perfil.h || 2.8;
      const degrausPadrao = Math.round(alturaTotal / 0.18) || 11;
      if (Math.round(obj.escadaDegraus) !== degrausPadrao) return true;
    }
    if (obj.alturaEscada && perfil.h && Math.abs(obj.alturaEscada - perfil.h) > 1e-6) return true;
    return false;
  }

  _buildOneObjectMeshCore(obj, wireframe, colWireframe) {
    const THREE = this.THREE;
    // `obj.elevacao` (metros ACIMA do chão do piso, distinto de `obj.piso`
    // que é o NÚMERO do piso/andar) — pedido do usuário: "ao mirar em cima
    // da mesa, deve ser possível colocar coisas em cima dela" (a mira
    // manda a altura de onde bateu, ver view3d.js raycastSurface) e
    // "a luminária... por padrão, ela fica a 3 metros do chão" (ver
    // Mapping.addObject). 0 por padrão = comportamento de sempre (chão).
    const baseY = (obj.piso || 0) * (this.mapData?.alturaPiso || 2.8) + (obj.elevacao || 0);
    // Malha CUSTOMIZADA (pedido do usuário, 28/08/2026 — "Modelador 3D", ver
    // js/modeler/*.js): objeto modelado vértice-a-vértice pelo usuário (ao
    // invés de uma das formas fixas de OBJECT3D_PROFILES/retangulo/poligono
    // abaixo). Checado ANTES de qualquer outro ramo (imagem/retângulo/
    // polígono/tipo de catálogo) — um objeto com `customMesh` sempre usa
    // esta malha, mesmo que também tenha `forma:'retangulo'` (guardado só
    // pra manter o 2D — planta baixa, vista de cima — desenhando um
    // retângulo/bounding-box plausível, ver mapview.js _openModelerFromPanel/
    // Modeler3D). Objetos SEM `customMesh` (a esmagadora maioria, incluindo
    // TODO objeto salvo antes desta rodada) não entram aqui — retrocompatibilidade
    // total com o resto do método abaixo, inalterado.
    if (obj.customMesh && Array.isArray(obj.customMesh.vertices) && obj.customMesh.vertices.length >= 3) {
      this._buildCustomMeshObject(obj, baseY, wireframe, colWireframe);
      return;
    }
    // NOVO (01/09/2026), item GRANDE #5 do pedido de 12 itens: "Deve ser
    // possível editar o modelo dos objetos 3D padrão." Checado logo depois
    // do `customMesh` de objeto único acima (que continua tendo prioridade
    // MÁXIMA — um objeto modelado individualmente nunca é substituído pelo
    // molde do seu tipo) e ANTES de imagem/objeto .obj/perfil — um TIPO com
    // molde customizado (`this._objectModelsByTipo[obj.tipo]`, ver
    // `_carregarObjectModels`/`DB.getObjectModel`) vale pra TODO objeto
    // daquele tipo no mapa, mesmo os que foram desenhados como
    // retângulo/polígono (mesa/coluna — ver comentário grande em
    // `_buildTypeMoldeMesh`) — decisão do usuário (AskUserQuestion): "Todos
    // os 33 tipos (Recomendado) — incluindo mesa/luminária/poste [que] já
    // têm construtores dedicados; quando customizados via o novo editor, o
    // modelo customizado passa a valer, sobrepondo até o construtor
    // dedicado". `obj.tipo` de imagem colada/objeto .obj nunca bate uma
    // chave de `OBJECT3D_PROFILES` (checagem implícita dentro do `if`, via
    // `this._objectModelsByTipo[obj.tipo]` só existir pros 33 tipos reais),
    // então esses dois ramos abaixo continuam intocados.
    if (this._objectModelsByTipo[obj.tipo] && (this._objectModelsByTipo[obj.tipo].detalhado || this._objectModelsByTipo[obj.tipo].lowpoly)) {
      this._buildTypeMoldeMesh(obj, baseY, wireframe, colWireframe);
      return;
    }
    // [13/09/2026] NOVO — pedido verbatim: "Implemente um pipeline de
    // carregamento de modelo (ex. GLTFLoader do three.js) e um novo campo
    // no perfil tipo modeloArquivo: 'monitor.glb', com fallback pra
    // geometria procedural atual quando o arquivo não existir." Ver
    // comentário grande no topo de `js/model3dloader.js` (`window.
    // Model3DLoader`, novo) pra formato/limitações do arquivo importado.
    // `obj.modeloArquivo` (por OBJETO, prioridade máxima, mesmo espírito de
    // `obj.customMesh`) OU `OBJECT3D_PROFILES[obj.tipo]?.modeloArquivo`
    // (por TIPO — o pedido original, "campo no perfil") — checado DEPOIS
    // do molde customizado do Modelador embutido acima (`_objectModelsByTipo`)
    // de propósito: um molde já desenhado/editado dentro do próprio app
    // continua tendo prioridade sobre um arquivo externo pro MESMO tipo,
    // evitando o susto de "editei o molde no Modelador e não mudou nada" se
    // alguém também tiver um `modeloArquivo` configurado. `hasModel` só
    // devolve `true` se `Model3DLoader.preloadAll()` (chamado por
    // `view3d.js` _rebuildScene ANTES deste `setScene`) já tiver parseado
    // esse arquivo com sucesso — arquivo nunca importado, removido, OU que
    // falhou ao parsear caem, SEM avisar/travar nada, na geometria
    // procedural de sempre logo abaixo (exatamente o "fallback" pedido).
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Sobre o objeto escada, ele
    // deve continuar sendo gerado por código [...] Se a escada não for
    // modificada, então ela carrega o modelo que veio do arquivo." Sem esta
    // checagem, os 3 blocos de malha ESTÁTICA logo abaixo (.glb/.obj) já
    // dariam `return` pra QUALQUER escada assim que `escada.malha.js`/
    // `escada.glb.js` existisse — nunca chegando no `_buildEscadaMesh`
    // procedural mais abaixo, mesmo quando a escada tem largura/
    // profundidade/nº de degraus alterados do padrão do catálogo (o que a
    // malha estática, fixa, não consegue refletir). `_escadaFoiModificada`
    // espelha a MESMA lógica usada em `js/modeler/modeler-core.js`
    // (`Modeler3D._escadaFoiModificada`) — mantidas separadas (arquivos/
    // módulos diferentes) de propósito, sem introduzir uma dependência
    // cruzada nova entre engine3d.js e o Modelador.
    const _escadaModificadaAgora = obj.tipo === 'escada' && this._escadaFoiModificada(obj);
    if (!_escadaModificadaAgora) {
    const modeloArquivoNome = obj.modeloArquivo || OBJECT3D_PROFILES[obj.tipo]?.modeloArquivo;
    if (modeloArquivoNome && window.Model3DLoader?.hasModel?.(modeloArquivoNome)) {
      this._buildModeloArquivoMesh(obj, baseY, wireframe, colWireframe, modeloArquivoNome, window.Model3DLoader);
      return;
    }
    }
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Implemente o ObjMeshSource
    // para .glb como você mencionou." MESMO bloco do Model3DLoader acima,
    // só que pra `.glb` ESTÁTICO/EMBUTIDO no próprio projeto (ver
    // js/glbmeshsource.js) em vez de importado pelo usuário em tempo de
    // execução — checado DEPOIS do Model3DLoader (um `.glb` importado pelo
    // usuário pelo cartão do objeto continua tendo prioridade máxima sobre
    // o `.glb` padrão do tipo, mesma lógica de "o que já foi customizado
    // manualmente vence") e ANTES da malha `.obj` estática (um `.glb`, com
    // material PBR/emissivo/textura embutida de verdade, é estritamente
    // "melhor" que `.obj`+`.mtl` quando os dois existem pro mesmo tipo —
    // ver tabela de limitações em assets/obj/conversor-obj-js.html). MESMO
    // tratamento de `y0` (objeto "flutuante" tipo monitor/interruptor) do
    // bloco de malha `.obj` logo abaixo, mesmo motivo.
    if (!_escadaModificadaAgora) {
      const nomeGlb = obj.modeloGlbEstatico || OBJECT3D_PROFILES[obj.tipo]?.modeloGlbEstatico || obj.tipo;
      if (nomeGlb && window.GlbMeshSource?.hasModel?.(nomeGlb)) {
        const y0Perfil = OBJECT3D_PROFILES[obj.tipo]?.y0 || 0;
        this._buildModeloArquivoMesh(obj, baseY + y0Perfil, wireframe, colWireframe, nomeGlb, window.GlbMeshSource);
        return;
      }
    }
    // [15/09/2026 UTC] NOVO — pedido verbatim: "A malha do objeto (o '.obj'
    // dele) deve ficar em um arquivo separado e ser endereçado em
    // '<nome-do-modelo>.model.js' [...]". MESMO bloco acima, só que pra
    // malha `.obj` ESTÁTICA (ver js/objmeshsource.js) em vez de `.glb`
    // importado pelo usuário em tempo de execução — daí reaproveitar o
    // MESMO `_buildModeloArquivoMesh` de baixo (agora recebe o "loader"
    // como parâmetro, em vez de sempre `window.Model3DLoader` fixo, pra
    // não duplicar toda a lógica de posicionar/pickable/wireframe/escala
    // só porque a ORIGEM da malha é outra). `ObjMeshSource.hasModel` só
    // devolve `true` depois de `ensureMeshesReadyForMap` (chamado por
    // view3d.js `_rebuildScene` ANTES deste `setScene`, mesmo espírito de
    // `Model3DLoader.preloadAll` acima) — arquivo `.malha.js` ausente cai,
    // sem avisar/travar nada, na geometria procedural de sempre abaixo.
    if (!_escadaModificadaAgora) {
      const nomeMalha = obj.modeloMalhaEstatica || OBJECT3D_PROFILES[obj.tipo]?.modeloMalhaEstatica || obj.tipo;
      if (nomeMalha && window.ObjMeshSource?.hasModel?.(nomeMalha)) {
        // [15/09/2026 UTC] NOVO — pedido verbatim (rodada "malha estática
        // sem perdas nem limitações"): objetos de parede/elevados
        // (OBJECT3D_PROFILES[tipo].y0 > 0, ex. monitor/interruptor/quadro)
        // ficavam grudados no CHÃO quando convertidos pra malha estática —
        // `_buildModeloArquivoMesh` sempre reencosta o Y mínimo da malha em
        // `baseY`, sem saber que aquele tipo "flutua" a `y0` metros do chão
        // (o ramo genérico de caixa/cilindro/cone, mais abaixo, sempre soma
        // `perfil.y0` em `centerY` — a malha estática não tinha o mesmo
        // tratamento). Soma o `y0` do PERFIL do tipo (mesma fonte que o ramo
        // genérico usa) no `baseY` só pra este posicionamento — não afeta
        // nenhum outro tipo/ramo, nem objetos com y0:0 (a maioria).
        const y0Perfil = OBJECT3D_PROFILES[obj.tipo]?.y0 || 0;
        this._buildModeloArquivoMesh(obj, baseY + y0Perfil, wireframe, colWireframe, nomeMalha, window.ObjMeshSource);
        return;
      }
    }
    // "Imagem" (colar/carregar, ver mapview.js) — malha BEM diferente das
    // outras (uma folha deitada com a imagem de verdade, não uma caixa) —
    // resolvida à parte, com `return` antecipado, ANTES do resto do
    // `perfil` de caixa/cilindro abaixo (pedido do usuário, 25/08/2026:
    // "o objeto imagem deve aparecer também [no 3D]" — antes caía sem
    // querer no perfil GENÉRICO cinza de OBJECT3D_DEFAULT_PROFILE, do
    // tamanho fixo errado, ver _buildImagemMesh).
    if (obj.forma === 'imagem') { this._buildImagemMesh(obj, baseY); return; }
    // Objeto importado de .obj (pedido do usuário, rodada 51: "Deve ser
    // possível carregar arquivos .obj de modo que sejam incorporados ao
    // app [...] um botão de importar .obj para que apareça junto com os
    // demais objetos") — `obj.tipo` é a chave em memória do arquivo
    // importado (`ObjImport.isCustomKey`, ver js/objimport.js), NUNCA salva
    // em disco de propósito ("fica na memória RAM, enquanto a página não
    // der refresh") — se o mapa for recarregado depois de um refresh sem
    // reimportar o mesmo .obj, `ObjImport.getGeometryData` devolve `null` e
    // este objeto cai no perfil genérico cinza (OBJECT3D_DEFAULT_PROFILE,
    // ramo comum logo abaixo) em vez de sumir/travar.
    if (window.ObjImport?.isCustomKey(obj.tipo) && this._buildObjImportMesh(obj, baseY, wireframe, colWireframe)) return;
    let perfil;
    if (obj.forma === 'retangulo') {
      perfil = { shape: 'box', w: obj.largura || 0.5, d: obj.profundidade || 0.5, h: obj.altura || 0.5, y0: 0, color: _hexToThreeColor(obj.cor) };
      // NOVO (03/09/2026), pedido verbatim: "a representação 3D [do
      // Retículo métrico] deve ser com as mesmas dimensões do 2D e a
      // medida de volume deve ser 1mm." Largura/profundidade (w/d) já vêm
      // certas (mesmos `obj.largura`/`obj.profundidade` usados pra desenhar
      // o retângulo no 2D, ver mapview.js _drawFormaShape) — só a altura
      // (h) é sobrescrita pra 1mm, virando uma "placa" fina em vez de um
      // bloco de meio metro.
      // [09/09/2026] Bug relatado pelo usuário: "ao mudar a altura do
      // 'Retículo métrico' na janela de propriedades dele, ao clicar em
      // 'Ver em 3D' essa altura não é refletida na posição vertical do
      // retículo na cena 3D." O campo "Altura (m)" do painel (ver
      // mapview.js _openObjectPanel, `#obj-altura`, salva em `obj.altura`)
      // é o MESMO usado como espessura do bloco pra um retângulo comum —
      // mas o retículo já tem espessura fixa em 1mm (linha acima), então
      // esse valor ficava sem nenhum uso pra ele (nem 2D, que é vista de
      // cima, nem 3D). Reaproveitado aqui como ELEVAÇÃO (posição vertical
      // acima do chão, `perfil.y0` — mesmo campo que já empurra pra cima
      // objetos como a imagem/luminária de teto, ver `centerY = baseY +
      // perfil.y0 + perfil.h/2` logo abaixo), que é a única leitura que faz
      // sentido pro usuário pra uma "placa" fininha.
      if (obj.reticuloMetrico) { perfil.h = 0.001; perfil.y0 = obj.altura || 0; }
    } else if (obj.forma === 'poligono') {
      perfil = { shape: 'cylinder', r: obj.raio || 0.3, h: obj.altura || 0.5, y0: 0, color: _hexToThreeColor(obj.cor), segments: Math.max(3, Math.round(obj.lados || 24)) };
    } else {
      perfil = OBJECT3D_PROFILES[obj.tipo] || OBJECT3D_DEFAULT_PROFILE;
    }
    // Modo "leve" de luminárias (ver _tintForLight/mapconfig.js) — clareia
    // a cor deste objeto se ele cair no alcance de alguma luminária. Clona
    // `perfil` (spread) antes de mexer na cor: quando ele veio da tabela
    // fixa (`OBJECT3D_PROFILES[obj.tipo]`, acima) é uma referência
    // COMPARTILHADA entre todo objeto daquele tipo — mutar `.color` direto
    // nela vazaria a cor clareada pros próximos objetos do mesmo tipo,
    // mesmo os longe de qualquer luminária. `this._luzesLeves` é sempre a
    // lista calculada no ÚLTIMO `setScene` completo (ver lá) — numa
    // colocação incremental (`addObjectIncremental`) ela pode estar
    // levemente desatualizada se o objeto novo FOR uma luminária (a luz
    // dele só passa a "clarear" objetos vizinhos na próxima reconstrução
    // completa da cena) — comportamento aceito de propósito, documentado
    // em `addObjectIncremental`.
    perfil = { ...perfil, color: this._tintForLight(perfil.color, obj.x, baseY, obj.y) };
    // Destaque de "item associado" (obj.itemId) — pedido do usuário
    // (26/08/2026), ver _addItemAssociadoDestaque. Chamado AQUI (antes dos
    // ramos especiais de mesa/luminária abaixo, que fazem `return` cedo) pra
    // valer pra QUALQUER tipo de objeto com uma única chamada, usando só a
    // caixa delimitadora aproximada do `perfil` — não depende da malha exata
    // de cada tipo (pernas de mesa, tubos de luminária etc.). Objetos do
    // tipo 'imagem' ficam de fora de propósito (já retornaram mais acima,
    // antes do `perfil` existir) — combinação rara o bastante (foto de
    // catálogo associada a OUTRO item) pra não valer a complexidade extra.
    this._addItemAssociadoDestaque(obj, perfil, baseY);
    // [13/09/2026] NOVO — pedido verbatim: "Coloque este mesmo detalhe no
    // objeto [...] algo que fique em cima do objeto [...] indicando que foi
    // colocado algo no seu histórico [...] Tem que ser algo bem simples."
    // Ver _addHistoricoDestaque abaixo (mesmo padrão de sprite-selo de
    // _addItemAssociadoDestaque acima, só que mais simples: um pontinho só,
    // sem contorno/flags).
    this._addHistoricoDestaque(obj, perfil, baseY);
    // Mesa: 4 pernas + tampo fino, não um bloco sólido — pedido do
    // usuário ("faça o 3D da mesa com 4 pernas de mesa e um tampo de
    // mesa, para que pareça uma e não um cubo"). Colocar uma mesa pelo
    // painel de Objetos sempre vira uma forma 'retangulo' por baixo dos
    // panos (ver mapview.js _MESA_FORMA_DEF), então `perfil.shape` já é
    // sempre 'box' aqui pra ela — a checagem é só defensiva.
    if (obj.tipo === 'mesa' && perfil.shape === 'box') {
      this._buildMesaMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    // [15/09/2026 UTC] NOVO — pedido verbatim: "faça dois novos objetos:
    // 'Mesa' e 'Pilar' [...] O objeto 'Pilar' deve ter a altura que define
    // a distância entre um andar e outro." Builder DEDICADO (em vez de
    // cair no ramo genérico logo abaixo, que usaria `perfil.h` — um valor
    // FIXO de fábrica) só pra poder ler `this.mapData?.alturaPiso` (a
    // distância de VERDADE entre andares deste mapa, configurável) na hora
    // de montar a malha — mesmo motivo/mesma técnica de `_buildEscadaMesh`
    // (`alturaTotal = obj.alturaEscada || this.mapData?.alturaPiso || 2.8`).
    if (obj.tipo === 'pilar' && perfil.shape === 'box') {
      this._buildPilarMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    // [15/09/2026 UTC] NOVO — pedido verbatim: "Faça um modelo 3D
    // diferente para a cadeira (substituindo-o), faça uma 'cadeira de
    // verdade' com pernas e encosto. Não uma caixa genérica como é
    // atualmente." Builder DEDICADO (mesmo padrão de mesa/pilar acima —
    // várias `Mesh` soltas, sem `THREE.Group`), ver `_buildCadeiraMesh`.
    // Checagem defensiva de shape:'box' igual às outras dedicadas.
    if (obj.tipo === 'cadeira' && perfil.shape === 'box') {
      this._buildCadeiraMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    // [15/09/2026 UTC] NOVO — pedido verbatim: "Faça o mesmo para o
    // vaso." Builder DEDICADO (vaso de terracota + folhagem em cima, em
    // vez do cone verde solto saindo do chão), ver `_buildPlantaMesh`.
    // Checagem defensiva de shape:'cone' (perfil.planta), mesmo padrão das
    // outras dedicadas acima.
    if (obj.tipo === 'planta' && perfil.shape === 'cone') {
      this._buildPlantaMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    // Luminária: 2 tubos fluorescentes + folha metálica + caixas nas
    // pontas, mais uma luz de verdade — pedido do usuário ("faça uma
    // luminária com aquelas lâmpadas fluorescentes longas... Faça o 3D
    // bem feito"). Mesma checagem defensiva de shape:'box' da mesa acima.
    if (obj.tipo === 'luminaria' && perfil.shape === 'box') {
      this._buildLuminariaMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    // Poste de iluminação pública (NOVO, 01/09/2026, item #11 do pedido de
    // 12 itens) — haste + braço + luminária na ponta, mais uma luz de
    // verdade — mesmo padrão de mesa/luminária acima. Checagem defensiva de
    // shape:'cylinder' igual às duas de cima (perfil.poste, engine3d-profiles.js).
    if (obj.tipo === 'poste' && perfil.shape === 'cylinder') {
      this._buildPosteMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    // Escada paramétrica (NOVO, 01/09/2026, "itens grandes" — ver comentário
    // grande em _buildEscadaMesh, abaixo). Mesma checagem defensiva de
    // shape:'box' das outras dedicadas (mesa/luminária) acima.
    if (obj.tipo === 'escada' && perfil.shape === 'box') {
      this._buildEscadaMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    // Relógio (CORRIGIDO 15/09/2026 — bug confirmado pelo usuário: "Os
    // relógios... ficam deitados... é só girar o relógio para que fique na
    // parede"). Antes deste `if`, o relógio caía no ramo genérico logo
    // abaixo, que monta um CylinderGeometry cru só com `mesh.rotation.y =
    // objAnguloToRotY(obj.angulo)` — como o eixo do CylinderGeometry é Y por
    // padrão, isso deixa o disco DEITADO (mostrador virado pro teto/chão,
    // igual uma moeda em cima de uma mesa), nunca DE PÉ contra a parede,
    // não importa o ângulo. Mesma checagem defensiva de shape:'cylinder' já
    // usada por poste/robô acima. Ver `_buildRelogioMesh` pra rotação
    // corrigida + ponteiros animados (tempo real do prédio).
    if (obj.tipo === 'relogio' && perfil.shape === 'cylinder') {
      this._buildRelogioMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    // Porta-retrato de mesa (NOVO, 15/09/2026) — único tipo do catálogo com
    // uma inclinação FIXA (~12°) simulando o objeto "em pé" apoiado numa
    // superfície, tipo um porta-retrato de verdade encostado pra trás.
    // Mesma checagem defensiva de shape:'box' de mesa/luminária/escada
    // acima.
    if (obj.tipo === 'quadro-mesa' && perfil.shape === 'box') {
      this._buildQuadroMesaMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    // Teto de gesso com rodelas de acesso (NOVO, 13/09/2026 — pedido do
    // usuário). Mesma checagem defensiva de shape:'box' das outras
    // dedicadas acima.
    if (obj.tipo === 'teto-gesso' && perfil.shape === 'box') {
      this._buildTetoGessoMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    // Carro dirigível (NOVO, 13/09/2026 — pedido verbatim: "Faça um carro
    // [...] Deve ter rodas, vidros e um formato de carro de verdade").
    // Mesma checagem defensiva de shape:'box' das outras bespoke acima.
    if (obj.tipo === 'carro' && perfil.shape === 'box') {
      this._buildCarroMesh(obj, perfil, baseY, wireframe, colWireframe);
      return;
    }
    let geo;
    if (perfil.shape === 'cylinder') geo = new THREE.CylinderGeometry(perfil.r, perfil.r, perfil.h, perfil.segments || 14);
    else if (perfil.shape === 'cone') geo = new THREE.ConeGeometry(perfil.r, perfil.h, 14);
    else geo = new THREE.BoxGeometry(perfil.w, perfil.h, perfil.d);
    // [13/09/2026] NOVO — "Chão lajotado" e "Teto modular" (pedido do
    // usuário). "Piso" com `obj.acabamento === 'lajota'` (novo campo
    // opcional, padrão ausente = 'liso', o comportamento de sempre — cor
    // sólida, ZERO mudança) e QUALQUER objeto do tipo `teto-modular` usam
    // uma textura procedural (ver `_getProceduralFloorTexture` acima) em vez
    // da cor sólida de `perfil.color`. `teto-gesso` fica de fora de
    // propósito (liso, sem grid — já tratado à parte, com `return`
    // antecipado, no builder dedicado `_buildTetoGessoMesh` acima).
    let mapaProcedural = null;
    if (!wireframe) {
      if (obj.tipo === 'piso' && obj.acabamento === 'lajota') mapaProcedural = this._getProceduralFloorTexture('lajota', perfil.w, perfil.d);
      else if (obj.tipo === 'teto-modular') mapaProcedural = this._getProceduralFloorTexture('modular', perfil.w, perfil.d);
    }
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : mapaProcedural
        ? new THREE.MeshLambertMaterial({ map: mapaProcedural, color: 0xffffff })
        : new THREE.MeshLambertMaterial({ color: perfil.color });
    const mesh = new THREE.Mesh(geo, mat);
    const centerY = baseY + perfil.y0 + perfil.h / 2;
    mesh.position.set(obj.x, centerY, obj.y);
    mesh.rotation.y = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
    this._group.add(mesh);
    // NOVO (03/09/2026), pedido verbatim: "deve aparecer o desenho da
    // grade 1m x 1m partindo da mesma origem relativa como é no 2D." Mesma
    // matemática EXATA já usada pro 2D (ver mapview.js Map2DRenderer.render,
    // bloco "Retículo métrico": `origX/Y` em coordenadas de MUNDO, giradas
    // por `-obj.angulo` pra virar um deslocamento no ESPAÇO LOCAL do
    // retângulo) — só que aqui o deslocamento local (em METROS, sem
    // multiplicar por nenhum zoom de tela) vira posição LOCAL de verdade
    // dos segmentos de linha (filhos de `mesh`, herdam posição/rotação dele
    // automaticamente — giram/movem junto se o retângulo for reeditado).
    // Eixo local X do box = "largura" (2D x), eixo local Z = "profundidade"
    // (2D y) — mesma convenção de `perfil.w`/`perfil.d` acima.
    if (obj.reticuloMetrico) {
      const origX = obj.reticuloOrigemX ?? obj.x, origY = obj.reticuloOrigemY ?? obj.y;
      const dwx = origX - obj.x, dwy = origY - obj.y;
      const ang = obj.angulo || 0;
      const cosA = Math.cos(-ang), sinA = Math.sin(-ang);
      const oxLocal = dwx * cosA - dwy * sinA;
      const ozLocal = dwx * sinA + dwy * cosA;
      const hw = perfil.w / 2, hd = perfil.d / 2;
      const pts = [];
      const kx0 = Math.ceil((-hw - oxLocal) / 1), kx1 = Math.floor((hw - oxLocal) / 1);
      for (let k = kx0; k <= kx1; k++) {
        const x = oxLocal + k;
        pts.push(x, 0, -hd, x, 0, hd);
      }
      const kz0 = Math.ceil((-hd - ozLocal) / 1), kz1 = Math.floor((hd - ozLocal) / 1);
      for (let k = kz0; k <= kz1; k++) {
        const z = ozLocal + k;
        pts.push(-hw, 0, z, hw, 0, z);
      }
      if (pts.length) {
        const gridGeo = new THREE.BufferGeometry();
        gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const gridMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
        const gridLines = new THREE.LineSegments(gridGeo, gridMat);
        // Local Y = topo da placa (metade da altura, já em espaço local do
        // `mesh` — não precisa somar `centerY` de novo) + folga bem pequena
        // (evita z-fighting/"tremedeira" com a face de cima da placa).
        gridLines.position.y = perfil.h / 2 + 0.0006;
        mesh.add(gridLines);
      }
    }
    const raioPick = Math.max(perfil.w || perfil.r * 2 || 0.3, perfil.d || perfil.r * 2 || 0.3) * 0.6;
    // obb: caixa (retângulo) usa a rotação real da malha; cilindro/cone são
    // simétricos em torno do eixo Y, então uma caixa alinhada aos eixos
    // (rotY=0) já os envolve igual em qualquer ângulo de visão.
    const obbHalf = perfil.shape === 'box'
      ? { x: (perfil.w || 0.5) / 2, y: perfil.h / 2, z: (perfil.d || 0.5) / 2 }
      : { x: perfil.r || 0.3, y: perfil.h / 2, z: perfil.r || 0.3 };
    const obbRotY = perfil.shape === 'box' ? mesh.rotation.y : 0;
    // shape/segments: além da caixa delimitadora, guarda a forma real
    // (box/cylinder/cone) e o número de lados usados na malha (perfil.segments,
    // 14 por padrão pra cilindro/cone) — o estilo de destaque 'outline2d' usa
    // isso pra contornar a projeção real do objeto, não só sua caixa.
    const objPos = { x: obj.x, y: centerY, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: raioPick, ref: obj, obb: { half: obbHalf, rotY: obbRotY, shape: perfil.shape || 'box', segments: perfil.segments || 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);
    // Elegível pro pool de InstancedMesh (ver comentário grande no
    // construtor, `this._instancedPools`) — só o ramo COMUM/genérico chega
    // até aqui (mesa/luminária/poste/escada/molde/imagem/.obj já deram
    // `return` mais acima), e só quando `perfil` é o mesmo objeto
    // COMPARTILHADO de `OBJECT3D_PROFILES[obj.tipo]` (retângulo/polígono
    // guardam dimensões PRÓPRIAS por objeto — `obj.largura`/`obj.raio` etc. —
    // então dois objetos do "mesmo tipo" podem ter geometria DIFERENTE; batê-los
    // no mesmo InstancedMesh, que só tem UMA geometria pra todas as
    // instâncias, desenharia errado). Modo wireframe/híbrido ficam de fora de
    // propósito: o 1º já é atendido por `_addWireframeOcclusion` (que varre
    // `_group.children` esperando UMA malha wireframe por objeto, não um
    // pool batido); o 2º (`updateHybridQuality`) troca `mesh.material` AO
    // VIVO por objeto pra economizar GPU — instanciar destruiria esse
    // controle fino sem necessidade (o pool já é rápido o bastante sozinho,
    // não precisa das duas otimizações competindo pelo mesmo objeto).
    // A montagem de verdade (agrupar por tipo, criar o InstancedMesh) só
    // acontece depois, 1x por cena inteira, em `_rebuildInstancedPools`.
    // [13/09/2026] NOVO — pedido verbatim (via Task 3, prédio de 40 andares
    // com relógios/mesas/cadeiras animados por Script): um objeto com um
    // `ScriptComponent` ATIVO em `obj.components` precisa que SUA PRÓPRIA
    // malha se mova/gire independente das outras a cada quadro (ver
    // `_syncScriptedObjectTransforms` logo abaixo) — um `InstancedMesh`
    // batido por tipo (o pool acima) só tem UMA matriz por índice, sem
    // nenhum sinal de "esta instância específica mudou" — animar uma única
    // instância ainda seria possível (`setMatrixAt` por índice), mas exigiria
    // achar o índice certo a cada quadro por objeto, e um relógio/mesa/
    // cadeira ANIMADO tende a ser RARO entre centenas do mesmo tipo (a
    // maioria fica parada) — mais simples e mais barato excluir só os
    // animados do pool (continuam desenhados INDIVIDUALMENTE, do jeito de
    // sempre) do que complicar o pool inteiro por causa de poucas exceções.
    const temScriptAtivo = Array.isArray(obj.components) && obj.components.some((c) => c.type === 'Script' && c.enabled !== false);
    if (!wireframe && this.mode !== 'hibrido' && obj.forma !== 'retangulo' && obj.forma !== 'poligono' && !temScriptAtivo) {
      mesh.userData._instancerEligible = true;
    }
    // [13/09/2026] NOVO — guarda o deslocamento LOCAL desta malha em relação
    // à base "de mundo" do objeto (x/y do mapa + baseY = piso*2.8+elevacao)
    // no instante da montagem — usado por `_syncScriptedObjectTransforms`
    // pra recalcular a posição/rotação a cada quadro SEM precisar saber a
    // geometria específica de cada `perfil` (funciona igual pra caixa/
    // cilindro/cone, já que só depende da posição que ESTE MESMO builder já
    // calculou em `mesh.position`, não de uma fórmula própria repetida).
    if (temScriptAtivo) this._tagScriptBase(mesh, obj, baseY);
  }

  /** [13/09/2026] NOVO — marca `mesh` com o deslocamento LOCAL dela em
   *  relação à base "de mundo" do objeto (`obj.x`/`baseY`/`obj.y`) — ver
   *  comentário grande em `_syncScriptedObjectTransforms`. Extraído do
   *  corpo de `_buildOneObjectMesh` pra também ser chamado por builders
   *  bespoke de múltiplas malhas (`_buildMesaMesh` — mesa é feita de 4
   *  pernas + tampo, cada `Mesh` solta, todas precisam do MESMO tratamento
   *  pra "mesas animadas" (pedido do usuário) se mover inteiras, juntas). */
  _tagScriptBase(mesh, obj, baseY) {
    mesh.userData._scriptBase = {
      offX: mesh.position.x - obj.x, offY: mesh.position.y - baseY, offZ: mesh.position.z - obj.y,
      objId: obj.id,
    };
  }

  /** [13/09/2026] NOVO — "edição/animação ao vivo" de Script (Tarefa 3 do
   *  pedido, reaproveitada por qualquer objeto com Script, não só os do
   *  prédio gerado): objetos comuns só ganham sua malha/posição UMA VEZ, na
   *  montagem da cena (`_buildOneObjectMesh` acima) — um `ScriptComponent`
   *  rodando `Update()` e mudando `obj.x`/`obj.y`/`obj.elevacao`/`obj.angulo`
   *  (ex.: os exemplos de "pular"/"ir e voltar" do prédio de 40 andares)
   *  precisa que a malha de VERDADE acompanhe esses valores a cada quadro —
   *  senão o script rodaria "no vazio" (o dado muda, a malha na tela não).
   *  Chamado por `view3d.js` `_updateScriptLifecycle`, logo depois de
   *  `Components.tickEntity` ter rodado o `Update()` de todo mundo (ordem
   *  importa: primeiro os scripts mudam os dados, depois isto reflete os
   *  dados na malha). Só objetos com Script ATIVO têm `userData._scriptBase`
   *  (ver acima) — os milhares de objetos parados do prédio nem entram no
   *  `.filter` abaixo (guard barato, mesmo espírito de `Components.
   *  tickEntity`). */
  _syncScriptedObjectTransforms(mapData) {
    if (!this._pickMeshes || !this._pickMeshes.length) return;
    const objIndex = new Map((mapData?.objects || []).map((o) => [o.id, o]));
    for (const mesh of this._pickMeshes) {
      const base = mesh.userData._scriptBase;
      if (!base) continue;
      const obj = objIndex.get(base.objId);
      if (!obj) continue;
      const baseY = (obj.piso || 0) * (this.mapData?.alturaPiso || 2.8) + (obj.elevacao || 0);
      mesh.position.set(obj.x + base.offX, baseY + base.offY, obj.y + base.offZ);
      mesh.rotation.y = objAnguloToRotY(obj.angulo);
      // [13/09/2026] NOVO — pedido esclarecido do usuário sobre o robô
      // recepcionista: "'trocar de uniforme' é só o momento em que ela vai
      // desligar o holograma e ligá-lo [...] depois de alguma coisa feita
      // na sala dos robôs." Reaproveita `obj.cor` (campo JÁ existente e já
      // suportado por objetos "genéricos" — ver `_hexToThreeColor(obj.cor)`
      // usado na CONSTRUÇÃO da malha, `_buildOneObjectMesh`) aplicando-o
      // TAMBÉM AO VIVO, todo quadro, pra QUALQUER objeto com Script que
      // mude `obj.cor` em tempo real (não é exclusividade do robô
      // recepcionista — infraestrutura pequena e genérica, reaproveitável
      // por qualquer script futuro que precise "piscar"/mudar a cor de um
      // objeto, autorizado pelo próprio usuário: "se precisar de algo que o
      // projeto não dê suporte, implemente"). Guard barato (`if (obj.cor)`)
      // — objetos sem Script mudando a cor nunca setam isto, então o custo
      // extra por quadro é 1 comparação de string pra cada objeto
      // ANIMADO (já um subconjunto pequeno, ver comentário grande no topo
      // deste método).
      if (obj.cor && mesh.material && mesh.material.color) {
        const corHex = _hexToThreeColor(obj.cor);
        if (corHex !== undefined && corHex !== null) mesh.material.color.setHex(corHex);
      }
      // [13/09/2026] NOVO — efeito visual SIMPLIFICADO de "holograma" do
      // robô recepcionista (ver comentário grande de esclarecimento em
      // assets/modelos/robo-recepcionista.model.js e o script de exemplo
      // atualizado): enquanto `obj.hologramaLigado!==false` (padrão
      // ligado), o material fica azul translúcido com um leve emissive
      // (leitura visual de "holograma"); quando o script desliga (na sala
      // dos robôs), o material vira cinza metálico OPACO, sem emissive
      // (leitura de "robô real", sem o holograma). HONESTIDADE: isto é
      // troca de COR/opacidade/emissive do MESMO cilindro simples que já
      // existia — não é um modelo humanoide nem um shader de holograma
      // volumétrico de verdade; documentado como suficiente pelo próprio
      // esclarecimento do usuário sobre o que "trocar de uniforme"
      // significa de verdade.
      if (obj.tipo === 'robo-recepcionista' && mesh.material) {
        const hologramaLigado = obj.hologramaLigado !== false;
        if (mesh.material.color) mesh.material.color.setHex(hologramaLigado ? 0x3a6ea5 : 0x5a5f6b);
        if ('transparent' in mesh.material) mesh.material.transparent = hologramaLigado;
        if ('opacity' in mesh.material) mesh.material.opacity = hologramaLigado ? 0.55 : 1;
        if (mesh.material.emissive) mesh.material.emissive.setHex(hologramaLigado ? 0x2050ff : 0x000000);
        if ('emissiveIntensity' in mesh.material) mesh.material.emissiveIntensity = hologramaLigado ? 0.55 : 0;
      }
    }
  }

  /** [14/09/2026] NOVO — animação suave da folha de porta quando
   *  `el.anguloAbertura` é controlado por um Script (ver js/components.js e
   *  o exemplo "Porta Automática" em assets/exemplos/_exemplo-script-porta-
   *  automatica.txt). Chamado a cada quadro por `view3d.js`
   *  `_updateScriptLifecycle` (mesmo lugar que já chama
   *  `_syncScriptedObjectTransforms`). Guard barato: só faz trabalho pra
   *  portas que passaram por `buildDoorOrWindowMesh` com
   *  `_doorLeafMesh`/`_doorPivotInfo` guardados (ver lá) — as demais (a
   *  imensa maioria, sem Script nenhum) nem entram no `for`.
   *  `el._anguloAtualAnim` é o ângulo ATUAL da animação (graus, 0..90,
   *  nunca serializado — só um número solto na entidade em memória,
   *  mesmo espírito de `_scriptBase`/`_startedScripts`) — persegue
   *  `el.anguloAbertura` (se definido) ou o equivalente de `el.aberta`
   *  (0/90°) a uma velocidade fixa que cobre o curso inteiro (0→90°) em
   *  ~500ms, pedido do usuário ("anime suavemente"). */
  _updateDoorAnimations(dt) {
    const portas = this.mapData?.portas;
    if (!portas || !portas.length) return;
    const DEG_PER_SEC = 90 / 0.5; // curso inteiro (0..90°) em ~500ms
    for (const el of portas) {
      // [correção 13/09/2026] estado/malhas agora vêm de `this._doorRuntime`
      // (Map por `el.id`), não de propriedades em `el` — ver comentário
      // grande em `setScene`.
      const rt = this._doorRuntime?.get(el.id);
      const mesh = rt?.leafMesh;
      const info = rt?.pivotInfo;
      if (!rt || !mesh || !info) continue;
      const targetDeg = (el.anguloAbertura !== undefined && el.anguloAbertura !== null)
        ? Math.max(0, Math.min(90, el.anguloAbertura))
        : (el.aberta ? 90 : 0);
      // [13/09/2026] NOVO — animação da MAÇANETA (variante `el.comManeneta`,
      // ver `buildDoorOrWindowMesh` acima). Só entra pra portas que TÊM a
      // peça (`el._doorManetaMesh`, um THREE.Group filho da folha — herda
      // posição/rotação da folha automaticamente, só giramos o eixo Z LOCAL
      // dele aqui). Detecta o "momento do clique" comparando o `targetDeg`
      // desta rodada com o da rodada anterior (`el._manetaLastTargetDeg`):
      // toda vez que o ALVO muda (aoClicarDuasVezes do Script alterou
      // `anguloAbertura`, ou qualquer outra fonte), dispara um giro rápido
      // (~250ms) da maçaneta — ANTES/JUNTO do início do movimento da folha
      // (o giro da maçaneta é instantâneo no disparo; a folha ainda tem os
      // ~500ms de curso inteiro de sempre) — simulando "girar a maçaneta pra
      // destrancar" — e volta sozinha à posição neutra ao final dos 250ms,
      // função seno (0 -> pico -> 0) pra não ter solavanco nas pontas.
      // [15/09/2026 UTC] ALTERADO — `rt.manetaMesh` virou um ARRAY de 2
      // grupos (maçaneta da face +Z e da face -Z, ver comentário grande em
      // `montarManeta`, mais acima) em vez de um `THREE.Group` único — as 2
      // giram sempre JUNTAS (mesmo `rotation.z`, mesma animação), só o
      // ALVO (`rt.manetaMesh.rotation.z = ...`) virou um `forEach`.
      if (el.comManeneta && rt.manetaMesh && rt.manetaMesh.length) {
        if (rt.manetaLastTargetDeg === undefined) rt.manetaLastTargetDeg = targetDeg;
        if (targetDeg !== rt.manetaLastTargetDeg) {
          rt.manetaLastTargetDeg = targetDeg;
          rt.manetaAnimDur = 0.25; // ~250ms, independente dos ~500ms da folha
          rt.manetaAnimT = rt.manetaAnimDur;
        }
        if (rt.manetaAnimT > 0) {
          rt.manetaAnimT = Math.max(0, rt.manetaAnimT - Math.max(0, dt || 0));
          const p = 1 - rt.manetaAnimT / rt.manetaAnimDur;
          const MAX_MANETA_RAD = 35 * Math.PI / 180; // ~35° de giro no cabo
          const rotZ = Math.sin(Math.min(1, p) * Math.PI) * MAX_MANETA_RAD;
          rt.manetaMesh.forEach((m) => { m.rotation.z = rotZ; });
        } else {
          rt.manetaMesh.forEach((m) => { if (m.rotation.z !== 0) m.rotation.z = 0; }); // garante neutro exato ao fim da animação
        }
      }
      if (rt.anguloAtualAnim === undefined || rt.anguloAtualAnim === null) rt.anguloAtualAnim = targetDeg;
      const diff = targetDeg - rt.anguloAtualAnim;
      if (Math.abs(diff) < 0.05) {
        if (rt.anguloAtualAnim === targetDeg) continue; // já parado no alvo — nada a recalcular
        rt.anguloAtualAnim = targetDeg;
      } else {
        const step = DEG_PER_SEC * Math.max(0, dt || 0);
        rt.anguloAtualAnim += Math.sign(diff) * Math.min(Math.abs(diff), step);
      }
      const phi = rt.anguloAtualAnim * Math.PI / 180;
      const { pos, largura, altura, baseY, rotY } = info;
      const ang = pos.angulo || 0;
      const alongX = Math.cos(ang), alongY = Math.sin(ang);
      const perpX = -Math.sin(ang), perpY = Math.cos(ang);
      const hingeSign = el.abertura === 'esquerda' ? -1 : 1;
      const hingeX = pos.x + alongX * hingeSign * (largura / 2);
      const hingeZ = pos.y + alongY * hingeSign * (largura / 2);
      const v0x = -hingeSign * alongX * (largura / 2), v0z = -hingeSign * alongY * (largura / 2);
      const v1x = perpX * (largura / 2), v1z = perpY * (largura / 2);
      const meshX = hingeX + Math.cos(phi) * v0x + Math.sin(phi) * v1x;
      const meshZ = hingeZ + Math.cos(phi) * v0z + Math.sin(phi) * v1z;
      mesh.position.set(meshX, baseY + altura / 2, meshZ);
      mesh.rotation.y = rotY + phi;
    }
  }

  /** [15/09/2026] NOVO — gira os ponteiros de TODOS os relógios (de parede
   *  ou de mesa/estante, tanto faz — a montagem em `_buildRelogioMesh` é a
   *  mesma) conforme a hora ATUAL do mundo (`window.RelogioMundo`, ver
   *  js/relogio-mundo.js — NÃO a hora do aparelho do usuário: mesma
   *  decisão de design já usada pelos robôs de copa/limpeza/recepcionista,
   *  que também consultam o relógio do MUNDO, não `new Date()`, pra saber
   *  se é hora do almoço etc.). Chamado TODO QUADRO por view3d.js
   *  `_updateScriptLifecycle`, mesmo lugar/padrão de `_updateCamerasLive`/
   *  `_updateDoorAnimations` logo abaixo/acima.
   *
   *  Guard barato: sem relógio nenhum na cena (`_relogiosParede` vazio,
   *  populado só em `_buildRelogioMesh`) ou sem `RelogioMundo` carregado
   *  (defensivo — o script já é parte do APP_SHELL, mas nada custa
   *  proteger contra ordem de carregamento futura), sai sem fazer nada.
   *
   *  FÓRMULAS — convenção padrão de relógio analógico (minuto/segundo
   *  "vazam" fração pro ponteiro de cima: às 3:30 o ponteiro de hora fica
   *  NA METADE entre o 3 e o 4, não parado em cima do 3):
   *    hora   = ((horas%12)/12 + minutos/720) * 2π
   *    minuto = (minutos/60 + segundos/3600) * 2π
   *    segundo= (segundos/60) * 2π
   *
   *  EIXO/SINAL — [15/09/2026, CORRIGIDO — o usuário reportou "o relógio...
   *  está girando para o lado errado"] A versão anterior girava os
   *  ponteiros em `rotation.z` (eixo LOCAL do `mesh`, antes da correção de
   *  postura em X+Y — ver `_buildRelogioMesh`). Conferido numericamente com
   *  o próprio Three.js (aplicando o quaternion resultante de
   *  `mesh.rotation.set(Math.PI/2, rotY, 0)`): o eixo Z local do `mesh` cai
   *  no mundo em **-Y (vertical)**, não na normal do mostrador — girar em
   *  `rotation.z` faz o ponteiro varrer o plano HORIZONTAL (mundo XZ), como
   *  um catavento deitado, nunca subindo/descendo no rosto do relógio (por
   *  isso "para o lado errado": nem é o sentido que estava trocado, é o
   *  EIXO de giro que estava errado). O eixo certo pra girar é o Y local do
   *  `mesh` — esse sim cai no mundo em +Z, exatamente a normal que sai do
   *  mostrador pra fora da parede — então agora o ponteiro nasce apontando
   *  pro eixo -Z LOCAL (ver `fazPonteiro`/translate em `_buildRelogioMesh`)
   *  e gira em `rotation.y`. Com essa troca, testado de novo com o Three.js
   *  real: `rotation.y = -ang` com `ang` calculado pelas fórmulas acima
   *  bate exatamente com a convenção de relógio de verdade — às 3:00
   *  (ang=π/2) o ponteiro cai em +X mundo (direita de quem olha o
   *  mostrador de frente, já que a normal do mostrador é +Z e a câmera
   *  típica olha em -Z com "up"=+Y, right=+X — convenção padrão do
   *  Three.js) e às 6:00 (ang=π) cai em -Y (pra baixo) — exatamente o
   *  sentido horário 12→3→6→9→12 visto de frente. Por isso o `-` na frente
   *  de cada fórmula abaixo permanece (o SINAL já estava certo; o que
   *  mudou foi o EIXO, de `rotation.z` pra `rotation.y`). */
  _updateRelogiosParede(dt) {
    const relogios = this._relogiosParede;
    if (!relogios || !relogios.length) return;
    const RP = window.RelogioMundo;
    const h = (RP && typeof RP.getHoraAtual === 'function') ? RP.getHoraAtual() : null;
    const horasPredio = h?.horas || 0, minutosPredio = h?.minutos || 0, segundosPredio = h?.segundos || 0;
    // [14/09/2026 UTC] NOVO — pedido verbatim (backlog, adiado desde a RODADA
    // 20): "Os ponteiros do relogio e seu funcionamento deve funcionar
    // por meio de scripts... seja possivel fazer um relogio do zero."
    // CAUSA RAIZ do que faltava: as 3 horas usadas pra girar os ponteiros
    // vinham SEMPRE, sem excecao, de RelogioMundo - nenhum Script
    // conseguia influenciar o relogio de jeito nenhum (nem parar,
    // adiantar, atrasar, ou mostrar outro fuso). Corrigido com o MESMO
    // padrao ja usado por cam.anguloLente (camera PS1, escrita por
    // _exemplo-script-camera-vigilancia.txt) e por entity.anguloAbertura/
    // obj.elevacao (porta/elevador): 3 campos SIMPLES e OPCIONAIS no
    // objeto - horaPonteiro/minutoPonteiro/segundoPonteiro (numeros
    // comuns, 0-23/0-59/0-59, NAO radianos - nenhum Script precisa saber
    // de eixo/sinal de rotacao) - que, se um Script os escrever a cada
    // Update(dt), SUBSTITUEM a leitura de RelogioMundo pra aquele
    // ponteiro especificamente (ver exemplo completo em
    // assets/exemplos/_exemplo-script-relogio.txt: um "relogio do zero",
    // sem precisar do perfil embutido de relogio, plantando um objeto
    // qualquer e controlando os 3 campos direto). Cada campo e
    // independente - um Script pode sobrescrever so segundoPonteiro
    // (ex.: um "tique" que pula de segundo em segundo em vez de deslizar)
    // e deixar hora/minuto automaticos, por exemplo. SEM nenhum Script
    // anexado (o caso de sempre, relogio "de fabrica"), os 3 campos ficam
    // undefined e o comportamento e 100% o mesmo de antes - tempo real
    // do predio, sem nenhuma mudanca visivel.
    for (const r of relogios) {
      const obj = r.obj;
      const horas = Number.isFinite(obj?.horaPonteiro) ? obj.horaPonteiro : horasPredio;
      const minutos = Number.isFinite(obj?.minutoPonteiro) ? obj.minutoPonteiro : minutosPredio;
      const segundos = Number.isFinite(obj?.segundoPonteiro) ? obj.segundoPonteiro : segundosPredio;
      const angHora = ((horas % 12) / 12 + minutos / 720) * Math.PI * 2;
      const angMinuto = (minutos / 60 + segundos / 3600) * Math.PI * 2;
      const angSegundo = (segundos / 60) * Math.PI * 2;
      if (r.ponteiroHora) r.ponteiroHora.rotation.y = -angHora;
      if (r.ponteiroMinuto) r.ponteiroMinuto.rotation.y = -angMinuto;
      if (r.ponteiroSegundo) r.ponteiroSegundo.rotation.y = -angSegundo;
    }
  }

  /** [13/09/2026] NOVO — parte "viva" do modelo de câmera "PS1" (ver bloco
   *  "câmeras" em `setScene`, `cam.modeloVisual==='ps1'`): gira a
   *  cabeça/lente conforme `cam.anguloLente` (tipicamente escrito por um
   *  Script, ex.: assets/exemplos/_exemplo-script-camera-vigilancia.txt) e
   *  faz a lucezinha vermelha de status piscar. Chamado TODO QUADRO por
   *  view3d.js `_updateScriptLifecycle`, logo depois de `Components.
   *  tickEntity` já ter rodado o `Update()` de cada Script (mesma ordem de
   *  `_syncScriptedObjectTransforms`/`_updateDoorAnimations` acima — dado
   *  muda no Script, malha reflete aqui em seguida). Guard barato: só
   *  câmeras com entrada em `_camPs1RefsById` (só as PS1 — a imensa maioria
   *  das câmeras comuns nem entra no `for`) fazem qualquer trabalho.
   *
   *  PISCAR — mesmo espírito de "tempo real do navegador" já usado nos
   *  scripts de robô (`Date.now()`, ver _exemplo-script-robo-copa.txt): sem
   *  depender de nenhum "relógio simulado do prédio" que este motor não
   *  expõe, um ciclo de 500ms ligado / 500ms apagado, calculado direto de
   *  `Date.now()` (nunca dessincroniza entre câmeras, todas piscam juntas —
   *  aceitável pro efeito pedido, "lucezinha piscando"). Só pisca enquanto
   *  `cam.varreduraAtiva !== false` (mesmo campo que liga/desliga o
   *  vai-e-volta — ver botão "🔄" em view3d.js `_showCameraCard3D`); com a
   *  varredura desligada, a luz fica ACESA FIXA em baixa intensidade (lida
   *  como "câmera ligada, mas parada"), não apagada de propósito (uma
   *  câmera de segurança "morta" seria uma informação enganosa). */
  _updateCamerasLive(dt) {
    const refsById = this._camPs1RefsById;
    if (!refsById) return;
    const ids = Object.keys(refsById);
    if (!ids.length) return;
    const camIndex = new Map((this.mapData?.cameras || []).map((c) => [String(c.id), c]));
    const piscaLigada = Math.floor(Date.now() / 500) % 2 === 0;
    for (const id of ids) {
      const refs = refsById[id];
      const cam = camIndex.get(String(id));
      if (!refs || !cam) continue;
      // Cabeça/lente: orientação de montagem + desvio do Script.
      refs.lensHead.rotation.y = refs.montagemRotY + (cam.anguloLente || 0);
      // LED — intensidade da PointLight e cor do material da esferinha
      // (a esferinha em si não "brilha" sozinha sem luz de cena incidindo
      // nela com um material Basic — por isso a PointLight junto faz o
      // trabalho de "acender" de verdade; o MeshBasicMaterial já é vermelho
      // sempre, então alternar entre vermelho vivo/vermelho escuro no
      // material dá o contraste aceso/apagado mesmo pra quem olhar de perto
      // sem a luz "vazar" muito no ambiente).
      const varreduraAtiva = cam.varreduraAtiva !== false;
      const aceso = !varreduraAtiva || piscaLigada;
      refs.ledLight.intensity = aceso ? 0.15 : 0;
      refs.ledMat.color.setHex(aceso ? 0xff2020 : 0x4a0808);
    }
  }

  /** Textura do "selo" de item associado (obj.itemId) — pedido do usuário
   *  (26/08/2026): "Assim como no 2D, quando tem um patrimônio associado
   *  fica uma bolinha azul... No 3D deve ter esses destaques." MESMO
   *  espírito de _buildGlassShineTexture/_buildCheckerTexture acima: um
   *  canvas 2D desenhado UMA vez por tipo ('bolinha'/'plaquinha', cache em
   *  `_itemBadgeTexCache`), nunca recriado por objeto/quadro — cada selo da
   *  cena é um THREE.Sprite reaproveitando a MESMA textura. 'bolinha' é o
   *  mesmo visual do selo do mapa 2D (círculo azul + 🔗, ver mapview.js
   *  _drawFormaShape); 'plaquinha' é uma placa retangular com o mesmo ícone.
   *  Usar THREE.Sprite (não um plano comum) faz o selo ficar SEMPRE de
   *  frente pra câmera sozinho, sem precisar calcular rotação nem "qual lado
   *  do objeto está visível" — resolve de graça o pedido "em alguma parte
   *  visível do objeto". */
  _buildItemBadgeTexture(kind) {
    this._itemBadgeTexCache = this._itemBadgeTexCache || {};
    if (this._itemBadgeTexCache[kind]) return this._itemBadgeTexCache[kind];
    const THREE = this.THREE;
    const c = document.createElement('canvas');
    const isPlaca = kind === 'plaquinha';
    c.width = 128; c.height = isPlaca ? 76 : 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#4f8cff'; // mesma cor do selo/contorno do mapa 2D
    if (isPlaca) {
      const r = 14;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(4, 4, c.width - 8, c.height - 8, r); ctx.fill(); }
      else ctx.fillRect(4, 4, c.width - 8, c.height - 8); // navegador sem roundRect — placa quadrada, mesma cor/ícone
      ctx.strokeStyle = 'rgba(10,13,17,0.55)'; ctx.lineWidth = 3;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(4, 4, c.width - 8, c.height - 8, r); ctx.stroke(); }
    } else {
      ctx.beginPath();
      ctx.arc(c.width / 2, c.height / 2, c.width / 2 - 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = `${isPlaca ? 40 : 60}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0a0d11';
    ctx.fillText('🔗', c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData = { w: c.width, h: c.height };
    this._itemBadgeTexCache[kind] = tex;
    return tex;
  }

  /** Textura do selo escuro "×N" (multi-item — mais de um patrimônio no
   *  MESMO objeto) — equivalente 3D do badge escuro do mapa 2D (ver
   *  mapview.js _drawItemBadges). Uma textura por valor de N, cacheada
   *  (poucos valores distintos na prática — sem custo real de memória). */
  _buildCountBadgeTexture(n) {
    this._countBadgeTexCache = this._countBadgeTexCache || new Map();
    if (this._countBadgeTexCache.has(n)) return this._countBadgeTexCache.get(n);
    const THREE = this.THREE;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(32, 32, 27, 0, Math.PI * 2);
    ctx.fillStyle = '#20242b';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#4f8cff'; // mesma cor do 🔗 principal, igual ao 2D
    ctx.stroke();
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData = { w: 64, h: 64 };
    this._countBadgeTexCache.set(n, tex);
    return tex;
  }

  /** Textura do selo vermelho-alaranjado com o ORDINAL de duplicação (o
   *  patrimônio deste objeto também aparece em outro(s) objeto(s) do mapa —
   *  equivalente 3D do badge laranja do mapa 2D, ver mapview.js
   *  _drawItemBadges). Uma textura por ordinal, cacheada. */
  _buildOrdinalBadgeTexture(n) {
    this._ordinalBadgeTexCache = this._ordinalBadgeTexCache || new Map();
    if (this._ordinalBadgeTexCache.has(n)) return this._ordinalBadgeTexCache.get(n);
    const THREE = this.THREE;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(32, 32, 27, 0, Math.PI * 2);
    ctx.fillStyle = '#e35b5b'; // mesma cor do badge de ordinal do 2D
    ctx.fill();
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData = { w: 64, h: 64 };
    this._ordinalBadgeTexCache.set(n, tex);
    return tex;
  }

  /** [13/09/2026] NOVO — textura do pontinho "tem histórico" (cor cacheada
   *  por valor de cor — só 2 valores na prática, ver
   *  `ObjectStandard.corIndicadorHistorico`). MESMO espírito de
   *  `_buildItemBadgeTexture` acima, mas propositalmente mais simples (um
   *  círculo só, sem ícone dentro) — pedido verbatim: "Tem que ser algo bem
   *  simples." */
  _buildHistoricoBadgeTexture(cor) {
    this._histBadgeTexCache = this._histBadgeTexCache || new Map();
    if (this._histBadgeTexCache.has(cor)) return this._histBadgeTexCache.get(cor);
    const THREE = this.THREE;
    const c = document.createElement('canvas');
    c.width = 48; c.height = 48;
    const ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(24, 24, 18, 0, Math.PI * 2);
    ctx.fillStyle = cor;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,13,17,0.6)';
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._histBadgeTexCache.set(cor, tex);
    return tex;
  }

  /** [13/09/2026] NOVO — pedido verbatim: "Coloque este mesmo detalhe no
   *  objeto [...] algo que fique em cima do objeto [...] indicando que foi
   *  colocado algo no seu histórico. Implemente uma variação de cor de
   *  acordo com a data de inserção [...] Tem que ser algo bem simples."
   *  Igual a `_addItemAssociadoDestaque` acima (mesmo `THREE.Sprite` sempre
   *  de frente pra câmera, `depthTest:false` pra nunca ficar escondido
   *  "dentro" do próprio objeto), só que BEM mais simples de propósito: um
   *  pontinho colorido só (sem ícone/contorno/flags), plantado logo ACIMA
   *  do topo real do objeto ("em cima do objeto", pedido literal) — cor
   *  vem de `ObjectStandard.corIndicadorHistorico` (verde = hoje/esta
   *  semana, cinza = mais antigo), MESMA lógica do pontinho do botão
   *  "Histórico deste objeto" (2D e 3D), pra nunca haver dois critérios de
   *  cor diferentes pro mesmo dado. NO-OP se o objeto não tiver nenhuma
   *  entrada de histórico ainda (o indicador só existe quando algo foi
   *  colocado ali) ou se `ObjectStandard` não estiver carregado. */
  _addHistoricoDestaque(obj, perfil, baseY) {
    if (!window.ObjectStandard) return;
    const cor = window.ObjectStandard.corIndicadorHistorico(obj);
    if (!cor) return;
    const THREE = this.THREE;
    const h = Math.max(perfil.h || 0.5, 0.05);
    const y0 = perfil.y0 || 0;
    const topoY = baseY + y0 + h;
    const tex = this._buildHistoricoBadgeTexture(cor);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(0.16, 0.16, 1);
    sprite.position.set(obj.x, topoY + 0.14, obj.y);
    sprite.renderOrder = 5;
    this._group.add(sprite);
  }

  /** Destaque visual de "item associado" (obj.itemId) — pedido do usuário
   *  (26/08/2026): "Assim como no 2D, quando tem um patrimônio associado
   *  fica uma bolinha azul e o contorno fica azul. No 3D deve ter esses
   *  destaques. Nas 'configurações 3D' deve ter opção para isso: 'bolinha
   *  azul' ou 'plaquinha'... O padrão é a plaquinha. O contorno azul no 3D
   *  deve ser opcional... (ativado por padrão)." Duas peças INDEPENDENTES,
   *  cada uma com seu próprio interruptor em mapconfig.js:
   *   - Contorno: arestas (THREE.EdgesGeometry) de uma caixa do TAMANHO do
   *     perfil (não a malha exata — mesa/luminária têm formas compostas,
   *     uma caixa delimitadora já destaca bem "isto está associado"),
   *     ligeiramente maior (1.04×) que o objeto pra não colar na superfície
   *     dele (evita z-fighting), na mesma cor do contorno azul do 2D
   *     (`#4f8cff`). Respeita profundidade normal (depthTest padrão) — fica
   *     escondida atrás de paredes/outros objetos igual a malha real ficaria,
   *     mesmo comportamento do destaque de raycasting `_hoverPick`.
   *   - Selo ('plaquinha' padrão ou 'bolinha'): um THREE.Sprite (sempre de
   *     frente pra câmera) com a textura de _buildItemBadgeTexture, plantado
   *     numa altura de "visão confortável" (~1,5m acima da base do objeto,
   *     igual à altura de olhos padrão usada no resto do app — ver
   *     ALTURA_CAMERA/personagem) — NUNCA acima do topo real do objeto (pedido
   *     do usuário: "se o objeto for muito alto... em cima não daria para
   *     ver"), e nunca abaixo de um mínimo pra objetos bem baixos/rasteiros.
   *     `depthTest:false` garante que o selo NUNCA fica escondido atrás do
   *     próprio corpo do objeto (ex.: um armário grosso na frente da câmera)
   *     — só a peça mais visível/legível do destaque tem esta garantia extra;
   *     o contorno acima não precisa dela (faz sentido sumir atrás de algo).
   *  Chamado por `_buildOneObjectMesh` pra QUALQUER objeto com `obj.itemId`
   *  (mesa/luminária inclusive, via o mesmo `perfil` aproximado). */
  _addItemAssociadoDestaque(obj, perfil, baseY) {
    if (!obj.itemIds || !obj.itemIds.length) return;
    const THREE = this.THREE;
    const cfg = this._config;
    const corAzul = 0x4f8cff;
    const w = perfil.w || (perfil.r ? perfil.r * 2 : 0.5);
    const d = perfil.d || (perfil.r ? perfil.r * 2 : 0.5);
    const h = Math.max(perfil.h || 0.5, 0.05);
    const y0 = perfil.y0 || 0;
    const baseObjY = baseY + y0;
    const topoY = baseObjY + h;
    const centerY = baseObjY + h / 2;

    if (cfg.itemAssociado3DContorno !== false) {
      const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 1.04, h * 1.04, d * 1.04));
      const edgesMat = new THREE.LineBasicMaterial({ color: corAzul, transparent: true, opacity: 0.9 });
      const edges = new THREE.LineSegments(edgesGeo, edgesMat);
      edges.position.set(obj.x, centerY, obj.y);
      edges.rotation.y = objAnguloToRotY(obj.angulo);
      this._group.add(edges);
    }

    // `depthTest:false` SEMPRE nas três peças abaixo (selo + flags) —
    // garante que NUNCA ficam escondidas atrás do PRÓPRIO objeto (ex.: um
    // armário grosso na frente da câmera), problema real relatado pelo
    // usuário quando esta linha antes virava `depthTest:true` (a opção
    // "Ver através das paredes" › "Plaquinhas/bolinhas" desligava e o selo
    // sumia "dentro" do objeto, não só atrás de paredes — pedido do usuário,
    // 26/08/2026, 4ª rodada: "para cada objeto independentemente, a
    // plaquinha/bolinha deve aparecer senão acaba ficando 'dentro' do
    // objeto"). "Ver através das paredes" › "Plaquinhas/bolinhas" agora é
    // resolvido de outro jeito, à parte: um raycast por quadro contra só
    // paredes/portas/janelas (nunca contra o objeto em si) — ver
    // `_itemBadgeGroups`/`_updateItemBadgeOcclusion` mais abaixo, que decide
    // `sprite.visible` sem mexer em `depthTest`.
    const selo = cfg.itemAssociado3DSelo === 'bolinha' ? 'bolinha' : 'plaquinha';
    const tex = this._buildItemBadgeTexture(selo);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    const larguraBase = selo === 'bolinha' ? 0.22 : 0.34;
    const proporcao = (tex.userData?.h || tex.image?.height || 1) / (tex.userData?.w || tex.image?.width || 1);
    sprite.scale.set(larguraBase, larguraBase * proporcao, 1);
    // Altura de "visão confortável" — nunca acima do topo real (menos uma
    // pequena margem pra não cravar bem na borda) nem abaixo de um mínimo.
    const ALTURA_VISAO = 1.5;
    sprite.position.set(obj.x, Utils.clamp(baseObjY + ALTURA_VISAO, baseObjY + 0.12, topoY - 0.03), obj.y);
    sprite.renderOrder = 5;
    this._group.add(sprite);
    const badgeSprites = [sprite];

    // Flags de duplicação/multi-item (pedido do usuário, 26/08/2026: "As
    // flags devem aparecer no 3D também" — mesmas duas do mapa 2D, ver
    // mapview.js _drawItemBadges): um selo escuro "×N" quando este MESMO
    // objeto tem mais de um patrimônio associado, e um selo vermelho-
    // alaranjado com o ordinal quando algum desses patrimônios TAMBÉM está
    // associado a outro(s) objeto(s) do mapa. Empilhados verticalmente
    // acima/abaixo do selo principal (sempre de frente pra câmera, igual
    // ele) — sem disputar o mesmo espaço nem exigir reposicionamento em X/Z
    // conforme o ângulo de visão.
    const ids = (obj.itemIds || []).map((e) => e && e.id).filter(Boolean);
    const larguraSub = 0.20;
    if (ids.length > 1) {
      const texN = this._buildCountBadgeTexture(ids.length);
      const spriteN = new THREE.Sprite(new THREE.SpriteMaterial({ map: texN, transparent: true, depthTest: false }));
      spriteN.scale.set(larguraSub, larguraSub, 1);
      spriteN.position.set(obj.x, Utils.clamp(baseObjY + ALTURA_VISAO + 0.30, baseObjY + 0.12, topoY + 0.6), obj.y);
      spriteN.renderOrder = 6;
      this._group.add(spriteN);
      badgeSprites.push(spriteN);
    }
    const idxScene = this._itemAssocIndexScene;
    if (idxScene) {
      let maiorOrdinal = 0;
      ids.forEach((id) => {
        const ocorrencias = idxScene.get(id);
        if (ocorrencias && ocorrencias.length > 1) {
          const ordinal = ocorrencias.findIndex((o) => o.objId === obj.id) + 1;
          if (ordinal > maiorOrdinal) maiorOrdinal = ordinal;
        }
      });
      if (maiorOrdinal > 0) {
        const texOrd = this._buildOrdinalBadgeTexture(maiorOrdinal);
        const spriteOrd = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOrd, transparent: true, depthTest: false }));
        spriteOrd.scale.set(larguraSub, larguraSub, 1);
        spriteOrd.position.set(obj.x, Utils.clamp(baseObjY + ALTURA_VISAO - 0.30, baseObjY + 0.12, topoY - 0.03), obj.y);
        spriteOrd.renderOrder = 6;
        this._group.add(spriteOrd);
        badgeSprites.push(spriteOrd);
      }
    }

    // Registrado pra `_updateItemBadgeOcclusion` (ver setScene/render()) —
    // posição de referência do raycast é a do selo principal (as flags,
    // deslocadas só ±0.3m dele, ficam bem próximas o bastante pra esconder/
    // mostrar TODAS juntas como um grupo único, sem parecer picotado).
    this._itemBadgeGroups.push({ pos: { x: sprite.position.x, y: sprite.position.y, z: sprite.position.z }, sprites: badgeSprites });

    // Destaque extra opcional — dois EFEITOS independentes (pedido do
    // usuário, 26/08/2026, 2ª rodada: "de modo que tanto o 2D quanto o 3D
    // tenham os dois jeitos de dar o 'destaque a mais'... o padrão deve ser
    // o raio azul para o 3D"), além do contorno/selo de sempre, cada um com
    // seu próprio checkbox em mapconfig.js, podendo ficar os dois ligados ao
    // mesmo tempo:
    //  - "raio azul": facho de luz vertical, mesma peça usada nos pinos de
    //    item (ver _addBeaconDestaque/setScene).
    //  - "anel dourado": halo dourado horizontal no chão, versão 3D do anel
    //    do mapa 2D (ver _addAnelDouradoDestaque3D).
    if (cfg.destaqueExtra3DRaioAtivo !== false) this._addBeaconDestaque(obj.x, obj.y, topoY, corAzul);
    if (cfg.destaqueExtra3DDouradoAtivo) this._addAnelDouradoDestaque3D(obj.x, obj.y, baseObjY, Math.max(w, d) / 2);
  }

  /** Facho de luz vertical translúcido — destaque EXTRA opcional ("raio
   *  azul", ver cfg.destaqueExtra3DRaioAtivo/destaqueExtra2DRaioAtivo em
   *  mapconfig.js), somado por cima de qualquer destaque já existente
   *  (contorno azul + selo dos objetos patrimoniados, cor de sempre dos
   *  pinos-pirâmide de item) — chamado tanto por _addItemAssociadoDestaque
   *  (objetos) quanto por setScene (pinos de item). Fino, bem alto e
   *  translúcido — visível de longe através do ambiente inteiro, mesmo
   *  espírito de "marcador de missão" de jogos, reforçando a moldura "jogo"
   *  já usada no HUD da ferramenta "📍 Adicionar orb" (ver view3d.js
   *  _refreshOrbHud). `depthWrite:false` sempre (evita brigar com a
   *  profundidade de outras peças translúcidas) — `depthTest` depende da
   *  subseção "Ver através das paredes" › "Raio azul" (ver mapconfig.js
   *  DEFAULTS.raioAzul3DAtravesParedesAtivo, pedido do usuário 26/08/2026,
   *  3ª rodada): ligado (padrão), nunca fica escondido atrás de paredes/
   *  outros objetos; desligado, respeita profundidade normal como uma peça
   *  real da cena. */
  _addBeaconDestaque(x, z, baseY, cor) {
    const THREE = this.THREE;
    const ALTURA_FACHO = 3.2;
    const atravesParedes = this._config?.raioAzul3DAtravesParedesAtivo !== false;
    const geo = new THREE.CylinderGeometry(0.09, 0.16, ALTURA_FACHO, 10, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: cor, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
      depthWrite: false, depthTest: !atravesParedes,
    });
    const beacon = new THREE.Mesh(geo, mat);
    beacon.position.set(x, baseY + ALTURA_FACHO / 2, z);
    beacon.renderOrder = 4;
    this._group.add(beacon);
  }

  /** Textura (construída uma vez só, cacheada em `_anelDouradoTex` — mesmo
   *  espírito de `_floorTexture`/`_itemBadgeTexCache`) de um anel dourado
   *  com brilho, pintada num canvas com `shadowBlur` — MESMA técnica visual
   *  do anel do mapa 2D (ver mapview.js _drawDestaqueExtraObj: `shadowColor:
   *  '#ffd166', shadowBlur: 14`), só que como imagem em vez de desenho direto
   *  no canvas 2D, pra poder virar um THREE.CanvasTexture reaproveitável. */
  _buildAnelDouradoTexture() {
    if (this._anelDouradoTex) return this._anelDouradoTex;
    const THREE = this.THREE;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 9;
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(64, 64, 46, 0, Math.PI * 2);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._anelDouradoTex = tex;
    return tex;
  }

  /** Halo dourado horizontal no chão — versão 3D do "anel dourado" do mapa
   *  2D (ver mapview.js _drawDestaqueExtraObj/_drawDestaqueExtraPin),
   *  destaque EXTRA opcional independente do "raio azul" acima (ver
   *  cfg.destaqueExtra3DDouradoAtivo/destaqueExtra2DDouradoAtivo em
   *  mapconfig.js — pedido do usuário 26/08/2026: "Implemente o 'dourado' do
   *  2D de um jeito que fique bom para o 3D"). Um plano horizontal (deitado,
   *  rotacionado -90° em X) com a textura de `_buildAnelDouradoTexture`,
   *  encostado no chão na base do objeto/pino — igual ao facho,
   *  `depthWrite:false` sempre. `depthTest` depende da subseção "Ver através
   *  das paredes" › "Círculo dourado" (ver mapconfig.js DEFAULTS.
   *  anelDourado3DAtravesParedesAtivo, pedido do usuário 26/08/2026, 3ª
   *  rodada) — ligado (padrão), nunca fica escondido atrás de paredes/outros
   *  objetos; desligado, respeita profundidade normal como uma peça real da
   *  cena. `raioBase`: metade do maior lado (objeto) ou raio (pino/pirâmide)
   *  — usado só pra escalar o halo proporcionalmente ao tamanho de quem está
   *  sendo destacado. */
  _addAnelDouradoDestaque3D(x, z, baseY, raioBase) {
    const THREE = this.THREE;
    const atravesParedes = this._config?.anelDourado3DAtravesParedesAtivo !== false;
    const tex = this._buildAnelDouradoTexture();
    const tamanho = Math.max((raioBase || 0.3) * 2.6, 1.1);
    const geo = new THREE.PlaneGeometry(tamanho, tamanho);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
      depthWrite: false, depthTest: !atravesParedes,
    });
    const anel = new THREE.Mesh(geo, mat);
    anel.rotation.x = -Math.PI / 2;
    anel.position.set(x, baseY + 0.02, z);
    anel.renderOrder = 4;
    this._group.add(anel);
  }

  /** Pedido do usuário (25/08/2026): "por algum motivo ao inserir um objeto
   *  no 3D, as coisas dão uma 'piscada'. É porque a lista de objetos que
   *  vão para o render foi atualizada? Essa piscada não deve ocorrer."
   *  Investigando: sim — antes, colocar QUALQUER objeto (mesmo um único)
   *  disparava `view3d.js _afterMapMutated` → `_rebuildScene` → `setScene`,
   *  que DESCARTA E RECONSTRÓI a cena 3D INTEIRA do zero (todas as paredes,
   *  portas, janelas, câmeras E objetos — ver `_disposeGroupContents` no
   *  início de `setScene`), só pra acrescentar UMA peça nova. Recriar
   *  centenas de malhas/materiais de uma vez é caro o bastante (geometria +
   *  compilação de shader pela primeira vez de cada material nesta
   *  passada) pra ocasionalmente perder um quadro de verdade bem no
   *  instante da troca — visto pela pessoa como a cena inteira "piscando".
   *
   *  Corrigido criando este caminho ALTERNATIVO, incremental: adiciona só a
   *  malha do objeto novo em cima da cena já existente (reaproveitando
   *  `_buildOneObjectMesh`, o mesmo código usado por `setScene`), sem tocar
   *  em nenhuma parede/porta/janela/câmera/objeto que já estava lá — nada é
   *  descartado, então não há nenhum instante em que a cena fique "vazia"
   *  esperando ser reconstruída. Usado por view3d.js só na colocação
   *  simples de um objeto (ferramenta "📦 Objeto") — o caso concreto
   *  relatado; parede/porta/janela continuam pelo caminho de reconstrução
   *  completa de sempre (`_rebuildScene`), já que essas SIM podem afetar a
   *  junção de cantos de outras paredes ou a posição de portas/janelas
   *  presas, o que exige recalcular a cena toda pra ficar coerente.
   *
   *  Efeito colateral aceito, documentado: o modo "leve" de luminárias
   *  (`_tintForLight`/`this._luzesLeves`) só é recalculado num `setScene`
   *  completo — se o objeto incremental for ELE MESMO uma luminária, a luz
   *  dela não vai "clarear" os objetos vizinhos até a PRÓXIMA reconstrução
   *  completa (qualquer parede/porta/janela mexida, ou reabrir o 3D). Um
   *  objeto comum (a grande maioria dos casos) não tem esse efeito nenhum.
   *
   *  Devolve `true` se conseguiu adicionar incrementalmente (cena já
   *  pronta) — quem chama deve cair pro caminho de sempre
   *  (`_rebuildScene`) quando devolver `false` (motor ainda carregando/sem
   *  cena montada, ver `_pendingScene`). */
  addObjectIncremental(obj) {
    if (!this._ready || !this._group || !this.mapData) return false;
    const wireframe = this.mode === 'wireframe';
    const colWireframe = 0x78c8ff; // MESMA constante de `setScene`, ver lá
    const childrenBefore = this._group.children.length;
    this._buildOneObjectMesh(obj, wireframe, colWireframe);
    this._applyObjMaterialOverride(obj, childrenBefore);
    // Mantém `this.mapData.objects` (a cópia própria do motor, já filtrada
    // por camada visível em view3d.js _rebuildScene) em sincronia — sem
    // isto, uma 2ª colocação incremental em seguida (antes de qualquer
    // reconstrução completa) não veria este objeto na lista, embora a
    // malha dele já esteja na cena (inofensivo hoje, já que nada mais lê
    // `this.mapData.objects` entre uma colocação e outra, mas evita
    // divergência silenciosa se algo passar a ler no futuro).
    if (!this.mapData.objects) this.mapData.objects = [];
    this.mapData.objects.push(obj);
    // Pós-passos baratos (ver comentário grande deles em `setScene`) — só
    // reordenam/registram malhas já existentes em `this._group` (incluindo
    // a nova), nenhum é uma reconstrução de geometria/material: seguro e
    // barato repetir a cada colocação incremental.
    if (wireframe) this._addWireframeOcclusion();
    if (this.mode === 'hibrido') this._setupHybridMeshes();
    this._setupCullMeshes();
    return true;
  }

  /** [15/09/2026 UTC] NOVO — pedido verbatim: "[No painel de Transformação
   *  do 'Ver em 3D'] deve ser aplicado em tempo real. Atualmente não está
   *  sendo aplicado as alterações em tempo real (no 3D), tendo que sair do
   *  3D e entrar de novo para ver as aplicações." A versão anterior
   *  (`view3d.js` `_refreshObjectLiveTransform`) tentava "remendar"
   *  position/rotation direto nas malhas já desenhadas — só achava UMA
   *  malha por objeto (`_pickMeshes.find`, não `.filter`), então objetos
   *  com várias malhas soltas (Mesa/Cadeira/Pilar/etc. — ver comentário
   *  grande no topo do arquivo sobre os builders dedicados) só tinham UMA
   *  parte atualizada e o resto ficava pra trás; e NUNCA tocava em
   *  `mesh.scale` — por isso a escala nunca aparecia em tempo real, e
   *  agora (depois de rotX/rotZ passarem a existir de verdade pra objetos
   *  comuns, ver `_applyObjectExtraTransform` acima) rotX/rotZ também
   *  ficariam pela metade do mesmo jeito.
   *
   *  CORREÇÃO — mesmo espírito de `addObjectIncremental` acima, só que pra
   *  um objeto que JÁ EXISTE na cena: remove TODAS as malhas antigas dele
   *  (achadas pelos NÓS DE TOPO de `this._group` — cobre tanto "várias
   *  malhas soltas direto em `_group`" quanto "um `THREE.Group` só,
   *  descendentes marcados por dentro" — caso de `.glb`/`.obj` importado,
   *  ver `_buildModeloArquivoMesh`; remover só o descendente, como a 1ª
   *  versão fazia, deixaria o Group pai órfão na cena, vazando memória) —
   *  dispose de geometria/material de cada uma — e RECONSTRÓI do zero com
   *  `_buildOneObjectMesh` (o MESMO dispatch de sempre, já com
   *  `_applyObjectExtraTransform` embutido) usando os valores JÁ SALVOS em
   *  `obj` (quem chama grava primeiro, refaz depois — ver
   *  `ModelerUI.buildStandaloneObjectTransformPanel` `persist()`). Garante
   *  o resultado CORRETO pra qualquer tipo de builder, sem duplicar
   *  fórmulas de posicionamento à mão. */
  rebuildObjectIncremental(obj) {
    if (!this._ready || !this._group || !this.mapData || !obj) return false;
    const eDeste = (n) => n?.userData?.pick?.ref === obj;
    const topoParaRemover = this._group.children.filter((node) => {
      if (eDeste(node)) return true;
      let achou = false;
      node?.traverse?.((n) => { if (eDeste(n)) achou = true; });
      return achou;
    });
    topoParaRemover.forEach((node) => {
      this._group.remove(node);
      node.traverse?.((n) => {
        if (!n.isMesh) return;
        n.geometry?.dispose?.();
        if (Array.isArray(n.material)) n.material.forEach((mt) => mt?.dispose?.());
        else n.material?.dispose?.();
      });
    });
    this._pickMeshes = this._pickMeshes.filter((m) => !eDeste(m));
    this.pickables = this.pickables.filter((p) => p?.ref !== obj);
    const wireframe = this.mode === 'wireframe';
    const colWireframe = 0x78c8ff; // MESMA constante de `setScene`/`addObjectIncremental`, ver lá
    const childrenBefore = this._group.children.length;
    this._buildOneObjectMesh(obj, wireframe, colWireframe);
    this._applyObjMaterialOverride(obj, childrenBefore);
    if (wireframe) this._addWireframeOcclusion();
    if (this.mode === 'hibrido') this._setupHybridMeshes();
    this._setupCullMeshes();
    return true;
  }

  /** Registra, após a cena inteira construída, as malhas de OBJETO/ITEM/
   *  CÂMERA elegíveis pro corte por distância de renderização (pedido do
   *  usuário: "crie uma opção para mudar o jeito com que os blocos de
   *  objetos são carregados e como é feita a decisão de renderizar ou não
   *  eles" — 'objeto' ou 'pedaço (chunk)', ver _updateDistanceCulling
   *  abaixo). MESMO filtro de tipo que _setupHybridMeshes (paredes/piso/
   *  porta/janela ficam de fora — são a estrutura do ambiente, sempre
   *  visíveis e poucas por natureza; o "excesso de objetos" que motiva este
   *  corte é móvel/item/câmera, que pode se acumular às centenas num mapa
   *  grande). Recalculado do zero a cada setScene — a lista de objetos pode
   *  ter mudado — inclusive o agrupamento em blocos (`_cullChunks`, usado só
   *  pelo modo 'chunk'), que fica invalidado (null) pra ser remontado na
   *  próxima chamada de _updateDistanceCulling. */
  _setupCullMeshes() {
    this._cullMeshes = [];
    this._cullChunks = null;
    this._cullChunksTam = null;
    this._group.children.forEach((m) => {
      const tipo = m.userData?.pick?.type;
      if (tipo !== 'object' && tipo !== 'item' && tipo !== 'camera') return;
      const p = m.userData.pick.pos;
      // [13/09/2026 UTC] NOVO — `piso` guardado junto (mesmo campo de
      // sempre, `ref.piso`, já usado pra empilhar andares — ver `baseY` em
      // `_buildOneObjectMesh`) pra `_updateSectorOcclusionCulling` (mais
      // abaixo) achar o setor de cada objeto sem precisar reconsultar
      // `userData.pick.ref` todo quadro.
      this._cullMeshes.push({ mesh: m, x: p.x, z: p.z, piso: m.userData.pick.ref?.piso || 0 });
    });
  }

  /** Lista (recalculada 1x por setScene, igual `_cullMeshes` acima) das
   *  malhas de parede/porta/janela — usada só por `_updateItemBadgeOcclusion`
   *  (chamada todo quadro em render()) pra testar, com um raycast bem
   *  barato, se existe algo BLOQUEANDO a visão até o selo "🔗 item
   *  associado" de um objeto, quando "Plaquinhas/bolinhas" está desligada em
   *  "Ver através das paredes" (⚙️ Configurações 3D — pedido do usuário,
   *  26/08/2026, 4ª rodada). Filtrada de `_pickMeshes` (não de `_group`,
   *  já que pedaços de porta/janela viram VÁRIAS malhas — moldura+vidro —
   *  todas com o MESMO `userData.pick`, mas cada uma precisa entrar aqui
   *  pra ser testada pelo raycast). Deliberadamente NÃO inclui objetos
   *  comuns (tipo 'object') — só paredes/portas/janelas contam como
   *  "bloqueio" pra este selo; um objeto na frente de outro objeto nunca
   *  esconde o selo dele (mesmo espírito de sempre: o selo é um indicador
   *  de busca, não uma peça real da cena, então só a ARQUITETURA do
   *  ambiente (paredes) deveria poder escondê-lo). */
  _setupWallOcclusionMeshes() {
    this._wallOcclusionMeshes = this._pickMeshes.filter((m) => {
      const t = m.userData?.pick?.type;
      return t === 'wall' || t === 'porta' || t === 'janela';
    });
  }

  /** [13/09/2026 UTC] NOVO — pedido verbatim do usuário: "No 'Ver em 3D',
   *  não há otimização o suficiente para quando for milhares de objetos.
   *  Fiz um teste, coloquei uma parede gigante de 160m de altura e 50m de
   *  largura de modo que cobrisse o que estava atrás. Coloquei 2744 objetos
   *  atrás da parede e o fps ficava baixo enquanto o personagem estava do
   *  outro lado desta parede (onde não tinha os objetos) e estava apontando
   *  para esta parede. Não deveria ser assim. Deveria ser considerado,
   *  nesta situação, apenas o objeto parede, não o que estava atrás dela.
   *  Implemente o sistema completo de oclusão por paredes/setores
   *  (BSP/PVS). Já deve ter algo implementado no projeto. Parta de onde
   *  parou (se for o caso)."
   *
   *  ONDE O PROJETO JÁ ESTAVA (levantado antes de escrever qualquer coisa
   *  nova, exatamente o pedido de "partir de onde parou"): nenhuma
   *  otimização existente resolvia este caso.
   *   - O frustum culling por piso (`_rebuildInstancedPools`, rodada
   *     "frustum culling" já concluída — ver comentário grande lá) só corta
   *     ANDARES INTEIROS fora do campo de visão; dentro do MESMO andar, o
   *     three.js só descarta um `InstancedMesh`/malha por frustum quando
   *     ela está fora do ÂNGULO de visão — um objeto atrás de uma parede
   *     mas DENTRO do ângulo (o jogador "apontando pra parede", exatamente
   *     o teste do pedido) nunca é cortado por frustum: o three.js não tem
   *     noção nenhuma de "existe uma parede opaca no meio do caminho" (o
   *     z-buffer da GPU evita o CUSTO de pintar o pixel errado, mas o
   *     vértice/draw call do objeto escondido continua acontecendo do
   *     mesmo jeito).
   *   - `_updateDistanceCulling` (logo abaixo) só olha DISTÂNCIA — sem
   *     nenhuma noção de "tem parede no meio", não ajuda aqui (os 2744
   *     objetos do teste podem estar bem dentro da distância de
   *     renderização).
   *   - `_updateItemBadgeOcclusion` (mais abaixo) já faz um raycast contra
   *     `_wallOcclusionMeshes` — mas só pras PLAQUINHAS/selos (poucas
   *     visíveis por vez); um raycast por OBJETO, milhares de vezes por
   *     quadro, seria caro demais — não dava pra só reaproveitar aquilo
   *     aqui.
   *  Ou seja: não havia nenhuma oclusão por parede pra objeto comum — este
   *  sistema é NOVO do zero, não uma continuação de código já existente.
   *
   *  SOLUÇÃO — "setores" por andar, particionados pelas paredes (a versão
   *  do "BSP/PVS" pedido adaptada ao formato de mapa deste projeto: paredes
   *  retas numa planta baixa 2D por piso, não uma malha 3D arbitrária —
   *  um BSP tradicional particiona geometria 3D genérica; aqui a planta
   *  baixa já É a partição natural, então o "BSP" vira uma grade 2D e o
   *  "PVS" vira "mesmo setor conectado = visível, setor diferente = não"):
   *
   *  1. Esta função (`_buildOcclusionSectors`, chamada 1x por `setScene`,
   *     NUNCA por quadro — é aqui que mora o custo "caro" deste sistema,
   *     pago só ao abrir o 3D/editar paredes, nunca durante o passeio)
   *     desenha uma grade 2D (`OCC_CELL_SIZE` metros por célula) POR ANDAR,
   *     marcando como "bloqueada" toda célula coberta por um trecho MACIÇO
   *     de parede — reaproveita o MESMO cálculo de vãos de porta/janela de
   *     `addWallBox` (acima, dentro de `setScene`): um vão sem folha nunca
   *     bloqueia; uma porta FECHADA bloqueia igual parede maciça ali; uma
   *     JANELA NUNCA bloqueia (é vidro — dá pra ver através dela mesmo
   *     "fechada", ver `setGlobalXRay` acima: "não existe uma noção de
   *     aberta/fechada pra janela"). Em seguida, um flood-fill (pilha
   *     explícita, célula a célula) rotula cada REGIÃO CONECTADA de
   *     células livres com um `sectorId` próprio — duas salas ligadas por
   *     um vão aberto (porta sem folha, buraco na parede, ou uma janela)
   *     caem no MESMO setor (visão livre entre as duas, de propósito — ver
   *     limitação abaixo); a sala de TESTE do pedido (parede maciça de
   *     360°, sem vão nenhum) sempre cai num setor DIFERENTE de tudo que
   *     está do lado de fora.
   *  2. `_sectorIdAt(piso, x, z)` — 1 acesso de array (O(1), SEM raycast)
   *     que devolve o `sectorId` de qualquer ponto do mundo.
   *  3. `_updateSectorOcclusionCulling(camera)` (chamado todo quadro, ver
   *     `render()` mais abaixo — logo DEPOIS de `_updateDistanceCulling`,
   *     cuja decisão por distância continua valendo pra objetos do MESMO
   *     setor da câmera): acha o setor DA CÂMERA (1 lookup) e, pra cada
   *     objeto/item/câmera de `_cullMeshes` (a MESMA lista de
   *     `_updateDistanceCulling` — nenhuma lista nova percorrida todo
   *     quadro), se o setor dele for DIFERENTE do da câmera, força
   *     `mesh.visible = false` (e sincroniza a instância do pool, ver
   *     `_syncInstanceVisibility`) — SEM raycast nenhum, custo O(nº de
   *     objetos) de comparações de inteiro por quadro, desprezível mesmo
   *     com milhares de objetos. Reproduzindo o teste do pedido: os 2744
   *     objetos atrás da parede caem num `sectorId` diferente do lado onde
   *     o personagem está — passam a ser TODOS pulados (nem entram no
   *     draw call) enquanto o personagem estiver do outro lado, exatamente
   *     "deveria ser considerado apenas o objeto parede".
   *
   *  LIMITAÇÕES HONESTAS (documentadas de propósito — escopo/risco, sem
   *  poder testar ao vivo nesta sessão, ver "REGRA ATUAL DE VERIFICAÇÃO" no
   *  progresso da sessão):
   *  - Dois setores ligados por um vão (porta aberta/sem folha, buraco,
   *    janela) viram UM SÓ setor — sem NENHUMA oclusão entre os dois, por
   *    mais longe que a câmera esteja do vão. Isto NÃO é um portal-PVS de
   *    verdade (que só mostraria, através do vão, o que o "cone" dele
   *    enquadra de dentro da sala vizinha) — é um modelo mais simples e
   *    mais SEGURO (nunca esconde algo que deveria aparecer), só menos
   *    agressivo perto de vãos largos/muitos cômodos conectados em cadeia.
   *  - Grade 2D (planta baixa) — não distingue altura DENTRO do mesmo
   *    `piso`: um mezanino/varanda aberta acima de uma sala fechada no
   *    MESMO andar cairia no mesmo cálculo 2D; cenário raro no formato de
   *    mapa deste projeto (andares empilhados por `obj.piso`), não tratado.
   *  - Andar com grade grande demais (> `OCC_MAX_CELLS_POR_ANDAR` células):
   *    fica de FORA do sistema (nenhuma entrada em `_occ.byFloor` pra ele)
   *    — comportamento IDÊNTICO a antes desta rodada só pra esse andar
   *    (nunca esconde nada errado, só deixa de otimizar ali), nunca trava o
   *    navegador tentando montar uma grade absurda.
   *  - Câmera/objeto sem `sectorId` (fora da grade, andar sem grade
   *    montada, ou em cima de uma célula bloqueada — raro, câmera "dentro"
   *    da espessura de uma parede): tratado como "sem informação", NUNCA
   *    usado pra esconder nada — só deixa de otimizar nesse caso, mesmo
   *    princípio de segurança do item acima. */
  _buildOcclusionSectors(mapData) {
    const OCC_CELL_SIZE = 0.5; // metros por célula da grade de setores
    const OCC_MAX_CELLS_POR_ANDAR = 260000; // trava de segurança, ver limitação acima
    this._occ = null;
    const walls = mapData.walls || [];
    if (!walls.length) return; // nenhuma parede no mapa — nada a particionar, todo objeto continua sempre visível (comportamento de sempre)
    const fi = this._floorInfo;
    if (!fi) return; // defensivo — nunca deveria acontecer (setScene sempre monta _floorInfo bem antes deste ponto)
    const PAD = 2; // margem em metros além da área mapeada (mesma área usada pelo hoverPick do chão, ver _floorInfo acima)
    const minX = fi.minX - PAD, minZ = fi.minZ - PAD;
    const cols = Math.max(1, Math.ceil((fi.maxX + PAD - minX) / OCC_CELL_SIZE));
    const rows = Math.max(1, Math.ceil((fi.maxZ + PAD - minZ) / OCC_CELL_SIZE));
    const portas = mapData.portas || [];
    const janelas = mapData.janelas || [];
    const byFloor = new Map();
    const pisos = new Set(walls.map((w) => w.piso || 0));
    pisos.forEach((piso) => {
      if (cols * rows > OCC_MAX_CELLS_POR_ANDAR) return; // ver limitação "andar com grade grande demais" acima — andar fica de fora, sem entrada no Map
      const blocked = new Uint8Array(cols * rows);
      const markCell = (x, z) => {
        const cx = Math.floor((x - minX) / OCC_CELL_SIZE);
        const cz = Math.floor((z - minZ) / OCC_CELL_SIZE);
        if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return;
        blocked[cz * cols + cx] = 1;
      };
      const rasterizeSegment = (x1, z1, x2, z2) => {
        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) { markCell(x1, z1); return; }
        const ux = dx / len, uz = dz / len;
        const nx = -uz, nz = ux; // normal unitária — "engorda" a linha pela espessura da parede
        const half = (WALL_THICKNESS_3D / 2) + OCC_CELL_SIZE * 0.5; // margem extra de meia célula: garante que a parede NUNCA "vaza" um buraco de 1 célula por arredondamento da grade
        const step = OCC_CELL_SIZE / 3; // passo bem menor que 1 célula — nenhum trecho da parede fica sem amostra
        for (let t = 0; t <= len + 1e-6; t += step) {
          const px = x1 + ux * t, pz = z1 + uz * t;
          markCell(px + nx * half, pz + nz * half);
          markCell(px - nx * half, pz - nz * half);
          markCell(px, pz);
        }
      };
      walls.filter((w) => (w.piso || 0) === piso).forEach((w) => {
        const dx = w.x2 - w.x1, dz = w.y2 - w.y1;
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) return;
        const ux = dx / len, uz = dz / len;
        // MESMO cálculo de vãos de `addWallBox` (dentro de `setScene`,
        // acima) — vãos sempre existem geometricamente (aberta ou fechada,
        // ver comentário grande de `addWallBox`); aqui só decidimos, PRA
        // CADA vão, se ele deve ficar BLOQUEADO pra visão (porta fechada)
        // ou LIVRE (porta aberta/sem folha, ou janela — nunca bloqueia).
        const openings = [
          ...portas.filter((d) => d.parentWallId === w.id).map((d) => ({
            t0: Utils.clamp((d.posAoLongoDaParede || 0) - (d.largura || 0.8) / 2, 0, len),
            t1: Utils.clamp((d.posAoLongoDaParede || 0) + (d.largura || 0.8) / 2, 0, len),
            bloqueiaComoParede: !d.aberta,
          })),
          ...janelas.filter((j) => j.parentWallId === w.id).map((j) => ({
            t0: Utils.clamp((j.posAoLongoDaParede || 0) - (j.largura || 1.2) / 2, 0, len),
            t1: Utils.clamp((j.posAoLongoDaParede || 0) + (j.largura || 1.2) / 2, 0, len),
            bloqueiaComoParede: false, // janela: vidro, nunca bloqueia — ver comentário grande acima
          })),
        ].filter((o) => o.t1 - o.t0 > 1e-3).sort((a, b) => a.t0 - b.t0);
        if (!openings.length) {
          rasterizeSegment(w.x1, w.y1, w.x2, w.y2); // sem vão nenhum — parede maciça do início ao fim, igual addWallBox
          return;
        }
        let cursor = 0;
        openings.forEach((o) => {
          if (o.t0 > cursor) rasterizeSegment(w.x1 + ux * cursor, w.y1 + uz * cursor, w.x1 + ux * o.t0, w.y1 + uz * o.t0);
          if (o.bloqueiaComoParede) rasterizeSegment(w.x1 + ux * o.t0, w.y1 + uz * o.t0, w.x1 + ux * o.t1, w.y1 + uz * o.t1);
          cursor = Math.max(cursor, o.t1);
        });
        if (cursor < len) rasterizeSegment(w.x1 + ux * cursor, w.y1 + uz * cursor, w.x2, w.y2);
      });
      // Flood-fill iterativo (pilha explícita — NUNCA recursão, uma grade
      // grande estouraria a pilha de chamadas do JS) — rotula cada região
      // CONECTADA de células livres com um sectorId próprio.
      const sectorId = new Int32Array(cols * rows).fill(-1);
      let nextSector = 0;
      const stack = [];
      for (let i = 0; i < blocked.length; i++) {
        if (blocked[i] || sectorId[i] !== -1) continue;
        const id = nextSector++;
        sectorId[i] = id;
        stack.push(i);
        while (stack.length) {
          const cur = stack.pop();
          const cx = cur % cols, cz = (cur / cols) | 0;
          if (cx > 0) { const n = cur - 1; if (!blocked[n] && sectorId[n] === -1) { sectorId[n] = id; stack.push(n); } }
          if (cx < cols - 1) { const n = cur + 1; if (!blocked[n] && sectorId[n] === -1) { sectorId[n] = id; stack.push(n); } }
          if (cz > 0) { const n = cur - cols; if (!blocked[n] && sectorId[n] === -1) { sectorId[n] = id; stack.push(n); } }
          if (cz < rows - 1) { const n = cur + cols; if (!blocked[n] && sectorId[n] === -1) { sectorId[n] = id; stack.push(n); } }
        }
      }
      byFloor.set(piso, { sectorId, nextSector });
    });
    if (!byFloor.size) return; // todos os andares excederam a trava de segurança — sem oclusão por setor nenhuma, comportamento de sempre
    this._occ = { cellSize: OCC_CELL_SIZE, minX, minZ, cols, rows, byFloor };
  }

  /** [13/09/2026 UTC] NOVO — setor de um ponto do mundo (`x,z`, no andar
   *  `piso`), ver comentário grande de `_buildOcclusionSectors` acima pro
   *  sistema completo. O(1), 1 acesso de array, SEM raycast. `null` = "sem
   *  informação" (fora da grade, andar sem grade montada, ou em cima de uma
   *  célula bloqueada) — nunca usado pra esconder nada, só pra decidir "não
   *  otimiza aqui", ver `_updateSectorOcclusionCulling` logo abaixo. */
  _sectorIdAt(piso, x, z) {
    const occ = this._occ;
    if (!occ) return null;
    const floor = occ.byFloor.get(piso || 0);
    if (!floor) return null;
    const cx = Math.floor((x - occ.minX) / occ.cellSize);
    const cz = Math.floor((z - occ.minZ) / occ.cellSize);
    if (cx < 0 || cz < 0 || cx >= occ.cols || cz >= occ.rows) return null;
    const id = floor.sectorId[cz * occ.cols + cx];
    return id === -1 ? null : id;
  }

  /** [13/09/2026 UTC] NOVO — chamado todo quadro por `render()`, logo DEPOIS
   *  de `_updateDistanceCulling` (ver comentário grande de
   *  `_buildOcclusionSectors`, acima, pro sistema completo/pedido/motivo).
   *  Reaproveita `this._cullMeshes` (mesma lista da distância) — nenhum
   *  raycast, só comparação de `sectorId` (inteiro). Só ESCONDE (nunca
   *  reexibe: quem decide "visível por distância" continua sendo
   *  `_updateDistanceCulling`, chamado logo antes) — um objeto no MESMO
   *  setor da câmera não é tocado aqui, mantém o que a distância já
   *  decidiu. */
  _updateSectorOcclusionCulling(camera) {
    const occ = this._occ;
    const lista = this._cullMeshes;
    if (!occ || !lista?.length) return;
    const alturaPiso = this.mapData?.alturaPiso || 2.8;
    const pisoCamera = Math.floor((camera.y || 0) / alturaPiso);
    const setorCamera = this._sectorIdAt(pisoCamera, camera.x, camera.z);
    if (setorCamera === null) return; // câmera sem informação de setor — não otimiza este quadro, ver limitações
    const forcado = this._forcedHiddenMeshes;
    lista.forEach((c) => {
      if (forcado && forcado.has(c.mesh)) return; // `_updateDistanceCulling` já tratou — prioridade absoluta continua lá
      if (!c.mesh.visible) return; // já escondido (por distância) — nada a fazer aqui
      const setorObjeto = this._sectorIdAt(c.piso, c.x, c.z);
      if (setorObjeto === null || setorObjeto === setorCamera) return; // sem informação, ou mesmo setor — mantém como estava
      c.mesh.visible = false;
      this._syncInstanceVisibility(c.mesh);
    });
  }

  /** Chamado a cada quadro (ver render() abaixo) — decide, por distância até
   *  a câmera, o que fica visível entre os objetos/itens/câmeras do mapa.
   *  Hoje (antes deste pedido) a "Distância de renderização" configurada em
   *  ⚙️ só afetava a neblina (scene.fog) e o far-plane da câmera — tudo
   *  continuava sendo desenhado de verdade (draw call + vértices na GPU),
   *  só ficando escondido visualmente pela neblina; num mapa com muitos
   *  objetos espalhados por uma área grande, isso desperdiça GPU/CPU
   *  desenhando coisa que a neblina ia esconder de qualquer jeito. Dois
   *  modos (mapconfig.js `objetoRenderModo`, pedido do usuário):
   *   - 'objeto' (padrão): testa CADA objeto contra a distância — simples e
   *     sempre exato, custo O(nº de objetos) por quadro (barato: só
   *     hipotenusas, nunca colisão de verdade).
   *   - 'chunk': agrupa os objetos em blocos quadrados de
   *     `objetoChunkTamanho` metros (calculado uma vez aqui, na 1ª chamada
   *     depois de cada setScene, e reaproveitado nos quadros seguintes) e
   *     testa o BLOCO (ponto da borda dele mais próximo da câmera), não
   *     cada objeto — custo O(nº de blocos), bem menor que O(nº de
   *     objetos) quando há MUITOS objetos concentrados em poucas áreas do
   *     mapa. Em troca, um bloco só PARCIALMENTE fora do alcance continua
   *     mostrando TUDO que tem dentro (corte mais grosseiro, "tudo ou nada"
   *     por bloco, nunca corta um objeto sozinho no meio do caminho). */
  _updateDistanceCulling(camera) {
    const lista = this._cullMeshes;
    if (!lista?.length) return;
    // [13/09/2026] NOVO — pedido verbatim (revisão de performance): "objetos
    // além do plano de corte distante (z_far) nunca precisam ser
    // processados, pois o Three.js já os cortaria visualmente de qualquer
    // jeito — mas sem isso o CPU/GPU ainda gasta trabalho com eles." Antes
    // desta mudança, este método só comparava contra `rd` (a "Distância de
    // renderização"/neblina, ver `_renderDistance()`) — em TODOS os casos
    // de sempre isso já bastava, porque `camera3.far` sempre foi calculado
    // a partir do PRÓPRIO `rd` (`Math.max(rd*2.4, 60)`, ver
    // `_initThree`/`setConfig` — sempre ≥ `rd`, nunca menor). Agora que
    // existe um "Fim" (z_far) configurável independente em "Desempenho 3D"
    // (ver mapconfig.js DEFAULTS.cameraZFar/_wireDesempenho3DCamPlanes),
    // esse invariante deixou de valer: um usuário pode setar `cameraZFar`
    // BEM menor que `rd` — nesse caso o Three.js já clipa visualmente tudo
    // além de `camera3.far`, mas SEM este `Math.min` este método continuaria
    // marcando `mesh.visible = true` (e sincronizando a instância) pra
    // objetos entre `camera3.far` e `rd`, desperdiçando processamento de
    // vértice/matriz de instância pra algo que nunca aparece na tela.
    // `Math.min` é seguro em QUALQUER cenário (inclusive o de sempre, onde
    // `camera3.far` já é ≥ `rd` — o `Math.min` então vira `rd` de novo,
    // ZERO mudança de comportamento) — nunca esconde algo que deveria estar
    // visível, só evita processar cedo demais o que já seria cortado.
    const rd = Math.min(this._renderDistance(), this.camera3?.far ?? Infinity);
    const modo = this._config.objetoRenderModo || 'objeto';
    // [14/09/2026] CORRIGIDO — pedido verbatim: "ao clicar em uma câmera e
    // selecionar 'Ver através desta câmera' [...] o cone da câmera
    // selecionada acaba voltando a parecer e fica na frente da tela." BUG
    // CONFIRMADO (via Playwright, live): este método roda TODO QUADRO e
    // trata câmeras como qualquer objeto normal sujeito a corte por
    // distância (`_setupCullMeshes`, `tipo === 'camera'`) — a câmera "vista
    // através" está a distância ZERO do olho de render, então `0 <= rd`
    // sempre dá verdadeiro, e este método reatribuía `mesh.visible = true`
    // TODO QUADRO, desfazendo `setCameraMeshVisible(camId,false)`
    // (view3d.js `_enterCameraOrbView`) segundos (na prática, quadros)
    // depois de chamado — nunca ficava escondido por muito tempo, só
    // parecia "sumir e voltar". CORRIGIDO: `this._forcedHiddenMeshes` (Set
    // mantido por `setCameraMeshVisible`/`setFotoMeshVisible`, ver
    // comentário grande lá) tem prioridade ABSOLUTA sobre o cálculo de
    // distância — uma malha nele NUNCA é marcada visível por este método,
    // não importa a distância.
    const forcado = this._forcedHiddenMeshes;
    if (modo === 'chunk') {
      const tam = Math.max(2, Number(this._config.objetoChunkTamanho) || 10);
      if (!this._cullChunks || this._cullChunksTam !== tam) {
        const chunks = new Map();
        lista.forEach((c) => {
          const cx = Math.floor(c.x / tam), cz = Math.floor(c.z / tam);
          const key = `${cx},${cz}`;
          let chunk = chunks.get(key);
          if (!chunk) { chunk = { minX: cx * tam, maxX: (cx + 1) * tam, minZ: cz * tam, maxZ: (cz + 1) * tam, items: [] }; chunks.set(key, chunk); }
          chunk.items.push(c.mesh);
        });
        this._cullChunks = [...chunks.values()];
        this._cullChunksTam = tam;
      }
      this._cullChunks.forEach((chunk) => {
        // Distância da câmera até o PONTO MAIS PRÓXIMO da borda do bloco
        // (clamp nos limites dele) — um bloco só fica invisível quando
        // INTEIRO já passou da distância de renderização.
        const nx = Utils.clamp(camera.x, chunk.minX, chunk.maxX);
        const nz = Utils.clamp(camera.z, chunk.minZ, chunk.maxZ);
        const visivel = Math.hypot(camera.x - nx, camera.z - nz) <= rd;
        chunk.items.forEach((m) => {
          m.visible = (forcado && forcado.has(m)) ? false : visivel;
          // [26/09/2026] NOVO — ver `_syncInstanceVisibility`/comentário
          // grande em `this._instancedPools` (constructor): mantém a
          // instância (se houver) desta malha em sincronia com `m.visible`
          // acabado de calcular.
          this._syncInstanceVisibility(m);
        });
      });
    } else {
      lista.forEach((c) => {
        const visivel = Math.hypot(c.x - camera.x, c.z - camera.z) <= rd;
        c.mesh.visible = (forcado && forcado.has(c.mesh)) ? false : visivel;
        this._syncInstanceVisibility(c.mesh);
      });
    }
  }

  /** [13/09/2026 UTC] NOVO — pedido verbatim do usuário: "No 'Ver em 3D',
   *  nas 'configurações 3D', na seção 'Desempenho 3D', coloque uma
   *  subseção para definir um limite de objetos a serem renderizados por
   *  frame. Quando o contador atingir este limite, nenhum outro objeto é
   *  mais desenhado, pulando, então, para o próximo frame. Por exemplo,
   *  tendo um limite de 1500 objetos, mesmo tendo 2700 objetos para serem
   *  desenhados dentro da cena por aquela perspectiva, então, o último
   *  objeto a ser desenhado é quando o contador for incrementado para
   *  1500, depois disso, vai para o próximo quadro (ou seja, nenhum objeto
   *  é mais renderizado naquela cena). Se já não houver e não for custoso
   *  para o processamento, o que está mais próximo do personagem é que
   *  deve ter maior prioridade. Para a situação em que se atinja o limite
   *  e algo que está perto não seja desenhado, mas algo que está distante
   *  e nem precisaria ser desenhado, acaba por ser desenhado e
   *  contabilizando no contador. Por padrão o valor deve ser 1200 objetos.
   *  Apesar dos objetos acabarem ficando de fora da renderização da cena,
   *  as lógicas devem continuar a serem feita. Por exemplo, scripts de
   *  animação e rotinas de NPCs."
   *
   *  Diferente de `_updateDistanceCulling`/`_updateSectorOcclusionCulling`
   *  (acima) — que escondem de vez quem está fora da distância/setor,
   *  pouco importando quantos sobram — este é um ORÇAMENTO por quadro:
   *  roda por ÚLTIMO (ver `render()`), só sobre quem JÁ sobreviveu aos
   *  outros dois cortes, e ORDENA por distância até a câmera antes de
   *  aplicar o limite — exatamente "o que está mais próximo... maior
   *  prioridade", evitando o cenário descrito de um objeto perto ficar de
   *  fora enquanto um distante (que já devia ter sido cortado por
   *  distância/setor, mas por algum motivo não foi) consome vaga do
   *  contador. `this._config.objetoLimitePorFrameAtivo === false` desliga
   *  o sistema inteiro (nenhum custo extra por quadro além do check).
   *
   *  "As lógicas devem continuar a serem feita" — este método SÓ mexe em
   *  `mesh.visible` (e a instância correspondente, via
   *  `_syncInstanceVisibility`), exatamente como os outros dois cortes
   *  acima — nunca em `this.mapData`/nos dados do objeto, nem pausa
   *  `_updateScriptLifecycle`/`_updateCamerasLive` (chamados à parte, ver
   *  `render()`, e sempre percorrem os dados de script/câmera do mapa
   *  inteiro, não a lista de malhas visíveis) — um NPC/câmera fora do
   *  orçamento deste quadro continua avançando o roteiro dele normalmente,
   *  só a malha não é desenhada.
   *
   *  Custo: um `sort` (O(n log n)) só quando há MAIS candidatos que o
   *  limite (a saída antecipada de baixo evita o sort inteiro no caso
   *  comum de mapas pequenos) — aceitável mesmo com milhares de objetos
   *  (é exatamente o cenário que motivou o pedido, "2700 objetos"). */
  _updateFrameBudgetCulling(camera) {
    const lista = this._cullMeshes;
    if (!lista?.length) return;
    if (this._config?.objetoLimitePorFrameAtivo === false) return;
    const limite = Math.max(1, Math.round(Number(this._config?.objetoLimitePorFrame) || 1200));
    const forcado = this._forcedHiddenMeshes;
    // Só entram no orçamento quem SOBREVIVEU aos cortes de distância/setor
    // (chamados logo antes, ver render()) — um objeto já escondido por eles
    // não "gasta vaga" nem precisa ser reavaliado aqui.
    const candidatos = [];
    for (let i = 0; i < lista.length; i++) {
      const c = lista[i];
      if (!c.mesh.visible) continue;
      if (forcado && forcado.has(c.mesh)) continue;
      candidatos.push(c);
    }
    if (candidatos.length <= limite) return; // dentro do orçamento — nada a esconder
    candidatos.forEach((c) => { c._d2 = (c.x - camera.x) ** 2 + (c.z - camera.z) ** 2; });
    candidatos.sort((a, b) => a._d2 - b._d2); // mais perto primeiro — "maior prioridade"
    for (let i = limite; i < candidatos.length; i++) {
      candidatos[i].mesh.visible = false;
      this._syncInstanceVisibility(candidatos[i].mesh);
    }
  }

  // ---------- Junção das quinas (estilo "🧱 Parede" › "Estilo de junção
  // das quinas", ver mapconfig.js `paredeJuncaoTipo`) — pedido do usuário
  // (24/08/2026), com uma imagem de referência (Paint.NET) mostrando, em
  // vermelho, a sobra visível quando duas paredes se encontram fora de 90°.
  //
  // EQUACIONAMENTO (importante entender antes de mexer aqui):
  // Cada parede continua sendo, como sempre foi, uma caixa reta (extrudada
  // de x1,y1 até x2,y2 — ver addWallBox acima) — este projeto não tem lib
  // de CSG/boolean (mesmo motivo do corte de vão de porta/janela por
  // SEGMENTAÇÃO, ver comentário grande lá em cima), então NADA aqui corta
  // ou encolhe a caixa de nenhuma parede. Em vez disso, uma quina de duas
  // paredes que se encontram numa PONTA comum (P) só tem um problema
  // visível: no lado CÔNCAVO da quina (o lado onde as duas paredes "se
  // afastam" uma da outra ao se afastar de P), sobra uma pequena FRINCHA
  // triangular não coberta por nenhuma das duas caixas — é essa frincha que
  // a imagem do usuário mostra em vermelho. (Do lado OPOSTO/convexo, as
  // duas caixas já se sobrepõem uma na outra sem problema nenhum — mesma
  // cor, invisível, nada a corrigir.)
  //
  // A 90° exatos essa frincha encolhe pra zero (por isso "atual" sempre
  // pareceu certo em cantos ortogonais) — em qualquer outro ângulo ela
  // aparece, do tamanho que for. Os 4 tipos abaixo (bevel/square/round/miter)
  // são só formatos DIFERENTES de uma "capa" ADICIONADA por cima pra tapar
  // exatamente essa frincha — nunca uma peça subtrativa:
  //   - bevel:  um triângulo reto (corte chanfrado) fechando a frincha.
  //   - square: o mesmo triângulo + uma pequena aba quadrada esticada pra
  //             fora (visual de poste na quina).
  //   - round:  um arco (raio = metade da espessura da parede, centro em P)
  //             fechando a frincha com uma curva em vez de um corte reto.
  //   - miter:  estica as DUAS paredes até o ponto exato onde as bordas
  //             delas se cruzariam se continuassem — o "bico" pedido a
  //             partir da imagem (mesma ideia do stroke-linejoin:miter do
  //             SVG/CSS, só que em 3D) — com um limite (MITER_LIMIT_DIST,
  //             mesmo espírito do "miter limit" do SVG) que cai pro bevel
  //             em ângulos rasos demais, pra não esticar um bico absurdo.
  // ----------

  /** Acha, entre as paredes JÁ ANALISADAS (Mapping.analyzeWalls — pontas
   *  próximas já viraram a MESMA coordenada exata), todo canto onde
   *  EXATAMENTE DUAS pontas (de paredes diferentes) coincidem — o único
   *  caso tratado pelos tipos de junção acima. Uma ponta sozinha é uma
   *  ponta solta (nada a fazer); 3 ou mais pontas no mesmo ponto é um
   *  cruzamento em "T"/"X" — fora do escopo desta rodada (o pedido do
   *  usuário falava especificamente de "junção de DUAS paredes"); esses
   *  cruzamentos continuam desenhados do jeito de sempre, sem capa nenhuma
   *  (as caixas retas de cada parede já se encontram lá normalmente). */
  _detectWallCorners(walls) {
    const EPS = 1e-4;
    const key = (x, z) => `${Math.round(x / EPS)}_${Math.round(z / EPS)}`;
    const groups = new Map();
    (walls || []).forEach((w) => {
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (len < 1e-4) return; // parede de comprimento ~0 — não deveria existir, mas por segurança
      [
        { x: w.x1, z: w.y1, farX: w.x2, farZ: w.y2 },
        { x: w.x2, z: w.y2, farX: w.x1, farZ: w.y1 },
      ].forEach((end) => {
        const k = key(end.x, end.z);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push({ wall: w, x: end.x, z: end.z, farX: end.farX, farZ: end.farZ });
      });
    });
    const corners = [];
    groups.forEach((ends) => {
      if (ends.length !== 2) return;
      const [a, b] = ends;
      if (a.wall.id === b.wall.id) return; // as duas pontas da MESMA parede "se encontrando" (parede fechada em si mesma) — sem sentido de canto aqui
      corners.push({
        x: a.x, z: a.z,
        wallA: a.wall, farA: { x: a.farX, z: a.farZ },
        wallB: b.wall, farB: { x: b.farX, z: b.farZ },
      });
    });
    return corners;
  }

  /** Monta a "capa" de preenchimento da frincha côncava de UM canto (ver
   *  equacionamento grande acima) — devolve um THREE.Mesh pronto pra
   *  adicionar em `this._group`, ou `null` quando o canto não precisa (ou
   *  não dá, com segurança, pra tratar — ex.: paredes quase retas/paralelas
   *  aqui, sem canto de verdade nenhum pra fechar). `capMaterial` já vem
   *  pronto de quem chama (compartilhado entre todos os cantos da cena —
   *  ver setScene). */
  _buildCornerFillMesh(THREE, corner, joinType, capMaterial, wallHFallback) {
    const half = WALL_THICKNESS_3D / 2;
    const P = { x: corner.x, z: corner.z };
    const dA = { x: corner.farA.x - P.x, z: corner.farA.z - P.z };
    const dB = { x: corner.farB.x - P.x, z: corner.farB.z - P.z };
    const lenA = Math.hypot(dA.x, dA.z), lenB = Math.hypot(dB.x, dB.z);
    if (lenA < 1e-4 || lenB < 1e-4) return null;
    const uA = { x: dA.x / lenA, z: dA.z / lenA };
    const uB = { x: dB.x / lenB, z: dB.z / lenB };
    // Perpendicular de cada parede — MESMA convenção usada por addWallBox
    // (rotY = atan2(dx,dz); o eixo local X da caixa, que é a espessura,
    // mapeia pro mundo como (dz/len,-dx/len)) — precisa ser EXATAMENTE esta
    // pra a capa encaixar sem frincha nem sobreposição com a caixa de
    // verdade da própria parede.
    const nA = { x: uA.z, z: -uA.x };
    const nB = { x: uB.z, z: -uB.x };

    // Direção de "entrando em P" (parede A) seguida de "saindo de P"
    // (parede B) — trata o canto como se fosse um único caminho dobrando em
    // P (mesma formulação clássica de "miter join" de traço 2D — SVG/Cairo/
    // etc — só que as duas paredes daqui realmente COMEÇAM em P, não é um
    // traço contínuo; ver `cross` abaixo, só usado pra descartar retas
    // quase coincidentes, a ESCOLHA de qual lado é a frincha vem do sinal
    // de t/s calculado logo abaixo, não deste cross).
    const d1 = { x: -uA.x, z: -uA.z };
    const d2 = uB;
    const cross = d1.x * d2.z - d1.z * d2.x;
    if (Math.abs(cross) < 1e-3) return null; // paredes quase retas/paralelas aqui — sem canto de verdade, mantém "atual"

    // Interseção de 2 retas — devolve também t/s (a quantos metros de P,
    // ao longo de cada parede, fica o cruzamento) pra saber de que LADO do
    // canto (côncavo/frincha ou convexo/sobreposição) cada uma cai.
    const intersect = (p1, dir1, p2, dir2) => {
      const denom = dir1.x * dir2.z - dir1.z * dir2.x;
      if (Math.abs(denom) < 1e-9) return null;
      const dx = p2.x - p1.x, dz = p2.z - p1.z;
      const t = (dx * dir2.z - dz * dir2.x) / denom;
      const s = (dx * dir1.z - dz * dir1.x) / denom;
      return { t, s, x: p1.x + dir1.x * t, z: p1.z + dir1.z * t };
    };
    // ML: borda "+nA" de A × borda "-nB" de B. MR: borda "-nA" de A × borda
    // "+nB" de B — as DUAS combinações "cruzadas" (nunca +/+  nem -/-, que
    // não representam nenhuma borda relevante de verdade). Uma das duas dá
    // t<0 E s<0 (cruza "atrás" das duas paredes, do lado de FORA de onde
    // elas realmente se estendem) — essa é sempre o lado da FRINCHA côncava
    // (é matematicamente onde as bordas TERIAM que se encontrar pra fechar
    // o buraco, mas nenhuma caixa reta chega lá). A outra dá t>0 e s>0 —
    // lado da sobreposição, já coberto pelas duas caixas, sem problema.
    const ML = intersect({ x: P.x + nA.x * half, z: P.z + nA.z * half }, uA, { x: P.x - nB.x * half, z: P.z - nB.z * half }, uB);
    const MR = intersect({ x: P.x - nA.x * half, z: P.z - nA.z * half }, uA, { x: P.x + nB.x * half, z: P.z + nB.z * half }, uB);
    let gap, gapSignA, gapSignB;
    if (ML && ML.t < 0 && ML.s < 0) { gap = ML; gapSignA = 1; gapSignB = -1; }
    else if (MR && MR.t < 0 && MR.s < 0) { gap = MR; gapSignA = -1; gapSignB = 1; }
    else return null; // nenhuma das duas bate o critério esperado — canto degenerado/nada a fazer, mantém "atual"

    const gapPointA = { x: P.x + nA.x * half * gapSignA, z: P.z + nA.z * half * gapSignA };
    const gapPointB = { x: P.x + nB.x * half * gapSignB, z: P.z + nB.z * half * gapSignB };
    const gapApex = { x: gap.x, z: gap.z };
    const distApex = Math.hypot(gapApex.x - P.x, gapApex.z - P.z);
    // Limite de "bico" (mesmo espírito do miter-limit do SVG/CSS
    // stroke-linejoin:miter) — ângulos muito rasos esticariam o bico
    // absurdamente longe; acima do limite, cai pro corte reto (bevel).
    const MITER_LIMIT_DIST = half * 8;

    let pointsXZ;
    if (joinType === 'bevel') {
      pointsXZ = [P, gapPointA, gapPointB];
    } else if (joinType === 'square') {
      const bisX = nA.x * gapSignA + nB.x * gapSignB, bisZ = nA.z * gapSignA + nB.z * gapSignB;
      const bisLen = Math.hypot(bisX, bisZ);
      if (bisLen < 1e-6) { pointsXZ = [P, gapPointA, gapPointB]; } // bissetriz degenerada (caso raríssimo) — cai pro chanfro simples
      else {
        const bis = { x: bisX / bisLen, z: bisZ / bisLen };
        const shelfA = { x: gapPointA.x + bis.x * half, z: gapPointA.z + bis.z * half };
        const shelfB = { x: gapPointB.x + bis.x * half, z: gapPointB.z + bis.z * half };
        pointsXZ = [P, gapPointA, shelfA, shelfB, gapPointB];
      }
    } else if (joinType === 'round') {
      // gapPointA e gapPointB já estão, por construção, exatamente a
      // `half` metros de P (é a própria espessura da parede) — ou seja, já
      // estão EM CIMA do círculo de raio `half` centrado em P; só falta o
      // arco entre eles (o caminho mais CURTO — o canto côncavo sempre é o
      // lado menor, o oposto seria dar a volta por dentro da sobreposição).
      const angA = Math.atan2(gapPointA.z - P.z, gapPointA.x - P.x);
      const angB = Math.atan2(gapPointB.z - P.z, gapPointB.x - P.x);
      let delta = angB - angA;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const STEPS = 8;
      const arco = [];
      for (let i = 1; i < STEPS; i++) {
        const a = angA + (delta * i) / STEPS;
        arco.push({ x: P.x + Math.cos(a) * half, z: P.z + Math.sin(a) * half });
      }
      pointsXZ = [P, gapPointA, ...arco, gapPointB];
    } else { // 'miter'
      if (distApex > MITER_LIMIT_DIST) pointsXZ = [P, gapPointA, gapPointB]; // ângulo raso demais — cai pro chanfro
      else pointsXZ = [P, gapPointA, gapApex, gapPointB];
    }

    const hA = corner.wallA.height || wallHFallback;
    const hB = corner.wallB.height || wallHFallback;
    const capHeight = Math.max(hA, hB); // paredes de alturas diferentes no mesmo canto (raro) — a capa acompanha a mais ALTA das duas
    return this._buildPrismFromPolygon(THREE, pointsXZ, 0, capHeight, capMaterial);
  }

  /** Prisma reto (extrusão vertical simples, de `y0` até `y1`) a partir de
   *  um polígono no plano XZ (`pointsXZ`, em ordem ao redor do contorno,
   *  sentido não importa — `capMaterial` sempre precisa ser `side:
   *  THREE.DoubleSide`, ver setScene) — usado só pelas capas de junção de
   *  quina acima. Triangula a base/topo à mão (via THREE.ShapeUtils, que já
   *  dá conta de polígono não-convexo — os cantos "round"/"square" acima
   *  não são estritamente convexos) e liga base/topo com uma parede
   *  lateral por aresta do contorno — tudo manual, SEM ExtrudeGeometry, de
   *  propósito: ExtrudeGeometry extruda no eixo Z LOCAL da forma 2D (não no
   *  Y "pra cima" do mundo), exigiria girar a malha depois e cuidar da
   *  troca de eixo/sinal — construir os vértices já na posição 3D final
   *  evita esse cuidado extra por completo. */
  _buildPrismFromPolygon(THREE, pointsXZ, y0, y1, material) {
    const n = pointsXZ.length;
    if (n < 3) return null;
    const shapePts = pointsXZ.map((p) => new THREE.Vector2(p.x, p.z));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(shapePts, []); } catch (e) { return null; }
    if (!tris || !tris.length) return null;
    const positions = [];
    const pushTri = (ia, ib, ic, y) => {
      const a = pointsXZ[ia], b = pointsXZ[ib], c = pointsXZ[ic];
      positions.push(a.x, y, a.z, b.x, y, b.z, c.x, y, c.z);
    };
    tris.forEach(([ia, ib, ic]) => pushTri(ia, ib, ic, y1)); // topo
    tris.forEach(([ia, ib, ic]) => pushTri(ic, ib, ia, y0)); // base (ordem invertida — só importa se algum dia deixar de ser DoubleSide)
    for (let i = 0; i < n; i++) { // paredes laterais — um quad (2 triângulos) por aresta do contorno
      const a = pointsXZ[i], b = pointsXZ[(i + 1) % n];
      positions.push(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z);
      positions.push(a.x, y0, a.z, b.x, y1, b.z, a.x, y1, a.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, material);
  }

  /** Wireframe "de verdade" (com remoção de linhas escondidas) — pedido do
   *  usuário: "só objetos que seriam vistos pela câmera caso fossem
   *  sólidos, ou seja, o que está 'atrás' não é renderizado". Sem isto, o
   *  modo wireframe de sempre deste app (cada malha com
   *  `MeshBasicMaterial({wireframe:true})`, ver `wireframe` acima) mostra
   *  TUDO por transparência — cada malha só escreve profundidade em cima
   *  das próprias LINHAS (pixels finos), não da FACE inteira, então o vão
   *  entre as linhas de um objeto da frente deixa o de trás "vazar" através
   *  dele (efeito raio-X, não o "escondido fica escondido" de um wireframe
   *  de verdade). Corrigido com o truque clássico de duas malhas por objeto,
   *  aplicado aqui de uma vez pra CADA malha wireframe já na cena: uma
   *  segunda malha INVISÍVEL (mesma geometria/posição/rotação — reaproveita
   *  a MESMA geometria, sem duplicar memória de vértice) que só escreve no
   *  z-buffer (`colorWrite:false`) preenchendo a FACE inteira (não só as
   *  linhas) — isso é o que faz a malha de trás ser corretamente ocultada.
   *  `polygonOffset` empurra essa malha invisível um pouco pra TRÁS da
   *  câmera (não visualmente, só no teste de profundidade), pra nunca
   *  "brigar" (z-fighting/cintilação) com as próprias linhas da MESMA malha,
   *  que ficam exatamente na superfície dela. Malha invisível NÃO entra em
   *  `_pickMeshes`/`pickables` — é só pra ocultação visual, a mira/clique já
   *  usam a malha wireframe visível de sempre (mesma posição, resultado
   *  idêntico). */
  _addWireframeOcclusion() {
    const THREE = this.THREE;
    const alvos = this._group.children.filter((o) => o.isMesh && o.material && o.material.wireframe);
    alvos.forEach((m) => {
      const fillMat = new THREE.MeshBasicMaterial({
        colorWrite: false, depthWrite: true,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      const fill = new THREE.Mesh(m.geometry, fillMat);
      fill.position.copy(m.position);
      fill.rotation.copy(m.rotation);
      fill.scale.copy(m.scale);
      this._group.add(fill);
    });
  }

  /** Prepara os objetos elegíveis pro modo "Sólido+wireframe para
   *  desempenho" (ver updateHybridQuality, chamado a cada quadro por
   *  view3d.js): guarda, em cada malha de objeto/item/câmera JÁ construída
   *  (sólida, normal — este modo NUNCA muda a construção inicial, só o
   *  material depois, ao vivo), o material sólido original (`_solidMat`,
   *  na prática o que a malha já tem) e um material wireframe alternativo
   *  (`_wireMat`), pra `updateHybridQuality` poder trocar `mesh.material`
   *  entre os dois sem reconstruir nada. Paredes/piso/porta/janela ficam de
   *  fora de propósito — são a estrutura do ambiente (poucas, não crescem
   *  sem limite como "encher o lugar de objetos" faz), trocar elas pra
   *  wireframe também desorientaria a navegação mais do que ajudaria o FPS. */
  _setupHybridMeshes() {
    const THREE = this.THREE;
    const COR_WIREFRAME_HIBRIDO = 0x78c8ff;
    this._group.children.forEach((m) => {
      const tipo = m.userData?.pick?.type;
      if (tipo !== 'object' && tipo !== 'item' && tipo !== 'camera') return;
      // NOVO (01/09/2026), item GRANDE #5: um THREE.LOD (ver
      // _buildTypeMoldeMesh) não tem `.material` PRÓPRIO — só os filhos (um
      // Mesh por nível) têm — então trocar `m.material` mais abaixo em
      // updateHybridQuality não faria NADA de verdade num LOD (silenciosa,
      // sem travar nada, mas inútil). Excluído de propósito deste modo, igual
      // parede/piso/porta/janela (ver comentário grande no topo deste
      // método) — continua sempre sólido, nunca vira wireframe pelo modo
      // "Sólido+wireframe para desempenho" (caso raro: só afeta um tipo com
      // OS DOIS níveis do editor de modelos customizados).
      if (m.isLOD) return;
      m.userData._solidMat = m.material;
      m.userData._wireMat = new THREE.MeshBasicMaterial({ color: COR_WIREFRAME_HIBRIDO, wireframe: true });
      this._hybridMeshes.push(m);
    });
  }

  /** Teste de interseção entre dois segmentos 2D (orientação por produto
   *  vetorial) — "raycaster 2D simples" pedido pelo usuário pra
   *  updateHybridQuality: ignora de propósito os casos raros de sobreposição
   *  colinear/toque exato na ponta (não vale a complexidade extra aqui —
   *  "seleção mais fina só se necessário", e este teste só decide sólido x
   *  wireframe, nunca colisão de verdade). */
  _segmentsIntersect2D(ax, ay, bx, by, cx, cy, dx, dy) {
    const orient = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const d1 = orient(cx, cy, dx, dy, ax, ay);
    const d2 = orient(cx, cy, dx, dy, bx, by);
    const d3 = orient(ax, ay, bx, by, cx, cy);
    const d4 = orient(ax, ay, bx, by, dx, dy);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  /** Chamado a cada quadro RENDERIZADO (ver view3d.js `_loop`) só quando o
   *  modo "Sólido+wireframe para desempenho" está ativo — pedido do
   *  usuário: "dá para usar o 2D para definir os itens que viraram
   *  wireframe no modo híbrido... se tem coisa atrás de uma parede... deve
   *  desenhar só a parede, não as coisas que estão atrás dela". `fpsAlvo` é
   *  o "Limite de FPS" de ⚙️ (mapconfig.js `fpsLimite`) — sem um alvo
   *  definido (0 = sem limite) não há "o que perseguir", então não rebaixa
   *  nada (fica tudo sólido, comportamento seguro por padrão).
   *
   *  Algoritmo, em duas partes (exatamente como descrito pelo usuário):
   *
   *  1) Ocultos por parede — SEMPRE wireframe, incondicional (não depende
   *     do FPS): "a seleção pode ser feita com um raycaster 2D simples...
   *     em vez de usar todos os vértices de cada objeto, usar o seu vértice
   *     principal (sua coordenada)". Pra cada objeto, testa se o segmento
   *     2D câmera->coordenada do objeto CRUZA alguma parede (`mapData.walls`,
   *     x1,y1-x2,y2 — o mundo 3D usa x/z, o mapa 2D usa x/y, mesmo eixo, só
   *     nome diferente). Se cruza, a parede já esconde o objeto de qualquer
   *     jeito — desenhar ele sólido não muda o que se VÊ, só custa GPU à
   *     toa, então vira wireframe de graça, sem custar nada visualmente.
   *
   *  2) Só se (1) sozinho não bastar pro FPS medido ficar dentro do alvo —
   *     um raio (`_hybridRadius`, distância 2D até a câmera) vai encolhendo
   *     a cada quadro que ainda estiver abaixo do alvo: quem estiver ALÉM
   *     dele (dos objetos VISÍVEIS, não ocultos por (1)) também vira
   *     wireframe, começando pelos mais longe — "diminui-se o raio, para
   *     abranger menos objetos... está dentro do círculo? usando o raio
   *     entre a posição da câmera e a posição dos objetos, tudo 2D, mesmo
   *     os objetos sendo 3D". Cresce de volta (mais qualidade visível)
   *     quando o FPS já folga acima do alvo, até não restringir mais nada
   *     (`_hybridRadius = null`) — nesse ponto só a oclusão por parede
   *     de (1) continua valendo. */
  updateHybridQuality(camera, fpsAtual, fpsAlvo) {
    const lista = this._hybridMeshes;
    if (!lista?.length || !fpsAlvo) return;
    const walls = this.mapData?.walls || [];

    // Parte 1 — oculto por parede (2D, vértice principal do objeto).
    const ocluidos = new Set();
    lista.forEach((m) => {
      const escondido = walls.some((w) => this._segmentsIntersect2D(camera.x, camera.z, m.position.x, m.position.z, w.x1, w.y1, w.x2, w.y2));
      if (escondido) ocluidos.add(m);
    });

    // Parte 2 — raio encolhendo, só entre os VISÍVEIS (não ocultos).
    const TOLERANCIA_FPS = 3; // evita oscilar (sobe/desce) por flutuações de 1-2fps entre quadros
    const visiveis = lista.filter((m) => !ocluidos.has(m));
    if (fpsAtual < fpsAlvo - TOLERANCIA_FPS) {
      if (this._hybridRadius == null) {
        // 1ª vez que a oclusão por parede sozinha não bastou nesta sessão de
        // 3D — começa encolhendo a partir do objeto visível mais distante
        // (ninguém novo vira wireframe ainda neste quadro, só define de onde
        // partir a encolhida dos próximos quadros).
        const distancias = visiveis.map((m) => Math.hypot(m.position.x - camera.x, m.position.z - camera.z));
        this._hybridRadius = distancias.length ? Math.max(...distancias) : 0;
      } else {
        this._hybridRadius *= 0.85;
      }
    } else if (fpsAtual > fpsAlvo + TOLERANCIA_FPS && this._hybridRadius != null) {
      this._hybridRadius = this._hybridRadius * 1.15 + 0.5;
      const distancias = visiveis.map((m) => Math.hypot(m.position.x - camera.x, m.position.z - camera.z));
      const maxDist = distancias.length ? Math.max(...distancias) : 0;
      if (this._hybridRadius >= maxDist) this._hybridRadius = null; // recuperou de vez — volta a não restringir nada
    }

    lista.forEach((m) => {
      let querWireframe = ocluidos.has(m);
      if (!querWireframe && this._hybridRadius != null) {
        const dist = Math.hypot(m.position.x - camera.x, m.position.z - camera.z);
        querWireframe = dist > this._hybridRadius;
      }
      const materialDesejado = querWireframe ? m.userData._wireMat : m.userData._solidMat;
      if (m.material !== materialDesejado) m.material = materialDesejado;
    });
  }

  /** Mesa: 4 pernas (cantos, encolhidas pra dentro por uma margem) + um
   *  tampo fino no topo — em vez do bloco sólido genérico usado por
   *  qualquer outro objeto 'retangulo' (pedido do usuário: "faça o 3D da
   *  mesa com 4 pernas de mesa e um tampo de mesa, para que pareça uma e
   *  não um cubo"). `perfil.w/d/h` = largura/profundidade/altura da mesa
   *  (mesmos campos de sempre, ver _MESA_FORMA_DEF em mapview.js). Todas as
   *  malhas (tampo + 4 pernas) compartilham o MESMO `objPick` — mesmo
   *  padrão de buildDoorOrWindowMesh — clicar em qualquer perna ou no
   *  tampo seleciona a mesa inteira, nunca uma peça avulsa. Objetos
   *  colocados EM CIMA da mesa (PC/mouse/teclado etc., ver setScene acima
   *  — cada objeto guarda sua PRÓPRIA altura absoluta) só precisam que o
   *  usuário informe uma altura de base igual à da mesa (`h`) na hora de
   *  posicionar — não há relação pai/filho entre objetos neste app ainda,
   *  então "ficar em cima" hoje é o usuário mirar na altura certa, não algo
   *  automático. */
  /** Modo "leve" de luminárias (ver mapconfig.js modoLuminarias3D) — em vez
   *  de uma luz de verdade (THREE.PointLight, que custa um laço a mais no
   *  shader de TODA a cena por luz acesa), simplesmente CLAREIA a cor de
   *  quem cai dentro do alcance de alguma luminária (pedido do usuário: "se
   *  lâmpada naquela região, então, usa outra cor para aqueles objetos").
   *  Decidido uma vez só, aqui, na hora de montar a cena — não a cada
   *  quadro (pedido do usuário: "para não ficar testando sempre a cada
   *  frame, já define como um novo padrão de momento": o objeto NASCE já no
   *  material "aceso" ou "apagado", sem re-testar depois). Fora do modo
   *  'leve' (ou sem nenhuma luminária no mapa), devolve a cor original sem
   *  nenhum custo extra (`this._luzesLeves` fica vazio, ver setScene).
   *  Pedido do usuário (rodada seguinte): "deixe as luminárias como
   *  estavam antes" — revertido pra devolver só a cor (sem o `lit`/troca de
   *  material pra MeshBasicMaterial da tentativa anterior de deixar mais
   *  claro à noite). */
  _tintForLight(colorHex, x, y, z) {
    if (!this._luzesLeves?.length) return colorHex;
    const RAIO = 5.5; // mesmo alcance do PointLight do modo dinâmico (ver _buildLuminariaMesh) — os dois modos "iluminam" a mesma distância
    const perto = this._luzesLeves.some((luz) => {
      const dx = x - luz.x, dy = y - luz.y, dz = z - luz.z;
      return dx * dx + dy * dy + dz * dz <= RAIO * RAIO;
    });
    if (!perto) return colorHex;
    const THREE = this.THREE;
    return new THREE.Color(colorHex).lerp(new THREE.Color(0xfff4d9), 0.45).getHex();
  }

  /** Constrói a malha de um objeto MODELADO pelo usuário (`obj.customMesh =
   *  {vertices:[[x,y,z],...], edges:[[i,j],...], faces:[[i,j,k,...],...]}`,
   *  em coordenadas LOCAIS — ver js/modeler/*.js) — pedido do usuário
   *  (28/08/2026, "Modelador 3D"): "Vamos implementar o modelar de um objeto
   *  como no blender [...] pode servir de mais um objeto no cenário 3D."
   *  `obj.customMeshXform` (opcional, `{rotX,rotY,rotZ,scaleX,scaleY,scaleZ}`)
   *  é a transformação extra decidida no Modo Objeto do modelador — separada
   *  de `obj.angulo` (que continua sendo só a rotação Y "de sempre", também
   *  usada pelo 2D) pra não misturar as duas convenções: a rotação final no Y
   *  é `objAnguloToRotY(obj.angulo) + xform.rotY`. X/Z só existem pra objetos
   *  modelados (nenhum outro tipo de objeto deste app tem inclinação em X/Z).
   *  BufferGeometry montada NA MÃO triangulando cada face (leque a partir do
   *  1º vértice — funciona pra qualquer polígono convexo, que é o único caso
   *  que o modelador produz: triângulo/quad/faces criadas por inset/subdivide
   *  continuam convexas). */
  /** NOVO (07/09/2026), pedido verbatim: "carregar imagens como texturas
   *  [...] a possibilidade de mudar de cor as faces. [...] carregar
   *  materiais e definir luz ambiente, configurar rugosidade da superfície,
   *  etc. [...] A Three.js fornece funções prontas para diversas
   *  modificações dos objetos em cena. [...] Se o Three.js já fornece
   *  funções para isso tudo, então use-as." — monta um `MeshStandardMaterial`
   *  (já era o material usado nestes dois caminhos — `_buildCustomMeshObject`
   *  e `_buildMoldeMesh`/`_buildTypeMoldeMesh`, ver chamadores abaixo) lendo
   *  as propriedades NOVAS do objeto (`obj.rugosidade`/`obj.metalico`/
   *  `obj.opacidade`/`obj.texturaUrl`), em vez dos valores fixos que
   *  existiam antes (`roughness:0.85, metalness:0.05`, sempre opacos, sem
   *  textura nenhuma) — todos campos do THREE.MeshStandardMaterial de
   *  verdade (roughness/metalness/opacity/map), a biblioteca já provendo
   *  tudo que é preciso, como pedido.
   *
   *  DECISÃO DE ESCOPO TRANSPARENTE: cobre os dois caminhos "genéricos" de
   *  material (objetos modelados/"Novo Cubo 3D" via _buildCustomMeshObject,
   *  e objetos com molde customizado salvo via _buildMoldeMesh/
   *  _buildTypeMoldeMesh) — NÃO cobre as dezenas de builders de móveis
   *  específicos por tipo (_buildMesaMesh, _buildCadeiraMesh etc., cada um
   *  com sua própria geometria/material hard-coded) nem pintura POR FACE
   *  (a textura/cor aqui é do OBJETO INTEIRO, não de faces individuais) —
   *  ambos ficaram de fora desta rodada por decisão explícita do usuário
   *  ("Tentar os dois nesta rodada" com escopo mais enxuto, ver changelog do
   *  sw.js), não por esquecimento.
   *
   *  `obj` pode ser `null` (chamado de contextos sem um objeto de mapa de
   *  verdade — nesse caso usa só os valores padrão). Textura carregada via
   *  `THREE.TextureLoader` (MESMO padrão já usado em `_buildImagemMesh`/
   *  placa de foto orb — sem cache entre reconstruções de cena, igual aos
   *  outros usos de TextureLoader deste arquivo). */
  _buildStandardMaterialForObj(color, obj, side, vertexColors) {
    const THREE = this.THREE;
    const opts = {
      color,
      roughness: Utils.clamp(obj?.rugosidade ?? 0.85, 0, 1),
      metalness: Utils.clamp(obj?.metalico ?? 0.05, 0, 1),
      side: side ?? THREE.DoubleSide,
    };
    const opacidade = obj?.opacidade;
    if (typeof opacidade === 'number' && opacidade < 1) { opts.transparent = true; opts.opacity = Utils.clamp(opacidade, 0, 1); }
    if (obj?.texturaUrl) opts.map = new THREE.TextureLoader().load(obj.texturaUrl);
    // NOVO (07/09/2026), pedido verbatim: "a possibilidade de mudar de cor
    // as faces [...] Definir cor para as faces." — quando a geometria tem
    // um atributo `color` por vértice (ver `buildSmoothedTriGeometry`
    // `faceColorsRGB`), `vertexColors:true` faz o Three.js MULTIPLICAR essa
    // cor por vértice pela `color` base do material — API nativa do
    // MeshStandardMaterial, nenhuma lógica de shader escrita à mão.
    if (vertexColors) opts.vertexColors = true;
    return new THREE.MeshStandardMaterial(opts);
  }

  /** NOVO (07/09/2026), pedido verbatim (completando o que ficou de fora da
   *  rodada anterior, quando o usuário pediu explicitamente "implemente o
   *  que faltou [...] por completo [...] tanto sobre os scripts quanto
   *  sobre as texturas/materiais"): a rodada anterior só aplicava
   *  `_buildStandardMaterialForObj` em 2 caminhos "genéricos" (objeto
   *  modelado/"Novo Cubo 3D" e molde 3D customizado salvo) — as DEZENAS de
   *  builders de móveis por tipo (`_buildMesaMesh`/`_buildLuminariaMesh`/
   *  perfil genérico de caixa/cilindro, etc.) continuavam com material
   *  fixo, sem ler `obj.rugosidade`/`metalico`/`opacidade`/`texturaUrl`.
   *  Em vez de editar CADA UM dos builders (dezenas de funções, risco alto
   *  de quebrar alguma geometria especial no meio do caminho), este método
   *  é chamado pelos 2 PONTOS DE ENTRADA únicos que despcham pra qualquer
   *  builder (`setScene`/`addObjectIncremental`, ver os 2 chamadores) —
   *  compara `this._group.children` ANTES/DEPOIS de `_buildOneObjectMesh`
   *  rodar e aplica os campos de material do objeto em CADA malha nova
   *  criada (`node.traverse`, cobre grupos/LOD/sub-meshes também), sem
   *  precisar saber nada sobre a geometria específica de cada tipo.
   *
   *  SÓ MEXE em material que já é `MeshStandardMaterial`/
   *  `MeshPhysicalMaterial` (o que TODOS os builders de perfil/mesa/
   *  luminária/etc. já usam — ver `OBJECT3D_PROFILES`/`_buildMesaMesh` etc.,
   *  todos com PBR) — nunca em `MeshBasicMaterial` (nuvem de pontos,
   *  wireframe, a "imagem" colada, que tem seu próprio mapa de textura já
   *  intencional) nem em `PointsMaterial`, preservando o visual desses
   *  casos especiais. SÓ RODA quando o objeto tem PELO MENOS UM campo de
   *  material definido (painel "🧪 Material 3D" já usado) — objeto sem
   *  nenhum campo tocado não sofre NENHUMA mudança, zero risco de regressão
   *  visual pros milhares de objetos já existentes sem material customizado. */
  _applyObjMaterialOverride(obj, childrenBefore) {
    if (!obj || !this._group) return;
    const temOverride = obj.rugosidade != null || obj.metalico != null || obj.opacidade != null || !!obj.texturaUrl;
    if (!temOverride) return;
    const THREE = this.THREE;
    const novos = this._group.children.slice(childrenBefore);
    novos.forEach((node) => {
      if (!node || typeof node.traverse !== 'function') return;
      node.traverse((n) => {
        if (!n.isMesh || !n.material) return;
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        mats.forEach((mat) => {
          if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) return;
          if (obj.rugosidade != null) mat.roughness = Utils.clamp(obj.rugosidade, 0, 1);
          if (obj.metalico != null) mat.metalness = Utils.clamp(obj.metalico, 0, 1);
          if (obj.opacidade != null) {
            const op = Utils.clamp(obj.opacidade, 0, 1);
            mat.transparent = op < 1;
            mat.opacity = op;
          }
          if (obj.texturaUrl && mat.userData?._texturaUrlAplicada !== obj.texturaUrl) {
            mat.map = new THREE.TextureLoader().load(obj.texturaUrl);
            mat.userData = mat.userData || {};
            mat.userData._texturaUrlAplicada = obj.texturaUrl;
            mat.needsUpdate = true;
          }
        });
      });
    });
  }

  /** NOVO (07/09/2026), pedido verbatim: "blocos de construção" (tijolos
   *  autofundíveis) — reconstrói TODA a malha combinada dos tijolos do mapa
   *  (`mapData.tijolos`, ver js/tijolos.js `Tijolos.buildAll`), removendo a
   *  anterior primeiro (dispose de geometria/material — evita vazamento de
   *  memória de vídeo a cada reconstrução, mesmo padrão já usado alhures
   *  neste arquivo). Chamado por `setScene` (montagem inicial) e também
   *  publicamente por view3d.js a cada tijolo colocado/removido
   *  (`Engine3D.rebuildTijolos`, alias público logo abaixo) — SEM precisar
   *  remontar a cena inteira, só a malha de tijolos. Registra a(s) malha(s)
   *  em `this._pickMeshes` com `userData.pick.type:'tijolo'` — extensão de
   *  `raycastSurface` (ver esse método) já sabe considerar essas malhas
   *  como "superfície pra pousar em cima", permitindo empilhar tijolo sobre
   *  tijolo. NÃO entra em `this.pickables` (a lista usada por
   *  `pickFromRay`/clique de seleção) DE PROPÓSITO — tijolo não deve abrir
   *  o cartão de "objeto" genérico ao ser clicado nesta rodada (decisão de
   *  escopo — editar/remover um tijolo específico fica pelo próprio menu
   *  da ferramenta, não por um cartão de clique). */
  _rebuildTijolos(mapData) {
    if (this._tijoloMeshes?.length) {
      this._tijoloMeshes.forEach((mesh) => {
        this._group.remove(mesh);
        const idx = this._pickMeshes.indexOf(mesh);
        if (idx >= 0) this._pickMeshes.splice(idx, 1);
        mesh.geometry?.dispose?.();
        mesh.material?.dispose?.();
      });
    }
    // NOVO (08/09/2026, 38a rodada), pedido verbatim: "o objeto que foi
    // formado pelo aglomerado de tijolos deve ser um objeto no mundo,
    // podendo ser exluido." -- remove a entrada pickable ANTIGA do
    // aglomerado (id fixo 'tijolos-merged'), se houver -- recriada mais
    // abaixo com o bounding box atualizado (a malha é reconstruída do
    // zero a cada chamada, então o pickable também precisa ser).
    this.pickables = (this.pickables || []).filter((p) => p.id !== 'tijolos-merged');
    this._tijoloMeshes = [];
    const tijolos = mapData?.tijolos;
    if (!tijolos || !tijolos.length || typeof window.Tijolos === 'undefined') return;
    // CORRIGIDO (08/09/2026, 38a rodada), pedido verbatim: "os tijolos
    // devem ter vista de wireframe ao selecionar o modo 'Wireframe'." --
    // Tijolos.buildAll ganhou um 3o parâmetro (ver js/tijolos.js) — antes
    // o material da malha de tijolos era sempre sólido, nunca lia
    // `this.mode` (MESMO padrão de `wireframeMode`/`colWireframe` usado
    // em toda malha "normal" construída por este arquivo).
    const wireframeMode = this.mode === 'wireframe';
    const built = window.Tijolos.buildAll(this.THREE, tijolos, wireframeMode);
    built.forEach(({ mesh, textured, tijoloId }) => {
      mesh.userData.pick = { type: 'tijolo', id: textured ? tijoloId : 'tijolos-merged' };
      this._group.add(mesh);
      this._pickMeshes.push(mesh);
      this._tijoloMeshes.push(mesh);
    });
    // NOVO (08/09/2026, 38a rodada), pedido verbatim: "o objeto que foi
    // formado pelo aglomerado de tijolos deve ser um objeto no mundo,
    // podendo ser exluido." — registra UM pickable cobrindo o bounding box
    // de TODOs os tijolos 'caixa' SEM textura fundidos na malha única
    // acima (mesmo id fixo 'tijolos-merged' já usado em `userData.pick`,
    // ver `built.forEach` acima) em `this.pickables` — assim
    // `Engine3D.hoverPick()` (usada tanto pela ferramenta "🗑️ Remover"
    // quanto pelo popup de confirmação do DEL, ver view3d.js
    // `_removeWithTool`/`_openDeleteConfirmPopup`) passa a enxergar o
    // aglomerado inteiro como MAIS UM objeto do mundo, sem precisar
    // duplicar nenhuma lógica de seleção/raycast — só
    // `_confirmDeleteHit` (view3d.js) precisou de 1 ramo novo pro
    // `hit.type === 'tijolo'`. Tijolos individuais (cunha/com textura, que
    // viram mesh própria com `tijoloId` real em vez de 'tijolos-merged')
    // ficam DE FORA deste pickable de propósito — a exclusão de UM tijolo
    // específico já tem seu próprio fluxo dedicado (botão direito com a
    // ferramenta "🔘 Tijolo" ativa, ver view3d.js `_deleteTijoloClick`).
    const mesclaveis = tijolos.filter((t) => (t.formato || 'caixa') === 'caixa' && !t.texturaUrl);
    if (mesclaveis.length) {
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      mesclaveis.forEach((t) => {
        minX = Math.min(minX, t.x - t.sx / 2); maxX = Math.max(maxX, t.x + t.sx / 2);
        minY = Math.min(minY, t.y - t.sy / 2); maxY = Math.max(maxY, t.y + t.sy / 2);
        minZ = Math.min(minZ, t.z - t.sz / 2); maxZ = Math.max(maxZ, t.z + t.sz / 2);
      });
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
      const half = { x: (maxX - minX) / 2, y: (maxY - minY) / 2, z: (maxZ - minZ) / 2 };
      const radius = Math.hypot(half.x, half.y, half.z);
      this.pickables.push({ id: 'tijolos-merged', type: 'tijolo', pos: center, center, radius, obb: { half, rotY: 0, shape: 'box' } });
    }
  }

  /** Alias público de `_rebuildTijolos` — view3d.js chama isto (nome sem
   *  underscore, convenção do resto da API pública desta classe) depois de
   *  cada `Tijolos.add`/`Tijolos.remove`, sem precisar remontar a cena
   *  inteira (`setScene`) só por causa de um tijolo. */
  rebuildTijolos(mapData) {
    this._rebuildTijolos(mapData);
  }

  _buildCustomMeshObject(obj, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const cm = obj.customMesh;
    const verts = cm.vertices;
    const xf = obj.customMeshXform || {};
    // CORRIGIDO (01/09/2026) — ver comentário grande em buildSmoothedTriGeometry
    // (topo do arquivo): normais agora suavizadas por ângulo de vinco, em vez
    // de sempre facetadas por triângulo isolado.
    // NOVO (07/09/2026), pedido verbatim: "a possibilidade de mudar de cor
    // as faces [...] Definir cor para as faces." — `cm.faceColors` (objeto
    // `{ "<indiceDaFace>": "#rrggbb" }`, chaves string por serem índices de
    // array salvos como JSON) é opcional/novo; monta `faceColorsRGB` (0..1
    // por canal, formato que `buildSmoothedTriGeometry` espera) SÓ quando
    // há pelo menos 1 face com cor própria — objeto sem nenhuma face
    // customizada continua exatamente como antes (sem atributo `color` na
    // geometria, sem custo extra nenhum). Faces SEM override usam
    // `__default: [1,1,1]` (branco) DE PROPÓSITO — a cor base do objeto
    // (`obj.cor`) já vai no `material.color` (não aqui), e
    // `vertexColors:true` MULTIPLICA os dois; branco*obj.cor = obj.cor sem
    // tingir, então uma face SEM override mostra a cor do objeto
    // normalmente, e uma face COM override mostra a cor dela exatamente
    // como escolhida (sem misturar com `obj.cor`).
    const corPorFace = cm.faceColors && Object.keys(cm.faceColors).length ? cm.faceColors : null;
    let faceColorsRGB = null;
    if (corPorFace) {
      faceColorsRGB = { __default: [1, 1, 1] };
      Object.keys(corPorFace).forEach((idx) => {
        const c = new THREE.Color(corPorFace[idx] || '#ffffff');
        faceColorsRGB[idx] = [c.r, c.g, c.b];
      });
    }
    let geo = buildSmoothedTriGeometry(THREE, verts, cm.faces || [], faceColorsRGB);
    if (!geo.attributes.position) {
      // Malha sem nenhuma face (só vértices/arestas soltos, ex.: no meio de
      // uma edição) — evita BufferGeometry vazia (Three.js não gosta) sem
      // travar a cena inteira: um ponto minúsculo no lugar, praticamente
      // invisível, só pra não quebrar o resto do render.
      geo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
    }
    const color = _hexToThreeColor(obj.cor) ?? 0x8a92a3;
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : this._buildStandardMaterialForObj(color, obj, undefined, !!faceColorsRGB);
    const mesh = new THREE.Mesh(geo, mat);
    // `obj.elevacao`/`baseY` é sempre a altura da BASE do objeto — mas a
    // ORIGEM local (0,0,0) do `customMesh` pode estar no MEIO do cubo agora
    // (opção "Origem no centro do cubo", pedido do usuário — ver
    // mapconfig.js/modeler-mesh.js defaultCubeMesh/modeler-core.js
    // `_commit`, mesma conta usada lá e em modeler-render.js
    // `buildSceneObjects`, pra ficar tudo consistente): sobe a origem pelo
    // quanto a base da malha fica abaixo dela em espaço local (`minY`,
    // negativo quando centralizada, 0 no cubo "antigo" — sem efeito nesse
    // caso, retrocompatível).
    // CORRIGIDO (03/09/2026) — mesmo bug/mesma correção de
    // modeler-render.js `buildSceneObjects` (ver comentário grande lá pro
    // relato completo do usuário e a causa raiz): `minY` aqui é medido na
    // malha CRUA (nunca escalada) — precisa multiplicar por `xf.scaleY`
    // ANTES de subtrair de `baseY`, senão a base do objeto nasce na altura
    // errada sempre que a origem não está na base (minY≠0, ex.: opção
    // "Origem no centro do cubo") E a escala Y é diferente de 1 (dimensão Y
    // editada no Modelador) — exatamente o caso "cubo de 5,97m de altura,
    // elevado, não fica na posição definida ao sair do Modelador".
    let minY = 0;
    for (let i = 0; i < verts.length; i++) { const y = verts[i]?.[1]; if (typeof y === 'number' && y < minY) minY = y; }
    const scaleYObj = xf.scaleY || 1;
    mesh.position.set(obj.x, baseY - minY * scaleYObj, obj.y);
    mesh.rotation.set(xf.rotX || 0, objAnguloToRotY(obj.angulo) + (xf.rotY || 0), xf.rotZ || 0);
    mesh.scale.set(xf.scaleX || 1, xf.scaleY || 1, xf.scaleZ || 1);
    this._group.add(mesh);
    // Caixa delimitadora (bounding box) — usada só pro "picking" aproximado
    // (raio de seleção/hitbox/destaque ao mirar) FORA do modelador; a
    // seleção FINA vértice/aresta/face só existe DENTRO do modo de edição
    // (js/modeler/modeler-render.js, que faz seu próprio picking em espaço
    // de tela direto na malha).
    //
    // BUG corrigido (pedido do usuário, 28/08/2026 — "depois que sai do
    // Modelador, o destaque não está sendo feito no objeto... fica com a
    // posição que ficou quando estava sendo modelado"): a fórmula ANTERIOR
    // calculava o CENTRO da caixa de picking (`objPos`) só deslocando
    // `baseY` pela metade Y do bounding box LOCAL (`centerLocalY`) — ou
    // seja, assumia que o centro do objeto sempre fica bem em cima de
    // `(obj.x, obj.y)`, sem NUNCA se deslocar em X/Z. Isso é verdade pra
    // rotação em torno de Y (gira em volta do próprio eixo vertical, o
    // centro não sai de cima do pé do objeto), mas o Modelador 3D (Modo
    // Objeto, gizmo de Girar travado em X ou Z — ver customMeshXform.rotX/
    // rotZ) permite INCLINAR o objeto nesses dois outros eixos — e como o
    // centro do bounding box do cubo padrão NÃO fica no eixo local (0,_,0)
    // (o cubo nasce com base em y=0, topo em y=h — ver
    // js/modeler/modeler-mesh.js defaultCubeMesh), inclinar em X/Z desloca
    // esse centro pra longe de `(obj.x, obj.y)` de verdade — só que a
    // fórmula antiga nunca recalculava isso, deixando a caixa de picking
    // (e o destaque/contorno ao mirar, que lê `pick.center`) "presa" numa
    // posição que só valia pra rotação zero, dando a impressão de que
    // sobrou um "objeto fantasma" na posição de antes de girar. Corrigido
    // usando `THREE.Box3().setFromObject(mesh)` — pega o bounding box de
    // verdade em espaço de MUNDO, direto da malha já com toda a
    // transformação (posição+rotação+escala) aplicada, correto não importa
    // o ângulo/eixo de inclinação.
    mesh.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(mesh);
    const centerW = box3.getCenter(new THREE.Vector3());
    const sizeW = box3.getSize(new THREE.Vector3());
    const objPos = { x: centerW.x, y: centerW.y, z: centerW.z };
    const halfX = Math.max(0.05, sizeW.x / 2), halfY = Math.max(0.05, sizeW.y / 2), halfZ = Math.max(0.05, sizeW.z / 2);
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(halfX, halfZ) * 1.2, ref: obj, obb: { half: { x: halfX, y: halfY, z: halfZ }, rotY: 0, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);
  }

  /** NOVO (01/09/2026), item GRANDE #5 do pedido de 12 itens — monta um
   *  `THREE.Mesh` a partir do MESMO formato `{vertices, edges, faces}` de
   *  `obj.customMesh` (ver `_buildCustomMeshObject` acima, mesma
   *  triangulação em leque), SEM posicionar/rotacionar nada — quem chama
   *  (`_buildTypeMoldeMesh` logo abaixo) decide a posição/rotação da RAIZ
   *  (a malha única, ou o `THREE.LOD` que a contém). Extraído da lógica de
   *  `_buildCustomMeshObject` pra ser reaproveitado duas vezes (nível
   *  detalhado E nível low poly) sem duplicar a triangulação. */
  _buildMoldeMesh(meshData, wireframe, colWireframe, color, obj) {
    const THREE = this.THREE;
    const verts = meshData.vertices || [];
    // CORRIGIDO (01/09/2026) — ver comentário grande em buildSmoothedTriGeometry.
    const geo = buildSmoothedTriGeometry(THREE, verts, meshData.faces || []);
    if (!geo.attributes.position) {
      // NOVO (07/09/2026), pedido verbatim: "Mesmo que seja um arquivo com
      // apenas um grupo de vértices, sem definição de faces e ligação para
      // definir arestas. Nesse caso, emitir uma notificação a respeito
      // disso, mas renderizar a forma mesmo assim." — molde SEM nenhuma face
      // (ex.: modelo externo carregado só com vértices, ver modelos3d.js
      // `_carregarModeloExterno`/`_parseOBJ`/`_parseSTL`) agora vira uma
      // NUVEM DE PONTOS (THREE.Points) com os vértices de verdade, em vez do
      // antigo "ponto minúsculo" de fallback (que escondia a malha por
      // completo, pensado só pra molde vazio/quebrado de propósito) — só
      // cai no fallback antigo de verdade quando NÃO HÁ NENHUM vértice
      // também (molde realmente vazio/quebrado, nunca o caso de um arquivo
      // "só com vértices" carregado de propósito).
      if (verts.length > 0) {
        const pgeo = new THREE.BufferGeometry();
        const positions = new Float32Array(verts.length * 3);
        verts.forEach((v, i) => { positions[i * 3] = v[0]; positions[i * 3 + 1] = v[1]; positions[i * 3 + 2] = v[2]; });
        pgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const pmat = new THREE.PointsMaterial({ color, size: 0.05, sizeAttenuation: true });
        return new THREE.Points(pgeo, pmat);
      }
      const geoFallback = new THREE.BoxGeometry(0.02, 0.02, 0.02); // molde vazio/quebrado — ponto minúsculo em vez de travar a cena (mesmo critério de _buildCustomMeshObject)
      const matFallback = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : this._buildStandardMaterialForObj(color, obj);
      return new THREE.Mesh(geoFallback, matFallback);
    }
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : this._buildStandardMaterialForObj(color, obj);
    return new THREE.Mesh(geo, mat);
  }

  /** NOVO (01/09/2026), item GRANDE #5, verbatim: "Deve ser possível editar o
   *  modelo dos objetos 3D padrão. Também devem ter dois modelos: um mais
   *  detalhado e um low poly (para melhorar desempenho)." + decisão do
   *  usuário (AskUserQuestion) sobre a troca de nível: "Automático por
   *  distância". Chamado por `_buildOneObjectMesh` quando `obj.tipo` tem
   *  pelo menos um molde customizado salvo (ver `this._objectModelsByTipo`,
   *  `DB.getObjectModel`) — SUBSTITUI por completo o builder padrão/
   *  hard-coded daquele tipo (mesmo espírito de `obj.customMesh` já
   *  substituir tudo pra um objeto individual, ver `_buildCustomMeshObject`
   *  acima: uma vez customizado, o molde manda, sem misturar com
   *  largura/profundidade/altura do perfil antigo).
   *
   *  - Só UM nível customizado (o outro nunca foi desenhado no editor):
   *    usa esse único nível pros dois casos — sem um 2º nível não HÁ o que
   *    trocar por distância, então uma malha só, sempre visível, é o
   *    comportamento correto (não um LOD de 1 nível só).
   *  - OS DOIS níveis customizados: aí sim monta um `THREE.LOD` de verdade
   *    (ver `render()`/`this._lodObjects`, que chama `.update(camera)` a
   *    cada quadro — é isso que faz a troca automática por distância
   *    funcionar; sem chamar `.update()` todo quadro o LOD nunca troca de
   *    nível sozinho, API do próprio Three.js).
   */
  _buildTypeMoldeMesh(obj, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const molde = this._objectModelsByTipo[obj.tipo] || {};
    const detalhado = molde.detalhado, lowpoly = molde.lowpoly;
    const color = _hexToThreeColor(obj.cor) ?? (OBJECT3D_PROFILES[obj.tipo]?.color ?? 0x8a92a3);
    let raiz;
    if (detalhado && lowpoly) {
      const lod = new THREE.LOD();
      // 12m: perto o bastante pra quase nunca notar a troca andando devagar
      // pela cena (a única forma de locomoção do modo 1ª pessoa deste app),
      // longe o bastante pra já valer a pena (menos triângulos) bem antes do
      // objeto ficar minúsculo na tela. Sem opção pra pessoa ajustar isto de
      // propósito — a decisão do usuário foi "automático", não "manual
      // configurável" (ver a outra opção descartada na mesma pergunta).
      lod.addLevel(this._buildMoldeMesh(detalhado, wireframe, colWireframe, color, obj), 0);
      lod.addLevel(this._buildMoldeMesh(lowpoly, wireframe, colWireframe, color, obj), 12);
      raiz = lod;
    } else {
      raiz = this._buildMoldeMesh(detalhado || lowpoly, wireframe, colWireframe, color, obj);
    }
    // Origem-na-base ajustada pelo minY do nível mais detalhado disponível —
    // mesma conta de `_buildCustomMeshObject` (o editor de modelos usa o
    // MESMO modelador/mesma convenção de origem que o "🧊 Novo Cubo 3D" de
    // objeto único, ver js/modeler/*.js).
    const verts = (detalhado || lowpoly).vertices || [];
    let minY = 0;
    for (let i = 0; i < verts.length; i++) { const y = verts[i]?.[1]; if (typeof y === 'number' && y < minY) minY = y; }
    raiz.position.set(obj.x, baseY - minY, obj.y);
    raiz.rotation.y = objAnguloToRotY(obj.angulo);
    this._group.add(raiz);
    raiz.updateMatrixWorld(true);
    if (raiz.isLOD) {
      this._lodObjects.push(raiz); // ver render() — precisa de .update(camera3) todo quadro pra trocar de nível sozinho
    }
    const box3 = new THREE.Box3().setFromObject(raiz); // funciona igual pra Mesh única ou LOD (Box3.setFromObject percorre todos os filhos, visíveis ou não — .visible só afeta o QUE é desenhado, não o cálculo de bounding box)
    const centerW = box3.getCenter(new THREE.Vector3());
    const sizeW = box3.getSize(new THREE.Vector3());
    const objPos = { x: centerW.x, y: centerW.y, z: centerW.z };
    const halfX = Math.max(0.05, sizeW.x / 2), halfY = Math.max(0.05, sizeW.y / 2), halfZ = Math.max(0.05, sizeW.z / 2);
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(halfX, halfZ) * 1.2, ref: obj, obb: { half: { x: halfX, y: halfY, z: halfZ }, rotY: 0, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    raiz.userData.pick = objPick;
    // Picking 'pixelperfect' (ver hoverPick) testa malha por malha em
    // `_pickMeshes` — um LOD precisa registrar CADA nível (só o nível
    // visível no momento é realmente testado pelo raycaster, já que os
    // outros estão com `.visible=false`, mas registrar os dois de antemão
    // evita ficar sincronizando essa lista toda vez que `.update()` troca o
    // nível ativo).
    if (raiz.isLOD) raiz.levels.forEach((lvl) => { lvl.object.userData.pick = objPick; this._pickMeshes.push(lvl.object); });
    else this._pickMeshes.push(raiz);
  }

  /** [13/09/2026] NOVO — malha de um objeto usando um modelo `.glb`/`.gltf`
   *  IMPORTADO (`window.Model3DLoader`, ver comentário grande em
   *  `js/model3dloader.js`) em vez de geometria procedural. Chamado por
   *  `_buildOneObjectMesh` quando `obj.modeloArquivo`/
   *  `OBJECT3D_PROFILES[obj.tipo].modeloArquivo` aponta pra um arquivo já
   *  carregado com sucesso (`Model3DLoader.hasModel(nome)` — ver
   *  comentário grande no ponto de chamada sobre o fallback quando não
   *  está). Segue o MESMO padrão de posicionamento/pickable de
   *  `_buildTypeMoldeMesh` acima (origem na base via bounding box, não um
   *  "minY de vértice" — um `.glb` não tem `vertices`/`obj.customMesh`
   *  pra calcular isso do jeito antigo), pra funcionar com o resto do app
   *  (destaque de hover, seleção, "🔗 item associado", etc.) sem precisar
   *  de nenhum código novo nesses outros sistemas — eles só olham
   *  `pickables`/`_pickMeshes`/`userData.pick`, não COMO a malha foi
   *  construída.
   *
   *  [15/09/2026 UTC] `loader` (NOVO parâmetro, opcional — default
   *  `window.Model3DLoader`, pra não quebrar nenhuma chamada existente):
   *  qualquer objeto com a MESMA API mínima (`getClone(nome)` devolvendo
   *  um `THREE.Group` clonado, ou `null`) serve — `window.ObjMeshSource`
   *  (malha `.obj` estática, ver js/objmeshsource.js) implementa essa
   *  MESMA API de propósito, então este builder inteiro (posicionar/
   *  escalar/pickable/wireframe) é 100% reaproveitado pras duas origens de
   *  malha externa, sem duplicar nada aqui. */
  _buildModeloArquivoMesh(obj, baseY, wireframe, colWireframe, nome, loader) {
    const THREE = this.THREE;
    const raiz = (loader || window.Model3DLoader).getClone(nome);
    if (!raiz) return; // defensivo — não deveria acontecer (ponto de chamada já checou hasModel), mas nunca lançar aqui
    // Modo "estrutura" (wireframe geral do app, ver `setMode('estrutura')`)
    // — troca todo material carregado do arquivo por um wireframe simples,
    // mesmo espírito de `_buildMoldeMesh`/outros builders bespoke (senão o
    // modelo importado ficaria "sólido" mesmo com o modo de estrutura
    // ligado, quebrando a consistência visual do app).
    if (wireframe) {
      raiz.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({ color: colWireframe || 0x66ccff, wireframe: true });
        }
      });
    }
    // Sem "minY de vértice" aqui (o `.glb` não usa `obj.customMesh` —
    // calcula a base direto pela bounding box mundial, DEPOIS de escalar/
    // posicionar/girar, igual ao resto deste método faz com `box3` logo
    // abaixo) — por isso a ORDEM importa: primeiro posiciona em
    // `baseY` "provisório" (y=0 relativo), mede a caixa, e só then ajusta Y
    // pra encostar a base real no chão.
    raiz.position.set(obj.x, baseY, obj.y);
    raiz.rotation.y = objAnguloToRotY(obj.angulo);
    // Escala opcional (`obj.modeloArquivoEscala`, ex. usuário achou o
    // monitor grande demais depois de importar) — 1 (sem escala) por
    // padrão, mesmo espírito de `obj.customMesh` nunca forçar escala
    // sozinho.
    const escala = (typeof obj.modeloArquivoEscala === 'number' && obj.modeloArquivoEscala > 0) ? obj.modeloArquivoEscala : 1;
    raiz.scale.setScalar(escala);
    this._group.add(raiz);
    raiz.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(raiz);
    // Reencosta a base real (mínimo Y da bounding box já escalada/girada)
    // no chão em `baseY` — sem isto, um arquivo cuja origem não fica na
    // base (comum em programas de modelagem, que costumam centralizar no
    // meio do objeto) apareceria "flutuando" ou "enterrada" no chão.
    const ajusteY = baseY - box3.min.y;
    raiz.position.y += ajusteY;
    raiz.updateMatrixWorld(true);
    const box3Final = new THREE.Box3().setFromObject(raiz);
    const centerW = box3Final.getCenter(new THREE.Vector3());
    const sizeW = box3Final.getSize(new THREE.Vector3());
    const objPos = { x: centerW.x, y: centerW.y, z: centerW.z };
    const halfX = Math.max(0.05, sizeW.x / 2), halfY = Math.max(0.05, sizeW.y / 2), halfZ = Math.max(0.05, sizeW.z / 2);
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(halfX, halfZ) * 1.2, ref: obj, obb: { half: { x: halfX, y: halfY, z: halfZ }, rotY: 0, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    raiz.userData.pick = objPick;
    // Registra CADA malha filha em `_pickMeshes` (não só a raiz) — o
    // raycaster 'pixelperfect' (ver hoverPick) testa objeto por objeto
    // desta lista; um `.glb` normalmente tem várias `THREE.Mesh` filhas
    // (uma por material/primitiva), não uma raiz única testável.
    raiz.traverse((child) => { if (child.isMesh) { child.userData.pick = objPick; this._pickMeshes.push(child); } });
  }

  /** [13/09/2026] NOVO — geometria PURA da mesa (4 pernas + tampo), extraída
   *  de `_buildMesaMesh` pra ser reutilizável pelo GHOST de posicionamento
   *  (ver `showGhostObject`/`_refreshGhostMesaBespoke` mais abaixo) sem
   *  duplicar a matemática das pernas/tampo em dois lugares.
   *
   *  Causa raiz do bug relatado ("O ghost da mesa está aparecendo como uma
   *  caixa"): o ghost de posicionamento (`showGhostObject`) só conhecia UM
   *  ramo especial de verdade — o da escada (`_ghostEscada`, ver comentário
   *  grande em `_initBuildGhosts`) — e para TODO o resto, incluindo mesa,
   *  luminária e poste, sempre caiu na caixa delimitadora genérica
   *  (`this._ghostObject`). Ou seja: NÃO é um bug exclusivo da mesa — os
   *  outros dois builders bespoke (`_buildLuminariaMesh`/`_buildPosteMesh`)
   *  têm o MESMO sintoma. Eles não foram corrigidos nesta rodada porque, ao
   *  contrário da mesa, criam luz de verdade (`THREE.PointLight`, ver
   *  comentário em `_initBuildGhosts` sobre "iluminar 3 vezes o que a
   *  luminária ilumina") — reaproveitar o builder deles pro ghost exigiria
   *  cuidado extra pra NÃO instanciar uma PointLight nova a cada frame de
   *  arraste, o que ficou fora do escopo deste pedido (que citou
   *  especificamente a mesa). Fica documentado aqui como problema conhecido
   *  para uma futura rodada.
   *
   *  Só monta e devolve as `Mesh` (SEM adicionar a nenhuma cena/grupo, SEM
   *  registrar em `pickables`/`_pickMeshes`) — quem chama decide o destino:
   *  `_buildMesaMesh` (objeto real, abaixo) as põe em `this._group` e cria o
   *  pickable; o ghost as põe num grupo próprio (`_ghostMesa`) e nunca vira
   *  pickable, exatamente como os outros ghosts da caixa genérica. */
  /** [13/09/2026, CORRIGIDO de verdade] Causa raiz EXATA do bug "os pés da
   *  mesa ficam encolhidos" (reportado desde a v1 do prédio de 40 andares e
   *  NUNCA corrigido antes apesar de comentários dizendo o contrário): esta
   *  função sempre tratou `perfil.h` como a ALTURA TOTAL da mesa (chão até o
   *  topo do tampo) e ignorava `perfil.y0` por completo. Isso é verdade
   *  quando `perfil` vem do ramo `obj.forma === 'retangulo'` (linha ~4954,
   *  `{ h: obj.altura || 0.5, y0: 0 }` — mesa colocada pela ferramenta normal,
   *  `_MESA_FORMA_DEF` no mapview.js, `altura: 0.74`). MAS quando um objeto
   *  tipo 'mesa' é criado SEM `obj.forma:'retangulo'` (ex.: gerado
   *  programaticamente pelo script do prédio de 40 andares, ou colocado via
   *  catálogo puro sem essa forma), o código cai no ramo `else` (linha
   *  ~4980: `perfil = OBJECT3D_PROFILES[obj.tipo]`), e a entrada da tabela
   *  pra 'mesa' é `{ h: 0.05, y0: 0.72 }` — aqui `h` é só a ESPESSURA do
   *  tampo (5cm) e `y0` é a elevação do tampo (72cm), CONVENÇÃO DIFERENTE
   *  (a mesma usada pelo builder de caixa genérico, ver `centerY = baseY +
   *  perfil.y0 + perfil.h/2` na função principal). Como esta função nunca
   *  leu `perfil.y0`, ela calculava `pernaAltura = h - tampoEsp ≈ 0.05 -
   *  0.03 = 0.02m` — pernas de 2cm, mesa inteira encolhida a ~5cm de altura
   *  junto do chão. Esse é o EXATO sintoma "pés encolhidos" relatado.
   *  CORREÇÃO: normalizar a altura total ANTES de tudo, somando `y0` (se
   *  existir) à espessura/altura declarada — cobre as DUAS convenções sem
   *  quebrar nenhuma delas (`retangulo`: y0=0, soma dá o próprio `obj.altura`;
   *  tabela antiga: y0=0.72 + h=0.05 = 0.77m, valor plausível de mesa real).
   *  A partir daqui, `h` DENTRO desta função É, garantidamente, a altura
   *  total do CHÃO até o topo do tampo — condição que o resto da função (e
   *  o comentário matemático abaixo) assume. */
  _makeMesaMeshes(obj, perfil, baseY, material) {
    const THREE = this.THREE;
    const w = perfil.w || 1.2, d = perfil.d || 0.6;
    // Altura TOTAL (chão -> topo do tampo) = y0 (elevação do tampo, quando a
    // convenção antiga da tabela OBJECT3D_PROFILES for usada) + h (que ali é
    // só a espessura do tampo, mas no ramo 'retangulo' já É a altura total
    // com y0=0 — a soma funciona pras duas convenções, ver comentário acima).
    const h = (perfil.y0 || 0) + (perfil.h != null ? perfil.h : 0.72);
    const tampoEsp = Math.max(0.03, Math.min(0.06, h * 0.08));
    const pernaEsp = Math.max(0.03, Math.min(0.06, Math.min(w, d) * 0.07));
    const margem = pernaEsp * 1.2; // perna encostada pra DENTRO da quina, não bem na borda (evita "vazar" pro lado de fora do tampo)
    const pernaAltura = Math.max(0.05, h - tampoEsp);
    const rotY = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const meshes = [];
    const tampo = new THREE.Mesh(new THREE.BoxGeometry(w, tampoEsp, d), material);
    tampo.position.set(obj.x, baseY + h - tampoEsp / 2, obj.y);
    tampo.rotation.y = rotY;
    meshes.push(tampo);
    // 4 cantos em coordenadas LOCAIS (antes de girar) — mesma rotação Y
    // usada pelo tampo/resto do app (local->mundo: x'=x·cosθ+z·sinθ,
    // z'=-x·sinθ+z·cosθ, convenção do Three.js pra rotation.y).
    const cornersLocal = [
      [w / 2 - margem, d / 2 - margem], [-(w / 2 - margem), d / 2 - margem],
      [w / 2 - margem, -(d / 2 - margem)], [-(w / 2 - margem), -(d / 2 - margem)],
    ];
    const pernaGeo = new THREE.BoxGeometry(pernaEsp, pernaAltura, pernaEsp);
    cornersLocal.forEach(([lx, lz]) => {
      const wx = obj.x + lx * cos + lz * sin;
      const wz = obj.y - lx * sin + lz * cos;
      const perna = new THREE.Mesh(pernaGeo, material);
      perna.position.set(wx, baseY + pernaAltura / 2, wz);
      perna.rotation.y = rotY;
      meshes.push(perna);
    });
    return { meshes, w, d, h };
  }

  _buildMesaMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const rotY = objAnguloToRotY(obj.angulo);
    const { meshes, w, d, h } = this._makeMesaMeshes(obj, perfil, baseY, mat);
    meshes.forEach((m) => this._group.add(m));
    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    // [13/09/2026] NOVO — mesa animada por Script (pedido do usuário, Task 3
    // do prédio de 40 andares: "algumas mesas... também devem ter scripts de
    // animação") — ver `_tagScriptBase`/`_syncScriptedObjectTransforms`.
    const temScriptAtivo = Array.isArray(obj.components) && obj.components.some((c) => c.type === 'Script' && c.enabled !== false);
    meshes.forEach((m) => {
      m.userData.pick = objPick;
      this._pickMeshes.push(m);
      if (temScriptAtivo) this._tagScriptBase(m, obj, baseY);
    });
  }

  /** [15/09/2026 UTC] NOVO — "Pilar", objeto comum de catálogo (pedido
   *  verbatim: "faça dois novos objetos: 'Mesa' e 'Pilar' [...] O objeto
   *  'Pilar' deve ter a altura que define a distância entre um andar e
   *  outro e dimensões de 120cmx60cm [...] é só um objeto comum" — sem
   *  gizmo/forma especial, um `THREE.BoxGeometry` só, do chão até o teto
   *  do andar onde foi colocado. `w`/`d` vêm de `perfil` (1.2×0.6m, ver
   *  `OBJECT3D_PROFILES.pilar`); `h` NUNCA vem de `perfil.h` (que é só um
   *  valor de fábrica pro ghost/footprint) — sempre `this.mapData?.
   *  alturaPiso` (a distância real entre andares deste mapa), igual
   *  `_buildEscadaMesh` já faz pra escada. */
  _buildPilarMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const w = perfil.w || 1.2, d = perfil.d || 0.6;
    const h = this.mapData?.alturaPiso || 2.8;
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    const centerY = baseY + h / 2;
    mesh.position.set(obj.x, centerY, obj.y);
    mesh.rotation.y = objAnguloToRotY(obj.angulo);
    this._group.add(mesh);
    const objPos = { x: obj.x, y: centerY, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY: mesh.rotation.y, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);
  }

  /** [15/09/2026 UTC] NOVO — "Cadeira de verdade" (pedido verbatim: "Faça
   *  um modelo 3D diferente para a cadeira (substituindo-o), faça uma
   *  'cadeira de verdade' com pernas e encosto. Não uma caixa genérica como
   *  é atualmente."). Mesmo padrão de `_makeMesaMeshes`/`_buildMesaMesh`
   *  (várias `Mesh` soltas — assento + 4 pernas + encosto — compartilhando
   *  1 pickable/obb aproximado pela caixa delimitadora total): assento fino
   *  na altura real de uma cadeira (~metade da altura total), 4 pernas
   *  finas recuadas pra DENTRO do assento (não nas quinas — mesmo cuidado
   *  já pedido pra mesa), e um encosto — painel vertical fino — na borda de
   *  TRÁS do assento (local Z negativo, antes de girar por `obj.angulo`).
   */
  _buildCadeiraMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const w = perfil.w || 0.45, d = perfil.d || 0.45;
    const h = (perfil.y0 || 0) + (perfil.h != null ? perfil.h : 0.9); // altura total chão -> topo do encosto
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const rotY = objAnguloToRotY(obj.angulo);
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const assentoEsp = 0.04;
    const assentoAltura = Math.min(0.46, h * 0.5); // altura real de assento de cadeira (~45cm do chão)
    const pernaEsp = Math.max(0.025, Math.min(0.04, Math.min(w, d) * 0.08));
    const margem = pernaEsp * 1.3; // perna recuada pra DENTRO do assento, não na quina (mesmo pedido já feito pra mesa)
    const pernaAltura = Math.max(0.05, assentoAltura - assentoEsp / 2);
    const encostoEsp = 0.035;
    const encostoAltura = Math.max(0.1, h - assentoAltura);
    const meshes = [];

    const assento = new THREE.Mesh(new THREE.BoxGeometry(w, assentoEsp, d), mat);
    assento.position.set(obj.x, baseY + assentoAltura - assentoEsp / 2, obj.y);
    assento.rotation.y = rotY;
    meshes.push(assento);

    // 4 cantos em coordenadas LOCAIS (antes de girar) — mesma técnica
    // local->mundo de `_makeMesaMeshes` (cos/sin de `objAnguloToRotY`).
    const cornersLocal = [
      [w / 2 - margem, d / 2 - margem], [-(w / 2 - margem), d / 2 - margem],
      [w / 2 - margem, -(d / 2 - margem)], [-(w / 2 - margem), -(d / 2 - margem)],
    ];
    const pernaGeo = new THREE.BoxGeometry(pernaEsp, pernaAltura, pernaEsp);
    cornersLocal.forEach(([lx, lz]) => {
      const wx = obj.x + lx * cos + lz * sin;
      const wz = obj.y - lx * sin + lz * cos;
      const perna = new THREE.Mesh(pernaGeo, mat);
      perna.position.set(wx, baseY + pernaAltura / 2, wz);
      perna.rotation.y = rotY;
      meshes.push(perna);
    });

    // Encosto: painel fino vertical na borda TRASEIRA do assento (local
    // Z negativo — "trás" da cadeira, oposto de onde alguém senta de frente).
    const encostoLocalZ = -(d / 2 - margem);
    const ex = obj.x + encostoLocalZ * sin;
    const ez = obj.y + encostoLocalZ * cos;
    const encosto = new THREE.Mesh(new THREE.BoxGeometry(w - margem * 2, encostoAltura, encostoEsp), mat);
    encosto.position.set(ex, baseY + assentoAltura + encostoAltura / 2, ez);
    encosto.rotation.y = rotY;
    meshes.push(encosto);

    meshes.forEach((m) => this._group.add(m));
    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.65, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    const temScriptAtivo = Array.isArray(obj.components) && obj.components.some((c) => c.type === 'Script' && c.enabled !== false);
    meshes.forEach((m) => {
      m.userData.pick = objPick;
      this._pickMeshes.push(m);
      if (temScriptAtivo) this._tagScriptBase(m, obj, baseY);
    });
  }

  /** [15/09/2026 UTC] NOVO — "Vaso de verdade" (pedido verbatim: "Faça o
   *  mesmo para o vaso" — mesmo tratamento dado à cadeira acima). Antes, o
   *  tipo 'planta' caía no ramo GENÉRICO de cone (`perfil.shape==='cone'`)
   *  e desenhava só a folhagem verde, flutuando/encostada direto no chão,
   *  sem vaso nenhum. Agora: um vaso de verdade (tronco de cone — raio do
   *  topo maior que o da base, terracota) apoiado no chão, com a folhagem
   *  (o mesmo cone verde de antes, só reposicionado) sentada em CIMA da
   *  boca do vaso, não saindo do chão.
   */
  _buildPlantaMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const r = perfil.r || 0.3;
    const hTotal = perfil.h || 0.7;
    const rotY = objAnguloToRotY(obj.angulo);
    const potR = r * 0.6, potRTopo = potR * 1.15;
    const potH = Math.min(0.3, hTotal * 0.35);
    const folhaR = r;
    const folhaH = Math.max(0.1, hTotal - potH);
    const matVaso = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: 0xb5651d }); // terracota
    const matFolha = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const meshes = [];

    // Vaso: tronco de cone (CylinderGeometry aceita raioTopo != raioBase —
    // topo mais largo que a base, formato clássico de vaso de planta).
    const vaso = new THREE.Mesh(new THREE.CylinderGeometry(potRTopo, potR, potH, 12), matVaso);
    vaso.position.set(obj.x, baseY + potH / 2, obj.y);
    vaso.rotation.y = rotY;
    meshes.push(vaso);

    // Folhagem: cone verde (mesma forma de antes), agora sentada em cima
    // da boca do vaso em vez de flutuar desde o chão.
    const folha = new THREE.Mesh(new THREE.ConeGeometry(folhaR, folhaH, 12), matFolha);
    folha.position.set(obj.x, baseY + potH + folhaH / 2, obj.y);
    folha.rotation.y = rotY;
    meshes.push(folha);

    meshes.forEach((m) => this._group.add(m));
    const hFull = potH + folhaH;
    const objPos = { x: obj.x, y: baseY + hFull / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(potRTopo, folhaR) * 1.1, ref: obj, obb: { half: { x: folhaR, y: hFull / 2, z: folhaR }, rotY, shape: 'cylinder', segments: 12 } };
    this.pickables.push(objPick);
    const temScriptAtivo = Array.isArray(obj.components) && obj.components.some((c) => c.type === 'Script' && c.enabled !== false);
    meshes.forEach((m) => {
      m.userData.pick = objPick;
      this._pickMeshes.push(m);
      if (temScriptAtivo) this._tagScriptBase(m, obj, baseY);
    });
  }

  /** Escada 3D paramétrica — NOVO (01/09/2026), pedido verbatim do usuário
   *  (arquivo "prompts para o Claude.txt", um dos "itens grandes" adiados
   *  desde a rodada 57 — "pequenos primeiro, grandes depois"): "O objeto
   *  escada no 3D deve ter a sua representação equivalente. É possível
   *  escolher a quantidade de degraus, por padrão é 11. O tamanho dos
   *  degraus se ajusta conforme o tamanho (medida que é observada no 2D,
   *  profundidade) e quantidade de degraus da escada e largura (padrão
   *  130cm) também configuráveis. A altura é de 2 metros (percebido, apenas
   *  no 3D)." Cada degrau é uma caixa "empilhada" — mesmo padrão de várias
   *  `Mesh` soltas de `_buildMesaMesh`/`_buildLuminariaMesh` (sem
   *  `THREE.Group`): o degrau `i` cobre da base até a altura ACUMULADA até
   *  ali (`stepHeight*(i+1)`) e só a fatia de profundidade daquele degrau —
   *  de longe forma o perfil clássico de escada em blocos, sem precisar de
   *  geometria customizada/`ExtrudeGeometry` (que nem existe hoje no motor).
   *  A ALTURA TOTAL é SEMPRE 2 metros fixos (pedido explícito — "só
   *  percebida no 3D"), NUNCA `obj.altura` do 2D (o campo continua
   *  existindo/editável no painel só por uniformidade com as outras formas
   *  retângulo — ver `OBJECT3D_PROFILES.escada.h`, atualizado pra já
   *  MOSTRAR 2.0 por padrão, mesmo sem efeito real aqui). `obj.largura`
   *  (padrão 1.3 = 130cm) e `obj.profundidade` (padrão 3.0, tamanho TOTAL do
   *  lance) continuam vindo do redimensionamento normal no mapa 2D.
   *  `obj.escadaDegraus` é um campo NOVO, só existe/aparece no painel pra
   *  objetos tipo 'escada' (ver mapview.js `_openObjectPanel`, `formaFields`). */
  /** [13/09/2026, CORRIGIDO de verdade] Causa raiz do bug "a escada não
   *  alcança o andar de cima" / "não dá pra transitar fluidamente entre os
   *  andares": `alturaTotal` era FIXA em 2.0m (pedido antigo, "altura de 2
   *  metros, percebido, apenas no 3D"), um valor TOTALMENTE desconectado de
   *  `map.alturaPiso` (a distância real de piso a piso — 4m na v3 do
   *  prédio de 40 andares). Uma escada de 2m entre dois andares de 4m deixa
   *  o topo do último degrau a meio caminho, flutuando no vão livre — o
   *  jogador sobe a escada inteira e ainda não alcança o piso de cima.
   *  CORRIGIDO: `alturaTotal` agora acompanha `map.alturaPiso` (recebido via
   *  `this.mapData`, MESMA fonte que todo resto do motor usa pra empilhar
   *  andares — ver `baseY = (obj.piso||0) * (this.mapData?.alturaPiso||2.8)`
   *  logo antes de chamar esta função) por padrão, então o topo do último
   *  degrau bate EXATAMENTE no piso de cima não importa a altura de andar
   *  configurada. `obj.alturaEscada` (campo NOVO, opcional) permite ao
   *  usuário fixar uma altura diferente de propósito (ex.: um lance curto
   *  decorativo que não vai o andar inteiro) — quando ausente, o padrão é
   *  sempre a altura do andar. */
  _buildEscadaMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const largura = Math.max(0.05, obj.largura || perfil.w || 1.3);
    const profundidadeTotal = Math.max(0.05, obj.profundidade || perfil.d || 3.0);
    const alturaTotal = obj.alturaEscada || this.mapData?.alturaPiso || 2.8;
    // Degraus: se `obj.escadaDegraus` não foi configurado pelo usuário, o
    // padrão agora ESCALA com `alturaTotal` visando ~18cm por degrau (medida
    // realista de escada de verdade — ~17-19cm é o padrão de construção).
    // Pra um andar de 4m isso dá `4/0.18 ≈ 22` degraus, bem mais realista
    // que o antigo padrão fixo de 11 (que, aplicado a 4m em vez dos 2m
    // originais, resultaria em degraus de ~36cm de altura — quase o dobro do
    // realista, e beirando o limite de STEP_MAX=0.6m em view3d.js que
    // permite ao jogador "subir andando" sem pular; degraus muito mais altos
    // que isso travariam a subida). Um valor CUSTOMIZADO pelo usuário
    // (`obj.escadaDegraus`) sempre tem prioridade — nunca sobrescrito aqui.
    const degraus = Math.max(1, Math.round(obj.escadaDegraus) || Math.round(alturaTotal / 0.18) || 11);
    const stepDepth = profundidadeTotal / degraus;
    const stepHeight = alturaTotal / degraus;
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const rotY = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const meshes = [];
    for (let i = 0; i < degraus; i++) {
      const h = stepHeight * (i + 1);
      const geo = new THREE.BoxGeometry(largura, h, stepDepth);
      const m = new THREE.Mesh(geo, mat);
      // Desloca cada degrau ao longo da profundidade LOCAL (eixo Z antes de
      // girar), a partir do início do lance — MESMA convenção local->mundo
      // de `_buildMesaMesh` (wx = x + lx·cos + lz·sin; wz = y - lx·sin + lz·cos).
      const lx = 0, lz = -profundidadeTotal / 2 + stepDepth * (i + 0.5);
      const wx = obj.x + lx * cos + lz * sin;
      const wz = obj.y - lx * sin + lz * cos;
      m.position.set(wx, baseY + h / 2, wz);
      m.rotation.y = rotY;
      meshes.push(m);
    }
    meshes.forEach((m) => this._group.add(m));
    const objPos = { x: obj.x, y: baseY + alturaTotal / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(largura, profundidadeTotal) * 0.6, ref: obj, obb: { half: { x: largura / 2, y: alturaTotal / 2, z: profundidadeTotal / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    meshes.forEach((m) => { m.userData.pick = objPick; this._pickMeshes.push(m); });
  }

  /** "Imagem" colada/carregada no mapa 2D (mapview.js, `obj.forma:'imagem'`,
   *  `obj.src` = dataURL, `obj.largura`/`obj.profundidade` = tamanho
   *  esticado em metros — MESMOS campos que o 2D desenha, ver
   *  Map2DRenderer._drawFormaShape) — pedido do usuário (25/08/2026): "o
   *  objeto imagem deve aparecer também [no 3D]". Desenhada como uma folha
   *  DEITADA no chão (PlaneGeometry + rotateX(-90°), MESMO padrão já usado
   *  pro destaque de raycasting no chão — ver _initHoverHighlight/
   *  `_hoverTile` — "deitar" primeiro na GEOMETRIA, não no `mesh.rotation`,
   *  pra dar pra girar por CIMA disso com `mesh.rotation.y` normalmente,
   *  igual a qualquer outro objeto), com a textura carregada do dataURL —
   *  sem cache entre uma reconstrução de cena e outra (ao contrário do
   *  cache por `src` do 2D, `_getFormaImage` em mapview.js): `_disposeGroupContents`
   *  (chamado a cada `setScene`) já descarta a textura de QUALQUER material
   *  solto na cena pra não vazar memória de GPU trocando de mapa/modo
   *  repetidas vezes — cachear aqui só reintroduziria esse vazamento (ou um
   *  "usar depois de descartado"); recarregar de um dataURL já em memória é
   *  praticamente instantâneo, sem round-trip de rede. Respeita a
   *  OPACIDADE DA CAMADA (0-255, "Propriedades da camada") — pedido do
   *  usuário, mesmo teste que motivou este pedido: "apliquei transparência
   *  na camada onde ela está". */
  _buildImagemMesh(obj, baseY) {
    const THREE = this.THREE;
    const w = Math.max(0.05, obj.largura || 0.5), d = Math.max(0.05, obj.profundidade || 0.5);
    const layer = (this.mapData?.layers || []).find((l) => l.id === obj.layerId);
    const opacidade = layer?.opacidade != null ? Utils.clamp(layer.opacidade, 0, 255) / 255 : 1;
    const texture = obj.src ? new THREE.TextureLoader().load(obj.src) : null;
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      color: texture ? 0xffffff : _hexToThreeColor(obj.cor || '#8a92a3'), // sem `src` válido (não deveria acontecer) — cai numa placa lisa da cor do objeto, em vez de ficar invisível
      transparent: true, opacity: opacidade, side: THREE.DoubleSide, depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2); // deita na horizontal, virada pra CIMA
    const mesh = new THREE.Mesh(geo, mat);
    // Levemente ACIMA do chão (poucos mm) — evita "brigar" com o piso
    // xadrez por baixo (z-fight) quando elevacao=0 (deitada bem em cima
    // dele, o caso mais comum — um "tapete"/decalque no chão).
    mesh.position.set(obj.x, baseY + 0.004, obj.y);
    mesh.rotation.y = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
    this._group.add(mesh);
    const objPos = { x: obj.x, y: baseY, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: 0.05, z: d / 2 }, rotY: mesh.rotation.y, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);
  }

  /** Malha de um objeto importado de arquivo .obj (rodada 51 — ver
   *  js/objimport.js). `ObjImport.getGeometryData(key)` devolve os vértices
   *  já triangulados (posições, normais quando o próprio .obj trouxe, e a
   *  caixa delimitadora bruta do arquivo) SEM depender de Three.js — é este
   *  método que monta a `THREE.BufferGeometry` de verdade, igual a
   *  qualquer outra malha do motor. Recentraliza no eixo horizontal (X/Z)
   *  pelo CENTRO da caixa delimitadora do arquivo, e assenta a BASE (Y
   *  mínimo do arquivo) no chão (`baseY`) — um .obj comum, modelado em
   *  qualquer editor externo, raramente já nasce com a origem exatamente
   *  no meio da base, então sem isso a peça apareceria flutuando ou
   *  enterrada, ou fora do centro do "quadrado" onde foi clicada. Devolve
   *  `false` (sem adicionar nada) se o arquivo não está mais em memória
   *  (RAM apagada por um refresh de página, ver comentário no dispatcher
   *  acima) ou não tem geometria válida, pra quem chama cair no perfil
   *  genérico em vez de travar. */
  _buildObjImportMesh(obj, baseY, wireframe, colWireframe) {
    const data = window.ObjImport?.getGeometryData(obj.tipo);
    if (!data) return false;
    const THREE = this.THREE;
    // NOVO (07/09/2026), pedido verbatim: "Mesmo que seja um arquivo com
    // apenas um grupo de vértices, sem definição de faces [...] renderizar
    // a forma mesmo assim." — `data.positions === null` (ver objimport.js
    // `_parseObjText`) é exatamente esse caso: .obj só com linhas "v", sem
    // nenhum "f". Antes isso fazia esta função devolver `false` (nada
    // aparecia — caía no perfil genérico do dispatcher). Agora vira uma
    // NUVEM DE PONTOS (THREE.Points) com os vértices crus (`data.points`,
    // já achatado por `_parseObjText`), recentralizada pela mesma caixa
    // delimitadora usada pro caminho normal (mesh triangulada) logo abaixo
    // — mesmo posicionamento/rotação, só a geometria/material que mudam.
    if (!data.positions) {
      if (!data.points || data.points.length < 3) return false; // nada mesmo (nem 1 vértice) — cai no perfil genérico
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.Float32BufferAttribute(data.points, 3));
      const bb = data.bbox;
      pgeo.translate(-(bb.minX + bb.maxX) / 2, -bb.minY, -(bb.minZ + bb.maxZ) / 2);
      const pmat = new THREE.PointsMaterial({ color: _hexToThreeColor(obj.cor || '#9aa4b2'), size: 0.05, sizeAttenuation: true });
      const points = new THREE.Points(pgeo, pmat);
      points.position.set(obj.x, baseY, obj.y);
      points.rotation.y = objAnguloToRotY(obj.angulo);
      this._group.add(points);
      const objPos = { x: obj.x, y: baseY, z: obj.y };
      const w = Math.max(0.05, bb.maxX - bb.minX), d = Math.max(0.05, bb.maxZ - bb.minZ);
      const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: 0.05, z: d / 2 }, rotY: points.rotation.y, shape: 'box', segments: 14 } };
      this.pickables.push(objPick);
      points.userData.pick = objPick;
      this._pickMeshes.push(points);
      return true;
    }
    if (data.positions.length < 9) return false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    if (data.normals) geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    else geo.computeVertexNormals();
    // Recentraliza X/Z no meio da caixa delimitadora do arquivo e desloca Y
    // pra a base (mínimo) ficar em 0 — feito na PRÓPRIA geometria (não só
    // na posição da malha), pra a rotação (`mesh.rotation.y`, aplicada
    // depois) girar em torno do centro de verdade da peça, não de um canto
    // qualquer do arquivo original.
    const bb = data.bbox;
    geo.translate(-(bb.minX + bb.maxX) / 2, -bb.minY, -(bb.minZ + bb.maxZ) / 2);
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: _hexToThreeColor(obj.cor || '#9aa4b2') });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(obj.x, baseY, obj.y);
    mesh.rotation.y = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
    this._group.add(mesh);
    const w = bb.maxX - bb.minX, d = bb.maxZ - bb.minZ, h = bb.maxY - bb.minY;
    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6 || 0.3, ref: obj, obb: { half: { x: w / 2 || 0.2, y: h / 2 || 0.2, z: d / 2 || 0.2 }, rotY: mesh.rotation.y, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);
    return true;
  }

  /** Luminária de teto (2 lâmpadas fluorescentes compridas) — pedido do
   *  usuário: "faça uma luminária... uma luminária que vem com duas dessas
   *  lâmpadas compridas... 2 lâmpadas compridas, folha de metal branco
   *  envolvendo a parte de cima dessa peça, caixas retangulares nas
   *  extremidades". `perfil.w/d/h` = comprimento/profundidade/espessura da
   *  carcaça (ver OBJECT3D_PROFILES.luminaria). Mesma convenção de
   *  rotação/local->mundo de _buildMesaMesh acima. Termina adicionando uma
   *  luz de verdade (ver comentário dentro) — "ela deve deixar o que está
   *  próximo mais claro". */
  _buildLuminariaMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const w = perfil.w || 1.2, d = perfil.d || 0.16, h = perfil.h || 0.09;
    const rotY = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const matCarcaca = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color || 0xf2f3f5 });
    // Tubo "aceso" — cor PRÓPRIA (MeshBasicMaterial, não reage à luz da
    // cena), senão pareceria uma lâmpada apagada num ambiente escuro (o
    // motivo de existir a luminária, ver a luz de verdade lá embaixo).
    const matTubo = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshBasicMaterial({ color: 0xf5faff });
    const meshes = [];
    // Folha de metal branco envolvendo a parte de cima da peça.
    const topo = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, Math.max(0.015, h * 0.3), d), matCarcaca);
    topo.position.set(obj.x, baseY + h * 0.85, obj.y);
    topo.rotation.y = rotY;
    meshes.push(topo);
    // 2 lâmpadas compridas, lado a lado, quase do comprimento total da peça.
    const raioTubo = Math.max(0.014, d * 0.11);
    const tuboGeo = new THREE.CylinderGeometry(raioTubo, raioTubo, w * 0.88, 10);
    [-1, 1].forEach((lado) => {
      const lz = lado * d * 0.24; // offset local (perpendicular ao comprimento)
      const wx = obj.x + 0 * cos + lz * sin;
      const wz = obj.y - 0 * sin + lz * cos;
      const tubo = new THREE.Mesh(tuboGeo, matTubo);
      tubo.position.set(wx, baseY + h * 0.35, wz);
      // Eixo do cilindro (Y local) precisa ficar DEITADO ao longo do
      // comprimento da peça — gira 90° em Z antes de aplicar rotY (mesma
      // ordem de composição do Three.js: local primeiro, depois mundo).
      tubo.rotation.z = Math.PI / 2;
      tubo.rotation.y = rotY;
      meshes.push(tubo);
    });
    // Caixas retangulares nas duas extremidades.
    const capGeo = new THREE.BoxGeometry(w * 0.07, h, d * 1.08);
    [-1, 1].forEach((lado) => {
      const lx = lado * (w / 2 - w * 0.035);
      const wx = obj.x + lx * cos + 0 * sin;
      const wz = obj.y - lx * sin + 0 * cos;
      const cap = new THREE.Mesh(capGeo, matCarcaca);
      cap.position.set(wx, baseY + h / 2, wz);
      cap.rotation.y = rotY;
      meshes.push(cap);
    });
    meshes.forEach((m) => this._group.add(m));
    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    meshes.forEach((m) => { m.userData.pick = objPick; this._pickMeshes.push(m); });

    // Luz de verdade — pedido do usuário: "ela deve deixar o que está
    // próximo mais claro". `distance` limita o ALCANCE (falloff físico até
    // zerar ali, não ilumina o mapa inteiro) e a CONTAGEM de luzes de verdade
    // é limitada por Engine3D.MAX_LUMINARIA_LIGHTS (ver setScene/comentário
    // na constante) — as duas formas de "limite de atuação" pedidas, pra não
    // pesar no desempenho. Cor levemente fria (fluorescente). Só no modo
    // "dinâmico" (ver mapconfig.js modoLuminarias3D) — no modo "leve" a
    // iluminação é só cor (ver _tintForLight, já aplicado no material dos
    // objetos vizinhos), sem NENHUMA luz de verdade, de propósito.
    if (this._config.modoLuminarias3D !== 'leve' && (this._dynamicLights?.length || 0) < this._maxLuzesReais()) {
      const luz = new THREE.PointLight(0xeaf2ff, Engine3D.LUZ_LUMINARIA_INTENSITY, Engine3D.LUZ_LUMINARIA_DISTANCE, 2);
      luz.position.set(obj.x, baseY, obj.y);
      // [14/09/2026] NOVO — marca de quem é essa luz + a intensidade
      // ORIGINAL (antes de qualquer interruptor apagar/acender) — usado por
      // assets/modelos/interruptor.model.js pra achar as `PointLight`
      // reais das luminárias dentro do raio de controle e alternar entre
      // intensidade 0 (apagada) e este valor guardado (sem precisar
      // "adivinhar" `Engine3D.LUZ_LUMINARIA_INTENSITY` de novo, caso mude).
      luz.userData.ownerObjId = obj.id;
      luz.userData._intensidadeOriginal = Engine3D.LUZ_LUMINARIA_INTENSITY;
      this.scene.add(luz);
      this._dynamicLights = this._dynamicLights || [];
      this._dynamicLights.push(luz);
    }
  }

  /** NOVO (01/09/2026), item #11 do pedido de 12 itens, verbatim: "Faça um
   *  novo objeto 3D, o poste de iluminação pública." Mesmo espírito de
   *  `_buildLuminariaMesh` logo acima (peça de verdade com várias formas,
   *  não um cilindro sólido genérico) — haste alta + braço curto saindo do
   *  topo + luminária (cone virado pra baixo, formato clássico de poste de
   *  rua) na ponta, mais uma luz de verdade.
   *
   *  Decisão de design DELIBERADA (documentada, ao contrário da luminária de
   *  teto): o poste SEMPRE ganha uma `THREE.PointLight` de verdade,
   *  independente de `modoLuminarias3D` (o modo "leve" da luminária de teto
   *  desliga a luz real e só clareia objetos vizinhos — ver
   *  `_tintForLight`/comentário em `_buildLuminariaMesh`). Motivo: o
   *  pré-passo do modo "leve" (`_luzesLeves`, ver setScene) hoje só
   *  considera `obj.tipo === 'luminaria'` — estender esse filtro pra
   *  também incluir 'poste' seria escopo extra (mexer no pré-passo, testar
   *  os dois modos pra ele) fora do pedido original, que foi só "faça um
   *  novo objeto 3D". Como um poste é externo/ao ar livre — tende a
   *  aparecer em quantidade bem menor por mapa que luminárias de teto de um
   *  prédio inteiro — continua respeitando o MESMO orçamento compartilhado
   *  (`Engine3D.MAX_LUMINARIA_LIGHTS`/`_dynamicLights`, ver comentário na
   *  constante) e o mesmo `updateActiveLights` (só as mais próximas da
   *  câmera ficam acesas), então não há risco de desempenho REAL diferente
   *  de uma luminária comum — só não desliga sozinho no modo "leve". Se o
   *  usuário preferir o mesmo comportamento da luminária de teto aqui,
   *  é só reportar. */
  _buildPosteMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const alturaHaste = perfil.h || 4.5;
    const raioHaste = perfil.r || 0.07;
    const rotY = objAnguloToRotY(obj.angulo);
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const matHaste = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color || 0x494e57 });
    // Luminária na ponta — cor PRÓPRIA (MeshBasicMaterial, não reage à luz
    // da cena), mesmo motivo do tubo da luminária de teto: precisa parecer
    // "acesa" mesmo no escuro. Tom quente (âmbar, tipo vapor de sódio) —
    // diferente do branco frio da luminária de teto, pra ficar visualmente
    // distinto (lâmpada de rua clássica vs. fluorescente de interior).
    const matLampada = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const meshes = [];

    // Haste vertical (leve afunilamento pra base — mais grossa embaixo).
    const hasteGeo = new THREE.CylinderGeometry(raioHaste, raioHaste * 1.3, alturaHaste, 10);
    const haste = new THREE.Mesh(hasteGeo, matHaste);
    haste.position.set(obj.x, baseY + alturaHaste / 2, obj.y);
    meshes.push(haste);

    // Braço: um trecho reto na direção "de frente" do poste (obj.angulo),
    // saindo de perto do topo da haste — versão simplificada de um braço
    // curvo (formato real de poste de rua), suficiente pra "ver que ali tem
    // um poste com luminária apontando pra um lado", igual ao nível de
    // detalhe já aceito nos outros perfis deste arquivo.
    const comprimentoBraco = 0.9;
    const raioBraco = raioHaste * 0.75;
    const yBraco = baseY + alturaHaste - 0.05;
    const bracoGeo = new THREE.CylinderGeometry(raioBraco, raioBraco, comprimentoBraco, 8);
    const braco = new THREE.Mesh(bracoGeo, matHaste);
    const lx = comprimentoBraco / 2;
    braco.position.set(obj.x + lx * cos, yBraco, obj.y - lx * sin);
    braco.rotation.z = Math.PI / 2; // deita o cilindro (eixo Y local -> horizontal)
    braco.rotation.y = rotY;
    meshes.push(braco);

    // Luminária: cone virado pra baixo na ponta do braço (silhueta clássica
    // de poste de rua, vista de baixo).
    const lampGeo = new THREE.ConeGeometry(0.16, 0.22, 10);
    const lamp = new THREE.Mesh(lampGeo, matLampada);
    const wx = obj.x + comprimentoBraco * cos, wz = obj.y - comprimentoBraco * sin;
    const lampY = yBraco - 0.16;
    lamp.position.set(wx, lampY, wz);
    lamp.rotation.x = Math.PI; // ponta do cone pra baixo
    meshes.push(lamp);

    meshes.forEach((m) => this._group.add(m));
    const objPos = { x: obj.x, y: baseY + alturaHaste / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(alturaHaste / 2, comprimentoBraco), ref: obj, obb: { half: { x: raioHaste * 3, y: alturaHaste / 2, z: raioHaste * 3 }, rotY, shape: 'cylinder', segments: 10 } };
    this.pickables.push(objPick);
    meshes.forEach((m) => { m.userData.pick = objPick; this._pickMeshes.push(m); });

    // Luz de verdade — SEMPRE (ver decisão de design documentada acima),
    // cor quente (mesmo tom da lâmpada, sódio). Mesmo orçamento
    // compartilhado das luminárias (`_maxLuzesReais`). AJUSTADO
    // (02/09/2026) — intensidade/alcance agora são `LUZ_LUMINARIA_*` × 3
    // (ver constantes/comentário grande logo acima de `_maxLuzesReais`),
    // pedido verbatim: "O poste de luz deve iluminar 3 vezes o que a
    // luminária ilumina."
    if ((this._dynamicLights?.length || 0) < this._maxLuzesReais()) {
      const luz = new THREE.PointLight(0xffcf8c, Engine3D.LUZ_POSTE_INTENSITY, Engine3D.LUZ_POSTE_DISTANCE, 2);
      luz.position.set(wx, lampY, wz);
      // [13/09/2026] NOVO — `ownerObjId` (mesmo campo já usado pela luz da
      // luminária, ver `_buildLuminariaMesh`/linha com
      // `luz.userData.ownerObjId = obj.id`, ~10 linhas acima na função
      // irmã): faltava aqui, o que impedia qualquer código (ex.: um
      // interruptor) de achar "a luz de verdade DESTE poste" por id —
      // necessário pro `interruptor-remoto.model.js` novo (TAREFA 5 do
      // backlog: painel de controle remoto que liga/desliga uma LISTA
      // de postes por id, de longe, sem raio físico).
      luz.userData.ownerObjId = obj.id;
      this.scene.add(luz);
      this._dynamicLights = this._dynamicLights || [];
      this._dynamicLights.push(luz);
    }
  }

  /** [15/09/2026] NOVO — corrige a orientação do relógio (bug confirmado
   *  pelo usuário: "os relógios... ficam deitados... é só girar o relógio
   *  para que fique na parede. Cuide para que fique na superfície da
   *  parede, não dentro da parede") e acrescenta ponteiros de verdade,
   *  animados a partir de `window.RelogioMundo.getHoraAtual()` (ver
   *  `_updateRelogiosParede`, chamado todo quadro por view3d.js).
   *
   *  ORIENTAÇÃO — o `CylinderGeometry` usado pelo perfil (`OBJECT3D_
   *  PROFILES.relogio`, engine3d-profiles.js) tem o eixo Y por padrão: com
   *  só `mesh.rotation.y = objAnguloToRotY(obj.angulo)` (o que o ramo
   *  genérico fazia antes desta correção) o disco fica DEITADO — os dois
   *  círculos (mostrador) ficam virados pro TETO e pro CHÃO, nunca de
   *  frente pra quem olha, não importa `obj.angulo`. A correção é rodar o
   *  cilindro 90° num eixo HORIZONTAL primeiro (`rotation.x = Math.PI/2`,
   *  escolhido — e não `rotation.z` — porque com Euler na ordem padrão
   *  'XYZ' do Three.js a rotação X é aplicada ANTES da Y: o disco primeiro
   *  "levanta" ficando de pé com a normal do mostrador apontando pro eixo
   *  Z local, e SÓ DEPOIS a rotação Y de sempre gira esse "de pé" em torno
   *  do eixo vertical pra apontar o mostrador pra fora da parede, exatamente
   *  na direção de `obj.angulo` — se fosse `rotation.z` a ordem colocaria a
   *  normal no eixo X local e a rotação Y subsequente a giraria errado,
   *  perpendicular à direção esperada). `mesh.rotation.set(x, y, z)` abaixo
   *  fixa os DOIS ao mesmo tempo (mesma chamada usada por outras peças
   *  compostas deste arquivo, ex. `_buildLuminariaMesh`), sem depender da
   *  ordem de duas atribuições separadas.
   *
   *  POSIÇÃO/ENCOSTO NA PAREDE — igual a `quadro`/`interruptor`/
   *  `disjuntor` (todos objetos de parede que passam pelo MESMO ramo
   *  genérico, ver comentário da tabela em engine3d-profiles.js): este
   *  motor NÃO aplica nenhum deslocamento perpendicular automático além da
   *  própria posição `obj.x`/`obj.y` do objeto — quem "encosta" o objeto na
   *  superfície da parede (sem cravar pra dentro nem flutuar longe) é o
   *  próprio usuário, ao posicionar no editor 2D (mapview.js já ajuda a
   *  encaixar objetos de parede rente à linha da parede, mesmo mecanismo
   *  usado por quadro/interruptor/disjuntor há várias rodadas). A correção
   *  de posição do relógio, portanto, é a MESMA receita desses objetos —
   *  nenhum offset extra dedicado é necessário nem desejável (inventar um
   *  deslocamento só pro relógio o desalinharia dos demais objetos de
   *  parede, que o usuário já sabe posicionar). O que fica genuinamente
   *  ERRADO sem esta função é só a ROTAÇÃO (acima) — que é o que o usuário
   *  de fato reportou ("ficam deitados").
   *
   *  PONTEIROS — 3 meshes-filho FINOS (caixas achatadas, mais simples que
   *  cilindros pra um ponteiro) nascem AQUI (montagem única) com pivô na
   *  base (posição deslocada pra que a ORIGEM do mesh — em torno da qual o
   *  ponteiro gira — fique no "eixo" do relógio, não no meio do ponteiro) e
   *  são registrados em `this._relogiosParede` para `_updateRelogiosParede`
   *  girar a cada quadro — ver ali pro EIXO/fórmula corretos (`rotation.y`,
   *  não `rotation.z` — comentário grande de `_updateRelogiosParede`
   *  explica com conta feita no Three.js real por que `rotation.z` girava
   *  os ponteiros no plano ERRADO/deitado, o "lado errado" reportado pelo
   *  usuário). Por isso o ponteiro nasce aqui apontando pro eixo **-Z
   *  LOCAL** do `mesh` (não mais +Y): -Z local é quem, depois da postura
   *  X+Y do `mesh`, cai em cima no mundo (+Y, "12 horas") — condição pra
   *  girar em `rotation.y` (que no mundo corresponde à normal do
   *  mostrador, +Z) e varrer certinho o plano vertical do rosto do relógio.
   *
   *  ESPESSURA — [15/09/2026, CORRIGIDO — pedido do usuário: "deve ter
   *  ponteiros finos"] antes os ponteiros eram proporcionais ao raio `r` do
   *  mostrador (`r*0.22`/`r*0.14`/`r*0.05` de largura — ficavam grossos
   *  demais, mais parecidos com réguas que com ponteiros). Agora largura e
   *  espessura são valores ABSOLUTOS em metros (não escalam com `r` — um
   *  ponteiro de relógio de parede de verdade tem a mesma largura em cm
   *  independente do relógio ser um pouco maior ou menor), na escala de um
   *  ponteiro real: hora ~1,2cm de largura × 0,3cm de espessura, minuto mais
   *  fino ~0,8cm × 0,25cm, segundo bem fino ~0,3cm × 0,2cm — só o
   *  COMPRIMENTO continua proporcional a `r` (hora mais curto, minuto mais
   *  longo, segundo o mais longo, convenção universal já usada no desenho
   *  2D do relógio, ver mapview.js `_drawFormaShape`/drawHand). */
  _buildRelogioMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const r = perfil.r || 0.15;
    const h = perfil.h || 0.04;
    const rotY = objAnguloToRotY(obj.angulo);
    const geo = new THREE.CylinderGeometry(r, r, h, perfil.segments || 14);
    // Marcações de hora — textura procedural (canvas 2D, gerada/cacheada
    // UMA vez, ver `_getProceduralMostradorTexture` acima) aplicada como
    // `map` do disco do mostrador. `color: 0xffffff` é OBRIGATÓRIO junto
    // com `map`: `MeshLambertMaterial.color` MULTIPLICA a textura — deixar
    // a cor do perfil (creme) aqui escureceria/tingiria os traços desenhados
    // no canvas; a cor de fundo do mostrador já está pintada DENTRO do
    // próprio canvas (mesma cor do perfil, ver função), então o resultado
    // final bate com o visual de sempre, só que com os tracinhos por cima.
    // Wireframe não ganha textura (não faz sentido/não aparece mesmo).
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: 0xffffff, map: this._getProceduralMostradorTexture(perfil.color) });
    const mesh = new THREE.Mesh(geo, mat);
    const centerY = baseY + perfil.y0 + r; // r, não h/2: de pé, a "altura" ocupada é o DIÂMETRO do mostrador, não a espessura do disco
    mesh.position.set(obj.x, centerY, obj.y);
    // Ver comentário grande acima pro porquê de X-antes-de-Y (Euler 'XYZ' padrão).
    mesh.rotation.set(Math.PI / 2, rotY, 0);
    this._group.add(mesh);

    // Ponteiros — caixas finas e curtas, cor escura (contraste com o
    // mostrador claro do perfil). São FILHOS de `mesh`: herdam
    // automaticamente a posição/rotação de "de pé + virado pro ângulo
    // certo" dele, então só precisam girar em `rotation.y` (ver comentário
    // grande acima e o de `_updateRelogiosParede`) pra apontar a hora —
    // nenhuma conta de mundo precisa ser refeita a cada quadro.
    const matPonteiro = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: 0x2c313a });
    const fazPonteiro = (comprimento, largura, espessura) => {
      // Geometria com o PIVÔ na base (não no centro): X=largura (visível de
      // frente), Y=espessura (fininho, no sentido que sai da parede),
      // Z=comprimento (eixo em que o ponteiro se estende) — desloca a
      // geometria em -comprimento/2 no eixo Z LOCAL, então a ORIGEM do mesh
      // (em torno de onde `rotation.y` gira, ver comentário grande da
      // função) fica no "eixo" do relógio, e o ponteiro nasce apontando
      // pro -Z local, que cai em "12 horas" (+Y mundo, pra cima) antes de
      // qualquer rotação de hora — exatamente como um ponteiro parado no
      // 12 antes do relógio começar a andar.
      const g = new THREE.BoxGeometry(largura, espessura, comprimento);
      g.translate(0, 0, -comprimento / 2);
      const m = new THREE.Mesh(g, matPonteiro);
      // Levemente à frente do mostrador (eixo Y LOCAL do `mesh` — depois da
      // rotação X acima, é ele quem cai na normal que sai da parede, +Z
      // mundo — ver comentário grande da função) — evita z-fighting/
      // "ponteiro sumindo dentro do disco".
      m.position.y = h / 2 + 0.002;
      mesh.add(m);
      return m;
    };
    const ponteiroHora = fazPonteiro(r * 0.5, 0.012, 0.003);
    const ponteiroMinuto = fazPonteiro(r * 0.72, 0.008, 0.0025);
    const ponteiroSegundo = fazPonteiro(r * 0.8, 0.003, 0.002);

    const raioPick = r * 1.3;
    const objPos = { x: obj.x, y: centerY, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: raioPick, ref: obj, obb: { half: { x: r, y: r, z: h }, rotY, shape: 'box', segments: perfil.segments || 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);

    // Registra pra `_updateRelogiosParede` (chamado todo quadro por
    // view3d.js) girar os ponteiros conforme a hora do MUNDO
    // (`window.RelogioMundo`, ver js/relogio-mundo.js) — não a hora do
    // aparelho do usuário (`new Date()`), decisão consistente com o resto
    // da infraestrutura do prédio (robôs de copa/limpeza/recepcionista já
    // usam `RelogioMundo` pra saber se é hora do almoço etc.).
    // [15/09/2026 UTC] BUG CORRIGIDO — pedido verbatim do usuário: "Acrescentei
    // um script [fixando horaPonteiro/minutoPonteiro/segundoPonteiro], porém
    // o relógio seguiu funcionando normalmente [ignorando o script]." CAUSA
    // RAIZ: este `push` nunca guardava `obj` (só os 3 meshes de ponteiro) —
    // `_updateRelogiosParede` já lia `r.obj?.horaPonteiro` etc. (ver
    // comentário grande lá, RODADA anterior), mas `r.obj` era SEMPRE
    // `undefined` porque a referência nunca tinha sido incluída aqui, então
    // o `Number.isFinite(obj?.horaPonteiro)` sempre falhava e o relógio
    // caía no fallback (hora do `RelogioMundo`) mesmo com um Script válido
    // escrevendo os 3 campos todo quadro. Corrigido incluindo `obj` no
    // objeto registrado.
    this._relogiosParede.push({ obj, ponteiroHora, ponteiroMinuto, ponteiroSegundo });
  }

  /** [15/09/2026] NOVO — "quadro-mesa" (porta-retrato pequeno de mesa/
   *  estante, ver `OBJECT3D_PROFILES['quadro-mesa']` em engine3d-
   *  profiles.js). Único motivo de existir como builder DEDICADO em vez de
   *  cair no ramo genérico (que os outros objetos de superfície simples
   *  como cafeteira/pia usam): a inclinação FIXA (~12°) pedida, simulando
   *  um porta-retrato "em pé", apoiado pra trás numa superfície — o ramo
   *  genérico só aplica `rotation.y` (`objAnguloToRotY`), sem nenhum campo
   *  pra inclinação extra em X/Z por tipo. Mesma ideia de `_buildRelogioMesh`
   *  (rotação composta X+Y), só que aqui a inclinação em X é FIXA (não
   *  depende de nenhuma hora/estado ao vivo) — nasce inclinado e nunca mais
   *  muda, sem precisar de nenhum tick/`_update*` novo. */
  _buildQuadroMesaMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const INCLINACAO = 12 * Math.PI / 180; // ~12°, pedido do usuário
    const geo = new THREE.BoxGeometry(perfil.w, perfil.h, perfil.d);
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const mesh = new THREE.Mesh(geo, mat);
    // Pivô na base (não no centro) — inclinar em torno do CENTRO faria o
    // porta-retrato "afundar" na mesa de um lado; deslocando a geometria
    // em +h/2 antes de qualquer rotação, a origem do mesh fica na BASE, e
    // a inclinação em X gira o porta-retrato em torno dela mesma (igual um
    // porta-retrato de verdade balançando sobre o pé de apoio).
    geo.translate(0, perfil.h / 2, 0);
    const centerY = baseY + perfil.y0;
    mesh.position.set(obj.x, centerY, obj.y);
    const rotY = objAnguloToRotY(obj.angulo);
    mesh.rotation.set(INCLINACAO, rotY, 0);
    this._group.add(mesh);
    const raioPick = Math.max(perfil.w, perfil.d) * 0.6;
    const objPos = { x: obj.x, y: centerY + perfil.h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: raioPick, ref: obj, obb: { half: { x: perfil.w / 2, y: perfil.h / 2, z: perfil.d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);
  }

  /** Remove e descarta (geometria/material — NÃO a textura do chão nem a do
   *  vidro "Minecraft", reutilizadas entre reconstruções, ver
   *  _glassShineTexture/_buildGlassPane) todo mundo do grupo da cena. */
  _disposeGroupContents() {
    if (!this._group) return;
    // [12/09/2026] Limpa a lista de malhas de vidro ANTES do rebuild — ver
    // `_buildGlassPane`/`_renderGlassPass`: as malhas antigas serão
    // descartadas (`dispose()`) logo abaixo, então manter referência a
    // elas na lista serviria só pra apontar pra lixo; os novos vidros (se
    // a cena reconstruída tiver algum) se registram de novo sozinhos.
    this._glassMeshesAtivos = [];
    this._group.children.slice().forEach((obj) => {
      this._group.remove(obj);
      // NOVO (01/09/2026), item GRANDE #5 — um THREE.LOD (ver
      // _buildTypeMoldeMesh) não tem `geometry`/`material` PRÓPRIOS, só os
      // filhos (um Mesh por nível) têm — sem este ramo, o loop normal
      // abaixo (que só olha `obj.geometry`/`obj.material`) nunca descartaria
      // as DUAS malhas de dentro dele, vazando geometria/material de GPU a
      // cada troca de mapa/modo. `return` aqui pula o resto do loop pra este
      // `obj` (já tratado por completo).
      if (obj.isLOD) {
        obj.levels.forEach((lvl) => {
          lvl.object.geometry?.dispose?.();
          const matsLvl = Array.isArray(lvl.object.material) ? lvl.object.material : [lvl.object.material].filter(Boolean);
          matsLvl.forEach((m) => m?.dispose?.());
        });
        return;
      }
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material].filter(Boolean);
      // `_itemBadgeTexCache`/`_countBadgeTexCache`/`_ordinalBadgeTexCache`/
      // `_anelDouradoTex` (ver _buildItemBadgeTexture/_buildCountBadgeTexture/
      // _buildOrdinalBadgeTexture/_buildAnelDouradoTexture) são MESMO
      // espírito de `_floorTexture`/`_glassShineTexture`: construídas uma vez
      // só e compartilhadas por todo selo "🔗 item associado"/"×N"/ordinal/
      // halo dourado da cena — sem esta exclusão, o 1º rebuild de cena (troca
      // de modo/mapa/config) descartaria a textura de verdade na GPU, mas o
      // cache em JS continuaria apontando pra ela (nunca é limpo), e o
      // próximo objeto associado reusaria uma textura já descartada (selo/
      // halo ficaria em branco/preto).
      const isBadgeTex = (t) => (this._itemBadgeTexCache && Object.values(this._itemBadgeTexCache).includes(t))
        || (this._countBadgeTexCache && [...this._countBadgeTexCache.values()].includes(t))
        || (this._ordinalBadgeTexCache && [...this._ordinalBadgeTexCache.values()].includes(t))
        || t === this._anelDouradoTex;
      mats.forEach((m) => { if (m?.map && m.map !== this._floorTexture && m.map !== this._glassShineTexture && !isBadgeTex(m.map)) m.map.dispose?.(); m?.dispose?.(); });
      // Modo "Sólido+wireframe para desempenho" (ver _setupHybridMeshes)
      // guarda um SEGUNDO material por malha (`_solidMat`/`_wireMat`) que
      // pode não ser o `obj.material` ATUAL no momento do descarte (a malha
      // pode ter sido trocada pro wireframe por `updateHybridQuality` antes
      // de trocar de mapa/modo) — sem isto, o material que não estava em uso
      // na hora vazava (nunca era descartado).
      if (obj.userData?._solidMat && obj.userData._solidMat !== obj.material) obj.userData._solidMat.dispose?.();
      if (obj.userData?._wireMat && obj.userData._wireMat !== obj.material) obj.userData._wireMat.dispose?.();
    });
  }

  _resize() {
    if (!this.renderer) return;
    const dpr = this._pixelRatioCap();
    // REESCRITO (07/09/2026), arquitetura WebGLRenderTarget — ver "MODO EYE"
    // no construtor. Em modo eye, o tamanho vem do próprio tamanho CSS de
    // `this.canvas` (`clientWidth`/`clientHeight`), EXATAMENTE como no modo
    // não-eye logo abaixo — não depende mais de `getBoundingClientRect()`
    // (posição na tela é irrelevante agora, só o TAMANHO importa) nem de
    // nenhum canvas/buffer global compartilhado entre "olhos". Quem
    // redimensiona é o `THREE.WebGLRenderTarget` PRÓPRIO desta instância
    // (`this.renderTarget.setSize`), na resolução `tamanho CSS × dpr desta
    // instância` — cada "olho" cresce/encolhe seu próprio buffer sem afetar
    // nenhum outro "olho" ativo ao mesmo tempo.
    if (this._eye) {
      // [13/09/2026] NOVO — resolução customizada (ver comentário grande no
      // construtor sobre `this._customRes`): quando presente, o TAMANHO DE
      // RENDERIZAÇÃO (render target + buffers + câmera) vem dela — fixo,
      // em pixels reais, SEM multiplicar por `dpr` (o campo já pede
      // "pixels" diretamente nas Configurações 3D, não "pontos CSS") — em
      // vez do tamanho CSS do canvas × dpr, que é o que continua valendo
      // quando `_customRes` é `null` ("Automática", ramo de sempre, 100%
      // inalterado). O TAMANHO CSS do canvas (`cw`/`ch`, layout normal da
      // tela) NÃO muda — o "encaixe" de uma resolução de renderização
      // `pw`×`ph` diferente do tamanho CSS do canvas é resolvido de graça
      // pelo próprio navegador: `this.canvas.width/height` (mais abaixo)
      // viram `pw`/`ph` (não `cw`×dpr/`ch`×dpr como no ramo "Automática"),
      // e todo `<canvas>` já estica seu buffer de pixels pra caber na caixa
      // CSS sozinho — é exatamente o "Esticar" pedido, sem nenhum desenho
      // extra. "Caber" (preservar proporção, barras pretas) é só CSS
      // `object-fit:contain` + fundo preto por cima disso — ver
      // view3d.js `_applyResolucaoCustom3D`, que aplica esse `object-fit`
      // no elemento `<canvas>` conforme `this._customRes.fit`.
      // `_presentToCanvas()` (mais abaixo) continua desenhando 1:1 dentro
      // do buffer `pw`×`ph` do PRÓPRIO canvas, sem saber de "esticar"/
      // "caber" — é só o CSS por fora que decide como esse buffer aparece
      // na tela.
      const cw = this.canvas.clientWidth || 1, ch = this.canvas.clientHeight || 1;
      const custom = this._customRes;
      const w = custom ? custom.w : cw, h = custom ? custom.h : ch;
      const effDpr = custom ? 1 : dpr;
      if (w === this._lastW && h === this._lastH && effDpr === this._lastDpr && cw === this._lastCw && ch === this._lastCh) return;
      this._lastW = w; this._lastH = h; this._lastDpr = effDpr;
      this._lastCw = cw; this._lastCh = ch;
      const pw = Math.max(1, Math.round(w * effDpr)), ph = Math.max(1, Math.round(h * effDpr));
      this.renderTarget.setSize(pw, ph);
      this._rtPixelW = pw; this._rtPixelH = ph;
      this._rtPixelBuffer = new Uint8Array(pw * ph * 4);
      // [13/09/2026] NOVO — ver comentário grande em `_initThree`/
      // `_renderGlassPass` sobre o 2º render target (vidro isolado): mesmo
      // tamanho do principal, sempre — a textura de profundidade
      // compartilhada (`_glassDepthTexture`) também é redimensionada
      // automaticamente por `setSize` (é a MESMA textura usada pelos 2
      // render targets).
      if (this._glassRenderTarget) {
        this._glassRenderTarget.setSize(pw, ph);
        this._glassPixelBuffer = new Uint8Array(pw * ph * 4);
      }
      // [22/09/2026] NOVO — ver comentário grande em `_initThree` sobre
      // `_backdropEnvRenderTarget` (2º passe do backdrop 'Trás', sem
      // relação com o vidro) — mesmo tamanho dos outros 2, sempre.
      if (this._backdropEnvRenderTarget) {
        this._backdropEnvRenderTarget.setSize(pw, ph);
        this._backdropEnvPixelBuffer = new Uint8Array(pw * ph * 4);
      }
      // Canvas de saída (visível) em resolução NATIVA de verdade (igual ao
      // render target) — o navegador escala isso pra caber no tamanho CSS
      // sozinho (mesmo comportamento de sempre de um <canvas> WebGL, e
      // combina com `image-rendering:pixelated` já aplicado em CSS pra
      // reproduzir o efeito "pixelizado" da miniatura, ver style.css).
      this.canvas.width = pw; this.canvas.height = ph;
      // Canvas auxiliar off-screen (nunca no DOM) na MESMA resolução — ver
      // comentário grande em `_initThree` sobre o motivo dele existir
      // (putImageData não respeita setTransform, drawImage respeita).
      this._rtOffscreen.width = pw; this._rtOffscreen.height = ph;
      this.camera3.aspect = w / h;
      this.camera3.updateProjectionMatrix();
      if (this._outlineCanvas) {
        this._outlineCanvas.width = w; this._outlineCanvas.height = h;
        // [correção 13/09/2026] BUG RELATADO PELO USUÁRIO (persistia mesmo
        // depois da 1ª tentativa de correção, que só mexeu em
        // `_pickAtClientPoint`/view3d.js — aquela correção resolve o RAIO do
        // clique/mira do mouse real nos modos "Ver através desta
        // câmera"/"órbita", mas o destaque em si (o contorno pontilhado
        // desenhado ao redor do objeto mirado) é pintado num <canvas> 2D
        // SEPARADO — `this._outlineCanvas`, ver construtor — que é
        // posicionado por CSS com `position:absolute; inset:0` (ver
        // `.v3d-hover-outline-canvas` em css/style.css): isso faz ele
        // SEMPRE esticar por cima da caixa CSS INTEIRA do canvas WebGL
        // irmão, não importa o que `object-fit` daquele canvas esteja
        // fazendo. Com "Caber" (`object-fit:contain`), o WebGL desenha seu
        // conteúdo ENCOLHIDO/centralizado dentro da caixa (barras pretas
        // nas laterais ou em cima/baixo) — mas o canvas do contorno
        // continuava desenhando (com coordenadas internas corretas, já que
        // `width`/`height` acima já são `w`/`h` certos) esticado pra caixa
        // INTEIRA, então o contorno aparecia deslocado/fora de escala em
        // relação à imagem 3D real — exatamente "como se estivesse em
        // Esticar", só que agora É POR CIMA da imagem certa (o raio já foi
        // corrigido), não no raio em si. Corrigido posicionando este canvas
        // (via `style.left/top/width/height` inline, sobrepondo o
        // `inset:0` do CSS) no MESMO sub-retângulo "letterboxed" que o
        // navegador desenha o conteúdo do canvas WebGL — mesma matemática
        // de `object-fit:contain` já usada em `view3d.js`
        // `_computeContainRect` (duplicada aqui em vez de chamada de lá
        // porque `Engine3D` não deve depender de `View3D` — sentido
        // contrário de dependência do resto do arquivo). `cw`/`ch` (a caixa
        // CSS cheia, calculados logo acima) e `w`/`h` (o conteúdo,
        // `custom.w`/`custom.h`) já estão em escopo aqui.
        if (custom && custom.fit === 'caber' && cw && ch) {
          const boxRatio = cw / ch, contentRatio = w / h;
          let left = 0, top = 0, dispW = cw, dispH = ch;
          if (boxRatio > contentRatio) {
            dispW = ch * contentRatio;
            left = (cw - dispW) / 2;
          } else {
            dispH = cw / contentRatio;
            top = (ch - dispH) / 2;
          }
          this._outlineCanvas.style.left = `${left}px`;
          this._outlineCanvas.style.top = `${top}px`;
          this._outlineCanvas.style.width = `${dispW}px`;
          this._outlineCanvas.style.height = `${dispH}px`;
        } else {
          // "Automática"/"Esticar": limpa qualquer override anterior — volta
          // a valer o `inset:0` do CSS (cobre a caixa inteira), 100%
          // comportamento de sempre.
          this._outlineCanvas.style.left = '';
          this._outlineCanvas.style.top = '';
          this._outlineCanvas.style.width = '';
          this._outlineCanvas.style.height = '';
        }
      }
      return;
    }
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    if (w === this._lastW && h === this._lastH) return;
    this._lastW = w; this._lastH = h;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera3.aspect = w / h;
    this.camera3.updateProjectionMatrix();
    // Buffer de pixels em escala 1:1 com o tamanho CSS (não multiplicado
    // pelo dpr, ao contrário do canvas WebGL) — assim o mapeamento NDC ->
    // pixel em _drawOutline2D pode usar width/height direto, sem precisar
    // saber do dpr separadamente.
    if (this._outlineCanvas) { this._outlineCanvas.width = w; this._outlineCanvas.height = h; }
  }

  /** NOVO (07/09/2026), arquitetura WebGLRenderTarget — ver "MODO EYE" no
   *  construtor. Chamado por `render()` logo depois de desenhar no
   *  `this.renderTarget` desta instância: lê os pixels de volta pra CPU
   *  (`readRenderTargetPixels`, síncrono — trade-off de performance aceito,
   *  ver changelog do sw.js) e desenha no `<canvas>` 2D VISÍVEL desta
   *  instância (`this._displayCtx`).
   *
   *  Espelhamento vertical: o WebGL guarda a imagem com a linha 0 (topo dos
   *  dados) correspondendo ao canto INFERIOR da imagem (convenção OpenGL,
   *  origem embaixo-à-esquerda) — mas `ImageData`/`putImageData` do Canvas2D
   *  espera a linha 0 no TOPO visual (origem em cima-à-esquerda, convenção
   *  padrão de imagem). `putImageData` sozinho NÃO tem como aplicar nenhuma
   *  transformação (ignora `ctx.setTransform`/`ctx.scale` por completo) —
   *  por isso o pulo do gato é em duas etapas: 1) `putImageData` dos pixels
   *  CRUS (ainda de cabeça para baixo) num canvas AUXILIAR off-screen
   *  (`this._rtOffscreen`, sem nenhuma transformação); 2) `drawImage` desse
   *  canvas auxiliar pro canvas visível de verdade, com uma matriz de
   *  transformação que inverte o eixo Y (`setTransform(1,0,0,-1,0,h)` — escala
   *  Y por -1 e desloca por `h` pra compensar, exatamente a técnica padrão
   *  pra espelhar verticalmente num `<canvas>` 2D) — `drawImage`, ao
   *  contrário de `putImageData`, RESPEITA a matriz de transformação atual
   *  do contexto. */
  /** [12/09/2026] NOVO — pedido verbatim: "Agora, o 'Trás' não está
   *  aparecendo a imagem." CAUSA RAIZ: a rodada anterior (ver comentário
   *  grande em `View3D._ensureFotoCamBackdropPlane`) trocou o plano do
   *  backdrop 'Trás' por um "oclusor invisível" (`colorWrite:false`) — a
   *  ideia era que, onde ele vencesse o depth-test contra o ambiente real
   *  (mais distante), o pixel ficasse TRANSPARENTE (alfa=0, a cor de
   *  limpeza do frame) e deixasse o `<canvas>` da foto (empilhado por
   *  BAIXO via CSS) aparecer. MAS a cena SEMPRE tem `scene.background`
   *  definido como uma `THREE.Color` sólida (o céu — ver `_updateSky`,
   *  linha ~2472) — o Three.js pinta esse fundo OPACO em TODO pixel não
   *  coberto por outro objeto, ANTES de desenhar qualquer objeto da cena
   *  (não é afetado por depth-test nenhum, nem pelo `colorWrite:false` do
   *  oclusor) — ou seja, o pixel "reservado" pelo oclusor nunca ficava
   *  transparente de verdade: ficava com a cor do céu, sempre opaca,
   *  escondendo o `<canvas>` da foto por baixo (dava a impressão de "a
   *  imagem não aparece", só o céu/cenário normal).
   *  CORRIGIDO: o oclusor (`_ensureFotoCamBackdropPlane`) voltou a ter
   *  `colorWrite:true`, mas pintando uma cor-MARCADORA sólida e reservada
   *  (magenta puro, `0xff00ff` — ver lá) em vez de textura nenhuma. Este
   *  método agora recebe essa máscara (`this._fotoCamMask`, setada por
   *  `setFotoCamBackdropMask`/limpa por `clearFotoCamBackdropMask`, ambos
   *  chamados por `View3D`/`Modeler3D` só quando 'Trás' está ativo) e,
   *  ANTES de desenhar no canvas visível, zera o ALFA de todo pixel que
   *  bater com essa cor-marcadora — só dentro do retângulo do quadro
   *  calibrado (`mask.rectPx`, barato, delimitado, nunca a tela inteira).
   *  Como esses pixels de marcador só existem onde o AMBIENTE de verdade
   *  era mais distante que a "foto" (o oclusor só vence o depth-test
   *  ali — onde há um objeto real mais perto, ele desenha por cima do
   *  marcador normalmente, sem ser afetado), zerar o alfa exatamente
   *  onde a cor bate reproduz o "buraco" que o `colorWrite:false` deveria
   *  ter feito sozinho, agora contornando o preenchimento opaco do céu.
   *  `clearRect` no retângulo da máscara (convertido pra pixels do
   *  RENDER TARGET, incluindo a inversão de linha OpenGL — ver comentário
   *  grande logo abaixo) evita "fantasma" do quadro anterior nesses
   *  pixels agora transparentes (sem isso, `drawImage` com alfa=0 nesses
   *  pontos preservaria o conteúdo OPACO do quadro anterior ali, por
   *  composição `source-over` padrão — o comentário antigo, preservado
   *  antes desta correção, dizia não precisar de `clearRect` porque a
   *  imagem SEMPRE cobria o canvas inteiro com alfa=1; deixou de ser
   *  verdade só nesta região da máscara). */
  /** [13/09/2026] NOVO — extraído de dentro de `_presentToCanvas` (fonte
   *  única, ver armadilha #4 do projeto) pra também ser usado por
   *  `_updateFloorMaskUniform` (abaixo): converte `mask.rectPx` (pixels de
   *  CSS, origem topo-esquerda) pro espaço de pixel do RENDER TARGET, já
   *  na convenção "crua" (origem embaixo-à-esquerda, linha crescendo pra
   *  CIMA) — mesma convenção de `this._rtPixelBuffer` E de `gl_FragCoord.xy`
   *  no shader (as 2 são "window coordinates" do WebGL, origem
   *  embaixo-à-esquerda — por isso o MESMO retângulo cru serve pros 2 sem
   *  nenhuma conta extra). Devolve `null` se não há máscara ativa. */
  // [12/09/2026] CORRIGIDO — pedido verbatim: "Independente do nível de
  // zoom, ao segurar shift e clicar com o botão do meio do mouse e
  // arrastar, de modo que tudo todo o cenário vá em direção a parte de
  // cima da tela, acaba se revelando um retângulo preto ao fundo com
  // largura igual ao da imagem e quando se está marcado 'Trás'. Este preto
  // deve ser removido ou tornar-se transparente." CAUSA RAIZ: a versão
  // antiga fazia `topPx = Math.max(0, Math.min(h, Math.round(mask.rectPx.top
  // * dpr)))` ANTES de calcular a altura — quando o pan (lens-shift, ver
  // `Engine3D.setCamPanFrac`/`View3D._camViewPanOffset`) empurra o quadro
  // calibrado pra FORA da tela por cima (`mask.rectPx.top` fica NEGATIVO,
  // ex.: -435px), esse clamp "grudava" o topo em 0 — e a altura calculada
  // a partir daí (`Math.min(h - 0, height*dpr)`) dava sempre o MESMO
  // resultado errado, não importa o quanto o quadro continuasse subindo
  // (`top` cada vez mais negativo). O retângulo da MÁSCARA (onde o alfa é
  // zerado, revelando o "buraco" transparente) ficava assim CONGELADO numa
  // posição/altura fixa, enquanto o marcador magenta de verdade (pintado
  // por um plano 3D real, projetado pela `camera3.projectionMatrix" já com
  // o lens-shift aplicado — acompanha o pan livremente, sem nenhum teto)
  // continuava se movendo pra cima normalmente — o resultado era o
  // retângulo da foto e a área onde o alfa é zerado DESALINHADOS: pixels
  // do marcador ficavam sem máscara nenhuma em cima deles, revelando a
  // cor-marcadora sólida (o "retângulo preto"/escuro reportado) em vez do
  // "buraco" esperado. CORRIGIDO: em vez de fixar só o canto
  // esquerdo/superior e assumir que o TAMANHO original continua válido,
  // agora recorta (clip) as 2 BORDAS de cada eixo (esquerda E direita,
  // topo E fundo) contra os limites do render target — preservando a
  // INTERSEÇÃO de verdade entre o retângulo (que pode estar parcialmente
  // ou totalmente fora da tela) e a área visível, do mesmo jeito que
  // qualquer recorte 2D padrão (min/max nos 2 cantos, não só num). */
  _computeFotoCamMaskRawRect() {
    const w = this._rtPixelW, h = this._rtPixelH;
    const mask = this._fotoCamMask;
    if (w < 1 || h < 1 || !mask || !mask.rectPx || !mask.color) return null;
    const dpr = this._lastDpr || 1;
    const left0 = mask.rectPx.left * dpr;
    const top0 = mask.rectPx.top * dpr;
    const right0 = left0 + mask.rectPx.width * dpr;
    const bottom0 = top0 + mask.rectPx.height * dpr;
    // [12/09/2026 — RODADA "linha preta persiste"] MUDADO — pedido verbatim:
    // "Continua a linha preta do lado de cima e do lado esquerdo da imagem
    // (às vezes), quando está marcado 'Trás'. Verifique a medida em pixels
    // considerando a imagem já impressa ou faça o preto ficar transparente
    // para não aparecer." CAUSA RAIZ: mesmo já vindo de uma fonte única
    // (`_activeCamFrameRectPx`, corrigida na rodada anterior), `mask.rectPx`
    // ainda chega aqui em pixels de CSS fracionários (o `dpr` multiplica de
    // novo, reintroduzindo casas decimais) — antes, `Math.round()` em CADA
    // borda (esquerda/direita/topo/fundo) podia arredondar o lado
    // esquerdo/topo pra CIMA (ex.: 120.5 -> 121) e o direito/fundo pra BAIXO,
    // encolhendo o "buraco" em até ~1px do render target em relação à foto
    // JÁ IMPRESSA no canvas 2D por baixo (que ocupa o pixel de CSS inteiro,
    // sem arredondar) — sobrava uma faixa fina, sem foto por baixo
    // alinhada, mostrando a cor-marcadora crua (o "preto"/magenta
    // reportado) em vez do buraco. CORRIGIDO: arredonda pra FORA em vez de
    // pro mais próximo — esquerda/topo com `Math.floor`, direita/fundo com
    // `Math.ceil` — garantindo que o buraco SEMPRE cubra ao menos a área
    // exata da foto (nunca menos), no máximo crescendo ~1px pra dentro da
    // própria foto (imperceptível, mesma técnica de "sempre estourar um
    // pouco em vez de faltar" já aceita no projeto — ver tolerância de cor
    // logo abaixo).
    // [12/09/2026 — RODADA "ainda aparece em cima/esquerda"] NOVO — pedido
    // verbatim (com capturas de tela comparando 'Frente' x 'Trás' no zoom
    // out máximo): "Alinha preta aparece em cima e à esquerda, quando está
    // marcado 'Trás'." O `floor`/`ceil` acima já garante que o retângulo
    // (em pixels INTEIROS) cobre no mínimo a área exata da foto — mas o
    // plano 3D real do oclusor (`_ensureFotoCamBackdropPlane`) é rasterizado
    // pela GPU com antialiasing (MSAA): a borda GEOMÉTRICA dele cai numa
    // posição de sub-pixel (dada pela projeção 3D de verdade, não pelos
    // mesmos números arredondados usados aqui), deixando uma faixa de ~1px
    // de pixels MISTURADOS (cor-marcadora borrada com o céu/chão ao fundo)
    // ao redor da borda — pixels que não batem nem com o magenta puro nem
    // com a tolerância de cor (ver `MASK_COLOR_TOLERANCIA`, abaixo), então
    // nem o `floor`/`ceil` (que só arredonda o retângulo do LADO DE FORA)
    // nem a tolerância cobrem esse anel de mistura, sobrando a linha
    // escura/magenta reportada. CORRIGIDO: soma uma MARGEM extra de 1px
    // (raw, já em pixels do render target) pra DENTRO em todos os lados —
    // erra sempre pra mais (o buraco fica ligeiramente maior que a foto, o
    // suficiente pra engolir o anel de antialiasing), nunca pra menos,
    // seguindo o pedido explícito de preferir "tornar transparente" a
    // deixar a linha aparecer.
    // [12/09/2026 — RODADA "agora embaixo/laterais"] MUDADO — pedido
    // verbatim: "Resolveu em cima, porém, agora, é em baixo e, nas duas
    // laterais, do meio para baixo (as tiras pretas). Se for questão de
    // tamanho do buffer, verifique a largura e a altura da imagem
    // considerando ela já impressa no canvas após o redimensionar de
    // acordo com o nível de zoom, depois, define o buffer para não ter
    // problema com arredondamentos." CAUSA: a margem fixa de 1 pixel BRUTO
    // (`MARGEM_ANTIALIASING_PX`, rodada anterior) resolveu o topo por
    // coincidência, mas é medida em pixels do RENDER TARGET (já
    // multiplicados por `dpr`) — em telas com `dpr` fracionário/alto (ex.:
    // 1.25/1.5/2, comum no Windows, "já impressa" no canvas depois do
    // `_resize` — ver `_rtPixelW`/`_rtPixelH`), 1px BRUTO cobre MENOS que 1
    // pixel de CSS de verdade (`1/dpr` px de CSS), então o anel de
    // antialiasing (que se forma na resolução NATIVA da tela, ~1px de CSS
    // de largura) continuava maior que a margem em qualquer `dpr > 1` —
    // sobrando a tira, agora visível embaixo/nas laterais (a mesma conta
    // de antes, só que insuficiente nessas bordas também, mascarada antes
    // só porque o teste ocorreu por acaso num nível de zoom/posição onde a
    // folga sobrando ali era um pouco maior). CORRIGIDO: a margem agora
    // acompanha o `dpr` (`Math.ceil(dpr)` pixels BRUTOS — sempre o
    // suficiente pra cobrir pelo menos 1 pixel INTEIRO de CSS de largura,
    // não importa a densidade da tela/o zoom atual), garantindo a mesma
    // folga de segurança nos 4 lados em qualquer resolução.
    // [12/09/2026 — RODADA "diminua o retângulo preto"] MUDADO — pedido
    // verbatim: "Agora está sempre com 1 pixels de contorno: no lado
    // direito, no lado esquerdo e em baixo. [...] considere isso no
    // cálculo para diminuir esse retângulo preto." CAUSA: a rodada
    // anterior (`view3d.js`, `_fotoCamDrawnRectPx`) já corrigiu a causa
    // RAIZ do desalinhamento — `mask.rectPx` agora vem SEMPRE recortado
    // (clip) contra a área real do `<canvas>` da foto, então já não pode
    // mais ser MAIOR que a foto de verdade. A margem extra somada AQUI
    // (`MARGEM_ANTIALIASING_PX`, pensada pra engolir antialiasing da GPU
    // antes daquela correção existir) agora só faz o buraco crescer pra
    // ALÉM da área real da foto de propósito — sobrando exatamente 1px de
    // contorno (`Math.ceil(dpr)` com `dpr=1` dá 1) nos lados onde a foto
    // já termina, revelando o fundo escuro do visualizador atrás dela.
    // CORRIGIDO: removida — o `floor`/`ceil` abaixo (arredondar as 2
    // BORDAS de cada eixo pra FORA) já é o suficiente e MATEMATICAMENTE
    // comprovado (testado ao vivo/Playwright, rodada anterior) pra nunca
    // deixar o buraco menor que a foto, sem mais precisar estourar pra
    // fora dela.
    const left = Math.max(0, Math.min(w, Math.floor(left0)));
    const right = Math.max(0, Math.min(w, Math.ceil(right0)));
    const top = Math.max(0, Math.min(h, Math.floor(top0)));
    const bottom = Math.max(0, Math.min(h, Math.ceil(bottom0)));
    const maskWPx = Math.max(0, right - left);
    const maskHPx = Math.max(0, bottom - top);
    if (maskWPx <= 0 || maskHPx <= 0) return null;
    const maskRawTopPx = h - bottom;
    return { maskLeftPx: left, maskRawTopPx, maskWPx, maskHPx, w, h };
  }

  _presentToCanvas() {
    const w = this._rtPixelW, h = this._rtPixelH;
    if (w < 1 || h < 1) return;
    Engine3D._sharedRenderer.readRenderTargetPixels(this.renderTarget, 0, 0, w, h, this._rtPixelBuffer);
    const mask = this._fotoCamMask;
    let maskLeftPx = 0, maskRawTopPx = 0, maskWPx = 0, maskHPx = 0, hasMask = false;
    if (mask && mask.rectPx && mask.color) {
      const buf = this._rtPixelBuffer;
      const [mr, mg, mb] = mask.color;
      // [12/09/2026] Converte o retângulo (em pixels de CSS, mesma
      // convenção de `_activeCamFrameRectPx`/`_fotoCamPhotoCanvasRectPx` —
      // origem no topo-esquerda, Y crescendo pra baixo) pra pixels do
      // RENDER TARGET (`w×h` = tamanho CSS × `dpr`, ver `_resize`) — E pra
      // convenção de LINHA do próprio `this._rtPixelBuffer` (origem
      // embaixo-à-esquerda, OpenGL — mesma inversão feita mais abaixo pro
      // `drawImage`, ver comentário grande da função): a linha visual
      // `vy` (0=topo) corresponde à linha CRUA `ry = h-1-vy` — um
      // retângulo visual `[top, top+height)` vira `[h-top-height, h-top)`
      // na numeração crua. [13/09/2026] Conta agora vem de
      // `_computeFotoCamMaskRawRect` (fonte única, ver comentário lá).
      const rawRect = this._computeFotoCamMaskRawRect();
      if (rawRect) { ({ maskLeftPx, maskRawTopPx, maskWPx, maskHPx } = rawRect); }
      else { maskWPx = 0; maskHPx = 0; }
      // [13/09/2026] NOVO — pedido verbatim: "Dê um jeito de os vidros das
      // janelas continuarem a ser impressos [...] Faça de um jeito que não
      // volte a ficar aquele rosa choque". O vidro (`_buildGlassPane`)
      // voltou a pintar sempre (ver comentário lá) — mas ele é
      // `transparent:true`, desenhado DEPOIS da fila opaca, e faz
      // alpha-blend da sua textura (quase toda transparente, só uma borda/
      // listra de brilho com alfa baixo) com a cor-marcadora já presente.
      // Isso desloca o pixel resultante um pouco pra longe do magenta puro
      // — a igualdade EXATA de antes nunca mais bate ali, deixando o pixel
      // "preso" opaco (rosa). CORRIGIDO: em vez de exigir igualdade exata,
      // aceita uma TOLERÂNCIA (distância Manhattan nos 3 canais) — cobre o
      // caso comum de um blend de baixo alfa (a maior parte do vidro,
      // quase 100% transparente, continua batendo EXATO — alfa~0 no
      // `source-over` não muda nada; só a borda/listra com alfa perceptível
      // se desvia o suficiente pra precisar da tolerância). Só usada DENTRO
      // do retângulo do quadro (nunca a tela toda), e a cor-marcadora
      // (magenta puro) já é deliberadamente reservada/improvável na cena
      // real (ver `_FOTOCAM_BACKDROP_MASK_COLOR`) — a tolerância aumenta
      // um pouco esse risco de colisão (armadilha #7 do progresso do
      // projeto), aceito como troca consciente pra resolver o rosa sem
      // apagar o vidro.
      const MASK_COLOR_TOLERANCIA = 90;
      // [12/09/2026 — RODADA "torne o preto transparente"] NOVO — pedido
      // verbatim: "Você pode tornar o preto transparente, se isso não
      // impedir que o 'Trás' funcione. Deste modo o problema é resolvido
      // de algum jeito." Mesmo com o retângulo já matematicamente correto
      // (ver teste ao vivo/Playwright da rodada anterior — o "buraco"
      // sempre cobre a foto inteira, em qualquer zoom/DPR testado), pode
      // sobrar uma linha fina ESCURA bem na borda por causa de
      // antialiasing da GPU do usuário (variável por placa/driver, fora do
      // alcance de qualquer conta de retângulo) — a tolerância de cor
      // acima só cobre proximidade do MAGENTA (`mask.color`), não do
      // preto. CORRIGIDO: dentro de uma FAIXA fina (`BORDA_PRETO_PX`) bem
      // na borda externa do retângulo da máscara (onde a foto acaba e o
      // "resto do cenário" começa — exatamente onde esse tipo de artefato
      // de antialiasing se forma), qualquer pixel quase-preto TAMBÉM tem o
      // alfa zerado (fica transparente, revelando a foto/o ambiente real
      // por baixo, nunca pintando preto). Deliberadamente restrito a essa
      // faixa estreita (não ao retângulo INTEIRO): objetos 3D reais e
      // ESCUROS que devem continuar ocluindo a foto (o propósito central
      // de 'Trás') ficam no MEIO do retângulo, longe da borda, então
      // continuam opacos/ocluindo normalmente — só a fina moldura externa
      // ganha essa rede de segurança extra.
      const BORDA_PRETO_PX = Math.max(2, Math.ceil((this._lastDpr || 1) * 2));
      const LIMIAR_PRETO = 40;
      if (maskWPx > 0 && maskHPx > 0) {
        hasMask = true;
        for (let ry = maskRawTopPx; ry < maskRawTopPx + maskHPx; ry++) {
          const localRy = ry - maskRawTopPx;
          const pertoBordaV = localRy < BORDA_PRETO_PX || localRy >= maskHPx - BORDA_PRETO_PX;
          let idx = (ry * w + maskLeftPx) * 4;
          for (let rx = 0; rx < maskWPx; rx++, idx += 4) {
            const dr = Math.abs(buf[idx] - mr), dg = Math.abs(buf[idx + 1] - mg), db = Math.abs(buf[idx + 2] - mb);
            if (dr + dg + db <= MASK_COLOR_TOLERANCIA) { buf[idx + 3] = 0; continue; }
            const pertoBorda = pertoBordaV || rx < BORDA_PRETO_PX || rx >= maskWPx - BORDA_PRETO_PX;
            if (pertoBorda && buf[idx] <= LIMIAR_PRETO && buf[idx + 1] <= LIMIAR_PRETO && buf[idx + 2] <= LIMIAR_PRETO) {
              buf[idx + 3] = 0;
            }
          }
        }
      }
    }
    const imgData = new ImageData(new Uint8ClampedArray(this._rtPixelBuffer.buffer, this._rtPixelBuffer.byteOffset, this._rtPixelBuffer.length), w, h);
    this._rtOffCtx.putImageData(imgData, 0, 0);
    // Sem `clearRect` antes do `drawImage`, EXCETO no retângulo da máscara
    // (ver comentário grande acima): fora dela a imagem cobre o canvas
    // INTEIRO com alfa=1 sempre, então já sobrescreve 100% do conteúdo
    // anterior sozinha — um `clearRect` ali exigiria contas extras por
    // causa da transformação Y invertida abaixo sem trazer nenhum
    // benefício real.
    const ctx = this._displayCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, -1, 0, h);
    if (hasMask) ctx.clearRect(maskLeftPx, maskRawTopPx, maskWPx, maskHPx);
    ctx.drawImage(this._rtOffscreen, 0, 0);
    // [13/09/2026] NOVO — pedido verbatim: "A transparência do vidro ainda
    // está rosa, use um buffer a parte [...] Renderize o vidro em um
    // buffer a parte e depois imprima-o ali para que não fique rosa e sim
    // 'normal'." Ver `_renderGlassOnlyPass`/`_presentFrame` pra como este
    // buffer é preenchido (vidro renderizado SOZINHO, num render target
    // à parte, nunca vendo o marcador magenta). Aqui só COMPÕE o
    // resultado por cima da imagem já finalizada acima — mesmo
    // `putImageData`+`drawImage` (canvas auxiliar `_rtOffscreen`
    // reaproveitado) com o alfa de VERDADE do vidro (a maior parte do
    // buffer é 100% transparente — só o vidro tem pixel — `scene.background`
    // foi desligado durante aquele passe justamente pra garantir isso), o
    // navegador faz o alpha-blend NORMAL (`source-over`) sozinho — sem
    // marcador nenhum envolvido, sem risco nenhum de ficar rosa.
    if (this._glassPassActive) {
      const glassImgData = new ImageData(new Uint8ClampedArray(this._glassPixelBuffer.buffer, this._glassPixelBuffer.byteOffset, this._glassPixelBuffer.length), w, h);
      this._rtOffCtx.putImageData(glassImgData, 0, 0);
      ctx.drawImage(this._rtOffscreen, 0, 0);
    }
    // [22/09/2026] NOVO — ver comentário grande em `_renderBackdropEnvPass`
    // (arquitetura completa) — compõe o ambiente real (chão/neblina, sem o
    // oclusor/máscara do 'Trás') por CIMA do resultado já finalizado
    // acima (foto + objetos reais, intocados — a foto continua atrás de
    // qualquer objeto real mais perto, exatamente como sempre), mas só
    // DENTRO do retângulo da foto (`ctx.clip`, mesmo retângulo `hasMask`
    // já calculado acima) e com alfa proporcional a `(1 - opacidade)`:
    // opacidade=1 não muda nada (nunca entra aqui — `usarPasseAmbiente`
    // em `_presentFrame` já filtra isso); opacidade=0 revela o ambiente
    // real por completo; opacidades intermediárias misturam os dois —
    // exatamente o pedido ("ao colocar a opacidade = 0 [...] como ver
    // através de uma janela").
    if (this._backdropEnvPassActive && hasMask) {
      const opacidadeMistura = this._fotoCamMask?.opacity != null ? this._fotoCamMask.opacity : 1;
      const envImgData = new ImageData(new Uint8ClampedArray(this._backdropEnvPixelBuffer.buffer, this._backdropEnvPixelBuffer.byteOffset, this._backdropEnvPixelBuffer.length), w, h);
      this._rtOffCtx.putImageData(envImgData, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(maskLeftPx, maskRawTopPx, maskWPx, maskHPx);
      ctx.clip();
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 - opacidadeMistura));
      ctx.drawImage(this._rtOffscreen, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  /** [12/09/2026] NOVO — ver comentário grande em `_presentToCanvas`, acima,
   *  pro motivo completo. `rectPx` — `{left,top,width,height}` em pixels de
   *  CSS (mesma convenção de `View3D._activeCamFrameRectPx`/
   *  `_fotoCamPhotoCanvasRectPx`). `color` — `[r,g,b]` (0-255) da cor-
   *  marcadora sólida usada pelo material do oclusor
   *  (`View3D._ensureFotoCamBackdropPlane`) — precisa bater EXATAMENTE
   *  (mesmos números) com a cor do material, senão a máscara nunca
   *  encontra pixel nenhum pra apagar. Chamado todo quadro, só quando
   *  'Trás' está realmente ativo (ver `View3D._loop`/`Modeler3D._renderFrame`) —
   *  `clearFotoCamBackdropMask()` desliga (nenhum pixel é tocado). */
  // [22/09/2026] NOVO — `opacity` (0-1, `View3D._getFotoCamOpacidade()`)
  // ganhou um 3º parâmetro opcional aqui — ver comentário grande em
  // `_initThree` (`_backdropEnvRenderTarget`) pro motivo completo: usado
  // por `_renderBackdropEnvPass`/`_presentToCanvas` pra saber o quanto
  // misturar o ambiente real (chão/neblina) por cima do resultado de
  // sempre, sem tocar em NADA da máscara/oclusão binária já existente
  // (que continua sempre ativa, em qualquer opacidade — ver
  // `View3D._loop`). Default 1 (comportamento de sempre — sem mistura
  // nenhuma) quando quem chama não passa nada.
  setFotoCamBackdropMask(rectPx, color, opacity) {
    this._fotoCamMask = rectPx && color ? { rectPx, color, opacity: opacity != null ? opacity : 1 } : null;
  }

  clearFotoCamBackdropMask() {
    this._fotoCamMask = null;
  }

  // [22/09/2026] NOVO — ver comentário grande em `_initThree`
  // (`_backdropEnvRenderTarget`): `_renderBackdropEnvPass` precisa saber
  // qual malha é o oclusor invisível do 'Trás' (`View3D._ensureFotoCamBackdropPlane`)
  // pra escondê-la SÓ durante o passe de ambiente (sem afetar o passe
  // principal) — chamado uma vez por `View3D` logo depois de criar a
  // malha (ela nunca é recriada depois, então basta guardar a referência
  // 1x; chamadas seguintes só re-confirmam a mesma referência, inofensivo).
  registerFotoCamBackdropOcclusor(mesh) {
    this._fotoCamBackdropOcclusorMesh = mesh || null;
  }

  /** [22/09/2026] NOVO — ver comentário grande em `_initThree`
   *  (`_backdropEnvRenderTarget`) pro pedido/arquitetura completa. Chamado
   *  por `_presentFrame`, DEPOIS do passe principal (+ vidro, se houver) —
   *  só quando o backdrop 'Trás' está ativo E a opacidade < 1 (custo zero
   *  no caso comum, MESMO espírito de `_renderGlassOnlyPass`: só paga o
   *  passe extra quando o resultado dele de fato vai aparecer). Esconde o
   *  oclusor (nunca aparece de verdade — só existe pra bloquear o
   *  ambiente farther que a foto no passe PRINCIPAL) e desliga a máscara
   *  do chão (`_fotoCamBackdropMaskAtiva`) — as DUAS coisas que impedem o
   *  ambiente real de ser desenhado normalmente — renderiza a cena
   *  INTEIRA de novo (independente, profundidade própria — objetos reais
   *  mais perto continuam ocluindo o chão/paredes aqui dentro por conta
   *  própria, sem precisar de nada compartilhado com o passe principal) e
   *  lê de volta pra `_backdropEnvPixelBuffer`. Restaura tudo ao sair —
   *  próximo quadro, `_updateFloorMaskUniform` (chamado ANTES do passe
   *  PRINCIPAL, no início de `_presentFrame`) já recalcula do zero mesmo
   *  assim, mas restaurar aqui evita qualquer leitura acidental do estado
   *  "desligado" por outro código entre um quadro e outro. */
  _renderBackdropEnvPass() {
    const occlusor = this._fotoCamBackdropOcclusorMesh;
    const savedOcclusorVisible = occlusor ? occlusor.visible : null;
    if (occlusor) occlusor.visible = false;
    const savedMaskAtiva = this._fotoCamBackdropMaskAtiva;
    this._fotoCamBackdropMaskAtiva = false;
    this._updateFloorMaskUniform();
    this.renderer.setRenderTarget(this._backdropEnvRenderTarget);
    this.renderer.setViewport(0, 0, this._rtPixelW, this._rtPixelH);
    this.renderer.render(this.scene, this.camera3);
    Engine3D._sharedRenderer.readRenderTargetPixels(this._backdropEnvRenderTarget, 0, 0, this._rtPixelW, this._rtPixelH, this._backdropEnvPixelBuffer);
    if (occlusor) occlusor.visible = savedOcclusorVisible;
    this._fotoCamBackdropMaskAtiva = savedMaskAtiva;
    this._updateFloorMaskUniform();
    this._backdropEnvPassActive = true;
  }

  /** NOVO (08/09/2026), pedido verbatim (ITENS 5 e 6 da rodada de 11
   *  itens — reinvestigação do zero do bug "cenário preto"/"cenário
   *  congelado" no Modelador 3D, depois que a correção da rodada anterior
   *  (try/catch/finally em `Modeler3D._renderLoop`, ver modeler-core.js)
   *  se mostrou insuficiente/sintoma diferente do relatado).
   *
   *  CAUSA RAIZ ENCONTRADA (análise estática de código — sem navegador
   *  real disponível nesta sessão pra confirmar interativamente,
   *  restrição já conhecida do projeto): desde a arquitetura "MODO EYE"
   *  (07/09/2026, ver comentário grande no construtor desta classe, "Todos
   *  os 3 pontos do app que criam Engine3D usam `{ eye: true }` agora [...]
   *  Não existe mais nenhum caminho 'não-eye' ativo no app"), o
   *  `<canvas>` visível de CADA instância (incluindo `view3d.js`, cuja
   *  engine é REAPROVEITADA pelo Modelador — ver `state.canvas`/
   *  `state.scene`/`state.camera` em `modeler-core.js enter()`) deixou de
   *  ser um canvas WebGL de verdade: virou um `<canvas>` com contexto 2D
   *  puro (`this._displayCtx`), e o resultado do render só chega nele
   *  através de `_presentToCanvas()` (lê o `WebGLRenderTarget` PRÓPRIO
   *  desta instância de volta pra CPU e desenha com `drawImage` — ver
   *  comentário grande lá) — chamado só a partir DAQUI (`render(camera)`,
   *  dentro do bloco `if (this._eye) { [...] this._presentToCanvas(); }`).
   *
   *  `Modeler3D._renderFrame` (modeler-core.js), porém, NUNCA chamava
   *  `render(camera)` — chamava `renderer.render(state.scene, state.camera)`
   *  DIRETO (só com `_resize()` antes, ver comentário histórico que ainda
   *  fica logo abaixo desta função). Isso desenha no `WebGLRenderTarget`
   *  que estiver setado no `Engine3D._sharedRenderer` NAQUELE instante
   *  (compartilhado entre TODAS as instâncias — Ver em 3D, miniatura do
   *  Mapa, prévia de Modelos3D — todas renderizam SEQUENCIALMENTE, nunca
   *  em paralelo de verdade) — nunca no `<canvas>` 2D visível de verdade,
   *  já que `_presentToCanvas()` (o ÚNICO código que sabe copiar o
   *  render target pro canvas 2D) nunca era chamado por esse caminho.
   *  Ou seja: o Modelador desenhava "no vazio" — o `<canvas>` visível
   *  simplesmente parava de ser atualizado a partir do instante em que
   *  `Modeler3D.enter()` rodava, ficando "preso" no último quadro
   *  desenhado pelo `View3D._loop` normal (pausado durante o Modelador —
   *  ver guarda `Modeler3D.isActive()` em view3d.js) — exatamente o
   *  sintoma "cenário atrás fica [...] como se [...] um 'screenshot' [...]
   *  fica sendo exibido 'atrás', imóvel" relatado. `_resize()` (chamado
   *  todo quadro pelo Modelador) reatribui `this.canvas.width/height`
   *  no ramo `_eye` (linha ~4950 acima) — o que LIMPA o bitmap do canvas
   *  instantaneamente — explicando por que redimensionar a divisão
   *  enquanto o Modelador está ativo deixa a tela TOTALMENTE preta (o
   *  último quadro "congelado" é apagado pelo resize, e nada volta a
   *  desenhar por cima, já que o caminho que desenharia —
   *  `_presentToCanvas()` — nunca era chamado).
   *
   *  Isso também explica a ASSIMETRIA relatada entre Modo Objeto ("o
   *  objeto não aparece, o cenário também fica congelado") e Modo Edição
   *  ("aparece e funciona, mas o cenário [...] fica todo congelado"):
   *  o overlay 2D do Modelador (`ModelerRender.drawFrame`, um `<canvas>`
   *  2D TOTALMENTE SEPARADO, transparente, por cima do canvas WebGL/2D
   *  principal — ver comentário no topo de modeler-render.js) desenha
   *  vértices/arestas/faces/contorno de seleção só em Modo Edição (e o
   *  contorno dourado do objeto selecionado, sempre) — esse overlay
   *  SEMPRE funcionou (é Canvas2D puro, desenhado diretamente por JS,
   *  nunca dependeu do `renderer.render()` quebrado) e por isso dava a
   *  falsa impressão de "o objeto aparece e a interação funciona" em
   *  Modo Edição — só o CENÁRIO DE FUNDO (e a malha SÓLIDA do objeto,
   *  ambos desenhados só pelo WebGL, nunca pelo overlay 2D) é que nunca
   *  chegava na tela, em NENHUM dos 2 modos.
   *
   *  CORRIGIDO extraindo o trecho "resize + desenha no render target +
   *  devolve o renderer neutro + copia pro canvas visível" (que já
   *  existia aqui dentro, linhas logo abaixo) pra um método PRÓPRIO
   *  reutilizável, `_presentFrame()` — chamado tanto por `render(camera)`
   *  (fluxo normal, depois de posicionar `camera3` a partir do objeto
   *  `camera` no formato {x,y,z,yaw,pitch} do app) quanto DIRETO por
   *  `Modeler3D._renderFrame` (modeler-core.js), que já posiciona
   *  `camera3` (== `state.camera`) sozinho via `_updateOrbitCamera`/
   *  `_updateFreeCamera` ANTES de chamar isto — não faz sentido (nem seria
   *  correto: `camera` ali é um `THREE.Camera` de verdade, não o objeto
   *  {x,y,z,yaw,pitch} que `render(camera)` espera) reconstruir a pose a
   *  partir de um objeto que este método completo não tem. `_presentFrame`
   *  deliberadamente NÃO inclui o resto do trabalho de `render(camera)`
   *  (atualização de céu/LOD/culling por distância/oclusão de selo/
   *  destaque de mira) — mesmo espírito "leve" que o Modelador já tinha
   *  antes (ver comentário histórico abaixo, "`_resize()` sozinho [...]
   *  já resolve, e é barato"), nada disso é relevante durante uma sessão
   *  do Modelador.
   *
   *  HONESTIDADE (convenção já estabelecida neste projeto): esta é uma
   *  correção por ANÁLISE ESTÁTICA de código, sem navegador real
   *  disponível nesta sessão pra confirmar visualmente — a cadeia de
   *  causa/efeito (renderer.render() direto nunca alcançava o canvas
   *  visível no modo "eye") está bem fundamentada no próprio código-fonte
   *  (comentário do construtor + `_presentToCanvas`/`render()` originais),
   *  mas AINDA PRECISA de confirmação visual (abrir o Modelador, trocar
   *  Modo Objeto/Edição, redimensionar a divisão) antes de considerar o
   *  bug 100% fechado. */
  _presentFrame() {
    if (!this._ready) return;
    this._resize();
    // [13/09/2026] NOVO — ver comentário grande em `_updateFloorMaskUniform`:
    // precisa rodar ANTES de `renderer.render()` (a chamada de verdade,
    // logo abaixo), senão o shader do chão desenharia este quadro com o
    // retângulo/estado do quadro ANTERIOR (1 quadro atrasado).
    this._updateFloorMaskUniform();
    if (this._eye) {
      // [13/09/2026] NOVO — ver comentário grande em `_renderGlassOnlyPass`
      // pra arquitetura completa: só entra no passe extra do vidro quando
      // 'Trás' está de verdade ativo E existe vidro na cena (custo zero
      // no caso comum — 'Frente'/sem câmera/sem janela nenhuma — que
      // continua exatamente como antes, um render só).
      const meshesVidro = this._glassMeshesAtivos;
      const usarPasseVidro = this._fotoCamBackdropMaskAtiva && !!(meshesVidro && meshesVidro.length);
      let visibilidadeOriginalVidro = null;
      if (usarPasseVidro) {
        // esconde o vidro do passe PRINCIPAL — ele nunca mais participa
        // deste render, então nunca mais pode misturar com o marcador
        // magenta do oclusor 'Trás' (ver `_ensureFotoCamBackdropPlane`,
        // view3d.js).
        visibilidadeOriginalVidro = meshesVidro.map((m) => m.visible);
        meshesVidro.forEach((m) => { m.visible = false; });
      }
      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.setViewport(0, 0, this._rtPixelW, this._rtPixelH);
      this.renderer.render(this.scene, this.camera3);
      if (usarPasseVidro) {
        // devolve a visibilidade REAL de cada vidro antes do passe
        // isolado — `_renderGlassOnlyPass` decide sozinho quem fica
        // visível ali (só o vidro, mas respeitando o `visible` de
        // verdade de cada um — um vidro que o usuário/código escondeu
        // por outro motivo continua escondido também no passe isolado).
        meshesVidro.forEach((m, i) => { m.visible = visibilidadeOriginalVidro[i]; });
        this._renderGlassOnlyPass(meshesVidro);
      } else {
        this._glassPassActive = false;
      }
      // [22/09/2026] NOVO — ver comentário grande em `_renderBackdropEnvPass`
      // pro pedido/arquitetura completa: 3º passe (independente do vidro),
      // só quando o backdrop 'Trás' está de fato ativo E a opacidade < 1
      // (custo zero no caso comum — opacidade=1, sem 'Trás', ou nenhuma
      // câmera aberta — que continua exatamente como sempre).
      const opacidadeMask = this._fotoCamMask?.opacity;
      const usarPasseAmbiente = this._fotoCamBackdropMaskAtiva && opacidadeMask != null && opacidadeMask < 1;
      if (usarPasseAmbiente) {
        this._renderBackdropEnvPass();
      } else {
        this._backdropEnvPassActive = false;
      }
      this.renderer.setRenderTarget(null);
      this._presentToCanvas();
      return;
    }
    this.renderer.render(this.scene, this.camera3);
  }

  /** [13/09/2026] NOVO — pedido verbatim: "A transparência do vidro ainda
   *  está rosa, use um buffer a parte, se for ajudar a resolver isso.
   *  Renderize o vidro em um buffer a parte e depois imprima-o ali para
   *  que não fique rosa e sim 'normal'." CAUSA RAIZ do rosa (ver rodada
   *  anterior, tentativa de tolerância de cor — não bastou): o vidro
   *  (`transparent:true`) sempre desenha DEPOIS de toda a fila opaca — se
   *  o marcador magenta do backdrop 'Trás' já estiver no framebuffer
   *  naquele pixel, o vidro faz alpha-blend com ELE, e o resultado nunca
   *  mais bate exato (nem "tolerante") com a cor reservada.
   *  CORRIGIDO DE VERDADE (arquitetura de 2 passes, sugestão do próprio
   *  usuário): o vidro é escondido do passe PRINCIPAL (`_presentFrame`,
   *  acima — nunca mais "vê" o marcador) e renderizado light AQUI,
   *  SOZINHO (tudo o mais escondido, `scene.background` desligado pra
   *  garantir alfa=0 de verdade fora do vidro), num 2º
   *  `THREE.WebGLRenderTarget` (`this._glassRenderTarget`) TRANSPARENTE.
   *  Pra continuar sendo ocluído corretamente por paredes/objetos reais
   *  na frente (senão o vidro "vazaria" através deles), este passe
   *  reaproveita a MESMA textura de profundidade do passe principal
   *  (`this._glassDepthTexture`, compartilhada entre os 2 render targets —
   *  ver `_initThree`) — `autoClearDepth=false` preserva os valores já
   *  escritos pelo passe principal (paredes/chão/objetos, SEM o vidro,
   *  que estava escondido) em vez de limpar pra "infinito"; só a COR é
   *  limpa (`clear(true,false,false)`), com alfa 0. O resultado
   *  (`this._glassPixelBuffer`) é composto por cima da imagem final em
   *  `_presentToCanvas` — o vidro nunca mais toca o marcador, então nunca
   *  mais fica rosa, e continua sendo ocluído certo por objetos reais. */
  _renderGlassOnlyPass(meshesVidro) {
    const THREE = this.THREE;
    // [13/09/2026] `keep` inclui o vidro E todos os ANCESTRAIS dele (o
    // grupo da porta/janela que o contém, etc.) — o Three.js pula a
    // renderização de QUALQUER descendente cujo ancestral esteja
    // `visible=false` (diferente de `traverse()`, que sempre visita a
    // árvore inteira independente disso); sem incluir os ancestrais aqui,
    // o vidro ficaria com `visible=true` mas ainda assim invisível de
    // verdade, escondido pelo grupo-pai (não-vidro) que teria sido
    // desligado junto com o resto da cena logo abaixo.
    const keep = new Set();
    meshesVidro.forEach((m) => { for (let n = m; n; n = n.parent) keep.add(n); });
    const savedVisibility = [];
    this.scene.traverse((obj) => {
      if (obj === this.scene) return;
      savedVisibility.push([obj, obj.visible]);
      obj.visible = keep.has(obj);
    });
    const savedBackground = this.scene.background;
    this.scene.background = null;
    const prevClearColor = new THREE.Color();
    this.renderer.getClearColor(prevClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();
    const prevAutoClearDepth = this.renderer.autoClearDepth;
    this.renderer.setRenderTarget(this._glassRenderTarget);
    this.renderer.setViewport(0, 0, this._rtPixelW, this._rtPixelH);
    this.renderer.setClearColor(0x000000, 0);
    // preserva a profundidade já escrita pelo passe principal (SEM o
    // vidro) — é contra ELA que o vidro precisa ser testado, pra
    // continuar corretamente ocluído atrás de paredes/objetos reais.
    this.renderer.autoClearDepth = false;
    this.renderer.clear(true, false, false);
    this.renderer.render(this.scene, this.camera3);
    this.renderer.autoClearDepth = prevAutoClearDepth;
    this.renderer.setClearColor(prevClearColor, prevClearAlpha);
    Engine3D._sharedRenderer.readRenderTargetPixels(this._glassRenderTarget, 0, 0, this._rtPixelW, this._rtPixelH, this._glassPixelBuffer);
    this.scene.background = savedBackground;
    savedVisibility.forEach(([obj, v]) => { obj.visible = v; });
    // [12/09/2026] NOVO — pedido verbatim: "Você aplicou um outro jeito de
    // renderizar o vidro, acaba ficando acinzentado, tente fazer com que
    // fique esbranquiçado para que se assemelhe mais ao modo 'normal'."
    // CAUSA RAIZ: o WebGL escreve nesse render target com blending "over"
    // padrão sobre um fundo (0,0,0,0) — para um pixel parcialmente
    // transparente do vidro, o valor de COR que fica gravado no buffer já
    // sai "pré-multiplicado" (proporcional ao alfa, ex.: um branco a 40% de
    // alfa grava um RGB ~40% da intensidade, não 100%). `ImageData`/
    // `putImageData`+`drawImage` (usados em `_presentToCanvas` pra compor
    // este buffer por cima da imagem final) tratam RGBA como alfa RETO
    // (não-pré-multiplicado) — o `drawImage` aplica a mistura "over" de
    // novo, multiplicando pelo alfa UMA SEGUNDA VEZ, escurecendo/
    // acinzentando o resultado (um brilho branco vira cinza baço em vez de
    // continuar branco). CORRIGIDO: reverte a pré-multiplicação aqui
    // (`rgb = rgb * 255 / alfa`, só quando `0 < alfa < 255` — em alfa=0 não
    // há cor visível pra corrigir, em alfa=255 a conta não muda nada) antes
    // de `_presentToCanvas` compor o buffer, restaurando a cor "reta" que o
    // `drawImage` espera.
    const buf = this._glassPixelBuffer;
    for (let i = 0; i < buf.length; i += 4) {
      const a = buf[i + 3];
      if (a > 0 && a < 255) {
        const f = 255 / a;
        buf[i] = Math.min(255, Math.round(buf[i] * f));
        buf[i + 1] = Math.min(255, Math.round(buf[i + 1] * f));
        buf[i + 2] = Math.min(255, Math.round(buf[i + 2] * f));
      }
    }
    this._glassPassActive = true;
  }

  render(camera) {
    if (!this._ready) return; // Three.js ainda carregando (só na primeiríssima vez que o 3D é aberto) — pula o quadro
    // NOVO (01/09/2026), item "Sol e Lua": mantém céu/luzes/posição dos dois
    // astros acompanhando o relógio real numa sessão 3D longa (antes a
    // paleta de céu só era calculada 1x, ao abrir a tela — ver comentário
    // grande em _updateSky). ~30s de intervalo: perceptível ao longo de uma
    // sessão, sem custo nenhum por quadro (só uma subtração+comparação de
    // números na maioria dos quadros).
    if (performance.now() - (this._lastSkyUpdateAt || 0) > 30000) this._updateSky();
    this._resize();
    const dir = cameraForward(camera);
    this.camera3.position.set(camera.x, camera.y, camera.z);
    // lookAt() usa o vetor de direção já calculado pela MESMA função usada
    // pro movimento/mira (cameraForward) — sempre aponta certo, sem precisar
    // reconciliar manualmente a convenção de sinal de yaw/pitch do motor
    // antigo com a do Three.js.
    this.camera3.lookAt(camera.x + dir.x, camera.y + dir.y, camera.z + dir.z);
    // Bug relatado pelo usuário: o contorno pontilhado ("outline2d", ver
    // _drawOutline2D) parecia atrasado em relação ao resto da cena — um
    // delay só perceptível com FPS baixo. Causa: `_updateHoverHighlight`
    // (chamada logo abaixo) projeta pontos do mundo pra tela via
    // `Vector3.project(camera3)`, que usa `camera3.matrixWorldInverse` —
    // essa matriz só é recalculada de verdade dentro de
    // `camera3.updateMatrixWorld()`, que o Three.js chama sozinho DENTRO de
    // `renderer.render()` (mais abaixo). Ou seja: `_updateHoverHighlight`
    // rodava ANTES disso, projetando com a posição/mira da câmera do
    // QUADRO ANTERIOR (um quadro inteiro desatualizada) — com FPS alto a
    // câmera mal se move de um quadro pro outro (erro imperceptível); com
    // FPS baixo o salto entre quadros é maior, e o contorno "atrasa"
    // visivelmente atrás do fundo já desenhado com a câmera nova. Forçando
    // o recálculo AQUI (mesma posição/mira já aplicadas duas linhas acima)
    // antes de projetar, o contorno usa a câmera deste MESMO quadro — igual
    // ao que renderer.render() está prestes a desenhar por baixo dele.
    this.camera3.updateMatrixWorld(true);
    // Pedido do usuário (28/08/2026): "Ao entrar no modo de modelar o
    // objeto, o contorno tracejado de destaque, que é aplicado quando se
    // está fora desse modo, ainda fica ativo (não deveria ser assim)."
    // Causa: `render()` continua sendo chamado a cada quadro pelo PRÓPRIO
    // Modelador (reaproveita esta mesma engine/cena/câmera — ver
    // js/modeler/modeler-core.js), mas os listeners de mouse do View3D
    // "de fora" (os que atualizariam `this._mouse`/o hover de verdade) ficam
    // desligados enquanto o Modelador está ativo — então `hoverPick()`
    // (chamado por `_updateHoverHighlight` logo abaixo) ficava raycastando
    // pra sempre a partir da ÚLTIMA posição do mouse de ANTES de entrar no
    // Modelador, "travado" destacando o objeto de antes. Corrigido: pula o
    // destaque de mira inteiro enquanto o Modelador está ativo (ele tem o
    // seu PRÓPRIO sistema de destaque de seleção, ver modeler-render.js).
    // [16/09/2026 UTC] NOVO — pedido verbatim do usuário (Trena 3D, seção
    // nova de ⚙️ Configurações 3D): "deixar de fazer o destaque feito pelo
    // raycaster (onde ele bate) enquanto está ativa a linha perpendicular
    // (consequência de ter segurado o ctrl antes). Por padrão ativa."
    // `this._suppressHoverHighlight` é setado por `view3d.js` (ver
    // `setHoverHighlightSuppressed` logo abaixo) sempre que a âncora da
    // Trena 3D estiver ativa (Ctrl segurado ou já commitada) E a opção
    // `trena3DSuprimirDestaqueDuranteAncora` estiver ligada (padrão) — o
    // destaque normal (contorno pontilhado no chão/parede/objeto sob a
    // mira) não faz muito sentido nesse momento, já que a mira está sendo
    // usada pra escolher uma ALTURA na reta vertical, não pra selecionar
    // algo de verdade. `clearHoverHighlight()` garante que nenhum destaque
    // "congelado" do quadro anterior fique preso na tela (mesmo motivo já
    // documentado acima pro Modelador 3D).
    if (!window.Modeler3D?.isActive?.() && !this._suppressHoverHighlight) this._updateHoverHighlight(camera);
    else if (this._suppressHoverHighlight) this.clearHoverHighlight();
    // NOVO (01/09/2026), item GRANDE #5, decisão do usuário (AskUserQuestion):
    // "Automático por distância" — precisa ser chamado todo quadro (API do
    // próprio THREE.LOD: `.update(camera)` decide qual nível fica visível
    // comparando a distância até a câmera; sem chamar isto, o LOD nunca troca
    // de nível sozinho). `this.camera3` já está na posição/mira certa deste
    // quadro (setadas/atualizadas logo acima). Lista normalmente vazia
    // (nenhum tipo customizado nos dois níveis ainda) — custo zero nesse caso.
    (this._lodObjects || []).forEach((lod) => lod.update(this.camera3));
    this._updateDistanceCulling(camera);
    // [13/09/2026 UTC] NOVO — ver comentário grande de _buildOcclusionSectors
    // (mais acima) pro sistema completo. Roda DEPOIS de
    // _updateDistanceCulling de propósito: só ESCONDE em cima do que a
    // distância já decidiu, nunca reexibe nada.
    this._updateSectorOcclusionCulling(camera);
    // [13/09/2026 UTC] NOVO — ver comentário grande de
    // _updateFrameBudgetCulling (mais abaixo) pro sistema completo/pedido.
    // Roda por ÚLTIMO dos 3 cortes de propósito: só decide entre quem já
    // sobreviveu à distância E ao setor — nunca reexibe ninguém que os
    // cortes anteriores já esconderam.
    this._updateFrameBudgetCulling(camera);
    this._updateItemBadgeOcclusion(camera);
    this._updateEffects();
    // REESCRITO (07/09/2026), arquitetura WebGLRenderTarget — ver "MODO EYE"
    // no construtor. Em modo eye, desenha no `THREE.WebGLRenderTarget`
    // PRÓPRIO desta instância (framebuffer off-screen isolado, nunca
    // compartilhado com outros "olhos") em vez do canvas global — sem
    // nenhum `setScissor`/`setScissorTest` necessário (cada "olho" tem seu
    // PRÓPRIO buffer inteiro, não precisa "recortar" um espaço dentro de um
    // buffer maior compartilhado). Depois de renderizar, devolve o renderer
    // pro estado neutro (`setRenderTarget(null)`) — necessário pro PRÓXIMO
    // "olho" que for chamar `render()` (síncronos, nunca em paralelo de
    // verdade) não continuar escrevendo sem querer no target deste aqui —
    // e transfere o resultado pro canvas 2D visível via `_presentToCanvas`.
    // CORRIGIDO (08/09/2026), ITENS 5/6: este trecho (resize já foi feito
    // no topo desta função + desenha no render target + devolve o
    // renderer neutro + copia pro canvas 2D visível) foi extraído pra
    // `_presentFrame()` (novo método, ver comentário grande logo ACIMA
    // desta função) — reaproveitado também por `Modeler3D._renderFrame`
    // (modeler-core.js), que antes pulava exatamente este trecho
    // (chamava `renderer.render()` direto, nunca `_presentToCanvas()`) —
    // causa raiz encontrada do "cenário congelado"/"tela preta ao
    // redimensionar" no Modelador (ver comentário grande em
    // `_presentFrame`, acima).
    this._presentFrame();
  }

  /** [13/09/2026] NOVO — pedido verbatim: "Entre eles [posição X/Y/Z e FPS
   *  do rodapé de 'Ver em 3D'], coloque a quantidade de objetos que está
   *  sendo renderizada naquele frame." Lido pelo HUD (view3d.js) LOGO DEPOIS
   *  de `render()`/`_presentFrame()` terem chamado `renderer.render(...)`
   *  de verdade neste mesmo quadro — o three.js zera e recalcula
   *  `renderer.info.render` automaticamente a CADA chamada de
   *  `renderer.render()` (`autoReset` do `WebGLRenderer.info`, ligado por
   *  padrão nesta versão — não desligamos em lugar nenhum deste projeto),
   *  então os números aqui são sempre os do quadro que ACABOU de ser
   *  desenhado na tela, nunca de um quadro antigo.
   *  - `drawCalls`: `renderer.info.render.calls` — quantas chamadas de
   *    desenho a GPU recebeu de verdade neste quadro. É o número que mais
   *    importa pra desempenho: um `THREE.InstancedMesh` com 500 cadeiras
   *    conta como 1 draw call só (não 500), então este número reflete bem
   *    melhor o custo real de GPU do que a contagem "lógica" de objetos.
   *  - `triangles`: `renderer.info.render.triangles` — total de triângulos
   *    de verdade enviados pra GPU neste quadro (soma todas as instâncias de
   *    todo InstancedMesh desenhado, não só 1 por pool).
   *  - `pickables`: `this.pickables.length` — contagem "lógica", 1 por
   *    objeto/item/câmera do mapa (igual ao 2D), pra dar noção de quantos
   *    OBJETOS existem no total, independente de quantos viraram draw calls
   *    (a diferença entre este número e `drawCalls` É o efeito de
   *    agrupamento do pool de InstancedMesh + frustum/distância culling —
   *    ver `_rebuildInstancedPools`/`_updateDistanceCulling`). */
  getRenderInfo() {
    const info = this.renderer?.info;
    return {
      drawCalls: info?.render?.calls || 0,
      triangles: info?.render?.triangles || 0,
      pickables: this.pickables?.length || 0,
    };
  }

  /** Chamado a cada quadro — decide se o selo "🔗 item associado"/flags de
   *  cada objeto (ver `_itemBadgeGroups`, montado em
   *  `_addItemAssociadoDestaque`) fica escondido atrás de uma parede/porta/
   *  janela entre ele e a câmera, quando "Ver através das paredes" ›
   *  "Plaquinhas/bolinhas" está DESLIGADA (⚙️ Configurações 3D — pedido do
   *  usuário, 26/08/2026, 4ª rodada). Ligada (padrão), pula o raycast
   *  inteiro — `depthTest:false` nos sprites já garante visibilidade
   *  incondicional, inclusive contra o PRÓPRIO objeto (ver comentário grande
   *  em `_addItemAssociadoDestaque`: por isso o raycast aqui só testa contra
   *  `_wallOcclusionMeshes`, nunca contra o objeto do próprio selo). Custo
   *  desprezível: um raycast por GRUPO de selo (não por sprite individual),
   *  contra uma lista já filtrada só de paredes/portas/janelas. */
  _updateItemBadgeOcclusion(camera) {
    const grupos = this._itemBadgeGroups;
    if (!grupos || !grupos.length) return;
    const atravesParedes = this._config?.itemBadge3DAtravesParedesAtivo !== false;
    if (atravesParedes) {
      // Se acabou de LIGAR de novo com algum grupo escondido de quando
      // esteve desligada, garante que volta tudo visível.
      grupos.forEach((g) => { g.sprites.forEach((s) => { s.visible = true; }); });
      return;
    }
    const THREE = this.THREE;
    const meshes = this._wallOcclusionMeshes;
    const origin = { x: camera.x, y: camera.y, z: camera.z };
    grupos.forEach((g) => {
      const dx = g.pos.x - origin.x, dy = g.pos.y - origin.y, dz = g.pos.z - origin.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1e-4 || !meshes || !meshes.length) {
        g.sprites.forEach((s) => { s.visible = true; });
        return;
      }
      this._raycaster.set(
        new THREE.Vector3(origin.x, origin.y, origin.z),
        new THREE.Vector3(dx / dist, dy / dist, dz / dist),
      );
      this._raycaster.near = 0;
      // `- 0.05`: não conta a própria parede/porta/janela onde o selo por
      // acaso estivesse encostado (encosto raro, mas evita "piscar" na
      // borda exata) como bloqueio — só o que estiver de verdade NA FRENTE
      // dele, entre ele e a câmera.
      this._raycaster.far = Math.max(0.01, dist - 0.05);
      const bloqueado = this._raycaster.intersectObjects(meshes, false).length > 0;
      g.sprites.forEach((s) => { s.visible = !bloqueado; });
    });
  }

  /** [16/09/2026 UTC] NOVO — pedido verbatim do usuário (Trena 3D, seção
   *  "Visibilidade" de ⚙️ Configurações 3D): "imprimir se estiver visível
   *  [...] se tiver objetos 'na frente' e a medida estiver atrás desse
   *  objeto (de acordo com a perspectiva da câmera), então, a medida não
   *  aparece." DIFERENTE de `_updateItemBadgeOcclusion`/
   *  `_wallOcclusionMeshes` acima (só parede/porta/janela contam) — aqui
   *  QUALQUER pickable de verdade bloqueia (inclusive objetos comuns),
   *  porque o pedido explicitamente cita "objetos na frente", não só
   *  arquitetura. Usa `this._pickMeshes` (a lista geral, já mantida por
   *  `setScene`/toda vez que algo é adicionado/removido — ver
   *  `_setupWallOcclusionMeshes` acima pro subconjunto usado pelos selos)
   *  em vez de uma lista dedicada nova. Raycast simples de `fromPos` até
   *  `toPos`; `-0.05` no alcance (mesmo padrão de `_updateItemBadgeOcclusion`)
   *  evita falso-bloqueio por encostar exatamente na superfície de chegada.
   *  Retorna `false` (nunca bloqueado) se as malhas ainda não existirem ou
   *  a distância for desprezível — chamador (`view3d.js`
   *  `_trena3DAtualizarOclusao`) decide o que fazer com isso. */
  isSegmentOccluded(fromPos, toPos) {
    const THREE = this.THREE;
    const meshes = this._pickMeshes;
    if (!THREE || !meshes || !meshes.length) return false;
    const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y, dz = toPos.z - fromPos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-4) return false;
    this._raycaster.set(
      new THREE.Vector3(fromPos.x, fromPos.y, fromPos.z),
      new THREE.Vector3(dx / dist, dy / dist, dz / dist),
    );
    this._raycaster.near = 0;
    this._raycaster.far = Math.max(0.01, dist - 0.05);
    return this._raycaster.intersectObjects(meshes, false).length > 0;
  }

  // ---------- "Recolhedor" de itens no 3D (pedido do usuário: "como no
  // Minecraft, deve ter algum recolhedor de itens (removê-los da cena) no
  // 3D... uma animação... o objeto entra em uma caixa que aparece, o objeto
  // entra na caixa e depois a caixa vai desaparecendo") — ver
  // spawnCollectEffect (item/câmera/objeto — "pequenos") e
  // spawnDemolishEffect (parede/porta/janela — "outros itens grandes",
  // pedido explícito de um jeito DIFERENTE e "criativo": em vez de uma
  // caixinha, se despedaça em cacos que voam e caem, feito uma demolição).
  // Puramente COSMÉTICO: o dado de verdade já foi removido de `this._map`
  // por quem chamou (ver view3d.js `_removeWithTool`) ANTES de pedir o
  // efeito — as malhas aqui são decorativas, soltas direto em `this.scene`
  // (fora de `this._group`, que é limpo inteiro por `setScene`/
  // `_disposeGroupContents` a cada reconstrução da cena), então sobrevivem
  // ao rebuild que acontece logo em seguida, sem precisar coordenar timing
  // com ele. ----------

  /** Caixa que aparece, o item "encolhe" pra dentro dela, e ela se fecha e
   *  esmaece — MESMO estilo de linguagem visual da roleta da hotbar (surge,
   *  se estabiliza, esmaece). `pos` {x,y,z} é o centro do item removido;
   *  `corCss` uma cor CSS (hex, ex.: '#8a92a3' — o Three.js aceita direto);
   *  `escala` (metros, opcional) ajusta o tamanho do cubo decorativo ao
   *  tamanho aproximado do item de verdade. */
  spawnCollectEffect(pos, corCss, escala = 0.4) {
    if (!this._ready || !this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y, pos.z);
    const s = Math.max(0.12, Math.min(0.5, escala * 0.5));
    const itemMat = new THREE.MeshBasicMaterial({ color: corCss || '#8a92a3', transparent: true, opacity: 1 });
    const item = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), itemMat);
    group.add(item);
    const boxMat = new THREE.MeshBasicMaterial({ color: '#d8a05a', transparent: true, opacity: 0 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(s * 1.7, s * 1.35, s * 1.7), boxMat);
    box.position.y = -s * 0.7;
    box.scale.setScalar(0.001);
    group.add(box);
    this.scene.add(group);
    this._effects.push({ kind: 'collect', t0: performance.now(), dur: 900, group, item, itemMat, box, boxMat });
  }

  /** Parede/porta/janela ("itens grandes") não "cabem numa caixinha" —
   *  tratamento diferente e propositalmente mais dramático: se despedaça em
   *  vários cacos que voam pra fora/pra cima e caem, esmaecendo no ar, como
   *  uma pequena demolição. `tamanho` {x,y,z} (metros) escala a dispersão
   *  dos cacos conforme o tamanho real do elemento removido. */
  spawnDemolishEffect(pos, tamanho, corCss) {
    if (!this._ready || !this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y, pos.z);
    this.scene.add(group);
    const sx = Math.max(0.3, tamanho?.x || 1), sy = Math.max(0.3, tamanho?.y || 1), sz = Math.max(0.3, tamanho?.z || 0.3);
    const pieces = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: corCss || '#9aa4b2', transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), mat);
      mesh.position.set((Math.random() - 0.5) * sx * 0.7, (Math.random() - 0.3) * sy * 0.6, (Math.random() - 0.5) * sz * 0.7 || (Math.random() - 0.5) * 0.2);
      group.add(mesh);
      pieces.push({
        mesh, mat,
        dir: { x: (Math.random() - 0.5) * 2.2, y: Math.random() * 1.8 + 0.8, z: (Math.random() - 0.5) * 2.2 },
        spin: (Math.random() - 0.5) * 7,
      });
    }
    this._effects.push({ kind: 'demolish', t0: performance.now(), dur: 750, group, pieces });
  }

  /** Avança todos os efeitos ativos (ver spawnCollectEffect/
   *  spawnDemolishEffect) um quadro — chamado de dentro de render(), tanto
   *  no 3D em tela cheia quanto na Miniatura 3D (mesma render(), MESMO
   *  código pros dois, ver comentário grande no topo do arquivo). Remove e
   *  libera (geometry/material.dispose) cada efeito assim que sua duração
   *  termina. */
  _updateEffects() {
    if (!this._effects.length) return;
    const now = performance.now();
    for (let i = this._effects.length - 1; i >= 0; i--) {
      const fx = this._effects[i];
      const t = Math.min(1, (now - fx.t0) / fx.dur);
      if (fx.kind === 'collect') {
        // Fase 1 (0-45%): a caixa "surge" (escala 0→1). Fase 2 (20%-70%): o
        // item encolhe até sumir "dentro" dela. Fase 3 (60%-100%): a caixa
        // se fecha/esmaece — as 3 fases se sobrepõem de propósito, pro
        // movimento parecer contínuo em vez de 3 etapas travadas.
        const eIn = 1 - Math.pow(1 - Math.min(1, t / 0.45), 3);
        fx.box.scale.setScalar(0.12 + 0.88 * eIn);
        const shrinkT = Math.max(0, Math.min(1, (t - 0.2) / 0.5));
        const eShrink = shrinkT * shrinkT;
        fx.item.scale.setScalar(Math.max(0.001, 1 - eShrink));
        fx.item.position.y = -eShrink * 0.12;
        fx.itemMat.opacity = 1 - Math.max(0, (t - 0.55) / 0.2);
        const closeT = Math.max(0, Math.min(1, (t - 0.6) / 0.4));
        const eClose = closeT * closeT;
        fx.box.scale.multiplyScalar(1 - eClose * 0.92);
        fx.boxMat.opacity = eIn * (1 - eClose);
      } else if (fx.kind === 'demolish') {
        fx.pieces.forEach((p) => {
          p.mesh.position.x += p.dir.x * 0.016;
          p.mesh.position.y += (p.dir.y - t * 3.4) * 0.016;
          p.mesh.position.z += p.dir.z * 0.016;
          p.mesh.rotation.y += p.spin * 0.05;
          p.mesh.rotation.x += p.spin * 0.03;
          p.mat.opacity = Math.max(0, 1 - t);
        });
      }
      if (t >= 1) {
        fx.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        this.scene.remove(fx.group);
        this._effects.splice(i, 1);
      }
    }
  }

  /** Raio a partir do centro da tela (mira), no espaço do mundo. */
  centerRay(camera) {
    return { origin: { x: camera.x, y: camera.y, z: camera.z }, dir: cameraForward(camera) };
  }

  /** [10/09/2026] NOVO — pedido verbatim: "ao clicar em uma câmera e
   *  selecionar 'Ver através desta câmera', deve ser possível interagir
   *  com o cenário, o cursor do mouse deve aparecer para ir apontando para
   *  as coisas, poder selecioná-las". Diferente de `centerRay` (sempre a
   *  MIRA/centro da tela — o modelo de "crosshair" usado pela navegação
   *  normal em 1ª pessoa), este devolve o raio de verdade que passa por um
   *  ponto QUALQUER da tela (coordenadas normalizadas -1..1, mesma
   *  convenção de `THREE.Raycaster.setFromCamera`) — usado por view3d.js
   *  `_pickAtClientPoint` (mousemove/click do mouse de verdade, não a mira
   *  central) enquanto `_fotoCamMode`/`_orbCamMode` estão ativos (os 2
   *  únicos modos que hoje saem do Pointer Lock e mostram o cursor de
   *  verdade — ver `_enterFotoCameraView`/`_enterCameraOrbView`). Usa
   *  `this.camera3` (a câmera Three.js de verdade, já com FOV/aspect/pose
   *  do quadro mais recente — ver `render()`) em vez de reimplementar a
   *  trigonometria de FOV/aspect manualmente; `updateMatrixWorld` explícito
   *  porque isto pode ser chamado ENTRE quadros (evento de mouse), não só
   *  de dentro do próprio `render()` como o resto do arquivo assume. */
  rayFromScreenPoint(ndcX, ndcY) {
    if (!this.THREE || !this.camera3) return null;
    const THREE = this.THREE;
    this.camera3.updateMatrixWorld(true);
    const origin = new THREE.Vector3().setFromMatrixPosition(this.camera3.matrixWorld);
    const dir = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera3).sub(origin).normalize();
    if (!isFinite(dir.x) || !isFinite(dir.y) || !isFinite(dir.z)) return null;
    return { origin: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: dir.x, y: dir.y, z: dir.z } };
  }

  /** Raio da mira contra as malhas de PAREDE de verdade (não os pickables
   *  esféricos de item/câmera/objeto/porta/janela testados por
   *  pickFromRay/hoverPick) — usado pelo modo de construção em 3D
   *  (view3d.js `_placeWithBuildTool`/`_updateBuildGhost`): "Porta"/"Janela"
   *  mirando numa parede encaixa nela ali; sem bater em nenhuma, fica "no
   *  ar" (pedido do usuário — sem física ainda, tudo bem). Ponto devolvido
   *  em coordenadas de MUNDO (x,z); quem chama projeta na linha
   *  x1,y1-x2,y2 da parede (`wall`) pra achar `posAoLongoDaParede`. */
  raycastWall(origin, dir) {
    if (!this.THREE || !this._raycaster || !this._pickMeshes?.length) return null;
    const THREE = this.THREE;
    this._raycaster.set(new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Vector3(dir.x, dir.y, dir.z).normalize());
    const wallMeshes = this._pickMeshes.filter((m) => m.userData?.pick?.type === 'wall');
    if (!wallMeshes.length) return null;
    const hits = this._raycaster.intersectObjects(wallMeshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    return { wall: hit.object.userData.pick.ref, point: { x: hit.point.x, z: hit.point.z }, distance: hit.distance };
  }

  /** Centro do quadrado de 1m do chão (mesma grade visual do xadrez, ver
   *  _floorInfo/setScene) mais próximo de um ponto (x,z) qualquer — pedido
   *  do usuário (24/08/2026): "para posicionar a porta, se segurar o SHIFT,
   *  ela deve ficar alinhada com o centro do quadrado no chão" (view3d.js
   *  _updateBuildGhost/_placeWithBuildTool/_captureFreeRotatePivot,
   *  ferramenta porta/janela "no ar"). Virou o encaixe PADRÃO em seguida
   *  (pedido do usuário, 25/08/2026: "O travar no centro do bloco deve ser
   *  o padrão") — Shift passou a ser o INVERSO (segurar LIBERA, deixa solto
   *  onde a mira encosta no chão) — quem decide isso é quem chama, aqui é
   *  só o cálculo do centro em si. MESMA fórmula de hoverPick()/pickFromRay()
   *  pro tipo 'floor' (linhas acima) — reaproveitada aqui como método
   *  público pra não duplicar a conta em dois arquivos, incluindo a fase
   *  invertida do eixo Z (contada a partir de `maxZ` pra baixo — ver o
   *  comentário grande sobre isso em `_floorInfo`, lá em cima, em setScene).
   *  Devolve o próprio (x,z) sem alteração se ainda não há piso montado
   *  (_floorInfo nulo).
   */
  snapToFloorTileCenter(x, z) {
    if (!this._floorInfo) return { x, z };
    // `phaseX`/`phaseZ` (03/09/2026): âncora de fase em (0,0) — ver
    // comentário grande em `_floorInfo`/setScene ("ladrilhos partindo da
    // origem"). `minX`/`maxZ` continuam existindo em `_floorInfo`, mas só
    // como limites de área agora, não mais como âncora de fase.
    const { tileSize, phaseX, phaseZ } = this._floorInfo;
    const tileX = Math.floor((x - phaseX) / tileSize) * tileSize + phaseX + tileSize / 2;
    const tileZ = phaseZ - Math.floor((phaseZ - z) / tileSize) * tileSize - tileSize / 2;
    return { x: tileX, z: tileZ };
  }

  /** Canto/interseção da grade de 1m×1m do CHÃO (mesma grade visual do
   *  xadrez — ver _floorInfo/setScene) mais perto de (x,z) — usado pelo
   *  "Snap de interseção de grade" da ferramenta 🧱 Parede (pedido do
   *  usuário: "trava nos cruzamentos 1m×1m... fecha cômodos ortogonais
   *  perfeitos", ver view3d.js _resolveWallSnap). Diferente de
   *  snapToFloorTileCenter (que acha o CENTRO do quadrado, usado pelo
   *  encaixe de porta/janela "no ar") — aqui é o CANTO/cruzamento, a meio
   *  quadrado de distância de dois centros vizinhos. Devolve o próprio
   *  (x,z) sem alteração se ainda não há piso montado. */
  gridIntersectionNear(x, z) {
    if (!this._floorInfo) return { x, z };
    const centro = this.snapToFloorTileCenter(x, z);
    const half = this._floorInfo.tileSize / 2;
    return {
      x: centro.x + (x >= centro.x ? half : -half),
      z: centro.z + (z >= centro.z ? half : -half),
    };
  }

  /** Raio da mira contra o plano y=0 (chão) — SEM limite de área (diferente
   *  de `_rayPlaneT`/`_floorInfo`, restritos à área já desenhada): o modo de
   *  construção precisa poder colocar parede/objeto/item além do que já
   *  existe no mapa. Coordenadas de MUNDO. */
  raycastFloor(origin, dir) {
    if (Math.abs(dir.y) < 1e-6) return null;
    const t = (0 - origin.y) / dir.y;
    if (t <= 0.05) return null;
    return { x: origin.x + dir.x * t, z: origin.z + dir.z * t, t };
  }

  /** MESMA conta de `raycastFloor` acima, só que contra um plano horizontal
   *  numa altura `y` QUALQUER, não só y=0 — pedido do usuário, 25/08/2026:
   *  "Se o objeto está com o ghost em cima de outro objeto e pressionar R,
   *  então, o tracejado tem como ponto de referência o centro de rotação em
   *  cima desse objeto. O 'transferidor'... é desenhado em cima do objeto
   *  que é o novo chão nesse caso". Usado pelo Giro Livre (view3d.js
   *  _updateBuildGhost, ferramenta 📦 Objeto) pra manter o traço pontilhado
   *  e o transferidor GRUDADOS no tampo do objeto onde a peça está pousada
   *  (`pivot.baseY`), em vez de "furar" pro chão de verdade quando o pivô
   *  está elevado (em cima de uma mesa, por exemplo). */
  raycastPlaneY(origin, dir, y) {
    if (Math.abs(dir.y) < 1e-6) return null;
    const t = (y - origin.y) / dir.y;
    if (t <= 0.05) return null;
    return { x: origin.x + dir.x * t, z: origin.z + dir.z * t, t };
  }

  /** Superfície horizontal mais próxima na mira — o TOPO de um objeto (ex.:
   *  tampo de mesa) OU o chão (raycastFloor acima), o que estiver mais
   *  perto. Pedido do usuário: "ao mirar em cima da mesa, deve ser possível
   *  colocar coisas em cima dela. Atualmente, mesmo apontando para a mesa o
   *  objeto é colocado no chão (pelo trajeto de mira que atravessa a mesa e
   *  vai até o chão)" — o raycast de posicionamento (`raycastFloor`, um
   *  plano y=0 sem limite de área) nunca sabia de nenhuma malha de verdade
   *  no meio do caminho; este método testa as malhas reais de objeto
   *  também, e só aceita uma face virada pra CIMA (tampo, não lateral de um
   *  armário) — quem chama usa `y` do resultado como a elevação
   *  (`obj.elevacao`, ver Mapping.addObject/view3d.js) do que for colocado
   *  ali. Coordenadas de MUNDO (x,y,z). */
  raycastSurface(origin, dir) {
    const floorHit = this.raycastFloor(origin, dir);
    let best = floorHit ? { x: floorHit.x, y: 0, z: floorHit.z, t: floorHit.t, restingOnId: null } : null;
    if (this.THREE && this._raycaster && this._pickMeshes?.length) {
      const THREE = this.THREE;
      this._raycaster.set(
        new THREE.Vector3(origin.x, origin.y, origin.z),
        new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
      );
      // Só objetos — paredes são verticais (não servem de apoio horizontal)
      // e item/câmera são pequenos/já ocupados demais pra fazer sentido
      // apoiar algo em cima. NOVO (07/09/2026) — 'tijolo' incluído aqui:
      // pedido verbatim dos "blocos de construção" precisa poder empilhar
      // um tijolo em cima de outro (e em cima de objetos normais, e
      // vice-versa — objetos normais pousando em cima de uma pilha de
      // tijolos já existente, de graça, mesmo filtro).
      const alvos = this._pickMeshes.filter((m) => m.userData?.pick?.type === 'object' || m.userData?.pick?.type === 'tijolo');
      const hits = this._raycaster.intersectObjects(alvos, false);
      for (const hit of hits) {
        const localNormal = hit.face?.normal;
        if (!localNormal) continue;
        const worldNormal = localNormal.clone().transformDirection(hit.object.matrixWorld);
        if (worldNormal.y < 0.5) continue; // só topo virado pra cima — não a lateral
        // `hits` já vem ordenado por distância crescente — o 1º que passar
        // no filtro de normal já é a superfície horizontal mais próxima
        // possível; comparar com o chão decide qual dos dois é mais perto.
        // `restingOnId` (pedido do usuário, 25/08/2026: "Ao apontar para
        // cima de um objeto já posto... deve haver um raio X... que faz o
        // objeto de baixo ficar transparente") — id do objeto do MAPA
        // (`obj.id`, não a malha em si) sendo pousado em cima, pra
        // view3d.js poder pedir pro Engine3D destacar/atravessar
        // exatamente ele (ver setXRayTarget/showGhostFootprintShadow) sem
        // ter que refazer este mesmo raycast de novo.
        if (!best || hit.distance < best.t) best = { x: hit.point.x, y: hit.point.y, z: hit.point.z, t: hit.distance, restingOnId: hit.object.userData?.pick?.id ?? null };
        break;
      }
    }
    return best;
  }

  /** Raio da mira contra a face LATERAL de um objeto/porta/janela já
   *  existente (a normal do triângulo atingido aponta pro lado, não pra
   *  cima) — pedido do usuário (rodada 50): "posicionar os objetos um do
   *  lado do outro [...] o raycasting bate nos objetos e o ghost do novo
   *  objeto é posicionado ao seu lado [...] dependendo de onde bater o
   *  raio. Isso deve funcionar em tudo que é objeto [...] porta, janela,
   *  cubo, objetos padrão". Parede fica de FORA daqui de propósito — ela já
   *  tem seu próprio caminho dedicado (`raycastWall`/`_resolveObjectWallSnap`
   *  em view3d.js, mais antigo e mais completo: alinha o giro paralelo à
   *  parede). Aqui cobre só objeto/porta/janela colidindo uns com os
   *  outros. Devolve `{x,y,z,t,normal:{x,y,z},pick}` (normal em coordenadas
   *  de MUNDO, já normalizada) ou `null` se não bateu em nenhuma face
   *  lateral. `pick` é o `userData.pick` da malha atingida (id/type do alvo
   *  encostado), pra quem chama poder decidir a altura-base certa (ex.:
   *  encostar do lado de um objeto elevado, não só no chão). */
  raycastLateral(origin, dir) {
    if (!this.THREE || !this._raycaster || !this._pickMeshes?.length) return null;
    const THREE = this.THREE;
    this._raycaster.set(
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
    );
    const alvos = this._pickMeshes.filter((m) => {
      const t = m.userData?.pick?.type;
      return t === 'object' || t === 'porta' || t === 'janela';
    });
    if (!alvos.length) return null;
    const hits = this._raycaster.intersectObjects(alvos, false);
    for (const hit of hits) {
      const localNormal = hit.face?.normal;
      if (!localNormal) continue;
      const worldNormal = localNormal.clone().transformDirection(hit.object.matrixWorld).normalize();
      if (worldNormal.y >= 0.5) continue; // topo — já é o caso de raycastSurface, não este
      return {
        x: hit.point.x, y: hit.point.y, z: hit.point.z, t: hit.distance,
        normal: { x: worldNormal.x, y: worldNormal.y, z: worldNormal.z },
        pick: hit.object.userData?.pick || null,
      };
    }
    return null;
  }

  /** Usado pelo clique/toque de seleção (view3d.js `_tryPick`) — item, câmera
   *  ou objeto sob a mira. Com raycastPrecision:'pixelperfect', testa a malha
   *  real (só as de tipo item/câmera/objeto — paredes e chão nunca são
   *  "clicáveis" aqui) em vez da esfera aproximada do modo 'hitbox'. */
  pickFromRay(origin, dir) {
    if (this._config?.raycastPrecision === 'pixelperfect' && this._raycaster && this._pickMeshes?.length) {
      const THREE = this.THREE;
      this._raycaster.set(
        new THREE.Vector3(origin.x, origin.y, origin.z),
        new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
      );
      const alvos = this._pickMeshes.filter((m) => {
        const pick = m.userData?.pick;
        const t = pick?.type;
        // 'fotoPin' incluído (03/09/2026) — ver o retângulo texturizado da
        // foto no bloco "fotos vinculadas ao mapa" de setScene, acima.
        if (t !== 'item' && t !== 'camera' && t !== 'object' && t !== 'fotoPin') return false;
        // [10/09/2026] NOVO — pula o próprio orb/câmera sendo visto
        // através (ver this._pickExclude/setPickExclude) — pedido
        // verbatim: "o clique está pegando a própria câmera [...] deve
        // ser desativado".
        if (this._isPickExcluded(t, pick.id)) return false;
        return true;
      });
      const hits = this._raycaster.intersectObjects(alvos, false);
      return hits.length ? hits[0].object.userData.pick : null;
    }
    let best = null, bestT = Infinity;
    for (const p of this.pickables) {
      // [10/09/2026] NOVO — ver this._pickExclude/setPickExclude acima.
      if (this._isPickExcluded(p.type, p.id)) continue;
      const t = this._rayPickableT(p, origin, dir);
      if (t !== null && t < bestT) { bestT = t; best = p; }
    }
    return best;
  }

  /** Teste de mira contra UM pickable — usa a caixa orientada (`p.obb`,
   *  quando disponível) em vez da esfera aproximada (`p.pos`/`p.radius`).
   *  Bug relatado pelo usuário: "coloquei uma mesa. Em cima dela, coloquei
   *  gabinete, monitor, teclado, mouse... mesmo sendo atingidos pelo raio,
   *  não ficam destacados" — a ESFERA de uma mesa larga e baixa (raio =
   *  metade do maior lado, pra cobrir a mesa inteira horizontalmente)
   *  "incha" bem mais alto/fundo que a mesa de verdade, e ENGOLIA o espaço
   *  logo em cima do tampo — onde ficam os objetos pousados nela (ver
   *  raycastSurface) — fazendo a mesa "ganhar" da mira antes mesmo do
   *  monitor/teclado/mouse serem testados. A caixa orientada já existe pra
   *  quase todo pickable (mesa, objeto genérico, porta/janela, câmera, item
   *  — ver os respectivos `objPick`/`pick` em setScene/buildDoorOrWindowMesh)
   *  e é justa ao tamanho REAL da peça, sem esse infla-e-engole. Só cai de
   *  volta pra esfera quando não há obb (nenhum caso conhecido hoje, mas
   *  mantido por segurança). */
  _rayPickableT(p, origin, dir) {
    if (p.obb) return this._rayBoxT(origin, dir, p.pos, p.obb.rotY || 0, p.obb.half);
    return this._raySphereT(origin, dir, p.pos, p.radius);
  }

  _raySphereT(o, d, c, radius) {
    const oc = { x: o.x - c.x, y: o.y - c.y, z: o.z - c.z };
    const b = oc.x * d.x + oc.y * d.y + oc.z * d.z;
    const cc = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z - radius * radius;
    const disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t > 0.05 ? t : null;
  }

  /** Interseção raio-plano horizontal (y=planeY) — usada pro destaque do
   *  ladrilho do chão sob a mira. null se o raio for quase paralelo ao chão
   *  (nunca cruzaria, ou só no infinito) ou se o chão estiver ATRÁS da
   *  câmera (t <= 0). */
  _rayPlaneT(o, d, planeY) {
    if (Math.abs(d.y) < 1e-6) return null;
    const t = (planeY - o.y) / d.y;
    return t > 0.05 ? t : null;
  }

  /** Interseção raio-caixa ORIENTADA (rotacionada só no eixo Y — nunca
   *  inclinada, igual toda malha deste app: paredes/câmeras/objetos). Passo
   *  1: transforma o raio pro espaço LOCAL da caixa desfazendo a translação
   *  e a MESMA rotação usada pra posicionar a malha de verdade em setScene
   *  (`mesh.rotation.y = rotY`) — como essa rotação é ortogonal, desfazer é
   *  aplicar a matriz TRANSPOSTA. Passo 2: teste de "fatias" (slab test)
   *  padrão de raio-caixa-alinhada-aos-eixos nesse espaço local. */
  _rayBoxT(o, d, center, rotY, half) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const ox = o.x - center.x, oy = o.y - center.y, oz = o.z - center.z;
    const lox = ox * c - oz * s, loy = oy, loz = ox * s + oz * c;
    const ldx = d.x * c - d.z * s, ldy = d.y, ldz = d.x * s + d.z * c;
    let tmin = -Infinity, tmax = Infinity;
    const eixos = [[lox, ldx, half.x], [loy, ldy, half.y], [loz, ldz, half.z]];
    for (const [op, dp, h] of eixos) {
      if (Math.abs(dp) < 1e-9) { if (op < -h || op > h) return null; continue; }
      let t1 = (-h - op) / dp, t2 = (h - op) / dp;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmax < 0.05) return null;
    return tmin > 0.05 ? tmin : tmax;
  }

  /** Modo 'pixelperfect' (ver setConfig/raycastPrecision, configurável no
   *  painel 2D/3D) — usa o THREE.Raycaster de verdade contra as malhas reais
   *  (this._pickMeshes, marcadas com .userData.pick em setScene), testando
   *  triângulo a triângulo em vez da aproximação por esfera/caixa do modo
   *  'hitbox'. Mais exato nos cantos/bordas de formas não-esféricas (ex:
   *  acertar só a quina de uma caixa rotacionada), um pouco mais pesado por
   *  quadro — por isso é opcional, não o padrão. */
  _hoverPickPixelPerfect(camera, rayOverride) {
    if (!this._raycaster || !this._pickMeshes?.length) return null;
    const THREE = this.THREE;
    const ray = rayOverride || this.centerRay(camera);
    this._raycaster.set(
      new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z),
      new THREE.Vector3(ray.dir.x, ray.dir.y, ray.dir.z).normalize(),
    );
    // [10/09/2026] NOVO — pula o próprio orb/câmera sendo visto através
    // (ver this._pickExclude/setPickExclude): sem isto o destaque de mira
    // (contorno pontilhado etc.) enquanto "vendo através" de uma câmera
    // ficaria sempre preso na própria câmera, que fica bem na frente da
    // câmera renderizada. Filtra ANTES de intersectar, não depois (senão
    // um hit excluído em 1º lugar esconderia o que está atrás dele).
    const pickMeshes = this._pickExclude
      ? this._pickMeshes.filter((m) => !this._isPickExcluded(m.userData?.pick?.type, m.userData?.pick?.id))
      : this._pickMeshes;
    const hits = this._raycaster.intersectObjects(pickMeshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const pick = hit.object.userData?.pick;
    if (!pick) return null;
    if (pick.type === 'floor') {
      if (!this._floorInfo) return null;
      // Mesmo encaixe de ladrilho do modo analítico (_rayPlaneT), só que a
      // partir do ponto EXATO onde o raio bateu na malha real do piso — que,
      // ao contrário do plano infinito usado no modo 'hitbox', já respeita os
      // limites reais desenhados (não precisa checar minX/maxX à parte).
      const { tileSize, phaseX, phaseZ } = this._floorInfo; // fase em (0,0) — ver _floorInfo/setScene (03/09/2026)
      const tileX = Math.floor((hit.point.x - phaseX) / tileSize) * tileSize + phaseX + tileSize / 2;
      const tileZ = phaseZ - Math.floor((phaseZ - hit.point.z) / tileSize) * tileSize - tileSize / 2;
      const center = { x: tileX, y: 0.02, z: tileZ };
      return { type: 'floor', x: tileX, z: tileZ, tileSize, center, obb: { half: { x: tileSize / 2, y: 0.02, z: tileSize / 2 }, rotY: 0 }, t: hit.distance };
    }
    return { ...pick, t: hit.distance };
  }

  /** Testa o raio da mira contra TUDO que pode ser destacado — pickables
   *  esféricos já existentes (item/câmera/objeto, mesmo teste do clique),
   *  paredes (caixa orientada) e o chão (plano, só dentro da área realmente
   *  desenhada, ver _floorInfo) — e devolve o mais PRÓXIMO entre os três
   *  tipos (menor t ao longo do raio), não só o primeiro que bater.
   *  Com raycastPrecision:'pixelperfect' (ver setConfig), delega inteiro pra
   *  _hoverPickPixelPerfect em vez do teste analítico por esfera/caixa/plano
   *  abaixo. */
  hoverPick(camera, rayOverride) {
    if (!this._ready || !this.mapData) return null;
    if (this._config.raycastPrecision === 'pixelperfect') return this._hoverPickPixelPerfect(camera, rayOverride);
    const ray = rayOverride || this.centerRay(camera);
    let best = null, bestT = Infinity;
    for (const p of this.pickables) {
      // [10/09/2026] NOVO — ver this._pickExclude/setPickExclude acima.
      if (this._isPickExcluded(p.type, p.id)) continue;
      const t = this._rayPickableT(p, ray.origin, ray.dir); // ver comentário em _rayPickableT — caixa justa, não esfera inchada
      // NOVO (08/09/2026, 38a rodada): `id` agora é copiado pro hit devolvido
      // (antes só `ref`/`type` — os tijolos não usam `ref`, usam um `id`
      // fixo 'tijolos-merged' pro aglomerado, ver `_rebuildTijolos` acima)
      // — necessário pra `_confirmDeleteHit` (view3d.js) decidir o que
      // excluir.
      if (t !== null && t < bestT) { bestT = t; best = { type: p.type, id: p.id, ref: p.ref, radius: p.radius, pos: p.pos, center: p.pos, obb: p.obb, t }; }
    }
    const wallH = 2.6;
    (this.mapData.walls || []).forEach((w) => {
      const dx = w.x2 - w.x1, dz = w.y2 - w.y1;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) return;
      const h = w.height || wallH;
      const center = { x: (w.x1 + w.x2) / 2, y: h / 2, z: (w.y1 + w.y2) / 2 };
      const rotY = Math.atan2(dx, dz);
      const half = { x: WALL_THICKNESS_3D / 2, y: h / 2, z: len / 2 };
      const t = this._rayBoxT(ray.origin, ray.dir, center, rotY, half);
      if (t !== null && t < bestT) { bestT = t; best = { type: 'wall', ref: w, center, rotY, half, obb: { half, rotY }, t }; }
    });
    if (this._floorInfo) {
      const t = this._rayPlaneT(ray.origin, ray.dir, 0);
      if (t !== null && t < bestT) {
        const hx = ray.origin.x + ray.dir.x * t, hz = ray.origin.z + ray.dir.z * t;
        // Pedido do usuário (03/09/2026): destaque do chão sob a mira
        // parava de funcionar longe de onde tem objetos — teste de área
        // trocado de `minX/maxX/minZ/maxZ` (limites da área MAPEADA, bem
        // menor) para `floorMinX/floorMaxX/floorMinZ/floorMaxZ` (o alcance
        // VISUAL do chão "infinito", ~900m — ver FLOOR_RENDER_SPAN/
        // `_floorInfo` em setScene), que é o que o jogador realmente vê.
        const { tileSize, floorMinX, floorMaxX, floorMinZ, floorMaxZ, phaseX, phaseZ } = this._floorInfo;
        if (hx >= floorMinX && hx <= floorMaxX && hz >= floorMinZ && hz <= floorMaxZ) {
          // X/Z: grade ancorada em (0,0) — `phaseX`/`phaseZ` (03/09/2026,
          // ver comentário grande em _floorInfo/setScene: "ladrilhos
          // partindo da origem, em fase com o mapa 2D"). `minX`/`maxX`/
          // `minZ`/`maxZ` (usados só acima, no teste de área) continuam os
          // limites reais do chão desenhado — não mudaram de papel, só
          // pararam de servir de âncora de fase. Z conta a partir de
          // `phaseZ` PRA BAIXO (textura com fase invertida nesse eixo — ver
          // o comentário grande em _floorInfo, acima em setScene).
          const tileX = Math.floor((hx - phaseX) / tileSize) * tileSize + phaseX + tileSize / 2;
          const tileZ = phaseZ - Math.floor((phaseZ - hz) / tileSize) * tileSize - tileSize / 2;
          const center = { x: tileX, y: 0.02, z: tileZ };
          bestT = t; best = { type: 'floor', x: tileX, z: tileZ, tileSize, center, obb: { half: { x: tileSize / 2, y: 0.02, z: tileSize / 2 }, rotY: 0 }, t };
        }
      }
    }
    return best;
  }

  /** Esconde os 3 destaques de mira (tile/parede/pick) e limpa o canvas do
   *  contorno pontilhado ("outline2d") — o mesmo que `_updateHoverHighlight`
   *  faz no início de todo quadro. Exposto como método PÚBLICO pra quem
   *  PAUSA o loop normal do render() (que é o único lugar que chamava
   *  `_updateHoverHighlight` antes) poder limpar o destaque na hora, sem
   *  esperar o próximo quadro que nunca vem. Pedido do usuário: "o destaque
   *  deve ser desativado quando entra no modo Modelador... o 'contorno
   *  pontilhado na projeção da tela' fica na tela [...] é do último frame
   *  antes de entrar no modo Modelador" — causa raiz: `Modeler3D.enter()`
   *  (`modeler-core.js`) PAUSA o loop de render "normal" do View3D (ver
   *  comentário em `Modeler3D._renderLoop`) pra rodar o loop PRÓPRIO do
   *  Modelador — como `_updateHoverHighlight` só roda dentro do `render()`
   *  pausado, o canvas do contorno fica "congelado" com o desenho do último
   *  quadro antes da pausa. Corrigido chamando este método uma vez, direto,
   *  em `Modeler3D.enter()`, assim que a sessão começa. */
  clearHoverHighlight() {
    if (this._hoverTile) this._hoverTile.visible = false;
    if (this._hoverWall) this._hoverWall.visible = false;
    if (this._hoverPick) this._hoverPick.visible = false;
    if (this._outlineCtx && this._outlineCanvas) this._outlineCtx.clearRect(0, 0, this._outlineCanvas.width, this._outlineCanvas.height);
  }

  /** [16/09/2026 UTC] NOVO — liga/desliga a supressão do destaque de mira
   *  (ver o `if` em `render()` acima) — chamado por `view3d.js`
   *  (`_trena3DAtualizarDestaqueSuprimido`) todo quadro que a "📏 Trena 3D"
   *  estiver com a âncora ativa e a opção correspondente ligada. Público
   *  (em vez de `view3d.js` mexer direto num campo interno) pelo mesmo
   *  espírito de outros setters deste arquivo (`setPickExclude` etc.). */
  setHoverHighlightSuppressed(v) {
    this._suppressHoverHighlight = !!v;
  }

  /** Reposiciona/reescala (nunca recria) as 3 malhas de destaque + o canvas
   *  de contorno 2D conforme o resultado de hoverPick deste quadro — só um
   *  destaque fica visível por vez (o mais próximo no raio da mira).
   *  Chamado uma vez por quadro, de render(). O QUÊ é desenhado depende de
   *  this._config (raycastEnabled/raycastHighlightStyle — ver setConfig,
   *  MapConfig no menu de configurações do mapa 2D/3D). */
  _updateHoverHighlight(camera) {
    this._hoverTile.visible = false;
    this._hoverWall.visible = false;
    this._hoverPick.visible = false;
    if (this._outlineCtx) this._outlineCtx.clearRect(0, 0, this._outlineCanvas.width, this._outlineCanvas.height);
    if (!this._config.raycastEnabled) return;
    // [10/09/2026] NOVO — pedido verbatim: "Ao mirar em um objeto, ele deve
    // ter o mesmo destaque que tem quando não se está nesse modo, por
    // exemplo, 'contorno pontilhado'". Enquanto `_fotoCamMode`/
    // `_orbCamMode` ativos, view3d.js mantém `this._hoverScreenNdc`
    // atualizado com a posição real do MOUSE (não há crosshair central
    // nesses modos — o cursor de verdade fica visível, ver
    // `_pickAtClientPoint`) — usa esse ponto pra construir o raio de
    // destaque em vez do raio central de sempre, através de
    // `rayFromScreenPoint` (mesma função usada pelo clique/hover de
    // cursor). `null` (navegação normal) cai no comportamento de sempre
    // (raio central, via `centerRay` dentro de `hoverPick`).
    const rayOverride = this._hoverScreenNdc ? this.rayFromScreenPoint(this._hoverScreenNdc.x, this._hoverScreenNdc.y) : null;
    const hit = this.hoverPick(camera, rayOverride);
    if (!hit) return;

    // [13/09/2026] NOVO — pedido verbatim: com "Pixel perfect" marcado
    // (`raycastPrecision === 'pixelperfect'`), o objeto em destaque/mira
    // (o único conceito de "selecionado" que existe hoje no 3D — este app
    // não guarda um objeto "selecionado" persistente à parte do que a mira
    // está tocando; ver `hoverPick`/`_tryPick` acima) deve ganhar um
    // CONTORNO PONTILHADO seguindo a silhueta externa 2D dele, estilo
    // "seleção" de jogos (The Sims/Minecraft), via pós-processamento.
    //
    // TÉCNICA PEDIDA vs. TÉCNICA USADA (honestidade, histórico): o usuário
    // descreveu literalmente uma Outline Pass via Custom Shader — renderizar
    // o objeto numa máscara/render target à parte, detectar bordas com
    // Sobel/Laplacian, e aplicar o padrão pontilhado em função de
    // `gl_FragCoord`. Numa rodada anterior, sem acesso a navegador pra testar
    // um shader ao vivo, foi implementada por prudência uma versão
    // SIMPLIFICADA reaproveitando `_drawOutline2D` (fecho convexo 2D +
    // `ctx.setLineDash`, sem shader nenhum).
    //
    // [22/09/2026] Pedido explícito de retomar e implementar de verdade —
    // ver `_tryOutlineSobelPass`/`_ensureOutlineSobelResources`/
    // `_renderOutlineSobelPass` (mais abaixo): agora existe um pipeline REAL
    // de pós-processamento (máscara em render target próprio + `ShaderPass`
    // manual com kernel de Sobel + padrão pontilhado via `gl_FragCoord`,
    // adaptado à arquitetura "eye" do motor — three.js deste projeto
    // continua sem os módulos de `examples/jsm/postprocessing`, então o
    // "ShaderPass" é escrito à mão com `WebGLRenderTarget`+`ShaderMaterial`+
    // quad de tela cheia, sem depender deles). `_drawOutline2D` continua
    // existindo e agora é só o FALLBACK automático (`_tryOutlineSobelPass`
    // devolve `false` em qualquer erro) — nunca mais é o caminho principal
    // quando o pipeline Sobel funciona.
    //
    // Fica isolado: só entra neste `if` quando pixelperfect está ativo E
    // já existe um `hit` de mira (aborta antes disso, linha acima) — fora
    // dessas condições o comportamento é 100% o de antes (zero overhead,
    // zero mudança), exatamente como pedido.
    if (this._config.raycastPrecision === 'pixelperfect') {
      // [22/09/2026] Tenta o pipeline REAL de pós-processamento (Sobel +
      // pontilhado via shader, ver `_tryOutlineSobelPass`/comentário grande
      // em `_ensureOutlineSobelResources`) primeiro; qualquer falha (ou
      // alvo sem malha real, ex. chão/parede) cai automaticamente pro
      // contorno 2D aproximado de sempre — nunca fica sem contorno nenhum.
      if (!this._tryOutlineSobelPass(hit, camera)) this._drawOutline2D(hit, camera);
      return;
    }

    const style = this._config.raycastHighlightStyle;
    if (style === 'outline2d') {
      this._drawOutline2D(hit, camera);
      return;
    }
    if (style === 'tightbox') {
      // Reusa a MESMA técnica já usada pras paredes (caixa "justa" orientada
      // ao redor do alvo) — só que agora pra QUALQUER tipo de alvo (chão/
      // parede/item/câmera/objeto), usando o obb calculado em setScene/
      // hoverPick pra cada um. Só a malha _hoverWall é usada aqui (as
      // outras duas ficam sempre escondidas neste estilo).
      if (!hit.obb) return; // segurança — nunca deve faltar, mas evita quebrar o quadro se faltar
      this._hoverWall.visible = true;
      this._hoverWall.scale.set(Math.max(hit.obb.half.x * 2.05, 0.02), Math.max(hit.obb.half.y * 2.05, 0.02), Math.max(hit.obb.half.z * 2.05, 0.02));
      this._hoverWall.position.set(hit.center.x, hit.center.y, hit.center.z);
      this._hoverWall.rotation.y = hit.obb.rotY || 0;
      return;
    }

    // Estilo padrão 'hitbox' — destaque específico por tipo, como já era.
    if (hit.type === 'floor') {
      this._hoverTile.visible = true;
      this._hoverTile.scale.set(hit.tileSize, hit.tileSize, 1);
      // 1cm acima do chão de verdade — evita "z-fighting" (as duas
      // superfícies coincidindo exatamente e piscando/se misturando).
      this._hoverTile.position.set(hit.x, 0.01, hit.z);
    } else if (hit.type === 'wall') {
      this._hoverWall.visible = true;
      // Levemente maior que a parede real, pra "envolver" ela e ficar
      // visível sem cravar exatamente na mesma superfície (mesmo motivo do
      // deslocamento de 1cm do ladrilho do chão, acima) — bem sutil (1-2%),
      // mais suave que antes.
      this._hoverWall.scale.set(hit.half.x * 2.05, hit.half.y * 2.015, hit.half.z * 2.015);
      this._hoverWall.position.set(hit.center.x, hit.center.y, hit.center.z);
      this._hoverWall.rotation.y = hit.rotY;
    } else {
      this._hoverPick.visible = true;
      // Bug relatado pelo usuário: no estilo 'hitbox' (o padrão), o destaque
      // de item/câmera/objeto era sempre um CUBO genérico do mesmo "raio"
      // aproximado (`hit.radius`, usado só pra decidir a distância de corte
      // do raycast) — uma mesa grande e uma luminária pequena ficavam com a
      // MESMA forma de destaque, sem refletir o tamanho real de cada uma.
      // `hit.obb.half`/`hit.obb.rotY` (mesmos dados que o estilo 'tightbox'
      // já usa acima, calculados por item em setScene) dão a caixa e a
      // orientação REAIS do alvo — usa-os aqui também, só que com a MESMA
      // margem/aparência (levemente maior + wireframe) que este estilo
      // sempre teve, em vez de reduzir tudo a uma esfera/cubo aproximado.
      if (hit.obb) {
        const half = hit.obb.half;
        this._hoverPick.scale.set(Math.max(half.x * 2.15, 0.03), Math.max(half.y * 2.15, 0.03), Math.max(half.z * 2.15, 0.03));
        this._hoverPick.rotation.y = hit.obb.rotY || 0;
      } else {
        // segurança — nunca deve faltar (todo pickable tem obb, ver
        // Engine3D.pickables), mas evita quebrar o quadro se algum novo
        // tipo de alvo esquecer de preencher obb no futuro.
        const r = hit.radius * 1.15;
        this._hoverPick.scale.set(r, r, r);
        this._hoverPick.rotation.y = 0;
      }
      this._hoverPick.position.set(hit.pos.x, hit.pos.y, hit.pos.z);
    }
  }

  /** Gera os pontos de amostra, em espaço LOCAL (antes da rotação/translação
   *  pro mundo), que definem o contorno de cada forma — usado por
   *  _drawOutline2D pra desenhar a polilinha certa por tipo de malha, não só
   *  uma caixa. Como todas as formas usadas neste app são CONVEXAS (caixa,
   *  cilindro, cone/pirâmide), o fecho convexo 2D da projeção desses pontos
   *  é EXATAMENTE o contorno real do objeto na tela — não uma aproximação. */
  _outlineLocalPoints(shape, half, segments) {
    const pts = [];
    if (shape === 'cylinder') {
      const n = Math.max(6, Math.min(24, segments || 14));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * half.x, z = Math.sin(a) * half.z;
        pts.push({ x, y: half.y, z }, { x, y: -half.y, z });
      }
    } else if (shape === 'cone') {
      const n = Math.max(6, Math.min(24, segments || 14));
      pts.push({ x: 0, y: half.y, z: 0 }); // ápice
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push({ x: Math.cos(a) * half.x, y: -half.y, z: Math.sin(a) * half.z });
      }
    } else if (shape === 'pyramid4') {
      pts.push({ x: 0, y: half.y, z: 0 }); // ápice
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push({ x: sx * half.x, y: -half.y, z: sz * half.z });
    } else {
      // 'box' (padrão) — 8 cantos.
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        pts.push({ x: sx * half.x, y: sy * half.y, z: sz * half.z });
      }
    }
    return pts;
  }

  /** Fecho convexo 2D (monotone chain) — usado por _drawOutline2D pra
   *  transformar a nuvem de pontos projetados na tela numa polilinha fechada
   *  em volta do contorno real, em vez de um simples retângulo. */
  _convexHull2D(points) {
    const pts = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  /** Estilo de destaque "outline2d": em vez de uma malha 3D, desenha uma
   *  polilinha pontilhada num canvas 2D sobreposto (_outlineCanvas) contornando
   *  a PROJEÇÃO NA TELA da forma real do alvo (caixa/cilindro/cone/pirâmide,
   *  conforme hit.obb.shape) — não mais um simples retângulo delimitador.
   *  Gera pontos de amostra em volta da forma (_outlineLocalPoints), projeta
   *  cada um (mundo -> tela, via Vector3.project) e desenha o fecho convexo
   *  2D deles (_convexHull2D), que para formas convexas É o contorno exato.
   *  Se qualquer ponto estiver ATRÁS da câmera (pode acontecer bem de perto,
   *  com alvos grandes), desiste do quadro inteiro — a projeção de um ponto
   *  atrás do observador "dobra" pro lado oposto da tela e desenharia um
   *  contorno errado por engano. */
  _drawOutline2D(hit, camera) {
    if (!this._outlineCtx || !hit.obb || !hit.center) return;
    const THREE = this.THREE;
    const w = this._outlineCanvas.width, hgt = this._outlineCanvas.height;
    if (!w || !hgt) return;
    const { half, rotY, shape, segments } = hit.obb;
    const c = Math.cos(rotY || 0), s = Math.sin(rotY || 0);
    const dir = cameraForward(camera);
    const localPts = this._outlineLocalPoints(shape, half, segments);
    const screenPts = [];
    for (const lp of localPts) {
      const wx = lp.x * c + lp.z * s, wz = -lp.x * s + lp.z * c;
      const px = hit.center.x + wx, py = hit.center.y + lp.y, pz = hit.center.z + wz;
      const toCorner = { x: px - camera.x, y: py - camera.y, z: pz - camera.z };
      if (toCorner.x * dir.x + toCorner.y * dir.y + toCorner.z * dir.z <= 0.05) return; // ponto atrás da câmera — desiste do quadro
      const v = new THREE.Vector3(px, py, pz).project(this.camera3);
      screenPts.push({ x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * hgt });
    }
    if (screenPts.length < 3) return;
    const hull = this._convexHull2D(screenPts);
    if (hull.length < 2) return;
    const ctx = this._outlineCtx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,242,117,0.85)';
    ctx.lineWidth = Math.max(1, Math.min(2, w / 480));
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(hull[0].x, hull[0].y);
    for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  /** [22/09/2026] NOVO — pedido verbatim (retomado): "Sobre o pontilhado na
   *  silhueta do objeto, se conseguir, implemente." — implementação REAL da
   *  técnica descrita originalmente pelo usuário ("Pós-processamento com
   *  Custom Shader (Outline Pass) [...] filtro de detecção de borda (Sobel/
   *  Laplacian Kernel) [...] padrão pontilhado com base na posição da tela
   *  fmod(gl_FragCoord.x, dashSize)"), substituindo o contorno 2D aproximado
   *  (`_drawOutline2D`, acima) sempre que possível — que continua existindo
   *  e vira o FALLBACK automático (ver `_tryOutlineSobelPass`, chamado por
   *  `_updateHoverHighlight`) se este pipeline falhar por qualquer motivo.
   *
   *  ARQUITETURA (adaptada à arquitetura "eye" já existente do motor — TODA
   *  instância de Engine3D usa `{eye:true}`, ver comentário grande no
   *  construtor: a imagem final não vai pro WebGL diretamente, é lida de
   *  volta pra CPU via `readRenderTargetPixels` e composta em cima de um
   *  `<canvas>` 2D visível, `_presentToCanvas`. Este pipeline segue
   *  EXATAMENTE o mesmo padrão já usado por `_renderGlassOnlyPass`/
   *  `_renderBackdropEnvPass`: um passe GPU extra, à parte, cujo resultado é
   *  lido pra CPU e composto por cima com `drawImage`):
   *
   *  1) `_ensureOutlineSobelResources` (lazy, uma vez só, sob demanda —
   *     nunca aloca nada enquanto pixelperfect não é usado) cria:
   *     - `maskScene`/`maskRT`: uma CENA AUXILIAR mínima (nunca a cena
   *       principal) que só recebe, a cada quadro, CLONES das malhas reais
   *       do objeto em mira (mesmas malhas de `this._pickMeshes`, na pose
   *       exata de agora) com um material branco-sólido
   *       (`MeshBasicMaterial` — a técnica nativa `scene.overrideMaterial`
   *       funcionaria igual aqui, mas manter uma cena isolada e pequena é
   *       mais barato do que aplicar/desfazer override na cena principal
   *       inteira todo quadro). Fundo preto → máscara branco-no-preto.
   *     - `quadScene`/`quadCamera`/`quadMesh`/`quadRT`: o "ShaderPass"
   *       manual pedido — um quad de tela cheia (`PlaneGeometry(2,2)` +
   *       `OrthographicCamera(-1,1,1,-1,0,1)`) com um `ShaderMaterial`
   *       próprio que roda o kernel de Sobel (8 vizinhos da máscara) e,
   *       nas bordas encontradas, aplica o padrão pontilhado via
   *       `gl_FragCoord` — ver o GLSL abaixo pra mais detalhes.
   *  2) `_renderOutlineSobelPass` roda os dois passes por quadro (máscara →
   *     Sobel+pontilhado), lê o resultado pra CPU e compõe por cima do
   *     canvas OVERLAY 2D já existente (`this._outlineCanvas`/`_outlineCtx`
   *     — o MESMO canvas que `_drawOutline2D` já usava, nunca o canvas
   *     principal do WebGL) via `putImageData`+`drawImage` — assim não
   *     precisa se preocupar com a ORDEM em relação a `_presentFrame()`
   *     (que já reescreve o canvas principal inteiro todo quadro): o
   *     overlay é sempre desenhado por cima, sempre depois, como já era.
   *  3) `renderer.autoClear`: NUNCA é tocado por este pipeline — cada passe
   *     usa `renderer.setRenderTarget(alvo)`+`renderer.render(...)`, que
   *     limpa/escreve só naquele render target próprio, isolado do canvas
   *     principal; `finally` garante `setRenderTarget(null)` de volta
   *     mesmo se o passe do meio falhar, e a cor de limpeza do renderer
   *     compartilhado é salva/restaurada (ela É global, ao contrário do
   *     render target).
   *  4) Redimensionamento: `_resize()` (mesmo handler de sempre, ramo
   *     "eye") redimensiona `maskRT`/`quadRT`/o buffer de leitura junto com
   *     os outros render targets da instância, só quando já existem
   *     (nunca força a criação lazy).
   *  5) FALLBACK: `_tryOutlineSobelPass` (chamado por
   *     `_updateHoverHighlight`) envolve TUDO isto em try/catch — qualquer
   *     erro (falha de compilação do shader, WebGL sem suporte a algo,
   *     etc.) é logado (`console.warn('[Engine3D] pipeline de contorno
   *     Sobel falhou...')`), marca `this._outlineSobelUnavailable = true`
   *     (não tenta de novo nos próximos quadros — sem overhead repetido de
   *     tentativa-e-erro) e devolve `false`, fazendo `_updateHoverHighlight`
   *     cair automaticamente de volta pro `_drawOutline2D` de sempre — a
   *     cena NUNCA fica sem contorno nenhum nem trava por causa disto.
   *
   *  LIMITAÇÃO honesta (documentada, aceita conscientemente): a máscara é
   *  renderizada numa cena isolada contendo SÓ o objeto em mira (sem o
   *  resto do cenário) — a silhueta detectada pelo Sobel não é ocluída por
   *  outros objetos reais na frente dele (ao contrário do `_drawOutline2D`
   *  antigo, que também não fazia isso, então não é uma regressão). Cobrir
   *  oclusão de verdade exigiria renderizar a CENA PRINCIPAL inteira com
   *  `overrideMaterial` branco só no alvo e preto/oculto no resto — mais
   *  caro por quadro e fora do pedido original ("funciona perfeitamente
   *  para qualquer formato 3D complexo sem criar geometrias extras", que já
   *  está satisfeito por este pipeline). */
  _ensureOutlineSobelResources() {
    if (this._outlineSobel) return this._outlineSobel;
    const THREE = this.THREE;
    const w = Math.max(1, this._rtPixelW || 1);
    const h = Math.max(1, this._rtPixelH || 1);
    const maskScene = new THREE.Scene();
    const maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const maskRT = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    const quadScene = new THREE.Scene();
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // GLSL ES 1.00 (WebGL1) — MESMA versão implícita de todo `ShaderMaterial`
    // do three.js sem `glslVersion` setado (não há nenhum outro
    // `ShaderMaterial` neste projeto pra confirmar convenção local, mas é o
    // PADRÃO da própria biblioteca — `attribute`/`varying`/`texture2D`, não
    // `in`/`out`/`texture` de GLSL3).
    const quadMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tMask: { value: maskRT.texture },
        texel: { value: new THREE.Vector2(1 / w, 1 / h) },
        threshold: { value: 0.35 },
        dashSize: { value: 9.0 },
        outlineColor: { value: new THREE.Color(0xfff275) },
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = vec4(position.xy, 0.0, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D tMask;',
        'uniform vec2 texel;',
        'uniform float threshold;',
        'uniform float dashSize;',
        'uniform vec3 outlineColor;',
        'float lum(vec2 uv) {',
        '  return texture2D(tMask, uv).r;',
        '}',
        'void main() {',
        '  float tl = lum(vUv + texel * vec2(-1.0,  1.0));',
        '  float tc = lum(vUv + texel * vec2( 0.0,  1.0));',
        '  float tr = lum(vUv + texel * vec2( 1.0,  1.0));',
        '  float ml = lum(vUv + texel * vec2(-1.0,  0.0));',
        '  float mr = lum(vUv + texel * vec2( 1.0,  0.0));',
        '  float bl = lum(vUv + texel * vec2(-1.0, -1.0));',
        '  float bc = lum(vUv + texel * vec2( 0.0, -1.0));',
        '  float br = lum(vUv + texel * vec2( 1.0, -1.0));',
        '  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;',
        '  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;',
        '  float edge = sqrt(gx * gx + gy * gy);',
        '  if (edge <= threshold) { discard; }',
        '  float fase = mod(gl_FragCoord.x + gl_FragCoord.y, dashSize * 2.0);',
        '  if (fase >= dashSize) { discard; }',
        '  gl_FragColor = vec4(outlineColor, 1.0);',
        '}',
      ].join('\n'),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMaterial);
    quadMesh.frustumCulled = false;
    quadScene.add(quadMesh);
    const quadRT = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this._outlineSobel = { maskScene, maskMat, maskRT, quadScene, quadCamera, quadMesh, quadMaterial, quadRT, w, h, pixelBuffer: new Uint8Array(w * h * 4) };
    return this._outlineSobel;
  }

  /** Roda os 2 passes (máscara → Sobel+pontilhado) e compõe o resultado por
   *  cima do canvas overlay 2D (`_outlineCanvas`) — ver comentário grande em
   *  `_ensureOutlineSobelResources` pra arquitetura completa. `meshes` são
   *  as malhas REAIS (de `this._pickMeshes`) do objeto em mira, já filtradas
   *  por `_tryOutlineSobelPass`. Devolve `true` em caso de sucesso. Lança
   *  (não captura) em caso de erro — `_tryOutlineSobelPass` é quem captura e
   *  aciona o fallback. */
  _renderOutlineSobelPass(res, meshes) {
    const THREE = this.THREE;
    if (res.w !== (this._rtPixelW || res.w) || res.h !== (this._rtPixelH || res.h)) {
      // Segurança extra: se por algum motivo `_resize()` ainda não rodou
      // pra este quadro (ex.: primeiro quadro depois de reabrir o 3D),
      // realinha aqui também — nunca lê/escreve um buffer do tamanho
      // errado.
      const w = Math.max(1, this._rtPixelW || res.w), h = Math.max(1, this._rtPixelH || res.h);
      res.maskRT.setSize(w, h);
      res.quadRT.setSize(w, h);
      res.quadMaterial.uniforms.texel.value.set(1 / w, 1 / h);
      res.pixelBuffer = new Uint8Array(w * h * 4);
      res.w = w; res.h = h;
    }
    while (res.maskScene.children.length) res.maskScene.remove(res.maskScene.children[0]);
    meshes.forEach((m) => {
      const clone = new THREE.Mesh(m.geometry, res.maskMat);
      clone.position.copy(m.position);
      clone.rotation.copy(m.rotation);
      clone.scale.copy(m.scale);
      res.maskScene.add(clone);
    });
    const prevClearColor = new THREE.Color();
    this.renderer.getClearColor(prevClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();
    try {
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.setRenderTarget(res.maskRT);
      this.renderer.setViewport(0, 0, res.w, res.h);
      this.renderer.render(res.maskScene, this.camera3);
      res.quadMaterial.uniforms.tMask.value = res.maskRT.texture;
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setRenderTarget(res.quadRT);
      this.renderer.setViewport(0, 0, res.w, res.h);
      this.renderer.render(res.quadScene, res.quadCamera);
      Engine3D._sharedRenderer.readRenderTargetPixels(res.quadRT, 0, 0, res.w, res.h, res.pixelBuffer);
    } finally {
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(prevClearColor, prevClearAlpha);
    }
    const w = this._outlineCanvas.width, h = this._outlineCanvas.height;
    if (!w || !h) return false;
    const imgData = new ImageData(new Uint8ClampedArray(res.pixelBuffer.buffer, res.pixelBuffer.byteOffset, res.pixelBuffer.length), res.w, res.h);
    this._rtOffCtx.putImageData(imgData, 0, 0);
    const ctx = this._outlineCtx;
    ctx.save();
    // A imagem lida do render target vem em resolução de DISPOSITIVO
    // (`res.w × res.h`, já multiplicada pelo dpr — ver `_resize`), e com a
    // linha 0 correspondendo ao canto INFERIOR (convenção OpenGL) — mesma
    // inversão vertical já feita em `_presentToCanvas` pro canvas
    // principal, necessária aqui pelo MESMO motivo. `drawImage` com
    // retângulo de origem/destino faz o reescalonamento pra resolução CSS
    // (`w × h`) do overlay sozinho.
    ctx.setTransform(1, 0, 0, -1, 0, h);
    ctx.drawImage(this._rtOffscreen, 0, 0, res.w, res.h, 0, 0, w, h);
    ctx.restore();
    return true;
  }

  /** Ponto de entrada chamado por `_updateHoverHighlight` quando
   *  `raycastPrecision === 'pixelperfect'`: tenta o pipeline Sobel de
   *  verdade (acima); em qualquer falha — inclusive "este tipo de alvo não
   *  tem malha real registrada", caso de chão/parede — devolve `false` e
   *  quem chamou cai pro `_drawOutline2D` de sempre. Ver comentário grande
   *  em `_ensureOutlineSobelResources` pro resto dos detalhes/fallback. */
  _tryOutlineSobelPass(hit, camera) {
    if (this._outlineSobelUnavailable) return false;
    if (!this._outlineCanvas || !this._outlineCtx || !this._rtOffCtx || !this._rtOffscreen) return false;
    const meshes = (this._pickMeshes || []).filter((m) => m.userData?.pick === hit);
    if (!meshes.length) return false; // chão/parede etc. não têm _pickMeshes — o 2D já cobre esses via hit.obb
    try {
      const res = this._ensureOutlineSobelResources();
      if (!res) return false;
      return this._renderOutlineSobelPass(res, meshes);
    } catch (e) {
      console.warn('[Engine3D] pipeline de contorno Sobel falhou, revertendo pro contorno 2D simples:', e);
      this._outlineSobelUnavailable = true;
      return false;
    }
  }

  /** Libera os recursos de GPU (contexto WebGL, geometrias, materiais,
   *  texturas) — chamado por View3D.unmount(). Sem isto, abrir/fechar a
   *  visualização 3D repetidamente vazaria contextos WebGL (o navegador só
   *  permite um número limitado de contextos abertos ao mesmo tempo — depois
   *  disso, os mais antigos são derrubados à força). */
  dispose() {
    this._ready = false;
    this._disposeGroupContents();
    this._pickMeshes = [];
    this._lodObjects = []; // NOVO (01/09/2026), item GRANDE #5 — as malhas em si já foram descartadas por _disposeGroupContents (ver ramo isLOD lá), isto só solta a referência da lista
    // Efeitos de remoção ainda em andamento (ver spawnCollectEffect/
    // spawnDemolishEffect) — sem isto, fechar o 3D no meio de uma animação
    // vazaria as malhas/materiais dela.
    (this._effects || []).forEach((fx) => fx.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }));
    this._effects = [];
    // Luzes de verdade das luminárias (ver _buildLuminariaMesh) — direto em
    // `this.scene`, fora de `_group`, mesmo motivo do reset em setScene.
    (this._dynamicLights || []).forEach((l) => this.scene?.remove(l));
    this._dynamicLights = [];
    // Sol/Lua (ver _buildCelestialBodies) — também direto em `this.scene`,
    // criados 1x fora de setScene/_group, então precisam ser liberados aqui
    // à parte, mesmo motivo dos outros itens deste dispose().
    [this._sunMesh, this._moonMesh].forEach((m) => {
      if (!m) return;
      this.scene?.remove(m);
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    });
    this._sunMesh = null; this._moonMesh = null;
    // Malhas de destaque do raycasting (_hoverTile/_hoverWall/_hoverPick) NÃO
    // fazem parte de `_group` (ficam vivas entre trocas de modo/mapa, só
    // reposicionadas — ver _updateHoverHighlight), então `_disposeGroupContents`
    // acima não as alcança; precisam ser liberadas aqui à parte.
    [this._hoverTile, this._hoverWall, this._hoverPick,
      this._ghostWall, this._ghostWallSeg, this._ghostObject, this._ghostItem, this._ghostDoorWindow].forEach((m) => {
      if (!m) return;
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    });
    // [22/09/2026] NOVO — `_ghostEscada` (ver comentário grande no
    // construtor) é um `THREE.Group` (vários degraus), não uma `Mesh`
    // única — não tem `.geometry`/`.material` PRÓPRIOS pra liberar aqui
    // (a lista acima só chamaria em vão, via optional chaining), precisa
    // percorrer os filhos, mesmo padrão já usado pro boneco-palito do
    // player logo abaixo.
    this._ghostEscada?.traverse?.((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    // Boneco-palito do player (ver _buildPlayerFigure) — um Group com várias
    // malhas dentro (tronco/cabeça/braços/pernas), também fora de `_group`
    // pelo mesmo motivo dos ghosts acima; percorre os filhos em vez de uma
    // lista fixa porque são vários.
    this._playerFigure?.root?.traverse?.((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    this._playerFigure = null;
    // Canvas 2D do estilo 'outline2d' (ver _initHoverHighlight) — criado à
    // parte do WebGL, então precisa ser removido do DOM manualmente aqui,
    // senão cada visita à tela 3D deixaria um <canvas> órfão sobreposto.
    this._outlineCanvas?.remove?.();
    this._outlineCanvas = null;
    this._outlineCtx = null;
    // Pipeline Sobel do contorno pontilhado (ver comentário grande em
    // `_ensureOutlineSobelResources`) — só existe se pixelperfect chegou a
    // ser usado nesta instância (lazy); libera os 2 render targets/o
    // material do shader, senão vazaria GPU a cada visita à tela 3D, mesmo
    // motivo de todo o resto deste dispose().
    if (this._outlineSobel) {
      this._outlineSobel.maskRT?.dispose?.();
      this._outlineSobel.quadRT?.dispose?.();
      this._outlineSobel.maskMat?.dispose?.();
      this._outlineSobel.quadMaterial?.dispose?.();
      this._outlineSobel.quadMesh?.geometry?.dispose?.();
      this._outlineSobel = null;
    }
    this._outlineSobelUnavailable = false;
    // REESCRITO (07/09/2026), arquitetura WebGLRenderTarget — ver "MODO EYE"
    // no construtor. Em modo "eye", `this.renderer` continua sendo
    // `Engine3D._sharedRenderer`, usado por QUALQUER OUTRO "olho" que ainda
    // esteja vivo — nunca chama dispose()/forceContextLoss() nele; só solta
    // a referência local. Toda a antiga complexidade de "limpar o retângulo
    // certo no canvas global compartilhado" (getBoundingClientRect na hora,
    // fallback pro último retângulo salvo, contagem de "olhos" vivos,
    // esconder o canvas global inteiro) deixou de existir: como cada "olho"
    // tem seu PRÓPRIO render target E seu PRÓPRIO canvas 2D de saída, não há
    // nenhum recurso compartilhado "sujo" pra limpar — basta descartar o
    // render target desta instância e limpar o SEU PRÓPRIO canvas 2D
    // (`clearRect`, direto, sem nenhuma conta de viewport/scissor/dpr).
    if (this._eye) {
      this.renderTarget?.dispose?.();
      this.renderTarget = null;
      if (this._displayCtx && this.canvas) {
        this._displayCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      this._displayCtx = null;
      this._rtOffscreen = null;
      this._rtOffCtx = null;
      this._fotoCamMask = null;
      this._rtPixelBuffer = null;
      this.renderer = null;
    } else {
      this.renderer?.dispose?.();
      this.renderer?.forceContextLoss?.();
      this.renderer = null;
    }
  }
}

window.Engine3D = Engine3D;
