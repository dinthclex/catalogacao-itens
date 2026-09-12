/**
 * tijolos.js — "Blocos de construção" (tijolos autofundíveis). NOVO
 * (07/09/2026), pedido verbatim: "blocos de construção. [...] pequenos
 * tijolos (caixa mesmo) com dimensões configuráveis [...] Com o botão
 * esquerdo do mouse, o clique adiciona um tijolo [...] em cima da
 * superfície em que o raycaster está 'batendo' (apenas 1 por clique). Ao
 * segurar o ctrl, vai adicionando um após o outro no mesmo nível de
 * altura. [...] quando um estiver ao lado do outro eles 'se fundem' [...]
 * As faces comuns desaparecem e as arestas comuns nas faces coplanares
 * também desaparecem, ficando o mais simples possível."
 *
 * DECISÃO DE ESCOPO TRANSPARENTE (não esquecimento): "as arestas comuns nas
 * faces coplanares também desaparecem" pediria, no caso geral, um algoritmo
 * de "greedy meshing" (fundir VÁRIOS quads coplanares adjacentes num único
 * quad maior, removendo as arestas internas de verdade da malha) — comum em
 * motores de voxel (ex. Minecraft-like). Implementado AQUI: a parte que traz
 * 99% do benefício visual e de desempenho com uma fração do risco —
 * CULLING de face (quando dois tijolos do MESMO tamanho encostam
 * exatamente face-a-face, as DUAS faces internas somem por completo, nunca
 * são desenhadas) — resolve tanto "as faces comuns desaparecem" quanto o
 * "desempenho... milhares de objetos sendo calculados a cada frame"
 * (menos triângulos == menos trabalho, e é tudo UMA malha só, não milhares
 * de objetos Three.js separados). O que NÃO está aqui é fundir várias faces
 * externas coplanares adjacentes num único quad (a malha resultante, por
 * dentro, ainda tem uma aresta entre cada tijolo visível na SUPERFÍCIE —
 * invisível a olho nu com iluminação lisa/sem contorno, como o app já
 * renderiza por padrão; só aparece ligando o modo "malha"/wireframe). Fica
 * registrado como refinamento de uma próxima rodada, se o usuário confirmar
 * que quer o ganho extra (mais complexo, mais risco, sem navegador de
 * verdade pra testar nesta sessão).
 */
const Tijolos = {
  /** Config padrão — "tijolo tem 1/10 da medida do lado da lajota do
   *  mundo" (lajota = 1m, ver Engine3D._floorInfo.tileSize) — todas as 3
   *  dimensões, CONFIGURÁVEIS depois pelo usuário no menu lateral. */
  DEFAULTS: {
    sx: 0.1, sy: 0.1, sz: 0.1,       // dimensões do tijolo, em metros
    snapMeters: 0.1,                  // grade de encaixe no mundo (igual à dimensão, por padrão — "para poder colocar um exatamente do lado do outro")
    // ÂNCORA do snap (pedido verbatim, bloco "grade de snap variável"): onde,
    // NO PRÓPRIO TIJOLO, o ponto de snap fica ancorado — 'centro' (padrão),
    // ou um dos 4 cantos vistos de cima: 'sup-esq'/'sup-dir'/'inf-esq'/'inf-dir'
    // (sup/inf = +Z/-Z do mundo, esq/dir = -X/+X — mesma convenção do resto
    // do app: X cresce pra "direita", Z cresce pra "frente"/"norte").
    ancora: 'centro',
    corPadrao: '#c77f4a',             // cor padrão de tijolo novo (tom "tijolo" mesmo)
    corPorFace: false,                // false = 1 cor pras 6 faces; true = 6 cores independentes
    texturaUrl: null,
    // NOVO (07/09/2026) — "novas ideias" pedidas, agora implementadas:
    // formato/rotação ("formatos não retangulares (cunha/prisma)... encaixe
    // rotacionado"). 'formato': 'caixa' (padrão, participa do culling/fusão
    // normal) ou 'cunha' (rampa/prisma triangular — ver buildWedgeGeometry;
    // NÃO participa da fusão/culling, decisão de escopo registrada lá).
    // 'rotY': 0/90/180/270 — só tem efeito visual em 'cunha' (pra onde a
    // rampa aponta); caixas continuam sempre alinhadas aos eixos do mundo
    // (culling exige isso, ver decisão de escopo em buildMergedGeometry).
    formato: 'caixa',
    rotY: 0,
    // "modo espelho/simetria": ao colocar 1 tijolo, coloca TAMBÉM uma cópia
    // espelhada — não é um campo DO TIJOLO, é uma opção da FERRAMENTA (por
    // isso mora aqui, na config, não no registro de cada tijolo).
    espelhoAtivo: false,
    espelhoEixo: 'x',       // 'x' (plano perpendicular a X) ou 'z'
    espelhoPos: 0,           // posição (metros) do plano de espelho naquele eixo
  },

  /** Lê a config salva (blob único em DB.getSetting, MESMO padrão "solto"
   *  já usado por outras preferências do mapa — ex. fotosMarcarAquiAcao,
   *  ver mapconfig.js) — não faz parte do blob `mapa3dConfig` (MapConfig)
   *  de propósito: é uma ferramenta independente, com seu próprio menu "+"
   *  independente (pedido verbatim), não uma opção dentro de "⚙️
   *  Configurações". */
  async getConfig() {
    const saved = (typeof DB !== 'undefined') ? await DB.getSetting('tijoloConfig', null) : null;
    return { ...this.DEFAULTS, ...(saved || {}) };
  },
  async setConfig(patch) {
    const atual = await this.getConfig();
    const novo = { ...atual, ...patch };
    if (typeof DB !== 'undefined') await DB.setSetting('tijoloConfig', novo);
    return novo;
  },

  /** Gera um nome padrão estilo Blender pro tijolo (mesmo padrão de todo o
   *  resto do app desde a rodada dos nomes — ver Mapping._nextObjectName). */
  _nextName(map) {
    if (typeof Mapping !== 'undefined' && Mapping._nextObjectName) return Mapping._nextObjectName(map, 'Tijolo');
    return `Tijolo.${((map.tijolos || []).length + 1).toString().padStart(3, '0')}`;
  },

  /** Acrescenta um tijolo novo ao mapa — `t` = {x,y,z (CENTRO, mundo),
   *  sx,sy,sz, cor, corFaces, texturaUrl}. Devolve o registro criado (com
   *  id/nome). Não salva no banco sozinho — quem chama decide quando (ver
   *  view3d.js, MESMO padrão fire-and-forget de todo o resto do app). */
  add(map, t) {
    if (!map.tijolos) map.tijolos = [];
    const id = 'tj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const registro = {
      id, nome: this._nextName(map),
      x: t.x, y: t.y, z: t.z,
      sx: t.sx, sy: t.sy, sz: t.sz,
      cor: t.cor || this.DEFAULTS.corPadrao,
      corFaces: t.corFaces || null, // [px,nx,py,ny,pz,nz] em hex, quando "cor por face" está ligado
      texturaUrl: t.texturaUrl || null,
      formato: t.formato || 'caixa', // NOVO (07/09/2026): 'caixa' ou 'cunha'
      rotY: t.rotY || 0,              // NOVO (07/09/2026): 0/90/180/270 — só visível em 'cunha'
    };
    map.tijolos.push(registro);
    return registro;
  },

  remove(map, id) {
    if (!map.tijolos) return false;
    const i = map.tijolos.findIndex((t) => t.id === id);
    if (i < 0) return false;
    map.tijolos.splice(i, 1);
    return true;
  },

  /** Ponto (x,z) do MUNDO ancorado na grade de encaixe, considerando a
   *  âncora escolhida (`cfg.ancora`) — pedido verbatim (bloco "grade de
   *  snap variável"): "deve ser possível definir [...] se o snap se dará
   *  orientado ao centro do tijolo, ao canto superior esquerdo, ao canto
   *  superior direito, ao canto inferior esquerdo ou ao canto inferior
   *  direito." Devolve o CENTRO do tijolo já posicionado (x,z) — a âncora
   *  só muda ONDE dentro da célula de grade o tijolo fica encostado, nunca
   *  o tamanho da célula em si (`cfg.snapMeters`). */
  snapXZ(x, z, cfg) {
    const s = cfg.snapMeters > 0 ? cfg.snapMeters : (cfg.sx || 0.1);
    const cellX = Math.floor(x / s) * s;
    const cellZ = Math.floor(z / s) * s;
    const halfSx = (cfg.sx || 0.1) / 2, halfSz = (cfg.sz || 0.1) / 2;
    switch (cfg.ancora) {
      case 'sup-esq': return { x: cellX + halfSx, z: cellZ + s - halfSz }; // -X, +Z (longe da origem em Z)
      case 'sup-dir': return { x: cellX + s - halfSx, z: cellZ + s - halfSz };
      case 'inf-esq': return { x: cellX + halfSx, z: cellZ + halfSz };
      case 'inf-dir': return { x: cellX + s - halfSx, z: cellZ + halfSz };
      case 'centro':
      default: return { x: cellX + s / 2, z: cellZ + s / 2 };
    }
  },

  /** Chave de grade (string) pra achar rápido um tijolo "vizinho exato" —
   *  arredonda pra evitar erro de ponto flutuante (0.1+0.2 !== 0.3, etc.).
   *  Usa o CANTO MÍNIMO (x-sx/2, y, z-sz/2) do tijolo, não o centro — dois
   *  tijolos do MESMO tamanho encostados perfeitamente têm cantos mínimos
   *  que batem exatamente num dos eixos. */
  _key(x, y, z) {
    const r = (n) => Math.round(n * 10000) / 10000;
    return `${r(x)}|${r(y)}|${r(z)}`;
  },

  /** Constrói a geometria MESCLADA de todos os tijolos SEM textura (os com
   *  textura entram à parte — ver `buildAll` abaixo) — culling de face entre
   *  vizinhos EXATOS do MESMO tamanho (ver decisão de escopo no cabeçalho
   *  do arquivo). Cor por vértice (mesmo truque de faceColors do
   *  customMesh, rodada anterior) — cada tijolo pode ter sua própria cor
   *  (ou 6 cores, uma por face) sem precisar de material por tijolo.
   *  Devolve `{ positions:Float32Array, normals:Float32Array,
   *  colors:Float32Array }` prontos pra um BufferGeometry não-indexado, ou
   *  `null` se não sobrar nenhuma face visível. */
  buildMergedGeometry(tijolos) {
    if (!tijolos || !tijolos.length) return null;
    // Mapa de ocupação por canto-mínimo, SÓ entre tijolos do mesmo tamanho
    // exato (culling entre tamanhos diferentes não é seguro — a face
    // "vizinha" pode não cobrir a mesma área toda, deixando buraco).
    const ocupacao = new Map(); // key(canto-min) -> {sx,sy,sz}
    tijolos.forEach((t) => {
      const minX = t.x - t.sx / 2, minY = t.y - t.sy / 2, minZ = t.z - t.sz / 2;
      ocupacao.set(this._key(minX, minY, minZ), { sx: t.sx, sy: t.sy, sz: t.sz, t });
    });

    const positions = [], normals = [], colors = [];
    const hexToRgb = (hex) => {
      const c = (hex || '#c77f4a').replace('#', '');
      const n = parseInt(c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c, 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    };

    // 6 faces: +X,-X,+Y,-Y,+Z,-Z — cada uma como 2 triângulos (6 vértices,
    // não-indexado, MESMO padrão de buildSmoothedTriGeometry usado alhures
    // neste projeto pra permitir cor por vértice sem indexação complicada).
    const FACES = [
      { axis: 'x', dir: 1, normal: [1, 0, 0] },
      { axis: 'x', dir: -1, normal: [-1, 0, 0] },
      { axis: 'y', dir: 1, normal: [0, 1, 0] },
      { axis: 'y', dir: -1, normal: [0, -1, 0] },
      { axis: 'z', dir: 1, normal: [0, 0, 1] },
      { axis: 'z', dir: -1, normal: [0, 0, -1] },
    ];
    const FACE_IDX = { 'x1': 0, 'x-1': 1, 'y1': 2, 'y-1': 3, 'z1': 4, 'z-1': 5 };

    tijolos.forEach((t) => {
      const minX = t.x - t.sx / 2, minY = t.y - t.sy / 2, minZ = t.z - t.sz / 2;
      const maxX = t.x + t.sx / 2, maxY = t.y + t.sy / 2, maxZ = t.z + t.sz / 2;
      const corBase = t.cor || this.DEFAULTS.corPadrao;

      FACES.forEach((f) => {
        // Vizinho exato do lado dessa face — só existe culling se o
        // vizinho tiver EXATAMENTE o mesmo tamanho nos 3 eixos (ver
        // comentário grande acima de `ocupacao`).
        let neighborMin;
        if (f.axis === 'x') neighborMin = f.dir === 1 ? [maxX, minY, minZ] : [minX - t.sx, minY, minZ];
        else if (f.axis === 'y') neighborMin = f.dir === 1 ? [minX, maxY, minZ] : [minX, minY - t.sy, minZ];
        else neighborMin = f.dir === 1 ? [minX, minY, maxZ] : [minX, minY, minZ - t.sz];
        const viz = ocupacao.get(this._key(neighborMin[0], neighborMin[1], neighborMin[2]));
        if (viz && viz.sx === t.sx && viz.sy === t.sy && viz.sz === t.sz) return; // CULLED — face interna, não desenha

        // Cor desta face: `corFaces` (6, na ordem [+X,-X,+Y,-Y,+Z,-Z]) se
        // "cor por face" estiver ligado pra este tijolo, senão `cor` única.
        const faceKey = `${f.axis}${f.dir}`;
        const cor = (t.corFaces && t.corFaces[FACE_IDX[faceKey]]) || corBase;
        const [r, g, b] = hexToRgb(cor);

        // 4 cantos da face (ordem consistente pra formar 2 triângulos com a
        // normal certa, sentido anti-horário visto de fora).
        let quad;
        if (f.axis === 'x') {
          const x = f.dir === 1 ? maxX : minX;
          quad = f.dir === 1
            ? [[x, minY, minZ], [x, maxY, minZ], [x, maxY, maxZ], [x, minY, maxZ]]
            : [[x, minY, maxZ], [x, maxY, maxZ], [x, maxY, minZ], [x, minY, minZ]];
        } else if (f.axis === 'y') {
          const y = f.dir === 1 ? maxY : minY;
          quad = f.dir === 1
            ? [[minX, y, maxZ], [maxX, y, maxZ], [maxX, y, minZ], [minX, y, minZ]]
            : [[minX, y, minZ], [maxX, y, minZ], [maxX, y, maxZ], [minX, y, maxZ]];
        } else {
          // CORRIGIDO (08/09/2026, 38a rodada), pedido verbatim: "os
          // tijolos [...] estao aparecendo apenas com 2 faces e, no lugar
          // da terceira face, e como se ela estivesse transparente e da
          // para ver o interior do cubo." -- os 2 ramos abaixo estavam
          // TROCADOS entre si (winding invertida em relacao ao normal
          // declarado, ver comentario grande da funcao) -- só o eixo Z
          // tinha esse bug; X e Y já estavam corretos.
          const z = f.dir === 1 ? maxZ : minZ;
          quad = f.dir === 1
            ? [[minX, minY, z], [maxX, minY, z], [maxX, maxY, z], [minX, maxY, z]]
            : [[maxX, minY, z], [minX, minY, z], [minX, maxY, z], [maxX, maxY, z]];
        }
        // 2 triângulos: (0,1,2) e (0,2,3).
        [[0, 1, 2], [0, 2, 3]].forEach((tri) => {
          tri.forEach((vi) => {
            positions.push(quad[vi][0], quad[vi][1], quad[vi][2]);
            normals.push(f.normal[0], f.normal[1], f.normal[2]);
            colors.push(r, g, b);
          });
        });
      });
    });

    if (!positions.length) return null;
    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      colors: new Float32Array(colors),
    };
  },

  /** Monta a(s) THREE.Mesh finais pra este conjunto de tijolos — devolve
   *  uma lista `[{mesh, textured:bool}]` pra quem chama (engine3d.js)
   *  adicionar/remover da cena. Tijolos COM `texturaUrl` viram uma malha
   *  INDIVIDUAL cada um (caixa simples, sem culling entre si) — decisão de
   *  escopo registrada no cabeçalho do arquivo: fundir texturas exigiria um
   *  atlas de UV compartilhado, fora do escopo desta rodada; tijolos
   *  texturizados tendem a ser usados como "destaque" pontual, não pra
   *  paredes inteiras. */
  /** NOVO (08/09/2026, 39a rodada), pedido verbatim: "O aglomerado de
   *  tijolos deve se tornar um objeto unico Modelavel e excluivel." --
   *  (excluivel ja existia desde a rodada anterior, via pickable
   *  'tijolos-merged' em engine3d.js `_rebuildTijolos`; falta MODELAVEL --
   *  poder abrir no Modelador 3D e editar vertice a vertice, igual
   *  qualquer outro objeto com `customMesh`). Reaproveita A MESMA logica de
   *  culling de face de `buildMergedGeometry` acima (so entre tijolos do
   *  MESMO tamanho exato, ver comentario grande la), mas devolve o formato
   *  INDEXADO (`{vertices, edges, faces}`) que `obj.customMesh` espera (ver
   *  js/modeler/modeler-mesh.js `defaultCubeMesh` pro schema de referencia,
   *  e js/engine3d.js `_buildCustomMeshObject` pra quem consome). Cada face
   *  visivel vira 1 quad com 4 vertices PROPRIOS (nao compartilhados com as
   *  faces vizinhas) -- mais simples e seguro que tentar deduplicar
   *  vertices entre tijolos (culling ja remove as faces internas; as
   *  externas nao precisam compartilhar vertice pra renderizar ou editar
   *  corretamente no Modelador, so custam um pouco mais de memoria, sem
   *  problema pro tamanho tipico de um aglomerado destes). Vertices em
   *  espaco LOCAL, centralizados no CENTROIDE X/Z do aglomerado e com a
   *  BASE (Y minimo) em y=0 (mesma convencao 'origem no centro/base' que o
   *  resto do Modelador usa, ver `_buildCustomMeshObject`) -- devolve
   *  tambem `origin` ({x,y,z} em espaco de MUNDO: centroide X/Z + Y
   *  minimo) pra quem chama posicionar o objeto (`Mapping.addObject`)
   *  exatamente onde os tijolos estavam. `null` se nao sobrar nenhum
   *  tijolo 'caixa' sem textura (mesmo criterio de `buildMergedGeometry`,
   *  os unicos que participam da fusao/culling). */
  buildMergedCustomMesh(tijolosTodos) {
    const tijolos = (tijolosTodos || []).filter((t) => (t.formato || 'caixa') === 'caixa' && !t.texturaUrl);
    if (!tijolos.length) return null;

    const ocupacao = new Map();
    tijolos.forEach((t) => {
      const minX = t.x - t.sx / 2, minY = t.y - t.sy / 2, minZ = t.z - t.sz / 2;
      ocupacao.set(this._key(minX, minY, minZ), { sx: t.sx, sy: t.sy, sz: t.sz });
    });

    // Centroide X/Z (media dos centros) e Y minimo (base) -- origem do
    // objeto novo, em espaco de MUNDO.
    let sumX = 0, sumZ = 0, minYAll = Infinity;
    tijolos.forEach((t) => {
      sumX += t.x; sumZ += t.z;
      const minY = t.y - t.sy / 2;
      if (minY < minYAll) minYAll = minY;
    });
    const origin = { x: sumX / tijolos.length, y: minYAll, z: sumZ / tijolos.length };

    const FACES = [
      { axis: 'x', dir: 1, normal: [1, 0, 0] },
      { axis: 'x', dir: -1, normal: [-1, 0, 0] },
      { axis: 'y', dir: 1, normal: [0, 1, 0] },
      { axis: 'y', dir: -1, normal: [0, -1, 0] },
      { axis: 'z', dir: 1, normal: [0, 0, 1] },
      { axis: 'z', dir: -1, normal: [0, 0, -1] },
    ];

    const vertices = [], faces = [];
    const edgeSet = new Set();
    const edges = [];
    const addQuad = (worldQuad) => {
      const base = vertices.length;
      worldQuad.forEach((p) => {
        vertices.push([p[0] - origin.x, p[1] - origin.y, p[2] - origin.z]);
      });
      faces.push([base, base + 1, base + 2, base + 3]);
      [[base, base + 1], [base + 1, base + 2], [base + 2, base + 3], [base + 3, base]].forEach(([a, b]) => {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([a, b]); }
      });
    };

    tijolos.forEach((t) => {
      const minX = t.x - t.sx / 2, minY = t.y - t.sy / 2, minZ = t.z - t.sz / 2;
      const maxX = t.x + t.sx / 2, maxY = t.y + t.sy / 2, maxZ = t.z + t.sz / 2;

      FACES.forEach((f) => {
        let neighborMin;
        if (f.axis === 'x') neighborMin = f.dir === 1 ? [maxX, minY, minZ] : [minX - t.sx, minY, minZ];
        else if (f.axis === 'y') neighborMin = f.dir === 1 ? [minX, maxY, minZ] : [minX, minY - t.sy, minZ];
        else neighborMin = f.dir === 1 ? [minX, minY, maxZ] : [minX, minY, minZ - t.sz];
        const viz = ocupacao.get(this._key(neighborMin[0], neighborMin[1], neighborMin[2]));
        if (viz && viz.sx === t.sx && viz.sy === t.sy && viz.sz === t.sz) return; // CULLED

        let quad;
        if (f.axis === 'x') {
          const x = f.dir === 1 ? maxX : minX;
          quad = f.dir === 1
            ? [[x, minY, minZ], [x, maxY, minZ], [x, maxY, maxZ], [x, minY, maxZ]]
            : [[x, minY, maxZ], [x, maxY, maxZ], [x, maxY, minZ], [x, minY, minZ]];
        } else if (f.axis === 'y') {
          const y = f.dir === 1 ? maxY : minY;
          quad = f.dir === 1
            ? [[minX, y, maxZ], [maxX, y, maxZ], [maxX, y, minZ], [minX, y, minZ]]
            : [[minX, y, minZ], [maxX, y, minZ], [maxX, y, maxZ], [minX, y, maxZ]];
        } else {
          const z = f.dir === 1 ? maxZ : minZ;
          quad = f.dir === 1
            ? [[minX, minY, z], [maxX, minY, z], [maxX, maxY, z], [minX, maxY, z]]
            : [[maxX, minY, z], [minX, minY, z], [minX, maxY, z], [maxX, maxY, z]];
        }
        addQuad(quad);
      });
    });

    if (!faces.length) return null;
    return { vertices, edges, faces, origin };
  },

  buildAll(THREE, tijolos, wireframe) {
    // NOVO (07/09/2026) — "formatos não-retangulares (cunha/prisma)": só
    // 'caixa' SEM textura entra na malha mesclada/culled (precisa de
    // tamanho EXATO igual e alinhamento aos eixos pra fundir com segurança
    // — ver decisão de escopo em buildMergedGeometry/buildWedgeGeometry).
    // 'cunha' e qualquer tijolo COM textura viram mesh individual, como já
    // era pra textura antes desta rodada.
    const mesclaveis = (tijolos || []).filter((t) => (t.formato || 'caixa') === 'caixa' && !t.texturaUrl);
    const individuais = (tijolos || []).filter((t) => (t.formato || 'caixa') !== 'caixa' || t.texturaUrl);
    const out = [];

    const merged = this.buildMergedGeometry(mesclaveis);
    if (merged) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(merged.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(merged.normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(merged.colors, 3));
      // CORRIGIDO (08/09/2026, 38a rodada): material passa a respeitar o
      // modo de visualizacao (ver comentario grande em `buildAll` acima) --
      // MESMO material/cor (`colWireframe` 0x78c8ff) usado por toda malha
      // "normal" do app em modo wireframe (engine3d.js).
      const mat = wireframe
        ? new THREE.MeshBasicMaterial({ color: 0x78c8ff, wireframe: true })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = false; mesh.receiveShadow = false;
      out.push({ mesh, textured: false });
    }

    individuais.forEach((t) => {
      const ehCunha = (t.formato || 'caixa') === 'cunha';
      let geo;
      if (ehCunha) {
        const w = this.buildWedgeGeometry(t);
        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(w.positions, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(w.normals, 3));
      } else {
        geo = new THREE.BoxGeometry(t.sx, t.sy, t.sz);
      }
      const matOpts = { color: t.cor || this.DEFAULTS.corPadrao, roughness: 0.9, metalness: 0.02 };
      // Textura só faz sentido em 'caixa' aqui (BoxGeometry já vem com UV
      // pronto) — decisão de escopo: cunha não tem mapeamento de UV
      // definido, fica só com cor sólida por enquanto.
      if (t.texturaUrl && !ehCunha) matOpts.map = new THREE.TextureLoader().load(t.texturaUrl);
      // CORRIGIDO (08/09/2026, 38a rodada) — mesmo motivo do material da
      // malha mesclada, acima.
      const mat = wireframe
        ? new THREE.MeshBasicMaterial({ color: 0x78c8ff, wireframe: true })
        : new THREE.MeshStandardMaterial(matOpts);
      const mesh = new THREE.Mesh(geo, mat);
      if (!ehCunha) mesh.position.set(t.x, t.y, t.z); // cunha já vem com posição/rotação embutidas nos vértices (buildWedgeGeometry)
      out.push({ mesh, textured: true, tijoloId: t.id });
    });

    return out;
  },

  /** NOVO (07/09/2026) — "novas ideias" pedidas ("formatos não-retangulares
   *  (cunha/prisma) pra rampas e telhados" + "encaixe rotacionado"). Rampa/
   *  prisma triangular: base retangular cheia, 1 face vertical cheia (a
   *  "costa" alta), 1 face inclinada (a rampa em si) e 2 triângulos
   *  laterais — 5 faces ao todo (padrão clássico de "wedge" de motores de
   *  voxel/CAD). `t.rotY` (0/90/180/270°) gira o sólido em torno do eixo Y
   *  ANTES de posicionar no mundo — decide pra qual lado a rampa desce.
   *  DECISÃO DE ESCOPO REGISTRADA: cunha NÃO participa da fusão/culling da
   *  malha mesclada (`buildMergedGeometry`) — aquele algoritmo só sabe
   *  cancelar faces entre 2 CAIXAS idênticas alinhadas aos eixos; uma
   *  cunha encostada numa caixa (ou noutra cunha) é um problema geométrico
   *  DIFERENTE (as faces vizinhas não são congruentes em geral) — fica
   *  registrado como refinamento futuro, se o usuário notar que precisa de
   *  performance em construções com MUITAS cunhas. Devolve posições/normais
   *  já em coordenadas de MUNDO (não usa `mesh.position`, ao contrário da
   *  caixa) — mais simples que carregar rotação Y própria no Mesh também. */
  buildWedgeGeometry(t) {
    const hx = t.sx / 2, hy = t.sy / 2, hz = t.sz / 2;
    // Vértices LOCAIS (antes de girar/posicionar) — rotY=0: rampa desce de
    // +Z (alto, "costa") pra -Z (baixo, "frente"), plana em X.
    const local = {
      b1: [-hx, -hy, -hz], b2: [hx, -hy, -hz], b3: [hx, -hy, hz], b4: [-hx, -hy, hz],
      t1: [-hx, hy, hz], t2: [hx, hy, hz],
    };
    const passos = Math.round(((t.rotY || 0) / 90)) & 3; // 0..3 quartos de volta
    const rot = ([x, y, z]) => {
      let rx = x, rz = z;
      for (let i = 0; i < passos; i++) { const nx = rz, nz = -rx; rx = nx; rz = nz; }
      return [t.x + rx, t.y + y, t.z + rz];
    };
    const V = {}; Object.keys(local).forEach((k) => { V[k] = rot(local[k]); });

    const positions = [], normals = [];
    const normalDe = (a, b, c) => {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      return [n[0] / len, n[1] / len, n[2] / len];
    };
    const pushTri = (a, b, c) => {
      const n = normalDe(a, b, c);
      [a, b, c].forEach((p) => { positions.push(p[0], p[1], p[2]); normals.push(n[0], n[1], n[2]); });
    };
    const pushQuad = (a, b, c, d) => { pushTri(a, b, c); pushTri(a, c, d); }; // 2 triângulos, ordem anti-horária vista de fora
    pushQuad(V.b1, V.b2, V.b3, V.b4);   // base (normal -Y)
    pushQuad(V.b4, V.b3, V.t2, V.t1);   // costa vertical alta (normal +Z, antes de girar)
    pushQuad(V.b2, V.b1, V.t1, V.t2);   // rampa inclinada (normal +Y/-Z)
    pushTri(V.b1, V.b4, V.t1);           // lateral esquerda (normal -X)
    pushTri(V.b2, V.t2, V.b3);           // lateral direita (normal +X)
    return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
  },

  /** NOVO (07/09/2026) — parte das "novas ideias" pedidas pelo usuário
   *  ("pintar tijolos já colocados"). Raycast (slab test contra AABB) de um
   *  raio (origin/dir, cada um {x,y,z}) contra a lista de tijolos do mapa —
   *  devolve `{tijolo, dist}` do mais próximo atingido, ou `null`. Não usa
   *  o mesh mesclado (buildMergedGeometry funde tudo numa geometria só, sem
   *  mapeamento fácil de triângulo->tijolo) — mais simples e maleável
   *  testar contra a lista de tijolos crua, e o app já faz raycasts
   *  puramente matemáticos assim noutros lugares (raycastSurface etc). */
  raycastTijolos(origin, dir, tijolos) {
    if (!tijolos || !tijolos.length) return null;
    let melhor = null;
    const eixos = ['x', 'y', 'z'];
    tijolos.forEach((t) => {
      const min = { x: t.x - t.sx / 2, y: t.y - t.sy / 2, z: t.z - t.sz / 2 };
      const max = { x: t.x + t.sx / 2, y: t.y + t.sy / 2, z: t.z + t.sz / 2 };
      let tmin = -Infinity, tmax = Infinity, ok = true;
      for (const ax of eixos) {
        const o = origin[ax], d = dir[ax];
        if (Math.abs(d) < 1e-9) {
          if (o < min[ax] || o > max[ax]) { ok = false; break; }
        } else {
          let t1 = (min[ax] - o) / d, t2 = (max[ax] - o) / d;
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (!ok || tmax < 0) return;
      const dist = tmin >= 0 ? tmin : tmax;
      if (dist >= 0 && (!melhor || dist < melhor.dist)) melhor = { tijolo: t, dist };
    });
    return melhor;
  },

  /** NOVO (07/09/2026) — "novas ideias" pedidas ("carimbos/receitas de
   *  conjuntos reutilizáveis"). Um "carimbo" é uma lista de tijolos com
   *  posições RELATIVAS a uma origem (não absolutas do mundo) — salvo com
   *  um nome, reaplicável em qualquer lugar do mapa depois (ou em outro
   *  mapa, via exportar/importar — ver mais abaixo). Guardado junto com o
   *  resto da config "solta" da ferramenta (mesmo padrão DB.getSetting já
   *  usado por `getConfig`/`setConfig`), como uma lista independente
   *  (`tijoloCarimbos`) — não faz parte de `tijoloConfig` de propósito
   *  (carimbos sobrevivem a qualquer mudança de dimensão/cor padrão da
   *  ferramenta, não são "configuração momentânea"). */
  async listStamps() {
    return (typeof DB !== 'undefined') ? ((await DB.getSetting('tijoloCarimbos', [])) || []) : [];
  },
  async saveStamp(nome, tijolos, origem) {
    if (!nome || !tijolos || !tijolos.length) return null;
    const relativos = tijolos.map((t) => ({
      dx: t.x - origem.x, dy: t.y - origem.y, dz: t.z - origem.z,
      sx: t.sx, sy: t.sy, sz: t.sz, cor: t.cor, corFaces: t.corFaces, texturaUrl: t.texturaUrl,
      formato: t.formato, rotY: t.rotY,
    }));
    const lista = (await this.listStamps()).filter((c) => c.nome !== nome); // mesmo nome = substitui
    lista.push({ nome, tijolos: relativos });
    if (typeof DB !== 'undefined') await DB.setSetting('tijoloCarimbos', lista);
    return lista;
  },
  async deleteStamp(nome) {
    const lista = (await this.listStamps()).filter((c) => c.nome !== nome);
    if (typeof DB !== 'undefined') await DB.setSetting('tijoloCarimbos', lista);
    return lista;
  },
  /** Aplica um carimbo (por nome) no mapa, ancorado em `origem` {x,y,z} —
   *  devolve a lista de registros CRIADOS (mesmo formato usado pelo
   *  undo/redo em view3d.js — todos os tijolos de 1 aplicação viram 1
   *  entrada só no histórico). */
  async applyStamp(map, nome, origem) {
    const lista = await this.listStamps();
    const carimbo = lista.find((c) => c.nome === nome);
    if (!carimbo) return [];
    return carimbo.tijolos.map((rel) => this.add(map, {
      x: origem.x + rel.dx, y: origem.y + rel.dy, z: origem.z + rel.dz,
      sx: rel.sx, sy: rel.sy, sz: rel.sz, cor: rel.cor, corFaces: rel.corFaces, texturaUrl: rel.texturaUrl,
      formato: rel.formato, rotY: rel.rotY,
    }));
  },

  /** NOVO (07/09/2026) — "novas ideias" pedidas ("exportar/importar uma
   *  construção de tijolos como modelo reutilizável"). Exporta um conjunto
   *  de tijolos pra um objeto JSON portátil (MESMO formato relativo dos
   *  carimbos, reaproveitado — ver `saveStamp` acima) — pronto pra
   *  `JSON.stringify` e baixar como arquivo `.json` (ver view3d.js
   *  `_exportarConstrucaoTijolos`/`_importarConstrucaoTijolos`).
   *  DECISÃO DE ESCOPO REGISTRADA: integração completa com "Objetos"->
   *  "Acessar modelos" (aparecer no catálogo de objetos de verdade,
   *  colocável pela ferramenta "Objetos" como qualquer outro tipo) ficou
   *  de fora desta rodada — exigiria registrar um tipo customizado novo em
   *  icons.js/modelos3d.js (MAP_OBJECT_EXTRAS), trabalho de integração
   *  separado do modelo de dados de tijolos em si. Aqui a "exportação/
   *  importação como modelo reutilizável" é entregue no nível de ARQUIVO
   *  (baixa/sobe um `.json`) — já cobre o caso de uso central do pedido
   *  (levar uma construção pra outro mapa, ou compartilhar com outra
   *  pessoa/sessão), com o carimbo servindo de "modelo reutilizável"
   *  DENTRO do mesmo mapa (mais rápido que exportar/importar arquivo). */
  exportConstruction(tijolos, origem) {
    const lista = tijolos || [];
    const o = origem || (lista[0] ? { x: lista[0].x, y: lista[0].y, z: lista[0].z } : { x: 0, y: 0, z: 0 });
    return {
      tipo: 'tijolos-construcao', versao: 1,
      tijolos: lista.map((t) => ({
        dx: t.x - o.x, dy: t.y - o.y, dz: t.z - o.z,
        sx: t.sx, sy: t.sy, sz: t.sz, cor: t.cor, corFaces: t.corFaces, texturaUrl: t.texturaUrl,
        formato: t.formato, rotY: t.rotY,
      })),
    };
  },
  importConstruction(map, dados, origem) {
    if (!dados || dados.tipo !== 'tijolos-construcao' || !Array.isArray(dados.tijolos)) return [];
    return dados.tijolos.map((rel) => this.add(map, {
      x: origem.x + rel.dx, y: origem.y + rel.dy, z: origem.z + rel.dz,
      sx: rel.sx, sy: rel.sy, sz: rel.sz, cor: rel.cor, corFaces: rel.corFaces, texturaUrl: rel.texturaUrl,
      formato: rel.formato, rotY: rel.rotY,
    }));
  },
};

window.Tijolos = Tijolos;
