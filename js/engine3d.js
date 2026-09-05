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

window.Cam3DMath = { rotY, rotX, cameraForward, cameraForwardFlat, cameraRightFlat, lerpAngle };

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
function buildSmoothedTriGeometry(THREE, verts, faces) {
  const tris = [];
  (faces || []).forEach((face) => {
    if (!face || face.length < 3) return;
    for (let k = 1; k < face.length - 1; k++) {
      const ia = face[0], ib = face[k], ic = face[k + 1];
      if (!verts[ia] || !verts[ib] || !verts[ic]) continue;
      tris.push([ia, ib, ic]);
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
  tris.forEach((t, ti) => {
    const nEste = triNormals[ti];
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
    });
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
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

  constructor(canvas, initialConfig) {
    this.canvas = canvas;
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
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this._config.antialiasing3D !== false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(this._pixelRatioCap());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

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
    this.camera3 = new THREE.PerspectiveCamera(72, 1, 0.1, Math.max(rd * 2.4, 60));
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
    return new THREE.Mesh(geo, mat);
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

    this._ghostItem = new THREE.Mesh(new THREE.ConeGeometry(0.26 * Math.SQRT2, 0.6, 4), ghostMat());
    this._ghostItem.visible = false;
    scene.add(this._ghostItem);

    this._ghostDoorWindow = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat());
    this._ghostDoorWindow.visible = false;
    scene.add(this._ghostDoorWindow);

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
    [this._ghostWall, this._ghostWallSeg, this._ghostWallSection, this._ghostObject, this._ghostItem, this._ghostDoorWindow, this._ghostSpringDot, this._ghostSnapSphere, this._protractorRing, this._footprintOutline, ...(this._guideLines || []), ...(this._footprintDrops || [])].forEach((m) => { if (m) m.visible = false; });
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

  showGhostObject(x, z, angulo, tipoKey, elevacao = 0) {
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

  _pixelRatioCap() {
    const teto = Engine3D.RESOLUCAO_DPR[this._config.resolucao3D] || Engine3D.RESOLUCAO_DPR.alta;
    return Math.min(window.devicePixelRatio || 1, teto);
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
    this.scene.add(this._sunMesh);

    const moonGeo = new THREE.SphereGeometry(1, 16, 12);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xd7deed, fog: false, toneMapped: false });
    this._moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this._moonMesh.visible = false;
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
    this._ambientLight.intensity = sky.amb;

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
      this.renderer.setPixelRatio(this._pixelRatioCap());
      // força o _resize() do próximo quadro a reaplicar mesmo sem o
      // tamanho do canvas ter mudado (ele só age quando w/h mudam)
      this._lastW = 0; this._lastH = 0;
    }
    if (this.scene?.fog && this.camera3) {
      const rd = this._renderDistance();
      this.scene.fog.near = this._fogNear(rd);
      this.scene.fog.far = rd;
      this.camera3.far = Math.max(rd * 2.4, 60);
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
        this._luzesLeves.push({ x: o.x, y: (o.piso || 0) * 2.8 + (o.elevacao || 0), z: o.y });
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
    }
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(centroX, 0, centroZ);
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
      // Pequeno deslocamento em Y evita "z-fighting" com o `floor` de baixo
      // (tremedeira de duas malhas coplanares disputando o mesmo pixel) —
      // pontos já em coordenadas de MUNDO (não locais), então a malha em si
      // fica na origem, só a altura Y é ajustada aqui.
      const floorGrid = new THREE.LineSegments(gridGeo, gridMat);
      floorGrid.position.set(0, 0.002, 0);
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
      const pisoY = (w.piso || 0) * 2.8;
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
      const pisoY = ((parentWallPD ? parentWallPD.piso : el.piso) || 0) * 2.8;
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
      if (kind === 'porta' && el.aberta) {
        // Porta ABERTA: a folha gira 90° a partir da DOBRADIÇA, igual ao
        // símbolo arquitetônico do 2D (_drawDoorShape — hinge num CANTO do
        // vão + arco de 90°, `el.abertura`: 'esquerda'|'direita' escolhe
        // qual ponta é fixa). Antes, a folha só ficava mais FINA quando
        // aberta, mas continuava centrada e paralela ao vão — bug relatado
        // pelo usuário: "está sendo renderizada no meio... no 2D as
        // dobradiças ficam no canto, não no meio". Agora: pivota no canto
        // certo (mesmo `abertura`) e gira 90°, ficando encostada na parede
        // (perpendicular ao vão) — sem colidir/tampar a passagem, coerente
        // com o buraco de verdade já cortado na parede (ver `openings`
        // acima) e com o pedido "se a porta estiver aberta, deve ser
        // possível entrar" (colisão em view3d.js também já respeita isso).
        const ang = pos.angulo || 0;
        const alongX = Math.cos(ang), alongY = Math.sin(ang); // ao longo da parede/vão
        const perpX = -Math.sin(ang), perpY = Math.cos(ang); // perpendicular — direção do giro ao abrir
        const hingeSign = el.abertura === 'esquerda' ? -1 : 1;
        const hingeX = pos.x + alongX * hingeSign * (largura / 2);
        const hingeZ = pos.y + alongY * hingeSign * (largura / 2);
        meshX = hingeX + perpX * (largura / 2);
        meshZ = hingeZ + perpY * (largura / 2);
        meshRotY = rotY + Math.PI / 2;
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
    };
    (mapData.portas || []).forEach((d) => buildDoorOrWindowMesh(d, 'porta'));
    (mapData.janelas || []).forEach((j) => buildDoorOrWindowMesh(j, 'janela'));

    // --- marcadores dos itens (pirâmides — cone de 4 lados = base quadrada) ---
    (mapData.itens || []).forEach((it) => {
      const baseY = (it.piso || 0) * 2.8;
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
      const baseY = (cam.piso || 0) * 2.8;
      const dirX = Math.cos(cam.angulo || 0), dirZ = Math.sin(cam.angulo || 0);
      const rotY = Math.atan2(dirX, dirZ); // mesma convenção das paredes (atan2(dx,dz))
      const matCam = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: 0x4fd1ff });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.16), matCam);
      body.position.set(cam.x, baseY + ALTURA_CAMERA, cam.y);
      body.rotation.y = rotY;
      this._group.add(body);
      const lens = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 10), matCam);
      lens.rotation.x = Math.PI / 2; // aponta a ponta do cone ao longo do +Z local...
      lens.rotation.y = rotY; // ...que esta rotação leva pra direção (dirX,dirZ) do mundo
      lens.position.set(cam.x + dirX * 0.18, baseY + ALTURA_CAMERA, cam.y + dirZ * 0.18);
      this._group.add(lens);
      const camPos = { x: cam.x, y: baseY + ALTURA_CAMERA, z: cam.y };
      const camPick = { id: cam.id, type: 'camera', pos: camPos, center: camPos, radius: 0.3, ref: cam, obb: { half: { x: 0.11, y: 0.08, z: 0.08 }, rotY, shape: 'box' } };
      this.pickables.push(camPick);
      body.userData.pick = camPick;
      lens.userData.pick = camPick;
      this._pickMeshes.push(body, lens);
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
      const baseY = (foto.piso || 0) * 2.8 + (foto.altura || 0);
      const dir = cameraForward({ yaw: foto.dirAngulo || 0, pitch: foto.rotPerp || 0 });
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
      const meio = { x: foto.x + dir.x * 0.16, y: baseY + dir.y * 0.16, z: foto.y + dir.z * 0.16 };
      cone.position.set(meio.x, meio.y, meio.z);
      // Orienta o cone (ponta em +Y local) pra apontar em `dir`: yaw em
      // torno de Y (atan2 no plano XZ) seguido de um "pitch" que inclina o
      // eixo do cone pra cima/baixo — mesma ideia de `cameraForward`, só
      // invertida (de vetor -> ângulos) pra alimentar `cone.rotation`.
      const yawCone = Math.atan2(dir.x, dir.z);
      const planoXZ = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
      const pitchCone = Math.atan2(dir.y, planoXZ);
      cone.rotation.order = 'YXZ';
      cone.rotation.y = yawCone;
      cone.rotation.x = -pitchCone;
      this._group.add(orb, cone);

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
      // reconstruções de cena — ver comentário grande lá) e MESMO padrão de
      // pickable+obb da câmera logo acima (raycasting/seleção via
      // `Engine3D.pickFromRay`, tratado em view3d.js `_tryPick`, tipo
      // 'fotoPin' — ver `_showFotoPinCard3D`). Tamanho fixo (não lê a
      // proporção real da imagem — mesma simplificação documentada em
      // outros pontos deste arquivo, "sem navegador pra calibrar
      // visualmente"): 0,42m x 0,3m (~4:3), plano o bastante pra não
      // atravessar paredes próximas na maioria dos casos.
      if (foto.thumbDataUrl || foto.dataUrl) {
        const FW = 0.42, FH = 0.3;
        const texFoto = new THREE.TextureLoader().load(foto.thumbDataUrl || foto.dataUrl);
        const matPlaca = new THREE.MeshBasicMaterial({ map: texFoto, color: 0xffffff, side: THREE.DoubleSide, transparent: true });
        const placa = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), matPlaca);
        placa.position.set(foto.x, baseY, foto.y);
        // MESMA composição de rotação do cone acima (yaw em Y, depois pitch
        // em X, ordem 'YXZ') — a normal padrão do PlaneGeometry (+Z local)
        // fica alinhada a `dir`, então o cone (que sai do centro na direção
        // `dir`) aparece bem na frente da foto, "saindo" dela.
        placa.rotation.order = 'YXZ';
        placa.rotation.y = yawCone;
        placa.rotation.x = -pitchCone;
        this._group.add(placa);
        const fotoPos = { x: foto.x, y: baseY, z: foto.y };
        const fotoPick = { id: foto.id, type: 'fotoPin', pos: fotoPos, center: fotoPos, radius: Math.max(FW, FH) * 0.7, ref: foto };
        this.pickables.push(fotoPick);
        placa.userData.pick = fotoPick;
        this._pickMeshes.push(placa);
      }
    });

    // --- objetos: forma simples por categoria (ver OBJECT3D_PROFILES acima),
    // OU uma forma desenhada (obj.forma: 'retangulo'|'poligono', ver
    // mapview.js._pickObjectType/_openObjectPanel) — nesse caso o "perfil" é
    // montado na hora a partir dos campos do próprio objeto (largura/
    // profundidade ou raio/lados, altura, cor) em vez de vir da tabela fixa. ---
    (mapData.objects || []).forEach((obj) => this._buildOneObjectMesh(obj, wireframe, colWireframe));

    // Pedido do usuário: "deve haver modos híbridos de visualização" — os
    // dois PÓS-PASSOS abaixo varrem `this._group` já pronto (todas as malhas
    // já construídas normalmente pelos blocos acima) em vez de espalhar
    // lógica extra em cada ponto que cria uma malha — mais simples e nunca
    // fica desatualizado se um novo tipo de malha for adicionado depois.
    if (wireframe) this._addWireframeOcclusion();
    if (this.mode === 'hibrido') this._setupHybridMeshes();
    this._setupCullMeshes();
    this._setupWallOcclusionMeshes();
  }

  /** Constrói a malha de UM objeto e a registra em `this._group`/
   *  `this.pickables`/`this._pickMeshes` — corpo do laço `mapData.objects`
   *  de `setScene` acima, extraído pra um método próprio (pedido do
   *  usuário, 25/08/2026 — ver `addObjectIncremental` logo abaixo) pra
   *  poder ser chamado tanto dali (montagem da cena INTEIRA) quanto na
   *  colocação incremental de UM objeto novo, sem duplicar a lógica. */
  _buildOneObjectMesh(obj, wireframe, colWireframe) {
    const THREE = this.THREE;
    // `obj.elevacao` (metros ACIMA do chão do piso, distinto de `obj.piso`
    // que é o NÚMERO do piso/andar) — pedido do usuário: "ao mirar em cima
    // da mesa, deve ser possível colocar coisas em cima dela" (a mira
    // manda a altura de onde bateu, ver view3d.js raycastSurface) e
    // "a luminária... por padrão, ela fica a 3 metros do chão" (ver
    // Mapping.addObject). 0 por padrão = comportamento de sempre (chão).
    const baseY = (obj.piso || 0) * 2.8 + (obj.elevacao || 0);
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
      // (h, sempre 0.5m de `_reticuloStamp()`, nunca editável no 2D pra
      // este tipo de objeto) é sobrescrita pra 1mm, virando uma "placa"
      // fina em vez de um bloco de meio metro.
      if (obj.reticuloMetrico) perfil.h = 0.001;
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
    let geo;
    if (perfil.shape === 'cylinder') geo = new THREE.CylinderGeometry(perfil.r, perfil.r, perfil.h, perfil.segments || 14);
    else if (perfil.shape === 'cone') geo = new THREE.ConeGeometry(perfil.r, perfil.h, 14);
    else geo = new THREE.BoxGeometry(perfil.w, perfil.h, perfil.d);
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
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
    this._buildOneObjectMesh(obj, wireframe, colWireframe);
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
      this._cullMeshes.push({ mesh: m, x: p.x, z: p.z });
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
    const rd = this._renderDistance();
    const modo = this._config.objetoRenderModo || 'objeto';
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
        chunk.items.forEach((m) => { m.visible = visivel; });
      });
    } else {
      lista.forEach((c) => { c.mesh.visible = Math.hypot(c.x - camera.x, c.z - camera.z) <= rd; });
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
  _buildCustomMeshObject(obj, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const cm = obj.customMesh;
    const verts = cm.vertices;
    const xf = obj.customMeshXform || {};
    // CORRIGIDO (01/09/2026) — ver comentário grande em buildSmoothedTriGeometry
    // (topo do arquivo): normais agora suavizadas por ângulo de vinco, em vez
    // de sempre facetadas por triângulo isolado.
    let geo = buildSmoothedTriGeometry(THREE, verts, cm.faces || []);
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
      : new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
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
  _buildMoldeMesh(meshData, wireframe, colWireframe, color) {
    const THREE = this.THREE;
    const verts = meshData.vertices || [];
    // CORRIGIDO (01/09/2026) — ver comentário grande em buildSmoothedTriGeometry.
    let geo = buildSmoothedTriGeometry(THREE, verts, meshData.faces || []);
    if (!geo.attributes.position) {
      geo = new THREE.BoxGeometry(0.02, 0.02, 0.02); // molde vazio/quebrado — ponto minúsculo em vez de travar a cena (mesmo critério de _buildCustomMeshObject)
    }
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
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
      lod.addLevel(this._buildMoldeMesh(detalhado, wireframe, colWireframe, color), 0);
      lod.addLevel(this._buildMoldeMesh(lowpoly, wireframe, colWireframe, color), 12);
      raiz = lod;
    } else {
      raiz = this._buildMoldeMesh(detalhado || lowpoly, wireframe, colWireframe, color);
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

  _buildMesaMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const w = perfil.w || 1.2, d = perfil.d || 0.6, h = perfil.h || 0.72;
    const tampoEsp = Math.max(0.03, Math.min(0.06, h * 0.08));
    const pernaEsp = Math.max(0.03, Math.min(0.06, Math.min(w, d) * 0.07));
    const margem = pernaEsp * 1.2; // perna encostada pra DENTRO da quina, não bem na borda (evita "vazar" pro lado de fora do tampo)
    const pernaAltura = Math.max(0.05, h - tampoEsp);
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const rotY = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const meshes = [];
    const tampo = new THREE.Mesh(new THREE.BoxGeometry(w, tampoEsp, d), mat);
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
      const perna = new THREE.Mesh(pernaGeo, mat);
      perna.position.set(wx, baseY + pernaAltura / 2, wz);
      perna.rotation.y = rotY;
      meshes.push(perna);
    });
    meshes.forEach((m) => this._group.add(m));
    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    meshes.forEach((m) => { m.userData.pick = objPick; this._pickMeshes.push(m); });
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
  _buildEscadaMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const largura = Math.max(0.05, obj.largura || perfil.w || 1.3);
    const profundidadeTotal = Math.max(0.05, obj.profundidade || perfil.d || 3.0);
    const alturaTotal = 2.0; // fixa — pedido explícito do usuário, ignora obj.altura de propósito
    const degraus = Math.max(1, Math.round(obj.escadaDegraus) || 11);
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
    if (!data || !data.positions || data.positions.length < 9) return false;
    const THREE = this.THREE;
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
      this.scene.add(luz);
      this._dynamicLights = this._dynamicLights || [];
      this._dynamicLights.push(luz);
    }
  }

  /** Remove e descarta (geometria/material — NÃO a textura do chão nem a do
   *  vidro "Minecraft", reutilizadas entre reconstruções, ver
   *  _glassShineTexture/_buildGlassPane) todo mundo do grupo da cena. */
  _disposeGroupContents() {
    if (!this._group) return;
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
    if (!window.Modeler3D?.isActive?.()) this._updateHoverHighlight(camera);
    // NOVO (01/09/2026), item GRANDE #5, decisão do usuário (AskUserQuestion):
    // "Automático por distância" — precisa ser chamado todo quadro (API do
    // próprio THREE.LOD: `.update(camera)` decide qual nível fica visível
    // comparando a distância até a câmera; sem chamar isto, o LOD nunca troca
    // de nível sozinho). `this.camera3` já está na posição/mira certa deste
    // quadro (setadas/atualizadas logo acima). Lista normalmente vazia
    // (nenhum tipo customizado nos dois níveis ainda) — custo zero nesse caso.
    (this._lodObjects || []).forEach((lod) => lod.update(this.camera3));
    this._updateDistanceCulling(camera);
    this._updateItemBadgeOcclusion(camera);
    this._updateEffects();
    this.renderer.render(this.scene, this.camera3);
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
      // apoiar algo em cima.
      const alvos = this._pickMeshes.filter((m) => m.userData?.pick?.type === 'object');
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
        const t = m.userData?.pick?.type;
        // 'fotoPin' incluído (03/09/2026) — ver o retângulo texturizado da
        // foto no bloco "fotos vinculadas ao mapa" de setScene, acima.
        return t === 'item' || t === 'camera' || t === 'object' || t === 'fotoPin';
      });
      const hits = this._raycaster.intersectObjects(alvos, false);
      return hits.length ? hits[0].object.userData.pick : null;
    }
    let best = null, bestT = Infinity;
    for (const p of this.pickables) {
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
  _hoverPickPixelPerfect(camera) {
    if (!this._raycaster || !this._pickMeshes?.length) return null;
    const THREE = this.THREE;
    const ray = this.centerRay(camera);
    this._raycaster.set(
      new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z),
      new THREE.Vector3(ray.dir.x, ray.dir.y, ray.dir.z).normalize(),
    );
    const hits = this._raycaster.intersectObjects(this._pickMeshes, false);
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
  hoverPick(camera) {
    if (!this._ready || !this.mapData) return null;
    if (this._config.raycastPrecision === 'pixelperfect') return this._hoverPickPixelPerfect(camera);
    const ray = this.centerRay(camera);
    let best = null, bestT = Infinity;
    for (const p of this.pickables) {
      const t = this._rayPickableT(p, ray.origin, ray.dir); // ver comentário em _rayPickableT — caixa justa, não esfera inchada
      if (t !== null && t < bestT) { bestT = t; best = { type: p.type, ref: p.ref, radius: p.radius, pos: p.pos, center: p.pos, obb: p.obb, t }; }
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
    const hit = this.hoverPick(camera);
    if (!hit) return;

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
    this.renderer?.dispose?.();
    this.renderer?.forceContextLoss?.();
    this.renderer = null;
  }
}

window.Engine3D = Engine3D;
