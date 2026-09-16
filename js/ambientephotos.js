/**
 * ambientephotos.js — Fotos do ambiente: tira/importa uma ou mais fotos do
 * lugar (dá pra usar o modo panorama da câmera do celular, já que é um
 * <input type="file" capture>, não uma captura ao vivo), permite dar zoom e
 * mover (pan) sobre a foto, e marcar "orbs" (pontos) nela — cada orb fica
 * ligado a um item já cadastrado, com um traço ligando o orb ao número de
 * patrimônio (ou descrição) exibido sobre a foto.
 *
 * As fotos ficam guardadas junto do AMBIENTE (ambienteId, mesmo conceito do
 * Mapa) — um ambiente pode ter várias fotos, cada uma com seus próprios orbs.
 * Isto é complementar ao mapa 2D/3D (posição x,y "de cima"), não substitui:
 * às vezes é mais fácil apontar "o item está bem ali nessa foto" do que
 * posicionar um ponto exato numa planta.
 *
 * ---------------------------------------------------------------------
 * ÍNDICE DE FUNÇÕES (todo método top-level do objeto `AmbientePhotos`,
 * na ordem em que aparece no arquivo) — [10/09/2026] adicionado por
 * pedido verbatim do usuário ("evitar o que você teve de 'vasculhar todo
 * o arquivo' [...] índice de funções [...] descrição do que faz e em
 * qual situação é usada"). Ao mexer em algo desta tela, procure o nome
 * aqui primeiro em vez de ler o arquivo inteiro. Mantenha este índice
 * atualizado ao adicionar/remover/renomear um método top-level.
 * ---------------------------------------------------------------------
 * open() — abre a tela cheia "Mapa"→"Foto" pra um ambiente; monta todo o
 *   HTML/overlay, liga os listeners, carrega as fotos do ambiente.
 *   Chamada pelo botão "Foto" do rodapé/menu Mapa (app.js) e por
 *   enterOrbPlacementForItem abaixo.
 * close() — fecha a tela, remove o overlay, restaura o estado do MapConfig
 *   (listeners) e chama onExit se houver.
 * _toggleMode(mode) — liga/desliga "Adicionar orb"/"Apagar orb"
 *   (#ambphotos-mode-orb/#ambphotos-mode-del, marcação de patrimônio
 *   DENTRO da foto — não confundir com vincular a FOTO ao mapa).
 * _toggleMedidaSidemenu() — abre/fecha o menu lateral direito recolhível
 *   (botão-seta) que hospeda Medidas/Traço guia/📍/📐.
 * _toggleMedidasVisiveis() — master switch da fileira "📏 Medidas" (botão
 *   do menu lateral) — mostra/esconde Adicionar/Apagar/Reposicionar medida.
 * _updateMedidaControlsVisibility() — aplica o estado do switch acima ao
 *   DOM (classe hidden na fileira), chamada no mount e a cada troca de foto.
 * _toggleMedidaMode(mode) — liga "Adicionar"/"Apagar" dentro da ferramenta
 *   Medidas (rascunho de 2 pontos na foto).
 * _toggleTracosVisiveis() / _updateTracoControlsVisibility() /
 *   _toggleTracoMode(mode) — MESMO padrão de Medidas acima, pra "✏️ Traço
 *   guia" (linha tracejada só de referência visual, não mede nada).
 * _toggleMarcacoesPatrimonioVisiveis() — [10/09/2026] master switch do
 *   botão "📍" do menu lateral — mostra/esconde os botões PRÉ-EXISTENTES
 *   #ambphotos-mode-orb/#ambphotos-mode-del (substituiu o botão errado
 *   "🖼️ Orb" de uma rodada anterior, que tinha criado um 2º par confuso).
 * _updateMarcacoesPatrimonioVisibility() — aplica o switch acima ao DOM
 *   (toggle de `hidden` nos 2 botões, individualmente — nunca no contêiner
 *   inteiro, que também tem "⬇️ Baixar todas").
 * _abrirVanishCamAtual() — botão "📐" do menu lateral: abre a calibração
 *   vanishCam (linhas de referência) pra foto selecionada, via
 *   window.MapView._openVanishCamScreen (mesmo ponto de entrada do 2D).
 * _toggleMedidaReposicionar() / _updateMedidaReposicionarBtn() /
 *   _toggleTracoReposicionar() / _updateTracoReposicionarBtn() — ligam o
 *   modo "arrastar uma ponta já inserida" de cada ferramenta (botões "🎯
 *   Reposicionar pontas" dentro de cada fileira).
 * _placeTracoPointAt(sx, sy) — clique/toque na foto com Traço guia ativo:
 *   registra o 1º/2º ponto do rascunho.
 * _confirmTracoDraft() — salva o traço guia com os 2 pontos já marcados.
 * _hitTestTracoVertex/_hitTestTracoLine(sx, sy, ...) — testes de acerto
 *   (clique perto de uma ponta/linha) usados por arrastar/remover traço.
 * _removeTraco(traco) / _removeTracoById / _restoreTracoById — apaga um
 *   traço guia (com undo/redo via History).
 * _drawTraco(traco, {draft}) — desenha um traço guia (ou o rascunho em
 *   progresso) no canvas, chamada por render().
 * _openMedidaValorModal() / _closeMedidaValorModal() / _confirmMedidaDraft
 *   (valor) — modal que pede o VALOR numérico (distância real) ao terminar
 *   de marcar os 2 pontos de uma medida; confirma e salva a medida.
 * enterOrbPlacementForItem(map, itemId, {...}) — ponto de entrada vindo da
 *   ficha de um item ("📍 Marcar em foto") — abre esta tela já no modo
 *   "Adicionar orb" pendente, pra associar o item a um ponto de uma foto.
 * _showPendingOrbBanner/_hidePendingOrbBanner/_setPendingOrbButtonsDisabled/
 *   _cancelPendingOrbPlacement — a faixa/banner "marque o item na foto"
 *   mostrada durante o fluxo acima.
 * _renderStrip() — desenha a tira de miniaturas das fotos deste ambiente
 *   (topo/lateral da tela), chamada ao abrir e após adicionar/remover foto.
 * _onStripClick(e) — clique numa miniatura da tira: troca a foto em destaque.
 * _syncStripOffset() / _attachStripDragScroll(strip) — rolagem por
 *   arrasto da tira de miniaturas.
 * _onFilesChosen(e) — callback do <input type=file>: processa 1+ fotos
 *   escolhidas/tiradas (botão "📷 Adicionar foto").
 * _addPhotoFromFile(file) — grava uma foto nova no banco (DB.
 *   addAmbientePhoto) e recarrega a tira.
 * _selectPhoto(id, {focusNorm}) — troca qual foto está em destaque/editável.
 * _fitToScreen() — recalcula zoom/pan pra foto atual caber na tela.
 * _updateTitle() — atualiza o nome exibido no topo (caption) da foto atual.
 * _updateMapLinkBtn() — habilita/desabilita "🗺️"/"👁️2D"/"👁️3D" da barra de
 *   topo conforme a foto atual já tem posição salva no mapa ou não.
 * _openMapLinkFlow() — botão "🗺️": fecha esta tela e entra no fluxo de
 *   cruz+"Marcar aqui" da Planta baixa pra vincular/editar a posição desta
 *   foto no mapa (MapView.enterPhotoPlacementMode).
 * _loadJSZip() — carrega a lib JSZip sob demanda (usada só por "Baixar
 *   todas .zip").
 * _photoFileName/_reencodePhotoDataUrl — nome de arquivo e reencode (jpg/png)
 *   usados nos downloads.
 * _downloadCurrentPhoto() / _downloadAllPhotosZip() — botões de download
 *   (1 foto, ou todas do ambiente num .zip).
 * _renameCurrentPhoto() — botão ✏️ na legenda: renomeia a foto atual.
 * _persistCurrent() — grava `this._current` no banco (DB.saveAmbientePhoto).
 * _deletePhoto(id) / _deletePhotoInternal / _restorePhotoInternal — apaga
 *   uma foto do ambiente (com undo/redo).
 * _resolveOrbLabels(photo) — resolve o texto (patrimônio/descrição) de cada
 *   orb da foto, buscando o item associado no banco.
 * refreshIfOpen() — recarrega dados (chamado de fora, ex. após editar um
 *   item associado noutra tela, pra esta tela não ficar desatualizada).
 * _resizeCanvas() / worldToScreen / screenToWorld — geometria do canvas
 *   (mapeamento pixel-de-tela <-> coordenada normalizada da foto).
 * render() — redesenha o canvas inteiro (foto + orbs + medidas + traços +
 *   destaques), chamada após qualquer mudança de estado/pan/zoom.
 * _drawVertexHighlightAmb/_ensureVertexHighlightLoop — animação de destaque
 *   num vértice (medida/traço) recém-arrastado.
 * _drawResolutionLabel() — texto de depuração com a resolução da imagem.
 * _startOrbHighlight(orbId) — anima um orb específico piscando (vindo de
 *   App.verMarcacaoEmFoto, "ver marcação em foto" na ficha do item).
 * _drawOrb(orb) — desenha um orb (marcação de patrimônio) na foto.
 * _roundRectPath — helper de desenho (retângulo de cantos arredondados).
 * _drawMedida(medida, {draft}) / _drawSetaPontaMedida — desenha uma medida
 *   (reta + seta + valor) ou o rascunho em progresso.
 * _hitTestMedidaVertex/_pointSegDist/_hitTestMedidaLine/_hitTestMedidaAny —
 *   testes de acerto de clique pra medidas (ponta/linha/qualquer parte).
 * _placeMedidaPointAt(sx, sy) — clique na foto com Medidas ativo: registra
 *   o 1º/2º ponto do rascunho (abre _openMedidaValorModal no 2º).
 * _removeMedida/_removeMedidaById/_restoreMedidaById — apaga uma medida
 *   (com undo/redo).
 * _hitTestOrb(sx, sy) — teste de acerto de clique num orb já marcado.
 * _onCanvasClick(e) — roteador de clique no canvas: decide entre
 *   orb/medida/traço conforme qual ferramenta está ativa no momento.
 * _triggerLongPress(x, y) — dispara as opções de um orb após pressionar e
 *   segurar (toque, sem mover).
 * _placeOrbAt(sx, sy) — clique na foto com "Adicionar orb" ativo: abre a
 *   busca de patrimônio e associa o item escolhido a este ponto da foto.
 * _removeOrb/_findLoadedPhoto/_removeOrbById/_restoreOrbById — apaga a
 *   marcação de um orb (não apaga o item, só o vínculo com esta foto).
 * _openOrbActions(orb) — toque num orb já existente: menu de ações (ver
 *   item/trocar associação/remover).
 * _pickItem() — abre a busca de patrimônio (usada por _placeOrbAt/
 *   _openOrbActions).
 * _attachPanZoom(canvas) — liga pan (arrastar)/zoom (roda/pinça) do canvas
 *   da foto, e o long-press de orb (ver _triggerLongPress) — é o último
 *   método top-level do arquivo (o resto dele é lógica interna desta função).
 * ---------------------------------------------------------------------
 */
const AmbientePhotos = {
  _map: null,
  _overlayEl: null,
  _canvas: null,
  _ctx: null,
  _photos: [],
  _current: null,
  _img: null,
  _imgW: 0,
  _imgH: 0,
  _view: { cx: 0, cy: 0, zoom: 1 },
  _placingOrb: false,
  _deletingOrb: false,
  // ---------- "📏 Medidas" (pedido do usuário, 26/08/2026) ----------
  // Menu lateral recolhível (botão-setinha no meio da lateral direita) —
  // `_medidaSidemenuOpen` só controla se o PAINEL do menu está expandido;
  // `_medidasVisiveis` (dentro do painel, botão "📏") é quem de fato liga/
  // desliga a ferramenta — pode fechar o painel com a ferramenta continuando
  // ativa (o painel é só uma gaveta, não precisa ficar aberta o tempo todo).
  _medidaSidemenuOpen: false,
  // Master switch da ferramenta — controla, ao mesmo tempo: (1) a fileira
  // "Adicionar/Apagar medida" acima da fileira de orbs, (2) se as medidas já
  // salvas desta foto são desenhadas. Desligado = nada disso aparece, nem a
  // fileira nem as medidas (pedido explícito do usuário).
  _medidasVisiveis: false,
  _placingMedida: false,
  _deletingMedida: false,
  // Medida em progresso, ainda não salva (ver _confirmMedidaDraft) — só
  // existe enquanto `_placingMedida` está ativo. `a`/`b` são os 2 vértices
  // ({xNorm,yNorm}, mesma convenção normalizada 0..1 dos orbs), um dos dois
  // (ou os dois) pode estar `null` até serem tocados. Reaproveita a MESMA
  // representação {xNorm,yNorm} de uma medida já salva (ver DB.addAmbientePhoto
  // medidas:[]), pra usar o mesmo desenho/hit-test em ambos os casos (ver
  // _drawMedida/_hitTestMedidaVertex, parâmetro `draft`).
  _medidaDraft: null,
  // ATUALIZADO (05/09/2026), pedido verbatim: "No Mapa->Foto, refaça do
  // zero baseado nas ferramentas 'Trena' e 'Traço guia' do mapa 2D. Agora
  // ficam sempre habilitados por padrão os botões da bandeja do botão
  // lateral. Preserve os botões que aparecem 'Adicionar medida' e 'Apagar
  // medida'. Quando for o 'Traço guia', deve aparecer 'Adicionar traço
  // guia' e 'Apagar traço guia'. Serve como habilitador de desenho, pois,
  // atualmente, quando o 'Traço guia' estava ativa na bandeja, já ia logo
  // sendo desenhado, sem ter um habilitador secundário (como 'Adicionar
  // traço guia'). Agora vai ter." — o "Traço guia" deixou de ser um único
  // botão que já desenhava direto; ganhou a MESMA estrutura de "📏 Medidas"
  // (ver `_medidasVisiveis` acima): um master switch (`_tracosVisiveis`,
  // NOVO — liga/desliga a fileira "Adicionar/Apagar traço guia" E se os
  // traços já salvos aparecem, mesmo espírito de `_medidasVisiveis`) e 2
  // submodos independentes (`_placingTraco` = "Adicionar traço guia",
  // `_deletingTraco` = "Apagar traço guia", NOVO — antes só existia o 1º,
  // fazendo dupla função de add+apagar sozinho). Ambos os masters
  // (`_medidasVisiveis`/`_tracosVisiveis`) agora nascem LIGADOS por padrão
  // (ver open(), abaixo) — antes nasciam desligados, exigindo tocar o botão
  // da bandeja lateral 1x antes de ver as fileiras "Adicionar/Apagar".
  _tracosVisiveis: false,
  _placingTraco: false,
  _deletingTraco: false,
  _tracoDraft: null,
  // NOVO (04/09/2026), pedido verbatim (item 3): "Coloque um habilitador de
  // 'reposicionar pontas', em 'Mapa'->'Foto' também, para os botões
  // equivalentes 'Medidas' e 'Traço guia'." — Medidas já tinha o seu
  // (`_medidaReposicionarExtremidadesAtivo`, ver logo abaixo); este é o
  // equivalente pro Traço guia, lido de MapConfig
  // (`tracoFotoReposicionarExtremidadesAtivo`, mesmo padrão/mesma seção "📷
  // Foto" de `medidaReposicionarExtremidadesAtivo` — ver mapconfig.js).
  // DESLIGADO por padrão, mesmo cuidado da Medida: um traço já inserido
  // fica fixo, evitando mexer sem querer.
  _tracoReposicionarExtremidadesAtivo: false,
  // Vértice de TRAÇO sendo arrastado agora — mesmo formato/mesma mecânica
  // de `_medidaDragging` logo abaixo, só que pra `_current.tracos`/
  // `_tracoDraft` (ver _hitTestTracoVertex).
  _tracoDragging: null,
  // Vértice sendo arrastado agora (pointerdown num vértice — ver
  // _attachPanZoom) — pedido do usuário: "Para cada um dos 2 vértices da
  // reta inserido, deve ser possível reposicionar o ponto" (vale tanto pro
  // rascunho em progresso quanto pra uma medida JÁ salva, a qualquer momento
  // com a ferramenta visível). `{ kind:'draft'|'saved', medidaId, which, pointerId }`.
  _medidaDragging: null,
  // [15/09/2026 UTC] NOVO — pedido verbatim: "Quando estiver selecionado o
  // botão 'Reposicionar pontas' [...], ao clicar em cima da reta ('Medida'
  // ou 'Traço guia'), um botão de mover pequeno deve ficar próximo dela
  // possibilitando mover a reta preservando a sua inclinação e
  // comprimento." Arraste da RETA INTEIRA (translação pura — os dois
  // vértices se movem juntos pela MESMA distância, preservando ângulo e
  // comprimento), como um complemento ao arraste de vértice individual
  // já existente (_medidaDragging/_tracoDragging, acima) — só entra em
  // jogo quando o toque foi na LINHA (não numa ponta) e "Reposicionar
  // pontas" está ligado, ver _hitTestMedidaLine/_hitTestTracoLine no
  // pointerdown de _attachPanZoom. Formato:
  // `{ medidaId, aInicial, bInicial, worldInicial:{x,y}, pointerId, moved,
  //    handleScreen:{x,y} }` — `aInicial`/`bInicial` são cópias dos pontos
  // NO MOMENTO em que o arraste começou (a translação é sempre calculada a
  // partir deles + o delta acumulado do ponteiro, nunca incrementalmente
  // frame a frame, pra não acumular erro de arredondamento). `handleScreen`
  // é a posição de tela do "botão de mover pequeno" pedido — desenhado por
  // `_drawLineMoveHandleAmb`, chamada de dentro de render().
  _medidaLineDragging: null,
  _tracoLineDragging: null,
  // NOVO (05/09/2026), pedido verbatim: "assim como na ferramenta 'Trena'
  // (em 'Mapa'->'Planta baixa') um círculo aparece quando o cursor está em
  // cima e enquanto move a medida, faça isso também ali para a 'Medida' e
  // o 'Traço guia', em 'Mapa'->'Foto'." Mesmo princípio de mapview.js
  // `_medidaVertexHover` — ponta sob o cursor AGORA (fora de um arraste,
  // ver _hitTestMedidaVertex/_hitTestTracoVertex, chamados em pointermove)
  // só pra destacar; `null` fora disso. Sufixo "Amb" (de AmbientePhotos)
  // só pra não colidir de leitura com o campo homônimo de mapview.js (são
  // objetos diferentes, sem colisão real, mas o sufixo deixa claro que é
  // este arquivo). Ver _drawVertexHighlightAmb/_ensureVertexHighlightLoop.
  _medidaVertexHoverAmb: null,
  _tracoVertexHoverAmb: null,
  _vertexHighlightRaf: null,
  // Modo "vincular um patrimônio recém-cadastrado a uma posição numa foto"
  // (opção "📷 Vincular a uma posição em uma foto" do modal de vínculo de
  // item — ver js/app.js _openItemLinkModal/enterOrbPlacementForItem
  // abaixo, task #109): enquanto `_pendingOrbItemId` estiver preenchido, o
  // PRÓXIMO orb marcado (ver _placeOrbAt) usa este id DIRETO, sem passar
  // pelo seletor normal de item (_pickItem) — é um fluxo de "marcar UM orb
  // pra ESTE item específico e sair", não o modo repetitivo de sempre
  // (marcar vários orbs, escolhendo o item toda vez). `_pendingOrbOnDone`/
  // `_pendingOrbOnCancel` espelham onCancel/onDone recebidos por
  // enterOrbPlacementForItem.
  _pendingOrbItemId: null,
  _pendingOrbOnDone: null,
  _pendingOrbOnCancel: null,
  _onExit: null,
  _onKeyDown: null,
  _onResize: null,
  _topbarObserver: null,
  // NOVO (08/09/2026), ITEM 10 (rodada de 11 itens) — ver comentário
  // grande onde é criado, mais abaixo.
  _canvasObserver: null,
  // true logo depois de um clique-e-arraste na faixa de fotos (ver
  // _attachStripDragScroll) — usado só pra o clique que o navegador dispara
  // ao soltar o botão não ser interpretado como "selecionar esta foto".
  _stripJustDragged: false,
  // Última foto selecionada — de propósito fora de open()/close() (que
  // resetam _current) para sobreviver a um fechar/reabrir da tela de Fotos:
  // sem isto, toda reabertura voltava sempre pra 1ª foto (a mais antiga),
  // mesmo que o usuário tivesse acabado de escolher outra. Antes guardado
  // POR ambiente (dict id→fotoId, de quando existiam vários ambientes); como
  // agora só existe um mapa, sempre (ver DB.getOrCreateSingleMap), virou um
  // valor escalar só.
  _lastSelectedPhotoId: null,
  // true quando esta tela foi aberta a partir de um clique numa miniatura
  // de foto em "Mapa" → "Organizar" (ver organizeview.js, _abrirFoto —
  // passa `fromOrganizar: true`) — enquanto isso, um botão de retorno fica
  // à esquerda da tela (ver _renderVoltarOrganizarBtn), voltando direto pro
  // Organizar; só some quando esta tela é fechada (ver close()/pedido do
  // usuário: "só desaparece quando é clicado em 'fechar'" — como fechar
  // remove a tela inteira, o botão some junto).
  _voltarParaOrganizar: false,

  MIN_ZOOM: 0.02,
  // Antes 14 — não deixava chegar perto o bastante pra conferir detalhe
  // fino/posicionar um orb com precisão numa foto grande (ver mesmo valor
  // em organizeview.js, de propósito igual aqui).
  MAX_ZOOM: 100, // mantido igual ao MAX_ZOOM de organizeview.js, de propósito — ver
                 // comentário grande no topo daquele arquivo, item (j).

  /** `focusNorm` (NOVO, rodada 55/v309 do Organizar — item 6 do feedback do
   *  usuário, verbatim: "se clicar em cima de uma bolinha na foto, a foto
   *  deve ser aberta com foto naquela região da foto") — `{x, y}`
   *  normalizados (0..1, mesmo sistema de `orb.xNorm/yNorm`) opcional; se
   *  presente, a foto abre já centralizada/aproximada ali (ver
   *  `_selectPhoto`) em vez do enquadramento padrão (`_fitToScreen`, foto
   *  inteira visível). */
  // ATUALIZADO (08/09/2026), pedido verbatim: "Isso deve ser configurável
  // em alguma seção das 'configurações do app', se ao selecionar a tela que
  // será exibida, irá abrir em tela cheia ou não [...] por padrão, todas
  // devem ocupar apenas o espaço da divisão, não a tela cheia (como o que
  // está acontecendo com o 'Organizar' e o 'Foto')." Novo opt `container`
  // (opcional): quando informado (ver js/bsplayout.js, EDITOR_TYPES.foto),
  // o overlay é anexado DENTRO dele em vez de `document.body` — o CSS de
  // `position:fixed; inset:0` do overlay (linha abaixo) não precisa mudar
  // NADA, porque `.bsp-leaf-body` (container da divisão) ganhou
  // `transform: translateZ(0)` (css/style.css), virando "containing block"
  // de `position:fixed` pra tudo dentro dela (truque padrão do CSS).
  async open(map, { onExit, startPhotoId, fromOrganizar, focusNorm, highlightOrbId, returnToLabel, container } = {}) {
    if (this._overlayEl) return; // já aberto
    // Guarda defensiva — na prática nunca deveria disparar: com o mapa
    // único (ver DB.getOrCreateSingleMap), quem chama open() sempre tem um
    // `map` em mãos, sem precisar mais "escolher ou criar um ambiente".
    if (!map) { Utils.toast('Mapa ainda não carregado — tente novamente em instantes.', { type: 'warn' }); return; }
    this._map = map;
    this._onExit = onExit || (() => {});
    // NOVO (04/09/2026), "sistematização da pilha de retorno" — quando esta
    // tela foi aberta por um caminho que não é o padrão 'Mapa'->'Foto' (ver
    // App.verMarcacaoEmFoto/MapView._showScreen), `returnToLabel` traz o
    // nome da tela de origem; o botão de fechar (#ambphotos-close) troca de
    // rótulo pra deixar claro que "fechar" aqui volta pra lá, não pro Mapa.
    this._returnToLabel = returnToLabel || null;
    this._current = null;
    this._img = null;
    this._placingOrb = false;
    this._deletingOrb = false;
    this._medidaSidemenuOpen = false;
    // ATUALIZADO (05/09/2026), pedido verbatim: "Agora ficam sempre
    // habilitados por padrão os botões da bandeja do botão lateral." — os 2
    // masters ("📏 Medidas"/"✏️ Traço guia") nascem LIGADOS a cada abertura
    // da tela (antes nasciam `false`, exigindo tocar o botão da bandeja 1x
    // antes das fileiras "Adicionar/Apagar" aparecerem).
    this._medidasVisiveis = true;
    this._placingMedida = false;
    this._deletingMedida = false;
    this._medidaDraft = null;
    this._medidaDragging = null;
    this._tracosVisiveis = true;
    this._placingTraco = false;
    this._deletingTraco = false;
    this._tracoDraft = null;
    this._tracoDragging = null;
    // [10/09/2026] NOVO (correção da rodada anterior) — pedido verbatim:
    // "coloque um botão com o ícone do 'alfinete vermelho' (📍) [...] é
    // para ativar/desativar os 2 botões que já estão presentes nesta tela
    // ('Mapa'->'Foto'), os botões '📍 Adicionar orb' (id=ambphotos-mode-
    // orb) e '🗑️ Apagar orb' (id=ambphotos-mode-del)." Master switch,
    // MESMO padrão/mesmos nomes de `_medidasVisiveis`/`_tracosVisiveis`
    // acima (nasce `true` — mesma decisão já tomada pros outros masters em
    // 05/09/2026: os botões ficam habilitados por padrão) — só que aqui
    // não há fileira própria pra revelar (os 2 botões JÁ EXISTEM dentro de
    // `#ambphotos-controls`, ver HTML mais abaixo); o switch só alterna a
    // classe `hidden` de cada um dos 2 individualmente, ver
    // `_toggleMarcacoesPatrimonioVisiveis`/`_updateMarcacoesPatrimonioVisibility`.
    this._marcacoesPatrimonioVisiveis = true;
    // Defensivo: um open() "normal" (não vindo de enterOrbPlacementForItem)
    // nunca deve herdar um pedido pendente de rodadas anteriores. Quando ESTA
    // chamada de open() é a própria enterOrbPlacementForItem, ela roda ANTES
    // de setar estes campos de novo (ver enterOrbPlacementForItem abaixo),
    // então não há conflito.
    this._pendingOrbItemId = null;
    this._pendingOrbOnDone = null;
    this._pendingOrbOnCancel = null;
    this._voltarParaOrganizar = !!fromOrganizar;
    // NOVO (04/09/2026), pedido verbatim: "'Marcação em foto'... destaca
    // visualmente o orb do patrimônio naquela foto." — id do orb a
    // destacar (ver _startOrbHighlight/_drawOrb) quando esta chamada de
    // open() veio do botão novo na ficha do item (app.js
    // App.verMarcacaoEmFoto). `null` no caso normal (aberto por 'Mapa'->
    // 'Foto'/miniatura/etc.), sem destaque nenhum.
    this._highlightOrbId = null;
    if (this._highlightRaf) { cancelAnimationFrame(this._highlightRaf); this._highlightRaf = null; }

    // "📷 Foto" (⚙️ Configurações do mapa › contexto 2D — pedido do usuário,
    // 26/08/2026): "seta nas extremidades" e "manter o círculo depois de
    // inserir" pras medidas — ver _drawMedida/mapconfig.js DEFAULTS.
    // medidaSetasAtivo/medidaCirculoAposInserirAtivo. Lido de MapConfig (não
    // hardcoded) e reassinado ao vivo caso a configuração mude com esta tela
    // já aberta, mesmo padrão de mapview.js _onMapConfigChange. O círculo vem
    // DESLIGADO por padrão (pedido do usuário, 26/08/2026 — 3ª rodada) — só a
    // seta (`_medidaSetasAtivo`) continua ligada por padrão.
    // `_medidaReposicionarExtremidadesAtivo` (NOVO, pedido do usuário,
    // 28/08/2026): se uma medida JÁ SALVA (não o rascunho em progresso) pode
    // ter suas pontas arrastadas — ver _hitTestMedidaVertex. DESLIGADO por
    // padrão: uma medida inserida fica fixa, evitando mexer nela sem querer.
    this._medidaSetasAtivo = true;
    this._medidaCirculoAposInserirAtivo = false;
    this._medidaReposicionarExtremidadesAtivo = false;
    this._tracoReposicionarExtremidadesAtivo = false;
    if (typeof MapConfig !== 'undefined') {
      const cfgMedida = await MapConfig.get();
      this._medidaSetasAtivo = cfgMedida.medidaSetasAtivo !== false;
      this._medidaCirculoAposInserirAtivo = !!cfgMedida.medidaCirculoAposInserirAtivo;
      this._medidaReposicionarExtremidadesAtivo = !!cfgMedida.medidaReposicionarExtremidadesAtivo;
      this._tracoReposicionarExtremidadesAtivo = !!cfgMedida.tracoFotoReposicionarExtremidadesAtivo;
      this._onMapConfigChangeMedidas = (c) => {
        this._medidaSetasAtivo = c.medidaSetasAtivo !== false;
        this._medidaCirculoAposInserirAtivo = !!c.medidaCirculoAposInserirAtivo;
        this._medidaReposicionarExtremidadesAtivo = !!c.medidaReposicionarExtremidadesAtivo;
        this._tracoReposicionarExtremidadesAtivo = !!c.tracoFotoReposicionarExtremidadesAtivo;
        // BUG CORRIGIDO (05/09/2026) — ver comentário grande no HTML (fileira
        // de Medidas) sobre a troca do botão único por dois independentes.
        this._updateMedidaReposicionarBtn();
        this._updateTracoReposicionarBtn();
        this.render();
      };
      MapConfig.onChange(this._onMapConfigChangeMedidas);
    }

    const overlay = document.createElement('div');
    overlay.id = 'ambphotos-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:900; background:#05070a; overflow:hidden';
    overlay.innerHTML = `
      <canvas id="ambphotos-canvas" style="position:absolute; inset:0; width:100%; height:100%; touch-action:none; display:block"></canvas>
      <div class="camera-topbar ambphotos-topbar">
        <div class="ambphotos-topbar-row">
          <button class="icon-btn ambphotos-btn-close" id="ambphotos-close" title="${this._returnToLabel ? `Voltar para ${Utils.escapeHtml(this._returnToLabel)}` : 'Fechar e voltar para o mapa'}">${this._returnToLabel ? `← Voltar para ${Utils.escapeHtml(this._returnToLabel)}` : '✕ Fechar'}</button>
          <div class="ambphotos-topbar-center">
            <button class="icon-btn" id="ambphotos-add" title="Tirar/adicionar uma foto deste ambiente (no celular, use o modo panorama da câmera para fotos mais amplas)">📷 Adicionar foto</button>
            <button type="button" class="ambphotos-caption hidden" id="ambphotos-caption" title="Toque para dar um nome a esta foto">
              <span id="ambphotos-caption-text">Sem nome</span>
              <span class="ic">✏️</span>
            </button>
          </div>
          <button class="icon-btn" id="ambphotos-download-current" title="Baixar esta foto (arquivo de imagem)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M6 11l6 6 6-6"/><path d="M5 21h14"/></svg>
          </button>
          <!-- NOVO (03/09/2026), pedido verbatim: "Deve ser possível editar
               a vinculação da foto no mapa em 'Mapa'->'Foto' e adicionar,
               caso ainda não tenha." — reaproveita o MESMO fluxo de
               cruz+"Marcar aqui" já usado ao vincular pela 1ª vez (ver
               MapView.enterPhotoPlacementMode/_confirmPhotoPlacement) — o
               título/rótulo do botão troca entre "Vincular"/"Editar
               vínculo" conforme a foto já tem posição ou não (ver
               _updateMapLinkBtn, chamado por _selectPhoto/render). -->
          <button class="icon-btn" id="ambphotos-map-link" title="Vincular esta foto a um lugar no mapa">🗺️</button>
          <!-- NOVO (03/09/2026), pedido verbatim (item 2): "coloque também
               mais dois botões: um para ver no mapa 2D e outro para ver no
               mapa 3D. Ficam desabilitados se não houver posição definida
               ainda." — MESMO par de botões/fluxo do patrimônio (ver
               app.js showItemDetail #di-map-view2d/3d), habilitado/
               desabilitado por _updateMapLinkBtn junto com o botão 🗺️
               acima (mesma condição: mapaX/mapaY definidos). -->
          <button class="icon-btn" id="ambphotos-view2d" disabled title="Ver no mapa 2D">👁️2D</button>
          <button class="icon-btn" id="ambphotos-view3d" disabled title="Ver no mapa 3D">👁️3D</button>
        </div>
      </div>
      <button class="icon-btn ambphotos-btn-voltar-organizar ${this._voltarParaOrganizar ? '' : 'hidden'}" id="ambphotos-voltar-organizar" title="Voltar para 'Mapa' → 'Organizar', de onde você veio">↩️ Organizar</button>
      <div class="ambphotos-strip" id="ambphotos-strip"></div>
      <div class="ambphotos-empty" id="ambphotos-empty">
        <div class="ic">🖼️</div>
        <p>Nenhuma foto deste ambiente ainda.</p>
        <p class="d">Toque em "📷 Adicionar foto" para tirar (ou escolher) uma foto do lugar. Depois dá pra dar zoom, mover e marcar pontos (orbs) ligados a cada item.</p>
      </div>
      <!-- Menu recolhível lateral direito (pedido do usuário, 26/08/2026):
           "no meio da lateral direita da tela deve haver um botão
           (transparente com uma setinha) que ativa um menu recolhível" — hoje
           só tem a ferramenta "📏 Medidas" dentro, mas fica pronto pra crescer
           sem disputar espaço com a fileira de baixo (orbs/medidas) nem com o
           topo (já cheio de botões). Ver _toggleMedidaSidemenu. -->
      <button type="button" class="ambphotos-sidemenu-toggle" id="ambphotos-sidemenu-toggle" title="Mais ferramentas">◀</button>
      <div class="ambphotos-sidemenu" id="ambphotos-sidemenu">
        <button type="button" class="icon-btn ambphotos-sidemenu-btn" id="ambphotos-medida-toggle" title="Medidas: marcar uma reta entre dois pontos da foto, para referência de medição">📏</button>
        <!-- ATUALIZADO (05/09/2026), pedido verbatim: "refaça do zero
             baseado nas ferramentas 'Trena' e 'Traço guia' do mapa 2D" —
             "traço guia" virou um master switch de verdade (mesma estrutura
             de "📏 Medidas" acima, ver _toggleTracosVisiveis), com uma
             fileira própria "Adicionar/Apagar traço guia" (ver
             #ambphotos-traco-controls abaixo) em vez do único botão de
             antes que já desenhava direto. -->
        <button type="button" class="icon-btn ambphotos-sidemenu-btn" id="ambphotos-traco-toggle" title="Traço guia: linha reta tracejada, só como referência visual (não mede nada)">✏️</button>
        <!-- [10/09/2026] CORRIGIDO — o botão "🖼️ Orb" (e a fileira
             #ambphotos-orb-controls com "Adicionar/Apagar orb" ligados a
             _openMapLinkFlow/_removerOrbDoMapa) que morava aqui foi
             REMOVIDO por pedido verbatim do usuário: "o novo botão que
             você colocou ('Orb do Mapa') deve ser removido" — confusão com
             os botões "📍 Adicionar orb"/"🗑️ Apagar orb" JÁ EXISTENTES
             desde antes (ids #ambphotos-mode-orb/#ambphotos-mode-del, ver
             fileira #ambphotos-controls mais abaixo — "as marcações de
             patrimônio", um recurso totalmente diferente: marcar um
             patrimônio DENTRO da foto, não vincular a FOTO a um lugar no
             mapa). No lugar do botão errado, este aqui (📍, alfinete
             vermelho) é um master switch (MESMO padrão de "📏 Medidas"/
             "✏️ Traço guia" acima, ver _toggleMarcacoesPatrimonioVisiveis)
             que só MOSTRA/ESCONDE aqueles 2 botões PRÉ-EXISTENTES — nenhum
             botão/fluxo novo de vínculo ao mapa é recriado aqui. -->
        <button type="button" class="icon-btn ambphotos-sidemenu-btn" id="ambphotos-marcpin-toggle" title="Marcações de patrimônio: mostra/esconde os botões '📍 Adicionar orb'/'🗑️ Apagar orb' da bandeja de baixo">📍</button>
        <!-- [10/09/2026] NOVO — pedido verbatim: "um botão pra ativar a
             calibração do vanishCam na foto selecionada." Ação direta (sem
             fileira própria, sem estado "ligado/desligado" — mesmo espírito
             de um botão comum, não um master switch) que reaproveita o
             MESMO ponto de entrada já usado pelo mapa 2D (botão "📐 linhas
             de referência" dentro do painel "📷 Definir Câmera" do orb de
             foto/câmera) — ver MapView._openVanishCamScreen, chamada direto
             daqui em _abrirVanishCamAtual, sem duplicar nenhuma lógica da
             tela do vanishCam. -->
        <button type="button" class="icon-btn ambphotos-sidemenu-btn" id="ambphotos-vanishcam-btn" title="Definir câmera por linhas de referência (vanishCam) para a foto selecionada">📐</button>
      </div>
      <div class="ambphotos-controls-wrap" id="ambphotos-controls-wrap">
        <!-- Fileira de "Medidas" (pedido do usuário, 26/08/2026) — só existe
             (some por completo, junto com as próprias medidas desenhadas na
             foto, ver render()/_drawMedida) enquanto "📏 Medidas" (menu
             lateral acima) estiver ativo. MESMO estilo dos botões de orb
             logo abaixo (.icon-btn simples) — pedido explícito do usuário:
             "no mesmo estilo que os botões do 'orb'".
             BUG CORRIGIDO (05/09/2026), pedido verbatim: "Acabei não
             conseguindo reposicionar o traço guia que inseri, não apareceu
             os círculos nas pontas." Causa raiz: havia um ÚNICO botão
             "Reposicionar pontas" (menu lateral, id ambphotos-reposicionar-
             toggle, removido agora) compartilhado pelas duas ferramentas,
             que aplicava o toque à ferramenta ativa com PRIORIDADE fixa pra
             "📏 Medidas" (checava _medidasVisiveis primeiro, só caindo pro
             Traço guia num 'else if') — desde que os dois masters passaram
             a nascer LIGADOS por padrão (mesma rodada, ver _medidasVisiveis/
             _tracosVisiveis em open()), esse botão único NUNCA mais
             conseguia alcançar o ramo do Traço guia (a condição de Medidas
             já era sempre verdadeira), então o campo que liga o
             reposicionamento do Traço guia ficava para sempre desligado e
             o teste/desenho dos vértices do Traço nunca encontravam/
             desenhavam nada — os círculos "não apareciam" porque o toque no
             botão nunca de fato ligava o reposicionamento do Traço.
             Corrigido virando DOIS botões INDEPENDENTES ("🎯 Reposicionar
             pontas"), um dentro de cada fileira própria (Medidas/Traço
             guia) — ver _toggleMedidaReposicionar/_toggleTracoReposicionar
             mais abaixo, sem ambiguidade nenhuma sobre qual ferramenta está
             sendo ligada. -->
        <div class="camera-controls ambphotos-medida-controls hidden" id="ambphotos-medida-controls" style="grid-template-columns:repeat(3,1fr); display:grid; gap:6px">
          <button class="icon-btn" id="ambphotos-medida-add" title="Adicionar medida: toque em 2 pontos da foto para marcar uma reta de medição entre eles">📏 Adicionar medida</button>
          <button class="icon-btn" id="ambphotos-medida-del" title="Apagar medida: toque numa medida da foto para removê-la">🗑️ Apagar medida</button>
          <button class="icon-btn" id="ambphotos-medida-reposicionar" title="Reposicionar pontas: toque numa ponta de uma medida já inserida pra movê-la">🎯 Reposicionar pontas</button>
        </div>
        <!-- NOVO (05/09/2026), pedido verbatim: "Quando for o 'Traço guia',
             deve aparecer 'Adicionar traço guia' e 'Apagar traço guia'.
             Serve como habilitador de desenho [...] Agora vai ter." — MESMA
             estrutura/estilo da fileira de Medidas acima, só existe (ver
             _updateTracoControlsVisibility) enquanto "✏️ Traço guia" (menu
             lateral) estiver ligado E houver pelo menos uma foto. Ganhou seu
             PRÓPRIO botão "🎯 Reposicionar pontas" (ver comentário grande
             acima, na fileira de Medidas, sobre o bug corrigido). -->
        <div class="camera-controls ambphotos-traco-controls hidden" id="ambphotos-traco-controls" style="grid-template-columns:repeat(3,1fr); display:grid; gap:6px">
          <button class="icon-btn" id="ambphotos-traco-add" title="Adicionar traço guia: toque em 2 pontos da foto para desenhar uma linha reta tracejada de referência">✏️ Adicionar traço guia</button>
          <button class="icon-btn" id="ambphotos-traco-del" title="Apagar traço guia: toque num traço da foto para removê-lo">🗑️ Apagar traço guia</button>
          <button class="icon-btn" id="ambphotos-traco-reposicionar" title="Reposicionar pontas: toque numa ponta de um traço já inserido pra movê-lo">🎯 Reposicionar pontas</button>
        </div>
        <!-- [10/09/2026] REMOVIDO — a fileira "🖼️ Orb" (#ambphotos-orb-
             controls, "Adicionar/Apagar orb" ligados a _openMapLinkFlow/
             _removerOrbDoMapa) que morava aqui foi removida por pedido
             verbatim do usuário (ver comentário grande no botão do menu
             lateral, acima). Os botões PRÉ-EXISTENTES "📍 Adicionar orb"/
             "🗑️ Apagar orb" (ids #ambphotos-mode-orb/#ambphotos-mode-del,
             logo abaixo, dentro de #ambphotos-controls) continuam exatamente
             como sempre foram — "as marcações de patrimônio" — só que agora
             cada um ganhou a classe 'hidden' alternável individualmente
             pelo novo master switch "📍" do menu lateral
             (_toggleMarcacoesPatrimonioVisiveis/_updateMarcacoesPatrimonioVisibility,
             mais abaixo), SEM esconder o 3º botão desta mesma fileira
             (#ambphotos-download-all, "Baixar todas .zip" — recurso
             totalmente à parte, que precisa continuar sempre visível; por
             isso o toggle mexe nos 2 botões INDIVIDUALMENTE, nunca no
             elemento pai inteiro). -->
        <div class="camera-controls" id="ambphotos-controls" style="grid-template-columns:repeat(3,1fr); display:grid; gap:6px">
          <button class="icon-btn" id="ambphotos-mode-orb" title="Adicionar orb: toque na foto onde está o item, para associá-lo a um patrimônio">📍 Adicionar orb</button>
          <button class="icon-btn" id="ambphotos-mode-del" title="Apagar orb: toque num orb da foto para removê-lo (não apaga o item, só a marcação nesta foto)">🗑️ Apagar orb</button>
          <button class="icon-btn" id="ambphotos-download-all" title="Baixar todas as fotos deste ambiente juntas, num arquivo .zip">⬇️ Baixar todas (.zip)</button>
        </div>
      </div>
      <input type="file" id="ambphotos-file" accept="image/*" capture="environment" multiple style="display:none">
    `;
    this._confinedContainer = container || null;
    (container || document.body).appendChild(overlay);
    this._overlayEl = overlay;
    this._canvas = overlay.querySelector('#ambphotos-canvas');
    this._ctx = this._canvas.getContext('2d');

    overlay.querySelector('#ambphotos-close').onclick = () => this.close();
    overlay.querySelector('#ambphotos-map-link').onclick = () => this._openMapLinkFlow();
    // NOVO (03/09/2026), pedido verbatim (item 2) — reaproveita EXATAMENTE
    // os mesmos helpers do item 1 (App.verNoMapa2D/verNoMapa3D/
    // pickFlightMode3D — ver app.js), só trocando de onde vem a posição
    // (mapaX/mapaY/mapaAltura da FOTO, em vez do item). `this._map.id` é o
    // ambiente desta tela — mesmo já sendo o mapa aberto no momento (o 2D/
    // 3D navegado pra cá troca pra ele de qualquer forma, ver
    // App.verNoMapa2D/3D, mesmo tratamento do item 4).
    overlay.querySelector('#ambphotos-view2d').onclick = async () => {
      if (!this._current) return;
      const pos = { x: this._current.mapaX, y: this._current.mapaY, ambienteId: this._map?.id };
      this._onExit = null; // mesmo cuidado de _openMapLinkFlow acima — quem assume a navegação é o App.verNoMapa2D
      this.close();
      await App.verNoMapa2D(pos);
    };
    overlay.querySelector('#ambphotos-view3d').onclick = async () => {
      if (!this._current) return;
      const pos = { x: this._current.mapaX, y: this._current.mapaY, z: this._current.mapaAltura, ambienteId: this._map?.id };
      this._onExit = null;
      this.close();
      await App.verNoMapa3D(pos);
    };
    overlay.querySelector('#ambphotos-voltar-organizar').onclick = () => {
      this.close();
      // OrganizeView já preserva pan/zoom/config de antes (ver
      // organizeview.js, _hasOpenedBefore) — reabrir aqui volta pro EXATO
      // ponto de onde a miniatura foi clicada, não reenquadra do zero.
      // NOVO (07/09/2026), pedido verbatim: "inquebrável, tudo com estrutura
      // try{}catch(){}..." — ver mesmo tratamento em mapview.js
      // _openOrganizeView (o outro ponto de entrada de OrganizeView.open()).
      try {
        OrganizeView.open();
      } catch (err) {
        if (typeof ModuleHost !== 'undefined') ModuleHost.showLoadError('Organizar', err);
        else console.error('Falha ao abrir o Organizar:', err);
      }
    };
    overlay.querySelector('#ambphotos-add').onclick = () => overlay.querySelector('#ambphotos-file').click();
    overlay.querySelector('#ambphotos-file').onchange = (e) => this._onFilesChosen(e);
    overlay.querySelector('#ambphotos-mode-orb').onclick = () => this._toggleMode('orb');
    overlay.querySelector('#ambphotos-mode-del').onclick = () => this._toggleMode('del');
    overlay.querySelector('#ambphotos-sidemenu-toggle').onclick = () => this._toggleMedidaSidemenu();
    overlay.querySelector('#ambphotos-medida-toggle').onclick = () => this._toggleMedidasVisiveis();
    overlay.querySelector('#ambphotos-medida-add').onclick = () => this._toggleMedidaMode('add');
    overlay.querySelector('#ambphotos-medida-del').onclick = () => this._toggleMedidaMode('del');
    overlay.querySelector('#ambphotos-traco-toggle').onclick = () => this._toggleTracosVisiveis();
    overlay.querySelector('#ambphotos-traco-add').onclick = () => this._toggleTracoMode('add');
    overlay.querySelector('#ambphotos-traco-del').onclick = () => this._toggleTracoMode('del');
    // BUG CORRIGIDO (05/09/2026) — dois botões independentes, um em cada
    // fileira, em vez do único botão ambíguo de antes (ver comentário grande
    // no HTML, fileira de Medidas).
    overlay.querySelector('#ambphotos-medida-reposicionar').onclick = () => this._toggleMedidaReposicionar();
    overlay.querySelector('#ambphotos-traco-reposicionar').onclick = () => this._toggleTracoReposicionar();
    // [10/09/2026] CORRIGIDO — master switch "📍" (ver comentário grande no
    // HTML) — não os botões "Adicionar/Apagar orb" errados de antes (esses
    // já têm o próprio onclick de sempre, `#ambphotos-mode-orb`/`#ambphotos-
    // mode-del` acima, intocado).
    overlay.querySelector('#ambphotos-marcpin-toggle').onclick = () => this._toggleMarcacoesPatrimonioVisiveis();
    overlay.querySelector('#ambphotos-vanishcam-btn').onclick = () => this._abrirVanishCamAtual();
    // ATUALIZADO (05/09/2026), pedido verbatim: "Agora ficam sempre
    // habilitados por padrão os botões da bandeja do botão lateral." — os 2
    // masters já nascem `true` (ver this._medidasVisiveis/_tracosVisiveis
    // acima), então a UI precisa refletir isso já na 1ª montagem da tela
    // (botões da bandeja "pressionados" + fileiras "Adicionar/Apagar"
    // visíveis), sem precisar de um toque manual em "📏"/"✏️" primeiro.
    overlay.querySelector('#ambphotos-medida-toggle')?.classList.toggle('active', this._medidasVisiveis);
    overlay.querySelector('#ambphotos-traco-toggle')?.classList.toggle('active', this._tracosVisiveis);
    this._updateMedidaControlsVisibility();
    this._updateTracoControlsVisibility();
    this._updateMedidaReposicionarBtn(); // estado inicial de cada botão (ver comentário grande no HTML)
    this._updateTracoReposicionarBtn();
    // [10/09/2026] NOVO — mesmo tratamento de estado inicial acima, pro
    // master switch "📍" (ver comentário grande no HTML).
    overlay.querySelector('#ambphotos-marcpin-toggle')?.classList.toggle('active', this._marcacoesPatrimonioVisiveis);
    this._updateMarcacoesPatrimonioVisibility();
    overlay.querySelector('#ambphotos-caption').onclick = () => this._renameCurrentPhoto();
    overlay.querySelector('#ambphotos-download-current').onclick = () => this._downloadCurrentPhoto();
    overlay.querySelector('#ambphotos-download-all').onclick = () => this._downloadAllPhotosZip();
    overlay.querySelector('#ambphotos-strip').addEventListener('click', (e) => this._onStripClick(e));
    this._attachStripDragScroll(overlay.querySelector('#ambphotos-strip'));

    // A faixa de fotos (.ambphotos-strip) fica presa logo abaixo do
    // cabeçalho — mas o cabeçalho pode ocupar 1 ou 2 linhas dependendo da
    // largura (ver .ambphotos-topbar-center) e do tamanho do nome da foto.
    // Um "top" fixo no CSS não acompanha isso: quando o cabeçalho crescia
    // (2ª linha), a faixa ficava sobreposta a ele — no celular, por exemplo,
    // o quadrado de uma foto recém-tirada acabava cobrindo o botão
    // "Adicionar foto". O ResizeObserver mede a altura real do cabeçalho
    // toda vez que ela muda e reposiciona a faixa logo abaixo dele.
    const topbarEl = overlay.querySelector('.camera-topbar');
    this._syncStripOffset();
    if (typeof ResizeObserver !== 'undefined' && topbarEl) {
      this._topbarObserver = new ResizeObserver(() => this._syncStripOffset());
      this._topbarObserver.observe(topbarEl);
    }

    this._canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    this._attachPanZoom(this._canvas);

    // NOVO (08/09/2026), pedido verbatim (ITEM 10 da rodada de 11 itens):
    // "Na tela 'Foto', ao redimensionar a foto redimensiona junto, não é
    // para isso acontecer." CAUSA RAIZ: o único listener que resincroniza
    // a RESOLUÇÃO do `<canvas>` (`this._onResize`, ver mais abaixo) só
    // escuta o evento `resize` da JANELA do navegador — redimensionar uma
    // DIVISÃO do Workspace (arrastar um divisor do BSPLayout, ver
    // js/bsplayout.js) muda o tamanho CSS deste elemento sem a janela em
    // si mudar de tamanho nenhuma, então esse evento nunca disparava
    // nesse caso. Sem ninguém chamando `_resizeCanvas()` de novo, os
    // atributos `width`/`height` do `<canvas>` (a RESOLUÇÃO real do
    // bitmap desenhado) ficavam travados no tamanho de quando a tela
    // abriu, enquanto o tamanho VISUAL em CSS (`width:100%; height:100%`)
    // acompanhava a divisão — um `<canvas>` cujo atributo width/height não
    // bate com seu tamanho CSS é ESTICADO/ACHATADO pelo navegador pra
    // caber (mesmo comportamento de esticar um `<img>`), dando exatamente
    // a aparência de "a foto redimensiona junto" (distorcida, não só
    // mostrando mais/menos área). CORRIGIDO com um `ResizeObserver` de
    // verdade no próprio `<canvas>` (mesmo padrão já usado por
    // `_topbarObserver`, poucas linhas acima) — chama `render()` (que já
    // resincroniza width/height ANTES de desenhar, ver `_resizeCanvas()`)
    // toda vez que o TAMANHO REAL do elemento muda, não importa a causa
    // (janela, divisor do Workspace, rotação de tela). `this._view.zoom`/
    // `cx`/`cy` (o "quanto" e "onde" do zoom/pan atual) NÃO são tocados
    // aqui — só o BUFFER do canvas é resincronizado — então redimensionar
    // passa a só mostrar mais/menos área visível (como redimensionar uma
    // janela sobre uma imagem com zoom fixo), nunca esticar/encolher a
    // foto em si. Desconectado em `close()` (mesmo padrão de
    // `_topbarObserver`).
    if (typeof ResizeObserver !== 'undefined') {
      this._canvasObserver = new ResizeObserver(() => this.render());
      this._canvasObserver.observe(this._canvas);
    }

    this._onKeyDown = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._onKeyDown);

    this._photos = await DB.getPhotosByAmbiente(map.id);
    this._renderStrip();
    if (this._photos.length) {
      // Prioridade: uma foto explicitamente pedida (ex: atalho vindo de uma
      // câmera do mapa) > a última selecionada neste ambiente > a 1ª da lista.
      const querida = startPhotoId || this._lastSelectedPhotoId;
      const alvo = (querida && this._photos.some((p) => p.id === querida)) ? querida : this._photos[0].id;
      // `focusNorm` só se aplica quando a foto ALVO é de fato a que foi
      // pedida por `startPhotoId` (não faz sentido aproximar numa posição
      // que pertence a OUTRA foto, caso `startPhotoId` não exista mais e o
      // fallback tenha escolhido outra).
      // NOVO (04/09/2026) — `highlightOrbId` sem `focusNorm` explícito (o
      // caller de "Marcação em foto" não sabe/não precisa calcular a
      // posição do orb) calcula `focusNorm` sozinho a partir do PRÓPRIO
      // orb (xNorm/yNorm), reaproveitando o mesmo mecanismo de "abrir já
      // aproximado" que organizeview.js já usa (ver comentário grande de
      // `focusNorm` acima) — só quando a foto alvo é de fato a pedida.
      let focusNormFinal = (focusNorm && alvo === startPhotoId) ? focusNorm : null;
      if (!focusNormFinal && highlightOrbId && alvo === startPhotoId) {
        const fotoAlvo = this._photos.find((p) => p.id === alvo);
        const orbAlvo = fotoAlvo?.orbs?.find((o) => o.id === highlightOrbId);
        if (orbAlvo) focusNormFinal = { x: orbAlvo.xNorm, y: orbAlvo.yNorm };
      }
      await this._selectPhoto(alvo, { focusNorm: focusNormFinal });
      if (highlightOrbId && alvo === startPhotoId) this._startOrbHighlight(highlightOrbId);
      Utils.toast('Toque num orb para ver o item. Toque e segure num orb para trocar ou remover a marcação.', { duration: 4500 });
    } else {
      this._updateTitle();
      this.render();
    }
  },

  close() {
    if (!this._overlayEl) return;
    // NOVO (04/09/2026) — pára a animação do anel de destaque (ver
    // _startOrbHighlight) ao fechar a tela, senão o requestAnimationFrame
    // continuaria rodando/chamando render() em cima de um canvas já
    // removido do DOM (a checagem `!this._overlayEl` dentro do laço já
    // cobria o `render()` em si — este cancelAnimationFrame só evita o
    // próximo quadro agendado à toa).
    if (this._highlightRaf) { cancelAnimationFrame(this._highlightRaf); this._highlightRaf = null; }
    this._highlightOrbId = null;
    // Fechar a tela (✕ Fechar, Esc, ou o próprio fim do fluxo em
    // _placeOrbAt) no MEIO de um "vincular item a uma posição em uma foto"
    // pendente (ver enterOrbPlacementForItem) conta como cancelar esse
    // vínculo especificamente — diferente do modo de posicionamento no mapa
    // 2D (ver mapview.js _unmountPlanta), aqui não existe uma "volta
    // silenciosa": fechar ESTA tela é a única forma de sair dela, então tem
    // que avisar quem pediu o vínculo (guardado atrás de `_pendingOrbItemId`
    // pra nunca disparar num fechamento normal, sem nada pendente — e já
    // limpo ANTES de chegar aqui pelo próprio caminho de sucesso em
    // _placeOrbAt, então não dispara de novo depois de um orb ser marcado).
    if (this._pendingOrbItemId) {
      const itemId = this._pendingOrbItemId;
      const cb = this._pendingOrbOnCancel;
      this._pendingOrbItemId = null;
      this._pendingOrbOnDone = null;
      this._pendingOrbOnCancel = null;
      cb?.(itemId);
    }
    this._closeMedidaValorModal();
    if (this._onMapConfigChangeMedidas && typeof MapConfig !== 'undefined') MapConfig.offChange(this._onMapConfigChangeMedidas);
    this._onMapConfigChangeMedidas = null;
    this._overlayEl.remove();
    this._overlayEl = null;
    this._confinedContainer = null;
    this._canvas = null;
    this._ctx = null;
    this._current = null;
    this._img = null;
    document.removeEventListener('keydown', this._onKeyDown);
    this._onKeyDown = null;
    window.removeEventListener('resize', this._onResize);
    this._onResize = null;
    this._topbarObserver?.disconnect();
    this._topbarObserver = null;
    this._canvasObserver?.disconnect();
    this._canvasObserver = null;
    const cb = this._onExit;
    this._onExit = null;
    cb?.();
  },

  // ---------- Modo (adicionar/apagar orb) ----------
  _toggleMode(mode) {
    // Os botões de alternar modo ficam desabilitados (ver
    // enterOrbPlacementForItem/_setPendingOrbButtonsDisabled) enquanto um
    // vínculo de item pendente está ativo, então isto na prática nunca
    // deveria disparar — mas mantido como segunda trava, defensivo.
    if (this._pendingOrbItemId) return;
    if (mode === 'orb') {
      this._placingOrb = !this._placingOrb;
      this._deletingOrb = false;
    } else if (mode === 'del') {
      this._deletingOrb = !this._deletingOrb;
      this._placingOrb = false;
    }
    this._overlayEl?.querySelector('#ambphotos-mode-orb')?.classList.toggle('active', this._placingOrb);
    this._overlayEl?.querySelector('#ambphotos-mode-del')?.classList.toggle('active', this._deletingOrb);
    if (this._placingOrb) Utils.toast('Adicionar orb: toque na foto onde está o item.', { duration: 3500 });
    else if (this._deletingOrb) Utils.toast('Apagar orb: toque num orb da foto para removê-lo.', { type: 'warn', duration: 3500 });
  },

  // ---------- "📏 Medidas" (pedido do usuário, 26/08/2026) ----------
  /** Abre/fecha só a GAVETA do menu lateral direito — não mexe em
   *  `_medidasVisiveis` (a ferramenta em si continua ligada/desligada do
   *  jeito que estava, mesmo fechando o painel — é só um espaço pra guardar
   *  o botão fora do caminho). */
  _toggleMedidaSidemenu() {
    this._medidaSidemenuOpen = !this._medidaSidemenuOpen;
    this._overlayEl?.querySelector('#ambphotos-sidemenu-toggle')?.classList.toggle('open', this._medidaSidemenuOpen);
    this._overlayEl?.querySelector('#ambphotos-sidemenu')?.classList.toggle('open', this._medidaSidemenuOpen);
    const btn = this._overlayEl?.querySelector('#ambphotos-sidemenu-toggle');
    if (btn) btn.textContent = this._medidaSidemenuOpen ? '▶' : '◀';
  },

  /** Master switch da ferramenta "📏 Medidas" (botão dentro do menu lateral)
   *  — pedido do usuário: "Não só os botões das medidas aparecem, mas também
   *  as próprias medidas, quando está ativado. Senão, nem os botões das
   *  medidas, nem as medidas devem aparecer." Desligar cancela qualquer
   *  rascunho em progresso e sai dos submodos adicionar/apagar — reentrar
   *  depois sempre começa "limpo", sem um modo escondido ainda ativo por trás. */
  _toggleMedidasVisiveis() {
    this._medidasVisiveis = !this._medidasVisiveis;
    if (!this._medidasVisiveis) {
      this._placingMedida = false;
      this._deletingMedida = false;
      this._medidaDraft = null;
      this._closeMedidaValorModal();
      this._overlayEl?.querySelector('#ambphotos-medida-add')?.classList.remove('active');
      this._overlayEl?.querySelector('#ambphotos-medida-del')?.classList.remove('active');
    }
    this._overlayEl?.querySelector('#ambphotos-medida-toggle')?.classList.toggle('active', this._medidasVisiveis);
    this._updateMedidaControlsVisibility();
    this._updateMedidaReposicionarBtn();
    this.render();
    Utils.toast(this._medidasVisiveis ? '📏 Medidas ativadas.' : '📏 Medidas desativadas.', { duration: 2000 });
  },

  /** Mostra/esconde a fileira "Adicionar/Apagar medida" — só aparece com a
   *  ferramenta ativa E pelo menos uma foto carregada (mesma condição já
   *  usada pra fileira de orbs, ver _renderStrip). Chamada tanto por
   *  _toggleMedidasVisiveis quanto por _renderStrip (a lista de fotos pode
   *  zerar/deixar de zerar a qualquer momento). */
  _updateMedidaControlsVisibility() {
    const show = this._medidasVisiveis && this._photos.length > 0;
    this._overlayEl?.querySelector('#ambphotos-medida-controls')?.classList.toggle('hidden', !show);
  },

  /** "➕ Adicionar medida" / "🗑️ Apagar medida" — mesmo padrão de _toggleMode
   *  (orbs), só que restrito a quando a ferramenta "📏 Medidas" está ligada.
   *  Trocar de submodo (ou ligar um deles) sempre descarta um rascunho de
   *  medida em progresso — evita um rascunho "esquecido" de um modo anterior
   *  reaparecendo depois de mexer no outro. */
  _toggleMedidaMode(mode) {
    if (!this._medidasVisiveis) return; // defensivo — os botões só existem visíveis com a ferramenta ligada
    this._medidaDraft = null;
    this._closeMedidaValorModal();
    if (mode === 'add') {
      this._placingMedida = !this._placingMedida;
      this._deletingMedida = false;
      if (this._placingMedida) this._medidaDraft = { a: null, b: null };
    } else if (mode === 'del') {
      this._deletingMedida = !this._deletingMedida;
      this._placingMedida = false;
    }
    // [15/09/2026 UTC] NOVO — pedido verbatim: "se clicar em 'Adicionar
    // medida' ou 'Apagar medida' [...], o botão respectivo 'Reposicionar
    // pontas' [...] deve ser desativado." Ao ligar "Adicionar"/"Apagar",
    // desliga "Reposicionar pontas" DO MESMO GRUPO (Medidas) — os 3 modos
    // são mutuamente exclusivos dentro do grupo, ver também
    // _toggleMedidaReposicionar (caminho inverso).
    if ((this._placingMedida || this._deletingMedida) && this._medidaReposicionarExtremidadesAtivo) {
      this._medidaReposicionarExtremidadesAtivo = false;
      MapConfig?.set?.({ medidaReposicionarExtremidadesAtivo: false });
      this._updateMedidaReposicionarBtn();
    }
    this._overlayEl?.querySelector('#ambphotos-medida-add')?.classList.toggle('active', this._placingMedida);
    this._overlayEl?.querySelector('#ambphotos-medida-del')?.classList.toggle('active', this._deletingMedida);
    if (this._placingMedida) Utils.toast('Adicionar medida: toque em 2 pontos da foto para marcar a reta.', { duration: 3500 });
    else if (this._deletingMedida) Utils.toast('Apagar medida: toque numa medida da foto para removê-la.', { type: 'warn', duration: 3500 });
    this.render();
  },

  // ---------- "✏️ Traço guia" — ATUALIZADO (05/09/2026), pedido verbatim:
  // "refaça do zero baseado nas ferramentas 'Trena' e 'Traço guia' do mapa
  // 2D [...] Serve como habilitador de desenho, pois, atualmente, quando o
  // 'Traço guia' estava ativa na bandeja, já ia logo sendo desenhado, sem
  // ter um habilitador secundário (como 'Adicionar traço guia'). Agora vai
  // ter." — ganhou a MESMA estrutura de "📏 Medidas" acima: um master
  // switch (_toggleTracosVisiveis, mirror exato de _toggleMedidasVisiveis)
  // e 2 submodos independentes (_toggleTracoMode('add'|'del'), mirror
  // exato de _toggleMedidaMode) em vez do único botão de antes. ----------

  /** Master switch da ferramenta "✏️ Traço guia" (botão dentro do menu
   *  lateral) — MESMO comportamento de _toggleMedidasVisiveis: liga/desliga,
   *  ao mesmo tempo, (1) a fileira "Adicionar/Apagar traço guia" e (2) se os
   *  traços já salvos desta foto são desenhados. Desligar cancela qualquer
   *  rascunho em progresso e sai dos submodos adicionar/apagar. */
  _toggleTracosVisiveis() {
    this._tracosVisiveis = !this._tracosVisiveis;
    if (!this._tracosVisiveis) {
      this._placingTraco = false;
      this._deletingTraco = false;
      this._tracoDraft = null;
      this._overlayEl?.querySelector('#ambphotos-traco-add')?.classList.remove('active');
      this._overlayEl?.querySelector('#ambphotos-traco-del')?.classList.remove('active');
    }
    this._overlayEl?.querySelector('#ambphotos-traco-toggle')?.classList.toggle('active', this._tracosVisiveis);
    this._updateTracoControlsVisibility();
    this._updateTracoReposicionarBtn();
    this.render();
    Utils.toast(this._tracosVisiveis ? '✏️ Traço guia ativado.' : '✏️ Traço guia desativado.', { duration: 2000 });
  },

  /** Mostra/esconde a fileira "Adicionar/Apagar traço guia" — mesma
   *  condição/mesmo padrão de _updateMedidaControlsVisibility. Chamada tanto
   *  por _toggleTracosVisiveis quanto por _renderStrip. */
  _updateTracoControlsVisibility() {
    const show = this._tracosVisiveis && this._photos.length > 0;
    this._overlayEl?.querySelector('#ambphotos-traco-controls')?.classList.toggle('hidden', !show);
  },

  /** "➕ Adicionar traço guia" / "🗑️ Apagar traço guia" — mirror EXATO de
   *  _toggleMedidaMode, restrito a quando "✏️ Traço guia" está ligado. */
  _toggleTracoMode(mode) {
    if (!this._tracosVisiveis) return; // defensivo — os botões só existem visíveis com a ferramenta ligada
    this._tracoDraft = null;
    if (mode === 'add') {
      this._placingTraco = !this._placingTraco;
      this._deletingTraco = false;
      if (this._placingTraco) this._tracoDraft = { a: null, b: null };
    } else if (mode === 'del') {
      this._deletingTraco = !this._deletingTraco;
      this._placingTraco = false;
    }
    // [15/09/2026 UTC] NOVO — mirror EXATO de _toggleMedidaMode, mesmo
    // pedido verbatim ("Adicionar traço guia"/"Apagar traço guia" devem
    // desativar o "Reposicionar pontas" DO TRAÇO GUIA quando ligado).
    if ((this._placingTraco || this._deletingTraco) && this._tracoReposicionarExtremidadesAtivo) {
      this._tracoReposicionarExtremidadesAtivo = false;
      MapConfig?.set?.({ tracoFotoReposicionarExtremidadesAtivo: false });
      this._updateTracoReposicionarBtn();
    }
    this._overlayEl?.querySelector('#ambphotos-traco-add')?.classList.toggle('active', this._placingTraco);
    this._overlayEl?.querySelector('#ambphotos-traco-del')?.classList.toggle('active', this._deletingTraco);
    if (this._placingTraco) Utils.toast('Adicionar traço guia: toque em 2 pontos da foto para desenhar a linha.', { duration: 3500 });
    else if (this._deletingTraco) Utils.toast('Apagar traço guia: toque num traço da foto para removê-lo.', { type: 'warn', duration: 3500 });
    this.render();
  },

  // ---------- "📍 Marcações de patrimônio" — CORRIGIDO (10/09/2026),
  // pedido verbatim: "o novo botão que você colocou ('Orb do Mapa') deve
  // ser removido. No lugar dele, coloque um botão com o ícone do 'alfinete
  // vermelho' (📍) [...] é para ativar/desativar os 2 botões que já estão
  // presentes nesta tela [...] '📍 Adicionar orb' (id=ambphotos-mode-orb) e
  // '🗑️ Apagar orb' (id=ambphotos-mode-del)." Substitui por completo o
  // bloco antigo desta seção (master switch "🖼️ Orb" +
  // _removerOrbDoMapa/_setOrbPosById, ligados a _openMapLinkFlow — fluxo
  // ERRADO, criava um 2º par de botões confuso com este aqui). Os botões
  // de verdade (#ambphotos-mode-orb/#ambphotos-mode-del) já existiam desde
  // muito antes desta tela, com seu próprio onclick/lógica intocados (ver
  // _toggleMode('orb'/'del') logo acima) — este master switch NUNCA os cria
  // nem muda o que fazem, só mostra/esconde os 2, MESMO padrão de
  // "📏 Medidas"/"✏️ Traço guia" acima. ----------

  /** Master switch do botão "📍" (menu lateral) — MESMO padrão de
   *  _toggleMedidasVisiveis/_toggleTracosVisiveis, só que aqui não revela
   *  uma fileira PRÓPRIA (não existe nenhuma — os 2 botões que ele
   *  controla já vivem dentro de `#ambphotos-controls`, junto com "⬇️
   *  Baixar todas", que PRECISA continuar sempre visível) — por isso
   *  alterna a classe `hidden` de cada um dos 2 botões INDIVIDUALMENTE em
   *  vez de um contêiner inteiro (ver _updateMarcacoesPatrimonioVisibility
   *  abaixo). */
  _toggleMarcacoesPatrimonioVisiveis() {
    this._marcacoesPatrimonioVisiveis = !this._marcacoesPatrimonioVisiveis;
    this._overlayEl?.querySelector('#ambphotos-marcpin-toggle')?.classList.toggle('active', this._marcacoesPatrimonioVisiveis);
    this._updateMarcacoesPatrimonioVisibility();
    Utils.toast(this._marcacoesPatrimonioVisiveis ? '📍 Marcações de patrimônio ativadas.' : '📍 Marcações de patrimônio desativadas.', { duration: 2000 });
  },

  /** Mostra/esconde os botões "📍 Adicionar orb"/"🗑️ Apagar orb"
   *  (#ambphotos-mode-orb/#ambphotos-mode-del) conforme o master switch
   *  acima — chamada tanto pelo toggle quanto por open()/_renderStrip
   *  (mesmo padrão de _updateMedidaControlsVisibility/
   *  _updateTracoControlsVisibility). Desligar também sai de qualquer modo
   *  em andamento (_placingOrb/_deletingOrb, ver _toggleMode) — senão a
   *  ferramenta continuaria ativa (ex.: tocar na foto ainda abrindo a
   *  busca de patrimônio) com o próprio botão que a liga escondido, sem
   *  jeito óbvio de desligar de novo. */
  _updateMarcacoesPatrimonioVisibility() {
    const show = this._marcacoesPatrimonioVisiveis;
    this._overlayEl?.querySelector('#ambphotos-mode-orb')?.classList.toggle('hidden', !show);
    this._overlayEl?.querySelector('#ambphotos-mode-del')?.classList.toggle('hidden', !show);
    if (!show && (this._placingOrb || this._deletingOrb)) {
      this._placingOrb = false;
      this._deletingOrb = false;
      this._overlayEl?.querySelector('#ambphotos-mode-orb')?.classList.remove('active');
      this._overlayEl?.querySelector('#ambphotos-mode-del')?.classList.remove('active');
    }
  },

  /** "📐" — ativa a calibração do vanishCam (linhas de referência) para a
   *  foto selecionada, sem sair desta tela. Reaproveita EXATAMENTE o mesmo
   *  ponto de entrada já usado pelo mapa 2D (botão "📐 linhas de
   *  referência" dentro do painel "📷 Definir Câmera" do orb de foto/
   *  câmera, ver mapview.js `_openVanishCamScreen`) — a função é
   *  autocontida (monta seu próprio overlay em `document.body`, lê/grava
   *  `mapaVanishCam` direto pelo `photoId` via `DB`, só usa
   *  `this._vanishCamLastPhotoId` como estado de instância do MapView) e
   *  não depende da Planta baixa estar aberta, então chamar direto em
   *  `window.MapView` funciona igual de dentro desta tela — nenhuma
   *  lógica nova de vanishCam foi criada aqui, só mais um ponto de
   *  entrada pro mesmo fluxo. */
  _abrirVanishCamAtual() {
    if (!this._current) { Utils.toast('Nenhuma foto selecionada.', { type: 'warn' }); return; }
    if (typeof window.MapView?._openVanishCamScreen !== 'function') {
      Utils.toast('vanishCam não disponível (recarregue a página).', { type: 'danger' });
      return;
    }
    window.MapView._openVanishCamScreen(this._current.id);
  },

  /** BUG CORRIGIDO (05/09/2026), pedido verbatim: "Acabei não conseguindo
   *  reposicionar o traço guia que inseri, não apareceu os círculos nas
   *  pontas." Substitui o antigo `_toggleReposicionarExtremidades` (botão
   *  ÚNICO compartilhado, ver comentário grande no HTML da fileira de
   *  Medidas pra causa raiz completa) — agora cada ferramenta tem seu
   *  próprio botão/handler, sem nenhuma ambiguidade sobre qual das duas
   *  está sendo ligada. Liga/desliga `_medidaReposicionarExtremidadesAtivo`
   *  e grava direto no MapConfig (o próprio `_onMapConfigChangeMedidas`, ver
   *  open(), mantém o botão em sincronia caso a MESMA config mude por fora,
   *  em ⚙️ Configurações). */
  _toggleMedidaReposicionar() {
    const novo = !this._medidaReposicionarExtremidadesAtivo;
    this._medidaReposicionarExtremidadesAtivo = novo;
    MapConfig?.set?.({ medidaReposicionarExtremidadesAtivo: novo });
    // [15/09/2026 UTC] NOVO — pedido verbatim: "ao clicar em 'Reposicionar
    // pontas', se o botão 'Adicionar' ou o botão 'Apagar' [...] estiver
    // habilitado, então, deve ser desabilitado." Ao LIGAR "Reposicionar
    // pontas", desliga "Adicionar"/"Apagar medida" do MESMO grupo — caminho
    // inverso de _toggleMedidaMode (que desliga este botão ao ligar aqueles
    // dois); juntos tornam os 3 modos mutuamente exclusivos dentro do grupo
    // "Medidas".
    if (novo && (this._placingMedida || this._deletingMedida)) {
      this._placingMedida = false;
      this._deletingMedida = false;
      this._medidaDraft = null;
      this._closeMedidaValorModal();
      this._overlayEl?.querySelector('#ambphotos-medida-add')?.classList.remove('active');
      this._overlayEl?.querySelector('#ambphotos-medida-del')?.classList.remove('active');
    }
    this._updateMedidaReposicionarBtn();
    Utils.toast(novo ? '🎯 Reposicionar pontas (Medidas) ligado — toque numa ponta de uma medida já inserida pra movê-la.' : '🎯 Reposicionar pontas (Medidas) desligado.', { duration: 3000 });
    this.render();
  },

  /** Atualiza ícone/estado/title do botão "🎯 Reposicionar pontas" da fileira
   *  de Medidas (ver comentário grande em _toggleMedidaReposicionar). */
  _updateMedidaReposicionarBtn() {
    const btn = this._overlayEl?.querySelector('#ambphotos-medida-reposicionar');
    if (!btn) return;
    btn.classList.toggle('active', this._medidaReposicionarExtremidadesAtivo);
    btn.title = this._medidaReposicionarExtremidadesAtivo
      ? 'Reposicionar pontas: ligado — toque numa ponta de uma medida já inserida pra movê-la. Toque pra desligar.'
      : 'Reposicionar pontas: desligado — medidas já inseridas ficam fixas. Toque pra ligar.';
  },

  /** BUG CORRIGIDO (05/09/2026) — mirror EXATO de _toggleMedidaReposicionar,
   *  agora pro "✏️ Traço guia" (mesma causa raiz/mesma correção: ver
   *  comentário grande no HTML da fileira de Medidas). Antes deste botão
   *  próprio existir, este toggle NUNCA era alcançável (o botão único
   *  compartilhado dava prioridade fixa pra Medidas) — por isso os círculos
   *  de reposicionamento do Traço guia nunca apareciam. */
  _toggleTracoReposicionar() {
    const novo = !this._tracoReposicionarExtremidadesAtivo;
    this._tracoReposicionarExtremidadesAtivo = novo;
    MapConfig?.set?.({ tracoFotoReposicionarExtremidadesAtivo: novo });
    // [15/09/2026 UTC] NOVO — mirror EXATO de _toggleMedidaReposicionar,
    // mesmo pedido verbatim, agora pro grupo "Traço guia".
    if (novo && (this._placingTraco || this._deletingTraco)) {
      this._placingTraco = false;
      this._deletingTraco = false;
      this._tracoDraft = null;
      this._overlayEl?.querySelector('#ambphotos-traco-add')?.classList.remove('active');
      this._overlayEl?.querySelector('#ambphotos-traco-del')?.classList.remove('active');
    }
    this._updateTracoReposicionarBtn();
    Utils.toast(novo ? '🎯 Reposicionar pontas (Traço guia) ligado — toque numa ponta de um traço já inserido pra movê-lo.' : '🎯 Reposicionar pontas (Traço guia) desligado.', { duration: 3000 });
    this.render();
  },

  /** Atualiza ícone/estado/title do botão "🎯 Reposicionar pontas" da fileira
   *  de Traço guia (ver comentário grande em _toggleTracoReposicionar). */
  _updateTracoReposicionarBtn() {
    const btn = this._overlayEl?.querySelector('#ambphotos-traco-reposicionar');
    if (!btn) return;
    btn.classList.toggle('active', this._tracoReposicionarExtremidadesAtivo);
    btn.title = this._tracoReposicionarExtremidadesAtivo
      ? 'Reposicionar pontas: ligado — toque numa ponta de um traço já inserido pra movê-lo. Toque pra desligar.'
      : 'Reposicionar pontas: desligado — traços já inseridos ficam fixos. Toque pra ligar.';
  },

  /** Toque no modo "traço guia" — mesmo padrão de `_placeMedidaPointAt`
   *  (1º toque define `a`, 2º define `b` e SALVA na hora — sem janela de
   *  valor, traço não mede nada), um 3º toque com os 2 já definidos começa
   *  um traço novo a partir dali. */
  _placeTracoPointAt(sx, sy) {
    const world = this.screenToWorld(sx, sy);
    const margin = Math.max(this._imgW, this._imgH) * 0.03;
    if (world.x < -margin || world.x > this._imgW + margin || world.y < -margin || world.y > this._imgH + margin) {
      Utils.toast('Toque em cima da foto para marcar um ponto do traço ali.', { type: 'warn' });
      return;
    }
    const ponto = { xNorm: Utils.clamp(world.x / this._imgW, 0, 1), yNorm: Utils.clamp(world.y / this._imgH, 0, 1) };
    if (!this._tracoDraft) this._tracoDraft = { a: null, b: null };
    if (!this._tracoDraft.a) {
      this._tracoDraft.a = ponto;
      Utils.toast('Agora toque no 2º ponto do traço.', { duration: 2500 });
      this.render();
    } else if (!this._tracoDraft.b) {
      this._tracoDraft.b = ponto;
      this._confirmTracoDraft();
    } else {
      this._tracoDraft = { a: ponto, b: null };
      Utils.toast('Novo traço — toque no 2º ponto.', { duration: 2500 });
      this.render();
    }
  },

  /** Salva o traço (2 vértices já tocados) em `photo.tracos` e reinicia o
   *  rascunho — a ferramenta continua ativa (mesmo espírito repetitivo de
   *  "Adicionar medida"/"Adicionar orb"), pronta pra marcar o próximo. */
  async _confirmTracoDraft() {
    if (!this._tracoDraft?.a || !this._tracoDraft?.b || !this._current) return;
    const traco = { id: DB.uuid(), a: { ...this._tracoDraft.a }, b: { ...this._tracoDraft.b }, criadoEm: DB.nowISO() };
    this._current.tracos = this._current.tracos || [];
    this._current.tracos.push(traco);
    await this._persistCurrent();
    this._tracoDraft = { a: null, b: null };
    this.render();
    Utils.toast('Traço guia inserido ✓', { type: 'ok' });
  },

  /** Vértice de TRAÇO (rascunho em progresso OU já salvo) perto do toque —
   *  mesma técnica/mesma ordem de prioridade de `_hitTestMedidaVertex`
   *  (rascunho primeiro, mais provável de estar sendo ajustado). Um traço
   *  JÁ SALVO só entra na busca com `_tracoReposicionarExtremidadesAtivo`
   *  ligado (⚙️ Configurações do mapa › 2D › 📷 Foto — DESLIGADO por
   *  padrão, ver DEFAULTS/mapconfig.js). */
  _hitTestTracoVertex(sx, sy, thresholdPx = 20) {
    if (this._tracoDraft) {
      for (const which of ['a', 'b']) {
        const p = this._tracoDraft[which];
        if (!p) continue;
        const s = this.worldToScreen(p.xNorm * this._imgW, p.yNorm * this._imgH);
        if (Math.hypot(s.x - sx, s.y - sy) < thresholdPx) return { kind: 'draft', which };
      }
    }
    if (!this._tracoReposicionarExtremidadesAtivo) return null;
    for (const traco of (this._current?.tracos || [])) {
      for (const which of ['a', 'b']) {
        const p = traco[which];
        if (!p) continue;
        const s = this.worldToScreen(p.xNorm * this._imgW, p.yNorm * this._imgH);
        if (Math.hypot(s.x - sx, s.y - sy) < thresholdPx) return { kind: 'saved', tracoId: traco.id, which };
      }
    }
    return null;
  },

  /** Traço já salvo cuja reta está perto do toque — mesma técnica de
   *  `_hitTestMedidaLine` (`_pointSegDist`, compartilhada). */
  _hitTestTracoLine(sx, sy, thresholdPx = 12) {
    for (const traco of (this._current?.tracos || [])) {
      if (!traco.a || !traco.b) continue;
      const sA = this.worldToScreen(traco.a.xNorm * this._imgW, traco.a.yNorm * this._imgH);
      const sB = this.worldToScreen(traco.b.xNorm * this._imgW, traco.b.yNorm * this._imgH);
      if (this._pointSegDist(sx, sy, sA.x, sA.y, sB.x, sB.y) < thresholdPx) return traco;
    }
    return null;
  },

  /** Remove um traço já salvo — mesmo padrão de `_removeMedida` (com
   *  desfazer/refazer via History). */
  async _removeTraco(traco) {
    const photoId = this._current.id;
    const index = (this._current.tracos || []).findIndex((t) => t.id === traco.id);
    this._current.tracos = (this._current.tracos || []).filter((t) => t.id !== traco.id);
    await this._persistCurrent();
    this.render();
    Utils.toast('Traço guia removido.', { type: 'warn' });
    History.push({
      label: 'remover traço guia',
      undo: async () => { await this._restoreTracoById(photoId, traco, index); },
      redo: async () => { await this._removeTracoById(photoId, traco.id); },
    });
  },

  async _removeTracoById(photoId, tracoId) {
    const photo = this._findLoadedPhoto(photoId) || await DB.getAmbientePhoto(photoId);
    if (!photo) return;
    photo.tracos = (photo.tracos || []).filter((t) => t.id !== tracoId);
    await DB.saveAmbientePhoto(photo);
    if (this._current?.id === photoId) this.render();
  },

  async _restoreTracoById(photoId, traco, index) {
    const photo = this._findLoadedPhoto(photoId) || await DB.getAmbientePhoto(photoId);
    if (!photo) return;
    const tracos = photo.tracos || [];
    const at = Math.min(Math.max(index, 0), tracos.length);
    tracos.splice(at, 0, { ...traco });
    photo.tracos = tracos;
    await DB.saveAmbientePhoto(photo);
    if (this._current?.id === photoId) this.render();
  },

  /** Desenha um traço guia — SEMPRE fino/tracejado (rascunho ou já salvo,
   *  sem distinção de espessura — é só uma referência visual, não uma
   *  medida com "valor confirmado" pra destacar). Cor branca semi-
   *  transparente, deliberadamente discreta e diferente das cores já usadas
   *  por orbs (amarelo/vermelho/roxo) e medidas (verde/ciano) — nunca se
   *  confunde com nenhuma das duas. Sem setas, sem rótulo — pedido verbatim:
   *  "apenas para servir como guia visual, uma linha reta tracejada e
   *  fina". Pontinhos nas pontas só no RASCUNHO (mesmo espírito do círculo
   *  de `_drawMedida`, marca o ponto ainda sendo ajustado) — um traço já
   *  salvo fica só a linha, o mais discreto possível. */
  _drawTraco(traco, { draft } = {}) {
    if (!traco?.a && !traco?.b) return;
    const ctx = this._ctx;
    const cor = 'rgba(255,255,255,.6)';
    const toScreen = (p) => this.worldToScreen(p.xNorm * this._imgW, p.yNorm * this._imgH);
    const sA = traco.a ? toScreen(traco.a) : null;
    const sB = traco.b ? toScreen(traco.b) : null;
    if (sA && sB) {
      ctx.beginPath();
      ctx.setLineDash([5, 4]);
      ctx.moveTo(sA.x, sA.y);
      ctx.lineTo(sB.x, sB.y);
      ctx.strokeStyle = cor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (draft) {
      [sA, sB].forEach((s) => {
        if (!s) return;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = cor;
        ctx.fill();
      });
    }
  },

  /** Janela pra "colocar a medida" — pedido do usuário, 26/08/2026: "Assim
   *  como para o orb, ao colocar o segundo ponto, deve abrir uma janela
   *  para colocar a medida" (mesmo espírito do seletor de item que abre ao
   *  marcar um orb, ver _pickItem) — substituiu a antiga faixa flutuante só
   *  com um botão. O campo de valor é OPCIONAL (medida sem valor ainda é
   *  útil como referência visual pura); "Cancelar" descarta o rascunho
   *  inteiro (mesmo comportamento de cancelar o seletor de item do orb —
   *  "cancelado — não cria orb sem item associado"). Pedido do usuário: "O
   *  botão 'Inserir medida' deve ficar na janela de colocação da medida" —
   *  por isso o botão mora AQUI dentro, não mais numa faixa à parte. */
  _openMedidaValorModal() {
    this._closeMedidaValorModal();
    if (!this._overlayEl) return;
    const modal = document.createElement('div');
    modal.id = 'ambphotos-medida-valor-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet" style="max-width:360px">
        <div class="handle"></div>
        <h3 style="margin-top:0">📏 Nova medida</h3>
        <label class="field">
          <span class="lbl">Valor da medida (opcional)</span>
          <input type="text" id="ambphotos-medida-valor-input" placeholder="ex.: 1,20 m">
        </label>
        <div style="display:flex; gap:10px; margin-top:6px">
          <button type="button" class="btn secondary" id="ambphotos-medida-valor-cancelar" style="flex:1">Cancelar</button>
          <button type="button" class="btn" id="ambphotos-medida-valor-inserir" style="flex:1" title="Salvar esta medida">✅ Inserir medida</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('#ambphotos-medida-valor-input');
    setTimeout(() => input.focus(), 30); // depois da transição de abertura, senão alguns navegadores ignoram o foco
    const inserir = () => {
      const valor = input.value.trim();
      modal.remove();
      this._confirmMedidaDraft(valor);
    };
    modal.querySelector('#ambphotos-medida-valor-cancelar').onclick = () => {
      modal.remove();
      this._medidaDraft = { a: null, b: null };
      this.render();
    };
    modal.querySelector('#ambphotos-medida-valor-inserir').onclick = inserir;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') inserir(); });
  },

  _closeMedidaValorModal() {
    document.getElementById('ambphotos-medida-valor-modal')?.remove();
  },

  /** Salva o rascunho atual (2 vértices já tocados, mais o valor digitado na
   *  janela acima) como uma medida de verdade em `photo.medidas` e limpa o
   *  rascunho — a ferramenta "Adicionar medida" continua ativa depois (mesmo
   *  espírito do "Adicionar orb": fica no modo repetitivo até a pessoa
   *  desligar de propósito), pronta pra marcar a próxima medida. */
  async _confirmMedidaDraft(valor = '') {
    if (!this._medidaDraft?.a || !this._medidaDraft?.b || !this._current) return;
    const medida = { id: DB.uuid(), a: { ...this._medidaDraft.a }, b: { ...this._medidaDraft.b }, valor: valor || '', criadoEm: DB.nowISO() };
    this._current.medidas = this._current.medidas || [];
    this._current.medidas.push(medida);
    await this._persistCurrent();
    this._medidaDraft = { a: null, b: null }; // continua em "Adicionar medida", pronta pra próxima
    this.render();
    Utils.toast('Medida inserida ✓', { type: 'ok' });
  },

  // ---------- Vincular um ITEM recém-cadastrado a uma posição numa foto
  // (opção "📷 Vincular a uma posição em uma foto" do modal de vínculo de
  // patrimônio — ver js/app.js _openItemLinkModal, task #109) ----------

  /** Entra no modo de "marcar, nesta foto, onde este patrimônio recém-criado
   *  está": abre a tela de Fotos do ambiente (se ainda não estiver aberta) —
   *  ou, se já estiver aberta, só troca pra `startPhotoId` — liga o modo
   *  "Adicionar orb" (_placingOrb) e marca `_pendingOrbItemId`, fazendo o
   *  PRÓXIMO orb marcado (ver _placeOrbAt) usar este item direto, sem abrir
   *  o seletor normal. Um-tiro-só: assim que o orb é marcado, a tela fecha
   *  sozinha (ver fim de _placeOrbAt) — `onDone(itemId)` é chamado nesse
   *  sucesso; `onCancel(itemId)` se a pessoa fechar a tela (✕/Esc/faixa)
   *  antes de marcar nada (ver close()/_cancelPendingOrbPlacement). */
  async enterOrbPlacementForItem(map, itemId, { startPhotoId, onDone, onCancel } = {}) {
    if (!this._overlayEl) {
      await this.open(map, { startPhotoId });
    } else if (startPhotoId) {
      await this._selectPhoto(startPhotoId);
    }
    if (!this._overlayEl) return; // open() pode ter falhado (ex.: sem `map`) — ver guarda defensiva lá dentro
    this._placingOrb = true;
    this._deletingOrb = false;
    this._pendingOrbItemId = itemId;
    this._pendingOrbOnDone = onDone || null;
    this._pendingOrbOnCancel = onCancel || null;
    this._overlayEl.querySelector('#ambphotos-mode-orb')?.classList.add('active');
    this._overlayEl.querySelector('#ambphotos-mode-del')?.classList.remove('active');
    this._setPendingOrbButtonsDisabled(true);
    this._showPendingOrbBanner();
    Utils.toast('Toque na foto onde este patrimônio está.', { duration: 3500 });
  },

  /** Faixa persistente ("Toque na foto onde este patrimônio está —
   *  Cancelar"), mesmo padrão visual/classe CSS da faixa equivalente do mapa
   *  2D (ver mapview.js _showPhotoPlacementBanner — reaproveita
   *  `.map-photo-placement-banner`, já que o overlay desta tela também é
   *  `position:fixed; inset:0`, então `position:absolute` no filho continua
   *  centralizando corretamente no topo). */
  _showPendingOrbBanner() {
    this._hidePendingOrbBanner();
    if (!this._overlayEl) return;
    const el = document.createElement('div');
    el.id = 'ambphotos-pending-orb-banner';
    el.className = 'map-photo-placement-banner';
    el.innerHTML = `
      <span>📍 Toque na foto onde este patrimônio está</span>
      <button type="button" class="btn secondary sm" id="ambphotos-pending-orb-cancel" title="Cancelar a marcação — o patrimônio vai para um lugar de reserva na periferia do mapa, igual a 'deixar sem vínculo'">Cancelar</button>
    `;
    this._overlayEl.appendChild(el);
    el.querySelector('#ambphotos-pending-orb-cancel').onclick = () => this._cancelPendingOrbPlacement();
  },

  _hidePendingOrbBanner() {
    this._overlayEl?.querySelector('#ambphotos-pending-orb-banner')?.remove();
  },

  _setPendingOrbButtonsDisabled(disabled) {
    const orbBtn = this._overlayEl?.querySelector('#ambphotos-mode-orb');
    const delBtn = this._overlayEl?.querySelector('#ambphotos-mode-del');
    if (orbBtn) orbBtn.disabled = disabled;
    if (delBtn) delBtn.disabled = disabled;
  },

  /** Toque em "Cancelar" na faixa acima — encerra o vínculo pendente (sem
   *  fechar a tela de Fotos inteira, diferente de fechar por ✕/Esc) e avisa
   *  quem chamou (ver `onCancel` em enterOrbPlacementForItem). */
  _cancelPendingOrbPlacement() {
    const itemId = this._pendingOrbItemId;
    const cb = this._pendingOrbOnCancel;
    this._pendingOrbItemId = null;
    this._pendingOrbOnDone = null;
    this._pendingOrbOnCancel = null;
    this._placingOrb = false;
    this._hidePendingOrbBanner();
    this._setPendingOrbButtonsDisabled(false);
    this._overlayEl?.querySelector('#ambphotos-mode-orb')?.classList.remove('active');
    if (itemId && cb) cb(itemId);
  },

  // ---------- Fotos: lista, seleção, adicionar, renomear, excluir ----------
  _renderStrip() {
    const strip = this._overlayEl?.querySelector('#ambphotos-strip');
    const empty = this._overlayEl?.querySelector('#ambphotos-empty');
    if (!strip) return;
    strip.innerHTML = this._photos.map((p) => `
      <div class="ambphoto-thumb ${p.id === this._current?.id ? 'active' : ''}" data-id="${p.id}" title="${Utils.escapeHtml(p.nome || 'Sem nome')}">
        <img src="${p.thumbDataUrl || p.dataUrl}" alt="${Utils.escapeHtml(p.nome || 'Foto do ambiente')}">
        ${p.orbs?.length ? `<span class="ambphoto-thumb-count">📍${p.orbs.length}</span>` : ''}
        <button type="button" class="ambphoto-thumb-del" data-id="${p.id}" title="Excluir esta foto (e os orbs marcados nela)">✕</button>
      </div>
    `).join('');
    empty?.classList.toggle('hidden', this._photos.length > 0);
    strip.classList.toggle('hidden', this._photos.length === 0);
    this._overlayEl?.querySelector('#ambphotos-controls')?.classList.toggle('hidden', this._photos.length === 0);
    this._updateMedidaControlsVisibility();
    this._updateTracoControlsVisibility();
    this._updateMarcacoesPatrimonioVisibility();
  },

  async _onStripClick(e) {
    // O usuário só queria arrastar a faixa (ver _attachStripDragScroll) —
    // o clique que o navegador dispara ao soltar o botão não deve
    // selecionar/excluir nenhuma foto.
    if (this._stripJustDragged) return;
    const delBtn = e.target.closest('.ambphoto-thumb-del');
    if (delBtn) {
      e.stopPropagation();
      await this._deletePhoto(delBtn.dataset.id);
      return;
    }
    const thumb = e.target.closest('.ambphoto-thumb');
    if (thumb) await this._selectPhoto(thumb.dataset.id);
  },

  /** Mede a altura real do cabeçalho (que pode ter 1 ou 2 linhas, ver
   *  .ambphotos-topbar-center no CSS) e reposiciona a faixa de fotos logo
   *  abaixo dele, pra ela nunca ficar em cima de nenhum botão do topo. */
  _syncStripOffset() {
    const topbar = this._overlayEl?.querySelector('.camera-topbar');
    const strip = this._overlayEl?.querySelector('#ambphotos-strip');
    if (!topbar || !strip) return;
    strip.style.top = `${topbar.offsetHeight + 8}px`;
  },

  /** No PC, permite clicar em cima de uma foto da faixa e arrastar pra
   *  rolar horizontalmente (além do scroll normal já suportado nativamente
   *  por .ambphotos-strip) — mesma ideia de clicar e arrastar a barra de
   *  scroll, só que direto em cima das fotos. Só entra em ação com mouse
   *  (pointerType 'mouse'); no celular o toque já rola nativamente. */
  _attachStripDragScroll(strip) {
    if (!strip) return;
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startScroll = 0;
    let startPointerId = null;

    strip.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startScroll = strip.scrollLeft;
      // NÃO chama setPointerCapture aqui (ver pointermove abaixo) — bug
      // relatado pelo usuário: "ao vir da miniatura do Organizar pra 'Mapa'
      // → 'Fotos', não é mais possível trocar de foto". Causa (reproduzida
      // também SEM passar pelo Organizar — não era específico daquele
      // caminho): capturar o ponteiro já no pointerdown desviava o
      // elemento-alvo de TODOS os eventos seguintes — inclusive o 'click'
      // sintetizado no soltar — pra este `strip` (o container), mesmo que o
      // cursor estivesse exatamente em cima de uma miniatura; o handler
      // delegado (_onStripClick, mais abaixo) faz `e.target.closest(
      // '.ambphoto-thumb')`, que dá `null` quando `e.target` já é o
      // próprio strip — nenhuma foto trocava nunca, com mouse (o
      // pointerType exigido aqui), em NENHUM clique simples na faixa.
      startPointerId = e.pointerId;
    });
    strip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 3) {
        moved = true;
        strip.classList.add('is-dragging');
        // SÓ agora, ao confirmar que é de fato um arrasto (passou do
        // limiar de 3px) — não um clique simples — prende os eventos
        // seguintes neste elemento, preservando o comportamento pedido
        // antes ("o arrasto não continua quando o cursor sai da janela e
        // volta") sem quebrar o clique normal numa miniatura.
        try { strip.setPointerCapture(startPointerId); } catch (_) { /* ignora — não é crítico */ }
      }
      if (moved) {
        strip.scrollLeft = startScroll - dx;
        e.preventDefault();
      }
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      strip.classList.remove('is-dragging');
      if (e) { try { strip.releasePointerCapture(e.pointerId); } catch (_) { /* já liberado */ } }
      if (moved) {
        this._stripJustDragged = true;
        setTimeout(() => { this._stripJustDragged = false; }, 0);
      }
    };
    strip.addEventListener('pointerup', endDrag);
    strip.addEventListener('pointercancel', endDrag);
  },

  async _onFilesChosen(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois, se precisar
    if (!files.length) return;
    for (const file of files) await this._addPhotoFromFile(file);
  },

  async _addPhotoFromFile(file) {
    Utils.toast('Processando foto…');
    try {
      // Comprime mas mantém uma resolução generosa (fotos podem ser bem
      // largas — panorama do celular, por exemplo) para dar pra dar zoom de
      // verdade depois sem tudo virar um borrão de pixels.
      const dataUrl = await Utils.resizeImage(file, 2400, 0.85);
      const thumbDataUrl = await Utils.resizeImage(file, 220, 0.75);
      const rec = await DB.addAmbientePhoto({ ambienteId: this._map.id, dataUrl, thumbDataUrl, nome: '' });
      this._photos.push(rec);
      this._renderStrip();
      await this._selectPhoto(rec.id);
      Utils.toast('Foto adicionada ✓', { type: 'ok' });
    } catch (err) {
      console.error('Falha ao processar foto do ambiente:', err);
      Utils.toast('Não foi possível processar esta foto: ' + (err?.message || err), { type: 'danger', duration: 5000 });
    }
  },

  async _selectPhoto(id, { focusNorm } = {}) {
    const photo = this._photos.find((p) => p.id === id) || await DB.getAmbientePhoto(id);
    if (!photo) return;
    this._current = photo;
    this._lastSelectedPhotoId = photo.id;
    // Um rascunho de medida em progresso (vértices em coordenadas desta
    // MESMA foto) não faz sentido sobrevivendo a uma troca de foto — descarta
    // (a ferramenta "Adicionar medida" continua ligada, só sem nenhum ponto
    // ainda tocado nesta foto nova).
    if (this._placingMedida) this._medidaDraft = { a: null, b: null };
    this._closeMedidaValorModal();
    try {
      this._img = await Utils.loadBitmap(photo.dataUrl);
    } catch (err) {
      console.error('Falha ao carregar a foto:', err);
      Utils.toast('Não foi possível carregar esta foto.', { type: 'danger' });
      return;
    }
    this._imgW = this._img.naturalWidth || this._img.width;
    this._imgH = this._img.naturalHeight || this._img.height;
    this._fitToScreen();
    // `focusNorm` (item 6 do feedback, rodada 55/v309 do Organizar) —
    // depois do enquadramento padrão (foto inteira visível), recentraliza
    // e aproxima na posição normalizada pedida. Fator de zoom ESCOLHIDO
    // por bom senso (sem navegador pra calibrar visualmente): pelo menos
    // 2x o zoom de "foto inteira" (pra dar uma noção real de aproximação),
    // com um piso absoluto de 2 (photos muito pequenas/já bem ampliadas no
    // fit padrão não ficariam quase sem aproximar nenhuma) — sempre dentro
    // dos limites já existentes (`MIN_ZOOM`/`MAX_ZOOM`).
    if (focusNorm && this._imgW && this._imgH) {
      const zoomAproximado = Utils.clamp(Math.max(this._view.zoom * 2.4, 2), this.MIN_ZOOM, this.MAX_ZOOM);
      this._view = { cx: focusNorm.x * this._imgW, cy: focusNorm.y * this._imgH, zoom: zoomAproximado };
    }
    await this._resolveOrbLabels(photo);
    this._renderStrip();
    this._updateTitle();
    this._updateMapLinkBtn();
    this.render();
  },

  _fitToScreen() {
    this._resizeCanvas();
    const cw = this._canvas.width || window.innerWidth;
    const ch = this._canvas.height || window.innerHeight;
    const fitZoom = Math.min(cw / this._imgW, ch / this._imgH) * 0.96;
    this._view = { cx: this._imgW / 2, cy: this._imgH / 2, zoom: Utils.clamp(fitZoom, this.MIN_ZOOM, this.MAX_ZOOM) };
  },

  /** Nome da foto atual, em destaque no topo — antes ficava perdido junto do
   *  nome do ambiente num badge pequeno; agora é o elemento mais visível da
   *  barra de topo, e é o único ponto de entrada para renomear a foto
   *  (não existe mais um botão duplicado nos controles debaixo). */
  _updateTitle() {
    const caption = this._overlayEl?.querySelector('#ambphotos-caption');
    const text = this._overlayEl?.querySelector('#ambphotos-caption-text');
    if (!caption || !text) return;
    caption.classList.toggle('hidden', !this._current);
    if (!this._current) return;
    const temNome = !!this._current.nome;
    text.textContent = temNome ? this._current.nome : 'Sem nome — toque para nomear';
    caption.classList.toggle('is-empty', !temNome);
  },

  /** NOVO (03/09/2026) — troca o rótulo/título do botão "🗺️" conforme a
   *  foto atual já tem posição no mapa (mapaX/mapaY, ver MapView
   *  _refreshFotosNoMapa) ou não. Chamado por _selectPhoto (toda vez que a
   *  foto em destaque muda) — pedido do usuário: "Deve ser possível editar
   *  a vinculação da foto no mapa [...] e adicionar, caso ainda não
   *  tenha." (mesmo botão cobre os dois casos, só muda o texto). */
  _updateMapLinkBtn() {
    const btn = this._overlayEl?.querySelector('#ambphotos-map-link');
    if (!btn) return;
    const jaVinculada = this._current && typeof this._current.mapaX === 'number' && typeof this._current.mapaY === 'number';
    btn.title = jaVinculada ? 'Editar a posição desta foto no mapa' : 'Vincular esta foto a um lugar no mapa';
    // NOVO (03/09/2026), pedido verbatim (item 2) — "👁️2D"/"👁️3D" só
    // habilitados quando a foto já tem posição salva (mesma condição do
    // botão 🗺️ acima).
    const btn2d = this._overlayEl?.querySelector('#ambphotos-view2d');
    const btn3d = this._overlayEl?.querySelector('#ambphotos-view3d');
    if (btn2d) btn2d.disabled = !jaVinculada;
    if (btn3d) btn3d.disabled = !jaVinculada;
  },

  /** NOVO (03/09/2026) — botão "🗺️" da barra de topo: fecha esta tela
   *  (revela o mapa por baixo — ver close()) e entra no MESMO fluxo de
   *  cruz+"Marcar aqui" já usado ao vincular uma foto pela 1ª vez (ver
   *  MapView.enterPhotoPlacementMode/_confirmPhotoPlacement, e o botão
   *  "🗺️ Mover no mapa" do painel do orb em mapview.js
   *  _openFotoPinPopover — mesmo princípio, reaproveitado aqui de dentro da
   *  tela 'Mapa'->'Foto' em vez de a partir do próprio orb já no mapa).
   *  Tanto ao confirmar quanto ao cancelar, reabre esta tela na MESMA foto
   *  (`onConfirm`/`onCancel`) — nenhum dos dois caminhos deve deixar o
   *  usuário "perdido" na Planta baixa sem querer (mesmo espírito do
   *  "botão de retorno" pedido pelo usuário noutras partes do mapa). */
  _openMapLinkFlow() {
    if (!this._current || !this._map) return;
    const photoId = this._current.id;
    const map = this._map;
    // BUG CORRIGIDO (03/09/2026, mesmo dia): "ao clicar em 'Vincular esta
    // foto a um lugar no mapa', está indo para a tela do 'Mapa', porém deve
    // ir para a 'Planta baixa' com a cruz ativa." Causa raiz: quando esta
    // tela foi aberta a partir de 'Mapa'→'Foto' (MapView._screen==='foto',
    // ver PhotoGrid.mountFotoScreen), o `onExit` passado pra
    // AmbientePhotos.open é `() => MapView._showScreen('entry')` — this.
    // close() (linha abaixo) dispara esse callback, que chama
    // `_showScreen('entry')` SEM AWAIT (fire-and-forget dentro de close()).
    // Como MapView.enterPhotoPlacementMode (logo abaixo) TAMBÉM chama
    // `_showScreen('planta')` quando `_screen !== 'planta'`, as DUAS
    // chamadas assíncronas a `_showScreen` corriam em paralelo (mesma
    // instância, mesmo `_rootEl`) — uma corrida onde a de 'entry' às vezes
    // termina de montar DEPOIS da de 'planta', sobrescrevendo o resultado e
    // deixando a pessoa na tela inicial do Mapa em vez da Planta baixa com
    // a cruz. Corrigido zerando `this._onExit` ANTES de close() — quem
    // assume a navegação daqui pra frente é o enterPhotoPlacementMode
    // abaixo (e o onCancel/onConfirm, que reabrem esta MESMA tela), então o
    // onExit "voltar pra entrada do Mapa" não deve rodar aqui.
    this._onExit = null;
    this.close();
    const reabrir = async (id) => { await AmbientePhotos.open(map, { startPhotoId: id }); };
    MapView.enterPhotoPlacementMode(photoId, { onCancel: reabrir, onConfirm: reabrir });
  },

  /** Garante que a JSZip esteja carregada (sob demanda, só quando o usuário
   *  pede um .zip — não faz parte do pré-carregamento do libloader.js pra
   *  não pesar a abertura do app). */
  _loadJSZip() {
    if (typeof JSZip !== 'undefined') return Promise.resolve();
    if (this._jsZipPromise) return this._jsZipPromise;
    this._jsZipPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'lib/jszip.min.js'; // vendorizado — nada de CDN, nem na 1ª vez
      script.onload = () => resolve();
      script.onerror = () => { this._jsZipPromise = null; reject(new Error('Falha ao baixar a biblioteca de .zip. Verifique sua conexão.')); };
      document.head.appendChild(script);
    });
    return this._jsZipPromise;
  },

  /** ITEM A1 (rodada 57/v311), pedido do usuário verbatim: "Nas
   *  'configurações 2D', na seção 'Foto', deve ser possível selecionar o
   *  tipo de arquivo que é usado ao clicar em 'Baixar esta foto' [...] Deve
   *  ser possível selecionar o tipo para o botão 'Baixar todas'. Por
   *  padrão, para ambos, é JPG." `ext` já vem validado por `MapConfig`
   *  (sempre 'jpg'|'png'|'webp' — ver DEFAULTS lá). */
  _photoFileName(photo, index, ext = 'jpg') {
    const base = (photo.nome || `foto-${index + 1}`).trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-zA-Z0-9\- _]/g, '').replace(/\s+/g, '-') || `foto-${index + 1}`;
    return `${base}.${ext}`;
  },

  /** Reconverte um dataURL (sempre gravado como JPEG no banco, ver captura
   *  da câmera/upload) pro formato pedido nas configurações 2D, só na hora
   *  do DOWNLOAD — o arquivo salvo no IndexedDB nunca muda de formato,
   *  então isto não afeta nada além do arquivo baixado. 'jpg' é passthrough
   *  (evita uma reconversão com perda desnecessária quando já é o formato
   *  pedido). PNG/WEBP passam por um `<canvas>` intermediário — única forma
   *  de reencodar uma imagem já rasterizada sem bibliotecas externas. */
  _reencodePhotoDataUrl(dataUrl, ext) {
    if (!dataUrl || ext === 'jpg') return Promise.resolve(dataUrl);
    const mime = ext === 'webp' ? 'image/webp' : 'image/png';
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL(mime));
        } catch (err) {
          console.warn('Falha ao reconverter foto pra', ext, '— usando JPEG original:', err);
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl); // formato original, na dúvida
      img.src = dataUrl;
    });
  },

  async _downloadCurrentPhoto() {
    if (!this._current) return;
    const cfg = (typeof MapConfig !== 'undefined') ? await MapConfig.get() : {};
    const ext = cfg.fotoDownloadFormatoAtual || 'jpg';
    const idx = this._photos.findIndex((p) => p.id === this._current.id);
    const nome = this._photoFileName(this._current, idx >= 0 ? idx : 0, ext);
    const href = await this._reencodePhotoDataUrl(this._current.dataUrl, ext);
    const a = document.createElement('a');
    a.href = href;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  async _downloadAllPhotosZip() {
    if (!this._photos.length) { Utils.toast('Nenhuma foto para baixar.', { type: 'warn' }); return; }
    Utils.toast('Preparando .zip…');
    try {
      const cfg = (typeof MapConfig !== 'undefined') ? await MapConfig.get() : {};
      const ext = cfg.fotoDownloadFormatoTodas || 'jpg';
      await this._loadJSZip();
      const zip = new JSZip();
      const usados = new Set();
      for (let i = 0; i < this._photos.length; i++) {
        const p = this._photos[i];
        let nome = this._photoFileName(p, i, ext);
        // evita sobrescrever se duas fotos tiverem o mesmo nome
        let n = 2;
        while (usados.has(nome)) { nome = nome.replace(new RegExp(`\\.${ext}$`), `-${n}.${ext}`); n++; }
        usados.add(nome);
        const outDataUrl = await this._reencodePhotoDataUrl(p.dataUrl, ext);
        const base64 = (outDataUrl || '').split(',')[1] || '';
        if (base64) zip.file(nome, base64, { base64: true });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fotos-${(this._map?.nome || 'ambiente').trim().replace(/\s+/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      Utils.toast('Download do .zip iniciado ✓', { type: 'ok' });
    } catch (err) {
      console.error('Falha ao gerar .zip das fotos:', err);
      Utils.toast('Não foi possível gerar o .zip: ' + (err?.message || err), { type: 'danger', duration: 5000 });
    }
  },

  async _renameCurrentPhoto() {
    if (!this._current) return;
    const novo = prompt('Nome desta foto (ex: "Parede norte", "Vista da entrada"):', this._current.nome || '');
    if (novo === null) return;
    this._current.nome = novo.trim();
    await this._persistCurrent();
    this._renderStrip();
    this._updateTitle();
  },

  /** Grava a foto atual, SEM levar junto os campos de exibição de cada orb
   *  (_labelText/_itemExists) — esses são recalculados sempre a partir do
   *  item de verdade (ver _resolveOrbLabels) e não deveriam ir pro banco. */
  _persistCurrent() {
    if (!this._current) return Promise.resolve(null);
    const limpo = { ...this._current, orbs: (this._current.orbs || []).map(({ _labelText, _itemExists, ...resto }) => resto) };
    return DB.saveAmbientePhoto(limpo);
  },

  async _deletePhoto(id) {
    const photo = this._photos.find((p) => p.id === id);
    if (!photo) return;
    const aviso = photo.orbs?.length
      ? `Excluir esta foto e os ${photo.orbs.length} orb(s) marcados nela? (dá para desfazer logo em seguida, com Ctrl+Z ou pelo botão ↶)`
      : 'Excluir esta foto?';
    if (!confirm(aviso)) return;
    const snapshot = await this._deletePhotoInternal(photo);
    Utils.toast('Foto excluída.', { type: 'warn' });
    History.push({
      label: 'excluir foto',
      undo: async () => { await this._restorePhotoInternal(snapshot); },
      redo: async () => { await this._deletePhotoInternal(snapshot); },
    });
  },

  /** Núcleo da exclusão de foto, sem confirm() — usado tanto pelo botão de
   *  excluir quanto pelo "refazer" do desfazer/refazer. Devolve um snapshot
   *  completo da foto (com os orbs), suficiente para restaurá-la depois. */
  async _deletePhotoInternal(photo) {
    const snapshot = { ...photo, orbs: (photo.orbs || []).map((o) => ({ ...o })) };
    await DB.deleteAmbientePhoto(photo.id);
    if (this._map?.id === photo.ambienteId) {
      this._photos = this._photos.filter((p) => p.id !== photo.id);
      if (this._current?.id === photo.id) {
        this._current = null;
        this._img = null;
        if (this._photos.length) await this._selectPhoto(this._photos[0].id);
        else { this._updateTitle(); this.render(); }
      }
      this._renderStrip();
    }
    return snapshot;
  },

  /** Restaura uma foto (com o MESMO id) a partir de um snapshot — usado pelo
   *  "desfazer" de uma exclusão de foto. Funciona mesmo se a tela de fotos
   *  não estiver aberta no momento (só grava no banco); se estiver aberta E
   *  for do mesmo ambiente, também atualiza a tira de miniaturas na hora. */
  async _restorePhotoInternal(snapshot) {
    await DB.saveAmbientePhoto(snapshot);
    if (this._map?.id === snapshot.ambienteId) {
      this._photos = await DB.getPhotosByAmbiente(this._map.id);
      this._renderStrip();
      await this._selectPhoto(snapshot.id);
    }
    return snapshot;
  },

  // ---------- Orbs: rótulos, desenho, hit-test, ações ----------
  /** Resolve o texto exibido de cada orb (patrimônio/descrição do item
   *  associado) a partir dos dados ATUAIS do item — nunca guarda esse texto
   *  no orb (evita ficar desatualizado se o item for editado depois em outra
   *  tela), mesma ideia do rótulo dos itens no mapa 2D (mapview.js).
   *
   *  Também marca `_duplicado` quando o patrimônio do item associado ao orb
   *  também está presente em OUTRO item do catálogo inteiro (não só neste
   *  ambiente/foto) — mesmo indicativo (⚠️, triângulo amarelo) usado na
   *  tabela, na busca e no detalhe do item, pra ser um único conceito de
   *  "duplicado" em todo o app. */
  async _resolveOrbLabels(photo) {
    const dupSet = await DB.getDuplicatePatrimonios();
    for (const orb of photo.orbs || []) {
      if (!orb.itemId) { orb._labelText = '(sem item)'; orb._itemExists = false; orb._duplicado = false; continue; }
      const item = await DB.getItem(orb.itemId);
      orb._labelText = item ? (item.patrimonio || item.descricao || '(sem nome)') : '(item removido)';
      orb._itemExists = !!item;
      orb._duplicado = !!(item && item.patrimonio && dupSet.has(item.patrimonio.trim()));
    }
  },

  /** Reaplica os rótulos/duplicados e redesenha a foto atual, se a tela de
   *  fotos estiver aberta agora — chamado de fora (app.js) sempre que um
   *  item é editado/excluído em outra janela (ex: aberta a partir de um
   *  toque num orb), pra refletir na hora sem precisar trocar de foto e
   *  voltar. Também chamado pelo desfazer/refazer (js/history.js). */
  async refreshIfOpen() {
    if (!this._overlayEl || !this._current) return;
    await this._resolveOrbLabels(this._current);
    this._renderStrip();
    this.render();
  },

  _resizeCanvas() {
    if (!this._canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this._canvas.clientWidth * dpr);
    const h = Math.floor(this._canvas.clientHeight * dpr);
    if (this._canvas.width !== w || this._canvas.height !== h) { this._canvas.width = w; this._canvas.height = h; }
  },

  worldToScreen(x, y) {
    const w = this._canvas.width, h = this._canvas.height;
    return { x: w / 2 + (x - this._view.cx) * this._view.zoom, y: h / 2 + (y - this._view.cy) * this._view.zoom };
  },
  screenToWorld(sx, sy) {
    const w = this._canvas.width, h = this._canvas.height;
    return { x: (sx - w / 2) / this._view.zoom + this._view.cx, y: (sy - h / 2) / this._view.zoom + this._view.cy };
  },

  render() {
    if (!this._canvas) return;
    this._resizeCanvas();
    const ctx = this._ctx;
    const w = this._canvas.width, h = this._canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);
    if (!this._img) return;

    ctx.save();
    ctx.translate(w / 2 - this._view.cx * this._view.zoom, h / 2 - this._view.cy * this._view.zoom);
    ctx.scale(this._view.zoom, this._view.zoom);
    ctx.drawImage(this._img, 0, 0, this._imgW, this._imgH);
    ctx.restore();

    this._drawResolutionLabel();
    (this._current?.orbs || []).forEach((orb) => this._drawOrb(orb));
    // "📏 Medidas" (pedido do usuário, 26/08/2026) — só desenha (medidas
    // salvas + rascunho em progresso) com a ferramenta ligada; desligada,
    // nem os botões nem as retas aparecem (ver _toggleMedidasVisiveis).
    if (this._medidasVisiveis) {
      (this._current?.medidas || []).forEach((medida) => this._drawMedida(medida, { draft: false }));
      if (this._medidaDraft) this._drawMedida(this._medidaDraft, { draft: true });
    }
    // ATUALIZADO (05/09/2026) — "✏️ Traço guia" ganhou master switch de
    // mostrar/ocultar (mesmo espírito de "📏 Medidas" acima, ver
    // _toggleTracosVisiveis): desligado, nem os botões nem os traços já
    // desenhados aparecem.
    if (this._tracosVisiveis) {
      (this._current?.tracos || []).forEach((traco) => this._drawTraco(traco, { draft: false }));
      if (this._tracoDraft) this._drawTraco(this._tracoDraft, { draft: true });
    }
    // NOVO (05/09/2026), pedido verbatim: "assim como na ferramenta 'Trena'
    // ... um círculo aparece quando o cursor está em cima e enquanto move a
    // medida, faça isso também ali para a 'Medida' e o 'Traço guia'" — ver
    // _drawVertexHighlightAmb.
    this._drawVertexHighlightAmb();
  },

  /** NOVO (05/09/2026) — MESMO visual/MESMA mecânica de mapview.js
   *  `_drawMedidaVertexHighlight` (Trena, 'Mapa'->'Planta baixa'): anel
   *  pulsante (baseado em `performance.now()`) na ponta de Medida/Traço
   *  guia sob o cursor (`_medidaVertexHoverAmb`/`_tracoVertexHoverAmb`) OU
   *  sendo arrastada agora (`_medidaDragging`/`_tracoDragging`, prioridade
   *  sobre o hover — mesmo visual mais forte + ponto central preenchido).
   *  Cores: âmbar pra Medida, roxo claro pra Traço guia (mesmas da Trena). */
  _drawVertexHighlightAmb() {
    const ctx = this._ctx;
    const resolverPonto = (tool, hit) => {
      if (!hit) return null;
      const draft = tool === 'medida' ? this._medidaDraft : this._tracoDraft;
      if (hit.kind === 'draft') return draft ? draft[hit.which] : null;
      const lista = tool === 'medida' ? (this._current?.medidas || []) : (this._current?.tracos || []);
      const idKey = tool === 'medida' ? 'medidaId' : 'tracoId';
      const obj = lista.find((o) => o.id === hit[idKey]);
      return obj ? obj[hit.which] : null;
    };
    const desenhar = (tool, hit, arrastando) => {
      const p = resolverPonto(tool, hit);
      if (!p) return;
      const s = this.worldToScreen(p.xNorm * this._imgW, p.yNorm * this._imgH);
      const cor = tool === 'medida' ? '#ffcc4d' : '#c9a3ff';
      const now = performance.now();
      const pulse = (Math.sin(now / 220) + 1) / 2; // 0..1
      ctx.save();
      if (arrastando) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 12 + pulse * 5, 0, Math.PI * 2);
        ctx.strokeStyle = cor;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.95;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = cor;
        ctx.globalAlpha = 1;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 10 + pulse * 3, 0, Math.PI * 2);
        ctx.strokeStyle = cor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.75;
        ctx.stroke();
      }
      ctx.restore();
    };
    desenhar('medida', this._medidaDragging || this._medidaVertexHoverAmb, !!this._medidaDragging);
    desenhar('traco', this._tracoDragging || this._tracoVertexHoverAmb, !!this._tracoDragging);
    this._drawLineMoveHandleAmb();
  },

  /** [15/09/2026 UTC] NOVO — desenha o "botão de mover pequeno" pedido
   *  (ver comentário grande em `_medidaLineDragging`) na posição atual do
   *  ponteiro enquanto uma RETA INTEIRA (Medida ou Traço guia) está sendo
   *  arrastada por `_medidaLineDragging`/`_tracoLineDragging`. Visual:
   *  círculo preenchido (mesma cor da ferramenta, âmbar/roxo) com uma
   *  cruz de "mover" dentro — distinto do anel dos vértices individuais
   *  (`_drawVertexHighlightAmb`, sem preenchimento), pra não confundir os
   *  dois tipos de arraste. */
  _drawLineMoveHandleAmb() {
    const ctx = this._ctx;
    const handle = (h, cor) => {
      if (!h) return;
      const { x, y } = h.handleScreen;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fillStyle = cor;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1;
      ctx.stroke();
      // Cruz de "mover" (4 pontas), branca, dentro do círculo.
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y);
      ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6);
      ctx.stroke();
      ctx.restore();
    };
    handle(this._medidaLineDragging, '#ffcc4d');
    handle(this._tracoLineDragging, '#c9a3ff');
  },

  /** NOVO (05/09/2026) — MESMO padrão de `_startOrbHighlight` (`render()`
   *  aqui só roda sob demanda, sem loop contínuo como o mapa 2D) — mantém
   *  o pulso do anel (ver _drawVertexHighlightAmb) animando enquanto
   *  houver um hover OU arraste ativo, mesmo com o cursor/dedo parado;
   *  para sozinho assim que não houver mais nada pra destacar. Chamada ao
   *  ENTRAR num hover/arraste nesta rodada — inofensivo chamar de novo
   *  enquanto já roda (`if (this._vertexHighlightRaf) return`). */
  _ensureVertexHighlightLoop() {
    if (this._vertexHighlightRaf) return;
    const step = () => {
      const ativo = this._medidaDragging || this._tracoDragging || this._medidaVertexHoverAmb || this._tracoVertexHoverAmb;
      if (!ativo || !this._overlayEl) { this._vertexHighlightRaf = null; return; }
      this.render();
      this._vertexHighlightRaf = requestAnimationFrame(step);
    };
    this._vertexHighlightRaf = requestAnimationFrame(step);
  },

  /** Mostra a resolução em pixels da foto ("1080 x 720"), ancorada acima do
   *  topo-esquerdo da foto — acompanha o pan/zoom porque é recalculada a
   *  cada quadro a partir de worldToScreen(0,0). Se o canto sair da tela
   *  (zoom/pan levando a foto para fora), o rótulo fica "colado" nas bordas
   *  visíveis do canvas em vez de sumir, para continuar legível. */
  _drawResolutionLabel() {
    if (!this._img || !this._imgW || !this._imgH) return;
    const ctx = this._ctx;
    const topLeft = this.worldToScreen(0, 0);
    const label = `${this._imgW} x ${this._imgH}`;
    ctx.font = '600 12px sans-serif';
    const textW = ctx.measureText(label).width;
    const padX = 8, boxW = textW + padX * 2, boxH = 20;
    const boxX = Utils.clamp(topLeft.x, 6, Math.max(6, this._canvas.width - boxW - 6));
    const boxY = Utils.clamp(topLeft.y - boxH - 6, 6, Math.max(6, this._canvas.height - boxH - 6));
    ctx.fillStyle = 'rgba(10,12,16,.82)';
    this._roundRectPath(ctx, boxX, boxY, boxW, boxH, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, boxX + padX, boxY + boxH / 2 + 0.5);
  },

  /** NOVO (04/09/2026), pedido verbatim: "destaca visualmente o orb do
   *  patrimônio naquela foto." — anima um anel pulsante em volta do orb
   *  por alguns segundos (chamada por `open()` quando `highlightOrbId` foi
   *  passado — ver App.verMarcacaoEmFoto/app.js). Usa o PRÓPRIO
   *  requestAnimationFrame (`render()` normalmente só roda sob demanda —
   *  a cada toque/arraste — não há loop contínuo aqui como no mapa 2D,
   *  então a animação precisa do seu próprio laço, que se desliga sozinho
   *  ao fim da duração ou se a foto for trocada/a tela for fechada
   *  (`this._highlightOrbId` muda/some, ver checagem `!== orbId` abaixo). */
  _startOrbHighlight(orbId) {
    this._highlightOrbId = orbId;
    this._highlightStartTs = performance.now();
    const DURATION = 2800;
    const step = (now) => {
      if (this._highlightOrbId !== orbId || !this._overlayEl) return; // cancelado (nova foto/orb, ou tela fechada)
      this.render();
      if (now - this._highlightStartTs < DURATION) {
        this._highlightRaf = requestAnimationFrame(step);
      } else {
        this._highlightOrbId = null;
        this._highlightRaf = null;
        this.render();
      }
    };
    this._highlightRaf = requestAnimationFrame(step);
  },

  _drawOrb(orb) {
    const ctx = this._ctx;
    const w = this._canvas.width, h = this._canvas.height;
    const px = orb.xNorm * this._imgW, py = orb.yNorm * this._imgH;
    const s = this.worldToScreen(px, py);
    if (s.x < -80 || s.x > w + 80 || s.y < -80 || s.y > h + 80) return; // fora da tela — não desenha à toa

    const dirRight = s.x < w * 0.62;
    const dirDown = s.y < h * 0.5;
    const leaderDx = dirRight ? 44 : -44;
    const leaderDy = dirDown ? 26 : -26;
    const lx = s.x + leaderDx, ly = s.y + leaderDy;

    // Cor: vermelho tem prioridade (item removido — o problema mais grave);
    // roxo é o mesmo patrimônio marcado em mais de um orb deste ambiente;
    // amarelo é o normal (orb válido, sem duplicidade).
    const cor = orb._itemExists === false ? '#ff6b6b' : (orb._duplicado ? '#c77dff' : '#ffd166');
    const corTraco = orb._itemExists === false ? 'rgba(255,107,107,0.85)' : (orb._duplicado ? 'rgba(199,125,255,0.9)' : 'rgba(255,209,102,0.9)');
    const corBorda = orb._itemExists === false ? 'rgba(255,107,107,.7)' : (orb._duplicado ? 'rgba(199,125,255,.65)' : 'rgba(255,209,102,.65)');

    // traço ligando o orb ao rótulo
    ctx.strokeStyle = corTraco;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(lx, ly); ctx.stroke();

    // Marcador do orb — bolinha colorida (padrão) OU, se o estilo "Alfinete
    // 2" estiver escolhido no controle de orb do Organizar (ver
    // organizeview.js, _estiloOrb/_drawOrbMark — pedido do usuário: esse
    // estilo específico "também deve aparecer em cima da foto", não só na
    // miniatura do Organizar), o emoji 📍 no lugar da bolinha. Lido direto
    // de window.OrganizeView por ser um controle de sessão (reseta só no
    // reload da página, ver open() em organizeview.js) — não duplicamos o
    // estado aqui.
    if (window.OrganizeView?._estiloOrb === 'alfinete2') {
      ctx.font = '30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('📍', s.x, s.y + 8);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    } else {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = cor;
      ctx.fill();
      ctx.strokeStyle = '#0a0d11'; ctx.lineWidth = 2; ctx.stroke();
    }

    // Anel tracejado extra em volta do orb duplicado — reforça o alerta
    // visual mesmo pra quem não repara na cor (ex: daltonismo).
    if (orb._duplicado) {
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.arc(s.x, s.y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(199,125,255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // rótulo (número de patrimônio / descrição) com fundo, sempre legível
    const label = (orb._itemExists !== false && orb._duplicado ? '⚠️ ' : '') + (orb._labelText || '…');
    ctx.font = '600 13px sans-serif';
    const textW = ctx.measureText(label).width;
    const boxW = textW + 16, boxH = 24;
    const boxX = dirRight ? lx : lx - boxW;
    const boxY = ly - boxH / 2;
    ctx.fillStyle = 'rgba(10,12,16,.88)';
    this._roundRectPath(ctx, boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.strokeStyle = corBorda;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = orb._itemExists === false ? '#ffb3b3' : (orb._duplicado ? '#e6c8ff' : '#ffe9b8');
    ctx.textAlign = dirRight ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, dirRight ? boxX + 8 : boxX + boxW - 8, ly + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; // restaura padrão pro próximo desenho

    // NOVO (04/09/2026) — anel pulsante de destaque (ver _startOrbHighlight/
    // App.verMarcacaoEmFoto) — desenhado por cima de tudo, só enquanto este
    // for o orb marcado pra destacar.
    if (orb.id === this._highlightOrbId) {
      const elapsed = performance.now() - (this._highlightStartTs || 0);
      const dur = 2800;
      const fade = Math.max(0, 1 - elapsed / dur);
      const pulse = (Math.sin(elapsed / 180) + 1) / 2; // 0..1
      ctx.beginPath();
      ctx.arc(s.x, s.y, 14 + pulse * 10, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,64,64,${(0.9 * fade).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  },

  _roundRectPath(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  /** Desenha uma medida — reta entre 2 pontos (`medida.a`/`medida.b`,
   *  `{xNorm,yNorm}`) — pedido do usuário (26/08/2026): "Os vértices não
   *  devem ser representados com um círculo preenchido, mas sim com um
   *  contorno de círculo para marcar o exato ponto na foto" (um círculo
   *  VAZADO deixa visível o pixel exato por baixo, diferente da bolinha
   *  cheia dos orbs — propósito bem diferente: aqui o ponto importa mais
   *  que "ver de longe"). `draft:true` é o rascunho em progresso (ainda não
   *  salvo, ver _medidaDraft) — mesmo visual, só com um vértice sozinho (sem
   *  reta ainda) quando `b` ainda não foi tocado. Cor própria (ciano),
   *  diferente das cores já usadas pelos orbs (amarelo/vermelho/roxo), pra
   *  nunca se confundir uma coisa com a outra na mesma foto. */
  _drawMedida(medida, { draft } = {}) {
    if (!medida?.a && !medida?.b) return;
    const ctx = this._ctx;
    const cor = draft ? '#7cffb2' : '#00e5ff';
    const toScreen = (p) => this.worldToScreen(p.xNorm * this._imgW, p.yNorm * this._imgH);
    const sA = medida.a ? toScreen(medida.a) : null;
    const sB = medida.b ? toScreen(medida.b) : null;
    if (sA && sB) {
      ctx.beginPath();
      ctx.setLineDash(draft ? [6, 4] : []);
      ctx.moveTo(sA.x, sA.y);
      ctx.lineTo(sB.x, sB.y);
      ctx.strokeStyle = cor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);

      // Setas pequenas nas pontas — só na medida JÁ INSERIDA (pedido do
      // usuário, 26/08/2026: "Quando clicar em inserir medida, a reta que
      // ficar deve ter setas pequenas nas extremidades"), opcional via ⚙️
      // Configurações do mapa › 2D › 📷 Foto (ver mapconfig.js DEFAULTS.
      // medidaSetasAtivo/_onMapConfigChangeMedidas em open() acima).
      if (!draft && this._medidaSetasAtivo) {
        this._drawSetaPontaMedida(ctx, sB, sA, cor);
        this._drawSetaPontaMedida(ctx, sA, sB, cor);
      }

      // Valor digitado na janela "📏 Nova medida" (ver _openMedidaValorModal)
      // — rótulo pequeno no meio da reta, só quando preenchido (o campo é
      // opcional). Só na medida já salva — o rascunho ainda não tem valor
      // nenhum (a janela só abre DEPOIS do 2º ponto, ver _placeMedidaPointAt).
      if (!draft && medida.valor) {
        const mx = (sA.x + sB.x) / 2, my = (sA.y + sB.y) / 2;
        ctx.font = '600 11px sans-serif';
        const texto = String(medida.valor);
        const padX = 6, textW = ctx.measureText(texto).width, boxW = textW + padX * 2, boxH = 17;
        ctx.fillStyle = 'rgba(10,12,16,.82)';
        this._roundRectPath(ctx, mx - boxW / 2, my - boxH / 2, boxW, boxH, 5);
        ctx.fill();
        ctx.strokeStyle = cor; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = cor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(texto, mx, my + 0.5);
      }
    }
    // Círculos vazados nas pontas — SEMPRE no rascunho (marca o ponto ainda
    // sendo ajustado, pedido original do usuário: "contorno de círculo para
    // marcar o exato ponto"); na medida JÁ SALVA, opcional via ⚙️
    // Configurações do mapa › 2D › 📷 Foto (pedido do usuário, 26/08/2026:
    // "após inserir medida, exibir/não exibir mais o círculo nas
    // extremidades" — ver mapconfig.js DEFAULTS.medidaCirculoAposInserirAtivo).
    // Não afeta o toque-e-arraste (_hitTestMedidaVertex): dá pra reposicionar
    // o vértice mesmo com o círculo escondido, só não aparece o contorno.
    if (draft || this._medidaCirculoAposInserirAtivo) {
      [sA, sB].forEach((s) => {
        if (!s) return;
        // Contorno só (sem fill) — pedido explícito do usuário, ver comentário
        // acima. Um pequeno "ponto" central de 1px reforça o centro exato sem
        // esconder o pixel embaixo (bem menor que um preenchimento normal).
        ctx.beginPath();
        ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = cor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = cor;
        ctx.fill();
      });
    }
  },

  /** Desenha uma seta pequena (formato "❮"/"❯", só o "bico", sem haste extra
   *  — a própria reta da medida já faz de haste) na ponta `to`, apontando na
   *  direção `from` → `to` (ou seja: a ponta do "V" fica exatamente em cima
   *  do vértice, com as duas pernas abrindo de volta em direção a `from`).
   *  Ver _drawMedida (chamada 2x, uma pra cada ponta). */
  _drawSetaPontaMedida(ctx, from, to, cor) {
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const tam = 9, abertura = Math.PI / 7;
    ctx.beginPath();
    ctx.moveTo(to.x - tam * Math.cos(ang - abertura), to.y - tam * Math.sin(ang - abertura));
    ctx.lineTo(to.x, to.y);
    ctx.lineTo(to.x - tam * Math.cos(ang + abertura), to.y - tam * Math.sin(ang + abertura));
    ctx.strokeStyle = cor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  },

  /** Vértice de medida mais próximo do toque — checa primeiro o RASCUNHO em
   *  progresso (o alvo mais provável de um arrasto, ver _medidaDragging) e
   *  só depois as medidas já salvas desta foto. Devolve
   *  `{ kind:'draft'|'saved', medidaId?, which:'a'|'b' }` ou `null`.
   *
   *  Pedido do usuário (28/08/2026): "ao colocar uma medida sobre a foto,
   *  não deve ser possível mover suas extremidades" — o rascunho (ainda
   *  sendo posicionado, antes de "✅ Inserir medida") sempre pode ser
   *  arrastado, é assim que ele é posicionado a primeira vez; uma medida JÁ
   *  SALVA só entra na busca quando `_medidaReposicionarExtremidadesAtivo`
   *  estiver ligado (⚙️ Configurações do mapa › 2D › 📷 Foto, DESLIGADO por
   *  padrão) — desligado, o toque nem encontra o vértice, então vira pan/
   *  toque-longo normal (ver pointerdown em open()), a medida fica fixa. */
  _hitTestMedidaVertex(sx, sy, thresholdPx = 20) {
    if (this._medidaDraft) {
      for (const which of ['a', 'b']) {
        const p = this._medidaDraft[which];
        if (!p) continue;
        const s = this.worldToScreen(p.xNorm * this._imgW, p.yNorm * this._imgH);
        if (Math.hypot(s.x - sx, s.y - sy) < thresholdPx) return { kind: 'draft', which };
      }
    }
    if (!this._medidaReposicionarExtremidadesAtivo) return null;
    for (const medida of (this._current?.medidas || [])) {
      for (const which of ['a', 'b']) {
        const p = medida[which];
        if (!p) continue;
        const s = this.worldToScreen(p.xNorm * this._imgW, p.yNorm * this._imgH);
        if (Math.hypot(s.x - sx, s.y - sy) < thresholdPx) return { kind: 'saved', medidaId: medida.id, which };
      }
    }
    return null;
  },

  /** Distância de um ponto (px,py) até o SEGMENTO ax,ay–bx,by — usado só
   *  pra "toque perto da reta" (ver _hitTestMedidaLine), não pros vértices
   *  (esses usam distância direta ao ponto, ver _hitTestMedidaVertex). */
  _pointSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Utils.clamp(t, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  },

  /** Medida já salva cuja RETA (não só os vértices) está perto do toque —
   *  usado pelo modo "Apagar medida" pra também remover ao tocar em
   *  qualquer ponto ao longo da linha, não só bem em cima de uma ponta. */
  _hitTestMedidaLine(sx, sy, thresholdPx = 12) {
    for (const medida of (this._current?.medidas || [])) {
      if (!medida.a || !medida.b) continue;
      const sA = this.worldToScreen(medida.a.xNorm * this._imgW, medida.a.yNorm * this._imgH);
      const sB = this.worldToScreen(medida.b.xNorm * this._imgW, medida.b.yNorm * this._imgH);
      if (this._pointSegDist(sx, sy, sA.x, sA.y, sB.x, sB.y) < thresholdPx) return medida;
    }
    return null;
  },

  /** Medida (já salva) mais perto do toque, testando vértices primeiro (mais
   *  precisos) e caindo pra reta inteira depois — usado por "Apagar medida"
   *  (ver _onCanvasClick). */
  _hitTestMedidaAny(sx, sy) {
    const vHit = this._hitTestMedidaVertex(sx, sy);
    if (vHit?.kind === 'saved') return (this._current?.medidas || []).find((m) => m.id === vHit.medidaId) || null;
    return this._hitTestMedidaLine(sx, sy);
  },

  /** Toque no modo "Adicionar medida" — 1º toque define o vértice `a`, 2º
   *  toque define `b` (e a reta aparece); um 3º toque com os dois já
   *  definidos começa um rascunho NOVO a partir daquele ponto (descarta o
   *  anterior, ainda não confirmado — só uma medida confirmada por vez com
   *  "✅ Inserir medida", ver _confirmMedidaDraft). Mesma margem de
   *  tolerância de _placeOrbAt pra tocar perto da borda da foto. */
  _placeMedidaPointAt(sx, sy) {
    const world = this.screenToWorld(sx, sy);
    const margin = Math.max(this._imgW, this._imgH) * 0.03;
    if (world.x < -margin || world.x > this._imgW + margin || world.y < -margin || world.y > this._imgH + margin) {
      Utils.toast('Toque em cima da foto para marcar um ponto da medida ali.', { type: 'warn' });
      return;
    }
    const ponto = { xNorm: Utils.clamp(world.x / this._imgW, 0, 1), yNorm: Utils.clamp(world.y / this._imgH, 0, 1) };
    if (!this._medidaDraft) this._medidaDraft = { a: null, b: null };
    if (!this._medidaDraft.a) {
      this._medidaDraft.a = ponto;
      Utils.toast('Agora toque no 2º ponto da medida.', { duration: 2500 });
    } else if (!this._medidaDraft.b) {
      this._medidaDraft.b = ponto;
      this._openMedidaValorModal();
    } else {
      // Já tinha os 2 — começa um rascunho novo a partir deste toque.
      this._closeMedidaValorModal();
      this._medidaDraft = { a: ponto, b: null };
      Utils.toast('Novo rascunho — toque no 2º ponto.', { duration: 2500 });
    }
    this.render();
  },

  /** Remove uma medida já salva — mesmo padrão de _removeOrb (com desfazer/
   *  refazer via History). */
  async _removeMedida(medida) {
    const photoId = this._current.id;
    const index = (this._current.medidas || []).findIndex((m) => m.id === medida.id);
    this._current.medidas = (this._current.medidas || []).filter((m) => m.id !== medida.id);
    await this._persistCurrent();
    this.render();
    Utils.toast('Medida removida.', { type: 'warn' });
    History.push({
      label: 'remover medida',
      undo: async () => { await this._restoreMedidaById(photoId, medida, index); },
      redo: async () => { await this._removeMedidaById(photoId, medida.id); },
    });
  },

  async _removeMedidaById(photoId, medidaId) {
    const photo = this._findLoadedPhoto(photoId) || await DB.getAmbientePhoto(photoId);
    if (!photo) return;
    photo.medidas = (photo.medidas || []).filter((m) => m.id !== medidaId);
    await DB.saveAmbientePhoto(photo);
    if (this._current?.id === photoId) this.render();
  },

  async _restoreMedidaById(photoId, medida, index) {
    const photo = this._findLoadedPhoto(photoId) || await DB.getAmbientePhoto(photoId);
    if (!photo) return;
    const medidas = photo.medidas || [];
    const at = Math.min(Math.max(index, 0), medidas.length);
    medidas.splice(at, 0, { ...medida });
    photo.medidas = medidas;
    await DB.saveAmbientePhoto(photo);
    if (this._current?.id === photoId) this.render();
  },

  _hitTestOrb(sx, sy, thresholdPx = 24) {
    if (!this._current?.orbs) return null;
    let best = null, bestD = thresholdPx;
    this._current.orbs.forEach((orb) => {
      const px = orb.xNorm * this._imgW, py = orb.yNorm * this._imgH;
      const s = this.worldToScreen(px, py);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < bestD) { bestD = d; best = orb; }
    });
    return best;
  },

  _onCanvasClick(e) {
    // Um toque longo (ver _attachPanZoom) já tratou este mesmo toque como
    // "segurar" — o clique que o navegador dispara em seguida (ao soltar o
    // dedo) não deve fazer mais nada.
    if (this._suppressNextClick) { this._suppressNextClick = false; return; }
    if (!this._current || !this._img) return;
    const rect = this._canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (this._canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (this._canvas.height / rect.height);

    // "📏 Medidas" — trata ANTES de orb (submodos independentes; na prática
    // só um dos dois costuma estar ativo por vez, mas não custa garantir a
    // ordem). Um toque que terminou um ARRASTO de vértice (ver
    // _attachPanZoom/_medidaDragging) já foi tratado lá — chega aqui como um
    // "click" comum do navegador, mas com `_suppressNextClick` já setado
    // (ver fim do pointerup), então nunca cai nestes ramos por engano.
    if (this._placingMedida) { this._placeMedidaPointAt(sx, sy); return; }
    if (this._deletingMedida) {
      const hit = this._hitTestMedidaAny(sx, sy);
      if (hit) this._removeMedida(hit);
      else Utils.toast('Nenhuma medida ali perto — toque mais em cima da reta ou de um dos pontos.', { type: 'warn' });
      return;
    }

    // ATUALIZADO (05/09/2026) — "✏️ Traço guia" ganhou submodos separados
    // "Adicionar"/"Apagar" (mirror EXATO de "📏 Medidas" acima, ver
    // _toggleTracoMode) em vez do único botão add+apagar de antes.
    if (this._placingTraco) { this._placeTracoPointAt(sx, sy); return; }
    if (this._deletingTraco) {
      const hit = this._hitTestTracoLine(sx, sy);
      if (hit) this._removeTraco(hit);
      else Utils.toast('Nenhum traço ali perto — toque mais em cima da linha.', { type: 'warn' });
      return;
    }

    if (this._placingOrb) { this._placeOrbAt(sx, sy); return; }
    if (this._deletingOrb) {
      const hit = this._hitTestOrb(sx, sy);
      if (hit) this._removeOrb(hit);
      else Utils.toast('Nenhum orb ali perto — toque mais em cima do ponto.', { type: 'warn' });
      return;
    }
    const hit = this._hitTestOrb(sx, sy);
    if (!hit) return;
    if (hit.itemId && hit._itemExists !== false) {
      // Toque simples num orb válido: vai direto pra mesma tela de detalhes/
      // edição usada no modo Tabela — sem menu intermediário no meio do caminho.
      App.showItemDetail(hit.itemId);
    } else {
      // Orb sem item válido (nunca associado, ou o item foi excluído depois)
      // — não tem "detalhes" pra mostrar, então já abre direto as opções
      // (trocar associação / remover este orb).
      this._openOrbActions(hit);
    }
  },

  /** Toque e segure (sem mover) num orb — ver _attachPanZoom — abre direto o
   *  menu de trocar/remover a marcação, sem depender de já ter um item válido
   *  associado (diferente do toque simples, que só abre a "ficha" quando há
   *  um item pra mostrar). Coordenadas recebidas em pixels de TELA (clientX/Y). */
  _triggerLongPress(clientX, clientY) {
    if (!this._current || !this._img) return;
    const rect = this._canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * (this._canvas.width / rect.width);
    const sy = (clientY - rect.top) * (this._canvas.height / rect.height);
    const hit = this._hitTestOrb(sx, sy);
    if (!hit) return; // toque longo fora de qualquer orb não faz nada especial
    this._suppressNextClick = true;
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* opcional */ } }
    this._openOrbActions(hit);
  },

  async _placeOrbAt(sx, sy) {
    const world = this.screenToWorld(sx, sy);
    // margem pequena pra tolerar um toque perto da borda, mas ainda evita
    // marcar um orb bem longe da foto (fora da imagem de verdade)
    const margin = Math.max(this._imgW, this._imgH) * 0.03;
    if (world.x < -margin || world.x > this._imgW + margin || world.y < -margin || world.y > this._imgH + margin) {
      Utils.toast('Toque em cima da foto para marcar um orb ali.', { type: 'warn' });
      return;
    }
    const xNorm = Utils.clamp(world.x / this._imgW, 0, 1);
    const yNorm = Utils.clamp(world.y / this._imgH, 0, 1);
    // Vínculo pendente de um item recém-cadastrado (ver
    // enterOrbPlacementForItem): usa o item JÁ DECIDIDO direto, sem abrir o
    // seletor normal — é um fluxo de "marcar UM orb pra ESTE item e sair".
    const isPending = !!this._pendingOrbItemId;
    const itemId = isPending ? this._pendingOrbItemId : await this._pickItem();
    if (!itemId) return; // cancelado — não cria orb sem item associado
    const orb = { id: DB.uuid(), xNorm, yNorm, itemId, criadoEm: DB.nowISO() };
    this._current.orbs = this._current.orbs || [];
    this._current.orbs.push(orb);
    await this._persistCurrent();
    await this._resolveOrbLabels(this._current);
    this._renderStrip();
    this.render();
    Utils.toast('Orb adicionado ✓', { type: 'ok' });
    if (isPending) {
      // Um-tiro-só: limpa o pendente ANTES de fechar (pra close() não
      // interpretar este fechamento — disparado por nós mesmos, de sucesso —
      // como um cancelamento, ver checagem de `_pendingOrbItemId` no topo de
      // close()) e avisa quem chamou que o vínculo foi concluído.
      const onDone = this._pendingOrbOnDone;
      this._pendingOrbItemId = null;
      this._pendingOrbOnDone = null;
      this._pendingOrbOnCancel = null;
      this._placingOrb = false;
      this._hidePendingOrbBanner();
      onDone?.(itemId);
      this.close();
    }
  },

  async _removeOrb(orb) {
    const photoId = this._current.id;
    const index = (this._current.orbs || []).findIndex((o) => o.id === orb.id);
    const { _labelText, _itemExists, _duplicado, ...orbSnapshot } = orb; // sem os campos transitórios
    this._current.orbs = (this._current.orbs || []).filter((o) => o.id !== orb.id);
    await this._persistCurrent();
    this._renderStrip();
    this.render();
    Utils.toast('Orb removido.', { type: 'warn' });
    History.push({
      label: 'remover orb',
      undo: async () => { await this._restoreOrbById(photoId, orbSnapshot, index); },
      redo: async () => { await this._removeOrbById(photoId, orbSnapshot.id); },
    });
  },

  /** Contraparte "sem UI" de _removeOrb/inserção, usada pelo desfazer/refazer
   *  — opera direto no banco por id de foto/orb, funcionando mesmo se a tela
   *  de fotos não estiver aberta ou estiver mostrando outra foto no momento;
   *  se estiver mostrando a MESMA foto, também atualiza a tela na hora. */
  /** Acha a foto (por id) já em memória (atual ou em `_photos`, se a tela
   *  estiver aberta neste ambiente) para mutar o MESMO objeto — importante
   *  pra contagem de duplicados (_resolveOrbLabels lê de `_photos`) ficar
   *  correta mesmo mexendo numa foto que não é a que está selecionada agora.
   *  Sem tela aberta / foto de outro ambiente, busca avulsa no banco. */
  _findLoadedPhoto(photoId) {
    if (this._current?.id === photoId) return this._current;
    return this._photos?.find((p) => p.id === photoId) || null;
  },

  async _removeOrbById(photoId, orbId) {
    const photo = this._findLoadedPhoto(photoId) || await DB.getAmbientePhoto(photoId);
    if (!photo) return;
    photo.orbs = (photo.orbs || []).filter((o) => o.id !== orbId);
    await DB.saveAmbientePhoto({ ...photo, orbs: photo.orbs.map(({ _labelText, _itemExists, _duplicado, ...r }) => r) });
    if (this._current?.id === photoId) { this._renderStrip(); this.render(); }
  },

  async _restoreOrbById(photoId, orb, index) {
    const photo = this._findLoadedPhoto(photoId) || await DB.getAmbientePhoto(photoId);
    if (!photo) return;
    const orbs = photo.orbs || [];
    const at = Math.min(Math.max(index, 0), orbs.length);
    orbs.splice(at, 0, { ...orb });
    photo.orbs = orbs;
    await DB.saveAmbientePhoto({ ...photo, orbs: orbs.map(({ _labelText, _itemExists, _duplicado, ...r }) => r) });
    if (this._current?.id === photoId) {
      await this._resolveOrbLabels(this._current);
      this._renderStrip();
      this.render();
    } else if (this._overlayEl && this._current) {
      // Mudou a contagem de duplicados de outra foto deste ambiente — refaz
      // os rótulos da foto atualmente visível pra refletir isso.
      await this._resolveOrbLabels(this._current);
      this.render();
    }
  },

  async _openOrbActions(orb) {
    const item = orb.itemId ? await DB.getItem(orb.itemId) : null;
    const escolha = await Utils.showChoiceModal({
      title: item ? (item.patrimonio || item.descricao || 'Item') : 'Orb sem item válido',
      message: item
        ? `${item.descricao || ''}${item.setor ? ' · ' + item.setor : ''}`
        : 'O item associado a este orb não foi encontrado (pode ter sido excluído).',
      choices: [
        ...(item ? [{ value: 'ver', label: '👁️ Ver detalhes do item' }] : []),
        { value: 'trocar', label: '🔗 Trocar item associado', secondary: true },
        { value: 'remover', label: '🗑️ Remover este orb', danger: true, secondary: true },
        { value: 'cancelar', label: 'Fechar', secondary: true },
      ],
    });
    if (escolha === 'ver') App.showItemDetail(orb.itemId);
    else if (escolha === 'trocar') {
      const novoId = await this._pickItem();
      if (!novoId) return;
      orb.itemId = novoId;
      await this._persistCurrent();
      await this._resolveOrbLabels(this._current);
      this.render();
      Utils.toast('Item do orb atualizado ✓', { type: 'ok' });
    } else if (escolha === 'remover') {
      await this._removeOrb(orb);
    }
  },

  /** Janela de busca simples para escolher qual item associar a um orb — por
   *  padrão já lista os itens deste MESMO ambiente (o caso mais comum: a foto
   *  é do lugar onde os itens estão), mas a busca cobre o catálogo inteiro.
   *  Implementação compartilhada em Utils.pickItem (usada também pelo modo
   *  "Itens" do mapa 2D, ver mapview.js). */
  _pickItem() {
    return Utils.pickItem({ ambienteId: this._map.id, title: 'Associar item a este orb' });
  },

  // ---------- Pan / zoom (mouse: arrasta + roda do mouse; toque: arrasta + pinça) ----------
  _attachPanZoom(canvas) {
    const pointers = new Map();
    let dragging = false, lastX = 0, lastY = 0;
    let pinchStartDist = 0, pinchStartZoom = 1;
    // Toque e segure num orb (sem mover o dedo) abre as opções de trocar/
    // remover a associação — mesma ideia de "long press" comum em apps de
    // fotos/mapas. Só é armado com 1 dedo só, e é cancelado assim que o dedo
    // se move além da tolerância (aí vira arrastar/pan normal) ou um 2º dedo
    // entra (vira pinça).
    const LONG_PRESS_MS = 550, MOVE_TOLERANCE_PX = 10;
    let pressTimer = null, pressStartX = 0, pressStartY = 0, pressPointerId = null;
    const cancelLongPress = () => { clearTimeout(pressTimer); pressTimer = null; };

    canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

    canvas.addEventListener('pointerdown', (e) => {
      // "📏 Medidas" — pedido do usuário: "Para cada um dos 2 vértices da
      // reta inserido, deve ser possível reposicionar o ponto" — um toque
      // bem em cima de um vértice (rascunho em progresso OU medida já salva)
      // inicia um ARRASTO dele em vez de pan/orb/toque-longo normais. Só
      // arma com 1 dedo só (pointers ainda vazio) e com a ferramenta
      // "📏 Medidas" ligada — ver _hitTestMedidaVertex/_medidaDragging.
      if (this._medidasVisiveis && pointers.size === 0 && (e.button === 0 || e.pointerType === 'touch')) {
        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
        const vHit = this._hitTestMedidaVertex(sx, sy);
        if (vHit) {
          canvas.setPointerCapture(e.pointerId);
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          this._medidaDragging = { ...vHit, pointerId: e.pointerId, moved: false };
          // BUG CORRIGIDO (05/09/2026), pedido verbatim: "Não está funcionando
          // o reposicionamento pelas pontas no 'Mapa'->'Foto'. Clico uma vez e
          // não funciona mais." — causa raiz: `_suppressNextClick` só era
          // ligado no `pointerup` (endPointer) E só quando `moved===true`. Um
          // toque muito curto/preciso num vértice (comum ao tentar pegar a
          // ponta exata) às vezes solta sem o navegador ter disparado nenhum
          // `pointermove` de verdade (ex.: telas de toque, ou um clique de
          // mouse muito rápido) — `moved` ficava `false`, `_suppressNextClick`
          // nunca era ligado, e o "click" sintético do navegador (disparado
          // logo depois do pointerup) caía em `_onCanvasClick`: pra Medida
          // isso só não fazia nada de mais (sem "add"/"del" ativos), mas pra
          // Traço guia o clique era tratado como um toque normal na
          // ferramenta (`_placingTraco` é o único estado que ela tem — ver
          // comentário grande em `_placingTraco`) e podia APAGAR o traço
          // (`_hitTestTracoLine` acha a mesma linha bem em cima do vértice) —
          // por isso reposicionar "não funcionava" pro Traço guia. Correção:
          // já liga `_suppressNextClick` aqui, assim que o vértice é
          // agarrado (pointerdown), e não só depois de confirmado um arrasto
          // com movimento real no pointerup — cobre os dois casos.
          this._suppressNextClick = true;
          this._ensureVertexHighlightLoop(); // NOVO (05/09/2026) — círculo pulsante enquanto arrasta, ver comentário grande na função
          return;
        }
        // [15/09/2026 UTC] NOVO — pedido verbatim, ver comentário grande em
        // `_medidaLineDragging` (declaração do campo, acima). Não bateu num
        // VÉRTICE (bloco acima) — com "Reposicionar pontas" ligado, um toque
        // na RETA de uma medida já salva (não no rascunho, que não tem "reta
        // fixa" pra mover) inicia a translação da reta inteira.
        if (this._medidaReposicionarExtremidadesAtivo) {
          const lineHit = this._hitTestMedidaLine(sx, sy);
          if (lineHit) {
            const world = this.screenToWorld(sx, sy);
            canvas.setPointerCapture(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this._medidaLineDragging = {
              medidaId: lineHit.id,
              aInicial: { ...lineHit.a }, bInicial: { ...lineHit.b },
              worldInicial: { x: world.x, y: world.y },
              pointerId: e.pointerId, moved: false, handleScreen: { x: sx, y: sy },
            };
            this._suppressNextClick = true;
            return;
          }
        }
      }
      // "✏️ Traço guia" — MESMO mecanismo do bloco de Medidas logo acima, só
      // que pra `_hitTestTracoVertex`/`_tracoDragging`. Gatilho ATUALIZADO
      // (05/09/2026) pra `_tracosVisiveis` (master switch, mirror exato de
      // `_medidasVisiveis` de cima) — antes era `_placingTraco` (o único
      // estado que a ferramenta tinha); agora que "Traço guia" ganhou
      // submodos Adicionar/Apagar separados (ver _toggleTracoMode), o
      // arraste de vértice deve funcionar com a ferramenta LIGADA, não só
      // dentro do submodo "Adicionar" (mesma regra de Medidas, que também
      // arrasta fora do submodo "Adicionar medida").
      if (this._tracosVisiveis && pointers.size === 0 && (e.button === 0 || e.pointerType === 'touch')) {
        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
        const vHit = this._hitTestTracoVertex(sx, sy);
        if (vHit) {
          canvas.setPointerCapture(e.pointerId);
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          this._tracoDragging = { ...vHit, pointerId: e.pointerId, moved: false };
          // BUG CORRIGIDO (05/09/2026) — mesma causa raiz/mesma correção do
          // bloco de Medidas logo acima (ver comentário grande lá):
          // `_suppressNextClick` precisa ligar já no pointerdown (ao agarrar
          // o vértice), não só depois de um arrasto com `moved===true` no
          // pointerup — senão o "click" sintético caía em `_onCanvasClick` e,
          // pro Traço guia, `_hitTestTracoLine` batia na própria linha do
          // vértice e `_removeTraco` apagava o traço, dando a impressão de
          // que "nem funciona".
          this._suppressNextClick = true;
          this._ensureVertexHighlightLoop(); // NOVO (05/09/2026) — círculo pulsante enquanto arrasta, ver comentário grande na função
          return;
        }
        // [15/09/2026 UTC] NOVO — mirror EXATO do bloco de Medidas acima
        // (mesmo pedido verbatim), agora pro "✏️ Traço guia".
        if (this._tracoReposicionarExtremidadesAtivo) {
          const lineHit = this._hitTestTracoLine(sx, sy);
          if (lineHit) {
            const world = this.screenToWorld(sx, sy);
            canvas.setPointerCapture(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this._tracoLineDragging = {
              tracoId: lineHit.id,
              aInicial: { ...lineHit.a }, bInicial: { ...lineHit.b },
              worldInicial: { x: world.x, y: world.y },
              pointerId: e.pointerId, moved: false, handleScreen: { x: sx, y: sy },
            };
            this._suppressNextClick = true;
            return;
          }
        }
      }
      // Toque/clique esquerdo direto marca/apaga orb (ver _onCanvasClick) —
      // não deve também mover a foto. Mas o botão do MEIO do mouse sempre
      // move a foto (pan), mesmo com "Adicionar/Apagar orb" ativo — sem essa
      // exceção, dava pra mover a foto só saindo do modo de marcar orb.
      if ((this._placingOrb || this._deletingOrb) && e.button !== 1) return;
      if (e.button !== 0 && e.button !== 1 && e.pointerType !== 'touch') return;
      if (e.button === 1) e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        pressStartX = e.clientX; pressStartY = e.clientY; pressPointerId = e.pointerId;
        cancelLongPress();
        pressTimer = setTimeout(() => { pressTimer = null; this._triggerLongPress(pressStartX, pressStartY); }, LONG_PRESS_MS);
      } else if (pointers.size === 2) {
        dragging = false;
        cancelLongPress(); // 2º dedo chegou — não é mais um toque e segure com 1 dedo só
        const pts = [...pointers.values()];
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        pinchStartZoom = this._view.zoom;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this._medidaDragging && e.pointerId === this._medidaDragging.pointerId) {
        this._medidaDragging.moved = true;
        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
        const world = this.screenToWorld(sx, sy);
        const ponto = { xNorm: Utils.clamp(world.x / this._imgW, 0, 1), yNorm: Utils.clamp(world.y / this._imgH, 0, 1) };
        if (this._medidaDragging.kind === 'draft') {
          if (!this._medidaDraft) this._medidaDraft = { a: null, b: null };
          this._medidaDraft[this._medidaDragging.which] = ponto;
        } else {
          const medida = (this._current?.medidas || []).find((m) => m.id === this._medidaDragging.medidaId);
          if (medida) medida[this._medidaDragging.which] = ponto;
        }
        this.render();
        return;
      }
      // "✏️ Traço guia" (NOVO, 04/09/2026, item 3) — mesma mecânica do
      // bloco de Medidas logo acima.
      if (this._tracoDragging && e.pointerId === this._tracoDragging.pointerId) {
        this._tracoDragging.moved = true;
        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
        const world = this.screenToWorld(sx, sy);
        const ponto = { xNorm: Utils.clamp(world.x / this._imgW, 0, 1), yNorm: Utils.clamp(world.y / this._imgH, 0, 1) };
        if (this._tracoDragging.kind === 'draft') {
          if (!this._tracoDraft) this._tracoDraft = { a: null, b: null };
          this._tracoDraft[this._tracoDragging.which] = ponto;
        } else {
          const traco = (this._current?.tracos || []).find((t) => t.id === this._tracoDragging.tracoId);
          if (traco) traco[this._tracoDragging.which] = ponto;
        }
        this.render();
        return;
      }
      // [15/09/2026 UTC] NOVO — translação da RETA INTEIRA (Medida), ver
      // comentário grande em `_medidaLineDragging`. Delta calculado sempre a
      // partir do ponto onde o arraste COMEÇOU (`worldInicial`) contra a
      // posição ATUAL do ponteiro, aplicado aos pontos `aInicial`/`bInicial`
      // (não incrementalmente) — preserva ângulo/comprimento com exatidão,
      // sem acumular arredondamento de `xNorm`/`yNorm` a cada frame.
      if (this._medidaLineDragging && e.pointerId === this._medidaLineDragging.pointerId) {
        this._medidaLineDragging.moved = true;
        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
        const world = this.screenToWorld(sx, sy);
        const { aInicial, bInicial, worldInicial } = this._medidaLineDragging;
        const dxNorm = (world.x - worldInicial.x) / this._imgW;
        const dyNorm = (world.y - worldInicial.y) / this._imgH;
        const medida = (this._current?.medidas || []).find((m) => m.id === this._medidaLineDragging.medidaId);
        if (medida) {
          medida.a = { xNorm: Utils.clamp(aInicial.xNorm + dxNorm, 0, 1), yNorm: Utils.clamp(aInicial.yNorm + dyNorm, 0, 1) };
          medida.b = { xNorm: Utils.clamp(bInicial.xNorm + dxNorm, 0, 1), yNorm: Utils.clamp(bInicial.yNorm + dyNorm, 0, 1) };
        }
        this._medidaLineDragging.handleScreen = { x: sx, y: sy };
        this.render();
        return;
      }
      if (this._tracoLineDragging && e.pointerId === this._tracoLineDragging.pointerId) {
        this._tracoLineDragging.moved = true;
        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
        const world = this.screenToWorld(sx, sy);
        const { aInicial, bInicial, worldInicial } = this._tracoLineDragging;
        const dxNorm = (world.x - worldInicial.x) / this._imgW;
        const dyNorm = (world.y - worldInicial.y) / this._imgH;
        const traco = (this._current?.tracos || []).find((t) => t.id === this._tracoLineDragging.tracoId);
        if (traco) {
          traco.a = { xNorm: Utils.clamp(aInicial.xNorm + dxNorm, 0, 1), yNorm: Utils.clamp(aInicial.yNorm + dyNorm, 0, 1) };
          traco.b = { xNorm: Utils.clamp(bInicial.xNorm + dxNorm, 0, 1), yNorm: Utils.clamp(bInicial.yNorm + dyNorm, 0, 1) };
        }
        this._tracoLineDragging.handleScreen = { x: sx, y: sy };
        this.render();
        return;
      }
      // NOVO (05/09/2026), pedido verbatim: "um círculo aparece quando o
      // cursor está em cima" — hover puro (mouse, sem botão pressionado,
      // fora de qualquer arraste em andamento — os 2 blocos de arraste
      // acima já `return`am antes de chegar aqui) — ver
      // _hitTestMedidaVertex/_hitTestTracoVertex/_drawVertexHighlightAmb.
      if (e.pointerType === 'mouse' && !this._medidaDragging && !this._tracoDragging) {
        const rect = canvas.getBoundingClientRect();
        const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
        const hoverMedida = this._medidasVisiveis ? this._hitTestMedidaVertex(sx, sy) : null;
        const hoverTraco = this._tracosVisiveis ? this._hitTestTracoVertex(sx, sy) : null;
        const mudou = JSON.stringify(hoverMedida) !== JSON.stringify(this._medidaVertexHoverAmb)
          || JSON.stringify(hoverTraco) !== JSON.stringify(this._tracoVertexHoverAmb);
        this._medidaVertexHoverAmb = hoverMedida;
        this._tracoVertexHoverAmb = hoverTraco;
        if (mudou) { this.render(); if (hoverMedida || hoverTraco) this._ensureVertexHighlightLoop(); }
      }
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pressTimer && e.pointerId === pressPointerId) {
        // Moveu demais antes do tempo do toque e segure completar — cancela
        // (vira arrastar/pan normal, tratado logo abaixo).
        if (Math.hypot(e.clientX - pressStartX, e.clientY - pressStartY) > MOVE_TOLERANCE_PX) cancelLongPress();
      }

      if (pointers.size === 2) {
        // Pinça (dois dedos): zoom em direção ao ponto médio entre os dedos.
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const rect = canvas.getBoundingClientRect();
        const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
        const sx = (midX - rect.left) * (canvas.width / rect.width);
        const sy = (midY - rect.top) * (canvas.height / rect.height);
        const worldBefore = this.screenToWorld(sx, sy);
        this._view.zoom = Utils.clamp(pinchStartZoom * (dist / pinchStartDist), this.MIN_ZOOM, this.MAX_ZOOM);
        this._view.cx = worldBefore.x - (sx - canvas.width / 2) / this._view.zoom;
        this._view.cy = worldBefore.y - (sy - canvas.height / 2) / this._view.zoom;
        this.render();
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      this._view.cx -= dx / this._view.zoom;
      this._view.cy -= dy / this._view.zoom;
      this.render();
    });

    const endPointer = (e) => {
      if (this._medidaDragging && e.pointerId === this._medidaDragging.pointerId) {
        const { kind, moved } = this._medidaDragging;
        this._medidaDragging = null;
        pointers.delete(e.pointerId);
        if (moved) {
          // Arrastou de verdade (não só um toque parado) — o "click"
          // sintetizado que o navegador dispara ao soltar não deve reabrir
          // nem apagar nada (ver _onCanvasClick). Uma medida JÁ SALVA que
          // teve um vértice movido precisa gravar a nova posição; o
          // rascunho em progresso já vive direto em `_medidaDraft`, nada
          // extra pra persistir ainda (só quando "✅ Inserir medida" for
          // tocado, ver _confirmMedidaDraft).
          this._suppressNextClick = true;
          if (kind === 'saved') this._persistCurrent();
        }
        return;
      }
      // "✏️ Traço guia" (NOVO, 04/09/2026, item 3) — mesma mecânica do
      // bloco de Medidas logo acima; traço JÁ SALVO com vértice movido
      // também precisa gravar (rascunho já vive em `_tracoDraft`, grava só
      // ao confirmar com o 2º ponto, ver _confirmTracoDraft).
      if (this._tracoDragging && e.pointerId === this._tracoDragging.pointerId) {
        const { kind, moved } = this._tracoDragging;
        this._tracoDragging = null;
        pointers.delete(e.pointerId);
        if (moved) {
          this._suppressNextClick = true;
          if (kind === 'saved') this._persistCurrent();
        }
        return;
      }
      // [15/09/2026 UTC] NOVO — solta o arraste de RETA INTEIRA (Medida/
      // Traço guia), ver comentário grande em `_medidaLineDragging`. Sempre
      // uma medida/traço JÁ SALVO (a reta do rascunho não passa por aqui,
      // ver o `if` no pointerdown que só testa `_hitTestMedidaLine`/
      // `_hitTestTracoLine` — funções que só olham `this._current.medidas`/
      // `.tracos`, nunca o rascunho) — sempre persiste se moveu de verdade.
      if (this._medidaLineDragging && e.pointerId === this._medidaLineDragging.pointerId) {
        const moved = this._medidaLineDragging.moved;
        this._medidaLineDragging = null;
        pointers.delete(e.pointerId);
        if (moved) { this._suppressNextClick = true; this._persistCurrent(); }
        this.render();
        return;
      }
      if (this._tracoLineDragging && e.pointerId === this._tracoLineDragging.pointerId) {
        const moved = this._tracoLineDragging.moved;
        this._tracoLineDragging = null;
        pointers.delete(e.pointerId);
        if (moved) { this._suppressNextClick = true; this._persistCurrent(); }
        this.render();
        return;
      }
      if (e.pointerId === pressPointerId) cancelLongPress();
      pointers.delete(e.pointerId);
      pinchStartDist = 0;
      if (pointers.size === 1) {
        const [p] = pointers.values();
        dragging = true; lastX = p.x; lastY = p.y;
      } else {
        dragging = false;
      }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    // NOVO (05/09/2026) — cursor saiu da foto: limpa o destaque de hover
    // (ver bloco grande em pointermove acima) pra não ficar "preso" aceso.
    canvas.addEventListener('pointerleave', () => {
      if (this._medidaVertexHoverAmb || this._tracoVertexHoverAmb) {
        this._medidaVertexHoverAmb = null;
        this._tracoVertexHoverAmb = null;
        this.render();
      }
    });

    canvas.addEventListener('wheel', (e) => {
      if (!this._img) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
      const worldBefore = this.screenToWorld(sx, sy);
      this._view.zoom = Utils.clamp(this._view.zoom * (e.deltaY > 0 ? 0.9 : 1.1), this.MIN_ZOOM, this.MAX_ZOOM);
      this._view.cx = worldBefore.x - (sx - canvas.width / 2) / this._view.zoom;
      this._view.cy = worldBefore.y - (sy - canvas.height / 2) / this._view.zoom;
      this.render();
    }, { passive: false });

    // Sem loop de animação contínuo (economiza bateria — nada aqui muda
    // sozinho): o redesenho acontece nos próprios eventos de interação e nas
    // trocas de foto/orb.
    this._onResize = () => { if (this._overlayEl) this.render(); };
    window.addEventListener('resize', this._onResize);
  },
};

window.AmbientePhotos = AmbientePhotos;
