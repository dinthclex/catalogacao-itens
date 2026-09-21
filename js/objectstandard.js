/* js/objectstandard.js
 * NOVO (12/09/2026) — pedido verbatim do usuário: "[...] deve ser possível
 * definir características de cada objeto. Por exemplo, 'ao clicar com o
 * botão esquerdo' e uma ação atrelada [...] Ou seja, deve ser possível
 * adicionar scrips para os objetos. [...] O objetivo disso é padronizar os
 * objetos, como eles são carregados [...] sua interação com o ambiente,
 * etc. [...] Esta padronização é para que ao criar novos objetos, eles
 * possam seguir os mesmos modelos. Outra ideia relacionada a um objeto é
 * que ele deve ter uma folha de histórico: 'Histórico deste objeto'. [...]
 * Inicialmente os objetos não tem esta folha. Ela só deve ser gerada caso
 * se comece a acrescentar informações. Sobre esta folha de histórico é por
 * objeto individual não por modelo de objeto."
 *
 * DECISÃO DE ARQUITETURA TRANSPARENTE (registrada aqui pra quem ler este
 * arquivo no futuro): o pedido original trazia, como referência, um
 * exemplo de arquitetura FROM-SCRATCH ("cadeira_model.js"/
 * "cadeira_sala_reuniao.js"/motor próprio em index.html com Raycaster e
 * `file:///`). O app JÁ TEM, de rodadas anteriores, exatamente o par
 * "modelo padrão do tipo" vs. "objeto individual" que esse exemplo pede,
 * só que com outros nomes e já testado em produção:
 *   - "Modelo" (o que é comum a TODO objeto de um tipo) = `OBJECT3D_PROFILES`
 *     (js/modelos3d.js, malha/dimensões/cor padrão) + o molde customizado
 *     salvo em `DB.getObjectModel(tipo, nivel)` (vértices reais, se o
 *     usuário desenhou um em "Acessar modelos" > Editar).
 *   - "Instância" (o que é próprio de CADA objeto colocado no mapa) =
 *     a entrada de verdade em `map.objects`/etc., já com
 *     `entity.components` (`js/components.js`: `ScriptComponent`/
 *     `EventTriggerComponent`, disparados por `window.SceneEventBus` em
 *     `onClick`/`onProximityEnter`/etc. — o "ao clicar com o botão
 *     esquerdo, uma ação atrelada" já existe, literalmente, nesse sistema).
 * Reescrever esse par do zero (arquivos JS embutindo Base64 de malha,
 * `file:///` sem CORS, motor Three.js paralelo) duplicaria — com MAIS
 * risco de regressão, sem poder testar ao vivo nesta rodada — algo que já
 * funciona. Por isso este arquivo faz a parte que REALMENTE faltava:
 *
 *   1. `ObjectStandard.defaultComponents` — um "molde de comportamento"
 *      POR TIPO (a peça que faltava pra padronizar "novos objetos [...]
 *      seguirem os mesmos modelos"): quando um objeto NOVO de um tipo é
 *      criado (`js/mapping.js` `addWall`/`addDoor`/`addWindow`/
 *      `addObject`), ele já nasce com uma CÓPIA dos
 *      `components` configurados como padrão daquele tipo — configurável
 *      pela tela "Acessar modelos" (novo botão "⚙️ Comportamento padrão",
 *      ver js/modelos3d.js), reaproveitando o MESMO editor de componentes
 *      tela-cheia que já existe pra um objeto individual
 *      (`MapView._openComponentsEditorFullscreen`/`_renderComponentsEditor`
 *      — zero UI duplicada, só aponta pra um "objeto" de mentira que
 *      representa o molde do tipo em vez de uma entidade real do mapa).
 *   2. `ObjectStandard.historico` — a "folha de histórico" por objeto
 *      INDIVIDUAL (não por tipo/modelo — pedido explícito), lazy (só nasce
 *      `entity.historico` no instante em que a 1ª entrada é adicionada),
 *      com UI equivalente nos dois lados (2D: js/mapview.js
 *      `_openObjectPanel`; 3D: os cartões de clique de js/view3d.js).
 *
 * NOTA SOBRE `applyDefaultComponents` SER SÍNCRONA: `js/mapping.js`
 * `addWall`/`addObject`/etc. são funções SÍNCRONAS (chamadas em pleno
 * gesto de desenho do mouse, sem `await` em quem chama) — não dá pra
 * `await DB.getSetting(...)` ali dentro sem reescrever toda a cadeia de
 * quem chama (fora do escopo deste pedido, mais risco). Solução: este
 * módulo mantém um CACHE em memória (`_cache`), carregado uma única vez de
 * forma assíncrona logo ao subir a página (a IIFE no fim deste arquivo) e
 * RECARREGADO (também em memória, sem round-trip ao IndexedDB) toda vez
 * que `setDefaultComponents` grava uma mudança. `applyDefaultComponents`
 * só lê esse cache, de forma síncrona. TRADE-OFF TRANSPARENTE: nos
 * primeiríssimos instantes depois de abrir a página (antes do cache
 * terminar de carregar do IndexedDB — tipicamente poucos milissegundos),
 * um objeto criado NÃO recebe os componentes padrão do tipo; na prática
 * isso é irrelevante (o usuário não consegue desenhar um objeto antes da
 * tela nem ter montado).
 */
// [18/09/2026 UTC] NOVO (RODADA 156) — pedido do usuário (teste feito por
// ele mesmo): "no mapa 2D, acessei a janela de propriedades do objeto porta
// e fui na parte dos scripts, porém não tinha script algum. O script da
// porta que você fez deveria estar ali." CAUSA RAIZ: os scripts de
// abrir/fechar porta por duplo clique (RODADA 155, e o "molde" de
// exemplo pronto desde a RODADA 62) sempre existiram só como TEXTO em
// `assets/exemplos/_exemplo-script-porta-*.txt`, pra copiar/colar
// manualmente — nenhum código deste projeto jamais chamava
// `ObjectStandard.setDefaultComponents('porta', ...)` (o "molde de
// comportamento por tipo" que `applyDefaultComponents`, abaixo, aplica
// automaticamente em toda porta NOVA) com esse conteúdo. Ou seja, mesmo
// com `comManeneta: true` virando padrão na RODADA 155, nenhuma porta
// nova ganhava o Script/Gatilho de fato — só a malha 3D (a maçaneta)
// mudou de padrão, o COMPORTAMENTO (script) continuou 100% manual.
// CORRIGIDO: `_seedPortaScriptPadraoSeNecessario()` grava, UMA ÚNICA VEZ
// (flag `DB.getSetting('portaScriptPadraoSeed')`, para não "ressuscitar"
// o molde se o usuário decidir apagá-lo de propósito depois em "Acessar
// modelos" > "⚙️ Comportamento padrão" > "Porta"), um molde padrão pro
// tipo 'porta' com: 1 componente Script (código abaixo, mesma lógica —
// Start/Update/aoClicarDuasVezes com velocidade proporcional ao duplo
// clique — dos arquivos de exemplo `_exemplo-script-porta-*.txt`) + 1
// componente EventTrigger (evento "Ao Clicar Duas Vezes"/`onDoubleClick`
// → ação chamando `aoClicarDuasVezes` no Script acima). A partir de
// agora, toda porta NOVA criada pela ferramenta "Porta" já nasce com
// essa dupla de componentes prontos (via `applyDefaultComponents`, mesmo
// caminho de sempre) — o usuário pode editar/remover livremente depois,
// por objeto ou reconfigurando o molde do tipo inteiro.
const _DEFAULT_PORTA_SCRIPT_CODE = [
  '/**',
  ' * Start é chamada antes do primeiro quadro (uma vez, ao iniciar o objeto).',
  ' */',
  'function Start() {',
  '  // Garante um estado inicial coerente (porta fechada, sem animação em',
  '  // curso) mesmo se `anguloAbertura` nunca tiver sido definido antes.',
  '  if (obj.anguloAbertura === undefined) obj.anguloAbertura = obj.aberta ? 90 : 0;',
  '}',
  '',
  '/**',
  ' * Update é chamada uma vez por quadro (a cada frame).',
  ' */',
  'function Update() {',
  '  // Nada por quadro neste exemplo — a animação suave da folha (e da',
  '  // maçaneta, quando a porta tiver `comManeneta:true`) já é feita pelo',
  '  // motor 3D sozinho (Engine3D._updateDoorAnimations), só olhando o',
  '  // VALOR de obj.anguloAbertura definido abaixo em aoClicarDuasVezes().',
  '}',
  '',
  '// Debounce: evita que um duplo clique durante a animação em curso dispare',
  '// uma 2ª troca antes da 1ª terminar visualmente. A duração VARIA (ver',
  '// abaixo), então o debounce é recalculado a cada chamada.',
  'var _debounceAte = 0;',
  '',
  '// A velocidade com que se dá os 2 cliques do duplo clique influencia a',
  '// velocidade com que a porta abre/fecha — `view3d._ultimoIntervaloDuploCliqueMs`',
  '// (disponível pra todo Script) é o intervalo real (ms) entre os 2 cliques',
  '// do duplo clique mais recente.',
  'function _calcularVelocidadeGrausPorSeg() {',
  "  var intervaloMs = (typeof view3d !== 'undefined' && view3d && typeof view3d._ultimoIntervaloDuploCliqueMs === 'number')",
  '    ? view3d._ultimoIntervaloDuploCliqueMs',
  '    : 300;',
  '  var MS_MIN = 100, MS_MAX = 600;',
  '  var t = (Math.max(MS_MIN, Math.min(MS_MAX, intervaloMs)) - MS_MIN) / (MS_MAX - MS_MIN);',
  '  var DEG_PER_SEC_RAPIDO = 90 / 0.25;',
  '  var DEG_PER_SEC_LENTO = 90 / 0.8;',
  '  return DEG_PER_SEC_RAPIDO + (DEG_PER_SEC_LENTO - DEG_PER_SEC_RAPIDO) * t;',
  '}',
  '',
  '/**',
  ' * Chamada pelo Gatilho de Evento "Ao Clicar Duas Vezes" (onDoubleClick) —',
  ' * alterna a porta entre aberta (90°) e fechada (0°), na velocidade',
  ' * calculada acima.',
  ' */',
  'function aoClicarDuasVezes() {',
  '  var agora = Date.now();',
  '  if (agora < _debounceAte) return;',
  '  var velocidade = _calcularVelocidadeGrausPorSeg();',
  '  obj._velocidadeGrausPorSeg = velocidade;',
  '  _debounceAte = agora + Math.round((90 / velocidade) * 1000) + 50;',
  '  var estaAberta = (obj.anguloAbertura || 0) > 45;',
  '  obj.anguloAbertura = estaAberta ? 0 : 90;',
  '}',
  '',
].join('\n');

window.ObjectStandard = {
  _cache: {}, // tipoKey -> array de components (o "molde" cru, nunca mutado direto — sempre clonado antes de usar)

  /** Carrega (ou recarrega) o cache em memória a partir do IndexedDB. */
  async _reloadCache() {
    try {
      this._cache = await DB.getSetting('defaultComponentsByType', {});
    } catch (err) {
      console.error('[ObjectStandard] falha ao carregar defaultComponentsByType', err);
      this._cache = this._cache || {};
    }
  },

  /** [18/09/2026 UTC] NOVO (RODADA 156) — ver comentário grande acima de
   *  `_DEFAULT_PORTA_SCRIPT_CODE`. Roda uma única vez na vida do banco
   *  (flag `portaScriptPadraoSeed`), depois de `_reloadCache()` já ter
   *  carregado o molde salvo — só semeia se NINGUÉM (nem o usuário, nem
   *  esta função antes) já tiver configurado um molde pra 'porta'. */
  async _seedPortaScriptPadraoSeNecessario() {
    try {
      const jaSemeado = await DB.getSetting('portaScriptPadraoSeed', false);
      if (jaSemeado) return;
      const moldeAtual = this._cache && this._cache.porta;
      if (Array.isArray(moldeAtual) && moldeAtual.length) {
        // Já existe um molde (configurado manualmente antes desta rodada
        // existir) — não sobrescreve, só marca como "resolvido" pra nunca
        // mais checar de novo.
        await DB.setSetting('portaScriptPadraoSeed', true);
        return;
      }
      const scriptId = Utils.uid('comp');
      const eventTriggerId = Utils.uid('comp');
      const molde = [
        { id: scriptId, type: 'Script', enabled: true, code: _DEFAULT_PORTA_SCRIPT_CODE },
        {
          id: eventTriggerId,
          type: 'EventTrigger',
          enabled: true,
          events: [
            { event: 'onDoubleClick', actions: [{ targetComponentId: scriptId, method: 'aoClicarDuasVezes', args: [] }] },
          ],
        },
      ];
      await this.setDefaultComponents('porta', molde);
      await DB.setSetting('portaScriptPadraoSeed', true);
    } catch (err) {
      console.error('[ObjectStandard] falha ao semear o molde padrão de "porta"', err);
    }
  },

  /** Lê (assíncrono — pra UI, ex.: abrir o editor de "Comportamento
   *  padrão" de um tipo) o molde de components cru salvo pra `tipoKey`
   *  (`'parede'|'porta'|'janela'|<tipo de objeto>`, ver
   *  `_kindKeyFor` em js/mapping.js). Sempre devolve um array (novo, nunca
   *  a referência interna do cache) — vazio se não houver nada configurado. */
  async getDefaultComponents(tipoKey) {
    const map = await DB.getSetting('defaultComponentsByType', {});
    const arr = map[tipoKey];
    return Array.isArray(arr) ? JSON.parse(JSON.stringify(arr)) : [];
  },

  /** Grava o molde de components pra `tipoKey` (array de `compData`, MESMO
   *  formato de `entity.components` — ver js/components.js). Array vazio
   *  remove a entrada (idêntico ao padrão já usado por
   *  `customIconSvgOverrides`/`customObjectModelTypes` em modelos3d.js:
   *  "sem entrada" = "nenhuma customização"). Atualiza o cache em memória
   *  na mesma hora, sem esperar o próximo reload. */
  async setDefaultComponents(tipoKey, components) {
    const map = await DB.getSetting('defaultComponentsByType', {});
    if (Array.isArray(components) && components.length) map[tipoKey] = components;
    else delete map[tipoKey];
    await DB.setSetting('defaultComponentsByType', map);
    this._cache = map;
  },

  /** SÍNCRONA — chamada de dentro de `js/mapping.js` `addWall`/`addDoor`/
   *  `addWindow`/`addObject`, logo que a entidade é criada.
   *  Se houver um molde padrão configurado pra `tipoKey` (cache já
   *  carregado — ver nota grande no topo do arquivo), clona os components
   *  (com IDs NOVOS por componente — `Utils.uid`, nunca reaproveita o `id`
   *  do molde, senão duas instâncias do mesmo tipo compartilhariam
   *  `targetComponentId` colidindo nas ações de EventTrigger) e atribui em
   *  `entity.components`. NO-OP silencioso se não houver molde pra esse
   *  tipo ou se `entity` já vier com `components` (nunca sobrescreve algo
   *  que quem chamou já tenha explicitamente passado via `extra`). */
  applyDefaultComponents(entity, tipoKey) {
    if (!entity || (Array.isArray(entity.components) && entity.components.length)) return;
    const molde = this._cache && this._cache[tipoKey];
    if (!Array.isArray(molde) || !molde.length) return;
    // [18/09/2026 UTC] CORRIGIDO (RODADA 158) — pedido verbatim: "Fiz o
    // teste com uma porta nova. No componente o script deveria estar
    // selecionado. E no método, deveria estar selecionado o método
    // 'aoClicarDuasVezes()'. Porém só estava '--componente--' e
    // '--método--'." CAUSA RAIZ: cada componente clonado ganhava um `id`
    // NOVO (`Utils.uid('comp')`, de propósito — ver comentário grande da
    // função, acima — pra 2 instâncias do mesmo tipo não compartilharem
    // `targetComponentId` colidindo), mas os componentes `EventTrigger` do
    // MOLDE apontam pro `id` ANTIGO do Script (`action.targetComponentId`,
    // gravado quando o molde foi salvo, ex. pelo `_seedPortaScriptPadraoSeNecessario`
    // da RODADA 156) — depois da troca de IDs, essa referência ficava
    // "orfã" (nenhum componente da PORTA de verdade tinha mais aquele id
    // antigo), e a UI (`js/mapview.js` `_renderComponentsEditor`, que só
    // marca `selected` quando `sc.id === action.targetComponentId`) não
    // encontrava nada pra pré-selecionar — daí "--componente--"/
    // "--método--" em vez do Script/`aoClicarDuasVezes` já configurados no
    // molde. CORRIGIDO: constrói um mapa "id antigo → id novo" enquanto
    // clona, depois passa de novo por todo `EventTrigger` clonado
    // reescrevendo `action.targetComponentId` através desse mapa (id sem
    // correspondência — ex. aponta pra um componente que não fazia parte
    // deste molde — vira string vazia, mesmo estado "não configurado" de
    // sempre, em vez de deixar uma referência quebrada).
    const idMap = new Map();
    const clones = molde.map((c) => {
      const clone = { ...JSON.parse(JSON.stringify(c)), id: Utils.uid('comp') };
      idMap.set(c.id, clone.id);
      return clone;
    });
    for (const clone of clones) {
      if (clone.type !== 'EventTrigger' || !Array.isArray(clone.events)) continue;
      for (const ev of clone.events) {
        for (const action of (ev.actions || [])) {
          action.targetComponentId = idMap.get(action.targetComponentId) || '';
        }
      }
    }
    entity.components = clones;
  },

  /** [18/09/2026 UTC] NOVO (RODADA 158) — "auto-cura" de uma entidade
   *  concreta que já ficou salva com a referência quebrada descrita no
   *  comentário grande de `applyDefaultComponents` acima (bug já corrigido
   *  ali, mas só vale pra entidades criadas DAQUI PRA FRENTE — entidades
   *  já salvas com o `id` órfão continuariam quebradas pra sempre sem
   *  isto, ex.: a porta de teste que o próprio usuário usou pra reportar o
   *  problema). Só repara o caso INEQUÍVOCO: exatamente 1 componente
   *  `Script` na entidade — nesse caso, qualquer `action.targetComponentId`
   *  de um `EventTrigger` que não bater com NENHUM `id` real da própria
   *  entidade só pode ter sido, de fato, uma referência pra esse único
   *  Script (perdida na clonagem) — reconecta pra ele. Com 0 ou 2+
   *  Scripts, não mexe em nada (não dá pra adivinhar com segurança qual
   *  era o alvo original) — melhor deixar como "não configurado" (o
   *  usuário resolve manualmente) do que reconectar errado. */
  repairOrphanScriptLinks(entity) {
    const comps = entity?.components;
    if (!Array.isArray(comps) || !comps.length) return;
    const scriptComps = comps.filter((c) => c.type === 'Script');
    if (scriptComps.length !== 1) return;
    const unicoScriptId = scriptComps[0].id;
    const idsValidos = new Set(comps.map((c) => c.id));
    for (const c of comps) {
      if (c.type !== 'EventTrigger' || !Array.isArray(c.events)) continue;
      for (const ev of c.events) {
        for (const action of (ev.actions || [])) {
          if (action.targetComponentId && !idsValidos.has(action.targetComponentId)) {
            action.targetComponentId = unicoScriptId;
          }
        }
      }
    }
  },

  // -------------------------------------------------------------------
  // "Histórico deste objeto" — por INSTÂNCIA (não por tipo/modelo), lazy.
  // -------------------------------------------------------------------

  /** [13/09/2026] NOVO — pedido verbatim: "Coloque um detalhe no ícone do
   *  botão 'Histórico deste objeto' algo que seja intuitivo de que algo foi
   *  colocado ali [...] Coloque este mesmo detalhe no objeto [...]
   *  Implemente uma variação de cor de acordo com a data de inserção [...]
   *  Tem que ser algo bem simples." (o pedido final SUBSTITUIU o anterior,
   *  mais elaborado — por isso NADA de ícone de relógio/múltiplas
   *  variações: só a COR de um pontinho `●`, verde se a entrada mais
   *  recente do histórico foi hoje ou nesta semana, cinza se for mais
   *  antiga.) Usado tanto no botão/legenda "Histórico deste objeto" (2D:
   *  `mapview.js` `_historicoFieldsetHtml`; 3D: `view3d.js` — os cartões
   *  de foto/objeto) quanto sobre o objeto na cena 3D (ver
   *  `engine3d.js` `_addHistoricoDestaque`, mesmo esquema de cor). Devolve
   *  `null` se o objeto ainda não tem NENHUMA entrada de histórico (sem
   *  indicador — "só deve aparecer quando algo foi colocado ali"). */
  corIndicadorHistorico(entity) {
    const lista = this.getHistorico(entity);
    if (!lista.length) return null;
    let maisRecente = '';
    for (const h of lista) {
      const d = h.modificadoEm || h.data || '';
      if (d > maisRecente) maisRecente = d;
    }
    const dias = (Date.now() - new Date(maisRecente).getTime()) / 86400000;
    return dias <= 7 ? '#3ecf6e' : '#9aa3ad'; // verde: hoje/esta semana · cinza: mais antigo
  },

  /** HTML do pontinho colorido acima (ou `''` se o objeto ainda não tem
   *  histórico) — pra colar direto ao lado do texto de um botão/legenda. */
  indicadorHtml(entity) {
    const cor = this.corIndicadorHistorico(entity);
    if (!cor) return '';
    return ` <span class="objstd-hist-dot" style="color:${cor}" title="Este objeto já tem histórico registrado">●</span>`;
  },

  /** Devolve `entity.historico` (array de `{data, texto, modificadoEm?}`)
   *  SEM criar nada se ainda não existir (usado por quem só quer LER/
   *  mostrar — ex.: pra decidir se mostra a seção "📜 Histórico" ou não, já
   *  que ela "só deve ser gerada caso se comece a acrescentar
   *  informações"). `data` é SEMPRE a data de CRIAÇÃO da entrada (nunca
   *  muda depois) — `modificadoEm` (opcional, ausente até a 1ª edição) é a
   *  data da última edição do texto (ver `editHistoricoEntry` abaixo). */
  getHistorico(entity) {
    return Array.isArray(entity?.historico) ? entity.historico : [];
  },

  // [14/09/2026] NOVO — critério/direção de ordenação da lista de
  // histórico, PARECIDO com o controle já existente na tela "Tabela"
  // (rodapé "Tabela" do app — escolher critério + inverter direção), só que
  // aqui com apenas os 2 critérios que fazem sentido pra uma entrada de
  // histórico: "Criado" (`data`) e "Modificado" (`modificadoEm`, cai pra
  // `data` se a entrada nunca foi editada — ver `_ordenarHistorico`
  // abaixo). Estado por SESSÃO apenas (não existe, na tela "Tabela" de
  // referência, persistência entre sessões desse critério — ver
  // js/mapview.js — então aqui segue o mesmo padrão: some ao recarregar a
  // página). Padrão pedido: "mais recentes em cima" — `criterio: 'criado'`,
  // `direcao: 'desc'` (mais novo primeiro).
  _histSort: { criterio: 'criado', direcao: 'desc' },

  /** Devolve uma CÓPIA de `lista` (nunca muta o array original — quem lê
   *  pelo índice na UI, ver `historicoHtml`, precisa que a ordem exibida
   *  corresponda 1:1 aos índices reais do `entity.historico`; por isso
   *  cada linha renderizada carrega o índice REAL, não a posição na lista
   *  ordenada — ver `data-idx` abaixo) ordenada pelo critério/direção
   *  atuais (`this._histSort`). */
  _ordenarHistoricoIndices(lista) {
    const { criterio, direcao } = this._histSort;
    const chave = (h) => (criterio === 'modificado' ? (h.modificadoEm || h.data) : h.data) || '';
    const indices = lista.map((_, i) => i);
    indices.sort((ia, ib) => {
      const a = chave(lista[ia]), b = chave(lista[ib]);
      const cmp = a < b ? -1 : (a > b ? 1 : 0);
      return direcao === 'asc' ? cmp : -cmp;
    });
    return indices;
  },

  /** Acrescenta UMA entrada de texto no histórico deste objeto INDIVIDUAL
   *  — cria `entity.historico` na hora (primeira vez que alguém escreve
   *  algo, nunca antes — é isso que "só deve ser gerada caso se comece a
   *  acrescentar informações" pede). Devolve a entrada criada, ou `null`
   *  se `texto` vier vazio. Quem chamar ainda precisa persistir o mapa
   *  (`DB.saveMap`/`this._saveMap()`), igual a qualquer outra mudança de
   *  campo feita fora dos `Mapping.update*` normais. */
  addHistoricoEntry(entity, texto) {
    const t = (texto || '').trim();
    if (!entity || !t) return null;
    if (!Array.isArray(entity.historico)) entity.historico = [];
    const entrada = { data: (window.DB?.nowISO?.() || new Date().toISOString()), texto: t };
    entity.historico.push(entrada);
    return entrada;
  },

  /** Remove UMA entrada do histórico (pelo índice, mais simples que dar
   *  id a cada entrada — a lista é sempre re-renderizada do zero pela UI,
   *  então índice é estável o suficiente pro tempo de vida de um clique).
   *  A confirmação ("Excluir esta entrada?") é responsabilidade de quem
   *  chama (ver `wireHistoricoUi` — usa o mesmo `confirm()` nativo já usado
   *  em outras exclusões do app, ex.: excluir mapa em js/mapview.js). */
  removeHistoricoEntry(entity, index) {
    if (!Array.isArray(entity?.historico)) return false;
    if (index < 0 || index >= entity.historico.length) return false;
    entity.historico.splice(index, 1);
    return true;
  },

  /** [14/09/2026] NOVO — pedido verbatim: "permitir editar entradas [do
   *  histórico], gerando data de modificação". Troca o `texto` da entrada
   *  `index` e grava `modificadoEm` (ISO, mesma fonte de data que
   *  `addHistoricoEntry` usa pra `data`) — a data de CRIAÇÃO original
   *  (`data`) NUNCA é tocada aqui. Devolve `true`/`false` (índice inválido
   *  ou texto vazio depois de `trim()` — uma entrada de histórico nunca
   *  fica com texto vazio, igual à criação). */
  editHistoricoEntry(entity, index, novoTexto) {
    if (!Array.isArray(entity?.historico)) return false;
    if (index < 0 || index >= entity.historico.length) return false;
    const t = (novoTexto || '').trim();
    if (!t) return false;
    const entrada = entity.historico[index];
    entrada.texto = t;
    entrada.modificadoEm = (window.DB?.nowISO?.() || new Date().toISOString());
    return true;
  },

  /** HTML compartilhado (2D: `mapview.js` `_openObjectPanel`; 3D:
   *  `view3d.js` cartões de clique) pra mostrar/editar o histórico de UM
   *  objeto — nasce SEM nenhuma entrada digitada, e ganha uma linha por
   *  entrada existente, mais um campo de texto + botão "Adicionar" no
   *  final. `idPrefix` evita colisão de id de DOM entre o painel 2D e um
   *  cartão 3D abertos ao mesmo tempo (não deveria acontecer na prática,
   *  mas custa nada ser explícito). */
  historicoHtml(entity, idPrefix) {
    const lista = this.getHistorico(entity);
    const fmt = (iso) => { try { return new Date(iso).toLocaleString('pt-BR'); } catch (e) { return iso || ''; } };
    // [14/09/2026] Ordena pelos índices REAIS (ver `_ordenarHistoricoIndices`
    // — a lista visível pode estar em outra ordem que o array cru, mas cada
    // linha carrega o índice de verdade em `data-idx`, então
    // editar/remover/etc. continuam batendo na entrada certa).
    const ordem = this._ordenarHistoricoIndices(lista);
    const linhas = lista.length
      ? ordem.map((i) => {
          const h = lista[i];
          // "Criado em: ..." / "Modificado em: ..." — o "Modificado" só
          // aparece se a entrada já tiver sido editada ao menos uma vez
          // (pedido verbatim do usuário) — senão só a data de criação, como
          // antes. [13/09/2026] Pedido do usuário: a data de "Modificado em"
          // fica numa linha SEPARADA, ABAIXO de "Criado em", em vez de lado
          // a lado na mesma linha separadas por "•" — por isso cada uma vai
          // num <div> próprio dentro do mesmo bloco de data.
          const dataLinha = h.modificadoEm
            ? `<div>Criado em: ${Utils.escapeHtml(fmt(h.data))}</div><div>Modificado em: ${Utils.escapeHtml(fmt(h.modificadoEm))}</div>`
            : Utils.escapeHtml(fmt(h.data));
          return `<div class="objstd-hist-row" data-idx="${i}">
            <span class="objstd-hist-data">${dataLinha}</span>
            <span class="objstd-hist-texto">${Utils.escapeHtml(h.texto)}</span>
            <span class="objstd-hist-acoes">
              <button type="button" class="icon-btn xs objstd-hist-edit" data-idx="${i}" title="Editar esta entrada">✏️ Editar</button>
              <button type="button" class="icon-btn xs objstd-hist-del" data-idx="${i}" title="Remover esta entrada">🗑️</button>
            </span>
          </div>`;
        }).join('')
      : '<div class="objstd-hist-vazio">Nenhuma entrada ainda.</div>';
    // Controle de ordenação — mesmo espírito visual do seletor já existente
    // na tela "Tabela" (critério num <select> + botão de inverter direção),
    // só que com apenas os 2 critérios que fazem sentido pra histórico.
    const { criterio, direcao } = this._histSort;
    return `
      <div class="objstd-historico">
        ${lista.length > 1 ? `
        <div class="objstd-hist-sort">
          <label for="${idPrefix}-hist-sortby">Ordenar por</label>
          <select id="${idPrefix}-hist-sortby" class="objstd-hist-sortby">
            <option value="criado" ${criterio === 'criado' ? 'selected' : ''}>Criado</option>
            <option value="modificado" ${criterio === 'modificado' ? 'selected' : ''}>Modificado</option>
          </select>
          <button type="button" class="icon-btn xs objstd-hist-dir" id="${idPrefix}-hist-dir" title="${direcao === 'desc' ? 'Mais novo primeiro (clique para inverter)' : 'Mais antigo primeiro (clique para inverter)'}">${direcao === 'desc' ? '⬇️ Mais novo' : '⬆️ Mais antigo'}</button>
        </div>` : ''}
        <div class="objstd-hist-lista">${linhas}</div>
        <div class="objstd-hist-add">
          <input type="text" id="${idPrefix}-hist-input" class="objstd-hist-input" placeholder="Nova entrada do histórico…">
          <button type="button" class="btn secondary sm" id="${idPrefix}-hist-add">➕ Adicionar</button>
        </div>
      </div>`;
  },

  /** Liga os eventos (adicionar/remover/editar/ordenar) do HTML gerado por
   *  `historicoHtml` acima, dentro de `container`. `onChange()` é chamado
   *  depois de qualquer alteração (pra quem chamou salvar o mapa e
   *  re-renderizar). */
  wireHistoricoUi(container, entity, idPrefix, onChange) {
    if (!container) return;
    const rerender = () => {
      const wrap = container.querySelector('.objstd-historico');
      if (!wrap) return;
      wrap.outerHTML = this.historicoHtml(entity, idPrefix);
      this.wireHistoricoUi(container, entity, idPrefix, onChange);
    };
    const addBtn = container.querySelector(`#${idPrefix}-hist-add`);
    const input = container.querySelector(`#${idPrefix}-hist-input`);
    if (addBtn && input) {
      const addFn = () => {
        const v = input.value;
        if (!v || !v.trim()) return;
        this.addHistoricoEntry(entity, v);
        onChange?.();
        rerender();
      };
      addBtn.onclick = addFn;
      input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addFn(); } };
    }
    // Ordenação — critério (select) e direção (botão toggle), ver
    // `_histSort`/`_ordenarHistoricoIndices` acima. Estado GLOBAL (não por
    // objeto) de propósito — igual à tela "Tabela" de referência, é uma
    // preferência de como o usuário gosta de ver a lista, não um dado do
    // objeto.
    const sortSel = container.querySelector(`#${idPrefix}-hist-sortby`);
    if (sortSel) {
      sortSel.onchange = () => {
        this._histSort.criterio = sortSel.value === 'modificado' ? 'modificado' : 'criado';
        rerender();
      };
    }
    const dirBtn = container.querySelector(`#${idPrefix}-hist-dir`);
    if (dirBtn) {
      dirBtn.onclick = () => {
        this._histSort.direcao = this._histSort.direcao === 'desc' ? 'asc' : 'desc';
        rerender();
      };
    }
    // Editar — troca a linha por um <textarea> + "Salvar"/"Cancelar" no
    // lugar (mesmo elemento, sem abrir modal — edição é rápida/inline).
    container.querySelectorAll('.objstd-hist-edit').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const row = container.querySelector(`.objstd-hist-row[data-idx="${idx}"]`);
        const h = this.getHistorico(entity)[idx];
        if (!row || !h) return;
        row.innerHTML = `
          <textarea class="objstd-hist-edit-input">${Utils.escapeHtml(h.texto)}</textarea>
          <span class="objstd-hist-acoes">
            <button type="button" class="btn primary xs objstd-hist-save" title="Salvar edição">💾 Salvar</button>
            <button type="button" class="btn secondary xs objstd-hist-cancel" title="Cancelar edição">Cancelar</button>
          </span>`;
        const ta = row.querySelector('.objstd-hist-edit-input');
        ta?.focus();
        row.querySelector('.objstd-hist-save').onclick = () => {
          if (this.editHistoricoEntry(entity, idx, ta.value)) { onChange?.(); }
          rerender();
        };
        row.querySelector('.objstd-hist-cancel').onclick = () => rerender();
      };
    });
    // Remover — [14/09/2026] NOVO: pede confirmação antes (pedido verbatim
    // do usuário), com `confirm()` nativo — MESMO padrão já usado em outras
    // exclusões do app (ex.: excluir mapa, ver js/mapview.js "Excluir o
    // mapa..." — o app não tem um sistema de modal customizado próprio pra
    // confirmação, então segue esse padrão em vez de inventar um novo).
    container.querySelectorAll('.objstd-hist-del').forEach((btn) => {
      btn.onclick = () => {
        if (!confirm('Excluir esta entrada do histórico?')) return;
        this.removeHistoricoEntry(entity, parseInt(btn.dataset.idx, 10));
        onChange?.();
        rerender();
      };
    });
  },
};

// Carrega o cache em memória assim que o script roda (ver nota grande no
// topo do arquivo sobre `applyDefaultComponents` ser síncrona) — fire-and-
// forget, não bloqueia o carregamento da página. [18/09/2026 UTC, RODADA
// 156] Encadeado com `_seedPortaScriptPadraoSeNecessario()` (precisa do
// cache já carregado pra decidir se semeia ou não) — ver comentário grande
// acima de `_DEFAULT_PORTA_SCRIPT_CODE`.
window.ObjectStandard._reloadCache().then(() => window.ObjectStandard._seedPortaScriptPadraoSeNecessario());
