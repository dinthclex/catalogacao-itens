/**
 * view3d.js — Navegação 3D em 1ª pessoa pelo ambiente mapeado.
 * Controles: W A S D mover, espaço pular, shift correr, mouse (ou arraste no
 * toque) para olhar em volta, botão esquerdo do mouse / toque no centro para
 * selecionar o item mirado (crosshair), abrindo um "flashcard 3D" (folha
 * voltada para o personagem) com as informações do item.
 *
 * Física simples (gravidade/pulo) e colisão básica contra as paredes do mapa,
 * no mesmo espírito matemático do motor (engine3d.js) — tudo sem bibliotecas.
 *
 * ---------------------------------------------------------------------
 * [11/09/2026] CABEÇALHO COM ÍNDICE DE FUNÇÕES (pedido recorrente do
 * usuário, "evitar buscas exaustivas") — arquivo grande (~420KB): índice
 * pragmático, agrupado por assunto, cobrindo todo método de `const
 * View3D = {...}`. Reaproveita muito de `js/engine3d.js` por baixo (o
 * motor de render/raycasting em si).
 *
 * Ciclo de vida da tela:
 * - mount(container,{ambienteId})/unmount() — entra/sai do "Ver em 3D"
 *   (cria o Engine3D, liga controles, inicia o loop; desliga tudo ao
 *   sair).
 * - _rebuildScene() — reconstrói a cena 3D a partir do mapa atual (após
 *   uma mutação relevante).
 * - _openMapConfig() — abre o painel ⚙️ (MapConfig, compartilhado com o
 *   mapa 2D).
 * - _update(delta)/_loop(t) — passo de física/lógica e o loop principal
 *   (rAF) que chama tudo a cada quadro.
 * - _syncModeladorFullscreen() — sincroniza o estado tela-cheia do
 *   Modelador (BSP Workspace) com o "Ver em 3D".
 *
 * Hotbar/roleta de ferramentas de construção (rodapé "Objeto"):
 * - _initBuildHotbar()/_renderHotbar()/_selectBuildTool(tool)/
 *   _cycleHotbarList(dir) — monta e controla a barra de ferramentas
 *   (Objeto/Item/Câmera/Orb de foto/Tijolo/etc.) e a navegação por ela.
 * - _showRoulette()/_hideRoulette()/_renderRoulette({wake}) — a "roleta"
 *   circular de escolha rápida de item da hotbar (roda do mouse).
 * - _toggleObjectCatalogPanel()/_refreshObjectCatalog()/
 *   _renderObjectCatalogPanel()/_renderTijoloPanel()/_setV3dRightTab() —
 *   [10/09/2026, UNIFICADO] painel lateral único "+" com 2 abas verticais
 *   ("Objetos": catálogo de objetos/câmera nova/orb de foto novo;
 *   "Tijolos": construção livre por blocos) — ver comentário grande no
 *   HTML de `mount()` e em `_toggleObjectCatalogPanel`.
 *
 * Alinhamento/snap ao posicionar (paredes/objetos):
 * - _applyBussola3DVisibilidade(ativo)/_giroBussola3DParaDirecao(bearingRad)
 *   — bússola 3D (visibilidade/giro pra apontar uma direção).
 * - _layerIdParaNovosItens() — qual camada 2D um objeto novo criado no 3D
 *   deve usar (config "camada3DNovosItens").
 * - _isWallFreeModeNow()/_isDoorSnapActiveNow()/
 *   _isObjectGridSnapActiveNow()/_applyObjectGridSnap(x,z)/
 *   _isDebugTransferidorAtivo()/_isDebugProlongamentoAtivo() — flags/
 *   aplicação de cada modo de snap (parede livre, encaixe de porta, grade
 *   de objeto) lidas da config.
 * - _alignmentModeAtual()/_isCardinalAlignmentActiveNow()/
 *   _isAnyFixedAlignmentActiveNow()/_cardinalAngleAtual()/
 *   _nearestCardinalIndex(ang)/_nearestCardinalAngle(ang)/
 *   _resolveFreeAlignmentAngle(baseRaw) — alinhamento cardinal (N/S/L/O)
 *   ao girar objetos/paredes livremente.
 * - _resolveWallSnap(rawX,rawZ,chainStart)/
 *   _findWallContainingPoint(px,pz,excludeIds)/
 *   _resolveObjectWallSnap(x,z,w,d,angulo,preferredWall) — encaixe de
 *   parede nova numa existente / de porta-janela-objeto numa parede.
 * - _captureFreeRotatePivot() — pivô usado ao girar livremente um objeto
 *   já colocado.
 *
 * Modos de câmera especiais ("assistir"/"ver através"/"Camera Match"):
 * - _enterCameraView(camId)/_exitCameraView()/_computeWatchCameraPose() —
 *   modo ESPECTADOR assistindo uma câmera de segurança fixa (pan/tilt/
 *   zoom por cima; jogador anda sozinho por trás, ver _updateAutopilot).
 * - _cameraExitViewMode() — [12/09/2026, NOVO; FUNDIDA NESTA RODADA; ver
 *   15/09/2026 UTC abaixo] lê a config "Configurações 3D" seção única "Ver
 *   através desta câmera" (MapConfig.cameraExitViewMode) que decide o que
 *   "Sair da câmera" faz: manter o ponto de vista travado (padrão) ou
 *   voltar ao ponto de vista original do personagem — usada DIRETO por
 *   `_exitCameraOrbView` E por `_exitFotoCameraView` (histórico: chegou a
 *   ser 1 chave única, depois 2 chaves independentes — correção por "orb
 *   de câmera" ser sinônimo de "orb de foto", não de "Câmeras" —, voltou a
 *   ser 1 chave única em 12/09/2026 por pedido explícito do usuário, e em
 *   15/09/2026 UTC o wrapper `_fotoOrbExitViewMode()`, que só delegava pra
 *   esta função, foi removido — pedido verbatim: "Remova todas as
 *   referências de duplicidade [...] Não considere compatibilidade com
 *   código legado" — `_exitFotoCameraView` passou a chamar
 *   `_cameraExitViewMode()` direto). Ver nota grande em mapconfig.js
 *   DEFAULTS.cameraExitViewMode para o histórico completo.
 * - _enterFotoCameraView(fotoId)/_exitFotoCameraView()/
 *   _computeFotoCamPose()/_fotoCamFovFor(foto) — modo ESPECTADOR "ver
 *   através desta foto" (vanishCam/orb de foto — TAMBÉM chamado de "orb de
 *   câmera" na fala do usuário), mesmo espírito do anterior. [12/09/2026:
 *   entrada esconde a malha esfera+cone(+placa) do próprio orb de foto
 *   vista através — `setFotoMeshVisible`; saída posiciona `this._camera`
 *   na pose travada OU na pose original, conforme `_cameraExitViewMode()`
 *   — antes desta rodada não tocava `this._camera` nenhuma, deixando-o
 *   onde o passeio automático de fundo tivesse levado.]
 * - _getFotoCamOpacidade()/_setFotoCamOpacidade(v) — opacidade do guia
 *   visual (foto sobreposta) nos 2 modos de foto/orb acima.
 * - [12/09/2026, NOVO — ITEM D; 19/09/2026 SIMPLIFICADO; 22/09/2026
 *   RODADA SEGUINTE — RESTAURADO, ver nota abaixo]
 *   _getFotoCamBackdropConfig()/_setFotoCamBackdropConfig(patch) — config
 *   (GLOBAL, mesmo storage da opacidade) do painel "🖼️ Imagem":
 *   profundidade (Trás/Frente), ajuste (Esticar/Caber/Cortar), offset X/Y,
 *   flip H/V, rotação. 'Frente' continua desenhando direto no `<canvas>`
 *   de overlay 2D (`#v3d-fotocam-photo-canvas`, sempre por cima do
 *   cenário 3D) via `_updateFotoCamOverlayZoomScale`/`_drawFotoCamPhoto`.
 *   [19/09/2026] 'Trás' tinha sido SIMPLIFICADO pra usar o MESMO mecanismo
 *   de 'Frente' (canvas 2D de overlay) — trocava só a ORDEM de impressão,
 *   nunca oclusão real por objetos 3D verdadeiros (limitação aceita à
 *   época). [22/09/2026 — RODADA SEGUINTE] REVERTIDO — pedido verbatim do
 *   usuário testando aquilo: "Volte a colocar a imagem lá no fundo, pois
 *   os objetos que deveriam estar à frente da imagem não estão." 'Trás'
 *   voltou a usar um PLANO 3D REAL (`_ensureFotoCamBackdropPlane`/
 *   `_redrawFotoCamBackdropCanvas`/`_updateFotoCamBackdropPlane`, NOVAS/
 *   RESTAURADAS — `THREE.Mesh`+`PlaneGeometry`+`CanvasTexture` dentro de
 *   `engine.scene`, `depthTest:true`/`depthWrite:false`), que participa do
 *   z-buffer normalmente — oclusão real por objetos 3D de verdade nos 2
 *   sentidos. Pra EVITAR o bug de cache que a arquitetura antiga deste
 *   mesmo plano tinha (textura dessincronizada da Resolução/FOV até algo
 *   forçar redesenho, ver CHANGELOG 11/09/2026), a textura é redesenhada
 *   INCONDICIONALMENTE a cada quadro (`View3D._loop`/
 *   `Modeler3D._renderFrame`, nunca só em handlers de config) enquanto
 *   'Trás' estiver ativo. 'Frente' não mudou em nada.
 * - [14/09/2026, NOVO — bug do "retângulo amarelo vs. foto muito maior"]
 *   _activeCamPropsVFovRad() — FOV VERTICAL calibrado (radianos), derivado
 *   de `camProps.focalLengthMm/sensorWidthMm/sensorHeightMm`, EXTRAÍDA como
 *   função compartilhada porque essa MESMA fórmula já existia duplicada em
 *   `js/engine3d.js` (construção do "retângulo amarelo"/frustum,
 *   `_fotoFrustumMeshesById`) — era a fonte da divergência de tamanho entre
 *   a foto e o retângulo amarelo (ver `_activeCamFrameRectPx`, logo abaixo,
 *   e o comentário grande nela — usada hoje pelo `<canvas>` de overlay 2D
 *   ('Frente') e pelo plano 3D real ('Trás', `_updateFotoCamBackdropPlane`).
 *   `_activeCamFrameAspect()`/`_activeCamFrameRectPx()` — MESMAS
 *   de antes, mas `_activeCamFrameRectPx` agora usa
 *   `_activeCamPropsVFovRad()` (não mais "encaixar por proporção no
 *   canvas") pra bater com o retângulo amarelo de verdade.
 * - _renderFotoCamOverlay(foto,onExit)/_removeFotoCamOverlay() — overlay
 *   compartilhado (guia visual + botão sair) reaproveitado pelos 3 modos
 *   de câmera (watch/foto/orb).
 * - _enterCameraOrbView(camId)/_exitCameraOrbView()/_camOrbFovDeg(cam)/
 *   _renderCameraOrbOverlay(cam) — objeto "Câmeras"/Camera Match: TRAVA a
 *   câmera de verdade do jogador (não é espectador) na pose calibrada de
 *   uma câmera "Câmeras", permitindo selecionar/posicionar objetos
 *   alinhados com a foto de referência. [11/09/2026: entrada esconde a
 *   malha caixa+cone da própria câmera vista através —
 *   `setCameraMeshVisible`; saída copia a pose travada exata pra dentro
 *   da câmera livre. 12/09/2026: saída agora respeita
 *   `_cameraExitViewMode()` — pose travada (padrão) OU pose original
 *   salva na entrada.]
 * - _toggleGlobalXRay(flags)/_playXRayGlassesAnimation() — "óculos de
 *   raio-X" (ver através de paredes, global).
 *
 * Voos de câmera (transições automáticas):
 * - _startSceneFlythrough()/_yawPitchToward(pos,alvo)/
 *   _computeFlythroughPose()/_finishFlythrough(pose)/
 *   _cancelFlythrough()/_updateFlythrough(delta) — sobrevoo automático de
 *   apresentação da cena inteira.
 * - _computeBuildBoundsInfo()/_computeVantagePoint(alvo)/_smoothstep(t)/
 *   flyCameraTo(worldX,worldZ,worldY,opts)/
 *   flyCameraToArc(worldX,worldZ,worldY,opts)/_computeFlyToPose()/
 *   _finishFlyTo(pose)/_updateFlyTo(delta) — voo direcionado até um
 *   ponto/objeto (usado por "👁️ Ver no mapa 3D" da busca/itens/fotos —
 *   3 modos: direto/décima/órbita, ver mapconfig.js `modoVoo3D`).
 * - _openView3DSearch() — abre a busca (search.js) de dentro do 3D.
 *
 * Movimento do jogador/autopilot:
 * - _updateAutopilot(delta) — movimento automático do "boneco" quando a
 *   câmera de render está presa a um modo espectador (watch/foto).
 * - _resolveCollision(nx,nz,feetY)/_surfaceHeightAt(x,z,feetY) — colisão
 *   básica contra paredes e altura de piso/superfície sob os pés.
 * - _jump() — física de pulo.
 *
 * Colocar/remover no mapa (ferramenta ativa da hotbar):
 * - _placeWithBuildTool() — MÉTODO PRINCIPAL de colocação, despacha
 *   conforme `this._buildTool` (objeto/item/parede/porta/janela/
 *   câmera-novo/orbfoto-novo/tijolo) — sempre lê `this._camera` de
 *   verdade (por isso o "orb de câmera" acima funciona sem duplicar
 *   nada).
 * - _removeWithTool()/_openDeleteConfirmPopup()/_confirmDeleteHit(hit) —
 *   ferramenta de apagar (raio-X de mira + confirmação).
 * - _addOrbWithTool()/_refreshOrbHud() — colocação de "orb" (pino de
 *   item) e o HUD dele.
 * - _updateBuildGhost() — atualiza o fantasma/guia (engine3d.js
 *   showGhost*) conforme a ferramenta/mira atual, a cada quadro.
 * - _createAndEnterNewCube3D()/_createPrimitiveObjectAndEnter(entry) —
 *   atalhos de criar um objeto primitivo (cubo/etc.) já "na mão".
 * - _bindDesktopControls(canvas)/_bindMobileControls(container) — liga
 *   todos os listeners de teclado/mouse/pointer-lock (desktop) ou
 *   toque/joystick virtual (mobile).
 * - _isVirtualCursorOverAddObjBtn() — evita conflito entre o cursor
 *   virtual (mobile) e o botão "+" flutuante.
 *
 * Seleção/cartões 3D (clicar/mirar um alvo):
 * - _tryPick() — raycast de seleção a partir de `this._camera` (mira
 *   central), despacha pro cartão certo conforme o tipo do alvo.
 * - _showTijoloAglomeradoCard3D()/_showObjectCard3D(obj)/
 *   _showCameraCard3D(cam)/_showFotoPinCard3D(foto)/
 *   _showOrphanPatrimonioCard3D(obj)/_showFlashcard3D(itemRef)/
 *   _showMultiFlashcard3D(itemIds) — um cartão 3D por TIPO de alvo
 *   selecionado (aglomerado de tijolos, objeto genérico, câmera, orb de
 *   foto, patrimônio órfão, item único, múltiplos itens no mesmo ponto).
 *
 * Carro dirigível (NOVO, 13/09/2026 — "entrar/sair, inércia real"):
 * - _entrarNoCarro(entity)/_sairDoCarro() — liga/desliga
 *   `this._carroControlado` (chamado por assets/modelos/carro.model.js
 *   onModelClick / tecla "E" respectivamente).
 * - _updateCarrosControlados(dt) — física de inércia (aceleração/fricção/
 *   virada) do carro sendo dirigido; ver comentário grande lá pras
 *   fórmulas exatas e as limitações honestas (sem colisão veicular, sem
 *   suspensão).
 * - _updateCarroCamera() — câmera de 3ª pessoa simplificada atrás do
 *   carro, sem colisão contra paredes.
 *
 * Scripts/componentes (ciclo de vida automático, ver components.js):
 * - _updateScriptProximityTriggers() — dispara `onProximity` dos
 *   EventTrigger quando o jogador se aproxima/afasta de uma entidade.
 * - _updateScriptLifecycle(dt) — chama `Components.tickEntity`
 *   (Start/Update automáticos) pra toda entidade do mapa, todo quadro.
 *
 * Construção livre por "tijolos" (blocos, ferramenta própria):
 * - _tijoloAimTarget(cfgPreCarregada)/_tijoloPlaceAt(alvo)/
 *   _placeTijoloClick()/_updateTijoloDrag()/_tijoloUndo()/_tijoloRedo()/
 *   _paintTijoloClick()/_fillTijoloVolume() — mira/coloca/arrasta/
 *   desfaz/pinta/preenche tijolos.
 * - _salvarCarimboTijolos()/_aplicarCarimboTijolos()/
 *   _excluirCarimboTijolos() — "carimbos" (padrões salvos de tijolos
 *   reaplicáveis).
 * - _tijoloAglomeradoVirarObjeto() — converte um aglomerado de tijolos
 *   num objeto único do mapa.
 * - _importarConstrucaoTijolos(file) — importa uma construção de tijolos
 *   de um arquivo.
 *
 * Sincronização de dados com o mapa:
 * - _buildFotosNoMapa()/_buildItensNoMapa() — (re)carrega fotos/itens
 *   vinculados ao mapa pra cena 3D.
 * - _afterMapMutated({reloadItems})/_afterObjectAddedIncremental(obj) —
 *   reage a uma mutação do mapa (reconstrução parcial/incremental em vez
 *   de reconstruir a cena inteira sempre que possível).
 * ---------------------------------------------------------------------
 *
 * [11/09/2026] RESSALVA — "neblina de distância" (`scene.fog`, ver
 * engine3d.js) some com QUALQUER material Three.js que não marque
 * `fog:false` explicitamente, desde que ele fique perto/depois do plano
 * far configurado (`_fogNear(rd)` até `rd` metros — `rd` pode ser tão
 * pequeno quanto a distância de renderização escolhida no ⚙️). Isso já
 * pegou o Sol/Lua (engine3d.js `_buildCelestialBodies`, corrigido antes) e,
 * nesta rodada, o plano 3D do backdrop 'Trás' da foto de referência
 * (`_ensureFotoCamBackdropPlane`, abaixo — ele fica de propósito perto do
 * plano far, a `camera3.far*0.9`), que estava "sumindo" (virando a cor do
 * céu, já que `scene.fog.color` é sempre igual à cor do céu do momento) —
 * ver o comentário grande na criação do material daquele plano pra a
 * investigação completa (incluiu um teste ao vivo, pedido pelo usuário,
 * desenhando a foto crua sem nenhum fit/offset/rotação, que confirmou que
 * o problema nunca esteve na composição da imagem, e sim no material).
 * LIÇÃO: qualquer objeto 3D novo posicionado deliberadamente longe da
 * câmera (perto ou além do plano far) — HUD 3D, marcador, "coisa colada"
 * que não deve desbotar com a distância — precisa de `fog:false` explícito
 * no material, ou vira invisível/lavado na cor do céu sem nenhum erro no
 * Console pra avisar (o material continua "funcionando" normalmente, só
 * que o fragment final já sai quase 100% misturado com a cor do fog).
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
  // [13/09/2026] NOVO — "carro dirigível" (pedido verbatim: "Faça um
  // carro, que é possível entrar nele e sair andando [...] considerando a
  // inércia de movimento"). `_carroControlado` é a referência do objeto
  // `tipo:'carro'` (entidade do mapa, `map.objects`) sendo dirigido no
  // momento — `null`/`undefined` = ninguém dirigindo, controle normal do
  // jogador (WASD/pointer-lock/gravidade, o de sempre). Ver
  // `_entrarNoCarro`/`_sairDoCarro`/`_updateCarrosControlados`/
  // `_updateCarroCamera` mais abaixo, e `assets/modelos/carro.model.js`
  // (onModelClick chama `_entrarNoCarro`).
  _carroControlado: null,
  _posAntesDoCarro: null, // pose completa do jogador (x/y/z/yaw/pitch) ANTES de entrar — restaurada ao sair
  // [13/09/2026] NOVO — "MODO COMPUTADOR" (pedido verbatim: "O aplicativo do
  // pc deve ser acessível como se estivesse usando a tela [...] a área de
  // trabalho deve ter um ícone de aplicativo [...] deve ser possível sair do
  // pc e deixar o programa 'rodando'"). MESMO PADRÃO já usado pelo carro
  // (`_carroControlado`/`_posAntesDoCarro` acima) — `_computadorAcessado` é a
  // referência do objeto `tipo:'monitor'`/`'monitor2'` cuja "tela" o jogador
  // está usando agora (null = ninguém usando, controle normal). Ver
  // `_acessarComputador3D`/`_sairDoComputador3D` mais abaixo, e
  // `assets/modelos/monitor.model.js`/`monitor2.model.js`
  // (`onModelCardButtons` chama `_acessarComputador3D`).
  _computadorAcessado: null,
  _posAntesDoComputador: null, // pose completa do jogador ANTES de acessar — restaurada ao sair
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

  /** [19/09/2026 UTC] RODADA 191 — cria (1x só, lazy) a instância da Trena
   *  3D modular (`js/trena3d.js`). Chamado tanto por `mount()` (abrir "Ver
   *  em 3D") quanto por `js/mapconfig.js` (seção "📏 Trena 3D" das
   *  "⚙️ Configurações 3D", que pode ser aberta e usada mesmo ANTES de
   *  nunca ter aberto o "Ver em 3D" nesta sessão da página — o painel de
   *  ajustes reaproveita métodos da própria Trena 3D pra montar sua UI,
   *  então precisa de uma instância garantida, não só a criada dentro de
   *  `mount()`). Retorna a instância (nova ou já existente), pra poder
   *  encadear: `window.View3D._trena3DEnsureInstancia()._trena3DXxx(...)`. */
  _trena3DEnsureInstancia() {
    if (!this._trena3D) {
      this._trena3D = new Trena3D({
        getContainer: () => this._container,
        getCamera: () => this._camera,
        getEngine: () => this._engine,
        getKeys: () => this._keys,
        getMap: () => this._map,
        isToolActive: () => this._buildTool === 'trena3d',
        getLayerIdParaNovosItens: () => this._layerIdParaNovosItens ? this._layerIdParaNovosItens() : undefined,
        isDebugCoordsAtivo: () => this._isDebugTrena3DCoordenadasAtivo(),
        configAdapter: (typeof MapConfig !== 'undefined') ? MapConfig : null,
      });
    }
    return this._trena3D;
  },

  async mount(container, { ambienteId } = {}) {
    this._container = container;
    // [19/09/2026 UTC] RODADA 191 — instancia (1x só, reaproveitado pela
    // vida inteira da página, mesmo padrão de singleton que `View3D` já
    // usa) a Trena 3D modular (`js/trena3d.js`), com os adaptadores que
    // ligam ela nesta instância do `View3D` — ver o cabeçalho de
    // `trena3d.js` pra como instanciar em outro site/app.
    this._trena3DEnsureInstancia();
    // NOVO (08/09/2026), pedido verbatim: "No 'Ver em 3D', como o
    // Modelador pertence a tela 'Ver em 3D', então, fica dentro dela,
    // configurável na seção destinada a isso nas 'configurações do app'."
    // Lido 1x aqui (não a cada quadro — `_update` roda por frame, uma
    // leitura assíncrona no meio dele seria custosa/complicada) e cacheado
    // em `this._wsFullscreenCfg`; usado por `_update`/`_syncModeladorFullscreen`
    // abaixo. Arquiteturalmente o Modelador JÁ é confinado por padrão —
    // suas telas montam dentro de `view3d._container.querySelector('.view3d-wrap')`
    // (ver js/modeler/modeler-core.js, `wrapEl`) — este toggle só adiciona
    // o modo OPT-IN "tela cheia" (cobrindo tudo, como era antes de
    // qualquer conceito de Workspace/divisão de tela existir).
    this._wsFullscreenCfg = (typeof DB !== 'undefined') ? await DB.getSetting('workspaceFullscreenConfig', {}) : {};
    this._modeladorFullscreenActive = false;
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
        <!-- [10/09/2026] NOVO — embrulho só do <canvas> (não do resto da UI
             solta dentro de .view3d-wrap: HUD/botões/painéis continuam
             FORA, tamanho normal) pro zoom "lupa" da roda do mouse em
             _fotoCamMode/_orbCamMode (ver onWheel em _bindDesktopControls,
             mais abaixo) — CSS transform:scale aplicado aqui por JS.
             _renderFotoCamOverlay/_renderCameraOrbOverlay anexam o
             overlay da foto DENTRO deste mesmo elemento (em vez de
             this._container) — hoje só como agrupador estável, sem
             nenhum transform: o zoom "lupa" original (CSS scale) foi
             substituído por FOV real (ver onWheel/_resetCamZoom,
             pedido do usuário: "não deve dar uma mera ampliação da
             imagem [...] reconstruindo o desenho da cena"). -->
        <div class="v3d-camzoom-wrap" id="v3d-camzoom-wrap">
          <canvas id="v3d-canvas"></canvas>
        </div>
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
        <!-- [18/09/2026 UTC] NOVO (RODADA 147), [18/09/2026 UTC] ALTERADO
             (RODADA 150) — janela de debug, pedido verbatim do usuário:
             investigar o bug do "salto" de yaw/pitch da câmera ao
             pressionar ESC. Acumula uma lista cronológica de eventos
             (keydown/keyup ESC, pointerlockchange, click de reengajar,
             mousemove descartado/processado etc.), cada linha com
             timestamp + yaw/pitch no momento exato — ver
             '_v3dLog'/wiring em '_bindDesktopControls'. Estilo 100% inline
             (nenhuma classe nova em css/style.css) de propósito, pra ficar
             fácil de remover inteira quando o bug estiver resolvido, sem
             deixar resíduo nenhum na folha de estilo do projeto.
             [RODADA 150] Pedido verbatim: "Esta janela de debug deve ser
             possível movê-la. E adicione um botão de ativação para ela nas
             'configurações 3D' [...] na seção 'debug'. Deste modo, ela só
             aparece se o debug estiver ativado." — deixou de ser sempre
             visível: nasce com 'display:none' aqui no HTML e
             '_v3dApplyDebugCamPanelVisibilidade()' (chamada no 'mount()',
             na wiring do 'MapConfig.onChange' e aqui embaixo em
             '_bindDesktopControls') decide o estado de verdade, ao vivo,
             conforme 'debugModoAtivo' (mestre da seção) E o novo campo
             dedicado 'debugCameraPanelAtivo' — ver mapconfig.js DEFAULTS/
             seção "🐞 Debug" e '_isDebugCameraPanelAtivo()' (view3d.js). O
             botão "Ocultar"/"Mostrar" continua só alternando o CORPO
             (histórico de linhas) — não a visibilidade do painel inteiro,
             que agora é só via config. Arrastável (RODADA 150) pegando em
             qualquer parte do cabeçalho ('#v3d-debug-cam-header') fora dos
             2 botões — mesmo espírito do arraste já usado pela janelinha
             rápida da Trena 3D ('_trena3DEnsurePainelRapido'), só que sem
             resize (não foi pedido) e sem persistir posição entre aberturas
             (painel de debug, sessão-only, ver comentário grande acima
             sobre "fácil de remover inteira"). -->
        <div id="v3d-debug-cam" style="position:absolute; top:10px; right:10px; z-index:2000; width:min(420px,90vw); max-height:46vh; display:none; flex-direction:column; background:rgba(10,12,16,.88); border:1px solid rgba(255,255,255,.18); border-radius:8px; box-shadow:0 4px 18px rgba(0,0,0,.5); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:11px; color:#d8f0d8; pointer-events:auto;">
          <div id="v3d-debug-cam-header" style="display:flex; align-items:center; gap:6px; padding:6px 8px; border-bottom:1px solid rgba(255,255,255,.15); flex:0 0 auto; cursor:move;">
            <b style="flex:1; color:#9be89b; font-weight:600;">🐞 Debug câmera (yaw/pitch) — ESC/Pointer Lock</b>
            <button type="button" id="v3d-debug-cam-toggle" title="Mostrar/ocultar o corpo do painel" style="background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.2); color:#d8f0d8; border-radius:4px; padding:2px 6px; font:inherit; cursor:pointer;">Ocultar</button>
            <button type="button" id="v3d-debug-cam-clear" title="Limpar o log" style="background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.2); color:#d8f0d8; border-radius:4px; padding:2px 6px; font:inherit; cursor:pointer;">Limpar</button>
          </div>
          <div id="v3d-debug-cam-body" style="overflow-y:auto; padding:6px 8px; white-space:pre-wrap; word-break:break-word; line-height:1.45;"></div>
        </div>
        <div class="camera-topbar">
          <button class="icon-btn" id="v3d-close" title="Sair da visualização 3D e voltar para o Mapa">✕ Sair do 3D</button>
          <!-- [15/09/2026 UTC] ALTERADO — pedido verbatim: "na seleção do
               modo de visualização [...] deixe apenas 'Sólido' e
               'Wireframe'. Remova os modos 'Colorido' e 'Sólido+wireframe'."
               As 2 opções removidas ('colorido'/'hibrido') não tinham
               nenhum código PRÓPRIO delas removido — this.mode só é lido em
               comparações (this.mode === 'colorido'/'hibrido', engine3d.js)
               que continuam existindo mas nunca mais são verdadeiras (o
               seletor não oferece mais esses valores, e a preferência
               salva 'render3dModo' nunca teve um gravador ativo — sempre
               cai no padrão 'solido'), então nada mais fica inalcançável
               de propósito, sem precisar caçar/apagar cada ponto que
               checava esses 2 modos. -->
          <select class="icon-btn" id="v3d-mode" title="Estilo de renderização das paredes/piso">
            <option value="solido">Sólido</option>
            <option value="wireframe">Wireframe</option>
          </select>
          <!-- [13/09/2026] NOVO — seletor "Andar" da topbar do "Ver em 3D".
               Só aparece quando o mapa tem pelo menos um objeto "Piso"
               plantado (ver Mapping.getPisos/_syncPisoSeletor3D) — mapa sem
               nenhum "Piso" continua com a barra idêntica a antes de hoje.
               "Todos os andares" (padrão) preserva 100% o comportamento
               atual; escolher um andar filtra a MONTAGEM da cena
               (Mapping.filterByPiso em _rebuildScene) — é também a
               otimização de desempenho pedida (só o andar escolhido é
               enviado pro engine3d.js, prédio inteiro não é montado). -->
          <!-- [14/09/2026 UTC] REMOVIDO — pedido verbatim: "Esse novo botão
               'Grupos' que você criou deve substituir o antigo botão
               'Andar'. Remova do projeto o botão 'Andar'." O seletor
               '#v3d-piso-wrap'/'_syncPisoSeletor3D' saiu; a mesma função
               (ocultar andar(es)) agora vive só no painel '🏷️ Grupos'
               (toggle por andar, 'map.andaresOcultos' — ver
               '_renderGruposPanelBody3D'). 'this._pisoFiltro3D' fica
               permanentemente 'null' (nunca mais setado por UI nenhuma) —
               'Mapping.filterByPiso' continua chamado em '_rebuildScene'
               por segurança/compatibilidade, mas sempre com 'null' (sem
               efeito nenhum, sempre "Todos os andares"). -->
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
          <!-- [10/09/2026] NOVO — pedido verbatim: "Deve aparecer um
               retangulo amarelo representado o enquadramento da camera
               [...] O retangulo amarelo pode ser habilitado e desabilitado
               por um botao em algum lugar." [10/09/2026, CORRIGIDO na
               mesma rodada] pedido verbatim: "O botao de enquadramento
               deve ser so para a camera atual, deve aparecer junto na
               barra em baixo (onde tem o botao 'Sair da camera')." O
               botao GLOBAL que existia aqui (ligava/desligava o
               enquadramento de TODAS as cameras de uma vez) foi removido
               — o botao agora e por camera, no rodape de "Ver atraves
               desta camera" (ver o botao de enquadramento em
               _renderFotoCamOverlay/Engine3D.setCameraFrustumVisible,
               sem crase aqui de proposito -- risco documentado de crase
               dentro de comentario HTML dentro de template literal). -->
          <!-- [10/09/2026] Botão "📐 Camera Match" REMOVIDO por pedido
               verbatim do usuário: "Remova o 'camera match' do projeto por
               enquanto." O script que definia PerspMatch não carrega mais
               (ver index.html), e o listener correspondente também foi
               removido logo abaixo (procurar por "v3d-perspmatch" no
               histórico/backup se precisar reverter) — js/perspmatch.js/
               js/perspmatch-math.js continuam intactos em disco, só não são
               mais chamados daqui. -->
          <!-- [14/09/2026] NOVO — pedido verbatim: botão habilitador
               "🛠️ Modelar objetos" no rodapé de "Ver em 3D". Quando LIGADO,
               o cartão de clique de um objeto (função _showObjectCard3D)
               ganha a opção "🔧 Modelar em 3D" no menu; DESLIGADO (padrão),
               a opção some do menu — reduz o cartão ao essencial
               (histórico/fechar) pra quem não está no meio de um trabalho
               de modelagem. Estado em memória, dura só enquanto o app está
               aberto (não existe hoje nenhum padrão de persistência de
               preferência de UI — tipo localStorage/IndexedDB — pra
               "ligar/desligar um recurso da tela 3D" no projeto; ver
               propriedade _modelarObjetosHabilitado desta view).
               [13/09/2026] MOVIDO — o BOTÃO em si saiu daqui e foi pra logo
               depois do seletor de modo (ver comentário grande lá, "não está
               aparecendo" — barra rola na horizontal e este botão nascia
               fora da 1ª tela visível); este comentário fica só de histórico
               do pedido original, o id v3d-modelar-toggle (usado pelo
               binding em mount(), mais abaixo) agora vive só naquele outro
               lugar. -->
          <!-- [14/09/2026 UTC] MOVIDO + RESTILIZADO — pedido verbatim: "No
               'Ver em 3D', no cabeçalho, há o botão 'Modelar objetos', este
               botão é o toggle entre 'Modo Navegação' e 'Modo Edição'. No
               mapa 2D, há um botão de toggle entre 'Modo Navegação' e 'Modo
               Desenho'. Use os mesmos ícones, e estilos no botão do 'Ver em
               3D' também. E assim como no mapa 2D o botão de toggle fica na
               ponta do grupo de botões da esquerda, faça com que, no 'Ver
               em 3D', fique na ponta do grupo de botões da esquerda
               também." Antes ficava logo depois do seletor de modo (ver
               histórico do pedido de 13/09/2026 acima), com classe só
               "icon-btn" e texto FIXO "🛠️ Modelar objetos" (só a classe
               '.active' mudava, sem trocar ícone/texto). Movido pra cá —
               a PONTA do grupo de botões da esquerda desta barra (logo
               antes do "⚙️" de Configurações, que é um ícone à parte, fora
               do grupo — mesma posição relativa que "🧭 Modo Navegação"
               ocupa no 2D: a ponta de #tbm-row0, ver mapview.js) — e
               restilizado com "icon-btn sm" (mesma classe do botão irmão
               do 2D, '#map-navtoggle') e o MESMO padrão de ícone/texto que
               troca conforme o estado (🧭 Modo Navegação / 🛠️ Modo Edição),
               em vez de um texto fixo com só a classe '.active' mudando —
               ver '_syncModelarToggleUI3D', que espelha '_syncNavModeUI'
               do mapview.js. Nenhuma mudança de COMPORTAMENTO — continua
               só ligando/desligando '_modelarObjetosHabilitado' (a opção
               "🔧 Modelar em 3D" aparecer ou não no menu de um objeto). -->
          <button type="button" class="icon-btn sm" id="v3d-modelar-toggle" title="Alterna entre Modo Navegação (só olhar/andar) e Modo Edição (o menu de um objeto, ao clicar nele, ganha a opção 'Modelar em 3D')">🧭 Modo Navegação</button>
          <!-- [13/09/2026 UTC] NOVO — pedido verbatim: 'Implemente isso em
               algum lugar de algum jeito, havendo correspondência entre 2D
               e 3D.' (sistema de classes/grupos). O botão espelha o '🏷️'
               do mapa 2D ('#map-grupos', mapview.js) e abre um painel
               equivalente aqui dentro do 'Ver em 3D', operando sobre o
               MESMO 'this._map' (ver '_openGruposPanel3D'/
               '_renderGruposPanelBody3D') — toda mudança chama
               'this._rebuildScene()' de novo, que já usa
               'Mapping.filterByGrupos' (ver comentário em '_rebuildScene').
               O destaque visual ('gruposDestacados', ✨) fica de fora do 3D
               por enquanto — só o 2D desenha o brilho dourado por cima do
               objeto (ver 'Map2DRenderer._drawDestaqueExtraObj' em
               mapview.js); reproduzir esse efeito em cima de uma malha do
               engine3d.js (troca de material/emissive por objeto, sem poder
               testar ao vivo no navegador) é um risco maior do que dá pra
               assumir nesta rodada — limitação conhecida. O toggle de ocultar (👁️/🚫), por
               andar/classe/paredes+piso, funciona igual ao 2D. -->
          <button type="button" class="icon-btn sm" id="v3d-grupos" title="Grupos: ative/desative a renderização de todo objeto de uma mesma 'classe' de uma vez (igual ao atributo 'class' do HTML), por andar, ou oculte todas as paredes/piso — mesmo sistema do mapa 2D">🏷️ Grupos</button>
          <button class="icon-btn icon-btn-corner" id="v3d-config" title="Configurações do 3D (raycasting/destaque)">⚙️<span class="icon-btn-corner-badge">3D</span></button>
        </div>
        <div class="hud3d">
          <span>WASD mover · espaço pular · shift correr · clique seleciona</span>
          <!-- [18/09/2026 UTC] NOVO (RODADA 145) — pedido verbatim: "No
               rodape do 'Ver em 3D' aparece as posicoes x, y e z da camera
               do personagem, coloque tambem as inclinacoes da camera ao
               lado esquerdo desta informacao." Mostra yaw (giro horizontal)
               e pitch (inclinacao vertical), em graus, lidos direto de
               this._camera.yaw/pitch (mesmas variaveis ao vivo usadas pelo
               controle de camera em primeira pessoa durante o movimento
               normal — nao as *_pointerLockSavedYaw/Pitch, que so guardam
               o valor no instante do ESC/saida do pointer lock). Preenchido
               no mesmo lugar do loop de render que ja atualiza #v3d-pos,
               logo abaixo. -->
          <span id="v3d-angle"></span>
          <span id="v3d-pos"></span>
          <!-- [13/09/2026] NOVO — pedido verbatim: "Entre eles [posição
               X/Y/Z e FPS], coloque a quantidade de objetos que está sendo
               renderizada naquele frame." Ver getRenderInfo() (engine3d.js)
               e o preenchimento deste span no loop de render, mais abaixo
               (mesmo lugar que já atualiza #v3d-fps a cada quadro). -->
          <span id="v3d-objcount" title="Objetos do catálogo (2D) vs. draw calls de verdade mandados pra GPU neste quadro — InstancedMesh agrupa vários objetos do mesmo tipo/andar num draw call só, e frustum/distância culling descartam o que está fora de vista"></span>
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
        <!-- [10/09/2026] UNIFICADO, pedido verbatim: "No 'Ver em 3D',
             unifique os 2 botoes expansiveis da lateral direita. Fica so o
             '+' para acessar o menu, ao ser aberto, a direita colado a
             tela, deve ter duas abas: 'Objetos' e 'Tijolos'. Ambas abas
             devem ser escritas de baixo para cima. Ao clicar em uma aba
             [...] todo o menu correspondente dela deve aparecer na bandeja
             do botao lateral direito." ANTES existiam DOIS botoes/paineis
             de verdade nesta lateral (o '+' de #v3d-objcat-toggle acima, e
             o antigo botao "tijolo" independente, cada um com seu proprio
             painel deslizante empurrado um abaixo do outro, top:110px/
             114px). Agora ha um UNICO painel (#v3d-objcat-panel) com abas
             verticais (mesma tecnica ja usada no botao ESQUERDO do
             Modelador, .m3d-sidebar-tabs/.m3d-sidebar-tab em
             css/modeler3d.css: 'writing-mode:vertical-rl' + 'rotate(180deg)'
             escreve o texto de baixo para cima, exatamente como pedido) —
             so espelhada pro lado direito (abas ficam do lado do botao "+",
             a direita; conteudo rolavel a esquerda delas). '_renderTijoloPanel'
             (js/view3d.js) continua escrevendo dentro de #v3d-tijolo-panel
             sem nenhuma mudanca interna — so o elemento deixou de ter seu
             proprio botao/posicionamento flutuante (ver CSS
             .v3d-tijolo-panel, style.css) e virou o conteudo da aba
             "Tijolos". Ver _toggleObjectCatalogPanel (agora unico ponto de
             abrir/fechar o painel inteiro) e _setV3dRightTab (nova, troca
             de aba) em view3d.js. -->
        <div class="v3d-objcat-panel hidden" id="v3d-objcat-panel">
          <div class="v3d-objcat-tabcontent">
            <div id="v3d-objcat-tab-content-objetos">
              <div class="v3d-objcat-panel-title">Objetos padrão</div>
              <div class="v3d-objcat-panel-list" id="v3d-objcat-panel-list"></div>
            </div>
            <div class="v3d-tijolo-panel hidden" id="v3d-tijolo-panel"></div>
            <!-- [15/09/2026] NOVO -- pedido verbatim (Parte B): "o botao
                 dropdown 'Propriedades' [...] deve ficar dentro do botao
                 '+' [...] Ficando vertical junto com os botoes verticais:
                 'Objetos' e 'Tijolos'." 3a aba do painel unificado da
                 lateral direita -- MESMO padrao de "Objetos"/"Tijolos"
                 acima (aba vertical + conteudo na mesma bandeja rolavel),
                 so que o conteudo aqui sao 3 secoes recolhiveis empilhadas
                 (mesmo padrao visual de .m3d-npanel/.m3d-npanel-head/
                 .m3d-npanel-body do Modelador, ver modeler3d.css -- CSS
                 nova .v3d-proppanel-* espelha o mesmo estilo) em vez de
                 uma lista/tabela: "Transformacao" (preenchida por
                 ModelerUI.updateNPanel quando o Modelador esta ativo -- ver
                 modeler-ui.js, substituindo o antigo painel flutuante
                 proprio que existia antes so pra isso), "Fundo" (NOVO --
                 pedido verbatim: "mostra o que hoje esta em 'Ver atraves
                 desta camera'->Imagem [...] ainda, coloque o botao
                 'Escurecer imagem'") e "Camera" (NOVO -- pedido verbatim:
                 "os botoes 'Enquadramento', 'Escurecer o entorno' e o
                 conteudo [...] de 'Propriedades'"). Construido/populado
                 por _renderPropriedadesPanel (view3d.js). -->
            <div class="v3d-objcat-tab-content-propriedades hidden" id="v3d-objcat-tab-content-propriedades">
              <!-- [12/09/2026] NOVO -- pedido verbatim: "a seta que aponta
                   para a direita deve apontar para baixo quando o submenu
                   [...] estiver aberto." A seta (▶/▼) virou um <i
                   class="v3d-proppanel-chevron"> à parte (em vez de texto
                   fixo dentro do <span> do título), pra poder ser trocada
                   em JS toda vez que a seção abre/fecha -- ver o handler de
                   clique logo abaixo desta função (mount()), que agora
                   também atualiza o chevron. Estado inicial de cada seção
                   já reflete se ela nasce aberta (▼, "Transformação", sem
                   ".collapsed") ou fechada (▶, "Fundo"/"Câmera", com
                   ".collapsed").
                   [13/09/2026] CORRIGIDO -- pedido verbatim: "em
                   'Transformação' [...], 'Fundo' e 'Câmera' há uma
                   setinha à direita apontando para baixo em cada um dos 3
                   botões. Remova-a, nos 3 botões." Existia uma 2ª seta,
                   SEPARADA da chevron acima (dinâmica ▶/▼, adicionada nesta
                   MESMA função na rodada anterior) -- um <span>&#9662;</span>
                   ESTÁTICO à direita de cada cabeçalho (nunca mudava,
                   sempre apontando pra baixo, mesmo com a seção fechada),
                   sobra de antes da chevron dinâmica existir. REMOVIDO (a
                   chevron à esquerda do título, dinâmica, continua sendo a
                   única seta de cada cabeçalho). Também corrigido
                   "Transformacao" (sem acento) -> "Transformação" (pedido
                   verbatim, mesma mensagem). -->
              <div class="v3d-proppanel-section" id="v3d-proppanel-transformacao">
                <div class="v3d-proppanel-head" id="v3d-proppanel-transformacao-head"><span><i class="v3d-proppanel-chevron">&#9662;</i> Transformação</span></div>
                <div class="v3d-proppanel-body" id="v3d-proppanel-transformacao-body"><div class="v3d-proppanel-empty">Nenhuma edicao em andamento (abra o Modelador).</div></div>
              </div>
              <div class="v3d-proppanel-section collapsed" id="v3d-proppanel-fundo">
                <div class="v3d-proppanel-head" id="v3d-proppanel-fundo-head"><span><i class="v3d-proppanel-chevron">&#9656;</i> Fundo</span></div>
                <div class="v3d-proppanel-body" id="v3d-proppanel-fundo-body"><div class="v3d-proppanel-empty">Disponivel dentro de "Ver atraves desta camera".</div></div>
              </div>
              <div class="v3d-proppanel-section collapsed" id="v3d-proppanel-camera">
                <div class="v3d-proppanel-head" id="v3d-proppanel-camera-head"><span><i class="v3d-proppanel-chevron">&#9656;</i> C&acirc;mera</span></div>
                <div class="v3d-proppanel-body" id="v3d-proppanel-camera-body"><div class="v3d-proppanel-empty">Disponivel dentro de "Ver atraves desta camera".</div></div>
              </div>
            </div>
          </div>
          <div class="v3d-objcat-tabs" id="v3d-objcat-tabs">
            <button type="button" class="v3d-objcat-tab active" id="v3d-objcat-tab-objetos" data-tab="objetos">Objetos</button>
            <button type="button" class="v3d-objcat-tab" id="v3d-objcat-tab-tijolos" data-tab="tijolos">Tijolos</button>
            <button type="button" class="v3d-objcat-tab" id="v3d-objcat-tab-propriedades" data-tab="propriedades">Propriedades</button>
          </div>
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
    // NOVO (07/09/2026), pedido verbatim: "Use este arquivo [exemplo de
    // múltiplas câmeras com renderer.setViewport/setScissor] para fazer as
    // várias câmeras, tanto o 'Ver em 3D' quanto a miniatura e, também,
    // qualquer outro retângulo que possa ser colocado um 'olho' para ver a
    // cena." — `{ eye: true }` faz este Engine3D (o "Ver em 3D" em tela
    // cheia — e o Modelador 3D, que reaproveita esta MESMA instância, ver
    // js/modeler/modeler-render.js) desenhar através do ÚNICO contexto
    // WebGL compartilhado do app (ver comentário grande "MODO EYE" em
    // engine3d.js), em vez de um contexto próprio — `#v3d-canvas` vira só
    // a "moldura" que define ONDE esta instância desenha (seu retângulo na
    // tela), preservando 100% do comportamento de física/raycasting/
    // controles já existente (`hoverPick`/`centerRay` sempre miram o
    // CENTRO da câmera, não uma posição de mouse na tela — funcionam
    // idênticos não importa o tamanho/posição do retângulo). Ver CSS em
    // style.css (`.view3d-wrap`) — o fundo sólido que existia ali precisou
    // virar transparente, senão cobriria o canvas global por trás.
    // [13/09/2026] NOVO — "Resolução de renderização (Ver em 3D)" das
    // Configurações 3D (ver mapconfig.js DEFAULTS.resolucaoCustom3D) — lida
    // aqui junto com `cfgInicial` (mesmo motivo do comentário logo acima:
    // só faz efeito de verdade se já estiver certa na 1ª montagem). `null`
    // ("Automática", padrão) não passa `customRes` nenhum pro Engine3D —
    // pipeline 100% igual a antes desta rodada. Ver `_applyResolucaoCustom3D`
    // (aplica o CSS object-fit/fundo do canvas de acordo com `fit`).
    this._engine = new Engine3D(canvas, cfgInicial, { eye: true, customRes: cfgInicial?.resolucaoCustom3D || null });
    // [18/09/2026 UTC] RODADA 166 -- qualquer mudanca de rede (cabo conectado/removido, rotulo) por
    // Script/menu/painel: salva o mapa e refaz os cabos 3D na hora.
    if (window.RedeEquip) {
      window.RedeEquip.aoMudar = (map) => {
        try { DB.saveMap(this._map); } catch (e) { /* segue */ }
        if (this._engine && this._engine.mapData && this._map) this._engine.mapData.cabos = this._map.cabos;
        this._engine?.rebuildCabos?.();
      };
    }
    this._applyResolucaoCustom3D(canvas, cfgInicial?.resolucaoCustom3D || null);
    // [10/09/2026, CORRIGIDO na mesma rodada] a preferência GLOBAL de
    // enquadramento foi removida (virou um botão por câmera, no rodapé —
    // ver comentário grande junto ao HTML de `#v3d-frustum-toggle`, agora
    // removido). Cada gizmo já nasce OCULTO por padrão (`Engine3D`
    // constructor, `this._frustumGizmosEnabled = false`) — visível só
    // enquanto o usuário liga o botão desta câmera especificamente.

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
        // [16/09/2026 UTC] NOVO — mantém a janelinha de acesso rápido da
        // Trena 3D (ver `_trena3DEnsurePainelRapido`) sincronizada: mostra/
        // esconde conforme `trena3DPainelRapidoAtivo` e atualiza os ícones
        // conforme qualquer opção correspondente mudar (inclusive mudada por
        // fora da própria janelinha, direto nas Configurações 3D).
        this._trena3D._trena3DEnsurePainelRapido();
        this._trena3D._trena3DAtualizarPainelRapido();
        // [RODADA 139] "➰ Polilinha 3D" deixou de ser ferramenta separada —
        // agora é só um modo (`trena3DModo`) da própria "📏 Trena 3D". Ao
        // mudar o modo (toggle em ⚙️ Configurações 3D), o rodapé precisa
        // re-renderizar pra trocar ícone/rótulo do botão.
        this._renderHotbar();
        // [16/09/2026 UTC] NOVO — pedido verbatim: "As alterações feitas
        // nas 'configurações 3D' devem ser aplicadas imediatamente no mapa.
        // Por exemplo, ao mudar a ponta de seta para reta (perpendicular),
        // só ao inserir uma nova medida que houve a mudança. Não deve ser
        // assim, deve ser imediato." CAUSA: `_trena3DRebuildLines()` (a
        // única função que desenha as medidas JÁ SALVAS, lendo a config
        // toda vez que roda — `_trena3DCfg()`) só era chamada em 3
        // situações: abrir "Ver em 3D" (`_rebuildScene`), trocar de andar, e
        // salvar uma medida nova (`_trena3DFinalize`) — nunca por SÓ mudar
        // uma opção em ⚙️ Configurações 3D com medidas já existentes na
        // tela. CORRIGIDO: compara um "retrato" das opções da seção "📏
        // Trena 3D" que afetam a APARÊNCIA das medidas JÁ DESENHADAS
        // (estilo do rótulo, visibilidade/oclusão, espessura, cores, ponta)
        // a cada mudança de config — muda alguma, refaz as linhas na hora,
        // sem precisar inserir uma medida nova ou reabrir o 3D. Opções que
        // só afetam a PRÉVIA (ainda não commitada, ex.: cor da mira, guias
        // de grade) não precisam disso — `_trena3DUpdatePreview` já lê a
        // config do zero every quadro, sempre ao vivo por natureza.
        // [16/09/2026 UTC] NOVO — pedido verbatim: "'Linhas verticais das
        // medidas finalizadas', ao marcar 'Mostrar...' deve ser de
        // aplicação imediata, não após inserir uma nova medida." Faltavam
        // `trena3DMostrarLinhasAncoraFinalizada`/`trena3DLinhasAncoraFinalizadaModo`
        // neste "retrato" — sem eles aqui, marcar/desmarcar a opção só tinha
        // efeito visual na PRÓXIMA medida nova ou reabertura do 3D (mesmo
        // bug de fundo que este retrato inteiro já existe pra evitar, ver
        // comentário grande acima).
        // [19/09/2026 UTC] RODADA 191 — lógica movida pra `Trena3D.onMapConfigChange(c)` (js/trena3d.js): compara o "retrato" das opções que afetam a aparência das medidas já desenhadas e refaz as linhas na hora se algo relevante mudou. Ver o método pra detalhes.
        this._trena3D.onMapConfigChange(c);
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
        // "Resolução de renderização (Ver em 3D)" (ver
        // mapconfig.js/_applyResolucaoCustom3D) — reage AO VIVO, sem
        // precisar fechar/reabrir a tela: `setCustomRes3D` (engine3d.js)
        // troca só o tamanho do render target no próximo `_resize()` (o
        // loop de render já chama isso a cada quadro sozinho), e
        // `_applyResolucaoCustom3D` (mesma função de `mount()`, ver acima)
        // reaplica o CSS object-fit/fundo do canvas conforme o `fit` novo.
        const resAntes = JSON.stringify(this._engine?._customRes || null);
        const resDepois = JSON.stringify(c.resolucaoCustom3D || null);
        if (resAntes !== resDepois) {
          this._engine?.setCustomRes3D?.(c.resolucaoCustom3D || null);
          this._applyResolucaoCustom3D(canvas, c.resolucaoCustom3D || null);
        }
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
        // [17/09/2026 UTC] NOVO (RODADA 125) — reaplica o botão flutuante 🐞
        // ao vivo (visibilidade via 'debugBotaoTelaAtivo', estado visual via
        // 'debugModoAtivo').
        this._trena3D._trena3DEnsureDebugBotaoTela();
        // [18/09/2026 UTC] NOVO (RODADA 150) — reaplica ao vivo a
        // visibilidade do painel de debug de câmera (yaw/pitch), conforme
        // 'debugModoAtivo' (mestre) + 'debugCameraPanelAtivo' (checkbox
        // dedicado) — ver _isDebugCameraPanelAtivo/_v3dApplyDebugCamPanelVisibilidade.
        this._v3dApplyDebugCamPanelVisibilidade();
        // [13/09/2026] NOVO, [14/09/2026] AMPLIADO — pedido verbatim
        // (13/09): "mesmo ativando o debug, não está dando efeito. Por
        // exemplo, deixei marcada a opção 'Enquadramento de câmera', porém
        // o retângulo amarelo e todo o aramado da câmera não apareceram.";
        // pedido verbatim (14/09, mesmo problema persistindo): "se 'Ativar
        // modo Debug' e 'Enquadramento de câmera' estiverem marcados,
        // então, o aramado amarelo da câmera [...] deve começar a ser
        // renderizado. Atualmente, não está sendo renderizado." CAUSA RAIZ
        // COMPLETA (só achada na 2ª investigação): diferente das outras
        // opções de Debug (transferidor/prolongamento/alvo-orbital, lidas a
        // cada QUADRO via `_isDebugXAtivo()` dentro do loop de render —
        // essas já reagiam ao vivo), a visibilidade do gizmo "retângulo
        // amarelo"/aramado SEMPRE nasceu ESCONDIDA por padrão (ver
        // `_frustumGizmosEnabled=false`, comentário grande no `mount()`) e
        // só ficava visível DEPOIS de entrar em "Ver através desta câmera"
        // — momento em que não dá pra ver o aramado DA PRÓPRIA câmera
        // (olhando de DENTRO dela). O pedido descreve olhar PRA a câmera de
        // FORA, andando pela cena normalmente — por isso a correção de
        // 13/09 (só reaplicava a câmera "ativa" no momento, dentro do modo
        // câmera) não resolvia de verdade. CORRIGIDO: reaplica agora,
        // GLOBALMENTE, em TODAS as câmeras/fotos com frustum de uma vez
        // (`setCameraFrustumsVisible`, o método plural — ver também a
        // aplicação equivalente logo após `setScene()`, em
        // `_rebuildScene()`, que cobre a abertura inicial/qualquer rebuild
        // da cena).
        const novoAtivo = this._isDebugEnquadramentoCameraAtivo();
        this._engine?.setCameraFrustumsVisible?.(novoAtivo);
        // Se além disso a pessoa estiver DENTRO de "Ver através desta
        // câmera" agora mesmo, também redesenha o traço-guia do canvas 2D
        // (`_updateFotoCamOverlayZoomScale`) e sincroniza o botão "🟨
        // Enquadramento" da aba Propriedades (que reflete só a câmera
        // ATUAL, não o estado global).
        const fotoIdAtivo = this._fotoCamMode?.fotoId
          ?? (this._orbCamMode ? (this._map?.cameras || []).find((cm) => cm.id === this._orbCamMode.camId)?.fotoId : null);
        if (fotoIdAtivo != null && this._engine?.hasCameraFrustum?.(fotoIdAtivo)) {
          this._updateFotoCamOverlayZoomScale?.(); // redesenha o traço no canvas 2D (ver comentário grande em _renderPropriedadesPanel, botão "🟨 Enquadramento")
          this._container?.querySelector('#v3d-proppanel-frustum-toggle')?.classList.toggle('active', novoAtivo);
        }
      };
      MapConfig.onChange(this._onMapConfigChange);
    }
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Faça uma janelinha com todas
    // as opções do 'Trena 3D' [...] Será como um acesso rápido [...] Por
    // padrão, ativado." Ver `_trena3DEnsurePainelRapido` — a própria função
    // já decide se mostra ou não, conforme `trena3DPainelRapidoAtivo`.
    this._trena3D._trena3DEnsurePainelRapido();
    // [17/09/2026 UTC] NOVO (RODADA 125) — cria/exibe o botão flutuante 🐞
    // já na abertura do "Ver em 3D" (ver comentário grande na função).
    this._trena3D._trena3DEnsureDebugBotaoTela();
    // [17/09/2026 UTC] NOVO (RODADA 113) — pedido verbatim: "Até para a
    // primeira vez que as prévias são geradas, elas devem ser feitas em
    // segundo plano para já ficarem prontas caso ainda não se tenha uma
    // prévia já cacheada." Dispara o pré-aquecimento (fire-and-forget) das
    // prévias 3D da seção "Trena 3D" assim que "Ver em 3D" monta — bem
    // antes do usuário conseguir abrir "Configurações 3D" — pra que, na
    // prática, os ~19 ícones já estejam prontos (em cache) quando o modal
    // for aberto de verdade (ver `MapConfig.trena3DPreAquecerPreviewsEmSegundoPlano`
    // em mapconfig.js).
    if (typeof MapConfig !== 'undefined') MapConfig.trena3DPreAquecerPreviewsEmSegundoPlano?.();
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
      // NOVO (12/09/2026) — pré-carrega (em paralelo, sem travar a entrada
      // na tela) os arquivos de assets/modelos/ de todo `tipo` de objeto
      // presente neste mapa, ANTES do usuário poder clicar em qualquer
      // coisa — ver comentário grande em js/objectassets.js
      // `warmupModelsForMap`/`dispatchClick3D`, e o novo dispatch de
      // clique mais abaixo neste mesmo arquivo (raycaster hit).
      window.ObjectAssets?.warmupModelsForMap(this._map);
      await this._buildItensNoMapa();
      // [09/09/2026] Ver comentário grande em _buildFotosNoMapa — sem isto,
      // "orb de foto" nunca aparecia na cena 3D (this._map.fotos nunca era
      // preenchido aqui, só no editor 2D).
      await this._buildFotosNoMapa();
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
      const baseY = (camAtiva.piso || 0) * (this._map?.alturaPiso || 2.8);
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
      // [20/09/2026 UTC] NOVO (RODADA 228) -- corrige o escopo da RODADA 223: "guardar apontamento da
      // câmera do personagem" (`MapConfig.mapa2DPersistirApontamentoPersonagem`) tinha sido ligado só ao
      // ÂNGULO 2D do boneco (`p2d.angulo`, usado acima só como yaw INICIAL de fallback) -- pedido do
      // usuário confirma que "apontamento da câmera" é o yaw/pitch da câmera LIVRE 3D de verdade
      // (`this._camera.yaw/pitch`, a mesma dupla mexida pelo mouse-look em pointer lock, ver
      // `_camera.yaw += .../_camera.pitch = ...` no handler de `mousemove` mais abaixo neste arquivo).
      // Se o checkbox estiver marcado E houver um yaw salvo (gravado por `unmount()`, ver comentário
      // grande lá), sobrescreve o yaw/pitch calculado acima -- SÓ neste ramo (entrada via personagem 2D;
      // não se aplica à entrada por "câmera ativa pro 3D" logo acima, que já tem seu próprio apontamento
      // fixo vindo do ícone da câmera no mapa).
      if (cfgInicial && cfgInicial.mapa2DPersistirApontamentoPersonagem === true && Number.isFinite(cfgInicial.mapa2DApontamentoRecargaYaw)) {
        this._camera.yaw = cfgInicial.mapa2DApontamentoRecargaYaw;
        this._camera.pitch = Number.isFinite(cfgInicial.mapa2DApontamentoRecargaPitch) ? cfgInicial.mapa2DApontamentoRecargaPitch : 0;
      }
    }
    // [10/09/2026] NOVO — consumo do pedido de entrada direta na visão de um
    // "orb de câmera" (ver `this._pendingEnterCamOrbId`, campo declarado
    // acima, e o botão que o seta em mapview.js `_openCameraPanel`). Feito
    // aqui (mount() já terminando de montar `this._map`/`this._camera`
    // "normais"), mas a entrada de verdade (`_enterCameraOrbView`, que
    // também precisa de `this._engine`, criado mais abaixo neste mesmo
    // mount()) só roda no fim da função — guarda só o id aqui pra não
    // perdê-lo entre os `await`s deste método.
    const pendingCamOrbId = this._pendingEnterCamOrbId;
    this._pendingEnterCamOrbId = null;
    if (pendingCamOrbId) {
      // `this._engine` só existe depois do resto deste mount() terminar —
      // em vez de caçar o ponto exato do `return` (função enorme, alto
      // risco de editar no lugar errado), espera em pequenos passos até o
      // engine existir (normalmente 1-2 tentativas) antes de entrar de
      // verdade — mesmo padrão defensivo de outros "espera X ficar pronto"
      // já usados no app (ex. _afterObjectAddedIncremental).
      const tentarEntrarNoOrb = (tentativas) => {
        if (!this._container) return; // tela fechada/trocada antes de terminar
        if (this._engine && this._map) { this._enterCameraOrbView(pendingCamOrbId); return; }
        if (tentativas > 0) setTimeout(() => tentarEntrarNoOrb(tentativas - 1), 80);
      };
      setTimeout(() => tentarEntrarNoOrb(40), 0);
    }

    // App.closeView3D (não App.navigate('mapa')) — volta pra Planta baixa
    // direto, de onde "Ver em 3D" foi clicado, em vez de reiniciar a pilha
    // do Mapa na tela de entrada (pedido do usuário, ver comentário lá).
    container.querySelector('#v3d-close').onclick = () => { document.exitPointerLock?.(); App.closeView3D(); };
    const modeSel = container.querySelector('#v3d-mode');
    modeSel.onchange = () => { this._engine.setMode(modeSel.value); this._rebuildScene(); };
    // [14/09/2026 UTC] REMOVIDO — chamada a '_syncPisoSeletor3D' (botão
    // "Andar", ver comentário grande no template acima).
    container.querySelector('#v3d-config').onclick = () => this._openMapConfig();
    // [14/09/2026 UTC] Botão "🧭 Modo Navegação"/"🛠️ Modo Edição" (ver
    // comentário grande junto do botão, no HTML) — só alterna
    // `_modelarObjetosHabilitado`; quem realmente lê esse estado é
    // `_showObjectCard3D`, na hora de montar o menu do objeto. Ícone/texto
    // trocam conforme o estado, igual ao botão irmão do 2D (ver
    // `_syncModelarToggleUI3D` abaixo, espelha `_syncNavModeUI` do
    // mapview.js).
    this._syncModelarToggleUI3D(container);
    const modelarToggleBtn = container.querySelector('#v3d-modelar-toggle');
    if (modelarToggleBtn) {
      modelarToggleBtn.onclick = () => {
        this._modelarObjetosHabilitado = !this._modelarObjetosHabilitado;
        this._syncModelarToggleUI3D(container);
      };
    }
    const gruposBtn3D = container.querySelector('#v3d-grupos');
    if (gruposBtn3D) gruposBtn3D.onclick = () => this._toggleGruposPanel3D(container);
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
    // [10/09/2026] Listener do botão "📐 Camera Match" REMOVIDO junto com o
    // botão em si (ver comentário grande no HTML dele acima) — pedido
    // verbatim: "Remova o 'camera match' do projeto por enquanto." O
    // elemento '#v3d-perspmatch' não existe mais no HTML, então este
    // listener ficaria sem efeito de qualquer forma; removido por clareza.
    // js/perspmatch.js/js/perspmatch-math.js continuam intactos em disco,
    // só não carregam mais (ver index.html) — reversível re-adicionando os
    // 2 scripts, o botão e este listener.

    await this._initBuildHotbar();
    container.querySelector('#v3d-objcat-toggle').onclick = () => this._toggleObjectCatalogPanel();
    // [10/09/2026] Botão "🧱" independente REMOVIDO (ver comentário grande
    // no HTML do painel unificado) — as duas abas agora vivem dentro do
    // mesmo painel/botão "+" acima; ver _setV3dRightTab.
    container.querySelector('#v3d-objcat-tab-objetos').onclick = () => this._setV3dRightTab('objetos');
    container.querySelector('#v3d-objcat-tab-tijolos').onclick = () => this._setV3dRightTab('tijolos');
    // [15/09/2026] NOVO -- 3ª aba "Propriedades" (ver HTML/comentário
    // grande acima) + os 3 cabeçalhos recolhíveis (Transformação/Fundo/
    // Câmera) dentro dela -- mesmo padrão de clique-pra-recolher já usado
    // em `#m3d-npanel-head` (modeler-ui.js), aqui construído 1x aqui
    // (sobrevive a entrar/sair do Modelador, igual ao resto desta bandeja
    // unificada) em vez de a cada `build()` do Modelador.
    container.querySelector('#v3d-objcat-tab-propriedades').onclick = () => this._setV3dRightTab('propriedades');
    // [12/09/2026] NOVO -- pedido verbatim: "a seta que aponta para a
    // direita deve apontar para baixo quando o submenu [...] estiver
    // aberto." Além de alternar ".collapsed", agora também troca o
    // caractere do ".v3d-proppanel-chevron" (▶ fechado / ▼ aberto) -- ver
    // comentário grande junto ao HTML destas 3 seções, acima.
    ['transformacao', 'fundo', 'camera'].forEach((secao) => {
      const head = container.querySelector(`#v3d-proppanel-${secao}-head`);
      const sec = container.querySelector(`#v3d-proppanel-${secao}`);
      const chevron = head?.querySelector('.v3d-proppanel-chevron');
      if (head && sec) head.onclick = () => {
        sec.classList.toggle('collapsed');
        if (chevron) chevron.innerHTML = sec.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
      };
    });
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

    // [16/09/2026 UTC] RODADA 101 -- CORRIGIDO bug verbatim: "Acabou
    // aparecendo um scroll na tela do 'Ver em 3D' [...] Ao redimensionar a
    // tela [...] nao deve aparecer scroll vertical, nem horizontal." CAUSA
    // RAIZ: `.view3d-wrap` (criado dentro de `container.innerHTML` acima)
    // sempre teve `overflow:hidden` (css/style.css), MAS a janelinha de
    // acesso rapido da Trena 3D (`_trena3DEnsurePainelRapido`), o botao de
    // reabri-la, o HUD de performance e outros elementos soltos sao
    // anexados a `this._container` (o elemento PAI recebido aqui de fora,
    // ver `_trena3DEnsurePainelRapido`/`_trena3DMostrarBotaoReabrirPainelRapido`
    // -- `(this._container||document.body).appendChild(...)`) -- ou seja,
    // sao IRMAOS de `.view3d-wrap`, NAO filhos dela -- o `overflow:hidden`
    // de `.view3d-wrap` nunca os continha. `this._container` só ganhava
    // `position:relative` (necessário pro `position:absolute` dos filhos
    // ser relativo a ele), mas NUNCA `overflow:hidden` -- se a janelinha
    // (redimensionável desde a Rodada 100, com `left`/`top`/`width`/
    // `height` proprios) ficasse com posicao/tamanho que ultrapassasse os
    // limites de `this._container` (ex. apos redimensionar a JANELA DO
    // NAVEGADOR, encolhendo `this._container` mas mantendo a janelinha nas
    // MESMAS coordenadas absolutas antigas), ela "vazava" pra fora,
    // criando scroll na pagina. CORRIGIDO EM 2 FRENTES: (1) `overflow:
    // hidden` forcado aqui em `this._container` (alem do `position:
    // relative` ja existente) -- nada solto dentro dele consegue mais
    // gerar scrollbar de pagina, mesmo que fique posicionado fora da area
    // visivel (só fica visualmente cortado, nunca rolavel); (2) um
    // `ResizeObserver` novo em `this._container` chama
    // `_trena3DClampPainelRapidoNoContainer()` (abaixo) sempre que o
    // container muda de tamanho -- reposiciona a janelinha (e, por
    // tabela, o botao de reabri-la) de volta pra DENTRO dos novos limites
    // caso ela tivesse ficado fora, em vez de só confiar no corte visual
    // do `overflow:hidden`.
    this._trena3D.mount();

    this._running = true;
    this._lastT = performance.now();
    this._lastRenderT = 0;
    this._loopHandle = requestAnimationFrame((t) => this._loop(t));

    // Pedido do usuário: HUD (FPS/CPU/RAM) ancorado no canto superior
    // direito DO CANVAS (não da janela), nos dois modos (normal e
    // Modelador) — ver comentário em `Perf.setCanvasAnchor`.
    window.Perf?.setCanvasAnchor?.(container.querySelector('.view3d-wrap'));

    // [13/09/2026] NOVO — pequeno indicador de hora do relógio do mundo
    // (ver js/relogio-mundo.js), plugado no MESMO wrapper do HUD de FPS
    // acima (canto superior ESQUERDO, pra não brigar com o de FPS/pos, que
    // fica no direito). Idempotente — attachHUD já não duplica se chamado
    // de novo pro mesmo container (reconstrução de cena, etc.).
    window.RelogioMundo?.attachHUD?.(container.querySelector('.view3d-wrap'));

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
      // NOVO (07/09/2026), pedido verbatim: "inquebrável, tudo com estrutura
      // try{}catch(){} [...]" — `Modeler3D.enter` rodando dentro de um
      // `setTimeout` significa que uma exceção aqui vira uma rejeição/erro
      // NÃO capturável por quem chamou `mount()` (o `try/catch` de
      // `App.openView3D`, ver app.js, já retornou muito antes deste
      // callback disparar) — sem proteção própria, isso ficava só no
      // console, sem nenhum aviso na tela.
      if (alvo && window.Modeler3D) setTimeout(() => {
        try { window.Modeler3D.enter(this, alvo, { enterOrbital: !(this._orbCamMode || this._fotoCamMode) }); } // [12/09/2026 — ITEM C]
        catch (err) {
          if (typeof ModuleHost !== 'undefined') ModuleHost.showLoadError('Modelador 3D', err);
          else console.error('Falha ao entrar no Modelador 3D:', err);
        }
      }, 0);
    }
  },

  unmount() {
    // [18/09/2026 UTC] RODADA 167 -- devolve o item carregado / remove overlays (view3d-rede.js)
    try {
      this._menuFecharRede?.(); this._redeCancelar?.(false); this._redeHint?.(null);
      if (this._hoverRotEl) { this._hoverRotEl.remove(); this._hoverRotEl = null; }
      // [20/09/2026 UTC] NOVO (RODADA 221) -- remove as divs de etiqueta 'always' (uma por cabo, ver
      // `_rotulosSempreAtualizar` em view3d-rede.js) ao sair do modo 3D, senão ficam órfãs no DOM.
      if (this._rotulosSempreEl) { this._rotulosSempreEl.forEach((div) => div.remove()); this._rotulosSempreEl.clear(); }
    } catch (err) { /* nada a limpar */ }
    if (window.RedeEquip) window.RedeEquip.aoMudar = null; // [18/09/2026 UTC] RODADA 166 -- volta ao salvamento direto (fora do 3D)
    // [16/09/2026 UTC] MOVIDO PRA CÁ (era o ÚLTIMO bloco desta função) —
    // pedido verbatim: "Ao iniciar o app e ir direto no botão 'Ver em 3D'
    // (quando está no rodapé do app), e clicar no botão 'Sair do 3D', as
    // medidas ficam ainda sendo impressas na tela do app." CAUSA RAIZ
    // SUSPEITA: os rótulos (`<div>`) da Trena 3D são anexados a
    // `document.body` DE PROPÓSITO (`position:fixed`, ver comentário grande
    // logo abaixo/`_trena3DRebuildLines`) — só removidos manualmente aqui em
    // `unmount()`, já que não são filhos de `this._container`. Esta função é
    // uma sequência longa de vários passos (Modelador/câmeras especiais/
    // sobrevoo/sincronização com MapView._personagem2D/dispose do
    // Engine3D/etc.) — ESTE bloco de limpeza da Trena 3D era o ÚLTIMO de
    // todos: se QUALQUER passo anterior lançasse uma exceção (mais provável
    // justamente entrando por um caminho diferente do "Mapa → Planta baixa"
    // de sempre, ex. um atalho direto no rodapé do app, que pode deixar
    // `this._map`/`window.MapView`/outro estado assumido pelos passos
    // anteriores diferente do usual), a função inteira parava no meio e este
    // bloco NUNCA rodava — os `<div>` ficavam pendurados no `<body>` pra
    // sempre, visíveis por cima de QUALQUER tela seguinte do app (não só
    // "Ver em 3D"). CORRIGIDO: bloco inteiro movido pra rodar PRIMEIRO,
    // antes de qualquer outro passo que possa falhar — garante que os
    // rótulos da Trena 3D somem do `<body>` sempre que `unmount()` for
    // chamado, não importa o que aconteça depois.
    // [16/09/2026 UTC] RODADA 101 -- desconecta o `ResizeObserver` de
    // `this._container` criado em `mount()` (ver comentário grande lá) --
    // sem isso ele continuaria "vivo" observando um elemento que já não
    // pertence mais à tela "Ver em 3D" atual.
    // [19/09/2026 UTC] RODADA 191 — toda a limpeza de estado da Trena 3D (grupos THREE, linhas/rótulos DOM soltos, observers) foi movida pra `Trena3D.destroy()` (js/trena3d.js) — ver o método pra detalhes de cada campo.
    this._trena3D?.destroy();

    // Sessão do Modelador 3D (js/modeler/*.js) em andamento? Encerra AGORA
    // (salvando o que estava editado) antes do resto da limpeza abaixo —
    // `this._engine.dispose()`, logo adiante, destrói cena/malhas/listeners
    // que o modelador ainda referencia; sair da Visualização 3D com o
    // modelador aberto (ex.: botão "✕ Sair do 3D" clicado sem antes fechar o
    // modelador) não pode deixar listeners/estado órfãos presos no `canvas`
    // antigo (o mesmo tipo de vazamento que os outros unbinds desta função já
    // evitam para os controles do próprio View3D).
    if (window.Modeler3D?.isActive?.()) window.Modeler3D.exit({ skipRebuild: true });
    // [13/09/2026] NOVO — pedido verbatim (pilha de "Sair", ver comentário
    // grande em `_exitModeladorSeAtivo`/`_exitCameraView`): "Ao clicar em
    // 'Sair do 3D', estando no modo 'Ver através desta câmera' [...] a
    // posição em que o personagem estava ao se entrar no modo 'Ver através
    // de uma câmera' deve ser preservada." CAUSA RAIZ do bug relatado: sair
    // "de uma vez" pelo "✕ Sair do 3D" nunca passava por
    // `_exitFotoCameraView`/`_exitCameraOrbView`/`_exitCameraView` (só por
    // este `unmount()`, direto) — são essas 3 funções (ver cada uma) que
    // reposicionam `this._camera` de volta pra pose travada da câmera OU
    // pra pose original de antes de entrar (conforme a preferência em
    // Configurações), desfazendo o passeio do "piloto automático" que roda
    // por baixo o tempo todo enquanto um desses modos está ativo (ver
    // `_updateAutopilot`, chamado a cada quadro por `_loop` enquanto
    // `_camMode`/`_fotoCamMode`/`_fotoCamMode` estiver setado). Sem chamar
    // a função de saída certa primeiro, a sincronização abaixo (`this.
    // _camera.x/y/z` -> `MapView._personagem2D`) gravava a posição ATUAL do
    // piloto automático (podendo estar "mais longe" do que o personagent
    // deveria) em vez da pose corrigida. Chamado ANTES da sincronização,
    // igual ao Sobrevoo automático logo abaixo (mesmo motivo/mesmo
    // padrão) — cada função já cuida de zerar o próprio modo (`_camMode`/
    // `_fotoCamMode`/`_orbCamMode`) e, por sua vez, chama
    // `_exitModeladorSeAtivo()` de novo no próprio topo (idempotente, já
    // não há mais nada pra sair a essa altura — Modelador já foi encerrado
    // na linha acima).
    if (this._camMode) this._exitCameraView();
    if (this._fotoCamMode) this._exitFotoCameraView();
    if (this._orbCamMode) this._exitCameraOrbView();
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
      // [20/09/2026 UTC] NOVO (RODADA 228) -- ver comentário grande em mount() (ramo `_personagem2D`,
      // acima) explicando a correção de escopo. Grava o yaw/pitch DE VERDADE da câmera livre 3D
      // (`this._camera.yaw/pitch`, já finalizado aqui pelas correções de pose acima -- exitCameraView/
      // exitFotoCameraView/exitCameraOrbView/finishFlythrough) via o MESMO `MapConfig.set()` já usado
      // pra tudo mais desta seção (js/mapview.js `_unmountPlanta`), só que disparado daqui -- é só em
      // view3d.js que o yaw/pitch da câmera livre existe de verdade. Só grava se o checkbox
      // `mapa2DPersistirApontamentoPersonagem` estiver marcado; sem `await` de propósito (mesmo padrão
      // "dispara e esquece" de `_unmountPlanta`, não pode atrasar o resto do unmount()).
      if (typeof MapConfig !== 'undefined' && MapConfig.set) {
        const cfgSair = MapConfig._cache || MapConfig.DEFAULTS || {};
        if (cfgSair.mapa2DPersistirApontamentoPersonagem === true) {
          MapConfig.set({
            mapa2DApontamentoRecargaYaw: this._camera.yaw,
            mapa2DApontamentoRecargaPitch: this._camera.pitch,
          }).catch((e) => console.warn('Falha ao persistir yaw/pitch da câmera livre 3D:', e));
        }
      }
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
    // [12/09/2026] CORRIGIDO — bug real reportado: "No 'Trás', a imagem não
    // está aparecendo. No 'Frente' está funcionando tudo." CAUSA RAIZ
    // ENCONTRADA: `this._fotoCamBackdropMesh`/`_fotoCamBackdropCanvas`/
    // `_fotoCamBackdropCtx`/`_fotoCamBackdropTexture` (plano 3D real do
    // backdrop 'Trás', restaurado na rodada anterior — ver
    // `_ensureFotoCamBackdropPlane`) são guardados como campos DESTE objeto
    // `this` (o módulo View3D, um singleton reaproveitado por toda a vida da
    // página — nunca uma instância nova por sessão), mas NUNCA eram
    // resetados aqui, em `unmount()`. `mount()` (logo acima nesta mesma
    // classe) SEMPRE cria um `new Engine3D(...)` do zero a cada vez que "Ver
    // em 3D" é aberto (`this._engine = new Engine3D(...)`), com uma
    // `THREE.Scene` NOVA por baixo (`engine3d.js` construtor, `this.scene =
    // new THREE.Scene()`) — mas `_ensureFotoCamBackdropPlane()` tem uma
    // guarda de "criar só uma vez" (`if (this._fotoCamBackdropMesh) return
    // this._fotoCamBackdropMesh;`) que, sem este reset, devolvia o mesh
    // ÓRFÃO da cena ANTERIOR (já descartada por `this._engine.dispose()`
    // acima) sem NUNCA adicioná-lo à cena NOVA (`engine.scene.add(mesh)` só
    // roda dentro do `if (!this._fotoCamBackdropMesh)`, pulado sempre que já
    // havia um valor salvo de uma sessão 3D anterior). Resultado exato do
    // bug relatado: a 1ª vez que se abre "Ver em 3D" numa aba do navegador e
    // entra em "Ver através desta câmera" → "Trás", o plano aparece
    // normalmente (campo ainda `undefined`, criado do zero, adicionado à
    // única cena que existe); a partir da 2ª vez que "Ver em 3D" é fechado e
    // reaberto NA MESMA aba (recarregar a página não conta — os campos deste
    // módulo voltam a `undefined`), o plano nunca mais aparece, porque
    // continua sendo reposicionado/redesenhado todo quadro (sem erro
    // nenhum — daí não haver nenhuma exceção no console) DENTRO de uma cena
    // que já não existe mais/não é mais renderizada. O `<img>`/canvas 2D do
    // modo 'Frente' nunca teve este problema porque é recriado do zero a
    // cada `_renderFotoCamOverlay()` (elemento DOM novo, nunca reaproveitado
    // entre sessões) — só o plano 3D 'Trás' guardava estado entre sessões.
    // CORRIGIDO: reseta os 4 campos aqui, em `unmount()` (chamado sempre que
    // "Ver em 3D" fecha, ANTES do próximo `mount()` poder rodar) — na
    // próxima vez que `_ensureFotoCamBackdropPlane()` for chamado, o guard
    // `if (this._fotoCamBackdropMesh)` vê `null` de novo e recria tudo
    // (canvas/textura/material/mesh) do zero, adicionado à cena NOVA de
    // verdade.
    this._fotoCamBackdropMesh = null;
    this._fotoCamBackdropTexture = null;
    if (this._onMapConfigChange && typeof MapConfig !== 'undefined') MapConfig.offChange(this._onMapConfigChange);
    this._onMapConfigChange = null;
    // NOVO (08/09/2026): desfaz o popup "tela cheia" do Modelador, se
    // estava ativo, e libera o registro no WindowManager — senão o
    // container antigo (prestes a ser esquecido) ficaria com a classe CSS
    // presa e o WindowManager com uma entrada órfã.
    if (this._modeladorFullscreenActive && this._container) this._container.classList.remove('view3d-modelador-fullscreen');
    if (typeof WindowManager !== 'undefined') WindowManager.unregister('view3d-modelador-fullscreen');
    this._modeladorFullscreenActive = false;
    // [16/09/2026 UTC] Limpeza da "📏 Trena 3D" MOVIDA pro TOPO desta função
    // (ver comentário grande lá) — não duplicada aqui.
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
    let mapaVisivel = Mapping.filterByLayerVisibility(this._map);
    // [13/09/2026] NOVO — seletor "Andar" da topbar do "Ver em 3D" (ver
    // _syncPisoSeletor3D/#v3d-piso-wrap mais abaixo): filtra por andar
    // (Mapping.filterByPiso) DEPOIS do filtro de camada, mesma ordem/mesmo
    // espírito de "cópia que só a montagem da cena vê" — `this._map`
    // continua com o prédio inteiro. `this._pisoFiltro3D` é `null` ("Todos
    // os andares", padrão — sem custo nenhum extra) ou o índice do andar
    // escolhido; ver comentário grande em Mapping.filterByPiso sobre a
    // entidade sem andar definível (`null`) e o próprio objeto "Piso"
    // sempre ficarem, e sobre esta filtragem já ser, ela mesma, a
    // otimização de desempenho pedida (o engine3d.js nunca constrói pool
    // pros outros andares).
    mapaVisivel = Mapping.filterByPiso(mapaVisivel, this._pisoFiltro3D);
    // [14/09/2026 UTC] NOVO — sistema de grupos/classes (ver comentário
    // grande em Mapping.isEntityGroupHidden/filterByGrupos, mapping.js):
    // mesma ordem/mesmo espírito dos 2 filtros acima ("cópia que só a
    // montagem da cena vê" — this._map continua com tudo). Cobre tanto
    // "ocultar objetos com esta classe" quanto a opção fixa "ocultar
    // paredes e piso" — em ambos os casos lidas de `this._map`, não de
    // `mapaVisivel` (o estado de grupos é do MAPA, não muda por camada/
    // andar já terem sido filtrados).
    mapaVisivel = Mapping.filterByGrupos(mapaVisivel);
    const walls = Mapping.analyzeWalls(mapaVisivel, { cornerJoinDist });
    this._analyzedWalls = walls;
    // [13/09/2026] NOVO — pipeline `modeloArquivo` (ver comentário grande em
    // js/model3dloader.js): garante que TODO modelo `.glb`/`.gltf` já
    // importado esteja parseado em memória (`Model3DLoader.hasModel`)
    // ANTES de `Engine3D.setScene` — que é síncrono e decide, objeto a
    // objeto, se acha um modelo pronto ou cai no fallback procedural (ver
    // `_buildOneObjectMesh`/`_buildModeloArquivoMesh`, engine3d.js). Sem
    // este `await`, a 1ª renderização depois de abrir "Ver em 3D" sempre
    // cairia no fallback mesmo com o arquivo já importado (preload ainda
    // rodando em paralelo) — só a 2ª reconstrução da cena acertaria.
    await window.Model3DLoader?.preloadAll?.();
    // [15/09/2026 UTC] NOVO — MESMO motivo/MESMO espírito do `await` logo
    // acima, agora pra malha `.obj` estática (`assets/modelos/<tipo>.
    // malha.js`, ver js/objmeshsource.js e `ObjectAssets.registerModel`
    // campo `malhaEstatica`) — pedido verbatim: "A malha do objeto (o
    // '.obj' dele) deve ficar em um arquivo separado [...] mas deve
    // continuar funcionando com o protocolo 'file:///'." Usa `mapaVisivel`
    // (não `this._map`) de propósito — mesma fonte que `Engine3D.setScene`
    // vai efetivamente desenhar logo abaixo.
    await window.ObjectAssets?.ensureMeshesReadyForMap?.(mapaVisivel);
    this._engine.setScene({ ...mapaVisivel, walls });
    // [14/09/2026] NOVO — pedido verbatim: "Faça um jeito de integrar os
    // scripts de objeto com o que acabamos de fazer." Dispara
    // onModelSpawn/onInstanceSpawn (assets/modelos|instancias/) pra
    // câmera/objeto/foto do mapa — ver comentário grande em
    // js/objectassets.js `dispatchSpawn3D`/`dispatchSpawnAllForMap` (idem-
    // potente: só tem efeito na 1ª vez de cada objeto, mesmo chamado a
    // cada rebuild). Usa `this._map` (não `mapaVisivel`, a cópia filtrada
    // por camada só pra desenhar) — spawn roda pro objeto de VERDADE,
    // mesmo se a camada dele estiver oculta agora.
    window.ObjectAssets?.dispatchSpawnAllForMap(this._map, { view3d: this, DB: window.DB, Utils: window.Utils, map: this._map });
    // [14/09/2026] CORRIGIDO — pedido verbatim: "ao clicar em uma câmera e
    // selecionar 'Ver através desta câmera', no Modelador, ao entrar e sair
    // do Modelador, o cone da câmera selecionada acaba voltando a parecer e
    // fica na frente da tela." BUG CONFIRMADO: `Engine3D.setScene` (linha
    // acima) reconstrói `_cameraMeshesById`/`_fotoMeshesById` DO ZERO a
    // cada chamada (ver comentário grande no topo desses índices, em
    // engine3d.js) — toda malha nasce visível por padrão, sem nenhuma
    // memória de que `_enterCameraOrbView`/`_enterFotoCameraView` já tinha
    // escondido a malha da câmera/orb ATUAL (o "olho" de render fica bem
    // no ponto dela, então a malha dela mesma cobre a tela inteira "na
    // frente da câmera" — exatamente o sintoma relatado). `Modeler3D.exit()`
    // chama `view3d._rebuildScene?.()` (aqui) sempre que sai do Modelador
    // (skipRebuild não usado nesse caminho) — antes desta correção, sair do
    // Modelador enquanto ainda em `_orbCamMode`/`_fotoCamMode` sempre
    // perdia esse esconder. CORRIGIDO: reaplica o mesmo esconder, agora
    // DEPOIS do `setScene`, sempre que ainda estiver num desses 2 modos —
    // mesmo par de chamadas usado em `_enterCameraOrbView`/
    // `_enterFotoCameraView` (inclusive a foto VINCULADA de uma câmera
    // "Câmeras", `cam.fotoId` — mesma causa raiz do bug "duas fotos" já
    // corrigido antes, ver `_enterCameraOrbView`).
    if (this._orbCamMode) {
      const cam = (this._map.cameras || []).find((c) => c.id === this._orbCamMode.camId);
      this._engine?.setCameraMeshVisible?.(this._orbCamMode.camId, false);
      if (cam?.fotoId != null) this._engine?.setFotoMeshVisible?.(cam.fotoId, false);
    }
    if (this._fotoCamMode) {
      this._engine?.setFotoMeshVisible?.(this._fotoCamMode.fotoId, false);
    }
    // [14/09/2026] NOVO — pedido verbatim: "na seção 'Debug', se 'Ativar
    // modo Debug' e 'Enquadramento de câmera' estiverem marcados, então, o
    // aramado amarelo da câmera que produz o retângulo amarelo na
    // perspectiva dela deve começar a ser renderizado. Atualmente, não está
    // sendo renderizado." CAUSA RAIZ: o gizmo (retângulo amarelo + linhas
    // até os cantos, `Engine3D._fotoFrustumMeshesById`) sempre nasceu
    // ESCONDIDO por padrão em `setScene` (`m.visible =
    // this._frustumGizmosEnabled`, engine3d.js — esse flag interno nunca
    // muda mais, virou vestigial desde que o botão GLOBAL de enquadramento
    // foi trocado por um por-câmera, ver comentário grande no `mount()`
    // acima) — e só ficava visível DEPOIS de entrar em "Ver através desta
    // câmera" daquela câmera especificamente (`_renderFotoCamOverlay`, mais
    // abaixo), momento em que a pessoa está OLHANDO A PARTIR da própria
    // câmera (não dá pra ver o aramado da própria câmera de dentro dela).
    // Pra ver o "aramado"/retângulo amarelo de verdade (olhando PRA a
    // câmera, de fora, andando pela cena normalmente — o que o pedido
    // descreve), a opção de Debug precisa ligar TODOS os gizmos de uma vez,
    // não só o da câmera "ativa" no momento. CORRIGIDO: reaplica aqui,
    // GLOBALMENTE (todas as câmeras/fotos com frustum de uma vez, via
    // `setCameraFrustumsVisible` — o método plural, que também grava o
    // novo padrão em `_frustumGizmosEnabled` pra sobreviver a um próximo
    // `setScene`/troca de andar), toda vez que a cena é (re)montada — cobre
    // tanto a 1ª abertura do "Ver em 3D" quanto qualquer rebuild posterior
    // (edição de parede/objeto, troca de camadas, etc.). A reação AO VIVO a
    // mudanças de configuração feitas com o 3D já aberto (sem precisar
    // fechar/reabrir) é tratada à parte, no handler `_onMapConfigChange`
    // (ver `mount()`, mais acima).
    this._engine?.setCameraFrustumsVisible?.(this._isDebugEnquadramentoCameraAtivo());
    // [16/09/2026 UTC] NOVO — "📏 Trena 3D" (ver comentário grande em
    // `_trena3DClick` abaixo): as medidas já salvas (`map.medidas2d`)
    // precisam ser redesenhadas em THREE toda vez que a cena é reconstruída
    // (mesmo espírito de `setCameraFrustumsVisible` acima) — sem isto,
    // medidas feitas numa sessão anterior nunca apareceriam ao reabrir o
    // "Ver em 3D".
    this._trena3D._trena3DRebuildLines();
  },

  /** [13/09/2026] NOVO — aplica o CSS que decide COMO o buffer de pixels do
   *  canvas 3D (`#v3d-canvas`, resolução = `resCustom.w`×`resCustom.h`
   *  quando customizada, ver engine3d.js `_resize`) aparece dentro da caixa
   *  CSS normal da tela (o "Ver em 3D" continua ocupando o mesmo espaço de
   *  sempre no layout — só o CONTEÚDO desenhado dentro do canvas muda de
   *  resolução): `resCustom` `null`/sem `fit` ("Automática") limpa
   *  qualquer `object-fit` custom (`''`, volta ao comportamento nativo do
   *  navegador — irrelevante de qualquer forma quando a resolução já é a
   *  nativa do canvas); `'esticar'` também limpa (o navegador já estica o
   *  buffer pra preencher a caixa inteira por padrão, sem precisar de
   *  `object-fit` nenhum — `fill` é o valor padrão do CSS); `'caber'` seta
   *  `object-fit:contain` (preserva a proporção `w:h` configurada, sobra
   *  virando barra vazia nas bordas) + um fundo preto no PRÓPRIO canvas
   *  (`background-color`, pinta as barras — o canvas, como qualquer
   *  elemento substituído por `object-fit`, não desenha nada fora da área
   *  encaixada; sem um fundo explícito, a barra mostraria o que estiver
   *  atrás dele no DOM, que pode não ser preto). */
  _applyResolucaoCustom3D(canvas, resCustom) {
    if (!canvas) return;
    if (resCustom && resCustom.fit === 'caber') {
      canvas.style.objectFit = 'contain';
      canvas.style.backgroundColor = '#000';
    } else {
      canvas.style.objectFit = '';
      canvas.style.backgroundColor = '';
    }
  },

  /** Nome de exibição do andar de índice `i` — mesma convenção do mapa 2D
   *  (ver Map2DRenderer._nomeAndar em mapview.js): 0 = "Térreo", 1 = "1º
   *  andar", etc. */
  _nomeAndar3D(i) {
    return i === 0 ? 'Térreo' : `${i}º andar`;
  },

  /** [14/09/2026 UTC] NOVO — aplica no DOM o ícone/texto do botão
   *  "#v3d-modelar-toggle" conforme `this._modelarObjetosHabilitado` —
   *  mesmo espírito de `_syncNavModeUI` (mapview.js): mostra o nome do
   *  modo ATUAL (não o modo pro qual vai trocar ao clicar de novo).
   *  Desabilitado (padrão) = "🧭 Modo Navegação" (só olhar/andar, igual ao
   *  2D); habilitado = "🛠️ Modo Edição" (menu de objeto ganha "Modelar em
   *  3D"). */
  _syncModelarToggleUI3D(container) {
    const btn = (container || this._container)?.querySelector?.('#v3d-modelar-toggle');
    if (!btn) return;
    const ligado = !!this._modelarObjetosHabilitado;
    btn.textContent = ligado ? '🛠️ Modo Edição' : '🧭 Modo Navegação';
    // [14/09/2026 UTC] `.active` (estilo amarelado) vai no modo NAVEGAÇÃO
    // (`!ligado`), não no modo Edição — mesmo critério do botão irmão do
    // 2D (`_syncNavModeUI`: `.active` quando `this._navMode` é true, ou
    // seja, quando ESTÁ em Modo Navegação). Ver CSS '#v3d-modelar-toggle.
    // active' em style.css.
    btn.classList.toggle('active', !ligado);
  },

  /** [13/09/2026 UTC] NOVO — abre/fecha o painel '🏷️ Grupos' dentro do 'Ver
   *  em 3D' (botão '#v3d-grupos', ver comentário grande junto dele no
   *  template). Reaproveita 'this._map' (a MESMA instância editada no 2D —
   *  não é uma cópia), então marcar/desmarcar um grupo aqui também reflete
   *  de volta no 2D quando o usuário voltar pro mapa; a única diferença
   *  entre as duas telas é a UI de cada uma, o dado ('map.gruposOcultos'/
   *  'andaresOcultos'/'ocultarParedesEPiso', ver Mapping.js) é único. */
  _toggleGruposPanel3D(container) {
    if (this._gruposPanelEl3D) { this._closeGruposPanel3D(); return; }
    this._openGruposPanel3D(container);
  },

  _closeGruposPanel3D() {
    this._gruposPanelEl3D?.remove();
    this._gruposPanelEl3D = null;
    this._container?.querySelector?.('#v3d-grupos')?.classList.remove('active');
  },

  _openGruposPanel3D(container) {
    if (!this._map) return;
    const panel = document.createElement('div');
    panel.className = 'map-obj-picker-panel map-grupos-panel';
    panel.style.top = '58px';
    panel.style.right = '12px';
    panel.style.left = 'auto';
    (container || this._container).appendChild(panel);
    this._gruposPanelEl3D = panel;
    container.querySelector('#v3d-grupos')?.classList.add('active');
    this._renderGruposPanelBody3D(panel, container);
  },

  /** [14/09/2026 UTC] REESCRITO — mesmo motor de regras generalizado do
   *  painel 2D (ver comentário grande de `Mapping.getGrupoRegras` em
   *  mapping.js e `MapView._renderGruposPanelBody`, mapview.js). Escopo
   *  DELIBERADAMENTE menor aqui: lista as regras com nome + toggle
   *  👁️/🚫 (liga/desliga), mas EDITAR nome/seletor/efeito continua
   *  exclusivo do painel 2D — duplicar o editor completo (3 campos por
   *  regra, select de efeito, campo de opacidade condicional) nos dois
   *  lugares, sem navegador pra testar nenhum dos dois, era risco alto
   *  demais pra esta rodada; o toggle sozinho já resolve "acessível no 2D
   *  e 3D" pro caso de uso mais comum (ligar/desligar uma regra já
   *  criada). Sem toggle de ✨ destaque aqui (ver comentário grande junto
   *  do botão '#v3d-grupos' — destaque visual em 3D ficou fora do escopo
   *  desta rodada, mesma decisão de antes). */
  _renderGruposPanelBody3D(panel, container) {
    const map = this._map;
    const regras = Mapping.getGrupoRegras(map);
    const salvarERebuild = () => { DB.saveMap(map); this._rebuildScene(); };

    const linhasRegras = regras.length
      ? regras.map((r) => `
      <div class="map-grupos-row" data-id="${Utils.escapeHtml(r.id)}">
        <span class="map-grupos-label" title="${Utils.escapeHtml(r.selector)} — ${Utils.escapeHtml(r.efeito)}">${Utils.escapeHtml(r.nome)}</span>
        <button type="button" class="map-grupos-eye${r.ativo ? '' : ' off'}" data-acao="toggle-ativo" title="${r.ativo ? 'Desligar regra' : 'Ligar regra'}">${r.ativo ? '👁️' : '🚫'}</button>
      </div>`).join('')
      : '<div class="map-grupos-vazio">Nenhuma regra ainda — crie no painel "🏷️ Grupos" do Mapa 2D.</div>';

    panel.innerHTML = `
      <div class="map-panel-head"><b>🏷️ Grupos</b><button type="button" class="icon-btn sm map-panel-close" id="v3d-grupos-close" title="Fechar">✕</button></div>
      <div class="map-grupos-body">
        ${linhasRegras}
        <div class="map-grupos-vazio" style="opacity:.7">Editar nome/seletor/efeito: use o painel "🏷️ Grupos" do Mapa 2D.</div>
      </div>
    `;

    panel.querySelector('#v3d-grupos-close').onclick = () => this._closeGruposPanel3D();
    panel.querySelectorAll('[data-acao="toggle-ativo"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.map-grupos-row')?.dataset.id;
        if (!id) return;
        Mapping.toggleGrupoRegraAtivo(map, id);
        salvarERebuild();
        this._renderGruposPanelBody3D(panel, container);
      });
    });
  },

  /* [14/09/2026 UTC] REMOVIDO — '_syncPisoSeletor3D' (o botão/select
     "Andar" da topbar do "Ver em 3D"). Pedido verbatim: "Esse novo botão
     'Grupos' que você criou deve substituir o antigo botão 'Andar'.
     Remova do projeto o botão 'Andar'." A mesma função (ocultar andar(es))
     agora vive só no painel '🏷️ Grupos' (toggle por andar,
     `map.andaresOcultos`). `this._pisoFiltro3D` fica sempre `null`. */

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
    // [18/09/2026 UTC] RODADA 141 — pedido verbatim: "o vetor de apontamento
    // deve ser guardado [...] Remova o tempo que está ativado nisso, deixe o
    // 'guard' de event apenas." Substituído o par de mecanismos antigos
    // (`_pointerUnlockGraceUntil`, baseado em `performance.now()+300ms`, e
    // `_pointerAwaitingFirstMoveAfterLock`) por UMA flag só, `_pointerLockReentering`,
    // ligada nos PRÓPRIOS eventos (`keydown` do ESC, `onClick` ao reengajar,
    // `pointerlockchange` nas duas direções) e desligada só quando `onMouseMove`
    // consome (descarta) o `mousemove` sintético seguinte — sem nenhum timer.
    // O vetor de apontamento em si (`_pointerLockSavedYaw/Pitch`) é salvo no
    // ESC e restaurado no clique de reengajamento, ver onKeyDown/onClick abaixo.
    this._pointerLockReentering = false;
    this._pointerLockSavedYaw = null;
    this._pointerLockSavedPitch = null;
    // [18/09/2026 UTC] NOVO (RODADA 142) — ver comentário grande junto de
    // `_pointerLockExitBlocking` em `onKeyDown` (Escape)/`onMouseMove`/
    // `onPointerLockChange` — flag SEPARADA de `_pointerLockReentering`
    // acima: bloqueia TODO `mousemove` (não só 1) durante a janela de
    // transição de SAÍDA do Pointer Lock (do `keydown` do ESC até
    // `onPointerLockChange` confirmar), corrigindo o "salto" residual que o
    // usuário relatou acontecer NO MOMENTO DE PRESSIONAR O ESC.
    this._pointerLockExitBlocking = false;
    // [18/09/2026 UTC] NOVO (RODADA 150) — pedido verbatim do usuário
    // (comprovado pelo painel de debug da RODADA 147): mesmo com todas as
    // camadas acima, o "salto" de yaw/pitch ainda acontecia — o log
    // mostrou um `mousemove processado` (delta enorme, ex. dx=-177 dy=126)
    // ANTES de qualquer `keydown ESC` aparecer, seguido do
    // `pointerlockchange` de saída já com os valores errados. Causa raiz:
    // já documentada em `_trena3DCancelarMedidaEmAndamento` (16/09/2026) —
    // o navegador pode tratar o Escape que solta o Pointer Lock como um
    // gesto "reservado" pra si mesmo, SEM garantir que o `keydown`
    // correspondente chegue à página — nesse caso `_pointerLockExitBlocking`
    // nunca é ligada (o `onKeyDown` inteiro nunca roda) e o `mousemove`
    // sintético de recentralização do cursor passa direto, girando a
    // câmera do nada. Como não há como saber ANTES que isso vai acontecer
    // (sem o `keydown`, não sobra nenhum evento anterior pra reagir), a
    // correção é um mecanismo de FALLBACK que age DEPOIS: `_camLastMoveSnapshot`
    // guarda, a cada `mousemove` realmente aplicado (ver `onMouseMove`),
    // o yaw/pitch de ANTES daquele movimento + o instante exato — se
    // `onPointerLockChange` confirmar a saída do Pointer Lock sem
    // `_pointerLockExitBlocking` ter sido ligada (ou seja, sem o `keydown`
    // ter rodado) e o último `mousemove` aplicado foi há pouquíssimo tempo
    // (120ms, ver `onPointerLockChange`), o "salto" é desfeito ali mesmo,
    // devolvendo yaw/pitch pro valor de imediatamente antes dele. Ver uso
    // em `onMouseMove`/`onPointerLockChange` (`_bindDesktopControls`).
    this._camLastMoveSnapshot = null;
    // [18/09/2026 UTC] NOVO (RODADA 154) — trava incondicional de yaw/pitch,
    // ligada no início do `onKeyDown` do ESC e desligada no fim do mesmo
    // bloco (ver comentário grande lá) — consumida bem no topo de
    // `onMouseMove`, ANTES de qualquer leitura/escrita de `this._camera.yaw/
    // pitch`. Pedido verbatim do usuário. Inicializada `false` (nenhum ESC
    // em andamento ao montar).
    this._yawPitchFrozen = false;
    // [18/09/2026 UTC] NOVO (RODADA 147) — buffer do painel de debug de
    // câmera (`#v3d-debug-cam`, ver HTML/comentário grande acima e
    // `_v3dLog`/wiring em `_bindDesktopControls`). Resetado a cada `mount()`
    // (nova sessão de "Ver em 3D") — não sobrevive entre aberturas, de
    // propósito, pra cada sessão de debug começar do zero. `_v3dDebugT0` é a
    // referência de `performance.now()` usada pro timestamp "[123.4ms]" de
    // cada linha ficar relativo ao INÍCIO desta sessão do "Ver em 3D", não
    // desde o carregamento da página inteira (números bem menores/mais
    // legíveis de acompanhar ao vivo).
    this._v3dDebugBuf = [];
    this._v3dDebugT0 = performance.now();
    this._v3dDebugListEl = null;
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
    // [10/09/2026] RESTAURADO — todo o recurso "ver através desta câmera"/
    // vanishCam (este campo + _enterFotoCameraView/_exitFotoCameraView/
    // _computeFotoCamPose/_fotoCamFovFor/_renderFotoCamOverlay mais abaixo,
    // e o botão "👁️ Ver através desta câmera" em _showFotoPinCard3D) tinha
    // se perdido nesta cópia de trabalho — existia num backup do projeto
    // mais completo (ver comentário grande em js/mapview.js
    // _openFotoPinWheel). Pedido verbatim original (09/09/2026): "No 'Ver
    // em 3D', deve ser possível clicar na câmera do orb de câmera e 'entrar
    // nela' [...] assim como no blender é possível 'ver através da câmera'
    // [...]" — MESMO padrão arquitetural de `_camMode`/
    // `_computeWatchCameraPose` acima (câmeras de segurança fixas), só que
    // pra fotos vinculadas ao mapa (orbs de foto/câmera, ver mapview.js/
    // engine3d.js). Nunca ativo ao mesmo tempo que `_camMode` (um sempre
    // sai do outro antes de entrar — ver _enterFotoCameraView).
    this._fotoCamMode = null; // { fotoId } quando "vendo através" de um orb de foto/câmera
    // [10/09/2026] NOVO — pedido verbatim: "Com o shift+b deve ser possível
    // mover panoramicamente, quando se está no 'Ver através desta
    // câmera'." CORRIGIDO 2x na mesma rodada: (a) usuário esclareceu que o
    // gatilho era Shift + BOTÃO DO MEIO DO MOUSE, não a tecla "B"; (b)
    // usuário então rejeitou a técnica em si, com 2 capturas do Blender:
    // "O shift+ botão do meio do mouse não pode mudar a perspectiva. A
    // perspectiva deve ser preservada [...] É como pegar uma foto e só
    // movê-la para o lado, a foto não muda, mas a posição sim." Por isso
    // `x`/`y` aqui NÃO são mais um deslocamento de POSIÇÃO no mundo (isso
    // mudaria a perspectiva de verdade — paralaxe) — são frações
    // ADIMENSIONAIS (da largura/altura do quadro) de um deslocamento de
    // "lente"/janela de projeção (`Engine3D.setCamPanFrac`, ver
    // engine3d.js): a câmera/orb calibrada NUNCA muda de posição/pose/FOV
    // real, só a JANELA do frustum desloca dentro do quadro — exatamente
    // como arrastar uma foto por baixo de uma máscara fixa. Acumulado a
    // partir do movimento do mouse (ver onMouseMove) enquanto Shift +
    // botão do meio do mouse estiver segurado; `_resetCamZoom` zera isto
    // (e o offset de verdade em `camera3` via `setCamPanFrac(0,0)`) ao
    // entrar/sair de `_fotoCamMode`/`_orbCamMode`.
    this._camViewPanOffset = { x: 0, y: 0 };
    this._fotoCamSavedPose = null; // [12/09/2026] pose livre de `this._camera` no instante de `_enterFotoCameraView` — restaurada em _exitFotoCameraView se "Sair da câmera" estiver configurado como "voltar ao ponto de vista original" (ver _cameraExitViewMode)
    // [12/09/2026 — ITEM A] FOV do personagem capturado no instante de
    // `_enterFotoCameraView`/`_enterCameraOrbView` (ANTES de aplicar o FOV
    // calibrado da câmera/foto) — pedido verbatim: "o FOV [...] do
    // personagem deve voltar a ser o que era antes de clicar em 'Ver
    // através desta câmera' [...] deve ser preservado e não ficar o FOV da
    // câmera em que ele está vendo através", mesmo com "Permanece com o
    // ponto de vista da câmera" marcada. Diferente de `_fotoCamSavedPose`/
    // `_orbCamSavedPose` (só usados quando a opção é "voltar ao original"),
    // o FOV salvo aqui é restaurado SEMPRE em `_exitFotoCameraView`/
    // `_exitCameraOrbView`, independente da opção "Sair da câmera"
    // escolhida — só posição/orientação seguem a opção configurada, o FOV
    // nunca fica sendo o da câmera vista através.
    this._fotoCamSavedFov = null;
    this._orbCamSavedFov = null;
    // [10/09/2026] NOVO — redesenho do "Camera Match" pedido verbatim: "não
    // deve ser uma tela a parte [...] deve ser no próprio cenário 3D [...]
    // com um 'orb de câmera' deve dar para ver através dele. Com a câmera do
    // personagem fixa pela visão do 'orb de câmera' deve ser possível
    // continuar interagindo com o mapa do mesmo jeito que antes." Diferente
    // de `_camMode`/`_fotoCamMode` acima (que são modos de ESPECTADOR: só
    // sobrescrevem a pose RENDERIZADA — ver `renderCam` em `_loop` — enquanto
    // `this._camera`, usado por TODO o raycasting de seleção/posicionamento
    // de objetos, continua livre/andando sozinho por trás), este modo trava
    // `this._camera` DE VERDADE na pose calibrada da câmera — é por isso que
    // toda a interação (raycastFloor/raycastWall/seleção, todas em cima de
    // `this._camera`) continua funcionando sem duplicar nenhuma lógica: elas
    // já usam a câmera "de verdade", que agora É a do orb. Ver
    // _enterCameraOrbView/_exitCameraOrbView mais abaixo (perto de
    // _enterFotoCameraView, mesma vizinhança) e o re-trava-a-cada-quadro em
    // `_loop` (busca por "_orbCamLockedPose" lá).
    this._orbCamMode = null; // { camId } quando travado na visão de um objeto "Câmeras" (orb de câmera)
    this._orbCamLockedPose = null; // pose {x,y,z,yaw,pitch} travada — reaplicada todo quadro em _loop
    this._orbCamSavedPose = null; // pose livre de antes de entrar, restaurada ao sair
    // Setado pelo painel 2D da câmera (mapview.js _openCameraPanel, botão
    // "👁️ Ver em 3D através desta câmera") ANTES de navegar pra cá — ver uso
    // logo depois de `camAtiva`/`p2d` acima neste mesmo mount().
    if (this._pendingEnterCamOrbId === undefined) this._pendingEnterCamOrbId = null;
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
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Dá para estender a 'Trena'
    // (da grade do mapa 2D) e dar a possibilidade de ficar 3D nas duas
    // extremidades de cada medida." Mesma ferramenta "📏 Trena (de medir)"
    // do mapa 2D (mapview.js `_ptool==='medida'`), mas operando dentro do
    // 3D via mira central (mesmo padrão desta hotbar) — ver `_trena3DClick`/
    // comentário grande no topo de `trena3d.js` pra lógica completa
    // (2 cliques normais medem 2 pontos de superfície; Ctrl no 2º clique
    // estabelece uma referência vertical, e o clique seguinte sem Ctrl
    // finaliza "no ar" acima do 1º ponto). As medidas ficam salvas no MESMO
    // array `map.medidas2d` da Trena 2D (ganham `z1`/`z2` opcionais — 0 por
    // padrão, retrocompatível com toda medida 2D já existente).
    // [RODADA 139] SIMPLIFICADO — pedido verbatim: "Elimine a seção da
    // polilinha 3D e os seus recursos [...] Apenas o ícone deve ser
    // preservado [...] em vez de no início ter '📏 Trena 3D...' deve ter
    // '➰ Polilinha 3D...'". A "➰ Polilinha 3D" NÃO é mais uma ferramenta
    // separada (era a entrada `poli3d` que existia aqui até a RODADA 138) —
    // agora é só um MODO (`trena3DModo: 'trena'|'poli'`, ver mapconfig.js)
    // do MESMO slot `trena3d` abaixo. Ícone/rótulo deste slot são decididos
    // dinamicamente em `_renderHotbar()` conforme o modo atual.
    { tool: 'trena3d', icon: '📏', label: 'Trena 3D' },
  ],

  _renderHotbar() {
    const bar = this._container?.querySelector('#v3d-hotbar');
    if (!bar) return;
    // [11/09/2026] NOVO — pedido verbatim: "Os botões de controle do 'Ver
    // através desta câmera' acabaram ficando atrás dos botões de rodapé
    // ('Mirar', ...)." Em vez de arbitrar z-index entre a hotbar de
    // construção e a barra de controles do overlay de câmera (ver
    // css/style.css `.v3d-hotbar`/`.v3d-fotocam-overlay-controls`), a
    // hotbar simplesmente não faz sentido nenhum durante `_fotoCamMode`/
    // `_orbCamMode` (não dá pra trocar de ferramenta de construção
    // enquanto "vendo através" de uma câmera travada) — escondida aqui,
    // as duas barras nunca mais disputam a mesma área da tela. Chamada de
    // novo automaticamente ao entrar/sair desses modos (`_renderHotbar()`
    // já é chamada em `_enterCameraOrbView`/`_exitCameraOrbView`/
    // `_enterFotoCameraView`/`_exitFotoCameraView`).
    const escondida = !!(this._fotoCamMode || this._orbCamMode);
    bar.classList.toggle('hidden', escondida);
    if (escondida) { bar.innerHTML = ''; return; }
    const objEntry = this._objectCatalog[this._objectIndex];
    const itemEntry = this._unsortedItems[this._itemIndex];
    const camEntry = (this._map?.cameras || [])[this._cameraIndex];
    // [RODADA 139] o slot `trena3d` mostra ícone/rótulo conforme o modo
    // (`trena3DModo`, ver mapconfig.js) — "📏 Trena 3D" (padrão) ou
    // "➰ Polilinha 3D", sem duplicar entrada na hotbar.
    const trena3DModo = this._trena3D._trena3DModo();
    const trena3DPoli = trena3DModo === 'poli';
    bar.innerHTML = this._HOTBAR_SLOTS.map((slot) => {
      const active = this._buildTool === slot.tool;
      let sub = '';
      let icon = slot.icon, label = slot.label;
      if (slot.tool === 'trena3d' && trena3DPoli) { icon = '➰'; label = 'Polilinha 3D'; }
      if (slot.tool === 'objeto') sub = objEntry ? Utils.escapeHtml(objEntry.label) : (this._objectCatalog.length ? '' : '(nenhum)');
      if (slot.tool === 'item') sub = itemEntry ? Utils.escapeHtml(itemEntry.patrimonio || itemEntry.descricao || '—') : '(nenhum sem lugar)';
      if (slot.tool === 'camera') {
        const n = (this._map?.cameras || []).length;
        sub = camEntry ? `Câmera ${this._cameraIndex + 1}${this._camMode ? ' 🔴' : ''}` : (n ? '' : '(nenhuma no mapa)');
      }
      return `
        <button type="button" class="v3d-hotbar-slot ${active ? 'active' : ''}" data-tool="${slot.tool ?? ''}" title="${label}${sub ? ` — ${sub}` : ''}">
          <span class="v3d-hotbar-icon">${icon}</span>
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
    // [16/09/2026 UTC] NOVO — sair (ou trocar de) "📏 Trena 3D" cancela
    // qualquer medida a meio caminho (1º ponto já marcado, ou já em "modo
    // vertical" depois do Ctrl) — mesmo espírito do `_wallChainStart` acima.
    // [19/09/2026 UTC] RODADA 191 — consolidado em `Trena3D.cancelarMedidaPendente()`.
    this._trena3D.cancelarMedidaPendente();
    // [19/09/2026 UTC] RODADA 218 — pedido verbatim: "Tanto a janela 'Trena
    // 3D' quanto o botão no canto inferior direito para reativá-la devem
    // ficar ativos, apenas quando a opção 'Trena 3D' estiver marcada (botão
    // 'Trena 3D' no rodapé do 'Ver em 3D')." Reage IMEDIATAMENTE a cada troca
    // de ferramenta do rodapé (entrando OU saindo de "trena3d") — ver
    // `_trena3DEnsurePainelRapido` (js/trena3d.js) pra gate real via
    // `isToolActive`.
    this._trena3D._trena3DEnsurePainelRapido();
    this._renderHotbar();
    if (tool === 'objeto' || tool === 'item' || tool === 'camera') this._showRoulette(); else this._hideRoulette();
    // HUD "estilo jogo" da ferramenta "📍 Adicionar orb" — mostra/esconde e
    // recalcula os números ao entrar/sair da ferramenta (ver _refreshOrbHud).
    this._refreshOrbHud();
    const nomes = { parede: 'Parede — clique no chão pra marcar o 1º ponto, de novo pro 2º (e segue encadeando); botão do meio, Enter ou clicar em 🧱 de novo conclui', porta: 'Porta — mire numa parede pra encaixar, ou em outro lugar pra deixar solta no ar', janela: 'Janela — mire numa parede pra encaixar, ou em outro lugar pra deixar solta no ar', objeto: 'Objeto — role o mouse pra escolher o tipo, clique pra colocar', item: 'Item — role o mouse pra escolher o patrimônio sem lugar, clique pra colocar', camera: 'Câmeras — role o mouse pra escolher qual câmera fixa, clique pra "assistir" por ela (mova o mouse pra olhar em volta, limitado; role pra zoom); clique em 📷 de novo pra sair', 'orbfoto-novo': 'Orb de foto — clique no chão, escolha uma foto sem vínculo pra colocar ali; pode ir clicando pra colocar várias seguidas', remover: 'Remover — mire em item/câmera/objeto/parede/porta/janela e clique pra remover da cena', orb: 'Adicionar orb — mire num objeto e clique pra abrir a busca de patrimônio e associá-lo a ele', tijolo: 'Blocos de construção — clique pra colocar 1 tijolo em cima da superfície mirada; segure Ctrl + botão esquerdo pra ir colocando vários seguidos no mesmo nível', 'tijolo-pintar': '🎨 Pintar tijolos — mire num tijolo já colocado e clique pra aplicar a cor/textura atual do menu nele', trena3d: 'Trena 3D — clique em 2 pontos pra medir a distância; segure Ctrl no 2º clique pra medir "no ar" (estabelece uma referência vertical no 1º ponto — o clique seguinte, sem Ctrl, sobe/desce por ela)' };
    if (tool) Utils.toast(nomes[tool] || tool, { duration: 2600 });
  },

  // =====================================================================
  // "📏 Trena 3D" — [16/09/2026 UTC] NOVO, pedido verbatim: "Dá para
  // estender a 'Trena' (da grade do mapa 2D) e dar a possibilidade de
  // ficar 3D nas duas extremidades de cada medida. Quando for no 2D, a
  // trena se comporta restrita a duas dimensões. E, quando estiver no 3D,
  // ela funciona com 3 dimensões. A medida (texto) [...] fica sendo
  // impressa diretamente na tela (ficando 2D), mas como se estivesse no 3D
  // (por ponto de referência [...])." — o nome técnico dessa técnica é
  // "billboard"/rótulo ancorado por projeção mundo→tela (aqui via
  // `camera.project()`, um <span> HTML posicionado a cada quadro, ver
  // `_trena3DUpdateLabels`), MUITO mais barato que texto 3D de verdade
  // (sprite/`TextGeometry`) e sempre legível (nunca "de perfil").
  //
  // "Ao segurar o ctrl o clique seguinte não finaliza a medida, mas
  // estabelece uma referência perpendicular ao chão. Deste modo, é
  // possível elevar o apontamento da câmera que o clica seguinte (sem o
  // ctrl seguro, agora) vai ficar 'no ar'." — sem esse modo, um clique
  // normal SEMPRE bate numa superfície de verdade (`raycastSurface` —
  // chão/objeto/parede), nunca "no vazio". O modo vertical resolve isso:
  // trava X/Z no valor do 1º ponto e deixa só a ALTURA (Y) livre, lida
  // pelo ponto mais próximo entre a mira (um raio) e essa reta vertical
  // imaginária — ver `_trena3DClick` abaixo pra matemática exata.
  //
  // Dados: reaproveita o MESMO array `map.medidas2d` da Trena 2D
  // (mapview.js `_ptool==='medida'`) — cada medida ganha `z1`/`z2`
  // opcionais (altura em metros de cada ponta acima do referencial 0;
  // `undefined`/ausente == 0, retrocompatível com toda medida 2D já
  // salva, que nunca teve — nem vai passar a ter — esses campos). Uma
  // medida só é "3D de verdade" quando `z1`/`z2` != 0; o 2D (mapview.js)
  // não lê nem desenha esses campos, então nenhuma medida existente muda
  // de aparência lá.
  // =====================================================================

  /** Passo do snap de posição da Trena 3D (metros) — configurável em
   *  "⚙️ Configurações 3D" → seção "📏 Trena 3D" (ver mapconfig.js). */
  // [19/09/2026 UTC] RODADA 191 — pedido verbatim: "Torne o 'Trena 3D'
  // modular e instanciável [...] Retire do arquivo maior e coloque em um
  // arquivo separado [...] Torne-o reutilizável, instanciável, simples e
  // modular." Todo o motor da Trena 3D (antes ~4950 linhas de métodos
  // soltos aqui dentro) foi extraído pra `js/trena3d.js` (classe
  // `Trena3D`, de verdade instanciável — ver o cabeçalho do arquivo pra
  // como reutilizá-la em outro site). Esta instância única é criada em
  // `mount()` (`this._trena3D = new Trena3D({...})`) e reaproveitada
  // pela vida inteira da página (mesmo padrão de singleton que o resto
  // deste módulo `View3D` já usa) — `destroy()`/`mount()`/`onMapConfigChange()`
  // cobrem o ciclo de vida; `click()`, `beforeRender()`/`afterRender()`,
  // `cancelarMedidaEmAndamento()`, `pickAtRay()`/`removerMedida()` e
  // `renderConfigPanel()` são a API pública chamada pelo resto deste
  // arquivo (ver os pontos de chamada `this._trena3D.xxx(...)`).

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

  /** [10/09/2026] UNIFICADO — pedido verbatim: "unifique os 2 botões
   *  expansíveis da lateral direita. Fica só o '+' [...] deve ter duas
   *  abas: 'Objetos' e 'Tijolos' [...] Ao clicar em uma aba [...] todo o
   *  menu correspondente dela deve aparecer na bandeja do botão lateral
   *  direito." ANTES eram 2 funções quase idênticas (`_toggleObjectCatalogPanel`
   *  e `_toggleTijoloPanel`, uma pra cada botão/painel independente) — agora
   *  só esta, controlando o ÚNICO botão/painel que sobrou (#v3d-objcat-
   *  toggle/#v3d-objcat-panel). Abrir sempre mostra a aba lembrada da
   *  última vez nesta sessão (`this._v3dRightTab`, ver `_setV3dRightTab`
   *  logo abaixo — começa em 'objetos' por padrão). */
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
      this._setV3dRightTab(this._v3dRightTab || 'objetos');
    } else {
      toggle.classList.remove('open');
      toggle.textContent = '+';
      panel.classList.remove('open');
      setTimeout(() => panel.classList.add('hidden'), 220); // espera a transição (.2s, ver CSS) antes de sumir de vez
    }
  },

  /** [10/09/2026] NOVA — troca a aba ativa dentro do painel unificado da
   *  lateral direita ('objetos'/'tijolos'), mostrando só o conteúdo
   *  daquela aba na bandeja ("todo o menu correspondente dela deve
   *  aparecer na bandeja do botão lateral direito", pedido verbatim) e
   *  chamando a função de renderização certa (a mesma de sempre, cada uma
   *  já existia antes da unificação — só passaram a dividir a mesma
   *  bandeja em vez de 2 painéis flutuantes separados). Lembrada em
   *  `this._v3dRightTab` pra reabrir na mesma aba depois. */
  _setV3dRightTab(tab) {
    // [15/09/2026] CORRIGIDO -- pedido verbatim (Parte B): nova 3ª aba
    // "Propriedades" (ver HTML/comentário grande em mount()) -- MESMO
    // padrão das outras 2, só mais um valor possível pra
    // `this._v3dRightTab`/mais um par de classList.toggle.
    this._v3dRightTab = tab === 'tijolos' ? 'tijolos' : (tab === 'propriedades' ? 'propriedades' : 'objetos');
    const container = this._container;
    if (!container) return;
    container.querySelector('#v3d-objcat-tab-objetos')?.classList.toggle('active', this._v3dRightTab === 'objetos');
    container.querySelector('#v3d-objcat-tab-tijolos')?.classList.toggle('active', this._v3dRightTab === 'tijolos');
    container.querySelector('#v3d-objcat-tab-propriedades')?.classList.toggle('active', this._v3dRightTab === 'propriedades');
    container.querySelector('#v3d-objcat-tab-content-objetos')?.classList.toggle('hidden', this._v3dRightTab !== 'objetos');
    container.querySelector('#v3d-tijolo-panel')?.classList.toggle('hidden', this._v3dRightTab !== 'tijolos');
    container.querySelector('#v3d-objcat-tab-content-propriedades')?.classList.toggle('hidden', this._v3dRightTab !== 'propriedades');
    if (this._v3dRightTab === 'objetos') this._renderObjectCatalogPanel();
    else if (this._v3dRightTab === 'tijolos') this._renderTijoloPanel();
    else this._renderPropriedadesPanel();
  },

  /** [15/09/2026] NOVO -- pedido verbatim (Parte B, ver CHANGELOG do
   *  projeto pra citação completa): monta/atualiza o conteúdo das seções
   *  "Fundo" e "Câmera" da aba lateral direita "Propriedades" (a 3ª seção,
   *  "Transformação", é preenchida à parte por `ModelerUI.updateNPanel`,
   *  modeler-ui.js -- só faz sentido dentro de uma sessão do Modelador,
   *  nada a ver com "Ver através desta câmera").
   *  "Fundo" reaproveita a MESMA HTML/wiring que antes vivia no botão/
   *  painel flutuante "🖼️ Imagem" (`_fotoCamBackdropPanelHtml`/
   *  `_wireFotoCamBackdropPanel`, sem nenhuma mudança nelas -- só passam a
   *  ser montadas AQUI em vez de dentro do `wrap` de `_renderFotoCamOverlay`)
   *  + o botão "🌒 Escurecer imagem" (antes na barra debaixo). "Câmera"
   *  reaproveita os botões "🟨 Enquadramento"/"🌑 Escurecer o entorno"/
   *  "ℹ️ Informações do vanishCam" (idem, mesma lógica, só realocados) + o
   *  fieldset "⚙️ Propriedades" de verdade (`_wireLiveCamPropsPanel`,
   *  idem). Chamada (a) com `opts.rebuild:true` ao entrar em "Ver através
   *  desta câmera" (`_renderFotoCamOverlay`/`_renderCameraOrbOverlay`) --
   *  reconstrói do zero pra câmera/foto nova -- e (b) sem forçar
   *  reconstrução ao clicar na aba (`_setV3dRightTab`) ou ao sair
   *  (`_removeFotoCamOverlay`) -- nesse caso só é reconstruído se ainda não
   *  tinha sido (`dataset.built`) ou se saiu de "Ver através desta
   *  câmera" (mostra o aviso "Disponível dentro de..."). Fora deste modo,
   *  as 2 seções mostram esse aviso; `foto`/`temFrustum`/`hasImage` ficam
   *  cacheados em `this._fotoCamActiveFoto`/etc. pra funcionar mesmo
   *  quando chamada sem args (clique na aba). */
  _renderPropriedadesPanel(opts) {
    const container = this._container;
    if (!container) return;
    const fundoBody = container.querySelector('#v3d-proppanel-fundo-body');
    const cameraBody = container.querySelector('#v3d-proppanel-camera-body');
    if (!fundoBody || !cameraBody) return;
    const rebuild = !!opts?.rebuild;
    if (opts?.foto !== undefined) this._fotoCamActiveFoto = opts.foto;
    if (opts?.temFrustum !== undefined) this._fotoCamActiveTemFrustum = opts.temFrustum;
    if (opts?.hasImage !== undefined) this._fotoCamActiveHasImage = opts.hasImage;
    const foto = this._fotoCamActiveFoto;
    const emCameraView = !!(this._fotoCamMode || this._orbCamMode) && !!foto && !!this._fotoCamOverlayEl;
    if (!emCameraView) {
      fundoBody.innerHTML = '<div class="v3d-proppanel-empty">Disponível dentro de "Ver através desta câmera".</div>';
      cameraBody.innerHTML = '<div class="v3d-proppanel-empty">Disponível dentro de "Ver através desta câmera".</div>';
      delete fundoBody.dataset.built;
      delete cameraBody.dataset.built;
      return;
    }
    const wrap = this._fotoCamOverlayEl;
    const temFrustum = this._fotoCamActiveTemFrustum;
    const hasImage = this._fotoCamActiveHasImage !== false;
    if (rebuild || !fundoBody.dataset.built) {
      if (!hasImage) {
        fundoBody.innerHTML = '<div class="v3d-proppanel-empty">Sem imagem de referência associada a esta câmera.</div>';
      } else {
        fundoBody.innerHTML = this._fotoCamBackdropPanelHtml()
          + '<button type="button" class="btn secondary sm" id="v3d-proppanel-darkimg-toggle" title="Escurece a imagem de referência (facilita comparar com o cenário 3D por baixo)">🌒 Escurecer imagem</button>';
        const backdropPanel = fundoBody.querySelector('#v3d-fotocam-backdrop-panel');
        backdropPanel?.classList.remove('hidden');
        this._wireFotoCamBackdropPanel(backdropPanel);
        const range = fundoBody.querySelector('#v3d-fotocam-opacidade');
        if (range) {
          range.oninput = () => {
            const v = parseFloat(range.value);
            // [16/09/2026 — RODADA SEGUINTE] `#v3d-fotocam-overlay-img`
            // (antigo `<img>` DOM) virou `#v3d-fotocam-photo-canvas` — a
            // opacidade continua sendo aplicada via CSS (`style.opacity`
            // funciona em `<canvas>` igual a `<img>`), sem precisar
            // redesenhar o conteúdo (o `<canvas>` inteiro fica translúcido).
            // [12/09/2026 — RODADA "buffer de verdade"] CORRIGIDO —
            // `wrap.querySelector` trocado por `container.querySelector`:
            // `#v3d-fotocam-photo-canvas` deixou de ser descendente de
            // `wrap` (agora é irmão de `#v3d-canvas`, ver
            // `_renderFotoCamOverlay`), então `wrap.querySelector` não o
            // encontraria mais. Também REMOVIDO o espelhamento manual em
            // `this._fotoCamBackdropMesh.material.opacity` (comentário
            // antigo preservado abaixo) — o plano 3D do backdrop 'Trás'
            // deixou de ter qualquer material/textura visível (agora é só
            // um oclusor de profundidade, ver `_ensureFotoCamBackdropPlane`)
            // — a opacidade do slider já se aplica corretamente nos 2 modos
            // só com a linha abaixo, já que este MESMO `<canvas>` (nunca
            // mais escondido) é usado em 'Frente' E 'Trás' agora.
            // [13/09/2026] NOVO — ver comentário grande em
            // `_drawFotoCamPhoto` (causa raiz completa do "opacidade vira
            // preto" em 'Trás'): `style.opacity` do ELEMENTO agora é
            // decidido lá dentro (fonte única, sempre '1' em 'Trás' — só o
            // `ctx.globalAlpha` interno muda, sobre um fundo de céu — e
            // reflete o slider normalmente em 'Frente'); só precisa
            // acionar o redesenho aqui.
            this._setFotoCamOpacidade(v);
            this._updateFotoCamOverlayZoomScale();
          };
        }
        const darkimgBtn = fundoBody.querySelector('#v3d-proppanel-darkimg-toggle');
        const aplicarEscurecerImagem = (ativo) => {
          // [16/09/2026 — RODADA SEGUINTE] mesma troca de `#v3d-fotocam-overlay-img`
          // por `#v3d-fotocam-photo-canvas` — `filter` (CSS) também funciona
          // em `<canvas>` normalmente.
          // [12/09/2026 — RODADA "buffer de verdade"] CORRIGIDO — mesmo
          // motivo do handler de opacidade acima: `wrap.querySelector` →
          // `container.querySelector` (o canvas não é mais descendente de
          // `wrap`). Efeito colateral bem-vindo: "Escurecer imagem" agora
          // também funciona em 'Trás' (antes só valia pra 'Frente' — o
          // canvas ficava escondido em 'Trás', o filtro CSS nunca era
          // visto).
          const canvasEl2 = container.querySelector('#v3d-fotocam-photo-canvas');
          if (canvasEl2) canvasEl2.style.filter = ativo ? 'brightness(0.45)' : '';
          darkimgBtn?.classList.toggle('active', ativo);
        };
        aplicarEscurecerImagem(this._getEscurecerImagemAtivo());
        if (darkimgBtn) {
          darkimgBtn.onclick = () => {
            const novo = !this._getEscurecerImagemAtivo();
            this._setEscurecerImagemAtivo(novo);
            aplicarEscurecerImagem(novo);
          };
        }
      }
      fundoBody.dataset.built = '1';
    }
    if (rebuild || !cameraBody.dataset.built) {
      cameraBody.innerHTML = `
        <div class="v3d-proppanel-camera-buttons">
          ${temFrustum ? '<button type="button" class="btn secondary sm" id="v3d-proppanel-frustum-toggle" title="Mostrar/ocultar o enquadramento (retângulo amarelo) desta câmera">🟨 Enquadramento</button>' : ''}
          <button type="button" class="btn secondary sm" id="v3d-proppanel-vignette-toggle" title="Escurece tudo fora do retângulo amarelo (enquadramento)">🌑 Escurecer o entorno</button>
          <button type="button" class="btn secondary sm" id="v3d-proppanel-info-toggle" title="Mostrar/editar as informações do vanishCam desta câmera">ℹ️ Informações do vanishCam</button>
        </div>
        <!-- [11/09/2026] NOVO — pedido verbatim: "Lado abaixo deste botão
             [Escurecer o entorno], deve ter um botão triplo para definir o
             valor da opacidade do preto aplicado pelo botão 'Escurecer o
             entorno'. Por padrão é 0.5." Slot vazio — o "botão triplo" é
             montado via JS logo abaixo (ModelerUI._createNumField, o MESMO
             widget de 3 partes -/valor/+ já usado em Offset X/Y/Rotação,
             ver _wireFotoCamBackdropPanel), nunca dá pra desenhar só com
             HTML (tem listeners próprios de arraste/clique). -->
        <div class="v3d-proppanel-vignette-opacity-wrap" id="v3d-proppanel-vignette-opacity-wrap"></div>
        <div class="v3d-proppanel-camera-fields" id="v3d-proppanel-camera-fields"></div>
      `;
      const frustumBtn = cameraBody.querySelector('#v3d-proppanel-frustum-toggle');
      // [16/09/2026 — RODADA SEGUINTE] SUBSTITUÍDO — não existe mais
      // nenhuma cópia DOM/CSS do retângulo amarelo (`#v3d-fotocam-frame`
      // foi removido, ver css/style.css e `_renderFotoCamOverlay`) — o
      // retângulo é desenhado DIRETO no `#v3d-fotocam-photo-canvas` via
      // `ctx.strokeRect`, dentro de `_updateFotoCamOverlayZoomScale`, que
      // já lê `Engine3D.isCameraFrustumVisible` sozinha a cada chamada —
      // então só precisa chamá-la de novo pra redesenhar o canvas
      // refletindo o novo estado (mostrar/esconder o traço).
      if (frustumBtn && foto?.id != null) {
        const frustumAtivo0 = this._engine.isCameraFrustumVisible(foto.id);
        frustumBtn.classList.toggle('active', frustumAtivo0);
        frustumBtn.onclick = () => {
          const novo = !this._engine.isCameraFrustumVisible(foto.id);
          this._engine.setCameraFrustumVisible(foto.id, novo);
          frustumBtn.classList.toggle('active', novo);
          this._updateFotoCamOverlayZoomScale();
        };
      }
      const vignetteBtn = cameraBody.querySelector('#v3d-proppanel-vignette-toggle');
      const vignetteEl = wrap.querySelector('#v3d-fotocam-vignette');
      // [11/09/2026] NOVO — aplica o ALFA salvo (`_getEscurecerEntornoOpacidade`,
      // padrão 0.5) no `box-shadow` do vignette — ver comentário grande
      // no getter/setter (view3d.js) e em css/style.css `.v3d-fotocam-vignette`
      // (só o espalhamento `0 0 0 2000px` ficou fixo lá; a cor/alfa é
      // sempre reaplicada aqui, inline, sobrescrevendo o CSS).
      const aplicarVignetteOpacidade = (op) => {
        if (vignetteEl) vignetteEl.style.boxShadow = `0 0 0 2000px rgba(0, 0, 0, ${op})`;
      };
      const aplicarVignette = (ativo) => {
        vignetteEl?.classList.toggle('hidden', !ativo);
        vignetteBtn?.classList.toggle('active', ativo);
      };
      aplicarVignette(this._getEscurecerEntornoAtivo());
      aplicarVignetteOpacidade(this._getEscurecerEntornoOpacidade());
      if (vignetteBtn) {
        vignetteBtn.onclick = () => {
          const novo = !this._getEscurecerEntornoAtivo();
          this._setEscurecerEntornoAtivo(novo);
          aplicarVignette(novo);
        };
      }
      // [11/09/2026] NOVO — pedido verbatim: "Lado abaixo deste botão
      // [Escurecer o entorno], deve ter um botão triplo para definir o
      // valor da opacidade do preto aplicado [...]. Por padrão é 0.5."
      // Mesmo widget -/valor/+ de sempre (`ModelerUI._createNumField`),
      // faixa [0,1] (mesma do slider "Opacidade da foto", ver
      // `_fotoCamBackdropPanelHtml`), passo 0.05 — fino o bastante pra
      // ajustar sem precisar digitar.
      const vignetteOpWrap = cameraBody.querySelector('#v3d-proppanel-vignette-opacity-wrap');
      if (vignetteOpWrap && window.ModelerUI) {
        const vignetteOpApi = ModelerUI._createNumField({
          label: 'Opacidade do escurecimento: ', value: this._getEscurecerEntornoOpacidade(),
          step: 0.05, minDecimals: 2, suffix: '',
          onCommit: (v) => {
            const clamped = this._setEscurecerEntornoOpacidade(v);
            vignetteOpApi?.setValue(clamped);
            aplicarVignetteOpacidade(clamped);
          },
        });
        vignetteOpWrap.appendChild(vignetteOpApi.el);
      }
      const infoToggle = cameraBody.querySelector('#v3d-proppanel-info-toggle');
      if (infoToggle) {
        infoToggle.onclick = () => { wrap.querySelector('#v3d-fotocam-info-panel')?.classList.toggle('hidden'); };
      }
      this._wireLiveCamPropsPanel(cameraBody.querySelector('#v3d-proppanel-camera-fields'));
      cameraBody.dataset.built = '1';
    }
  },

  /** [15/09/2026] NOVO -- reseta a seção "Transformação" (aba lateral
   *  "Propriedades") pro aviso padrão -- chamada por `Modeler3D.exit()`
   *  (modeler-core.js), já que `ModelerUI.updateNPanel` só é chamado
   *  ENQUANTO uma sessão está ativa (nunca ao sair) -- sem isto, o último
   *  conteúdo editado ficaria "congelado" ali (clicável/desatualizado)
   *  depois de sair do Modelador. */
  _resetPropriedadesTransformacaoPlaceholder() {
    const body = this._container?.querySelector('#v3d-proppanel-transformacao-body');
    if (body) body.innerHTML = '<div class="v3d-proppanel-empty">Nenhuma edição em andamento (abra o Modelador).</div>';
  },

  /** Monta o conteúdo do painel "🧱 Blocos de construção" — dimensões,
   *  âncora de snap (gizmo de 5 pontos, pedido verbatim do bloco "grade de
   *  snap variável"), cor (6 faces de uma vez OU 1 de cada, pedido
   *  verbatim), textura, e o botão que ativa/desativa a ferramenta de
   *  colocar tijolo (`this._buildTool = 'tijolo'`, ver onClick/_selectBuildTool). */
  async _renderTijoloPanel() {
    const panel = this._container?.querySelector('#v3d-tijolo-panel');
    if (!panel) return;
    const cfg = await Tijolos.getConfig();
    this._tijoloGhostCfg = cfg; // NOVO (08/09/2026, 38a rodada) — ver _updateBuildGhost, ramo 'tijolo'
    const carimbos = await Tijolos.listStamps();
    const ativo = this._buildTool === 'tijolo';
    const ANCORAS = [
      { key: 'sup-esq', top: '0%', left: '0%' },
      { key: 'sup-dir', top: '0%', left: '100%' },
      { key: 'centro', top: '50%', left: '50%' },
      { key: 'inf-esq', top: '100%', left: '0%' },
      { key: 'inf-dir', top: '100%', left: '100%' },
    ];
    const pintando = this._buildTool === 'tijolo-pintar';
    const nUndo = (this._tijoloUndoStack || []).length;
    const nRedo = (this._tijoloRedoStack || []).length;
    panel.innerHTML = `
      <h5>🧱 Blocos de construção</h5>
      <button type="button" class="btn ${ativo ? '' : 'secondary'} sm block" id="tj-ativar" title="Clique esquerdo: 1 tijolo por clique, em cima da superfície mirada. Segurando Ctrl + clique: continua colocando (mesmo nível), enquanto a mira variar de alvo.">${ativo ? '✅ Ferramenta ativa' : '▶️ Ativar ferramenta'}</button>
      <button type="button" class="btn ${pintando ? '' : 'secondary'} sm block" id="tj-pintar" title="Mire num tijolo já colocado e clique pra aplicar a cor/textura atual do menu nele.">${pintando ? '✅ Pintura ativa' : '🎨 Pintar tijolos existentes'}</button>
      <div style="display:flex; gap:4px">
        <button type="button" class="btn secondary sm" id="tj-undo" ${nUndo ? '' : 'disabled'} style="flex:1" title="Desfaz a última colocação (1 clique ou 1 preenchimento de volume inteiros)">↩️ Desfazer${nUndo ? ` (${nUndo})` : ''}</button>
        <button type="button" class="btn secondary sm" id="tj-redo" ${nRedo ? '' : 'disabled'} style="flex:1" title="Refaz a última colocação desfeita">↪️ Refazer${nRedo ? ` (${nRedo})` : ''}</button>
      </div>
      ${pintando ? '' : `
      <h5>Dimensões (m)</h5>
      <div class="v3d-tijolo-dims">
        <input type="number" id="tj-sx" min="0.01" max="5" step="0.01" value="${cfg.sx}" title="Largura (X)">
        <input type="number" id="tj-sy" min="0.01" max="5" step="0.01" value="${cfg.sy}" title="Altura (Y)">
        <input type="number" id="tj-sz" min="0.01" max="5" step="0.01" value="${cfg.sz}" title="Profundidade (Z)">
      </div>
      <h5>Grade de encaixe (snap, m)</h5>
      <input type="number" id="tj-snap" min="0.01" max="5" step="0.01" value="${cfg.snapMeters}" title="Distância da grade de encaixe no mundo — igual à dimensão do tijolo garante um exatamente do lado do outro">
      <h5>Âncora do snap</h5>
      <div class="v3d-tijolo-anchor-gizmo" id="tj-anchor-gizmo">
        ${ANCORAS.map((a) => `<span class="v3d-tijolo-anchor-pt ${cfg.ancora === a.key ? 'active' : ''}" data-ancora="${a.key}" style="top:${a.top};left:${a.left}" title="${a.key}"></span>`).join('')}
      </div>
      <h5>Formato</h5>
      <select id="tj-formato" title="Cunha/rampa NÃO participa da fusão de faces com vizinhos (ver decisão de escopo em tijolos.js) — cada cunha é sempre um mesh próprio.">
        <option value="caixa" ${cfg.formato !== 'cunha' ? 'selected' : ''}>📦 Caixa (funde com vizinhos)</option>
        <option value="cunha" ${cfg.formato === 'cunha' ? 'selected' : ''}>◺ Cunha / rampa (não funde)</option>
      </select>
      ${cfg.formato === 'cunha' ? `
        <h5>Rotação da rampa</h5>
        <select id="tj-rotY">
          <option value="0" ${(cfg.rotY || 0) === 0 ? 'selected' : ''}>0°</option>
          <option value="90" ${cfg.rotY === 90 ? 'selected' : ''}>90°</option>
          <option value="180" ${cfg.rotY === 180 ? 'selected' : ''}>180°</option>
          <option value="270" ${cfg.rotY === 270 ? 'selected' : ''}>270°</option>
        </select>
        <div style="font-size:11px; color:var(--text-dim)">Dica: com a ferramenta ativa, clique do meio do mouse gira 90° a cada clique (reseta ao trocar pra "Caixa").</div>
      ` : ''}
      <h5>Espelho / simetria</h5>
      <label style="display:flex; align-items:center; gap:6px">
        <input type="checkbox" id="tj-espelho-ativo" ${cfg.espelhoAtivo ? 'checked' : ''}>
        <span>Colocar também uma cópia espelhada</span>
      </label>
      ${cfg.espelhoAtivo ? `
        <div style="display:flex; gap:4px">
          <select id="tj-espelho-eixo" style="flex:1">
            <option value="x" ${cfg.espelhoEixo === 'x' ? 'selected' : ''}>Plano X (espelha esquerda/direita)</option>
            <option value="z" ${cfg.espelhoEixo === 'z' ? 'selected' : ''}>Plano Z (espelha frente/trás)</option>
          </select>
          <input type="number" id="tj-espelho-pos" step="0.1" value="${cfg.espelhoPos || 0}" style="width:64px" title="Posição do plano de espelho, em metros">
        </div>
      ` : ''}
      `}
      <h5>Cor${pintando ? ' (aplicada ao clicar num tijolo já colocado)' : ''}</h5>
      <label style="display:flex; align-items:center; gap:6px">
        <input type="checkbox" id="tj-corporface" ${cfg.corPorFace ? 'checked' : ''}>
        <span>Uma cor por face (em vez de 1 cor pras 6)</span>
      </label>
      ${cfg.corPorFace ? `
        <div class="v3d-tijolo-facecolors">
          <label>+X <input type="color" id="tj-cor-px" value="${(cfg.corFaces && cfg.corFaces[0]) || cfg.corPadrao}"></label>
          <label>-X <input type="color" id="tj-cor-nx" value="${(cfg.corFaces && cfg.corFaces[1]) || cfg.corPadrao}"></label>
          <label>+Y <input type="color" id="tj-cor-py" value="${(cfg.corFaces && cfg.corFaces[2]) || cfg.corPadrao}"></label>
          <label>-Y <input type="color" id="tj-cor-ny" value="${(cfg.corFaces && cfg.corFaces[3]) || cfg.corPadrao}"></label>
          <label>+Z <input type="color" id="tj-cor-pz" value="${(cfg.corFaces && cfg.corFaces[4]) || cfg.corPadrao}"></label>
          <label>-Z <input type="color" id="tj-cor-nz" value="${(cfg.corFaces && cfg.corFaces[5]) || cfg.corPadrao}"></label>
        </div>
      ` : `<input type="color" id="tj-cor-unica" value="${cfg.corPadrao}">`}
      <h5>Textura</h5>
      <input type="file" id="tj-textura-input" accept="image/*" style="font-size:11px">
      ${cfg.texturaUrl ? '<button type="button" class="btn secondary sm" id="tj-textura-remover">✕ Remover textura</button>' : ''}
      ${pintando ? '' : `
      <h5>📦 Preencher volume</h5>
      <div class="v3d-tijolo-dims" title="Quantidade de tijolos em cada eixo, a partir do ponto mirado (mesma superfície usada pra colocar 1 tijolo)">
        <input type="number" id="tj-fill-x" min="1" max="50" step="1" value="${this._tijoloFillX || 1}" title="Quantidade em X (largura)">
        <input type="number" id="tj-fill-y" min="1" max="50" step="1" value="${this._tijoloFillY || 1}" title="Quantidade em Y (altura)">
        <input type="number" id="tj-fill-z" min="1" max="50" step="1" value="${this._tijoloFillZ || 1}" title="Quantidade em Z (profundidade)">
      </div>
      <button type="button" class="btn sm block" id="tj-fill-btn" title="Mire numa superfície e clique — preenche um bloco retangular de tijolos a partir dali">Preencher a partir da mira</button>
      <h5>📑 Carimbos (conjuntos reutilizáveis)</h5>
      <div style="display:flex; gap:4px">
        <input type="text" id="tj-carimbo-nome" placeholder="nome do carimbo" style="flex:1">
        <button type="button" class="btn secondary sm" id="tj-carimbo-salvar" title="Salva TODOS os tijolos do mapa atual como um carimbo reutilizável (posições relativas ao ponto mirado agora)">💾</button>
      </div>
      ${carimbos.length ? `
        <div style="display:flex; gap:4px; margin-top:4px">
          <select id="tj-carimbo-select" style="flex:1">${carimbos.map((c) => `<option value="${Utils.escapeHtml(c.nome)}">${Utils.escapeHtml(c.nome)} (${c.tijolos.length})</option>`).join('')}</select>
          <button type="button" class="btn sm" id="tj-carimbo-aplicar" title="Aplica o carimbo escolhido a partir do ponto mirado">📌</button>
          <button type="button" class="btn secondary sm" id="tj-carimbo-excluir" title="Exclui este carimbo">🗑️</button>
        </div>
      ` : '<div style="font-size:11.5px; color:var(--text-dim)">Nenhum carimbo salvo ainda</div>'}
      <h5>🧊 Aglomerado</h5>
      <button type="button" class="btn secondary sm block" id="tj-virar-objeto" title="Funde TODOS os tijolos 'Caixa' sem textura do mapa atual num unico objeto modelavel (abre no Modelador 3D) e excluivel -- as cunhas e tijolos com textura NAO entram (continuam soltos, ver decisao de escopo em tijolos.js)">🧊 Transformar aglomerado em objeto modelavel</button>
      <h5>⇅ Exportar / importar construção</h5>
      <button type="button" class="btn secondary sm block" id="tj-exportar" title="Baixa TODOS os tijolos do mapa atual como um arquivo .json (modelo reutilizável, dá pra levar pra outro mapa)">⬇️ Exportar tudo (.json)</button>
      <input type="file" id="tj-importar-input" accept="application/json" style="font-size:11px" title="Escolhe um .json exportado daqui e aplica a partir do ponto mirado">
      `}
    `;

    const salvar = async (patch) => { await Tijolos.setConfig(patch); };
    panel.querySelector('#tj-ativar').onclick = () => {
      this._selectBuildTool(this._buildTool === 'tijolo' ? null : 'tijolo');
      this._renderTijoloPanel();
    };
    panel.querySelector('#tj-pintar').onclick = () => {
      this._selectBuildTool(this._buildTool === 'tijolo-pintar' ? null : 'tijolo-pintar');
      this._renderTijoloPanel();
    };
    panel.querySelector('#tj-undo').onclick = () => this._tijoloUndo();
    panel.querySelector('#tj-redo').onclick = () => this._tijoloRedo();
    // CORRIGIDO (08/09/2026, 38a rodada): estas seções agora ficam
    // ESCONDIDAS enquanto `pintando` (ver template acima) — todo
    // `querySelector` correspondente devolve `null` nesse modo, então
    // TODOS os handlers abaixo precisam de encadeamento opcional (`?.`)
    // pra não quebrar (`Cannot read properties of null`).
    panel.querySelector('#tj-fill-x')?.addEventListener('change', (e) => { this._tijoloFillX = Utils.clamp(parseInt(e.target.value, 10) || 1, 1, 50); });
    panel.querySelector('#tj-fill-y')?.addEventListener('change', (e) => { this._tijoloFillY = Utils.clamp(parseInt(e.target.value, 10) || 1, 1, 50); });
    panel.querySelector('#tj-fill-z')?.addEventListener('change', (e) => { this._tijoloFillZ = Utils.clamp(parseInt(e.target.value, 10) || 1, 1, 50); });
    panel.querySelector('#tj-fill-btn')?.addEventListener('click', () => this._fillTijoloVolume());
    // NOVO (07/09/2026) — "novas ideias": formato/rotação/espelho.
    panel.querySelector('#tj-formato')?.addEventListener('change', async (e) => {
      // CORRIGIDO (08/09/2026, 38a rodada), pedido verbatim: "Ao
      // selecionar 'Cunha / rampa' e clicar com o botão do meio do mouse
      // a cunha deve girar 90 graus a cada clique. Resetando apenas
      // quando troca para 'Caixa'." — troca EXPLÍCITA pra 'caixa' reseta
      // `rotY` pra 0 (a rotação só faz sentido/é visível em 'cunha' — ver
      // Tijolos.buildWedgeGeometry); trocar PRA 'cunha' preserva o último
      // `rotY` salvo (não reseta ao entrar em cunha, só ao SAIR dela).
      const patch = { formato: e.target.value };
      if (e.target.value === 'caixa') patch.rotY = 0;
      await salvar(patch);
      this._renderTijoloPanel();
    });
    panel.querySelector('#tj-rotY')?.addEventListener('change', (e) => salvar({ rotY: parseInt(e.target.value, 10) || 0 }));
    panel.querySelector('#tj-espelho-ativo')?.addEventListener('change', async (e) => { await salvar({ espelhoAtivo: e.target.checked }); this._renderTijoloPanel(); });
    panel.querySelector('#tj-espelho-eixo')?.addEventListener('change', (e) => salvar({ espelhoEixo: e.target.value }));
    panel.querySelector('#tj-espelho-pos')?.addEventListener('change', (e) => salvar({ espelhoPos: parseFloat(e.target.value) || 0 }));
    // NOVO (07/09/2026) — "novas ideias": carimbos (salvar/aplicar/excluir).
    panel.querySelector('#tj-carimbo-salvar')?.addEventListener('click', () => this._salvarCarimboTijolos());
    panel.querySelector('#tj-carimbo-aplicar')?.addEventListener('click', () => this._aplicarCarimboTijolos());
    panel.querySelector('#tj-carimbo-excluir')?.addEventListener('click', () => this._excluirCarimboTijolos());
    // NOVO (07/09/2026) — "novas ideias": exportar/importar construção.
    panel.querySelector('#tj-virar-objeto')?.addEventListener('click', () => this._tijoloAglomeradoVirarObjeto());
    panel.querySelector('#tj-exportar')?.addEventListener('click', () => this._exportarConstrucaoTijolos());
    panel.querySelector('#tj-importar-input')?.addEventListener('change', (e) => this._importarConstrucaoTijolos(e.target.files?.[0]));
    panel.querySelector('#tj-sx')?.addEventListener('change', (e) => salvar({ sx: Utils.clamp(parseFloat(e.target.value) || 0.1, 0.01, 5) }));
    panel.querySelector('#tj-sy')?.addEventListener('change', (e) => salvar({ sy: Utils.clamp(parseFloat(e.target.value) || 0.1, 0.01, 5) }));
    panel.querySelector('#tj-sz')?.addEventListener('change', (e) => salvar({ sz: Utils.clamp(parseFloat(e.target.value) || 0.1, 0.01, 5) }));
    panel.querySelector('#tj-snap')?.addEventListener('change', (e) => salvar({ snapMeters: Utils.clamp(parseFloat(e.target.value) || 0.1, 0.01, 5) }));
    panel.querySelectorAll('.v3d-tijolo-anchor-pt').forEach((pt) => {
      pt.onclick = async () => { await salvar({ ancora: pt.dataset.ancora }); this._renderTijoloPanel(); };
    });
    panel.querySelector('#tj-corporface')?.addEventListener('change', async (e) => { await salvar({ corPorFace: e.target.checked }); this._renderTijoloPanel(); });
    if (cfg.corPorFace) {
      const ids = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
      ids.forEach((k, i) => {
        panel.querySelector(`#tj-cor-${k}`).oninput = async (e) => {
          const atual = (await Tijolos.getConfig()).corFaces || [cfg.corPadrao, cfg.corPadrao, cfg.corPadrao, cfg.corPadrao, cfg.corPadrao, cfg.corPadrao];
          const novo = [...atual]; novo[i] = e.target.value;
          await salvar({ corFaces: novo });
        };
      });
    } else {
      panel.querySelector('#tj-cor-unica').oninput = (e) => salvar({ corPadrao: e.target.value });
    }
    panel.querySelector('#tj-textura-input').onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => { await salvar({ texturaUrl: reader.result }); this._renderTijoloPanel(); };
      reader.readAsDataURL(file);
    };
    panel.querySelector('#tj-textura-remover')?.addEventListener('click', async () => { await salvar({ texturaUrl: null }); this._renderTijoloPanel(); });
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
          <button type="button" class="v3d-objcat-import-btn" id="v3d-objcat-importar" title="Abre a janela Importar objeto: conversor .obj e passo a passo para adicionar um objeto novo ao app">
            📥 Importar objeto
          </button>
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
    // [10/09/2026] DUPLICATA CORRIGIDA — bug relatado pelo usuário: "no
    // botão lateral direito, nos objetos, ainda estão coexistindo o 'Orb
    // de foto' e a 'Câmera'." Causa raiz: esta lista (aparentemente escrita
    // por outra sessão nesta mesma data) tinha 2 linhas fixas separadas —
    // uma chamando a ferramenta ANTIGA `'camera-novo'` (cria um registro no
    // array legado `map.cameras[]`, o sistema "Câmeras" que uma rodada
    // ANTERIOR desta mesma base já tinha unificado com o "Orb de foto" e
    // pedido explicitamente pra remover do projeto — "Depois das trocas
    // todas, então o 'Orb de foto' passa a se chamar 'Câmera' e o objeto
    // 'Câmeras' [...] deve ser removido do projeto"), e outra chamando a
    // ferramenta ATUAL `'orbfoto-novo'` (cria a entrada unificada de
    // verdade, em `map.fotos[]`, com nome/scripts/camProps — ver
    // `_openFotoPinPopover` em mapview.js). Ou seja: a unificação pedida
    // antes tinha sido desfeita sem querer, voltando a expor os 2 sistemas
    // lado a lado de novo. CORRIGIDO removendo a linha "Câmera"/
    // `'camera-novo'` (legada) e deixando só UMA linha — a de
    // `'orbfoto-novo'` — agora com ícone 📷 e rótulo "Câmera" (pedido
    // original: "Fica o ícone de 'Câmeras', mas fica a janela de
    // propriedades do 'Orb de foto'"). `_placeWithBuildTool`'s ramo
    // `'camera-novo'` (código morto/inalcançável desde então) foi
    // finalmente REMOVIDO em 15/09/2026 UTC — pedido verbatim: "Remova
    // todas as referências de duplicidade [...] Não considere
    // compatibilidade com código legado" — ver o antigo local do bloco
    // `if (tool === 'camera-novo')`, mais abaixo.
    html += `<div class="v3d-objcat-row v3d-objcat-camera-row ${this._buildTool === 'orbfoto-novo' ? 'active' : ''}" id="v3d-objcat-neworbfoto">
      <span class="v3d-objcat-ic">📷</span>
      <span class="v3d-objcat-label">Câmera</span>
    </div>`;
    list.innerHTML = html;
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
    // [10/09/2026] Linha "#v3d-objcat-newcam" (ferramenta legada
    // 'camera-novo') REMOVIDA — ver comentário grande acima, no HTML desta
    // lista.
    const newOrbFotoRow = list.querySelector('#v3d-objcat-neworbfoto');
    if (newOrbFotoRow) {
      newOrbFotoRow.onclick = () => {
        this._selectBuildTool('orbfoto-novo');
        this._renderObjectCatalogPanel();
        this._toggleObjectCatalogPanel();
      };
    }
    const btnImportar = list.querySelector('#v3d-objcat-importar');
    if (btnImportar) {
      btnImportar.onclick = () => window.ImportarObjetoCard?.open({
        onTestar: async (files) => {
          const n = await window.ObjImport?.importFiles?.(files);
          if (n > 0) Utils.toast?.(`${n} objeto(s) carregado(s) nesta sessão ✓`, { type: 'ok' });
          this._renderObjectCatalogPanel(); // reconstrói a lista já com o(s) novo(s) item(ns)
        },
      });
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
  // [12/09/2026] NOVO — pedido verbatim: "Em 'configurações 3D', na seção
  // 'Debug', coloque um botão para ativar o debug. Ativando o debug, todas
  // as suas opções entram em execução." Interruptor MESTRE da seção inteira
  // — só quando `debugModoAtivo` está explicitamente `true` (padrão é
  // `false`, ver mapconfig.js DEFAULTS) é que as opções individuais abaixo
  // (que continuam decidindo QUAIS guias visuais aparecem) chegam a
  // executar de verdade. Usado por `_isDebugTransferidorAtivo`/
  // `_isDebugProlongamentoAtivo`/`_isDebugEnquadramentoCameraAtivo` abaixo e
  // por `_drawOrbitTargetDot` (modeler-render.js).
  _isDebugAtivo() {
    return (this._paredeConfig || {}).debugModoAtivo === true;
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
   *  debugProlongamentoAtivo.
   *  [12/09/2026] Agora também exige `_isDebugAtivo()` (interruptor
   *  mestre) — ver comentário acima. */
  _isDebugTransferidorAtivo() {
    return this._isDebugAtivo() && (this._paredeConfig || {}).debugTransferidorAtivo !== false;
  },
  _isDebugProlongamentoAtivo() {
    return this._isDebugAtivo() && (this._paredeConfig || {}).debugProlongamentoAtivo !== false;
  },
  // [11/09/2026] NOVO — pedido verbatim: "Ao 'Sair da câmera', o
  // enquadramento ainda fica ativado. Nas 'configurações 3D', na seção
  // 'debug', coloque mais uma opção na lista de ativações deste modo que é
  // o 'Enquadramento de câmera'. Ativo, por padrão." Decide o estado INICIAL
  // do "retângulo amarelo" (Engine3D.setCameraFrustumVisible) toda vez que
  // se entra em "Ver através desta câmera" — ver `_renderFotoCamOverlay`,
  // mesmo padrão `!== false` dos outros 2 interruptores desta seção acima.
  // [12/09/2026] Agora também exige `_isDebugAtivo()` (interruptor mestre).
  // [17/09/2026 UTC] NOVO (RODADA 123) — ver mapconfig.js
  // DEFAULTS.debugTrena3DCoordenadasAtivo e `aplicarDebugCoords`
  // (`_trena3DUpdateLabels`, abaixo). Padrão DESLIGADO (`=== true`,
  // diferente dos outros interruptores desta seção) — diagnóstico de
  // nicho, não algo pra aparecer sem o usuário pedir explicitamente.
  _isDebugTrena3DCoordenadasAtivo() {
    return this._isDebugAtivo() && (this._paredeConfig || {}).debugTrena3DCoordenadasAtivo === true;
  },
  _isDebugEnquadramentoCameraAtivo() {
    return this._isDebugAtivo() && (this._paredeConfig || {}).debugEnquadramentoCameraAtivo !== false;
  },
  /** [18/09/2026 UTC] NOVO (RODADA 150) — pedido verbatim: "adicione um
   *  botão de ativação para ela [a janela de debug de câmera, RODADA 147]
   *  nas 'configurações 3D' [...] na seção 'debug'. Deste modo, ela só
   *  aparece se o debug estiver ativado." Mesmo padrão de
   *  `_isDebugTrena3DCoordenadasAtivo` acima (diagnóstico de nicho,
   *  DESLIGADO por padrão, `=== true`) — exige tanto o interruptor mestre
   *  `_isDebugAtivo()` quanto o checkbox dedicado `debugCameraPanelAtivo`
   *  (mapconfig.js DEFAULTS/seção "🐞 Debug"). */
  _isDebugCameraPanelAtivo() {
    return this._isDebugAtivo() && (this._paredeConfig || {}).debugCameraPanelAtivo === true;
  },
  /** [18/09/2026 UTC] NOVO (RODADA 150) — aplica ao vivo a visibilidade do
   *  painel inteiro `#v3d-debug-cam` (não só o corpo — ver botão "Ocultar/
   *  Mostrar" em `_bindDesktopControls`, que continua controlando só o
   *  corpo/histórico) conforme `_isDebugCameraPanelAtivo()`. Chamada na
   *  abertura (`_bindDesktopControls`) e sempre que a config mudar
   *  (`_onMapConfigChange`) — reage sem precisar fechar/reabrir "Ver em
   *  3D". `?.()` implícito via guard de elemento nulo: o painel só existe
   *  depois que `mount()` roda, igual ao resto do wiring deste bloco. */
  _v3dApplyDebugCamPanelVisibilidade() {
    const el = this._container?.querySelector('#v3d-debug-cam');
    if (!el) return;
    el.style.display = this._isDebugCameraPanelAtivo() ? 'flex' : 'none';
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

  async _placeWithBuildTool(ctrlHeld) {
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
        // [15/09/2026 UTC] REMOVIDO (mesa/coluna especiais) — pedido
        // verbatim: "Agora não tem mais o gizmo integrado, é só um objeto
        // comum tanto para o pilar quanto para a mesa." "Mesa"/"Pilar"
        // (novo, substitui "Coluna") agora são objetos comuns de catálogo
        // como qualquer outro — tamanho/forma vêm só de
        // `OBJECT3D_PROFILES`/`_buildMesaMesh`/`_buildPilarMesh`
        // (engine3d.js), nunca mais de campos hard-coded aqui.
        // Pedido do usuário: "Deve ser possível colocar um novo cubo no
        // cenário 3D pelo botão do rodapé, o botão objeto [...] não deve
        // abrir automaticamente o modo Modelador, deve continuar no modo
        // normal de navegação." — forma explícita de cubo de verdade (lados
        // iguais), pelo mesmo caminho normal de `Mapping.addObject` — sem
        // `customMesh`/Modelador nenhum envolvido aqui (só entra se o
        // usuário abrir esse objeto no Modelador depois, por vontade
        // própria).
        if (entry.key === 'cubo') Object.assign(extra, { forma: 'retangulo', largura: 0.4, profundidade: 0.4, altura: 0.4, cor: '#8a92a3' });
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
      // [15/09/2026 UTC] REMOVIDO (mesa/coluna especiais) — mesmo motivo
      // documentado acima (`_buildFreeRotateFinalAngle`/giro livre): "Mesa"
      // e "Pilar" (novo, substitui "Coluna") viraram objetos comuns —
      // tamanho/forma só de `OBJECT3D_PROFILES`/builders dedicados.
      if (entry.key === 'cubo') {
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

    // [15/09/2026 UTC] REMOVIDO — ramo `tool === 'camera-novo'` (criava uma
    // câmera nova via `Mapping.addCamera` a partir de um clique no chão,
    // ferramenta dedicada `'camera-novo'`). Pedido verbatim: "Há
    // resquícios no código para manter compatibilidade. Remova todas as
    // referências de duplicidade [...] Não considere compatibilidade com
    // código legado." CONFIRMADO 100% MORTO/inalcançável (grep em toda
    // `js/`): a ÚNICA linha de HTML que setava `this._buildTool =
    // 'camera-novo'` já tinha sido removida em 10/09/2026 (ver comentário
    // grande em `_renderObjectCatalogPanel`, "DUPLICATA CORRIGIDA" — a
    // linha "Câmera"/`'camera-novo'` foi trocada pela linha única
    // `'orbfoto-novo'`); nenhum outro ponto do projeto seta `_buildTool`
    // pra `'camera-novo'`. Câmeras de vigilância REAIS continuam podendo
    // ser criadas normalmente pela hotbar (ver ramo `tool === 'camera'`
    // acima, que ASSISTE uma câmera já existente, e os geradores
    // automáticos de sala/`js/geradores-salas.js`) — só este ponto de
    // entrada morto (clique único criando câmera nova a partir do "+") foi
    // removido, não o sistema de câmeras em si.

    // [10/09/2026→11/09/2026] "orb de foto" na lista do "+", MESMO padrão
    // de colocação contínua da Câmera logo acima.
    // [11/09/2026] REESCRITO — pedido verbatim do usuário: "A inserção de
    // objetos no 'Ver em 3D' deve ser como no mapa 2D [...] deve ser
    // possível adicioná-lo à cena, mesmo que ele não tenha foto vinculada.
    // Não deve aparecer uma janela para selecionar a foto. É só inserir
    // direto o elemento no cenário 3D." A versão anterior (comentário
    // removido, ver histórico) abria `window.MapView._pickPhotoFromList`
    // pra escolher uma foto JÁ existente sem vínculo — o que, além de
    // contrariar o pedido direto, também travava a "colocação contínua"
    // pedida no mesmo item (o modal interrompia o fluxo de cliques
    // seguidos). Agora: cada clique no chão cria um registro NOVO de
    // AmbientePhoto direto via `DB.addAmbientePhoto`, SEM `dataUrl`/
    // `thumbDataUrl` (campo já opcional no schema — ver db.js
    // `addAmbientePhoto`, `dataUrl: data.dataUrl || null` — um "orb de
    // foto sem foto ainda" já é um estado válido e suportado no banco,
    // só nunca tinha um caminho de criação direto por aqui) — mesmos
    // campos/mesmos valores-padrão que o fluxo 2D `_placePhotoPinAtWorld`
    // (mapview.js) usa pra uma foto NOVA: `tipo:'ambiente'`,
    // `mapaAltura` 1,6m (mesma altura-padrão da câmera), `mapaLayerId` da
    // camada ativa. O usuário pode depois abrir o cartão 3D do orb
    // (`_showFotoPinCard3D`, agora sempre acessível — ver correção
    // irmã em engine3d.js `setScene`, bloco "fotos vinculadas ao mapa")
    // e vincular uma foto de verdade a qualquer momento, como qualquer
    // outra propriedade. Ferramenta continua ativa entre cliques (mesmo
    // espírito contínuo de Câmera/Objeto/Item) — cada clique cria mais um
    // orb sem foto, no ponto clicado.
    if (tool === 'orbfoto-novo') {
      const hit = this._engine.raycastFloor(ray.origin, ray.dir);
      if (!hit) return;
      await DB.addAmbientePhoto({
        ambienteId: this._map.id,
        tipo: 'ambiente',
        mapaX: hit.x,
        mapaY: hit.z,
        mapaPiso: 0,
        mapaAuto: false,
        mapaAltura: 1.6,
        mapaLayerId: this._layerIdParaNovosItens(),
      });
      await this._buildFotosNoMapa(); // sincroniza this._map.fotos com o novo orb (não vem de _afterMapMutated)
      await this._afterMapMutated();
      Utils.toast('Orb de foto adicionado (sem foto vinculada ainda) ✓', { type: 'ok' });
      this._renderHotbar();
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

  // [13/09/2026] NOVO — pedido verbatim: "Deve haver uma pilha de 'Sair',
  // para não gerar inconsistências na estrutura do projeto. Por exemplo,
  // ao entrar no 'Ver em 3D', deve ser um nível da pilha, ao entrar no
  // modo 'Ver através desta câmera' [...] deve ser mais um nível na pilha.
  // Depois, estando no modo 'Ver através desta câmera', entra-se no
  // Modelador, então, deve ser mais um nível na pilha. [...] Se clicar em
  // 'Sair do 3D' (nível 1 da pilha), então, deve-se ser executado 3
  // saídas: 'Sair do Modelador', depois, 'Sair da câmera' e, depois,
  // 'Sair do 3D'. Implemente isto para todo o 'Ver em 3D'." Em vez de uma
  // estrutura de pilha literal (array de níveis), a "pilha" já existe
  // IMPLICITAMENTE no encadeamento normal do app — `Modeler3D.isActive()`
  // (nível mais interno possível) só pode estar `true` DENTRO de um dos
  // modos de câmera (`_camMode`/`_fotoCamMode`/`_orbCamMode`, ver
  // `Modeler3D.enter`, chamado só a partir daqui) ou direto do "Ver em 3D"
  // sem câmera nenhuma — então o helper abaixo, chamado no TOPO de CADA
  // função de saída de nível (`_exitCameraView`/`_exitFotoCameraView`/
  // `_exitCameraOrbView`, logo abaixo, e também em `unmount()`, "Sair do
  // 3D"), garante que o nível mais interno (Modelador) SEMPRE sai
  // primeiro, evitando a inconsistência relatada (posição do personagem
  // gravada ANTES da câmera "assentar" de volta na pose certa — ver
  // também o item da posição do personagem, mesma rodada). Chamar isto
  // sempre ANTES de zerar `_camMode`/`_fotoCamMode`/`_orbCamMode` de cada
  // função — sair do Modelador PRIMEIRO, com a câmera ainda travada no
  // modo de visualização, é o que garante a pose final correta (o
  // Modelador usa a pose travada como referência pra sua própria
  // transição de saída, ver comentário grande em `Modeler3D.exit`).
  _exitModeladorSeAtivo() {
    if (window.Modeler3D?.isActive?.()) window.Modeler3D.exit();
  },

  _exitCameraView() {
    this._exitModeladorSeAtivo(); // [13/09/2026] pilha de "Sair" — ver comentário grande acima
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
   *  só deslocam a partir dessa base, nunca saem do intervalo permitido.
   *
   *  [11/09/2026] CORRIGIDO — pedido verbatim, com repro exato: "crie um
   *  câmera, então o desenho 2D dela tem uma seta que aponta para norte.
   *  Depois, vou para o 'Ver em 3D' e a câmera (modelo 3D) e também o 'Ver
   *  através dessa câmera' estão apontando para o sul." O mapa 2D
   *  (`Map2DRenderer._drawCameraShape`, mapview.js) desenha o leque/seta
   *  usando `cam.angulo` puro, sem NENHUM offset — essa é a referência
   *  "verdadeira" (nunca foi trocada, é o que o usuário vê primeiro e
   *  espera que o 3D acompanhe). Este `yaw` (e o mesmo cálculo em
   *  `_enterCameraOrbView`/engine3d.js `setScene`, ver comentários lá)
   *  usava `angulo - π/2` — virou `angulo + π/2` (equivalente a somar +π/
   *  180° em cima do offset antigo): os 3 consumidores de `cam.angulo`
   *  (mapa 2D, malha 3D da câmera, pose de "assistir"/"ver através")
   *  precisam concordar entre si, e o mapa 2D é quem NÃO muda — os outros
   *  dois (aqui e a malha em engine3d.js) é que giram 180° pra bater com
   *  ele. */
  _computeWatchCameraPose() {
    const cfg = this._camMode;
    const cam = (this._map?.cameras || []).find((c) => c.id === cfg.camId);
    if (!cam) return this._camera;
    const ALTURA_CAMERA = 1.6; // mesmo valor de engine3d.js setScene
    const baseY = (cam.piso || 0) * (this._map?.alturaPiso || 2.8);
    const yaw = (cam.angulo || 0) + Math.PI / 2 + cfg.pan;
    return { x: cam.x, y: baseY + ALTURA_CAMERA, z: cam.y, yaw, pitch: cfg.tilt };
  },

  // [10/09/2026] Bloco "ver através desta câmera"/vanishCam RESTAURADO — ver
  // comentário grande em this._fotoCamMode (mount(), acima) sobre a origem
  // (backup do projeto mais completo) e o pedido verbatim do usuário.
  // NOVO (09/09/2026), pedido verbatim: "No 'Ver em 3D', deve ser possível
  // clicar na câmera do orb de câmera e 'entrar nela'. Uma opção como 'ver
  // através desta câmera' [...] assim como no blender é possível 'ver
  // através da câmera' [...] o cenário 3D continua sendo renderizado
  // normalmente, só que agora pela perspectiva da câmera do 'orb de câmera'
  // e a imagem que o 'orb de câmera' tem aparece transparente 'na frente'
  // [...] As informações do vanishCam devem aparecer ali por meio de um
  // botão de toggle [...] Deve dar para editar as informações do vanishCam
  // por ali. Deve ser possível controlar a opacidade da imagem [...] Por
  // padrão, a opacidade é 0.5. Ao ser alterado, o valor permanece [...]
  // mesmo recarregando a página." — chamado por `_showFotoPinCard3D`
  // (botão "👁️ Ver através desta câmera"). `foto` aqui é a entrada
  // achatada de `this._map.fotos` (ver mapview.js _refreshFotosNoMapa, que
  // agora também inclui `dataUrl`/`thumbDataUrl`/`vanishCam` — ver lá).
  _LS_KEY_FOTOCAM_OPACIDADE: 'catalogo_camview_opacidade_foto',

  /** [12/09/2026, FUNDIDA NESTA RODADA — ver nota grande em
   *  mapconfig.js DEFAULTS.cameraExitViewMode para o histórico completo]
   *  Lê a config "Configurações 3D" → seção única "Ver através desta
   *  câmera" (`MapConfig.DEFAULTS.cameraExitViewMode`) que decide o que
   *  acontece ao clicar "Sair da câmera", tanto num objeto "Câmeras" quanto
   *  num "orb de foto": `'lockedView'` (padrão) — o personagem PERMANECE
   *  com o ponto de vista da câmera que estava sendo vista (posição/
   *  orientação; o FOV é tratado à parte, sempre restaurado — ver ITEM A/
   *  `_orbCamSavedFov`/`_fotoCamSavedFov`); `'originalView'` — volta pro
   *  ponto de vista que o personagem tinha ANTES de "Ver através desta
   *  câmera". Usada DIRETO por `_exitCameraOrbView` E por
   *  `_exitFotoCameraView` (o wrapper `_fotoOrbExitViewMode()`, que só
   *  delegava pra esta função, foi removido em 15/09/2026 UTC — pedido
   *  verbatim: "Remova todas as referências de duplicidade [...] Não
   *  considere compatibilidade com código legado"). Leitura SÍNCRONA de
   *  `MapConfig._cache` (mesmo padrão já usado em
   *  outros pontos do app — o cache já está preenchido desde `mount()`, que
   *  faz `await MapConfig.get()` antes de qualquer uma destas telas poder
   *  ser aberta). */
  _cameraExitViewMode() {
    return (typeof MapConfig !== 'undefined' && MapConfig._cache && MapConfig._cache.cameraExitViewMode) || 'lockedView';
  },

  // [15/09/2026 UTC] REMOVIDO — pedido verbatim: "Há resquícios no código
  // para manter compatibilidade. Remova todas as referências de
  // duplicidade (exceto comentários [...]). Não considere compatibilidade
  // com código legado." `_fotoOrbExitViewMode()` existia só como um WRAPPER
  // de 1 linha (`return this._cameraExitViewMode();`) — desde a fusão de
  // 12/09/2026 (ver comentário grande de `_cameraExitViewMode` acima) as
  // duas chaves de config já tinham virado uma só (`cameraExitViewMode`);
  // esta função só sobrevivia "pra não precisar mexer" no único call site
  // (`_exitFotoCameraView`, ver mais abaixo), que agora chama
  // `_cameraExitViewMode()` direto.

  // [10/09/2026] REESCRITO — pedido verbatim: "ao dar zoom, não deve dar
  // uma mera ampliação da imagem. Deve sim preservar a perspectiva, mas
  // reconstruindo o desenho da cena (para que as coisas fiquem nítidas)."
  // A 1ª versão desta feature (rodada anterior, mesmo dia) escalava o
  // <canvas> inteiro por CSS (`transform:scale()`, um "efeito lupa" sobre
  // o quadro já desenhado) — o usuário corrigiu: isso amplia pixels sem
  // recalcular NADA, ficando borrado, e (bug relatado à parte) também
  // ampliava os BOTÕES de controle junto (estavam dentro do mesmo
  // elemento escalado). Reescrito pra usar zoom de VERDADE — muda o FOV
  // real da câmera Three.js (`Engine3D.setFov`, o MESMO mecanismo já usado
  // pelo `_camMode` legado) a cada "tick" da roda do mouse: o motor
  // RECALCULA a projeção e redesenha a cena inteira nesse FOV novo, sempre
  // nítida (nenhum pixel é esticado). Os botões de controle nunca foram
  // reafetados por isto (nunca estiveram dentro de nenhum elemento
  // escalado nem antes nem agora) — só a foto-guia semitransparente
  // (`.v3d-fotocam-overlay-img`), que é uma imagem PLANA sobreposta à
  // tela (não reprojetada em 3D), precisa de uma compensação PRÓPRIA (ver
  // `_updateFotoCamOverlayZoomScale` logo abaixo) pra continuar alinhada
  // com a cena por trás dela conforme o FOV muda.
  //
  // Faixa de zoom (pedido verbatim: "O zoom in deve ser maior. O zoom out
  // deve estender para além do enquadramento da câmera [...] Deve ser
  // possível afastar mais ainda, além do normal"): limites BEM mais
  // abertos que o FOV calibrado de qualquer câmera individual — zoom in
  // pode chegar bem apertado (5°) e zoom out pode ir bem além de qualquer
  // enquadramento normal, nos dois sentidos a partir do FOV calibrado da
  // câmera/orb (não de 0).
  // [11/09/2026] AJUSTADO — pedido verbatim: "Diminua um pouco o limite de
  // zoom out." Era 140° (bem perto do limite físico de FOV que o Three.js
  // ainda desenha de forma utilizável, quase um "olho de peixe" extremo) —
  // reduzido pra 110°, ainda bem além de qualquer enquadramento calibrado
  // normal, mas sem chegar na distorção mais extrema de antes.
  _CAMVIEW_ZOOM_FOV_MIN: 5,
  _CAMVIEW_ZOOM_FOV_MAX: 110,

  /** Config ativa de zoom (`{calibFov, zoomFov}`) — `_fotoCamMode`/
   *  `_orbCamMode` ganham esses 2 campos ao entrar (ver
   *  `_enterFotoCameraView`/`_enterCameraOrbView`); nunca os dois ativos
   *  ao mesmo tempo, então basta devolver o que existir. */
  _activeCamZoomCfg() {
    return this._fotoCamMode || this._orbCamMode || null;
  },

  /** [13/09/2026 — ITEM D] Proporção (largura/altura) do enquadramento
   *  calibrado da câmera ativa (`_fotoCamMode`/`_orbCamMode`) — 16/9 se não
   *  houver `camProps`/`Resolução` salva ainda. `_fotoCamMode` só guarda
   *  `fotoId` (ver `_enterFotoCameraView`), então precisa buscar o registro
   *  em `this._map.fotos`; `_orbCamMode` só guarda `camId`
   *  (`_enterCameraOrbView`), busca em `this._map.cameras` — os campos
   *  ficam SOLTOS no próprio objeto câmera (não aninhados em `camProps`,
   *  diferente do orb de foto — ver `Mapping.addCamera`).
   *  [11/09/2026] REESCRITO — pedido verbatim: "apague todas as
   *  propriedades [da câmera]. Deixe apenas FOV. [...] uma seção de
   *  'Resolução' [...] Estes [...] valores influenciam no tamanho do
   *  retângulo amarelo." O fieldset "Propriedades da câmera" (Blender —
   *  distância focal/sensor mm, ver `_camPropsFieldsetHtml`/
   *  `_wireCamPropsFieldset` em mapview.js) SUMIU — a proporção do
   *  enquadramento agora vem direto de `camProps.resolutionX/resolutionY`
   *  (pixels da "Resolução", já que "ao carregar uma foto, a câmera deve
   *  assumir a resolução da foto" — ver o mesmo `_wireCamPropsFieldset`,
   *  que também sincroniza isso). MESMA correção espelhada em
   *  `_activeCamPropsVFovRad` (abaixo) e no retângulo amarelo de verdade em
   *  engine3d.js (`_fotoFrustumMeshesById` — busque por "resolutionX" lá
   *  pra conferir que bate 100%, mesma exigência de sempre). */
  // [18/09/2026] REVERTIDO — pedido verbatim: "Fiz um teste [...] a
  // imagem 1280x720 [...] Em Propriedades->Câmera, coloquei a resolução da
  // câmera para 500x500. Ao clicar no botão 'Esticar' (tanto com 'Trás'
  // quanto com 'Frente' marcado), a imagem acaba não cobrindo todo o
  // retângulo amarelo. Não deveria ser assim." CAUSA RAIZ: a correção de
  // 15/09/2026 (comentário abaixo, preservado) congelou `resX`/`resY`
  // (`calibResX/calibResY`, capturados só uma vez ao ENTRAR neste modo) —
  // só a malha 3D do retângulo amarelo (`Engine3D.updateCameraFrustumGeometry`)
  // continuava reagindo AO VIVO à Resolução editada em "Propriedades" →
  // "Câmera", enquanto esta função (usada por `_activeCamFrameRectPx`,
  // que dimensiona tanto a vinheta quanto o novo
  // `#v3d-fotocam-photo-canvas`, ver v446) continuava devolvendo a
  // proporção CONGELADA — os dois (retângulo amarelo real x
  // caixa/canvas da foto) divergiam depois de qualquer edição de
  // Resolução feita DENTRO da sessão de "Ver através desta câmera", e
  // "Esticar" (que preenche exatamente a caixa/canvas, por definição)
  // passava a não cobrir o retângulo amarelo DE VERDADE, que já tinha
  // outra forma/tamanho. RELENDO o pedido original de 15/09/2026 com mais
  // cuidado: "ao alterá-los, O ENQUADRAMENTO É QUE MUDA [...] a foto não
  // deve ser mexida" — ou seja, o pedido de fato queria o ENQUADRAMENTO
  // (a caixa/retângulo) reagindo ao vivo (exatamente como a malha 3D já
  // fazia) — "a foto não deve ser mexida" se referia aos VALORES salvos
  // de offset/rotação/fit da foto (que continuam intocados, nunca são
  // resetados por esta mudança), não ao TAMANHO da caixa contra a qual
  // Esticar/Caber/Cortar são calculados a cada redesenho (que sempre
  // deveria mesmo mudar, já que os 3 fits são "em relação ao retângulo
  // amarelo", pedido de rodadas ainda mais antigas). A correção de
  // 15/09/2026 resolveu o sintoma errado (congelando a caixa inteira em
  // vez de só preservar os valores salvos da foto) — CORRIGIDO agora:
  // volta a ler `resolutionX/resolutionY` AO VIVO do `camProps`/`cam`
  // (mesmo objeto editado em `_activeCamPropsEditTarget`), igual à malha
  // 3D — os 2 (retângulo amarelo real e a caixa/canvas da foto) voltam a
  // bater SEMPRE, em qualquer resolução, editada a qualquer momento.
  _activeCamFrameAspect() {
    let resX = 1920, resY = 1080;
    if (this._fotoCamMode) {
      const foto = (this._map?.fotos || []).find((f) => f.id === this._fotoCamMode.fotoId);
      resX = foto?.camProps?.resolutionX ?? resX;
      resY = foto?.camProps?.resolutionY ?? resY;
    } else if (this._orbCamMode) {
      const cam = (this._map?.cameras || []).find((c) => c.id === this._orbCamMode.camId);
      resX = cam?.resolutionX ?? resX;
      resY = cam?.resolutionY ?? resY;
    }
    return resX / Math.max(1, resY);
  },

  /** [14/09/2026 — NOVO] FOV VERTICAL calibrado (radianos), derivado de
   *  `camProps.focalLengthMm/sensorWidthMm/sensorHeightMm` — EXATAMENTE a
   *  mesma fórmula (mesma ordem de contas: FOV horizontal a partir do
   *  sensor/focal, depois FOV vertical a partir do horizontal + proporção)
   *  já usada por `js/engine3d.js` pra construir o "retângulo amarelo"
   *  (`_fotoFrustumMeshesById`, ver bloco `matAmarelo`/`linhaRet` — busque
   *  por "hFovRad = 2 * Math.atan" lá pra conferir que bate 100%). Extraída
   *  pra cá como função COMPARTILHADA porque essa duplicação (a mesma conta
   *  escrita 2 vezes, uma em cada arquivo) era exatamente a causa raiz do
   *  bug "foto muito maior que o retângulo amarelo": nada em view3d.js
   *  calculava este FOV antes desta correção — `_activeCamFrameRectPx`
   *  (modo 'front') só "encaixava por proporção" no canvas (ignorando FOV
   *  de vez), e `_updateFotoCamBackdropPlane` (modo 'back') usava
   *  `cam3.fov` (o FOV do RENDER, `zcfg.zoomFov` — um valor totalmente
   *  diferente, vindo de `_fotoCamFovFor`/vanishCam ou do padrão fixo 60°)
   *  em vez do FOV calibrado do `camProps` que o retângulo amarelo
   *  realmente usa. Câmera "Câmeras" sem `camProps.focalLengthMm` salvo
   *  ainda cai nos mesmos padrões de fábrica do fieldset "Propriedades da
   *  câmera" (50mm, sensor 36x24mm) — igual ao engine3d.js. */
  /** [11/09/2026] REESCRITO — ver comentário grande em `_activeCamFrameAspect`
   *  (pedido verbatim: "apague todas as propriedades. Deixe apenas FOV.").
   *  Antes derivava o FOV vertical de `focalLengthMm`/`sensorWidthMm`/
   *  `sensorHeightMm` (estilo Blender) — esses campos SUMIRAM do fieldset;
   *  `camProps.fov` (radianos) agora é a ÚNICA fonte, editada DIRETO pelo
   *  usuário (sem conversão foco<->FOV nenhuma) — já é o valor VERTICAL
   *  (mesma convenção de sempre, direto pra `Engine3D.setFov`/
   *  `THREE.PerspectiveCamera.fov`), então esta função só devolve
   *  `camProps.fov` com um padrão de fábrica (60°) se ainda não tiver sido
   *  calibrado. */
  // [18/09/2026] REVERTIDO — ver comentário grande em `_activeCamFrameAspect`
  // (mesmo pedido/causa raiz: "Esticar [...] não cobrindo todo o
  // retângulo amarelo" depois de editar a Resolução). `resX`/`resY`
  // voltam a ler `camProps.resolutionX/Y` AO VIVO (não mais
  // `calibResX/calibResY` congelados) — igual ao `cp?.fov`, que já lia ao
  // vivo. Mantém `Cam3DMath.camPropsVFovRad` (comentário abaixo,
  // preservado) — mesma função usada pelo retângulo amarelo de verdade em
  // engine3d.js `setScene`, garantindo que os dois batam sempre, agora em
  // QUALQUER momento (não só na entrada deste modo).
  _activeCamPropsVFovRad() {
    let cp = null;
    let resX = 1920, resY = 1080;
    if (this._fotoCamMode) {
      const foto = (this._map?.fotos || []).find((f) => f.id === this._fotoCamMode.fotoId);
      cp = foto?.camProps || null;
      resX = cp?.resolutionX ?? resX;
      resY = cp?.resolutionY ?? resY;
    } else if (this._orbCamMode) {
      const cam = (this._map?.cameras || []).find((c) => c.id === this._orbCamMode.camId) || null;
      cp = cam;
      resX = cam?.resolutionX ?? resX;
      resY = cam?.resolutionY ?? resY;
    }
    // [11/09/2026] CORRIGIDO — pedido verbatim: "O enquadramento deve ter
    // medidas limite que são a forma do quadrado (assim como no Blender)
    // [...]" — `camProps.fov` deixou de ser devolvido direto como o FOV
    // VERTICAL (que ignorava se a resolução é paisagem ou retrato); agora
    // passa por `Cam3DMath.camPropsVFovRad` (engine3d.js, comentário
    // grande lá com a explicação completa da convenção "Sensor Fit: Auto"
    // do Blender) — MESMA função usada pelo retângulo amarelo de verdade
    // em engine3d.js `setScene`, garantindo que os dois batam sempre.
    return window.Cam3DMath.camPropsVFovRad(cp?.fov, resX, resY);
  },

  /** [13/09/2026 — ITEM D] pedido verbatim: "Os botões 'Esticar', 'Caber' e
   *  'Cortar' são em relação ao retângulo amarelo que representa os
   *  limites da câmera selecionada. Você está colocando como se a
   *  referência fosse o tamanho do canvas do 'Ver em 3D'." BUG CONFIRMADO
   *  — antes desta correção, `.v3d-fotocam-overlay-img` usava `inset:0;
   *  width:100%; height:100%` (CSS, ver style.css) — literalmente o
   *  CANVAS/viewport inteiro — e o plano 3D do modo 'back'
   *  (`_updateFotoCamBackdropPlane`) usava `cam3.aspect` (idem, a
   *  proporção do VIEWPORT) em vez da proporção do SENSOR da câmera
   *  calibrada (`_activeCamFrameAspect` acima). Esta função devolve o
   *  retângulo em pixels de TELA (`left/top/width/height`, relativo ao
   *  `<canvas>`/overlay) que o "retângulo amarelo" ocupa — MESMO
   *  letterbox/pillarbox de um `object-fit:contain` encaixando um box de
   *  proporção `_activeCamFrameAspect()` dentro do canvas: como a câmera
   *  de render usa FOV VERTICAL (convenção padrão do
   *  `THREE.PerspectiveCamera`, ver `Engine3D.setFov`) e `camera3.aspect`
   *  sempre = proporção do viewport (nunca a do sensor), o enquadramento
   *  calibrado (ângulo vertical = FOV calibrado, ângulo horizontal
   *  derivado da proporção do SENSOR, não do viewport) projeta como
   *  EXATAMENTE esse retângulo "contido" — sem precisar projetar os 4
   *  cantos 3D de verdade (`_fotoFrustumMeshesById`, engine3d.js) pra
   *  chegar no mesmo resultado, já que a vertical dos dois (frame
   *  calibrado x viewport) sempre bate quando `zoomFov === calibFov`
   *  (a compensação de zoom, `escalaZoom` em `_updateFotoCamOverlayZoomScale`,
   *  é aplicada por CIMA deste retângulo via `transform:scale`, não
   *  precisa entrar nesta conta). */
  /** [14/09/2026] CORRIGIDO — causa raiz do bug "foto muito maior que o
   *  retângulo amarelo" (modo 'Trás' a 100% de opacidade "vazava" pra cor
   *  do céu): esta função "encaixava" o quadro por PROPORÇÃO dentro do
   *  canvas inteiro (`if (frameAspect > containerAspect) {w=cw;...}` —
   *  sempre tocando uma borda do canvas), IGNORANDO o FOV de verdade —
   *  bateria com o retângulo amarelo só por coincidência (só se o FOV do
   *  render, `zcfg.calibFov`/`_fotoCamFovFor`, por acaso fosse igual ao FOV
   *  calibrado do `camProps`/Blender, `_activeCamPropsVFovRad()` — 2
   *  valores de fontes TOTALMENTE diferentes, ver comentário grande dessa
   *  função acima). CORRIGIDO: agora calcula a fração real da ALTURA do
   *  canvas que o retângulo amarelo ocupa, pela mesma ótica de câmera usada
   *  em todo o resto do arquivo (`tan(fov/2)`), comparando o FOV vertical
   *  CALIBRADO do `camProps` (`_activeCamPropsVFovRad`, o que o retângulo
   *  amarelo REALMENTE usa) contra o FOV "zero-zoom" do render
   *  (`zcfg.calibFov` — a referência que `_updateFotoCamOverlayZoomScale`
   *  já usa pra `escalaZoom`, ver abaixo): na baseline (zoom 1:1,
   *  `zoomFov===calibFov`, `escalaZoom=1`), o resultado desta função JÁ é o
   *  tamanho final; em qualquer outro zoom, o `scale(escalaZoom)`
   *  (CSS, aplicado por CIMA deste retângulo) multiplica
   *  `tan(calibFov/2)/tan(zoomFov/2)` — o produto dos dois dá exatamente
   *  `tan(camPropsVFov/2)/tan(zoomFov/2)`, a MESMA razão ótica que faz o
   *  retângulo amarelo (objeto 3D real, tamanho fixo no mundo) crescer/
   *  encolher na tela conforme o FOV do render muda — batendo o retângulo
   *  amarelo em QUALQUER nível de zoom, não só na entrada. Largura segue a
   *  MESMA fração, escalada pela proporção sensor/canvas (`frameAspect /
   *  containerAspect`) — pode resultar num retângulo MAIOR que o canvas
   *  (quando o FOV calibrado é mais aberto que o FOV do render) — correto:
   *  o retângulo amarelo também "vaza" pra fora da tela nesse caso, a foto
   *  deve acompanhar. */
  // [17/09/2026] CORRIGIDO — pedido verbatim: "O escurecer deve ser
  // recalculado a cada variação de zoom. Pois o retângulo amarelo muda de
  // tamanho e o escurecido é feito apenas fora dele." CAUSA RAIZ: esta
  // função usava `zcfg.calibFov` (o FOV "zero-zoom", fixo — só muda ao
  // entrar numa câmera/recalibrar) como referência do `tan(fov/2)`, NUNCA
  // `zcfg.zoomFov` (o FOV de verdade, que a roda do mouse altera a cada
  // "tick", ver `onWheel`) — ou seja, o retângulo devolvido por esta
  // função é SEMPRE do tamanho "parado" (zoom 1:1), mesmo depois de girar
  // a roda do mouse. Um comentário de uma rodada anterior (11/09/2026,
  // "Escurecer ao entorno") já dizia "Já reagia ao ZOOM (via
  // baselineFovRad...)" — afirmação ERRADA: `baselineFovRad` vinha de
  // `calibFov`, que não muda com o zoom, então na prática NUNCA reagia. O
  // retângulo amarelo DE VERDADE (`linhaRet`, malha 3D real em
  // engine3d.js) SEMPRE reagiu ao zoom de verdade (FOV real da câmera de
  // render, `Engine3D.setFov`) — crescendo/encolhendo na tela como
  // qualquer objeto 3D sob uma câmera de perspectiva com FOV mutável.
  // Resultado: a vinheta "Escurecer o entorno" (posicionada por esta
  // função, ver `_updateFotoCamOverlayZoomScale`) ficava com tamanho FIXO
  // enquanto o retângulo amarelo real crescia/encolhia por baixo dela ao
  // dar zoom — descasando os dois (a área escurecida deixava de bater com
  // "tudo fora do retângulo amarelo"). CORRIGIDO: troca `calibFov` por
  // `zoomFov` na conta do `tan(fov/2)` — o retângulo devolvido passa a
  // ser o tamanho de tela REAL do enquadramento calibrado NO ZOOM ATUAL
  // (a MESMA ótica que faz o `linhaRet` 3D crescer/encolher), sempre
  // recalculado a cada chamada — chamada já acontecia a cada "tick" da
  // roda do mouse (`onWheel` → `_updateFotoCamOverlayZoomScale`), só a
  // fórmula em si estava presa na referência errada. Como consequência, a
  // compensação de zoom que antes era aplicada "por CIMA" via
  // `escalaZoom`/`ctx.scale` (`_updateFotoCamOverlayZoomScale`) deixou de
  // ser necessária — o retângulo/canvas em si já nasce do tamanho certo a
  // cada zoom, então a foto (ajustada por Esticar/Caber/Cortar contra
  // ESTE tamanho) já sai correta sem nenhuma escala extra.
  _activeCamFrameRectPx() {
    const canvas = this._container?.querySelector('#v3d-canvas');
    const cw = canvas?.clientWidth || this._container?.clientWidth || 1;
    const ch = canvas?.clientHeight || this._container?.clientHeight || 1;
    const frameAspect = this._activeCamFrameAspect();
    const containerAspect = cw / Math.max(1, ch);
    const zcfg = this._activeCamZoomCfg();
    const zoomFovDeg = zcfg?.zoomFov ?? zcfg?.calibFov ?? this._CAM_VIEW_DEFAULT_FOV;
    const zoomFovRad = (zoomFovDeg * Math.PI) / 180;
    const camPropsVFovRad = this._activeCamPropsVFovRad();
    const fracH = Math.tan(camPropsVFovRad / 2) / Math.max(0.0001, Math.tan(zoomFovRad / 2));
    const fracW = fracH * (frameAspect / Math.max(0.0001, containerAspect));
    const w = cw * fracW, h = ch * fracH;
    const rawLeft = (cw - w) / 2, rawTop = (ch - h) / 2;
    // [12/09/2026 — RODADA "faixa de 1px"] NOVO — pedido verbatim: "Quando
    // está marcado 'Trás', em algum nível de zoom, aparece uma tira vertical
    // de 1 pixel de largura [...] com a cor rgb: 127, 0, 127 [...] No zoom
    // out máximo [...] uma tira vertical preta aparece do lado esquerdo da
    // imagem [...] O retângulo amarelo [...] deve ser sempre centralizado em
    // relação à imagem. Atualmente no zoom out máximo, ele fica 1 pixel para
    // a esquerda. E o 'Escurecer o entorno' deve ir até o pixel do lado da
    // imagem [...] não pintou o escurecimento até ali faltando 1 pixel." (e,
    // na mesma rodada: "variando o nível de zoom [...] a tira preta aparece
    // no lado de cima da imagem" — mesmo bug, eixo vertical). CAUSA RAIZ:
    // este método sempre devolveu `left`/`top`/`width`/`height` em ponto
    // flutuante CRU (nunca arredondados) — cada consumidor arredondava por
    // conta própria, de um jeito DIFERENTE: `_computeFotoCamMaskRawRect`
    // (engine3d.js, o "buraco" real no canvas WebGL) arredonda os 2 CANTOS
    // de cada eixo (esquerda E direita) já em pixels do render target;
    // `_updateFotoCamFrameGuide` arredonda só `width`/`height` (via
    // `Math.round`) mas usa `frame.left`/`frame.top` CRUS pro `style.left`/
    // `style.top`; a vinheta (`_updateFotoCamOverlayZoomScale`) usa os 4
    // valores crus direto no `style`. Em zooms "redondos" a parte
    // fracionária de `rawLeft`/`rawTop`/`w`/`h` é ~0 e todo mundo bate por
    // coincidência — mas em outros níveis de zoom (sobretudo nos extremos,
    // onde o erro acumulado de ponto flutuante da cadeia de tangentes é
    // maior) cada um arredonda pra um pixel de CSS diferente, deixando uma
    // faixa de 1px "órfã" (sem foto por baixo alinhada com o buraco no
    // WebGL — a cor-marcadora ou o preto do fundo do canvas aparecem crus)
    // e o retângulo amarelo/a vinheta 1px fora de posição em relação a ela.
    // CORRIGIDO: arredonda AQUI, na fonte única (Armadilha #4 do projeto) —
    // arredondando os 2 CANTOS de cada eixo (esquerda+direita, topo+fundo)
    // independentemente e derivando `width`/`height` da DIFERENÇA entre eles
    // (mesma técnica já usada em `_computeFotoCamMaskRawRect`), nunca
    // arredondando canto e tamanho por separado — isso garante que TODO
    // consumidor (guia amarela, vinheta, `_fotoCamDrawnRectPx`->máscara
    // WebGL) receba os MESMOS 4 números inteiros (em pixels de CSS),
    // eliminando a divergência de arredondamento entre eles.
    const left = Math.round(rawLeft), top = Math.round(rawTop);
    const right = Math.round(rawLeft + w), bottom = Math.round(rawTop + h);
    return { left, top, width: right - left, height: bottom - top, cw, ch };
  },

  /** Escala compensatória da foto-guia (`.v3d-fotocam-overlay-img`) —
   *  puramente ótica: se o FOV atual (`cfg.zoomFov`) for MENOR que o
   *  calibrado (`cfg.calibFov`, zoom IN), a cena parece maior — a foto
   *  precisa crescer na MESMA proporção pra continuar "encaixada" sobre
   *  ela; FOV MAIOR (zoom OUT) encolhe a foto. Fórmula padrão de óptica de
   *  câmera: razão de ampliação ∝ tan(FOV calibrado/2) / tan(FOV atual/2)
   *  (ambos verticais, mesma convenção de `Engine3D.setFov`).
   *  [10/09/2026] NOVO — pedido verbatim: "A foto é para ser carregada
   *  dentro do enquadramento e deve permanecer dentro do enquadramento,
   *  com o shift+botão do meio do mouse." Antes desta correção, o pan
   *  (`this._camViewPanOffset`/`Engine3D.setCamPanFrac`, ver onMouseMove)
   *  só deslocava a CENA 3D (via lens-shift, ver setCamPanFrac) — a
   *  foto-guia (imagem plana, não reprojetada) ficava PARADA, saindo do
   *  enquadramento/desalinhando da cena atrás dela. Corrigido somando um
   *  `translate()` (em `%`, resolvido contra o próprio tamanho do `<img>`
   *  — que preenche o quadro 1:1, então a MESMA fração `off.x`/`off.y` usada
   *  pro lens-shift da cena serve direto aqui, sem conversão nenhuma) ANTES
   *  do `scale()` na mesma propriedade `transform` — percentuais de
   *  `translate` resolvem contra a caixa de layout ORIGINAL (não afetada
   *  pelo `scale` que vem depois na mesma lista), então pan e zoom não
   *  interferem um no cálculo do outro. Chamada tanto pelo zoom (`onWheel`)
   *  quanto pelo pan (`onMouseMove`, Shift+botão-do-meio) — qualquer um dos
   *  dois reaplica os DOIS componentes juntos (lê `this._camViewPanOffset`
   *  de novo aqui, não recebe por parâmetro). */
  /** [12/09/2026 — ITEM D] pedido verbatim: "Sobre a imagem deve ter mais
   *  opções, além da opacidade" — 7 sub-itens (Trás/Frente, Esticar/Caber/
   *  Cortar, Offset X/Y, Virar Horizontalmente/Verticalmente, Rotação).
   *  Config persistida (GLOBAL, mesmo padrão de armazenamento já usado por
   *  `_getFotoCamOpacidade`/`_LS_KEY_FOTOCAM_OPACIDADE` — o pedido dizia
   *  "persistir junto de onde a opacidade já é guardada", que hoje é um
   *  único valor global em localStorage, não por câmera/foto individual;
   *  documentado aqui pra não ser confundido com "por câmera" numa rodada
   *  futura). `depth`: 'front' (padrão, imagem na frente de TUDO — o
   *  comportamento de sempre, `<img>` DOM sobre o canvas) | 'back' (atrás
   *  dos objetos 3D — NOVO, ver `_ensureFotoCamBackdropPlane`/
   *  `_updateFotoCamBackdropPlane` abaixo). `fit`: 'contain' (Caber,
   *  padrão — mesmo valor que `object-fit:contain` já hardcoded no CSS
   *  antes desta rodada) | 'cover' (Cortar) | 'stretch' (Esticar).
   *  `offsetX`/`offsetY`: [13/09/2026 — ITEM C, pedido verbatim: "Os
   *  offsets devem ser em unidades do mundo"] METROS de deslocamento no
   *  mundo, na distância de referência do quadro calibrado, ao longo dos
   *  EIXOS PRÓPRIOS da câmera (right/up dela, não o horizonte do mundo —
   *  ver `_backdropOffsetFrac`) — ANTES desta rodada era % do quadro
   *  (screen-space); só a UNIDADE/magnitude mudou, a referência de
   *  direção continua a mesma de sempre. `flipH`/`flipV`: bool. `rotation`:
   *  graus, em torno do PRÓPRIO centro da imagem. */
  _LS_KEY_FOTOCAM_BACKDROP: 'catalogo_camview_backdrop_config',

  _getFotoCamBackdropConfig() {
    if (this._fotoCamBackdropConfigCache) return this._fotoCamBackdropConfigCache;
    let cfg = { depth: 'front', fit: 'contain', offsetX: 0, offsetY: 0, flipH: false, flipV: false, rotation: 0 };
    try {
      const raw = localStorage.getItem(this._LS_KEY_FOTOCAM_BACKDROP);
      if (raw) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') cfg = { ...cfg, ...parsed }; }
    } catch (e) { /* localStorage indisponível (ex.: modo privado) — usa o padrão */ }
    this._fotoCamBackdropConfigCache = cfg;
    return cfg;
  },

  _setFotoCamBackdropConfig(patch) {
    const cfg = { ...this._getFotoCamBackdropConfig(), ...patch };
    this._fotoCamBackdropConfigCache = cfg;
    try { localStorage.setItem(this._LS_KEY_FOTOCAM_BACKDROP, JSON.stringify(cfg)); } catch (e) { /* ver getter */ }
    // [19/09/2026] SIMPLIFICADO — pedido verbatim do usuário à época:
    // abandonar o plano 3D do backdrop 'Trás' em favor de desenhar a foto
    // sempre no MESMO `<canvas>` 2D usado por 'Frente'
    // (`#v3d-fotocam-photo-canvas`), mudando só a ORDEM de desenho.
    // [22/09/2026 — RODADA SEGUINTE] REVERTIDO — pedido verbatim do
    // usuário, testando aquela simplificação: "Volte a colocar a imagem lá
    // no fundo, pois os objetos que deveriam estar à frente da imagem não
    // estão." CAUSA: um `<canvas>` 2D de overlay fica SEMPRE empilhado por
    // CSS acima do `<canvas>` WebGL inteiro — não existe nenhuma ordem de
    // `ctx.*` capaz de fazer um objeto 3D REAL (com profundidade de
    // verdade no espaço) ocluir/aparecer na frente dessa foto, porque ela
    // nunca fazia parte do z-buffer da cena — só da "ordem de impressão"
    // de um canvas 2D achatado. 'Trás' voltou a usar um PLANO 3D DE
    // VERDADE (`THREE.Mesh`/`PlaneGeometry`, adicionado a `engine.scene`,
    // `depthTest:true`/`depthWrite:false` — ver `_ensureFotoCamBackdropPlane`/
    // `_updateFotoCamBackdropPlane` abaixo), que agora participa do
    // z-buffer normalmente: objetos 3D reais na frente dele o ocluem,
    // objetos atrás dele ficam ocultos por ele — exatamente como antes de
    // 19/09/2026, mas evitando DE PROPÓSITO o bug de cache que aquela
    // arquitetura tinha (a textura ficava dessincronizada da Resolução/FOV
    // até algo forçar o redesenho, ver histórico em `sw.js`/CHANGELOG,
    // 11/09/2026): a textura off-screen do plano (`_redrawFotoCamBackdropCanvas`)
    // agora é redesenhada A CADA QUADRO, dentro de `_loop`, sempre que
    // 'Trás' estiver ativo — nunca só em handlers pontuais de "onSave"/
    // config que podem ser esquecidos. Esta função (`_setFotoCamBackdropConfig`)
    // continua chamando só `_updateFotoCamOverlayZoomScale()` (o canvas 2D
    // de overlay — usado por 'Frente' pra desenhar a foto, e pelos 2 modos
    // pra desenhar o retângulo amarelo/vinheta, sempre por cima de tudo);
    // o redesenho do PLANO (textura+posição+tamanho) roda à parte, todo
    // quadro, em `_loop` — não precisa ser disparado daqui.
    this._updateFotoCamOverlayZoomScale();
    return cfg;
  },

  /** [12/09/2026 — ITEM D] Fórmula ótica idêntica à de sempre (pan+zoom),
   *  agora também dobrando as novas opções de offset/rotação/flip (mesma
   *  ordem descrita no pedido: base do enquadramento (fit, aplicado à
   *  parte via `object-fit`, não faz parte da matriz `transform`) -> offset
   *  translada -> rotação gira em torno do próprio centro -> flip espelha).
   *  `object-fit` é sempre reaplicado aqui também, mesmo sem pan/zoom/
   *  offset ativos, porque antes desta rodada era um valor FIXO no CSS
   *  (`contain`) — agora precisa refletir `cfg.fit`. */
  /** [13/09/2026 — ITEM C] Converte um offset em METROS (mundo, na
   *  distância de referência do "quadro"/retângulo amarelo calibrado) pra
   *  fração do enquadramento (0.5 = meio quadro) — usada tanto pelo `<img>`
   *  DOM (modo 'front', translate em % do PRÓPRIO box, que agora é o
   *  retângulo amarelo em si — ver `_activeCamFrameRectPx`) quanto pelo
   *  canvas 2D do modo 'back' (`_redrawFotoCamBackdropCanvas`). Pedido
   *  verbatim: "Os offsets devem ser em unidades do mundo [...] só a
   *  UNIDADE muda de porcentagem pra metros — a direção/referência
   *  continua relativa aos EIXOS PRÓPRIOS da câmera (right/up), não ao
   *  horizonte do mundo" (pedido original, 2 rodadas atrás, mantido). A
   *  "distância de referência" é só um valor arbitrário e estável
   *  (`dist = max(2, far*0.9)`, calculado abaixo — [19/09/2026] antes desta
   *  rodada era também a posição do plano 3D do backdrop 'back', REMOVIDO;
   *  a fórmula continua igual, agora só como escala de conversão
   *  metros→fração, sem nenhum objeto 3D posicionado nela) — mover
   *  o campo pra "1.0" desloca a imagem 1m de verdade nessa distância, nos
   *  2 modos, de forma consistente entre eles (independente de qual dos 2
   *  estiver ativo no momento — a config é a mesma pros dois, ver
   *  `_getFotoCamBackdropConfig`). Usa o FOV CALIBRADO (não o `zoomFov`
   *  atual) como referência — o zoom (`escalaZoom` abaixo) já é aplicado
   *  por CIMA deste offset via `scale()`, então a conta do offset em si não
   *  precisa (nem deve) reagir ao zoom, senão o deslocamento em metros
   *  pedido pelo usuário pareceria maior/menor conforme o zoom do momento. */
  // [14/09/2026] CORRIGIDO — usava `zcfg.calibFov` (FOV "zero-zoom" do
  // RENDER, `_fotoCamFovFor`/vanishCam ou padrão 60°) pra achar `halfH` do
  // quadro na distância de referência — mas o plano 3D do backdrop 'Trás'
  // (`_updateFotoCamBackdropPlane`, ver correção abaixo) passou a usar o
  // FOV calibrado do `camProps` (`_activeCamPropsVFovRad`, o que o
  // retângulo amarelo usa de verdade) pra ficar do tamanho certo — usar
  // aqui uma referência DIFERENTE faria "1 metro" de offset corresponder a
  // uma fração ERRADA do quadro real (dessincronizado do tamanho de
  // verdade do plano/retângulo amarelo). Agora usa a MESMA função.
  _backdropOffsetFrac(offsetXm, offsetYm) {
    const dist = Math.max(2, (this._engine?.camera3?.far || 60) * 0.9);
    const camPropsVFovRad = this._activeCamPropsVFovRad();
    const halfH = dist * Math.tan(camPropsVFovRad / 2);
    const halfW = halfH * this._activeCamFrameAspect();
    return {
      x: halfW > 0.0001 ? (offsetXm || 0) / (2 * halfW) : 0,
      y: halfH > 0.0001 ? (offsetYm || 0) / (2 * halfH) : 0,
    };
  },

  /** [12/09/2026 — RODADA "buffer de verdade"] REESCRITO DE NOVO — pedido
   *  verbatim: "Você não consegue usar o mesmo buffer/canvas/imagem de
   *  quando está marcado 'Frente' para que possa ser usado quando está
   *  marcado 'Trás'? Pois em 'Trás', a imagem fica pixelizada no zoom. Use
   *  a mesma coisa de 'Frente' em 'Trás'. E use o depth buffer para
   *  imprimir os objetos na tela." + confirmação seguinte: "Se em 'Frente'
   *  é CSS ou canvas, faça o mesmo em 'Trás'. E use o depth buffer para
   *  imprimir os objetos e cima da imagem (quando estiver marcado
   *  'Trás')."
   *  CAUSA RAIZ do pixelado que sobrava mesmo depois da rodada "mesma
   *  função" (comentário antigo preservado abaixo): mesmo usando
   *  `camera3.projectionMatrix` de verdade (sem shader manual), o plano
   *  ainda era desenhado DENTRO do pipeline WebGL comum a toda a cena —
   *  `Engine3D._sharedRenderer`/`this.renderTarget`/`readRenderTargetPixels`
   *  (arquitetura "MODO EYE", engine3d.js) — cuja resolução é limitada por
   *  `_pixelRatioCap()` (`RESOLUCAO_DPR = {alta:2, media:1.5, baixa:1}`,
   *  um TETO deliberado de qualidade/performance pra cena 3D real, correto
   *  pra paredes/objetos mas baixo demais pra uma FOTO plana, que deveria
   *  poder ficar tão nítida quanto a tela permitir). O `<canvas>` de
   *  'Frente' (`#v3d-fotocam-photo-canvas`) NUNCA passa por esse pipeline —
   *  é um elemento DOM comum, pintado pelo navegador na resolução que o
   *  próprio `canvasEl.width/height` pedir (ver `_updateFotoCamOverlayZoomScale`),
   *  sem NENHUM teto de `resolucao3D` — por isso sempre foi nítido.
   *  SOLUÇÃO (o pedido, ao pé da letra): 'Trás' passa a usar O MESMO
   *  `<canvas>` DOM de 'Frente' — nunca mais escondido (`style.visibility`
   *  REMOVIDO de `_updateFotoCamOverlayZoomScale`), sempre desenhado pela
   *  MESMA função, na MESMA resolução nítida. A diferença entre os 2
   *  modos deixa de ser "existe uma foto ou não" e passa a ser SÓ a ORDEM
   *  DE EMPILHAMENTO CSS (`z-index`, ver `_updateFotoCamOverlayZoomScale`):
   *  'Frente' mantém o canvas ACIMA de `#v3d-canvas` (como sempre);
   *  'Trás' põe o MESMO canvas ABAIXO de `#v3d-canvas` — pra que os
   *  OBJETOS 3D reais (desenhados por cima, no `#v3d-canvas`) apareçam
   *  por cima da foto, e a foto apareça nos pixels onde não há objeto.
   *  "Onde não há objeto" ainda precisa vir do DEPTH BUFFER de verdade
   *  (pedido explícito) — é exatamente pra isso que este plano 3D
   *  continua existindo, só que agora com um papel bem mais simples: não
   *  carrega mais NENHUMA textura/imagem — é um OCLUSOR que pinta uma cor-
   *  MARCADORA sólida e reservada (ver `_FOTOCAM_BACKDROP_MASK_COLOR`,
   *  logo abaixo) posicionado exatamente onde a foto "estaria" no mundo
   *  3D (mesma fórmula de tamanho/posição/billboard de sempre). Com
   *  `depthWrite:true`+`renderOrder` bem baixo (desenha ANTES de tudo mais
   *  na cena), ele grava sua PRÓPRIA profundidade no z-buffer — qualquer
   *  geometria real MAIS DISTANTE que ele (o ambiente/paredes atrás da
   *  posição da "foto") falha o depth-test de verdade da GPU e é
   *  descartada, deixando só a cor-marcadora naquele pixel.
   *  [12/09/2026] CORRIGIDO — 1ª tentativa desta rodada usava
   *  `colorWrite:false` (achando que um pixel "não pintado por ninguém"
   *  ficaria automaticamente transparente) — só que a cena SEMPRE tem
   *  `scene.background` sólido (o céu), pintado opaco em todo pixel não
   *  coberto por outro objeto, ANTES de qualquer depth-test — o pixel
   *  "reservado" nunca ficava transparente de verdade, só ficava com a
   *  cor do céu (sempre opaca), escondendo a foto por baixo ("o 'Trás'
   *  não está aparecendo a imagem", bug reportado). CORRIGIDO: o oclusor
   *  pinta a cor-marcadora de verdade (`colorWrite:true`) e
   *  `Engine3D._presentToCanvas`/`setFotoCamBackdropMask` (engine3d.js,
   *  chamados por `_updateFotoCamBackdropPlane` logo abaixo) fazem, FORA
   *  do pipeline WebGL, a única etapa manual que sobrou: zerar o alfa de
   *  todo pixel que bater com essa cor, só dentro do retângulo do quadro
   *  (barato, delimitado) — é ESSA etapa que produz o "buraco"
   *  transparente de verdade, contornando o preenchimento opaco do céu.
   *  Objetos MAIS PERTO que a "foto" (móveis/itens reais na frente)
   *  continuam vencendo o depth-test contra o oclusor normalmente (mais
   *  perto sempre vence, independente de ordem de desenho, z-buffer
   *  comum), pintando sua PRÓPRIA cor por cima do marcador — nunca batem
   *  com a cor-marcadora, então a máscara os deixa em paz, opacos,
   *  cobrindo a foto por baixo normalmente. "Usa o depth buffer para
   *  decidir se algum pixel será substituído pelo pixel de um objeto" —
   *  o depth-test de verdade da GPU continua sendo quem decide QUAIS
   *  pixels viram "buraco"; a máscara em JS só executa essa decisão fora
   *  do framebuffer (transformando "cor-marcadora" em "alfa=0"), porque o
   *  `scene.background` sólido não deixa a GPU fazer isso sozinha. */
  // [12/09/2026] NOVO — cor-marcadora sólida e reservada (magenta puro,
  // pouco provável de ocorrer "de verdade" em paredes/objetos/luz de um
  // ambiente mapeado) pintada pelo oclusor invisível do backdrop 'Trás'
  // (ver `_ensureFotoCamBackdropPlane`) — `Engine3D.setFotoCamBackdropMask`/
  // `_presentToCanvas` (engine3d.js) zeram o alfa de todo pixel que bater
  // EXATAMENTE com esta cor, dentro do retângulo do quadro. Compartilhada
  // aqui (em vez de duplicada em 2 lugares) porque as 2 pontas — a cor do
  // material E o valor comparado pixel a pixel — precisam ser IDÊNTICAS,
  // senão a máscara nunca encontra nada pra apagar (mesma lição da
  // armadilha #4 do projeto: uma única fonte de verdade).
  _FOTOCAM_BACKDROP_MASK_COLOR: [255, 0, 255],

  _ensureFotoCamBackdropPlane() {
    const engine = this._engine;
    const THREE = engine?.THREE;
    if (!engine?.scene || !THREE) return null;
    if (this._fotoCamBackdropMesh) return this._fotoCamBackdropMesh;
    // [12/09/2026 — RODADA "buffer de verdade"] SEM textura/canvas/imagem
    // nenhuma — este plano nunca é visto DE VERDADE (pinta uma cor-
    // marcadora reservada, ver `_FOTOCAM_BACKDROP_MASK_COLOR`/comentário
    // grande logo abaixo); ele só EXISTE pra gravar profundidade no
    // z-buffer + marcar, com essa cor, os pixels onde o ambiente real é
    // mais distante que a posição da "foto". A foto de verdade vive
    // inteiramente no `<canvas>` DOM de 'Frente' (`#v3d-fotocam-photo-canvas`),
    // por baixo de `#v3d-canvas` via CSS quando 'Trás' está ativo.
    // [12/09/2026] CORRIGIDO — pedido verbatim: "Agora, o 'Trás' não está
    // aparecendo a imagem." CAUSA RAIZ: `colorWrite:false` (comentário
    // antigo, preservado abaixo) partia da premissa de que um pixel "não
    // pintado por ninguém" ficaria transparente (alfa=0, a cor de limpeza
    // do frame) — mas a cena SEMPRE tem `scene.background` definido como
    // uma `THREE.Color` sólida (o céu, ver `engine3d.js _updateSky`), e o
    // Three.js pinta esse fundo OPACO em TODO pixel não coberto por outro
    // objeto, ANTES de qualquer depth-test — o pixel "reservado" pelo
    // oclusor nunca ficava transparente de verdade, só ficava com a cor do
    // céu (sempre opaca), escondendo a foto por baixo. CORRIGIDO: volta a
    // `colorWrite:true`, mas pintando uma cor-MARCADORA sólida e reservada
    // (magenta puro) em vez de textura nenhuma — `Engine3D._presentToCanvas`
    // (engine3d.js, ver `setFotoCamBackdropMask`) zera o alfa de todo pixel
    // que bater com essa cor, só dentro do retângulo do quadro — é ESSA
    // etapa (fora do pipeline WebGL) que produz o "buraco" transparente de
    // verdade, contornando o preenchimento opaco do céu.
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(
        this._FOTOCAM_BACKDROP_MASK_COLOR[0] / 255,
        this._FOTOCAM_BACKDROP_MASK_COLOR[1] / 255,
        this._FOTOCAM_BACKDROP_MASK_COLOR[2] / 255,
      ),
      // [12/09/2026] `depthWrite:true`/`depthTest:true` continuam iguais —
      // é o que garante a oclusão de verdade por objetos reais mais perto
      // (ver `renderOrder`, abaixo). `transparent:false` — precisa ficar
      // na fila OPACA da cena (a fila "transparente" é ordenada de trás
      // pra frente DEPOIS da opaca, o que quebraria a garantia de
      // `renderOrder` desenhar este oclusor sempre PRIMEIRO).
      transparent: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.Mesh(geo, mat);
    // [12/09/2026] `renderOrder` bem baixo — GARANTE que este oclusor
    // desenha (e grava profundidade) ANTES de qualquer objeto normal da
    // cena (`renderOrder` default = 0), não dependendo do heurístico de
    // ordenação "de perto pra longe" que o Three.js usa por padrão na
    // fila opaca (que é só uma otimização de performance, não uma garantia
    // de ordem) — sem isso, um objeto do AMBIENTE desenhado ANTES deste
    // plano já teria pintado sua PRÓPRIA cor opaca naquele pixel (não a
    // cor-marcadora), e o depth-test do oclusor (mais perto) só
    // conseguiria impedir pinturas SEGUINTES no mesmo pixel — o pixel
    // ficaria com a cor ERRADA (do ambiente, não a marcadora), e a
    // máscara em `Engine3D._presentToCanvas` nunca encontraria o marcador
    // ali pra apagar — precisa ser SEMPRE o primeiro a desenhar.
    mesh.renderOrder = -100000;
    mesh.visible = false; // só fica visível quando 'Trás' estiver realmente ativo (ver _loop)
    mesh.frustumCulled = false;
    engine.scene.add(mesh);
    this._fotoCamBackdropMesh = mesh;
    // [22/09/2026] NOVO — ver comentário grande em `Engine3D._renderBackdropEnvPass`:
    // o motor precisa saber qual malha é este oclusor pra escondê-la SÓ
    // durante o passe extra de ambiente (sem afetar o passe principal) —
    // registrado 1x aqui, na criação (a malha nunca é recriada depois).
    engine.registerFotoCamBackdropOcclusor?.(mesh);
    return mesh;
  },

  /** [12/09/2026 — RODADA "buffer de verdade"] REESCRITA (ver comentário
   *  grande em `_ensureFotoCamBackdropPlane`, acima, pro pedido
   *  verbatim/causa raiz/solução completa). Continua usando a MESMA
   *  fórmula de tamanho/posição/billboard das rodadas anteriores
   *  (`_activeCamPropsVFovRad`/`_activeCamFrameAspect`/`_fotoCamPhotoCanvasRectPx`
   *  vs. `_activeCamFrameRectPx`, `camera3.projectionMatrix` de verdade,
   *  sem nenhum deslocamento manual de pan) — só não mexe mais em textura
   *  nenhuma (este plano não tem `material.map`/`opacity` — é só um
   *  oclusor de profundidade, ver acima). */
  /** [12/09/2026 — RODADA "piscada magenta"] MUDADO — agora devolve `true`/
   *  `false` conforme conseguiu ou não montar uma máscara VÁLIDA (retângulo
   *  com tamanho > 0) neste quadro — ver comentário grande no chamador
   *  (dentro de `_loop`, onde `mesh.visible` passa a depender deste
   *  retorno) pro pedido/causa raiz completa da "piscada". */
  _updateFotoCamBackdropPlane(renderCam) {
    const mesh = this._fotoCamBackdropMesh;
    const THREE = this._engine?.THREE;
    const camera3 = this._engine?.camera3;
    if (!mesh || !THREE || !camera3) return false;

    // Mesma distância/fórmula de referência de sempre (`_backdropOffsetFrac`,
    // inalterada) — acha o tamanho (em metros) do quadro calibrado a
    // `dist` metros de distância no eixo óptico da câmera.
    const dist = Math.max(2, (camera3.far || 60) * 0.9);
    const camPropsVFovRad = this._activeCamPropsVFovRad();
    const halfH = dist * Math.tan(camPropsVFovRad / 2);
    const halfW = halfH * this._activeCamFrameAspect();

    // [12/09/2026] CORRIGIDO — pedido verbatim: "Marcando 'Trás' e 'Caber'
    // nas laterais da imagem fica preto (deveria ser transparente para não
    // tapar o fundo)." Antes, este `ratioW`/`ratioH` vinha de
    // `_fotoCamPhotoCanvasRectPx` (o CANVAS inteiro — sempre do tamanho do
    // quadro, exceto em 'Cortar') — em 'Caber', a foto DESENHADA dentro
    // desse canvas é MENOR num dos eixos (letterbox/pillarbox, ver
    // `_fotoCamDrawnSize`), mas o oclusor não sabia disso e cobria o
    // quadro INTEIRO mesmo assim, marcando a faixa vazia (sem foto
    // nenhuma) como "buraco" também — ver comentário grande em
    // `_fotoCamDrawnSize`/no cálculo de `_fotoCamDrawnRectPx`
    // (`_updateFotoCamOverlayZoomScale`) pra causa raiz completa. CORRIGIDO:
    // `ratioW`/`ratioH` agora vêm de `_fotoCamDrawnRectPx` (a foto DE
    // VERDADE, já considerando 'Caber'/'Cortar'/'Esticar' E rotação) — em
    // 'Esticar'/'Cortar' este valor já bate com o quadro inteiro (sem
    // mudança de comportamento); só 'Caber' fica menor de verdade agora.
    const frame = this._activeCamFrameRectPx();
    const drawnRect = this._fotoCamDrawnRectPx;
    const ratioW = drawnRect && frame.width > 0 ? drawnRect.width / frame.width : 1;
    const ratioH = drawnRect && frame.height > 0 ? drawnRect.height / frame.height : 1;
    mesh.scale.set(halfW * 2 * ratioW, halfH * 2 * ratioH, 1);

    // Posiciona a `dist` metros à frente da câmera, de frente pra ela
    // (billboard) — SEM nenhum deslocamento manual de pan: o
    // `setCamPanFrac`/lens-shift já aplicado em `camera3` (antes desta
    // chamada, mesmo quadro) desloca a PROJEÇÃO inteira, e qualquer
    // objeto 3D real nesta posição/orientação já aparece deslocado do
    // jeito certo automaticamente — igual a qualquer peça real da cena.
    const forward = new THREE.Vector3();
    camera3.getWorldDirection(forward);
    mesh.position.copy(camera3.position).addScaledVector(forward, dist);
    mesh.quaternion.copy(camera3.quaternion);

    // [12/09/2026] NOVO — liga a máscara de alfa que faz o "buraco" de
    // verdade aparecer (ver comentário grande em `_ensureFotoCamBackdropPlane`
    // e em `Engine3D._presentToCanvas`/`setFotoCamBackdropMask`, engine3d.js).
    // [12/09/2026, CORRIGIDO — ver comentário grande acima em `ratioW`/
    // `ratioH`] Retângulo agora é `drawnRect` (a foto DE VERDADE, não mais
    // o quadro/canvas inteiro) — mesmo motivo: em 'Caber', procurar a
    // cor-marcadora FORA da área onde a foto de fato foi desenhada
    // "furava" a faixa vazia (letterbox) também, revelando o fundo de
    // `.view3d-wrap` (preto) em vez do cenário 3D real que deveria
    // aparecer ali (como em 'Frente'). Fonte única com o `scale()` do
    // oclusor acima — os 2 usam exatamente o mesmo `drawnRect`.
    // [22/09/2026] NOVO — 3º argumento (`opacidade`, 0-1) — ver comentário
    // grande em `Engine3D._renderBackdropEnvPass`/`_initThree`
    // (`_backdropEnvRenderTarget`) pro pedido/arquitetura completa: usado
    // só pra decidir quanto misturar o ambiente real por cima do
    // resultado de sempre — nunca muda a máscara/oclusão binária em si.
    const maskValida = !!drawnRect && drawnRect.width > 0 && drawnRect.height > 0;
    if (maskValida) this._engine.setFotoCamBackdropMask?.(drawnRect, this._FOTOCAM_BACKDROP_MASK_COLOR, this._getFotoCamOpacidade?.());
    // [12/09/2026] NOVO — ver comentário grande em `Engine3D._buildGlassPane`/
    // `setFotoCamBackdropMaskActive` (engine3d.js): mantém o "vidro
    // rosa choque" desligado (`colorWrite:false`) enquanto a máscara
    // 'Trás' estiver realmente ativa (chega aqui todo quadro em que
    // `drawnRect` existe, junto com `setFotoCamBackdropMask` acima —
    // mesma fonte de verdade, sem duplicar a condição).
    // [12/09/2026 — RODADA "piscada magenta"] MUDADO — pedido verbatim:
    // "Logo que clica em 'Ver através desta câmera', um retângulo magenta
    // aparece repentinamente e depois desaparece. [...] use o mesmo
    // cálculo para evitar as tiras nesse início." CAUSA RAIZ: bem no
    // instante de entrar neste modo, o layout do container/canvas (`#v3d-
    // canvas`, lido por `_activeCamFrameRectPx`) podia ainda não ter sido
    // recalculado pelo navegador com o tamanho FINAL (troca de painéis/
    // FOV acontece no mesmo instante) — por 1-2 quadros, `frame`/`drawnRect`
    // saíam degenerados (tamanho zero ou não confiável), mas o código
    // anterior ligava `mesh.visible = true` (no chamador, dentro de
    // `_loop`) de qualquer jeito, incondicionalmente — o oclusor (plano
    // 3D pintado da cor-marcadora sólida) aparecia então SEM nenhuma
    // máscara/buraco recortado por cima dele (`maskValida` false ali
    // também), sobrando magenta puro cobrindo a tela inteira por aquele(s)
    // quadro(s) — a "piscada". CORRIGIDO: `setFotoCamBackdropMaskActive`
    // só liga (`true`) quando `maskValida` — nos quadros em que NÃO dá
    // pra montar uma máscara de verdade, esta função devolve `false` (ver
    // assinatura acima) e o chamador agora mantém o oclusor ESCONDIDO
    // (mesmo comportamento do "senão" de sempre, como se 'Trás' não
    // estivesse ativo ainda) em vez de mostrá-lo cru — nenhum quadro chega
    // a mostrar o marcador sem buraco.
    this._engine.setFotoCamBackdropMaskActive?.(maskValida);
    return maskValida;
  },

  /** [19/09/2026] REVERTIDO — pedido verbatim: "Tenho uma imagem
   *  carregada em uma câmera, quando clico em 'Cortar', a imagem fica
   *  cortada. Apesar do nome, deveria imprimir a imagem como no botão
   *  'Caber' ampliando (proporcionalmente) até cobrir o retângulo
   *  amarelo (tanto 'Trás' quanto 'Frente' estando marcado)." CAUSA
   *  RAIZ: a correção de 16/09/2026 (comentário abaixo, preservado)
   *  trocou a margem de segurança de 'Cortar' pra uma DIAGONAL FIXA
   *  (`D = sqrt(frameW²+frameH²)`), sempre maior que o próprio quadro em
   *  QUALQUER ângulo — inclusive sem rotação nenhuma (`rotation === 0`,
   *  o caso do teste do usuário) — fazendo 'Cortar' ficar SEMPRE mais
   *  ampliado/cortado do que o "cover" padrão pedido ("como no botão
   *  Caber, ampliando proporcionalmente até cobrir o retângulo, sem
   *  sobrar nem faltar mais do que o necessário"). CORRIGIDO: volta a
   *  calcular a margem em função do ÂNGULO ATUAL de rotação
   *  (`frameW*|cos R| + frameH*|sin R|` — a bounding-box real do quadro
   *  "contra-rotacionado" por `rotationDeg`, técnica padrão de "cover com
   *  rotação"), que na rotação 0° (o padrão, sem o usuário mexer em nada)
   *  dá EXATAMENTE `effW=frameW`/`effH=frameH` — ou seja, o cover MÍNIMO
   *  de verdade, igual ao pedido ("como Caber, só que ampliando até
   *  cobrir em vez de encolhendo até caber"), sem nenhuma margem extra
   *  desnecessária — e ainda cresce suavemente (função contínua de R,
   *  sem saltos) só quando a foto É rotacionada, continuando a cobrir os
   *  4 cantos do quadro em qualquer ângulo (resolve o bug ORIGINAL de
   *  cantos vazios ao rotacionar, sem reintroduzir aquele bug).
   *  `rotationDeg` volta a ser parâmetro (chamado com `cfg.rotation`, ver
   *  `_drawFotoCamPhoto` abaixo). `imgW`/`imgH` — a RESOLUÇÃO NATURAL da
   *  foto (`naturalWidth`/`naturalHeight`), não o tamanho do elemento. */
  _fotoCamCoverBoxSize(frameW, frameH, imgW, imgH, rotationDeg) {
    if (!imgW || !imgH) return { w: frameW, h: frameH };
    const rad = ((rotationDeg || 0) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const effW = frameW * cos + frameH * sin;
    const effH = frameW * sin + frameH * cos;
    const imgAspect = imgW / imgH;
    const effAspect = effW / Math.max(0.0001, effH);
    let w, h;
    if (imgAspect > effAspect) { h = effH; w = effH * imgAspect; } else { w = effW; h = effW / imgAspect; }
    return { w, h };
  },

  /** [16/09/2026 — RODADA SEGUINTE] NOVO — composição 2D pura (translate ->
   *  offset -> rotação -> flip -> drawImage), compartilhada pelos 2 modos
   *  de profundidade ('front', canvas DOM sobre tudo, e 'back', textura do
   *  plano 3D) — pedido verbatim: "É só uma ordem de impressão no canvas
   *  [...] a rotação é em 2D, pode ser feita direto no canvas sem
   *  considerar complexidade 3D [...] Faça apenas considerando o 2D (pois
   *  a vista é fixa)." `cw`/`ch` — tamanho (em "pixels" do canvas de
   *  destino) do QUADRO calibrado (não precisa ser o tamanho real do
   *  canvas em 'Cortar' — o próprio `ctx.drawImage`/limite do canvas
   *  recorta nativamente o que passar de `cw`x`ch`, sem precisar de
   *  nenhum `overflow:hidden` de DOM). `zoomScale` — fator de zoom da roda
   *  do mouse (`escalaZoom`, só usado no modo 'front' — no modo 'back' o
   *  zoom já vem de verdade da projeção da câmera 3D, ver
   *  `_updateFotoCamBackdropPlane`, então aqui fica sempre 1). */
  /** [12/09/2026] NOVO — EXTRAÍDO de dentro de `_drawFotoCamPhoto` (era um
   *  cálculo local, `dw`/`dh`, inacessível de fora) pra virar uma função
   *  COMPARTILHADA — motivo: corrigir o bug reportado "Marcando 'Trás' e
   *  'Caber' nas laterais da imagem fica preto (deveria ser transparente
   *  para não tapar o fundo)". CAUSA RAIZ: em 'Caber' (`fit:'contain'`), a
   *  foto desenhada (`dw`x`dh`) é MENOR que o quadro calibrado num dos
   *  eixos (pra preservar a proporção, sem distorcer) — sobra uma faixa
   *  vazia (letterbox/pillarbox) DENTRO do mesmo `<canvas>`, que
   *  `_drawFotoCamPhoto` deixa transparente (`clearRect`, nunca pintada).
   *  Em 'Frente', isso é inofensivo: a faixa vazia do `<canvas>` (por CIMA
   *  de tudo via CSS) deixa o cenário 3D aparecer por baixo, exatamente
   *  como esperado. Mas o oclusor do backdrop 'Trás'
   *  (`_ensureFotoCamBackdropPlane`/`_updateFotoCamBackdropPlane`) sempre
   *  usava o tamanho do QUADRO INTEIRO (nunca sabia que uma fração dele
   *  ficava vazia em 'Caber') — marcava a faixa vazia como "buraco"
   *  (mesma cor-marcadora) igual ao resto, e como o `<canvas>` da foto
   *  também está vazio/transparente ali (não tem imagem pra mostrar
   *  naquele pedaço), as 2 camadas (WebGL "furado" + canvas da foto vazio)
   *  ficam transparentes ao mesmo tempo — revelando o que está ATRÁS de
   *  ambas: o fundo de `.view3d-wrap` (`#05070a`, quase preto — ver
   *  correção de 12/09/2026 em `css/style.css`), em vez do cenário 3D real
   *  (que deveria aparecer ali, como em 'Frente'). CORRIGIDO: esta função
   *  devolve o retângulo (AABB, já considerando rotação — ver `Math.abs`
   *  de seno/cosseno abaixo) que a foto REALMENTE ocupa dentro do quadro
   *  calibrado (`frameW`x`frameH`) — usado por `_updateFotoCamOverlayZoomScale`
   *  pra guardar `this._fotoCamDrawnRectPx` (lido por
   *  `_updateFotoCamBackdropPlane`, que agora dimensiona/posiciona o
   *  oclusor E a máscara por ESTE retângulo — só a foto de verdade, nunca
   *  a faixa vazia do 'Caber') em vez do quadro inteiro. 'Esticar'
   *  (preenche 100% do quadro) e 'Cortar' (sempre ≥ quadro, nunca sobra
   *  vazio) continuam batendo com o quadro inteiro, sem mudança de
   *  comportamento — só 'Caber' muda de verdade. */
  _fotoCamDrawnSize(frameW, frameH, iw, ih, cfg) {
    let dw, dh;
    if (cfg.fit === 'stretch') {
      dw = frameW; dh = frameH;
    } else if (cfg.fit === 'cover') {
      const box = this._fotoCamCoverBoxSize(frameW, frameH, iw, ih, cfg.rotation || 0);
      dw = box.w; dh = box.h;
    } else { // 'contain' (Caber), padrão
      const imgAspect = iw / Math.max(1, ih), boxAspect = frameW / Math.max(0.0001, frameH);
      if (imgAspect > boxAspect) { dw = frameW; dh = frameW / imgAspect; } else { dh = frameH; dw = frameH * imgAspect; }
    }
    return { dw, dh };
  },

  // [12/09/2026] NOVO — `bitmapScale` (padrão 1). Pedido verbatim: "Percebi
  // que, ao dar zoom in (tanto estando 'Trás' quanto estando 'Frente'
  // marcado), o fps cai bastante. Otimize isso." CAUSA RAIZ (medida com
  // Playwright): o retângulo calibrado (`frame`, `_activeCamFrameRectPx`)
  // CRESCE sem limite ao dar zoom in de verdade (`tan(calibFov/2)/
  // tan(zoomFov/2)` — quanto mais zoom, mais estreito o FOV, maior a
  // razão) — em zoom forte, `frame`/o `<canvas>` da foto passam a ter
  // MILHARES de pixels de lado (ex.: 7040x3960 medido a 6° de FOV), a
  // maior parte disso fora da área visível (`.view3d-wrap{overflow:
  // hidden}` recorta visualmente, mas o CUSTO de redesenhar
  // (`ctx.drawImage`) o canvas INTEIRO todo quadro não é recortado —
  // `_updateFotoCamOverlayZoomScale` sozinha chegou a custar ~35ms/quadro
  // nesse cenário, muito acima do orçamento de um quadro a 60fps (~16ms),
  // e ela roda TODO QUADRO em "Ver através desta câmera" (`_loop`),
  // explicando a queda de FPS em AMBOS os modos ('Frente' e 'Trás' — os 2
  // chamam esta mesma função). CORRIGIDO: o BITMAP real do `<canvas>`
  // (`canvasEl.width/height`) passa a ter um TETO (ver
  // `_updateFotoCamOverlayZoomScale`, que calcula `bitmapScale < 1` quando
  // o tamanho lógico (`cw`/`ch`) excede o teto) — o `<canvas>` continua do
  // MESMO TAMANHO VISUAL na tela (`style.width/height`, inalterado,
  // sempre o tamanho lógico/óptico correto), só a RESOLUÇÃO INTERNA fica
  // menor além do teto; o navegador escala/interpola o bitmap menor pro
  // tamanho visual sozinho (mesmo truque já usado pelo motor 3D,
  // `_pixelRatioCap`/`RESOLUCAO_DPR`, engine3d.js). Only perceptível como
  // uma leve suavização da foto em zooms MUITO fortes (bem além do ponto
  // em que dá pra distinguir pixels individuais da foto de qualquer jeito)
  // — troca ótima: quase nenhuma perda visual por uma queda de custo de
  // dezenas de vezes. Aplicado aqui via `ctx.setTransform(bitmapScale,0,0,
  // bitmapScale,0,0)` (em vez do reset pra identidade) ANTES de qualquer
  // desenho — todo o resto da função continua trabalhando inteiramente em
  // coordenadas LÓGICAS (`cw`/`ch`/`frameW`/`frameH`, nunca muda), a
  // transform sozinha resolve o mapeamento pro bitmap físico menor.
  _drawFotoCamPhoto(ctx, cw, ch, imgEl, cfg, zoomScale, frameW, frameH, bitmapScale) {
    // [19/09/2026] `frameW`/`frameH` NOVOS parâmetros opcionais — ver
    // comentário grande em `_updateFotoCamOverlayZoomScale` pra causa raiz
    // completa do bug corrigido nesta rodada ("Cortar" clipando a sobra da
    // foto em vez de deixá-la visível pra fora do retângulo amarelo).
    // Antes `cw`/`ch` faziam DOIS papéis ao mesmo tempo: o tamanho REAL do
    // canvas (pra `clearRect`/centralizar o desenho) E o tamanho do quadro
    // calibrado usado nas contas de fit ('Esticar'/'Caber'/'Cortar',
    // `_fotoCamCoverBoxSize`) — os 2 sempre coincidiam porque o canvas
    // sempre nasceu do MESMO tamanho do quadro. Agora que o canvas pode
    // ser MAIOR que o quadro (em 'Cortar', pra deixar a sobra da foto
    // visível em vez de cortada nas bordas do quadro), os 2 precisam ser
    // parâmetros SEPARADOS: `cw`/`ch` (tamanho de verdade do canvas, só
    // usado aqui pra `clearRect`/centralizar) e `frameW`/`frameH` (tamanho
    // do QUADRO calibrado — o "retângulo amarelo" — usado nas contas de
    // fit, exatamente como antes). Default pros 2 iguais a `cw`/`ch` —
    // retrocompatível com qualquer chamada que não passe os novos
    // parâmetros (as 2 chamadas existentes neste arquivo já foram
    // atualizadas pra passar os 2 conjuntos separadamente).
    frameW = frameW ?? cw;
    frameH = frameH ?? ch;
    const bmScale = bitmapScale || 1;
    ctx.setTransform(bmScale, 0, 0, bmScale, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    // [13/09/2026] NOVO — pedido verbatim: "A variar a opacidade quando
    // está marcado 'Trás' está sendo de opaco (imagem sólido) até preto.
    // Não deveria ser assim. Deveria variar de opaco (imagem sólida) até
    // transparente." CAUSA RAIZ: em 'Trás', este `<canvas>` fica ATRÁS do
    // `<canvas id="v3d-canvas">` (WebGL) — só aparece através do "buraco"
    // que a máscara abre (ver `Engine3D._presentToCanvas`/
    // `setFotoCamBackdropMask`); o slider de opacidade aplicava
    // `canvasEl.style.opacity` no ELEMENTO inteiro, que compõe (alpha
    // blend) com o que tiver DEPOIS dele na pilha CSS — no caso, o fundo
    // de `.view3d-wrap` (`#05070a`, quase preto), não a cena 3D real (que
    // fica NA FRENTE, não atrás, nesta pilha) — por isso a foto "escurecia
    // pro preto" em vez de "sumir" de verdade. CORRIGIDO (só em 'Trás' —
    // em 'Frente' o canvas já fica na FRENTE do `<canvas>` WebGL, então
    // `style.opacity` ali já revela a cena 3D real corretamente, sem
    // mudança): a opacidade agora é aplicada aqui dentro, via
    // `ctx.globalAlpha` na hora de desenhar a foto, sobre um FUNDO sólido
    // pintado antes com a cor do CÉU da cena (`engine.scene.background` —
    // sempre uma cor sólida, ver `Engine3D._updateSky`) preenchendo o
    // `<canvas>` inteiro — como este canvas SEMPRE fica 100% opaco agora
    // (nunca mais depende do que tiver atrás dele na pilha CSS), variar a
    // opacidade da foto revela o CÉU (o mais próximo de "nada"/"vazio" que
    // existe nesta cena 3D) em vez do fundo escuro da página. `canvasEl.
    // style.opacity` (ver handler do slider) fica sempre em '1' quando
    // 'Trás' está ativo — só o alfa INTERNO aqui muda.
    // [13/09/2026] NOVO — garante aqui (fonte única, não só no handler do
    // slider) que `style.opacity` do ELEMENTO nunca fica "preso" num valor
    // antigo de 'Frente' ao trocar pra 'Trás' (ou vice-versa) sem mexer no
    // slider de novo — em 'Trás' sempre '1' (só o `globalAlpha` interno,
    // abaixo, controla a opacidade da foto); em 'Frente', reflete o valor
    // salvo (`_getFotoCamOpacidade`) normalmente.
    // [22/09/2026 — RODADA SEGUINTE] REESCRITO — pedido verbatim: "Deixei
    // a opacidade em torno de 30%, e alternei entre 'Frente' e 'Trás'.
    // Quando está marcado 'Trás', parece que a mistura de cor gerada pela
    // opacidade gera uma influência maior do que está atrás (no cenário,
    // durante o dia fica mais clara a imagem e durante a noite fica mais
    // escura a imagem). O efeito de mistura de cor gerado pela opacidade
    // deve ser igual nos dois: 'Trás' e 'Frente'. Tendo como padrão o que
    // acontece quando está marcado 'Frente'. A única diferença [...] é os
    // objetos estarem renderizados 'na frente' [...] ou 'atrás' [...]. O
    // botão controla apenas essa mudança." CAUSA RAIZ: a versão anterior
    // (hack de 13/09/2026, removido nesta rodada) misturava a foto com uma
    // cor de céu CHAPADA (`scene.background` — bem clara de dia, bem
    // escura de noite) ANTES de qualquer coisa (`ctx.globalAlpha` aqui
    // dentro), e o novo passe de ambiente real (`Engine3D._renderBackdropEnvPass`,
    // rodada anterior) compunha um SEGUNDO blend por cima disso — 2 blends
    // encadeados, cada um "roubando" um pouco de força do lado errado.
    // 'Frente' sempre usou só 1 blend (o `style.opacity` do ELEMENTO,
    // nativo do navegador, contra o que estiver REALMENTE atrás — nunca
    // uma cor de céu chapada). CORRIGIDO: esta função para de fazer
    // QUALQUER mistura interna — em 'Trás', a foto agora é desenhada 100%
    // OPACA aqui (sem fundo de céu, sem `globalAlpha`), exatamente como em
    // 'Frente' (a diferença dos dois modos nunca foi COMO a foto é
    // desenhada neste canvas, só o `z-index`/ordem de empilhamento dele —
    // ver `_updateFotoCamOverlayZoomScale`). A MISTURA de verdade (opacidade
    // vs. o que está atrás) passa a acontecer só 1x, e do MESMO jeito nos
    // 2 modos: em 'Frente', via `style.opacity` do elemento (like sempre);
    // em 'Trás', via o passe de ambiente (`Engine3D._presentToCanvas`,
    // ver comentário grande lá) — que agora, sem o fundo de céu chapado
    // daqui, resulta na MESMA fórmula matemática de 'Frente' (fotoRGB×
    // opacidade + ambienteRealRGB×(1-opacidade)), só que com o "ambiente
    // real" vindo do passe de ambiente (o que está de fato atrás da foto)
    // em vez do que estiver atrás do CANVAS na pilha CSS — que em 'Trás' é
    // opaco (o `#v3d-canvas`, com o "buraco" exatamente onde a foto
    // deveria aparecer), então dá no mesmo resultado visual.
    if (ctx.canvas?.style) {
      const opacidadeEl = typeof this._getFotoCamOpacidade === 'function' ? this._getFotoCamOpacidade() : 1;
      ctx.canvas.style.opacity = cfg.depth === 'back' ? '1' : String(opacidadeEl);
    }
    if (!imgEl || !imgEl.naturalWidth) return;
    const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
    // [12/09/2026] `dw`/`dh` agora vêm da função COMPARTILHADA
    // `_fotoCamDrawnSize` (ver comentário grande dela, acima) — mesma
    // conta de sempre, só extraída pra também ser usada por
    // `_updateFotoCamOverlayZoomScale` (dimensionamento do oclusor/máscara
    // do backdrop 'Trás').
    const { dw, dh } = this._fotoCamDrawnSize(frameW, frameH, iw, ih, cfg);
    const offFrac = this._backdropOffsetFrac(cfg.offsetX, cfg.offsetY);
    ctx.save();
    // [22/09/2026 — RODADA SEGUINTE] `ctx.globalAlpha` interno REMOVIDO
    // daqui pra 'Trás' — ver comentário grande acima: a foto agora é
    // sempre desenhada 100% opaca neste canvas, nos 2 modos; a mistura por
    // opacidade acontece só 1x, fora daqui (ver `Engine3D._presentToCanvas`).
    ctx.translate(cw / 2, ch / 2);
    ctx.translate(offFrac.x * frameW, offFrac.y * frameH);
    ctx.rotate(((cfg.rotation || 0) * Math.PI) / 180);
    const zoom = zoomScale || 1;
    ctx.scale(zoom * (cfg.flipH ? -1 : 1), zoom * (cfg.flipV ? -1 : 1));
    ctx.drawImage(imgEl, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  },

  /** [16/09/2026 — RODADA SEGUINTE] REESCRITO — antes manipulava um
   *  `<img>` DOM com CSS (`object-fit`/`transform`) dentro de um wrapper
   *  `overflow:hidden` (`#v3d-fotocam-clip`), mais uma cópia DOM separada
   *  do retângulo amarelo (`#v3d-fotocam-frame`) só pra aparecer por cima
   *  do `<img>` (que tinha z-index acima do `<canvas>` WebGL). Agora é um
   *  único `<canvas id="v3d-fotocam-photo-canvas">`: posicionado/
   *  dimensionado exatamente como o quadro calibrado (igual a vinheta),
   *  a foto é desenhada nele via `_drawFotoCamPhoto` (2D puro) e, por
   *  cima, na mesma chamada, o retângulo amarelo via `ctx.strokeRect`
   *  (última operação — sempre por cima da foto, "ordem de impressão no
   *  canvas" pedida) quando o enquadramento estiver visível
   *  (`Engine3D.isCameraFrustumVisible`). O canvas recorta nativamente
   *  (`ctx.drawImage`/`clearRect` nunca escrevem fora de `cw`x`ch`), então
   *  não precisa mais de nenhum wrapper `overflow:hidden`. */
  // [12/09/2026 — RODADA "mesma imagem"] REESCRITO — pedido verbatim:
  // "Acredito que até seria a mesma exata imagem a ser usada (tanto em
  // 'Frente' quanto quando 'Trás' estiver marcada), e o depth buffer seria
  // usado apenas para a 'aparição' dos objetos substituindo os pixels da
  // imagem. Pois 'Trás' e 'Frente' usam as mesmas opções — 'Esticar',
  // 'Caber' e 'Cortar' — e a única diferença é ter os objetos desenhados
  // substituindo os pixels da imagem ou não." Depois de 2 tentativas
  // anteriores (12/09/2026, "2 bugs Imagem/Trás" e "pixel a pixel") ainda
  // apresentarem diferenças entre os modos (encolhimento em 'Esticar'/
  // 'Caber', borrão em 'Cortar', resíduo de composição antiga) — a raiz de
  // TODAS elas era ter DUAS fontes de verdade pro mesmo desenho: este
  // canvas (`#v3d-fotocam-photo-canvas`, 'Frente') e um canvas OFF-SCREEN
  // separado (`_fotoCamBackdropCanvas`, 'Trás'), cada um com seu próprio
  // cálculo de tamanho/posição — por mais que os 2 cálculos fossem
  // "espelhados" na intenção, cada rodada de ajuste num lado só (arredon-
  // damento, ordem de operações, um `Math.round` a mais) reintroduzia um
  // descasamento sutil. CORRIGIDO na raiz: `_fotoCamBackdropCanvas` (o
  // canvas off-screen dedicado) foi ELIMINADO — a textura do shader
  // 'Trás' (ver `_updateFotoCamBackdropPlane`) agora lê DIRETO deste MESMO
  // `<canvas>` (`#v3d-fotocam-photo-canvas`), a MESMA imagem, os MESMOS
  // pixels, sem nenhuma cópia/redesenho paralelo — zero chance de
  // divergir, por construção. O retângulo amarelo/guia (que também vivia
  // neste canvas) foi MOVIDO pra um canvas próprio, `#v3d-fotocam-frame-canvas`
  // (ver `_updateFotoCamFrameGuide`, logo abaixo) — precisa continuar
  // visível por CIMA de tudo nos 2 modos, mas este canvas aqui (a foto)
  // precisa ficar ESCONDIDO em 'Trás' (a foto só aparece via depth-buffer/
  // shader — nunca mais como camada plana por cima de tudo, senão nenhum
  // objeto 3D real conseguiria ocluí-la, o mesmo bug que motivou a
  // arquitetura de plano 3D em 22/09/2026).
  _updateFotoCamOverlayZoomScale() {
    // [17/09/2026] `zcfg` não é mais lido diretamente aqui — a compensação
    // de zoom (`escalaZoom`) foi removida (ver `_activeCamFrameRectPx`,
    // que já lê `_activeCamZoomCfg()` sozinha internamente).
    const canvasEl = this._container?.querySelector('#v3d-fotocam-photo-canvas');
    if (!canvasEl) return;
    const bd = this._getFotoCamBackdropConfig();
    const frame = this._activeCamFrameRectPx();
    const off = this._camViewPanOffset || { x: 0, y: 0 };
    const panPxX = off.x * frame.cw;
    const panPxY = off.y * frame.ch;
    const vignetteEl = this._container?.querySelector('#v3d-fotocam-vignette');
    if (vignetteEl) {
      vignetteEl.style.left = `${frame.left + panPxX}px`;
      vignetteEl.style.top = `${frame.top + panPxY}px`;
      vignetteEl.style.width = `${frame.width}px`;
      vignetteEl.style.height = `${frame.height}px`;
    }
    this._updateFotoCamFrameGuide(frame, panPxX, panPxY);
    const imgEl = this._fotoCamImgEl;
    if (imgEl && !imgEl.naturalWidth && imgEl.getAttribute('src')) {
      // Imagem ainda não decodificou — tenta de novo quando terminar de carregar.
      imgEl.addEventListener('load', () => this._updateFotoCamOverlayZoomScale(), { once: true });
    }
    // [19/09/2026, mantido] Em 'Cortar' (`fit:'cover'`), `_fotoCamCoverBoxSize`
    // DELIBERADAMENTE calcula uma foto MAIOR que o quadro num dos eixos
    // (pra cobrir sem sobrar espaço vazio) — o CANVAS nasce do tamanho
    // dessa caixa de cobertura (sempre ≥ quadro nos 2 eixos), centralizado
    // no CENTRO do quadro (`frameCenterX`/`frameCenterY` abaixo), deixando
    // a sobra visível pra fora do retângulo amarelo em vez de recortada.
    // 'Esticar'/'Caber' (que nunca extrapolam o quadro) continuam com o
    // canvas do tamanho exato do quadro. [12/09/2026 — RODADA "mesma
    // imagem"] Esta conta agora roda SEMPRE, nos 2 modos de profundidade
    // (antes só valia fora de 'Trás') — é o ÚNICO cálculo de tamanho que
    // existe agora, usado pelos 2 modos.
    let canvasW = frame.width, canvasH = frame.height;
    if (bd.fit === 'cover' && imgEl && imgEl.naturalWidth) {
      const box = this._fotoCamCoverBoxSize(frame.width, frame.height, imgEl.naturalWidth, imgEl.naturalHeight, bd.rotation || 0);
      canvasW = Math.max(frame.width, box.w);
      canvasH = Math.max(frame.height, box.h);
    }
    const cw = Math.max(1, Math.round(canvasW));
    const ch = Math.max(1, Math.round(canvasH));
    const frameCenterX = frame.left + frame.width / 2 + panPxX;
    const frameCenterY = frame.top + frame.height / 2 + panPxY;
    const left = frameCenterX - cw / 2, top = frameCenterY - ch / 2;
    canvasEl.style.left = `${left}px`;
    canvasEl.style.top = `${top}px`;
    // [12/09/2026] NOVO — pedido verbatim: "Percebi que, ao dar zoom in
    // (tanto estando 'Trás' quanto estando 'Frente' marcado), o fps cai
    // bastante. Otimize isso." Ver comentário grande em `_drawFotoCamPhoto`
    // (`bitmapScale`) pra causa raiz completa (medida com Playwright: o
    // `<canvas>` da foto cresce SEM LIMITE com o zoom — 7040x3960px a 6°
    // de FOV, ~35ms só pra redesenhar, todo quadro). `style.width/height`
    // continuam no tamanho VISUAL/lógico de sempre (`cw`/`ch`, correto
    // opticamente) — só a RESOLUÇÃO INTERNA do bitmap (`canvasEl.width/
    // height`) ganha um teto (`BACKDROP_CANVAS_MAX_DIM_PX`, abaixo),
    // relativo ao tamanho real da tela (`frame.cw`/`frame.ch` — o
    // `<canvas>` WebGL/container, não o quadro calibrado que pode
    // extrapolar) vezes o DPR (nítido em telas retina) com uma folga de
    // 25% (pan/rotação leve sem re-borrar) — o navegador faz o upscale
    // visual sozinho (mesmo truque de `_pixelRatioCap`/`RESOLUCAO_DPR`,
    // engine3d.js). Sem isso, um zoom forte redesenhava milhões de pixels
    // fora da área visível (`overflow:hidden` só recorta visualmente, não
    // barateia o `drawImage`) todo quadro, à toa.
    const dprCap = Math.min(window.devicePixelRatio || 1, 2);
    const BACKDROP_CANVAS_MAX_DIM_PX = Math.max(512, Math.round(Math.max(frame.cw, frame.ch) * dprCap * 1.25));
    const bitmapMaxSide = Math.max(cw, ch);
    const bitmapScale = bitmapMaxSide > BACKDROP_CANVAS_MAX_DIM_PX ? BACKDROP_CANVAS_MAX_DIM_PX / bitmapMaxSide : 1;
    const bw = Math.max(1, Math.round(cw * bitmapScale));
    const bh = Math.max(1, Math.round(ch * bitmapScale));
    canvasEl.style.width = `${cw}px`;
    canvasEl.style.height = `${ch}px`;
    if (canvasEl.width !== bw || canvasEl.height !== bh) { canvasEl.width = bw; canvasEl.height = bh; }
    // [12/09/2026 — RODADA "mesma imagem"] NOVO — guardado pra
    // `_updateFotoCamBackdropPlane` ler DIRETO (mesmos números usados aqui
    // pra posicionar o canvas de verdade — zero risco de recalcular
    // diferente do outro lado).
    this._fotoCamPhotoCanvasRectPx = { left, top, width: cw, height: ch };
    // [12/09/2026] NOVO — retângulo (AABB, em pixels de PÁGINA — mesma
    // convenção de `_fotoCamPhotoCanvasRectPx`/`frame`) que a foto REALMENTE
    // ocupa dentro do quadro/canvas — ver comentário grande em
    // `_fotoCamDrawnSize`, acima, pro pedido/causa raiz completa ("Marcando
    // 'Trás' e 'Caber' nas laterais da imagem fica preto"). Em 'Esticar'/
    // 'Cortar' este retângulo bate exatamente com `_fotoCamPhotoCanvasRectPx`
    // (dw/dh cobrem cw/ch inteiro); só em 'Caber' fica MENOR num dos eixos —
    // é esse retângulo menor (não o quadro inteiro) que
    // `_updateFotoCamBackdropPlane` usa agora pra dimensionar o oclusor e a
    // máscara do backdrop 'Trás', deixando a faixa vazia do 'Caber'
    // corretamente FORA da área "furada" (o cenário 3D real aparece ali,
    // como em 'Frente', em vez de preto). `Math.abs(cos/sin)` — AABB de um
    // retângulo `dw`x`dh` girado por `cfg.rotation` graus, centrado no MESMO
    // ponto (`frameCenterX+offPxX`, `frameCenterY+offPxY`) usado por
    // `_drawFotoCamPhoto` (`ctx.translate` + `offFrac`, ver lá) — sem
    // duplicar o cálculo do CENTRO, só o TAMANHO final (`dw`/`dh`, já
    // compartilhado via `_fotoCamDrawnSize`).
    if (imgEl && imgEl.naturalWidth) {
      const { dw, dh } = this._fotoCamDrawnSize(frame.width, frame.height, imgEl.naturalWidth, imgEl.naturalHeight, bd);
      const rotRad = ((bd.rotation || 0) * Math.PI) / 180;
      const cosA = Math.abs(Math.cos(rotRad)), sinA = Math.abs(Math.sin(rotRad));
      const aabbW = dw * cosA + dh * sinA;
      const aabbH = dw * sinA + dh * cosA;
      // [12/09/2026] `offFrac` recalculado aqui (não está no escopo desta
      // função — `_drawFotoCamPhoto`, chamada mais abaixo, calcula o SEU
      // próprio internamente) via a MESMA `_backdropOffsetFrac`, única
      // fonte de verdade do offset — nunca duplicando a FÓRMULA, só
      // chamando de novo com os mesmos argumentos (`bd.offsetX/Y`).
      const offFracHere = this._backdropOffsetFrac(bd.offsetX, bd.offsetY);
      const offPxX = offFracHere.x * frame.width, offPxY = offFracHere.y * frame.height;
      const centerX = frameCenterX + offPxX, centerY = frameCenterY + offPxY;
      // [12/09/2026 — RODADA "tamanho exato da imagem"] MUDADO — pergunta/
      // pedido verbatim: "Para que serve o que é preto atrás da imagem
      // [...] Arredonde ou adicione/subtraia valores para que o retângulo
      // [...] preto seja do exato tamanho da imagem naquele nível de
      // zoom." O "preto" é só o fundo padrão do visualizador 3D, que fica
      // ATRÁS de tudo (do `<canvas>` WebGL E do `<canvas>` da foto) — ele
      // não tem nenhuma função no 'Trás' em si; só aparece quando o
      // "buraco" recortado no canvas WebGL (`_computeFotoCamMaskRawRect`,
      // engine3d.js) é maior que a área onde a foto TEM pixels de verdade,
      // sobrando uma fresta sem nada desenhado ali (nem foto, nem cor-
      // marcadora) que deixa esse fundo aparecer. CAUSA RAIZ de sobrar
      // esse excesso: este retângulo (`aabbW`x`aabbH`, base pra
      // `mask.rectPx`) sempre foi calculado em ponto flutuante CRU — mas o
      // `<canvas>` da foto de verdade (`_fotoCamPhotoCanvasRectPx`, acima)
      // já nasce com `width`/`height` ARREDONDADOS (`cw`/`ch`) pra pixels
      // INTEIROS — em 'Esticar'/'Cortar' (sem letterbox) os 2 deveriam
      // coincidir exatamente, mas o AABB flutuante podia ficar até ~0.5px
      // MAIOR que o canvas de verdade (que já arredondou pra baixo em
      // alguns casos), fazendo o buraco (baseado no AABB) extrapolar a
      // área onde a foto realmente tem pixel — exatamente a fresta
      // "preta" reportada. CORRIGIDO: arredonda os 2 CANTOS deste
      // retângulo (mesma técnica de `_activeCamFrameRectPx`) E, além
      // disso, recorta (clip) o resultado contra `_fotoCamPhotoCanvasRectPx`
      // — o retângulo do CANVAS DE VERDADE — garantindo que o retângulo
      // usado pra máscara NUNCA seja maior que a área onde a foto
      // realmente foi desenhada, em nenhuma circunstância (o exato pedido:
      // "do exato tamanho da imagem naquele nível de zoom").
      const rawDrawnLeft = centerX - aabbW / 2, rawDrawnTop = centerY - aabbH / 2;
      const rLeft = Math.round(rawDrawnLeft), rTop = Math.round(rawDrawnTop);
      const rRight = Math.round(rawDrawnLeft + aabbW), rBottom = Math.round(rawDrawnTop + aabbH);
      const canvasRect = this._fotoCamPhotoCanvasRectPx;
      const clipLeft = Math.max(canvasRect.left, rLeft);
      const clipTop = Math.max(canvasRect.top, rTop);
      const clipRight = Math.min(canvasRect.left + canvasRect.width, rRight);
      const clipBottom = Math.min(canvasRect.top + canvasRect.height, rBottom);
      this._fotoCamDrawnRectPx = {
        left: clipLeft, top: clipTop,
        width: Math.max(0, clipRight - clipLeft), height: Math.max(0, clipBottom - clipTop),
      };
    } else {
      this._fotoCamDrawnRectPx = null;
    }
    // [17/09/2026] REMOVIDO — `escalaZoom` (compensação de zoom aplicada
    // "por cima" via `ctx.scale`) deixou de ser necessária: `frame`
    // (`_activeCamFrameRectPx`, acima) agora já devolve o tamanho de tela
    // REAL do enquadramento NO ZOOM ATUAL (ver comentário grande naquela
    // função) — `cw`/`ch` já nascem do tamanho certo a cada zoom, então
    // `_drawFotoCamPhoto` (Esticar/Caber/Cortar ajustados contra ESTE
    // tamanho) já sai correto sem nenhuma escala extra.
    const ctx = canvasEl.getContext('2d');
    // [12/09/2026 — RODADA "mesma imagem"] A foto agora é SEMPRE desenhada
    // aqui, nos 2 modos (nada de clear/branch por `bd.depth`) — o
    // retângulo amarelo NÃO é mais desenhado neste canvas (movido pra
    // `_updateFotoCamFrameGuide`, chamada acima).
    this._drawFotoCamPhoto(ctx, cw, ch, imgEl, bd, 1, frame.width, frame.height, bitmapScale);
    // [12/09/2026 — RODADA "buffer de verdade"] REESCRITO — pedido
    // verbatim: "Use a mesma coisa de 'Frente' em 'Trás'. [...] Se em
    // 'Frente' é CSS ou canvas, faça o mesmo em 'Trás'." Antes, este
    // canvas ficava com `style.visibility:hidden` em 'Trás' (a foto só
    // "aparecia" via uma textura/plano 3D à parte, passando pelo pipeline
    // WebGL de resolução limitada — a causa raiz do pixelado no zoom, ver
    // comentário grande em `_ensureFotoCamBackdropPlane`). Agora este
    // `<canvas>` NUNCA mais é escondido — é o MESMO elemento, sempre
    // visível, nos 2 modos, na MESMA resolução nítida de sempre. A única
    // diferença entre 'Frente' e 'Trás' passa a ser SÓ o `z-index` CSS
    // (este canvas é um elemento DOM SEPARADO, irmão de `#v3d-canvas`
    // dentro de `#v3d-camzoom-wrap` — ver `_renderFotoCamOverlay`, que
    // parou de aninhá-lo dentro de `.v3d-fotocam-overlay`, z-index:30,
    // justamente pra poder empilhá-lo LIVREMENTE acima OU abaixo de
    // `#v3d-canvas`, algo impossível enquanto ele era descendente de um
    // contêiner com z-index fixo maior que o do canvas WebGL):
    // - 'front': `z-index` positivo (25) — ACIMA de `#v3d-canvas` (estático,
    //   sem z-index) — mesmo comportamento visual de sempre, foto sempre
    //   por cima de tudo do cenário 3D.
    // - 'back': `z-index` negativo (-1) — ABAIXO de `#v3d-canvas` — os
    //   OBJETOS 3D reais (desenhados em `#v3d-canvas`, por cima) aparecem
    //   por cima da foto; nos pixels onde `#v3d-canvas` fica transparente
    //   (o oclusor invisível de `_updateFotoCamBackdropPlane` "apaga" o
    //   ambiente mais distante que a posição da foto via depth-test real —
    //   ver comentário grande lá), a foto (por baixo, nítida) aparece.
    // Em ambos os casos, `.v3d-fotocam-frame-canvas` (retângulo-guia +
    // gizmo do Modelador) continua num z-index:30 fixo (`.v3d-fotocam-overlay`),
    // sempre por cima de TUDO — nunca precisou mudar.
    // [22/09/2026] REVERTIDO (mesma rodada) — chegou a existir aqui uma
    // condição que subia o `z-index` deste canvas pra ACIMA de
    // `#v3d-canvas` sempre que a opacidade caía abaixo de 1 — pedido
    // verbatim do usuário CORRIGINDO isso: "Mesmo com a opacidade < 1,
    // estando marcado 'Trás' a imagem deve continuar atrás dos objetos.
    // Você colocou ela para frente." Botar a foto por CIMA (mesmo
    // translúcida) fazia ela aparecer por cima de objetos 3D REAIS mais
    // perto que deveriam continuar ocluindo-a — exatamente o oposto do que
    // 'Trás' significa. CORRIGIDO: `z-index` volta a ser SEMPRE `-1` em
    // 'Trás' (qualquer opacidade) — ver `Engine3D._renderBackdropEnvPass`
    // (novo, engine3d.js `_presentToCanvas`) pra como o pedido original
    // (chão/neblina variando com a opacidade) é resolvido agora, sem
    // depender de mexer no z-index/empilhamento deste canvas.
    canvasEl.style.zIndex = bd.depth === 'back' ? '-1' : '25';
  },

  /** [12/09/2026 — RODADA "mesma imagem"] NOVO — desenha só o retângulo
   *  amarelo/guia de calibração num canvas PRÓPRIO
   *  (`#v3d-fotocam-frame-canvas`), separado do canvas da foto (ver
   *  comentário grande em `_updateFotoCamOverlayZoomScale`). SEMPRE do
   *  tamanho EXATO do quadro calibrado (nunca cresce pra caixa de
   *  cobertura do 'Cortar' — só o canvas da foto cresce), então a posição
   *  do stroke é sempre "canto a canto" (sem precisar centralizar dentro
   *  de um canvas maior, como o antigo cálculo de `rx`/`ry`). Também é o
   *  destino usado por `_compositeGizmoOverlayOntoPhotoCanvas` (mantém o
   *  nome antigo por compatibilidade, mas o alvo mudou pra este canvas) —
   *  o gizmo do Modelador precisa continuar visível por CIMA de tudo nos 2
   *  modos, mesmo com o canvas da foto escondido em 'Trás'. */
  _updateFotoCamFrameGuide(frame, panPxX, panPxY) {
    const canvasEl = this._container?.querySelector('#v3d-fotocam-frame-canvas');
    if (!canvasEl) return;
    const cw = Math.max(1, Math.round(frame.width));
    const ch = Math.max(1, Math.round(frame.height));
    canvasEl.style.left = `${frame.left + panPxX}px`;
    canvasEl.style.top = `${frame.top + panPxY}px`;
    // [12/09/2026] NOVO — MESMO teto de resolução aplicado ao canvas da
    // foto (ver comentário grande em `_drawFotoCamPhoto`/
    // `_updateFotoCamOverlayZoomScale`, "otimize isso") — este canvas
    // (retângulo-guia + gizmo do Modelador) também cresce sem limite com
    // o zoom (mesmo `frame`), e também é redimensionado/redesenhado TODO
    // quadro; `style.width/height` continuam no tamanho lógico de sempre,
    // só a resolução interna do bitmap ganha teto.
    const dprCapG = Math.min(window.devicePixelRatio || 1, 2);
    const GUIDE_CANVAS_MAX_DIM_PX = Math.max(512, Math.round(Math.max(frame.cw, frame.ch) * dprCapG * 1.25));
    const guideMaxSide = Math.max(cw, ch);
    const guideScale = guideMaxSide > GUIDE_CANVAS_MAX_DIM_PX ? GUIDE_CANVAS_MAX_DIM_PX / guideMaxSide : 1;
    const gbw = Math.max(1, Math.round(cw * guideScale));
    const gbh = Math.max(1, Math.round(ch * guideScale));
    canvasEl.style.width = `${cw}px`;
    canvasEl.style.height = `${ch}px`;
    if (canvasEl.width !== gbw || canvasEl.height !== gbh) { canvasEl.width = gbw; canvasEl.height = gbh; }
    const ctx = canvasEl.getContext('2d');
    ctx.setTransform(guideScale, 0, 0, guideScale, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const frustumVisivel = !!(this._fotoCamActiveFoto?.id != null && this._engine?.isCameraFrustumVisible?.(this._fotoCamActiveFoto.id));
    if (frustumVisivel) {
      ctx.save();
      ctx.strokeStyle = '#ffee00';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(1, 1, Math.max(0, cw - 2), Math.max(0, ch - 2));
      ctx.restore();
    }
    // [12/09/2026] NOVO — guarda a escala pra `_compositeGizmoOverlayOntoPhotoCanvas`
    // (único outro lugar que desenha neste canvas, com sua PRÓPRIA
    // transform via `ctx.setTransform(1,0,0,1,0,0)` — precisa saber deste
    // fator pra não desfazer o teto de resolução aplicado aqui).
    this._fotoCamFrameGuideBitmapScale = guideScale;
  },

  /** [19/09/2026] NOVO — pedido verbatim: "Se há como definir a ordem de
   *  impressão do gizmo do objeto selecionado no Modelador, quando se está
   *  no modo 'Ver através desta câmera', então, faça o gizmo do objeto
   *  selecionado ser impresso depois da imagem." Ver comentário grande em
   *  `ModelerGizmo.renderIsolatedToCanvas` (modeler-gizmo.js) pra causa
   *  raiz completa (resumo: o gizmo é um objeto 3D de verdade dentro do
   *  `<canvas>` WebGL — nenhum `renderOrder` interno da cena consegue
   *  fazê-lo aparecer por cima do `<canvas>` DOM 2D da foto do modo
   *  'Frente', que já fica inteiro por CIMA do canvas WebGL via z-index
   *  CSS). Esta função é o lado "colar" da operação: recebe o `overlay`
   *  devolvido por `renderIsolatedToCanvas` (um `<canvas>` já com só os
   *  pixels do gizmo, fundo transparente, orientação normal/"direita") e
   *  desenha (`ctx.drawImage`) só a FATIA dele que corresponde à posição
   *  atual do quadro calibrado (`#v3d-fotocam-photo-canvas`, mesmo
   *  `frame`/`off` de sempre — ver `_updateFotoCamOverlayZoomScale`) —
   *  como os DOIS canvases (o do gizmo isolado e o `#v3d-canvas` de onde
   *  ele foi capturado) compartilham o MESMO sistema de coordenadas de
   *  tela (o `overlay` é do tamanho inteiro do `#v3d-canvas`, não
   *  recortado), a conversão é só escala por `dpr` (canvas WebGL em
   *  pixels de DISPOSITIVO; `frame`/`off`/`#v3d-fotocam-photo-canvas` em
   *  pixels de CSS) — `ctx.drawImage` com a forma de 9 argumentos já faz
   *  esse reescalonamento sozinho (fonte em pixels de dispositivo, destino
   *  em pixels de CSS). Chamado por `Modeler3D._renderFrame`
   *  (modeler-core.js) a cada quadro do Modelador, DEPOIS de já ter
   *  chamado `_updateFotoCamOverlayZoomScale()` (redesenha a foto/o
   *  retângulo do zero — necessário pra não deixar um "rastro" do gizmo
   *  de quadros anteriores acumulado, já que este canvas não é limpo
   *  automaticamente entre quadros do Modelador). */
  // [12/09/2026 — RODADA "mesma imagem"] RETARGETADO — o alvo do
  // `drawImage` deixou de ser `#v3d-fotocam-photo-canvas` (agora escondido
  // em 'Trás', usado só como textura do shader — ver comentário grande em
  // `_updateFotoCamOverlayZoomScale`) e passou a ser
  // `#v3d-fotocam-frame-canvas` (o retângulo-guia, sempre visível por cima
  // de tudo nos 2 modos) — o gizmo do Modelador precisa continuar visível
  // mesmo com a foto escondida em 'Trás'. Nome do método mantido
  // (`OntoPhotoCanvas`) por compatibilidade com o único chamador
  // (`modeler-core.js`), mas o destino real é o canvas-guia. Esse canvas
  // SEMPRE tem exatamente o tamanho do quadro calibrado (nunca cresce pra
  // caixa de cobertura do 'Cortar' — só o canvas da foto cresce), então
  // `dx`/`dy` são sempre 0 agora (mantidos na fórmula só por robustez,
  // caso isso mude no futuro).
  _compositeGizmoOverlayOntoPhotoCanvas(overlay) {
    const canvasEl = this._container?.querySelector('#v3d-fotocam-frame-canvas');
    if (!canvasEl || !overlay?.canvas || !overlay.w || !overlay.h) return;
    if (canvasEl.width < 1 || canvasEl.height < 1) return;
    const engineCanvas = this._container?.querySelector('#v3d-canvas');
    const engineRect = overlay.engineRect || engineCanvas?.getBoundingClientRect();
    if (!engineRect || engineRect.width < 1 || engineRect.height < 1) return;
    const dpr = overlay.w / engineRect.width;
    const frame = this._activeCamFrameRectPx();
    const off = this._camViewPanOffset || { x: 0, y: 0 };
    const panPxX = off.x * frame.cw;
    const panPxY = off.y * frame.ch;
    const sx = (frame.left + panPxX) * dpr;
    const sy = (frame.top + panPxY) * dpr;
    const sw = frame.width * dpr;
    const sh = frame.height * dpr;
    if (sw < 0.5 || sh < 0.5) return;
    // [12/09/2026] CORRIGIDO — este canvas nasce SEMPRE do tamanho exato
    // do quadro (`_updateFotoCamFrameGuide`, cw=frame.width/ch=frame.height
    // lógicos — nunca precisou de `dx`/`dy` de centralização, era sempre
    // 0), mas agora (ver "otimize isso"/teto de resolução, mesma função) o
    // BITMAP real (`canvasEl.width/height`) pode ser MENOR que o tamanho
    // lógico em zoom forte — em vez de desenhar em pixels de bitmap
    // (que mudam de escala a cada zoom), a transform usa
    // `_fotoCamFrameGuideBitmapScale` (guardado por `_updateFotoCamFrameGuide`,
    // chamada sempre ANTES desta função no mesmo quadro — ver
    // modeler-core.js) — destino em coordenadas LÓGICAS
    // (`0,0,frame.width,frame.height`, o quadro inteiro), a transform
    // resolve o mapeamento pro bitmap físico sozinha, igual ao resto desta
    // tela.
    const ctx = canvasEl.getContext('2d');
    const scale = this._fotoCamFrameGuideBitmapScale || 1;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(overlay.canvas, sx, sy, sw, sh, 0, 0, frame.width, frame.height);
    ctx.restore();
  },

  /** [19/09/2026 — RODADA SEGUINTE] REMOVIDO — `_compositeGizmoOverlayOntoMainCanvas`
   *  colava o gizmo isolado direto em `#v3d-canvas` (o cenário 3D), técnica
   *  usada só pelo modo 'Trás' quando a foto vivia dentro da PRÓPRIA cena
   *  3D (plano `_ensureFotoCamBackdropPlane`, removido nesta rodada). Sem
   *  esse plano, `#v3d-canvas` nunca mais contém a foto em NENHUM modo — os
   *  2 modos ('Trás' e 'Frente') agora sempre colam o gizmo isolado sobre
   *  `#v3d-fotocam-photo-canvas` (`_compositeGizmoOverlayOntoPhotoCanvas`,
   *  acima), o mesmo `<canvas>` 2D onde a foto é desenhada nos 2 modos —
   *  ver `js/modeler/modeler-core.js` `_renderFrame` (chamador único). */

  /** [19/09/2026 — RODADA SEGUINTE] REMOVIDO — pedido verbatim do usuário:
   *  "faça exatamente a mesma coisa [do modo 'Frente'] para 'Trás' [...]
   *  Apenas dê um jeito de imprimir, no canvas (2D), a imagem logo antes de
   *  começar a imprimir os objetos." Esta seção tinha `_applyFotoCamBackdropDepthMode`
   *  (alternava entre o `<canvas>` de overlay 2D — 'front' — e um plano
   *  Three.js REAL dentro da cena, com uma `THREE.CanvasTexture` off-screen
   *  redesenhada à parte — 'back'), `_ensureFotoCamBackdropPlane`
   *  (criava o plano/textura/material), `_redrawFotoCamBackdropCanvas`
   *  (redesenhava a textura off-screen — a MESMA composição 2D de
   *  `_drawFotoCamPhoto`, só que pra um canvas invisível que depois virava
   *  textura) e `_updateFotoCamBackdropPlane` (reposicionava/redimensionava
   *  o plano todo quadro, em `_loop`, pra cobrir o frustum da pose sendo
   *  renderizada). Essa arquitetura vinha causando bugs recorrentes de
   *  dessincronização (textura numa proporção/resolução antiga em relação
   *  ao plano/retângulo amarelo — ver histórico de correções acima, ex.:
   *  entrada de 11/09/2026 sobre Resolução da câmera editada depois de já
   *  haver uma foto carregada) — TODA essa complexidade (plano 3D, textura
   *  off-screen dedicada, cálculo de posição/orientação por eixo óptico em
   *  3D) foi REMOVIDA por pedido explícito do usuário, em favor do MESMO
   *  mecanismo simples já usado por 'Frente': desenhar a foto direto no
   *  `<canvas>` 2D de overlay (`#v3d-fotocam-photo-canvas`, sempre por cima
   *  do `<canvas>` WebGL/2D principal via CSS), usando a MESMA função
   *  `_drawFotoCamPhoto` (Esticar/Caber/Cortar/Offset/Rotação/Flip
   *  continuam idênticos nos 2 modos, por construção — é a MESMA função).
   *  A ÚNICA diferença entre 'Trás' e 'Frente' agora é a ORDEM de desenho
   *  dentro de `_updateFotoCamOverlayZoomScale` (logo abaixo): 'Frente'
   *  desenha a foto por último (depois do retângulo amarelo/qualquer outro
   *  elemento já impresso nesse canvas — comportamento de sempre, não
   *  alterado); 'Trás' desenha a foto ANTES de imprimir esses mesmos
   *  elementos, ficando por baixo deles dentro do MESMO canvas 2D — nunca
   *  mais um objeto posicionado no espaço 3D. HONESTIDADE (documentada
   *  aqui pra não ser confundida com um bug numa rodada futura): como
   *  `#v3d-fotocam-photo-canvas` é um `<canvas>` DOM SEPARADO, sempre
   *  empilhado por CSS ACIMA do `<canvas>` WebGL/2D principal
   *  (`#v3d-canvas`, onde o cenário 3D de verdade — chão/paredes/objetos —
   *  é desenhado), a ordem de desenho DENTRO do canvas da foto não pode
   *  fazer a foto ficar visualmente atrás de objetos 3D REAIS — só entre
   *  ela e outros elementos desenhados NESSE MESMO canvas (hoje, o
   *  retângulo amarelo de enquadramento; se o gizmo do Modelador estiver
   *  colado por cima, ver `_compositeGizmoOverlayOntoPhotoCanvas`, também
   *  entra nessa conta). O próprio pedido do usuário já autorizava
   *  explicitamente essa simplificação ("não precisa colocar a imagem lá
   *  no fundo [do espaço 3D]") — a troca aceita é: perder a oclusão real
   *  por objetos 3D (o que causava toda a complexidade/bugs anteriores) em
   *  troca de um mecanismo único, simples e robusto, sem nenhuma classe de
   *  bug de textura/resolução dessincronizada por design (a foto nunca
   *  mais é cacheada numa textura à parte — é sempre desenhada fresca, a
   *  partir da imagem original, a cada chamada). Se um efeito de oclusão
   *  real por objetos 3D for pedido de novo no futuro, ele exigiria voltar
   *  a algum mecanismo de posicionamento 3D (este comentário documenta o
   *  porquê, pra a próxima rodada não reinventar do zero). */


  /** Zera o zoom (volta ao FOV calibrado desta câmera/orb) E o
   *  deslocamento panorâmico (`_camViewPanOffset`, Shift+botão-do-meio — ver
   *  onMouseMove) — chamada ao ENTRAR em `_fotoCamMode`/`_orbCamMode`
   *  (nunca herda zoom/pan de uma sessão anterior) e ao SAIR (os pontos de
   *  saída já restauram o FOV/pose de navegação normal por conta própria —
   *  ver `_exitFotoCameraView`/`_exitCameraOrbView` — esta chamada só
   *  limpa a compensação da foto-guia/o cursor residual/o offset de pan).
   *  [10/09/2026] Também limpa o deslocamento de "lente" de verdade em
   *  `camera3` (`Engine3D.setCamPanFrac(0,0)` → `clearViewOffset()`) — sem
   *  isto, um pan feito numa sessão de câmera-vista vazaria pra navegação
   *  normal/Modelador depois de sair (todos reaproveitam o MESMO
   *  `camera3`). */
  _resetCamZoom() {
    this._updateFotoCamOverlayZoomScale();
    this._camViewPanOffset = { x: 0, y: 0 };
    this._engine?.setCamPanFrac(0, 0);
    // [10/09/2026] NOVO — limpa a exclusão de pick (ver
    // Engine3D.setPickExclude/this._pickExclude) e o ponto de tela do
    // destaque de mira (ver Engine3D.setHoverScreenPoint/
    // this._hoverScreenNdc) — chamado tanto ao ENTRAR (reset limpo antes
    // de _enterFotoCameraView/_enterCameraOrbView religarem a exclusão com
    // o id certo, logo abaixo) quanto ao SAIR (nenhum dos dois deve
    // continuar ativo fora de _fotoCamMode/_orbCamMode).
    this._engine?.clearPickExclude?.();
    this._engine?.clearHoverScreenPoint?.();
    const canvas = this._container?.querySelector('#v3d-canvas');
    if (canvas) canvas.style.cursor = '';
  },

  _enterFotoCameraView(fotoId) {
    const foto = (this._map?.fotos || []).find((f) => f.id === fotoId);
    if (!foto) return;
    if (this._camMode) this._exitCameraView(); // nunca os dois modos ativos ao mesmo tempo
    document.exitPointerLock?.();
    this._resetCamZoom();
    // [10/09/2026] `calibFov`/`zoomFov` NOVOS — ver onWheel (zoom de
    // verdade via FOV, não mais CSS scale) e _updateFotoCamOverlayZoomScale
    // acima. `zoomFov` começa igual a `calibFov` (sem zoom nenhum ainda);
    // a roda do mouse só reatribui `zoomFov` — `calibFov` nunca muda
    // enquanto este modo estiver ativo, é a referência "0% de zoom".
    const calibFovFoto = this._fotoCamFovFor(foto);
    // [18/09/2026] REMOVIDO `calibResX`/`calibResY` (congelavam a
    // Resolução no instante da entrada — pedido de 15/09/2026, ver
    // comentário grande em `_activeCamFrameAspect`) — a caixa/canvas da
    // foto voltou a ler `camProps.resolutionX/Y` AO VIVO, igual à malha 3D
    // do retângulo amarelo de verdade, pra "Esticar"/"Caber"/"Cortar"
    // sempre cobrirem o retângulo amarelo ATUAL, em qualquer resolução.
    this._fotoCamMode = { fotoId, calibFov: calibFovFoto, zoomFov: calibFovFoto };
    // [12/09/2026 — RODADA "certifique-se que só quando a imagem for
    // pintada"] NOVO — pedido verbatim: "Logo que clica em 'Ver através
    // desta câmera', o retângulo magenta ainda está aparecendo.
    // Certifique-se que após clicar [...], só quando a imagem for pintada
    // é que tudo deve acontecer." CAUSA: `this._fotoCamBackdropMesh`
    // (o oclusor da cor-marcadora) é um objeto 3D PERSISTENTE — reutilizado
    // entre sessões de "Ver através desta câmera" (ver
    // `_ensureFotoCamBackdropPlane`) — então, bem no instante de entrar
    // aqui, ele pode ainda estar com `visible=true`/máscara antiga de uma
    // sessão ANTERIOR (outra câmera/foto), e qualquer render que aconteça
    // antes do primeiro quadro do loop principal terminar de montar a
    // máscara NOVA (ver `_fotoCamBackdropReady` abaixo) pintaria esse
    // resquício cru, sem buraco — a "piscada". CORRIGIDO: reseta tudo pra
    // "escondido"/"não pronto" JÁ AQUI, de forma SÍNCRONA, antes de
    // qualquer render acontecer — `_fotoCamBackdropReady` (novo — ver
    // `_renderFotoCamOverlay`/o `onload` da imagem, e o chamador de
    // `_updateFotoCamBackdropPlane` dentro de `_loop`) só vira `true`
    // depois que a foto REALMENTE decodificou e foi desenhada no canvas
    // (`_drawFotoCamPhoto`, disparado pelo `onload` da `Image()` nova
    // criada por `_renderFotoCamOverlay`, chamada logo abaixo) — só a
    // partir daí o oclusor pode voltar a ficar visível.
    if (this._fotoCamBackdropMesh) this._fotoCamBackdropMesh.visible = false;
    this._engine?.clearFotoCamBackdropMask?.();
    this._engine?.setFotoCamBackdropMaskActive?.(false);
    this._fotoCamBackdropReady = false;
    // [10/09/2026] NOVO — pedido verbatim: "logo que entra nesse modo de
    // 'ver através da câmera', o clique está pegando a própria câmera. O
    // clique nela mesma deve ser desativado". Sem isto, o próprio orb de
    // foto/"Câmera" (ainda visível no cenário mesmo estando "dentro" dele
    // renderizando, ver setFotoMeshVisible(fotoId,false) logo abaixo —
    // isso só esconde a malha 3D, não o pickable, que é um objeto à parte)
    // sempre "ganhava" da mira/clique por estar bem na frente da câmera de
    // render. Desligado em _resetCamZoom (chamada ao SAIR, logo acima).
    this._engine?.setPickExclude?.('fotoPin', fotoId);
    // [12/09/2026] NOVO — item "voltar ao ponto de vista original do
    // personagem" (ver _cameraExitViewMode acima): guarda a pose LIVRE
    // exata de `this._camera` NESTE instante, ANTES de qualquer coisa
    // mexer nela (autopilot incluso, ver `_updateAutopilot`/`_playerWalking`
    // logo abaixo) — restaurada em `_exitFotoCameraView` se a config estiver
    // em `'originalView'`. MESMO padrão de `_orbCamSavedPose` em
    // `_enterCameraOrbView`.
    this._fotoCamSavedPose = { x: this._camera.x, y: this._camera.y, z: this._camera.z, yaw: this._camera.yaw, pitch: this._camera.pitch };
    // [12/09/2026 — ITEM A] captura o FOV do personagem ANTES de aplicar o
    // FOV calibrado da foto logo abaixo (`setFov(calibFovFoto)`) — ver
    // comentário grande em `this._fotoCamSavedFov` (mount()). Restaurado
    // SEMPRE em `_exitFotoCameraView`, independente da opção "Sair da
    // câmera" escolhida.
    this._fotoCamSavedFov = this._engine?.camera3?.fov ?? this._CAM_VIEW_DEFAULT_FOV;
    this._autopilotTarget = null; // mesmo motivo de _enterCameraView acima
    this._playerWalking = false;
    this._engine?.setPlayerFigureVisible?.(true); // mesmo comportamento de _enterCameraView: o jogador vira o boneco palito visto de fora
    this._engine?.setFov?.(calibFovFoto);
    // [12/09/2026] NOVO — mesmo bug do cone "na frente da câmera" já
    // corrigido pro orb de câmera (ver engine3d.js
    // setCameraMeshVisible/_cameraMeshesById): o olho de render fica bem no
    // ponto deste orb de foto, então a malha esfera+cone(+placa) DELE
    // PRÓPRIO precisa ficar invisível enquanto "vendo através" dele.
    // Restaurada em `_exitFotoCameraView`.
    this._engine?.setFotoMeshVisible?.(fotoId, false);
    // [15/09/2026] NOVO — pedido verbatim: "coloque duas opções para o
    // corte da câmera [...] Uma seção chamada 'Corte', botão para 'Início',
    // por padrão, 0.1. E botão para 'Fim', por padrão, 100." Mesmo padrão
    // já usado pelo orb "Câmeras" (`_enterCameraOrbView`, ver
    // `cam.clipStartM/clipEndM`) — aqui faltava por completo pro "orb de
    // foto"/"Câmera". `?? 0.1`/`?? 100` cobrem fotos ainda sem
    // `clipStartM/clipEndM` salvo (mesmo default do novo campo "Corte").
    this._engine?.setClipPlanes?.(foto.camProps?.clipStartM ?? 0.1, foto.camProps?.clipEndM ?? 100);
    this._renderFotoCamOverlay(foto);
    this._renderHotbar();
  },

  _exitFotoCameraView() {
    this._exitModeladorSeAtivo(); // [13/09/2026] pilha de "Sair" — ver comentário grande em _exitCameraView
    // [12/09/2026] captura tudo que precisa do `_fotoCamMode`/foto ANTES de
    // zerá-lo (mesmo cuidado de `_exitCameraOrbView`, comentário grande lá):
    // `_computeFotoCamPose()` lê `this._fotoCamMode` internamente, e
    // `fotoIdSaindo` precisa sobreviver pra restaurar a malha certa.
    const fotoIdSaindo = this._fotoCamMode?.fotoId;
    // [11/09/2026] CORRIGIDO (na época) — pedido verbatim: "Ao 'Sair da
    // câmera', o enquadramento ainda fica ativado." O "retângulo amarelo"
    // desligava aqui, incondicionalmente, ao sair de "Ver através desta
    // câmera".
    // [15/09/2026] REVERTIDO — pedido verbatim: "No 'Ver em 3D', deixe,
    // pelo momento, o enquadramento (retângulo amarelo) de todas as
    // câmeras sempre ativo." A chamada `setCameraFrustumVisible(...,
    // false)` foi removida — o retângulo amarelo agora fica visível o
    // tempo todo dentro de "Ver em 3D", inclusive depois de "Sair da
    // câmera" e navegando livremente. `fotoIdSaindo` continua capturado
    // acima (usado por outro trecho deste método).
    // [10/09/2026] capturado ANTES de `this._fotoCamMode = null;` logo
    // abaixo — mesma correção feita em `_exitCameraOrbView` (ver comentário
    // grande lá): "a perspectiva que o personagem tinha deve ser
    // preservada" vale pro zoom "de verdade" (FOV, ver onWheel) também, não
    // só posição/orientação.
    const zoomFovSaindo = this._fotoCamMode?.zoomFov;
    this._resetCamZoom(); // [10/09/2026] — ver comentário grande em _resetCamZoom
    const foto = (this._map?.fotos || []).find((f) => f.id === fotoIdSaindo);
    // [12/09/2026, CORRIGIDO em 12/09/2026] usava `_cameraExitViewMode()`
    // por engano quando ainda havia 2 chaves separadas — desde a fusão de
    // 12/09/2026 é a MESMA chave única (`cameraExitViewMode`), e desde
    // 15/09/2026 UTC chama direto (o wrapper `_fotoOrbExitViewMode()` foi
    // removido — pedido verbatim: "Remova todas as referências de
    // duplicidade [...] Não considere compatibilidade com código legado").
    const modo = this._cameraExitViewMode();
    // [12/09/2026] item "a perspectiva que o personagem tinha [...] deve ser
    // preservada" — 2 opções configuráveis (ver _cameraExitViewMode acima):
    // `'lockedView'` (padrão, MESMA ideia já aplicada ao orb de câmera) —
    // teleporta `this._camera` pra pose EXATA que estava sendo renderizada
    // (`_computeFotoCamPose()`) — antes desta rodada a saída simplesmente
    // não tocava `this._camera`, deixando-o onde quer que o passeio
    // automático de fundo (`_updateAutopilot`, que roda o tempo todo
    // enquanto `_fotoCamMode` está ativo) tivesse levado o personagem
    // nesse meio-tempo — um comportamento nem "fica na câmera" nem "volta
    // pro original", só "onde o autopilot deixou". `'originalView'` —
    // restaura `_fotoCamSavedPose` (capturado em `_enterFotoCameraView`,
    // ANTES do autopilot rodar).
    const lockedPose = foto ? this._computeFotoCamPose() : null;
    const savedPose = this._fotoCamSavedPose;
    this._fotoCamMode = null;
    // [12/09/2026 — RODADA "certifique-se que só quando a imagem for
    // pintada"] NOVO — limpa junto com o resto do estado do backdrop
    // 'Trás' ao sair (ver reset simétrico em `_enterFotoCameraView`) —
    // evita que uma entrada FUTURA comece por acaso com `_fotoCamBackdropReady`
    // ainda `true` de uma sessão anterior antes do próprio reset de entrada
    // rodar (defesa extra, redundante com aquele reset, sem custo).
    this._fotoCamBackdropReady = false;
    if (this._fotoCamBackdropMesh) this._fotoCamBackdropMesh.visible = false;
    if (modo === 'originalView' && savedPose) {
      this._camera.x = savedPose.x; this._camera.y = savedPose.y; this._camera.z = savedPose.z;
      this._camera.yaw = savedPose.yaw; this._camera.pitch = savedPose.pitch;
    } else if (lockedPose) {
      this._camera.x = lockedPose.x; this._camera.y = lockedPose.y; this._camera.z = lockedPose.z;
      this._camera.yaw = lockedPose.yaw; this._camera.pitch = lockedPose.pitch;
    } else if (savedPose) {
      // Rede de segurança (foto apagada nesse meio-tempo, sem pose travada
      // pra copiar) — mesmo padrão de _exitCameraOrbView.
      this._camera.x = savedPose.x; this._camera.y = savedPose.y; this._camera.z = savedPose.z;
      this._camera.yaw = savedPose.yaw; this._camera.pitch = savedPose.pitch;
    }
    this._fotoCamSavedPose = null;
    this._engine?.setPlayerFigureVisible?.(false);
    // [12/09/2026 — ITEM A, CORRIGIDO] pedido verbatim: o FOV do personagem
    // deve SEMPRE voltar ao que era ANTES de "Ver através desta câmera",
    // mesmo com "Permanece com o ponto de vista da câmera" marcada (posição/
    // orientação seguem `modo` acima, mas o FOV NUNCA deve ficar sendo o FOV
    // calibrado da foto). Antes desta correção, 'lockedView' mantinha
    // `zoomFovSaindo`/o FOV calibrado da foto — agora usa sempre
    // `this._fotoCamSavedFov` (capturado em `_enterFotoCameraView`, ANTES de
    // aplicar o FOV calibrado), independente de `modo`. `zoomFovSaindo`
    // continua capturado acima só por não ter mais nenhum uso aqui removido
    // sem necessidade (documentação/rastreabilidade do zoom que estava
    // ativo no instante da saída).
    const fovSaindo = (this._fotoCamSavedFov != null) ? this._fotoCamSavedFov : this._CAM_VIEW_DEFAULT_FOV;
    this._engine?.setFov?.(fovSaindo);
    this._fotoCamSavedFov = null;
    this._engine?.setFotoMeshVisible?.(fotoIdSaindo, true); // [12/09/2026] restaura a visibilidade da malha deste orb de foto (ver _enterFotoCameraView)
    // [15/09/2026] NOVO — mesmo padrão de `_exitCameraOrbView`
    // (`clearClipPlanes()` abaixo): desliga o override de near/far
    // aplicado em `_enterFotoCameraView`/a cada edição de "Corte" (ver
    // `_activeCamPropsEditTarget`), senão ficaria vazando pro resto da
    // cena 3D fora do modo "Ver através desta câmera".
    this._engine?.clearClipPlanes?.();
    this._removeFotoCamOverlay();
    this._renderHotbar();
  },

  /** Pose de onde renderizar enquanto "vendo através" do orb de foto —
   *  MESMA convenção de posição/altura/ângulo já usada pra desenhar a
   *  setinha/placa da foto no 3D (ver engine3d.js setScene, bloco "fotos
   *  vinculadas ao mapa": baseY = piso*2.8+altura, yaw=dirAngulo,
   *  pitch=rotPerp) — assim a perspectiva bate exatamente com o que o
   *  cone/placa mostram no mapa.
   *
   *  [11/09/2026] VERIFICADO — pedido: conferir se o "retângulo amarelo"
   *  (engine3d.js, bloco logo depois do cone/placa, `_fotoFrustumMeshesById`)
   *  usa a MESMA referência de ponto médio/linha até o infinito que o plano
   *  da foto ('Trás', `_updateFotoCamBackdropPlane`) e o `<img>` ('Frente')
   *  passaram a usar. Resultado: SIM, os três batem — o retângulo amarelo
   *  usa `origemFr = (foto.x, baseY, foto.y)` + `dirVec = cameraForward({
   *  yaw:foto.dirAngulo, pitch:foto.rotPerp})` (linha por linha igual à
   *  fórmula acima) pra achar o centro do quadro (`centroFr = origemFr +
   *  dirVec*1m`); esta função devolve exatamente `{x:foto.x, y:baseY,
   *  z:foto.y, yaw:foto.dirAngulo, pitch:foto.rotPerp}`, e é ESTE valor —
   *  sem nenhuma suavização/interpolação nem em `_loop` (o `if
   *  (this._camTransition...)` logo abaixo explicitamente pula a
   *  interpolação quando `_fotoCamMode` está ativo) — que vira `renderCam`
   *  e alimenta `Cam3DMath.cameraForward(renderCam)` em
   *  `_updateFotoCamBackdropPlane`. Origem e direção são, portanto, os
   *  MESMOS valores em ambos os lugares — o retângulo amarelo e a foto
   *  ficam matematicamente garantidos na MESMA reta (mesmo ponto médio,
   *  mesma linha até o infinito), sem nenhuma divergência de código
   *  encontrada. Se ainda assim aparecer desalinhado na tela, a causa mais
   *  provável não é este cálculo — é `Offset X`/`Offset Y` do painel
   *  "🖼️ Imagem" (um deslocamento intencional da foto, em metros, que o
   *  retângulo amarelo nunca aplica — ele é sempre centrado, sem offset
   *  próprio) ainda configurado de um teste anterior; zere os dois campos
   *  pra conferir o alinhamento "puro". */
  // [22/09/2026 — RODADA SEGUINTE] `yaw` CORRIGIDO — pedido verbatim do
  // usuário: "No mapa 2D, ao colocar um objeto câmera sua seta aponta para
  // o norte. O mapa 3D está com o norte apontando para o sul [...] Deve
  // girar 180 graus". A CAUSA RAIZ (ver comentário grande de
  // `objectPointerForward`, engine3d.js) é uma inversão de sinal no
  // componente Z entre `cameraForward(yaw)` (convenção de VISÃO do
  // personagem) e o vetor de apontamento de um OBJETO câmera/orb de foto
  // (convenção do mapa 2D) — o cone/seta 3D do objeto (engine3d.js
  // `setScene`) foi corrigido pra usar `objectPointerForward(dirAngulo,
  // pitch)` em vez de `cameraForward({yaw:dirAngulo,...})` direto. Esta
  // função, porém, não pode simplesmente chamar `objectPointerForward` —
  // ela devolve um `yaw` de CÂMERA DE VISÃO (consumido por
  // `Cam3DMath.cameraForward(renderCam)` dentro de `Engine3D.render`, ver
  // `camera3.lookAt`), não um vetor de direção pronto — precisa do YAW
  // EQUIVALENTE que faz `cameraForward(yaw,pitch)` produzir o MESMO vetor
  // que `objectPointerForward(dirAngulo,pitch)` dá, senão "Ver através
  // desta câmera" (e o eixo óptico do plano do backdrop 'Trás', ver
  // `_updateFotoCamBackdropPlane` mais abaixo, que usa `renderCam` desta
  // função) deixaria de bater com o cone/retângulo amarelo.
  //
  // ÁLGEBRA (conferida): `cameraForward(yaw,pitch) = (-cos(pitch)sin(yaw),
  // -sin(pitch), cos(pitch)cos(yaw))`. `objectPointerForward(dirAngulo,
  // pitch) = (-cos(pitch)sin(dirAngulo), -sin(pitch),
  // -cos(pitch)cos(dirAngulo))` (mesma fórmula, só com Z negado). Precisa-se
  // de um `yaw'` tal que `cameraForward(yaw',pitch)` bata com o segundo
  // vetor, mantendo o MESMO `pitch` (o componente Y/vertical já bate
  // igual, `-sin(pitch)`, não depende de yaw): `sin(yaw')=sin(dirAngulo)`
  // E `cos(yaw')=-cos(dirAngulo)` simultaneamente — a ÚNICA solução é
  // `yaw' = π − dirAngulo` (não é uma simples soma de +π, que resolveria
  // só o cosseno e trocaria o sinal do seno também — verificado: `sin(π−a)
  // = sin(a)` ✓, `cos(π−a) = −cos(a)` ✓, as DUAS batem exatamente).
  _computeFotoCamPose() {
    const cfg = this._fotoCamMode;
    const foto = (this._map?.fotos || []).find((f) => f.id === cfg?.fotoId);
    if (!foto) return this._camera;
    const baseY = (foto.piso || 0) * (this._map?.alturaPiso || 2.8) + (foto.altura || 0);
    // [10/09/2026] CORRIGIDO — `_camViewPanOffset` NÃO É MAIS somado à
    // posição aqui (deslocar a posição real muda a perspectiva de
    // verdade — pedido explícito do usuário foi o oposto: "a perspectiva
    // deve ser preservada"). A pose calibrada da foto continua 100%
    // intocada; o pan agora é um deslocamento de "lente"/janela de
    // projeção aplicado à parte em `camera3` — ver `Engine3D.setCamPanFrac`
    // chamado em `_loop`, logo antes de `this._engine.render(renderCam)`.
    // [15/09/2026 UTC] Sinal de dirAngulo invertido, mesma convencao (horario) usada nos
    // demais pontos: 'Ver atraves desta camera' deve manter a mesma direcao do cone/seta.
    return { x: foto.x, y: baseY, z: foto.y, yaw: Math.PI + (foto.dirAngulo || 0), pitch: foto.rotPerp || 0 };
  },

  /** FOV vertical (graus, mesma unidade de Engine3D.setFov/_CAM_VIEW_
   *  DEFAULT_FOV) a usar ao entrar na câmera desta foto — usa
   *  `horizontalFieldOfView` do JSON exportado pelo vanishCam (mesmo
   *  formato do fSpy: radianos), convertido pra vertical usando a
   *  PROPORÇÃO DA IMAGEM ORIGINAL (imageWidth/imageHeight, também salvos
   *  nesse JSON — ver vanishCam js/project-io.js exportCameraJSON), não a
   *  da tela — a foto pode ter proporção diferente do canvas do app.
   *  Sem JSON do vanishCam (só rotações manuais definidas), cai no FOV
   *  padrão do modo câmera (mesmo de _enterCameraView). */
  _fotoCamFovFor(foto) {
    const vc = foto.vanishCam;
    const h = vc?.horizontalFieldOfView;
    if (typeof h === 'number' && isFinite(h) && h > 0) {
      const aspect = (vc.imageWidth && vc.imageHeight) ? vc.imageWidth / vc.imageHeight : (4 / 3);
      const vFov = 2 * Math.atan(Math.tan(h / 2) / aspect);
      const graus = vFov * 180 / Math.PI;
      return Math.max(this._CAM_VIEW_FOV_MIN, Math.min(this._CAM_VIEW_FOV_MAX, graus));
    }
    return this._CAM_VIEW_DEFAULT_FOV;
  },

  /** Lê a opacidade salva (padrão 0.15 — [10/09/2026] pedido verbatim: "A
   *  opacidade padrão, agora, deve ser de 15%." Era 0.5 antes desta rodada)
   *  — cache em memória pra não reler localStorage a cada quadro (o slider
   *  é o único jeito de mudar, então o cache nunca fica desatualizado
   *  dentro da mesma sessão de navegador). */
  _getFotoCamOpacidade() {
    if (this._fotoCamOpacidadeCache != null) return this._fotoCamOpacidadeCache;
    let v = 0.15;
    try {
      const raw = localStorage.getItem(this._LS_KEY_FOTOCAM_OPACIDADE);
      if (raw != null) { const n = parseFloat(raw); if (isFinite(n) && n >= 0 && n <= 1) v = n; }
    } catch (e) { /* localStorage indisponível (ex.: modo privado) — usa o padrão 0.15 */ }
    this._fotoCamOpacidadeCache = v;
    return v;
  },

  _setFotoCamOpacidade(v) {
    this._fotoCamOpacidadeCache = v;
    try { localStorage.setItem(this._LS_KEY_FOTOCAM_OPACIDADE, String(v)); } catch (e) { /* ignora — só perde a persistência entre recarregamentos */ }
  },

  // [11/09/2026] NOVO — pedido verbatim: "Deve ter outra opção, ao lado de
  // 'Enquadramento' chamada 'Escurecer ao entorno' (ativado por padrão). E
  // outra opção 'Escurecer imagem' (ao clicar, a imagem é escurecida para
  // facilitar a visualização)." MESMO padrão de persistência (localStorage +
  // cache em memória) de `_getFotoCamOpacidade`, acima — GLOBAL (não por
  // câmera), igual a opacidade.
  _LS_KEY_FOTOCAM_ESCURECER_ENTORNO: 'catalogo_camview_escurecer_entorno',
  _LS_KEY_FOTOCAM_ESCURECER_IMAGEM: 'catalogo_camview_escurecer_imagem',
  _getEscurecerEntornoAtivo() {
    if (this._escurecerEntornoCache != null) return this._escurecerEntornoCache;
    let v = true; // "ativado por padrão"
    try {
      const raw = localStorage.getItem(this._LS_KEY_FOTOCAM_ESCURECER_ENTORNO);
      if (raw != null) v = raw === '1';
    } catch (e) { /* usa o padrão */ }
    this._escurecerEntornoCache = v;
    return v;
  },
  _setEscurecerEntornoAtivo(v) {
    this._escurecerEntornoCache = !!v;
    try { localStorage.setItem(this._LS_KEY_FOTOCAM_ESCURECER_ENTORNO, v ? '1' : '0'); } catch (e) { /* ignora */ }
  },
  // [11/09/2026] NOVO — pedido verbatim: "Lado abaixo deste botão, deve
  // ter um botão triplo para definir o valor da opacidade do preto
  // aplicado pelo botão 'Escurecer o entorno'. Por padrão é 0.5." Mesmo
  // padrão de persistência (localStorage + cache em memória) dos outros
  // 2 acima — o valor salvo em CSS (`.v3d-fotocam-vignette`, style.css)
  // era um `box-shadow` FIXO (`rgba(0,0,0,.6)`, alfa 0.6 fixo) — agora só
  // a estrutura/espalhamento (`0 0 0 2000px`) fica em CSS; o ALFA vira
  // inline (`vignetteEl.style.boxShadow`, ver `aplicarVignette`/wiring do
  // campo triplo abaixo), sempre lido daqui.
  _LS_KEY_FOTOCAM_ESCURECER_ENTORNO_OPACIDADE: 'catalogo_camview_escurecer_entorno_opacidade',
  _getEscurecerEntornoOpacidade() {
    if (this._escurecerEntornoOpacidadeCache != null) return this._escurecerEntornoOpacidadeCache;
    let v = 0.5; // "Por padrão é 0.5"
    try {
      const raw = localStorage.getItem(this._LS_KEY_FOTOCAM_ESCURECER_ENTORNO_OPACIDADE);
      if (raw != null) { const n = parseFloat(raw); if (isFinite(n)) v = Math.max(0, Math.min(1, n)); }
    } catch (e) { /* usa o padrão */ }
    this._escurecerEntornoOpacidadeCache = v;
    return v;
  },
  _setEscurecerEntornoOpacidade(v) {
    const clamped = Math.max(0, Math.min(1, v));
    this._escurecerEntornoOpacidadeCache = clamped;
    try { localStorage.setItem(this._LS_KEY_FOTOCAM_ESCURECER_ENTORNO_OPACIDADE, String(clamped)); } catch (e) { /* ignora */ }
    return clamped;
  },
  _getEscurecerImagemAtivo() {
    if (this._escurecerImagemCache != null) return this._escurecerImagemCache;
    let v = false; // pedido: "ao CLICAR, a imagem é escurecida" — desligado até o usuário pedir
    try {
      const raw = localStorage.getItem(this._LS_KEY_FOTOCAM_ESCURECER_IMAGEM);
      if (raw != null) v = raw === '1';
    } catch (e) { /* usa o padrão */ }
    this._escurecerImagemCache = v;
    return v;
  },
  _setEscurecerImagemAtivo(v) {
    this._escurecerImagemCache = !!v;
    try { localStorage.setItem(this._LS_KEY_FOTOCAM_ESCURECER_IMAGEM, v ? '1' : '0'); } catch (e) { /* ignora */ }
  },

  // [10/09/2026, REMOVIDO na mesma rodada] a preferência GLOBAL do gizmo
  // "🟨 Enquadramento" (localStorage, `_getFrustumGizmoPref`/
  // `_toggleFrustumGizmos`) foi substituída por um botão POR CÂMERA — ver
  // `#v3d-fotocam-frustum-toggle` em `_renderFotoCamOverlay` (usa
  // `Engine3D.setCameraFrustumVisible(fotoId, visible)`/`isCameraFrustumVisible`/
  // `hasCameraFrustum`, engine3d.js) — pedido verbatim: "O botão de
  // enquadramento deve ser só para a câmera atual, deve aparecer junto na
  // barra em baixo (onde tem o botão 'Sair da câmera')."

  /** Overlay HTML (imagem semitransparente "na frente" do 3D renderizado +
   *  controles) — pedido verbatim acima. Um `<img>` simples cobrindo o
   *  canvas (não uma textura 3D) já resolve o pedido ("aparece transparente
   *  na frente") sem precisar mexer em engine3d.js.
   *  [10/09/2026] GENERALIZADO — pedido verbatim: "O vanishCam será útil
   *  para isso [o novo 'orb de câmera']." Recebe agora um 2º parâmetro
   *  opcional `onExit` (o botão "✖ Sair da câmera" chama ele em vez de
   *  `_exitFotoCameraView` fixo) — assim `_enterCameraOrbView` (mais abaixo)
   *  reaproveita este MESMO overlay/painel de opacidade/JSON do vanishCam
   *  sem duplicar HTML/lógica nenhuma, só trocando pra onde o "Sair" volta.
   *  `foto` só precisa ter `.id` (id da AmbientePhoto de verdade, pra
   *  salvar o JSON)/`.dataUrl`/`.thumbDataUrl`/`.vanishCam` — mesmo shape
   *  usado por `this._map.fotos` (orbs de foto) OU montado na hora a partir
   *  de `DB.getAmbientePhoto(cam.fotoId)` (câmeras "Câmeras" com foto
   *  associada, ver _enterCameraOrbView). */
  _renderFotoCamOverlay(foto, onExit) {
    this._removeFotoCamOverlay();
    if (!this._container) return;
    const sair = onExit || (() => this._exitFotoCameraView());
    const imgSrc = foto.dataUrl || foto.thumbDataUrl || '';
    const opacidade = this._getFotoCamOpacidade();
    // [16/09/2026 — RODADA SEGUINTE] NOVO — `this._fotoCamImgEl` substitui
    // o antigo `<img id="v3d-fotocam-overlay-img">` DOM: agora é só um
    // `Image()` em memória (nunca anexado ao DOM), fonte de pixels pra
    // `ctx.drawImage` — ver `_drawFotoCamPhoto`. `onload` redesenha o
    // `<canvas>` de overlay (a imagem pode ainda não ter decodificado no 1º
    // desenho, feito logo abaixo desta função, antes do `load` disparar).
    // [19/09/2026 — RODADA SEGUINTE] REMOVIDO — chamava também
    // `_redrawFotoCamBackdropCanvas()` (redesenhava a textura off-screen do
    // plano 3D do backdrop 'Trás', REMOVIDO nesta rodada) — só
    // `_updateFotoCamOverlayZoomScale()` é necessária agora, nos 2 modos.
    const imgEl = new Image();
    this._fotoCamImgEl = imgEl;
    if (imgSrc) {
      imgEl.onload = () => {
        this._updateFotoCamOverlayZoomScale();
        // [12/09/2026 — RODADA "certifique-se que só quando a imagem for
        // pintada"] NOVO — só marca "pronto" (libera o oclusor do backdrop
        // 'Trás', ver `_enterFotoCameraView`/o chamador de
        // `_updateFotoCamBackdropPlane` em `_loop`) DEPOIS que esta
        // `Image()` REALMENTE decodificou e `_updateFotoCamOverlayZoomScale`
        // já desenhou ela no canvas (linha acima) — nunca antes. Guarda
        // `imgEl === this._fotoCamImgEl` porque, se a pessoa trocar de
        // câmera/foto rápido o suficiente, este `onload` de uma imagem JÁ
        // ABANDONADA pode disparar depois de uma mais nova já ter assumido
        // `this._fotoCamImgEl` — sem essa checagem, marcaria "pronto" pra
        // sessão ERRADA.
        if (imgEl === this._fotoCamImgEl) this._fotoCamBackdropReady = true;
      };
      imgEl.src = imgSrc;
    }
    // [10/09/2026] NOVO — pedido verbatim (correção do botão global
    // anterior): "O botão de enquadramento deve ser só para a câmera
    // atual, deve aparecer junto na barra em baixo (onde tem o botão
    // 'Sair da câmera')." Só existe gizmo de enquadramento (retângulo
    // amarelo) pra `map.fotos[]` de verdade (ver
    // Engine3D._fotoFrustumMeshesById/hasCameraFrustum, engine3d.js) —
    // `_orbCamMode` sem foto vinculada, ou com uma foto vinculada cujo
    // `.id` não bate com nenhum orb do mapa (o caso comum: o `foto` aqui
    // vem de `DB.getAmbientePhoto(cam.fotoId)`, um registro do BANCO, não
    // um orb do MAPA — ver `_renderCameraOrbOverlay`), não têm gizmo
    // nenhum pra ligar/desligar — o botão simplesmente não aparece nesse
    // caso, em vez de existir sem fazer nada.
    const temFrustum = !!this._engine?.hasCameraFrustum?.(foto.id);
    // [11/09/2026] NOVO — pedido verbatim: "Nas 'configurações 3D', na seção
    // 'debug', coloque mais uma opção na lista de ativações deste modo que é
    // o 'Enquadramento de câmera'. Ativo, por padrão." Antes desta correção,
    // o estado inicial do gizmo era só "o que sobrou" de uma entrada
    // anterior nesta MESMA sessão do app (`_frustumGizmosEnabled`/toggle por
    // câmera, nunca resetado) — agora toda vez que se entra em "Ver através
    // desta câmera" o gizmo nasce explicitamente no estado configurado em
    // ⚙️ Configurações › 🐞 Debug (ligado por padrão), não importa o que
    // aconteceu antes. O botão "🟨 Enquadramento" continua deixando
    // ligar/desligar manualmente DENTRO desta sessão de visualização.
    // [15/09/2026] o gizmo passou a entrar SEMPRE ligado (temporário, "pelo
    // momento": "No 'Ver em 3D', deixe, pelo momento, o enquadramento
    // (retângulo amarelo) de todas as câmeras sempre ativo").
    // [12/09/2026, RODADA SEGUINTE] REVERTIDO — pedido verbatim: "Desabilite
    // a impressão do amarrado amarelo de todas as câmeras. Era só para
    // testes." Volta a ler a preferência de
    // `_isDebugEnquadramentoCameraAtivo()` (⚙️ Configurações › 🐞 Debug,
    // agora também atrás do interruptor mestre `_isDebugAtivo()`), em vez de
    // entrar sempre ligado. O botão "🟨 Enquadramento" (logo abaixo) continua
    // deixando ligar/desligar manualmente durante a sessão.
    if (temFrustum) this._engine.setCameraFrustumVisible(foto.id, this._isDebugEnquadramentoCameraAtivo());
    const wrap = document.createElement('div');
    wrap.className = 'v3d-fotocam-overlay';
    wrap.id = 'v3d-fotocam-overlay';
    wrap.innerHTML = `
      <!-- [16/09/2026 — RODADA SEGUINTE] SUBSTITUÍDO -- pedido verbatim:
           "Remova o retangulo amarelo feito por CSS. E so uma ordem de
           impressao no canvas, pegue uma imagem e use o drawImage do
           canvas antes ou depois de todos os objetos no cenario." O antigo
           par de divs (".v3d-fotocam-clip" com overflow:hidden envolvendo
           um <img> posicionado/transformado via CSS) MAIS a copia DOM
           separada do retangulo amarelo (".v3d-fotocam-frame", que so
           existia pra "furar" o z-index do <img> e aparecer por cima dele)
           foram substituidos por um UNICO <canvas>: a foto e desenhada
           nele via ctx.drawImage (2D puro -- translate/rotate/scale, sem
           nenhum object-fit/transform CSS) e o retangulo amarelo e
           desenhado por cima dela, na MESMA chamada, com ctx.strokeRect,
           como ULTIMA operacao de desenho -- ordem de impressao no canvas,
           nao mais camadas de z-index. Ver _updateFotoCamOverlayZoomScale/
           _drawFotoCamPhoto em view3d.js. O canvas nativamente recorta
           qualquer desenho fora dos seus limites (nao precisa mais de
           overflow:hidden num div pai). SEM CRASE nestas linhas de
           proposito -- risco documentado de crase dentro de comentario
           HTML dentro de template literal. -->
      <!-- [12/09/2026 — RODADA "buffer de verdade"] #v3d-fotocam-photo-canvas
           NAO fica mais aninhado aqui dentro -- pedido verbatim: "Use a
           mesma coisa de 'Frente' em 'Tras'. E use o depth buffer para
           imprimir os objetos na tela." Ele precisa poder ficar empilhado
           (via CSS z-index) tanto ACIMA quanto ABAIXO de #v3d-canvas
           dependendo do modo 'Frente'/'Tras' -- impossivel enquanto era
           descendente deste wrap (.v3d-fotocam-overlay, z-index:30 fixo,
           sempre acima do canvas WebGL). Criado/anexado logo abaixo, como
           IRMAO de #v3d-canvas dentro de #v3d-camzoom-wrap -- ver o
           trecho logo apos este template literal e
           _updateFotoCamOverlayZoomScale (quem alterna o z-index). SEM
           CRASE nestas linhas de proposito -- risco documentado de crase
           dentro de comentario HTML dentro de template literal. -->
      <!-- [12/09/2026 — RODADA "mesma imagem"] NOVO — canvas SEPARADO só
           pro retangulo amarelo/guia (+ gizmo do Modelador colado por cima,
           ver metodo _compositeGizmoOverlayOntoPhotoCanvas) — sempre num
           z-index fixo (30, deste wrap), por cima de TUDO nos 2 modos.
           Tamanho SEMPRE igual ao quadro calibrado (nunca cresce pra
           caixa de cobertura do 'Cortar' — so o canvas da foto cresce).
           SEM CRASE nestas linhas de proposito -- risco documentado de
           crase dentro de comentario HTML dentro de template literal. -->
      <canvas class="v3d-fotocam-frame-canvas" id="v3d-fotocam-frame-canvas"></canvas>
      <!-- [11/09/2026] NOVO — "Escurecer ao entorno" (pedido verbatim,
           abaixo): escurece tudo FORA do retângulo amarelo, via o truque de
           box-shadow com espalhamento gigante (0 0 0 2000px rgba(...))
           num div do exato tamanho/posição do quadro calibrado
           (_activeCamFrameRectPx, atualizado junto com o resto em
           _updateFotoCamOverlayZoomScale) — a "sombra" preenche todo o
           resto da tela ao redor dele sem precisar de 4 retângulos
           manuais. pointer-events:none — nunca rouba clique/arrasto.
           SEM CRASE nestas linhas de proposito -- risco documentado de
           crase dentro de comentario HTML dentro de template literal. -->
      <div class="v3d-fotocam-vignette hidden" id="v3d-fotocam-vignette"></div>
      <!-- [15/09/2026] CORRIGIDO -- pedido verbatim (Parte B): "O botão
           'Sair da câmera' deve ficar acima e no centro do canvas logo
           abaixo de região onde aparece a mensagem 'Clique para interagir
           com o cenário 3D'." Antes vivia dentro da barra
           .v3d-fotocam-overlay-controls (rodapé, junto com todos os outros
           botões -- Enquadramento/Escurecer o entorno/Escurecer imagem/
           Imagem/Propriedades/Informações -- todos removidos daqui nesta
           rodada e realocados pra aba lateral direita "Propriedades", ver
           _renderPropriedadesPanel logo abaixo). CSS nova
           .v3d-fotocam-sair-topcenter (style.css) posiciona no topo/
           centro, logo abaixo de .v3d-lockstate-hint. -->
      <button type="button" class="btn secondary sm v3d-fotocam-sair-topcenter" id="v3d-fotocam-sair" title="Sair da visão desta câmera">✖ Sair da câmera</button>
      <div class="v3d-fotocam-info-panel hidden" id="v3d-fotocam-info-panel">
        <textarea id="v3d-fotocam-info-json" spellcheck="false">${foto.vanishCam ? Utils.escapeHtml(JSON.stringify(foto.vanishCam, null, 2)) : ''}</textarea>
        <div class="v3d-fotocam-info-actions">
          <button type="button" class="btn sm" id="v3d-fotocam-info-salvar">💾 Salvar</button>
          <span class="v3d-fotocam-info-status" id="v3d-fotocam-info-status"></span>
        </div>
      </div>
    `;
    // [10/09/2026, REESCRITO] Anexa dentro de #v3d-camzoom-wrap (mero
    // agrupador do <canvas> + overlays, sem nenhum transform aplicado a
    // ele hoje — o zoom da roda do mouse virou FOV real, ver onWheel/
    // _resetCamZoom — mantido só como ponto de montagem estável). A
    // compensação da foto-guia contra o zoom é feita à parte, direto no
    // <img> (ver _updateFotoCamOverlayZoomScale).
    const camzoomWrap = this._container?.querySelector('#v3d-camzoom-wrap') || this._container;
    // [12/09/2026 — RODADA "buffer de verdade"] `#v3d-fotocam-photo-canvas`
    // criado/anexado AQUI, como elemento PRÓPRIO — IRMÃO de `#v3d-canvas`
    // dentro de `#v3d-camzoom-wrap` (não mais um `<canvas>` dentro do
    // innerHTML de `wrap`/`.v3d-fotocam-overlay`, ver comentário grande no
    // template acima) — pedido verbatim: "Use a mesma coisa de 'Frente' em
    // 'Trás'. E use o depth buffer para imprimir os objetos na tela." Ser
    // IRMÃO de `#v3d-canvas` (em vez de descendente de um wrap com
    // z-index:30 fixo) é o que permite `_updateFotoCamOverlayZoomScale`
    // alternar livremente, via `style.zIndex`, se este canvas fica ACIMA
    // (modo 'front') ou ABAIXO (modo 'back') do canvas WebGL — algo
    // impossível enquanto ele era descendente de um contêiner cujo
    // z-index (30) sempre vencia o de `#v3d-canvas` inteiro, não dava pra
    // "furar" só este elemento. Guardado em `this._fotoCamPhotoCanvasEl`
    // pra `_removeFotoCamOverlay` conseguir limpá-lo (não é mais removido
    // de graça junto com `wrap`).
    let photoCanvasEl = null;
    if (imgSrc && camzoomWrap) {
      photoCanvasEl = document.createElement('canvas');
      photoCanvasEl.className = 'v3d-fotocam-photo-canvas';
      photoCanvasEl.id = 'v3d-fotocam-photo-canvas';
      camzoomWrap.appendChild(photoCanvasEl);
    }
    this._fotoCamPhotoCanvasEl = photoCanvasEl;
    (this._container?.querySelector('#v3d-camzoom-wrap') || this._container)?.appendChild(wrap);
    // [15/09/2026] REMOVIDO -- pedido verbatim (Parte B): wiring dos
    // botões "🟨 Enquadramento"/"🌑 Escurecer o entorno"/"🌒 Escurecer
    // imagem"/opacidade/"ℹ️ Informações do vanishCam" que vivia AQUI (cada
    // um lendo `wrap.querySelector('#v3d-fotocam-...')` de um botão da
    // extinta barra .v3d-fotocam-overlay-controls) foi todo realocado pra
    // `_renderPropriedadesPanel` (chamada no fim desta função) -- os
    // botões agora vivem nas seções "Fundo"/"Câmera" da aba lateral
    // direita "Propriedades", mas continuam manipulando os MESMOS
    // elementos (`#v3d-fotocam-vignette`/`#v3d-fotocam-overlay-img`/
    // `#v3d-fotocam-info-panel`, todos ainda dentro deste `wrap`) --
    // `_renderPropriedadesPanel` recebe `wrap` via `this._fotoCamOverlayEl`
    // (atribuído logo abaixo) pra achá-los. O botão "ℹ️ Informações do
    // vanishCam" também mudou de lugar, mas o PAINEL que ele abre
    // (`#v3d-fotocam-info-panel`) continua aqui, flutuante, sem mudança.
    wrap.querySelector('#v3d-fotocam-sair').onclick = () => sair();
    wrap.querySelector('#v3d-fotocam-info-salvar').onclick = async () => {
      const status = wrap.querySelector('#v3d-fotocam-info-status');
      const textarea = wrap.querySelector('#v3d-fotocam-info-json');
      try {
        const json = textarea.value.trim() ? JSON.parse(textarea.value) : null;
        const photoFull = await DB.getAmbientePhoto(foto.id);
        if (!photoFull) throw new Error('Foto não encontrada.');
        await DB.saveAmbientePhoto({ ...photoFull, mapaVanishCam: json });
        foto.vanishCam = json; // atualiza a cópia local desta vista, sem esperar recarregar o mapa inteiro
        // Só o modo "ver através de um orb de FOTO" deriva o FOV do
        // vanishCam salvo aqui (ver _fotoCamFovFor) — no modo "orb de
        // CÂMERA" (_orbCamMode) o FOV vem da própria câmera (Blender-style
        // focalLength/fov, ver _enterCameraOrbView), então não mexe nele.
        // [10/09/2026] Recalibrar o vanishCam com o zoom "lupa" ativo
        // recomeça o zoom do zero (novo calibFov = novo zoomFov) — senão a
        // compensação da foto-guia (_updateFotoCamOverlayZoomScale) ficaria
        // calculada contra um FOV calibrado que não existe mais.
        if (this._fotoCamMode) {
          const novoCalibFov = this._fotoCamFovFor(foto);
          this._fotoCamMode.calibFov = novoCalibFov;
          this._fotoCamMode.zoomFov = novoCalibFov;
          this._engine?.setFov?.(novoCalibFov);
          this._updateFotoCamOverlayZoomScale();
        }
        if (status) status.textContent = '✅ Salvo.';
      } catch (e) {
        console.warn('[FotoCam] JSON inválido ao salvar:', e);
        if (status) status.textContent = '⚠️ JSON inválido.';
      }
    };
    // [15/09/2026] REMOVIDO -- pedido verbatim (Parte B): "coloque o
    // conteúdo (não o botão) de 'Propriedades'" + "mostra o que hoje está
    // em 'Ver através desta câmera'->Imagem". O wiring dos painéis
    // "🖼️ Imagem"/"⚙️ Propriedades" (que vivia aqui, com botões-toggle
    // próprios) foi todo realocado pra dentro de `_renderPropriedadesPanel`
    // (chamada logo abaixo, depois de `this._fotoCamOverlayEl = wrap`) --
    // o conteúdo agora mora nas seções "Fundo"/"Câmera" da aba lateral
    // direita "Propriedades", sem precisar de um botão-toggle próprio (o
    // cabeçalho recolhível da própria seção já cumpre esse papel).
    this._fotoCamOverlayEl = wrap;
    // [12/09/2026 — ITEM D] reaplica object-fit/offset/rotação/flip salvos
    // — precisa rodar DEPOIS do `<img>` existir no DOM (acabou de ser
    // criado acima). `_resetCamZoom` (chamado ANTES de `_renderFotoCamOverlay`
    // por quem entra neste modo) já tenta chamar `_updateFotoCamOverlayZoomScale`
    // uma vez, mas àquela altura o `<img>` ainda não existia — sem esta
    // 2ª chamada aqui, um `fit`/offset/rotação salvo diferente do padrão
    // CSS (`contain`) silenciosamente não seria aplicado na entrada.
    this._updateFotoCamOverlayZoomScale();
    // [19/09/2026 — RODADA SEGUINTE] REMOVIDO — `_applyFotoCamBackdropDepthMode()`
    // (alternava entre o `<canvas>` de overlay e o plano 3D do backdrop
    // 'Trás', ambos removidos) não existe mais; a chamada acima já cobre
    // os 2 modos ('Trás'/'Frente' só mudam a ORDEM de desenho dentro dela).
    // [15/09/2026] NOVO — constrói o conteúdo das seções "Fundo"/"Câmera"
    // da aba lateral direita "Propriedades" pra esta câmera/foto (ver
    // `_renderPropriedadesPanel`, comentário grande lá).
    this._renderPropriedadesPanel({ rebuild: true, foto, temFrustum, hasImage: !!imgSrc });
  },

  _removeFotoCamOverlay() {
    this._fotoCamOverlayEl?.remove();
    this._fotoCamOverlayEl = null;
    // [12/09/2026 — RODADA "buffer de verdade"] NOVO — `#v3d-fotocam-photo-canvas`
    // deixou de ser descendente de `wrap` (ver `_renderFotoCamOverlay`),
    // então `wrap.remove()` (linha acima) não o remove mais sozinho —
    // precisa de limpeza própria.
    this._fotoCamPhotoCanvasEl?.remove();
    this._fotoCamPhotoCanvasEl = null;
    // [16/09/2026 — RODADA SEGUINTE] limpa o `Image()` em memória (ver
    // `_renderFotoCamOverlay`) e seu `onload` — evita um redesenho tardio
    // (decodificação terminando DEPOIS de já ter saído deste modo) mexer
    // num canvas que não existe mais.
    if (this._fotoCamImgEl) this._fotoCamImgEl.onload = null;
    this._fotoCamImgEl = null;
    // [15/09/2026] NOVO — reseta as seções "Fundo"/"Câmera" (aba lateral
    // "Propriedades") pro aviso padrão sempre que o overlay de "Ver
    // através desta câmera" é removido (tanto ao SAIR de verdade quanto no
    // início de `_renderFotoCamOverlay`/`_renderCameraOrbOverlay`, que
    // reconstroem logo em seguida chamando `_renderPropriedadesPanel` de
    // novo com `rebuild:true`).
    this._renderPropriedadesPanel();
    // [19/09/2026 — RODADA SEGUINTE] REMOVIDO — chamava
    // `_removeFotoCamBackdropPlane()` (desfazia o plano 3D do backdrop
    // 'back', REMOVIDO por completo nesta rodada) — não existe mais nenhum
    // objeto 3D "fantasma" pra limpar; a foto só vive no `<canvas>` de
    // overlay (removido junto com o resto de `wrap`, no início desta
    // função — `this._fotoCamOverlayEl?.remove()`).
  },

  /** [12/09/2026 — ITEM D] Markup do painel "🖼️ Imagem" — os 3 grupos de
   *  botões colados (Trás/Frente, Esticar/Caber/Cortar), os 2 checkboxes
   *  (Virar H/V) e os 3 slots vazios onde os widgets `_createNumField`
   *  (Offset X/Y, Rotação — o MESMO widget de "Transformação" no
   *  Modelador, ver `_wireFotoCamBackdropPanel`) são montados via JS (não
   *  dá pra desenhar aquele widget só com HTML — ele é construído por
   *  `ModelerUI._createNumField`, com listeners próprios). Estado inicial
   *  dos grupos/checkboxes é aplicado por `_wireFotoCamBackdropPanel`
   *  também (evita duplicar `cfg` aqui). */
  _fotoCamBackdropPanelHtml() {
    return `
      <div class="v3d-fotocam-backdrop-panel hidden" id="v3d-fotocam-backdrop-panel">
        <!-- [13/09/2026 — ITEM A] pedido verbatim: "coloque a opacidade
             dentro da janela do 'Imagem'" — movida pra cá (1ª linha do
             painel, antes de Trás/Frente) de dentro da barra de controles
             (onde o botão "🖼️ Imagem" está agora, ver _renderFotoCamOverlay).
             MESMO id/elemento (id=v3d-fotocam-opacidade) — a wiring
             (range.oninput, também em _renderFotoCamOverlay) continua
             achando por wrap.querySelector, não precisou mudar. -->
        <div class="v3d-backdrop-row">
          <label class="v3d-fotocam-opacidade-label">Opacidade da foto
            <input type="range" min="0" max="1" step="0.01" id="v3d-fotocam-opacidade" value="${this._getFotoCamOpacidade()}">
          </label>
        </div>
        <div class="v3d-backdrop-row">
          <span class="v3d-backdrop-row-label">Profundidade da imagem</span>
          <div class="v3d-backdrop-seg-group" data-backdrop-group="depth">
            <button type="button" class="v3d-backdrop-seg-btn" data-value="back" title="A imagem fica ATRÁS dos objetos 3D — eles a ocluem normalmente">Trás</button>
            <button type="button" class="v3d-backdrop-seg-btn" data-value="front" title="A imagem fica NA FRENTE de todos os objetos 3D (padrão)">Frente</button>
          </div>
        </div>
        <div class="v3d-backdrop-row">
          <span class="v3d-backdrop-row-label">Ajuste no enquadramento</span>
          <div class="v3d-backdrop-seg-group" data-backdrop-group="fit">
            <button type="button" class="v3d-backdrop-seg-btn" data-value="stretch" title="Esticar — preenche todo o enquadramento, ignorando a proporção original">Esticar</button>
            <button type="button" class="v3d-backdrop-seg-btn" data-value="contain" title="Caber — mantém a proporção, toda a imagem visível dentro do enquadramento (padrão)">Caber</button>
            <button type="button" class="v3d-backdrop-seg-btn" data-value="cover" title="Cortar — mantém a proporção, preenche todo o enquadramento, partes da imagem podem ficar de fora">Cortar</button>
          </div>
        </div>
        <div class="v3d-backdrop-row" id="v3d-backdrop-offsetx-wrap"></div>
        <div class="v3d-backdrop-row" id="v3d-backdrop-offsety-wrap"></div>
        <label class="v3d-backdrop-checkbox-row"><input type="checkbox" id="v3d-backdrop-fliph"> Virar Horizontalmente</label>
        <label class="v3d-backdrop-checkbox-row"><input type="checkbox" id="v3d-backdrop-flipv"> Virar Verticalmente</label>
        <div class="v3d-backdrop-row" id="v3d-backdrop-rotation-wrap"></div>
      </div>`;
  },

  /** [12/09/2026 — ITEM D] Liga os 7 controles do painel "🖼️ Imagem" —
   *  chamada 1x por `_renderFotoCamOverlay`, logo depois do painel ser
   *  inserido no DOM (`_fotoCamBackdropPanelHtml`, acima). Offset X/Y e
   *  Rotação reusam `ModelerUI._createNumField` (o MESMO widget de 3
   *  botões — arrastar/clicar seta/clicar valor pra digitar — já usado em
   *  "Ver em 3D" → Modelador → "Transformação", pedido explícito do
   *  usuário: "do mesmo jeito que é [...] em 'Transformação'"). Cada
   *  controle chama `_setFotoCamBackdropConfig` (persiste + reaplica tudo
   *  — CSS do `<img>` em modo 'front', canvas+plano 3D em modo 'back'). */
  _wireFotoCamBackdropPanel(panel) {
    const cfg = this._getFotoCamBackdropConfig();
    const syncSegGroup = (grupo, valor) => {
      panel.querySelectorAll(`[data-backdrop-group="${grupo}"] .v3d-backdrop-seg-btn`).forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.value === valor);
      });
    };
    syncSegGroup('depth', cfg.depth);
    syncSegGroup('fit', cfg.fit);
    panel.querySelectorAll('[data-backdrop-group="depth"] .v3d-backdrop-seg-btn').forEach((btn) => {
      btn.onclick = () => { this._setFotoCamBackdropConfig({ depth: btn.dataset.value }); syncSegGroup('depth', btn.dataset.value); };
    });
    panel.querySelectorAll('[data-backdrop-group="fit"] .v3d-backdrop-seg-btn').forEach((btn) => {
      btn.onclick = () => { this._setFotoCamBackdropConfig({ fit: btn.dataset.value }); syncSegGroup('fit', btn.dataset.value); };
    });
    const offXWrap = panel.querySelector('#v3d-backdrop-offsetx-wrap');
    const offYWrap = panel.querySelector('#v3d-backdrop-offsety-wrap');
    const rotWrap = panel.querySelector('#v3d-backdrop-rotation-wrap');
    // [13/09/2026 — ITEM C] pedido verbatim: "Os offsets devem ser em
    // unidades do mundo" — `step`/`minDecimals`/`suffix` trocados de
    // porcentagem (`step:1`, inteiro, '%') pra metros (`step:0.05`, 2 casas,
    // 'm' — precisão fina o bastante pra ajustes de alinhamento de foto sem
    // ficar minúsculo demais pra arrastar). O VALOR salvo (`cfg.offsetX/Y`)
    // já é a magnitude em metros — ver `_backdropOffsetFrac` (conversão
    // metros -> fração do quadro, usada tanto pelo `<img>` DOM quanto pelo
    // canvas do modo 'back').
    if (offXWrap && window.ModelerUI) {
      offXWrap.appendChild(ModelerUI._createNumField({
        label: 'Offset X', value: cfg.offsetX || 0, step: 0.05, minDecimals: 2, suffix: 'm',
        onCommit: (v) => this._setFotoCamBackdropConfig({ offsetX: v }),
      }).el);
    }
    if (offYWrap && window.ModelerUI) {
      offYWrap.appendChild(ModelerUI._createNumField({
        label: 'Offset Y', value: cfg.offsetY || 0, step: 0.05, minDecimals: 2, suffix: 'm',
        onCommit: (v) => this._setFotoCamBackdropConfig({ offsetY: v }),
      }).el);
    }
    if (rotWrap && window.ModelerUI) {
      rotWrap.appendChild(ModelerUI._createNumField({
        label: 'Rotação', value: cfg.rotation || 0, step: 1, formatMode: 'rotation', suffix: '°',
        onCommit: (v) => this._setFotoCamBackdropConfig({ rotation: v }),
      }).el);
    }
    const fliph = panel.querySelector('#v3d-backdrop-fliph');
    const flipv = panel.querySelector('#v3d-backdrop-flipv');
    if (fliph) { fliph.checked = !!cfg.flipH; fliph.onchange = () => this._setFotoCamBackdropConfig({ flipH: fliph.checked }); }
    if (flipv) { flipv.checked = !!cfg.flipV; flipv.onchange = () => this._setFotoCamBackdropConfig({ flipV: flipv.checked }); }
  },

  /** [11/09/2026] NOVO — pedido verbatim: "Deve ser possível acessar a
   *  janela de propriedades da câmera no modo 'Ver através desta câmera'
   *  [...] A mudança dos valores devem ter efeito imediato." Devolve QUEM
   *  editar (o objeto de verdade que guarda `fov`/`resolutionX`/
   *  `resolutionY`) e COMO salvar, dependendo de qual dos 2 modos de
   *  câmera especial está ativo agora — MESMA distinção já usada por
   *  `_activeCamFrameAspect`/`_activeCamPropsVFovRad` (acima): orb "Câmeras"
   *  guarda esses campos DIRETO no objeto (`cam.fov`/`cam.resolutionX/Y`,
   *  ver mapping.js `addCamera`); orb de "foto" guarda dentro de
   *  `foto.camProps`/`AmbientePhoto.mapaCamProps`. `null` se nenhum modo
   *  especial estiver ativo (nunca deveria acontecer — só chamado de
   *  dentro do overlay de "Ver através desta câmera" — mas protegido do
   *  mesmo jeito que o resto do arquivo faz pra estas 2 flags). */
  _activeCamPropsEditTarget() {
    if (this._orbCamMode) {
      const cam = (this._map?.cameras || []).find((c) => c.id === this._orbCamMode.camId);
      if (!cam) return null;
      return {
        idPrefix: 'v3dlivecam',
        props: cam,
        onSave: (patch) => {
          Mapping.updateCamera(this._map, cam.id, patch);
          Object.assign(cam, patch);
          // Efeito imediato (pedido verbatim: "mudar o FOV, ajustando/
          // aproximando o enquadramento da câmera"): o retângulo amarelo já
          // recalcula sozinho a cada quadro a partir de `cam.fov`/
          // `resolutionX/Y` (ver `_activeCamPropsVFovRad`/
          // `_activeCamFrameAspect`, que leem o objeto `cam` ao vivo — já
          // mutado acima) — só falta reaplicar o FOV na câmera de RENDER
          // de verdade (o "orb de câmera" É a câmera do jogo nesse modo,
          // diferente do orb de foto — ver comentário grande em
          // `_enterCameraOrbView`), reiniciando o zoom "lupa" do zero
          // (mesmo padrão já usado ao recalibrar o vanishCam, ver
          // `#v3d-fotocam-info-salvar` acima) pra não ficar calculado
          // contra um FOV calibrado que não existe mais.
          // [16/09/2026] CORRIGIDO — pedido verbatim: "Ao variar a resolução
          // da câmera em [...] 'Propriedades da câmera', o zoom deve
          // permanecer como está. Atualmente o zoom acaba mudando ao
          // variar a resolução da câmera." CAUSA RAIZ: `salvar()` (ver
          // mapview.js `_wireCamPropsFieldset`) sempre manda o PATCH
          // INTEIRO (fov + resolutionX/Y + clipStartM/Y juntos) — este
          // trecho reagia a QUALQUER chamada de `onSave` reatribuindo
          // `zoomFov = fovDeg` incondicionalmente, mesmo quando só
          // Resolução X/Y (ou Corte) mudou e o FOV calibrado (`cam.fov`)
          // continuava exatamente o mesmo — isso jogava fora qualquer zoom
          // manual (roda do mouse) que o usuário já tivesse aplicado,
          // voltando pro "0% de zoom" sem pedido nenhum. CORRIGIDO: só
          // reseta `zoomFov`/reaplica `setFov` quando o FOV CALIBRADO
          // (`fovDeg`) realmente mudou desde a última vez — editar só
          // Resolução/Corte não mexe mais no zoom atual.
          const fovDeg = this._camOrbFovDeg(cam);
          const fovMudou = !this._orbCamMode || Math.abs(fovDeg - this._orbCamMode.calibFov) > 0.001;
          if (this._orbCamMode) {
            this._orbCamMode.calibFov = fovDeg;
            if (fovMudou) this._orbCamMode.zoomFov = fovDeg;
          }
          if (fovMudou) this._engine?.setFov?.(fovDeg);
          // [15/09/2026] NOVO — pedido verbatim: "Ao vivo e imediatamente,
          // devem ser aplicadas as alterações no retângulo amarelo."
          // Recalcula a malha 3D de verdade do frustum (engine3d.js
          // `updateCameraFrustumGeometry`, ver comentário grande lá) com o
          // `cam` já mutado (Object.assign acima) — sem isso só o quadro
          // CSS 2D (`_activeCamFrameRectPx`) reagia; a malha 3D ficava
          // congelada até o próximo `setScene()` completo.
          this._engine?.updateCameraFrustumGeometry?.(cam.id, cam);
          // [15/09/2026] NOVO — pedido verbatim: "coloque duas opções para
          // o corte da câmera [...] Uma seção chamada 'Corte', botão para
          // 'Início', por padrão, 0.1. E botão para 'Fim', por padrão, 100."
          // Aplica ao vivo o near/far do frustum de RENDER de verdade
          // (Engine3D.setClipPlanes) — antes só era aplicado na ENTRADA
          // deste modo (`_enterCameraOrbView`, `cam.clipStartM/clipEndM`);
          // agora também a cada edição do fieldset "Propriedades"→"Câmera"
          // (campos "Início"/"Fim" da seção "Corte").
          this._engine?.setClipPlanes?.(cam.clipStartM ?? 0.1, cam.clipEndM ?? 100);
          // [14/09/2026] CORRIGIDO — pedido verbatim: "Ao variar o valor da
          // resolução, por exemplo, em X (...) a imagem está esticando. Isto
          // não deve acontecer. É o retângulo amarelo que deve ter o seu
          // tamanho modificado." BUG CONFIRMADO via Playwright (live, ver
          // sessão de testes): faltava esta chamada aqui — `cam.fov`/
          // `resolutionX/Y` já ficavam corretos no objeto de dados (mutado 2
          // linhas acima) e `_activeCamFrameRectPx()` já recalculava certo
          // SE chamado, mas nada disparava um novo cálculo — o retângulo
          // amarelo (`#v3d-fotocam-vignette`) e a foto-guia
          // (`#v3d-fotocam-overlay-img`) ficavam com o `left/top/width/
          // height` CSS "congelados" no tamanho antigo até a PRÓXIMA
          // interação não relacionada (zoom da roda, pan, etc.) disparar
          // `_updateFotoCamOverlayZoomScale` por conta própria — nesse
          // instante os dois (moldura recalculada x DOM desatualizado)
          // ficavam fora de sincronia por um instante e o salto súbito de
          // tamanho parecia a IMAGEM "esticando" sozinha. O branch
          // `_fotoCamMode` (logo abaixo) já fazia esta chamada corretamente
          // desde a correção de 11/09/2026 — só faltava espelhar aqui no
          // branch do orb "Câmeras" (`_orbCamMode`), que usa este MESMO
          // `_activeCamPropsEditTarget()` mas tinha ficado sem ela.
          this._updateFotoCamOverlayZoomScale();
          // [19/09/2026 — RODADA SEGUINTE] REMOVIDO — havia aqui uma 2ª
          // chamada, `_redrawFotoCamBackdropCanvas()`, que existia só pra
          // manter em sincronia uma TEXTURA OFF-SCREEN separada usada pelo
          // modo 'Trás' (`this._fotoCamBackdropCanvas`, plano 3D do
          // backdrop) — essa textura (e toda a classe de bugs de cache
          // dessincronizado da Resolução/FOV que ela causava, ver histórico
          // de correções acima) deixou de existir por completo nesta
          // rodada: a foto agora é SEMPRE desenhada fresca, a partir da
          // imagem original, direto no `<canvas>` de overlay 2D
          // (`_updateFotoCamOverlayZoomScale`, chamada acima) — nos 2 modos
          // ('Trás' e 'Frente') — nenhuma segunda chamada é necessária.
        },
      };
    }
    if (this._fotoCamMode) {
      const foto = (this._map?.fotos || []).find((f) => f.id === this._fotoCamMode.fotoId);
      if (!foto) return null;
      return {
        idPrefix: 'v3dlivefoto',
        props: foto.camProps || {},
        onSave: (patch) => {
          // [11/09/2026] CORRIGIDO — pedido verbatim: "Ao mudar o FOV da
          // câmera é a câmera que deve ter a sua perspectiva mudada, não a
          // imagem. A imagem continua fixa em relação ao retângulo amarelo
          // da câmera." Antes desta correção este `onSave` só mexia no
          // retângulo amarelo (`camProps.fov` alimentava só
          // `_activeCamPropsVFovRad`), deixando a câmera de RENDER (o que
          // de fato se vê em "Ver através desta câmera") intocada — editar
          // o FOV aqui não mudava a perspectiva nenhuma, só o tamanho do
          // quadro desenhado, dando a impressão de que era a IMAGEM que
          // mudava de tamanho (já que ela segue o quadro, ver
          // `_updateFotoCamOverlayZoomScale`/`_activeCamFrameRectPx`), não a
          // câmera. CORRIGIDO: agora também reaplica o FOV na câmera de
          // render (mesmo padrão já usado pelo orb "Câmeras", acima),
          // reiniciando o zoom "lupa" do zero — a imagem/foto-guia SEGUE o
          // quadro automaticamente (ela é sempre desenhada EM RELAÇÃO a
          // `_activeCamFrameRectPx()`/`_activeCamPropsVFovRad()`, nunca tem
          // tamanho/perspectiva própria), então "fica fixa em relação ao
          // retângulo amarelo" continua verdade sem nenhum código a mais.
          //
          // [15/09/2026] CORRIGIDO — pedido verbatim: "Atualmente o aramado
          // amarelo não atualiza em tempo real conforme as alterações
          // feitas na resolução da câmera." CAUSA RAIZ: este `onSave` era
          // `async` e fazia `await DB.getAmbientePhoto`/`await
          // DB.saveAmbientePhoto` ANTES de tocar em qualquer atualização
          // visual (FOV/frustum/overlay) — como o campo numérico
          // (`ModelerUI._createNumField`) dispara `onCommit`→`salvar()`→
          // este `onSave` A CADA PASSO do arraste (várias vezes por
          // segundo), as chamadas assíncronas se acumulavam/desordenavam
          // (cada uma esperando 2 round-trips de banco) e a atualização
          // visual do retângulo amarelo ficava atrasada, ou nunca
          // "alcançava" o valor mais recente. O branch `_orbCamMode`
          // (acima) nunca teve este bug por ser 100% síncrono — pista
          // decisiva pro diagnóstico. CORRIGIDO: `onSave` volta a ser
          // síncrono — `foto.camProps`/FOV/frustum/corte/overlay são
          // aplicados IMEDIATAMENTE (nesta mesma função, sem `await`) — a
          // gravação no banco (`DB.getAmbientePhoto`/
          // `DB.saveAmbientePhoto`) passa a rodar em segundo plano, com
          // debounce de 300ms (`_fotoCamPropsSaveTimer`): só a ÚLTIMA
          // edição de uma rajada de arraste é persistida, sem nunca
          // bloquear nenhuma das atualizações visuais anteriores.
          foto.camProps = patch;
          if (this._fotoCamPropsSaveTimer) clearTimeout(this._fotoCamPropsSaveTimer);
          this._fotoCamPropsSaveTimer = setTimeout(() => {
            this._fotoCamPropsSaveTimer = null;
            DB.getAmbientePhoto(foto.id).then((photoFull) => {
              if (photoFull) return DB.saveAmbientePhoto({ ...photoFull, mapaCamProps: patch });
            }).catch((err) => console.error('[view3d] falha ao salvar camProps (Propriedades da câmera):', err));
          }, 300);
          if (this._fotoCamMode) {
            // [11/09/2026 — CORRIGIDO] Era `_activeCamPropsVFovRad()` (passa
            // `patch.fov` pelo "Sensor Fit: Auto" usando Resolução X/Y) —
            // fazia a Resolução X/Y também mudar a perspectiva de verdade da
            // câmera de render, não só o retângulo amarelo. Pedido verbatim:
            // "Em 'Propriedades da câmera', os valores de resolução não
            // devem alterar a resolução da imagem, mas sim o retângulo
            // amarelo." Agora usa `patch.fov` DIRETO (mesmo padrão do orb
            // "Câmeras", ver `_camOrbFovDeg` acima) — só o campo FOV mexe na
            // câmera de verdade; Resolução X/Y continuam mudando só o
            // retângulo amarelo (`_activeCamPropsVFovRad`/
            // `_activeCamFrameAspect`, usados só pelo cálculo do quadro,
            // intocados).
            // [16/09/2026] CORRIGIDO — MESMO motivo/pedido do branch
            // `_orbCamMode` acima (ver comentário grande lá): só reseta o
            // zoom quando o FOV calibrado de verdade mudou, nunca só por
            // causa de Resolução X/Y ou Corte terem sido editados no MESMO
            // patch (`salvar()` sempre manda tudo junto).
            const novoFovDeg = Math.max(1, Math.min(170, ((patch.fov ?? Math.PI / 3) * 180) / Math.PI));
            const fovMudou = Math.abs(novoFovDeg - this._fotoCamMode.calibFov) > 0.001;
            this._fotoCamMode.calibFov = novoFovDeg;
            if (fovMudou) {
              this._fotoCamMode.zoomFov = novoFovDeg;
              this._engine?.setFov?.(novoFovDeg);
            }
            // [15/09/2026] NOVO — MESMO motivo/pedido do branch `_orbCamMode`
            // acima (ver comentário grande lá): recalcula a malha 3D de
            // verdade do retângulo amarelo ao vivo, a cada edição em
            // "Propriedades" (FOV OU Resolução X/Y).
            this._engine?.updateCameraFrustumGeometry?.(foto.id, patch);
            // [15/09/2026] NOVO — pedido verbatim: "coloque duas opções para
            // o corte da câmera [...] Uma seção chamada 'Corte', botão para
            // 'Início', por padrão, 0.1. E botão para 'Fim', por padrão,
            // 100." Aplica ao vivo o near/far do frustum de RENDER de
            // verdade — antes só era aplicado na ENTRADA deste modo (ver
            // `_enterFotoCameraView` abaixo); agora também a cada edição.
            this._engine?.setClipPlanes?.(patch.clipStartM ?? 0.1, patch.clipEndM ?? 100);
            this._updateFotoCamOverlayZoomScale();
            // [19/09/2026 — RODADA SEGUINTE] REMOVIDO — MESMA remoção do
            // branch `_orbCamMode` acima: a chamada extra a
            // `_redrawFotoCamBackdropCanvas()` (textura off-screen do plano
            // 3D do backdrop 'Trás') não é mais necessária — essa textura,
            // e toda a classe de bugs de cache dessincronizado da Resolução/
            // FOV que ela causava (era justamente ESTE branch,
            // `_fotoCamMode`, o mais comumente exercitado pelo usuário na
            // prática, ver histórico de correções acima), deixou de existir
            // por design: a foto é sempre desenhada fresca direto no
            // `<canvas>` de overlay 2D (`_updateFotoCamOverlayZoomScale`,
            // chamada acima), nos 2 modos.
          }
        },
      };
    }
    return null;
  },

  /** [11/09/2026] NOVO — constrói + liga o fieldset "⚙️ Propriedades" dentro
   *  de `#v3d-fotocam-props-panel` (ver botão/HTML em `_renderFotoCamOverlay`),
   *  reaproveitando o MESMO `_camPropsFieldsetHtml`/`_wireCamPropsFieldset`
   *  de mapview.js já usado em `_showCameraCard3D`/`_showFotoPinCard3D` —
   *  nunca um fieldset PRÓPRIO/duplicado, sempre a mesma fonte única de
   *  verdade dos campos FOV/Resolução X/Y. */
  _wireLiveCamPropsPanel(panel) {
    const target = this._activeCamPropsEditTarget();
    if (!target || !window.MapView?._camPropsFieldsetHtml || !window.MapView?._wireCamPropsFieldset) {
      panel.innerHTML = '<div class="map2d-toolctx-info">Propriedades indisponíveis.</div>';
      return;
    }
    panel.innerHTML = window.MapView._camPropsFieldsetHtml(target.idPrefix, target.props) || '';
    window.MapView._wireCamPropsFieldset(panel, target.idPrefix, target.props, target.onSave);
  },

  // ---------- "Orb de câmera" / redesenho do "Camera Match" — [10/09/2026]
  // NOVO, pedido verbatim: "Sobre o 'câmera match' [...] não deve ser uma
  // tela a parte como estava antes, deve ser no próprio cenário 3D. Não é
  // simular um 3D fictício com linhas estático como antes, o próprio 'Ver em
  // 3D' já é o 3D em perspectiva necessário [...] com um 'orb de câmera'
  // deve dar para ver através dele. Com a câmera do personagem fixa pela
  // visão do 'orb de câmera' deve ser possível continuar interagindo com o
  // mapa do mesmo jeito que antes. As duas únicas diferenças são que: 1, não
  // dá para olhar em volta pois a câmera fica fixa; e 2, tem uma imagem na
  // frente da câmera como um 'guia visual' [...]". "Orb de câmera" aqui é o
  // objeto "Câmeras" já existente (`this._map.cameras`, mapping.js
  // addCamera) — já tinha `fotoId` opcional (mesma ideia de "orb de foto
  // vinculada"), então nenhum objeto/tipo novo foi inventado, só esta nova
  // forma interativa de "entrar" nele. Diferente de `_enterFotoCameraView`/
  // `_camMode` (modos de ESPECTADOR — ver comentário grande em
  // `this._orbCamMode`, mount()), aqui `this._camera` é travado DE VERDADE,
  // então toda a interação existente (seleção/posicionamento via
  // `_placeWithBuildTool`, que sempre lê `this._camera`) continua
  // funcionando sem duplicar nada. ----------
  _enterCameraOrbView(camId) {
    const cam = (this._map?.cameras || []).find((c) => c.id === camId);
    if (!cam) { Utils.toast('Câmera não encontrada neste mapa.', { type: 'warn' }); return; }
    // Nunca 2+ modos de câmera especial ativos ao mesmo tempo — mesma regra
    // já usada entre _camMode/_fotoCamMode.
    if (this._camMode) this._exitCameraView();
    if (this._fotoCamMode) this._exitFotoCameraView();
    document.exitPointerLock?.();
    this._resetCamZoom(); // [10/09/2026] — ver comentário grande em _resetCamZoom
    // Guarda a pose LIVRE atual pra restaurar ao sair (pedido implícito: o
    // usuário volta a andar de onde estava, não teleporta pro ponto onde a
    // câmera calibrada ficava) — só na 1ª entrada (reentrar sem sair não
    // deveria sobrescrever o "de onde vim" de verdade, mas _exitCameraOrbView
    // sempre limpa este campo, então nunca fica "preso" num valor velho).
    this._orbCamSavedPose = { x: this._camera.x, y: this._camera.y, z: this._camera.z, yaw: this._camera.yaw, pitch: this._camera.pitch };
    // [12/09/2026 — ITEM A] captura o FOV do personagem ANTES de aplicar o
    // FOV calibrado da câmera logo abaixo (`setFov(fovDeg)`) — ver
    // comentário grande em `this._fotoCamSavedFov` (mount()). Restaurado
    // SEMPRE em `_exitCameraOrbView`, independente da opção "Sair da
    // câmera" escolhida.
    this._orbCamSavedFov = this._engine?.camera3?.fov ?? this._CAM_VIEW_DEFAULT_FOV;
    // Mesma pose/convenção ângulo->yaw de `_computeWatchCameraPose` acima
    // (ALTURA_CAMERA=1.6) — a câmera do "orb" É a câmera do jogo agora, não
    // uma renderCam à parte (ver comentário grande em `this._orbCamMode`).
    // [11/09/2026] CORRIGIDO — MESMA correção/motivo de `_computeWatchCameraPose`
    // acima (ver comentário grande lá): `- Math.PI/2` virou `+ Math.PI/2`.
    const ALTURA_CAMERA = 1.6;
    const baseY = (cam.piso || 0) * (this._map?.alturaPiso || 2.8);
    const pose = { x: cam.x, y: baseY + ALTURA_CAMERA, z: cam.y, yaw: (cam.angulo || 0) + Math.PI / 2, pitch: cam.pitch || 0 };
    this._orbCamLockedPose = pose;
    this._camera.x = pose.x; this._camera.y = pose.y; this._camera.z = pose.z;
    this._camera.yaw = pose.yaw; this._camera.pitch = pose.pitch;
    // [10/09/2026] `calibFov`/`zoomFov` NOVOS — ver comentário grande em
    // `_resetCamZoom`/`onWheel`: zoom de verdade (recalcula o FOV real),
    // não mais um CSS scale. `calibFov` é a referência "0% de zoom" desta
    // câmera (nunca muda enquanto o modo estiver ativo).
    const fovDeg = this._camOrbFovDeg(cam);
    // [18/09/2026] REMOVIDO `calibResX`/`calibResY` — MESMO motivo/pedido
    // do `_enterFotoCameraView` (ver comentário grande em
    // `_activeCamFrameAspect`).
    this._orbCamMode = { camId, calibFov: fovDeg, zoomFov: fovDeg };
    // [12/09/2026 — RODADA "certifique-se que só quando a imagem for
    // pintada"] NOVO — MESMO reset síncrono de `_enterFotoCameraView` (ver
    // comentário grande lá pra causa raiz completa da "piscada" magenta):
    // uma câmera "Câmeras" com `cam.fotoId` associado também usa o backdrop
    // 'Trás' (via `_renderCameraOrbOverlay` -> `_renderFotoCamOverlay`,
    // logo abaixo), então precisa do MESMO cuidado ao entrar.
    if (this._fotoCamBackdropMesh) this._fotoCamBackdropMesh.visible = false;
    this._engine?.clearFotoCamBackdropMask?.();
    this._engine?.setFotoCamBackdropMaskActive?.(false);
    this._fotoCamBackdropReady = false;
    // [10/09/2026] NOVO — MESMO motivo/pedido do _enterFotoCameraView (ver
    // comentário grande lá): a própria câmera sendo vista através nunca
    // deve ser pega pelo clique/destaque de mira.
    this._engine?.setPickExclude?.('camera', camId);
    // Diferente de _enterCameraView/_enterFotoCameraView (boneco palito
    // visível — modos de ESPECTADOR, "o jogador anda sozinho, visto de
    // fora"): aqui a câmera do personagem É a do orb (pedido verbatim: "a
    // câmera do personagem fixa pela visão do 'orb de câmera'"), então o
    // boneco continua invisível (1ª pessoa normal), só travado.
    this._engine?.setPlayerFigureVisible?.(false);
    // FOV/near/far vêm de verdade das propriedades "estilo Blender" da
    // câmera (ver js/mapping.js addCamera e js/mapview.js
    // _openCameraPanel/_camPropsFieldsetHtml) — é o cerne do "camera match":
    // a perspectiva do 3D deve bater com a da foto calibrada.
    this._engine?.setFov?.(fovDeg);
    this._engine?.setClipPlanes?.(cam.clipStartM, cam.clipEndM);
    // [11/09/2026] NOVO — item "parte do cone aparece na frente da câmera":
    // esconde a malha caixa+cone da PRÓPRIA câmera que está sendo vista
    // através (ver engine3d.js setCameraMeshVisible/_cameraMeshesById) —
    // senão o cone dela (que se estende do centro da caixa pra fora, na
    // mesma direção de apontamento pra onde o olho de render agora está)
    // acaba dentro do próprio frustum, como se estivesse "na frente" de
    // tudo. Restaurada em _exitCameraOrbView.
    this._engine?.setCameraMeshVisible?.(camId, false);
    // [11/09/2026] CORRIGIDO — pedido verbatim: "Parece que há duas fotos,
    // quando alternar entre 'Trás' e 'Frente'." CAUSA RAIZ ENCONTRADA: uma
    // câmera "Câmeras" com `cam.fotoId` associado (ver `_renderCameraOrbOverlay`
    // abaixo — é essa foto que vira o backdrop/imagem-guia dentro de "Ver
    // através desta câmera") tinha só a PRÓPRIA malha da câmera escondida
    // (`setCameraMeshVisible` acima) — a malha do ORB DE FOTO vinculado
    // (esfera+cone+"placa" com a MESMA imagem, ver engine3d.js
    // `_fotoMeshesById`/`setFotoMeshVisible`, já usado por
    // `_enterFotoCameraView` pro caso "orb de foto" direto) nunca era
    // escondida aqui — se esse orb de foto ficasse dentro do campo de visão
    // (comum: ele fica pertinho de onde a câmera aponta, já que é a MESMA
    // foto), a "placa" dele (0,42x0,3m, textura = a MESMA foto do backdrop)
    // aparecia na cena AO MESMO TEMPO que o backdrop/imagem-guia — exatamente
    // a impressão de "duas fotos" relatada. CORRIGIDO: esconde também a
    // malha do orb de foto vinculado (restaurada em `_exitCameraOrbView`,
    // MESMO padrão já usado pro caso "orb de foto" direto).
    if (cam.fotoId != null) this._engine?.setFotoMeshVisible?.(cam.fotoId, false);
    this._renderCameraOrbOverlay(cam);
    this._renderHotbar();
  },

  _exitCameraOrbView() {
    this._exitModeladorSeAtivo(); // [13/09/2026] pilha de "Sair" — ver comentário grande em _exitCameraView
    // [11/09/2026] restaura a malha da câmera escondida ao entrar (ver
    // comentário grande em _enterCameraOrbView acima) ANTES de limpar
    // `this._orbCamMode` (guarda o camId antigo pra saber qual mostrar de
    // volta — depois de limpar não teríamos mais como saber qual era).
    const camIdSaindo = this._orbCamMode?.camId;
    // [11/09/2026] CORRIGIDO — mesma correção de `_exitFotoCameraView` (ver
    // comentário grande lá): "Ao 'Sair da câmera', o enquadramento ainda
    // fica ativado." O gizmo do retângulo amarelo é indexado pelo id da
    // FOTO associada (`cam.fotoId`, ver `_renderCameraOrbOverlay` acima —
    // `fotoLike.id`), não pelo id da câmera em si — busca a câmera de novo
    // aqui (ainda com `this._orbCamMode` intacto, antes de zerá-lo mais
    // abaixo) só pra pegar esse id e desligar o gizmo dela ao sair.
    // [11/09/2026] CORRIGIDO (na época) — desligava o retângulo amarelo ao
    // sair de "Ver através desta câmera" (`setCameraFrustumVisible(...,
    // false)`, mesmo padrão de `_exitFotoCameraView`).
    // [15/09/2026] REVERTIDO — MESMO pedido/motivo documentado no
    // comentário grande de `_exitFotoCameraView` (ver lá): "deixe, pelo
    // momento, o enquadramento [...] de todas as câmeras sempre ativo." A
    // busca por `camSaindo` e a chamada `setCameraFrustumVisible(...,
    // false)` foram removidas (não usadas em mais nada neste método).
    this._resetCamZoom(); // [10/09/2026] — ver comentário grande em _resetCamZoom
    // [11/09/2026] item "a câmera do personagem deve assumir a pose EXATA
    // que estava sendo vista": copia a última pose TRAVADA (posição +
    // orientação, `this._orbCamLockedPose`) — a que estava de fato sendo
    // renderizada neste exato instante — pra dentro da câmera livre, em vez
    // de restaurar `_orbCamSavedPose` (de onde o jogador estava ANTES de
    // entrar).
    // RE-INVESTIGADO nesta rodada (pedido explícito pra não confiar cegamente
    // num relato de sessão anterior): diferente do que um relato antigo
    // presumia, o comportamento ATUAL já trava posição E orientação —
    // `_updatePlayerOrAutopilot` (por volta da linha 6522, busca por
    // "this._orbCamMode) {" logo antes de "camOrbAinda") faz um `return`
    // antecipado que PULA todo processamento de WASD/gravidade/pulo enquanto
    // `_orbCamMode` está ativo (não é só orientação/FOV travados — o
    // personagem simplesmente não anda nenhum pixel enquanto "vendo através"
    // de uma câmera), e o re-trava-a-cada-quadro em `_loop` (~linha 5799,
    // busca por "_orbCamLockedPose" lá) reforça a mesma pose todo frame como
    // rede de segurança redundante. Ou seja, na prática
    // `_orbCamLockedPose` já é idêntico a `{x,y,z,yaw,pitch}` de
    // `this._camera` em TODO instante enquanto travado — copiar explicitamente
    // aqui não muda o comportamento observável hoje, mas é a correção
    // CORRETA e sem custo de qualquer forma: deixa a saída explicitamente
    // independente de qualquer suposição sobre o que fica livre/preso
    // durante o modo travado (se essa regra de "personagem não anda" mudar
    // numa rodada futura, esta linha continua garantindo a pose exata sem
    // precisar ser revisitada). FOV também copiado (ver logo abaixo) pra não
    // haver nenhum "salto" perceptível de campo de visão no mesmo instante.
    const lp = this._orbCamLockedPose;
    // [10/09/2026] CORRIGIDO — antes recalculava o FOV CALIBRADO da câmera
    // de novo aqui, ignorando qualquer zoom "de verdade" (ver onWheel/
    // `_orbCamMode.zoomFov`) que estivesse ativo no instante da saída —
    // "a câmera do personagem deve assumir a pose EXATA que estava sendo
    // vista" vale pro FOV também, não só posição/orientação. Usa
    // `zoomFov` (o FOV de fato sendo renderizado agora, calibrado OU
    // ampliado/reduzido pela roda do mouse) em vez de recalcular do zero.
    const fovDegSaindo = this._orbCamMode ? (this._orbCamMode.zoomFov ?? this._camOrbFovDeg((this._map?.cameras || []).find((c) => c.id === camIdSaindo) || {})) : null;
    // [12/09/2026, FUNDIDA NESTA RODADA] item "Sair da câmera": configurável
    // (ver `_cameraExitViewMode()` acima, seção única "Ver através desta
    // câmera" em Configurações 3D — chave `cameraExitViewMode`, também usada
    // DIRETO por `_exitFotoCameraView` desde 15/09/2026 UTC (ver nota grande
    // em mapconfig.js DEFAULTS.cameraExitViewMode). `'lockedView'`
    // (padrão) é EXATAMENTE o comportamento acima (já implementado em
    // rodada anterior, sem mudança); `'originalView'` restaura
    // `_orbCamSavedPose` (a pose livre capturada em `_enterCameraOrbView`,
    // ANTES de travar na câmera) em vez da pose travada, mesmo com `lp`
    // disponível.
    const modo = this._cameraExitViewMode();
    const savedPose = this._orbCamSavedPose;
    this._orbCamMode = null;
    this._orbCamLockedPose = null;
    if (modo === 'originalView' && savedPose) {
      this._camera.x = savedPose.x; this._camera.y = savedPose.y; this._camera.z = savedPose.z;
      this._camera.yaw = savedPose.yaw; this._camera.pitch = savedPose.pitch;
    } else if (lp) {
      this._camera.x = lp.x; this._camera.y = lp.y; this._camera.z = lp.z;
      this._camera.yaw = lp.yaw; this._camera.pitch = lp.pitch;
    } else if (savedPose) {
      // Rede de segurança (nunca deveria acontecer em uso normal — só entra
      // aqui se _exitCameraOrbView for chamado sem uma entrada válida
      // correspondente): sem pose travada pra copiar, cai de volta na pose
      // livre salva na entrada, mesmo comportamento de antes desta rodada.
      const p = savedPose;
      this._camera.x = p.x; this._camera.y = p.y; this._camera.z = p.z;
      this._camera.yaw = p.yaw; this._camera.pitch = p.pitch;
    }
    this._orbCamSavedPose = null;
    // [12/09/2026 — ITEM A, CORRIGIDO] pedido verbatim: o FOV do personagem
    // deve SEMPRE voltar ao que era ANTES de "Ver através desta câmera",
    // mesmo com "Permanece com o ponto de vista da câmera" marcada (posição/
    // orientação seguem `modo` acima, mas o FOV NUNCA deve ficar sendo o FOV
    // calibrado da câmera). Antes desta correção, 'lockedView' mantinha
    // `fovDegSaindo`/o FOV calibrado (ou ampliado/reduzido por zoom) da
    // câmera — agora usa sempre `this._orbCamSavedFov` (capturado em
    // `_enterCameraOrbView`, ANTES de aplicar o FOV calibrado), independente
    // de `modo`. `fovDegSaindo` continua calculado acima só por
    // documentação/rastreabilidade do zoom que estava ativo no instante da
    // saída (sem uso restante aqui).
    const fovSaindo = (this._orbCamSavedFov != null) ? this._orbCamSavedFov : this._CAM_VIEW_DEFAULT_FOV;
    this._engine?.setFov?.(fovSaindo);
    this._orbCamSavedFov = null;
    this._engine?.clearClipPlanes?.();
    this._engine?.setCameraMeshVisible?.(camIdSaindo, true); // [11/09/2026] restaura a visibilidade da malha desta câmera (ver _enterCameraOrbView)
    // [11/09/2026] restaura a malha do orb de foto vinculado (`cam.fotoId`),
    // escondida ao entrar — ver comentário grande em `_enterCameraOrbView`
    // ("duas fotos" ao alternar Trás/Frente). `camSaindo` já foi capturado
    // acima (antes de `this._orbCamMode` ser zerado), mesma referência
    // usada pro `setCameraFrustumVisible` alguns passos atrás.
    if (camSaindo?.fotoId != null) this._engine?.setFotoMeshVisible?.(camSaindo.fotoId, true);
    this._removeFotoCamOverlay();
    this._renderHotbar();
  },

  /** FOV vertical (graus) DE VERDADE pra câmera de render (`THREE.
   *  PerspectiveCamera.fov`, SEMPRE vertical, independente de resolução —
   *  convenção fixa do Three.js).
   *  [11/09/2026 — REVERTIDO em 11/09/2026] A versão anterior (comentário
   *  removido, ver git blame) passava `cam.fov` por `Cam3DMath.
   *  camPropsVFovRad` (a conversão "Sensor Fit: Auto" que também dá forma
   *  ao retângulo amarelo) ANTES de aplicar na câmera de render de
   *  verdade — ou seja, mudar a Resolução X/Y também mudava a perspectiva
   *  real da câmera renderizada (o "Ver através desta câmera" de verdade),
   *  não só o retângulo amarelo. CORRIGIDO — pedido verbatim: "Em
   *  'Propriedades da câmera', os valores de resolução não devem alterar
   *  a resolução da imagem, mas sim o retângulo amarelo." A câmera de
   *  render agora usa `cam.fov` DIRETO (só ele controla a perspectiva de
   *  verdade — mesmo espírito do pedido anterior "ao mudar o FOV da
   *  câmera é a câmera que deve ter a sua perspectiva mudada, não a
   *  imagem"); Resolução X/Y continuam mudando SÓ o retângulo amarelo
   *  (`_activeCamFrameAspect`/`_activeCamPropsVFovRad`/engine3d.js
   *  `_fotoFrustumMeshesById` — nenhum dos três foi tocado, continuam
   *  aplicando o "Sensor Fit: Auto" só no cálculo do quadro). Clamp de
   *  segurança (1°-170°) preservado. */
  _camOrbFovDeg(cam) {
    const g = (cam?.fov ?? Math.PI / 3) * 180 / Math.PI;
    return (isFinite(g) && g > 0) ? Math.max(1, Math.min(170, g)) : 60;
  },

  /** Busca a foto vinculada (se houver, `cam.fotoId`) e monta/mostra o MESMO
   *  overlay do vanishCam (_renderFotoCamOverlay, generalizado acima) — sem
   *  foto associada, o "guia visual" simplesmente não aparece (só os botões
   *  de sair/opacidade fariam sentido, então mostra só um overlay mínimo
   *  com o botão de sair, sem forçar o usuário a associar uma foto só pra
   *  poder usar a câmera travada). */
  async _renderCameraOrbOverlay(cam) {
    if (!cam.fotoId) {
      this._removeFotoCamOverlay();
      if (!this._container) return;
      const wrap = document.createElement('div');
      wrap.className = 'v3d-fotocam-overlay';
      wrap.id = 'v3d-fotocam-overlay';
      // [15/09/2026] CORRIGIDO -- pedido verbatim (Parte B): "Sair da
      // câmera" no topo/centro (mesma classe .v3d-fotocam-sair-topcenter
      // de `_renderFotoCamOverlay`, ver comentário grande lá) — este
      // ramo (câmera "Câmeras" SEM foto vinculada) nunca teve a barra
      // .v3d-fotocam-overlay-controls cheia, só este único botão, então
      // segue o mesmo padrão de posição.
      wrap.innerHTML = `
        <button type="button" class="btn secondary sm v3d-fotocam-sair-topcenter" id="v3d-fotocam-sair" title="Sair da visão desta câmera">✖ Sair da câmera</button>`;
      // [10/09/2026] mesmo motivo do appendChild em _renderFotoCamOverlay —
      // ver comentário grande lá.
      (this._container?.querySelector('#v3d-camzoom-wrap') || this._container)?.appendChild(wrap);
      wrap.querySelector('#v3d-fotocam-sair').onclick = () => this._exitCameraOrbView();
      this._fotoCamOverlayEl = wrap;
      // [15/09/2026] NOVO — sem foto vinculada não há imagem/frustum pra
      // configurar ("Fundo" mostra aviso), mas o fieldset de "⚙️
      // Propriedades" (FOV/Resolução da câmera) continua fazendo sentido
      // (não depende de foto nenhuma) — ver `_renderPropriedadesPanel`.
      this._renderPropriedadesPanel({ rebuild: true, foto: { id: null }, temFrustum: false, hasImage: false });
      return;
    }
    const photo = await DB.getAmbientePhoto(cam.fotoId);
    // Ainda no mesmo orb ao terminar de carregar? (usuário pode ter saído
    // enquanto a Promise resolvia — mesma checagem de segurança usada em
    // _openCameraPanel/_pickPhotoForCamera pra evitar aplicar overlay velho.)
    if (this._orbCamMode?.camId !== cam.id) return;
    const fotoLike = photo ? { id: photo.id, dataUrl: photo.dataUrl, thumbDataUrl: photo.thumbDataUrl, vanishCam: photo.mapaVanishCam || null } : { id: cam.fotoId };
    this._renderFotoCamOverlay(fotoLike, () => this._exitCameraOrbView());
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
  /** [09/09/2026] Bug relatado pelo usuário: "No mapa 2D, ao posicionar o
   *  personagem em frente a um orb de foto e entrar em 'Ver em 3D', o orb
   *  de foto não aparece na cena 3D." Causa raiz: igual ao caso de
   *  `_buildItensNoMapa` (comentário acima) — `foto.fotos` também NÃO vive
   *  dentro do `map` salvo no banco (são registros à parte,
   *  `DB.getAllAmbientePhotos`, ver mapview.js `_refreshFotosNoMapa`, que
   *  monta `this._map.fotos` no editor 2D). Aqui, `this._map` vem de
   *  `DB.getMap(id)` (ver mount()), então nunca ganhava esse campo — a
   *  cena 3D (engine3d.js, bloco "fotos vinculadas ao mapa") sempre
   *  iterava `mapData.fotos || []`, ou seja, um array vazio, sem nenhum
   *  orb aparecer. MESMA lógica de `_refreshFotosNoMapa` (mapview.js),
   *  refeita aqui pra montar `this._map.fotos` antes de `_rebuildScene()`. */
  async _buildFotosNoMapa() {
    if (!this._map) return;
    const fotos = await DB.getAllAmbientePhotos();
    const posicionadas = fotos.filter((f) => typeof f.mapaX === 'number' && typeof f.mapaY === 'number');
    const curar = [];
    this._map.fotos = posicionadas.map((f) => {
      const layerId = Mapping.resolveLayerId(this._map, f.mapaLayerId);
      if (layerId && layerId !== (f.mapaLayerId || null)) curar.push({ id: f.id, layerId });
      return {
        id: f.id, x: f.mapaX, y: f.mapaY, piso: f.mapaPiso || 0, nome: f.nome || '', layerId,
        dirAngulo: f.mapaDirAngulo || 0, altura: f.mapaAltura ?? 1.6, rotPerp: f.mapaRotPerp || 0,
        thumbDataUrl: f.thumbDataUrl, dataUrl: f.dataUrl,
        // [15/09/2026 UTC] NOVO — pedido verbatim: "Ao acrescentar uma
        // entrada no 'Histórico deste objeto' (no 'Ver em 3D') [...] a
        // entrada desaparece [...] não está mais ali (mesmo não tendo sido
        // excluída)." CAUSA RAIZ: esta projeção (mesma função-espelho de
        // `mapview.js` `_refreshFotosNoMapa`, ver comentário grande lá)
        // nunca copiava `historico` do registro real da AmbientePhoto —
        // toda vez que "Ver em 3D" remonta a cena (inclusive reabrindo,
        // como na 2ª visita do próprio bug relatado), o cartão da câmera
        // lia este objeto achatado SEM histórico nenhum, mesmo com a
        // entrada gravada de verdade no banco por `cards/foto-pin-card.js`
        // (`DB.saveAmbientePhoto`). Adicionado aqui.
        historico: f.historico || [],
      };
    });
    for (const c of curar) { const photo = await DB.getAmbientePhoto(c.id); if (photo) await DB.saveAmbientePhoto({ ...photo, mapaLayerId: c.layerId }); }
  },

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
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser possível excluir
      // a medida pelo 3D mesmo." `hoverPick` (genérico, item/câmera/objeto/
      // parede/porta/janela) não sabe nada de medidas da Trena 3D — só
      // tenta o raycast dedicado (`_trena3DPickAtRay`) como fallback quando
      // a mira normal não achou nada mais específico (mesma mira/raio de
      // sempre, `centerRay`).
      const ray = this._engine.centerRay?.(this._camera);
      const medidaHit = ray ? this._trena3D.pickAtRay(ray) : null;
      if (medidaHit && this._trena3D.removerMedida(medidaHit.medidaId)) return;
      Utils.toast('Mire em algo pra remover (item, câmera, objeto, parede, porta, janela ou medida da Trena 3D).', { type: 'warn' });
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
      // [16/09/2026 UTC] NOVO — mesmo fallback de `_removeWithTool` acima:
      // medida da Trena 3D não passa por `hoverPick` (raycast dedicado
      // `_trena3DPickAtRay`) — aqui exclui DIRETO (sem popup de confirmação
      // "estilo Blender"), já que a medida não tem a mesma animação/dado
      // pesado que justifica confirmar antes (mesmo espírito de "excluir na
      // hora" da ferramenta 🗑️ Remover, que também nunca confirma).
      const ray = this._engine.centerRay?.(this._camera);
      const medidaHit = ray ? this._trena3D.pickAtRay(ray) : null;
      if (medidaHit && this._trena3D.removerMedida(medidaHit.medidaId)) return;
      Utils.toast('Mire em algo pra excluir (item, câmera, objeto, parede, porta, janela ou medida da Trena 3D).', { type: 'warn' });
      return;
    }
    document.exitPointerLock?.();
    // NOVO (08/09/2026, 38a rodada): rótulo 'tijolo' -- cobre tanto o
    // aglomerado inteiro (hit.id === 'tijolos-merged', ver
    // engine3d.js _rebuildTijolos) quanto um tijolo individual (cunha/com
    // textura) -- ver _confirmDeleteHit abaixo pro tratamento de cada caso.
    const nomes = { object: 'objeto', camera: 'câmera', item: 'item', wall: 'parede', porta: 'porta', janela: 'janela', tijolo: 'tijolo' };
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
    // NOVO (08/09/2026, 38a rodada), pedido verbatim: "o objeto que foi
    // formado pelo aglomerado de tijolos deve ser um objeto no mundo,
    // podendo ser exluido." -- `hit.id === 'tijolos-merged'` é o pickable
    // ÚNICO que cobre TODOS os tijolos 'caixa' sem textura fundidos numa
    // malha só (ver engine3d.js `_rebuildTijolos`) -- exclui todos de uma
    // vez (mesmo espírito de "objeto único" pedido). Um id diferente é um
    // tijolo INDIVIDUAL (cunha ou com textura, que nunca entram na fusão --
    // ver Tijolos.buildAll) -- reaproveita `Tijolos.remove` já existente
    // (mesma função usada pela exclusão via botão direito, ver
    // `onContextMenu` em `_bindDesktopControls`).
    if (hit.type === 'tijolo') {
      this._engine.spawnCollectEffect(pos, '#78c8ff', Math.max(half.x, half.y, half.z) * 2);
      if (hit.id === 'tijolos-merged') {
        this._map.tijolos = (this._map.tijolos || []).filter((t) => (t.formato || 'caixa') !== 'caixa' || t.texturaUrl);
      } else {
        Tijolos.remove(this._map, hit.id);
      }
      this._engine.rebuildTijolos?.(this._map);
      DB.saveMap(this._map);
      Utils.toast('Removido 🗑️', { type: 'ok', duration: 1400 });
      return;
    }
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
    // NOVO (08/09/2026, 38a rodada), pedido verbatim: "Os tijolos devem ter
    // ghost." — ver comentário grande acima da função `showGhostTijolo`
    // (engine3d.js) e o item 8 logo abaixo (`this._tijoloGhostCfg`).
    if (this._buildTool === 'tijolo') {
      const cfg = this._tijoloGhostCfg || Tijolos.DEFAULTS;
      const hit = eng.raycastSurface(ray.origin, ray.dir);
      if (hit) {
        const xz = Tijolos.snapXZ(hit.x, hit.z, cfg);
        eng.showGhostTijolo(xz.x, hit.y + cfg.sy / 2, xz.z, cfg.sx, cfg.sy, cfg.sz, (cfg.formato === 'cunha') ? (cfg.rotY || 0) : 0, cfg.formato);
      }
      return;
    }
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

  /** [18/09/2026 UTC] NOVO (RODADA 147) — painel de debug TEMPORÁRIO
   *  (`#v3d-debug-cam`), pedido verbatim do usuário pra investigar o bug do
   *  "salto" de yaw/pitch da câmera ao pressionar ESC/reengajar o Pointer
   *  Lock. Registra uma linha cronológica por evento relevante do fluxo
   *  keydown/keyup ESC, pointerlockchange, click de reengajar e mousemove
   *  (descartado pelos 2 guards `_pointerLockExitBlocking`/
   *  `_pointerLockReentering`, ou processado normalmente) — ver todos os
   *  pontos de chamada (`this._v3dLog?.(...)`) em `_bindDesktopControls`
   *  acima. Formato: `[123.4ms] <evento> → yaw=-70.2° pitch=57.1°`, com o
   *  timestamp relativo ao início desta sessão do "Ver em 3D"
   *  (`this._v3dDebugT0`, gravado em `mount()`). Buffer limitado às últimas
   *  200 linhas (`_v3dDebugBuf`, descarta as mais antigas) pra não crescer
   *  sem limite numa sessão de navegação longa — o DOM (`#v3d-debug-cam-body`)
   *  é reescrito por inteiro a cada chamada (`textContent = buf.join('\n')`),
   *  simples e robusto o bastante pro volume de eventos (200 linhas de
   *  texto), sem precisar de nenhuma lógica incremental de DOM. Autoscroll
   *  pro fim (linha mais recente) a cada log, a não ser que o usuário tenha
   *  rolado pra cima de propósito pra ler um trecho antigo (checa se já
   *  estava perto do fim ANTES de escrever, senão preserva a posição de
   *  leitura). `?.()` em todo ponto de chamada (nunca uma chamada direta)
   *  de propósito: o painel só existe depois que `mount()`/
   *  `_bindDesktopControls` rodam — qualquer chamada perdida (ordem de
   *  inicialização, um teste isolado, etc.) nunca deve quebrar o fluxo real
   *  de câmera/Pointer Lock por causa só do debug. */
  _v3dLog(evento) {
    const t = this._v3dDebugT0 != null ? (performance.now() - this._v3dDebugT0) : performance.now();
    const yaw = this._camera ? (this._camera.yaw * 180 / Math.PI).toFixed(1) : '?';
    const pitch = this._camera ? (this._camera.pitch * 180 / Math.PI).toFixed(1) : '?';
    const linha = `[${t.toFixed(1)}ms] ${evento} → yaw=${yaw}° pitch=${pitch}°`;
    const buf = this._v3dDebugBuf || (this._v3dDebugBuf = []);
    buf.push(linha);
    if (buf.length > 200) buf.splice(0, buf.length - 200);
    const el = this._v3dDebugListEl;
    if (!el) return;
    const pertoDoFim = (el.scrollHeight - el.scrollTop - el.clientHeight) < 24;
    el.textContent = buf.join('\n');
    if (pertoDoFim) el.scrollTop = el.scrollHeight;
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
    // [18/09/2026 UTC] NOVO (RODADA 147) — wiring do painel de debug de
    // câmera (`#v3d-debug-cam`, HTML no `mount()` acima, logo depois de
    // `#v3d-lockstate`). Guarda a referência do corpo (onde as linhas de log
    // entram) pra `_v3dLog` não precisar de `querySelector` a cada evento;
    // botão "Limpar" esvazia buffer+DOM; botão "Ocultar/Mostrar" só alterna
    // a visibilidade do corpo (cabeçalho sempre visível).
    this._v3dDebugListEl = this._container?.querySelector('#v3d-debug-cam-body') || null;
    const v3dDebugClearBtn = this._container?.querySelector('#v3d-debug-cam-clear');
    if (v3dDebugClearBtn) {
      v3dDebugClearBtn.onclick = () => {
        this._v3dDebugBuf = [];
        if (this._v3dDebugListEl) this._v3dDebugListEl.textContent = '';
      };
    }
    const v3dDebugToggleBtn = this._container?.querySelector('#v3d-debug-cam-toggle');
    if (v3dDebugToggleBtn && this._v3dDebugListEl) {
      v3dDebugToggleBtn.onclick = () => {
        const hidden = this._v3dDebugListEl.style.display === 'none';
        this._v3dDebugListEl.style.display = hidden ? '' : 'none';
        v3dDebugToggleBtn.textContent = hidden ? 'Ocultar' : 'Mostrar';
      };
    }
    // [18/09/2026 UTC] NOVO (RODADA 150) — o painel inteiro passa a nascer
    // escondido (`display:none` no HTML) e só aparece de verdade conforme a
    // config nova (`debugModoAtivo` + `debugCameraPanelAtivo`, seção "🐞
    // Debug" de Configurações 3D) — ver `_v3dApplyDebugCamPanelVisibilidade`
    // (chamada aqui na abertura e de novo, ao vivo, em `_onMapConfigChange`,
    // no `mount()`, sem precisar fechar/reabrir "Ver em 3D").
    this._v3dApplyDebugCamPanelVisibilidade();
    // [18/09/2026 UTC] NOVO (RODADA 150) — pedido verbatim: "Esta janela de
    // debug deve ser possível movê-la." Arraste simples pegando em qualquer
    // ponto do cabeçalho (`#v3d-debug-cam-header`) fora dos 2 botões — mesmo
    // espírito (Pointer Events + `setPointerCapture`, limites pelo
    // `getBoundingClientRect()` de `this._container`) já usado pela
    // janelinha rápida da Trena 3D (`_trena3DEnsurePainelRapido`, mais
    // abaixo), só que aqui sem resize (não foi pedido) e sem persistir
    // posição entre sessões (painel temporário de debug).
    const v3dDebugCamEl = this._container?.querySelector('#v3d-debug-cam');
    const v3dDebugCamHeaderEl = this._container?.querySelector('#v3d-debug-cam-header');
    if (v3dDebugCamEl && v3dDebugCamHeaderEl) {
      let arrastandoDebugCam = null;
      v3dDebugCamHeaderEl.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        const rect = v3dDebugCamEl.getBoundingClientRect();
        arrastandoDebugCam = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        v3dDebugCamHeaderEl.setPointerCapture(e.pointerId);
      });
      v3dDebugCamHeaderEl.addEventListener('pointermove', (e) => {
        if (!arrastandoDebugCam) return;
        const contRect = (this._container || document.body).getBoundingClientRect();
        const left = Math.max(0, Math.min(contRect.width - 40, e.clientX - contRect.left - arrastandoDebugCam.dx));
        const top = Math.max(0, Math.min(contRect.height - 24, e.clientY - contRect.top - arrastandoDebugCam.dy));
        v3dDebugCamEl.style.left = `${left}px`; v3dDebugCamEl.style.right = '';
        v3dDebugCamEl.style.top = `${top}px`;
      });
      const pararArrasteDebugCam = () => { arrastandoDebugCam = null; };
      v3dDebugCamHeaderEl.addEventListener('pointerup', pararArrasteDebugCam);
      v3dDebugCamHeaderEl.addEventListener('pointercancel', pararArrasteDebugCam);
    }
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
      // [18/09/2026 UTC] NOVO (RODADA 154) — pedido verbatim do usuário,
      // depois de ver (via watchdog/log) que o salto de yaw/pitch ainda
      // sobrevivia às camadas de guard anteriores (`_pointerLockExitBlocking`
      // etc., todas condicionadas a checagens específicas por ponto de
      // mutação): "Ao pressionar o ESC, apenas capture que o ESC foi
      // pressionado na iteração atual, depois desabilite a atualização do
      // yaw e do pitch, depois, aplique a ação programada do ESC. Depois que
      // as funções do ESC são executadas, habilite a atualização do yaw e do
      // pitch novamente." `this._yawPitchFrozen` é a trava NOVA, única e
      // incondicional: liga JÁ aqui, ANTES de qualquer outra linha deste
      // handler rodar (inclusive antes do `if (... && document.pointerLockElement)`
      // logo abaixo) — captura o ESC no instante mais cedo possível, sem
      // depender de `pointerLockElement` estar ou não preenchido. Consumida
      // em `onMouseMove` (ver mais abaixo, guard novo bem no topo da função,
      // antes de QUALQUER leitura/escrita de `this._camera.yaw/pitch`) —
      // enquanto ligada, nenhum `mousemove` (real ou sintético do SO) altera
      // yaw/pitch, não importa a origem. Desligada no fim deste MESMO bloco
      // de tratamento do ESC (ver `this._yawPitchFrozen = false` mais abaixo,
      // depois de todas as ações programadas do ESC nesta função já terem
      // rodado) — mantém `_pointerLockExitBlocking` como reforço adicional
      // (não removido) pra cobrir também a janela assíncrona até o
      // `pointerlockchange` confirmar a saída de vez.
      if (e.code === 'Escape') {
        this._yawPitchFrozen = true;
        this._v3dLog?.('keydown ESC — yaw/pitch CONGELADOS (capturado no início do handler)');
      }
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
        // [18/09/2026 UTC] NOVO (RODADA 147) — painel de debug de câmera
        // (yaw/pitch), pedido verbatim do usuário pra investigar o "salto"
        // ao pressionar ESC — ver `_v3dLog`/`#v3d-debug-cam` (HTML no
        // `mount()`, wiring em `_bindDesktopControls`). Log ANTES de
        // qualquer mudança de estado deste bloco.
        this._v3dLog?.('keydown ESC (antes)');
        this._pointerLockReentering = true;
        // [18/09/2026 UTC] NOVO (RODADA 142) — pedido verbatim: o usuário
        // relatou que a "saltadinha" continuava acontecendo, só que NO
        // MOMENTO DE PRESSIONAR O ESC (saída), não mais ao retomar (entrada
        // — essa já tinha sido corrigida na RODADA 141). Causa raiz: o guard
        // antigo (`_pointerLockReentering`) descarta só o PRÓXIMO
        // `mousemove` (1 evento, depois se auto-desliga, ver `onMouseMove`
        // abaixo) — mas entre este `keydown` do ESC e o navegador realmente
        // soltar o lock (`pointerlockchange` confirmando a saída), pode
        // chegar mais de 1 `mousemove` (real OU sintético): se um
        // `mousemove` "de verdade" (o usuário ainda mexendo o mouse,
        // fisicamente, no exato instante do ESC) chegar ANTES do sintético
        // de recentralização do SO, ele consome sozinho o único descarte
        // disponível — sobrando o sintético (o "salto" de verdade) passar
        // direto, sem guard nenhum. `_pointerLockExitBlocking` é uma 2ª
        // flag, independente, que bloqueia TODO `mousemove` (não só 1) a
        // partir DESTE keydown até `onPointerLockChange` confirmar a saída
        // (`document.pointerLockElement` virar null) — cobre a janela de
        // transição inteira, não um único evento. Ainda por EVENTO/estado,
        // sem timer nenhum (mesmo espírito da RODADA 141) — desligada em
        // `onPointerLockChange` assim que a saída assentar de vez (ver lá).
        this._pointerLockExitBlocking = true;
        // Salva o vetor de apontamento (yaw/pitch) atual da câmera ANTES do
        // navegador soltar o lock de verdade — pedido verbatim (rodada 141):
        // "o vetor de apontamento [...] deve ser guardado [...] volte com o
        // mesmo apontamento [...] partindo do mesmo vetor". Restaurado no
        // `onClick` ao reengajar, abaixo.
        if (this._camera) {
          this._pointerLockSavedYaw = this._camera.yaw;
          this._pointerLockSavedPitch = this._camera.pitch;
        }
        // [18/09/2026 UTC] NOVO (RODADA 147) — log DEPOIS de
        // `_pointerLockSavedYaw/Pitch` gravados (ver acima).
        this._v3dLog?.('keydown ESC (depois, salvou _pointerLockSavedYaw/Pitch)');
      }
      // [13/09/2026] NOVO — "MODO COMPUTADOR": ESC sai do computador acessado
      // (pedido verbatim: "reaproveite ESC"). SEM `document.pointerLockElement`
      // guardando aqui de propósito — diferente do resto do jogo, o modo
      // computador roda de PROPÓSITO com o pointer lock DESLIGADO (cursor
      // normal do sistema visível, ver `_acessarComputador3D`), então o guard
      // de pointerLock de outros atalhos não se aplica a este.
      if (e.code === 'Escape' && this._computadorAcessado) {
        e.preventDefault();
        this._sairDoComputador3D();
        return;
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
      // [13/09/2026] NOVO — "carro dirigível": tecla "E" sai do carro
      // quando `_carroControlado` está ativo. Escolhida por não conflitar
      // com NENHUM atalho já mapeado nesta função (checado antes de
      // escrever: WASD=andar, Shift=correr/gravidade, Espaço=pular/duplo-
      // toque=gravidade, Ctrl=tijolo em cadeia, Esc=cancelar/sair de
      // modos, 1-8=hotbar, Enter/Delete/Backspace/R/X = ferramentas de
      // construção, setas=voar sem gravidade — nenhuma usa "E" hoje).
      // Reaproveitada TAMBÉM pra entrar (ver `carro.model.js
      // onModelClick`, que chama `_entrarNoCarro` no CLIQUE do mouse no
      // carro, não em "E" — entrar é por clique, sair é por tecla,
      // assimetria intencional: não dá pra "clicar" no próprio carro de
      // dentro dele mirando o painel, e a maioria dos jogos usa uma tecla
      // dedicada só pra SAIR de um veículo).
      // [18/09/2026 UTC] RODADA 167 -- pegar/carregar equipamento de rede (E/Q/R): ver js/view3d-rede.js. `true` = tecla consumida.
      if (this._redeTeclas && this._redeTeclas(e)) return;
      if (e.code === 'KeyE' && this._carroControlado && !e.repeat) {
        e.preventDefault();
        this._sairDoCarro();
        return;
      }
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
      // [10/09/2026] RESTAURADO junto com o resto do bloco "ver através
      // desta câmera"/vanishCam (ver comentário grande em this._fotoCamMode,
      // mount()).
      if (e.code === 'Escape' && this._fotoCamMode) { this._exitFotoCameraView(); return; }
      // [10/09/2026] NOVO — mesmo padrão pro "orb de câmera" (ver
      // this._orbCamMode, mount()).
      if (e.code === 'Escape' && this._orbCamMode) { this._exitCameraOrbView(); return; }
      if (e.code === 'Escape' && this._wallChainStart) { this._wallChainStart = null; Utils.toast('Parede: cadeia cancelada.', { duration: 1500 }); return; }
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Ao pressionar esc no meio
      // de uma medida, então, ela deve ser desfeita." Mesmo padrão da
      // "cadeia de parede" logo acima — cancela o 1º ponto pendente e/ou a
      // âncora ativa da "📏 Trena 3D" (não desfaz medidas JÁ finalizadas,
      // só o que ainda está em andamento).
      // [18/09/2026 UTC] MUDANÇA (RODADA 154) — pedido verbatim: "Faça uma
      // pilha de ESC, para quando tiver segurado o ctrl e estiver
      // habilitado a linha âncora, poder retornar ao estado antes de fixar
      // a linha âncora, após um 1º ponto já definido, se der mais um esc,
      // então, deixa de interagir com a tela (que já é o funcionamento
      // normal)." Antes, este bloco cancelava P1 E âncora JUNTOS, de uma
      // vez só, não importa qual dos dois estivesse pendente — agora, com
      // uma âncora vertical já commitada (`_trena3DVerticalAnchor`), o
      // PRIMEIRO ESC desfaz SÓ a âncora (volta pro estado de "1º ponto já
      // definido, mirando o 2º, sem âncora fixada" — o `_trena3DPendingP1`
      // continua intacto); só um 2º ESC seguinte, agora sem âncora nenhuma
      // pendente, cai no `else` abaixo e cancela a medida inteira
      // (`_trena3DCancelarMedidaEmAndamento`, comportamento de sempre).
      if (e.code === 'Escape' && this._trena3D.temAncoraVertical()) {
        this._trena3D.desfazerAncoraVertical();
        Utils.toast('Trena 3D: linha âncora desfeita (1º ponto mantido).', { duration: 1500 });
        return;
      }
      if (e.code === 'Escape' && this._trena3D.temMedidaPendente()) {
        this._trena3D.cancelarMedidaEmAndamento();
        return;
      }
      // [16/09/2026 UTC] NOVO (RODADA 90) — pedido verbatim: "Às vezes, fica
      // travada a linha laranja tracejada perpendicular ao chão, tendo que
      // pressionar o ctrl para destravar [...] O pressionar do ESC fazer uma
      // desativação da linha laranja tracejada perpendicular ao chão para
      // resolver isso." Não foi possível confirmar a causa raiz exata do
      // "travamento" sem navegador nesta sessão (suspeita: alguma
      // combinação de `_trena3DLiveHeightLine.visible = true` setada num
      // quadro em que a config permitia, seguida de uma mudança de estado
      // que deveria escondê-la de novo mas não passou pelo `else` do bloco
      // — ex. `alvo` virando `null`/undefined no meio do caminho, o que
      // pularia tanto o `if` quanto o `else` daquele bloco, MAS não foi
      // possível reproduzir/confirmar). CORREÇÃO ROBUSTA pedida
      // explicitamente pelo usuário, independente da causa: ESC agora
      // força a ocultação desta linha (+ seu rótulo) TODA VEZ que a Trena
      // 3D estiver ativa, mesmo sem medida/âncora pendente nenhuma — o
      // bloco de ESC acima (`_trena3DCancelarMedidaEmAndamento`) só age
      // quando HÁ algo pendente; este aqui roda sempre que a ferramenta
      // está ativa, cobrindo justamente o caso relatado (linha visível
      // "solta", sem nenhum 1º ponto/âncora em andamento pra cancelar).
      if (e.code === 'Escape' && this._buildTool === 'trena3d') {
        this._trena3D.esconderLinhaAlturaAoVivo();
      }
      // [18/09/2026 UTC] NOVO (RODADA 154) — ver comentário grande junto de
      // `this._yawPitchFrozen = true`, no início deste handler. Todas as
      // ações PROGRAMADAS do ESC (linhas acima, desde o `if (e.code ===
      // 'Escape' && document.pointerLockElement)` até aqui) já rodaram —
      // libera a trava de yaw/pitch agora, exatamente como pedido: "Depois
      // que as funções do ESC são executadas, habilite a atualização do yaw
      // e do pitch novamente." `_pointerLockExitBlocking` continua ligada
      // (se tiver sido ligada acima) até `onPointerLockChange` confirmar a
      // saída de vez — cobre a parte assíncrona que este flag síncrono não
      // alcança sozinho.
      if (e.code === 'Escape') {
        this._yawPitchFrozen = false;
        this._v3dLog?.('keydown ESC — fim das ações programadas, yaw/pitch DESCONGELADOS');
      }
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
      // [19/09/2026 UTC] RODADA 192 — pedido verbatim: "Ao fazer uma medida
      // na 'Trena 3D' e estiver marcada a opção '⛓️ Medidas em sequência'
      // [...] ao pressionar o ENTER, deve concluir a medida em sequência,
      // não somente o ESC." Mesmo efeito do Esc quando há uma medida
      // pendente OU um grupo de sequência em aberto (ver
      // `Trena3D.cancelarMedidaEmAndamento`/`_trena3DCancelarMedidaEmAndamento`,
      // que já cobre os dois casos) — só dispara com a Trena 3D ativa,
      // igual ao Enter da Parede acima.
      if (e.code === 'Enter' && document.pointerLockElement === canvas && this._buildTool === 'trena3d') {
        this._trena3D.cancelarMedidaEmAndamento();
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
    const onKeyUp = (e) => {
      // [18/09/2026 UTC] NOVO (RODADA 147) — painel de debug de câmera, ver
      // comentário grande em `onKeyDown` (Escape) acima. Não há nenhuma
      // mudança de estado de yaw/pitch neste handler pra ESC (só o
      // `keydown`/`onClick`/`pointerlockchange` mexem nisso) — log único,
      // sem "antes/depois".
      if (e.code === 'Escape') this._v3dLog?.('keyup ESC');
      this._keys[e.code] = false;
    };
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
      // [18/09/2026 UTC] NOVO (RODADA 155) — guarda o instante (ms,
      // `performance.now()`) de cada clique esquerdo simples, num buffer de
      // no máximo 2 entradas — pedido do usuário: "a velocidade com que se
      // dá os dois cliques deve influenciar na velocidade com que a porta
      // abre." O navegador dispara 'click', 'click', 'dblclick' nessa
      // ordem pro mesmo par de cliques — `onDblClick`, mais abaixo, lê este
      // MESMO buffer (ainda com as 2 marcações do par que acabou de gerar o
      // duplo clique) pra calcular o intervalo real entre eles.
      this._v3dCliqueTimestamps = this._v3dCliqueTimestamps || [];
      this._v3dCliqueTimestamps.push(performance.now());
      if (this._v3dCliqueTimestamps.length > 2) this._v3dCliqueTimestamps.shift();
      // Modelador 3D ativo (ver onKeyDown acima) — não readquire o pointer
      // lock nem coloca/remove nada do View3D; o clique é do modelador
      // (seleção/gizmo/confirmar modal), tratado pelo listener PRÓPRIO dele.
      if (window.Modeler3D?.isActive?.()) return;
      // Sobrevoo automático do cenário (rodada 48 — ver _startSceneFlythrough/
      // onKeyDown acima): qualquer clique também cancela, igual a qualquer tecla.
      if (this._flythroughActive) { this._cancelFlythrough(); return; }
      // [10/09/2026] NOVO — pedido verbatim: "ao clicar em uma câmera e
      // selecionar 'Ver através desta câmera', deve ser possível interagir
      // com o cenário [...] ao clicar em um objeto com o botão esquerdo do
      // mouse, abre-se a janela em tamanho normal mesmo". `_fotoCamMode`/
      // `_orbCamMode` SAEM do Pointer Lock ao entrar (ver
      // _enterFotoCameraView/_enterCameraOrbView) — o resto deste handler,
      // daqui pra baixo, pressupõe navegação em 1ª pessoa TRAVADA (mira
      // central, requestPointerLock ao clicar destravado, ferramentas de
      // construção etc.) — nada disso faz sentido aqui. Usa o clique REAL
      // do mouse (posição de tela, não a mira central) via
      // `_pickAtClientPoint`/`_tryPick(hit)` (ambas novas, ver mais abaixo)
      // — o cartão/janela aberto é o MESMO de sempre (_showObjectCard3D/
      // _showFotoPinCard3D/etc., dentro de `_tryPick`), em tamanho normal,
      // porque nunca esteve dentro de nenhum elemento com zoom aplicado
      // (ver onWheel — o zoom passou a recalcular o FOV de verdade, não
      // mais um `transform:scale()` do CSS que pudesse afetar isto).
      if (this._fotoCamMode || this._orbCamMode) {
        const hit = this._pickAtClientPoint(e.clientX, e.clientY, canvas);
        if (hit) this._tryPick(hit);
        return;
      }
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
        // [15/09/2026 UTC] NOVO — pedido verbatim: "o apontamento atual da
        // câmera deve ser preservado ao pressionar 'esc'. E, ao clicar de
        // novo na tela para ativar o 'apontamento da câmera conforme o
        // movimentar do mouse', o apontamento deve partir do que já está
        // sendo mostrado na tela [...] não haverá um salto." A janela de
        // carência de `_pointerUnlockGraceUntil` (ver comentário grande em
        // `onKeyDown`/`onMouseMove` — hoje só ligada no ESC) cobre a
        // METADE do problema (sair do lock); esta é a outra metade
        // (ENTRAR de novo): `requestPointerLock()` também pode disparar um
        // `mousemove` sintético com `movementX/Y` grande no exato instante
        // em que o lock é concedido (o SO "recentraliza" o cursor de
        // verdade na tela) — sem nenhuma carência aqui, esse primeiro
        // evento sintético girava `this._camera.yaw/pitch` do nada,
        // exatamente o "salto" relatado ao reativar o apontamento. MESMA
        // janela de 300ms, MESMA flag — `onMouseMove` já checa isso antes
        // de qualquer outra coisa, então nenhuma mudança lá foi necessária.
        this._pointerLockReentering = true;
        // [18/09/2026 UTC] NOVO (RODADA 147) — painel de debug de câmera, ver
        // comentário grande em `onKeyDown` (Escape) acima. Log ANTES de
        // restaurar `_pointerLockSavedYaw/Pitch` abaixo.
        this._v3dLog?.('click reengajar (antes de restaurar)');
        // Restaura o vetor de apontamento salvo no ESC (ver onKeyDown acima)
        // — pedido verbatim (rodada 141): "ao clicar na tela novamente, volte
        // com o mesmo apontamento de câmera do personagem". Se não há nada
        // salvo (ex.: reengajando sem ter passado pelo ESC antes), mantém o
        // apontamento atual (comportamento anterior).
        if (this._camera && this._pointerLockSavedYaw != null) {
          this._camera.yaw = this._pointerLockSavedYaw;
          this._camera.pitch = this._pointerLockSavedPitch;
        }
        // [18/09/2026 UTC] NOVO (RODADA 146) — pedido verbatim: investigação
        // a fundo do "salto" da câmera ao pressionar ESC (com o mouse
        // comprovadamente PARADO, descartando de vez a hipótese de
        // `mousemove` sintético já investigada nas RODADAs 141/142). CAUSA
        // RAIZ ENCONTRADA (bug real e concreto, adjacente a este mesmo
        // mecanismo): `_pointerLockSavedYaw/Pitch` eram gravados a cada ESC
        // (linha ~13232 acima) e consumidos aqui pra restaurar o
        // apontamento — mas NUNCA eram limpos (voltados pra `null`) depois
        // de usados. Se o Pointer Lock for solto por QUALQUER caminho que
        // NÃO seja este ESC (ex.: a janela perder o foco, o navegador
        // soltar o lock sozinho por outro motivo — `onPointerLockChange`
        // trata esses casos também, ver mais abaixo) e o jogador reengajar
        // clicando de novo SEM ter passado por um ESC novo antes, este
        // bloco reaplicava o valor ANTIGO (de um ESC anterior, de sessões
        // de navegação passadas) em vez de manter o apontamento ATUAL —
        // exatamente um "salto" cujos números variam a cada vez (dependendo
        // de quando foi o último ESC de verdade), como relatado. CORRIGIDO:
        // zera os 2 campos logo depois de consumidos, pra nunca mais reagir
        // por um ESC antigo — a próxima reentrada, sem um ESC novo no meio,
        // agora mantém o apontamento atual (comportamento já existente pra
        // quando nunca houve ESC nenhum, ver comentário logo acima). NOTA
        // HONESTA: não foi possível reproduzir o cenário EXATO relatado
        // (câmera mudando com o mouse parado, SEM nenhum clique de
        // reengajamento no meio) num navegador de verdade nesta sessão (sem
        // Playwright, restrição permanente do projeto) — revisão linha por
        // linha de todo o fluxo `keydown` Escape/`onPointerLockChange`/
        // `onClick` não encontrou NENHUM outro ponto que mude
        // `this._camera.yaw/pitch` sem uma ação explícita (mousemove real
        // ou clique) — este bug de valor "preso"/obsoleto foi o único
        // mecanismo concreto encontrado capaz de produzir um salto cujos
        // números "variam" de uma vez pra outra, e fica corrigido aqui
        // mesmo sem 100% de certeza de ser exatamente o mesmo instante
        // relatado pelo usuário (ESC "puro", sem clique nenhum depois).
        // (hipóteses investigadas e descartadas nesta rodada).
        this._pointerLockSavedYaw = null;
        this._pointerLockSavedPitch = null;
        // [18/09/2026 UTC] NOVO (RODADA 147) — log DEPOIS de restaurar e
        // zerar `_pointerLockSavedYaw/Pitch` acima (ver comentário grande em
        // `onKeyDown`/Escape).
        this._v3dLog?.('click reengajar (depois de restaurar e zerar saved)');
        // requestPointerLock() devolve uma Promise em navegadores modernos e
        // REJEITA (SecurityError) se chamada rápido demais depois de sair de
        // um pointer lock anterior (cooldown de proteção do próprio
        // navegador contra spam de lock/unlock) — sem o catch, isso virava
        // "Uncaught (in promise) SecurityError" no console a cada clique
        // rápido demais; não é um bug funcional (o clique seguinte já
        // funciona normal), só ruído — silenciar aqui.
        canvas.requestPointerLock?.()?.catch?.(() => {});
      } else if (this._redeCargaSt) {
        // [18/09/2026 UTC] RODADA 167 -- carregando um equipamento de rede: o clique SOLTA/encaixa (ver view3d-rede.js).
        this._redeSoltar();
      } else if (this._caboLigSt) {
        // [18/09/2026 UTC] RODADA 169 -- modo "Ligar cabo clicando nas portas" ativo: o clique marca/
        // confirma a porta mirada (origem, depois destino) e liga o cabo -- ver view3d-rede.js.
        try { this._caboLigClique(); } catch (err) { console.error('[View3D] ligar cabo clicando nas portas falhou:', err); }
      } else if (this._caboMoldarSt) {
        // [19/09/2026 UTC] NOVO (RODADA 189) -- modo "Moldar cabo" ativo: o clique cria/pega um nó de
        // controle (1º clique) ou solta o que estava sendo arrastado (2º clique) -- ver view3d-rede.js.
        try { this._caboMoldarClique(); } catch (err) { console.error('[View3D] moldar cabo falhou:', err); }
      } else if (this._buildTool === 'remover') {
        // "Recolhedor" estilo Minecraft (pedido do usuário) — clique REMOVE
        // o que estiver mirado, com animação (ver _removeWithTool).
        this._removeWithTool();
      } else if (this._buildTool === 'orb') {
        // "📍 Adicionar orb" (pedido do usuário, 26/08/2026) — clique ABRE a
        // janela de busca de patrimônio pro objeto mirado (ver
        // _addOrbWithTool), em vez de colocar/remover algo na cena.
        this._addOrbWithTool();
      } else if (this._buildTool === 'trena3d') {
        // [16/09/2026 UTC] NOVO — pedido verbatim: "Dá para estender a
        // 'Trena' (da grade do mapa 2D) e dar a possibilidade de ficar 3D
        // nas duas extremidades de cada medida [...] Ao segurar o ctrl o
        // clique seguinte não finaliza a medida, mas estabelece uma
        // referência perpendicular ao chão [...] o clica seguinte (sem o
        // ctrl seguro, agora) vai ficar 'no ar'." Ver `_trena3DClick`
        // (lógica completa) — `e.ctrlKey` é o MESMO evento de clique do
        // navegador (disponível mesmo com Pointer Lock ativo).
        this._trena3D.click(!!e.ctrlKey);
      } else if (this._buildTool === 'tijolo') {
        // CORRIGIDO (08/09/2026, 38a rodada) — a colocação em si saiu
        // daqui e foi pro `mousedown` (ver `onMouseDownTijolo` abaixo) —
        // ver o comentário grande junto a ele pro motivo (o `click` só
        // dispara DEPOIS do botão já ter sido solto, impossibilitando a
        // colocação contínua com Ctrl+segurar). Nada a fazer aqui agora.
      } else if (this._buildTool === 'tijolo-pintar') {
        // NOVO (07/09/2026) — "novas ideias" pedidas ("pintar tijolos já
        // colocados"): clique mira um tijolo JÁ colocado e aplica a
        // cor/textura atual do menu nele (ver _paintTijoloClick).
        this._paintTijoloClick();
      } else if (this._buildTool) {
        // Ferramenta de construção ativa (hotbar) — clique COLOCA em vez de
        // selecionar/abrir a ficha (pedido do usuário: parede/porta/janela/
        // objeto/item colocáveis de dentro do 3D, "assim como no jogo
        // Minecraft").
        // [19/09/2026 UTC] NOVO (RODADA 185) -- `e.ctrlKey` repassado (mesma ideia da Trena 3D, linha
        // acima) -- ver `_placeWithBuildTool`.
        this._placeWithBuildTool(!!e.ctrlKey);
      } else {
        // [18/09/2026 UTC] RODADA 165 -- pedido verbatim: "Troque a logica do 'Ver em 3D' de
        // clicar em um objeto com o botao esquerdo do mouse para clicar com o botao direito
        // do mouse. Para que o duplo clique possa ter a sua funcao executada, se nao o clique
        // acaba sendo capturado e nao o duplo clique." O clique ESQUERDO simples nao abre mais
        // ficha/cartao nem dispara onClick (o 1o clique do par do duplo clique era engolido
        // por isso): quem faz isso agora e o botao DIREITO (ver `onContextMenu`, `_tryPick()`
        // ao final). Toque (celular) continua chamando `_tryPick` no `touchend`.
        // [18/09/2026 UTC] RODADA 166 -- REVISADO apos teste no Chrome ("ao clicar com o botao
        // direito o menu nao aparece"): o Chromium nao entrega 'contextmenu' com Pointer Lock.
        // NOVA REGRA: MODO NAVEGACAO interage por DOIS CLIQUES (`onDblClick`); MODO EDICAO
        // (`_modelarObjetosHabilitado`) mostra as opcoes com o clique ESQUERDO. O botao direito
        // volta a ser so o hook `onModelContextmenu`.
        if (this._modelarObjetosHabilitado) {
          try { this._cliqueEdicao3D(); } catch (err) { console.error('[View3D] clique no Modo Edicao falhou:', err); }
        }
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
      // NOVO (08/09/2026, 38a rodada), pedido verbatim: "Ao selecionar
      // 'Cunha / rampa' e clicar com o botão do meio do mouse a cunha deve
      // girar 90 graus a cada clique. Resetando apenas quando troca para
      // 'Caixa'." -- `await` não é permitido aqui (handleMiddleClickAction
      // é síncrona, chamada direto do handler de clique) -- dispara
      // Tijolos.setConfig (assíncrono) sem esperar, mesmo padrão "fire and
      // forget" já usado noutros salvamentos de config desta tela que não
      // precisam bloquear a interação; `_renderTijoloPanel()` (também sem
      // esperar) atualiza o <select> #tj-rotY pra refletir o novo valor.
      if (this._buildTool === 'tijolo') {
        Tijolos.getConfig().then((cfg) => {
          if ((cfg.formato || 'caixa') !== 'cunha') return;
          const novoRotY = ((cfg.rotY || 0) + 90) % 360;
          Tijolos.setConfig({ rotY: novoRotY }).then(() => this._renderTijoloPanel());
        });
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
      // NOVO (08/09/2026, 38a rodada) -- ver comentário grande acima:
      // Modelador ativo = a órbita do botão do meio é DELE (modeler-input.js),
      // não do View3D.
      if (window.Modeler3D?.isActive?.()) return;
      e.preventDefault();
      this._middleButtonHeld = true;
    };
    canvas.addEventListener('mousedown', onMouseDownMiddle);
    const onMouseUpMiddle = (e) => {
      if (e.button !== 1) return;
      // NOVO (08/09/2026, 39a rodada) -- MESMO guard ja aplicado em
      // onMouseDownMiddle/onMouseMove/onClick (ver comentarios la): faltava
      // aqui, unico dos 4 handlers de botao do meio sem ele -- inofensivo
      // por si so (so zera uma flag do View3D), mas fica consistente com os
      // demais e evita zerar 'this._middleButtonHeld' por engano se o
      // botao do meio for solto ainda com o Modelador ativo.
      if (window.Modeler3D?.isActive?.()) return;
      this._middleButtonHeld = false;
    };
    document.addEventListener('mouseup', onMouseUpMiddle);
    // NOVO (07/09/2026), pedido verbatim: "Ao segurar o ctrl, vai adicionando
    // um após o outro no mesmo nível de altura... com o ctrl pressionado,
    // clica e mantém pressionado o botão esquerdo do mouse" — rastreia SE o
    // botão ESQUERDO está fisicamente pressionado (`this._tijoloMouseDown`),
    // consultado a cada quadro por `_updateTijoloDrag` (ver mais abaixo).
    // O `click` sozinho (`onClick`, mais acima) já cuida da colocação do
    // 1º tijolo; este par mousedown/mouseup só existe pra saber se o botão
    // CONTINUA pressionado nos quadros seguintes (um `click` não informa
    // isso). Mesmo padrão de guard do meio-do-mouse acima: só liga dentro
    // do Pointer Lock, e o mouseup fica no `document` (não só no canvas)
    // pra não "grudar" pressionado caso o usuário solte o botão fora da
    // área do canvas.
    const onMouseDownTijolo = (e) => {
      if (e.button !== 0 || document.pointerLockElement !== canvas) return;
      if (this._buildTool !== 'tijolo') return;
      this._tijoloMouseDown = true;
      // CORRIGIDO (08/09/2026, 38a rodada) — ver comentário grande em
      // `onClick` acima: a colocação (e a decisão de armar ou não a sessão
      // de arrasto contínuo, dentro de `_placeTijoloClick`) precisa
      // acontecer AQUI, no `mousedown`, com o botão ainda genuinamente
      // pressionado — nunca no `click` (que só dispara depois do
      // `mouseup`, quando já é tarde demais pra continuar colocando com o
      // botão "segurado").
      this._placeTijoloClick();
    };
    canvas.addEventListener('mousedown', onMouseDownTijolo);
    const onMouseUpTijolo = (e) => { if (e.button === 0) this._tijoloMouseDown = false; };
    document.addEventListener('mouseup', onMouseUpTijolo);
    // Botão direito: não faz mais nada nesta tela (a rotação/conclusão de
    // parede passou pro botão do meio, ver acima) — só suprime o menu de
    // contexto nativo do navegador pra não aparecer por cima da cena 3D.
    const onContextMenu = (e) => {
      e.preventDefault();
      // NOVO (08/09/2026, 38a rodada), pedido verbatim: "Para simplificar,
      // quando a ferramenta for ativa e só serve para ela, o botão direito
      // do mouse servirá para excluir o tijolo." -- só age com a ferramenta
      // 🔘 Tijolo ativa (não com 🎨 Pintar, que já usa o clique esquerdo
      // pra outra coisa) e dentro do Pointer Lock (mesmo guard de sempre).
      if (this._buildTool === 'tijolo' && document.pointerLockElement === canvas) {
        const ray = this._engine.centerRay(this._camera);
        const hit = Tijolos.raycastTijolos(ray.origin, ray.dir, this._map.tijolos || []);
        if (!hit) return;
        Tijolos.remove(this._map, hit.id);
        this._engine.rebuildTijolos?.(this._map);
        DB.saveMap(this._map);
        Utils.toast('Tijolo removido 🗑️', { type: 'ok', duration: 1200 });
        return;
      }
      // [14/09/2026] NOVO — pedido verbatim: "implementar os outros eventos
      // de mouse [...] oncontextmenu → clique com o botão direito." Fora da
      // ferramenta 🔘 Tijolo (tratada acima) e sem nenhuma ferramenta de
      // construção ativa, o botão direito agora também dispara
      // onModelContextmenu/onInstanceContextmenu (ver
      // js/objectassets.js `dispatchMouseEvent3D`) pro objeto mirado —
      // MESMO raycaster de mira central do clique esquerdo comum
      // (`_tryPick`), só que sem abrir nenhum cartão por padrão (o hook é
      // inerte até o usuário descomentar algo em algum
      // assets/modelos/<tipo>.model.js).
      if (this._buildTool || document.pointerLockElement !== canvas) return;
      // [13/09/2026] CORRIGIDO — pedido do usuário: "ao clicar em um objeto
      // no cenário, agora, é como se tivesse pressionado ESC." Não foi
      // possível reproduzir/confirmar ao vivo (sem navegador nesta sessão),
      // mas este listener novo (`contextmenu`) e o de `dblclick` logo
      // abaixo são os únicos candidatos plausíveis introduzidos nesta
      // rodada — correção DEFENSIVA: `e.stopPropagation()` aqui garante que
      // este evento nunca "vaza" pra nenhum outro listener de
      // `contextmenu`/`click` porventura anexado mais acima (`document`/
      // `window`) que pudesse interpretar o clique como um cancelamento; e
      // o `try/catch` em volta de `_dispatchMouseHit3D` garante que uma
      // eventual exceção dentro de um hook `onModelContextmenu`/
      // `onInstanceContextmenu` de terceiros (ver assets/modelos|
      // instancias/*.js) nunca escape e interrompa nenhum outro código
      // deste mesmo handler ou de handlers seguintes.
      e.stopPropagation();
      let consumido = false;
      try { consumido = this._dispatchMouseHit3D('Contextmenu') === true; } catch (err) { console.error('[View3D] onModelContextmenu/onInstanceContextmenu falhou:', err); }
      // [18/09/2026 UTC] RODADA 166 -- o botao direito NAO abre mais fichas/menus (Chrome nao
      // entrega 'contextmenu' com Pointer Lock): so o hook. Opcoes = clique esquerdo no Modo Edicao.
    };
    canvas.addEventListener('contextmenu', onContextMenu);
    // [14/09/2026] NOVO — "ondblclick → clique duplo." Mesmo espírito do
    // botão direito acima: só dispara onModelDoubleClick/
    // onInstanceDoubleClick (hook inerte por padrão) pro objeto mirado,
    // sem nenhuma ferramenta de construção ativa.
    const onDblClick = (e) => {
      if (this._buildTool || document.pointerLockElement !== canvas) return;
      // [18/09/2026 UTC] RODADA 166 -- dois cliques interagem SO no Modo Navegacao; no Modo Edicao
      // o clique esquerdo (ja tratado em `onClick`) abre as opcoes.
      if (this._modelarObjetosHabilitado) return;
      // [13/09/2026] CORRIGIDO — mesma correção defensiva do `contextmenu`
      // acima (ver comentário grande lá): isola este evento (stopPropagation)
      // e blinda o despacho do hook com try/catch, pro clique duplo nunca
      // poder interferir em nenhum outro listener/card já aberto.
      e.stopPropagation();
      // [18/09/2026 UTC] NOVO (RODADA 155) — calcula o intervalo real (ms)
      // entre os 2 cliques do par que gerou este 'dblclick', a partir do
      // buffer preenchido em `onClick` acima, e guarda em
      // `this._ultimoIntervaloDuploCliqueMs` — QUALQUER Script (porta ou
      // não) pode ler este número (ele é exposto ao código colado pelo
      // usuário como `view3d._ultimoIntervaloDuploCliqueMs`, ver
      // `js/components.js` `_getOrCreateModule`, parâmetro `view3d`) pra
      // decidir uma velocidade de animação proporcional — ver
      // `assets/exemplos/_exemplo-script-porta-*.txt`. 300ms é só um
      // "chute" plausível de fallback pro caso raríssimo do buffer não ter
      // as 2 marcações esperadas (ex.: um 'dblclick' sintético disparado
      // por algum código de terceiros sem passar pelos 2 'click' normais).
      const ts = this._v3dCliqueTimestamps;
      this._ultimoIntervaloDuploCliqueMs = (Array.isArray(ts) && ts.length === 2)
        ? Math.max(1, Math.round(ts[1] - ts[0]))
        : 300;
      try { this._dispatchMouseHit3D('DoubleClick'); } catch (err) { console.error('[View3D] onModelDoubleClick/onInstanceDoubleClick falhou:', err); }
    };
    canvas.addEventListener('dblclick', onDblClick);

    const onMouseMove = (e) => {
      // [11/09/2026] CORRIGIDO — pedido verbatim: "no 'Ver em 3D', ao
      // clicar em uma câmera e selecionar 'Ver através desta câmera', no
      // Modelador, ao clicar no gizmo para mover o objeto para o lado o
      // cursor muda e fica travado, passando a coexistir os dois cursores:
      // o normal e o do pointer lock. Mesmo sem estar mais com o botão
      // esquerdo do mouse pressionado." CAUSA RAIZ: o guard
      // `window.Modeler3D?.isActive?.()` já existia mais abaixo nesta MESMA
      // função (ver comentário "38a rodada" perto do fim), mas só depois do
      // bloco `if (this._fotoCamMode || this._orbCamMode)` logo abaixo —
      // ou seja, com a câmera-vista combinada com o Modelador, esse bloco
      // rodava SEM guard nenhum, em TODO `mousemove`, e terminava sempre em
      // `canvas.style.cursor = 'move'` ou `canvas.style.cursor = ''` (ver
      // as 2 atribuições dentro do bloco) — isso reescrevia por cima do
      // `canvas.style.cursor = 'none'` que o PRÓPRIO Modelador aplica
      // durante o arraste de gizmo com Pointer Lock (cursor "infinito",
      // ver `_updateFakeCursor` em modeler-input.js) a cada movimento do
      // mouse, trazendo o cursor OS de volta a aparecer POR CIMA do cursor
      // falso (cruz) do Modelador — daí os "dois cursores coexistindo".
      // Como o reset acontecia em QUALQUER `mousemove`, não só durante o
      // arraste, o sintoma também sobrevivia ao soltar o botão esquerdo
      // (bastava mexer o mouse depois). CORRIGIDO: move o mesmo guard já
      // usado por `onClick`/`onMouseDownMiddle`/`onMouseDownTijolo` (nesta
      // mesma função) pro TOPO — com o Modelador ativo, é sempre ELE quem
      // decide cursor/seleção/gizmo (ver modeler-input.js), o View3D nunca
      // deve mexer em `canvas.style.cursor` por cima.
      if (window.Modeler3D?.isActive?.()) return;
      // [10/09/2026] NOVO — pedido verbatim: "o cursor do mouse deve
      // aparecer para ir apontando para as coisas, poder selecioná-las".
      // `_fotoCamMode`/`_orbCamMode` SAEM do Pointer Lock ao entrar (ver
      // _enterFotoCameraView/_enterCameraOrbView) — todo o resto desta
      // função (girar a câmera arrastando o mouse travado, cursor virtual
      // etc.) não se aplica aqui, por isso este bloco fica ANTES de
      // qualquer guard de `pointerLockElement` e sempre retorna cedo. A
      // seleção de verdade acontece no `click` (ver onClick,
      // `_pickAtClientPoint`/`_tryPick`) — este bloco só mantém
      // `Engine3D.setHoverScreenPoint` atualizado (ver `_pickAtClientPoint`
      // logo abaixo) pro destaque de mira de sempre (contorno pontilhado
      // etc.) seguir o cursor. [10/09/2026] CORRIGIDO — pedido verbatim:
      // "Ao mirar em um objeto, ele deve ter o mesmo destaque que tem
      // quando não se está nesse modo [...] Não precisa ser o ícone da
      // mão, no cursor do mouse, pode ser a seta mesmo." O destaque em si
      // (contorno pontilhado/hitbox/tightbox, conforme a config) já
      // comunica "isto está mirado" — o cursor NUNCA mais vira "mão"
      // aqui, fica sempre a seta padrão do sistema (`''`).
      if (this._fotoCamMode || this._orbCamMode) {
        // [10/09/2026] Gatilho: Shift + BOTÃO DO MEIO DO MOUSE segurado
        // (`e.buttons & 4`, bit do botão do meio em `MouseEvent.buttons` —
        // sempre disponível em `mousemove`, com ou sem Pointer Lock; aqui
        // NÃO há Pointer Lock, então não dá pra reaproveitar direto
        // `this._middleButtonHeld`, que só é ligado por `onMouseDownMiddle`
        // sob o guard `pointerLockElement === canvas`). CORRIGIDO (pedido
        // verbatim, com 2 capturas do Blender): "O shift+ botão do meio do
        // mouse não pode mudar a perspectiva. A perspectiva deve ser
        // preservada [...] É como pegar uma foto e só movê-la para o
        // lado, a foto não muda, mas a posição sim." Por isso NÃO É MAIS
        // um deslocamento de posição no mundo (3D, eixos direita/cima da
        // câmera) — é um deslocamento de "lente"/janela de projeção em
        // 2D, puramente na tela: `off.x`/`off.y` acumulam frações da
        // largura/altura do CANVAS (não do mundo), na MESMA direção do
        // arrasto do mouse (arrastar pra direita "puxa a foto" pra
        // direita, como segurar uma foto de verdade) — aplicadas de
        // verdade em `camera3` via `Engine3D.setCamPanFrac` (ver _loop,
        // logo antes de `this._engine.render(renderCam)`; a fórmula/o
        // porquê do sinal invertido internamente está documentada lá).
        if (e.shiftKey && (e.buttons & 4)) {
          const rect = canvas.getBoundingClientRect();
          const off = this._camViewPanOffset || (this._camViewPanOffset = { x: 0, y: 0 });
          off.x += (e.movementX || 0) / (rect.width || canvas.clientWidth || 1);
          off.y += (e.movementY || 0) / (rect.height || canvas.clientHeight || 1);
          // [10/09/2026] NOVO — pedido verbatim: "A foto é para ser
          // carregada dentro do enquadramento e deve permanecer dentro do
          // enquadramento, com o shift+botão do meio do mouse." Sem isto,
          // a foto-guia (imagem plana) ficava parada enquanto só a cena
          // 3D (via lens-shift, `Engine3D.setCamPanFrac` em `_loop`)
          // deslocava — ver comentário grande em
          // `_updateFotoCamOverlayZoomScale` pro "porquê"/fórmula do
          // `translate()` que ela aplica agora.
          this._updateFotoCamOverlayZoomScale();
          canvas.style.cursor = 'move';
          return;
        }
        // [10/09/2026] `_pickAtClientPoint` chamado só pelo efeito colateral
        // de atualizar `Engine3D.setHoverScreenPoint` (ver comentário
        // grande acima) — o "hit" em si não decide mais o cursor.
        this._pickAtClientPoint(e.clientX, e.clientY, canvas);
        canvas.style.cursor = '';
        return;
      }
      // Janela de carência do ESC/unlock (rodada 50 — ver onKeyDown/
      // onPointerLockChange) — checada ANTES até do guard de
      // `pointerLockElement` logo abaixo, de propósito: o "salto" sintético
      // do cursor pode chegar num instante em que `pointerLockElement`
      // ainda aponta pro canvas (o guard sozinho não pega), então esta
      // checagem de TEMPO precisa vir primeiro. Baseada em tempo real (não
      // um flag de 1 evento só) pra cobrir também o caso de o navegador
      // disparar mais de um `mousemove` sintético nessa janela.
      // [18/09/2026 UTC] RODADA 141 — guard baseado só em flag/evento, sem
      // timer (ver comentário grande junto a `_pointerLockReentering`, no
      // construtor). Descarta o `mousemove` sintético (girava yaw/pitch do
      // nada) e desliga a flag — cobre tanto sair (ESC) quanto reentrar
      // (clique), com a flag religada em `onPointerLockChange` abaixo se
      // ainda houver mais de um evento sintético em sequência.
      // [18/09/2026 UTC] NOVO (RODADA 142) — ver comentário grande junto de
      // `_pointerLockExitBlocking` em `onKeyDown` (Escape) — descarta TODO
      // `mousemove` (não só 1) durante a janela de transição de SAÍDA do
      // Pointer Lock, até `onPointerLockChange` confirmar (desliga a flag
      // lá). Checado ANTES até do guard de 1-evento abaixo (`_pointerLockReentering`,
      // que cobre a janela de ENTRADA/retomada, intacta desde a RODADA 141).
      if (this._pointerLockExitBlocking) {
        // [18/09/2026 UTC] NOVO (RODADA 147) — painel de debug de câmera, ver
        // comentário grande em `onKeyDown` (Escape). mousemove DESCARTADO
        // pelo guard `_pointerLockExitBlocking` — yaw/pitch NÃO mudam aqui.
        // [18/09/2026 UTC] NOVO (RODADA 152) — pedido verbatim: "O dx e o dy
        // [...] podem ser úteis também, quanto a variação de seus valores
        // nesse momento." dx/dy do evento DESCARTADO agora entram no log
        // (antes só apareciam nos `mousemove processado`) — deixa visível o
        // tamanho de verdade do "salto" que cada guard está bloqueando,
        // mesmo quando ele nunca chega a mexer em yaw/pitch.
        this._v3dLog?.(`mousemove DESCARTADO (_pointerLockExitBlocking) — dx=${Math.round(e.movementX || 0)} dy=${Math.round(e.movementY || 0)}`);
        return;
      }
      if (this._pointerLockReentering) {
        this._pointerLockReentering = false;
        // [18/09/2026 UTC] NOVO (RODADA 147) — idem acima, guard
        // `_pointerLockReentering` (janela de 1 evento ao reentrar).
        // [18/09/2026 UTC] NOVO (RODADA 152) — idem ao guard acima, dx/dy do
        // evento descartado no log (ver comentário grande lá).
        this._v3dLog?.(`mousemove DESCARTADO (_pointerLockReentering) — dx=${Math.round(e.movementX || 0)} dy=${Math.round(e.movementY || 0)}`);
        return;
      }
      // [17/09/2026 UTC] NOVO — rodada 126, pedido verbatim: "o apontamento
      // da câmera acaba ficando diferente ao ser retomado [...] em algumas
      // situações. Isto deve ser assim, sempre." Causa raiz do "algumas
      // situações" que sobrava mesmo com a janela de tempo acima
      // (`_pointerUnlockGraceUntil`, ligada em `onClick` ANTES de chamar
      // `requestPointerLock()`, com 300ms fixos): `requestPointerLock()` é
      // assíncrono e o navegador pode demorar a conceder o lock de verdade
      // — ex.: logo depois de um unlock anterior, o Chrome aplica um
      // cooldown interno antes de aceitar um novo pedido (é por isso que
      // já existe o `.catch()` silencioso ali, pra engolir o SecurityError
      // de pedidos rejeitados) — nesses casos o `pointerlockchange` que
      // concede o lock de verdade podia chegar DEPOIS dos 300ms da janela
      // por tempo já terem se esgotado, deixando o `mousemove` sintético
      // (o SO "recentralizando" o cursor ao conceder o lock) passar direto
      // pelo guard de tempo e girar `yaw`/`pitch` do nada — exatamente o
      // salto relatado, só que intermitente (só quando o lock demorava mais
      // que a janela fixa). Corrigido com um 2º mecanismo, por EVENTO em vez
      // de por TEMPO: `_pointerAwaitingFirstMoveAfterLock` é ligado em
      // `onPointerLockChange` (abaixo) no exato instante em que
      // `document.pointerLockElement` passa a apontar pro canvas de novo
      // (não importa quanto tempo isso levou) e descarta SÓ o primeiro
      // `mousemove` daí em diante — não expira sozinho, então cobre
      // qualquer atraso do navegador em conceder o lock.
      if (document.pointerLockElement !== canvas) return;
      // NOVO (08/09/2026, 38a rodada) -- MESMO guard de onMouseDownMiddle/
      // onClick acima: com o Modelador ativo, é ELE quem decide o que
      // acontece com o movimento do mouse (seleção/gizmo/órbita própria,
      // ver modeler-input.js) -- o View3D girar `this._camera.yaw/pitch`
      // (ou fazer o pan de Shift+meio) POR CIMA disso é exatamente a causa
      // do bug relatado ("só o objeto selecionado é que está interagindo
      // com a câmera, o mundo inteiro deveria"): os dois sistemas de
      // órbita competiam pelos MESMOS eventos de movementX/Y.
      // [11/09/2026] Este guard ficou REDUNDANTE (nunca mais executa,
      // sempre retorna antes, no guard idêntico movido pro TOPO da função —
      // ver comentário grande lá, correção do bug do "cursor duplo" com
      // câmera-vista + Modelador) — mantido aqui mesmo assim, sem remover,
      // por segurança/clareza histórica (documenta a mesma razão de sempre
      // pra quem só ler este trecho isolado).
      if (window.Modeler3D?.isActive?.()) return;
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
      // [18/09/2026 UTC] NOVO (RODADA 150) — snapshot do yaw/pitch de ANTES
      // deste movimento, com o instante exato — ver comentário grande junto
      // de `_camLastMoveSnapshot` (constructor) e o uso em
      // `onPointerLockChange` (fallback do "salto" sem `keydown ESC`).
      // Sempre atualizado (todo `mousemove` que chega até aqui já passou
      // pelos guards de Pointer Lock acima), custo desprezível (1 objeto
      // pequeno, sobrescrito a cada evento, sem acumular histórico).
      // [18/09/2026 UTC] NOVO (RODADA 154) — pedido verbatim: "desabilite a
      // atualização do yaw e do pitch" enquanto o ESC estiver processando
      // suas ações programadas (ver `this._yawPitchFrozen`, ligada/desligada
      // em `onKeyDown`). Guard colocado bem no ponto exato da mutação (não
      // mais cedo na função) — as demais coisas que `onMouseMove` já fazia
      // antes de chegar aqui (cursor virtual, hover, pan de câmera fixa,
      // etc.) continuam rodando normalmente, só o giro yaw/pitch em si fica
      // suspenso.
      if (this._yawPitchFrozen) {
        this._v3dLog?.(`mousemove DESCARTADO (_yawPitchFrozen) — dx=${Math.round(e.movementX || 0)} dy=${Math.round(e.movementY || 0)}`);
        return;
      }
      this._camLastMoveSnapshot = { yaw: this._camera.yaw, pitch: this._camera.pitch, t: performance.now() };
      this._camera.yaw += (e.movementX || 0) * 0.0022;
      this._camera.pitch = Utils.clamp(this._camera.pitch + (e.movementY || 0) * 0.0022, -1.3, 1.3);
      // [18/09/2026 UTC] NOVO (RODADA 147) — painel de debug de câmera, ver
      // comentário grande em `onKeyDown` (Escape). mousemove PROCESSADO
      // normalmente (girou a câmera) — loga o delta aplicado junto do
      // yaw/pitch resultante.
      this._v3dLog?.(`mousemove processado (dx=${Math.round(e.movementX || 0)} dy=${Math.round(e.movementY || 0)})`);
    };
    document.addEventListener('mousemove', onMouseMove);

    // Rolar o mouse, com a ferramenta Objeto/Item ativa, passeia pela
    // respectiva lista (catálogo de objetos / patrimônios sem lugar) —
    // pedido do usuário: "dá para usar o rolar do mouse para percorrer a
    // lista de objetos ou de itens o que estiver selecionado". Só faz
    // sentido com o ponteiro travado (dentro do jogo) — fora disso, deixa a
    // página rolar normal (não faz preventDefault).
    const onWheel = (e) => {
      // [10/09/2026, REESCRITO] pedido original: "Assim como no Blender,
      // quando se seleciona uma câmera para ver através dela, a roda do
      // mouse deve funcionar como zoom in e zoom out [...] a perspectiva
      // gerada no retângulo formado pela vista da câmera deve ser
      // preservada." Correção do usuário na rodada seguinte, MESMO dia:
      // "ao dar zoom, não deve dar uma mera ampliação da imagem. Deve sim
      // preservar a perspectiva, mas reconstruindo o desenho da cena (para
      // que as coisas fiquem nítidas)" + "o botão/grupo de botões para
      // fechar a câmera não deve dar zoom junto" + "o zoom in deve ser
      // maior. O zoom out deve estender para além do enquadramento da
      // câmera". A 1ª versão (CSS `transform:scale()` no wrapper do
      // canvas) foi SUBSTITUÍDA — ver comentário grande em `_resetCamZoom`/
      // `_CAMVIEW_ZOOM_FOV_MIN/MAX` pra explicação completa da técnica
      // nova (FOV real, `Engine3D.setFov`, o mesmo motor de sempre
      // recalculando e redesenhando a cena — sempre nítido); resolve os 3
      // itens de uma vez: reconstrução de verdade (não mera ampliação),
      // faixa bem mais ampla que o enquadramento calibrado de qualquer
      // câmera (zoom in mais forte E zoom out além do normal), e os
      // botões de controle nunca foram tocados por nenhum `transform`
      // (só a foto-guia recebe uma compensação própria, ver
      // `_updateFotoCamOverlayZoomScale`). Vale tanto pro "ver através" de
      // um orb de foto (`_fotoCamMode`) quanto pro "orb de câmera" travado
      // de verdade (`_orbCamMode`) — os 2 únicos modos onde a visão fica
      // "presa" a uma câmera calibrada.
      // ANTES desta guarda: `_camMode`/`_fotoCamMode`/`_orbCamMode` SAEM do
      // Pointer Lock ao entrar (`document.exitPointerLock?.()`, ver
      // `_enterCameraView`/`_enterFotoCameraView`/`_enterCameraOrbView`),
      // então o `if (document.pointerLockElement !== e.currentTarget)
      // return;` logo abaixo (guarda de TODO o resto desta função, pensada
      // pra navegação em 1ª pessoa travada) sempre barraria a roda do mouse
      // nesses 3 modos — por isso este bloco novo fica ANTES dela, não
      // depois.
      if (this._fotoCamMode || this._orbCamMode) {
        e.preventDefault();
        const cfg = this._fotoCamMode || this._orbCamMode;
        // Rolar "pra frente" (deltaY<0, longe de quem usa o mouse — mesma
        // convenção já usada pelo `_camMode` legado logo abaixo) = zoom IN
        // = FOV MENOR. Fator multiplicativo (não aditivo, ao contrário do
        // `_camMode` legado) pra sentir consistente tanto perto de 5° (zoom
        // in extremo) quanto perto de 140° (zoom out extremo).
        const fator = e.deltaY < 0 ? (1 / 1.12) : 1.12;
        cfg.zoomFov = Utils.clamp(cfg.zoomFov * fator, this._CAMVIEW_ZOOM_FOV_MIN, this._CAMVIEW_ZOOM_FOV_MAX);
        this._engine?.setFov?.(cfg.zoomFov);
        // [13/09/2026 — ITEM F, REFINADO 14/09/2026] pedido verbatim (rodada
        // 13/09): "faça o zoom ir em direção aonde o mouse está apontando".
        // Pedido verbatim de REFINAMENTO (14/09/2026): "deve funcionar tanto
        // ao ampliar quanto ao reduzir" (antes só tratava zoom IN) e "a
        // 'posição relativa' deve ser calculada em relação à posição do
        // retângulo amarelo já desenhado no canvas (não em relação ao canto
        // do canvas inteiro nem ao centro da tela)" — antes usava
        // `canvas.getBoundingClientRect()` puro (canto/centro do CANVAS) como
        // referência; agora usa `_activeCamFrameRectPx()` (o "retângulo
        // amarelo"/quadro calibrado — MESMA função usada pelo `<img>`/plano
        // do backdrop, ver comentário grande dela). Reaproveita o MESMO
        // deslocamento de "lente" já usado pelo pan Shift+botão-do-meio
        // (`_camViewPanOffset`/`Engine3D.setCamPanFrac`, ver onMouseMove/
        // _loop acima) em vez de girar `yaw`/`pitch` da câmera de verdade —
        // evita reabrir a lógica de pose travada (`_orbCamLockedPose`/
        // `_computeFotoCamPose`, recalculada do zero todo quadro) e continua
        // 100% compatível com a foto-guia (que já lê `_camViewPanOffset` em
        // `_updateFotoCamOverlayZoomScale`).
        {
          const frame = this._activeCamFrameRectPx();
          const rect = canvas.getBoundingClientRect();
          const prevOff = this._camViewPanOffset || { x: 0, y: 0 };
          // Centro ATUAL na tela do retângulo amarelo — `_activeCamFrameRectPx`
          // sozinha sempre devolve um retângulo CENTRADO no canvas (ignora
          // pan de propósito, ver comentário dela), mas o retângulo amarelo
          // DE VERDADE (objeto 3D real, engine3d.js) já pode estar deslocado
          // na tela por um pan anterior (`prevOff`, aplicado como lens-shift
          // de verdade em `camera3` — desloca TUDO que é renderizado,
          // inclusive o retângulo amarelo) — sem somar `prevOff` aqui, um
          // 2º/3º passo de zoom sobre um pan já existente ia convergir pro
          // lugar ERRADO (o centro "de fábrica", não o centro real atual).
          const frameCenterX = frame.left + frame.width / 2 + prevOff.x * frame.cw;
          const frameCenterY = frame.top + frame.height / 2 + prevOff.y * frame.ch;
          // [11/09/2026] CORRIGIDO — pedido verbatim: "ao centro do canvas o
          // zoom deve ser direcionado para ali." ANTES o ponto de
          // convergência era a posição do CURSOR (`e.clientX/Y`, pedido
          // explícito de uma rodada anterior) — trocado agora pelo CENTRO DO
          // CANVAS (`rect.width/2`, `rect.height/2`), fixo, independente de
          // onde o mouse está. Na prática, isso faz o zoom ir sempre
          // "recentrando" o retângulo amarelo/a foto no meio do canvas
          // conforme se aproxima/afasta — desfazendo aos poucos qualquer
          // deslocamento feito antes pelo pan de Shift+botão-do-meio (ver
          // `off.x/y` mais abaixo, mesma fórmula de sempre, só que agora
          // convergindo pro centro do canvas em vez do cursor).
          const centerPxX = rect.width / 2;
          const centerPxY = rect.height / 2;
          // `cx`/`cy` = posição do centro do canvas relativa ao CENTRO do
          // retângulo amarelo (não do cursor), em fração do PRÓPRIO
          // retângulo (-0.5..0.5 dentro dele).
          const cx = frame.width > 0.0001 ? (centerPxX - frameCenterX) / frame.width : 0;
          const cy = frame.height > 0.0001 ? (centerPxY - frameCenterY) / frame.height : 0;
          // `off.x`/`off.y` (`_camViewPanOffset`) são fração do CANVAS (não
          // do retângulo amarelo — mesma unidade que `Engine3D.setCamPanFrac`
          // espera, ver Shift+MMB acima) — converte a fração (relativa ao
          // retângulo amarelo) pra essa mesma unidade antes de aplicar,
          // multiplicando pela proporção retângulo/canvas — preserva o PONTO
          // físico de convergência (o pixel sob o cursor) trocando só a
          // referência/escala usada pra descrevê-lo.
          const off = this._camViewPanOffset || (this._camViewPanOffset = { x: 0, y: 0 });
          const EASE = 0.15;
          const fracToCanvasX = frame.cw > 0 ? frame.width / frame.cw : 1;
          const fracToCanvasY = frame.ch > 0 ? frame.height / frame.ch : 1;
          // [14/09/2026] Antes só rodava em `e.deltaY < 0` (zoom IN); pedido
          // de refinamento explícito: "tanto ao ampliar quanto ao reduzir" —
          // convergência agora roda nos 2 sentidos, sinal do `EASE` não muda
          // (converge pro cursor tanto aproximando quanto afastando).
          off.x += (-cx * fracToCanvasX - off.x) * EASE;
          off.y += (-cy * fracToCanvasY - off.y) * EASE;
        }
        this._updateFotoCamOverlayZoomScale();
        return;
      }
      // [10/09/2026] CORRIGIDO — bug relatado: "com a ferramenta 'Objeto'
      // ativa, rolar a roda do mouse não está mais trocando entre os
      // objetos". Antes conferia `document.pointerLockElement !== canvas`
      // usando a variável `canvas` fechada no escopo de `_bindDesktopControls`
      // — se por qualquer motivo o elemento `<canvas>` de verdade no DOM for
      // outro (re-render do container que recria o canvas, ou esta função
      // rodar presa a uma referência antiga por causa de algum caminho de
      // remontagem do "Ver em 3D"), a comparação falha silenciosamente pra
      // sempre e a roda nunca mais funciona — mesmo com a ferramenta certa
      // ativa e o ponteiro de fato travado. Comparar com `e.currentTarget`
      // (o elemento REAL em que este listener está registrado nesta
      // invocação) em vez da variável fechada é estritamente mais robusto —
      // nunca pode divergir do canvas que realmente recebeu o evento.
      if (document.pointerLockElement !== e.currentTarget) return;
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
      if (document.pointerLockElement !== canvas) {
        // [18/09/2026 UTC] NOVO (RODADA 147) — painel de debug de câmera, ver
        // comentário grande em `onKeyDown` (Escape). Este É o exato instante
        // em que o overlay "Clique para interagir com o cenário 3D" passa a
        // aparecer (`lockBadge.classList.toggle('locked', false)` logo
        // abaixo, fora deste `if` — mesmo ponto, mesma transição) — log
        // único cobre os dois pedidos do usuário (pointerlockchange saída E
        // overlay aparecendo).
        this._v3dLog?.('pointerlockchange → saiu (overlay "Clique para interagir" aparece)');
        // [18/09/2026 UTC] NOVO (RODADA 150) — fallback do "salto" de
        // yaw/pitch pra quando o `keydown` do ESC nunca chega à página (ver
        // comentário grande junto de `_camLastMoveSnapshot`, constructor, e
        // `_trena3DCancelarMedidaEmAndamento`, já documentado desde
        // 16/09/2026, sobre o navegador engolir o Escape inteiro pra si).
        // Se `_pointerLockExitBlocking` JÁ está ligada, é porque o `keydown`
        // rodou e o guard de `onMouseMove` (mais acima) já descartou o
        // `mousemove` sintético antes dele sequer chegar aqui — nada a
        // fazer. Só quando a flag está DESLIGADA (keydown não rodou) é que
        // vale a pena checar `_camLastMoveSnapshot`: se o último
        // `mousemove` de verdade aplicado foi há 120ms ou menos, é
        // praticamente certo que foi o próprio "salto" sintético do
        // navegador recentralizando o cursor (o usuário não teria como
        // saber, de propósito, que o Pointer Lock ia soltar bem naquele
        // instante) — desfaz esse único passo, voltando yaw/pitch pro
        // valor de imediatamente antes dele. Janela pequena de propósito
        // (120ms ~ poucos quadros): no pior caso de falso positivo (o
        // usuário realmente girando a câmera bem no instante em que o
        // Pointer Lock caiu por outro motivo, ex. perda de foco da janela),
        // só se perde uma fração de grau de rotação, imperceptível — a
        // tela já está mostrando o aviso "clique para interagir" de
        // qualquer forma.
        if (!this._pointerLockExitBlocking && this._camera && this._camLastMoveSnapshot
          && (performance.now() - this._camLastMoveSnapshot.t) <= 120) {
          this._camera.yaw = this._camLastMoveSnapshot.yaw;
          this._camera.pitch = this._camLastMoveSnapshot.pitch;
          // Também corrige `_pointerLockSavedYaw/Pitch` — se ficassem
          // `null` (keydown nunca rodou pra gravá-los), o clique de
          // reengajamento (`onClick`, mais abaixo) não teria valor nenhum
          // pra restaurar e o "salto" sobreviveria à reentrada; se por
          // acaso já tivessem sido gravados por outro caminho, sobrescreve
          // com o valor CORRIGIDO, nunca com o errado.
          this._pointerLockSavedYaw = this._camera.yaw;
          this._pointerLockSavedPitch = this._camera.pitch;
          this._v3dLog?.('pointerlockchange → saiu SEM keydown ESC ter rodado — "salto" desfeito (fallback)');
        }
        // [18/09/2026 UTC] NOVO (RODADA 142) — a saída ACABOU de assentar de
        // vez (é exatamente isso que este `if` detecta) — desliga
        // `_pointerLockExitBlocking` (ligada no `keydown` do ESC, ver
        // comentário grande lá) AQUI, não num `mousemove` futuro: a partir
        // deste ponto, `mousemove` volta a ser processado normalmente (hover/
        // cursor etc., já fora do Pointer Lock). Cobre também saídas que não
        // passam pelo ESC (perder foco da janela, `exitPointerLock` chamado
        // por outro código) — a flag pode nem estar ligada nesses casos, mas
        // desligá-la de novo aqui é inofensivo (idempotente).
        this._pointerLockExitBlocking = false;
        // [18/09/2026 UTC] RODADA 141 — reforço por EVENTO (sem timer): religa
        // a flag aqui também, cobrindo qualquer forma de destravar o Pointer
        // Lock que não seja o `keydown` do ESC (perder o foco da janela,
        // `exitPointerLock` chamado por outro código, etc.) — ver
        // `_pointerLockReentering` no construtor e `onMouseMove` acima.
        this._pointerLockReentering = true;
        // [16/09/2026 UTC] REFORÇO — ver comentário grande em
        // `_trena3DCancelarMedidaEmAndamento`: cobre o caso do Escape sair do
        // Pointer Lock sem entregar o `keydown` correspondente a este canvas.
        this._trena3D.cancelarMedidaEmAndamento();
      } else {
        // [18/09/2026 UTC] NOVO (RODADA 147) — painel de debug de câmera, ver
        // comentário grande em `onKeyDown` (Escape).
        this._v3dLog?.('pointerlockchange → entrou');
        // Pointer Lock CONCEDIDO de verdade neste canvas — religa a flag
        // (idempotente com o `onClick`) pra garantir que o `mousemove`
        // sintético do SO recentralizando o cursor seja descartado, não
        // importa quanto o navegador demorou pra conceder o lock de novo.
        this._pointerLockReentering = true;
      }
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
      canvas.removeEventListener('mousedown', onMouseDownTijolo);
      document.removeEventListener('mouseup', onMouseUpTijolo);
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
    // [19/09/2026 UTC] RODADA 204 -- pedido verbatim inclui "Deve funcionar no espaço (pulo)" pro
    // multiplicador 10x mais devagar do botão do meio -- mesmo `middleSlow` usado no WASD/setas.
    const middleSlow = this._middleButtonHeld ? 0.1 : 1.0;
    if (this._grounded) { this._vel.y = 6 * middleSlow; this._grounded = false; }
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
    // NOVO (07/09/2026), pedido verbatim: "inquebrável, tudo com estrutura
    // try{}catch(){} [...]" — mesmo motivo do `setTimeout` em `mount()`
    // (ver comentário grande lá): uma exceção dentro de um `setTimeout` não
    // é capturável por quem chamou esta função, então precisa da própria
    // proteção.
    setTimeout(() => {
      try { Modeler3D.enter(this, novo, { enterOrbital: !(this._orbCamMode || this._fotoCamMode) }); } // [12/09/2026 — ITEM C]
      catch (err) {
        if (typeof ModuleHost !== 'undefined') ModuleHost.showLoadError('Modelador 3D', err);
        else console.error('Falha ao entrar no Modelador 3D:', err);
      }
    }, 0);
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
    // NOVO (07/09/2026), pedido verbatim: "inquebrável, tudo com estrutura
    // try{}catch(){} [...]" — mesmo motivo do `setTimeout` em `mount()`
    // (ver comentário grande lá): uma exceção dentro de um `setTimeout` não
    // é capturável por quem chamou esta função, então precisa da própria
    // proteção.
    setTimeout(() => {
      try { Modeler3D.enter(this, novo, { enterOrbital: !(this._orbCamMode || this._fotoCamMode) }); } // [12/09/2026 — ITEM C]
      catch (err) {
        if (typeof ModuleHost !== 'undefined') ModuleHost.showLoadError('Modelador 3D', err);
        else console.error('Falha ao entrar no Modelador 3D:', err);
      }
    }, 0);
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

  /** [10/09/2026] NOVO — converte um ponto de tela (coordenadas de
   *  cliente, `e.clientX/Y`) num raio de verdade através da câmera atual
   *  (`Engine3D.rayFromScreenPoint`) e devolve o pickable sob ele
   *  (`Engine3D.pickFromRay`, MESMA função usada pela mira central de
   *  sempre — só o raio de entrada é diferente). Usado só enquanto
   *  `_fotoCamMode`/`_orbCamMode` estão ativos (ver onMouseMove/onClick
   *  em `_bindDesktopControls`) — a navegação normal em 1ª pessoa continua
   *  100% com a mira central (`_tryPick` sem argumento, `centerRay`).
   *  [10/09/2026] Também atualiza `Engine3D.setHoverScreenPoint` (mesmo
   *  ponto NDC já calculado aqui) — pedido verbatim: "Ao mirar em um
   *  objeto, ele deve ter o mesmo destaque que tem quando não se está
   *  nesse modo, por exemplo, 'contorno pontilhado'". Assim
   *  `_updateHoverHighlight` (chamada todo quadro por `render()`) passa a
   *  desenhar o destaque de mira de sempre sob o CURSOR real, em vez do
   *  crosshair central (que nem existe nesses modos) — sem duplicar o
   *  cálculo do raio, `pickFromRay`/`hoverPick` já reaproveitam a MESMA
   *  técnica (`rayFromScreenPoint`) por baixo. */
  /** [13/09/2026] NOVO — dado o retângulo CSS (`getBoundingClientRect()`) de
   *  um elemento com `object-fit:contain` e o tamanho INTRÍNSECO do seu
   *  conteúdo (`canvas.width`/`canvas.height`, a resolução real do buffer),
   *  devolve o SUB-retângulo (dentro de `rect`) onde o conteúdo é de fato
   *  desenhado — a mesma conta que o navegador faz pra `object-fit:contain`
   *  (comparar proporções: caixa mais "larga" que o conteúdo sobra barra
   *  nos LADOS, caixa mais "alta" sobra em CIMA/BAIXO). Quando `contain` é
   *  `false`, devolve o `rect` inteiro sem alteração (caso "Esticar"/
   *  "Automática" — comportamento idêntico a antes, ver `_pickAtClientPoint`
   *  logo abaixo). Usada SÓ pro cálculo de NDC de picking — o CSS de
   *  verdade que desenha o letterboxing é `_applyResolucaoCustom3D`, esta
   *  função só REPLICA a matemática dele pra saber onde o mouse "realmente"
   *  cai dentro da imagem. */
  _computeContainRect(rect, intrinsicW, intrinsicH, contain) {
    if (!contain || !intrinsicW || !intrinsicH || !rect.width || !rect.height) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
    const boxRatio = rect.width / rect.height;
    const contentRatio = intrinsicW / intrinsicH;
    if (boxRatio > contentRatio) {
      // Caixa proporcionalmente mais larga que o conteúdo -> barras nos LADOS.
      const w = rect.height * contentRatio;
      const left = rect.left + (rect.width - w) / 2;
      return { left, top: rect.top, width: w, height: rect.height };
    }
    // Caixa proporcionalmente mais alta (ou igual) -> barras em CIMA/BAIXO.
    const h = rect.width / contentRatio;
    const top = rect.top + (rect.height - h) / 2;
    return { left: rect.left, top, width: rect.width, height: h };
  },

  _pickAtClientPoint(clientX, clientY, canvasEl) {
    const canvas = canvasEl || this._container?.querySelector('#v3d-canvas');
    if (!canvas || !this._engine) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    // [13/09/2026] CORRIGIDO — bug relatado: com "Resolução de renderização"
    // = "Personalizada…" + "Caber" (object-fit:contain, ver
    // `_applyResolucaoCustom3D`), o destaque de mira/raycaster continuava se
    // comportando como se fosse "Esticar" (ignorava as barras pretas). Causa
    // raiz: este cálculo de NDC sempre tratou `rect` (a caixa CSS INTEIRA)
    // como se fosse a imagem desenhada — verdade pra "Esticar" (o buffer
    // realmente estica pra preencher `rect`), mas falso pra "Caber", onde o
    // navegador desenha o conteúdo (proporção `canvas.width:canvas.height`)
    // ENCAIXADO dentro de `rect`, deixando barra preta de um dos lados.
    // Corrigido calculando o sub-retângulo real (`_computeContainRect`,
    // mesma matemática do `object-fit:contain`) e usando ELE como base do
    // NDC em vez de `rect` inteiro — clique/mira dentro da barra preta agora
    // conta como "nada mirado" (mesmo resultado de mirar fora do canvas).
    // Quando não é "Caber" (Automática/Esticar), `_computeContainRect`
    // devolve o próprio `rect` sem alteração — zero mudança de comportamento
    // nesses casos.
    const custom = this._engine?._customRes;
    const contain = !!(custom && custom.fit === 'caber');
    const box = this._computeContainRect(rect, canvas.width, canvas.height, contain);
    if (!box.width || !box.height) return null;
    if (clientX < box.left || clientX > box.left + box.width
      || clientY < box.top || clientY > box.top + box.height) {
      return null;
    }
    const ndcX = ((clientX - box.left) / box.width) * 2 - 1;
    const ndcY = -(((clientY - box.top) / box.height) * 2 - 1);
    this._engine.setHoverScreenPoint?.(ndcX, ndcY);
    const ray = this._engine.rayFromScreenPoint(ndcX, ndcY);
    if (!ray) return null;
    return this._engine.pickFromRay(ray.origin, ray.dir);
  },

  /** [10/09/2026] `hitOverride` NOVO — quando fornecido (mousedown/click
   *  real dentro de `_fotoCamMode`/`_orbCamMode`, ver `_pickAtClientPoint`
   *  acima), usa ESSE hit em vez de recalcular pela mira central — deixa o
   *  resto da função (o "o que fazer com o hit", cartões/scripts/etc.)
   *  100% compartilhado entre os 2 jeitos de mirar. */
  /** [14/09/2026] NOVO — usado pelos listeners `dblclick`/`contextmenu`
   *  (ver mount()) pra despachar `onModel<evento>`/`onInstance<evento>`
   *  (ex.: `evento='DoubleClick'` -> onModelDoubleClick) pro objeto sob a
   *  mira central — MESMO raycaster de `_tryPick`, mas SEM abrir nenhum
   *  cartão/ficha (esses eventos são só hooks pra quem quiser customizar
   *  em assets/modelos|instancias/, não têm comportamento padrão visível
   *  como o clique esquerdo tem). NO-OP silencioso se não houver nada
   *  mirado ou se nem instância nem modelo tiverem o hook implementado. */
  _dispatchMouseHit3D(evento) {
    // [13/09/2026] NOVO — guard defensivo (ver comentário grande em
    // mount()/onContextMenu-onDblClick sobre o bug "clique parece ESC"):
    // sem `this._engine`/`this._camera` prontos (ex.: chamada tardia numa
    // janela de transição de tela) não há raio nenhum pra calcular — sai
    // cedo em vez de deixar `centerRay`/`pickFromRay` estourar.
    if (!this._engine || !this._camera) return;
    const ray = this._engine.centerRay(this._camera);
    let hit = this._engine.pickFromRay(ray.origin, ray.dir);
    if (!hit || !hit.ref) return;
    const _v3dCtx = { view3d: this, DB: window.DB, Utils: window.Utils, map: this._map };
    // [14/09/2026] NOVO — porta/janela (hit.type 'porta'/'janela') não têm
    // `hit.ref.tipo` com esse valor literal (`tipo` ali é o TIPO DE
    // CATÁLOGO da porta/janela, ex. 'lisa'/'correr_2folhas' — ver
    // DOOR_TYPES3D/WINDOW_TYPES3D em engine3d.js), então caíam sempre em
    // `_generic` — nunca tinham como ganhar um assets/modelos/porta.model.js
    // ou assets/modelos/janela.model.js próprio. Corrigido igual à câmera/
    // fotoPin acima: `chave` vem de `hit.type` pra esses dois casos.
    // [18/09/2026 UTC] RODADA 164 — RACK: qual PEÇA está sob a mira? O duplo
    // clique só vale numa PORTA (frente de vidro ou traseira); o botão direito
    // remove a peça mirada / abre o menu de montagem (ver `_rackContextMenu`).
    let rackParte = null;
    // [18/09/2026 UTC] RODADA 166 -- rack/equipamento de rede: refina o alvo (um switch DENTRO do
    // rack fica atras do OBB do rack no modo 'hitbox'): vale a peca MAIS PROXIMA do raio.
    if (hit.type === 'object' && window.RedeEquip && (hit.ref.tipo === 'rack' || window.RedeEquip.ehEquipRede(hit.ref.tipo))) {
      const alvo = this._engine.redeAlvoSob?.(ray.origin, ray.dir);
      if (alvo && alvo.kind === 'rede') hit = Object.assign({}, hit, { ref: alvo.obj });
      else if (alvo && alvo.kind === 'rack' && alvo.obj) hit = Object.assign({}, hit, { ref: alvo.obj });
    }
    const ehRack = hit.type === 'object' && hit.ref.tipo === 'rack' && !!window.RackModular;
    if (ehRack) {
      rackParte = this._engine.rackParteSob?.(hit.ref, ray.origin, ray.dir) || null;
      if (evento === 'DoubleClick') {
        if (!rackParte || !rackParte.startsWith('porta:')) return; // hit-test SÓ na porta
        hit.ref._rackPortaAcertada = rackParte.slice(6);
      }
    }
    const chave = hit.type === 'camera' ? 'camera' : hit.type === 'fotoPin' ? 'fotopin'
      : hit.type === 'porta' ? 'porta' : hit.type === 'janela' ? 'janela' : (hit.ref.tipo || '_generic');
    window.ObjectAssets?.dispatchMouseEvent3D(evento, chave, hit.ref, _v3dCtx);
    // [14/09/2026] NOVO — pedido: expor `onDoubleClick` pro sistema de
    // Componentes (EventTrigger), MESMO caminho que `_tryPick` já usa pro
    // `onClick` — permite um Script (ex.: "Porta Automática") reagir a
    // duplo clique sem precisar de um assets/modelos/*.model.js próprio.
    if (evento === 'DoubleClick') {
      const comps = window.Components?.ensureComponents?.(hit.ref) || [];
      const temOnDbl = comps.some((c) => c.type === 'EventTrigger' && c.enabled !== false && (c.events || []).some((ev) => ev.event === 'onDoubleClick'));
      if (temOnDbl) window.SceneEventBus?.emit?.('onDoubleClick', hit.ref, { pointer: null, camera: this._camera }, { map: this._map, view3d: this });
    }
  },

  /** [18/09/2026 UTC] RODADA 164 — grava um patch de montagem/equipamentos no
   *  Rack `obj` (Mapping + DB, mesmo caminho do painel 2D) e reconstroi SO
   *  ele na cena 3D (`rebuildObjectIncremental`). */
  _rackAplicar(obj, patch) {
    if (!obj || !patch) return;
    const alvo = Mapping.updateObject(this._map, obj.id, patch) || Object.assign(obj, patch);
    DB.saveMap(this._map);
    this._engine?.rebuildObjectIncremental?.(alvo);
  },

  /** Botão direito num Rack (mira central). Peça desmontável mirada (porta de
   *  vidro, porta/chapa de trás, chapas laterais, tampas) => REMOVE na hora.
   *  Armação (postes, trilhos furados) ou vão => abre o menu de montagem
   *  (recolocar peças, tirar equipamentos, desmontar/montar tudo). */
  _rackContextMenu(obj, parte, hit) {
    // [18/09/2026 UTC] RODADA 166 -- clique esquerdo (Modo Edicao) NAO remove mais na hora (seria
    // destrutivo a cada clique): abre o menu, que destaca a peca mirada com o botao "Remover".
    this._openRackMenu(obj, parte, hit);
  },

  _openRackMenu(obj, parte, hit) {
    if (!this._container) return;
    this._container.querySelectorAll('.v3d-rack-menu').forEach((n) => n.remove());
    document.exitPointerLock?.();
    const RM = window.RackModular, C = window.RACK_CATALOGO;
    const el = document.createElement('div');
    el.className = 'v3d-rack-menu';
    el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;min-width:300px;max-width:92vw;background:rgba(20,24,32,.96);color:#e8ecf2;border:1px solid #3a4250;border-radius:10px;padding:12px;font:13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    const esc = (t) => Utils.escapeHtml(String(t));
    const btnCss = 'cursor:pointer;border:1px solid #4a5568;border-radius:6px;background:#2a3140;color:#e8ecf2;padding:4px 10px;font:inherit';
    const fechar = () => {
      el.remove();
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onFora, true);
    };
    const render = () => {
      const m = Object.assign({ frente: true, traseira: true, lateralEsq: true, lateralDir: true, topo: true, base: true }, obj.rackMontagem || {});
      const tt = obj.rackTraseiraTipo === 'chapa' ? 'chapa' : 'porta';
      const linhas = C.PECAS.map((p) => {
        const rotulo = p.chave === 'traseira' ? (tt === 'chapa' ? 'Chapa de trás' : 'Porta de trás') : p.rotulo;
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:3px 0"><span>${m[p.chave] ? '🟢' : '⚪'} ${esc(rotulo)}</span><button type="button" data-rk="${p.chave}" style="${btnCss}">${m[p.chave] ? 'Remover' : 'Recolocar'}</button></div>`;
      }).join('');
      const chaveMirada = parte === 'porta:frente' ? 'frente' : parte === 'porta:traseira' ? 'traseira' : (parte && parte.startsWith('chapa:')) ? parte.slice(6) : null;
      const infoMirada = chaveMirada && C.PECAS.find((p) => p.chave === chaveMirada);
      const miradaHtml = (infoMirada && m[chaveMirada]) ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 8px;margin:2px 0 6px;background:#3a2f1e;border:1px solid #8a6a2a;border-radius:6px"><span>👉 Peça mirada: <b>${esc(infoMirada.rotulo)}</b></span><button type="button" data-rp="${chaveMirada}" style="${btnCss}">Remover: ${esc(infoMirada.rotulo)}</button></div>` : '';
      const RE = window.RedeEquip;
      const eqRede = RE ? RE.equipDoRack(this._map, obj.id) : [];
      const redeHtml = RE ? `<div style="font-weight:600;margin:8px 0 2px;border-top:1px solid #3a4250;padding-top:6px">Equipamentos de rede (por U): switches, patch panels, DIO, guias, PDU...</div>`
        + (eqRede.length ? eqRede.slice().sort((a, b) => (a.rackU || 0) - (b.rackU || 0)).map((e) => { const sp = RE.especificar(e.tipo); return `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:3px 0"><span>${esc(sp.rotulo)} — ${esc(e.nome || '')} <span style="opacity:.6">(U${e.rackU}${sp.alturaU > 1 ? '–' + (e.rackU + sp.alturaU - 1) : ''})</span></span><span><button type="button" data-rn-menu="${e.id}" style="${btnCss}">Opções</button> <button type="button" data-rn-pick="${e.id}" style="${btnCss}">✋ Pegar</button> <button type="button" data-rn-ret="${e.id}" style="${btnCss}">Retirar</button></span></div>`; }).join('') : '<div style="opacity:.6;padding:3px 0">Nenhum instalado.</div>')
        + `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center"><select data-rn-tipo="1" style="background:#151a22;color:#e8ecf2;border:1px solid #3a4250;border-radius:6px;padding:3px 6px;font:inherit;max-width:60%">${RE.TIPOS_RACKAVEIS.map((t) => `<option value="${t}">${esc(RE.especificar(t).rotulo)}</option>`).join('')}</select><button type="button" data-rn-addsel="1" style="${btnCss}">＋ Instalar na 1ª U livre</button></div>` : '';
      const acess = RM.fromObjeto(obj).acessorios();
      const linhasA = acess.length ? acess.map((a) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:3px 0"><span>${a.id === (parte || '').slice(10) ? '👉 ' : ''}${esc((C.ACESSORIOS[a.tipo] && C.ACESSORIOS[a.tipo].rotulo) || a.tipo)} — U${a.uInicial}${a.alturaU > 1 ? '–' + (a.uInicial + a.alturaU - 1) : ''}</span><button type="button" data-ra="${esc(a.id)}" style="${btnCss}">Remover</button></div>`).join('')
        : '<div style="opacity:.6;padding:3px 0">Nenhum equipamento instalado.</div>';
      el.innerHTML = `<div style="font-weight:600;margin-bottom:6px">🗄️ Rack — montagem</div>${miradaHtml}${linhas}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0 3px;border-top:1px solid #3a4250;margin-top:6px"><span>Traseira: <b>${tt === 'chapa' ? 'chapa metálica' : 'porta'}</b></span><button type="button" data-rt="1" style="${btnCss}">Trocar</button></div>
        <div style="font-weight:600;margin:8px 0 2px;border-top:1px solid #3a4250;padding-top:6px">Acessórios</div>${linhasA}${redeHtml}
        <div style="display:flex;gap:8px;margin-top:10px"><button type="button" data-rd="1" style="${btnCss}">Desmontar tudo</button><button type="button" data-rm="1" style="${btnCss}">Montar tudo</button><span style="flex:1"></span><button type="button" data-rf="1" style="${btnCss}">Ficha do objeto</button><button type="button" data-rc="1" style="${btnCss}">Fechar</button></div>
        <div style="opacity:.55;margin-top:6px;font-size:11px">Esc fecha. Clique no jogo para voltar a andar.</div>`;
      el.querySelectorAll('[data-rk]').forEach((b) => { b.onclick = () => { const k = b.getAttribute('data-rk'); this._rackAplicar(obj, RM.patchMontagem(obj, { [k]: !m[k] })); render(); }; });
      el.querySelectorAll('[data-rp]').forEach((b) => { b.onclick = () => { const k = b.getAttribute('data-rp'); this._rackAplicar(obj, RM.patchMontagem(obj, { [k]: false })); parte = null; render(); }; });
      const bAdd = el.querySelector('[data-rn-addsel]');
      if (bAdd) bAdd.onclick = () => this._redeAdicionarNoRack(obj, el.querySelector('[data-rn-tipo]').value, render);
      el.querySelectorAll('[data-rn-pick]').forEach((b) => { b.onclick = () => { const e = this._map.objects.find((o) => o.id === b.getAttribute('data-rn-pick')); fechar(); if (e) this._redePegar(e); }; });
      el.querySelectorAll('[data-rn-ret]').forEach((b) => { b.onclick = () => { const e = this._map.objects.find((o) => o.id === b.getAttribute('data-rn-ret')); if (e) { RE.retirarDoRack(this._map, e); DB.saveMap(this._map); this._engine?.rebuildObjectIncremental?.(e); this._engine?.rebuildCabos?.(); } render(); }; });
      el.querySelectorAll('[data-rn-menu]').forEach((b) => { b.onclick = () => { const e = this._map.objects.find((o) => o.id === b.getAttribute('data-rn-menu')); fechar(); if (e) this._openRedeMenu(e, null); }; });
      el.querySelectorAll('[data-ra]').forEach((b) => { b.onclick = () => { this._rackAplicar(obj, RM.patchRemoveAcessorio(obj, b.getAttribute('data-ra'))); render(); }; });
      el.querySelector('[data-rt]').onclick = () => { this._rackAplicar(obj, RM.patchTraseiraTipo(obj, tt === 'chapa' ? 'porta' : 'chapa')); render(); };
      el.querySelector('[data-rd]').onclick = () => { this._rackAplicar(obj, RM.patchDesmontarTudo(obj)); render(); };
      el.querySelector('[data-rm]').onclick = () => { this._rackAplicar(obj, RM.patchMontarTudo(obj)); render(); };
      el.querySelector('[data-rc]').onclick = fechar;
      el.querySelector('[data-rf]').onclick = () => { fechar(); if (hit) this._tryPick(hit); };
    };
    const onKey = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); } };
    const onFora = (e) => { if (!el.contains(e.target)) fechar(); };
    this._container.appendChild(el);
    render();
    window.addEventListener('keydown', onKey, true);
    setTimeout(() => document.addEventListener('mousedown', onFora, true), 0);
  },

  /** [18/09/2026 UTC] RODADA 166 -- clique ESQUERDO no MODO EDICAO: mostra as OPCOES do que esta na
   *  mira. Rack => menu de montagem (com "Remover: <peca mirada>"); Switch/Patch panel => menu de
   *  rede (energia, portas, cabos); demais objetos => o `_tryPick()` de sempre (ficha/cartao). */
  _cliqueEdicao3D() {
    if (!this._engine || !this._camera) return;
    const ray = this._engine.centerRay(this._camera);
    const hit = this._engine.pickFromRay(ray.origin, ray.dir);
    if (!hit) return;
    const RE = window.RedeEquip;
    const ehRack = hit.type === 'object' && hit.ref && hit.ref.tipo === 'rack' && !!window.RackModular;
    const ehRede = hit.type === 'object' && hit.ref && !!RE && RE.ehEquipRede(hit.ref.tipo);
    if (ehRack || ehRede) {
      const alvo = this._engine.redeAlvoSob?.(ray.origin, ray.dir);
      if (alvo && alvo.kind === 'rede') { this._openRedeMenu(alvo.obj, ray); return; }
      const rack = (alvo && alvo.kind === 'rack' && alvo.obj) ? alvo.obj : (ehRack ? hit.ref : null);
      if (rack) {
        const parte = (alvo && alvo.kind === 'rack') ? alvo.parte : (this._engine.rackParteSob?.(rack, ray.origin, ray.dir) || null);
        this._rackContextMenu(rack, parte, hit);
        return;
      }
      if (ehRede) { this._openRedeMenu(hit.ref, ray); return; }
    }
    this._tryPick(hit);
  },

  /** Instala um novo equipamento de rede (`tipo`) na 1a U livre do rack `rack`. */
  _redeAdicionarNoRack(rack, tipo, aposCriar) {
    const RE = window.RedeEquip; if (!RE) return;
    const obj = RE.criarNoRack(this._map, rack, tipo, 0);
    if (!obj) { Utils.toast('Sem espaço livre no rack para: ' + RE.especificar(tipo).rotulo + '.', { duration: 2400 }); return; }
    DB.saveMap(this._map);
    if (!this._engine?.addObjectIncremental?.(obj)) this._rebuildScene();
    Utils.toast(RE.especificar(tipo).rotulo + ' instalado na U' + obj.rackU + '.', { type: 'ok', duration: 1800 });
    if (aposCriar) aposCriar();
  },

  // [18/09/2026 UTC] RODADA 167 -- `_openRedeMenu` (equipamentos de rede)
  // foi para js/view3d-rede.js (mesclado neste objeto ao carregar).

  _tryPick(hitOverride) {
    let hit = hitOverride;
    if (hit === undefined) {
      const ray = this._engine.centerRay(this._camera);
      hit = this._engine.pickFromRay(ray.origin, ray.dir);
    }
    if (!hit) return;
    // [09/09/2026] Ajuste solicitado pelo usuário: "Todos os objetos devem
    // poder ter scripts (portas, janelas, etc.)." — o gatilho "rodar ao
    // clicar/mirar+tocar" (pedido original, 07/09/2026: "interações por
    // meio de botões configuráveis no cenário") ANTES só checava
    // `hit.type === 'object'` (ver comentário removido daqui, mesma ideia)
    // — parede/porta/janela/câmera com script configurado no painel de
    // propriedades (ver mapview.js `_scriptFieldsetHtml`/
    // `_wireScriptFieldset`, usado agora por TODO painel, não só o de
    // Objeto) nunca tinham chance de disparar o script ao clicar, mesmo
    // com o campo salvo. Movido pra ANTES de qualquer `hit.type`
    // específico e generalizado pra `hit.ref` (existe em todo tipo de
    // pickable — object/camera/wall/porta/janela/fotoPin, ver os vários
    // `userData.pick = {...ref...}` em engine3d.js) — mesma prioridade de
    // sempre (um elemento-botão nunca mostra o cartão informativo comum
    // dele, roda o script NO LUGAR), agora valendo pra qualquer tipo.
    // [11/09/2026] ATUALIZADO — gatilho "ao clicar" passa pelo
    // SceneEventBus/sistema de Componentes (js/components.js).
    // [11/09/2026, mesmo dia — REESCRITO] Removida a menção a migração de
    // campos legados/`LegacyRawScript` — eliminados nesta rodada, pedido
    // verbatim "elimine tudo do projeto que é legado" (ver comentário
    // grande no topo de js/components.js). `Components.ensureComponents`
    // hoje só garante que `hit.ref.components` seja um array (sem
    // sintetizar nada a partir de campos antigos). Só dispara (e retorna,
    // "vira um botão do cenário" em vez de mostrar o cartão informativo
    // comum) se o objeto tiver de fato algum EventTrigger com evento
    // `onClick` configurado na UI nova ("🧩 Editar componentes…").
    if (hit.ref) {
      const comps = window.Components?.ensureComponents?.(hit.ref) || [];
      const temOnClick = comps.some((c) => c.type === 'EventTrigger' && c.enabled !== false && (c.events || []).some((ev) => ev.event === 'onClick'));
      if (temOnClick) {
        window.SceneEventBus?.emit?.('onClick', hit.ref, { pointer: null, camera: this._camera }, { map: this._map, view3d: this });
        return;
      }
    }
    // [12/09/2026 REESCRITO] pedido verbatim: "reescrita completa dos
    // cartões 3D hardcoded de câmera/foto para rotearem 100% pelo sistema
    // genérico de componentes [...] todos os objetos [...] devem seguir a
    // mesma organização." Este `if` fixo (`hit.type==='camera' ? ... :
    // hit.type==='fotoPin' ? ...`) SUMIU — quem decide agora é
    // `ObjectAssets.dispatchClick3D` (js/objectassets.js), lendo o arquivo
    // de assets/modelos/camera.model.js / assets/modelos/fotopin.model.js
    // (pré-carregados em `mount()`, ver `warmupModelsForMap`) — e, se o
    // objeto específico tiver um assets/instancias/<nome>.instance.js
    // próprio, ELE tem prioridade sobre o Modelo do tipo. `_showCameraCard3D`/
    // `_showFotoPinCard3D` continuam existindo (o Modelo padrão delega pra
    // elas, ver os arquivos acima) — só deixaram de ser chamadas
    // DIRETAMENTE daqui. O `return false` de `dispatchClick3D` (nem
    // instância nem modelo, nem sequer `_generic`, souberam o que fazer —
    // só aconteceria numa corrida bem no 1º instante, antes do warmup
    // terminar) cai num último fallback idêntico ao comportamento antigo,
    // pra nunca deixar o clique sem reação nenhuma.
    const _v3dCtx = { view3d: this, DB: window.DB, Utils: window.Utils, map: this._map };
    if (hit.type === 'camera') {
      if (!window.ObjectAssets?.dispatchClick3D('camera', hit.ref, _v3dCtx)) this._showCameraCard3D(hit.ref);
    }
    // NOVO (03/09/2026), pedido verbatim: "deve ser possível interagir com
    // o objeto da foto tirada" — ver o retângulo texturizado + pickable
    // 'fotoPin' criados em engine3d.js setScene (bloco "fotos vinculadas ao
    // mapa").
    else if (hit.type === 'fotoPin') {
      if (!window.ObjectAssets?.dispatchClick3D('fotopin', hit.ref, _v3dCtx)) this._showFotoPinCard3D(hit.ref);
    }
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
    } else if (hit.type === 'object') {
      // NOVO (12/09/2026) — mesmo raciocínio acima: câmera/fotoPin. `chave`
      // é o `tipo` de catálogo do objeto (ex.: 'gabinete') — cai no
      // Modelo `_generic` automaticamente se esse tipo não tiver o seu
      // próprio assets/modelos/<tipo>.model.js (ver
      // js/objectassets.js `dispatchClick3D`).
      const chave = hit.ref.tipo || '_generic';
      if (!window.ObjectAssets?.dispatchClick3D(chave, hit.ref, _v3dCtx)) this._showObjectCard3D(hit.ref);
    }
    // CORRIGIDO (09/09/2026), bug relatado: "com o 'Mirar' selecionado,
    // aponto para o aglomerado de tijolos e clico [...] porém não abre a
    // opção de 'Modelar em 3D'. [...] o contorno pontilhado de destaque ao
    // apontar [...] está funcionando, mas não pode ser só isso." Causa:
    // pickables do tipo 'tijolo' (ver engine3d.js `_rebuildTijolos`) não
    // têm `hit.ref` (só `id`/`pos`/`obb` — não são um objeto do mapa de
    // verdade ainda) — caíam direto no `else` genérico abaixo
    // (`_showFlashcard3D(hit.ref)` com `hit.ref` undefined), que não faz
    // nada útil pra este tipo. O aglomerado inteiro (`hit.id ===
    // 'tijolos-merged'`, ver engine3d.js) já tinha TODA a conversão pra
    // objeto modelável pronta (`_tijoloAglomeradoVirarObjeto`, pedido
    // anterior "deve se tornar um objeto único Modelável e excluível") —
    // só faltava um jeito de CHEGAR nela mirando/clicando, em vez de só
    // pelo botão da janela "🧱 Tijolo". Um tijolo INDIVIDUAL (cunha ou com
    // textura, nunca entra na fusão) ainda não tem cartão dedicado —
    // ignorado aqui de propósito (mesmo comportamento de antes: sem
    // cartão), só o aglomerado fundido ganhou o novo cartão.
    else if (hit.type === 'tijolo' && hit.id === 'tijolos-merged') this._showTijoloAglomeradoCard3D();
    else if (hit.type === 'tijolo') { /* tijolo individual (cunha/textura) — sem cartão próprio ainda, evita cair no cartão de item genérico abaixo */ }
    else this._showFlashcard3D(hit.ref); // item (ou pickable antigo sem `type`, por segurança)
  },

  /** NOVO (09/09/2026), bug relatado: mirar + clicar no aglomerado de
   *  tijolos (fundido, `hit.id === 'tijolos-merged'`) não abria nenhuma
   *  opção de "Modelar em 3D" — só o contorno pontilhado de destaque (o
   *  highlight de mira já funcionava, ver engine3d.js). Cartão mínimo, no
   *  mesmo estilo de `_showObjectCard3D`, com 2 ações: "🔧 Modelar em 3D"
   *  reaproveita `_tijoloAglomeradoVirarObjeto()` (já existente — funde os
   *  tijolos 'Caixa' sem textura num objeto de verdade com `customMesh` e
   *  entra direto no Modelador); "🗑️ Excluir" reaproveita
   *  `_openDeleteConfirmPopup()` (mesmo popup de confirmação estilo
   *  Blender já usado pra qualquer outro objeto/parede/item — ele mesmo
   *  mira de novo com `hoverPick`, então funciona igual clicando com a
   *  ferramenta 🗑️ Remover ou apertando DEL). */
  /* [13/09/2026] REFATORADO — pedido verbatim: "faça algum jeito para
   * poder configurá-las [as janelinhas de card], os estilos e textos [...]
   * Em vez de ser injeções em innerHTML nos arquivos do projeto [...] faça
   * uma pasta chamada 'cards/' e todos eles ficam ali." O conteúdo/estilo
   * completo deste card agora mora em `cards/tijolo-aglomerado-card.js`
   * (auto-registrado em `window.CardSystem`, ver comentário grande no topo
   * de `js/cardsystem.js`) — este método virou um wrapper fino: só monta o
   * `ctx` (mesmo formato de `ObjectAssets.buildCtx`) e manda o
   * `CardSystem` montar o elemento dentro de `this._container`. NENHUMA
   * mudança de comportamento visual/funcional — só de ONDE o código mora. */
  _showTijoloAglomeradoCard3D() {
    document.exitPointerLock?.();
    const ctx = window.ObjectAssets?.buildCtx
      ? window.ObjectAssets.buildCtx({ view3d: this, DB: window.DB, Utils: window.Utils, map: this._map })
      : { view3d: this, DB: window.DB, Utils: window.Utils, map: this._map };
    window.CardSystem?.mount(this._container, 'tijolo-aglomerado', null, ctx);
  },

  // REMOVIDO (02/09/2026) — `_openModelerNoCentro` (handler de um botão "+"
  // NOVO que eu tinha criado por engano aqui). Ver comentário grande no HTML
  // de mount(), junto de onde o botão ficava, pra explicação completa.

  /** [13/09/2026] REFATORADO — mesma extração documentada em
   *  `_showTijoloAglomeradoCard3D` acima e no comentário grande no topo de
   *  `js/cardsystem.js`. Conteúdo/estilo/wiring completo agora em
   *  `cards/camera-card.js`. Continua `async` só por retrocompatibilidade
   *  de assinatura com quem chama (nada aqui precisa mais de `await`). */
  async _showCameraCard3D(cam) {
    document.exitPointerLock?.();
    const ctx = window.ObjectAssets?.buildCtx
      ? window.ObjectAssets.buildCtx({ view3d: this, DB: window.DB, Utils: window.Utils, map: this._map })
      : { view3d: this, DB: window.DB, Utils: window.Utils, map: this._map };
    window.CardSystem?.mount(this._container, 'camera', cam, ctx);
  },

  /** [13/09/2026] REFATORADO — mesma extração documentada em
   *  `_showTijoloAglomeradoCard3D`/`_showCameraCard3D` acima e no
   *  comentário grande no topo de `js/cardsystem.js`. Conteúdo/estilo/
   *  wiring completo agora em `cards/foto-pin-card.js`. */
  async _showFotoPinCard3D(foto) {
    document.exitPointerLock?.();
    const ctx = window.ObjectAssets?.buildCtx
      ? window.ObjectAssets.buildCtx({ view3d: this, DB: window.DB, Utils: window.Utils, map: this._map })
      : { view3d: this, DB: window.DB, Utils: window.Utils, map: this._map };
    window.CardSystem?.mount(this._container, 'foto-pin', foto, ctx);
  },

  /** NOVO (12/09/2026), pedido verbatim: "ele deve ter uma folha de
   *  histórico [...] Tanto no 2D quanto no 3D deve ser possível
   *  acrescentar informações [...] por objeto individual". Liga o botão
   *  colapsável "📜 Histórico deste objeto" de um cartão 3D (câmera/objeto/
   *  foto — mesmo botão em todos, só o `toggleId`/`hostId` mudam) ao HTML
   *  compartilhado de `window.ObjectStandard` (js/objectstandard.js) — o
   *  MESMO usado no painel 2D (`js/mapview.js`
   *  `_historicoFieldsetHtml`/`_wireHistoricoFieldset`), pra nunca haver
   *  dois jeitos de mostrar/editar a mesma lista. `hostId` é tanto o botão
   *  quanto o `<div>` que ele expande — convenção: `${hostId}-toggle` é o
   *  botão, `${hostId}` é o container (ver os dois `id`s vizinhos nos
   *  `innerHTML` acima, em `_showCameraCard3D`/`_showObjectCard3D`/
   *  `_showFotoPinCard3D`). Persiste com `DB.saveMap(this._map)` — mesma
   *  função que o resto do 3D já usa pra qualquer mutação de objeto. */
  _wireHistoricoCard(cardEl, hostId, entity) {
    const toggle = cardEl.querySelector(`#${hostId}-toggle`);
    const host = cardEl.querySelector(`#${hostId}`);
    if (!toggle || !host || !window.ObjectStandard) return;
    toggle.onclick = () => {
      if (host.classList.contains('hidden') && !host.dataset.built) {
        host.innerHTML = window.ObjectStandard.historicoHtml(entity, hostId);
        window.ObjectStandard.wireHistoricoUi(host, entity, hostId, () => { DB.saveMap(this._map); });
        host.dataset.built = '1';
      }
      host.classList.toggle('hidden');
    };
  },

  /** Cartão simples ao mirar/selecionar um objeto do mapa em 3D — só
   *  informativo (o objeto não tem "detalhes" pra ver, como um item). */
  _showObjectCard3D(obj) {
    // [13/09/2026] CORRIGIDO — bug relatado: "ao clicar em um objeto no
    // cenário, agora, é como se tivesse pressionado ESC" (Pointer Lock
    // solto + mensagem 'Clique para interagir' aparecendo, SEM o cartão do
    // objeto abrir). Causa suspeita: `document.exitPointerLock?.()` sempre
    // foi a 1ª linha destas funções (padrão antigo, pra soltar o cursor
    // antes de montar o cartão) — mas o HTML do cartão passou a incluir
    // `window.ObjectStandard?.indicadorHtml(obj)` (13/09/2026, "indicador
    // de histórico") e o botão condicional "🔧 Modelar em 3D" (14/09/2026,
    // toggle "Modelar objetos") ANTES de `this._container.appendChild(el)`
    // — qualquer exceção nesse trecho (ex.: `obj` inesperado/parcial vindo
    // de um `hit.ref` já desatualizado) agora aborta a função DEPOIS do
    // Pointer Lock já ter sido solto e ANTES do cartão aparecer na tela:
    // exatamente o sintoma relatado (larga o cursor, não mostra nada). Não
    // foi possível reproduzir/confirmar ao vivo (sem navegador nesta
    // sessão) qual exceção específica dispara isso — correção DEFENSIVA e
    // conservadora: todo o corpo (menos o `exitPointerLock` em si, que
    // precisa rodar sempre) fica em try/catch; se algo estourar, loga no
    // console e mostra um cartão MÍNIMO de fallback (só "Fechar"), em vez
    // de deixar o usuário com o cursor solto e nenhum cartão na tela.
    document.exitPointerLock?.();
    try {
      this._showObjectCard3DBody(obj);
    } catch (err) {
      console.error('[View3D] _showObjectCard3D falhou ao montar o cartão do objeto:', err);
      const existing = this._container.querySelector('.flashcard3d-overlay');
      if (existing) existing.remove();
      const el = document.createElement('div');
      el.className = 'flashcard3d-overlay';
      el.innerHTML = `
        <div style="text-align:center; font-weight:700; margin-bottom:8px">🧱 Objeto</div>
        <button class="btn block sm" id="v3d-fc-close" style="margin-top:6px" title="Fechar este cartão e voltar a andar">Fechar</button>
      `;
      this._container.appendChild(el);
      el.querySelector('#v3d-fc-close').onclick = () => el.remove();
    }
  },

  /** Corpo de verdade de `_showObjectCard3D` acima — separado só pra poder
   *  ficar dentro do try/catch de lá sem duplicar o `document.exitPointerLock`.
   *
   *  [13/09/2026] REFATORADO — mesma extração documentada em
   *  `_showTijoloAglomeradoCard3D`/`_showCameraCard3D`/`_showFotoPinCard3D`
   *  acima e no comentário grande no topo de `js/cardsystem.js`. TODA a
   *  lógica de montar o título/emoji/lista de botões (incluindo o ponto de
   *  extensão `onModelCardButtons`, ver `js/objectassets.js`) agora mora em
   *  `cards/object-card.js` — aqui só monta o `ctx` e delega. */
  _showObjectCard3DBody(obj) {
    const ctx = window.ObjectAssets?.buildCtx
      ? window.ObjectAssets.buildCtx({ view3d: this, DB: window.DB, Utils: window.Utils, map: this._map })
      : { view3d: this, DB: window.DB, Utils: window.Utils, map: this._map };
    window.CardSystem?.mount(this._container, 'object', obj, ctx);
  },

  /** [13/09/2026] NOVO — pedido verbatim: "No 'Ver em 3D', deve ser possível
   *  acessar a janela de propriedades do objeto e a lista dos seus scripts
   *  com a possibilidade de editá-los ao vivo." Em vez de duplicar toda a UI
   *  de componentes (lista de Scripts/Gatilhos + a "folha de código" com
   *  CodeMirror — `_renderComponentsEditor`/`_renderScriptCodeEditor`,
   *  `js/mapview.js`), reaproveita LITERALMENTE essas mesmas funções: elas
   *  só dependem de `this._container` (onde o overlay tela-cheia é anexado,
   *  `position:absolute; inset:0`) e dos 3 campos de estado que o próprio
   *  `_openComponentsEditorFullscreen` já inicializa
   *  (`_componentsEditorOverlay`/`_componentsEditorOnClose`/
   *  `_componentsEditorCodeCompId`) — nenhum deles é específico do Mapa 2D.
   *  `view3d` (este objeto) também tem `_container` (o mesmo elemento onde
   *  o cartão do objeto e o canvas 3D vivem), então chamar o método do
   *  PROTÓTIPO de `Map2DRenderer` com `this` = `view3d` (`.call(this, ...)`)
   *  funciona sem tocar em nada do Mapa 2D nem duplicar lógica.
   *
   *  "Editar ao vivo": a EDIÇÃO DE VERDADE já acontece direto em
   *  `alvo.components` (a mesma referência de `this._map.objects`, que
   *  `_updateScriptLifecycle` já percorre a cada quadro — ver lá) — e
   *  `_renderScriptCodeEditor` (js/mapview.js) já chama
   *  `window.Components.invalidateInstance(comp)` a cada tecla digitada na
   *  folha de código, o que força o próximo `Update()`/`Start()` daquele
   *  Script a RECOMPILAR o texto novo (`Components._compileCode`, dentro de
   *  um try/catch que já existia — erro de sintaxe vira um toast "⚠️ Erro no
   *  script..." em vez de travar a cena, ver `_getOrCreateModule` em
   *  js/components.js). Ou seja: nenhum mecanismo NOVO de recompilação foi
   *  necessário aqui — só reaproveitar o que já existia, agora também
   *  acessível de dentro do "Ver em 3D".
   *
   *  LIMITAÇÃO conhecida: como o editor reaproveitado é o MESMO painel
   *  genérico do Mapa 2D (posição/rotação/andar/tipo ficam no painel de
   *  propriedades "de verdade" do 2D, não neste editor de componentes), o
   *  que fica editável aqui é a LISTA DE COMPONENTES (Scripts/Gatilhos) —
   *  que é justamente a parte "com possibilidade de editá-los ao vivo" do
   *  pedido. Pra mexer em posição/rotação/tipo, o caminho continua sendo o
   *  Mapa 2D (o pedido menciona "propriedades do objeto e a lista dos seus
   *  scripts" no mesmo fôlego, mas o valor de "ao vivo" está no script, que
   *  reflete na cena rodando; reposicionar não tem esse "ao vivo" pra
   *  demonstrar, já que moveria o objeto embaixo da própria câmera).
   *  [15/09/2026 UTC] RENOMEADA — pedido verbatim: "ao apontar e clicar
   *  com o mouse em um objeto, aparece a opção 'Propriedades e Scripts'.
   *  Deve ser um botão para cada coisa, botão 'Propriedades' e botão
   *  'Scripts'." Esta função só abria o editor de Scripts/Componentes
   *  (ver limitação documentada acima) — o nome era enganoso ("e
   *  Propriedades" não existia de verdade). Renomeada pra
   *  `_openObjectScripts3D` (comportamento IDÊNTICO, só o nome mudou) —
   *  `_openObjectProperties3D`, logo abaixo, é a peça NOVA que faltava
   *  (Posição/Rotação/Escala/Dimensões, sem precisar do Modelador — ver
   *  comentário grande lá). `cards/object-card.js` chama as duas
   *  separadamente agora, cada uma com seu próprio botão. */
  // [15/09/2026 UTC] ALTERADO — pedido verbatim: "a janela de opções que
  // aparece deve ter pilha de janelas [...] clicando em uma opção, o botão
  // de 'fechar' dela deve voltar para a janela anterior [...] Deve ser
  // assim para todas as opções." Ganhou um 2º parâmetro opcional
  // `onAfterClose`, repassado pra `_openComponentsEditorFullscreen` (que
  // já sabia chamar isso ao fechar, ver `_closeComponentsEditorFullscreen`
  // em mapview.js — só não era usado por este caminho antes) —
  // `cards/object-card.js` passa uma função que reexibe o cartão de
  // opções escondido (`display:none`, não mais removido por esta função —
  // ver abaixo).
  _openObjectScripts3D(entity, onAfterClose) {
    if (!window.Map2DRenderer || !entity) return;
    // As 4 funções abaixo (`_openComponentsEditorFullscreen`, chamada logo
    // adiante, e as 3 outras que ELA chama internamente via `this.xxx` —
    // `_closeComponentsEditorFullscreen`/`_renderComponentsEditor`/
    // `_renderScriptCodeEditor`) só usam `this._container` e os campos de
    // estado `_componentsEditor*` (nenhum DOM/dado específico do Mapa 2D) —
    // copiadas UMA VEZ pra `view3d` (objeto singleton, não uma instância
    // por tela) na primeira vez que este botão é usado, pra `this.xxx`
    // resolver certinho quando o código dentro delas chama outra função da
    // mesma família (eram inacessíveis antes por só existirem no protótipo
    // de `Map2DRenderer`, uma classe diferente de `view3d`).
    // [13/09/2026] CORRIGIDO — bug real encontrado: `_openComponentsEditorFullscreen`,
    // `_closeComponentsEditorFullscreen`, `_renderComponentsEditor` e
    // `_renderScriptCodeEditor` NÃO são métodos de `Map2DRenderer.prototype`
    // (aquela classe só desenha o canvas 2D em si) — são propriedades do objeto
    // literal `window.MapView` (js/mapview.js, `const MapView = {...}`, é ele
    // quem controla o editor de componentes tela-cheia). A rodada anterior
    // copiou de `Map2DRenderer.prototype`, que nunca teve essas funções —
    // por isso `proto._openComponentsEditorFullscreen` vinha `undefined` e
    // o clique estourava "not a function". Copiando de `window.MapView` agora
    // (mesmo objeto que `_wireScriptFieldset`/`_componentsSummaryHtml` já usam).
    if (!this._renderComponentsEditor) {
      const src = window.MapView;
      this._openComponentsEditorFullscreen = src._openComponentsEditorFullscreen;
      this._closeComponentsEditorFullscreen = src._closeComponentsEditorFullscreen;
      this._renderComponentsEditor = src._renderComponentsEditor;
      this._renderScriptCodeEditor = src._renderScriptCodeEditor;
      // Dependências indiretas usadas dentro dessas 4 funções (grep por
      // `this._` dentro delas): `_componentsSummaryHtml` (usada por
      // `_wireScriptFieldset`, que este fluxo não chama diretamente, mas
      // `_renderComponentsEditor` monta os cabeçalhos de cada componente
      // via `_componentsSummaryRowHtml`/afins) — copiadas por segurança
      // pra `this._xxx` resolver igual dentro da cadeia toda.
      this._componentsSummaryHtml = src._componentsSummaryHtml;
      // [15/09/2026 UTC] NOVO — `_openComponentsEditorFullscreen` (copiada
      // acima) agora chama `this._refreshComponentErrorFlags` (flag de erro
      // do Script, ver js/components.js `_lastErrors`/`getScriptError`) —
      // precisa estar copiada aqui pelo MESMO motivo das outras 4: sem
      // isto, "Propriedades e Scripts" no "Ver em 3D" estouraria
      // "this._refreshComponentErrorFlags is not a function" ao abrir.
      this._refreshComponentErrorFlags = src._refreshComponentErrorFlags;
    }
    // [15/09/2026 UTC] REMOVIDO — antes fechava (`.remove()`) o cartão de
    // clique por baixo do editor tela-cheia; agora quem controla isso é o
    // CHAMADOR (`cards/object-card.js`, que esconde o cartão ANTES de
    // chamar esta função e o reexibe via `onAfterClose`, ver comentário
    // grande acima) — pilha de janelas em vez de fechar tudo.
    const salvar = (patch) => {
      Mapping.updateObject(this._map, entity.id, patch);
      DB.saveMap(this._map);
    };
    this._openComponentsEditorFullscreen(entity, salvar, onAfterClose || null);
  },

  /** [15/09/2026 UTC] ALTERADO — pedido verbatim (rodada seguinte):
   *  "Deve ser possível fazer as transformações com o que já tem
   *  desenvolvido no app (botão lateral direito '+' -> 'Propriedades' ->
   *  'Transformação'). Remova o modal de transformação que você colocou
   *  em '📐 Propriedades'." Antes, este botão abria um modal PRÓPRIO
   *  (`.modal-backdrop`) com os mesmos campos — o usuário quer usar em vez
   *  disso a seção "Transformação" que já existe dentro do painel lateral
   *  direito ("+" → aba "Propriedades" → seção "Transformação"), a mesma
   *  seção que `ModelerUI.updateNPanel` (modeler-ui.js) preenche quando o
   *  Modelador está ativo — mas essa função só entende edição de MALHA
   *  (vértices/arestas/faces), não serve pra um objeto comum fora do
   *  Modelador. Esta função agora só ABRE/FOCA a seção (painel lateral +
   *  aba "Propriedades" + expande "Transformação") e delega o conteúdo pra
   *  `_renderTransformacaoObjetoSimples` (abaixo, NOVA), que desenha os
   *  MESMOS campos de nível de objeto que o modal tinha (Posição/Rotação/
   *  Escala/Dimensões) só que dentro do corpo já existente
   *  `#v3d-proppanel-transformacao-body`, com salvar-e-remontar idêntico a
   *  antes. Quando o Modelador estiver ativo pro MESMO objeto, `updateNPanel`
   *  volta a escrever por cima deste conteúdo normalmente (nenhuma mudança
   *  lá) — os dois nunca disputam a mesma seção ao mesmo tempo, já que
   *  este botão só existe fora do Modelador (cartão de clique de objeto,
   *  "Modo Edição").
   *
   *  [15/09/2026 UTC] RENOMEADA — pedido verbatim (rodada seguinte): "No
   *  'Ver em 3D', ao clicar em 'propriedades', deve aparecer a mesma
   *  janela que nas propriedades do mapa 2D. Um novo botão 'transformação'
   *  deve aparecer ali. Ao clicar nele, então, aparece a transformação."
   *  O nome `_openObjectProperties3D` (chamado pelo botão "📐 Propriedades"
   *  do cartão de clique, ver `cards/object-card.js`) passou a significar
   *  OUTRA COISA (abrir o mesmo painel flutuante do Mapa 2D, ver função
   *  NOVA logo abaixo) — esta função (o comportamento ANTIGO: abrir/focar
   *  a seção "Transformação" do painel lateral direito) foi renomeada pra
   *  `_openObjectTransformSidebar3D` e virou o destino do botão NOVO "🔄
   *  Transformação" (ver `cards/object-panel-card.js`, dentro do painel
   *  flutuante reaproveitado) — comportamento interno 100% idêntico, só
   *  mudou QUEM chama e QUANDO. */
  _openObjectTransformSidebar3D(entity) {
    if (!entity) return;
    const existing = this._container.querySelector('.flashcard3d-overlay');
    if (existing) existing.remove();
    if (this._container.querySelector('#v3d-objcat-panel')?.classList.contains('hidden')) {
      this._toggleObjectCatalogPanel();
    }
    this._setV3dRightTab('propriedades');
    const sec = this._container.querySelector('#v3d-proppanel-transformacao');
    const head = this._container.querySelector('#v3d-proppanel-transformacao-head');
    const chevron = head?.querySelector('.v3d-proppanel-chevron');
    if (sec?.classList.contains('collapsed')) {
      sec.classList.remove('collapsed');
      if (chevron) chevron.innerHTML = '&#9662;';
    }
    this._renderTransformacaoObjetoSimples(entity);
  },

  /** [15/09/2026 UTC] NOVO — pedido verbatim: "No 'Ver em 3D', ao clicar em
   *  'propriedades', deve aparecer a mesma janela que nas propriedades do
   *  mapa 2D." Este é o NOVO destino do botão "📐 Propriedades" do cartão
   *  de clique (era `_openObjectTransformSidebar3D`, ver comentário grande
   *  dela acima) — em vez de abrir a seção "Transformação" do painel
   *  lateral direito, abre de verdade o MESMO painel flutuante
   *  (`.map2d-props-panel`, `js/mapview.js` `MapView._openObjectPanel` +
   *  `cards/object-panel-card.js`) que aparece ao clicar num objeto no
   *  Mapa 2D — mesmo HTML, mesmo CSS, mesmos campos (Nome/Classes/Posição/
   *  Rotação/Andar/Material/Scripts/Histórico/etc.), reaproveitado 100%,
   *  não uma cópia.
   *
   *  COMO FUNCIONA — `MapView` (js/mapview.js, `const MapView = {...}`) é
   *  um objeto literal SINGLETON, igual `View3D` aqui — não uma classe com
   *  instâncias, então "reusar" significa copiar as FUNÇÕES (não os
   *  dados) pra `this` (o `View3D`) na 1ª vez que este botão é usado
   *  (`_ensureObjectPanelInfraFromMapView`, logo abaixo) — MESMO padrão já
   *  usado por `_openObjectScripts3D` (ver comentário grande dela, "copia
   *  de `window.MapView` na 1ª vez") pra reaproveitar o editor de
   *  Scripts/Componentes. Assim que copiadas, chamar `this._openObjectPanel(
   *  entity, {modoVer3D:true})` funciona exatamente como no Mapa 2D — toda
   *  chamada interna feita como `this.xxx(...)` dentro dessas funções
   *  resolve certinho contra o `View3D`, já que agora `this.xxx` EXISTE lá
   *  também (copiado).
   *
   *  `modoVer3D:true` é repassado até `cards/object-panel-card.js`
   *  (`ObjectPanelCard.build`), que usa o flag só pra: (1) trocar "🔧
   *  Modelar em 3D"/"🔄 Trocar tipo/forma" (ferramentas do Mapa 2D/gizmo,
   *  sem equivalente aqui) pelo botão NOVO "🔄 Transformação" (pedido
   *  explícito do usuário); (2) usar `ctx._renderer?._computeItemAssocIndex`
   *  com fallback vazio (`View3D` não tem `_renderer` — isso é exclusivo
   *  do canvas 2D).
   *
   *  LIMITAÇÃO CONHECIDA/HONESTA: nem toda função copiada foi auditada
   *  campo a campo (o painel tem MUITOS botões — associar patrimônio,
   *  grupo, histórico, scripts, cor por face...) — as mais arriscadas
   *  ("🔗 Grupo" ligar/sair, que reabre o painel via
   *  `ctx._openObjectPanel(obj)` sem `modoVer3D`, perdendo o botão
   *  "Transformação" até fechar/reabrir de novo) foram identificadas e
   *  aceitas como efeito colateral menor; qualquer botão cuja função ainda
   *  não esteja copiada em `_ensureObjectPanelInfraFromMapView` só vai
   *  logar um erro no console ao ser clicado (painel continua aberto,
   *  resto dos campos continua funcionando) — sem navegador pra testar ao
   *  vivo nesta sessão, não dava pra garantir 100% dos botões sem risco. */
  _openObjectProperties3D(entity) {
    if (!window.MapView || !entity) return;
    const existing = this._container.querySelector('.flashcard3d-overlay');
    if (existing) existing.remove();
    this._ensureObjectPanelInfraFromMapView();
    return this._openObjectPanel(entity, { modoVer3D: true });
  },

  /** Copia, 1x (`this._objectPanelInfraReady`), as funções de
   *  `window.MapView` necessárias pro painel flutuante de propriedades de
   *  objeto (`_openObjectPanel` e tudo que ELA chama internamente via
   *  `this.xxx`) funcionarem quando `this` é o `View3D` — ver comentário
   *  grande de `_openObjectProperties3D` acima pro motivo completo. Só
   *  copia o que ainda não existe em `this` (`typeof this[nome] !==
   *  'function'`) — nunca sobrescreve algo que `View3D` já tivesse
   *  definido com o mesmo nome por outro motivo. */
  // [15/09/2026 UTC] CORRIGIDO — pedido verbatim: "...deve ser aplicado em
  // tempo real...". `_saveMap()` (já copiada acima) chama internamente
  // `this._updateBbmItemCount()` sem guarda nenhuma; essa função NÃO estava
  // na lista de cópia, então todo `salvarCampo`/persist do painel reaproveitado
  // no 3D ia estourar `TypeError: this._updateBbmItemCount is not a function`
  // assim que qualquer campo fosse editado. O corpo de `_updateBbmItemCount`
  // já é seguro de chamar sem os elementos da bottombar do Mapa 2D (usa
  // `root?.querySelector?.(...)` e retorna cedo se não achar), então só
  // adicionar o nome na lista abaixo resolve.
  // [15/09/2026 UTC] CORRIGIDO (2ª lacuna) — erro real reportado pelo usuário
  // ao clicar em "Propriedades" no "Ver em 3D": "TypeError: this.
  // _componentsSummaryHtml is not a function" (mapview.js:18678, dentro de
  // `_scriptFieldsetHtml`, chamada por `_openObjectPanel`). CAUSA: essa
  // dependência (e as outras do mesmo grupo — editor de Componentes tela
  // cheia) já eram copiadas de `window.MapView`, mas só dentro do bloco lazy
  // de `_openObjectScripts3D` (função do botão antigo "🧩 Scripts", ver
  // acima), que só roda quando ESSE botão específico é clicado — o novo
  // fluxo do painel completo (`_openObjectProperties3D` ->
  // `_ensureObjectPanelInfraFromMapView`) nunca passava por ali, então
  // `_componentsSummaryHtml` (chamada direto no HTML do fieldset de
  // Componentes, sem passar pelo botão) ficava faltando. Adicionadas aqui as
  // mesmas 6 dependências já usadas por `_openObjectScripts3D`
  // (`_componentsSummaryHtml`, `_openComponentsEditorFullscreen`,
  // `_closeComponentsEditorFullscreen`, `_renderComponentsEditor`,
  // `_renderScriptCodeEditor`, `_refreshComponentErrorFlags`) — o botão
  // "🧩 Editar componentes…" dentro do painel reaproveitado ("_wireScriptFieldset")
  // também depende delas (chama `this._openComponentsEditorFullscreen`).
  // [15/09/2026 UTC RODADA 65] CORRIGIDO (3ª lacuna, achada auditando
  // `_closePanel` ANTES do usuário reportar — botão "✕" do painel chama
  // `this._closeFotoPinWheel()` incondicionalmente, sem guarda nenhuma;
  // corpo da função é seguro (só optional-chaining em estado próprio), só
  // faltava copiar o nome.
  _ensureObjectPanelInfraFromMapView() {
    if (this._objectPanelInfraReady) return;
    const src = window.MapView;
    if (!src) return;
    [
      '_openObjectPanel', '_openPanel', '_hideOrRemovePanel', '_showPersistentPanel',
      '_makePanelDraggable', '_bringPanelToFront', '_saveMap', '_closePanel',
      '_scriptFieldsetHtml', '_wireScriptFieldset', '_trajetoFieldsetHtml',
      '_wireTrajetoFieldset', '_historicoFieldsetHtml', '_wireHistoricoFieldset',
      '_deleteObjectById', '_elLayerLocked', '_updateBbmItemCount',
      '_componentsSummaryHtml', '_openComponentsEditorFullscreen',
      '_closeComponentsEditorFullscreen', '_renderComponentsEditor',
      '_renderScriptCodeEditor', '_refreshComponentErrorFlags',
      '_closeFotoPinWheel', '_scriptErrorBannerText',
      // [15/09/2026 UTC RODADA 65] `_TIPOS_ROBO_TRAJETO` (4ª lacuna, achada
      // na mesma auditoria): NÃO é uma função, é um array de dados (lista de
      // tipos de robô com trajeto — `_trajetoFieldsetHtml`/
      // `_wireTrajetoFieldset` fazem `this._TIPOS_ROBO_TRAJETO.includes(...)`
      // pra QUALQUER objeto, não só robôs). A condição `typeof src[nome] ===
      // 'function'` abaixo NUNCA copiava isto (é um array), então
      // `this._TIPOS_ROBO_TRAJETO` ficava `undefined` no `View3D` e
      // `.includes` estourava "Cannot read properties of undefined" pra
      // QUALQUER objeto aberto no painel reaproveitado — não só robôs, já
      // que o fieldset é montado incondicionalmente (só decide se desenha
      // algo, retornando `''`/undefined). Adicionado como um nome à parte,
      // copiado por valor (mesma referência do array de `window.MapView`,
      // só leitura em ambos os lados — nunca mutado por estes 2 métodos).
      '_TIPOS_ROBO_TRAJETO',
    ].forEach((nome) => {
      if (typeof this[nome] === 'undefined' && typeof src[nome] !== 'undefined') this[nome] = src[nome];
    });
    this._objectPanelInfraReady = true;
  },

  /** [15/09/2026 UTC] ALTERADO — pedido verbatim (rodada seguinte): "No
   *  'Ver em 3D', as transformações a se fazer deve usar a mesma utilizada
   *  no Modelador, não uma nova (como foi feito na última rodada) [...] A
   *  mesma presente em 'botão lateral direito (+)' -> 'Propriedades' ->
   *  'Transformação', os mesmos botões, estilos, HTML. Não é restrito ao
   *  modelador, se for, modularize para ser usado aqui também." Antes esta
   *  função desenhava um formulário PRÓPRIO (`<input type=number>` cru) —
   *  agora só delega pra `ModelerUI.buildStandaloneObjectTransformPanel`
   *  (modeler-ui.js), que reaproveita de verdade os MESMOS widgets do
   *  Modelador (`_buildGroup`/`_createNumField`, `.m3d-numfield` — mesmo
   *  arraste-pra-mudar-valor, mesmo clique-pra-digitar, mesmo CSS) — ver
   *  comentário grande lá pra causa raiz completa/por que não dava pra só
   *  chamar `_buildObjectTransformPanel` (Modelador) sem adaptar: aquela
   *  função exige uma malha REAL sendo editada na cena
   *  (`state.group`/`state.meshObj`), que não existe fora de uma sessão do
   *  Modelador. Cada campo agora persiste e reflete ao vivo por si só
   *  (`_refreshObjectLiveTransform`, abaixo) — sem botão "Salvar"/sem
   *  remontar a tela inteira a cada edição, mais parecido com a
   *  responsividade do próprio Modelador. */
  _renderTransformacaoObjetoSimples(entity) {
    const body = this._container?.querySelector('#v3d-proppanel-transformacao-body');
    if (!body || !entity || typeof ModelerUI === 'undefined') return;
    body.innerHTML = '';
    body.appendChild(ModelerUI.buildStandaloneObjectTransformPanel(this, entity));
  },

  /** [15/09/2026 UTC] REESCRITO — pedido verbatim: "[No painel de
   *  Transformação do 'Ver em 3D'] deve ser aplicado em tempo real.
   *  Atualmente não está sendo aplicado as alterações em tempo real (no
   *  3D), tendo que sair do 3D e entrar de novo para ver as aplicações."
   *  A versão anterior desta função só remendava X/Z/rotação numa ÚNICA
   *  malha achada por `.find` (objetos com várias malhas soltas — Mesa/
   *  Cadeira/Pilar/etc. — ficavam com o resto pra trás) e NUNCA tocava em
   *  escala/Y (documentado como limitação conhecida na época). Agora
   *  delega 100% pra `Engine3D.rebuildObjectIncremental` (NOVO, ver
   *  comentário grande dele) — reconstrói de verdade as malhas deste
   *  objeto (todas, qualquer tipo de builder) a partir dos valores JÁ
   *  SALVOS em `obj`, cobrindo posição/Y/rotação X/Y/Z/escala de uma vez,
   *  sem duplicar nenhuma fórmula de posicionamento aqui. */
  _refreshObjectLiveTransform(obj) {
    try {
      this._engine?.rebuildObjectIncremental?.(obj);
    } catch (err) {
      console.warn('[View3D] _refreshObjectLiveTransform não conseguiu atualizar ao vivo (dado já foi salvo mesmo assim):', err);
    }
  },

  // =====================================================================
  // [13/09/2026] NOVO — "APLICATIVO" DE MONITORAMENTO DE ROBÔS
  // Pedido verbatim do usuário: "Em cada computador, deve ser possível
  // acessar um 'aplicativo' para ver os robôs de cada andar, ver o que eles
  // estão vendo e acessar e ver o seu trajeto: ver o seu trajeto e o que já
  // foi feito e o 'plano de viagem'." Aberto a partir do botão "💻 Abrir
  // aplicativo: Monitoramento de Robôs" no cartão de um objeto "monitor"/
  // "monitor2" (ver _showObjectCard3DBody acima) — a ideia sendo "abrir o
  // aplicativo NAQUELE computador", por isso o botão só existe no cartão de
  // um monitor/computador, não num menu solto qualquer.
  //
  // Reaproveita o MESMO padrão visual de overlay tela-cheia já usado por
  // `_openComponentsEditorFullscreen` (js/mapview.js, ver ali) — mesmo
  // `position:absolute; inset:0` sobre `this._container`, mesma classe
  // `map2d-componentpanel-confinado` (dá o visual "painel confinado
  // rolável" já usado ali) — em vez de inventar um sistema de modal novo.
  // =====================================================================

  /** [13/09/2026 REESCRITO] CORREÇÃO DE ARQUITETURA — pedido verbatim do
   *  usuário rejeitando a versão anterior desta função: "como tudo deve ser
   *  com os recursos do próprio app [...] Não podendo ficar em um estado de
   *  'um script totalmente reescrito pelo usuário pode não ser
   *  reconhecido'."
   *
   *  ANTES: esta função fazia uma extração de TEXTO por regex + `new
   *  Function` sobre o código-fonte do componente Script do robô, tentando
   *  "adivinhar" uma constante `WAYPOINTS`/`WAYPOINTS_VARREDURA` — best-
   *  effort por natureza, e por isso mesmo FRÁGIL: qualquer script
   *  reescrito pelo usuário num formato diferente (outro nome de variável,
   *  outra estrutura) simplesmente não era reconhecido, mostrando "Trajeto
   *  não disponível" mesmo com o robô se movendo normalmente.
   *
   *  AGORA: NENHUM parse de texto/regex/`new Function` sobre código de
   *  script — o trajeto é lido DIRETO de `robo.propriedades.trajeto`, um
   *  DADO ESTRUTURADO de primeira classe do próprio objeto (editável no
   *  painel de propriedades 2D — ver mapview.js `_trajetoFieldsetHtml`/
   *  `_wireTrajetoFieldset`), SEMPRE disponível e SEMPRE confiável — não
   *  importa como o usuário escreveu/reescreveu o Script do robô, porque a
   *  lista de pontos não mora mais dentro do texto dele. `robo` aqui é a
   *  referência de verdade do objeto do mapa (a mesma que o painel 2D e o
   *  Script leem/escrevem), então isto é uma leitura de campo comum, não um
   *  mecanismo novo. Devolve `null` só quando não há nenhum ponto definido
   *  ainda (objeto novo/trajeto vazio) — nesse caso o chamador mostra
   *  "Trajeto ainda não definido" (ver uso abaixo), convite pra abrir o
   *  painel de propriedades e cadastrar os pontos, em vez do antigo
   *  "formato não reconhecido". */
  // =====================================================================
  // [13/09/2026] NOVO — "MODO COMPUTADOR" (acessar a tela do monitor como
  // uma área de trabalho de verdade). Pedido verbatim do usuário, com 5
  // partes — cada uma citada no comentário do método correspondente abaixo.
  //
  // ABORDAGEM ESCOLHIDA (documentada com honestidade, pedido explícito do
  // usuário pra "escolher a abordagem mais viável e documentar"): a "área de
  // trabalho" é um OVERLAY 2D sobre o canvas (mesmo padrão de
  // `_openRoboMonitoringApp3D`/`_openObjectPropsAndScripts3D` — um `<div>`
  // absoluto sobre `this._container`), NÃO uma textura projetada na malha
  // 3D real do monitor. Motivo: a malha do monitor (ver
  // `js/engine3d-profiles.js`, tipo `monitor`/`monitor2`) não expõe hoje um
  // UV mapeado dedicado só pra "tela" (é uma caixa única com um material só,
  // igual a cabine do elevador documentada em
  // `_exemplo-script-elevador-cabine.txt`) — projetar uma `CanvasTexture`
  // JUSTA na face da tela exigiria remapear UVs/criar uma sub-geometria só
  // pra ela, sem poder testar visualmente ao vivo (risco alto de a textura
  // sair esticada/no lugar errado). Um overlay 2D cheio de tela, por outro
  // lado, já é o padrão usado por TODO o resto do projeto pra "telas"/
  // "aplicativos" (ver o próprio app de monitoramento) e cumpre o pedido
  // igualmente bem ("a renderização acontece ali no monitor" — do PONTO DE
  // VISTA do jogador, que está olhando praticamente pra tela quando isso
  // acontece, já que a câmera foi posicionada de frente a ela, ver
  // `_acessarComputador3D`).
  //
  // "PERSONAGEM FICA EM FRENTE À TELA": o jogo é primeira pessoa — CONFIRMADO
  // lendo o resto deste arquivo (a "câmera" É o jogador, `this._camera`
  // x/y/z/yaw/pitch, ver topo do arquivo; não existe nenhum modelo de corpo
  // em 3ª pessoa do próprio jogador em lugar nenhum do projeto, nem no carro
  // — que também só reposiciona `this._camera`, ver `_updateCarroCamera`).
  // Por isso a interpretação implementável aqui é: a CÂMERA do jogador se
  // move/vira suavemente até ficar de frente pro monitor — é o equivalente
  // disponível no motor a "o personagem fica de frente à tela", já que não
  // há um corpo visível pra animar separadamente.
  //
  // "SAIR E DEIXAR RODANDO": ver LIMITAÇÃO HONESTA no comentário grande de
  // `_sairDoComputador3D` mais abaixo — a sessão (app aberto + robô sendo
  // visto) é PRESERVADA em `entity._sessaoComputador` e retomada ao
  // reacessar o MESMO computador (implementado, ver
  // `_openRoboMonitoringApp3D` acima), mas a tela real do monitor NÃO
  // continua mostrando a mini-câmera do robô à distância depois que o
  // jogador sai — só o ESTADO da sessão persiste, não a renderização visível
  // de longe. Motivo: a única forma seria projetar essa textura AO VIVO na
  // malha real do monitor (a abordagem de overlay 2D escolhida acima não
  // aparece de fora do modo computador por definição), o que reabriria o
  // mesmo risco de UV/geometria descrito acima, agora rodando em background
  // pra TODOS os monitores do mapa a cada quadro (custo de desempenho real
  // — um render extra de `_renderRoboEyeFrame` por monitor com sessão ativa,
  // todo quadro) — simplificação aceita conscientemente em vez de arriscar
  // uma extensão de motor sem poder testar ao vivo.
  // =====================================================================

  /** Desenha (uma única vez, cacheado em `this._computadorDesktopBgDataUrl`)
   *  o fundo da "área de trabalho" do modo computador — pedido verbatim:
   *  "a área de trabalho deve ter um fundo gerado por código". MESMA técnica
   *  já usada no projeto pra texturas geradas em canvas 2D (chão lajotado/
   *  mostrador do relógio de parede, ver `js/engine3d.js` — aqui não vira uma
   *  `THREE.CanvasTexture` 3D porque a área de trabalho é UI 2D sobreposta,
   *  não uma malha — só um canvas 2D comum virando `data:` URL de imagem de
   *  fundo do overlay, mais barato e simples). Gradiente azul-escuro →
   *  azul-petróleo com um padrão sutil de linhas diagonais por cima. */
  _gerarFundoAreaTrabalho3D() {
    if (this._computadorDesktopBgDataUrl) return this._computadorDesktopBgDataUrl;
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 320;
    const ctx = cv.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, cv.width, cv.height);
    grad.addColorStop(0, '#0b1f33');
    grad.addColorStop(1, '#123f45');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cv.width, cv.height);
    // Padrão sutil: linhas diagonais finas, opacidade baixa — puramente
    // decorativo, não deve competir visualmente com o ícone/janelas.
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    for (let x = -cv.height; x < cv.width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + cv.height, cv.height);
      ctx.stroke();
    }
    this._computadorDesktopBgDataUrl = cv.toDataURL('image/png');
    return this._computadorDesktopBgDataUrl;
  },

  /** [13/09/2026] NOVO — pedido verbatim: "o aplicativo do pc deve ser
   *  acessível como se estivesse usando a tela [...] o personagem tem uma
   *  animação de ficar em frente à tela". Chamado por
   *  `assets/modelos/monitor.model.js`/`monitor2.model.js` via
   *  `onModelCardButtons` (botão "🖥️ Acessar este computador", substituindo
   *  o antigo botão direto "💻 Abrir aplicativo..." — pedido verbatim: "não
   *  deve ser 'Abrir aplicativo...', mas sim 'Acessar este computador'").
   *
   *  Calcula uma posição em frente ao monitor a partir de `entity.x/y/
   *  angulo` (mesma convenção cos/sin documentada em
   *  `_updateCarrosControlados` — "frente" do objeto é `(cos(angulo),
   *  sin(angulo))`) — o jogador fica no lado OPOSTO ("- direção", como um
   *  monitor de mesa que o personagem senta na frente de, olhando pra tela
   *  que fica na direção que o monitor "aponta"), a `DIST_FRENTE_TELA`
   *  metros, na mesma altura Y do monitor + um pequeno ajuste pra "altura
   *  de quem está sentado". Anima a câmera suavemente até lá (não
   *  instantâneo — ver `_tweenCameraTo`) e trava o controle normal
   *  (`_computadorAcessado`, mesmo padrão de `_carroControlado`/
   *  `_entrarNoCarro`). Mostra o cursor normal do mouse (pointer lock
   *  DESLIGADO de propósito — interação de desktop 2D, não mira 3D) e monta
   *  a área de trabalho (`_montarAreaDeTrabalho3D`). */
  _acessarComputador3D(entity) {
    if (!entity || this._computadorAcessado || this._carroControlado) return;
    document.exitPointerLock?.();
    const cam = this._camera;
    this._posAntesDoComputador = { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch };
    this._computadorAcessado = entity;

    const DIST_FRENTE_TELA = 0.7; // metros do "rosto" do jogador até a tela
    const ang = entity.angulo || 0;
    const baseY = (entity.piso || 0) * (this._map?.alturaPiso || 2.8) + (entity.elevacao || 0);
    // "Oposto" da direção que o monitor aponta (cos,sin) — o jogador fica do
    // lado de onde a tela é visível, não atrás dela.
    const px = (entity.x || 0) - Math.cos(ang) * DIST_FRENTE_TELA;
    const pz = (entity.y || 0) - Math.sin(ang) * DIST_FRENTE_TELA;
    const py = baseY + 1.15; // altura aproximada dos olhos de alguém sentado à mesa
    // Yaw de câmera do Three.js (convenção `cameraForwardFlat`, diferente de
    // `entity.angulo` — ver comentário grande de `_updateCarroCamera` pra a
    // derivação completa citada) pra olhar NA DIREÇÃO do monitor a partir
    // daqui: `yaw` tal que `(-sin(yaw),cos(yaw)) == (cos(ang),sin(ang))` →
    // `yaw = ang - Math.PI/2` (mesma fórmula já usada por `_updateCarroCamera`
    // logo abaixo dele no arquivo).
    const yawAlvo = ang - Math.PI / 2;

    this._tweenCameraTo({ x: px, y: py, z: pz, yaw: yawAlvo, pitch: 0 }, 550, () => {
      this._montarAreaDeTrabalho3D(entity);
    });
    Utils.toast?.('🖥️ Acessando computador — ESC ou "🚪 Sair" pra sair', { duration: 2200 });
  },

  /** Tween simples (linear-ease-out) de `this._camera` de onde ela está até
   *  `alvo` em `duracaoMs` — usado só pelo modo computador por ora, mas
   *  escrito genérico o bastante pra reaproveitar em outro lugar no futuro.
   *  Interpola yaw pelo caminho mais curto (evita girar "pelo lado errado"
   *  quando a diferença angular passa de π). Chama `onDone` ao terminar
   *  (ou imediatamente se `duracaoMs<=0`). Cancela um tween anterior em
   *  andamento, se houver (evita 2 tweens de câmera brigando pelo mesmo
   *  `this._camera` ao mesmo tempo). */
  _tweenCameraTo(alvo, duracaoMs, onDone) {
    if (this._computadorTweenRAF) cancelAnimationFrame(this._computadorTweenRAF);
    const cam = this._camera;
    const inicio = { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch };
    let dyaw = alvo.yaw - inicio.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const t0 = performance.now();
    const passo = () => {
      const t = duracaoMs <= 0 ? 1 : Math.min(1, (performance.now() - t0) / duracaoMs);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cúbico — suave, sem "solavanco" no fim
      cam.x = inicio.x + (alvo.x - inicio.x) * ease;
      cam.y = inicio.y + (alvo.y - inicio.y) * ease;
      cam.z = inicio.z + (alvo.z - inicio.z) * ease;
      cam.yaw = inicio.yaw + dyaw * ease;
      cam.pitch = inicio.pitch + (alvo.pitch - inicio.pitch) * ease;
      if (t < 1) {
        this._computadorTweenRAF = requestAnimationFrame(passo);
      } else {
        this._computadorTweenRAF = null;
        onDone?.();
      }
    };
    this._computadorTweenRAF = requestAnimationFrame(passo);
  },

  /** Monta a "área de trabalho" do modo computador (overlay 2D) — pedido
   *  verbatim: "Na área de trabalho do monitor deve ter um ícone de
   *  aplicativo e dando dois cliques nele [...] o app abre em uma janela com
   *  um botão de 'fechar'." Retoma a JANELA já aberta anteriormente se
   *  `entity._sessaoComputador.appAberto` estava true (pedido: "retoma
   *  exatamente de onde parou"). Cursor do mouse normal (não pointer-lock) —
   *  o próprio navegador já mostra o cursor de sistema assim que
   *  `document.exitPointerLock()` roda (chamado em `_acessarComputador3D`),
   *  nenhum CSS extra necessário além de garantir que o overlay não
   *  redireciona cliques de volta pro canvas 3D (`stopPropagation` nos
   *  cliques da área de trabalho, ver abaixo). */
  _montarAreaDeTrabalho3D(entity) {
    if (!this._container || this._container.querySelector('.v3d-computador-overlay')) return;
    const el = document.createElement('div');
    el.className = 'v3d-computador-overlay';
    el.style.cssText = `position:absolute; inset:0; z-index:90; background:#0b1f33 url("${this._gerarFundoAreaTrabalho3D()}"); background-size:cover; font-family:inherit; user-select:none;`;
    // Impede que cliques na área de trabalho "vazem" pro canvas 3D por trás
    // (ex.: disparar tiro/mira do jogo) — mesmo cuidado que outros overlays
    // do projeto já tomam.
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => e.stopPropagation());

    el.innerHTML = `
      <div class="v3d-computador-icone" id="v3d-computador-icone-app" title="Monitoramento de Robôs (dois cliques para abrir)" style="position:absolute; top:18px; left:18px; width:74px; display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; padding:6px; border-radius:8px;">
        <div style="font-size:34px; line-height:1">🤖</div>
        <div style="color:#fff; font-size:11px; text-align:center; text-shadow:0 1px 3px rgba(0,0,0,.8)">Monitoramento<br>de Robôs</div>
      </div>
      <button type="button" id="v3d-computador-sair" title="Sair do computador (ou aperte ESC)" style="position:absolute; bottom:16px; right:16px; z-index:2" class="btn secondary sm">🚪 Sair do computador</button>
      <div id="v3d-computador-janela-slot"></div>
    `;
    this._container.appendChild(el);

    // Realce simples de "selecionado" no ícone ao clicar 1x (feedback visual
    // — sem isso, um duplo-clique não teria nenhuma resposta visual antes de
    // a janela abrir).
    const icone = el.querySelector('#v3d-computador-icone-app');
    icone.addEventListener('mousedown', () => { icone.style.background = 'rgba(255,255,255,0.18)'; });
    document.addEventListener('mouseup', () => { icone.style.background = ''; }, { once: false });

    icone.addEventListener('dblclick', () => this._abrirJanelaMonitoramento3D(entity, el));
    el.querySelector('#v3d-computador-sair').addEventListener('click', () => this._sairDoComputador3D());

    // [13/09/2026] NOVO — "retoma de onde parou": se este MESMO computador já
    // tinha o app aberto numa sessão anterior (`entity._sessaoComputador.
    // appAberto`), reabre a janela automaticamente ao entrar de novo, em vez
    // de mostrar a área de trabalho vazia.
    if (entity._sessaoComputador?.appAberto) {
      this._abrirJanelaMonitoramento3D(entity, el);
    }
  },

  /** Abre a "janela" do app de monitoramento DENTRO da área de trabalho —
   *  título "Monitoramento de Robôs" + conteúdo reaproveitado de
   *  `_openRoboMonitoringApp3D` (agora com suporte a `opts.mount`, ver
   *  acima) + botão "✕ Fechar" que fecha só a JANELA (volta pra área de
   *  trabalho vazia, ainda em modo computador — NÃO sai do computador). */
  _abrirJanelaMonitoramento3D(entity, desktopEl) {
    if (desktopEl.querySelector('.v3d-computador-janela')) return; // já aberta
    const janela = document.createElement('div');
    janela.className = 'v3d-computador-janela';
    janela.style.cssText = 'position:absolute; left:8%; top:10%; width:84%; height:78%; background:#12161c; border:1px solid #3a4250; border-radius:10px; box-shadow:0 12px 40px rgba(0,0,0,.5); display:flex; flex-direction:column; overflow:hidden;';
    janela.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#1c222c; border-bottom:1px solid #3a4250; flex:0 0 auto">
        <span style="font-weight:700; color:#fff">🤖 Monitoramento de Robôs</span>
        <button type="button" id="v3d-computador-janela-fechar" class="btn secondary sm" title="Fecha só esta janela — o computador continua acessado">✕ Fechar</button>
      </div>
      <div id="v3d-computador-janela-corpo" style="flex:1 1 auto; min-height:0; position:relative;"></div>
    `;
    desktopEl.querySelector('#v3d-computador-janela-slot').appendChild(janela);
    const corpo = janela.querySelector('#v3d-computador-janela-corpo');
    entity._sessaoComputador = entity._sessaoComputador || { appAberto: true, roboId: null };
    entity._sessaoComputador.appAberto = true;
    this._openRoboMonitoringApp3D(entity, {
      mount: corpo,
      onClose: () => { /* fechado pelo próprio botão interno — sem uso extra aqui */ },
    });
    janela.querySelector('#v3d-computador-janela-fechar').addEventListener('click', () => {
      corpo.querySelector('.v3d-robo-app-overlay')?._v3dFechar?.();
      janela.remove();
      if (entity._sessaoComputador) entity._sessaoComputador.appAberto = false;
    });
  },

  /** [13/09/2026] NOVO — pedido verbatim: "deve ser possível sair do pc e
   *  deixar o programa 'rodando' [...] fica sendo renderizado na tela do
   *  monitor". Restaura a câmera do jogador pra pose de ANTES de acessar
   *  (`_posAntesDoComputador`), libera `_computadorAcessado` (devolve
   *  WASD/gravidade normais no próximo quadro) e remove o overlay da área
   *  de trabalho do DOM.
   *
   *  LIMITAÇÃO HONESTA (documentada de propósito, ver o comentário grande no
   *  topo desta seção pra a explicação completa): o que de fato "continua
   *  rodando" ao sair é só o ESTADO da sessão (`entity._sessaoComputador` —
   *  qual robô estava sendo visto), não uma renderização visível na malha
   *  real do monitor à distância. Reacessar o MESMO computador retoma a
   *  janela exatamente onde parou (implementado, ver
   *  `_montarAreaDeTrabalho3D`/`_openRoboMonitoringApp3D`), mas de FORA do
   *  modo computador o monitor no cenário 3D não mostra nenhuma prévia da
   *  mini-câmera do robô — simplificação aceita conscientemente em vez de
   *  arriscar estender a malha/UV do monitor sem poder testar ao vivo (ver
   *  motivo completo no comentário grande do topo da seção). */
  _sairDoComputador3D() {
    const entity = this._computadorAcessado;
    if (!entity) return;
    this._computadorAcessado = null;
    this._container.querySelector('.v3d-computador-overlay')?.remove();
    const pose = this._posAntesDoComputador;
    if (pose) {
      const cam = this._camera;
      cam.x = pose.x; cam.y = pose.y; cam.z = pose.z; cam.yaw = pose.yaw; cam.pitch = pose.pitch;
    }
    this._posAntesDoComputador = null;
    Utils.toast?.('🚶 Fora do computador' + (entity._sessaoComputador?.appAberto ? ' — sessão mantida, reacesse pra continuar' : ''), { duration: 1800 });
  },

  // =====================================================================
  // [13/09/2026] NOVO — TAREFA 2 do backlog: PAINEL INTERNO da cabine de
  // elevador. Pedido verbatim: "Os elevadores devem ter painéis internos
  // [...] Estando dentro do elevador, deve ser possível apertar os botões
  // dos andares e ele vai indo nos andares. Deve ter o botão de parada
  // (toggle) [...] um botão de 'fechar as portas' e um botão de 'abrir as
  // portas'." Chamado por `assets/modelos/elevador-cabine.model.js
  // onModelClick` quando o jogador clica na cabine ESTANDO DENTRO dela (ver
  // `_jogadorDentroDaCabine` logo abaixo). Os campos que este painel edita
  // (`andarDestino`/`estado`/`anguloAbertura`/`emergenciaParada`) são os
  // MESMOS que `_exemplo-script-elevador-cabine.txt` já lê/escreve a cada
  // quadro — o painel não introduz nenhum mecanismo de movimento novo, só
  // ESCREVE nos mesmos campos que o Script (quando anexado) processa em
  // `Update(dt)` (ver esse arquivo, atualizado nesta mesma rodada com o
  // novo campo `emergenciaParada` e comentários sobre esta UI).
  // =====================================================================

  /** "Dentro" definido geometricamente, pedido verbatim: "distância XZ do
   *  jogador ao centro da cabine menor que metade da largura/profundidade
   *  dela, e altura Y dentro da faixa da cabine". Dimensões lidas do
   *  perfil de catálogo (`js/engine3d-profiles.js`, OBJECT3D_PROFILES
   *  `'elevador-cabine'`: w=2.0/d=2.0/h=2.2/y0=0) — hardcoded aqui como
   *  fallback pro mesmo valor, já que o perfil não é facilmente importável
   *  isolado deste arquivo sem uma referência circular; se o perfil mudar
   *  de tamanho no catálogo um dia, atualize as constantes abaixo junto. */
  _jogadorDentroDaCabine(entity) {
    if (!entity || entity.tipo !== 'elevador-cabine') return false;
    const LARGURA = 2.0, PROFUNDIDADE = 2.0, ALTURA = 2.2; // ver comentário acima
    const cam = this._camera;
    const dx = cam.x - (entity.x || 0);
    const dz = cam.z - (entity.y || 0);
    if (Math.abs(dx) >= LARGURA / 2 || Math.abs(dz) >= PROFUNDIDADE / 2) return false;
    const baseY = (entity.piso || 0) * (this._map?.alturaPiso || 2.8) + (entity.elevacao || 0);
    // Faixa vertical com uma folga de +-0.3m (pés/cabeça não exatamente na
    // borda da caixa) — o jogador "está" na cabine dos pés até um pouco
    // acima do teto dela.
    return cam.y >= baseY - 0.3 && cam.y <= baseY + ALTURA + 0.3;
  },

  /** Monta e abre o painel de controle interno — overlay 2D, mesmo padrão
   *  visual de `_showObjectCard3D`/demais cartões deste arquivo (não é
   *  tela cheia, é um cartão flutuante — `flashcard3d-overlay`, CSS já
   *  existente em style.css). */
  _abrirPainelElevador3D(entity, ctx) {
    document.exitPointerLock?.();
    const existing = this._container.querySelector('.flashcard3d-overlay');
    if (existing) existing.remove();
    const Mapping = window.Mapping;
    const pisos = Mapping?.getPisos?.(this._map) || [];

    const el = document.createElement('div');
    el.className = 'flashcard3d-overlay';

    const render = () => {
      const fresh = (this._map.objects || []).find((o) => o.id === entity.id) || entity;
      const emMovimento = fresh.estado === 'subindo' || fresh.estado === 'descendo';
      const parada = !!fresh.emergenciaParada;
      const botoesAndarHtml = pisos.map((p, i) => {
        const atual = fresh.andarAtual === i;
        const indoPraCa = fresh.andarDestino === i && emMovimento;
        const estilo = atual ? 'background:#2f8f4e; color:#fff' : indoPraCa ? 'background:#e0a028; color:#111' : '';
        return `<button type="button" class="btn secondary sm v3d-elev-andar" data-piso="${i}" style="${estilo}" ${atual ? 'title="Andar atual"' : ''} ${parada ? 'disabled' : ''}>${Utils.escapeHtml(p.nome || `Andar ${i + 1}`)}${atual ? ' ✓' : indoPraCa ? ' …' : ''}</button>`;
      }).join('');
      el.innerHTML = `
        <div style="text-align:center; font-weight:700; margin-bottom:8px">🛗 Painel de Controle — Elevador</div>
        <div style="text-align:center; font-family:monospace; opacity:.75; margin-bottom:8px">Andar atual: ${fresh.andarAtual ?? '—'}${emMovimento ? ` · indo pro andar ${fresh.andarDestino}` : ''}${parada ? ' · ⛔ PARADO (emergência)' : ''}</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px">${botoesAndarHtml}</div>
        <button type="button" class="btn ${parada ? 'danger' : 'secondary'} block sm" id="v3d-elev-parada" style="margin-bottom:6px" title="Alterna o estado de parada de emergência — enquanto ativo, a cabine não se move mesmo com destino pendente">${parada ? '▶️ Retomar operação' : '⛔ Parada de emergência'}</button>
        <div style="display:flex; gap:6px; margin-bottom:6px">
          <button type="button" class="btn secondary sm" id="v3d-elev-abrir" style="flex:1" ${emMovimento ? 'disabled' : ''} title="Força as portas a abrir imediatamente">🚪⟵⟶ Abrir portas</button>
          <button type="button" class="btn secondary sm" id="v3d-elev-fechar" style="flex:1" ${emMovimento ? 'disabled' : ''} title="Força as portas a fechar imediatamente">🚪⟶⟵ Fechar portas</button>
        </div>
        <button class="btn block sm" id="v3d-fc-close" style="margin-top:6px" title="Fechar este painel">Fechar</button>
      `;
      el.querySelector('#v3d-fc-close').onclick = () => el.remove();
      el.querySelectorAll('.v3d-elev-andar').forEach((btn) => {
        btn.addEventListener('click', () => {
          const alvo = (this._map.objects || []).find((o) => o.id === entity.id);
          if (!alvo || alvo.emergenciaParada) return;
          const i = Number(btn.dataset.piso);
          alvo.andarDestino = i;
          // Mesma lógica de transição de estado que o Script usa ao ouvir
          // `chamarElevador` (ver `_aoOuvirChamada` em
          // _exemplo-script-elevador-cabine.txt) — reaproveitada aqui pro
          // botão interno decidir subir/descer/já estar no andar.
          if (alvo.estado === 'parado' || alvo.estado === undefined) {
            alvo.estado = i > (alvo.andarAtual || 0) ? 'subindo' : (i < (alvo.andarAtual || 0) ? 'descendo' : 'portaAbrindo');
          }
          render();
        });
      });
      el.querySelector('#v3d-elev-parada').addEventListener('click', () => {
        const alvo = (this._map.objects || []).find((o) => o.id === entity.id);
        if (!alvo) return;
        alvo.emergenciaParada = !alvo.emergenciaParada;
        render();
      });
      el.querySelector('#v3d-elev-abrir').addEventListener('click', () => {
        const alvo = (this._map.objects || []).find((o) => o.id === entity.id);
        if (!alvo || alvo.estado === 'subindo' || alvo.estado === 'descendo') return;
        alvo.estado = 'portaAbrindo';
        render();
      });
      el.querySelector('#v3d-elev-fechar').addEventListener('click', () => {
        const alvo = (this._map.objects || []).find((o) => o.id === entity.id);
        if (!alvo || alvo.estado === 'subindo' || alvo.estado === 'descendo') return;
        alvo.estado = 'portaFechando';
        render();
      });
    };
    render();
    this._container.appendChild(el);
  },

  lerTrajetoEstruturadoDoRobo(robo) {
    const pts = robo?.propriedades?.trajeto;
    if (!Array.isArray(pts) || !pts.length) return null;
    const limpos = pts
      .map((p) => (p && typeof p.x === 'number' && typeof p.y === 'number')
        ? { x: p.x, y: p.y, esperaMs: typeof p.esperaMs === 'number' ? p.esperaMs : 0 }
        : null)
      .filter(Boolean);
    return limpos.length ? limpos : null;
  },

  /** Acha o índice de progresso atual do robô, SE o script dele gravar esse
   *  estado externamente. LIMITAÇÃO documentada (pedido do usuário —
   *  "honestamente"): só funciona se o próprio Script do robô gravar
   *  `obj.propriedades._trajetoIndiceAtual` a cada avanço de waypoint —
   *  isto foi ADICIONADO nesta mesma rodada aos 4 scripts de exemplo
   *  (`_exemplo-script-robo-trajeto.txt`/`-limpeza.txt`/`-copa.txt`/
   *  `-recepcionista.txt`). Um robô com um script COLADO ANTES desta
   *  atualização (ou copiado de uma versão antiga salva em outro lugar)
   *  não tem esse campo — `null` é devolvido nesse caso, e a tela mostra
   *  a lista de waypoints sem marcar nenhum como "atual"/"visitado". */
  _progressoTrajetoRobo(robo) {
    const idx = robo?.propriedades?._trajetoIndiceAtual;
    return (typeof idx === 'number' && idx >= 0) ? idx : null;
  },

  /** Renderiza o em uma câmera THREE.js temporária posicionada NA visão do
   *  robô ("ver o que ele está vendo") — reaproveita a MESMA infraestrutura
   *  de câmera-em-render-target já usada pela Miniatura 3D/"MODO EYE" (ver
   *  comentário grande no construtor de `js/engine3d.js`): em vez de criar
   *  um 2º contexto WebGL (caro, e o projeto já documenta que só usa UM
   *  contexto compartilhado — ver "MODO EYE"), reposiciona TEMPORARIAMENTE
   *  a câmera principal (`this._engine.camera3`) do motor já em uso por
   *  "Ver em 3D", pede um frame extra (`_presentFrame()`), copia o
   *  resultado pro canvas pequeno do painel (`drawImage` do canvas WebGL
   *  pro canvas 2D — cópia síncrona, funciona sem `preserveDrawingBuffer`
   *  porque acontece no MESMO turn de JS que o render, antes do navegador
   *  compor a tela) e IMEDIATAMENTE devolve a câmera pra pose original —
   *  por isso não há nenhum "flash" visível pro usuário: o quadro
   *  intermediário nunca chega a ser exibido, só lido de volta pra CPU.
   *  Chamado periodicamente (ver `_openRoboMonitoringApp3D`, a cada
   *  300ms — não todo frame, custo real de um render extra por chamada). */
  _renderRoboEyeFrame(robo, canvasAlvo) {
    const eng = this._engine;
    if (!eng || !eng._ready || !eng.camera3 || !canvasAlvo) return false;
    const cam = eng.camera3;
    const posOrig = cam.position.clone();
    const quatOrig = cam.quaternion.clone();
    const fovOrig = cam.fov;
    try {
      const ang = robo.angulo || 0;
      const olhoY = (robo.elevacao || 0) + 0.3; // ~30cm acima da base do robô, "altura dos olhos" dele
      cam.position.set(robo.x || 0, olhoY, robo.y || 0);
      cam.fov = 75;
      cam.updateProjectionMatrix();
      cam.lookAt(cam.position.x + Math.cos(ang), olhoY, cam.position.z + Math.sin(ang));
      eng._presentFrame();
      const ctx = canvasAlvo.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasAlvo.width, canvasAlvo.height);
        ctx.drawImage(eng.canvas, 0, 0, canvasAlvo.width, canvasAlvo.height);
      }
      return true;
    } catch (err) {
      console.error('[View3D] _renderRoboEyeFrame: falha ao renderizar a "câmera do robô" —', err);
      return false;
    } finally {
      // Sempre devolve a câmera principal pra pose de navegação normal do
      // usuário, MESMO se algo acima estourar — nunca deixa "Ver em 3D"
      // travado olhando pelo robô por engano.
      cam.position.copy(posOrig);
      cam.quaternion.copy(quatOrig);
      cam.fov = fovOrig;
      cam.updateProjectionMatrix();
    }
  },

  /** O "aplicativo" em si — lista de robôs agrupados por andar (a. do
   *  pedido), painel de detalhes com trajeto/progresso (b./c.) e a
   *  mini-câmera "o que ele está vendo" (d.). */
  /** [13/09/2026] AJUSTADO — "MODO COMPUTADOR": passou a aceitar um 2º
   *  parâmetro `opts.mount` opcional — quando presente, o "aplicativo" é
   *  desenhado DENTRO desse elemento (a "janela" da área de trabalho do
   *  modo computador, ver `_abrirJanelaMonitoramento3D` mais abaixo) em vez
   *  de um overlay tela-cheia sobre `this._container`. SEM ISSO mudar o
   *  comportamento de quem já chamava sem `opts` (nenhuma chamada restante
   *  faz isso hoje — o botão do cartão do monitor agora abre sempre via
   *  `_acessarComputador3D`/modo computador — mas o método continua
   *  funcionando "solto" pra não quebrar nada que dependa dele). */
  _openRoboMonitoringApp3D(monitorObj, opts) {
    const mount = opts?.mount || null;
    const raiz = mount || this._container;
    if (!raiz || raiz.querySelector('.v3d-robo-app-overlay')) return;
    if (!mount) document.exitPointerLock?.();
    const TIPOS_ROBO = ['robo', 'robo-limpeza', 'robo-copa', 'robo-recepcionista'];
    const robos = (this._map.objects || []).filter((o) => TIPOS_ROBO.includes(o.tipo));
    const andarDoMonitor = Mapping.getAndarDaEntidade(monitorObj, this._map);
    // Agrupa por andar (Mapping.getAndarDaEntidade devolve `null` quando o
    // mapa não tem nenhum "Piso" plantado ainda — ver mapping.js — nesse
    // caso todos os robôs caem num único grupo "Sem andar definido").
    const porAndar = new Map();
    for (const r of robos) {
      const andar = Mapping.getAndarDaEntidade(r, this._map);
      const chave = andar == null ? 'sem-andar' : String(andar);
      if (!porAndar.has(chave)) porAndar.set(chave, []);
      porAndar.get(chave).push(r);
    }
    const chaveDestaque = andarDoMonitor == null ? 'sem-andar' : String(andarDoMonitor);
    const pisos = Mapping.getPisos(this._map);
    const labelAndar = (chave) => {
      if (chave === 'sem-andar') return 'Sem andar definido';
      const i = Number(chave);
      return pisos[i]?.nome || `Andar ${i + 1}`;
    };

    const overlay = document.createElement('div');
    overlay.className = 'map2d-componentpanel-confinado v3d-robo-app-overlay';
    // Windowed (dentro da "janela" do modo computador): mesma aparência,
    // sem `z-index`/`inset:0` fixo travando o resto da área de trabalho —
    // o próprio `mount` (corpo da janela) já cuida do tamanho/posição.
    overlay.style.cssText = mount
      ? 'position:relative; width:100%; height:100%; background:#0a0d11; overflow-y:auto; padding:14px; color:var(--text, #e8e8e8); font-size:13px; box-sizing:border-box;'
      : 'position:absolute; inset:0; z-index:85; background:#0a0d11; overflow-y:auto; padding:14px; color:var(--text, #e8e8e8); font-size:13px;';

    const grupoHtml = (chave, destaque) => {
      const lista = porAndar.get(chave) || [];
      const itensHtml = lista.map((r) => `
        <div class="v3d-robo-item" data-robo-id="${r.id}" style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; margin:4px 0; border:1px solid var(--border,#2a3038); border-radius:8px; cursor:pointer; background:rgba(255,255,255,0.03)">
          <span>🤖 ${Utils.escapeHtml(window.Icons?.labelForAnyKey?.(r.tipo) || r.tipo)} <span style="opacity:.6; font-family:monospace; font-size:11px">#${Utils.escapeHtml(String(r.id).slice(-6))}</span></span>
          <span style="opacity:.6">›</span>
        </div>`).join('') || `<div style="opacity:.6; padding:6px 10px">Nenhum robô neste andar.</div>`;
      return `
        <details class="v3d-robo-grupo" data-andar="${chave}" ${destaque ? 'open' : ''} style="margin-bottom:10px; border:1px solid var(--border,#2a3038); border-radius:8px; padding:8px 10px">
          <summary style="cursor:pointer; font-weight:700">${destaque ? '📍 ' : ''}${Utils.escapeHtml(labelAndar(chave))} (${lista.length})${destaque ? ' — este computador' : ''}</summary>
          <div style="margin-top:6px">${itensHtml}</div>
        </details>`;
    };

    const outrasChaves = [...porAndar.keys()].filter((k) => k !== chaveDestaque);
    overlay.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px">
        <div style="font-weight:800; font-size:16px">💻 Monitoramento de Robôs</div>
        <button type="button" class="btn secondary sm" id="v3d-robo-app-fechar">✕ Fechar aplicativo</button>
      </div>
      <p style="opacity:.7; margin:0 0 10px">Robôs de ${Utils.escapeHtml(labelAndar(chaveDestaque))} (andar deste computador) aparecem expandidos por padrão. Clique num robô pra ver detalhes/trajeto.</p>
      <div id="v3d-robo-grupos">
        ${grupoHtml(chaveDestaque, true)}
        ${outrasChaves.length ? `<button type="button" class="btn secondary sm block" id="v3d-robo-ver-todos" style="margin:6px 0">🏢 Ver todos os andares (${outrasChaves.length} outro(s))</button>` : ''}
        <div id="v3d-robo-outros-andares" class="hidden">${outrasChaves.map((k) => grupoHtml(k, false)).join('')}</div>
      </div>
      <div id="v3d-robo-detalhe" style="margin-top:14px"></div>
    `;
    raiz.appendChild(overlay);
    // Botão "✕ Fechar aplicativo" some na versão em janela — quem fecha a
    // JANELA é o "✕ Fechar" do título dela (ver `_abrirJanelaMonitoramento3D`);
    // manter os dois seria redundante e confuso dentro de uma janela pequena.
    if (mount) overlay.querySelector('#v3d-robo-app-fechar').style.display = 'none';

    let intervaloEye = null;
    const pararEye = () => { if (intervaloEye) { clearInterval(intervaloEye); intervaloEye = null; } };

    const fechar = () => {
      pararEye();
      overlay.remove();
      opts?.onClose?.();
    };
    overlay.querySelector('#v3d-robo-app-fechar').onclick = fechar;
    // Expõe `fechar`/`pararEye` pro chamador em modo janela poder fechar de
    // fora (botão "✕ Fechar" do título da janela) sem duplicar a lógica de
    // limpar o intervalo da mini-câmera.
    overlay._v3dFechar = fechar;
    overlay.querySelector('#v3d-robo-ver-todos')?.addEventListener('click', (ev) => {
      overlay.querySelector('#v3d-robo-outros-andares').classList.remove('hidden');
      ev.target.remove();
    });

    const abrirDetalhe = (roboId) => {
      pararEye();
      const robo = (this._map.objects || []).find((o) => o.id === roboId);
      const painel = overlay.querySelector('#v3d-robo-detalhe');
      if (!robo) { painel.innerHTML = ''; return; }
      // [13/09/2026] NOVO — "MODO COMPUTADOR": grava qual robô está sendo
      // visto NA SESSÃO deste computador (`monitorObj._sessaoComputador`,
      // campo EFÊMERO — em memória, não persistido no mapa salvo, ver
      // documentação grande em `_acessarComputador3D`), pra que sair e
      // reacessar o MESMO computador retome de onde parou (pedido verbatim:
      // "se o jogador tornar a 'acessar' aquele mesmo computador depois, a
      // área de trabalho retoma exatamente de onde parou").
      if (monitorObj) monitorObj._sessaoComputador = { appAberto: true, roboId };

      // [13/09/2026 REESCRITO] Lê o trajeto DIRETO do dado estruturado do
      // objeto — ver comentário grande em `lerTrajetoEstruturadoDoRobo`
      // acima. SEM parse de texto/regex/`new Function` nenhum sobre o
      // Script do robô: funciona pra QUALQUER robô, mesmo com o Script
      // totalmente reescrito pelo usuário, porque o trajeto não mora mais
      // dentro do texto do script.
      const waypoints = this.lerTrajetoEstruturadoDoRobo(robo);
      const progresso = this._progressoTrajetoRobo(robo); // índice atual, ou null (ver limitação documentada acima)

      const trajetoHtml = !waypoints
        ? `<p style="opacity:.7">Trajeto ainda não definido <span style="font-size:11px">(abra o painel de propriedades deste robô no Mapa 2D → seção "🗺️ Trajeto do robô" → "➕ Adicionar ponto")</span>.</p>`
        : `
          <p style="margin:8px 0 4px; font-weight:600">🗺️ Trajeto / Plano de viagem${progresso != null ? ` — Ponto ${progresso + 1} de ${waypoints.length} (atual)` : ''}</p>
          ${progresso == null ? `<p style="opacity:.6; font-size:11px; margin:0 0 6px">Progresso não disponível — este robô roda um script que ainda não grava <code>_trajetoIndiceAtual</code> (scripts colados antes desta atualização não têm esse campo).</p>` : ''}
          <ol style="margin:4px 0 0; padding-left:20px">
            ${waypoints.map((p, i) => {
              const visitado = progresso != null && i < progresso;
              const atual = progresso != null && i === progresso;
              const estilo = atual ? 'font-weight:700; color:var(--accent,#5bb0ff)' : visitado ? 'opacity:.55; text-decoration:line-through' : '';
              const marca = atual ? ' ← atual' : visitado ? ' ✓ já feito' : '';
              const espera = p.esperaMs ? ` — espera ${(p.esperaMs / 1000).toFixed(1)}s` : '';
              return `<li style="${estilo}">Ponto ${i + 1}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})${espera}${marca}</li>`;
            }).join('')}
          </ol>`;

      painel.innerHTML = `
        <div style="border-top:1px solid var(--border,#2a3038); padding-top:10px">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <div style="font-weight:700">🤖 ${Utils.escapeHtml(window.Icons?.labelForAnyKey?.(robo.tipo) || robo.tipo)}</div>
            <button type="button" class="btn secondary sm" id="v3d-robo-det-fechar">✕</button>
          </div>
          <div style="margin:8px 0; font-family:monospace; font-size:12px; opacity:.8">
            Posição atual: x=${(robo.x || 0).toFixed(2)}, y=${(robo.y || 0).toFixed(2)}, elevação=${(robo.elevacao || 0).toFixed(2)}
          </div>
          ${trajetoHtml}
          <p style="margin:12px 0 4px; font-weight:600">📷 O que ele está vendo</p>
          <canvas id="v3d-robo-eye-canvas" width="320" height="180" style="width:100%; max-width:420px; aspect-ratio:16/9; background:#000; border-radius:6px; display:block"></canvas>
          <p style="opacity:.55; font-size:11px; margin:4px 0 0">Câmera reaproveitada da cena 3D já em uso, atualizada a cada ~300ms (não em tempo real quadro-a-quadro, por custo de renderização).</p>
        </div>
      `;
      painel.querySelector('#v3d-robo-det-fechar').onclick = () => {
        pararEye();
        painel.innerHTML = '';
        if (monitorObj) monitorObj._sessaoComputador = { appAberto: true, roboId: null };
      };
      const canvasEye = painel.querySelector('#v3d-robo-eye-canvas');
      const tick = () => {
        const fresh = (this._map.objects || []).find((o) => o.id === roboId);
        if (!fresh || !overlay.isConnected) { pararEye(); return; }
        this._renderRoboEyeFrame(fresh, canvasEye);
      };
      tick();
      intervaloEye = setInterval(tick, 300);
    };

    overlay.querySelectorAll('.v3d-robo-item').forEach((item) => {
      item.addEventListener('click', () => abrirDetalhe(item.dataset.roboId));
    });

    // [13/09/2026] NOVO — "MODO COMPUTADOR": retoma a sessão anterior deste
    // MESMO computador, se havia um robô sendo visto quando o app foi
    // deixado "rodando" (ver `monitorObj._sessaoComputador` gravado acima).
    if (monitorObj?._sessaoComputador?.roboId) {
      abrirDetalhe(monitorObj._sessaoComputador.roboId);
    }
  },

  /** [13/09/2026] REFATORADO — mesma extração documentada em
   *  `_showTijoloAglomeradoCard3D`/`_showCameraCard3D`/`_showFotoPinCard3D`/
   *  `_showObjectCard3DBody` acima e no comentário grande no topo de
   *  `js/cardsystem.js`. Conteúdo/estilo/wiring completo agora em
   *  `cards/orphan-patrimonio-card.js` — a checagem "sem entradas, não
   *  mostra card nenhum" continua aqui (decisão de NÃO montar, não
   *  conteúdo de card — ver comentário no topo do arquivo do card). */
  async _showOrphanPatrimonioCard3D(obj) {
    document.exitPointerLock?.();
    const entries = obj.itemIds || [];
    if (!entries.length) return;
    const ctx = window.ObjectAssets?.buildCtx
      ? window.ObjectAssets.buildCtx({ view3d: this, DB: window.DB, Utils: window.Utils, map: this._map })
      : { view3d: this, DB: window.DB, Utils: window.Utils, map: this._map };
    window.CardSystem?.mount(this._container, 'orphan-patrimonio', obj, ctx);
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
      //
      // CORRIGIDO (13/09/2026), bug relatado: "andar em baixo de uma parede
      // que levita acaba sendo um bloqueio invisível... da parte de baixo
      // agora" — a conta acima esquecia a BASE vertical da parede: `w.piso`
      // empilha a parede em `wallBase = piso*2.8` (prédio de vários andares
      // — ver Mapping.addWall/engine3d.js `pisoY`), então a faixa vertical
      // de verdade que a parede ocupa é `[wallBase, wallBase + w.height]`,
      // NUNCA `[0, w.height]` como este teste comparava (`feetY` é sempre
      // absoluto, ver `cam.y - EYE_HEIGHT`) — uma parede de um andar
      // superior (piso>0, "levitando" bem acima do chão do andar de baixo)
      // tinha sua base tratada como se fosse y=0, então bloqueava
      // horizontalmente QUALQUER altura abaixo de `w.height`, inclusive o
      // andar inteiro por baixo dela, onde deveria estar livre. Agora: só
      // bloqueia se os pés estiverem ABAIXO do topo (`wallTop`, mesmo teste
      // de "por cima dela" de antes, só que relativo à base certa) E a
      // CABEÇA (aproximada por `feetY + EYE_HEIGHT`) já tiver alcançado a
      // base da parede — abaixo disso o jogador está literalmente andando
      // por baixo do vão livre e não deve colidir.
      const wallBase = (w.piso || 0) * (this._map?.alturaPiso || 2.8);
      const wallTop = wallBase + (w.height ?? 2.6);
      if (feetY >= wallTop - 1e-4) continue; // por cima da parede
      if (feetY + this.EYE_HEIGHT <= wallBase + 1e-4) continue; // por baixo do vão livre (parede levitando)
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
      // [13/09/2026] alturaPiso do mapa repassado pra escada não usar mais
      // um valor fixo desconectado do pé-direito real (ver comentário grande
      // em Mapping.objectTopHeightAt) — pra qualquer objeto que não seja
      // 'escada' esse argumento extra é simplesmente ignorado.
      const top = Mapping.objectTopHeightAt(o, x, z, this._map?.alturaPiso);
      if (top <= best) continue; // já achamos algo mais alto (ou igual) nesta mesma varredura
      if (top <= feetY + this.STEP_MAX + 1e-4) best = top; // alcançável andando (degrau) ou já vindo de cima dele
    }
    return best;
  },

  _loop(t) {
    if (!this._running) return;
    const delta = Math.min(0.05, (t - this._lastT) / 1000);
    this._lastT = t;
    // [18/09/2026 UTC] NOVO (RODADA 152) — WATCHDOG por QUADRO, pedido
    // verbatim do usuário: "a solução que você implementou funciona, porém
    // ainda existe o salto (agora o salto que tinha antes + o salto de
    // correção [...]). Implemente este watch dog [...] pois este salto é
    // percebido visualmente, então pode ser no evento de redraw que está
    // havendo alguma mudança." Todo o log da RODADA 147/150 até aqui só
    // registrava yaw/pitch nos EVENTOS (keydown/mousemove/pointerlockchange)
    // — nunca no que a TELA de fato desenha a cada quadro. Isso deixa uma
    // lacuna: o `mousemove` sintético do "salto" e a correção do fallback
    // (RODADA 150, `onPointerLockChange`) acontecem em MOMENTOS diferentes
    // (o 1º dentro do handler de `mousemove`, o 2º só quando o
    // `pointerlockchange` de saída chega — um evento nativo assíncrono, que
    // pode demorar mais de um quadro pra disparar) — nesse intervalo, é
    // bem possível que 1 ou mais quadros já tenham sido DESENHADOS com o
    // valor "saltado" antes da correção rodar, o que explicaria o usuário
    // "ver" tanto o salto quanto a correção (2 mudanças visuais em vez de
    // 0), mesmo o valor FINAL (depois de tudo assentar) batendo certo. Este
    // watchdog roda bem no INÍCIO de todo quadro (antes de física/input/
    // render, pra pegar o valor exatamente como a última coisa deixou),
    // compara com o yaw/pitch do ÚLTIMO quadro já logado, e — se mudou —
    // registra 1 linha nova no painel de debug (`_v3dLog`) com de/para e o
    // delta, deixando explícito EM QUAL QUADRO cada mudança de verdade
    // aconteceu (inclusive as que os logs de evento já cobriam, agora
    // "carimbadas" pelo quadro em que realmente vão aparecer na tela — e
    // qualquer mudança que NENHUM log de evento explique, o que apontaria
    // pra uma 3ª fonte ainda não identificada). Comparação usa uma
    // tolerância minúscula (1e-6 rad) só pra não logar ruído de
    // ponto-flutuante; nenhuma mudança de comportamento da câmera em si —
    // 100% observação passiva.
    if (this._camera && this._v3dLog) {
      const yawAgora = this._camera.yaw, pitchAgora = this._camera.pitch;
      if (this._v3dWatchdogUltimoYaw == null) {
        this._v3dWatchdogUltimoYaw = yawAgora;
        this._v3dWatchdogUltimoPitch = pitchAgora;
      } else if (Math.abs(yawAgora - this._v3dWatchdogUltimoYaw) > 1e-6 || Math.abs(pitchAgora - this._v3dWatchdogUltimoPitch) > 1e-6) {
        const yawDeg = (v) => (v * 180 / Math.PI).toFixed(1);
        this._v3dLog(`🖼️ QUADRO redesenhado com novo yaw/pitch: de ${yawDeg(this._v3dWatchdogUltimoYaw)}°/${yawDeg(this._v3dWatchdogUltimoPitch)}° para ${yawDeg(yawAgora)}°/${yawDeg(pitchAgora)}° (Δyaw=${yawDeg(yawAgora - this._v3dWatchdogUltimoYaw)}° Δpitch=${yawDeg(pitchAgora - this._v3dWatchdogUltimoPitch)}°)`);
        this._v3dWatchdogUltimoYaw = yawAgora;
        this._v3dWatchdogUltimoPitch = pitchAgora;
      }
    }
    // [13/09/2026] UNIFICAÇÃO DE LOOPS — pedido do usuário: "integrar loop de
    // renderização geral com o loop de renderização próprio do Modelador,
    // motor 3D compartilhado [...] para que não haja conflitos entre eles
    // [...] Se já há em parte deve ser total." ANTES (pedido original de
    // 28/08/2026, mantido só como registro histórico): o loop do View3D
    // (física/ghosts de construção/RENDER) ficava todo em PAUSA enquanto o
    // Modelador estava aberto (`Modeler3D`, js/modeler/*.js — mesma
    // engine/scene/câmera), MAS continuava se reagendando sozinho
    // (`this._loopHandle = requestAnimationFrame(...)`) só pra "estar vivo"
    // e retomar quando o Modelador fechasse — isso criava DOIS
    // `requestAnimationFrame` paralelos de verdade (este aqui, girando à
    // toa; e `Modeler3D._renderLoop`, fazendo o trabalho de verdade),
    // tecnicamente concorrendo pelo mesmo quadro do navegador pra mexer na
    // MESMA instância de `Engine3D`/renderer WebGL — um "loop zumbi".
    // CORRIGIDO: em vez de pular e só se reagendar, este loop AGORA chama
    // diretamente o trabalho por-quadro do Modelador (`Modeler3D.driveFrame()`
    // — internamente um no-op se a sessão ativa não for "dirigida de fora",
    // ver comentário grande em `Modeler3D.enter()`/`driveFrame`, modeler-
    // core.js) e SÓ DEPOIS se reagenda — exatamente como fazia antes, só que
    // agora fazendo o trabalho de verdade em vez de girar à toa. Resultado:
    // esta é a ÚNICA cadeia de `requestAnimationFrame` viva pra esta
    // instância de `Engine3D`, em qualquer momento — nunca duas rodando de
    // verdade ao mesmo tempo, nunca nenhuma (`Modeler3D` não cria mais o seu
    // próprio `requestAnimationFrame` quando é o View3D real quem o abriu).
    // Física/animações/HUD do View3D (abaixo) continuam INTENCIONALMENTE
    // pulados enquanto o Modelador está ativo (mesmo comportamento de
    // sempre) — só o "ficar girando à toa" foi substituído por trabalho de
    // verdade.
    if (window.Modeler3D?.isActive?.()) {
      window.Modeler3D.driveFrame();
      this._loopHandle = requestAnimationFrame((tt) => this._loop(tt));
      return;
    }
    // NOVO (07/09/2026), pedido verbatim: "scripts para os objetos como no
    // Unity... Útil para animações..." — avança as animações registradas via
    // Scripting.tween (ver js/scripting.js), a cada quadro, igual a física
    // logo abaixo. Roda mesmo se `delta` ainda não tiver sido calculado
    // neste ponto (ver `delta` acima, já calculado antes desta linha) —
    // custo zero quando não há nenhuma animação pendente.
    window.Scripting?.tick?.(delta);
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
      // [10/09/2026] NOVO — "orb de câmera" (ver this._orbCamMode, mount()):
      // re-trava `this._camera` na pose calibrada TODO quadro, ANTES de
      // qualquer outra coisa mexer nela (mouse-look, WASD, gravidade,
      // sobrevoo) — pedido verbatim: "não dá para olhar em volta pois a
      // câmera fica fixa". Como `this._camera` é a MESMA usada por todo o
      // raycasting de seleção/posicionamento (_placeWithBuildTool etc — ver
      // comentário grande em _enterCameraOrbView), travar aqui, no único
      // lugar, é suficiente — sem precisar caçar/gatear cada handler de
      // mouse/teclado que toca `this._camera` espalhado pelo arquivo
      // (onMouseMove, o loop de WASD logo abaixo, `_updateAutopilot`, etc.):
      // qualquer mutação que aconteça entre um quadro e outro é desfeita
      // aqui antes da cena ser desenhada — nunca acumula/deriva.
      if (this._orbCamMode && this._orbCamLockedPose) {
        const lp = this._orbCamLockedPose;
        // [10/09/2026] CORRIGIDO — `_camViewPanOffset` NÃO é mais somado à
        // posição aqui (ver comentário grande em `_computeFotoCamPose`,
        // mesmo motivo: deslocar a posição real muda a perspectiva de
        // verdade, o oposto do pedido do usuário). A pose travada (`lp`)
        // é reaplicada 100% pura; o pan vira um deslocamento de "lente" em
        // `camera3`, aplicado à parte logo antes de `this._engine.render`.
        this._camera.x = lp.x; this._camera.y = lp.y; this._camera.z = lp.z;
        this._camera.yaw = lp.yaw; this._camera.pitch = lp.pitch;
      }
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
        : this._camMode ? this._computeWatchCameraPose()
        // [10/09/2026] RESTAURADO — "ver através" de um orb de foto/câmera,
        // MESMO padrão de pose calculada à parte substituindo só a câmera
        // renderizada (ver _computeFotoCamPose acima e comentário grande em
        // this._fotoCamMode, mount()).
        : this._fotoCamMode ? this._computeFotoCamPose()
        : this._camera;
      // Pedido do usuário: transição suave ao VOLTAR do Modelador pro modo
      // normal de navegação (a metade "de entrada" fica em modeler-core.js
      // `enter()`/`_updateOrbitCamera` — ver comentário lá). `this._camera`
      // já é o valor de VERDADE desde antes (nunca foi tocado enquanto o
      // Modelador estava aberto — ver o retorno antecipado no topo deste
      // `_loop`), então só a pose RENDERIZADA (`renderCam`) é interpolada
      // aqui, sem mexer em `this._camera` nem no resto da física/input.
      if (this._camTransition && !this._camMode && !this._fotoCamMode) {
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
      if (this._camMode || this._fotoCamMode) {
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
      // [10/09/2026] Pan de "lente" (Shift+botão-do-meio em câmera-vista,
      // ver onMouseMove/`Engine3D.setCamPanFrac`) aplicado aqui, todo
      // quadro, e só quando um dos 2 modos de câmera-vista está ativo —
      // nos outros casos (`_camViewPanOffset` sempre `{x:0,y:0}` fora
      // deles, zerado por `_resetCamZoom` ao sair) não precisa reaplicar
      // nada: `camera3.clearViewOffset()` já foi chamado na saída e
      // continua limpo até a próxima sessão de câmera-vista.
      if (this._fotoCamMode || this._orbCamMode) {
        const off = this._camViewPanOffset || { x: 0, y: 0 };
        this._engine.setCamPanFrac(off.x, off.y);
        // [12/09/2026 — RODADA "mesma imagem"] `_updateFotoCamOverlayZoomScale()`
        // agora roda TODO QUADRO, incondicionalmente, nos 2 modos de
        // profundidade — pedido verbatim: "seria a mesma exata imagem a
        // ser usada (tanto em 'Frente' quanto quando 'Trás' estiver
        // marcada), e o depth buffer seria usado apenas para a 'aparição'
        // dos objetos substituindo os pixels da imagem." Ela é a ÚNICA
        // fonte da imagem desenhada (`#v3d-fotocam-photo-canvas`), usada
        // tanto pra exibição direta ('Frente', por cima de tudo via CSS)
        // quanto como textura do shader de tela cheia ('Trás', ver
        // `_updateFotoCamBackdropPlane` logo abaixo) — substitui a antiga
        // chamada a `_redrawFotoCamBackdropCanvas()` (canvas off-screen
        // dedicado, ELIMINADO nesta rodada). Rodar sempre (não só em
        // handlers pontuais de pan/zoom/resize) evita reintroduzir o
        // mesmo bug de cache dessincronizado já documentado (CHANGELOG
        // 11/09/2026).
        this._updateFotoCamOverlayZoomScale();
        const bdCfg = this._getFotoCamBackdropConfig();
        const imgElLoop = this._fotoCamImgEl;
        // [22/09/2026] REVERTIDO (mesma rodada) — a 1ª tentativa desta
        // correção desligava o oclusor/máscara inteiros sempre que a
        // opacidade caía abaixo de 1, e passava a desenhar a foto como uma
        // camada TRANSLÚCIDA por CIMA de tudo (`z-index` acima do
        // `#v3d-canvas`, ver `_updateFotoCamOverlayZoomScale`/
        // `_drawFotoCamPhoto`, revertido lá também). Pedido verbatim do
        // usuário CORRIGINDO isso: "Mesmo com a opacidade < 1, estando
        // marcado 'Trás' a imagem deve continuar atrás dos objetos. Você
        // colocou ela para frente." CAUSA RAIZ do meu erro: pôr a foto por
        // CIMA de tudo (mesmo translúcida) faz ela aparecer inclusive por
        // cima de objetos 3D REAIS mais perto que deveriam continuar
        // ocluindo-a normalmente (a razão de existir do modo 'Trás') —
        // regressão clara. CORRIGIDO DE VERDADE: o oclusor/máscara volta a
        // ficar SEMPRE ativo em 'Trás' (qualquer opacidade, exatamente como
        // sempre foi) — objetos reais mais perto continuam ocluindo a foto
        // normalmente, em QUALQUER opacidade. O pedido original (ver chão/
        // neblina variando com a opacidade) agora é resolvido por um 2º
        // passe de render SEPARADO, só de LEITURA (nunca participa da
        // oclusão/máscara principal) — ver `Engine3D._renderBackdropEnvPass`/
        // `_presentToCanvas` — que compõe o ambiente real (sem o oclusor/
        // máscara do chão) DENTRO do retângulo da foto, por cima do
        // resultado já existente, num alfa proporcional a `(1-opacidade)`
        // — mesmo padrão (2 render targets) já usado pro vidro
        // (`_renderGlassOnlyPass`), nunca troca a ORDEM de empilhamento
        // real (foto continua atrás de qualquer objeto mais perto).
        if (bdCfg.depth === 'back' && imgElLoop && imgElLoop.naturalWidth) {
          this._ensureFotoCamBackdropPlane();
          // [12/09/2026 — RODADA "piscada magenta"] MUDADO — pedido
          // verbatim: "Logo que clica em 'Ver através desta câmera', um
          // retângulo magenta aparece repentinamente e depois desaparece.
          // Faça com que essa 'piscada' não aconteça." `mesh.visible`
          // (o oclusor pintado da cor-marcadora sólida) agora só liga
          // quando `_updateFotoCamBackdropPlane` devolve `true` — ou seja,
          // só quando ela mesma conseguiu montar uma máscara/buraco VÁLIDA
          // pra cobri-lo naquele quadro (ver comentário grande na função,
          // acima). Nos 1-2 primeiros quadros logo após entrar em "Ver
          // através desta câmera" (layout do canvas ainda se ajustando ao
          // tamanho final), quando o retângulo sai degenerado, o oclusor
          // agora fica ESCONDIDO (mesmo estado do "senão" abaixo) em vez
          // de aparecer cru sem buraco nenhum — elimina a piscada.
          const maskValida = this._updateFotoCamBackdropPlane(renderCam);
          // [12/09/2026 — RODADA "certifique-se que só quando a imagem for
          // pintada"] MUDADO — pedido verbatim: "Certifique-se que após
          // clicar em 'Ver através desta câmera', só quando a imagem for
          // pintada é que tudo deve acontecer." `maskValida` sozinho não
          // bastava — cobre só o retângulo estar geometricamente OK, não
          // se a `Image()` da foto atual já decodificou/foi desenhada de
          // verdade no canvas (`_fotoCamBackdropReady`, setado no `onload`
          // dela — ver `_renderFotoCamOverlay`/reset em
          // `_enterFotoCameraView`). Só liga o oclusor quando as DUAS
          // condições valem.
          if (this._fotoCamBackdropMesh) this._fotoCamBackdropMesh.visible = maskValida && !!this._fotoCamBackdropReady;
        } else {
          // [12/09/2026] NOVO — `clearFotoCamBackdropMask()` sempre que o
          // modo 'back' NÃO está ativo (senão a máscara antiga ficaria
          // "vazando" — zerando alfa de pixels com a cor-marcadora em
          // qualquer outra situação que por acaso pinte essa mesma cor,
          // mesmo fora do backdrop 'Trás').
          if (this._fotoCamBackdropMesh) this._fotoCamBackdropMesh.visible = false;
          this._engine.clearFotoCamBackdropMask?.();
          // [12/09/2026] NOVO — ver `setFotoCamBackdropMaskActive`/
          // `_buildGlassPane` (engine3d.js): volta o vidro a pintar
          // normalmente (`colorWrite:true`) fora do 'Trás', mesma lógica
          // do `clearFotoCamBackdropMask()` acima.
          this._engine.setFotoCamBackdropMaskActive?.(false);
        }
      } else {
        // Fora de "Ver através desta câmera" (navegação normal, Modelador
        // entrando por outro caminho, etc.) o plano nunca deveria aparecer.
        if (this._fotoCamBackdropMesh) this._fotoCamBackdropMesh.visible = false;
        this._engine.clearFotoCamBackdropMask?.();
      }
      // [16/09/2026 UTC] NOVO — as duas rodam ANTES do `render()` de
      // verdade logo abaixo, porque cada uma decide algo que o `render()`
      // depende pra desenhar certo neste mesmo quadro: `_trena3DAtualizarOclusao`
      // liga/desliga `.visible` das medidas já finalizadas (config
      // "Visibilidade" → "seVisivel"), e `_trena3DAtualizarDestaqueSuprimido`
      // chama `this._engine.setHoverHighlightSuppressed(...)`, que o
      // `render()` consulta pra pular (ou não) `_updateHoverHighlight`. Ambos
      // os métodos saem cedo (sem custo) quando a ferramenta ativa não é
      // 'trena3d', então é seguro chamar sempre, igual aos outros métodos
      // `_trena3D*` já chamados aqui no loop.
      this._trena3D.beforeRender();
      // [16/09/2026 UTC] NOVO — ver comentário grande em `_trena3DRebuildLines`
      // pra causa raiz completa: na PRIMEIRÍSSIMA vez que "Ver em 3D" é
      // aberto numa aba (Three.js/`Engine3D` ainda terminando de inicializar
      // de forma assíncrona), a 1ª tentativa de desenhar as medidas salvas
      // falha cedo (a `scene` do motor ainda não existe) e marca
      // `_trena3DPendingRebuild`. Tenta de novo AQUI, todo quadro, até
      // conseguir (a própria `_trena3DRebuildLines` desliga a flag sozinha
      // assim que tiver sucesso) — resolve sem precisar sair/entrar de novo
      // no "Ver em 3D".
      this._engine.render(renderCam);
      // [16/09/2026 UTC] NOVO — prévia ao vivo da "📏 Trena 3D" (indicador
      // de onde o clique vai cair + linha guia tracejada + distância ao
      // vivo, ver `_trena3DUpdatePreview`) — mesma cadência dos rótulos já
      // finalizados logo abaixo (só quando este quadro está de fato sendo
      // renderizado). O próprio método sai cedo (e esconde tudo) quando a
      // ferramenta ativa não é 'trena3d', então é seguro chamar sempre.
      // [16/09/2026 UTC] CORRIGIDO — bug relatado: "Só ao segurar o ctrl é
      // que o texto da distância laranja fica aparecendo. Ao soltar o ctrl
      // ou ao clicar (segurando ctrl) [...] o texto [...] desaparece."
      // CAUSA RAIZ ENCONTRADA: esta chamada rodava DEPOIS de
      // `_trena3DUpdateLabels(...)` (linha abaixo) — só que é
      // `_trena3DUpdatePreview()` quem ATUALIZA `dataset.mx/my/mz`/
      // `style.display` de cada rótulo (`_trena3DLiveHeightLabelEl` etc.)
      // pra ESTE quadro; `_trena3DUpdateLabels` só LÊ esses valores pra
      // projetar mundo→tela. Chamando `_trena3DUpdateLabels` ANTES,
      // ele sempre projetava com os valores do quadro ANTERIOR (atraso de
      // 1 quadro) — na prática, qualquer troca rápida de estado (segurar/
      // soltar Ctrl, clicar) podia cair bem no meio dessa defasagem e
      // "perder" um quadro do rótulo aparecendo/sumindo no lugar certo,
      // dando a impressão de que ele não acompanha esses eventos direito.
      // CORRIGIDO: `_trena3DUpdatePreview()` (que decide/atualiza tudo)
      // agora roda ANTES de `_trena3DUpdateLabels()` (que só projeta),
      // sempre no MESMO quadro — a mesma ordem lógica já usada em todo o
      // resto do app (calcular estado primeiro, desenhar depois).
      // [16/09/2026 UTC] BUG CORRIGIDO (2ª vez — a 1ª correção, feita numa
      // rodada anterior desta mesma sessão, não chegou a "pegar" no
      // dispositivo por algum motivo não identificado com certeza — ver
      // comentário grande acima pra causa raiz de verdade: `renderCam` é a
      // POSE crua da câmera (objeto simples `{x,y,z,yaw,pitch,...}`), NUNCA
      // uma `THREE.Camera` de verdade — `Vector3.project(camera)` exige
      // `camera.matrixWorldInverse`/`camera.projectionMatrix`, que só
      // existem numa câmera THREE real. `this._engine.camera3` é a câmera
      // THREE de verdade, já atualizada com a pose deste quadro por
      // `this._engine.render(renderCam)`, logo acima.
      // [18/09/2026 UTC] NOVO (RODADA 141) — modo "formas 2D" da Trena 3D
      // (ver comentário grande em `_trena3DDesenhar2DOverlay`) — MESMO
      // ponto/razão de `_trena3DUpdateLabels` logo acima (precisa de
      // `this._engine.camera3`, a câmera THREE já atualizada por
      // `this._engine.render(renderCam)`). A própria função decide sozinha
      // se há algo a desenhar (sai cedo, sem nenhum custo, no modo 3D).
      this._trena3D.afterRender(this._engine?.camera3);
      Perf.markFrameEnd();
      // [13/09/2026] NOVO — pedido verbatim: "Entre eles [posição X/Y/Z e
      // FPS], coloque a quantidade de objetos que está sendo renderizada
      // naquele frame." Lido AQUI, logo depois de `this._engine.render(...)`
      // ter chamado `renderer.render()` de verdade — `renderer.info.render`
      // (base de `getRenderInfo()`, engine3d.js) é zerado/recalculado pelo
      // three.js a cada `renderer.render()`, então reflete exatamente este
      // quadro que acabou de ser desenhado. Mostra os DOIS números (pedido
      // do usuário, "use seu julgamento... deixar isso claro e útil pro
      // usuário diagnosticar performance"): a contagem "lógica" de objetos
      // do catálogo (igual ao 2D, sempre a mesma não importa quanto está na
      // tela) E os draw calls REAIS mandados pra GPU neste quadro — que é o
      // número que realmente cai quando InstancedMesh agrupa objetos e
      // frustum/distância culling descartam o que está fora de vista (ver
      // `_rebuildInstancedPools`/`_updateDistanceCulling`, engine3d.js).
      const objEl = this._container?.querySelector('#v3d-objcount');
      if (objEl) {
        const ri = this._engine.getRenderInfo?.();
        objEl.textContent = ri ? `Objetos: ${ri.pickables} (${ri.drawCalls} draw calls)` : '';
      }
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
    // [18/09/2026 UTC] NOVO (RODADA 145) — yaw/pitch ao vivo da câmera, em
    // graus, à ESQUERDA da posição x/y/z (ver comentário grande no HTML do
    // HUD acima, perto de #v3d-angle). this._camera.yaw/pitch são radianos
    // (mesma convenção usada em todo o controle de câmera 1ª pessoa deste
    // arquivo, ex. _pointerLockSavedYaw/Pitch).
    const angleEl = this._container?.querySelector('#v3d-angle');
    if (angleEl) {
      const c = this._camera;
      const yawDeg = Math.round((c.yaw || 0) * 180 / Math.PI);
      const pitchDeg = Math.round((c.pitch || 0) * 180 / Math.PI);
      angleEl.textContent = `Yaw ${yawDeg}° · Pitch ${pitchDeg}°`;
    }
    // Pedido do usuário (03/09/2026): "Conforme gira no mundo 3D, a roda gira
    // na tela" — gira visualmente o anel de bússola a cada quadro conforme o
    // yaw atual da câmera. rotate(-yawDeg) mantém cada rótulo apontando pra
    // sua direção real (yaw crescente = girando pra Leste).
    // [12/09/2026] CORRIGIDO — pedido verbatim: "Inverta o norte do
    // personagem no 'Ver em 3D', pois também está 180 graus virado,
    // conforme indicação da roda dos pontos cardeais no canto superior
    // direito da tela." CAUSA RAIZ: o comentário antigo (preservado no
    // histórico) dizia que `yaw=0` era "Norte" — errado. A relação
    // correta (ver comentário grande em `_giroBussola3DParaDirecao`,
    // mesma causa raiz) é `bearing = yaw + 180°` — `yaw=0` na verdade é
    // Sul. Sem o "+180°" que faltava aqui, girar a câmera pra encarar o
    // Norte de verdade deixava o rótulo "S" (não "N") no topo do anel — a
    // inversão de 180° reportada. CORRIGIDO: soma 180° (`Math.PI`) antes
    // de girar o anel.
    const compassInner = this._container?.querySelector('#v3d-compass-ring-inner');
    if (compassInner) {
      const yawDeg = (this._camera.yaw || 0) * 180 / Math.PI;
      compassInner.style.transform = `rotate(${-yawDeg - 180}deg)`;
    }
    this._loopHandle = requestAnimationFrame((tt) => this._loop(tt));
  },

  // Pedido do usuário (03/09/2026): "Ao apertar esc [...] e clicando em cima
  // de uma das direções, então, a câmera do personagem é apontada para
  // aquela direção" — dispara uma transição suave de yaw (ver o consumo em
  // _update, via this._compassTurnTo) em vez de saltar instantaneamente.
  // [12/09/2026] CORRIGIDO — pedido verbatim: "Inverta o norte do
  // personagem no 'Ver em 3D', pois também está 180 graus virado, conforme
  // indicação da roda dos pontos cardeais no canto superior direito da
  // tela." CAUSA RAIZ (mesma dos dois lugares que convertem `bearingRad`
  // ↔ `this._camera.yaw`, ver também a atualização visual do anel em
  // `_loop`): `bearingRad` (vindo de `data-bearing` no HTML do anel, 0 =
  // Norte, sentido horário — mesma convenção de bússola de verdade) e
  // `yaw` (a rotação de CÂMERA de verdade deste app) NÃO são o mesmo
  // número — a relação correta, derivada da mesma fórmula já usada em
  // mount() pra converter o ângulo do personagem 2D (0 = eixo X) em yaw
  // (`yaw = angulo - 90°`) combinada com a relação entre esse ângulo e o
  // rumo/bearing verdadeiro (`bearing = angulo + 90°`, mesma convenção do
  // anel/`Map2DRenderer` — "Norte" = topo da tela = eixo -Y), é
  // `yaw = bearing - 180°`. O código antigo usava `toYaw: bearingRad`
  // direto (como se `yaw = bearing`), uma diferença de exatamente 180° —
  // por isso "Norte" (e todas as outras direções) saíam invertidas.
  // CORRIGIDO: subtrai 180° (`Math.PI`) na conversão.
  _giroBussola3DParaDirecao(bearingRad) {
    this._compassTurnTo = {
      fromYaw: this._camera.yaw || 0,
      toYaw: bearingRad - Math.PI,
      t0: performance.now(),
      duration: 400, // ms
    };
  },

  /** Dispara os eventos de proximidade (`onProximityEnter`/
   *  `onProximityExit` do EVENT_CATALOG) configurados via EventTrigger:
   *  calcula a distância (só X/Z — plano horizontal, ignora altura/piso de
   *  propósito, mesma simplificação de outros raios deste app) até o
   *  jogador (`this._camera.x/z`) e dispara `SceneEventBus.emit` quando a
   *  distância cruza de "fora" pra "dentro" (ou vice-versa) do raio
   *  configurado no evento — nunca a cada quadro parado dentro do raio.
   *  Entidade que sai do raio é removida do Set — reentra e dispara de
   *  novo na próxima aproximação. */
  // [11/09/2026] ATUALIZADO — gatilhos de proximidade passam pelo
  // SceneEventBus/sistema de Componentes (js/components.js), dispara TANTO
  // `onProximityEnter` (borda de subida) QUANTO `onProximityExit` (borda de
  // descida), cada evento com seu próprio `radius` (campo do EVENTO, não
  // mais do objeto).
  // [11/09/2026, mesmo dia — REESCRITO] Removida a menção a migração de
  // campos legados — eliminados nesta rodada (ver js/components.js,
  // topo do arquivo). `Components.ensureComponents` hoje só garante o
  // array `components`.
  _updateScriptProximityTriggers() {
    if (!this._map || !window.SceneEventBus) return;
    // [09/09/2026] Ajuste solicitado pelo usuário: "Todos os objetos devem
    // poder ter scripts (portas, janelas, etc.)." Esta função varria só
    // `this._map.objects` (comentário antigo acima: "só objetos — os
    // únicos com scriptCode/painel de script nesta rodada" — não é mais
    // verdade, ver mapview.js `_scriptFieldsetHtml`, usado agora também
    // por porta/janela/câmera/texto). Generalizado pra varrer TODAS as
    // listas com posição própria: portas/janelas usam
    // `Mapping.resolveDoorWindowPos` (o `x/y` bruto salvo nelas só é válido
    // quando SOLTAS — presas a uma parede, a posição de verdade é
    // recalculada a partir da parede, mesma função usada pra desenhar/
    // clicar nelas, ver engine3d.js/mapview.js). Paredes ficaram DE FORA
    // de propósito (são segmentos, não um ponto — "se aproximar" não tem
    // um significado único pra elas; continuam podendo rodar script só
    // pelo gatilho "ao clicar", ver `_tryPick` acima).
    const px = this._camera.x, pz = this._camera.z;
    if (!this._scriptProximityInside) this._scriptProximityInside = new Set();
    const dentroAgora = this._scriptProximityInside;
    const ctx = { map: this._map, view3d: this };
    // [11/09/2026] NOVO — evento `onStart` (spec seção 3.2, "a cena/objeto
    // termina de carregar"): sem um passo de "carregamento da cena"
    // dedicado neste motor, o disparo é feito aqui, aproveitando que este
    // loop já varre todas as entidades com posição todo quadro — dispara
    // UMA vez por entidade (`this._startedComponentIds`, Set persistente
    // entre quadros) na primeira vez que ela é vista depois de entrar no
    // "Ver em 3D"/trocar de mapa.
    if (!this._startedComponentIds) this._startedComponentIds = new Set();
    const checar = (entidade, x, y) => {
      const comps = window.Components?.ensureComponents?.(entidade) || [];
      if (entidade.id && !this._startedComponentIds.has(entidade.id)) {
        this._startedComponentIds.add(entidade.id);
        const temOnStart = comps.some((c) => c.type === 'EventTrigger' && c.enabled !== false && (c.events || []).some((ev) => ev.event === 'onStart'));
        if (temOnStart) window.SceneEventBus.emit('onStart', entidade, {}, ctx);
      }
      // Coleta todos os eventos onProximityEnter/onProximityExit
      // configurados (legado sintetizado, ou já editados na UI nova) — um
      // mesmo objeto pode ter mais de um EventTrigger/mais de uma entrada,
      // então o raio "ativo" pra decidir dentro/fora é o do evento
      // onProximityEnter mais próximo configurado (mesma simplificação de
      // "um raio por objeto" que já existia; múltiplos raios por objeto
      // seria uma extensão futura, não pedida nesta rodada).
      let raioEnter = null;
      for (const c of comps) {
        if (c.type !== 'EventTrigger' || c.enabled === false) continue;
        for (const ev of (c.events || [])) {
          if (ev.event === 'onProximityEnter') raioEnter = ev.radius || 1.5;
        }
      }
      if (raioEnter == null) { dentroAgora.delete(entidade.id); return; }
      const dist = Math.hypot((x || 0) - px, (y || 0) - pz);
      const jaEstava = dentroAgora.has(entidade.id);
      if (dist <= raioEnter && !jaEstava) {
        dentroAgora.add(entidade.id);
        window.SceneEventBus.emit('onProximityEnter', entidade, { distance: dist }, ctx);
      } else if (dist > raioEnter && jaEstava) {
        dentroAgora.delete(entidade.id);
        window.SceneEventBus.emit('onProximityExit', entidade, { distance: dist }, ctx);
      }
    };
    (this._map.objects || []).forEach((o) => checar(o, o.x, o.y));
    (this._map.cameras || []).forEach((c) => checar(c, c.x, c.y));
    (this._map.textos || []).forEach((t) => checar(t, t.x, t.y));
    if (typeof Mapping !== 'undefined') {
      (this._map.portas || []).forEach((d) => { const p = Mapping.resolveDoorWindowPos(this._map, d); checar(d, p.x, p.y); });
      (this._map.janelas || []).forEach((j) => { const p = Mapping.resolveDoorWindowPos(this._map, j); checar(j, p.x, p.y); });
    }
  },

  /** [11/09/2026] NOVO — ciclo de vida automático de scripts (estilo
   *  Unity: Start()/Update() rodam sozinhas, sem precisar de nenhum
   *  Gatilho de Evento configurado — pedido verbatim desta rodada: "ela
   *  deve ter a estrutura Start(){}, Update(){} [...] Update é chamada
   *  uma vez por quadro"). Fecha o gap documentado no fim da rodada
   *  anterior ("onUpdate sem dispatcher por quadro" — ver claude/status-
   *  component-inspector.md). Varre TODAS as coleções nomeáveis do mapa
   *  (mesmas de `SceneObjects`/`_updateScriptProximityTriggers`, MAIS as
   *  paredes — Update() não depende de proximidade do jogador, então não
   *  há razão pra excluir paredes aqui como `_updateScriptProximityTriggers`
   *  exclui de propósito) a cada quadro, chamando `Components.tickEntity`
   *  — que só faz trabalho de verdade pra entidades que realmente têm
   *  `components` com algum Script ativo (guard barato, ver
   *  `Components.tickEntity`). */
  _updateScriptLifecycle(dt) {
    if (!this._map || !window.Components) return;
    const ctx = { map: this._map, view3d: this };
    const tick = (entidade) => { if (entidade) window.Components.tickEntity(entidade, ctx, dt); };
    (this._map.objects || []).forEach(tick);
    (this._map.cameras || []).forEach(tick);
    (this._map.textos || []).forEach(tick);
    (this._map.portas || []).forEach(tick);
    (this._map.janelas || []).forEach(tick);
    (this._map.walls || []).forEach(tick);
    // [13/09/2026] NOVO — depois de TODOS os Update() acima já terem rodado
    // (podem ter mudado obj.x/obj.y/obj.elevacao/obj.angulo), reflete esses
    // valores nas malhas de verdade — ver comentário grande em
    // `Engine3D._syncScriptedObjectTransforms` (js/engine3d.js) pro porquê
    // disto ser necessário (objetos animados por Script são excluídos do
    // pool de InstancedMesh bem ali, exatamente por causa disto).
    this._engine?._syncScriptedObjectTransforms?.(this._map);
    // [13/09/2026] NOVO — parte "viva" do modelo de câmera "PS1" (gira a
    // cabeça/lente conforme `cam.anguloLente` + pisca o LED vermelho) — ver
    // comentário grande em `Engine3D._updateCamerasLive` (js/engine3d.js).
    // Mesmo lugar/ordem de sempre: depois do Update() dos scripts já ter
    // rodado neste quadro (pode ter mudado `cam.anguloLente`).
    this._engine?._updateCamerasLive?.(dt);
    // [14/09/2026] NOVO — anima a folha de qualquer porta cujo
    // `el.anguloAbertura` esteja sendo controlado por um Script (ver
    // `Engine3D._updateDoorAnimations`/js/components.js) — mesmo lugar de
    // sempre, DEPOIS do Update() dos scripts já ter rodado (pode ter mudado
    // `el.anguloAbertura` neste quadro).
    this._engine?._updateDoorAnimations?.(dt);
    this._engine?._updateRackDoorAnimations?.(dt); // [18/09/2026 UTC] RODADA 164 — portas dos Racks
    this._engine?._updateRedeLeds?.(dt); // [18/09/2026 UTC] RODADA 166 — LEDs dos switches (verde fixo/piscando/apagado)
    try { this._updateRedeInteracao?.(dt); } catch (err) { console.error('[View3D] _updateRedeInteracao falhou:', err); } // RODADA 167 — item carregado, traçado de infra, rótulos
    // [15/09/2026] NOVO — gira os ponteiros de todo relógio da cena
    // conforme a hora ATUAL do mundo (`window.RelogioMundo`) — ver
    // comentário grande em `Engine3D._updateRelogiosParede` (js/engine3d.js).
    // Mesmo lugar/ordem de sempre (depois do Update() dos scripts).
    this._engine?._updateRelogiosParede?.(dt);
  },

  /** [13/09/2026] NOVO — "carro dirigível" (pedido verbatim: "Faça um
   *  carro, que é possível entrar nele e sair andando [...] considerando a
   *  inércia de movimento"). Chamado por `assets/modelos/carro.model.js
   *  onModelClick` quando o jogador clica num objeto `tipo:'carro'` e
   *  NINGUÉM está dirigindo ainda (`ctx.view3d._carroControlado` nulo —
   *  checado no próprio Modelo, ver lá, pra não abrir 2 carros ao mesmo
   *  tempo). Guarda a pose COMPLETA do jogador (x/y/z/yaw/pitch de
   *  `this._camera`) em `_posAntesDoCarro` pra restaurar exatamente ao
   *  sair (`_sairDoCarro`), e liga `_carroControlado = entity` — a partir
   *  daqui, `_update` (guard logo no topo) para de processar WASD/
   *  gravidade do jogador e passa a chamar `_updateCarrosControlados`/
   *  `_updateCarroCamera` todo quadro em vez disso. Garante `entity.
   *  _velocidade` inicializado (0 = carro parado) — não reseta se o carro
   *  já tinha velocidade de uma sessão de condução anterior (ex.: o
   *  usuário saiu e entrou de novo rapidamente; comportamento mais
   *  natural que "zerar" a velocidade toda vez). */
  _entrarNoCarro(entity) {
    if (!entity || this._carroControlado) return; // defensivo — o Modelo já checa antes de chamar, mas nunca custa checar de novo aqui (única porta de entrada real)
    const cam = this._camera;
    this._posAntesDoCarro = { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch };
    this._carroControlado = entity;
    if (entity._velocidade === undefined) entity._velocidade = 0;
    if (entity.angulo === undefined) entity.angulo = 0;
    Utils.toast?.('🚗 Dirigindo — W/S acelera/freia, A/D vira, "E" sai', { duration: 2200 });
  },

  /** [13/09/2026] NOVO — contraparte de `_entrarNoCarro` acima: chamada
   *  pelo handler de teclado ("E", ver `_bindDesktopControls` onKeyDown)
   *  enquanto `_carroControlado` está ativo. Zera `_carroControlado`
   *  (devolvendo o controle normal — WASD/pointer-lock/gravidade — pro
   *  jogador já no PRÓXIMO quadro, ver guard no topo de `_update`),
   *  desliga o som do motor (`AudioFX.tocarSomMotorCarro(false, 0)`, senão
   *  ficaria zumbindo pra sempre depois de sair) e reaparece o jogador A
   *  PÉ ao lado do carro — pedido verbatim: "o jogador reaparece a pé do
   *  lado do carro (offset lateral fixo, ex.: 2m à esquerda da posição
   *  atual do carro)". "Esquerda do carro" calculado a partir do
   *  `entity.angulo` ATUAL (pode ter girado desde que entrou) usando a
   *  MESMA convenção cos/sin de `_updateCarrosControlados` abaixo (ver
   *  comentário grande lá pra a prova/citações do resto do código que
   *  fixam essa convenção): o vetor "direita" do carro em coordenadas de
   *  mundo é `(cos(angulo+90°), sin(angulo+90°))` — "esquerda" é o
   *  oposto, por isso o `-1` no raio abaixo. Mantém `entity._velocidade`
   *  como estava (não zera o carro "abandonado" — ele fica parado ali,
   *  pronto pra ser dirigido de novo mais tarde, com a física retomando
   *  de onde ficou se o jogador voltar rápido, embora na prática ninguém
   *  mais aplique aceleração nele enquanto ninguém dirige, então na
   *  prática ele só continua com a MESMA velocidade guardada até alguém
   *  entrar de novo — sem fricção nem física alguma rodando pra um carro
   *  sem condutor, mesmo documentado como limitação abaixo). */
  _sairDoCarro() {
    const entity = this._carroControlado;
    if (!entity) return;
    this._carroControlado = null;
    window.AudioFX?.tocarSomMotorCarro?.(false, 0);
    const OFFSET_LATERAL = 2; // metros — pedido verbatim ("ex.: 2m à esquerda")
    const angulo = entity.angulo || 0;
    // "Direita" do carro em coordenadas de mundo, MESMA convenção
    // cos/sin usada pra mover o carro (ver `_updateCarrosControlados`):
    // ângulo+90° gira o vetor "frente" (cos,sin) 90° pro lado direito.
    const dirX = Math.cos(angulo + Math.PI / 2), dirZ = Math.sin(angulo + Math.PI / 2);
    const px = entity.x - dirX * OFFSET_LATERAL; // "- direita" = esquerda
    const pz = entity.y - dirZ * OFFSET_LATERAL;
    // Altura dos pés: usa a superfície real sob o ponto de saída (mesma
    // função já usada pela física normal do jogador, `_surfaceHeightAt`)
    // em vez de copiar a altura salva antes de entrar (que pode ter sido
    // em cima de um degrau/objeto diferente de onde o carro está agora,
    // já que o carro pode ter se movido bastante).
    const surfaceY = this._surfaceHeightAt(px, pz, 0);
    const cam = this._camera;
    cam.x = px; cam.z = pz; cam.y = surfaceY + this.EYE_HEIGHT;
    // Olhando na mesma direção que o carro está apontando (mais natural
    // que restaurar o yaw de ANTES de entrar, que pode estar olhando pra
    // "trás" do carro depois dele ter girado bastante dirigindo).
    cam.yaw = angulo;
    cam.pitch = this._posAntesDoCarro ? this._posAntesDoCarro.pitch : 0;
    this._posAntesDoCarro = null;
    this._grounded = true;
    this._vel.y = 0;
    Utils.toast?.('🚶 Fora do carro', { duration: 1400 });
  },

  /** [13/09/2026] NOVO — física de INÉRCIA do carro sendo dirigido, mesmo
   *  padrão de "chamado todo quadro por `_update`" dos outros sistemas
   *  deste arquivo (WASD normal, autopilot etc.) — só que só roda enquanto
   *  `this._carroControlado` está setado (ver guard em `_update`, logo
   *  acima na função). Lê `this._keys` (o MESMO objeto já preenchido pelo
   *  handler de teclado de sempre, `onKeyDown`/`onKeyUp` em
   *  `_bindDesktopControls`) reaproveitando W/S/A/D e as setas — as MESMAS
   *  teclas do andar a pé, "MAS só quando _carroControlado estiver ativo"
   *  (pedido verbatim) — o que já é garantido aqui, já que este método só
   *  é chamado dentro do `if (this._carroControlado)` de `_update`.
   *
   *  FÓRMULAS EXATAS (documentadas aqui pra não precisar caçar no código):
   *
   *  1) Acelerar (W/ArrowUp): `entity._velocidade = Math.min(entity.
   *     _velocidade + ACELERACAO*dt, VELOCIDADE_MAXIMA)` — ACELERACAO=4
   *     m/s², VELOCIDADE_MAXIMA=20 m/s (72 km/h).
   *
   *  2) Frear/ré (S/ArrowDown): decai/inverte MAIS RÁPIDO que a fricção
   *     natural (item 3) — `entity._velocidade = Math.max(entity.
   *     _velocidade - FREADA*dt, -VELOCIDADE_MAXIMA_RE)` — FREADA=8 m/s²
   *     (2x a aceleração — "decai mais rápido"), VELOCIDADE_MAXIMA_RE=8
   *     m/s (marcha-ré mais lenta que a frente, "velocidade máxima
   *     menor", pedido verbatim).
   *
   *  3) Nenhuma das duas pressionada (soltou o acelerador — CERNE do
   *     pedido: "ao tirar o pé do acelerador, o carro não para do nada"):
   *     fricção por decaimento EXPONENCIAL suave, não linear —
   *     `entity._velocidade *= Math.pow(FRICCAO, dt)` — FRICCAO=0.4 (uma
   *     base <1 elevada a `dt` decai suave e continuamente, mais devagar
   *     em quadros mais curtos, sem "degrau" perceptível entre quadros de
   *     durações diferentes — mesma técnica de decaimento exponencial já
   *     usada alhures no projeto pra suavizações por quadro). Zera de vez
   *     (`entity._velocidade = 0`) quando `Math.abs(velocidade) < 0.05`
   *     pra não deixar um resíduo infinitesimal pra sempre (decaimento
   *     exponencial nunca chega EXATAMENTE a zero sozinho).
   *
   *  4) Virar (A/D/ArrowLeft/ArrowRight): SÓ gira `entity.angulo` PROPORCIONAL
   *     à velocidade atual — carro parado (`velocidade≈0`) NÃO gira no
   *     lugar (pedido verbatim) — fórmula exata:
   *       fatorVelocidade = Math.max(PISO_VIRA, Math.abs(velocidade) / VELOCIDADE_MAXIMA)
   *       entity.angulo += VELOCIDADE_ANGULAR * dt * Math.sign(velocidade) * fatorVelocidade * (sinalDaTecla)
   *     PISO_VIRA=0.15 (piso mínimo citado no pedido — "com um piso mínimo
   *     pra não ficar impossível virar devagar" — sem ele, a quase-zero
   *     velocidade a curva ficaria imperceptivelmente lenta) só entra em
   *     jogo quando `Math.abs(velocidade)>=0.05` (senão o carro "parado"
   *     giraria sozinho por causa só do piso, contradizendo o próprio
   *     pedido de não girar parado) — VELOCIDADE_ANGULAR=1.6 rad/s (~92°/s
   *     na curva mais fechada possível). `Math.sign(velocidade)` inverte o
   *     sentido da curva na marcha-ré (virar "pra esquerda" indo de ré
   *     esterça o carro pro lado oposto do que indo pra frente, igual um
   *     carro de verdade fazendo baliza).
   *
   *  5) Posição (`entity.x`/`entity.y`, coordenadas do MAPA — não
   *     confundir `entity.y` do mapa com a ALTURA 3D, que pra objetos do
   *     chão é sempre 0/baseY): `entity.x += Math.cos(entity.angulo) *
   *     velocidade * dt; entity.y += Math.sin(entity.angulo) * velocidade
   *     * dt;` — CONVENÇÃO CONFIRMADA lendo o resto do projeto ANTES de
   *     escrever isto (pedido explícito: "CONFIRME a convenção certa"):
   *     `objAnguloToRotY(angulo) = -angulo` (engine3d-profiles.js) já
   *     documenta que `obj.angulo` é o ângulo do PLANO 2D do mapa (não o
   *     `yaw` de câmera do Three.js, outra convenção) — e todo lugar do
   *     projeto que já converte esse MESMO ângulo pra um deslocamento X/Y
   *     de mundo usa exatamente `cos()` pro eixo X e `sin()` pro eixo Y
   *     (ver js/view3d.js, os cálculos de "ponto ao longo da mira travada"
   *     em ~2 lugares: `px = piv.x + Math.cos(angulo)*dist`, `pz = piv.z +
   *     Math.sin(angulo)*dist` — `pz` ali é o MESMO eixo que `entity.y` do
   *     mapa, ver mapeamento `_camera.z = obj.y` documentado no topo deste
   *     arquivo/`_camera` — mesma base usada por `mapping.js`/`mapview.js`
   *     em outra dúzia de lugares para rotacionar bounding boxes). Usar
   *     sin/cos TROCADOS (a convenção de yaw de câmera do Three.js,
   *     diferente desta) inverteria os eixos e faria o carro andar de
   *     lado em vez de na direção que aponta — por isso a checagem extra
   *     aqui antes de escrever.
   *
   *  LIMITAÇÕES HONESTAS (pedido explícito pra documentar, NÃO tentar
   *  resolver nesta rodada — risco alto sem poder testar ao vivo):
   *    - SEM colisão do carro contra paredes/outros objetos — ele
   *      atravessa tudo livremente. Colisão veicular de verdade (contra a
   *      malha das paredes, como `_resolveCollision` já faz pro jogador a
   *      pé) é uma pendência de física mais avançada, propositalmente
   *      fora de escopo desta rodada.
   *    - SEM suspensão nem inclinação visual em curva (o corpo do carro
   *      não se inclina/balança) — puramente um retângulo rígido girando
   *      no plano.
   *    - Câmera de terceira pessoa (`_updateCarroCamera`) É SIMPLIFICADA:
   *      recalculada do zero a cada quadro a partir de `entity.x/y/
   *      angulo`, sem NENHUMA colisão contra paredes atrás do carro (pode
   *      atravessar uma parede pra manter a distância fixa atrás do
   *      carro, ao contrário da câmera em 1ª pessoa normal, que usa
   *      `_resolveCollision`). */
  _updateCarrosControlados(dt) {
    const entity = this._carroControlado;
    if (!entity) return;
    const ACELERACAO = 4;         // m/s²
    const VELOCIDADE_MAXIMA = 20; // m/s (~72 km/h)
    const FREADA = 8;             // m/s² — 2x a aceleração, "decai mais rápido" (pedido verbatim)
    const VELOCIDADE_MAXIMA_RE = 8; // m/s — marcha-ré mais lenta (pedido verbatim: "velocidade máxima menor")
    const FRICCAO = 0.4;          // base do decaimento exponencial (Math.pow(FRICCAO, dt)) ao soltar o acelerador
    const VELOCIDADE_ANGULAR = 1.6; // rad/s na curva mais fechada (velocidade == VELOCIDADE_MAXIMA)
    const PISO_VIRA = 0.15;       // fração mínima de VELOCIDADE_ANGULAR aplicada mesmo em baixa velocidade (pedido verbatim: "piso mínimo pra não ficar impossível virar devagar")

    const acelerar = this._keys.KeyW || this._keys.ArrowUp;
    const frear = this._keys.KeyS || this._keys.ArrowDown;
    let v = entity._velocidade || 0;
    if (acelerar && !frear) {
      v = Math.min(v + ACELERACAO * dt, VELOCIDADE_MAXIMA);
    } else if (frear && !acelerar) {
      v = Math.max(v - FREADA * dt, -VELOCIDADE_MAXIMA_RE);
    } else {
      // Nenhuma das duas (ou as duas juntas, empate proposital tratado
      // como "soltou tudo") — fricção suave, CERNE do pedido ("ao tirar o
      // pé do acelerador, o carro não para do nada").
      v *= Math.pow(FRICCAO, dt);
      if (Math.abs(v) < 0.05) v = 0;
    }
    entity._velocidade = v;

    // Virar — só se o carro já tem alguma velocidade (pedido verbatim:
    // "carro parado NÃO gira no lugar"); ver comentário grande acima do
    // método pra fórmula completa/citações.
    const virarEsquerda = this._keys.KeyA || this._keys.ArrowLeft;
    const virarDireita = this._keys.KeyD || this._keys.ArrowRight;
    if (Math.abs(v) >= 0.05 && (virarEsquerda !== virarDireita)) {
      const fatorVelocidade = Math.max(PISO_VIRA, Math.abs(v) / VELOCIDADE_MAXIMA);
      const sinalTecla = virarEsquerda ? -1 : 1;
      entity.angulo = (entity.angulo || 0) + VELOCIDADE_ANGULAR * dt * Math.sign(v) * fatorVelocidade * sinalTecla;
    }

    // Posição — ver comentário grande acima do método pra a prova da
    // convenção cos(X)/sin(Y) usada aqui.
    const angulo = entity.angulo || 0;
    entity.x = (entity.x || 0) + Math.cos(angulo) * v * dt;
    entity.y = (entity.y || 0) + Math.sin(angulo) * v * dt;

    // Som do motor (AudioFX.tocarSomMotorCarro, js/audio.js) — só "ligado"
    // (oscilador de verdade tocando) quando `velocidade>0.1` (pedido
    // verbatim: "enquanto _carroControlado ativo e velocidade>0.1") —
    // abaixo disso, motor "desligado" (silêncio), mesmo o carro ainda
    // tendo um resíduo de velocidade sub-limiar decaindo.
    window.AudioFX?.tocarSomMotorCarro?.(Math.abs(v) > 0.1, v);
  },

  /** [13/09/2026] NOVO — câmera de TERCEIRA PESSOA simplificada enquanto
   *  `_carroControlado` está ativo — pedido verbatim: "a forma MAIS
   *  SIMPLES e segura: câmera em terceira pessoa simples, posicionada
   *  atrás e um pouco acima do carro, olhando na direção dele —
   *  recalculada a cada frame a partir de entity.x/entity.y/entity.angulo,
   *  sem precisar reescrever o sistema de pointer-lock/FPS existente, só
   *  'congelando' o controle normal do jogador enquanto _carroControlado
   *  estiver setado". Reaproveita a MESMA `this._camera` (x/y/z/yaw/pitch)
   *  que o pointer-lock/renderer de sempre já leem pra desenhar o quadro —
   *  não precisa de nenhuma THREE.Camera nem lógica de render separada,
   *  só reposiciona os mesmos 5 números todo quadro (mesmo truque já usado
   *  por `_orbCamMode`/`_camMode`/`_fotoCamMode` acima, que também
   *  "sequestram" `this._camera` temporariamente). SEM colisão de câmera
   *  contra paredes atrás do carro — ver LIMITAÇÕES no comentário grande
   *  de `_updateCarrosControlados`. */
  _updateCarroCamera() {
    const entity = this._carroControlado;
    if (!entity) return;
    const DIST_ATRAS = 6.5;  // metros atrás do carro
    const ALTURA_ACIMA = 2.4; // metros acima do "chão" do carro
    const ALTURA_MIRA = 1.1; // olha um pouco acima do centro do carro (não direto no chão)
    const angulo = entity.angulo || 0;
    // "Atrás" do carro em coordenadas de mundo: o oposto do vetor
    // "frente" (cos,sin) usado pra mover o carro em
    // `_updateCarrosControlados` — mesma convenção, só invertida (-1).
    const dirX = Math.cos(angulo), dirZ = Math.sin(angulo);
    const baseY = (entity.piso || 0) * (this._map?.alturaPiso || 2.8) + (entity.elevacao || 0);
    const cam = this._camera;
    cam.x = entity.x - dirX * DIST_ATRAS;
    cam.z = entity.y - dirZ * DIST_ATRAS;
    cam.y = baseY + ALTURA_ACIMA;
    // Yaw da câmera de VISÃO (`Cam3DMath.cameraForwardFlat`, convenção
    // DIFERENTE de `entity.angulo` do mapa) — derivado batendo as duas
    // fórmulas: `cameraForwardFlat(yaw) = (-sin(yaw), cos(yaw))` (engine3d.js
    // rotY) precisa ser igual ao vetor de movimento do carro usado em
    // `_updateCarrosControlados`, `(cos(angulo), sin(angulo))` — resolvendo
    // `-sin(yaw)=cos(angulo)` e `cos(yaw)=sin(angulo)` simultaneamente dá
    // `yaw = angulo - 90°`. Sem essa conta batendo, a câmera olharia 90°
    // torta em relação pra onde o carro realmente anda.
    cam.yaw = angulo - Math.PI / 2;
    // Pitch fixo, levemente pra baixo (olhando o carro de cima/atrás, não
    // reto no horizonte) — calculado geometricamente a partir da diferença
    // de altura/distância entre a câmera e o ponto mirado (o carro), não
    // um valor "chutado", pra continuar coerente se `DIST_ATRAS`/
    // `ALTURA_ACIMA` mudarem no futuro.
    // `cameraForward`/`rotX` (engine3d.js Cam3DMath) definem `pitch`
    // POSITIVO como "olhando pra BAIXO" (d.y = -sin(pitch)) — a câmera
    // fica ACIMA do ponto mirado aqui, por isso `cam.y - alvo` (positivo)
    // no numerador, não o contrário (senão a câmera olharia pro CÉU em
    // vez do carro).
    const alvoY = baseY + ALTURA_MIRA;
    cam.pitch = Math.atan2(cam.y - alvoY, DIST_ATRAS);
  },

  /** NOVO (07/09/2026), pedido verbatim: "blocos de construção". Acha o
   *  ponto onde a mira (centro da tela) bate numa superfície (chão, topo de
   *  um objeto, ou o topo de um tijolo já colocado — ver engine3d.js
   *  raycastSurface, estendido pra incluir 'tijolo') e devolve `{x,y,z}`
   *  do CENTRO onde o próximo tijolo iria (já com snap XZ aplicado e
   *  pousado exatamente EM CIMA da superfície atingida em Y) — ou `null` se
   *  a mira não bate em nada. Não coloca nada sozinho — só calcula. */
  async _tijoloAimTarget(cfgPreCarregada) {
    const eng = this._engine;
    if (!eng?._ready) return null;
    // `cfgPreCarregada` (opcional) evita reler a config do banco A CADA
    // QUADRO durante uma sessão de arrasto (ver `_updateTijoloDrag`, que
    // busca a config UMA VEZ ao iniciar a sessão e reaproveita) — o clique
    // único (`_placeTijoloClick`) sempre busca fresca (baixa frequência,
    // sem custo).
    const cfg = cfgPreCarregada || await Tijolos.getConfig();
    const ray = eng.centerRay(this._camera);
    const hit = eng.raycastSurface(ray.origin, ray.dir);
    if (!hit) return null;
    const xz = Tijolos.snapXZ(hit.x, hit.z, cfg);
    return { x: xz.x, y: hit.y + cfg.sy / 2, z: xz.z, cfg };
  },

  /** Coloca DE VERDADE um tijolo em `alvo` (devolvido por `_tijoloAimTarget`)
   *  — usado tanto pelo clique único (`_placeTijoloClick`) quanto pela
   *  colocação contínua (`_updateTijoloDrag`). Ignora silenciosamente um
   *  pedido de colocar exatamente na MESMA célula do último tijolo desta
   *  "sessão" (pedido verbatim: "para não sair jorrando tijolos como uma
   *  mangueira de água"). */
  _tijoloPlaceAt(alvo) {
    const cfg = alvo.cfg;
    const chave = Tijolos._key(alvo.x, alvo.y, alvo.z);
    if (chave === this._tijoloLastPlacedKey) return null;
    const base = {
      x: alvo.x, y: alvo.y, z: alvo.z,
      sx: cfg.sx, sy: cfg.sy, sz: cfg.sz,
      cor: cfg.corPadrao,
      corFaces: cfg.corPorFace ? cfg.corFaces : null,
      texturaUrl: cfg.texturaUrl,
      formato: cfg.formato,   // NOVO (07/09/2026) — "caixa" ou "cunha"
      rotY: cfg.rotY,          // NOVO (07/09/2026) — 0/90/180/270 (só visível na cunha)
    };
    const t = Tijolos.add(this._map, base);
    const criados = [t];
    // NOVO (07/09/2026) — "novas ideias" pedidas ("modo espelho/
    // simetria"): com o espelho ligado (`cfg.espelhoAtivo`), CADA
    // colocação também cria uma cópia espelhada num plano perpendicular
    // ao eixo escolhido (`cfg.espelhoEixo`), na posição configurada
    // (`cfg.espelhoPos`) — reflete x (eixo 'x') ou z (eixo 'z') em torno
    // desse plano; y nunca muda (espelho sempre "de pé"). Não duplica se
    // a posição espelhada cair EXATAMENTE em cima da original (tijolo
    // colocado bem em cima do próprio plano de espelho). DECISÃO DE
    // ESCOPO: a cópia espelhada de uma 'cunha' mantém o MESMO `rotY` da
    // original — um espelho geometricamente exato inverteria a
    // "quiralidade" da rampa (não representável só com rotações de 90°
    // no modelo atual) — aproximação visual aceitável pra a maioria dos
    // casos (ex.: paredes/pilares simétricos em caixa), registrado como
    // refinamento futuro se o usuário notar diferença com cunhas.
    if (cfg.espelhoAtivo) {
      const espX = cfg.espelhoEixo === 'x' ? (2 * cfg.espelhoPos - alvo.x) : alvo.x;
      const espZ = cfg.espelhoEixo === 'z' ? (2 * cfg.espelhoPos - alvo.z) : alvo.z;
      if (Math.abs(espX - alvo.x) > 1e-6 || Math.abs(espZ - alvo.z) > 1e-6) {
        criados.push(Tijolos.add(this._map, { ...base, x: espX, y: alvo.y, z: espZ }));
      }
    }
    this._tijoloLastPlacedKey = chave;
    // NOVO (07/09/2026) — "novas ideias" pedidas ("desfazer/refazer
    // dedicado"): cada colocação (1 tijolo, ou 1 tijolo + sua cópia
    // espelhada) vira 1 entrada no histórico PRÓPRIO de tijolos (não usa o
    // Historico geral do app, ver `_tijoloUndo`/`_tijoloRedo`) — guarda
    // o(s) REGISTRO(S) INTEIRO(S) (não só o id), pra o redo conseguir
    // devolver o MESMO objeto (cor/faces/textura/formato) sem precisar
    // recriar do zero. Qualquer colocação NOVA limpa a pilha de refazer.
    this._tijoloUndoStack = this._tijoloUndoStack || [];
    this._tijoloRedoStack = [];
    this._tijoloUndoStack.push({ tijolos: criados });
    this._engine.rebuildTijolos?.(this._map);
    DB.saveMap(this._map);
    return t;
  },

  /** Clique único (sem soltar o botão entre mousedown/mouseup) — SEMPRE 1
   *  tijolo, com ou sem Ctrl (pedido verbatim: "apenas 1 por clique").
   *  Se Ctrl JÁ estava pressionado neste clique, também abre a "sessão de
   *  arrasto" (ver `_updateTijoloDrag`) travada no MESMO nível de altura
   *  deste 1º tijolo — dali em diante, `_updateTijoloDrag` (chamado a cada
   *  quadro em `_update`) continua colocando enquanto Ctrl+botão esquerdo
   *  seguirem pressionados e a mira for variando de alvo. */
  async _placeTijoloClick() {
    this._tijoloLastPlacedKey = null; // clique novo = nunca é "a mesma célula" do que veio antes
    const alvo = await this._tijoloAimTarget();
    if (!alvo) return;
    const t = this._tijoloPlaceAt(alvo);
    const ctrlPressionado = this._keys.ControlLeft || this._keys.ControlRight;
    if (t && ctrlPressionado) {
      this._tijoloDragActive = true;
      this._tijoloDragLevel = alvo.y;
      // NOVO (07/09/2026): guarda a config JÁ CARREGADA deste 1º tijolo pra
      // `_updateTijoloDrag` reaproveitar em TODOS os quadros seguintes da
      // mesma sessão de arrasto, em vez de reler `Tijolos.getConfig()` (uma
      // ida ao banco) a cada quadro — ver comentário em `_tijoloAimTarget`.
      this._tijoloDragCfg = alvo.cfg;
    } else {
      this._tijoloDragActive = false;
      this._tijoloDragCfg = null;
    }
  },

  /** Chamado a cada quadro (ver `_update`) — só faz algo enquanto uma
   *  "sessão de arrasto" estiver ativa (iniciada por `_placeTijoloClick`
   *  com Ctrl pressionado) E o botão esquerdo do mouse continuar
   *  fisicamente pressionado (`this._tijoloMouseDown`, ver mousedown/
   *  mouseup em `_bindDesktopControls`) E Ctrl continuar pressionado.
   *  Solta qualquer uma dessas 3 condições e a sessão encerra sozinha —
   *  soltar só o Ctrl (mantendo o botão) NÃO recomeça a colocar (evita
   *  "vazamento" de tijolos se o usuário soltar e apertar Ctrl de novo sem
   *  soltar o botão — precisa de um clique NOVO pra abrir outra sessão). */
  async _updateTijoloDrag() {
    if (this._buildTool !== 'tijolo' || !this._tijoloDragActive) return;
    if (!this._tijoloMouseDown || !(this._keys.ControlLeft || this._keys.ControlRight)) {
      this._tijoloDragActive = false;
      return;
    }
    // NOVO (07/09/2026): trava anti-sobreposição — `_update(delta)` chama
    // este método a cada quadro SEM aguardar (`await`) o anterior terminar;
    // como ele é `async` (por causa do `await` dentro), duas chamadas de
    // quadros diferentes poderiam ficar "em voo" ao mesmo tempo se algo
    // atrasar. `this._tijoloDragBusy` garante só 1 por vez.
    if (this._tijoloDragBusy) return;
    this._tijoloDragBusy = true;
    try {
      // Reaproveita a config já carregada no início da sessão (ver
      // `_placeTijoloClick`) em vez de reler do banco a cada quadro.
      const alvo = await this._tijoloAimTarget(this._tijoloDragCfg);
      if (!alvo) return;
      // Só continua no MESMO nível de altura travado pelo 1º tijolo desta
      // sessão (pedido verbatim: "vai adicionando um após o outro no mesmo
      // nível de altura").
      if (Math.abs(alvo.y - this._tijoloDragLevel) > 0.005) return;
      this._tijoloPlaceAt(alvo);
    } finally {
      this._tijoloDragBusy = false;
    }
  },

  /** NOVO (07/09/2026) — "novas ideias" pedidas ("desfazer/refazer
   *  dedicado"). Desfaz a ÚLTIMA acao de colocação de tijolo (1 clique = 1
   *  tijolo = 1 entrada; 1 preenchimento de volume = TODOS os tijolos
   *  daquele preenchimento numa entrada só, ver `_fillTijoloVolume`) —
   *  histórico PRÓPRIO da ferramenta de tijolos, independente do Historico
   *  geral do app (decisão de escopo: o Historico geral guarda diffs de
   *  propriedades de item/objeto isolado, não foi desenhado pra sequências
   *  de dezenas/centenas de colocações de 1 preenchimento de volume). Pintar
   *  um tijolo (`_paintTijoloClick`) NÃO entra nesta pilha — decisão de
   *  escopo: pintura é um ajuste estético iterativo, o próprio usuário pinta
   *  de volta se quiser desfazer; desfazer/refazer aqui cobre a parte mais
   *  "destrutiva/trabalhosa" (colocação, principalmente em volume). */
  _tijoloUndo() {
    const entry = (this._tijoloUndoStack || []).pop();
    if (!entry) { Utils.toast('Nada para desfazer', { type: 'warn' }); return; }
    entry.tijolos.forEach((t) => Tijolos.remove(this._map, t.id));
    this._tijoloRedoStack = this._tijoloRedoStack || [];
    this._tijoloRedoStack.push(entry);
    this._engine.rebuildTijolos?.(this._map);
    DB.saveMap(this._map);
    this._renderTijoloPanel();
  },
  _tijoloRedo() {
    const entry = (this._tijoloRedoStack || []).pop();
    if (!entry) { Utils.toast('Nada para refazer', { type: 'warn' }); return; }
    if (!this._map.tijolos) this._map.tijolos = [];
    entry.tijolos.forEach((t) => this._map.tijolos.push(t)); // MESMO objeto de volta (preserva cor/faces/textura)
    this._tijoloUndoStack = this._tijoloUndoStack || [];
    this._tijoloUndoStack.push(entry);
    this._engine.rebuildTijolos?.(this._map);
    DB.saveMap(this._map);
    this._renderTijoloPanel();
  },

  /** NOVO (07/09/2026) — "novas ideias" pedidas ("pintar tijolos já
   *  colocados"). Ferramenta separada (`this._buildTool === 'tijolo-pintar'`,
   *  ativada pelo botão próprio no painel — NUNCA junto com a ferramenta de
   *  colocar, pra não confundir "clique = coloca" com "clique = pinta").
   *  Mira (mesmo raio central da colocação) contra a lista CRUA de tijolos
   *  (`Tijolos.raycastTijolos` — a malha mesclada não separa triângulo por
   *  tijolo, então testar direto contra as caixas é mais simples e
   *  suficiente aqui) e aplica a cor/textura ATUAL do menu (mesmos campos
   *  usados pra colocar um tijolo novo) no tijolo atingido. */
  async _paintTijoloClick() {
    const eng = this._engine;
    if (!eng?._ready) return;
    if (!this._map.tijolos || !this._map.tijolos.length) {
      Utils.toast('Nenhum tijolo no mapa ainda', { type: 'warn' });
      return;
    }
    const cfg = await Tijolos.getConfig();
    const ray = eng.centerRay(this._camera);
    const hit = Tijolos.raycastTijolos(ray.origin, ray.dir, this._map.tijolos);
    if (!hit) { Utils.toast('Nenhum tijolo mirado', { type: 'warn' }); return; }
    hit.tijolo.cor = cfg.corPadrao;
    hit.tijolo.corFaces = cfg.corPorFace ? cfg.corFaces : null;
    hit.tijolo.texturaUrl = cfg.texturaUrl;
    this._engine.rebuildTijolos?.(this._map);
    DB.saveMap(this._map);
    Utils.toast(`🎨 "${hit.tijolo.nome}" pintado`, { type: 'ok' });
  },

  /** NOVO (07/09/2026) — "novas ideias" pedidas ("ferramenta 'preencher
   *  volume'"). Preenche um bloco RETANGULAR de tijolos (contagens em
   *  X/Y/Z configuradas no painel, `this._tijoloFillX/Y/Z`) a partir do
   *  ponto mirado (MESMA superfície/snap usado pra colocar 1 tijolo, ver
   *  `_tijoloAimTarget`) — decisão de escopo (simplificação deliberada,
   *  registrada): em vez de um gizmo 3D de 2 cliques definindo os 2 cantos
   *  opostos de um volume qualquer no espaço (mais complexo/arriscado de
   *  acertar sem poder testar num navegador de verdade nesta sessão), o
   *  volume cresce em X (+, na direção "direita" da grade)/Y (+, pra cima)/
   *  Z (+, na direção "frente" da grade) a partir do ponto mirado — ainda
   *  cobre o caso de uso central do pedido ("preencher volume" de uma vez,
   *  em vez de tijolo por tijolo), só que com uma UI mais simples/segura.
   *  Todos os tijolos criados nesta chamada viram 1 ÚNICA entrada no
   *  histórico de desfazer (ver `_tijoloUndo`) — desfazer um preenchimento
   *  de 200 tijolos remove os 200 de uma vez, não um por um. */
  async _fillTijoloVolume() {
    const cfg = await Tijolos.getConfig();
    const alvo = await this._tijoloAimTarget(cfg);
    if (!alvo) { Utils.toast('Mire numa superfície para preencher', { type: 'warn' }); return; }
    const nx = Utils.clamp(parseInt(this._tijoloFillX, 10) || 1, 1, 50);
    const ny = Utils.clamp(parseInt(this._tijoloFillY, 10) || 1, 1, 50);
    const nz = Utils.clamp(parseInt(this._tijoloFillZ, 10) || 1, 1, 50);
    const ocupados = new Set((this._map.tijolos || []).map((t) => Tijolos._key(t.x - t.sx / 2, t.y - t.sy / 2, t.z - t.sz / 2)));
    const criados = [];
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          const x = alvo.x + ix * cfg.sx;
          const y = alvo.y + iy * cfg.sy;
          const z = alvo.z + iz * cfg.sz;
          const chave = Tijolos._key(x - cfg.sx / 2, y - cfg.sy / 2, z - cfg.sz / 2);
          if (ocupados.has(chave)) continue; // já tem tijolo exatamente ali — não duplica
          ocupados.add(chave);
          const t = Tijolos.add(this._map, {
            x, y, z, sx: cfg.sx, sy: cfg.sy, sz: cfg.sz,
            cor: cfg.corPadrao, corFaces: cfg.corPorFace ? cfg.corFaces : null, texturaUrl: cfg.texturaUrl,
            formato: cfg.formato, rotY: cfg.rotY,
          });
          criados.push(t);
        }
      }
    }
    if (!criados.length) { Utils.toast('Nada novo pra preencher ali (já ocupado)', { type: 'warn' }); return; }
    this._tijoloUndoStack = this._tijoloUndoStack || [];
    this._tijoloRedoStack = [];
    this._tijoloUndoStack.push({ tijolos: criados });
    this._engine.rebuildTijolos?.(this._map);
    DB.saveMap(this._map);
    Utils.toast(`${criados.length} tijolo(s) adicionados ✓`, { type: 'ok' });
    this._renderTijoloPanel();
  },

  /** NOVO (07/09/2026) — "novas ideias" pedidas ("carimbos/receitas de
   *  conjuntos reutilizáveis"). Salva TODOS os tijolos do mapa atual como
   *  um carimbo nomeado (`#tj-carimbo-nome`), com posições relativas ao
   *  ponto mirado AGORA (mesma mira/superfície da colocação normal) —
   *  reaplica esse mesmo conjunto em qualquer lugar depois, mantendo as
   *  posições relativas entre os tijolos. DECISÃO DE ESCOPO: salva TODOS
   *  os tijolos do mapa, não um subconjunto "selecionado" — o app não tem
   *  seleção múltipla de tijolos nesta rodada (só picking de 1 por vez, ver
   *  `_paintTijoloClick`); pra carimbar só uma parte, o jeito é remover os
   *  tijolos indesejados antes ou construir a peça isolada num canto vazio
   *  do mapa antes de carimbar. */
  async _salvarCarimboTijolos() {
    const panel = this._container?.querySelector('#v3d-tijolo-panel');
    const nome = panel?.querySelector('#tj-carimbo-nome')?.value?.trim();
    if (!nome) { Utils.toast('Digite um nome pro carimbo', { type: 'warn' }); return; }
    if (!this._map.tijolos || !this._map.tijolos.length) { Utils.toast('Nenhum tijolo no mapa pra carimbar', { type: 'warn' }); return; }
    const alvo = await this._tijoloAimTarget();
    const origem = alvo ? { x: alvo.x, y: alvo.y, z: alvo.z } : { x: 0, y: 0, z: 0 };
    await Tijolos.saveStamp(nome, this._map.tijolos, origem);
    Utils.toast(`💾 Carimbo "${nome}" salvo (${this._map.tijolos.length} tijolos)`, { type: 'ok' });
    this._renderTijoloPanel();
  },
  /** Aplica o carimbo escolhido no seletor, ancorado no ponto mirado agora
   *  — todos os tijolos criados viram 1 ÚNICA entrada no histórico de
   *  desfazer (mesmo padrão de `_fillTijoloVolume`). */
  async _aplicarCarimboTijolos() {
    const panel = this._container?.querySelector('#v3d-tijolo-panel');
    const nome = panel?.querySelector('#tj-carimbo-select')?.value;
    if (!nome) return;
    const alvo = await this._tijoloAimTarget();
    if (!alvo) { Utils.toast('Mire numa superfície para aplicar o carimbo', { type: 'warn' }); return; }
    const criados = await Tijolos.applyStamp(this._map, nome, { x: alvo.x, y: alvo.y, z: alvo.z });
    if (!criados.length) { Utils.toast('Carimbo vazio ou não encontrado', { type: 'warn' }); return; }
    this._tijoloUndoStack = this._tijoloUndoStack || [];
    this._tijoloRedoStack = [];
    this._tijoloUndoStack.push({ tijolos: criados });
    this._engine.rebuildTijolos?.(this._map);
    DB.saveMap(this._map);
    Utils.toast(`📌 Carimbo "${nome}" aplicado (${criados.length} tijolos)`, { type: 'ok' });
    this._renderTijoloPanel();
  },
  async _excluirCarimboTijolos() {
    const panel = this._container?.querySelector('#v3d-tijolo-panel');
    const nome = panel?.querySelector('#tj-carimbo-select')?.value;
    if (!nome) return;
    await Tijolos.deleteStamp(nome);
    Utils.toast(`🗑️ Carimbo "${nome}" excluído`, { type: 'ok' });
    this._renderTijoloPanel();
  },

  /** NOVO (07/09/2026) — "novas ideias" pedidas ("exportar/importar uma
   *  construção de tijolos como modelo reutilizável"). Baixa TODOS os
   *  tijolos do mapa atual como um arquivo `.json` (mesmo formato relativo
   *  dos carimbos, ver `Tijolos.exportConstruction`) — reaproveita
   *  `Utils.downloadBlob`, o MESMO utilitário já usado por outras
   *  exportações do app. */
  /** NOVO (08/09/2026, 39a rodada), pedido verbatim: "O aglomerado de
   *  tijolos deve se tornar um objeto unico Modelavel e excluivel." --
   *  excluivel ja funcionava (pickable fixo 'tijolos-merged', ver
   *  engine3d.js `_rebuildTijolos`); este botao resolve o MODELAVEL --
   *  funde os tijolos 'Caixa' sem textura (Tijolos.buildMergedCustomMesh,
   *  MESMA logica de culling de `buildMergedGeometry`) num objeto normal
   *  do mapa (`Mapping.addObject`, `tipo:null`, MESMO padrao de
   *  `_createAndEnterNewCube3D`/`_createPrimitiveObjectAndEnter` acima)
   *  com `customMesh`/`customMeshXform` -- a partir dai e um objeto igual
   *  qualquer outro, 100% editavel no Modelador 3D (abre direto nele) e
   *  excluivel do jeito normal (tecla Del com o objeto selecionado, alem
   *  do fluxo antigo de excluir o aglomerado inteiro pela ferramenta
   *  Tijolo). Os tijolos convertidos SAEM de `map.tijolos` (senão
   *  apareceriam duplicados -- a malha antiga E o objeto novo). Cunhas e
   *  tijolos com textura NAO participam (mesma decisao de escopo de
   *  `buildMergedGeometry`/`buildMergedCustomMesh` -- nunca fazem parte da
   *  malha fundida) -- continuam soltos no mapa, do jeito que estavam. */
  async _tijoloAglomeradoVirarObjeto() {
    const todos = this._map.tijolos || [];
    const convertiveis = todos.filter((t) => (t.formato || 'caixa') === 'caixa' && !t.texturaUrl);
    if (!convertiveis.length) { Utils.toast('Nenhum tijolo \'Caixa\' sem textura pra converter (cunhas/com textura não entram nessa fusão).', { type: 'warn' }); return; }
    if (typeof Modeler3D === 'undefined') { Utils.toast('Modelador 3D não carregado.', { type: 'danger' }); return; }
    const cm = Tijolos.buildMergedCustomMesh(convertiveis);
    if (!cm) { Utils.toast('Nada pra converter (nenhuma face visível sobrou).', { type: 'warn' }); return; }
    document.exitPointerLock?.();
    const novo = Mapping.addObject(this._map, cm.origin.x, cm.origin.z, null, {
      layerId: this._layerIdParaNovosItens(),
      elevacao: cm.origin.y,
      forma: 'retangulo',
      customMesh: { vertices: cm.vertices, edges: cm.edges, faces: cm.faces },
      customMeshXform: { rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
      cor: convertiveis[0].cor || '#c77f4a',
    });
    const bb = ModelerMesh.localBBox(cm.vertices);
    Mapping.updateObject(this._map, novo.id, {
      largura: Math.max(0.05, bb.maxX - bb.minX),
      profundidade: Math.max(0.05, bb.maxZ - bb.minZ),
      altura: Math.max(0.05, bb.maxY - bb.minY),
    });
    // Remove os tijolos convertidos (por id, evita apagar algum tijolo que
    // um outro sistema tenha adicionado ao mapa entre a leitura e aqui).
    const idsConvertidos = new Set(convertiveis.map((t) => t.id));
    this._map.tijolos = todos.filter((t) => !idsConvertidos.has(t.id));
    DB.saveMap(this._map);
    await this._rebuildScene();
    this._renderTijoloPanel();
    Utils.toast(`Aglomerado convertido em objeto modelável (${convertiveis.length} tijolo(s) fundido(s)) 🧊`, { type: 'ok' });
    setTimeout(() => {
      try { Modeler3D.enter(this, (this._map.objects || []).find((o) => o.id === novo.id) || novo, { enterOrbital: !(this._orbCamMode || this._fotoCamMode) }); } // [12/09/2026 — ITEM C]
      catch (err) {
        if (typeof ModuleHost !== 'undefined') ModuleHost.showLoadError('Modelador 3D', err);
        else console.error('Falha ao entrar no Modelador 3D:', err);
      }
    }, 0);
  },

    async _exportarConstrucaoTijolos() {
    if (!this._map.tijolos || !this._map.tijolos.length) { Utils.toast('Nenhum tijolo no mapa pra exportar', { type: 'warn' }); return; }
    const alvo = await this._tijoloAimTarget();
    const origem = alvo ? { x: alvo.x, y: alvo.y, z: alvo.z } : { x: 0, y: 0, z: 0 };
    const dados = Tijolos.exportConstruction(this._map.tijolos, origem);
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    Utils.downloadBlob(blob, `construcao-tijolos-${Date.now()}.json`);
    Utils.toast(`⬇️ ${this._map.tijolos.length} tijolo(s) exportados`, { type: 'ok' });
  },
  /** Lê o `.json` escolhido e aplica no mapa, ancorado no ponto mirado
   *  agora — mesmo padrão de "1 ação = 1 entrada no histórico" dos outros
   *  caminhos de colocação em lote. */
  async _importarConstrucaoTijolos(file) {
    if (!file) return;
    const panel = this._container?.querySelector('#v3d-tijolo-panel');
    try {
      const texto = await file.text();
      const dados = JSON.parse(texto);
      const alvo = await this._tijoloAimTarget();
      if (!alvo) { Utils.toast('Mire numa superfície para importar', { type: 'warn' }); return; }
      const criados = Tijolos.importConstruction(this._map, dados, { x: alvo.x, y: alvo.y, z: alvo.z });
      if (!criados.length) { Utils.toast('Arquivo inválido ou vazio', { type: 'warn' }); return; }
      this._tijoloUndoStack = this._tijoloUndoStack || [];
      this._tijoloRedoStack = [];
      this._tijoloUndoStack.push({ tijolos: criados });
      this._engine.rebuildTijolos?.(this._map);
      DB.saveMap(this._map);
      Utils.toast(`⬆️ ${criados.length} tijolo(s) importados`, { type: 'ok' });
    } catch (err) {
      Utils.toast('Não foi possível ler esse arquivo — confira se é um .json exportado daqui', { type: 'warn' });
    } finally {
      if (panel) { const inp = panel.querySelector('#tj-importar-input'); if (inp) inp.value = ''; }
      this._renderTijoloPanel();
    }
  },

  /** NOVO (08/09/2026), pedido verbatim: "No 'Ver em 3D', como o
   *  Modelador pertence a tela 'Ver em 3D', então, fica dentro dela,
   *  configurável na seção destinada a isso nas 'configurações do app'."
   *  O Modelador já é confinado por padrão (arquiteturalmente — ver
   *  wrapEl em modeler-core.js), então esta função só cuida do modo
   *  OPT-IN "tela cheia" (`workspaceFullscreenConfig.modelador === true`):
   *  detecta a TRANSIÇÃO inativo→ativo/ativo→inativo de `Modeler3D.isActive()`
   *  (chamado a cada quadro por `_update`, sem custo — é só leitura de
   *  flag) e liga/desliga uma classe CSS (`.view3d-modelador-fullscreen`)
   *  no próprio `this._container` de View3D — cobrindo tudo via
   *  `position:fixed;inset:0`, registrado no `WindowManager` na camada
   *  "fullscreen-views" (zIndex 900, mesma usada por Foto/Organizar/Modo
   *  assistido — ver KNOWN_LAYERS em windowmanager.js) pra não conflitar
   *  com modais/painéis flutuantes de zIndex maior. ZERO mudanças em
   *  modeler-core.js/modeler-ui.js — o Modelador nem sabe que isso existe,
   *  só o CONTAINER dele (que já é responsivo por CSS, ver engine3d.js
   *  `clientWidth/clientHeight` por quadro) muda de tamanho/posição por
   *  fora. */
  _syncModeladorFullscreen() {
    if (!this._container || !this._wsFullscreenCfg?.modelador) return;
    const ativo = !!window.Modeler3D?.isActive?.();
    if (ativo === this._modeladorFullscreenActive) return;
    this._modeladorFullscreenActive = ativo;
    this._container.classList.toggle('view3d-modelador-fullscreen', ativo);
    if (typeof WindowManager !== 'undefined') {
      if (ativo) WindowManager.register('view3d-modelador-fullscreen', { el: this._container, kind: 'fullscreen', label: 'Modelador (tela cheia)', zIndex: 900 });
      else WindowManager.unregister('view3d-modelador-fullscreen');
    }
  },

  _update(delta) {
    // NOVO (08/09/2026): checa a cada quadro se o Modelador acabou de
    // ficar ativo/inativo e liga/desliga o popup "tela cheia" opcional
    // (ver _syncModeladorFullscreen abaixo) — feito ANTES do guard
    // `isActive()` logo abaixo, senão nunca rodaria enquanto o Modelador
    // está de fato ativo (que é exatamente quando precisa rodar).
    this._syncModeladorFullscreen();
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
    // [10/09/2026] RESTAURADO — MESMA proteção acima, agora pro orb de
    // foto/câmera sendo "visto através" (ver comentário grande em
    // this._fotoCamMode, mount()). NOVO (09/09/2026) — sai sozinho se a
    // foto foi apagada/desvinculada do mapa enquanto estava sendo vista.
    if (this._fotoCamMode) {
      const fotoAinda = (this._map?.fotos || []).some((f) => f.id === this._fotoCamMode.fotoId);
      if (!fotoAinda) { this._exitFotoCameraView(); }
      else { this._updateAutopilot(delta); return; }
    }
    // [10/09/2026] NOVO — MESMA proteção acima, pro "orb de câmera" (ver
    // this._orbCamMode, mount()/_enterCameraOrbView). Diferente dos dois
    // ramos acima (modos de espectador, que chamam _updateAutopilot pro
    // boneco continuar andando sozinho): aqui `return` simplesmente PULA
    // todo o processamento de movimento/gravidade/WASD abaixo — pedido
    // verbatim: "a câmera do personagem fixa" — a pose já é garantida todo
    // quadro pelo re-trava em `_loop` (ver "_orbCamLockedPose" lá), este
    // `return` só evita processamento e efeitos colaterais (queda/pulo)
    // inúteis enquanto travado.
    if (this._orbCamMode) {
      const camOrbAinda = (this._map?.cameras || []).some((c) => c.id === this._orbCamMode.camId);
      if (!camOrbAinda) { this._exitCameraOrbView(); }
      else { return; }
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
    // NOVO (07/09/2026), pedido verbatim: "scripts para os objetos [...]
    // Útil para animações e interações [...] Por exemplo, dá para fazer um
    // script de quando o personagem apertar um botão algo acontecer." —
    // gatilho automático "por proximidade" (o app não tem física de
    // colisão de verdade jogador×objeto — ver NOTA em Colisão do painel de
    // Objeto — então proximidade é o substituto honesto pra "encostar
    // nele"/"apertar" um botão do cenário sem precisar construir um motor
    // de física do zero): entidades com um EventTrigger `onProximityEnter`
    // configurado disparam a(s) ação(ões) UMA VEZ quando o jogador ENTRA no
    // raio configurado NO EVENTO (padrão 1.5m) — borda de subida, não a
    // cada quadro parado dentro do raio — controlado por
    // `this._scriptProximityInside` (Set de ids "dentro" no quadro
    // anterior).
    this._updateScriptProximityTriggers();
    // [11/09/2026] NOVO — ciclo de vida automático Start()/Update() de
    // TODO ScriptComponent ativo (ver _updateScriptLifecycle acima) —
    // roda TODO quadro, independente de proximidade/clique.
    this._updateScriptLifecycle(delta);
    // [13/09/2026] NOVO — "carro dirigível": enquanto `_carroControlado`
    // estiver ativo, o controle NORMAL do jogador (WASD/gravidade/pulo,
    // todo o resto desta função abaixo) fica CONGELADO — mesmo espírito
    // do guard `_orbCamMode` mais acima (`return` antecipado evita
    // processamento/efeitos colaterais inúteis) — e em vez disso a física
    // de inércia do carro + a câmera de terceira pessoa são atualizadas
    // por `_updateCarrosControlados`/`_updateCarroCamera` (ver comentário
    // grande no primeiro, pra fórmulas exatas de aceleração/fricção/
    // virada, e LIMITAÇÕES honestas: sem colisão do carro contra paredes,
    // sem suspensão/inclinação em curva, câmera sem colisão contra
    // paredes atrás do carro). Colocado DEPOIS de `_updateScriptLifecycle`
    // de propósito — scripts de outros objetos (portas automáticas,
    // relógios, câmeras PS1 etc.) continuam rodando normalmente enquanto
    // o jogador dirige, só o PRÓPRIO jogador para de responder a WASD.
    if (this._carroControlado) {
      this._updateCarrosControlados(delta);
      this._updateCarroCamera();
      return;
    }
    // [13/09/2026] NOVO — "MODO COMPUTADOR": mesmo espírito do guard do carro
    // acima — enquanto `_computadorAcessado` está ativo, o controle normal do
    // jogador (WASD/gravidade/pulo) fica CONGELADO; a câmera fica parada, fixa
    // em frente ao monitor (posicionada uma única vez por `_acessarComputador3D`,
    // sem precisar de um "_updateComputadorCamera" por quadro — diferente do
    // carro, o monitor não se move). Scripts de outros objetos continuam
    // rodando normalmente (`_updateScriptLifecycle` já rodou acima).
    if (this._computadorAcessado) {
      return;
    }
    // NOVO (07/09/2026), pedido verbatim: "blocos de construção [...] Ao
    // segurar o ctrl, vai adicionando um após o outro no mesmo nível de
    // altura [...] Para continuar adicionando tijolos [...] o importante é
    // [a mira] variar [de alvo] e o raio bater em uma superfície." Checado a
    // cada quadro (não só no clique) — ver _updateTijoloDrag.
    this._updateTijoloDrag();
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
      // [19/09/2026 UTC] RODADA 204 -- pedido verbatim: "Ao pressionar o botão do meio do mouse, é
      // possível ir 10x mais devagar que o normal, porém, atualmente, só funciona com as teclas w, a, s,
      // d. Deve funcionar [...] no pressionar das setas 'para cima' e 'para baixo' (que ficam ativas
      // quando a gravidade está desligada)." Reaproveita o MESMO `middleSlow` (0.1 com o botão do meio
      // segurado, 1.0 sem ele) já calculado no início desta função pro WASD horizontal.
      const VY_SPEED = 2.0 * sprint * middleSlow;
      if (this._keys.ArrowUp) cam.y += VY_SPEED * delta;
      if (this._keys.ArrowDown) cam.y -= VY_SPEED * delta;
    }
  },
};

window.View3D = View3D;
