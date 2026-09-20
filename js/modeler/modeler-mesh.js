/**
 * modeler-mesh.js — Modelador 3D: estruturas de DADOS da malha (vértices/
 * arestas/faces) e as operações de edição (extrudar, inset, subdividir,
 * make edge/face, excluir, duplicar, cubo padrão). Parte da modularização
 * pedida pelo usuário (28/08/2026): "Modularize o Modelador para que, tudo
 * que seja relacionado a ele, esteja em arquivos separados em relação ao
 * restante do projeto. De modo que funcione em 'file:///'." — script
 * clássico, sem import/export ES module (só `window.ModelerMesh = ...` no
 * fim, igual todo módulo deste app), carregado via `<script>` simples (ver
 * index.html) — nenhum caminho que quebraria sob file:///.
 *
 * Todas as funções aqui recebem `state` (o objeto de estado compartilhado da
 * sessão do modelador, criado por modeler-core.js) como PRIMEIRO argumento e
 * operam em `state.cm` ({vertices,edges,faces} — cópia de trabalho local do
 * `obj.customMesh`) e `state.sel`/`state.selOrder` — nunca mexem em nada de
 * Three.js diretamente (isso é responsabilidade de modeler-render.js), exceto
 * `rebuildMeshGeometry`, que precisa de `state.THREE`/`state.meshObj` pra
 * reconstruir a malha SÓLIDA (a parte "de verdade", renderizada com luz) —
 * o restante do visual (wireframe/pontos/destaques) é 100% overlay 2D, ver
 * modeler-render.js.
 */

const ModelerMesh = {
  // ---------- Malha padrão (cubo unitário) ----------
  /** `centered`: pedido do usuário (28/08/2026) — "Assim como no blender, ao
   *  inserir o cubo, o centro dele deve ser no meio do cubo. Não apenas no
   *  centro da base como é atualmente" (opção "Origem no centro do cubo",
   *  seção "🧊 Cubo" das configurações 3D, ver mapconfig.js
   *  DEFAULTS.cuboOrigemCentro). `false` (padrão antigo): base em y=0, topo
   *  em y=h — a ORIGEM local (0,0,0) fica na base. `true`: base em y=-h/2,
   *  topo em y=h/2 — a origem fica bem no meio geométrico. Quem CHAMA esta
   *  função (modeler-core.js `ensureCustomMesh`) decide `centered` lendo a
   *  config; a posição visual (onde o cubo aparece apoiado) é compensada
   *  depois, na hora de posicionar o grupo/malha no mundo — ver
   *  modeler-render.js `buildSceneObjects` e engine3d.js
   *  `_buildCustomMeshObject` (ambos agora subtraem o Y mínimo local do
   *  cubo, então funciona igual não importa onde a origem esteja). */
  defaultCubeMesh(w = 0.5, d = 0.5, h = 0.5, centered = false) {
    const hw = w / 2, hd = d / 2;
    const y0 = centered ? -h / 2 : 0, y1 = centered ? h / 2 : h;
    return {
      vertices: [
        [-hw, y0, -hd], [hw, y0, -hd], [hw, y0, hd], [-hw, y0, hd],
        [-hw, y1, -hd], [hw, y1, -hd], [hw, y1, hd], [-hw, y1, hd],
      ],
      edges: [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ],
      faces: [
        [3, 2, 1, 0], [4, 5, 6, 7],
        [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
      ],
    };
  },

  // [22/09/2026] NOVO — pedido verbatim: "Há um bug do objeto escada quando
  // se vai modelá-lo [...] ao entrar no modo Modelador, a Escada acaba
  // virando uma caixa visualmente [...] Este fenômeno [...] está
  // acontecendo com outros objetos: Mesa, Luminária." CAUSA RAIZ: até
  // aqui, `ensureCustomMesh` (modeler-core.js) SEMPRE semeava
  // `obj.customMesh` com `defaultCubeMesh` (uma caixa lisa), não importa o
  // `obj.tipo` — a correção de 03/09/2026 (ver comentário grande em
  // `enter()`, modeler-core.js) só evitou que essa caixa seed fosse
  // GRAVADA de volta ao SAIR sem editar nada (a escada de verdade, fora do
  // Modelador, sempre continuou certa) — mas, DENTRO do Modelador, a
  // pré-visualização sempre foi essa caixa seed mesmo assim, nunca a malha
  // real (escada/mesa/luminária são só desenhadas com geometria própria
  // por `engine3d.js` FORA do Modelador — `_buildEscadaMesh`/
  // `_buildMesaMesh`/`_buildLuminariaMesh` — e nunca tiveram um
  // equivalente em vértices/arestas/faces editáveis pro Modelador usar
  // como seed). CORRIGIDO: 3 novos geradores (`stairsMesh`/`mesaMesh`/
  // `luminariaMesh`, abaixo), cada um montando uma malha editável (caixas
  // simples "soltas" — MESMO espírito de várias `Mesh` soltas que
  // `_buildEscadaMesh`/`_buildMesaMesh`/`_buildLuminariaMesh` já usam, só
  // que como vértices/faces editáveis em vez de `THREE.Mesh` prontas) que
  // reproduz a SILHUETA da malha real (degraus empilhados; tampo+4 pernas;
  // topo+2 tubos+2 tampas — tubos aproximados por PRISMAS retangulares,
  // não cilindros de verdade, já que este formato de malha editável só
  // suporta faces planas/quads — aproximação aceita, documentada, bem mais
  // fiel que uma caixa única). Todas nascem com a BASE em y=0 (não
  // respeitam o parâmetro `centered` de `defaultCubeMesh` — não faz
  // sentido pra uma forma composta) — inofensivo: `modeler-render.js`
  // `buildSceneObjects`/engine3d.js `_buildCustomMeshObject` já subtraem o
  // Y MÍNIMO local antes de posicionar no mundo, então funcionam igual não
  // importa onde a origem caia (mesmo mecanismo citado no comentário de
  // `defaultCubeMesh`, acima). Chamadas por `ensureCustomMesh`
  // (modeler-core.js), condicionadas a `obj.tipo`.

  /** Um `{vertices,edges,faces}` de UMA caixa, centrada em `(cx,cy,cz)`
   *  (mundo local do customMesh) — bloco de construção reaproveitado pelos
   *  3 geradores abaixo (sempre juntados depois por `_mergeVF`). Mesma
   *  topologia de `defaultCubeMesh` (8 vértices, 12 arestas, 6 faces). */
  _boxVF(cx, cy, cz, w, h, d) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    return {
      vertices: [
        [cx - hw, cy - hh, cz - hd], [cx + hw, cy - hh, cz - hd], [cx + hw, cy - hh, cz + hd], [cx - hw, cy - hh, cz + hd],
        [cx - hw, cy + hh, cz - hd], [cx + hw, cy + hh, cz - hd], [cx + hw, cy + hh, cz + hd], [cx - hw, cy + hh, cz + hd],
      ],
      edges: [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ],
      faces: [
        [3, 2, 1, 0], [4, 5, 6, 7],
        [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
      ],
    };
  },

  /** Junta várias `{vertices,edges,faces}` (ex.: várias `_boxVF`) numa
   *  malha editável só — cada peça continua "solta" (sem soldar vértices
   *  entre peças, igual às `Mesh` separadas do render real) — offset dos
   *  índices de cada peça pelo total de vértices já acumulado. */
  _mergeVF(parts) {
    const vertices = [], edges = [], faces = [];
    let base = 0;
    parts.forEach((p) => {
      p.vertices.forEach((v) => vertices.push(v.slice()));
      p.edges.forEach(([a, b]) => edges.push([a + base, b + base]));
      p.faces.forEach((f) => faces.push(f.map((i) => i + base)));
      base += p.vertices.length;
    });
    return { vertices, edges, faces };
  },

  /** Escada — degraus empilhados, MESMOS parâmetros/fórmula de
   *  `engine3d.js _buildEscadaMesh` (largura/profundidadeTotal/degraus do
   *  objeto, altura SEMPRE 2m fixos). */
  stairsMesh(largura, profundidadeTotal, degraus, alturaTotal = 2.8) {
    const nDegraus = Math.max(1, Math.round(degraus) || 11);
    const stepDepth = profundidadeTotal / nDegraus;
    const stepHeight = alturaTotal / nDegraus;
    const partes = [];
    for (let i = 0; i < nDegraus; i++) {
      const h = stepHeight * (i + 1);
      const lz = -profundidadeTotal / 2 + stepDepth * (i + 0.5);
      partes.push(this._boxVF(0, h / 2, lz, largura, h, stepDepth));
    }
    return this._mergeVF(partes);
  },

  /** Mesa — tampo + 4 pernas, MESMAS proporções de `engine3d.js
   *  _buildMesaMesh`. */
  mesaMesh(w, d, h) {
    const tampoEsp = Math.max(0.03, Math.min(0.06, h * 0.08));
    const pernaEsp = Math.max(0.03, Math.min(0.06, Math.min(w, d) * 0.07));
    const margem = pernaEsp * 1.2;
    const pernaAltura = Math.max(0.05, h - tampoEsp);
    const partes = [this._boxVF(0, h - tampoEsp / 2, 0, w, tampoEsp, d)];
    const cornersLocal = [
      [w / 2 - margem, d / 2 - margem], [-(w / 2 - margem), d / 2 - margem],
      [w / 2 - margem, -(d / 2 - margem)], [-(w / 2 - margem), -(d / 2 - margem)],
    ];
    cornersLocal.forEach(([lx, lz]) => partes.push(this._boxVF(lx, pernaAltura / 2, lz, pernaEsp, pernaAltura, pernaEsp)));
    return this._mergeVF(partes);
  },

  /** Luminária — topo + 2 "tubos" + 2 tampas, MESMAS proporções de
   *  `engine3d.js _buildLuminariaMesh`. Os tubos (cilindros de verdade na
   *  malha real) viram PRISMAS retangulares aqui — aproximação aceita, ver
   *  comentário grande acima do bloco desta rodada. */
  luminariaMesh(w, d, h) {
    const partes = [this._boxVF(0, h * 0.85, 0, w * 0.94, Math.max(0.015, h * 0.3), d)];
    const raioTubo = Math.max(0.014, d * 0.11);
    [-1, 1].forEach((lado) => {
      const lz = lado * d * 0.24;
      partes.push(this._boxVF(0, h * 0.35, lz, w * 0.88, raioTubo * 2, raioTubo * 2));
    });
    [-1, 1].forEach((lado) => {
      const lx = lado * (w / 2 - w * 0.035);
      partes.push(this._boxVF(lx, h / 2, 0, w * 0.07, h, d * 1.08));
    });
    return this._mergeVF(partes);
  },

  /** [15/09/2026 UTC] NOVO — Carro: carroceria + cabine + 4 rodas, MESMAS
   *  proporções de `engine3d.js _buildCarroMesh` — pedido verbatim: "Sobre
   *  'Objetos' → 'Acessar modelos' → 'Editar', não deve ser uma caixa
   *  padrão, nem aproximações, mas deve ser o próprio modelo a ser
   *  carregado ali. Formas mais elaboradas (carro, quadro), todas as
   *  formas." As rodas (cilindros de verdade na malha real) viram PRISMAS
   *  retangulares aqui — MESMA aproximação já aceita e documentada em
   *  `luminariaMesh`/`mesaMesh` acima (esta malha editável só suporta
   *  faces planas/quads); os "vidros" (placas finas semitransparentes da
   *  malha real) não entraram nesta versão — decoração sem volume próprio,
   *  fora do essencial da SILHUETA que o pedido buscava corrigir (a
   *  carroceria/cabine/rodas, que é o que fazia "parecer uma caixa lisa"
   *  antes desta rodada). */
  carroMesh(w, d, h) {
    const raioRoda = 0.32, larguraRoda = 0.22;
    const alturaCarroceria = h;
    const yCarroceriaBase = raioRoda * 0.75;
    const partes = [this._boxVF(0, yCarroceriaBase + alturaCarroceria / 2, 0, w, alturaCarroceria, d)];
    const cabineW = w * 0.7, cabineD = d * 0.45, cabineH = alturaCarroceria * 0.45;
    const yCabineBase = yCarroceriaBase + alturaCarroceria;
    partes.push(this._boxVF(0, yCabineBase + cabineH / 2, -d * 0.05, cabineW, cabineH, cabineD));
    const offsetX = w / 2 - larguraRoda * 0.15;
    const offsetZ = d / 2 - raioRoda * 1.1;
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        partes.push(this._boxVF(sx * offsetX, raioRoda, sz * offsetZ, larguraRoda, raioRoda * 2, raioRoda * 2));
      });
    });
    return this._mergeVF(partes);
  },

  /** [15/09/2026 UTC] NOVO — pedido verbatim: "Ao entrar no modo Modelador
   *  clicando para modelar o objeto 'relógio', o relógio deixa de
   *  funcionar: perde seus ponteiros e não funciona mais, ficando apenas
   *  uma rodela 3D. Ao entrar no modo Modelador, o relógio deve continuar
   *  com os seus ponteiros e sua forma 3D. Este problema deve ser o mesmo
   *  da substituição por uma 'caixa' padrão, remova isto do Modelador.
   *  Sempre, é o próprio objeto é que deve ser carregado para modelar (a
   *  sua malha de pontos, arestas e faces)." CAUSA RAIZ: `ensureCustomMesh`
   *  (modeler-core.js), mesmo já corrigido (15/09/2026, rodada anterior)
   *  pra não semear mais uma CAIXA pra tipos com `perfil.shape==='cylinder'`
   *  (usava `cylinderMesh`, um disco cru sem ponteiro nenhum — melhor que
   *  caixa, mas ainda "só uma rodela", exatamente a queixa desta rodada),
   *  continuava sem um caso DEDICADO pro relógio — os ponteiros de verdade
   *  só existem em `engine3d.js _buildRelogioMesh` (3 caixas finas, filhas
   *  do disco, giradas a cada quadro pela hora do mundo — ver
   *  `_updateRelogiosParede`), e esse caminho NUNCA roda pra um objeto com
   *  `obj.customMesh` (prioridade de `obj.customMesh` sobre os builders
   *  dedicados por tipo, ver engine3d.js linha ~5041) — então qualquer
   *  relógio que entra no Modelador (que sempre precisa de `customMesh`
   *  pra ter algo editável) perde os ponteiros PRA SEMPRE nessa troca de
   *  caminho de render, mesmo com a correção anterior (que só trocou
   *  "caixa" por "rodela lisa", não resolveu a perda dos ponteiros).
   *  CORRIGIDO: gerador dedicado, MESMO espírito de `stairsMesh`/`mesaMesh`/
   *  `luminariaMesh`/`carroMesh` acima — reproduz a SILHUETA real (disco +
   *  3 ponteiros, mesmas proporções de `_buildRelogioMesh`) como malha
   *  editável (vértices/arestas/faces), parados às 12h (pose estática — o
   *  Modelador edita uma malha fixa, não anima nada; a animação de verdade
   *  só existe fora do Modelador, no builder dedicado, que volta a valer se
   *  a pessoa sair sem editar nada de verdade — ver `seedBackup` em
   *  `enter()`/`_commit()`, modeler-core.js). O disco (cilindro de verdade
   *  na malha real) vira uma CAIXA achatada aqui — mesma aproximação já
   *  aceita/documentada em `luminariaMesh`/`carroMesh` acima (esta malha
   *  editável só suporta faces planas/quads). Nasce já orientado "de pé"
   *  (mostrador virado pro eixo +Z LOCAL, ponteiros apontando pro +Y LOCAL
   *  = 12 horas) — igual à postura final que `_buildRelogioMesh` monta com
   *  `mesh.rotation.set(Math.PI/2, rotY, 0)` — porque `_buildCustomMeshObject`
   *  (engine3d.js) só aplica a rotação Y de sempre (`obj.angulo`) num
   *  `customMesh`, nunca a inclinação X extra que o relógio de parede
   *  precisa; construir essa inclinação DENTRO dos vértices (em vez de
   *  depender de uma rotação X que este caminho de render não aplica) é
   *  como a base em pé já sai correta sem nenhuma mudança em engine3d.js. */
  relogioMesh(r, h) {
    const espessura = Math.max(0.02, h || 0.04);
    const partes = [this._boxVF(0, r, espessura / 2, r * 2, r * 2, espessura)];
    const czFrente = espessura + 0.003;
    const fazPonteiro = (comprimento, largura, esp) => this._boxVF(0, r + comprimento / 2, czFrente + esp / 2, largura, comprimento, esp);
    partes.push(fazPonteiro(r * 0.5, 0.012, 0.006));
    partes.push(fazPonteiro(r * 0.72, 0.008, 0.005));
    partes.push(fazPonteiro(r * 0.8, 0.006, 0.004));
    return this._mergeVF(partes);
  },

  localBBox(vertices) {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    vertices.forEach(([x, y, z]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    });
    if (!isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    return { minX, maxX, minY, maxY, minZ, maxZ };
  },

  /** Vértices ENVOLVIDOS pela seleção atual, conforme o submodo (vértice
   *  direto; aresta/face -> vértices únicos usados por elas) — usado pro
   *  pivô do gizmo, por G/R/S em Modo de Edição, e pelo painel N. */
  selectedVertexIndices(state) {
    const set = new Set();
    if (state.selectMode === 'vertex') state.sel.verts.forEach((i) => set.add(i));
    else if (state.selectMode === 'edge') state.sel.edges.forEach((ei) => { const e = state.cm.edges[ei]; if (e) { set.add(e[0]); set.add(e[1]); } });
    else state.sel.faces.forEach((fi) => { const f = state.cm.faces[fi]; if (f) f.forEach((i) => set.add(i)); });
    return [...set];
  },

  /** Faces cujos TODOS os vértices estão selecionados (Modo Vértice) ou cujas
   *  TODAS as arestas estão selecionadas (Modo Aresta) — pedido do usuário:
   *  "Se todas as arestas/todos os vértices de uma face forem selecionados,
   *  então, a face ganha o seu destaque padrão." Usado por modeler-render.js. */
  facesFullySelectedByVerts(state, vertSet) {
    return state.cm.faces.map((f, fi) => fi).filter((fi) => state.cm.faces[fi].every((vi) => vertSet.has(vi)));
  },
  facesFullySelectedByEdges(state) {
    const selEdgeSet = state.sel.edges;
    const edgeKey = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
    const selKeys = new Set([...selEdgeSet].map((ei) => { const e = state.cm.edges[ei]; return e ? edgeKey(e[0], e[1]) : null; }).filter(Boolean));
    return state.cm.faces.map((f, fi) => fi).filter((fi) => {
      const f = state.cm.faces[fi];
      for (let k = 0; k < f.length; k++) { if (!selKeys.has(edgeKey(f[k], f[(k + 1) % f.length]))) return false; }
      return true;
    });
  },

  /** Triangula cada face em leque a partir do 1º vértice (funciona pra
   *  qualquer polígono CONVEXO — o único caso que este modelador produz) e
   *  reconstrói `state.meshObj.geometry` (a malha SÓLIDA de verdade,
   *  renderizada com luz — ver modeler-render.js buildSceneObjects).
   *  `state.triFaceMap[triângulo] = índice da FACE de origem` — usado tanto
   *  pelo picking de face (raycasting) quanto pra achar o centro de cada
   *  face (quadradinho do Modo Face, ver modeler-render.js). */
  // CORRIGIDO (01/09/2026) — pedido verbatim: "O 'editar' dos modelos 3D
  // parece estar com baixíssima resolução tanto para o preenchimento do
  // modelo quanto para o gizmo." Causa raiz (preenchimento): cada triângulo
  // recebia posições PRÓPRIAS (nunca soldadas com o triângulo vizinho), então
  // `geo.computeVertexNormals()` sempre calculava uma normal por TRIÂNGULO
  // isolado — toda superfície saía "facetada" (sombreamento chapado), mesmo
  // que uma primitiva curva (cilindro/esfera/cone, item novo "barra lateral
  // estilo Blender") fosse gerada com muitos segmentos: mais segmentos não
  // ajudava em nada porque as normais nunca eram compartilhadas entre eles.
  // Reescrito pra "soldar" (compartilhar) a normal entre triângulos vizinhos
  // que dividem o MESMO vértice de `state.cm.vertices` E cujo ângulo entre
  // as normais "chapadas" de cada triângulo é MENOR que um limiar (ângulo de
  // vinco/"crease angle", técnica padrão — igual ao "Shade Auto Smooth" do
  // Blender): triângulos quase coplanares (parede de um cilindro com muitos
  // segmentos, por exemplo) ficam lisos; quinas de verdade (as 6 faces de um
  // cubo, 90° entre si) continuam com aresta viva, sem "arredondar" o cubo
  // por engano — sem isso seria uma regressão visual no único tipo de malha
  // que já existia antes desta rodada.
  _CREASE_ANGLE_COS: Math.cos(40 * Math.PI / 180),
  /** Passa a cor por vértice (v[3]=hex, v[4]=alpha) de vértices coloridos para os sem cor que dividem
   *  uma face com eles. Repete poucas vezes pra alcançar vértices só ligados a outros também novos. */
  _herdarCorDaPeca(cm) {
    const V = cm.vertices;
    const semCor = (v) => !v || v.length <= 3 || v[3] == null;
    for (let passo = 0; passo < 4; passo++) {
      let mudou = false, faltam = false;
      cm.faces.forEach((face) => {
        if (!face || face.length < 3) return;
        let doador = null;
        for (let i = 0; i < face.length; i++) { const v = V[face[i]]; if (v && !semCor(v)) { doador = v; break; } }
        for (let i = 0; i < face.length; i++) {
          const v = V[face[i]];
          if (!v || !semCor(v)) continue;
          if (doador) { v[3] = doador[3]; v[4] = doador.length > 4 && doador[4] != null ? doador[4] : 1; if (doador.length > 5 && doador[5] != null) v[5] = doador[5]; mudou = true; } else faltam = true;
        }
      });
      if (!mudou || !faltam) break;
    }
  },

  rebuildMeshGeometry(state) {
    const THREE = state.THREE;
    const V = state.cm.vertices;
    const tris = []; // cada item: [ia, ib, ic] (índices em V)
    const glassFaces = []; // faces de vidro (polígonos inteiros, p/ UV da textura de vidro)
    const glassTris = []; // faces translúcidas (vidro): malha à parte, não pintam/oclusão/raycast
    state._meshVersion = (state._meshVersion || 0) + 1;
    state.triFaceMap = [];
    let hasVC = false;
    for (let i = 0; i < V.length; i++) { const v = V[i]; if (v && v.length > 3 && v[3] != null) { hasVC = true; break; } }
    // Vértices novos (extrusão, subdivisão, etc.) herdam a cor/alpha da PEÇA (dos vizinhos na mesma face), não a cor do objeto.
    if (hasVC) this._herdarCorDaPeca(state.cm);
    state.cm.faces.forEach((face, fi) => {
      if (!face || face.length < 3) return;
      const v0 = V[face[0]];
      const vidro = !!(v0 && v0.length > 4 && v0[4] != null && v0[4] < 1);
      if (vidro) glassFaces.push(face);
      for (let k = 1; k < face.length - 1; k++) {
        const ia = face[0], ib = face[k], ic = face[k + 1];
        if (!V[ia] || !V[ib] || !V[ic]) continue;
        if (vidro) { glassTris.push([ia, ib, ic]); continue; }
        tris.push([ia, ib, ic]);
        state.triFaceMap.push(fi);
      }
    });
    const corPadrao = (typeof ModelerRender !== 'undefined' ? ModelerRender._hexToColor(state.obj?.cor) : null) ?? 0x8a92a3;
    const geo = new THREE.BufferGeometry();
    if (tris.length) {
      // Normal "chapada" de cada triângulo (produto vetorial das arestas).
      const triNormals = tris.map(([ia, ib, ic]) => {
        const a = V[ia], b = V[ib], c = V[ic];
        const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
        const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
        const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
        const len = Math.hypot(nx, ny, nz) || 1;
        return [nx / len, ny / len, nz / len];
      });
      // Quais triângulos tocam cada vértice (pra achar vizinhos que
      // compartilham aquele vértice, na hora de suavizar).
      const trisPorVertice = new Map();
      tris.forEach((t, ti) => t.forEach((vi) => {
        if (!trisPorVertice.has(vi)) trisPorVertice.set(vi, []);
        trisPorVertice.get(vi).push(ti);
      }));
      const limiarCos = this._CREASE_ANGLE_COS;
      const positions = [];
      const normals = [];
      const colors = hasVC ? [] : null;
      const tmpC = new THREE.Color();
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
          const p = V[vi];
          positions.push(p[0], p[1], p[2]);
          if (colors) { tmpC.set(p.length > 3 && p[3] != null ? p[3] : corPadrao); colors.push(tmpC.r, tmpC.g, tmpC.b); }
        });
      });
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      // --- 02/09/2026: geometria PRÓPRIA e com "winding" corrigido pra state.outlineMesh (silhueta B6) ---
      // O usuário pediu a silhueta dourada via "casco invertido" (Inverted Hull): uma cópia da malha,
      // um pouco maior, renderizada só pelo lado de trás (`side: THREE.BackSide`) — como a malha normal
      // (`state.meshObj`) cobre a cópia por cima em quase todo lugar, só a borda/rima da cópia maior
      // "escapa" por trás, dando o efeito de contorno fino.
      // Isso foi implementado só compartilhando `state.meshObj.geometry` direto com `state.outlineMesh`
      // — testes automatizados (Playwright, checando .visible/.material/.scale/.side) passaram todos,
      // mas um screenshot revelou que o objeto aparecia como um "blob" dourado sólido, não um contorno
      // fino. Causa raiz: o "back-face culling" do WebGL para `side: THREE.BackSide` depende da ORDEM
      // DE ENROLAMENTO (winding order) dos vértices de cada triângulo na tela — não do atributo
      // `normal` computado acima (que só afeta iluminação/sombreamento, não qual lado é "de frente").
      // Esta malha (`state.cm.faces`) NÃO garante ordem de enrolamento consistente entre as faces —
      // uma limitação já conhecida e documentada nos comentários históricos do antigo algoritmo de
      // contorno (removido nesta mesma leva de mudanças), que dizia explicitamente "a ordem dos
      // vértices de cada face não é confiável"; é por isso que `state.meshObj` usa
      // `side: THREE.DoubleSide` no material (`MeshStandardMaterial`) — imune a essa inconsistência
      // pra iluminação normal, mas o Inverted Hull PRECISA de um "lado de fora" bem definido.
      // Solução: construir aqui uma segunda geometria, independente, só pra `state.outlineMesh`,
      // corrigindo o enrolamento de cada triângulo — reaproveitando a MESMA heurística que o algoritmo
      // antigo (removido) usava pro seu próprio passo de correção de normais: comparar o centro de
      // cada triângulo com o centro (centroide) de toda a malha; se a normal do triângulo aponta pra
      // "dentro" (produto escalar negativo com o vetor centro-do-triângulo menos centroide-da-malha),
      // os índices desse triângulo são invertidos (ia,ic,ib em vez de ia,ib,ic) só nesta cópia —
      // a malha original (`state.meshObj`, `positions`/`normals` acima) fica INTOCADA, já que
      // `DoubleSide` não liga pra winding.
      let mcx = 0, mcy = 0, mcz = 0;
      V.forEach((v) => { mcx += v[0]; mcy += v[1]; mcz += v[2]; });
      if (V.length) { mcx /= V.length; mcy /= V.length; mcz /= V.length; }
      const outlinePositions = [];
      tris.forEach(([ia, ib, ic], ti) => {
        const a = V[ia], b = V[ib], c = V[ic];
        const tcx = (a[0] + b[0] + c[0]) / 3, tcy = (a[1] + b[1] + c[1]) / 3, tcz = (a[2] + b[2] + c[2]) / 3;
        const ox = tcx - mcx, oy = tcy - mcy, oz = tcz - mcz;
        const n = triNormals[ti];
        const dot = n[0] * ox + n[1] * oy + n[2] * oz;
        const [pa, pb, pc] = dot < 0 ? [a, c, b] : [a, b, c];
        outlinePositions.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], pc[0], pc[1], pc[2]);
      });
      if (state.outlineMesh) {
        state.outlineMesh.geometry?.dispose();
        const outlineGeo = new THREE.BufferGeometry();
        outlineGeo.setAttribute('position', new THREE.Float32BufferAttribute(outlinePositions, 3));
        state.outlineMesh.geometry = outlineGeo;
      }
      // --- fim 02/09/2026 ---
    } else if (state.outlineMesh) {
      state.outlineMesh.geometry?.dispose();
      state.outlineMesh.geometry = new THREE.BufferGeometry();
    }
    state.meshObj.geometry.dispose();
    state.meshObj.geometry = geo;
    // Cores por peça: material branco + cor por vértice (senão, cor única do objeto).
    const mat = state.meshObj.material;
    if (mat && mat.color) {
      if (!!mat.vertexColors !== hasVC) { mat.vertexColors = hasVC; mat.needsUpdate = true; }
      mat.color.setHex(hasVC ? 0xffffff : corPadrao);
    }
    this._updateGlassMesh(state, glassFaces, V);
  },

  /** Malha à parte para as faces de vidro: usa a MESMA textura de vidro do cenário ("Minecraft": quase tudo
   *  transparente, contorno e brilho estático), com UV por face. Nunca bloqueia seleção/oclusão. */
  _updateGlassMesh(state, glassFaces, V) {
    const THREE = state.THREE;
    if (!glassFaces.length || typeof buildGlassFaceGeometry !== 'function') { if (state.glassMesh) state.glassMesh.visible = false; return; }
    const geo = buildGlassFaceGeometry(THREE, V, glassFaces);
    if (!geo.attributes.position) { if (state.glassMesh) state.glassMesh.visible = false; return; }
    if (!state.glassMesh) {
      const tex = state.view3d?._engine?._glassShineTexture || null;
      state.glassMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(tex
        ? { map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }
        : { color: 0xcfeaff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      state.glassMesh.renderOrder = 2;
      state.glassMesh.raycast = () => {}; // vidro nunca bloqueia seleção/oclusão
      state.group.add(state.glassMesh);
    } else {
      state.glassMesh.geometry.dispose();
      state.glassMesh.geometry = geo;
    }
    state.glassMesh.visible = true;
  },

  snapshotForRevert(state) {
    return {
      cm: { vertices: state.cm.vertices.map((v) => v.slice()), edges: state.cm.edges.map((e) => e.slice()), faces: state.cm.faces.map((f) => f.slice()) },
      sel: { verts: new Set(state.sel.verts), edges: new Set(state.sel.edges), faces: new Set(state.sel.faces) },
      selOrder: { verts: state.selOrder.verts.slice() },
    };
  },

  // ---------- Desfazer/Refazer (Ctrl+Z/Ctrl+Y) ----------
  // Pedido do usuário (28/08/2026): "O CTRL+Z/CTRL+Y deve funcionar também."
  // Pilha simples de snapshots "completos" (malha + seleção + transformação
  // do objeto — cobre tanto edições da malha no Modo de Edição quanto
  // mover/girar/escalar o objeto INTEIRO no Modo Objeto, os dois jeitos de
  // mudar algo no Modelador). `_UNDO_MAX`: teto de segurança pra não crescer
  // sem limite numa sessão de edição longa — cada snapshot é barato (a malha
  // de um objeto modelado à mão nunca chega a ter milhares de vértices).

  _UNDO_MAX: 80,

  _fullSnapshot(state) {
    return {
      ...this.snapshotForRevert(state),
      xform: { ...state.xform },
      groupPos: state.group ? state.group.position.clone() : null,
      activeVertex: state.activeVertex,
      activeEdge: state.activeEdge,
    };
  },

  _applyFullSnapshot(state, snap) {
    state.cm = { vertices: snap.cm.vertices.map((v) => v.slice()), edges: snap.cm.edges.map((e) => e.slice()), faces: snap.cm.faces.map((f) => f.slice()) };
    state.sel = { verts: new Set(snap.sel.verts), edges: new Set(snap.sel.edges), faces: new Set(snap.sel.faces) };
    state.selOrder = { verts: snap.selOrder.verts.slice() };
    state.activeVertex = snap.activeVertex;
    state.activeEdge = snap.activeEdge;
    state.xform = { ...snap.xform };
    if (state.group && snap.groupPos) state.group.position.copy(snap.groupPos);
    if (window.ModelerGizmo) window.ModelerGizmo.applyXformToGroup(state);
    this.rebuildMeshGeometry(state);
  },

  /** Chamado ANTES de qualquer mutação "de verdade" começar (início de um
   *  arrastar G/R/S, ou de um comando instantâneo tipo Inset/Subdividir/
   *  Excluir) — empilha o estado ATUAL (o "antes"), pra Ctrl+Z voltar pra
   *  ele. Limpa a pilha de refazer (mesmo comportamento padrão de qualquer
   *  editor: uma ação nova depois de desfazer descarta o "futuro" antigo). */
  // ATUALIZADO (01/09/2026) — pedido verbatim ("barra lateral estilo
  // Blender", item grande): "[...] um botão 'histórico do Desfazer'.
  // Clicando neste último botão, Todo o histórico do 3D aparece (uso de
  // ferramentas, edições, modelagens, criação, exclusão, alteração
  // individual de posição, rotação e escala, etc. Ou seja, todas as ações
  // do app no 3D)." `pushUndo` ganhou um 2º parâmetro `label` (string
  // curta descrevendo a ação, ex. "Extrudar"/"Mover"/"Duplicar") — cada
  // call-site já existente (triggerExtrude/triggerInset/_startModal/etc,
  // ver modeler-input.js) foi atualizado pra passar o rótulo certo. Esse
  // rótulo é gravado tanto no snapshot da pilha de desfazer/refazer (usada
  // só internamente por undo/redo) QUANTO num novo `state.actionLog` —
  // uma lista ACHATADA que só CRESCE (nunca encolhe com Ctrl+Z/Ctrl+Y,
  // diferente da pilha de undo/redo) — é essa lista que alimenta o modal
  // "histórico do Desfazer" (ver `ModelerUI` — mostra TUDO que aconteceu
  // na sessão, incluindo os próprios desfazer/refazer, com hora de cada
  // um). Capada em 300 entradas (`_ACTIONLOG_MAX`) por segurança, mesmo
  // espírito do teto de 80 já existente na pilha de undo.
  _ACTIONLOG_MAX: 300,
  _logAction(state, label) {
    state.actionLog = state.actionLog || [];
    state.actionLog.push({ label: label || 'Editar malha', timestamp: Date.now() });
    if (state.actionLog.length > this._ACTIONLOG_MAX) state.actionLog.shift();
  },
  pushUndo(state, label) {
    // 01/09/2026: "Ajustar Última Operação" (item 4, barra lateral estilo
    // Blender/F6) rastreia em `state._lastPrimitive` o intervalo de índices
    // da ÚLTIMA primitiva inserida, pra poder reajustar seus parâmetros sem
    // criar entrada nova de undo a cada tecla. Mas isso só é válido enquanto
    // NENHUMA outra ação mexer na malha nesse meio-tempo — por isso toda
    // ação nova que empilha undo (exceto o próprio ajuste, que não passa por
    // aqui — ver `_colocarPrimitiva`/`ajustarUltimaPrimitiva` em
    // modeler-input.js) zera esse rastreamento aqui.
    state._lastPrimitive = null;
    state.undoStack = state.undoStack || [];
    state.redoStack = [];
    const snap = this._fullSnapshot(state);
    snap.label = label || 'Editar malha';
    state.undoStack.push(snap);
    if (state.undoStack.length > this._UNDO_MAX) state.undoStack.shift();
    this._logAction(state, snap.label);
  },

  undo(state) {
    if (!state.undoStack || !state.undoStack.length) return false;
    // 01/09/2026: idem — depois de um Desfazer os índices de
    // `state._lastPrimitive` não correspondem mais à malha restaurada.
    state._lastPrimitive = null;
    state.redoStack = state.redoStack || [];
    const cur = this._fullSnapshot(state);
    const popped = state.undoStack.pop();
    cur.label = popped.label; // pra um Refazer posterior devolver o MESMO rótulo da ação desfeita
    state.redoStack.push(cur);
    this._applyFullSnapshot(state, popped);
    this._logAction(state, `↩️ Desfeito: ${popped.label || 'ação'}`);
    return true;
  },

  redo(state) {
    if (!state.redoStack || !state.redoStack.length) return false;
    // 01/09/2026: idem — depois de um Refazer os índices também não valem mais.
    state._lastPrimitive = null;
    state.undoStack = state.undoStack || [];
    const cur = this._fullSnapshot(state);
    const popped = state.redoStack.pop();
    cur.label = popped.label;
    state.undoStack.push(cur);
    this._applyFullSnapshot(state, popped);
    this._logAction(state, `↪️ Refeito: ${popped.label || 'ação'}`);
    return true;
  },

  // ---------- Comandos ----------

  /** Extrudar (E). SIMPLIFICAÇÃO documentada (ver modeler-core.js
   *  cabeçalho): cada face/aresta/vértice selecionado é extrudado
   *  INDIVIDUALMENTE ("Extrude Individual" do Blender), mesmo com vários
   *  selecionados — não funde numa única região contígua ("Extrude
   *  Region"); pra UMA face selecionada (caso mais comum) o resultado é
   *  idêntico aos dois. */
  extrude(state) {
    if (state.mode !== 'edit') return false;
    if (state.selectMode === 'face' && state.sel.faces.size) {
      const faces = [...state.sel.faces];
      const novasFaces = [];
      faces.forEach((fi) => {
        const face = state.cm.faces[fi];
        if (!face) return;
        const mapNovo = face.map((vi) => state.cm.vertices.push(state.cm.vertices[vi].slice()) - 1);
        for (let k = 0; k < face.length; k++) {
          state.cm.edges.push([mapNovo[k], mapNovo[(k + 1) % face.length]]);
          state.cm.edges.push([face[k], mapNovo[k]]);
          state.cm.faces.push([face[k], face[(k + 1) % face.length], mapNovo[(k + 1) % face.length], mapNovo[k]]);
        }
        novasFaces.push(mapNovo);
      });
      faces.sort((a, b) => b - a).forEach((fi) => state.cm.faces.splice(fi, 1));
      novasFaces.forEach((mapNovo) => state.cm.faces.push(mapNovo));
      state.sel.faces = new Set(state.cm.faces.map((_, i) => i).slice(-novasFaces.length));
    } else if (state.selectMode === 'edge' && state.sel.edges.size) {
      const novasEdges = new Set();
      [...state.sel.edges].forEach((ei) => {
        const [a, b] = state.cm.edges[ei];
        const a2 = state.cm.vertices.push(state.cm.vertices[a].slice()) - 1;
        const b2 = state.cm.vertices.push(state.cm.vertices[b].slice()) - 1;
        state.cm.edges.push([a, a2], [b, b2], [a2, b2]);
        state.cm.faces.push([a, b, b2, a2]);
        novasEdges.add(state.cm.edges.length - 1);
      });
      state.sel.edges = novasEdges;
    } else if (state.selectMode === 'vertex' && state.sel.verts.size) {
      const novosSel = [];
      [...state.sel.verts].forEach((vi) => {
        const v2 = state.cm.vertices.push(state.cm.vertices[vi].slice()) - 1;
        state.cm.edges.push([vi, v2]);
        novosSel.push(v2);
      });
      state.sel.verts = new Set(novosSel);
      state.selOrder.verts = novosSel.slice();
    } else {
      return false;
    }
    this.rebuildMeshGeometry(state);
    return true;
  },

  /** Inset Faces (I). SIMPLIFICAÇÃO documentada: fator FIXO (0,2 — 20% em
   *  direção ao centro da face), sem o arraste "ao vivo" que o Blender usa
   *  por padrão — a face nova já fica selecionada, dá pra ajustar com S
   *  (Escalar) depois. */
  inset(state, amount = 0.2) {
    if (state.mode !== 'edit' || state.selectMode !== 'face' || !state.sel.faces.size) return false;
    const faces = [...state.sel.faces];
    const novasFacesInternas = [];
    faces.forEach((fi) => {
      const face = state.cm.faces[fi];
      if (!face) return;
      const pts = face.map((vi) => state.cm.vertices[vi]);
      const c = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);
      const novos = face.map((vi) => {
        const p = state.cm.vertices[vi];
        const np = [p[0] + (c[0] - p[0]) * amount, p[1] + (c[1] - p[1]) * amount, p[2] + (c[2] - p[2]) * amount];
        return state.cm.vertices.push(np) - 1;
      });
      for (let k = 0; k < face.length; k++) {
        state.cm.edges.push([novos[k], novos[(k + 1) % face.length]]);
        state.cm.edges.push([face[k], novos[k]]);
        state.cm.faces.push([face[k], face[(k + 1) % face.length], novos[(k + 1) % face.length], novos[k]]);
      }
      novasFacesInternas.push(state.cm.faces.push(novos) - 1);
    });
    // Todas as faces NOVAS (paredes + internas) já estavam empilhadas ANTES
    // desta remoção — remover as ORIGINAIS (índice sempre menor que
    // qualquer uma delas) desloca cada nova em exatamente `faces.length`
    // posições, uniformemente.
    faces.sort((a, b) => b - a).forEach((fi) => state.cm.faces.splice(fi, 1));
    state.sel.faces = new Set(novasFacesInternas.map((idxNaPilha) => idxNaPilha - faces.length).filter((i) => i >= 0 && i < state.cm.faces.length));
    this.rebuildMeshGeometry(state);
    return true;
  },

  /** Subdividir. Faces selecionadas: cada face vira N quads (vértice
   *  central + ponto médio de cada aresta). SIMPLIFICAÇÃO documentada: duas
   *  faces selecionadas que compartilham uma aresta ganham CADA UMA seu
   *  próprio ponto médio pra essa aresta (não compartilhado) — pode abrir
   *  uma fresta bem pequena nesse caso raro. Sem faces selecionadas, cai
   *  pro modo aresta: cada aresta selecionada ganha um vértice no meio (as
   *  FACES que usam essa aresta não são atualizadas — limitação aceita). */
  subdivide(state) {
    if (state.mode !== 'edit') return false;
    if (state.selectMode === 'face' && state.sel.faces.size) {
      const faces = [...state.sel.faces];
      const novasFaces = [];
      faces.forEach((fi) => {
        const face = state.cm.faces[fi];
        if (!face) return;
        const pts = face.map((vi) => state.cm.vertices[vi]);
        const c = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);
        const idxC = state.cm.vertices.push(c) - 1;
        const mids = face.map((vi, k) => {
          const p1 = state.cm.vertices[vi], p2 = state.cm.vertices[face[(k + 1) % face.length]];
          const m = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
          return state.cm.vertices.push(m) - 1;
        });
        for (let k = 0; k < face.length; k++) {
          const prevMid = mids[(k - 1 + face.length) % face.length];
          state.cm.edges.push([face[k], mids[k]], [mids[k], idxC]);
          novasFaces.push([face[k], mids[k], idxC, prevMid]);
        }
      });
      faces.sort((a, b) => b - a).forEach((fi) => state.cm.faces.splice(fi, 1));
      novasFaces.forEach((f) => state.cm.faces.push(f));
      state.sel.faces = new Set(state.cm.faces.map((_, i) => i).slice(-novasFaces.length));
    } else if (state.selectMode === 'edge' && state.sel.edges.size) {
      const edges = [...state.sel.edges];
      const novasEdges = [];
      edges.sort((a, b) => b - a).forEach((ei) => {
        const [a, b] = state.cm.edges[ei];
        const pa = state.cm.vertices[a], pb = state.cm.vertices[b];
        const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
        const idxM = state.cm.vertices.push(m) - 1;
        state.cm.edges.splice(ei, 1);
        state.cm.edges.push([a, idxM], [idxM, b]);
        novasEdges.push(state.cm.edges.length - 2, state.cm.edges.length - 1);
      });
      state.sel.edges = new Set(novasEdges);
    } else {
      return false;
    }
    this.rebuildMeshGeometry(state);
    return true;
  },

  /** Chave que identifica um conjunto de vértices de uma face, IGNORANDO
   *  ordem/sentido (giro ou espelhado contam como "a mesma face" — os dois
   *  jeitos resultam na EXATA MESMA posição no espaço, geometricamente
   *  coincidentes, não duas faces diferentes por acaso parecidas). Usado por
   *  `makeEdgeOrFace` pra recusar criar uma face DUPLICADA (mesmos
   *  vértices de uma face que já existe) — ver comentário grande lá. */
  _faceVertSetKey(face) { return face.slice().sort((a, b) => a - b).join(','); },

  /** Make Edge/Face (F). SIMPLIFICAÇÃO documentada: com 3+ vértices, a face
   *  é criada na ORDEM em que os vértices foram CLICADOS
   *  (state.selOrder.verts) — não reordena pelo melhor contorno geométrico.
   *
   *  BUG relatado pelo usuário (rodada seguinte): "Fiz um cubo, criei uma
   *  face, extrudei ela, depois excluí algumas faces e [...] percebi que
   *  uma face fica piscando. Certifique-se de que os testes de profundidade
   *  e de oclusão estão funcionando como deveriam." Causa raiz encontrada:
   *  ao contrário do caso de 2 vértices (aresta) alguns parágrafos abaixo —
   *  que já checava `existe` antes de criar, pra não duplicar uma aresta —
   *  o caso de 3+ vértices (face) empurrava a face nova pra `state.cm.faces`
   *  SEM checar se já existia uma face com os MESMOS vértices. Selecionar os
   *  4 vértices de uma face JÁ EXISTENTE do cubo (ex.: o topo) e apertar F
   *  criava uma SEGUNDA face exatamente NO MESMO LUGAR da primeira — duas
   *  faces geometricamente coincidentes, ocupando o mesmo plano/posição, é
   *  exatamente a condição clássica de "z-fighting": a GPU não tem como
   *  decidir de forma estável qual das duas está "na frente" (a mesma
   *  distância da câmera, no teste de profundidade), então pisca, alternando
   *  qual delas "ganha" a cada quadro — sobretudo perceptível girando a
   *  câmera. CORRIGIDO: recusa criar a face nova se já existir uma face com
   *  o mesmo CONJUNTO de vértices (`_faceVertSetKey`, sem se importar com a
   *  ordem/sentido do clique) — mesmo padrão de proteção que a aresta já
   *  tinha, agora espelhado pra face. */
  makeEdgeOrFace(state) {
    if (state.mode !== 'edit' || state.selectMode !== 'vertex') return { ok: false, reason: 'submodo' };
    const ord = state.selOrder.verts;
    if (ord.length === 2) {
      const [a, b] = ord;
      const existe = state.cm.edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
      if (!existe) state.cm.edges.push([a, b]);
      this.rebuildMeshGeometry(state);
      return { ok: true, kind: existe ? 'edge-existente' : 'edge' };
    }
    if (ord.length >= 3) {
      const key = this._faceVertSetKey(ord);
      const faceJaExiste = state.cm.faces.some((f) => f && f.length === ord.length && this._faceVertSetKey(f) === key);
      if (faceJaExiste) return { ok: false, reason: 'face-duplicada' };
      state.cm.faces.push(ord.slice());
      for (let k = 0; k < ord.length; k++) {
        const a = ord[k], b = ord[(k + 1) % ord.length];
        const existe = state.cm.edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
        if (!existe) state.cm.edges.push([a, b]);
      }
      this.rebuildMeshGeometry(state);
      return { ok: true, kind: 'face' };
    }
    return { ok: false, reason: 'poucos-vertices' };
  },

  /** NOVO (01/09/2026, item 5 da rodada B), pedido verbatim: "A colocar mais
   *  objetos de modo que façam parte de um mesmo grupo, por exemplo, pelo
   *  'Modo editar', ao clicar em um objeto, todos os outros (que fazem
   *  parte do mesmo grupo) devem ser destacados também." INTERPRETAÇÃO
   *  ADOTADA (documentada por ambiguidade — sem tela pra confirmar):
   *  como este Modelador usa uma ÚNICA malha compartilhada por sessão
   *  (`state.cm` — "o grupo", ver comentário grande em `duplicate` logo
   *  abaixo — não existe uma lista de "objetos" separados com id próprio),
   *  o "grupo" mais próximo que já existe NA PRÁTICA, sem precisar
   *  inventar um sistema de tags/ids novo em cada operação de malha
   *  (extrudar/dissolver/colapsar/etc. — dezenas de funções abaixo — todas
   *  teriam que ser reescritas pra manter esse id sincronizado, risco alto
   *  pro tempo desta rodada), é o COMPONENTE CONECTADO — o conjunto de
   *  faces que se tocam por vértice compartilhado, formando "uma peça só"
   *  (ex.: 2 primitivas coladas lado a lado, ou uma primitiva com uma
   *  extrusão) — o resto de peças SOLTAS (sem nenhum vértice em comum) já
   *  fica de fora automaticamente, exatamente como "objetos diferentes"
   *  deveriam se comportar. Diferente de guardar um id persistente (que
   *  precisaria ser mantido por toda função de edição), o componente é
   *  SEMPRE recalculado na hora, a partir da topologia ATUAL — nunca fica
   *  "desatualizado" depois de qualquer edição, e nenhuma outra função
   *  precisa saber que isto existe. Usado por `ModelerInput._handleSelectClick`
   *  (Modo Edição, clique numa face — "Select Linked" no espírito do
   *  Blender) pra selecionar/destacar TODAS as faces do "objeto" clicado de
   *  uma vez, não só a face individual. */
  connectedFacesFrom(state, faceIndex) {
    const faces = state.cm.faces;
    if (!faces[faceIndex]) return new Set();
    const facesByVert = new Map();
    faces.forEach((f, fi) => {
      if (!f) return;
      f.forEach((vi) => {
        if (!facesByVert.has(vi)) facesByVert.set(vi, []);
        facesByVert.get(vi).push(fi);
      });
    });
    const visited = new Set([faceIndex]);
    const stack = [faceIndex];
    while (stack.length) {
      const cur = stack.pop();
      (faces[cur] || []).forEach((vi) => {
        (facesByVert.get(vi) || []).forEach((fj) => {
          if (!visited.has(fj)) { visited.add(fj); stack.push(fj); }
        });
      });
    }
    return visited;
  },

  /** Duplicar — versão simplificada (documentada): SEM paredes laterais (só
   *  copia a geometria selecionada, desconectada da original).
   *  NOVO (01/09/2026), pedido verbatim: "A duplicação deve funcionar quando
   *  estiver selecionado o 'Modo Objeto'." Antes, este método recusava
   *  (`return false`) fora do Modo Edição — o botão "📋 Duplicar" (aba
   *  Ferramentas da barra lateral) e o atalho Shift+D simplesmente não
   *  faziam nada em Modo Objeto. Como a arquitetura do Modelador usa UMA
   *  ÚNICA malha compartilhada por sessão (`state.cm` — "o grupo", ver
   *  comentário grande no topo de modeler-core.js/`Modeler3D.enter`), não
   *  existe uma "seleção de objeto" separada da malha inteira pra duplicar
   *  só uma parte dela em Modo Objeto — "duplicar o objeto" só pode
   *  significar "duplicar TUDO". E pra dar pra MOVER só a cópia logo em
   *  seguida (G/R/S em Modo Objeto mexem em `state.group` INTEIRO, não dá
   *  pra isolar só a cópia lá), a cópia sai já como uma SELEÇÃO DE FACES em
   *  Modo Edição — mesmo padrão que `_colocarPrimitiva` (modeler-input.js)
   *  já usa ao adicionar uma primitiva nova: troca automática de modo, sem
   *  depender do usuário apertar Tab antes. O refresh da UI (toolbar/painel
   *  N) fica por conta de quem chama (`ModelerInput.triggerDuplicate`), que
   *  já tem acesso a `ModelerUI` — este módulo só mexe nos dados da malha. */
  duplicate(state) {
    const remap = new Map();
    const dup = (vi) => {
      if (remap.has(vi)) return remap.get(vi);
      const novo = state.cm.vertices.push(state.cm.vertices[vi].slice()) - 1;
      remap.set(vi, novo);
      return novo;
    };
    if (state.mode === 'object') {
      if (!state.cm.faces.length) return false; // malha vazia — nada pra duplicar
      const novasFaces = [];
      state.cm.faces.slice().forEach((face) => {
        if (!face) return;
        const novaFace = face.map(dup);
        for (let k = 0; k < novaFace.length; k++) state.cm.edges.push([novaFace[k], novaFace[(k + 1) % novaFace.length]]);
        state.cm.faces.push(novaFace);
        novasFaces.push(state.cm.faces.length - 1);
      });
      state.sel = { verts: new Set(), edges: new Set(), faces: new Set(novasFaces) };
      state.selOrder = { verts: [] };
      state.activeVertex = null; state.activeEdge = null;
      state.selectMode = 'face';
      state.mode = 'edit';
      state.objectSelected = false;
      this.rebuildMeshGeometry(state);
      return true;
    }
    if (state.mode !== 'edit') return false;
    if (state.selectMode === 'face' && state.sel.faces.size) {
      const novasFaces = [];
      state.sel.faces.forEach((fi) => {
        const face = state.cm.faces[fi];
        if (!face) return;
        const novaFace = face.map(dup);
        for (let k = 0; k < novaFace.length; k++) state.cm.edges.push([novaFace[k], novaFace[(k + 1) % novaFace.length]]);
        state.cm.faces.push(novaFace);
        novasFaces.push(state.cm.faces.length - 1);
      });
      state.sel.faces = new Set(novasFaces);
    } else if (state.selectMode === 'edge' && state.sel.edges.size) {
      const novasEdges = [];
      state.sel.edges.forEach((ei) => {
        const [a, b] = state.cm.edges[ei];
        state.cm.edges.push([dup(a), dup(b)]);
        novasEdges.push(state.cm.edges.length - 1);
      });
      state.sel.edges = new Set(novasEdges);
    } else if (state.selectMode === 'vertex' && state.sel.verts.size) {
      const novos = [...state.sel.verts].map(dup);
      state.sel.verts = new Set(novos);
      state.selOrder.verts = novos.slice();
    } else {
      return false;
    }
    this.rebuildMeshGeometry(state);
    return true;
  },

  deleteVertices(state) {
    const idxs = this.selectedVertexIndices(state);
    const toRemove = new Set(state.sel.verts.size ? state.sel.verts : idxs);
    if (!toRemove.size) return false;
    const remap = new Map();
    const novos = [];
    state.cm.vertices.forEach((v, i) => { if (!toRemove.has(i)) { remap.set(i, novos.length); novos.push(v); } });
    state.cm.edges = state.cm.edges.filter((e) => !toRemove.has(e[0]) && !toRemove.has(e[1])).map((e) => [remap.get(e[0]), remap.get(e[1])]);
    state.cm.faces = state.cm.faces.filter((f) => !f.some((vi) => toRemove.has(vi))).map((f) => f.map((vi) => remap.get(vi)));
    state.cm.vertices = novos;
    this.rebuildMeshGeometry(state);
    return true;
  },

  deleteEdges(state) {
    if (!state.sel.edges.size) return false;
    const removidas = [...state.sel.edges].map((ei) => state.cm.edges[ei]).filter(Boolean);
    const ehAresta = (face, a, b) => face.some((vi, k) => (vi === a && face[(k + 1) % face.length] === b) || (vi === b && face[(k + 1) % face.length] === a));
    state.cm.faces = state.cm.faces.filter((f) => !removidas.some(([a, b]) => ehAresta(f, a, b)));
    [...state.sel.edges].sort((a, b) => b - a).forEach((ei) => state.cm.edges.splice(ei, 1));
    this.rebuildMeshGeometry(state);
    return true;
  },

  deleteFaces(state) {
    if (!state.sel.faces.size) return false;
    [...state.sel.faces].sort((a, b) => b - a).forEach((fi) => state.cm.faces.splice(fi, 1));
    this.rebuildMeshGeometry(state);
    return true;
  },

  // ==================== Remover (pedido do usuário, com 3 screenshots do
  // Blender: os 3 botões principais "Delete"/"Merge"/"Remove Doubles", o
  // menu "Delete" expandido, e o menu "Merge" expandido) — ver
  // `ModelerInput.openRemoveMenu`/`openMergeMenu`/`triggerRemoveDoubles`
  // (modeler-input.js) pra onde essas funções são chamadas a partir da
  // nova barra "🗑️ Remover" (ao lado de "➕ Adicionar", que já existia).
  // ====================

  /** Remove só as ARESTAS/FACES que tocam a seleção de vértices, mas
   *  mantém os VÉRTICES no lugar (viram pontos soltos) — "Only Edges &
   *  Faces" do Blender. */
  deleteEdgesFacesKeepVerts(state) {
    const touch = new Set(this.selectedVertexIndices(state));
    if (!touch.size) return false;
    state.cm.edges = state.cm.edges.filter((e) => !touch.has(e[0]) && !touch.has(e[1]));
    state.cm.faces = state.cm.faces.filter((f) => !f.some((vi) => touch.has(vi)));
    this.rebuildMeshGeometry(state);
    return true;
  },

  /** Remove só as FACES que tocam a seleção (qualquer submodo — vértice,
   *  aresta ou face), mantendo arestas e vértices intactos — "Only Faces"
   *  do Blender. Diferente do `deleteFaces` de cima, que só entende
   *  seleção de FACE (mantido como está, é o "Faces" simples do menu). */
  deleteOnlyFaces(state) {
    let toRemove;
    if (state.selectMode === 'face') toRemove = new Set(state.sel.faces);
    else if (state.selectMode === 'edge') toRemove = new Set(this.facesFullySelectedByEdges(state));
    else {
      const vs = state.sel.verts;
      toRemove = new Set(state.cm.faces.map((f, fi) => fi).filter((fi) => state.cm.faces[fi].some((vi) => vs.has(vi))));
    }
    if (!toRemove.size) return false;
    state.cm.faces = state.cm.faces.filter((f, fi) => !toRemove.has(fi));
    this.rebuildMeshGeometry(state);
    return true;
  },

  /** Remove da malha qualquer vértice não referenciado por nenhuma aresta
   *  nem face — chamado no final das operações de fusão/dissolução de
   *  vértice, que "esvaziam" vértices sem removê-los da lista sozinhas
   *  (pra não bagunçar índices no meio do processamento — ver
   *  `_mergeVertexGroups`/`dissolveVertices`). */
  _removeUnusedVertices(state) {
    const used = new Set();
    state.cm.edges.forEach(([a, b]) => { used.add(a); used.add(b); });
    state.cm.faces.forEach((f) => f.forEach((vi) => used.add(vi)));
    const remap = new Map();
    const novos = [];
    state.cm.vertices.forEach((v, i) => { if (used.has(i)) { remap.set(i, novos.length); novos.push(v); } });
    state.cm.edges = state.cm.edges.map((e) => [remap.get(e[0]), remap.get(e[1])]);
    state.cm.faces = state.cm.faces.map((f) => f.map((vi) => remap.get(vi)));
    state.cm.vertices = novos;
  },

  /** Funde grupos de vértices — cada grupo (`{indices:[...], pos:[x,y,z]}`)
   *  vira UM vértice só, na posição `pos` (mantém o PRIMEIRO índice do
   *  grupo como "sobrevivente"; os demais são remapeados pra ele em
   *  arestas/faces). Depois: remove arestas degeneradas (viraram um
   *  "laço" de um vértice só) e duplicadas; em cada face, remove
   *  repetições CONSECUTIVAS de vértice (dois cantos que colapsaram no
   *  mesmo ponto) e descarta a face inteira se sobrar menos de 3 vértices
   *  distintos; por fim, tira da lista os vértices que ficaram sem
   *  nenhuma referência (`_removeUnusedVertices`). Base de "Merge > At
   *  Center/At Cursor/Collapse", "Edge Collapse" e "Remove Doubles". */
  _mergeVertexGroups(state, groups) {
    const remap = new Map();
    groups.forEach((g) => {
      if (!g.indices || g.indices.length < 2) return;
      const keeper = g.indices[0];
      state.cm.vertices[keeper] = g.pos.slice();
      g.indices.forEach((vi) => remap.set(vi, keeper));
    });
    const map = (vi) => { let cur = vi; let guard = 0; while (remap.has(cur) && remap.get(cur) !== cur && guard++ < 64) cur = remap.get(cur); return cur; };
    state.cm.edges = state.cm.edges.map(([a, b]) => [map(a), map(b)]).filter(([a, b]) => a !== b);
    const seenE = new Set();
    state.cm.edges = state.cm.edges.filter(([a, b]) => {
      const k = a < b ? a + '_' + b : b + '_' + a;
      if (seenE.has(k)) return false;
      seenE.add(k); return true;
    });
    state.cm.faces = state.cm.faces
      .map((f) => f.map(map))
      .map((f) => f.filter((vi, k) => vi !== f[(k - 1 + f.length) % f.length]))
      .filter((f) => new Set(f).size >= 3);
    this._removeUnusedVertices(state);
    this.rebuildMeshGeometry(state);
  },

  /** Funde as duas faces que dividem a aresta (a→b em `face1`, b→a em
   *  `face2` — winding oposto, o normal entre duas faces vizinhas de uma
   *  malha bem-formada; se não achar assim, tenta `face2` invertida, pra
   *  não depender de garantir winding perfeito em toda mutação) num
   *  polígono só, removendo a aresta compartilhada — base de "Dissolve
   *  Edges/Faces" e "Limited Dissolve". Devolve `null` se a aresta (a,b)
   *  não existir em uma das duas faces (nem direto, nem invertida). */
  _mergeTwoFacesAtEdge(face1, face2, a, b) {
    const idxPair = (face, x, y) => { for (let k = 0; k < face.length; k++) { if (face[k] === x && face[(k + 1) % face.length] === y) return k; } return -1; };
    let i1 = idxPair(face1, a, b);
    let i2 = idxPair(face2, b, a);
    let f2 = face2;
    if (i1 === -1 || i2 === -1) {
      f2 = face2.slice().reverse();
      i1 = idxPair(face1, a, b);
      i2 = idxPair(f2, b, a);
      if (i1 === -1 || i2 === -1) return null;
    }
    const len1 = face1.length, len2 = f2.length;
    const restA = [];
    for (let k = 2; k < len1; k++) restA.push(face1[(i1 + k) % len1]);
    const restB = [];
    for (let k = 2; k < len2; k++) restB.push(f2[(i2 + k) % len2]);
    return [a, ...restB, b, ...restA];
  },

  /** "Dissolve Vertices" — remove os vértices selecionados SEM deixar
   *  buraco: quando um vértice tem exatamente 2 arestas (um ponto "no
   *  meio de um caminho"), as duas viram UMA aresta ligando os vizinhos
   *  direto, e o vértice é retirado de dentro de qualquer face (o
   *  polígono perde um vértice, sem precisar fundir faces). Quando o
   *  vértice é ramificado (3+ arestas) ou isolado (0-1 arestas) — sem um
   *  jeito simples de "atravessar" — cai no comportamento de um Delete
   *  Vértices normal só pra ele. A topologia de CADA vértice é capturada
   *  ANTES de processar qualquer um (`plans`), pra um vértice não
   *  atrapalhar o cálculo do próximo nesta mesma chamada. */
  dissolveVertices(state) {
    const idxs = this.selectedVertexIndices(state);
    if (!idxs.length) return false;
    const plans = idxs.map((v) => ({ v, touching: state.cm.edges.filter((e) => e[0] === v || e[1] === v) }));
    plans.forEach(({ v, touching }) => {
      if (touching.length === 2) {
        const other = (e) => (e[0] === v ? e[1] : e[0]);
        const nA = other(touching[0]), nB = other(touching[1]);
        state.cm.edges = state.cm.edges.filter((e) => e !== touching[0] && e !== touching[1]);
        const already = state.cm.edges.some(([a, b]) => (a === nA && b === nB) || (a === nB && b === nA));
        if (!already && nA !== nB) state.cm.edges.push([nA, nB]);
        state.cm.faces = state.cm.faces.map((f) => (f.includes(v) ? f.filter((vi) => vi !== v) : f)).filter((f) => f.length >= 3);
      } else {
        state.cm.edges = state.cm.edges.filter((e) => e[0] !== v && e[1] !== v);
        state.cm.faces = state.cm.faces.filter((f) => !f.includes(v));
      }
    });
    this._removeUnusedVertices(state);
    this.rebuildMeshGeometry(state);
    return true;
  },

  /** "Dissolve Edges" — remove as arestas selecionadas; quando uma delas
   *  divide EXATAMENTE 2 faces, funde as duas num polígono só
   *  (`_mergeTwoFacesAtEdge`) em vez de simplesmente apagar (o que
   *  deixaria um buraco/removeria as faces à toa). */
  dissolveEdges(state) {
    const eis = [...state.sel.edges];
    if (!eis.length) return false;
    eis.sort((a, b) => b - a).forEach((ei) => {
      const edge = state.cm.edges[ei];
      if (!edge) return;
      const [a, b] = edge;
      const containsEdge = (f, x, y) => { for (let k = 0; k < f.length; k++) { const p = f[k], q = f[(k + 1) % f.length]; if ((p === x && q === y) || (p === y && q === x)) return true; } return false; };
      const faceIdxs = state.cm.faces.map((f, fi) => fi).filter((fi) => containsEdge(state.cm.faces[fi], a, b));
      if (faceIdxs.length === 2) {
        const merged = this._mergeTwoFacesAtEdge(state.cm.faces[faceIdxs[0]], state.cm.faces[faceIdxs[1]], a, b);
        if (merged) {
          const [hi, lo] = faceIdxs[0] > faceIdxs[1] ? faceIdxs : [faceIdxs[1], faceIdxs[0]];
          state.cm.faces[lo] = merged;
          state.cm.faces.splice(hi, 1);
        }
      }
      state.cm.edges.splice(ei, 1);
    });
    this.rebuildMeshGeometry(state);
    return true;
  },

  /** "Dissolve Faces" — remove as faces selecionadas; pra cada uma, tenta
   *  fundir com um VIZINHO não-selecionado que compartilhe uma aresta
   *  (some com a aresta interna, vira um polígono maior); se não achar
   *  vizinho assim (fronteira com outra face TAMBÉM selecionada, ou
   *  aresta de borda sem vizinho), remove a face mesmo (igual um Delete
   *  Faces normal pra ela). */
  dissolveFaces(state) {
    const fis = [...state.sel.faces].sort((a, b) => b - a);
    if (!fis.length) return false;
    const selSet = new Set(state.sel.faces);
    fis.forEach((fi) => {
      const face = state.cm.faces[fi];
      if (!face) return;
      merge: for (let k = 0; k < face.length; k++) {
        const a = face[k], b = face[(k + 1) % face.length];
        for (let ofi = 0; ofi < state.cm.faces.length; ofi++) {
          if (ofi === fi || selSet.has(ofi)) continue;
          const merged = this._mergeTwoFacesAtEdge(face, state.cm.faces[ofi], a, b);
          if (merged) { state.cm.faces[ofi] = merged; break merge; }
        }
      }
      state.cm.faces.splice(fi, 1);
    });
    this.rebuildMeshGeometry(state);
    return true;
  },

  /** "Limited Dissolve" — funde repetidamente pares de faces vizinhas
   *  cujas NORMAIS são praticamente paralelas (dentro de `angleTolDeg`,
   *  padrão 1°) — remove as arestas "desnecessárias" entre polígonos que,
   *  na prática, formam uma superfície plana só. Roda até não achar mais
   *  nenhum par assim (com um limite de segurança de iterações). */
  limitedDissolve(state, angleTolDeg = 1) {
    const normalOf = (face) => {
      if (!face || face.length < 3) return null;
      const p0 = state.cm.vertices[face[0]], p1 = state.cm.vertices[face[1]], p2 = state.cm.vertices[face[2]];
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      return [nx / len, ny / len, nz / len];
    };
    let changedAny = true, guard = 0, didAny = false;
    while (changedAny && guard++ < 300) {
      changedAny = false;
      outer: for (let fi = 0; fi < state.cm.faces.length; fi++) {
        const face = state.cm.faces[fi];
        const n1 = normalOf(face);
        if (!n1) continue;
        for (let k = 0; k < face.length; k++) {
          const a = face[k], b = face[(k + 1) % face.length];
          for (let ofi = 0; ofi < state.cm.faces.length; ofi++) {
            if (ofi === fi) continue;
            const n2 = normalOf(state.cm.faces[ofi]);
            if (!n2) continue;
            const dot = Math.min(1, Math.max(-1, n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]));
            const angleDeg = Math.acos(dot) * 180 / Math.PI;
            if (angleDeg > angleTolDeg) continue;
            const merged = this._mergeTwoFacesAtEdge(face, state.cm.faces[ofi], a, b);
            if (!merged) continue;
            state.cm.faces[Math.min(fi, ofi)] = merged;
            state.cm.faces.splice(Math.max(fi, ofi), 1);
            changedAny = true; didAny = true;
            break outer;
          }
        }
      }
    }
    this.rebuildMeshGeometry(state);
    return didAny;
  },

  /** "Edge Loops" (Delete > Edge Loops do Blender) — dissolve as arestas
   *  selecionadas (`dissolveEdges`, funde as faces dos dois lados) e,
   *  ALÉM disso, dissolve também qualquer vértice que ficou com só 2
   *  arestas depois disso (`dissolveVertices`) — o "fluxo" do laço
   *  atravessa esses pontos em vez de parar neles, diferença chave em
   *  relação a um "Dissolve Edges" simples. Troca `state.sel.verts`/
   *  `state.selectMode` temporariamente pra reaproveitar `dissolveVertices`
   *  (que lê a seleção de vértice atual) — sempre restaura os dois no final. */
  dissolveEdgeLoops(state) {
    const eis = [...state.sel.edges];
    if (!eis.length) return false;
    const touchedVerts = new Set();
    eis.forEach((ei) => { const e = state.cm.edges[ei]; if (e) { touchedVerts.add(e[0]); touchedVerts.add(e[1]); } });
    this.dissolveEdges(state);
    const stillDegree2 = [...touchedVerts].filter((v) => state.cm.edges.filter((e) => e[0] === v || e[1] === v).length === 2);
    if (stillDegree2.length) {
      const savedSel = state.sel.verts, savedMode = state.selectMode;
      state.sel.verts = new Set(stillDegree2);
      state.selectMode = 'vertex';
      this.dissolveVertices(state);
      state.selectMode = savedMode;
      state.sel.verts = savedSel;
    }
    return true;
  },

  /** "Edge Collapse" (e "Merge > Collapse", é a MESMA operação no Blender)
   *  — cada aresta selecionada colapsa pro seu PRÓPRIO ponto médio (uma
   *  fusão por aresta, ao contrário de "At Center", que funde TODA a
   *  seleção num ponto só). */
  edgeCollapse(state) {
    const eis = [...state.sel.edges];
    if (!eis.length) return false;
    const groups = eis.map((ei) => {
      const [a, b] = state.cm.edges[ei];
      const pa = state.cm.vertices[a], pb = state.cm.vertices[b];
      return { indices: [a, b], pos: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2] };
    });
    this._mergeVertexGroups(state, groups);
    return true;
  },

  /** "Merge > At First" (pedido do usuário, com screenshot do Blender: "as
   *  duas outras opções ficam bem em cima: 'ao primeiro' e 'ao último'") —
   *  funde TODOS os vértices envolvidos no vértice PRIMEIRO selecionado
   *  (`state.selOrder.verts[0]` — ordem de clique registrada, ver
   *  `_handleSelectClick`/`selOrder`), não o último nem o centro. */
  mergeAtFirst(state) {
    const idxs = this.selectedVertexIndices(state);
    if (idxs.length < 2) return false;
    const order = state.selOrder?.verts || [];
    const firstIdx = order.length ? order[0] : idxs[0];
    this._mergeVertexGroups(state, [{ indices: idxs, pos: state.cm.vertices[firstIdx].slice() }]);
    return true;
  },

  /** "Merge > At Last" — funde no vértice ÚLTIMO selecionado/ativo. É a
   *  MESMA posição que `mergeAtActive` já calcula (este app não tem
   *  "cursor 3D", ver comentário lá — "At Cursor" foi substituído por
   *  "vértice ativo", que é justamente o último selecionado); mantido como
   *  método próprio só pra bater 1:1 com o rótulo "At Last" do Blender no
   *  menu (pedido do usuário, com screenshot) sem reaproveitar o mesmo item
   *  de menu que já existia como "No Cursor". */
  mergeAtLast(state) {
    return this.mergeAtActive(state);
  },

  /** "Merge > At Center" — funde TODOS os vértices envolvidos pela
   *  seleção (vértice/aresta/face) num vértice só, na posição MÉDIA. */
  mergeAtCenter(state) {
    const idxs = this.selectedVertexIndices(state);
    if (idxs.length < 2) return false;
    let sx = 0, sy = 0, sz = 0;
    idxs.forEach((i) => { const v = state.cm.vertices[i]; sx += v[0]; sy += v[1]; sz += v[2]; });
    this._mergeVertexGroups(state, [{ indices: idxs, pos: [sx / idxs.length, sy / idxs.length, sz / idxs.length] }]);
    return true;
  },

  /** "Merge > At Cursor" — SIMPLIFICAÇÃO documentada: este app não tem o
   *  conceito de "cursor 3D" do Blender (um marcador que se posiciona na
   *  cena independente da seleção), então funde no lugar do vértice
   *  ATIVO (o último clicado, `state.selOrder.verts` — ou o último da
   *  seleção, se não tiver ordem registrada) em vez do cursor. */
  mergeAtActive(state) {
    const idxs = this.selectedVertexIndices(state);
    if (idxs.length < 2) return false;
    const order = state.selOrder?.verts || [];
    const activeIdx = order.length ? order[order.length - 1] : idxs[idxs.length - 1];
    this._mergeVertexGroups(state, [{ indices: idxs, pos: state.cm.vertices[activeIdx].slice() }]);
    return true;
  },

  /** "Remove Doubles" (hoje "Merge by Distance" no Blender) — funde
   *  vértices praticamente coincidentes (distância <= `threshold`) entre
   *  si, dentro da seleção atual (ou da malha inteira, se nada estiver
   *  selecionado). Comparação O(n²) — aceitável, as malhas deste
   *  Modelador são pequenas (dezenas de vértices, não milhares). Devolve
   *  quantos GRUPOS foram fundidos (0 = nada a fazer). */
  removeDoubles(state, threshold = 1e-4) {
    const selIdxs = this.selectedVertexIndices(state);
    const idxs = selIdxs.length ? selIdxs : state.cm.vertices.map((_, i) => i);
    const used = new Set();
    const groups = [];
    for (let i = 0; i < idxs.length; i++) {
      const vi = idxs[i];
      if (used.has(vi)) continue;
      const pv = state.cm.vertices[vi];
      const cluster = [vi];
      used.add(vi);
      for (let j = i + 1; j < idxs.length; j++) {
        const vj = idxs[j];
        if (used.has(vj)) continue;
        const pw = state.cm.vertices[vj];
        if (Math.hypot(pv[0] - pw[0], pv[1] - pw[1], pv[2] - pw[2]) <= threshold) { cluster.push(vj); used.add(vj); }
      }
      if (cluster.length > 1) groups.push({ indices: cluster, pos: pv.slice() });
    }
    if (!groups.length) return 0;
    this._mergeVertexGroups(state, groups);
    return groups.length;
  },

  // ==========================================================================
  // NOVO (01/09/2026) — "barra lateral estilo Blender" (item grande, pedido
  // verbatim, arquivo "prompts para o Claude.txt"): "Outro botão lateral
  // agora, o botão 'Criar'. [...] no submenu devem aparecer os botões
  // conforme a imagem que te enviei [screenshots do Blender] [...] Plano [...]
  // Cubo [...] Círculo [...] Esfera UV [...] Icoesfera [...] Cilindro [...]
  // Cone [...] Torus [...] Grade [...] Macaco: não coloque este modelo 3D,
  // Claude." — geradores de primitiva, todos no MESMO formato de retorno de
  // `defaultCubeMesh` (`{vertices, edges, faces}`), consumido por
  // `ModelerUI`/`ModelerInput` (ver `_criarPrimitiva` em modeler-input.js) do
  // mesmo jeito que qualquer malha (SUBSTITUI `state.cm` inteiro — este
  // Modelador só concebe UMA malha por sessão, não há "vários objetos", ver
  // comentário grande no topo do arquivo). Todos os ângulos em radianos,
  // todas nascem CENTRADAS na origem (convenção do Blender pras primitivas
  // novas — diferente do cubo "clássico" deste app, `defaultCubeMesh`
  // default `centered:false`, mantido intacto por retrocompatibilidade).
  // ==========================================================================

  /** Deduz a lista de arestas a partir das faces (cada aresta de cada
   *  polígono, sem duplicar quando duas faces compartilham a mesma aresta)
   *  — evita ter que listar arestas na mão em cada gerador abaixo. */
  _edgesFromFaces(faces) {
    const seen = new Set();
    const edges = [];
    faces.forEach((f) => {
      for (let i = 0; i < f.length; i++) {
        const a = f[i], b = f[(i + 1) % f.length];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (!seen.has(key)) { seen.add(key); edges.push(a < b ? [a, b] : [b, a]); }
      }
    });
    return edges;
  },

  /** Concatena N malhas {vertices,edges,faces} numa só, deslocando os
   *  índices de cada uma pelo tanto de vértices já acumulado — usado pra
   *  montar marcadores COMPOSTOS (ex.: Sol = esfera + anel, Câmera = caixa +
   *  cone) a partir de primitivas mais simples já existentes, sem duplicar
   *  a lógica de geração de cada parte. */
  mergeMeshes(...meshes) {
    const out = { vertices: [], edges: [], faces: [] };
    meshes.forEach((m) => {
      const offset = out.vertices.length;
      out.vertices.push(...m.vertices.map((v) => v.slice()));
      out.edges.push(...m.edges.map(([a, b]) => [a + offset, b + offset]));
      out.faces.push(...m.faces.map((f) => f.map((i) => i + offset)));
    });
    return out;
  },
  /** Une pares de triângulos coplanares (mesma normal) que formam um quadrilátero
   *  convexo — menos faces/arestas (ex.: caixa = 6 faces, 12 arestas em vez de
   *  12 e 18), o que deixa a edição mais limpa e o Modelador mais leve. */
  _mergeCoplanarTris(V, faces) {
    const n = faces.length;
    if (n < 2 || n > 30000) return faces;
    const norm = faces.map((f) => {
      const a = V[f[0]], b = V[f[1]], c = V[f[2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      return [nx / l, ny / l, nz / l];
    });
    const edgeMap = new Map();
    faces.forEach((f, i) => { for (let k = 0; k < 3; k++) { const a = f[k], b = f[(k + 1) % 3]; const key = a < b ? a + '_' + b : b + '_' + a; let l = edgeMap.get(key); if (!l) edgeMap.set(key, l = []); l.push(i); } });
    const used = new Uint8Array(n);
    const out = [];
    const convex = (q, nn) => {
      for (let k = 0; k < 4; k++) {
        const p = V[q[k]], r = V[q[(k + 1) % 4]], t = V[q[(k + 2) % 4]];
        const e1x = r[0] - p[0], e1y = r[1] - p[1], e1z = r[2] - p[2], e2x = t[0] - r[0], e2y = t[1] - r[1], e2z = t[2] - r[2];
        const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
        if (cx * nn[0] + cy * nn[1] + cz * nn[2] <= 1e-12) return false;
      }
      return true;
    };
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const f = faces[i];
      let feito = false;
      for (let k = 0; k < 3 && !feito; k++) {
        const a = f[k], b = f[(k + 1) % 3], c = f[(k + 2) % 3];
        const key = a < b ? a + '_' + b : b + '_' + a;
        for (const j of edgeMap.get(key)) {
          if (j === i || used[j]) continue;
          const nj = norm[j], ni = norm[i];
          if (ni[0] * nj[0] + ni[1] * nj[1] + ni[2] * nj[2] < 0.99999) continue;
          const g = faces[j];
          const d = g.find((x) => x !== a && x !== b);
          if (d === undefined || d === c) continue;
          const q = [a, d, b, c];
          if (!convex(q, ni)) continue;
          out.push(q); used[i] = 1; used[j] = 1; feito = true; break;
        }
      }
      if (!feito) { out.push(f); used[i] = 1; }
    }
    return out;
  },

  /** Converte um THREE.Group/THREE.Mesh (retornado por
   *  GlbMeshSource.getClone(tipo) / ObjMeshSource.getClone(tipo)) para o
   *  formato editável {vertices,edges,faces} do Modelador. Aplica
   *  matrixWorld de cada submalha (para respeitar transforms embutidos no
   *  .glb/.obj), solda vértices coincidentes DENTRO de cada peça (para que
   *  `_edgesFromFaces` não duplique arestas), e concatena as peças soltas
   *  seguindo a mesma convenção usada pelos marcadores compostos
   *  (`_mergeVF`/`mergeMeshes`). Usada para que o Modelador edite a MALHA
   *  PRÓPRIA do objeto (carregada do arquivo), em vez de uma aproximação
   *  genérica. Retorna null se `group` não tiver nenhuma geometria útil. */
  fromThreeGroup(group, opts = {}) {
    if (!group || typeof window === 'undefined' || !window.THREE) return null;
    const THREE = window.THREE;
    group.updateMatrixWorld(true);
    const partes = [];
    group.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      if (opts.skipNode && opts.skipNode(node)) return;
      const geom = node.geometry;
      const posAttr = geom.attributes && geom.attributes.position;
      if (!posAttr) return;
      // Cor por peça (vértice[3] = 0xRRGGBB, vértice[4] = alfa). Material transparente
      // (vidro) vira azul-claro translúcido simples — a "textura barata" do vidro.
      let cor = null;
      const m0 = Array.isArray(node.material) ? node.material[0] : node.material;
      if (m0) {
        if (m0.transparent || (typeof m0.opacity === 'number' && m0.opacity < 1)) cor = { hex: 0xcfeaff, alpha: 0.3 };
        else if (m0.color && typeof m0.color.getHex === 'function') cor = { hex: m0.color.getHex(), alpha: 1 };
      }
      // Peça de PORTA de rack (userData.rackParte = 'porta:frente'|'porta:traseira'): marca os vértices (v[5]) pra
      // a porta continuar articulada/interativa depois de editada (ver Engine3D._buildRackDoorsFromCustomMesh).
      let tagPorta = null;
      for (let an = node; an; an = an.parent) {
        const rp = an.userData && an.userData.rackParte;
        if (typeof rp === 'string' && rp.startsWith('porta:')) { tagPorta = rp; break; }
      }
      if (tagPorta && cor == null) cor = { hex: 0x8a92a3, alpha: 1 };
      // InstancedMesh (conectores/furos): uma cópia da geometria por instância.
      const mats = [];
      if (node.isInstancedMesh) {
        const im = new THREE.Matrix4();
        for (let k = 0; k < node.count; k++) { node.getMatrixAt(k, im); mats.push(new THREE.Matrix4().multiplyMatrices(node.matrixWorld, im)); }
      } else mats.push(node.matrixWorld);
      mats.forEach((mat) => {
      // Solda vértices coincidentes (arredondados) desta peça.
      const key2idx = new Map();
      const vertices = [];
      const remap = new Int32Array(posAttr.count);
      const v = new THREE.Vector3();
      for (let i = 0; i < posAttr.count; i++) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(mat);
        const kx = Math.round(v.x * 1e4), ky = Math.round(v.y * 1e4), kz = Math.round(v.z * 1e4);
        const key = `${kx}_${ky}_${kz}`;
        let idx = key2idx.get(key);
        if (idx === undefined) {
          idx = vertices.length;
          vertices.push(cor == null ? [v.x, v.y, v.z] : (tagPorta ? [v.x, v.y, v.z, cor.hex, cor.alpha, tagPorta] : [v.x, v.y, v.z, cor.hex, cor.alpha]));
          key2idx.set(key, idx);
        }
        remap[i] = idx;
      }
      // Monta faces triangulares (indexadas ou não), filtrando degeneradas.
      const faces = [];
      const idxAttr = geom.index;
      const pushTri = (a, b, c) => {
        const ra = remap[a], rb = remap[b], rc = remap[c];
        if (ra === rb || rb === rc || ra === rc) return;
        faces.push([ra, rb, rc]);
      };
      if (idxAttr) {
        for (let i = 0; i < idxAttr.count; i += 3) {
          pushTri(idxAttr.getX(i), idxAttr.getX(i + 1), idxAttr.getX(i + 2));
        }
      } else {
        for (let i = 0; i < posAttr.count; i += 3) pushTri(i, i + 1, i + 2);
      }
      if (!faces.length) return;
      const facesMescladas = this._mergeCoplanarTris(vertices, faces);
      partes.push({ vertices, edges: this._edgesFromFaces(facesMescladas), faces: facesMescladas });
      });
    });
    if (!partes.length) return null;
    return this.mergeMeshes(...partes);
  },

  /** Translada/escala uma malha NO LUGAR (usado pra posicionar sub-peças de
   *  um marcador composto antes de `mergeMeshes`). */
  translateMesh(mesh, dx, dy, dz) {
    mesh.vertices.forEach((v) => { v[0] += dx; v[1] += dy; v[2] += dz; });
    return mesh;
  },
  scaleMesh(mesh, sx, sy, sz) {
    mesh.vertices.forEach((v) => { v[0] *= sx; v[1] *= sy; v[2] *= sz; });
    return mesh;
  },

  /** Plano — "é o mesmo que apenas uma face do cubo" (pedido verbatim).
   *  Deitado (horizontal, plano XZ, Y=0), igual ao Plano do Blender em vista
   *  padrão. */
  planeMesh(w = 2, d = 2) {
    const hw = w / 2, hd = d / 2;
    const vertices = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]];
    const faces = [[0, 1, 2, 3]];
    return { vertices, edges: this._edgesFromFaces(faces), faces };
  },

  /** Cubo — "é o cubo que já temos" (pedido verbatim) — mesmo gerador de
   *  sempre (`defaultCubeMesh`), só que CENTRADO na origem (convenção
   *  Blender pras primitivas novas do "Criar"). */
  cubeMeshCentered(size = 2) {
    return this.defaultCubeMesh(size, size, size, true);
  },

  /** Círculo — "inicialmente com 32 vértices e raio 1" (pedido verbatim).
   *  Disco preenchido (N-gono único, plano XZ, Y=0) — `rebuildMeshGeometry`
   *  já triangula qualquer polígono convexo em leque, então um N-gono
   *  regular funciona direto, sem triangular na mão aqui. */
  circleMesh(segments = 32, radius = 1) {
    segments = Math.max(3, Math.round(segments));
    const vertices = [];
    for (let s = 0; s < segments; s++) {
      const theta = (2 * Math.PI * s) / segments;
      vertices.push([radius * Math.cos(theta), 0, radius * Math.sin(theta)]);
    }
    const faces = [Array.from({ length: segments }, (_, i) => i)];
    return { vertices, edges: this._edgesFromFaces(faces), faces };
  },

  /** Esfera UV — "inicialmente com 32 arestas [segmentos/meridianos]
   *  (configurável), 16 anéis (configurável) e tamanho 1" (pedido verbatim).
   *  Malha clássica de latitude/longitude: 1 polo em cima, `rings-1` anéis
   *  intermediários de `segments` vértices cada, 1 polo embaixo. */
  uvSphereMesh(segments = 32, rings = 16, radius = 1) {
    segments = Math.max(3, Math.round(segments));
    rings = Math.max(2, Math.round(rings));
    const vertices = [[0, radius, 0]]; // polo norte, idx 0
    for (let r = 1; r < rings; r++) {
      const phi = (Math.PI * r) / rings; // 0 (polo norte) .. PI (polo sul)
      const y = radius * Math.cos(phi);
      const ringR = radius * Math.sin(phi);
      for (let s = 0; s < segments; s++) {
        const theta = (2 * Math.PI * s) / segments;
        vertices.push([ringR * Math.cos(theta), y, ringR * Math.sin(theta)]);
      }
    }
    const bottomPole = vertices.length;
    vertices.push([0, -radius, 0]); // polo sul
    const ringStart = (r) => 1 + (r - 1) * segments;
    const faces = [];
    // calota de cima: leque do polo norte até o 1º anel
    for (let s = 0; s < segments; s++) faces.push([0, ringStart(1) + s, ringStart(1) + ((s + 1) % segments)]);
    // faixas quad entre anéis consecutivos
    for (let r = 1; r < rings - 1; r++) {
      for (let s = 0; s < segments; s++) {
        const a = ringStart(r) + s, b = ringStart(r) + ((s + 1) % segments);
        const c = ringStart(r + 1) + ((s + 1) % segments), d = ringStart(r + 1) + s;
        faces.push([a, b, c, d]);
      }
    }
    // calota de baixo: leque do último anel até o polo sul
    for (let s = 0; s < segments; s++) faces.push([ringStart(rings - 1) + ((s + 1) % segments), ringStart(rings - 1) + s, bottomPole]);
    return { vertices, edges: this._edgesFromFaces(faces), faces };
  },

  /** Icoesfera — "baseada no icosaedro, inicialmente [...] com 1 subdivisão
   *  (configurável), quanto mais subdivisões, mais se aproxima do formato de
   *  uma esfera" (pedido verbatim). Icosaedro clássico (12 vértices/20
   *  faces, proporção áurea) subdividido N vezes — cada subdivisão troca
   *  cada triângulo por 4 menores (ponto médio de cada aresta, projetado de
   *  volta pra esfera), com um cache de ponto-médio-por-aresta pra NÃO
   *  duplicar vértice em cada subdivisão (triângulos vizinhos compartilham o
   *  mesmo vértice de meio de aresta) — importante pro algoritmo de
   *  suavização de normais (engine3d.js/modeler-mesh.js
   *  buildSmoothedTriGeometry/rebuildMeshGeometry) enxergar os triângulos
   *  vizinhos como conectados pelo MESMO índice de vértice. */
  icoSphereMesh(subdivisions = 1, radius = 1) {
    subdivisions = Math.max(0, Math.min(4, Math.round(subdivisions)));
    const t = (1 + Math.sqrt(5)) / 2;
    let vertices = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(([x, y, z]) => {
      const len = Math.hypot(x, y, z) || 1;
      return [(x / len) * radius, (y / len) * radius, (z / len) * radius];
    });
    let faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    for (let it = 0; it < subdivisions; it++) {
      const cache = new Map();
      const midpoint = (a, b) => {
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (cache.has(key)) return cache.get(key);
        const va = vertices[a], vb = vertices[b];
        let mx = (va[0] + vb[0]) / 2, my = (va[1] + vb[1]) / 2, mz = (va[2] + vb[2]) / 2;
        const len = Math.hypot(mx, my, mz) || 1;
        const idx = vertices.length;
        vertices.push([(mx / len) * radius, (my / len) * radius, (mz / len) * radius]);
        cache.set(key, idx);
        return idx;
      };
      const novaFaces = [];
      faces.forEach(([a, b, c]) => {
        const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
        novaFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      });
      faces = novaFaces;
    }
    return { vertices, edges: this._edgesFromFaces(faces), faces };
  },

  /** Cilindro — "inicialmente com 32 vértices, raio 1 e profundidade 2 (é a
   *  altura dele)" (pedido verbatim). Centrado em Y (base em -depth/2, topo
   *  em +depth/2, convenção Blender). */
  cylinderMesh(segments = 32, radius = 1, depth = 2) {
    segments = Math.max(3, Math.round(segments));
    const y0 = -depth / 2, y1 = depth / 2;
    const vertices = [];
    for (let s = 0; s < segments; s++) {
      const theta = (2 * Math.PI * s) / segments;
      vertices.push([radius * Math.cos(theta), y0, radius * Math.sin(theta)]); // anel de baixo: 0..segments-1
    }
    for (let s = 0; s < segments; s++) {
      const theta = (2 * Math.PI * s) / segments;
      vertices.push([radius * Math.cos(theta), y1, radius * Math.sin(theta)]); // anel de cima: segments..2*segments-1
    }
    const centerBottom = vertices.length; vertices.push([0, y0, 0]);
    const centerTop = vertices.length; vertices.push([0, y1, 0]);
    const faces = [];
    for (let s = 0; s < segments; s++) {
      const sn = (s + 1) % segments;
      faces.push([s, sn, segments + sn, segments + s]); // parede lateral
    }
    for (let s = 0; s < segments; s++) faces.push([centerBottom, (s + 1) % segments, s]); // tampa de baixo
    for (let s = 0; s < segments; s++) faces.push([centerTop, segments + s, segments + ((s + 1) % segments)]); // tampa de cima
    return { vertices, edges: this._edgesFromFaces(faces), faces };
  },

  /** Cone — "inicialmente com 32 vértices, raio 1 (base) = 1.5 e raio 2
   *  (topo) = 0 e profundidade (altura) = 2" (pedido verbatim). Quando
   *  `radius2` é ~0 (o padrão pedido) vira um cone "de verdade" (ápice num
   *  único ponto, sem anel degenerado no topo); com `radius2` > 0 vira um
   *  tronco de cone (frustum), pro campo ficar editável sem travar em 0. */
  coneMesh(segments = 32, radius1 = 1.5, radius2 = 0, depth = 2) {
    segments = Math.max(3, Math.round(segments));
    const y0 = -depth / 2, y1 = depth / 2;
    const vertices = [];
    for (let s = 0; s < segments; s++) {
      const theta = (2 * Math.PI * s) / segments;
      vertices.push([radius1 * Math.cos(theta), y0, radius1 * Math.sin(theta)]); // anel da base: 0..segments-1
    }
    const temTopo = radius2 > 1e-4;
    let apiceOuTopoStart;
    if (temTopo) {
      apiceOuTopoStart = vertices.length;
      for (let s = 0; s < segments; s++) {
        const theta = (2 * Math.PI * s) / segments;
        vertices.push([radius2 * Math.cos(theta), y1, radius2 * Math.sin(theta)]);
      }
    } else {
      apiceOuTopoStart = vertices.length;
      vertices.push([0, y1, 0]); // ápice único
    }
    const centerBottom = vertices.length; vertices.push([0, y0, 0]);
    const faces = [];
    if (temTopo) {
      for (let s = 0; s < segments; s++) {
        const sn = (s + 1) % segments;
        faces.push([s, sn, apiceOuTopoStart + sn, apiceOuTopoStart + s]);
      }
      const centerTop = vertices.length; vertices.push([0, y1, 0]);
      for (let s = 0; s < segments; s++) faces.push([centerTop, apiceOuTopoStart + s, apiceOuTopoStart + ((s + 1) % segments)]);
    } else {
      for (let s = 0; s < segments; s++) faces.push([s, (s + 1) % segments, apiceOuTopoStart]); // lateral até o ápice
    }
    for (let s = 0; s < segments; s++) faces.push([centerBottom, (s + 1) % segments, s]); // tampa da base
    return { vertices, edges: this._edgesFromFaces(faces), faces };
  },

  /** Torus — "inicialmente com segmentos principais = 48, segmentos
   *  secundários = 12 [...] raio principal = 1, raio secundário = 0.5"
   *  (pedido verbatim). Duplamente periódico (sem tampas/pólos — o "cano"
   *  fecha nas duas direções). */
  torusMesh(majorSeg = 48, minorSeg = 12, majorRadius = 1, minorRadius = 0.5) {
    majorSeg = Math.max(3, Math.round(majorSeg));
    minorSeg = Math.max(3, Math.round(minorSeg));
    const vertices = [];
    for (let i = 0; i < majorSeg; i++) {
      const u = (2 * Math.PI * i) / majorSeg;
      for (let j = 0; j < minorSeg; j++) {
        const v = (2 * Math.PI * j) / minorSeg;
        const r = majorRadius + minorRadius * Math.cos(v);
        vertices.push([r * Math.cos(u), minorRadius * Math.sin(v), r * Math.sin(u)]);
      }
    }
    const idx = (i, j) => ((i + majorSeg) % majorSeg) * minorSeg + ((j + minorSeg) % minorSeg);
    const faces = [];
    for (let i = 0; i < majorSeg; i++) {
      for (let j = 0; j < minorSeg; j++) {
        faces.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)]);
      }
    }
    return { vertices, edges: this._edgesFromFaces(faces), faces };
  },

  /** Grade — "inicialmente com subdivisões em X = 10 e subdivisões em Y =
   *  10, raio = 1" (pedido original). ATUALIZADO (01/09/2026, item 9 da
   *  rodada B), pedido verbatim: "No 'Criar'->'Grade', deve ter as
   *  dimensões de uma face de cubo. Esta face de cubo é que deve ser
   *  dividida, inicialmente, em 10 x 10." Trocado o parâmetro de `radius`
   *  (metade do tamanho — convenção do Círculo/Esfera, sem muito sentido
   *  pra um PLANO quadrado) pra `tamanho` (tamanho TOTAL da aresta), MESMA
   *  convenção/MESMO nome já usados pelo Cubo (`cubeMeshCentered`/
   *  `tamanho`, padrão 2 — ver `PRIMITIVE_CATALOG.cubo`, modeler-ui.js) —
   *  com o padrão também em 2, a Grade nasce EXATAMENTE do tamanho de uma
   *  face do Cubo padrão (2×2), como pedido, e fica óbvio pra quem for
   *  ajustar depois que os dois números "andam juntos" por design. Plano
   *  deitado (XZ, Y=0), vai de -tamanho/2 a +tamanho/2 nos dois eixos. */
  gridMesh(subdivX = 10, subdivY = 10, tamanho = 2) {
    subdivX = Math.max(1, Math.round(subdivX));
    subdivY = Math.max(1, Math.round(subdivY));
    const radius = tamanho / 2;
    const vertices = [];
    for (let j = 0; j <= subdivY; j++) {
      const z = -radius + (2 * radius) * (j / subdivY);
      for (let i = 0; i <= subdivX; i++) {
        const x = -radius + (2 * radius) * (i / subdivX);
        vertices.push([x, 0, z]);
      }
    }
    const vidx = (i, j) => j * (subdivX + 1) + i;
    const faces = [];
    for (let j = 0; j < subdivY; j++) {
      for (let i = 0; i < subdivX; i++) {
        faces.push([vidx(i, j), vidx(i + 1, j), vidx(i + 1, j + 1), vidx(i, j + 1)]);
      }
    }
    return { vertices, edges: this._edgesFromFaces(faces), faces };
  },

  /** Texto — "é um texto no 3D desenhado com faces" (pedido verbatim).
   *  DECISÃO DOCUMENTADA (01/09/2026): gerar o CONTORNO REAL de cada letra
   *  (triangulação de fonte vetorial) é um recurso grande por si só (fora de
   *  escopo desta rodada, junto dos outros "itens grandes" ainda maiores);
   *  em vez de nada, esta versão insere uma PLAQUINHA sólida (caixa achatada
   *  e comprida, extrudada) do tamanho do texto digitado — um placeholder
   *  "desenhado com faces" de verdade (não é só um ícone/sprite 2D colado),
   *  editável/redimensionável no Modelador como qualquer outra malha, só que
   *  sem o desenho vetorial de cada letra ainda. `texto` só é usado pro
   *  TAMANHO (comprimento aproximado da string) — não há glifo renderizado. */
  textoPlaceholderMesh(texto = 'Texto', altura = 0.3, profundidade = 0.06) {
    const largura = Math.max(0.3, (String(texto).length || 1) * 0.18);
    return this.defaultCubeMesh(largura, profundidade, altura, true);
  },

  /** Marcadores dos grupos "Lâmpada" e "Outros" do submenu "Criar" — pedido
   *  verbatim: "Ponto: um objeto lâmpada (representada como no Blender),
   *  ponto de luz omnidirecional. Sol: [...] uma fonte de raios de luz
   *  paralelos. E os demais botões." + "Texto [...] E os demais botões.
   *  Quanto a câmera, é a câmera que já temos". DECISÃO DOCUMENTADA
   *  (01/09/2026): este Modelador edita uma ÚNICA malha estática por sessão
   *  (não é um editor de CENA com vários objetos/luzes de verdade — ver
   *  comentário grande no topo do arquivo) — então "Ponto"/"Sol"/"Spot"/
   *  "Hemi"/"Area"/"Armature"/"Lattice"/"Empty"/"Speaker"/"Câmera" entram
   *  como MARCADORES/formas representativas (geometria reconhecível, do
   *  mesmo jeito que qualquer primitiva acima), não como fontes de luz/
   *  câmera FUNCIONAIS de verdade (isso já existe em outras partes do app —
   *  luminária/poste no catálogo de objetos do mapa 2D, câmeras no Mapa —
   *  arquitetura bem diferente, de vários objetos numa cena, fora de escopo
   *  mudar aqui). Cada função abaixo devolve o mesmo formato
   *  {vertices,edges,faces} de qualquer outro gerador desta seção. */
  markerPontoMesh() { return this.icoSphereMesh(1, 0.15); },
  markerSolMesh() {
    // esfera pequena + um anel fino ao redor, sugerindo "raios" — pedido:
    // "uma fonte de raios de luz paralelos".
    return this.mergeMeshes(this.icoSphereMesh(1, 0.13), this.torusMesh(24, 6, 0.24, 0.02));
  },
  markerSpotMesh() { return this.coneMesh(20, 0.18, 0.05, 0.3); },
  markerHemiMesh() {
    // "domo" achatado (metade de uma esfera, aproximada por uma icoesfera
    // espremida no eixo Y) — suficiente pra distinguir visualmente de
    // Ponto/Sol sem precisar de um gerador de hemisfério à parte.
    const m = this.icoSphereMesh(1, 0.18);
    return this.scaleMesh(m, 1, 0.55, 1);
  },
  markerAreaMesh() { return this.planeMesh(0.3, 0.3); },
  markerArmatureMesh() { return this.cylinderMesh(8, 0.02, 0.6); },
  markerLatticeMesh() { return this.cubeMeshCentered(0.35); },
  markerEmptyMesh() { return this.cubeMeshCentered(0.12); },
  markerSpeakerMesh() { return this.coneMesh(16, 0.14, 0.14, 0.12); },
  markerCameraMesh() {
    // caixa (corpo) + cone achatado (lente), igual ao ícone clássico de
    // câmera — "é a câmera que já temos" (o usuário já tem câmeras de
    // verdade em outra parte do app; aqui é só o marcador/ícone).
    const corpo = this.cubeMeshCentered(0.22);
    const lente = this.coneMesh(12, 0.09, 0.09, 0.08);
    this.translateMesh(lente, 0, 0, -0.15); // desloca a "lente" pra fora do corpo, no eixo Z — só um ícone, sem apontar de verdade
    return this.mergeMeshes(corpo, lente);
  },
};

window.ModelerMesh = ModelerMesh;
