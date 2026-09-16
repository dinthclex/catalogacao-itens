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
 *     a entrada de verdade em `map.objects`/`map.cameras`/etc., já com
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
 *      `addCamera`/`addObject`), ele já nasce com uma CÓPIA dos
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

  /** Lê (assíncrono — pra UI, ex.: abrir o editor de "Comportamento
   *  padrão" de um tipo) o molde de components cru salvo pra `tipoKey`
   *  (`'parede'|'porta'|'janela'|'camera'|<tipo de objeto>`, ver
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
   *  `addWindow`/`addCamera`/`addObject`, logo que a entidade é criada.
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
    entity.components = molde.map((c) => ({ ...JSON.parse(JSON.stringify(c)), id: Utils.uid('comp') }));
  },

  // -------------------------------------------------------------------
  // "Histórico deste objeto" — por INSTÂNCIA (não por tipo/modelo), lazy.
  // -------------------------------------------------------------------

  /** Devolve `entity.historico` (array de `{data, texto}`) SEM criar nada
   *  se ainda não existir (usado por quem só quer LER/mostrar — ex.: pra
   *  decidir se mostra a seção "📜 Histórico" ou não, já que ela "só deve
   *  ser gerada caso se comece a acrescentar informações"). */
  getHistorico(entity) {
    return Array.isArray(entity?.historico) ? entity.historico : [];
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
   *  então índice é estável o suficiente pro tempo de vida de um clique). */
  removeHistoricoEntry(entity, index) {
    if (!Array.isArray(entity?.historico)) return false;
    if (index < 0 || index >= entity.historico.length) return false;
    entity.historico.splice(index, 1);
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
    const linhas = lista.length
      ? lista.map((h, i) => {
          const dataFmt = (() => { try { return new Date(h.data).toLocaleString('pt-BR'); } catch (e) { return h.data || ''; } })();
          return `<div class="objstd-hist-row" data-idx="${i}">
            <span class="objstd-hist-data">${Utils.escapeHtml(dataFmt)}</span>
            <span class="objstd-hist-texto">${Utils.escapeHtml(h.texto)}</span>
            <button type="button" class="icon-btn xs objstd-hist-del" data-idx="${i}" title="Remover esta entrada">🗑️</button>
          </div>`;
        }).join('')
      : '<div class="objstd-hist-vazio">Nenhuma entrada ainda.</div>';
    return `
      <div class="objstd-historico">
        <div class="objstd-hist-lista">${linhas}</div>
        <div class="objstd-hist-add">
          <input type="text" id="${idPrefix}-hist-input" class="objstd-hist-input" placeholder="Nova entrada do histórico…">
          <button type="button" class="btn secondary sm" id="${idPrefix}-hist-add">➕ Adicionar</button>
        </div>
      </div>`;
  },

  /** Liga os eventos (adicionar/remover) do HTML gerado por `historicoHtml`
   *  acima, dentro de `container`. `onChange()` é chamado depois de
   *  qualquer alteração (pra quem chamou salvar o mapa e re-renderizar). */
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
    container.querySelectorAll('.objstd-hist-del').forEach((btn) => {
      btn.onclick = () => {
        this.removeHistoricoEntry(entity, parseInt(btn.dataset.idx, 10));
        onChange?.();
        rerender();
      };
    });
  },
};

// Carrega o cache em memória assim que o script roda (ver nota grande no
// topo do arquivo sobre `applyDefaultComponents` ser síncrona) — fire-and-
// forget, não bloqueia o carregamento da página.
window.ObjectStandard._reloadCache();
