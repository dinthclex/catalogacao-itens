/**
 * modeler-gizmo.js — Modelador 3D: os 3 gizmos (Mover/Girar/Escalar) e o
 * sistema de PICKING PIXEL PERFECT deles.
 *
 * BUG relatado pelo usuário (28/08/2026): "O gizmo não está funcionando como
 * deveria (clica no verde, que deveria girar no y das coordenadas do mundo,
 * mas acaba girando outro eixo, por exemplo)". Causa: a versão anterior
 * detectava o eixo clicado via `Raycaster.intersectObject` contra a
 * geometria 3D fina das setas/anéis/hastes — com o gizmo reescalado a cada
 * quadro pra manter tamanho aparente constante (ver updateGizmo) e as 3
 * hastes bem próximas umas das outras perto da origem, o raio podia acertar
 * a BORDA de uma haste vizinha por engano (ambiguidade normal de
 * raycasting contra geometria fina — o Blender de verdade tem o MESMO
 * problema de vez em quando com o "orbit gizmo" antigo, e é por isso que
 * ferramentas profissionais usam a técnica abaixo).
 *
 * CORREÇÃO — "GPU picking" (técnica padrão da indústria, pedida
 * explicitamente pelo usuário): em vez de raycasting 3D, `pickPixelPerfect`
 * pinta cada handle do gizmo ATIVO com uma cor SÓLIDA e ÚNICA por eixo (sem
 * luz, sem antialiasing — `MeshBasicMaterial` + `NoToneMapping`), renderiza
 * isso (só o gizmo — o resto da cena fica escondido) num
 * `THREE.WebGLRenderTarget` do tamanho do canvas, e LÊ O PIXEL exato da
 * posição do clique com `renderer.readRenderTargetPixels` — zero
 * ambiguidade, é literalmente perguntar pro GPU "que cor está bem aqui".
 * Reaproveita o MESMO `WebGLRenderer` da engine (não abre um 2º contexto
 * WebGL — contextos são um recurso limitado no navegador, ver o comentário
 * já existente sobre isso em view3d.js `unmount()`/engine3d.js `dispose()`)
 * e o resultado é totalmente imperceptível pro usuário: o "frame de
 * picking" nunca chega a ser apresentado na tela (é desenhado, lido e
 * desfeito de forma síncrona, antes do navegador ter chance de pintar
 * aquele quadro).
 */

const ModelerGizmo = {
  // Cores de EXIBIÇÃO (suaves, "de marca") dos 3 eixos — usadas no gizmo em
  // si (build) e na linha infinita de eixo em destaque durante o giro (ver
  // `update`). DIFERENTES das cores PURAS (`AXIS_COLOR` dentro de
  // `pickPixelPerfect`) usadas só no frame de picking (essas precisam ser
  // r/g/b puros pra leitura de pixel não dar ambíguo).
  DISPLAY_COLORS: { x: 0xff3352, y: 0x8bdc00, z: 0x2c8fff },

  objAnguloToRotY(angulo) { return -(angulo || 0); }, // MESMA fórmula de engine3d.js objAnguloToRotY

  /** Pedido do usuário: "deve haver um botão para selecionar como a
   *  rotação será feita assim como é no Blender" — `state.xform.
   *  rotationMode` (ver modeler-ui.js `_buildObjectTransformPanel`) escolhe
   *  a ORDEM de composição dos 3 ângulos (`rotation.order`, suportado
   *  nativamente pelo Three.js pras 6 permutações XYZ/XZY/YXZ/YZX/ZXY/ZYX).
   *  Modos que não são uma dessas 6 ordens (Axis Angle/Quaternion —
   *  simplificados, ver comentário em modeler-ui.js — e "Paralelo ao eixo
   *  do mundo", que edita o quaternion DIRETO em vez de passar por aqui,
   *  ver `commitRotationField`) caem em 'XYZ': nesses casos
   *  `state.xform.rotX/Y/Z` já são a releitura Euler-XYZ da orientação de
   *  verdade (quaternion), então reaplicar em ordem XYZ reproduz
   *  exatamente a mesma orientação — nunca "pula" o objeto pra outro
   *  lugar. */
  applyXformToGroup(state) {
    const xf = state.xform;
    const eulerOrders = ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'];
    state.group.rotation.order = eulerOrders.includes(xf.rotationMode) ? xf.rotationMode : 'XYZ';
    state.group.rotation.set(xf.rotX || 0, this.objAnguloToRotY(state.obj.angulo) + (xf.rotY || 0), xf.rotZ || 0);
    state.group.scale.set(xf.scaleX || 1, xf.scaleY || 1, xf.scaleZ || 1);
  },

  /** Pivô ATUAL em espaço de MUNDO — origem do objeto em Modo Objeto, centro
   *  (média) dos vértices selecionados em Modo de Edição. */
  worldPivot(state) {
    const THREE = state.THREE;
    if (state.mode === 'object' || !state.group) return state.group ? state.group.position.clone() : new THREE.Vector3();
    const idxs = ModelerMesh.selectedVertexIndices(state);
    if (!idxs.length) return state.group.position.clone();
    let sx = 0, sy = 0, sz = 0;
    idxs.forEach((i) => { const v = state.cm.vertices[i]; sx += v[0]; sy += v[1]; sz += v[2]; });
    const local = new THREE.Vector3(sx / idxs.length, sy / idxs.length, sz / idxs.length);
    return state.group.localToWorld(local);
  },

  /** Constrói os 3 tipos de gizmo — cores exatas pedidas: X vermelho, Y
   *  verde, Z azul. Ficam FORA de `state.group` de propósito (adicionados
   *  direto na cena): as setas/anéis/hastes NÃO herdam a rotação/escala do
   *  objeto (orientação Global, sempre — simplificação documentada, sem
   *  suporte a eixo LOCAL via 2ª tecla). */
  build(state) {
    const THREE = state.THREE;
    const COLORS = this.DISPLAY_COLORS;
    const AXES = ['x', 'y', 'z'];
    const alignToAxis = (obj3d, axis) => {
      if (axis === 'x') obj3d.rotation.z = -Math.PI / 2;
      else if (axis === 'z') obj3d.rotation.x = Math.PI / 2;
    };
    const gizmoMat = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false });

    // CORRIGIDO (01/09/2026) — pedido verbatim: "O 'editar' dos modelos 3D
    // parece estar com baixíssima resolução tanto para o preenchimento do
    // modelo quanto para o gizmo." As hastes/pontas/anéis do gizmo usavam
    // só 8/10 segmentos radiais (visivelmente facetado de perto, ficando
    // "poligonal" em vez de redondo) — aumentado pra 20/16/16 (haste/
    // ponta-cone/anel), continua leve (o gizmo inteiro tem poucas dezenas de
    // triângulos a mais, imperceptível em performance) mas sem facetas
    // visíveis. Mesma troca replicada no gizmoScale abaixo.
    state.gizmoMove = new THREE.Group();
    AXES.forEach((axis) => {
      const part = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 20), gizmoMat(COLORS[axis]));
      shaft.position.y = 0.35;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 16), gizmoMat(COLORS[axis]));
      tip.position.y = 0.78;
      part.add(shaft, tip);
      alignToAxis(part, axis);
      part.userData.axis = axis;
      part.traverse((o) => { if (o.isMesh) { o.userData.axis = axis; o.renderOrder = 100; } });
      state.gizmoMove.add(part);
    });
    state.scene.add(state.gizmoMove);

    state.gizmoRotate = new THREE.Group();
    AXES.forEach((axis) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.014, 16, 48), gizmoMat(COLORS[axis]));
      if (axis === 'x') ring.rotation.y = Math.PI / 2;
      else if (axis === 'y') ring.rotation.x = Math.PI / 2;
      ring.userData.axis = axis;
      ring.renderOrder = 100;
      state.gizmoRotate.add(ring);
    });
    state.scene.add(state.gizmoRotate);

    state.gizmoScale = new THREE.Group();
    AXES.forEach((axis) => {
      const part = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 20), gizmoMat(COLORS[axis]));
      shaft.position.y = 0.3;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), gizmoMat(COLORS[axis]));
      tip.position.y = 0.65;
      part.add(shaft, tip);
      alignToAxis(part, axis);
      part.userData.axis = axis;
      part.traverse((o) => { if (o.isMesh) { o.userData.axis = axis; o.renderOrder = 100; } });
      state.gizmoScale.add(part);
    });
    state.scene.add(state.gizmoScale);

    // Linha "infinita" de eixo em destaque — pedido do usuário: "Ao girar um
    // eixo, enquanto gira o gizmo desaparece e o eixo de giro fica
    // destacado com sua respectiva cor e com uma linha infinita." Um único
    // segmento comprido (bem mais longo que qualquer coisa que caiba na
    // tela — ver `update`), reaproveitado (cor/posição atualizadas a cada
    // quadro em vez de recriar), escondido por padrão.
    state.gizmoAxisLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    state.gizmoAxisLine.visible = false;
    state.gizmoAxisLine.renderOrder = 99; // logo abaixo dos handles (100) — não que importe muito, já que o gizmo some junto
    state.scene.add(state.gizmoAxisLine);
  },

  /** Reposiciona o gizmo ATIVO no pivô atual e reescala pra manter tamanho
   *  aparente ~constante (independente da distância da câmera). Some
   *  durante um modal em andamento SEM eixo travado ainda (não atrapalha a
   *  leitura do movimento livre).
   *
   *  Pedido do usuário (rodada seguinte): "Ao girar um eixo, enquanto gira o
   *  gizmo desaparece e o eixo de giro fica destacado com sua respectiva
   *  cor e com uma linha infinita." — durante um arrasto de ROTAÇÃO com
   *  eixo TRAVADO (diferente do `hideDuringFreeModal` acima, que já
   *  escondia só quando ainda NÃO tinha eixo escolhido), os 3 gizmos somem
   *  TAMBÉM, e no lugar aparece `state.gizmoAxisLine` — um segmento bem
   *  comprido atravessando o pivô na direção do eixo travado, na cor exata
   *  daquele eixo (`DISPLAY_COLORS`), simulando uma "reta infinita" (Blender
   *  faz exatamente isso ao girar por um eixo travado). */
  update(state) {
    const pivot = this.worldPivot(state);
    state.gizmoPivot = pivot; // cacheado — modeler-render.js usa pro círculo de origem
    const dist = pivot.distanceTo(state.camera.position);
    // Pedido do usuário: "Aumente o tamanho do gizmo (de posição, de rotação
    // e de escala) 35%." — os 3 gizmos (move/rotate/scale) passam por este
    // MESMO `update()` (ver `active` embaixo), então um único fator aqui já
    // cobre os 3. Como a picking (ver comentário grande no topo do arquivo/
    // rodada da picking GPU pixel-perfeita) usa o MESMO `active.scale` pra
    // renderizar o buffer de seleção, aumentar isto também aumenta
    // proporcionalmente a área clicável dos handles — sem precisar mexer em
    // nenhum raio/tolerância de picking à parte.
    const GIZMO_SIZE_MULT = 1.35;
    const scale = Math.max(0.4, dist * 0.16) * GIZMO_SIZE_MULT;
    [state.gizmoMove, state.gizmoRotate, state.gizmoScale].forEach((g) => { g.visible = false; });

    // Pedido do usuário (rodada 46): "No gizmo de 'Mover', ao clicar em um
    // eixo, o gizmo deve desaparecer. E uma linha infinita deve aparecer no
    // eixo correspondente do objeto. O mesmo deve acontecer com o gizmo de
    // 'Escala'. Assim, os 3 modos (Mover, Girar e Escalar) ficam nesse
    // mesmo formato de visualização." — antes só o Girar ('R') tinha esse
    // tratamento (`activeRotationAxis`, nome antigo); agora qualquer um dos
    // 3 tipos de modal (G/R/S) COM EIXO TRAVADO conta.
    const activeAxisModal = (state.modal && state.modal.axis && (state.modal.type === 'G' || state.modal.type === 'R' || state.modal.type === 'S')) ? state.modal.axis : null;
    if (activeAxisModal && state.gizmoAxisLine) {
      const THREE = state.THREE;
      const dir = new THREE.Vector3(activeAxisModal === 'x' ? 1 : 0, activeAxisModal === 'y' ? 1 : 0, activeAxisModal === 'z' ? 1 : 0);
      // Comprimento generoso o bastante pra atravessar a tela toda em
      // qualquer distância de câmera/zoom razoável deste modelador (a órbita
      // fica sempre entre 1,2m e 8m de distância — ver modeler-core.js
      // `_initOrbitFromCamera`/`_updateOrbitCamera`) — não é literalmente
      // infinito (Three.js/WebGL não têm essa noção), só bem mais comprido
      // que qualquer coisa que caiba no viewport.
      const halfLen = Math.max(50, dist * 20);
      const a = pivot.clone().addScaledVector(dir, -halfLen);
      const b = pivot.clone().addScaledVector(dir, halfLen);
      const posAttr = state.gizmoAxisLine.geometry.attributes.position;
      posAttr.setXYZ(0, a.x, a.y, a.z);
      posAttr.setXYZ(1, b.x, b.y, b.z);
      posAttr.needsUpdate = true;
      state.gizmoAxisLine.geometry.computeBoundingSphere();
      state.gizmoAxisLine.material.color.setHex(this.DISPLAY_COLORS[activeAxisModal]);
      state.gizmoAxisLine.visible = true;
      return; // gizmos normais ficam escondidos (já postos invisible acima)
    }
    if (state.gizmoAxisLine) state.gizmoAxisLine.visible = false;

    const hideDuringFreeModal = state.modal && !state.modal.axis && (state.modal.type === 'G' || state.modal.type === 'R' || state.modal.type === 'S');
    // CORRIGIDO (03/09/2026), pedido verbatim: "No 'Ver em 3D', no
    // Modelador, ao deletar um objeto, acaba ficando ainda o seu gizmo como
    // se houvesse algum resquicio do objeto." Causa raiz: este `update()`
    // so escondia o gizmo (early return, gizmos ja postos invisible la em
    // cima) quando `state.mode === 'edit'` SEM vertices selecionados -- em
    // Modo Objeto nunca checava `state.objectSelected` (ModelerInput.
    // _deleteWholeObject/_deleteWholeObjectFromEdit zeram objectSelected e
    // esvaziam state.cm, mas o gizmo continuava reaparecendo todo quadro em
    // `worldPivot(state)`, que sem vertices cai no fallback da origem do
    // grupo (0,0,0) -- por isso o "fantasma" ficava visivel ali). Novo
    // ramo: Modo Objeto sem objeto selecionado tambem esconde os 3 gizmos.
    if (hideDuringFreeModal || (state.mode === 'edit' && !ModelerMesh.selectedVertexIndices(state).length) || (state.mode === 'object' && !state.objectSelected)) return;
    const active = state.gizmoMode === 'move' ? state.gizmoMove : state.gizmoMode === 'rotate' ? state.gizmoRotate : state.gizmoScale;
    active.visible = true;
    active.position.copy(pivot);
    active.scale.setScalar(scale);
  },

  _activeGizmoGroup(state) {
    return state.gizmoMode === 'move' ? state.gizmoMove : state.gizmoMode === 'rotate' ? state.gizmoRotate : state.gizmoScale;
  },

  /** GPU picking pixel-perfect (ver cabeçalho do arquivo) — devolve 'x'/'y'/
   *  'z' ou null (nenhum handle sob o cursor). `clientX/clientY`: coordenadas
   *  de tela (as mesmas de um MouseEvent). */
  pickPixelPerfect(state, clientX, clientY) {
    const active = this._activeGizmoGroup(state);
    if (!active || !active.visible) return null;
    const THREE = state.THREE;
    const renderer = state.view3d._engine.renderer;
    const rect = state.canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const dpr = renderer.getPixelRatio();
    const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
    if (!state.pickRT || state.pickRT.width !== w || state.pickRT.height !== h) {
      state.pickRT?.dispose();
      state.pickRT = new THREE.WebGLRenderTarget(w, h);
    }
    // Esconde TUDO da cena, exceto o gizmo ativo, e troca os materiais dele
    // por cores sólidas ÚNICAS por eixo — restaura tudo logo depois (síncrono,
    // dentro do mesmo tick de JS — o navegador nunca chega a apresentar este
    // quadro intermediário).
    const savedVisible = [];
    state.scene.children.forEach((child) => { savedVisible.push([child, child.visible]); if (child !== active) child.visible = false; });
    const savedMats = [];
    const AXIS_COLOR = { x: 0xff0000, y: 0x00ff00, z: 0x0000ff };
    active.traverse((o) => {
      if (o.isMesh) {
        savedMats.push([o, o.material]);
        o.material = new THREE.MeshBasicMaterial({ color: AXIS_COLOR[o.userData.axis] ?? 0x000000 });
      }
    });
    const savedBg = state.scene.background;
    state.scene.background = new THREE.Color(0x000000); // preto = "nenhum eixo" (não bate com r/g/b puros)
    const savedTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;

    renderer.setRenderTarget(state.pickRT);
    renderer.render(state.scene, state.camera);
    renderer.setRenderTarget(null);

    // Pedido do usuário: "O teste dos círculos de giro não deve ser mais só
    // pixel perfect deve ser por região. Pois, às vezes, os círculos ficam
    // muito finos e fica difícil de clicar neles." Em vez de ler 1 pixel
    // exato embaixo do cursor, lê um BLOCO de pixels (um quadrado de
    // tolerância em volta do cursor, ~6px CSS de raio — suficiente pra
    // acertar o anel/haste fina do gizmo sem precisar de precisão de
    // pixel) e escolhe o eixo do pixel de cor válida MAIS PRÓXIMO do centro
    // exato do clique (não simplesmente "o primeiro achado") — evita
    // ambiguidade quando dois handles finos ficam perto o bastante um do
    // outro pra os dois caberem na mesma janela de tolerância.
    const TOLERANCE_CSS_PX = 6;
    const radiusDev = Math.max(1, Math.round(TOLERANCE_CSS_PX * dpr));
    const cxDev = Math.round((clientX - rect.left) * dpr);
    const cyDevTop = Math.round((clientY - rect.top) * dpr); // "topo pra baixo" (DOM) — convertido pra baixo-pra-cima (WebGL) só na hora de ler
    const x0 = Math.max(0, cxDev - radiusDev), x1 = Math.min(w - 1, cxDev + radiusDev);
    const y0Top = Math.max(0, cyDevTop - radiusDev), y1Top = Math.min(h - 1, cyDevTop + radiusDev);
    const blockW = Math.max(1, x1 - x0 + 1), blockH = Math.max(1, y1Top - y0Top + 1);
    // BUG achado testando à mão (script Node isolado, fora do app, simulando
    // um framebuffer WebGL "de baixo pra cima" com pixels em posições
    // conhecidas): faltava o "-1" — WebGL numera a linha de BAIXO da imagem
    // como y=0 e a de CIMA como y=h-1 (não y=h). Sem o "-1", o bloco lido
    // ficava sistematicamente deslocado 1px, e em cantos perto da borda de
    // BAIXO/DIREITA da tela a leitura caía inteiramente fora dos limites do
    // render target (nenhum pixel válido lido, então o gizmo naquele canto
    // nunca era detectado como clicado). Confirmado corrigido reproduzindo o
    // mesmo teste depois da correção — bate exato (distância 0) em todos os
    // casos, incluindo os 4 cantos da tela.
    let rtY0 = (h - 1) - y1Top; // WebGL y da linha de CIMA do bloco (topo-pra-baixo y1Top é a linha mais BAIXA na tela)
    if (rtY0 < 0) rtY0 = 0;
    if (rtY0 + blockH > h) rtY0 = Math.max(0, h - blockH);
    let axis = null;
    try {
      const buffer = new Uint8Array(blockW * blockH * 4);
      renderer.readRenderTargetPixels(state.pickRT, x0, rtY0, blockW, blockH, buffer);
      let bestDist2 = Infinity;
      for (let row = 0; row < blockH; row++) {
        for (let col = 0; col < blockW; col++) {
          const idx = (row * blockW + col) * 4;
          const r = buffer[idx], g = buffer[idx + 1], b = buffer[idx + 2];
          let a = null;
          if (r > 200 && g < 80 && b < 80) a = 'x';
          else if (g > 200 && r < 80 && b < 80) a = 'y';
          else if (b > 200 && r < 80 && g < 80) a = 'z';
          if (!a) continue;
          const pxDev = x0 + col;
          const pyDevTop = y1Top - row; // linha 0 do buffer = topo do bloco em WebGL = y1Top em topo-pra-baixo; sobe conforme row cresce
          const dx = pxDev - cxDev, dy = pyDevTop - cyDevTop;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < bestDist2) { bestDist2 = dist2; axis = a; }
        }
      }
    } catch (e) { /* leitura fora dos limites do target ou WebGL indisponível — sem gizmo clicado, comportamento igual a null */ }

    // restaura
    active.traverse((o) => { if (o.isMesh) { const found = savedMats.find(([m]) => m === o); if (found) o.material = found[1]; } });
    savedVisible.forEach(([child, vis]) => { child.visible = vis; });
    state.scene.background = savedBg;
    renderer.toneMapping = savedTone;

    return axis;
  },

  dispose(state) {
    [state.gizmoMove, state.gizmoRotate, state.gizmoScale].forEach((g) => {
      if (!g) return;
      state.scene.remove(g);
      g.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose(); } });
    });
    state.gizmoMove = state.gizmoRotate = state.gizmoScale = null;
    if (state.gizmoAxisLine) {
      state.scene.remove(state.gizmoAxisLine);
      state.gizmoAxisLine.geometry?.dispose();
      state.gizmoAxisLine.material?.dispose();
      state.gizmoAxisLine = null;
    }
    state.pickRT?.dispose();
    state.pickRT = null;
  },
};

window.ModelerGizmo = ModelerGizmo;
