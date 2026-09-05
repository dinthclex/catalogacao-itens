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
      cameras: [],
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

  /** Garante que um mapa carregado de ANTES desta versão (sem `cameras`/
   *  `objects`/`textos`/`layers`) tenha essas listas — sem isto, todo código
   *  que assume `map.cameras`/`map.objects`/`map.textos`/`map.layers` como
   *  array precisaria checar `|| []` em todo lugar. Chamado ao selecionar/
   *  carregar um ambiente no editor.
   *
   *  Camadas (ver mapview.js — botão "🗂️ Camadas"): paredes, pontos,
   *  câmeras, objetos e textos têm um `layerId` opcional; sem uma camada
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
    if (!map.cameras) map.cameras = [];
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

  /** Garante que TODO elemento "layerável" do `map` (parede/ponto/câmera/
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
    ['walls', 'points', 'cameras', 'objects', 'textos', 'portas', 'janelas', 'medidas2d', 'tracos2d'].forEach((campo) => {
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
  // câmera/objeto/texto (ver addWall/addCamera/addObject/addText, que
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
   * Devolve uma CÓPIA rasa do mapa com paredes/portas/janelas/câmeras/
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
      cameras: filtra(map.cameras),
      textos: filtra(map.textos),
      itens: filtra(map.itens),
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
    ['walls', 'points', 'cameras', 'objects', 'textos', 'portas', 'janelas'].forEach((campo) => {
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
    return ['walls', 'points', 'cameras', 'objects', 'textos', 'portas', 'janelas']
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
    const prefixos = { walls: 'wall', points: 'pt', cameras: 'cam', objects: 'obj', textos: 'txt', portas: 'porta', janelas: 'janela' };
    // Cópias de porta/janela mantêm o `parentWallId` ORIGINAL (não remapeado
    // pra uma eventual cópia da parede feita nesta mesma operação) — caso
    // raro (duplicar uma camada que tem parede E porta/janela filha dela ao
    // mesmo tempo); resultado ainda é válido (a cópia fica ligada à parede
    // original), só não "acompanha" a parede duplicada — aceitável por ora.
    ['walls', 'points', 'cameras', 'objects', 'textos', 'portas', 'janelas'].forEach((campo) => {
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
    ['walls', 'points', 'cameras', 'objects', 'textos', 'portas', 'janelas'].forEach((campo) => {
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
    (map.cameras || []).forEach((c) => consider(c.x, c.y));
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
    const t = { id: Utils.uid('txt'), x, y, content, cor: '#ffffff', tamanho: 14, piso: 0, criadoEm: DB.nowISO(), ...extra };
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
    // paredes/portas/janelas ganham piso, antes só objetos/câmeras tinham).
    // Até esta rodada, paredes eram floor-agnostic (apareciam iguais em
    // qualquer andar) — agora cada parede pertence a UM piso (mesma unidade
    // de sempre: inteiro, andar térreo = 0, ver `obj.piso` em addObject
    // abaixo). No 2D (Map2DRenderer) isso ainda NÃO filtra nada de propósito
    // (decisão do usuário, mesma pergunta: sem seletor de andar no editor
    // 2D nesta rodada — todo andar continua desenhado sobreposto, como
    // sempre foi) — o campo existe pra alimentar o NOVO formato de texto
    // (js/maptxt.js) e o empilhamento em altura no 3D (engine3d.js, mesmo
    // mecanismo `piso*2.8` que objetos já usam), não pra mudar o 2D agora.
    const wall = { id: Utils.uid('wall'), x1, y1, x2, y2, height: 2.6, espessura: 0.12, colorRGB: null, tipo: 'padrao', piso: 0, ...extra };
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
      x, y, angulo: 0, alturaPeitoril: 0, largura: 0.8, altura: 2.1,
      tipo: 'padrao', abertura: 'direita', // 'abertura': lado da dobradiça/sentido do arco de abrir (ver mapview.js render — arco tracejado)
      // 'aberta': só afeta o 3D — FECHADA (padrão) não corta buraco nenhum na
      // parede-mãe; ABERTA corta (ver engine3d.js setScene) — "se estiverem
      // fechadas, não fica o buraco. Se estiverem abertas, fica o buraco na
      // parede" (pedido do usuário). No 2D não muda nada visualmente (vista
      // de cima não representa isso).
      aberta: false,
      colorRGB: null, layerId: null, criadoEm: DB.nowISO(), ...extra,
    };
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
      x, y, angulo: 0, alturaPeitoril: 1.0, largura: 1.2, altura: 1.2,
      tipo: 'padrao', grade: false, bandeira: false, // grade: grelha de proteção (só visual); bandeira: variante com bandeira/transom (só abre o topo)
      aberta: false, // só afeta o 3D — ver comentário em addDoor acima
      colorRGB: null, layerId: null, criadoEm: DB.nowISO(), ...extra,
    };
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

  // ---------- Câmeras: posição, direção (ângulo em radianos, 0 = eixo X),
  // campo de visão (FOV, radianos) e, opcionalmente, uma foto associada
  // (fotoId — de uma foto de qualquer ambiente, ver AmbientePhotos). ----------
  addCamera(map, x, y, extra = {}) {
    if (!map.cameras) map.cameras = [];
    const cam = { id: Utils.uid('cam'), x, y, angulo: 0, fov: Math.PI / 3, piso: 0, fotoId: null, criadoEm: DB.nowISO(), ...extra };
    map.cameras.push(cam);
    this.recalcBounds(map);
    return cam;
  },
  removeCamera(map, id) {
    map.cameras = (map.cameras || []).filter((c) => c.id !== id);
    this.recalcBounds(map);
  },
  updateCamera(map, id, patch) {
    const cam = (map.cameras || []).find((c) => c.id === id);
    if (!cam) return null;
    Object.assign(cam, patch);
    this.recalcBounds(map);
    return cam;
  },

  /** Marca UMA câmera (por id) como a responsável por dar a perspectiva
   *  inicial da visualização 3D (botão "🎥 Ver em 3D a partir desta câmera",
   *  no submenu da câmera no mapa 2D — ver mapview.js) — ativação exclusiva:
   *  desliga `ativo3D` de qualquer outra câmera deste mapa antes de ligar na
   *  escolhida. Passar `id` null/vazio só desativa todas (nenhuma câmera
   *  define a perspectiva — View3D usa a posição padrão). */
  setCamera3DAtiva(map, id) {
    (map.cameras || []).forEach((c) => { c.ativo3D = !!id && c.id === id; });
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
  addObject(map, x, y, tipo, extra = {}) {
    if (!map.objects) map.objects = [];
    const obj = { id: Utils.uid('obj'), x, y, tipo, piso: 0, angulo: 0, criadoEm: DB.nowISO(), ...extra };
    // Luminária: fica no TETO por padrão (3m do chão) quando quem chamou não
    // já mandou uma elevação própria — a hotbar 3D já manda a elevação
    // calculada pela mira + 3m (ver view3d.js _placeWithBuildTool/
    // raycastSurface em engine3d.js), então só entra aqui pelo painel 2D
    // (sem noção de "mirar" — sempre teto). Pedido do usuário: "por padrão,
    // ela fica a 3 metros do chão".
    if (tipo === 'luminaria' && typeof obj.elevacao !== 'number') obj.elevacao = 3.0;
    this.applyDefaultShapeToObject(obj);
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
   *  um degrau de cada vez, sem precisar pular. */
  objectTopHeightAt(o, x, y) {
    if (o.tipo !== 'escada') return this.objectTopHeight(o);
    const elevacao = o.elevacao || 0;
    const profundidadeTotal = Math.max(0.05, o.profundidade || 3.0);
    const alturaTotal = 2.0; // fixa — mesmo valor/motivo de engine3d.js _buildEscadaMesh
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
    map.objects = (map.objects || []).filter((o) => o.id !== id);
    this.recalcBounds(map);
  },
  updateObject(map, id, patch) {
    const obj = (map.objects || []).find((o) => o.id === id);
    if (!obj) return null;
    Object.assign(obj, patch);
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
   *    mapa (`walls`, `points`, `cameras`, `objects`, `textos`);
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
    (map?.cameras || []).forEach((c) => consider(c.x, c.y));
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
