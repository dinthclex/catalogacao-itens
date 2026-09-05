/**
 * modeler-render.js — Modelador 3D: TODO o overlay visual 2D (wireframe,
 * pontos de vértice/aresta/face, contorno de seleção do objeto, bolinha de
 * origem) + o teste de oclusão que decide o que está "na frente"/"atrás".
 *
 * ARQUITETURA (pedido do usuário, 28/08/2026): um `<canvas>` 2D TRANSPARENTE
 * sobreposto ao canvas WebGL (mesmo tamanho, position:absolute por cima,
 * `pointer-events:none` — o clique sempre atravessa pro canvas WebGL de
 * baixo, quem trata mouse é modeler-input.js), redesenhado a cada quadro,
 * com `imageSmoothingEnabled=false` e todo traço de 1px desenhado em
 * coordenadas `+0.5` (a técnica clássica do Canvas 2D pra uma linha de 1px
 * cair EXATAMENTE dentro de uma linha de pixels, em vez de borrada entre
 * duas — sem isso, `ctx.lineWidth=1` numa coordenada inteira produz uma
 * linha de 2px bem fraca, metade de cada lado). O malha SÓLIDA em si
 * (`state.meshObj`, com luz/sombreamento normal) continua sendo desenhada
 * pelo WebGL de sempre — este overlay só desenha POR CIMA dela (pedido do
 * usuário, item "sólido primeiro, wireframe por cima").
 *
 * OCLUSÃO (pedido do usuário): pra saber se um vértice/aresta/face está
 * "atrás" da própria malha, `computeOcclusion` lança um `THREE.Raycaster` da
 * câmera até cada ponto de interesse e verifica se ele bate na malha do
 * PRÓPRIO objeto ANTES de chegar lá (com uma pequena tolerância) — se bater,
 * está oculto. Recalculado a cada quadro; aceitável porque a malha editada
 * aqui é sempre pequena (o modelador não serve pra malhas de milhares de
 * triângulos).
 */

const ModelerRender = {
  COLORS: {
    edgeVisible: '#050505',
    // Opacidade usada pra TUDO que está oculto (atrás de faces, com
    // "Limitar visíveis" ligado) — vértice/aresta/face — pedido do usuário:
    // deve parecer "atrás de um plano cinza transparente", não uma cor fixa
    // clara/opaca (ver comentário grande em `_drawWireframeBase`).
    ALPHA_OCULTO: 0.42,
    selYellow: '#ffe100',
    selWhite: '#ffffff',
    faceFillSel: 'rgba(255,140,0,0.4)',
    outline: '#ffe100',
    originFill: 'rgba(250,240,190,0.92)',
    originStroke: '#000000',
    // Bolinha do ponto-alvo da câmera Órbita (rodada 45) — cor distinta da
    // origem do objeto (amarelo-desbotado) pra não confundir os dois: um
    // ciano bem visível, igual ao já usado noutros indicadores de câmera
    // desta base de código.
    orbitTargetFill: 'rgba(80,220,255,0.9)',
    orbitTargetStroke: '#003a4d',
    faceDot: '#050505',
    // Mesma paleta X/Y/Z do gizmo de mover/girar/escalar (ModelerGizmo.
    // DISPLAY_COLORS, em hex numérico pra uso no WebGL) — aqui em string CSS
    // pra uso no canvas 2D (widget de orientação de mundo, ver
    // `_drawWorldOrientationGizmo`).
    axisX: '#ff3352',
    axisY: '#8bdc00',
    axisZ: '#2c8fff',
  },

  // ==================== construção/descarte da cena 3D ====================

  buildSceneObjects(state) {
    const THREE = state.THREE;
    const obj = state.obj;
    const baseY = (obj.piso || 0) * 2.8 + (obj.elevacao || 0);
    // `obj.elevacao` é sempre a altura da BASE do objeto (ver comentário
    // detalhado em modeler-core.js `_commit`) — mas a ORIGEM local (0,0,0),
    // que é onde `state.group.position` fica, pode estar no MEIO do cubo
    // agora (opção "Origem no centro do cubo", pedido do usuário — ver
    // mapconfig.js/modeler-mesh.js defaultCubeMesh). `bb.minY` é quanto a
    // base da malha fica abaixo da origem em espaço local — subtraindo,
    // a origem sobe o suficiente pra base continuar exatamente na mesma
    // altura de sempre (`baseY`), não importa onde a origem esteja.
    //
    // CORRIGIDO (03/09/2026) — BUG relatado: "criei um cubo, pus 5.97 na
    // dimensão Y, elevei o objeto pra ficar acima do chão, saí do
    // Modelador... o objeto não fica com a posição de Y definida." Causa
    // raiz: `bb.minY` acima é medido na malha CRUA (`obj.customMesh`,
    // nunca escalada — só `obj.customMeshXform.scaleY` guarda o quanto o
    // Modelador ESTICA essa malha em Y, ver `ModelerGizmo.applyXformToGroup`
    // logo abaixo, que aplica a escala no `state.group` DEPOIS desta linha).
    // Antes desta correção, `bb.minY` cru (ex.: -0,25 do cubo "Origem no
    // centro") era subtraído de `baseY` SEM multiplicar pela escala Y —
    // só funcionava por coincidência quando a escala Y era 1 (cubo
    // "clássico" não-centrado, minY=0, então minY*qualquerEscala=0 de
    // qualquer jeito) ou quando a origem nascia na base (minY=0). Com
    // "Origem no centro" (padrão do app, ver `ensureCustomMesh` acima) E
    // uma escala Y diferente de 1 (dimensão Y editada), a base entrava
    // MUITO mais baixo (ou mais alto) do que o valor definido em
    // Posição/elevação. `_commit` (modeler-core.js) já fazia essa conta
    // CERTA (`bb.minY * scaleY`) — corrigido aqui pra ficar consistente
    // (mesma fórmula usada também em engine3d.js `_buildCustomMeshObject`,
    // o construtor normal do objeto salvo fora do Modelador — MESMO bug
    // existia lá, corrigido junto).
    const bb = ModelerMesh.localBBox(obj.customMesh.vertices);
    const scaleYObj = state.xform.scaleY || 1;
    state.group = new THREE.Group();
    state.group.position.set(obj.x, baseY - bb.minY * scaleYObj, obj.y);
    ModelerGizmo.applyXformToGroup(state);
    state.scene.add(state.group);

    state.meshObj = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: this._hexToColor(obj.cor) ?? 0x8a92a3, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }),
    );
    state.group.add(state.meshObj);

    // NOVO (02/09/2026), pedido verbatim (item 6 da rodada de 13 itens):
    // "Para fazer apenas o contorno (silhueta) dos objetos na tela, use o
    // método do casco invertido (Inverted Hull)..." — ver o comentário
    // grande em `updateObjectOutline`, mais abaixo, pra explicação completa
    // da técnica/por que substitui a varredura radial em CPU de antes.
    // `OUTLINE_SCALE` (1.035, fator local — some do MESMO grupo, então
    // herda a escala de `state.xform` normalmente) é o quanto a cópia
    // "vaza" pra fora da malha original — grande o suficiente pra ficar bem
    // visível em qualquer zoom razoável do Modelador, pequeno o suficiente
    // pra não parecer um halo grosso demais numa peça bem fina.
    // AJUSTADO (02/09/2026) — a geometria NÃO é mais compartilhada
    // literalmente com `state.meshObj`: um teste visual (screenshot)
    // revelou que a malha compartilhada, com ordem de enrolamento
    // (winding) inconsistente entre faces (limitação pré-existente deste
    // app), quebrava o "back-face culling" do `side: THREE.BackSide` e
    // fazia o objeto aparecer como um bloco dourado sólido em vez de um
    // contorno fino. Agora `state.outlineMesh` começa com uma
    // `BufferGeometry` própria e VAZIA aqui — quem a preenche de verdade
    // (com winding corrigido) é `rebuildMeshGeometry` (modeler-mesh.js),
    // chamado logo em seguida no fluxo de `enter()`/toda edição. Ver o
    // comentário grande em `updateObjectOutline`, mais abaixo, pra
    // explicação completa da técnica.
    const OUTLINE_SCALE = 1.035;
    state.outlineMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: this._hexToColor(this.COLORS.outline) ?? 0xffe100, side: THREE.BackSide }),
    );
    state.outlineMesh.scale.setScalar(OUTLINE_SCALE);
    state.outlineMesh.visible = false; // liga/desliga por quadro, ver `updateObjectOutline`
    state.group.add(state.outlineMesh);

    // Canvas 2D de overlay — irmão do canvas WebGL, mesmo container
    // (`.view3d-wrap`, já position:relative — ver engine3d.js). Fica por
    // cima na ordem do DOM (adicionado depois) e `pointer-events:none`
    // garante que nunca rouba clique/hover do canvas de baixo.
    const canvas2d = document.createElement('canvas');
    canvas2d.className = 'm3d-overlay-canvas';
    state.wrapEl.appendChild(canvas2d);
    state.overlayCanvas = canvas2d;
    state.overlayCtx = canvas2d.getContext('2d');
    state.overlayCtx.imageSmoothingEnabled = false;
    state._overlaySizeKey = '';

    state.raycaster = state.raycaster || new THREE.Raycaster();
    state.occlusion = { vert: [], edge: [], face: [] };

    // "Cursor" falso pro modo "cursor infinito" — pedido do usuário: "o
    // cursor deve continuar aparecendo como se saísse de um lado da tela e
    // reaparecesse do outro, continuando com o reposicionamento contínuo do
    // que estiver acontecendo no app." O navegador NÃO deixa nenhum script
    // teletransportar o cursor OS de verdade (por segurança) — só existem
    // duas opções: cursor real, preso na borda da tela (o problema
    // original), ou Pointer Lock (cursor real escondido, só entrega
    // DESLOCAMENTO — `movementX/Y` — sem limite nenhum, é o que já usamos
    // pra matemática do arrasto, ver modeler-input.js). A SOLUÇÃO: manter o
    // Pointer Lock pra matemática (sem limite, contínua — "reposicionamento
    // contínuo do que estiver acontecendo no app") e desenhar ESTE cursor
    // FALSO por cima, controlado 100% por nós — daí dá pra fazer ele
    // "voltar pro outro lado" (módulo/wrap) só visualmente, sem nunca
    // interromper a conta de verdade por trás. Escondido por padrão — só
    // aparece durante um arrasto modal com o ponteiro de fato travado (ver
    // modeler-input.js `_onMouseMove`).
    const fakeCursor = document.createElement('div');
    fakeCursor.className = 'm3d-fakecursor';
    state.wrapEl.appendChild(fakeCursor);
    state.fakeCursorEl = fakeCursor;
  },

  disposeSceneObjects(state) {
    if (state.meshObj) { state.meshObj.geometry?.dispose(); state.meshObj.material?.dispose(); }
    // NOVO (02/09/2026) — ver `state.outlineMesh` em `buildSceneObjects`,
    // acima. AJUSTADO (02/09/2026, correção do winding): agora a geometria
    // é PRÓPRIA do outline (não mais emprestada de `state.meshObj`, ver
    // `rebuildMeshGeometry` em modeler-mesh.js), então precisa do seu
    // próprio `.dispose()` aqui, igual ao material. `state.group.remove`/
    // `scene.remove(state.group)` (logo abaixo) já tira o outlineMesh da
    // cena (é filho do group) — não precisa de um `scene.remove` à parte,
    // diferente das luzes de lâmpada (essas SIM ficam direto na cena, ver
    // o bloco `state.lights` abaixo).
    state.outlineMesh?.geometry?.dispose();
    state.outlineMesh?.material?.dispose();
    state.outlineMesh = null;
    if (state.group) state.scene.remove(state.group);
    // NOVO (02/09/2026) — ver `state.lights` em modeler-core.js. Cada luz de
    // lâmpada foi adicionada DIRETO em `state.scene` (não dentro de
    // `state.group`, ver `_colocarLuzDaLampada` em modeler-input.js — assim
    // `updateLampLights` pode reposicioná-la em coordenadas de MUNDO todo
    // quadro, sem depender da ordem de remoção de `state.group`) — por isso
    // precisa ser removida da cena AQUI, à parte, senão a luz (e o gasto de
    // um laço a mais no shader) sobreviveria pra sempre, mesmo depois do
    // Modelador fechar.
    (state.lights || []).forEach((L) => { state.scene.remove(L.light); if (L.light.target) state.scene.remove(L.light.target); });
    state.lights = [];
    state.overlayCanvas?.remove();
    state.overlayCanvas = null;
    state.overlayCtx = null;
    state.fakeCursorEl?.remove();
    state.fakeCursorEl = null;
    state.group = state.meshObj = null;
  },

  _hexToColor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    return m ? parseInt(m[1], 16) : null;
  },

  /** NOVO (02/09/2026), pedido verbatim (item 12 da rodada de 13 itens):
   *  "As lâmpadas devem gerar luz de verdade de acordo com o tipo de
   *  lâmpada." Reposiciona cada `THREE.Light` de `state.lights` (criadas por
   *  `ModelerInput._colocarLuzDaLampada`) no centróide ATUAL (em coordenadas
   *  de mundo, via `_localToWorld` — acompanha `state.group`, então mover/
   *  girar/escalar a malha INTEIRA em Modo Objeto move a luz junto) dos
   *  vértices do marcador que a originou (`vOffset`/`vCount`, o mesmo
   *  intervalo gravado por `_colocarPrimitiva` pra "Ajustar Última
   *  Operação" — ver modeler-input.js). LIMITAÇÃO DOCUMENTADA (mesma raiz já
   *  aceita em `state._lastPrimitive`/`ModelerMesh.connectedFacesFrom`, ver
   *  comentário grande de B5): como `state.cm` é uma malha ÚNICA
   *  compartilhada, sem identidade de objeto persistente por face, um
   *  intervalo `[vOffset, vOffset+vCount)` só continua apontando pro MESMO
   *  marcador enquanto nenhuma operação de edição de malha (dissolver/
   *  colapsar/excluir/etc.) mexer em vértices ANTES dele (deslocando os
   *  índices) — inserir NOVAS primitivas depois (o caso comum) nunca afeta
   *  intervalos já gravados, já que `_colocarPrimitiva` sempre insere no
   *  FIM da malha pra uma peça nova. Se o intervalo ficar inválido (a malha
   *  encolheu abaixo dele — sinal de que os vértices do marcador foram
   *  apagados, ou pelo menos que o rastreamento não é mais confiável), a
   *  luz órfã é removida da cena, evitando um "laço extra no shader" pra
   *  sempre por uma luz que ninguém mais consegue ver/mexer. */
  updateLampLights(state) {
    if (!state.lights || !state.lights.length) return;
    for (let i = state.lights.length - 1; i >= 0; i--) {
      const L = state.lights[i];
      if (!L.vCount || L.vOffset < 0 || L.vOffset + L.vCount > state.cm.vertices.length) {
        state.scene.remove(L.light);
        if (L.light.target) state.scene.remove(L.light.target);
        state.lights.splice(i, 1);
        continue;
      }
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < L.vCount; k++) {
        const v = state.cm.vertices[L.vOffset + k];
        cx += v[0]; cy += v[1]; cz += v[2];
      }
      cx /= L.vCount; cy /= L.vCount; cz /= L.vCount;
      const world = this._localToWorld(state, [cx, cy, cz]);
      // "Hemi" (HemisphereLight) é o único tipo cuja iluminação NÃO depende
      // de estar perto do marcador — o Three.js usa a POSIÇÃO do próprio
      // objeto (relativa à origem do mundo) só pra decidir a direção "céu"
      // vs "chão" (ver WebGLLights.js `hemi.direction.setFromMatrixPosition`)
      // — perto demais da origem, essa direção fica fraca/ambígua. Sobe um
      // pouco (mundo +Y) a partir do marcador, garantindo uma direção "pra
      // cima" sempre clara, não importa onde o marcador esteja na malha.
      if (L.tipo === 'hemi') world.y += 3;
      L.light.position.copy(world);
      if (L.light.target) {
        // Sol/Spot: mira um ponto ABAIXO do marcador, de propósito — sem
        // rastreamento de ROTAÇÃO do marcador (só a posição, ver limitação
        // documentada acima), a simplificação escolhida é "toda lâmpada
        // direcional aponta pra baixo", igual uma luminária de teto de
        // verdade — a mesma convenção já usada pelas luzes de
        // luminária/poste do mapa (sempre pra baixo, ver engine3d.js).
        L.light.target.position.set(world.x, world.y - 1, world.z);
        L.light.target.updateMatrixWorld();
      } else if (L.tipo === 'area') {
        // RectAreaLight não tem `.target` — a direção é a orientação do
        // próprio objeto (emite pro -Z local, ver docs do Three.js) — mesma
        // convenção "sempre pra baixo" acima, via lookAt num ponto abaixo.
        L.light.lookAt(world.x, world.y - 1, world.z);
      }
    }
  },

  // ==================== projeção mundo -> tela ====================

  _resizeOverlayIfNeeded(state) {
    const rect = state.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const key = rect.width + 'x' + rect.height + '@' + dpr;
    if (state._overlaySizeKey === key) return { w: rect.width, h: rect.height };
    state._overlaySizeKey = key;
    const c = state.overlayCanvas;
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    c.style.width = rect.width + 'px';
    c.style.height = rect.height + 'px';
    state.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // desenha em coordenadas CSS (px "normais"), a densidade fica por conta do backing store
    state.overlayCtx.imageSmoothingEnabled = false;
    return { w: rect.width, h: rect.height };
  },

  /** Projeta um ponto em espaço de MUNDO pra coordenadas de TELA (px CSS do
   *  canvas) — devolve `null` se o ponto está atrás da câmera (projeção
   *  inválida). */
  _projectWorld(state, worldVec3, cssW, cssH) {
    const v = worldVec3.clone().project(state.camera);
    if (v.z > 1 || v.z < -1) return null; // fora do frustum em profundidade (bem perto/bem longe) — não deveria acontecer em uso normal
    return { x: (v.x + 1) / 2 * cssW, y: (1 - v.y) / 2 * cssH };
  },

  _localToWorld(state, local3) {
    return state.group.localToWorld(new state.THREE.Vector3(local3[0], local3[1], local3[2]));
  },

  // ==================== oclusão ====================

  /** Recalcula, pra cada vértice/aresta(ponto médio)/face(centróide), se ele
   *  está VISÍVEL (nada da própria malha bloqueia o raio câmera->ponto) ou
   *  OCULTO. Guardado em `state.occlusion` — usado tanto pro DESENHO
   *  (item 11/12/14) quanto pela SELEÇÃO quando "Limitar a seleção aos
   *  elementos visíveis" está ligado (ver modeler-input.js). */
  computeOcclusion(state) {
    const THREE = state.THREE;
    const ray = state.raycaster;
    const camPos = state.camera.position;
    const EPS = 0.01; // tolerância (m) — evita o próprio ponto testado contar como "bloqueio de si mesmo"
    const testPoint = (worldPos) => {
      const dir = new THREE.Vector3().subVectors(worldPos, camPos);
      const dist = dir.length();
      if (dist < 1e-5) return true;
      dir.normalize();
      ray.set(camPos, dir);
      ray.near = 0; ray.far = Math.max(0, dist - EPS);
      const hits = ray.intersectObject(state.meshObj, false);
      return hits.length === 0;
    };
    state.occlusion.vert = state.cm.vertices.map((v) => testPoint(this._localToWorld(state, v)));
    state.occlusion.edge = state.cm.edges.map(([a, b]) => {
      const pa = state.cm.vertices[a], pb = state.cm.vertices[b];
      if (!pa || !pb) return true;
      const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
      return testPoint(this._localToWorld(state, mid));
    });
    state.occlusion.face = state.cm.faces.map((f) => {
      if (!f || !f.length) return true;
      const c = f.reduce((acc, vi) => { const p = state.cm.vertices[vi]; return p ? [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]] : acc; }, [0, 0, 0]).map((v) => v / f.length);
      return testPoint(this._localToWorld(state, c));
    });
  },

  // ==================== ponto-em-tela auxiliares pra picking (modeler-input.js) ====================

  screenPositions(state, cssW, cssH) {
    const verts = state.cm.vertices.map((v) => this._projectWorld(state, this._localToWorld(state, v), cssW, cssH));
    return verts;
  },

  faceCentroidScreen(state, fi, cssW, cssH) {
    const f = state.cm.faces[fi];
    if (!f || !f.length) return null;
    const c = f.reduce((acc, vi) => { const p = state.cm.vertices[vi]; return p ? [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]] : acc; }, [0, 0, 0]).map((v) => v / f.length);
    return this._projectWorld(state, this._localToWorld(state, c), cssW, cssH);
  },

  // ==================== desenho ====================

  drawFrame(state) {
    const { w, h } = this._resizeOverlayIfNeeded(state);
    const ctx = state.overlayCtx;
    ctx.clearRect(0, 0, w, h);
    if (!state.group) return;

    // NOVO (02/09/2026) — ver `state.lights` (modeler-core.js) e
    // `updateLampLights` logo abaixo. Chamado a CADA quadro (não só quando a
    // malha muda) — mais simples e sempre correto do que tentar recalcular
    // só nos momentos "certos" (edições no meio de um arrasto de gizmo, por
    // exemplo, já rebuildam a malha a cada `mousemove`; recalcular aqui de
    // novo é redundante mas barato — poucos marcadores, um laço O(vértices
    // do marcador) cada, nunca a malha inteira).
    this.updateLampLights(state);
    // SUBSTITUÍDO (02/09/2026) — ver comentário grande em
    // `updateObjectOutline`, abaixo. Antes chamava `_drawObjectOutline`
    // (desenho 2D na `ctx` deste overlay); agora só liga/desliga a
    // visibilidade do `state.outlineMesh` (WebGL, casco invertido) — quem
    // desenha de verdade é o `renderer.render()` de sempre, fora daqui.
    this.updateObjectOutline(state);

    if (state.mode === 'edit') {
      this.computeOcclusion(state);
      const screenVerts = this.screenPositions(state, w, h);
      this._drawWireframeBase(state, ctx, screenVerts);
      if (state.selectMode === 'vertex') this._drawVertexMode(state, ctx, screenVerts, w, h);
      else if (state.selectMode === 'edge') this._drawEdgeMode(state, ctx, screenVerts, w, h);
      else this._drawFaceMode(state, ctx, screenVerts, w, h);
    }

    this._drawOriginDot(state, ctx, w, h);
    this._drawOrbitTargetDot(state, ctx, w, h);
    this._drawRotationGuideLine(state, ctx, w, h);
    this._drawWorldOrientationGizmo(state, ctx, w, h);
  },

  /** Linha tracejada PRETA entre o cursor do mouse e o centro do objeto —
   *  pedido do usuário: "Uma linha tracejada preta deve ser desenhada entre
   *  o cursor do mouse e o centro do objeto, quando se está em uma
   *  rotação" (rotação com eixo travado, `m.type==='R' && m.axis` — mesmo
   *  pivô/mesma projeção usados pelo cálculo do ângulo do "círculo
   *  imaginário", ver modeler-input.js `_updateModal`/`_projectScreenClient`
   *  — aqui só desenha, não recalcula nada da lógica de arrasto), e (rodada
   *  seguinte) "A mesma linha tracejada deve ser desenhado ao apertar S
   *  para escalar em todas as dimensões" — `m.type==='S'` (qualquer eixo,
   *  já que travar X/Y/Z durante um S não deixa de ser "escalar", só deixa
   *  de escalar TODAS as dimensões — desenhar o guia também nesse caso é
   *  inofensivo e mais consistente do que sumir no meio do arrasto). */
  _drawRotationGuideLine(state, ctx, w, h) {
    const m = state.modal;
    if (!m || !((m.type === 'R' && m.axis) || m.type === 'S')) return;
    const pivotP = this._projectWorld(state, m.pivot, w, h);
    if (!pivotP) return;
    const rect = state.canvas.getBoundingClientRect();
    const cursorP = { x: state.mouse.vx - rect.left, y: state.mouse.vy - rect.top };
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(pivotP.x) + 0.5, Math.round(pivotP.y) + 0.5);
    ctx.lineTo(Math.round(cursorP.x) + 0.5, Math.round(cursorP.y) + 0.5);
    ctx.stroke();
    ctx.restore();
  },

  /** Gizmo de orientação do mundo, canto inferior esquerdo, estilo Blender —
   *  pedido do usuário: "a orientação do mundo deve ser representada no
   *  canto inferior esquerdo como no Blender ... Cada reta (é apenas uma
   *  reta mesmo) representa um eixo e a letra fica na extremidade e à
   *  direita de seu eixo respectivo." Cada eixo do mundo (X/Y/Z, vetores
   *  unitários fixos) é projetado pro espaço da câmera usando o quaternion
   *  INVERSO da câmera (equivalente a "como esse eixo do mundo apareceria
   *  se a câmera estivesse olhando de frente, sem perspectiva" — é só
   *  orientação, não é uma projeção 3D de verdade, por isso não usa
   *  `_projectWorld`/matriz de projeção, e sim a camera-space diretamente,
   *  igual o gizmo de eixos do Blender que também não muda de tamanho com
   *  o zoom). x/y da camera-space viram x/y na tela (y invertido: +y da
   *  câmera é "pra cima", que na tela é Y menor). */
  _drawWorldOrientationGizmo(state, ctx, w, h) {
    if (!state.camera) return;
    const THREE = state.THREE;
    const invQuat = state.camera.quaternion.clone().invert();
    const axes = [
      { dir: new THREE.Vector3(1, 0, 0), color: this.COLORS.axisX, label: 'X' },
      { dir: new THREE.Vector3(0, 1, 0), color: this.COLORS.axisY, label: 'Y' },
      { dir: new THREE.Vector3(0, 0, 1), color: this.COLORS.axisZ, label: 'Z' },
    ];
    const CENTER = { x: 46, y: h - 46 };
    const LEN = 30;
    ctx.save();
    axes.forEach((a) => {
      const camSpace = a.dir.clone().applyQuaternion(invQuat);
      const sx = CENTER.x + camSpace.x * LEN;
      const sy = CENTER.y - camSpace.y * LEN;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(CENTER.x) + 0.5, Math.round(CENTER.y) + 0.5);
      ctx.lineTo(Math.round(sx) + 0.5, Math.round(sy) + 0.5);
      ctx.stroke();
      ctx.fillStyle = a.color;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.label, sx + 5, sy);
    });
    ctx.restore();
  },

  /** Base: TODAS as arestas, 1px preto — pedido do usuário: "as arestas do
   *  objeto devem ficar destacadas (apenas com um traço de 1px preto)".
   *  Ocultas: pedido do usuário (28/08/2026, rodada seguinte) — "A cor da
   *  coisas que ficam atrás (quando o 'Limitar visíveis' faz as coisas
   *  aparecerem) deve ser como se as arestas e vértices (o preto deles)
   *  estivessem atrás de faces transparentes... o efeito visual é de como
   *  se estivesse atrás de um plano cinza transparente. Não o cinza quase
   *  branco que é atualmente". Trocado de uma cor CINZA CLARA fixa e opaca
   *  (não "atravessava" visualmente nada — parecia flutuar por cima, não
   *  atrás) pra PRETO com `globalAlpha` reduzido: por ser um traço
   *  TRANSLÚCIDO desenhado sobre o canvas 2D (que é transparente, por cima
   *  do WebGL já renderizado — ver cabeçalho do arquivo), a mistura de
   *  verdade acontece com a cor real da face renderizada logo abaixo (cinza,
   *  na maioria dos objetos) — dá exatamente o efeito de "visto através de
   *  um vidro fosco cinza", em vez de uma cor fixa desconectada do que está
   *  por baixo. Mesmo `ALPHA_OCULTO` usado em `_drawVertexMode`/
   *  `_drawFaceMode` (ver `COLORS`), pra ficar visualmente consistente entre
   *  vértice/aresta/face ocultos. */
  _drawWireframeBase(state, ctx, screenVerts) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.COLORS.edgeVisible;
    state.cm.edges.forEach((e, ei) => {
      const pa = screenVerts[e[0]], pb = screenVerts[e[1]];
      if (!pa || !pb) return;
      const visible = state.occlusion.edge[ei] !== false;
      // "Limitar visíveis" DESLIGADO: aresta oculta nem é desenhada (pedido
      // do usuário, rodada seguinte: "os vértices e arestas... não devem
      // aparecer") — ligado (padrão), continua desenhada esmaecida.
      if (!visible && !state.limitToVisible) return;
      ctx.globalAlpha = visible ? 1 : this.COLORS.ALPHA_OCULTO;
      this._line1px(ctx, pa.x, pa.y, pb.x, pb.y);
    });
    ctx.restore();
  },

  /** Modo Vértice: quadrado 3x3 em cada vértice + regras de cor de aresta
   *  (gradiente/amarelo) + "destaque padrão" nas faces totalmente
   *  selecionadas. */
  _drawVertexMode(state, ctx, screenVerts, w, h) {
    const selSet = state.sel.verts;
    const active = state.activeVertex;
    // Arestas: entre 2 selecionados = amarela sólida; entre selecionado e
    // não-selecionado = gradiente amarelo->preto; as demais já ficaram com a
    // cor base (preto/cinza) desenhada em _drawWireframeBase.
    ctx.save();
    ctx.lineWidth = 1;
    state.cm.edges.forEach((e) => {
      const [a, b] = e;
      const selA = selSet.has(a), selB = selSet.has(b);
      if (!selA && !selB) return;
      const pa = screenVerts[a], pb = screenVerts[b];
      if (!pa || !pb) return;
      if (selA && selB) {
        ctx.strokeStyle = this.COLORS.selYellow;
        this._line1px(ctx, pa.x, pa.y, pb.x, pb.y);
      } else {
        const de = selA ? [pa, pb] : [pb, pa]; // de[0] = ponta selecionada (amarelo) -> de[1] = ponta não-selecionada (preto)
        const grad = ctx.createLinearGradient(de[0].x, de[0].y, de[1].x, de[1].y);
        grad.addColorStop(0, this.COLORS.selYellow);
        grad.addColorStop(1, this.COLORS.edgeVisible);
        ctx.strokeStyle = grad;
        this._line1px(ctx, pa.x, pa.y, pb.x, pb.y);
      }
    });
    ctx.restore();

    // Faces com TODOS os vértices selecionados -> destaque padrão
    const fullFaces = ModelerMesh.facesFullySelectedByVerts(state, selSet);
    this._drawFacesFill(state, ctx, fullFaces, w, h);

    // Quadradinhos de vértice
    state.cm.vertices.forEach((_, i) => {
      const p = screenVerts[i];
      if (!p) return;
      const occluded = state.occlusion.vert[i] === false;
      // "Limitar visíveis" DESLIGADO: vértice oculto não aparece de jeito
      // nenhum (nem esmaecido) — ligado (padrão), aparece esmaecido/"atrás
      // do vidro" (pedido do usuário).
      if (occluded && !state.limitToVisible) return;
      const hidden = state.limitToVisible && occluded;
      const isSel = selSet.has(i);
      const isActive = active === i;
      const color = isActive ? this.COLORS.selWhite : isSel ? this.COLORS.selYellow : this.COLORS.faceDot;
      ctx.save();
      ctx.globalAlpha = hidden ? this.COLORS.ALPHA_OCULTO : 1;
      ctx.fillStyle = color;
      this._filledSquare(ctx, p.x, p.y, 3);
      ctx.restore();
    });
  },

  /** Modo Aresta: última selecionada = branca; demais selecionadas =
   *  amarelas; sem quadradinhos de face/vértice; faces 100% selecionadas
   *  ganham destaque padrão. */
  _drawEdgeMode(state, ctx, screenVerts, w, h) {
    const last = state.activeEdge;
    ctx.save();
    ctx.lineWidth = 1;
    state.sel.edges.forEach((ei) => {
      const e = state.cm.edges[ei];
      if (!e) return;
      const pa = screenVerts[e[0]], pb = screenVerts[e[1]];
      if (!pa || !pb) return;
      ctx.strokeStyle = ei === last ? this.COLORS.selWhite : this.COLORS.selYellow;
      this._line1px(ctx, pa.x, pa.y, pb.x, pb.y);
    });
    ctx.restore();
    const fullFaces = ModelerMesh.facesFullySelectedByEdges(state);
    this._drawFacesFill(state, ctx, fullFaces, w, h);
  },

  /** Modo Face: quadradinho 4x4 (ou 2x2 esmaecido se oculta e "limitar aos
   *  visíveis" ligado) no centro de cada face; faces selecionadas ganham o
   *  destaque padrão (preenchimento translúcido). */
  _drawFaceMode(state, ctx, screenVerts, w, h) {
    this._drawFacesFill(state, ctx, [...state.sel.faces], w, h);
    state.cm.faces.forEach((f, fi) => {
      const p = this.faceCentroidScreen(state, fi, w, h);
      if (!p) return;
      const occluded = state.occlusion.face[fi] === false;
      // "Limitar visíveis" DESLIGADO: quadradinho da face oculta some por
      // completo — ligado (padrão), continua aparecendo menor/esmaecido
      // ("atrás de uma face transparente", pedido do usuário).
      if (occluded && !state.limitToVisible) return;
      const hidden = state.limitToVisible && occluded;
      ctx.save();
      ctx.globalAlpha = hidden ? this.COLORS.ALPHA_OCULTO : 1;
      ctx.fillStyle = this.COLORS.faceDot;
      this._filledSquare(ctx, p.x, p.y, hidden ? 2 : 4);
      ctx.restore();
    });
  },

  /** Preenchimento translúcido "destaque padrão" pras faces em `faceIdxs`
   *  (reaproveitado pelos 3 submodos — clique direto em Modo Face, ou
   *  automático quando TODOS os vértices/arestas de uma face estão
   *  selecionados nos outros dois submodos). */
  _drawFacesFill(state, ctx, faceIdxs, w, h) {
    if (!faceIdxs || !faceIdxs.length) return;
    ctx.save();
    ctx.fillStyle = this.COLORS.faceFillSel;
    faceIdxs.forEach((fi) => {
      const f = state.cm.faces[fi];
      if (!f) return;
      const pts = f.map((vi) => {
        const v = state.cm.vertices[vi];
        return v ? this._projectWorld(state, this._localToWorld(state, v), w, h) : null;
      });
      if (pts.some((p) => !p)) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  },

  /** SUBSTITUÍDO (02/09/2026), pedido verbatim (item 6 da rodada de 13
   *  itens): "Para fazer apenas o contorno (silhueta) dos objetos na tela,
   *  use o método do casco invertido (Inverted Hull) ou renderize a imagem
   *  em um buffer, pegue o contorno, depois, imprima o render no canvas
   *  final e aplique a silhueta dourada." HISTÓRICO (por que existia uma
   *  varredura radial de 720 amostras em CPU, sobre o canvas 2D de overlay,
   *  no lugar disso): v1 fecho convexo 2D, v2 topologia de aresta de
   *  fronteira, v3 (a removida agora) varredura radial "de fora pra dentro"
   *  a partir do centro projetado — as três eram tentativas de RECRIAR, a
   *  mão, o mesmo resultado que o casco invertido já dá de graça na GPU. O
   *  pedido desta rodada pede EXPLICITAMENTE a técnica certa pro problema:
   *  duplicar a malha, material de cor sólida renderizado só pelo LADO DE
   *  DENTRO (`THREE.BackSide`) e ligeiramente maior — a face de trás de uma
   *  cópia maior "vaza" exatamente pela borda visível da malha original de
   *  todo ângulo, formando uma silhueta uniforme sem NENHUMA aresta interna
   *  (o problema inteiro que as 3 versões de CPU tentavam resolver por
   *  fora). `state.outlineMesh` (ver `buildSceneObjects`/
   *  `disposeSceneObjects` acima) é OUTRO `THREE.Mesh`, filho do MESMO
   *  `state.group` que `state.meshObj`, com escala LOCAL um pouco maior
   *  (`OUTLINE_SCALE`) e material `MeshBasicMaterial` (sem luz — cor sólida
   *  de verdade, não um tom "iluminado") na cor dourada de sempre
   *  (`COLORS.outline`, reaproveitada). Renderizado pelo WebGL normal,
   *  JUNTO da malha sólida — não pelo canvas 2D de overlay (por isso esta
   *  função não recebe `ctx` nem `w`/`h` — só liga/desliga a visibilidade;
   *  quem efetivamente desenha é o próprio `renderer.render()` de sempre,
   *  ver `_renderLoop` em modeler-core.js). Visível só em Modo Objeto com o
   *  objeto selecionado — MESMA condição de antes (ver `drawFrame`).
   *  AJUSTADO (02/09/2026, correção do bug do "blob dourado sólido" — ver
   *  comentário grande em `rebuildMeshGeometry`, modeler-mesh.js): a
   *  geometria do outline NÃO é mais compartilhada por referência com
   *  `state.meshObj.geometry` — é uma `BufferGeometry` PRÓPRIA, com winding
   *  corrigido pra funcionar corretamente com `side: THREE.BackSide`,
   *  reconstruída junto (por `rebuildMeshGeometry`) toda vez que a malha
   *  muda. Por isso esta função não precisa mais resolver/sincronizar
   *  referência de geometria nenhuma — só liga/desliga `.visible`. */
  updateObjectOutline(state) {
    state.outlineMesh.visible = state.mode !== 'edit' && !!state.objectSelected;
  },

  /** Bolinha da origem local do objeto — pedido do usuário: "um círculo de
   *  7px x 7px amarelo desbotado embranquecido de preenchimento e contorno
   *  preto". Visível nos DOIS modos. */
  _drawOriginDot(state, ctx, w, h) {
    const p = this._projectWorld(state, state.group.position.clone(), w, h);
    if (!p) return;
    const R = 3; // raio 3 + contorno 1 = diâmetro total 7
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fillStyle = this.COLORS.originFill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.COLORS.originStroke;
    ctx.stroke();
    ctx.restore();
  },

  /** Bolinha do ponto fixo que a câmera Órbita do Modelador sempre mira —
   *  pedido do usuário: "No modo Modelador, com a câmera orbital, ela fica
   *  apontando para um ponto fixo no espaço do mundo. Faça com que esse
   *  ponto seja vísivel. Uma opção nas 'configurações 3D' deve habilitar/
   *  desabilitar a exibição desse ponto." Só faz sentido no modo de câmera
   *  ÓRBITA (`state.camPosMode`) — no modo Livre não existe esse ponto (a
   *  câmera não mira nada fixo, ver `Modeler3D._updateFreeCamera`). Opção
   *  em `MapConfig.DEFAULTS.modeladorMostrarAlvoOrbital` (ver mapconfig.js,
   *  seção "🐞 Debug"), lida do MESMO cache já usado por `state.view3d`
   *  pras outras opções de configuração 3D (`_paredeConfig`, apesar do
   *  nome — guarda o snapshot inteiro, não só de paredes). */
  _drawOrbitTargetDot(state, ctx, w, h) {
    if (state.camPosMode !== 'orbit') return;
    const cfg = state.view3d?._paredeConfig || (typeof MapConfig !== 'undefined' ? MapConfig._cache : null) || {};
    if (cfg.modeladorMostrarAlvoOrbital === false) return;
    const t = state.orbit?.target;
    if (!t) return;
    const p = this._projectWorld(state, new state.THREE.Vector3(t.x, t.y, t.z), w, h);
    if (!p) return;
    const R = 4;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fillStyle = this.COLORS.orbitTargetFill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.COLORS.orbitTargetStroke;
    ctx.stroke();
    // Cruzinha por cima (igual a uma mira) pra diferenciar visualmente da
    // bolinha lisa da origem do objeto, mesmo sendo cores diferentes.
    ctx.beginPath();
    ctx.moveTo(p.x - R - 3, p.y); ctx.lineTo(p.x + R + 3, p.y);
    ctx.moveTo(p.x, p.y - R - 3); ctx.lineTo(p.x, p.y + R + 3);
    ctx.strokeStyle = this.COLORS.orbitTargetStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  },

  // ==================== utilidades de desenho ====================

  /** Linha de 1px NÍTIDA — a técnica clássica do Canvas 2D: arredonda pra
   *  coordenada inteira e soma 0.5, senão uma linha de 1px em cima de uma
   *  coordenada inteira cai bem na fronteira entre 2 pixels e o navegador
   *  desenha os DOIS pela metade (borrado) em vez de 1 pixel cheio. */
  _line1px(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
    ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
    ctx.stroke();
  },

  _filledSquare(ctx, cx, cy, size) {
    const half = size / 2;
    ctx.fillRect(Math.round(cx - half), Math.round(cy - half), size, size);
  },

  /** Fecho convexo 2D (monotone chain) — mesma técnica/algoritmo de
   *  `Engine3D._convexHull2D` (engine3d.js), reimplementado aqui (módulo
   *  separado, sem depender de engine3d.js — ver pedido de modularização) —
   *  duplicação pequena e deliberada. */
  _convexHull2D(points) {
    const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
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
  },

  // ==================== picking em espaço de TELA (usado por modeler-input.js) ====================

  _distSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 1e-6 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  },

  _pointInConvexPolygon(px, py, poly) {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
      if (Math.abs(cross) < 1e-9) continue;
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  },

  /** Acha o elemento (vértice/aresta/face, conforme `state.selectMode`) mais
   *  perto do clique (px,py em CSS-px do canvas) — em espaço de TELA, não
   *  raycasting 3D (mais direto dado que o overlay já projeta tudo).
   *  Respeita `state.limitToVisible` (item pedido pelo usuário — "Limitar a
   *  seleção aos elementos visíveis"): SÓ dá pra clicar num elemento oculto
   *  se ele estiver de fato DESENHADO na tela (ver _drawWireframeBase/
   *  _drawVertexMode/_drawFaceMode — mesma condição, agora espelhada aqui) —
   *  ligado (padrão), o elemento oculto aparece esmaecido/atrás de "vidro" e
   *  PODE ser clicado através da face (é o que o quadradinho esmaecido serve
   *  pra fazer, pedido do usuário: "esse quadrado tem sua utilidade, é para
   *  facilitar a seleção da face certa quando 'Limitar a seleção aos
   *  elementos visíveis' estiver ativo"); desligado, o elemento oculto nem
   *  aparece (pedido do usuário, rodada seguinte: "os vértices e arestas...
   *  não devem aparecer"), então também não tem como clicar nele — nunca
   *  fica "invisível mas ainda clicável". */
  pickElementAtScreen(state, clientX, clientY) {
    const rect = state.canvas.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    const w = rect.width, h = rect.height;
    const screenVerts = this.screenPositions(state, w, h);
    if (state.selectMode === 'vertex') {
      let best = -1, bestD = 12;
      state.cm.vertices.forEach((_, i) => {
        if (!state.limitToVisible && state.occlusion.vert[i] === false) return;
        const p = screenVerts[i];
        if (!p) return;
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best >= 0 ? { type: 'vertex', index: best } : null;
    }
    if (state.selectMode === 'edge') {
      let best = -1, bestD = 8;
      state.cm.edges.forEach((e, ei) => {
        if (!state.limitToVisible && state.occlusion.edge[ei] === false) return;
        const pa = screenVerts[e[0]], pb = screenVerts[e[1]];
        if (!pa || !pb) return;
        const d = this._distSeg(px, py, pa.x, pa.y, pb.x, pb.y);
        if (d < bestD) { bestD = d; best = ei; }
      });
      return best >= 0 ? { type: 'edge', index: best } : null;
    }
    // face: prioriza o quadradinho central (mais previsível) e cai pra
    // "ponto dentro do polígono" como alternativa
    let best = -1, bestD = 10;
    state.cm.faces.forEach((f, fi) => {
      if (!state.limitToVisible && state.occlusion.face[fi] === false) return;
      const c = this.faceCentroidScreen(state, fi, w, h);
      if (c) { const d = Math.hypot(c.x - px, c.y - py); if (d < bestD) { bestD = d; best = fi; } }
    });
    if (best >= 0) return { type: 'face', index: best };
    for (let fi = 0; fi < state.cm.faces.length; fi++) {
      if (!state.limitToVisible && state.occlusion.face[fi] === false) continue;
      const f = state.cm.faces[fi];
      const pts = f.map((vi) => screenVerts[vi]).filter(Boolean);
      if (pts.length === f.length && this._pointInConvexPolygon(px, py, pts)) return { type: 'face', index: fi };
    }
    return null;
  },

  /** Modo Objeto: testa se o clique caiu dentro da silhueta (fecho convexo)
   *  projetada do objeto inteiro. */
  pickObjectAtScreen(state, clientX, clientY) {
    const rect = state.canvas.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    const pts = this.screenPositions(state, rect.width, rect.height).filter(Boolean);
    if (pts.length < 3) return false;
    const hull = this._convexHull2D(pts);
    return this._pointInConvexPolygon(px, py, hull);
  },
};

window.ModelerRender = ModelerRender;
