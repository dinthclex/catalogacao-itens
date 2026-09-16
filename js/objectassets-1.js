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
 * "AGE DO MODO PADRÃO [...] SE NÃO FOR ACHADO": como não dá pra "listar a
 * pasta" de dentro do navegador (sem servidor), a única forma de saber se
 * um arquivo existe é TENTAR carregá-lo e ver se dá erro 404 — é
 * exatamente o que `_tryLoadScript` abaixo faz (`<script onerror>`) — um
 * 404 no console do navegador pra cada tipo/instância SEM arquivo próprio
 * é esperado e inofensivo (mesma técnica que `js/modelos3d.js` já usa pra
 * moldes customizados opcionais, `DB.getObjectModel`, só que aqui em cima
 * de arquivo em vez de IndexedDB).
 */
window.ObjectAssets = {
  _models: {},      // chave (tipo/'camera'/'fotopin'/'_generic') -> def registrada
  _instances: {},    // nome do objeto -> def registrada
  _modelAttempted: {}, // chave -> true (já tentou carregar, com ou sem sucesso — evita re-tentar toda hora)
  _instanceAttempted: {},

  /** Chamado pelo PRÓPRIO arquivo `assets/modelos/<chave>.model.js` ao
   *  carregar — "registra" o Modelo daquela chave. `def` pode ter
   *  `onModelSpawn(obj, ctx)` (quando o objeto entra na cena 3D) e/ou
   *  `onModelClick(obj, ctx)` (clique com o botão esquerdo — MESMO nome de
   *  método do prompt de referência do usuário). Ambos opcionais. */
  registerModel(chave, def) {
    this._models[chave] = def || {};
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
   *  `assets/modelos/<chave>.model.js` — só tenta uma vez por chave (a
   *  vida inteira da página); chamadas seguintes devolvem na hora. Devolve
   *  a def registrada (ou `undefined` se nada se registrou — tipo sem
   *  arquivo próprio, cai no `_generic` de quem chamou). */
  async ensureModelLoaded(chave) {
    if (!chave) return undefined;
    if (!this._modelAttempted[chave]) {
      this._modelAttempted[chave] = true;
      await this._tryLoadScript(`assets/modelos/${this._slug(chave)}.model.js`);
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
      // [12/09/2026] CORREÇÃO — só tenta o <script src> se o slug estiver
      // no manifesto (assets/instancias/_manifesto.js, carregado ANTES
      // deste arquivo no index.html). Sem isso, TODO objeto sem instância
      // própria (o caso normal — instância é opcional/rara) gerava um
      // "net::ERR_FILE_NOT_FOUND" no console do navegador ao ser clicado —
      // erro de REDE (não dá pra suprimir só com onerror no JS, ver
      // `_tryLoadScript`/comentário grande no topo do arquivo). Um slug
      // fora do manifesto é tratado como "já tentado, sem sucesso" sem
      // nunca disparar a requisição de rede.
      if (window.ObjectAssets._instanceManifest?.has(slug)) {
        await this._tryLoadScript(`assets/instancias/${slug}.instance.js`);
      }
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
