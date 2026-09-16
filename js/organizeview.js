/**
 * organizeview.js — "Organizar": tela cheia aberta pelo botão "🗂️ Organizar"
 * (tela "Mapa", ao lado do seletor de mapa — ver mapview.js
 * `_mountEntryScreen`/`_openOrganizeView`).
 *
 * REESCRITA COMPLETA (rodada 52, item 9). Ver changelog do projeto pra o
 * pedido original completo (mapa-cêntrico: 1 retângulo por mapa com 3
 * colunas — patrimônios/miniatura da planta baixa/fotos — miniatura
 * renderizada em fila com barra de progresso, seleção com as ferramentas do
 * 2D e mesclagem de mapas).
 *
 * AJUSTES (mesma rodada, 2ª leva — feedback do usuário depois de ver a 1ª
 * versão, verbatim, cada um endereçado onde o comentário local explica):
 * "Como assim, mapas de escalas diferentes? 1 em um mapa deve valer 1 no
 * outro." "No cabeçalho deve informar quantos mapas foram listados."
 * "Percebi que você está classificando um mapa como 'não vazio' só porque
 * tem ao menos um patrimônio cadastrado. A definição do mapa estar vazio é
 * se no próprio mapa não foram colocados objetos e vinculações. Vou chamar
 * de 'planta baixa' para não confundir com o nome do invólucro mapa."
 * "Quando a janela já foi montada deve ser preservada até a página ser
 * recarregada. Só deve atualizar se um mapa novo for criado ou uma nova
 * importação ocorrer, além das mesclagens, modificações e exclusões." "Não
 * está sendo possível selecionar o mapa pelo checkbox. E, quando consegue
 * marcar, não desmarca mais, por algum motivo." "As fotos devem poder ser
 * selecionadas também." "Deve ser possível clicar, arrastar e soltar um
 * patrimônio, de um mapa para o outro. Para as fotos também." "Quanto as
 * fotos se elas forem arrastadas e soltadas em outro mapa os patrimônios e
 * vinculações devem ir junto." "As vinculações do mapa devem aparecer
 * listadas." "Apenas com a ferramenta 'Mão' é possível clicar e arrastar e
 * nenhuma interação acontece." "Na lista de patrimônios [...] deve ser
 * possível clicar em cima de um patrimônio e editá-lo." "ao clicar em cima
 * da miniatura da planta baixa deve ir para ela com um botão de voltar
 * ativo [...] Um botão deve ficar no cabeçalho que servirá de toggle para
 * definir se [...] vai para o 2D ou para o 3D." "Clicando no nome do mapa
 * deve ser possível editar com um input [...] ali mesmo (não com alert())."
 * "Ao clicar em cima dos patrimônios que ficam em baixo das fotos, a
 * posição relativa deles na foto deve ser destacada." "Deve haver um toggle
 * [...] para as bolinhas dos patrimônios aparecerem nas fotos [...] com uma
 * movimentação em animação." "Deve ser possível renomear as fotos." "Deve
 * ser possível alterar o zoom em tudo."
 *
 * BUGS REAIS corrigidos nesta leva (pegos relendo o código, sem navegador —
 * ver comentários nos pontos exatos abaixo):
 *  1) `_isMapEmpty` contava QUALQUER item com `ambienteId` apontando pro
 *     mapa como "não vazio", mesmo sem nenhum pin de verdade na planta
 *     (`mapaX` numérico) — corrigido pra só contar vinculações DE VERDADE.
 *  2) Seleção pelo checkbox/clique não funcionava, e uma vez marcado nunca
 *     desmarcava: `wrap.setPointerCapture(e.pointerId)` (chamado no
 *     pointerdown, pra 'select'/'lasso'/'ellipse'/etc.) RETARGETA os
 *     eventos seguintes — pela spec de Pointer Events, `e.target` de um
 *     evento capturado passa a ser o elemento QUE CAPTUROU (`wrap`), não
 *     mais o elemento de verdade sob o cursor. O código do clique simples
 *     ("semArraste") fazia `e.target.closest('.organize-map-card')` no
 *     `pointerup` — como `e.target` ali já era sempre `wrap` (nunca dentro
 *     de um cartão), a busca falhava sempre, e a única forma de "marcar"
 *     algo era um arrasto de verdade formando uma região que por acaso
 *     cobrisse o cartão (caminho DIFERENTE, que usa os CENTROS dos cartões,
 *     não `e.target` — daí "às vezes marca"); tentar desmarcar com outro
 *     clique simples caía no mesmo `e.target` quebrado e nunca chegava a
 *     rodar. Corrigido usando `document.elementFromPoint(e.clientX,
 *     e.clientY)` (que devolve o elemento de verdade sob o cursor,
 *     independente de captura) em vez de `e.target`.
 *  3) "Só a ferramenta Mão conseguia clicar e arrastar" — o cartão inteiro
 *     tinha `draggable="true"` (pro arrastar-e-soltar de mesclagem) — um
 *     elemento `draggable` SEQUESTRA o gesto de arrastar pro D&D nativo do
 *     navegador assim que o ponteiro se move, cancelando (`pointercancel`)
 *     a sequência de Pointer Events que as outras 5 ferramentas dependiam
 *     (Selecionar/Laço/Elipse/Mover seleção/Mover selecionados). Corrigido
 *     tirando `draggable` do cartão inteiro e pondo só num "alça" pequena
 *     (`.organize-map-drag-handle`, ✥) dedicada a esse arrasto — o resto do
 *     cartão fica livre pras ferramentas de seleção.
 *
 * ARQUITETURA (resumo, ver métodos individuais pros detalhes):
 *  - `_maps`: cache em memória — 1 entrada por mapa (`{map, itens, fotos,
 *    isEmpty}`) — SÓ recarregada do banco quando `this._dirty` (setado por
 *    `invalidate()`, chamado de fora — ver mapview.js/utils.js — em criar/
 *    importar mapa, e internamente após mesclar/mover/editar) ou na
 *    primeira vez. Reabrir a tela sem nada ter mudado reaproveita o cache
 *    (só reconstrói o DOM/miniaturas, sem tocar no banco) — pedido do
 *    usuário: "deve ser preservada até a página ser recarregada".
 *  - Miniatura da planta baixa: `Map2DRenderer`, enfileirada 1 por quadro
 *    com limite de tempo total e barra de progresso (ver `_startThumbnailQueue`).
 *  - Seleção de MAPAS: `MapSelection` (mapselection.js, puro) tratando cada
 *    cartão como candidato (`_wireSelectionTools`). Seleção de FOTOS é
 *    independente e mais simples (clique direto, `_toggleFotoSelected`).
 *  - Mesclagem: botão ou arrastar pela alça (`_mergeMaps`) — regras
 *    inalteradas desta rodada (mapa vazio = zero desenho E zero vinculação
 *    de verdade; 2+ mapas não-vazios diferentes abrem uma janela de
 *    decisão). Coordenadas de patrimônio (`mapaX`/`mapaY`) são mantidas tal
 *    e qual ao mesclar/mover — confirmado pelo usuário que TODOS os mapas
 *    do app compartilham a mesma escala/origem de propósito ("1 em um mapa
 *    deve valer 1 no outro"), então isso é o comportamento CORRETO, não uma
 *    simplificação.
 *  - Mover patrimônio/foto pra OUTRO mapa (arrastar e soltar, fora do
 *    contexto de mesclagem): `_moveItemToMap`/`_movePhotoToMap` — mover uma
 *    foto leva junto todo patrimônio vinculado a ela (via `orbs[].itemId`),
 *    como pedido.
 *  - Abrir a planta baixa de um mapa a partir daqui (miniatura ou uma
 *    vinculação do mapa): `_openMapExternally` — esconde esta tela (não
 *    fecha) e vai pro 2D (direto pra Planta baixa, replicando o caminho de
 *    `App.closeView3D()` — corrigido na rodada 53, item 1) ou 3D
 *    (`App.openView3D`), conforme o toggle do cabeçalho
 *    (`this._openLinkMode`), deixando um botão flutuante "🗂️ Voltar ao
 *    Organizar" que só reexibe a tela escondida — sem precisar ensinar
 *    mapview.js/view3d.js a "voltar pro Organizar" de verdade (que exigiria
 *    mexer na pilha de navegação do app inteiro, `App._navStack` — fora do
 *    escopo/risco aceitável desta rodada sem navegador de verdade pra
 *    testar). Simplificação assumida e documentada: abre a planta baixa
 *    inteira, não pula direto pro ponto exato do pin clicado.
 *
 * RODADA 53 (13 itens de feedback do usuário sobre esta tela, depois de ver
 * a versão acima em uso — cada um endereçado no comentário local do trecho
 * que ele mudou):
 *  1) "Clicar em cima da planta baixa [...] deve levar direto pra ela [...]
 *     Atualmente, ao clicar só vai para a tela do 'Mapa'." — BUG real:
 *     `_openMapExternally` usava `App.navigate('mapa')`, que sempre monta a
 *     tela de ENTRADA do Mapa. Corrigido replicando à mão o caminho de
 *     `App.closeView3D()` (unmount da view atual + `MapView.mountAfterView3D`,
 *     que pula reto pra Planta baixa).
 *  2) "As bolinhas devem ser amarelas com contorno preto como em 'Mapa'->
 *     'Foto'." — cor do `.organize-foto-orbdot` trocada pra igualar
 *     `ambientephotos.js` (`#ffd166` com borda `#0a0d11`).
 *  3) Zoom: agora só as miniaturas/esqueletos das plantas mudam de tamanho
 *     visualmente esperado — números de patrimônio e títulos resumidos
 *     ficam com `zoom: calc(1 / var(--organize-zoom))`, cancelando o zoom
 *     do ancestral (ver `applyZoom` em `_buildOverlay` e seletores em
 *     style.css).
 *  4) Mesclagem: update otimista em memória (`this._maps`) + persistência
 *     no IndexedDB em segundo plano (sem `await` bloqueando, sem
 *     `reload()`), e animação de encolher/desaparecer nos cartões que
 *     somem (`_animateMergeCollapse`).
 *  5) Espaçamento entre foto/nome/vinculações na coluna de fotos aumentado
 *     (ver `.organize-foto-list`/`.organize-foto-item` em style.css) — pra
 *     ficar claro que o nome pertence à foto ABAIXO dele, não à de cima.
 *  6) BUG REAL corrigido: mover um patrimônio pra outro mapa deixava orbs
 *     órfãos nas fotos do mapa de ORIGEM (`foto.orbs[].itemId` continuando
 *     a apontar pra um item que já não pertence mais àquele ambiente) — ver
 *     `_moveItemToMap`.
 *  7) Toggle "bolinhas nas fotos" não recarrega mais a lista inteira — os
 *     pontinhos sempre vão pro DOM, visibilidade controlada só por CSS
 *     (classe `organize-orbs-visible`), preservando rolagens.
 *  8) Cores de badges/chips/pins mais vivas por padrão; o esmaecimento
 *     (`opacity` reduzida) continua reservado só pra quando a contagem for
 *     zero (contadores zerados — `organize-counts-zero`). ATUALIZAÇÃO
 *     (rodada 54, item 6 do feedback, verbatim: "Verifique o porquê de
 *     tudo parecer estar escurecido [...] é a classe 'organize-map-empty',
 *     remova-a de tudo, mesmo os mapas estando vazios") — a classe
 *     `organize-map-empty` (opacity: .55 no CARTÃO INTEIRO de um mapa
 *     vazio) foi REMOVIDA por completo (JS e CSS): com cartões cheios e
 *     vazios lado a lado na mesma lista, os vazios ficando 45% mais
 *     escuros que o resto (e os ícones coloridos do cabeçalho ao lado,
 *     nunca esmaecidos) dava a impressão de que a tela INTEIRA estava
 *     escurecida. A informação "mapa vazio" continua visível só por texto/
 *     tag (`organize-map-card-emptytag` "planta vazia" + `organize-counts-
 *     zero`), sem alterar a aparência do cartão.
 *  9) Clicar num patrimônio da lista com vinculação de foto: decisão de
 *     interação tomada (não especificada pelo usuário) — a linha continua
 *     abrindo o editor; um ícone extra "📷📍" aparece quando há orb, e SÓ
 *     ele (clique separado) destaca a posição na foto. Ver comentário
 *     grande em `_renderPatrimonioColumn`.
 * 10) Animações gerais adicionadas (fade-in de cartões/modais/botão
 *     flutuante, `scroll-behavior: smooth`) — ver style.css.
 * 11) Inputs de edição embutida (nome do mapa/foto) agora copiam
 *     `font`/`letter-spacing` computados do elemento original, além do
 *     `font: inherit` do CSS, e o CSS do `.organize-inline-input` não soma
 *     mais padding/borda grossos que deslocavam o layout do cartão.
 * 12) Botão "⬇️🗺️ Exportar apenas este mapa" em cada cartão — reaproveita a
 *     janela "⬇️ Exportar backup" já existente (`SettingsView.
 *     _openExportModal`, js/settings.js), agora aceitando `opts.onlyMapId`
 *     pra pré-selecionar só este mapa e os patrimônios/fotos dele (a
 *     pessoa ainda pode ajustar antes de baixar).
 * 13) Badge "📏N" (medidas) adicionado nas fotos, logo ACIMA do badge "📍N"
 *     (vinculações) já existente — `photo.medidas`, populado por
 *     `AmbientePhotos._confirmMedidaDraft` (ambientephotos.js), já é
 *     persistido junto com o resto da foto.
 *
 * RODADA 55 (v309) — 6 pedidos do usuário depois de testar a v308, cada um
 * endereçado no comentário local do trecho que ele mudou:
 *  1) "Para o nome do mapa e nome da foto, coloque em uma div e box-sizing:
 *     border-box [...] para evitar espandir a área do elemento." Ver
 *     `_makeInlineInput` — agora trava a ÁREA do próprio elemento de texto
 *     (`hostEl`), não só o `<input>` de dentro.
 *  2) "O retângulo de seleção das fotos fica cortado — a foto fica em cima
 *     da borda." Ver `.organize-foto-thumb-wrap::after` em style.css — o
 *     contorno de seleção virou um pseudo-elemento POR CIMA da `<img>`.
 *  3) "Se o patrimônio estiver vinculado a uma foto [...] deve aparecer a
 *     mensagem [...] com a opção de mover a foto também." Ver
 *     `_confirmMoveLinkedItem`, chamado de dentro de `_moveItemToMap`.
 *  4) "Não recarregar tudo ao mudar uma foto de mapa." Ver `_refreshCardBody`
 *     (generalização de `_refreshMergedCardAfterMerge` da rodada 53) — agora
 *     usada também por `_moveItemToMap`/`_movePhotoToMap`, atualizando só os
 *     2 cartões (origem/destino) envolvidos, sem tocar no resto da lista.
 *  5) MUDANÇA ARQUITETURAL — sistema de "alterações pendentes". Ver o bloco
 *     grande de comentário logo acima de `_pendingActions` abaixo pro
 *     desenho completo (o que fica só em memória, o que é uma ação
 *     pendente, como "Aplicar"/"Reverter" funcionam).
 *  6) "Clicar em cima de uma bolinha na foto deve abrir a foto naquela
 *     região [...] botão de retorno deve ficar ativado." Ver
 *     `_openFotoAtOrb` — reaproveita `AmbientePhotos.open(map, {
 *     startPhotoId, fromOrganizar: true, focusNorm })`, um fluxo de retorno
 *     que JÁ EXISTIA em ambientephotos.js (botão "↩️ Organizar", ver
 *     `_voltarParaOrganizar`) mas que nada em organizeview.js ainda
 *     disparava — `focusNorm` é um parâmetro NOVO (ver ambientephotos.js
 *     `open`/`_selectPhoto`) que centraliza a vista na posição normalizada
 *     do orb clicado, com um zoom de aproximação (heurístico — sem
 *     navegador pra calibrar visualmente, ver comentário local).
 */
const OrganizeView = {
  _overlayEl: null,
  _listEl: null,
  _onCloseCb: null,
  /** [{ map, itens, fotos, isEmpty }] — 1 por mapa, na ORDEM de exibição atual. Preservado entre aberturas (ver `open`/`_dirty`). */
  _maps: [],
  /** Só recarrega do banco quando true (ver `invalidate()`/cabeçalho do arquivo). Começa true pra forçar a 1ª carga. */
  _dirty: true,
  _selectedMapIds: null,
  _selectedFotoIds: null,
  /** 'select' | 'lasso' | 'ellipse' | 'move-selection' | 'move-selected' | 'hand' */
  _tool: 'select',
  _lastRegionScreen: null,
  _drag: null,
  _zoom: 1,
  _showOrbsOnPhotos: false,
  /** '2d' | '3d' — pra onde clicar numa miniatura/vinculação de mapa leva. */
  _openLinkMode: '2d',
  _thumbQueue: [],
  _thumbTotal: 0,
  _thumbDone: 0,
  _thumbDeadline: 0,
  _THUMB_TIME_BUDGET_MS: 6000,
  /** RODADA 56 (v310) — MODO 'grade', 2º modo de visualização desta tela,
   *  pedido do usuário verbatim: "Deve haver dois modos de visualização da
   *  informação toda. Trocável pelo cabeçalho. Um deles é o atual, por
   *  cartões [...] O outro modo de visualização, será como as coisas são
   *  exibidas na grade do mapa 2D [...] Os cartões são como objetos
   *  posicionáveis nessa grade [...] as alterações só se perdem clicando no
   *  botão 'reverter' ou ao recarregar a página."
   *
   *  ARQUITETURA: `_viewMode` ('cards' | 'grid') escolhe qual dos dois
   *  contêineres (`#organize-list-wrap`, já existente, ou `#organize-grid-
   *  wrap`, novo) fica visível — ver `_setViewMode`. O cache de dados
   *  (`this._maps`) é o MESMO para os dois modos (nenhuma duplicação de
   *  dado, só de RENDERIZAÇÃO): `_renderList()` (cartões) e `_renderGrid()`
   *  (grade) são desenhados a partir da mesma fonte, e ambos são chamados
   *  juntos sempre que `this._maps` muda (reload/reverter/mesclar/mover),
   *  independente de qual modo está visível no momento — custo aceitável
   *  (poucas dezenas de mapas esperadas) que evita mostrar dado velho ao
   *  trocar de aba depois de uma mudança feita no outro modo.
   *
   *  `_gridPositions` ({mapId: {x,y}}, em PIXELS DE CONTEÚDO — antes do
   *  zoom/pan da grade, não pixels de tela) é a posição de cada cartão-mapa
   *  na grade — DECISÃO DE DESIGN (não especificada em detalhe pelo
   *  usuário): fica em memória, à parte de `_pendingActions`/IndexedDB por
   *  completo — reposicionar um cartão na grade é puramente um ajuste de
   *  LAYOUT/visualização, nunca um dado que precise ser "aplicado" no
   *  banco. Isso já bate com a frase do próprio usuário ("as alterações só
   *  se perdem clicando em 'reverter' ou ao recarregar a página") — nem
   *  cita "Aplicar alterações" como jeito de persistir a posição, então
   *  tratamos como estado de sessão mesmo, do mesmo jeito que `_zoom`
   *  (modo cartões) ou `_showOrbsOnPhotos` já são. Mapas SEM posição salva
   *  ainda (recém-criados, ou a 1ª vez que a grade é aberta nesta sessão)
   *  recebem uma posição inicial empilhada verticalmente (ver
   *  `_ensureGridDefaultPositions`) — mapas JÁ reposicionados pelo usuário
   *  nunca voltam pra pilha sozinhos. "Reverter" (`_revertPendingActions`)
   *  ZERA `_gridPositions` de propósito, junto com o resto — o usuário
   *  listou os 2 únicos jeitos de perder o reposicionamento, e "reverter"
   *  é um deles.
   *
   *  ZOOM/PAN da grade (`_gridZoom`/`_gridPan`) é INDEPENDENTE do zoom do
   *  modo cartões (`_zoom`, já existente) — os 2 nunca precisam ter o mesmo
   *  valor ao mesmo tempo. Reaproveita os MESMOS botões de zoom do
   *  cabeçalho (`#organize-zoom-in`/`#organize-zoom-out`/`#organize-zoom-
   *  label`), só que agora eles despacham pro estado certo conforme
   *  `_viewMode` (ver `_buildOverlay`) — em vez de duplicar um 2º par de
   *  botões só pra grade. Implementação: um único `<div>` transformável
   *  (`#organize-grid-canvas`, dentro de `#organize-grid-viewport` com
   *  `overflow:hidden`) recebe `transform: translate(pan) scale(zoom)` —
   *  MESMA técnica (CSS transform sobre um container, sem recalcular
   *  layout em JS a cada frame) usada pela grade do Mapa 2D pra pan/zoom
   *  suave (ver mapview.js `view.zoom`/canvas), adaptada aqui pra DOM (a
   *  grade do Organizar é feita de `<div>`s/cartões reais, não um único
   *  `<canvas>`, então CSS transform no container é o equivalente correto
   *  — cada cartão filho é só `position:absolute; left/top` em pixels de
   *  CONTEÚDO, escalados juntos pelo `scale()` do pai). Arrastar o FUNDO da
   *  grade move `_gridPan` (pan); arrastar a alcinha "✥" de um cartão move
   *  só a posição DAQUELE cartão em `_gridPositions` (dividindo o delta de
   *  tela pelo zoom atual, pra mover na mesma velocidade do cursor não
   *  importa o zoom).
   *
   *  PATRIMÔNIOS na grade (pedido: "plaquinhas metálicas [...] o recurso de
   *  clicar em cima do ícone da foto [...] destaca a posição dele na foto
   *  vinculada. Um retângulo maior [...] para que todos os patrimônios
   *  fiquem visíveis"): `.organize-grid-patrimonios` é um `flex-wrap` SEM
   *  `max-height`/scroll (diferente da lista vertical do modo cartões,
   *  `.organize-item-list`, que tem scroll interno) — de propósito, pra
   *  TODOS ficarem visíveis de uma vez, mesmo que o cartão cresça bastante.
   *  Cada patrimônio vira uma "plaquinha" (`.organize-plaquinha`, visual
   *  metálico via gradiente CSS) com só o número + o ícone de foto (📷)
   *  quando há orb vinculado — clique no ícone reaproveita
   *  `_highlightOrbOnPhoto` (mesma função do modo cartões, achando a foto
   *  DENTRO do mesmo cartão da grade); clique na plaquinha (fora do ícone)
   *  abre o editor do patrimônio, mesmo padrão do modo cartões.
   *
   *  ZOOM → BOLINHA vs PLAQUINHA COM NÚMERO (pedido: "é possível dar zoom
   *  bem distante e bem de perto [...] as bolinhas [...] se ampliar mais um
   *  pouco, começam a aparecer os números, do mesmo jeito que as fotos são
   *  exibidas com as bolinhas ligando aos números de patrimônios em 'Mapa'->
   *  'Foto'"). DECISÃO DE DESIGN documentada (o comportamento exato de
   *  ambientephotos.js é sobre ORBS EM CIMA DE UMA FOTO — sempre com
   *  rótulo+linha guia, não gated por zoom — não existe hoje, em nenhum
   *  lugar do app, um "zoom liga/desliga número" pronto pra copiar ao pé da
   *  letra): abaixo de `_GRID_ZOOM_PLAQUINHA_THRESHOLD` (limiar escolhido
   *  por bom senso, 70% do "zoom 100%" de referência), a classe
   *  `organize-grid-zoomed-out` no canvas encolhe cada `.organize-plaquinha`
   *  pra uma bolinha simples (mesma cor/borda do padrão de orb já usado no
   *  app inteiro, `#ffd166`/`#0a0d11` — ver ambientephotos.js `_drawOrb` e
   *  `.organize-foto-orbdot` em style.css), escondendo o número e o ícone
   *  de foto; a partir do limiar pra cima, a plaquinha completa (número +
   *  ícone) aparece — só CSS (`display`/tamanho condicionados pela classe),
   *  nenhuma re-renderização em JS a cada passo de zoom.
   *
   *  FOTOS na grade (pedido: "dispostas em várias linhas [...] todas ficam
   *  visíveis [...] desenhadas com metade do tamanho, resolução ainda
   *  baixa, INDEPENDENTE do zoom [...] pra não sobrecarregar e travar o
   *  navegador em caso de centenas de fotos"): `.organize-grid-fotos`
   *  também é `flex-wrap` sem scroll (mesmo espírito da coluna de
   *  patrimônios acima). Cada foto usa a MESMA miniatura já gerada pro modo
   *  cartões (`f.thumbDataUrl || f.dataUrl` — já baixa resolução, nenhuma
   *  miniatura nova é gerada aqui) numa `<img>` com `width`/`height`
   *  FIXOS em px (96×72, "metade" do tamanho de referência do modo cartões,
   *  que usa a largura cheia da coluna) — como o zoom da grade é só um
   *  `transform: scale()` no container PAI (ver acima), a imagem em si
   *  nunca é redesenhada/pedida numa resolução maior ao ampliar (o
   *  navegador só escala visualmente os mesmos pixels já carregados),
   *  exatamente o "independente do zoom" pedido — sem precisar de nenhuma
   *  lógica extra de "resolução adaptativa". */
  _viewMode: 'cards', // 'cards' | 'grid' — ver comentário grande acima
  _gridPositions: {}, // {mapId: {x, y}} em px de CONTEÚDO — ver comentário grande acima
  _gridZoom: 1,
  _gridPan: { x: 0, y: 0 },
  /** ITEM A16 (rodada 57/v311), verbatim: "o nível de zoom mais afastado
   *  deve ser duas vezes maior." — valor anterior (0.15) dividido por 2
   *  (permite afastar 2x mais do que antes). "Os limites do zoom devem ser
   *  modificáveis no cabeçalho" — NÃO implementado nesta rodada (ver
   *  changelog/resumo final): exigiria 2 novos campos numéricos no
   *  cabeçalho + validação (min < max, nunca deixar o zoom atual ficar fora
   *  do novo intervalo) — deixado como próxima rodada por tempo, mantendo
   *  os limites como constantes de código (mais seguro que um campo livre
   *  sem validação testada visualmente). */
  _GRID_ZOOM_MIN: 0.075,
  /** ITEM A7, verbatim: "deve ser possível ampliar tanto quanto em uma foto
   *  em 'Mapa'->'Foto'." `ambientephotos.js` usa `MAX_ZOOM: 100` — igualado
   *  aqui à risca (ver `AmbientePhotos.MAX_ZOOM`). */
  _GRID_ZOOM_MAX: 100,
  _GRID_ZOOM_PLAQUINHA_THRESHOLD: 0.7,
  _GRID_CARD_W: 700, // ATUALIZADO (31/08/2026) — deixou de ser a largura ENFORÇADA de todo cartão (agora CSS `width:max-content`, ver `.organize-grid-card`/`_gridCardHtml`); usado só como ESTIMATIVA de fallback em `_autoLayoutGrid`/`_gridFitToContent`, pro raro caso de medir um cartão que ainda não existe no DOM.
  /** ITEM C14 — ver `_applyGridSnap` acima. Desligado por padrão (não
   *  especificado pelo usuário se deveria vir ligado; snap involuntário
   *  seria mais surpreendente que o oposto). */
  _gridSnapAtivo: false,
  _GRID_SNAP_SIZE: 40,
  _GRID_CARD_STACK_HEIGHT: 480, // altura aproximada usada só pro empilhamento INICIAL (ver `_ensureGridDefaultPositions`) — estimativa, não medida (simplificação documentada: cartões com muito conteúdo podem se sobrepor até o usuário arrastar pra separar)

  // ---------------------------------------------------------------------
  // ITEM "renderização 2D ao vivo da planta baixa embutida no cartão da
  // Grade" (31/08/2026, pedido "continue" 9ª vez) — o item marcado nos
  // comentários deste arquivo como "tecnicamente o mais arriscado do
  // pedido inteiro" (junto com a coreografia de arrastar-e-soltar, essa
  // ainda pendente). Até aqui, `.organize-map-thumb-canvas` (tanto na
  // Grade quanto no Cartões) era uma miniatura ESTÁTICA: um `Map2DRenderer`
  // descartável desenhava 1 quadro só (`_renderMapThumbnail`, enfileirado
  // por `_startThumbnailQueue`/`_processNextThumb`) e era jogado fora —
  // sem pan/zoom próprio, só uma "foto" da planta baixa enquadrada pra
  // caber inteira.
  //
  // DECISÃO DE ESCOPO (o que reduziu o risco a um nível testável sem
  // navegador): reusar o `Map2DRenderer` (js/mapview.js) — que já é
  // 100% self-contained por instância (todo estado — `view`/`mapData`/
  // seleção — vive em `this`, nada em módulo/`window`; a prova disso é
  // que a fila de miniaturas já cria 1 instância POR CANVAS sem conflito
  // nenhum) — só que agora mantendo a instância VIVA e com pan (arrastar)
  // + zoom (roda do mouse, com ancoragem no cursor) de verdade, em vez de
  // recriar/descartar a cada quadro. NÃO reaproveita `MapView` (o objeto
  // singleton da tela cheia Mapa→Planta baixa) — ele é 1 instância ÚNICA
  // pra tela inteira, entrelaçado com dezenas de ferramentas/edição/
  // seleção/undo que uma miniatura SÓ DE VISUALIZAÇÃO não precisa; usar
  // esse singleton por cartão exigiria um refactor grande e arriscado sem
  // navegador pra validar. Em vez disso, o pan/zoom foi reescrito do zero
  // aqui, ENXUTO (só a matemática de arrastar + zoom-no-cursor, sem
  // ferramentas/edição), inspirado em `MapView._attachPanZoom`
  // (mapview.js) mas sem nenhuma das dependências de estado global dele.
  // Redesenho é SOB DEMANDA (só a cada `pointermove`/`wheel` de verdade),
  // nunca um loop contínuo de `requestAnimationFrame` — o próprio
  // `mapview.js` já documenta em comentário que redesenhar tudo a 60fps
  // sem necessidade é desperdício; aqui, com potencialmente DEZENAS de
  // cartões-mapa na tela ao mesmo tempo, um loop contínuo por cartão
  // seria ainda pior (múltiplos loops de RAF rodando em paralelo à toa).
  //
  // `_gridLiveView` ({mapId: {cx, cy, zoom, baseZoom}}) guarda o pan/zoom
  // ATUAL de cada planta-baixa-ao-vivo — estado em memória por SESSÃO,
  // mesmo espírito de `_gridPositions`/`_gridZoom` (nunca gravado no
  // banco, sobrevive a trocar de modo Cartões↔Grade e a reconstruções
  // parciais do cartão, só reseta num F5 de verdade ou no botão "🎯
  // Reenquadrar" de cada cartão). `baseZoom` é o zoom do ENQUADRAMENTO
  // INICIAL calculado (mesma conta de `_renderMapThumbnail`/
  // `_tightBounds`) — usado só pra CLAMPAR o zoom relativo a ele (entre
  // 15% e 3000% do enquadramento original), já que plantas baixas de
  // tamanhos MUITO diferentes têm escalas de `view.zoom` (px por metro)
  // muito diferentes entre si — um limite absoluto fixo faria sentido pra
  // uma planta e nenhum sentido pra outra 50x maior/menor.
  //
  // `_gridLiveRenderers` ({mapId: Map2DRenderer}) guarda a instância viva
  // de cada cartão — recriada a cada vez que o CARTÃO é reconstruído
  // (`_refreshGridCardBody`/`_renderGrid` trocam o `outerHTML`, então o
  // elemento `<canvas>` em si morre e nasce de novo — um `Map2DRenderer`
  // é indissociável do elemento canvas que recebeu no construtor); o pan/
  // zoom em si NÃO se perde nessas reconstruções porque mora à parte, em
  // `_gridLiveView` (só o `mapData`/instância é recriado, `view` é
  // reatribuído a partir do estado salvo).
  //
  // ESCOPO: só o modo GRADE, de propósito (pedido do usuário: "no cartão
  // da Grade") — o Cartões continua com a miniatura estática de sempre
  // (`_renderMapThumbnail`), sem pan/zoom. SÓ VISUALIZAÇÃO — nenhuma
  // ferramenta de edição (parede/objeto/câmera/etc.) foi portada; clicar
  // duas vezes continua abrindo a planta baixa completa (2D/3D, conforme o
  // toggle do cabeçalho) pra qualquer edição de verdade, exatamente como
  // já funcionava antes desta rodada.
  _gridLiveView: {}, // {mapId: {cx, cy, zoom, baseZoom}}
  _gridLiveRenderers: {}, // {mapId: Map2DRenderer}
  _GRID_LIVE_ZOOM_MIN_MULT: 0.15,
  _GRID_LIVE_ZOOM_MAX_MULT: 30,

  // DECISÃO DE ARQUITETURA "Modo Navegação" (31/08/2026) — pedido do
  // usuário verbatim: "Quanto a aparecer a planta baixa dentro do
  // retângulo do mapa, é como ir pelo caminho 'Mapa'->'Planta baixa' com o
  // 'Modo Navegação ativado'. Só que com o 'Organizar' rodando 'por cima',
  // mas com um recorte na janela dele que faz com que se possa ver o que
  // está atrás (que é o mapa rodando no modo navegação)." Investigado em
  // mapview.js (`MapView._navMode`/`_toggleNavMode`): "Modo Navegação" lá é
  // um estado do MAPA (pan/zoom via arrastar/roda do mouse, SEM nenhuma
  // ferramenta de edição respondendo a toque — "🧭 Modo Navegação: só
  // mover/dar zoom, nada no mapa responde a toque"). Funcionalmente, é
  // EXATAMENTE o que `_gridLiveView`/`_gridLiveRenderers` já implementam
  // aqui: pan/zoom de verdade, zero ferramentas de edição portadas (ver
  // "ESCOPO" acima). A leitura LITERAL do pedido ("Organizar rodando por
  // cima do Mapa, com um recorte") descreveria uma arquitetura BEM
  // diferente — um ÚNICO `MapView` (o singleton de tela cheia) rodando por
  // baixo, com o Organizar desenhando só uma "janela" recortada por cima
  // dele — o que não se sustenta aqui: a Grade pode ter DEZENAS de cartões
  // de mapas DIFERENTES abertos ao mesmo tempo, cada um com seu próprio
  // pan/zoom independente, e `MapView` é 1 instância ÚNICA pra tela
  // inteira (não dá pra "recortar" N janelas de 1 mapa só quando cada
  // cartão precisa mostrar um mapa diferente). DECISÃO (autorizada
  // explicitamente pelo usuário a tomar a melhor decisão e prosseguir):
  // manter a arquitetura de 1 `Map2DRenderer` independente POR CARTÃO (já
  // testada, já em produção desde a rodada anterior) — ela entrega o
  // MESMO resultado funcional do "Modo Navegação" (pan/zoom livre, visual
  // idêntico ao Mapa 2D de verdade, zero edição) sem o risco de uma
  // reescrita arquitetural grande baseada num singleton que não foi
  // desenhado pra rodar N vezes ao mesmo tempo. Fica documentado aqui como
  // trade-off consciente, não como pedido ignorado.

  // ---------------------------------------------------------------------
  // ITEM A11/A13 (rodada 57, retomado 31/08/2026) — orbs de coluna + busca
  // por mapa, no modo Grade. Pedido do usuário verbatim: "Para cada mapa,
  // no grupo de patrimônios (plaquinha de metal) deve haver um pequeno orb
  // direcional em cima e à direita do grupo de patrimônios [...] dois
  // botões de ação: o da esquerda [...] diminui o número de colunas (o
  // mínimo é 1 [...]); o da direita [...] aumenta [...] (máximo 10). Um
  // orb direcional deve ser colocado nos patrimônios de cada foto também
  // [...] Por padrão [...] deve ser 2 colunas." + "Deve haver uma entrada
  // para busca de patrimônio por mapa [...] toggle [...] Primeiro estado,
  // todos os patrimônios ficam nas suas exatas posições. Se o patrimônio
  // for encontrado, então, apenas ele não fica transparente. Segundo
  // estado, se o patrimônio for encontrado, então, só ele fica aparente
  // [...] enquanto se vai digitando, a seleção já vai sendo feita."
  //
  // Estado 100% em memória (mesmo espírito de `_gridPositions`/`_gridZoom`
  // — nunca gravado no banco, reseta só num F5 de verdade), chaveado por
  // uma string ("map:<id>" pros patrimônios soltos do mapa, "foto:<id>"
  // pros vinculados de cada foto — mesma chave serve tanto pro nº de
  // colunas quanto pra busca, já que os dois controles vivem juntos na
  // mesma seção). ESCOPO DESTA RODADA: só o modo Grade (pedido original
  // menciona também "vinculações embaixo da planta baixa" e reordenar
  // blocos de foto entre si — ainda NÃO implementados, ver changelog do
  // projeto). O orb de REORGANIZAR (crescente/decrescente/por grupo de
  // fotos/conforme inserido/personalizado) também ainda NÃO foi feito
  // nesta rodada — precisa de uma ordem "personalizada" persistida por
  // reposicionamento manual, que não existe ainda pra patrimônios dentro
  // de uma lista (só existe pra cartões de MAPA inteiros, `_gridPositions`).
  _gridColCounts: {},
  _gridSearchQuery: {},
  _gridSearchMode: {}, // 'destacar' (padrão) | 'ocultar'

  _getColCount(key) {
    const v = this._gridColCounts[key];
    return (typeof v === 'number' && v >= 1 && v <= 10) ? v : 2;
  },

  // NOVO (01/09/2026), pedido do usuário verbatim: "se há apenas 5
  // patrimônios, então, mesmo o limite sendo 10, não deve passar de 5, pois
  // tem apenas 5 itens." — o teto de colunas não é mais SEMPRE 10: é o menor
  // valor entre 10 e a quantidade de itens de fato desenhados naquele grupo
  // (`maxItems`, sempre passado por quem chama — cada ponto de renderização
  // já sabe quantos itens vai desenhar ali). Sem `maxItems` (chamada
  // defensiva/antiga), cai no teto de sempre (10) — nunca menos que 1.
  _colCap(maxItems) {
    const m = (typeof maxItems === 'number' && !Number.isNaN(maxItems)) ? maxItems : 10;
    return Math.max(1, Math.min(10, m));
  },

  // Nº de colunas REALMENTE aplicado (nunca acima do teto atual, mesmo que
  // `_gridColCounts[key]` guarde um valor maior de quando havia mais itens
  // naquele grupo — ex.: um patrimônio foi excluído/movido pra outro mapa
  // depois de já ter escolhido mais colunas do que sobrou). Usado tanto pelo
  // orb (`_colOrbHtml`) quanto pela variável CSS `--organize-cols` de cada
  // container (ver `_gridCardHtml`/`_renderGridVinculacoesPlanta`/
  // `_renderGridFotos`), sempre com o MESMO `maxItems`, pra nunca divergir.
  _effectiveColCount(key, maxItems) {
    return Math.min(this._getColCount(key), this._colCap(maxItems));
  },

  _colOrbHtml(key, maxItems) {
    const cap = this._colCap(maxItems);
    const n = Math.min(this._getColCount(key), cap);
    return `<span class="organize-col-orb" data-col-key="${Utils.escapeHtml(key)}" data-col-max="${cap}" title="Colunas: ${n} (mín. 1, máx. ${cap})">
      <button type="button" class="organize-col-orb-btn organize-col-orb-dec" ${n <= 1 ? 'disabled' : ''} title="Menos colunas">◀</button>
      <span class="organize-col-orb-n">${n}</span>
      <button type="button" class="organize-col-orb-btn organize-col-orb-inc" ${n >= cap ? 'disabled' : ''} title="Mais colunas">▶</button>
    </span>`;
  },

  // ---------------------------------------------------------------------
  // ITEM "orb de reordenar" (31/08/2026, pedido "continue" 8ª vez —
  // "faça de uma vez: o orb de reordenar (crescente/decrescente/personalizado)
  // [...]") — tinha ficado documentado como pendente desde a rodada 57/v311
  // (ver comentário grande acima de `_gridColCounts`: "precisa de uma ordem
  // 'personalizada' persistida por reposicionamento manual, que não existe
  // ainda pra patrimônios dentro de uma lista"). Afeta só a lista de
  // patrimônios SOLTOS de cada mapa (`entry.itens`, a mesma fonte usada
  // tanto por `_renderGridPatrimonios`/Grade quanto por
  // `_renderPatrimonioColumn`/Cartões) — as listas menores e já filtradas
  // (vinculações de planta baixa, patrimônios marcados numa foto
  // específica) ficam FORA de propósito: são subconjuntos pequenos, já
  // naturalmente ordenados pela ordem de marcação/vinculação — reordenar
  // cada uma separadamente adicionaria complexidade sem pedido explícito
  // pra isso.
  //
  // 5 modos, ciclados por um clique só no orb (mesmo espírito visual do
  // "col orb" acima — um botão, ícone mudando): 'inserted' (padrão, ordem
  // natural do array — a mesma que o banco devolve, refletindo criação/
  // importação — "conforme inserido"), 'asc'/'desc' (por número de
  // patrimônio, comparação numérica-aware via `localeCompare(...,
  // {numeric:true})`, então "PAT-2" vem antes de "PAT-10", não depois),
  // 'fotoGroup' (agrupa pela PRIMEIRA foto em que cada patrimônio tem um
  // orb, na ordem das fotos do mapa — sem nenhuma foto vinculada fica por
  // último), 'custom' (ordem manual, PERSISTIDA — ver `map.itemOrder`,
  // campo novo no objeto do MAPA, gravado via `DB.saveMap` a cada
  // reordenação — mesmo padrão já usado pra renomear mapa/foto: persiste
  // NA HORA, fora do sistema de "alterações pendentes", por ser um ajuste
  // de organização/exibição, não uma edição de dado do patrimônio em si).
  //
  // DECISÃO DE DESIGN pro modo 'custom': arrastar-e-soltar de verdade (com
  // ghost box/FLIP) é justamente o item mais arriscado ainda pendente do
  // pedido original inteiro (ver comentário no topo do arquivo) — reusar
  // esse mesmo risco aqui, sem navegador pra calibrar visualmente antes de
  // entregar, não parecia prudente. Em vez disso, cada plaquinha/linha
  // ganha 2 botõezinhos (SÓ quando o modo 'custom' está ativo pra aquele
  // mapa) que trocam sua posição com a vizinha imediata — mesma linguagem
  // visual já usada pelo "col orb" (botões simples, sem gesto novo pra
  // aprender/testar), suficiente pra atingir "ordem personalizada
  // persistida" sem reintroduzir o risco do D&D completo.
  _itemSortMode: {}, // {mapId: 'inserted'|'asc'|'desc'|'fotoGroup'|'custom'}
  _SORT_MODES: ['inserted', 'asc', 'desc', 'fotoGroup', 'custom'],
  _SORT_MODE_ICON: { inserted: '🕒', asc: '🔼', desc: '🔽', fotoGroup: '📷', custom: '✋' },
  _SORT_MODE_LABEL: {
    inserted: 'Conforme inserido (ordem original)',
    asc: 'Crescente (por número de patrimônio)',
    desc: 'Decrescente (por número de patrimônio)',
    fotoGroup: 'Agrupado pela foto vinculada',
    custom: 'Personalizado — use as setinhas em cada patrimônio pra reordenar',
  },

  _getSortMode(mapId) {
    const m = this._itemSortMode[mapId];
    return this._SORT_MODES.includes(m) ? m : 'inserted';
  },

  /** ITEM "setinha de ordem" (31/08/2026), pedido do usuário verbatim: "O
   *  botão de ordem deve ter um botão de setinha atrelado a ele e ao seu
   *  lado. Quando clicado, a lista de opções aparecem cada uma com o seu
   *  ícone e texto da opção." O orb principal continua igual (clique cicla
   *  pro PRÓXIMO modo, comportamento já existente e testado) — a setinha
   *  "▾" ao lado é uma forma ADICIONAL de trocar direto pro modo desejado
   *  sem precisar ciclar por todos. Os dois botões + o menu (escondido via
   *  `hidden`, ver `_wireItemListHeadControls`/`_closeAllSortMenus`) ficam
   *  dentro de um `<span>` posicionado (`.organize-sort-orb-group`) pra
   *  ancorar o menu logo abaixo dele. */
  _sortOrbHtml(mapId) {
    const mode = this._getSortMode(mapId);
    return `<span class="organize-sort-orb-group">
      <button type="button" class="organize-sort-orb" data-sort-map-id="${mapId}" title="Ordem: ${this._SORT_MODE_LABEL[mode]} — clique pra trocar para a próxima opção">${this._SORT_MODE_ICON[mode]}</button>
      <button type="button" class="organize-sort-orb-arrow" data-sort-menu-map-id="${mapId}" title="Ver todas as opções de ordem">▾</button>
      <div class="organize-sort-menu" data-sort-menu-for="${mapId}" hidden>
        ${this._SORT_MODES.map((m) => `<button type="button" class="organize-sort-menu-item${m === mode ? ' organize-sort-menu-item-active' : ''}" data-sort-map-id="${mapId}" data-sort-mode="${m}">${this._SORT_MODE_ICON[m]} <span>${this._SORT_MODE_LABEL[m]}</span></button>`).join('')}
      </div>
    </span>`;
  },

  /** Aplica um modo de ordem específico (chamado tanto pelo clique direto
   *  no item do menu novo quanto, indiretamente, por `_cycleSortMode`) —
   *  extraído (31/08/2026) pra não duplicar a lógica de "salvar + re-
   *  renderizar + avisar" entre os dois pontos de entrada. */
  _applySortMode(mapId, mode) {
    if (!this._SORT_MODES.includes(mode)) return;
    this._itemSortMode[mapId] = mode;
    if (mode === 'custom') this._ensureCustomOrder(mapId);
    const entry = this._maps.find((e) => e.map.id === mapId);
    if (entry) { this._refreshGridCardBody(entry); this._refreshCardBody(entry); }
    Utils.toast(`Ordem: ${this._SORT_MODE_LABEL[mode]}`, { duration: 1800 });
  },

  _cycleSortMode(mapId) {
    const idx = this._SORT_MODES.indexOf(this._getSortMode(mapId));
    this._applySortMode(mapId, this._SORT_MODES[(idx + 1) % this._SORT_MODES.length]);
  },

  /** Fecha todos os menus de ordem abertos (qualquer cartão) — usado tanto
   *  pelo clique fora quanto por "abrir outro popover fecha este" (ver
   *  `_buildOverlay`, mesmo padrão de `_closeOtherOrganizePopovers`). */
  _closeAllSortMenus() {
    this._overlayEl?.querySelectorAll('.organize-sort-menu:not([hidden])').forEach((m) => m.setAttribute('hidden', ''));
  },

  /** Garante que `map.itemOrder` (array de ids, campo NOVO persistido no
   *  objeto do mapa) tem uma entrada pra cada patrimônio ATUAL do mapa —
   *  completa os que faltam (recém-criados/movidos pra cá depois da última
   *  vez em que a ordem personalizada foi usada) no FIM, na ordem natural,
   *  sem nunca reordenar os que já tinham posição salva. Só grava no banco
   *  se algo realmente mudou (evita um `saveMap` à toa toda vez que o modo
   *  'custom' é escolhido de novo sem nada ter mudado desde a última vez). */
  _ensureCustomOrder(mapId) {
    const entry = this._maps.find((e) => e.map.id === mapId);
    if (!entry) return;
    const ids = entry.itens.map((it) => it.id);
    const idSet = new Set(ids);
    const existing = Array.isArray(entry.map.itemOrder) ? entry.map.itemOrder.filter((id) => idSet.has(id)) : [];
    const existingSet = new Set(existing);
    const faltando = ids.filter((id) => !existingSet.has(id));
    const novo = [...existing, ...faltando];
    const antigo = entry.map.itemOrder || [];
    const mudou = novo.length !== antigo.length || novo.some((id, i) => id !== antigo[i]);
    entry.map.itemOrder = novo;
    if (mudou) { DB.saveMap(entry.map).catch(() => {}); }
  },

  /** Devolve uma CÓPIA de `entry.itens` na ordem de exibição escolhida pra
   *  aquele mapa (ver `_itemSortMode`) — nunca muta `entry.itens` (a ordem
   *  "real"/de criação continua intacta, usada por qualquer outra parte do
   *  código que precise da ordem natural, ex.: `_renderGridFotos`). */
  _sortItensForDisplay(entry) {
    const mode = this._getSortMode(entry.map.id);
    const itens = entry.itens;
    if (mode === 'asc' || mode === 'desc') {
      const sorted = [...itens].sort((a, b) => (a.patrimonio || '').localeCompare(b.patrimonio || '', 'pt', { numeric: true, sensitivity: 'base' }));
      return mode === 'desc' ? sorted.reverse() : sorted;
    }
    if (mode === 'fotoGroup') {
      const fotoOrder = new Map((entry.fotos || []).map((f, i) => [f.id, i]));
      const primeiraFotoDoItem = new Map();
      (entry.fotos || []).forEach((f) => (f.orbs || []).forEach((o) => {
        if (o.itemId && !primeiraFotoDoItem.has(o.itemId)) primeiraFotoDoItem.set(o.itemId, f.id);
      }));
      // NOVO (01/09/2026), pedido verbatim: "Os patrimônios, ao serem
      // marcados para serem excluídos, ainda estão se reposicionando em
      // ordem. A ordem deles deve se manter [...] deve permanecer nesta
      // mesma linha e nesta mesma coluna." Causa raiz: `_deleteItem` já
      // remove o orb de `foto.orbs` na hora (mesmo estando só "pendente"),
      // então o loop acima nunca encontra foto nenhuma pra um item
      // `__pendingDelete` — cai no fallback 999999 (mais abaixo) e é jogado
      // pro FIM da lista ordenada, mudando de linha/coluna. Reconstrói a
      // foto original a partir de `removedOrbs` (já guardado por
      // `_deleteItem`/`_pushPendingAction` — mesmo dado usado pra reencaixar
      // o chip fantasma na posição certa dentro da própria foto, ver
      // `_pendingDeletedChipsForFoto`): como `removedOrbs` foi montado
      // iterando `entry.fotos` na MESMA ordem que o loop acima usa,
      // `removedOrbs[0]` é sempre a mesma "primeira foto" que o item já
      // tinha antes de ser marcado.
      (this._pendingActions || []).forEach((a) => {
        if (a.type === 'delete-item' && a.mapId === entry.map.id && !primeiraFotoDoItem.has(a.itemId)) {
          const primeiro = (a.removedOrbs || [])[0];
          if (primeiro) primeiraFotoDoItem.set(a.itemId, primeiro.fotoId);
        }
      });
      return itens.map((it, i) => ({ it, i })).sort((a, b) => {
        const fa = primeiraFotoDoItem.has(a.it.id) ? (fotoOrder.get(primeiraFotoDoItem.get(a.it.id)) ?? 99999) : 999999;
        const fb = primeiraFotoDoItem.has(b.it.id) ? (fotoOrder.get(primeiraFotoDoItem.get(b.it.id)) ?? 99999) : 999999;
        return fa !== fb ? fa - fb : a.i - b.i; // sort ESTÁVEL dentro do mesmo grupo
      }).map((x) => x.it);
    }
    if (mode === 'custom') {
      const order = Array.isArray(entry.map.itemOrder) ? entry.map.itemOrder : [];
      const idx = new Map(order.map((id, i) => [id, i]));
      return itens.map((it, i) => ({ it, i })).sort((a, b) => {
        const ia = idx.has(a.it.id) ? idx.get(a.it.id) : 999999;
        const ib = idx.has(b.it.id) ? idx.get(b.it.id) : 999999;
        return ia !== ib ? ia - ib : a.i - b.i;
      }).map((x) => x.it);
    }
    return itens; // 'inserted' — ordem natural do array
  },

  // NOVO (02/09/2026, rodada D, item D5) — mesmo espírito de
  // `_ensureCustomOrder`/`_sortItensForDisplay` acima, agora pra FOTOS
  // (`map.fotoOrder`, campo NOVO persistido no mapa). Pedido verbatim:
  // "Dentro do mesmo mapa, entre fotos [...] é um reposicionamento, com todo
  // o bloco (foto e vinculações), apenas muda a ordem, como no 'Ver lista
  // simples'." Fotos não tinham NENHUM conceito de "ordem personalizada"
  // antes desta rodada (sempre a ordem natural de inserção do array) — não
  // havia "modo de ordenação" pra fotos (isso é só dos patrimônios, ver
  // `_getSortMode`), então aqui a ordem personalizada é a ÚNICA/sempre usada
  // quando existente (sem outros modos concorrendo).
  /** Garante que `map.fotoOrder` tem uma entrada pra cada foto ATUAL do
   *  mapa — completa as que faltam no FIM, na ordem natural, sem nunca
   *  reordenar as que já tinham posição salva (mesma lógica de
   *  `_ensureCustomOrder`). */
  _ensureFotoOrder(mapId) {
    const entry = this._maps.find((e) => e.map.id === mapId);
    if (!entry) return;
    const ids = entry.fotos.map((f) => f.id);
    const idSet = new Set(ids);
    const existing = Array.isArray(entry.map.fotoOrder) ? entry.map.fotoOrder.filter((id) => idSet.has(id)) : [];
    const existingSet = new Set(existing);
    const faltando = ids.filter((id) => !existingSet.has(id));
    const novo = [...existing, ...faltando];
    const antigo = entry.map.fotoOrder || [];
    const mudou = novo.length !== antigo.length || novo.some((id, i) => id !== antigo[i]);
    entry.map.fotoOrder = novo;
    if (mudou) { DB.saveMap(entry.map).catch(() => {}); }
  },

  /** Devolve uma CÓPIA de `entry.fotos` na ordem personalizada salva
   *  (`map.fotoOrder`) — nunca muta `entry.fotos` (a ordem natural/de
   *  criação continua intacta pra quem precisar dela, ex.: modo 'fotoGroup'
   *  de `_sortItensForDisplay` acima). */
  _sortFotosForDisplay(entry) {
    this._ensureFotoOrder(entry.map.id);
    const order = Array.isArray(entry.map.fotoOrder) ? entry.map.fotoOrder : [];
    const idx = new Map(order.map((id, i) => [id, i]));
    return entry.fotos.map((f, i) => ({ f, i })).sort((a, b) => {
      const ia = idx.has(a.f.id) ? idx.get(a.f.id) : 999999;
      const ib = idx.has(b.f.id) ? idx.get(b.f.id) : 999999;
      return ia !== ib ? ia - ib : a.i - b.i;
    }).map((x) => x.f);
  },

  /** Troca de posição, na ordem PERSONALIZADA (`map.itemOrder`), um
   *  patrimônio com seu vizinho imediato (`delta` -1 = anterior, +1 =
   *  seguinte) — ver decisão de design grande acima de `_itemSortMode`
   *  (botões ao invés de arrastar-e-soltar de verdade). */
  _moveCustomOrder(mapId, itemId, delta) {
    const entry = this._maps.find((e) => e.map.id === mapId);
    if (!entry) return;
    this._ensureCustomOrder(mapId);
    const order = entry.map.itemOrder;
    const i = order.indexOf(itemId);
    if (i < 0) return;
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    DB.saveMap(entry.map).catch(() => {});
    this._refreshGridCardBody(entry);
    this._refreshCardBody(entry);
  },

  // ---------------------------------------------------------------------
  // ITEM "lista expansível de objetos" — REMOVIDO (31/08/2026), pedido do
  // usuário verbatim: "Os patrimônios devem ficar a mostra, remova o botão
  // que os recolhe." A lista de patrimônios (Grade E Cartões) volta a
  // mostrar SEMPRE todos de uma vez, sem toggle de recolher/expandir — o
  // subsistema inteiro (`_itemListExpanded`/`_ITEM_LIST_COLLAPSE_
  // THRESHOLD`/`_isItemListExpanded`/`_toggleItemListExpanded`/
  // `_expandToggleHtml`/`_itemListCollapsedHtml`) foi removido daqui e de
  // todos os pontos que chamavam (`_mapCardHtml`, `_gridCardHtml`,
  // `_refreshCardBody`), junto com a regra CSS `.organize-list-expand-
  // toggle` e os cenários de teste que cobriam o recolher/expandir.

  /** Liga os controles do cabeçalho da lista de patrimônios (orb de
   *  reordenar + a nova setinha de menu, setinhas de reordenar
   *  personalizado) — compartilhado pelos 2 modos de visualização
   *  (chamado tanto por `_wireGridCard` quanto por `_wireCard`), já que o
   *  HTML/comportamento é idêntico nos dois. */
  _wireItemListHeadControls(card) {
    card.querySelectorAll('.organize-sort-orb').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._cycleSortMode(btn.dataset.sortMapId); });
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    // ITEM "setinha de ordem" (31/08/2026) — abre o menu com as 5 opções
    // (ícone + texto cada, pedido verbatim). Fecha qualquer outro popover/
    // menu de ordem já aberto antes de abrir o seu (via
    // `_closeOtherOrganizePopovers`, registrado uma única vez em
    // `_buildOverlay` — ver lá).
    card.querySelectorAll('.organize-sort-orb-arrow').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mapId = btn.dataset.sortMenuMapId;
        const menu = card.querySelector(`.organize-sort-menu[data-sort-menu-for="${CSS.escape(mapId)}"]`);
        if (!menu) return;
        const willOpen = menu.hasAttribute('hidden');
        (this._overlayEl?._closeOtherOrganizePopovers || []).forEach((fn) => fn());
        if (willOpen) menu.removeAttribute('hidden');
      });
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    card.querySelectorAll('.organize-sort-menu-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._applySortMode(btn.dataset.sortMapId, btn.dataset.sortMode);
      });
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    card.querySelectorAll('.organize-sort-menu').forEach((menu) => menu.addEventListener('click', (e) => e.stopPropagation()));
    card.querySelectorAll('.organize-reorder-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._moveCustomOrder(btn.dataset.mapId, btn.dataset.itemId, btn.classList.contains('organize-reorder-next') ? 1 : -1);
      });
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
  },

  /** Ajusta o Nº de colunas de UM grupo (patrimônios soltos de um mapa OU
   *  vinculados de uma foto) sem re-renderizar o cartão inteiro — só o
   *  container (`[data-cols-key]`, via a variável CSS `--organize-cols`,
   *  ver style.css `.organize-grid-patrimonios`/`.organize-vinc-list-
   *  gridcols`) e o próprio orb (número + estado disabled dos botões).
   *  NOVO (01/09/2026) — o teto não é mais fixo em 10: lê `data-col-max` do
   *  próprio orb (gravado por `_colOrbHtml` na hora de desenhar, com a
   *  quantidade de itens de fato daquele grupo — ver `_colCap`), pra nunca
   *  deixar escolher mais colunas do que itens existentes. */
  _adjustColCount(key, delta) {
    const canvas = this._overlayEl?.querySelector('#organize-grid-canvas');
    const orb = canvas?.querySelector(`.organize-col-orb[data-col-key="${CSS.escape(key)}"]`);
    const cap = this._colCap(parseInt(orb?.dataset.colMax, 10));
    const cur = this._getColCount(key);
    const next = Math.max(1, Math.min(cap, cur + delta));
    if (next === cur) return;
    this._gridColCounts[key] = next;
    const container = canvas?.querySelector(`[data-cols-key="${CSS.escape(key)}"]`);
    if (container) container.style.setProperty('--organize-cols', next);
    if (orb) {
      orb.title = `Colunas: ${next} (mín. 1, máx. ${cap})`;
      const numEl = orb.querySelector('.organize-col-orb-n');
      if (numEl) numEl.textContent = next;
      const dec = orb.querySelector('.organize-col-orb-dec');
      const inc = orb.querySelector('.organize-col-orb-inc');
      if (dec) dec.disabled = next <= 1;
      if (inc) inc.disabled = next >= cap;
    }
    // NOVO (02/09/2026, rodada E) — ver comentário grande em
    // `_gridFotosCellWidthPx`: quando a chave mudada é de uma foto
    // individual (`foto:<id>`, orb de vinculação PRÓPRIO dela) ou da
    // coleção inteira de fotos (`fotos:map:<id>`), a largura de trilho
    // `--organize-foto-w` de `.organize-grid-fotos` precisa ser reavaliada
    // agora mesmo (patch cirúrgico, sem re-renderizar nada) — senão a
    // rolagem/sobreposição só sumiria numa próxima renderização completa do
    // cartão (`_refreshGridCardBody`), não no clique em si. Lê o `--organize-
    // cols` que ACABA de ser escrito acima (nesta mesma foto, se for o caso)
    // direto do DOM de cada `.organize-grid-foto-item` da coleção — evita
    // precisar de `entry`/dados aqui, que este método não recebe.
    if (key.startsWith('foto:') || key.startsWith('fotos:map:')) {
      const fotosGrid = key.startsWith('fotos:map:') ? container : container?.closest('.organize-grid-fotos');
      if (fotosGrid) {
        const VINCCHIP_W = 132, GAP = 4, MIN_W = 132;
        let maxW = MIN_W;
        fotosGrid.querySelectorAll(':scope > .organize-grid-foto-item > .organize-vinc-list-gridcols').forEach((vincGrid) => {
          const cols = parseInt(getComputedStyle(vincGrid).getPropertyValue('--organize-cols'), 10) || 1;
          const w = cols * VINCCHIP_W + (cols - 1) * GAP;
          if (w > maxW) maxW = w;
        });
        fotosGrid.style.setProperty('--organize-foto-w', maxW + 'px');
      }
    }
  },

  _getSearchMode(key) {
    return this._gridSearchMode[key] === 'ocultar' ? 'ocultar' : 'destacar';
  },
  _gridSearchModeIcon(mode) {
    return mode === 'ocultar' ? '🔍' : '👁️';
  },
  _gridSearchModeTitle(mode) {
    return mode === 'ocultar'
      ? 'Modo atual: OCULTAR não-encontrados (só o patrimônio buscado fica visível) — clique pra trocar pro modo "destacar"'
      : 'Modo atual: DESTACAR (todos continuam nas suas posições, só o encontrado fica opaco) — clique pra trocar pro modo "ocultar"';
  },

  /** Aplica a busca (`this._gridSearchQuery[key]`) + modo (`_gridSearchMode
   *  [key]`) às plaquinhas de UM grupo — reaplicado a cada tecla digitada
   *  (`oninput`) e ao trocar o modo do toggle. Nunca reconstrói o DOM, só
   *  alterna 2 classes por chip (`organize-plaquinha-dim`/`-hidden`). Sem
   *  busca ativa (campo vazio), tudo volta a ficar normal (nenhuma das 2
   *  classes). */
  _applyGridSearch(key) {
    const canvas = this._overlayEl?.querySelector('#organize-grid-canvas');
    const container = canvas?.querySelector(`[data-cols-key="${CSS.escape(key)}"]`);
    if (!container) return;
    const q = (this._gridSearchQuery[key] || '').trim().toLowerCase();
    const mode = this._getSearchMode(key);
    container.querySelectorAll('.organize-plaquinha, .organize-vinc-chip-foto').forEach((chip) => {
      const patr = (chip.dataset.patrimonio || chip.textContent || '').toLowerCase();
      const match = !q || patr.includes(q);
      chip.classList.toggle('organize-plaquinha-dim', !!q && mode === 'destacar' && !match);
      chip.classList.toggle('organize-plaquinha-hidden', !!q && mode === 'ocultar' && !match);
    });
  },

  /** Liga o campo de busca + o toggle de modo de UM grupo — chamado pra
   *  cada `.organize-grid-search`/`.organize-grid-search-toggle` do
   *  cartão (patrimônios soltos do mapa, hoje; foto ainda não tem campo de
   *  busca própria — só o orb de colunas, ver pedido original). */
  _wireGridSearch(card) {
    card.querySelectorAll('.organize-grid-search').forEach((input) => {
      const key = input.dataset.searchKey;
      input.value = this._gridSearchQuery[key] || '';
      input.oninput = (e) => {
        e.stopPropagation();
        this._gridSearchQuery[key] = input.value;
        this._applyGridSearch(key);
      };
      input.addEventListener('pointerdown', (e) => e.stopPropagation()); // não deixa o clique no campo iniciar o arrasto do cartão (ver _wireGridCardBackgroundDrag)
      input.addEventListener('keydown', (e) => e.stopPropagation());
    });
    card.querySelectorAll('.organize-grid-search-toggle').forEach((btn) => {
      const key = btn.dataset.searchKey;
      btn.onclick = (e) => {
        e.stopPropagation();
        const next = this._getSearchMode(key) === 'ocultar' ? 'destacar' : 'ocultar';
        this._gridSearchMode[key] = next;
        btn.textContent = this._gridSearchModeIcon(next);
        btn.title = this._gridSearchModeTitle(next);
        this._applyGridSearch(key);
      };
    });
    card.querySelectorAll('.organize-col-orb').forEach((orb) => {
      const key = orb.dataset.colKey;
      orb.querySelector('.organize-col-orb-dec')?.addEventListener('click', (e) => { e.stopPropagation(); this._adjustColCount(key, -1); });
      orb.querySelector('.organize-col-orb-inc')?.addEventListener('click', (e) => { e.stopPropagation(); this._adjustColCount(key, 1); });
      orb.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    // Reaplica qualquer busca já digitada antes (reabrir o Organizar, ou
    // trocar de modo Cartões<->Grade, não perde o texto — mesmo espírito
    // de `_gridPositions` sobrevivendo à mesma sessão).
    card.querySelectorAll('[data-cols-key]').forEach((el) => this._applyGridSearch(el.dataset.colsKey));
  },
  /** ITEM 5 (rodada 55/v309) — MUDANÇA ARQUITETURAL PRINCIPAL, pedido do
   *  usuário verbatim: "em vez de ir mudando direto, [deve] ser apenas
   *  visual. Deve haver um botão de 'aplicar alterações' [com] uma lista
   *  com a sequência de ações tomadas [e] um botão de reverter."
   *
   *  Antes desta rodada, `_moveItemToMap`/`_movePhotoToMap`/`_mergeMaps`
   *  gravavam direto no IndexedDB (a 2ª, a `_mergeMaps`, já em segundo
   *  plano — ver `_bgTaskStart` — mas ainda IMEDIATAMENTE ao soltar/
   *  confirmar). Agora esses 3 métodos só:
   *   a) mutam o CACHE em memória (`this._maps` — mesmo array de sempre,
   *      já usado pra evitar reconsultar o banco à toa) — mover um item/
   *      foto tira ele do array `itens`/`fotos` da entrada de origem e
   *      põe na de destino; mesclar já fazia isso (rodada 53/54);
   *   b) atualizam SÓ os cartões afetados no DOM (`_refreshCardBody`,
   *      generalização de `_refreshMergedCardAfterMerge` — item 4 do
   *      pedido desta rodada, "não recarregar tudo");
   *   c) empilham 1 entrada aqui, em `_pendingActions` — nunca tocam o
   *      IndexedDB diretamente.
   *
   *  Cada entrada é um objeto plano com `type` ('move-item' | 'move-photo'
   *  | 'merge-maps' — os 3 tipos de ação que já existiam nesta tela; não
   *  existe hoje nenhum botão de EXCLUIR nada em Organizar, então nenhum
   *  tipo 'delete-*' foi implementado — se um dia existir, o mesmo desenho
   *  se aplica: empilhar em vez de gravar na hora), um `label` já formatado
   *  (a frase exata mostrada no painel — ver `_renderPendingPanel`,
   *  seguindo à risca os 3 formatos de exemplo do usuário: "foto ('x.png')
   *  movida de mapa 'A' para mapa 'B'", "'A' e 'B' mesclados", e — se um dia
   *  existir uma exclusão — "foto 'x.png' excluída") e os DADOS mínimos
   *  necessários pra `_applyPendingActions` conseguir REPETIR a mesma
   *  operação no banco depois.
   *
   *  "Aplicar alterações" (`_applyPendingActions`): percorre a lista NA
   *  ORDEM em que foi criada e grava cada ação de verdade no IndexedDB,
   *  reaproveitando a MESMA barra de progresso genérica de segundo plano já
   *  usada pela mesclagem (`_bgTaskStart`/`_bgTaskTick`/`_bgTaskEnd`) — só
   *  que agora cobrindo QUALQUER ação pendente, não só mesclagem. Ao
   *  terminar, a lista de pendências é esvaziada (o que já está na tela
   *  passa a refletir o banco de verdade).
   *
   *  "Reverter" (`_revertPendingActions`) — DECISÃO DE DESIGN (não
   *  especificada em detalhe pelo usuário, que sugeriu "reverter tudo de
   *  uma vez [...] é mais simples e seguro dado o tempo disponível"):
   *  reverte TODAS as pendências de uma vez, nunca uma por uma. Desfazer
   *  cada tipo de ação individualmente ao contrário (ex.: "desmesclar" um
   *  merge, sabendo exatamente quais itens/fotos vieram de qual mapa
   *  descartado, recriando o mapa descartado do zero) é possível mas MUITO
   *  mais arriscado de acertar sem um navegador pra testar interativamente
   *  — o risco de um revert-um-a-um mal calculado deixar o cache em memória
   *  num estado pior que os dados reais do banco (que nunca foram tocados,
   *  já que nada pendente é persistido) é maior que o benefício. Em vez
   *  disso: um SNAPSHOT do cache inteiro (`this._pendingSnapshot`, clonado
   *  com `structuredClone` — ou `JSON.parse(JSON.stringify(...))` como
   *  reserva pra navegadores/ambientes sem `structuredClone` — ver
   *  `_cloneMapsForSnapshot`) é tirado ANTES da PRIMEIRA ação pendente da
   *  sequência atual (`_ensurePendingSnapshot`, chamado no início de cada
   *  um dos 3 métodos de ação). "Reverter" simplesmente restaura
   *  `this._maps` pra esse snapshot inteiro, limpa `_pendingActions` e
   *  `_pendingSnapshot`, e manda `_renderList()` redesenhar tudo a partir
   *  do cache restaurado — aqui SIM é aceitável reconstruir a lista inteira
   *  (diferente do fluxo normal de mover 1 foto, item 4 do pedido): reverter
   *  é uma operação rara, deliberada, e sobre potencialmente VÁRIAS ações
   *  ao mesmo tempo — não há "cartão único" pra atualizar cirurgicamente.
   *
   *  PERSISTÊNCIA ENTRE FECHAR/REABRIR (dentro da mesma sessão de página) —
   *  decisão de design documentada, pedido do usuário: "toda vez que o
   *  usuário fecha o Organizar [...] sem aplicar, as alterações pendentes
   *  precisam continuar pendentes [...] Ao reabrir [...] deve continuar
   *  mostrando o painel." Como `_pendingActions`/`_pendingSnapshot` são
   *  propriedades do objeto `OrganizeView` (não do DOM), e `close()` só
   *  REMOVE o overlay sem tocar nelas, isso já funciona naturalmente — só
   *  precisa reconstruir o painel a partir delas ao reabrir (`_buildOverlay`
   *  chama `_renderPendingPanel()` no fim). Só se perde com um F5 de
   *  verdade (recarregar a página inteira) — aceitável, já que NADA
   *  pendente está gravado, então um F5 nunca corrompe dado nenhum, só
   *  descarta o que ainda não tinha sido persistido (mesmo comportamento
   *  de qualquer formulário não salvo).
   *
   *  AVISO AO FECHAR COM PENDÊNCIAS — decisão de design documentada: `close()`
   *  agora intercepta o fechamento (✖️ ou botão "Voltar") quando há
   *  pendências e abre `_confirmCloseWithPending`, um diálogo com 3 saídas
   *  (Aplicar e fechar / Reverter e fechar / Fechar mantendo pendente) além
   *  de Cancelar — nunca fecha "escondendo" pendências sem a pessoa decidir
   *  o que fazer com elas, mas também nunca IMPEDE fechar (fechar mantendo
   *  pendente é uma opção válida, dado que elas sobrevivem em memória). */
  _pendingActions: [],
  /** Cópia profunda de `_maps` tirada logo ANTES da 1ª ação pendente da
   *  sequência atual — usada só por "Reverter" (ver comentário grande
   *  acima). `null` sempre que não há nenhuma pendência em aberto. */
  _pendingSnapshot: null,
  /** Item 2 do feedback (rodada 54), verbatim: "Enquanto tiver coisas sendo
   *  carregadas ou processadas em segundo plano deve ter algum indicador
   *  visual, por exemplo, uma barra enchendo." A barra "Gerando miniaturas…"
   *  já existente (`#organize-thumb-progress`) foi generalizada pra um
   *  indicador de QUALQUER processamento em segundo plano desta tela — cada
   *  tarefa concorrente (fila de miniaturas, gravação da mesclagem no
   *  IndexedDB — ver `_mergeMaps`) se registra aqui por um id próprio, com
   *  seu total/feito; a barra soma tudo (várias tarefas ao mesmo tempo
   *  enchem juntas, proporcionalmente) e mostra a legenda da tarefa mais
   *  recente. Fica visível sempre que houver ao menos 1 tarefa registrada,
   *  some sozinha quando a última termina — ver `_bgTaskStart`/`_bgTaskTick`/
   *  `_bgTaskEnd`/`_updateBgProgress` abaixo. */
  _bgTasks: null,

  /** Hook público pra código de FORA avisar que a lista de mapas mudou (map
   *  criado, importação) — ver mapview.js (criar/renomear/excluir mapa) e
   *  utils.js (`importMapsWithConflictUI`). Não faz nada agora — só marca
   *  que o PRÓXIMO `open()` (ou uma ação já em andamento aqui dentro) deve
   *  recarregar do banco antes de mostrar algo desatualizado. */
  invalidate() { this._dirty = true; },

  async open(opts = {}) {
    if (this._overlayEl) {
      // Já existe — pode estar ESCONDIDA (ver `_openMapExternally`, fluxo
      // "ir pro mapa e voltar") — só reexibe, sem reconstruir nada.
      this._overlayEl.style.display = '';
      document.getElementById('organize-return-btn')?.remove();
      if (opts.onClose) this._onCloseCb = opts.onClose;
      return;
    }
    if (typeof DB === 'undefined' || typeof Mapping === 'undefined') {
      Utils.toast('Módulo de mapas não carregado.', { type: 'danger' });
      return;
    }
    this._onCloseCb = opts.onClose || null;
    if (!this._selectedMapIds) this._selectedMapIds = new Set();
    if (!this._selectedFotoIds) this._selectedFotoIds = new Set();
    // ATUALIZADO (08/09/2026), pedido verbatim: "Isso deve ser configurável
    // [...] por padrão, todas devem ocupar apenas o espaço da divisão, não
    // a tela cheia (como o que está acontecendo com o 'Organizar' e o
    // 'Foto')." `opts.container`, quando informado (ver js/bsplayout.js,
    // EDITOR_TYPES.organizar), confina o overlay dentro dele — mesmo
    // truque CSS de `.bsp-leaf-body { transform: translateZ(0) }` usado
    // por AmbientePhotos.open, ver comentário lá.
    this._buildOverlay(opts.container);
    if (this._dirty || !this._maps.length) await this.reload();
    else { this._renderList(); this._startThumbnailQueue(); }
  },

  /** `opts.force` pula o aviso de pendências — usado internamente pelos 3
   *  botões do diálogo de aviso (ver `_confirmCloseWithPending`) depois de
   *  já terem resolvido o que fazer com elas (aplicar/reverter/manter). */
  close(opts = {}) {
    if (!this._overlayEl) return;
    // ITEM 5 (rodada 55/v309), decisão de design documentada em
    // `_pendingActions` acima: nunca fecha "escondendo" pendências sem a
    // pessoa decidir — mas também nunca IMPEDE fechar (mantê-las pendentes
    // é uma saída válida, elas sobrevivem em memória até a próxima
    // abertura, ver mesmo comentário).
    if (!opts.force && this._pendingActions?.length) {
      this._confirmCloseWithPending();
      return;
    }
    this._thumbQueue = [];
    document.getElementById('organize-return-btn')?.remove();
    // Tira o listener de `document` (pointerup) montado em
    // `_wireSelectionTools` na abertura — sem isso, cada fechar+reabrir
    // empilharia mais um listener igual, nunca removido (ver comentário
    // grande onde ele é criado).
    if (this._pointerUpHandler) { document.removeEventListener('pointerup', this._pointerUpHandler); this._pointerUpHandler = null; }
    this._drag = null;
    // ITEM B (retomado 31/08/2026) — devolve o HUD de performance pro
    // `document.body` ANTES de remover o overlay do DOM (ver `Perf.mountIn`
    // em js/perf.js) — senão, sendo filho do overlay neste ponto, o
    // `.remove()` logo abaixo apagaria o HUD junto, e ele nunca mais
    // apareceria em lugar nenhum até recarregar a página.
    window.Perf?.mountIn(null);
    this._overlayEl.remove();
    this._overlayEl = null;
    this._confinedContainer = null;
    this._listEl = null;
    const cb = this._onCloseCb;
    this._onCloseCb = null;
    cb?.();
  },

  /** Diálogo mostrado por `close()` quando há alterações pendentes — 3
   *  saídas de verdade + Cancelar (ver decisão de design documentada em
   *  `_pendingActions`, comentário grande acima). */
  _confirmCloseWithPending() {
    const n = this._pendingActions.length;
    const modal = document.createElement('div');
    modal.className = 'organize-modal-backdrop';
    modal.innerHTML = `
      <div class="organize-modal">
        <h3>📝 Alterações pendentes</h3>
        <p>Há ${n} alteração(ões) ainda não gravada(s) no banco de dados (veja a lista no rodapé da tela). O que deseja fazer antes de fechar?</p>
        <div class="organize-modal-actions organize-pendclose-actions">
          <button type="button" class="btn secondary" id="organize-pendclose-cancel">Cancelar</button>
          <button type="button" class="btn secondary" id="organize-pendclose-discard">↩️ Reverter e fechar</button>
          <button type="button" class="btn secondary" id="organize-pendclose-keep">Fechar mantendo pendente</button>
          <button type="button" class="btn" id="organize-pendclose-apply">✅ Aplicar e fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#organize-pendclose-cancel').onclick = () => modal.remove();
    modal.querySelector('#organize-pendclose-discard').onclick = () => {
      modal.remove();
      this._revertPendingActions();
      this.close({ force: true });
    };
    modal.querySelector('#organize-pendclose-keep').onclick = () => {
      modal.remove();
      this.close({ force: true });
    };
    modal.querySelector('#organize-pendclose-apply').onclick = async () => {
      modal.remove();
      await this._applyPendingActions();
      this.close({ force: true });
    };
  },

  _buildOverlay(container) {
    const el = document.createElement('div');
    el.className = 'organize-overlay';
    el.innerHTML = `
      <div class="organize-header">
        <strong>🗂️ Organizar</strong>
        <!-- ITEM "região de informação contextual no cabeçalho" (31/08/2026,
             pedido "continue" 8ª vez) — o cabeçalho já informava só "N
             mapa(s) listado(s)" (pedido original da rodada 52: "no
             cabeçalho deve informar quantos mapas foram listados"). Virou
             um botão que abre um popover com um resumo mais completo (ver
             _renderHeaderInfoPopover/_computeHeaderStats) — "contextual"
             porque reflete o estado ATUAL da tela (patrimônios/fotos/
             medidas/pendências cadastrados agora), recalculado toda vez que
             abre, mesmo espírito do popover de limites de zoom (⚙️) já
             existente ao lado. -->
        <div class="organize-info-group">
          <button type="button" class="organize-map-count" id="organize-map-count" title="Clique pra ver um resumo com mais números"></button>
          <div class="organize-info-popover hidden" id="organize-info-popover"></div>
        </div>
        <div class="organize-header-controls">
          <div class="organize-viewmode-group" id="organize-viewmode-group" title="Trocar o modo de visualização">
            <button type="button" class="icon-btn sm active" data-viewmode="cards" title="Cartões — 1 retângulo por mapa, empilhados, com listas verticais de patrimônios/fotos">🗂️ Cartões</button>
            <button type="button" class="icon-btn sm" data-viewmode="grid" title="Grade — cartões posicionáveis livremente, com pan/zoom (como no Mapa 2D) e plaquinhas de patrimônio">🗺️ Grade</button>
          </div>
          <div class="organize-toolset" id="organize-toolset" role="toolbar" title="Ferramentas de seleção de mapas (as mesmas do mapa 2D)">
            <button type="button" class="icon-btn sm active" data-tool="select" title="Selecionar (clique ou arraste um retângulo)">🖱️</button>
            <button type="button" class="icon-btn sm" data-tool="lasso" title="Laço (arraste um contorno livre)">➰</button>
            <button type="button" class="icon-btn sm" data-tool="ellipse" title="Elipse (arraste uma elipse)">⭕</button>
            <button type="button" class="icon-btn sm" data-tool="move-selection" title="Mover seleção (arrasta a última região desenhada)">🔲</button>
            <button type="button" class="icon-btn sm" data-tool="move-selected" title="Mover selecionados (arrasta os cartões marcados pra reordenar a pilha)">✋📦</button>
            <button type="button" class="icon-btn sm" data-tool="hand" title="Mão (arrastar pra rolar a lista)">🖐️</button>
          </div>
          <button type="button" class="btn secondary sm" id="organize-merge-btn" title="Mesclar os mapas marcados (2 ou mais)">🔗 Mesclar selecionados</button>
          <span class="organize-sel-count" id="organize-sel-count"></span>
          <!-- [15/09/2026 UTC] MUDADO -- pedido verbatim: "Troque as referencias
               nas 'configuracoes 2D' tambem de acordo com os novos nomes. E em
               outros lugares que apareca no app." Botao Mapa->Foto virou
               Mapa->Fotos (mapview.js #mapa-entry-foto); referencias textuais
               atualizadas aqui e nos dois titles abaixo (orbs + medidas). -->
          <button type="button" class="icon-btn sm" id="organize-toggle-orbs" title="Mostrar as bolinhas dos patrimônios nas fotos (como em Mapa → Fotos)">📍 Bolinhas nas fotos</button>
          <button type="button" class="icon-btn sm" id="organize-toggle-linkmode" title="Ao clicar numa miniatura/vinculação de mapa, abrir a planta em 2D ou em 3D">🧭 Abrir em: 2D</button>
          <!-- ITEM C14 (rodada 57/v311), verbatim: "deve ser possível dar um
               snap na grade dos objetos (mapas), habilitável no cabeçalho."
               Só aparece com efeito no modo Grade — ver _applyGridSnap. -->
          <button type="button" class="icon-btn sm" id="organize-toggle-gridsnap" title="Ao soltar um cartão-mapa na grade, arredondar a posição pro quadrado mais próximo (só no modo Grade)">🧲 Snap</button>
          <!-- ITEM C15 (rodada 57/v311), verbatim: "deve haver um conjunto
               de botões para reorganizar [...] 'um abaixo do outro'; 'um ao
               lado do outro'; 'caber todos na tela (tetris)'." Só faz
               sentido/aparece no modo Grade (empilhamento de cartões-mapa —
               ver _wireGridPanZoom/_autoLayoutGrid). -->
          <div class="organize-autolayout-group" id="organize-autolayout-group" title="Reorganizar os cartões da grade">
            <button type="button" class="icon-btn sm" id="organize-layout-vstack" title="Um abaixo do outro">⬇️⬇️</button>
            <button type="button" class="icon-btn sm" id="organize-layout-hstack" title="Um ao lado do outro">➡️➡️</button>
            <button type="button" class="icon-btn sm" id="organize-layout-tetris" title="Caber todos na tela sem sobrepor (tetris)">🧩</button>
          </div>
          <div class="organize-zoom-group" title="Zoom (visão panorâmica de todos os mapas)">
            <button type="button" class="icon-btn sm" id="organize-zoom-out">🔍➖</button>
            <span id="organize-zoom-label">100%</span>
            <button type="button" class="icon-btn sm" id="organize-zoom-in">🔍➕</button>
            <!-- ITEM A16 (retomado 31/08/2026), verbatim: "Os limites do zoom
                 devem ser modificáveis no cabeçalho" — deixado pendente na
                 rodada 57/v311 (só o "dobrar o zoom mínimo" tinha sido feito).
                 Só afeta o modo Grade (o zoom do modo Cartões é uma escala de
                 layout simples, 0.25x-2x fixo, sem "afastar pra ver o
                 mapa todo" — não faz sentido configurar limite ali). -->
            <button type="button" class="icon-btn sm" id="organize-zoom-limits-btn" title="Configurar os limites de zoom da Grade (mín./máx.)">⚙️</button>
            <div class="organize-zoom-limits-popover hidden" id="organize-zoom-limits-popover">
              <label>Zoom mínimo (mais afastado)
                <span class="organize-zoom-limits-inputwrap"><input type="number" id="organize-zoom-limit-min" min="1" max="1000" step="1"> %</span>
              </label>
              <label>Zoom máximo (mais próximo)
                <span class="organize-zoom-limits-inputwrap"><input type="number" id="organize-zoom-limit-max" min="1" max="1000000" step="1"> %</span>
              </label>
              <div class="organize-zoom-limits-actions">
                <button type="button" class="btn secondary sm" id="organize-zoom-limits-cancel">Cancelar</button>
                <button type="button" class="btn sm" id="organize-zoom-limits-apply">Aplicar</button>
              </div>
            </div>
          </div>
        </div>
        <div class="organize-header-actions">
          <button type="button" class="icon-btn" id="organize-close" title="Fechar">✖️</button>
        </div>
      </div>
      <div class="organize-thumb-progress" id="organize-thumb-progress">
        <div class="organize-thumb-progress-fill" id="organize-thumb-progress-fill"></div>
        <span class="organize-thumb-progress-label" id="organize-thumb-progress-label"></span>
      </div>
      <div class="organize-list-wrap" id="organize-list-wrap">
        <div class="organize-list" id="organize-list"></div>
        <!-- ITEM A9 (rodada 57/v311), verbatim: "o hud deve aparecer do
             'Organizar', em ambos modos de visualização." O modo Grade já
             tinha essa faixa de dicas (classe organize-grid-hint) — o modo
             Cartões não tinha nada equivalente. Mesma classe/visual,
             adaptado ao que existe neste modo. -->
        <div class="organize-grid-hint organize-cards-hint" id="organize-cards-hint">Arraste um patrimônio ou foto pra outro mapa · arraste a alcinha ✥ pra mesclar mapas · 2 cliques na planta baixa pra abri-la</div>
      </div>
      <div class="organize-grid-wrap" id="organize-grid-wrap">
        <div class="organize-grid-viewport" id="organize-grid-viewport">
          <!-- ITEM "grade de pontos desenhada em canvas de verdade"
               (31/08/2026) — ver comentário grande em _drawGridBackground
               logo abaixo. Fica ANTES de organize-grid-canvas (pinta por
               baixo dos cartões) e NUNCA é transformado por CSS (nem
               translate, nem scale) — ao contrário do canvas dos cartões,
               este é redesenhado em coordenadas de TELA a cada mudança de
               pan/zoom, exatamente como o Mapa 2D de verdade faz. -->
          <canvas class="organize-grid-bgcanvas" id="organize-grid-bgcanvas"></canvas>
          <div class="organize-grid-canvas" id="organize-grid-canvas"></div>
        </div>
        <div class="organize-grid-hint">Arraste o fundo (ou qualquer área vazia de um cartão) pra mover · botão do meio sempre navega a grade · roda do mouse ou os botões de zoom pra ampliar/reduzir · 2 cliques na planta baixa pra abri-la</div>
      </div>
      <div class="organize-pending-panel" id="organize-pending-panel">
        <div class="organize-pending-header">
          <button type="button" class="organize-pending-toggle-btn" id="organize-pending-toggle">📝 Alterações pendentes (0)</button>
          <div class="organize-pending-actions">
            <button type="button" class="btn secondary sm" id="organize-pending-revert" title="Desfaz TODAS as alterações pendentes (as que já foram aplicadas ao banco não são afetadas)">↩️ Reverter</button>
            <button type="button" class="btn sm" id="organize-pending-apply" title="Grava todas as alterações pendentes no banco, na ordem em que foram feitas">✅ Aplicar alterações</button>
          </div>
        </div>
        <ul class="organize-pending-list" id="organize-pending-list"></ul>
      </div>
    `;
    this._confinedContainer = container || null;
    (container || document.body).appendChild(el);
    this._overlayEl = el;
    this._listEl = el.querySelector('#organize-list');
    // ITEM B (retomado 31/08/2026) — ver comentário grande em `Perf.mountIn`
    // (js/perf.js) pro motivo completo: o overlay do Organizar (`z-index:
    // 900`) pintava por cima do HUD de performance (`z-index:60`), mesmo
    // com o HUD ativado nas configurações. Move o HUD pra DENTRO deste
    // overlay assim que ele é criado — devolvido pro `document.body` em
    // `close()`, antes do overlay ser removido do DOM.
    window.Perf?.mountIn(el);
    el.querySelector('#organize-close').onclick = () => this.close();
    // Toggle "Cartões" / "Grade" (item 4 do pedido v310) — ver comentário
    // grande em `_viewMode`/`_setViewMode`.
    el.querySelectorAll('#organize-viewmode-group [data-viewmode]').forEach((btn) => {
      btn.onclick = () => this._setViewMode(btn.dataset.viewmode);
    });
    this._wireGridPanZoom();
    el.querySelectorAll('#organize-toolset [data-tool]').forEach((btn) => {
      btn.onclick = () => {
        this._tool = btn.dataset.tool;
        el.querySelectorAll('#organize-toolset [data-tool]').forEach((b) => b.classList.toggle('active', b === btn));
      };
    });
    el.querySelector('#organize-merge-btn').onclick = () => this._mergeSelected();
    el.querySelector('#organize-toggle-orbs').onclick = (e) => {
      this._showOrbsOnPhotos = !this._showOrbsOnPhotos;
      e.currentTarget.classList.toggle('active', this._showOrbsOnPhotos);
      // Item 7 do feedback: "não precisa recarregar tudo, os scrolls devem
      // permanecer nas suas rolagens" — os pontinhos (`.organize-foto-
      // orbdot`) já estão SEMPRE no DOM agora (ver `_renderFotosColumn`);
      // só alternamos esta classe, que controla visibilidade (com
      // transição, ver style.css) via CSS puro — nenhum HTML é
      // reconstruído, então nenhuma rolagem se perde.
      this._listEl?.classList.toggle('organize-orbs-visible', this._showOrbsOnPhotos);
      // Modo grade (v310) — mesma classe/mesmo `.organize-foto-orbdot`
      // reaproveitado ali (ver `_renderGridFotos`), só numa árvore de DOM
      // diferente (`#organize-grid-canvas`, não `.organize-list`).
      this._overlayEl?.querySelector('#organize-grid-canvas')?.classList.toggle('organize-orbs-visible', this._showOrbsOnPhotos);
    };
    el.querySelector('#organize-toggle-linkmode').onclick = (e) => {
      this._openLinkMode = this._openLinkMode === '2d' ? '3d' : '2d';
      e.currentTarget.textContent = `🧭 Abrir em: ${this._openLinkMode.toUpperCase()}`;
    };
    // ITEM C14
    el.querySelector('#organize-toggle-gridsnap').onclick = (e) => {
      this._gridSnapAtivo = !this._gridSnapAtivo;
      e.currentTarget.classList.toggle('active', this._gridSnapAtivo);
    };
    el.querySelector('#organize-toggle-gridsnap').classList.toggle('active', this._gridSnapAtivo);
    // ITEM C15
    el.querySelector('#organize-layout-vstack').onclick = () => this._autoLayoutGrid('vstack');
    el.querySelector('#organize-layout-hstack').onclick = () => this._autoLayoutGrid('hstack');
    el.querySelector('#organize-layout-tetris').onclick = () => this._autoLayoutGrid('tetris');
    // Item 3 do feedback: "os esqueletos [miniatura da planta] e as
    // miniaturas são redimensionados, porém os números de patrimônios e os
    // títulos resumidos devem preservar o 'tamanho'." Em vez de `zoom` na
    // lista inteira (versão anterior — encolhia/aumentava TUDO junto,
    // inclusive texto), agora é uma variável CSS (`--organize-zoom`) lida
    // pelo `.organize-list` inteiro (pro layout/miniaturas continuarem
    // escalando pra visão panorâmica) — e os elementos de texto que devem
    // "preservar o tamanho" (nome do mapa, contagem do cabeçalho, número de
    // patrimônio de cada linha) recebem `zoom: calc(1 / var(--organize-
    // zoom))`, que CANCELA multiplicativamente o zoom do ancestral (`zoom`
    // aninhado se acumula por multiplicação — 2x dentro de 0.5x = 1x
    // visual), sem precisar de `transform` nem recalcular nada em JS. Ver
    // seletores exatos em style.css.
    const applyZoom = () => {
      this._listEl.style.setProperty('--organize-zoom', this._zoom);
      this._updateZoomLabel();
    };
    // Os mesmos botões de zoom do cabeçalho servem os 2 modos de
    // visualização (item 4 do pedido v310) — despacham pro estado de zoom
    // certo conforme `_viewMode` (ver comentário grande em `_viewMode`),
    // em vez de duplicar um 2º par de botões só pra grade.
    el.querySelector('#organize-zoom-out').onclick = () => {
      if (this._viewMode === 'grid') { this._gridZoomStep(-1); return; }
      this._zoom = Math.max(0.25, +(this._zoom - 0.1).toFixed(2)); applyZoom();
    };
    el.querySelector('#organize-zoom-in').onclick = () => {
      if (this._viewMode === 'grid') { this._gridZoomStep(1); return; }
      this._zoom = Math.min(2, +(this._zoom + 0.1).toFixed(2)); applyZoom();
    };
    applyZoom();
    // ITEM A16 (retomado 31/08/2026) — "os limites do zoom devem ser
    // modificáveis no cabeçalho": popover simples com 2 campos numéricos
    // (mín./máx. em %), sem alert()/prompt(), mesmo espírito dos outros
    // campos embutidos desta tela. Estado 100% em memória por sessão (mesmo
    // padrão de `_gridZoom`/`_gridPositions` — nunca gravado no banco, só
    // reseta num F5 de verdade), então os campos são preenchidos com os
    // valores ATUAIS (`_GRID_ZOOM_MIN`/`_GRID_ZOOM_MAX`) toda vez que o
    // popover abre, não um valor fixo de fábrica.
    {
      const limitsBtn = el.querySelector('#organize-zoom-limits-btn');
      const limitsPop = el.querySelector('#organize-zoom-limits-popover');
      const minInput = el.querySelector('#organize-zoom-limit-min');
      const maxInput = el.querySelector('#organize-zoom-limit-max');
      const closePopover = () => limitsPop.classList.add('hidden');
      // ITEM "informação contextual no cabeçalho" (31/08/2026) — guardado
      // no próprio `el` (não numa variável local deste bloco, que o outro
      // bloco abaixo não enxergaria) pra que os 2 popovers consigam fechar
      // um ao outro — sem isso, abrir este (zoom) enquanto o de informação
      // já estava aberto deixaria os DOIS abertos ao mesmo tempo (achado
      // testando: `#organize-map-count` virou botão nesta mesma rodada,
      // então o clique nele agora tem ação própria com `stopPropagation`,
      // não é mais um "clique neutro fora de tudo" como antes).
      el._closeOtherOrganizePopovers = el._closeOtherOrganizePopovers || [];
      el._closeOtherOrganizePopovers.push(closePopover);
      limitsBtn.onclick = (e) => {
        e.stopPropagation();
        el._closeOtherOrganizePopovers.forEach((fn) => { if (fn !== closePopover) fn(); });
        minInput.value = Math.round(this._GRID_ZOOM_MIN * 100);
        maxInput.value = Math.round(this._GRID_ZOOM_MAX * 100);
        limitsPop.classList.toggle('hidden');
      };
      limitsPop.addEventListener('click', (e) => e.stopPropagation()); // clique DENTRO do popover não deve fechá-lo
      el.querySelector('#organize-zoom-limits-cancel').onclick = closePopover;
      el.querySelector('#organize-zoom-limits-apply').onclick = () => {
        const minPct = parseFloat(minInput.value);
        const maxPct = parseFloat(maxInput.value);
        // Validação: os 2 precisam ser números positivos, e o mínimo tem que
        // ser mesmo MENOR que o máximo (senão o zoom nunca teria uma faixa
        // válida pra variar) — nenhum valor é aceito fora disso, mensagem
        // explica o motivo em vez de simplesmente ignorar o clique.
        if (!isFinite(minPct) || !isFinite(maxPct) || minPct <= 0 || maxPct <= 0) {
          Utils.toast('Os limites de zoom precisam ser números maiores que 0.', { type: 'warn' });
          return;
        }
        if (minPct >= maxPct) {
          Utils.toast('O zoom mínimo precisa ser menor que o máximo.', { type: 'warn' });
          return;
        }
        this._GRID_ZOOM_MIN = minPct / 100;
        this._GRID_ZOOM_MAX = maxPct / 100;
        // O zoom ATUAL pode ter ficado fora da faixa nova (ex.: reduzir o
        // máximo pra menos do que o zoom de agora) — reenquadra pra dentro
        // dela na hora, mesma lógica de clamp já usada em `_gridZoomTo`/
        // `_gridFitToContent`.
        this._gridZoom = Math.max(this._GRID_ZOOM_MIN, Math.min(this._GRID_ZOOM_MAX, this._gridZoom));
        if (this._viewMode === 'grid') this._applyGridTransform();
        closePopover();
        Utils.toast(`Limites de zoom atualizados: ${Math.round(this._GRID_ZOOM_MIN * 100)}% – ${Math.round(this._GRID_ZOOM_MAX * 100)}% ✓`, { type: 'ok' });
      };
      // Clicar em qualquer outro lugar da tela fecha o popover — ligado no
      // próprio `el` (overlay, recriado do zero a cada abertura da tela via
      // `_buildOverlay`) em vez de `document`, pra nunca acumular um
      // listener "fantasma" sobrevivendo a fechar/reabrir o Organizar.
      el.addEventListener('click', (e) => {
        if (!limitsPop.classList.contains('hidden') && !e.target.closest('#organize-zoom-limits-popover, #organize-zoom-limits-btn')) closePopover();
      });
    }
    // ITEM "informação contextual no cabeçalho" (31/08/2026) — mesmo
    // espírito/estrutura do popover de limites de zoom acima (abre no
    // clique, fecha em qualquer clique fora, nunca acumula listener
    // fantasma porque `el` é recriado do zero a cada abertura da tela).
    {
      const infoBtn = el.querySelector('#organize-map-count');
      const infoPop = el.querySelector('#organize-info-popover');
      const closeInfoPopover = () => infoPop.classList.add('hidden');
      el._closeOtherOrganizePopovers = el._closeOtherOrganizePopovers || [];
      el._closeOtherOrganizePopovers.push(closeInfoPopover);
      infoBtn.onclick = (e) => {
        e.stopPropagation();
        el._closeOtherOrganizePopovers.forEach((fn) => { if (fn !== closeInfoPopover) fn(); });
        if (infoPop.classList.contains('hidden')) infoPop.innerHTML = this._renderHeaderInfoPopover();
        infoPop.classList.toggle('hidden');
      };
      infoPop.addEventListener('click', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        if (!infoPop.classList.contains('hidden') && !e.target.closest('#organize-info-popover, #organize-map-count')) closeInfoPopover();
      });
    }
    // ITEM "setinha de ordem" (31/08/2026) — mesmo padrão dos 2 popovers
    // acima, só que este cobre um menu POR CARTÃO (vários mapas, cada um
    // com sua própria setinha/menu) — em vez de guardar 1 referência de
    // elemento, fecha TODOS os `.organize-sort-menu` abertos de uma vez
    // (`_closeAllSortMenus`). Registrado UMA vez aqui (não por cartão),
    // já que `el` é recriado do zero a cada abertura da tela.
    {
      el._closeOtherOrganizePopovers = el._closeOtherOrganizePopovers || [];
      el._closeOtherOrganizePopovers.push(() => this._closeAllSortMenus());
      el.addEventListener('click', (e) => {
        if (!e.target.closest('.organize-sort-orb-group')) this._closeAllSortMenus();
      });
    }
    // ITEM "grade de pontos em canvas de verdade" (31/08/2026) — o canvas
    // de fundo (`#organize-grid-bgcanvas`, ver `_drawGridBackground`)
    // precisa ser redesenhado quando o VIEWPORT muda de tamanho (janela
    // redimensionada, painel lateral abre/fecha etc.), não só em
    // pan/zoom/reabrir — um `ResizeObserver` cobre isso sem precisar de
    // handler de `window.resize` (que não pegaria mudanças de layout que
    // não vêm do redimensionamento da JANELA, ex.: o painel de pendências
    // abrindo embaixo e encolhendo a área da grade).
    {
      const gridViewportEl = el.querySelector('#organize-grid-viewport');
      if (gridViewportEl && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => this._drawGridBackground());
        ro.observe(gridViewportEl);
        this._gridBgResizeObserver = ro; // guardado só pra poder desconectar, se um dia precisar
      }
    }
    // Reabrir a tela (fechar de vez e abrir de novo, não só esconder/
    // reexibir) recria `_listEl` do zero — sincroniza a classe de
    // visibilidade das bolinhas com o estado já guardado em
    // `_showOrbsOnPhotos` (ver toggle acima, item 7), senão um toggle
    // ligado antes de fechar "esqueceria" a bolinha visível na próxima
    // abertura mesmo o estado interno continuando true.
    this._listEl.classList.toggle('organize-orbs-visible', this._showOrbsOnPhotos);
    el.querySelector('#organize-toggle-orbs').classList.toggle('active', this._showOrbsOnPhotos);
    this._wireSelectionTools();
    // Modo grade (v310) — reconstrói a grade a partir do cache já existente
    // toda vez que a tela é (re)aberta, e reflete o `_viewMode`/zoom da
    // sessão anterior (persistem entre fechar/reabrir, só não sobrevivem a
    // um F5 de verdade — mesmo espírito de `_zoom`/`_showOrbsOnPhotos`).
    this._setViewMode(this._viewMode);
    // ITEM 5 (rodada 55/v309) — painel de alterações pendentes, ver
    // comentário grande em `_pendingActions` acima. Recolhido/expandido só
    // por CSS (classe `organize-pending-expanded`); a lista de linhas em si
    // (e o contador no botão) são redesenhados por `_renderPendingPanel`,
    // chamada aqui (cobre o caso de reabrir o Organizar já com pendências
    // de uma visita anterior — `_pendingActions` sobrevive a `close()`).
    el.querySelector('#organize-pending-toggle').onclick = () => {
      el.querySelector('#organize-pending-panel')?.classList.toggle('organize-pending-expanded');
    };
    el.querySelector('#organize-pending-apply').onclick = () => this._applyPendingActions();
    el.querySelector('#organize-pending-revert').onclick = () => this._revertPendingActions();
    this._renderPendingPanel();
    // ITEM E (retomado 31/08/2026) — listener ÚNICO, delegado no overlay
    // inteiro (`el`), pros botões "↩️ reverter" embutidos em QUALQUER lápide
    // (`_inlineRevertBtnHtml`, ver comentário grande em `_undoPendingAction`).
    // Delegado aqui (em vez de religado card a card) por 2 motivos: 1) cobre
    // a lápide de MAPA inteiro também, cujo cartão não liga nenhum outro
    // evento (`if (entry.__pendingDelete) return;` em `_wireGridCard`/
    // `_wireCard`); 2) `el` é recriado do zero a cada abertura da tela
    // (mesmo padrão dos outros `el.addEventListener('click', ...)` acima),
    // então nunca acumula listener fantasma. `data-undo-type`/`data-undo-id`
    // identificam a ação pendente (procurada por tipo + id, não por índice —
    // o índice na pilha pode ter mudado desde que o HTML foi desenhado).
    // ATUALIZADO (01/09/2026), pedido verbatim: "Deve dar para reverter a
    // marcação de exclusão nos patrimônios (vinculação, em baixo da foto)."
    // O botão "↩️" dos chips fantasma de vinculação (`_vincChipHtml`) passou
    // a poder emitir `data-undo-type="unlink-item-foto"` — tipo que este
    // listener ainda não sabia resolver (só cobria os 3 tipos de exclusão em
    // si). Somado `unlink-item-foto` (desambiguado por `data-undo-foto-id`,
    // ver `_inlineRevertBtnHtml` — um mesmo item pode ter mais de uma
    // vinculação de foto desfeita ao mesmo tempo) — `_undoPendingAction` já
    // sabia desfazer este tipo (usado pelo painel "Alterações pendentes"),
    // só faltava este listener conseguir ACHAR a ação certa a partir do
    // clique no chip.
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('.organize-pending-undo-inline');
      if (!btn) return;
      const type = btn.dataset.undoType, id = btn.dataset.undoId, fotoId = btn.dataset.undoFotoId;
      const acao = (this._pendingActions || []).find((a) => a.type === type && (
        (type === 'delete-item' && a.itemId === id)
        || (type === 'delete-foto' && a.fotoId === id)
        || (type === 'delete-map' && a.mapId === id)
        || (type === 'unlink-item-foto' && a.itemId === id && a.fotoId === fotoId)
        // NOVO (01/09/2026, item 2 da rodada) — mesmo padrão de
        // 'unlink-item-foto': desambiguado por fotoId (embora `medidaId` já
        // seja único por si só — `DB.uuid()` — mantém a mesma forma dos
        // outros tipos de foto, por consistência/defesa).
        || (type === 'delete-medida' && a.medidaId === id && a.fotoId === fotoId)
      ));
      if (acao) this._undoPendingAction(acao);
    });
    // NOVO (01/09/2026, item 2 da rodada) — botão "🗑️" de CADA medida
    // (`.organize-medida-del-btn`, ver `_medidaChipHtml`), delegado aqui
    // pelo MESMO motivo do listener de reverter logo acima: os chips de
    // medida aparecem tanto no modo Cartões (`_renderFotosColumn`) quanto
    // na Grade (`_renderGridFotos`), sem precisar duplicar o wiring nos 2
    // pontos que já ligam eventos card a card (`_wireCard`/`_wireGridCard`).
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('.organize-medida-del-btn');
      if (!btn) return;
      this._deleteMedida(btn.dataset.fotoId, btn.dataset.medidaId);
    });
  },

  /** Nome de exibição do mapa — reaproveita `Mapping.displayName` tal e
   *  qual (já cobre `apelido` + fallback `defaultAmbienteName`). */
  _mapDisplayName(map) {
    return window.Mapping?.displayName?.(map) || `Mapa ${(map.id || '').slice(0, 6)}`;
  },

  /** "Vazio" pra fins de mesclagem — CORRIGIDO nesta leva (ver cabeçalho do
   *  arquivo, bug 1): é sobre a PLANTA BAIXA em si (nada desenhado — paredes/
   *  objetos/portas/janelas/textos/trilha/câmeras) E nenhum patrimônio REALMENTE
   *  vinculado a ela (pin de verdade, `mapaX` numérico) — NÃO basta o item
   *  ter `ambienteId` apontando pra cá (ele pode estar só "catalogado" nesse
   *  ambiente sem nunca ter sido posicionado na planta). Fotos/vinculações
   *  de foto NÃO entram nesta conta — nunca bloqueiam a mesclagem. */
  _isMapEmpty(map, itens) {
    const vinculados = (itens || []).filter((it) => typeof it.mapaX === 'number');
    return this._drawnCount(map) === 0 && vinculados.length === 0;
  },

  _drawnCount(map) {
    return (map.walls?.length || 0) + (map.objects?.length || 0) + (map.portas?.length || 0)
      + (map.janelas?.length || 0) + (map.textos?.length || 0) + (map.trilha?.length || 0) + (map.cameras?.length || 0);
  },

  async reload() {
    const maps = await DB.getAllMaps();
    const order = (await DB.getSetting('organizeOrder', null)) || [];
    const byId = new Map(maps.map((m) => [m.id, m]));
    const ordenados = [...order.filter((id) => byId.has(id)).map((id) => byId.get(id)),
      ...maps.filter((m) => !order.includes(m.id))];
    this._maps = [];
    for (const map of ordenados) {
      const [itens, fotos] = await Promise.all([DB.getItemsByAmbiente(map.id), DB.getPhotosByAmbiente(map.id)]);
      this._maps.push({ map, itens, fotos, isEmpty: this._isMapEmpty(map, itens) });
    }
    // ITEM A14 (rodada 57/v311) — mesma fonte de verdade que `ambientephotos.js`
    // usa pra marcar orbs duplicados (`DB.getDuplicatePatrimonios()`, um Set
    // de números de patrimônio repetidos em QUALQUER lugar do app, não só
    // deste mapa) — ver uso em `_renderPatrimonioColumn`/`_renderGridPatrimonios`/
    // orbs das fotos.
    try { this._dupSet = await DB.getDuplicatePatrimonios(); } catch (e) { this._dupSet = new Set(); }
    this._renderList();
    this._startThumbnailQueue();
    this._dirty = false;
  },

  /** `it.patrimonio` está marcado como duplicado em algum lugar do app? Ver
   *  `_dupSet`, populado em `reload()`. */
  _isDupPatrimonio(it) {
    return !!(it?.patrimonio && this._dupSet && this._dupSet.has(it.patrimonio.trim()));
  },

  /** HTML de UMA bolinha de orb sobre uma foto (`.organize-foto-orbdot`) —
   *  reaproveitado por `_renderFotosColumn` (modo Cartões) e `_renderGridFotos`
   *  (modo Grade), extraído aqui pra não duplicar as regras dos itens A14/A15.
   *  ITEM A15 (rodada 57/v311), pedido do usuário verbatim: "Quando o cursor
   *  estiver em cima de uma bolinha que está em uma foto, o title deve
   *  aparecer o que acontece se clicar e o número de patrimônio ao qual será
   *  direcionado, por exemplo 'patrimônio 012345, clique para vê-lo em
   *  Mapa->foto (um botão de retorno [...] ficará posicionado centralizado à
   *  esquerda da tela)'." — texto do title monta exatamente esse padrão.
   *  ITEM A14 — lilás (`organize-foto-orbdot-dup`) quando o item do orb tem
   *  patrimônio duplicado (`_isDupPatrimonio`, mesma fonte de `ambientephotos.js`). */
  _orbDotHtml(o, itemById, opts) {
    const item = itemById?.get(o.itemId);
    const patr = item?.patrimonio ? Utils.escapeHtml(item.patrimonio) : '(sem número)';
    const dup = this._isDupPatrimonio(item);
    // CORRIGIDO (31/08/2026), pedido verbatim: "Ao excluir um patrimônio
    // (vinculação, em baixo da foto) deve ser o mesmo que a foto [...]
    // Atualmente está 'sumindo'." O CHIP embaixo da foto já virava "lápide"
    // (ver `_pendingDeletedChipsForFoto`), mas a BOLINHA em cima da própria
    // foto (`.organize-foto-orbdot`) ainda sumia — ela é montada a partir de
    // `orbsComItem`/`f.orbs`, e o orb real já foi apagado de lá por
    // `_deleteItem` (o "fantasma" só sobrevive dentro de `removedOrbs` da
    // ação pendente). Agora os chamadores (`_renderFotosColumn`/
    // `_renderGridFotos`) também desenham uma bolinha "fantasma" por cada
    // `ghostChips`, passando `opts.pending`, com o mesmo visual tracejado/
    // vermelho-transparente da lápide (ver `.organize-foto-orbdot-pending-
    // delete`, style.css) — não clicável (não faz sentido abrir a foto
    // "naquele" patrimônio que está de saída).
    if (opts && opts.pending) {
      const title = `patrimônio ${patr} — marcado para exclusão (pendente até 'Aplicar alterações')`;
      return `<div class="organize-foto-orbdot organize-foto-orbdot-pending-delete" data-x-norm="${o.xNorm}" data-y-norm="${o.yNorm}" title="${title}" style="left:${(o.xNorm * 100).toFixed(2)}%; top:${(o.yNorm * 100).toFixed(2)}%"></div>`;
    }
    const title = `patrimônio ${patr}${dup ? ' (⚠️ duplicado)' : ''}, clique para vê-lo em Mapa→Fotos (um botão de retorno para esta tela ficará posicionado centralizado à esquerda)`;
    return `<div class="organize-foto-orbdot${dup ? ' organize-foto-orbdot-dup' : ''}" data-x-norm="${o.xNorm}" data-y-norm="${o.yNorm}" title="${title}" style="left:${(o.xNorm * 100).toFixed(2)}%; top:${(o.yNorm * 100).toFixed(2)}%"></div>`;
  },

  /** ITEM C/D (retomado 31/08/2026) — HTML de UM chip de vinculação
   *  (`.organize-vinc-chip-foto`), em 1 de 2 estados, reaproveitado por
   *  `_renderGridFotos` (Grade) e `_renderFotosColumn` (Cartões) pra não
   *  duplicar a marcação 4x (2 telas × 2 estados):
   *   - normal (`opts.pending` falso): interativo, com tesourinha (✂️) de
   *     desvincular — igual sempre foi.
   *   - "lápide" (`opts.pending` verdadeiro), pedido verbatim do item C
   *     ("Ao marcar para excluir uma foto, os patrimônios marcados nela
   *     [...] devem ser marcados como 'excluídos' também [...] não
   *     alterando a estrutura e mantendo as dimensões") e do item D
   *     ("Ao marcar para excluir um patrimônio [...] deve manter a box,
   *     ficar com contorno tracejado vermelho e um traço por cima"): usa a
   *     MESMA marcação nos 2 casos (foto excluída OU o próprio patrimônio
   *     excluído) — dashed vermelho + risco (`.organize-vinc-chip-pending-
   *     delete`, CSS) e a tesourinha vira `.organize-vinc-chip-unlink-ghost`
   *     (mesmo espaço do botão real, inerte — nunca religada por nenhum
   *     wiring de clique), garantindo o MESMO footprint do chip normal
   *     (mesmo motivo documentado em `.organize-vinc-chip-unlink-ghost`,
   *     style.css). */
  _vincChipHtml(itemId, item, opts) {
    const label = Utils.escapeHtml(item?.patrimonio || '(sem número)');
    if (opts && opts.pending) {
      const title = Utils.escapeHtml(opts.title || 'Marcado para exclusão (pendente até \'Aplicar alterações\')');
      // NOVO (01/09/2026), pedido verbatim: "Deve dar para reverter a
      // marcação de exclusão nos patrimônios (vinculação, em baixo da
      // foto)." Antes, TODO chip "fantasma" aqui ganhava só a tesourinha
      // inerte (`.organize-vinc-chip-unlink-ghost`) — não dava pra desfazer
      // nada sem sair desta lista. `opts.undoType`/`opts.undoId` só vêm
      // preenchidos quando este fantasma representa uma ação pendente
      // AUTOCONTIDA e reversível (`_pendingDeletedChipsForFoto`, tipo
      // 'delete-item'/'unlink-item-foto') — NÃO quando o chip aparece
      // "pendente" só porque a FOTO INTEIRA está de saída (aí não existe
      // ação individual do item pra reverter; reverter é pelo botão da
      // própria foto, já existente). Nesse caso o botão vira "↩️ reverter"
      // de verdade (`_inlineRevertBtnHtml`), resolvido pelo MESMO listener
      // delegado das outras lápides (ver `_buildOverlay`, estendido pra
      // reconhecer 'unlink-item-foto' por item+foto).
      const undoHtml = opts.undoType
        ? this._inlineRevertBtnHtml(opts.undoType, opts.undoId != null ? opts.undoId : itemId, opts.undoFotoId)
        : `<span class="organize-vinc-chip-unlink-ghost" aria-hidden="true">✂️</span>`;
      return `<span class="organize-vinc-chip organize-vinc-chip-foto organize-vinc-chip-pending-delete" data-item-id="${itemId}" title="${title}"><span class="organize-vinc-chip-label">${label}</span>${undoHtml}</span>`;
    }
    const x = (opts.xNorm * 100).toFixed(2), y = (opts.yNorm * 100).toFixed(2);
    return `<span class="organize-vinc-chip organize-vinc-chip-foto" data-item-id="${itemId}" data-x="${x}" data-y="${y}" title="Clique pra destacar na foto"><span class="organize-vinc-chip-label">${label}</span><span class="organize-vinc-chip-unlink" data-item-id="${itemId}" data-foto-id="${opts.fotoId}" title="Desfazer esta vinculação (pendente até 'Aplicar alterações')">✂️</span></span>`;
  },

  /** ITEM B2 (rodada B, 01/09/2026), pedido verbatim: "As medidas, feitas
   *  nas fotos, também podem ser excluídas e também ficam com borda
   *  vermelha tracejada e preenchimento vermelho transparente. Também,
   *  quando marcados para serem excluídos deve aparecer o botão de
   *  'reverter'." Antes as medidas só eram EXIBIDAS aqui (ver comentário
   *  removido, que dizia "medidas não têm hoje uma operação de exclusão
   *  própria fora de lá [ambientephotos.js]") — agora ganham exclusão
   *  PENDENTE de verdade, mesmo padrão de patrimônio/foto/vinculação
   *  (`_pendingActions`, tipo NOVO 'delete-medida', ver `_deleteMedida`/
   *  `_undoPendingAction`/`_applyPendingActions`). Diferente dos orbs
   *  (`_mergeOrbsWithGhosts`), a medida NUNCA sai de `foto.medidas` até ser
   *  aplicada de vez — só ganha a flag `__pendingDelete` (mesmo espírito de
   *  `foto.__pendingDelete`/`it.__pendingDelete`), então não existe risco
   *  nenhum de reordenar/precisar reconstruir posição: a medida já fica
   *  parada no MESMO índice do array sempre. `forceGhost` (foto inteira já
   *  pendente, mesmo padrão de `_vincChipHtml`/`opts.pending`) desenha SEM
   *  nenhum botão (nem excluir nem reverter — a foto toda já vai sumir),
   *  A NÃO SER que a medida já estivesse pendente ANTES por si só (aí o
   *  "↩️ reverter" dela continua aparecendo, prioridade de `m.__pendingDelete`
   *  abaixo — reverter só a exclusão da FOTO não reverteria a da MEDIDA). */
  _medidaChipHtml(m, fotoId, i, forceGhost) {
    const valorLabel = m.valor && m.valor.trim() ? Utils.escapeHtml(m.valor) : '(sem valor)';
    if (m.__pendingDelete || forceGhost) {
      const title = m.__pendingDelete
        ? "Medida marcada para exclusão — pendente até 'Aplicar alterações'"
        : "Esta foto será excluída — a medida some junto";
      const undoHtml = m.__pendingDelete ? this._inlineRevertBtnHtml('delete-medida', m.id, fotoId) : '';
      // Pedido do usuário (02/09/2026): "marquei para excluir uma foto e os
      // chips de medida diminuíram suas larguras ao serem marcados para
      // serem excluídos. Eles devem manter as suas medidas após ficarem com
      // borda vermelha, riscados e com preenchimento vermelho transparente."
      // Causa raiz: no chip NORMAL (ramo `return` logo abaixo) sempre existe
      // um <button class="organize-medida-del-btn"> reservando espaço no
      // layout (mesmo com opacity:0 fora do hover, ele OCUPA largura). Aqui
      // no ramo pendente, quando a medida está pendente só porque a FOTO
      // INTEIRA foi marcada pra excluir (`forceGhost`, sem __pendingDelete
      // própria), `undoHtml` fica vazio — SEM nenhum elemento no lugar do
      // botão — encolhendo o chip. Corrigido com um placeholder do MESMO
      // tamanho/fonte do botão real, invisível (`organize-medida-del-btn-
      // ghost`, CSS novo: visibility:hidden, mantém o espaço reservado no
      // layout) só pra preservar a largura — nunca aparece quando a medida
      // já tem seu próprio botão "↩️ reverter" (`undoHtml` não vazio).
      const spacerHtml = undoHtml ? '' : '<span class="organize-medida-del-btn organize-medida-del-btn-ghost" aria-hidden="true">🗑️</span>';
      return `<span class="organize-medida-chip organize-medida-chip-pending-delete" title="${title}">📏 <span class="organize-medida-chip-label">${valorLabel}</span>${undoHtml}${spacerHtml}</span>`;
    }
    return `<span class="organize-medida-chip" title="Medida ${i + 1}${m.valor && m.valor.trim() ? ': ' + Utils.escapeHtml(m.valor) : ' (sem valor registrado)'}">📏 <span class="organize-medida-chip-label">${valorLabel}</span><button type="button" class="organize-medida-del-btn" data-medida-id="${m.id}" data-foto-id="${fotoId}" title="Excluir esta medida (pendente até 'Aplicar alterações')">🗑️</button></span>`;
  },

  /** ITEM D (retomado 31/08/2026), pedido verbatim: "Ao marcar para excluir
   *  um patrimônio (vinculação, em baixo da foto [...]) [...] deve manter a
   *  box, ficar com contorno tracejado vermelho e um traço por cima [...]
   *  indicando que está marcado para ser excluído" — em vez de sumir, como
   *  acontecia antes. Problema: `_deleteItem` já remove o orb de `foto.orbs`
   *  NA HORA (documentado lá — necessário pra `_applyPendingActions`/undo
   *  saberem quais fotos regravar), então o chip normal (calculado a partir
   *  de `f.orbs`) deixa de existir de vez — não sobra "chip" nenhum pra
   *  desenhar como lápide. Os dados de "antes" sobrevivem, intactos, dentro
   *  da PRÓPRIA ação pendente que fez a remoção (`removedOrbs`, tipo
   *  'delete-item', já usado por `_undoPendingAction`) — esta função só
   *  procura, pra UMA foto específica, todo orb removido por alguma
   *  exclusão de patrimônio AINDA pendente (nem aplicada, nem revertida) —
   *  cada um vira um chip "fantasma" (`_vincChipHtml(..., {pending:true})`),
   *  com o MESMO footprint do chip normal. Some sozinho quando a ação
   *  pendente é aplicada (sai de `_pendingActions`) ou revertida (orb volta
   *  pra `foto.orbs`, chip normal reaparece no lugar do fantasma). */
  // ATUALIZADO (01/09/2026) — pedido verbatim: "Os patrimônios (vinculações,
  // em baixo das fotos), ainda estão desaparecendo ao serem marcados para
  // serem excluídos diretamente por eles (o ícone de tesoura). Eles devem
  // permanecer exatamente onde estão. Devem ficar com suas exatas dimensões
  // (largura e altura preservados). E, ao ser marcados para exclusão, devem
  // ficar com um risco, borda tracejada vermelha e preenchimento vermelho
  // transparente." Esta função já cobria o caso "o PATRIMÔNIO inteiro foi
  // excluído" (`type: 'delete-item'`), mas não o caso "só a VINCULAÇÃO com
  // esta foto foi desfeita pela tesourinha" (`type: 'unlink-item-foto'`,
  // ver `_unlinkItemFromFoto`) — nesse segundo caso o orb também já sai de
  // `foto.orbs` NA HORA (mesmo motivo/ordem documentados em `_deleteItem`),
  // então o chip real também deixava de existir pra desenhar, e nada
  // preenchia o vazio. Agora cada entrada devolve seu próprio `title`
  // (mensagens diferentes — "excluído" vs "vinculação desfeita" — pra não
  // confundir qual das duas coisas está de fato pendente), consumido pelos
  // 4 pontos que montam `chipsHtml`/`orbDots` em `_renderFotosColumn`/
  // `_renderGridFotos`.
  _pendingDeletedChipsForFoto(fotoId) {
    const out = [];
    for (const a of (this._pendingActions || [])) {
      if (a.type === 'delete-item') {
        for (const r of (a.removedOrbs || [])) {
          // orbIndex (01/09/2026) — ver comentário em `_deleteItem`: guarda a
          // posição original do chip pra `_renderFotosColumn`/
          // `_renderGridFotos` reencaixarem o fantasma no mesmo lugar em vez
          // de empurrá-lo pro final da lista.
          // `type` (01/09/2026) — ver comentário grande em `_vincChipHtml`:
          // agora precisado pra saber que AÇÃO reverter quando o usuário
          // clica no "↩️" deste chip fantasma (antes só existia o título).
          if (r.fotoId === fotoId) out.push({ itemId: a.itemId, orb: r.orb, orbIndex: r.orbIndex, title: 'Este patrimônio está marcado para exclusão', type: 'delete-item' });
        }
      } else if (a.type === 'unlink-item-foto') {
        if (a.fotoId === fotoId && a.removedOrb) {
          out.push({ itemId: a.itemId, orb: a.removedOrb, orbIndex: a.orbIndex, title: "Vinculação com esta foto desfeita — pendente até 'Aplicar alterações'", type: 'unlink-item-foto' });
        }
      }
    }
    return out;
  },

  /** NOVO (01/09/2026), pedido verbatim: "Os patrimônios (vinculação, em
   *  baixo das fotos) ao serem marcados para serem excluídos, devem ficar
   *  nas suas posições e não ir para o 'final da lista de exibição'."
   *  Reencaixa os chips "fantasma" (`ghostChips`, de
   *  `_pendingDeletedChipsForFoto`) DENTRO do array de chips reais
   *  (`orbsComItem`) na posição original (`orbIndex`, capturado no momento
   *  da remoção por `_deleteItem`/`_unlinkItemFromFoto`), em vez de só
   *  concatenar os fantasmas no final. `ghostChips` já vem em ordem
   *  cronológica (ordem de `_pendingActions`), então inserir um de cada vez
   *  (com `splice`) na posição gravada — ajustada pro tamanho atual do
   *  array, caso mais de um fantasma cite o mesmo índice — reproduz a
   *  ordem original o mais fielmente possível. */
  // CORRIGIDO (01/09/2026), pedido verbatim (item 1 da rodada): "os
  // patrimônios (vinculações, em baixo das fotos) [...] ao marcar para
  // serem excluídos, acabam se reposicionando e não permanecendo na sua
  // linha e coluna originais." Causa raiz: `ghostChips` chega em ordem
  // CRONOLÓGICA (mais antigo primeiro, ver `_pendingDeletedChipsForFoto`,
  // que só percorre `_pendingActions` na ordem em que foram empilhadas), e
  // cada `orbIndex` foi gravado relativo ao estado de `foto.orbs` NAQUELE
  // momento — ou seja, já descontando remoções ANTERIORES da MESMA foto,
  // mas não as POSTERIORES. Inserir os fantasmas em ordem cronológica
  // (mais antigo primeiro) só reconstrói a ordem certa quando existe NO
  // MÁXIMO 1 exclusão pendente por foto — com 2+ (ex.: usuário desvincula 2
  // patrimônios diferentes da mesma foto antes de aplicar), o índice do
  // 2º já "não sabe" que o 1º saiu antes dele, e o `splice` empurra os 2
  // fantasmas pra ordem TROCADA entre si a cada novo render (exemplo
  // rastreado à mão: orbs originais [A,B,C,D], exclui B (orbIndex 1) depois
  // C (orbIndex 1, já sem B) — inserir em ordem cronológica dá [A,C,B,D],
  // errado; inserir em ordem CRONOLÓGICA REVERSA — desfazendo a exclusão
  // mais recente primeiro — reconstrói corretamente [A,B,C,D], pois cada
  // `orbIndex` só é válido relativo ao estado que existia IMEDIATAMENTE
  // ANTES daquela remoção específica). Por isso `[...ghostChips].reverse()`
  // abaixo — sem alterar `_pendingDeletedChipsForFoto` (a ordem cronológica
  // de lá continua certa/necessária pra outros usos, ex.: título/tipo).
  _mergeOrbsWithGhosts(orbsComItem, ghostChips) {
    const merged = orbsComItem.map((o) => ({ real: true, itemId: o.itemId, orb: o }));
    for (const g of [...ghostChips].reverse()) {
      const bruto = typeof g.orbIndex === 'number' && g.orbIndex >= 0 ? g.orbIndex : merged.length;
      const idx = Math.max(0, Math.min(bruto, merged.length));
      merged.splice(idx, 0, { real: false, itemId: g.itemId, orb: g.orb, title: g.title, type: g.type });
    }
    return merged;
  },

  /** NOVO (01/09/2026) — mesmo espírito de `_pendingDeletedChipsForFoto`,
   *  mas pro OUTRO lugar que tinha o mesmo bug: a lista de "vinculações com
   *  a planta baixa" (`_renderMapVinculacoes`/`_renderGridVinculacoesPlanta`)
   *  some da tela na hora ao desvincular pela tesourinha, porque
   *  `_unlinkItemFromPlanta` já zera `item.mapaX`/`mapaY` NA HORA (mesmo
   *  motivo/ordem de `_unlinkItemFromFoto`) e essas duas funções recebem só
   *  `vinculadosNoMapa` — a lista JÁ FILTRADA por `typeof it.mapaX ===
   *  'number'` (ver `_mapCardHtml`/`_gridCardHtml`), que exclui o item bem
   *  antes de chegar aqui. O item em si continua existindo (só o PIN foi
   *  zerado — `_unlinkItemFromPlanta` não mexe em `entry.itens`), então dá
   *  pra reencontrá-lo por `a.itemId` e desenhar um chip "fantasma" no
   *  mesmo lugar onde o chip real estava. */
  _pendingUnlinkPlantaGhosts(mapId) {
    const entry = this._maps.find((e) => e.map.id === mapId);
    const out = [];
    if (!entry) return out;
    for (const a of (this._pendingActions || [])) {
      if (a.type !== 'unlink-item-planta' || a.mapId !== mapId) continue;
      const it = entry.itens.find((x) => x.id === a.itemId);
      if (it) out.push(it);
    }
    return out;
  },

  /** ITEM "informação contextual no cabeçalho" (31/08/2026) — resumo
   *  agregado de TODOS os mapas listados, pro popover que abre ao clicar
   *  em "N mapa(s) listado(s)" no cabeçalho (ver `_renderHeaderInfoPopover`/
   *  `_buildOverlay`). Ignora patrimônios/fotos com exclusão PENDENTE (não
   *  conta algo que está prestes a sumir como se já fosse dado "de
   *  verdade") — mesmo critério já usado pelos contadores de cada cartão
   *  (`organize-map-card-counts`). `semFoto` usa um `Set` de ids únicos
   *  (não soma um contador por foto) pra não contar 2x um patrimônio com
   *  orb em mais de uma foto. */
  _computeHeaderStats() {
    let patr = 0, fotos = 0, medidas = 0, vinculacoesFoto = 0, comPin = 0, semPin = 0, duplicados = 0;
    const vinculadosPorFoto = new Set();
    for (const entry of this._maps) {
      for (const it of entry.itens) {
        if (it.__pendingDelete) continue;
        patr++;
        if (typeof it.mapaX === 'number') comPin++; else semPin++;
        if (this._isDupPatrimonio(it)) duplicados++;
      }
      for (const f of entry.fotos) {
        if (f.__pendingDelete) continue;
        fotos++;
        // NOVO (01/09/2026, item 2 da rodada) — mesmo critério já usado pra
        // patrimônio/foto acima (`it.__pendingDelete`/`f.__pendingDelete`):
        // uma medida marcada pra exclusão pendente não conta mais como dado
        // "de verdade" no resumo do cabeçalho.
        medidas += (f.medidas || []).filter((m) => !m.__pendingDelete).length;
        (f.orbs || []).forEach((o) => { if (o.itemId) { vinculacoesFoto++; vinculadosPorFoto.add(o.itemId); } });
      }
    }
    return {
      mapas: this._maps.length,
      patr, fotos, medidas, vinculacoesFoto, comPin, semPin, duplicados,
      semFoto: Math.max(0, patr - vinculadosPorFoto.size),
      pendentes: (this._pendingActions || []).length,
    };
  },

  _renderHeaderInfoPopover() {
    const s = this._computeHeaderStats();
    return `
      <div class="organize-info-row">🗺️ <b>${s.mapas}</b> mapa(s) listado(s)</div>
      <div class="organize-info-row">📦 <b>${s.patr}</b> patrimônio(s) no total</div>
      <div class="organize-info-row">📍 <b>${s.comPin}</b> com pin na planta baixa · <b>${s.semPin}</b> sem pin</div>
      <div class="organize-info-row">🖼️ <b>${s.fotos}</b> foto(s) · 🔗 <b>${s.vinculacoesFoto}</b> vinculação(ões) de patrimônio em foto</div>
      <div class="organize-info-row">📷 <b>${s.semFoto}</b> patrimônio(s) sem nenhuma foto vinculada</div>
      <div class="organize-info-row">📏 <b>${s.medidas}</b> medida(s) registrada(s)</div>
      ${s.duplicados ? `<div class="organize-info-row organize-info-row-warn">⚠️ <b>${s.duplicados}</b> patrimônio(s) com número duplicado</div>` : ''}
      ${s.pendentes ? `<div class="organize-info-row organize-info-row-warn">📝 <b>${s.pendentes}</b> alteração(ões) pendente(s) (ver painel no rodapé)</div>` : ''}
    `;
  },

  _renderList() {
    if (!this._listEl) return;
    const countEl = this._overlayEl?.querySelector('#organize-map-count');
    if (countEl) countEl.textContent = `${this._maps.length} mapa(s) listado(s)`;
    if (!this._maps.length) {
      this._listEl.innerHTML = `<p class="organize-empty-msg">Nenhum mapa ainda. Crie um em "Mapa" pra ele aparecer aqui.</p>`;
      this._updateSelCount();
    } else {
      this._listEl.innerHTML = this._maps.map((entry) => this._mapCardHtml(entry)).join('');
      this._maps.forEach((entry) => this._wireCard(entry));
      this._updateSelCount();
      this._applySelectionHighlight();
      this._applyFotoSelectionHighlight();
    }
    // Modo grade (item 4 do pedido v310, ver comentário grande em
    // `_viewMode`) — mantido em sincronia com o cache SEMPRE que a lista
    // inteira é redesenhada (reload/reverter/mesclar via região etc), não
    // só quando está com a visualização ativa no momento — evita mostrar
    // dado velho ao trocar de aba de visualização depois de uma mudança
    // feita enquanto o outro modo estava visível.
    this._renderGrid();
    if (this._viewMode === 'grid') this._applyGridTransform();
  },

  // REMOVIDO o ramo de "lápide" genérica (01/09/2026) — mesmo
  // motivo/mesma correção documentados no comentário grande acima de
  // `_gridCardHtml` (item 4 da rodada): `forcePending` mantém a MESMA
  // estrutura de 3 colunas de sempre, com cada item/foto/vinculação usando
  // o visual de lápide individual já existente, em vez de trocar o cartão
  // inteiro por uma caixa genérica.
  _mapCardHtml(entry) {
    const { map, itens, fotos, isEmpty } = entry;
    const nome = Utils.escapeHtml(this._mapDisplayName(map));
    const vinculadosNoMapa = itens.filter((it) => typeof it.mapaX === 'number');
    const forcePending = !!entry.__pendingDelete;
    const headerBtnHtml = forcePending
      ? this._inlineRevertBtnHtml('delete-map', map.id)
      : `<button type="button" class="icon-btn sm organize-map-export-btn" data-map-id="${map.id}" title="Exportar apenas este mapa (planta, patrimônios e fotos dele)">⬇️🗺️</button>
          <button type="button" class="icon-btn sm organize-map-delete-btn" data-map-id="${map.id}" title="Excluir este mapa (pendente até 'Aplicar alterações')">🗑️</button>`;
    return `
      <div class="organize-map-card${forcePending ? ' organize-grid-card-map-pending' : ''}" data-map-id="${map.id}">
        <div class="organize-map-card-title">
          <span class="organize-map-drag-handle" title="Arraste pra mesclar com outro mapa">✥</span>
          <span class="organize-map-card-check" title="Marcar/desmarcar este mapa pra mesclagem">☐</span>
          <strong class="organize-map-card-name" title="${forcePending ? 'Este mapa tem uma exclusão pendente' : 'Clique pra renomear'}">🗺️ ${nome}</strong>
          <span class="organize-map-card-counts${(!itens.length && !fotos.length) ? ' organize-counts-zero' : ''}">📦 ${itens.length} patrimônio(s) · 🖼️ ${fotos.length} foto(s)</span>
          ${isEmpty ? '<span class="organize-map-card-emptytag">planta vazia</span>' : ''}
          ${headerBtnHtml}
        </div>
        <div class="organize-map-card-body">
          <div class="organize-map-col organize-map-col-itens">
            <div class="organize-item-list-head">
              ${this._sortOrbHtml(map.id)}
            </div>
            ${this._renderPatrimonioColumn(this._sortItensForDisplay(entry), fotos, map.id, forcePending)}
          </div>
          <div class="organize-map-col organize-map-col-mapa">
            <div class="organize-map-thumb-wrap" title="Dê 2 cliques (duplo-clique) pra abrir esta planta baixa">
              <canvas class="organize-map-thumb-canvas" data-map-id="${map.id}" width="260" height="180"></canvas>
              ${isEmpty ? '<div class="organize-map-thumb-emptyoverlay">planta vazia</div>' : ''}
            </div>
            <div class="organize-map-thumb-stats">
              🧱 ${this._drawnCount(map)} elemento(s) na planta · 📌 ${vinculadosNoMapa.length} vinculação(ões)
            </div>
            ${this._renderMapObjectsList(map)}
            ${this._renderMapVinculacoes(vinculadosNoMapa, map.id, forcePending)}
          </div>
          <div class="organize-map-col organize-map-col-fotos">
            ${this._renderFotosColumn(fotos, itens, forcePending)}
          </div>
        </div>
      </div>
    `;
  },

  /** `fotos` (novo — item 9 do feedback): "ao clicar em um patrimônio da
   *  lista à esquerda e tiver vinculação com uma foto, então, deve aparecer
   *  o destaque na posição relativa dessa foto." Decisão de interação
   *  tomada aqui (não especificada pelo usuário, documentada): o clique na
   *  LINHA inteira continua abrindo o editor do patrimônio (comportamento
   *  já existente, pedido de rodada anterior) — bom senso: destacar E abrir
   *  o editor no mesmo clique seria confuso (o editor cobre a tela, a
   *  pessoa nem veria o destaque). Em vez disso, quando o item tem um orb
   *  numa foto deste mapa, aparece um ícone extra "📷📍" na própria linha
   *  (mesmo padrão dos ícones "📍"/"🖼️" já existentes) — clicar SÓ nele
   *  (com stopPropagation, não abre o editor) rola até a foto e destaca a
   *  posição, igual ao clique nas "vinculações" da coluna de fotos. */
  // NOVO parâmetro `forcePending` (01/09/2026) — mesmo motivo/mesma correção
  // documentados em `_renderGridPatrimonios` (item 4 da rodada, exclusão do
  // MAPA inteiro sem piscada + todos os itens com visual de lápide).
  _renderPatrimonioColumn(itens, fotos, mapId, forcePending) {
    if (!itens.length) return `<p class="organize-col-empty">Nenhum patrimônio vinculado a este mapa.</p>`;
    const orbByItem = new Map();
    (fotos || []).forEach((f) => (f.orbs || []).forEach((o) => {
      if (o.itemId && !orbByItem.has(o.itemId)) orbByItem.set(o.itemId, { fotoId: f.id, xNorm: o.xNorm, yNorm: o.yNorm });
    }));
    // ITEM "orb de reordenar" (31/08/2026) — `itens` já chega ORDENADO (ver
    // `_sortItensForDisplay`, chamado no local onde este método é invocado).
    const sortMode = this._getSortMode(mapId);
    return `<div class="organize-item-list">${itens.map((it, i) => {
      // ITEM B3/B1 (31/08/2026) — mesmas flags de exclusão pendente lidas
      // pelo modo Grade (ver `_renderGridPatrimonios`); aqui no modo Cartões,
      // por ora, só reflete visualmente (botões de lixeira ficaram só na
      // Grade nesta rodada, ver comentário grande acima de `_mapDeleteColor`)
      // — importante pra não mostrar dado "morto" como se nada tivesse
      // acontecido ao trocar de modo de visualização.
      // CORRIGIDO (01/09/2026) — mesma correção de footprint da Grade (ver
      // comentário grande em `_renderGridPatrimonios`): reaproveita a MESMA
      // estrutura da linha normal (pinos/setinhas ganham uma versão
      // "fantasma", mesmo tamanho, inertes) em vez de uma versão reduzida
      // que mudava a forma da linha ao marcar exclusão.
      if (it.__pendingDelete || forcePending) {
        const orbInfoPendente = orbByItem.get(it.id);
        const reorderGhostHtml = sortMode === 'custom' ? `<span class="organize-reorder-btns organize-reorder-btns-ghost" aria-hidden="true">
          <span class="organize-reorder-btn">▲</span>
          <span class="organize-reorder-btn">▼</span>
        </span>` : '';
        // Mesma distinção documentada em `_renderGridPatrimonios`: sem
        // `it.__pendingDelete` próprio, é o MAPA que está pendente (o item só
        // desvincula, não é apagado) — sem botão de reverter individual (não
        // existe ação 'delete-item' pra reverter aqui).
        const titlePendente = it.__pendingDelete
          ? "Exclusão pendente — some de vez ao clicar em 'Aplicar alterações'"
          : "Este mapa será excluído — o patrimônio não é apagado, só perde a vinculação com ele";
        const undoHtml = it.__pendingDelete
          ? `<button type="button" class="organize-pending-undo-inline organize-pending-undo-inline-inflow" data-undo-type="delete-item" data-undo-id="${it.id}" title="Reverter esta exclusão pendente (deixa de estar marcado)">↩️</button>`
          : '';
        return `<div class="organize-item-row organize-pending-delete-plaquinha" data-item-id="${it.id}" title="${titlePendente}">
          <span class="organize-item-patr">${Utils.escapeHtml(it.patrimonio || '(sem número)')}</span>
          ${typeof it.mapaX === 'number' ? '<span class="organize-item-pin organize-plaquinha-photoicon-ghost" aria-hidden="true">📍</span>' : ''}
          ${it.fotoAnexadaId ? '<span class="organize-item-pin organize-plaquinha-photoicon-ghost" aria-hidden="true">🖼️</span>' : ''}
          ${orbInfoPendente ? '<span class="organize-item-pin organize-plaquinha-photoicon-ghost" aria-hidden="true">📷📍</span>' : ''}
          ${reorderGhostHtml}
          ${undoHtml}
        </div>`;
      }
      const orbInfo = orbByItem.get(it.id);
      const dup = this._isDupPatrimonio(it); // ITEM A14
      const corAfetado = it.__pendingDeleteColor;
      const styleAfetado = corAfetado ? ` style="--organize-affected-color:${corAfetado}"` : '';
      const reorderHtml = sortMode === 'custom' ? `<span class="organize-reorder-btns">
        <button type="button" class="organize-reorder-btn organize-reorder-prev" data-item-id="${it.id}" data-map-id="${mapId}" ${i === 0 ? 'disabled' : ''} title="Mover pra cima na ordem personalizada">▲</button>
        <button type="button" class="organize-reorder-btn organize-reorder-next" data-item-id="${it.id}" data-map-id="${mapId}" ${i === itens.length - 1 ? 'disabled' : ''} title="Mover pra baixo na ordem personalizada">▼</button>
      </span>` : '';
      return `
      <div class="organize-item-row${dup ? ' organize-item-row-dup' : ''}${corAfetado ? ' organize-plaquinha-affected' : ''}" data-item-id="${it.id}" title="${Utils.escapeHtml(it.descricao || '')}${dup ? ' (⚠️ número de patrimônio duplicado)' : ''}${corAfetado ? ' (⚠️ afetado por uma exclusão pendente neste mapa)' : ''} — clique pra editar, arraste pra mover pra outro mapa"${styleAfetado}>
        <span class="organize-item-patr">${Utils.escapeHtml(it.patrimonio || '(sem número)')}</span>
        ${typeof it.mapaX === 'number' ? '<span class="organize-item-pin" title="Vinculado a um ponto no mapa">📍</span>' : ''}
        ${it.fotoAnexadaId ? '<span class="organize-item-pin" title="Tem foto anexada">🖼️</span>' : ''}
        ${orbInfo ? `<span class="organize-item-pin organize-item-pin-fotoorb" data-foto-id="${orbInfo.fotoId}" data-x="${(orbInfo.xNorm * 100).toFixed(2)}" data-y="${(orbInfo.yNorm * 100).toFixed(2)}" title="Clique pra destacar a posição dele na foto vinculada">📷📍</span>` : ''}
        ${reorderHtml}
        <button type="button" class="organize-item-row-del-btn" data-item-id="${it.id}" title="Excluir este patrimônio (pendente até 'Aplicar alterações')">🗑️</button>
      </div>`;
    }).join('')}</div>`;
  },

  /** ITEM B6 (retomado 31/08/2026) — "vinculações do mapa devem aparecer
   *  listadas" (pedido original, rodada 52) + "cada vinculação entre
   *  patrimônio e planta baixa deve poder ser desfeita" (pedido gigante da
   *  rodada 57, dentro do bloco de exclusões). `data-item-id` + o botão "✂️"
   *  novos nesta rodada — mesmo padrão visual/de interação já usado pelas
   *  vinculações de FOTO (`_renderGridFotos`/`_unlinkItemFromFoto`).
   *  ATUALIZADO (01/09/2026) — `mapId` novo parâmetro: sem ele não dava pra
   *  consultar `_pendingUnlinkPlantaGhosts` (ver comentário grande lá) e a
   *  vinculação desvinculada pela tesourinha simplesmente sumia da lista em
   *  vez de virar "lápide", mesmo bug do item B3 já corrigido antes pros
   *  chips de foto. */
  /** NOVO (02/09/2026), pedido verbatim (rodada C): "Os objetos do mapa
   *  devem parecer em uma lista que deve ser expansível, pois pode haver
   *  muitos objetos." Antes, a única pista de quantos objetos uma planta
   *  tinha era o número agregado "🧱 N elemento(s) na planta"
   *  (`_drawnCount`, soma de paredes+objetos+portas+janelas+textos+trilha+
   *  câmeras — nunca uma LISTA, e nunca só "objetos"). Interpretação: o
   *  usuário quer os itens de `map.objects` especificamente (mesa, cadeira,
   *  luminária, poste etc. — o que se coloca pela ferramenta "Objetos" do
   *  mapa; NÃO paredes/portas/janelas, que são estrutura, não "objetos"),
   *  cada um com seu rótulo em português (`Icons.labelForAnyKey`, mesma
   *  função já usada pelo próprio mapview.js pra rotular objetos — ver
   *  js/icons.js). "Expansível" (pode haver MUITOS) implementado com
   *  `<details>`/`<summary>` nativos do HTML — sem JS de toggle próprio,
   *  acessível de graça (teclado/leitor de tela), fechado por padrão pra
   *  não poluir o cartão quando há muitos objetos; um clique no `<summary>`
   *  expande a lista completa. Presente nas DUAS visões (Cartões via
   *  `_mapCardHtml`, Grade via `_gridCardHtml`) — mesma função, chamada nos
   *  dois lugares, junto da linha de estatística "🧱 [...] · 📌 [...]" já
   *  existente. Objeto vinculado a patrimônio(s) (`o.itemIds`, ver
   *  `Mapping.addItemToObject`) ganha um selo "🔗N" pra indicar o vínculo,
   *  sem precisar abrir a planta pra saber. */
  // ATUALIZADO (02/09/2026, rodada D, item D11), pedido verbatim: "A 'lista
  // expansível de objetos do mapa' deve expandir, mostrando a lista de
  // objetos (um a um), com o botão de tesoura e as mesmas animações e
  // estilos." Antes cada linha era um `<div class="organize-map-obj-row">`
  // com CSS próprio, sem tesourinha — agora reaproveita literalmente as
  // classes `.organize-vinc-chip`/`.organize-vinc-chip-unlink` já usadas
  // pelas OUTRAS listas de vinculação do cartão (`_renderMapVinculacoes`/
  // `_vincChipHtml`), ganhando de graça o mesmo visual em "pílula" e a
  // mesma animação de hover (crescer/destacar, ver CSS de `.organize-vinc-
  // chip`) — "as mesmas animações e estilos", verbatim. A tesourinha (✂️,
  // só aparece se o objeto tiver algum patrimônio vinculado, `nVinc>0`)
  // desvincula TODOS os patrimônios associados àquele objeto de uma vez
  // (`Mapping.removeItemFromObject`, já existente — usado pelo painel 2D) —
  // simplificação deliberada: um objeto pode ter mais de 1 patrimônio
  // vinculado (`obj.itemIds`), e uma tesourinha por PATRIMÔNIO individual
  // dentro da mesma linha inflaria a UI pra um caso raro; ver `_wireGridMapaWrap`.
  // CORRIGIDO junto (mesma rodada) — causa raiz PROVÁVEL do "não expande"
  // relatado: `_refreshGridCardBody` (o patch cirúrgico usado depois de
  // QUALQUER exclusão/edição pendente) apagava tudo que vinha depois de
  // `.organize-map-thumb-stats` e reinserção só `_renderGridVinculacoesPlanta`
  // — o bloco `<details>` desta função nunca era reconstruído ali, sumindo
  // do cartão no primeiro refresh depois da 1ª renderização. Ver correção
  // em `_refreshGridCardBody`.
  _renderMapObjectsList(map) {
    const objetos = map.objects || [];
    if (!objetos.length) return '';
    const linhas = objetos.map((o) => {
      const label = window.Icons?.labelForAnyKey?.(o.tipo) || o.tipo || '(objeto)';
      const nVinc = (o.itemIds || []).length;
      const vinc = nVinc ? ` <span class="organize-map-obj-vinc" title="Vinculado a ${nVinc} patrimônio(s)">🔗${nVinc}</span>` : '';
      const tesoura = nVinc
        ? `<span class="organize-vinc-chip-unlink organize-map-obj-unlink" data-obj-id="${Utils.escapeHtml(o.id)}" title="Desvincular ${nVinc > 1 ? 'todos os patrimônios associados' : 'o patrimônio associado'} a este objeto">✂️</span>`
        : '';
      return `<span class="organize-vinc-chip organize-map-obj-chip" data-obj-id="${Utils.escapeHtml(o.id)}" title="${Utils.escapeHtml(label)}"><span class="organize-vinc-chip-label">📦 ${Utils.escapeHtml(label)}${vinc}</span>${tesoura}</span>`;
    }).join('');
    return `
      <details class="organize-map-objects-details">
        <summary class="organize-map-objects-summary">📦 ${objetos.length} objeto(s) na planta</summary>
        <div class="organize-vinc-list organize-map-objects-list">${linhas}</div>
      </details>`;
  },

  // NOVO parâmetro `forcePending` (01/09/2026) — item 4 da rodada: quando o
  // MAPA INTEIRO está com exclusão pendente, TODO chip usa o visual de
  // "lápide"/fantasma (mesmo sem ter sido desvinculado individualmente),
  // sem botão de tesourinha (não existe ação individual pra desfazer aqui —
  // reverter é feito pelo botão do MAPA).
  _renderMapVinculacoes(vinculadosNoMapa, mapId, forcePending) {
    const ghosts = this._pendingUnlinkPlantaGhosts(mapId);
    if (!vinculadosNoMapa.length && !ghosts.length) return '';
    // CORRIGIDO (01/09/2026), pedido verbatim (mesmo item da correção em
    // `_mergeOrbsWithGhosts`): antes os fantasmas eram sempre concatenados
    // no FINAL de `chipsHtml`. Aqui a posição original não precisa nem de
    // um índice guardado à parte — `entry.itens` NUNCA muda de ordem ao
    // desvincular da planta (`_unlinkItemFromPlanta` só zera `mapaX/Y`, não
    // mexe no array), então basta percorrer `entry.itens` na ordem natural
    // e desenhar chip real ou fantasma conforme o caso, em vez de montar
    // duas listas separadas e juntá-las.
    const ghostIds = new Set(ghosts.map((it) => it.id));
    const entry = this._maps.find((e) => e.map.id === mapId);
    const combined = entry ? entry.itens.filter((it) => typeof it.mapaX === 'number' || ghostIds.has(it.id)) : [...vinculadosNoMapa, ...ghosts];
    const chipsHtml = combined.map((it) => (ghostIds.has(it.id) || forcePending)
      ? `<span class="organize-vinc-chip organize-vinc-chip-map organize-vinc-chip-pending-delete" data-item-id="${it.id}" title="${ghostIds.has(it.id) ? "Desvinculado da planta baixa — pendente até 'Aplicar alterações'" : 'Este mapa será excluído'}"><span class="organize-vinc-chip-label">📍 ${Utils.escapeHtml(it.patrimonio || '(sem número)')}</span><span class="organize-vinc-chip-unlink-ghost" aria-hidden="true">✂️</span></span>`
      : `<span class="organize-vinc-chip organize-vinc-chip-map" data-item-id="${it.id}"><span class="organize-vinc-chip-label">📍 ${Utils.escapeHtml(it.patrimonio || '(sem número)')}</span><span class="organize-vinc-chip-unlink organize-vinc-chip-unlink-planta" data-item-id="${it.id}" title="Desvincular da planta baixa (pendente até 'Aplicar alterações')">✂️</span></span>`
    ).join('');
    return `<div class="organize-vinc-list" title="Vinculações de patrimônio com a planta baixa deste mapa — clique pra abrir a planta">
      ${chipsHtml}
    </div>`;
  },

  // NOVO parâmetro `forcePending` (01/09/2026) — item 4 da rodada: quando o
  // MAPA INTEIRO está com exclusão pendente, TODA foto usa o mesmo visual de
  // "lápide" já existente pra exclusão individual (as fotos SÃO mesmo
  // apagadas de verdade junto com o mapa — diferente dos patrimônios, que só
  // desvinculam — então reaproveitar a mensagem/visual de `f.__pendingDelete`
  // aqui é semanticamente correto, não só visual).
  _renderFotosColumn(fotos, itens, forcePending) {
    if (!fotos.length) return `<p class="organize-col-empty">Nenhuma foto vinculada a este mapa.</p>`;
    // ATUALIZADO (31/08/2026, item D) — `itemById` deixou de FILTRAR itens
    // com exclusão pendente (o que fazia o chip deles sumir de vez, ver
    // "ITEM B3" antigo removido) — agora inclui TODOS, pra resolver o
    // RÓTULO (patrimônio) tanto de chips normais quanto dos "fantasmas"
    // (ver `_pendingDeletedChipsForFoto`/`_vincChipHtml`).
    const itemById = new Map(itens.map((it) => [it.id, it]));
    return `<div class="organize-foto-list">${fotos.map((f) => {
      const orbsComItem = (f.orbs || []).filter((o) => o.itemId && itemById.has(o.itemId));
      // ITEM D — chips "fantasma" (patrimônio com exclusão pendente, orb já
      // removido de `f.orbs` por `_deleteItem` — ver comentário grande em
      // `_pendingDeletedChipsForFoto`).
      const ghostChips = this._pendingDeletedChipsForFoto(f.id);
      const nChips = orbsComItem.length + ghostChips.length;
      // `src` (01/09/2026, item 3 da rodada) — subida pra ANTES do `if`
      // abaixo (era calculada só no ramo "normal", mais embaixo): ver
      // comentário grande no ramo pendente logo abaixo, agora também
      // precisa dela pra desenhar a miniatura por baixo do preenchimento
      // vermelho transparente.
      const src = f.thumbDataUrl || f.dataUrl || '';
      // ITEM B10/B11 (CORRIGIDO 31/08/2026) — mesma correção do modo Grade
      // (ver comentário grande em `_renderGridFotos`): a "lápide" reusa o
      // MESMO esqueleto (nome + caixa do tamanho da miniatura + linha de
      // vinculações/medidas) da foto normal, só trocando o CONTEÚDO da
      // caixa da miniatura pelo aviso tracejado — garante o mesmo
      // footprint que a foto ocupava antes de ser marcada pra exclusão
      // ("a posição da foto deve permanecer", pedido verbatim).
      if (f.__pendingDelete || forcePending) {
        // O texto detalhado (quantas marcações/medidas vão junto) foi
        // movido pro `title` (tooltip) — o rótulo VISÍVEL precisa ficar
        // curto pra caber na caixa de tamanho FIXO (mesmo tamanho da
        // miniatura normal, ver comentário acima), mas a informação
        // continua disponível ao passar o mouse.
        const detalhe = [nChips ? `${nChips} marcação(ões)` : '', (f.medidas || []).length ? `${f.medidas.length} medida(s)` : ''].filter(Boolean).join(', ');
        // ITEM C/D — TODOS os chips (reais ou fantasma) ficam com o mesmo
        // visual de "lápide" aqui: a foto inteira já é que está pendente,
        // não faz sentido diferenciar um chip do outro.
        // CORRIGIDO (01/09/2026) — usa `_mergeOrbsWithGhosts` pra manter a
        // posição original dos fantasmas em vez de sempre empurrá-los pro
        // final (mesmo pedido documentado em `_mergeOrbsWithGhosts`).
        const chipsHtml = this._mergeOrbsWithGhosts(orbsComItem, ghostChips)
          .map((m) => this._vincChipHtml(m.itemId, itemById.get(m.itemId), { pending: true, title: m.real ? "Esta foto será excluída — a vinculação some junto" : m.title, undoType: m.real ? null : m.type, undoFotoId: f.id }))
          .join('');
        // `forcePending` sem `f.__pendingDelete` próprio = é o MAPA que está
        // pendente, não existe ação 'delete-foto' pra reverter aqui (some o
        // botão — reverter é feito pelo botão do MAPA, no cabeçalho).
        const undoFotoHtml = f.__pendingDelete ? this._inlineRevertBtnHtml('delete-foto', f.id) : '';
        return `
        <div class="organize-foto-item organize-pending-delete-foto" data-foto-id="${f.id}">
          <div class="organize-foto-name" title="'${Utils.escapeHtml(f.nome || '(sem nome)')}' será excluída ao aplicar as alterações">${Utils.escapeHtml(f.nome || '(sem nome)')}</div>
          <div class="organize-foto-thumb-wrap organize-pending-delete-box" title="'${Utils.escapeHtml(f.nome || '(sem nome)')}' será excluída${detalhe ? ` (${detalhe} junto)` : ''}">
            <!-- ITEM 3 (rodada B, 01/09/2026), pedido verbatim: "Sobre a
                 marcação da foto para exclusão, pode ficar como está
                 atualmente, só acrescente ela continuar a aparecer por
                 baixo do preenchimento vermelho transparente." A miniatura
                 real volta a aparecer (classe organize-pending-delete-
                 thumb-img, position:absolute/inset:0, camada de baixo) — o
                 preenchimento vermelho translúcido, que antes era o
                 background do PRÓPRIO organize-pending-delete-box, virou um
                 pseudo-elemento ::before por cima dela (ver CSS), pra
                 continuar visualmente "por cima" (tingindo a foto de
                 vermelho) sem esconder a foto de baixo. -->
            ${src ? `<img class="organize-pending-delete-thumb-img" src="${src}" alt="" loading="lazy">` : ''}
            <div class="organize-pending-delete-icon">🗑️📷</div>
            <div class="organize-pending-delete-label">exclusão pendente</div>
            <!-- CORRIGIDO (31/08/2026) — o botão voltou pra DENTRO do
                 thumb-wrap: agora que ele é position:absolute (ver CSS
                 .organize-pending-delete-box .organize-pending-undo-
                 inline), ficar fora não tinha mais motivo (o motivo
                 antigo — crescer a lápide em fluxo normal — não existe
                 mais) e ficar dentro é o que garante o "canto fixo" da
                 própria caixa. O clique de "selecionar foto" em
                 _wireFotoItems agora exclui .organize-pending-undo-
                 inline do closest(), então os 2 não disparam juntos. -->
            ${undoFotoHtml}
          </div>
          ${nChips ? `<div class="organize-vinc-list organize-vinc-list-sm">${chipsHtml}</div>` : '<p class="organize-col-empty organize-col-empty-sm">Sem patrimônio vinculado.</p>'}
          ${(f.medidas || []).length ? `<div class="organize-medidas-list organize-medidas-list-cartoes">
            ${(f.medidas || []).map((m, i) => this._medidaChipHtml(m, f.id, i, true)).join('')}
          </div>` : ''}
        </div>`;
      }
      // `src` (item 3 da rodada B) já foi calculada mais acima, ANTES do
      // `if` — reaproveitada aqui.
      // Item 7 do feedback ("ao ativar/desativar a exibição das bolinhas não
      // precisa recarregar tudo, os scrolls devem permanecer") — os
      // pontinhos agora SEMPRE vão pro DOM (não dependem mais de
      // `_showOrbsOnPhotos` aqui); quem controla se aparecem ou não é só
      // CSS (classe `organize-orbs-visible` no `_listEl`, com transição —
      // ver `#organize-toggle-orbs` em `_buildOverlay` e `.organize-foto-
      // orbdot` em style.css), então o toggle nunca mais passa por
      // `_renderList()`/reconstrução do DOM.
      // Item 6 (rodada 55/v309): `data-x-norm`/`data-y-norm` guardam a
      // posição normalizada (0..1) COM precisão total (não arredondada pra
      // %, como o `style.left/top` acima) — usados por `_openFotoAtOrb`
      // (clicar na própria bolinha) pra centralizar a vista na foto ABERTA
      // exatamente na posição do orb.
      // CORRIGIDO (31/08/2026) — bolinha "fantasma" (dashed/vermelha) por
      // cada `ghostChips`, mesmo motivo documentado em `_orbDotHtml`.
      const orbDots = orbsComItem.map((o) => this._orbDotHtml(o, itemById)).join('')
        + ghostChips.map((g) => this._orbDotHtml(g.orb, itemById, { pending: true })).join('');
      // Item 13 do feedback: "como agora é possível colocar medidas nas
      // fotos, também deve aparecer esta informação [...] logo acima" do
      // badge de vinculações (📍N). `photo.medidas` é o array populado por
      // AmbientePhotos._confirmMedidaDraft (ver ambientephotos.js ~461-465)
      // e persistido junto com o resto da foto via DB.saveAmbientePhoto —
      // mesmo objeto `f` usado aqui.
      const numMedidas = (f.medidas || []).length;
      // ITEM D — chips fantasma de patrimônios já removidos de `f.orbs`
      // (exclusão pendente do próprio item) aparecem misturados aos chips
      // normais desta foto ATIVA (não pendente), com visual de lápide.
      // CORRIGIDO (01/09/2026) — usa `_mergeOrbsWithGhosts` pra manter a
      // posição original (ver comentário grande lá).
      const chipsHtml = this._mergeOrbsWithGhosts(orbsComItem, ghostChips)
        .map((m) => m.real
          ? this._vincChipHtml(m.itemId, itemById.get(m.itemId), { xNorm: m.orb.xNorm, yNorm: m.orb.yNorm, fotoId: f.id })
          : this._vincChipHtml(m.itemId, itemById.get(m.itemId), { pending: true, title: m.title, undoType: m.type, undoFotoId: f.id }))
        .join('');
      return `
        <div class="organize-foto-item" data-foto-id="${f.id}">
          <div class="organize-foto-name" title="Clique pra renomear">${Utils.escapeHtml(f.nome || '(sem nome)')}</div>
          <div class="organize-foto-thumb-wrap">
            ${src ? `<img src="${src}" alt="" loading="lazy">` : '<div class="organize-foto-thumb-placeholder">🖼️</div>'}
            ${orbDots}
            ${numMedidas ? `<span class="organize-foto-badge organize-foto-badge-medidas">📏${numMedidas}</span>` : ''}
            ${f.orbs?.length ? `<span class="organize-foto-badge organize-foto-badge-vinc">📍${f.orbs.length}</span>` : ''}
            <button type="button" class="organize-foto-item-del-btn" data-foto-id="${f.id}" title="Excluir esta foto (pendente até 'Aplicar alterações')">🗑️</button>
          </div>
          ${nChips ? `<div class="organize-vinc-list organize-vinc-list-sm">${chipsHtml}</div>` : '<p class="organize-col-empty organize-col-empty-sm">Sem patrimônio vinculado.</p>'}
          ${(f.medidas || []).length ? `<div class="organize-medidas-list organize-medidas-list-cartoes">
            ${(f.medidas || []).map((m, i) => this._medidaChipHtml(m, f.id, i, false)).join('')}
          </div>` : ''}
        </div>`;
    }).join('')}</div>`;
  },

  // ---------------------------------------------------------------------
  // MODO 'grade' (item 4-9 do pedido v310) — ver comentário grande em
  // `_viewMode`, no topo do objeto, pro desenho completo da arquitetura.
  // ---------------------------------------------------------------------

  /** Troca entre 'cards' e 'grid' — mostra/esconde os 2 contêineres
   *  (`#organize-list-wrap`/`#organize-grid-wrap`), as ferramentas que só
   *  fazem sentido no modo Cartões (seleção/mesclagem — DECISÃO DE DESIGN:
   *  mesclar continua sendo uma operação do modo Cartões; a grade é sobre
   *  visualização/reposicionamento livre, não especificada pelo usuário
   *  como tendo mesclagem própria), e (re)desenha a grade na hora de entrar
   *  nela. Chamada também ao REABRIR a tela (`_buildOverlay`), pra
   *  sincronizar o DOM com o `_viewMode` já guardado da sessão anterior. */
  _setViewMode(mode) {
    if (mode !== 'cards' && mode !== 'grid') return;
    this._viewMode = mode;
    const cardsWrap = this._overlayEl?.querySelector('#organize-list-wrap');
    const gridWrap = this._overlayEl?.querySelector('#organize-grid-wrap');
    if (cardsWrap) cardsWrap.style.display = mode === 'cards' ? '' : 'none';
    if (gridWrap) gridWrap.classList.toggle('visible', mode === 'grid');
    this._overlayEl?.querySelectorAll('#organize-viewmode-group [data-viewmode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.viewmode === mode);
    });
    const toolset = this._overlayEl?.querySelector('#organize-toolset');
    const mergeBtn = this._overlayEl?.querySelector('#organize-merge-btn');
    const selCount = this._overlayEl?.querySelector('#organize-sel-count');
    [toolset, mergeBtn, selCount].forEach((elx) => { if (elx) elx.style.display = mode === 'cards' ? '' : 'none'; });
    // ITENS C14/C15 — só fazem sentido no modo Grade (snap de posição/
    // reorganização de cartões, algo que não existe no modo Cartões).
    const gridOnlyEls = [
      this._overlayEl?.querySelector('#organize-toggle-gridsnap'),
      this._overlayEl?.querySelector('#organize-autolayout-group'),
    ];
    gridOnlyEls.forEach((elx) => { if (elx) elx.style.display = mode === 'grid' ? '' : 'none'; });
    if (mode === 'grid') {
      this._renderGrid();
      this._applyGridTransform();
      this._startThumbnailQueue(); // desenha as miniaturas dos canvases da grade que acabaram de entrar no DOM
    }
    this._updateZoomLabel();
  },

  /** Rótulo "NN%" do cabeçalho — compartilhado pelos 2 modos (ver comentário
   *  grande em `_viewMode`), mostra o zoom do modo ATIVO no momento. */
  _updateZoomLabel() {
    const label = this._overlayEl?.querySelector('#organize-zoom-label');
    if (!label) return;
    const z = this._viewMode === 'grid' ? this._gridZoom : this._zoom;
    label.textContent = Math.round(z * 100) + '%';
  },

  /** Posição inicial (empilhada verticalmente, x=0) pra qualquer mapa que
   *  ainda não tenha uma entrada em `_gridPositions` — mapas já
   *  reposicionados pelo usuário NUNCA são movidos de volta aqui (só
   *  preenche o que falta). Ver ressalva sobre a altura de empilhamento
   *  (estimativa, não medida) em `_GRID_CARD_STACK_HEIGHT`. */
  _ensureGridDefaultPositions() {
    if (!this._gridPositions) this._gridPositions = {};
    let y = 0;
    for (const entry of this._maps) {
      const mapId = entry.map.id;
      if (!this._gridPositions[mapId]) this._gridPositions[mapId] = { x: 0, y };
      y += this._GRID_CARD_STACK_HEIGHT;
    }
  },

  /** ITEM C15 (rodada 57/v311), pedido do usuário verbatim: "deve haver um
   *  conjunto de botões para reorganizar. Quando clicado, vai para o nível
   *  de zoom mais afastado (onde tudo fica visível) e dispõe os cartões dos
   *  mapas de algum jeito. Botões: 'um abaixo do outro'; 'um ao lado do
   *  outro'; 'caber todos na tela (tetris)' (encaixa tudo, sem colocar um
   *  por cima do outro, com margem de distância entre um e outro)."
   *
   *  BUG CORRIGIDO (31/08/2026) — pedido do usuário: "No botão 'Caber
   *  todos na tela sem sobrepor (tetris)', ainda acaba por sobrepor algum
   *  mapas. É por isso que sua estrutura deve ser fixa, então, irá se
   *  saber as dimensões do bloco e poder encaixá-lo na grade sem
   *  sobrepor... A função que for usada para isso deve testar se um
   *  retângulo sobrepõe o outro em alguma parte." A versão anterior
   *  (documentada abaixo, mantida como explicação do que mudou) usava uma
   *  grade REGULAR com altura de célula ESTIMADA (`_GRID_CARD_STACK_
   *  HEIGHT`, um valor fixo) — qualquer cartão mais cheio que a média
   *  (muitos patrimônios/fotos, já que a LARGURA é fixa mas a ALTURA cresce
   *  livremente pra caber o conteúdo, ver `.organize-grid-card` em
   *  style.css) estourava essa estimativa e sobrepunha o vizinho de baixo.
   *
   *  CORRIGIDO medindo a altura REAL de cada cartão já renderizado
   *  (`card.offsetHeight` — não afetado pelo `transform: scale()` do zoom
   *  da grade, ao contrário de `getBoundingClientRect()`, que devolveria a
   *  altura JÁ multiplicada pelo zoom atual) e empacotando com um algoritmo
   *  "masonry" (colunas de largura fixa — `_GRID_CARD_W`, igual pra
   *  qualquer cartão — cada cartão cai na coluna com a MENOR altura
   *  acumulada até agora, logo abaixo do último cartão daquela coluna +
   *  margem). Como cada coluna empilha por ALTURA REAL medida (não uma
   *  altura de célula fixa), NENHUM cartão pode ficar sobreposto a outro
   *  na mesma coluna (a lógica é a mesma de testar sobreposição de
   *  retângulos ao longo do eixo Y: o próximo só começa onde o anterior
   *  termina + margem) — e como todas as colunas têm a MESMA largura fixa
   *  (`_GRID_CARD_W`), colunas diferentes nunca se sobrepõem no eixo X
   *  também. 'vstack'/'hstack' continuam sendo 1 coluna / 1 cartão por
   *  coluna (cada mapa numa coluna própria); só 'tetris' usa a escolha
   *  "coluna mais curta agora" (masonry de verdade, evita buracos grandes
   *  vazios que uma grade regular deixaria). Precisa que os cartões JÁ
   *  estejam no DOM pra medir de verdade — por isso troca pro modo Grade
   *  (ou redesenha, se já estiver nela) ANTES de medir/posicionar, não
   *  depois. */
  _autoLayoutGrid(mode) {
    if (!this._maps.length) return;
    if (this._viewMode !== 'grid') this._setViewMode('grid');
    else this._renderGrid();
    const MARGIN = 48;
    const n = this._maps.length;
    const canvas = this._overlayEl?.querySelector('#organize-grid-canvas');
    let cols;
    if (mode === 'vstack') cols = 1;
    else if (mode === 'hstack') cols = n;
    else cols = Math.max(1, Math.round(Math.sqrt(n))); // 'tetris' — número de colunas do masonry, formato aproximadamente quadrado
    // ATUALIZADO (31/08/2026, junto do item "retângulo cresce em vez de
    // encolher o conteúdo") — `.organize-grid-card` deixou de ter uma
    // largura ÚNICA fixa (`_GRID_CARD_W`, em `style=`) pra virar `width:
    // max-content` (CSS), então cartões DIFERENTES podem ter larguras REAIS
    // diferentes agora (nº de colunas de patrimônios escolhido por mapa,
    // ver `_getColCount`). O empacotamento passa a medir `card.offsetWidth`
    // REAL (mesmo espírito de já medir `card.offsetHeight` real, ver
    // comentário grande acima) em 2 passadas: a 1ª decide em qual COLUNA
    // cada cartão cai e sua altura Y (igual a antes), guardando a MAIOR
    // largura vista em cada coluna; a 2ª usa essa largura máxima por coluna
    // pra calcular o X de cada coluna (`colX`), garantindo que 2 colunas
    // nunca se sobrepõem no eixo X mesmo quando os cartões de uma coluna têm
    // larguras diferentes entre si (o cartão mais estreito fica alinhado à
    // esquerda dentro da "faixa" da coluna, que tem a largura do mais largo).
    const colHeights = new Array(cols).fill(0);
    const colWidths = new Array(cols).fill(0);
    const assign = [];
    this._maps.forEach((entry, i) => {
      const card = canvas?.querySelector(`.organize-grid-card[data-map-id="${entry.map.id}"]`);
      const realH = card ? card.offsetHeight : this._GRID_CARD_STACK_HEIGHT; // fallback só se o cartão não existir no DOM por algum motivo
      const realW = card ? card.offsetWidth : this._GRID_CARD_W; // idem, fallback só antes do 1º render
      let col;
      if (mode === 'tetris') {
        // Masonry: escolhe a coluna com a MENOR altura acumulada até agora
        // (empate — todas em 0 no início — fica com a de menor índice, o
        // que já distribui da esquerda pra direita naturalmente).
        col = 0;
        for (let c = 1; c < cols; c++) { if (colHeights[c] < colHeights[col]) col = c; }
      } else {
        col = i % cols; // vstack (cols=1, sempre a mesma coluna) / hstack (cols=n, uma coluna nova por mapa)
      }
      assign.push({ entry, col, y: colHeights[col] });
      colHeights[col] += realH + MARGIN;
      colWidths[col] = Math.max(colWidths[col], realW);
    });
    const colX = new Array(cols).fill(0);
    for (let c = 1; c < cols; c++) colX[c] = colX[c - 1] + colWidths[c - 1] + MARGIN;
    assign.forEach(({ entry, col, y }) => {
      const pos = { x: colX[col], y };
      this._gridPositions[entry.map.id] = pos;
      const card = canvas?.querySelector(`.organize-grid-card[data-map-id="${entry.map.id}"]`);
      if (card) { card.style.left = pos.x + 'px'; card.style.top = pos.y + 'px'; }
    });
    this._gridFitToContent();
  },

  /** Ajusta zoom/pan da grade pra caber TODOS os cartões na tela ("nível de
   *  zoom mais afastado, onde tudo fica visível" — pedido do usuário em
   *  C15).
   *
   *  ATUALIZAÇÃO (31/08/2026, mesmo pedido da correção do "tetris" acima):
   *  agora mede a altura REAL de cada cartão já renderizado no DOM
   *  (`offsetHeight`, quando o cartão existe) em vez de uma altura de
   *  célula fixa estimada — senão o enquadramento (zoom/pan calculado
   *  aqui) ficava incoerente com o novo posicionamento medido de
   *  `_autoLayoutGrid` (cartões cheios sobrando pra fora da área
   *  calculada, ou espaço vazio sobrando à toa). Cai de volta pra
   *  `_GRID_CARD_STACK_HEIGHT` (estimativa) só quando o cartão daquele
   *  mapa ainda não existe no DOM (grade nunca foi desenhada nesta
   *  sessão). */
  _gridFitToContent() {
    const viewport = this._overlayEl?.querySelector('#organize-grid-viewport');
    if (!viewport || !this._maps.length) return;
    const canvas = this._overlayEl?.querySelector('#organize-grid-canvas');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this._maps.forEach((entry) => {
      const p = this._gridPositions[entry.map.id] || { x: 0, y: 0 };
      const card = canvas?.querySelector(`.organize-grid-card[data-map-id="${entry.map.id}"]`);
      const h = card ? card.offsetHeight : this._GRID_CARD_STACK_HEIGHT;
      const w = card ? card.offsetWidth : this._GRID_CARD_W; // ver comentário grande em `_autoLayoutGrid` (largura agora é REAL/por cartão, não mais um valor único fixo)
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + w); maxY = Math.max(maxY, p.y + h);
    });
    const rect = viewport.getBoundingClientRect();
    const contentW = Math.max(1, maxX - minX), contentH = Math.max(1, maxY - minY);
    const PAD = 60;
    let zoom = Math.min((rect.width - PAD) / contentW, (rect.height - PAD) / contentH);
    zoom = Math.max(this._GRID_ZOOM_MIN, Math.min(this._GRID_ZOOM_MAX, zoom));
    this._gridZoom = zoom;
    this._gridPan.x = (rect.width - contentW * zoom) / 2 - minX * zoom;
    this._gridPan.y = (rect.height - contentH * zoom) / 2 - minY * zoom;
    this._applyGridTransform();
  },

  /** `transform: translate(pan) scale(zoom)` no canvas da grade — MESMA
   *  técnica de pan/zoom via CSS transform usada pela grade do Mapa 2D
   *  (adaptada aqui pra um container de `<div>`s, não um `<canvas>` único —
   *  ver comentário grande em `_viewMode`). Também alterna a classe que
   *  encolhe plaquinha→bolinha em zoom baixo (ver `_GRID_ZOOM_PLAQUINHA_
   *  THRESHOLD`) e atualiza o rótulo "NN%" do cabeçalho.
   *
   *  DECISÃO DE ESCOPO "nitidez ao ampliar" (31/08/2026) — pedido do
   *  usuário verbatim: "Ao ampliar as coisas estão embaçadas, mesmo os
   *  elementos HTML que deveriam renderizar nitidamente conforme o nível
   *  de zoom." A causa PRINCIPAL identificada (a grade de pontos de fundo
   *  sendo esticada como imagem, dando a sensação de borrão geral) foi
   *  corrigida nesta mesma rodada (ver `_drawGridBackground`). Pra
   *  eliminar TAMBÉM o borrão residual do TEXTO das plaquinhas/nomes ao
   *  ampliar seria preciso trocar o mecanismo de zoom da Grade inteira de
   *  `transform: scale()` (que é só uma operação de PINTURA — o navegador
   *  compõe 1 bitmap e o estica, podendo ficar borrado em zooms altos) pro
   *  `zoom:` do CSS (que é uma operação de LAYOUT/relayout — cada elemento
   *  é recalculado e RE-RASTERIZADO na escala nova, sempre nítido — é
   *  exatamente essa a técnica que o modo CARTÕES já usa com sucesso, ver
   *  `.organize-list { zoom: var(--organize-zoom) }`). NÃO aplicado aqui:
   *  a Grade usa `transform: translate(pan) scale(zoom)` (não só `scale`)
   *  porque o PAN também precisa ser uma operação barata de pintura (senão
   *  arrastar recalcularia o layout de dezenas de cartões a cada
   *  `pointermove`, pesado); toda a matemática de zoom-no-cursor, arrasto
   *  de cartão, drag da planta-baixa-ao-vivo etc. (`_wireGridPanZoom`/
   *  `_wireGridCardDrag`/`_wireGridLiveMap`) assume as fórmulas de
   *  `transform: scale()` (`tela = mundo*zoom + pan`) — trocar por `zoom:`
   *  exigiria rederivar e RETESTAR essa matemática inteira sem garantia
   *  de que as 2 propriedades compõem do mesmo jeito quando combinadas
   *  (risco real de quebrar pan/zoom/drag, hoje testados e funcionando).
   *  Escolha consciente (autorizada pelo usuário a tomar a melhor decisão
   *  e prosseguir): resolver a causa mais visível do embaçamento (a grade
   *  de pontos) agora, sem arriscar a reescrita completa do motor de pan/
   *  zoom só pelo ganho de nitidez do texto — documentado aqui como
   *  trabalho futuro, não como pedido ignorado. */
  _applyGridTransform() {
    const canvas = this._overlayEl?.querySelector('#organize-grid-canvas');
    if (!canvas) return;
    canvas.style.transform = `translate(${this._gridPan.x}px, ${this._gridPan.y}px) scale(${this._gridZoom})`;
    canvas.classList.toggle('organize-grid-zoomed-out', this._gridZoom < this._GRID_ZOOM_PLAQUINHA_THRESHOLD);
    // ITEM "grade de pontos em canvas de verdade" (31/08/2026) — antes,
    // aqui só se recalculava o MULTIPLICADOR (potência de 10) e escrevia
    // numa variável CSS que uma imagem de fundo (`::before`) consumia,
    // deixando o CANVAS DE VERDADE (`#organize-grid-bgcanvas`) redesenhar
    // do zero a cada pan/zoom — ver comentário grande em
    // `_drawGridBackground` logo abaixo pro motivo completo da troca.
    this._drawGridBackground();
    this._updateZoomLabel();
  },

  /** ITEM "revise a grade de pontos/linhas [...] consulte o código usado
   *  para desenhar a grade do mapa 2D. É para ser do mesmo jeito" (pedido
   *  do usuário, 31/08/2026, revisão da rodada anterior). Antes, esta
   *  função e `_gridLineStepCells` (então chamada `_gridDotStepMultiplier`)
   *  já desenhavam num `<canvas>` de verdade (corrigindo o "esticamento"),
   *  mas com uma fórmula PRÓPRIA (limiar arbitrário de "60 células",
   *  `Math.max(0,n)` nunca deixando a grade ficar mais fina que a base) —
   *  parecida, mas NÃO idêntica à do Mapa 2D de verdade. Reescrita aqui pra
   *  espelhar `Map2DRenderer._drawWorldGrid`/`_gridLineStepMeters`
   *  (mapview.js) PASSO A PASSO, trocando só o domínio (lá é METROS de
   *  mundo do mapa; aqui é "células" de 24px de mundo do Organizar —
   *  `BASE_CELL_PX`, o equivalente ao "1 metro" de lá):
   *  - `ratio = larguraVisível / (BASE_CELL_PX * zoom)` — quantas células
   *    BASE cabem na largura visível (idêntico a `dispW/pxPerMeter` lá).
   *  - `n = Math.floor(Math.log10(ratio))`, sem `Math.max(0,n)` — igual
   *    lá, PODE dar negativo (grade mais FINA que a base, zoom bem
   *    aproximado) — "cobre as duas direções (zoom in E out) com uma única
   *    conta" (comentário original de `_gridLineStepMeters`, mantido
   *    verdadeiro aqui também agora).
   *  - `lineStepCells = 10^n` (linhas), `dotStepCells = lineStepCells/10`
   *    (pontos) — exatamente a mesma relação 10x lá.
   *  - Raio do ponto ESCALA um pouco com o espaçamento (`Math.min(1.2,
   *    dotStepPx*0.12)`), IGUAL à fórmula de lá — não é mais um raio fixo
   *    arbitrário (1.5px) inventado aqui; é a mesma conta do Mapa 2D.
   *  - Pontos só desenhados se `dotStepPx >= 3` (mesmo limiar de lá);
   *    linhas desenhadas sempre que `lineStepPx >= 1` (mesmo limiar de
   *    lá) — sem o limiar extra de "8px" que existia aqui antes.
   *  - Cores idênticas às do Mapa 2D (`#404245` pontos, `#6c6e70` linhas —
   *    lá o fundo do canvas é `#0a0d11`, bem próximo do fundo escuro da
   *    Grade do Organizar, então o mesmo par de cores funciona igual aqui).
   *  `pan`/`zoom` fazem o papel de `worldToScreen`/`view.zoom` de lá (a
   *  fórmulade onde o ponto de mundo (0,0) cai na tela é a mesma:
   *  `tela = mundo*zoom + pan`). */
  _drawGridBackground() {
    if (this._viewMode !== 'grid') return;
    const bgCanvas = this._overlayEl?.querySelector('#organize-grid-bgcanvas');
    const viewport = this._overlayEl?.querySelector('#organize-grid-viewport');
    if (!bgCanvas || !viewport) return;
    const cw = viewport.clientWidth, ch = viewport.clientHeight;
    if (!cw || !ch) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pxW = Math.round(cw * dpr), pxH = Math.round(ch * dpr);
    if (bgCanvas.width !== pxW || bgCanvas.height !== pxH) { bgCanvas.width = pxW; bgCanvas.height = pxH; }
    const ctx = bgCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const zoom = this._gridZoom, pan = this._gridPan;
    const lineStepCells = this._gridLineStepCells();
    const BASE_CELL_PX = 24;
    const dotStepCells = lineStepCells / 10;
    const lineStepPx = lineStepCells * BASE_CELL_PX * zoom;
    const dotStepPx = dotStepCells * BASE_CELL_PX * zoom;
    if (!isFinite(lineStepPx) || lineStepPx < 1) return;

    // Subgrade de PONTOS — mesma ordem de desenho do Mapa 2D (pontos
    // primeiro, "por baixo" das linhas maiores).
    if (dotStepPx >= 3) {
      ctx.fillStyle = '#404245';
      const r = Math.min(1.2, dotStepPx * 0.12);
      const offX = ((pan.x % dotStepPx) + dotStepPx) % dotStepPx;
      const offY = ((pan.y % dotStepPx) + dotStepPx) % dotStepPx;
      for (let x = offX; x < cw + dotStepPx; x += dotStepPx) {
        for (let y = offY; y < ch + dotStepPx; y += dotStepPx) {
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
    }
    // Grade de LINHAS (tracejada [1,4]) — mesmo passo/cor/estilo do Mapa 2D.
    ctx.strokeStyle = '#6c6e70';
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 4]);
    const offXL = ((pan.x % lineStepPx) + lineStepPx) % lineStepPx;
    const offYL = ((pan.y % lineStepPx) + lineStepPx) % lineStepPx;
    ctx.beginPath();
    for (let x = offXL; x < cw + lineStepPx; x += lineStepPx) { ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
    for (let y = offYL; y < ch + lineStepPx; y += lineStepPx) { ctx.moveTo(0, y); ctx.lineTo(cw, y); }
    ctx.stroke();
    ctx.setLineDash([]);
  },

  /** Passo da grade de linhas, em "células" de `BASE_CELL_PX` (24px de
   *  mundo do Organizar) — MESMA fórmula fechada, linha por linha, de
   *  `Map2DRenderer._gridLineStepMeters()` (mapview.js, mapa 2D de
   *  verdade), só trocando o domínio (lá metros, aqui células de 24px —
   *  ver comentário grande em `_drawGridBackground` pro detalhe completo
   *  da revisão de 31/08/2026 que trocou esta função, antes chamada
   *  `_gridDotStepMultiplier` com uma fórmula própria, por esta réplica
   *  fiel). */
  _gridLineStepCells() {
    const viewport = this._overlayEl?.querySelector('#organize-grid-viewport');
    const dispW = viewport?.clientWidth || 1400;
    const zoom = this._gridZoom;
    const BASE_CELL_PX = 24;
    if (!zoom || zoom <= 0) return 1;
    const ratio = dispW / (BASE_CELL_PX * zoom); // quantas células BASE cabem na largura visível — mesma conta de `dispW/pxPerMeter` em `_gridLineStepMeters`
    if (!isFinite(ratio) || ratio <= 0) return 1;
    const n = Math.floor(Math.log10(ratio));
    return Math.pow(10, n);
  },

  /** Zoom em torno de um ponto de TELA (`screenPoint` — se omitido, usa o
   *  centro do viewport), mantendo o ponto de CONTEÚDO sob esse pixel fixo
   *  (mesma matemática padrão de "zoom no cursor"). `dir` > 0 amplia, < 0
   *  reduz — usado pelos botões de zoom do cabeçalho (`_buildOverlay`) e
   *  pela roda do mouse (`_wireGridPanZoom`). */
  _gridZoomStep(dir, screenPoint) {
    const factor = dir > 0 ? 1.15 : 1 / 1.15;
    this._gridZoomTo(this._gridZoom * factor, screenPoint);
  },

  _gridZoomTo(newZoom, screenPoint) {
    const viewport = this._overlayEl?.querySelector('#organize-grid-viewport');
    if (!viewport) return;
    newZoom = Math.max(this._GRID_ZOOM_MIN, Math.min(this._GRID_ZOOM_MAX, newZoom));
    const rect = viewport.getBoundingClientRect();
    const sp = screenPoint || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const oldZoom = this._gridZoom || 1;
    const contentX = (sp.x - rect.left - this._gridPan.x) / oldZoom;
    const contentY = (sp.y - rect.top - this._gridPan.y) / oldZoom;
    this._gridZoom = newZoom;
    this._gridPan.x = (sp.x - rect.left) - contentX * newZoom;
    this._gridPan.y = (sp.y - rect.top) - contentY * newZoom;
    this._applyGridTransform();
  },

  /** Liga pan (arrastar o FUNDO da grade) + zoom (roda do mouse) no
   *  viewport — chamado 1 vez em `_buildOverlay` (mesmo ciclo de vida dos
   *  outros listeners montados ali, removidos junto com o overlay inteiro
   *  em `close()`, então nunca duplica). Arrastar um CARTÃO (não o fundo) é
   *  tratado à parte, por cartão, em `_wireGridCardDrag` — aqui só ignora o
   *  pointerdown quando o alvo já está dentro de um `.organize-grid-card`. */
  _wireGridPanZoom() {
    const viewport = this._overlayEl?.querySelector('#organize-grid-viewport');
    if (!viewport) return;
    // BUG CORRIGIDO (31/08/2026) — pedido do usuário: "Está travando ao
    // variar o nível de zoom rapidamente. Otimize o desenho de modo que
    // não trave, mesmo com dezenas de mapas, centenas de fotos e milhares
    // de patrimônios." CAUSA: cada evento 'wheel' chamava `_gridZoomStep`
    // (que recalcula pan/zoom e escreve no DOM via `_applyGridTransform`)
    // de forma SÍNCRONA e IMEDIATA — uma roda de mouse/trackpad "rápida"
    // dispara dezenas de eventos 'wheel' por segundo, e com uma grade
    // pesada (dezenas de cartões, cada um com centenas de patrimônios/fotos
    // — muitos nós de DOM), o navegador não conseguia processar/pintar tudo
    // isso a tempo, empilhando eventos e "travando" a interação por um
    // instante. Corrigido acumulando os deltas de todos os eventos 'wheel'
    // que chegarem dentro do MESMO quadro e aplicando o zoom (uma vez só,
    // já com o total acumulado) dentro de um `requestAnimationFrame` — no
    // máximo 1 atualização de verdade por quadro (~60/s), não 1 por evento
    // de roda (que pode ser bem mais que isso). O ponto de ancoragem
    // (`screenPoint`) usa a posição do ÚLTIMO evento acumulado no quadro,
    // pra continuar ancorando no cursor com precisão. */
    let wheelAccum = 0;
    let wheelPoint = null;
    let wheelRAF = null;
    const flushWheel = () => {
      wheelRAF = null;
      if (!wheelAccum) return;
      this._gridZoomStep(wheelAccum > 0 ? 1 : -1, wheelPoint);
      wheelAccum = 0;
    };
    viewport.addEventListener('wheel', (e) => {
      if (this._viewMode !== 'grid') return;
      e.preventDefault();
      wheelAccum += (e.deltaY < 0 ? 1 : -1);
      wheelPoint = { x: e.clientX, y: e.clientY };
      if (!wheelRAF) wheelRAF = requestAnimationFrame(flushWheel);
    }, { passive: false });
    let panDrag = null;
    // ITEM A3 (rodada 57/v311), verbatim: "o botão do meio do mouse sempre
    // deve mover a grade toda independente de onde for clicado [...] se
    // está em cima de um mapa acaba por não mover a grade." Antes, este
    // handler ignorava QUALQUER pointerdown que caísse dentro de um
    // `.organize-grid-card` (pra não atrapalhar o clique/arrasto do
    // cartão) — mas isso também bloqueava o botão do meio, que deveria
    // SEMPRE ser pan, não importa o alvo. Corrigido: só ignora quando o
    // alvo é um cartão E o botão NÃO é o do meio (`e.button === 1`).
    viewport.addEventListener('pointerdown', (e) => {
      const overCard = e.target.closest('.organize-grid-card');
      if (overCard && e.button !== 1) return;
      // ITEM A2, verbatim: "ao arrastar, acaba selecionando [...] desabilite
      // a seleção nativa do navegador."
      e.preventDefault();
      panDrag = { startX: e.clientX, startY: e.clientY, pan0: { ...this._gridPan } };
      viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!panDrag) return;
      e.preventDefault();
      this._gridPan.x = panDrag.pan0.x + (e.clientX - panDrag.startX);
      this._gridPan.y = panDrag.pan0.y + (e.clientY - panDrag.startY);
      this._applyGridTransform();
    });
    const endPan = () => { panDrag = null; };
    viewport.addEventListener('pointerup', endPan);
    viewport.addEventListener('pointercancel', endPan);
    // Botão do meio abre o autoscroll padrão do navegador em muitos casos —
    // como já tratamos o botão do meio como pan de verdade acima, evitamos
    // o ícone/scroll nativo concorrendo com o nosso.
    viewport.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
  },

  /** Arrastar a alcinha "✥" de UM cartão da grade — move só a posição
   *  DAQUELE mapa em `_gridPositions` (dividindo o delta de tela pelo zoom
   *  atual, pra mover na mesma velocidade visual do cursor não importa o
   *  zoom). Listeners de move/up ficam na PRÓPRIA alça (via
   *  `setPointerCapture`), removidos no `pointerup`/`pointercancel` — sem
   *  depender de `document`, então nada fica pendurado entre uma
   *  reconstrução da grade e outra (`_renderGrid` recria os cartões do
   *  zero a cada chamada). */
  /** ITEM A5 (rodada 57/v311), verbatim: "ao clicar (em um nível de zoom),
   *  variar o zoom e arrastar (já em outro nível de zoom), o mapa acaba por
   *  não ficar mais na região relativa em que foi clicado em relação ao
   *  cursor." BUG REAL identificado: a versão anterior calculava a posição
   *  a cada `pointermove` como `pos0 + (delta TOTAL desde o início do
   *  arrasto) / zoom ATUAL` — se o zoom mudar NO MEIO do arrasto (ex.: a
   *  pessoa gira a roda do mouse sem soltar o cartão), o delta acumulado
   *  desde o início passa a ser dividido por um zoom diferente do que
   *  estava valendo quando aquele deslocamento realmente aconteceu,
   *  fazendo o cartão "pular" pra longe do cursor no instante exato da
   *  mudança de zoom. Corrigido: em vez de um delta TOTAL desde o início,
   *  cada `pointermove` aplica só o delta INCREMENTAL desde o frame
   *  anterior (dividido pelo zoom EM VIGOR naquele frame) — o "último X/Y
   *  de tela" e a posição do cartão são atualizados a cada passo, então uma
   *  mudança de zoom no meio do caminho só afeta os deltas SEGUINTES, nunca
   *  recalcula o passado. */
  _wireGridCardDrag(card, mapId) {
    const handle = card.querySelector('.organize-grid-card-draghandle');
    if (!handle) return;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button === 1) return; // ITEM A3 — botão do meio nunca inicia este drag, sempre vira pan (ver `_wireGridPanZoom`)
      e.preventDefault(); // ITEM A2 — sem seleção nativa de texto durante o arrasto
      e.stopPropagation();
      let lastX = e.clientX, lastY = e.clientY;
      let pos = { ...(this._gridPositions[mapId] || { x: 0, y: 0 }) };
      handle.setPointerCapture(e.pointerId);
      card.classList.add('organize-grid-card-dragging');
      const onMove = (ev) => {
        const z = this._gridZoom || 1;
        pos = { x: pos.x + (ev.clientX - lastX) / z, y: pos.y + (ev.clientY - lastY) / z };
        lastX = ev.clientX; lastY = ev.clientY;
        this._gridPositions[mapId] = pos;
        card.style.left = pos.x + 'px';
        card.style.top = pos.y + 'px';
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        card.classList.remove('organize-grid-card-dragging');
        this._applyGridSnap(mapId, card);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
  },

  /** ITEM A4 (rodada 57/v311), verbatim: "toda a região do retângulo do
   *  mapa deve ser para clicar nele e arrastá-lo. Exceto quando em cima de
   *  um patrimônio, foto ou planta baixa. Todo o restante [...] serve para
   *  clicar e mover o mapa, não só no canto." Reaproveita EXATAMENTE a
   *  mesma lógica incremental de `_wireGridCardDrag` (mesmo bug A5 já
   *  corrigido ali) — só muda ONDE o pointerdown é escutado (o cartão
   *  inteiro) e quais alvos são EXCLUÍDOS (plaquinha/foto/planta baixa/
   *  nome/botões — cada um já trata o próprio clique). */
  _wireGridCardBackgroundDrag(card, mapId) {
    // ITEM B6 (31/08/2026) — `.organize-vinc-chip-map` (lista de vinculações
    // com a planta baixa, `_renderGridVinculacoesPlanta`, nova) faltava
    // nesta lista: sem ela, o `pointerdown` no chip (ou na tesourinha "✂️"
    // dele) era capturado pelo drag do CARTÃO INTEIRO (`setPointerCapture`
    // abaixo) ANTES de chegar no clique de verdade — MESMO bug já corrigido
    // uma vez nesta tela (ver bug 2 no cabeçalho do arquivo: "Seleção pelo
    // checkbox/clique não funcionava... pointer capture RETARGETA os
    // eventos seguintes"), reencontrado agora num elemento novo que não
    // tinha sido somado à exclusão. Achado testando com Playwright:
    // `page.click()` (clique de verdade, com pointerdown/up de verdade)
    // reportava sucesso mas nada acontecia — só `el.click()` via JS (que
    // pula o pointerdown) funcionava, sinal claro de retargeting.
    // CORRIGIDO (02/09/2026, rodada D, item D11) — REGRESSÃO REAL achada na
    // verificação empírica com Playwright do item 8 (lista expansível de
    // objetos): `.organize-map-objects-details` (o `<details>` inteiro —
    // cobre o `<summary>` E a tesourinha `.organize-map-obj-unlink` de cada
    // linha, já que `e.target.closest(EXCLUDE_SEL)` sobe até qualquer
    // ancestral) faltava aqui — MESMO bug já documentado acima (item B6,
    // 31/08/2026) num elemento anterior (`.organize-vinc-chip-map`):
    // qualquer `pointerdown` dentro do `<details>` era capturado primeiro
    // pelo arrasto do CARTÃO INTEIRO (`e.preventDefault()` + `setPointer
    // Capture` logo abaixo), impedindo tanto o toggle nativo do `<summary>`
    // (o `preventDefault` no `pointerdown` cancela a ação padrão do clique
    // seguinte) quanto o clique na tesourinha (retargetada pro cartão, mesmo
    // sintoma do bug 2 do cabeçalho do arquivo). Testado clicando de
    // verdade (`page.mouse.click`, não `el.click()` via JS, que pula o
    // pointerdown e mascara o bug — mesma lição já registrada no comentário
    // de `.organize-vinc-chip-map` acima).
    const EXCLUDE_SEL = '.organize-plaquinha, .organize-grid-foto-item, .organize-map-thumb-wrap, .organize-vinc-chip-map, .organize-map-objects-details, .organize-grid-card-name, .organize-map-export-btn, .organize-grid-card-draghandle, input, button';
    card.addEventListener('pointerdown', (e) => {
      if (e.button === 1) return; // ITEM A3 — vira pan da grade (bolha pro viewport)
      if (e.button !== 0) return;
      if (e.target.closest(EXCLUDE_SEL)) return;
      e.preventDefault(); // ITEM A2
      let lastX = e.clientX, lastY = e.clientY;
      let pos = { ...(this._gridPositions[mapId] || { x: 0, y: 0 }) };
      card.setPointerCapture(e.pointerId);
      card.classList.add('organize-grid-card-dragging');
      const onMove = (ev) => {
        const z = this._gridZoom || 1;
        pos = { x: pos.x + (ev.clientX - lastX) / z, y: pos.y + (ev.clientY - lastY) / z };
        lastX = ev.clientX; lastY = ev.clientY;
        this._gridPositions[mapId] = pos;
        card.style.left = pos.x + 'px';
        card.style.top = pos.y + 'px';
      };
      const onUp = () => {
        card.removeEventListener('pointermove', onMove);
        card.removeEventListener('pointerup', onUp);
        card.removeEventListener('pointercancel', onUp);
        card.classList.remove('organize-grid-card-dragging');
        this._applyGridSnap(mapId, card);
      };
      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerup', onUp);
      card.addEventListener('pointercancel', onUp);
    });
  },

  /** ITEM C14 (rodada 57/v311), verbatim: "deve ser possível dar um snap na
   *  grade dos objetos (mapas), habilitável no cabeçalho." Implementado de
   *  forma OBJETIVA e simples: arredonda a posição final (só ao SOLTAR, não
   *  durante o arrasto — pra não "tremer" visualmente enquanto arrasta) pro
   *  múltiplo mais próximo de `_GRID_SNAP_SIZE` px, quando `_gridSnapAtivo`
   *  estiver ligado (toggle no cabeçalho — ver `_buildOverlay`). */
  _applyGridSnap(mapId, card) {
    if (!this._gridSnapAtivo) return;
    const size = this._GRID_SNAP_SIZE;
    const pos = this._gridPositions[mapId];
    if (!pos) return;
    const snapped = { x: Math.round(pos.x / size) * size, y: Math.round(pos.y / size) * size };
    this._gridPositions[mapId] = snapped;
    card.style.left = snapped.x + 'px';
    card.style.top = snapped.y + 'px';
  },

  /** Redesenha a grade inteira a partir de `this._maps` (mesmo cache do
   *  modo cartões) — chamado sempre que `_renderList()` roda (ver
   *  comentário grande lá) e ao entrar no modo grade (`_setViewMode`). */
  _renderGrid() {
    const canvas = this._overlayEl?.querySelector('#organize-grid-canvas');
    if (!canvas) return;
    this._ensureGridDefaultPositions();
    if (!this._maps.length) {
      canvas.innerHTML = `<p class="organize-empty-msg">Nenhum mapa ainda. Crie um em "Mapa" pra ele aparecer aqui.</p>`;
      return;
    }
    canvas.innerHTML = this._maps.map((entry) => this._gridCardHtml(entry)).join('');
    canvas.classList.toggle('organize-orbs-visible', this._showOrbsOnPhotos);
    canvas.classList.toggle('organize-grid-zoomed-out', this._gridZoom < this._GRID_ZOOM_PLAQUINHA_THRESHOLD);
    this._maps.forEach((entry) => this._wireGridCard(entry));
  },

  /** REMOVIDO (01/09/2026), pedido verbatim: "Ao clicar para excluir o
   *  mapa, não deve dar essa piscada e deve mostrar todos os seus itens com
   *  borda vermelha tracejada, risco e preenchimento vermelho transparente."
   *  Esta função gerava a "lápide" GENÉRICA (ícone 🗑️🗺️ + rótulo) que
   *  substituía o CORPO INTEIRO do cartão via troca de `outerHTML`
   *  (`_gridCardHtml`/`_mapCardHtml`) — causa raiz da piscada (o `<canvas>`
   *  da miniatura ao vivo era destruído/recriado do zero) E o motivo de NÃO
   *  mostrar os itens individualmente (a lápide não tinha as 3 colunas).
   *  Substituída pela abordagem de `forcePending` (ver `_renderGridPatrimonios`/
   *  `_renderGridFotos`/`_renderGridVinculacoesPlanta`/`_renderPatrimonioColumn`/
   *  `_renderFotosColumn`/`_renderMapVinculacoes`): o cartão continua com a
   *  MESMA estrutura de sempre (3 colunas), só que TODO item/foto/vinculação
   *  aparece com o visual de "lápide" já existente pra exclusão individual —
   *  sem trocar a estrutura do cartão, o patch cirúrgico já usado pras
   *  outras exclusões (`_refreshGridCardBody`/`_refreshCardBody`) passa a
   *  bastar sozinho aqui também, e a piscada desaparece. */
  _gridCardHtml(entry) {
    const { map, itens } = entry;
    // NOVO (02/09/2026, rodada D, item D5) — `fotos` agora vem de
    // `_sortFotosForDisplay` (ordem PERSONALIZADA, `map.fotoOrder`, ver
    // comentário grande lá) em vez do array natural direto de `entry.fotos`:
    // necessário pra reposicionar fotos por arrasto/flipagem dentro do
    // mesmo mapa (pedido verbatim: "Dentro do mesmo mapa, entre fotos [...]
    // é um reposicionamento, com todo o bloco (foto e vinculações), apenas
    // muda a ordem"). `entry.fotos` continua intacto (ordem natural/de
    // criação, usada por outras partes do código, ex.: `_sortItensForDisplay`
    // no modo 'fotoGroup').
    const fotos = this._sortFotosForDisplay(entry);
    const nome = Utils.escapeHtml(this._mapDisplayName(map));
    const pos = this._gridPositions[map.id] || { x: 0, y: 0 };
    const vinculadosNoMapa = itens.filter((it) => typeof it.mapaX === 'number');
    // `forcePending` (01/09/2026) — ver comentário grande acima: substitui a
    // antiga lápide genérica. Header muda pra mostrar um botão "↩️ reverter"
    // (a mesma ação 'delete-map' pendente) no lugar do botão de excluir,
    // já que excluir de novo não faz sentido enquanto já está pendente.
    const forcePending = !!entry.__pendingDelete;
    // Ícone só (sem rótulo por extenso) — mesmo padrão visual de
    // `_inlineRevertBtnHtml`, usado em toda outra "lápide" (ver comentário
    // grande em style.css `.organize-pending-undo-inline`): rótulo por
    // extenso já foi tentado antes e revertido por "comprometer a
    // estrutura" onde aparece.
    const headerBtnHtml = forcePending
      ? this._inlineRevertBtnHtml('delete-map', map.id)
      : `<button type="button" class="icon-btn sm organize-map-export-btn" data-map-id="${map.id}" title="Exportar apenas este mapa (planta, patrimônios e fotos dele)">⬇️🗺️</button>
          <button type="button" class="icon-btn sm organize-map-delete-btn" data-map-id="${map.id}" title="Excluir este mapa (pedido do usuário, 31/08/2026 — pendente até 'Aplicar alterações')">🗑️</button>`;
    return `
      <div class="organize-grid-card${forcePending ? ' organize-grid-card-map-pending' : ''}" data-map-id="${map.id}" style="left:${pos.x}px; top:${pos.y}px">
        <div class="organize-grid-card-header">
          <span class="organize-grid-card-draghandle" title="Arraste pra reposicionar este mapa na grade">✥</span>
          <strong class="organize-grid-card-name organize-map-card-name" title="${forcePending ? 'Este mapa tem uma exclusão pendente' : 'Clique pra renomear'}">🗺️ ${nome}</strong>
          <span class="organize-map-card-counts${(!itens.length && !fotos.length) ? ' organize-counts-zero' : ''}">📦 ${itens.length} · 🖼️ ${fotos.length}</span>
          ${headerBtnHtml}
        </div>
        <div class="organize-grid-card-body">
          <div class="organize-grid-patrimonios-col">
            <!-- CORRIGIDO (01/09/2026), pedido do usuário verbatim: "esse
                 orb de modificação da quantidade de colunas deve ficar à
                 esquerda e não 'ir andando' junto com o aumento das
                 colunas." Causa: o campo de busca (flex 1 1 auto, logo
                 abaixo) absorve todo espaço extra que sobra quando este
                 cabeçalho cresce em largura (pra acompanhar a grade de
                 patrimônios ficando mais larga com mais colunas) — como o
                 orb vinha DEPOIS do campo de busca no HTML, ele era
                 empurrado pra mais longe da borda esquerda cada vez que a
                 busca crescia. Colocando o orb de colunas PRIMEIRO
                 (flex 0 0 auto, tamanho fixo), ele fica ancorado na borda
                 esquerda sempre — é o campo de busca (à direita dele) que
                 absorve o espaço extra, nunca o contrário.
                 CORRIGIDO (01/09/2026, 2ª rodada) — faltava a própria div
                 class="organize-grid-section-head" que envolve este
                 cabeçalho: na 1ª rodada eu troquei a ORDEM dos elementos
                 mas apaguei sem querer a tag de abertura desta div (a de
                 fechamento continuou logo depois do orb de ordenação),
                 então orb+busca+botão+orb de ordenação viravam filhos
                 DIRETOS de .organize-grid-patrimonios-col (que é
                 flex-direction:column) em vez de filhos de
                 .organize-grid-section-head (flex-direction:row, ver
                 CSS) — bug estrutural silencioso (não dava erro de sintaxe,
                 só empilhava o cabeçalho na vertical em vez de alinhar em
                 linha). Achado testando com Playwright (querySelector de
                 '.organize-grid-section-head' não achava nada dentro do
                 cartão). -->
            <div class="organize-grid-section-head">
              ${this._colOrbHtml(`map:${map.id}`, itens.length)}
              <input type="text" class="organize-grid-search" data-search-key="map:${map.id}" placeholder="🔎 Buscar patrimônio…" title="Busca por número de patrimônio, dentro deste mapa">
              <button type="button" class="icon-btn sm organize-grid-search-toggle" data-search-key="map:${map.id}" title="${this._gridSearchModeTitle(this._getSearchMode(`map:${map.id}`))}">${this._gridSearchModeIcon(this._getSearchMode(`map:${map.id}`))}</button>
              ${this._sortOrbHtml(map.id)}
            </div>
            <div class="organize-grid-patrimonios" data-cols-key="map:${map.id}" style="--organize-cols:${this._effectiveColCount(`map:${map.id}`, itens.length)}">
              ${this._renderGridPatrimonios(this._sortItensForDisplay(entry), fotos, map.id, forcePending)}
            </div>
          </div>
          <div class="organize-grid-mapa-wrap">
            <!-- ITEM "renderização 2D ao vivo da planta baixa embutida no
                 cartão da Grade" (31/08/2026) — ver comentário grande acima
                 de _gridLiveView/organizeview.js. Só a Grade ganhou isso
                 (o Cartões continua com a miniatura estática de sempre, ver
                 _mapCardHtml acima). -->
            <div class="organize-map-thumb-wrap organize-grid-map-live-wrap" title="Planta baixa AO VIVO — arraste pra navegar, use a roda do mouse pra zoom, 2 cliques pra abrir a planta completa">
              <canvas class="organize-map-thumb-canvas organize-grid-map-live-canvas" data-map-id="${map.id}" width="220" height="150"></canvas>
              <button type="button" class="organize-grid-map-live-reset-btn" data-map-id="${map.id}" title="Reenquadrar (voltar pro zoom/posição inicial desta planta)">🎯</button>
            </div>
            <div class="organize-map-thumb-stats">🧱 ${this._drawnCount(map)} · 📌 ${vinculadosNoMapa.length}</div>
            ${this._renderMapObjectsList(map)}
            ${this._renderGridVinculacoesPlanta(vinculadosNoMapa, map.id, forcePending)}
          </div>
          <div class="organize-grid-fotos-col">
            <!-- Pedido do usuário (02/09/2026): "Na divisão das fotos, deve
                 ter um 'orb de organização de colunas', assim como tem nas
                 plaquinhas de metal." Mesmo padrão de
                 .organize-grid-patrimonios-col acima (orb + container com
                 data-cols-key/--organize-cols) — chave própria
                 (fotos:map:ID, nunca colide com a chave das plaquinhas
                 soltas, map:ID). .organize-grid-fotos deixou de ser
                 flex-wrap fixo e virou display:grid controlável (ver CSS) —
                 cada foto continua do seu tamanho natural (max-content/
                 min-width, sem forçar largura fixa como as plaquinhas, que
                 não foi pedido aqui). -->
            <div class="organize-grid-section-head">
              ${this._colOrbHtml(`fotos:map:${map.id}`, fotos.length)}
            </div>
            <div class="organize-grid-fotos" data-cols-key="fotos:map:${map.id}" style="--organize-cols:${this._effectiveColCount(`fotos:map:${map.id}`, fotos.length)};--organize-foto-w:${this._gridFotosCellWidthPx(fotos, itens)}px">
              ${this._renderGridFotos(fotos, itens, forcePending)}
            </div>
          </div>
        </div>
      </div>`;
  },

  /** Plaquinhas metálicas (item 4/9 do pedido v310) — mesmo espírito de
   *  `_renderPatrimonioColumn`, layout em `flex-wrap` em vez de lista
   *  vertical (ver `.organize-grid-patrimonios`, sem scroll interno, pra
   *  TODOS ficarem visíveis de uma vez). */
  // NOVO parâmetro `forcePending` (01/09/2026), pedido verbatim (item 4 da
  // rodada): "Ao clicar para excluir o mapa, não deve dar essa piscada e
  // deve mostrar todos os seus itens com borda vermelha tracejada, risco e
  // preenchimento vermelho transparente." Antes, marcar o MAPA INTEIRO pra
  // exclusão trocava o cartão inteiro por uma "lápide" genérica (ícone +
  // rótulo, ver `_pendingDeleteMapTombstoneHtml`, REMOVIDA nesta rodada) —
  // um `outerHTML` diferente do cartão normal, daí a piscada (o `<canvas>`
  // da miniatura ao vivo era destruído/recriado do zero) E nenhum item
  // aparecia individualmente. Agora `_gridCardHtml`/`_refreshGridCardBody`
  // passam `entry.__pendingDelete` como `forcePending` pra cá: quando
  // ligado, TODO item usa a MESMA "lápide" visual já existente pra exclusão
  // individual (`.organize-pending-delete-plaquinha`), mesmo os que não têm
  // `it.__pendingDelete` próprio — sem trocar a ESTRUTURA do cartão (ainda
  // as mesmas 3 colunas de sempre), então o patch cirúrgico já existente
  // (que só troca o `innerHTML` de cada coluna, nunca o cartão/canvas
  // inteiro) passa a bastar sozinho, eliminando a piscada.
  _renderGridPatrimonios(itens, fotos, mapId, forcePending) {
    if (!itens.length) return `<p class="organize-col-empty">Nenhum patrimônio vinculado a este mapa.</p>`;
    const orbByItem = new Map();
    (fotos || []).forEach((f) => (f.orbs || []).forEach((o) => {
      if (o.itemId && !orbByItem.has(o.itemId)) orbByItem.set(o.itemId, { fotoId: f.id, xNorm: o.xNorm, yNorm: o.yNorm });
    }));
    // ITEM "orb de reordenar" (31/08/2026) — `itens` já chega ORDENADO
    // (ver `_sortItensForDisplay`, chamado no local onde este método é
    // invocado); as setinhas de reordenar personalizado (só aparecem no
    // modo 'custom') usam o ÍNDICE dentro desta mesma ordem já exibida.
    const sortMode = this._getSortMode(mapId);
    return itens.map((it, i) => {
      // ITEM B3 (exclusão de patrimônio, 31/08/2026) — "lápide" riscada no
      // lugar da plaquinha normal quando há exclusão pendente pra ele.
      // CORRIGIDO (01/09/2026), pedido do usuário verbatim: "Coloque largura
      // e altura fixas para os elementos. Ao marcar para excluir um
      // patrimônio, ainda muda sua forma (ficou menor na largura no teste
      // que fiz)." + "Ao excluir um patrimônio [...] ele está sumindo. Não
      // deveria ser assim, ele deve ficar com suas largura e altura
      // intactos e ficar com borda vermelha e preenchimento vermelho
      // transparente e um risco." Causa raiz: a "lápide" antiga tinha uma
      // estrutura BEM mais enxuta (só ícone+número+reverter) que a
      // plaquinha normal (número+ícone de foto opcional+setinhas de
      // reordenar opcionais+botão de lixeira) — como `.organize-plaquinha`
      // é `inline-flex` sem largura fixa (largura = conteúdo, ver CSS), a
      // plaquinha ENCOLHIA de verdade ao marcar exclusão, dando a impressão
      // de "sumir"/mudar de forma. Corrigido reaproveitando a MESMA
      // estrutura da plaquinha normal DESTE item (mesmo ícone de foto se
      // houver vinculação, mesmas setinhas de reordenar se o modo 'custom'
      // estiver ativo) — só troca os elementos INTERATIVOS por equivalentes
      // "fantasma" do MESMO tamanho (mesmo espírito de
      // `.organize-vinc-chip-unlink-ghost`, já usado em `_vincChipHtml`) —
      // e o botão de lixeira normal vira o botão "↩️ reverter", no MESMO
      // slot de fluxo (não mais um canto `position:absolute` à parte, que
      // exigia um `padding-right` extra só pra ele — ver CSS). Isso garante
      // a MESMA largura/altura da plaquinha normal deste item, sempre.
      if (it.__pendingDelete || forcePending) {
        const orbInfoPendente = orbByItem.get(it.id);
        const reorderGhostHtml = sortMode === 'custom' ? `<span class="organize-reorder-btns organize-reorder-btns-ghost" aria-hidden="true">
          <span class="organize-reorder-btn">◀</span>
          <span class="organize-reorder-btn">▶</span>
        </span>` : '';
        // `forcePending` sem `it.__pendingDelete` próprio = o item não está
        // sendo excluído (só DESVINCULADO — o mapa inteiro é que sumirá),
        // não existe uma ação 'delete-item' pra reverter aqui, então o botão
        // "↩️" some (reverter é feito pelo botão do MAPA, no cabeçalho do
        // cartão — ver `_gridCardHtml`) e o `title` explica a diferença.
        const titlePendente = it.__pendingDelete
          ? "Exclusão pendente — some de vez ao clicar em 'Aplicar alterações'"
          : "Este mapa será excluído — o patrimônio não é apagado, só perde a vinculação com ele";
        const undoHtml = it.__pendingDelete
          ? `<button type="button" class="organize-pending-undo-inline organize-pending-undo-inline-inflow" data-undo-type="delete-item" data-undo-id="${it.id}" title="Reverter esta exclusão pendente (deixa de estar marcado)">↩️</button>`
          : '';
        return `<div class="organize-plaquinha organize-pending-delete-plaquinha" data-item-id="${it.id}" title="${titlePendente}">
          <span class="organize-plaquinha-num">${Utils.escapeHtml(it.patrimonio || '(sem número)')}</span>
          ${orbInfoPendente ? `<span class="organize-plaquinha-photoicon organize-plaquinha-photoicon-ghost" aria-hidden="true">📷</span>` : ''}
          ${reorderGhostHtml}
          ${undoHtml}
        </div>`;
      }
      const orbInfo = orbByItem.get(it.id);
      const dup = this._isDupPatrimonio(it); // ITEM A14
      // ITEM B1 (exclusão de foto, 31/08/2026) — se este item ficou marcado
      // como "afetado" por uma exclusão pendente de foto/mapa (ver
      // `_deletePhoto`/`_mapDeleteColor`), ganha um contorno na cor do mapa.
      const corAfetado = it.__pendingDeleteColor;
      const styleAfetado = corAfetado ? ` style="--organize-affected-color:${corAfetado}"` : '';
      const reorderHtml = sortMode === 'custom' ? `<span class="organize-reorder-btns">
        <button type="button" class="organize-reorder-btn organize-reorder-prev" data-item-id="${it.id}" data-map-id="${mapId}" ${i === 0 ? 'disabled' : ''} title="Mover pra trás na ordem personalizada">◀</button>
        <button type="button" class="organize-reorder-btn organize-reorder-next" data-item-id="${it.id}" data-map-id="${mapId}" ${i === itens.length - 1 ? 'disabled' : ''} title="Mover pra frente na ordem personalizada">▶</button>
      </span>` : '';
      return `
      <div class="organize-plaquinha${dup ? ' organize-plaquinha-dup' : ''}${corAfetado ? ' organize-plaquinha-affected' : ''}" data-item-id="${it.id}" data-patrimonio="${Utils.escapeHtml((it.patrimonio || '').toLowerCase())}" title="${Utils.escapeHtml(it.descricao || '')}${dup ? ' (⚠️ número de patrimônio duplicado)' : ''}${corAfetado ? ' (⚠️ afetado por uma exclusão pendente neste mapa)' : ''} — clique pra editar"${styleAfetado}>
        <span class="organize-plaquinha-num">${Utils.escapeHtml(it.patrimonio || '(sem número)')}</span>
        ${orbInfo ? `<span class="organize-plaquinha-photoicon" data-foto-id="${orbInfo.fotoId}" data-x="${(orbInfo.xNorm * 100).toFixed(2)}" data-y="${(orbInfo.yNorm * 100).toFixed(2)}" title="Ver a posição dele na foto vinculada">📷</span>` : ''}
        ${reorderHtml}
        <button type="button" class="organize-plaquinha-del-btn" data-item-id="${it.id}" title="Excluir este patrimônio (pendente até 'Aplicar alterações')">🗑️</button>
      </div>`;
    }).join('');
  },

  /** ITEM B6 (retomado 31/08/2026) — "vinculações do mapa devem aparecer
   *  listadas" ainda faltava no modo Grade (só existia no Cartões, via
   *  `_renderMapVinculacoes`) — pedido original da rodada 52, revisitado
   *  agora junto com o item de exclusão ("cada vinculação entre patrimônio e
   *  PLANTA BAIXA deve poder ser desfeita"). Mesmo padrão visual das
   *  vinculações de FOTO (`_renderGridFotos` abaixo — orb de coluna + grid +
   *  tesourinha ✂️), chave própria (`planta:<mapId>`) pra não competir com a
   *  contagem de colunas das fotos/patrimônios soltos. */
  // ATUALIZADO (01/09/2026) — mesmo motivo documentado em
  // `_renderMapVinculacoes` (versão Cartões): sem incluir os "fantasmas" de
  // `_pendingUnlinkPlantaGhosts`, o chip somia da grade na hora ao
  // desvincular pela tesourinha, em vez de virar lápide. `nTotal` (itens
  // reais + fantasmas) alimenta tanto a bolinha de colunas quanto
  // `--organize-cols`, senão o número de colunas oscilaria sozinho conforme
  // desvinculações pendentes iam/vinham (mesmo cuidado já tomado pelas
  // fotos, ver `_renderGridFotos`/`nChips`).
  // NOVO parâmetro `forcePending` (01/09/2026) — mesmo motivo/mesma correção
  // documentados em `_renderMapVinculacoes` (versão Cartões, item 4 da
  // rodada: mapa inteiro pendente = todo chip com visual de lápide).
  _renderGridVinculacoesPlanta(vinculadosNoMapa, mapId, forcePending) {
    const ghosts = this._pendingUnlinkPlantaGhosts(mapId);
    const nTotal = vinculadosNoMapa.length + ghosts.length;
    if (!nTotal) return '';
    const colKey = `planta:${mapId}`;
    // CORRIGIDO (01/09/2026) — mesma correção/motivo documentados em
    // `_renderMapVinculacoes` (versão Cartões): usa a ordem natural de
    // `entry.itens` (nunca reordenada por `_unlinkItemFromPlanta`) em vez
    // de concatenar os fantasmas sempre no final.
    const ghostIds = new Set(ghosts.map((it) => it.id));
    const entry = this._maps.find((e) => e.map.id === mapId);
    const combined = entry ? entry.itens.filter((it) => typeof it.mapaX === 'number' || ghostIds.has(it.id)) : [...vinculadosNoMapa, ...ghosts];
    const chipsHtml = combined.map((it) => (ghostIds.has(it.id) || forcePending)
      ? `<span class="organize-vinc-chip organize-vinc-chip-map organize-vinc-chip-pending-delete" data-item-id="${it.id}" title="${ghostIds.has(it.id) ? "Desvinculado da planta baixa — pendente até 'Aplicar alterações'" : 'Este mapa será excluído'}"><span class="organize-vinc-chip-label">📍 ${Utils.escapeHtml(it.patrimonio || '(sem número)')}</span><span class="organize-vinc-chip-unlink-ghost" aria-hidden="true">✂️</span></span>`
      : `<span class="organize-vinc-chip organize-vinc-chip-map" data-item-id="${it.id}"><span class="organize-vinc-chip-label">📍 ${Utils.escapeHtml(it.patrimonio || '(sem número)')}</span><span class="organize-vinc-chip-unlink organize-vinc-chip-unlink-planta" data-item-id="${it.id}" title="Desvincular da planta baixa (pendente até 'Aplicar alterações')">✂️</span></span>`
    ).join('');
    return `
      <div class="organize-grid-section-head organize-grid-section-head-sm">
        ${this._colOrbHtml(colKey, nTotal)}
      </div>
      <div class="organize-vinc-list organize-vinc-list-sm organize-vinc-list-gridcols" data-cols-key="${colKey}" style="--organize-cols:${this._effectiveColCount(colKey, nTotal)}" title="Vinculações de patrimônio com a planta baixa deste mapa — clique pra abrir a planta">
        ${chipsHtml}
      </div>`;
  },

  // NOVO (02/09/2026, rodada E), pedido do usuário verbatim: "Ao variar as
  // colunas das vinculações [orb PRÓPRIO de cada foto, chave `foto:<id>`],
  // o bloco daquela foto que as possui deve ir se ajustando (aumentando/
  // diminuindo) em tamanho para que tudo fique dentro do bloco e aparente
  // [sem scroll]." Antes disso, `.organize-grid-foto-item` sempre esticava
  // (`stretch`) até o trilho FIXO de `.organize-grid-fotos`
  // (`--organize-foto-w`, sempre 132px, o valor padrão do CSS — nunca
  // escrito por JS) — quando a foto tinha seu PRÓPRIO orb de vinculação com
  // mais de 1 coluna, o grid de chips dela (`.organize-vinc-list-gridcols`,
  // trilhos de 132px + 4px de gap cada) precisava de mais espaço que esses
  // 132px fixos e ganhava uma rolagem própria (regra removida logo abaixo
  // de `.organize-grid-foto-item` em style.css) — exatamente o "scroll" que
  // este pedido proíbe.
  // Corrigido calculando aqui, em JS (mesmo espírito "largura fixa via
  // JS/CSS-var" já comprovado pras plaquinhas/chips — ver comentário grande
  // em `.organize-grid-fotos`, style.css: `max-content` puro em CSS não
  // propagava de forma confiável através do grid-dentro-de-flex-dentro-de-
  // grid aninhado desta estrutura), a MAIOR largura que qualquer foto da
  // COLEÇÃO precisa pro seu próprio grid de vinculação caber sem cortar —
  // e usando essa largura pra TODA a coleção (`--organize-foto-w`,
  // sobrescrita aqui em vez do default de 132px): o trilho da grade de
  // fotos vira uniformemente largo o bastante pra até a foto MAIS "cheia"
  // de vinculações, então nenhuma foto nunca mais precisa de rolagem
  // própria. Efeito colateral aceito (inerente a colunas de grid — todas as
  // células de uma coluna COMPARTILHAM a mesma largura, não dá pra uma
  // célula crescer sozinha sem ou sobrepor a vizinha ou deixar buracos):
  // quando UMA foto aumenta suas colunas de vinculação, as OUTRAS fotos da
  // mesma coleção também podem ficar visualmente mais largas (a célula
  // delas cresce junto) — mas nunca gera rolagem nem sobreposição, que é o
  // que foi pedido explicitamente evitar. `.organize-grid-card`/`-body`
  // (`width: max-content`, já comprovado) propaga esse crescimento pro
  // cartão do mapa inteiro, exatamente como já acontece pras plaquinhas.
  _gridFotosCellWidthPx(fotos, itens) {
    const VINCCHIP_W = 132, GAP = 4, MIN_W = 132; // mesmos valores fixos de --organize-vincchip-w/gap e do default de --organize-foto-w (style.css)
    const itemById = new Map(itens.map((it) => [it.id, it]));
    let maxW = MIN_W;
    fotos.forEach((f) => {
      const orbsComItem = (f.orbs || []).filter((o) => o.itemId && itemById.has(o.itemId));
      const ghostChips = this._pendingDeletedChipsForFoto(f.id);
      const nChips = orbsComItem.length + ghostChips.length;
      if (!nChips) return;
      const cols = this._effectiveColCount(`foto:${f.id}`, nChips);
      const w = cols * VINCCHIP_W + (cols - 1) * GAP;
      if (w > maxW) maxW = w;
    });
    return maxW;
  },

  /** Fotos em grade, resolução/tamanho fixos independente do zoom (item
   *  4/9 do pedido v310 — ver comentário grande em `_viewMode`, "FOTOS na
   *  grade"). Mesma estrutura de dado de `_renderFotosColumn` (nome + foto +
   *  patrimônios vinculados embaixo), só o layout muda de lista vertical
   *  pra `flex-wrap`. */
  // NOVO parâmetro `forcePending` (01/09/2026) — mesmo motivo/mesma correção
  // documentados em `_renderFotosColumn` (item 4 da rodada).
  _renderGridFotos(fotos, itens, forcePending) {
    if (!fotos.length) return `<p class="organize-col-empty">Nenhuma foto vinculada a este mapa.</p>`;
    // ATUALIZADO (31/08/2026, item D) — mesma mudança do modo Cartões (ver
    // comentário grande em `_renderFotosColumn`): `itemById` inclui TODOS os
    // itens agora, inclusive com exclusão pendente (rótulo resolvido tanto
    // pra chips normais quanto "fantasma", ver `_pendingDeletedChipsForFoto`).
    const itemById = new Map(itens.map((it) => [it.id, it]));
    return fotos.map((f) => {
      const orbsComItem = (f.orbs || []).filter((o) => o.itemId && itemById.has(o.itemId));
      // ITEM D — chips "fantasma" (ver comentário grande em
      // `_pendingDeletedChipsForFoto`).
      const ghostChips = this._pendingDeletedChipsForFoto(f.id);
      const nChips = orbsComItem.length + ghostChips.length;
      const colKey = `foto:${f.id}`;
      const medidas = f.medidas || [];
      // ITEM B10/B11 (CORRIGIDO 31/08/2026) — pedido do usuário verbatim:
      // "Para que a ideia das cores [...] funcione, a posição da foto deve
      // permanecer. Atualmente a área que a foto ocupava é removida." A
      // "lápide" ANTES tinha uma estrutura DIFERENTE da foto normal (sem a
      // linha de nome, sem as linhas de vinculações/medidas), então
      // ocupava uma altura MENOR — o resto da grade "subia" pra preencher o
      // espaço, dando a impressão de que a posição tinha sumido. Corrigido
      // reusando o MESMO esqueleto (nome + caixa do tamanho da miniatura +
      // vinculações + medidas) da foto normal — só o CONTEÚDO da caixa da
      // miniatura muda pro aviso tracejado vermelho; o resto (inclusive as
      // linhas de vinculação/medida, que continuam existindo — a exclusão
      // é só da FOTO, os patrimônios/medidas dela não sumiram do array)
      // fica idêntico, garantindo o MESMO footprint (mesma largura/altura)
      // que a foto ocupava antes de ser marcada pra exclusão.
      // `src` (01/09/2026, item 3 da rodada) — subida pra ANTES do `if`
      // abaixo, mesmo motivo/mesma correção documentados em
      // `_renderFotosColumn` (versão Cartões).
      const src = f.thumbDataUrl || f.dataUrl || '';
      if (f.__pendingDelete || forcePending) {
        // Detalhe (marcações/medidas) movido pro `title` — ver comentário
        // igual em `_renderFotosColumn`.
        const detalhe = [nChips ? `${nChips} marcação(ões)` : '', medidas.length ? `${medidas.length} medida(s)` : ''].filter(Boolean).join(', ');
        // ITEM C/D — todos os chips (reais ou fantasma) ficam com o mesmo
        // visual de "lápide" aqui — a foto inteira já está pendente.
        // CORRIGIDO (01/09/2026) — `_mergeOrbsWithGhosts` mantém a posição
        // original (mesmo motivo/correção da versão Cartões).
        const chipsHtml = this._mergeOrbsWithGhosts(orbsComItem, ghostChips)
          .map((m) => this._vincChipHtml(m.itemId, itemById.get(m.itemId), { pending: true, title: m.real ? "Esta foto será excluída — a vinculação some junto" : m.title, undoType: m.real ? null : m.type, undoFotoId: f.id }))
          .join('');
        // Mesma distinção documentada em `_renderFotosColumn`: sem
        // `f.__pendingDelete` próprio (só `forcePending`, mapa inteiro), não
        // existe ação 'delete-foto' pra reverter aqui.
        const undoFotoHtml = f.__pendingDelete ? this._inlineRevertBtnHtml('delete-foto', f.id) : '';
        return `
        <div class="organize-grid-foto-item organize-pending-delete-foto" data-foto-id="${f.id}">
          <div class="organize-foto-name organize-grid-foto-name" title="'${Utils.escapeHtml(f.nome || '(sem nome)')}' será excluída ao aplicar as alterações">${Utils.escapeHtml(f.nome || '(sem nome)')}</div>
          <div class="organize-foto-thumb-wrap organize-grid-foto-thumb-wrap organize-pending-delete-box" title="'${Utils.escapeHtml(f.nome || '(sem nome)')}' será excluída${detalhe ? ` (${detalhe} junto)` : ''}">
            <!-- ITEM 3 (rodada B, 01/09/2026) — mesmo motivo/mesma correção
                 documentados em _renderFotosColumn (versão Cartões): a
                 miniatura real volta a aparecer por baixo do preenchimento
                 vermelho translúcido, em vez de sumir por trás do aviso. -->
            ${src ? `<img class="organize-pending-delete-thumb-img" src="${src}" alt="" loading="lazy" width="96" height="72">` : ''}
            <div class="organize-pending-delete-icon">🗑️📷</div>
            <div class="organize-pending-delete-label">exclusão pendente</div>
            <!-- CORRIGIDO (31/08/2026) — mesmo motivo documentado em
                 _renderFotosColumn: botão voltou pra DENTRO do thumb-
                 wrap, agora position:absolute (canto fixo, não
                 desestrutura a lápide). -->
            ${undoFotoHtml}
          </div>
          ${nChips ? `
          <div class="organize-grid-section-head organize-grid-section-head-sm">
            ${this._colOrbHtml(colKey, nChips)}
          </div>
          <div class="organize-vinc-list organize-vinc-list-sm organize-vinc-list-gridcols" data-cols-key="${colKey}" style="--organize-cols:${this._effectiveColCount(colKey, nChips)}">
            ${chipsHtml}
          </div>` : ''}
          ${medidas.length ? `
          <div class="organize-grid-section-head organize-grid-section-head-sm">
            <span class="organize-medidas-head-label">📏 Medidas (serão excluídas junto)</span>
          </div>
          <div class="organize-medidas-list">
            ${medidas.map((m, i) => this._medidaChipHtml(m, f.id, i, true)).join('')}
          </div>` : ''}
        </div>`;
      }
      // `src` (item 3 da rodada B) já foi calculada mais acima, ANTES do
      // `if` — reaproveitada aqui.
      // CORRIGIDO (31/08/2026) — mesma bolinha "fantasma" da versão Cartões
      // (ver comentário grande em `_orbDotHtml`/`_renderFotosColumn`).
      const orbDots = orbsComItem.map((o) => this._orbDotHtml(o, itemById)).join('')
        + ghostChips.map((g) => this._orbDotHtml(g.orb, itemById, { pending: true })).join('');
      // ITEM "listas de medidas embaixo do patrimônio da foto" (31/08/2026,
      // pedido "continue" 8ª vez) — o badge "📏N" já existia (item 13 do
      // feedback, rodada 53); faltava a LISTA em si (mesmo espírito da
      // lista de patrimônios vinculados logo acima). `medida.valor` é texto
      // livre opcional (ver `AmbientePhotos._confirmMedidaDraft`) — sem
      // valor mostra "(sem valor)" em vez de deixar o chip vazio. ESCOPO
      // DESTA RODADA: só EXIBE a lista — apagar/editar uma medida
      // individual continua exclusivo de 'Mapa'→'Foto'→régua 📏
      // (ambientephotos.js); não reusa o sistema de "alterações pendentes"
      // porque medidas não têm hoje uma operação de exclusão própria fora
      // de lá, diferente de patrimônios/fotos/vinculações (ITEM B).
      // ITEM D — chips fantasma de itens já excluídos misturam com os
      // chips normais desta foto ATIVA.
      // CORRIGIDO (01/09/2026) — `_mergeOrbsWithGhosts` mantém a posição
      // original (mesmo motivo/correção da versão Cartões).
      const chipsHtml = this._mergeOrbsWithGhosts(orbsComItem, ghostChips)
        .map((m) => m.real
          ? this._vincChipHtml(m.itemId, itemById.get(m.itemId), { xNorm: m.orb.xNorm, yNorm: m.orb.yNorm, fotoId: f.id })
          : this._vincChipHtml(m.itemId, itemById.get(m.itemId), { pending: true, title: m.title, undoType: m.type, undoFotoId: f.id }))
        .join('');
      return `
        <div class="organize-grid-foto-item" data-foto-id="${f.id}">
          <div class="organize-foto-name organize-grid-foto-name" title="Clique pra renomear">${Utils.escapeHtml(f.nome || '(sem nome)')}</div>
          <div class="organize-foto-thumb-wrap organize-grid-foto-thumb-wrap">
            <!-- CORRIGIDO (02/09/2026, rodada D), pedido verbatim: "[arrastar
                 uma foto entre mapas] deve funcionar clicando em cima da foto
                 também, não só fora dela no bloco dela." CAUSA: elemento
                 img é draggable="true" por padrão no navegador — clicar e
                 arrastar DIRETO em cima da miniatura disparava o arrasto
                 NATIVO de imagem do próprio navegador (que produz seu próprio
                 "fantasma" de imagem e não dispara mais pointermove no
                 elemento pro nosso sistema customizado, ver _wireGridDrag
                 Source/_beginCardDrag), diferente de arrastar por fora da
                 imagem (no resto do cartão da foto), que já usava o Pointer
                 Events normal e funcionava. draggable="false" desliga o
                 arrasto nativo do navegador só nesta imagem — o arrasto
                 customizado (Pointer Events) continua funcionando igual, já
                 que nunca dependeu do atributo draggable nativo. -->
            ${src ? `<img src="${src}" alt="" loading="lazy" width="96" height="72" draggable="false">` : '<div class="organize-foto-thumb-placeholder">🖼️</div>'}
            ${orbDots}
            <!-- NOVO (02/09/2026), pedido verbatim (rodada C): "Deve
                 aparecer outro ícone indicando a quantidade de medidas
                 feitas na foto." O badge "📏N" já existia na visão Cartões
                 (_renderFotosColumn, ver comentário grande logo acima
                 desta função) — só faltava aqui, na Grade; mesmo par de
                 badges (medidas + vinculações), mesmas classes CSS. -->
            ${medidas.length ? `<span class="organize-foto-badge organize-foto-badge-medidas">📏${medidas.length}</span>` : ''}
            ${f.orbs?.length ? `<span class="organize-foto-badge organize-foto-badge-vinc">📍${f.orbs.length}</span>` : ''}
            <button type="button" class="organize-grid-foto-del-btn" data-foto-id="${f.id}" title="Excluir esta foto (pendente até 'Aplicar alterações')">🗑️</button>
          </div>
          ${nChips ? `
          <div class="organize-grid-section-head organize-grid-section-head-sm">
            ${this._colOrbHtml(colKey, nChips)}
          </div>
          <div class="organize-vinc-list organize-vinc-list-sm organize-vinc-list-gridcols" data-cols-key="${colKey}" style="--organize-cols:${this._effectiveColCount(colKey, nChips)}">
            ${chipsHtml}
          </div>` : ''}
          ${medidas.length ? `
          <div class="organize-grid-section-head organize-grid-section-head-sm">
            <span class="organize-medidas-head-label" title="Medidas registradas nesta foto — adicione/edite em 'Mapa'→'Fotos'→régua 📏">📏 Medidas</span>
          </div>
          <div class="organize-medidas-list">
            ${medidas.map((m, i) => this._medidaChipHtml(m, f.id, i, false)).join('')}
          </div>` : ''}
        </div>`;
    }).join('');
  },

  /** Liga os eventos de UM cartão da grade — reaproveita `_wireMapNameEdit`
   *  (mesmo helper do modo cartões: funciona porque o elemento de nome aqui
   *  também tem a classe `.organize-map-card-name`, além da própria
   *  `.organize-grid-card-name`), `_openMapExternally`, `_openItemEditor`,
   *  `_highlightOrbOnPhoto`, `_openFotoAtOrb` e `_wireFotoNameEdit` — nada
   *  disso precisou ser duplicado. NÃO reaproveitado aqui (simplificação
   *  documentada, ver comentário grande em `_viewMode`): arrastar-e-soltar
   *  patrimônio/foto pra OUTRO mapa e a seleção/mesclagem por região —
   *  ficam exclusivos do modo Cartões nesta rodada. */
  // NOVO (01/09/2026, item B5), pedido verbatim: "Ao marcar algo para
  // exclusão não deveria dar uma 'piscada' nos elementos." Extraído de
  // dentro de `_wireGridCard` (só o pedaço que religa a coluna de
  // patrimônios/plaquinhas) pra poder ser chamado tanto no wiring COMPLETO
  // do cartão (1ª renderização) quanto no patch CIRÚRGICO de
  // `_refreshGridCardBody` (ver comentário grande lá) — este último passa
  // só o `.organize-grid-patrimonios-col` recém-substituído como `scope`
  // (em vez do cartão inteiro), senão `_wireGridSearch`/
  // `_wireItemListHeadControls` religariam TAMBÉM os orbs de coluna das
  // fotos/planta baixa (que não foram tocados), duplicando os listeners
  // deles a cada exclusão marcada.
  _wireGridPatrimoniosCol(scope, entry, card) {
    scope.querySelectorAll('.organize-plaquinha').forEach((plq) => {
      // ITEM "arrastar e soltar" (02/09/2026, rodada C) — não arrasta a
      // "lápide" de um patrimônio já com exclusão pendente (mesmo motivo
      // documentado acima em `_wireGridFotosWrap`).
      if (!plq.classList.contains('organize-pending-delete-plaquinha')) {
        this._wireGridDragSource(plq, 'item', entry, card);
      }
      plq.addEventListener('click', (e) => {
        // ATUALIZADO (31/08/2026, item E) — o botão "↩️ reverter" da lápide
        // (`.organize-pending-undo-inline`, ver `_inlineRevertBtnHtml`) é
        // FILHO desta plaquinha quando ela está com exclusão pendente;
        // sem esta exclusão, o clique nele bolharia até aqui e abriria o
        // editor do item por cima do listener delegado que trata o reverter
        // (ver `_buildOverlay`).
        if (e.target.closest('.organize-plaquinha-photoicon,.organize-plaquinha-del-btn,.organize-pending-undo-inline')) return;
        this._openItemEditor(plq.dataset.itemId);
      });
      plq.querySelector('.organize-plaquinha-photoicon')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const pin = e.currentTarget;
        const fotoItem = card.querySelector(`.organize-grid-foto-item[data-foto-id="${pin.dataset.fotoId}"]`);
        const thumbWrap = fotoItem?.querySelector('.organize-grid-foto-thumb-wrap');
        if (!thumbWrap) return;
        this._highlightOrbOnPhoto(thumbWrap, parseFloat(pin.dataset.x), parseFloat(pin.dataset.y));
      });
      // ITEM B3 (31/08/2026) — botão de lixeira em CADA plaquinha, exclui só
      // aquele patrimônio (ver `_deleteItem`, pendente até "Aplicar").
      plq.querySelector('.organize-plaquinha-del-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteItem(plq.dataset.itemId);
      });
    });
    this._wireGridSearch(scope); // ITEM A11/A13 — orbs de coluna + busca (ver comentário grande acima de `_gridColCounts`)
    this._wireItemListHeadControls(scope); // ITEM "orb de reordenar"/"lista expansível" (31/08/2026, ver comentário grande acima de `_itemSortMode`)
  },

  // NOVO (01/09/2026, item B5) — mesmo motivo/mesma extração documentada em
  // `_wireGridPatrimoniosCol` acima, agora pra coluna de FOTOS.
  // NOVO parâmetro `card` (02/09/2026, rodada C, item "arrastar e soltar") —
  // o gesto de arrastar uma foto (`_wireGridDragSource`, ver comentário
  // grande acima de `_beginCardDrag`) precisa do CARTÃO inteiro (pra achar
  // as plaquinhas vinculadas, que vivem na OUTRA coluna do mesmo cartão) —
  // antes `scope` (só `.organize-grid-fotos`) não bastava. Os 2 pontos que
  // chamam esta função (`_wireGridCard`/`_refreshGridCardBody`) já tinham o
  // cartão à mão (`card`/`oldCard`), só faltava passar adiante.
  _wireGridFotosWrap(scope, entry, card) {
    scope.querySelectorAll('.organize-grid-foto-item').forEach((fi) => {
      const fotoId = fi.dataset.fotoId;
      // ITEM "arrastar e soltar" (02/09/2026) — não arrasta a "lápide" de
      // uma foto já com exclusão pendente (nada a mover, o clique dela já
      // não abre editor de qualquer forma nesse estado).
      if (card && !fi.classList.contains('organize-pending-delete-foto')) {
        this._wireGridDragSource(fi, 'foto', entry, card);
      }
      const nameEl = fi.querySelector('.organize-grid-foto-name');
      if (nameEl) nameEl.addEventListener('click', (e) => { e.stopPropagation(); this._wireFotoNameEdit(nameEl, entry, fotoId); });
      const thumbWrap = fi.querySelector('.organize-grid-foto-thumb-wrap');
      // ITEM B1 (31/08/2026) — botão de lixeira em cada foto (ver
      // `_deletePhoto`); ausente na "lápide" (foto já com exclusão pendente),
      // por isso o `?.` — nada a religar nesse caso.
      fi.querySelector('.organize-grid-foto-del-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deletePhoto(fotoId);
      });
      fi.querySelectorAll('.organize-vinc-chip-foto').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          // NOVO (02/09/2026) — ver comentário grande logo abaixo
          // (`Flip.makeSortable` nesta mesma lista): suprime o `click`
          // sintético que o navegador dispara depois de um `pointerup` de
          // arrasto de verdade (mesmo problema/mesma solução documentados
          // em `_suppressNextGridClick`, só que por chip em vez de por
          // cartão inteiro — `onDragStart` do Flip, abaixo, arma a flag).
          if (this._suppressNextVincChipClick) { this._suppressNextVincChipClick = false; return; }
          // ITEM C/D (retomado 31/08/2026) — chip "lápide" (foto ou o
          // próprio patrimônio marcados pra exclusão, ver `_vincChipHtml`)
          // não tem `data-x`/`data-y` (não faz sentido destacar posição de
          // algo que vai sumir) nem tesourinha de verdade — sem esta
          // exclusão, o clique cairia direto no `_highlightOrbOnPhoto` de
          // baixo com `NaN`/`NaN`.
          if (chip.classList.contains('organize-vinc-chip-pending-delete')) return;
          e.stopPropagation();
          if (e.target.closest('.organize-vinc-chip-unlink')) return;
          this._highlightOrbOnPhoto(thumbWrap, parseFloat(chip.dataset.x), parseFloat(chip.dataset.y));
        });
      });
      // NOVO (02/09/2026), pedido do usuário verbatim: "Deve ser possível
      // trocar de posição os patrimônios (vinculações, em baixo das fotos)
      // entre eles também." Este item já tinha sido documentado como
      // deliberadamente fora de escopo numa rodada anterior (ver comentário
      // grande acima de `_wireGridDragSource`) — reenviado pelo usuário,
      // implementado agora. Diferente do arrasto de plaquinhas/fotos entre
      // MAPAS (`_updateSameMapReorderPreview`/`_commitSameMapReorder`, que
      // precisam de uma sessão própria com fantasma/cruzar-pra-outro-cartão),
      // um chip de vinculação NUNCA sai do bloco da própria foto — é só
      // reordenar dentro de uma lista fixa, exatamente o caso de uso que
      // `Flip.makeSortable` (flip.js, já usado por 'Ver lista simples'/'📋
      // Tabela') resolve pronto, com a MESMA técnica de FLIP e o MESMO
      // "eixo automático" (mesma linha → X, linha diferente → Y) da correção
      // aplicada acima em `_updateSameMapReorderPreview` — sem precisar
      // reescrever essa lógica à mão de novo aqui. `itemSelector` exclui os
      // chips "fantasma" (`.organize-vinc-chip-pending-delete`, exclusão
      // pendente) — não fazem sentido reordenáveis, já estão de saída.
      const vincListGrid = fi.querySelector('.organize-vinc-list-gridcols');
      if (vincListGrid && window.Flip?.makeSortable && !fi.classList.contains('organize-pending-delete-foto')) {
        const sortableChips = window.Flip.makeSortable(vincListGrid, {
          itemSelector: '.organize-vinc-chip-foto:not(.organize-vinc-chip-pending-delete)',
          ignoreSelector: '.organize-vinc-chip-unlink',
          draggingClass: 'organize-vinc-chip-dragging',
          axis: 'auto',
          onDragStart: () => { this._suppressNextVincChipClick = true; },
          onDrop: (orderedEls) => {
            const orderedIds = orderedEls.map((el) => el.dataset.itemId).filter(Boolean);
            this._commitVincChipFotoReorder(fotoId, orderedIds);
          },
        });
        vincListGrid.querySelectorAll('.organize-vinc-chip-foto:not(.organize-vinc-chip-pending-delete)').forEach((chip) => sortableChips.attach(chip));
      }
      // ITEM B5 (31/08/2026) — "tesourinha" (✂️) em cada chip de vinculação,
      // desfaz só a marcação entre aquele patrimônio e esta foto (ver
      // `_unlinkItemFromFoto`), sem excluir nenhum dos dois.
      fi.querySelectorAll('.organize-vinc-chip-unlink').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._unlinkItemFromFoto(btn.dataset.itemId, btn.dataset.fotoId);
        });
      });
      // CORRIGIDO (31/08/2026) — exclui a bolinha "fantasma"
      // (`.organize-foto-orbdot-pending-delete`, ver `_orbDotHtml`): o
      // patrimônio dela já está de saída, não faz sentido abrir a foto
      // centralizada numa marcação que vai deixar de existir.
      fi.querySelectorAll('.organize-foto-orbdot:not(.organize-foto-orbdot-pending-delete)').forEach((dot) => {
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          this._openFotoAtOrb(entry, fotoId, parseFloat(dot.dataset.xNorm), parseFloat(dot.dataset.yNorm));
        });
      });
      // ITEM A19, verbatim: "ao dar dois cliques na foto vai para a foto,
      // mesmo que não seja em cima de uma bolinha [...] o botão de retorno
      // [...] deve aparecer nessa situação também." `_openFotoAtOrb` já
      // ativa o retorno (`fromOrganizar: true`) — aqui só chamamos ele com
      // o centro normalizado (0.5, 0.5) quando o duplo-clique NÃO foi numa
      // bolinha/chip específica (esses já têm posição exata própria).
      thumbWrap?.addEventListener('dblclick', (e) => {
        // CORRIGIDO (31/08/2026) — exclui também `.organize-pending-undo-
        // inline` (botão "↩️" que agora vive dentro do thumb-wrap, ver
        // `.organize-pending-delete-box`), pra um duplo-clique nele não
        // abrir a tela de Foto ao mesmo tempo.
        if (e.target.closest('.organize-foto-orbdot,.organize-vinc-chip-foto,.organize-pending-undo-inline')) return;
        e.stopPropagation();
        this._openFotoAtOrb(entry, fotoId, 0.5, 0.5);
      });
    });
    // Cada foto tem seu PRÓPRIO orb de colunas (`foto:<fotoId>`, ver
    // `_colOrbHtml` dentro de `_renderGridFotos`) pros chips de vinculação
    // dela — sem isto, os botões ◀/▶ de cada foto ficariam mudos.
    this._wireGridSearch(scope);
  },

  /** NOVO (02/09/2026) — chamado pelo `onDrop` do `Flip.makeSortable` ligado
   *  em `_wireGridFotosWrap` (ver comentário grande lá): persiste a nova
   *  ordem dos chips de vinculação (`.organize-vinc-chip-foto`) de UMA foto
   *  em `foto.orbs` — o próprio array já é a fonte da ordem de exibição
   *  (nenhum campo novo precisou ser criado, diferente de `map.fotoOrder`
   *  pra fotos). `orderedItemIds` é a ordem final lida direto do DOM pelo
   *  Flip (`[...container.children].map(itemId)`). Reordena só os orbs cujo
   *  `itemId` apareceu na lista (tem chip de verdade renderizado);
   *  qualquer orb "sobrando" (sem `itemId`, ou de um item que por algum
   *  motivo não tinha chip) mantém a posição relativa entre si, jogado pro
   *  FIM — nunca perdido, só não reordenável por esta interação. */
  _commitVincChipFotoReorder(fotoId, orderedItemIds) {
    const entry = this._maps.find((e) => (e.fotos || []).some((f) => f.id === fotoId));
    const foto = entry?.fotos.find((f) => f.id === fotoId);
    if (!foto || !Array.isArray(foto.orbs) || !orderedItemIds.length) return;
    const orderIndex = new Map(orderedItemIds.map((id, i) => [id, i]));
    const decorated = foto.orbs.map((o, i) => ({ o, i }));
    decorated.sort((a, b) => {
      const ra = orderIndex.has(a.o.itemId) ? orderIndex.get(a.o.itemId) : (10000 + a.i);
      const rb = orderIndex.has(b.o.itemId) ? orderIndex.get(b.o.itemId) : (10000 + b.i);
      return ra - rb;
    });
    foto.orbs = decorated.map((d) => d.o);
    DB.saveAmbientePhoto(foto).catch(() => {});
    // Mesmo padrão de `_commitSameMapReorder`: reconstrói os dois modos
    // (Grade — já refletia a ordem nova via mutação direta do Flip, mas
    // reconstruir garante que tudo (contagens, `--organize-cols`, wiring)
    // continua consistente com `foto.orbs` — e Cartões, que só lê o array
    // de novo do zero).
    this._refreshGridCardBody(entry);
    this._refreshCardBody(entry);
  },

  // =======================================================================
  // ITEM "arrastar e soltar" (02/09/2026, rodada C, REESCRITO na rodada D)
  // — pedido gigante do usuário, verbatim (trecho central, rodada C): "O
  // objetivo com tudo isso é poder clicar e arrastar: fotos, patrimônios,
  // planta, vinculações de uma mapa para o outro e dentro do mesmo mapa com
  // flipagens." Implementado SÓ pra fotos e patrimônios (plaquinhas) na
  // Grade — arrastar a PRÓPRIA planta (o cartão do mapa) já existe
  // (`_wireGridCardDrag`/`_wireGridCardBackgroundDrag`, reposiciona na
  // grade; mesclar mapas já existe via `_wireCardDragDrop`/`_mergeMaps`,
  // arrastando pela alça "✥" no modo Cartões) — ESCOPO DELIBERADAMENTE FORA
  // desta rodada, ver "SIMPLIFICAÇÕES DELIBERADAS" mais abaixo.
  //
  // REESCRITO na rodada D (02/09/2026), pedido verbatim: "Atualmente, ao
  // clicar em uma plaquinha de metal, todas são selecionadas. Não deve ser
  // assim [...] Enquanto a plaquinha de metal estiver dentro do próprio
  // mapa, deve ficar somente ela sendo 'arrastada' [...] Quando for assim,
  // deve ir surgindo um retângulo azul do mesmo formato que o patrimônio
  // (para acomodá-lo) na nova posição [...] A plaquinha de metal que estava
  // ali, deve ser flipada (em um movimento de animação) para o vizinho [...]
  // Veja como é feita a flipagem no botão 'Ver lista simples' [...] deve ser
  // assim. A única diferença é que, em vez de ficar 'vazio' [...] deve
  // surgir um retângulo tracejado azul no mesmo formato que a plaquinha." E
  // ainda, sobre cruzar pra outro mapa: "Entre mapas diferentes, arrastando
  // uma plaquinha de metal [...] (se houver alguma marcação em foto, tanto a
  // foto quanto as vinculações nela devem 'ir junto', como já é atualmente)"
  // — ou seja, o "grupo" (foto+irmãos) só deve existir DURANTE um arrasto
  // que cruza pra OUTRO mapa, nunca enquanto o arrasto ainda está dentro do
  // mapa de origem (causa raiz do bug reportado: a versão da rodada C
  // montava o grupo JÁ NA CRIAÇÃO da sessão, sempre, mesmo pra reordenar
  // dentro do próprio mapa — visualmente indistinguível de "selecionar
  // todas as plaquinhas vinculadas à mesma foto").
  //
  // Arquitetura (Pointer Events, mesma base da rodada C — NÃO a API nativa
  // de Drag and Drop usada por `_wireCardDragDrop`/Cartões):
  //  1) `_wireGridDragSource`/`_beginCardDrag` — inalterados (limiar de
  //     movimento antes de virar arrasto de verdade).
  //  2) `_createDragSession` — cria a sessão com o fantasma de UM ELEMENTO
  //     SÓ (o item ou a foto — nunca o grupo, ver acima) + o placeholder
  //     tracejado (`.organize-drag-placeholder-src`) no lugar de origem.
  //     ITEM D1 (fidelidade visual do fantasma), pedido verbatim: "ela deve
  //     permanecer com o mesmo aspecto visual (atualmente, a fonte fica
  //     menor, os cantos arredondados ficam menores, o contorno aplicado,
  //     etc)." CAUSA: o fantasma vive em `document.body`, FORA do
  //     `<canvas>` da grade que tem `transform:scale(_gridZoom)` (ver
  //     comentário grande no topo de `_gridZoom`) — a versão da rodada C
  //     forçava `width`/`height` pro tamanho JÁ AMPLIADO na tela
  //     (`rect.width/height`, que já reflete o zoom), mas o CONTEÚDO interno
  //     (clone do elemento) continuava com seu CSS original (font-size,
  //     border-radius, border etc. em px "reais", sem zoom) — resultado:
  //     caixa do tamanho certo, conteúdo interno proporcionalmente
  //     "encolhido" dentro dela. CORRIGIDO aplicando o MESMO fator de zoom
  //     como `transform:scale()` no `.organize-drag-ghost-wrap` inteiro
  //     (`transform-origin:top left`, ver CSS) — os clones internos usam o
  //     tamanho NATURAL (`rect.width/height / zoom`) e é o `transform` que
  //     amplia TUDO junto (caixa + fonte + cantos + contorno), exatamente
  //     como o `<canvas>` da grade já faz com o cartão original.
  //  3) `_updateDragSession` — a cada `pointermove`: reposiciona o fantasma;
  //     detecta se há um cartão de OUTRO mapa por baixo do cursor
  //     (`_findDropMapCard`, inalterado) e, quando esse estado MUDA, chama
  //     `_expandGhostBundle`/`_collapseGhostBundle` (ITEM D3/D4 — o "grupo"
  //     nasce/morre exatamente na fronteira de entrar/sair de outro mapa) e
  //     `_updateDestAccommodation` (ITEM D2, ver abaixo). Quando NÃO há
  //     cartão de destino (ainda dentro do mapa de origem, ou fora de
  //     qualquer cartão), chama `_updateSameMapReorderPreview` (ITEM D4/D5)
  //     a cada movimento.
  //  4) `_updateSameMapReorderPreview` — a técnica FLIP de verdade (mesma de
  //     `flip.js`/`Flip.makeSortable`, lido por completo antes desta
  //     implementação, reaproveitada aqui à mão em vez de importar o módulo
  //     porque a sessão de arrasto já tem sua própria máquina de estados
  //     híbrida mesmo-mapa/entre-mapas, que `Flip.makeSortable` sozinho não
  //     cobre): acha o vizinho (`.organize-plaquinha`/`.organize-grid-foto-
  //     item`) sob o cursor dentro do MESMO cartão, MOVE o próprio elemento
  //     de origem (`session.el` — que já É o retângulo tracejado azul, ver
  //     `.organize-drag-placeholder-src` no CSS) pra nova posição no DOM, e
  //     anima (`transform` invertido → identidade, mesma duração/curva do
  //     `flip.js`) cada vizinho que precisou se deslocar por causa disso —
  //     visualmente: "o retângulo tracejado azul rastreia a nova posição
  //     enquanto os vizinhos flipam ao redor dele", exatamente o pedido.
  //     Reaplica-se tanto a patrimônios (`.organize-grid-patrimonios`, só no
  //     modo de ordem 'custom', mesma limitação deliberada de sempre) quanto
  //     a fotos (`.organize-grid-fotos`, sem modo de ordem concorrente —
  //     ver `map.fotoOrder`/`_sortFotosForDisplay`).
  //  5) `_commitSameMapReorder` — ao soltar sem cartão de destino: se algo
  //     realmente moveu (`session._reorderMoved`), lê a ordem FINAL direto
  //     do DOM (já reflete o resultado de todas as flipagens da sessão) e
  //     persiste em `map.itemOrder`/`map.fotoOrder`, conforme o caso.
  //  6) `_finishDragSession` — ao soltar sobre outro mapa: expande o grupo
  //     de vez (deveria já estar expandido, ver 3), anima o fantasma
  //     "voando" até o cartão inteiro (`_flyGhostAway`), executa a
  //     transferência de dados reaproveitando `_movePhotoToMap`/
  //     `_moveItemToMap` (JÁ existentes, JÁ cascateiam os vinculados) e
  //     dispara a "seta 3D" (`_showTransferArrow`). Sem destino nenhum E sem
  //     reordenação: cancela (`_returnDragSession`, o fantasma "volta").
  //
  // ITEM D2 (rodada D), pedido verbatim: "Exatamente no lugar onde vai ficar
  // (ser acomodado) a plaquinha de metal do novo mapa, deve aparecer um
  // retângulo tracejado azul no formato da plaquinha de metal. Se há fotos e
  // patrimônios vinculados a elas também devem ter, cada um, as suas
  // acomodações." — `_updateDestAccommodation` cria (só enquanto paira sobre
  // outro cartão) uma cópia "vazia" do retângulo tracejado
  // (`.organize-drag-dest-preview`, CSS novo) pra CADA elemento do grupo
  // (principal + extras do fantasma), do MESMO tamanho de cada um,
  // acrescentada ao FIM da coluna correspondente do cartão de destino
  // (mesma simplificação já documentada na rodada C pro "voo" do fantasma:
  // a posição PIXEL-EXATA dentro da lista de destino, que mudaria a cada
  // `pointermove`, não é recalculada em tempo real — custo/risco não
  // compensam pra esta rodada).
  //
  // SIMPLIFICAÇÕES DELIBERADAS (documentadas aqui por serem do CONJUNTO —
  // cada uma isolada não justificaria um comentário próprio):
  //  - As "boxes [que] já devem ter os exatos tamanhos de quando a foto e os
  //    patrimônios ficarão ali" (pedido verbatim, rodada C) — o fantasma voa
  //    até o RETÂNGULO DO CARTÃO de destino inteiro, e as caixas de
  //    acomodação (D2, acima) vão pro FIM da coluna, não pra posição
  //    pixel-exata final.
  //  - ITEM "swap de plantas baixas entre mapas" (arrastar a PRÓPRIA planta
  //    baixa de um cartão pra soltar em outro, trocando patrimônios/fotos/
  //    vinculações dos dois de uma vez) — pedido verbatim (rodada D): "será
  //    um swap de plantas baixa entre os dois mapas [...] tudo, entre os
  //    dois mapas envolvidos, dá um swap." DELIBERADAMENTE FORA desta
  //    rodada: o elemento visual que receberia esse novo gesto de arrasto
  //    (`.organize-grid-map-live-wrap`/`.organize-grid-map-live-canvas`, a
  //    miniatura AO VIVO) já tem HOJE um gesto de arrastar-com-o-mouse
  //    inteiramente diferente e pré-existente (pan da câmera da miniatura,
  //    ver `_wireGridLiveMap`, item D6 desta MESMA rodada) — os dois gestos
  //    (pan vs. "pegar a planta inteira e jogar em outro mapa") usariam o
  //    MESMO `pointerdown` no MESMO elemento, sem nenhum sinal (modificador
  //    de teclado, alça separada, etc.) pedido pelo usuário pra distingui-
  //    los; inventar um critério de distinção não pedido arriscava quebrar o
  //    pan (recém-corrigido no item D6) OU nascer ambíguo/frágil. Registrado
  //    aqui como pendência clara pra uma futura rodada, quando o usuário
  //    puder esclarecer como os dois gestos devem conviver no mesmo lugar.
  //  - ITEM "reordenar vinculações por arrasto" (chips dentro de uma foto —
  //    `.organize-vinc-chip-foto` — e chips da planta baixa —
  //    `.organize-vinc-chip-map`) — pedido verbatim (rodada D): "Dentro do
  //    mesmo mapa, entre vinculações da foto [...]"/"[...] entre vinculações
  //    da planta baixa [...] apenas muda a ordem." DELIBERADAMENTE FORA
  //    desta rodada, mesmo motivo de escopo/tempo da rodada C (ver histórico
  //    do arquivo) — o mecanismo FLIP genérico construído aqui
  //    (`_updateSameMapReorderPreview`/`_commitSameMapReorder`) já foi
  //    pensado pra ser extensível a mais um `containerSel`/`itemSel`
  //    (chips), mas persistir a ordem exigiria decidir ONDE gravá-la
  //    (`foto.orbs` já é um array — reordenável em tese sem campo novo; a
  //    lista de vinculações da planta não tem essa mesma estrutura hoje) —
  //    ficou de fora pra não arriscar meia-implementação sem teste completo
  //    nesta rodada já muito grande. A tesourinha "✂️" continua sendo o
  //    único jeito de MEXER nessas 2 listas por ora.
  // =======================================================================
  //
  // RODADA SEGUINTE (02/09/2026) — pedido do usuário reenviando (numa
  // conversa nova) o MESMO pedido gigante da rodada D verbatim, com a
  // observação de que, na prática, 3 coisas continuavam sem funcionar (mais
  // um novo pedido geral: "Vá inserindo comentários explicando o pedido/
  // motivo da mudança com a data para que tudo seja documentado" — o porquê
  // deste próprio bloco existir):
  //  - "Não está dando para trocar de posição entre uma foto mais à
  //    esquerda e uma foto na direita, no mesmo mapa." — CORRIGIDO, ver
  //    comentário grande em `_updateSameMapReorderPreview` (eixo de
  //    comparação X/Y errado).
  //  - "Não está dando para trocar as plaquinhas de metal de posição, entre
  //    elas, no mesmo mapa." — CORRIGIDO, ver comentários grandes em
  //    `_updateSameMapReorderPreview`/`_commitSameMapReorder` (bloqueio "só
  //    no modo 'custom'" removido — a rodada D tinha implementado a
  //    flipagem de verdade, mas deixou esse bloqueio ANTIGO, de uma decisão
  //    de design de uma rodada AINDA MAIS ANTIGA — ver "DECISÃO DE DESIGN
  //    pro modo 'custom'" no comentário grande do bloco de "5 modos" mais
  //    acima — sem remover, silenciosamente fazendo o arrasto não fazer
  //    nada fora desse modo específico).
  //  - "Não está dando para trocar os patrimônios (em baixo das fotos) de
  //    lugar entre eles, no mesmo mapa." — isto é reordenar os CHIPS de
  //    vinculação dentro do bloco de cada foto (`.organize-vinc-chip-foto`)
  //    — o MESMO item "reordenar vinculações por arrasto" que a rodada D já
  //    tinha documentado como DELIBERADAMENTE FORA de escopo (ver
  //    "SIMPLIFICAÇÕES DELIBERADAS" logo acima) por falta de tempo/risco
  //    numa rodada já muito grande. CONTINUA FORA DE ESCOPO nesta rodada
  //    também — não é um bug (nunca existiu), é uma FEATURE NOVA ainda não
  //    construída, que mexe numa parte diferente do código (os chips de
  //    vinculação, com seus próprios estados "pendente"/"fantasma" de
  //    exclusão, ver `_vincChipHtml`) e merece sua própria rodada dedicada
  //    com verificação visual de verdade antes de entregar — encaixar isso
  //    de última hora junto dos 2 bugs acima, sem poder testar no navegador
  //    nesta sessão (ambiente de trabalho remoto indisponível nesta
  //    rodada), arriscava quebrar tanto a feature nova quanto os 2 bugs já
  //    corrigidos. Registrado aqui pra retomar.
  //  - "Transforma em tabela. O conceito de grade e células vai ajudar." —
  //    interpretado como o CONCEITO (tratar cada contêiner como uma grade
  //    de linhas/colunas na hora de decidir "antes ou depois de qual
  //    vizinho" — ver `sameRow` no comentário grande em
  //    `_updateSameMapReorderPreview`), não uma reescrita literal pra
  //    elementos `<table>` de verdade: `.organize-grid-patrimonios` e
  //    `.organize-grid-fotos` já SÃO estruturalmente uma grade (`display:
  //    grid`/`flex-wrap`, cada "célula" um `.organize-plaquinha`/
  //    `.organize-grid-foto-item`) — o que faltava era o CÁLCULO de arrasto
  //    raciocinar em termos de linha/coluna, não o HTML em si. Reescrever
  //    pra `<table>` literal tocaria praticamente toda a árvore de DOM/CSS
  //    do Organizar (milhares de linhas, dezenas de seletores já ajustados
  //    rodada após rodada, ver histórico grande deste arquivo) sem poder
  //    verificar visualmente no navegador nesta sessão — risco alto demais
  //    pra decidir sozinho sem confirmar com o usuário primeiro. Se a
  //    intenção era mesmo elementos `<table>`/`<tr>`/`<td>` literais (por
  //    outro motivo, ex.: acessibilidade, cópia/cola em planilha), fica
  //    como pendência pra esclarecer numa próxima rodada.
  // =======================================================================
  //
  // RODADA DE CORREÇÃO (02/09/2026) — o usuário corrigiu/completou o pedido
  // da rodada anterior (ver bloco logo acima) com 4 esclarecimentos, cada um
  // com sua própria mudança:
  //  - "Deve ser possível trocar de posição os patrimônios (vinculações, em
  //    baixo das fotos) entre eles também." — IMPLEMENTADO agora (era o
  //    item que a rodada anterior tinha deixado de fora por segurança/falta
  //    de tempo). Ver `_wireGridFotosWrap` (`Flip.makeSortable` na lista de
  //    chips) e `_commitVincChipFotoReorder` (persiste em `foto.orbs`).
  //  - "Ao mover uma foto de um mapa para o outro, basta o cursor sair do
  //    mapa atual para ativar o 'levar junto' [...]" — CORRIGIDO: o grupo
  //    (D3) agora expande ao SAIR do cartão de origem (não mais só ao
  //    ENTRAR em cima de outro mapa) — ver comentário grande em
  //    `_updateDragSession`.
  //  - "[...] isso deve se manter [x colunas e y linhas] no 'levar junto'
  //    [...]" — CORRIGIDO pra plaquinhas de metal (`bundle.itemEls`): o
  //    fantasma agora usa um sub-grid (`.organize-drag-ghost-itemsgrid`)
  //    com o MESMO número de colunas (`--organize-cols`) que elas tinham no
  //    cartão de origem — ver `_expandGhostBundle`.
  //  - "[...] e no novo mapa [...] os retângulos de acomodação [...] já
  //    dispostos [...]" — os retângulos de acomodação (D2,
  //    `_updateDestAccommodation`) já são acrescentados DENTRO dos
  //    contêineres reais de destino (`.organize-grid-patrimonios`/
  //    `.organize-vinc-list-gridcols`, ambos `display:grid` com o número de
  //    colunas do MAPA DE DESTINO) — então já aparecem "em grade" ali, só
  //    que adotando a grade do DESTINO (não copiando a forma da origem, que
  //    nem sempre bate: os dois mapas podem ter contagens de coluna
  //    diferentes) e sempre no FIM da lista, não na posição pixel-exata
  //    final — mesma simplificação deliberada já documentada desde a rodada
  //    C (recalcular a posição exata a cada `pointermove` não compensa).
  //    NÃO alterado nesta rodada.
  //  - A organização dos chips de vinculação (`.organize-vinc-chip-foto`,
  //    "x linhas e y colunas") especificamente DENTRO do fantasma/das caixas
  //    de acomodação durante um arrasto ENTRE MAPAS — CONTINUA fora de
  //    escopo: hoje, arrastar uma FOTO entre mapas já leva a foto inteira
  //    (com seu `foto.orbs` intacto, ordem preservada — a reordenação nova,
  //    item acima, não é desfeita por uma transferência de mapa) — só o
  //    fantasma/as caixas de acomodação não desenham esses chips como peças
  //    separadas (mostram a foto + as PLAQUINHAS vinculadas, que é o que já
  //    existia). Adicionar os chips como peças extras do fantasma, com sua
  //    própria forma preservada, é viável (mesma técnica do sub-grid acima)
  //    mas não estava claramente pedido neste nível de detalhe — registrado
  //    aqui pra confirmar se é isso mesmo antes de mexer.
  //  - Botão "+" esquerdo do "Ver em 3D" — REVERTIDO (não é código deste
  //    arquivo — ver comentário grande em `js/view3d.js`, onde o botão novo
  //    indevido foi removido).
  //  - NÃO TESTADO empiricamente de novo nesta rodada (mesmo motivo já
  //    registrado no bump de v341 em sw.js: ambiente de trabalho remoto do
  //    usuário indisponível + pedido de não usar Playwright) — revisão de
  //    código cuidadosa, mas peço verificação manual antes de fechar.
  // =======================================================================

  /** Limiar de movimento (px) antes de um `pointerdown` num item arrastável
   *  virar arrasto de verdade — abaixo disso continua sendo um CLIQUE normal
   *  (abre editor/foto, como sempre). */
  _DRAG_THRESHOLD: 6,

  /** Liga o gesto de arrastar num elemento de origem (`.organize-grid-foto-
   *  item` ou `.organize-plaquinha`) — `kind` é `'foto'` ou `'item'`. */
  _wireGridDragSource(el, kind, entry, card) {
    const EXCLUDE = kind === 'foto'
      ? '.organize-grid-foto-name, .organize-grid-foto-del-btn, .organize-vinc-chip-foto, .organize-vinc-chip-unlink, .organize-foto-orbdot, .organize-pending-undo-inline, button, input'
      : '.organize-plaquinha-photoicon, .organize-plaquinha-del-btn, .organize-reorder-btn, .organize-pending-undo-inline, button';
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // só botão esquerdo (pedido verbatim: "com o botão esquerdo ainda pressionado")
      if (e.target.closest(EXCLUDE)) return;
      this._beginCardDrag(e, kind, el, entry, card);
    });
  },

  /** Início do gesto: só ARMA o arrasto (guarda a posição inicial) — a
   *  sessão de verdade (`_createDragSession`, com placeholder+fantasma) só
   *  nasce depois de passar do `_DRAG_THRESHOLD`, pra não atrapalhar um
   *  clique normal. */
  _beginCardDrag(e, kind, el, entry, card) {
    const startX = e.clientX, startY = e.clientY;
    const pointerId = e.pointerId;
    let dragging = false;
    let session = null;
    const onMove = (ev) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < this._DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < this._DRAG_THRESHOLD) return;
        dragging = true;
        try { el.setPointerCapture(pointerId); } catch (err) { /* elemento pode já ter sido substituído por um refresh — ignora */ }
        session = this._createDragSession(kind, el, entry, card, ev);
        if (!session) { dragging = false; return; }
        // CORRIGIDO (02/09/2026, rodada D, verificação empírica com
        // Playwright dos itens D4/D5) — guarda o `pointerId` NA sessão:
        // `_updateSameMapReorderPreview` precisa dele pra RE-CAPTURAR o
        // ponteiro depois de mover `session.el` no DOM (ver comentário
        // grande lá — o bug que isto corrige).
        session.pointerId = pointerId;
      }
      this._updateDragSession(session, ev);
    };
    const cleanup = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
    const onUp = (ev) => {
      cleanup();
      if (!dragging || !session) return;
      // Marca pra suprimir o `click` sintético que o navegador dispara logo
      // em seguida do `pointerup` (senão um arrasto terminaria abrindo o
      // editor do item/a tela da foto, como se tivesse sido um clique
      // normal) — lido por um listener em CAPTURA no próprio cartão, ligado
      // 1x em `_wireGridCard` (ver `_suppressNextGridClick`).
      this._suppressNextGridClick = true;
      this._finishDragSession(session, ev);
    };
    const onCancel = () => {
      cleanup();
      if (dragging && session) this._returnDragSession(session).then(() => this._destroyGhost(session));
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
  },

  /** Constrói o "cartão fantasma" de UM ELEMENTO SÓ (ver comentário grande
   *  acima do bloco — o "grupo" nasce depois, sob demanda, via
   *  `_expandGhostBundle`) + marca o elemento de origem como placeholder
   *  tracejado. Devolve `null` se não achar o registro de dados
   *  correspondente (ex.: DOM ficou fora de sincronia por causa de um
   *  refresh no meio do caminho). */
  _createDragSession(kind, el, entry, card, ev) {
    const mapId = entry.map.id;
    const rect = el.getBoundingClientRect();
    const id = kind === 'foto' ? el.dataset.fotoId : el.dataset.itemId;
    if (!id) return null;
    const registro = kind === 'foto' ? entry.fotos.find((f) => f.id === id) : entry.itens.find((it) => it.id === id);
    if (!registro) return null;

    el.classList.add('organize-drag-placeholder-src');

    // ITEM D1 (rodada D) — ver explicação completa no comentário grande
    // acima do bloco. `zoom` só é != 1 na Grade (`_gridZoom`); no modo
    // Cartões esta sessão nem é criada (arrasto só existe na Grade).
    const zoom = this._viewMode === 'grid' ? (this._gridZoom || 1) : 1;
    const ghostWrap = document.createElement('div');
    ghostWrap.className = 'organize-drag-ghost-wrap';
    ghostWrap.style.transform = `scale(${zoom})`;
    const mainGhost = el.cloneNode(true);
    mainGhost.classList.remove('organize-drag-placeholder-src');
    mainGhost.classList.add('organize-drag-ghost-main');
    mainGhost.style.width = (rect.width / zoom) + 'px';
    mainGhost.style.height = (rect.height / zoom) + 'px';
    ghostWrap.appendChild(mainGhost);
    ghostWrap.style.left = rect.left + 'px';
    ghostWrap.style.top = rect.top + 'px';
    document.body.appendChild(ghostWrap);
    card.classList.add('organize-grid-card-drag-origin');
    return {
      kind, id, mapId, entry, card, el, rect, ghostWrap, zoom,
      offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top,
      hoveredCard: null,
      bundle: null, bundleExpanded: false, bundleGhostEls: [], _bundleGridEl: null, // ver `_expandGhostBundle`/`_collapseGhostBundle`
      destPreviewEls: [], destPreviewCard: undefined, // ver `_updateDestAccommodation` (D2)
      _reorderMoved: false, _reorderLockUntil: 0, // ver `_updateSameMapReorderPreview` (D4/D5)
    };
  },

  /** Calcula (sem aplicar nada ainda) quem "vem junto" no grupo — a MESMA
   *  regra de dados da rodada C (foto arrastada → patrimônios vinculados a
   *  ela; patrimônio arrastado → a foto dele + os outros patrimônios
   *  vinculados a ela), só que agora extraída à parte pra ser chamada SOB
   *  DEMANDA (`_expandGhostBundle`), nunca na criação da sessão — ver
   *  comentário grande acima do bloco (ITEM D3). */
  _computeDragBundle(session) {
    const { kind, id, entry, card } = session;
    let fotoEl = null;
    let itemEls = [];
    if (kind === 'foto') {
      const foto = entry.fotos.find((f) => f.id === id);
      const linkedIds = foto ? [...new Set((foto.orbs || []).map((o) => o.itemId).filter(Boolean))] : [];
      itemEls = linkedIds.map((iid) => card.querySelector(`.organize-plaquinha[data-item-id="${CSS.escape(iid)}"]`)).filter(Boolean);
    } else {
      const fotoComOrb = entry.fotos.find((f) => (f.orbs || []).some((o) => o.itemId === id));
      if (fotoComOrb) {
        fotoEl = card.querySelector(`.organize-grid-foto-item[data-foto-id="${CSS.escape(fotoComOrb.id)}"]`);
        itemEls = (fotoComOrb.orbs || [])
          .map((o) => o.itemId)
          .filter((iid) => iid && iid !== id)
          .map((iid) => card.querySelector(`.organize-plaquinha[data-item-id="${CSS.escape(iid)}"]`))
          .filter(Boolean);
      }
    }
    return { fotoEl, itemEls };
  },

  /** ITEM D3/D4 (rodada D) — expande o fantasma pro "grupo" (foto+irmãos)
   *  no exato instante em que o arrasto sai de cima do cartão de ORIGEM (ver
   *  `_updateDragSession`, gatilho mudou 02/09/2026 — comentário grande lá)
   *  — idempotente (não faz nada se já expandido).
   *  CORRIGIDO (02/09/2026), pedido do usuário verbatim: "Se, nos
   *  patrimônios (plaquinhas de metal), eles estavam organizados em x
   *  colunas e y linhas, isso deve se manter no 'levar junto' (enquanto
   *  está arrastando)." ANTES, TODOS os extras (foto + plaquinhas, ou só as
   *  plaquinhas) eram empilhados numa única coluna vertical dentro do
   *  fantasma (`.organize-drag-ghost-wrap` é um `flex-direction:column`).
   *  CORRIGIDO: as plaquinhas (`bundle.itemEls`) agora vão dentro de um
   *  sub-grid próprio (`.organize-drag-ghost-itemsgrid`, CSS novo) com o
   *  MESMO número de colunas que elas tinham no cartão de ORIGEM — lido
   *  direto da variável CSS `--organize-cols` que `_renderGridPatrimonios`
   *  já grava inline naquela grade (a mesma fonte de verdade usada pra
   *  desenhá-las lá, sem precisar recalcular nada). A foto (quando faz
   *  parte do grupo — arrastando um patrimônio) continua numa linha própria
   *  acima do sub-grid, já que é um elemento visualmente diferente, não uma
   *  "coluna a mais" do mesmo tipo. */
  _expandGhostBundle(session) {
    if (session.bundleExpanded) return;
    const bundle = session.bundle || (session.bundle = this._computeDragBundle(session));
    session.bundleExpanded = true;
    bundle.fotoEl?.classList.add('organize-drag-placeholder-src');
    bundle.itemEls.forEach((ie) => ie.classList.add('organize-drag-placeholder-src'));
    const patrColOrigem = session.card.querySelector('.organize-grid-patrimonios');
    const colsOrigem = Math.max(1, parseInt(patrColOrigem?.style.getPropertyValue('--organize-cols'), 10) || 1);
    const makeGhostEl = (extra) => {
      const r = extra.getBoundingClientRect();
      const g = extra.cloneNode(true);
      g.classList.remove('organize-drag-placeholder-src');
      // `-enter` (CSS: opacity/scale inicial + transição) — some no próximo
      // frame, produzindo a "entrada" do extra no fantasma. Pedido verbatim
      // (rodada D): "tudo isso com transições de movimento, nada pode
      // 'aparecer do nada'."
      g.classList.add('organize-drag-ghost-extra', 'organize-drag-ghost-extra-enter');
      g.style.width = (r.width / session.zoom) + 'px';
      g.style.height = (r.height / session.zoom) + 'px';
      requestAnimationFrame(() => requestAnimationFrame(() => g.classList.remove('organize-drag-ghost-extra-enter')));
      return g;
    };
    session.bundleGhostEls = [];
    // Kind 'foto': a foto arrastada JÁ é o fantasma principal — o grupo
    // aqui é só as plaquinhas vinculadas a ela.
    if (session.kind === 'item' && bundle.fotoEl) {
      const gf = makeGhostEl(bundle.fotoEl);
      session.ghostWrap.appendChild(gf);
      session.bundleGhostEls.push(gf);
    }
    if (bundle.itemEls.length) {
      const grid = document.createElement('div');
      grid.className = 'organize-drag-ghost-itemsgrid';
      grid.style.setProperty('--organize-ghost-cols', colsOrigem);
      bundle.itemEls.forEach((extra) => {
        const g = makeGhostEl(extra);
        grid.appendChild(g);
        session.bundleGhostEls.push(g);
      });
      session.ghostWrap.appendChild(grid);
      session._bundleGridEl = grid;
    }
  },

  /** Inverso de `_expandGhostBundle` — volta o fantasma pra UM ELEMENTO SÓ
   *  quando o arrasto volta pra CIMA do cartão de origem (ver
   *  `_updateDragSession`). */
  _collapseGhostBundle(session) {
    if (!session.bundleExpanded) return;
    session.bundleExpanded = false;
    session.bundle?.fotoEl?.classList.remove('organize-drag-placeholder-src');
    session.bundle?.itemEls?.forEach((ie) => ie.classList.remove('organize-drag-placeholder-src'));
    (session.bundleGhostEls || []).forEach((g) => g.remove());
    session.bundleGhostEls = [];
    // NOVO (02/09/2026) — o sub-grid (`.organize-drag-ghost-itemsgrid`, ver
    // `_expandGhostBundle`) é um elemento a mais que não estava na lista de
    // `bundleGhostEls` (que só guarda as PLAQUINHAS/foto clonadas, não o
    // wrapper delas) — removê-lo também some com os filhos junto, mas
    // remover explicitamente evita um wrapper vazio "fantasma" (sem
    // conteúdo, mas ainda ocupando o `gap` do flex) sobrevivendo no DOM.
    session._bundleGridEl?.remove();
    session._bundleGridEl = null;
  },

  /** ITEM D2 (rodada D) — mostra/atualiza as caixas de "acomodação"
   *  (retângulos tracejados vazios) no cartão de destino, uma pra CADA
   *  elemento hoje visível no fantasma (principal + extras do grupo, se
   *  expandido) — ver comentário grande acima do bloco. Só recalcula quando
   *  o cartão de destino muda (chamado de `_updateDragSession` junto da
   *  detecção de troca de `hoveredCard`/expansão do grupo). */
  _updateDestAccommodation(session, target) {
    this._clearDestAccommodation(session);
    session.destPreviewCard = target;
    if (!target) return;
    const patrCol = target.querySelector('.organize-grid-patrimonios');
    const fotosWrap = target.querySelector('.organize-grid-fotos');
    // CORRIGIDO (rodada seguinte, 02/09/2026), pedido do usuário verbatim:
    // "o retângulo aparece embaixo de um bloco de foto do outro mapa,
    // porém, ao ser movido, acaba ficando do lado. Primeiro verifique no
    // mapa de destino qual a quantidade de colunas [...] e considere isso
    // ao posicionar o retângulo." A caixa já é um FILHO DE VERDADE da
    // grade de destino (`fotosWrap`/`patrCol`, ambos `display:grid` com
    // `--organize-cols` do MAPA DE DESTINO) — o auto-flow do grid já
    // encaixa ela na célula/coluna certa sozinho, sem precisar calcular
    // linha/coluna manualmente. O que estava ERRADO era o TAMANHO: `w`/`h`
    // vinham de `session.rect` (o tamanho de tela do item na ORIGEM,
    // convertido pelo zoom) — pras fotos, desde que `.organize-grid-fotos`
    // virou uma grade de trilho FIXO (`--organize-foto-w`, ver
    // style.css), o tamanho de verdade que a foto vai ter NO DESTINO é
    // SEMPRE esse valor fixo, não importa o tamanho que ela tinha na
    // origem — uma caixa de acomodação MENOR ou MAIOR que o trilho fixo
    // fica visualmente desalinhada da célula de verdade (mesmo ocupando a
    // célula certa por trás), dando a impressão de "ficar do lado" quando
    // a foto de verdade (essa sim sempre do tamanho fixo) se acomoda. Pras
    // fotos, `w`/`h` agora `null` — `addBox` (abaixo) pula o `style.width/
    // height` inline nesse caso e deixa a classe CSS
    // `.organize-drag-dest-preview-foto` (que já lê `--organize-foto-w`,
    // a MESMA variável usada pelo trilho de verdade) desenhar do tamanho
    // exato da célula. As plaquinhas continuam usando `session.rect`
    // (`--organize-plaquinha-w` já é fixo em TODO mapa, então o tamanho de
    // origem já bate com o de destino — nunca foi o problema relatado).
    const addBox = (container, w, h, isFoto) => {
      if (!container) return;
      const box = document.createElement('div');
      box.className = `organize-drag-dest-preview${isFoto ? ' organize-drag-dest-preview-foto' : ' organize-drag-dest-preview-item'}`;
      if (w != null) box.style.width = w + 'px';
      if (h != null) box.style.height = h + 'px';
      container.appendChild(box);
      requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('organize-drag-dest-preview-in')));
      session.destPreviewEls.push(box);
    };
    if (session.kind === 'item') {
      addBox(patrCol, session.rect.width / session.zoom, session.rect.height / session.zoom, false);
    } else {
      addBox(fotosWrap, null, null, true);
    }
    // CORRIGIDO (02/09/2026), pedido do usuário verbatim: "o retângulo de
    // acomodação da plaquinha de metal deve ser do exato tamanho de quando
    // ela vai ficar ali (atualmente está menor nas dimensões)." CAUSA
    // RAIZ: `getBoundingClientRect()` devolve pixels de TELA (já
    // multiplicados pelo zoom da grade, ver `ghostWrap.style.transform =
    // scale(zoom)` em `_createDragSession`) — o retângulo PRINCIPAL (a
    // caixa logo acima, `addBox(..., session.rect.width / session.zoom,
    // ...)`) já divide pelo zoom antes de desenhar, porque essa caixa é
    // filha de um container que TAMBÉM está dentro da árvore com o
    // `transform: scale(zoom)` do canvas da grade (`_applyGridTransform`)
    // — sem dividir, o navegador aplicaria o zoom DUAS vezes (uma no
    // `width`/`height` inline em px de tela, outra de novo pelo `transform`
    // herdado do ancestral), encolhendo (zoom < 1, o caso mais comum, grade
    // "cabendo" vários mapas de uma vez) ou aumentando (zoom > 1) o
    // retângulo desenhado — exatamente o "menor nas dimensões" relatado.
    // As caixas do GRUPO (plaquinhas/foto que "vêm junto", abaixo) tinham
    // esse MESMO bug — só a caixa principal dividia por zoom, estas não.
    if (session.bundleExpanded && session.bundle) {
      // Mesmo motivo do bloco acima ("fica do lado"): a foto do grupo
      // (que "vem junto" com a plaquinha arrastada) também vai cair numa
      // grade de trilho FIXO no destino — tamanho vindo de `r.width/r.
      // height` (origem) não bate mais necessariamente com o trilho fixo.
      // `null` aqui também, mesma razão/mesma correção do box principal de
      // foto logo acima.
      if (session.kind === 'item' && session.bundle.fotoEl) {
        addBox(fotosWrap, null, null, true);
      }
      session.bundle.itemEls.forEach((ie) => {
        const r = ie.getBoundingClientRect();
        addBox(patrCol, r.width / session.zoom, r.height / session.zoom, false);
      });
    }
  },

  _clearDestAccommodation(session) {
    (session.destPreviewEls || []).forEach((b) => b.remove());
    session.destPreviewEls = [];
    session.destPreviewCard = undefined;
  },

  /** ITEM D4/D5 (rodada D) — a cada `pointermove` em que o cursor NÃO está
   *  sobre outro cartão de mapa: se estiver dentro da lista correspondente
   *  do PRÓPRIO cartão de origem, faz a "flipagem" ao vivo (ver explicação
   *  completa/técnica no comentário grande acima do bloco). */
  _updateSameMapReorderPreview(session, ev) {
    const isItem = session.kind === 'item';
    const isFoto = session.kind === 'foto';
    if (!isItem && !isFoto) return;
    // REMOVIDO (02/09/2026) o bloqueio "só arrasta com o modo de ordem já em
    // 'custom'" que existia aqui (rodada C, mantido sem mudança na rodada
    // D — ver comentário antigo, substituído por este). Pedido do usuário
    // verbatim, reenviado numa rodada nova porque continuava não
    // funcionando na prática: "Não está dando para trocar as plaquinhas de
    // metal de posição, entre elas, no mesmo mapa." CAUSA RAIZ: nada no
    // pedido original menciona precisar escolher o modo 'custom' (✋, no
    // menu "▾ Ver todas as opções de ordem") ANTES de arrastar — a pessoa
    // simplesmente arrasta a plaquinha, o que já É, por si só, o pedido de
    // "ordem personalizada". Com o modo padrão ('inserted', o de sempre ao
    // abrir o app pela 1ª vez num mapa) ativo, o `return` antigo fazia o
    // gesto inteiro de arrastar não acontecer NADA, sem nenhum aviso —
    // parecia simplesmente quebrado. CORRIGIDO: a flipagem ao vivo agora
    // roda em QUALQUER modo; é `_commitSameMapReorder` (logo abaixo) quem
    // troca o mapa pro modo 'custom' NA HORA de soltar, não mais uma pré-
    // condição pra começar a arrastar. Fotos nunca tiveram esse bloqueio
    // (não têm modo concorrente, D5).
    const containerSel = isItem ? '.organize-grid-patrimonios' : '.organize-grid-fotos';
    const itemSel = isItem ? '.organize-plaquinha' : '.organize-grid-foto-item';
    const col = session.card.querySelector(containerSel);
    if (!col) return;
    const elAtPoint = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!elAtPoint || !col.contains(elAtPoint)) return;
    const targetItem = elAtPoint.closest(itemSel);
    if (!targetItem || targetItem === session.el) return;
    const now = performance.now();
    if (now < session._reorderLockUntil) return; // mesmo "swap lock" do flip.js — evita troca em cada pixel
    const siblings = [...col.querySelectorAll(itemSel)];
    const beforeRects = new Map(siblings.map((s) => [s, s.getBoundingClientRect()]));
    const targetRect = targetItem.getBoundingClientRect();
    // CORRIGIDO (02/09/2026), pedido do usuário verbatim: "Não está dando
    // para trocar de posição entre uma foto mais à esquerda e uma foto na
    // direita, no mesmo mapa." CAUSA RAIZ: o eixo de comparação era FIXO
    // por tipo — X (horizontal) pra patrimônios, Y (vertical) pra fotos —
    // presumindo que patrimônios sempre ficam lado a lado numa linha só e
    // fotos sempre empilhadas numa coluna só. Na prática os DOIS
    // contêineres (`.organize-grid-patrimonios`, um `display:grid` de
    // várias colunas; `.organize-grid-fotos`, um `flex-wrap` que quebra
    // linha) são GRADES DE VERDADE, com várias linhas E colunas — o eixo
    // certo depende de ONDE o cursor está NAQUELE instante em relação ao
    // alvo, não do tipo do elemento sendo arrastado. Com fotos lado a lado
    // na mesma linha, comparar só por Y nunca detectava "passou da
    // metade" (a posição vertical do cursor dentro da linha não muda
    // conforme ele anda pra esquerda/direita) — soltar à direita de uma
    // foto tinha o mesmo efeito de soltar à esquerda dela. CORRIGIDO
    // tratando o contêiner como uma grade de células (pedido do usuário,
    // mesma mensagem: "Transforma em tabela. O conceito de grade e células
    // vai ajudar."): primeiro decide se o cursor está na MESMA linha do
    // alvo (dentro da faixa vertical do retângulo dele); se estiver,
    // compara horizontalmente (X) — troca dentro da linha; se não estiver
    // (linha acima/abaixo), compara verticalmente (Y) — troca de linha. Um
    // único cálculo serve pros dois tipos, sem presumir a direção do
    // layout.
    const sameRow = ev.clientY > targetRect.top && ev.clientY < targetRect.bottom;
    const pastMiddle = sameRow
      ? (ev.clientX > targetRect.left + targetRect.width / 2)
      : (ev.clientY > targetRect.top + targetRect.height / 2);
    if (pastMiddle) targetItem.after(session.el); else targetItem.before(session.el);
    // CORRIGIDO (02/09/2026, rodada D) — REGRESSÃO REAL achada na
    // verificação empírica com Playwright dos itens D4/D5 (gestos de mouse
    // de verdade, não só leitura estática do código): mover `session.el` no
    // DOM (`.after`/`.before` acima, a técnica FLIP em si) faz o NAVEGADOR
    // soltar sozinho a captura de ponteiro que `_beginCardDrag` tinha dado a
    // ele (`el.setPointerCapture`) — comportamento padrão do DOM: remover/
    // reinserir um elemento captura o evento `lostpointercapture` nele,
    // MESMO reinserindo o MESMO nó (não um clone) e mesmo que a posição
    // final seja idêntica à anterior (ex.: um `insertBefore`/`.before()`
    // "para o próprio lugar onde já estava", ainda assim solta a captura).
    // Sem correção, depois da 1ª troca os `pointermove`/`pointerup`
    // seguintes (ligados só em `session.el`, ver `_beginCardDrag`) param de
    // chegar (voltam a depender do hit-test normal, que já não aponta mais
    // pra `session.el` depois que ele se moveu) — na prática, arrastar pra
    // reordenar TRAVAVA depois da 1ª troca: o fantasma e o retângulo
    // tracejado ficavam presos na tela pra sempre, o `pointerup` de soltar
    // de verdade nunca disparava o `onUp`/`_finishDragSession`, e nada era
    // persistido. RE-CAPTURA aqui, na mesma sessão de eventos, resolve —
    // `session.pointerId` guardado em `_beginCardDrag` no momento em que o
    // arrasto começou.
    try { session.el.setPointerCapture(session.pointerId); } catch (err) { /* elemento pode ter perdido a captura por outro motivo (ex.: pointercancel já disparado) — segue sem travar o resto do fluxo */ }
    session._reorderMoved = true;
    session._reorderLockUntil = now + 190; // um pouco abaixo do DURATION_MS=200 do flip.js, mesmo espírito
    siblings.forEach((s) => {
      if (s === session.el) return;
      const before = beforeRects.get(s);
      const after = s.getBoundingClientRect();
      const dx = before.left - after.left, dy = before.top - after.top;
      if (!dx && !dy) return;
      s.style.transition = 'none';
      s.style.transform = `translate(${dx}px, ${dy}px)`;
      void s.offsetWidth; // força reflow antes de soltar a transição — senão o navegador "funde" os 2 estados e a animação não roda
      s.style.transition = 'transform .2s cubic-bezier(.22,.8,.2,1)';
      s.style.transform = '';
    });
  },

  /** Retorna `true` se o ponto (x,y) da tela cai dentro do retângulo `r`
   *  (`getBoundingClientRect()`) — usado por `_updateDragSession` (02/09/2026)
   *  pra saber se o cursor ainda está em cima do CARTÃO de origem do
   *  arrasto, sem depender de `elementFromPoint`/`closest` (o fantasma cobre
   *  o cursor com `pointer-events:none`, então isso já funcionava, mas
   *  comparar retângulos é mais direto pra "estou dentro deste cartão
   *  específico" do que "qual cartão está sob o cursor agora"). */
  _pointInRect(x, y, r) {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  },

  /** A cada `pointermove` durante um arrasto de verdade: reposiciona o
   *  fantasma (ancorado no mesmo ponto relativo em que o cursor "pegou" o
   *  elemento original), atualiza qual cartão de OUTRO mapa está em baixo
   *  do cursor agora (`.organize-grid-card-drop-target`, ver CSS), expande/
   *  colapsa o grupo (D3) e recalcula as caixas de acomodação (D2). Sem
   *  cartão de destino, tenta a flipagem ao vivo dentro do próprio mapa
   *  (D4/D5). */
  _updateDragSession(session, ev) {
    session.ghostWrap.style.left = (ev.clientX - session.offsetX) + 'px';
    session.ghostWrap.style.top = (ev.clientY - session.offsetY) + 'px';
    const target = this._findDropMapCard(ev.clientX, ev.clientY, session.mapId);
    let precisaAtualizarAcomodacao = false;
    if (target !== session.hoveredCard) {
      session.hoveredCard?.classList.remove('organize-grid-card-drop-target');
      target?.classList.add('organize-grid-card-drop-target');
      session.hoveredCard = target;
      precisaAtualizarAcomodacao = true;
    }
    // CORRIGIDO (02/09/2026), pedido do usuário verbatim: "Ao mover uma foto
    // de um mapa para o outro, basta o cursor sair do mapa atual para
    // ativar o 'levar junto' [...] no novo mapa, com o cursor em cima do
    // novo mapa, (os retângulos de acomodação [...] já dispostos)." ANTES,
    // o grupo (D3/`_expandGhostBundle`) só nascia quando `target` ficava
    // verdadeiro — ou seja, só depois de o cursor já estar EM CIMA de outro
    // cartão. No trecho "no limbo" entre sair da origem e ainda não ter
    // chegado em cima de outro mapa (ou passando por cima de área vazia da
    // tela), o fantasma continuava mostrando só o elemento único, mudando
    // de tamanho de repente só ao entrar no cartão de destino. CORRIGIDO:
    // o grupo agora nasce assim que o cursor DEIXA o retângulo do cartão de
    // ORIGEM (`_pointInRect`, acima) — independente de já haver um cartão
    // de destino ou não — e só colapsa de volta ao retornar pra CIMA do
    // cartão de origem. Isto é INDEPENDENTE de `target` ter mudado (o
    // cursor pode sair da origem e ainda não estar em cima de nada), por
    // isso é uma checagem separada, não mais dentro do mesmo `if` de cima.
    const foraDaOrigem = !this._pointInRect(ev.clientX, ev.clientY, session.card.getBoundingClientRect());
    if (foraDaOrigem !== session.bundleExpanded) {
      if (foraDaOrigem) this._expandGhostBundle(session); else this._collapseGhostBundle(session);
      precisaAtualizarAcomodacao = true;
    }
    if (precisaAtualizarAcomodacao) this._updateDestAccommodation(session, target);
    if (!target) this._updateSameMapReorderPreview(session, ev);
  },

  /** `document.elementFromPoint` acha o cartão de mapa por baixo do cursor,
   *  excluindo o próprio mapa de origem (soltar "em cima do mesmo mapa" é
   *  tratado como reordenação/cancelamento — ver `_finishDragSession`).
   *  Funciona só porque `.organize-drag-ghost-wrap` tem `pointer-events:none`
   *  (CSS) — senão o fantasma "acertaria" a si mesmo. */
  _findDropMapCard(x, y, excludeMapId) {
    const el = document.elementFromPoint(x, y);
    const foundCard = el?.closest('.organize-grid-card');
    if (!foundCard || foundCard.dataset.mapId === excludeMapId) return null;
    return foundCard;
  },

  /** Ao soltar: decide entre transferência pra outro mapa, commit da
   *  reordenação ao vivo dentro do mesmo mapa, ou cancelamento (volta pro
   *  lugar) — ver comentário grande no topo do bloco "arrastar e soltar". */
  async _finishDragSession(session, ev) {
    const target = session.hoveredCard;
    session.card.classList.remove('organize-grid-card-drag-origin');
    target?.classList.remove('organize-grid-card-drop-target');
    // CORRIGIDO (02/09/2026), pedido do usuário verbatim: "a animação de
    // tirar uma foto de um mapa para o outro está se desfazendo e se
    // fazendo de novo [...] ao soltar, os retângulos [de acomodação]
    // primeiro somem depois reaparecem de novo. Esse 'sumir' não deve
    // acontecer." CAUSA RAIZ: `_clearDestAccommodation` (que remove as
    // caixas tracejadas azuis) rodava ALI NA HORA, antes até do fantasma
    // voar pro destino — as caixas sumiam de imediato, e só bem depois (o
    // fantasma tem que terminar de voar, `await _flyGhostAway`, e a
    // mutação de dados + reconstrução do cartão de destino tem que
    // terminar, `await _movePhotoToMap/_moveItemToMap`) o conteúdo REAL
    // aparecia no lugar — esse intervalo com NADA visível ali era o
    // "sumir e reaparecer" relatado. Corrigido adiando o
    // `_clearDestAccommodation` (só no caminho COM cartão de destino) pra
    // DEPOIS dos dois `await` — as caixas ficam visíveis o tempo todo
    // enquanto o fantasma voa e os dados são movidos, e só somem no exato
    // instante em que o conteúdo de verdade (já reconstruído pelo
    // refresh) toma o lugar delas, sem gerar nenhum vazio no meio.
    if (target) {
      const targetMapId = target.dataset.mapId;
      const destRect = target.getBoundingClientRect();
      await this._flyGhostAway(session, destRect);
      this._destroyGhost(session);
      // `_movePhotoToMap`/`_moveItemToMap` (JÁ existentes) cuidam da
      // mutação de dados + `_refreshGridCardBody`/`_refreshCardBody` dos 2
      // cartões (ver comentário grande logo antes de cada uma) — o refresh
      // reconstrói o `innerHTML` de origem/destino do zero, o que já
      // remove sozinho as classes de placeholder aplicadas acima (na origem
      // E nos elementos do grupo, se expandido).
      if (session.kind === 'foto') await this._movePhotoToMap(session.id, targetMapId);
      else await this._moveItemToMap(session.id, targetMapId);
      this._clearDestAccommodation(session);
      this._showTransferArrow(session.rect, destRect);
      return;
    }
    // Sem cartão de destino: tenta consolidar a reordenação ao vivo (D4/D5)
    // ou, se nada moveu de verdade, cancela (volta pro lugar). Aqui SIM
    // limpa logo — não há voo/commit assíncrono nenhum pra "cobrir" a
    // ausência das caixas, então não existe o "sumir e reaparecer" descrito
    // acima (`_returnDragSession`, chamada abaixo, também já limpa por
    // conta própria no cancelamento — limpar 2x é inofensivo, `.forEach`
    // num array já vazio).
    this._clearDestAccommodation(session);
    if (this._commitSameMapReorder(session)) { this._destroyGhost(session); return; }
    await this._returnDragSession(session);
    this._destroyGhost(session);
  },

  /** "A operação é cancelada e a foto 'volta' para o lugar e também os
   *  patrimônios" (pedido verbatim, rodada C) — anima o fantasma de volta
   *  pro retângulo original e desfaz os placeholders (nada mudou nos dados,
   *  então não há refresh que faça esse trabalho por conta própria aqui). */
  async _returnDragSession(session) {
    await this._flyGhostAway(session, session.rect);
    session.el.classList.remove('organize-drag-placeholder-src');
    session.el.style.transform = '';
    session.el.style.transition = '';
    session.bundle?.fotoEl?.classList.remove('organize-drag-placeholder-src');
    session.bundle?.itemEls?.forEach((ie) => ie.classList.remove('organize-drag-placeholder-src'));
    this._clearDestAccommodation(session);
  },

  /** ITEM D4/D5 (rodada D) — ao soltar SEM cartão de destino: se a
   *  flipagem ao vivo (`_updateSameMapReorderPreview`) moveu alguma coisa
   *  nesta sessão, lê a ordem FINAL direto do DOM (já reflete o resultado
   *  de todas as trocas — `session.el`, o próprio placeholder tracejado, já
   *  está fisicamente na posição certa) e persiste — em `map.itemOrder`
   *  (mesmo campo já usado por `_moveCustomOrder`, as setinhas ◀/▶) pra
   *  patrimônios, ou no NOVO `map.fotoOrder` (ver `_sortFotosForDisplay`)
   *  pra fotos. Devolve `false` (sem persistir nada) se nada moveu — nesse
   *  caso `_finishDragSession` cai no cancelamento normal
   *  (`_returnDragSession`). */
  _commitSameMapReorder(session) {
    if (!session._reorderMoved) return false;
    const isItem = session.kind === 'item';
    const containerSel = isItem ? '.organize-grid-patrimonios' : '.organize-grid-fotos';
    const itemSel = isItem ? '.organize-plaquinha' : '.organize-grid-foto-item';
    const col = session.card.querySelector(containerSel);
    if (!col) return false;
    const idAttr = isItem ? 'itemId' : 'fotoId';
    const order = [...col.querySelectorAll(itemSel)].map((elx) => elx.dataset[idAttr]).filter(Boolean);
    const { entry } = session;
    if (isItem) {
      entry.map.itemOrder = order;
      // NOVO (02/09/2026) — ver comentário grande em
      // `_updateSameMapReorderPreview` (remoção do bloqueio "só no modo
      // 'custom'"): arrastar uma plaquinha pra reordenar É o pedido de
      // "ordem personalizada", então troca o mapa pro modo 'custom' NA HORA
      // de soltar, em vez de exigir escolher esse modo antes. Sem isto, a
      // troca acontecia no DOM mas era desfeita no PRÓXIMO render
      // (`_sortItensForDisplay` continuaria usando o critério de ordem
      // ANTIGO, ex.: "Conforme inserido" — que ignora `map.itemOrder`) —
      // pareceria que o arrasto "não fez nada" mesmo já não bloqueado.
      this._itemSortMode[session.mapId] = 'custom';
    } else {
      entry.map.fotoOrder = order;
    }
    DB.saveMap(entry.map).catch(() => {});
    session.el.classList.remove('organize-drag-placeholder-src');
    session.el.style.transform = '';
    session.el.style.transition = '';
    this._refreshGridCardBody(entry);
    this._refreshCardBody(entry);
    return true;
  },

  /** Anima o fantasma (`ghostWrap`) até `toRect` via transição CSS de
   *  `left`/`top` — usada tanto pra "voar" até o cartão de destino quanto
   *  pra "voltar" pro retângulo original no cancelamento (mesma função, só
   *  muda o retângulo-alvo). */
  _flyGhostAway(session, toRect) {
    return new Promise((resolve) => {
      const w = session.ghostWrap;
      w.style.transition = 'left .32s cubic-bezier(.22,.8,.2,1), top .32s cubic-bezier(.22,.8,.2,1), opacity .32s ease-out';
      requestAnimationFrame(() => {
        w.style.left = toRect.left + 'px';
        w.style.top = toRect.top + 'px';
      });
      setTimeout(resolve, 330);
    });
  },

  _destroyGhost(session) {
    session.ghostWrap.remove();
  },

  /** 2ª animação, à PARTE da animação de "voo" do fantasma (pedido
   *  verbatim): "após a animação da transferência, deve haver uma segunda
   *  animação a parte. Esta outra animação é de uma seta preenchida 3D que
   *  é 'formada' da origem para o destino e dá uma inflada e desinflada ao
   *  terminar indicando o 'caminho' da transferência feita." SVG solto
   *  (`position:fixed`, ver CSS) — o "3D" vem do gradiente + sombra
   *  (`filter: drop-shadow`), sem precisar de nenhuma biblioteca 3D só pra
   *  isto. Remove a si mesma sozinha depois da animação (`setTimeout`). */
  _showTransferArrow(fromRect, toRect) {
    const fx = fromRect.left + fromRect.width / 2, fy = fromRect.top + fromRect.height / 2;
    const tx = toRect.left + toRect.width / 2, ty = toRect.top + toRect.height / 2;
    const pad = 40;
    const minX = Math.min(fx, tx) - pad, minY = Math.min(fy, ty) - pad;
    const w = Math.abs(tx - fx) + pad * 2, h = Math.abs(ty - fy) + pad * 2;
    const x1 = fx - minX, y1 = fy - minY, x2 = tx - minX, y2 = ty - minY;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 22;
    const hx1 = x2 - headLen * Math.cos(angle - Math.PI / 7), hy1 = y2 - headLen * Math.sin(angle - Math.PI / 7);
    const hx2 = x2 - headLen * Math.cos(angle + Math.PI / 7), hy2 = y2 - headLen * Math.sin(angle + Math.PI / 7);
    const gradId = `organize-arrow-grad-${Date.now()}`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'organize-transfer-arrow-svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.left = minX + 'px';
    svg.style.top = minY + 'px';
    svg.style.setProperty('--arrow-origin', `${(x2 / w * 100).toFixed(1)}% ${(y2 / h * 100).toFixed(1)}%`);
    svg.innerHTML = `
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#7dd3fc"/>
          <stop offset="100%" stop-color="#2563eb"/>
        </linearGradient>
      </defs>
      <line class="organize-transfer-arrow-shaft" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#${gradId})" stroke-width="7" stroke-linecap="round"/>
      <polygon class="organize-transfer-arrow-head" points="${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}" fill="url(#${gradId})"/>`;
    document.body.appendChild(svg);
    const shaft = svg.querySelector('.organize-transfer-arrow-shaft');
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    shaft.style.strokeDasharray = String(len);
    shaft.style.strokeDashoffset = String(len);
    requestAnimationFrame(() => { shaft.style.strokeDashoffset = '0'; });
    setTimeout(() => svg.classList.add('organize-transfer-arrow-pulse'), 380);
    setTimeout(() => svg.remove(), 380 + 480);
  },

  // NOVO (01/09/2026, item B5) — mesmo motivo/mesma extração documentada em
  // `_wireGridPatrimoniosCol` acima, agora pra vinculação com a PLANTA
  // BAIXA (`.organize-grid-mapa-wrap`, sem mexer no `<canvas>` da
  // miniatura AO VIVO, que fica FORA de `scope`).
  _wireGridMapaWrap(scope, mapId) {
    scope.querySelectorAll('.organize-vinc-chip-map').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.organize-vinc-chip-unlink')) return;
        e.stopPropagation();
        this._openMapExternally(mapId);
      });
    });
    scope.querySelectorAll('.organize-vinc-chip-unlink-planta').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._unlinkItemFromPlanta(btn.dataset.itemId, mapId);
      });
    });
    // NOVO (02/09/2026, rodada D, item D11) — tesourinha da lista expansível
    // de objetos da planta (ver comentário grande em `_renderMapObjectsList`),
    // desvincula TODOS os patrimônios associados àquele objeto de uma vez
    // (`Mapping.removeItemFromObject`, mesma função já usada pelo painel 2D
    // — sem ação nova de dados, só a ligação do botão que faltava aqui).
    scope.querySelectorAll('.organize-map-obj-unlink').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const entry = this._maps.find((en) => en.map.id === mapId);
        const obj = entry && (entry.map.objects || []).find((o) => o.id === btn.dataset.objId);
        if (!entry || !obj) return;
        [...(obj.itemIds || [])].forEach((assoc) => Mapping.removeItemFromObject(entry.map, obj.id, assoc.id));
        DB.saveMap(entry.map).catch(() => {});
        this._refreshGridCardBody(entry);
        this._refreshCardBody(entry);
      });
    });
    this._wireGridSearch(scope); // orb de colunas da planta (`planta:<mapId>`)
  },

  _wireGridCard(entry) {
    const mapId = entry.map.id;
    const canvas = this._overlayEl?.querySelector('#organize-grid-canvas');
    const card = canvas?.querySelector(`.organize-grid-card[data-map-id="${mapId}"]`);
    if (!card) return;
    // REMOVIDO (01/09/2026) — `if (entry.__pendingDelete) return;` saiu
    // daqui: antes o cartão "lápide" (mapa inteiro pendente) não tinha
    // NADA pra religar (estrutura totalmente diferente, ver comentário
    // grande em `_gridCardHtml`); agora, com `forcePending`, o cartão
    // continua com a MESMA estrutura de sempre (3 colunas), então a
    // religação normal continua fazendo sentido — os únicos elementos que
    // NÃO existem mais nesse estado (`.organize-map-export-btn`/
    // `.organize-map-delete-btn`, substituídos pelo botão "↩️ reverter")
    // já usam `?.addEventListener` abaixo, então simplesmente não fazem
    // nada quando ausentes.
    this._wireGridCardDrag(card, mapId);
    this._wireGridCardBackgroundDrag(card, mapId); // ITEM A4
    // ITEM "arrastar e soltar" (02/09/2026) — suprime o `click` sintético
    // que o navegador dispara logo após o `pointerup` de um arrasto de
    // foto/patrimônio de verdade (ver `_beginCardDrag`/`_suppressNextGridClick`
    // acima de `_wireGridDragSource`); senão um arrasto terminaria abrindo o
    // editor do item/a tela da foto por baixo, como se tivesse sido um
    // clique normal. Ouvido em CAPTURA no cartão inteiro (1x por cartão,
    // sobrevive aos refreshes parciais de `_refreshGridCardBody`, que nunca
    // substitui este elemento `card`, só o `innerHTML` de sub-blocos dele).
    card.addEventListener('click', (e) => {
      if (this._suppressNextGridClick) {
        this._suppressNextGridClick = false;
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
    this._wireMapNameEdit(card, entry);
    // ITEM A17, verbatim: "agora para ir para a planta baixa, deve ser dado
    // dois cliques (esta informação deve aparecer no title e no
    // cabeçalho)." Trocado de `click` pra `dblclick`.
    card.querySelector('.organize-map-thumb-wrap')?.addEventListener('dblclick', () => this._openMapExternally(mapId));
    // ITEM "renderização 2D ao vivo" (31/08/2026) — ver comentário grande
    // acima de `_gridLiveView`. SÓ a Grade chama isto (`_wireCard`, do modo
    // Cartões, não chama — continua com a miniatura estática de sempre).
    this._wireGridLiveMap(card, entry);
    card.querySelector('.organize-map-export-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof SettingsView === 'undefined' || !SettingsView._openExportModal) {
        Utils.toast('Módulo de exportação não carregado.', { type: 'danger' });
        return;
      }
      SettingsView._openExportModal({ onlyMapId: mapId });
    });
    // ITEM B2/B7 (31/08/2026) — botão de lixeira no cabeçalho do cartão,
    // exclui o mapa inteiro (ver `_deleteMap`, pendente até "Aplicar").
    card.querySelector('.organize-map-delete-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._deleteMap(mapId);
    });
    // ITEM B6 (31/08/2026) — vinculações de planta baixa (ver
    // `_renderGridVinculacoesPlanta`, novo): clique no chip abre a planta,
    // clique na tesourinha (✂️) desfaz só o pin (`_unlinkItemFromPlanta`).
    // CORRIGIDO (01/09/2026) — cada helper recebe SÓ o pedaço do cartão que
    // lhe diz respeito (não `card` inteiro 3x), senão `_wireGridSearch`
    // (chamada dentro de cada um, ver comentário grande acima deles) religa
    // TODOS os orbs de coluna do cartão inteiro 3 vezes cada (patrimônios +
    // planta + toda foto), fazendo cada clique em ◀/▶ ajustar a coluna 3x de
    // uma vez — mesmo cuidado que motivou extrair estas funções.
    const mapaWrap = card.querySelector('.organize-grid-mapa-wrap');
    const patrCol = card.querySelector('.organize-grid-patrimonios-col');
    // CORRIGIDO (02/09/2026): era `.organize-grid-fotos` (só a grade) —
    // o cabeçalho novo com o orb de colunas das fotos
    // (`.organize-grid-fotos-col` > `.organize-grid-section-head`, ver
    // `_gridCardHtml`) ficava FORA do escopo passado pra
    // `_wireGridFotosWrap`, então `_wireGridSearch` (chamada lá dentro,
    // ver logo abaixo) nunca encontrava o orb das fotos pra religar os
    // botões ◀/▶ — ver comentário grande em `_refreshGridCardBody` (mesmo
    // bug, mesma correção, os 2 pontos que chamam `_wireGridFotosWrap`).
    const fotosWrap = card.querySelector('.organize-grid-fotos-col');
    if (mapaWrap) this._wireGridMapaWrap(mapaWrap, mapId);
    if (patrCol) this._wireGridPatrimoniosCol(patrCol, entry, card);
    if (fotosWrap) this._wireGridFotosWrap(fotosWrap, entry, card);
  },

  // ---------------------------------------------------------------------
  // Wiring de eventos de 1 cartão (chamado por `_renderList` pra cada mapa)
  // ---------------------------------------------------------------------

  _wireCard(entry) {
    const mapId = entry.map.id;
    const card = this._listEl.querySelector(`.organize-map-card[data-map-id="${mapId}"]`);
    if (!card) return;
    // REMOVIDO (01/09/2026) — mesmo motivo documentado em `_wireGridCard`:
    // o cartão de mapa pendente (`forcePending`) continua com a mesma
    // estrutura normal de sempre, então a religação de sempre continua
    // válida (os botões que somem usam `?.addEventListener`, viram no-op).
    this._wireCardDragDrop(card, mapId);
    this._wireMapNameEdit(card, entry);
    // ITEM A17 — ver comentário igual em `_wireGridCard`.
    card.querySelector('.organize-map-thumb-wrap')?.addEventListener('dblclick', () => this._openMapExternally(mapId));
    card.querySelectorAll('.organize-vinc-chip-map').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.organize-vinc-chip-unlink')) return;
        e.stopPropagation();
        this._openMapExternally(mapId);
      });
    });
    // ITEM B6 (31/08/2026) — "tesourinha" (✂️) em cada vinculação de planta
    // baixa, desfaz só o pin (ver `_unlinkItemFromPlanta`), sem excluir o
    // patrimônio nem desvincular ele do MAPA em si (`ambienteId` continua).
    card.querySelectorAll('.organize-vinc-chip-unlink-planta').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._unlinkItemFromPlanta(btn.dataset.itemId, mapId);
      });
    });
    // Item 12 do feedback: "um botão de exportar deve ter em cada card:
    // 'exportar apenas este mapa'." Reaproveita a janela "⬇️ Exportar
    // backup" já existente (js/settings.js `_openExportModal`) em vez de
    // duplicar toda a lógica de geração de arquivo/zip/subpastas — só
    // pré-seleciona (via `opts.onlyMapId`) este mapa e os patrimônios/fotos
    // DELE, deixando as 3 categorias já marcadas; a pessoa ainda pode ver a
    // janela normal e ajustar antes de baixar, em vez de um download
    // silencioso sem chance de conferir o que está saindo.
    card.querySelector('.organize-map-export-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof SettingsView === 'undefined' || !SettingsView._openExportModal) {
        Utils.toast('Módulo de exportação não carregado.', { type: 'danger' });
        return;
      }
      SettingsView._openExportModal({ onlyMapId: mapId });
    });
    // ITEM B2/B7 (retomado 31/08/2026 — paridade com a Grade): botão de
    // lixeira no cabeçalho do cartão, exclui o mapa inteiro (ver
    // `_deleteMap`, pendente até "Aplicar").
    card.querySelector('.organize-map-delete-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._deleteMap(mapId);
    });
    this._wireItemRows(card, entry);
    this._wireFotoItems(card, entry);
    this._wireItemListHeadControls(card); // ITEM "orb de reordenar"/"lista expansível" (31/08/2026, ver comentário grande acima de `_itemSortMode`)
  },

  /** Liga os eventos de cada `.organize-item-row` (linha de patrimônio) DE
   *  DENTRO de `card` — extraído de `_wireCard` (era um `forEach` solto ali)
   *  pra poder ser chamado sozinho em `_refreshMergedCardAfterMerge`
   *  (mesclagem — item 5 do feedback, rodada 54): depois de mesclar, só as
   *  colunas de patrimônios/fotos do cartão SOBREVIVENTE são substituídas
   *  (não o cartão inteiro), então só as linhas NOVAS (recém-inseridas
   *  nessas colunas) precisam ser religadas — chamar `_wireCard` inteiro de
   *  novo duplicaria listeners nos elementos do cartão que não mudaram
   *  (arrastar-pra-mesclar, renomear, exportar etc.), causando ações
   *  repetidas (ex.: 2 toasts, editor abrindo 2x) a cada mesclagem. */
  _wireItemRows(card, entry) {
    card.querySelectorAll('.organize-item-row').forEach((row) => {
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/organize-item-id', row.dataset.itemId);
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('click', (e) => {
        if (e.target.closest('button,a,input,.organize-item-pin-fotoorb')) return;
        this._openItemEditor(row.dataset.itemId);
      });
      // Item 9 do feedback — ver comentário grande em `_renderPatrimonioColumn`:
      // clicar SÓ neste ícone (não na linha inteira) destaca o orb na foto
      // vinculada, sem abrir o editor do patrimônio.
      row.querySelector('.organize-item-pin-fotoorb')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const pin = e.currentTarget;
        const fotoItem = card.querySelector(`.organize-foto-item[data-foto-id="${pin.dataset.fotoId}"]`);
        const thumbWrap = fotoItem?.querySelector('.organize-foto-thumb-wrap');
        if (!thumbWrap) return;
        fotoItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this._highlightOrbOnPhoto(thumbWrap, parseFloat(pin.dataset.x), parseFloat(pin.dataset.y));
      });
      // ITEM B3 (retomado 31/08/2026 — paridade com a Grade): botão de
      // lixeira em cada linha, exclui só aquele patrimônio (ver
      // `_deleteItem`, pendente até "Aplicar"). Já coberto pelo `closest
      // ('button,...')` acima, que impede o clique de também abrir o editor.
      row.querySelector('.organize-item-row-del-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteItem(row.dataset.itemId);
      });
    });
  },

  /** Liga os eventos de cada `.organize-foto-item` DE DENTRO de `card` — ver
   *  comentário grande em `_wireItemRows` (mesma extração, mesmo motivo). */
  _wireFotoItems(card, entry) {
    card.querySelectorAll('.organize-foto-item').forEach((fi) => {
      const fotoId = fi.dataset.fotoId;
      fi.draggable = true;
      fi.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/organize-foto-id', fotoId);
        e.dataTransfer.effectAllowed = 'move';
      });
      const nameEl = fi.querySelector('.organize-foto-name');
      if (nameEl) nameEl.addEventListener('click', (e) => { e.stopPropagation(); this._wireFotoNameEdit(nameEl, entry, fotoId); });
      const thumbWrap = fi.querySelector('.organize-foto-thumb-wrap');
      thumbWrap?.addEventListener('click', (e) => {
        // CORRIGIDO (31/08/2026) — o botão "↩️" de reverter voltou a viver
        // DENTRO do thumb-wrap (ver `.organize-pending-delete-box` em
        // `_renderFotosColumn`, agora `position:absolute`); sem esta
        // exclusão, clicar nele também dispararia `_toggleFotoSelected`
        // pelo mesmo clique (bolha até aqui).
        if (e.target.closest('.organize-vinc-chip-foto,.organize-foto-orbdot,.organize-foto-item-del-btn,.organize-pending-undo-inline')) return; // tratados à parte, abaixo
        this._toggleFotoSelected(fotoId);
      });
      // ITEM B1 (retomado 31/08/2026 — paridade com a Grade): botão de
      // lixeira em cada foto (ver `_deletePhoto`, pendente até "Aplicar").
      thumbWrap?.querySelector('.organize-foto-item-del-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deletePhoto(fotoId);
      });
      fi.querySelectorAll('.organize-vinc-chip-foto').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          // ITEM C/D (retomado 31/08/2026) — ver comentário igual em
          // `_wireGridCard`: chip "lápide" não tem posição pra destacar.
          if (chip.classList.contains('organize-vinc-chip-pending-delete')) return;
          if (e.target.closest('.organize-vinc-chip-unlink')) return;
          e.stopPropagation();
          this._highlightOrbOnPhoto(thumbWrap, parseFloat(chip.dataset.x), parseFloat(chip.dataset.y));
        });
      });
      // ITEM B5 (retomado 31/08/2026 — paridade com a Grade): "tesourinha"
      // (✂️) em cada chip de vinculação, desfaz só a marcação entre aquele
      // patrimônio e esta foto (ver `_unlinkItemFromFoto`).
      fi.querySelectorAll('.organize-vinc-chip-foto .organize-vinc-chip-unlink').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._unlinkItemFromFoto(btn.dataset.itemId, btn.dataset.fotoId);
        });
      });
      // Item 6 (rodada 55/v309), verbatim: "se clicar em cima de uma
      // bolinha na foto, a foto deve ser aberta com foto naquela região da
      // foto. O botão de retorno deve ficar ativado." — INVERSO do que
      // `_highlightOrbOnPhoto` já fazia (clicar num patrimônio destaca a
      // posição NESTA miniatura); aqui, clicar na própria bolinha ABRE a
      // tela de Foto de verdade (`AmbientePhotos`), centralizada ali — ver
      // `_openFotoAtOrb`.
      // CORRIGIDO (31/08/2026) — exclui a bolinha "fantasma"
      // (`.organize-foto-orbdot-pending-delete`, ver `_orbDotHtml`): o
      // patrimônio dela já está de saída, não faz sentido abrir a foto
      // centralizada numa marcação que vai deixar de existir.
      fi.querySelectorAll('.organize-foto-orbdot:not(.organize-foto-orbdot-pending-delete)').forEach((dot) => {
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          this._openFotoAtOrb(entry, fotoId, parseFloat(dot.dataset.xNorm), parseFloat(dot.dataset.yNorm));
        });
      });
      // ITEM A19 — ver comentário igual em `_wireGridCard`/foto em grade.
      // CORRIGIDO (31/08/2026) — exclui também `.organize-pending-undo-
      // inline`, mesmo motivo documentado na versão da Grade acima.
      thumbWrap?.addEventListener('dblclick', (e) => {
        if (e.target.closest('.organize-foto-orbdot,.organize-vinc-chip-foto,.organize-pending-undo-inline')) return;
        e.stopPropagation();
        this._openFotoAtOrb(entry, fotoId, 0.5, 0.5);
      });
    });
  },

  // ---------------------------------------------------------------------
  // Edição embutida (nome do mapa / nome da foto) — input no lugar, sem alert()
  // ---------------------------------------------------------------------

  /** Cria o `<input>` de edição embutida usado por `_wireMapNameEdit`/
   *  `_wireFotoNameEdit` — item 3 do feedback (rodada 54), verbatim: "Ajuste
   *  os inputs para ficarem de um tal tamanho que quando for clicar para
   *  alterar o seu valor a box dele não mude de tamanho [...] para todos os
   *  textos editáveis." A rodada anterior (item 11) já copiava `font`/
   *  `letter-spacing` computados e zerava padding/margem no CSS, mas isso
   *  não é suficiente pra um `<input>`: ele é um elemento de formulário
   *  (replaced/form control), e `width:auto`/`height:auto` NELE não encolhe
   *  pro tamanho do texto atual como aconteceria num `<span>` — o navegador
   *  usa o tamanho intrínseco padrão do controle (largura baseada no
   *  atributo `size`, ~20 caracteres), quase sempre bem maior que o texto
   *  curto que estava ali, esticando a caixa (e todo o resto do cabeçalho
   *  do cartão) ao entrar em modo de edição — o bug real por trás do "ainda
   *  não ficou do tamanho certo". Corrigido medindo `getBoundingClientRect()`
   *  do elemento de texto ORIGINAL (antes de esvaziá-lo) e aplicando esse
   *  width/height em PX, fixos, diretamente no `<input>` — com `box-sizing:
   *  border-box` (CSS), a borda pontilhada de baixo entra DENTRO desse
   *  orçamento de altura, então nem ela desloca mais nada por 1px que seja. */
  /** ATUALIZAÇÃO (rodada 55/v309, item 1 do feedback), verbatim: "coloque em
   *  uma div e box-sizing:border-box; para evitar espandir a área do
   *  elemento quando fica ativo para inserir o texto." A versão anterior já
   *  travava largura/altura do `<input>` no tamanho medido do texto
   *  original — o que ainda deixava uma brecha: um `<input>` é um "elemento
   *  substituído" (métricas de fonte/baseline do CONTROLE nativo do
   *  navegador, não do texto puro) e pequenas divergências de meio pixel
   *  entre essas métricas e as do elemento de texto original podiam, em
   *  alguns navegadores/fontes, ainda fazer a LINHA/caixa ancestral (o
   *  cabeçalho do cartão, um flex row) recalcular sua altura por 1px.
   *  Corrigido travando a ÁREA do próprio `hostEl` (o elemento de texto —
   *  `.organize-map-card-name`/`.organize-foto-name`, já ambos com
   *  `box-sizing: border-box`, ver style.css) em width/height fixos, ANTES
   *  de trocar seu conteúdo pelo `<input>`: o host vira um container de
   *  tamanho fixo (`overflow: hidden` evita qualquer sobra visual), e o
   *  `<input>` só preenche 100% dele — não importa mais se a métrica interna
   *  do controle diverge por 1px do texto, porque quem define o espaço
   *  ocupado na linha é o `hostEl`, não o `<input>`. `_clearInlineHostSize`
   *  desfaz isso ao sair do modo de edição (chamado pelas duas `restaurar()`
   *  — `_wireMapNameEdit`/`_wireFotoNameEdit`). */
  /** ATUALIZAÇÃO — ITEM A8 (rodada 57/v311), pedido do usuário verbatim:
   *  "percebi que está colocando CSS inline de uma altura e largura para a
   *  caixa de inserção de texto. Não deve ser assim, a caixa onde vai o
   *  texto tem que permanecer com a sua altura e largura intactas."
   *
   *  HONESTIDADE TÉCNICA (sem navegador pra validar visualmente, decisão
   *  documentada): a MEDIÇÃO em JS (`getBoundingClientRect()`) continua
   *  sendo necessária — é a única forma de saber, em tempo de execução, o
   *  tamanho que o texto ORIGINAL ocupava (nomes de mapa/foto têm
   *  comprimentos completamente diferentes uns dos outros; não existe um
   *  valor FIXO de CSS que sirva pra todos sem ou sobrar espaço vazio pros
   *  nomes curtos ou cortar os longos) — isso já foi tentado e documentado
   *  como insuficiente nas 2 rodadas anteriores (ver comentário histórico
   *  abaixo). O que MUDOU aqui: em vez de escrever `width`/`height` como
   *  propriedades de estilo cruas (`hostEl.style.width = '123px'`), o valor
   *  medido vira 2 CUSTOM PROPERTIES CSS (`--inline-w`/`--inline-h`) — a
   *  REGRA que efetivamente define largura/altura/box-sizing/overflow mora
   *  só no style.css (`.organize-inline-host-locked`, consultando essas 2
   *  variáveis com `var()`), não mais espalhada feito várias declarações
   *  inline por propriedade. Simplificação assumida: isto reduz a
   *  quantidade de CSS inline (de 5 propriedades pra 2 variáveis + 1 classe)
   *  mas não elimina 100% a medição via JS — eliminar por completo exigiria
   *  abandonar `<input>` em favor de um elemento `contenteditable` (que
   *  aceita `width:auto` de verdade, encolhendo pro texto sozinho, igual um
   *  `<span>`) — mudança maior, arriscada de validar sem navegador nesta
   *  rodada, deixada como possível próxima rodada se o usuário preferir. */
  _makeInlineInput(hostEl, value, opts = {}) {
    const rect = hostEl.getBoundingClientRect();
    const cs = getComputedStyle(hostEl);
    hostEl.classList.add('organize-inline-host-locked');
    hostEl.style.setProperty('--inline-w', `${rect.width}px`);
    hostEl.style.setProperty('--inline-h', `${rect.height}px`);
    if (cs.display === 'inline') hostEl.style.display = 'inline-block'; // só isto ainda precisa ser condicional por elemento — ver CSS
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.className = 'organize-inline-input';
    input.style.font = cs.font;
    input.style.letterSpacing = cs.letterSpacing;
    return input;
  },

  /** Desfaz o travamento de área feito por `_makeInlineInput` em `hostEl` —
   *  chamado pelas duas `restaurar()` (mapa/foto) ao sair do modo de
   *  edição, pra `hostEl` voltar a ocupar só o espaço natural do seu texto. */
  _clearInlineHostSize(hostEl) {
    hostEl.classList.remove('organize-inline-host-locked');
    hostEl.style.removeProperty('--inline-w');
    hostEl.style.removeProperty('--inline-h');
    hostEl.style.display = '';
  },

  _wireMapNameEdit(card, entry) {
    const nameEl = card.querySelector('.organize-map-card-name');
    if (!nameEl) return;
    nameEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (nameEl.querySelector('input')) return;
      const atual = this._mapDisplayName(entry.map);
      const input = this._makeInlineInput(nameEl, atual);
      nameEl.textContent = '';
      nameEl.appendChild(input);
      input.focus(); input.select();
      let resolvido = false;
      const restaurar = () => { this._clearInlineHostSize(nameEl); nameEl.textContent = `🗺️ ${this._mapDisplayName(entry.map)}`; };
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
        else if (ke.key === 'Escape') { resolvido = true; restaurar(); }
      });
      input.addEventListener('blur', async () => {
        if (resolvido) return;
        resolvido = true;
        const novo = input.value.trim();
        if (novo && novo !== atual) {
          entry.map.nome = novo;
          try { await DB.saveMap(entry.map); } catch (err) { Utils.toast('Não consegui salvar o nome.', { type: 'danger' }); }
        }
        restaurar();
      });
    });
  },

  _wireFotoNameEdit(nameEl, entry, fotoId) {
    if (nameEl.querySelector('input')) return;
    const foto = entry.fotos.find((f) => f.id === fotoId);
    if (!foto) return;
    const atual = foto.nome || '';
    const input = this._makeInlineInput(nameEl, atual, { placeholder: '(sem nome)' });
    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus(); input.select();
    let resolvido = false;
    const restaurar = () => { this._clearInlineHostSize(nameEl); nameEl.textContent = Utils.escapeHtml(foto.nome || '(sem nome)'); };
    input.addEventListener('keydown', (ke) => {
      if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
      else if (ke.key === 'Escape') { resolvido = true; restaurar(); }
    });
    input.addEventListener('blur', async () => {
      if (resolvido) return;
      resolvido = true;
      const novo = input.value.trim();
      if (novo !== atual) {
        foto.nome = novo;
        try { await DB.saveAmbientePhoto(foto); } catch (err) { Utils.toast('Não consegui salvar o nome da foto.', { type: 'danger' }); }
      }
      restaurar();
    });
  },

  /** Editar um patrimônio (pedido do usuário: "clicar em cima de um
   *  patrimônio e editá-lo") — MESMO formulário usado no resto do app
   *  (`App.openItemForm`, ver js/app.js), com `onSaved` recarregando esta
   *  tela pra refletir a mudança na hora. */
  async _openItemEditor(itemId) {
    if (typeof App === 'undefined' || typeof DB === 'undefined') return;
    const item = await DB.getItem(itemId);
    if (!item) { Utils.toast('Este patrimônio não existe mais.', { type: 'warn' }); return; }
    App.openItemForm?.(item, {
      // Mesma ressalva de `_showReturnButton` (rodada 55/v309, item 5): um
      // `reload()` de verdade descartaria alterações pendentes ainda não
      // aplicadas (só existem em memória) — só recarrega do banco se não
      // houver nenhuma pendência em aberto.
      onSaved: async () => {
        if (this._pendingActions?.length) {
          Utils.toast('Patrimônio salvo — há alterações pendentes no Organizar, aplique ou reverta pra ver os dados mais recentes.', { type: 'warn', duration: 5500 });
          return;
        }
        this._dirty = true;
        await this.reload();
      },
    });
  },

  /** Destaca a posição de um orb numa foto (pedido do usuário: "a posição
   *  relativa deles na foto deve ser destacada") — um marcador temporário
   *  (some sozinho) na posição normalizada (`xNorm`/`yNorm`, já convertida
   *  pra % em `_renderFotosColumn`). */
  _highlightOrbOnPhoto(thumbWrap, xPct, yPct) {
    if (!thumbWrap || isNaN(xPct) || isNaN(yPct)) return;
    thumbWrap.querySelectorAll('.organize-foto-highlight').forEach((h) => h.remove());
    const dot = document.createElement('div');
    dot.className = 'organize-foto-highlight';
    dot.style.left = xPct + '%';
    dot.style.top = yPct + '%';
    thumbWrap.appendChild(dot);
    setTimeout(() => dot.remove(), 1800);
  },

  /** Item 6 (rodada 55/v309) — ver comentário grande em `_wireFotoItems`.
   *  Reaproveita `AmbientePhotos.open(map, { startPhotoId, fromOrganizar,
   *  focusNorm })` — `fromOrganizar`/o botão "↩️ Organizar" JÁ EXISTIAM em
   *  ambientephotos.js (ver `_voltarParaOrganizar` lá), preparados
   *  justamente pra este fluxo, mas nada em organizeview.js ainda os
   *  disparava. `focusNorm` é NOVO (ver ambientephotos.js `open`/
   *  `_selectPhoto`) — centraliza a vista na posição normalizada do orb,
   *  com um zoom de aproximação. Esconde (não fecha) o overlay do
   *  Organizar, igual ao padrão já usado por `_openMapExternally` — o
   *  próprio botão "↩️ Organizar" de dentro da tela de Foto chama
   *  `OrganizeView.open()` de volta ao sair, que só REEXIBE (sem
   *  reconstruir nada) porque `this._overlayEl` continua vivo por baixo. */
  async _openFotoAtOrb(entry, fotoId, xNorm, yNorm) {
    if (typeof AmbientePhotos === 'undefined') { Utils.toast('Módulo de fotos não carregado.', { type: 'danger' }); return; }
    if (isNaN(xNorm) || isNaN(yNorm)) return;
    // Ver `_fotoHasPendingChange` — caso raro (a MESMA foto acabou de ser
    // movida de mapa por uma ação ainda pendente, não aplicada): abrir
    // agora buscaria no IndexedDB pelo mapa NOVO, onde a foto ainda não
    // está de verdade (nada pendente é gravado até "Aplicar alterações").
    // Simplificação assumida e documentada: avisa e pede pra aplicar (ou
    // reverter) antes, em vez de tentar reconciliar os dois estados.
    if (this._fotoHasPendingChange(fotoId)) {
      Utils.toast('Esta foto tem uma mudança de mapa ainda pendente — aplique (ou reverta) as alterações antes de abri-la.', { type: 'warn', duration: 5000 });
      return;
    }
    if (this._overlayEl) this._overlayEl.style.display = 'none';
    try {
      await AmbientePhotos.open(entry.map, { startPhotoId: fotoId, fromOrganizar: true, focusNorm: { x: xNorm, y: yNorm } });
    } catch (err) {
      console.error('Falha ao abrir a foto a partir do Organizar:', err);
      Utils.toast('Não consegui abrir a foto.', { type: 'danger' });
      if (this._overlayEl) this._overlayEl.style.display = '';
    }
  },

  // ---------------------------------------------------------------------
  // Miniatura da planta baixa (enfileirada, 1 por quadro, com limite de tempo total)
  // ---------------------------------------------------------------------

  _startThumbnailQueue() {
    this._thumbQueue = this._maps.map((e) => e.map.id);
    this._thumbTotal = this._thumbQueue.length;
    this._thumbDone = 0;
    this._thumbDeadline = performance.now() + this._THUMB_TIME_BUDGET_MS;
    if (this._thumbTotal > 0) this._bgTaskStart('thumbs', this._thumbTotal, 'Gerando miniaturas…');
    this._processNextThumb();
  },

  _processNextThumb() {
    if (!this._overlayEl) return;
    if (!this._thumbQueue.length) { this._bgTaskEnd('thumbs'); return; }
    const estourouPrazo = performance.now() > this._thumbDeadline;
    const mapId = this._thumbQueue.shift();
    const entry = this._maps.find((e) => e.map.id === mapId);
    // Modo grade (v310): o MESMO `mapId` pode ter um canvas de miniatura no
    // modo cartões E outro na grade ao mesmo tempo (os 2 ficam no DOM juntos
    // — só um fica visível por vez, ver `_setViewMode`) — `querySelectorAll`
    // (não `querySelector`) desenha nos DOIS, não só no primeiro encontrado.
    // ITEM "renderização 2D ao vivo" (31/08/2026) — `:not(.organize-grid-
    // map-live-canvas)` exclui o canvas da GRADE desta fila: ele passou a
    // ter pan/zoom PRÓPRIO (ver `_wireGridLiveMap`/`_gridLiveView`), então
    // NÃO deve mais ser sobrescrito pela miniatura estática de 1 quadro só
    // — sem essa exclusão, esta fila (disparada toda vez que a lista
    // recarrega) apagaria o enquadramento que o usuário tivesse arrastado/
    // ampliado na Grade, voltando pro enquadramento automático de novo. O
    // Cartões continua exatamente como antes (miniatura estática).
    const canvases = this._overlayEl.querySelectorAll(`.organize-map-thumb-canvas:not(.organize-grid-map-live-canvas)[data-map-id="${mapId}"]`);
    canvases.forEach((canvas) => {
      if (!entry) return;
      if (estourouPrazo) {
        canvas.closest('.organize-map-thumb-wrap')?.classList.add('organize-thumb-timeout');
      } else {
        try { this._renderMapThumbnail(entry, canvas); } catch (err) {
          canvas.closest('.organize-map-thumb-wrap')?.classList.add('organize-thumb-timeout');
        }
      }
    });
    this._thumbDone++;
    this._bgTaskTick('thumbs');
    if (this._thumbQueue.length) requestAnimationFrame(() => this._processNextThumb());
    else this._bgTaskEnd('thumbs');
  },

  // ---------------------------------------------------------------------
  // Indicador genérico de processamento em segundo plano (item 2 do
  // feedback, rodada 54) — ver comentário grande em `_bgTasks` acima.
  // ---------------------------------------------------------------------

  _bgTaskStart(taskId, total, label) {
    if (!this._bgTasks) this._bgTasks = new Map();
    this._bgTasks.set(taskId, { total: Math.max(1, total), done: 0, label });
    this._updateBgProgress();
  },

  _bgTaskTick(taskId, n = 1) {
    const t = this._bgTasks?.get(taskId);
    if (!t) return;
    t.done = Math.min(t.total, t.done + n);
    this._updateBgProgress();
  },

  _bgTaskEnd(taskId) {
    this._bgTasks?.delete(taskId);
    this._updateBgProgress();
  },

  _updateBgProgress() {
    const wrap = this._overlayEl?.querySelector('#organize-thumb-progress');
    if (!wrap) return;
    const tasks = this._bgTasks ? [...this._bgTasks.values()] : [];
    const active = tasks.length > 0;
    wrap.classList.toggle('visible', active);
    if (!active) return;
    const total = tasks.reduce((s, t) => s + t.total, 0);
    const done = tasks.reduce((s, t) => s + t.done, 0);
    const pct = total ? Math.round((done / total) * 100) : 100;
    const fill = this._overlayEl?.querySelector('#organize-thumb-progress-fill');
    if (fill) fill.style.width = pct + '%';
    const label = this._overlayEl?.querySelector('#organize-thumb-progress-label');
    // Legenda da tarefa mais RECENTE registrada (última inserida no Map) —
    // se houver mais de uma rodando junto, ao menos a mais nova (a que a
    // pessoa acabou de disparar, ex.: mesclar enquanto miniaturas ainda
    // geram) é a que aparece.
    if (label) label.textContent = `${tasks[tasks.length - 1].label} ${done}/${total}`;
  },

  // ---------------------------------------------------------------------
  // ITEM 5 (rodada 55/v309) — sistema de alterações pendentes (staging).
  // Ver o comentário grande em `_pendingActions`, no topo do objeto, pro
  // desenho completo. Daqui pra baixo: as funções de apoio; quem CRIA cada
  // entrada é `_moveItemToMap`/`_movePhotoToMap`/`_mergeMaps`, mais abaixo.
  // ---------------------------------------------------------------------

  /** Clona `this._maps` pra um snapshot independente (nenhuma referência de
   *  objeto compartilhada com o original) — usado só por `_ensurePendingSnapshot`.
   *  `structuredClone` é suportado por todos os navegadores modernos
   *  relevantes pra este PWA; o `try/catch` com `JSON.parse(JSON.stringify())`
   *  é só uma rede de segurança (ex.: ambiente sem `structuredClone`, ou
   *  algum campo não clonável surgindo no futuro).
   *
   *  CORRIGIDO (02/09/2026), pedido verbatim (rodada C): "No 'Organizar', ao
   *  fazer a primeira marcação de exclusão, demora mais do que as outras.
   *  Veja o que está acontecendo e acabe com isso." Causa raiz: este
   *  snapshot só é tirado UMA VEZ por sequência de ações pendentes (ver
   *  `_ensurePendingSnapshot`, guardado por `_pendingActions.length===0`) —
   *  por isso só a PRIMEIRA marcação sofria o custo, nunca as seguintes.
   *  O custo em si: `this._maps` inclui, dentro de cada item
   *  (`it.fotoDataUrl`/`it.avatarDataUrl`) e de cada foto de ambiente
   *  (`f.dataUrl`/`f.thumbDataUrl`), imagens inteiras em base64 (podem ser
   *  vários MB cada, um mapa real de catalogação tem muitas fotos) — tanto
   *  `structuredClone` quanto o fallback JSON precisam varrer/copiar TODO
   *  esse texto byte a byte pra produzir uma cópia de verdade, mesmo essas
   *  strings NUNCA sendo alteradas por nenhuma das ações pendentes
   *  (excluir/mover/desvincular só mexem em metadados — patrimônio, orbs,
   *  flags — nunca no conteúdo binário da foto). Como strings em JS são
   *  IMUTÁVEIS, compartilhar a MESMA referência entre o snapshot e o
   *  original é 100% seguro (nada pode "vazar" uma mutação futura por essa
   *  referência) — então esses campos pesados são retirados ANTES de clonar
   *  e reencaixados (por referência, sem custo) tanto no original quanto no
   *  clone logo depois. Resultado: o snapshot passa a clonar só metadados
   *  (tipicamente KB, não MB), independente de quantas fotos o mapa tiver. */
  _cloneMapsForSnapshot() {
    const HEAVY_ITEM_KEYS = ['fotoDataUrl', 'avatarDataUrl'];
    const HEAVY_FOTO_KEYS = ['dataUrl', 'thumbDataUrl'];
    const removidos = []; // [{obj, key, value}] — pra restaurar no ORIGINAL depois
    this._maps.forEach((entry) => {
      (entry.itens || []).forEach((it) => {
        HEAVY_ITEM_KEYS.forEach((k) => { if (it[k]) { removidos.push({ obj: it, key: k, value: it[k] }); it[k] = undefined; } });
      });
      (entry.fotos || []).forEach((f) => {
        HEAVY_FOTO_KEYS.forEach((k) => { if (f[k]) { removidos.push({ obj: f, key: k, value: f[k] }); f[k] = undefined; } });
      });
    });
    let clone;
    try {
      clone = typeof structuredClone === 'function' ? structuredClone(this._maps) : JSON.parse(JSON.stringify(this._maps));
    } finally {
      // Restaura o ORIGINAL sempre — mesmo se o clone acima lançar, o app
      // não pode ficar com fotos "sumidas" da tela.
      removidos.forEach(({ obj, key, value }) => { obj[key] = value; });
    }
    // Reencaixa as MESMAS strings (por referência) no CLONE — caminha
    // `this._maps` (já restaurado) e `clone` em paralelo, por índice (forma
    // idêntica garantida por serem o resultado direto de clonar a mesma
    // árvore, um-pra-um).
    this._maps.forEach((entry, ei) => {
      (entry.itens || []).forEach((it, ii) => {
        HEAVY_ITEM_KEYS.forEach((k) => { if (it[k]) clone[ei].itens[ii][k] = it[k]; });
      });
      (entry.fotos || []).forEach((f, fi) => {
        HEAVY_FOTO_KEYS.forEach((k) => { if (f[k]) clone[ei].fotos[fi][k] = f[k]; });
      });
    });
    return clone;
  },

  /** Chamado no INÍCIO de `_moveItemToMap`/`_movePhotoToMap`/`_mergeMaps`,
   *  antes de qualquer mutação — só tira o snapshot na 1ª ação de uma
   *  sequência (enquanto não houver pendência nenhuma ainda). */
  _ensurePendingSnapshot() {
    if (!this._pendingActions) this._pendingActions = [];
    if (this._pendingActions.length === 0 && !this._pendingSnapshot) {
      this._pendingSnapshot = this._cloneMapsForSnapshot();
    }
  },

  _pushPendingAction(action) {
    if (!this._pendingActions) this._pendingActions = [];
    this._pendingActions.push(action);
    this._renderPendingPanel();
  },

  /** Junta nomes de mapa no formato dos exemplos do usuário: "'A' e 'B'"
   *  (2 nomes) ou "'A', 'B' e 'C'" (3+) — usado só pelo label de mesclagem. */
  _joinNamesForLabel(names) {
    const quoted = names.map((n) => `'${n}'`);
    if (quoted.length <= 1) return quoted.join('');
    return `${quoted.slice(0, -1).join(', ')} e ${quoted[quoted.length - 1]}`;
  },

  /** Procura uma foto pelo id em QUALQUER entrada do cache (`this._maps`) —
   *  usado por `_applyPendingActions` pra pegar o objeto ATUAL (já com
   *  qualquer edição em memória, ex.: orbs removidos) antes de gravar. */
  _findFotoById(fotoId) {
    for (const entry of this._maps) {
      const f = entry.fotos.find((x) => x.id === fotoId);
      if (f) return f;
    }
    return null;
  },

  /** Verifica se uma foto tem alguma ação pendente que a move de mapa (ela
   *  própria, ou como parte de uma mesclagem) — usado por `_openFotoAtOrb`
   *  (item 6) pra evitar abrir `AmbientePhotos` apontando pro mapa ERRADO:
   *  `AmbientePhotos.open` busca as fotos DIRETO no IndexedDB
   *  (`DB.getPhotosByAmbiente`), que ainda não sabe de nenhuma mudança
   *  pendente (nada pendente é gravado até "Aplicar alterações") — abrir
   *  com o mapa NOVO (só em memória) não encontraria a foto lá ainda.
   *  Simplificação assumida e documentada: em vez de tentar reconciliar os
   *  dois mundos (cache em memória vs. banco), só avisa e pede pra aplicar
   *  primeiro — caso raro (só acontece se a MESMA foto que acabou de ser
   *  movida, sem aplicar, for clicada de novo por uma bolinha antes de
   *  aplicar/reverter). */
  _fotoHasPendingChange(fotoId) {
    return (this._pendingActions || []).some((a) => (a.type === 'move-photo' && a.fotoId === fotoId)
      || (a.type === 'merge-maps' && (a.movedFotoIds || []).includes(fotoId)));
  },

  /** Redesenha o painel "Alterações pendentes" (contador + lista de
   *  descrições) a partir de `this._pendingActions` — chamado sempre que a
   *  lista muda (`_pushPendingAction`, `_applyPendingActions`,
   *  `_revertPendingActions`) e ao reabrir a tela (`_buildOverlay`). */
  /** ITEM B-undo (retomado 31/08/2026), pedido original verbatim (dentro do
   *  bloco de exclusões): a expectativa de poder "desfazer" era sempre sobre
   *  UMA exclusão isolada, não a pilha inteira. `_revertPendingActions`
   *  ("Reverter") continua tudo-ou-nada por design (ver comentário lá) —
   *  esta rodada soma um ↩️ NA ÚLTIMA linha da lista, que desfaz só ELA
   *  (`_undoLastPendingAction`), sem mexer nas anteriores. Só a última
   *  porque, com uma pilha que pode ter ações dependentes umas das outras
   *  (mover ou mesclar mapas, por exemplo), desfazer uma do MEIO exigiria
   *  reconciliar o que veio depois — sem essa garantia, só a ação no TOPO da
   *  pilha (a mais recente) é seguro desfazer isoladamente. Dos tipos
   *  existentes, só os 5 do bloco de exclusões (`UNDOABLE` abaixo) sabem se
   *  desfazer sozinhos (guardam os dados de antes — orb removido, pin
   *  anterior etc., ver `_deleteItem`/`_unlinkItemFromFoto`/
   *  `_unlinkItemFromPlanta`); mover/mesclar mapas (tipos mais antigos)
   *  ainda não guardam esse "antes" — o ↩️ não aparece nesses casos. */
  // 'delete-medida' (01/09/2026) — NOVO tipo desta rodada (item 2), ver
  // `_deleteMedida`/`_medidaChipHtml`: mesmo padrão autocontido dos outros 5
  // (só mexe na PRÓPRIA flag `medida.__pendingDelete`, nunca no "antes" de
  // outra ação pendente), então entra na mesma lista "seguro reverter em
  // qualquer posição da pilha" (ver comentário grande acima de
  // `_undoPendingAction`).
  _UNDOABLE_LAST_ACTION_TYPES: ['delete-foto', 'delete-item', 'delete-map', 'unlink-item-foto', 'unlink-item-planta', 'delete-medida'],

  /** ITEM E (retomado 31/08/2026), pedido verbatim: "As coisas que foram
   *  marcadas para serem excluídas devem ter um botão de 'reverter
   *  operação' para que deixe de estar marcado para ser excluído." Antes só
   *  existia o ↩️ da ÚLTIMA linha do painel (`_undoLastPendingAction`) — este
   *  helper gera o MESMO botão visual, só que reutilizável em QUALQUER lápide
   *  (plaquinha/linha de patrimônio, foto, mapa — ver `_renderGridPatrimonios`/
   *  `_renderPatrimonioColumn`/`_renderGridFotos`/`_renderFotosColumn`/
   *  `_pendingDeleteMapTombstoneHtml`). O clique é resolvido por UM listener
   *  delegado só, registrado 1x em `_buildOverlay` (procura a ação pendente
   *  por `data-undo-type`/`data-undo-id` e chama `_undoPendingAction`) — não
   *  precisa de wiring próprio por elemento, e funciona até dentro da
   *  "lápide" de MAPA inteiro, cujo cartão normalmente não liga NENHUM
   *  evento (ver `if (entry.__pendingDelete) return;` em `_wireGridCard`/
   *  `_wireCard`) — a delegação em `el` (o overlay, não o cartão) contorna
   *  isso sem precisar abrir uma exceção naquele early-return. */
  // CORRIGIDO (31/08/2026), pedido verbatim: "O botão de 'reverter' não
  // deve comprometer a estrutura, deve aparecer em uma área pré-definida
  // para não desestruturar os elementos que estão ali." Rótulo por extenso
  // ("↩️ reverter") virou só o ícone — agora que o botão é sempre
  // `position:absolute` dentro de uma área pré-definida da lápide (ver CSS
  // `.organize-pending-undo-inline`/style.css), um texto comprido só
  // aumentaria a chance de vazar da área reservada; o `title` (tooltip)
  // continua com a explicação por extenso.
  // NOVO parâmetro `fotoId` (01/09/2026) — necessário só pro tipo
  // 'unlink-item-foto': diferente de 'delete-item'/'delete-foto'/'delete-map'
  // (onde 1 id já identifica a ação sozinho), um mesmo `itemId` pode ter MAIS
  // de uma vinculação de foto desfeita pendente ao mesmo tempo (uma por
  // foto) — `data-undo-foto-id` desambigua qual delas o listener delegado
  // (`_buildOverlay`) deve procurar/reverter. Fica de fora do `data-undo-id`
  // (que continua só o itemId) pra não precisar mudar o resto dos tipos.
  _inlineRevertBtnHtml(type, id, fotoId) {
    const fotoAttr = fotoId != null ? ` data-undo-foto-id="${Utils.escapeHtml(String(fotoId))}"` : '';
    return `<button type="button" class="organize-pending-undo-inline" data-undo-type="${type}" data-undo-id="${Utils.escapeHtml(String(id))}"${fotoAttr} title="Reverter esta exclusão pendente (deixa de estar marcado)">↩️</button>`;
  },

  _renderPendingPanel() {
    const panel = this._overlayEl?.querySelector('#organize-pending-panel');
    if (!panel) return;
    const acoes = this._pendingActions || [];
    panel.classList.toggle('visible', acoes.length > 0);
    const toggleBtn = panel.querySelector('#organize-pending-toggle');
    if (toggleBtn) toggleBtn.textContent = `📝 Alterações pendentes (${acoes.length})`;
    const listEl = panel.querySelector('#organize-pending-list');
    if (listEl) {
      // ATUALIZADO (31/08/2026, item E) — antes só a ÚLTIMA linha (topo da
      // pilha) ganhava o ↩️ (`_UNDOABLE_LAST_ACTION_TYPES` + `i === ultimoIdx`).
      // Generalizado: TODA ação de um tipo "autocontido" (guarda os próprios
      // dados de "antes", nunca mexe em flags de outra ação — ver comentário
      // grande acima de `_undoPendingAction`) agora pode ser revertida
      // independente da posição na pilha, não só a mais recente.
      listEl.innerHTML = acoes.map((a, i) => {
        const podeDesfazer = this._UNDOABLE_LAST_ACTION_TYPES.includes(a.type);
        return `<li>${i + 1}. ${Utils.escapeHtml(a.label)}${podeDesfazer ? ` <button type="button" class="organize-pending-undo-btn" data-pending-idx="${i}" title="Reverter só esta ação pendente (sem mexer nas outras)">↩️</button>` : ''}</li>`;
      }).join('');
      listEl.querySelectorAll('.organize-pending-undo-btn').forEach((btn) => {
        btn.addEventListener('click', () => this._undoPendingAction(acoes[parseInt(btn.dataset.pendingIdx, 10)]));
      });
    }
  },

  /** "Aplicar alterações" — grava de verdade cada ação pendente no
   *  IndexedDB, NA ORDEM em que foi criada, reaproveitando a barra de
   *  progresso genérica de segundo plano já usada pela mesclagem. Ver
   *  comentário grande em `_pendingActions` pro desenho completo. */
  async _applyPendingActions() {
    const acoes = this._pendingActions || [];
    if (!acoes.length) return;
    this._pendingActions = [];
    this._pendingSnapshot = null;
    this._gridMapDeleteColors = {}; // ITEM B, 31/08/2026 — ver nota igual em `_revertPendingActions`
    this._renderPendingPanel();
    let total = 0;
    for (const a of acoes) {
      if (a.type === 'move-item') total += 1 + (a.orphanedFotoIds?.length || 0);
      else if (a.type === 'move-photo') total += 1 + (a.itemIds?.length || 0);
      else if (a.type === 'merge-maps') total += (a.movedFotoIds?.length || 0) + (a.movedItemIds?.length || 0) + (a.discardedIds?.length || 0);
      // ITEM B (exclusões, 31/08/2026) — ver comentário grande acima de
      // `_deletePhoto`/`_deleteMap`/`_deleteItem`/`_unlinkItemFromFoto`.
      else if (a.type === 'delete-foto') total += 1;
      else if (a.type === 'delete-map') total += 1;
      else if (a.type === 'delete-item') total += 1 + (a.orphanedFotoIds?.length || 0);
      else if (a.type === 'unlink-item-foto') total += 1;
      else if (a.type === 'unlink-item-planta') total += 1;
      else if (a.type === 'delete-medida') total += 1; // NOVO (01/09/2026, item 2 da rodada)
    }
    const bgTaskId = `apply-pending-${Date.now()}`;
    if (total > 0) this._bgTaskStart(bgTaskId, total, 'Aplicando alterações…');
    try {
      for (const a of acoes) {
        if (a.type === 'move-item') {
          try { await DB.updateItem(a.itemId, { ambienteId: a.toMapId }); } catch (err) { console.error('Falha ao aplicar move-item:', err); }
          this._bgTaskTick(bgTaskId);
          for (const fotoId of (a.orphanedFotoIds || [])) {
            const foto = this._findFotoById(fotoId);
            if (foto) { try { await DB.saveAmbientePhoto(foto); } catch (err) { /* 1 foto com erro não deve travar o resto */ } }
            this._bgTaskTick(bgTaskId);
          }
        } else if (a.type === 'move-photo') {
          const foto = this._findFotoById(a.fotoId);
          if (foto) { try { await DB.saveAmbientePhoto(foto); } catch (err) { console.error('Falha ao aplicar move-photo:', err); } }
          this._bgTaskTick(bgTaskId);
          for (const itemId of (a.itemIds || [])) {
            try { await DB.updateItem(itemId, { ambienteId: a.toMapId }); } catch (err) { /* idem */ }
            this._bgTaskTick(bgTaskId);
          }
        } else if (a.type === 'merge-maps') {
          for (const fotoId of (a.movedFotoIds || [])) {
            const foto = this._findFotoById(fotoId);
            if (foto) { try { await DB.saveAmbientePhoto(foto); } catch (err) { /* idem */ } }
            this._bgTaskTick(bgTaskId);
          }
          for (const itemId of (a.movedItemIds || [])) {
            try { await DB.updateItem(itemId, { ambienteId: a.survivorId }); } catch (err) { /* idem */ }
            this._bgTaskTick(bgTaskId);
          }
          for (const mapId of (a.discardedIds || [])) {
            try { await DB.deleteMap(mapId); } catch (err) { /* idem */ }
            this._bgTaskTick(bgTaskId);
          }
          // CORRIGIDO (31/08/2026), pedido verbatim: "estava com um mapa A
          // selecionado, mesclei com um mapa B, de modo que ficou o mapa B+A
          // e com o nome de B, porém ficou como se eu estivesse ainda
          // selecionado o mapa A [...] sendo que já não existe mais". Causa
          // raiz: `DB.deleteMap` nunca lê/atualiza `ambienteAtualId` (o "mapa
          // atual" que a tela "Mapa"/Planta baixa mostra) — se o mapa
          // descartado na fusão era o atual, o ID órfão só era corrigido de
          // forma PREGUIÇOSA (`DB.getOrCreateSingleMap`, na próxima vez que
          // alguém abrisse "Mapa"), caindo no PRIMEIRO mapa da lista, que não
          // é necessariamente o sobrevivente da fusão (B) — dava a impressão
          // de "ainda selecionado A" até trocar de mapa manualmente, ou
          // trocava silenciosamente pra um mapa nem relacionado à fusão.
          // Corrigido apontando `ambienteAtualId` pro `survivorId` assim que
          // a fusão é aplicada, sempre que ele apontava pra algum dos
          // descartados — nunca deixando o ID órfão existir nem por um
          // instante.
          try {
            const atualId = await DB.getSetting('ambienteAtualId', null);
            if (atualId && (a.discardedIds || []).includes(atualId)) await DB.setCurrentMap(a.survivorId);
          } catch (err) { /* idem — não deve travar a aplicação das outras ações pendentes */ }
        } else if (a.type === 'delete-foto') {
          // ITEM B1 — `DB.deleteAmbientePhoto` só apaga o registro da foto em
          // si; os orbs/medidas dela somem JUNTO por não existirem mais em
          // lugar nenhum (nunca foram uma tabela separada, ver db.js). Os
          // patrimônios que estavam marcados nela (`a.affectedItemIds`)
          // continuam existindo normalmente — só a marcação já foi removida
          // em memória no momento do clique (ver `_deletePhoto`), nada extra
          // a gravar aqui pra eles. A "lápide" (`foto.__pendingDelete`) só
          // existia PRA MOSTRAR a pendência — agora que já foi gravada de
          // verdade, tira a foto do cache em memória também (senão ficaria
          // uma lápide "fantasma" pra sempre na tela, já que `_applyPending
          // Actions` não recarrega tudo do banco — ver nota grande abaixo,
          // mesmo motivo pro delete-map/delete-item).
          try {
            await DB.deleteAmbientePhoto(a.fotoId);
            const entry = this._maps.find((e) => e.map.id === a.mapId);
            if (entry) { entry.fotos = entry.fotos.filter((f) => f.id !== a.fotoId); this._refreshGridCardBody(entry); this._refreshCardBody(entry); }
          } catch (err) { console.error('Falha ao aplicar delete-foto:', err); }
          this._bgTaskTick(bgTaskId);
        } else if (a.type === 'delete-map') {
          // ITEM B2/B7 — `DB.deleteMap` já cuida da cascata inteira sozinho
          // (desvincula patrimônios, apaga fotos do mapa, reparenta mapas-
          // filhos — ver comentário grande em `_deleteMap` acima e o próprio
          // `DB.deleteMap`, js/db.js). Não precisa replicar nada aqui — só
          // tirar o cartão da tela (mesmo motivo do delete-foto acima).
          try {
            await DB.deleteMap(a.mapId);
            this._maps = this._maps.filter((e) => e.map.id !== a.mapId);
            this._listEl?.querySelector(`.organize-map-card[data-map-id="${a.mapId}"]`)?.remove();
            this._overlayEl?.querySelector(`#organize-grid-canvas .organize-grid-card[data-map-id="${a.mapId}"]`)?.remove();
            const countEl = this._overlayEl?.querySelector('#organize-map-count');
            if (countEl) countEl.textContent = `${this._maps.length} mapa(s) listado(s)`;
          } catch (err) { console.error('Falha ao aplicar delete-map:', err); }
          this._bgTaskTick(bgTaskId);
        } else if (a.type === 'delete-item') {
          try {
            await DB.deleteItem(a.itemId);
            const entry = this._maps.find((e) => e.map.id === a.mapId);
            if (entry) entry.itens = entry.itens.filter((it) => it.id !== a.itemId);
          } catch (err) { console.error('Falha ao aplicar delete-item:', err); }
          this._bgTaskTick(bgTaskId);
          for (const fotoId of (a.orphanedFotoIds || [])) {
            const foto = this._findFotoById(fotoId);
            if (foto) { try { await DB.saveAmbientePhoto(foto); } catch (err) { /* 1 foto com erro não deve travar o resto */ } }
            this._bgTaskTick(bgTaskId);
          }
          const entry = this._maps.find((e) => e.map.id === a.mapId);
          if (entry) { this._refreshGridCardBody(entry); this._refreshCardBody(entry); }
        } else if (a.type === 'unlink-item-foto') {
          const foto = this._findFotoById(a.fotoId);
          if (foto) { try { await DB.saveAmbientePhoto(foto); } catch (err) { console.error('Falha ao aplicar unlink-item-foto:', err); } }
          this._bgTaskTick(bgTaskId);
          // CORRIGIDO (01/09/2026, achado testando com Playwright depois do
          // item B3/#56) — faltava isto aqui: `this._pendingActions = []`
          // roda logo no TOPO desta função (bem antes deste loop), então o
          // chip "fantasma" (ver `_pendingDeletedChipsForFoto`) já devia
          // deixar de existir a partir daqui — mas sem religar o card, o
          // DOM ficava com a lápide VELHA (a ação que a justificava já não
          // existe mais em `_pendingActions`) até QUALQUER outra coisa
          // forçar um refresh. Mesmo tratamento que `delete-item`/`delete-
          // map` já tinham, faltava só nestes 2 tipos (unlink).
          {
            const entry = this._maps.find((e) => e.map.id === a.mapId);
            if (entry) { this._refreshGridCardBody(entry); this._refreshCardBody(entry); }
          }
        } else if (a.type === 'unlink-item-planta') {
          // ITEM B6 — o pin já foi zerado em memória no clique (ver
          // `_unlinkItemFromPlanta`); aqui só grava de verdade no item.
          try { await DB.updateItem(a.itemId, { mapaX: null, mapaY: null, mapaPiso: 0 }); } catch (err) { console.error('Falha ao aplicar unlink-item-planta:', err); }
          this._bgTaskTick(bgTaskId);
          // CORRIGIDO (01/09/2026) — mesmo motivo documentado acima em
          // 'unlink-item-foto': sem isto, o chip "fantasma" da planta baixa
          // (`_pendingUnlinkPlantaGhosts`) ficava preso no DOM depois de
          // aplicado, mesmo a ação já tendo sumido de `_pendingActions`.
          {
            const entry = this._maps.find((e) => e.map.id === a.mapId);
            if (entry) { this._refreshGridCardBody(entry); this._refreshCardBody(entry); }
          }
        } else if (a.type === 'delete-medida') {
          // NOVO (01/09/2026, item 2 da rodada) — só agora, ao aplicar de
          // verdade, a medida sai de `foto.medidas` (até aqui só a flag
          // `__pendingDelete` marcava a lápide, ver `_deleteMedida`) — e a
          // foto inteira é regravada (medidas não são uma tabela separada,
          // mesmo motivo documentado em 'delete-foto' acima).
          const foto = this._findFotoById(a.fotoId);
          if (foto) {
            foto.medidas = (foto.medidas || []).filter((m) => m.id !== a.medidaId);
            try { await DB.saveAmbientePhoto(foto); } catch (err) { console.error('Falha ao aplicar delete-medida:', err); }
          }
          this._bgTaskTick(bgTaskId);
          {
            const entry = this._maps.find((e) => e.map.id === a.mapId);
            if (entry) { this._refreshGridCardBody(entry); this._refreshCardBody(entry); }
          }
        }
      }
      Utils.toast(`${acoes.length} alteração(ões) aplicada(s) ✓`, { type: 'ok' });
    } catch (err) {
      console.error('Falha ao aplicar alterações pendentes:', err);
      Utils.toast('Houve um erro ao aplicar as alterações — recarregue a página pra conferir o estado real do banco.', { type: 'danger', duration: 6000 });
    } finally {
      this._bgTaskEnd(bgTaskId);
    }
  },

  /** "Reverter" — desfaz TODAS as pendências de uma vez, restaurando o
   *  cache inteiro pro snapshot tirado antes da 1ª delas (ver decisão de
   *  design documentada em `_pendingActions`). Como nada pendente chega a
   *  ser gravado no banco, reverter nunca precisa desfazer nada lá — só o
   *  que está em memória/na tela. */
  _revertPendingActions() {
    if (!this._pendingActions?.length) return;
    if (this._pendingSnapshot) this._maps = this._pendingSnapshot;
    this._pendingSnapshot = null;
    this._pendingActions = [];
    this._selectedMapIds?.clear();
    this._selectedFotoIds?.clear();
    this._lastRegionScreen = null;
    // Pedido do usuário (v310), verbatim: "as alterações [de posição na
    // grade] só se perdem clicando no botão 'reverter' ou ao recarregar a
    // página" — reposicionamento na grade é estado de LAYOUT puro (nunca
    // gravado no banco, ver comentário grande em `_gridPositions`), mas o
    // próprio usuário listou "reverter" como um dos 2 únicos jeitos de
    // perdê-lo — reseta junto com o resto das pendências aqui.
    this._gridPositions = {};
    this._gridZoom = 1;
    this._gridPan = { x: 0, y: 0 };
    // ITEM B (exclusões, 31/08/2026) — as cores por mapa (`_mapDeleteColor`)
    // só fazem sentido enquanto durar a pendência que as gerou; reverter tudo
    // também zera o ciclo de cores, pra próxima leva de exclusões começar do
    // 1º tom de novo.
    this._gridMapDeleteColors = {};
    this._renderList();
    this._startThumbnailQueue();
    this._renderPendingPanel();
    Utils.toast('Alterações pendentes revertidas.', { type: 'ok' });
  },

  /** ITEM E (retomado 31/08/2026, generalização do antigo "ITEM B-undo"),
   *  pedido verbatim: "As coisas que foram marcadas para serem excluídas
   *  devem ter um botão de 'reverter operação' para que deixe de estar
   *  marcado para ser excluído." Antes (`_undoLastPendingAction`) só dava
   *  pra desfazer a ÚLTIMA ação da pilha — a justificativa documentada era
   *  que ações mais antigas (mover/mesclar mapas) poderiam ter dependências
   *  entre si. Só que os 5 tipos em `_UNDOABLE_LAST_ACTION_TYPES` (o único
   *  conjunto que já era "desfazível" antes) são cada um AUTOCONTIDO: cada
   *  `case` abaixo só lê/mexe nas PRÓPRIAS flags/arrays guardados na própria
   *  ação (`foto.__pendingDelete`, `it.__pendingDelete`, `entry.__pendingDelete`,
   *  `foto.orbs`, `it.mapaX/Y/Piso`) — nunca no "antes" de OUTRA ação
   *  pendente. Não há dependência real entre eles (diferente de mover/
   *  mesclar, que ficam de fora desta lista), então reverter qualquer um,
   *  em QUALQUER posição da pilha, é seguro — só precisa da AÇÃO em si (não
   *  do índice: o índice pode mudar entre o clique e a execução, se outra
   *  ação pendente for revertida antes). Recebe a ação (referência dentro de
   *  `this._pendingActions`), faz o INVERSO exato (mesmo código que já
   *  existia em `_undoLastPendingAction`, agora fatorado aqui pra ser
   *  chamado tanto pelo ↩️ de qualquer linha do painel quanto pelos novos
   *  botões "↩️ reverter" embutidos em cada lápide, ver `_inlineRevertBtnHtml`
   *  + listener delegado em `_buildOverlay`). Nunca toca no banco (nada foi
   *  gravado ainda, é só desfazer em memória, igual reverter tudo). */
  _undoPendingAction(a) {
    const acoes = this._pendingActions || [];
    if (!a || !this._UNDOABLE_LAST_ACTION_TYPES.includes(a.type)) return;
    const idx = acoes.indexOf(a);
    if (idx === -1) return; // já foi revertida/aplicada antes — nada a fazer
    const entry = this._maps.find((e) => e.map.id === a.mapId);
    if (a.type === 'delete-foto') {
      const foto = entry?.fotos.find((f) => f.id === a.fotoId);
      if (foto) foto.__pendingDelete = false;
      for (const itemId of (a.affectedItemIds || [])) {
        const it = entry?.itens.find((x) => x.id === itemId);
        if (!it) continue;
        it.__pendingDeleteMarks = Math.max(0, (it.__pendingDeleteMarks || 1) - 1);
        if (it.__pendingDeleteMarks <= 0) { delete it.__pendingDeleteColor; delete it.__pendingDeleteMarks; }
      }
    } else if (a.type === 'delete-item') {
      const it = entry?.itens.find((x) => x.id === a.itemId);
      if (it) delete it.__pendingDelete;
      for (const r of (a.removedOrbs || [])) {
        const foto = entry?.fotos.find((f) => f.id === r.fotoId);
        if (foto) { foto.orbs = foto.orbs || []; foto.orbs.push(r.orb); }
      }
    } else if (a.type === 'delete-map') {
      // `__pendingDeleteSize` (medida fixa do retângulo da antiga "lápide"
      // genérica) não existe mais (01/09/2026) — ver comentário grande em
      // `_gridCardHtml`/`forcePending`: o cartão nunca mais muda de
      // tamanho/estrutura ao marcar exclusão, então não há mais nada pra
      // medir/fixar.
      if (entry) delete entry.__pendingDelete;
    } else if (a.type === 'unlink-item-foto') {
      const foto = entry?.fotos.find((f) => f.id === a.fotoId);
      if (foto && a.removedOrb) { foto.orbs = foto.orbs || []; foto.orbs.push(a.removedOrb); }
    } else if (a.type === 'unlink-item-planta') {
      const it = entry?.itens.find((x) => x.id === a.itemId);
      if (it && a.previousPin) { it.mapaX = a.previousPin.mapaX; it.mapaY = a.previousPin.mapaY; it.mapaPiso = a.previousPin.mapaPiso; }
    } else if (a.type === 'delete-medida') {
      // NOVO (01/09/2026, item 2 da rodada) — a medida nunca saiu de
      // `foto.medidas` (ver `_deleteMedida`/`_medidaChipHtml`), só reverte a
      // flag.
      const foto = entry?.fotos.find((f) => f.id === a.fotoId);
      const medida = foto?.medidas?.find((m) => m.id === a.medidaId);
      if (medida) delete medida.__pendingDelete;
    }
    acoes.splice(idx, 1);
    if (entry) { this._refreshGridCardBody(entry); this._refreshCardBody(entry); }
    // Pilha ficou vazia — equivale a não ter nenhuma pendência: descarta o
    // snapshot também (senão `_ensurePendingSnapshot` nunca tiraria um novo
    // na PRÓXIMA ação, achando erroneamente que já existe um em andamento).
    if (!acoes.length) { this._pendingSnapshot = null; this._gridMapDeleteColors = {}; }
    this._renderPendingPanel();
    Utils.toast('Ação pendente revertida ✓', { type: 'ok' });
  },

  /** Atalho — desfaz só a ÚLTIMA ação pendente (topo da pilha). Mantido por
   *  compatibilidade (nada mais chama isto diretamente nesta rodada, mas o
   *  nome documenta a intenção "desfazer a mais recente" em quem for ler o
   *  código depois). */
  _undoLastPendingAction() {
    const acoes = this._pendingActions || [];
    this._undoPendingAction(acoes[acoes.length - 1]);
  },

  _tightBounds(map) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const consider = (x, y) => {
      if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };
    (map.walls || []).forEach((w) => { consider(w.x1, w.y1); consider(w.x2, w.y2); });
    (map.points || []).forEach((p) => consider(p.x, p.y));
    (map.trilha || []).forEach((p) => consider(p.x, p.y));
    (map.cameras || []).forEach((c) => consider(c.x, c.y));
    (map.objects || []).forEach((o) => consider(o.x, o.y));
    (map.textos || []).forEach((t) => consider(t.x, t.y));
    [...(map.portas || []), ...(map.janelas || [])].forEach((el) => {
      const pos = window.Mapping?.resolveDoorWindowPos?.(map, el) || el;
      consider(pos.x, pos.y);
    });
    if (!isFinite(minX)) return { minX: -2, minY: -2, maxX: 2, maxY: 2 };
    return { minX, minY, maxX, maxY };
  },

  _renderMapThumbnail(entry, canvas) {
    if (typeof Map2DRenderer === 'undefined') return;
    const map = entry.map;
    const renderer = new Map2DRenderer(canvas);
    renderer.showGrid = false;
    renderer.showRulers = false;
    renderer.setMapData(map);
    renderer.resize();
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return;
    const b = this._tightBounds(map);
    const bw = Math.max(0.5, b.maxX - b.minX);
    const bh = Math.max(0.5, b.maxY - b.minY);
    const folga = 0.88;
    const zoom = Math.min(w / bw, h / bh) * folga;
    renderer.view = { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, zoom };
    renderer.render();
  },

  /** ITEM "renderização 2D ao vivo" (31/08/2026) — equivalente a
   *  `_renderMapThumbnail` acima, mas MANTENDO o pan/zoom entre chamadas
   *  (`_gridLiveView[map.id]`, ver comentário grande acima de
   *  `_gridLiveView`) em vez de recalcular o enquadramento do zero toda
   *  vez. `renderer.view` é setado com a MESMA referência do objeto salvo
   *  em `_gridLiveView` (não uma cópia) — de propósito, pra qualquer
   *  arrasto/zoom feito depois (ver `_wireGridLiveMap`) mutar os 2 ao
   *  mesmo tempo, sem precisar copiar de um lado pro outro a cada quadro.
   *  Devolve a instância criada (ou `null` se o canvas ainda não tem
   *  tamanho de verdade — ex.: cartão construído enquanto a Grade está
   *  escondida — mesma situação/mesmo tratamento que `_renderMapThumbnail`
   *  já tinha). */
  _renderMapLive(entry, canvas) {
    if (typeof Map2DRenderer === 'undefined') return null;
    const map = entry.map;
    const renderer = new Map2DRenderer(canvas);
    renderer.showGrid = false; // decisão de design: mesma escolha da miniatura estática — grade de linhas viraria ruído visual num cartão pequeno
    renderer.showRulers = false;
    renderer.setMapData(map);
    renderer.resize();
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return null;
    let viewState = this._gridLiveView[map.id];
    if (!viewState) {
      const b = this._tightBounds(map);
      const bw = Math.max(0.5, b.maxX - b.minX);
      const bh = Math.max(0.5, b.maxY - b.minY);
      const folga = 0.88;
      const zoom = Math.min(w / bw, h / bh) * folga;
      viewState = { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, zoom, baseZoom: zoom };
      this._gridLiveView[map.id] = viewState;
    }
    renderer.view = viewState;
    renderer.render();
    this._gridLiveRenderers[map.id] = renderer;
    return renderer;
  },

  /** Reenquadra (botão "🎯" — ver `_gridCardHtml`) uma planta-baixa-ao-vivo
   *  pro enquadramento inicial, descartando qualquer pan/zoom feito pelo
   *  usuário nela — útil pra "se perder" navegando e voltar rápido pro
   *  ponto de partida, sem precisar sair e reabrir o Organizar (que, aliás,
   *  NÃO reseta isso sozinho — `_gridLiveView` é estado de sessão, mesmo
   *  espírito de `_gridPositions`). */
  _resetGridLiveView(entry, canvas) {
    delete this._gridLiveView[entry.map.id];
    this._renderMapLive(entry, canvas);
  },

  /** Liga o pan (arrastar) + zoom (roda do mouse, ancorado no cursor) da
   *  planta-baixa-ao-vivo de UM cartão — ver comentário grande acima de
   *  `_gridLiveView` pra decisão de design completa (matemática enxuta
   *  inspirada em `MapView._attachPanZoom`/mapview.js, sem nenhuma das
   *  dependências de estado global de lá; redesenho SOB DEMANDA, nunca um
   *  loop de `requestAnimationFrame`).
   *
   *  `e.stopPropagation()` em TODOS os handlers — sem isso, o gesto
   *  vazaria pra 2 outros listeners que já existem em ancestrais deste
   *  canvas: o pan/zoom da grade INTEIRA (`_wireGridPanZoom`, no
   *  `#organize-grid-viewport`) moveria/ampliaria TODOS os cartões ao
   *  mesmo tempo (o listener de `wheel` de lá não tem nenhuma exclusão por
   *  alvo — sempre reage, então SÓ o `stopPropagation` no canvas evita o
   *  zoom duplo); o arrasto do CARTÃO inteiro por baixo
   *  (`_wireGridCardBackgroundDrag`) já ignora esta área por outro motivo
   *  (`.organize-map-thumb-wrap` está no `EXCLUDE_SEL` dele desde antes
   *  desta rodada), mas o `stopPropagation` aqui não atrapalha nada disso
   *  — só reforça. O duplo-clique pra abrir a planta baixa completa
   *  continua funcionando: `dblclick` é sintetizado pelo navegador a
   *  partir de cliques (não de `pointerdown`/`pointermove`), então não é
   *  afetado por `stopPropagation` nem por `setPointerCapture` chamado
   *  aqui — testado com Playwright (`page.dblclick`, ver
   *  test_grid_live_map.js). */
  _wireGridLiveMap(card, entry) {
    const mapId = entry.map.id;
    const canvas = card.querySelector('.organize-grid-map-live-canvas');
    if (!canvas) return;
    const renderer = this._renderMapLive(entry, canvas);
    if (!renderer) return;
    const view = renderer.view; // === this._gridLiveView[mapId] (mesma referência, ver `_renderMapLive`)
    let dragging = false, lastX = 0, lastY = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      e.stopPropagation();
      // CORRIGIDO (02/09/2026, rodada D), pedido verbatim: "No 'Organizar',
      // ao clicar e arrastar em cima da planta baixa [...] está dando
      // paralax." Causa raiz: `dx`/`dy` eram o delta em pixels de TELA
      // (`e.clientX/clientY`), convertido direto pra unidades do mundo só
      // dividindo por `view.zoom` (o zoom PRÓPRIO desta miniatura ao vivo)
      // — nunca levava em conta o zoom da GRADE em volta (`this._gridZoom`,
      // aplicado via `transform:scale()` no `#organize-grid-canvas` que
      // contém este `<canvas>`), então 1px de tela só correspondia a 1px do
      // `<canvas>` quando a grade estivesse em 100% — em qualquer outro
      // zoom da grade, a miniatura arrastava mais rápido/devagar que o
      // cursor (o "paralax" relatado). Mesma técnica já usada (corretamente)
      // pelo handler de `wheel` logo abaixo: converte o delta de tela pra
      // pixels INTERNOS do canvas via a proporção real medida por
      // `getBoundingClientRect()` (que já reflete `_gridZoom` sozinha,
      // sem precisar ler a variável diretamente) — só DEPOIS divide por
      // `view.zoom` pra virar unidades do mundo.
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - lastX) * (canvas.width / rect.width);
      const dy = (e.clientY - lastY) * (canvas.height / rect.height);
      lastX = e.clientX; lastY = e.clientY;
      view.cx -= dx / view.zoom;
      view.cy -= dy / view.zoom;
      renderer.render();
    });
    const endDrag = (e) => { e.stopPropagation(); dragging = false; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Zoom ancorado no CURSOR — mesma técnica de `MapView._attachPanZoom`
      // (mapview.js): acha o ponto do mundo embaixo do mouse ANTES de
      // mudar o zoom, muda o zoom, reposiciona a câmera pra esse mesmo
      // ponto continuar embaixo do cursor DEPOIS.
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
      const worldBefore = renderer.screenToWorld(sx, sy);
      const zoomMin = view.baseZoom * this._GRID_LIVE_ZOOM_MIN_MULT;
      const zoomMax = view.baseZoom * this._GRID_LIVE_ZOOM_MAX_MULT;
      view.zoom = Utils.clamp(view.zoom * (e.deltaY > 0 ? 0.9 : 1.1), zoomMin, zoomMax);
      view.cx = worldBefore.x - (sx - canvas.width / 2) / view.zoom;
      view.cy = worldBefore.y - (sy - canvas.height / 2) / view.zoom;
      renderer.render();
    }, { passive: false });
    card.querySelector('.organize-grid-map-live-reset-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._resetGridLiveView(entry, canvas);
    });
  },

  // ---------------------------------------------------------------------
  // Navegar pra fora (abrir a planta baixa em 2D/3D) e voltar
  // ---------------------------------------------------------------------

  /** Abre a planta baixa de `mapId` (2D ou 3D, conforme o toggle do
   *  cabeçalho) — ESCONDE esta tela (não fecha de verdade) e deixa um botão
   *  flutuante "🗂️ Voltar ao Organizar" que só reexibe ela de novo, de
   *  ONDE quer que o usuário esteja depois (2D, 3D, ou qualquer outra tela
   *  alcançada a partir daí) — ver nota de simplificação no cabeçalho do
   *  arquivo. Caminho 2D corrigido na rodada 53 (item 1 do feedback, ver
   *  comentário grande logo abaixo) — pula direto pra Planta baixa em vez
   *  de cair na tela de entrada do Mapa. */
  async _openMapExternally(mapId) {
    if (typeof DB === 'undefined') return;
    try { await DB.setCurrentMap(mapId); } catch (err) { /* segue mesmo assim — pior caso, abre o mapa "atual" errado */ }
    this._showReturnButton();
    if (this._overlayEl) this._overlayEl.style.display = 'none';
    if (this._openLinkMode === '3d' && typeof App !== 'undefined' && App.openView3D) {
      App.openView3D(mapId);
      return;
    }
    // Item 1 do feedback: "clicar em cima da planta baixa no meio do card
    // deve levar direto para ela [...] Atualmente, ao clicar só vai para a
    // tela do 'Mapa'." BUG: `App.navigate('mapa')` sempre monta a tela de
    // ENTRADA do Mapa (2 botões grandes — ver `MapView.mount`), nunca a
    // Planta baixa direto, e ainda empilha mais uma entrada em
    // `App._navStack` (não faz sentido aqui — Organizar não é um destino
    // de navegação de verdade, é um overlay por cima). Corrigido replicando
    // à mão o MESMO caminho que `App.closeView3D()` usa pra voltar direto
    // pra Planta baixa sem passar pela entrada (unmount da view atual,
    // limpeza do container `#view`, e `MapView.mountAfterView3D`, que pula
    // reto pra `_showScreen('planta')`) — ver comentário grande em
    // `MapView.mountAfterView3D` (mapview.js) e `App.closeView3D` (app.js).
    if (typeof App === 'undefined' || typeof MapView === 'undefined') {
      Utils.toast('Não consegui abrir o mapa.', { type: 'danger' });
      return;
    }
    try {
      const prev = App.views?.[App.currentView];
      if (prev?.unmount) { try { prev.unmount(); } catch (err) { console.warn(`unmount("${App.currentView}") falhou:`, err); } }
      document.querySelectorAll('.bsp-botoes-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === 'mapa'));
      const titleEl = document.getElementById('view-title');
      if (titleEl) titleEl.textContent = App.titles?.mapa || 'Mapa do ambiente';
      document.body.classList.add('view-mapa');
      const container = document.getElementById('view');
      container.innerHTML = '';
      App.currentView = 'mapa';
      App.views.mapa = MapView;
      // `DB.setCurrentMap` acima já fez `_showScreen('planta')` (chamado por
      // `mountAfterView3D` logo abaixo) carregar o mapa CERTO sozinho — via
      // `DB.getOrCreateSingleMap()`, que lê exatamente essa configuração
      // (`ambienteAtualId`, ver db.js). Setar `MapView._map` aqui também,
      // de qualquer forma, é só uma garantia a mais (pedido explícito desta
      // rodada) — não muda o resultado, mas evita depender só do efeito
      // indireto se algum dia esse acoplamento mudar.
      MapView._map = (await DB.getMap(mapId)) || MapView._map;
      await MapView.mountAfterView3D(container);
    } catch (err) {
      console.error('Falha ao abrir a planta baixa a partir do Organizar:', err);
      Utils.toast('Não consegui abrir o mapa.', { type: 'danger' });
    }
  },

  _showReturnButton() {
    let btn = document.getElementById('organize-return-btn');
    if (btn) return;
    btn = document.createElement('button');
    btn.id = 'organize-return-btn';
    btn.type = 'button';
    btn.className = 'organize-return-float';
    btn.textContent = '🗂️ Voltar ao Organizar';
    btn.onclick = async () => {
      await this._closeExternalScreen();
      if (this._overlayEl) this._overlayEl.style.display = '';
      btn.remove();
      // "modificações e exclusões" também disparam atualização (pedido do
      // usuário, lista verbatim no cabeçalho do arquivo) — como qualquer
      // coisa pode ter mudado na planta baixa durante a visita (2D/3D),
      // recarrega ao voltar em vez de arriscar mostrar dado velho.
      //
      // RESSALVA (rodada 55/v309, item 5) — decisão de design documentada:
      // um `reload()` de verdade PUXA TUDO do banco de novo, substituindo
      // `this._maps` inteiro — o que DESCARTARIA qualquer alteração
      // pendente ainda não aplicada (ver `_pendingActions`), já que elas só
      // existem em memória, nunca no banco. Só recarrega do banco aqui se
      // NÃO houver nada pendente; havendo, só redesenha a lista a partir do
      // cache atual (preservando as pendências) e avisa que a planta pode
      // ter mudanças externas não refletidas — aceitável: aplicar/reverter
      // as pendências primeiro já resolveria isso normalmente.
      if (this._pendingActions?.length) {
        this._renderList();
        Utils.toast('Há alterações pendentes no Organizar — aplique ou reverta antes de reabrir a planta, pra ver os dados mais recentes do banco.', { type: 'warn', duration: 5500 });
        return;
      }
      this._dirty = true;
      await this.reload();
    };
    document.body.appendChild(btn);
  },

  /** Item 1 do feedback (rodada 54), verbatim: "Cliquei na planta baixa, fui
   *  para o 2D, interagi com a janela de camadas e voltei ao 'Organizar',
   *  porém a janela de camadas ainda ficou ativa. Quando voltar para o
   *  'Organizar' deve ser só a sua tela não outras coisas de outras telas."
   *  CAUSA RAIZ: o botão "🗂️ Voltar ao Organizar" só reexibia o overlay do
   *  Organizar (`_overlayEl.style.display = ''`) — a tela visitada (Mapa 2D
   *  via `MapView.mountAfterView3D`, ou o 3D via `App.openView3D`, ver
   *  `_openMapExternally`) continuava MONTADA por baixo dele, com qualquer
   *  painel flutuante que tivesse ficado aberto nela (ex.: "🗂️ Camadas",
   *  que vive DENTRO do container do Mapa — ver mapview.js
   *  `_openLayersPanelImpl`) também continuando ativo. Pior: esses painéis
   *  usam `Utils.bringToFront` (z-index a partir de 961, ver utils.js) —
   *  MAIOR que o z-index do overlay do Organizar (900, `.organize-overlay`
   *  em style.css) — então ao reabrir o Organizar, o painel de Camadas
   *  ficava visível e CLICÁVEL por CIMA dele, em vez de escondido atrás.
   *  Corrigido desmontando de verdade a tela visitada (mesmo `unmount()`
   *  que `App.navigate()`/`App.closeView3D()` já chamam ao trocar de tela —
   *  pra MapView isso já fecha Camadas/Ferramentas/Histórico/etc sozinho,
   *  ver `_unmountPlanta`; pro 3D, `View3D.unmount()`) ANTES de reexibir o
   *  Organizar, e remontando a tela de ENTRADA do Mapa por baixo (2 botões
   *  grandes, sem nenhum painel flutuante) — pra não deixar `#view` em
   *  branco se a pessoa fechar o Organizar de vez (✖️) depois de ter usado
   *  este caminho de retorno. Simplificação assumida e documentada (mesmo
   *  espírito da simplificação já registrada no cabeçalho do arquivo pra
   *  `_openMapExternally`): ao voltar, o pano de fundo vira a tela de
   *  entrada do Mapa, não necessariamente a Planta baixa exata de onde a
   *  pessoa saiu — como o Organizar cobre a tela toda enquanto estiver
   *  aberto, isso não é visível na prática. */
  async _closeExternalScreen() {
    if (typeof App === 'undefined') return;
    const prev = App.views?.[App.currentView];
    if (prev?.unmount) { try { prev.unmount(); } catch (err) { console.warn(`unmount("${App.currentView}") falhou ao voltar pro Organizar:`, err); } }
    document.body.classList.remove('view-mapa', 'view-mapa-planta');
    document.activeElement?.blur?.();
    const container = document.getElementById('view');
    if (container) container.innerHTML = '';
    if (typeof MapView !== 'undefined' && container) {
      try {
        document.body.classList.add('view-mapa');
        document.querySelectorAll('.bsp-botoes-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === 'mapa'));
        App.currentView = 'mapa';
        App.views.mapa = MapView;
        await MapView.mount(container);
      } catch (err) {
        console.warn('Falha ao remontar a tela Mapa (de baixo) ao voltar do Organizar:', err);
      }
    }
  },

  // ---------------------------------------------------------------------
  // Seleção de mapas (reaproveita MapSelection — mesma matemática do 2D)
  // ---------------------------------------------------------------------

  _toggleMapSelected(mapId) {
    if (this._selectedMapIds.has(mapId)) this._selectedMapIds.delete(mapId);
    else this._selectedMapIds.add(mapId);
    this._applySelectionHighlight();
    this._updateSelCount();
  },

  _applySelectionHighlight() {
    this._listEl?.querySelectorAll('.organize-map-card').forEach((card) => {
      const marcado = this._selectedMapIds.has(card.dataset.mapId);
      card.classList.toggle('organize-map-selected', marcado);
      const check = card.querySelector('.organize-map-card-check');
      if (check) check.textContent = marcado ? '☑' : '☐';
    });
  },

  _toggleFotoSelected(fotoId) {
    if (this._selectedFotoIds.has(fotoId)) this._selectedFotoIds.delete(fotoId);
    else this._selectedFotoIds.add(fotoId);
    this._applyFotoSelectionHighlight();
  },

  _applyFotoSelectionHighlight() {
    this._listEl?.querySelectorAll('.organize-foto-item').forEach((fi) => {
      fi.classList.toggle('organize-foto-selected', this._selectedFotoIds.has(fi.dataset.fotoId));
    });
  },

  _updateSelCount() {
    const n = this._selectedMapIds?.size || 0;
    const el = this._overlayEl?.querySelector('#organize-sel-count');
    if (el) el.textContent = n ? `${n} mapa(s) marcado(s)` : '';
    const btn = this._overlayEl?.querySelector('#organize-merge-btn');
    if (btn) btn.disabled = n < 2;
  },

  /** Ferramentas de seleção do 2D + Mão, aplicadas sobre os CARTÕES de mapa.
   *  Reaproveita a matemática pura de `MapSelection` (mapselection.js),
   *  tratando o CENTRO de cada cartão como candidato, em coordenadas de
   *  tela relativas a `#organize-list-wrap`. Elementos com interação
   *  PRÓPRIA (linha de patrimônio, item de foto, alça de mesclagem, nome
   *  editável, miniatura, vinculação) ficam de fora deste sistema (ver
   *  `EXCLUIR_SELETOR` abaixo) — cada um already tem seu próprio listener,
   *  cuidado em `_wireCard`. */
  _wireSelectionTools() {
    const wrap = this._overlayEl.querySelector('#organize-list-wrap');
    if (!wrap) return;
    const EXCLUIR_SELETOR = 'button,a,input,img,.organize-item-row,.organize-foto-item,'
      + '.organize-map-drag-handle,.organize-map-card-name,.organize-map-thumb-wrap,.organize-vinc-chip-map';
    const rectRelToWrap = (el) => {
      const r = el.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      return { x: r.left - wr.left + wrap.scrollLeft, y: r.top - wr.top + wrap.scrollTop, w: r.width, h: r.height };
    };
    const pointFromEvent = (e) => {
      const wr = wrap.getBoundingClientRect();
      return { x: e.clientX - wr.left + wrap.scrollLeft, y: e.clientY - wr.top + wrap.scrollTop };
    };
    const candidatos = () => (this._maps || []).map((entry) => {
      const card = this._listEl.querySelector(`.organize-map-card[data-map-id="${entry.map.id}"]`);
      if (!card) return null;
      const r = rectRelToWrap(card);
      return { kind: 'map', id: entry.map.id, x: r.x + r.w / 2, y: r.y + r.h / 2 };
    }).filter(Boolean);

    let overlaySvg = null;
    const clearOverlay = () => { overlaySvg?.remove(); overlaySvg = null; };
    const drawOverlayRect = (x0, y0, x1, y1) => {
      clearOverlay();
      overlaySvg = document.createElement('div');
      overlaySvg.className = 'organize-select-overlay';
      overlaySvg.style.left = Math.min(x0, x1) + 'px';
      overlaySvg.style.top = Math.min(y0, y1) + 'px';
      overlaySvg.style.width = Math.abs(x1 - x0) + 'px';
      overlaySvg.style.height = Math.abs(y1 - y0) + 'px';
      wrap.appendChild(overlaySvg);
    };

    wrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest(EXCLUIR_SELETOR)) return;
      const p0 = pointFromEvent(e);
      if (this._tool === 'hand') {
        this._drag = { tool: 'hand', startX: e.clientX, startY: e.clientY, startScrollTop: wrap.scrollTop, startScrollLeft: wrap.scrollLeft };
        wrap.setPointerCapture(e.pointerId);
        return;
      }
      if (this._tool === 'move-selection') {
        if (!this._lastRegionScreen) { Utils.toast('Desenhe uma seleção primeiro (Selecionar/Laço/Elipse).', { type: 'warn' }); return; }
        this._drag = { tool: 'move-selection', startX: p0.x, startY: p0.y, region0: this._lastRegionScreen };
        wrap.setPointerCapture(e.pointerId);
        return;
      }
      if (this._tool === 'move-selected') {
        // Ainda antes de qualquer `setPointerCapture` — `e.target` aqui é
        // confiável (ver bug 2 no cabeçalho do arquivo: só fica errado nos
        // eventos QUE VÊM DEPOIS da captura, não neste primeiro).
        const card = e.target.closest('.organize-map-card');
        if (!card) return;
        if (!this._selectedMapIds.has(card.dataset.mapId)) this._toggleMapSelected(card.dataset.mapId);
        this._drag = { tool: 'move-selected', startY: e.clientY, targetCard: card };
        wrap.setPointerCapture(e.pointerId);
        return;
      }
      this._drag = { tool: this._tool, pts: [p0], p0 };
      wrap.setPointerCapture(e.pointerId);
    });

    wrap.addEventListener('pointermove', (e) => {
      if (!this._drag) return;
      if (this._drag.tool === 'hand') {
        wrap.scrollTop = this._drag.startScrollTop - (e.clientY - this._drag.startY);
        wrap.scrollLeft = this._drag.startScrollLeft - (e.clientX - this._drag.startX);
        return;
      }
      const p = pointFromEvent(e);
      if (this._drag.tool === 'move-selection') {
        const dx = p.x - this._drag.startX, dy = p.y - this._drag.startY;
        const moved = this._shiftRegion(this._drag.region0, dx, dy);
        this._applyRegionSelection(moved, candidatos());
        this._drag.moved = moved;
        return;
      }
      if (this._drag.tool === 'move-selected') return;
      if (this._drag.tool === 'select') {
        drawOverlayRect(this._drag.p0.x, this._drag.p0.y, p.x, p.y);
      } else if (this._drag.tool === 'ellipse') {
        drawOverlayRect(this._drag.p0.x, this._drag.p0.y, p.x, p.y);
        overlaySvg?.classList.add('organize-select-overlay-ellipse');
      } else if (this._drag.tool === 'lasso') {
        this._drag.pts.push(p);
        if (!overlaySvg || !overlaySvg.isConnected) {
          clearOverlay();
          overlaySvg = document.createElement('div');
          overlaySvg.className = 'organize-select-overlay organize-select-overlay-lasso';
          wrap.appendChild(overlaySvg);
        }
        this._drawLassoOverlay(overlaySvg, this._drag.pts);
      }
    });

    // `document`, não `wrap` — bug 2 do cabeçalho (`e.target` retargetado
    // por `setPointerCapture`) usa `document.elementFromPoint`, que não
    // depende de onde o listener está registrado, mas soltar o botão FORA
    // de `wrap` (ex.: arrastando rápido) ainda precisa ser ouvido. Guardado
    // em `this._pointerUpHandler` pra `close()` poder tirar este listener
    // de `document` — sem isso, cada fechar+reabrir desta tela empilharia
    // MAIS um listener igual (nunca removido), e um solo de arrastar
    // passaria a rodar a mesma lógica várias vezes seguidas.
    this._pointerUpHandler = (e) => {
      if (!this._drag) return;
      const drag = this._drag;
      this._drag = null;
      clearOverlay();
      if (drag.tool === 'hand') return;
      if (drag.tool === 'move-selection') {
        if (drag.moved) { this._lastRegionScreen = drag.moved; this._applyRegionSelection(drag.moved, candidatos()); }
        return;
      }
      if (drag.tool === 'move-selected') {
        const targetCard = document.elementFromPoint(e.clientX, e.clientY)?.closest('.organize-map-card');
        if (targetCard && targetCard !== drag.targetCard) this._reorderSelectedBefore(targetCard.dataset.mapId);
        return;
      }
      const p1 = pointFromEvent(e);
      const semArraste = drag.tool !== 'lasso' && Math.hypot(p1.x - drag.p0.x, p1.y - drag.p0.y) < 4;
      if (semArraste) {
        // BUG 2 corrigido aqui: `document.elementFromPoint`, não `e.target`
        // (que depois de `setPointerCapture` seria sempre `wrap`).
        const card = document.elementFromPoint(e.clientX, e.clientY)?.closest('.organize-map-card');
        if (card) { this._toggleMapSelected(card.dataset.mapId); return; }
        // Pedido do usuário (02/09/2026): "No 'Organizar', clicar em uma
        // região vazia da grade deve deselecionar qualquer coisa." Antes,
        // clicar fora de um cartão (fundo da grade) não fazia nada — os
        // mapas marcados (`_selectedMapIds`, ☑) ficavam marcados pra
        // sempre, só dando pra desmarcar clicando um a um de novo. Agora um
        // clique (sem arrastar) numa área vazia limpa a seleção inteira.
        if (this._selectedMapIds?.size) { this._selectedMapIds.clear(); this._applySelectionHighlight(); this._updateSelCount(); }
        if (this._selectedFotoIds?.size) { this._selectedFotoIds.clear(); this._applyFotoSelectionHighlight(); }
        return;
      }
      let region;
      if (drag.tool === 'select') region = { type: 'rect', x0: drag.p0.x, y0: drag.p0.y, x1: p1.x, y1: p1.y, mode: 'replace' };
      else if (drag.tool === 'ellipse') region = { type: 'ellipse', cx: (drag.p0.x + p1.x) / 2, cy: (drag.p0.y + p1.y) / 2, rx: Math.abs(p1.x - drag.p0.x) / 2, ry: Math.abs(p1.y - drag.p0.y) / 2, mode: 'replace' };
      else region = { type: 'lasso', pts: drag.pts, mode: 'replace' };
      this._lastRegionScreen = region;
      this._applyRegionSelection(region, candidatos());
    };
    document.addEventListener('pointerup', this._pointerUpHandler);
  },

  _shiftRegion(r, dx, dy) {
    if (r.type === 'rect') return { ...r, x0: r.x0 + dx, y0: r.y0 + dy, x1: r.x1 + dx, y1: r.y1 + dy };
    if (r.type === 'ellipse') return { ...r, cx: r.cx + dx, cy: r.cy + dy };
    if (r.type === 'lasso') return { ...r, pts: r.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    return r;
  },

  _applyRegionSelection(region, candidatos) {
    // `MapSelection` é um `const` de script clássico — não vira propriedade
    // de `window` (diferente de `Map2DRenderer`, exposto via
    // `window.Map2DRenderer =` no fim de mapview.js) — acessível aqui só
    // como identificador solto, mesmo escopo léxico compartilhado entre
    // todos os `<script>` clássicos da página.
    if (typeof MapSelection === 'undefined') return;
    const novo = MapSelection.computeFromRegions([region], candidatos);
    this._selectedMapIds = new Set([...novo].map((k) => k.split(':')[1]));
    this._applySelectionHighlight();
    this._updateSelCount();
  },

  _drawLassoOverlay(svg, pts) {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
    svg.style.left = minX + 'px'; svg.style.top = minY + 'px';
    svg.style.width = Math.max(1, maxX - minX) + 'px'; svg.style.height = Math.max(1, maxY - minY) + 'px';
    // clip-path: polygon() quer "x y" (espaço) por ponto, pontos separados
    // por vírgula, com unidade — corrigido nesta rodada (versão anterior
    // tinha a sintaxe invertida e sem "px", o que fazia o navegador
    // ignorar a propriedade inteira; só cosmético, a seleção de verdade
    // usa `MapSelection.pointInPolygon`, que nunca dependeu deste desenho).
    const pathPts = pts.map((p) => `${p.x - minX}px ${p.y - minY}px`).join(', ');
    svg.style.clipPath = `polygon(${pathPts})`;
  },

  async _reorderSelectedBefore(beforeMapId) {
    const ids = this._maps.map((e) => e.map.id);
    const marcados = ids.filter((id) => this._selectedMapIds.has(id));
    if (!marcados.length || marcados.includes(beforeMapId)) return;
    const resto = ids.filter((id) => !this._selectedMapIds.has(id));
    const idx = resto.indexOf(beforeMapId);
    const nova = idx < 0 ? [...resto, ...marcados] : [...resto.slice(0, idx), ...marcados, ...resto.slice(idx)];
    this._maps.sort((a, b) => nova.indexOf(a.map.id) - nova.indexOf(b.map.id));
    this._renderList();
    this._startThumbnailQueue();
    try { await DB.setSetting('organizeOrder', nova); } catch (err) { /* reordenação só de exibição — falha em salvar não é crítica */ }
  },

  // ---------------------------------------------------------------------
  // Mover patrimônio/foto individual pra outro mapa (arrastar e soltar)
  // ---------------------------------------------------------------------

  /** Diálogo do item 3 (rodada 55/v309), pedido do usuário verbatim: "se o
   *  patrimônio estiver vinculado a uma foto naquele mapa [...] deve
   *  aparecer a mensagem de que ele está marcado em uma foto [...] dar a
   *  opção de mover [só ele] ou [...] a foto e outros patrimônios marcados
   *  nela [...] também deve informar que é possível mover a foto, que os
   *  patrimônios vão junto com ela." Resolve pra `'item'` (move só o
   *  patrimônio, larga a marcação), `'photo'` (move a foto inteira — e tudo
   *  que está marcado nela — no lugar do patrimônio sozinho) ou `'cancel'`
   *  (fecha sem mexer em nada). */
  _confirmMoveLinkedItem(item, foto, destino) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'organize-modal-backdrop';
      modal.innerHTML = `
        <div class="organize-modal">
          <h3>📷📍 Patrimônio marcado numa foto</h3>
          <p>O patrimônio <strong>${Utils.escapeHtml(item.patrimonio || '(sem número)')}</strong> está marcado (vinculado a um ponto) na foto <strong>${Utils.escapeHtml(foto.nome || '(sem nome)')}</strong> deste mapa.</p>
          <div class="organize-merge-rows">
            <label class="organize-merge-row">
              <input type="radio" name="organize-linked-choice" value="item" checked>
              <span>Mover só este patrimônio — a marcação dele nesta foto é removida (a foto e o resto do que está marcado nela ficam no mapa de origem).</span>
            </label>
            <label class="organize-merge-row">
              <input type="radio" name="organize-linked-choice" value="photo">
              <span>Mover a foto inteira também — todos os outros patrimônios marcados nela vão junto pra '${Utils.escapeHtml(this._mapDisplayName(destino.map))}'.</span>
            </label>
          </div>
          <div class="organize-modal-actions">
            <button type="button" class="btn secondary" id="organize-linked-cancel">Cancelar</button>
            <button type="button" class="btn" id="organize-linked-ok">Confirmar</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#organize-linked-cancel').onclick = () => { modal.remove(); resolve('cancel'); };
      modal.querySelector('#organize-linked-ok').onclick = () => {
        const v = modal.querySelector('input[name="organize-linked-choice"]:checked')?.value || 'item';
        modal.remove();
        resolve(v);
      };
    });
  },

  /** Coordenadas (`mapaX`/`mapaY`) são mantidas tal e qual ao mover — o
   *  usuário confirmou que todos os mapas do app compartilham a MESMA
   *  escala/origem de propósito ("1 em um mapa deve valer 1 no outro"), o
   *  que torna isso o comportamento CORRETO (não uma aproximação, como uma
   *  versão anterior deste comentário chegou a supor por engano).
   *
   *  ATUALIZAÇÃO (rodada 55/v309): não grava mais direto no IndexedDB — ver
   *  o comentário grande em `_pendingActions` (item 5) pro desenho da nova
   *  arquitetura de "alterações pendentes". Item 3 do mesmo pedido: se o
   *  patrimônio estiver marcado (orb) numa foto do mapa de origem, pergunta
   *  primeiro (`_confirmMoveLinkedItem`) — "mover só ele" segue o fluxo de
   *  sempre (staged); "mover a foto" delega inteiramente pra
   *  `_movePhotoToMap` (que já cascata os outros patrimônios marcados nela)
   *  e NÃO empilha uma 2ª ação separada pra este item (a mesma ação de
   *  mover a foto já cobre ele). */
  async _moveItemToMap(itemId, targetMapId) {
    const origem = this._maps.find((e) => e.itens.some((it) => it.id === itemId));
    const destino = this._maps.find((e) => e.map.id === targetMapId);
    if (!origem || !destino || origem.map.id === targetMapId) return;
    const item = origem.itens.find((it) => it.id === itemId);
    if (!item) return;
    const fotoComOrb = origem.fotos.find((f) => (f.orbs || []).some((o) => o.itemId === itemId));
    if (fotoComOrb) {
      const decisao = await this._confirmMoveLinkedItem(item, fotoComOrb, destino);
      if (decisao === 'cancel' || !decisao) return;
      if (decisao === 'photo') { await this._movePhotoToMap(fotoComOrb.id, targetMapId); return; }
      // decisao === 'item' — segue abaixo, movendo só o patrimônio.
    }
    this._ensurePendingSnapshot();
    origem.itens = origem.itens.filter((it) => it.id !== itemId);
    item.ambienteId = targetMapId;
    destino.itens.push(item);
    // BUG REAL corrigido na rodada 53 (item 6 do feedback daquela rodada,
    // verbatim): "se clicar, arrastar e soltar um patrimônio em outro mapa,
    // pode gerar um erro de referência [...] se uma foto em um mapa A tem
    // uma vinculação com esse patrimônio [...] vai gerar essa
    // inconsistência." Continua valendo aqui — remove (em memória; a
    // gravação de verdade fica pro "Aplicar", ver `_applyPendingActions`)
    // qualquer orb órfão nas fotos de ORIGEM que ainda apontava pra este
    // item (o caso onde a pessoa escolheu "mover só o patrimônio" acima).
    const fotosAlteradas = [];
    for (const foto of origem.fotos) {
      if (!(foto.orbs || []).some((o) => o.itemId === itemId)) continue;
      foto.orbs = foto.orbs.filter((o) => o.itemId !== itemId);
      fotosAlteradas.push(foto.id);
    }
    origem.isEmpty = this._isMapEmpty(origem.map, origem.itens);
    destino.isEmpty = this._isMapEmpty(destino.map, destino.itens);
    // ATUALIZADO (02/09/2026, rodada C) — antes só `_refreshCardBody`
    // (modo Cartões); agora o novo gesto de arrastar-e-soltar na GRADE
    // (`_finishDragSession`, ver comentário grande acima de
    // `_wireGridDragSource`) também chama esta função pra committar a
    // transferência, então o cartão da Grade precisa se atualizar aqui
    // também (sem isso, ficaria com o item "fantasma" nos 2 mapas até o
    // próximo re-render completo).
    this._refreshGridCardBody(origem);
    this._refreshGridCardBody(destino);
    this._refreshCardBody(origem);
    this._refreshCardBody(destino);
    const label = `patrimônio ('${item.patrimonio || '(sem número)'}') movido de mapa '${this._mapDisplayName(origem.map)}' para mapa '${this._mapDisplayName(destino.map)}'`;
    this._pushPendingAction({ type: 'move-item', itemId, toMapId: targetMapId, orphanedFotoIds: fotosAlteradas, label });
    Utils.toast('Patrimônio movido (pendente — clique em "Aplicar alterações" pra gravar) ✓', { type: 'ok' });
  },

  /** "Quanto as fotos, se elas forem arrastadas e soltadas em outro mapa,
   *  os patrimônios e vinculações devem ir junto" (pedido do usuário,
   *  verbatim) — todo item referenciado pelos orbs desta foto muda de mapa
   *  JUNTO com ela.
   *
   *  ATUALIZAÇÃO (rodada 55/v309, itens 4 e 5): não grava mais direto no
   *  IndexedDB (ver `_pendingActions`) nem chama `reload()`/`_renderList()`
   *  inteiro — só `_refreshCardBody` nos 2 cartões envolvidos (item 4,
   *  verbatim: "não recarregar tudo ao mudar uma foto de mapa"). */
  async _movePhotoToMap(fotoId, targetMapId) {
    const origem = this._maps.find((e) => e.fotos.some((f) => f.id === fotoId));
    const destino = this._maps.find((e) => e.map.id === targetMapId);
    const foto = origem?.fotos.find((f) => f.id === fotoId);
    if (!foto || !destino || !origem || origem.map.id === targetMapId) return;
    this._ensurePendingSnapshot();
    const idsVinculados = [...new Set((foto.orbs || []).map((o) => o.itemId).filter(Boolean))];
    origem.fotos = origem.fotos.filter((f) => f.id !== fotoId);
    foto.ambienteId = targetMapId;
    destino.fotos.push(foto);
    const itensMovidos = [];
    for (const id of idsVinculados) {
      const idx = origem.itens.findIndex((it) => it.id === id);
      if (idx < 0) continue; // já não está mais neste mapa (ex.: movido antes por outra ação pendente)
      const [it] = origem.itens.splice(idx, 1);
      it.ambienteId = targetMapId;
      destino.itens.push(it);
      itensMovidos.push(id);
    }
    origem.isEmpty = this._isMapEmpty(origem.map, origem.itens);
    destino.isEmpty = this._isMapEmpty(destino.map, destino.itens);
    // ATUALIZADO (02/09/2026, rodada C) — mesmo motivo documentado em
    // `_moveItemToMap` (rodada acima): o arrasto-e-solta novo da Grade
    // também usa esta função pra committar a transferência de foto (+
    // patrimônios vinculados) entre mapas.
    this._refreshGridCardBody(origem);
    this._refreshGridCardBody(destino);
    this._refreshCardBody(origem);
    this._refreshCardBody(destino);
    const label = `foto ('${foto.nome || '(sem nome)'}') movida de mapa '${this._mapDisplayName(origem.map)}' para mapa '${this._mapDisplayName(destino.map)}'${itensMovidos.length ? ` (${itensMovidos.length} patrimônio(s) junto)` : ''}`;
    this._pushPendingAction({ type: 'move-photo', fotoId, toMapId: targetMapId, itemIds: itensMovidos, label });
    Utils.toast(`Foto movida (pendente — clique em "Aplicar alterações" pra gravar) ✓${itensMovidos.length ? ` (${itensMovidos.length} patrimônio(s) junto)` : ''}`, { type: 'ok' });
  },

  // ---------------------------------------------------------------------
  // ITEM B — exclusões (rodada 57, retomada 31/08/2026). Pedido do usuário
  // verbatim, dentro do prompt gigante colado nesta rodada: "deve ser
  // possível excluir uma foto de forma individual [...] deve aparecer uma
  // janela de diálogo confirmando a exclusão, avisando que, se houver
  // algum patrimônio marcado nela, ele[s] vai [vão] perder essa marcação, e
  // se houver medições, também vão sumir [...] a exclusão real só ocorre
  // ao clicar em 'Aplicar alterações' [...] deve haver um destaque colorido
  // por mapa nos patrimônios afetados [...] e uma caixa tracejada vermelha,
  // com um preenchimento vermelho meio transparente, deve tomar o lugar da
  // foto excluída, na região que ficou vazia [...] cada mapa deve poder ser
  // excluído (botão de lixeira) [...] os patrimônios vinculados a ele NÃO
  // são apagados, só perdem a vinculação [...] quando o mapa não tiver
  // planta baixa, nem patrimônios, nem fotos, deve perguntar se é pra
  // 'remover nome e esqueleto?' [...] cada patrimônio deve poder ser
  // excluído [...] cada vinculação entre patrimônio e foto deve poder ser
  // desfeita".
  //
  // ARQUITETURA: segue o MESMO desenho de `_moveItemToMap`/`_movePhotoToMap`
  // acima — nada grava no IndexedDB aqui, só mexe em `this._maps` (memória)
  // e empurra uma `_pendingAction`; a gravação de verdade só acontece em
  // `_applyPendingActions` (novos `case`s adicionados lá embaixo). Diferente
  // de mover, ao EXCLUIR a coisa NÃO some da tela na hora — fica marcada com
  // uma flag `__pendingDelete` (foto/mapa) ou `__pendingDeleteColor` (item,
  // ver `_mapDeleteColor` abaixo) e os renderizadores (`_renderGridFotos`/
  // `_renderFotosColumn`, `_renderGridPatrimonios`/`_renderPatrimonioColumn`,
  // `_gridCardHtml`/`_mapCardHtml`) desenham uma "lápide" tracejada em vez do
  // conteúdo normal — isso, sozinho, já entrega o pedido de "caixa tracejada
  // vermelha ocupando a região vazia" sem precisar de nenhuma reflow/FLIP
  // (o espaço nunca chega a ficar vazio de verdade até "Aplicar").
  // DESFAZER uma exclusão isolada (sem reverter TODAS as pendências):
  // IMPLEMENTADO numa rodada posterior (retomado 31/08/2026) — ver
  // `_undoLastPendingAction`/`_UNDOABLE_LAST_ACTION_TYPES`/comentário grande
  // em `_renderPendingPanel`: um ↩️ na ÚLTIMA linha do painel de pendências
  // desfaz só ela. Limitação aceita e documentada: só funciona pra ÚLTIMA
  // ação da pilha (a mais recente) — desfazer uma do MEIO exigiria saber
  // reconciliar com o que veio depois, o que os tipos mais antigos (mover/
  // mesclar mapa) ainda não suportam; pra esses casos (ou pra desfazer mais
  // de uma de uma vez), "Reverter" (tudo-ou-nada) continua sendo o caminho.
  // ESCOPO DESTA RODADA: implementado só no modo Grade (mesmo recorte já
  // usado pros orbs de coluna/busca, ver comentário grande acima de
  // `_gridColCounts`) — os mesmos dados/flags (`__pendingDelete` etc.) TAMBÉM
  // já refletem no modo Cartões quando ele for redesenhado (os
  // renderizadores compartilhados — `_renderPatrimonioColumn`/
  // `_renderFotosColumn` — já checam as flags), só os BOTÕES de lixeira
  // (🗑️) ainda não foram colocados nos cartões do modo Cartões, só na
  // Grade. Ainda NÃO feito: excluir vinculação patrimônio-planta baixa
  // (precisa antes da "tabela de vinculações" embaixo da planta na Grade,
  // item ainda não implementado — ver changelog do projeto).
  // ---------------------------------------------------------------------

  /** Paleta de cores cicladas PRA CADA MAPA (não pra cada exclusão — pedido
   *  do usuário diz "destaque colorido por mapa", então todo mundo que for
   *  afetado por QUALQUER exclusão pendente dentro do MESMO mapa usa a MESMA
   *  cor, diferenciando só de mapa pra mapa). Cor é sorteada na 1ª exclusão
   *  pendente daquele mapa e fica fixa (`_gridMapDeleteColors`) enquanto
   *  houver pendência — reseta junto com o resto em `_revertPendingActions`/
   *  `_applyPendingActions`. Vermelho fica de fora do ciclo de propósito: é
   *  reservado só pra caixa tracejada da própria coisa sendo excluída (ver
   *  CSS `.organize-pending-delete-box`), pra nunca ser confundido com o
   *  destaque dos patrimônios AFETADOS por tabela.
   */
  _DELETE_COLOR_PALETTE: ['#ffb300', '#ab47bc', '#26c6da', '#66bb6a', '#5c6bc0', '#ec407a', '#8d6e63', '#78909c'],
  _gridMapDeleteColors: {},
  _mapDeleteColor(mapId) {
    if (!this._gridMapDeleteColors[mapId]) {
      const usedCount = Object.keys(this._gridMapDeleteColors).length;
      this._gridMapDeleteColors[mapId] = this._DELETE_COLOR_PALETTE[usedCount % this._DELETE_COLOR_PALETTE.length];
    }
    return this._gridMapDeleteColors[mapId];
  },

  /** Mapa/planta baixa/patrimônios/fotos TODOS vazios — condição pro aviso
   *  especial "remover nome e esqueleto?" (mais rigoroso que `_isMapEmpty`,
   *  que só olha planta baixa + pins: aqui também conta patrimônios/fotos
   *  meramente CATALOGADOS nesse mapa, mesmo sem pin nenhum). */
  _isMapFullyEmpty(entry) {
    return this._drawnCount(entry.map) === 0 && !entry.itens.length && !entry.fotos.length;
  },

  /** Diálogo de confirmação de exclusão de FOTO (item B1). Lista quantos
   *  patrimônios marcados (orbs) e quantas medidas essa foto tem, avisando
   *  que ambos somem junto — e que nada é gravado até "Aplicar alterações". */
  async _confirmDeletePhoto(foto) {
    const nOrbs = (foto.orbs || []).length;
    const nMedidas = (foto.medidas || []).length;
    const avisos = [];
    if (nOrbs) avisos.push(`${nOrbs} patrimônio(s) marcado(s) nela vão perder essa marcação (o patrimônio em si NÃO é apagado, só a vinculação com esta foto)`);
    if (nMedidas) avisos.push(`${nMedidas} medida(s) registrada(s) nela vão junto`);
    const msg = `Excluir a foto '${foto.nome || '(sem nome)'}'?${avisos.length ? `\n\n${avisos.join('.\n')}.` : ''}\n\nNada é apagado de verdade agora — fica pendente até você clicar em "Aplicar alterações" (ou desfaça clicando em "Reverter").`;
    const escolha = await Utils.showChoiceModal({
      title: '🗑️📷 Excluir foto',
      message: msg,
      choices: [
        { value: 'confirmar', label: '🗑️ Excluir (pendente)', danger: true },
        { value: 'cancelar', label: 'Cancelar', secondary: true },
      ],
    });
    return escolha === 'confirmar';
  },

  /** Marca UMA foto como "exclusão pendente" (item B1) — não some da tela: os
   *  renderizadores desenham uma caixa tracejada vermelha no lugar dela (ver
   *  comentário grande acima) até "Aplicar alterações" gravar de verdade
   *  (`DB.deleteAmbientePhoto`, ver `_applyPendingActions`). */
  /** Diálogo de confirmação de exclusão de MEDIDA (item 2 da rodada,
   *  01/09/2026) — mesmo padrão de `_confirmDeleteItem`/`_confirmDeletePhoto`. */
  async _confirmDeleteMedida(medida) {
    const valor = medida.valor && medida.valor.trim() ? `'${medida.valor.trim()}'` : '(sem valor registrado)';
    const msg = `Excluir a medida ${valor}?\n\nNada é apagado de verdade agora — fica pendente até você clicar em "Aplicar alterações" (ou desfaça clicando em "Reverter").`;
    const escolha = await Utils.showChoiceModal({
      title: '🗑️📏 Excluir medida',
      message: msg,
      choices: [
        { value: 'confirmar', label: '🗑️ Excluir (pendente)', danger: true },
        { value: 'cancelar', label: 'Cancelar', secondary: true },
      ],
    });
    return escolha === 'confirmar';
  },

  /** Marca UMA medida como "exclusão pendente" (item 2 da rodada,
   *  01/09/2026), pedido verbatim: "As medidas, feitas nas fotos, também
   *  podem ser excluídas e também ficam com borda vermelha tracejada e
   *  preenchimento vermelho transparente. Também, quando marcados para
   *  serem excluídos deve aparecer o botão de 'reverter'." Mesmo espírito
   *  de `_deletePhoto`/`_deleteItem`: fica no array (`foto.medidas`), só com
   *  a flag `__pendingDelete` — NUNCA sai de lá até `_applyPendingActions`
   *  (diferente de orb, que sai na hora e precisa de `_mergeOrbsWithGhosts`
   *  pra reconstruir a posição — aqui não existe esse risco, a medida nunca
   *  muda de índice no array enquanto só pendente). */
  async _deleteMedida(fotoId, medidaId) {
    const foto = this._findFotoById(fotoId);
    const medida = foto?.medidas?.find((m) => m.id === medidaId);
    if (!medida || !foto) return;
    if (medida.__pendingDelete) return;
    const entry = this._maps.find((e) => e.fotos.some((f) => f.id === fotoId));
    if (!entry) return;
    const ok = await this._confirmDeleteMedida(medida);
    if (!ok) return;
    this._ensurePendingSnapshot();
    medida.__pendingDelete = true;
    const label = `medida (${medida.valor && medida.valor.trim() ? `'${medida.valor.trim()}'` : '(sem valor)'}) excluída da foto '${foto.nome || '(sem nome)'}'`;
    this._pushPendingAction({ type: 'delete-medida', fotoId, medidaId, mapId: entry.map.id, label });
    this._refreshGridCardBody(entry);
    this._refreshCardBody(entry);
    Utils.toast('Medida marcada pra exclusão (pendente — clique em "Aplicar alterações" pra gravar) ✓', { type: 'ok' });
  },

  async _deletePhoto(fotoId) {
    const entry = this._maps.find((e) => e.fotos.some((f) => f.id === fotoId));
    const foto = entry?.fotos.find((f) => f.id === fotoId);
    if (!foto || !entry) return;
    if (foto.__pendingDelete) return; // já pendente — botão devia estar escondido, mas por garantia
    const ok = await this._confirmDeletePhoto(foto);
    if (!ok) return;
    this._ensurePendingSnapshot();
    const cor = this._mapDeleteColor(entry.map.id);
    foto.__pendingDelete = true;
    const idsAfetados = [...new Set((foto.orbs || []).map((o) => o.itemId).filter(Boolean))];
    // ITEM B-undo (retomado 31/08/2026) — `__pendingDeleteMarks` conta
    // QUANTAS exclusões pendentes deste mapa afetam este item (pode ser mais
    // de 1: 2 fotos diferentes marcando o mesmo patrimônio, cada uma com sua
    // própria exclusão pendente) — sem contar, um `_undoLastPendingAction`
    // que desfizesse só a exclusão MAIS RECENTE poderia apagar o destaque
    // colorido mesmo com outra exclusão pendente ainda afetando o mesmo
    // item.
    for (const itemId of idsAfetados) {
      const it = entry.itens.find((x) => x.id === itemId);
      if (it) { it.__pendingDeleteColor = cor; it.__pendingDeleteMarks = (it.__pendingDeleteMarks || 0) + 1; }
    }
    const label = `foto ('${foto.nome || '(sem nome)'}') excluída do mapa '${this._mapDisplayName(entry.map)}'${idsAfetados.length ? ` (${idsAfetados.length} marcação(ões) de patrimônio junto)` : ''}`;
    // ATUALIZADO (31/08/2026, item D) — `_pushPendingAction` movido pra
    // ANTES do refresh do card (era depois): `_renderGridFotos`/
    // `_renderFotosColumn` agora também consultam `_pendingActions` na hora
    // de desenhar (`_pendingDeletedChipsForFoto`, pros chips "fantasma" de
    // patrimônio excluído) — se o refresh rodasse ANTES da ação existir na
    // pilha (como era antes), a lápide renderizaria sem saber da própria
    // exclusão que acabou de acontecer. Não muda nada pro resto (o refresh
    // só LÊ `_pendingActions`, nunca dependeu da ORDEM antes).
    this._pushPendingAction({ type: 'delete-foto', fotoId, mapId: entry.map.id, affectedItemIds: idsAfetados, label });
    this._refreshGridCardBody(entry);
    this._refreshCardBody(entry);
    Utils.toast('Foto marcada pra exclusão (pendente — clique em "Aplicar alterações" pra gravar) ✓', { type: 'ok' });
  },

  /** Diálogo de confirmação de exclusão de PATRIMÔNIO (item B3). */
  async _confirmDeleteItem(item, orbsCount) {
    const avisos = [];
    if (orbsCount) avisos.push(`ele está marcado em ${orbsCount} foto(s) — essa(s) marcação(ões) some(m) junto`);
    if (typeof item.mapaX === 'number') avisos.push('ele está fixado (pin) na planta baixa deste mapa — esse pin some junto');
    const msg = `Excluir o patrimônio '${item.patrimonio || '(sem número)'}'?${avisos.length ? `\n\n${avisos.join('.\n')}.` : ''}\n\nNada é apagado de verdade agora — fica pendente até você clicar em "Aplicar alterações" (ou desfaça clicando em "Reverter").`;
    const escolha = await Utils.showChoiceModal({
      title: '🗑️📦 Excluir patrimônio',
      message: msg,
      choices: [
        { value: 'confirmar', label: '🗑️ Excluir (pendente)', danger: true },
        { value: 'cancelar', label: 'Cancelar', secondary: true },
      ],
    });
    return escolha === 'confirmar';
  },

  /** Marca UM patrimônio como "exclusão pendente" (item B3) — mesmo espírito
   *  de `_deletePhoto`: fica na lista, só com a flag `__pendingDelete`
   *  (renderizado como "plaquinha" tracejada/riscada). Órfãos deixados nos
   *  orbs das fotos deste mapa são limpos AQUI (em memória), mesmo padrão já
   *  usado por `_moveItemToMap` — `orphanedFotoIds` viaja na própria ação
   *  pendente pra `_applyPendingActions` saber quais fotos regravar. */
  async _deleteItem(itemId) {
    const entry = this._maps.find((e) => e.itens.some((it) => it.id === itemId));
    const item = entry?.itens.find((it) => it.id === itemId);
    if (!item || !entry) return;
    if (item.__pendingDelete) return;
    const orbsCount = entry.fotos.reduce((n, f) => n + (f.orbs || []).filter((o) => o.itemId === itemId).length, 0);
    const ok = await this._confirmDeleteItem(item, orbsCount);
    if (!ok) return;
    this._ensurePendingSnapshot();
    item.__pendingDelete = true;
    // ITEM B-undo (retomado 31/08/2026) — além da lista de fotos alteradas
    // (`orphanedFotoIds`, usada por `_applyPendingActions` pra saber quais
    // fotos regravar), agora guarda o objeto do ORB removido de cada uma
    // (`removedOrbs`) — só isso permite `_undoLastPendingAction` restaurar a
    // marcação exata (posição xNorm/yNorm etc.) se esta ação pendente for
    // desfeita antes de aplicar; sem guardar o orb inteiro, um "desfazer"
    // teria como recolocar o item de volta na lista mas NÃO como saber onde
    // ele estava marcado nas fotos.
    const fotosAlteradas = [];
    const removedOrbs = [];
    for (const foto of entry.fotos) {
      const orbsDoItem = (foto.orbs || []).filter((o) => o.itemId === itemId);
      if (!orbsDoItem.length) continue;
      // NOVO (01/09/2026), pedido verbatim: "Os patrimônios (vinculação, em
      // baixo das fotos) ao serem marcados para serem excluídos, devem
      // ficar nas suas posições e não ir para o 'final da lista de
      // exibição'." Sem guardar a posição ORIGINAL (`orbIndex`, calculada
      // AQUI, antes do `.filter` abaixo remover o orb de `foto.orbs` de
      // vez), o renderizador só sabia "este chip virou fantasma", não ONDE
      // ele estava na lista — por isso os fantasmas sempre apareciam
      // empurrados pro final (ver `_renderFotosColumn`/`_renderGridFotos`,
      // que agora usam isto pra reencaixar o fantasma na mesma posição).
      const idxDoItem = orbsDoItem.map((orb) => foto.orbs.indexOf(orb));
      foto.orbs = foto.orbs.filter((o) => o.itemId !== itemId);
      fotosAlteradas.push(foto.id);
      orbsDoItem.forEach((orb, i) => removedOrbs.push({ fotoId: foto.id, orb, orbIndex: idxDoItem[i] }));
    }
    const label = `patrimônio ('${item.patrimonio || '(sem número)'}') excluído do mapa '${this._mapDisplayName(entry.map)}'`;
    // ATUALIZADO (31/08/2026, item D) — mesmo motivo/mesma troca de ordem
    // documentada em `_deletePhoto`: `_pushPendingAction` ANTES do refresh
    // agora é OBRIGATÓRIO aqui — `_pendingDeletedChipsForFoto` (chamada
    // pelos renderizadores de foto) só encontra o orb removido (guardado em
    // `removedOrbs`, dentro desta MESMA ação) se ela já estiver em
    // `_pendingActions` no momento em que o card é redesenhado; sem isso, o
    // chip "fantasma" (item D) some de vez em vez de virar lápide, porque o
    // orb real já foi removido de `foto.orbs` ALGUMAS LINHAS ACIMA e a ação
    // que guarda a cópia dele ainda não existia pro renderizador consultar.
    this._pushPendingAction({ type: 'delete-item', itemId, mapId: entry.map.id, orphanedFotoIds: fotosAlteradas, removedOrbs, label });
    this._refreshGridCardBody(entry);
    this._refreshCardBody(entry);
    Utils.toast('Patrimônio marcado pra exclusão (pendente — clique em "Aplicar alterações" pra gravar) ✓', { type: 'ok' });
  },

  /** Desfaz só a VINCULAÇÃO entre um patrimônio e uma foto (item B5) — nem o
   *  patrimônio nem a foto são excluídos, só o orb que ligava os dois.
   *  CORRIGIDO (01/09/2026) — pedido verbatim: "Os patrimônios (vinculações,
   *  em baixo das fotos), ainda estão desaparecendo ao serem marcados para
   *  serem excluídos diretamente por eles (o ícone de tesoura). Eles devem
   *  permanecer exatamente onde estão [...] E, ao ser marcados para
   *  exclusão, devem ficar com um risco, borda tracejada vermelha e
   *  preenchimento vermelho transparente." O comentário antigo desta função
   *  dizia "não precisa de flag de pendente visual [...] não há região
   *  vazia pra desenhar caixa nenhuma" — estava ERRADO: a foto continua
   *  existindo com uma vaga a menos na lista de vinculações, então SIM dá
   *  pra (e agora deve) desenhar uma lápide no lugar do chip que sumiu (ver
   *  `_pendingDeletedChipsForFoto`, estendida pra também reconhecer
   *  `type: 'unlink-item-foto'`). Igual ao mesmo bug já corrigido em
   *  `_deleteItem`/`_deletePhoto` (31/08/2026): `_pushPendingAction` tinha
   *  que vir ANTES do refresh do card, não depois — sem isso, o card é
   *  redesenhado (e `_pendingDeletedChipsForFoto` consultado) ANTES da ação
   *  existir em `_pendingActions`, então o "fantasma" não tinha de onde ler
   *  o orb removido e o chip só sumia mesmo. */
  async _unlinkItemFromFoto(itemId, fotoId) {
    const entry = this._maps.find((e) => e.fotos.some((f) => f.id === fotoId));
    const foto = entry?.fotos.find((f) => f.id === fotoId);
    const item = entry?.itens.find((it) => it.id === itemId);
    if (!foto || !item || !entry) return;
    const escolha = await Utils.showChoiceModal({
      title: '🔗✂️ Desfazer vinculação',
      message: `Desfazer a marcação do patrimônio '${item.patrimonio || '(sem número)'}' na foto '${foto.nome || '(sem nome)'}'?\n\nO patrimônio e a foto continuam existindo, só a marcação entre os dois é removida. Fica pendente até "Aplicar alterações".`,
      choices: [
        { value: 'confirmar', label: '✂️ Desfazer vinculação (pendente)', danger: true },
        { value: 'cancelar', label: 'Cancelar', secondary: true },
      ],
    });
    if (escolha !== 'confirmar') return;
    this._ensurePendingSnapshot();
    // ITEM B-undo — guarda o orb EXATO removido (não só que "existia um"):
    // é o que permite `_undoLastPendingAction` recolocá-lo de volta no
    // mesmo x/y de antes, se esta for a última ação pendente e for desfeita.
    const removedOrb = (foto.orbs || []).find((o) => o.itemId === itemId) || null;
    // NOVO (01/09/2026), pedido verbatim: "Os patrimônios (vinculação, em
    // baixo das fotos) ao serem marcados para serem excluídos, devem ficar
    // nas suas posições e não ir para o 'final da lista de exibição'."
    // Mesma lógica já aplicada em `_deleteItem`: guarda a posição ORIGINAL
    // do orb (`orbIndex`) ANTES do `.filter()` abaixo removê-lo de vez de
    // `foto.orbs` — sem isso o fantasma não sabia onde reencaixar.
    const orbIndex = removedOrb ? foto.orbs.indexOf(removedOrb) : -1;
    foto.orbs = (foto.orbs || []).filter((o) => o.itemId !== itemId);
    const label = `vinculação desfeita: patrimônio ('${item.patrimonio || '(sem número)'}') não está mais marcado na foto ('${foto.nome || '(sem nome)'}')`;
    this._pushPendingAction({ type: 'unlink-item-foto', itemId, fotoId, mapId: entry.map.id, removedOrb, orbIndex, label });
    this._refreshGridCardBody(entry);
    this._refreshCardBody(entry);
    Utils.toast('Vinculação desfeita (pendente — clique em "Aplicar alterações" pra gravar) ✓', { type: 'ok' });
  },

  /** ITEM B6 (retomado 31/08/2026) — mesma ideia de `_unlinkItemFromFoto`,
   *  só que pra vinculação com a PLANTA BAIXA (o pin `mapaX`/`mapaY`/
   *  `mapaPiso` do item, não uma marcação em foto): o patrimônio continua
   *  catalogado neste mapa (`ambienteId` intacto), só o PIN é removido —
   *  mesmo espírito de `DB.deleteMap` desvinculando (não apagando) itens.
   *  CORRIGIDO (01/09/2026) — mesmo bug/mesma correção documentada agora em
   *  `_unlinkItemFromFoto` (pedido verbatim lá): `_pushPendingAction`
   *  precisa vir ANTES do refresh, senão `_pendingUnlinkPlantaGhosts`
   *  (chamada por `_renderMapVinculacoes`/`_renderGridVinculacoesPlanta` ao
   *  redesenhar o card) não encontra a ação ainda, e o chip da vinculação
   *  com a planta baixa só desaparece em vez de virar lápide. */
  async _unlinkItemFromPlanta(itemId, mapId) {
    const entry = this._maps.find((e) => e.map.id === mapId);
    const item = entry?.itens.find((it) => it.id === itemId);
    if (!item || !entry || typeof item.mapaX !== 'number') return;
    const escolha = await Utils.showChoiceModal({
      title: '🔗✂️ Desvincular da planta baixa',
      message: `Desvincular o patrimônio '${item.patrimonio || '(sem número)'}' da planta baixa do mapa '${this._mapDisplayName(entry.map)}'?\n\nO patrimônio continua catalogado neste mapa — só o PIN (posição na planta) é removido. Fica pendente até "Aplicar alterações".`,
      choices: [
        { value: 'confirmar', label: '✂️ Desvincular (pendente)', danger: true },
        { value: 'cancelar', label: 'Cancelar', secondary: true },
      ],
    });
    if (escolha !== 'confirmar') return;
    this._ensurePendingSnapshot();
    // ITEM B-undo — guarda a posição EXATA de antes (não só "estava
    // vinculado"), pra `_undoLastPendingAction` conseguir restaurar o pin no
    // mesmo lugar de antes, se esta for a última ação pendente e for desfeita.
    const previousPin = { mapaX: item.mapaX, mapaY: item.mapaY, mapaPiso: item.mapaPiso };
    item.mapaX = null; item.mapaY = null; item.mapaPiso = 0;
    const label = `patrimônio ('${item.patrimonio || '(sem número)'}') desvinculado da planta baixa do mapa '${this._mapDisplayName(entry.map)}'`;
    this._pushPendingAction({ type: 'unlink-item-planta', itemId, mapId, previousPin, label });
    this._refreshGridCardBody(entry);
    this._refreshCardBody(entry);
    Utils.toast('Desvinculado da planta baixa (pendente — clique em "Aplicar alterações" pra gravar) ✓', { type: 'ok' });
  },

  /** Diálogo de confirmação de exclusão de MAPA (item B2/B7) — 2 variantes:
   *  a normal (avisa cascata: patrimônios só desvinculam, fotos E medidas
   *  são apagadas de verdade) e a especial "remover nome e esqueleto?"
   *  quando o mapa está 100% vazio (`_isMapFullyEmpty`) — pedido do usuário
   *  verbatim: "quando um mapa não tiver planta baixa, nem patrimônios, nem
   *  fotos, deve perguntar se é pra 'remover nome e esqueleto?'". */
  async _confirmDeleteMap(entry) {
    const nome = this._mapDisplayName(entry.map);
    if (this._isMapFullyEmpty(entry)) {
      const escolha = await Utils.showChoiceModal({
        title: '🗑️🗺️ Remover nome e esqueleto?',
        message: `O mapa '${nome}' não tem planta baixa desenhada, nem patrimônios, nem fotos vinculadas — só o "nome e esqueleto" dele (o registro em si). Quer removê-lo mesmo assim?\n\nFica pendente até "Aplicar alterações".`,
        choices: [
          { value: 'confirmar', label: '🗑️ Remover nome e esqueleto (pendente)', danger: true },
          { value: 'cancelar', label: 'Cancelar', secondary: true },
        ],
      });
      return escolha === 'confirmar';
    }
    const nFotos = entry.fotos.length;
    const nItens = entry.itens.length;
    const avisos = [];
    if (nItens) avisos.push(`${nItens} patrimônio(s) catalogado(s) aqui NÃO são apagados — só perdem a vinculação com este mapa (viram "sem mapa")`);
    if (nFotos) avisos.push(`${nFotos} foto(s) (com suas marcações e medidas) SÃO apagadas de verdade`);
    const msg = `Excluir o mapa '${nome}'?\n\n${avisos.join('.\n')}.\n\nFica pendente até "Aplicar alterações" (ou desfaça clicando em "Reverter").`;
    const escolha = await Utils.showChoiceModal({
      title: '🗑️🗺️ Excluir mapa',
      message: msg,
      choices: [
        { value: 'confirmar', label: '🗑️ Excluir mapa (pendente)', danger: true },
        { value: 'cancelar', label: 'Cancelar', secondary: true },
      ],
    });
    return escolha === 'confirmar';
  },

  /** Marca UM mapa inteiro como "exclusão pendente" (item B2/B7) — igual
   *  espírito de `_deletePhoto`/`_deleteItem`: NÃO some da lista, fica com
   *  `entry.__pendingDelete` e os 2 cartões (`_gridCardHtml`/`_mapCardHtml`)
   *  desenham uma "lápide" tracejada no lugar do conteúdo normal (ver
   *  `_pendingDeleteMapTombstoneHtml`). A cascata de verdade (desvincular
   *  patrimônios, apagar fotos, reparentar mapas-filhos) fica TODA por conta
   *  de `DB.deleteMap` — já existente e já testado — chamado só em
   *  `_applyPendingActions`; não precisa ser replicada aqui em memória. */
  async _deleteMap(mapId) {
    const entry = this._maps.find((e) => e.map.id === mapId);
    if (!entry || entry.__pendingDelete) return;
    const ok = await this._confirmDeleteMap(entry);
    if (!ok) return;
    this._ensurePendingSnapshot();
    entry.__pendingDelete = true;
    this._refreshGridCardBody(entry);
    this._refreshCardBody(entry);
    const label = `mapa '${this._mapDisplayName(entry.map)}' excluído${entry.itens.length ? ` (${entry.itens.length} patrimônio(s) desvinculado(s), não apagado(s))` : ''}${entry.fotos.length ? ` (${entry.fotos.length} foto(s) apagada(s))` : ''}`;
    this._pushPendingAction({ type: 'delete-map', mapId, label });
    Utils.toast('Mapa marcado pra exclusão (pendente — clique em "Aplicar alterações" pra gravar) ✓', { type: 'ok' });
  },

  /** Atualiza UM cartão da Grade a partir do estado atual de `entry` — mesmo
   *  espírito de `_refreshCardBody` (modo Cartões).
   *  CORRIGIDO (01/09/2026, item B5), pedido verbatim: "Ao marcar algo para
   *  exclusão não deveria dar uma 'piscada' nos elementos." Causa raiz: este
   *  método trocava o `outerHTML` do CARTÃO INTEIRO a cada chamada — mesmo
   *  pra marcar 1 plaquinha/1 foto/1 vinculação como pendente — o que
   *  destruía e recriava o `<canvas>` da miniatura AO VIVO (`_wireGridLiveMap`,
   *  fica em branco até redesenhar tudo do zero) e resetava o campo de
   *  busca (foco/texto digitado) e o cabeçalho/alça de arrasto, mesmo eles
   *  não tendo mudado nada. Faz um patch CIRÚRGICO em 3 pedaços —
   *  contadores do cabeçalho, coluna de patrimônios
   *  (`.organize-grid-patrimonios-col`), coluna de fotos
   *  (`.organize-grid-fotos`) e a lista de vinculações com a planta baixa
   *  (dentro de `.organize-grid-mapa-wrap`, sem tocar no `<canvas>`/miniatura
   *  ao vivo que mora no MESMO wrapper) — usando os helpers extraídos de
   *  `_wireGridCard` (`_wireGridPatrimoniosCol`/`_wireGridFotosWrap`/
   *  `_wireGridMapaWrap`) pra religar só o que foi recriado, nunca o cartão
   *  inteiro de novo (evita duplicar listener nos orbs de coluna que não
   *  mudaram, ver comentário grande neles).
   *  CORRIGIDO (01/09/2026), pedido verbatim (item 4 da rodada): "Ao clicar
   *  para excluir o mapa, não deve dar essa piscada [...]." Antes, o mapa
   *  INTEIRO virando "lápide" pendente era tratado como CASO ESPECIAL aqui —
   *  trocava o cartão inteiro por `outerHTML` (mesma piscada que este método
   *  inteiro nasceu pra evitar!) porque a lápide antiga tinha uma ESTRUTURA
   *  diferente (sem as 3 colunas). Agora que `_gridCardHtml` sempre desenha
   *  as mesmas 3 colunas (ver `forcePending`, comentário grande lá), esse
   *  caso especial não existe mais — o patch cirúrgico de sempre já basta,
   *  só passando `entry.__pendingDelete` como `forcePending` pros 3
   *  renderizadores. Só o CABEÇALHO precisa de um patch extra (pequeno, não
   *  o cartão inteiro): trocar o botão "🗑️ excluir" por "↩️ reverter" (e
   *  vice-versa), feito só quando o estado realmente muda de um lado pro
   *  outro (`headerTemRevert !== forcePending`), pra não recriar/religar os
   *  botões do cabeçalho à toa em toda chamada (ex.: marcar 1 item pendente
   *  não deveria mexer no cabeçalho do mapa). */
  _refreshGridCardBody(entry) {
    const canvas = this._overlayEl?.querySelector('#organize-grid-canvas');
    const oldCard = canvas?.querySelector(`.organize-grid-card[data-map-id="${entry.map.id}"]`);
    if (!oldCard) return;
    const { map, itens } = entry;
    const fotos = this._sortFotosForDisplay(entry); // ver comentário grande em `_gridCardHtml` (mesma ordem personalizada, D5)
    const forcePending = !!entry.__pendingDelete;
    oldCard.classList.toggle('organize-grid-card-map-pending', forcePending);
    const nomeEl = oldCard.querySelector('.organize-map-card-name');
    if (nomeEl) nomeEl.title = forcePending ? 'Este mapa tem uma exclusão pendente' : 'Clique pra renomear';
    const headerEl = oldCard.querySelector('.organize-grid-card-header');
    const countsEl = oldCard.querySelector('.organize-map-card-counts');
    if (countsEl) {
      countsEl.textContent = `📦 ${itens.length} · 🖼️ ${fotos.length}`;
      countsEl.classList.toggle('organize-counts-zero', !itens.length && !fotos.length);
    }
    const headerTemRevert = !!headerEl?.querySelector('.organize-pending-undo-inline');
    if (headerEl && countsEl && headerTemRevert !== forcePending) {
      let bnode = countsEl.nextElementSibling;
      while (bnode) { const next = bnode.nextElementSibling; bnode.remove(); bnode = next; }
      const headerBtnHtml = forcePending
        ? this._inlineRevertBtnHtml('delete-map', map.id)
        : `<button type="button" class="icon-btn sm organize-map-export-btn" data-map-id="${map.id}" title="Exportar apenas este mapa (planta, patrimônios e fotos dele)">⬇️🗺️</button>
          <button type="button" class="icon-btn sm organize-map-delete-btn" data-map-id="${map.id}" title="Excluir este mapa (pedido do usuário, 31/08/2026 — pendente até 'Aplicar alterações')">🗑️</button>`;
      countsEl.insertAdjacentHTML('afterend', headerBtnHtml);
      // O botão "↩️ reverter" é resolvido pelo listener DELEGADO no overlay
      // inteiro (ver `_buildOverlay`) — não precisa de religação aqui. Só
      // export/excluir (religados por card, não delegados) precisam.
      if (!forcePending) {
        oldCard.querySelector('.organize-map-export-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof SettingsView === 'undefined' || !SettingsView._openExportModal) {
            Utils.toast('Módulo de exportação não carregado.', { type: 'danger' });
            return;
          }
          SettingsView._openExportModal({ onlyMapId: map.id });
        });
        oldCard.querySelector('.organize-map-delete-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this._deleteMap(map.id);
        });
      }
    }
    const patrCol = oldCard.querySelector('.organize-grid-patrimonios-col');
    if (patrCol) {
      const mapColKey = `map:${map.id}`;
      patrCol.innerHTML = `
        <div class="organize-grid-section-head">
          ${this._colOrbHtml(mapColKey, itens.length)}
          <input type="text" class="organize-grid-search" data-search-key="${mapColKey}" placeholder="🔎 Buscar patrimônio…" title="Busca por número de patrimônio, dentro deste mapa">
          <button type="button" class="icon-btn sm organize-grid-search-toggle" data-search-key="${mapColKey}" title="${this._gridSearchModeTitle(this._getSearchMode(mapColKey))}">${this._gridSearchModeIcon(this._getSearchMode(mapColKey))}</button>
          ${this._sortOrbHtml(map.id)}
        </div>
        <div class="organize-grid-patrimonios" data-cols-key="${mapColKey}" style="--organize-cols:${this._effectiveColCount(mapColKey, itens.length)}">
          ${this._renderGridPatrimonios(this._sortItensForDisplay(entry), fotos, map.id, forcePending)}
        </div>`;
      this._wireGridPatrimoniosCol(patrCol, entry, oldCard);
    }
    // CORRIGIDO (02/09/2026), pedido do usuário verbatim: "o orb de
    // reorganização das fotos não está funcionando. Cliquei e não está
    // mudando a quantidade de colunas." Causa raiz: este patch cirúrgico
    // só recriava o innerHTML de `.organize-grid-fotos` (a grade em si) —
    // o cabeçalho novo com o orb de colunas (`.organize-grid-fotos-col` >
    // `.organize-grid-section-head`, ver `_gridCardHtml`) fica FORA disso,
    // então nunca tinha seus botões religados por `_wireGridFotosWrap`
    // (que só recebia a grade, nunca o cabeçalho) — o orb desenhava mas
    // nenhum clique nele fazia nada, na 1ª renderização OU em qualquer
    // refresh depois. Corrigido tratando `.organize-grid-fotos-col`
    // inteiro (cabeçalho + grade) da MESMA forma simétrica que
    // `.organize-grid-patrimonios-col` já recebia logo acima — reconstrói
    // os dois juntos e religa tudo de uma vez (nunca dá pra religar só o
    // cabeçalho reaproveitando a grade antiga, então precisa ser o par
    // inteiro, evitando o risco de religar o MESMO orb 2x — comentário
    // grande acima de `_gridColCounts`).
    const fotosCol = oldCard.querySelector('.organize-grid-fotos-col');
    if (fotosCol) {
      const fotosColKey = `fotos:map:${map.id}`;
      fotosCol.innerHTML = `
        <div class="organize-grid-section-head">
          ${this._colOrbHtml(fotosColKey, fotos.length)}
        </div>
        <div class="organize-grid-fotos" data-cols-key="${fotosColKey}" style="--organize-cols:${this._effectiveColCount(fotosColKey, fotos.length)};--organize-foto-w:${this._gridFotosCellWidthPx(fotos, itens)}px">
          ${this._renderGridFotos(fotos, itens, forcePending)}
        </div>`;
      this._wireGridFotosWrap(fotosCol, entry, oldCard);
    }
    const vinculadosNoMapa = itens.filter((it) => typeof it.mapaX === 'number');
    const mapaWrap = oldCard.querySelector('.organize-grid-mapa-wrap');
    const statsEl = mapaWrap?.querySelector('.organize-map-thumb-stats');
    if (statsEl) statsEl.textContent = `🧱 ${this._drawnCount(map)} · 📌 ${vinculadosNoMapa.length}`;
    if (mapaWrap && statsEl) {
      // Remove tudo DEPOIS do bloco de estatísticas (cabeçalho do orb de
      // colunas + grade de chips da vinculação com a planta, ambos gerados
      // por `_renderGridVinculacoesPlanta`) sem tocar em nada ANTES dele
      // (`.organize-map-thumb-wrap`/`<canvas>` da miniatura ao vivo) —
      // mesmo espírito do `oldVinc.outerHTML = vincHtml` de
      // `_refreshCardBody`, só que aqui são 2 elementos-irmãos em vez de 1
      // só (ver `_renderGridVinculacoesPlanta`, que devolve os 2 juntos).
      let node = statsEl.nextElementSibling;
      while (node) { const next = node.nextElementSibling; node.remove(); node = next; }
      // CORRIGIDO (02/09/2026, rodada D, item D11) — faltava reconstruir a
      // lista expansível de objetos (`_renderMapObjectsList`) aqui: como
      // este patch apaga TUDO depois de `statsEl` (comentário acima) e só
      // reinseria `_renderGridVinculacoesPlanta`, o bloco `<details>` dos
      // objetos sumia do cartão a partir do 1º refresh cirúrgico depois da
      // renderização inicial (`_gridCardHtml`, que É o único outro lugar que
      // chamava `_renderMapObjectsList`). `insertAdjacentHTML('afterend', …)`
      // chamado 2x, nesta ordem, reproduz a MESMA ordem visual de
      // `_gridCardHtml` (stats → objetos → vinculações da planta), porque
      // cada chamada insere logo depois de `statsEl`, empurrando a anterior.
      statsEl.insertAdjacentHTML('afterend', this._renderGridVinculacoesPlanta(vinculadosNoMapa, map.id, forcePending));
      statsEl.insertAdjacentHTML('afterend', this._renderMapObjectsList(map));
      this._wireGridMapaWrap(mapaWrap, map.id);
    }
  },

  // ---------------------------------------------------------------------
  // Mesclagem de mapas
  // ---------------------------------------------------------------------

  /** Alça de arrasto (`.organize-map-drag-handle`) — SÓ ela é `draggable`
   *  (ver bug 3 no cabeçalho do arquivo: o cartão inteiro sendo `draggable`
   *  sequestrava o gesto de TODAS as ferramentas de seleção). O cartão
   *  continua recebendo `dragover`/`drop` normalmente — só quem RECEBE um
   *  arraste precisa ouvir esses eventos; só quem INICIA um arraste precisa
   *  de `draggable="true"`. Aceita 3 tipos de payload: mapa (mesclar),
   *  patrimônio ou foto (mover pra este mapa). */
  _wireCardDragDrop(card, mapId) {
    const handle = card.querySelector('.organize-map-drag-handle');
    if (handle) {
      handle.draggable = true;
      handle.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/organize-map-id', mapId);
        e.dataTransfer.effectAllowed = 'link';
      });
    }
    card.addEventListener('dragover', (e) => {
      const types = [...e.dataTransfer.types];
      if (!types.includes('text/organize-map-id') && !types.includes('text/organize-item-id') && !types.includes('text/organize-foto-id')) return;
      e.preventDefault();
      card.classList.add('organize-map-dragover');
    });
    card.addEventListener('dragleave', () => card.classList.remove('organize-map-dragover'));
    card.addEventListener('drop', (e) => {
      card.classList.remove('organize-map-dragover');
      const origemMapId = e.dataTransfer.getData('text/organize-map-id');
      const itemId = e.dataTransfer.getData('text/organize-item-id');
      const fotoId = e.dataTransfer.getData('text/organize-foto-id');
      if (!origemMapId && !itemId && !fotoId) return;
      e.preventDefault();
      if (origemMapId && origemMapId !== mapId) this._mergeMaps([origemMapId, mapId]);
      else if (itemId) this._moveItemToMap(itemId, mapId);
      else if (fotoId) this._movePhotoToMap(fotoId, mapId);
    });
  },

  _mergeSelected() {
    if (this._selectedMapIds.size < 2) { Utils.toast('Marque 2 ou mais mapas pra mesclar.', { type: 'warn' }); return; }
    this._mergeMaps([...this._selectedMapIds]);
  },

  /** Anima os cartões que vão SUMIR numa mesclagem (encolhem/desaparecem)
   *  antes de tirá-los de `_maps`/do DOM — item 4 do feedback: "as
   *  movimentações de mesclagem devem ter animação." Trava a altura atual
   *  em pixels (senão `max-height` não tem o que animar — a altura natural
   *  é `auto`) e deixa a transição CSS (`.organize-map-merging-out`, ver
   *  style.css) fazer o resto; resolve depois de um tempo fixo (igual à
   *  duração da transição) em vez de esperar `transitionend` pra não travar
   *  se o cartão já tiver sumido do DOM por outro motivo nesse meio-tempo. */
  _animateMergeCollapse(mapIds) {
    return new Promise((resolve) => {
      const cards = mapIds.map((id) => this._listEl?.querySelector(`.organize-map-card[data-map-id="${id}"]`)).filter(Boolean);
      if (!cards.length) { resolve(); return; }
      cards.forEach((card) => {
        card.style.maxHeight = card.offsetHeight + 'px';
        card.classList.add('organize-map-merging');
        requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('organize-map-merging-out')));
      });
      setTimeout(resolve, 420);
    });
  },

  /** Atualiza SÓ o miolo de UM cartão (contadores, coluna de patrimônios,
   *  coluna de fotos, estatística/vinculações da planta) — SEM recriar o
   *  cartão inteiro nem sua miniatura. Nasceu na rodada 53/54 como
   *  `_refreshMergedCardAfterMerge` (só pro cartão SOBREVIVENTE de uma
   *  mesclagem — item 5 do feedback daquela rodada, verbatim: "ainda dá uma
   *  piscada na tela [...] não tem porque piscar a tela [inteira]." Causa
   *  raiz: `_renderList()` reconstrói TODOS os cartões, inclusive
   *  `<canvas>` de miniatura, que ficam em branco até a fila redesenhar
   *  tudo do zero) — GENERALIZADA nesta rodada (55/v309, item 4 do
   *  feedback, verbatim: "faça com que não recarregue tudo ao mudar uma
   *  foto de mapa. Apenas mude elementos na página") pra ser reaproveitada
   *  também por `_moveItemToMap`/`_movePhotoToMap`: mover um item/foto
   *  entre mapas agora chama esta função 2x (uma pro cartão de ORIGEM, uma
   *  pro de DESTINO) em vez de `_dirty=true; await this.reload()` (que
   *  reconstruía a lista inteira do zero E ainda ia ao banco de novo à
   *  toa). */
  // CORRIGIDO (01/09/2026), pedido verbatim (item 4 da rodada): "Ao clicar
  // para excluir o mapa, não deve dar essa piscada [...]." Mesma
  // correção/motivo documentados no comentário grande de
  // `_refreshGridCardBody` (versão Grade): o mapa inteiro pendente NÃO
  // troca mais de estrutura (`forcePending` mantém as 3 colunas de sempre),
  // então o caso especial "troca o cartão inteiro" (e o bug irmão do
  // caminho inverso, `wasTombstone`) deixou de existir — só o cabeçalho
  // precisa de um patch extra (botão excluir ↔ reverter).
  _refreshCardBody(entry) {
    const card = this._listEl?.querySelector(`.organize-map-card[data-map-id="${entry.map.id}"]`);
    if (!card) return;
    const { map, itens, fotos } = entry;
    const forcePending = !!entry.__pendingDelete;
    card.classList.toggle('organize-grid-card-map-pending', forcePending);
    const nomeEl = card.querySelector('.organize-map-card-name');
    if (nomeEl) nomeEl.title = forcePending ? 'Este mapa tem uma exclusão pendente' : 'Clique pra renomear';
    const countsEl = card.querySelector('.organize-map-card-counts');
    if (countsEl) {
      countsEl.textContent = `📦 ${itens.length} patrimônio(s) · 🖼️ ${fotos.length} foto(s)`;
      countsEl.classList.toggle('organize-counts-zero', !itens.length && !fotos.length);
    }
    const titleRowEarly = card.querySelector('.organize-map-card-title');
    const headerTemRevert = !!titleRowEarly?.querySelector('.organize-pending-undo-inline');
    if (titleRowEarly && countsEl && headerTemRevert !== forcePending) {
      let bnode = countsEl.nextElementSibling;
      while (bnode) { const next = bnode.nextElementSibling; bnode.remove(); bnode = next; }
      const headerBtnHtml = forcePending
        ? this._inlineRevertBtnHtml('delete-map', map.id)
        : `<button type="button" class="icon-btn sm organize-map-export-btn" data-map-id="${map.id}" title="Exportar apenas este mapa (planta, patrimônios e fotos dele)">⬇️🗺️</button>
          <button type="button" class="icon-btn sm organize-map-delete-btn" data-map-id="${map.id}" title="Excluir este mapa (pendente até 'Aplicar alterações')">🗑️</button>`;
      countsEl.insertAdjacentHTML('afterend', headerBtnHtml);
      // "↩️ reverter" é resolvido pelo listener DELEGADO no overlay inteiro
      // (ver `_buildOverlay`) — só export/excluir (religados por card)
      // precisam ser religados aqui.
      if (!forcePending) {
        card.querySelector('.organize-map-export-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof SettingsView === 'undefined' || !SettingsView._openExportModal) {
            Utils.toast('Módulo de exportação não carregado.', { type: 'danger' });
            return;
          }
          SettingsView._openExportModal({ onlyMapId: map.id });
        });
        card.querySelector('.organize-map-delete-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this._deleteMap(map.id);
        });
      }
    }
    const itensCol = card.querySelector('.organize-map-col-itens');
    if (itensCol) {
      // ITEM "orb de reordenar" (31/08/2026) — o patch cirúrgico deste
      // método precisa reconstruir também o cabeçalho da coluna (orb de
      // ordem + setinha de menu). O toggle de expandir/recolher foi
      // REMOVIDO nesta mesma data (ver comentário grande acima de
      // `_wireItemListHeadControls`) — a lista agora é sempre renderizada
      // por inteiro.
      itensCol.innerHTML = `
        <div class="organize-item-list-head">
          ${this._sortOrbHtml(map.id)}
        </div>
        ${this._renderPatrimonioColumn(this._sortItensForDisplay(entry), fotos, map.id, forcePending)}`;
      this._wireItemRows(card, entry);
      this._wireItemListHeadControls(card);
    }
    const fotosCol = card.querySelector('.organize-map-col-fotos');
    if (fotosCol) {
      fotosCol.innerHTML = this._renderFotosColumn(fotos, itens, forcePending);
      this._wireFotoItems(card, entry);
    }
    const vinculadosNoMapa = itens.filter((it) => typeof it.mapaX === 'number');
    const statsEl = card.querySelector('.organize-map-thumb-stats');
    if (statsEl) statsEl.textContent = `🧱 ${this._drawnCount(map)} elemento(s) na planta · 📌 ${vinculadosNoMapa.length} vinculação(ões)`;
    const mapaCol = card.querySelector('.organize-map-col-mapa');
    const vincHtml = this._renderMapVinculacoes(vinculadosNoMapa, map.id, forcePending);
    const oldVinc = mapaCol?.querySelector('.organize-vinc-list');
    if (oldVinc) oldVinc.outerHTML = vincHtml; // pode virar '' — some sozinho
    else if (vincHtml && statsEl) statsEl.insertAdjacentHTML('afterend', vincHtml);
    if (mapaCol) {
      mapaCol.querySelectorAll('.organize-vinc-chip-map').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          if (e.target.closest('.organize-vinc-chip-unlink')) return;
          e.stopPropagation();
          this._openMapExternally(entry.map.id);
        });
      });
      // ITEM B6 (31/08/2026) — ver comentário igual em `_wireCard`.
      mapaCol.querySelectorAll('.organize-vinc-chip-unlink-planta').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._unlinkItemFromPlanta(btn.dataset.itemId, entry.map.id);
        });
      });
    }
    // "planta vazia" (tag no título + overlay na miniatura) depende de
    // `entry.isEmpty`, que É recalculado logo antes de chamar esta função
    // (mesclar pode trazer vinculações novas pro sobrevivente, mudando o
    // status) — mantém os dois em dia sem recriar a miniatura em si.
    const titleRow = card.querySelector('.organize-map-card-title');
    const emptyTag = titleRow?.querySelector('.organize-map-card-emptytag');
    if (entry.isEmpty && !emptyTag) countsEl?.insertAdjacentHTML('afterend', '<span class="organize-map-card-emptytag">planta vazia</span>');
    else if (!entry.isEmpty && emptyTag) emptyTag.remove();
    const thumbWrap = card.querySelector('.organize-map-thumb-wrap');
    const overlay = thumbWrap?.querySelector('.organize-map-thumb-emptyoverlay');
    if (entry.isEmpty && !overlay) thumbWrap?.insertAdjacentHTML('beforeend', '<div class="organize-map-thumb-emptyoverlay">planta vazia</div>');
    else if (!entry.isEmpty && overlay) overlay.remove();
    // Seleção de fotos/mapas foi limpa por `_mergeMaps` antes de chamar
    // isto — reaplica o destaque (nenhuma classe extra, só garante que os
    // elementos NOVOS de dentro deste cartão não fiquem com highlight de
    // uma seleção antiga que não existe mais).
    this._applyFotoSelectionHighlight();
  },

  async _mergeMaps(ids) {
    ids = [...new Set(ids)];
    const entries = ids.map((id) => this._maps.find((e) => e.map.id === id)).filter(Boolean);
    if (entries.length < 2) return;
    const naoVazios = entries.filter((e) => !e.isEmpty);
    let survivorId;
    if (naoVazios.length > 1) {
      survivorId = await this._openMergeConflictDialog(entries, naoVazios);
      if (!survivorId) return;
    } else if (naoVazios.length === 1) {
      survivorId = naoVazios[0].map.id;
    } else {
      survivorId = entries[0].map.id;
    }
    const survivorEntry = entries.find((e) => e.map.id === survivorId);
    const descartadas = entries.filter((e) => e.map.id !== survivorId);

    // Item 4 do feedback, 1ª parte: animação ANTES de qualquer coisa sumir
    // de verdade da lista.
    await this._animateMergeCollapse(descartadas.map((e) => e.map.id));

    // ATUALIZAÇÃO (rodada 55/v309, item 5) — antes deste ponto a gravação de
    // verdade no IndexedDB rodava logo abaixo, em segundo plano mas
    // IMEDIATA (sem esperar confirmação). Agora vira uma AÇÃO PENDENTE (ver
    // comentário grande em `_pendingActions`) — a mesclagem continua
    // otimista em memória/tela (nada disso mudou: mesma animação de
    // colapso, mesmo update cirúrgico só no cartão sobrevivente), só a
    // gravação no banco que passa a esperar "Aplicar alterações".
    this._ensurePendingSnapshot();
    const movedFotoIds = [], movedItemIds = [];
    for (const e of descartadas) {
      for (const foto of e.fotos) { foto.ambienteId = survivorId; survivorEntry.fotos.push(foto); movedFotoIds.push(foto.id); }
      for (const item of e.itens) { item.ambienteId = survivorId; survivorEntry.itens.push(item); movedItemIds.push(item.id); }
    }
    survivorEntry.isEmpty = this._isMapEmpty(survivorEntry.map, survivorEntry.itens);
    this._maps = this._maps.filter((e) => !descartadas.includes(e));
    this._selectedMapIds.clear();
    this._lastRegionScreen = null;
    // Item 5 do feedback (rodada 54) — ver comentário grande em
    // `_refreshCardBody`: NADA de `_renderList()`/`_startThumbnailQueue()`
    // aqui. Os cartões descartados já saíram visualmente encolhendo
    // (`_animateMergeCollapse` acima) — só tira eles do DOM de vez agora
    // que a animação terminou — e o cartão sobrevivente é atualizado
    // cirurgicamente, sem mexer em mais nenhum outro cartão nem miniatura
    // da lista.
    for (const e of descartadas) {
      this._listEl?.querySelector(`.organize-map-card[data-map-id="${e.map.id}"]`)?.remove();
    }
    this._refreshCardBody(survivorEntry);
    const countEl = this._overlayEl?.querySelector('#organize-map-count');
    if (countEl) countEl.textContent = `${this._maps.length} mapa(s) listado(s)`;
    this._updateSelCount();
    const label = `${this._joinNamesForLabel(entries.map((e) => this._mapDisplayName(e.map)))} mesclados`;
    this._pushPendingAction({
      type: 'merge-maps', survivorId, discardedIds: descartadas.map((e) => e.map.id),
      movedFotoIds, movedItemIds, label,
    });
    Utils.toast('Mapas mesclados (pendente — clique em "Aplicar alterações" pra gravar) ✓', { type: 'ok' });
  },

  _openMergeConflictDialog(entries, naoVazios) {
    return new Promise((resolve) => {
      const mapasComItens = entries.filter((e) => e.itens.some((it) => typeof it.mapaX === 'number')).length;
      const rows = naoVazios.map((e) => {
        const m = e.map;
        return `<label class="organize-merge-row">
          <input type="radio" name="organize-merge-survivor" value="${m.id}">
          <span><strong>${Utils.escapeHtml(this._mapDisplayName(m))}</strong> — ${this._drawnCount(m)} elemento(s) na planta (paredes ${m.walls?.length || 0}, objetos ${m.objects?.length || 0}, portas ${m.portas?.length || 0}, janelas ${m.janelas?.length || 0}, textos ${m.textos?.length || 0}, câmeras ${m.cameras?.length || 0}), ${e.itens.length} patrimônio(s), ${e.fotos.length} foto(s)</span>
        </label>`;
      }).join('');
      const vazios = entries.filter((e) => e.isEmpty);
      const modal = document.createElement('div');
      modal.className = 'organize-modal-backdrop';
      modal.innerHTML = `
        <div class="organize-modal">
          <h3>⚠️ Plantas baixas diferentes</h3>
          <p>Estes mapas marcados têm planta baixa própria (paredes, objetos etc) — a mesclagem só pode manter a planta de UM deles; os outros mapas somem, mas os patrimônios/fotos/vínculos deles são preservados e passam a apontar pro mapa escolhido. Escolha qual mapa permanece:</p>
          <div class="organize-merge-rows">${rows}</div>
          ${vazios.length ? `<p class="organize-merge-note">${vazios.length} mapa(s) de planta vazia marcado(s) também entram na mesclagem normalmente.</p>` : ''}
          ${mapasComItens > 1 ? `<p class="organize-merge-warn">⚠️ Patrimônios estão vinculados a mais de um destes mapas — todos serão movidos pro mapa escolhido, mantendo a posição (x/y) que já tinham.</p>` : ''}
          <div class="organize-modal-actions">
            <button type="button" class="btn secondary" id="organize-merge-cancel">Cancelar</button>
            <button type="button" class="btn" id="organize-merge-ok">Mesclar</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#organize-merge-cancel').onclick = () => { modal.remove(); resolve(null); };
      modal.querySelector('#organize-merge-ok').onclick = () => {
        const chosen = modal.querySelector('input[name="organize-merge-survivor"]:checked')?.value;
        if (!chosen) { Utils.toast('Escolha qual mapa vai permanecer.', { type: 'warn' }); return; }
        modal.remove();
        resolve(chosen);
      };
    });
  },
};
window.OrganizeView = OrganizeView;
