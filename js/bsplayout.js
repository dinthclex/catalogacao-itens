/**
 * bsplayout.js — "Workspace": layout estilo Blender, painéis divisíveis
 * (splitters arrastáveis) organizados numa árvore BSP (Binary Space
 * Partitioning). NOVO (07/09/2026), pedido verbatim: "layout estilo
 * Blender. Tiled / Dockable Split Pane Layout (ou Divisores de Painéis
 * Arrastáveis / Layout Baseado em Árvore BSP). [...] Splitters/Resizable
 * Panes: O mecanismo que permite arrastar as bordas (gutters) horizontal
 * ou verticalmente para redimensionar seções adjacentes. Tiling Window
 * Manager UI [...] BSP Tree [...] Dockable Workspace Panels: O sistema que
 * permite a cada painel alternar entre diferentes tipos de editores [...]
 * via menu dropdown de cabeçalho. Implemente: Crie um layout de interface
 * modular, redimensionável e baseada em blocos (tiled workspace) inspirado
 * no sistema de janelas do Blender [...] 1. Estrutura de Divisão (Split
 * Panes) [...] 2. Header Modular por Painel [...] 3. Ações de Split e
 * Join [...] 4. Estilo Visual: Tema escuro minimalista [...] 5. Código:
 * Entregue o código completo, funcional e com a estrutura de estado/árvore
 * de dados comentada." Quando perguntado se o layout é pra reorganizar as
 * telas JÁ EXISTENTES do app ou uma tela nova: "A resposta é para usar no
 * que já tem no app, por exemplo, colocar metade da tela com o mapa 2D e a
 * outra metade da tela dividida também em mais duas partes. E, nelas,
 * colocar o 'Ver em 3D' e o 'Buscar'. Não só isso, mas também para
 * implementações futuras."
 *
 * ============================================================
 * ESTRUTURA DE ESTADO / ÁRVORE DE DADOS (o que é persistido)
 * ============================================================
 * `this._tree` é uma árvore binária onde cada nó é UM destes 2 formatos:
 *
 *   FOLHA (painel de verdade, onde uma tela do app é montada):
 *     { type: 'leaf', id: string, editorType: string|null }
 *     `editorType` é uma chave de `EDITOR_TYPES` (ex.: 'mapa2d') ou `null`
 *     (painel vazio, mostrando só o seletor no cabeçalho).
 *
 *   DIVISÃO (nunca é desenhada sozinha — sempre tem exatamente 2 filhos):
 *     { type: 'split', id: string, dir: 'row'|'col', ratio: number, children: [A, B] }
 *     'row' = filhos LADO A LADO (divisor VERTICAL entre eles, cursor
 *     col-resize) — equivale a "dividir verticalmente" no Blender (a
 *     LINHA do divisor é vertical). 'col' = filhos EMPILHADOS (divisor
 *     HORIZONTAL, cursor row-resize). `ratio` (0.1–0.9) é a fração de
 *     espaço do filho A — o filho B fica com `1 - ratio`.
 *
 * SÓ a árvore acima (ids/type/dir/ratio/children/editorType) é persistida
 * (`DB.setSetting('bspLayoutTree', ...)`, mesmo padrão "config solta" já
 * usado por outras ferramentas deste app — ver tijolos.js). Cada nó FOLHA
 * ganha, em tempo de execução (nunca salvo), 2 campos extras:
 * `_instance` (o que o `mount()` do editor devolveu — pra poder chamar
 * `unmount()` depois) e `_editorTypeMounted` (qual editor está DE FATO
 * montado ali agora, pode divergir de `editorType` por 1 instante durante
 * a troca) — `_serialize()` remove os 2 antes de salvar.
 *
 * ============================================================
 * REGISTRO DE TIPOS DE EDITOR (aberto — "também para implementações
 * futuras", pedido verbatim)
 * ============================================================
 * Qualquer tela do app que já siga o contrato padrão usado por
 * `App.views` (`async mount(container)` / `unmount()`) pode virar um tipo
 * de editor dockável só acrescentando 1 entrada em `EDITOR_TYPES` — o
 * motor de splitters/árvore acima não precisa mudar NADA. Os 3 tipos já
 * ligados na rodada anterior (Mapa 2D, Ver em 3D, Buscar) são só as 3
 * primeiras entradas desse registro, exatamente como o exemplo concreto
 * que o usuário deu ("colocar metade da tela com o mapa 2D e a outra
 * metade [...] o 'Ver em 3D' e o 'Buscar'"). NOVO (08/09/2026), pedido
 * verbatim: "acrescente o 'Foto' [...] o 'Organizar'." — mais 2 entradas
 * ('foto'/'organizar'), com uma diferença arquitetural importante das 3
 * primeiras: `AmbientePhotos.open()`/`OrganizeView.open()` são
 * sobreposições em TELA CHEIA de verdade (`position:fixed; inset:0`),
 * não telas que desenham dentro do `container` recebido — decisão de
 * escopo documentada nos comentários de cada entrada abaixo, mais o
 * mecanismo `_suppressOverlayAutoClose`/`_onOverlayEditorClosed` que evita
 * que fechar essas 2 ferramentas "vaze" pro resto da árvore BSP.
 *
 * ---------------------------------------------------------------------
 * [11/09/2026] CABEÇALHO COM ÍNDICE DE FUNÇÕES (pedido recorrente do
 * usuário, "evitar buscas exaustivas") — `BSPLayout` é um objeto único
 * (`const BSPLayout = {...}`), sem classes. Listado na ordem em que
 * aparece no arquivo.
 *
 * Constantes/estado: HEADER_HEIGHT_PX, GUTTER_PX, `_botoesSelectedView`,
 * `_MAP_BOTOES_TO_EDITOR` (mapeia botão do rodapé -> tipo de editor BSP),
 * `_telasInstances`, `_infoControlsOwnerId`/`_infoLeftWrap`/
 * `_infoRightWrap`, `_tree` (árvore BSP persistida, ver comentário grande
 * acima)/`_root`.
 *
 * Barra de info compartilhada (controles que "viajam" pro cabeçalho do
 * painel ativo, ex. seletor de piso):
 * - _notifyTelasInstances() — avisa toda tela BSP montada de uma mudança.
 * - _buildInfoControlsWraps() — monta os wrappers esquerdo/direito da
 *   barra de info compartilhada.
 * - _infoHeaderWrapsFor(node) — decide em qual cabeçalho de painel os
 *   wrappers acima devem aparecer agora.
 * - _releaseInfoHeaderControlsIfOwner(nodeId) — solta a posse dos
 *   wrappers se o painel dono foi fechado/trocado.
 * - _syncInfoHeaderControlsInHeader(node, headerEl) — reanexa os wrappers
 *   no cabeçalho certo a cada render.
 *
 * Árvore BSP (estrutura/persistência):
 * - _genId() — gera um id único de nó.
 * - _defaultTree() — árvore de fábrica (layout padrão de 1ª instalação).
 * - _treeHasEditorType(node, type) — busca recursiva: existe algum painel
 *   já mostrando este tipo de editor?
 * - _findLeafParent(node, editorType, parent, idx) — acha o nó-folha (e
 *   seu pai) que mostra um tipo de editor, pra navegação/foco.
 * - _firstLeaf(node) — primeira folha da árvore (fallback de navegação).
 * - revealEditorType(editorType) — foca/abre um tipo de editor em algum
 *   painel existente (ou cria um), usado por "Ver em 3D"/"Buscar"/etc. ao
 *   navegar de dentro do Workspace.
 * - _serialize(node) — árvore -> objeto plano salvável no DB.
 * - _save() — persiste `_tree` (layout ativo) no DB.
 * - _locate(node, id, parent, idx) — acha um nó pelo id.
 * - _unmountLeafInstance(node) — desmonta a instância de tela de uma
 *   folha (ao remover/trocar de editor).
 * - _onOverlayEditorClosed(container) — reage ao fechamento de um editor
 *   overlay tela-cheia (Foto/Organizar — ver comentário grande acima).
 * - _unmountAll(node) — desmonta toda a árvore (ao trocar de layout salvo
 *   ou sair do Workspace).
 * - splitLeaf(id, dir) — divide um painel-folha em 2 (novo `split`).
 * - closeLeaf(id) — fecha um painel-folha, promovendo o irmão no lugar do
 *   `split` pai.
 * - _trocarEditor(id, editorType) — troca qual tela um painel-folha
 *   mostra (dropdown de cabeçalho).
 * - _mountLeafEditor(node, bodyEl) — monta de fato a instância da tela
 *   escolhida dentro do corpo do painel-folha.
 *
 * Render:
 * - _render() — redesenha a árvore inteira a partir de `_tree`.
 * - _renderNode(node, parentEl) — despacha pra `_renderLeaf`/
 *   `_renderSplit` conforme o tipo do nó.
 * - _renderLeaf(node, parentEl) — desenha um painel-folha (cabeçalho +
 *   corpo + seletor de editor).
 * - _renderSplit(node, parentEl) — desenha um nó de divisão (os 2 filhos
 *   + o gutter arrastável entre eles).
 * - _minSizeAlongAxis(node, axis) — tamanho mínimo de um nó ao longo de um
 *   eixo (limite de arraste do gutter).
 * - _edgeChain(rootChildNode, horizontal, side) — cadeia de nós na borda
 *   de um lado (usada pelo cálculo de limite de arraste).
 * - _wireGutterDrag(gutter, splitEl, node, wrapA, wrapB) — liga o
 *   arraste (pointerdown/move/up) de um gutter, redimensionando os 2
 *   painéis vizinhos e persistindo o novo `ratio`.
 *
 * Ciclo de vida/layouts salvos:
 * - mount(container) — entra no modo Workspace, monta a árvore ativa
 *   dentro de `container`.
 * - unmount() — sai do Workspace, desmonta tudo.
 * - resetToDefault() — volta o layout ativo pro `_defaultTree()`.
 * - _loadLayoutsList() — lê a lista de layouts salvos do DB.
 * - _activeLayout() — devolve o registro do layout atualmente ativo.
 * - ensureInfoBarLoaded() — garante que a barra de info compartilhada foi
 *   inicializada antes de usá-la.
 * - _persistLayoutsList() — salva a lista de layouts (metadados) no DB.
 * - _genLayoutName(base) — gera um nome não-duplicado pra um layout novo.
 * - _addLayoutFromCurrent() — salva o layout atual como um NOVO layout
 *   nomeado.
 * - _deleteActiveLayout() — apaga o layout ativo (com confirmação).
 * - _renameActiveLayout(novoNome) — renomeia o layout ativo.
 * - _switchActiveLayout(id) — troca pra outro layout salvo (desmonta o
 *   atual, monta o escolhido).
 * - _renderInfoBarControls() — desenha os controles da barra de info
 *   compartilhada (seletor de layout, nome, etc.).
 * - _startEditLayoutName(btnName, atual) — entra no modo de edição inline
 *   do nome do layout ativo.
 * - _toggleLayoutListPopover(anchorBtn) — abre/fecha o popover com a
 *   lista de layouts salvos pra escolher/gerenciar.
 * ---------------------------------------------------------------------
 */
const BSPLayout = {
  // NOVO (08/09/2026): mesma altura de `.bsp-leaf-header { height:30px }`
  // (css/style.css) — usada por `_wireGutterDrag` pra calcular o limite
  // MÍNIMO (em pixels reais, convertido pra fração) de quanto uma divisão
  // 'col' (empilhada) pode encolher verticalmente sem sumir o cabeçalho.
  HEADER_HEIGHT_PX: 30,
  // NOVO (09/09/2026) — mesma espessura de `.bsp-gutter-row`/`.bsp-gutter-col`
  // (css/style.css, `width:6px`/`height:6px`) — usada por `_minSizeAlongAxis`
  // (ver comentário grande logo abaixo) pra somar o espaço que os PRÓPRIOS
  // divisores aninhados ocupam, não só as folhas.
  GUTTER_PX: 6,

  EDITOR_TYPES: {
    // NOVO (08/09/2026), pedido verbatim: "Todas as telas devem estar
    // submetidas ao sistema de divisão de telas." — 'tabela'/'flashcards'/
    // 'capturar' (Tabela/Cartões/Fotos, os 3 primeiros botões do rodapé)
    // ainda não tinham entrada aqui (só 'mapa2d'/'ver3d'/'buscar'/'foto'/
    // 'organizar'/'info' existiam) — TableView/FlashcardsView/CaptureView
    // já seguem o mesmo contrato padrão `mount(container)`/`unmount()`
    // (confirmado por grep antes desta mudança), então bastam entradas no
    // mesmo padrão mínimo de 'ver3d'/'buscar' logo abaixo, sem nenhuma
    // mudança nesses 3 arquivos.
    tabela: {
      label: '📋 Tabela',
      async mount(container) { await TableView.mount(container); return TableView; },
      unmount(instance) { instance?.unmount?.(); },
    },
    flashcards: {
      label: '🗂️ Cartões',
      async mount(container) { await FlashcardsView.mount(container); return FlashcardsView; },
      unmount(instance) { instance?.unmount?.(); },
    },
    capturar: {
      label: '📷 Fotos',
      async mount(container) { await CaptureView.mount(container); return CaptureView; },
      unmount(instance) { instance?.unmount?.(); },
    },
    // RENOMEADO (08/09/2026), pedido verbatim: "A tela com nome 'Mapa 2D'
    // deve ser só 'Mapa'." — só o RÓTULO visível no dropdown mudou (a
    // CHAVE 'mapa2d' foi mantida de propósito, sem renomear — trocar a
    // chave quebraria qualquer layout já salvo em `bspSavedLayouts` que
    // referencie 'mapa2d', ver `_serialize`/`mount()`). Continua sendo a
    // tela de ENTRADA do Mapa (selecionar mapa/Organizar/Caixa/Planta
    // baixa/Foto) — ver as 2 novas entradas dedicadas 'caixa'/'plantabaixa'
    // logo abaixo, que pulam direto pra dentro de uma dessas sub-telas.
    mapa2d: {
      label: '🗺️ Mapa',
      // `MapView.mount` (embedded:true) monta a tela de ENTRADA (não vai
      // direto pra Planta baixa — ver comentário de `mount()` em
      // mapview.js, corrigido na 39a rodada). ATUALIZADO (08/09/2026),
      // pedido verbatim (bug relatado 2x): "a barra de rodapé do 'Mapa 2D'
      // está surgindo fora da tela dele" / "o cabeçalho continua
      // aparecendo [...] fora de sua divisão de tela." `opts.embedded:
      // true` liga a lógica de confinamento em mapview.js
      // (`this._embedded`) — move #topbar-mapa/#bottombar-mapa pra DENTRO
      // da divisão em vez de deixá-los no layout fixo global.
      async mount(container) { await MapView.mount(container, { embedded: true }); return MapView; },
      unmount(instance) { instance?.unmount?.(); },
    },
    // NOVO (08/09/2026), pedido verbatim: "Deve ter uma tela 'Caixa' (do
    // grupo de botões que tem em botão 'Mapa')." — igual em espírito a
    // 'mapa2d' acima, mas pula direto pra sub-tela "📦 Caixa"
    // (`PhotoGrid.mountCaixaScreen`, já desenha DENTRO do container
    // recebido — nunca foi um overlay em tela cheia, ao contrário de
    // 'foto'/'organizar' — então não precisa de nenhum `opts.embedded`
    // nem da trava `workspaceFullscreenConfig`). `onClose` (botão "✕
    // Fechar" de dentro da própria tela Caixa) reaproveita
    // `_onOverlayEditorClosed` — MESMO efeito desejado (devolve esta
    // folha pro estado "vazio"), mesmo a tela Caixa não sendo um overlay
    // de verdade.
    caixa: {
      label: '📦 Caixa',
      async mount(container) {
        if (typeof PhotoGrid === 'undefined') { container.innerHTML = '<div class="bsp-empty">⚠️ Módulo Caixa não carregado.</div>'; return null; }
        await PhotoGrid.mountCaixaScreen(container, { onClose: () => BSPLayout._onOverlayEditorClosed(container) });
        return PhotoGrid;
      },
      unmount(instance) { instance?.unmountCaixaScreen?.(); },
    },
    // NOVO (08/09/2026), pedido verbatim: "Deve ter uma tela 'Planta baixa'
    // com o ícone característico (mesmo ícone em botão 'Mapa'->'Planta
    // baixa', não é colorido)." — pula direto pra sub-tela Planta baixa,
    // reaproveitando `MapView.mountAfterView3D` (já existente — apesar do
    // nome, só faz `_showScreen('planta')` com `opts.embedded` — ver
    // mapview.js; usado até aqui só pelo retorno do "Ver em 3D", mas serve
    // igualmente bem como ponto de entrada direto). DECISÃO DE ESCOPO
    // (ícone): `MapView._floorplanIconSvg()` existe (SVG de verdade, não
    // colorido — currentColor) e é usado no botão real "Mapa"->"Planta
    // baixa" (tela de entrada) — mas um `<select>` nativo (o dropdown
    // desta barra) só renderiza TEXTO dentro de `<option>`, nunca SVG (MESMA
    // limitação já documentada mais abaixo em 'foto', existente desde a
    // rodada anterior) — não há como reaproveitar o SVG literal aqui sem
    // reescrever este dropdown inteiro pra um componente customizado (fora
    // de escopo desta rodada, risco alto sem navegador real pra testar
    // visualmente). '📐' (esquadro) foi escolhido por ser o emoji mais
    // próximo do conceito "planta baixa/desenho técnico" disponível.
    plantabaixa: {
      label: '📐 Planta baixa',
      async mount(container) { await MapView.mountAfterView3D(container, { embedded: true }); return MapView; },
      unmount(instance) { instance?.unmount?.(); },
    },
    ver3d: {
      label: '🧊 Ver em 3D',
      async mount(container) { await View3D.mount(container); return View3D; },
      unmount(instance) { instance?.unmount?.(); },
    },
    buscar: {
      label: '🔎 Buscar',
      async mount(container) { await SearchView.mount(container); return SearchView; },
      unmount(instance) { instance?.unmount?.(); },
    },
    // NOVO (08/09/2026), pedido verbatim: "o 'configurações do app' deve
    // ter uma tela só para ele." -- antes, Configurações só era
    // alcançável via `App.navigate('configuracoes')` (preenche
    // `<main id="view">`, ver EDITOR_TYPES.conteudo acima), que deixou
    // de fazer parte da árvore padrão nesta rodada (a faixa do meio
    // virou 'telas'+'ver3d', ver `_defaultTree()`) -- sem uma folha
    // própria, clicar em '⚙️ Configurações' no cabeçalho ficaria
    // invisível (preenchendo um `#view` "estacionado", fora de tela).
    // `SettingsView` já segue o mesmo contrato `mount(container)`/
    // `unmount()` das telas simples acima (confirmado por grep antes
    // desta mudança) -- mesmo padrão mínimo, sem guarda de singleton
    // (mesmo espírito de 'tabela'/'flashcards'/etc.: o próprio módulo já
    // é pensado pra caber num container qualquer, inclusive mais de um
    // ao mesmo tempo, já que este é um workspace multi-painel "estilo
    // Blender"). Ver `BSPLayout.revealEditorType()` (mais abaixo) +
    // wiring do botão ⚙️ em app.js (`_wireNav`), que revela esta folha (ou
    // a RECRIA, se tiver sido fechada — ver comentário grande em
    // `revealEditorType`, corrigido 08/09/2026).
    configuracoes: {
      label: '⚙️ Configurações',
      async mount(container) { await SettingsView.mount(container); return SettingsView; },
      unmount(instance) { instance?.unmount?.(); },
    },
    // NOVO (08/09/2026), pedido verbatim: "acrescente o 'Foto' (com o
    // ícone específico também, cujo caminho é, atualmente, Mapa->Foto)".
    // '🖼️' (moldura de imagem) foi escolhido por ser o glifo mais próximo
    // do SVG de verdade usado no botão "Foto" de 'Mapa' (ver
    // `MapView._photoIconSvg()` — moldura + sol/montanha) — DECISÃO DE
    // ESCOPO: um `<select>` nativo (o dropdown do cabeçalho de cada
    // painel) só renderiza TEXTO dentro de `<option>`, nunca SVG/imagem —
    // por isso o ícone de verdade não pode aparecer ali dentro, só um
    // emoji equivalente (mesmo padrão já usado pelos outros 3 tipos:
    // 🗺️/🧊/🔎, nenhum deles é o SVG de verdade da tela original também).
    // `AmbientePhotos.open()` é uma SOBREPOSIÇÃO em tela cheia de verdade
    // (`position:fixed; inset:0`, ver ambientephotos.js) — NÃO segue o
    // contrato `mount(container)`/`unmount()` das outras 3 (que desenham
    // DENTRO do container recebido). Reescrever essa tela pra caber num
    // painel pequeno seria uma mudança de arquitetura grande (ela é
    // canvas-based, com lógica de redimensionamento própria) — decisão de
    // escopo TRANSPARENTE: em vez disso, abrir "Foto" num painel do
    // Workspace abre a MESMA ferramenta de tela cheia de sempre (por cima
    // de todos os painéis, exatamente como já acontece em 'Mapa'->'Foto'
    // hoje) — fechar por dentro dela (✕/↩) volta pro Workspace, e o
    // painel que a abriu volta a mostrar "vazio" sozinho (ver
    // `_onOverlayEditorClosed` abaixo).
    // REVISADO (08/09/2026), ITEM 3 da rodada de 11 itens, pedido verbatim:
    // "Troque o ícone do 'Foto', no dropdown, pelo ícone que fica em
    // 'Mapa'->'Foto', ele não é colorido." — reexaminado, mas a limitação
    // documentada acima (um `<select>` nativo só renderiza TEXTO em
    // `<option>`) continua de pé: não há como colocar o SVG de verdade
    // (`MapView._photoIconSvg()`) literalmente AQUI sem reescrever este
    // dropdown inteiro pra um componente customizado — mudança grande, de
    // alto risco visual numa base sem navegador real pra confirmar (ver
    // restrição permanente do projeto), fora do escopo desta rodada.
    // NENHUMA mudança de código foi aplicada neste item — '🖼️' já era
    // (e continua sendo) o melhor equivalente disponível dentro dessa
    // limitação.
    foto: {
      label: '🖼️ Foto',
      // ATUALIZADO (08/09/2026), pedido verbatim: "tanto o 'Organizar'
      // quanto o 'Foto' estão abrindo em tela cheia. Isso deve ser
      // configurável em alguma seção das 'configurações do app' [...] por
      // padrão, todas devem ocupar apenas o espaço da divisão, não a tela
      // cheia." Lê `workspaceFullscreenConfig.foto` (js/settings.js): por
      // padrão (`false`/ausente) passa `container` pro `open()`, que
      // confina o overlay dentro da divisão (ver comentário em
      // ambientephotos.js `open()`); `true` mantém o comportamento antigo
      // (tela cheia de verdade, sem passar `container`).
      async mount(container) {
        if (typeof AmbientePhotos === 'undefined') { container.innerHTML = '<div class="bsp-empty">⚠️ Módulo de fotos não carregado.</div>'; return null; }
        if (AmbientePhotos._overlayEl) { container.innerHTML = '<div class="bsp-empty">📷 "Foto" já está aberta em outro lugar. Feche-a primeiro.</div>'; return null; }
        const cfg = (typeof DB !== 'undefined') ? await DB.getSetting('workspaceFullscreenConfig', {}) : {};
        const map = await DB.getOrCreateSingleMap();
        await AmbientePhotos.open(map, {
          onExit: () => BSPLayout._onOverlayEditorClosed(container),
          container: cfg?.foto ? null : container,
        });
        return AmbientePhotos;
      },
      unmount(instance) { instance?.close?.(); },
    },
    // NOVO (08/09/2026), pedido verbatim: "acrescente [...] o 'Organizar'."
    // 🗂️ é o MESMO emoji já usado em todo o app pra esta tela (botão
    // "Mapa"->"Organizar", ver mapview.js `#mapa-entry-organize`).
    // `OrganizeView.open()` também é uma sobreposição em tela cheia de
    // verdade (`.organize-overlay`, `position:fixed; inset:0`) — MESMA
    // decisão de escopo do 'foto' acima: abre por cima de tudo, fechar por
    // dentro dela volta pro Workspace.
    organizar: {
      label: '🗂️ Organizar',
      // ATUALIZADO (08/09/2026) — mesma lógica de configuração do 'foto'
      // acima, lendo `workspaceFullscreenConfig.organizar`.
      async mount(container) {
        if (typeof OrganizeView === 'undefined') { container.innerHTML = '<div class="bsp-empty">⚠️ Módulo Organizar não carregado.</div>'; return null; }
        if (OrganizeView._overlayEl) { container.innerHTML = '<div class="bsp-empty">🗂️ "Organizar" já está aberta em outro lugar. Feche-a primeiro.</div>'; return null; }
        const cfg = (typeof DB !== 'undefined') ? await DB.getSetting('workspaceFullscreenConfig', {}) : {};
        await OrganizeView.open({
          onClose: () => BSPLayout._onOverlayEditorClosed(container),
          container: cfg?.organizar ? null : container,
        });
        return OrganizeView;
      },
      unmount(instance) { instance?.close?.(); },
    },
    // NOVO (08/09/2026), pedido verbatim: "Sim, será transformado em uma
    // possibilidade de tela como opção no dropdown. Será o 'Info'."
    // REARQUITETADO (08/09/2026), pedido verbatim (mensagem seguinte):
    // "O dropdown que, atualmente, está no cabeçalho do app deve ser uma
    // divisão de tela também. Ou seja, o cabeçalho é uma tela que é
    // possível redimensionar." — antes, este tipo de editor montava
    // `InfoBar` (js/infobar.js), uma réplica SIMPLES (só título + 👁️/⚙️,
    // sem o dropdown nem a barra de 4 botões de layouts) dentro do
    // container. Agora, em vez de montar uma réplica, MOVE o elemento de
    // VERDADE do cabeçalho global (`#topbar-default` — o mesmo que já
    // contém o <select> #topbar-info-select, a barra de 4 botões de
    // layouts #topbar-info-layoutbar e o título #view-title) pra DENTRO
    // do container da divisão — MESMA técnica já usada por
    // mapview.js `_mountTopbarMapa`/`_unmountTopbarMapa` (que move
    // #topbar-mapa/#bottombar-mapa pra dentro de uma divisão 'mapa2d'
    // embutida, ver comentário grande lá): não recria nada, então nenhum
    // listener já ligado (via App._wireNav, uma única vez no boot) se
    // perde — o MESMO cabeçalho, com os MESMOS botões/dropdown/listeners,
    // simplesmente passa a morar visualmente dentro da divisão em vez do
    // topo fixo do app. Fora de qualquer divisão que use este tipo, o
    // cabeçalho continua no lugar de sempre (comportamento padrão,
    // intocado) — só quando alguém escolhe "ℹ️ Info" num painel do
    // Workspace é que ele "sai" do topo fixo e "entra" naquela divisão,
    // agora redimensionável como qualquer outro painel. `InfoBar`
    // (js/infobar.js) fica sem nenhum uso neste arquivo a partir de agora
    // (mantido no projeto, sem remover o arquivo, caso volte a ser útil
    // — ver nota no próprio infobar.js).
    // REESCRITO (08/09/2026), pedido verbatim (ITEM 1 da rodada de 11
    // itens): "dentro dela tem um outro dropdown que também tem o 'Info'
    // e, estando ele selecionado, então, aparece o botão quádruplo, o
    // campo de texto para os títulos e os botões 'Ver lista simples',
    // 'configurações do app' e '?'. [Esses 5] devem sair de dentro da
    // tela 'Info' e ficar na sua barra. [...] Os botões [3] ficam à
    // esquerda dos botões da barra 'Dividir lado a lado', 'Dividir
    // empilhado' e 'fechar'." — os 5 elementos SINGLETON de sempre
    // (`#topbar-info-layoutbar`/`#view-title`/`#btn-verlista-top`/
    // `#btn-settings-top`/`#btn-ajuda-top`, todos dentro de
    // `#topbar-default-row`, ver index.html) SAEM de dentro do CONTEÚDO
    // desta folha e são movidos (não clonados — preserva os listeners já
    // ligados 1x no boot por `App._wireNav`) pro CABEÇALHO da própria
    // divisão (`.bsp-leaf-header`, que já tem o dropdown de tipo + os 3
    // botões "Dividir lado a lado"/"Dividir empilhado"/"fechar") — ver
    // `BSPLayout._syncInfoHeaderControlsInHeader`/`_infoHeaderWrapsFor`,
    // chamados por `_renderLeaf`/`_trocarEditor` (NÃO aqui: um `mount()`
    // de EDITOR_TYPES só recebe o container do CONTEÚDO da folha, nunca
    // o cabeçalho dela — por isso essa lógica vive no motor de
    // splitters/cabeçalhos, não neste registro). O que sobra dentro do
    // `header.topbar` (que continua sendo movido pro CONTEÚDO desta
    // folha, como antes — ver `mount()` abaixo) é só `#topbar-mapa`/
    // `#conf-nome-banner` (só aparecem quando o Mapa está aberto FORA do
    // modo embutido / há aviso de conferência sem nome — casos raros,
    // `:empty`/`.hidden` a maior parte do tempo). REMOVIDO (08/09/2026),
    // pedido verbatim: "O dropdown dentro da tela de 'Info' deve ser
    // eliminado." — o `#topbar-info-select` redundante que também sobrava
    // aqui foi removido (ver index.html/app.js); era a causa raiz de a
    // barra de 4 botões e os 3 botões singleton sumirem ao trocar de tela
    // e voltar pra 'Info'.
    //
    // ATUALIZADO (08/09/2026), pedido verbatim (ITEM 2 da mesma rodada):
    // "uma tela com 'Info' selecionado [...] e outra tela 'Info'
    // selecionado [...] devem ser iguais em conteúdo. Atualmente [...]
    // uma [...] carrega um cabeçalho e outra tela 'Info' fica com a
    // mensagem dizendo que já tem outra tela 'Info' aberta." —
    // `header.topbar` continua sendo 1 elemento FÍSICO só (não dá pra
    // estar em 2 divisões ao mesmo tempo sem cloná-lo, o que duplicaria
    // ids/listeners — reescrever essas ferramentas pra isso está fora de
    // escopo). Mas, depois da mudança do ITEM 1 acima, o que sobra
    // dentro dele já fica visualmente VAZIO na grande maioria das vezes
    // (ver parágrafo anterior) — corrigido trocando o aviso alarmante
    // "já está aberta em outra divisão" por um placeholder NEUTRO/vazio,
    // visualmente indistinguível da divisão "dona" na maioria dos casos.
    // LIMITAÇÃO FÍSICA HONESTAMENTE DOCUMENTADA (não escondida): só a
    // divisão "dona" consegue mostrar `#topbar-mapa`/`#conf-nome-banner`
    // nas raras vezes que eles têm algo a exibir — as demais divisões
    // 'Info' ficam com o placeholder vazio até a "dona" ser fechada/
    // trocada de tipo (aí a próxima 'Info' encontrada assume sozinha).
    info: {
      label: 'ℹ️ Info',
      async mount(container) {
        const header = document.querySelector('header.topbar');
        if (!header) { container.innerHTML = '<div class="bsp-empty">⚠️ Cabeçalho não encontrado.</div>'; return null; }
        const jaTemDono = BSPLayout._infoEmbeddedContainer && BSPLayout._infoEmbeddedContainer.isConnected && BSPLayout._infoEmbeddedContainer !== container;
        if (!jaTemDono) {
          container.appendChild(header);
          BSPLayout._infoEmbeddedContainer = container;
        } else {
          container.innerHTML = '<div class="bsp-info-body-empty"></div>';
        }
        return { _isHeaderEmbed: true, _isBodyOwner: !jaTemDono };
      },
      // `instance` aqui não é um módulo de verdade (o cabeçalho não tem
      // `mount`/`unmount` próprios — é só HTML/CSS estático com listeners
      // já ligados uma vez no boot) — só um marcador confirmando se ESTE
      // `mount()` foi quem moveu o elemento (`_isBodyOwner`) — só a folha
      // "dona" devolve o `header.topbar` pro `#dom-parking` ao desmontar;
      // uma folha 'Info' que nunca chegou a ser dona (mostrou só o
      // placeholder vazio) não tem nada físico a devolver.
      unmount(instance) {
        if (!instance?._isBodyOwner) return;
        const header = document.querySelector('header.topbar');
        const parking = document.getElementById('dom-parking');
        if (header && parking && header.parentElement !== parking) parking.appendChild(header);
        BSPLayout._infoEmbeddedContainer = null;
      },
    },
    // NOVO (08/09/2026), pedido verbatim: "Os botões que atualmente estão
    // no rodapé do app ('Tabela', 'Cartões', 'Fotos', 'Mapa', 'Buscar',
    // 'Workspace') devem ser uma tela a parte com a mesma estrutura de
    // divisão de tela. O nome desta tela deve ser 'Botões'. A ação
    // especial de clicar nesses botões é que eles têm a sua ação
    // manifestada em outra tela que deve se chamar 'Telas'. Se não houver
    // uma tela com o seu dropdown selecionado 'Telas', simplesmente,
    // clicar nos botões aparentemente não vai surtir efeito." — 'botoes'
    // só desenha os 6 botões (réplica visual do .bottomnav) e, ao
    // clicar, GRAVA a escolha em `BSPLayout._botoesSelectedView`
    // (estado compartilhado, não local ao painel) e avisa qualquer
    // painel 'telas' vivo (`_notifyTelasInstances`) — não chama
    // `App.navigate` nem mexe no conteúdo principal do app, então sem
    // nenhum painel 'telas' aberto em NENHUMA divisão, clicar aqui não
    // muda nada visível (comportamento pedido explicitamente).
    botoes: {
      label: '🔘 Botões',
      async mount(container) {
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'bsp-botoes-shell';
        BSPLayout._BOTOES_DEFS.forEach((d) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'bsp-botoes-btn';
          btn.innerHTML = `<span class="bsp-botoes-ic">${d.ic}</span>${Utils.escapeHtml(d.texto)}`;
          btn.title = d.titulo || '';
          btn.dataset.view = d.key;
          if (BSPLayout._botoesSelectedView === d.key) btn.classList.add('active');
          btn.onclick = () => {
            BSPLayout._botoesSelectedView = d.key;
            BSPLayout._notifyTelasInstances();
            // ATUALIZADO (08/09/2026): esta divisão ocupa agora o lugar
            // do antigo <nav class="bottomnav"> (removido de
            // index.html) — então, além de alimentar qualquer painel
            // 'Telas', TAMBÉM precisa navegar o conteúdo principal de
            // verdade, como o rodapé antigo fazia. `App.navigate()` já
            // atualiza sozinho o destaque "ativo" de TODOS os botões
            // '.bsp-botoes-btn' da tela (ver js/app.js), então não
            // precisamos repetir isso aqui — exceto pra 'workspace'
            // (não navega, ver guarda abaixo), tratado manualmente.
            // CORRIGIDO (08/09/2026, 39a rodada): App.navigate(d.key) foi
            // removido daqui (causava um 2o mount concorrente do mesmo
            // modulo de tela, competindo com o mount feito via
            // _notifyTelasInstances/EDITOR_TYPES.telas -- o motivo do
            // "carrega parte do HTML mas nao tudo" relatado, ex.: lista de
            // patrimonios sumindo na Tabela). O destaque "ativo" agora e
            // sempre unificado (antes so cobria 'workspace').
            document.querySelectorAll('.bsp-botoes-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === d.key));
          };
          wrap.appendChild(btn);
        });
        container.appendChild(wrap);
        return { _isBotoesPanel: true };
      },
      // Só HTML/CSS estático com listeners próprios (sem instância
      // separada com estado a limpar) — nada a fazer aqui além de deixar
      // o container ser esvaziado pelo chamador (mesmo padrão de
      // `_unmountLeafInstance`, que troca `container.innerHTML` na
      // próxima montagem).
      unmount() {},
    },
    // NOVO (08/09/2026), pedido verbatim: "E a tela 'Telas', tem a
    // execução da ação correspondente do botão que foi clicado na outra
    // tela, a tela 'Botões'. No fim das contas, aparece a tela em si." —
    // monta, DENTRO do seu próprio container, o EDITOR_TYPES
    // correspondente à última seleção feita em qualquer painel 'Botões'
    // (`BSPLayout._botoesSelectedView`, via `_MAP_BOTOES_TO_EDITOR`).
    // Fica registrado em `BSPLayout._telasInstances` (um `Set`) enquanto
    // estiver montado, pra `_notifyTelasInstances()` conseguir mandar
    // TODO painel 'Telas' aberto (pode haver mais de um) se atualizar
    // assim que qualquer painel 'Botões' for clicado.
    telas: {
      label: '🖥️ Telas',
      async mount(container) {
        const inst = {
          _container: container,
          _innerType: null,
          _innerInstance: null,
          async _render() {
            const key = BSPLayout._botoesSelectedView;
            // Se o alvo mudou (ou sumiu), desmonta o que estava montado
            // antes de decidir o que desenhar agora — nunca deixa uma
            // tela anterior "presa" rodando atrás da nova.
            if (this._innerType) {
              const prevDef = BSPLayout.EDITOR_TYPES[this._innerType];
              try { prevDef?.unmount?.(this._innerInstance); } catch (e) { console.warn('[Workspace] Telas: falha ao desmontar painel anterior:', e); }
              this._innerType = null;
              this._innerInstance = null;
            }
            this._container.innerHTML = '';
            if (!key) {
              this._container.innerHTML = '<div class="bsp-empty">🖥️ Nenhuma tela selecionada ainda.<br>Clique em um botão numa divisão "🔘 Botões".</div>';
              return;
            }
            // REMOVIDO (09/09/2026), pedido verbatim: "O botão Workflow não
            // faz mais sentido, então, deve ser removido." — este guard
            // protegia contra `key === 'workspace'` (o botão 🧩 que
            // selecionava essa chave, ver `_BOTOES_DEFS` acima); removido
            // o botão, `key` nunca mais vale 'workspace' aqui — guard
            // ficou inatingível, removido junto.
            const editorType = BSPLayout._MAP_BOTOES_TO_EDITOR[key];
            const def = editorType && BSPLayout.EDITOR_TYPES[editorType];
            if (!def) { this._container.innerHTML = '<div class="bsp-empty">⚠️ Tela desconhecida.</div>'; return; }
            this._innerType = editorType;
            this._innerInstance = await def.mount(this._container);
          },
        };
        BSPLayout._telasInstances.add(inst);
        await inst._render();
        return inst;
      },
      unmount(instance) {
        if (!instance) return;
        BSPLayout._telasInstances.delete(instance);
        if (instance._innerType) {
          const def = BSPLayout.EDITOR_TYPES[instance._innerType];
          try { def?.unmount?.(instance._innerInstance); } catch (e) { console.warn('[Workspace] Telas: falha ao desmontar ao fechar painel:', e); }
        }
      },
    },
  },

  // NOVO (08/09/2026): estado compartilhado do par 'Botões'/'Telas' (ver
  // EDITOR_TYPES acima) — vive aqui em BSPLayout (não dentro de nenhuma
  // instância de painel) justamente pra poder ser compartilhado entre
  // VÁRIOS painéis 'Botões'/'Telas' abertos ao mesmo tempo, em qualquer
  // divisão, inclusive em layouts nomeados diferentes.
  // REMOVIDO (09/09/2026), pedido verbatim: "O botão Workflow não faz mais
  // sentido, então, deve ser removido." — o único botão deste grupo que se
  // referia ao Workspace/BSP em si (🧩 "Workspace") já não fazia sentido
  // MESMO antes deste pedido: desde que o Workspace virou a arquitetura
  // PERMANENTE do app inteiro (não mais uma tela opcional — ver
  // `_defaultTree()`), "abrir o Workspace" não tem mais significado (o
  // app JÁ É o Workspace o tempo todo) — o próprio guard de segurança em
  // `EDITOR_TYPES.telas._render()` (mais abaixo) já dizia isso: "'Workspace'
  // não pode ser aberto dentro dele mesmo". Removido o botão e o guard
  // (agora inatingível — nenhuma chave 'workspace' chega mais lá).
  _BOTOES_DEFS: [
    { key: 'tabela', ic: '📋', texto: 'Tabela', titulo: 'Ver todos os itens catalogados em tabela' },
    { key: 'flashcards', ic: '🗂️', texto: 'Cartões', titulo: 'Ver os itens catalogados em cartões com foto' },
    { key: 'capturar', ic: '📷', texto: 'Fotos', titulo: 'Abrir a câmera para catalogar um novo item' },
    { key: 'mapa', ic: '🗺️', texto: 'Mapa', titulo: 'Ver/editar a planta do ambiente' },
    { key: 'buscar', ic: '🔎', texto: 'Buscar', titulo: 'Buscar um item pelo patrimônio, descrição ou setor' },
  ],
  // Chave (estilo .bottomnav) do último botão clicado numa tela 'Botões' —
  // `null` até o primeiro clique (estado inicial: "clicar aparentemente
  // não vai surtir efeito" também se aplica ANTES de qualquer clique).
  _botoesSelectedView: null,
  // Mapeia a chave do botão (igual a `data-view` do .bottomnav) pro
  // EDITOR_TYPES que a tela 'Telas' deve montar — 'workspace' fica de
  // fora de propósito (tratado à parte, ver guarda de segurança acima).
  _MAP_BOTOES_TO_EDITOR: { tabela: 'tabela', flashcards: 'flashcards', capturar: 'capturar', mapa: 'mapa2d', buscar: 'buscar' },
  // Painéis 'Telas' vivos no momento (pode haver mais de um, inclusive em
  // layouts nomeados diferentes) — todos são avisados por
  // `_notifyTelasInstances()` sempre que qualquer painel 'Botões' for
  // clicado, mesmo que estejam em divisões/layouts diferentes.
  _telasInstances: new Set(),
  _notifyTelasInstances() {
    this._telasInstances.forEach((inst) => {
      try { inst._render?.(); } catch (e) { console.warn('[Workspace] falha ao atualizar painel Telas:', e); }
    });
  },

  // NOVO (08/09/2026), ITEM 1 (ver EDITOR_TYPES.info acima): estado de
  // posse dos 2 pedaços que agora vivem no CABEÇALHO de uma divisão
  // 'info' (não no conteúdo dela) — `_infoControlsOwnerId` é o `id` da
  // folha que atualmente hospeda os wraps; `_infoLeftWrap`/
  // `_infoRightWrap` são os próprios elementos-container (construídos 1x
  // só, ver `_buildInfoControlsWraps`, e reaproveitados/movidos depois —
  // nunca recriados, senão perderíamos a referência aos elementos
  // singleton de verdade que eles envolvem).
  _infoControlsOwnerId: null,
  _infoLeftWrap: null,
  _infoRightWrap: null,

  /** Constrói (só na 1ª vez — idempotente) os 2 wraps que hospedam os 5
   *  elementos singleton do cabeçalho global (`#topbar-info-layoutbar`
   *  "botão quádruplo" + `#view-title` no wrap ESQUERDO; `#btn-verlista-
   *  top`/`#btn-settings-top`/`#btn-ajuda-top` no wrap DIREITO — ordem
   *  pedida verbatim: "deixe o botão quádruplo logo ao lado do dropdown
   *  e coloque o texto dos títulos à direita dele" para o esquerdo, e "à
   *  esquerda dos botões [...] 'Dividir lado a lado' [...]" para o
   *  direito). Sempre MOVE os elementos de verdade pra dentro (nunca
   *  clona) — chamado de novo a cada troca de dono é barato/idempotente
   *  (`appendChild` de um elemento que já é filho não faz nada). */
  _buildInfoControlsWraps() {
    if (!this._infoLeftWrap) {
      const left = document.createElement('span'); left.className = 'bsp-info-hdr-left';
      this._infoLeftWrap = left;
    }
    if (!this._infoRightWrap) {
      const right = document.createElement('span'); right.className = 'bsp-info-hdr-right';
      this._infoRightWrap = right;
    }
    const layoutbar = document.getElementById('topbar-info-layoutbar');
    const title = document.getElementById('view-title');
    if (layoutbar && layoutbar.parentElement !== this._infoLeftWrap) this._infoLeftWrap.appendChild(layoutbar);
    if (title && title.parentElement !== this._infoLeftWrap) this._infoLeftWrap.appendChild(title);
    // ATUALIZADO (09/09/2026), pedido verbatim: "O botão do 'swap' de tipos
    // de apresentação do app [...] Na versão de BSP/dockable o botão de
    // 'swap' deve ficar ao lado esquerdo do botão 'Ver lista simples'
    // também. Não dentro da tela do 'Info' como está atualmente." —
    // `#btn-layoutmode-top` (ver js/classicmode.js) tinha ficado de fora
    // desta lista quando foi criado: por não ser "extraído" pra dentro do
    // cabeçalho da folha (`.bsp-leaf-header`) como os outros 3 botões, ele
    // sobrava dentro do CONTEÚDO da folha 'Info' (o que resta de
    // `header.topbar` depois de tirar os controles daqui — ver
    // `EDITOR_TYPES.info.mount`), em vez de aparecer junto dos outros na
    // barra persistente do cabeçalho. Acrescentado PRIMEIRO na lista (fica
    // à esquerda de "👁️ Ver lista simples", como pedido).
    ['btn-layoutmode-top', 'btn-verlista-top', 'btn-settings-top', 'btn-ajuda-top'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.parentElement !== this._infoRightWrap) this._infoRightWrap.appendChild(el);
    });
    return { left: this._infoLeftWrap, right: this._infoRightWrap };
  },

  /** Decide se a folha `node` deve hospedar os wraps agora — só chamada
   *  pra folhas com `editorType==='info'` (ver `_syncInfoHeaderControlsInHeader`
   *  abaixo); se outra folha 'Info' AINDA VÁLIDA já é dona, esta fica sem
   *  os wraps (evita o mesmo elemento físico em 2 cabeçalhos ao mesmo
   *  tempo) — devolve `{left:null,right:null}` nesse caso, sinalizando
   *  "nada a inserir aqui". A 1ª folha 'Info' encontrada numa passada de
   *  `_render()` sempre vence (ordem de travessia da árvore). */
  _infoHeaderWrapsFor(node) {
    if (node.editorType !== 'info') { this._releaseInfoHeaderControlsIfOwner(node.id); return { left: null, right: null }; }
    if (this._infoControlsOwnerId && this._infoControlsOwnerId !== node.id) {
      const dono = this._tree && this._locate(this._tree, this._infoControlsOwnerId);
      const donoValido = dono && dono.node.type === 'leaf' && dono.node.editorType === 'info';
      if (donoValido) return { left: null, right: null };
    }
    this._infoControlsOwnerId = node.id;
    return this._buildInfoControlsWraps();
  },

  /** Devolve os 2 wraps pro `#dom-parking` (sem desconectar os elementos
   *  singleton de dentro deles — só o CONTAINER sai de cena) quando a
   *  folha `nodeId` deixa de ser dona (fechada, ou trocou de tipo) — só
   *  age se `nodeId` for de fato a dona atual (chamado sempre que
   *  qualquer folha é desmontada/trocada, mesmo que nunca tenha sido
   *  dona — n-op nesse caso). */
  _releaseInfoHeaderControlsIfOwner(nodeId) {
    if (this._infoControlsOwnerId !== nodeId) return;
    this._infoControlsOwnerId = null;
    const parking = document.getElementById('dom-parking');
    if (!parking) return;
    if (this._infoLeftWrap && this._infoLeftWrap.parentElement) parking.appendChild(this._infoLeftWrap);
    if (this._infoRightWrap && this._infoRightWrap.parentElement) parking.appendChild(this._infoRightWrap);
  },

  /** Insere/remove os 2 wraps no cabeçalho JÁ CONSTRUÍDO (`headerEl`) de
   *  UMA folha — chamado tanto por `_renderLeaf` (cabeçalho recém-criado)
   *  quanto por `_trocarEditor` (cabeçalho existente, só o tipo mudou,
   *  ver `.bsp-leaf-header-spacer` como ponto de referência de onde
   *  inserir). Sempre remove qualquer wrap que já estivesse ali antes de
   *  decidir de novo — evita duplicar/deixar preso um wrap de uma troca
   *  de tipo anterior (ex.: 'info' -> 'tabela' -> 'info' de novo). */
  _syncInfoHeaderControlsInHeader(node, headerEl) {
    const oldLeft = headerEl.querySelector(':scope > .bsp-info-hdr-left');
    const oldRight = headerEl.querySelector(':scope > .bsp-info-hdr-right');
    if (oldLeft) oldLeft.remove();
    if (oldRight) oldRight.remove();
    const wraps = this._infoHeaderWrapsFor(node);
    if (!wraps.left && !wraps.right) return;
    const spacerEl = headerEl.querySelector('.bsp-leaf-header-spacer');
    if (wraps.left) headerEl.insertBefore(wraps.left, spacerEl || null);
    if (wraps.right) headerEl.insertBefore(wraps.right, spacerEl ? spacerEl.nextSibling : null);
  },

  _tree: null,
  _root: null, // elemento contêiner passado a `mount()`

  _genId() { return 'bsp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  /** Layout padrão — SUBSTITUÍDO (08/09/2026, 38ª rodada), pedido
   *  verbatim: "em baixo fica a tela 'Botões'. Faça com que a altura da
   *  tela seja equivalente a altura que os botões tinham antes. [...]
   *  A tela 'Info' deve continuar em cima. [...] A tela 'Telas' deve
   *  ficar no meio do app junto com outra tela (as duas ocupam toda a
   *  faixa horizontal do meio do app) que deve ser a 'Ver em 3D'. A tela
   *  'Telas' deve ocupar 1/4 da largura e a tela 'Ver em 3D' deve ocupar
   *  o restante (3/4)." — 4 faixas empilhadas ('col', arestas de arrasto
   *  HORIZONTAIS): Info (topo) / [Telas 1/4 | Ver em 3D 3/4] (meio,
   *  divisão 'row', aresta VERTICAL) / Configurações (própria folha, ver
   *  EDITOR_TYPES.configuracoes acima — pedido verbatim, pergunta
   *  seguinte: "o 'configurações do app' deve ter uma tela só para
   *  ele.") / Botões (rodapé, mesma altura visual do antigo
   *  `.bottomnav`). `conteudo` (Tabela/Cartões/etc. "cru", via
   *  `App.navigate`) SAIU da árvore padrão — 'telas' já cobre o mesmo
   *  papel pra Tabela/Cartões/Fotos/Mapa/Buscar (via 'Botões'), e
   *  Configurações ganhou folha própria; `EDITOR_TYPES.conteudo`
   *  continua existindo (não removido, só não faz mais parte do
   *  padrão) — ainda pode ser escolhido manualmente no dropdown de
   *  qualquer divisão se algum dia precisar (ex.: Unificar/Modelos 3D,
   *  que não têm folha própria ainda). Frações calculadas pra caber o
   *  CONTEÚDO real de cada faixa (não só os 30px do cabeçalho da
   *  divisão) num viewport típico de ~750px de altura: Info ~100px
   *  (topbar-default-row completo: dropdown + barra de 4 botões de
   *  layout + título + 👁️/⚙️/❓); Botões ~85px (idêntico ao
   *  `.bottomnav` antigo: padding 8/10 + ícone 19px + texto 10.5px);
   *  Configurações ~75px por padrão (discreta, mas com folha própria —
   *  expande sozinha ao ser aberta pelo ⚙️, ver
   *  `BSPLayout.revealEditorType` mais abaixo + wiring em app.js). */
  // SUBSTITUÍDO (09/09/2026), pedido verbatim: "O layout 'Padrão' do app
  // agora é em cima o 'Info' cobrindo toda a largura. No meio dividido em
  // dois (cobrindo toda a largura), à esquerda o 'Tabela' e à direita 'ver
  // em 3D'. Em baixo (cobrindo toda a largura) o 'Botões'." — 3 faixas
  // empilhadas ('col', arestas HORIZONTAIS) em vez das 4 anteriores:
  // Info (topo, largura cheia) / [Tabela 1/2 | Ver em 3D 1/2] (meio,
  // divisão 'row', largura cheia) / Botões (rodapé, largura cheia).
  // 'Configurações' SAIU da árvore padrão de propósito — deixou de ser uma
  // folha do BSP nesta rodada: "Configurações do app" agora abre em TELA
  // CHEIA (ver `App._openSettingsFullscreen`, wiring do botão ⚙️ em
  // app.js), não precisa mais de espaço reservado permanente no layout.
  // 'Telas'/'Botões' (o par indireto de navegação) também saiu do meio —
  // a faixa do meio agora tem 'tabela'/'ver3d' DIRETO (folhas próprias,
  // sempre montadas) em vez de passar pelo par 'Telas'+'Botões' clicável;
  // 'Botões' continua existindo (rodapé, largura cheia, pedido
  // explicitamente), mas sem nenhuma folha 'Telas' em NENHUMA divisão por
  // padrão, clicar em 'Cartões'/'Fotos'/'Mapa'/'Buscar' nele não navega
  // nada por padrão (mesmo comportamento documentado em EDITOR_TYPES.botoes
  // pra quando não há 'Telas' aberta em lugar nenhum) — quem quiser esse
  // comportamento de novo pode dividir manualmente uma folha e escolher
  // "🖥️ Telas" nela. Proporções mantidas na mesma proporção visual de
  // antes (Info ~13% da altura; Botões ~13% do restante, ≈11% do total —
  // mesma altura visual que o antigo `.bottomnav`). */
  _defaultTree() {
    return {
      type: 'split', id: this._genId(), dir: 'col', ratio: 0.13,
      children: [
        { type: 'leaf', id: this._genId(), editorType: 'info' },
        {
          type: 'split', id: this._genId(), dir: 'col', ratio: 0.87,
          children: [
            {
              type: 'split', id: this._genId(), dir: 'row', ratio: 0.5,
              children: [
                { type: 'leaf', id: this._genId(), editorType: 'tabela' },
                { type: 'leaf', id: this._genId(), editorType: 'ver3d' },
              ],
            },
            { type: 'leaf', id: this._genId(), editorType: 'botoes' },
          ],
        },
      ],
    };
  },

  /** NOVO (08/09/2026): procura, em qualquer profundidade, uma folha com
   *  o `editorType` dado — usado por `mount()` (logo abaixo) pra
   *  detectar um layout salvo INCOMPATÍVEL com a nova arquitetura
   *  permanente (ex.: um layout salvo antes desta rodada, sem nenhuma
   *  folha 'conteudo'/'info') e evitar que o app abra "quebrado" (sem
   *  cabeçalho ou sem `#view` em lugar nenhum do DOM). */
  _treeHasEditorType(node, type) {
    if (!node) return false;
    if (node.type === 'leaf') return node.editorType === type;
    return this._treeHasEditorType(node.children[0], type) || this._treeHasEditorType(node.children[1], type);
  },

  /** Busca recursiva por uma folha com `editorType` dado, devolvendo
   *  `{ parent, idx }` (o nó 'split' PAI imediato + em qual dos 2
   *  `children` ela está, 0 ou 1) — `parent` vem `null` só se a própria
   *  RAIZ da árvore for essa folha (caso raro, árvore de 1 folha só).
   *  Usada por `revealEditorType()` logo abaixo. */
  _findLeafParent(node, editorType, parent = null, idx = -1) {
    if (!node) return null;
    if (node.type === 'leaf') return node.editorType === editorType ? { parent, idx } : null;
    return (
      this._findLeafParent(node.children[0], editorType, node, 0) ||
      this._findLeafParent(node.children[1], editorType, node, 1)
    );
  },

  /** Busca (DFS) a PRIMEIRA folha de qualquer tipo na árvore — usada por
   *  `revealEditorType` (abaixo) como último recurso pra saber ONDE
   *  inserir uma folha que não existe mais na árvore ativa. */
  _firstLeaf(node) {
    if (!node) return null;
    if (node.type === 'leaf') return node;
    return this._firstLeaf(node.children[0]) || this._firstLeaf(node.children[1]);
  },

  /** NOVO (08/09/2026, 38ª rodada), pedido verbatim: "o 'configurações do
   *  app' deve ter uma tela só para ele." — usado pelo botão ⚙️ do
   *  cabeçalho global (ver app.js `_wireNav`): garante que a folha com
   *  `editorType` dado (ex.: 'configuracoes') tenha espaço decente pra
   *  usar (mínimo 40% do split-pai dela), sem mexer em NADA se ela já
   *  tiver espaço suficiente (não força/reseta o tamanho toda vez que o
   *  botão é clicado, só na primeira vez que está pequena demais).
   *  CORRIGIDO (08/09/2026), bug relatado: "ao clicar em 'configurações do
   *  app' não está exibindo a tela de configurações do app." Causa: se a
   *  folha 'configuracoes' não existe na árvore ATIVA (ex.: usuário fechou
   *  aquela divisão sem querer — fácil de acontecer, ela nasce bem fina,
   *  13% da altura, ver `_defaultTree()`), esta função devolvia `false` e
   *  o botão caía no fallback antigo `App.navigate('configuracoes')`
   *  (app.js) — que preenche `<main id="view">`, um elemento que NINGUÉM
   *  mais move pra fora de `#dom-parking` (`style="display:none"`) desde
   *  que `EDITOR_TYPES.conteudo` saiu da árvore padrão nesta rodada (ver
   *  comentário em `_defaultTree()`): a tela era montada de verdade, só
   *  que dentro de um elemento permanentemente escondido — por isso
   *  "clicar não exibe nada" (não é um erro, é um DOM invisível). CORRIGIDO:
   *  agora, se a folha não existe, esta função a RECRIA (divide a folha
   *  'botoes' — ou, na falta dela, qualquer folha encontrada — e insere
   *  uma folha nova já com `editorType` pronta) em vez de desistir. Async
   *  agora (precisa aguardar `_save()`/`_render()` no caminho de inserção);
   *  chamador (`app.js`) ajustado para `await` o resultado.
   *  Devolve `true` se achou/recriou a folha, `false` só se não houver
   *  NENHUMA folha na árvore pra dividir (árvore vazia/corrompida). */
  async revealEditorType(editorType) {
    if (!this._tree) return false;
    const found = this._findLeafParent(this._tree, editorType);
    if (!found) {
      // Folha não existe mais na árvore ativa — insere uma nova, dividindo
      // a folha 'botoes' (rodapé) se ela existir, ou qualquer folha que
      // encontrar, como último recurso.
      const botoesFound = this._findLeafParent(this._tree, 'botoes');
      const alvo = botoesFound
        ? (botoesFound.parent ? botoesFound.parent.children[botoesFound.idx] : this._tree)
        : this._firstLeaf(this._tree);
      if (!alvo) return false;
      const info = this._locate(this._tree, alvo.id);
      if (!info || info.node.type !== 'leaf') return false;
      const { node, parent, idx } = info;
      const novaFolha = { type: 'leaf', id: this._genId(), editorType };
      const novoSplit = { type: 'split', id: this._genId(), dir: 'col', ratio: 0.6, children: [node, novaFolha] };
      if (!parent) this._tree = novoSplit; else parent.children[idx] = novoSplit;
      await this._save();
      await this._render();
      return true;
    }
    const { parent, idx } = found;
    if (parent) {
      const curFrac = idx === 0 ? parent.ratio : 1 - parent.ratio;
      if (curFrac < 0.35) {
        const targetFrac = 0.4;
        parent.ratio = idx === 0 ? targetFrac : 1 - targetFrac;
        await this._save();
        await this._render();
      }
    }
    return true;
  },

  /** Remove os campos de runtime (`_instance`/`_editorTypeMounted`) antes
   *  de persistir — só a FORMA da árvore + qual editorType cada folha
   *  pediu é dado durável; a instância viva é sempre reconstruída do zero
   *  a cada `mount()` (mesmo espírito de qualquer outra tela do app, que
   *  nunca sobrevive entre navegações). */
  _serialize(node) {
    if (node.type === 'leaf') return { type: 'leaf', id: node.id, editorType: node.editorType || null };
    return {
      type: 'split', id: node.id, dir: node.dir, ratio: node.ratio,
      children: [this._serialize(node.children[0]), this._serialize(node.children[1])],
    };
  },

  // CORRIGIDO (08/09/2026): esta função escrevia numa chave de config
  // ('bspLayoutTree') que ficou ÓRFÃ desde a redesenho do modelo de
  // layouts nomeados (rodada anterior) — `mount()` já não lê mais essa
  // chave nenhuma vez (lê `this._activeLayout().tree`, dentro de
  // `bspSavedLayouts`), então TODA mudança de árvore salva por esta
  // função (arrastar aresta, dividir, fechar painel, trocar tipo de
  // editor) estava sendo perdida silenciosamente — a próxima vez que o
  // Workspace fosse aberto, sempre voltava pro estado salvo por último em
  // `bspSavedLayouts`/`_persistLayoutsList`, nunca pelas mudanças feitas
  // depois. CORRIGIDO: agora grava DIRETO na entrada do layout ATIVO
  // (`this._activeLayout().tree`) e persiste a lista inteira — mesmo
  // destino de `_persistLayoutsList`, usado por todo o resto do modelo
  // novo (`_addLayoutFromCurrent`/`_deleteActiveLayout`/etc.).
  async _save() {
    if (!this._tree) return;
    const atual = this._activeLayout();
    if (!atual) return;
    atual.tree = this._serialize(this._tree);
    await this._persistLayoutsList();
  },

  /** Busca um nó (folha OU divisão) pelo id em qualquer profundidade da
   *  árvore — devolve `{ node, parent, idx }` (`parent`/`idx` nulos se for
   *  a própria raiz). Usado por `splitLeaf`/`closeLeaf`/pelo arrasto dos
   *  divisores pra saber ONDE mexer sem precisar guardar ponteiros de "pai"
   *  dentro dos nós (mantém a árvore simples de serializar). */
  _locate(node, id, parent = null, idx = null) {
    if (node.id === id) return { node, parent, idx };
    if (node.type === 'split') {
      return this._locate(node.children[0], id, node, 0) || this._locate(node.children[1], id, node, 1);
    }
    return null;
  },

  /** Desmonta a instância viva de 1 folha (se houver) — chamado antes de
   *  trocar o editorType dela, fechar a folha, ou desmontar o Workspace
   *  inteiro. Nunca deixa uma tela "presa" rodando em segundo plano (loop
   *  de renderização, listeners) depois de sair do painel onde ela vivia. */
  _unmountLeafInstance(node) {
    if (node.type !== 'leaf' || !node._instance || !node._editorTypeMounted) return;
    const def = this.EDITOR_TYPES[node._editorTypeMounted];
    // NOVO (08/09/2026): 'foto'/'organizar' (ver EDITOR_TYPES acima) são
    // overlays em tela cheia cujo `unmount` chama `.close()` — e `.close()`
    // dispara o MESMO callback `onExit`/`onClose` que usamos pra detectar
    // "o usuário fechou a ferramenta pelo botão dela mesma" (ver
    // `_onOverlayEditorClosed`). Sem esta trava, uma troca PROGRAMÁTICA
    // (dropdown pra outro tipo, split, fechar painel) dispararia o mesmo
    // callback e zeraria o editorType/instância que o chamador está prestes
    // a sobrescrever de qualquer jeito — testado em Node (ver changelog).
    node._suppressOverlayAutoClose = true;
    try { def?.unmount?.(node._instance); } catch (e) { console.warn('[Workspace] falha ao desmontar painel:', e); }
    node._suppressOverlayAutoClose = false;
    // NOVO (08/09/2026), ITEM 1: se esta folha era dona dos wraps do
    // cabeçalho do 'Info' (botão quádruplo/título/3 botões, ver
    // `_infoHeaderWrapsFor`), libera ANTES de esquecer a instância —
    // único ponto de saída usado por `closeLeaf`/`_trocarEditor`/
    // `_unmountAll`, então cobre os 3 sozinho.
    this._releaseInfoHeaderControlsIfOwner(node.id);
    node._instance = null; node._editorTypeMounted = null;
  },

  /** Callback dos tipos de editor 'foto'/'organizar' (overlays em tela
   *  cheia, ver EDITOR_TYPES) — chamado quando a PRÓPRIA ferramenta é
   *  fechada pelo usuário (botão "✕ Fechar"/"↩ Voltar" dela mesma), nunca
   *  numa troca programática (ver `_suppressOverlayAutoClose` acima, que
   *  faz este metodo virar um no-op nesse caso — quem chamou já está
   *  cuidando do resto). Devolve o painel que a abriu pro estado "vazio",
   *  igual a fechar qualquer outro editor pelo dropdown. `container` é o
   *  próprio `bodyEl` da folha (tem `data-leaf-body="<id>"`, ver
   *  `_renderLeaf`) — usado aqui só pra achar de volta QUAL folha era. */
  _onOverlayEditorClosed(container) {
    const leafId = container?.dataset?.leafBody;
    if (!leafId || !this._tree) return;
    const info = this._locate(this._tree, leafId);
    if (!info || info.node.type !== 'leaf') return;
    const node = info.node;
    if (node._suppressOverlayAutoClose) return;
    node.editorType = null;
    node._instance = null;
    node._editorTypeMounted = null;
    this._save();
    container.innerHTML = '<div class="bsp-empty">Escolha um editor no cabeçalho ▴</div>';
    const selectEl = container.closest?.('.bsp-leaf')?.querySelector('.bsp-leaf-select');
    if (selectEl) selectEl.value = '';
  },

  /** Percorre a árvore inteira desmontando toda folha com instância viva —
   *  usado por `unmount()` (saindo do Workspace por completo). */
  _unmountAll(node) {
    if (!node) return;
    if (node.type === 'leaf') this._unmountLeafInstance(node);
    else { this._unmountAll(node.children[0]); this._unmountAll(node.children[1]); }
  },

  // ============================================================
  // AÇÕES DE SPLIT E JOIN (pedido verbatim, item 3 dos requisitos)
  // ============================================================

  /** "Dividir uma área em duas (vertical ou horizontalmente)": troca a
   *  folha `id` por uma DIVISÃO nova (`dir`) com 2 filhos — o filho A é a
   *  folha ORIGINAL (mantém seu editorType/instância — só muda de lugar na
   *  árvore, é remontada no novo DOM); o filho B é uma folha NOVA, vazia
   *  (o usuário escolhe o editor dela no dropdown). */
  async splitLeaf(id, dir) {
    const info = this._locate(this._tree, id);
    if (!info || info.node.type !== 'leaf') return;
    const { node, parent, idx } = info;
    const novaFolha = { type: 'leaf', id: this._genId(), editorType: null };
    const novoSplit = { type: 'split', id: this._genId(), dir, ratio: 0.5, children: [node, novaFolha] };
    if (!parent) this._tree = novoSplit;
    else parent.children[idx] = novoSplit;
    await this._save();
    await this._render();
  },

  /** "Fechar/unir áreas adjacentes": remove a folha `id` — o IRMÃO dela
   *  (o outro filho da mesma divisão) toma o lugar da própria divisão na
   *  árvore (é assim que o Blender "junta" 2 áreas — a área fechada some,
   *  a outra cresce pra preencher o espaço das 2). Não deixa fechar a
   *  ÚLTIMA folha do Workspace inteiro (sempre precisa sobrar pelo menos
   *  1 painel visível). */
  async closeLeaf(id) {
    const info = this._locate(this._tree, id);
    if (!info) return;
    if (!info.parent) { Utils.toast?.('Não é possível fechar o último painel do Workspace', { type: 'warn' }); return; }
    this._unmountLeafInstance(info.node);
    const irmao = info.parent.children[1 - info.idx];
    const infoPai = this._locate(this._tree, info.parent.id);
    if (!infoPai.parent) this._tree = irmao;
    else infoPai.parent.children[infoPai.idx] = irmao;
    await this._save();
    await this._render();
  },

  /** Troca o editorType de UMA folha (dropdown do cabeçalho) — só
   *  remonta AQUELE painel (não a árvore inteira), mais barato e evita um
   *  "piscar" nos outros painéis que não mudaram. */
  async _trocarEditor(id, editorType) {
    const info = this._locate(this._tree, id);
    if (!info || info.node.type !== 'leaf') return;
    info.node.editorType = editorType || null;
    await this._save();
    const bodyEl = this._root?.querySelector(`[data-leaf-body="${id}"]`);
    // NOVO (08/09/2026), ITEM 1: o cabeçalho desta folha NÃO é recriado
    // aqui (só o conteúdo troca, ver `_mountLeafEditor`) — sem isto, os
    // wraps do botão quádruplo/título/3 botões ficariam presos no
    // cabeçalho antigo ao trocar PRA FORA de 'info', ou nunca apareceriam
    // ao trocar PRA 'info' num painel que já existia com outro tipo.
    const headerEl = bodyEl?.closest?.('.bsp-leaf')?.querySelector('.bsp-leaf-header');
    if (headerEl) this._syncInfoHeaderControlsInHeader(info.node, headerEl);
    if (bodyEl) await this._mountLeafEditor(info.node, bodyEl);
  },

  async _mountLeafEditor(node, bodyEl) {
    this._unmountLeafInstance(node);
    bodyEl.innerHTML = '';
    if (!node.editorType) {
      bodyEl.innerHTML = '<div class="bsp-empty">Escolha um editor no cabeçalho ▴</div>';
      return;
    }
    const def = this.EDITOR_TYPES[node.editorType];
    if (!def) { bodyEl.innerHTML = '<div class="bsp-empty">Tipo de editor desconhecido</div>'; return; }
    try {
      node._instance = await def.mount(bodyEl);
      node._editorTypeMounted = node.editorType;
    } catch (err) {
      console.error('[Workspace] falha ao montar painel:', err);
      bodyEl.innerHTML = `<div class="bsp-empty">⚠️ Erro ao abrir — ${Utils.escapeHtml(err?.message || String(err))}</div>`;
    }
  },

  // ============================================================
  // RENDERIZAÇÃO (DOM) — reconstrói tudo do zero a cada chamada, MESMO
  // padrão simples de qualquer outra tela do app (container.innerHTML='',
  // remonta). Cada folha aparece com um cabeçalho modular (item 2 dos
  // requisitos: dropdown à esquerda + botões de dividir/fechar à direita).
  // ============================================================

  // CORRIGIDO (09/09/2026), bug relatado: "nenhum dos botões de cabeçalho
  // do mapa 2D (Planta baixa) estão aparecendo" (e, pela mesma causa,
  // arriscava acontecer também com a barra da 'Info'). Causa raiz: alguns
  // EDITOR_TYPES (`info`, `mapa2d`/`plantabaixa`) MOVEM elementos GLOBAIS
  // singleton (`header.topbar`, `#topbar-mapa`, `#bottombar-mapa`) pra
  // DENTRO do container da própria folha (ver comentário grande em
  // `EDITOR_TYPES.info`/`_mountTopbarMapa` em js/mapview.js) — mas
  // `_render()` (chamada por `splitLeaf`/`closeLeaf`/`revealEditorType`/
  // etc., sempre que a árvore de painéis muda) reconstrói TUDO do zero
  // fazendo `this._root.innerHTML = ''` SEM desmontar as folhas antigas
  // primeiro. `innerHTML = ''` remove a subárvore INTEIRA do documento —
  // inclusive esses elementos globais movidos pra dentro dela — antes que
  // qualquer `unmount()` tivesse chance de devolvê-los pro `#dom-parking`.
  // Resultado: `document.getElementById('topbar-mapa')` (ou
  // `document.querySelector('header.topbar')`) passava a não encontrar
  // MAIS NADA (o elemento continua existindo em memória, mas desconectado
  // do documento) — `_mountTopbarMapa()` desistia cedo (`if (!root) return;`)
  // e a folha ficava sem cabeçalho nenhum, silenciosamente, na PRÓXIMA vez
  // que qualquer ação disparasse um `_render()` completo (dividir/fechar
  // painel, trocar/duplicar/excluir layout etc.) — não seria a 1ª montagem,
  // por isso o sintoma só aparecia depois de mexer na tela e voltar.
  // CORRIGIDO: desmonta a árvore ATUAL (`_unmountAll`, já usado por
  // `unmount()`/`resetToDefault()`) ANTES de arrasar o DOM — cada folha
  // devolve o que tiver "emprestado" (via `EDITOR_TYPES.*.unmount`) pro
  // `#dom-parking` enquanto ainda está tudo conectado ao documento, então a
  // próxima montagem sempre encontra os elementos globais no lugar certo.
  // Idempotente/seguro mesmo nos caminhos que já desmontavam antes de
  // chamar `_render()` (`_switchActiveLayout`/`_deleteActiveLayout`) —
  // `_unmountLeafInstance` já é no-op numa folha sem instância viva.
  async _render() {
    if (!this._root) return;
    this._unmountAll(this._tree);
    this._root.innerHTML = '';
    const raiz = document.createElement('div');
    raiz.className = 'bsp-root';
    this._root.appendChild(raiz);
    await this._renderNode(this._tree, raiz);
    // NOVO (08/09/2026), pedido verbatim (resposta à pergunta sobre onde
    // fica a barra de layouts): "tudo na mesma barra, que, na verdade, é a
    // barra da tela 'Info'." — a barra de 4 botões de layouts nomeados
    // agora vive no cabeçalho GLOBAL do app (#topbar-info-layoutbar, ver
    // index.html/js/app.js), não mais numa barra própria aqui dentro do
    // Workspace — só populada/atualizada aqui (ver _renderInfoBarControls).
    this._renderInfoBarControls();
  },

  async _renderNode(node, parentEl) {
    if (node.type === 'split') return this._renderSplit(node, parentEl);
    return this._renderLeaf(node, parentEl);
  },

  async _renderLeaf(node, parentEl) {
    const leafEl = document.createElement('div');
    leafEl.className = 'bsp-leaf';
    leafEl.style.flex = '1 1 0%'; // folhas sempre dividem o espaço do pai igualmente ENTRE folhas irmãs diretas (o ratio do split-PAI é quem manda de verdade)

    const header = document.createElement('div'); header.className = 'bsp-leaf-header';
    const select = document.createElement('select'); select.className = 'bsp-leaf-select';
    const optVazio = document.createElement('option'); optVazio.value = ''; optVazio.textContent = '— vazio —';
    select.appendChild(optVazio);
    Object.entries(this.EDITOR_TYPES).forEach(([key, def]) => {
      const opt = document.createElement('option'); opt.value = key; opt.textContent = def.label;
      if (node.editorType === key) opt.selected = true;
      select.appendChild(opt);
    });
    if (!node.editorType) optVazio.selected = true;
    select.onchange = () => this._trocarEditor(node.id, select.value);

    const spacer = document.createElement('span'); spacer.className = 'bsp-leaf-header-spacer'; spacer.style.flex = '1';
    const btnRow = document.createElement('button'); btnRow.type = 'button'; btnRow.className = 'bsp-hdr-btn';
    btnRow.textContent = '◫'; btnRow.title = 'Dividir lado a lado (novo painel à direita)';
    btnRow.onclick = () => this.splitLeaf(node.id, 'row');
    const btnCol = document.createElement('button'); btnCol.type = 'button'; btnCol.className = 'bsp-hdr-btn';
    btnCol.textContent = '⬓'; btnCol.title = 'Dividir empilhado (novo painel embaixo)';
    btnCol.onclick = () => this.splitLeaf(node.id, 'col');
    const btnClose = document.createElement('button'); btnClose.type = 'button'; btnClose.className = 'bsp-hdr-btn bsp-hdr-btn-close';
    btnClose.textContent = '✕'; btnClose.title = 'Fechar este painel (o painel vizinho ocupa o espaço)';
    btnClose.onclick = () => this.closeLeaf(node.id);

    header.appendChild(select); header.appendChild(spacer);
    header.appendChild(btnRow); header.appendChild(btnCol); header.appendChild(btnClose);
    // NOVO (08/09/2026), ITEM 1: insere (se esta folha for dona) os wraps
    // do "botão quádruplo"/título/3 botões — ver comentário grande em
    // `EDITOR_TYPES.info` e `_syncInfoHeaderControlsInHeader`.
    this._syncInfoHeaderControlsInHeader(node, header);

    const body = document.createElement('div'); body.className = 'bsp-leaf-body';
    body.setAttribute('data-leaf-body', node.id);

    leafEl.appendChild(header); leafEl.appendChild(body);
    parentEl.appendChild(leafEl);

    await this._mountLeafEditor(node, body);
  },

  async _renderSplit(node, parentEl) {
    const splitEl = document.createElement('div');
    splitEl.className = `bsp-split bsp-split-${node.dir}`;
    splitEl.style.flex = '1 1 0%';
    parentEl.appendChild(splitEl);

    const wrapA = document.createElement('div'); wrapA.className = 'bsp-split-child';
    wrapA.style.flex = `${node.ratio} 1 0%`;
    const wrapB = document.createElement('div'); wrapB.className = 'bsp-split-child';
    wrapB.style.flex = `${1 - node.ratio} 1 0%`;
    const gutter = document.createElement('div');
    gutter.className = `bsp-gutter bsp-gutter-${node.dir}`;

    splitEl.appendChild(wrapA); splitEl.appendChild(gutter); splitEl.appendChild(wrapB);

    // NOVO (08/09/2026): guarda referência DOM dos 2 wraps direto no nó
    // (campo de runtime, mesmo padrão de `_instance`/`_editorTypeMounted`
    // em folhas — `_serialize` não persiste isto) — usado por
    // `_wireGutterDrag`/`_edgeChain` de um SPLIT ANCESTRAL pra travar/
    // liberar o tamanho em pixels destes 2 filhos durante o arrasto de um
    // gutter mais acima na árvore (ver comentário grande em
    // `_wireGutterDrag` abaixo — bug relatado pelo usuário).
    node._wrapAEl = wrapA;
    node._wrapBEl = wrapB;

    this._wireGutterDrag(gutter, splitEl, node, wrapA, wrapB);

    await this._renderNode(node.children[0], wrapA);
    await this._renderNode(node.children[1], wrapB);
  },

  /** CORRIGIDO (08/09/2026), pedido verbatim: "Ainda não está como deveria
   *  ser [...] ao tentar mover a 'aresta' (divisória vertical) mais à
   *  direita das três divisórias verticais [...] apenas a divisão de tela
   *  3 e a divisão de tela 4 devem ser redimensionadas, porém acaba
   *  acontecendo que todas as divisões de tela são redimensionadas." —
   *  exemplo completo dado pelo usuário: dividir 1 painel 3x seguidas
   *  ("dividir lado a lado" sempre no botão mais à ESQUERDA) cria uma
   *  árvore ANINHADA (split dentro de split dentro de split, não uma
   *  lista plana de 4 colunas) — arrastar o gutter MAIS EXTERNO (raiz)
   *  só mexe no `ratio` DAQUELE split (confirmado — comentário antigo
   *  aqui, agora corrigido, mostra que essa parte JÁ estava certa), mas
   *  como CSS flexbox distribui `flex-grow` PROPORCIONALMENTE dentro do
   *  espaço disponível, quando o wrap de UM lado (que contém um split
   *  ANINHADO, ex. a divisão 1+2+3 inteira) muda de tamanho, os splits
   *  aninhados LÁ DENTRO (não tocados pelo código, `ratio` deles nunca
   *  muda) redistribuem TODOS os seus próprios filhos proporcionalmente
   *  ao NOVO tamanho do pai — cascateando o ajuste pra divisões que não
   *  deveriam mudar (1 e 2, no exemplo). CORRIGIDO com o mesmo mecanismo
   *  que gerenciadores de janelas em mosaico de verdade (i3, e o próprio
   *  Blender) usam: só os 2 painéis que fisicamente TOCAM a aresta
   *  arrastada devem mudar de tamanho — TODOS os outros, não importa a
   *  profundidade na árvore, devem manter o pixel EXATO que já tinham.
   *
   *  MECANISMO (`_edgeChain` abaixo): a partir de CADA lado do split sendo
   *  arrastado (`node.children[0]`/`[1]`), desce pela árvore SÓ por splits
   *  do MESMO eixo da direção arrastada (aninhamento reto, tipo o exemplo
   *  do usuário) — a cada nível, o filho que TOCA a aresta arrastada (o
   *  "próximo da cadeia") fica com `flex:1 1 auto` (absorve sozinho TODO
   *  o delta desse nível, nativo do CSS flexbox — sem precisar de mais
   *  nenhum cálculo manual) e o filho IRMÃO (fora da cadeia) fica travado
   *  em `flex:0 0 <NNpx>` no tamanho ATUAL exato (nunca muda, não importa
   *  quanto o pai crescer/encolher). A cadeia continua recursivamente
   *  dentro do filho que absorveu, até achar uma FOLHA (painel de
   *  verdade — aí o pixel absorvido É a própria divisão que devia mudar)
   *  ou um split de eixo PERPENDICULAR (seus 2 filhos já ocupam 100% da
   *  largura/altura do pai automaticamente via `align-items:stretch` do
   *  CSS — nada a travar dentro dele, a cadeia termina ali). Ao soltar o
   *  botão (`onUp`), os splits tocados pela cadeia têm seu `ratio`
   *  RECALCULADO a partir do tamanho final em pixels (pra persistir
   *  corretamente e reabrir do mesmo jeito depois), e os estilos inline
   *  temporários (fixo/flexível) são substituídos pelos valores normais
   *  baseados em ratio — sem chamar `_render()` de novo (evitaria
   *  desmontar/remontar os editores vivos, ex. o canvas/motor 3D, só por
   *  causa de um arrasto de divisor).
   *
   *  `dir==='row'` mede o arrasto em X (cursor col-resize); `dir==='col'`
   *  mede em Y (cursor row-resize) — ver CSS `.bsp-gutter-row`/
   *  `.bsp-gutter-col`. */
  /** NOVO (09/09/2026), pedido verbatim: bug relatado — "coloquei várias
   *  [divisões] empilhadas, depois peguei e movi uma delas. Acaba
   *  acontecendo que passa por cima das outras, quando deveria cada uma
   *  estar limitada a suas próprias dimensões [...] Uma barra de uma
   *  janela não pode passar por cima de uma barra de outra janela. Numa
   *  movimentação vertical de redimensionamento das telas, uma barra deve
   *  bater na outra e impedir que avance." — calcula, recursivamente, o
   *  tamanho MÍNIMO (em pixels, no eixo `axis` — 'row' mede largura,
   *  'col' mede altura) que a subárvore `node` inteira precisa pra caber
   *  sem nenhuma folha ficar menor que `HEADER_HEIGHT_PX` nem nenhum
   *  divisor "desaparecer": 2 filhos EMPILHADOS no MESMO eixo (`node.dir
   *  === axis`) somam seus mínimos + a espessura do divisor entre eles;
   *  2 filhos lado a lado no eixo PERPENDICULAR (`node.dir !== axis`)
   *  dividem o MESMO espaço nesse eixo, então o mínimo é só o MAIOR dos
   *  dois (não a soma). Usada por `_wireGutterDrag` (abaixo) pra clampar
   *  um arrasto levando em conta TODOS os cabeçalhos/divisores aninhados
   *  dos dois lados — não só 1 `HEADER_HEIGHT_PX` fixo (o clamp antigo),
   *  que deixava o arrasto espremer um lado com 2+ painéis empilhados por
   *  dentro além do que os divisores internos deles suportavam, fazendo
   *  as barras internas se sobreporem. */
  _minSizeAlongAxis(node, axis) {
    if (!node) return 0;
    if (node.type === 'leaf') return this.HEADER_HEIGHT_PX;
    const a = this._minSizeAlongAxis(node.children[0], axis);
    const b = this._minSizeAlongAxis(node.children[1], axis);
    return node.dir === axis ? (a + b + this.GUTTER_PX) : Math.max(a, b);
  },

  _edgeChain(rootChildNode, horizontal, side) {
    // `rootChildNode` = node.children[0] (lado 'end', dentro de wrapA) ou
    // node.children[1] (lado 'start', dentro de wrapB) do split sendo
    // arrastado — ele MESMO não entra na cadeia (já é controlado
    // diretamente pelo próprio arrasto, via wrapA/wrapB) — a cadeia cobre
    // os NETOS em diante: a cada passo, decide qual dos 2 FILHOS daquele
    // split fica fixo (em pixels) e qual fica flexível (absorve o resto),
    // só descendo por splits do MESMO eixo da direção arrastada.
    const chain = [];
    let cur = rootChildNode;
    while (cur && cur.type === 'split' && ((cur.dir === 'row') === horizontal)) {
      const nearIdx = side === 'end' ? 1 : 0; // 'end' = toca a aresta à direita/embaixo; 'start' = à esquerda/em cima
      chain.push({ node: cur, nearIdx, farIdx: 1 - nearIdx });
      cur = cur.children[nearIdx];
    }
    return chain;
  },

  _wireGutterDrag(gutter, splitEl, node, wrapA, wrapB) {
    // NOVO (08/09/2026), pedido verbatim: "Verticalmente, a divisão de
    // tela pode ser reduzida até o tamanho da altura da barra de seleção
    // de tela. Visualmente, fica 'botão de x', 'divisão de tela' e 'botão
    // de x', colados um acima do outro." `node.dir === 'col'` é a divisão
    // EMPILHADA (vertical, arrasto medido em Y) — é essa que o pedido
    // descreve. `HEADER_HEIGHT_PX` casa com `.bsp-leaf-header { height:30px }`
    // (css/style.css). O limite antigo (0.1–0.9, fração fixa) não deixava
    // encolher até esse ponto em splits altos — agora o clamp é em PIXELS
    // reais pra esse eixo, convertido pra fração a cada arrasto (a divisão
    // pode ter qualquer altura total). Direção 'row' (lado a lado)
    // continua com o clamp de fração antigo — não fazia parte do pedido
    // ("Verticalmente" só se aplica a empilhamento).
    const onDown = (e) => {
      e.preventDefault();
      const horizontal = node.dir === 'row';
      const axis = node.dir; // 'row' ou 'col' — mesmo valor que `_minSizeAlongAxis` espera
      const startPos = horizontal ? e.clientX : e.clientY;
      const totalPx = horizontal ? splitEl.clientWidth : splitEl.clientHeight;
      const gutterPx = horizontal ? gutter.offsetWidth : gutter.offsetHeight;
      const usablePx = Math.max(1, totalPx - gutterPx);
      const startRatio = node.ratio;

      // NOVO (08/09/2026): prepara as 2 cadeias de absorção de borda (ver
      // JSDoc grande acima) — dentro de wrapA, a cadeia que toca a aresta
      // arrastada (lado 'end'); dentro de wrapB, a cadeia que toca a
      // MESMA aresta pelo outro lado (lado 'start'). Splits fora dessas
      // cadeias (outros ramos da árvore) nunca são tocados — nem olhados.
      const chainA = this._edgeChain(node.children[0], horizontal, 'end');
      const chainB = this._edgeChain(node.children[1], horizontal, 'start');

      // CORRIGIDO (09/09/2026), bug relatado: "coloquei várias [divisões]
      // empilhadas [...] Acaba acontecendo que passa por cima das outras
      // [...] Uma barra de uma janela não pode passar por cima de uma
      // barra de outra." O clamp antigo (minRatio/maxRatio) só levava em
      // conta 1 HEADER_HEIGHT_PX fixo (o cabeçalho da própria folha nas
      // pontas de wrapA/wrapB) — mas cada nó da cadeia acima TRAVA o lado
      // "far" dele no pixel ATUAL (não no mínimo dele) e só o "near" mais
      // profundo é quem de fato absorve o arrasto (ver loop logo abaixo).
      // Então o mínimo REAL de cada lado (wrapA/wrapB) durante ESTE
      // arrasto específico é: a soma dos pixels TRAVADOS de cada "far" da
      // cadeia (`farPx`, já vai ser lido de novo abaixo — cacheado aqui
      // pra não reler o layout 2x) + o mínimo do que sobra na ponta da
      // cadeia (`_minSizeAlongAxis`, cobre tanto uma folha quanto um
      // split de eixo DIFERENTE que a cadeia parou de seguir). Sem somar
      // os "far" travados, o clamp deixava o arrasto encolher o lado
      // inteiro até só 1 cabeçalho, mesmo tendo 2+ cabeçalhos TRAVADOS
      // (que não vão encolher nesse arrasto) presos lá dentro — daí as
      // barras internas furarem umas às outras.
      const farPxByNode = new Map();
      const lockedSum = (chain) => chain.reduce((sum, { node: sNode, farIdx }) => {
        const farEl = farIdx === 0 ? sNode._wrapAEl : sNode._wrapBEl;
        if (!farEl) return sum;
        const rect = farEl.getBoundingClientRect();
        const px = horizontal ? rect.width : rect.height;
        farPxByNode.set(sNode, px);
        return sum + px;
      }, 0);
      const chainTail = (rootChildNode, chain) => (chain.length ? chain[chain.length - 1].node.children[chain[chain.length - 1].nearIdx] : rootChildNode);
      // Elemento DOM que de fato toca a aresta arrastada, no fim de cada
      // cadeia — usado abaixo pra MEDIR de verdade (ver comentário grande
      // logo adiante, correção "ao vivo"). Sem cadeia (lado é uma folha
      // direta), o próprio wrapA/wrapB já É esse elemento.
      const tailNodeA = chainTail(node.children[0], chainA);
      const tailNodeB = chainTail(node.children[1], chainB);
      const tailElA = chainA.length ? (chainA[chainA.length - 1].nearIdx === 0 ? chainA[chainA.length - 1].node._wrapAEl : chainA[chainA.length - 1].node._wrapBEl) : wrapA;
      const tailElB = chainB.length ? (chainB[chainB.length - 1].nearIdx === 0 ? chainB[chainB.length - 1].node._wrapAEl : chainB[chainB.length - 1].node._wrapBEl) : wrapB;
      const minTailA = this._minSizeAlongAxis(tailNodeA, axis);
      const minTailB = this._minSizeAlongAxis(tailNodeB, axis);
      const minA = lockedSum(chainA) + minTailA;
      const minB = lockedSum(chainB) + minTailB;
      // CORRIGIDO (09/09/2026), bug relatado: "depois que passa do meio da
      // 2ª pra 3ª divisão [...] há um encolhimento de várias divisões
      // [...] a regra é que o arraste de uma divisão vertical [...] deve
      // redimensionar só os seus dois adjacentes." A versão anterior
      // fazia `Math.min(0.5, minA/usablePx)`/`Math.max(0.5, ...)` — um
      // resquício de quando este clamp só existia pro caso vertical (onde
      // o mínimo de 1 cabeçalho nunca passava de 0.5 mesmo). Aplicado aqui
      // (com cadeias que podem travar VÁRIOS painéis "far" bem largos, ver
      // `lockedSum`), esse `Math.max(0.5, ...)` FORÇAVA `maxRatio` pra
      // CIMA de 0.5 mesmo quando o lado B só suportava, de verdade, bem
      // menos que isso (ex.: painéis C/D/E travados ocupando 70% da
      // largura — o `maxRatio` real deveria ser ~0.28, não 0.5) —
      // deixando o arrasto passar do limite verdadeiro. O que sobrava
      // (a folha que devia encolher, já espremida no mínimo) não tinha
      // pra onde ir, e o conteúdo dos painéis TRAVADOS (que não encolhem
      // nesse arrasto, ver o loop logo abaixo) transbordava pra fora da
      // própria caixa — dando a impressão de "várias divisões encolhendo"
      // enquanto na verdade elas só ficavam com o conteúdo cortado/
      // sobreposto por transbordamento. `minRatio`/`maxRatio` agora usam
      // o valor CALCULADO sem nenhum piso/teto artificial — o 0.5 só
      // entra como ÚLTIMO recurso, no caso realmente extremo em que os 2
      // mínimos juntos não cabem no espaço disponível (`minRatio >
      // maxRatio`, tratado abaixo, inalterado).
      let minRatio = minA / usablePx;
      let maxRatio = 1 - (minB / usablePx);
      if (minRatio > maxRatio) { minRatio = maxRatio = 0.5; } // caso extremo (espaço realmente insuficiente pros 2 lados) — trava no meio em vez de inverter/quebrar
      else { minRatio = Math.max(0, minRatio); maxRatio = Math.min(1, maxRatio); }

      [...chainA, ...chainB].forEach(({ node: sNode, nearIdx, farIdx }) => {
        const farEl = farIdx === 0 ? sNode._wrapAEl : sNode._wrapBEl;
        const nearEl = nearIdx === 0 ? sNode._wrapAEl : sNode._wrapBEl;
        if (!farEl || !nearEl) return;
        const farPx = farPxByNode.has(sNode) ? farPxByNode.get(sNode) : (horizontal ? farEl.getBoundingClientRect().width : farEl.getBoundingClientRect().height);
        farEl.style.flex = `0 0 ${farPx}px`; // TRAVADO no pixel atual — nunca muda durante este arrasto
        nearEl.style.flex = '1 1 auto'; // absorve sozinho (CSS nativo) o que sobrar — continua a cadeia (ou é a folha que devia mudar)
      });

      const applyRatio = (r) => {
        node.ratio = r;
        wrapA.style.flex = `${r} 1 0%`;
        wrapB.style.flex = `${1 - r} 1 0%`;
      };

      document.body.classList.add(horizontal ? 'bsp-resizing-col' : 'bsp-resizing-row');
      // CORRIGIDO (09/09/2026), bug relatado: "enquanto arrasta ela passa
      // por cima das outras. Quando solta o botão do mouse, elas se
      // ajustam. Este ajuste de colisão deve ser feito enquanto se
      // arrasta, não depois que solta o botão do mouse." — o clamp
      // `minRatio`/`maxRatio` acima (pixels TRAVADOS da cadeia + mínimo da
      // ponta) já cobre a maioria dos casos, mas é um cálculo feito só 1x
      // no início do arrasto — qualquer folga que ele não previu com
      // 100% de exatidão (ex.: a espessura dos PRÓPRIOS divisores
      // aninhados, gutters de splits intermediários da cadeia) deixava a
      // ponta (`tailElA`/`tailElB`) encolher um pouco além do mínimo
      // antes do clamp reagir — pouco, mas o suficiente pra sobrepor
      // visualmente durante o arrasto. Em vez de confiar só no cálculo
      // estático, `onMove` agora MEDE de verdade (`getBoundingClientRect`)
      // o elemento que toca a aresta, a CADA movimento do mouse, e corrige
      // a proporção NA HORA (mesmo evento, antes do próximo repaint) por
      // qualquer diferença encontrada — ao vivo, não só no soltar do
      // botão (que já fazia sua própria correção final, mantida abaixo
      // pra persistir os `ratio`s certos, mas não é mais a ÚNICA vez que
      // a colisão é respeitada).
      const onMove = (ev) => {
        const pos = horizontal ? ev.clientX : ev.clientY;
        const deltaRatio = (pos - startPos) / usablePx;
        let novoRatio = Math.min(maxRatio, Math.max(minRatio, startRatio + deltaRatio));
        applyRatio(novoRatio);
        for (let tentativa = 0; tentativa < 4; tentativa++) {
          let corrigiu = false;
          if (tailElA) {
            const rect = tailElA.getBoundingClientRect();
            const tamanho = horizontal ? rect.width : rect.height;
            const falta = minTailA - tamanho;
            if (falta > 0.5) { novoRatio += falta / usablePx; corrigiu = true; }
          }
          if (tailElB) {
            const rect = tailElB.getBoundingClientRect();
            const tamanho = horizontal ? rect.width : rect.height;
            const falta = minTailB - tamanho;
            if (falta > 0.5) { novoRatio -= falta / usablePx; corrigiu = true; }
          }
          if (!corrigiu) break;
          novoRatio = Math.min(maxRatio, Math.max(minRatio, novoRatio));
          applyRatio(novoRatio);
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('bsp-resizing-col', 'bsp-resizing-row');
        // NOVO (08/09/2026): fecha a cadeia — recalcula o `ratio` REAL de
        // cada split intermediário tocado (a partir do tamanho final em
        // pixels de seus 2 filhos) e devolve o `flex` de todos eles pra
        // forma NORMAL baseada em ratio (a mesma que `_renderSplit` usa) —
        // assim o layout fica persistível e continua correto numa
        // próxima remontagem, sem precisar chamar `_render()` agora (que
        // desmontaria/remontaria os editores vivos à toa).
        [...chainA, ...chainB].forEach(({ node: sNode }) => {
          const elA = sNode._wrapAEl, elB = sNode._wrapBEl;
          if (!elA || !elB) return;
          const rectA = elA.getBoundingClientRect(), rectB = elB.getBoundingClientRect();
          const pxA = horizontal ? rectA.width : rectA.height;
          const pxB = horizontal ? rectB.width : rectB.height;
          const total = Math.max(1, pxA + pxB);
          sNode.ratio = Math.min(0.95, Math.max(0.05, pxA / total));
          elA.style.flex = `${sNode.ratio} 1 0%`;
          elB.style.flex = `${1 - sNode.ratio} 1 0%`;
        });
        this._save();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    gutter.addEventListener('mousedown', onDown);
    // Toque (celular/tablet) — mesmo mecanismo, só troca os eventos de
    // mouse por touch (1 dedo só, sem gesto multi-touch nenhum).
    gutter.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; if (!t) return;
      onDown({ preventDefault: () => e.preventDefault(), clientX: t.clientX, clientY: t.clientY });
    }, { passive: false });
  },

  // ============================================================
  // CONTRATO PADRÃO App.views (mount/unmount) — ver app.js `navigate()`.
  // ============================================================

  async mount(container) {
    this._root = container;
    container.innerHTML = '<div class="bsp-loading">Carregando workspace…</div>';
    await this._loadLayoutsList();
    this._tree = JSON.parse(JSON.stringify(this._activeLayout().tree));
    // NOVO (08/09/2026): layout ativo salvo ANTES desta rodada (sem
    // nenhuma folha 'conteudo'/'info', arquitetura antiga em que o
    // Workspace era opcional) — usá-lo agora, que o Workspace é a raiz
    // PERMANENTE do app inteiro, deixaria o app sem `<main id="view">`
    // ou sem cabeçalho em lugar nenhum visível. Corrigido on-the-fly:
    // volta pro padrão novo e PERSISTE a correção (não repete o aviso a
    // cada boot).
    if (!this._treeHasEditorType(this._tree, 'info') || !this._treeHasEditorType(this._tree, 'botoes')) {
      // ATUALIZADO (08/09/2026, 38ª rodada): 'conteudo' saiu do layout
      // padrão (ver `_defaultTree()`) -- exigir a presença dela aqui
      // faria TODO layout novo (que nunca tem 'conteudo') ser
      // "corrigido" pra si mesmo em loop. Agora exige só as 2 folhas
      // realmente estruturais: 'info' (cabeçalho) e 'botoes' (única
      // forma de navegar entre Tabela/Cartões/Mapa/etc.).
      console.warn('[Workspace] Layout ativo incompatível com a arquitetura permanente (sem folha \'info\'/\'botoes\') — restaurando o padrão.');
      this._tree = this._defaultTree();
      await this._save();
    }
    await this._render();
  },

  unmount() {
    this._unmountAll(this._tree);
    this._root = null;
    this._tree = null;
    // CORRIGIDO (08/09/2026), pedido verbatim: "A botão quádruplo fica
    // sempre visível ali, mesmo clicando nos botões de rodapé do app, pois
    // se trata de uma tela independente." — a barra de layouts não
    // depende do Workspace estar montado. ATUALIZADO (08/09/2026), pedido
    // verbatim ("O dropdown dentro da tela de 'Info' deve ser eliminado"):
    // o "modo Info" avulso do cabeçalho (App._infoMode/_enterInfoMode/
    // _exitInfoMode) foi removido — era a causa raiz de a barra ficar
    // vazia pra sempre depois da 1ª troca de tela. `_renderInfoBarControls()`
    // não depende mais de nenhum "modo" (ver comentário grande nela); esta
    // função (`unmount`) não precisa esvaziar nada explicitamente — a
    // barra some sozinha via CSS `:empty` quando não há folha 'info' ativa
    // hospedando os wraps (ver `_releaseInfoHeaderControlsIfOwner`).
  },

  /** Restaura o layout padrão (raiz Mapa 2D | Ver em 3D + Buscar) DENTRO
   *  do layout nomeado atual (não cria/troca de layout — só substitui a
   *  árvore de painéis dele). Reaproveitado internamente por
   *  `_loadLayoutsList` na 1ª vez que o app é usado (bootstrap do 1º
   *  layout, chamado "Layout"); não tem mais botão próprio na barra desde
   *  que os 4 botões de layouts nomeados assumiram (pedido verbatim:
   *  "Agora, na tela de 'Info', em sua barra, deve ter quatro botões" —
   *  só 4, sem um 5º de "restaurar padrão"). */
  async resetToDefault() {
    this._unmountAll(this._tree);
    this._tree = this._defaultTree();
    await this._save();
    await this._render();
  },

  // ============================================================
  // LAYOUTS NOMEADOS E SALVÁVEIS — REESCRITO (08/09/2026), pedido
  // verbatim: "Os botões '-- layout atual (não salvo) --', 'Salvar
  // como...' devem ser removidos. [...] Agora, na tela de 'Info', em sua
  // barra, deve ter quatro botões que operão em grupo." O modelo mudou:
  // antes havia uma árvore "atual" avulsa (podia ficar "não salva") mais
  // uma lista OPCIONAL de layouts salvos à parte — agora NÃO existe mais
  // estado "não salvo": sempre há pelo menos 1 layout nomeado, e a
  // árvore em edição É SEMPRE o layout ATIVO (toda mudança nela já vai
  // direto pra dentro do layout ativo, via `_save()`, sem precisar de um
  // botão "Salvar como" separado) — mesmo espírito das "Workspaces" do
  // Blender: sempre tem uma ativa, nunca um estado solto sem nome.
  // Persistido em `bspSavedLayouts` (array de `{id,name,tree}`, NUNCA
  // vazio) + `bspActiveLayoutId` (qual delas está em edição agora).
  // ============================================================

  /** Carrega (ou cria, na 1ª vez) a lista de layouts + qual está ativo —
   *  chamado 1x no `mount()`. Nunca deixa a lista vazia: sem nenhum
   *  layout salvo ainda (1ª vez que o Workspace é aberto), cria 1 só,
   *  chamado "Layout", com a árvore padrão (mapa2d|ver3d+buscar). */
  async _loadLayoutsList() {
    this._savedLayouts = (typeof DB !== 'undefined') ? await DB.getSetting('bspSavedLayouts', []) : [];
    if (!Array.isArray(this._savedLayouts) || !this._savedLayouts.length) {
      this._savedLayouts = [{ id: this._genId(), name: 'Layout', tree: this._serialize(this._defaultTree()) }];
    }
    this._activeLayoutId = (typeof DB !== 'undefined') ? await DB.getSetting('bspActiveLayoutId', null) : null;
    if (!this._savedLayouts.some((l) => l.id === this._activeLayoutId)) this._activeLayoutId = this._savedLayouts[0].id;
    await this._persistLayoutsList();
  },

  /** O objeto `{id,name,tree}` do layout em edição agora — nunca `null`
   *  (sempre há pelo menos 1 na lista, ver `_loadLayoutsList`). */
  _activeLayout() {
    return this._savedLayouts.find((l) => l.id === this._activeLayoutId) || this._savedLayouts[0];
  },

  /** NOVO (08/09/2026), pedido verbatim: "A botão quádruplo fica sempre
   *  visível ali, mesmo clicando nos botões de rodapé do app, pois se
   *  trata de uma tela independente." Garante que `_savedLayouts` já está
   *  carregado (do banco, se por algum motivo `mount()` ainda não tiver
   *  rodado) e popula a barra de 4 botões. ATUALIZADO (08/09/2026), pedido
   *  verbatim ("O dropdown dentro da tela de 'Info' deve ser eliminado"):
   *  não é mais chamada por nenhum "modo Info" avulso (`App._enterInfoMode()`
   *  foi removido, ver app.js) — `BSPLayout.mount()` já chama
   *  `_loadLayoutsList()`+`_render()` (que já chama `_renderInfoBarControls()`)
   *  no boot, então a barra populada não depende mais desta função ser
   *  chamada de fora; mantida disponível (idempotente) caso algum código
   *  precise forçar o recarregamento da lista de layouts do banco. */
  async ensureInfoBarLoaded() {
    if (!Array.isArray(this._savedLayouts) || !this._savedLayouts.length) await this._loadLayoutsList();
    this._renderInfoBarControls();
  },

  async _persistLayoutsList() {
    if (typeof DB === 'undefined') return;
    await DB.setSetting('bspSavedLayouts', this._savedLayouts.map((l) => ({ id: l.id, name: l.name, tree: l.tree })));
    await DB.setSetting('bspActiveLayoutId', this._activeLayoutId);
  },

  /** `_genId()` pro novo nome do botão "+": "gera um novo nome de layout
   *  baseado no nome atual [...] acrescentando ao seu final '.001',
   *  '.002', etc [...] O formato é '.001' em diante" (pedido verbatim). */
  _genLayoutName(base) {
    const m = /^(.*)\.(\d{3,})$/.exec(base || '');
    if (m) {
      const n = parseInt(m[2], 10) + 1;
      return `${m[1]}.${String(n).padStart(3, '0')}`;
    }
    return `${base || 'Layout'}.001`;
  },

  /** Botão "+" — duplica o layout ATIVO (nome incrementado + MESMA
   *  árvore de painéis atual) e passa a editar a cópia. Não precisa
   *  remontar os painéis (a cópia começa IDÊNTICA visualmente ao que já
   *  está na tela) — só atualiza a barra (nome ativo/lista).
   *  ATUALIZADO (08/09/2026): a barra de layouts agora funciona mesmo com
   *  o Workspace DESMONTADO (a folha 'info' é permanente, ver `_defaultTree()`)
   *  — `this._tree` é `null` nesse caso, então a "árvore atual" vem
   *  direto do próprio layout ativo salvo (já é a mesma coisa, não há
   *  edição ao vivo acontecendo). */
  async _addLayoutFromCurrent() {
    const atual = this._activeLayout();
    const novoNome = this._genLayoutName(atual.name);
    const treeCopia = this._tree ? this._serialize(this._tree) : JSON.parse(JSON.stringify(atual.tree));
    const entry = { id: this._genId(), name: novoNome, tree: treeCopia };
    this._savedLayouts.push(entry);
    this._activeLayoutId = entry.id;
    await this._persistLayoutsList();
    this._renderInfoBarControls();
  },

  /** Botão "✕" — exclui o layout ATIVO. "Dá para ir clicando e excluindo
   *  tudo exceto o último que restar" (pedido verbatim): recusa (no-op)
   *  se só sobrar 1 na lista. Depois de excluir, o layout ANTERIOR na
   *  lista (ou o 1º, se excluiu o 1º) vira o novo ativo. Só desmonta/
   *  remonta os painéis de verdade se o Workspace estiver montado agora
   *  (`this._tree` não-nulo) — com o modo Info independente (08/09/2026),
   *  a exclusão pode acontecer com o Workspace fora de tela; nesse caso
   *  só os DADOS mudam, e a próxima vez que o Workspace for aberto já
   *  abre direto no novo ativo (ver `mount()`). */
  // CORRIGIDO (09/09/2026), bug relatado: "ao ter vários nomes com o mesmo
  // layout e ficar clicando seguidamente no botão 'Excluir este layout', a
  // tela 'Botões' fica piscando." Causa: mesmo quando o próximo layout
  // ativo tem a MESMA árvore de painéis (visualmente idêntico — é só um
  // nome diferente), esta função sempre desmontava TUDO
  // (`_unmountAll`) e reconstruía TUDO do zero (`_render()`, que já
  // recria cada folha/cabeçalho do zero — ver comentário grande lá) —
  // clicando rápido e repetido em "excluir" (fácil de fazer testando
  // vários layouts iguais), cada clique gerava esse desmonte+remonte
  // completo, visível como um "piscar" na tela (a 'Botões', simples e
  // sempre no rodapé, é a mais notada). CORRIGIDO: só desmonta/reconstrói
  // de verdade quando a árvore do PRÓXIMO layout é DIFERENTE da atual —
  // se for igual (mesma configuração, só nome trocando), troca só os
  // DADOS (`_activeLayoutId`) e atualiza a barra, sem tocar no DOM dos
  // painéis (nada "pisca" porque nada é desmontado/remontado). */
  async _deleteActiveLayout() {
    if (this._savedLayouts.length <= 1) return;
    const idx = this._savedLayouts.findIndex((l) => l.id === this._activeLayoutId);
    if (idx === -1) return;
    this._savedLayouts.splice(idx, 1);
    const novoAtivo = this._savedLayouts[Math.max(0, idx - 1)];
    const arvoreMudou = !this._tree || JSON.stringify(this._serialize(this._tree)) !== JSON.stringify(novoAtivo.tree);
    this._activeLayoutId = novoAtivo.id;
    await this._persistLayoutsList();
    if (this._tree && arvoreMudou) {
      this._unmountAll(this._tree);
      this._tree = JSON.parse(JSON.stringify(novoAtivo.tree));
      await this._render();
    } else {
      // Árvore igual — mantém `this._tree` como está DE PROPÓSITO (não
      // reatribui a partir de `novoAtivo.tree`): essa cópia persistida é
      // "crua" (sem `node._instance`/`_editorTypeMounted`, removidos por
      // `_serialize` antes de salvar), reatribuir perderia a referência
      // pras instâncias REALMENTE montadas agora (ainda vivas, nada foi
      // desmontado) — o próximo `_render()` de verdade (outra ação, mais
      // tarde) as deixaria "presas" sem nunca desmontar. Como o conteúdo é
      // idêntico, a árvore ao vivo já É, na prática, a árvore do novo
      // layout ativo — só os DADOS (`_activeLayoutId`, já trocado acima)
      // precisavam mudar.
      this._renderInfoBarControls();
    }
  },

  /** Botão do meio (nome) — renomeia o layout ATIVO. Nome vazio/só
   *  espaços é ignorado (o nome antigo volta, sem erro nenhum). */
  async _renameActiveLayout(novoNome) {
    const nomeFinal = (novoNome || '').trim();
    if (!nomeFinal) { this._renderInfoBarControls(); return; }
    const atual = this._activeLayout();
    atual.name = nomeFinal;
    await this._persistLayoutsList();
    this._renderInfoBarControls();
  },

  /** Botão "lista" (1º botão) — troca qual layout está em edição. Se o
   *  Workspace estiver montado (`this._tree` não-nulo), desmonta a árvore
   *  de painéis atual e monta a do layout escolhido do zero (são arranjos
   *  DIFERENTES, ao contrário de `_addLayoutFromCurrent`). ATUALIZADO
   *  (08/09/2026): com o modo Info independente do Workspace, esta troca
   *  pode acontecer com o Workspace fora de tela — nesse caso só os DADOS
   *  mudam (não há nada montado pra desmontar/remontar); a próxima vez que
   *  o Workspace for aberto já abre direto no layout recém-escolhido. */
  async _switchActiveLayout(id) {
    if (id === this._activeLayoutId) return;
    const entry = this._savedLayouts.find((l) => l.id === id);
    if (!entry) return;
    this._activeLayoutId = id;
    await this._persistLayoutsList();
    if (this._tree) {
      this._unmountAll(this._tree);
      this._tree = JSON.parse(JSON.stringify(entry.tree));
      await this._render();
    } else {
      this._renderInfoBarControls();
    }
  },

  /** NOVO (08/09/2026), pedido verbatim: "Os botões [...] devem ficar na
   *  barra do 'Info' (tudo na mesma barra, que, na verdade, é a barra da
   *  tela 'Info')." — a barra de 4 botões agora é renderizada DENTRO do
   *  cabeçalho GLOBAL do app (`#topbar-info-layoutbar`, ver index.html).
   *  ATUALIZADO (08/09/2026), pedido verbatim: "A botão quádruplo fica
   *  sempre visível ali, mesmo clicando nos botões de rodapé do app, pois
   *  se trata de uma tela independente." — chamada por `_render()` (toda
   *  vez que a árvore de painéis muda) e por `ensureInfoBarLoaded()`.
   *  CORRIGIDO (08/09/2026), pedido verbatim ("O dropdown dentro da tela
   *  de 'Info' deve ser eliminado" + bug relatado: botão quádruplo sumido):
   *  antes só desenhava enquanto `App._infoMode` (um "modo Info" avulso do
   *  cabeçalho, controlado pelo <select id="topbar-info-select"> antigo)
   *  estivesse ligado — como nada no app novo (folha 'info' permanente do
   *  BSP) voltava a ligar esse modo, a barra ficava vazia pra sempre.
   *  Removida a dependência: desenha sempre que há um layout ativo (sempre
   *  há) — o próprio `<div>` só aparece visualmente quando hospedado no
   *  cabeçalho de uma folha 'info' (CSS `:empty` esconde o resto do tempo).
   *  "quatro botões que operam em grupo. Ficam juntos lado a lado" —
   *  1) lista+busca (ver `_toggleLayoutListPopover`); 2) nome ativo,
   *  editável ao clicar (ver `_startEditLayoutName`); 3) "+" duplica com
   *  nome incrementado; 4) "✕" exclui o ativo — só o 1º e o 4º (botões de
   *  EXTREMIDADE do grupo) ganham cantos arredondados, e só do lado de
   *  FORA (ver CSS `.topbar-info-wfbtn`). */
  // CORRIGIDO (08/09/2026), pedido verbatim ("O dropdown dentro da tela de
  // 'Info' deve ser eliminado" + bug relatado: "o botão quádruplo [...]
  // também não está aparecendo"): esta função dependia de `App._infoMode`,
  // um "modo Info" avulso do cabeçalho que só existia enquanto o <select
  // id="topbar-info-select"> antigo (removido, ver index.html/app.js)
  // estivesse com "ℹ️ Info" selecionado. Depois da rearquitetura que
  // tornou a folha 'info' parte PERMANENTE do BSP (sempre presente, ver
  // `_defaultTree()`), nada no app novo voltava a ligar `_infoMode` — a
  // barra ficava vazia pra sempre depois da 1ª vez. Já não depende de
  // nenhum "modo": desenha sempre que houver um layout ativo (sempre há,
  // ver `_loadLayoutsList`) — o `<div>` em si só fica visualmente
  // relevante quando movido pro cabeçalho da folha 'info' (ver
  // `_buildInfoControlsWraps`/`_syncInfoHeaderControlsInHeader` acima),
  // então populá-lo sempre é seguro e é exatamente o "sempre visível"
  // pedido originalmente.
  _renderInfoBarControls() {
    const bar = document.getElementById('topbar-info-layoutbar');
    if (!bar) return;
    bar.innerHTML = '';
    const atual = this._activeLayout();
    if (!atual) return;

    const btnList = document.createElement('button');
    btnList.type = 'button';
    btnList.className = 'topbar-info-wfbtn topbar-info-wfbtn-list';
    btnList.title = 'Layouts salvos — escolher outro';
    btnList.innerHTML = '<span class="wf-ic">▦</span><span class="wf-carets"><span>▲</span><span>▼</span></span>';
    btnList.onclick = (e) => { e.stopPropagation(); this._toggleLayoutListPopover(btnList); };

    const btnName = document.createElement('button');
    btnName.type = 'button';
    btnName.className = 'topbar-info-wfbtn topbar-info-wfbtn-name';
    btnName.textContent = atual.name;
    btnName.title = 'Renomear este layout';
    btnName.onclick = () => this._startEditLayoutName(btnName, atual);

    const btnAdd = document.createElement('button');
    btnAdd.type = 'button';
    btnAdd.className = 'topbar-info-wfbtn topbar-info-wfbtn-add';
    btnAdd.textContent = '+';
    btnAdd.title = 'Novo layout (cópia deste, com o nome incrementado)';
    btnAdd.onclick = () => this._addLayoutFromCurrent();

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'topbar-info-wfbtn topbar-info-wfbtn-del';
    btnDel.textContent = '✕';
    const podeExcluir = this._savedLayouts.length > 1;
    btnDel.title = podeExcluir ? 'Excluir este layout' : 'Não é possível excluir o último layout restante';
    btnDel.disabled = !podeExcluir;
    btnDel.onclick = () => this._deleteActiveLayout();

    bar.appendChild(btnList); bar.appendChild(btnName); bar.appendChild(btnAdd); bar.appendChild(btnDel);
  },

  /** Botão 2 (nome) clicado — "ele deve ser autoselecionável e editável
   *  ali mesmo" (pedido verbatim): troca o próprio botão por um `<input>`
   *  já focado e com o texto todo selecionado, no MESMO lugar visual.
   *  Confirma no Enter/blur, cancela no Escape (sem chamar `blur` de
   *  novo — senão o `commit` do blur disparava depois do cancelamento). */
  _startEditLayoutName(btnName, atual) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'topbar-info-wfbtn topbar-info-wfbtn-name-input';
    input.value = atual.name;
    btnName.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => this._renameActiveLayout(input.value);
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); input.removeEventListener('blur', commit); this._renderInfoBarControls(); }
    });
  },

  /** Botão 1 (lista) clicado — "a lista de layouts deve aparecer. A box
   *  da lista deve ter altura fixa podendo caber 4 nomes visíveis [...]
   *  logo abaixo dos nomes, deve haver uma entrada para busca (com uma
   *  lupinha à esquerda) para destacar, pela busca, os nomes
   *  'encontrados'" (pedido verbatim) — popover simples, fechado ao
   *  clicar fora ou ao escolher um item. Altura fixa (~4 itens) + rolagem
   *  interna vêm do CSS (`.topbar-info-layoutpop-list`), não daqui. */
  _toggleLayoutListPopover(anchorBtn) {
    const existente = document.getElementById('topbar-info-layoutpop');
    if (existente) { existente.remove(); return; }
    const pop = document.createElement('div');
    pop.id = 'topbar-info-layoutpop';
    pop.className = 'topbar-info-layoutpop';
    const list = document.createElement('div');
    list.className = 'topbar-info-layoutpop-list';
    const renderList = (filtro) => {
      list.innerHTML = '';
      const f = (filtro || '').trim().toLowerCase();
      this._savedLayouts.forEach((l) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'topbar-info-layoutpop-item';
        if (l.id === this._activeLayoutId) item.classList.add('active');
        if (f && l.name.toLowerCase().includes(f)) item.classList.add('match');
        item.textContent = l.name;
        item.onclick = () => { pop.remove(); this._switchActiveLayout(l.id); };
        list.appendChild(item);
      });
    };
    renderList('');
    const searchWrap = document.createElement('div');
    searchWrap.className = 'topbar-info-layoutpop-search';
    const searchIcon = document.createElement('span'); searchIcon.className = 'ic'; searchIcon.textContent = '🔍';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Buscar layout…';
    searchInput.oninput = () => renderList(searchInput.value);
    searchWrap.appendChild(searchIcon); searchWrap.appendChild(searchInput);
    pop.appendChild(list); pop.appendChild(searchWrap);
    document.body.appendChild(pop);
    const r = anchorBtn.getBoundingClientRect();
    pop.style.left = `${Math.round(r.left)}px`;
    pop.style.top = `${Math.round(r.bottom + 4)}px`;
    const onDocClick = (e) => {
      if (pop.isConnected && !pop.contains(e.target) && e.target !== anchorBtn) {
        pop.remove();
        document.removeEventListener('click', onDocClick);
      }
    };
    // `setTimeout(0)` — não liga o listener no MESMO clique que abriu o
    // popover (o próprio `mousedown`/`click` do botão "lista" borbulharia
    // pro `document` e fecharia o popover instantaneamente, na mesma hora
    // que acabou de abrir).
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
  },
};

window.BSPLayout = BSPLayout;
