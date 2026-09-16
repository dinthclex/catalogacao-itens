/* js/components.js
 * [11/09/2026] NOVO — Arquitetura de Componentes do Inspector (estilo Unity),
 * pedido verbatim do usuário: "Sobre o script [...] Separe os Gatilhos em
 * um Sistema de Eventos [...] Implemente Campos Serializados (Inspector)
 * [...] Permita Múltiplos Componentes (Add Component)."
 *
 * [11/09/2026 — MESMO DIA, RODADA SEGUINTE] REESCRITO — pedido verbatim do
 * usuário: "Sobre os scripts, elimine tudo do projeto que é legado, por
 * exemplo, o 'Script legado (compatibilidade)'. O app está em construção
 * ainda. Sobre a interface, todas aquelas opções clicáveis geram um código
 * por trás. Deve ser possível acessar a 'folha' de códigos. Deve ser
 * possível colocar vários scripts em um mesmo objeto [...]. Quando uma
 * 'folha' for gerada do zero [...] ela deve ter a estrutura Start(){},
 * Update(){} com comentário acima de cada uma [...]. Um exemplo comentado
 * (/**\/) de código já deve ser carregado [...]."
 *
 * PIVOT DE ARQUITETURA (documentado aqui de propósito, pra próxima sessão
 * não se confundir lendo código velho): a rodada anterior tinha um
 * `ScriptRegistry` de CLASSES pré-compiladas (`scriptId` + `props`
 * tipadas por `static properties`, Inspector automático por tipo) — e um
 * script de COMPATIBILIDADE (`LegacyRawScript`) que rodava o `scriptCode`
 * bruto antigo dos objetos via `Scripting.run`, mais uma migração
 * PREGUIÇOSA em `ensureComponents` que sintetizava componentes a partir de
 * `scriptCode`/`scriptAtivarAoClicar`/`scriptAtivarAoAproximar`/
 * `scriptRaioAproximacao`. TUDO ISSO FOI REMOVIDO NESTA RODADA — pedido
 * explícito "elimine tudo do projeto que é legado" + "o app está em
 * construção ainda" (ou seja: sem necessidade de preservar dados antigos).
 * Mapas salvos com esses campos legados simplesmente NÃO migram mais
 * sozinhos — os campos ficam lá, inertes, sem UI/runtime que os leia.
 *
 * NO LUGAR: TODO `ScriptComponent` guarda seu comportamento como uma
 * "folha de código" de verdade — uma string `code` de JavaScript, sempre
 * visível/editável (nunca uma classe opaca por trás de um `scriptId`).
 * `TrocarCor`/`AlternarVisibilidade` (exemplos da rodada anterior)
 * continuam existindo, mas agora só como TEXTO de partida (`SCRIPT_
 * TEMPLATES`) que o usuário pode escolher ao criar um componente — o
 * `code` resultante é 100% legível/editável, nunca uma referência a uma
 * classe interna.
 *
 * EXECUTOR GENÉRICO: `code` é compilado (uma vez, com cache — ver
 * `_getOrCreateModule` abaixo) num "módulo" com as funções de nível
 * superior que o texto declarar (`function NomeQualquer() {...}`) — os
 * nomes são achados por uma extração simples de texto (`extractFunctionNames`,
 * uma regex, não um parser de verdade — suficiente pro caso de uso: o
 * usuário escreve `function Start() {}`/`function Update() {}`/funções
 * próprias com nomes de sua escolha). O CICLO DE VIDA automático (spec
 * desta rodada) chama `Start()` uma vez e `Update(dt)` a cada quadro, pra
 * TODO `ScriptComponent` ativo de TODA entidade com posição no mapa —
 * fecha de vez o gap "onUpdate sem dispatcher por quadro" documentado no
 * fim da rodada anterior (`claude/status-component-inspector.md`, seção
 * "O que NÃO foi feito"), sem precisar de um EventTrigger configurado pra
 * isso — igual ao Unity de verdade (MonoBehaviour.Start/Update rodam
 * sozinhos, não são "eventos" que precisam de fiação externa).
 *
 * O SISTEMA DE EVENTOS (`EventTriggerComponent`/`SceneEventBus`/
 * `EVENT_CATALOG`) NÃO é legado — é o sistema de gatilhos configuráveis da
 * rodada anterior, mantido 100% (pedido verbatim: "isso não é legado, é o
 * sistema de eventos que já está funcionando"). Só o "qual método chamar"
 * de uma ação mudou de fonte: antes vinha de `ScriptClass.publicMethods`
 * (lista fixa por classe), agora vem de `extractFunctionNames(code)` do
 * `ScriptComponent` alvo (qualquer função de nível superior que o usuário
 * escrever na folha, incluindo `Start`/`Update`, pode ser chamada por uma
 * ação de evento também, além de rodar sozinha pelo ciclo de vida).
 *
 * ---------------------------------------------------------------------
 * ÍNDICE DESTE ARQUIVO
 * ---------------------------------------------------------------------
 * - Component/ScriptComponent/EventTriggerComponent : classes de shape
 *   (documentam o formato dos objetos PLANOS de verdade — ver nota de
 *   serialização abaixo, mesma decisão de design da rodada anterior).
 * - ComponentRegistry     : type name ('Script'|'EventTrigger') -> metadados
 *                           (label/ícone), usado só pela UI.
 * - SCRIPT_TEMPLATES / DEFAULT_SCRIPT_CODE : textos de partida pra uma
 *   folha de código nova (item 4/5 do pedido desta rodada).
 * - extractFunctionNames  : acha `function Nome(...) {}` de nível superior
 *   no texto de uma folha — usado tanto pelo executor quanto pela UI
 *   (dropdown "qual método chamar" de uma ação de EventTrigger).
 * - EVENT_CATALOG         : catálogo de eventos suportados (onClick/
 *                           onProximityEnter/onProximityExit/onStart/
 *                           onUpdate) — mantido da rodada anterior.
 * - window.Components     : fachada pública — `ensureComponents(entity)`
 *                           (só garante o array, SEM migração legada),
 *                           `addComponent`/`removeComponent`,
 *                           `getScriptComponents`, `invokeScriptComponent`,
 *                           `tickEntity` (NOVO — ciclo de vida automático
 *                           Start/Update).
 * - window.SceneEventBus  : inalterado na forma — `emit(eventName,
 *                           sceneObject, payload, ctx)`.
 *
 * ---------------------------------------------------------------------
 * NOTA DE SERIALIZAÇÃO (mantida da rodada anterior, ainda vale)
 * ---------------------------------------------------------------------
 * `entity.components` é gravado DENTRO do objeto do mapa, serializado
 * inteiro (JSON) para salvar (DB.saveMap/Mapping). O "módulo" compilado de
 * um `ScriptComponent` (o resultado de rodar `code`, com closures/estado
 * próprio) NUNCA é gravado em `compData` — fica só num `WeakMap` local
 * deste módulo, chaveado pelo próprio objeto `compData` (mesma referência,
 * não clonada). `compData` continua 100% dado simples (id/type/enabled/
 * code, ou id/type/enabled/events).
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Component (classe base) — só documenta o shape (ver nota acima; o
  // runtime/UI manipulam objetos planos `{id,type,enabled,...}` direto).
  // ---------------------------------------------------------------------
  class Component {
    constructor(data = {}) {
      this.id = data.id || Utils_uuid();
      this.enabled = data.enabled !== false;
    }
    toJSON() {
      return { id: this.id, type: this.type, enabled: this.enabled };
    }
  }

  // ---------------------------------------------------------------------
  // ScriptComponent — [11/09/2026 REESCRITO] guarda a "folha de código"
  // (`code`, string de JavaScript, SEMPRE o comportamento de verdade —
  // nunca uma referência a uma classe pré-compilada/opaca).
  // ---------------------------------------------------------------------
  class ScriptComponent extends Component {
    constructor(data = {}) {
      super(data);
      this.type = 'Script';
      this.code = typeof data.code === 'string' ? data.code : '';
    }
    toJSON() {
      return { ...super.toJSON(), code: this.code };
    }
  }

  // ---------------------------------------------------------------------
  // EventTriggerComponent — inalterado da rodada anterior (NÃO é legado —
  // é o sistema de eventos configuráveis já funcionando).
  // events: [{ event, radius?, actions: [{targetComponentId, method, args}] }]
  // ---------------------------------------------------------------------
  class EventTriggerComponent extends Component {
    constructor(data = {}) {
      super(data);
      this.type = 'EventTrigger';
      this.events = Array.isArray(data.events) ? data.events.map((e) => ({
        event: e.event,
        radius: e.radius,
        actions: Array.isArray(e.actions) ? e.actions.map((a) => ({ targetComponentId: a.targetComponentId, method: a.method, args: a.args || [] })) : [],
      })) : [];
    }
    toJSON() {
      return { ...super.toJSON(), events: this.events };
    }
  }

  function Utils_uuid() {
    return window.Utils?.uuid?.() || ('cmp_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  }

  // ---------------------------------------------------------------------
  // ComponentRegistry — tipos de componente anexáveis (só usado pela UI
  // pra rótulo/ícone — "➕ Adicionar Componente" continua oferecendo
  // 'Script'/'EventTrigger').
  // ---------------------------------------------------------------------
  const ComponentRegistry = {
    _types: {},
    register(type, def) { this._types[type] = def; },
    get(type) { return this._types[type] || null; },
    list() { return Object.keys(this._types).map((k) => ({ type: k, ...this._types[k] })); },
  };
  ComponentRegistry.register('Script', { label: 'Script', icon: '🎬', ctor: ScriptComponent });
  ComponentRegistry.register('EventTrigger', { label: 'Gatilho de Evento', icon: '⚡', ctor: EventTriggerComponent });

  // ---------------------------------------------------------------------
  // [11/09/2026] NOVO — DEFAULT_SCRIPT_CODE: a estrutura EXATA pedida pelo
  // usuário pra uma folha criada do zero — Start()/Update() com comentário
  // (/** */) acima de cada uma explicando quando roda, + um exemplo
  // comentado (/* */, não executa sozinho) de animação (giro + troca de
  // cor). Propriedades usadas no exemplo conferidas contra o motor de
  // verdade: `obj.angulo` é o campo de rotação (radianos) lido por
  // `objAnguloToRotY`/`Mapping` pra desenhar objetos/portas/janelas/câmeras
  // no 2D e no 3D (js/mapping.js, js/engine3d-profiles.js) — NÃO existe
  // `obj.rotation` (isso seria a API do Three.js, não deste app) — e
  // `obj.cor` é o campo de cor lido por `_hexToThreeColor` (js/engine3d-
  // profiles.js), que só aceita "#rrggbb" (rejeita `hsl(...)` — cai num
  // cinza neutro) — por isso o exemplo monta a cor com RGB→hex manual, em
  // vez de `hsl()` (que pareceria funcionar mas seria silenciosamente
  // ignorado pelo motor de verdade). Mesma convenção de execução de
  // `Scripting.run` (js/scripting.js): `obj`/`SceneObjects`/`Scripting`/
  // `map`/`THREE`/`Utils`/`view3d` já vêm prontos no escopo, sem
  // import/require.
  //
  // [11/09/2026] NOVO — pedido verbatim: "os nomes das propriedades devem
  // ser como no JavaScript, por exemplo, 'color' para cor [...] ainda está
  // 'cor', em vez de 'color'". O `obj` recebido pelo código de um Script
  // (e pelo `Scripting.run` legado) agora é um `Proxy` (`_wrapScriptObj`,
  // mais abaixo) que expõe `color`/`rotation`/`width`/`depth`/`height`/
  // `name` como ALIASES de leitura/escrita dos campos reais em português
  // (`cor`/`angulo`/`largura`/`profundidade`/`altura`/`nome`). O CAMPO
  // REAL continua em português em TODO o resto do app (painéis 2D,
  // storage, `mapping.js`) — só a SUPERFÍCIE que o script do usuário lê/
  // escreve mudou; `obj.color = '#ff0000'` escreve de verdade em `obj.cor`
  // por trás, e o 3D (que lê `obj.cor` via `_hexToThreeColor`) reflete
  // normalmente. Por isso o exemplo comentado abaixo usa `obj.color` (não
  // `obj.cor`) — é a forma recomendada pra quem escreve scripts agora;
  // `obj.cor` continua funcionando também (o Proxy só INTERCEPTA os nomes
  // em inglês quando o campo em português não existe literalmente no
  // objeto — nunca esconde o campo real).
  // ---------------------------------------------------------------------
  const DEFAULT_SCRIPT_CODE = [
    '/**',
    ' * Start é chamada antes do primeiro quadro (uma vez, ao iniciar o objeto).',
    ' */',
    'function Start() {',
    '',
    '}',
    '',
    '/**',
    ' * Update é chamada uma vez por quadro (a cada frame).',
    ' */',
    'function Update() {',
    '',
    '}',
    '',
    '/*',
    'Exemplo (descomente para testar): faz o objeto girar continuamente e',
    'trocar de cor ao longo do tempo. Cole o conteúdo abaixo dentro de',
    'Update() acima para ativar.',
    '',
    'obj.angulo += 0.02;',
    'const t = (Date.now() / 1000) % 6;',
    'const r = Math.floor(128 + 127 * Math.sin(t));',
    'const g = Math.floor(128 + 127 * Math.sin(t + 2));',
    'const b = Math.floor(128 + 127 * Math.sin(t + 4));',
    "obj.color = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');",
    '*/',
    '',
  ].join('\n');

  // ---------------------------------------------------------------------
  // [15/09/2026 UTC] NOVO — pedido verbatim: "todos os relógios que são
  // colocados por 'Objetos'->'Relógio' (ou no 'Ver em 3D' [...]) tenha um
  // script já carregado nele (como se alguém o tivesse escrito). [...]
  // deve haver ali um script já guiando o funcionamento do relógio."
  // DEFAULT_RELOGIO_SCRIPT_CODE é anexado automaticamente (ver
  // `js/mapping.js` `addObject`, bloco `if (tipo === 'relogio')`) a TODO
  // objeto `tipo:'relogio'` recém-criado, por QUALQUER caminho (2D
  // "Objetos"→"Relógio" ou 3D, ambos passam por `Mapping.addObject` —
  // ver comentário lá). O código em si é FUNCIONALMENTE EQUIVALENTE a não
  // ter nenhum script (lê `RelogioMundo.getHoraAtual()` e escreve os 3
  // campos — ver `Engine3D._updateRelogiosParede`, js/engine3d.js, e o
  // mecanismo completo em `assets/modelos/_exemplo-script-relogio.txt`) —
  // é só um PONTO DE PARTIDA já funcionando e editável na hora, em vez de
  // uma folha em branco: o usuário abre "Propriedades e Scripts" e já
  // encontra exatamente o comportamento padrão do relógio escrito por
  // extenso, pronto pra adaptar (trocar o fuso, travar um horário fixo,
  // etc. — ver os exemplos comentados no rodapé).
  // ---------------------------------------------------------------------
  const DEFAULT_RELOGIO_SCRIPT_CODE = [
    '/**',
    ' * Este script já vem carregado em todo objeto "Relógio" novo (como se',
    ' * alguém já o tivesse escrito) — mostra a hora do MUNDO (RelogioMundo),',
    ' * exatamente igual a um relógio "de fábrica" sem nenhum script. Edite',
    ' * livremente a partir daqui: é só um ponto de partida.',
    ' *',
    ' * Start é chamada antes do primeiro quadro (uma vez, ao iniciar o objeto).',
    ' */',
    'function Start() {',
    '',
    '}',
    '',
    '/**',
    ' * Update é chamada uma vez por quadro (a cada frame). Os ponteiros do',
    ' * relógio (hora/minuto/segundo) leem estes 3 campos do objeto sempre',
    ' * que forem números — obj.horaPonteiro (0-23), obj.minutoPonteiro',
    ' * (0-59) e obj.segundoPonteiro (0-59). Cada campo é independente: dá',
    ' * pra sobrescrever só um deles e deixar os outros automáticos.',
    ' */',
    'function Update(dt) {',
    "  if (!window.RelogioMundo) return;",
    '  const h = window.RelogioMundo.getHoraAtual();',
    '  obj.horaPonteiro = h.horas;',
    '  obj.minutoPonteiro = h.minutos;',
    '  obj.segundoPonteiro = h.segundos;',
    '}',
    '',
    '/*',
    'IDEIAS PRA ADAPTAR (troque só o cálculo dentro de Update):',
    '  - Horário FIXO (relógio parado/decoração): tire a leitura de',
    '    RelogioMundo e, no Start(), escreva os 3 campos uma vez só:',
    '      obj.horaPonteiro = 10; obj.minutoPonteiro = 10; obj.segundoPonteiro = 0;',
    '  - Fuso deslocado: some/subtraia horas de h.horas antes de atribuir',
    '    (ver assets/modelos/_exemplo-script-relogio.txt pro exemplo completo,',
    '    com normalização 0-23 e mais ideias).',
    '*/',
    '',
  ].join('\n');

  // ---------------------------------------------------------------------
  // [11/09/2026] NOVO — SCRIPT_TEMPLATES: opções de partida pro fluxo
  // "➕ Adicionar Componente"→"Script" (item 4a do pedido) — cada uma é
  // TEXTO de verdade (não uma classe), pré-preenche `code` na criação; o
  // usuário abre a folha e edita livremente a partir daí. `TrocarCor`/
  // `AlternarVisibilidade` são os mesmos 2 exemplos da rodada anterior,
  // reescritos como código de folha em vez de classes com `static
  // properties`/`static publicMethods`.
  // ---------------------------------------------------------------------
  const SCRIPT_TEMPLATES = [
    { id: 'blank', label: 'Em branco', code: DEFAULT_SCRIPT_CODE },
    {
      id: 'trocarCor',
      label: 'Trocar cor (exemplo)',
      code: [
        '/**',
        ' * Start é chamada antes do primeiro quadro (uma vez, ao iniciar o objeto).',
        ' */',
        'function Start() {',
        '',
        '}',
        '',
        '/**',
        ' * Update é chamada uma vez por quadro (a cada frame).',
        ' */',
        'function Update() {',
        '',
        '}',
        '',
        '// Chame esta função a partir de um Gatilho de Evento (ex.: "Ao Clicar")',
        '// para trocar a cor do objeto para vermelho.',
        'function aplicarCorVermelha() {',
        "  obj.color = '#ff0000';",
        '}',
        '',
      ].join('\n'),
    },
    {
      id: 'alternarVisibilidade',
      label: 'Mostrar/Esconder (exemplo)',
      code: [
        '/**',
        ' * Start é chamada antes do primeiro quadro (uma vez, ao iniciar o objeto).',
        ' */',
        'function Start() {',
        '',
        '}',
        '',
        '/**',
        ' * Update é chamada uma vez por quadro (a cada frame).',
        ' */',
        'function Update() {',
        '',
        '}',
        '',
        '// Chame uma destas funções a partir de um Gatilho de Evento',
        '// (ex.: "Ao Aproximar"/"Ao Afastar") para mostrar/esconder o objeto.',
        'function mostrar() {',
        '  obj.ativo = true;',
        '}',
        'function esconder() {',
        '  obj.ativo = false;',
        '}',
        'function alternar() {',
        '  obj.ativo = !obj.ativo;',
        '}',
        '',
      ].join('\n'),
    },
  ];

  // ---------------------------------------------------------------------
  // extractFunctionNames — acha declarações `function Nome(...) {`  de
  // NÍVEL SUPERIOR no texto de uma folha (regex simples, não um parser —
  // suficiente pro caso de uso real: usuário escreve funções nomeadas soltas
  // no topo do arquivo, como o próprio DEFAULT_SCRIPT_CODE demonstra).
  // Usado tanto pelo executor (`_compileCode`, monta o "módulo" só com os
  // nomes de verdade encontrados) quanto pela UI (dropdown "método" de uma
  // ação de EventTrigger, `js/mapview.js` `_renderComponentsEditor`).
  // ---------------------------------------------------------------------
  function extractFunctionNames(code) {
    if (!code) return [];
    const names = [];
    const re = /^[ \t]*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
    let m;
    while ((m = re.exec(code))) {
      if (!names.includes(m[1])) names.push(m[1]);
    }
    return names;
  }

  // ---------------------------------------------------------------------
  // Catálogo de eventos suportados — inalterado da rodada anterior.
  // ---------------------------------------------------------------------
  const EVENT_CATALOG = [
    { id: 'onClick', label: 'Ao Clicar' },
    { id: 'onProximityEnter', label: 'Ao Aproximar', hasRadius: true },
    { id: 'onProximityExit', label: 'Ao Afastar', hasRadius: true },
    { id: 'onStart', label: 'Ao Iniciar' },
    { id: 'onUpdate', label: 'A cada quadro' },
    // [14/09/2026] NOVO — "Porta Automática" (ver assets/modelos/_exemplo-
    // script-porta-automatica.txt): despachado por view3d.js
    // `_dispatchMouseHit3D('DoubleClick')` — MESMO listener `dblclick` do
    // canvas 3D que já chama `onModelDoubleClick`/`onInstanceDoubleClick`
    // (js/objectassets.js), agora também emitindo pro SceneEventBus, igual
    // ao `onClick` (ver view3d.js `_tryPick`).
    { id: 'onDoubleClick', label: 'Ao Clicar Duas Vezes' },
  ];

  // ---------------------------------------------------------------------
  // Cache do "módulo" compilado de cada ScriptComponent — chave = o
  // próprio objeto `compData` (identidade, nunca clonado/escrito de
  // volta nele — ver "NOTA DE SERIALIZAÇÃO" no topo do arquivo).
  // ---------------------------------------------------------------------
  const _instanceCache = new WeakMap();
  // [15/09/2026 UTC] NOVO — pedido verbatim: "Quando der erro no script,
  // deve ficar uma flag na tela do script. Atualmente, uma enchurrada de
  // notificações está sendo exibida." CAUSA RAIZ: `tickEntity` chama
  // `Update(dt)` TODO quadro (60x/s) — um script com erro de sintaxe
  // (`_getOrCreateModule`) ou que lança em runtime
  // (`invokeScriptComponent`) disparava `Utils.toast` DE NOVO a cada um
  // desses quadros, virando uma enchurrada visível de notificações
  // empilhadas. `_lastErrors` (`compData` -> mensagem de erro mais
  // recente, texto) guarda o estado ATUAL de erro de cada componente —
  // NUNCA persistido (mesmo espírito de `_instanceCache`/
  // `_startedScripts`: é estado de execução, não dado de mapa) — pra 2
  // coisas: (1) `getScriptError` expõe pra UI mostrar uma "flag" (badge
  // ⚠️) no bloco do Script na tela "🧩 Componentes"/"Propriedades e
  // Scripts" (ver `js/mapview.js` `scriptBlockHtml`/
  // `_refreshComponentErrorFlags`); (2) o toast só dispara quando a
  // mensagem de erro MUDA (erro novo/diferente do último já avisado) —
  // erros repetidos (o caso comum: o MESMO bug quadro após quadro) não
  // reabrem toast nenhum, só atualizam a flag silenciosamente.
  const _lastErrors = new WeakMap();
  // Quais ScriptComponents já tiveram Start() chamada (ciclo de vida
  // automático — ver `tickEntity` abaixo) — também por identidade,
  // também nunca serializado.
  const _startedScripts = new WeakSet();

  /** Compila `code` (a folha de um ScriptComponent) numa fábrica que, ao
   *  ser chamada com o contexto de execução, roda o texto (declarando as
   *  funções de nível superior que ele definir — o `new Function(...)`
   *  RODA o corpo, o que já executa `function Nome(){}`, deixando os
   *  nomes disponíveis no escopo local) e devolve um objeto só com as
   *  funções de verdade encontradas (`extractFunctionNames`) — o
   *  "módulo" que `Start`/`Update`/qualquer método de EventTrigger chama.
   *  Mesma convenção de parâmetros de `Scripting.run` (js/scripting.js):
   *  `obj`/`SceneObjects`/`Scripting`/`map`/`THREE`/`Utils`/`view3d`. */
  // ---------------------------------------------------------------------
  // [11/09/2026] NOVO — `_wrapScriptObj`: envolve o `obj` de verdade (a
  // referência real da entidade, mesma que `mapping.js`/os painéis 2D já
  // usam) num `Proxy` que expõe nomes de propriedade em inglês "nativo do
  // JavaScript" como ALIASES dos campos reais em português — pedido
  // verbatim do usuário ("os nomes das propriedades devem ser como no
  // JavaScript, por exemplo, 'color' para cor"), escopado só à SUPERFÍCIE
  // de script (este Proxy), sem renomear o campo real em lugar nenhum do
  // resto do app (`obj.cor`/`obj.angulo` continuam sendo o dado de
  // verdade salvo/lido por `mapping.js`/`engine3d-profiles.js`/os painéis
  // 2D — ver nota grande acima de `DEFAULT_SCRIPT_CODE`).
  // `_SCRIPT_OBJ_ALIASES`: nome em inglês -> nome real em português, só
  // pros campos confirmados contra o motor de verdade (ver comentário de
  // `DEFAULT_SCRIPT_CODE`/`js/mapping.js` `addObject`/`addCamera`/
  // `addDoor`/`addWindow`): cor, ângulo (rotação Y, radianos), e as 3
  // dimensões (largura/profundidade/altura) + nome. NÃO inclui
  // `ativo`/`visivel` — não achado nenhum campo de objeto realmente lido
  // pelo motor 3D com esse propósito (só `layer.visivel`, outra coisa),
  // então não teria sentido "prometer" um alias que não faz nada de
  // verdade no render.
  // ---------------------------------------------------------------------
  const _SCRIPT_OBJ_ALIASES = {
    color: 'cor',
    rotation: 'angulo',
    width: 'largura',
    depth: 'profundidade',
    height: 'altura',
    name: 'nome',
  };

  function _wrapScriptObj(real) {
    if (!real || typeof real !== 'object') return real;
    return new Proxy(real, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(_SCRIPT_OBJ_ALIASES, prop) && !(prop in target)) {
          return target[_SCRIPT_OBJ_ALIASES[prop]];
        }
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(_SCRIPT_OBJ_ALIASES, prop) && !(prop in target)) {
          target[_SCRIPT_OBJ_ALIASES[prop]] = value;
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      },
      has(target, prop) {
        if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(_SCRIPT_OBJ_ALIASES, prop)) return true;
        return Reflect.has(target, prop);
      },
    });
  }

  function _compileCode(code) {
    const names = extractFunctionNames(code);
    const returnExpr = '{' + names.map((n) => `${JSON.stringify(n)}: (typeof ${n} === 'function' ? ${n} : undefined)`).join(',') + '}';
    const body = `${code}\n;return ${returnExpr};`;
    return new Function('obj', 'SceneObjects', 'Scripting', 'map', 'THREE', 'Utils', 'view3d', body);
  }

  // [15/09/2026 UTC] NOVO — sentinela de "já tentei compilar isto e
  // falhou" (ver `_lastErrors`/`_getOrCreateModule` logo abaixo) — objeto
  // truthy próprio (nunca `{}`/`null` comuns) pra `_instanceCache.get`
  // conseguir distinguir "nunca compilado ainda" (`undefined`) de "já
  // tentei, deu erro, não tente de novo toda hora" (`_COMPILE_FAILED`)
  // sem precisar de uma 2ª estrutura de dados só pra isso.
  const _COMPILE_FAILED = Object.freeze({ _compileFailed: true });

  function _getOrCreateModule(compData, owner, ctx) {
    if (!compData || compData.type !== 'Script') return null;
    let mod = _instanceCache.get(compData);
    if (mod) return mod === _COMPILE_FAILED ? null : mod;
    try {
      const factory = _compileCode(compData.code || '');
      mod = factory(_wrapScriptObj(owner), window.SceneObjects, window.Scripting, ctx?.map || null, window.THREE, window.Utils, ctx?.view3d || null) || {};
      _instanceCache.set(compData, mod);
      _lastErrors.delete(compData);
      return mod;
    } catch (err) {
      // [15/09/2026 UTC] CORRIGIDO — ver comentário grande de `_lastErrors`
      // acima: antes, um erro de COMPILAÇÃO (ex.: "missing ) after
      // argument list", relatado pelo usuário) nunca era cacheado — cada
      // quadro (`tickEntity` -> `invokeScriptComponent` ->
      // `_getOrCreateModule`) tentava `_compileCode` de novo do zero e
      // disparava outro toast, gerando a "enchurrada de notificações".
      // Agora: cacheia `_COMPILE_FAILED` (não tenta recompilar até o
      // usuário editar a folha — `invalidateInstance` limpa o cache),
      // guarda a mensagem em `_lastErrors` (pra UI mostrar a flag) e só
      // reemite o toast se a mensagem for DIFERENTE da última já avisada.
      const msg = err.message || String(err);
      // [15/09/2026 UTC, RODADA SEGUINTE] REMOVIDO — pedido verbatim: "Elimine
      // as notificações de erro de script, deixe apenas o texto informativo
      // na tela de edição do script mesmo. Pois a cada digitada fica
      // aparecendo uma notificação, acaba por ser uma enxurrada em caso se
      // continue a digitar." O toast da RODADA anterior já só reemitia numa
      // mensagem NOVA/diferente (não mais a cada quadro) — mas cada tecla
      // digitada na folha reseta `_instanceCache`/`_lastErrors`
      // (`invalidateInstance`, chamado no `onchange`/`oninput` do editor,
      // ver `js/mapview.js` `_renderScriptCodeEditor`), então cada erro de
      // COMPILAÇÃO (ex.: parêntese não fechado enquanto o usuário ainda
      // está digitando a linha) virava uma mensagem "nova" de novo — daí a
      // enxurrada real. `_lastErrors` continua sendo preenchido (a flag/
      // faixa fixa da tela de edição, RODADA anterior, continuam
      // funcionando normalmente) — só o toast em si foi removido.
      _lastErrors.set(compData, msg);
      _instanceCache.set(compData, _COMPILE_FAILED);
      console.error('[Components] erro ao compilar/rodar a folha de código do componente', compData.id, err);
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // window.Components — fachada pública.
  // ---------------------------------------------------------------------
  window.Components = {
    Component, ScriptComponent, EventTriggerComponent,
    ComponentRegistry, EVENT_CATALOG,
    SCRIPT_TEMPLATES, DEFAULT_SCRIPT_CODE, DEFAULT_RELOGIO_SCRIPT_CODE,
    extractFunctionNames,
    // [11/09/2026] Exposto pra `js/scripting.js` (`Scripting.run`, o
    // executor "legado" por objeto) reusar o MESMO Proxy de alias
    // inglês↔português, em vez de duplicar a lógica.
    wrapScriptObj: _wrapScriptObj,

    /** [11/09/2026 REESCRITO] Garante que `entity.components` exista —
     *  SEM nenhuma migração de campos legados (removida nesta rodada,
     *  pedido verbatim "elimine tudo do projeto que é legado"). Idempotente. */
    ensureComponents(entity) {
      if (!entity) return [];
      if (!Array.isArray(entity.components)) entity.components = [];
      return entity.components;
    },

    /** Cria e anexa um novo componente do tipo dado (`'Script'`/
     *  `'EventTrigger'`), já com defaults, ao array `entity.components`.
     *  Pra `'Script'`, `extra.code` (se vier) vira a folha inicial —
     *  senão usa `DEFAULT_SCRIPT_CODE` (item 4b/5 do pedido: toda folha
     *  nova já nasce com a estrutura Start/Update + exemplo comentado).
     *  Devolve o `compData` (objeto plano) criado. */
    addComponent(entity, type, extra = {}) {
      const comps = this.ensureComponents(entity);
      let compData;
      if (type === 'Script') {
        compData = { id: Utils_uuid(), type: 'Script', enabled: true, code: (typeof extra.code === 'string') ? extra.code : DEFAULT_SCRIPT_CODE };
      } else if (type === 'EventTrigger') {
        compData = { id: Utils_uuid(), type: 'EventTrigger', enabled: true, events: [] };
      } else {
        return null;
      }
      // [11/09/2026] NOVO — pedido verbatim: "o conjunto de botões dos
      // scripts devem ficar em cima, ao clicar novos scripts. Atualmente,
      // vai ficando em baixo" -- `unshift` (início do array) em vez de
      // `push` (fim), pra o bloco do componente recém-criado aparecer no
      // TOPO da lista em `js/mapview.js` `_renderComponentsEditor`
      // (`comps.map(...)`, que percorre `entity.components` na ordem em
      // que está).
      comps.unshift(compData);
      return compData;
    },

    removeComponent(entity, compId) {
      if (!Array.isArray(entity?.components)) return false;
      const i = entity.components.findIndex((c) => c.id === compId);
      if (i === -1) return false;
      entity.components.splice(i, 1);
      return true;
    },

    getScriptComponents(entity) {
      return (entity?.components || []).filter((c) => c.type === 'Script');
    },

    getEventTriggerComponents(entity) {
      return (entity?.components || []).filter((c) => c.type === 'EventTrigger');
    },

    /** Invoca `methodName` no "módulo" (compilado/cacheado sob demanda) do
     *  `ScriptComponent` `compData`, no contexto do objeto dono `owner` e
     *  `ctx` (ex.: `{ map, view3d }`). Usado tanto pelo `SceneEventBus`
     *  (ações de EventTrigger) quanto pelo ciclo de vida automático
     *  (`tickEntity`, abaixo). */
    invokeScriptComponent(compData, methodName, args, owner, ctx) {
      if (!compData || compData.enabled === false || !methodName) return undefined;
      const mod = _getOrCreateModule(compData, owner, ctx);
      if (!mod || typeof mod[methodName] !== 'function') return undefined;
      try {
        const ret = mod[methodName](...(args || []));
        // [15/09/2026 UTC] NOVO — erro anterior sanado (o método rodou sem
        // lançar desta vez) — limpa a flag/estado de erro (ver `_lastErrors`,
        // comentário grande perto de `_instanceCache` no topo do arquivo).
        if (_lastErrors.has(compData)) _lastErrors.delete(compData);
        return ret;
      } catch (err) {
        // [15/09/2026 UTC] CORRIGIDO — pedido verbatim: "Quando der erro no
        // script, deve ficar uma flag na tela do script. Atualmente, uma
        // enchurrada de notificações está sendo exibida." Antes, um erro de
        // RUNTIME dentro de Update(dt) (chamado todo quadro) tostava de
        // novo a CADA quadro enquanto o bug persistisse — mesma causa raiz
        // do erro de compilação corrigido em `_getOrCreateModule` acima, só
        // que aqui o erro acontece DEPOIS da compilação ter ido bem. Agora:
        // só reemite o toast se a mensagem mudou desde a última vez
        // avisada; `_lastErrors` sempre guarda a mensagem ATUAL (pra a UI
        // mostrar a flag), toste ou não.
        const msg = err.message || String(err);
        // [15/09/2026 UTC, RODADA SEGUINTE] REMOVIDO — mesmo pedido/motivo
        // do comentário grande em `_getOrCreateModule` acima ("Elimine as
        // notificações de erro de script [...] deixe apenas o texto
        // informativo na tela de edição"): toast removido, `_lastErrors`
        // continua preenchido pra flag/faixa fixa (RODADA anterior).
        _lastErrors.set(compData, msg);
        console.error(`[Components] erro ao chamar ${methodName}() na folha de código:`, err);
      }
    },

    /** [15/09/2026 UTC] NOVO — pra a UI (ver `js/mapview.js`
     *  `scriptBlockHtml`/`_refreshComponentErrorFlags`) mostrar uma "flag"
     *  de erro no bloco do Script, em vez da enchurrada de toasts de antes
     *  (ver comentário grande de `_lastErrors` no topo do arquivo).
     *  Devolve a mensagem de erro ATUAL (string) ou `null`/`undefined` se
     *  o componente estiver rodando sem erro no momento. */
    getScriptError(compData) {
      return _lastErrors.get(compData) || null;
    },

    /** [11/09/2026] NOVO — ciclo de vida automático estilo Unity: pra
     *  TODO `ScriptComponent` ativo de `entity`, chama `Start()` uma
     *  única vez (na primeira vez que a entidade é "tickada" depois de
     *  entrar no "Ver em 3D"/depois de a folha ser (re)compilada) e
     *  `Update(dt)` em TODO quadro — sem precisar de nenhum EventTrigger
     *  configurado (fecha o gap "onUpdate sem dispatcher por quadro" da
     *  rodada anterior). Chamado por `view3d.js` `_updateScriptLifecycle`
     *  a cada quadro, pra toda entidade com `components` no mapa. */
    tickEntity(entity, ctx, dt) {
      const comps = entity?.components;
      if (!comps || !comps.length) return;
      for (const c of comps) {
        if (c.type !== 'Script' || c.enabled === false) continue;
        if (!_startedScripts.has(c)) {
          _startedScripts.add(c);
          this.invokeScriptComponent(c, 'Start', [], entity, ctx);
        }
        this.invokeScriptComponent(c, 'Update', [dt], entity, ctx);
      }
    },

    /** Limpa o "módulo" cacheado de um `ScriptComponent` (ex.: depois que
     *  o usuário edita `code` na folha — força recompilar/re-executar o
     *  texto novo na próxima invocação, em vez de ficar presa ao código
     *  antigo já compilado) — também esquece que `Start()` já rodou (a
     *  folha mudou, é justo rodar `Start()` de novo no código novo). */
    invalidateInstance(compData) {
      _instanceCache.delete(compData);
      _startedScripts.delete(compData);
      // [15/09/2026 UTC] NOVO — a folha mudou (usuário editou o código):
      // qualquer erro registrado era sobre o texto ANTERIOR, não faz mais
      // sentido continuar mostrando a flag pro código novo até ele rodar
      // (com sucesso ou erro) de novo.
      _lastErrors.delete(compData);
    },
  };

  // ---------------------------------------------------------------------
  // window.SceneEventBus — inalterado da rodada anterior (sistema de
  // eventos, NÃO é legado). Quem detecta o evento (view3d.js: raycast de
  // clique, loop de distância) chama `emit`; quem decide o que acontece é
  // 100% dado (`EventTriggerComponent.events`).
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // [13/09/2026] NOVO — BARRAMENTO GLOBAL DE EVENTOS (`emitGlobal`/
  // `onGlobalEvent`), infraestrutura de baixo nível ADICIONADA nesta
  // rodada pra viabilizar o pedido do elevador ("botão de chamada num
  // andar liga pra cabine, que pode estar em outro objeto qualquer da
  // cena"). INVESTIGAÇÃO ANTES DE CRIAR ISSO (documentada aqui pra quem
  // ler depois e achar estranho ter 2 barramentos parecidos):
  // `SceneEventBus.emit` (acima, ANTERIOR, inalterado) só entrega o
  // evento pros EventTrigger/Script DO MESMO `sceneObject` que o
  // disparou — cada Script roda isolado no contexto do seu PRÓPRIO
  // `obj` (ver `_getOrCreateModule`/`invokeScriptComponent` acima:
  // sempre chamado com `owner` = a MESMA entidade). Não existia, em
  // lugar nenhum do projeto (`grep -rn "SceneEventBus" js/` nesta
  // rodada), nenhum caminho pra um Script de UM objeto avisar o Script
  // de OUTRO objeto de algo — motivo pelo qual esta rodada precisou
  // ADICIONAR essa capacidade (autorização explícita do usuário: "se
  // precisar de algo que o projeto não dê suporte, implemente").
  //
  // DESIGN — deliberadamente o mais simples possível, seguindo a mesma
  // filosofia de "objeto mutável + closures", sem framework de eventos
  // novo: um `Map<nomeDoEvento, Set<callback>>` guardado em módulo
  // (`_globalListeners`), nunca serializado (é comportamento de
  // execução, não dado de mapa — mesmo espírito de `_instanceCache`/
  // `_startedScripts` acima). Qualquer Script de QUALQUER objeto pode:
  //   - `SceneEventBus.onGlobalEvent('chamarElevador', function(dados){...})`
  //     dentro do seu `Start()`, pra ESCUTAR; devolve uma função pra
  //     cancelar a inscrição, se algum dia precisar (não usado ainda).
  //   - `SceneEventBus.emitGlobal('chamarElevador', {piso: 3, direcao: 1})`
  //     de dentro de QUALQUER outro método (ex.: `aoClicar`) do seu
  //     próprio Script, pra AVISAR todo mundo inscrito.
  // `SceneEventBus` já é global (`window.SceneEventBus`) e todo Script
  // roda em escopo não-estrito de `new Function(...)` (ver
  // `_compileCode` acima), então `window`/`SceneEventBus` já ficam
  // visíveis de graça dentro do código colado pelo usuário — não foi
  // preciso mudar a assinatura de `_compileCode`/`_getOrCreateModule`
  // pra adicionar isto.
  //
  // LIMITAÇÃO CONHECIDA (documentada, não um bug): como cada Script só
  // "existe" (só tem `Start()` chamada, só entra no `_startedScripts`)
  // depois que o objeto dono aparece na cena 3D ao menos 1 quadro, um
  // `emitGlobal` disparado ANTES de outro objeto ainda não ter rodado
  // seu `Start()` não é perdido de forma alguma incomum — só não há
  // NENHUM ouvinte cadastrado ainda pra recebê-lo (o registro só
  // acontece dentro de `Start()`). Na prática, como `tickEntity` roda
  // `Start()` de TODAS as entidades antes de qualquer `Update()`
  // (mesma ordem de quadro do motor), isso não chega a ser um problema
  // real: no primeiro quadro em diante todo mundo já está inscrito.
  // ---------------------------------------------------------------------
  const _globalListeners = new Map();

  window.SceneEventBus = {
    /** @param {string} eventName - um dos EVENT_CATALOG ids.
     *  @param {object} sceneObject - a referência de verdade do objeto/
     *    parede/porta/janela/câmera/texto (mutável, mesma que já é salva
     *    no mapa).
     *  @param {object} payload - dados extras do evento (ex.: {distance}).
     *  @param {object} ctx - contexto de execução, ex. { map, view3d }. */
    emit(eventName, sceneObject, payload, ctx) {
      if (!sceneObject) return;
      const comps = window.Components.ensureComponents(sceneObject);
      if (!comps.length) return;
      for (const compData of comps) {
        if (compData.type !== 'EventTrigger' || compData.enabled === false) continue;
        for (const ev of (compData.events || [])) {
          if (ev.event !== eventName) continue;
          for (const action of (ev.actions || [])) {
            const targetData = comps.find((c) => c.id === action.targetComponentId && c.type === 'Script');
            if (!targetData) continue;
            window.Components.invokeScriptComponent(targetData, action.method, action.args, sceneObject, ctx);
          }
        }
      }
    },

    /** [13/09/2026] NOVO — dispara `eventName` pra TODO ouvinte inscrito
     *  via `onGlobalEvent`, em QUALQUER objeto da cena (não só no mesmo
     *  objeto que emitiu — diferente de `emit` acima). `payload` é
     *  passado como único argumento de cada callback. Erros num
     *  ouvinte são isolados (`try/catch` por ouvinte) pra um Script com
     *  bug não travar a entrega do evento pros demais. */
    emitGlobal(eventName, payload) {
      const listeners = _globalListeners.get(eventName);
      if (!listeners || !listeners.size) return;
      for (const fn of Array.from(listeners)) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[SceneEventBus] erro num ouvinte global de "${eventName}":`, err);
        }
      }
    },

    /** [13/09/2026] NOVO — inscreve `callback` pra ser chamado toda vez
     *  que `eventName` for emitido via `emitGlobal` (de QUALQUER objeto).
     *  Devolve uma função `cancelar()` pra remover a inscrição (útil se
     *  um objeto for destruído/recriado, embora nenhum script existente
     *  chame isso hoje — cancelar é opcional). */
    onGlobalEvent(eventName, callback) {
      if (typeof callback !== 'function') return () => {};
      if (!_globalListeners.has(eventName)) _globalListeners.set(eventName, new Set());
      const set = _globalListeners.get(eventName);
      set.add(callback);
      return () => set.delete(callback);
    },
  };
})();
