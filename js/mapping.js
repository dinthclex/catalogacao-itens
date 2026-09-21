/**
 * mapping.js — Construção do mapa 2D (planta baixa) do ambiente.
 * Dois modos, configuráveis nas Configurações:
 *
 *  - "manual": você desenha as paredes numa grade (clique/toque) e posiciona
 *    os itens nela conforme cadastra. Sem sensores, 100% confiável.
 *
 *  - "assistido": enquanto anda com o celular, os sensores de movimento
 *    (bússola/giroscópio via DeviceOrientation + contagem de passos via
 *    DeviceMotion) vão estimando uma trilha (posição relativa). Você toca na
 *    tela para marcar onde está um item, e pode ajustar/corrigir a planta
 *    manualmente a qualquer momento (arrastando pontos). Tudo roda local,
 *    nenhum dado de sensor sai do aparelho.
 *
 * Um "ambiente" (Map) tem: paredes (segmentos 2D com altura e, opcionalmente,
 * a cor média observada pela câmera nesse trecho), bounds, e a trilha bruta
 * (quando em modo assistido) para referência/depuração.
 */

/**
 * [11/09/2026] ÍNDICE DE FUNÇÕES — cabeçalho adicionado pra evitar buscas
 * exaustivas (pedido do usuário, mesmo padrão já aplicado em
 * ambientephotos.js). Lista todo método top-level de `Mapping` (objeto,
 * usado por js/mapview.js e js/view3d.js — o 2D e o "Ver em 3D" leem/
 * mutam o `map` sempre através destas funções) e de `SensorTracker`
 * (classe, modo "assistido" do rastreamento por sensores).
 *
 * Mapping (objeto):
 * - newMap: cria um Map novo vazio (walls/points/objects/layers etc.).
 * - defaultAmbienteName: nome padrão "Ambiente N" quando o usuário não digita um.
 * - displayName: nome exibido de um mapa (aplica o padrão acima quando vazio).
 * - ensureNewFields: migração preguiçosa — garante que campos adicionados em
 *   versões recentes existem num `map` salvo antigo (chamado ao carregar).
 * - ensureSafeLayer: garante que existe uma camada "segura" (não removível/
 *   sempre visível) pra nunca sobrar elemento sem camada nenhuma.
 * - resolveLayerId: resolve um `layerId` possivelmente inválido/ausente pra
 *   um id de camada de verdade (camada ativa/segura) — usado por TODO ponto
 *   que precisa "qual camada este elemento novo vai" (2D e 3D).
 * - ensureAllElementsLayered: varre o mapa inteiro corrigindo elementos sem
 *   `layerId` (chamado em migrações/aberturas de mapa).
 * - getChildren/getDescendantIds: hierarquia de mapas-filhos (sub-ambientes).
 * - wouldCreateCycle: valida que reatribuir o pai de um mapa não cria um ciclo.
 * - isLayerVisible/filterByLayerVisibility: consulta/filtra elementos por
 *   visibilidade de camada — usado pra esconder/mostrar no editor 2D e no 3D.
 * - addLayer/removeLayer/renameLayer/setLayerVisible/setLayerLocked/
 *   setLayerOpacity/reorderLayer/reorderLayerToIndex/countInLayer/
 *   duplicateLayer/mergeLayerDown: CRUD completo da janela "Camadas" (2D).
 * - recalcBounds: recalcula a caixa delimitadora do mapa a partir de todo
 *   elemento (paredes/pontos/objetos) — usado ao editar/importar.
 * - addText/removeText/updateText: elemento de texto solto no mapa 2D.
 * - addWall/removeWall/splitWallAt: CRUD de paredes (splitWallAt divide uma
 *   parede em duas ao inserir uma porta/janela/canto novo no meio dela).
 * - addDoor/removeDoor/updateDoor, addWindow/removeWindow/updateWindow,
 *   resolveDoorWindowPos: CRUD de portas/janelas (presas a uma parede).
 * - _capitalizeTipo/_labelForObjectType: rótulo amigável a partir do tipo
 *   interno de um objeto do catálogo (mesa/armário/etc.).
 * - _allSceneNames/_nextObjectName: geram um nome único ("Mesa 2") ao criar
 *   objeto novo sem nome explícito.
 * - addObject/removeObject/updateObject: CRUD de objetos do mapa (móveis,
 *   formas desenhadas, etc. — o catálogo do painel "+" em view3d.js/mapview.js).
 * - objectFootprintFor/objectTopHeight/objectTopHeightAt/
 *   pointInObjectFootprint/_footprintBox/_boxesOverlap/_findTopObjectAt:
 *   geometria de "pegada"/altura de objetos — empilhamento (colocar um item
 *   EM CIMA de outro objeto) e colisão entre objetos.
 * - defaultShapeForTipo/applyDefaultShapeToObject: forma/dimensões-padrão
 *   por tipo de objeto ao criar um novo.
 * - addItemToObject/removeItemFromObject/computeItemAssocIndex: associação
 *   entre um objeto do mapa e patrimônio(s) catalogado(s) (`item.mapaX`).
 * - addPoint/removePoint: pontos de referência soltos no mapa (modo manual).
 * - lineIntersection: geometria auxiliar (interseção de 2 segmentos).
 * - analyzeWalls: detecta cantos/interseções entre paredes (auto-junção).
 * - latLngToLocalMeters: converte coordenada GPS pra metros locais do mapa
 *   (origem = 1º ponto capturado) — usado no modo assistido/geo.js.
 * - findPeripheralSlot: posição "livre" na borda do mapa pra um elemento
 *   novo que ainda não tem lugar certo (ex. item novo sem clique no chão).
 * - sampleAverageColor: amostra a cor média de uma paredes/imagem (usado ao
 *   colorir automaticamente uma parede a partir da câmera).
 * - linkObjects/unlinkObject/groupMembers: agrupamento de objetos (mover/
 *   girar vários de uma vez como um grupo).
 *
 * SensorTracker (classe — modo "assistido", dead-reckoning por sensores):
 * - constructor: estado inicial (heading, posição, buffer do acelerômetro).
 * - isSupported (static): detecta se o navegador expõe DeviceOrientation/Motion.
 * - requestPermission: pede permissão de sensores (obrigatório no iOS 13+).
 * - start/stop: liga/desliga os listeners de orientação/movimento.
 * - _handleOrientation: atualiza `heading` a partir da bússola do aparelho.
 * - _handleMotion: detecta picos de aceleração (candidatos a "passo").
 * - _registerStep: confirma um passo e avança `pos` na direção de `heading`.
 * - reset: zera a posição estimada (início de uma nova sessão de captura).
 */

const Mapping = {
  newMap({ nome, modo = 'manual' } = {}) {
    const id = DB.uuid();
    return {
      id,
      nome: (nome && nome.trim()) || Mapping.defaultAmbienteName(id),
      modo,
      walls: [],
      points: [],
      trilha: [],
      objects: [],
      textos: [],
      portas: [],
      janelas: [],
      // `opacidade` 0-255 (pedido do usuário: barra de opacidade da camada,
      // ver mapview.js _openLayerPropertiesPanel/Map2DRenderer._layerOpacity)
      // — 255 = totalmente opaca (padrão, comportamento de sempre).
      layers: [{ id: Utils.uid('layer'), nome: 'Camada 1', visivel: true, bloqueada: false, opacidade: 255, criadoEm: DB.nowISO() }],
      bounds: { minX: -6, minY: -6, maxX: 6, maxY: 6 },
      // Aninhamento de ambientes (rodada 10, pedido do usuário): um ambiente
      // pode estar "dentro" de outro (id do pai aqui, ou null se for de
      // nível mais alto/"raiz") — profundidade livre, um ambiente dentro de
      // outro dentro de outro, "embrulho dentro de embrulho". Substitui o
      // que seria um conceito à parte de "setor/local": o ambiente MENOR
      // aninhado é, na prática, o "setor" — só que é um ambiente de verdade
      // (com suas próprias fotos/orbs/planta), não um campo de texto solto.
      // Ver Organizar (organizeview.js _commitNestAmbiente) pro
      // clicar-arrastar-soltar que cria/desfaz esse vínculo, e
      // getChildren/getDescendantIds/wouldCreateCycle abaixo pros helpers de
      // árvore usados lá (e em qualquer outro lugar que precise navegar a
      // hierarquia).
      parentId: null,
      criadoEm: DB.nowISO(),
    };
  },

  /** Nome padrão atribuído a um ambiente sem nome próprio ainda — usa um
   *  trecho da própria id (sempre o MESMO pra uma dada ambiente, nada de
   *  aleatório/relógio) em vez de mostrar a id inteira em algum lugar da UI.
   *  Ex.: id "a1b2c3d4-..." vira "Ambiente A1B2". */
  defaultAmbienteName(id) {
    const trecho = (id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
    return `Ambiente ${trecho || '0000'}`;
  },

  /** Nome de exibição de um ambiente — UM campo só (`map.nome`), nunca a id
   *  junto. Também entende o formato ANTIGO (`map.apelido` + `map.nome`
   *  combinados como "Sala de TI (Ambiente 639)") pra continuar mostrando
   *  algo correto em mapas salvos antes desta versão, mesmo antes de
   *  `ensureNewFields` rodar sobre eles (ver migração abaixo). */
  displayName(map) {
    if (!map) return '';
    const nome = (map.apelido && map.apelido.trim()) || (map.nome && map.nome.trim());
    return nome || Mapping.defaultAmbienteName(map.id);
  },

  /** Garante que um mapa carregado de ANTES desta versão (sem
   *  `objects`/`textos`/`layers`) tenha essas listas — sem isto, todo código
   *  que assume `map.objects`/`map.textos`/`map.layers` como
   *  array precisaria checar `|| []` em todo lugar. Chamado ao selecionar/
   *  carregar um ambiente no editor.
   *
   *  Camadas (ver mapview.js — botão "🗂️ Camadas"): paredes, pontos,
   *  objetos e textos têm um `layerId` opcional; sem uma camada
   *  correspondente (mapa antigo, ou campo ausente), contam como visíveis e
   *  destráveis por padrão (ver Map2DRenderer.render/_elLayerLocked em
   *  mapview.js) — por isso um mapa sem NENHUMA camada ainda funciona
   *  perfeitamente, mas ganha uma "Camada 1" aqui pra já existir um destino
   *  válido pra elementos novos e pro painel não ficar vazio. Itens do
   *  catálogo (pinos, `map.itens` — na verdade nem armazenados no mapa, ver
   *  mapview.js._refreshItensNoMapa) ficam DE FORA do sistema de camadas de
   *  propósito — sempre visíveis, sempre editáveis dali.
   *
   *  Também migra o nome: versões antigas guardavam um "apelido" próprio
   *  ligado a uma identificação padrão fixa (`nome`), mostrados juntos
   *  ("Sala de TI (Ambiente 639)"). Agora só existe UM nome de exibição —
   *  quem já tinha apelido definido "ganha" ele como nome final; quem não
   *  tinha mantém a identificação padrão que já existia, sem mudar nada pro
   *  usuário. */
  ensureNewFields(map) {
    if (map.apelido && map.apelido.trim()) map.nome = map.apelido.trim();
    delete map.apelido;
    if (!map.nome || !map.nome.trim()) map.nome = Mapping.defaultAmbienteName(map.id);
    delete map.cameras;
    if (!map.objects) map.objects = [];
    if (!map.textos) map.textos = [];
    if (!map.portas) map.portas = []; // ferramenta "Porta" (ver mapview.js) — mapas de antes desta rodada
    if (!map.janelas) map.janelas = []; // ferramenta "Janela" (ver mapview.js) — mapas de antes desta rodada
    // NOVO (03/09/2026) — ferramentas "Régua" (medição 2 cliques) e
    // "Traço guia" (linha tracejada de referência, não mede) do NOVO
    // menu lateral do mapa 2D (bandeja, igual a 'Mapa'->'Foto'), pedido do
    // usuário. Cada item guarda coordenadas em METROS DE MUNDO (mesmo
    // espaço de objetos/paredes), não pixels de tela — ver mapview.js
    // _medida2dAtiva/_traco2dAtiva e o bloco de desenho em
    // Map2DRenderer.render (medidas2dList/traco2dList).
    if (!map.medidas2d) map.medidas2d = [];
    if (!map.tracos2d) map.tracos2d = [];
    if (!map.layers || !map.layers.length) map.layers = [{ id: Utils.uid('layer'), nome: 'Camada 1', visivel: true, bloqueada: false, opacidade: 255, criadoEm: DB.nowISO() }];
    // Mapas salvos antes da barra de opacidade (pedido do usuário) ainda não
    // têm `opacidade` em cada camada — trata como 255 (totalmente opaca),
    // igual ao visual de sempre, sem precisar migrar nada na hora de abrir.
    map.layers.forEach((l) => { if (l.opacidade == null) l.opacidade = 255; });
    if (map.parentId === undefined) map.parentId = null; // mapas de antes do aninhamento (rodada 10) — ver newMap
    // Objetos colocados ANTES desta rodada (pedido do usuário: relacionar as
    // formas na representação 2D — ex.: um switch, antes uma bolinha
    // genérica) — ganham o formato do catálogo (ver applyDefaultShapeToObject/
    // defaultShapeForTipo) na primeira vez que o mapa é carregado depois
    // desta versão, sem precisar recriar cada objeto manualmente.
    (map.objects || []).forEach((o) => Mapping.applyDefaultShapeToObject(o));
    // [18/09/2026 UTC] Racks sem os parametros (rackUs/rackProfundidade) --
    // ex.: criados por script/importacao -- ganham o padrao 12U x 600mm.
    (map.objects || []).forEach((o) => {
      if (o.tipo === 'rack' && o.rackUs == null && window.RackModular) Object.assign(o, window.RackModular.patchParaObjeto(o, 12, 600));
      // [18/09/2026 UTC] RODADA 164 -- Rack sem componentes (criado antes desta
      // rodada) ganha o Script de fabrica + gatilho "Ao Clicar Duas Vezes"
      // (abrir/fechar a porta). Nunca pisa em componentes ja existentes.
      if (o.tipo === 'rack' && window.RackModular && !(Array.isArray(o.components) && o.components.length)) {
        o.components = window.RackModular.componentesPadrao((p) => Utils.uid(p));
      }
    });
    // [18/09/2026 UTC] RODADA 166 -- Equipamentos de rede (Switch 24/48, Patch Panel 24/48,
    // js/rede-equip.js): garante `obj.rede`, forma real, componentes de fabrica (Script +
    // duplo clique) e a lista `map.cabos`; re-sincroniza a posicao de quem esta num rack.
    if (window.RedeEquip) {
      if (!Array.isArray(map.cabos)) map.cabos = [];
      (map.objects || []).forEach((o) => {
        if (!window.RedeEquip.ehEquipRede(o.tipo)) return;
        window.RedeEquip.garantirRede(o);
        if (o.forma !== 'retangulo') Object.assign(o, window.RedeEquip.patchParaObjeto(o.tipo));
        if (!(Array.isArray(o.components) && o.components.length)) o.components = window.RedeEquip.componentesPadrao(o.tipo, (p) => Utils.uid(p));
      });
      window.RedeEquip.sincronizarNoRack(map);
    }
    // [18/09/2026 UTC] NOVO (RODADA 157) — pedido verbatim do usuário, após
    // testar: "ao dar duplo clique no 'Ver em 3D', apontando para a porta,
    // nada acontece." CAUSA RAIZ: `ObjectStandard.applyDefaultComponents`
    // (RODADA 156, o "molde padrão" que dá à toda porta NOVA o Script +
    // EventTrigger de abrir/fechar por duplo clique) só roda na CRIAÇÃO da
    // entidade — portas desenhadas ANTES daquela rodada (como a que o
    // usuário usou pra testar) continuam para sempre sem nenhum
    // componente, mesmo depois de reabrir o mapa. CORRIGIDO: toda vez que
    // um mapa é carregado (`ensureNewFields` já roda nesse momento, ver
    // mapview.js/view3d.js), qualquer porta que ainda não tenha NENHUM
    // componente (`components` ausente/vazio — nunca mexe numa porta que
    // já tem algo, seja o molde padrão ou customização manual do usuário)
    // recebe agora, com atraso zero (síncrono, mesmo caminho de
    // `applyDefaultComponents`), o mesmo molde padrão do tipo 'porta'.
    // Idempotente: uma vez aplicado, a porta passa a ter `components`, e
    // nas próximas vezes que o mapa for carregado esta linha vira NO-OP
    // silencioso pra ela (mesma guarda de sempre).
    (map.portas || []).forEach((porta) => window.ObjectStandard?.applyDefaultComponents(porta, 'porta'));
    // [18/09/2026 UTC] NOVO (RODADA 158) — pedido verbatim do usuário, após
    // testar com uma porta NOVA (já criada depois da RODADA 156/157):
    // "No componente o script deveria estar selecionado. E no método,
    // deveria estar selecionado o método 'aoClicarDuasVezes()'. Porém só
    // estava '--componente--' e '--método--'." CAUSA RAIZ (corrigida na
    // fonte em `ObjectStandard.applyDefaultComponents`, ver comentário
    // grande lá): o `EventTrigger` clonado apontava pro `id` ANTIGO do
    // Script (do molde), não pro `id` NOVO gerado na clonagem — mas essa
    // correção só vale pra portas criadas DAQUI PRA FRENTE; a porta que o
    // usuário já tinha testado ficou salva com a referência quebrada.
    // `repairOrphanScriptLinks` (auto-cura, só quando há exatamente 1
    // Script na entidade — caso inequívoco) reconecta isso toda vez que o
    // mapa é carregado, pras portas (e paredes/janelas/objetos,
    // mesmo mecanismo de componentes) que já ficaram salvas quebradas.
    (map.portas || []).forEach((porta) => window.ObjectStandard?.repairOrphanScriptLinks(porta));
    (map.walls || []).forEach((wall) => window.ObjectStandard?.repairOrphanScriptLinks(wall));
    (map.janelas || []).forEach((janela) => window.ObjectStandard?.repairOrphanScriptLinks(janela));
    (map.objects || []).forEach((obj) => window.ObjectStandard?.repairOrphanScriptLinks(obj));
    // Migração "múltiplos patrimônios por objeto" (pedido do usuário,
    // 26/08/2026: um objeto agora pode ter MAIS DE UM patrimônio associado,
    // não só um) — `obj.itemId` (singular, campo antigo) vira `obj.itemIds`
    // (array de `{id, em}`; `em` = instante ISO da associação, usado só pra
    // saber a ORDEM quando o MESMO patrimônio aparece em mais de um objeto
    // do mapa — "1ª"/"2ª"/... duplicação, ver mapview.js
    // _computeItemAssocIndex e view3d.js _refreshOrbHud). Sem um instante
    // real de quando a associação antiga aconteceu, usa `DB.nowISO()` no
    // momento da migração — só afeta o desempate entre associações migradas
    // ao MESMO tempo (caso raro, sem consequência prática: nenhuma delas
    // era duplicada até este exato momento de qualquer forma).
    (map.objects || []).forEach((o) => {
      if (o.itemId && !o.itemIds) o.itemIds = [{ id: o.itemId, em: DB.nowISO() }];
      delete o.itemId;
      if (!o.itemIds) o.itemIds = [];
    });
    return map;
  },

  // Nome da camada "de segurança" (ver ensureSafeLayer abaixo) — identificada
  // pelo NOME (não há outro jeito de marcar uma camada como especial no
  // formato de dados atual, mesma técnica de "Adicionados no 3D", ver
  // view3d.js _layerIdParaNovosItens).
  CAMADA_SEGURA_NOME: 'Recuperados (camada original perdida)',

  /** Acha (ou cria, na hora, só se precisar) a camada "de segurança" onde
   *  vão parar elementos/patrimônios com `layerId` inválido — pedido do
   *  usuário (22/08/2026): "devem ir para uma 'camada segura', em vez de ir
   *  para a primeira da lista, pois nela pode haver outras coisas que não
   *  se deve misturar". Antes (correção anterior, mesmo dia) caía na
   *  PRIMEIRA camada da lista, que pode ser qualquer camada de verdade do
   *  usuário — misturaria elementos recuperados com o que já estava lá de
   *  propósito. Não cria a camada de antemão (só quando `resolveLayerId`
   *  realmente encontra algo pra recuperar) — mapas sem nenhum elemento
   *  órfão nunca ganham essa camada extra. */
  ensureSafeLayer(map) {
    const existente = (map.layers || []).find((l) => l.nome === Mapping.CAMADA_SEGURA_NOME);
    return existente ? existente.id : Mapping.addLayer(map, Mapping.CAMADA_SEGURA_NOME).id;
  },

  /** Camada "resolvida" pra um `layerId` que pode ser nulo/ausente OU
   *  apontar pra uma camada que já não existe mais nesse mapa — pedido do
   *  usuário (22/08/2026): "Só pode haver coisas no mapa se estiver em uma
   *  camada... só pode haver itens na grade associados a alguma camada".
   *  Usado tanto pelos elementos do PRÓPRIO `map` (ver
   *  ensureAllElementsLayered logo abaixo) quanto pelos patrimônios
   *  (`mapaLayerId`, que vive FORA do `map` — ver mapview.js
   *  _refreshItensNoMapa/view3d.js _buildItensNoMapa). Cai na camada "de
   *  segurança" (ensureSafeLayer acima), NÃO na primeira da lista — pedido
   *  do usuário: a primeira camada pode ter conteúdo de verdade do usuário,
   *  que não deve se misturar com elementos recuperados. */
  resolveLayerId(map, layerId) {
    if (layerId && (map.layers || []).some((l) => l.id === layerId)) return layerId;
    return Mapping.ensureSafeLayer(map);
  },

  /** Garante que TODO elemento "layerável" do `map` (parede/ponto/
   *  objeto/texto/porta/janela) aponte pra uma camada que REALMENTE existe
   *  — migra pra camada "de segurança" (ensureSafeLayer acima, NÃO a
   *  primeira da lista) quem estiver com `layerId` nulo ou "órfão"
   *  (apontando pra uma camada já excluída). Pedido do usuário (22/08/2026):
   *  "Só pode haver coisas no mapa se estiver em uma camada. Se todas as
   *  camadas estão com a exibição desativada, então, nada deve aparecer" —
   *  a causa raiz de elementos "presos visíveis" mesmo com toda camada
   *  desligada era justamente `isLayerVisible` tratar "sem camada válida"
   *  como sempre-visível (fail-safe pra nunca esconder nada por engano);
   *  casos assim só deviam existir em mapas salvos ANTES desta correção
   *  (ex.: itens colocados no 3D antes do bug de "_placeWithBuildTool sem
   *  mapaLayerId" ser corrigido — ver view3d.js). Corrigindo a ASSOCIAÇÃO em
   *  vez de mexer no fail-safe, o problema desaparece pela raiz: todo
   *  elemento passa a pertencer de verdade a uma camada (agora desligável/
   *  excluível como qualquer outra), em vez de ficar fora do alcance do
   *  sistema de camadas. Devolve `true` se mudou alguma coisa (pra quem
   *  chama saber se vale persistir a correção no banco — ela só muda `map`
   *  em memória). */
  ensureAllElementsLayered(map) {
    if (!map.layers || !map.layers.length) return false;
    let mudou = false;
    // INVESTIGAÇÃO (03/09/2026), pedido verbatim: "No mapa 2D, veja da onde
    // vem esta camada 'Recuperados (camada original perdida)'. O porquê
    // dela ficar surgindo a toda hora." — 'medidas2d'/'tracos2d' (ferramentas
    // "Régua"/"Traço guia", NOVAS nesta mesma rodada — ver ensureNewFields
    // acima) nascem SEM `layerId` nenhum (mapview.js _onMedida2dClick/
    // _onTraco2dClick fazem `push({...})` direto, sem passar por
    // Mapping.add*) e, até esta correção, também não entravam nesta lista de
    // campos — ou seja, nunca eram nem detectados como "órfãos" pra serem
    // migrados. Não eram a causa da camada de segurança reaparecer (não são
    // filtrados por `isLayerVisible`), mas é a mesma classe de bug (elemento
    // sem `layerId`) e deixaria essas ferramentas sem dono de camada pra
    // sempre — corrigido aqui por consistência e porque uma filtragem por
    // camada delas é o próximo passo natural. Ver correção de causa raiz de
    // verdade (o "Novo Cubo 3D" do 2D sem layerId) em mapview.js, no handler
    // de '#map-mode-newcube3d'.
    ['walls', 'points', 'objects', 'textos', 'portas', 'janelas', 'medidas2d', 'tracos2d'].forEach((campo) => {
      (map[campo] || []).forEach((el) => {
        const resolvido = this.resolveLayerId(map, el.layerId);
        if (resolvido && resolvido !== el.layerId) { el.layerId = resolvido; mudou = true; }
      });
    });
    return mudou;
  },

  // ---------- Aninhamento de ambientes (rodada 10 — ver comentário em
  // newMap/parentId) — helpers de árvore usados pelo Organizar
  // (organizeview.js) pro clicar-arrastar-soltar e por qualquer outro lugar
  // que precise navegar a hierarquia. Todos recebem `allMaps` (a lista
  // completa, ex.: `await DB.getAllMaps()`) em vez de irem no banco sozinhos
  // — assim quem já tem a lista em mãos (a maioria das telas, que cacheia)
  // não paga uma leitura extra, e os helpers continuam síncronos. ----------

  /** Ambientes filhos DIRETOS de `parentId` (null/undefined = ambientes de
   *  nível mais alto, sem pai). */
  getChildren(allMaps, parentId) {
    const pid = parentId || null;
    return (allMaps || []).filter((m) => (m.parentId || null) === pid);
  },

  /** Todas as ids de descendentes de `mapId` (filhos, netos, bisnetos...),
   *  em qualquer profundidade — usado principalmente por wouldCreateCycle
   *  abaixo, mas também serve pra, ex., avisar quantos ambientes "dentro"
   *  seriam afetados por alguma ação no pai. */
  getDescendantIds(allMaps, mapId) {
    const out = [];
    const stack = [mapId];
    while (stack.length) {
      const cur = stack.pop();
      for (const child of Mapping.getChildren(allMaps, cur)) {
        if (out.includes(child.id)) continue; // defesa contra ciclo já existente nos dados (não deveria acontecer)
        out.push(child.id);
        stack.push(child.id);
      }
    }
    return out;
  },

  /** Um ambiente não pode virar seu PRÓPRIO descendente — nem direto (você
   *  mesmo) nem indireto (um filho/neto/etc. dele) — senão a árvore vira um
   *  ciclo e some da tela (ninguém é mais "raiz" pra começar a desenhar).
   *  Ver uso em organizeview.js _computeAmbienteDropTarget, que já filtra
   *  esses alvos ANTES de oferecer como destino do arraste. */
  wouldCreateCycle(allMaps, mapId, newParentId) {
    if (!newParentId) return false;
    if (newParentId === mapId) return true;
    return Mapping.getDescendantIds(allMaps, mapId).includes(newParentId);
  },

  // ---------- Camadas (visibilidade/bloqueio/organização — ferramenta
  // "🗂️ Camadas" na barra do mapa 2D, ver mapview.js). Cada camada só guarda
  // metadados; a associação em si vive no `layerId` de cada parede/ponto/
  // objeto/texto (ver addWall/addObject/addText, que
  // aceitam `layerId` dentro de `extra`). ----------
  /** Camada visível? Mesma regra usada em vários lugares (2D, 3D e agora a
   *  miniatura 3D): sem `layerId`, ou a camada referenciada já não existe
   *  mais, conta como VISÍVEL por padrão (fail-safe — nunca esconde nada
   *  por engano). Centralizado aqui (era duplicado em mapview.js
   *  Map2DRenderer._layerVisible e depois copiado pra view3d.js) pra não
   *  divergir. */
  isLayerVisible(map, layerId) {
    if (!layerId) return true;
    const l = (map.layers || []).find((x) => x.id === layerId);
    return !l || l.visivel !== false;
  },

  /**
   * Devolve uma CÓPIA rasa do mapa com paredes/portas/janelas/
   * objetos/textos/itens de camada OCULTA removidos — pedido do usuário:
   * "As camadas ativadas e desativadas na janela 'camadas' devem ser
   * aplicadas no 3D também". Usado por view3d.js (visualização 3D de
   * verdade) e mapview.js (miniatura 3D sobre a grade) — as DUAS cenas 3D
   * do app compartilham a mesma regra de visibilidade do 2D. NUNCA muda o
   * `map` original (a fonte de verdade continua com tudo, inclusive o que
   * está oculto agora) — só a cópia devolvida é filtrada.
   */
  filterByLayerVisibility(map) {
    const visivel = (layerId) => this.isLayerVisible(map, layerId);
    const filtra = (arr) => (arr || []).filter((el) => visivel(el.layerId));
    return {
      ...map,
      walls: filtra(map.walls),
      objects: filtra(map.objects),
      portas: filtra(map.portas),
      janelas: filtra(map.janelas),
      textos: filtra(map.textos),
      itens: filtra(map.itens),
      // [09/09/2026] Ajuste ligado ao conserto de "orb de foto não aparece
      // no 3D" (ver view3d.js _buildFotosNoMapa): agora que `map.fotos` é
      // sempre preenchido antes deste filtro rodar, aplica a MESMA regra de
      // visibilidade de camada que já vale pra `itens` — um orb de foto
      // numa camada oculta some do 3D junto com o resto dela, em vez de
      // continuar aparecendo por engano.
      fotos: filtra(map.fotos),
    };
  },

  /**
   * [13/09/2026] NOVO — irmã de `filterByLayerVisibility` (mesmo espírito,
   * mesma forma), só que filtrando por ANDAR em vez de por camada: devolve
   * uma CÓPIA rasa do mapa com paredes/portas/janelas/objetos/fotos
   * de um andar DIFERENTE de `pisoIdx` removidos (mesmo critério de
   * `getAndarDaEntidade` — entidade sem andar definível, `null`, sempre
   * fica; o próprio objeto "Piso" também sempre fica, pra não sumir a laje
   * de baixo do andar filtrado). `pisoIdx == null` (ou mapa sem nenhum
   * "Piso", `getPisos` vazio) devolve o mapa como veio, sem filtrar nada —
   * comportamento idêntico a hoje.
   *
   * Usado por view3d.js (`_rebuildScene`, seletor "Andar" da topbar do "Ver
   * em 3D") ANTES dos dados chegarem no `engine3d.js` — é também a
   * otimização de desempenho pedida ("renderizar só o andar selecionado ao
   * invés do prédio inteiro"): o `engine3d.js` nunca vê as entidades dos
   * outros andares, então nem os pools de InstancedMesh delas são
   * construídos.
   */
  filterByPiso(map, pisoIdx) {
    if (pisoIdx == null) return map;
    const pisos = this.getPisos(map);
    if (!pisos.length) return map;
    const mantem = (entity) => {
      if (entity && entity.tipo === 'piso') return true;
      const andar = this.getAndarDaEntidade(entity, map);
      return andar == null || andar === pisoIdx;
    };
    const filtra = (arr) => (arr || []).filter(mantem);
    return {
      ...map,
      walls: filtra(map.walls),
      objects: filtra(map.objects),
      portas: filtra(map.portas),
      janelas: filtra(map.janelas),
      fotos: filtra(map.fotos),
    };
  },

  /* [13/09/2026 UTC] NOVO — sistema de Classes/Grupos, pedido verbatim:
     "Deve ser possível dar nomes aos objetos no mesmo sistema do 'class'
     no HTML. No HTML tem o attributo 'name', então, já é como nome do
     objeto. E o atributo 'class', então, deve ser implementado." +
     "Monte um sistema para poder agrupar objetos de tal modo que depois
     em uma lista de opções, ao clicar em uma delas, seja possível
     ativar/desativar aquele grupo na tela para ser renderizado. E mais,
     além disso (habilitar/desabilitar a renderização), também, apenas
     destacar visualmente." + "Uma opção para fazer todas as paredes
     sumirem e ficar apenas os objetos que não são parede, nem piso." +
     (resposta do usuário à pergunta de esclarecimento sobre o botão
     "Andar") "criar um sistema para poder agrupar ativações e
     desativações ao selecionar uma das opções disponíveis" — por isso
     'andaresOcultos' mora neste mesmo sistema, junto de
     'gruposOcultos'/'gruposDestacados'/'ocultarParedesEPiso'.
     Escopo deliberado: classes só em `map.objects` (não paredes/portas/
     janelas/textos/itens/fotos) — o pedido verbatim foi "dar
     nomes AOS OBJETOS" (o `name` do HTML já existe como campo "Nome";
     aqui só o `class` é novo). */
  getObjectClasses(obj) {
    return Array.isArray(obj?.classes) ? obj.classes : [];
  },

  parseClassesInput(texto) {
    const partes = String(texto || '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    return Array.from(new Set(partes));
  },

  getAllClasses(map) {
    const set = new Set();
    (map?.objects || []).forEach((o) => this.getObjectClasses(o).forEach((c) => set.add(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  },

  /** [14/09/2026 UTC] NOVO — GENERALIZAÇÃO de todo o sistema acima (paredes+piso/
   *  andar/classe, 3 categorias FIXAS) para um motor de REGRAS genérico,
   *  tipo `querySelector`, configurável pelo usuário — pedido verbatim,
   *  adiado desde a RODADA 20 ("7, 8 e 9") por ser reformulação de
   *  arquitetura: "Assim como... querySelector, deve ser possível fazer
   *  isso nesse sistema de seleção." / "O 'Grupos' deve ser gerenciável.
   *  Deve poder dar/editar um nome para cada opção... deve ser possível
   *  definir o que é ativado/desativado ao selecionar uma opção. Sobre
   *  isso, é como o display:none/block, visibility:hidden/visible ou
   *  opacity:0/1."
   *
   *  DADOS — `map.grupoRegras`: array de regras, cada uma
   *  `{ id, nome, selector, efeito, ativo, valor }`:
   *    - `nome`: rótulo editável pelo usuário (livre, não precisa bater
   *      com o `selector`).
   *    - `selector`: string tipo `querySelector` (ver `parseGrupoSelector`/
   *      `grupoRegraMatches` abaixo) — decide QUAIS entidades a regra
   *      afeta.
   *    - `efeito`: `'ocultar'` (display:none — não desenha), `'opacidade'`
   *      (opacity:X — desenha esmaecido, fator em `valor`) ou `'destacar'`
   *      (anel de destaque visual, mesmo círculo dourado de sempre).
   *    - `ativo`: o toggle de verdade (👁️/checkbox no painel) — só regras
   *      ATIVAS surtem efeito; existirem "desligadas" é o equivalente a
   *      tê-las editado/guardado sem aplicar ainda.
   *
   *  SINTAXE DO SELECTOR (querySelector simplificado, CSS-like):
   *    - `.classe`      → objeto tem essa classe (`Mapping.getObjectClasses`)
   *    - `#id`          → id exato da entidade
   *    - `tipo=valor`   → `entity.tipo === valor` (ex.: `tipo=cadeira`)
   *    - `forma=valor`  → `entity.forma === valor`
   *    - `andar=N`      → `Mapping.getAndarDaEntidade(entity,map) === N`
   *    - `parede`       → é uma parede (`isWall`, repassado por quem chama)
   *    - `piso`         → `entity.tipo === 'piso'`
   *    - `*`            → qualquer entidade
   *    Átomos concatenados SEM espaço = "E" (AND) — ex.: `.sala1tipo=cadeira`
   *    NÃO é o pedido: use espaço nenhum dentro de um único átomo, e vírgula
   *    pra "OU" (OR) — ex.: `parede, piso` (regra "Paredes e Piso" de
   *    sempre, migrada) ou `.classe1, .classe2` (classe1 OU classe2).
   *
   *  MIGRAÇÃO — mapas salvos ANTES desta rodada não têm `map.grupoRegras`
   *  ainda; `getGrupoRegras` cria o array na 1ª leitura
   *  (`_migrarGruposParaRegras`), convertendo fielmente o estado antigo
   *  (`ocultarParedesEPiso`/`andaresOcultos`/`gruposOcultos`/
   *  `gruposDestacados`) em regras equivalentes — nenhuma visibilidade
   *  muda ao abrir um mapa antigo pela 1ª vez depois desta rodada. Os
   *  campos antigos são MANTIDOS no objeto `map` (não apagados) por
   *  seguranca/histórico, mas não são mais lidos por nenhuma função daqui
   *  pra baixo — só `map.grupoRegras` importa a partir de agora. */
  getGrupoRegras(map) {
    if (!map) return [];
    if (!Array.isArray(map.grupoRegras)) this._migrarGruposParaRegras(map);
    return map.grupoRegras;
  },

  _migrarGruposParaRegras(map) {
    const regras = [];
    regras.push({ id: Utils.uid('regra'), nome: '🧱 Paredes e Piso', selector: 'parede, piso', efeito: 'ocultar', ativo: !!map.ocultarParedesEPiso, valor: 0.35 });
    const pisos = this.getPisos(map);
    pisos.forEach((_, i) => {
      const nome = i === 0 ? '🏢 Térreo' : `🏢 ${i}º andar`;
      regras.push({ id: Utils.uid('regra'), nome, selector: `andar=${i}`, efeito: 'ocultar', ativo: (map.andaresOcultos || []).includes(i), valor: 0.35 });
    });
    const classes = this.getAllClasses(map);
    const gruposOcultos = map.gruposOcultos || [];
    const gruposDestacados = map.gruposDestacados || [];
    classes.forEach((c) => {
      regras.push({ id: Utils.uid('regra'), nome: `🏷️ ${c}`, selector: `.${c}`, efeito: 'ocultar', ativo: gruposOcultos.includes(c), valor: 0.35 });
      // Modelo antigo permitia oculto E destacado ao mesmo tempo (2 toggles
      // independentes por classe) — o novo modelo é 1 efeito por regra, então
      // uma 2ª regra "irmã" cobre o caso raro de os dois juntos, sem perder
      // o dado (só cria a 2ª regra quando realmente havia destaque salvo).
      if (gruposDestacados.includes(c)) {
        regras.push({ id: Utils.uid('regra'), nome: `✨ ${c} (destaque)`, selector: `.${c}`, efeito: 'destacar', ativo: true, valor: 0.35 });
      }
    });
    map.grupoRegras = regras;
  },

  addGrupoRegra(map, { nome, selector, efeito } = {}) {
    const regras = this.getGrupoRegras(map);
    const r = { id: Utils.uid('regra'), nome: nome || 'Nova regra', selector: selector || '*', efeito: efeito || 'ocultar', ativo: false, valor: 0.35 };
    regras.push(r);
    return r;
  },

  removeGrupoRegra(map, id) {
    const regras = this.getGrupoRegras(map);
    const idx = regras.findIndex((r) => r.id === id);
    if (idx !== -1) regras.splice(idx, 1);
  },

  toggleGrupoRegraAtivo(map, id) {
    const r = this.getGrupoRegras(map).find((r) => r.id === id);
    if (r) r.ativo = !r.ativo;
  },

  /** Divide o `selector` em grupos "OU" (vírgula) e cada grupo em átomos
   *  "E" (concatenados sem espaço) — ver spec completa no comentário
   *  grande acima de `getGrupoRegras`. */
  parseGrupoSelector(selector) {
    return String(selector || '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean)
      .map((g) => {
        const atoms = [];
        const re = /\.[^\s.#=]+|#[^\s.#=]+|[a-zA-Z_][a-zA-Z0-9_]*=[^\s.#=]+|\*|[a-zA-Z_][a-zA-Z0-9_]*/g;
        let m;
        while ((m = re.exec(g))) atoms.push(m[0]);
        return atoms;
      })
      .filter((atoms) => atoms.length);
  },

  /** Testa se `entity` bate com `selector` (ver spec acima) — `isWall`
   *  repassado por quem chama (paredes não têm `entity.tipo`/`.classes`
   *  próprios, então o átomo `parede` depende de quem itera saber que
   *  está iterando `map.walls`, mesmo padrão que `isEntityGroupHidden` já
   *  usava antes desta rodada). */
  grupoRegraMatches(entity, map, selector, { isWall = false } = {}) {
    if (!entity) return false;
    const grupos = this.parseGrupoSelector(selector);
    if (!grupos.length) return false;
    const classes = this.getObjectClasses(entity);
    const testAtom = (atom) => {
      if (atom === '*') return true;
      if (atom === 'parede') return isWall;
      if (atom === 'piso') return entity.tipo === 'piso';
      if (atom[0] === '.') return classes.includes(atom.slice(1));
      if (atom[0] === '#') return entity.id === atom.slice(1);
      const eq = atom.indexOf('=');
      if (eq > 0) {
        const chave = atom.slice(0, eq), valor = atom.slice(eq + 1);
        if (chave === 'andar') return String(this.getAndarDaEntidade(entity, map)) === valor;
        return String(entity[chave] ?? '') === valor;
      }
      return false;
    };
    return grupos.some((atoms) => atoms.every(testAtom));
  },

  isEntityGroupHidden(entity, map, { isWall = false } = {}) {
    const regras = this.getGrupoRegras(map);
    return regras.some((r) => r.ativo && r.efeito === 'ocultar' && this.grupoRegraMatches(entity, map, r.selector, { isWall }));
  },

  isEntityGroupHighlighted(entity, map) {
    const regras = this.getGrupoRegras(map);
    return regras.some((r) => r.ativo && r.efeito === 'destacar' && this.grupoRegraMatches(entity, map, r.selector, { isWall: false }));
  },

  /** [14/09/2026 UTC] NOVO — efeito `'opacidade'` das regras (o 3º efeito
   *  pedido, "é como o... opacity:0/1"): devolve o multiplicador de alfa
   *  (0-1, `1` = sem efeito nenhum) resultado de TODAS as regras ativas
   *  do tipo `'opacidade'` que baterem com `entity` — quando mais de uma
   *  bate, usa a mais restritiva (`Math.min`). Fiação no desenho: ver
   *  `Map2DRenderer` (mapview.js), multiplicado em cima do
   *  `_layerOpacity` de sempre nos 2 passes que desenham `map.objects`
   *  (mesmo escopo de `getObjectClasses` — "classes só em map.objects",
   *  ver comentário histórico acima). 3D ainda NÃO lê isto nesta rodada
   *  (ocultar/destacar já funcionam nos dois; opacidade fica só no 2D por
   *  ora). */
  getEntityGroupAlpha(entity, map, { isWall = false } = {}) {
    const regras = this.getGrupoRegras(map);
    let alpha = 1;
    regras.forEach((r) => {
      if (r.ativo && r.efeito === 'opacidade' && this.grupoRegraMatches(entity, map, r.selector, { isWall })) {
        alpha = Math.min(alpha, Number.isFinite(r.valor) ? r.valor : 0.35);
      }
    });
    return alpha;
  },

  filterByGrupos(map) {
    const ocultarPeloGrupo = (isWall) => (entity) => !this.isEntityGroupHidden(entity, map, { isWall });
    return {
      ...map,
      walls: (map.walls || []).filter(ocultarPeloGrupo(true)),
      objects: (map.objects || []).filter(ocultarPeloGrupo(false)),
    };
  },

  addLayer(map, nome) {
    if (!map.layers) map.layers = [];
    const l = { id: Utils.uid('layer'), nome: nome || `Camada ${map.layers.length + 1}`, visivel: true, bloqueada: false, opacidade: 255, criadoEm: DB.nowISO() };
    map.layers.push(l);
    return l;
  },

  /** Remove uma camada — NUNCA a última (sempre precisa sobrar uma camada
   *  válida pra abrigar elementos novos). Pedido do usuário (22/08/2026):
   *  "Quando uma camada é excluída, tudo que estiver na grade através dela
   *  também deve ser excluído" — MUDOU de comportamento: ANTES os elementos
   *  da camada excluída eram reatribuídos pra outra camada (nunca ficavam
   *  "soltos"); agora são excluídos junto com a camada, de propósito.
   *  Porta/janela FILHA (parentWallId) de uma parede removida aqui, mas que
   *  pertence a OUTRA camada (não está sendo excluída ela mesma), não é
   *  apagada — vira solta, mesma lógica de removeWall (congela posição/
   *  ângulo absolutos e desliga parentWallId), só que em lote, pra não ficar
   *  órfã apontando pra uma parede que não existe mais.
   *  NÃO mexe em `map.itens` (pinos de patrimônio) — eles não vivem dentro
   *  do `map` (ver mapview.js _refreshItensNoMapa), então excluí-los da
   *  grade é responsabilidade de quem chama (operação assíncrona no banco,
   *  fora do escopo síncrono desta função — ver mapview.js, botão 🗑️ da
   *  janela "Camadas"). */
  removeLayer(map, id) {
    if (!map.layers || map.layers.length <= 1) return false;
    const idx = map.layers.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    const wallIdsRemovidas = new Set((map.walls || []).filter((w) => w.layerId === id).map((w) => w.id));
    if (wallIdsRemovidas.size) {
      [...(map.portas || []), ...(map.janelas || [])].forEach((el) => {
        if (!el.parentWallId || !wallIdsRemovidas.has(el.parentWallId)) return;
        if (el.layerId === id) return; // ela mesma já vai ser excluída abaixo — não precisa soltar antes
        const pos = this.resolveDoorWindowPos(map, el);
        el.parentWallId = null;
        el.x = pos.x; el.y = pos.y; el.angulo = pos.angulo;
      });
    }
    ['walls', 'points', 'objects', 'textos', 'portas', 'janelas'].forEach((campo) => {
      map[campo] = (map[campo] || []).filter((el) => el.layerId !== id);
    });
    map.layers.splice(idx, 1);
    this.recalcBounds(map);
    return true;
  },

  renameLayer(map, id, nome) {
    const l = (map.layers || []).find((l) => l.id === id);
    if (l) l.nome = nome || l.nome;
  },

  setLayerVisible(map, id, visivel) {
    const l = (map.layers || []).find((l) => l.id === id);
    if (l) l.visivel = !!visivel;
  },

  setLayerLocked(map, id, bloqueada) {
    const l = (map.layers || []).find((l) => l.id === id);
    if (l) l.bloqueada = !!bloqueada;
  },

  /** Opacidade da camada, escala 0-255 (0 = invisível, 255 = totalmente
   *  opaca — padrão) — pedido do usuário: barra de opacidade nas
   *  "Propriedades da camada" (ver mapview.js _openLayerPropertiesPanel).
   *  Afeta o DESENHO de tudo que está na camada (Map2DRenderer._layerOpacity),
   *  não a visibilidade/bloqueio (que continuam campos à parte). */
  setLayerOpacity(map, id, opacidade) {
    const l = (map.layers || []).find((l) => l.id === id);
    if (l) l.opacidade = Utils.clamp(Math.round(opacidade), 0, 255);
  },

  /** Move a camada uma posição pra cima/baixo na lista (afeta só a ordem
   *  mostrada no painel — ver mapview.js._openLayersPanel — não reordena
   *  visualmente os elementos no canvas, que continuam desenhados agrupados
   *  por TIPO, não por camada; ver nota de escopo em mapview.js). */
  reorderLayer(map, id, direction) {
    const arr = map.layers || [];
    const idx = arr.findIndex((l) => l.id === id);
    const alvo = idx + (direction === 'up' ? -1 : 1);
    if (idx === -1 || alvo < 0 || alvo >= arr.length) return;
    [arr[idx], arr[alvo]] = [arr[alvo], arr[idx]];
  },

  /** Reordena pra uma posição ABSOLUTA (índice 0 = topo) — usada pelo
   *  clicar/arrastar/soltar (FLIP) da lista no painel de camadas (ver
   *  mapview.js _renderLayersPanel/_wireLayersDrag), como alternativa aos
   *  botões ↑/↓ (que só andam uma posição por vez, ver reorderLayer acima). */
  reorderLayerToIndex(map, id, toIndex) {
    const arr = map.layers || [];
    const from = arr.findIndex((l) => l.id === id);
    if (from === -1) return;
    const clamped = Math.max(0, Math.min(toIndex, arr.length - 1));
    if (clamped === from) return;
    const [l] = arr.splice(from, 1);
    arr.splice(clamped, 0, l);
  },

  /** Quantos elementos (de todos os tipos layeráveis) estão numa camada —
   *  usado só pra exibir no painel (ex: "Camada 1 (12)"). */
  countInLayer(map, layerId) {
    return ['walls', 'points', 'objects', 'textos', 'portas', 'janelas']
      .reduce((n, campo) => n + (map[campo] || []).filter((el) => el.layerId === layerId).length, 0);
  },

  /** Duplica uma camada — cria uma cópia logo abaixo dela na lista, com
   *  cópias de TODOS os elementos que estavam nela (ids novos, mesmos
   *  campos). A camada original não é alterada. */
  duplicateLayer(map, id) {
    const idx = (map.layers || []).findIndex((l) => l.id === id);
    if (idx === -1) return null;
    const orig = map.layers[idx];
    const nova = { id: Utils.uid('layer'), nome: `${orig.nome} (cópia)`, visivel: orig.visivel !== false, bloqueada: !!orig.bloqueada, opacidade: orig.opacidade ?? 255, criadoEm: DB.nowISO() };
    map.layers.splice(idx + 1, 0, nova);
    const prefixos = { walls: 'wall', points: 'pt', objects: 'obj', textos: 'txt', portas: 'porta', janelas: 'janela' };
    // Cópias de porta/janela mantêm o `parentWallId` ORIGINAL (não remapeado
    // pra uma eventual cópia da parede feita nesta mesma operação) — caso
    // raro (duplicar uma camada que tem parede E porta/janela filha dela ao
    // mesmo tempo); resultado ainda é válido (a cópia fica ligada à parede
    // original), só não "acompanha" a parede duplicada — aceitável por ora.
    ['walls', 'points', 'objects', 'textos', 'portas', 'janelas'].forEach((campo) => {
      const clones = (map[campo] || [])
        .filter((el) => el.layerId === id)
        .map((el) => ({ ...el, id: Utils.uid(prefixos[campo]), layerId: nova.id }));
      map[campo] = [...(map[campo] || []), ...clones];
    });
    this.recalcBounds(map);
    return nova;
  },

  /** Mescla uma camada com a que está IMEDIATAMENTE ABAIXO dela na lista
   *  (índice seguinte) — todos os elementos da camada `id` passam a
   *  pertencer à camada de baixo, que absorve o nome? Não — mantém o nome da
   *  camada de baixo (é ela que "recebe"); a camada `id` é removida. Sem
   *  camada abaixo (já é a última), não faz nada e retorna false. */
  mergeLayerDown(map, id) {
    const idx = (map.layers || []).findIndex((l) => l.id === id);
    if (idx === -1 || idx === map.layers.length - 1) return false;
    const destino = map.layers[idx + 1].id;
    ['walls', 'points', 'objects', 'textos', 'portas', 'janelas'].forEach((campo) => {
      (map[campo] || []).forEach((el) => { if (el.layerId === id) el.layerId = destino; });
    });
    map.layers.splice(idx, 1);
    return true;
  },

  recalcBounds(map) {
    let minX = -4, minY = -4, maxX = 4, maxY = 4;
    const consider = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
    (map.walls || []).forEach((w) => { consider(w.x1, w.y1); consider(w.x2, w.y2); });
    (map.points || []).forEach((p) => consider(p.x, p.y));
    (map.trilha || []).forEach((p) => consider(p.x, p.y));
    (map.objects || []).forEach((o) => consider(o.x, o.y));
    (map.textos || []).forEach((t) => consider(t.x, t.y));
    [...(map.portas || []), ...(map.janelas || [])].forEach((el) => {
      const pos = this.resolveDoorWindowPos(map, el);
      consider(pos.x, pos.y);
    });
    map.bounds = { minX, minY, maxX, maxY };
    return map.bounds;
  },

  // ---------- Textos (rótulos livres no mapa — ferramenta "Texto" da suíte
  // estilo Paint.NET, ver mapview.js) — só uma anotação visual (2D e, se
  // quisermos futuramente, um cartaz no 3D); não representa um objeto físico
  // nem se associa a um item do catálogo. ----------
  addText(map, x, y, content = 'Texto', extra = {}) {
    if (!map.textos) map.textos = [];
    // NOVO (07/09/2026), pedido verbatim: "...'Texto'... devem ter nomes...
    // implemente algo semelhante [ao bpy.data.objects] no app." — `nome` é
    // um campo NOVO, separado de `content` (que continua sendo o TEXTO
    // exibido no mapa — o `nome` é só a identidade do objeto no "dicionário"
    // de cena, ver js/sceneobjects.js).
    const t = { id: Utils.uid('txt'), x, y, content, cor: '#ffffff', tamanho: 14, piso: 0, criadoEm: DB.nowISO(), nome: this._nextObjectName(map, 'Texto'), ...extra };
    map.textos.push(t);
    this.recalcBounds(map);
    return t;
  },
  removeText(map, id) {
    map.textos = (map.textos || []).filter((t) => t.id !== id);
    this.recalcBounds(map);
  },
  updateText(map, id, patch) {
    const t = (map.textos || []).find((t) => t.id === id);
    if (!t) return null;
    Object.assign(t, patch);
    this.recalcBounds(map);
    return t;
  },

  addWall(map, x1, y1, x2, y2, extra = {}) {
    // `tipo: 'padrao'` por padrão (pedido do usuário: "um dos tipos... deve
    // ser o 'padrão'" — ver WALL_TYPES em mapview.js) — `extra` pode
    // sobrescrever com outro tipo, se algum dia existir mais de um.
    // `piso: 0` — NOVO (01/09/2026), item GRANDE #9 do pedido de 12 itens
    // ("Novo formato de arquivo... Escadas e outros andares também" +
    // decisão do usuário via AskUserQuestion: "Andares de verdade" —
    // paredes/portas/janelas ganham piso, antes só objetos tinham).
    // Até esta rodada, paredes eram floor-agnostic (apareciam iguais em
    // qualquer andar) — agora cada parede pertence a UM piso (mesma unidade
    // de sempre: inteiro, andar térreo = 0, ver `obj.piso` em addObject
    // abaixo). No 2D (Map2DRenderer) isso ainda NÃO filtra nada de propósito
    // (decisão do usuário, mesma pergunta: sem seletor de andar no editor
    // 2D nesta rodada — todo andar continua desenhado sobreposto, como
    // sempre foi) — o campo existe pra alimentar o NOVO formato de texto
    // (js/maptxt.js) e o empilhamento em altura no 3D (engine3d.js, mesmo
    // mecanismo `piso*2.8` que objetos já usam), não pra mudar o 2D agora.
    // NOVO (07/09/2026), pedido verbatim: "...'Parede'... 'Reta/Curva'...
    // devem ter nomes... implemente algo semelhante [ao bpy.data.objects]
    // no app." — decisão de escopo TRANSPARENTE: a ferramenta "Reta/Curva"
    // (e também "Lápis", que desenha segmentos) não tem coleção própria no
    // mapa — ambas produzem entradas em `map.walls` (mesmo array de
    // "Parede"), então ganham o MESMO nome padrão "Parede.NNN" — não há como
    // distinguir "uma parede normal" de "uma reta/curva desenhada com a
    // ferramenta Lápis/Reta" sem mudar a arquitetura de dados (que não foi
    // pedido aqui); reportado ao usuário no changelog do sw.js.
    const wall = { id: Utils.uid('wall'), x1, y1, x2, y2, height: 2.6, espessura: 0.12, colorRGB: null, tipo: 'padrao', piso: 0, nome: this._nextObjectName(map, 'Parede'), ...extra };
    // NOVO (12/09/2026) — padronização por tipo: ver js/objectstandard.js
    // (comentário grande no topo do arquivo) — seed dos `components`
    // configurados como "Comportamento padrão" pra paredes, se houver.
    window.ObjectStandard?.applyDefaultComponents(wall, 'parede');
    map.walls.push(wall);
    this.recalcBounds(map);
    return wall; // pedido implícito por quem já chamava assumindo isso (ver mapview.js _pasteImageOrClipboard/cola de seleção) — antes não retornava nada
  },

  removeWall(map, wallId) {
    map.walls = map.walls.filter((w) => w.id !== wallId);
    // Porta/janela FILHAS desta parede (ver addDoor/addWindow,
    // resolveDoorWindowPos) ficariam "órfãs" — sem a parede, a posição
    // delas (posAoLongoDaParede) não tem mais nenhuma linha pra se apoiar.
    // Em vez de sumir/travar em (0,0), soltamos elas: congela a última
    // posição/ângulo absolutos JÁ calculados (resolveDoorWindowPos, com a
    // parede ainda existindo neste instante) em x/y/angulo e desliga
    // parentWallId — a porta/janela passa a ser "solta" onde estava, do
    // mesmo jeito que uma colocada "no ar" desde o início.
    [...(map.portas || []), ...(map.janelas || [])].forEach((el) => {
      if (el.parentWallId !== wallId) return;
      const pos = this.resolveDoorWindowPos(map, el);
      el.parentWallId = null;
      el.x = pos.x; el.y = pos.y; el.angulo = pos.angulo;
    });
    this.recalcBounds(map);
  },

  /** Divide uma parede em DUAS no ponto (x,y) informado (projetado na reta
   *  da parede antes de dividir — não precisa cair exatamente em cima) —
   *  pedido do usuário (rodada de snapping/paredes livres, 24/08/2026):
   *  "Conversão Automática de Quinas: Quando uma parede livre toca uma
   *  parede de grade, divida a parede de grade no ponto de contato criando
   *  um nó compartilhado para que texturas e sombras façam a junção
   *  contínua." Ver view3d.js _placeWithBuildTool (chama isto quando o
   *  clique de uma nova parede — livre ou não — pousa NO MEIO de uma parede
   *  já existente, em vez de numa ponta dela).
   *
   *  Só divide de verdade se a projeção cair ENTRE as duas pontas, com uma
   *  folga mínima (MIN_SPLIT_MARGIN) — perto demais de uma ponta já
   *  existente, não faz nada (devolve null): aí já é praticamente uma
   *  junção ponta-a-ponta normal (Mapping.analyzeWalls já fecha esse canto
   *  sozinho), sem necessidade de dividir nada.
   *
   *  A parede ORIGINAL (`wallId`) é ENCOLHIDA pra virar o primeiro trecho
   *  (x1,y1 até o ponto de divisão) — mantém a MESMA id, então porta/janela
   *  filhas dela com `posAoLongoDaParede` ANTES do ponto continuam
   *  corretas sem precisar tocar em nada. A SEGUNDA metade vira uma parede
   *  NOVA (id nova, mesmos height/espessura/tipo/colorRGB/layerId da
   *  original) — porta/janela filhas com `posAoLongoDaParede` DEPOIS do
   *  ponto são realocadas pra essa nova parede, com a medida relativa
   *  recalculada (a posição ABSOLUTA delas não muda nada — resolveDoorWindowPos
   *  ainda devolve exatamente o mesmo x/y/ângulo de antes).
   *
   *  Devolve `{ first, second }` (as duas paredes, `first` = a original já
   *  encolhida em memória) ou `null` se não dividiu.
   */
  splitWallAt(map, wallId, x, y) {
    const MIN_SPLIT_MARGIN = 0.05; // 5cm de folga de cada ponta — evita coto microscópico de parede
    const w = (map.walls || []).find((ww) => ww.id === wallId);
    if (!w) return null;
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    const ux = dx / len, uy = dy / len;
    const t = (x - w.x1) * ux + (y - w.y1) * uy; // projeção do ponto na reta da parede, em metros a partir de x1,y1
    if (t < MIN_SPLIT_MARGIN || t > len - MIN_SPLIT_MARGIN) return null; // perto demais de uma ponta — não divide
    const px = w.x1 + ux * t, py = w.y1 + uy * t;
    const segundaId = Utils.uid('wall');
    const segunda = { ...w, id: segundaId, x1: px, y1: py, x2: w.x2, y2: w.y2 };
    w.x2 = px; w.y2 = py; // encolhe a original pro primeiro trecho
    map.walls.push(segunda);
    [...(map.portas || []), ...(map.janelas || [])].forEach((el) => {
      if (el.parentWallId !== wallId) return;
      if ((el.posAoLongoDaParede || 0) <= t) return; // fica na primeira metade — nada muda
      el.parentWallId = segundaId;
      el.posAoLongoDaParede = (el.posAoLongoDaParede || 0) - t;
    });
    this.recalcBounds(map);
    return { first: w, second: segunda };
  },

  // ---------- Porta/Janela (ferramentas "Porta"/"Janela", ver mapview.js) —
  // podem ficar "soltas" (parentWallId null — posição própria em x/y/angulo,
  // como qualquer objeto do mapa) ou "filhas" de uma parede (parentWallId
  // definido — a posição ABSOLUTA é CALCULADA na hora, a partir da posição
  // ATUAL da parede (resolveDoorWindowPos), nunca guardada/sincronizada à
  // parte: assim mover/arrastar a parede "arrasta" a porta/janela junto
  // automaticamente, sem precisar caçar todo código que move parede (arrastar
  // seleção, arrastar grupo, editar ponto da Reta/Curva, desfazer/refazer —
  // são vários lugares) pra também mover a porta/janela; é matematicamente
  // impossível esquecer um.
  //   - `posAoLongoDaParede`: metros a partir de (x1,y1) da parede, ao longo
  //     da direção dela — só faz sentido com `parentWallId` definido.
  //   - `alturaPeitoril`: altura em relação ao CHÃO, em metros — "aqui deve
  //     aparecer a altura que ela fica em relação a um chão" (pedido do
  //     usuário). É um dado de 3D (o 2D é vista de cima, sem eixo de
  //     altura) — guardado aqui pra quando o 3D for reaproveitar, mas já
  //     editável no painel.
  //   - "no ar"/solta (`parentWallId: null`): tem posição própria (x, y,
  //     angulo) como qualquer objeto — o conceito de "no ar" em si (boiando,
  //     sem nada embaixo) só faz sentido de MOSTRAR em 3D; no 2D (vista de
  //     cima) uma porta/janela solta é só desenhada normalmente na sua
  //     posição, sem nenhum tratamento visual especial (pedido do usuário:
  //     "o 'no ar' que falei serve para os três... para quando estiverem na
  //     representação 3D. No 2D, isso não faz sentido").
  addDoor(map, x, y, extra = {}) {
    if (!map.portas) map.portas = [];
    const d = {
      id: Utils.uid('porta'), parentWallId: null, posAoLongoDaParede: 0,
      // 'anguloExtra': rotação (radianos) SOMADA ao ângulo da parede quando
      // presa (parentWallId definido) — padrão 0 = alinhada à parede (pedido
      // do usuário: "ao clicar em cima da parede, por padrão, elas ficam
      // alinhadas à parede... depois, é possível rotacioná-las"). Quando
      // solta, não se aplica — o ângulo é o próprio `angulo` (livre, editável
      // diretamente). Ver resolveDoorWindowPos.
      anguloExtra: 0,
      // `piso: 0` — NOVO (01/09/2026), item GRANDE #9, mesmo raciocínio do
      // comentário grande em `addWall` acima. Quando PRESA numa parede
      // (`parentWallId` definido), o piso de RENDERIZAÇÃO 3D usado é o da
      // PARede-mãe, não este campo (ver engine3d.js) — evita a porta ficar
      // "flutuando" num andar diferente do da parede que ela corta; este
      // campo só manda de verdade pra uma porta/janela SOLTA.
      piso: 0,
      // [18/09/2026 UTC] NOVO (RODADA 145) — "elevacaoBase": altura (metros,
      // absoluta a partir do chão do nível 0) do TOPO do objeto sob o qual
      // esta porta/janela foi posicionada (ex. um 'piso' a 3m — ver
      // mapview.js _hitTestBaseObjectForAttach), 0 quando colocada
      // diretamente no chão/sem nenhum objeto embaixo. Ver
      // doorWindowAlturaEfetiva logo abaixo — pedido do usuário: "a
      // propriedade 'Altura em relação ao chão' deve ser em relação a esse
      // objeto o qual ela ficou em cima".
      elevacaoBase: 0,
      x, y, angulo: 0, alturaPeitoril: 0, largura: 0.8, altura: 2.1,
      tipo: 'padrao', abertura: 'direita', // 'abertura': lado da dobradiça/sentido do arco de abrir (ver mapview.js render — arco tracejado)
      // 'aberta': só afeta o 3D — FECHADA (padrão) não corta buraco nenhum na
      // parede-mãe; ABERTA corta (ver engine3d.js setScene) — "se estiverem
      // fechadas, não fica o buraco. Se estiverem abertas, fica o buraco na
      // parede" (pedido do usuário). No 2D não muda nada visualmente (vista
      // de cima não representa isso).
      aberta: false,
      // [18/09/2026 UTC] NOVO (RODADA 155) — pedido verbatim: "O modelo 3D
      // da porta deve ter uma maçaneta alavanca simples dos dois lados." A
      // maçaneta (ver buildDoorOrWindowMesh/engine3d.js) já existia como um
      // campo opcional/oculto (`comManeneta`) desde uma rodada anterior
      // (62), sem UI e sem valor padrão em nenhum lugar fora de
      // engine3d.js — ou seja, NENHUMA porta criada pela ferramenta normal
      // "Porta" jamais tinha maçaneta. Agora vira o padrão de TODA porta
      // nova (`true`); ainda pode ser desligado manualmente passando
      // `{ comManeneta: false }` em `extra` (o `...extra` abaixo sobrescreve
      // esta linha).
      comManeneta: true,
      // NOVO (07/09/2026), pedido verbatim: "...'Porta'... devem ter
      // nomes..."
      nome: this._nextObjectName(map, 'Porta'),
      colorRGB: null, layerId: null, criadoEm: DB.nowISO(), ...extra,
    };
    // NOVO (12/09/2026) — ver comentário equivalente em `addWall` acima.
    window.ObjectStandard?.applyDefaultComponents(d, 'porta');
    map.portas.push(d);
    this.recalcBounds(map);
    return d;
  },
  removeDoor(map, id) {
    map.portas = (map.portas || []).filter((d) => d.id !== id);
    this.recalcBounds(map);
  },
  updateDoor(map, id, patch) {
    const d = (map.portas || []).find((d) => d.id === id);
    if (!d) return null;
    Object.assign(d, patch);
    this.recalcBounds(map);
    return d;
  },

  addWindow(map, x, y, extra = {}) {
    if (!map.janelas) map.janelas = [];
    const j = {
      id: Utils.uid('janela'), parentWallId: null, posAoLongoDaParede: 0,
      // 'anguloExtra': ver comentário equivalente em addDoor acima — mesma
      // ideia, rotação somada ao ângulo da parede quando presa.
      anguloExtra: 0,
      piso: 0, // NOVO (01/09/2026), item GRANDE #9 — mesmo raciocínio de addDoor acima
      // 'elevacaoBase' — ver comentário grande equivalente em addDoor, acima.
      elevacaoBase: 0,
      x, y, angulo: 0, alturaPeitoril: 1.0, largura: 1.2, altura: 1.2,
      tipo: 'padrao', grade: false, bandeira: false, // grade: grelha de proteção (só visual); bandeira: variante com bandeira/transom (só abre o topo)
      aberta: false, // só afeta o 3D — ver comentário em addDoor acima
      // NOVO (07/09/2026), pedido verbatim: "...'Janela'... devem ter
      // nomes..."
      nome: this._nextObjectName(map, 'Janela'),
      colorRGB: null, layerId: null, criadoEm: DB.nowISO(), ...extra,
    };
    // NOVO (12/09/2026) — ver comentário equivalente em `addWall` acima.
    window.ObjectStandard?.applyDefaultComponents(j, 'janela');
    map.janelas.push(j);
    this.recalcBounds(map);
    return j;
  },
  removeWindow(map, id) {
    map.janelas = (map.janelas || []).filter((j) => j.id !== id);
    this.recalcBounds(map);
  },
  updateWindow(map, id, patch) {
    const j = (map.janelas || []).find((j) => j.id === id);
    if (!j) return null;
    Object.assign(j, patch);
    this.recalcBounds(map);
    return j;
  },

  /** Posição/ângulo ABSOLUTOS de uma porta/janela AGORA — se `parentWallId`
   *  aponta pra uma parede que ainda existe, calcula a partir da posição
   *  ATUAL dela (`posAoLongoDaParede` projetado na linha entre x1,y1-x2,y2);
   *  senão (solta, ou parede não encontrada — ex.: mapa corrompido) usa a
   *  posição própria (x, y, angulo). Único funil de leitura — usado tanto
   *  pra desenhar (Map2DRenderer.render) quanto pra hit-test/arrastar/painel
   *  (mapview.js), pra nunca haver DOIS jeitos de calcular isso divergindo. */
  resolveDoorWindowPos(map, el) {
    const wall = el.parentWallId ? (map.walls || []).find((w) => w.id === el.parentWallId) : null;
    if (!wall) return { x: el.x, y: el.y, angulo: el.angulo || 0, wall: null };
    const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return { x: wall.x1, y: wall.y1, angulo: 0, wall };
    const ux = dx / len, uy = dy / len;
    const t = Utils.clamp(el.posAoLongoDaParede || 0, 0, len);
    return { x: wall.x1 + ux * t, y: wall.y1 + uy * t, angulo: Math.atan2(dy, dx) + (el.anguloExtra || 0), wall };
  },

  /** [18/09/2026 UTC] NOVO (RODADA 145) — pedido verbatim: "a propriedade
   *  'Altura em relação ao chão' deve ser em relação a esse objeto o qual
   *  ela ficou em cima [...] se colocada em cima de um 'piso' que está a
   *  3m de altura, a 'altura em relação ao chão' da janela deve
   *  somar/basear-se nessa elevação do piso, não no chão absoluto do
   *  mundo/nível 0". `el.alturaPeitoril` continua sendo só o valor
   *  RELATIVO editável no painel (mapview.js `#janela-peitoril`/
   *  `#porta-peitoril`) — este é o funil único que soma a base
   *  (`elevacaoBase`, gravada na hora de posicionar em cima de outro
   *  objeto, ver mapview.js `_hitTestBaseObjectForAttach`) pra chegar na
   *  altura ABSOLUTA de verdade, usada tanto pelo 3D (engine3d.js
   *  `buildDoorOrWindowMesh`, `baseY`) quanto por qualquer exibição no 2D
   *  (painel de propriedades). Porta sempre nasce no chão (`baseY` do 3D
   *  ignora `alturaPeitoril` pra porta — ver comentário lá), mas ainda
   *  soma `elevacaoBase`: uma porta presa em cima de um 'piso' elevado
   *  também deve nascer no TOPO desse piso, não no chão absoluto. */
  doorWindowAlturaEfetiva(el) {
    return (el.elevacaoBase || 0) + (el.alturaPeitoril || 0);
  },

  // ---------- Objetos avulsos (mobiliário/decoração) — mesmos ícones dos
  // tipos de item (ICON_LIBRARY, ver icons.js) quando há correspondente, mais
  // alguns extras só de mapa (coluna, planta, porta, janela...), OU uma forma
  // desenhada (obj.forma: 'retangulo'|'poligono' — quadrado é um retângulo de
  // lados iguais, "círculo" é um polígono regular configurável, ver
  // mapview.js._pickObjectType/_openObjectPanel e OBJECT3D_PROFILES em
  // engine3d.js). Sem `forma` (objetos antigos) ou forma:'icone' = ícone do
  // catálogo (comportamento original). Opcionalmente associado a um item já
  // catalogado (obj.itemIds — pode ser MAIS DE UM, ver addItemToObject
  // abaixo) — vira também o "marcador" desses itens no mapa/3D.
  // Cada um tem um correspondente simples em 3D (ver engine3d.js). ----------
  // NOVO (07/09/2026), pedido verbatim: "Nomes padrão, por exemplo, para o
  // cubo, 'Cube.001' (assim como no Blender). Podendo ser alterado ou
  // acessado, depois. Todos os objetos, agora, devem ter um nome. Todo
  // objeto que pode ser inserido na grade do mapa 2D ou no mapa 3D deve ter
  // um nome." — mesmo espírito do Blender: "<Tipo capitalizado>.NNN",
  // incrementando o sufixo por TIPO dentro do mesmo mapa (não globalmente),
  // pra "Mesa.001"/"Mesa.002" não brigarem com "Coluna.001". `_nextObjectName`
  // é usada tanto na criação (`addObject` abaixo) quanto para "preencher"
  // objetos antigos sem nome, retroativamente, quando o painel de
  // propriedades é aberto (ver mapview.js `_openObjectPanel`).
  _capitalizeTipo(tipo) {
    // BUG CORRIGIDO (07/09/2026), pedido verbatim: "...'Novo Cubo 3D'...
    // devem ter nomes..." — todos os pontos de criação do botão "Novo Cubo
    // 3D" (mapview.js e view3d.js) chamam `addObject(map,x,y,null,...)` com
    // `tipo` null (o cubo nasce sem tipo de catálogo, só com customMesh) —
    // antes disso caía no fallback genérico 'objeto' ("Objeto.001"), o que
    // não identifica a origem. Como TODO chamador com tipo null/vazio no
    // código atual é, de fato, o "Novo Cubo 3D", o fallback vira 'cubo'
    // ("Cubo.001", igual ao Blender pro Cube.001 default).
    const s = String(tipo || 'cubo');
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  // NOVO (07/09/2026) — objetos importados de .obj (js/objimport.js,
  // tipo="objimport:N") não têm um nome "bonito" pra capitalizar (o tipo é
  // só um contador interno) — usa o nome do ARQUIVO importado (ex.:
  // "Cadeira.obj" -> "Cadeira") como base do nome padrão em vez disso,
  // continuando com o mesmo sufixo ".001" incremental por tipo.
  _labelForObjectType(tipo) {
    if (window.ObjImport?.isCustomKey?.(tipo)) {
      const item = (window.ObjImport.listImported?.() || []).find((i) => i.key === tipo);
      if (item?.label) return this._capitalizeTipo(item.label);
    }
    return this._capitalizeTipo(tipo);
  },
  // NOVO (07/09/2026), pedido verbatim: "Todos os objetos devem ter nomes:
  // 'Lápis', 'Parede', 'Porta', 'Janela', 'Texto', 'Reta/Curva', cada uma das
  // formas da ferramenta 'Formas', 'Retículo métrico', 'Trena', 'Traço
  // guia', 'Orb de foto', 'Adicionar orb', cada um dos objetos da
  // ferramenta 'Objetos' e 'Novo Cubo 3D'. Assim como no Blender, há um
  // dicionário para todos os objetos em cena (bpy.data.objects[...]),
  // implemente algo semelhante no app." — o Blender usa um único namespace
  // GLOBAL pra bpy.data.objects (não um por tipo), então agora o sufixo
  // ".NNN" evita colisão contra TODAS as coleções nomeáveis do mapa (não só
  // `map.objects` como antes), listadas em `_allSceneNames` abaixo — usada
  // também pelo novo `js/sceneobjects.js` (window.SceneObjects), o
  // "dicionário" central pedido pelo usuário.
  _allSceneNames(map) {
    const nomes = [];
    const colecoes = [
      map.objects, map.walls, map.portas, map.janelas, map.textos,
      map.medidas2d, map.tracos2d,
    ];
    for (const col of colecoes) {
      if (!col) continue;
      for (const it of col) if (it && it.nome) nomes.push(it.nome);
    }
    return nomes;
  },
  _nextObjectName(map, tipoBase) {
    const usados = new Set(this._allSceneNames(map));
    let n = 1;
    let nome;
    do {
      nome = `${tipoBase}.${String(n).padStart(3, '0')}`;
      n++;
    } while (usados.has(nome));
    return nome;
  },
  addObject(map, x, y, tipo, extra = {}) {
    if (!map.objects) map.objects = [];
    const obj = { id: Utils.uid('obj'), x, y, tipo, piso: 0, angulo: 0, criadoEm: DB.nowISO(), nome: this._nextObjectName(map, this._labelForObjectType(tipo)), ...extra };
    // Luminária: fica no TETO por padrão (3m do chão) quando quem chamou não
    // já mandou uma elevação própria — a hotbar 3D já manda a elevação
    // calculada pela mira + 3m (ver view3d.js _placeWithBuildTool/
    // raycastSurface em engine3d.js), então só entra aqui pelo painel 2D
    // (sem noção de "mirar" — sempre teto). Pedido do usuário: "por padrão,
    // ela fica a 3 metros do chão".
    if (tipo === 'luminaria' && typeof obj.elevacao !== 'number') obj.elevacao = 3.0;
    // NOVO (12/09/2026) — ver comentário grande em js/objectstandard.js:
    // molde de `components` padrão por TIPO de objeto (chave = `tipo`,
    // igual à chave usada por `OBJECT3D_PROFILES`/"Acessar modelos").
    window.ObjectStandard?.applyDefaultComponents(obj, tipo);
    // [15/09/2026 UTC] NOVO — pedido verbatim: "todos os relógios que são
    // colocados por 'Objetos'->'Relógio' (ou no 'Ver em 3D' diretamente
    // pela lista de objetos) tenha um script já carregado nele (como se
    // alguém o tivesse escrito) [...] deve haver ali um script já guiando
    // o funcionamento do relógio." Roda DEPOIS de `applyDefaultComponents`
    // acima (o molde CONFIGURÁVEL por tipo, tela "Acessar modelos" > "⚙️
    // Comportamento padrão") e só entra se `obj.components` continuar
    // vazio (mesma guarda que `applyDefaultComponents` já usa — nunca
    // pisa num molde que o usuário tenha configurado à mão pra 'relogio',
    // nem em `extra.components` que quem chamou já tenha passado
    // explicitamente). `window.Components?.` defensivo — `components.js`
    // carrega DEPOIS de `mapping.js` no `index.html`, mas `addObject` só
    // roda em runtime (clique do usuário), bem depois de todo script já
    // ter carregado; o `?.` é só precaução de ordem, nunca deveria faltar
    // na prática (ver `js/components.js` `DEFAULT_RELOGIO_SCRIPT_CODE`
    // pro código em si e o porquê dele ser funcionalmente idêntico a não
    // ter script nenhum).
    if (tipo === 'relogio' && !(Array.isArray(obj.components) && obj.components.length) && window.Components?.addComponent) {
      window.Components.addComponent(obj, 'Script', { code: window.Components.DEFAULT_RELOGIO_SCRIPT_CODE });
    }
    this.applyDefaultShapeToObject(obj);
    // Escada: nasce com as configurações de fábrica do catálogo (materializadas NO OBJETO);
    // depois disso, o que for alterado vale só para esta escada.
    if (tipo === 'escada') {
      if (obj.escadaDegraus == null) obj.escadaDegraus = 11;
      if (obj.alturaEscada == null) obj.alturaEscada = obj.altura || 2.0;
    }
    // [18/09/2026 UTC] NOVO -- "Rack" parametrico (js/rack-modular.js): nasce
    // 12U x 600mm (ou o que `extra` ja trouxer em rackUs/rackProfundidade) e
    // ja com forma/largura/profundidade/altura/elevacao DERIVADAS desses 2
    // parametros -- mesma fonte pro 2D, colisao, empilhamento e 3D. Sem
    // elevacao explicita, o tipo "parede" nasce a 1,2m do chao (piso = 0).
    if (tipo === 'rack' && window.RackModular) {
      Object.assign(obj, window.RackModular.patchParaObjeto(obj, obj.rackUs || 12, obj.rackProfundidade || 600));
      // [18/09/2026 UTC] RODADA 164 -- Script de fabrica do Rack (adaptado do da
      // Porta, sem macaneta): duplo clique na PORTA abre/fecha. So entra se o
      // molde configuravel do tipo ('rack') nao trouxe componentes.
      if (!(Array.isArray(obj.components) && obj.components.length)) {
        obj.components = window.RackModular.componentesPadrao((p) => Utils.uid(p));
      }
    }
    // [18/09/2026 UTC] RODADA 166 -- Equipamento de rede (Switch 24/48, Patch Panel 24/48):
    // nasce com estado de rede + Script de fabrica (duplo clique liga/desliga o switch) e,
    // se for solto sobre um rack, ENCAIXA na U inteira mais proxima (snap magnetico) --
    // isso ja define a elevacao, entao o empilhamento automatico abaixo nao entra.
    if (window.RedeEquip?.ehEquipRede(tipo)) {
      window.RedeEquip.garantirRede(obj);
      Object.assign(obj, window.RedeEquip.patchParaObjeto(tipo));
      if (!(Array.isArray(obj.components) && obj.components.length)) {
        obj.components = window.RedeEquip.componentesPadrao(tipo, (p) => Utils.uid(p));
      }
      if (!obj.rackId) window.RedeEquip.autoSnapAoColocar(map, obj);
    }
    // Empilhamento automático (pedido do usuário, 25/08/2026): "se a área da
    // forma de um objeto coincidir com a área de outro objeto já inserido no
    // mapa, então o novo objeto é colocado em cima do que já está no mapa
    // [...] no 2D isso não fica evidente, porém quando for para a
    // visualização 3D, ficará evidente." Só entra aqui quando NINGUÉM já
    // decidiu a elevação explicitamente — o 3D (view3d.js
    // _placeWithBuildTool, tool 'objeto') SEMPRE manda `elevacao` já
    // calculada pela mira/raycastSurface (inclusive 0, pousando no chão),
    // que já resolve o empilhamento do jeito certo (o VALOR de onde a mira
    // bateu de verdade) — não faz sentido nem deveria pisar nisso aqui. O
    // painel 2D (sem noção de mira/altura) é quem se beneficia: clicar em
    // cima de um objeto já colocado (ver mapview.js _onObjectsPointerDown,
    // "colocar uma planta em cima de uma mesa") empilha na elevação certa
    // em vez de ficar na MESMA altura (0) do que já está ali, que ia
    // aparecer como dois objetos atravessando um ao outro no 3D.
    if (typeof obj.elevacao !== 'number') {
      // 25/08/2026 — BUG corrigido (pedido do usuário: "tendo qualquer área
      // da forma do objeto coincidente com a outra, então, haverá o
      // empilhamento"). ANTES, `_findTopObjectAt` só testava se o PONTO de
      // clique (x,y — o centro do novo objeto) caía dentro da área de cada
      // objeto já colocado; com objetos pequenos espaçados entre si (ex.: 4
      // impressoras lado a lado numa mesa, com uns centímetros de vão entre
      // elas), o centro do 5º objeto colocado no meio delas caía bem no VÃO
      // (fora da área de qualquer uma das 4), então nenhuma delas era
      // encontrada — só a mesa por baixo — e o novo objeto empilhava na
      // MESMA elevação das outras 4 (por cima da mesa), ficando "dentro"
      // delas (se cruzando) em vez de em cima. Passar `obj` (já com a forma
      // resolvida por applyDefaultShapeToObject acima) faz o teste comparar
      // a ÁREA do novo objeto contra a área de cada objeto já no mapa (ver
      // _boxesOverlap), não só o ponto central.
      const base = this._findTopObjectAt(map, x, y, obj.id, obj);
      if (base) obj.elevacao = this.objectTopHeight(base);
    }
    map.objects.push(obj);
    this.recalcBounds(map);
    return obj;
  },

  /** Retângulo/"círculo" ocupado por um objeto no mapa, em METROS (coordenadas
   *  de mundo) — mesma convenção de rotação do hit-test de tela (ver
   *  mapview.js _pointInObjectShape), só que sem depender de zoom/tela.
   *  Ícone sem forma desenhada explícita (a maioria do catálogo) usa o MESMO
   *  formato padrão do tipo (ver defaultShapeForTipo acima) — mesma fonte de
   *  dimensões usada em todo o resto do app. Sem tipo/forma nenhuma
   *  (objeto bem antigo/genérico), cai num "círculo" pequeno de 0,3m de
   *  raio, só pra não deixar a área indefinida. `cor` (25/08/2026) —
   *  reaproveitado também pelo desenho 2D (ver mapview.js
   *  Map2DRenderer._drawFormaShape/objectGhost, pedido do usuário: "o ghost
   *  dos objetos deve ser conforme sua forma... e corresponder ao seu
   *  tamanho real de acordo com o nível de zoom", tanto no ghost quanto já
   *  inserido) — sem `o.cor` própria, herda a cor do catálogo (mesma de
   *  defaultShapeForTipo), sem fallback aqui (quem desenha decide o
   *  cinza-padrão se nem isso existir). */
  objectFootprintFor(o) {
    let forma = o.forma, largura = o.largura, profundidade = o.profundidade, raio = o.raio, cor = o.cor, lados = o.lados;
    if (forma !== 'retangulo' && forma !== 'poligono' && forma !== 'imagem') {
      const shape = this.defaultShapeForTipo(o.tipo);
      if (shape) { forma = shape.forma; largura = shape.largura; profundidade = shape.profundidade; raio = shape.raio; lados = shape.lados; if (cor == null) cor = shape.cor; }
      else { forma = 'poligono'; raio = 0.3; }
    }
    return { forma, largura, profundidade, raio, cor, lados };
  },

  /** Altura (em metros, do chão daquele piso) do TOPO de `o` — `elevacao +
   *  altura`, com uma exceção: forma:'imagem' (imagem colada/carregada no
   *  mapa, ver mapview.js) é tratada como uma folha CHATA no chão/onde foi
   *  colocada (decalque, sem volume de verdade — o 3D já desenha ela assim,
   *  ver engine3d.js _buildImagemMesh), então o topo é só `elevacao`, SEM
   *  somar `o.altura` (que pra imagem é só um campo vestigial do "molde"
   *  genérico de objeto, não usado em nenhum desenho de verdade dela nem no
   *  2D nem no 3D). Pedido do usuário (25/08/2026): "coloquei uma imagem no
   *  mapa 2D... ao pular, o personagem sobe... e só sai quando sai da área
   *  equivalente" — sem esta exceção, uma imagem "deitada" no chão agia
   *  como um bloco sólido de 0,5m (o padrão de `defaultShapeForTipo` pra
   *  quem não tem tipo, ver `_MESA_FORMA_DEF`-like stamp em mapview.js)
   *  tanto pra física do personagem (_surfaceHeightAt, view3d.js) quanto
   *  pro empilhamento automático (addObject, logo acima) — os DOIS usam
   *  esta função, então os dois já saem corrigidos juntos. */
  objectTopHeight(o) {
    const elevacao = o.elevacao || 0;
    if (o.forma === 'imagem') return elevacao;
    return elevacao + (o.altura || 0.5);
  },

  /** NOVO (01/09/2026), pedido verbatim: "Sobre o objeto escada, no 3D,
   *  deve dar para subir pela escada." `objectTopHeight` (acima) devolve
   *  uma altura ÚNICA pro objeto inteiro — funciona bem pra qualquer objeto
   *  "caixa" comum (`elevacao+altura`, igual em QUALQUER ponto do
   *  footprint), mas nunca serviria pra uma escada: o "topo" de verdade
   *  varia CONFORME A POSIÇÃO ao longo da profundidade (degrau por degrau,
   *  formando uma rampa em blocos — mesma ideia já desenhada no 3D em
   *  `engine3d.js _buildEscadaMesh`). Esta é a versão "ciente da posição"
   *  de `objectTopHeight`: pro caso comum (qualquer tipo que não seja
   *  'escada'), devolve exatamente o mesmo valor de sempre — nenhuma
   *  mudança de comportamento pra nenhum outro objeto. Só pra
   *  `tipo:'escada'` calcula em qual degrau (x,y) cai — reaproveitando a
   *  MESMA fórmula local (`ly`) já usada por `pointInObjectFootprint`
   *  logo abaixo (não é coincidência: dá exatamente o mesmo resultado que
   *  o `lz` local usado por `_buildEscadaMesh` pra posicionar cada degrau
   *  — os dois sistemas de eixo "concordam" por construção) — e devolve a
   *  altura ACUMULADA até aquele degrau. Cada degrau é bem menor que
   *  `STEP_MAX` (view3d.js), então o personagem sobe andando normalmente,
   *  um degrau de cada vez, sem precisar pular.
   *
   *  [13/09/2026, CORRIGIDO de verdade] Causa raiz do bug "a escada não
   *  alcança o andar de cima" (relatado pelo usuário: "deve ser possível
   *  transitar fluidamente entre os andares"): `alturaTotal` era FIXA em
   *  2.0m, um valor completamente desconectado de `map.alturaPiso` (a
   *  distância REAL entre o piso de um andar e o piso do andar seguinte —
   *  4m na v3 do prédio). Com uma escada de 2m tentando vencer um pé-direito
   *  de 4m, o topo do último degrau ficava a meio caminho, literalmente
   *  "flutuando" no ar — o jogador subia a escada inteira e ainda precisava
   *  de mais 2m de altura pra alcançar o piso de cima, que `_surfaceHeightAt`
   *  não tinha como oferecer (o próximo "degrau" não existe mais ali).
   *  CORREÇÃO: `alturaTotal` agora é `obj.alturaEscada` (campo NOVO, opcional
   *  — pra quem quiser uma escada que não sobe o andar inteiro de propósito,
   *  ex. um lance decorativo) OU, por padrão, a MESMA altura de andar do
   *  mapa (`alturaPiso`, recebido de quem chama — ver view3d.js
   *  `_surfaceHeightAt`, que passa `this._map?.alturaPiso`) — garantindo que
   *  o topo do último degrau sempre bate EXATAMENTE no piso de cima, sem
   *  hardcode nenhum. `alturaPiso` tem 2.8 como último fallback (mesmo
   *  default usado em todo o resto do app quando `map.alturaPiso` não foi
   *  definido, ver engine3d.js `mapData.alturaPiso || 2.8`). */
  objectTopHeightAt(o, x, y, alturaPiso) {
    if (o.tipo !== 'escada') return this.objectTopHeight(o);
    const elevacao = o.elevacao || 0;
    const profundidadeTotal = Math.max(0.05, o.profundidade || 3.0);
    const alturaTotal = Math.max(0.05, o.alturaEscada || o.altura || 2.0); // própria de cada escada (janela de propriedades)
    // Degraus: ver `escadaDegraus` — se o usuário não configurou nenhum
    // valor customizado, o padrão agora escala com `alturaTotal` (~18cm por
    // degrau, medida realista de escada de verdade) em vez de um número
    // fixo (11) que, pra um andar de 4m, resultava em degraus de ~36cm —
    // MUITO altos pra subir andando (STEP_MAX é 0.6m em view3d.js, então
    // 36cm até funcionava, mas ficava visualmente/fisicamente irreal e perto
    // demais do limite). Ver comentário grande na função irmã
    // `_buildEscadaMesh` (engine3d.js) pra a conta completa.
    const degraus = Math.max(1, Math.round(o.escadaDegraus) || 11);
    const stepDepth = profundidadeTotal / degraus;
    const stepHeight = alturaTotal / degraus;
    const ang = o.angulo || 0;
    const cos = Math.cos(-ang), sin = Math.sin(-ang);
    const dx = x - o.x, dy = y - o.y;
    const ly = dx * sin + dy * cos; // mesma fórmula de pointInObjectFootprint, abaixo
    const idx = Math.max(0, Math.min(degraus - 1, Math.floor((ly + profundidadeTotal / 2) / stepDepth)));
    return elevacao + stepHeight * (idx + 1);
  },

  /** (x,y) em metros cai dentro da área ocupada por `o`? Ver objectFootprintFor
   *  acima — usado pelo empilhamento automático (addObject) e por
   *  _findTopObjectAt logo abaixo. */
  pointInObjectFootprint(o, x, y) {
    const fp = this.objectFootprintFor(o);
    const ang = o.angulo || 0;
    const cos = Math.cos(-ang), sin = Math.sin(-ang);
    const dx = x - o.x, dy = y - o.y;
    const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
    if (fp.forma === 'poligono') {
      const rx = fp.largura != null ? fp.largura / 2 : (fp.raio || 0.3);
      const ry = fp.profundidade != null ? fp.profundidade / 2 : (fp.raio || 0.3);
      if (rx < 1e-6 || ry < 1e-6) return false;
      return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
    }
    const hw = (fp.largura ?? 0.5) / 2, hd = (fp.profundidade ?? 0.5) / 2;
    return Math.abs(lx) <= hw && Math.abs(ly) <= hd;
  },

  /** Caixa orientada (retângulo com rotação) que aproxima a área ocupada por
   *  `o` — mesma convenção de eixos usada em view3d.js (`objAnguloToRotY`/
   *  extentAlong): eixo local +X (largura) mapeia pra mundo
   *  (cos(angulo), sin(angulo)), eixo local +Z (profundidade) mapeia pra
   *  (-sin(angulo), cos(angulo)). Formas "poligono" (círculo/polígono
   *  regular) usam sua caixa delimitadora (largura×profundidade ou
   *  raio×raio) — uma aproximação um pouco generosa nos cantos, aceitável
   *  pro empilhamento automático (ver _boxesOverlap/_findTopObjectAt
   *  abaixo): é preferível empilhar um pouco cedo demais a deixar dois
   *  objetos se cruzando visualmente na mesma altura. */
  _footprintBox(o) {
    const fp = this.objectFootprintFor(o);
    const hx = fp.largura != null ? fp.largura / 2 : (fp.raio || 0.3);
    const hz = fp.profundidade != null ? fp.profundidade / 2 : (fp.raio || 0.3);
    return { x: o.x, y: o.y, angulo: o.angulo || 0, hx, hz };
  },

  /** Duas caixas orientadas (ver _footprintBox) se sobrepõem, mesmo que só
   *  parcialmente? SAT (Separating Axis Theorem, 4 eixos — os 2 lados de
   *  cada caixa) — usado pelo empilhamento automático pra comparar a ÁREA
   *  de dois objetos, não só um ponto (ver _findTopObjectAt). */
  _boxesOverlap(a, b) {
    const axes = [
      [Math.cos(a.angulo), Math.sin(a.angulo)], [-Math.sin(a.angulo), Math.cos(a.angulo)],
      [Math.cos(b.angulo), Math.sin(b.angulo)], [-Math.sin(b.angulo), Math.cos(b.angulo)],
    ];
    const dx = b.x - a.x, dy = b.y - a.y;
    for (const [nx, ny] of axes) {
      const distCenters = Math.abs(dx * nx + dy * ny);
      const extentA = Math.abs(Math.cos(a.angulo) * nx + Math.sin(a.angulo) * ny) * a.hx
                     + Math.abs(-Math.sin(a.angulo) * nx + Math.cos(a.angulo) * ny) * a.hz;
      const extentB = Math.abs(Math.cos(b.angulo) * nx + Math.sin(b.angulo) * ny) * b.hx
                     + Math.abs(-Math.sin(b.angulo) * nx + Math.cos(b.angulo) * ny) * b.hz;
      if (distCenters > extentA + extentB) return false; // achou eixo separador -> não se sobrepõem
    }
    return true; // nenhum dos 4 eixos separa -> as áreas se cruzam
  },

  /** Entre os objetos já no mapa cuja área SE CRUZA com a área ocupada pelo
   *  novo objeto (`newObj`, já com x/y/angulo/forma), o de TOPO mais alto
   *  (elevacao + altura) — "em cima de qual objeto o novo vai pousar" (ver
   *  addObject acima). Pedido do usuário (25/08/2026): "tendo qualquer área
   *  da forma do objeto coincidente com a outra, então, haverá o
   *  empilhamento" — teste de ÁREA-contra-ÁREA (_boxesOverlap), não mais só
   *  o ponto (x,y) central caindo dentro do objeto já colocado (deixava
   *  passar objetos pequenos/espaçados como 4 impressoras lado a lado, cujo
   *  vão entre elas não pertence à área de nenhuma). Sem `newObj` (chamada
   *  antiga/externa), cai de volta no teste por ponto, mantendo
   *  compatibilidade. `excludeId` evita testar o próprio objeto sendo
   *  criado. */
  _findTopObjectAt(map, x, y, excludeId, newObj) {
    let best = null, bestTop = -Infinity;
    const box = newObj ? this._footprintBox({ ...newObj, x, y }) : null;
    (map.objects || []).forEach((o) => {
      if (o.id === excludeId) return;
      const hit = box ? this._boxesOverlap(box, this._footprintBox(o)) : this.pointInObjectFootprint(o, x, y);
      if (!hit) return;
      this.applyDefaultShapeToObject(o); // garante o.altura calculada, se ainda não tiver forma explícita
      const top = this.objectTopHeight(o);
      if (top > bestTop) { bestTop = top; best = o; }
    });
    return best;
  },

  /** Formato físico (retângulo ou "círculo"/polígono, em metros) plausível
   *  pra um TIPO de objeto do mapa — pedido do usuário ("relacione as
   *  formas na representação 2D... um switch deveria ser um retângulo, não
   *  uma bola"). Reaproveita o MESMO catálogo já usado pelo 3D
   *  (`window.OBJECT3D_PROFILES`/`OBJECT3D_DEFAULT_PROFILE`, ver
   *  engine3d.js) — uma única fonte de dimensões/cor por tipo, não duas
   *  tabelas paralelas que pudessem divergir. Perfis `shape:'box'` viram um
   *  retângulo 2D (largura=w, profundidade=d); `'cylinder'`/`'cone'` viram
   *  um polígono ("círculo", 24 lados, raio=r) — o 2D é sempre visto de
   *  cima, então um cone/cilindro têm a MESMA silhueta vista de cima (um
   *  círculo). Sem `window.OBJECT3D_PROFILES` carregado ainda (engine3d.js
   *  não terminou de rodar) ou sem `tipo`, devolve `null`. */
  defaultShapeForTipo(tipo) {
    if (!tipo) return null;
    const perfil = window.OBJECT3D_PROFILES?.[tipo] || window.OBJECT3D_DEFAULT_PROFILE;
    if (!perfil) return null;
    const cor = `#${(perfil.color ?? 0x8a92a3).toString(16).padStart(6, '0')}`;
    if (perfil.shape === 'cylinder' || perfil.shape === 'cone') {
      return { forma: 'poligono', raio: perfil.r || 0.3, lados: 24, altura: perfil.h || 0.5, cor };
    }
    return { forma: 'retangulo', largura: perfil.w || 0.4, profundidade: perfil.d || 0.4, altura: perfil.h || 0.5, cor };
  },

  /** Aplica o formato padrão acima (ver defaultShapeForTipo) num objeto que
   *  ainda não tem uma forma desenhada EXPLÍCITA de propósito (retângulo/
   *  polígono/imagem — ver ferramenta Formas, que sempre define esses
   *  campos ela mesma) — chamado na criação (addObject, acima) e como
   *  migração pra objetos já colocados antes desta versão (ver
   *  ensureNewFields, mais abaixo). Não faz nada num objeto que já é uma
   *  forma desenhada de propósito, nem quando não há perfil conhecido pro
   *  tipo (tipo vazio ou window.OBJECT3D_PROFILES ainda não carregado). */
  applyDefaultShapeToObject(o) {
    if (!o || o.forma === 'retangulo' || o.forma === 'poligono' || o.forma === 'imagem') return;
    const shape = this.defaultShapeForTipo(o.tipo);
    if (!shape) return;
    Object.assign(o, shape);
  },
  removeObject(map, id) {
    const alvo = (map.objects || []).find((o) => o.id === id);
    map.objects = (map.objects || []).filter((o) => o.id !== id);
    // [18/09/2026 UTC] RODADA 166 -- cabos ligados ao objeto somem junto; equipamentos que
    // estavam num rack removido ficam soltos (rackId/rackU limpos) onde estavam.
    if (window.RedeEquip) {
      if (window.RedeEquip.ehEquipRede(alvo?.tipo)) window.RedeEquip.removerCabosDoObjeto(map, id);
      if (alvo?.tipo === 'rack') (map.objects || []).forEach((o) => { if (o.rackId === id) { o.rackId = null; o.rackU = null; } });
    }
    this.recalcBounds(map);
  },
  updateObject(map, id, patch) {
    const obj = (map.objects || []).find((o) => o.id === id);
    if (!obj) return null;
    Object.assign(obj, patch);
    // [18/09/2026 UTC] RODADA 166 -- mexeu num rack (posicao/angulo/tamanho): quem esta instalado nele acompanha.
    if (obj.tipo === 'rack' && window.RedeEquip) window.RedeEquip.sincronizarNoRack(map, obj.id);
    this.recalcBounds(map);
    return obj;
  },

  /** Associa um patrimônio a um objeto do mapa (`obj.itemIds`, array de
   *  `{id, em, patrimonio}` — pedido do usuário, 26/08/2026: "se houver um
   *  único objeto com mais de um patrimônio marcado nele" — um objeto pode
   *  ter MAIS DE UM patrimônio associado, não só um). `em` (instante ISO da
   *  associação) é o que permite saber a ORDEM quando o MESMO patrimônio
   *  aparece em mais de um objeto do mapa — "1ª"/"2ª"/... duplicação, ver
   *  mapview.js _computeItemAssocIndex. `patrimonio` (pedido do usuário,
   *  27/08/2026: "quando o objeto é patrimoniado, ele... guarda apenas o
   *  número [do patrimônio] em um campo") — uma CÓPIA do número (não o
   *  objeto do item inteiro) guardada no PRÓPRIO objeto do mapa, pra
   *  sobreviver caso o item seja excluído do catálogo depois: sem essa
   *  cópia, um patrimônio excluído deixaria a associação totalmente órfã
   *  (`DB.getItem(entry.id)` passaria a devolver undefined pra sempre,
   *  perdendo até o número) — ver view3d.js _tryPick/_showOrphanPatrimonioCard3D,
   *  que usa exatamente esse campo pra mostrar "o que restou" de uma
   *  associação cujo item já não existe mais. Não duplica a entrada se o
   *  MESMO patrimônio já estiver associado a ESTE MESMO objeto. Devolve
   *  `true` só se de fato adicionou algo novo. */
  addItemToObject(map, objId, itemId, patrimonio) {
    const obj = (map.objects || []).find((o) => o.id === objId);
    if (!obj || !itemId) return false;
    if (!obj.itemIds) obj.itemIds = [];
    if (obj.itemIds.some((e) => e.id === itemId)) return false;
    obj.itemIds.push({ id: itemId, em: DB.nowISO(), patrimonio: (patrimonio || '').trim() });
    return true;
  },

  /** Troca um patrimônio já associado (`oldItemId`) por outro (`newItemId`), mantendo a posição na lista.
   *  Devolve `false` se o antigo não existe ou o novo já está associado a este objeto. */
  replaceItemInObject(map, objId, oldItemId, newItemId, patrimonio) {
    const obj = (map.objects || []).find((o) => o.id === objId);
    if (!obj || !obj.itemIds || !newItemId) return false;
    const idx = obj.itemIds.findIndex((e) => e.id === oldItemId);
    if (idx < 0) return false;
    if (newItemId !== oldItemId && obj.itemIds.some((e) => e.id === newItemId)) return false;
    obj.itemIds[idx] = { id: newItemId, em: DB.nowISO(), patrimonio: (patrimonio || '').trim() };
    return true;
  },

  /** Remove UM patrimônio específico da lista de associados de um objeto —
   *  distinto de zerar tudo, já que agora um objeto pode ter mais de um
   *  (ver addItemToObject acima). Serve tanto pra desassociar um item ainda
   *  existente (botão "✂️" do painel 2D) quanto pra limpar a informação
   *  "restante" (só o número, sem item de verdade por trás — ver
   *  view3d.js _showOrphanPatrimonioCard3D) de um item já excluído do
   *  catálogo — não depende de o item existir, só do `id` guardado na
   *  entrada. Devolve `true` se removeu algo. */
  removeItemFromObject(map, objId, itemId) {
    const obj = (map.objects || []).find((o) => o.id === objId);
    if (!obj || !obj.itemIds) return false;
    const antes = obj.itemIds.length;
    obj.itemIds = obj.itemIds.filter((e) => e.id !== itemId);
    return obj.itemIds.length !== antes;
  },

  /** Índice `patrimônio → [{objId, em}]` (ordenado do mais antigo pro mais
   *  novo) de TODAS as ocorrências de cada patrimônio no mapa inteiro —
   *  ponto único e compartilhado (usado tanto pelo editor 2D, mapview.js
   *  `_drawItemBadges`/`_openObjectPanel`, quanto pelo 3D, view3d.js
   *  `_addOrbWithTool`/`_refreshOrbHud`) pra saber, pra CADA patrimônio, em
   *  quantos objetos ele está e em que ORDEM ("1ª"/"2ª"/... duplicação, ver
   *  addItemToObject acima) — evita duas implementações divergentes da
   *  mesma regra. O(n) sobre `map.objects`. */
  computeItemAssocIndex(map) {
    const idx = new Map();
    ((map && map.objects) || []).forEach((o) => {
      (o.itemIds || []).forEach((entry) => {
        const id = entry && entry.id;
        if (!id) return;
        if (!idx.has(id)) idx.set(id, []);
        idx.get(id).push({ objId: o.id, em: entry.em || '' });
      });
    });
    idx.forEach((arr) => arr.sort((a, b) => (a.em || '').localeCompare(b.em || '')));
    return idx;
  },

  /** Ponto de referência avulso (vértice), usado no modo "Inserir pontos" do
   *  editor de mapa — marca um vértice na representação 2D da tela sem criar
   *  nenhuma parede. Serve como alvo de "encaixe" (snap) para o modo "Inserir
   *  retas": só quando uma reta é iniciada/terminada bem em cima de um ponto
   *  já existente é que ela passa a compartilhar aquele vértice, formando uma
   *  polilinha — do contrário cada reta desenhada é independente. */
  addPoint(map, x, y, extra = {}) {
    if (!map.points) map.points = [];
    const p = { id: Utils.uid('pt'), x, y, ...extra };
    map.points.push(p);
    this.recalcBounds(map);
    return p;
  },

  removePoint(map, pointId) {
    map.points = (map.points || []).filter((p) => p.id !== pointId);
    this.recalcBounds(map);
  },

  /** Interseção das RETAS infinitas que passam por (p1,p2) e (p3,p4) — usada
   *  por analyzeWalls() para "prolongar" retas até se cruzarem. Retorna null
   *  se as retas forem paralelas (nesse caso não dá pra formar canto). */
  lineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y, x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  },

  /**
   * Analisa as paredes desenhadas (retas independentes, como no modo "Inserir
   * retas" do editor 2D) e devolve uma CÓPIA com os cantos "fechados": quando
   * duas pontas de retas diferentes ficam perto uma da outra mas não
   * exatamente coincidentes, prolonga as duas retas (como retas infinitas)
   * até o ponto onde elas se cruzam, e usa esse cruzamento como vértice do
   * canto — sem precisar que o usuário acerte o pixel exato ao desenhar.
   * Não modifica o mapa original (usado só na hora de montar a cena/3D).
   */
  analyzeWalls(map, { cornerJoinDist = 0.5 } = {}) {
    const walls = (map.walls || []).map((w) => ({ ...w }));
    const endpoints = [];
    walls.forEach((w, wi) => {
      endpoints.push({ wi, end: 1, x: w.x1, y: w.y1 });
      endpoints.push({ wi, end: 2, x: w.x2, y: w.y2 });
    });
    for (let i = 0; i < endpoints.length; i++) {
      for (let j = i + 1; j < endpoints.length; j++) {
        const a = endpoints[i], b = endpoints[j];
        if (a.wi === b.wi) continue; // não junta as duas pontas da mesma parede
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d === 0 || d > cornerJoinDist) continue; // já coincidem, ou longe demais pra ser o mesmo canto
        const wa = walls[a.wi], wb = walls[b.wi];
        const inter = this.lineIntersection({ x: wa.x1, y: wa.y1 }, { x: wa.x2, y: wa.y2 }, { x: wb.x1, y: wb.y1 }, { x: wb.x2, y: wb.y2 });
        if (!inter) continue; // retas paralelas — não há canto pra formar
        if (a.end === 1) { wa.x1 = inter.x; wa.y1 = inter.y; } else { wa.x2 = inter.x; wa.y2 = inter.y; }
        if (b.end === 1) { wb.x1 = inter.x; wb.y1 = inter.y; } else { wb.x2 = inter.x; wb.y2 = inter.y; }
      }
    }
    return walls;
  },

  /**
   * Converte uma posição GPS (lat/lng) em metros locais relativos a uma
   * origem (também lat/lng) — usado pelo modo assistido 2D "por GPS" (ver
   * mapview.js). Usa aproximação equirretangular: válida para distâncias
   * pequenas (dezenas/centenas de metros, ex.: um terreno ou prédio), NÃO é
   * apropriada para grandes distâncias (a Terra é curva; erro cresce com a
   * distância da origem). x = longitude (leste/oeste), y = latitude (norte/sul).
   */
  latLngToLocalMeters(origin, pos) {
    const R = 6371000; // raio médio da Terra, em metros
    const latRad = (origin.lat * Math.PI) / 180;
    const dLat = ((pos.lat - origin.lat) * Math.PI) / 180;
    const dLng = ((pos.lng - origin.lng) * Math.PI) / 180;
    return {
      x: dLng * Math.cos(latRad) * R,
      y: dLat * R,
    };
  },

  /**
   * Encontra uma posição "periférica" no mapa — fora de tudo que já foi
   * desenhado, mas perto o bastante pra ser fácil de achar (pedido do
   * usuário: a foto/item "não deve ser difícil muito menos impossível de
   * encontrar... no mapa já feito") — usada para posicionar automaticamente
   * uma foto/item que a pessoa optou por NÃO vincular a um lugar específico
   * (ver a flag `mapaAuto` em js/db.js, e o modal de vínculo em
   * js/capture.js/js/photogrid.js).
   *
   * Pura/síncrona — não lê nada do banco sozinha, pra poder ser chamada de
   * vários lugares (fotos hoje, itens numa rodada futura) sem depender de
   * `await`:
   *  - considera a caixa delimitadora de TUDO que já tem coordenada real no
   *    mapa (`walls`, `points`, `objects`, `textos`);
   *  - `extraPoints` (opcional, array de `{x,y}`) deixa quem chama incluir
   *    TAMBÉM itens/fotos já posicionados DE PROPÓSITO (mapaX/mapaY sem
   *    `mapaAuto`) — de propósito NÃO inclui posições `mapaAuto` alheias
   *    (senão cada novo slot automático empurraria o próximo cada vez mais
   *    longe, numa bola de neve, em vez de ficarem enfileirados juntos);
   *  - sem NENHUM conteúdo (nem no mapa, nem em `extraPoints`), devolve uma
   *    posição padrão fixa — o mesmo centro (0,0) usado como origem da
   *    câmera do editor 2D (ver Map2DRenderer.view em mapview.js);
   *  - havendo conteúdo, devolve uma posição logo à DIREITA de tudo
   *    (`maxX + margem`), com `index` (inteiro, 0-based, incrementado a cada
   *    chamada sucessiva pra um novo slot) empilhando os slots automáticos
   *    numa fila vertical (um abaixo do outro, mesmo X) — assim ficam juntos
   *    e fáceis de notar, em vez de espalhados.
   *  - `margin`/`spacing` em METROS, a mesma unidade já usada em todo o
   *    resto do mapa (altura/espessura de parede em Mapping.addWall, grade
   *    do editor 2D etc.) — 1.5m de respiro até a fila (não gruda nas
   *    paredes) e 1.2m entre um slot e o próximo (dá pra distinguir um do
   *    outro sem desperdiçar espaço).
   */
  findPeripheralSlot(map, index = 0, extraPoints = []) {
    const MARGIN = 1.5;
    const SPACING = 1.2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const consider = (x, y) => {
      if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) return;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };
    (map?.walls || []).forEach((w) => { consider(w.x1, w.y1); consider(w.x2, w.y2); });
    (map?.points || []).forEach((p) => consider(p.x, p.y));
    (map?.objects || []).forEach((o) => consider(o.x, o.y));
    (map?.textos || []).forEach((t) => consider(t.x, t.y));
    (extraPoints || []).forEach((p) => { if (p) consider(p.x, p.y); });

    if (!Number.isFinite(minX)) {
      // Mapa (e extraPoints) vazios — nada pra ficar "perto de" ainda, então
      // usa a origem padrão do editor 2D em vez de calcular qualquer coisa.
      return { x: 0, y: 0, piso: 0 };
    }
    return { x: maxX + MARGIN, y: minY + (index || 0) * SPACING, piso: 0 };
  },

  /** RODADA 53 [15/09/2026 UTC], pedido verbatim (item C): "a distância
   *  entre uma câmera e outra, até que número de inserções para trocar de
   *  linha [...] a coordenada de partida [...] deve ser possível selecionar
   *  se elas vão indo sendo colocadas do ponto de origem definida para a
   *  esquerda/direita/cima/baixo. Se, depois de trocar de linha, a próxima
   *  linha vai ser para cima ou para baixo". Usado por capture.js
   *  `_autoPlacePhoto` quando `fotoAutoAtribuirCamera` (MapConfig) não é
   *  'nao'.
   *
   *  RODADA 54 [15/09/2026 UTC] — GENERALIZADA para aceitar `dirPrimaria`
   *  (direção de avanço dentro de uma linha: 'direita'/'esquerda' —
   *  avanço horizontal, linhas empilhadas em Y — ou 'cima'/'baixo' —
   *  avanço vertical, linhas empilhadas em X) e `quebra` (sentido da
   *  quebra de linha, PERPENDICULAR à `dirPrimaria`: 'cima'/'baixo' quando
   *  `dirPrimaria` é horizontal, 'esquerda'/'direita' quando é vertical).
   *  8 combinações possíveis no total (4 primárias × 2 quebras), conforme
   *  pedido. Ver seletor visual em mapconfig.js (`#mc-foto-grade-dir`).
   *  Padrão ('direita'/'baixo') preserva o comportamento da RODADA 53. */
  findGridSlot(origin, index, distancia = 1.2, porLinha = 6, dirPrimaria = 'direita', quebra = 'baixo') {
    const n = Math.max(1, Math.round(porLinha) || 1);
    const d = (typeof distancia === 'number' && distancia > 0) ? distancia : 1.2;
    const col = (index || 0) % n;
    const row = Math.floor((index || 0) / n);
    const horizontal = (dirPrimaria === 'esquerda' || dirPrimaria === 'direita');
    let dx = 0, dy = 0;
    if (horizontal) {
      dx = (dirPrimaria === 'esquerda' ? -1 : 1) * col * d;
      dy = (quebra === 'cima' ? -1 : 1) * row * d;
    } else {
      dy = (dirPrimaria === 'cima' ? -1 : 1) * col * d;
      dx = (quebra === 'esquerda' ? -1 : 1) * row * d;
    }
    return { x: (origin?.x || 0) + dx, y: (origin?.y || 0) + dy, piso: 0 };
  },

  /** Amostra a cor média de um frame de vídeo/canvas — usada no modo "colorido" do 3D
   *  e para pintar o trecho de parede correspondente durante o mapeamento assistido. */
  sampleAverageColor(source, sampleSize = 24) {
    const c = document.createElement('canvas');
    c.width = sampleSize; c.height = sampleSize;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
    ctx.drawImage(source, 0, 0, sw, sh, 0, 0, sampleSize, sampleSize);
    const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  },

  /** NOVO (07/09/2026), pedido verbatim: "ligar objetos separados como no
   *  Blender. [...] deve ser possível agrupá-los para que, ao abrir o
   *  Modelador para editá-los, seja possível modificar ambos." Grupo é
   *  representado por `obj.grupoId` (string) COMPARTILHADO entre todos os
   *  membros — sem lista separada em nenhum outro lugar do mapa, então
   *  "quem está no grupo" é sempre `map.objects.filter(o=>o.grupoId===X)`
   *  (ver `Mapping.groupMembers`). Centralizado aqui (não em mapview.js/
   *  view3d.js) por ser lógica de dados pura, compartilhada por QUEM QUER
   *  que precise ler/mudar grupos (painel 2D, Modelador 3D) — testável
   *  isoladamente em Node, sem DOM.
   *
   *  `linkObjects(map, idA, idB)` — liga 2 objetos num grupo só:
   *  - Nenhum dos 2 tinha grupo -> cria um grupoId novo pros 2.
   *  - Só um tinha grupo -> o outro ENTRA nesse grupo.
   *  - Os 2 já tinham grupos DIFERENTES -> FUNDE os 2 grupos num só (todo
   *    membro do grupo de B passa a usar o grupoId de A) — "ligar" 2
   *    conjuntos já existentes vira 1 conjunto maior, ninguém fica de fora.
   *  - Já estavam no MESMO grupo -> não faz nada (idempotente).
   *  Devolve o grupoId final, ou `null` se algum dos ids não existir. */
  linkObjects(map, idA, idB) {
    if (idA === idB) return null;
    const objs = map?.objects || [];
    const a = objs.find((o) => o.id === idA);
    const b = objs.find((o) => o.id === idB);
    if (!a || !b) return null;
    if (a.grupoId && a.grupoId === b.grupoId) return a.grupoId; // já ligados
    if (a.grupoId && b.grupoId) {
      // Funde: todo mundo do grupo de B passa a usar o grupoId de A.
      const grupoAntigoB = b.grupoId;
      objs.forEach((o) => { if (o.grupoId === grupoAntigoB) o.grupoId = a.grupoId; });
      return a.grupoId;
    }
    const grupoId = a.grupoId || b.grupoId || ('grp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    a.grupoId = grupoId;
    b.grupoId = grupoId;
    return grupoId;
  },

  /** Tira UM objeto do seu grupo atual (os outros membros continuam
   *  ligados entre si). Se sobrar só 1 membro no grupo depois disso, esse
   *  1 também é desligado (um "grupo" de 1 objeto só não faz sentido —
   *  vira um objeto solto de novo, evita grupos fantasmas acumulando). */
  unlinkObject(map, id) {
    const objs = map?.objects || [];
    const alvo = objs.find((o) => o.id === id);
    if (!alvo || !alvo.grupoId) return;
    const grupoId = alvo.grupoId;
    alvo.grupoId = null;
    const restantes = objs.filter((o) => o.grupoId === grupoId);
    if (restantes.length === 1) restantes[0].grupoId = null;
  },

  /** Lista os OUTROS membros do grupo de `obj` (exclui o próprio `obj`) —
   *  lista vazia se `obj` não tiver grupo. */
  groupMembers(map, obj) {
    if (!obj?.grupoId) return [];
    return (map?.objects || []).filter((o) => o.grupoId === obj.grupoId && o.id !== obj.id);
  },

  // =========================================================================
  // [13/09/2026] NOVO — "Piso" como um NOVO TIPO DE OBJETO GEOMÉTRICO.
  // =========================================================================
  // DECISÃO DE DESIGN (pedido literal do usuário: "Sobre o piso, faça de um
  // jeito simples como um novo objeto. Para poder colocá-lo tanto no 2D
  // quanto no 3D."): ao invés de adicionar um campo numérico tipo
  // `andar`/`floorIndex` em CADA entidade (parede/porta/janela/objeto —
  // abordagem cogitada e DESCARTADA), o "Piso" é um objeto de verdade no
  // catálogo (`tipo:'piso'`, ver js/engine3d-profiles.js) — uma laje
  // retangular fina que o usuário planta no mapa como qualquer outro
  // objeto (arrasta/redimensiona/eleva com os MESMOS controles de sempre,
  // já que reaproveita 100% o mecanismo `forma:'retangulo'` existente —
  // ZERO desenho novo precisou ser escrito, nem no 2D nem no 3D).
  //
  // O "andar" de QUALQUER OUTRA entidade (parede, porta, janela, objeto,
  // foto, texto) não é mais escolhido manualmente — é DERIVADO
  // geometricamente: pega-se a lista de objetos "Piso" do mapa, ordenados
  // pela altura da base deles (elevação), e o andar de uma entidade X é o
  // ÍNDICE do "Piso" mais alto que ainda está ABAIXO (ou na mesma altura)
  // da base de X. Ou seja, X pertence ao andar cujo "Piso" está por baixo
  // dela e o PRÓXIMO "Piso" (se existir) está por cima.
  //
  // COMPATIBILIDADE — NADA QUEBRA em mapas existentes: se o mapa não tiver
  // NENHUM objeto "Piso" ainda, `getPisos` devolve `[]` e
  // `getAndarDaEntidade` devolve `null` pra tudo — o app inteiro continua
  // se comportando EXATAMENTE como hoje (sem filtragem nenhuma por andar)
  // até o usuário decidir plantar o primeiro "Piso". O campo `piso`
  // (inteiro, `obj.piso`/`w.piso`/etc.) que já existe em cada entidade
  // desde 01/09/2026 continua do jeito que está — ele controla o
  // EMPILHAMENTO VERTICAL de verdade no 3D (`piso * mapData.alturaPiso`,
  // ver js/engine3d.js/js/view3d.js) e não foi tocado por esta mudança;
  // os dois mecanismos coexistem (um decide "em que altura Y a entidade é
  // desenhada", o outro só serve pra AGRUPAR/FILTRAR entidades por andar
  // na interface, usando a altura Y resultante — ver getAndarDaEntidade).
  //
  // LIMITAÇÃO CONHECIDA (documentada conforme pedido): assume-se que todo
  // objeto "Piso" é HORIZONTAL (sem inclinação/rotação em X/Z — só
  // `angulo` no plano XZ, que não afeta a altura). Um "Piso" inclinado não
  // é suportado por este cálculo (a "altura da laje" usada é só a
  // elevação dela, um único número).
  //
  // USADO POR: seletor "Piso: [Térreo ▾]" no mapa 2D e seletor "Andar" na
  // barra do "Ver em 3D" (filtragem de exibição/montagem de cena) — ver
  // pontos de integração comentados em js/mapview.js/js/view3d.js.

  /** Lista os objetos "Piso" (`tipo === 'piso'`) do mapa, ORDENADOS do mais
   *  baixo pro mais alto (pela elevação/altura da base da laje). Cada item
   *  devolvido é o PRÓPRIO objeto do mapa (mesma referência), então dá pra
   *  editar (arrastar, redimensionar) normalmente. Lista vazia se não
   *  houver nenhum "Piso" plantado ainda — ver comentário grande acima
   *  sobre compatibilidade com mapas antigos. */
  getPisos(map) {
    return (map?.objects || [])
      .filter((o) => o.tipo === 'piso')
      .slice()
      .sort((a, b) => (a.elevacao || 0) - (b.elevacao || 0));
  },

  /** Altura do "chão" (topo da laje) do "Piso" de índice `i` na lista de
   *  `getPisos` — usado internamente por `getAndarDaEntidade` pra saber
   *  onde cada andar começa. */
  _alturaBasePiso(pisoObj) {
    return (pisoObj.elevacao || 0) + (pisoObj.altura || 0);
  },

  /** Devolve o ÍNDICE (na lista de `getPisos(map)`) do andar a que `entity`
   *  pertence, ou `null` quando não há nenhum "Piso" no mapa (ver
   *  comentário grande acima — nesse caso NADA deve ser filtrado, `entity`
   *  deve continuar sempre visível). `entity` pode ser um objeto, parede,
   *  porta/janela — usa-se `alturaEntidade(entity)` (helper
   *  abaixo) pra achar a altura de referência dela, que varia por tipo de
   *  entidade (uma parede não tem `elevacao`, por exemplo).
   *  Regra: pertence ao "Piso" mais alto cuja laje está NA ALTURA OU ABAIXO
   *  da entidade; se a entidade estiver abaixo de TODOS os "Piso"
   *  existentes, ela conta como pertencente ao índice 0 (mais próximo) —
   *  evita "flutuar" sem andar nenhum por um objeto ter ficado alguns
   *  centímetros abaixo da laje que ele deveria estar em cima. */
  getAndarDaEntidade(entity, map) {
    const pisos = this.getPisos(map);
    if (!pisos.length) return null;
    const y = this._alturaEntidadeParaPiso(entity);
    let idx = 0;
    for (let i = 0; i < pisos.length; i++) {
      if (this._alturaBasePiso(pisos[i]) <= y + 1e-6) idx = i;
      else break;
    }
    return idx;
  },

  /** Altura de referência (Y, em metros — SEM contar `piso*alturaPiso`,
   *  já que este cálculo compara entidades PELA MESMA régua dos objetos
   *  "Piso", que também só usam `elevacao`) usada por `getAndarDaEntidade`
   *  pra decidir onde cada tipo de entidade "está" verticalmente:
   *  - objeto: `elevacao` (chão do próprio objeto).
   *  - parede: 0 (paredes começam do chão do seu próprio `piso` numérico).
   *  - porta/janela: `alturaPeitoril` (onde o vão começa).
   *  - foto/texto: `elevacao` se existir, senão 0. */
  _alturaEntidadeParaPiso(entity) {
    if (entity == null) return 0;
    if ('alturaPeitoril' in entity) return entity.alturaPeitoril || 0;
    if ('elevacao' in entity) return entity.elevacao || 0;
    return 0;
  },
};

/**
 * SensorTracker — dead-reckoning simples (passos + rumo) para o modo assistido.
 * Não é SLAM visual; é uma estimativa por sensores de movimento, corrigível
 * manualmente no editor 2D. É a abordagem confiável escolhida para este projeto.
 */
class SensorTracker {
  constructor({ onStep, onHeading } = {}) {
    this.onStep = onStep || (() => {});
    this.onHeading = onHeading || (() => {});
    this.heading = 0; // radianos, 0 = "norte"/direção inicial
    this.pos = { x: 0, y: 0 };
    this.stepLength = 0.72; // metros por passo (média adulta) — ajustável nas configs
    this._active = false;
    this._accelBuffer = [];
    this._lastStepTime = 0;
    this._lastAlpha = null;
  }

  static isSupported() {
    return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceMotionEvent !== 'undefined';
  }

  async requestPermission() {
    // iOS 13+ exige permissão explícita do usuário (deve ser chamado a partir de um toque)
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r1 = await DeviceMotionEvent.requestPermission();
        if (r1 !== 'granted') return false;
      }
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r2 = await DeviceOrientationEvent.requestPermission();
        if (r2 !== 'granted') return false;
      }
      return true;
    } catch (e) {
      console.warn('Permissão de sensores negada/indisponível:', e);
      return false;
    }
  }

  start() {
    if (this._active) return;
    this._active = true;
    this._onOrientation = (ev) => this._handleOrientation(ev);
    this._onMotion = (ev) => this._handleMotion(ev);
    window.addEventListener('deviceorientationabsolute', this._onOrientation, true);
    window.addEventListener('deviceorientation', this._onOrientation, true);
    window.addEventListener('devicemotion', this._onMotion, true);
  }

  stop() {
    this._active = false;
    window.removeEventListener('deviceorientationabsolute', this._onOrientation, true);
    window.removeEventListener('deviceorientation', this._onOrientation, true);
    window.removeEventListener('devicemotion', this._onMotion, true);
  }

  _handleOrientation(ev) {
    let alpha = ev.alpha;
    if (alpha == null) return;
    if (ev.webkitCompassHeading != null) alpha = 360 - ev.webkitCompassHeading; // iOS
    this.heading = (alpha * Math.PI) / 180;
    this.onHeading(this.heading);
  }

  _handleMotion(ev) {
    const acc = ev.accelerationIncludingGravity || ev.acceleration;
    if (!acc) return;
    const mag = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
    const buf = this._accelBuffer;
    buf.push(mag);
    if (buf.length > 6) buf.shift();
    const avg = buf.reduce((a, b) => a + b, 0) / buf.length;

    // detecção de passo simples: pico acima da média + gravidade, com debounce por tempo
    const now = performance.now();
    if (mag - avg > 3.2 && now - this._lastStepTime > 300) {
      this._lastStepTime = now;
      this._registerStep();
    }
  }

  _registerStep() {
    // avança na direção do "heading" atual
    this.pos = {
      x: this.pos.x + Math.sin(this.heading) * this.stepLength,
      y: this.pos.y + Math.cos(this.heading) * this.stepLength,
    };
    this.onStep({ ...this.pos, heading: this.heading });
  }

  reset() { this.pos = { x: 0, y: 0 }; }
}

window.Mapping = Mapping;
window.SensorTracker = SensorTracker;
