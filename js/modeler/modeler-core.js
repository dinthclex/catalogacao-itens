/**
 * modeler-core.js — Modelador 3D estilo Blender: o objeto `window.Modeler3D`
 * propriamente dito. Orquestra os outros módulos (modeler-mesh.js,
 * modeler-gizmo.js, modeler-render.js, modeler-input.js, modeler-ui.js — CADA
 * UM carregado antes deste, ver index.html) através de um único objeto de
 * ESTADO compartilhado (`this._state`, documentado logo abaixo) — nenhum dos
 * outros módulos guarda estado próprio, todos recebem `state` como 1º
 * argumento de cada função. Expõe a API pública que mapview.js/view3d.js
 * chamam: `enter(view3d, obj)`, `exit()`, `isActive()`, `ensureCustomMesh(obj)`.
 *
 * HISTÓRICO — pedido original do usuário (28/08/2026): "Vamos implementar o
 * modelar de um objeto como no blender. Deve haver os dois modos o modo
 * 'objeto' e o modo 'edição' como no Blender [...]". Depois de usar,
 * o usuário voltou com uma lista de ajustes (mesma data) que está
 * documentada em cada módulo, no ponto exato que ela afeta — o resumo:
 *
 *   1) MODULARIZAÇÃO — "tudo que seja relacionado a ele [o Modelador], esteja
 *      em arquivos separados". Era um arquivo só (js/modeler3d.js); virou
 *      estes 6 arquivos (mesh/gizmo/render/input/ui/core) + css/modeler3d.css.
 *      Nenhum usa import/export ES module nem fetch de arquivo local — só
 *      `<script>` clássico (ver index.html), então continua funcionando sob
 *      file:///.
 *   2) Inserir um cubo NOVO direto no cenário (não só editar um objeto já
 *      existente) — ver mapview.js, botão "🧊 Novo Cubo 3D" na barra do modo
 *      Objetos, que chama `Mapping.addObject` + `ensureCustomMesh` direto,
 *      sem precisar de nenhuma mudança aqui no core.
 *   3) Modo Objeto/Edição em PT-BR + explicação do propósito de cada um —
 *      ver modeler-ui.js/modeler-input.js.
 *   4) BUG "objeto fica duplicado"/destaque preso na posição antiga — a
 *      causa raiz encontrada (ver comentário grande em engine3d.js
 *      `_buildCustomMeshObject`) era a caixa de PICKING (destaque ao mirar)
 *      de um objeto modelado sendo calculada com uma fórmula que só valia
 *      pra rotação em Y — girar em X/Z (Modo Objeto, gizmo de Girar) deixava
 *      o CENTRO dessa caixa desatualizado, parecendo um "objeto fantasma" na
 *      posição de antes de girar. Corrigido calculando o bounding box em
 *      espaço de MUNDO de verdade (`THREE.Box3().setFromObject`). Reforçado
 *      aqui, em `enter/exit/_commit`, com um design que NUNCA clona o objeto
 *      (`state.obj` é a mesma referência do início ao fim — ver `enter`) e
 *      grava tudo de volta via `Mapping.updateObject(map, obj.id, patch)`
 *      (procurado por ID, nunca por referência "torcida") — ver `_commit`.
 *   5-6) Atalhos Blender/tecla A toggle — ver modeler-input.js.
 *   7) Botão direito seleciona + contorno dourado (ATUALIZADO 02/09/2026:
 *      era uma varredura radial 2D reaproveitando a técnica "outline2d" do
 *      resto do app — ver engine3d.js `_drawOutline2D` — trocada por casco
 *      invertido de verdade em WebGL, pedido explícito do usuário — ver
 *      `state.outlineMesh`/`ModelerRender.updateObjectOutline` em
 *      modeler-render.js).
 *   8) Gizmo pixel-perfect (GPU picking) — ver modeler-gizmo.js.
 *   9-15) Wireframe/oclusão/pontos/gradientes/bolinha de origem — ver
 *      modeler-render.js.
 *
 * SIMPLIFICAÇÕES DOCUMENTADAS (repetidas aqui por conveniência — o detalhe de
 * cada uma está no módulo que a implementa):
 *   - Eixo travado (X/Y/Z) de G/R/S sempre em orientação GLOBAL, nunca local.
 *   - Extrude/Inset tratam cada face selecionada INDIVIDUALMENTE (sem fundir
 *     região contígua).
 *   - Inset com fator FIXO (20%), sem arraste ao vivo.
 *   - Subdividir aresta solta (sem face) não atualiza as faces que a usam.
 *   - Duplicar não cria paredes laterais (diferente de Extrudar).
 *   - Make Edge/Face usa a ORDEM de clique dos vértices, não reconstrução
 *     automática do melhor contorno.
 *   - Painel N em Modo de Edição só edita Posição (Rotação/Escala da seleção
 *     ficam só via teclado/gizmo).
 *   - Rotação em Object Mode usa eixos do PRÓPRIO Three.js/app (Y "pra
 *     cima"), não a convenção Z-pra-cima do Blender — só a EXPERIÊNCIA
 *     (atalhos/cores/gizmo) copia o Blender.
 *   - Sem Loop Cut, Knife, Bisect, Spin, Screw, Offset Edge Slide, "Dissolve"
 *     (fora do escopo combinado com o usuário desde a 1ª rodada).
 *   - Colisão top-down (`obj.colisaoTopo`) continua só PERSISTIDA/EXPOSTA —
 *     não há movimentação em 1ª pessoa de verdade neste app pra consumir
 *     isso ainda (ver mapview.js/view3d.js).
 */

const Modeler3D = {
  _state: null,

  isActive() { return !!this._state?.active; },

  defaultCubeMesh(w, d, h) { return ModelerMesh.defaultCubeMesh(w, d, h); },

  /** Garante que `obj` tenha `customMesh` — chamado tanto de fora
   *  (mapview.js/view3d.js) quanto internamente. Usa a caixa delimitadora
   *  ATUAL do objeto (largura/profundidade/altura) como tamanho do cubo
   *  inicial, se já tiver uma — senão 0,5m (é assim que o botão "🧊 Novo
   *  Cubo 3D", que cria um objeto do zero sem essas medidas, acaba
   *  resultando num cubo de 0,5m padrão). Também marca `obj.forma =
   *  'retangulo'` (retrocompatibilidade — é assim que o 2D/vista de cima
   *  continua desenhando uma caixa plausível pra este objeto agora
   *  modelado, sem precisar mexer em Map2DRenderer). */
  ensureCustomMesh(obj) {
    if (obj.customMesh) return;
    // Pedido do usuário (rodada 47) tentou fazer o objeto virar "à parte" do
    // catálogo zerando `obj.tipo` aqui — REVERTIDO na rodada 48: "Se era um
    // objeto padrão e foi editado pelo modo Modelador, então, deve continuar
    // sendo do mesmo tipo que era. Por exemplo, uma mesa ao ter seu 3D
    // modelado, continua sendo uma mesa." `obj.tipo` NÃO é mais tocado aqui
    // — o objeto mantém seu tipo de catálogo original mesmo depois de
    // ganhar uma malha customizada.
    const w = obj.largura || 0.5, d = obj.profundidade || 0.5, h = obj.altura || 0.5;
    // Pedido do usuário: "Isso deve ser uma opção nas 'configurações 3D' na
    // seção 'Cubo'" — lê `MapConfig._cache` direto (síncrono: por padrão já
    // populado, `view3d.js` chama `MapConfig.get()` ao montar a tela 3D,
    // bem antes de qualquer clique em "Novo Cubo"/"Modelar em 3D" ser
    // possível; se por algum motivo ainda não tiver rodado, cai no padrão
    // `true`, igual ao `DEFAULTS.cuboOrigemCentro`, ver mapconfig.js).
    const centered = (typeof MapConfig !== 'undefined' && MapConfig._cache)
      ? MapConfig._cache.cuboOrigemCentro !== false
      : (typeof MapConfig !== 'undefined' ? MapConfig.DEFAULTS.cuboOrigemCentro !== false : true);
    obj.customMesh = ModelerMesh.defaultCubeMesh(w, d, h, centered);
    obj.customMeshXform = { rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    if (obj.forma !== 'retangulo' && obj.forma !== 'poligono') {
      obj.forma = 'retangulo';
      obj.largura = w; obj.profundidade = d; obj.altura = h;
      if (!obj.cor) obj.cor = '#8a92a3';
    }
  },

  // =====================================================================
  // ENTRAR / SAIR
  // =====================================================================

  /** `view3d`: a View3D já montada (view3d.js) — reaproveita `view3d._engine`/
   *  `view3d._map`/`view3d._container`. `obj`: a referência VIVA do objeto
   *  dentro de `view3d._map.objects` (nunca uma cópia — ver item 4 no
   *  cabeçalho deste arquivo). */
  enter(view3d, obj) {
    if (this._state?.active) this.exit({ skipRebuild: true });
    if (!obj) return;
    // NOVO (03/09/2026) — bug relatado: "ao inserir um objeto escada no
    // mundo, entrar no Modelador e, depois, sair do Modelador, a escada
    // acaba virando uma caixa." Causa raiz: `ensureCustomMesh` (chamada
    // logo abaixo) SEMPRE seeda `obj.customMesh` com uma caixa simples
    // (`ModelerMesh.defaultCubeMesh`, baseada só em largura/profundidade/
    // altura) quando o objeto ainda não tinha malha customizada — mesmo pra
    // tipos com renderização PRÓPRIA (escada/mesa/luminária/poste, ver
    // engine3d.js `_buildEscadaMesh`/etc.), que não têm nada a ver com uma
    // caixa. Isso por si só é inofensivo (o objeto SÓ passa a preferir
    // `customMesh` na hora de renderizar se ele de fato tiver um — ver
    // engine3d.js linha ~2411), MAS `_commit()` (chamado por `exit()`)
    // gravava esse `customMesh` semeado de volta no objeto INCONDICIONAL-
    // MENTE, mesmo que a pessoa só tenha entrado e saído sem editar nada —
    // "comitando" a caixa seed por engano e substituindo a escada de
    // verdade pra sempre. Corrigido guardando aqui um retrato de tudo que
    // `ensureCustomMesh` pode alterar (só quando o objeto AINDA NÃO tinha
    // `customMesh` antes) — `_commit()` desfaz o seed (restaura este
    // retrato) se `state.actionLog` continuar vazio ao sair (nenhuma edição
    // de verdade aconteceu — ver `ModelerMesh._logAction`/`pushUndo`, só
    // chamadas por ações reais de edição/inserção/transformação).
    const hadCustomMesh = !!obj.customMesh;
    const seedBackup = hadCustomMesh ? null : {
      customMesh: obj.customMesh, customMeshXform: obj.customMeshXform,
      forma: obj.forma, largura: obj.largura, profundidade: obj.profundidade, altura: obj.altura, cor: obj.cor,
    };
    this.ensureCustomMesh(obj);
    const engine = view3d._engine;
    if (!engine || !engine._ready || !engine.THREE) {
      Utils.toast?.('O motor 3D ainda não terminou de carregar — tente de novo em instantes.', { type: 'warn' });
      return;
    }

    const state = {
      active: true,
      view3d,
      obj, // MESMA referência do início ao fim — NUNCA clonada (ver item 4)
      seedBackup, // ver comentário grande acima — usado por `_commit()` pra desfazer o seed de `ensureCustomMesh` se nada foi editado de verdade
      THREE: engine.THREE,
      scene: engine.scene,
      camera: engine.camera3,
      canvas: view3d._container.querySelector('#v3d-canvas'),
      wrapEl: view3d._container.querySelector('.view3d-wrap'),
      rootEl: null,

      mode: 'object',
      selectMode: 'vertex',
      gizmoMode: 'move',
      limitToVisible: true, // padrão LIGADO — "comportamento seguro" de só selecionar o que se vê (decisão documentada, pedido do usuário deixou em aberto)
      objectSelected: true, // Modo Objeto já entra com o objeto "selecionado" (contorno amarelo visível) — é o único objeto em escopo nesta sessão

      cm: {
        vertices: obj.customMesh.vertices.map((v) => v.slice()),
        edges: obj.customMesh.edges.map((e) => e.slice()),
        faces: obj.customMesh.faces.map((f) => f.slice()),
      },
      xform: (() => { const x = obj.customMeshXform || {}; return { rotX: x.rotX || 0, rotY: x.rotY || 0, rotZ: x.rotZ || 0, scaleX: x.scaleX || 1, scaleY: x.scaleY || 1, scaleZ: x.scaleZ || 1 }; })(),
      sel: { verts: new Set(), edges: new Set(), faces: new Set() },
      selOrder: { verts: [] },
      activeVertex: null,
      activeEdge: null,

      // NOVO (02/09/2026), pedido verbatim (item 12 da rodada de 13 itens):
      // "As lâmpadas devem gerar luz de verdade de acordo com o tipo de
      // lâmpada." Os 5 marcadores da seção "Lâmpada" (Ponto/Sol/Spot/Hemi/
      // Area — PRIMITIVE_CATALOG.lampada, modeler-ui.js) até aqui só
      // inseriam geometria DECORATIVA (ver comentário grande no topo do
      // catálogo — "este Modelador não tem luzes/câmeras funcionais de
      // verdade"). `state.lights`: uma entrada por marcador de lâmpada
      // inserido — { id, tipo, vOffset, vCount, light (THREE.Light de
      // verdade, já adicionada a `state.scene`) } — ver
      // `ModelerInput._colocarLuzDaLampada` (criação, ligada ao botão da
      // primitiva) e `ModelerRender.updateLampLights` (chamado a cada
      // quadro por `drawFrame`, reposiciona cada luz no CENTRÓIDE atual dos
      // vértices do marcador — assim ela "segue" o marcador se ele for
      // movido/girado pelo Modo Edição, sem precisar de nenhum sistema de
      // objeto/grupo separado por trás, que este Modelador não tem — ver
      // limitação já documentada em `ModelerMesh.connectedFacesFrom`).
      lights: [],
      group: null, meshObj: null, outlineMesh: null, triFaceMap: null,
      overlayCanvas: null, overlayCtx: null, _overlaySizeKey: '',
      occlusion: { vert: [], edge: [], face: [] },

      gizmoMove: null, gizmoRotate: null, gizmoScale: null, gizmoAxisLine: null, gizmoPivot: null, pickRT: null,

      orbit: { yaw: 0.6, pitch: 0.5, dist: 3.5, target: { x: 0, y: 0.5, z: 0 } },
      orbitDrag: null,
      // Pedido do usuário: "Deve ter um botão para alternar entre os modos
      // de posicionamento da câmera... [o modo atual] apontando para um
      // ponto fixo... E o modo livre... é possível se mover pelo cenário."
      // 'orbit' = comportamento de sempre (`_updateOrbitCamera`, mira um
      // ponto fixo — `orbit.target`, o pivô do objeto). 'free' = câmera de
      // voo livre (`_updateFreeCamera`, ver lá), sem mirar nada fixo,
      // WASD/setas movem de verdade — ver `ModelerInput.toggleCamPosMode`.
      camPosMode: 'orbit',
      freeCam: null, // {x,y,z,yaw,pitch} — só existe/usado quando camPosMode==='free', ver toggleCamPosMode
      freeCamVelY: 0, // velocidade vertical (gravidade) — só usada com freeCamGravity ligada
      // "Neste modo a gravidade volta a atuar. O padrão é iniciar com a
      // gravidade desabilitada." — DESLIGADA por padrão (diferente do
      // View3D normal, que já anda com gravidade ligada desde sempre); liga/
      // desliga com Shift+Espaço (ver `ModelerInput._onKeyDown`), igual ao
      // pedido pro modo normal de navegação.
      freeCamGravity: false,
      freeCamGrounded: false, // pés no chão de verdade (pra permitir pular) — ver ModelerInput._onKeyDown (Espaço) / Modeler3D._updateFreeCamera
      keys: {}, // teclas seguradas (WASD/setas) — ver ModelerInput._onKeyDown/_onKeyUp, consumido por _updateFreeCamera
      modal: null,
      raycaster: new engine.THREE.Raycaster(),
      mouse: { x: 0, y: 0, downX: 0, downY: 0, downButton: -1, moved: false },
      loopHandle: null,
      listeners: [],
      _lastFrameT: performance.now(),
    };
    this._state = state;
    document.exitPointerLock?.();
    // Pedido do usuário: "o destaque deve ser desativado quando entra no
    // modo Modelador... o 'contorno pontilhado' fica na tela [...] é do
    // último frame antes de entrar" — ver `Engine3D.clearHoverHighlight`
    // (engine3d.js) pra causa raiz/explicação completa.
    engine.clearHoverHighlight?.();

    // Esconde a malha "de sempre" que o Engine3D já tinha montado pra este
    // objeto — evita desenhar as DUAS (a de fora, congelada, e a do
    // modelador, ao vivo) sobrepostas enquanto edita. Comparado por ID (não
    // só por referência — mais robusto caso algum caminho externo tenha
    // recriado o objeto com o mesmo id) e restaurado sozinho na próxima vez
    // que `view3d._rebuildScene()` rodar (ver `exit`, que sempre reconstrói
    // a cena inteira do zero — não precisa reverter isto aqui).
    (engine._pickMeshes || []).forEach((m) => { if (m.userData?.pick?.ref?.id === obj.id) m.visible = false; });

    this._initOrbitFromCamera(state);
    // Pedido do usuário: "Deve haver uma transição entre a direção e
    // posição da câmera quando alterna entre os modo Modelador e o modo
    // normal de navegação... para não trocar direto." Guarda a pose de
    // ONDE a câmera estava (posição + um ponto 5m à frente, na direção
    // que ela mirava) ANTES de entrar — `_updateOrbitCamera` (chamada a
    // cada quadro do Modelador) faz a câmera deslizar suavemente dessa
    // pose até a pose orbital de destino (já calculada acima por
    // `_initOrbitFromCamera`) em vez de simplesmente "teleportar" pra lá
    // no 1º quadro. Ver o mesmo recurso na volta, em `exit()`.
    {
      const cam = view3d._camera;
      const fwd = window.Cam3DMath.cameraForward(cam);
      state._camTransition = {
        fromPos: { x: cam.x, y: cam.y, z: cam.z },
        fromLookAt: { x: cam.x + fwd.x * 5, y: cam.y + fwd.y * 5, z: cam.z + fwd.z * 5 },
        t0: performance.now(),
        dur: 350,
      };
    }
    ModelerRender.buildSceneObjects(state);
    ModelerGizmo.build(state);
    ModelerMesh.rebuildMeshGeometry(state);
    ModelerUI.build(state);
    ModelerInput.bind(state);
    this._renderLoop(state);
    Utils.toast?.('🔧 Modelador 3D — Tab alterna Modo Objeto/Edição · botão direito seleciona · G/R/S mover/girar/escalar', { duration: 4200 });
    // Pedido do usuário: a dica "Clique para interagir com o cenário 3D"
    // (ver view3d.js `_bindDesktopControls`/`onPointerLockChange`) só
    // reavalia sozinha em eventos `pointerlockchange` do navegador — como
    // entrar no Modelador não trava/destrava o ponteiro, ela nunca reagia
    // aqui. Reavalia manualmente (o próprio handler já checa
    // `Modeler3D.isActive()` e some com a dica).
    view3d._onModelerToggleForLockBadge?.();
    // Pedido do usuário: HUD no canto superior direito do CANVAS, nos 2
    // modos — agora resolvido de forma unificada em `View3D.mount` (ver
    // `Perf.setCanvasAnchor`), não precisa mais ligar/desligar aqui.
    // NOVO (03/09/2026) — sidebar "+"/Criar/Ferramentas UNIFICADO (ver
    // comentário grande em modeler-ui.js `_sidebarCtx`): avisa o painel
    // (que já existe, construído por view3d.js) que uma sessão começou, pra
    // reavaliar as abas disponíveis (ganha "Ferramentas") caso já esteja
    // aberto (ex.: o usuário clicou numa primitiva da aba "Criar" da tela
    // base, que já entra direto editando).
    ModelerUI.refreshSharedSidebar?.(view3d);
  },

  /** Encerra a sessão: grava a malha/transform de volta no objeto de
   *  VERDADE (por ID — ver `_commit`), salva o mapa e reconstrói a cena
   *  "normal" do View3D (que volta a assumir loop/controles/hover). */
  exit({ skipRebuild = false } = {}) {
    const state = this._state;
    if (!state?.active) return;
    if (state.modal) ModelerInput._cancelModal(state);
    // Mesmo pedido do `enter()` (ver lá), agora na VOLTA: guarda onde a
    // câmera do Modelador estava olhando (posição + direção, convertida de
    // volta pra yaw/pitch — inverso exato de `Cam3DMath.cameraForward`) ANTES
    // de desmontar tudo, pra `View3D._loop` deslizar suavemente até a pose
    // "normal" (`view3d._camera`, intocada durante o Modelador) em vez de
    // teleportar pra lá no 1º quadro de volta. `view3d._camera` continua
    // sendo o valor de VERDADE o tempo todo (a transição só afeta o que é
    // RENDERADO nesse meio-tempo — ver `_camTransition` em `View3D._loop`).
    // CORRIGIDO (02/09/2026), ampliado (03/09/2026) — pedido verbatim
    // original: "Ao sair do Modelador, estando selecionado o modo 'Câmera:
    // Livre', a perspectiva da Câmera deve ser preservada como estava ao
    // clicar em 'Sair do Modelador'." Causa raiz: o código abaixo SEMPRE
    // fazia a transição terminar em `view3dForTransition._camera` (a pose
    // de navegação de ANTES de entrar no Modelador, nunca tocada durante a
    // sessão) — então, mesmo tendo voado livremente com "Câmera: Livre" lá
    // dentro, ao sair a câmera sempre deslizava de volta pra onde estava
    // antes, descartando o deslocamento feito. NA ÉPOCA, o modo 'orbit'
    // tinha sido deixado de fora de propósito ("não existe uma 'posição do
    // jogador' própria enquanto orbitando um objeto sozinho"). PEDIDO NOVO
    // (03/09/2026), verbatim: "no modo 'Câmera: Orbital', ao sair do
    // Modelador, a perspectiva da câmera do personagem que estava logo
    // antes de sair do Modelador (ou durante) deve ser preservada.
    // Atualmente, acaba voltando para a perspectiva inicial." — ou seja, o
    // usuário quer o MESMO comportamento do modo Livre também no Orbital:
    // `_poseFromCurrentCamera` já lê a câmera Three.js DE VERDADE
    // (`state.camera.position`/direção, atualizada todo quadro por
    // `_updateOrbitCamera` OU `_updateFreeCamera`, tanto faz o modo) — não
    // existe motivo pra restringir a QUALQUER modo especificamente; a
    // condição `state.camPosMode === 'free'` foi removida, e a pose atual
    // (de onde a câmera estava olhando NO INSTANTE de sair, órbita ou
    // livre) sempre vira a nova pose de navegação de verdade
    // (`view3dForTransition._camera`) antes de montar a transição.
    const view3dForTransition = state.view3d;
    if (view3dForTransition && state.camera && state.THREE) {
      const pose = this._poseFromCurrentCamera(state);
      if (view3dForTransition._camera) {
        view3dForTransition._camera.x = pose.x;
        view3dForTransition._camera.y = pose.y;
        view3dForTransition._camera.z = pose.z;
        view3dForTransition._camera.yaw = pose.yaw;
        view3dForTransition._camera.pitch = pose.pitch;
      }
      view3dForTransition._camTransition = {
        fromPos: { x: pose.x, y: pose.y, z: pose.z },
        fromYaw: pose.yaw,
        fromPitch: pose.pitch,
        t0: performance.now(),
        dur: 350,
      };
    }
    this._commit(state);
    ModelerInput.unbind(state);
    if (state.loopHandle) cancelAnimationFrame(state.loopHandle);
    ModelerGizmo.dispose(state);
    ModelerRender.disposeSceneObjects(state);
    ModelerUI.dispose(state);
    const view3d = state.view3d;
    this._state = null;
    if (!skipRebuild && view3d && view3d._map) {
      DB.saveMap(view3d._map);
      view3d._rebuildScene?.();
    }
    // Mesmo motivo do `enter()`: reavalia a dica de Pointer Lock, já que
    // sair do Modelador também não dispara `pointerlockchange` sozinho.
    view3d?._onModelerToggleForLockBadge?.();
    Perf.setTopRightCorner?.(false);
    // NOVO (03/09/2026) — mesmo motivo do `enter()` (ver lá): a sessão já
    // terminou (`this._state = null` duas linhas acima, `Modeler3D.
    // isActive()` já responde false) — reavalia o sidebar unificado pra
    // "Ferramentas" sumir e a aba "Criar" voltar pra versão simples da tela
    // base, se o painel estava aberto.
    if (view3d) ModelerUI.refreshSharedSidebar?.(view3d);
  },

  /** Escreve a malha/transform da sessão de volta no objeto — sempre
   *  resolvido de novo POR ID (`Mapping.updateObject`), nunca confiando cegamente
   *  em uma referência que possa ter ficado desatualizada — pedido do
   *  usuário (item 4, ver cabeçalho): "ao sair do Modelador deve ser mais
   *  um objeto como qualquer outro". Chamado só ao SAIR (sem autosave
   *  periódico dentro da sessão — simplificação documentada, mesma da
   *  rodada anterior). */
  _commit(state) {
    const obj = state.obj;
    if (!obj) return;
    // NOVO (03/09/2026) — ver comentário grande em `enter()` sobre
    // `state.seedBackup`. Se o objeto NÃO tinha `customMesh` antes de abrir
    // esta sessão (`seedBackup` não é null) e nenhuma edição de verdade
    // aconteceu (`state.actionLog` vazio — só ações reais de
    // edição/inserção/transformação chamam `ModelerMesh.pushUndo`, que
    // grava ali), desfaz o seed em vez de gravá-lo: restaura os campos
    // originais (sem `customMesh`/`customMeshXform` nenhum) e sai sem tocar
    // em posição/tamanho/DB — "entrar e sair sem editar" fica 100%
    // transparente, a escada (ou mesa/luminária/poste) continua exatamente
    // como estava, com sua renderização especial de sempre.
    if (state.seedBackup && !(state.actionLog && state.actionLog.length)) {
      delete obj.customMesh; delete obj.customMeshXform;
      const b = state.seedBackup;
      if (b.forma !== undefined) obj.forma = b.forma; else delete obj.forma;
      if (b.largura !== undefined) obj.largura = b.largura;
      if (b.profundidade !== undefined) obj.profundidade = b.profundidade;
      if (b.altura !== undefined) obj.altura = b.altura;
      if (b.cor !== undefined) obj.cor = b.cor;
      // `obj` já é a referência VIVA dentro de `view3d._map.objects` (nunca
      // clonada — ver item 4 no cabeçalho do arquivo), então as mutações
      // acima já bastam; `exit()` chama `DB.saveMap` logo em seguida
      // (fora do `skipRebuild`), persistindo esse estado igual a qualquer
      // outra saída.
      return;
    }
    // BUG CORRIGIDO (03/09/2026), pedido verbatim: "No 'Ver em 3D', no
    // Modelador, ao excluir um objeto ele deve ser excluído. [...] Parece
    // que ele é apagado no Modelador, mas alguma versão do objeto ainda
    // fica no mundo." Causa raiz: "Excluir objeto" (ModelerInput.
    // _deleteWholeObject/_clearWholeMesh, Modo Objeto) e a cascata do Modo
    // Edição (selecionar 100% de vértices/arestas/faces e deletar — ver
    // ModelerInput._runMeshOp, mesmo dia) esvaziam state.cm por completo
    // (vertices/edges/faces = []), mas este `_commit` nunca tratava esse
    // caso como "objeto excluído" — caía direto no caminho normal abaixo,
    // que monta um `patch` com `customMesh` VAZIO e chama
    // `Mapping.updateObject` (só faz Object.assign no objeto existente,
    // NUNCA remove nada do array) — o objeto sobrevivia no mapa como uma
    // malha customizada de tamanho ~0 (ou degenerada, já que
    // `ModelerMesh.localBBox([])` não tem vértice nenhum pra medir),
    // exatamente o "resquício" relatado (some visualmente dentro do
    // Modelador, mas alguma versão fica no mundo). Corrigido: mesh
    // completamente vazia (sem nenhum vértice/aresta/face) agora remove o
    // objeto de vez do mapa (`Mapping.removeObject`), em vez de gravar um
    // patch vazio nele — nenhuma outra situação legítima deixa a malha
    // vazia num Modelador aberto (`ensureCustomMesh` sempre semeia alguma
    // geometria ao entrar).
    if (!state.cm.vertices.length && !state.cm.edges.length && !state.cm.faces.length) {
      const map = state.view3d?._map;
      if (map && window.Mapping) {
        Mapping.removeObject(map, obj.id);
        Mapping.recalcBounds(map);
      }
      return;
    }
    const patch = {
      customMesh: { vertices: state.cm.vertices.map((v) => v.slice()), edges: state.cm.edges.map((e) => e.slice()), faces: state.cm.faces.map((f) => f.slice()) },
      customMeshXform: { ...state.xform },
    };
    const bb = ModelerMesh.localBBox(state.cm.vertices);
    if (state.group) {
      patch.x = state.group.position.x;
      patch.y = state.group.position.z;
      // `obj.elevacao` é sempre "altura da BASE do objeto acima do chão"
      // (usado em vários lugares do app pra empilhar objetos em cima de
      // outros — ver mapping.js `objectTopHeight`) — não pode virar "altura
      // da ORIGEM" só porque a origem do cubo agora pode estar no meio dele
      // (pedido do usuário, opção "Origem no centro do cubo", ver
      // mapconfig.js/modeler-mesh.js defaultCubeMesh). `state.group.position.y`
      // é a altura de MUNDO da ORIGEM local; `bb.minY` (escalado por Y) é
      // quanto a base da malha fica ABAIXO dessa origem em espaço local —
      // somando os dois volta pra altura da BASE, igual sempre foi quando a
      // origem nascia na base (bb.minY=0 nesse caso, sem efeito nenhum).
      const baseOffsetY = bb.minY * (state.xform.scaleY || 1);
      patch.elevacao = (state.group.position.y + baseOffsetY) - (obj.piso || 0) * 2.8;
    }
    patch.largura = Math.max(0.05, (bb.maxX - bb.minX) * Math.abs(state.xform.scaleX || 1));
    patch.profundidade = Math.max(0.05, (bb.maxZ - bb.minZ) * Math.abs(state.xform.scaleZ || 1));
    patch.altura = Math.max(0.05, (bb.maxY - bb.minY) * Math.abs(state.xform.scaleY || 1));

    const map = state.view3d?._map;
    if (map && window.Mapping) {
      // `Mapping.updateObject` procura o objeto POR ID dentro de
      // `map.objects` e faz `Object.assign` nele — nunca cria um elemento
      // novo no array, nunca duplica. Se por qualquer motivo o objeto não
      // for mais encontrado por id (removido enquanto o Modelador estava
      // aberto, por exemplo), não faz nada — não recria um "objeto órfão".
      Mapping.updateObject(map, obj.id, patch);
      // Salvaguarda defensiva (pedido do usuário — "não pode ficar 'dois'
      // dele"): se por algum caminho externo o mapa tiver acabado com mais
      // de UM objeto com este mesmo id (nunca deveria acontecer com o fluxo
      // acima, mas é barato conferir), mantém só o primeiro e remove os
      // extras — nunca deixa uma sessão de modelagem terminar com
      // duplicata.
      const idsVistos = new Set();
      const semDuplicata = map.objects.filter((o) => { if (idsVistos.has(o.id)) return false; idsVistos.add(o.id); return true; });
      if (semDuplicata.length !== map.objects.length) map.objects = semDuplicata;
      Mapping.recalcBounds(map);
    } else {
      Object.assign(obj, patch); // sem `view3d._map` (não deveria acontecer) — pelo menos mantém a referência em memória atualizada
    }
  },

  /** Converte a câmera Three.js ATUAL (`state.camera`) numa pose
   *  {x,y,z,yaw,pitch} no mesmo formato de `view3d._camera`/`state.freeCam`
   *  — inverso exato de `Cam3DMath.cameraForward` (ver comentário lá/em
   *  `exit()`, onde essa conversão nasceu, pra transição de câmera ao sair
   *  do Modelador). Reaproveitada também pra alternar entre os modos de
   *  posicionamento da câmera (`ModelerInput.toggleCamPosMode`), que precisa
   *  da MESMA conversão ao entrar no modo Livre a partir da órbita. */
  _poseFromCurrentCamera(state) {
    const dir = new state.THREE.Vector3();
    state.camera.getWorldDirection(dir);
    const pos = state.camera.position;
    const pitch = Math.max(-1.3, Math.min(1.3, -Math.asin(Math.max(-1, Math.min(1, dir.y)))));
    const yaw = Math.atan2(-dir.x, dir.z);
    return { x: pos.x, y: pos.y, z: pos.z, yaw, pitch };
  },

  /** `camPose` opcional (formato {x,y,z}) — por padrão usa `view3d._camera`
   *  (câmera de navegação normal, caso de uso original, ao ENTRAR no
   *  Modelador). `ModelerInput`/`toggleCamPosMode` (abaixo) passa
   *  `state.freeCam` no lugar quando volta do modo Livre pro Orbital, pra
   *  recalcular a órbita a partir de onde a câmera livre parou, em vez da
   *  câmera de navegação (que nem está em uso nesse momento). */
  _initOrbitFromCamera(state, camPose) {
    const cam = camPose || state.view3d._camera;
    const obj = state.obj;
    const baseY = (obj.piso || 0) * 2.8 + (obj.elevacao || 0);
    state.orbit.target = { x: obj.x, y: baseY + 0.4, z: obj.y };
    const dx = cam.x - obj.x, dz = cam.z - obj.y, dy = cam.y - (baseY + 0.4);
    const dist = Math.max(1.2, Math.hypot(dx, dy, dz));
    state.orbit.dist = Math.min(dist, 8);
    state.orbit.yaw = Math.atan2(dx, dz);
    state.orbit.pitch = Math.max(-1.4, Math.min(1.4, Math.atan2(dy, Math.hypot(dx, dz))));
  },

  /** Pedido do usuário: "Deve ter um botão para alternar entre os modos de
   *  posicionamento da câmera" — Orbital (padrão, sempre existiu: mira um
   *  ponto fixo, `_updateOrbitCamera`) <-> Livre (novo: voo livre por
   *  WASD/setas, sem mirar nada fixo, `_updateFreeCamera`). Cada troca
   *  CONVERTE a pose atual pro outro sistema (nunca "pula" pra outro
   *  lugar) — mesma técnica de conversão câmera<->yaw/pitch já usada na
   *  transição Modelador<->navegação normal (ver `_poseFromCurrentCamera`). */
  toggleCamPosMode(state) {
    if (state.camPosMode === 'orbit') {
      state.freeCam = this._poseFromCurrentCamera(state);
      state.freeCamVelY = 0;
      state.camPosMode = 'free';
      Utils.toast?.('🕊️ Câmera livre — WASD desloca, ↑/↓ sobem/descem, botão direito/meio gira (Shift+Espaço liga/desliga a gravidade)', { duration: 3600 });
    } else {
      this._initOrbitFromCamera(state, state.freeCam);
      state.camPosMode = 'orbit';
      state.freeCam = null;
      Utils.toast?.('🎯 Câmera orbital — sempre mirando o objeto', { duration: 2200 });
    }
    ModelerUI.updateToolbarActive?.(state);
  },

  /** Atualiza a câmera no modo de posicionamento LIVRE — chamada a cada
   *  quadro por `_renderLoop` (via `_updateOrbitCamera`, que desvia pra cá
   *  quando `state.camPosMode === 'free'`). WASD desloca no plano PARALELO
   *  ao XZ do mundo, na direção "achatada" da própria câmera (ignora o
   *  pitch — pedido do usuário: "W, para a frente; S, para trás; A, para a
   *  esquerda; e D, para a direita" — mesma convenção do WASD do modo
   *  normal de navegação, ver `Cam3DMath.cameraForwardFlat/cameraRightFlat`
   *  em view3d.js/engine3d.js); setas ↑/↓ mudam Y do MUNDO diretamente
   *  (sempre, gravidade ligada ou não — pedido do usuário: "a seta para
   *  cima aumenta em y do mundo e a seta para baixo diminui"). Com
   *  `freeCamGravity` ligada, a física de queda simplificada usa as MESMAS
   *  `_surfaceHeightAt`/`EYE_HEIGHT` do View3D (via `state.view3d`), pra se
   *  comportar como o modo normal de navegação. */
  _updateFreeCamera(state, delta) {
    const fc = state.freeCam;
    const keys = state.keys || {};
    const forward = window.Cam3DMath.cameraForwardFlat(fc);
    const right = window.Cam3DMath.cameraRightFlat(fc);
    // Pedido do usuário: "Ao manter pressionado o botão do meio do mouse a
    // movimentação do WASD deve ficar bem mais lenta (1/10)" — mesmo botão
    // que gira/panorâmica a câmera no modo Livre (`state.orbitDrag`, ver
    // `ModelerInput._onMouseDown/_onMouseMove` — `button === 1` é o do
    // meio), então "segurado" aqui é simplesmente esse arrasto estar em
    // andamento com esse botão, sem precisar de um rastreio próprio.
    const middleHeld = !!(state.orbitDrag && state.orbitDrag.button === 1);
    const SPEED = 2.6 * (middleHeld ? 0.1 : 1);
    let mx = 0, mz = 0;
    if (keys.KeyW) { mx += forward.x; mz += forward.z; }
    if (keys.KeyS) { mx -= forward.x; mz -= forward.z; }
    if (keys.KeyA) { mx -= right.x; mz -= right.z; }
    if (keys.KeyD) { mx += right.x; mz += right.z; }
    const mlen = Math.hypot(mx, mz);
    if (mlen > 0.001) { mx /= mlen; mz /= mlen; }
    fc.x += mx * SPEED * delta;
    fc.z += mz * SPEED * delta;
    const VY_SPEED = 2.0 * (middleHeld ? 0.1 : 1);
    if (keys.ArrowUp) fc.y += VY_SPEED * delta;
    if (keys.ArrowDown) fc.y -= VY_SPEED * delta;

    if (state.freeCamGravity) {
      const view3d = state.view3d;
      const eyeH = view3d?.EYE_HEIGHT ?? 1.65;
      const surfaceY = view3d?._surfaceHeightAt?.(fc.x, fc.z, fc.y - eyeH) ?? 0;
      const groundY = surfaceY + eyeH;
      // Pedido do usuário (rodada 44, correção): "Na câmera livre, quando a
      // gravidade estiver ligada, deve ser possível pular." Causa raiz do
      // pulo não funcionar: a versão anterior decidia se estava "no chão"
      // comparando a POSIÇÃO atual (`fc.y > groundY`) a cada quadro, em vez
      // de confiar na flag `state.freeCamGrounded` — então, no exato quadro
      // em que `ModelerInput._onKeyDown` (Espaço) dava o impulso pro pulo
      // (`freeCamVelY = 6`), a posição AINDA não tinha mudado (só a
      // velocidade), então essa comparação por posição ainda achava "está
      // no chão" e reescrevia `freeCamVelY` de volta pra 0 e `fc.y` de
      // volta pro chão — cancelando o pulo no MESMO quadro em que ele
      // começava, antes de qualquer impulso surtir efeito. Corrigido pra
      // seguir o mesmo padrão de `view3d.js` (`_update`/`_jump`): o ESTADO
      // (`state.freeCamGrounded`) é que manda qual física roda — só ele
      // decide, nunca a posição do quadro atual — e só é alterado por quem
      // TEM autoridade pra isso (o pulo, aqui embaixo, ou o pouso de
      // verdade).
      if (state.freeCamGrounded) {
        fc.y = groundY;
        state.freeCamVelY = 0;
      } else {
        const GRAVITY = -16;
        state.freeCamVelY += GRAVITY * delta;
        fc.y += state.freeCamVelY * delta;
        if (fc.y <= groundY) { fc.y = groundY; state.freeCamVelY = 0; state.freeCamGrounded = true; }
      }
    } else {
      state.freeCamGrounded = false;
    }

    state.camera.position.set(fc.x, fc.y, fc.z);
    const dir = window.Cam3DMath.cameraForward(fc);
    state.camera.lookAt(fc.x + dir.x, fc.y + dir.y, fc.z + dir.z);
  },

  _updateOrbitCamera(state) {
    const o = state.orbit;
    const x = o.target.x + o.dist * Math.cos(o.pitch) * Math.sin(o.yaw);
    const y = o.target.y + o.dist * Math.sin(o.pitch);
    const z = o.target.z + o.dist * Math.cos(o.pitch) * Math.cos(o.yaw);
    // Transição suave ao ENTRAR (ver `enter()`) — desliza da pose de onde a
    // câmera estava (posição + ponto-alvo à frente) até a pose orbital
    // "de verdade" (x,y,z acima + o.target), com suavização smoothstep.
    // Some sozinha (`state._camTransition = null`) assim que completar; daí
    // em diante os quadros seguem batendo direto na pose orbital normal.
    const tr = state._camTransition;
    if (tr) {
      const t = Math.min(1, (performance.now() - tr.t0) / tr.dur);
      const ease = t * t * (3 - 2 * t);
      const px = tr.fromPos.x + (x - tr.fromPos.x) * ease;
      const py = tr.fromPos.y + (y - tr.fromPos.y) * ease;
      const pz = tr.fromPos.z + (z - tr.fromPos.z) * ease;
      const lx = tr.fromLookAt.x + (o.target.x - tr.fromLookAt.x) * ease;
      const ly = tr.fromLookAt.y + (o.target.y - tr.fromLookAt.y) * ease;
      const lz = tr.fromLookAt.z + (o.target.z - tr.fromLookAt.z) * ease;
      state.camera.position.set(px, py, pz);
      state.camera.lookAt(lx, ly, lz);
      if (t >= 1) state._camTransition = null;
      return;
    }
    state.camera.position.set(x, y, z);
    state.camera.lookAt(o.target.x, o.target.y, o.target.z);
  },

  /** Loop de render INDEPENDENTE do loop do View3D (que fica pausado
   *  enquanto o Modelador está ativo — ver os guardas `Modeler3D.isActive()`
   *  em view3d.js). Renderiza a cena WebGL normalmente e, por cima, o
   *  overlay 2D (ver modeler-render.js drawFrame).
   *
   *  Pedido do usuário: "o fps deve continuar sendo calculado, mesmo no modo
   *  Modelador". Causa raiz: o HUD de FPS (`Perf`, ver perf.js) só conta
   *  quadros de verdade quando alguém chama `Perf.markFrameStart()` — antes
   *  disto, só view3d.js `_loop` e mapview.js `step` chamavam, e o loop do
   *  View3D fica PAUSADO durante o Modelador (loop próprio, este aqui) —
   *  então nenhum quadro era contado, e o HUD ficava "travado" no último
   *  número de antes de entrar. Corrigido chamando `markFrameStart`/
   *  `markFrameEnd` aqui também, ao redor do mesmo trabalho pesado do quadro
   *  (render WebGL + overlay 2D) — mesmo padrão de view3d.js `_loop`. */
  _renderLoop(state) {
    if (!state.active || this._state !== state) return;
    Perf.markFrameStart?.();
    // `delta` (segundos desde o quadro anterior) — só usado pelo modo de
    // câmera LIVRE (`_updateFreeCamera`, WASD/setas/gravidade); o modo
    // Orbital não precisa (a órbita/transição já usam `performance.now()`
    // direto). `Math.min(0.05, ...)` evita um "salto" grande de posição se
    // a aba ficou em segundo plano por um tempo (mesmo cuidado do View3D
    // normal, ver view3d.js `_loop`).
    const now = performance.now();
    const delta = Math.min(0.05, (now - (state._lastFrameT || now)) / 1000);
    state._lastFrameT = now;
    if (state.camPosMode === 'free' && state.freeCam) this._updateFreeCamera(state, delta);
    else this._updateOrbitCamera(state);
    ModelerGizmo.update(state);
    // CORRIGIDO (01/09/2026), pedido verbatim: "indo pelo botão 'Editar', a
    // resolução e o aspecto visual parece em baixa resolução." Causa: este
    // loop sempre chamou `renderer.render()` do Three.js DIRETO (pulando
    // `Engine3D.render(camera)`, que faz trabalho extra irrelevante aqui —
    // destaque de mira, oclusão de selo etc.) — só que só `Engine3D.render`
    // chama `_resize()` (`engine3d.js`), responsável por casar o BUFFER de
    // desenho do WebGL (`renderer.setSize`/`setPixelRatio`) com o tamanho
    // real (esticado por CSS) do canvas. Sem isso, o canvas do Modelador
    // ficava preso na resolução do MOMENTO em que entrou (herdada de
    // qualquer sessão 3D anterior) — daí o aspecto "baixa resolução"
    // relatado. `_resize()` sozinho (sem o resto de `Engine3D.render`) já
    // resolve, e é barato (só recalcula/aplica quando o tamanho realmente
    // mudou, ver early-return `w === this._lastW && h === this._lastH`).
    state.view3d._engine._resize();
    state.view3d._engine.renderer.render(state.scene, state.camera);
    ModelerRender.drawFrame(state);
    Perf.markFrameEnd?.();
    state.loopHandle = requestAnimationFrame(() => this._renderLoop(state));
  },
};

window.Modeler3D = Modeler3D;
