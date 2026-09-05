/**
 * unify.js — Ferramenta de unificação: junta arquivos exportados (.json) de
 * VÁRIOS celulares/PCs (várias pessoas fazendo a conferência de patrimônio ao
 * mesmo tempo) numa única lista, sem conflito.
 *
 * Como funciona:
 *  - Cada item já nasce com um ID único (gerado no aparelho que o cadastrou),
 *    então juntar vários arquivos nunca sobrescreve um item por engano — a
 *    junção é feita por esse ID (o mais recente por "modificadoEm" vence se o
 *    MESMO id aparecer em mais de um arquivo).
 *  - Cada item também carrega o ID da "conferência de patrimônio" em que foi
 *    cadastrado (configurável em Configurações → "Conferência de patrimônio").
 *    Se os arquivos carregados pertencerem a conferências DIFERENTES, um
 *    aviso aparece — evita misturar por engano duas conferências que não têm
 *    nada a ver uma com a outra.
 *  - Durante a análise, cada item entra numa lista; se algo parecer estranho
 *    (sem número de patrimônio, o mesmo patrimônio com tipos/setores
 *    diferentes entre si, ou vindo de uma conferência minoritária), ele fica
 *    destacado na lista, com o motivo explicado.
 *  - A exibição (tabela ou cards) é virtualizada por linha — só o que está
 *    visível na tela entra no DOM — pra não travar mesmo com milhares de itens.
 *
 * Mudanças de 27/08/2026 (pedido do usuário — ver comentários "27/08/2026"
 * espalhados abaixo, cada um perto do trecho específico que ele descreve):
 *   1) Corrigido: clicar numa linha (Tabela) ou num card (Cartões) não fazia
 *      nada — agora abre um cartão de informações do item (ver _showItemCard).
 *   2) Esse cartão agora vem dentro de um "invólucro" que mostra de qual
 *      ARQUIVO aquela informação veio (ver _itemDetailPanelHtml).
 *   3) Se o patrimônio clicado aparecer em mais de um item carregado, o
 *      cartão mostra TODOS lado a lado, cada um com um botão "permanecer com
 *      este unicamente" (descarta os outros — ver _keepOnlyThisDuplicate).
 *   4) Corrigido: escolher "Tabela" e DEPOIS carregar os arquivos abria em
 *      Cartões por engano (o modo ficava "preso" no valor de uma visita
 *      anterior à tela, mas o botão já nascia marcado "Tabela" na hora de
 *      montar a tela de novo) — agora o modo é reiniciado a cada vez que
 *      esta tela é aberta (ver mount()).
 *   5) Tabela: colunas agora são redimensionáveis à mão, igual à Tabela
 *      principal do catálogo (ver _ensureColWidths/_attachColResize).
 *   6) NOVO modo de exibição "Por arquivo" (além de "Por item", que é o modo
 *      de sempre com Tabela/Cartões dentro) — uma coluna por arquivo
 *      carregado, linhas = número de patrimônio; uma linha com mais de uma
 *      coluna preenchida = patrimônio duplicado entre arquivos. Cada coluna
 *      tem um botão pra descartar os outros arquivos e ficar só com aquele
 *      (ver _mountPorArquivo/_keepOnlyThisFile).
 *
 * Mudanças de 27/08/2026, rodada seguinte (pedido do usuário):
 *   7) "Tabela"/"Cartões" deixam de ser exclusivos de "Por item" — agora são
 *      SUBOPÇÕES que valem tanto pra "Por item" quanto pra "Por arquivo"
 *      (ver _updateToggleButtons, que não esconde mais o seletor, e
 *      _mountPorArquivo, que agora lê `this._mode` pra decidir como desenhar
 *      cada célula: linha compacta no modo Tabela, "cartãozinho" com ícone
 *      no modo Cartões).
 *   8) NOVO painel de FILTROS, recolhível (botão "🔍 Filtros"): lista cada
 *      conferência de patrimônio encontrada nos arquivos carregados, com uma
 *      caixinha pra marcar/desmarcar se ela aparece na listagem (Tabela/
 *      Cartões/Por arquivo) — ver _renderFiltersPanel/_filteredMerged. Não
 *      afeta "Baixar unificado"/"Aplicar neste aparelho" (que sempre usam
 *      TODOS os itens mesclados, filtro é só de exibição, como pedido).
 *   9) NOVO toggle "Ignorar conferências diferentes" (dentro do painel de
 *      filtros acima), HABILITADO POR PADRÃO — quando marcado, a inconsis-
 *      tência "veio de outra conferência" deixa de ser sinalizada item a
 *      item E o aviso geral do resumo some (ver _analyze/_render).
 *  10) Corrigido: no modo Tabela, o espaço entre uma linha e outra estava
 *      grande demais — as linhas nunca tinham uma altura EXPLÍCITA (só a
 *      posição `top`), então cada uma só ocupava a altura do próprio texto,
 *      sobrando um vão vazio até a próxima (que começava lá longe, no
 *      `_rowH` antigo de 46px). Agora cada linha ganha `height` explícito
 *      igual a `_rowH`, e `_rowH` foi reduzido para 1/3 do valor anterior
 *      (46 → 15), como pedido.
 *
 * Mudanças de 27/08/2026, terceira rodada (pedido do usuário):
 *  11) Ícone de flag e cor da linha/card agora DISTINGUEM "conferência
 *      diferente" (🏳️, âmbar — mesma cor de sempre) de "duplicação de
 *      patrimônio" (🚩, roxo — mesma cor já usada em outras telas do app
 *      pra duplicata, ver `.flashcard--dup`/`.flashcard-dup-badge`) — ver
 *      `_flagDuplicado`/`_flagConferencia` em _analyze() e `_rowFlagHtml`/
 *      `_rowClassFor` mais abaixo.
 *  12) Tabela: dois cliques em cima de uma divisória de coluna agora
 *      autoajusta a largura dela pro conteúdo de TODAS as linhas (mesmo
 *      gesto/técnica de table.js `_autoFitColumn`, ver essa função aqui
 *      embaixo). E, ao carregar/analisar arquivos, todas as colunas são
 *      autoajustadas automaticamente (ver fim de _analyze()).
 *  13) Corrigido: sair desta tela (e voltar) apagava tudo o que já tinha
 *      sido carregado/marcado — `mount()` reiniciava `_sources`/`_merged`/
 *      filtros/etc. toda vez. Agora só o botão "🗑️ Limpar" reinicia (ver
 *      _resetAll()) — sair e voltar preserva o que já estava carregado.
 *  14) Cada conferência do painel de filtros ganhou um botão de "fixar"
 *      (📌) — conferências fixadas aparecem numa fileira sempre visível
 *      (mesmo com o painel de filtros recolhido), ver `_pinnedConferencias`/
 *      `_renderPinnedChips`.
 *
 * Mudanças de 27/08/2026, quarta rodada (pedido do usuário):
 *  15) Corrigido: o retângulo de bordas arredondadas de cada opção do filtro
 *      envolvia só a caixinha de marcar, com o botão de fixar (📌) do lado de
 *      FORA — dava a impressão de serem duas coisas separadas. Agora o
 *      próprio "pill" (`.uf-conf-chip`) envolve os dois juntos.
 *  16) A fileira de conferências fixadas (`#uf-pinned-chips`) saiu de dentro
 *      da barra de ferramentas (onde brigava por espaço com os outros
 *      botões) e agora fica numa LINHA PRÓPRIA, sempre embaixo dela.
 *  17) O botão "Ignorar conferências diferentes" também ganhou um pino,
 *      HABILITADO (fixado) por padrão — ver `_pinnedIgnorarConf`.
 *
 * Mudanças de 27/08/2026, quinta rodada (pedido do usuário):
 *  18) NOVA coluna "Conferência" na Tabela, entre "Setor" e "Fonte" — mostra
 *      de qual conferência de patrimônio (não confundir com o ARQUIVO de
 *      origem, coluna "Fonte" ao lado) aquele item veio, ver
 *      `_conferenciaLabel(it)`. Redimensionável/autoajustável igual às
 *      outras (col "conf" em `_ensureColWidths`/`_attachColResize`/
 *      `_autoFitColumn`).
 *
 * Mudanças de 27/08/2026, sexta rodada (pedido do usuário):
 *  19) Corrigido: o aviso geral "Atenção: os arquivos carregados pertencem
 *      a N conferências diferentes" (ver _updateSummary) usava um ⚠️
 *      genérico, diferente do 🏳️ usado nos patrimônios com a flag
 *      "conferência diferente" (ver `_rowIconFor`) — agora usa o MESMO
 *      ícone, pra deixar claro que é o mesmo tipo de aviso.
 *  20) Corrigido (extensão do item 19 — pedido do usuário: "é em todas as
 *      ocorrências... também quando clica em um patrimônio (a flag que
 *      aparece no rodapé)"): o cartão de informações do item (aberto ao
 *      clicar num patrimônio, ver `_itemDetailPanelHtml`) também tinha um
 *      ⚠️ fixo no rodapé, mesmo quando a inconsistência era "conferência
 *      diferente" — agora usa `_rowIconFor(it)`, a MESMA função que decide o
 *      ícone da linha/card na listagem, então o ícone do rodapé do cartão
 *      sempre bate com o que apareceu na listagem que levou até ele.
 *
 * Mudanças de 28/08/2026, rodada 19 (pedido do usuário): "Deve haver a
 * possibilidade de mesclar mapas e fotos. Também na importação e no
 * 'unificar fontes diferentes'. O unificar fontes diferentes deve organizar
 * todos os tipos de arquivos, nas 3 categorias (Mapa, Foto e patrimônio).
 * Atualmente só organiza os patrimônios. Dê um jeito para que organize
 * também mapas e fotos. As fotos são atreladas aos mapas. Então acaba sendo
 * a organização dos mapas (por consequência, as fotos também)."
 *  21) `_onFilesChosen` agora também lê `maps`/`mapPhotos`/`fotosDeAmbiente`
 *      de cada arquivo carregado (antes só lia `itens`/`items` — um arquivo
 *      só com mapas/fotos, sem nenhum item, era REJEITADO por engano com
 *      "não parece um arquivo exportado deste app").
 *  22) NOVO painel "🗺️ Mapas" (`#uf-mapas-panel`, ver _renderMapasPanel),
 *      logo abaixo do resumo: lista cada mapa encontrado (agrupado por ID —
 *      critério escolhido pelo usuário: "Mesmo ID (Recomendado)" — dois
 *      mapas com o MESMO id, vindos de arquivos diferentes, são a mesma
 *      planta e viram candidatos a mesclagem). Quando um mapa tem mais de
 *      um candidato (apareceu em mais de um arquivo), mostra um botão
 *      "Escolher versão" (ver _chooseMapVersion) que abre o mesmo seletor
 *      usado na importação de backup (Utils.showMapMergeChoiceModal): "Uma
 *      vira a base, as outras só contribuem com fotos/itens. Deve ser
 *      possível decidir qual mapa vai ficar... deve aparecer a quantidade
 *      (como se fosse uma flag) de itens/objetos/coisas que tem nele" — a
 *      escolha auto-inicial é o candidato com mais itens+fotos+objetos ao
 *      todo, mas fica marcada como "escolha manual" (preservada entre
 *      re-análises) assim que o usuário mexe.
 *  23) "⬇️ Baixar unificado" e "✅ Aplicar neste aparelho" agora incluem os
 *      mapas/fotos escolhidos (ver _buildFinalMapasEFotos) — aplicar usa o
 *      mesmo helper compartilhado da importação de backup
 *      (Utils.importMapsWithConflictUI) pra resolver contra o que já existe
 *      no aparelho, e reencaixa `ambienteId` dos itens/fotos mesclados via
 *      o `idRemap` resultante antes de gravar.
 *
 * Mudanças de 28/08/2026, rodada 19 — CORREÇÕES (mesmo dia, pedido do
 * usuário, 2 relatos separados):
 *  24) "Não está dando para ver a lista de patrimônios, em 'unificar fontes
 *      diferentes'": o painel "🗺️ Mapas" (item 22 acima) não tinha limite de
 *      altura — com vários mapas carregados, ele podia crescer o suficiente
 *      pra empurrar `#uf-view` (a lista de patrimônios, que só recebe o
 *      espaço que sobra, `flex:1 1 auto`) pra uma altura efetivamente zero.
 *      Corrigido: a lista de mapas dentro do painel agora tem
 *      `max-height:220px; overflow-y:auto` (rola por dentro, não empurra
 *      mais o resto da tela).
 *  25) "Não adianta nada aparecer os mapas... se não tem como tomar ações
 *      sobre o que está ali, por exemplo, mesclar mapas": o painel só
 *      oferecia "Escolher versão" quando dois mapas JÁ tinham o MESMO id
 *      (critério automático) — dois mapas que são o mesmo lugar mas foram
 *      criados independentemente em aparelhos diferentes (ids DIFERENTES)
 *      não tinham NENHUMA ação disponível. NOVO botão "🔗 Mesclar com outro
 *      mapa" (`_mergeMapManually`) em TODA linha-raiz, sempre disponível:
 *      abre uma lista dos outros mapas carregados, e o escolhido vira a
 *      base (`mesclarComId`, campo novo no grupo, persistido entre
 *      re-análises igual `escolhaManual`) — o mapa mesclado passa a
 *      aparecer ANINHADO embaixo do alvo no painel, com um botão "↩️
 *      Desfazer mesclagem". `_resolveManualMapRemap()` (NOVA) resolve a
 *      cadeia de mesclagens num Map(idOriginal -> idFinal), usado por
 *      `_buildFinalMapasEFotos` (fotos) e por `_downloadUnified`/
 *      `_applyToDevice` (itens, ANTES do remap de conflito com o
 *      dispositivo) pra reencaixar `ambienteId` corretamente.
 *  26) "No importar, se há várias coisas para decidir, deve aparecer em uma
 *      única janela": a opção "🔀 Mesclar" de `Utils.importMapsWithConflictUI`
 *      (usada tanto na importação de backup quanto em "✅ Aplicar neste
 *      aparelho") abria um modal POR MAPA colidente, um atrás do outro —
 *      substituído por `Utils.showMapMergeBatchModal` (ver utils.js): UM
 *      ÚNICO modal lista TODAS as linhas de conflito de uma vez, cada uma
 *      com dois "cartões" clicáveis (local/novo) já vindo com uma escolha
 *      padrão marcada; um só botão "✅ Confirmar" aplica tudo.
 */

const UnifyView = {
  _container: null,
  _sources: [],   // [{ fileName, conferenciaId, conferenciaNome, totalItens }]
  _merged: [],    // itens mesclados, cada um com _fonteArquivo/_fonteIdx/_problemas
  _viewBy: 'item', // item | arquivo — pedido do usuário (27/08/2026), ver item (6) do comentário acima
  // Pedido do usuário (27/08/2026, rodada seguinte, item 7): agora vale pros
  // dois `_viewBy` — Tabela/Cartões são subopções tanto de "Por item" quanto
  // de "Por arquivo" (deixou de ser "só usado quando _viewBy === 'item'").
  _mode: 'tabela', // tabela | cards
  _cols: 1,
  // Pedido do usuário (27/08/2026, rodada seguinte, item 10): era 46 —
  // reduzido para 1/3 (a causa de verdade do espaçamento grande demais era
  // a falta de um `height` explícito na linha, ver _renderTableWindow).
  _rowH: 15,
  _cardRowH: 200,
  _minColW: 150,
  _gap: 12,
  _onScroll: null,
  _onResize: null,
  _colWidths: null, // colunas redimensionáveis do modo Tabela — ver _ensureColWidths
  // ---------- Filtros (novo, 27/08/2026, rodada seguinte, itens 8/9) ----------
  _filtrosAbertos: false,
  _ignorarConferenciasDiferentes: true, // pedido do usuário: "vem habilitada por padrão"
  _filtroConfSelecionadas: null, // Set<string> de ids de conferência marcados pra aparecer na listagem
  _conferenciasConhecidas: null, // Set<string> — controla quais ids já foram vistos, pra marcar os NOVOS como visíveis por padrão sem desmarcar escolhas manuais já feitas
  _conferenciasInfo: [], // [{id, nome, count}] — pra desenhar a lista de caixinhas do painel de filtros
  // Pedido do usuário (27/08/2026, terceira rodada, item 14): conferências
  // "fixadas" (📌) — ficam numa fileira sempre visível mesmo com o painel de
  // filtros recolhido.
  _pinnedConferencias: null, // Set<string> de ids de conferência fixados
  // Pedido do usuário (27/08/2026, quarta rodada, item 17): "o botão 'ignorar
  // conferências diferentes' deve ter um pin também e ativado por padrão" —
  // ao contrário de `_pinnedConferencias` (que começa vazio), este já nasce
  // fixado (true).
  _pinnedIgnorarConf: true,
  // ---------- Mapas/fotos (novo, 28/08/2026, rodada 19) ----------
  // Grupos de mapas por id: [{id, nome, candidatos:[{srcIdx, fileName, map,
  // counts:{itens,fotos,objetos}}], escolhaIdx, escolhaManual}] — ver
  // _analyzeMapas. `escolhaManual` preserva a escolha do usuário entre
  // re-análises (novo arquivo carregado, item descartado, etc.).
  _mapasMerged: [],
  // Fotos de ambiente (`mapPhotos`/`fotosDeAmbiente`) de TODAS as fontes,
  // dedupadas por id (mais recente por atualizadoEm/criadoEm vence) — ver
  // _analyzeMapas.
  _fotosMergedRaw: [],

  async mount(container) {
    this._container = container;
    // Pedido do usuário (27/08/2026, terceira rodada, item 13): "ao sair da
    // tela... as informações carregadas dos arquivos não devem ser perdidas
    // e o que já foi feito/marcado deve permanecer. Só reseta tudo apenas
    // quando se clica em 'Limpar'." — mount() NÃO reinicia mais nada (era o
    // comportamento antigo, ver item (4)/rodada seguinte no comentário do
    // topo do arquivo); todo o estado (`_sources`/`_merged`/`_viewBy`/
    // `_mode`/filtros/larguras/fixados) agora só é reiniciado por
    // `_resetAll()`, chamado só pelo botão "🗑️ Limpar" (ver mais abaixo).
    // Na primeira vez que o app roda, os valores iniciais dos campos acima
    // (definidos no literal do objeto) já cobrem o "começar vazio" — não é
    // preciso reatribuir aqui.
    if (!this._conferenciasConhecidas) this._conferenciasConhecidas = new Set();
    if (!this._pinnedConferencias) this._pinnedConferencias = new Set();
    // Ícone do item (sem foto) desenhado em SVG na hora — ver avatar.js.
    this._iconState = await Avatar.loadIconState();
    container.innerHTML = `
      <div class="unify-wrap">
        <div class="view-pad" style="padding-bottom:8px; flex:0 0 auto">
          <!-- Pedido do usuário, 25/08/2026: "coloque um botão de 'fechar', que faz voltar
               para as 'configurações do app'" — esta tela só é alcançada a partir de lá
               (botão "🔗 Unificar fontes diferentes" em Configurações → Catálogo →
               Conferência de patrimônio), mas não tinha nenhum jeito de voltar sem usar a
               navegação de baixo (Tabela/Cartões/Fotos/Mapa/Buscar). Mesmo estilo/classe
               (.settings-close-bar) do botão "✕ Fechar" das próprias Configurações. -->
          <div class="settings-close-bar">
            <button class="btn secondary sm" id="uf-close" title="Fechar e voltar para as Configurações">✕ Fechar</button>
          </div>
          <h3 style="margin-top:0">🔗 Unificar fontes diferentes</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Escolha os arquivos .json exportados de cada celular/PC que participou desta
            conferência de patrimônio (botão "⬇️ Sessão" na tela Capturar, ou "⬇️ Exportar
            backup" nas Configurações). Dá pra escolher vários de uma vez, ou ir adicionando
            aos poucos — nada é sobrescrito, cada item tem um ID próprio.
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
            <label class="btn secondary" style="cursor:pointer" title="Escolher um ou mais arquivos .json exportados de diferentes aparelhos">
              📂 Escolher arquivos (.json)
              <input type="file" id="uf-files" accept="application/json" multiple class="hidden">
            </label>
            <button class="btn secondary" id="uf-clear" title="Remover todos os arquivos carregados e começar de novo">🗑️ Limpar</button>
          </div>
          <div id="uf-summary" style="font-size:12.5px; color:var(--text-dim)"></div>
          <!-- Pedido do usuário (28/08/2026, rodada 19): "o unificar fontes
               diferentes deve organizar também mapas e fotos" — painel com
               um mapa por linha, mostrando quantos candidatos (arquivos
               diferentes com o MESMO id) cada um tem, e deixando escolher
               qual planta vira a base quando houver mais de um — ver
               _renderMapasPanel/_chooseMapVersion. -->
          <div id="uf-mapas-panel" class="hidden" style="margin-top:8px"></div>
        </div>
        <div id="uf-toolbar" class="view-pad hidden" style="padding-top:0; padding-bottom:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; flex:0 0 auto">
          <!-- Pedido do usuário (27/08/2026): novo jeito de exibir, além de Tabela/Cartões
               — "por item" (o de sempre) ou "por arquivo" (uma coluna por arquivo). -->
          <div class="search-mode-toggle" id="uf-viewby-toggle">
            <button class="icon-btn" data-viewby="item" title="Ver a lista item a item (Tabela ou Cartões)">🧾 Por item</button>
            <button class="icon-btn" data-viewby="arquivo" title="Ver lado a lado, uma coluna por arquivo carregado — mostra os patrimônios duplicados entre arquivos">🗃️ Por arquivo</button>
          </div>
          <div class="search-mode-toggle" id="uf-mode-toggle">
            <button class="icon-btn" data-mode="tabela" title="Ver a lista unificada em tabela">📋 Tabela</button>
            <button class="icon-btn" data-mode="cards" title="Ver a lista unificada em cartões com foto">🗂️ Cartões</button>
          </div>
          <!-- Pedido do usuário (27/08/2026, rodada seguinte): filtros recolhíveis
               — ver #uf-filters-panel logo abaixo. -->
          <button class="btn secondary sm" id="uf-filters-toggle" title="Mostrar/esconder filtros (conferências exibidas na listagem)">🔍 Filtros ▾</button>
          <div style="flex:1"></div>
          <button class="btn secondary sm" id="uf-download" title="Baixar a lista unificada como um único arquivo .json">⬇️ Baixar unificado (.json)</button>
          <button class="btn sm" id="uf-apply" title="Importar todos os itens unificados para o catálogo deste aparelho">✅ Aplicar neste aparelho</button>
        </div>
        <!-- Pedido do usuário (27/08/2026, quarta rodada, item 16): a fileira
             de opções FIXADAS (📌) saiu de dentro da barra de ferramentas
             (brigava por espaço com os outros botões) e agora fica numa linha
             própria, sempre embaixo dela — ver _renderPinnedChips. -->
        <div id="uf-pinned-chips" class="view-pad hidden" style="padding-top:0; padding-bottom:8px; display:flex; flex-wrap:wrap; gap:6px; flex:0 0 auto"></div>
        <!-- Pedido do usuário (27/08/2026, rodada seguinte): painel de filtros
             recolhível — lista as conferências encontradas nos arquivos
             carregados (marcar/desmarcar controla o que aparece na Tabela/
             Cartões/Por arquivo, sem afetar Baixar/Aplicar) e o toggle
             "ignorar conferências diferentes" (habilitado por padrão). -->
        <div id="uf-filters-panel" class="view-pad hidden" style="flex:0 0 auto; padding:10px 14px; border-bottom:1px solid var(--border); background:var(--bg-elev)">
          <!-- Pedido do usuário (27/08/2026, quarta rodada, item 15): o "pill"
               de borda arredondada envolve a caixinha E o pino juntos (ver
               .uf-conf-chip em style.css) — igual às conferências da lista
               logo abaixo. Item 17: este também ganhou um pino, fixado por
               padrão (_pinnedIgnorarConf). -->
          <span class="uf-conf-chip" style="margin-bottom:10px">
            <label class="uf-conf-chip-label" style="font-size:12.5px">
              <input type="checkbox" id="uf-ignore-conf">
              Ignorar conferências diferentes (não sinaliza nem avisa mais sobre isso)
            </label>
            <button type="button" class="icon-btn uf-conf-pin" id="uf-ignore-conf-pin" title="Fixar/desafixar (fica visível mesmo com os filtros recolhidos)">📌</button>
          </span>
          <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px">Mostrar na listagem os itens das conferências:</div>
          <div id="uf-conf-checklist" style="display:flex; flex-wrap:wrap; gap:6px 10px"></div>
        </div>
        <!-- Pedido do usuário (28/08/2026, rodada 22): "Ainda não está dando
             para ver a lista de patrimônios... pois os mapas cobriram toda a
             tela. Garanta que a lista de patrimônios irá aparecer, colocando
             um scroll-y mínimo de 400px." — o max-height:220px já colocado
             no painel de mapas (ver item 24 do comentário no topo do arquivo)
             não bastou (o painel tem mais coisa em volta da lista — título,
             linhas "aninhadas" de mesclagem manual etc. — que também não
             tinham limite, e a soma ainda empurrava #uf-view pra perto de
             zero). Corrigido AQUI, na própria lista, em vez de só no que fica
             em cima dela: min-height:0 (que deixava encolher até
             desaparecer) virou min-height:400px (nunca fica menor que isso,
             não importa quão alto o painel de mapas/resto fique acima) +
             overflow-y:auto (com o espaço garantido, ela mesma rola por
             dentro pra mostrar todos os itens). -->
        <div id="uf-view" class="hidden" style="position:relative; flex:1 1 auto; min-height:400px; overflow-y:auto"></div>
      </div>
    `;

    // Pedido do usuário, 26/08/2026: usa App.back() em vez de
    // App.navigate('configuracoes') direto — ver App._navStack (app.js). A
    // versão antiga formava um CICLO com o "✕ Fechar" de Configurações: os
    // dois usavam a mesma variável única (_prevView), e cada "Fechar" clicado
    // sobrescrevia ela com a tela que estava saindo, fazendo o par
    // Configurações<->Unificar ficar indo e voltando entre si sem nunca sair
    // de vez.
    container.querySelector('#uf-close').onclick = () => App.back('configuracoes');
    container.querySelector('#uf-files').onchange = (e) => { this._onFilesChosen(e.target.files); e.target.value = ''; };
    container.querySelector('#uf-clear').onclick = () => { this._resetAll(); this._render(); };
    container.querySelectorAll('#uf-viewby-toggle button').forEach((btn) => {
      btn.onclick = () => {
        this._viewBy = btn.dataset.viewby;
        this._updateToggleButtons();
        this._mountViewMode();
      };
    });
    container.querySelectorAll('#uf-mode-toggle button').forEach((btn) => {
      btn.onclick = () => {
        this._mode = btn.dataset.mode;
        this._updateToggleButtons();
        this._mountViewMode();
      };
    });
    container.querySelector('#uf-filters-toggle').onclick = () => {
      this._filtrosAbertos = !this._filtrosAbertos;
      container.querySelector('#uf-filters-toggle').textContent = this._filtrosAbertos ? '🔍 Filtros ▴' : '🔍 Filtros ▾';
      this._renderFiltersPanel();
    };
    container.querySelector('#uf-download').onclick = () => this._downloadUnified();
    container.querySelector('#uf-apply').onclick = () => this._applyToDevice();

    this._updateToggleButtons();
    this._render();
  },

  unmount() {
    this._detachScrollHandlers();
    this._container = null;
  },

  /** Reinicia TODO o estado desta ferramenta — pedido do usuário (27/08/2026,
   *  terceira rodada, item 13): "só reseta tudo apenas quando se clica em
   *  'Limpar'". Antes este reinício acontecia (por engano) toda vez que a
   *  tela era reaberta, dentro de mount() — ver comentário lá em cima. */
  _resetAll() {
    this._sources = [];
    this._merged = [];
    this._viewBy = 'item';
    this._mode = 'tabela';
    this._colWidths = null;
    this._filtrosAbertos = false;
    this._ignorarConferenciasDiferentes = true;
    this._filtroConfSelecionadas = null;
    this._conferenciasConhecidas = new Set();
    this._conferenciasInfo = [];
    this._pinnedConferencias = new Set();
    this._pinnedIgnorarConf = true;
    this._mapasMerged = [];
    this._fotosMergedRaw = [];
    this._updateToggleButtons();
  },

  /** Marca visualmente os botões dos dois seletores (Por item/Por arquivo e
   *  Tabela/Cartões) de acordo com o ESTADO atual (`_viewBy`/`_mode`) —
   *  pedido do usuário (27/08/2026), ver item (4) do comentário grande no
   *  topo: antes o HTML tinha a classe "active" fixa no primeiro botão de
   *  cada grupo, sem nenhuma relação com o valor de verdade em memória.
   *  (27/08/2026, rodada seguinte, item 7): o seletor Tabela/Cartões NÃO é
   *  mais escondido quando "Por arquivo" está ativo — pedido do usuário:
   *  "'Tabela' e 'Cartões' devem ficar disponíveis tanto para... 'Por item'
   *  quanto... 'Por arquivo'. Pois... são subopções." */
  _updateToggleButtons() {
    const c = this._container;
    if (!c) return;
    c.querySelectorAll('#uf-viewby-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.viewby === this._viewBy));
    c.querySelectorAll('#uf-mode-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.mode === this._mode));
  },

  async _onFilesChosen(fileList) {
    const arquivos = Array.from(fileList || []);
    if (!arquivos.length) return;
    for (const f of arquivos) {
      try {
        const text = await f.text();
        const data = JSON.parse(text);
        const itens = data.itens || data.items || [];
        // Pedido do usuário (28/08/2026, rodada 19): "o unificar fontes
        // diferentes deve organizar todos os tipos de arquivos, nas 3
        // categorias (Mapa, Foto e patrimônio)" — antes desta correção um
        // arquivo só com mapas/fotos (ex.: backup exportado só com a
        // categoria "Mapas" ou "Imagens", sem nenhum item) era REJEITADO
        // aqui como "não parece um arquivo exportado deste app", mesmo
        // sendo um arquivo válido. `fotosDeAmbiente` tem o mesmo formato de
        // `mapPhotos` (ver settings.js #st-import, mesma observação lá).
        const maps = Array.isArray(data.maps) ? data.maps : [];
        const mapPhotos = [
          ...(Array.isArray(data.mapPhotos) ? data.mapPhotos : []),
          ...(Array.isArray(data.fotosDeAmbiente) ? data.fotosDeAmbiente : []),
        ];
        if (!itens.length && !maps.length && !mapPhotos.length) {
          Utils.toast(`"${f.name}" não parece um arquivo exportado deste app (sem itens, mapas ou fotos).`, { type: 'warn' });
          continue;
        }
        this._sources.push({
          fileName: f.name,
          conferenciaId: data.conferenciaId || data.settings?.conferenciaId || null,
          conferenciaNome: data.conferenciaNome || data.settings?.conferenciaNome || '',
          itens,
          maps,
          mapPhotos,
        });
      } catch (e) {
        Utils.toast(`Não consegui ler "${f.name}": ${e.message}`, { type: 'danger' });
      }
    }
    this._analyze();
  },

  /** Mescla por ID único (o mais recente por "modificadoEm" vence em caso de
   *  duplicidade do MESMO id) e sinaliza inconsistências item a item. */
  _analyze() {
    const byId = new Map();
    this._sources.forEach((src, sIdx) => {
      src.itens.forEach((it) => {
        if (!it || !it.id) return;
        const prev = byId.get(it.id);
        if (!prev || (it.modificadoEm || '') > (prev.modificadoEm || '')) {
          // Pedido do usuário (27/08/2026): `_fonteIdx` (índice do arquivo em
          // `this._sources`) guardado junto — usado pelo novo modo "Por
          // arquivo" (_buildArquivoMatrix) pra saber de qual COLUNA cada item
          // veio, sem depender do nome do arquivo (que poderia se repetir).
          byId.set(it.id, { ...it, _fonteArquivo: src.fileName, _fonteIdx: sIdx, _fonteConferenciaId: src.conferenciaId, _fonteConferenciaNome: src.conferenciaNome });
        }
      });
    });
    const merged = [...byId.values()];

    // conferência predominante entre as fontes carregadas (moda) — itens de
    // outra conferência ficam destacados como possível mistura por engano
    // (a NÃO SER que "ignorar conferências diferentes" esteja marcado, ver
    // pedido do usuário logo abaixo).
    const contagem = {};
    merged.forEach((it) => { if (it._fonteConferenciaId) contagem[it._fonteConferenciaId] = (contagem[it._fonteConferenciaId] || 0) + 1; });
    let conferenciaPrincipal = null, max = 0;
    Object.entries(contagem).forEach(([id, n]) => { if (n > max) { max = n; conferenciaPrincipal = id; } });
    this._conferenciasDistintas = Object.keys(contagem).length;

    // Pedido do usuário (27/08/2026, rodada seguinte, item 8): "as diversas
    // conferências devem aparecer para serem marcadas para serem exibidas na
    // listagem" — monta a lista de conferências distintas (incluindo um
    // grupo "(sem conferência definida)" pra itens sem esse campo) pro
    // painel de filtros desenhar as caixinhas (ver _renderFiltersPanel).
    // Conferências NUNCA vistas antes entram já marcadas (visíveis) por
    // padrão — sem isso, toda vez que um arquivo novo trouxesse uma
    // conferência inédita ela nasceria escondida da listagem sem motivo.
    const confMeta = new Map();
    merged.forEach((it) => {
      const key = it._fonteConferenciaId || '__sem__';
      const nome = it._fonteConferenciaId ? (it._fonteConferenciaNome || it._fonteConferenciaId.slice(0, 8)) : '(sem conferência definida)';
      if (!confMeta.has(key)) confMeta.set(key, { id: key, nome, count: 0 });
      confMeta.get(key).count++;
    });
    this._conferenciasInfo = [...confMeta.values()].sort((a, b) => b.count - a.count);
    if (!this._filtroConfSelecionadas) this._filtroConfSelecionadas = new Set();
    if (!this._conferenciasConhecidas) this._conferenciasConhecidas = new Set();
    this._conferenciasInfo.forEach((c) => {
      if (!this._conferenciasConhecidas.has(c.id)) {
        this._conferenciasConhecidas.add(c.id);
        this._filtroConfSelecionadas.add(c.id);
      }
    });

    // agrupa por patrimônio pra achar duplicatas com dados conflitantes entre si
    const byPatrimonio = new Map();
    merged.forEach((it) => {
      const key = (it.patrimonio || '').trim().toUpperCase();
      if (!key) return;
      if (!byPatrimonio.has(key)) byPatrimonio.set(key, []);
      byPatrimonio.get(key).push(it);
    });

    merged.forEach((it) => {
      const problemas = [];
      // Pedido do usuário (27/08/2026, terceira rodada, item 11): flags
      // separadas pra "conferência diferente" e "duplicação de patrimônio" —
      // usadas em _renderTableWindow/_renderCardsWindow pra escolher ícone e
      // cor diferentes pra cada caso (antes as duas caíam no mesmo ⚠️
      // âmbar genérico de `_problemas.length > 0`).
      it._flagConferencia = false;
      it._flagDuplicado = false;
      if (!it.patrimonio || !it.patrimonio.trim()) problemas.push('Sem número de patrimônio');
      // Pedido do usuário (27/08/2026, rodada seguinte, item 9): "deve haver
      // um botão de 'ignorar conferências diferentes'. Se for marcado, então,
      // a flag de 'conferência diferente' também não é mais mostrada."
      if (!this._ignorarConferenciasDiferentes && conferenciaPrincipal && it._fonteConferenciaId && it._fonteConferenciaId !== conferenciaPrincipal) {
        problemas.push(`Veio de outra conferência (${it._fonteConferenciaNome || it._fonteConferenciaId.slice(0, 8)}), diferente da maioria dos arquivos carregados`);
        it._flagConferencia = true;
      }
      const irmaos = byPatrimonio.get((it.patrimonio || '').trim().toUpperCase()) || [];
      if (irmaos.length > 1) {
        it._flagDuplicado = true;
        const tipos = new Set(irmaos.map((s) => (s.tipo || '').trim().toLowerCase()).filter(Boolean));
        if (tipos.size > 1) problemas.push(`Patrimônio repetido (${irmaos.length}×) com TIPOS diferentes entre si: ${[...tipos].join(' / ')}`);
        const setores = new Set(irmaos.map((s) => (s.setor || '').trim().toLowerCase()).filter(Boolean));
        if (setores.size > 1) problemas.push(`Patrimônio repetido (${irmaos.length}×) com SETORES diferentes entre si: ${[...setores].join(' / ')}`);
      }
      it._problemas = problemas;
    });

    merged.sort((a, b) => (b._problemas.length - a._problemas.length) || (a.patrimonio || '').localeCompare(b.patrimonio || ''));
    this._merged = merged;
    // Pedido do usuário (28/08/2026, rodada 19): mapas/fotos de todas as
    // fontes, agrupados/dedupados — ver _analyzeMapas.
    this._analyzeMapas();
    // Pedido do usuário (27/08/2026, terceira rodada, item 12): "ao carregar
    // as informações dos arquivos, a largura das colunas deve ser ajustada
    // para isso também" — autoajusta as 4 colunas redimensionáveis (mesma
    // lógica do duplo clique manual, ver _autoFitAllColumns).
    this._autoFitAllColumns();
    this._render();
  },

  /** Agrupa os mapas de TODAS as fontes carregadas por ID (critério de
   *  "mesmo lugar" escolhido pelo usuário — 28/08/2026: "Mesmo ID
   *  (Recomendado)") e monta `this._mapasMerged`: um grupo por id, com um
   *  candidato por arquivo-fonte que trouxe aquele id. Também dedupa
   *  `mapPhotos`/`fotosDeAmbiente` de todas as fontes em `_fotosMergedRaw`
   *  (mais recente por atualizadoEm/criadoEm vence em caso do mesmo id —
   *  fotos não têm um "grupo com candidatos", já que não têm planta pra
   *  decidir entre versões: só o registro mais recente importa). Preserva
   *  a escolha manual do usuário (`escolhaManual`) entre re-análises. */
  _analyzeMapas() {
    const gruposAntigos = new Map((this._mapasMerged || []).map((g) => [g.id, g]));
    const porId = new Map();
    this._sources.forEach((src, srcIdx) => {
      (src.maps || []).forEach((m) => {
        if (!m || !m.id) return;
        if (!porId.has(m.id)) porId.set(m.id, { id: m.id, nome: m.nome || 'Ambiente', candidatos: [] });
        const grupo = porId.get(m.id);
        if (m.nome) grupo.nome = m.nome;
        grupo.candidatos.push({
          srcIdx,
          fileName: src.fileName,
          map: m,
          counts: {
            itens: this._merged.filter((it) => it.ambienteId === m.id && it._fonteIdx === srcIdx).length,
            fotos: (src.mapPhotos || []).filter((p) => p?.ambienteId === m.id).length,
            objetos: (m.objects || []).length,
          },
        });
      });
    });
    this._mapasMerged = [...porId.values()].map((grupo) => {
      const antigo = gruposAntigos.get(grupo.id);
      let escolhaIdx = 0;
      let escolhaManual = false;
      if (antigo?.escolhaManual) {
        // Preserva a escolha manual anterior, se o candidato escolhido
        // ainda existir neste novo agrupamento (mesmo fileName+srcIdx).
        const antigoEscolhido = antigo.candidatos[antigo.escolhaIdx];
        const idx = antigoEscolhido ? grupo.candidatos.findIndex((c) => c.fileName === antigoEscolhido.fileName) : -1;
        if (idx >= 0) { escolhaIdx = idx; escolhaManual = true; }
      }
      if (!escolhaManual) {
        // Auto-escolhe o candidato com mais itens+fotos+objetos ao todo.
        let max = -1;
        grupo.candidatos.forEach((c, idx) => {
          const total = c.counts.itens + c.counts.fotos + c.counts.objetos;
          if (total > max) { max = total; escolhaIdx = idx; }
        });
      }
      // Pedido do usuário (28/08/2026, correção): "não tem como tomar ações
      // sobre o que está ali, por exemplo, mesclar mapas" — mesclagem MANUAL
      // entre mapas de IDS DIFERENTES (o critério automático "mesmo id" não
      // ajuda quando dois aparelhos geraram o mesmo lugar com ids distintos).
      // `mesclarComId` (id de OUTRO grupo pro qual este foi mesclado
      // manualmente, ver _mergeMapManually) precisa sobreviver a
      // re-análises, já que não vem de contagem nenhuma — é uma decisão do
      // usuário, igual `escolhaManual` acima.
      return { ...grupo, escolhaIdx, escolhaManual, mesclarComId: antigo?.mesclarComId || null };
    });
    this._mapasMerged.sort((a, b) => (b.candidatos.length - a.candidatos.length) || a.nome.localeCompare(b.nome));

    // Fotos de ambiente — dedupadas por id, mais recente vence (mesmo
    // critério de mesclagem dos itens, ver início de _analyze acima).
    const fotosPorId = new Map();
    this._sources.forEach((src) => {
      (src.mapPhotos || []).forEach((p) => {
        if (!p || !p.id) return;
        const prev = fotosPorId.get(p.id);
        const dataP = p.atualizadoEm || p.criadoEm || '';
        const dataPrev = prev ? (prev.atualizadoEm || prev.criadoEm || '') : '';
        if (!prev || dataP > dataPrev) fotosPorId.set(p.id, p);
      });
    });
    this._fotosMergedRaw = [...fotosPorId.values()];
  },

  /** Resolve a cadeia de mesclagens MANUAIS (`mesclarComId`, ver
   *  _mergeMapManually) num Map(idOriginal -> idFinal) — cada grupo sem
   *  `mesclarComId` mapeia pra ELE MESMO; um grupo mesclado manualmente
   *  aponta pro id final do grupo-alvo (seguindo a cadeia, caso A tenha
   *  sido mesclado em B e B tenha sido mesclado em C). Usado por
   *  `_buildFinalMapasEFotos` (fotos) e por `_downloadUnified`/
   *  `_applyToDevice` (itens) pra reencaixar `ambienteId` antes de gravar. */
  _resolveManualMapRemap() {
    const remap = new Map();
    const resolve = (id, vistos) => {
      if (remap.has(id)) return remap.get(id);
      const grupo = this._mapasMerged.find((g) => g.id === id);
      if (!grupo || !grupo.mesclarComId || vistos.has(id)) return id;
      vistos.add(id);
      return resolve(grupo.mesclarComId, vistos);
    };
    this._mapasMerged.forEach((g) => remap.set(g.id, resolve(g.id, new Set())));
    return remap;
  },

  /** Devolve os mapas/fotos FINAIS (após a escolha de versão de cada grupo
   *  E as mesclagens manuais entre grupos de ids diferentes) — usados tanto
   *  por "⬇️ Baixar unificado" quanto por "✅ Aplicar neste aparelho". Só
   *  entram os grupos "raiz" (sem `mesclarComId` — os que NÃO foram
   *  mesclados manualmente em outro); fotos são remapeadas pelo id final. */
  _buildFinalMapasEFotos() {
    const remap = this._resolveManualMapRemap();
    const maps = this._mapasMerged
      .filter((g) => !g.mesclarComId)
      .map((g) => g.candidatos[g.escolhaIdx]?.map)
      .filter(Boolean);
    const mapPhotos = this._fotosMergedRaw.map((p) => ({ ...p, ambienteId: remap.get(p.ambienteId) || p.ambienteId }));
    return { maps, mapPhotos, idRemapManual: remap };
  },

  /** Quantos grupos de mapas ainda precisam de uma revisão manual (mais de
   *  um candidato e o usuário ainda não escolheu) — usado no resumo (ver
   *  _updateSummary) pra avisar que há decisões pendentes. */
  _mapaGruposPendentes() {
    return this._mapasMerged.filter((g) => g.candidatos.length > 1 && !g.escolhaManual).length;
  },

  /** Desenha o painel "🗺️ Mapas" — pedido do usuário (28/08/2026, rodada
   *  19; correção no mesmo dia: "não tem como tomar ações sobre o que está
   *  ali, por exemplo, mesclar mapas"): lista cada mapa encontrado — grupos
   *  já mesclados manualmente em outro (`mesclarComId`) aparecem ANINHADOS
   *  embaixo do mapa-alvo (com um botão "↩️ Desfazer"), não mais como linha
   *  própria — e cada mapa-raiz ganha DUAS ações: "🔀 Escolher versão"
   *  (só quando há mais de um candidato com o MESMO id) e "🔀 Mesclar com
   *  outro mapa" (SEMPRE disponível — cobre o caso de dois mapas com IDS
   *  DIFERENTES que na prática são o mesmo lugar, ex.: dois aparelhos
   *  mapeando o mesmo ambiente de forma independente). */
  _renderMapasPanel() {
    const panel = this._container?.querySelector('#uf-mapas-panel');
    if (!panel) return;
    if (!this._mapasMerged.length) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    panel.classList.remove('hidden');
    const raizes = this._mapasMerged.filter((g) => !g.mesclarComId);
    const filhosDe = (id) => this._mapasMerged.filter((g) => g.mesclarComId === id);
    const linhaHtml = (g, { filha = false } = {}) => {
      const escolhido = g.candidatos[g.escolhaIdx];
      const c = escolhido?.counts || { itens: 0, fotos: 0, objetos: 0 };
      return `
      <div class="uf-mapa-row" data-id="${Utils.escapeHtml(g.id)}" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:6px 10px; border:1px solid var(--border); border-radius:8px; ${filha ? 'margin-left:22px; background:var(--bg-elev)' : ''}">
        <span style="font-weight:700">${filha ? '↳ ' : '🗺️ '}${Utils.escapeHtml(g.nome)}</span>
        ${g.candidatos.length > 1 ? `<span class="badge" title="Este mapa aparece em ${g.candidatos.length} arquivo(s) carregados">🔀 ${g.candidatos.length} versões</span>` : ''}
        <span class="badge">🏷️ ${c.itens}</span>
        <span class="badge">📷 ${c.fotos}</span>
        <span class="badge">🧱 ${c.objetos}</span>
        ${escolhido ? `<span style="font-size:11px; color:var(--text-dim)">— planta de: ${Utils.escapeHtml(escolhido.fileName)}</span>` : ''}
        <div style="flex:1"></div>
        ${filha
          ? `<button type="button" class="btn secondary sm uf-mapa-desfazer" data-id="${Utils.escapeHtml(g.id)}" title="Desfazer esta mesclagem — este mapa volta a ser independente">↩️ Desfazer mesclagem</button>`
          : `${g.candidatos.length > 1 ? `<button type="button" class="btn secondary sm uf-mapa-escolher" data-id="${Utils.escapeHtml(g.id)}">🔀 Escolher versão</button>` : ''}
             <button type="button" class="btn secondary sm uf-mapa-mesclar" data-id="${Utils.escapeHtml(g.id)}" title="Mesclar este mapa com outro carregado que seja, na prática, o mesmo lugar (mesmo com id diferente)">🔗 Mesclar com outro mapa</button>`}
      </div>`;
    };
    panel.innerHTML = `
      <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px">🗺️ Mapas encontrados (fotos ligadas a eles seguem junto) — use "🔗 Mesclar com outro mapa" pra juntar dois mapas que são o mesmo lugar:</div>
      <div style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto">
        ${raizes.map((g) => linhaHtml(g) + filhosDe(g.id).map((f) => linhaHtml(f, { filha: true })).join('')).join('')}
      </div>
    `;
    panel.querySelectorAll('.uf-mapa-escolher').forEach((btn) => {
      btn.onclick = () => this._chooseMapVersion(btn.dataset.id);
    });
    panel.querySelectorAll('.uf-mapa-mesclar').forEach((btn) => {
      btn.onclick = () => this._mergeMapManually(btn.dataset.id);
    });
    panel.querySelectorAll('.uf-mapa-desfazer').forEach((btn) => {
      btn.onclick = () => this._undoManualMerge(btn.dataset.id);
    });
  },

  /** Abre o seletor de versão (Utils.showMapMergeChoiceModal) pra um grupo
   *  de mapas com mais de um candidato — pedido do usuário (28/08/2026):
   *  "Deve ser possível decidir qual mapa vai ficar." Ao escolher, marca
   *  `escolhaManual: true` (preservada entre re-análises, ver
   *  _analyzeMapas) e redesenha o painel/resumo. */
  async _chooseMapVersion(mapId) {
    const grupo = this._mapasMerged.find((g) => g.id === mapId);
    if (!grupo) return;
    const idx = await Utils.showMapMergeChoiceModal({
      title: `Qual versão de "${grupo.nome}" deve virar a planta?`,
      message: 'A(s) outra(s) contribui(em) só com fotos/itens vinculados a este mapa — a planta (paredes/objetos) da escolhida é a única que fica.',
      candidates: grupo.candidatos.map((c) => ({ label: `📄 ${c.fileName}`, counts: c.counts })),
    });
    if (idx === null) return;
    grupo.escolhaIdx = idx;
    grupo.escolhaManual = true;
    this._renderMapasPanel();
    this._updateSummary();
  },

  /** Mescla ESTE mapa (de id X) com OUTRO mapa carregado (de id Y, escolhido
   *  numa lista) — pedido do usuário (28/08/2026, correção): "não tem como
   *  tomar ações sobre o que está ali, por exemplo, mesclar mapas". Cobre o
   *  caso que o critério automático "mesmo id" não resolve: dois aparelhos
   *  mapeando independentemente o MESMO lugar físico geram ids diferentes,
   *  então nunca formam um grupo automático — aqui o usuário decide na mão.
   *  A planta do mapa ESCOLHIDO (Y) vira a base; este (X) passa a só
   *  contribuir com itens/fotos (reencaixados por `_resolveManualMapRemap`
   *  em `_buildFinalMapasEFotos`/download/aplicar) — vira uma linha
   *  ANINHADA embaixo de Y no painel, com um botão pra desfazer. */
  async _mergeMapManually(mapId) {
    const grupo = this._mapasMerged.find((g) => g.id === mapId);
    if (!grupo) return;
    const outros = this._mapasMerged.filter((g) => g.id !== mapId && !g.mesclarComId);
    if (!outros.length) { Utils.toast('Não há outro mapa independente carregado para mesclar com este.', { type: 'warn' }); return; }
    const resultado = await Utils.showChoiceModal({
      title: `Mesclar "${grupo.nome}" com qual outro mapa?`,
      message: 'A planta do mapa ESCOLHIDO abaixo vira a base — a planta de (' + grupo.nome + ') é descartada, mas os itens/fotos que apontavam pra ela continuam funcionando, reencaixados no mapa escolhido.',
      choices: [
        ...outros.map((g) => ({ value: g.id, label: `🗺️ ${g.nome}`, secondary: true })),
        { value: 'cancelar', label: 'Cancelar' },
      ],
    });
    if (!resultado || resultado === 'cancelar') return;
    grupo.mesclarComId = resultado;
    // Se o mapa escolhido como alvo tinha revisão de versão pendente, isso
    // não muda — a mesclagem só afeta ESTE grupo (X), que passa a apontar
    // pra Y (não altera Y nem sua própria escolha de candidato).
    this._renderMapasPanel();
    this._updateSummary();
    const alvo = this._mapasMerged.find((g) => g.id === resultado);
    Utils.toast(`"${grupo.nome}" mesclado com "${alvo?.nome || ''}" ✓`, { type: 'ok' });
  },

  /** Desfaz uma mesclagem manual — o mapa volta a ser independente (linha
   *  própria no painel, com sua própria planta na exportação/aplicação). */
  _undoManualMerge(mapId) {
    const grupo = this._mapasMerged.find((g) => g.id === mapId);
    if (!grupo) return;
    grupo.mesclarComId = null;
    this._renderMapasPanel();
    this._updateSummary();
  },

  /** Ícone da flag de aviso do item — pedido do usuário (27/08/2026, terceira
   *  rodada, item 11): "ícones de flag diferentes... para quando o
   *  patrimônio é de uma conferência diferente e para quando é uma
   *  duplicação." Duplicação tem prioridade visual (é o problema mais sério:
   *  dado potencialmente conflitante), depois conferência diferente, depois
   *  o ⚠️ genérico de sempre (ex.: sem número de patrimônio). */
  _rowIconFor(it) {
    if (it._flagDuplicado) return '🚩';
    if (it._flagConferencia) return '🏳️';
    return it._problemas.length ? '⚠️' : '';
  },

  /** Classe CSS da linha/card conforme a mesma prioridade de `_rowIconFor` —
   *  duplicação usa o roxo já estabelecido no app pra isso (`.uf-row-dup`,
   *  ver css/style.css — mesma cor de `.flashcard--dup`), conferência
   *  diferente e o genérico continuam no âmbar de sempre (`.uf-problema`). */
  _rowClassFor(it) {
    if (it._flagDuplicado) return 'uf-row-dup';
    if (it._problemas.length) return 'uf-problema';
    return '';
  },

  _render() {
    const container = this._container;
    if (!container) return;
    const toolbar = container.querySelector('#uf-toolbar');
    const view = container.querySelector('#uf-view');

    if (!this._sources.length) {
      this._updateSummary();
      toolbar.classList.add('hidden');
      view.classList.add('hidden');
      this._detachScrollHandlers();
      view.innerHTML = '';
      this._renderFiltersPanel();
      this._renderMapasPanel();
      return;
    }

    this._updateSummary();
    toolbar.classList.remove('hidden');
    view.classList.remove('hidden');
    this._updateToggleButtons();
    this._renderFiltersPanel();
    this._renderMapasPanel();
    this._mountViewMode();
  },

  /** Redesenha só o texto de resumo (#uf-summary) — separado de `_render()`
   *  pra poder ser chamado sozinho quando só o FILTRO de exibição muda
   *  (marcar/desmarcar uma conferência no painel de filtros), sem precisar
   *  reanalisar/remesclar nada. */
  _updateSummary() {
    const summary = this._container?.querySelector('#uf-summary');
    if (!summary) return;
    if (!this._sources.length) { summary.innerHTML = 'Nenhum arquivo carregado ainda.'; return; }

    const comProblema = this._merged.filter((it) => it._problemas.length > 0).length;
    // Pedido do usuário (27/08/2026, rodada seguinte, item 9): o aviso geral
    // de "conferências diferentes" some junto com a flag por item quando
    // "ignorar conferências diferentes" está marcado.
    // Pedido do usuário (27/08/2026, sexta rodada): "o ícone que aparece na
    // mensagem... deve ser o mesmo que aparece nos patrimônios com essa
    // flag" — antes usava um ⚠️ genérico, diferente do 🏳️ usado nas
    // linhas/cards com a flag "conferência diferente" (ver `_rowIconFor`).
    const avisoConferencia = (!this._ignorarConferenciasDiferentes && this._conferenciasDistintas > 1)
      ? `<div class="badge" style="background:rgba(232,179,57,.15); border-color:var(--warn); color:var(--warn); margin-top:6px">🏳️ Atenção: os arquivos carregados pertencem a ${this._conferenciasDistintas} conferências diferentes — confira os itens destacados antes de aplicar.</div>`
      : '';
    const visiveis = this._filteredMerged();
    const avisoFiltro = visiveis.length !== this._merged.length
      ? ` · <span style="color:var(--text-dim)">${visiveis.length} exibido(s) na listagem após filtro de conferência</span>`
      : '';
    // Pedido do usuário (28/08/2026, rodada 19): resumo agora também menciona
    // mapas/fotos encontrados, e avisa quando algum mapa com mais de uma
    // versão ainda não teve uma escolhida manualmente (ver _analyzeMapas).
    const pendentes = this._mapaGruposPendentes();
    // Conta só os mapas RAIZ (não mesclados manualmente em outro, ver
    // _mergeMapManually) — é a quantidade real de mapas que sai no final.
    const mapasRaiz = this._mapasMerged.filter((g) => !g.mesclarComId).length;
    const resumoMapas = this._mapasMerged.length
      ? ` · ${mapasRaiz} mapa(s) · ${this._fotosMergedRaw.length} foto(s) de ambiente`
      : '';
    const avisoMapasPendentes = pendentes
      ? `<div class="badge" style="background:rgba(232,179,57,.15); border-color:var(--warn); color:var(--warn); margin-top:6px">🔀 ${pendentes} mapa(s) com mais de uma versão — escolha qual planta fica em "🗺️ Mapas" acima.</div>`
      : '';
    summary.innerHTML = `
      ${this._sources.length} arquivo(s) carregado(s) · ${this._merged.length} item(ns) únicos depois de mesclar (por ID)${resumoMapas}
      ${comProblema ? ` · <b style="color:var(--warn)">${comProblema} com inconsistência para revisar</b>` : ' · nenhuma inconsistência encontrada ✓'}${avisoFiltro}
      <div style="margin-top:4px">${this._sources.map((s) => `<span class="badge" style="margin:2px 4px 2px 0">${Utils.escapeHtml(s.fileName)} (${s.itens.length})</span>`).join('')}</div>
      ${avisoConferencia}
      ${avisoMapasPendentes}
    `;
  },

  /** Pedido do usuário (27/08/2026, rodada seguinte, item 8): itens
   *  efetivamente exibidos na listagem (Tabela/Cartões/Por arquivo),
   *  filtrados pelas conferências marcadas no painel de filtros. NÃO afeta
   *  `_downloadUnified`/`_applyToDevice`, que sempre operam sobre
   *  `this._merged` completo — o filtro é só de EXIBIÇÃO, como pedido. */
  _filteredMerged() {
    if (!this._filtroConfSelecionadas) return this._merged;
    return this._merged.filter((it) => this._filtroConfSelecionadas.has(it._fonteConferenciaId || '__sem__'));
  },

  /** Desenha/atualiza o conteúdo do painel de filtros recolhível — pedido do
   *  usuário (27/08/2026, rodada seguinte): "deve haver filtros, um botão
   *  recolhível. As diversas conferências devem aparecer para serem
   *  marcadas para serem exibidas na listagem" + toggle "ignorar
   *  conferências diferentes". Chamado sempre que `_analyze()`/`_render()`
   *  rodam (a lista de conferências pode mudar a cada arquivo carregado). */
  _renderFiltersPanel() {
    const panel = this._container?.querySelector('#uf-filters-panel');
    if (!panel) return;
    panel.classList.toggle('hidden', !(this._sources.length && this._filtrosAbertos));

    const ignoreBox = panel.querySelector('#uf-ignore-conf');
    if (ignoreBox) {
      ignoreBox.checked = this._ignorarConferenciasDiferentes;
      ignoreBox.onchange = () => {
        this._ignorarConferenciasDiferentes = ignoreBox.checked;
        this._analyze(); // reavalia as flags "conferência diferente" (ver _analyze)
      };
    }
    // Pedido do usuário (27/08/2026, quarta rodada, item 17): "o botão
    // 'ignorar conferências diferentes' deve ter um pin também e ativado por
    // padrão" — mesmo mecanismo de fixar das conferências abaixo, só que
    // controlando `_pinnedIgnorarConf` (booleano simples, não um Set).
    const ignorePin = panel.querySelector('#uf-ignore-conf-pin');
    if (ignorePin) {
      ignorePin.title = this._pinnedIgnorarConf ? 'Desafixar' : 'Fixar (fica visível mesmo com os filtros recolhidos)';
      ignorePin.style.opacity = this._pinnedIgnorarConf ? '1' : '.45';
      ignorePin.onclick = () => {
        this._pinnedIgnorarConf = !this._pinnedIgnorarConf;
        this._renderFiltersPanel();
        this._renderPinnedChips();
      };
    }

    const list = panel.querySelector('#uf-conf-checklist');
    if (!list) return;
    if (!this._conferenciasInfo.length) {
      list.innerHTML = '<span style="color:var(--text-dim); font-size:12px">Nenhuma conferência identificada ainda.</span>';
      this._renderPinnedChips();
      return;
    }
    // Pedido do usuário (27/08/2026, terceira rodada, item 14; ajustado na
    // quarta rodada, item 15): botão de "fixar" (📌) atrelado a cada
    // conferência do filtro — fixadas aparecem sempre visíveis em
    // #uf-pinned-chips, mesmo com este painel recolhido. O "pill" de borda
    // arredondada (`.uf-conf-chip`) agora envolve a caixinha E o pino juntos
    // — antes cada um tinha seu próprio contorno, dando a impressão de serem
    // duas coisas separadas.
    list.innerHTML = this._conferenciasInfo.map((c) => `
      <span class="uf-conf-chip">
        <label class="uf-conf-chip-label">
          <input type="checkbox" class="uf-conf-check" data-id="${Utils.escapeHtml(c.id)}" ${this._filtroConfSelecionadas?.has(c.id) ? 'checked' : ''}>
          ${Utils.escapeHtml(c.nome)} (${c.count})
        </label>
        <button type="button" class="icon-btn uf-conf-pin" data-id="${Utils.escapeHtml(c.id)}" title="${this._pinnedConferencias?.has(c.id) ? 'Desafixar' : 'Fixar (fica visível mesmo com os filtros recolhidos)'}" style="opacity:${this._pinnedConferencias?.has(c.id) ? '1' : '.45'}">📌</button>
      </span>`).join('');
    list.querySelectorAll('.uf-conf-check').forEach((cb) => {
      cb.onchange = () => {
        if (cb.checked) this._filtroConfSelecionadas.add(cb.dataset.id);
        else this._filtroConfSelecionadas.delete(cb.dataset.id);
        // Só redesenha a listagem — o filtro é de exibição, não precisa
        // reanalisar/remesclar nada (ver _filteredMerged).
        this._updateSummary();
        this._mountViewMode();
      };
    });
    list.querySelectorAll('.uf-conf-pin').forEach((btn) => {
      btn.onclick = () => {
        if (!this._pinnedConferencias) this._pinnedConferencias = new Set();
        const id = btn.dataset.id;
        if (this._pinnedConferencias.has(id)) this._pinnedConferencias.delete(id);
        else this._pinnedConferencias.add(id);
        this._renderFiltersPanel();
        this._renderPinnedChips();
      };
    });
    this._renderPinnedChips();
  },

  /** Fileira sempre visível, em SUA PRÓPRIA LINHA logo abaixo da barra de
   *  ferramentas (pedido do usuário, quarta rodada, item 16 — antes vivia
   *  espremida dentro de `#uf-toolbar`) com as opções FIXADAS — pedido do
   *  usuário (27/08/2026, terceira rodada, item 14): "para cada opção do
   *  filtro deve haver uma outra opção atrelada a ela para fixar (um pino),
   *  mesmo quando os filtros forem recolhidos." Cada chip aqui também é uma
   *  caixinha de marcar/desmarcar (mesmo efeito de `_filtroConfSelecionadas`
   *  ou de `_ignorarConferenciasDiferentes`), só que compacta e sempre à
   *  mão. Inclui, desde a quarta rodada (item 17), o próprio toggle
   *  "Ignorar conferências diferentes" quando ele estiver fixado
   *  (`_pinnedIgnorarConf`, HABILITADO por padrão). */
  _renderPinnedChips() {
    const box = this._container?.querySelector('#uf-pinned-chips');
    if (!box) return;
    const fixadas = this._conferenciasInfo.filter((c) => this._pinnedConferencias?.has(c.id));
    const mostrarIgnorarConf = this._sources.length && this._pinnedIgnorarConf;
    box.classList.toggle('hidden', !fixadas.length && !mostrarIgnorarConf);
    const chipIgnorar = mostrarIgnorarConf ? `
      <label class="uf-conf-chip uf-conf-chip-pinned" title="Fixado — clique pra ligar/desligar">
        <input type="checkbox" id="uf-ignore-conf-pinned">
        📌 Ignorar conferências diferentes
      </label>` : '';
    const chipsConf = fixadas.map((c) => `
      <label class="uf-conf-chip uf-conf-chip-pinned" title="Conferência fixada — clique pra marcar/desmarcar na listagem">
        <input type="checkbox" class="uf-conf-check-pinned" data-id="${Utils.escapeHtml(c.id)}" ${this._filtroConfSelecionadas?.has(c.id) ? 'checked' : ''}>
        📌 ${Utils.escapeHtml(c.nome)}
      </label>`).join('');
    box.innerHTML = chipIgnorar + chipsConf;
    const ignorarPinned = box.querySelector('#uf-ignore-conf-pinned');
    if (ignorarPinned) {
      ignorarPinned.checked = this._ignorarConferenciasDiferentes;
      ignorarPinned.onchange = () => {
        this._ignorarConferenciasDiferentes = ignorarPinned.checked;
        this._analyze();
      };
    }
    box.querySelectorAll('.uf-conf-check-pinned').forEach((cb) => {
      cb.onchange = () => {
        if (cb.checked) this._filtroConfSelecionadas.add(cb.dataset.id);
        else this._filtroConfSelecionadas.delete(cb.dataset.id);
        this._renderFiltersPanel();
        this._updateSummary();
        this._mountViewMode();
      };
    });
  },

  _mountViewMode() {
    const view = this._container?.querySelector('#uf-view');
    if (!view) return;
    this._detachScrollHandlers();
    if (this._viewBy === 'arquivo') { this._mountPorArquivo(view); return; }
    if (this._mode === 'cards') this._mountCards(view); else this._mountTable(view);
  },

  _detachScrollHandlers() {
    if (this._scrollEl && this._onScroll) this._scrollEl.removeEventListener('scroll', this._onScroll);
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._scrollEl = null; this._onScroll = null; this._onResize = null;
  },

  // ---------- Modo tabela (virtualizado por linha) ----------

  /** Larguras iniciais das colunas redimensináveis do modo Tabela — pedido
   *  do usuário (27/08/2026): "deve ter o mesmo método de exibição no botão
   *  'Tabela'... com colunas de largura modificável" (mesma técnica de
   *  table.js `_ensureColWidths`, adaptada pras colunas redimensionáveis
   *  daqui: Patrimônio/Tipo/Setor/Conferência/Fonte — a 1ª coluna, do ícone
   *  ⚠️, fica sempre fixa em 34px, de fora daqui). A coluna "Conferência"
   *  (pedido do usuário, quinta rodada: "entre as colunas 'setor' e 'fonte'
   *  deve haver uma coluna para 'conferência'") fica entre Setor e Fonte. */
  _ensureColWidths() {
    if (this._colWidths) return;
    const ICON_W = 34, GAP = 8, ROW_PAD = 24, PATR_W = 110, SETOR_W = 100, CONF_W = 130, FONTE_W = 130, TIPO_MIN = 140, TIPO_DEFAULT = 220;
    const avail = this._container?.clientWidth || 900;
    const tipoFill = avail - ICON_W - PATR_W - SETOR_W - CONF_W - FONTE_W - GAP * 5 - ROW_PAD;
    const tipo = Math.max(TIPO_MIN, Math.min(TIPO_DEFAULT, tipoFill));
    this._colWidths = { patr: PATR_W, tipo, setor: SETOR_W, conf: CONF_W, fonte: FONTE_W };
  },

  /** Aplica `_colWidths` via variável CSS (`--uf-cols`), lida pelo `.uf-row`
   *  em css/style.css — mesma técnica de `--tbl-cols` em table.js. */
  _applyColWidths() {
    const w = this._colWidths;
    if (!w || !this._container) return;
    this._container.style.setProperty('--uf-cols', `34px ${w.patr}px ${w.tipo}px ${w.setor}px ${w.conf}px ${w.fonte}px`);
  },

  /** Liga o arrastar-pra-redimensionar de cada alça no cabeçalho — igual
   *  table.js `_attachColResize` (Pointer Events + setPointerCapture). */
  _attachColResize() {
    const MIN_W = { patr: 60, tipo: 100, setor: 60, conf: 60, fonte: 60 };
    this._container?.querySelectorAll('#uf-view .vtable-resize-handle').forEach((handle) => {
      const col = handle.dataset.col;
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = this._colWidths[col];
        handle.classList.add('resizing');
        handle.setPointerCapture(e.pointerId);
        const onMove = (ev) => {
          const delta = ev.clientX - startX;
          this._colWidths[col] = Math.max(MIN_W[col] || 50, Math.round(startW + delta));
          this._applyColWidths();
        };
        const onUp = () => {
          handle.classList.remove('resizing');
          handle.releasePointerCapture(e.pointerId);
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
      });
      handle.addEventListener('click', (e) => e.stopPropagation());
      // Pedido do usuário (27/08/2026, terceira rodada, item 12): "dar dois
      // cliques em cima das divisórias das colunas deve fazer com que elas
      // fiquem com a largura o suficiente para mostrar o conteúdo de todas
      // as suas linhas" — mesmo gesto/técnica de table.js `_autoFitColumn`.
      handle.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._autoFitColumn(col);
      });
    });
  },

  /** "Autoajustar" (duplo clique na divisória, ver _attachColResize acima) —
   *  mede o texto de CADA item já mesclado (`this._merged`, não só os
   *  visíveis/filtrados no momento, pra continuar cabendo mesmo se o filtro
   *  mudar depois) com a mesma fonte usada nas linhas de verdade, e usa a
   *  maior largura encontrada (incluindo o título da própria coluna) como a
   *  nova largura — mesma técnica de table.js `_autoFitColumn`. */
  _autoFitColumn(col) {
    const FIELD_BY_COL = { patr: 'patrimonio', tipo: 'tipo', setor: 'setor', conf: '_conferenciaLabel', fonte: '_fonteArquivo' };
    const HEADER_BY_COL = { patr: 'Patrimônio', tipo: 'Tipo', setor: 'Setor', conf: 'Conferência', fonte: 'Fonte' };
    const AUTOFIT_MIN_W = { patr: 40, tipo: 40, setor: 40, conf: 40, fonte: 40 };
    const field = FIELD_BY_COL[col];
    if (!field || !this._colWidths) return;
    const canvas = this._measureCanvas || (this._measureCanvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    const sampleRow = this._container?.querySelector('.vtable-row');
    ctx.font = sampleRow ? getComputedStyle(sampleRow).font : '13px sans-serif';
    let max = ctx.measureText(HEADER_BY_COL[col] || '').width;
    this._merged.forEach((it) => {
      // Pedido do usuário (27/08/2026, quinta rodada): coluna "Conferência",
      // entre Setor e Fonte — não é um campo direto do item, então usa o
      // mesmo texto exibido na célula (ver `_conferenciaLabel(it)` mais
      // abaixo, também usado por _renderTableWindow).
      const val = col === 'conf' ? this._conferenciaLabel(it) : (field === 'tipo' ? (it.tipo || it.descricao || '') : (it[field] || ''));
      const w = ctx.measureText(String(val)).width;
      if (w > max) max = w;
    });
    const PADDING = 14; // respiro mínimo nas bordas da célula — só o suficiente pra não cortar a letra
    this._colWidths[col] = Math.max(AUTOFIT_MIN_W[col] || 30, Math.round(max + PADDING));
    this._applyColWidths();
  },

  /** Texto exibido na coluna "Conferência" (Tabela) — mesma lógica de nome
   *  usada em `_analyze()`/`_renderFiltersPanel` pra identificar a conferên-
   *  cia de origem de cada item, só que pronta pra exibir numa célula. */
  _conferenciaLabel(it) {
    if (!it._fonteConferenciaId) return '(sem conferência)';
    return it._fonteConferenciaNome || it._fonteConferenciaId.slice(0, 8);
  },

  /** Autoajusta as colunas redimensionáveis de uma vez — chamado ao fim de
   *  _analyze() (item 12: "ao carregar as informações dos arquivos, a
   *  largura das colunas deve ser ajustada para isso também"). */
  _autoFitAllColumns() {
    this._ensureColWidths();
    ['patr', 'tipo', 'setor', 'conf', 'fonte'].forEach((col) => this._autoFitColumn(col));
  },

  _mountTable(view) {
    this._ensureColWidths();
    view.innerHTML = `
      <div class="vtable-head uf-row" style="position:sticky; top:0; z-index:2; background:var(--bg-elev)">
        <span></span>
        <span class="vtable-th"><span class="vtable-th-label">Patrimônio</span><span class="vtable-resize-handle" data-col="patr" title="Arrastar para redimensionar"></span></span>
        <span class="vtable-th"><span class="vtable-th-label">Tipo</span><span class="vtable-resize-handle" data-col="tipo" title="Arrastar para redimensionar"></span></span>
        <span class="vtable-th"><span class="vtable-th-label">Setor</span><span class="vtable-resize-handle" data-col="setor" title="Arrastar para redimensionar"></span></span>
        <span class="vtable-th"><span class="vtable-th-label">Conferência</span><span class="vtable-resize-handle" data-col="conf" title="Arrastar para redimensionar"></span></span>
        <span class="vtable-th"><span class="vtable-th-label">Fonte</span><span class="vtable-resize-handle" data-col="fonte" title="Arrastar para redimensionar"></span></span>
      </div>
      <div class="vtable" id="uf-scroll" style="height:calc(100% - 34px)">
        <div class="vtable-spacer" id="uf-spacer"></div>
      </div>
    `;
    this._applyColWidths();
    this._attachColResize();
    this._scrollEl = view.querySelector('#uf-scroll');
    this._scrollEl.addEventListener('scroll', this._onScroll = () => this._renderTableWindow());
    window.addEventListener('resize', this._onResize = () => this._renderTableWindow());
    this._renderTableWindow();
  },

  _renderTableWindow() {
    const scroll = this._scrollEl;
    const spacer = this._container?.querySelector('#uf-spacer');
    if (!scroll || !spacer) return;
    // Pedido do usuário (27/08/2026, rodada seguinte, item 8): a listagem
    // reflete o filtro de conferências marcadas — ver _filteredMerged.
    const list = this._filteredMerged();
    spacer.style.height = `${list.length * this._rowH}px`;

    const scrollTop = scroll.scrollTop;
    const viewH = scroll.clientHeight || 500;
    const first = Math.max(0, Math.floor(scrollTop / this._rowH) - 4);
    const last = Math.min(list.length - 1, Math.ceil((scrollTop + viewH) / this._rowH) + 4);

    let html = '';
    for (let i = first; i <= last; i++) {
      const it = list[i];
      if (!it) continue;
      // Pedido do usuário (27/08/2026, terceira rodada, item 11): ícone e
      // classe de cor diferentes pra "duplicação de patrimônio" (🚩, roxo)
      // e "conferência diferente" (🏳️, âmbar) — ver _rowClassFor/_rowIconFor.
      const rowClass = this._rowClassFor(it);
      const icon = this._rowIconFor(it);
      // Pedido do usuário (27/08/2026, rodada seguinte, item 10): `height`
      // explícito aqui (igual à Tabela principal, ver table.js ROW_H) — a
      // causa de verdade do espaço grande demais entre linhas era essa
      // altura nunca ter sido fixada, sobrando vão vazio até a próxima linha.
      html += `
        <div class="vtable-row uf-row ${rowClass}" style="top:${i * this._rowH}px; height:${this._rowH}px" data-id="${it.id}" title="${it._problemas.length ? Utils.escapeHtml(it._problemas.join(' · ')) : 'Toque para ver as informações deste item'}">
          <span style="text-align:center">${icon}</span>
          <span class="cell-clip">${Utils.escapeHtml(it.patrimonio || '—')}</span>
          <span class="cell-clip">${Utils.escapeHtml(it.tipo || it.descricao || '—')}</span>
          <span class="cell-clip">${Utils.escapeHtml(it.setor || '—')}</span>
          <span class="cell-clip" style="font-size:11px; color:var(--text-dim)">${Utils.escapeHtml(this._conferenciaLabel(it))}</span>
          <span class="cell-clip" style="font-size:11px; color:var(--text-dim)">${Utils.escapeHtml(it._fonteArquivo || '—')}</span>
        </div>`;
    }
    spacer.innerHTML = html;
    // Pedido do usuário (27/08/2026): "poder clicar e o card de informações
    // aparecer (atualmente, clica-se e nada acontece)" — ver _showItemCard.
    spacer.querySelectorAll('.vtable-row').forEach((row) => {
      row.onclick = () => {
        const it = this._merged.find((x) => x.id === row.dataset.id);
        if (it) this._showItemCard(it);
      };
    });
  },

  // ---------- Modo cards (grade virtualizada por linha, igual flashcards.js) ----------
  _mountCards(view) {
    // Pedido do usuário (28/08/2026, rodada 23): "no modo de Cartões, acaba
    // aparecendo dois scrolls: um maior (com quase nada para se mover) e o
    // outro, que deveria ser só este" — causa: .vgrid (css/style.css) usa
    // flex:1 1 auto; min-height:0 pra calcular sua altura como "o resto do
    // espaço disponível", mas isso só funciona dentro de um pai
    // display:flex — #uf-view (onde este HTML entra) NÃO é flex, só
    // position:relative, então essas regras eram ignoradas e .vgrid crescia
    // sem limite (altura = altura natural do #uf-spacer virtualizado, bem
    // maior que a tela). Resultado: #uf-view (que ganhou overflow-y:auto na
    // rodada 22, pra garantir que a lista aparecesse) tinha que rolar essa
    // caixa gigante — um scroll "de verdade" ali dentro, MAIS o scroll do
    // #uf-view por cima, dois no total. Corrigido do mesmo jeito que a
    // Tabela já fazia (ver _mountTable/#uf-scroll logo acima, que usa
    // height:calc(100% - 34px) por não depender de contexto flex): altura
    // explícita height:100% (sem cabeçalho fixo pra descontar, ao contrário
    // da Tabela) — agora É esta caixa (.vgrid) que fica do tamanho certo e
    // rola sozinha; #uf-view deixa de precisar rolar.
    view.innerHTML = `
      <div class="vgrid" id="uf-scroll" style="height:100%">
        <div class="vgrid-spacer" id="uf-spacer"></div>
      </div>
    `;
    this._scrollEl = view.querySelector('#uf-scroll');
    this._recalcCardGrid();
    this._scrollEl.addEventListener('scroll', this._onScroll = () => this._renderCardsWindow());
    window.addEventListener('resize', this._onResize = () => { this._recalcCardGrid(); this._renderCardsWindow(); });
    this._renderCardsWindow();
  },

  _recalcCardGrid() {
    const width = this._scrollEl?.clientWidth || 320;
    this._cols = Math.max(1, Math.floor((width + this._gap) / (this._minColW + this._gap)));
    const colW = (width - this._gap * (this._cols - 1)) / this._cols;
    this._cardRowH = colW + 78 + this._gap;
  },

  _renderCardsWindow() {
    const scroll = this._scrollEl;
    const spacer = this._container?.querySelector('#uf-spacer');
    if (!scroll || !spacer) return;
    // Pedido do usuário (27/08/2026, rodada seguinte, item 8): idem à Tabela
    // — respeita o filtro de conferências marcadas (ver _filteredMerged).
    const list = this._filteredMerged();
    const totalRows = Math.ceil(list.length / this._cols);
    spacer.style.height = `${totalRows * this._cardRowH + 12}px`;

    const scrollTop = scroll.scrollTop;
    const viewH = scroll.clientHeight || 500;
    const firstRow = Math.max(0, Math.floor((scrollTop - 12) / this._cardRowH) - 2);
    const lastRow = Math.min(totalRows - 1, Math.ceil((scrollTop - 12 + viewH) / this._cardRowH) + 2);

    let html = '';
    for (let r = firstRow; r <= lastRow; r++) {
      const start = r * this._cols;
      const rowItems = list.slice(start, start + this._cols);
      if (!rowItems.length) continue;
      html += `<div class="vgrid-row" style="top:${12 + r * this._cardRowH}px; grid-template-columns: repeat(${this._cols}, 1fr)">`;
      rowItems.forEach((it) => {
        // Pedido do usuário (27/08/2026, terceira rodada, item 11): mesma
        // distinção duplicação/conferência-diferente do modo Tabela, aqui
        // no modo Cartões (ver _rowClassFor/_rowIconFor).
        const rowClass = this._rowClassFor(it);
        const icon = this._rowIconFor(it);
        const iconSvg = Avatar.itemIconSvg(it, this._iconState, { size: 96 });
        html += `
          <div class="flashcard ${rowClass}" data-id="${it.id}" title="${it._problemas.length ? Utils.escapeHtml(it._problemas.join(' · ')) : 'Toque para ver as informações deste item'}">
            <div class="thumb thumb-svg">${iconSvg}${icon ? `<span class="uf-badge${it._flagDuplicado ? ' uf-badge-dup' : ''}">${icon}</span>` : ''}</div>
            <div class="body">
              <div class="patrimonio">${Utils.escapeHtml(it.patrimonio || '—')}</div>
              <div class="descricao">${Utils.escapeHtml(it.descricao || it.tipo || '(sem descrição)')}</div>
              <div class="meta"><span>${Utils.escapeHtml(it.tipo || '—')}</span><span>${Utils.escapeHtml(it.setor || '')}</span></div>
            </div>
          </div>`;
      });
      html += `</div>`;
    }
    spacer.innerHTML = html;
    // Pedido do usuário (27/08/2026): mesmo fix de clique da Tabela acima —
    // no modo Cartões o `data-id` nem existia ainda no HTML do card.
    spacer.querySelectorAll('.flashcard').forEach((el) => {
      el.onclick = () => {
        const it = this._merged.find((x) => x.id === el.dataset.id);
        if (it) this._showItemCard(it);
      };
    });
  },

  // ---------- Modo "Por arquivo" (novo, 27/08/2026) ----------

  /** Agrupa os itens EXIBIDOS (`_filteredMerged`, respeita o filtro de
   *  conferências) por número de patrimônio (uma linha por número distinto)
   *  e, dentro de cada linha, pelos ARQUIVOS onde aquele número aparece
   *  (`_fonteIdx`, ver _analyze) — é isto que a exibição "Por arquivo"
   *  desenha como colunas. Itens sem patrimônio ganham uma linha própria
   *  (não têm como ser comparados/duplicados por número).
   *  Sem virtualização por linha aqui (diferente da Tabela/Cartões) — as
   *  linhas já são por PATRIMÔNIO ÚNICO (tipicamente bem menos que o total
   *  de itens brutos), suficiente pro uso normal desta ferramenta. */
  _buildArquivoMatrix() {
    const byPatr = new Map();
    this._filteredMerged().forEach((it) => {
      const key = (it.patrimonio || '').trim().toUpperCase() || `__sem-patrimonio__${it.id}`;
      if (!byPatr.has(key)) byPatr.set(key, { patrimonio: it.patrimonio || '', cells: new Map() });
      const row = byPatr.get(key);
      const idx = it._fonteIdx;
      if (!row.cells.has(idx)) row.cells.set(idx, []);
      row.cells.get(idx).push(it);
    });
    const rows = [...byPatr.values()];
    rows.sort((a, b) => (b.cells.size - a.cells.size) || a.patrimonio.localeCompare(b.patrimonio));
    return rows;
  },

  /** HTML de UM item dentro de uma célula do modo "Por arquivo" — pedido do
   *  usuário (rodada seguinte, item 7): "Tabela"/"Cartões" agora também
   *  decidem como cada item aparece aqui (linha compacta de texto, ou um
   *  "cartãozinho" com ícone), igual já faziam em "Por item". */
  _arqItemChipHtml(it) {
    if (this._mode === 'cards') {
      const iconSvg = Avatar.itemIconSvg(it, this._iconState, { size: 44 });
      return `
        <div class="uf-arq-item uf-arq-item-card" data-id="${it.id}" title="Toque para ver as informações deste item">
          <div class="thumb thumb-svg" style="width:36px; height:36px; margin:0 auto 4px">${iconSvg}</div>
          <div class="cell-clip" style="text-align:center; font-weight:700">${Utils.escapeHtml(it.patrimonio || '—')}</div>
          <div class="cell-clip" style="text-align:center; font-size:11px; color:var(--text-dim)">${Utils.escapeHtml(it.tipo || it.descricao || '—')}</div>
        </div>`;
    }
    return `<div class="uf-arq-item" data-id="${it.id}" title="Toque para ver as informações deste item"><b class="cell-clip">${Utils.escapeHtml(it.patrimonio || '—')}</b><br><span class="cell-clip" style="color:var(--text-dim); font-size:11.5px">${Utils.escapeHtml(it.tipo || it.descricao || '—')}</span></div>`;
  },

  _mountPorArquivo(view) {
    const linhas = this._buildArquivoMatrix();
    const n = this._sources.length;
    const minColW = this._minColW; // mesma largura mínima do modo Cartões, pedido do usuário (27/08/2026)
    const headHtml = this._sources.map((src, i) => `
      <div class="uf-arq-col-head">
        <div class="cell-clip" style="font-weight:700; font-size:12.5px" title="${Utils.escapeHtml(src.fileName)}">📄 ${Utils.escapeHtml(src.fileName)}</div>
        <div style="font-size:11px; color:var(--text-dim); margin:2px 0 6px">${src.itens.length} item(ns)</div>
        <button type="button" class="btn secondary sm uf-arq-keep" data-idx="${i}" style="width:100%" title="Descarta as informações dos OUTROS arquivos carregados, mantendo só as deste">✅ Ficar com as informações deste unicamente</button>
      </div>`).join('');
    const bodyHtml = linhas.map((row) => this._sources.map((src, i) => {
      const itens = row.cells.get(i) || [];
      const duplicado = row.cells.size > 1;
      return `
        <div class="uf-arq-cell ${duplicado ? 'uf-arq-dup' : ''}">
          ${itens.length
            ? itens.map((it) => this._arqItemChipHtml(it)).join(this._mode === 'cards' ? '' : '<hr class="uf-arq-item-sep">')
            : '<span style="color:var(--text-dim)">—</span>'}
        </div>`;
    }).join('')).join('');
    view.innerHTML = `
      <div id="uf-arq-scroll" style="overflow:auto; height:100%">
        <div id="uf-arq-grid" style="display:grid; grid-template-columns: repeat(${n}, minmax(${minColW}px, 1fr)); min-width:${n * minColW}px">
          ${headHtml}${bodyHtml}
        </div>
      </div>
    `;
    view.querySelectorAll('.uf-arq-item').forEach((el) => {
      el.onclick = () => {
        const it = this._merged.find((x) => x.id === el.dataset.id);
        if (it) this._showItemCard(it);
      };
    });
    view.querySelectorAll('.uf-arq-keep').forEach((btn) => {
      btn.onclick = () => this._keepOnlyThisFile(Number(btn.dataset.idx));
    });
  },

  /** Pedido do usuário (27/08/2026): "ficar com as informações deste [arquivo]
   *  unicamente" — descarta TODOS os outros arquivos carregados desta
   *  revisão (não mexe no catálogo do aparelho, só na lista sendo revisada
   *  aqui — nada foi "Aplicado" ainda nesse ponto). Pede confirmação
   *  explicando o que vai acontecer, como pedido. */
  _keepOnlyThisFile(idx) {
    const src = this._sources[idx];
    if (!src) return;
    const outros = this._sources.length - 1;
    if (!outros) { Utils.toast('Já há só um arquivo carregado.', { type: 'warn' }); return; }
    const ok = confirm(`Ficar só com as informações do arquivo "${src.fileName}"?\n\nOs outros ${outros} arquivo(s) carregado(s) nesta tela serão descartados desta revisão (nada é apagado do catálogo já salvo neste aparelho — só desta lista de unificação). Não dá pra desfazer sem carregar os arquivos de novo.`);
    if (!ok) return;
    this._sources = [src];
    this._analyze();
    Utils.toast(`Mantidas só as informações de "${src.fileName}".`, { type: 'ok' });
  },

  // ---------- Cartão de informações do item (novo, 27/08/2026) ----------

  /** HTML de UM item, dentro do seu "invólucro" (pedido do usuário,
   *  27/08/2026: "deve aparecer um outro invólucro em torno do card... e
   *  dentro desse invólucro deve conter o nome do arquivo ao qual as
   *  informações contidas naquele card vieram"). Reaproveitado tanto pra um
   *  item sozinho quanto lado a lado com seus duplicados (ver
   *  _showItemCard). */
  _itemDetailPanelHtml(it, { comBotaoManter = false } = {}) {
    const iconSvg = Avatar.itemIconSvg(it, this._iconState, { size: 84 });
    return `
      <div class="uf-card-envelope">
        <div class="uf-card-envelope-file" title="Arquivo de origem desta informação">📄 ${Utils.escapeHtml(it._fonteArquivo || '(arquivo desconhecido)')}</div>
        <div class="detail-avatar">${iconSvg}</div>
        <div style="text-align:center; font-family:monospace; color:var(--text-dim)">${Utils.escapeHtml(it.patrimonio || '—')}</div>
        <div style="text-align:center; font-weight:700; font-size:15px; margin:4px 0 8px">${Utils.escapeHtml(it.descricao || '(sem descrição)')}</div>
        <div class="detail-grid">
          <div class="k">Tipo</div><div class="v">${Utils.escapeHtml(it.tipo || '—')}</div>
          <div class="k">Setor</div><div class="v">${Utils.escapeHtml(it.setor || '—')}</div>
          <div class="k">Modificado em</div><div class="v">${Utils.formatDateTime(it.modificadoEm)}</div>
        </div>
        ${it._problemas && it._problemas.length ? `<div class="badge" style="display:block; margin-top:8px; background:rgba(232,179,57,.15); border-color:var(--warn); color:var(--warn)">${this._rowIconFor(it)} ${Utils.escapeHtml(it._problemas.join(' · '))}</div>` : ''}
        ${comBotaoManter ? `<button type="button" class="btn secondary sm uf-keep-only" data-id="${it.id}" style="width:100%; margin-top:10px" title="Descarta os outros itens com este mesmo número de patrimônio, mantendo só este">✅ Permanecer com este unicamente</button>` : ''}
      </div>`;
  },

  /** Cartão de informações do item clicado — pedido do usuário (27/08/2026):
   *  "poder clicar e o card de informações aparecer". Se o mesmo número de
   *  patrimônio aparecer em mais de um item carregado, mostra todos lado a
   *  lado (cada um no seu invólucro, com o nome do arquivo de origem) e um
   *  botão "permanecer com este unicamente" em cada um — ver
   *  _keepOnlyThisDuplicate. */
  _showItemCard(it) {
    const key = (it.patrimonio || '').trim().toUpperCase();
    const duplicatas = key ? this._merged.filter((x) => (x.patrimonio || '').trim().toUpperCase() === key) : [it];
    const temDuplicata = duplicatas.length > 1;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    const painelHtml = duplicatas.map((dup) => this._itemDetailPanelHtml(dup, { comBotaoManter: temDuplicata })).join('');
    modal.innerHTML = `
      <div class="modal-sheet" style="${temDuplicata ? 'max-width:min(96vw, 920px)' : 'max-width:420px'}">
        <div class="handle"></div>
        ${temDuplicata ? `<div class="badge" style="display:block; text-align:center; background:rgba(199,125,255,.15); border-color:#c77dff; color:#e6c8ff; margin-bottom:8px">⚠️ Este patrimônio aparece em ${duplicatas.length} itens carregados — compare abaixo</div>` : ''}
        <div class="uf-card-panels" style="${temDuplicata ? 'display:flex; gap:12px; overflow-x:auto; padding-bottom:4px;' : ''}">${painelHtml}</div>
        <button class="btn block" id="uf-card-close" style="margin-top:12px" title="Fechar">Fechar</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#uf-card-close').onclick = () => modal.remove();
    modal.querySelectorAll('.uf-keep-only').forEach((btn) => {
      btn.onclick = () => { this._keepOnlyThisDuplicate(btn.dataset.id); modal.remove(); };
    });
  },

  /** Pedido do usuário (27/08/2026): "um botão 'permanecer com este
   *  unicamente'. Quando este botão é clicado, o(s) outro(s) patrimônio(s)
   *  da lista é/são excluído(s)" — remove os OUTROS itens com o mesmo
   *  número de patrimônio direto dos arquivos-fonte (`this._sources`) e
   *  reanalisa, pra a exclusão realmente "pegar" (não sobreviver a um
   *  _analyze() futuro). */
  _keepOnlyThisDuplicate(id) {
    const kept = this._merged.find((x) => x.id === id);
    if (!kept) return;
    const key = (kept.patrimonio || '').trim().toUpperCase();
    if (!key) return;
    const idsRemover = this._merged.filter((x) => (x.patrimonio || '').trim().toUpperCase() === key && x.id !== id).map((x) => x.id);
    if (!idsRemover.length) return;
    this._sources.forEach((src) => { src.itens = src.itens.filter((x) => !idsRemover.includes(x.id)); });
    this._analyze();
    Utils.toast(`Mantido só o item de "${kept._fonteArquivo || 'um arquivo'}" — ${idsRemover.length} outro(s) descartado(s).`, { type: 'ok' });
  },

  // ---------- Ações ----------
  /** Remove os campos transitórios (`_fonteConferenciaId`/`_problemas`/etc.,
   *  usados só durante a revisão nesta tela) antes de gravar de verdade —
   *  MAS `_fonteArquivo` sobrevive como `origemArquivo` (persistido, ver
   *  db.js DB.addItem): é o que a tela "Organizar" (mapview.js) usa como
   *  "coluna arquivo". Antes desta mudança, essa informação era descartada
   *  aqui mesmo — depois de aplicada a unificação, não dava mais pra saber
   *  de qual .json cada item tinha vindo. */
  _cleanItem(it) {
    const clean = {};
    Object.keys(it).forEach((k) => { if (!k.startsWith('_')) clean[k] = it[k]; });
    if (it._fonteArquivo) clean.origemArquivo = it._fonteArquivo;
    return clean;
  },

  _downloadUnified() {
    if (!this._merged.length && !this._mapasMerged.length) return;
    // Pedido do usuário (28/08/2026, rodada 19): o backup unificado agora
    // também carrega os mapas (já com a versão escolhida em cada grupo, ver
    // _buildFinalMapasEFotos) e as fotos de ambiente ligadas a eles.
    const { maps, mapPhotos, idRemapManual } = this._buildFinalMapasEFotos();
    // Itens que apontavam pra um mapa mesclado manualmente noutro (ver
    // _mergeMapManually) precisam ser reencaixados aqui também, senão
    // ficariam com um `ambienteId` que nem existe mais no `maps` exportado.
    const itens = this._merged.map((it) => {
      const clean = this._cleanItem(it);
      if (clean.ambienteId) clean.ambienteId = idRemapManual.get(clean.ambienteId) || clean.ambienteId;
      return clean;
    });
    const dump = {
      geradoEm: new Date().toISOString(),
      fontes: this._sources.map((s) => ({ fileName: s.fileName, conferenciaId: s.conferenciaId, conferenciaNome: s.conferenciaNome, totalItens: s.itens.length })),
      itens,
      maps,
      mapPhotos,
    };
    Utils.downloadJSON(dump, `catalogo-unificado-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  },

  async _applyToDevice() {
    if (!this._merged.length && !this._mapasMerged.length) return;
    const comProblema = this._merged.filter((it) => it._problemas.length > 0).length;
    const { maps, mapPhotos, idRemapManual } = this._buildFinalMapasEFotos();
    const pendentes = this._mapaGruposPendentes();
    if (pendentes) {
      const ok = confirm(`${pendentes} mapa(s) ainda têm mais de uma versão sem escolha manual — a versão com mais itens/fotos/objetos será usada automaticamente. Continuar mesmo assim?`);
      if (!ok) return;
    }
    const msg = comProblema
      ? `Importar ${this._merged.length} item(ns) para este aparelho? ${comProblema} têm inconsistências sinalizadas — eles entram do mesmo jeito (nada é descartado), revise depois na Tabela.`
      : `Importar ${this._merged.length} item(ns) para este aparelho?`;
    if (!confirm(msg)) return;

    // Pedido do usuário (28/08/2026, rodada 19): "Deve haver a possibilidade
    // de mesclar mapas e fotos... também no 'unificar fontes diferentes'" —
    // mapas primeiro (reusa o mesmo helper compartilhado da importação de
    // backup, ver utils.js), depois fotos/itens reencaixados via o
    // `idRemap` resultante (na prática quase sempre idêntico ao id
    // original, já que o critério de agrupamento É o mesmo id — só muda
    // quando o usuário escolhe "➕ Manter os dois" pra um mapa que colide
    // com um já salvo neste aparelho).
    let rMaps = { idRemap: new Map(), criados: 0, atualizados: 0, mantidos: 0 };
    if (maps.length) {
      const resultado = await Utils.importMapsWithConflictUI(maps, {
        title: 'Mapas já existentes neste aparelho',
        countNewSide: (m) => {
          const grupo = this._mapasMerged.find((g) => g.id === m.id);
          return grupo?.candidatos[grupo.escolhaIdx]?.counts || { itens: 0, fotos: 0 };
        },
      });
      if (!resultado) { Utils.toast('Aplicação cancelada — nada foi alterado.', { type: 'warn' }); return; }
      rMaps = resultado;
    }
    const mapIdRemap = rMaps.idRemap;

    // `saveAmbientePhoto` é put (cria ou atualiza) — não dá pra distinguir
    // os dois casos aqui sem uma leitura extra por foto, então o resumo só
    // informa o total de fotos processadas (ver `partes` mais abaixo).
    for (const foto of mapPhotos) {
      const ambienteId = mapIdRemap.get(foto.ambienteId) || foto.ambienteId;
      await DB.saveAmbientePhoto({ ...foto, ambienteId });
    }

    let novos = 0, atualizados = 0;
    for (const it of this._merged) {
      const clean = this._cleanItem(it);
      if (clean.ambienteId) {
        // Duas camadas de reencaixe, nesta ordem: (1) mesclagem MANUAL entre
        // mapas de ids diferentes (_mergeMapManually, "mesmo lugar, id
        // diferente") — o mapa original nem entra em `maps` acima, então
        // sem isso o item ficaria com um ambienteId órfão; (2) o remap do
        // PRÓPRIO DISPOSITIVO (mapIdRemap, ex.: usuário escolheu "manter os
        // dois" pra um mapa que colidia com um já salvo aqui).
        const idPosMesclagem = idRemapManual.get(clean.ambienteId) || clean.ambienteId;
        clean.ambienteId = mapIdRemap.get(idPosMesclagem) || idPosMesclagem;
      }
      const r = await DB.mergeFromRemote(clean);
      if (r.changed) { if (r.isNew) novos++; else atualizados++; }
    }

    const partes = [`${novos} item(ns) novo(s)`, `${atualizados} item(ns) atualizado(s)`];
    if (rMaps.criados) partes.push(`${rMaps.criados} mapa(s) novo(s)`);
    if (rMaps.atualizados) partes.push(`${rMaps.atualizados} mapa(s) atualizado(s)`);
    if (mapPhotos.length) partes.push(`${mapPhotos.length} foto(s) de ambiente`);
    Utils.toast(`Unificação aplicada ✓ — ${partes.join(', ')}.`, { type: 'ok', duration: 6000 });
    await App._refreshCurrentView?.();
  },
};

window.UnifyView = UnifyView;
