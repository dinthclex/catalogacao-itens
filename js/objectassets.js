/* js/objectassets.js
 * NOVO (12/09/2026) — pedido verbatim: "Faça a reescrita completa dos
 * cartões 3D hardcoded de câmera/foto para rotearem 100% pelo sistema
 * genérico de componentes. Inclusive, faça para todos os objetos em
 * 'Ferramentas'->'Objetos' [...] Todos os objetos, não só os padrão [...],
 * mas também os novos devem seguir a mesma organização. Implemente na
 * pasta 'assets/': /assets/modelos/<tipo>_model.js (Modelo — comportamento
 * padrão do TIPO) e /assets/instancias/<nome>.js (Instância — comportamento
 * só desta entidade, opcional) [...] caso o arquivo de configuração
 * daquela instância não for achado, então age do modo padrão descrito no
 * modelo padrão."
 *
 * ARQUITETURA (duas camadas, MESMO vocabulário do prompt de referência do
 * usuário — onModelSpawn/onModelClick pro Modelo, onInstanceSpawn/
 * onInstanceClick pra Instância):
 *
 *   1. MODELO (`assets/modelos/<chave>.model.js`) — comportamento PADRÃO
 *      de um TIPO inteiro de objeto (todas as câmeras, todos os pinos de
 *      foto, todas as cadeiras de um certo `tipo`, etc.). Um arquivo por
 *      chave: `camera`, `fotopin`, `_generic` (fallback universal — todo
 *      `tipo` de objeto do catálogo, fixo ou customizado, que NÃO tenha o
 *      seu próprio arquivo cai aqui) e, opcionalmente, `<tipo>.model.js`
 *      pra QUALQUER tipo específico (ex.: `gabinete.model.js`) — ver
 *      `OBJECT3D_PROFILES`/"Acessar modelos" pra a lista de tipos.
 *   2. INSTÂNCIA (`assets/instancias/<nome-do-objeto>.instance.js`) —
 *      comportamento só de UM objeto específico já colocado no mapa
 *      (`SceneObjects`/`nome`, ver js/sceneobjects.js — "Câmera.001", por
 *      exemplo), sobrepondo (não substituindo) o Modelo do tipo dele.
 *      Totalmente OPCIONAL — a imensa maioria dos objetos nunca tem um.
 *
 * DECISÃO DE ARQUITETURA TRANSPARENTE, IMPORTANTE PRA QUEM MEXER NISTO NO
 * FUTURO: o app roda 100% client-side, aberto direto via `file:///`, sem
 * servidor nenhum (mesmo requisito do prompt de referência original do
 * usuário). Isso tem UMA consequência que muda a FORMA (não a ideia) do
 * arquivo de configuração:
 *   - `fetch()`/`XMLHttpRequest` de um arquivo `file://` LOCAL é bloqueado
 *     pelo Chrome/Chromium por CORS (`Access to fetch at 'file://...' [...]
 *     has been blocked by CORS policy`) — não dá pra ler um `.json` puro
 *     (como o exemplo do pedido, `{"id": "lampada_inteligente", ...}`) de
 *     dentro do JavaScript da página quando ela mesma foi aberta como
 *     `file://`. Isso NÃO é uma limitação deste app — é do próprio Chrome,
 *     a mesma razão pela qual o prompt de referência do usuário também
 *     pedia "SEM CORS" como requisito (só é alcançável evitando fetch de
 *     arquivo local por completo).
 *   - UMA tag `<script src="assets/.../arquivo.js">` (ou criada
 *     dinamicamente via `document.createElement('script')`), por outro
 *     lado, carrega de `file://` SEM bloqueio de CORS — é exatamente assim
 *     que TODO o resto do app já funciona (`index.html` carrega `js/*.js`
 *     desse jeito há muito tempo).
 * Por isso, o "arquivo de configuração" de cada Modelo/Instância AQUI é um
 * `.js` que se AUTO-REGISTRA chamando `ObjectAssets.registerModel(...)`/
 * `ObjectAssets.registerInstance(...)` no topo do arquivo — em vez de um
 * `.json` puro seria lido por `fetch`. O CONTEÚDO/formato lógico é o MESMO
 * do exemplo do pedido (id/nome/propriedades/scripts onSpawn/onClick/
 * onUpdate) — só a "casca" (JS chamando uma função, em vez de JSON puro)
 * muda, pelo motivo técnico acima. Ver `assets/instancias/README.md` (e os
 * arquivos de exemplo em `assets/modelos/`) pro formato exato.
 *
 * [14/09/2026] NOVO — EVENTOS DE MOUSE ALÉM DO CLIQUE ESQUERDO (pedido
 * verbatim: "implementar os outros eventos de mouse do W3Schools"). Cada
 * `assets/modelos/<tipo>.model.js` agora DISPONIBILIZA (comentado, inerte
 * por padrão) um hook `onModel<Evento>` pra cada evento de mouse do
 * W3Schools (onModelDoubleClick/onModelContextmenu/onModelMouseDown/
 * onModelMouseUp/onModelMouseEnter/onModelMouseLeave/onModelMouseMove/
 * onModelMouseOut/onModelMouseOver), na mesma convenção de onModelClick.
 * SER HONESTO SOBRE O QUE REALMENTE FUNCIONA (documentado aqui pra não
 * fingir que algo dispara quando não dispara):
 *   - onModelClick/onModelDoubleClick/onModelContextmenu (+ onInstance*
 *     equivalentes) TÊM despacho real — ver `dispatchMouseEvent3D` abaixo
 *     e os listeners `dblclick`/`contextmenu` em `js/view3d.js`, que
 *     reaproveitam o MESMO raycaster de mira central usado pelo clique
 *     esquerdo comum, só trocando o evento do DOM que dispara a checagem.
 *   - onModelMouseDown/onModelMouseUp ficam só como HOOK DISPONÍVEL, SEM
 *     despacho automático — os eventos `mousedown`/`mouseup` do canvas já
 *     são usados por várias ferramentas de construção (colocar tijolo,
 *     arraste de câmera orbital, etc.) e reaproveitar o mesmo listener
 *     pra também checar "tem um objeto pickável sob a mira?" arriscaria
 *     regressão nelas sem poder testar ao vivo nesta rodada — deixado de
 *     fora de propósito, CONSERVADOR.
 *   - onModelMouseEnter/onModelMouseLeave/onModelMouseMove/onModelMouseOut/
 *     onModelMouseOver (hover contínuo) ficam só como HOOK DISPONÍVEL, SEM
 *     despacho automático — não existe hoje nenhuma infraestrutura de
 *     "rastrear qual objeto está sob o mouse a cada instante" (exigiria
 *     raycaster CONTÍNUO a cada `mousemove`, custo de desempenho relevante
 *     numa cena 3D em tempo real, e mudaria como a mira central funciona
 *     hoje) — fora do escopo desta rodada.
 *
 * "AGE DO MODO PADRÃO [...] SE NÃO FOR ACHADO": como não dá pra "listar a
 * pasta" de dentro do navegador (sem servidor), a única forma de saber se
 * um arquivo existe é TENTAR carregá-lo e ver se dá erro 404 — é
 * exatamente o que `_tryLoadScript` abaixo faz (`<script onerror>`) — um
 * 404 no console do navegador pra cada tipo/instância SEM arquivo próprio
 * é esperado e inofensivo (mesma técnica que `js/modelos3d.js` já usa pra
 * moldes customizados opcionais, `DB.getObjectModel`, só que aqui em cima
 * de arquivo em vez de IndexedDB).
 *
 * [15/09/2026] NOVO — `onModelCardButtons(entity, ctx)`: BOTÕES DO "CARD 3D"
 * CONFIGURÁVEIS PELO MODELO. Pedido verbatim do usuário: "Os botões que
 * aparecem no card ao clicar nos objetos, devem ser configuráveis via
 * script do modelo. Atualmente, só aparece no script o método
 * `_showObjectCard3D(entity)`. E não há um lugar para definir o que e
 * quais botões aparecem nesse 'card 3D'. Deve ser possível defini-lo."
 *
 * CONTEXTO — o que já existia: `assets/modelos/<tipo>.model.js` define
 * `onModelClick(entity, ctx) { ctx.view3d._showObjectCard3D(entity); }` (ou
 * deixa o clique cair no fallback automático, que chama o mesmo método) —
 * e `_showObjectCard3D`/`_showObjectCard3DBody` (js/view3d.js) montavam o
 * cartão com um conjunto de botões decidido 100% por lógica INTERNA da
 * própria função (ex.: "se `obj.tipo==='monitor'`, mostra o botão de
 * monitoramento de robôs"; "se `_modelarObjetosHabilitado`, mostra
 * 'Modelar em 3D'"). Pra um Modelo novo ganhar um botão especial, alguém
 * precisava editar `view3d.js` na mão — exatamente a limitação que esta
 * API resolve.
 *
 * ASSINATURA — igual à convenção já usada por `onModelClick`/`onModelSpawn`
 * (mesmo `entity`/`ctx`, ver `buildCtx` acima — `ctx.view3d`/`ctx.DB`/
 * `ctx.Utils`/etc já vêm prontos):
 *
 *   onModelCardButtons(entity, ctx) {
 *     return [ { label: '💻 Abrir aplicativo', title: '...' (opcional),
 *                onClick(entity, ctx) { ... } }, ... ];
 *   }
 *
 * `_showObjectCard3DBody` (js/view3d.js) chama isso ANTES de decidir os
 * botões finais, sempre com `?.` (Modelo sem essa função = comportamento
 * 100% IDÊNTICO a antes desta API existir — RETROCOMPATÍVEL por
 * construção, nenhum `.model.js` existente precisa mudar).
 *
 * DOIS FORMATOS DE RETORNO ACEITOS:
 *   1. Um ARRAY de botões extra — são ACRESCENTADOS aos botões padrão
 *      (histórico, propriedades/scripts, modelar em 3D quando ligado,
 *      etc.), sem tirar nenhum:
 *        return [{ label: '🚀 Fazer algo', onClick(entity, ctx) { ... } }];
 *
 *   2. Um OBJETO `{ remover, adicionar }` — quando o Modelo também precisa
 *      TIRAR ou SUBSTITUIR um botão PADRÃO específico (caso de uso real:
 *      trocar "💻 Abrir aplicativo: Monitoramento de Robôs", que hoje
 *      aparece automaticamente pra `tipo==='monitor'`/`'monitor2'`, por um
 *      botão diferente nesses mesmos tipos — infraestrutura pronta aqui,
 *      a TROCA em si é tarefa separada, não aplicada nesta rodada):
 *        return {
 *          remover: ['robo-app'],           // ids dos botões PADRÃO a esconder
 *          adicionar: [{ label: '🖥️ Outra coisa', onClick(entity, ctx) {} }],
 *        };
 *      IDS DOS BOTÕES PADRÃO (os únicos aceitos em `remover` hoje — ver
 *      `botoesPadrao` em `_showObjectCard3DBody`, js/view3d.js):
 *        'modelar'  — "🔧 Modelar em 3D" (só existe se "Modelar objetos" do
 *                      rodapé estiver ligado; remover não faz nada se ele já
 *                      não ia aparecer)
 *        'props'    — "⚙️ Propriedades e Scripts"
 *        'robo-app' — "💻 Abrir aplicativo: Monitoramento de Robôs" (só
 *                      existe pra `tipo==='monitor'`/`'monitor2'`)
 *      "📜 Histórico deste objeto" e "Fechar" NÃO são removíveis (estrutura
 *      fixa do cartão, não uma "ação" por tipo de objeto).
 *
 * BOTÃO EXTRA — cada item de `adicionar` é `{ label, title?, onClick }`:
 *   - `label` (string, obrigatório): texto do botão (pode incluir emoji,
 *     igual aos padrão — ex. `'💻 Abrir aplicativo'`).
 *   - `title` (string, opcional): tooltip (atributo `title` do `<button>`).
 *   - `onClick(entity, ctx)` (função, obrigatório pra fazer algo): chamada
 *     no clique, com o MESMO `entity`/`ctx` recebido por `onModelCardButtons`
 *     — dentro dela dá pra fazer qualquer coisa que um Script/Modelo já faz
 *     hoje (`ctx.view3d._openRoboMonitoringApp3D(entity)`, abrir um overlay
 *     próprio, `DB.saveMap(ctx.map)`, etc.). Erros dentro de `onClick` são
 *     capturados (não derrubam o cartão) e logados no console.
 *
 * Exemplo completo de arquivo `.model.js` usando isso:
 * `assets/modelos/_exemplo-model-botoes-customizados.txt`.
 */
/* [20/09/2026 UTC] NOTA — o comentário grande acima (e outros pontos deste
 * arquivo) fala em `assets/modelos/<chave>.model.js`, mas o NOME DE ARQUIVO
 * REAL sempre foi `assets/modelos/<chave>.config.js` (ver `ensureModelLoaded`
 * abaixo, onde isso foi corrigido) — `.model.js` nunca existiu de verdade no
 * projeto, era só como a prosa dos comentários continuou chamando o arquivo
 * depois que o nome de verdade virou `.config.js` numa rodada anterior.
 * Deixado documentado aqui em vez de reescrever cada menção antiga. */
window.ObjectAssets = {
  _models: {},      // chave (tipo/'camera'/'fotopin'/'_generic') -> def registrada
  _instances: {},    // nome do objeto -> def registrada
  _modelAttempted: {}, // chave -> true (já tentou carregar, com ou sem sucesso — evita re-tentar toda hora)
  _instanceAttempted: {},

  /** Chamado pelo PRÓPRIO arquivo `assets/modelos/<chave>.model.js` ao
   *  carregar — "registra" o Modelo daquela chave. `def` pode ter
   *  `onModelSpawn(obj, ctx)` (quando o objeto entra na cena 3D) e/ou
   *  `onModelClick(obj, ctx)` (clique com o botão esquerdo — MESMO nome de
   *  método do prompt de referência do usuário). Ambos opcionais.
   *
   *  [15/09/2026 UTC] NOVO — `def.malhaEstatica` (opcional, `true` ou uma
   *  string) — pedido verbatim: "A malha do objeto (o '.obj' dele) deve
   *  ficar em um arquivo separado e ser endereçado em '<nome-do-modelo>.
   *  model.js'". É AQUI que o `.model.js` "endereça" a malha: `true`
   *  dispara `ObjMeshSource.preload(chave)` (carrega `assets/modelos/
   *  <chave>.malha.js`, MESMO nome do tipo); uma string troca o nome do
   *  arquivo de malha (útil pra reaproveitar a mesma malha em vários
   *  tipos, ex. duas cadeiras ligeiramente diferentes mas com o MESMO
   *  '.obj'). A Promise disparada aqui é coletada por
   *  `ensureMeshesReadyForMap` (chamado por view3d.js `_rebuildScene`
   *  ANTES de `Engine3D.setScene`, ver comentário grande lá) — só ASSIM
   *  o carregamento (que aqui começa em segundo plano, sem `await`) tem
   *  garantia de terminar antes da cena precisar da geometria. Ver
   *  exemplo completo em `assets/modelos/_exemplo-model-malha-obj.txt`. */
  registerModel(chave, def) {
    this._models[chave] = def || {};
    if (def && def.malhaEstatica) {
      const nomeMalha = (typeof def.malhaEstatica === 'string') ? def.malhaEstatica : chave;
      window.ObjMeshSource?.preload(nomeMalha);
    }
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Implemente o ObjMeshSource
    // para .glb como você mencionou." MESMO gatilho de `malhaEstatica`
    // acima, só que pra malha `.glb` ESTÁTICA/embutida no projeto (ver
    // js/glbmeshsource.js) — `def.malhaGlb` (opcional, `true` ou uma
    // string) dispara `GlbMeshSource.preload(chave)` (carrega
    // `assets/modelos/<chave>.glb.js`, mesmo nome do tipo, a menos que uma
    // string troque o nome do arquivo). Nenhum tipo do catálogo usa isso
    // hoje (nenhum `.model.js` tem `malhaGlb` — precisaria ser adicionado
    // manualmente em luminaria.model.js/poste.model.js/relogio.model.js
    // pra usar os `.glb` já gerados; isso não foi feito automaticamente).
    if (def && def.malhaGlb) {
      const nomeGlb = (typeof def.malhaGlb === 'string') ? def.malhaGlb : chave;
      window.GlbMeshSource?.preload(nomeGlb);
    }
  },

  /** Chamado pelo PRÓPRIO arquivo `assets/instancias/<nome>.instance.js`
   *  ao carregar — "registra" a Instância daquele nome de objeto
   *  (`SceneObjects`/`entity.nome`). `def` pode ter `onInstanceSpawn`/
   *  `onInstanceClick` — MESMOS nomes do prompt de referência. */
  registerInstance(nome, def) {
    this._instances[nome] = def || {};
  },

  /** Slug de nome de arquivo — nomes de objeto podem ter espaços/acentos
   *  (ex.: "Câmera.001") que não são ideais em nome de arquivo; troca por
   *  algo seguro e determinístico (mesmo nome sempre vira o mesmo slug). */
  _slug(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
      .replace(/[^a-zA-Z0-9._-]+/g, '_');
  },

  /** Injeta `<script src="url">` e resolve a Promise em QUALQUER caso
   *  (sucesso OU 404/erro) — quem chama decide o que fazer depois olhando
   *  se algo foi registrado ou não (ver `ensureModelLoaded`/
   *  `ensureInstanceLoaded`). Nunca rejeita — um arquivo ausente é uma
   *  situação NORMAL/esperada (ver comentário grande no topo do arquivo),
   *  não uma falha. */
  _tryLoadScript(url) {
    return new Promise((resolve) => {
      const el = document.createElement('script');
      el.src = url;
      el.onload = () => resolve(true);
      el.onerror = () => resolve(false);
      document.head.appendChild(el);
    });
  },

  /** Garante que o Modelo de `chave` (tipo de objeto, ou 'camera'/
   *  'fotopin'/'_generic') já foi TENTADO carregar de
   *  `assets/modelos/js/<chave>.config.js` — só tenta uma vez por chave (a
   *  vida inteira da página); chamadas seguintes devolvem na hora. Devolve
   *  a def registrada (ou `undefined` se nada se registrou — tipo sem
   *  arquivo próprio, cai no `_generic` de quem chamou).
   *  [20/09/2026 UTC] CORRIGIDO — pedido verbatim (achado numa varredura de
   *  arquivos órfãos): esta função buscava `assets/modelos/<chave>.model.js`,
   *  um nome de arquivo que NUNCA existiu neste projeto (os arquivos reais
   *  sempre se chamaram `<chave>.config.js`, ver `mesa.config.js` etc. —
   *  `registerModel` abaixo já esperava exatamente esse formato de `def`,
   *  só o NOME do arquivo buscado estava errado). Resultado: todo carregamento
   *  de Modelo dava 404 silencioso e caía sempre no fallback `_generic`,
   *  mesmo quando um `.config.js` de verdade existia pro tipo — os hooks
   *  onModelSpawn/onModelClick/onModelCardButtons/malhaEstatica/malhaGlb de
   *  cada `<tipo>.config.js` nunca rodavam. Caminho também atualizado pra
   *  `assets/modelos/js/` (reorganização de pastas desta rodada — ver
   *  `js/objmeshsource.js`, que já busca `.malha.js` no mesmo lugar novo). */
  async ensureModelLoaded(chave) {
    if (!chave) return undefined;
    if (!this._modelAttempted[chave]) {
      this._modelAttempted[chave] = true;
      await this._tryLoadScript(`assets/modelos/js/${this._slug(chave)}.config.js`);
    }
    return this._models[chave];
  },

  /** Mesma ideia de `ensureModelLoaded`, pra Instância — arquivo
   *  `assets/instancias/<nome-do-objeto>.instance.js`. */
  async ensureInstanceLoaded(nome) {
    if (!nome) return undefined;
    if (!this._instanceAttempted[nome]) {
      this._instanceAttempted[nome] = true;
      const slug = this._slug(nome);
      await this._tryLoadScript(`assets/instancias/${slug}.instance.js`);
    }
    return this._instances[nome];
  },

  /** Leitura SÍNCRONA do cache — usada no instante do clique (não dá pra
   *  `await` no meio de um handler de raycaster sem atrasar a resposta ao
   *  clique). Pode devolver `undefined` se ainda não tiver sido carregado
   *  (ver `warmupModelsForMap`, chamado na entrada do "Ver em 3D", que
   *  pré-carrega os tipos presentes no mapa ANTES do usuário poder clicar
   *  em qualquer coisa). */
  getModel(chave) { return this._models[chave]; },
  getInstance(nome) { return this._instances[nome]; },

  /** Chamado UMA VEZ, ao entrar no "Ver em 3D" (ver view3d.js `mount()`),
   *  pra pré-carregar (em paralelo, sem travar a entrada na tela) o Modelo
   *  de TODO `tipo` de objeto realmente presente no mapa atual — assim,
   *  no instante em que o usuário clica em algo, o cache já está quente
   *  (`getModel` síncrono já acha, sem precisar esperar um `fetch`/
   *  `<script>` no meio do clique). Objetos de um tipo criado DEPOIS de já
   *  estar no "Ver em 3D" (ex.: colocado com a ferramenta de construção)
   *  ainda funcionam — só que o 1º clique nesse tipo específico usa o
   *  `_generic` (ou o Modelo, se já tiver terminado de carregar a tempo) e
   *  os cliques seguintes já pegam o cache quente. 'camera'/'fotopin' são
   *  sempre incluídos (todo mapa pode ter câmera/foto vinculada). */
  async warmupModelsForMap(map) {
    const chaves = new Set(['camera', 'fotopin', '_generic']);
    for (const obj of (map?.objects || [])) { if (obj?.tipo) chaves.add(obj.tipo); }
    await Promise.all([...chaves].map((c) => this.ensureModelLoaded(c)));
  },

  /** [15/09/2026 UTC] NOVO — ver comentário grande em `registerModel`
   *  (campo `malhaEstatica`) e no topo de `js/objmeshsource.js`. Diferente
   *  de `warmupModelsForMap` (que é "dispara e esquece", só pro CLIQUE
   *  ficar rápido — ver comentário dela), esta função é AWAITED de
   *  propósito por `view3d.js` `_rebuildScene`, no MESMO ponto e MESMO
   *  espírito de `await Model3DLoader.preloadAll()`: `Engine3D.setScene`
   *  é síncrono e decide, objeto a objeto, se já existe uma malha `.obj`
   *  estática pronta (`ObjMeshSource.hasModel`) — sem esperar aqui, a 1ª
   *  renderização sempre cairia no fallback procedural mesmo com o
   *  arquivo existindo (carregamento ainda em andamento). Passos: (1)
   *  garante que TODO `.model.js` relevante ao mapa já rodou (é ele quem
   *  DISPARA o `ObjMeshSource.preload` de cada malha, via
   *  `registerModel`/`malhaEstatica`); (2) só DEPOIS espera essas
   *  malhas terminarem de carregar (`ObjMeshSource.awaitAllPending`) —
   *  a ordem importa, um `.model.js` que ainda não rodou não teria
   *  disparado preload nenhum pra esperar. */
  async ensureMeshesReadyForMap(map) {
    const chaves = new Set(['camera', 'fotopin', '_generic']);
    for (const obj of (map?.objects || [])) { if (obj?.tipo) chaves.add(obj.tipo); }
    await Promise.all([...chaves].map((c) => this.ensureModelLoaded(c)));
    await window.ObjMeshSource?.awaitAllPending?.();
    // [16/09/2026 UTC] NOVO — ver `registerModel`/`def.malhaGlb` acima.
    await window.GlbMeshSource?.awaitAllPending?.();
  },

  /** FUNIL ÚNICO de "o que acontece ao clicar com o botão esquerdo num
   *  objeto pickável em 3D" — pedido verbatim: "rotearem 100% pelo sistema
   *  genérico de componentes [...] todos os objetos [...] devem seguir a
   *  mesma organização." Chamado por `view3d.js` no lugar do antigo
   *  `if (hit.type==='camera') this._showCameraCard3D(...)`/etc. inline.
   *  Prioridade (Instância > Modelo do tipo específico > Modelo
   *  `_generic`) — MESMA ordem "modelo vs. instância" do prompt de
   *  referência do usuário ("scripts [...] executados em conjunto ou
   *  sobrepondo os scripts do modelo base"). `chave` é 'camera'/'fotopin'/
   *  `obj.tipo||'_generic'`; `entity` é a referência real do objeto
   *  (`hit.ref`); `ctx` é `{view3d, DB, Utils, map}` — MESMA convenção de
   *  parâmetros já usada por `Components`/`Scripting` no resto do app.
   *  SÍNCRONA (lê só o cache já quente — ver `warmupModelsForMap`) — mas
   *  também DISPARA (sem esperar) `ensureModelLoaded`/`ensureInstanceLoaded`
   *  em segundo plano, pra um arquivo adicionado DEPOIS (ou um tipo que
   *  não estava no mapa no momento do warmup) já valer no PRÓXIMO clique. */
  dispatchClick3D(chave, entity, ctx) {
    // Dispara/atualiza o cache em segundo plano pro próximo clique (nunca
    // bloqueia este clique — ver comentário grande acima).
    this.ensureModelLoaded(chave);
    if (entity?.nome) this.ensureInstanceLoaded(entity.nome);

    const instDef = entity?.nome ? this._instances[entity.nome] : undefined;
    if (instDef && typeof instDef.onInstanceClick === 'function') {
      instDef.onInstanceClick(entity, this.buildCtx(ctx));
      return true;
    }
    const modelDef = this._models[chave] || this._models['_generic'];
    if (modelDef && typeof modelDef.onModelClick === 'function') {
      modelDef.onModelClick(entity, this.buildCtx(ctx));
      return true;
    }
    return false; // nem instância nem modelo (nem sequer o _generic) sabiam o que fazer — quem chamou decide um último fallback, se quiser
  },

  /** [14/09/2026] NOVO — pedido verbatim: "implementar os outros eventos de
   *  mouse do W3Schools" nos arquivos de modelo (onModelDoubleClick/
   *  onModelContextmenu/onModelMouseDown/etc., ver assets/modelos/*.model.js).
   *  Generalização de `dispatchClick3D` acima pra QUALQUER evento discreto
   *  de mouse — `evento` é o sufixo do nome do método (ex.: `'DoubleClick'`
   *  chama `onInstanceDoubleClick`/`onModelDoubleClick`). `dispatchClick3D`
   *  continua existindo separado (não delega pra este) só por já estar em
   *  produção e testado — este método novo é usado por view3d.js pros
   *  eventos ADICIONADOS agora (duplo clique / botão direito), que
   *  reaproveitam o MESMO raycaster de mira central de sempre, só trocando
   *  o evento do DOM que dispara a checagem (ver comentário grande no topo
   *  deste arquivo e em view3d.js `onDblClick`/`onContextMenu`).
   *  DECISÃO DE ESCOPO (documentada aqui e em cada assets/modelos/*.model.js):
   *  só os eventos DISCRETOS de baixo risco (duplo clique, botão direito —
   *  e, no futuro, mousedown/mouseup se algum dia valer o risco de mexer
   *  nos listeners de ferramenta de construção que já usam esses mesmos
   *  eventos do canvas) ganham despacho de verdade aqui. Hover contínuo
   *  (mouseenter/mouseleave/mousemove/mouseout/mouseover) NÃO tem
   *  despacho — não existe hoje infraestrutura de "rastrear qual objeto
   *  está sob o mouse a cada frame" (exigiria raycaster contínuo a cada
   *  `mousemove`, custo de desempenho relevante numa cena 3D em tempo
   *  real) — esses hooks ficam só DISPONÍVEIS nos arquivos de modelo, sem
   *  fingir que funcionam. */
  dispatchMouseEvent3D(evento, chave, entity, ctx) {
    const instDef = entity?.nome ? this._instances[entity.nome] : undefined;
    const instFn = instDef && instDef[`onInstance${evento}`];
    if (typeof instFn === 'function') { instFn(entity, this.buildCtx(ctx)); return true; }
    const modelDef = this._models[chave] || this._models['_generic'];
    const modelFn = modelDef && modelDef[`onModel${evento}`];
    if (typeof modelFn === 'function') { modelFn(entity, this.buildCtx(ctx)); return true; }
    return false;
  },

  /* =====================================================================
   * [14/09/2026] NOVO — pedido verbatim: "Faça um jeito de integrar os
   * scripts de objeto com o que acabamos de fazer." Os "scripts de
   * objeto" são o sistema já existente `js/components.js`/
   * `js/scripting.js`/`js/sceneobjects.js` (ScriptComponent/
   * EventTriggerComponent/SceneEventBus, `entity.components` — o que o
   * usuário via UI configura em "🧩 Editar componentes…"/"⚙️ Comportamento
   * padrão"). Duas pontas de integração, deliberadamente pequenas e
   * aditivas (sem reescrever nenhum dos dois sistemas):
   *
   *   A) `ctx` — o objeto de contexto passado a TODO
   *      onModelClick/onInstanceClick/onModelSpawn/onInstanceSpawn agora
   *      SEMPRE inclui `Components`/`Scripting`/`SceneObjects`/
   *      `SceneEventBus`/`ObjectStandard` (além de `view3d`/`DB`/`Utils`/
   *      `map`, já existentes) — ver `buildCtx` abaixo. Isso deixa
   *      QUALQUER arquivo de assets/modelos|instancias/ livre pra ler/
   *      escrever `entity.components` (ex.: `ctx.Components.addComponent`),
   *      emitir eventos (`ctx.SceneEventBus.emit('onClick', entity, {},
   *      ctx)` — MESMA assinatura que view3d.js já usa) ou olhar outros
   *      objetos por nome (`ctx.SceneObjects.byName(ctx.map, 'Parede.003')`)
   *      — sem precisar duplicar nenhuma dessas APIs.
   *   B) `dispatchSpawn3D` (novo, abaixo) — chama `onModelSpawn`/
   *      `onInstanceSpawn` (que já existiam como "gancho reservado", nunca
   *      efetivamente disparado antes desta rodada) pra cada
   *      câmera/objeto/foto assim que a cena 3D é (re)construída (ver
   *      `view3d.js` `_rebuildScene`/`_dispatchSpawnAll3D`). Isso é o
   *      lugar CERTO pra um Modelo "semear" comportamento padrão de
   *      verdade em código — ex.: `assets/modelos/<tipo>.model.js` pode,
   *      no `onModelSpawn`, chamar `ctx.Components.addComponent(entity,
   *      'Script', {code: '...'})` SE `entity.components` ainda estiver
   *      vazio — um 2º caminho (via código) pra "todo objeto novo deste
   *      tipo já nasce com tal comportamento", complementando (não
   *      substituindo) o caminho já existente via UI/DB
   *      (`ObjectStandard.applyDefaultComponents`, aplicado na CRIAÇÃO do
   *      objeto em js/mapping.js — este aqui roda toda vez que a cena 3D
   *      é montada/reconstruída, útil pra objetos JÁ existentes que ainda
   *      não tinham esse componente). Ver `assets/modelos/camera.model.js`
   *      pra um exemplo concreto funcionando.
   * ===================================================================== */

  /** Monta o `ctx` completo a partir do que `view3d.js` já monta
   *  (`{view3d, DB, Utils, map}`) — nunca sobrescreve uma chave que quem
   *  chamou já tenha passado explicitamente (permite um teste/mock passar
   *  suas próprias versões, como os testes ao vivo já feitos nesta
   *  rodada). */
  buildCtx(base) {
    return {
      Components: window.Components,
      Scripting: window.Scripting,
      SceneObjects: window.SceneObjects,
      SceneEventBus: window.SceneEventBus,
      ObjectStandard: window.ObjectStandard,
      // [13/09/2026] NOVO — ver js/relogio-mundo.js. Já é acessível como
      // `window.RelogioMundo`/`RelogioMundo` de dentro de QUALQUER Script
      // sem isto (globals já ficam visíveis, ver comentário lá), mas
      // adicionado aqui também por consistência de estilo com as outras
      // chaves de `ctx` (onModelSpawn/onModelClick recebem `ctx`, não
      // globals soltos).
      RelogioMundo: window.RelogioMundo,
      ...base,
    };
  },

  // Nomes já tentados pra spawn (evita rodar onModelSpawn/onInstanceSpawn
  // mais de uma vez pro MESMO objeto a cada reconstrução da cena — ver
  // `dispatchSpawnAll3D`/`_rebuildScene`). Chave = `entity.nome` (ou, na
  // falta dele — não deveria acontecer, todo pickable tem nome — `entity`
  // por identidade, via WeakSet separado).
  _spawnedNamed: new Set(),
  _spawnedRefs: new WeakSet(),

  /** Chama `onModelSpawn`/`onInstanceSpawn` (nesta ordem — modelo primeiro,
   *  igual ao prompt de referência do usuário: "executados em conjunto")
   *  pra UM objeto, uma única vez na vida da página por objeto (ver
   *  `_spawnedNamed`/`_spawnedRefs` acima) — idempotente entre
   *  reconstruções de cena (`_rebuildScene` roda de novo toda vez que uma
   *  camada muda, um objeto é movido, etc.; sem essa guarda, um
   *  `onModelSpawn` que soma histórico/adiciona componente rodaria de novo
   *  a cada rebuild). SÍNCRONA — só dispara efeito se o Modelo/Instância
   *  já estiverem no cache (ver `warmupModelsForMap`); um tipo que ainda
   *  não terminou de carregar simplesmente não dispara spawn nesta
   *  passada (o `onModelSpawn` de um Modelo é sempre opcional/idempotente
   *  por natureza — não há problema em "perder" uma passada ocasional). */
  dispatchSpawn3D(chave, entity, ctx) {
    const key = entity?.nome;
    if (key ? this._spawnedNamed.has(key) : this._spawnedRefs.has(entity)) return;
    if (key) this._spawnedNamed.add(key); else this._spawnedRefs.add(entity);
    const fullCtx = this.buildCtx(ctx);
    const modelDef = this._models[chave] || this._models['_generic'];
    if (modelDef && typeof modelDef.onModelSpawn === 'function') {
      try { modelDef.onModelSpawn(entity, fullCtx); } catch (err) { console.error('[ObjectAssets] erro em onModelSpawn', chave, err); }
    }
    const instDef = key ? this._instances[key] : undefined;
    if (instDef && typeof instDef.onInstanceSpawn === 'function') {
      try { instDef.onInstanceSpawn(entity, fullCtx); } catch (err) { console.error('[ObjectAssets] erro em onInstanceSpawn', key, err); }
    }
  },

  /** Chamado por `view3d.js` `_dispatchSpawnAll3D` depois de TODA
   *  (re)construção da cena 3D — percorre câmeras/objetos/fotos do mapa e
   *  chama `dispatchSpawn3D` pra cada um (a guarda `_spawnedNamed` acima
   *  garante que só faz efeito de verdade na 1ª vez de cada objeto). */
  dispatchSpawnAllForMap(map, ctx) {
    for (const cam of (map?.cameras || [])) this.dispatchSpawn3D('camera', cam, ctx);
    for (const foto of (map?.fotos || [])) this.dispatchSpawn3D('fotopin', foto, ctx);
    for (const obj of (map?.objects || [])) this.dispatchSpawn3D(obj?.tipo || '_generic', obj, ctx);
  },
};
