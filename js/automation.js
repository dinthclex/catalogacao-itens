/* js/automation.js
 * NOVO (26/09/2026) — Módulo de Automação e Scripts GLOBAIS, pedido
 * verbatim: "criar um Módulo de Automação e Scripts extremamente robusto e
 * intuitivo [...] um painel (Lista de Scripts) onde o usuário possa
 * gerenciar códigos/rotinas. Cada script da lista deve ter os botões:
 * Executar, Desexecutar (Desfazer), Editar, Renomear e Excluir." — exemplo
 * dado: um script "Modo Raio-X" que oculta .parede/.viga/.porta e faz .pc
 * levitarem; "Desexecutar" desfaz tudo, mesmo com múltiplos scripts rodando
 * juntos.
 *
 * DIFERENÇA para o sistema de Componentes já existente (js/components.js —
 * "🧩 Componentes (Scripts / Gatilhos)"): aquele é um script POR OBJETO,
 * disparado por evento (clique/aproximação) — não tem noção de "lista
 * global"/"desexecutar tudo o que este script fez". Este módulo é o
 * complemento pedido: uma lista de rotinas GLOBAIS, escritas uma vez, que
 * seleciona objetos do MAPA INTEIRO (por classe/tipo/etc., não um objeto
 * fixo) e sabem se desfazer sozinhas.
 *
 * HISTÓRICO sobre o antigo botão '🏷️ Grupos' (mapview.js) — REMOVIDO por
 * completo em 27/09/2026 (pedidos verbatim: "Elimine do código o 'Grupos',
 * pois tudo já está implementado em 'Scripts'" e, depois, "Remova
 * map.grupoRegras. O motor de regras por baixo (grupoRegras) deve ser
 * integrado a 'Scripts'."). O painel/botão foi removido primeiro (ficando
 * só o motor de regras `map.grupoRegras` por baixo, ainda usado
 * internamente por `.opacity()`/`.highlight()`); depois o motor de regras
 * em si também foi removido — `.opacity()`/`.highlight()` passaram a
 * escrever campos DIRETO no objeto (`entity.opacidade`/`entity.destacado`,
 * mesmo padrão de `.hide()`/`.show()` com `entity.visibility`), sem
 * nenhuma regra/classe sintética/`map.grupoRegras` no meio — ver comentário
 * grande de cada um deles, mais abaixo.
 *
 * ARMAZENAMENTO: a lista de scripts é GLOBAL (não por mapa) — guardada em
 * `DB.getSetting('automationScripts', [])`/`DB.setSetting(...)` (a store
 * `settings`, chave livre, já existe — sem precisar de migração de schema
 * do IndexedDB). Cada script: `{ id, nome, codigo, criadoEm, atualizadoEm }`.
 *
 * MOTOR DE SELEÇÃO (`Select(seletor)`): motor PRÓPRIO (ver `_parseSelector`/
 * `_compoundMatches`/`_atomMatches` abaixo), inspirado direto na spec de
 * seletores CSS do W3Schools (css_selectors.php, css_ref_combinators.php,
 * css_ref_pseudo_classes.php, css_ref_pseudo_elements.php — pedido
 * verbatim: "Implemente todos os seletores [...] pesquise no site
 * w3schools"). Motor de seletor 100% autocontido — nunca dependeu de
 * `Mapping.grupoRegraMatches`/`Mapping.parseGrupoSelector` (mecanismo do
 * antigo painel '🏷️ Grupos', removido por completo — ver histórico no topo
 * do arquivo), nem depende de nada relacionado a ele hoje.
 *
 * SINTAXE SUPORTADA (cada "seletor simples" pode ser combinado sem espaço
 * — AND — dentro de um "seletor composto"):
 *   *                    → qualquer entidade (css_selectors.php)
 *   parede · piso        → atalhos já existentes (é uma parede / tipo==='piso')
 *   pc, mesa, cadeira...  → SELETOR DE TIPO (como uma tag HTML): equivale a
 *                          `tipo=valor` mas sem precisar escrever "tipo=" —
 *                          qualquer palavra "solta" que não seja uma
 *                          palavra-chave conhecida cai aqui.
 *   .classe              → tem essa classe (css_selectors.php .class)
 *   #id                  → id exato (css_selectors.php #id)
 *   chave=valor           → igualdade exata num campo qualquer (atalho já
 *                          existente; `andar=N` continua especial, resolvido
 *                          via `Mapping.getAndarDaEntidade`)
 *   [attr]                (css_ref_selectors, attribute selector) → campo existe e é "truthy"
 *   [attr=valor]           → igual (aceita aspas simples/duplas opcionais)
 *   [attr!=valor]          → diferente (não é CSS puro, mas útil e sem ambiguidade)
 *   [attr^=valor]          → começa com (css_selectors.php [attribute^=value])
 *   [attr$=valor]          → termina com ([attribute$=value])
 *   [attr*=valor]          → contém (substring — [attribute*=value])
 *   [attr~=valor]          → uma das "palavras" separadas por espaço é igual
 *                          (mesmo espírito de `.classes` — [attribute~=value])
 *   :not(seletor)          → negação (css_ref_pseudo_classes.php :not()) —
 *                          aceita QUALQUER seletor dentro, inclusive com
 *                          vírgula (OU) e outro `:not()` aninhado.
 *   :first-child            :last-child            :only-child
 *   :nth-child(N)           :nth-child(odd|even)   :nth-child(An+B)
 *   :nth-last-child(...)                            (css_ref_pseudo_classes.php)
 *     — "posição" é dentro do grupo de entidades do MESMO tipo (`tipo`)/
 *     coleção (paredes entre si, portas entre si...), na ordem devolvida
 *     por `SceneObjects.all` — a única noção de "ordem entre irmãos" que
 *     faz sentido pra uma lista de objetos de catálogo (não há de verdade
 *     uma árvore DOM aqui).
 *   :empty                 → sem `.classes` nenhuma (css_ref_pseudo_classes.php)
 *   PSEUDO-ELEMENTOS (::before/::after/::first-line/::marker/etc.,
 *   css_ref_pseudo_elements.php) → propositalmente NÃO implementados: eles
 *   descrevem uma "caixa" de renderização de texto/CSS que não existe pra
 *   um objeto de catálogo — não têm nenhum equivalente aqui.
 *   vírgula = OU (`.parede, .viga, .porta`) — qualquer um dos grupos batendo já basta.
 *   COMBINADORES (css_ref_combinators.php) — `A B` (descendente), `A > B`
 *   (filho direto), `A + B` (irmão adjacente), `A ~ B` (irmão geral):
 *
 * HIERARQUIA (pedido verbatim: "Faça o mapa possuir uma hierarquia real
 * semelhante ao DOM para que os seletores funcionem plenamente [...] poder
 * selecionar o Gabinete via código e o que há dentro dele [...] abrir a
 * tampa do Gabinete e ligá-lo/desligá-lo"): qualquer objeto/parede/porta/
 * janela/texto do mapa pode ter um campo `paiId` — o `id` de outra entidade
 * do mesmo mapa, sua "mãe" (ex.: a "tampa" de um Gabinete tem `paiId` =
 * `id` do Gabinete). Sem NENHUMA entidade envolvida numa cadeia usando
 * `paiId`, os 4 combinadores caem no fallback antigo (mesmo ANDAR de quem
 * bate com A — `andar=1 .pc` seleciona PCs do 1º andar) — simplificação
 * HONESTA, documentada, pra objetos sem hierarquia declarada. Mas SE algum
 * lado da relação tem `paiId`, os combinadores passam a significar
 * EXATAMENTE o que significam em CSS de verdade: `#gabinete1 > .tampa`
 * (filho DIRETO — a tampa daquele gabinete específico), `#gabinete1 .tampa`
 * (descendente, qualquer profundidade — sobe a cadeia de `paiId` toda),
 * `.tampa ~ .tampa` (irmãos — mesmo `paiId`). Ver `SceneObjects.filhos`/
 * `SceneObjects.pai` (js/sceneobjects.js) pra navegar essa árvore fora de
 * um seletor, e `SelectionCollection.filhos()` (abaixo) pra pegar os
 * filhos de uma seleção já feita. `Select('#gabinete1')` seleciona o
 * Gabinete; `Select('#gabinete1').filhos()` seleciona a tampa (e qualquer
 * outra peça futura que vier com `paiId` apontando pra ele) — "poder
 * selecionar o Gabinete e o que há dentro dele", pedido verbatim, já
 * funciona pra qualquer peça nova que ganhe `paiId`, não só a tampa.
 *
 * ROLLBACK ("Desexecutar"): cada `run()` guarda, para CADA objeto tocado
 * (na 1ª vez que `Select()` o devolve dentro daquela execução — nunca de
 * novo, mesmo que o script chame `Select()` outra vez sobre o mesmo objeto
 * depois de já ter mudado algo — é o valor "antes de QUALQUER mudança
 * deste script" que interessa), uma cópia rasa (`{...obj}`) das
 * propriedades ANTES do script rodar. `stop()` (Desexecutar):
 *   1. Para todos os `TWEEN.Tween` que este script iniciou (rastreados via
 *      um `TWEEN` "vigiado" — ver `_wrapTween` — passado ao script no lugar
 *      do `TWEEN` global; `new TWEEN.Tween(...)` dentro do script continua
 *      funcionando IDÊNTICO, só que cada instância criada é anotada numa
 *      lista própria desta execução).
 *   2. Desfaz os efeitos "Ocultar"/"Opacidade"/"Destacar" (que por baixo
 *      usam o MESMO motor de regras do 'Grupos' — ver `_applyEfeito`/
 *      `_cleanups` abaixo) — remove a(s) regra(s) sintéticas criadas e a
 *      classe temporária marcada nos objetos afetados.
 *   3. Restaura CADA propriedade de CADA objeto tocado pro valor gravado no
 *      passo 1 (`Object.assign(objetoReal, copiaAntes)`).
 * Scripts múltiplos rodando ao mesmo tempo não se atropelam: cada
 * `run()`/`stop()` só lê/escreve o PRÓPRIO estado (`this._runState[id]`) —
 * se dois scripts tocam o mesmo objeto, desexecutar UM deles restaura só as
 * propriedades que ELE (e não o outro) mudou primeiro.
 *
 * `Object(nome)` — acha UM objeto pelo Nome dele (propriedades do objeto),
 * igual `bpy.data.objects['Nome']` do Blender (por baixo é
 * `SceneObjects.get(map, nome)`, já existia, só não estava exposto direto
 * pro script) — devolve o objeto (já "rastreado" pra rollback/refresh 3D
 * ao vivo, igual `Select()`) pra atribuição DIRETA de propriedade, sem
 * chamar `.set()`/`.hide()` nem embrulhar em `SelectionCollection`:
 * `Object('AP1').visibility = false`. `null` se não achar. [27/09/2026]
 * RENOMEADO de `Objeto` pra `Object` — pedido verbatim: "Em vez de
 * 'Objeto', use 'Object', para ficar padronizado (por exemplo, em vez de
 * visibilidade é visibility)." NOTA: isso "sombreia" o `Object` nativo do
 * JS dentro do escopo do script (o construtor global) — dentro de um
 * script, `new Object()`/`Object.keys(...)` etc. deixam de funcionar (o
 * parâmetro da função tem o mesmo nome). Nomes de FUNÇÕES criadas pelo
 * próprio usuário dentro do script continuam livres pra serem em
 * português, só este helper pronto que mudou de nome.
 *
 * AÇÕES NATIVAS (métodos da coleção devolvida por `Select(...)`, ver
 * `SelectionCollection` abaixo): `.hide()`/`.show()` (Ocultar — grava
 * `entity.visibility = false/true` direto no objeto — MESMO campo que
 * `Engine3D._applyGrupoOpacidadeDestaque` (3D) e `MapView._pisoVisible`
 * (2D) já leem, mas SEM remover o objeto da cena de verdade — igual
 * `visibility:hidden` no DOM: o objeto continua lá, só não é desenhado.
 * Pra remover de vez, use o "🚫 Ocultar" NATIVO do 'Grupos'),
 * `.opacity(v)` (Opacidade, 0-1 — 2D e 3D, ver `Engine3D.
 * _applyGrupoOpacidadeDestaque`), `.highlight(true|false)` (Destacar — 2D e
 * 3D também), `.move(dx,dy,dz)` (relativo),
 * `.moveTo(x,y,z)` (absoluto), `.rotate(deg)`, `.scale(fator)`,
 * `.set(prop, valor)` (qualquer propriedade, sem lista fixa — "tudo pode
 * ser acessado e alterado"), `.animate(propsFinais, duracaoMs, opts)`
 * (Tween.js de verdade por baixo — `opts.easing`/`opts.yoyo`/`opts.repeat`),
 * `.blink(opts)` (Piscar — pulsa `.opacity()` via tween em loop, efeito de
 * alerta), `.each(fn)`/`.forEach(fn)` (escape-hatch, JS puro em cada item).
 */
/** Chave especial pra "desembrulhar" um objeto rastreado (ver
 *  `AutomationManager._rastrear`) de volta pra referência real, sem passar
 *  pelo rastreamento — usada internamente pelas ações que já se
 *  autogerenciam por completo via `cleanups` (a classe sintética temporária
 *  de `.opacity()`/`.highlight()` — `.hide()`/`.show()` NÃO usam mais isso,
 *  ver comentário grande deles abaixo), nunca exposta/documentada pro
 *  código do script em si. */
const AUTOMATION_REAL = '__automationReal__';

/** [27/09/2026] NOVO — pedido verbatim: "Deixe comentadas essas 4 funções
 *  em todos os scripts de modelo (inclusive no 'Em branco')." Bloco de
 *  boilerplate (SEMPRE comentado — nenhuma das 4 funções roda de verdade
 *  até o usuário descomentar e preencher) acrescentado ao final do
 *  `code` de TODOS os modelos em `SCRIPT_TEMPLATES` (ver `.concat(...)`
 *  logo abaixo, em cada template) — mostra os 4 ganchos de ciclo de vida
 *  disponíveis (nomes fixos, opcionais) e como ocultá-los do <select> de
 *  "método" caso o usuário decida descomentar e usá-los de verdade (ver
 *  `AutomationManager.extractMetodosOcultos`). */
const GANCHOS_CICLO_VIDA_BOILERPLATE = [
  '',
  '// Ganchos de ciclo de vida (OPCIONAIS, nomes fixos) — descomente e',
  '// preencha se precisar. O app chama cada um SOZINHO, no momento certo,',
  '// sem precisar escolher nada em nenhum <select>:',
  '//',
  '//   function AoCriarScript() {}       // 1x, ao CRIAR este script ("➕ Novo script")',
  '//   function AoExcluirScript() {}     // 1x, ao EXCLUIR este script (🗑️)',
  '//   function AoExecutarScript() {}    // 1x, ao clicar 👁️/🚫 pra EXECUTAR',
  '//   function AoDesexecutarScript() {} // 1x, ao clicar 👁️/🚫 pra DESEXECUTAR',
  '//',
  '// Por padrão, TODA função declarada no código aparece no <select> de',
  '// "método" desta linha — inclusive estas 4, se você as descomentar/',
  '// declarar de verdade. Como elas já rodam SOZINHAS, o comum é NÃO',
  '// querer que apareçam lá também — cole a linha de comentário',
  '// "// @ocultarMetodo" (singular) IMEDIATAMENTE ACIMA da função (sem',
  '// nada no meio) pra escondê-la do <select>; a função continua existindo',
  '// e podendo ser chamada normalmente, só desaparece da lista de escolha.',
  '// Repita a linha acima de cada função que quiser esconder — ex.:',
  '//',
  '// @ocultarMetodo',
  '// function AoExecutarScript() { ... }',
].join('\n');

/** [27/09/2026] NOVO — pedido verbatim: "todos os scripts devem vir com
 *  Start()." Diferente do bloco acima (4 ganchos OPCIONAIS, sempre
 *  comentados) — `Start()` já vem REAL/ativa (descomentada) em todo
 *  modelo, pronta pra usar, já que seu papel (preparar valores/chamar
 *  algo 1 única vez — ver `AutomationManager._startJaRodou`/comentário
 *  grande de `run()`) é útil em qualquer script. Vazia por padrão (só
 *  comentário explicando) — não faz nada até o usuário preencher. Só
 *  acrescentada aos modelos que ainda NÃO declaram a própria `Start()`
 *  de verdade (hoje, só "Ocultar/Opacidade/Destacar" já tem uma,
 *  com lógica própria — repetir a declaração ali SOBRESCREVERIA a de
 *  verdade por uma vazia, já que a última `function Start` do código
 *  "ganha" — por isso este bloco NÃO é global como o de cima). */
const START_STUB = [
  '',
  '// Roda 1 ÚNICA VEZ — até recarregar a página, ou até editar este',
  '// código de novo (ver comentário grande em automation.js `run()`).',
  '// Não precisa escolher nada em nenhum <select> (nem aparece lá) — o',
  '// app chama sozinha, sempre ANTES do "método"/`AoExecutarScript()`.',
  '// Use pra preparar valores/objetos que os métodos abaixo vão usar,',
  '// ou chamar algo que só faz sentido rodar uma vez (não a cada',
  '// clique em 👁️/🚫). Vem com "// @ocultarMetodo" acima por padrão —',
  '// já roda sozinha automaticamente, então normalmente não faz sentido',
  '// ALÉM disso também aparecer no <select> de "método" pra ser',
  '// escolhida manualmente; remova essa linha de comentário se quiser',
  '// que ela apareça lá também (ela roda de qualquer forma, escolhida',
  '// ou não — a única coisa que a linha controla é aparecer ou não',
  '// no <select>).',
  '// @ocultarMetodo',
  'function Start() {',
  '',
  '}',
].join('\n');

window.AutomationManager = {
  _scripts: [],
  _loaded: false,
  _runState: {}, // id -> { snapshot: Map(obj -> propsAntes), tweens: [Tween], cleanups: [fn] }

  /** [27/09/2026] NOVO — pedido verbatim: "O objetivo da função Start() é
   *  que ela rode uma única vez para sempre até recarregar a página [...]
   *  para definir valores e chamar funções uma única vez. Semelhante ao
   *  que é em [...] '🧩 Editar componentes…'." `Start` passa a ser um 5º
   *  nome fixo (como os 4 ganchos de ciclo de vida) — MAS com uma regra
   *  diferente: em vez de rodar a CADA `run()`/clique (como
   *  `AoExecutarScript()`), roda automaticamente só na 1ª vez, entre TODAS
   *  as chamadas de `run()` deste script, contando a partir do carregamento
   *  da página (ou desde a última edição do código, ver `updateCode`
   *  acima) — clicar em 👁️/🚫 várias vezes, ou até trocar o "método"
   *  escolhido, NUNCA dispara `Start()` de novo, até a página recarregar.
   *  `Set` EM MEMÓRIA (nunca persistido — reinicia sozinho a cada
   *  carregamento da página, exatamente o pedido: "até recarregar a
   *  página"). [27/09/2026] MUDADO — pedido verbatim: "Todas as funções
   *  declaradas devem aparecer no seletor (inclusive a Start()), exceto se
   *  tiverem '// @ocultarMetodo' [...] fica tudo padronizado, ou seja,
   *  todo método declarado dentro de um script deve aparecer na lista de
   *  métodos do seletor de métodos do script. Só não irá aparecer, se
   *  tiver '// @ocultarMetodo' acima da função." `Start` NÃO é mais
   *  removida do <select> incondicionalmente (ver `mapview.js`
   *  `_scriptRowHtml` — a exclusão especial `m !== 'Start'` foi retirada);
   *  agora segue a MESMA regra de qualquer outra função — some do
   *  <select> só se tiver `// @ocultarMetodo` imediatamente acima dela no
   *  código (todos os modelos já vêm com essa linha acima do `Start()`
   *  deles, ver `START_STUB`/template "Ocultar/Opacidade/Destacar" — o
   *  usuário remove a linha se quiser escolhê-la manualmente também).
   *  Escolhida ou não no <select>, `Start()` roda igual, sozinha, só na
   *  1ª vez — a linha só decide se ela aparece ou não na LISTA. */
  _startJaRodou: new Set(),

  /** Exemplo pronto (mesmo do pedido verbatim) — ponto de partida visível
   *  ao criar um script novo. */
  DEFAULT_SCRIPT_TEMPLATE: [
    "// Exemplo: \"Modo Raio-X\" — oculta paredes/vigas/portas e faz os PCs levitarem.",
    "// Clique no botão 👁️/🚫 desta linha pra Executar e ver o efeito; clique de novo pra Desexecutar (desfazer).",
    "",
    "// 1) Oculta tudo que tiver as classes .parede, .viga ou .porta (vírgula = OU).",
    "Select('.parede, .viga, .porta').hide();",
    "",
    "// 2) Faz os objetos com a classe .pc levitarem — animação de posição, em loop",
    "//    (yoyo: sobe e desce; repeat: Infinity = sem parar até Desexecutar).",
    "Select('.pc').animate({ elevacao: 0.4 }, 900, {",
    "  easing: TWEEN.Easing.Quadratic.InOut,",
    "  yoyo: true,",
    "  repeat: Infinity,",
    "});",
    "",
    "// 3) Só pra chamar atenção: pisca a opacidade dos PCs também.",
    "Select('.pc').blink({ min: 0.4, duration: 500 });",
  ].join('\n'),

  /** Modelos prontos do seletor "Modelo" ao criar um script novo (ver
   *  `_toggleScriptsPanel`/`_renderScriptsPanelBody` em mapview.js, MESMO
   *  padrão do `<select>` "Modelo" de `window.Components.SCRIPT_TEMPLATES`
   *  na folha de Componentes). [27/09/2026] REDUZIDO — pedido verbatim:
   *  "Nos Modelos de scripts, deixe apenas 'Em branco', '🏷️ Ocultar /
   *  Opacidade / Destacar', '🎯 Objeto específico por nome — visibility
   *  direto' e '🎈 Levitação suave (gabinete/monitor/teclado/mouse)'.
   *  Remova os outros." — removidos "👁️ Modo Raio-X",
   *  "🗄️ Hierarquia: Gabinete e Access Point" e os 6 exemplos por
   *  categoria (Infraestrutura/Manutenção, Segurança/Alarmes,
   *  Apresentação/Exploração — assumiam classes que não existem no
   *  catálogo padrão, ex. `.hidraulica`/`.eletrica`/`.atendido`). O
   *  código-fonte de "Modo Raio-X" continua existindo em
   *  `DEFAULT_SCRIPT_TEMPLATE` (usado como corpo de exemplo em outros
   *  lugares do app) — só a ENTRADA dele neste seletor "Modelo" foi
   *  removida. */
  SCRIPT_TEMPLATES: [
    {
      id: 'em-branco',
      categoria: '',
      label: 'Em branco',
      code: [
        '// Script em branco — use Select(seletor) pra escolher objetos do',
        '// mapa (mesma sintaxe de seletor CSS: .classe, #id, tipo, [attr=valor],',
        '// :not(...), combinadores... — ver os comentários de exemplo dos outros',
        '// modelos, ou o modelo "Modo Raio-X").',
        '',
        'Select(\'*\'); // troque pelo seletor que quiser',
      ].join('\n') + START_STUB + GANCHOS_CICLO_VIDA_BOILERPLATE,
    },
    // [27/09/2026] NOVO — pedido verbatim: "Refaça o mapa de exemplo, agora,
    // com scripts equivalentes ao que tem no botão 'Grupos'. O 'Ocultar',
    // 'Opacidade' e 'Destacar' devem ser métodos de algum script ou o
    // próprio script." Este modelo DECLARA os 3 efeitos como funções de
    // nível superior — nenhuma roda sozinha (o script só as declara); quem
    // escolhe qual roda é a "seleção do método" da janela '🎬 Scripts' (ver
    // `_scriptRowHtml`/`run()` — mesmo <select> de método usado por
    // '🧩 Componentes'). Todas as 3 usam `Select()` SEM argumento — pegam o
    // seletor de verdade da "entrada para seletores" da própria linha do
    // script (ver comentário grande de `create()` acima); deixe essa
    // entrada vazia e elas não selecionam nada.
    {
      id: 'grupos-equivalente',
      categoria: '',
      label: '🏷️ Ocultar / Opacidade / Destacar',
      // [27/09/2026] NOVO — pedido verbatim: "deve vir como exemplo, no
      // seletor, 'parede, piso, pilar, viga'." As 3 funções abaixo usam
      // `Select()` SEM argumento (pega o seletor desta entrada, ver
      // comentário grande de `create()`) — sem um seletor de exemplo já
      // preenchido, elas não afetam nada até o usuário digitar um por
      // conta própria; agora nasce preenchido, igual ao código.
      selectorExemplo: 'parede, piso, pilar, viga',
      code: [
        '// Mesmos 3 efeitos do painel "🏷️ Grupos", só que como MÉTODOS —',
        '// escolha qual roda no <select> "método" desta linha (ao lado do',
        '// seletor). Preencha a "entrada para seletores" desta linha (ex.:',
        '// .ap, andar=0) — as 3 funções abaixo usam `Select()` sem',
        '// argumento nenhum, que pega ESSE seletor automaticamente.',
        '// IMPORTANTE: isso só funciona porque a "entrada para seletores"',
        '// da linha foi preenchida. Se ela ficar vazia, `Select()` sem',
        '// argumento NÃO seleciona "tudo" — ela não seleciona NADA (a',
        '// função roda, mas não afeta nenhum objeto). Ou seja: `Select()`',
        '// sozinho sempre usa o seletor externo da linha; se quiser afetar',
        '// tudo mesmo sem preencher a entrada externa, troque por',
        '// `Select(\'*\')` dentro da função.',
        '//',
        '// SELETOR: "piso" (sem ponto) vs ".piso" (com ponto) — diferença',
        '// importante, vale pra qualquer seletor deste script ou da',
        '// "entrada para seletores": "piso" (sem ponto) é um SELETOR DE',
        '// TIPO — só bate no objeto cujo TIPO cadastrado é exatamente',
        '// "Piso". ".piso" (com ponto) é um SELETOR DE CLASSE — bate em',
        '// QUALQUER objeto (de qualquer tipo) que tenha "piso" cadastrado',
        '// como uma das CLASSES dele (nas propriedades do objeto), mesmo',
        '// não sendo do tipo "Piso". Mesma lógica de CSS: `div` (elemento)',
        '// vs `.div` (classe chamada "div", que pode estar em qualquer',
        '// elemento).',
        '//',
        '// "— código de nível superior —" (a opção vazia do <select> de',
        '// método): significa "nenhuma função — só o código deste script',
        '// que já roda solto, fora de qualquer function". É o que sempre',
        '// roda primeiro, SEMPRE, mesmo quando uma função é escolhida no',
        '// <select> — escolher uma função aqui não troca o que roda, só',
        '// ACRESCENTA um passo extra: 1º todo o código de nível superior',
        '// deste script (mesmo que seja só as 3 declarações de função',
        '// abaixo, sem nada pra "fazer" de verdade); 2º, só então, a',
        '// função escolhida no <select>.',
        '//',
        '// TROCAR O TEXTO DAS OPÇÕES DO <SELECT> "MÉTODO" (ex.: em vez de',
        '// "Ocultar()"/"Opacidade()"/"Destacar()", mostrar "🚫 Ocultar"/',
        '// "🌗 Opacidade"/"✨ Destacar") — dá pra fazer isso por SELEÇÃO NO',
        '// DOM mesmo, direto de dentro do script (sem precisar editar o app):',
        '// as opções ficam dentro de `<select class="map-grupos-efeito-select"',
        '// data-acao="metodo">`, uma por FUNÇÃO encontrada no código deste',
        '// script, com o texto = "NomeDaFunção()" (ver `<option>` montada em',
        '// `_scriptRowHtml`, js/mapview.js). Feito de verdade (não só',
        '// comentado) dentro de `Start()` abaixo — ver o comentário grande',
        '// dela pra ligar os pontos.',
        '//',
        '// ALTERNATIVA — em vez de chamar a FUNÇÃO .hide() da coleção, dá',
        '// pra alternar a própria PROPRIEDADE do objeto direto, sem chamar',
        '// nada (ver dentro de Ocultar() abaixo). Só Ocultar tem essa',
        '// alternativa — Opacidade/Destacar são sempre REGRAS (permitem',
        '// combinar vários seletores/valores ao mesmo tempo), não um campo',
        '// solto no objeto.',
        '',
        '// FUNÇÃO "Start()" — nome fixo, roda 1 ÚNICA VEZ, sozinha (nunca',
        '// precisa ser escolhida no <select> de "método", nem aparece lá)',
        '// — o app chama automaticamente, ANTES de qualquer efeito',
        '// (Ocultar/Opacidade/Destacar), só na 1ª execução deste script',
        '// desde que a página carregou (clicar em 👁️/🚫 de novo depois',
        '// NÃO a roda outra vez, até recarregar a página ou editar este',
        '// código — ver comentário grande em automation.js `run()`). Bom',
        '// lugar pra preparar valores/objetos que Ocultar/Opacidade/',
        '// Destacar vão usar depois. Declarada PRIMEIRO aqui só por',
        '// organização de leitura (a ORDEM de declaração não muda nada em',
        '// qual função roda quando). Vem com "// @ocultarMetodo" acima —',
        '// já roda sozinha automaticamente; remova essa linha se quiser',
        '// que ela também apareça no <select> de "método" (rodaria de',
        '// novo, manualmente, ALÉM da 1ª vez automática).',
        '// @ocultarMetodo',
        'function Start() {',
        '  // Troca o TEXTO das opções do <select> de "método" — de',
        '  // "Ocultar()"/"Opacidade()"/"Destacar()" pra "🚫 Ocultar"/',
        '  // "🌗 Opacidade"/"✨ Destacar". Duas formas equivalentes — só UMA',
        '  // delas ativa por vez (a de cima, `forEach`); a de baixo ("cada',
        '  // um independente") fica comentada só como referência:',
        '  //',
        '  // EXEMPLO COM `forEach` — 1 loop só, um mapa nome->emoji decide o',
        '  // texto novo de cada <option> encontrada (bate em QUALQUER',
        '  // <select> de método na tela, de qualquer script — ver CUIDADO 1',
        '  // abaixo) — é a versão ATIVA (de verdade, não comentada) deste',
        '  // script:',
        '  document',
        '    .querySelectorAll(\'select[data-acao="metodo"] option\')',
        '    .forEach((opt) => {',
        '      const troca = { Ocultar: \'🚫 Ocultar\', Opacidade: \'🌗 Opacidade\', Destacar: \'✨ Destacar\' };',
        '      if (troca[opt.value]) opt.textContent = troca[opt.value];',
        '    });',
        '  //',
        '  // EXEMPLO "CADA UM INDEPENDENTE" (SEM `forEach`/loop nenhum) — 3',
        '  // comandos separados, um por vez, cada <option> achada direto',
        '  // pelo próprio `value` dela (o `value` é sempre o NOME da função',
        '  // de verdade, ex. `value="Ocultar"` — só o TEXTO mostrado muda; o',
        '  // que o app usa pra decidir qual função rodar continua intacto).',
        '  // Mais repetitivo que o `forEach` acima, mas cada linha se lê',
        '  // sozinha, sem precisar entender um mapa/loop — comentada, só de',
        '  // referência (deixe só UMA das duas versões ativa por vez):',
        '  //',
        '  //   const optOcultar = document.querySelector(\'select[data-acao="metodo"] option[value="Ocultar"]\');',
        '  //   if (optOcultar) optOcultar.textContent = \'🚫 Ocultar\';',
        '  //   const optOpacidade = document.querySelector(\'select[data-acao="metodo"] option[value="Opacidade"]\');',
        '  //   if (optOpacidade) optOpacidade.textContent = \'🌗 Opacidade\';',
        '  //   const optDestacar = document.querySelector(\'select[data-acao="metodo"] option[value="Destacar"]\');',
        '  //   if (optDestacar) optDestacar.textContent = \'✨ Destacar\';',
        '  //',
        '  // CUIDADO 1 — com MAIS de um script na lista: `document.',
        '  // querySelector` acha o PRIMEIRO <select> de método que existir',
        '  // na tela (de QUALQUER script, não necessariamente este). Pra',
        '  // acertar só o <select> DESTE script, escreva o seletor com o id',
        '  // dele, ex.: `document.querySelector(\'[data-id="ID_DO_SCRIPT"]',
        '  // select[data-acao="metodo"] option[value="Ocultar"]\')` (o id',
        '  // aparece no atributo `data-id` da linha, no DOM).',
        '  // CUIDADO 2 — a troca não é permanente: o <select> nasce de novo',
        '  // (com o texto original "Ocultar()") sempre que esta LINHA é',
        '  // redesenhada por completo (ex.: ao voltar de "Ver/editar',
        '  // código") — só sobrevive a cliques comuns no botão 👁️/🚫 (que',
        '  // só atualizam o próprio botão, sem redesenhar a linha toda) —',
        '  // mas como Start() só roda 1x mesmo (ver comentário grande dela',
        '  // acima), a troca só volta a valer de novo editando este código',
        '  // (rearma Start()) ou recarregando a página.',
        '}',
        '',
        'function Ocultar() {',
        '  // .hide() é a versão SIMPLES de ocultar: só desenha ou não',
        '  // desenha o objeto (2D e 3D) — igual visibility:hidden no DOM,',
        '  // o objeto continua de verdade na cena (raycastável, "em',
        '  // funcionamento"), só não aparece. Pra fazer aparecer de volta,',
        '  // o método é o .show() (não é "Ocultar de novo" nem nada disso —',
        '  // é a função OPOSTA, .show()).',
        '  Select().hide();',
        '  // ALTERNATIVA (propriedade direta, sem chamar função):',
        '  // Select().visibility = false;',
        '  //',
        '  // PRA FAZER APARECER DE VOLTA (função OPOSTA — não tem exemplo',
        '  // separado aqui embaixo porque é só isto):',
        '  //   Select().show();',
        '  // ALTERNATIVA (propriedade direta, sem chamar função):',
        '  //   Select().visibility = true;',
        '}',
        '',
        '// .opacity(v) é a versão em MÉTODO — troque 0.35 pelo nível que',
        '// quiser (0 a 1). Igual a Ocultar, também dá pra trocar a',
        '// propriedade direto, sem chamar a função (ver ALTERNATIVA abaixo).',
        'function Opacidade() {',
        '  Select().opacity(0.35);',
        '  // ALTERNATIVA (propriedade direta, sem chamar função):',
        '  // Select().opacidade = 0.35;',
        '}',
        '',
        'function Destacar() {',
        '  Select().highlight();',
        '}',
      ].join('\n') + GANCHOS_CICLO_VIDA_BOILERPLATE,
    },
    // [27/09/2026] NOVO — pedido verbatim: "No 'Scripts', faça um outro
    // Modelo, agora selecionando um objeto específico e atribuindo
    // diretamente a sua propriedade visibility, sem chamar funções como
    // 'hide()' ou 'show()'." Usa `Object(nome)` (ver comentário grande no
    // topo do arquivo — equivalente a bpy.data.objects['Nome'] do
    // Blender; [27/09/2026] renomeado de `Objeto` pra `Object`) em vez de
    // `Select(seletor)`: um objeto ESPECÍFICO pelo Nome dele, não um
    // GRUPO pelo seletor.
    {
      id: 'objeto-por-nome-visibility',
      categoria: '',
      label: '🎯 Objeto específico por nome — visibility direto',
      code: [
        '// Troque \'NomeDoObjeto\' pelo Nome de verdade do objeto (aba',
        '// "Propriedades" dele, campo "Nome" — o mesmo que aparece em',
        '// SceneObjects/bpy.data.objects[\'Nome\'] do Blender).',
        '',
        'const obj = Object(\'NomeDoObjeto\');',
        '',
        'if (obj) {',
        '  // Atribuição DIRETA da propriedade — sem chamar .hide()/.show()',
        '  // nem Select() nenhum. Funciona em 2D e 3D (AO VIVO, sem',
        '  // precisar sair/entrar do "Ver em 3D" de novo).',
        '  obj.visibility = false; // true = visível (padrão), false = oculto',
        '',
        '  // Qualquer outra propriedade do objeto pode ser lida/escrita do',
        '  // mesmo jeito, ex.: obj.x, obj.y, obj.angulo, obj.cor...',
        '} else {',
        '  console.warn(\'Objeto não encontrado — confira o Nome exato.\');',
        '}',
      ].join('\n') + START_STUB + GANCHOS_CICLO_VIDA_BOILERPLATE,
    },
    // [27/09/2026] NOVO — pedido verbatim: "Coloque como um dos modelos de
    // script o 'Faça tudo aparecer'. Este script faz tudo ficar visível
    // apenas isto. Se tem na cena 64 objetos e apenas 42 estão aparecendo,
    // então, faz com que os 64 objetos da cena apareçam (visibility=true,
    // opacity=1 e quaisquer outras propriedades que façam o objeto não
    // aparecer)." — usa `Select('*')` (seletor "asterisco" = bate TODOS os
    // objetos da cena, ver `_atomMatches`; diferente de `Select()` SEM
    // NADA, que não bate nada a menos que a "entrada para seletores" da
    // linha esteja preenchida — ver comentário grande de `SelectFn`) +
    // `.show()` (visibility=true) + `.opacity(1)` (opacidade=100%) — as
    // duas propriedades reais do app capazes de deixar um objeto
    // "invisível" mesmo continuando presente na cena (ver comentário
    // grande de `.hide()`/`.show()` acima). O app não tem campo de escala
    // por objeto hoje, por isso não entra nesta lista.
    {
      id: 'fazer-tudo-aparecer',
      categoria: '',
      label: '👁️‍🗨️ Faça tudo aparecer',
      code: [
        '// Faz TODOS os objetos da cena ficarem visíveis — útil depois de',
        '// testes com scripts de ocultação, ou se algum objeto ficou',
        '// escondido sem querer.',
        '',
        '// \'*\' = todos os objetos da cena (equivalente a selecionar tudo',
        '// em bpy.data.objects do Blender).',
        'Select(\'*\').show();       // visibility = true',
        'Select(\'*\').opacity(1);   // opacidade = 100%',
      ].join('\n') + START_STUB + GANCHOS_CICLO_VIDA_BOILERPLATE,
    },
    // [27/09/2026] NOVO — pedido verbatim: "Assim como a o script modelo
    // 'Faça tudo aparecer', deve haver o script modelo 'Faça tudo
    // desaparecer'." Espelho do modelo anterior — `Select('*').hide()`
    // (visibility=false) em tudo. Não zera a opacidade (deixa como está)
    // — "desaparecer" aqui é OCULTAR (não desenhar), não "ficar
    // transparente"; quem quiser opacidade 0 também pode chamar
    // `Select('*').opacity(0)` à parte.
    {
      id: 'fazer-tudo-desaparecer',
      categoria: '',
      label: '🫥 Faça tudo desaparecer',
      code: [
        '// Oculta TODOS os objetos da cena de uma vez — útil pra "limpar a',
        '// tela" antes de mostrar só um seletor específico com outro',
        '// script/o painel "Grupos", sem precisar ocultar objeto por objeto.',
        '',
        '// \'*\' = todos os objetos da cena.',
        'Select(\'*\').hide(); // visibility = false',
      ].join('\n') + START_STUB + GANCHOS_CICLO_VIDA_BOILERPLATE,
    },
    // [27/09/2026] NOVO — pedido verbatim: "Acrescente ao Modelo um script
    // de exemplo, para fazer os gabinetes, monitores, teclados e mouses
    // levitarem em relação as suas posições relativas e ficarem,
    // suavemente, indo para cima e para baixo 'no ar'." Usa `.animate()`
    // (já existente — Tween.js de verdade por baixo, ver comentário
    // grande dela) com valor RELATIVO (`"+=0.06"`) — cada objeto sobe a
    // partir da PRÓPRIA elevação atual (não todos pro mesmo valor
    // absoluto), `yoyo:true` + `repeat:Infinity` pro vai-e-volta suave e
    // contínuo até "↩️ Desexecutar".
    //
    // SOBRE O SELETOR — pedido verbatim: "O seletor acaba ficando
    // 'gabinete, monitor, teclado, mouse'. Se houver algum tipo de
    // conflito no código, por exemplo, sobre o objeto mouse (pois há o
    // objeto mouse e o objeto mouse ergonômico), então, implemente algum
    // jeito de tornar genérica esta seleção. Senão, no seletor, acabará
    // ficando 'mouse, mouse-ergonomico'." — um seletor de TIPO com palavra
    // solta (`mouse`) bate só o valor EXATO (`entity.tipo === 'mouse'`,
    // ver `_atomMatches`), então um tipo de catálogo futuro tipo
    // 'mouse-ergonomico' precisaria mesmo ser listado à parte. A seleção
    // GENÉRICA já existe pronta no motor — `[atributo^=valor]` (ver
    // `_attrAtomMatches`, mesma sintaxe CSS de "começa com") — então em
    // vez de listar cada variante à mão, `[tipo^=mouse]` bate QUALQUER
    // tipo que COMECE com "mouse" (mouse, mouse2, mouse-ergonomico, o que
    // vier a existir no catálogo), sem precisar editar o seletor de novo
    // a cada tipo novo. Mesma ideia aplicada a gabinete/monitor/teclado
    // (cobre "gabinete2"/"monitor2"/"teclado2" do catálogo, que já são,
    // por natureza, variantes visuais do mesmo objeto).
    {
      id: 'levitar-perifericos',
      categoria: '',
      label: '🎈 Levitação suave (gabinete/monitor/teclado/mouse)',
      selectorExemplo: '[tipo^=gabinete], [tipo^=monitor], [tipo^=teclado], [tipo^=mouse]',
      code: [
        '// Faz gabinetes, monitores, teclados e mouses flutuarem "no ar",',
        '// subindo e descendo suavemente em relação à posição de cada um',
        '// (não faz sentido só olhando o mapa 2D, de cima — o efeito é 3D).',
        '//',
        '// SELETOR desta linha: "[tipo^=gabinete], [tipo^=monitor],',
        '// [tipo^=teclado], [tipo^=mouse]" — `[tipo^=mouse]` bate QUALQUER',
        '// tipo que COMECE com "mouse" (ex.: mouse, mouse2, um eventual',
        '// "mouse-ergonomico"...), sem precisar listar cada variante à mão',
        '// (mesma ideia pra gabinete/monitor/teclado — cobre as variantes',
        '// "2" do catálogo automaticamente). Troque o seletor se quiser',
        '// levitar outra coisa.',
        '',
        '// `.animate()` com valor RELATIVO ("+=0.06") — cada objeto sobe a',
        '// partir da PRÓPRIA elevação atual, não todos pro mesmo valor',
        '// absoluto. `yoyo:true` faz ele voltar (desce de novo) e',
        '// `repeat:Infinity` mantém o ciclo pra sempre, até "↩️',
        '// Desexecutar" (que devolve a elevação original de cada um).',
        'Select().animate(',
        '  { elevacao: \'+=0.06\' },',
        '  1400,',
        '  { yoyo: true, repeat: Infinity, easing: TWEEN.Easing.Sinusoidal.InOut },',
        ');',
        '',
        '// ALTERNATIVA SEM Tween.js — mesmo efeito com JAVASCRIPT PURO (só',
        '// matemática de seno + requestAnimationFrame, sem `TWEEN`/',
        '// `.animate()` nenhum). Comentada de propósito — deixe só UMA das',
        '// duas versões ativa por vez (a `.animate()` acima já cobre isso',
        '// de sobra; esta aqui é só de referência/estudo).',
        '//',
        '// PARAR JUNTO COM O BOTÃO 👁️/🚫 — a versão com `.animate()` acima',
        '// para SOZINHA (o app cancela o tween automaticamente, ver',
        '// `_cleanups` em automation.js), mas um laço de',
        '// `requestAnimationFrame` CRU, escrito à mão, não tem esse',
        '// gerenciamento — sem mais nada, ele continuaria rodando PRA',
        '// SEMPRE, mesmo depois de Desexecutar. Por isso usa os ganchos',
        '// `AoExecutarScript()`/`AoDesexecutarScript()` (chamados',
        '// automaticamente pelo app — o 1º ao clicar no botão pra Executar,',
        '// o 2º ao clicar de novo pra Desexecutar, mesmo sem escolher nenhum',
        '// método no <select>): o id do `requestAnimationFrame` fica numa variável',
        '// `let` de nível superior (fora das duas funções), compartilhada',
        '// entre elas — é assim que `AoDesexecutarScript()` sabe o que',
        '// cancelar depois.',
        '//',
        '//   let _raf = null; // nível superior — compartilhada por AoExecutarScript/AoDesexecutarScript',
        '//',
        '//   function AoExecutarScript() {',
        '//     if (_raf) return; // já está rodando (evita empilhar 2+ laços se "Executar" for clicado de novo sem "Desexecutar" antes)',
        '//     const _elevBase = new Map(); // objeto -> elevação ORIGINAL (o "centro" do vai-e-vem)',
        '//     const _t0 = performance.now();',
        '//     const _amplitude = 0.06;     // mesma amplitude do .animate() acima ("+=0.06")',
        '//     const _periodoMs = 1400;     // mesma duração de 1 ciclo (subir + descer)',
        '//     (function _tickLevitarJsPuro() {',
        '//       const tSeg = (performance.now() - _t0) / 1000;',
        '//       Select().each((o) => {',
        '//         if (!_elevBase.has(o)) _elevBase.set(o, o.elevacao || 0); // guarda na 1ª vez que VÊ este objeto',
        '//         const base = _elevBase.get(o);',
        '//         o.elevacao = base + Math.sin(tSeg * (2 * Math.PI * 1000 / _periodoMs)) * _amplitude;',
        '//       });',
        '//       _raf = requestAnimationFrame(_tickLevitarJsPuro);',
        '//     })();',
        '//   }',
        '//',
        '//   function AoDesexecutarScript() {',
        '//     if (_raf) cancelAnimationFrame(_raf);',
        '//     _raf = null;',
        '//   }',
        '//',
        '// Com isso, o botão 👁️/🚫 (Executar/Desexecutar) liga/desliga o',
        '// laço igual faria com a versão de Tween.js — sem precisar de nada no',
        '// console do navegador. Ainda assim, a versão de cima',
        '// (`.animate()`/Tween.js) continua a recomendada de verdade pra',
        '// este modelo — esta aqui é só de referência/estudo.',
      ].join('\n') + START_STUB + GANCHOS_CICLO_VIDA_BOILERPLATE,
    },
  ],

  async load() {
    this._scripts = await window.DB.getSetting('automationScripts', []);
    this._loaded = true;
    return this._scripts;
  },

  list() {
    return this._scripts;
  },

  async _persist() {
    await window.DB.setSetting('automationScripts', this._scripts);
  },

  async create({ nome, codigo, selector, map } = {}) {
    const s = {
      id: window.Utils.uid('automation'),
      nome: (nome || 'Novo script').trim() || 'Novo script',
      codigo: codigo != null ? codigo : this.DEFAULT_SCRIPT_TEMPLATE,
      // [27/09/2026] NOVO — pedido verbatim: "a 'entrada para seletores'...
      // se estiver vazia [...] não foi definido seletores por aquela
      // entrada [...] se a entrada de seletores não estiver vazia, dá pra
      // capturar dentro do script por algum método e usar no script os
      // seletores definidos naquela entrada." `selector` é essa entrada —
      // ver `run()` abaixo (`Select()` sem argumento usa este valor como
      // fallback) e `metodo` (nome de uma função de nível superior do
      // próprio `codigo`, extraída com `Components.extractFunctionNames` —
      // MESMO mecanismo do <select> "método" da folha de '🧩 Componentes'
      // — chamada depois do código de nível superior rodar, se marcada).
      // [27/09/2026] NOVO — pedido verbatim: "ao selecionar o Modelo
      // 'Ocultar / Opacidade / Destacar', deve vir como exemplo, no
      // seletor, 'parede, piso, pilar, viga'. Atualmente, só o código é
      // carregado e o seletor fica vazio." Modelos agora podem declarar
      // `selectorExemplo` (ver `SCRIPT_TEMPLATES` abaixo) — `create()`
      // aceita `selector` opcional pra pré-preencher esta entrada junto
      // com o código, em vez de sempre nascer vazia.
      selector: typeof selector === 'string' ? selector : '',
      metodo: '',
      // [27/09/2026] NOVO — pedido verbatim: "Deve haver algum jeito de
      // tornar a execução do script permanente [...] executar um script e
      // suas alterações permanecerem, mesmo excluindo o script. Por
      // padrão, atualmente, volta ao que era antes, isto deve ser
      // opcional." Por padrão (`false`) o comportamento continua IGUAL a
      // sempre: "↩️ Desexecutar" (e excluir um script em execução, que já
      // chama `stop()` antes — ver `remove()`) desfaz TUDO (rollback via
      // `snapshot`/`cleanups`/`tweens`, ver `stop()` abaixo). Marcado como
      // `true`, `stop()` continua chamando os ganchos/parando tweens
      // normalmente (parar uma animação continua parando), mas NÃO restaura
      // as propriedades ao valor de antes — o que o script deixou fica,
      // pra sempre, mesmo desexecutando ou excluindo o script depois.
      persistirAoParar: false,
      criadoEm: window.DB.nowISO(),
      atualizadoEm: window.DB.nowISO(),
    };
    this._scripts.push(s);
    await this._persist();
    // [27/09/2026] NOVO — pedido verbatim: "são 4 métodos gerais
    // relacionados aos scripts: AoCriarScript(), AoExcluirScript(),
    // AoExecutarScript() [...] e AoDesexecutarScript()." `map` é opcional
    // (quem chama `create()` sem um mapa aberto, ex.: importação de
    // backup, simplesmente não dispara o gancho — nada pra selecionar sem
    // mapa mesmo). Ver `_dispararGanchoTransitorio` abaixo.
    if (map) this._dispararGanchoTransitorio(map, s, 'AoCriarScript');
    return s;
  },

  /** [26/09/2026] NOVO — pedido verbatim: "no botão dos scripts coloque os
   *  exemplos funcionais já implementados [...] coloque os 8 exemplos que
   *  estão em 'assets/exemplos/'." Scripts são GLOBAIS (`DB.getSetting`),
   *  não vivem dentro de um mapa — então um mapa de exemplo entregue como
   *  backup só consegue "vir com os scripts prontos" se o próprio backup
   *  carregar uma lista `scripts` (ver `dump.scripts`/`_openImportModal` em
   *  js/settings.js) e essa lista for importada aqui, preservando o `id` de
   *  origem (upsert — igual a como mapas já são importados por id, `DB.
   *  importMaps`) — reimportar o mesmo backup nunca duplica. */
  async importScripts(list) {
    if (!Array.isArray(list) || !list.length) return false;
    if (!this._loaded) await this.load();
    let mudou = false;
    list.forEach((s) => {
      if (!s || !s.id || !s.codigo) return;
      const novo = {
        id: s.id,
        nome: (s.nome || 'Script').trim() || 'Script',
        codigo: s.codigo,
        selector: typeof s.selector === 'string' ? s.selector : '',
        metodo: typeof s.metodo === 'string' ? s.metodo : '',
        persistirAoParar: !!s.persistirAoParar,
        criadoEm: s.criadoEm || window.DB.nowISO(),
        atualizadoEm: window.DB.nowISO(),
      };
      const idx = this._scripts.findIndex((x) => x.id === s.id);
      if (idx === -1) this._scripts.push(novo); else this._scripts[idx] = novo;
      mudou = true;
    });
    if (mudou) await this._persist();
    return mudou;
  },

  get(id) {
    return this._scripts.find((s) => s.id === id) || null;
  },

  async rename(id, novoNome) {
    const s = this.get(id);
    if (!s) return false;
    const nome = String(novoNome || '').trim();
    if (!nome) return false;
    s.nome = nome;
    s.atualizadoEm = window.DB.nowISO();
    await this._persist();
    return true;
  },

  async updateCode(id, codigo) {
    const s = this.get(id);
    if (!s) return false;
    s.codigo = codigo;
    s.atualizadoEm = window.DB.nowISO();
    await this._persist();
    // [27/09/2026] NOVO — ver `_startJaRodou`/comentário grande de `run()`:
    // editar o código "rearma" `Start()` (pode ter lógica de inicialização
    // nova) — sem isto, uma vez rodada, `Start()` nunca rodaria de novo
    // nem editando o script, só recarregando a página inteira.
    this._startJaRodou?.delete(id);
    return true;
  },

  /** [27/09/2026] NOVO — "entrada para seletores" da janela '🎬 Scripts'
   *  (ver comentário grande de `create()` acima e `run()` abaixo). */
  async updateSelector(id, selector) {
    const s = this.get(id);
    if (!s) return false;
    s.selector = String(selector || '');
    s.atualizadoEm = window.DB.nowISO();
    await this._persist();
    return true;
  },

  /** [27/09/2026] NOVO — "seleção do método" da janela '🎬 Scripts', mesmo
   *  espírito do <select> de método da folha de '🧩 Componentes': qual
   *  função de nível superior do próprio `codigo` (ver
   *  `Components.extractFunctionNames`) roda depois do código de nível
   *  superior — '' (vazio) = nenhuma, só o código de nível superior mesmo
   *  (comportamento de sempre). */
  async updateMetodo(id, metodo) {
    const s = this.get(id);
    if (!s) return false;
    s.metodo = String(metodo || '');
    s.atualizadoEm = window.DB.nowISO();
    await this._persist();
    return true;
  },

  /** [27/09/2026] NOVO — liga/desliga o campo `persistirAoParar` (ver
   *  comentário grande de `create()`) — checkbox "manter alterações" da
   *  linha do script. */
  async updatePersistirAoParar(id, persistir) {
    const s = this.get(id);
    if (!s) return false;
    s.persistirAoParar = !!persistir;
    s.atualizadoEm = window.DB.nowISO();
    await this._persist();
    return true;
  },

  async remove(id, map) {
    if (this.isRunning(id)) this.stop(map || null, id); // desexecuta antes de excluir, nunca deixa efeito "órfão" no mapa (respeita persistirAoParar, ver stop())
    const script = this.get(id);
    // [27/09/2026] NOVO — gancho `AoExcluirScript()` (ver comentário grande
    // de `create()`/`AoCriarScript`) — dispara ANTES de apagar o script da
    // lista, senão `this.get(id)` já não acharia mais nada pra rodar.
    if (map && script) this._dispararGanchoTransitorio(map, script, 'AoExcluirScript');
    const i = this._scripts.findIndex((s) => s.id === id);
    if (i === -1) return false;
    this._scripts.splice(i, 1);
    await this._persist();
    return true;
  },

  /** [27/09/2026] NOVO — dispara um dos 2 ganchos "transitórios"
   *  (`AoCriarScript()`/`AoExcluirScript()`, ver comentário grande de
   *  `create()`) — diferente de `AoExecutarScript()`/`AoDesexecutarScript()`
   *  (ligados a um `run()`/`stop()` de verdade, com botão próprio,
   *  guardados em `_runState`), estes 2 disparam sozinhos, uma vez, no
   *  momento de criar/excluir o script — SEM deixar o script marcado como
   *  "em execução" (o botão 👁️/🚫 da linha continua refletindo só
   *  `run()`/`stop()` de verdade). Como não existe um "código só com as
   *  declarações de função" separado do "código que roda de verdade" neste
   *  motor (funções e código de nível superior vivem no mesmo `codigo`),
   *  disparar UM gancho aqui necessariamente executa TODO o código de
   *  nível superior do script (mesma mecânica de `run()`, só que sem
   *  `metodo`/`AoExecutarScript()` — só o gancho pedido). Pra
   *  não surpreender quem só quis "criar" ou "excluir" um script (e não
   *  necessariamente RODAR o que ele faz), o rastreamento de propriedades
   *  feito nesse meio tempo é desfeito no final — a MENOS que
   *  `script.persistirAoParar` esteja marcado (mesma regra de `stop()`,
   *  reaproveitada aqui: "quero que fique permanente" vale pra qualquer
   *  jeito de desligar/descartar o script, não só pelo botão). */
  _dispararGanchoTransitorio(map, script, nomeGancho) {
    if (!map || !script) return;
    const snapshot = new Map();
    const tweens = [];
    const cleanups = [];
    const tweenProxy = this._wrapTween(tweens);
    const SelectFn = (seletor) => {
      const efetivo = (seletor != null && String(seletor).trim() !== '')
        ? seletor
        : (script.selector && String(script.selector).trim() ? script.selector : seletor);
      const coll = this._select(map, efetivo, tweenProxy, (real) => this._rastrear(real, snapshot, map));
      return coll._comEstadoDeExecucao(cleanups);
    };
    const ObjectFn = (nomeObj) => {
      const ref = window.SceneObjects?.get?.(map, nomeObj);
      if (!ref) return null;
      return this._rastrear(ref, snapshot, map);
    };
    const codigoGancho = `${script.codigo}\n;return (typeof ${nomeGancho} === 'function') ? ${nomeGancho} : null;`;
    try {
      const fn = new Function('Select', 'Object', 'TWEEN', 'THREE', 'Utils', 'SceneObjects', 'Mapping', 'map', codigoGancho);
      const hookFn = fn(SelectFn, ObjectFn, tweenProxy, window.THREE, window.Utils, window.SceneObjects, window.Mapping, map);
      if (typeof hookFn === 'function') hookFn();
    } catch (e) {
      console.warn(`[AutomationManager] ${nomeGancho}() do script "${script.nome}" falhou:`, e);
    }
    tweens.forEach((t) => { try { t.stop(); } catch (e) { /* ignora */ } });
    for (let i = cleanups.length - 1; i >= 0; i--) {
      try { cleanups[i](); } catch (e) { /* ignora */ }
    }
    if (!script.persistirAoParar) {
      snapshot.forEach((porProp, objReal) => {
        const atual = this._resolverAtual(map, objReal);
        porProp.forEach((valorAntes, prop) => {
          objReal[prop] = valorAntes;
          if (atual && atual !== objReal) atual[prop] = valorAntes;
        });
        this._agendarRefresh3DLive(map, atual || objReal);
      });
    }
  },

  isRunning(id) {
    return !!this._runState[id];
  },

  /** Envolve o `TWEEN` global (ver js/lib/tweenengine.js) numa versão que
   *  anota, numa lista própria desta execução, toda instância de
   *  `new TWEEN.Tween(...)` criada pelo script — assim `stop()` sabe
   *  exatamente quais animações são DELE (e só delas) pra parar, sem
   *  afetar tweens de outros scripts ou de qualquer outra parte do app
   *  (ex.: animações do 3D). API idêntica ao `TWEEN` de verdade — o script
   *  não percebe diferença nenhuma. */
  _wrapTween(bucket) {
    const RealTween = window.TWEEN.Tween;
    function TrackedTween(...args) {
      const t = new RealTween(...args);
      bucket.push(t);
      return t;
    }
    TrackedTween.prototype = RealTween.prototype;
    const proxy = Object.create(window.TWEEN);
    proxy.Tween = TrackedTween;
    return proxy;
  },

  /** Seleciona entidades do `map` batendo com `seletor` — motor PRÓPRIO,
   *  ver comentário grande no topo do arquivo pra spec completa (baseada
   *  na referência de seletores CSS do W3Schools). Devolve uma
   *  `SelectionCollection` cujos itens são as REFERÊNCIAS DE VERDADE (sem
   *  `wrapper`) — usada fora de um `run()` (ex.: eventual uso direto/
   *  depuração), sem rastreamento de rollback nenhum. */
  _select(map, seletor, tweenProxy, wrap = (x) => x) {
    const todas = window.SceneObjects.all(map);
    const cadeias = this._parseSelector(seletor);
    const resultado = new Map(); // ref -> entry (dedupe entre grupos "OU")
    cadeias.forEach((cadeia) => {
      let anterior = null;
      cadeia.forEach((passo) => {
        const estruturais = passo.atoms.filter((a) => this._isStructuralAtom(a));
        const simples = passo.atoms.filter((a) => !this._isStructuralAtom(a));
        // Cada "compound" (passo da cadeia) bate contra TODAS as entidades
        // do mapa — não contra o resultado do passo anterior — só a
        // RELAÇÃO com o passo anterior (via `comb`) filtra depois. Ex.:
        // `.mesa ~ .cadeira` — o lado direito procura CADEIRAS em todas as
        // entidades, e só então restringe ao(s) mesmo(s) andar(es) de quem
        // bateu `.mesa`.
        let bateram = todas.filter((e) => this._compoundMatches(e, map, simples));
        if (estruturais.length) bateram = this._applyStructuralPseudos(bateram, todas, estruturais);
        if (anterior && passo.comb) {
          // Hierarquia REAL (`paiId` — ver comentário grande no topo do
          // arquivo, seção "HIERARQUIA") tem prioridade sobre a
          // aproximação por andar: se QUALQUER lado da relação já usa
          // `paiId`, os 4 combinadores passam a significar exatamente o
          // que significam em CSS de verdade (pai/filho/irmãos), não mais
          // "mesmo andar". Objetos sem `paiId` nenhum (a maioria, hoje)
          // continuam caindo no fallback por andar, documentado no topo.
          const usaHierarquiaReal = anterior.some((e) => e.ref.paiId) || bateram.some((e) => e.ref.paiId);
          if (usaHierarquiaReal) {
            const idsAnt = new Set(anterior.map((e) => e.ref.id));
            if (passo.comb === '>') {
              bateram = bateram.filter((e) => idsAnt.has(e.ref.paiId));
            } else if (passo.comb === ' ') {
              bateram = bateram.filter((e) => this._temAncestralEm(e, idsAnt, todas));
            } else { // '+' ou '~' — irmãos "de verdade" (mesmo `paiId` de algum item do passo anterior)
              const paisAnt = new Set(anterior.map((e) => e.ref.paiId).filter(Boolean));
              bateram = bateram.filter((e) => e.ref.paiId && paisAnt.has(e.ref.paiId) && !idsAnt.has(e.ref.id));
            }
          } else {
            const andaresAnt = new Set(anterior.map((e) => window.Mapping.getAndarDaEntidade(e.ref, map)));
            bateram = bateram.filter((e) => andaresAnt.has(window.Mapping.getAndarDaEntidade(e.ref, map)));
            if (passo.comb === '+' || passo.comb === '~') {
              const refsAnt = new Set(anterior.map((e) => e.ref));
              bateram = bateram.filter((e) => !refsAnt.has(e.ref));
            }
          }
        }
        anterior = bateram;
      });
      (anterior || []).forEach((e) => resultado.set(e.ref, e));
    });
    return new SelectionCollection(Array.from(resultado.values()).map((e) => wrap(e.ref)), map, tweenProxy, wrap);
  },

  /** Sobe a cadeia de `paiId` a partir de `e` e diz se algum ANCESTRAL
   *  (não só o pai direto) tem `id` em `idsAlvo` — usado pelo combinador
   *  descendente (`A B`, espaço) quando há hierarquia real. Guarda contra
   *  ciclo (`visitados`) — nunca deveria acontecer (nada no app cria um
   *  `paiId` circular), mas um script poderia gravar um à mão. */
  _temAncestralEm(e, idsAlvo, todas) {
    const porId = new Map(todas.map((x) => [x.ref.id, x]));
    let atual = e, visitados = new Set();
    for (let i = 0; i < 64; i++) { // limite de profundidade — mesma guarda anticiclo
      const paiId = atual.ref.paiId;
      if (!paiId || visitados.has(paiId)) return false;
      visitados.add(paiId);
      if (idsAlvo.has(paiId)) return true;
      atual = porId.get(paiId);
      if (!atual) return false;
    }
    return false;
  },

  // ---------- Parser do seletor (ver spec grande no topo do arquivo) ----------

  /** `,` (OU) no nível mais alto do seletor inteiro → lista de "cadeias"
   *  (cada cadeia já dividida por combinador, ver `_splitCombinators`). */
  _parseSelector(seletor) {
    return this._splitTopLevel(String(seletor || ''), ',')
      .map((g) => this._splitCombinators(g.trim())
        .map((passo) => ({ comb: passo.comb, atoms: this._splitAtoms(passo.text) })))
      .filter((cadeia) => cadeia.length && cadeia.some((p) => p.atoms.length));
  },

  /** Divide `str` no caractere `sepChar`, ignorando ocorrências dentro de
   *  `[...]`/`(...)` (pra não quebrar `:not(.a, .b)` ou `[a=",b"]` no meio
   *  de uma vírgula "OU" de nível mais alto). */
  _splitTopLevel(str, sepChar) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of str) {
      if (ch === '[' || ch === '(') depth++;
      else if (ch === ']' || ch === ')') depth--;
      if (depth === 0 && ch === sepChar) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim()).filter(Boolean);
  },

  /** Divide uma cadeia (sem vírgulas) em "compounds" ligados por
   *  combinador (css_ref_combinators.php: ` `/`>`/`+`/`~`) — devolve
   *  `[{comb, text}]`, `comb` é `null` só no 1º compound da cadeia. */
  _splitCombinators(str) {
    const out = [];
    let depth = 0, cur = '', comb = null, viuEspaco = false;
    const empurra = () => {
      if (cur.trim()) {
        out.push({ comb: out.length === 0 ? null : (comb || (viuEspaco ? ' ' : null)), text: cur.trim() });
        cur = ''; comb = null; viuEspaco = false;
      }
    };
    for (const ch of str) {
      if (ch === '[' || ch === '(') depth++;
      else if (ch === ']' || ch === ')') depth--;
      if (depth === 0 && (ch === '>' || ch === '+' || ch === '~')) { empurra(); comb = ch; continue; }
      if (depth === 0 && /\s/.test(ch)) { empurra(); viuEspaco = true; continue; }
      cur += ch;
    }
    empurra();
    return out;
  },

  /** Divide o texto de UM "compound" nos átomos que o compõem (AND, sem
   *  espaço entre eles — ex.: `.pc:not(.desligado)[andar=0]`). */
  _splitAtoms(str) {
    const atomos = [];
    const paraDe = (ch) => '.#[:'.includes(ch);
    let i = 0;
    while (i < str.length) {
      const c = str[i];
      if (c === '*') { atomos.push('*'); i++; continue; }
      if (c === '.' || c === '#') {
        let j = i + 1;
        while (j < str.length && !paraDe(str[j]) && str[j] !== '=') j++;
        atomos.push(str.slice(i, j)); i = j; continue;
      }
      if (c === '[') {
        let depth = 1, j = i + 1;
        while (j < str.length && depth > 0) { if (str[j] === '[') depth++; else if (str[j] === ']') depth--; j++; }
        atomos.push(str.slice(i, j)); i = j; continue;
      }
      if (c === ':') {
        let j = i + 1;
        while (j < str.length && /[a-zA-Z-]/.test(str[j])) j++;
        if (str[j] === '(') {
          let depth = 1, k = j + 1;
          while (k < str.length && depth > 0) { if (str[k] === '(') depth++; else if (str[k] === ')') depth--; k++; }
          atomos.push(str.slice(i, k)); i = k;
        } else { atomos.push(str.slice(i, j)); i = j; }
        continue;
      }
      let j = i;
      while (j < str.length && !paraDe(str[j])) j++;
      if (j === i) { i++; continue; } // segurança — nunca deveria acontecer, evita loop infinito
      atomos.push(str.slice(i, j)); i = j;
    }
    return atomos;
  },

  /** AND de todos os átomos (já sem os estruturais, filtrados por quem
   *  chama) contra UMA entrada `{ref, colecao}` de `SceneObjects.all`. */
  _compoundMatches(e, map, atoms) {
    return atoms.every((atom) => this._atomMatches(e, map, atom));
  },

  _atomMatches(e, map, atom) {
    const entity = e.ref, isWall = e.colecao === 'walls';
    if (atom === '*') return true;
    if (atom === 'parede') return isWall;
    if (atom === 'piso') return entity.tipo === 'piso';
    if (atom === ':empty') return !(Array.isArray(entity.classes) && entity.classes.length);
    if (atom[0] === '.') return window.Mapping.getObjectClasses(entity).includes(atom.slice(1));
    if (atom[0] === '#') return entity.id === atom.slice(1);
    if (atom[0] === '[') return this._attrAtomMatches(entity, atom);
    if (atom.startsWith(':not(')) {
      const dentro = atom.slice(5, -1);
      const cadeiasNeg = this._parseSelector(dentro);
      // `:not(...)` compara contra um seletor SIMPLES (sem combinador) —
      // css_ref_pseudo_classes.php aceita uma lista (OU) de seletores
      // simples aqui; um `:not()` com combinador dentro é ignorado de
      // propósito (não faz sentido "negar uma relação" ponto a ponto).
      return !cadeiasNeg.some((cadeia) => cadeia.length === 1
        && this._compoundMatches(e, map, cadeia[0].atoms.filter((a) => !this._isStructuralAtom(a))));
    }
    if (atom[0] === ':') return true; // pseudo-classe estrutural (tratada em `_applyStructuralPseudos`) ou desconhecida — nunca quebra o script por um `:algo` não reconhecido
    const eq = atom.indexOf('=');
    if (eq > 0) {
      const chave = atom.slice(0, eq), valor = atom.slice(eq + 1);
      if (chave === 'andar') return String(window.Mapping.getAndarDaEntidade(entity, map)) === valor;
      return String(entity[chave] ?? '') === valor;
    }
    // palavra "solta" — SELETOR DE TIPO (como uma tag HTML): bate se
    // `entity.tipo` for exatamente essa palavra (ex.: `Select('pc, mesa')`
    // em vez de `Select('tipo=pc, tipo=mesa')` — mais parecido com CSS).
    return entity.tipo === atom;
  },

  /** `[attr]`/`[attr=v]`/`[attr!=v]`/`[attr^=v]`/`[attr$=v]`/`[attr*=v]`/
   *  `[attr~=v]` (css_selectors.php, seção "attribute") — aspas simples/
   *  duplas no valor são opcionais. */
  _attrAtomMatches(entity, atom) {
    const dentro = atom.slice(1, -1);
    const m = dentro.match(/^\s*([a-zA-Z_][\w-]*)\s*(?:(!=|\^=|\$=|\*=|~=|=)\s*("([^"]*)"|'([^']*)'|[^"'\]]*))?\s*$/);
    if (!m) return false;
    const chave = m[1], op = m[2];
    if (!op) return !!entity[chave];
    const valor = (m[4] ?? m[5] ?? m[3] ?? '').trim();
    const atual = String(entity[chave] ?? '');
    switch (op) {
      case '=': return atual === valor;
      case '!=': return atual !== valor;
      case '^=': return atual.startsWith(valor);
      case '$=': return atual.endsWith(valor);
      case '*=': return atual.includes(valor);
      case '~=': return atual.split(/\s+/).filter(Boolean).includes(valor);
      default: return false;
    }
  },

  /** Só as pseudo-classes que dependem de POSIÇÃO entre "irmãos" (mesmo
   *  `tipo`/coleção — ver comentário grande no topo, seção "COMBINADORES")
   *  — as outras (`:not`, `:empty`) já são resolvidas em `_atomMatches`,
   *  por entrada isolada, sem precisar do grupo inteiro. */
  _isStructuralAtom(atom) {
    return /^:(first-child|last-child|only-child|nth-child\(|nth-last-child\()/.test(atom);
  },

  _grupoDeIrmaos(e) {
    if (e.colecao === 'walls') return 'parede';
    return e.ref.tipo || e.colecao || '*';
  },

  _applyStructuralPseudos(bateram, todas, estruturais) {
    const porGrupo = new Map();
    todas.forEach((e) => {
      const g = this._grupoDeIrmaos(e);
      if (!porGrupo.has(g)) porGrupo.set(g, []);
      porGrupo.get(g).push(e);
    });
    return bateram.filter((e) => {
      const lista = porGrupo.get(this._grupoDeIrmaos(e)) || [];
      const i = lista.indexOf(e), n = lista.length;
      if (i < 0) return false;
      return estruturais.every((atom) => this._testeEstrutural(atom, i, n));
    });
  },

  _testeEstrutural(atom, i, n) {
    if (atom === ':first-child') return i === 0;
    if (atom === ':last-child') return i === n - 1;
    if (atom === ':only-child') return n === 1;
    const mNth = atom.match(/^:(nth-child|nth-last-child)\((.+)\)$/);
    if (mNth) {
      const pos = mNth[1] === 'nth-child' ? (i + 1) : (n - i); // 1-based, css_ref_pseudo_classes.php
      return this._testeNth(mNth[2].trim(), pos);
    }
    return true;
  },

  /** `An+B` / `odd` / `even` / `N` puro — css_ref_pseudo_classes.php
   *  (:nth-child()). */
  _testeNth(expr, pos) {
    expr = expr.trim().toLowerCase();
    if (expr === 'odd') return pos % 2 === 1;
    if (expr === 'even') return pos % 2 === 0;
    if (/^-?\d+$/.test(expr)) return pos === parseInt(expr, 10);
    const m = expr.match(/^(-?\d*)n\s*([+-]\s*\d+)?$/);
    if (m) {
      const a = m[1] === '' ? 1 : (m[1] === '-' ? -1 : parseInt(m[1], 10));
      const b = m[2] ? parseInt(m[2].replace(/\s+/g, ''), 10) : 0;
      if (a === 0) return pos === b;
      const k = (pos - b) / a;
      return k >= 0 && Number.isInteger(k);
    }
    return false;
  },

  /** Envolve CADA objeto real numa `Proxy` que grava, na 1ª ESCRITA de
   *  cada propriedade (não na 1ª leitura/seleção — a diferença importa:
   *  ver comentário grande abaixo), o valor que ela tinha antes daquela
   *  escrita, em `snapshot` (`Map<objetoReal, Map<propriedade,
   *  valorAntes>>`). Rastreamento POR PROPRIEDADE (não do objeto inteiro)
   *  de propósito — é o que permite "múltiplos scripts rodando juntos"
   *  (pedido verbatim) coexistirem de verdade sem se atropelarem: se o
   *  script A só escreve `.x` e o script B só escreve `.y` do MESMO
   *  objeto, desfazer A restaura só o `.x` que A mudou — nunca pisa no
   *  `.y` que B mudou depois, mesmo que B também tenha "tocado" (lido) o
   *  mesmo objeto via `Select()`. Uma cópia rasa do objeto INTEIRO no
   *  momento da seleção (tentativa anterior desta mesma rodada) não tinha
   *  essa garantia: qualquer prop que A nunca mudou, mas que B mudou
   *  DEPOIS de A ter "visto" o objeto, ainda assim entrava na cópia de A
   *  e era restaurada por engano ao desfazer A — reintroduzindo a mudança
   *  de B. O script em si não percebe diferença nenhuma (leitura/escrita
   *  de propriedades continuam funcionando idêntico a um objeto normal). */
  _rastrear(real, snapshot, map) {
    return new Proxy(real, {
      get(target, prop) {
        return prop === AUTOMATION_REAL ? target : target[prop];
      },
      set(target, prop, value) {
        let porProp = snapshot.get(target);
        if (!porProp) { porProp = new Map(); snapshot.set(target, porProp); }
        if (!porProp.has(prop)) porProp.set(prop, target[prop]);
        target[prop] = value;
        // [27/09/2026] NOVO — pedido verbatim: "Remova limitações por
        // reconstrução do cenário 3D [...] tudo possa ser feito AO VIVO,
        // sem a necessidade de ter que sair e entrar no 'Ver em 3D' de
        // novo [...] todas as suas propriedades em tempo real [...] sem
        // ser preciso reconstruir o cenário inteiro." Toda escrita feita
        // por um script (`.hide()`/`.opacity()`/`.move()`/`.set()`/
        // `.animate()`/etc. — QUALQUER uma, todas passam por aqui, é o
        // ÚNICO ponto de escrita real de todo `SelectionCollection`) agenda
        // um refresh — ver `AutomationManager._agendarRefresh3DLive`
        // abaixo: NUNCA reconstrói o CENÁRIO inteiro (`_rebuildScene`), só
        // a malha DESTE objeto (`Engine3D.rebuildObjectIncremental`, já
        // existente — usado até aqui só pelo painel de Transformação),
        // agrupado por quadro (`requestAnimationFrame`) pra um `.animate()`
        // com dezenas de escritas por segundo não refazer a malha dezenas
        // de vezes seguidas, só 1x por quadro de verdade.
        window.AutomationManager._agendarRefresh3DLive(map, target);
        return true;
      },
    });
  },

  /** Acha um motor 3D (`Engine3D`) VIVO mostrando o MESMO mapa que um
   *  script está manipulando — usado por `.iniciarVarredura()` pra saber se
   *  dá pra disparar um raytracing de verdade (ver comentário grande lá).
   *  Prioriza "Ver em 3D" (tela cheia, `View3D._engine`) quando aberta; cai
   *  pra Miniatura 3D do painel 'Ferramentas' da Planta Baixa
   *  (`MapView._minimapEngine`) quando não. Confere `engine.mapData?.id`
   *  pra nunca raycastar contra a cena de OUTRO mapa (ex.: o usuário abriu
   *  "Ver em 3D" de um mapa diferente do que o script está rodando). */
  _motor3DVivo(map) {
    const candidatos = [window.View3D?._engine, window.MapView?._minimapEngine];
    for (const eng of candidatos) {
      if (eng && eng.mapData && (!map?.id || eng.mapData.id === map.id)) return eng;
    }
    return null;
  },

  /** [27/09/2026] NOVO — companheiro de `_motor3DVivo`, mas devolve quem
   *  É DONO do motor (o objeto que tem `_rebuildScene()`, que sabe montar
   *  os args certos — `{ ...mapaVisivel, walls }` etc. — pra `engine.
   *  setScene(...)`) em vez do motor puro. Usado só pro fallback de
   *  PAREDE em `_flushRefresh3DLive` (ver comentário lá): paredes não têm
   *  rebuild incremental próprio, então o fallback seguro é um
   *  `_rebuildScene()` completo, e chamar `engine.setScene(map)` direto
   *  (sem os mesmos args que `_rebuildScene()` monta) seria arriscado. */
  _donoMotor3DVivo(map) {
    if (window.View3D?._engine && window.View3D._engine.mapData && (!map?.id || window.View3D._engine.mapData.id === map.id)) return window.View3D;
    if (window.MapView?._minimapEngine && window.MapView._minimapEngine.mapData && (!map?.id || window.MapView._minimapEngine.mapData.id === map.id)) return window.MapView;
    return null;
  },

  /** [27/09/2026] NOVO — fila de "objetos sujos" pra refresh 3D AO VIVO
   *  (ver comentário grande em `_rastrear` acima pro pedido/motivo
   *  completo). `Map<objetoReal, map>` — chave é o objeto real (dedupe
   *  automático: 10 escritas no mesmo objeto no mesmo quadro == 1 entrada
   *  só), valor é o `map` de qual mapa ele pertence (pra achar o motor 3D
   *  certo depois, ver `_motor3DVivo`). */
  _fila3DLive: null,
  _flushAgendado3DLive: false,

  _agendarRefresh3DLive(map, real) {
    if (!map || !real) return;
    if (!this._fila3DLive) this._fila3DLive = new Map();
    this._fila3DLive.set(real, map);
    if (this._flushAgendado3DLive) return;
    this._flushAgendado3DLive = true;
    const flush = () => this._flushRefresh3DLive();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else setTimeout(flush, 16);
  },

  /** Roda 1x por quadro (no máximo) — pra cada objeto sujo, acha o motor
   *  3D vivo (se algum "Ver em 3D"/Miniatura 3D estiver de fato mostrando
   *  o mapa dele) e reconstrói SÓ a malha DELE
   *  (`Engine3D.rebuildObjectIncremental`) — nunca `_rebuildScene()`
   *  (cenário inteiro). Objeto sem motor 3D vivo (nenhum "Ver em 3D"
   *  aberto pro mapa dele) simplesmente não faz nada aqui — o 2D já lê os
   *  campos direto a cada desenho, sem precisar de refresh nenhum. */
  _flushRefresh3DLive() {
    this._flushAgendado3DLive = false;
    const fila = this._fila3DLive;
    this._fila3DLive = null;
    if (!fila) return;
    // [27/09/2026] CORRIGIDO — CAUSA RAIZ encontrada do "Ocultar()/
    // Opacidade()/Destacar() não funciona no 3D pra PAREDE": esta função
    // chamava `engine.rebuildObjectIncremental(real)` pra QUALQUER entidade
    // suja, inclusive paredes — mas `rebuildObjectIncremental` (engine3d.js)
    // é EXCLUSIVO de objetos (`obj`/`map.objects`): ele REMOVE a malha
    // antiga da parede da cena (acha por `userData.pick.ref === real`, que
    // bate igual pra parede) e então chama `_buildOneObjectMesh`, que não
    // sabe construir parede nenhuma — resultado: a malha antiga é
    // descartada e NADA a substitui, a parede literalmente desaparece da
    // cena 3D até o próximo `_rebuildScene()` completo. Paredes não têm
    // (ainda) um rebuild incremental próprio — `addWallBox` só existe como
    // closure local de dentro de `setScene()` — então o fallback SEGURO é
    // um `_rebuildScene()` completo só quando a entidade suja for uma
    // parede (mesmo fallback já documentado/usado por
    // `View3D._liveRefreshApósMudancaGrupo`, ver view3d.js).
    const mapasParaRebuildCompleto = new Set();
    fila.forEach((map, real) => {
      const engine = this._motor3DVivo(map);
      if (!engine || !engine._ready) return;
      const ehParede = Array.isArray(map.walls) && map.walls.includes(real);
      if (ehParede) {
        mapasParaRebuildCompleto.add(map);
        return;
      }
      if (typeof engine.rebuildObjectIncremental === 'function') {
        try { engine.rebuildObjectIncremental(real); } catch (e) { console.warn('[AutomationManager] refresh 3D ao vivo:', e); }
      }
    });
    mapasParaRebuildCompleto.forEach((map) => {
      const dono = this._donoMotor3DVivo(map);
      if (dono && typeof dono._rebuildScene === 'function') {
        // [27/09/2026] NOVO — `{ liveSync: true }`: pede a via SEM `await`
        // de verdade (ver comentário grande em `View3D._rebuildScene`) —
        // sem isso, a parede só reaparecia/desaparecia um quadro (ou mais)
        // depois da mudança de verdade, por causa dos `await`s de sempre.
        try { dono._rebuildScene({ liveSync: true }); } catch (e) { console.warn('[AutomationManager] refresh 3D ao vivo (parede, rebuild completo):', e); }
      }
    });
  },

  /** Executa um script global — pedido verbatim: botão "▶️ Executar". */
  run(map, id) {
    const script = this.get(id);
    if (!script) return;
    if (!map) { window.Utils?.toast?.('Abra um mapa primeiro.', { type: 'warn' }); return; }
    if (this.isRunning(id)) { window.Utils?.toast?.(`"${script.nome}" já está em execução.`, { type: 'warn' }); return; }

    const snapshot = new Map(); // objeto real -> Map(propriedade -> valor ANTES da 1ª escrita deste script)
    const tweens = [];
    const cleanups = [];
    const tweenProxy = this._wrapTween(tweens);

    // [27/09/2026] NOVO — `Select()` SEM argumento (ou com argumento vazio)
    // agora cai no seletor da "entrada para seletores" da janela '🎬
    // Scripts' (`script.selector`), se ela tiver algo — ver comentário
    // grande de `create()` no topo do arquivo. `Select('algo')` continua
    // funcionando IGUAL a antes (o argumento explícito sempre vence): o
    // seletor externo só entra quando o script não disse nada.
    const SelectFn = (seletor) => {
      const efetivo = (seletor != null && String(seletor).trim() !== '')
        ? seletor
        : (script.selector && String(script.selector).trim() ? script.selector : seletor);
      const coll = this._select(map, efetivo, tweenProxy, (real) => this._rastrear(real, snapshot, map));
      return coll._comEstadoDeExecucao(cleanups);
    };

    // [27/09/2026] NOVO — "seleção do método" (ver comentário grande de
    // `create()`): se marcada, chama essa função de nível superior do
    // próprio código DEPOIS do código de nível superior rodar (mesma ideia
    // de Start()/Update() em '🧩 Componentes' — o `codigo` só DECLARA as
    // funções, quem decide qual roda é a seleção aqui do lado de fora).
    const metodo = (script.metodo || '').trim();
    // [27/09/2026] NOVO — pedido verbatim: "Assim como o clique de
    // ativação de script funciona para rodar o script, o clique para a
    // desativação do script deve fazer com que as coisas deixem de rodar
    // [...] implemente como funções próprias do script." Diferente da
    // "seleção do método" (`metodo` acima — UMA função, escolhida no
    // <select>, opcional), `AoExecutarScript`/`AoDesexecutarScript` são um
    // par de GANCHOS DE CICLO DE VIDA sempre chamados automaticamente, sem
    // precisar escolher nada no <select> — se o script DECLARAR essas 2
    // funções (nomes exatos), `AoExecutarScript()` roda 1x aqui (depois do
    // código de nível superior e do método escolhido, se houver) e
    // `AoDesexecutarScript()` roda 1x em `stop()` (ver `aoDesexecutarFn`
    // logo abaixo). Pensado especificamente pra scripts que iniciam algo
    // por FORA do sistema de tweens/cleanups (ex.: um
    // `requestAnimationFrame` cru, escrito à mão — ver modelo "🎈
    // Levitação suave") — sem isso, não havia NENHUM jeito de "desligar"
    // esse tipo de coisa a partir de "↩️ Desexecutar", só manualmente pelo
    // console do navegador. `AoExecutarScript`/`AoDesexecutarScript` vivem
    // no MESMO escopo de nível superior do script (mesma declaração
    // `function`), então uma variável declarada fora das duas (ex.: `let
    // raf = null;`) é compartilhada entre elas — é assim que o script
    // "lembra" o que precisa cancelar depois. Ver também `AoCriarScript()`/
    // `AoExcluirScript()` (comentário grande de `create()`/
    // `_dispararGanchoTransitorio`) — os outros 2 dos "4 métodos gerais"
    // relacionados a scripts.
    // [27/09/2026] UNIFICADO — pedido verbatim: "Se os métodos 'ao parar' e
    // AoDesexecutarScript() tratam da mesma coisa, então, unifique-os em um
    // único método." Existia um <select> próprio de "método ao parar"
    // (`script.metodoParar`), companheiro do <select> "método"/`metodo`
    // acima, mas rodando em `stop()` — redundante com o gancho fixo
    // `AoDesexecutarScript()`, que já cobre exatamente "algo pra rodar ao
    // parar". Removido — `AoDesexecutarScript()` (declarada dentro do
    // próprio código, sem precisar escolher nada em nenhum <select>) é
    // agora o ÚNICO jeito de rodar algo ao desexecutar.
    // [27/09/2026] RENOMEADO — pedido verbatim: "Então são 4 métodos gerais
    // relacionados aos scripts: AoCriarScript(), AoExcluirScript(),
    // AoExecutarScript() e AoDesexecutarScript()." Padroniza o nome dos
    // ganchos com o sufixo "Script" (mesmo padrão dos 2 novos,
    // `AoCriarScript()`/`AoExcluirScript()` — ver
    // `_dispararGanchoTransitorio` mais abaixo). [27/09/2026] REMOVIDO — os
    // nomes antigos `AoExecutar()`/`AoDesexecutar()` (sem o sufixo
    // "Script") tinham um fallback aqui, pra scripts já salvos com esses
    // nomes não quebrarem — pedido verbatim: "Pode eliminar as fallbacks
    // AoExecutar()/AoDesexecutar(), pois o app ainda está em construção e
    // o mapa que as tinha é o mesmo que estou usando, já excluí os
    // scripts que as usavam." Removido — só os nomes novos (com "Script")
    // são reconhecidos agora.
    //
    // [27/09/2026] NOVO — `Start()` (ver `_startJaRodou` acima): roda
    // DEPOIS do código de nível superior, mas ANTES do "método"/
    // `AoExecutarScript()` — pensada pra preparar valores/chamar funções
    // que o "método" (ou qualquer efeito manual) vai usar depois — e SÓ
    // NA 1ª VEZ (`!${startJaRodou}` — literal `true`/`false` já resolvido
    // ANTES de montar `codigoFinal`, com o valor de ANTES desta chamada).
    const startJaRodou = this._startJaRodou.has(id);
    // O `return` no final devolve a função que `stop()` (mais abaixo) vai
    // precisar mais tarde — SEM re-executar o código do script: só o
    // `run()` roda `codigoFinal` de verdade; `stop()` só CHAMA a função
    // que já foi capturada aqui.
    const codigoFinal = `${script.codigo}\n;(typeof Start === 'function' && !${startJaRodou}) && Start();\n${metodo ? `;(typeof ${metodo} === 'function') && ${metodo}();\n` : ''};(typeof AoExecutarScript === 'function') && AoExecutarScript();\n;return { aoDesexecutarFn: (typeof AoDesexecutarScript === 'function') ? AoDesexecutarScript : null };`;

    // [27/09/2026] NOVO — pedido verbatim: "No programa de modelagem 3D
    // Blender, é possível selecionar um objeto dentre todos os objetos da
    // cena por meio de bpy.data.objects['NomeDoObjeto']. Deve ter algum
    // jeito de poder selecionar um objeto [...] no app também." Essa busca
    // por nome já EXISTIA pronta — `SceneObjects.get(map, nome)`, o próprio
    // equivalente literal a `bpy.data.objects[...]` (já citado no comentário
    // dela) — só nunca tinha sido exposta como uma função própria pro
    // código do script chamar direto (só dava pra usar via
    // `SceneObjects.get(map, 'Nome')`, mais verboso). `Object(nome)` aqui é
    // só um atalho — acha o objeto pelo nome e devolve ele já "rastreado"
    // (mesmo Proxy de `Select()`, com rollback automático em "↩️
    // Desexecutar" e refresh 3D ao vivo de brinde) pra permitir atribuição
    // DIRETA de propriedade (`Object('AP1').visibility = false`), sem
    // precisar de `.set()`/`.hide()` nem embrulhar num `SelectionCollection`
    // de 1 item. Devolve `null` se não achar nenhum objeto com esse nome.
    // [27/09/2026] RENOMEADO de `Objeto` pra `Object` (pedido verbatim, pra
    // ficar padronizado em inglês como `visibility`) — sombreia o `Object`
    // nativo do JS dentro do escopo do script (tradeoff aceito a pedido).
    const ObjectFn = (nome) => {
      const ref = window.SceneObjects?.get?.(map, nome);
      if (!ref) { console.warn(`[AutomationManager] Object('${nome}') — nenhum objeto com esse nome encontrado.`); return null; }
      return this._rastrear(ref, snapshot, map);
    };

    let aoDesexecutarFn = null;
    try {
      const fn = new Function('Select', 'Object', 'TWEEN', 'THREE', 'Utils', 'SceneObjects', 'Mapping', 'map', codigoFinal);
      // [27/09/2026] NOVO — `codigoFinal` agora TERMINA com um `return`
      // (ver comentário grande dela) que devolve `{ aoDesexecutarFn }`: a
      // própria função `AoDesexecutarScript` do script (ou `null`, se ele
      // não declarar nenhuma) — guardada aqui pra `stop()` poder chamá-la
      // depois, sem precisar RE-EXECUTAR o código do script (salva em
      // `_runState[id]`).
      const resultado = fn(SelectFn, ObjectFn, tweenProxy, window.THREE, window.Utils, window.SceneObjects, window.Mapping, map);
      aoDesexecutarFn = resultado?.aoDesexecutarFn || null;
      // [27/09/2026] NOVO — marca `Start()` como "já rodou" (ver
      // `_startJaRodou` acima) — sempre, mesmo se o script não declarar
      // `Start` nenhuma (inofensivo: a próxima `run()` só checa
      // `typeof Start === 'function'`, então marcar aqui não afeta scripts
      // sem essa função). SÓ marca numa execução que chegou até aqui SEM
      // erro — um erro ANTES da linha do `Start()` (ver `codigoFinal`
      // acima) não deveria "gastar" a única chance dele rodar de verdade.
      this._startJaRodou.add(id);
      // [27/09/2026] NOVO — ver `getLastError`/comentário grande dela: uma
      // execução que chega até aqui sem cair no catch abaixo "limpa" o
      // último erro guardado (o código atual da folha já não tem mais
      // aquele problema).
      this._lastRunErrors.delete(id);
    } catch (err) {
      console.error('[AutomationManager] erro ao executar script:', err);
      window.Utils?.toast?.(`⚠️ Erro no script "${script.nome}": ${err.message || err}`, { type: 'danger', duration: 5000 });
      // Nada foi de fato "iniciado" com sucesso garantido (o erro pode ter
      // interrompido o script no meio) — mesmo assim guarda o que já rodou
      // até o erro, pra "Desexecutar" continuar disponível e não deixar
      // sujeira pra trás.
      this._lastRunErrors.set(id, err?.message || String(err));
    }

    this._runState[id] = { snapshot, tweens, cleanups, aoDesexecutarFn, persistirAoParar: !!script.persistirAoParar };
    window.Utils?.toast?.(`▶️ "${script.nome}" executado.`, { type: 'ok' });
  },

  /** [27/09/2026] NOVO — `id` -> mensagem de erro (string) da ÚLTIMA vez
   *  que `run()` foi chamado pra este script, ou nada se rodou sem erro
   *  (ou nunca rodou ainda). Cobre erro de RUNTIME (algo que só quebra
   *  executando de verdade, ex.: chamar `.foo()` de algo `undefined`) —
   *  erro de SINTAXE (chave não fechada etc.) já é pego na hora, sem
   *  precisar rodar nada, ver `Utils.checkJsSyntax`/`_scriptErrorBannerText`
   *  em mapview.js. Nunca persistido (mapa salvo não guarda isso). */
  _lastRunErrors: new Map(),
  getLastError(id) { return this._lastRunErrors.get(id) || null; },

  /** Desfaz um script em execução — pedido verbatim: botão "↩️
   *  Desexecutar (Desfazer)". `map` é opcional aqui (só usado pra decidir
   *  se re-renderiza) — o rollback em si não depende de reabrir o mapa: as
   *  referências guardadas em `snapshot` já são as de verdade. */
  stop(map, id) {
    const script = this.get(id);
    const state = this._runState[id];
    if (!state) { if (script) window.Utils?.toast?.(`"${script.nome}" não está em execução.`, { type: 'warn' }); return; }
    // 0) [27/09/2026] NOVO — gancho `AoDesexecutarScript()` do PRÓPRIO
    // script (ver comentário grande em `run()`/`codigoFinal`) — chamado
    // ANTES de qualquer rollback, pra dar a chance de o script limpar o
    // que ele mesmo iniciou por FORA do sistema de tweens/cleanups (ex.:
    // um laço de `requestAnimationFrame` cru, escrito à mão, sem Tween.js
    // — ver modelo "🎈 Levitação suave"). Sem isso, esse tipo de laço não
    // tinha NENHUM jeito de ser desligado a partir daqui — só manualmente
    // pelo console do navegador.
    if (typeof state.aoDesexecutarFn === 'function') {
      try { state.aoDesexecutarFn(); } catch (e) { console.warn('[AutomationManager] AoDesexecutarScript() do script falhou:', e); }
    }
    // 1) Para toda animação (Tween) que este script iniciou.
    state.tweens.forEach((t) => { try { t.stop(); } catch (e) { /* ignora */ } });
    // 2) Desfaz efeitos Ocultar/Opacidade/Destacar (regras sintéticas + classes temporárias).
    for (let i = state.cleanups.length - 1; i >= 0; i--) {
      try { state.cleanups[i](); } catch (e) { console.warn('[AutomationManager] cleanup falhou:', e); }
    }
    // 3) Restaura CADA propriedade que este script (e só este) escreveu,
    // pro valor que ela tinha antes DELE — ver `_rastrear` acima. Escreve
    // DIRETO no objeto real (bypassa o Proxy de propósito — não faz
    // sentido rastrear rollback do PRÓPRIO rollback), então agenda o
    // refresh 3D ao vivo à mão aqui, senão o "↩️ Desexecutar" não
    // aparecia no "Ver em 3D" sem reconstruir a cena inteira.
    // [27/09/2026] NOVO — pedido verbatim (bug real reportado): "ocultei
    // paredes/pisos/pilares/vigas [...] excluí o script e criei um novo,
    // porém [...] permaneceram ocultados." Causa possível: `objReal` (a
    // referência capturada no momento do `run()`) pode já não ser mais o
    // MESMO objeto que está de fato na cena agora — `_mountPlanta` busca
    // uma cópia FRESCA do mapa no banco (`DB.getOrCreateSingleMap()`)
    // toda vez que a tela "Planta baixa" é montada (inclusive ao voltar
    // do "Ver em 3D"), o que troca TODAS as instâncias de
    // parede/objeto/etc. por cópias novas, deserializadas — escrever só
    // na referência antiga (`objReal`) vira uma escrita "no vazio", que
    // não afeta mais nada que a tela realmente desenha. `_resolverAtual`
    // (abaixo) acha o objeto de VERDADE hoje (mesmo `id`, na coleção
    // certa do `map` atual) e escreve ali TAMBÉM — resolve mesmo depois
    // de uma recarga assim no meio do caminho.
    // [27/09/2026] NOVO — pedido verbatim: "executar um script e suas
    // alterações permanecerem, mesmo excluindo o script [...] isto deve
    // ser opcional." Com `script.persistirAoParar` marcado, este passo
    // (o único que de fato DEVOLVE valores antigos) é pulado por
    // completo — os ganchos/tweens/cleanups acima (que PARAM coisas em
    // andamento, ex.: uma animação) continuam rodando normalmente; só a
    // restauração de propriedades é que não acontece. Lê de
    // `state.persistirAoParar` (congelado no momento do `run()`, ver
    // logo abaixo) como reforço/fallback — cobre o caso (hoje teórico)
    // de `script` já não existir mais quando `stop()` é chamado.
    if (!(script?.persistirAoParar ?? state.persistirAoParar)) {
      state.snapshot.forEach((porProp, objReal) => {
        const atual = this._resolverAtual(map, objReal);
        porProp.forEach((valorAntes, prop) => {
          objReal[prop] = valorAntes;
          if (atual && atual !== objReal) atual[prop] = valorAntes;
        });
        this._agendarRefresh3DLive(map, atual || objReal);
      });
    }
    delete this._runState[id];
    if (script) {
      window.Utils?.toast?.(
        (script.persistirAoParar ? `↩️ "${script.nome}" desexecutado — alterações mantidas (permanente).` : `↩️ "${script.nome}" desexecutado — tudo revertido.`),
        { type: 'ok' },
      );
    }
  },

  /** [27/09/2026] NOVO — pedido verbatim: "Como, por padrão todos os
   *  métodos aparecem listados no botão de seleção do método, deve haver
   *  algum jeito de especificar no próprio script quais funções não devem
   *  aparecer no seletor. Para ficar padrão, toda função/método declarado
   *  dentro de um script vai para as opções do seletor, apenas as que,
   *  pelo próprio script, são especificadas para não aparecer no
   *  seletor." [27/09/2026] REESCRITO — pedido verbatim: "Faça com que o
   *  parser diferencie o que é comentário e o que não é de forma mais
   *  robusta [...] não haver problema de colocar '@ocultarMetodos' dentre
   *  de um comentário seguido de nomes de métodos reais" + "Ao colocar
   *  '@ocultarMetodos: Start' descomentado no código, acaba gerando um
   *  erro de sintaxe." A versão antiga (`// @ocultarMetodos: Nome1,
   *  Nome2`, uma lista de nomes por TEXTO livre) tinha dois problemas
   *  reais: (1) o regex achava a diretiva em QUALQUER lugar do código,
   *  mesmo dentro de um comentário EXPLICANDO a diretiva (ex.: o próprio
   *  bloco de ganchos de ciclo de vida, que precisa CITAR o nome da
   *  diretiva como exemplo) — sempre havia um jeito de confundir texto
   *  explicativo com diretiva de verdade; (2) "descomentar" pelo padrão
   *  natural (apagar as barras `//` da frente) resultava numa linha solta
   *  feito ` @ocultarMetodos: Start` — não é mais comentário nenhum, é um
   *  token JS inválido, erro de sintaxe.
   *
   *  Convenção NOVA — marca UMA função por vez, com uma linha de
   *  comentário EXATA `// @ocultarMetodo` (singular) imediatamente ANTES
   *  da linha `function Nome(...) {` que ela deve ocultar (linhas em
   *  branco entre as duas são toleradas). Vantagens: sempre um comentário
   *  de verdade (`//` na frente — nunca precisa ser "descomentado" pra
   *  funcionar, é oposto: já nasce ativo assim que colada acima da
   *  função); a linha tem que ser EXATAMENTE `// @ocultarMetodo` (só
   *  espaços em volta), então mencionar a diretiva dentro de uma frase
   *  explicativa maior (como este próprio comentário) nunca casa por
   *  engano — só uma linha dedicada, sozinha, resolve. Pode repetir a
   *  linha acima de quantas funções quiser. Usado por `mapview.js`
   *  `_scriptRowHtml` pra filtrar o <select> de "método" desta linha —
   *  SEM afetar `Components.extractFunctionNames` em si (que continua
   *  achando TODAS as funções, inclusive as ocultas — ocultar é só uma
   *  questão de EXIBIÇÃO na lista, a função continua existindo e podendo
   *  ser chamada por outro meio, ex.: dentro de outra função do próprio
   *  script). Devolve um `Set` com os nomes ocultados. */
  extractMetodosOcultos(codigo) {
    const out = new Set();
    if (!codigo) return out;
    const linhas = codigo.split('\n');
    for (let i = 0; i < linhas.length; i++) {
      if (linhas[i].trim() !== '// @ocultarMetodo') continue;
      // Acha a PRÓXIMA linha não-vazia depois da marca — tolera linhas em
      // branco no meio, mas para no primeiro texto de verdade (não
      // atravessa outro comentário nem outra marca).
      for (let j = i + 1; j < linhas.length; j++) {
        const l = linhas[j].trim();
        if (l === '') continue;
        const m = l.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(/);
        if (m) out.add(m[1]);
        break;
      }
    }
    return out;
  },

  /** [27/09/2026] NOVO — companheiro de `stop()` (ver comentário grande
   *  lá): dado um objeto capturado NO MOMENTO de um `run()` anterior,
   *  acha o objeto de VERDADE hoje no `map` atual — o MESMO objeto
   *  (`Array.includes`, caminho rápido — cobre o caso comum, sem `map`
   *  ter sido recarregado do banco no meio) ou, se não achar, outro com o
   *  MESMO `id` na mesma coleção (`map` foi recarregado — novas
   *  instâncias, mesmos ids). Devolve `null` só se `map`/`objReal` não
   *  existirem ou não achar NADA com esse id em nenhuma coleção (objeto
   *  de fato excluído da cena nesse meio-tempo). */
  _resolverAtual(map, objReal) {
    if (!map || !objReal) return null;
    for (const key of ['walls', 'objects', 'portas', 'janelas', 'textos', 'itens', 'fotos', 'medidas2d', 'tracos2d']) {
      const arr = map[key];
      if (!Array.isArray(arr)) continue;
      if (arr.includes(objReal)) return objReal;
      if (objReal.id != null) {
        const achado = arr.find((x) => x && x.id === objReal.id);
        if (achado) return achado;
      }
    }
    return null;
  },
};

/** Coleção devolvida por `Select(seletor)` dentro de um script — ver
 * comentário grande no topo do arquivo pra lista completa de métodos. */
class SelectionCollection {
  /** `wrap` — função `(objetoReal) => objetoPossivelmenteEnvolvidoEmProxy`,
   *  a MESMA usada por `Select()` pra ligar o rastreamento de rollback
   *  (ver `AutomationManager._rastrear`) — guardada aqui pra `.filhos()`/
   *  `.pai()` (abaixo) também devolverem itens rastreados, em vez de
   *  referências "cruas" que escapariam do "Desexecutar". Fora de um
   *  `run()` de verdade (uso direto/depuração), `wrap` é a identidade. */
  constructor(itens, map, tweenProxy, wrap = (x) => x) {
    this._itens = itens;
    this._map = map;
    this._tween = tweenProxy;
    this._wrap = wrap;
    this._cleanups = null; // ligado por `_comEstadoDeExecucao` — só existe durante um `run()` de verdade
    this.length = itens.length;
  }

  _comEstadoDeExecucao(cleanups) {
    this._cleanups = cleanups;
    return this;
  }

  /** Nova coleção derivada desta, com o MESMO `map`/`tween`/`wrap`/
   *  `cleanups` — usada por `.filhos()`/`.pai()` pra que ações chamadas em
   *  cadeia (`Select('#gab').filhos().ligar()`) continuem com rollback
   *  certinho, exatamente como uma seleção feita direto por `Select()`. */
  _derivada(itens) {
    const coll = new SelectionCollection(itens, this._map, this._tween, this._wrap);
    if (this._cleanups) coll._comEstadoDeExecucao(this._cleanups);
    return coll;
  }

  /** FILHOS — todas as entidades do mapa cujo `paiId` é o `id` de algum
   *  item desta coleção (ver "HIERARQUIA" no comentário grande do topo do
   *  arquivo). Pedido verbatim: "poder selecionar o Gabinete via código e
   *  o que há dentro dele". */
  filhos() {
    const todas = window.SceneObjects.all(this._map);
    const idsPai = new Set(this._itens.map((o) => o.id));
    const achados = todas.filter((e) => e.ref.paiId && idsPai.has(e.ref.paiId)).map((e) => this._wrap(e.ref));
    return this._derivada(achados);
  }

  /** PAI — a entidade "mãe" (via `paiId`) de cada item desta coleção, sem
   *  repetir (vários itens podem compartilhar o mesmo pai). */
  pai() {
    const todas = window.SceneObjects.all(this._map);
    const porId = new Map(todas.map((e) => [e.ref.id, e.ref]));
    const vistos = new Set(), achados = [];
    this._itens.forEach((o) => {
      const p = o.paiId && porId.get(o.paiId);
      if (p && !vistos.has(p.id)) { vistos.add(p.id); achados.push(this._wrap(p)); }
    });
    return this._derivada(achados);
  }

  each(fn) { this._itens.forEach(fn); return this; }
  forEach(fn) { return this.each(fn); }
  get(i) { return this._itens[i]; }

  set(prop, valor) { return this.each((o) => { o[prop] = valor; }); }

  /** [27/09/2026] NOVO — pedido verbatim: "Em vez de usar método para
   *  alterar o valor de propriedade como '.set(\"visibility\", false);',
   *  deve ser possível definir como '.visibility = false;'." Getter/setter
   *  de verdade no prototype (não um Proxy — mais simples, e cobre o caso
   *  pedido diretamente): `Select('...').visibility = false` chama
   *  `.set('visibility', false)` por debaixo, então fica IDÊNTICO em efeito
   *  (mesmo caminho de escrita, mesmo agendamento de refresh 3D AO VIVO via
   *  `_rastrear`/`_agendarRefresh3DLive`, mesmo rollback no "↩️
   *  Desexecutar") — só muda a sintaxe. O getter lê do primeiro item (senão
   *  `undefined`), só pra leitura funcionar de forma razoável também
   *  (`Select('#x').visibility`), embora o uso principal seja escrita.
   *  `.opacity`/`.opacidade` NÃO tem atalho equivalente de propósito — ver
   *  comentário grande no `SCRIPT_TEMPLATES['grupos-equivalente']`: aquele
   *  campo não é lido em nenhum lugar do renderizador (2D/3D usam a REGRA
   *  de Grupos, criada por `.opacity()`, não uma propriedade direta). */
  get visibility() { return this._itens.length ? this._itens[0].visibility : undefined; }
  set visibility(valor) { this.set('visibility', valor); }

  move(dx = 0, dy = 0, dz = 0) {
    return this.each((o) => {
      if (dx) o.x = (o.x || 0) + dx;
      if (dy) o.y = (o.y || 0) + dy;
      if (dz) o.elevacao = (o.elevacao || 0) + dz;
    });
  }

  moveTo(x, y, z) {
    return this.each((o) => {
      if (x != null) o.x = x;
      if (y != null) o.y = y;
      if (z != null) o.elevacao = z;
    });
  }

  rotate(graus) { return this.each((o) => { o.angulo = (o.angulo || 0) + graus; }); }

  scale(fator) {
    return this.each((o) => {
      if (o.largura != null) o.largura *= fator;
      if (o.altura != null) o.altura *= fator;
      if (o.profundidade != null) o.profundidade *= fator;
    });
  }

  // ---------- Ações de equipamento (Ligar/Desligar/Tampa/Varredura) ----------
  // Pedido verbatim: "poder abrir a tampa do Gabinete e ligá-lo/desligá-lo
  // [...] poder selecionar o Access Point e ligá-lo/desligá-lo, fazer a
  // sua varredura ser iniciada". `ligado`/`rede.ligado` é o MESMO campo que
  // `js/wifi-signal.js` (`AccessPoint.isOn`) e o resto do app de
  // equipamentos de rede já leem/escrevem — reaproveitado aqui, não um
  // campo novo e paralelo.

  /** Liga — escreve tanto `o.ligado` (genérico, qualquer objeto) quanto
   *  `o.rede.ligado` (campo de verdade que Access Point/Rack/demais
   *  equipamentos de rede já leem — ver `js/wifi-signal.js`). REESCREVE
   *  `o.rede` inteiro (em vez de mutar `o.rede.ligado` direto) DE
   *  PROPÓSITO — só a ESCRITA no `o` de nível mais alto passa pela `Proxy`
   *  de rastreamento (ver `AutomationManager._rastrear`); mutar um campo
   *  ANINHADO por dentro não seria visto pelo "Desexecutar". */
  ligar() { return this.each((o) => { o.ligado = true; o.rede = { ...(o.rede || {}), ligado: true }; }); }

  desligar() { return this.each((o) => { o.ligado = false; o.rede = { ...(o.rede || {}), ligado: false }; }); }

  /** Entidades desta coleção (ou FILHAS dela) marcadas com a classe
   *  `.tampa` — usado por `.abrirTampa()`/`.fecharTampa()` abaixo, pra
   *  funcionar tanto chamado no próprio Gabinete (`Select('#gab1')
   *  .abrirTampa()`) quanto direto na tampa (`Select('.tampa')
   *  .abrirTampa()`). */
  _comTampas() {
    const classesDe = (o) => (window.Mapping?.getObjectClasses?.(o) || o.classes || []);
    const proprias = this._itens.filter((o) => classesDe(o).includes('tampa'));
    const dosFilhos = this.filhos()._itens.filter((o) => classesDe(o).includes('tampa'));
    return [...proprias, ...dosFilhos];
  }

  /** Abre a(s) tampa(s) — gira 100° (mesmo espírito de uma porta abrindo)
   *  e marca `tampaAberta:true`. Idempotente (não gira de novo se já
   *  estava aberta) — importante pra "Desexecutar" não desfazer um giro
   *  que nunca foi de fato aplicado (ver `_rastrear`: só grava valor
   *  "antes" na 1ª ESCRITA — chamar `.abrirTampa()` duas vezes sem
   *  idempotência giraria 200°, e desfazer só devolveria os últimos 100°). */
  abrirTampa(anguloAbertura = 100) {
    this._comTampas().forEach((t) => {
      if (!t.tampaAberta) { t.tampaAberta = true; t.angulo = (t.angulo || 0) + anguloAbertura; }
    });
    return this;
  }

  fecharTampa(anguloAbertura = 100) {
    this._comTampas().forEach((t) => {
      if (t.tampaAberta) { t.tampaAberta = false; t.angulo = (t.angulo || 0) - anguloAbertura; }
    });
    return this;
  }

  /** Abre uma PORTA já existente do app (`map.portas` — a MESMA porta com
   *  dobradiça/sentido de abertura/corte de buraco na parede em 3D, ver
   *  `Mapping.addDoor`) — pedido verbatim: "portas [...] com fechaduras e
   *  animação por script". ANIMA de verdade `d.anguloAbertura` (0..90°+,
   *  o MESMO campo que `engine3d.js` já lê com prioridade sobre `d.aberta`
   *  pra decidir o ângulo da folha no 3D) — e agora também no MAPA 2D
   *  (`Map2DRenderer._drawDoorShape`, mapview.js: antes a folha ali sempre
   *  era desenhada FIXA a 90°, um símbolo estático que nunca mudava com
   *  `aberta`/`anguloAbertura` — corrigido, é essa a causa de "não estava
   *  dando pra abrir a porta" reportada). `d.aberta = true` continua sendo
   *  escrito também, pro corte de buraco 3D acompanhar. Idempotente/
   *  respeita fechadura: uma porta `.trancada` (novo campo, "fechadura" —
   *  só existe pra automação, não tem UI própria ainda) NUNCA abre por
   *  script até um `.destrancar()`. */
  abrirPorta(duracaoMs = 500, grausAbertura = 90) {
    this.each((d) => {
      if (d.trancada) return;
      const atual = d.anguloAbertura || 0;
      if (atual >= grausAbertura) { d.aberta = true; return; } // já aberta o suficiente — idempotente
      d.aberta = true;
      const estado = { v: atual };
      const t = new this._tween.Tween(estado).to({ v: grausAbertura }, duracaoMs)
        .onUpdate(() => { d.anguloAbertura = estado.v; })
        .start();
      this._cleanups?.push(() => t.stop());
    });
    return this;
  }

  /** Fecha — anima `anguloAbertura` de volta a 0° e só então zera `aberta`
   *  (`onComplete`, pra não fechar o buraco 3D no meio da animação da
   *  folha). Também respeita `.trancada` (uma porta trancada não fecha
   *  "sozinha" por script tampouco — mesmo espírito de simetria com
   *  `.abrirPorta()`, ainda que destrancar não seja necessário pra FECHAR
   *  na vida real; aqui é só consistência do modelo de automação). */
  fecharPorta(duracaoMs = 500) {
    this.each((d) => {
      if (d.trancada) return;
      const atual = d.anguloAbertura || 0;
      if (!(atual > 0)) { d.aberta = false; return; }
      const estado = { v: atual };
      const t = new this._tween.Tween(estado).to({ v: 0 }, duracaoMs)
        .onUpdate(() => { d.anguloAbertura = estado.v; })
        .onComplete(() => { d.aberta = false; })
        .start();
      this._cleanups?.push(() => t.stop());
    });
    return this;
  }

  /** "Fechadura" — pedido verbatim: "portas com [...] fechaduras". Campo
   *  próprio da automação (`trancada`, sem UI dedicada ainda — só afeta
   *  `.abrirPorta()`/`.fecharPorta()` acima); `.destrancar()` é o único
   *  jeito de voltar a abrir por script depois de `.trancar()`. */
  trancar() { return this.each((d) => { d.trancada = true; }); }

  destrancar() { return this.each((d) => { d.trancada = false; }); }

  /** "Iniciar varredura" do Access Point — INTEGRAÇÃO REAL com o motor 3D
   *  (pedido verbatim, corrigindo a versão anterior de "melhor esforço":
   *  "Deve ser possível iniciar varredura, faça uma integração com o 'Ver
   *  em 3D'."). Dispara o raytracing 3D DE VERDADE (`AccessPoint.
   *  startScan()`, js/wifi-signal.js) sempre que existir um motor 3D vivo
   *  mostrando o MESMO mapa — tanto a tela cheia "Ver em 3D"
   *  (`window.View3D._engine`) quanto a Miniatura 3D do painel
   *  'Ferramentas' da Planta Baixa (`window.MapView._minimapEngine`, que
   *  continua rodando enquanto o usuário fica na tela 2D). É por isso que a
   *  barrinha de progresso lida por `Map2DRenderer._drawApScanProgressBar2D`
   *  (js/mapview.js) sobrevive "mesmo alternando entre os modos": ambos os
   *  motores escrevem na MESMA instância `WifiSignal.instanciaExistente`
   *  por AP, independente de qual dos dois a criou. Sem NENHUM motor vivo
   *  (nem "Ver em 3D" aberto, nem Miniatura 3D ligada), não há cena WebGL
   *  pra raycastar contra — nesse caso liga o AP (pré-requisito real) e
   *  avisa via toast, sem fingir uma varredura que não rodou de verdade. */
  iniciarVarredura() {
    return this.each((o) => {
      o.rede = { ...(o.rede || {}), ligado: true };
      const engine = window.AutomationManager?._motor3DVivo?.(this._map);
      if (!engine || !window.WifiSignal) {
        window.Utils?.toast?.('⚠️ Abra "Ver em 3D" (ou ative a Miniatura 3D em Ferramentas) para a varredura do AP rodar de verdade.', { type: 'warn' });
        return;
      }
      const ap = window.WifiSignal.para(o, engine);
      const res = ap.startScan();
      if (res && res.ok === false) window.Utils?.toast?.(`⚠️ Varredura do AP: ${res.erro}`, { type: 'warn' });
    });
  }

  /** Aparecer/Desaparecer — reaproveita o MESMO mecanismo de regra de
   *  opacidade de `.opacity()` (ver `_criarRegraOpacidade` abaixo), só que
   *  animado (fade in/out) em vez de instantâneo. [27/09/2026] `.opacity(v)`
   *  ESTÁTICO (um valor só, sem tween) já aplica no 3D também (ver
   *  `Engine3D._applyGrupoOpacidadeDestaque`) — MAS só no PRÓXIMO rebuild
   *  da cena (`_rebuildScene()`), já que o 3D não reconstrói a malha a cada
   *  quadro. `.aparecer()`/`.desaparecer()`/`.blink()` tueniam o campo
   *  `valor` da regra CONTINUAMENTE, quadro a quadro, sem disparar rebuild
   *  nenhum (rebuildar a cena 3D inteira a cada quadro de animação seria
   *  caríssimo) — então a ANIMAÇÃO em si (o fade indo e voltando) continua
   *  só visual no 2D; no 3D só o valor de opacidade que já estava vigente
   *  no último rebuild "pega". */
  aparecer(duracaoMs = 400) {
    const regra = this._criarRegraOpacidade(0);
    if (regra) { const t = new this._tween.Tween(regra).to({ valor: 1 }, duracaoMs).start(); this._cleanups?.push(() => t.stop()); }
    else this._itens.forEach((o) => { o.opacidade = 1; });
    return this;
  }

  desaparecer(duracaoMs = 400) {
    const regra = this._criarRegraOpacidade(1);
    if (regra) { const t = new this._tween.Tween(regra).to({ valor: 0 }, duracaoMs).start(); this._cleanups?.push(() => t.stop()); }
    else this._itens.forEach((o) => { o.opacidade = 0; });
    return this;
  }

  /** Anima QUALQUER conjunto de propriedades numéricas até `propsFinais`,
   *  usando Tween.js de verdade por baixo (ver js/lib/tweenengine.js — a
   *  mesma sintaxe da Tween.js "de verdade": `.easing()`/`TWEEN.Easing.*`).
   *  `opts.easing` (padrão suave), `opts.yoyo` (vai-e-volta),
   *  `opts.repeat` (número de repetições, ou `Infinity`). */
  animate(propsFinais, duracaoMs = 800, opts = {}) {
    this._itens.forEach((o) => {
      // Suporta valores RELATIVOS ao estilo Tween.js/jQuery (`"+=10"`/
      // `"-=10"`) além de valores absolutos — pedido implícito no exemplo
      // "Explosão/Exploded View": `{ y: "+=10" }` afasta o objeto 10 do
      // valor ATUAL dele (cada objeto pode estar numa posição diferente),
      // em vez de todos irem pro MESMO `y` absoluto.
      const alvo = {};
      Object.keys(propsFinais).forEach((chave) => {
        const v = propsFinais[chave];
        const m = typeof v === 'string' ? v.match(/^\s*([+-])=\s*(-?\d+(?:\.\d+)?)\s*$/) : null;
        if (m) {
          const atual = typeof o[chave] === 'number' ? o[chave] : 0;
          alvo[chave] = m[1] === '+' ? atual + parseFloat(m[2]) : atual - parseFloat(m[2]);
        } else {
          alvo[chave] = v;
        }
      });
      new this._tween.Tween(o)
        .to(alvo, duracaoMs)
        .easing(opts.easing || this._tween.Easing.Quadratic.InOut)
        .repeat(opts.repeat || 0)
        .yoyo(!!opts.yoyo)
        .delay(opts.delay || 0)
        .start();
    });
    return this;
  }

  /** "Piscar" — efeito de alerta: pulsa a opacidade entre o valor atual e
   *  `opts.min` (padrão 0.15), em loop, até "Desexecutar" (ou
   *  `opts.repeat` explícito, se quiser algo finito). [27/09/2026] MUDADO —
   *  pedido verbatim: "Remova map.grupoRegras. O motor de regras por baixo
   *  (grupoRegras) deve ser integrado a 'Scripts'." Antes tueenava o campo
   *  `valor` de uma REGRA sintética separada (`_criarRegraOpacidade`); agora
   *  tueena `entity.opacidade` DIRETO em cada objeto real (mesmo padrão de
   *  `.animate()` — `new Tween(o).to({ opacidade: ... })`), sem regra/
   *  classe temporária/`map.grupoRegras` nenhuma no meio. A ANIMAÇÃO em si
   *  só é visual no 2D — ver comentário grande em `.aparecer()`/
   *  `.desaparecer()` acima pro motivo (3D não reconstrói a cada quadro). */
  blink(opts = {}) {
    const min = Utils.clamp(opts.min ?? 0.15, 0, 1);
    this._itens.forEach((o) => {
      if (typeof o.opacidade !== 'number') o.opacidade = 1; // ponto de partida do tween — escrita rastreada como qualquer outra (rollback de graça)
      const t = new this._tween.Tween(o)
        .to({ opacidade: min }, opts.duration ?? 300)
        .easing(opts.easing || this._tween.Easing.Sinusoidal.InOut)
        .yoyo(true)
        .repeat(opts.repeat ?? Infinity)
        .start();
      this._cleanups?.push(() => t.stop());
    });
    return this;
  }

  /** Opacidade FIXA (0-1). [27/09/2026] MUDADO — mesmo pedido/motivo do
   *  `.blink()` acima: campo DIRETO no objeto (`entity.opacidade`), igual
   *  a `.hide()`/`.show()` (`entity.visibility`) — nada de regra sintética/
   *  classe temporária/`map.grupoRegras`. A escrita passa pelo Proxy normal
   *  de `SelectionCollection` (`_rastrear`, ver comentário grande dela) —
   *  que JÁ guarda o valor original e agenda o refresh 3D ao vivo,
   *  exatamente como qualquer outra propriedade (`.set()`/`.move()`/etc.):
   *  rollback automático no "↩️ Desexecutar" de graça, sem precisar de
   *  nenhum `cleanup` manual (por isso funciona igual dentro ou fora de um
   *  `run()` de verdade — nunca mais um caminho "melhor esforço" separado).
   *  Lido direto (`entity.opacidade ?? 1`) por `MapView` (2D) e `Engine3D`
   *  (3D) — ver `_applyGrupoOpacidadeDestaque`/passes de desenho. */
  opacity(valor) {
    return this.each((o) => { o.opacidade = Utils.clamp(valor, 0, 1); });
  }

  /** Ocultar/Mostrar — campo direto `entity.visibility` (true = visível,
   *  `false` = oculto — invertido de propósito, pedido explícito de uma
   *  rodada anterior). Objeto "invisível" assim continua 100% presente na
   *  cena/no mapa — raycast, varredura de Access Point, tudo — exatamente
   *  como `visibility:hidden` no DOM. Rollback automático de `_rastrear`/
   *  "↩️ Desexecutar" de graça, igual `.ligar()`/`.desligar()` (mesmo
   *  padrão). */
  hide() { return this.each((o) => { o.visibility = false; }); }

  show() { return this.each((o) => { o.visibility = true; }); }

  /** Destacar — [27/09/2026] MUDADO, mesmo pedido/motivo de `.opacity()`
   *  acima: campo direto `entity.destacado` (bool) em vez de regra
   *  sintética em `map.grupoRegras`. Como agora é uma propriedade simples
   *  com rollback automático (igual `.hide()`/`.show()`), `.highlight(false)`
   *  passa a funcionar de verdade DENTRO do mesmo script (a limitação
   *  antiga — "não desfaz no meio do script, use 👁️/🚫" — só existia por
   *  causa do mecanismo de regra por baixo, que não dava pra desfazer
   *  parcialmente sem também remover a regra inteira). */
  highlight(ligar = true) {
    return this.each((o) => { o.destacado = !!ligar; });
  }
}
window.SelectionCollection = SelectionCollection;
