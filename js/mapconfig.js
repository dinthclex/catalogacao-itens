/**
 * mapconfig.js — Configurações do mapa 2D/3D.
 *
 * Um ÚNICO painel (⚙️), aberto tanto do mapa 2D (mapview.js) quanto da
 * visualização 3D (view3d.js) — não são dois menus separados: são
 * interrelacionados. Opções que só fazem sentido no 3D (raycasting) só
 * aparecem quando aberto de lá. O resto é comum aos dois.
 *
 * Este painel já teve também um "menu da cena toda" (lista paredes/câmeras/
 * objetos/itens marcados no mapa atual, com selecionar/excluir) e o
 * controle "Mostrar informações dos itens no mapa" — removidos a pedido do
 * usuário, pra deixar a janela mais enxuta. `opts.onSelect`/`opts.onDelete`
 * continuam aceitos por `open()` (quem chama — mapview.js/view3d.js — ainda
 * os passa) mas não são mais usados aqui dentro; deixados de propósito
 * caso a lista volte no futuro.
 *
 * ---------------------------------------------------------------------
 * [11/09/2026] CABEÇALHO COM ÍNDICE DE FUNÇÕES (pedido recorrente do
 * usuário, "evitar buscas exaustivas") — `MapConfig` é um objeto único
 * (`const MapConfig = {...}`), sem classes. Listado na ordem em que
 * aparece no arquivo.
 *
 * Dados/config (não são função, mas fazem parte da API do objeto):
 * - DEFAULTS — valores de fábrica de toda config 2D/3D persistida (chave
 *   por chave, cada uma comentada no próprio objeto).
 * - NAV_TOOLS / NAV_HEADER_BUTTONS — listas usadas pela seção "Modo
 *   Navegação assistida" do painel.
 * - RENDER_DISTANCE_PRESETS/_MIN, FPS_LIMITE_PRESETS/_MIN,
 *   PAREDE_SNAP_GRADE_MIN/_MAX — presets/limites usados pelos controles
 *   de desempenho 3D e snap de parede no próprio `open()`.
 * - _WALL_JOIN_TYPES — tipos de junção de parede (ícones SVG), usados por
 *   `_juncaoIconSvg`.
 * - _cache/_listeners — estado interno: cache em memória da config lida
 *   do DB e a lista de callbacks de `onChange`.
 *
 * Funções/métodos:
 * - get() — lê a config persistida (DB.getSetting), mescla com DEFAULTS e
 *   guarda em `_cache`; usada por praticamente toda tela do app pra saber
 *   preferências 2D/3D atuais.
 * - set(patch) — mescla `patch` na config, persiste (DB.setSetting) e
 *   notifica `_listeners`.
 * - onChange(fn) / offChange(fn) — assina/cancela um callback chamado a
 *   cada `set()` (mapview.js/view3d.js reagem a mudanças de config sem
 *   precisar reabrir o painel).
 * - _formatHora(h) — formata um valor de hora (usado nos campos de
 *   horário de funcionamento/relatórios, se aplicável nesta seção).
 * - _juncaoIconSvg(tipo) — devolve o SVG do ícone de um tipo de junção de
 *   parede (`_WALL_JOIN_TYPES`), usado nos botões de escolha de junção.
 * - _flagsLegendHtml() — monta o HTML da legenda das 2 flags de
 *   patrimônio associado (duplicidade/associação), mostrada no painel.
 * - open(map, opts) — MÉTODO PRINCIPAL, monta e abre o painel de
 *   configurações inteiro (2D+3D, todas as seções/abas) — a grande
 *   maioria do arquivo (linhas ~900-2319) vive dentro desta função
 *   (handlers de cada controle, inline).
 * - _wireMapRotationSnapBtn(btn) — liga o botão de snap de rotação do
 *   mapa a um mini-diálogo de valor (usa `_openMapRotationSnapDialog`).
 * - _openMapRotationSnapDialog(valorInicial, commitValor) — abre um
 *   diálogo pequeno pra digitar o valor de snap de rotação do mapa (2D).
 * ---------------------------------------------------------------------
 */

// ⚠️ RESSALVA GLOBAL DO PROJETO (07/09/2026) — ver o comentário completo no
// topo de js/mapview.js: NUNCA usar crase (`) dentro de um comentário HTML
// (<!-- ... -->) que fica dentro de um template literal de innerHTML (é
// exatamente o caso deste arquivo inteiro, que só monta HTML assim) — use
// aspas simples (') pra citar seletor/nome de função. Crase solta ali fecha
// o template literal sem avisar e vira um ReferenceError em runtime,
// invisível pro node --check.

const MapConfig = {
  DEFAULTS: {
    // NOVO (04/09/2026), pedido verbatim (item 5): "No 'Buscar', as opções
    // de 'como chegar lá no 3D' devem ficar nas 'configurações 3D'. O padrão
    // é o órbita." — antes disso era um seletor modal (App.pickFlightMode3D)
    // reaberto TODA VEZ que a pessoa clicava em "👁️ Ver no mapa 3D" (item ou
    // foto) ou ia pro 3D a partir de uma sugestão da busca em modo "3D" (ver
    // js/search.js SearchView._selectItem); agora é uma preferência
    // persistida, lida direto (ver App.verNoMapa3D, view3d.js flyCameraTo —
    // este campo só escolhe qual dos 3 `opts.mode` já existentes usar, a
    // mecânica de voo em si não mudou nada). 'direto' | 'decima' | 'orbita'
    // — 'orbita' é o padrão pedido explicitamente.
    modoVoo3D: 'orbita',
    raycastEnabled: true,
    // 'hitbox' (destaque = a hitbox mudando de cor, como já era), 'tightbox'
    // (destaque = uma caixa "justa", do jeito que as paredes já eram
    // destacadas, só que pra tudo) ou 'outline2d' (contorno pontilhado fino
    // em volta da projeção 2D do alvo, já na tela).
    raycastHighlightStyle: 'hitbox',
    // 'hitbox' (rápido — testa esfera/caixa aproximada de cada alvo, igual
    // sempre foi) ou 'pixelperfect' (testa a malha 3D de verdade, triângulo a
    // triângulo, via THREE.Raycaster — mais exato nas quinas/bordas de formas
    // não-esféricas, um pouco mais pesado por quadro).
    raycastPrecision: 'hitbox',
    mostrarInfoItens2D: true,
    // Colar (clipboard da barra de ferramentas do Mapa 2D — ver mapview.js
    // _clipboardPaste) NÃO duplica pinos de item por padrão (um item só
    // pode ter uma posição no mapa) — ligando isto, "colar" um item
    // COPIADO cria um registro de item novo de verdade (cópia dos campos),
    // em vez de só avisar que não é duplicável. Não afeta "recortar" (esse
    // sempre funciona em itens — é só mover, não duplicar).
    duplicarItensAoColar: false,
    // --- Desempenho 3D (engine3d.js/view3d.js) — pedido do usuário: "algum
    // jeito de aumentar o FPS, diminuir a distância de renderização do chão,
    // ou outras coisas configuráveis". Os 4 abaixo, do maior pro menor
    // impacto típico no FPS: resolução (quadrático com a resolução — maior
    // impacto de todos) > antialiasing > distância de renderização (o chão é
    // um plano só, mas menos neblina = um pouco menos overdraw) > limite de
    // FPS (não AUMENTA o fps de verdade — CAPA num teto pra economizar
    // bateria/evitar esquentar, ao custo de nada de qualidade). ---
    resolucao3D: 'alta', // 'alta' (dpr até 2, padrão/como sempre foi) | 'media' (até 1.5) | 'baixa' (até 1)
    // [13/09/2026] NOVO — resolução de renderização CUSTOMIZADA do "Ver em
    // 3D" (independente do "Resolução" acima, que só escala o dpr do
    // tamanho de tela normal). `null` (padrão) = "Automática": resolução
    // NATIVA do canvas (tamanho CSS × dpr), pipeline 100% igual a antes
    // desta rodada — nenhuma chamada extra de render-to-texture acontece.
    // Um objeto `{ w, h, fit }` (`w`/`h` em pixels, mínimo RES_CUSTOM_MIN;
    // `fit`: 'esticar' | 'caber') força o motor 3D (engine3d.js, que já
    // renderiza o "Ver em 3D" via WebGLRenderTarget — "modo eye", ver
    // comentário grande lá — pra um retângulo próprio, independente do
    // canvas de tela) a desenhar NAQUELA resolução fixa, componentizada de
    // volta no canvas visível esticando ('esticar', CSS object-fit:fill) ou
    // preservando a proporção original com barras pretas ('caber', CSS
    // object-fit:contain) — ver engine3d.js `_resize`/view3d.js
    // `_applyResolucaoCustom3D`.
    resolucaoCustom3D: null,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve haver snap de posição
    // configurável nas 'configurações 3D'" (ferramenta "📏 Trena 3D", ver
    // view3d.js `_trena3DSnap`/`_trena3DSnapStep`) — arredonda X/Y/Z de
    // cada ponta clicada pro múltiplo mais próximo deste passo (metros).
    trena3DSnapMetros: 0.1,
    // [16/09/2026 UTC] NOVO — pedido verbatim, seção "📏 Trena 3D" ganhando
    // várias subseções novas de aparência/comportamento. Ver view3d.js
    // (`_trena3DRebuildLines`/`_trena3DUpdatePreview`/`_trena3DEndpointMesh`)
    // pra como cada campo é lido/aplicado.
    trena3DSnapAtivo: true, // toggle do snap acima — "cabeçalho igual ao 'Snap de parede' do mapa 2D" (botão liga/desliga + campo de valor ao lado)
    // [16/09/2026 UTC] REESTRUTURADO — 2 valores possíveis agora:
    // 'sobreLinha' (padrão, rotulado "Flutuante" na UI — projeta o meio 3D
    // exato, sem deslocamento) e 'sobreLinhaMeio' (NOVO, rotulado "Em cima
    // da linha e no meio" — centraliza o rótulo na MÉDIA dos 2 extremos já
    // projetados na tela). O antigo valor 'flutuante' (deslocamento de
    // +0,18m em Y antes de projetar) foi REMOVIDO — ver mapconfig.js
    // (seção "Aparência da medida") e view3d.js '_trena3DRebuildLines'.
    trena3DLabelEstilo: 'sobreLinhaMeio',
    // [17/09/2026 UTC] NOVO (RODADA 119) — pedido verbatim: controlar a
    // posição da caixa de texto ao longo de uma linha vertical (perpendicular
    // ao chão) que passa pelo ponto médio ('mAB') da reta 3D a que o texto
    // pertence — 0 = exatamente em 'mAB', positivo = acima, negativo =
    // abaixo (metros no espaço de mundo). 1 campo por subseção que ganhou
    // este controle novo (ver view3d.js '_trena3DDeslocarPontoY', usado nos
    // 6 pontos de código onde cada rótulo é de fato posicionado).
    trena3DLabelDeslocVerticalM: 0, // "Aparência da medida"
    trena3DGuiaChaoLabelDeslocVerticalM: 0, // "Guia rente ao chão"
    trena3DLinhaAncoraLabelDeslocVerticalM: 0, // "Linhas verticais ancoradas"
    trena3DGuiaGradeLabelDeslocVerticalM: 0, // "Linhas guia da grade do mundo"
    // [17/09/2026 UTC] NOVO (RODADA 119) — pedido verbatim, só pra "Linhas
    // guia da grade do mundo": "deve ter um enable de aparecer a linha
    // vertical (perpendicular ao chão) que é usada para deslocar o texto."
    trena3DGuiaGradeLabelLinhaVertical: false,
    // [17/09/2026 UTC] NOVO (RODADA 125) — pedido verbatim: "deve ter a
    // opção de ser 'Em cima e no meio' ou 'Flutuante' em [...] 'Guia rente
    // ao chão' e [...] 'Linhas guia da grade do mundo'." Mesmo conceito e
    // mesmos valores ('sobreLinhaMeio'/'sobreLinha') já usados em
    // 'trena3DLabelEstilo' (seção "Aparência da medida", RODADA 118/122) —
    // padrão 'sobreLinha' (Flutuante) preserva o comportamento de sempre
    // dessas 2 guias. Ver view3d.js '_trena3DRebuildLines' (blocos
    // 'meioChaoFin'/'criarGuia') e o trecho AO VIVO correspondente
    // ('_trena3DProjetarLabelImediato'/'construirLabel').
    trena3DGuiaChaoLabelEstilo: 'sobreLinha',
    trena3DGuiaGradeLabelEstilo: 'sobreLinha',
    // [17/09/2026 UTC] NOVO (RODADA 127) — ver comentário grande junto de
    // 'trena3DLabelVisivel' (DEFAULTS, subseção "Visibilidade") — mesmo
    // conceito, aplicado à caixa de texto de cada uma destas 2 guias.
    // Padrão 'true' preserva o comportamento de sempre.
    trena3DGuiaChaoLabelVisivel: true,
    trena3DGuiaGradeLabelVisivel: true,
    // [RODADA 131] NOVO — mesmo conceito de 'trena3DLabelVisivel'/
    // 'trena3DGuiaChaoLabelVisivel'/'trena3DGuiaGradeLabelVisivel', aplicado
    // às 2 caixas de texto ("⬍ Xm") da subseção "Linhas verticais ancoradas".
    trena3DLinhaAncoraLabelVisivel: true,
    // [17/09/2026 UTC] NOVO (RODADA 125) — pedido verbatim: "deve ter uma
    // opção para imprimir a esfera vermelha, mas com o nome de 'mostrar
    // ponto médio da medida'. deve dar para escolher a cor da esfera. Por
    // padrão, deve ser vermelha." Antes desta rodada a esfera do ponto
    // médio (RODADA 120, ver '_trena3DRebuildLines', comentário
    // "SphereGeometry"/"0xff2d2d") era sempre desenhada, cor fixa. Padrão
    // 'true'/'#ff2d2d' preserva o comportamento/cor de sempre.
    trena3DMostrarPontoMedio: true,
    trena3DCorPontoMedio: '#ff2d2d',
    trena3DVisibilidade: 'seVisivel', // 'seVisivel' (padrão, pedido do usuário — oculta atrás de paredes/objetos) | 'sempre' (o jeito de antes desta rodada, sempre desenha)
    // [17/09/2026 UTC] NOVO (RODADA 121) — pedido verbatim: "Deve haver uma
    // opção de imprimir as caixas de texto só as que estiverem próximas do
    // personagem. Um raio deve poder ser estabelecido para isso." Colocado
    // na subseção "Visibilidade" (já era sobre esconder/mostrar rótulos).
    // Padrão desligado (nenhuma mudança de comportamento pra quem não
    // mexer) — quando ligado, `trena3DLabelRaioM` (em metros) é o raio a
    // partir da posição do jogador/câmera (`this._camera`, view3d.js) além
    // do qual a caixa de texto da medida deixa de ser desenhada (a
    // linha/pontas 3D continuam aparecendo normalmente — só a caixa de
    // texto HTML é afetada, ver `_trena3DUpdateLabels`).
    trena3DLabelRaioAtivo: false,
    trena3DLabelRaioM: 15,
    // [17/09/2026 UTC] NOVO (RODADA 127) — pedido verbatim: "Deve ser
    // possível controlar se a caixa de texto com a medida vai aparecer ou
    // não em '📏 Trena 3D — Visibilidade' (para a medida), '📏 Trena 3D —
    // Guia rente ao chão' e '📏 Trena 3D — Linhas guia da grade do mundo'.
    // Por padrão todas ativadas." Padrão 'true' preserva o comportamento de
    // sempre (caixa de texto sempre aparecia). Ver view3d.js '_trena3DCfg'
    // (campos 'labelVisivel'/'guiaChaoLabelVisivel'/'guiaGradeLabelVisivel')
    // e os pontos onde cada label é criado/atualizado
    // ('_trena3DRebuildLines' e os blocos AO VIVO correspondentes).
    trena3DLabelVisivel: true,
    // [17/09/2026 UTC] NOVO (RODADA 121) — pedido verbatim: "Coloque como
    // mais uma opção a reorganização automática das caixas de texto para
    // que elas não se sobreponham na tela. Atualmente isso é sempre feito,
    // sem ser opcional. Por padrão, deve ficar desligado." Antes desta
    // rodada, `_trena3DAfastarRotulosSobrepostos` (view3d.js) sempre rodava
    // incondicionalmente dentro de `_trena3DUpdateLabels` — agora só roda
    // quando este campo estiver `true` (padrão `false`, preserva o "sempre
    // ligado" de antes só pra quem ligar explicitamente).
    trena3DLabelReorganizarSobreposicao: false,
    // [16/09/2026 UTC] ATUALIZADO — pedido verbatim: "Em '📏 Trena 3D —
    // Espessura e cores', em 'Espessura de linha (cm)', o padrão deve ser
    // 1." (era 2).
    trena3DEspessuraCm: 1, // espessura da linha entre as 2 pontas de uma medida JÁ finalizada, em centímetros (raio real de um "tubo" 3D — THREE.Line ignora `linewidth` na maioria das GPUs/navegadores, ver comentário grande em `_trena3DBuildFatLine`)
    trena3DCorLinha: '#ffd166', // cor da linha/pontas de uma medida já FINALIZADA (mesma cor de sempre, agora configurável)
    // [RODADA 129] REMOVIDOS `trena3DCorAncora`/`trena3DCorMira` — campos
    // vestigiais sem linha própria pra colorir (ver `js/view3d.js`,
    // `_trena3DCfg()`, pro raciocínio completo da investigação/decisão).
    trena3DPonta: 'esfera', // 'nenhuma' (RODADA 114, "sem pontas") | 'esfera' (padrão, o jeito de sempre) | 'seta' | 'setaDoisTracos' | 'traco' — formato do marcador em cada extremidade de uma medida finalizada
    // [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "na opção
    // 'Esfera', deve ser possível definir o tamanho da esfera. E se a
    // medida termina na ponta mais próxima da esfera, no centro da esfera
    // ou na ponta mais afastada da esfera [...] Os valores atuais devem
    // ser o padrão." `trena3DEsferaTerminoLinha`: investigado o código atual
    // (view3d.js `_trena3DRebuildLines`) — a linha (cilindro) vai
    // exatamente de p1 a p2, e a esfera fica CENTRADA nesses mesmos
    // pontos, ou seja, o comportamento de sempre já é 'centro' (a linha
    // passa pelo centro da esfera) — esse é o padrão mantido aqui.
    // [RODADA 135] MUDANÇA -- pedido verbatim: "a opção 'Esfera' deve ter
    // limites de '0,01' a 1. Em metros [...] Coloque as medidas em metros e
    // coloque limites para que não vá além dos limites. Nem pelo clicar e
    // arrastar, nem pelos botões." `trena3DEsferaTamanho` deixa de ser um
    // MULTIPLICADOR da espessura da linha e passa a ser o RAIO da esfera em
    // METROS, direto (mais fácil de prever o tamanho real, e evita que a
    // esfera fique gigante/minúscula sem querer agora que a espessura da
    // linha pode ir até 1000cm, RODADA 134). Novo padrão (0.02m = 2cm) é
    // aproximadamente o tamanho visual de sempre (raio da linha padrão
    // ~0.01m × multiplicador antigo 1.7 ≈ 0.017m, arredondado). Ver
    // view3d.js `_trena3DCfg`/`_trena3DBuildEndpoint`/`_trena3DRebuildLines`
    // (bloco `raioEsfera`) — os 3 lugares que liam este campo como
    // multiplicador agora o leem como valor absoluto, sempre limitado a
    // [0.01, 1] via `Utils.clamp` (clique nos botões OU arraste, os dois
    // passam pelo mesmo `onCommit`/`Utils.clamp`, então nenhum dos dois
    // caminhos escapa do limite).
    trena3DEsferaTamanho: 0.02,
    trena3DEsferaTerminoLinha: 'centro', // 'proxima' (linha para antes de tocar a esfera) | 'centro' (padrão, comportamento de sempre) | 'distante' (linha atravessa a esfera inteira)
    // [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "Na opção
    // 'Seta', deve ser possível definir o tamanho da base do cone da seta
    // e a altura do cone da seta individualmente. Os valores atuais devem
    // ser o padrão." Ambos são MULTIPLICADORES (mesmo espírito da esfera
    // acima) dos valores já fixos no código (view3d.js
    // `_trena3DBuildEndpoint`: `coneRaio = raioMetros*3.2`, `coneAltura =
    // coneRaio*2.2`) — valores atuais viram os novos padrões.
    trena3DSetaConeRaio: 3.2, // multiplicador da espessura da linha -> raio da base do cone
    trena3DSetaConeAltura: 2.2, // multiplicador do raio da base (já calculado acima) -> altura do cone
    // [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve ser
    // possível definir outro tipo de seta (a seta com dois traços) [...]
    // deve ser possível controlar a distância entre as pontas que ficam
    // soltas (entre elas). E definir o comprimento gerado pela distância
    // entre o ponto de encontro das duas linhas e a projeção delas na
    // linha da medida." Tipo de ponta NOVO (`trena3DPonta === 'setaDoisTracos'`,
    // sem precedente no código — valores abaixo são um padrão razoável
    // escolhido agora, não uma preservação de comportamento existente).
    // Geometria (ver view3d.js `_trena3DBuildEndpoint`): o "vértice" (onde
    // as 2 linhas se encontram) fica exatamente na PONTA da medida
    // (`pos`); as 2 linhas abrem pra trás (afastando-se da ponta, ao
    // longo da própria linha da medida) até 2 pontas soltas, separadas
    // entre si por `trena3DSetaDoisTracosAbertura` (cm) e recuadas
    // `trena3DSetaDoisTracosComprimento` (cm) ao longo da linha.
    trena3DSetaDoisTracosAbertura: 6, // cm — distância entre as 2 pontas soltas
    trena3DSetaDoisTracosComprimento: 10, // cm — distância entre o vértice e a projeção das pontas soltas na linha da medida
    // [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "Na opção
    // 'Traço perpendicular', deve ser possível definir o comprimento [...]
    // e se ele fica centralizado, parte da ponta [...] para cima ou [...]
    // para baixo. Além de como ele será renderizado [...] 'do jeito atual'
    // ou [...] paralelos as linhas [...] perpendiculares ao chão [...] Por
    // padrão, fica [este último] modo." `trena3DTracoPerpComprimento` é um
    // MULTIPLICADOR da espessura da linha, igual ao `7` já fixo no código
    // (view3d.js `_trena3DBuildEndpoint`: `compr = raioMetros*7`) —
    // preserva o comportamento de sempre. `trena3DTracoPerpAlinhamento`:
    // investigado o código atual — o cilindro do traço é centrado
    // exatamente em `pos` (a ponta da medida), ou seja, o comportamento de
    // sempre já é 'centralizado' — mantido como padrão.
    // `trena3DTracoPerpModoRender`: padrão mudado a pedido EXPLÍCITO do
    // usuário pra 'paraleloVertical' (NÃO é o comportamento de sempre,
    // que era só 'atual' — o usuário pediu que o novo modo vire o padrão
    // mesmo assim).
    trena3DTracoPerpComprimento: 7,
    trena3DTracoPerpAlinhamento: 'centralizado', // 'centralizado' (padrão) | 'paraCima' | 'paraBaixo'
    trena3DTracoPerpModoRender: 'paraleloVertical', // 'atual' | 'paraleloVertical' (NOVO padrão, pedido explícito)
    // [16/09/2026 UTC] NOVO — pedido verbatim: "deixar de fazer o destaque
    // feito pelo raycaster (onde ele bate) enquanto está ativa a linha
    // perpendicular (consequência de ter segurado o ctrl antes). Por
    // padrão ativa." Ver engine3d.js `setHoverHighlightSuppressed`/
    // view3d.js `_trena3DAtualizarDestaqueSuprimido`.
    trena3DSuprimirDestaqueDuranteAncora: true,
    // [16/09/2026 UTC] REMOVIDO — pedido verbatim: "Colapse as duas
    // subseções [...] A opção da subseção 'Altura ao vivo' deixa de
    // existir." `trena3DMostrarAlturaAoVivo` (campo antigo, sem opção de UI
    // correspondente mais) removido — só sobra `trena3DMostrarAlturaAoVivoAntesDoPonto`
    // abaixo, sob o cabeçalho combinado "Altura ao vivo (Antes mesmo de
    // definir o ponto)".
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Ao clicar segurando o ctrl
    // cria-se uma âncora no chão com uma bolinha laranja [...] mesmo
    // enquanto não se fixe o outro ponto laranja com um clique, a medida
    // entre os pontos laranjas deve aparecer [...] uma subseção de 'antes
    // mesmo de definir o ponto'." Ver view3d.js `_trena3DUpdatePreview`.
    trena3DMostrarAlturaAoVivoAntesDoPonto: true,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Coloque uma opção de
    // continuar desenhando a linha laranja tracejada até o 1º ponto da
    // medida (por padrão, ativada) [...] Uma subopção [...] infinita ou vai
    // até o 1º ponto da medida (por padrão [...] 'vai até o 1º ponto'
    // [...] ativa)." Ver view3d.js `_trena3DUpdatePreview`
    // (`_trena3DP1HeightLine`).
    trena3DContinuarLinhaAncoraAposPonto: true,
    trena3DLinhaAncoraAposPontoModo: 'ateOPonto', // 'ateOPonto' (padrão) | 'infinita'
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Outra subopção é imprimir
    // junto com a linha laranja tracejada infinita (ou até o 1º ponto, com
    // isso, não sendo infinita) o texto laranja da medida (logo depois de
    // definir o 1º ponto da medida)." Ver view3d.js `_trena3DUpdatePreview`
    // (`_trena3DP1HeightLine`).
    trena3DMostrarMedidaNaLinhaAncoraAposPonto: true,
    // [16/09/2026 UTC] NOVO (RODADA 94) — ver view3d.js '_trena3DUpdatePreview'.
    trena3DMostrarGuiaChaoAoVivo: false,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve haver outra opção:
    // 'Mostrar guia depois que a medida foi finalizada'. Esta opção afeta
    // todas as guias, pois todas elas (que já estão finalizadas) encaixam-se
    // nesse critério." Generaliza a guia rente ao chão (só ao vivo, entre o
    // 1º ponto e a mira atual) pra cada medida JÁ finalizada no mapa — ver
    // view3d.js '_trena3DRebuildLines'.
    trena3DGuiaChaoFinalizada: false,
    // [16/09/2026 UTC] NOVO (RODADA 98) — cores separadas por "parte" da
    // guia rente ao chão (linha vs texto/rótulo), ver view3d.js
    // '_trena3DUpdatePreview' (bloco de '_trena3DGuiaChaoLine').
    trena3DGuiaChaoCorLinha: '#7dff6e',
    trena3DGuiaChaoCorTexto: '#d9ff8a',
    // [17/09/2026 UTC] NOVO (RODADA 114) — espessura/estilo/dash + ponta
    // (simplificada) da "Guia rente ao chão" — pedido verbatim: "além de
    // poder controlar a cor, deve ser possível definir a espessura das
    // linhas guia e se são sólida, tracejada ou pontilhada [...] deve ser
    // possível escolher as pontas também." Padrão preserva a aparência de
    // sempre (tracejada, sem ponta nenhuma).
    trena3DGuiaChaoEspessuraCm: 1.2,
    trena3DGuiaChaoEstiloLinha: 'tracejada', // 'solida' | 'tracejada' | 'pontilhada'
    trena3DGuiaChaoDashCm: 12,
    trena3DGuiaChaoGapCm: 8,
    trena3DGuiaChaoPonta: 'nenhuma', // mesmos valores de `trena3DPonta` ('nenhuma'|'esfera'|'seta'|'setaDoisTracos'|'traco')
    // [RODADA 131] NOVO — pedido verbatim: controlar em que altura (entre as
    // 2 linhas verticais ancoradas, que são paralelas entre si) esta guia
    // fica: 'renteChao' (y=0, padrão/comportamento de sempre), 'proximaChao'
    // (na altura do extremo MAIS BAIXO da medida — extremidade comum ao
    // ponto mais próximo do chão), 'afastadaChao' (na altura do extremo MAIS
    // ALTO da medida) ou 'livre' (altura arbitrária, 'trena3DGuiaChaoAlturaLivreM',
    // 0 = chão). Ver view3d.js '_trena3DGuiaChaoAlturaY'.
    trena3DGuiaChaoModo: 'renteChao',
    trena3DGuiaChaoAlturaLivreM: 0,
    // [16/09/2026 UTC] NOVO (RODADA 98) — ver engine3d.js 'raycastSurfaceAmpliado'.
    trena3DPermitirSuperficiesLaterais: false,
    // [16/09/2026 UTC] NOVO (RODADA 101) — pedido verbatim: "Após
    // estabelecer o 1º ponto da medida deve ser possível 'continuar
    // naquele nível' (de y) [...]" Ver view3d.js '_trena3DUpdatePreview'
    // ('modoContinuarNivel')/'_trena3DAtualizarGradeNivelInfinita'.
    trena3DContinuarNoNivel: false,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Coloque como outra opção
    // dentro de 'Altura ao vivo (Antes mesmo de definir o ponto)' para
    // definir que a medida laranja aparece ou não já ao segurar o ctrl. Em
    // vez de sempre deixar ativo." Ver view3d.js `_trena3DUpdatePreview`.
    // [16/09/2026 UTC] REMOVIDO — pedido verbatim: "Na subseção '📏 Trena 3D
    // — Altura ao vivo (Antes mesmo de definir o ponto)' a opção 'Sempre
    // desenhada enquanto a Trena 3D estiver ativa' deve ser removida do
    // projeto." Campo `trena3DAlturaAoVivoSempreDesenhada` (RODADA 90),
    // checkbox `mc-trena3d-altura-sempre` e a leitura correspondente em
    // view3d.js (`_trena3DCfg`/`_trena3DUpdatePreview`) removidos por
    // completo — não é só desligado por padrão, deixou de existir.
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Semelhante a subseção
    // 'Linha da âncora após o 1º ponto', mas agora nas duas linhas [...]
    // Deve ter uma subseção para definir se ficam impressas após a medida
    // ser finalizada (por padrão, desativada). E uma subopção se desenha do
    // chão até os pontos da medida ou se as duas vão ser infinitas." Ver
    // view3d.js `_trena3DRebuildLines`.
    trena3DMostrarLinhasAncoraFinalizada: false,
    // [17/09/2026 UTC] NOVO (RODADA 114) — cor + espessura/estilo/dash da
    // "Linhas verticais ancoradas" (compartilhados pelas 3 sub-opções:
    // Altura ao vivo, Linha da âncora, Linhas finalizadas) — pedido
    // verbatim: "Por padrão fica nas configurações que está (laranja
    // tracejada e fina)." Padrão preserva EXATAMENTE a aparência de sempre.
    trena3DLinhaAncoraCor: '#ff9f4d',
    trena3DLinhaAncoraEspessuraCm: 1,
    trena3DLinhaAncoraEstiloLinha: 'tracejada', // 'solida' | 'tracejada' | 'pontilhada'
    trena3DLinhaAncoraDashCm: 12,
    trena3DLinhaAncoraGapCm: 8,
    // [RODADA 129] NOVO — cor/espessura/estilo/dash configuráveis do
    // "ghost"/prévia da medida (a linha tracejada azul clara que liga o 1º
    // ponto já fixado até a bolinha que segue o cursor, antes do 2º clique —
    // `_trena3DGuideLine` em view3d.js). Mesmo padrão de campos já usado
    // pela "Linha da âncora" acima (`_trena3DCamposEstiloLinha`/
    // `_wireTrena3DEstiloLinha`). Padrão preserva EXATAMENTE a aparência de
    // sempre (azul `#5ec8ff`, tracejada, traço/espaço iguais aos valores
    // fixos que já estavam hardcoded — `dashSize:0.12`/`gapSize:0.08` em
    // metros = 12cm/8cm).
    trena3DGhostCor: '#ffd166', // [RODADA 131] pedido verbatim: mesma cor/espessura padrão da medida finalizada (trena3DCorLinha) — continua editável separadamente
    trena3DGhostEspessuraCm: 1,
    trena3DGhostEstiloLinha: 'tracejada', // 'solida' | 'tracejada' | 'pontilhada'
    trena3DGhostDashCm: 12,
    trena3DGhostGapCm: 8,
    trena3DLinhasAncoraFinalizadaModo: 'ateOPonto', // 'ateOPonto' (padrão) | 'infinita'
    // [RODADA 131] NOVO — pedido verbatim: cor/tamanho configuráveis da
    // "mira" (bolinha indicadora "aqui vai cair o clique", `_trena3DHoverMesh`
    // em view3d.js) mostrada sempre que a ferramenta "📏 Trena 3D" está
    // ativa. Padrões preservam EXATAMENTE a cor/tamanho fixos de sempre
    // (azul `#5ec8ff`, raio 0,045m = tamanho '1') — só o estado ANCORADO
    // (Ctrl/âncora, laranja `#ff9f4d`) continua fixo, sem campo próprio.
    trena3DMiraCor: '#5ec8ff',
    trena3DMiraTamanho: 1,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "sobre segurar o ctrl, deve
    // ter uma subseção sobre como funciona esta funcionalidade [...] Opção
    // de ter que segurar o ctrl [...] Nesta opção, se o ctrl não for
    // pressionado, uma medida pode ser feita com apenas 2 cliques. A outra
    // opção é fazer uma medida com 4 cliques [...] torna-se independente de
    // ele estar pressionado ou não." 'ctrl' (padrão, comportamento de sempre)
    // | 'quatroCliques' (novo). Ver view3d.js `_trena3DClick`/
    // `_trena3DUpdatePreview`/`_trena3DAtualizarDestaqueSuprimido`.
    trena3DModoAncora: 'ctrl',
    // [16/09/2026 UTC] NOVO — pedido verbatim: "documento explicando a
    // funcionalidade desta ferramenta 'Trena 3D' [...] Acessível por um
    // botão no cabeçalho de início do 'Trena 3D'." Sem campo de config
    // correspondente (o botão só abre uma janela informativa, ver
    // `_abrirDocTrena3D` mais abaixo) — comentário aqui só pra manter o
    // rastro de onde esse pedido foi atendido.
    // [16/09/2026 UTC] NOVO — pedido verbatim: "mostrar linhas tracejadas
    // guias a partir do lado do ladrilho do mundo (multiplos de 1m) [...]
    // Por padrão, fica ativada." Ver view3d.js `_trena3DAtualizarGuiaGrade`.
    trena3DGuiaGradeAtiva: true,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Outra opção é como as
    // medidas vão ser apresentadas no ladrilho, como é atualmente é uma
    // opção. Outra é sempre partindo da esquerda numa medida e de cima para
    // a outra medida (esta deve ser a padrão)." Ver view3d.js
    // `_trena3DAtualizarGuiaGrade`.
    trena3DGuiaGradeModoMedida: 'esquerdaCima',
    // [16/09/2026 UTC] NOVO — pedido verbatim: "coloque como outra opção
    // para aparecer após finalizar a medida. Isto acabará afetando a todas
    // as medidas no mapa." Generaliza a guia de grade (antes só ao vivo,
    // durante a mira) pra cada ponto de CADA medida já finalizada no mapa —
    // ver view3d.js `_trena3DRebuildLines` (usa a MESMA lógica de
    // `_trena3DAtualizarGuiaGrade`, só que por ponto finalizado em vez do
    // ponto mirado ao vivo). Padrão desativado (opção nova).
    trena3DGuiaGradeFinalizada: false,
    // [16/09/2026 UTC] NOVO (RODADA 104) — ver view3d.js '_trena3DAtualizarGuiaGrade'.
    trena3DGuiaGradeAposPrimeiroPonto: false,
    // [RODADA 139] "➰ Polilinha 3D" deixou de ser ferramenta separada (era
    // uma cópia quase inteira da "📏 Trena 3D" com janelinha/seção de
    // config próprias, das RODADAs 136-138 — tudo isso foi removido).
    // Pedido verbatim: "Elimine a seção da polilinha 3D e os seus recursos
    // [...] Apenas o ícone deve ser preservado [...] deve ter um botão
    // 'Trena 3D' e um botão 'Polilinha 3D'. Ao clicar em um desativa o
    // outro." Agora é só um MODO da própria "📏 Trena 3D" — este único
    // campo decide o comportamento/rótulo/ícone do MESMO botão/seção de
    // sempre (ver view3d.js `_trena3DClick`/`_renderHotbar`, e o segmented
    // control "trena3d-modo" logo na seção "📏 Trena 3D" abaixo).
    trena3DModo: 'trena', // 'trena' (padrão, 2 pontos) | 'poli' (N pontos, ENTER conclui)
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser possível definir a
    // cor das linhas guia. Atualmente elas são desenhadas com verde. E na
    // preview está como azul. Deve ser azul para ambos, como padrão. Deve
    // ser possível selecionar a cor do texto da medida que deve ter a mesma
    // cor já selecionada, como padrão." CAUSA da inconsistência verde/azul:
    // a cor de verdade (`_trena3DAtualizarGuiaGrade`/`_trena3DRebuildLines`,
    // bloco 'guiaGradeFinalizada') era fixa no código (`0xb7ff5e`, verde),
    // enquanto o preview estático dentro de Configurações 3D
    // ('_trena3DDesenharPreviewGuiaGrade') já usava azul (`#5ec8ff`) sem
    // nenhuma ligação com a cor de verdade — 2 valores fixos e diferentes,
    // nunca configuráveis. Agora, mesmo padrão de campo separado por "parte"
    // já usado em `trena3DGuiaChaoCorLinha`/`trena3DGuiaChaoCorTexto`
    // (RODADA 98) — line e texto com cor PRÓPRIA, cada uma configurável,
    // ambas com o MESMO azul como padrão (pedido verbatim: "Deve ser azul
    // para ambos, como padrão" / "cor do texto [...] que deve ter a mesma
    // cor já selecionada, como padrão" — os 2 defaults abaixo são
    // literalmente o mesmo valor, `#5ec8ff`, o mesmo azul que já era usado
    // no preview estático).
    trena3DGuiaGradeCorLinha: '#5ec8ff',
    trena3DGuiaGradeCorTexto: '#5ec8ff',
    // [17/09/2026 UTC] NOVO (RODADA 114) — espessura/estilo/dash da "Guia de
    // grade do mundo" — pedido verbatim: "além de poder controlar a cor,
    // deve ser possível definir a espessura das linhas guia e se são
    // sólida, tracejada ou pontilhada. o line dash deve ser possível
    // controlar (quando aplicável)." Padrão 'solida' preserva a aparência
    // de sempre (linha sólida, técnica de cilindro — ver
    // `_trena3DBuildFatLine`); 2,4cm é o dobro do raio de 0,012m já usado
    // pela versão "ao vivo" de sempre (o valor que prevalece agora que a
    // espessura é 1 SÓ campo compartilhado por ao vivo/finalizada — antes
    // eram 2 raios fixos e ligeiramente diferentes no código).
    trena3DGuiaGradeEspessuraCm: 2.4,
    trena3DGuiaGradeEstiloLinha: 'solida', // 'solida' | 'tracejada' | 'pontilhada'
    trena3DGuiaGradeDashCm: 12,
    trena3DGuiaGradeGapCm: 8,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "desenhar um gradeado dentro
    // do ladrilho de mundo que está sendo alvo no momento, conforme o snap
    // definido [...] Por padrão ativado." Ver view3d.js
    // `_trena3DAtualizarGradeSnapLadrilho`.
    trena3DGradeSnapLadrilhoAtiva: true,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ter uma opção (sobre o
    // gradeado) que o desenhe 'nos quatro ladrilhos do entorno', do 'jeito
    // atual' ou 'metade de cada ladrilho do entorno'." Ver view3d.js
    // `_trena3DAtualizarGradeSnapLadrilho`.
    trena3DGradeSnapLadrilhoModo: 'atual',
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser possível controlar
    // a espessura das linhas guias do gradeado no ladrilho do mundo. Por
    // padrão deve ser a metade do que é atualmente." Ver view3d.js
    // `_trena3DAtualizarGradeSnapLadrilho` (tamanho, em pixels, de cada
    // "pontinho" do gradeado — `THREE.PointsMaterial.size`).
    // [16/09/2026 UTC] ATUALIZADO — pedido verbatim: "Em '📏 Trena 3D —
    // Gradeado do ladrilho mirado', em 'Espessura', o padrão deve ser 1."
    // (era 3).
    trena3DGradeSnapEspessuraPx: 1,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "O pontilhado do gradeado do
    // ladrilho do mundo deve ser [1,2]." — [traço, vão] em cm, decidindo o
    // espaçamento entre os "pontinhos" (`_trena3DAtualizarGradeSnapLadrilho`).
    // [16/09/2026 UTC] ATUALIZADO — pedido verbatim: "em 'Vão', o padrão
    // deve ser '1,5'." (era 2).
    trena3DGradeSnapDashCm: 1,
    trena3DGradeSnapGapCm: 1.5,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "deve ser possível escolher a
    // cor do gradeado (que, atualmente, é um azul. Esta deve ser a cor
    // padrão...)." Hex igual ao que já estava fixo no código de
    // `view3d.js` (`_trena3DAtualizarGradeSnapLadrilho`, `0x7fd8ff`) — só
    // virou configurável, sem mudar a aparência padrão de quem já usava.
    trena3DGradeSnapCor: '#7fd8ff',
    // Pedido do usuário (28/08/2026, rodada do Modelador 3D): "Não use
    // antialiasing" — padrão mudado de `true` pra `false` (desligado custa
    // menos GPU, e é o visual "cru" que o Blender também usa no viewport por
    // padrão); só pega efeito reabrindo o 3D (ver engine3d.js _initThree).
    antialiasing3D: false,
    // NOVO (07/09/2026), pedido verbatim do usuário: "Coloque nas
    // 'configurações 3D', em uma seção de 'Efeitos de tela' este efeito de
    // escurecimento, quando está sem o 'colorSpace: THREE.SRGBColorSpace'
    // como opção nesta seção." — contexto: a v398 (integração da
    // arquitetura WebGLRenderTarget) introduziu sem querer um escurecimento
    // geral da cena (bug de espaço de cor — render targets não aplicam a
    // conversão linear->sRGB sozinhos, ao contrário do canvas de tela),
    // corrigido na v399 forçando `colorSpace: THREE.SRGBColorSpace` na
    // textura do render target de cada "olho" (ver engine3d.js
    // `_initThree`). Em vez de só corrigir e esquecer, o usuário pediu pra
    // expor esse efeito como uma OPÇÃO visual em "Efeitos de tela" — quem
    // quiser o visual mais escuro/dramático (sem a correção de cor) pode
    // ligar de propósito. `false` (padrão) = com a correção sRGB, visual
    // claro/correto de sempre; `true` = SEM a correção (efeito
    // "escurecido"). Ver engine3d.js `_initThree`/`setConfig`
    // (`_colorSpaceEfeito`/`_applyColorSpaceEfeito`) pra como isto é
    // aplicado na textura do render target de cada "olho".
    // BUG CORRIGIDO (07/09/2026), rodada seguinte, pedido verbatim: "Está
    // sendo necessário sair e entra no 'Ver em 3D' para que seja aplicado.
    // Não precisou recarregar a página, só sair e entrar no 'Ver em 3D'
    // mesmo. Se não for possível aplicar direto, coloque uma informação
    // dizendo 'saia da tela do 3D e entre novamente para aplicar o
    // efeito'." — `setConfig()`/`_applyColorSpaceEfeito()` (engine3d.js) já
    // trocam `this.renderTarget.texture.colorSpace` na hora, mas isso
    // sozinho NÃO bastou na prática (relato confirmado do usuário) — o
    // Three.js aparentemente reaproveita o PROGRAM (shader já compilado) de
    // cada material entre quadros, sem perceber que o `colorSpace` do
    // render target mudou, então a conversão de cor só é recalculada de
    // verdade quando os materiais da cena são reconstruídos do zero (o que
    // acontece ao sair/entrar no "Ver em 3D" — `dispose()`+`new Engine3D`
    // de novo). Sem conseguir testar num navegador de verdade nesta sessão
    // (sem Playwright, restrição do projeto) pra confirmar/corrigir a causa
    // exata dentro do Three.js com segurança, a opção continua tentando
    // aplicar ao vivo (não faz mal, e pode ajudar em algum cenário futuro),
    // mas o rótulo abaixo agora avisa da limitação conhecida — ver
    // `mc-efeito-tela-escurecida3d` mais abaixo.
    efeitoTelaEscurecida3D: false,
    // NOVO (07/09/2026), pedido verbatim: "carregar materiais e definir luz
    // ambiente [...]" — parte que tinha ficado de fora da rodada anterior
    // (materiais/texturas por OBJETO foram implementados; isto aqui é
    // iluminação AMBIENTE da CENA inteira, ver engine3d.js `_updateSky`,
    // que já calculava a intensidade da `THREE.AmbientLight` sozinha a
    // partir da hora do dia — `luzAmbienteIntensidade` é um MULTIPLICADOR
    // em cima desse valor calculado (1 = sem mudança, o comportamento de
    // sempre), não um valor absoluto, pra não brigar com o ciclo dia/noite
    // já existente; `luzAmbienteCor` tinge essa luz (branca por padrão,
    // igual sempre foi).
    luzAmbienteIntensidade: 1,
    luzAmbienteCor: '#ffffff',
    // Metros até a neblina esconder tudo — sempre um NÚMERO livre (não uma
    // chave fixa); o `<select>` só oferece atalhos pros valores mais comuns
    // (20/42/80/150) + "Personalizada…", que revela um campo numérico (ver
    // open() abaixo) pra digitar qualquer valor — pedido do usuário: "deve
    // ter uma opção de 'customizado'... com limite mínimo de 3m" (mínimo
    // aplicado tanto na leitura do campo aqui quanto em
    // Engine3D._renderDistance, por segurança). Ver Engine3D._fogNear pra
    // como um valor bem pequeno (abaixo de ~10m) ainda mantém a neblina
    // coerente (near sempre menor que far).
    renderDistance: 42,
    // FPS "de teto" — 0 = sem limite (padrão). MESMA ideia do campo acima:
    // sempre um número livre, o `<select>` só atalha 30/45/60 + "Personalizado…".
    fpsLimite: 0,
    // Render das luminárias (ver engine3d.js _buildLuminariaMesh/
    // _tintForLight) — pedido do usuário: "o render das lâmpadas deve ser
    // configurável... uma opção que não afete tanto o desempenho com várias
    // lâmpadas". 'dinamico' = luz de verdade (THREE.PointLight, alcance e
    // quantidade já limitados — ver Engine3D.MAX_LUMINARIA_LIGHTS), custa um
    // laço a mais no shader de TODA a cena por luz acesa. 'leve' = sem luz
    // de verdade nenhuma: decidido uma vez só, ao montar a cena (não a cada
    // quadro — pedido do usuário: "para não ficar testando sempre a cada
    // frame, já define como um novo padrão de momento"), quais objetos
    // caem dentro do alcance de alguma luminária e simplesmente CLAREIA a
    // cor deles (custo zero por quadro, só uma mistura de cor na hora de
    // criar o material).
    modoLuminarias3D: 'dinamico', // 'dinamico' (luz de verdade, padrão) | 'leve' (cor, sem luz — melhor p/ várias lâmpadas)
    // Corte por distância de renderização dos objetos/itens/câmeras do mapa
    // (pedido do usuário, 25/08/2026: "crie uma opção para mudar o jeito com
    // que os blocos de objetos são carregados e como é feita a decisão de
    // renderizar ou não eles"). Antes desta opção, a "Distância de
    // renderização" acima só afetava a neblina/far-plane — tudo continuava
    // sendo desenhado de verdade (draw call na GPU), só ficando encoberto
    // visualmente pela neblina. Ver Engine3D._setupCullMeshes/
    // _updateDistanceCulling pro corte de verdade (esconde a malha,
    // `mesh.visible=false`) — paredes/piso/porta/janela ficam sempre
    // visíveis (são a estrutura do ambiente, poucas por natureza).
    // 'objeto': testa CADA objeto contra a distância — simples, sempre
    // exato. 'chunk': agrupa objetos em blocos de `objetoChunkTamanho`
    // metros e testa o BLOCO inteiro — menos testes por quadro em mapas com
    // MUITOS objetos, ao custo de um corte mais grosseiro (só esconde um
    // bloco quando ele sai INTEIRO do alcance).
    objetoRenderModo: 'objeto', // 'objeto' (padrão, sempre exato) | 'chunk' (agrupado, mais barato com muitos objetos)
    objetoChunkTamanho: 10, // metros — só usado no modo 'chunk'
    // [13/09/2026] NOVO — pedido verbatim: "Adicione controles de plano de
    // corte próximo/distante (z_near/z_far) da câmera na seção 'Desempenho
    // 3D'... Deve ser atualizado em tempo real." `cameraZNear` é o plano de
    // corte PRÓXIMO (`THREE.PerspectiveCamera.near`) — 0.1 é o MESMO valor
    // hardcoded de sempre em `Engine3D._initThree`
    // (`new THREE.PerspectiveCamera(72, 1, 0.1, ...)`), então este padrão
    // NÃO muda o comportamento de quem nunca abriu este campo novo.
    // `cameraZFar` é o plano de corte DISTANTE — `null` (padrão) significa
    // "automático", preservando o cálculo dinâmico de sempre a partir da
    // "Distância de renderização" (`Math.max(renderDistance * 2.4, 60)`,
    // ver Engine3D._initThree/setConfig) — só vira um valor fixo quando o
    // usuário mexe neste campo novo. Aplicado ao vivo pelo MESMO mecanismo
    // já usado por TODA a "Desempenho 3D" (MapConfig.set → onChange →
    // Engine3D.setConfig, ver view3d.js `_onMapConfigChange`), sem precisar
    // reabrir "Ver em 3D".
    cameraZNear: 0.1,
    cameraZFar: null,
    // [13/09/2026 UTC] NOVO — pedido verbatim: "No 'Ver em 3D', nas
    // 'configurações 3D', na seção 'Desempenho 3D', coloque uma subseção
    // para definir um limite de objetos a serem renderizados por frame.
    // Quando o contador atingir este limite, nenhum outro objeto é mais
    // desenhado, pulando, então, para o próximo frame. [...] Se já não
    // houver e não for custoso para o processamento, o que está mais
    // próximo do personagem é que deve ter maior prioridade. [...] Por
    // padrão o valor deve ser 1200 objetos. Apesar dos objetos acabarem
    // ficando de fora da renderização da cena, as lógicas devem continuar a
    // serem feita." Diferente de `objetoRenderModo` (esconde de vez quem
    // está fora da distância de renderização/setor — ver Engine3D.
    // _updateDistanceCulling/_updateSectorOcclusionCulling): este é um
    // ORÇAMENTO por quadro, sobre quem JÁ passou pelos outros cortes — ver
    // Engine3D._updateFrameBudgetCulling (novo, chamado em render(),
    // ORDENA por distância — "o que está mais próximo... maior
    // prioridade" — e só desenha os N primeiros). `objetoLimitePorFrameAtivo`
    // (`true` = padrão NOVO, já pedido "ligado") liga/desliga a subseção
    // inteira sem perder o valor digitado.
    objetoLimitePorFrameAtivo: true,
    objetoLimitePorFrame: 1200,
    // ---------- Seção "🧊 Cubo" (pedido do usuário, 28/08/2026): "Assim
    // como no blender, ao inserir o cubo, o centro dele deve ser no meio do
    // cubo. Não apenas no centro da base como é atualmente. Isso deve ser
    // uma opção nas 'configurações 3D' na seção 'Cubo'." — `true` (padrão
    // NOVO, igual ao Blender): o cubo inserido pelo Modelador 3D (botão
    // "🧊 Novo Cubo"/"Modelar em 3D") nasce com a ORIGEM local (0,0,0) —
    // o pivô do gizmo/bolinha de origem — bem no meio geométrico do cubo,
    // não na base. A posição/altura visual onde o cubo aparece NÃO muda
    // (continua nascendo apoiado no chão/superfície mirada) — só onde fica
    // o pivô muda (ver js/modeler/modeler-mesh.js defaultCubeMesh e o
    // ajuste de posição em js/modeler/modeler-render.js
    // buildSceneObjects/js/engine3d.js _buildCustomMeshObject, que agora
    // compensam o deslocamento pra manter a base no mesmo lugar de sempre).
    // Só vale pro cubo NOVO — objetos já modelados/convertidos antes não
    // mudam retroativamente.
    cuboOrigemCentro: true,
    // Pedido do usuário (rodada 48): "ou sempre 'volta centrada na origem'
    // ou volta 'centrada no personagem'" — ver mapview.js
    // _fitViewToMapContent/_personagem2D. Padrão 'personagem' (pedido
    // principal do usuário: "a câmera 2D... deve voltar centralizada no
    // personagem").
    centralizacao2DVolta: 'personagem',
    // ---------- Seção "🐞 Debug" (pedido do usuário, 25/08/2026: "deve
    // haver uma seção nas 'configurações 3D' para opções de debug. O
    // 'transferidor' e o 'prolongamento de linhas tracejadas do objeto'
    // devem ser opcionais cada um. Marcados por padrão") — os dois guias
    // visuais de construção que já existiam viraram OPCIONAIS, cada um com
    // seu próprio interruptor, os dois LIGADOS por padrão (comportamento
    // igual ao de sempre até aqui, ninguém é surpreendido):
    //  - `debugTransferidorAtivo`: o anel/"transferidor" de 8 divisões que
    //    aparece no chão ao girar porta/janela/objeto no Modo Padrão ou no
    //    Giro Livre — ver engine3d.js showRotationProtractor, chamado por
    //    view3d.js _updateBuildGhost.
    //  - `debugProlongamentoAtivo`: a "sombra"/contorno pontilhado no chão +
    //    as 4 linhas verticais de prumo, mostradas quando o ghost do 📦
    //    Objeto está pousado em cima de outro objeto — ver engine3d.js
    //    showGhostFootprintShadow/hideGhostFootprintShadow, chamado por
    //    view3d.js _updateBuildGhost (ramos 'objeto', Modo Padrão e Giro
    //    Livre). Ver também o comentário grande em engine3d.js
    //    _initBuildGhosts sobre `frustumCulled = false` nestas linhas — bug
    //    à parte investigado na mesma leva ("às vezes não aparece todo").
    // [12/09/2026] NOVO — pedido verbatim: "Em 'configurações 3D', na seção
    // 'Debug', coloque um botão para ativar o debug. Ativando o debug,
    // todas as suas opções entram em execução." Interruptor MESTRE da
    // seção inteira — DESLIGADO por padrão (diferente dos interruptores
    // individuais abaixo, que continuam `true`/"ligado" por padrão): agora
    // NENHUMA das opções de debug desta seção (transferidor, prolongamento,
    // alvo-orbital, enquadramento de câmera) executa de verdade a menos que
    // `debugModoAtivo` esteja ligado — os interruptores individuais
    // continuam decidindo QUAIS aparecem quando o modo Debug está ligado,
    // mas o mestre precisa estar ligado primeiro (ver `_isDebugAtivo()`,
    // usado por `_isDebugTransferidorAtivo`/`_isDebugProlongamentoAtivo`/
    // `_isDebugEnquadramentoCameraAtivo`, view3d.js, e por
    // `_drawOrbitTargetDot`, modeler-render.js).
    debugModoAtivo: false,
    debugTransferidorAtivo: true,
    debugProlongamentoAtivo: true,
    // [11/09/2026] NOVO — pedido verbatim: "Ao 'Sair da câmera', o
    // enquadramento ainda fica ativado. Nas 'configurações 3D', na seção
    // 'debug', coloque mais uma opção na lista de ativações deste modo que
    // é o 'Enquadramento de câmera'. Ativo, por padrão." Controla se o
    // "retângulo amarelo"/gizmo de enquadramento (o quadro que representa
    // os limites da câmera calibrada, ver engine3d.js
    // `_fotoFrustumMeshesById`/view3d.js `_activeCamFrameRectPx`) fica
    // visível — mesmo padrão "liga por padrão, `!== false`" dos outros 2
    // interruptores desta seção, logo acima.
    debugEnquadramentoCameraAtivo: true,
    // [17/09/2026 UTC] NOVO (RODADA 123) — pedido verbatim: "imprima junto
    // com o texto (para teste) as coordenadas x e y do canvas. Na esfera
    // vermelha, ao lado dela, imprima as coordenadas x e y da tela também
    // [...] deixe como opções na seção debug das configurações 3D."
    // Diferente dos outros 3 interruptores desta seção (padrão LIGADO,
    // `!== false`), este vem DESLIGADO por padrão (`=== true`, só liga se
    // marcado explicitamente) — é uma ferramenta de diagnóstico bem de
    // nicho (comparar a coordenada de tela calculada pro rótulo com a da
    // esfera vermelha da Trena 3D), não algo que a maioria dos usuários
    // precisa ver. Ver `_isDebugTrena3DCoordenadasAtivo()` (view3d.js).
    debugTrena3DCoordenadasAtivo: false,
    // [17/09/2026 UTC] NOVO (RODADA 125) — pedido verbatim: "Nas
    // 'configurações 3D', na seção de debug, deve ter um botão que habilita
    // aparecer/não aparecer o botão que liga/desliga o debug em algum lugar
    // da tela." Controla a visibilidade do botão flutuante 🐞 (novo nesta
    // rodada, ver view3d.js '_trena3DEnsureDebugBotaoTela') — padrão
    // LIGADO (aparece).
    debugBotaoTelaAtivo: true,
    // ---------- Seção "🌗 Hora do dia" (pedido do usuário, 03/09/2026):
    // "Coloque uma seção, nas 'configurações 3D', para fazer com que se
    // possa escolher entre manhã, dia, tarde e noite. E uma barra com vários
    // fusos [esclarecido pelo usuário: 'trilha de horas do dia', ou seja,
    // 0h-23h, NÃO fusos horários geográficos]. Tanto os botões de manhã,
    // dia, tarde e noite quanto a barra de fusos (fuso horário) alteram o
    // tempo. Alterando uma, a outra deve ficar 'de acordo'."
    // `null` (padrão) = segue o relógio real do aparelho, exatamente como o
    // app já fazia desde o item "Sol e Lua" (ver engine3d.js _skyPalette/
    // _updateSky, que usavam `new Date().getHours()` direto). Um NÚMERO
    // (0 a 23.99, fração = minutos) = hora FIXA escolhida manualmente aqui —
    // _skyPalette/_updateSky passam a usar este valor no lugar da hora real
    // enquanto ele não for `null` de novo (botão "Seguir relógio do
    // aparelho" limpa, voltando ao automático). Os 4 botões (Manhã/Dia/
    // Tarde/Noite) e a barra (trilha de 0h a 23h59) escrevem NO MESMO campo —
    // por isso já ficam automaticamente "de acordo" um com o outro, sem
    // precisar sincronizar nada à parte (ver open() abaixo, mc-hora-*).
    // [13/09/2026 UTC] Terceiro valor possível, a STRING 'mundo' (nunca um
    // número válido, então não colide com os valores manuais acima):
    // botão novo "🌐 Seguir relógio do mundo" — a cena inteira passa a se
    // iluminar pela hora de `window.RelogioMundo.getHoraAtual()` (ver
    // engine3d.js `_horaAtualConfigurada`), mutuamente exclusivo com
    // `null` (relógio do aparelho) e com qualquer hora fixa.
    horaDoDiaManual: null,
    // Pedido do usuário (rodada 45): "No modo Modelador, com a câmera
    // orbital, ela fica apontando para um ponto fixo no espaço do mundo.
    // Faça com que esse ponto seja vísivel. Uma opção nas 'configurações
    // 3D' deve habilitar/desabilitar a exibição desse ponto." — bolinha
    // desenhada em `state.orbit.target` (ver js/modeler/modeler-render.js
    // `_drawOrbitTargetDot`), só no modo de câmera Órbita do Modelador
    // (no modo Livre não existe esse ponto). LIGADA por padrão (o pedido
    // em si já era "faça esse ponto ser visível" — a opção é só pra quem
    // quiser desligar depois).
    modeladorMostrarAlvoOrbital: true,
    // Pedido do usuário (03/09/2026): "No 'Ver em 3D', o anel com os pontos
    // cardeais pode ficar no canto superior direito da tela com 80% do anel
    // [...] Deve ter uma opção nas 'configurações 3D' para habilitar/
    // desabilitar ele." Ver css/style.css .v3d-compass-ring (reposicionado
    // pro canto superior direito + escala 80%) e view3d.js (mostra/esconde
    // o elemento conforme esta config). LIGADA por padrão (comportamento de
    // sempre, só ganhou a opção de desligar).
    bussola3DAtiva: true,
    // Pedido do usuário: "nas configurações 2D, deve haver uma opção de
    // 'miniatura 3D'. É o 3D sendo renderizado em uma janela com a largura
    // do 3D dividida por 10 [...] deve aparecer, por padrão no canto
    // superior direito na grade [...] deve ser possível mover também." Ver
    // mapview.js _mountMinimap3D/_toggleMinimap3D.
    miniatura3DAtiva: false,
    // NOVO (07/09/2026), pedido verbatim: "Nas 'configurações 2D', na seção
    // 'Miniatura 3D', deve haver uma opção para 'fechar janela de miniatura
    // ao sair do Mapa'. Por padrão, fica desabilitada." — desde a correção
    // desta mesma rodada (ver comentário grande em mapview.js
    // _ensureMinimap3DPanel), a miniatura virou um elemento persistente de
    // nível de app que, por padrão, CONTINUA aberta ao trocar de aba (não só
    // no Mapa). Esta opção, quando LIGADA, restaura o comportamento antigo
    // de fechar a miniatura automaticamente (libera o contexto WebGL) ao
    // sair da tela Mapa — ver mapview.js _unmountPlanta.
    miniatura3DFecharAoSairMapa: false,
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser possível mover a
    // janelinha e ativá-la/desativá-la nas 'configurações 2D', na seção
    // 'Trena 3D'. Por padrão, ativado." Ver view3d.js
    // `_trena3DEnsurePainelRapido`.
    trena3DPainelRapidoAtivo: true,
    // [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve haver uma
    // opção do modo como a janelinha vai aparecer [...] Este modo atual é
    // uma delas. E o outro mais simples é o que estava antes." Padrão
    // mantido em 'agrupado' (o modo mais recente/implementado na Rodada
    // 90) — sem indicação clara no pedido de qual deveria ser o padrão.
    // [RODADA 128] PADRÃO MUDADO — pedido do usuário verbatim: "a opção
    // 'Simples, só contornos' deve ser a padrão." Era 'agrupado'.
    trena3DPainelRapidoModo: 'simples', // 'agrupado' (com rótulo de texto por grupo) | 'simples' (padrão — só contornos, sem texto)
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Na subseção da janelinha,
    // deve ser possível selecionar os botões e a ordem em que eles vão
    // ficar na janela [...] tem um sistema de flipagem e reposicionamento
    // que pode ser modularizado (caso ainda não seja) e reaproveitado para
    // isso" (referência ao arraste-com-FLIP de "Ver lista simples" →
    // "Partes de informação em cada linha", JÁ modularizado desde a rodada
    // 28/08/2026 em js/flip.js `window.Flip.makeSortable` — reaproveitado
    // aqui tal e qual, ver a subseção "Janela de acesso rápido" logo
    // abaixo). `trena3DPainelRapidoOrdem`: lista de `campo` (mesmo valor de
    // `_trena3DOpcoesPainelRapido`, ver view3d.js) na ordem escolhida pelo
    // usuário — vazio (padrão) significa "usa a ordem original de código".
    // `trena3DPainelRapidoOcultos`: lista de `campo` que o usuário
    // desmarcou pra NÃO aparecer na janelinha — vazio (padrão) significa
    // "todos aparecem", igual sempre foi antes desta opção existir. Ver
    // view3d.js '_trena3DOpcoesPainelRapidoEfetivas'.
    trena3DPainelRapidoOrdem: [],
    trena3DPainelRapidoOcultos: [],
    // [RODADA 130] Mesmo padrão de `trena3DPainelRapidoOrdem`/`...Ocultos`
    // acima, agora pros GRUPOS de espessura/cor da janelinha (ver
    // view3d.js '_trena3DGruposAjustesPainelRapido'/'_trena3DGruposAjustesEfetivos')
    // — `chave` de cada grupo, não `campo` (namespace separado dos chips de
    // botões, que usam `campo`).
    trena3DPainelRapidoOrdemGrupos: [],
    trena3DPainelRapidoGruposOcultos: [],
    // NOVO (03/09/2026) — "Configurações 2D": pedido do usuário, "nova
    // seção para escolher quais ferramentas continuam visíveis (apenas
    // como botão, fora da janela Ferramentas) mesmo durante o Modo
    // Navegação" — controla os botões da bandeja lateral do mapa 2D (ver
    // mapview.js _mountPlanta/_syncMap2DDrawerUI/_applyFerramentasNavVisiveis).
    // Todos ligados por padrão (mesmo comportamento de quando a bandeja foi
    // introduzida, antes desta opção existir).
    // ATUALIZADO (05/09/2026), pedido verbatim: "na seção 'Ferramentas
    // visíveis em Modo Navegação', todas as ferramentas devem estar ali
    // para poderem ser marcadas ou não (também os botões do cabeçalho)."
    // Cada chave é o `id` de uma ferramenta em mapview.js PTOOLS (as 3 já
    // existentes — reticulo/regua/traco — mantiveram os nomes de sempre por
    // compatibilidade; regua == ferramenta 'medida' do PTOOLS, apelido
    // antigo preservado). As NOVAS entradas nascem desligadas (`false`) —
    // só as 3 de sempre continuam ligadas por padrão, mesmo comportamento
    // de antes desta opção crescer.
    ferramentasNavVisiveis: {
      reticulo: true, regua: true, traco: true, // ligadas por padrão (comportamento de sempre)
      select: false, lasso: false, ellipse: false, 'move-selection': false, 'move-selected': false,
      hand: false, pencil: false, parede: false, porta: false, janela: false, eyedropper: false,
      texto: false, curve: false, formas: false, apagar: false, 'foto-orb': false,
    },
    // NOVO (05/09/2026), pedido verbatim: "Os dois botões ('Réguas' e
    // 'Exibir a grade') devem aparecer no botão lateral direito
    // expansível" + "todas as ferramentas devem estar ali... (também os
    // botões do cabeçalho)". Espelha ferramentasNavVisiveis acima, mas pros
    // botões do CABEÇALHO do Mapa (linha de cima, ver mapview.js
    // _mountPlanta #tbm-*) em vez das ferramentas PTOOLS. Por padrão só
    // "Exibir a grade", "Réguas" e "Encaixar" ficam ligados (pedido
    // explícito do usuário) — o resto nasce desligado.
    botoesCabecalhoNavVisiveis: {
      grade: true, reguas: true, encaixar: true,
      cortar: false, copiar: false, colar: false, imagem: false, desmarcar: false,
      desfazer: false, refazer: false, historico: false, cores: false, camadas: false, ferramentas: false,
    },
    // NOVO (05/09/2026), pedido verbatim: "o 'Réguas' da grade deve ficar
    // habilitada como padrão para o 'modo navegação'. Deve haver uma seção
    // do 'modo navegação' na 'configurações 2D' também para isso. Para
    // definir qual a ação padrão da régua ao ficar no 'modo navegação'.
    // Deve haver uma opção, também, para deixar desabilitada a grade." —
    // ação aplicada TODA VEZ que "🧭 Modo Navegação" é ligado (ver
    // mapview.js _applyModoNavGradeReguaDefaults, chamada por
    // _toggleNavMode E no 1º mount, já que o app abre em Modo Navegação por
    // padrão): 'ligar' força ligado, 'desligar' força desligado, 'manter'
    // não mexe (fica como já estava). Réguas: 'ligar' é o padrão pedido
    // explicitamente. Grade: 'manter' é o padrão (só ganhou a opção de
    // desabilitar, o comportamento de sempre — ficar como estava — não
    // muda sozinho).
    modoNavReguaAcao: 'ligar', // 'ligar' (padrão) | 'desligar' | 'manter'
    modoNavGradeAcao: 'manter', // 'manter' (padrão) | 'ligar' | 'desligar'
    // ---------- Desempenho 2D (mapview.js) — pedido do usuário: "o card de
    // 'Desempenho do 2D' que está nas configurações do app, deve ficar nas
    // configurações 2D" (morava em settings.js, ver histórico ali). Ver
    // mapview.js _loop()/_onRedrawDirtyEvt (modo "sob demanda") e
    // Map2DRenderer/_bufferSecundario. ----------
    desempenho2DModoRedesenho: 'continuo', // 'continuo' (padrão) | 'sobdemanda'
    desempenho2DBufferSecundario: false,
    // ---------- Itens construídos DENTRO do 3D (parede/porta/janela/
    // objeto) — pedido do usuário: "onde ficou a opção de colocar o que for
    // feito no 3D em uma camada a parte ou na camada ativa [...] é pra essa
    // opção ficar nas 'configurações 3D'" (morava em settings.js). Ver
    // view3d.js mount()/_layerIdParaNovosItens. ----------
    // BUG/PEDIDO (03/09/2026) — pedido verbatim do usuário: "Nas
    // 'configurações 3D', na seção 'Itens construídos dentro do 3D', a
    // opção padrão agora deve ser a 'A camada que estava ativa no 2D'." —
    // era 'separada' (camada própria "Adicionados no 3D"); só muda o padrão
    // pra INSTALAÇÕES NOVAS (sem nenhuma preferência salva ainda) — quem já
    // tem uma escolha salva no banco continua com ela, intocada.
    camada3DNovosItens: 'atual', // 'separada' (camada própria "Adicionados no 3D") | 'atual' (a que estava ativa no 2D, ATUAL padrão)
    // ---------- [12/09/2026, RE-CORRIGIDO NESTA RODADA — ver nota abaixo]
    // "Sair da câmera": o que acontece com o ponto de vista do personagem.
    // Pedido verbatim original do usuário: "ao clicar em 'Sair da câmera', a
    // perspectiva que o personagem tinha quando foi clicado em 'Ver
    // através dessa câmera' deve ser preservada [...] deve ter uma seção
    // do objeto 'Câmera' [...] é possível definir se ao clicar em 'Sair da
    // câmera', o personagem 'permanece com o ponto de vista da câmera que
    // está sendo vista naquele momento' ou se 'voltar ao ponto de vista
    // original do personagem [...]'. Deve haver uma seção para o 'Orb de
    // câmera', também, com as mesmas opções. Por padrão, para a câmera e
    // para o 'orb de foto' deve ser 'permanece com o ponto de vista da
    // câmera'." Ver view3d.js `_exitCameraOrbView()`/`_exitFotoCameraView()`.
    //
    // HISTÓRICO desta chave (para não repetir as mesmas idas-e-vindas numa
    // rodada futura):
    // 1) 1ª implementação: UMA chave (`cameraExitViewMode`) compartilhada
    //    entre "Câmeras" E "orb de foto", por engano ("orb de câmera" =
    //    "Câmeras" — ERRADO).
    // 2) CORRIGIDO: usuário esclareceu que "orb de câmera" é sinônimo de
    //    "orb de foto", não de "Câmeras" — viraram 2 chaves independentes
    //    (`cameraExitViewMode` + `fotoOrbExitViewMode` NOVA), com 2 seções
    //    de UI totalmente independentes (mudar uma não afeta a outra).
    // 3) ESTA RODADA (pedido novo, verbatim): "a seção 'Câmera — Sair da
    //    câmera' e a seção 'Orb de câmera — Sair da câmera', na verdade
    //    devem ser uma só, pois já não existe mais 'Orb da câmera' e
    //    'Câmera' (no mapa 2D foi unificado)". INVESTIGAÇÃO FEITA ANTES DE
    //    MEXER (arquivos recém-lidos do disco do usuário, que confirmou ter
    //    editado o projeto FORA desta conversa antes desta rodada): NO
    //    CÓDIGO ATUAL, os 2 tipos de objeto CONTINUAM genuinamente
    //    separados — `js/mapping.js` ainda tem `map.cameras` (tipo
    //    "Câmeras", kind:'camera', caixa+cone) E `map.fotos` (tipo "orb de
    //    foto", esfera+cone+placa, via `DB.addAmbientePhoto`) como arrays
    //    DIFERENTES; `js/mapview.js` ainda tem 2 ferramentas separadas na
    //    barra do mapa 2D ("📷 Câmera" e "🖼️ Orb de foto", linha ~4107);
    //    `js/view3d.js` ainda tem 2 code-paths totalmente separados
    //    (`_enterCameraOrbView`/`_exitCameraOrbView` travando a câmera DE
    //    VERDADE vs. `_enterFotoCameraView`/`_exitFotoCameraView` em modo
    //    espectador) — nenhuma ocorrência de "unific" encontrada em
    //    `mapping.js`/`view3d.js`/`engine3d.js`/`mapconfig.js`. Ou seja, a
    //    unificação descrita pelo usuário NÃO está refletida no código
    //    staged nesta rodada — pode ter sido uma mudança que não chegou a
    //    ser salva, uma confusão de terminologia (mesmo risco já documentado
    //    2x neste arquivo), ou um plano ainda não executado.
    //    DECISÃO (conforme instrução explícita do usuário, mesmo com a
    //    discrepância documentada acima — não deixar as 2 seções
    //    silenciosamente como estavam): as 2 SEÇÕES DE UI foram fundidas
    //    numa só ("Ver através desta câmera — 'Sair da câmera'"), com UM
    //    ÚNICO grupo de radio. Por baixo, para não arriscar quebrar nenhum
    //    dos 2 code-paths (que continuam de fato distintos), a chave
    //    `fotoOrbExitViewMode` foi REMOVIDA dos DEFAULTS e
    //    `view3d.js _fotoOrbExitViewMode()` passou a delegar direto pra
    //    `_cameraExitViewMode()` (mesma leitura de `cameraExitViewMode`) —
    //    ou seja, hoje EXISTE DE FATO só 1 chave persistida
    //    (`cameraExitViewMode`), controlando os 2 code-paths a partir de 1
    //    única seção de UI, exatamente como o usuário pediu. Se uma rodada
    //    futura confirmar que os 2 tipos de objeto foram mesmo unificados
    //    no código (não só seria bom fundir a UI — o código-fonte também
    //    deveria ganhar um tipo só), ou o oposto (usuário volta a querer 2
    //    controles independentes), ajustar aqui e nos 2 lugares citados.
    cameraExitViewMode: 'lockedView', // ÚNICA chave agora (ver histórico acima) — controla tanto "Câmeras" quanto "orb de foto"/"orb de câmera". 'lockedView' (permanece no ponto de vista da câmera — PADRÃO) | 'originalView' (volta ao ponto de vista do personagem de antes de "Ver através desta câmera")
    // ---------- Método de interação de camadas (mapa 2D) — pedido do
    // usuário (03/09/2026): "Percebi que os elementos estão interagindo
    // entre as camadas, eles devem ficar isolados por camada [...] 'isolado
    // por camada' (padrão, só há interação do mouse com a camada atual
    // selecionada...), 'camada atual e camadas abaixo' (há interação com a
    // camada atual e com todas as camadas posicionadas abaixo da atual
    // selecionada)." Ver mapview.js `_layersInteragiveis()`, usado por todo
    // hit-test de clique/arraste (objetos, formas, paredes, pinos de foto
    // etc.) pra filtrar quais camadas contam candidatas ao clique. ----------
    metodoInteracaoCamadas: 'isolado', // 'isolado' (padrão) | 'atual-e-abaixo'
    // "Considerar colisão" / "Modo livre" (pedido do usuário, 25/08/2026,
    // estendido na rodada 50 pra também cobrir objeto/porta/janela, não só
    // parede): "Considerar colisão" (padrão, `ignorarFisica: false`) —
    // colocar um objeto/item apontando pra dentro de uma parede na verdade
    // encosta ele RENTE à parede (o ghost desliza pela parede conforme
    // mira) em vez de atravessá-la, e mirar na LATERAL de outro objeto,
    // porta ou janela já colocados encosta o novo ao lado deles (rodada 50
    // — ver engine3d.js raycastLateral); sem posição válida ali (canto
    // apertado, etc.), o ghost simplesmente não aparece e o clique não
    // coloca nada. "Modo livre" (`ignorarFisica: true`) ignora toda essa
    // colisão lateral de propósito — dá pra colocar uma mesa dentro de uma
    // parede ou de outro objeto, por exemplo. Empilhar um objeto EM CIMA de
    // outro (mesa sobre mesa) é sempre permitido, nos dois modos — não é
    // "física" pro propósito desta opção, é comportamento normal de apoio
    // (ver engine3d.js raycastSurface). Ver view3d.js
    // _resolveObjectWallSnap/raycastLateral/_updateBuildGhost (tool
    // 'objeto') e a seção "🧲 Física de colocação" mais abaixo.
    ignorarFisica: false,

    // ---------- Seção "🧱 Parede" (pedido do usuário, 24/08/2026): sistema
    // de "encaixe" (snap) do desenho de parede DENTRO do 3D (ferramenta
    // "🧱 Parede" da hotbar — ver view3d.js), mais o estilo de JUNÇÃO das
    // quinas (como duas paredes se encontram visualmente). Tudo aqui só
    // afeta a construção de parede em 3D — o editor 2D (mapview.js) sempre
    // teve seu próprio jeito de desenhar retas, sem grade obrigatória, e
    // continua do jeito que já era. Ver view3d.js _resolveWallSnap (o
    // "funil" único que aplica todos os snaps abaixo, na ordem certa) e
    // engine3d.js (construção da malha da junção, `paredeJuncaoTipo`). ----------
    // Snap magnético de grade: ao desenhar uma parede, o ponto mirado
    // "gruda" no múltiplo mais próximo de `paredeSnapGradeTamanho` metros
    // (padrão 20cm) — pedido do usuário: "um snap magnético a cada 20cm
    // (limites de 1cm a 300cm)".
    paredeSnapGradeAtivo: true,
    paredeSnapGradeTamanho: 0.20,
    // "Modificador por Tecla (Hold Key / Toggle)": segurando Shift OU Alt
    // (escolhido aqui) desliga a grade/ângulo e libera o desenho livre, em
    // qualquer coordenada — pedido do usuário. 'nenhuma' desliga o atalho
    // por completo (grade sempre ativa, sem tecla nenhuma soltando).
    // `paredeModificadorInvertido` troca o sentido: com ele ligado, a régua
    // começa DESLIGADA e é a tecla que LIGA o encaixe (em vez de desligar)
    // — pedido do usuário: "um outro botão para inverter essa lógica".
    paredeModificador: 'shift', // 'shift' | 'alt' | 'nenhuma'
    paredeModificadorInvertido: false,
    // Snap de interseção de grade: trava nos cruzamentos da grade de 1m×1m
    // do chão (mesma grade visual do xadrez — ver Engine3D.snapToFloorTileCenter)
    // — "fecha cômodos ortogonais perfeitos".
    paredeSnapIntersecaoGrade: true,
    // Snap de vértice a vértice: trava na PONTA de qualquer parede já
    // desenhada perto do cursor — "evita frestas ou sobreposições feias".
    paredeSnapVertice: true,
    // Snap de trava nas quinas das paredes — reforça especificamente as
    // QUINAS já fechadas por Mapping.analyzeWalls (cantos onde 2+ paredes se
    // encontram), oferecido como opção À PARTE do vértice-a-vértice acima
    // (pedido do usuário listou os dois separadamente) mesmo os dois usando
    // o mesmo mecanismo de "gruda na ponta mais próxima" por baixo — ver
    // _resolveWallSnap, que testa as duas flags juntas.
    paredeSnapQuina: true,
    // Snap de trava ao meio das paredes: trava no PONTO CENTRAL de uma
    // parede já existente — "cria divisões em 'T' perfeitas sem precisar
    // contar blocos".
    paredeSnapMeio: true,
    // Travamento de ângulos: trava a direção do segmento sendo desenhado
    // (a partir do ponto anterior da cadeia) no múltiplo mais próximo de
    // `paredeSnapAnguloIncremento` graus — "permite diagonais precisas
    // mesmo fora dos eixos da grade".
    paredeSnapAngulo: true,
    paredeSnapAnguloIncremento: 45, // 15 | 45 | 90
    // Dimensão mínima de parede (metros) — só no modo LIVRE (grade
    // desligada pela tecla modificadora) — pedido do usuário: "restrinja o
    // comprimento mínimo (ex: 0,3m) para evitar cliques acidentais gerando
    // micro-paredes que corrompem a malha ou a colisão".
    paredeComprimentoMinimo: 0.3,
    // Estilo de junção das quinas (como a malha 3D preenche o encontro de
    // duas paredes) — pedido do usuário, com uma imagem de referência pro
    // 5º tipo ("miter": o que sobra da junção depois de removida a sobra
    // vermelha mostrada na imagem — ver engine3d.js _buildCornerFillMesh
    // pro equacionamento completo). 'atual' = comportamento de sempre
    // (nenhum preenchimento extra na quina — pode deixar uma pequena
    // frincha em ângulos bem fora de 90°, sempre foi assim).
    paredeJuncaoTipo: 'atual', // 'atual' | 'bevel' | 'square' | 'round' | 'miter'

    // ---------- Seção "🚪 Porta / Janela" (pedido do usuário, 25/08/2026):
    // mesmo espírito da seção "🧱 Parede" acima, só que pro encaixe no
    // CENTRO DO QUADRADO de 1m do chão ao posicionar porta/janela "NO AR"
    // (longe de qualquer parede) DENTRO do 3D — ver view3d.js
    // _updateBuildGhost/_placeWithBuildTool/_captureFreeRotatePivot/
    // _isDoorSnapActiveNow, ferramenta 🚪/🪟 da hotbar
    // (Engine3D.snapToFloorTileCenter faz a conta do centro em si). Porta e
    // Janela usam o MESMO código de posicionamento "no ar" (só a malha/
    // altura final diferem — ver showGhostDoorWindow/Mapping.addDoor/
    // addWindow), por isso uma seção só cobre as duas, em vez de duplicar.
    // Encaixada numa parede NÃO passa por aqui — a posição já é travada na
    // própria parede (posAoLongoDaParede), sem noção de "quadrado do chão"
    // ali.
    //
    // Histórico: a peça só travava no centro SEGURANDO Shift (pedido do
    // usuário, 24/08/2026). Virou o padrão em seguida (pedido do usuário,
    // 25/08/2026: "O travar no centro do bloco deve ser o padrão") — Shift
    // passou a fazer o CONTRÁRIO (segurar LIBERA). Esta seção deixa os dois
    // lados configuráveis, em vez de fixos no código — mesmo "Modificador
    // por tecla" da seção 🧱 Parede acima, com o SENTIDO PADRÃO invertido
    // (aqui o padrão É travado; lá o padrão é livre) — ver
    // `portaSnapModificadorInvertido` abaixo e _isDoorSnapActiveNow.
    portaSnapCentroBlocoAtivo: true,
    // "Modificador por Tecla" — MESMO padrão de `paredeModificador` acima:
    // segurando a tecla escolhida LIBERA a posição (deixa exatamente onde a
    // mira encosta no chão, sem encaixe nenhum) — solte pra voltar a travar
    // no centro. 'nenhuma' desliga o atalho por completo (trava sempre no
    // centro, nenhuma tecla libera). `portaSnapModificadorInvertido` troca
    // o sentido: com ele ligado, a posição começa LIVRE e é a tecla que
    // TRAVA no centro (em vez de liberar) — volta ao comportamento
    // original de antes desta opção virar padrão ("segure Shift pra
    // travar").
    portaSnapModificador: 'shift', // 'shift' | 'alt' | 'nenhuma'
    portaSnapModificadorInvertido: false,
    // Modo de alinhamento ao posicionar solto ("no ar") — pedido do
    // usuário, 25/08/2026: "Para os objetos deve haver uma outra opção de
    // orientação do modelo desse objeto. Servirá para portas, janelas e os
    // outros objetos... A opção é alinhamento do objeto, por exemplo, ficam
    // todos sempre alinhados para o norte, independente do ângulo do
    // jogador, cliques com o botão direito do mouse devem ir reorientando
    // isso de forma circular (norte, leste, sul e oeste)" — era um checkbox
    // liga/desliga; virou uma LISTA de 3 opções (pedido do usuário,
    // 25/08/2026: "além da opção 'alinhamento cardinal'... deve haver uma
    // outra opção em uma lista, que é o alinhamento (norte, leste, sul e
    // oeste) só que conforme o direcionamento do personagem (esta deverá
    // ser a opção padrão)"):
    //  - 'personagem' (PADRÃO NOVO): a peça vira sozinha pra uma das 4
    //    direções fixas — a mais PRÓXIMA de pra onde o jogador está olhando
    //    — sem precisar clicar. Substituiu o antigo padrão ("Modo Padrão",
    //    livre) — decisão explícita do usuário. O botão do meio TAMBÉM
    //    cicla entre as 4 direções aqui (pedido do usuário, 25/08/2026: "no
    //    modo 'conforme direção do personagem', o botão do meio do mouse
    //    deve funcionar também para ir trocando") — só que qualquer
    //    ciclagem manual é DESCARTADA ("reset") assim que o jogador vira o
    //    bastante pra mudar de direção de novo, voltando a acompanhar
    //    automaticamente — ver view3d.js _resolveFreeAlignmentAngle.
    //  - 'cardinal': a peça fica numa das 4 direções fixas, ESCOLHIDA à mão
    //    — o botão do meio do mouse CICLA entre elas (Norte→Leste→Sul→
    //    Oeste) em vez de somar 45°. Comportamento e descrição originais
    //    desta opção PRESERVADOS (pedido do usuário: "preserve ela e a sua
    //    descrição").
    //  - 'padrao': comportamento clássico do app (antes desta rodada) —
    //    gira livre acompanhando pra onde o jogador está olhando, botão do
    //    meio soma 45° por clique.
    // Ver view3d.js _alignmentModeAtual/_resolveFreeAlignmentAngle/
    // _nearestCardinalAngle/handleMiddleClickAction/_updateBuildGhost/
    // _placeWithBuildTool. Só vale pro posicionamento LIVRE ("no ar"/sem
    // travar em parede) — porta/janela encaixada numa parede, e objeto
    // travado numa parede por física, continuam alinhados à parede (não
    // faria sentido físico forçar uma direção fixa ali, furaria a parede) —
    // MESMA prioridade que `_buildManualRot` já tinha nesses dois casos.
    // Uma seção só cobre Porta E Janela (igual ao `portaSnapCentroBlocoAtivo`
    // acima) — as duas já compartilham a seção "🚪 Porta / Janela" inteira
    // neste painel.
    portaJanelaModoAlinhamento: 'personagem', // 'personagem' | 'cardinal' | 'padrao'

    // ---------- Seção "📦 Objeto" (pedido do usuário, 25/08/2026: "Faça o
    // 'Snap magnético de grade', tecla modificadora e o 'inverter lógica'
    // para os demais objetos também") — MESMOS 3 campos/mesma semântica da
    // seção "🧱 Parede" (`paredeSnapGradeAtivo`/`paredeSnapGradeTamanho`/
    // `paredeModificador`/`paredeModificadorInvertido` acima), só que
    // aplicados à ferramenta 📦 Objeto da hotbar em vez da 🧱 Parede — ver
    // view3d.js _isObjectGridSnapActiveNow/_updateBuildGhost/
    // _placeWithBuildTool/_captureFreeRotatePivot (ramo 'objeto', só quando
    // NÃO travado numa parede por física — "ignorar física"/
    // _resolveObjectWallSnap continua tendo a palavra final ali, igual
    // sempre teve). MESMA polaridade padrão da 🧱 Parede (não a invertida
    // da seção 🚪 Porta/Janela acima): grade LIGADA por padrão, a tecla
    // modificadora DESLIGA (libera a posição em qualquer coordenada),
    // `objetoSnapModificadorInvertido` troca o sentido.
    objetoSnapGradeAtivo: true,
    objetoSnapGradeTamanho: 0.20, // metros — mesmo padrão/faixa da grade de parede (1cm a 300cm)
    objetoSnapModificador: 'shift', // 'shift' | 'alt' | 'nenhuma'
    objetoSnapModificadorInvertido: false,
    // Modo de alinhamento pra ferramenta 📦 Objeto — MESMO campo/mesma
    // semântica de `portaJanelaModoAlinhamento` acima (ver comentário
    // grande lá pro pedido do usuário completo, os 3 valores possíveis e o
    // funcionamento de cada um), só que pros demais objetos em vez de
    // porta/janela. Seção própria (em vez de reaproveitar a de Porta/
    // Janela) porque cada ferramenta já tem sua própria seção neste painel,
    // e o usuário pediu explicitamente "na seção de todos os outros
    // objetos deve haver uma opção para isso".
    objetoModoAlinhamento: 'personagem', // 'personagem' | 'cardinal' | 'padrao'

    // ---------- Seção "🔗 Item associado" (pedido do usuário, 26/08/2026):
    // "Assim como no 2D, quando tem um patrimônio associado fica uma
    // bolinha azul e o contorno fica azul. No 3D deve ter esses destaques."
    // Duas opções independentes — ver engine3d.js _addItemAssociadoDestaque
    // (chamado por _buildOneObjectMesh pra qualquer objeto com obj.itemId):
    //  - `itemAssociado3DSelo`: 'plaquinha' (padrão, pedido do usuário) — uma
    //    placa pequena com 🔗 plantada numa altura de visão confortável do
    //    objeto (nunca "no topo" se ele for muito alto — "se o objeto for
    //    muito alto, por exemplo, em cima não daria para ver"); ou 'bolinha'
    //    — uma bolinha azul com 🔗, mesmo visual do selo do mapa 2D (ver
    //    mapview.js _drawFormaShape).
    //  - `itemAssociado3DContorno`: contorno azul nas arestas do objeto,
    //    mesma cor do contorno do 2D (`#4f8cff`) — OPCIONAL, ligado por
    //    padrão (pedido do usuário: "o contorno azul no 3D deve ser
    //    opcional... ativado por padrão").
    // Mudar qualquer um dos dois com o 3D já aberto remonta a cena (mesmo
    // mecanismo de paredeJuncaoTipo/modoLuminarias3D — ver view3d.js
    // _onMapConfigChange), já que a malha do destaque é montada junto com o
    // objeto em si, não recalculada a cada quadro.
    itemAssociado3DSelo: 'plaquinha', // 'plaquinha' (padrão) | 'bolinha'
    itemAssociado3DContorno: true,

    // "Destacar mais" (pedido do usuário, 26/08/2026): "Deve haver algum
    // jeito de destacar mais ainda os objetos patrimoniados e itens
    // (patrimônios não associados a um objeto, mas que foram colocados no
    // mapa com aquele objeto padrão com formato de pirâmide) ativando algum
    // checkbox." Ampliado (pedido do usuário, 26/08/2026 — 2ª rodada): "De
    // modo que tanto o 2D quanto o 3D tenham os dois jeitos de dar o
    // 'destaque a mais'." — dois EFEITOS independentes, cada um com seu
    // próprio interruptor NOS DOIS contextos (2D e 3D) — dá pra ligar um só,
    // os dois juntos, ou nenhum, em cada tela separadamente:
    //  - "raio azul": no 3D, um facho de luz vertical (ver engine3d.js
    //    _addBeaconDestaque) — no 2D (vista de cima, onde um facho VERTICAL
    //    não dá pra desenhar de verdade), um brilho/glow azul preenchido ao
    //    redor do objeto/pino (ver mapview.js
    //    _drawDestaqueExtraRaioObj/_drawDestaqueExtraRaioPin), a mesma ideia
    //    "vista de cima". Pedido do usuário: "o padrão deve ser o raio azul
    //    para o 3D" — ligado por padrão só no 3D.
    //  - "anel dourado": no 2D, o anel já existente desde a 1ª rodada (ver
    //    mapview.js _drawDestaqueExtraObj/_drawDestaqueExtraPin) — no 3D, um
    //    halo dourado horizontal no chão, na base do objeto/pino (ver
    //    engine3d.js _addAnelDouradoDestaque3D). Pedido do usuário: "e o
    //    'dourado' para o 2D" — ligado por padrão só no 2D.
    // Somados por cima do contorno/selo/cor de sempre — nenhum dos dois
    // substitui o destaque padrão de "item associado", só reforça.
    destaqueExtra3DRaioAtivo: true,
    destaqueExtra3DDouradoAtivo: false,
    destaqueExtra2DDouradoAtivo: true,
    destaqueExtra2DRaioAtivo: false,
    // "Desenhar objetos com transparência" no mapa 2D (pedido do usuário,
    // rodada 50) — desligada por padrão; ver seção "📦 Objeto" (2D) mais
    // abaixo e mapview.js render()/_layerOpacity.
    objetoTransparencia2DAtivo: false,

    // "Ver através das paredes" (pedido do usuário, 26/08/2026: "um botão
    // para habilitar ver as plaquinhas/bolinhas de patrimônios 'através' das
    // paredes"; ampliado 26/08/2026 — 3ª rodada: "deve ser uma subseção com
    // três opções que podem ser marcadas individualmente") — TRÊS
    // interruptores independentes, um por peça visual, cada um controlando o
    // MESMO `depthTest:false` que já garantia (sempre, sem opção) que cada
    // peça nunca ficasse escondida atrás do PRÓPRIO objeto; ligado (padrão em
    // todos os três) essas peças TAMBÉM ignoram paredes/outros objetos na
    // frente, ficando visíveis "através" deles (bom pra achar rápido um
    // patrimônio atrás de uma parede em vez de ter que contornar/entrar no
    // cômodo). Desligando um deles, só AQUELA peça passa a respeitar
    // profundidade normal (esconde atrás de paredes, igual uma malha real
    // ficaria) — as outras duas continuam do jeito que estavam.
    //  - `itemBadge3DAtravesParedesAtivo`: a plaquinha/bolinha de "🔗 item
    //    associado" e as flags de duplicação/multi-item (ver engine3d.js
    //    _addItemAssociadoDestaque).
    //  - `anelDourado3DAtravesParedesAtivo`: o halo dourado do "Destacar mais"
    //    (ver engine3d.js _addAnelDouradoDestaque3D).
    //  - `raioAzul3DAtravesParedesAtivo`: o facho de luz do "Destacar mais"
    //    (ver engine3d.js _addBeaconDestaque).
    itemBadge3DAtravesParedesAtivo: true,
    anelDourado3DAtravesParedesAtivo: true,
    raioAzul3DAtravesParedesAtivo: true,

    // ---------- Seção "📷 Foto" no contexto 2D (pedido do usuário,
    // 26/08/2026) — opções da ferramenta "📏 Medidas" de "Mapa" → "Foto" (ver
    // ambientephotos.js _drawMedida/_openMedidaValorModal):
    //  - `medidaSetasAtivo`: depois de "✅ Inserir medida", a reta que fica
    //    ganha uma pequena seta em cada ponta (pedido do usuário: "Quando
    //    clicar em inserir medida, a reta que ficar deve ter setas pequenas
    //    nas extremidades") — ligado por padrão, já que é o comportamento
    //    pedido de cara; esta opção só existe pra quem quiser desligar depois.
    //  - `medidaCirculoAposInserirAtivo`: o contorno de círculo vazado que
    //    marca cada ponta (sempre visível enquanto a medida ainda é um
    //    RASCUNHO, pra dar precisão ao posicionar) continua aparecendo depois
    //    de inserida, ou some (deixando só a reta, com a seta se ligada
    //    acima). DESLIGADO por padrão (pedido do usuário, 26/08/2026 — 3ª
    //    rodada: "a opção 'Círculo nas extremidades depois de inserir' vem
    //    desmarcada por padrão") — some por padrão, deixando só a reta (e a
    //    seta, já que essa continua ligada por padrão). Nenhuma das duas
    //    afeta o toque-e-arraste pra reposicionar um vértice já salvo — só a
    //    aparência.
    //  - `medidaReposicionarExtremidadesAtivo` (NOVO, pedido do usuário,
    //    28/08/2026: "ao colocar uma medida sobre a foto, não deve ser
    //    possível mover suas extremidades. Isso deve se tornar uma opção nas
    //    'configurações 2D'... por padrão desabilitada") — controla só o
    //    toque-e-arraste de uma medida JÁ SALVA (ver ambientephotos.js
    //    `_hitTestMedidaVertex`): DESLIGADO por padrão, uma medida inserida
    //    fica fixa, sem jeito de arrastar as pontas por engano. O rascunho
    //    em progresso (antes de tocar em "✅ Inserir medida") continua
    //    arrastável sempre, ligado ou desligado — é assim que a medida é
    //    posicionada a primeira vez.
    medidaSetasAtivo: true,
    medidaCirculoAposInserirAtivo: false,
    medidaReposicionarExtremidadesAtivo: false,

    // NOVO (04/09/2026), pedido verbatim (item 3): "Coloque um habilitador
    // de 'reposicionar pontas', em 'Mapa'->'Foto' também, para os botões
    // equivalentes 'Medidas' e 'Traço guia'." — equivalente de
    // `medidaReposicionarExtremidadesAtivo` logo acima, só que pra "✏️
    // Traço guia" de 'Mapa'->'Fotos' (ambientephotos.js
    // `_tracoReposicionarExtremidadesAtivo`/`_hitTestTracoVertex`) em vez da
    // régua "📏 Medidas". Nome com sufixo "Foto" pra não colidir com
    // `traco2DReposicionarExtremidadesAtivo` (equivalente pro Traço guia do
    // MAPA 2D, conceito irmão mas dado/tela diferente — ver logo abaixo).
    // DESLIGADO por padrão, mesmo motivo de todos os outros: um traço já
    // inserido fica fixo, sem jeito de mexer nas pontas sem querer.
    tracoFotoReposicionarExtremidadesAtivo: false,

    // NOVO (03/09/2026), pedido verbatim: "Deve haver uma seção nas
    // 'configurações 2D' para a ferramenta 'Trena'. E deve ter a opção igual
    // tem na seção 'Fotos', que é, 'Reposicionar medidas feitas pelas suas
    // extremidades'." — equivalente de `medidaReposicionarExtremidadesAtivo`
    // acima, só que pra Trena do MAPA 2D (mapview.js `medidas2d`, ferramenta
    // "📏 Trena" da Planta baixa) em vez da régua de 'Mapa'->'Foto'. Nome com
    // sufixo "2D" pra não colidir com o campo acima (conceitos irmãos, mas
    // dados/telas diferentes). DESLIGADO por padrão, mesmo motivo do
    // equivalente de Foto: uma medida já inserida fica fixa, sem jeito de
    // arrastar as pontas sem querer. Ver mapview.js
    // _medidaReposicionarExtremidadesAtivo2D/_hitTestMedida2DVertex/
    // _onObjectsPointerDown.
    medida2DReposicionarExtremidadesAtivo: false,

    // NOVO (04/09/2026), pedido verbatim: "A ferramenta 'Traço guia',
    // também, deve ter o seu habilitador para poder reposicionar os que já
    // foram inseridos na grade." — MESMO padrão/mesmo espírito de
    // `medida2DReposicionarExtremidadesAtivo` acima, só que pra "✏️ Traço
    // guia" (mapview.js `tracos2d`). DESLIGADO por padrão, mesmo motivo:
    // um traço já inserido fica fixo, sem jeito de mexer nas pontas sem
    // querer. Ver mapview.js _tracoReposicionarExtremidadesAtivo2D/
    // _hitTestTraco2DVertex.
    traco2DReposicionarExtremidadesAtivo: false,

    // ---------- ITEM A1 (rodada 57/v311), pedido do usuário verbatim: "Nas
    // 'configurações 2D', na seção 'Foto', deve ser possível selecionar o
    // tipo de arquivo que é usado ao clicar em 'Baixar esta foto' em
    // 'Mapa'->'Foto'. Se vai ser PNG, JPG, WEBP, etc. Deve ser possível
    // selecionar o tipo para o botão 'Baixar todas'. Por padrão, para
    // ambos, é JPG." — 2 chaves independentes (o usuário pediu
    // explicitamente controles SEPARADOS pros 2 botões), consumidas de
    // verdade em ambientephotos.js `_downloadCurrentPhoto`/
    // `_downloadAllPhotosZip` (ver `_photoFileName`/`_reencodePhotoDataUrl`
    // lá). Valores possíveis: 'jpg' | 'png' | 'webp'. ----------
    fotoDownloadFormatoAtual: 'jpg',
    fotoDownloadFormatoTodas: 'jpg',

    // ---------- RODADA 53 [15/09/2026 UTC], pedido verbatim (item B):
    // "Nas 'configurações 2D', há uma seção '📷 Fotos'. Adicione ali uma
    // opção de atribuição automática de objeto Câmera para vincular à foto
    // tirada [...] Subseção 'Atribuir a um lugar no mapa automaticamente'
    // [...] Opções: 'Não', 'Apenas quando o mapa estiver vazio' e 'Sim'."
    // Valores: 'nao' | 'vazio' | 'sim'. Padrão 'sim' — reproduz o
    // comportamento ATUAL confirmado em capture.js `_autoPlacePhoto`
    // (sempre posicionava automaticamente, sem exceção — ver comentário lá).
    // Consumida por capture.js `_autoPlacePhoto`. ----------
    fotoAutoAtribuirCamera: 'sim',

    // ---------- RODADA 53 [15/09/2026 UTC], pedido verbatim (item C):
    // "deve aparecer uma opção para definir de que jeito. Por exemplo, a
    // distância entre uma câmera e outra, até que número de inserções para
    // trocar de linha. A distância padrão deve ser de '1,2m'. E o
    // coordenada de partida (por padrão '0,0')."
    // RODADA 54 [15/09/2026 UTC]: o seletor visual de direção primária +
    // sentido de quebra de linha (ver `fotoGradeDirPrimaria`/
    // `fotoGradeQuebra` logo abaixo e `#mc-foto-grade-dir` no HTML) FOI
    // implementado nesta rodada — `Mapping.findGridSlot` foi generalizada
    // pra aceitar as 8 combinações possíveis. A rotação (fotoGradeRot*)
    // continua PENDENTE: é a mesma usada pelo fluxo "🗺️ Mover no mapa" de
    // uma foto avulsa (mapview.js `enterPhotoPlacementMode`/
    // `_confirmPhotoPlacement`) — os campos abaixo só guardam o valor, sem
    // UI pra defini-lo nem aplicação em cada câmera da grade ainda (motivo:
    // depende do item "Definir origem no mapa" abaixo, que também ficou
    // pendente — ver progresso-sessao.md RODADA 54). ----------
    fotoGradeDistancia: 1.2,
    fotoGradePorLinha: 6,
    fotoGradeOrigemX: 0,
    fotoGradeOrigemY: 0,
    fotoGradeRotDir: 0,
    fotoGradeRotPerp: 0,
    // RODADA 54 [15/09/2026 UTC], pedido original (reproduzido na RODADA
    // 54): "deve ser possível selecionar se elas vão indo sendo colocadas
    // do ponto de origem definida para a esquerda/direita/cima/baixo. Se,
    // depois de trocar de linha, a próxima linha vai ser para cima ou para
    // baixo". `fotoGradeDirPrimaria` é a direção de avanço dentro de uma
    // linha ('direita'|'esquerda'|'cima'|'baixo'); `fotoGradeQuebra` é o
    // sentido da quebra de linha, sempre PERPENDICULAR à primária
    // ('cima'|'baixo' quando a primária é horizontal, 'esquerda'|'direita'
    // quando é vertical). Padrão preserva o comportamento da RODADA 53
    // (direita, quebrando pra baixo). Ver Mapping.findGridSlot e o
    // seletor visual `#mc-foto-grade-dir` mais abaixo.
    fotoGradeDirPrimaria: 'direita',
    fotoGradeQuebra: 'baixo',

    // [15/09/2026 UTC] NOVO — pedido verbatim: "Deve ter uma opção para
    // considerar colisão com quaisquer objetos. Isto evita a câmera ser
    // colocada dentro de um objeto. No 2D, pode não ser um problema, porém
    // no 3D ela ficaria ocultada." Quando ligado, `capture.js
    // _autoPlacePhoto` testa cada posição candidata da grade
    // (`Mapping.findGridSlot`) contra TODOS os objetos/formas já colocados
    // no mapa (`Mapping.pointCollidesWithAnyObject`, nova função) e pula
    // pra próxima posição da grade (`index+1`, `index+2`, ...) até achar
    // uma livre — nunca fica "preso" numa posição ocupada. Desligado por
    // padrão (`false`) porque é um custo extra de cálculo a cada foto e o
    // comportamento de sempre (grade "cega", sem checar colisão) precisa
    // continuar sendo o padrão pra não surpreender quem já usa o app.
    fotoGradeEvitarColisao: false,

    // [15/09/2026 UTC] NOVO — pedido verbatim: "Nas 'configurações 2D', se
    // ainda não houver uma seção que trate disso, coloque uma seção para
    // definições do mapa 2D. Uma opção é aparecer a origem do mundo.
    // Quando ativada, desenha uma cruz na origem (0,0) da grade do mapa
    // 2D. Por padrão, ela fica ativada." — nova seção "🗺️ Mapa 2D" (ver
    // HTML mais abaixo), só esta opção por enquanto. Lida/desenhada em
    // mapview.js (Map2DRenderer._drawOrigemMundo/_renderFrame). Padrão
    // ligada (`true`).
    mapa2dMostrarOrigemMundo: true,

    // ---------- RODADA 53 [15/09/2026 UTC], pedido verbatim (item D):
    // "Deve haver outra subseção para definir um nome automático para as
    // fotos que são tiradas. Por padrão fica ativada. O nome deve indicar a
    // data e hora [...] 2026-06-07_14-30-00.jpg." Consumida por
    // capture.js `_afterPhotoCaptured` (formata `nome` no momento da
    // captura, respeitando `fotoNomeHoraUTC`). SIMPLIFICADO: a escolha
    // Local/UTC usa um par de rádios simples em vez de reaproveitar o
    // componente visual completo da seção "🌗 Hora do dia" (globinho canvas
    // + trilha de horas arrastável) — ver progresso-sessao.md RODADA 53
    // pro motivo (orçamento da rodada) e o pedido de que uma próxima rodada
    // extraia esse componente pra reúso real. ----------
    fotoNomeAutomaticoAtivo: true,
    fotoNomeHoraUTC: false,
  },
  // NOVO (05/09/2026) — metadados (ícone/rótulo/chave de configuração) de
  // TODAS as ferramentas (mapview.js PTOOLS) e de TODOS os botões do
  // cabeçalho do Mapa 2D (mapview.js #tbm-*), usados só pra gerar a lista
  // de checkboxes da seção "🧭 Ferramentas visíveis em Modo Navegação"
  // (ver open() abaixo) — `chave` é a chave salva em
  // ferramentasNavVisiveis/botoesCabecalhoNavVisiveis (DEFAULTS acima);
  // pra ferramentas, normalmente igual ao `id` do PTOOLS, EXCETO 'medida'
  // (chave legada 'regua', de antes desta ferramenta ganhar esse nome —
  // preservada por compatibilidade com quem já tinha essa configuração
  // salva). A ORDEM aqui é a mesma ordem em que os botões aparecem tanto
  // nesta lista de checkboxes quanto na bandeja lateral (ver mapview.js
  // _mountPlanta HTML do .map2d-drawer).
  NAV_TOOLS: [
    { id: 'select', chave: 'select', icon: '🖱️', label: 'Selecionar' },
    { id: 'lasso', chave: 'lasso', icon: '🎯', label: 'Laço' },
    { id: 'ellipse', chave: 'ellipse', icon: '⭕', label: 'Elipse' },
    { id: 'move-selection', chave: 'move-selection', icon: '⛶', label: 'Mover seleção' },
    { id: 'move-selected', chave: 'move-selected', icon: '✋', label: 'Mover selecionados' },
    { id: 'hand', chave: 'hand', icon: '🖐️', label: 'Mão' },
    { id: 'pencil', chave: 'pencil', icon: '✏️', label: 'Lápis' },
    { id: 'parede', chave: 'parede', icon: '🧱', label: 'Parede' },
    { id: 'porta', chave: 'porta', icon: '🚪', label: 'Porta' },
    { id: 'janela', chave: 'janela', icon: '🪟', label: 'Janela' },
    { id: 'eyedropper', chave: 'eyedropper', icon: '💧', label: 'Conta-gotas' },
    { id: 'texto', chave: 'texto', icon: '🔤', label: 'Texto' },
    { id: 'curve', chave: 'curve', icon: '∿', label: 'Reta/Curva' },
    { id: 'formas', chave: 'formas', icon: '⬡', label: 'Formas' },
    { id: 'apagar', chave: 'apagar', icon: '🗑️', label: 'Apagar' },
    { id: 'reticulo', chave: 'reticulo', icon: '📐', label: 'Retículo métrico' },
    { id: 'medida', chave: 'regua', icon: '📏', label: 'Trena (de medir)' }, // chave legada 'regua'
    { id: 'traco', chave: 'traco', icon: '✏️', label: 'Traço guia' },
    { id: 'foto-orb', chave: 'foto-orb', icon: '🖼️', label: 'Orb de foto' },
  ],
  NAV_HEADER_BUTTONS: [
    { chave: 'cortar', icon: '✂️', label: 'Recortar seleção', sel: '#tbm-cut' },
    { chave: 'copiar', icon: '📋', label: 'Copiar seleção', sel: '#tbm-copy' },
    { chave: 'colar', icon: '📄', label: 'Colar', sel: '#tbm-paste' },
    { chave: 'imagem', icon: '🖼️➕', label: 'Colar/carregar imagem', sel: '#tbm-image' },
    { chave: 'desmarcar', icon: '🚫', label: 'Anular seleção', sel: '#tbm-deselect' },
    { chave: 'desfazer', icon: '↶', label: 'Desfazer', sel: '#tbm-undo' },
    { chave: 'refazer', icon: '↷', label: 'Refazer', sel: '#tbm-redo' },
    { chave: 'grade', icon: '▦', label: 'Exibir a grade', sel: '#tbm-grid' },
    { chave: 'reguas', icon: '📐', label: 'Réguas', sel: '#tbm-rulers' },
    { chave: 'encaixar', icon: '🧲', label: 'Encaixar (snap) na grade', sel: '#tbm-gridsnap' },
    { chave: 'historico', icon: '🕘', label: 'Histórico', sel: '#tbm-history' },
    { chave: 'cores', icon: '🎨', label: 'Cores', sel: '#map-cores' },
    { chave: 'camadas', icon: '🗂️', label: 'Camadas', sel: '#map-layers' },
    { chave: 'ferramentas', icon: '🔨', label: 'Barra de ferramentas', sel: '#tbm-toolsidebar' },
  ],
  _cache: null,
  _listeners: [],

  async get() {
    if (this._cache) return this._cache;
    const saved = await DB.getSetting('mapa3dConfig', {});
    this._cache = { ...this.DEFAULTS, ...saved };
    // BUG EVITADO (05/09/2026) — ferramentasNavVisiveis/
    // botoesCabecalhoNavVisiveis cresceram bastante nesta rodada (ver
    // DEFAULTS acima). O merge `{...DEFAULTS, ...saved}` é RASO — se
    // `saved.ferramentasNavVisiveis` já existir (de uma instalação
    // anterior, salva só com {reticulo,regua,traco}), ele SUBSTITUIRIA o
    // objeto inteiro do DEFAULTS, fazendo as ferramentas novas (select,
    // parede, etc.) nascerem sem a chave — e a checagem `!== false`
    // (ver open()) as trataria como "visível" por padrão, ao contrário do
    // pedido explícito (só reticulo/regua/traco visíveis por padrão).
    // Corrigido fazendo um merge PROFUNDO manual só destas 2 chaves,
    // preservando qualquer escolha já salva pelo usuário.
    if (saved.ferramentasNavVisiveis) this._cache.ferramentasNavVisiveis = { ...this.DEFAULTS.ferramentasNavVisiveis, ...saved.ferramentasNavVisiveis };
    if (saved.botoesCabecalhoNavVisiveis) this._cache.botoesCabecalhoNavVisiveis = { ...this.DEFAULTS.botoesCabecalhoNavVisiveis, ...saved.botoesCabecalhoNavVisiveis };
    // Migração pontual: "Desempenho do 2D" e "itens construídos dentro do
    // 3D" moraram em "Configurações do app" (settings.js) até esta rodada
    // (pedido do usuário: mover pra "Configurações 2D"/"Configurações 3D",
    // ver comentários nas 3 chaves acima em DEFAULTS) — lá, cada opção era
    // salva SOLTA no banco (DB.setSetting direto), não dentro deste objeto
    // único. Se `saved` ainda não tem alguma dessas 3 chaves mas existe um
    // valor solto de antes, herda esse valor aqui (só nesta 1ª leitura, e
    // só as que faltarem) — sem isto, quem já tinha escolhido "sob
    // demanda"/"atual" veria a configuração voltar sozinha pro padrão, sem
    // aviso nenhum.
    const faltando = ['desempenho2DModoRedesenho', 'desempenho2DBufferSecundario', 'camada3DNovosItens'].filter((k) => !(k in saved));
    if (faltando.length) {
      const legado = await Promise.all(faltando.map((k) => DB.getSetting(k, undefined)));
      const patch = {};
      faltando.forEach((k, i) => { if (legado[i] !== undefined) patch[k] = legado[i]; });
      if (Object.keys(patch).length) {
        this._cache = { ...this._cache, ...patch };
        await DB.setSetting('mapa3dConfig', this._cache);
      }
    }
    return this._cache;
  },

  async set(patch) {
    const cur = await this.get();
    this._cache = { ...cur, ...patch };
    await DB.setSetting('mapa3dConfig', this._cache);
    this._listeners.forEach((fn) => { try { fn(this._cache); } catch (e) { console.warn('Listener de MapConfig falhou:', e); } });
    return this._cache;
  },

  /** [13/09/2026 UTC] NOVO — pedido verbatim: "Na 'Trilha de horas do dia',
   *  ao variar o valor na barra, a aplicação do efeito deve ser imediata.
   *  Atualmente, a aplicação do efeito só acontece, quando se solta o
   *  botão esquerdo do mouse." CAUSA RAIZ: o wiring da trilha só chamava
   *  `set()` (persiste no IndexedDB) no evento 'change' (solta o botão);
   *  no 'input' (a cada passo do arraste) só atualizava o TEXTO do label,
   *  nunca a cena. Simplesmente chamar `set()` a cada 'input' funcionaria
   *  visualmente, mas um `<input type="range">` dispara 'input' MUITAS
   *  vezes por segundo durante um arraste — gravar no banco a cada uma
   *  seria caro/desnecessário (a pessoa pode nem soltar no valor final
   *  "de verdade"). `previewSet` resolve isso: atualiza `this._cache` e
   *  avisa os mesmos `onChange` listeners (Engine3D/MapView reagem na hora,
   *  igual `set()`) SEM tocar no IndexedDB — quem chama continua
   *  responsável por, ao FIM do gesto (evento 'change'), chamar `set()`
   *  normal uma vez só, pra persistir de verdade (ver wiring de
   *  #mc-hora-trilha, mais abaixo). */
  previewSet(patch) {
    this._cache = { ...(this._cache || {}), ...patch };
    this._listeners.forEach((fn) => { try { fn(this._cache); } catch (e) { console.warn('Listener de MapConfig falhou:', e); } });
    return this._cache;
  },

  /** Chamado sempre que a config muda (por este painel OU por qualquer outro
   *  lugar) — usado pelo Engine3D/MapView pra reagir na hora (ex: religar o
   *  raycast) sem precisar reabrir a tela. */
  onChange(fn) { this._listeners.push(fn); },

  /** [17/09/2026 UTC, RODADA 116] NOVO — mesmo padrão de `previewSet`
   *  acima (ver comentário grande lá: "a aplicação do efeito deve ser
   *  imediata [...] Simplesmente chamar `set()` a cada [passo] seria
   *  caro/desnecessário"), só que genérico e sem exigir que quem chama
   *  distinga "ainda arrastando" de "gesto terminado" — útil pro widget
   *  "botão triplo" (`ModelerUI._createNumField`), cujo `onCommit` dispara
   *  a cada passo do arraste/seta SEM avisar quando o gesto termina de
   *  verdade. Aplica na hora via `previewSet` (efeito visual imediato,
   *  gratuito) e agenda a persistência de verdade (`set()`, grava no
   *  IndexedDB) pra depois de `delayMs` ms SEM nenhuma chamada nova
   *  (debounce por `chave` — cada campo tem seu próprio timer, então
   *  arrastar um campo não atrasa a gravação de outro que tenha terminado
   *  antes) — na prática, grava 1x só quando o usuário para de mexer
   *  naquele campo (solta o arraste, ou termina de clicar nas setas),
   *  igual ao `previewSet`+`set()` manual de "Hora do dia", sem precisar
   *  replicar a lógica de debounce em cada chamador. */
  _debouncedPersist(chave, patch, delayMs = 400) {
    this.previewSet(patch);
    if (!this._debouncePersistTimers) this._debouncePersistTimers = {};
    clearTimeout(this._debouncePersistTimers[chave]);
    this._debouncePersistTimers[chave] = setTimeout(() => { this.set(patch); }, delayMs);
  },

  // NOVO (03/09/2026) — seção "🌗 Hora do dia": formata um número de hora
  // fracionário (ex.: 13.5) como "13:30", pro label ao lado da trilha.
  _formatHora(h) {
    const hn = ((Number(h) || 0) % 24 + 24) % 24;
    const hh = Math.floor(hn);
    const mm = Math.round((hn - hh) * 60) % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  },

  // [13/09/2026 UTC] CAUSA RAIZ do bug relatado ("globo preto, parado e
  // não interativo com 'Seguir relógio do mundo' ativo"):
  // `RelogioMundo.getHoraAtual()` devolve um OBJETO
  // `{horas, minutos, segundos, diaDaSemana}` (ver relogio-mundo.js),
  // NUNCA um número decimal — todo lugar que fazia
  // `window.RelogioMundo.getHoraAtual() ?? algumNumero` e depois usava o
  // resultado direto em conta matemática (`% 24`, etc.) estava, na
  // prática, sempre operando com NaN (objeto não é número), sem nenhum
  // erro visível — daí o globo "travado" (RAF para na primeira exceção
  // silenciosa de coordenada NaN) e a trilha nunca realmente acompanhando.
  // Este helper centraliza a conversão certa (objeto → número decimal de
  // 0 a 23.999) — usar SEMPRE este, nunca o retorno de getHoraAtual()
  // direto em conta numérica.
  _horaMundoDecimal() {
    const h = window.RelogioMundo?.getHoraAtual?.();
    if (h && typeof h === 'object' && !isNaN(Number(h.horas))) {
      return Number(h.horas) + Number(h.minutos || 0) / 60 + Number(h.segundos || 0) / 3600;
    }
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  },

  // [13/09/2026 UTC] Globo 3D wireframe da seção "🌗 Hora do dia" — pedido
  // verbatim: "Coloque um globo 3D ao lado do botão 'Noite' com a
  // referência do meridiano de greenwich (não só o meridiano, mas também
  // um pontinho indicando 'Londres')... Ao mudar a hora do dia... o globo
  // se reorienta com uma animação de movimento. A inclinação de 23,5 graus
  // deve ser representada e o globinho deve ser wireframe. Ao avançar no
  // dia o globinho gira para a esquerda e, ao retroceder o dia, o globinho
  // gira para a direita... Deve ser possível clicar e arrastar (com cursor
  // infinito)... Deve haver uma linha (semicírculo 3D) para indicar o
  // ponto atual da hora... referências simples de continentes."
  //
  // Implementado como projeção manual (sem THREE — esta tela de
  // configurações pode abrir sem o motor 3D carregado) de uma esfera
  // wireframe num <canvas 2D>: cada ponto 3D (x,y,z) é rotacionado pela
  // inclinação axial fixa (23.5°) + pela longitude atual (que representa
  // a hora — 360°/24h = 15°/h) e projetado ortograficamente (só x,y, z
  // descartado exceto pra decidir o que fica "atrás" — linhas com z<0 são
  // desenhadas mais claras/finas, dando a ilusão de esfera sem precisar
  // de um motor 3D de verdade).
  //
  // "Avançar no dia gira pra esquerda, retroceder gira pra direita": a
  // Terra de verdade gira pra LESTE (fazendo o Sol nascer a leste) — aqui
  // é só uma convenção visual pedida explicitamente, então a longitude do
  // globo é `-hora*15°` (sinal invertido de uma rotação "física" pra
  // direção da tela bater com o pedido).
  /** [15/09/2026 UTC] Resolve o valor "cru" salvo (número fixo | o
   *  `altValue` sentinela do widget, ex. 'mundo'/'utc' | null=automático)
   *  pra uma hora decimal exibível (0-23.999) — usado tanto pelo HTML
   *  inicial quanto pelo wiring do widget "Hora do dia" (ver
   *  `_horaDoDiaWidgetHtml`/`_wireHoraDoDiaWidget` logo abaixo). Extraído
   *  da conta repetida 3x no código original (HTML da trilha, HTML do
   *  globo, `_syncHoraUI`) — pedido verbatim (RODADA 55): "Mapeie as
   *  dependências ... e as torne modulares e reaproveitáveis." */
  _resolveHoraDoWidget(valor, altValue, getAltHoraDecimal) {
    if (valor === altValue) return getAltHoraDecimal ? getAltHoraDecimal() : (new Date().getHours() + new Date().getMinutes() / 60);
    if (valor != null) return Number(valor);
    return new Date().getHours() + new Date().getMinutes() / 60;
  },

  /** [15/09/2026 UTC] Widget reutilizável "Hora do dia" — EXTRAÍDO da seção
   *  3D "🌗 Hora do dia" (antes misturada, no mesmo HTML/wiring, com os
   *  textos de Sol/Lua e SEM fronteira de função própria). Pedido verbatim
   *  (RODADA 55): "Mapeie as dependências das duas situações ('hora do dia'
   *  e 'tela do vincular ao mapa') e as torne modulares e reaproveitáveis."
   *
   *  DEPENDÊNCIAS MAPEADAS do bloco original (antes de extrair):
   *   - Lia `cfg.horaDoDiaManual` (número fixo | 'mundo' | null=automático)
   *     só pra montar o HTML inicial (valor da trilha/label/estado
   *     disabled dos botões) — não guarda estado próprio.
   *   - Escrevia SEMPRE via `this.set({horaDoDiaManual: ...})` (persiste) ou
   *     `this.previewSet({horaDoDiaManual: ...})` (só avisa listeners, sem
   *     tocar no IndexedDB, usado durante o arrasto da trilha/globo) — os
   *     2 métodos já eram genéricos (patch de qualquer chave), então NÃO
   *     precisam de adaptação; o acoplamento real era só o NOME da chave
   *     ('horaDoDiaManual') estar hard-coded dentro do wiring.
   *   - Chamava `this._horaMundoDecimal()` pra saber a "hora do mundo"
   *     quando `horaDoDiaManual === 'mundo'` — específico do uso 3D
   *     (RelogioMundo); no novo uso (nome automático da foto) não existe
   *     hora contínua nenhuma, então esse getter passa a ser OPCIONAL
   *     (`getAltHoraDecimal`), só usado se o widget mostrar globo/trilha.
   *   - `_mountGloboHora`/`_formatHora` já eram funções à parte, sem
   *     dependência de `horaDoDiaManual` (recebem hora pronta) — reusadas
   *     como estão, sem mudança.
   *  MODULARIZAÇÃO: a chave de config, o texto dos botões, o sentinela do
   *  "modo alternativo" (`altValue` — 'mundo' no uso 3D, 'utc' no uso do
   *  nome de foto) e os efeitos (`onPreview`/`onCommit`) agora são
   *  parâmetros — nenhuma menção a `horaDoDiaManual` nem a
   *  `fotoNomeHoraUTC` dentro do widget em si.
   *
   *  `_horaDoDiaWidgetHtml(o)` monta o HTML (sem tocar no DOM ainda —
   *  usado dentro do template gigante de `open()`); `_wireHoraDoDiaWidget
   *  (modal, o)` liga os eventos depois que o modal já está no documento e
   *  devolve `{getHora(), setHora(h), destroy()}` (mesmo padrão de API
   *  usado pelos outros componentes "card" do app).
   *
   *  `o` (comum aos dois):
   *   - idPrefix: prefixo dos ids gerados (ex. 'mc-hora', 'mc-fotonome-hora')
   *   - presets: [{hora, label}] — botões fixos (ex. Manhã/Dia/Tarde/Noite);
   *     [] pra nenhum
   *   - mostrarGlobo / mostrarTrilha: bool — o globo/trilha só fazem
   *     sentido quando existe uma "hora contínua" real pra escolher
   *   - valorAtual: número fixo | altValue | null (automático)
   *   - altValue: sentinela string do "modo alternativo" (ex. 'mundo'/'utc')
   *   - altLabel / autoLabel: texto dos 2 botões "seguir X"
   *   - getAltHoraDecimal: () => hora decimal quando em modo alternativo
   *     (só obrigatório se mostrarGlobo/mostrarTrilha === true)
   *  `o` (só wiring):
   *   - getValorAtual: () => valor cru atual (lido de fora, ex. `cfg.xxx`)
   *   - onPreview(valor): chamado a cada passo do arrasto (trilha/globo)
   *   - onCommit(valor): chamado pra persistir de verdade (preset/mundo/
   *     auto/soltar a trilha ou o globo)
   */
  _horaDoDiaWidgetHtml(o) {
    const idp = o.idPrefix;
    const presetsHtml = (o.presets || []).map((p) => `<button type="button" class="btn secondary ${idp}-preset-btn" data-hora="${p.hora}">${p.label}</button>`).join('');
    const globoHtml = o.mostrarGlobo ? `<canvas id="${idp}-globo" class="mc-hora-globo" width="72" height="72" title="Globo do horário — arraste pra girar (também muda a hora)"></canvas>` : '';
    const horaInicial = this._resolveHoraDoWidget(o.valorAtual, o.altValue, o.getAltHoraDecimal);
    const trilhaHtml = o.mostrarTrilha ? `
          <label class="field" style="margin-top:10px">
            <span class="lbl">Trilha de horas do dia — <span id="${idp}-trilha-label">${this._formatHora(horaInicial)}</span></span>
            <input type="range" id="${idp}-trilha" class="mc-hora-trilha" min="0" max="23.983" step="0.25" value="${horaInicial}">
          </label>` : '';
    const ehAlt = o.valorAtual === o.altValue;
    const ehAuto = o.valorAtual == null;
    return `
        <div id="${idp}-widget">
          ${(presetsHtml || globoHtml) ? `<div class="mc-hora-botoes" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center">${presetsHtml}${globoHtml}</div>` : ''}
          ${trilhaHtml}
          ${o.altLabel ? `<button type="button" class="btn secondary block" id="${idp}-alt" style="margin-top:8px" ${ehAlt ? 'disabled' : ''}>${o.altLabel} ${ehAlt ? '(ativo)' : ''}</button>` : ''}
          ${o.autoLabel ? `<button type="button" class="btn secondary block" id="${idp}-auto" style="margin-top:8px" ${ehAuto ? 'disabled' : ''}>${o.autoLabel} ${ehAuto ? '(ativo)' : ''}</button>` : ''}
        </div>`;
  },

  _wireHoraDoDiaWidget(modal, o) {
    const idp = o.idPrefix;
    const trilhaEl = o.mostrarTrilha ? modal.querySelector(`#${idp}-trilha`) : null;
    const trilhaLabelEl = o.mostrarTrilha ? modal.querySelector(`#${idp}-trilha-label`) : null;
    const autoBtnEl = modal.querySelector(`#${idp}-auto`);
    const altBtnEl = modal.querySelector(`#${idp}-alt`);
    const globoEl = o.mostrarGlobo ? modal.querySelector(`#${idp}-globo`) : null;
    const getHoraExibidaAtual = () => this._resolveHoraDoWidget(o.getValorAtual(), o.altValue, o.getAltHoraDecimal);
    const syncUI = (valor) => {
      const ehAlt = valor === o.altValue;
      const horaExibida = this._resolveHoraDoWidget(valor, o.altValue, o.getAltHoraDecimal);
      if (trilhaEl) trilhaEl.value = String(horaExibida);
      if (trilhaLabelEl) trilhaLabelEl.textContent = this._formatHora(horaExibida);
      if (autoBtnEl) { autoBtnEl.disabled = valor == null; autoBtnEl.textContent = `${o.autoLabel} ${valor == null ? '(ativo)' : ''}`; }
      if (altBtnEl) { altBtnEl.disabled = ehAlt; altBtnEl.textContent = `${o.altLabel} ${ehAlt ? '(ativo)' : ''}`; }
      globoApi?.setHora(horaExibida);
    };
    const globoApi = globoEl ? this._mountGloboHora(
      globoEl,
      getHoraExibidaAtual,
      (hora, solto) => {
        if (solto) { o.onCommit(hora); syncUI(hora); }
        else { o.onPreview(hora); if (trilhaEl) trilhaEl.value = String(hora); if (trilhaLabelEl) trilhaLabelEl.textContent = this._formatHora(hora); }
      }
    ) : null;
    modal.querySelectorAll(`#${idp}-widget .${idp}-preset-btn`).forEach((b) => {
      b.addEventListener('click', async () => {
        const h = Number(b.dataset.hora);
        await o.onCommit(h);
        syncUI(h);
      });
    });
    altBtnEl?.addEventListener('click', async () => { await o.onCommit(o.altValue); syncUI(o.altValue); });
    autoBtnEl?.addEventListener('click', async () => { await o.onCommit(null); syncUI(null); });
    trilhaEl?.addEventListener('input', () => {
      const h = Number(trilhaEl.value);
      if (trilhaLabelEl) trilhaLabelEl.textContent = this._formatHora(h);
      o.onPreview(h);
      globoApi?.setHoraImediato(h);
    });
    trilhaEl?.addEventListener('change', async () => {
      const h = Number(trilhaEl.value);
      await o.onCommit(h);
      syncUI(h);
    });
    return { getHora: getHoraExibidaAtual, setHora: (h) => syncUI(h), destroy: () => globoApi?.destroy() };
  },

  _mountGloboHora(canvas, getHora, onArrastarHora) {
    if (!canvas || canvas._globoMontado) return canvas._globoApi || null;
    canvas._globoMontado = true;
    const ctx2d = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 4;
    const TILT = 23.5 * Math.PI / 180; // inclinação axial pedida
    // Continentes MUITO simplificados — só um punhado de pontos por
    // "massa de terra" em (lat,lon) graus, unidos em linha poligonal
    // aberta, o suficiente pra servir de referência visual, sem
    // pretensão de precisão geográfica.
    const CONTINENTES = [
      [[60, -10], [50, 0], [36, -6], [15, -17], [5, 10], [-15, 15], [-35, 20], [-10, 30], [10, 40], [30, 35], [45, 30], [55, 20], [60, -10]], // Europa/África/Ásia oeste (contorno aproximado)
      [[70, -170], [65, -140], [50, -125], [30, -115], [15, -95], [8, -80], [-5, -80], [-20, -68], [-35, -70], [-55, -68], [-33, -58], [10, -75], [25, -100], [45, -100], [60, -150], [70, -170]], // Américas
      [[-12, 130], [-20, 145], [-35, 150], [-32, 115], [-25, 113], [-12, 130]], // Austrália
    ];
    let anguloAtual = -((getHora() % 24) / 24) * Math.PI * 2; // longitude atual (rad)
    let anguloAlvo = anguloAtual;
    let rafId = null;
    let horaExibida = getHora();
    // Arraste manual: enquanto o usuário segura o botão, a rotação passa a
    // ser controlada pelo movimento do mouse (não pela hora configurada) —
    // ao soltar, o ângulo final é convertido de volta em hora e aplicado
    // via `onArrastarHora` (que faz previewSet durante o gesto e set ao
    // soltar, igual à trilha).
    let arrastando = false, lastX = 0;

    function rotY(p, ang) {
      const s = Math.sin(ang), c = Math.cos(ang);
      return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
    }
    function rotX(p, ang) {
      const s = Math.sin(ang), c = Math.cos(ang);
      return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
    }
    function latLonToXYZ(latDeg, lonDeg) {
      const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
      return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
    }
    function transform(p) {
      // ordem: gira em Y (longitude/hora), depois inclina em X (eixo de 23.5°)
      let q = rotY(p, anguloAtual);
      q = rotX(q, TILT);
      return q;
    }
    function proj(p) { return [cx + p[0] * R, cy - p[1] * R]; }

    function linha3D(pontos, cor, largura) {
      for (let i = 0; i < pontos.length - 1; i++) {
        const a = transform(pontos[i]), b = transform(pontos[i + 1]);
        const zMed = (a[2] + b[2]) / 2;
        ctx2d.strokeStyle = cor;
        ctx2d.globalAlpha = zMed < 0 ? 0.28 : 1; // "atrás" da esfera = mais apagado
        ctx2d.lineWidth = largura;
        const pa = proj(a), pb = proj(b);
        ctx2d.beginPath(); ctx2d.moveTo(pa[0], pa[1]); ctx2d.lineTo(pb[0], pb[1]); ctx2d.stroke();
      }
      ctx2d.globalAlpha = 1;
    }

    function desenhar() {
      ctx2d.clearRect(0, 0, W, H);
      // silhueta do globo (leve preenchimento pra dar volume)
      ctx2d.fillStyle = 'rgba(120,170,220,0.08)';
      ctx2d.beginPath(); ctx2d.arc(cx, cy, R, 0, Math.PI * 2); ctx2d.fill();
      // grade de paralelos (latitude, a cada 30°)
      for (let lat = -60; lat <= 60; lat += 30) {
        const pontos = [];
        for (let lon = -180; lon <= 180; lon += 12) pontos.push(latLonToXYZ(lat, lon));
        linha3D(pontos, 'rgba(180,210,255,0.45)', 1);
      }
      // grade de meridianos (longitude, a cada 30°) — o de Greenwich (0°) em destaque
      for (let lon = -180; lon < 180; lon += 30) {
        const pontos = [];
        for (let lat = -90; lat <= 90; lat += 10) pontos.push(latLonToXYZ(lat, lon));
        linha3D(pontos, lon === 0 ? 'rgba(255,210,90,0.95)' : 'rgba(180,210,255,0.3)', lon === 0 ? 2 : 1);
      }
      // continentes (referência simples)
      CONTINENTES.forEach((poli) => linha3D(poli.map(([la, lo]) => latLonToXYZ(la, lo)), 'rgba(150,255,180,0.85)', 1.2));
      // pontinho de Londres (51.5°N, 0°) — sobre o meridiano de Greenwich
      const londres = transform(latLonToXYZ(51.5, 0));
      if (londres[2] > -0.15) {
        const pl = proj(londres);
        ctx2d.fillStyle = '#ffd25a';
        ctx2d.beginPath(); ctx2d.arc(pl[0], pl[1], 2, 0, Math.PI * 2); ctx2d.fill();
      }
      // semicírculo 3D indicando a hora representada — um meridiano
      // "extra" desenhado na longitude 0 do referencial do OBSERVADOR
      // (ou seja, sempre voltado pra quem olha, marcando o ponto do globo
      // que está "de frente" = meio-dia local daquela longitude, servindo
      // de ponteiro visual da hora atual).
      const semic = [];
      for (let lat = -90; lat <= 90; lat += 10) semic.push(latLonToXYZ(lat, 0));
      // desenha este em coordenadas JÁ rotacionadas em Y por -anguloAtual,
      // pra ficar fixo em relação à TELA (não ao globo) — é o "ponteiro".
      ctx2d.strokeStyle = 'rgba(255,120,120,0.9)'; ctx2d.lineWidth = 1.6; ctx2d.globalAlpha = 1;
      ctx2d.beginPath();
      semic.forEach((p, i) => {
        const q = rotX(p, TILT);
        const proj2 = proj(q);
        if (i === 0) ctx2d.moveTo(proj2[0], proj2[1]); else ctx2d.lineTo(proj2[0], proj2[1]);
      });
      ctx2d.stroke();
    }

    function animar() {
      // anima suavemente até `anguloAlvo` sempre que a hora configurada
      // mudar por fora (botões/trilha/auto/mundo) — arraste manual pula
      // a animação (o próprio gesto já é o movimento).
      const diff = anguloAlvo - anguloAtual;
      if (Math.abs(diff) > 0.001) anguloAtual += diff * 0.18;
      else anguloAtual = anguloAlvo;
      desenhar();
      rafId = requestAnimationFrame(animar);
    }
    rafId = requestAnimationFrame(animar);

    // Arraste com "cursor infinito": usa Pointer Lock quando disponível
    // (movementX contínuo, sem o cursor bater na borda da tela); cai pra
    // arraste comum (delta de posição) se o navegador recusar o lock.
    canvas.addEventListener('mousedown', (e) => {
      arrastando = true; lastX = e.clientX;
      canvas.requestPointerLock?.();
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!arrastando) return;
      const dx = (document.pointerLockElement === canvas) ? e.movementX : (e.clientX - lastX);
      lastX = e.clientX;
      anguloAtual += dx * 0.02;
      anguloAlvo = anguloAtual;
      // converte o ângulo de volta em "hora" (mesma convenção invertida
      // usada em `latLonToXYZ`/inicialização: hora = -angulo/(2π)*24)
      let hora = (-(anguloAtual) / (Math.PI * 2)) * 24;
      hora = ((hora % 24) + 24) % 24;
      horaExibida = hora;
      onArrastarHora?.(hora, false);
    });
    window.addEventListener('mouseup', () => {
      if (!arrastando) return;
      arrastando = false;
      document.exitPointerLock?.();
      onArrastarHora?.(horaExibida, true);
    });

    const api = {
      setHora(h) { anguloAlvo = -((((h % 24) + 24) % 24) / 24) * Math.PI * 2; },
      // [13/09/2026 UTC] Pedido: "ao mexer na trilha de horas o globinho
      // deve receber a alteração enquanto se está mexendo na barra, não
      // apenas quando se solta o botão esquerdo do mouse." `setHora` (acima)
      // anima suavemente (lerp) até o alvo — ótimo pra uma mudança "de uma
      // vez" (botão fixo/auto/mundo), mas gera atraso perceptível se
      // chamado a cada pixel de um arraste contínuo (o globo ficaria sempre
      // "correndo atrás" do dedo/mouse). `setHoraImediato` pula o lerp:
      // aplica direto em `anguloAtual` E `anguloAlvo`, pra girar junto com a
      // trilha em tempo real, sem esperar soltar o botão.
      setHoraImediato(h) {
        anguloAtual = -((((h % 24) + 24) % 24) / 24) * Math.PI * 2;
        anguloAlvo = anguloAtual;
      },
      destroy() { if (rafId) cancelAnimationFrame(rafId); canvas._globoMontado = false; },
    };
    canvas._globoApi = api;
    return api;
  },

  /** Remove um listener cadastrado por onChange — usado no unmount de quem
   *  assinou (MapView), pra não empilhar listeners "mortos" (apontando pra
   *  uma tela já fechada) a cada vez que a tela do mapa é reaberta. */
  offChange(fn) { this._listeners = this._listeners.filter((l) => l !== fn); },

  /** [13/09/2026] NOVO — pedido verbatim: "Adicione controles de plano de
   *  corte próximo/distante (z_near/z_far) da câmera na seção 'Desempenho
   *  3D', usando o mesmo componente de 'botão triplo'... Deve ser
   *  atualizado em tempo real." Monta os 2 `ModelerUI._createNumField`
   *  (near/"Início" e far/"Fim") dentro dos `<div>` vazios do HTML da
   *  seção "Desempenho 3D" (ver `open()`), MESMO idioma/estrutura de
   *  `_wireCamPropsFieldset` (js/mapview.js, campos "Corte" da câmera de
   *  foto) — a diferença é que ALI o corte é por câmera/orb individual
   *  (`Engine3D.setClipPlanes`, só ativo enquanto "vendo através" daquela
   *  câmera); AQUI é o corte PADRÃO da câmera de navegação livre
   *  (`camera3.near`/`far` de fábrica, ver Engine3D._initThree/setConfig),
   *  persistido em `MapConfig` como qualquer outra opção de "Desempenho
   *  3D" — por isso passa por `this.set()`, não por uma chamada direta ao
   *  motor 3D. `min: 0.01` (near) evita frustum degenerado
   *  (near<=0 trava o Three.js); `far` não tem teto — o próprio Three.js
   *  já lida bem com valores grandes, e um "Fim" mal digitado só faz o
   *  usuário ver longe demais, nunca quebra nada. */
  _wireDesempenho3DCamPlanes(modal, cfg) {
    if (!window.ModelerUI) return;
    const nearWrap = modal.querySelector('#mc-cam-znear-wrap');
    const farWrap = modal.querySelector('#mc-cam-zfar-wrap');
    let curNear = Number.isFinite(cfg.cameraZNear) && cfg.cameraZNear > 0 ? cfg.cameraZNear : 0.1;
    // `cameraZFar: null` = "automático" (ver DEFAULTS acima) — o campo
    // precisa de um número pra MOSTRAR mesmo nesse caso; usa o mesmo
    // cálculo de fallback do motor (Engine3D._initThree/setConfig) só pra
    // exibição — não é gravado até o usuário efetivamente mexer no campo.
    const rdAtual = Math.max(this.RENDER_DISTANCE_MIN, Number(cfg.renderDistance) || 42);
    let curFar = Number.isFinite(cfg.cameraZFar) && cfg.cameraZFar > 0 ? cfg.cameraZFar : Math.max(rdAtual * 2.4, 60);
    let nearApi = null, farApi = null;
    if (nearWrap) {
      nearApi = ModelerUI._createNumField({
        label: 'Início', value: Math.round(curNear * 100) / 100, step: 0.01, minDecimals: 2, suffix: 'm',
        // passo bem fino (near costuma ser < 1m) — `pxPerStep` menor que o
        // padrão (10) pra não exigir um arraste enorme pra sair de 0.01.
        pxPerStep: 4,
        onCommit: async (v) => {
          curNear = Math.max(0.01, v);
          nearApi?.setValue(Math.round(curNear * 100) / 100);
          await this.set({ cameraZNear: curNear });
        },
      });
      nearWrap.appendChild(nearApi.el);
    }
    if (farWrap) {
      farApi = ModelerUI._createNumField({
        label: 'Fim', value: Math.round(curFar * 10) / 10, step: 10, minDecimals: 1, suffix: 'm',
        // faixa bem maior que near (10 a milhares de metros) — passo/
        // sensibilidade maiores (mesma lógica do campo FOV, ver comentário
        // grande em modeler-ui.js `_createNumField`).
        pxPerStep: 4,
        onCommit: async (v) => {
          curFar = Math.max(0.01, v);
          farApi?.setValue(Math.round(curFar * 10) / 10);
          await this.set({ cameraZFar: curFar });
        },
      });
      farWrap.appendChild(farApi.el);
    }
  },

  /**
   * Abre o painel. `map` é o mapa atualmente aberto (2D ou 3D — ambos usam a
   * mesma estrutura, ver mapping.js). `opts`:
   *  - context: '2d' | '3d' — controla quais opções específicas aparecem.
   *  - onSelect(kind, entity): opcional — chamado ao tocar "Selecionar" numa
   *    linha da lista (kind: 'wall'|'camera'|'object'|'itemPin'). Se ausente,
   *    o botão some pra aquele tipo.
   *  - onDelete(kind, entity): async — chamado ao tocar "Excluir". Depois de
   *    concluir, a lista é recarregada sozinha.
   *  - onClose(): opcional — chamado ao fechar o painel.
   */
  // Presets oferecidos nos <select> de "Distância de renderização"/"Limite
  // de FPS" — qualquer valor de `cfg` que NÃO esteja numa destas listas cai
  // automaticamente em "Personalizada…"/"Personalizado…" (ver open() abaixo),
  // então um valor customizado digitado antes continua aparecendo certo da
  // próxima vez que o painel for reaberto, sem precisar guardar uma 2ª chave
  // só pra "está em modo customizado?".
  RENDER_DISTANCE_PRESETS: [20, 42, 80, 150],
  RENDER_DISTANCE_MIN: 3,
  // [13/09/2026] NOVO — resolução de renderização CUSTOMIZADA do "Ver em
  // 3D" (largura/altura em pixels, ver seção "Desempenho 3D" mais abaixo).
  // Mesmo mínimo (64px) que a "Miniatura do 3D" do mapa 2D já tolera bem
  // sem virar um amontoado de pixels ilegível (não existia uma constante
  // compartilhada pra essa miniatura antes desta rodada — ela nasce do
  // tamanho CSS do próprio painel arrastável/redimensionável, sem um campo
  // numérico dedicado — então esta constante é a referência nova pros dois
  // lugares que passarem a aceitar um número explícito).
  RES_CUSTOM_MIN: 64,
  FPS_LIMITE_PRESETS: [30, 45, 60], // 0 ("sem limite") tem opção própria, não entra aqui
  FPS_LIMITE_MIN: 1,
  // Limites do snap magnético de grade da Parede (metros) — pedido do
  // usuário: "um snap magnético a cada 20cm (limites de 1cm a 300cm)".
  PAREDE_SNAP_GRADE_MIN: 0.01,
  PAREDE_SNAP_GRADE_MAX: 3.0,

  // ---------- Ícones de prévia do estilo de junção das quinas (seção
  // "🧱 Parede" abaixo) — pedido do usuário: "ao lado, conforme se
  // seleciona, vai aparecendo uma prévia do tipo de junção escolhida (um
  // ícone com aspecto visual do 2D do app)". Um SVG pequeno e AUTOCONTIDO
  // por tipo (sem depender de nenhum ícone externo) desenhando duas
  // "paredes" (tiras cinzas grossas) se encontrando num ângulo bem fora de
  // 90° — de propósito: é justamente em ângulos assim que a diferença entre
  // os tipos fica visível (a 90° todos ficam praticamente iguais, ver
  // comentário grande em engine3d.js _buildCornerFillMesh). 4 dos 5 tipos
  // reaproveitam o `stroke-linejoin` NATIVO do SVG (que já resolve
  // round/bevel/miter de verdade, geometricamente) — só 'square' (sem
  // equivalente nativo) e 'atual' (que precisa MOSTRAR a frincha/sobra, não
  // escondê-la) desenham à mão por cima. ----------
  _WALL_JOIN_TYPES: [
    { key: 'atual', label: 'Atual (sem tratamento)', desc: 'Comportamento de sempre — cada parede é uma caixa reta só, sem nenhum preenchimento extra na quina. Pode deixar uma pequena frincha em ângulos bem fora de 90°.' },
    { key: 'bevel', label: 'Chanfrada (bevel)', desc: 'Corta a quina num único corte reto na diagonal, fechando a frincha com uma face plana.' },
    { key: 'square', label: 'Quadrada (square)', desc: 'Fecha a quina com um pequeno "degrau" quadrado, esticado para fora — visual de poste/coluna na junção. No 2D (mapa) o Canvas não tem esse formato pronto — aparece como chanfrada (bevel) ali; a malha 3D continua com o "poste" de verdade.' },
    { key: 'round', label: 'Arredondada (round)', desc: 'Fecha a quina com um arco curvo (como um filete arredondado), em vez de um corte reto.' },
    { key: 'miter', label: 'Bico exato (miter)', desc: 'Fecha a quina esticando as duas paredes até se encontrarem num único ponto exato, sem sobra nem frincha — o tipo pedido a partir da imagem enviada.' },
  ],
  _juncaoIconSvg(tipo) {
    const AX = 8, AY = 46, VX = 30, VY = 16, BX = 54, BY = 44; // "parede A" de (AX,AY) até o vértice, "parede B" do vértice até (BX,BY)
    const cor = '#9aa4b2';
    if (tipo === 'atual') {
      // Duas tiras DESENHADAS SEPARADAS (cada uma com sua própria ponta
      // reta, sem nenhum "join" comum) — mostra de propósito a frincha/
      // sobra que aparece no encontro, exatamente o comportamento atual.
      return `<svg viewBox="0 0 64 64" width="30" height="30">
        <line x1="${AX}" y1="${AY}" x2="${VX}" y2="${VY}" stroke="${cor}" stroke-width="13" stroke-linecap="butt"/>
        <line x1="${VX}" y1="${VY}" x2="${BX}" y2="${BY}" stroke="${cor}" stroke-width="13" stroke-linecap="butt"/>
      </svg>`;
    }
    if (tipo === 'square') {
      // Base chanfrada (bevel) + um pequeno quadrado por cima cobrindo bem
      // a quina, esticado um pouco pra fora — sugestão de "poste quadrado".
      return `<svg viewBox="0 0 64 64" width="30" height="30">
        <path d="M${AX} ${AY} L${VX} ${VY} L${BX} ${BY}" fill="none" stroke="${cor}" stroke-width="13" stroke-linejoin="bevel" stroke-linecap="butt"/>
        <rect x="${VX - 7}" y="${VY - 3}" width="14" height="14" fill="${cor}"/>
      </svg>`;
    }
    // round/bevel/miter: o PRÓPRIO SVG já resolve a geometria certa via
    // stroke-linejoin nativo — sem precisar calcular nada à mão aqui.
    return `<svg viewBox="0 0 64 64" width="30" height="30">
      <path d="M${AX} ${AY} L${VX} ${VY} L${BX} ${BY}" fill="none" stroke="${cor}" stroke-width="13" stroke-linejoin="${tipo}" stroke-linecap="butt"/>
    </svg>`;
  },

  /** Legenda "ícone + o que significa" das duas flags de duplicação/multi-
   *  item (pedido do usuário, 26/08/2026: "Coloque nas 'configurações 3D' e
   *  nas 'configurações 2D' na seção do Item associado para ambas, o ícone
   *  e do lado o seu significado para as flags de duplicação e de
   *  multi-item") — MESMAS cores/formato dos selos de verdade, replicados
   *  aqui só como referência visual (não são elementos interativos): o selo
   *  escuro "×N" (mapview.js _drawItemBadges / engine3d.js
   *  _buildCountBadgeTexture) e o selo vermelho-alaranjado com o ordinal
   *  (mesmos arquivos, _buildOrdinalBadgeTexture). Reaproveitada tal e qual
   *  nas seções "🔗 Item associado" do contexto 2D e do contexto 3D — uma
   *  função só, pra nunca desalinhar a explicação de um lado com a do outro. */
  _flagsLegendHtml() {
    return `
      <div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--border); display:flex; flex-direction:column; gap:8px">
        <div style="display:flex; align-items:center; gap:10px">
          <span style="flex:0 0 auto; width:22px; height:22px; border-radius:50%; background:#20242b; border:2px solid #4f8cff; color:#fff; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center">×2</span>
          <span class="d">Multi-item: este objeto tem mais de um patrimônio associado (o número mostra quantos).</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px">
          <span style="flex:0 0 auto; width:22px; height:22px; border-radius:50%; background:#e35b5b; color:#fff; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center">1</span>
          <span class="d">Duplicação: este patrimônio também está associado a outro objeto do mapa (o número mostra a ordem — 1º, 2º...).</span>
        </div>
      </div>`;
  },

  async open(map, opts = {}) {
    const cfg = await this.get();
    // NOVO (06/09/2026), pedido verbatim: "[o botão 'Marcar aqui', em
    // 'Fotos'] deve haver duas ações padrão [...] Isto deve ficar em uma
    // seção chamada 'Fotos', nas 'configurações 2D'." — lida DIRETO por
    // `DB.getSetting`/gravada por `DB.setSetting` (chave própria
    // `fotosMarcarAquiAcao`), sem passar pelo blob único `mapa3dConfig`
    // (`this._cache`/`this.set()`) que o resto deste arquivo usa — mesmo
    // padrão de outras preferências "soltas" do mapa 2D, ex.
    // `mapa2dSnapGrade` (ver mapview.js), que também vivem fora desse blob.
    // Lida de novo (sem cache) toda vez que este modal abre, pra sempre
    // refletir o valor mais recente. Consumida em mapview.js
    // `_placePhotoPinAtWorld`.
    const fotosMarcarAquiAcao = (opts.context === '2d') ? await DB.getSetting('fotosMarcarAquiAcao', 'permanecer') : 'permanecer';
    // NOVO (07/09/2026) — snap de rotação do mapa 2D (ver seção "🔄 Rotação
    // do mapa 2D" abaixo) — mesmo padrão de leitura "solta"/fora do blob
    // `mapa3dConfig` de `fotosMarcarAquiAcao` acima (chave própria, lida de
    // novo/sem cache toda vez que o modal abre). Espelha
    // `MapView._mapRotationSnapGraus` (ver mapview.js _mountPlanta, que lê a
    // MESMA chave 1x no mount) — os dois lados ficam sincronizados porque
    // ambos leem/gravam a mesma chave do DB.
    const mapRotacaoSnapGraus = (opts.context === '2d') ? await DB.getSetting('mapa2dRotacaoSnapGraus', 15) : 15;
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser possível selecionar
    // texto das opções e descrições nas 'configurações 3D'. No cabeçalho
    // deve ter um botão que controla isso." Diferente de "Configurações 2D"
    // (RODADA anterior, 09/09/2026 — texto SEMPRE selecionável lá, sem
    // opção nenhuma, ver `.mapconfig-sheet--2d` em css/style.css), aqui é um
    // TOGGLE — padrão desativado (comportamento de sempre preservado) — com
    // o estado lembrado entre aberturas do modal (chave própria "solta" no
    // DB, mesmo padrão de `fotosMarcarAquiAcao`/`mapRotacaoSnapGraus`
    // acima). Só se aplica ao contexto 3D — "Configurações 2D" já é sempre
    // selecionável, incondicionalmente, então o botão nem aparece lá.
    const mc3dTextoSelecionavel = (opts.context !== '2d') ? await DB.getSetting('mapconfig3DTextoSelecionavel', false) : false;
    const rdCustom = !this.RENDER_DISTANCE_PRESETS.includes(Number(cfg.renderDistance));
    const fpsCustom = Number(cfg.fpsLimite) > 0 && !this.FPS_LIMITE_PRESETS.includes(Number(cfg.fpsLimite));
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    // [09/09/2026] Ajuste solicitado pelo usuário: "Em 'Configurações 2D',
    // todos os textos devem ser selecionáveis" — classe extra só quando
    // `opts.context === '2d'` (não mexe em "Configurações 3D", que usa o
    // MESMO template/CSS `.mapconfig-sheet`), consumida pelo override em
    // css/style.css (ver comentário lá, perto da regra genérica de
    // `user-select:none` do "cromo" da interface que hoje bloqueia a
    // seleção também aqui).
    modal.innerHTML = `
      <div class="modal-sheet mapconfig-sheet${opts.context === '2d' ? ' mapconfig-sheet--2d' : ''}${mc3dTextoSelecionavel ? ' mapconfig-sheet--selecionavel' : ''}">
        <div class="handle"></div>
        <!-- NOVO (07/09/2026), pedido verbatim: "melhorar interação 3D para
             o celular [...] Deve ter um botão de 'fechar' nas
             'configurações 2D' e nas 'configurações 3D'." -- já EXISTIA um
             botão "Fechar" (id mc-close, ver mais abaixo), só que só no FIM
             da folha de configurações -- num celular, com a lista de
             configs 3D bem longa (dezenas de seções), fechar exigia rolar
             até o fim toda vez (ou tocar fora do modal, que no toque some
             conflita com o scroll). Este cabeçalho fica GRUDADO no topo
             (position:sticky) enquanto rola a folha inteira, com um botão
             "✕" sempre visível e alcançável, chamando o MESMO close() de
             sempre (nenhum fluxo de fechamento novo, só um atalho a mais).
             O botão "Fechar" original no fim permanece (não removido) --
             quem já rolou até lá continua com o de sempre também. -->
        <div style="position:sticky; top:-16px; z-index:1; background:var(--bg-elev); margin:-16px -16px 0; padding:16px 16px 8px; display:flex; align-items:center; justify-content:space-between; gap:8px">
          <h3 style="margin:0">⚙️ Configurações do mapa</h3>
          <div style="display:flex; align-items:center; gap:6px; flex:none">
            <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser possível
                 selecionar texto das opções e descrições nas 'configurações
                 3D'. No cabeçalho deve ter um botão que controla isso." Só
                 renderizado no contexto 3D (opts.context !== '2d') --
                 "Configurações 2D" já é sempre selecionável, sem botão
                 nenhum (ver comentário grande em 'mc3dTextoSelecionavel'
                 acima). Ícone/estado refletem 'mc3dTextoSelecionavel' já
                 lido do DB nesta abertura do modal. -->
            ${opts.context !== '2d' ? `<button type="button" class="icon-btn sm" id="mc-toggle-selecionavel" title="${mc3dTextoSelecionavel ? 'Desativar seleção de texto das opções/descrições' : 'Ativar seleção de texto das opções/descrições'}" aria-pressed="${mc3dTextoSelecionavel ? 'true' : 'false'}" style="flex:none">
              <!-- [RODADA 134] REMOVIDO -- pedido verbatim: "Retire o desenho
                   do cursor de trás do cadeado." O ícone de cursor (SVG, Rodada
                   132/133) e a letra 'T' (Rodada 131) que vieram antes dele
                   foram removidos -- volta a ser só o emoji do cadeado
                   sozinho (🔒/🔓), sem nenhum desenho atrás. -->
              ${mc3dTextoSelecionavel ? '🔓' : '🔒'}` : ''}
            <button type="button" class="icon-btn sm" id="mc-close-top" title="Fechar configurações" style="flex:none">✕</button>
          </div>
        </div>

        <!-- [15/09/2026 UTC] MUDADO -- pedido verbatim: "Verifique se tudo
             em ambas configuracoes esta atrelado a uma secao, pois deve
             estar. Por exemplo, nas 'configuracoes 2D', ha o 'Duplicar
             itens ao colar?' [...] porem nao esta atrelado a uma secao."
             Esta opcao ja vivia dentro de um <div class="mapconfig-section">
             (nao estava "solta" no DOM), mas sem <h4> nenhum -- por isso
             nao parecia uma secao de verdade visualmente, diferente de
             todas as outras. Adicionado um titulo pra ela ficar igual as
             demais. -->
        <div class="mapconfig-section">
          <h4>📋 Colar</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-dup-itens-colar" ${cfg.duplicarItensAoColar ? 'checked' : ''}>
            <span><span class="t">Duplicar itens ao colar?</span><br><span class="d">Um item só pode ter uma posição no mapa, então "colar" um item copiado normalmente não faz nada (só avisa). Ligando isto, colar cria um registro de item NOVO (cópia dos campos do original) na posição colada. Recortar+colar sempre funciona (só move o mesmo item), com ou sem isto ligado.</span></span>
          </label>
        </div>

        ${opts.context === '2d' ? `
        <!-- [15/09/2026 UTC] NOVO -- pedido verbatim: "Nas 'configuracoes
             2D', se ainda nao houver uma secao que trate disso, coloque
             uma secao para definicoes do mapa 2D. Uma opcao e aparecer a
             origem do mundo. Quando ativada, desenha uma cruz na origem
             (0,0) da grade do mapa 2D. Por padrao, ela fica ativada." --
             1a secao genuinamente "geral" do mapa 2D (as outras já
             existentes são todas sobre um assunto específico -- Zoom,
             Parede, Objeto etc.) -- fica logo no topo das seções
             exclusivas de 2D, antes até de "Centralização ao voltar pro
             mapa", pra ficar fácil de achar. Ver DEFAULTS.
             mapa2dMostrarOrigemMundo acima e mapview.js
             Map2DRenderer._drawOrigemMundo/_renderFrame. -->
        <div class="mapconfig-section">
          <h4>🗺️ Mapa 2D</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-mapa2d-origem-mundo" ${cfg.mapa2dMostrarOrigemMundo !== false ? 'checked' : ''}>
            <span><span class="t">Mostrar a origem do mundo (padrão: ativado)</span><br><span class="d">Desenha uma cruz laranja na origem (0,0) da grade do mapa 2D — útil como referência fixa pra saber onde fica o "zero" do mundo, não importa o zoom/rotação atual.</span></span>
          </label>
        </div>
        <!-- Pedido do usuário (rodada 48): "A câmera 2D, no mapa 2D, deve
             voltar centralizada no personagem. Deve haver uma opção nas
             'configurações 2D' para isso, ou sempre 'volta centrada na
             origem' ou volta 'centrada no personagem'." Ver mapview.js
             _fitViewToMapContent/_personagem2D. -->
        <div class="mapconfig-section">
          <h4>📍 Centralização ao voltar pro mapa</h4>
          <label class="radio-opt">
            <input type="radio" name="mc-2d-centralizar" value="personagem" ${cfg.centralizacao2DVolta !== 'origem' ? 'checked' : ''}>
            <span><span class="t">Centrada no personagem</span><br><span class="d">Ao abrir/voltar pro mapa 2D, a câmera centraliza na posição atual do boneco (o mesmo do "🧭 Modo Navegação"/3D). Se o boneco ainda não foi posicionado nenhuma vez, cai no centro de tudo que já foi desenhado.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-2d-centralizar" value="origem" ${cfg.centralizacao2DVolta === 'origem' ? 'checked' : ''}>
            <span><span class="t">Centrada na origem</span><br><span class="d">Ao abrir/voltar pro mapa 2D, a câmera sempre centraliza no ponto (0,0) do mapa, não importa onde o boneco esteja.</span></span>
          </label>
        </div>
        <!-- Seção "🗂️ Método de interação de camadas" (pedido do usuário,
             03/09/2026) — ver DEFAULTS.metodoInteracaoCamadas acima e
             mapview.js _layersInteragiveis(). -->
        <div class="mapconfig-section">
          <h4>🗂️ Método de interação de camadas</h4>
          <label class="radio-opt">
            <input type="radio" name="mc-interacao-camadas" value="isolado" ${cfg.metodoInteracaoCamadas !== 'atual-e-abaixo' ? 'checked' : ''}>
            <span><span class="t">Isolado por camada (padrão)</span><br><span class="d">O mouse só interage com elementos da camada atualmente selecionada — mesmo que elementos de outras camadas apareçam visualmente por cima/embaixo, clicar/arrastar nunca pega neles.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-interacao-camadas" value="atual-e-abaixo" ${cfg.metodoInteracaoCamadas === 'atual-e-abaixo' ? 'checked' : ''}>
            <span><span class="t">Camada atual e camadas abaixo</span><br><span class="d">O mouse interage com a camada atual E com todas as camadas posicionadas abaixo dela na lista de camadas (empilhamento) — útil pra editar/mover algo de uma camada de fundo sem trocar de camada ativa toda hora.</span></span>
          </label>
        </div>
        <div class="mapconfig-section">
          <h4>Miniatura 3D</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-miniatura3d" ${cfg.miniatura3DAtiva ? 'checked' : ''}>
            <span><span class="t">Mostrar miniatura 3D sobre a grade</span><br><span class="d">Uma janelinha com o mesmo "Ver em 3D" em resolução bem menor (largura = 1/10 da tela do 3D), acompanhando ao vivo a posição/direção do boneco enquanto anda em "🧭 Modo Navegação". Aparece por padrão no canto superior direito DA GRADE — pode ser arrastada pra outro lugar.</span></span>
          </label>
          <!-- NOVO (07/09/2026), pedido verbatim: "Nas 'configurações 2D',
               na seção 'Miniatura 3D', deve haver uma opção para 'fechar
               janela de miniatura ao sair do Mapa'. Por padrão, fica
               desabilitada." Ver DEFAULTS.miniatura3DFecharAoSairMapa acima
               e mapview.js _unmountPlanta. -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-miniatura3d-fechar-ao-sair" ${cfg.miniatura3DFecharAoSairMapa ? 'checked' : ''}>
            <span><span class="t">Fechar janela de miniatura ao sair do Mapa</span><br><span class="d">Desabilitada por padrão: a miniatura 3D continua aberta/renderizando mesmo trocando pra outra aba do app (Tabela, Cartões, Fotos, Buscar). Ligue esta opção pra fechá-la automaticamente sempre que sair da tela Mapa.</span></span>
          </label>
        </div>
        <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser possível mover
             a janelinha e ativá-la/desativá-la nas 'configurações 2D', na
             seção 'Trena 3D'. Por padrão, ativado." Ver view3d.js
             '_trena3DEnsurePainelRapido'/'_trena3DTogglePainelRapido'. -->
        <div class="mapconfig-section">
          <h4>📏 Trena 3D</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-painel-rapido" ${cfg.trena3DPainelRapidoAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Mostrar janela de acesso rápido da Trena 3D (padrão: ativado)</span><br><span class="d">Uma janelinha pequena, dentro do "Ver em 3D", com ícones pra ligar/desligar rapidamente as principais opções da "📏 Trena 3D" (as mesmas configuráveis na seção "📏 Trena 3D" das Configurações 3D), sem precisar abrir a folha de Configurações. Pode ser arrastada pra qualquer lugar da tela e fechada pelo "✕" dela — desligue aqui pra não mostrá-la mais.</span></span>
          </label>
        </div>
        <!-- NOVO (05/09/2026), pedido verbatim: "No mapa 2D, o 'Réguas' da
             grade deve ficar habilitada como padrão para o 'modo
             navegação'. Deve haver uma seção do 'modo navegação' na
             'configurações 2D' também para isso. Para definir qual a ação
             padrão da régua ao ficar no 'modo navegação'. Deve haver uma
             opção, também, para deixar desabilitada a grade." Ver
             DEFAULTS.modoNavReguaAcao/modoNavGradeAcao e mapview.js
             _applyModoNavGradeReguaDefaults. -->
        <div class="mapconfig-section">
          <h4>🧭 Modo Navegação</h4>
          <span style="display:block; font-size:12.5px; color:var(--text-dim); margin-bottom:5px">📐 Réguas — ação ao LIGAR "🧭 Modo Navegação":</span>
          <label class="radio-opt">
            <input type="radio" name="mc-modonav-regua" value="ligar" ${(cfg.modoNavReguaAcao || 'ligar') === 'ligar' ? 'checked' : ''}>
            <span><span class="t">Ligar (padrão)</span><br><span class="d">Sempre acende as réguas ao entrar em Modo Navegação, mesmo que estivessem desligadas antes.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-modonav-regua" value="desligar" ${cfg.modoNavReguaAcao === 'desligar' ? 'checked' : ''}>
            <span><span class="t">Desligar</span><br><span class="d">Sempre apaga as réguas ao entrar em Modo Navegação.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-modonav-regua" value="manter" ${cfg.modoNavReguaAcao === 'manter' ? 'checked' : ''}>
            <span><span class="t">Manter estado anterior</span><br><span class="d">Não mexe — fica como já estava (ligada ou desligada).</span></span>
          </label>
          <!-- ATUALIZADO (05/09/2026), pedido verbatim: "para a Grade,
               deve ficar como em 'Réguas', ou seja, em ordem: 'Ligar',
               'Desligar' e 'Manter estado anterior'." Mesma ORDEM visual
               de "📐 Réguas" acima — só a ordem na tela mudou, o padrão
               continua sendo 'manter' (ver DEFAULTS.modoNavGradeAcao). -->
          <span style="display:block; font-size:12.5px; color:var(--text-dim); margin:10px 0 5px">▦ Grade — ação ao LIGAR "🧭 Modo Navegação":</span>
          <label class="radio-opt">
            <input type="radio" name="mc-modonav-grade" value="ligar" ${cfg.modoNavGradeAcao === 'ligar' ? 'checked' : ''}>
            <span><span class="t">Ligar</span><br><span class="d">Sempre acende a grade ao entrar em Modo Navegação.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-modonav-grade" value="desligar" ${cfg.modoNavGradeAcao === 'desligar' ? 'checked' : ''}>
            <span><span class="t">Desligar</span><br><span class="d">Sempre apaga a grade ao entrar em Modo Navegação (deixa a grade desabilitada por padrão).</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-modonav-grade" value="manter" ${(cfg.modoNavGradeAcao || 'manter') === 'manter' ? 'checked' : ''}>
            <span><span class="t">Manter estado anterior (padrão)</span><br><span class="d">Não mexe — fica como já estava (ligada ou desligada).</span></span>
          </label>
        </div>
        <!-- ATUALIZADO (05/09/2026), pedido verbatim: "na seção
             'Ferramentas visíveis em Modo Navegação', todas as ferramentas
             devem estar ali para poderem ser marcadas ou não (também os
             botões do cabeçalho)... Por padrão ficam habilitados:
             'Retículo métrico', 'Trena' e 'Traço guia' (das ferramentas) e
             'Exibir a grade', 'Réguas' e 'Encaixar' (dos botões de
             cabeçalho)." Lista TODAS as ferramentas (mapview.js PTOOLS) e
             TODOS os botões do cabeçalho (mapview.js #tbm-*) como
             checkboxes — controla os botões da bandeja lateral, agora
             dividida visualmente em 2 grupos (ferramentas / cabeçalho) por
             um traço (ver mapview.js .map2d-drawer-sep-groups). -->
        <div class="mapconfig-section">
          <h4>🧭 Ferramentas visíveis em Modo Navegação</h4>
          <span style="display:block; font-size:12.5px; color:var(--text-dim); margin-bottom:5px">Quais botões da bandeja lateral (seta na borda direita da grade) continuam aparecendo mesmo com "Modo Navegação" ligado — desmarcar aqui só esconde o botão, nunca apaga nada já desenhado nem desativa a ferramenta se ela já estiver em uso.</span>
          <span style="display:block; font-size:12.5px; font-weight:600; margin:8px 0 3px">🧰 Ferramentas</span>
          ${MapConfig.NAV_TOOLS.map((it) => `
          <label class="radio-opt">
            <input type="checkbox" id="mc-nav-${it.id}" ${cfg.ferramentasNavVisiveis?.[it.chave] !== false ? 'checked' : ''}>
            <span><span class="t">${it.icon} ${it.label}</span></span>
          </label>`).join('')}
          <span style="display:block; font-size:12.5px; font-weight:600; margin:12px 0 3px; padding-top:8px; border-top:1px solid var(--border)">📋 Botões do cabeçalho</span>
          ${MapConfig.NAV_HEADER_BUTTONS.map((it) => `
          <label class="radio-opt">
            <input type="checkbox" id="mc-navhdr-${it.chave}" ${cfg.botoesCabecalhoNavVisiveis?.[it.chave] !== false ? 'checked' : ''}>
            <span><span class="t">${it.icon} ${it.label}</span></span>
          </label>`).join('')}
        </div>
        <!-- Pedido do usuário: "o card de 'Desempenho do 2D' que atualmente
             está nas configurações do app, deve ficar nas configurações
             2D" — morava em settings.js (Configurações do app), mudou pra
             cá. Ver mapview.js _loop()/_onRedrawDirtyEvt/_onMapConfigChange. -->
        <div class="mapconfig-section">
          <h4>⚡ Desempenho do 2D</h4>
          <span style="display:block; font-size:12.5px; color:var(--text-dim); margin-bottom:5px">Quando redesenhar a grade</span>
          <label class="radio-opt">
            <input type="radio" name="mc-redraw2d" value="continuo" ${cfg.desempenho2DModoRedesenho !== 'sobdemanda' ? 'checked' : ''}>
            <span><span class="t">Contínuo (padrão)</span><br><span class="d">Redesenha a cada quadro, o tempo todo enquanto a tela Mapa está aberta — mais simples, mas gasta processamento mesmo parado sem fazer nada.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-redraw2d" value="sobdemanda" ${cfg.desempenho2DModoRedesenho === 'sobdemanda' ? 'checked' : ''}>
            <span><span class="t">Sob demanda</span><br><span class="d">Só redesenha quando algo muda de verdade: mexer o mouse/dedo, clicar, soltar/inserir/excluir, zoom, hover, seleção, animações e o boneco andando no "🧭 Modo Navegação" — parado e sem interação nenhuma, a grade fica quieta (mais fps/bateria em aparelhos mais fracos).</span></span>
          </label>
          <label class="radio-opt" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border)">
            <input type="checkbox" id="mc-doublebuffer" ${cfg.desempenho2DBufferSecundario ? 'checked' : ''}>
            <span><span class="t">Buffer secundário (canvas off-screen)</span><br><span class="d">Desenha cada quadro num canvas escondido primeiro, e só copia pra tela quando ele estiver pronto — evita um piscar/"rasgar" ocasional em mapas muito grandes/cheios, ao custo de um pouco mais de memória. Deixe desligado se não notar diferença: em mapas pequenos/médios só desperdiça memória à toa.</span></span>
          </label>
        </div>
        <!-- NOVO (07/09/2026), pedido verbatim: "No mapa 2D, o limite de
             mover qualquer item deve ser a grade de pontos no zoom máximo.
             Isso pode até ficar como informação em uma seção 'Zoom' nas
             'configurações 2D'. A informação fica, então: 'O limite de
             mover qualquer objeto na grade do mapa 2D é a grade de pontos
             no zoom máximo.'." Seção só INFORMATIVA (sem controle nenhum
             pra configurar aqui — o pedido só fala em "informação"): o
             comportamento de verdade é implementado em
             mapview.js Map2DRenderer.screenToWorld/isAtMaxZoom/
             _gridDotStepAtMaxZoomMeters (arrastar com o MOUSE) e
             MapView._efetivoSnapMetrosMouse/_arrowKeyMoveSelected (setas do
             teclado) — ver os comentários grandes lá. -->
        <div class="mapconfig-section">
          <h4>🔍 Zoom</h4>
          <span class="d" style="display:block">O limite de mover qualquer objeto na grade do mapa 2D é a grade de pontos no zoom máximo.</span>
        </div>
        <!-- Seção "🧱 Parede" no contexto 2D (pedido do usuário: "nas
             configurações 2D deve ter uma seção também chamada 'parede' e
             uma subseção idêntica à das configurações 3D, a subseção
             'Estilo de junção das quinas'... será útil no 2D (mapa)"). Só
             esta subseção — o resto da seção "🧱 Parede" do 3D (snaps de
             grade/vértice/ângulo etc.) é exclusivo da ferramenta de desenho
             de parede DENTRO do 3D (ver comentário em DEFAULTS acima); o
             editor 2D sempre desenhou retas livremente, sem grade. O estilo
             de junção afeta tanto a malha 3D quanto — desde 25/08/2026, ver
             mapview.js Map2DRenderer._buildWallChainsForRender — o desenho
             das próprias paredes AQUI no 2D (antes só existia o ícone de
             prévia acima; agora o mapa de verdade também reflete o tipo
             escolhido), independente de qual editor desenhou a parede,
             então faz sentido poder trocá-lo daqui também. Mesmo
             name="mc-juncao" do bloco 3D abaixo — como os dois contextos
             nunca renderizam ao mesmo tempo (só um dos dois branches de
             opts.context existe por vez), o wiring genérico de
             input[name="mc-juncao"] mais abaixo já cobre esta cópia, sem
             precisar duplicar nenhum JS. -->
        <div class="mapconfig-section">
          <h4>🧱 Parede</h4>
          <span class="lbl" style="display:block; margin-bottom:8px">Estilo de junção das quinas</span>
          <div id="mc-juncao-tipos" style="display:flex; flex-wrap:wrap; gap:8px">
            ${this._WALL_JOIN_TYPES.map((t) => `
              <label class="mc-juncao-opt" data-tipo="${t.key}" title="${Utils.escapeHtml(t.desc)}"
                style="display:flex; flex-direction:column; align-items:center; gap:3px; padding:6px 8px; border-radius:8px; border:2px solid ${cfg.paredeJuncaoTipo === t.key || (!cfg.paredeJuncaoTipo && t.key === 'atual') ? 'var(--accent, #4a9eff)' : 'transparent'}; background:rgba(255,255,255,0.04); cursor:pointer; width:64px">
                <input type="radio" name="mc-juncao" value="${t.key}" ${cfg.paredeJuncaoTipo === t.key || (!cfg.paredeJuncaoTipo && t.key === 'atual') ? 'checked' : ''} style="display:none">
                ${this._juncaoIconSvg(t.key)}
                <span style="font-size:10.5px; text-align:center; line-height:1.15">${t.label}</span>
              </label>`).join('')}
          </div>
          <span class="d" id="mc-juncao-desc" style="display:block; margin-top:6px">${Utils.escapeHtml((this._WALL_JOIN_TYPES.find((t) => t.key === (cfg.paredeJuncaoTipo || 'atual')) || this._WALL_JOIN_TYPES[0]).desc)}</span>
        </div>
        <!-- Seção "📦 Objeto" no contexto 2D (pedido do usuário, rodada 50:
             "Nas 'configurações 2D', deve ter uma opção [...] para
             habilitar/desabilitar o desenho com transparência dos objetos
             no mapa 2D.") — não existia nenhuma opção parecida antes (a
             única opacidade já aplicada era por CAMADA, ver
             Map2DRenderer._layerOpacity/"Propriedades da camada"); esta é
             uma transparência FIXA a mais, por cima da de camada, aplicada
             a todo objeto (mesa, cubo, etc.) independente da camada dele.
             Ver mapview.js render()/_layerOpacity. -->
        <div class="mapconfig-section">
          <h4>📦 Objeto</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-objeto-transparencia-2d" ${cfg.objetoTransparencia2DAtivo ? 'checked' : ''}>
            <span><span class="t">Desenhar objetos com transparência</span><br><span class="d">Desligada (padrão): objetos desenhados opacos no mapa 2D (respeitando só a opacidade da camada, se configurada). Ligada: soma uma transparência a mais em cima de qualquer objeto — útil pra ver o que está por baixo/atrás em mapas mais cheios.</span></span>
          </label>
        </div>
        <!-- Seção "🔗 Item associado" no contexto 2D (pedido do usuário,
             26/08/2026: "Esse 'destaque a mais' deve ter também no 2D e com
             uma opção também nas 'configurações 2D'.") — mesma ideia da
             seção equivalente no 3D (mais abaixo), só que com uma única
             opção (o 2D já mostra 🔗/contorno azul sempre, sem opção de
             desligar — só o destaque EXTRA é opcional aqui). Ver
             mapview.js Map2DRenderer._drawDestaqueExtraObj/
             _drawDestaqueExtraPin. -->
        <div class="mapconfig-section">
          <h4>🔗 Item associado</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-destaque-extra-dourado-2d" ${cfg.destaqueExtra2DDouradoAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Destacar mais — anel dourado (padrão)</span><br><span class="d">Soma um anel dourado bem visível de longe ao redor dos objetos com patrimônio associado e dos pinos de itens ainda não associados a nenhum objeto — útil pra achar rápido o que falta associar em mapas grandes.</span></span>
          </label>
          <label class="radio-opt" style="margin-top:10px">
            <input type="checkbox" id="mc-destaque-extra-raio-2d" ${cfg.destaqueExtra2DRaioAtivo ? 'checked' : ''}>
            <span><span class="t">Destacar mais — raio azul</span><br><span class="d">Versão 2D (vista de cima) do facho de luz azul do 3D — um brilho azul ao redor do objeto/pino. Pode ficar ligado junto com o anel dourado acima.</span></span>
          </label>
          ${this._flagsLegendHtml()}
        </div>
        <!-- NOVO (06/09/2026), pedido verbatim: "ao tirar um foto é possível
             vincular a uma posição do mapa 2D, após clicar em 'Marcar aqui',
             acaba voltando para a tela do 'Mapa'. Deve permanecer na tela
             'Mapa'->'Planta baixa' [...] deve haver duas ações padrão: uma,
             é conforme acabei de descrever; outra, é voltar para a tela de
             'Fotos' [...] Isto deve ficar em uma seção chamada 'Fotos', nas
             'configurações 2D'. Por padrão deve permanecer na tela
             'Mapa'->'Planta baixa'." — seção NOVA, separada da seção "Foto"
             logo abaixo (que é sobre 'Mapa'->'Foto', um conceito diferente
             — ver comentário ali) — ícone 📍 (o mesmo espírito de "Marcar
             aqui") escolhido de propósito, diferente do ícone da seção
             "Foto" abaixo E do emoji usado pelo botão "Fotos" do rodapé do
             app, pra não confundir as três. Lida/gravada direto por
             DB.getSetting/setSetting (ver 'fotosMarcarAquiAcao' acima, e
             mapview.js '_placePhotoPinAtWorld'), fora do blob 'mapa3dConfig'
             — segue o padrão de outras prefs "soltas" do mapa 2D (ex.
             'mapa2dSnapGrade'), não o padrão do resto deste arquivo.
             NOVO (06/09/2026), pedido verbatim: "Na seção 'Fotos' das
             'configurações 2D', em vez do ícone '📍', coloque o ícone '📷'."
             — troca simples de emoji do cabeçalho desta seção. -->
        <!-- [15/09/2026 UTC] MUDADO -- pedido verbatim: "Troque as referencias
             nas 'configuracoes 2D' tambem de acordo com os novos nomes."
             Botao do rodape (capturar) trocou de Fotos para Foto; botao
             Mapa->Foto trocou para Mapa->Fotos. Titulos e textos destas
             duas secoes atualizados na mesma direcao. -->
        <div class="mapconfig-section">
          <h4>📷 Foto</h4>
          <span class="d" style="display:block; margin-bottom:5px">Ao confirmar "✅ Marcar aqui" (vincular uma foto a uma posição no mapa, em "Foto" → tirar/escolher foto → 🗺️), o que fazer depois:</span>
          <label class="radio-opt">
            <input type="radio" name="mc-fotos-marcar-aqui" value="permanecer" ${fotosMarcarAquiAcao !== 'fotos' ? 'checked' : ''}>
            <span><span class="t">Permanecer em Mapa → Planta baixa (padrão)</span><br><span class="d">Continua na tela onde o botão "Marcar aqui" está — dá pra ajustar mais coisas no mapa em seguida, sem precisar entrar de novo.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-fotos-marcar-aqui" value="fotos" ${fotosMarcarAquiAcao === 'fotos' ? 'checked' : ''}>
            <span><span class="t">Voltar para Foto</span><br><span class="d">Volta pra tela "Foto" (o mesmo botão do rodapé do app) — comportamento de antes desta rodada.</span></span>
          </label>
        </div>
        <!-- RODADA 53 [15/09/2026 UTC], pedido verbatim (item B): "Ao tirar
             uma foto, um objeto Câmera está sendo atribuída a ela
             automaticamente [...] deve ter uma opção nas 'configurações 2D'
             para decidir se isto acontece ou não. Subseção 'Atribuir a um
             lugar no mapa automaticamente' [...] Opções: 'Não', 'Apenas
             quando o mapa estiver vazio' e 'Sim'." Lido por capture.js
             _autoPlacePhoto (chamado quando a pessoa NÃO clica em
             "📍 Vincular a um lugar no mapa", ou toca fora da tela de
             opções — ver _openPhotoLinkModal). -->
                <!-- [15/09/2026 UTC] MUDADO -- pedido verbatim: "A secao '🗺️
             Atribuir a um lugar no mapa automaticamente' deve ficar logo
             abaixo da secao '📷 Foto'. A secao '🏷️ Nome automatico da foto'
             vai junto (ficando logo abaixo de '🗺️ Atribuir...' na sua nova
             posicao)." Estas duas secoes foram reordenadas pra cá (antes
             ficavam depois da secao com o SVG "Fotos", que agora foi
             empurrada pra baixo delas -- nenhum conteudo mudou, só a ORDEM
             de exibição). -->
        <div class="mapconfig-section">
          <h4>🗺️ Atribuir a um lugar no mapa automaticamente</h4>
          <span class="d" style="display:block; margin-bottom:5px">Quando uma foto é tirada e NÃO se vincula ela a um lugar no mapa (não se clica em "📍 Vincular a um lugar no mapa", ou se toca fora da tela de opções), o que fazer:</span>
          <label class="radio-opt">
            <input type="radio" name="mc-foto-auto-camera" value="nao" ${cfg.fotoAutoAtribuirCamera === 'nao' ? 'checked' : ''}>
            <span><span class="t">Não</span><br><span class="d">A foto fica sem posição no mapa — só aparece na 📦 Caixa, até alguém vincular ela manualmente.</span></span>
          </label>
          <!-- [15/09/2026 UTC] MUDADO — pedido verbatim: "a opção 'Apenas
               quando o mapa estiver vazio' deve trocar sua função para
               quando houver apenas câmeras no mapa. O nome também deve
               trocar para 'Quando houver apenas câmeras no mapa'." Antes,
               "vazio" checava se não havia NENHUMA OUTRA foto/Câmera
               posicionada (ver capture.js _autoPlacePhoto, variável
               mapaVazio) — agora checa se o mapa não tem NENHUM objeto/
               parede/porta/janela/texto (paredes, map.objects,
               map.portas, map.janelas, map.textos), permitindo
               qualquer quantidade de Câmeras/fotos já posicionadas. Valor
               salvo continua 'vazio' (compatibilidade, não precisa migrar
               dado antigo), só o SIGNIFICADO e o rótulo mudaram. -->
          <label class="radio-opt" style="margin-top:6px">
            <input type="radio" name="mc-foto-auto-camera" value="vazio" ${cfg.fotoAutoAtribuirCamera === 'vazio' ? 'checked' : ''}>
            <span><span class="t">Quando houver apenas câmeras no mapa</span><br><span class="d">Só posiciona automaticamente se o mapa não tiver NENHUM objeto/parede/porta/janela/texto ainda (Câmeras/fotos já posicionadas não contam) — assim que o mapa ganhar algo além de Câmeras, fica sem posição (como em "Não").</span></span>
          </label>
          <label class="radio-opt" style="margin-top:6px">
            <input type="radio" name="mc-foto-auto-camera" value="sim" ${(cfg.fotoAutoAtribuirCamera || 'sim') === 'sim' ? 'checked' : ''}>
            <span><span class="t">Sim (padrão)</span><br><span class="d">Sempre posiciona automaticamente numa grade a partir da origem definida abaixo.</span></span>
          </label>
          <div style="margin-top:10px; padding:10px; border:1px dashed var(--border, #ccc); border-radius:8px">
            <span class="d" style="display:block; margin-bottom:6px">Como a grade automática de Câmeras é montada:</span>
            <!-- [15/09/2026 UTC] NOVO — pedido verbatim: "Deve ter uma
                 opção para considerar colisão com quaisquer objetos. Isto
                 evita a câmera ser colocada dentro de um objeto. No 2D,
                 pode não ser um problema, porém no 3D ela ficaria
                 ocultada." -->
            <label class="checkbox-opt" style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px">
              <input type="checkbox" id="mc-foto-grade-evitar-colisao" ${cfg.fotoGradeEvitarColisao ? 'checked' : ''}>
              <span><span class="t">Evitar colocar em cima de objetos</span><br><span class="d">Ao posicionar automaticamente, pula posições da grade que colidam com qualquer objeto/forma já no mapa — no 2D pode não incomodar, mas no 3D a Câmera ficaria escondida dentro do objeto.</span></span>
            </label>
            <label class="field">
              <span class="lbl">Distância entre uma Câmera e outra (m)</span>
              <input type="number" id="mc-foto-grade-dist" min="0.1" step="0.1" value="${cfg.fotoGradeDistancia ?? 1.2}" style="width:100%">
            </label>
            <label class="field" style="margin-top:8px">
              <span class="lbl">Câmeras por linha (antes de quebrar linha)</span>
              <input type="number" id="mc-foto-grade-porlinha" min="1" step="1" value="${cfg.fotoGradePorLinha ?? 6}" style="width:100%">
            </label>
            <div style="display:flex; gap:8px; margin-top:8px">
              <label class="field" style="flex:1">
                <span class="lbl">Origem X (m)</span>
                <input type="number" id="mc-foto-grade-origx" step="0.1" value="${cfg.fotoGradeOrigemX ?? 0}" style="width:100%">
              </label>
              <label class="field" style="flex:1">
                <span class="lbl">Origem Y (m)</span>
                <input type="number" id="mc-foto-grade-origy" step="0.1" value="${cfg.fotoGradeOrigemY ?? 0}" style="width:100%">
              </label>
            </div>
            <button type="button" class="btn secondary sm block" id="mc-foto-grade-mover" style="margin-top:8px" title="Escolha a origem clicando no mapa (a janela de configurações fica escondida enquanto isso, igual ao botão 'Girar arrastando')">🗺️ Definir origem no mapa</button>

            <!-- RODADA 54 [15/09/2026 UTC], pedido original (reproduzido na
                 RODADA 54): seletor visual de direção primária (4 setas) +
                 sentido de quebra de linha (2 setas perpendiculares às
                 primárias) — 8 combinações no total. Em vez de "câmeras
                 ghost" desenhadas numa grade completa, optou-se por um
                 diagrama compacto de setas rotuladas (implementação
                 legítima do pedido, mesma intenção) que já alimenta o
                 preview em canvas logo abaixo com o resultado real. -->
            <div style="margin-top:10px">
              <span class="lbl" style="display:block; margin-bottom:4px">Direção do avanço (a partir da origem)</span>
              <div id="mc-foto-grade-dir" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:4px; max-width:150px">
                <span></span>
                <button type="button" class="btn secondary sm" data-dir="cima" title="De cima para baixo">↑</button>
                <span></span>
                <button type="button" class="btn secondary sm" data-dir="esquerda" title="Da direita para esquerda">←</button>
                <span style="text-align:center; align-self:center; font-size:11px">▦</span>
                <button type="button" class="btn secondary sm" data-dir="direita" title="Da esquerda para direita">→</button>
                <span></span>
                <button type="button" class="btn secondary sm" data-dir="baixo" title="De baixo para cima">↓</button>
                <span></span>
              </div>
              <span class="lbl" style="display:block; margin:8px 0 4px">Ao trocar de linha, a próxima linha vai para...</span>
              <div id="mc-foto-grade-quebra" style="display:flex; gap:6px"></div>
            </div>
            <div style="margin-top:10px">
              <span class="lbl" style="display:block; margin-bottom:4px">Pré-visualização (exemplo com várias linhas)</span>
              <canvas id="mc-foto-grade-preview" width="260" height="140" style="width:100%; max-width:260px; border:1px solid var(--border, #ccc); border-radius:6px; background:#0a0d11"></canvas>
            </div>
          </div>
        </div>

        <!-- RODADA 53, pedido verbatim (item D): "Deve haver outra
             subseção para definir um nome automático para as fotos que são
             tiradas. Por padrão fica ativada. O nome deve indicar a data e
             hora [...] Deve ser possível definir se nesse nome automático
             vai ser a hora local do aparelho ou se vai ser UTC [...] em vez
             de 'Seguir relógio do mundo', deve ser 'Seguir horário UTC'."
             [15/09/2026 UTC] RODADA 55 — trocados os 2 radio buttons pelo
             MESMO widget "Hora do dia" agora extraído/modular (ver
             _horaDoDiaWidgetHtml/_wireHoraDoDiaWidget), como pedido
             ("torne-as modulares e reaproveitáveis"): aqui SEM presets/
             globo/trilha (mostrarGlobo/mostrarTrilha: false — não há
             "hora contínua" nenhuma pra escolher, só 2 estados nomeados:
             local ou UTC), só o par de botões "seguir X" reaproveitado —
             mesmo texto/HTML/estado-disabled mutuamente exclusivo do uso
             3D, com altValue='utc' (em vez de 'mundo') e os rótulos
             ajustados. -->
        <div class="mapconfig-section">
          <h4>🏷️ Nome automático da foto</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-foto-nome-auto" ${cfg.fotoNomeAutomaticoAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Nomear a foto automaticamente com data/hora (padrão: ativado)</span><br><span class="d">Ex.: 2026-06-07_14-30-00. Desligado, a foto fica sem nome até alguém nomear na mão.</span></span>
          </label>
          <div style="margin-top:8px">
            ${this._horaDoDiaWidgetHtml({
              idPrefix: 'mc-fotonome-hora',
              presets: [],
              mostrarGlobo: false,
              mostrarTrilha: false,
              valorAtual: cfg.fotoNomeHoraUTC ? 'utc' : null,
              altValue: 'utc',
              altLabel: '🌐 Seguir horário UTC',
              autoLabel: '🕐 Hora local do aparelho',
            })}
          </div>
        </div>

        <!-- Seção "Foto" (pedido do usuário, 26/08/2026) — opções da
             ferramenta "📏 Medidas" de "Mapa" → "Foto" (ver ambientephotos.js
             _drawMedida/_openMedidaValorModal). Ver DEFAULTS acima pro
             significado de cada campo.
             ATUALIZADO (06/09/2026), pedido verbatim: "o ícone dessa seção
             deve ser igual ao ícone presente em 'Mapa'->'Foto'. Para não
             confundir visualmente com o botão 'Fotos' [do rodapé] e sua
             seção 'Fotos' [acima] (ambos com o mesmo ícone)." — causa raiz:
             este h4 usava o emoji 📷, visualmente muito parecido com o
             emoji da seção/botão "Fotos" (rodapé) — trocado pelo MESMO SVG
             inline usado pelo botão de verdade "Mapa"->"Foto" (ver
             mapview.js '_photoIconSvg()' — moldura + sol/montanha —,
             copiado aqui porque MapConfig é um módulo à parte, sem acesso
             direto aos métodos de MapView). -->
        <div class="mapconfig-section">
          <h4><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-4px; margin-right:2px"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" stroke="none"/><path d="M3 16l5.5-5 4 4 3-3L21 16"/></svg> Fotos</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-medida-setas" ${cfg.medidaSetasAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Seta nas extremidades da medida</span><br><span class="d">Depois de tocar em "✅ Inserir medida" (ferramenta 📏 Medidas de "Mapa" → "Fotos"), a reta ganha uma pequena seta em cada ponta.</span></span>
          </label>
          <label class="radio-opt" style="margin-top:10px">
            <input type="checkbox" id="mc-medida-circulo" ${cfg.medidaCirculoAposInserirAtivo ? 'checked' : ''}>
            <span><span class="t">Círculo nas extremidades depois de inserir</span><br><span class="d">O contorno de círculo que marca cada ponta enquanto a medida ainda está sendo posicionada continua aparecendo depois de inserida. Desligue pra deixar só a reta (e a seta, se ligada acima).</span></span>
          </label>
          <label class="radio-opt" style="margin-top:10px">
            <input type="checkbox" id="mc-medida-reposicionar" ${cfg.medidaReposicionarExtremidadesAtivo ? 'checked' : ''}>
            <span><span class="t">Reposicionar medidas feitas pelas suas extremidades</span><br><span class="d">Depois de "✅ Inserir medida", toque e arraste numa ponta da reta pra mover ela. Desligado por padrão — uma medida já inserida fica fixa, sem jeito de mexer nas pontas sem querer.</span></span>
          </label>
          <!-- NOVO (04/09/2026), pedido verbatim (item 3) — mesma estrutura
               da opção "Reposicionar medidas..." logo acima, só que pra
               "✏️ Traço guia" de 'Mapa'->'Fotos'. Ver DEFAULTS acima
               (tracoFotoReposicionarExtremidadesAtivo). -->
          <label class="radio-opt" style="margin-top:10px">
            <input type="checkbox" id="mc-traco-foto-reposicionar" ${cfg.tracoFotoReposicionarExtremidadesAtivo ? 'checked' : ''}>
            <span><span class="t">Reposicionar traços feitos pelas suas extremidades</span><br><span class="d">Com a ferramenta "✏️ Traço guia" ativa, toque e arraste numa ponta de um traço já inserido pra mover ela. Desligado por padrão — um traço já inserido fica fixo, sem jeito de mexer nas pontas sem querer.</span></span>
          </label>
          <!-- ITEM A1 (rodada 57/v311) — ver DEFAULTS acima pro texto do pedido verbatim -->
          <label class="radio-opt" style="margin-top:10px; display:block">
            <span class="t">Formato do arquivo em "⬇️ Baixar esta foto"</span><br>
            <span class="d">Tipo de imagem gerado ao clicar em "Baixar esta foto" em "Mapa" → "Fotos".</span>
            <select id="mc-foto-fmt-atual" style="margin-top:4px; display:block">
              <option value="jpg" ${(cfg.fotoDownloadFormatoAtual || 'jpg') === 'jpg' ? 'selected' : ''}>JPG</option>
              <option value="png" ${cfg.fotoDownloadFormatoAtual === 'png' ? 'selected' : ''}>PNG</option>
              <option value="webp" ${cfg.fotoDownloadFormatoAtual === 'webp' ? 'selected' : ''}>WEBP</option>
            </select>
          </label>
          <label class="radio-opt" style="margin-top:10px; display:block">
            <span class="t">Formato do arquivo em "⬇️ Baixar todas"</span><br>
            <span class="d">Tipo de imagem usado dentro do .zip gerado por "Baixar todas".</span>
            <select id="mc-foto-fmt-todas" style="margin-top:4px; display:block">
              <option value="jpg" ${(cfg.fotoDownloadFormatoTodas || 'jpg') === 'jpg' ? 'selected' : ''}>JPG</option>
              <option value="png" ${cfg.fotoDownloadFormatoTodas === 'png' ? 'selected' : ''}>PNG</option>
              <option value="webp" ${cfg.fotoDownloadFormatoTodas === 'webp' ? 'selected' : ''}>WEBP</option>
            </select>
          </label>
        </div>

        <!-- NOVO (03/09/2026), pedido verbatim: "Deve haver uma seção nas
             'configurações 2D' para a ferramenta 'Trena'. E deve ter a opção
             igual tem na seção 'Fotos', que é, 'Reposicionar medidas feitas
             pelas suas extremidades'." — mesma estrutura/mesmo texto da
             opção irmã da seção "📷 Foto" acima (ainda dentro do ternário
             opts.context === '2d' aberto lá em cima — fecha logo abaixo, não
             tem ternário próprio), só que pra ferramenta "📏 Trena" do
             próprio mapa 2D (mapview.js medidas2d). Ver DEFAULTS acima
             (medida2DReposicionarExtremidadesAtivo). -->
        <div class="mapconfig-section">
          <h4>📏 Trena</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-medida2d-reposicionar" ${cfg.medida2DReposicionarExtremidadesAtivo ? 'checked' : ''}>
            <span><span class="t">Reposicionar medidas feitas pelas suas extremidades</span><br><span class="d">Com a ferramenta "📏 Trena" ativa, passe o cursor sobre uma ponta de uma medida já feita (ela é destacada) e toque nela — ela passa a seguir o cursor até o próximo toque, que a solta ali (também dá pra tocar e arrastar segurando). Desligado por padrão — uma medida já inserida fica fixa, sem jeito de mexer nas pontas sem querer.</span></span>
          </label>
        </div>

        <!-- NOVO (04/09/2026), pedido verbatim: "A ferramenta 'Traço guia',
             também, deve ter o seu habilitador para poder reposicionar os
             que já foram inseridos na grade." — MESMA estrutura da seção
             "📏 Trena" logo acima. Ver DEFAULTS acima
             (traco2DReposicionarExtremidadesAtivo). -->
        <div class="mapconfig-section">
          <h4>✏️ Traço guia</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-traco2d-reposicionar" ${cfg.traco2DReposicionarExtremidadesAtivo ? 'checked' : ''}>
            <span><span class="t">Reposicionar traços feitos pelas suas extremidades</span><br><span class="d">Com a ferramenta "✏️ Traço guia" ativa, passe o cursor sobre uma ponta de um traço já feito (ela é destacada) e toque nela — ela passa a seguir o cursor até o próximo toque, que a solta ali. Desligado por padrão — um traço já inserido fica fixo, sem jeito de mexer nas pontas sem querer.</span></span>
          </label>
        </div>

        <!-- NOVO (07/09/2026), pedido verbatim: "Nas 'configurações 2D',
             deve haver uma seção para 'Rotação do mapa 2D'. Nela os ícones
             presentes na parte de rotação devem estar exatamente como
             aparecem no canto inferior direito da grade. Deve ser possível
             definir o valor do snap de rotação ali. O botão de 'Norte' pode
             ser clicado ali e o mapa inteiro se orienta para o norte. A
             rotação atual do mapa pode ser definida por ali também. Os
             mesmos botões de 'girar para a esquerda' e de 'girar para a
             direita' podem ser clicados ali também." Ícone do cabeçalho:
             MESMO SVG do botão "🧭 Norte" já usado no canto inferior direito
             da grade (ver mapview.js '#map-rotate-north'), copiado aqui pelo
             mesmo motivo já documentado na seção "📷 Foto" acima (MapConfig
             é um módulo à parte, sem acesso direto ao HTML de MapView).
             Os 4 botões (Norte/CCW/CW/Girar-arrastando) chamam DIRETO os
             métodos já existentes em window.MapView (_giroMapa2D*/
             _toggleMapDragRotate — MapView é um objeto global, ver
             "window.MapView = MapView" no fim de mapview.js: MapConfig só é
             aberto a partir da tela "Planta baixa" já montada — ver
             opts.context==='2d'/mapview.js MapConfig.open —, então
             MapView._renderer sempre existe quando este modal está de pé),
             então agem no MAPA DE VERDADE, não numa cópia — os 2 lugares
             (aqui e o canto inferior direito da grade) ficam sempre
             sincronizados/refletem o mesmo estado. Campo "Rotação atual" e
             o botão de snap são wireados logo abaixo (ver comentário grande
             perto de "mc-rot2d-north", mesmo padrão de leitura "ao vivo" já
             usado pelo campo de snap da grade na bandeja — ver mapview.js
             #map2d-drawer-gridsnap-val). -->
        <div class="mapconfig-section">
          <h4><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:-4px; margin-right:2px"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55"/><path d="M12 4 L15 12 L12 12 Z" fill="#ff5a5f"/><path d="M12 4 L9 12 L12 12 Z" fill="#ff5a5f"/><path d="M12 12 L15 12 L12 20 Z" fill="currentColor" opacity="0.55"/><path d="M12 12 L9 12 L12 20 Z" fill="currentColor" opacity="0.55"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg> Rotação do mapa 2D</h4>
          <span class="d" style="display:block; margin-bottom:8px">Mesmos controles do canto inferior direito da grade (Mapa → Planta baixa) — agem direto no mapa aberto agora.</span>
          <div class="mc-rot2d-botoes" style="display:flex; align-items:center; gap:8px; margin-bottom:10px">
            <button type="button" class="icon-btn" id="mc-rot2d-north" title="Orientar para o norte (0°)">
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55"/><path d="M12 4 L15 12 L12 12 Z" fill="#ff5a5f"/><path d="M12 4 L9 12 L12 12 Z" fill="#ff5a5f"/><path d="M12 12 L15 12 L12 20 Z" fill="currentColor" opacity="0.55"/><path d="M12 12 L9 12 L12 20 Z" fill="currentColor" opacity="0.55"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>
            </button>
            <button type="button" class="icon-btn" id="mc-rot2d-ccw" title="Girar a grade no sentido anti-horário">↺</button>
            <button type="button" class="icon-btn" id="mc-rot2d-cw" title="Girar a grade no sentido horário">↻</button>
            <button type="button" class="icon-btn" id="mc-rot2d-dragmode" title="Girar arrastando: ative e depois clique-e-arraste na grade — mesmo botão do canto inferior direito">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 a9 9 0 1 1 -7.79 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3.2 3.2 v6 h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
            </button>
          </div>
          <label class="radio-opt" style="display:block">
            <span class="t">Rotação atual do mapa (°)</span><br>
            <span class="d">Ângulo geral da grade agora — editar aqui gira o mapa direto pra esse valor.</span>
            <input type="number" step="1" id="mc-rot2d-atual" value="${Math.round(((window.MapView?._renderer?.view?.rot || 0) * 180 / Math.PI))}" style="margin-top:4px; display:block; max-width:120px">
          </label>
          <label class="radio-opt" style="display:block; margin-top:10px">
            <span class="t">Snap de rotação</span><br>
            <span class="d">De quantos em quantos graus a rotação do mapa "encaixa" ao girar (botões ↺/↻ acima e o "Girar arrastando"). Clique no botão pra digitar o valor (1° a 180°), ou clique e ARRASTE pra variar de 1 em 1 grau (cursor infinito).</span>
            <button type="button" class="btn secondary sm" id="mc-rot2d-snap-btn" style="margin-top:4px" title="Clique: digitar o valor. Clique e arraste: variar de 1 em 1 grau.">🔄 ${mapRotacaoSnapGraus}°</button>
          </label>
          <!-- NOVO (07/09/2026), pedido verbatim: "Deve ter um botão
               habilitador de snap para a rotação da grade do mapa 2D [...]
               Este botão habilitador de snap deve estar presente, também,
               na seção 'Rotação do mapa 2D' das 'configurações 2D'." —
               espelho do 5º botão da bandeja do canto inferior direito
               (#map-rotate-snap-toggle, ver mapview.js) — sincronizado com
               ele porque os dois leem/gravam a MESMA chave do DB
               (mapa2dRotacaoSnapAtivo, ver mapview.js
               _mapRotationSnapAtivo/_setMapRotationSnapAtivo).
               NOVO (07/09/2026), pedido verbatim: "o 'Habilitar snap de
               rotação' deve ter o mesmo ícone do ímã vermelho também." —
               mesmo emoji 🧲 usado em TODO o resto do app pra qualquer snap
               (grade/rotação/parede/etc., ver #map-rotate-snap-toggle acima
               e as várias ocorrências de "🧲 Snap..." em mapview.js), só
               que este rótulo específico ainda não tinha o ícone. -->
          <label class="radio-opt" style="display:block; margin-top:10px">
            <input type="checkbox" id="mc-rot2d-snap-toggle" ${window.MapView?._mapRotationSnapAtivo !== false ? 'checked' : ''}>
            <span><span class="t">🧲 Habilitar snap de rotação</span><br><span class="d">Ligado (padrão): os botões ↺/↻ e o "Girar arrastando" encaixam a rotação no valor de snap configurado acima. Desligado: a rotação fica livre, sem arredondar pra nenhum múltiplo.</span></span>
          </label>
        </div>` : ''}

        ${opts.context === '3d' ? `
        <!-- Pedido do usuário (rodada 48): dois botões novos "no topo das
             configurações 3D" — raio X global (com animação de óculos) e
             apresentação/sobrevoo automático do cenário. Sub-opções do raio X
             por categoria + "tudo no cenário" (rodada 49). Ver
             view3d.js _toggleGlobalXRay/_startSceneFlythrough. -->
        <div class="mapconfig-section">
          <h4>🎬 Apresentação</h4>
          <span class="lbl" style="display:block; margin-bottom:4px">👓 Raio X do cenário (aplica em tudo de uma vez, sem precisar mirar — diferente do Raio X pontual da tecla X)</span>
          <label class="radio-opt">
            <input type="checkbox" id="mc-xray-objetos" ${window.View3D?._xrayGlobal?.objetos ? 'checked' : ''}>
            <span><span class="t">Objetos</span></span>
          </label>
          <label class="radio-opt">
            <input type="checkbox" id="mc-xray-paredes" ${window.View3D?._xrayGlobal?.paredes ? 'checked' : ''}>
            <span><span class="t">Paredes</span></span>
          </label>
          <label class="radio-opt">
            <input type="checkbox" id="mc-xray-portas" ${window.View3D?._xrayGlobal?.portas ? 'checked' : ''}>
            <span><span class="t">Portas</span></span>
          </label>
          <label class="radio-opt">
            <input type="checkbox" id="mc-xray-janelas" ${window.View3D?._xrayGlobal?.janelas ? 'checked' : ''}>
            <span><span class="t">Janelas (mesmo fechadas)</span></span>
          </label>
          <label class="radio-opt" style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border)">
            <input type="checkbox" id="mc-xray-tudo">
            <span><span class="t">Tudo no cenário</span><br><span class="d">Marca e trava as 4 opções acima juntas (uma animação de óculos de raio X aparece ao ativar). Desmarcando esta, as opções acima voltam a ficar disponíveis pra escolher uma por uma.</span></span>
          </label>
          <button type="button" class="btn secondary block" id="mc-scene-flythrough" style="margin-top:10px">🚁 Sobrevoo automático do cenário</button>
        </div>
        <!-- NOVO (04/09/2026), pedido verbatim (item 5): "No 'Buscar', as
             opções de 'como chegar lá no 3D' devem ficar nas 'configurações
             3D'. O padrão é o órbita." — MESMOS 3 modos/textos/ícones que
             existiam no seletor modal removido (App.pickFlightMode3D, ver
             comentário grande em app.js), só que como preferência
             persistida (DEFAULTS.modoVoo3D) em vez de perguntado toda vez.
             Lido por App.verNoMapa3D (botões "👁️ Ver no mapa 3D" do item/
             foto) e pela busca 3D (view3d.js flyCameraToArc continua sendo
             o modo "arco" à parte da busca — este seletor não mexe nele,
             ver comentário lá). -->
        <div class="mapconfig-section">
          <h4>🚀 Modo de voo 3D</h4>
          <span class="d" style="display:block; margin-bottom:8px">Como a câmera chega até o destino ao usar "👁️ Ver no mapa 3D" (num patrimônio ou numa foto).</span>
          <label class="radio-opt">
            <input type="radio" name="mc-modovoo3d" id="mc-modovoo3d-direto" value="direto" ${(cfg.modoVoo3D || 'orbita') === 'direto' ? 'checked' : ''}>
            <span><span class="t">🎯 Direto</span><br><span class="d">A câmera aparece direto, centralizada na posição.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-modovoo3d" id="mc-modovoo3d-decima" value="decima" ${(cfg.modoVoo3D || 'orbita') === 'decima' ? 'checked' : ''}>
            <span><span class="t">🛩️ De cima</span><br><span class="d">Vem de um ponto alto e externo, de longe, e se aproxima.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-modovoo3d" id="mc-modovoo3d-orbita" value="orbita" ${(cfg.modoVoo3D || 'orbita') === 'orbita' ? 'checked' : ''}>
            <span><span class="t">🌀 Órbita (padrão)</span><br><span class="d">Dá 1/4 de volta vendo o conjunto, depois outro 1/4 se aproximando.</span></span>
          </label>
        </div>
        <!-- Seção "🌗 Hora do dia" (pedido do usuário, 03/09/2026) — ver
             DEFAULTS.horaDoDiaManual acima pro significado completo.
             [15/09/2026 UTC] EXTRAÍDA para o widget reutilizável
             _horaDoDiaWidgetHtml/_wireHoraDoDiaWidget (ver comentário
             grande lá) — pedido verbatim (RODADA 55): "Mapeie as
             dependências ... e as torne modulares e reaproveitáveis." Só
             o texto/moldura da seção (Sol/Lua) fica aqui; o widget em si
             (globo/trilha/presets/botões "seguir X") é genérico. -->
        <div class="mapconfig-section">
          <h4>🌗 Hora do dia</h4>
          <span class="d" style="display:block; margin-bottom:8px">Controla a posição do Sol/Lua e a iluminação da cena. Por padrão, o app segue a hora real do relógio do aparelho — os controles abaixo permitem travar num horário fixo (útil pra testar a iluminação de noite sem esperar a noite chegar de verdade).</span>
          ${this._horaDoDiaWidgetHtml({
            idPrefix: 'mc-hora',
            presets: [
              { hora: 8, label: '🌅 Manhã' },
              { hora: 13, label: '☀️ Dia' },
              { hora: 18, label: '🌇 Tarde' },
              { hora: 22, label: '🌙 Noite' },
            ],
            mostrarGlobo: true,
            mostrarTrilha: true,
            valorAtual: cfg.horaDoDiaManual,
            altValue: 'mundo',
            altLabel: '🌐 Seguir relógio do mundo',
            autoLabel: '🕐 Seguir relógio do aparelho',
            getAltHoraDecimal: () => this._horaMundoDecimal(),
          })}
        </div>
        <div class="mapconfig-section">
          <h4>Raycasting (mira do 3D)</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-raycast-on" ${cfg.raycastEnabled ? 'checked' : ''}>
            <span><span class="t">Mostrar destaque do raycasting</span><br><span class="d">Destaca o que a mira (linha reta do olho até o centro da tela) está atingindo — chão, parede, câmera, objeto ou item — em tempo real.</span></span>
          </label>
          <label class="field" style="margin-top:10px">
            <span class="lbl">Estilo do destaque</span>
            <select id="mc-raycast-style">
              <option value="hitbox" ${cfg.raycastHighlightStyle === 'hitbox' ? 'selected' : ''}>Caixa/volume mudando de cor (atual)</option>
              <option value="tightbox" ${cfg.raycastHighlightStyle === 'tightbox' ? 'selected' : ''}>Caixa justa (como as paredes), pra tudo</option>
              <option value="outline2d" ${cfg.raycastHighlightStyle === 'outline2d' ? 'selected' : ''}>Contorno pontilhado na projeção da tela</option>
            </select>
          </label>
          <label class="field" style="margin-top:10px">
            <span class="lbl">Precisão da mira</span>
            <select id="mc-raycast-precision">
              <option value="hitbox" ${(cfg.raycastPrecision || 'hitbox') === 'hitbox' ? 'selected' : ''}>Caixa de colisão (rápido — padrão)</option>
              <option value="pixelperfect" ${cfg.raycastPrecision === 'pixelperfect' ? 'selected' : ''}>Pixel perfect (testa a malha real, mais exato nas bordas)</option>
            </select>
            <!-- [13/09/2026] NOVO — pedido verbatim: com "Pixel perfect" marcado, o
                 objeto na mira ganha um contorno pontilhado na silhueta (ver
                 engine3d.js _updateHoverHighlight) independente do "Estilo do
                 destaque" escolhido acima. -->
            <span class="d" style="display:block; margin-top:4px">Com "Pixel perfect" marcado, o objeto na mira sempre ganha um contorno pontilhado na silhueta (independente do "Estilo do destaque" acima).</span>
          </label>
        </div>
        <!-- NOVO (07/09/2026), pedido verbatim: "scripts para os objetos
             como no Unity... Faça esse código de exemplo e deixe um botão
             para isso em uma seção nas 'configurações 3D'." — ver
             js/scripting.js (window.Scripting.runDemoWallBuild) pro
             exemplo completo (botão descendo + parede de tijolos se
             empilhando). Só aparece com o 3D já aberto, já que o exemplo
             precisa da cena Three.js ativa pra colocar as malhas
             temporárias — ver wiring de mc-scripting-demo mais abaixo
             (usa window.View3D._engine.scene). -->
        <div class="mapconfig-section">
          <h4>🎬 Scripts (exemplo)</h4>
          <span class="d" style="display:block; margin-bottom:8px">Motor de scripts por objeto, estilo Unity, em JavaScript puro (ver botão "🎬 Script"/"▶️ Executar script" no painel de propriedades de qualquer objeto). Este botão roda um exemplo pronto, direto na cena atual: um "botão" (cubo esticado) desce e, ao terminar, uma parede de tijolos se empilha em cima dele, animada.</span>
          <button type="button" class="btn secondary block" id="mc-scripting-demo">▶️ Demo: botão + parede de tijolos</button>
        </div>
        <!-- NOVO (07/09/2026), pedido verbatim: "carregar materiais e
             definir luz ambiente [...]" — completando o que ficou de fora
             da rodada anterior (materiais por objeto ja existiam; isto e
             luz AMBIENTE da CENA). Ver DEFAULTS.luzAmbienteIntensidade/
             luzAmbienteCor acima e engine3d.js _updateSky. -->
        <div class="mapconfig-section">
          <h4>💡 Luz ambiente</h4>
          <span class="d" style="display:block; margin-bottom:8px">Ajusta a luz ambiente da cena (ilumina tudo por igual, sem sombra/direção) por cima do ciclo dia/noite automático — não substitui o Sol/Lua, só realça ou escurece o conjunto.</span>
          <label class="field">
            <span class="lbl">Intensidade — <span id="mc-luzambiente-int-label">${(cfg.luzAmbienteIntensidade ?? 1).toFixed(2)}x</span></span>
            <input type="range" id="mc-luzambiente-intensidade" min="0" max="3" step="0.05" value="${cfg.luzAmbienteIntensidade ?? 1}">
          </label>
          <label class="map-panel-field" style="margin-top:8px"><span>Cor</span><input type="color" id="mc-luzambiente-cor" value="${cfg.luzAmbienteCor || '#ffffff'}"></label>
          <button type="button" class="btn secondary sm" id="mc-luzambiente-reset" style="margin-top:8px">Restaurar padrão (1x, branco)</button>
        </div>
        <!-- Seção "🔗 Item associado" (pedido do usuário, 26/08/2026) — mesmo
             destaque azul do mapa 2D (contorno + selo) pra objetos com um
             patrimônio associado (obj.itemId, ver o novo botão "📍 Adicionar
             orb" da hotbar 3D). Ver DEFAULTS acima e engine3d.js
             _addItemAssociadoDestaque pro significado de cada campo. -->
        <div class="mapconfig-section">
          <h4>🔗 Item associado</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-itemassoc-contorno" ${cfg.itemAssociado3DContorno !== false ? 'checked' : ''}>
            <span><span class="t">Contorno azul</span><br><span class="d">Objetos com um patrimônio associado ganham um contorno azul nas arestas, igual ao mapa 2D. Desligue se notar impacto de desempenho em mapas com muitos itens associados.</span></span>
          </label>
          <label class="radio-opt" style="margin-top:10px">
            <input type="checkbox" id="mc-destaque-extra-raio-3d" ${cfg.destaqueExtra3DRaioAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Destacar mais — raio azul (padrão)</span><br><span class="d">Soma um facho de luz azul bem visível de longe, tanto nos objetos com patrimônio associado quanto nos pinos-pirâmide de itens ainda não associados a nenhum objeto — útil pra achar rápido o que falta associar em mapas grandes.</span></span>
          </label>
          <label class="radio-opt" style="margin-top:10px">
            <input type="checkbox" id="mc-destaque-extra-dourado-3d" ${cfg.destaqueExtra3DDouradoAtivo ? 'checked' : ''}>
            <span><span class="t">Destacar mais — anel dourado</span><br><span class="d">Versão 3D do anel dourado do mapa 2D — um halo dourado no chão, na base do objeto/pino. Pode ficar ligado junto com o raio azul acima.</span></span>
          </label>
          <label class="field" style="margin-top:10px">
            <span class="lbl">Selo do item associado</span>
            <select id="mc-itemassoc-selo">
              <option value="plaquinha" ${(cfg.itemAssociado3DSelo || 'plaquinha') === 'plaquinha' ? 'selected' : ''}>Plaquinha (padrão)</option>
              <option value="bolinha" ${cfg.itemAssociado3DSelo === 'bolinha' ? 'selected' : ''}>Bolinha azul (como no 2D)</option>
            </select>
            <span class="d">"Plaquinha": uma placa pequena com 🔗 numa altura de visão confortável do objeto — se ele for muito alto, a plaquinha fica numa altura mais baixa em vez de subir até o topo (onde não daria pra ver). "Bolinha azul": uma bolinha com 🔗, mesmo visual do mapa 2D.</span>
          </label>
          <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border)">
            <span style="display:block; font-size:14px; font-weight:600">Ver através das paredes</span>
            <span class="d" style="display:block; margin-top:2px; margin-bottom:4px">Cada peça acima pode ficar visível mesmo com uma parede na frente, ou respeitar profundidade normal (escondendo atrás delas) — independente uma da outra. A plaquinha/bolinha nunca fica escondida atrás do PRÓPRIO objeto, mesmo com a opção dela desligada — só atrás de paredes/portas/janelas.</span>
            <label class="radio-opt" style="padding-left:6px">
              <input type="checkbox" id="mc-atravesparedes-plaquinha" ${cfg.itemBadge3DAtravesParedesAtivo !== false ? 'checked' : ''}>
              <span><span class="t">Plaquinhas/bolinhas</span><br><span class="d">O selo "🔗 item associado" e as flags de duplicação/multi-item.</span></span>
            </label>
            <label class="radio-opt" style="padding-left:6px">
              <input type="checkbox" id="mc-atravesparedes-dourado" ${cfg.anelDourado3DAtravesParedesAtivo !== false ? 'checked' : ''}>
              <span><span class="t">Círculo dourado</span><br><span class="d">O halo dourado do "Destacar mais" (ver mais acima).</span></span>
            </label>
            <label class="radio-opt" style="padding-left:6px">
              <input type="checkbox" id="mc-atravesparedes-raio" ${cfg.raioAzul3DAtravesParedesAtivo !== false ? 'checked' : ''}>
              <span><span class="t">Raio azul</span><br><span class="d">O facho de luz do "Destacar mais" (ver mais acima).</span></span>
            </label>
          </div>
          ${this._flagsLegendHtml()}
        </div>
        <!-- Pedido do usuário: "uma opção nas configurações 3D do que
             acontece com os itens adicionados enquanto se está no 3D [...]
             onde ficou a opção [...]? É pra essa opção ficar nas
             'configurações 3D'." Morava em settings.js (Configurações do
             app); construir (parede/porta/janela/objeto) dentro do 3D (ver
             view3d.js _bindDesktopControls/_placeWithBuildTool) agora
             escolhe entre uma camada própria "Adicionados no 3D" ou a mesma
             que estava ativa no 2D quando "Ver em 3D" foi clicado (ver
             view3d.js mount/_layerIdParaNovosItens). -->
        <div class="mapconfig-section">
          <h4>Itens construídos dentro do 3D</h4>
          <span style="display:block; font-size:12.5px; color:var(--text-dim); margin-bottom:5px">Parede/porta/janela/objeto criados aqui dentro vão para</span>
          <label class="radio-opt"><input type="radio" name="mc-camada3d" value="separada" ${cfg.camada3DNovosItens !== 'atual' ? 'checked' : ''}><span><span class="t">Uma camada separada, "Adicionados no 3D"</span><br><span class="d">Criada automaticamente na primeira vez — fácil de achar/organizar/ocultar depois, sem misturar com o resto do desenho.</span></span></label>
          <label class="radio-opt"><input type="radio" name="mc-camada3d" value="atual" ${cfg.camada3DNovosItens === 'atual' ? 'checked' : ''}><span><span class="t">A camada que estava ativa no 2D</span><br><span class="d">A mesma camada selecionada na Planta baixa no momento em que "Ver em 3D" foi clicado.</span></span></label>
        </div>
        <!-- [12/09/2026 — FUNDIDA NESTA RODADA, ver nota grande em
             DEFAULTS.cameraExitViewMode acima para o histórico completo.
             Pedido verbatim: "a seção 'Câmera — Sair da câmera' e a seção
             'Orb de câmera — Sair da câmera', na verdade devem ser uma só,
             pois já não existe mais 'Orb da câmera' e 'Câmera' [...] nas
             'configurações 3D' deve ter só o que permaneceu também." Antes
             desta rodada havia 2 seções/2 chaves independentes
             (cameraExitViewMode/fotoOrbExitViewMode); agora é 1 seção só,
             1 grupo de radios, 1 chave (cameraExitViewMode) — controla os 2
             code-paths internos (Câmeras/orb de foto) a partir de um único
             controle visível, como pedido. -->
        <div class="mapconfig-section">
          <h4>Ver através desta câmera — "Sair da câmera"</h4>
          <span style="display:block; font-size:12.5px; color:var(--text-dim); margin-bottom:5px">Ao clicar "👁️ Ver através desta câmera"/"✖ Sair da câmera" (numa "Câmera" ou num "orb de foto"), o que acontece com o ponto de vista do personagem ao sair:</span>
          <label class="radio-opt"><input type="radio" name="mc-cam-exitview" data-exitview-group="camera" value="lockedView" ${cfg.cameraExitViewMode !== 'originalView' ? 'checked' : ''}><span><span class="t">Permanece com o ponto de vista da câmera (padrão)</span><br><span class="d">O personagem continua vendo exatamente de onde a câmera estava mostrando no momento em que "Sair da câmera" foi clicado — a transição fica contínua, só que agora livre pra olhar em volta/andar dali.</span></span></label>
          <label class="radio-opt"><input type="radio" name="mc-cam-exitview" data-exitview-group="camera" value="originalView" ${cfg.cameraExitViewMode === 'originalView' ? 'checked' : ''}><span><span class="t">Volta ao ponto de vista original do personagem</span><br><span class="d">O personagem volta pra onde/como estava olhando no instante EXATO em que "Ver através desta câmera" foi clicado, antes de travar na câmera.</span></span></label>
        </div>
        <div class="mapconfig-section">
          <h4>🧲 Física de colocação</h4>
          <span style="display:block; font-size:12.5px; color:var(--text-dim); margin-bottom:5px">Ao posicionar parede, porta, janela, cubo ou objeto padrão no 3D — o raycasting da mira bate no que já existe (parede, objeto, porta, janela) e o ghost do novo item se encosta ao lado ou em cima, dependendo de onde bater o raio.</span>
          <label class="radio-opt">
            <input type="radio" name="mc-fisica-colocacao" id="mc-fisica-colisao" value="colisao" ${!cfg.ignorarFisica ? 'checked' : ''}>
            <span><span class="t">Considerar colisão</span><br><span class="d">Padrão: ao mirar numa parede, o objeto/item encosta rente a ela em vez de atravessar (o ghost desliza pela parede conforme você mira, e some se não houver posição válida ali); ao mirar na lateral de outro objeto, porta ou janela já colocados, encosta do lado deles. Colocar um objeto EM CIMA de outro sempre funciona, nos dois modos.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-fisica-colocacao" id="mc-fisica-livre" value="livre" ${cfg.ignorarFisica ? 'checked' : ''}>
            <span><span class="t">Modo livre</span><br><span class="d">Ignora toda colisão lateral (parede, objeto, porta, janela) — permite colocar um objeto dentro de outro ou atravessando uma parede.</span></span>
          </label>
        </div>
        <div class="mapconfig-section">
          <h4>Desempenho 3D</h4>
          <!-- [13/09/2026] UNIFICADO — antes existiam DUAS configs
               separadas chamadas "resolução" nesta mesma seção: "Resolução"
               (teto de devicePixelRatio, cfg.resolucao3D, usado em
               engine3d.js RESOLUCAO_DPR) e "Resolução de renderização
               (Ver em 3D)" (tamanho fixo de render target,
               cfg.resolucaoCustom3D, usado no "modo eye"/render target
               de engine3d.js + _applyResolucaoCustom3D de view3d.js).
               São mecanismos tecnicamente diferentes (um é multiplicador
               de nitidez sobre o tamanho nativo do canvas; o outro é um
               tamanho de render fixo e independente, depois esticado ou
               "encaixado" no canvas), mas pro usuário eram "duas coisas
               chamadas resolução" na mesma tela — confuso. Unificado num
               único select que grava nos MESMOS DOIS campos de config
               de sempre (resolucao3D + resolucaoCustom3D), preservando
               100% da lógica já existente em engine3d.js/view3d.js — só a
               APRESENTAÇÃO virou uma seção só. Configs antigas continuam
               funcionando sem migração: o valor selecionado é DERIVADO
               dos dois campos existentes (ver wiring mais abaixo). -->
          <label class="field">
            <span class="lbl">Resolução de renderização</span>
            <select id="mc-res-mode">
              <option value="alta" ${(!cfg.resolucaoCustom3D && (cfg.resolucao3D || 'alta') === 'alta') ? 'selected' : ''}>Automática (nítido — padrão)</option>
              <option value="media" ${(!cfg.resolucaoCustom3D && cfg.resolucao3D === 'media') ? 'selected' : ''}>Automática (média)</option>
              <option value="baixa" ${(!cfg.resolucaoCustom3D && cfg.resolucao3D === 'baixa') ? 'selected' : ''}>Automática (mais FPS)</option>
              <option value="custom" ${cfg.resolucaoCustom3D ? 'selected' : ''}>Personalizada…</option>
            </select>
            <span class="d">"Automática" ajusta a nitidez do canvas do jeito de sempre (mais nítido = mais pesado pra GPU). "Personalizada…" define um tamanho de render FIXO em pixels (independente do tamanho da tela), depois esticado ou encaixado no canvas — ignora o nível de nitidez acima enquanto estiver ativa.</span>
          </label>
          <label class="radio-opt" style="margin-top:10px">
            <input type="checkbox" id="mc-antialiasing3d" ${cfg.antialiasing3D !== false ? 'checked' : ''}>
            <span><span class="t">Suavização de bordas (antialiasing)</span><br><span class="d">Desligar custa menos GPU (mais FPS), mas as bordas ficam serrilhadas. Só faz efeito da próxima vez que "Ver em 3D" for aberto — não muda com a tela já aberta.</span></span>
          </label>
          <div id="mc-res-mode-fields" class="${cfg.resolucaoCustom3D ? '' : 'hidden'}" style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; align-items:flex-end">
            <label class="field" style="flex:1; min-width:100px">
              <span class="lbl">Largura (px)</span>
              <input type="number" id="mc-res-custom3d-w" min="${this.RES_CUSTOM_MIN}" step="1" value="${cfg.resolucaoCustom3D?.w || 1280}">
            </label>
            <label class="field" style="flex:1; min-width:100px">
              <span class="lbl">Altura (px)</span>
              <input type="number" id="mc-res-custom3d-h" min="${this.RES_CUSTOM_MIN}" step="1" value="${cfg.resolucaoCustom3D?.h || 720}">
            </label>
            <label class="field" style="flex:1; min-width:140px">
              <span class="lbl">Modo de ajuste</span>
              <select id="mc-res-custom3d-fit">
                <option value="esticar" ${(cfg.resolucaoCustom3D?.fit || 'esticar') === 'esticar' ? 'selected' : ''}>Esticar (preenche tudo)</option>
                <option value="caber" ${cfg.resolucaoCustom3D?.fit === 'caber' ? 'selected' : ''}>Caber (mantém proporção, barras pretas)</option>
              </select>
            </label>
          </div>
          <label class="field" style="margin-top:10px">
            <span class="lbl">Distância de renderização</span>
            <select id="mc-render-distance">
              <option value="20" ${String(cfg.renderDistance) === '20' ? 'selected' : ''}>Curta (20m — mais FPS)</option>
              <option value="42" ${String(cfg.renderDistance || 42) === '42' ? 'selected' : ''}>Média (42m — padrão)</option>
              <option value="80" ${String(cfg.renderDistance) === '80' ? 'selected' : ''}>Longa (80m)</option>
              <option value="150" ${String(cfg.renderDistance) === '150' ? 'selected' : ''}>Muito longa (150m)</option>
              <option value="custom" ${rdCustom ? 'selected' : ''}>Personalizada…</option>
            </select>
            <!-- Pedido do usuário: "deve ter uma opção de 'customizado' para
                 definir o valor de distância de renderização de forma mais
                 livre com limite mínimo de 3m." Só aparece com "Personalizada…"
                 selecionado (ver _wireCustomNumberField abaixo). -->
            <input type="number" id="mc-render-distance-custom" class="${rdCustom ? '' : 'hidden'}"
              style="margin-top:6px" min="${this.RENDER_DISTANCE_MIN}" step="1"
              value="${Math.max(this.RENDER_DISTANCE_MIN, Number(cfg.renderDistance) || 42)}"
              placeholder="metros (mínimo ${this.RENDER_DISTANCE_MIN}m)" title="Distância de renderização em metros, sem limite máximo (mínimo ${this.RENDER_DISTANCE_MIN}m)">
          </label>
          <label class="field" style="margin-top:10px">
            <span class="lbl">Limite de FPS</span>
            <select id="mc-fps-limite">
              <option value="0" ${String(cfg.fpsLimite || 0) === '0' ? 'selected' : ''}>Sem limite (padrão)</option>
              <option value="30" ${String(cfg.fpsLimite) === '30' ? 'selected' : ''}>30 fps</option>
              <option value="45" ${String(cfg.fpsLimite) === '45' ? 'selected' : ''}>45 fps</option>
              <option value="60" ${String(cfg.fpsLimite) === '60' ? 'selected' : ''}>60 fps</option>
              <option value="custom" ${fpsCustom ? 'selected' : ''}>Personalizado…</option>
            </select>
            <!-- Pedido do usuário: "os limites não estão funcionando [o real
                 bug era o HUD não refletir o limite — ver perf.js]. Deve ter
                 uma opção de 'customizado' para definir um valor de FPS." -->
            <input type="number" id="mc-fps-limite-custom" class="${fpsCustom ? '' : 'hidden'}"
              style="margin-top:6px" min="${this.FPS_LIMITE_MIN}" step="1"
              value="${fpsCustom ? Number(cfg.fpsLimite) : 24}"
              placeholder="fps (mínimo ${this.FPS_LIMITE_MIN})" title="Limite de quadros por segundo (mínimo ${this.FPS_LIMITE_MIN})">
          </label>
          <label class="field" style="margin-top:10px">
            <span class="lbl">Render das luminárias</span>
            <select id="mc-modo-luminarias3d">
              <option value="dinamico" ${(cfg.modoLuminarias3D || 'dinamico') === 'dinamico' ? 'selected' : ''}>Dinâmico — luz de verdade (padrão)</option>
              <option value="leve" ${cfg.modoLuminarias3D === 'leve' ? 'selected' : ''}>Leve — só cor, sem luz de verdade (melhor com várias lâmpadas)</option>
            </select>
            <span class="d">"Dinâmico" acende uma luz de verdade por luminária (mais realista, mais pesado com muitas). "Leve" não acende luz nenhuma — só clareia a cor dos objetos perto de cada luminária, decidido uma vez ao montar a cena (não a cada quadro) — útil pra testar mapas com muitas luminárias sem perder FPS.</span>
          </label>
          <label class="field" style="margin-top:10px">
            <span class="lbl">Carregamento de objetos/itens/câmeras</span>
            <select id="mc-objeto-render-modo">
              <option value="objeto" ${(cfg.objetoRenderModo || 'objeto') === 'objeto' ? 'selected' : ''}>Por objeto (padrão — testa cada um contra a distância de renderização)</option>
              <option value="chunk" ${cfg.objetoRenderModo === 'chunk' ? 'selected' : ''}>Por pedaço (chunk — testa blocos inteiros de uma vez)</option>
            </select>
            <span class="d">Antes desta opção, a "Distância de renderização" acima só afetava a neblina — todo objeto/item/câmera do mapa continuava sendo desenhado de verdade, só ficando encoberto visualmente. Agora o que estiver fora do alcance nem é desenhado. "Por objeto" testa cada um individualmente (simples, sempre exato). "Por pedaço" agrupa objetos em blocos e testa o bloco inteiro — menos testes por quadro em mapas com MUITOS objetos, mas um bloco só some quando sai inteiro do alcance (corte mais grosseiro). Paredes/piso/porta/janela nunca são afetados — sempre visíveis.</span>
            <input type="number" id="mc-objeto-chunk-tam" class="${cfg.objetoRenderModo === 'chunk' ? '' : 'hidden'}"
              style="margin-top:6px" min="2" max="100" step="1"
              value="${Math.round(Utils.clamp(Number(cfg.objetoChunkTamanho) || 10, 2, 100))}"
              placeholder="tamanho do bloco em metros" title="Tamanho de cada bloco/chunk, em metros (mínimo 2m)">
          </label>
          <!-- [13/09/2026 UTC] NOVO — ver comentário grande de
               DEFAULTS.objetoLimitePorFrame, acima, pro pedido/motivo
               completo. Subseção própria (checkbox liga/desliga + campo de
               número), mesmo padrão visual do restante desta seção. -->
          <label class="field checkbox" style="margin-top:10px">
            <input type="checkbox" id="mc-limite-frame-ativo" ${cfg.objetoLimitePorFrameAtivo !== false ? 'checked' : ''}>
            <span class="lbl">Limitar objetos renderizados por quadro</span>
          </label>
          <label class="field" id="mc-limite-frame-wrap" style="margin-top:6px${cfg.objetoLimitePorFrameAtivo === false ? ';display:none' : ''}">
            <span class="lbl">Limite de objetos por quadro</span>
            <input type="number" id="mc-limite-frame-valor" min="1" step="1"
              value="${Math.max(1, Math.round(Number(cfg.objetoLimitePorFrame) || 1200))}"
              placeholder="ex: 1200" title="Quantidade máxima de objetos/itens/câmeras desenhados numa mesma cena/quadro">
            <span class="d">Quando o contador de objetos desenhados numa cena chega neste limite, nenhum outro é desenhado NAQUELE quadro — o resto só aparece (ou não, se sair do alcance/setor antes) no quadro seguinte. Objetos mais PERTO do personagem têm prioridade (são desenhados primeiro); um limite baixo com muitos objetos espalhados pode deixar objetos distantes "piscando" entre quadros — os scripts/rotinas deles (animação, NPC) continuam rodando normalmente mesmo fora da tela, só a malha para de ser desenhada. Padrão: 1200.</span>
          </label>
          <!-- [13/09/2026] NOVO — pedido verbatim: "Adicione controles de
               plano de corte próximo/distante (z_near/z_far) da câmera na
               seção 'Desempenho 3D', usando o mesmo componente de 'botão
               triplo' (arrastar/clicar nas setas/clicar no centro para
               digitar) que já existe. Deve ser atualizado em tempo real."
               Ver DEFAULTS.cameraZNear/cameraZFar acima pro significado
               completo dos dois campos. Os divs abaixo ficam VAZIOS —
               _wireDesempenho3DCamPlanes (chamado no fim de open(), mesmo
               padrão de _wireCamPropsFieldset em mapview.js) é quem monta
               e encaixa os widgets de verdade (ModelerUI._createNumField,
               o "botão triplo"). -->
          <label class="field" style="margin-top:10px">
            <span class="lbl">Plano de corte da câmera (near/far)</span>
            <span class="d">Distância mínima ("Início") e máxima ("Fim") que a câmera do "Ver em 3D" desenha — objetos mais perto que "Início" ou mais longe que "Fim" somem da tela. "Início" bem pequeno pode causar "z-fighting" (tremulação) em objetos distantes; "Fim" não precisa passar da "Distância de renderização" acima (o que estiver além dela já some na neblina). Atualiza a câmera do "Ver em 3D" (se estiver aberta) na hora, sem precisar reabrir.</span>
            <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap">
              <div id="mc-cam-znear-wrap"></div>
              <div id="mc-cam-zfar-wrap"></div>
            </div>
          </label>
        </div>
        <!-- NOVO (07/09/2026), seção "🖥️ Efeitos de tela" — pedido verbatim
             do usuário: "Coloque nas 'configurações 3D', em uma seção de
             'Efeitos de tela' este efeito de escurecimento, quando está sem
             o 'colorSpace: THREE.SRGBColorSpace' como opção nesta seção."
             Ver DEFAULTS.efeitoTelaEscurecida3D acima pro significado
             completo e engine3d.js pra como é aplicado no render target de
             cada "olho". -->
        <div class="mapconfig-section">
          <h4>🖥️ Efeitos de tela</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-efeito-tela-escurecida3d" ${cfg.efeitoTelaEscurecida3D ? 'checked' : ''}>
            <span><span class="t">Escurecimento (sem correção de cor sRGB)</span><br><span class="d">Desligado (padrão): cores/brilho normais, corretos. Ligado: um visual mais escuro/dramático, resultado de pular a correção de cor que normalmente deixa a cena com o brilho certo — puramente estético, não afeta desempenho. Se a mudança não aparecer na hora com o 3D já aberto, saia da tela do 3D e entre novamente para aplicar o efeito.</span></span>
          </label>
        </div>
        <!-- Seção "🧊 Cubo" (pedido do usuário, 28/08/2026 — ver
             DEFAULTS.cuboOrigemCentro acima pro significado completo). -->
        <div class="mapconfig-section">
          <h4>🧊 Cubo</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-cubo-origem-centro" ${cfg.cuboOrigemCentro !== false ? 'checked' : ''}>
            <span><span class="t">Origem no centro do cubo (como no Blender)</span><br><span class="d">Ligado (padrão): ao inserir um cubo novo no Modelador 3D, a origem local dele (o pivô do gizmo, a bolinha de origem) fica bem no meio geométrico do cubo — igual ao Blender. Desligado: a origem fica na base do cubo (comportamento antigo). O cubo continua aparecendo apoiado no mesmo lugar nos dois casos — só o pivô muda. Só afeta cubos NOVOS, não objetos já modelados antes.</span></span>
          </label>
        </div>
        <!-- Seção "🧭 Bússola 3D" (pedido do usuário, 03/09/2026): opção pra
             habilitar/desabilitar o anel com os pontos cardeais que aparece
             em "Ver em 3D" (agora no canto superior direito da tela, 80% do
             tamanho — ver css/style.css .v3d-compass-ring/-inner/-wrap e o
             show/hide em view3d.js _applyBussola3DVisibilidade, chamado no
             mount() e em _onMapConfigChange). -->
        <div class="mapconfig-section">
          <h4>🧭 Bússola 3D</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-bussola3d" ${cfg.bussola3DAtiva !== false ? 'checked' : ''}>
            <span><span class="t">Mostrar anel de bússola (N/S/L/O)</span><br><span class="d">Anel com os pontos cardeais/colaterais no canto superior direito da tela, durante "Ver em 3D" — gira conforme a direção que a câmera olha. Clique num rótulo pra virar pra aquela direção.</span></span>
          </label>
        </div>
        <!-- Seção "🐞 Debug" (pedido do usuário, 25/08/2026: "deve haver uma
             seção nas 'configurações 3D' para opções de debug. O
             'transferidor' e o 'prolongamento de linhas tracejadas do
             objeto' devem ser opcionais cada um. Marcados por padrão") —
             ver DEFAULTS.debugTransferidorAtivo/debugProlongamentoAtivo
             acima pro que cada guia visual faz. -->
        <div class="mapconfig-section">
          <h4>🐞 Debug</h4>
          <!-- [12/09/2026] NOVO — pedido verbatim: "Em 'configurações 3D', na
               seção 'Debug', coloque um botão para ativar o debug. Ativando
               o debug, todas as suas opções entram em execução." Interruptor
               MESTRE: desligado por padrão (diferente dos 4 abaixo, que são
               'checked' por padrão) — com ele desligado, NENHUMA das opções
               de debug abaixo executa de verdade, mesmo se marcadas (ver
               DEFAULTS.debugModoAtivo acima e _isDebugAtivo(), view3d.js). -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-debug-modo-ativo" ${cfg.debugModoAtivo ? 'checked' : ''}>
            <span><span class="t"><b>Ativar modo Debug</b></span><br><span class="d">Interruptor mestre desta seção — desligado por padrão. Com ele desligado, nenhuma das opções de debug abaixo (mesmo marcadas) é exibida de verdade; ligue-o para que as opções marcadas abaixo entrem em execução.</span></span>
          </label>
          <label class="radio-opt" style="margin-top:8px">
            <input type="checkbox" id="mc-debug-transferidor" ${cfg.debugTransferidorAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Transferidor (anel de rotação)</span><br><span class="d">Anel pontilhado de 8 divisões desenhado no chão ao girar porta/janela/objeto (Modo Padrão ou Giro Livre) — mostra visualmente onde o giro vai travar a cada 45°.</span></span>
          </label>
          <label class="radio-opt" style="margin-top:8px">
            <input type="checkbox" id="mc-debug-prolongamento" ${cfg.debugProlongamentoAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Prolongamento/sombra do objeto pousado</span><br><span class="d">Quando o ghost do 📦 Objeto está pousado em cima de outro objeto: 4 linhas verticais pontilhadas ("prumo") descendo até o chão + um contorno pontilhado ("sombra") no chão, mostrando onde o objeto ficaria projetado.</span></span>
          </label>
          <label class="radio-opt" style="margin-top:8px">
            <input type="checkbox" id="mc-debug-alvo-orbital" ${cfg.modeladorMostrarAlvoOrbital !== false ? 'checked' : ''}>
            <span><span class="t"><svg class="mc-alvo-orbital-ic" width="14" height="14" viewBox="0 0 14 14" style="vertical-align:-2px;margin-right:4px" aria-hidden="true"><circle cx="7" cy="7" r="4" fill="rgba(80,220,255,0.9)" stroke="#003a4d" stroke-width="1.5"/><line x1="7" y1="0" x2="7" y2="2" stroke="#003a4d" stroke-width="1.5"/><line x1="7" y1="12" x2="7" y2="14" stroke="#003a4d" stroke-width="1.5"/><line x1="0" y1="7" x2="2" y2="7" stroke="#003a4d" stroke-width="1.5"/><line x1="12" y1="7" x2="14" y2="7" stroke="#003a4d" stroke-width="1.5"/></svg>Ponto-alvo da câmera orbital (Modelador)</span><br><span class="d">No Modelador 3D, com a câmera no modo "Órbita", ela sempre mira um ponto fixo no espaço — esta opção desenha uma bolinha nesse ponto (igual ao ícone ao lado, mesmas cores da que aparece na câmera), pra deixar visível onde ele está. Não aparece no modo de câmera "Livre" (que não mira ponto nenhum).</span></span>
          </label>
          <!-- [11/09/2026] NOVO — pedido verbatim: "Nas 'configurações 3D', na
               seção 'debug', coloque mais uma opção na lista de ativações
               deste modo que é o 'Enquadramento de câmera'. Ativo, por
               padrão." -->
          <label class="radio-opt" style="margin-top:8px">
            <input type="checkbox" id="mc-debug-enquadramento-camera" ${cfg.debugEnquadramentoCameraAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Enquadramento de câmera</span><br><span class="d">O "retângulo amarelo" que representa os limites/enquadramento de uma câmera calibrada (📷 Câmeras/orbs de foto) — visível ao selecionar a câmera e em "Ver através desta câmera".</span></span>
          </label>
          <!-- [17/09/2026 UTC] NOVO (RODADA 123) — pedido verbatim: imprimir
               (pra teste) as coordenadas x/y de tela calculadas, junto do
               texto da medida e ao lado da esfera vermelha da Trena 3D,
               como uma opção desta seção "Debug" (em vez de sempre ligado
               no código). Ver DEFAULTS.debugTrena3DCoordenadasAtivo e
               _isDebugTrena3DCoordenadasAtivo()/aplicarDebugCoords
               (view3d.js, _trena3DUpdateLabels). -->
          <label class="radio-opt" style="margin-top:8px">
            <input type="checkbox" id="mc-debug-trena3d-coords" ${cfg.debugTrena3DCoordenadasAtivo === true ? 'checked' : ''}>
            <span><span class="t">Coordenadas de tela da Trena 3D</span><br><span class="d">Ferramenta de diagnóstico: imprime as coordenadas x/y de tela calculadas junto do texto de cada medida, e um rótulo extra ao lado da esfera vermelha do ponto médio com as coordenadas dela — útil pra comparar se os dois batem. Desligado por padrão.</span></span>
          </label>
          <!-- [17/09/2026 UTC] NOVO (RODADA 125) — pedido verbatim: "Nas
               'configurações 3D', na seção de debug, deve ter um botão que
               habilita aparecer/não aparecer o botão que liga/desliga o
               debug em algum lugar da tela." Não existia nenhum botão
               flutuante de debug na tela até esta rodada — criado um botão
               🐞 fixo no canto (ver view3d.js '_trena3DEnsureDebugBotaoTela'),
               que alterna 'debugModoAtivo' com 1 clique. Este novo campo só
               controla se ele aparece ou não (padrão: aparece). -->
          <label class="radio-opt" style="margin-top:8px">
            <input type="checkbox" id="mc-debug-botao-tela" ${cfg.debugBotaoTelaAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Mostrar botão 🐞 flutuante na tela (liga/desliga o debug)</span><br><span class="d">Um pequeno botão fixo no canto da tela, dentro do visualizador 3D, que alterna "Ativar modo Debug" (acima) com 1 clique — sem precisar abrir as configurações. Ligado por padrão.</span></span>
          </label>
        </div>
        <!-- Seção "🧱 Parede" (pedido do usuário, 24/08/2026) — snaps da
             ferramenta "🧱 Parede" da hotbar (view3d.js) e o estilo de
             junção das quinas (engine3d.js). Ver DEFAULTS acima pro
             significado de cada campo. -->
        <div class="mapconfig-section">
          <h4>🧱 Parede</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-parede-snap-grade-on" ${cfg.paredeSnapGradeAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Snap magnético de grade</span><br><span class="d">Ao desenhar uma parede, o ponto mirado "gruda" no múltiplo mais próximo do tamanho de grade abaixo.</span></span>
          </label>
          <label class="field" style="margin-top:8px; margin-left:26px">
            <span class="lbl">Tamanho da grade (cm)</span>
            <input type="number" id="mc-parede-snap-grade-tam" min="${this.PAREDE_SNAP_GRADE_MIN * 100}" max="${this.PAREDE_SNAP_GRADE_MAX * 100}" step="1"
              value="${Math.round(Utils.clamp(Number(cfg.paredeSnapGradeTamanho) || 0.2, this.PAREDE_SNAP_GRADE_MIN, this.PAREDE_SNAP_GRADE_MAX) * 100)}"
              title="Entre ${this.PAREDE_SNAP_GRADE_MIN * 100}cm e ${this.PAREDE_SNAP_GRADE_MAX * 100}cm">
          </label>

          <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border)">
            <span class="lbl" style="display:block; margin-bottom:5px">Modificador por tecla (hold key)</span>
            <span class="d" style="display:block; margin-bottom:6px">Segurando a tecla escolhida, desliga a grade/ângulo e libera o desenho em qualquer coordenada — solte a tecla pra voltar ao encaixe.</span>
            <select id="mc-parede-modificador">
              <option value="shift" ${(cfg.paredeModificador || 'shift') === 'shift' ? 'selected' : ''}>Shift</option>
              <option value="alt" ${cfg.paredeModificador === 'alt' ? 'selected' : ''}>Alt</option>
              <option value="nenhuma" ${cfg.paredeModificador === 'nenhuma' ? 'selected' : ''}>Nenhuma (grade sempre ativa)</option>
            </select>
            <label class="radio-opt" style="margin-top:8px">
              <input type="checkbox" id="mc-parede-modificador-inverter" ${cfg.paredeModificadorInvertido ? 'checked' : ''}>
              <span><span class="t">Inverter lógica</span><br><span class="d">Com isto ligado, o encaixe começa DESLIGADO e é a tecla escolhida acima que LIGA o encaixe (em vez de desligar).</span></span>
            </label>
          </div>

          <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border)">
            <span class="lbl" style="display:block; margin-bottom:5px">Tipos de encaixe (snap)</span>
            <label class="radio-opt"><input type="checkbox" id="mc-parede-snap-intersecao" ${cfg.paredeSnapIntersecaoGrade !== false ? 'checked' : ''}><span><span class="t">Interseção de grade</span><br><span class="d">Trava nos cruzamentos da grade de 1m×1m do chão — fecha cômodos ortogonais perfeitos.</span></span></label>
            <label class="radio-opt"><input type="checkbox" id="mc-parede-snap-vertice" ${cfg.paredeSnapVertice !== false ? 'checked' : ''}><span><span class="t">Vértice a vértice</span><br><span class="d">Trava na ponta de qualquer parede já desenhada perto do cursor — evita frestas ou sobreposições feias.</span></span></label>
            <label class="radio-opt"><input type="checkbox" id="mc-parede-snap-quina" ${cfg.paredeSnapQuina !== false ? 'checked' : ''}><span><span class="t">Quinas das paredes</span><br><span class="d">Trava nas quinas já fechadas entre paredes existentes.</span></span></label>
            <label class="radio-opt"><input type="checkbox" id="mc-parede-snap-meio" ${cfg.paredeSnapMeio !== false ? 'checked' : ''}><span><span class="t">Meio da parede</span><br><span class="d">Trava no ponto central de uma parede existente — cria divisões em "T" perfeitas sem precisar contar blocos.</span></span></label>
            <label class="radio-opt"><input type="checkbox" id="mc-parede-snap-angulo" ${cfg.paredeSnapAngulo !== false ? 'checked' : ''}><span><span class="t">Travamento de ângulos</span><br><span class="d">Trava a direção do segmento sendo desenhado no múltiplo mais próximo do incremento abaixo — permite diagonais precisas mesmo fora dos eixos da grade.</span></span></label>
            <label class="field" style="margin-top:6px; margin-left:26px">
              <span class="lbl">Incremento do ângulo</span>
              <select id="mc-parede-snap-angulo-inc">
                <option value="15" ${Number(cfg.paredeSnapAnguloIncremento) === 15 ? 'selected' : ''}>15°</option>
                <option value="45" ${Number(cfg.paredeSnapAnguloIncremento || 45) === 45 ? 'selected' : ''}>45°</option>
                <option value="90" ${Number(cfg.paredeSnapAnguloIncremento) === 90 ? 'selected' : ''}>90°</option>
              </select>
            </label>
          </div>

          <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border)">
            <label class="field">
              <span class="lbl">Comprimento mínimo no modo livre (cm)</span>
              <input type="number" id="mc-parede-comprimento-min" min="5" max="200" step="1" value="${Math.round((Number(cfg.paredeComprimentoMinimo) || 0.3) * 100)}">
              <span class="d">Só vale com a grade desligada (tecla modificadora segurada) — evita cliques acidentais gerando micro-paredes que corrompem a malha ou a colisão.</span>
            </label>
          </div>

          <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border)">
            <span class="lbl" style="display:block; margin-bottom:8px">Estilo de junção das quinas</span>
            <div id="mc-juncao-tipos" style="display:flex; flex-wrap:wrap; gap:8px">
              ${this._WALL_JOIN_TYPES.map((t) => `
                <label class="mc-juncao-opt" data-tipo="${t.key}" title="${Utils.escapeHtml(t.desc)}"
                  style="display:flex; flex-direction:column; align-items:center; gap:3px; padding:6px 8px; border-radius:8px; border:2px solid ${cfg.paredeJuncaoTipo === t.key || (!cfg.paredeJuncaoTipo && t.key === 'atual') ? 'var(--accent, #4a9eff)' : 'transparent'}; background:rgba(255,255,255,0.04); cursor:pointer; width:64px">
                  <input type="radio" name="mc-juncao" value="${t.key}" ${cfg.paredeJuncaoTipo === t.key || (!cfg.paredeJuncaoTipo && t.key === 'atual') ? 'checked' : ''} style="display:none">
                  ${this._juncaoIconSvg(t.key)}
                  <span style="font-size:10.5px; text-align:center; line-height:1.15">${t.label}</span>
                </label>`).join('')}
            </div>
            <span class="d" id="mc-juncao-desc" style="display:block; margin-top:6px">${Utils.escapeHtml((this._WALL_JOIN_TYPES.find((t) => t.key === (cfg.paredeJuncaoTipo || 'atual')) || this._WALL_JOIN_TYPES[0]).desc)}</span>
          </div>
        </div>
        <!-- Seção "📏 Trena 3D" (pedido do usuário, 16/09/2026 UTC): "Deve
             haver snap de posição configurável nas 'configurações 3D'" —
             ver DEFAULTS acima (campos trena3DSnap*/trena3DLabelEstilo/
             trena3DVisibilidade/trena3DEspessuraCm/trena3DCor*/trena3DPonta)
             e view3d.js (_trena3DSnap/_trena3DSnapStep/
             _trena3DRebuildLines/_trena3DUpdatePreview/
             _trena3DEndpointMesh/_trena3DAtualizarOclusao) pra como cada
             campo é lido/aplicado. Dividida em subseções (pedido verbatim
             do usuário, rodada seguinte à que criou o snap): Snap, Aparência
             da medida, Visibilidade, Espessura/cores e Pontas. -->
        <!-- [17/09/2026 UTC] NOVO — pedido verbatim (item 6, RODADA 110):
             "no cabeçalho da seção 'Trena 3D', coloque um botão de controle
             de modo de apresentação das informações: a atual, com desenhos
             grandes, textos explicativos enormes e muitos espaçamentos; e a
             versão em árvore/lista como uma estrutura de pastas, mas não
             faltando em nada [...] (sem desenhos grandes, textos
             explicativos enormes, nem grandes espaçamentos)." Envolve TODA
             a seção "📏 Trena 3D" (deste ponto até o fim dela, antes de
             "🚪 Porta / Janela") num div id="mc-trena3d-secoes" só pra
             servir de ESCOPO da troca de modo (querySelectorAll de dentro
             dele, ver _wireTrena3DModoArvore mais abaixo) — sem isso, o
             seletor genérico .mapconfig-section pegaria TAMBÉM seções não
             relacionadas (ex. "🎬 Apresentação", "🚪 Porta / Janela",
             "📦 Objeto", todo o contexto '2d'). Nenhum conteúdo/campo/id já
             existente foi removido ou duplicado — o modo árvore reorganiza
             visualmente (via CSS + _wireTrena3DModoArvore) o MESMO DOM já
             renderizado, então nenhum recurso da Trena 3D "falta" no modo
             árvore, exatamente como pedido. -->
        <div id="mc-trena3d-secoes">
        <div class="mapconfig-section">
          <h4>📏 Trena 3D<button type="button" id="mc-trena3d-sobre-btn" class="btn sm secondary" style="margin-left:10px; vertical-align:middle" title="Abre uma janela explicando em detalhes como usar a ferramenta Trena 3D (modos de ancoragem, snap, cliques).">📖 Sobre a Trena 3D</button><button type="button" id="mc-trena3d-modo-arvore" class="btn sm secondary" style="margin-left:6px; vertical-align:middle" title="Alterna entre o modo árvore/lista (atual — compacto, como uma estrutura de pastas — mesmas opções, sem nada faltando, só sem os desenhos/textos longos/espaçamentos grandes) e o modo explicativo (ilustrado, com prévias grandes e textos explicativos completos).">🌳 Modo árvore/lista</button></h4>
          <span class="d" style="display:block">Botão acima abre um documento explicando passo a passo como a ferramenta "📏 Trena 3D" funciona (dentro de "Ver em 3D") — inclusive os 2 modos de ancoragem configuráveis logo abaixo.</span>
          <!-- [RODADA 139] Toggle "Trena 3D" / "Polilinha 3D" — pedido
               verbatim: "Elimine a seção da polilinha 3D e os seus recursos
               [...] Apenas o ícone deve ser preservado [...] deve ter um
               botão 'Trena 3D' e um botão 'Polilinha 3D'. Deve ficar logo
               abaixo do título da seção, acima do botão 'restaurar
               padrões'. Ao clicar em um desativa o outro." A "Polilinha 3D"
               não é mais uma ferramenta separada — é um MODO (campo
               trena3DModo) da própria "Trena 3D": todo o resto desta
               seção, o botão do rodapé do "Ver em 3D" e o cabeçalho desta
               mesma seção trocam de nome/ícone conforme o modo escolhido
               aqui (ver função _wireTrena3DModoToggle mais abaixo). -->
          <div id="mc-trena3d-modo-toggle" class="lb-campos-row" style="margin:8px 0 10px; gap:6px">
            <button type="button" id="mc-trena3d-modo-trena" class="btn sm ${(cfg.trena3DModo || 'trena') === 'trena' ? '' : 'secondary'}" title="Trena 3D — só troca o ícone e o nome exibido (para '📏 Trena 3D'); a ferramenta e todo o seu comportamento (2 pontos por medida, ancoragem, snap etc.) continuam exatamente os mesmos.">📏 Trena 3D</button>
            <button type="button" id="mc-trena3d-modo-poli" class="btn sm ${cfg.trena3DModo === 'poli' ? '' : 'secondary'}" title="Polilinha 3D — só troca o ícone e o nome exibido (para '➰ Polilinha 3D'); a ferramenta e todo o seu comportamento continuam exatamente os mesmos da 'Trena 3D' (2 pontos por medida, ancoragem, snap etc.) — não há nenhuma diferença funcional entre os dois modos.">➰ Polilinha 3D</button>
          </div>
          <!-- [16/09/2026 UTC] NOVO (RODADA 92) — pedido verbatim: "Coloque
               logo abaixo da do título da seção 'Trena 3D' [...] um botão de
               restaurar padrões. Ao clicar [...] deve aparecer uma card
               perguntando se deseja restaurar aos valores padrão [...] Se
               confirmar [...] os valores padrão de todas as opções do
               'Trena 3D' são restituídos." Não achamos nenhum padrão de
               modal de confirmação já existente neste arquivo (buscado
               "confirm(", "showConfirm" etc.) — usado window.confirm()
               nativo mesmo, mais simples e suficiente aqui. -->
          <button type="button" id="mc-trena3d-restaurar-padroes" class="btn sm secondary" style="margin-top:6px" title="Restaura TODAS as opções da Trena 3D (Snap, Aparência da medida, Visibilidade, Espessura/cores, Pontas, Destaque de mira, Altura ao vivo, Linha da âncora, Linhas verticais, Guia de grade, Janelinha, etc.) para os valores padrão de fábrica.">↺ Restaurar padrões da Trena 3D</button>
        </div>
        <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "A janelinha que aparece
             com as opções da 'Trena 3D' deve ter um subseção com uma opção
             para ativar mostrá-la ou não." Mesmo campo
             'trena3DPainelRapidoAtivo' já configurável em "Configurações 2D
             → 📏 Trena 3D" — espelhado AQUI TAMBÉM (nas Configurações 3D,
             junto de todo o resto da Trena 3D) só por conveniência/
             descoberta — os 2 checkboxes (o de lá e o daqui) sempre refletem
             o mesmo valor. Ver view3d.js '_trena3DEnsurePainelRapido'. -->
        <div class="mapconfig-section">
          <h4>📏 Trena 3D — Janela de acesso rápido</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-painel-rapido-3d" ${cfg.trena3DPainelRapidoAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Mostrar janela de acesso rápido dentro do "Ver em 3D" (padrão: ativado)</span><br><span class="d">Uma janelinha pequena, arrastável, com ícones pra ligar/desligar rapidamente as principais opções abaixo sem precisar abrir esta folha de Configurações. Fechando ela pelo "✕", um botãozinho no canto inferior direito da tela deixa reabri-la sem precisar voltar aqui. (Mesma opção de "Configurações 2D → 📏 Trena 3D".)</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve
               haver uma opção do modo como a janelinha vai aparecer. Este
               modo atual é uma delas. E o outro mais simples é o que
               estava antes (todos os botões agrupados [...] não precisa
               imprimir texto, mas um contorno para identificar os botões
               que pertencem a uma mesma subseção já basta)." Ver
               view3d.js '_trena3DAtualizarPainelRapido'. -->
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-painel-rapido-modo" value="agrupado" ${cfg.trena3DPainelRapidoModo === 'agrupado' ? 'checked' : ''}>
            <span><span class="t">Agrupado, com rótulo de texto</span><br><span class="d">Os botões ficam divididos em grupos por subseção, cada grupo com um contorno sutil e um pequeno rótulo de texto indicando de qual subseção ele vem.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-painel-rapido-modo" value="simples" ${cfg.trena3DPainelRapidoModo !== 'agrupado' ? 'checked' : ''}>
            <span><span class="t">Simples, só contornos (padrão)</span><br><span class="d">O jeito de antes da Rodada 90: os botões continuam agrupados visualmente por um contorno sutil (sem o texto do rótulo), pra manter a janelinha o mais simples/compacta possível.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Na subseção da
               janelinha, deve ser possível selecionar os botões e a ordem em
               que eles vão ficar na janela [...] no cabeçalho do app, no
               botão 'Ver lista simples', onde diz 'Partes de informação em
               cada linha (marque e arraste ⠿ para reordenar)', ali tem um
               sistema de flipagem e reposicionamento que pode ser
               modularizado (caso ainda não seja) e reaproveitado para isso."
               Esse sistema JÁ estava modularizado desde 28/08/2026 em
               js/flip.js ('window.Flip.makeSortable', extraído de
               verlistasimples.js) — reaproveitado aqui tal e qual, MESMAS
               classes CSS ('.lb-campo-chip'/'.lb-campos-row', ver
               css/style.css) e mesmo padrão de chip (alça ⠿ + checkbox),
               preenchido dinamicamente logo após este HTML ser inserido no
               DOM (ver a função grande de listeners logo abaixo, bloco
               "Janela de acesso rápido — chips"). -->
          <!-- [17/09/2026 UTC] NOVO (RODADA 117) — pedido verbatim: "A
               única parte que deve ser um botão de aparece/não aparece [é]
               na subseção 'Janela de acesso rápido', mas apenas na parte
               desta subseção em que aparece os botões da janelinha da
               'Trena 3D'." Ver comentário grande em css/style.css
               ('#mc-trena3d-pr-chips-wrap') e _wireTrena3DModoArvore
               (wiring do botão) — único toggle "aparece/não aparece"
               restante nesta seção; todo o resto (aqui e nas demais
               subseções) sempre mostra as opções, sem precisar clicar em
               nada. -->
          <div style="margin-top:10px">
            <button type="button" id="mc-trena3d-pr-chips-toggle" class="btn sm secondary" title="Mostra ou esconde a lista de botões da janelinha (ícone de cada botão, com a ordem em que aparecem) — a única parte desta subseção que fica escondida por padrão, pra não deixar a lista de opções comprida demais.">🐵 Mostrar botões da janelinha</button>
            <div id="mc-trena3d-pr-chips-wrap" style="margin-top:8px">
              <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px">Marque quais botões aparecem na janelinha e arraste ⠿ para definir a ordem deles:</div>
              <div id="mc-trena3d-pr-chips" class="lb-campos-row"></div>
              <!-- [RODADA 130] pedido verbatim: "Reformula está parte também
                   [...] em vez de ficar com está, faça ser exatamente como
                   aparece na janelinha da 'Trena 3D', com os próprios
                   botões, desenhos e estilos [...] incluindo a parte das
                   cores também." Prévia visual FIEL (mesmo HTML/CSS gerado
                   por view3d.js _trena3DHtmlGrupoAjuste, mesma função — sem
                   duplicar estilos) do bloco Espessura/cores da janelinha,
                   também arrastável/ocultável — ver o wiring logo abaixo. -->
              <div style="font-size:11px; color:var(--text-dim); margin:12px 0 6px 0">Espessura/cor/texto da janelinha (mesmo visual e funcionamento de lá) — marque, ou clique e arraste (fora dos controles) para reordenar:</div>
              <div id="mc-trena3d-pr-grupos" style="border-top:1px solid rgba(255,255,255,0.1); padding-top:6px; font-size:11px"></div>
            </div>
          </div>
        </div>
        <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "sobre segurar o ctrl,
             deve ter uma subseção sobre como funciona esta funcionalidade
             [...] Opção de ter que segurar o ctrl [...] deixando apenas a 3ª
             dimensão [...] Nesta opção, se o ctrl não for pressionado, uma
             medida pode ser feita com apenas 2 cliques. A outra opção é
             fazer uma medida com 4 cliques [...] torna-se independente de
             ele estar pressionado ou não." Nova opção 'trena3DModoAncora'
             ('ctrl', padrão — comportamento de sempre desde a rodada que
             criou a âncora vertical; 'quatroCliques' — nova, ver
             view3d.js '_trena3DClick'/'_trena3DUpdatePreview', onde o Ctrl
             físico é ignorado e a alternância ancora/ponto é 100% automática
             por estado, sempre exigindo exatamente 4 cliques por medida). -->
        <div class="mapconfig-section">
          <!-- [16/09/2026 UTC] RENOMEADO — pedido verbatim: "A subseção
               '📏 Trena 3D — Como funciona a ancoragem (Ctrl)' deve ter o
               nome trocado para '📏 Trena 3D — Modo de ancoragem (ctrl)'."
               Só o título mudou, nenhum conteúdo interno foi alterado. -->
          <h4>📏 Trena 3D — Modo de ancoragem (ctrl)</h4>
          <span class="d" style="display:block; margin-bottom:8px">A Trena 3D mede entre 2 pontos no espaço 3D. Um clique comum mira DIRETO numa superfície (chão/parede/objeto) pra definir cada ponto. Mas às vezes você quer um ponto "no ar" (ex.: o topo de uma parede, medido a partir do chão) — pra isso existe a <b>âncora</b>: um clique de ancoragem trava X/Z num ponto real do chão/superfície, e o PRÓXIMO clique fixa a altura (Y) livremente sobre essa reta vertical, mirando pra cima/baixo. Escolha abaixo como essa ancoragem é acionada:</span>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-modo-ancora" value="ctrl" ${cfg.trena3DModoAncora !== 'quatroCliques' ? 'checked' : ''} title="Segurar Ctrl e clicar estabelece/move uma âncora (trava X/Z, libera só Y); soltar o Ctrl e clicar fixa o ponto 'no ar' sobre essa reta. Sem usar Ctrl nenhuma vez, uma medida sai com só 2 cliques normais (direto na superfície).">
            <span>${this._trena3DPreviewImgTag('modoAncora')}<span class="t">Segurando Ctrl (padrão) — medida normal com 2 cliques</span><br><span class="d">Segure Ctrl e clique pra estabelecer (ou mover) um ponto de ancoragem no chão/superfície, fixando X e Z — solte o Ctrl e clique de novo pra fixar a 3ª dimensão (a altura, Y) nesta linha "no ar", livre pra mirar pra cima/baixo. Se você NUNCA segurar Ctrl durante a medição, ela é feita do jeito simples de sempre: só 2 cliques, cada um direto numa superfície real — o Ctrl é 100% opcional, só entra em jogo se você quiser um ponto "no ar".</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-modo-ancora" value="quatroCliques" ${cfg.trena3DModoAncora === 'quatroCliques' ? 'checked' : ''} title="Toda medida sempre usa exatamente 4 cliques, alternando âncora/ponto para os dois pontos da medida — o Ctrl não tem nenhum efeito neste modo.">
            <span>${this._trena3DPreviewImgTag('modoAncora')}<span class="t">Sempre com 4 cliques (independe do Ctrl)</span><br><span class="d">Toda medida passa a exigir SEMPRE 4 cliques, nesta ordem — segurar Ctrl ou não faz nenhuma diferença neste modo: <b>1º clique</b> estabelece o ponto de ancoragem do 1º ponto (trava X/Z, libera só a altura); <b>2º clique</b> fixa o 1º ponto da medida "no ar" sobre essa reta; <b>3º clique</b> estabelece o ponto de ancoragem do 2º ponto (trava X/Z de novo, num lugar novo); <b>4º clique</b> fixa o 2º ponto da medida e conclui.</span></span>
          </label>
        </div>
        <!-- [16/09/2026 UTC] NOVO (RODADA 98) — pedido verbatim: "Deve ser
             possível colocar medidas apontando para lados (parede, porta
             janela, objetos pela lateral). Atualmente, é só a parte de cima
             dos objetos. Deve ter uma subseção para isso com uma opção para
             que o raycaster atinja os lados e dê para começar/terminar
             medidas nas laterais dos objetos." Ver engine3d.js
             'Engine3D.raycastSurfaceAmpliado' (novo) e view3d.js
             '_trena3DRaycastPrincipal' — a Trena 3D SEMPRE usou
             'raycastSurface' (só topo de objeto/tijolo + chão; parede e
             porta/janela nunca entravam, nenhuma face lateral nunca
             contava) — esta opção troca pro raycast ampliado (qualquer
             face, qualquer um desses tipos), sem mudar o comportamento de
             quem não ligar. -->
        <div class="mapconfig-section">
          <h4>📏 Trena 3D — Medição em superfícies laterais</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-superficies-laterais" ${cfg.trena3DPermitirSuperficiesLaterais === true ? 'checked' : ''} title="Quando ativa, a mira da Trena 3D passa a considerar QUALQUER face atingida (parede, porta, janela, lateral de um objeto) pra iniciar/terminar um ponto da medida — não só o topo de objetos e o chão, como no comportamento padrão.">
            <span>${this._trena3DPreviewImgTag('superficiesLaterais')}<span class="t">Permitir medir em paredes/laterais de objetos (padrão: desativado)</span><br><span class="d">Por padrão, a Trena 3D só consegue iniciar/terminar um ponto de medida mirando o CHÃO ou o TOPO de um objeto/tijolo (uma face virada pra cima) — paredes, portas, janelas e as laterais de objetos nunca contavam, mesmo mirando bem em cima delas. Ative esta opção para medir também encostando em qualquer uma dessas superfícies pelo lado (ex.: a largura de uma parede, a altura de uma porta pela lateral, a largura de um armário).</span></span>
          </label>
        </div>
        <!-- [16/09/2026 UTC] NOVO (RODADA 101) — pedido verbatim: "Após
             estabelecer o 1º ponto da medida deve ser possível 'continuar
             naquele nível' (de y) de modo que é como se tivesse feito já o
             2º ponto âncora na mesma altura de y, porém não fixo e estando
             livre para movimentar o Z e X. Um gradeado infinito de 1mx1m
             (em fase com o ladrilho do mundo) deve ser desenhado [...]" Ver
             view3d.js '_trena3DUpdatePreview' ('modoContinuarNivel') e
             '_trena3DAtualizarGradeNivelInfinita'. -->
        <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Os mesmos ícones que
             estão sendo usados na janelinha deve ser usados nas opções da
             seção 'Trena 3D' (nas 'configurações 3D')." A partir daqui, toda
             opção da seção "📏 Trena 3D" que também existe como botão na
             janelinha de acesso rápido (ver view3d.js
             '_trena3DOpcoesPainelRapido') ganha o MESMO ícone (emoji ou, no
             único caso com ícone SVG — "Suprimir destaque durante a
             ancoragem" — o mesmo SVG em miniatura) como prefixo do rótulo,
             pra ficar visualmente óbvio que é a mesma opção nos 2 lugares. -->
        <!-- [17/09/2026 UTC] MUDANÇA — pedido verbatim: "Não somente o SVG
             que aparece na janela, mas também o contorno como se fosse
             visualmente o próprio botão, para as opções que tem botão na
             janelinha." As 12 opções acima ganharam SÓ o emoji/SVG cru como
             prefixo (RODADA 109) — agora cada um desses 12 ícones fica
             dentro de um pequeno span com o MESMO "contorno de botão"
             (borda laranja + fundo laranja translúcido + cantos
             arredondados) usado de verdade nos botões da janelinha (ver
             _trena3DEstiloBotaoPainelRapido em view3d.js — aqui como um
             estilo inline fixo, já que esta é uma prévia ilustrativa
             estática, não um botão clicável de verdade) — fica visualmente
             claro, de relance, que aquilo ali É um botão da janelinha, não
             só um emoji qualquer decorando o texto. -->
        <div class="mapconfig-section">
          <h4>📏 Trena 3D — Continuar no nível do 1º ponto</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-continuar-nivel" ${cfg.trena3DContinuarNoNivel === true ? 'checked' : ''} title="Quando ativa, depois de fixar o 1º ponto de uma medida, a mira passa a ficar 'presa' na mesma altura (Y) desse ponto — livre em X/Z — em vez de precisar mirar outra superfície de verdade pro 2º ponto.">
            <span>${this._trena3DPreviewImgTag('continuarNivel')}<span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone.">⇔▦</span> Continuar medindo no mesmo nível do 1º ponto (padrão: desativado)</span><br><span class="d">Depois de fixar o 1º ponto de uma medida, ative esta opção pra "continuar naquele nível": é como se um 2º ponto âncora já tivesse sido marcado na MESMA altura do 1º, mas sem travar X/Z — a mira fica livre nesse plano horizontal, só a altura (Y) fica presa. Um gradeado infinito de células 1×1m (na mesma fase do ladrilho do mundo) aparece nesse plano pra servir de referência visual, no lugar do gradeado que normalmente apareceria no chão. Útil pra medir distâncias horizontais numa altura específica (ex. o comprimento de uma parede a 1,5m do chão) sem precisar mirar uma superfície de verdade naquela altura. Não tem efeito nenhum se não houver um 1º ponto fixado ainda, ou se a âncora (Ctrl) já estiver sendo usada — a âncora sempre tem prioridade.</span></span>
          </label>
        </div>
        <div class="mapconfig-section">
          <h4>📏 Trena 3D — Snap</h4>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "A subseção de snap
               deve ser como no cabeçalho do mapa 2D (na janela
               'Ferramentas'->'Parede' [...] no cabeçalho é ativado o 'Snap
               de parede' e do lado direito o valor)" — mesmo par
               toggle+campo-de-valor lado a lado do cabeçalho de "🧱 Parede"
               (ver mapview.js, botão "🧲 Snap de parede" + campo numérico ao
               lado), só que aqui dentro do painel de Configurações (que usa
               label.field/.radio-opt, não os .icon-btn/
               .map2d-toolctx-numfield daquele cabeçalho flutuante — o
               PAR toggle+valor lado a lado é o que foi replicado, não as
               classes CSS exatas, que pertencem a um contexto diferente). -->
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
            <label class="radio-opt" style="flex:0 0 auto; margin:0">
              <input type="checkbox" id="mc-trena3d-snap-on" ${cfg.trena3DSnapAtivo !== false ? 'checked' : ''}>
              <span>${this._trena3DPreviewImgTag('snap')}<span class="t">🧲 Snap de posição</span></span>
            </label>
            <label class="field" style="flex:0 0 auto; margin:0; min-width:120px">
              <span class="lbl">Valor (m)</span>
              <div id="mc-trena3d-snap" data-valor="${Utils.clamp(Number(cfg.trena3DSnapMetros) || 0.1, 0.01, 2)}"></div>
            </label>
          </div>
          <span class="d" style="display:block; margin-top:6px">Com o snap LIGADO, cada ponta clicada com a ferramenta "📏 Trena 3D" (dentro de "Ver em 3D") arredonda X/Y/Z pro múltiplo mais próximo do valor ao lado — evita medidas com casas decimais "quebradas" por causa de mira imprecisa. Desligado, usa a posição exata da mira/superfície, sem arredondar. Dica: segurando <b>Shift</b> durante a medição, o snap fica desligado temporariamente, mesmo com esta opção marcada — solte o Shift pra voltar a arredondar normalmente.</span>
        </div>
        <div class="mapconfig-section">
          <h4>📏 Trena 3D — Aparência da medida</h4>
          <!-- [16/09/2026 UTC] REESTRUTURADO — pedido verbatim (resumo): a
               opção padrão antiga ('value="sobreLinha"', projeta o meio 3D
               exato, sem deslocamento — a caixa do rótulo já fica centrada
               na projeção por causa do 'transform:translate(-50%,-50%)' no
               CSS do próprio rótulo, ver '_trena3DRebuildLines'/
               '_trena3DUpdateLabels') teve só o TEXTO renomeado pra
               "Flutuante" (o COMPORTAMENTO continua o mesmo de sempre — o
               VALOR do radio ('sobreLinha') também não mudou, só o rótulo
               visível). A opção antiga "Flutuante (jeito antigo)"
               ('value="flutuante"', deslocava +0,18m no eixo Y ANTES de
               projetar) foi REMOVIDA por completo (radio + tratamento em
               '_trena3DRebuildLines'). Em seu lugar entra uma opção NOVA,
               'value="sobreLinhaMeio"': "o texto ocupa uma caixa [...] o
               ponto médio desta caixa deve ser comum ao ponto médio da linha
               3D formada pela medida [...] quando já estiver projetada na
               tela" — ou seja, projeta os 2 EXTREMOS da medida
               separadamente pra tela e centraliza o rótulo na MÉDIA
               2D/tela dos 2 pontos projetados (não a projeção do meio 3D —
               as duas contas diferem sob perspectiva, já que projeção não é
               linear). Ver '_trena3DUpdateLabels' (branch por
               'dataset.modoLabel'). -->
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-label" value="sobreLinhaMeio" ${cfg.trena3DLabelEstilo === 'sobreLinhaMeio' ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('labelSobreLinhaMeio')}<span class="t">Em cima da linha e no meio</span><br><span class="d">O centro da caixa do texto coincide com o ponto médio, NA TELA (já projetado), do traço da medida — calculado a partir dos 2 extremos já projetados, não do meio em 3D (que pode ficar visualmente deslocado da linha na tela, dependendo do ângulo da câmera).</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-label" value="sobreLinha" ${cfg.trena3DLabelEstilo !== 'sobreLinhaMeio' ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('labelSobreLinha')}<span class="t">Flutuante</span><br><span class="d">O texto fica centrado no ponto médio da linha calculado em 3D, antes de projetar pra tela (padrão de sempre desta opção).</span></span>
          </label>
          <!-- [17/09/2026 UTC] NOVO (RODADA 119) — pedido verbatim: controlar
               a posição da caixa de texto numa linha vertical que passa pelo
               ponto médio da reta 3D da medida (0 = no meio, +/- acima/
               abaixo). Ver '_trena3DCampoDeslocVerticalLabel'/
               '_wireTrena3DDeslocVerticalLabel' (mapconfig.js) e
               '_trena3DDeslocarPontoY' (view3d.js). -->
          ${this._trena3DCampoDeslocVerticalLabel('mc-trena3d-label', cfg.trena3DLabelDeslocVerticalM)}
          <!-- [RODADA 131] MOVIDO — pedido verbatim: o conteúdo da (antiga)
               subseção "📏 Trena 3D — Espessura e cores" virou um subtítulo
               coerente aqui dentro de "Aparência da medida" (a subseção
               separada foi eliminada). Nenhum id/campo/comportamento
               mudou — só o HTML ao redor. -->
          <h5 class="mc-subtitulo">Espessura e cores</h5>
          <!-- [RODADA 129] REMOVIDOS os campos "Cor da âncora/linha vertical
               (Ctrl)"/"Cor da mira normal (sem âncora)" que ficavam aqui —
               ver histórico grande, preservado em view3d.js '_trena3DCfg()'. -->
          <div style="margin-bottom:8px">${this._trena3DPreviewImgTag('espessuraCores')}<span class="d" style="vertical-align:middle">Prévia com a cor configurável abaixo (linha finalizada).</span></div>
          <label class="field">
            <span class="lbl">Espessura da linha (cm)</span>
            <div id="mc-trena3d-espessura" data-valor="${Utils.clamp(Number(cfg.trena3DEspessuraCm) || 1, 0.2, 15)}"></div>
            <span class="d">Espessura (diâmetro real, em centímetros) do traço entre as 2 pontas de uma medida já finalizada.</span>
          </label>
          <label class="field" style="margin-top:8px"><span class="lbl">Cor da medida finalizada</span><input type="color" id="mc-trena3d-cor-linha" value="${cfg.trena3DCorLinha || '#ffd166'}"></label>
          <span class="d" style="display:block; margin-top:6px">Cor usada na linha/pontas de uma medida já pronta.</span>
        </div>
        <div class="mapconfig-section">
          <h4>📏 Trena 3D — Visibilidade</h4>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-vis" value="seVisivel" ${cfg.trena3DVisibilidade !== 'sempre' ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('visSeVisivel')}<span class="t">Só se estiver visível (padrão)</span><br><span class="d">Se algo (uma parede, um objeto) estiver na frente da medida, bloqueando a visão dela a partir da câmera, ela some — igual a um objeto de verdade sendo tampado por outro.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-vis" value="sempre" ${cfg.trena3DVisibilidade === 'sempre' ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('visSempre')}<span class="t">Sempre aparecer</span><br><span class="d">A medida é sempre desenhada por cima de tudo, não importa a distância ou se há algo na frente dela (jeito antigo, antes desta opção existir).</span></span>
          </label>
          <!-- [17/09/2026 UTC] NOVO (RODADA 121) — pedido verbatim: "Deve
               haver uma opção de imprimir as caixas de texto só as que
               estiverem próximas do personagem. Um raio deve poder ser
               estabelecido para isso." Ver 'trena3DLabelRaioAtivo'/
               'trena3DLabelRaioM' (DEFAULTS) e a checagem de distância em
               'view3d.js' ('_trena3DUpdateLabels'). -->
          <h5 class="mc-subtitulo">Só perto do personagem</h5>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-label-raio-ativo" ${cfg.trena3DLabelRaioAtivo ? 'checked' : ''}>
            <span><span class="t">Só mostrar a caixa de texto quando estiver dentro de um raio do personagem</span><br><span class="d">Além do raio configurado abaixo, a caixa de texto da medida some (a linha/pontas 3D continuam aparecendo normalmente, só a caixa de texto é afetada).</span></span>
          </label>
          <label class="field" style="max-width:220px">
            <span class="lbl">Raio (m)</span>
            <div id="mc-trena3d-label-raio" data-valor="${Utils.clamp(Number(cfg.trena3DLabelRaioM) || 15, 0.5, 500)}"></div>
          </label>
          <!-- [17/09/2026 UTC] NOVO (RODADA 121) — pedido verbatim: "Coloque
               como mais uma opção a reorganização automática das caixas de
               texto para que elas não se sobreponham na tela. Atualmente
               isso é sempre feito, sem ser opcional. Por padrão, deve ficar
               desligado." Ver 'trena3DLabelReorganizarSobreposicao'
               (DEFAULTS) e '_trena3DAfastarRotulosSobrepostos' (view3d.js,
               agora só chamada quando este campo estiver ligado). -->
          <h5 class="mc-subtitulo">Reorganização automática</h5>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-label-reorganizar" ${cfg.trena3DLabelReorganizarSobreposicao ? 'checked' : ''}>
            <span><span class="t">Afastar automaticamente caixas de texto que estejam se sobrepondo</span><br><span class="d">Quando várias medidas ficam próximas na tela, empurra as caixas de texto pra não ficarem uma em cima da outra. Desligado por padrão (jeito antigo desta opção não existir: cada caixa fica exatamente na sua posição ideal, mesmo que se sobreponha a outra).</span></span>
          </label>
          <!-- [17/09/2026 UTC] NOVO (RODADA 125) — pedido verbatim: "deve ter
               uma opção para imprimir a esfera vermelha, mas com o nome de
               'mostrar ponto médio da medida'. deve dar para escolher a cor
               da esfera. Por padrão, deve ser vermelha." Ver
               'trena3DMostrarPontoMedio'/'trena3DCorPontoMedio' (DEFAULTS) e
               '_trena3DRebuildLines' (view3d.js, bloco 'SphereGeometry'). -->
          <h5 class="mc-subtitulo">Ponto médio da medida</h5>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
            <label class="radio-opt" style="flex:0 0 auto; margin:0">
              <input type="checkbox" id="mc-trena3d-ponto-medio-ativo" ${cfg.trena3DMostrarPontoMedio !== false ? 'checked' : ''}>
              <span><span class="t">Mostrar ponto médio da medida</span></span>
            </label>
            <label class="field" style="flex:0 0 auto; margin:0; min-width:70px">
              <span class="lbl">Cor</span>
              <input type="color" id="mc-trena3d-ponto-medio-cor" value="${cfg.trena3DCorPontoMedio || '#ff2d2d'}">
            </label>
          </div>
          <span class="d" style="display:block; margin-top:6px">Desenha uma pequena esfera no ponto médio (em 3D) de cada medida da "📏 Trena 3D" — desligue pra não desenhar essa esfera.</span>
          <!-- [17/09/2026 UTC] NOVO (RODADA 127) — pedido verbatim: "Deve ser
               possível controlar se a caixa de texto com a medida vai
               aparecer ou não em [...] '📏 Trena 3D — Visibilidade' (para a
               medida) [...]. Por padrão todas ativadas." Ver
               'trena3DLabelVisivel' (DEFAULTS) e '_trena3DCfg'/
               '_trena3DRebuildLines' (view3d.js). -->
          <h5 class="mc-subtitulo">Caixa de texto</h5>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-label-visivel" ${cfg.trena3DLabelVisivel !== false ? 'checked' : ''}>
            <span><span class="t">Mostrar caixa de texto com a medida</span><br><span class="d">Desligue para esconder a caixa de texto (o número da medida) — a linha, as pontas e a esfera do ponto médio continuam aparecendo normalmente.</span></span>
          </label>
        </div>
        <div class="mapconfig-section">
          <h4>📏 Trena 3D — Pontas</h4>
          <!-- [17/09/2026 UTC] NOVO (RODADA 114) — pedido verbatim: "deve
               haver uma opção 'sem pontas' (deve ser a primeira opção)." -->
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-ponta" value="nenhuma" ${cfg.trena3DPonta === 'nenhuma' ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('pontaNenhuma')}<span class="t">Sem pontas</span><br><span class="d">Só a linha entre os 2 pontos da medida, sem nenhum marcador extra nas extremidades.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-ponta" value="esfera" ${cfg.trena3DPonta !== 'nenhuma' && cfg.trena3DPonta !== 'seta' && cfg.trena3DPonta !== 'setaDoisTracos' && cfg.trena3DPonta !== 'traco' ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('pontaEsfera')}<span class="t">Esfera (padrão)</span><br><span class="d">Uma bolinha em cada extremidade da medida — o jeito de sempre.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve ser
               possível definir o tamanho da esfera. E se a medida termina
               na ponta mais próxima da esfera, no centro da esfera ou na
               ponta mais afastada." -->
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:6px 0 4px 26px">
            <label class="field" style="flex:0 0 auto; margin:0; min-width:120px">
              <span class="lbl">Tamanho da esfera (m)</span>
              <div id="mc-trena3d-esfera-tamanho" data-valor="${Utils.clamp(Number(cfg.trena3DEsferaTamanho) || 0.02, 0.01, 1)}"></div>
            </label>
          </div>
          <!-- [RODADA 135] MUDANÇA -- pedido verbatim: "Coloque as medidas em
               metros e coloque limites para que não vá além dos limites."
               Deixou de ser um multiplicador ("×") e virou um valor absoluto
               em metros, limitado a 0,01–1 (ver DEFAULTS/montarBotaoTriplo
               abaixo). -->
          <span class="d" style="display:block; margin:0 0 8px 26px">Raio da esfera em metros (de 0,01 a 1) — valor absoluto, não depende mais da espessura da linha.</span>
          <div style="margin:0 0 4px 26px">
            <label class="radio-opt">
              <input type="radio" name="mc-trena3d-esfera-termino" value="proxima" ${cfg.trena3DEsferaTerminoLinha === 'proxima' ? 'checked' : ''}>
              <span><span class="t">Termina na ponta mais próxima da esfera</span><br><span class="d">A linha para pouco antes de tocar a esfera.</span></span>
            </label>
            <label class="radio-opt">
              <input type="radio" name="mc-trena3d-esfera-termino" value="centro" ${cfg.trena3DEsferaTerminoLinha !== 'proxima' && cfg.trena3DEsferaTerminoLinha !== 'distante' ? 'checked' : ''}>
              <span><span class="t">Termina no centro da esfera (padrão)</span><br><span class="d">A linha passa pelo centro da esfera — o jeito de sempre.</span></span>
            </label>
            <label class="radio-opt">
              <input type="radio" name="mc-trena3d-esfera-termino" value="distante" ${cfg.trena3DEsferaTerminoLinha === 'distante' ? 'checked' : ''}>
              <span><span class="t">Termina na ponta mais afastada da esfera</span><br><span class="d">A linha atravessa a esfera inteira, passando por dentro dela.</span></span>
            </label>
          </div>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-ponta" value="seta" ${cfg.trena3DPonta === 'seta' ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('pontaSeta')}<span class="t">Seta</span><br><span class="d">Uma pequena seta em cada extremidade, apontando ao longo da linha da medida.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve ser
               possível definir o tamanho da base do cone da seta e a
               altura do cone da seta individualmente." -->
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:6px 0 10px 26px">
            <label class="field" style="flex:0 0 auto; margin:0; min-width:120px">
              <span class="lbl">Raio da base do cone (×)</span>
              <div id="mc-trena3d-seta-cone-raio" data-valor="${Utils.clamp(Number(cfg.trena3DSetaConeRaio) || 3.2, 0.5, 15)}"></div>
            </label>
            <label class="field" style="flex:0 0 auto; margin:0; min-width:120px">
              <span class="lbl">Altura do cone (×)</span>
              <div id="mc-trena3d-seta-cone-altura" data-valor="${Utils.clamp(Number(cfg.trena3DSetaConeAltura) || 2.2, 0.5, 15)}"></div>
            </label>
          </div>
          <!-- [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve ser
               possível definir outro tipo de seta (a seta com dois
               traços) [...] controlar a distância entre as pontas que
               ficam soltas [...] E definir o comprimento gerado pela
               distância entre o ponto de encontro das duas linhas e a
               projeção delas na linha da medida." -->
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-ponta" value="setaDoisTracos" ${cfg.trena3DPonta === 'setaDoisTracos' ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('pontaSetaDoisTracos')}<span class="t">Seta com dois traços</span><br><span class="d">Uma seta "aberta" (sem preenchimento), tipo "&gt;", feita de 2 traços que se encontram na ponta da medida — estilo desenho técnico.</span></span>
          </label>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:6px 0 4px 26px">
            <label class="field" style="flex:0 0 auto; margin:0; min-width:130px">
              <span class="lbl">Abertura (cm)</span>
              <div id="mc-trena3d-seta2-abertura" data-valor="${Utils.clamp(Number(cfg.trena3DSetaDoisTracosAbertura) || 6, 0.5, 50)}"></div>
            </label>
            <label class="field" style="flex:0 0 auto; margin:0; min-width:130px">
              <span class="lbl">Comprimento (cm)</span>
              <div id="mc-trena3d-seta2-comprimento" data-valor="${Utils.clamp(Number(cfg.trena3DSetaDoisTracosComprimento) || 10, 0.5, 100)}"></div>
            </label>
          </div>
          <span class="d" style="display:block; margin:0 0 8px 26px">"Abertura" é a distância entre as 2 pontas soltas da seta; "Comprimento" é a distância entre o vértice (onde as 2 linhas se encontram, na ponta da medida) e a projeção das pontas soltas sobre a linha da medida.</span>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-ponta" value="traco" ${cfg.trena3DPonta === 'traco' ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('pontaTraco')}<span class="t">Traço perpendicular</span><br><span class="d">Um tracinho cruzando a linha em cada extremidade, perpendicular à medida — estilo "régua de desenho técnico".</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve ser
               possível definir o comprimento do traço perpendicular [...]
               e se ele fica centralizado, parte da ponta [...] para cima
               ou [...] para baixo. Além de como ele será renderizado [...]
               'do jeito atual' ou [...] paralelos as linhas [...]
               perpendiculares ao chão [...] Por padrão, fica [este
               último] modo." -->
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:6px 0 4px 26px">
            <label class="field" style="flex:0 0 auto; margin:0; min-width:130px">
              <span class="lbl">Comprimento (×)</span>
              <!-- [17/09/2026 UTC] AMPLIADO (RODADA 120) — pedido verbatim:
                   "ao variar o 'Comprimento', após o 20 não há mais
                   alteração." O limite (max) era 20 — ampliado pra 60
                   (mesma ordem de grandeza dos outros multiplicadores desta
                   seção, ex. "Raio da base"/"Altura" do cone da seta vão até
                   15) — ver também o max espelhado no wiring
                   ('_montarBotaoTriplo', logo abaixo neste arquivo). -->
              <div id="mc-trena3d-traco-comprimento" data-valor="${Utils.clamp(Number(cfg.trena3DTracoPerpComprimento) || 7, 1, 60)}"></div>
            </label>
          </div>
          <div style="margin:0 0 4px 26px">
            <label class="radio-opt">
              <input type="radio" name="mc-trena3d-traco-alinhamento" value="centralizado" ${cfg.trena3DTracoPerpAlinhamento !== 'paraCima' && cfg.trena3DTracoPerpAlinhamento !== 'paraBaixo' ? 'checked' : ''}>
              <span><span class="t">Centralizado na ponta (padrão)</span><br><span class="d">O traço fica centrado exatamente na ponta da medida — metade de cada lado.</span></span>
            </label>
            <label class="radio-opt">
              <input type="radio" name="mc-trena3d-traco-alinhamento" value="paraCima" ${cfg.trena3DTracoPerpAlinhamento === 'paraCima' ? 'checked' : ''}>
              <span><span class="t">Parte da ponta para cima</span><br><span class="d">O traço inteiro fica de um lado da ponta, no sentido "para cima".</span></span>
            </label>
            <label class="radio-opt">
              <input type="radio" name="mc-trena3d-traco-alinhamento" value="paraBaixo" ${cfg.trena3DTracoPerpAlinhamento === 'paraBaixo' ? 'checked' : ''}>
              <span><span class="t">Parte da ponta para baixo</span><br><span class="d">O traço inteiro fica do lado oposto da ponta, no sentido "para baixo".</span></span>
            </label>
          </div>
          <!-- [RODADA 135] NOVO -- pedido verbatim: "logo após a subopção
               'Parte da ponta para baixo', coloque um traço horizontal para
               separar das duas opções que têm em baixo." Separa
               visualmente o grupo "Comprimento/Alinhamento" (acima) do
               grupo "Modo de exibição" (abaixo, as 2 opções "vista de
               cima"/"Paralelo à linha vertical"). -->
          <hr style="border:none; border-top:1px solid rgba(255,255,255,0.12); margin:8px 26px 8px 26px">
          <!-- [16/09/2026 UTC] NOVO (RODADA 92) — pedido verbatim: "as
               subopções 'do jeito atual' e 'Paralelo à linha vertical
               perpendicular ao chão' devem ficar abaixo de um subtítulo
               atrelado a opção 'Traço perpendicular' [...] para não ficar
               misturado com as outras opções [comprimento/alinhamento]." -->
          <span class="d" style="display:block; margin:6px 0 4px 26px; font-weight:600">Modo de exibição do Traço perpendicular à medida feita</span>
          <div style="margin:0 0 4px 26px">
            <label class="radio-opt">
              <input type="radio" name="mc-trena3d-traco-modo-render" value="atual" ${cfg.trena3DTracoPerpModoRender === 'atual' ? 'checked' : ''}>
              <span><span class="t">vista de cima (como é visto na Planta baixa)</span><br><span class="d">O traço fica perpendicular à linha da medida, no plano da tela.</span></span>
            </label>
            <label class="radio-opt">
              <input type="radio" name="mc-trena3d-traco-modo-render" value="paraleloVertical" ${cfg.trena3DTracoPerpModoRender !== 'atual' ? 'checked' : ''}>
              <span><span class="t">Paralelo à linha vertical perpendicular ao chão (padrão)</span><br><span class="d">O traço fica sempre paralelo à mesma linha laranja tracejada perpendicular ao chão usada durante a ancoragem — em vez de perpendicular à linha da medida.</span></span>
            </label>
          </div>
        </div>
        <div class="mapconfig-section">
          <h4>📏 Trena 3D — Destaque de mira durante a âncora</h4>
          <!-- [16/09/2026 UTC] MUDANÇA (RODADA 92) — pedido verbatim: "o que
               faz a opção 'Suprimir destaque de hover durante a
               ancoragem'?" (o nome usado na janelinha de acesso rápido,
               ver view3d.js '_trena3DOpcoesPainelRapido'). Adicionado
               'title' no checkbox (tooltip ao passar o mouse) com a mesma
               explicação do '.d' abaixo, já que o usuário achou o nome
               confuso sozinho. -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-suprimir-destaque" ${cfg.trena3DSuprimirDestaqueDuranteAncora !== false ? 'checked' : ''} title="Também chamada de 'Suprimir destaque de hover durante a ancoragem' na janelinha de acesso rápido. Enquanto você ancora um ponto (Ctrl segurado, ou âncora já marcada), a mira está escolhendo uma ALTURA na reta vertical, não um objeto — esta opção esconde o contorno de destaque de hover nesse momento, pra não confundir os dois.">
            <span><span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone."><svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block"><polygon points="12,3 20,7 12,11 4,7" fill="#6b7280"/><polygon points="4,7 12,11 12,19 4,15" fill="#454b58"/><polygon points="20,7 12,11 12,19 20,15" fill="#565c6a"/><polyline points="12,3 20,7 20,15 12,19 4,15 4,7 12,3" fill="none" stroke="rgba(255,242,117,0.85)" stroke-width="1.3" stroke-dasharray="2.4,1.8"/></svg></span> Desativar o destaque do raycaster enquanto a linha perpendicular estiver ativa (padrão: ativado)</span><br><span class="d">Enquanto a referência vertical da âncora está sendo usada (Ctrl segurado, ou já marcada com um clique), o contorno de destaque normal (o que aparece sob a mira ao mirar chão/parede/objeto) fica desligado — nesse momento a mira está escolhendo uma ALTURA na reta, não selecionando algo de verdade. Na janelinha de acesso rápido, esta mesma opção aparece como "Suprimir destaque de hover durante a ancoragem".</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Coloque um preview na
               subseção '📏 Trena 3D — Destaque de mira durante a âncora',
               indicando visualmente o que acontece." Preview 2D ilustrativo,
               atualizado em '_trena3DDesenharPreviewDestaqueMira' abaixo,
               reagindo ao checkbox acima. -->
          <div style="margin:8px 0 4px; display:flex; justify-content:center">
            <canvas id="mc-trena3d-destaque-preview" width="180" height="120" style="background:#1a1c22; border:1px solid var(--border); border-radius:6px; max-width:100%"></canvas>
          </div>
          <!-- [RODADA 131] NOVO — pedido verbatim: "deve ser possível definir a
               cor da mira que aparece quando o botão 'Trena 3D' [...] está
               ativo. E deve ser possível também definir o seu tamanho. As
               alterações devem ser imediatas no cenário 3D. E o que está
               configurado para esta mira, atualmente, deve ser o padrão." A
               "mira" aqui é a bolinha indicadora ("aqui vai cair o clique",
               '_trena3DHoverMesh' em view3d.js) — cor/tamanho aplicados no
               estado NORMAL dela (mirando uma superfície, sem âncora); o
               estado ancorado/Ctrl continua laranja fixo ('#ff9f4d',
               indicador de estado, não faz parte deste pedido). Padrões
               ('#5ec8ff'/tamanho '1') preservam EXATAMENTE a cor/tamanho de
               sempre. Ver view3d.js '_trena3DCfg' ('miraCorInt'/
               'miraTamanho') e o bloco '_trena3DHoverMesh' (aplicado TODO
               quadro — cor via 'material.color.setHex', tamanho via
               'scale.setScalar', então reflete o color-picker/slider ao
               vivo, sem precisar recriar a esfera). -->
          <h5 class="mc-subtitulo">Cor e tamanho da mira</h5>
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:8px">
            <label class="field" style="flex:0 0 auto; margin:0; min-width:70px">
              <span class="lbl">Cor da mira</span>
              <input type="color" id="mc-trena3d-mira-cor" value="${cfg.trena3DMiraCor || '#5ec8ff'}">
            </label>
            <label class="field" style="flex:0 0 auto; margin:0; min-width:110px">
              <span class="lbl">Tamanho (×)</span>
              <div id="mc-trena3d-mira-tamanho" data-valor="${Utils.clamp(Number(cfg.trena3DMiraTamanho) || 1, 0.2, 5)}"></div>
            </label>
          </div>
          <span class="d" style="display:block; margin-top:6px">Cor/tamanho da bolinha indicadora ("aqui vai cair o clique") sempre que a "📏 Trena 3D" está ativa mirando uma superfície comum (sem âncora/Ctrl) — o estado ancorado continua com a cor laranja de destaque de sempre.</span>
        </div>
        <!-- [16/09/2026 UTC] NOVO (RODADA 94) — pedido verbatim: "Coloque
             outra subseção para imprimir além do texto indicando o
             comprimento da medida que está sendo feita, desenhar uma medida
             guia rente ao chão até a posição do cursor do mouse." Ver
             view3d.js '_trena3DUpdatePreview' (bloco de
             '_trena3DGuiaChaoLine') — desenha uma linha tracejada VERDE
             (distinta do laranja das linhas de âncora/altura e do azul da
             guia 3D direta entre os 2 pontos) no plano do chão (y=0), do 1º
             ponto até a projeção XZ da mira atual, com o texto da distância
             HORIZONTAL entre eles. -->
        <div class="mapconfig-section">
          <h4>📏 Trena 3D — Guia rente ao chão</h4>
          <!-- [16/09/2026 UTC] RENOMEADO — pedido verbatim: "a opção 'Mostrar
               guia rente ao chão até o cursor (padrão: desativado)' deve
               trocar de nome. O novo nome é 'Mostrar guia enquanto faz a
               medida'." Só o texto do rótulo mudou — id/campo/comportamento
               intocados. -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-guia-chao-ao-vivo" ${cfg.trena3DMostrarGuiaChaoAoVivo === true ? 'checked' : ''} title="Desenha uma linha tracejada no plano do chão (ignorando a altura), do 1º ponto da medida até a projeção da mira atual, com o texto da distância horizontal entre eles.">
            <span>${this._trena3DPreviewImgTag('guiaChao')}<span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone.">⬌</span> Mostrar guia enquanto faz a medida (padrão: desativado)</span><br><span class="d">Enquanto o 1º ponto da medida já estiver marcado, desenha uma linha tracejada no plano do chão (y=0) ligando a projeção horizontal do 1º ponto até a projeção horizontal da mira atual — mostra a distância "andada no chão" entre os 2 pontos, mesmo que eles estejam em alturas diferentes. Complementa a linha guia 3D direta (azul) e as linhas verticais de altura (laranja) já existentes, sem substituí-las.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Deve haver outra
               opção: 'Mostrar guia depois que a medida foi finalizada'. Esta
               opção afeta todas as guias, pois todas elas (que já estão
               finalizadas) encaixam-se nesse critério." Generaliza a guia
               (só ao vivo, opção acima) pra cada medida JÁ finalizada no
               mapa — mesmo padrão de "Mostrar também nas medidas já
               finalizadas" das outras subseções de guia. Ver view3d.js
               '_trena3DRebuildLines'. -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-guia-chao-finalizada" ${cfg.trena3DGuiaChaoFinalizada === true ? 'checked' : ''} title="Desenha, para CADA medida já finalizada no mapa, a mesma linha tracejada no plano do chão entre a projeção horizontal dos 2 pontos, com a distância 'andada no chão'.">
            <span>${this._trena3DPreviewImgTag('guiaChao')}<span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone.">🏁⬌</span> Mostrar guia depois que a medida foi finalizada (padrão: desativado)</span><br><span class="d">Além de aparecer ao vivo enquanto mede (opção acima), desenha a mesma guia (linha tracejada + distância horizontal) para CADA medida já feita no mapa, entre a projeção no chão do 1º e do 2º ponto — atualizada na hora ao ligar/desligar, sem precisar fazer uma medida nova.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO (RODADA 98) — pedido verbatim: "Cada
               parte ali deve ter a sua cor característica." Antes, a linha
               E o texto/rótulo usavam a MESMA cor fixa (verde, #7dff6e) —
               separado em 2 campos de cor independentes, cada "parte" desta
               subseção com a própria cor configurável (mesmo padrão do
               color-picker de trena3DGradeSnapCor, Rodada 91). Padrões
               escolhidos: verde mais saturado pra linha (cor original,
               preserva a aparência de quem já usava) e um verde-limão mais
               claro pro texto/rótulo — as 2 continuam claramente "da mesma
               família" (verde), mas distinguíveis entre si, e nenhuma das
               2 conflita com o laranja (linhas de âncora/altura) ou o azul
               (guia 3D direta) já usados nas outras partes da Trena 3D. -->
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:8px">
            <label class="field" style="flex:0 0 auto; margin:0; min-width:70px">
              <span class="lbl">Cor da linha</span>
              <input type="color" id="mc-trena3d-guia-chao-cor-linha" value="${cfg.trena3DGuiaChaoCorLinha || '#7dff6e'}">
            </label>
            <label class="field" style="flex:0 0 auto; margin:0; min-width:70px">
              <span class="lbl">Cor do texto</span>
              <input type="color" id="mc-trena3d-guia-chao-cor-texto" value="${cfg.trena3DGuiaChaoCorTexto || '#d9ff8a'}">
            </label>
          </div>
          <!-- [RODADA 131] NOVO — pedido verbatim: "Esta linha, na verdade, é a
               distância entre as duas linhas âncoras [...] deve ser possível
               definir se ela fica: 'rente ao chão'; mais próxima do chão
               [...] com uma extremidade comum a extremidade da medida; mais
               afastada do chão [...] com uma extremidade comum a extremidade
               da medida; ou 'livre', podendo definir qualquer valor (0 é o
               chão) [...] Por padrão, é 'rente ao chão'." Ver
               view3d.js '_trena3DGuiaChaoAlturaY' (aplicado nos 2 blocos que
               desenham esta guia — ao vivo e finalizada). -->
          <span class="d" style="display:block; margin-top:10px; font-weight:600">Altura da guia (entre as 2 linhas âncoras)</span>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-guia-chao-modo" value="renteChao" ${cfg.trena3DGuiaChaoModo !== 'proximaChao' && cfg.trena3DGuiaChaoModo !== 'afastadaChao' && cfg.trena3DGuiaChaoModo !== 'livre' ? 'checked' : ''}>
            <span><span class="t">Rente ao chão (padrão)</span><br><span class="d">A guia fica sempre na altura y=0 (o chão), não importa a altura real dos 2 pontos da medida — comportamento de sempre.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-guia-chao-modo" value="proximaChao" ${cfg.trena3DGuiaChaoModo === 'proximaChao' ? 'checked' : ''}>
            <span><span class="t">Mais próxima do chão</span><br><span class="d">Paralela ao chão, na altura do extremo MAIS BAIXO da medida — uma extremidade da guia fica em comum com a extremidade mais baixa da própria medida.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-guia-chao-modo" value="afastadaChao" ${cfg.trena3DGuiaChaoModo === 'afastadaChao' ? 'checked' : ''}>
            <span><span class="t">Mais afastada do chão</span><br><span class="d">Paralela ao chão, na altura do extremo MAIS ALTO da medida — uma extremidade da guia fica em comum com a extremidade mais alta da própria medida.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-guia-chao-modo" value="livre" ${cfg.trena3DGuiaChaoModo === 'livre' ? 'checked' : ''}>
            <span><span class="t">Livre</span><br><span class="d">Qualquer altura, definida abaixo (0 = chão) — a guia desliza livremente ao longo das 2 linhas âncoras (que são paralelas entre si), sem precisar coincidir com nenhuma das 2 extremidades da medida.</span></span>
          </label>
          <label class="field" style="max-width:220px; margin-top:6px">
            <span class="lbl">Altura no modo "Livre" (m)</span>
            <div id="mc-trena3d-guia-chao-altura-livre" data-valor="${Utils.clamp(Number(cfg.trena3DGuiaChaoAlturaLivreM) || 0, -50, 50)}"></div>
            <span class="d">Só usado quando o modo acima estiver em "Livre". 0 = rente ao chão.</span>
          </label>
          <!-- [17/09/2026 UTC] NOVO (RODADA 114) — pedido verbatim: "além de
               poder controlar a cor, deve ser possível definir a espessura
               das linhas guia e se são sólida, tracejada ou pontilhada [...]
               deve ser possível escolher as pontas também (como a explicação
               toda já está na seção 'Pontas', então, aqui, deve ser algo bem
               mais simples)." -->
          <span class="d" style="display:block; margin-top:8px">Espessura/estilo da linha e pontas (compartilhados pelas 2 opções acima, ao vivo e finalizada):</span>
          ${this._trena3DCamposEstiloLinha('mc-trena3d-guia-chao', 'trena3DGuiaChao', cfg, { espessuraPadrao: 1.2, estiloPadrao: 'tracejada', dashPadrao: 12, gapPadrao: 8, comPontas: true })}
          <!-- [17/09/2026 UTC] NOVO (RODADA 119) — ver comentário grande na
               subseção "Aparência da medida" (mesmo controle, mesmo
               conceito, aplicado ao texto desta guia). -->
          ${this._trena3DCampoDeslocVerticalLabel('mc-trena3d-guia-chao', cfg.trena3DGuiaChaoLabelDeslocVerticalM)}
          <!-- [17/09/2026 UTC] NOVO (RODADA 125) — mesma escolha de estilo já
               existente em "Aparência da medida" ('trena3DLabelEstilo'),
               aplicada ao texto desta guia. Ver
               'trena3DGuiaChaoLabelEstilo' (DEFAULTS) e
               '_trena3DRebuildLines'/'_trena3DProjetarLabelImediato'
               (view3d.js). -->
          <span class="d" style="display:block; margin-top:8px; font-weight:600">Posição do texto</span>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-guia-chao-label" value="sobreLinhaMeio" ${cfg.trena3DGuiaChaoLabelEstilo === 'sobreLinhaMeio' ? 'checked' : ''}>
            <span><span class="t">Em cima e no meio</span><br><span class="d">O centro da caixa do texto coincide com o ponto médio real (sem deslocamento vertical) desta guia.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-guia-chao-label" value="sobreLinha" ${cfg.trena3DGuiaChaoLabelEstilo !== 'sobreLinhaMeio' ? 'checked' : ''}>
            <span><span class="t">Flutuante (padrão)</span><br><span class="d">O texto respeita o deslocamento vertical configurado acima.</span></span>
          </label>
          <!-- [17/09/2026 UTC] NOVO (RODADA 127) — pedido verbatim: "Deve ser
               possível controlar se a caixa de texto com a medida vai
               aparecer ou não em [...] '📏 Trena 3D — Guia rente ao chão'
               [...]. Por padrão todas ativadas." Ver
               'trena3DGuiaChaoLabelVisivel' (DEFAULTS) e '_trena3DCfg'/
               '_trena3DRebuildLines' (view3d.js). -->
          <h5 class="mc-subtitulo">Caixa de texto</h5>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-guia-chao-label-visivel" ${cfg.trena3DGuiaChaoLabelVisivel !== false ? 'checked' : ''}>
            <span><span class="t">Mostrar caixa de texto com a medida</span><br><span class="d">Desligue para esconder a caixa de texto desta guia — a linha e as pontas continuam aparecendo normalmente.</span></span>
          </label>
        </div>
        <!-- [16/09/2026 UTC] REESTRUTURADO — pedido verbatim (lote de vários
             itens sobre a Trena 3D):
             "A subseção '📏 Trena 3D — Linha da âncora após o 1º ponto' deve
             ficar logo acima da subseção '📏 Trena 3D — Linhas verticais das
             medidas finalizadas'. Na subseção '📏 Trena 3D — Altura ao vivo
             (Antes mesmo de definir o ponto)' a opção 'Sempre desenhada
             enquanto a Trena 3D estiver ativa' deve ser removida do projeto.
             As duas opções que restarem ali e o título (não vai ser mais uma
             subseção, vai ser um subtítulo) devem ir para a subseção '📏
             Trena 3D — Linhas verticais das medidas finalizadas'. A subseção
             '📏 Trena 3D — Linha da âncora após o 1º ponto' deve se tornar um
             subtítulo. E o subtítulo e suas opções devem ir para a subseção
             '📏 Trena 3D — Linhas verticais das medidas finalizadas'. Depois
             disso, a subseção '📏 Trena 3D — Linhas verticais das medidas
             finalizada' deve se tornar um subtítulo de sua própria subseção.
             E o novo título da subseção deve ser '📏 Trena 3D — Linhas
             verticais ancoradas'."
             As 3 antigas subseções ("Altura ao vivo (Antes mesmo de definir
             o ponto)", "Linha da âncora após o 1º ponto" e "Linhas verticais
             das medidas finalizadas") viraram uma ÚNICA subseção nova,
             "Linhas verticais ancoradas" — cada uma delas agora é só um
             <h5 class="mc-subtitulo"> dentro dela, na ordem pedida (Altura
             ao vivo → Linha da âncora → Linhas verticais das medidas
             finalizadas), sem nenhuma mudança nos IDs/campos/listeners/
             resync de cada opção (só o HTML ao redor mudou). A opção "Sempre
             desenhada enquanto a Trena 3D estiver ativa" (RODADA 90, campo
             'trena3DAlturaAoVivoSempreDesenhada') foi removida por completo
             do projeto (DEFAULTS acima, listener e
             'trena3DResyncMapaCheckbox' abaixo, e a leitura/uso em
             view3d.js '_trena3DCfg'/'_trena3DUpdatePreview') — não sobrou
             nenhum jeito de ativá-la. -->
        <div class="mapconfig-section">
          <h4>📏 Trena 3D — Linhas verticais ancoradas</h4>
          <!-- [16/09/2026 UTC] COLAPSADO — pedido verbatim: "Colapse as duas
               subseções '📏 Trena 3D — Altura ao vivo' e '📏 Trena 3D —
               Antes mesmo de definir o ponto', ficando '📏 Trena 3D —
               Altura ao vivo (Antes mesmo de definir o ponto)'. deixe a
               opção e a descrição textual de 'Antes mesmo de definir o
               ponto'. A opção da subseção 'Altura ao vivo' deixa de
               existir." A opção/checkbox "Altura ao vivo" (que cobria o
               caso "mira comum numa superfície elevada, sem âncora nenhuma
               em jogo") foi removida por completo — esse caso fica sempre
               ativo agora (ver view3d.js '_trena3DUpdatePreview', era o
               padrão de qualquer forma). Só sobra a opção "Antes mesmo de
               definir o ponto", com o cabeçalho combinado. -->
          <h5 class="mc-subtitulo">Altura ao vivo (Antes mesmo de definir o ponto)</h5>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-altura-antes-ponto" ${cfg.trena3DMostrarAlturaAoVivoAntesDoPonto !== false ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('medidaAoVivoAncora')}<span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone.">⬍⚓</span> Mostrar a medida entre a âncora e a bolinha "no ar" antes de fixar o ponto (padrão: ativado)</span><br><span class="d">Depois de marcar a âncora no chão (clique segurando Ctrl), enquanto o outro ponto ainda não foi fixado com um clique, a distância entre os 2 já aparece do lado da bolinha que segue o cursor. Desligue pra só ver essa medida depois de fixar o ponto.</span></span>
          </label>
          <!-- [RODADA 132] REMOVIDO — pedido verbatim: a opção "Mostrar já ao
               segurar o Ctrl, antes mesmo de marcar a âncora" foi UNIDA à
               opção acima ("Mostrar a medida entre a âncora e a bolinha 'no
               ar' antes de fixar o ponto"), que passou a cobrir os 2 casos
               (Ctrl segurado SEM âncora ainda commitada, E âncora já
               commitada aguardando o 2º clique) — só ela permanece. Campo
               'trena3DMostrarAlturaAoVivoAoSegurarCtrl' removido por
               completo (DEFAULTS acima, HTML aqui, wiring/resync abaixo, e
               a leitura em view3d.js '_trena3DCfg'/'_trena3DUpdatePreview',
               variável 'alturaPermitidaPorConfig'). -->
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Coloque uma opção de
               continuar desenhando a linha laranja tracejada ate o 1o ponto
               da medida (por padrao, ativada), apos ela ser definida.
               Atualmente, a linha laranja tracejada infinita fica aparente
               apenas apos ser definida a 1a ancora ate ser definido o 1o
               ponto da medida. Depois que o 1o ponto da medida e definido,
               a linha laranja tracejada infinita desaparece. Esta nova
               opcao faz a linha laranja tracejada infinita continuar a ser
               impressa. Uma subopcao deve ter para definir se a linha
               laranja tracejada fica infinita ou vai ate o 1o ponto da
               medida (por padrao, a opcao do 'vai ate o 1o ponto da
               medida' deve ficar ativa)." Ver view3d.js
               '_trena3DUpdatePreview' (bloco de '_trena3DP1HeightLine'). -->
          <h5 class="mc-subtitulo">Linha da âncora após o 1º ponto</h5>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-continuar-linha-ancora" ${cfg.trena3DContinuarLinhaAncoraAposPonto !== false ? 'checked' : ''} title="Depois que o 1º ponto da medida é fixado, a âncora (o clique com Ctrl) é 'consumida' e a linha laranja tracejada perpendicular ao chão desaparecia. Esta opção faz ela continuar sendo desenhada.">
            <span>${this._trena3DPreviewImgTag('linhaAncoraAteOPonto')}<span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone.">┆1</span> Continuar desenhando a linha tracejada depois do 1º ponto ser definido (padrão: ativado)</span><br><span class="d">Sem esta opção, a linha laranja tracejada perpendicular ao chão só aparece entre marcar a âncora e fixar o 1º ponto da medida — depois disso ela some. Com esta opção ativada, ela continua sendo desenhada mesmo depois do 1º ponto já fixado.</span></span>
          </label>
          <!-- [16/09/2026 UTC] CORRIGIDO — pedido verbatim: "os radio buttons
               que tem ali deve ficar claro a qual opção eles pertencem. Do
               jeito que está, atualmente, acaba ficando bagunçado." Antes,
               os 2 radios ("Vai até o 1º ponto"/"Infinita") ficavam soltos
               entre a checkbox de cima ("Continuar desenhando...") e a de
               baixo ("Mostrar também o texto..."), sem nenhuma pista visual
               de que são uma SUBOPÇÃO da checkbox de cima (o "comprimento"
               da linha que ela ativa) — os 3 pareciam 3 opções soltas do
               mesmo nível. Adicionado um rótulo pequeno "↳ Comprimento da
               linha" + indentação (mesmo padrão de 'margin-left:26px' já
               usado noutras subopções deste arquivo) pra agrupar
               visualmente os 2 radios sob a checkbox que os ativa. -->
          <div style="margin-left:26px; font-size:11px; color:var(--text-dim); margin-top:2px">↳ Comprimento da linha</div>
          <label class="radio-opt" style="margin-left:26px">
            <input type="radio" name="mc-trena3d-linha-ancora-modo" value="ateOPonto" ${cfg.trena3DLinhaAncoraAposPontoModo !== 'infinita' ? 'checked' : ''} title="A linha vai só até a altura real do 1º ponto da medida — o comprimento dela já mostra a medida.">
            <span>${this._trena3DPreviewImgTag('linhaAncoraAteOPonto')}<span class="t">Vai até o 1º ponto da medida (padrão)</span><br><span class="d">A linha para exatamente na altura do 1º ponto já fixado — o próprio comprimento dela representa a medida.</span></span>
          </label>
          <label class="radio-opt" style="margin-left:26px">
            <input type="radio" name="mc-trena3d-linha-ancora-modo" value="infinita" ${cfg.trena3DLinhaAncoraAposPontoModo === 'infinita' ? 'checked' : ''} title="A linha continua bem além da altura real (sem teto), como a referência vertical mostrada durante a ancoragem, em vez de parar na altura do 1º ponto.">
            <span>${this._trena3DPreviewImgTag('linhaAncoraInfinita')}<span class="t">Infinita</span><br><span class="d">A linha continua bem além da altura real (sem teto — o antigo limite de 6m foi removido), mesmo comprimento da referência mostrada durante a ancoragem, independente da altura real do 1º ponto.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Outra subopcao e
               imprimir junto com a linha laranja tracejada infinita (ou ate
               o 1o ponto, com isso, nao sendo infinita) o texto laranja da
               medida (logo depois de definir o 1o ponto da medida)." Ver
               view3d.js '_trena3DUpdatePreview' (bloco de
               '_trena3DP1HeightLine'). Sem indentação de propósito — esta
               checkbox não é subopção do "Comprimento da linha" acima, é
               uma 3ª opção independente da mesma subseção (a linha e o
               texto podem ser ligados/desligados sem depender um do
               outro). -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-mostrar-medida-linha-ancora" ${cfg.trena3DMostrarMedidaNaLinhaAncoraAposPonto !== false ? 'checked' : ''} title="Além da linha em si, mostra o texto laranja com o valor da medida (⬍ Xm) junto dela, mesmo depois do 1º ponto já ter sido fixado.">
            <span>${this._trena3DPreviewImgTag('linhaAncoraAteOPonto')}<span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone.">🔤┆</span> Mostrar também o texto da medida junto com essa linha (padrão: ativado)</span><br><span class="d">Com esta opção, o texto laranja da medida (⬍ Xm) continua aparecendo junto com a linha tracejada acima, mesmo depois do 1º ponto da medida já ter sido definido. Desligue para deixar só a linha, sem o texto.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Semelhante a
               subsecao 'Linha da ancora apos o 1o ponto', mas agora nas duas
               linhas (a linha [...] que vai do 1o ponto ancora ate o 1o
               ponto da medida e a [...] do 2o ponto ancora ate o 2o ponto da
               medida). Deve te uma subsecao para definir se ficam impressas
               apos a medida ser finalizada (por padrao, desativada). E uma
               subopcao se desenha do chao ate os pontos da medida ou se as
               duas vao ser infinitas." Ver view3d.js '_trena3DRebuildLines'. -->
          <h5 class="mc-subtitulo">Linhas verticais das medidas finalizadas</h5>
          <!-- [16/09/2026 UTC] RENOMEADO — pedido verbatim: "Troque o nome
               da opção 'Mostrar depois da medida finalizada (padrão:
               desativado)' (na subseção 'Trena 3D — Linhas verticais
               ancoradas') por 'Manter as linhas da ancora depois da medida
               ja finalizada' (assim fica igual ao title do botao de flag
               equivalente na janelinha)." Só o rótulo mudou (já era esse o
               'titulo' do botão 'MostrarLinhasAncoraFinalizada' na janelinha,
               ver view3d.js '_trena3DOpcoesPainelRapido') — id/campo/
               comportamento inalterados. -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-linhas-finalizada" ${cfg.trena3DMostrarLinhasAncoraFinalizada === true ? 'checked' : ''} title="Depois que uma medida com pontos 'no ar' (ancorados) é finalizada, mostra as 2 linhas tracejadas laranja (do chão até cada ponto) permanentemente junto com ela, não só durante a medição.">
            <span>${this._trena3DPreviewImgTag('linhasFinalizadas')}<span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone.">🏁┆</span> Manter as linhas de âncora depois da medida já finalizada (padrão: desativado)</span><br><span class="d">Para cada ponto da medida que tenha sido fixado "no ar" (com âncora), mostra uma linha tracejada do chão até ele, junto com a medida já pronta — não some mais depois de clicar o 2º ponto. Se um ponto da medida já está no chão (y=0), não há linha pra desenhar nele.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-linhas-finalizada-modo" value="ateOPonto" ${cfg.trena3DLinhasAncoraFinalizadaModo !== 'infinita' ? 'checked' : ''} title="Cada linha vai só até a altura real do ponto correspondente — o comprimento dela já mostra a altura daquele ponto.">
            <span>${this._trena3DPreviewImgTag('linhaAncoraAteOPonto')}<span class="t">Vai até o ponto da medida (padrão)</span><br><span class="d">Cada linha para exatamente na altura do ponto correspondente.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-linhas-finalizada-modo" value="infinita" ${cfg.trena3DLinhasAncoraFinalizadaModo === 'infinita' ? 'checked' : ''} title="As 2 linhas continuam bem além da altura real (sem teto), independente da altura real de cada ponto.">
            <span>${this._trena3DPreviewImgTag('linhaAncoraInfinita')}<span class="t">Infinita</span><br><span class="d">As 2 linhas continuam bem além da altura real (sem teto — o antigo limite de 6m foi removido), independente da altura real de cada ponto.</span></span>
          </label>
          <!-- [17/09/2026 UTC] NOVO (RODADA 114) — pedido verbatim: "além de
               poder controlar a cor, deve ser possível definir a espessura
               das linhas guia e se são sólida, tracejada ou pontilhada [...]
               Por padrão fica nas configurações que está (laranja tracejada
               e fina)." Cor/espessura/estilo compartilhados pelas 3
               sub-opções acima (Altura ao vivo, Linha da âncora, Linhas
               finalizadas) — todas usam a MESMA referência visual (a
               "linha da âncora" de sempre), então 1 conjunto de controles
               só, não 3 repetidos. -->
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:8px">
            <label class="field" style="flex:0 0 auto; margin:0; min-width:70px">
              <span class="lbl">Cor da linha</span>
              <input type="color" id="mc-trena3d-linha-ancora-cor" value="${cfg.trena3DLinhaAncoraCor || '#ff9f4d'}">
            </label>
          </div>
          <span class="d" style="display:block; margin-top:8px">Espessura/estilo da linha (compartilhados pelas 3 opções acima):</span>
          ${this._trena3DCamposEstiloLinha('mc-trena3d-linha-ancora', 'trena3DLinhaAncora', cfg, { espessuraPadrao: 1, estiloPadrao: 'tracejada', dashPadrao: 12, gapPadrao: 8 })}
          <!-- [17/09/2026 UTC] NOVO (RODADA 119) — ver comentário grande na
               subseção "Aparência da medida" (mesmo controle, mesmo
               conceito, aplicado ao texto "⬍ Xm" das 2 linhas AO VIVO desta
               subseção — as linhas de âncora FINALIZADAS não têm rótulo de
               texto próprio, só a linha em si, então não há o que deslocar
               ali). -->
          ${this._trena3DCampoDeslocVerticalLabel('mc-trena3d-linha-ancora', cfg.trena3DLinhaAncoraLabelDeslocVerticalM)}
          <!-- [RODADA 131] NOVO — mesmo padrão das outras subseções de guia
               ('trena3DLabelVisivel'/'trena3DGuiaChaoLabelVisivel'/
               'trena3DGuiaGradeLabelVisivel'), aplicado às 2 caixas de texto
               ("⬍ Xm") desta subseção (linha da âncora após o 1º ponto e
               altura ao vivo antes do ponto) — a(s) linha(s) em si continuam
               aparecendo normalmente, só a caixa de texto é afetada. -->
          <h5 class="mc-subtitulo">Caixa de texto</h5>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-linha-ancora-label-visivel" ${cfg.trena3DLinhaAncoraLabelVisivel !== false ? 'checked' : ''}>
            <span><span class="t">Mostrar caixa de texto com a medida</span><br><span class="d">Desligue para esconder a caixa de texto ("⬍ Xm") das linhas verticais ancoradas — a(s) linha(s) continuam aparecendo normalmente.</span></span>
          </label>
        </div>
        <div class="mapconfig-section">
          <!-- [RODADA 129] NOVO — pedido verbatim: "Há uma linha tracejada
               azul claro que aparece quando se define o 1º ponto da medida,
               é como se fosse um ghost ou prévia de como a medida vai ficar
               [...] Deve ser possível selecionar a cor deste ghost também. E
               se é tracejado, pontilhada, espessura e cor. O mesmo que já se
               pode fazer em '📏 Trena 3D — Linhas verticais ancoradas'."
               Mesmo padrão de campos (helper compartilhado
               _trena3DCamposEstiloLinha/_wireTrena3DEstiloLinha) da
               subseção acima. Ver _trena3DGuideLine em view3d.js (a função
               que desenha esse ghost, ligada aqui via _trena3DCfg() —
               cfg.ghostCorInt/cfg.ghostEstiloLinha). -->
          <h4>📏 Trena 3D — Ghost/prévia da medida</h4>
          <span class="d" style="display:block; margin-bottom:6px">A linha tracejada que liga o 1º ponto já fixado até a bolinha que segue o cursor, mostrando uma prévia de como a medida vai ficar antes do 2º clique.</span>
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:8px">
            <label class="field" style="flex:0 0 auto; margin:0; min-width:70px">
              <span class="lbl">Cor da linha</span>
              <input type="color" id="mc-trena3d-ghost-cor" value="${cfg.trena3DGhostCor || '#5ec8ff'}">
            </label>
          </div>
          <span class="d" style="display:block; margin-top:8px">Espessura/estilo da linha:</span>
          ${this._trena3DCamposEstiloLinha('mc-trena3d-ghost', 'trena3DGhost', cfg, { espessuraPadrao: 1, estiloPadrao: 'tracejada', dashPadrao: 12, gapPadrao: 8 })}
        </div>
        <div class="mapconfig-section">
          <!-- [16/09/2026 UTC] INVESTIGADO (não corrigido com certeza) —
               pedido verbatim (relatado 2x, números diferentes cada vez):
               "ao copiar e colar este título, no final do texto quando cola
               aparece alguns números ('0,5 2,1'), remova-os." Os números
               batem com os valores atuais de "Espessura"/"Vão" desta mesma
               seção ('#mc-trena3d-grade-snap-espessura' /
               '#mc-trena3d-grade-snap-gap', ~35 linhas abaixo deste <h4>).
               Inspecionado TODO o HTML entre este <h4> e aqueles 2 <input>:
               não há nenhum nó de texto solto nem interpolação
               (interpolação de template string) com esses números perto do título — os valores só
               aparecem dentro do atributo 'value="..."' dos próprios
               '<input type="number">', que não é texto selecionável (valor
               de campo de formulário, não nó de texto do DOM). Ou seja, uma
               seleção normal (arrastar ou triplo-clique) do título deste
               '<h4>' NÃO deveria conseguir "pegar" esses números pela
               estrutura do DOM sozinha. HIPÓTESE MAIS PROVÁVEL: o
               comportamento é do NAVEGADOR/SO ao copiar, não desta página —
               ex. um triplo-clique que se estende por engano até o próximo
               elemento por causa de como listas de '<label>'/'<input>' sem
               fronteira de bloco clara são tratadas por certos mecanismos de
               seleção (ex. leitores de tela, extensões de clipboard, ou
               "seleção inteligente" de alguns navegadores mobile que
               arredonda a seleção para o próximo elemento de formulário
               visível), OU a colagem está acontecendo num campo de texto
               (ex. um <input> de busca) cujo próprio navegador anexa
               "sugestões" ou autocomplete que por coincidência mostram
               números da página. NENHUMA correção de código foi aplicada
               aqui por falta de uma causa raiz concreta no HTML gerado —
               ver 'Utils.clamp(...)' nos 2 campos abaixo, que são os únicos
               lugares onde esses números existem nesta seção. Se o
               problema persistir, o próximo passo seria reproduzir com
               DevTools aberto (inspecionar a seleção real via
               'window.getSelection()' no momento da cópia) para confirmar
               se o range inclui os '<input>' — algo que não foi possível
               fazer nesta sessão (sem navegador disponível). -->
          <!-- [16/09/2026 UTC] REORDENADO — pedido verbatim: "A subseção
               '📏 Trena 3D — Gradeado do ladrilho mirado' deve anteceder a
               subseção '📏 Trena 3D — Guia de grade do mundo'." Esta
               subseção inteira (antes vinha DEPOIS de "Linhas guia da grade
               do mundo") foi movida pra cá — só a ORDEM mudou, nenhum
               conteúdo interno foi alterado por causa disso. -->
          <h4 style="margin-bottom:10px">📏 Trena 3D — Gradeado do ladrilho mirado</h4>
          <!-- [16/09/2026 UTC] MITIGAÇÃO (RODADA 91) — pedido verbatim:
               "Os números que estavam aparecendo no final do texto de
               título eram os valores das opções mesmo sendo copiados
               juntos." CONFIRMADO PELO USUÁRIO: não é bug de renderização
               nem conteúdo fantasma — é comportamento normal de seleção de
               texto do navegador quando o título e os campos numéricos
               seguintes ficam muito próximos/sem separação clara no DOM, e
               a seleção do usuário (drag/triplo-clique) se estende além do
               '<h4>' até pegar o texto dos '<input>' mais abaixo. Sem
               conserto de código necessário — mitigação de fácil aplicação
               feita mesmo assim: 'margin-bottom' extra no '<h4>' (era só o
               espaçamento padrão de '.mapconfig-section h4'), reduzindo a
               proximidade visual/estrutural entre o título e o 1º controle
               seguinte, o que deve reduzir a chance de uma seleção
               acidental continuar além do título. -->
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "desenhar um
               gradeado dentro do ladrilho de mundo que esta sendo alvo no
               momento, conforme o snap definido. Um gradeado feito com
               linha pontilhadas. Por padrao ativado." -- ver view3d.js
               _trena3DAtualizarGradeSnapLadrilho. -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-grade-snap" ${cfg.trena3DGradeSnapLadrilhoAtiva !== false ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('gradeSnapLadrilho')}<span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone.">⣿</span> Mostrar gradeado (pontilhado) dentro da área mirada, no espaçamento do snap (padrão: ativado)</span><br><span class="d">Enquanto mira com a "📏 Trena 3D", a área sob a mira (ver opção abaixo) ganha linhas pontilhadas internas, espaçadas conforme o valor do snap configurado acima (ex.: snap de 0,1m desenha um gradeado 10×10 por ladrilho de 1m) — ajuda a visualizar onde o snap vai cair antes de clicar. Se o snap estiver desligado ou o valor for 1m ou mais, não há linha interna pra desenhar (o próprio ladrilho já seria a menor unidade).</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "o preview deve ficar
               logo abaixo da opção 'Mostrar gradeado (pontilhado)...'."
               Movido pra cá (era logo depois de "Espessura"/"Vão"). -->
          <div style="margin:8px 0 4px; display:flex; justify-content:center">
            <canvas id="mc-trena3d-grade-snap-preview" width="180" height="180" style="background:#1a1c22; border:1px solid var(--border); border-radius:6px; max-width:100%"></canvas>
          </div>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ter uma opcao
               (sobre o gradeado) que o desenhe 'nos quatro ladrilhos do
               entorno', do 'jeito atual' ou 'metade de cada ladrilho do
               entorno'." -->
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-grade-snap-modo" value="atual" ${cfg.trena3DGradeSnapLadrilhoModo !== 'quatroLadrilhos' && cfg.trena3DGradeSnapLadrilhoModo !== 'metadeEntorno' ? 'checked' : ''}>
            <span><span class="t">Só o ladrilho de 1m sob a mira (padrão)</span><br><span class="d">O gradeado cobre só o ladrilho de 1m×1m que contém o ponto mirado.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-grade-snap-modo" value="quatroLadrilhos" ${cfg.trena3DGradeSnapLadrilhoModo === 'quatroLadrilhos' ? 'checked' : ''}>
            <span><span class="t">Nos 4 ladrilhos do entorno</span><br><span class="d">O gradeado cobre os 4 ladrilhos inteiros de 1m que se tocam no canto/vértice de grade mais próximo do ponto mirado — área de 2m×2m.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-grade-snap-modo" value="metadeEntorno" ${cfg.trena3DGradeSnapLadrilhoModo === 'metadeEntorno' ? 'checked' : ''}>
            <span><span class="t">Metade de cada ladrilho do entorno</span><br><span class="d">O gradeado cobre só a metade mais próxima de cada um dos 4 ladrilhos do entorno — um quadrado de 1m×1m centrado no vértice de grade mais próximo, em vez de com o canto nele.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser possivel
               controlar a espessura das linhas guias do gradeado [...] Por
               padrao deve ser a metade do que e atualmente." e "O
               pontilhado do gradeado [...] deve ser [1,2]." -->
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:6px">
            <label class="field" style="flex:0 0 auto; margin:0; min-width:110px">
              <span class="lbl">Espessura (px)</span>
              <div id="mc-trena3d-grade-snap-espessura" data-valor="${Utils.clamp(Number(cfg.trena3DGradeSnapEspessuraPx) || 1, 0.5, 10)}"></div>
            </label>
            <label class="field" style="flex:0 0 auto; margin:0; min-width:90px">
              <span class="lbl">Vão (cm)</span>
              <div id="mc-trena3d-grade-snap-gap" data-valor="${Utils.clamp(Number(cfg.trena3DGradeSnapGapCm) || 1.5, 0.1, 50)}"></div>
            </label>
            <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "deve ser possível
                 escolher a cor do gradeado (que, atualmente, é um azul.
                 Esta deve ser a cor padrão...)." -->
            <label class="field" style="flex:0 0 auto; margin:0; min-width:70px">
              <span class="lbl">Cor</span>
              <input type="color" id="mc-trena3d-grade-snap-cor" value="${cfg.trena3DGradeSnapCor || '#7fd8ff'}">
            </label>
          </div>
          <!-- [16/09/2026 UTC] REMOVIDO — pedido verbatim: "remova o 'Traço',
               ficando apenas a 'Espessura' e o 'Vão'." O campo 'trena3DGradeSnapDashCm'
               continua existindo em DEFAULTS/config (fixo no padrão de 1cm,
               ver view3d.js '_trena3DAtualizarGradeSnapLadrilho') — só o
               campo de UI pra ele foi removido daqui. -->
          <span class="d" style="display:block; margin-top:6px">"Espessura" é o tamanho de cada pontinho do gradeado, em pixels na tela (padrão: 3px). "Vão" decide o espaçamento entre pontinhos ao longo de cada linha (padrão 2cm).</span>
        </div>
        <div class="mapconfig-section">
          <!-- [16/09/2026 UTC] RENOMEADO — pedido verbatim: "A subseção
               'Trena 3D — Guia de grade do mundo' deve trocar de nome para
               'Trena 3D — Linhas guia da grade do mundo'." Só o título
               mudou — nenhum id/campo/comportamento foi tocado aqui. -->
          <h4>📏 Trena 3D — Linhas guia da grade do mundo</h4>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "mostrar linhas
               tracejadas guias a partir do lado do ladrilho do mundo (na
               verdade, dos multiplos de 1m [...]). Por exemplo, aponta-se
               para um ponto 0,3m a direita do ladrilho que esta a esquerda
               (uma linha tracejada guia deve ser impressa ai) e 0,4m a
               baixo do ladrilho que esta em cima (uma linha tracejada guia
               deve ser impressa ai tambem). As medidas tambem devem
               aparecer (no meio e centralizadas). Por padrao, fica
               ativada." -- ver view3d.js _trena3DAtualizarGuiaGrade. -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-guia-grade" ${cfg.trena3DGuiaGradeAtiva !== false ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('guiaGradeMundo')}<span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone.">▦</span> Mostrar linhas guia até o ladrilho do mundo mais próximo dentro da área mirada (padrão: ativado)</span><br><span class="d">Enquanto mira com a "📏 Trena 3D", 2 linhas curtas SÓLIDAS (uma no eixo X, outra no eixo Z) mostram a distância do ponto mirado até a linha de grade mais próxima (múltiplo de 1m — o mesmo espaçamento do ladrilho do chão), com a medida de cada uma centralizada no meio da linha. Some sozinha quando o ponto já está exatamente em cima da grade naquele eixo.</span></span>
          </label>
          <!-- [18/09/2026 UTC] REORDENADO (RODADA 136) — pedido verbatim: os
               2 checkboxes abaixo ("Continuar mostrando depois do 1º
               ponto..." e "Mostrar nas medidas já finalizadas") foram
               movidos pra logo depois do checkbox acima ("Mostrar linhas
               guia até o ladrilho..."), antes do preview de canvas e dos
               radios de modo de medida — só a ORDEM mudou, nenhum
               id/campo/comportamento foi tocado. -->
          <!-- [16/09/2026 UTC] REORDENADO — pedido verbatim: "A opção
               'Continuar mostrando depois do 1º ponto, enquanto mira o 2º
               (padrão: desativado)' deve vir antes da opção que a
               antecede." Trocada de posição com "Mostrar nas medidas já
               finalizadas" logo abaixo — só a ORDEM mudou, nenhum
               id/campo/comportamento foi tocado. -->
          <!-- [16/09/2026 UTC] NOVO (RODADA 104) — pedido verbatim: "deve
               haver outra opção para habilitar/desabilitar o desenho das
               guias de grade, quando o 1º ponto já foi definido, continuar
               mostrando elas (enquanto não se definiu o 2º ponto ainda)."
               Cobre o caso INTERMEDIÁRIO — nem "antes de qualquer ponto"
               (opção do topo desta subseção) nem "medida já finalizada"
               (opção logo abaixo), e sim durante a mira do 2º ponto, com o
               1º já fixado. Ver view3d.js '_trena3DAtualizarGuiaGrade'. -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-guia-grade-apos-1-ponto" ${cfg.trena3DGuiaGradeAposPrimeiroPonto === true ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('guiaGradeMundo')}<span class="t">Continuar mostrando depois do 1º ponto, enquanto mira o 2º (padrão: desativado)</span><br><span class="d">Por padrão, assim que o 1º ponto de uma medida é fixado, esta guia (linhas + medida até a grade mais próxima) some — só volta a aparecer numa medida nova ou, se a opção abaixo estiver ativa, numa medida já finalizada. Ative esta opção para ela continuar aparecendo também enquanto você mira o 2º ponto (relativa à posição atual da mira, não mais ao 1º ponto já fixado) — útil pra quem quer a guia de grade em AMBOS os pontos da medida, não só antes do 1º.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "coloque como outra
               opção para aparecer após finalizar a medida. Isto acabará
               afetando a todas as medidas no mapa." Generaliza a guia acima
               (só ao vivo, durante a mira) pra cada ponto de TODA medida já
               finalizada no mapa — ver view3d.js '_trena3DRebuildLines'.
               [16/09/2026 UTC] RENOMEADO — pedido verbatim: "A opção
               'Mostrar também nas medidas já finalizadas (padrão:
               desativado)' deve trocar de nome para 'Mostrar nas medidas já
               finalizadas'. E as linhas guia devem ser rente a superfície
               em que foi usada para fazer a ancoragem/medida (não 'no ar'
               como está atualmente)." A grade do mundo (ladrilho) só existe
               mesmo na altura y=0 — desenhar a guia na altura do PONTO (que
               pode estar "no ar", elevado por uma âncora) não correspondia
               a nenhuma grade real àquela altura. Corrigido em
               view3d.js '_trena3DRebuildLines' — a guia agora é sempre
               desenhada rente ao chão (y=0), na projeção X/Z do ponto (a
               mesma X/Z da superfície onde a ancoragem/medida foi feita),
               em vez de na altura Y do próprio ponto. -->
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-guia-grade-finalizada" ${cfg.trena3DGuiaGradeFinalizada === true ? 'checked' : ''}>
            <span>${this._trena3DPreviewImgTag('guiaGradeMundo')}<span class="t"><span style="display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:18px; padding:0 3px; margin-right:4px; border:1px solid #ff9f4d; background:rgba(255,159,77,0.25); border-radius:4px; vertical-align:-4px; box-sizing:border-box" title="Este ícone indica que esta opção pode estar presente na janela rápida da Trena 3D por meio de um botão com o mesmo ícone.">🏁▦</span> Mostrar nas medidas já finalizadas (padrão: desativado)</span><br><span class="d">Além de aparecer ao vivo enquanto mira (opção acima), desenha a mesma guia (linhas + medida até a grade mais próxima) para CADA PONTO de TODAS as medidas já feitas no mapa, rente ao chão na projeção de cada ponto — reage ao "jeito" escolhido acima (esquerda/cima OU lado mais próximo) e é atualizada na hora ao ligar/desligar, sem precisar fazer uma medida nova.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "faça um preview de
               canvas para se ter noção do que se trata." Preview 2D
               ilustrativo (não é a cena 3D de verdade) — desenhado/atualizado
               em '_trena3DDesenharPreviewGuiaGrade' logo abaixo, reagindo ao
               radio "esquerdaCima"/"maisPerto". -->
          <div style="margin:8px 0 4px; display:flex; justify-content:center">
            <canvas id="mc-trena3d-guia-grade-preview" width="180" height="180" style="background:#1a1c22; border:1px solid var(--border); border-radius:6px; max-width:100%"></canvas>
          </div>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Outra opção e como
               as medidas vao ser apresentadas no ladrilho, como e
               atualmente e uma opcao. Outra e sempre partindo da esquerda
               numa medida e de cima para a outra medida (esta deve ser a
               padrao)." -->
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-guia-modo" value="esquerdaCima" ${cfg.trena3DGuiaGradeModoMedida !== 'maisPerto' ? 'checked' : ''}>
            <span><span class="t">Sempre a partir da esquerda (eixo X) e de cima (eixo Z) (padrão)</span><br><span class="d">As 2 medidas sempre partem do mesmo lado do ladrilho, não importa se o ponto mirado está mais perto do lado oposto — mais previsível pra comparar medidas entre pontos diferentes.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-guia-modo" value="maisPerto" ${cfg.trena3DGuiaGradeModoMedida === 'maisPerto' ? 'checked' : ''}>
            <span><span class="t">Sempre até o lado mais próximo (jeito antigo)</span><br><span class="d">Cada medida vai até o múltiplo de 1m mais perto do ponto mirado naquele eixo — pode ser o da esquerda OU o da direita/de cima OU o de baixo, o que estiver mais perto.</span></span>
          </label>
          <!-- [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser possível
               definir a cor das linhas guia. Atualmente elas são desenhadas
               com verde. E na preview está como azul. Deve ser azul para
               ambos, como padrão. Deve ser possível selecionar a cor do
               texto da medida que deve ter a mesma cor já selecionada, como
               padrão." Mesmo padrão de 2 campos de cor independentes já
               usado em "Guia rente ao chão" (RODADA 98) — ver
               view3d.js '_trena3DAtualizarGuiaGrade'/'_trena3DRebuildLines'
               (bloco 'guiaGradeFinalizada'), que antes desenhavam com uma
               cor verde FIXA no código, agora lêem estes 2 campos. -->
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:8px">
            <label class="field" style="flex:0 0 auto; margin:0; min-width:70px">
              <span class="lbl">Cor da linha</span>
              <input type="color" id="mc-trena3d-guia-grade-cor-linha" value="${cfg.trena3DGuiaGradeCorLinha || '#5ec8ff'}">
            </label>
            <label class="field" style="flex:0 0 auto; margin:0; min-width:70px">
              <span class="lbl">Cor do texto</span>
              <input type="color" id="mc-trena3d-guia-grade-cor-texto" value="${cfg.trena3DGuiaGradeCorTexto || '#5ec8ff'}">
            </label>
          </div>
          <!-- [17/09/2026 UTC] NOVO (RODADA 114) — pedido verbatim: "além de
               poder controlar a cor, deve ser possível definir a espessura
               das linhas guia e se são sólida, tracejada ou pontilhada. o
               line dash deve ser possível controlar (quando aplicável)." -->
          <span class="d" style="display:block; margin-top:8px">Espessura/estilo da linha (compartilhados por todas as opções acima, ao vivo e finalizada):</span>
          ${this._trena3DCamposEstiloLinha('mc-trena3d-guia-grade', 'trena3DGuiaGrade', cfg, { espessuraPadrao: 2.4, estiloPadrao: 'solida', dashPadrao: 12, gapPadrao: 8 })}
          <!-- [17/09/2026 UTC] NOVO (RODADA 119) — ver comentário grande na
               subseção "Aparência da medida" (mesmo controle, mesmo
               conceito). ÚNICA das 4 subseções que ganhou também o enable
               da linha vertical de apoio (opts.comLinhaVertical) — pedido
               verbatim: "para esta opção, deve ter um enable de aparecer a
               linha vertical (perpendicular ao chão) que é usada para
               deslocar o texto. Para melhor identificar visualmente." -->
          ${this._trena3DCampoDeslocVerticalLabel('mc-trena3d-guia-grade', cfg.trena3DGuiaGradeLabelDeslocVerticalM, { comLinhaVertical: true, linhaVerticalAtiva: cfg.trena3DGuiaGradeLabelLinhaVertical === true })}
          <!-- [17/09/2026 UTC] NOVO (RODADA 125) — mesma escolha de estilo já
               existente em "Aparência da medida" ('trena3DLabelEstilo'),
               aplicada ao texto desta guia. Ver
               'trena3DGuiaGradeLabelEstilo' (DEFAULTS) e
               '_trena3DRebuildLines'/'construirLabel' (view3d.js). -->
          <span class="d" style="display:block; margin-top:8px; font-weight:600">Posição do texto</span>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-guia-grade-label" value="sobreLinhaMeio" ${cfg.trena3DGuiaGradeLabelEstilo === 'sobreLinhaMeio' ? 'checked' : ''}>
            <span><span class="t">Em cima e no meio</span><br><span class="d">O centro da caixa do texto coincide com o ponto médio real (sem deslocamento vertical) desta guia.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-trena3d-guia-grade-label" value="sobreLinha" ${cfg.trena3DGuiaGradeLabelEstilo !== 'sobreLinhaMeio' ? 'checked' : ''}>
            <span><span class="t">Flutuante (padrão)</span><br><span class="d">O texto respeita o deslocamento vertical configurado acima.</span></span>
          </label>
          <!-- [17/09/2026 UTC] NOVO (RODADA 127) — pedido verbatim: "Deve ser
               possível controlar se a caixa de texto com a medida vai
               aparecer ou não em [...] '📏 Trena 3D — Linhas guia da grade do
               mundo'. Por padrão todas ativadas." Ver
               'trena3DGuiaGradeLabelVisivel' (DEFAULTS) e '_trena3DCfg'/
               '_trena3DRebuildLines' (view3d.js). -->
          <h5 class="mc-subtitulo">Caixa de texto</h5>
          <label class="radio-opt">
            <input type="checkbox" id="mc-trena3d-guia-grade-label-visivel" ${cfg.trena3DGuiaGradeLabelVisivel !== false ? 'checked' : ''}>
            <span><span class="t">Mostrar caixa de texto com a medida</span><br><span class="d">Desligue para esconder a caixa de texto desta guia — a linha e as pontas continuam aparecendo normalmente.</span></span>
          </label>
        </div>
        </div><!-- fecha #mc-trena3d-secoes (ver comentário grande no início da seção "📏 Trena 3D") -->
        <!-- Seção "🚪 Porta / Janela" (pedido do usuário, 25/08/2026) —
             encaixe no centro do quadrado do chão ao posicionar "no ar"
             (longe de parede). Ver DEFAULTS acima pro significado de cada
             campo e view3d.js _isDoorSnapActiveNow pra como é lido. -->
        <div class="mapconfig-section">
          <h4>🚪 Porta / Janela</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-porta-snap-on" ${cfg.portaSnapCentroBlocoAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Travar no centro do bloco (posicionamento "no ar")</span><br><span class="d">Ao posicionar uma porta/janela longe de qualquer parede, a peça gruda no centro do quadrado de 1m do chão sob a mira, em vez de ficar solta em qualquer ponto exato. Encaixada numa parede não é afetado — a posição já é travada na própria parede.</span></span>
          </label>
          <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border)">
            <span class="lbl" style="display:block; margin-bottom:5px">Modificador por tecla (hold key)</span>
            <span class="d" style="display:block; margin-bottom:6px">Segurando a tecla escolhida, LIBERA a posição (deixa exatamente onde a mira encosta no chão) — solte a tecla pra voltar a travar no centro.</span>
            <select id="mc-porta-snap-modificador">
              <option value="shift" ${(cfg.portaSnapModificador || 'shift') === 'shift' ? 'selected' : ''}>Shift</option>
              <option value="alt" ${cfg.portaSnapModificador === 'alt' ? 'selected' : ''}>Alt</option>
              <option value="nenhuma" ${cfg.portaSnapModificador === 'nenhuma' ? 'selected' : ''}>Nenhuma (trava sempre no centro)</option>
            </select>
            <label class="radio-opt" style="margin-top:8px">
              <input type="checkbox" id="mc-porta-snap-modificador-inverter" ${cfg.portaSnapModificadorInvertido ? 'checked' : ''}>
              <span><span class="t">Inverter lógica</span><br><span class="d">Com isto ligado, a posição começa LIVRE e é a tecla escolhida acima que TRAVA no centro (em vez de liberar) — volta ao comportamento original ("segure Shift pra travar").</span></span>
            </label>
          </div>
          <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border)">
            <label class="field">
              <span class="lbl">Alinhamento ao posicionar solta ("no ar")</span>
              <select id="mc-porta-modo-alinhamento">
                <option value="personagem" ${(cfg.portaJanelaModoAlinhamento || 'personagem') === 'personagem' ? 'selected' : ''}>Conforme direção do personagem (padrão)</option>
                <option value="cardinal" ${cfg.portaJanelaModoAlinhamento === 'cardinal' ? 'selected' : ''}>Alinhamento cardinal (fixo — botão do meio cicla)</option>
                <option value="padrao" ${cfg.portaJanelaModoAlinhamento === 'padrao' ? 'selected' : ''}>Modo Padrão (livre, acompanha a câmera)</option>
              </select>
            </label>
            <span class="d ${(cfg.portaJanelaModoAlinhamento || 'personagem') === 'personagem' ? '' : 'hidden'}" id="mc-porta-modo-desc-personagem" style="display:block; margin-top:5px">Ao posicionar uma porta/janela solta ("no ar", sem encaixar numa parede), ela vira sozinha pra uma das 4 direções fixas — a mais PRÓXIMA de pra onde você está olhando — sem precisar clicar. O botão do meio do mouse também cicla entre as 4 direções, se você quiser uma diferente da automática — mas assim que você virar o bastante pra mudar de direção de novo, volta a acompanhar automaticamente (o clique "reseta" sozinho). Encaixada numa parede não é afetado — ali a peça sempre acompanha o ângulo da própria parede.</span>
            <span class="d ${cfg.portaJanelaModoAlinhamento === 'cardinal' ? '' : 'hidden'}" id="mc-porta-modo-desc-cardinal" style="display:block; margin-top:5px">Ao posicionar uma porta/janela solta ("no ar", sem encaixar numa parede), ela fica sempre virada pra uma das 4 direções fixas — Norte por padrão — em vez de acompanhar pra onde você está olhando. O botão do meio do mouse passa a girar em passos de 90°, ciclando Norte → Leste → Sul → Oeste. Encaixada numa parede não é afetado — ali a peça sempre acompanha o ângulo da própria parede.</span>
            <span class="d ${cfg.portaJanelaModoAlinhamento === 'padrao' ? '' : 'hidden'}" id="mc-porta-modo-desc-padrao" style="display:block; margin-top:5px">Ao posicionar uma porta/janela solta ("no ar"), ela acompanha livremente pra onde você está olhando — o botão do meio soma 45° por clique. Comportamento clássico do app, de antes desta opção de alinhamento existir.</span>
          </div>
        </div>
        <!-- Seção "📦 Objeto" (pedido do usuário, 25/08/2026: "Faça o 'Snap
             magnético de grade', tecla modificadora e o 'inverter lógica'
             para os demais objetos também") — MESMA estrutura/semântica do
             bloco de grade da seção 🧱 Parede acima. Ver DEFAULTS acima pro
             significado de cada campo e view3d.js _isObjectGridSnapActiveNow
             pra como é lido. -->
        <div class="mapconfig-section">
          <h4>📦 Objeto</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-objeto-snap-grade-on" ${cfg.objetoSnapGradeAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Snap magnético de grade</span><br><span class="d">Ao posicionar um objeto (longe de qualquer parede), o ponto mirado "gruda" no múltiplo mais próximo do tamanho de grade abaixo. Perto de uma parede continua valendo o encaixe/colisão de "Ignorar física" acima, que tem a palavra final.</span></span>
          </label>
          <label class="field" style="margin-top:8px; margin-left:26px">
            <span class="lbl">Tamanho da grade (cm)</span>
            <input type="number" id="mc-objeto-snap-grade-tam" min="${this.PAREDE_SNAP_GRADE_MIN * 100}" max="${this.PAREDE_SNAP_GRADE_MAX * 100}" step="1"
              value="${Math.round(Utils.clamp(Number(cfg.objetoSnapGradeTamanho) || 0.2, this.PAREDE_SNAP_GRADE_MIN, this.PAREDE_SNAP_GRADE_MAX) * 100)}"
              title="Entre ${this.PAREDE_SNAP_GRADE_MIN * 100}cm e ${this.PAREDE_SNAP_GRADE_MAX * 100}cm">
          </label>
          <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border)">
            <span class="lbl" style="display:block; margin-bottom:5px">Modificador por tecla (hold key)</span>
            <span class="d" style="display:block; margin-bottom:6px">Segurando a tecla escolhida, desliga a grade e libera o objeto em qualquer coordenada — solte a tecla pra voltar ao encaixe.</span>
            <select id="mc-objeto-snap-modificador">
              <option value="shift" ${(cfg.objetoSnapModificador || 'shift') === 'shift' ? 'selected' : ''}>Shift</option>
              <option value="alt" ${cfg.objetoSnapModificador === 'alt' ? 'selected' : ''}>Alt</option>
              <option value="nenhuma" ${cfg.objetoSnapModificador === 'nenhuma' ? 'selected' : ''}>Nenhuma (grade sempre ativa)</option>
            </select>
            <label class="radio-opt" style="margin-top:8px">
              <input type="checkbox" id="mc-objeto-snap-modificador-inverter" ${cfg.objetoSnapModificadorInvertido ? 'checked' : ''}>
              <span><span class="t">Inverter lógica</span><br><span class="d">Com isto ligado, a grade começa DESLIGADA e é a tecla escolhida acima que LIGA o encaixe (em vez de desligar).</span></span>
            </label>
          </div>
          <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border)">
            <label class="field">
              <span class="lbl">Alinhamento ao posicionar solto (fora de cima de uma parede)</span>
              <select id="mc-objeto-modo-alinhamento">
                <option value="personagem" ${(cfg.objetoModoAlinhamento || 'personagem') === 'personagem' ? 'selected' : ''}>Conforme direção do personagem (padrão)</option>
                <option value="cardinal" ${cfg.objetoModoAlinhamento === 'cardinal' ? 'selected' : ''}>Alinhamento cardinal (fixo — botão do meio cicla)</option>
                <option value="padrao" ${cfg.objetoModoAlinhamento === 'padrao' ? 'selected' : ''}>Modo Padrão (livre, acompanha a câmera)</option>
              </select>
            </label>
            <span class="d ${(cfg.objetoModoAlinhamento || 'personagem') === 'personagem' ? '' : 'hidden'}" id="mc-objeto-modo-desc-personagem" style="display:block; margin-top:5px">Ao posicionar um objeto solto (fora de cima de uma parede), ele vira sozinho pra uma das 4 direções fixas — a mais PRÓXIMA de pra onde você está olhando — sem precisar clicar. O botão do meio do mouse também cicla entre as 4 direções, se você quiser uma diferente da automática — mas assim que você virar o bastante pra mudar de direção de novo, volta a acompanhar automaticamente (o clique "reseta" sozinho). Travado numa parede (física) não é afetado — ali o objeto sempre fica paralelo à parede.</span>
            <span class="d ${cfg.objetoModoAlinhamento === 'cardinal' ? '' : 'hidden'}" id="mc-objeto-modo-desc-cardinal" style="display:block; margin-top:5px">Ao posicionar um objeto solto (fora de cima de uma parede), ele fica sempre virado pra uma das 4 direções fixas — Norte por padrão — em vez de acompanhar pra onde você está olhando. O botão do meio do mouse passa a girar em passos de 90°, ciclando Norte → Leste → Sul → Oeste. Travado numa parede (física) não é afetado — ali o objeto sempre fica paralelo à parede.</span>
            <span class="d ${cfg.objetoModoAlinhamento === 'padrao' ? '' : 'hidden'}" id="mc-objeto-modo-desc-padrao" style="display:block; margin-top:5px">Ao posicionar um objeto solto, ele acompanha livremente pra onde você está olhando — o botão do meio soma 45° por clique. Comportamento clássico do app, de antes desta opção de alinhamento existir.</span>
          </div>
        </div>

        <!-- Pedido do usuário (rodada 43): "Estas configurações e
             informações de combinações de cliques que estamos fazendo em
             várias situações devem ficar nas 'configurações 3D' em uma
             seção para isso." Seção só de CONSULTA (sem opção nenhuma pra
             marcar) — reúne num só lugar os atalhos de mouse/teclado da
             navegação normal e do Modelador 3D que foram sendo criados nas
             últimas rodadas, pra não precisar decorar nem ficar perguntando
             de novo. -->
        <div class="mapconfig-section">
          <h4>⌨️🖱️ Atalhos e controles de câmera</h4>
          <span class="d" style="display:block; margin-bottom:8px">Válidos tanto na navegação normal quanto no Modelador 3D, exceto onde indicado.</span>
          <ul style="margin:0 0 0 18px; padding:0; font-size:12.5px; color:var(--text-dim); line-height:1.65">
            <li><b>WASD</b> — andar (navegação normal e Modelador no modo de câmera "Livre").</li>
            <li><b>Setas ↑ / ↓</b> — subir/descer (Modelador, modo de câmera "Livre").</li>
            <li><b>Shift + Espaço</b> — liga/desliga a gravidade. Padrão: ligada na navegação normal; desligada no Modelador (modo "Livre").</li>
            <li><b>Espaço</b> — pular (só com a gravidade ligada e os pés no chão).</li>
            <li><b>Botão do meio do mouse (segurar e arrastar)</b> — gira a câmera; cursor "infinito" (não trava na borda da tela).</li>
            <li><b>Shift + botão do meio (segurar e arrastar)</b> — desloca a câmera lateralmente/verticalmente num plano paralelo à tela, sem girar (igual ao Blender). No Modelador, modo "Órbita": desloca o ponto fixo que a câmera mira, junto com ela.</li>
            <li><b>Botão do meio segurado, no modo de câmera "Livre" do Modelador</b> — deixa o WASD/setas bem mais lento (1/10 da velocidade), pra ajustes finos de posição enquanto olha em volta.</li>
            <li><b>Botão direito (clique simples, sem arrastar)</b> — seleciona, no Modelador.</li>
            <li><b>Botão direito (segurar e arrastar)</b> — também gira a câmera, no Modelador.</li>
            <li><b>Roda do mouse</b> — zoom (modo "Órbita"); anda pra frente/trás na direção da mira (modo "Livre"), no Modelador.</li>
            <li><b>Botão "🎯 Câmera: Orbital" / "🕊️ Câmera: Livre" (barra do Modelador)</b> — alterna entre os dois modos de posicionamento de câmera: "Órbita" sempre mira um ponto fixo (o objeto); "Livre" permite voar pelo cenário livremente, apontando pra qualquer lugar.</li>
          </ul>
        </div>` : ''}

        <button class="btn secondary block" id="mc-close" style="margin-top:12px">Fechar</button>
      </div>`;
    document.body.appendChild(modal);

    // [16/09/2026 UTC] RODADA 99 -- pedido verbatim (item 1b): "Logo abaixo
    // do titulo 'Configuracoes do mapa' [...] coloque botoes de atalho para
    // quando clicar neles ir direto para a posicao no scroll daquela
    // secao." Construido DINAMICAMENTE a partir do DOM ja renderizado (em
    // vez de listar manualmente cada secao no HTML estatico) -- assim
    // reflete automaticamente SO as secoes de verdade presentes no contexto
    // atual (2D ou 3D usam o MESMO template com blocos condicionais
    // `opts.context === '2d'/'3d'`, ver comentarios mais acima), sempre na
    // ordem real em que aparecem, sem risco de a lista de atalhos ficar
    // desatualizada se uma secao for adicionada/removida/reordenada no
    // futuro.
    // [16/09/2026 UTC] RODADA 100 -- REDESENHADO -- pedido verbatim: "deixe
    // apenas o botao da secao com um botao de seta atrelado dropdown para
    // mostrar as subsecoes [...] Para nao ficar abarrotado de botoes." A
    // Rodada 99 criava 1 botao pra CADA `.mapconfig-section` -- em telas
    // com dezenas de subsecoes (ex toda a familia "📏 Trena 3D — ...") isso
    // enchia a barra. Agora as secoes sao AGRUPADAS pelo texto antes de
    // " — " no h4 (ex "📏 Trena 3D — Snap" e "📏 Trena 3D — Pontas" caem no
    // MESMO grupo "📏 Trena 3D"; uma secao cujo h4 nao tem " — " nenhum,
    // ex "🌗 Hora do dia", forma um grupo sozinha). Cada GRUPO vira 1 unico
    // botao na barra: se o grupo tiver so 1 secao, o botao inteiro so faz
    // scroll direto (sem seta). Se tiver 2+ secoes (uma "principal" sem
    // sufixo, tipo "📏 Trena 3D", seguida de N "subsecoes" com sufixo), o
    // botao ganha uma setinha "▾" anexada: clicar no CORPO do botao rola
    // pra 1a secao do grupo (a principal); clicar na seta abre um dropdown
    // listando cada subsecao (rotulo = só o texto depois de " — "), cada
    // uma rolando pra sua propria secao.
    const _mcTocSecoes = Array.from(modal.querySelectorAll('.mapconfig-section'));
    if (_mcTocSecoes.length) {
      const _mcTituloTexto = (sec) => {
        const h4 = sec.querySelector('h4');
        if (!h4) return null;
        const clone = h4.cloneNode(true);
        clone.querySelectorAll('button, svg').forEach((el) => el.remove());
        return clone.textContent.trim() || null;
      };
      // [16/09/2026 UTC] RODADA 100 -- pedido verbatim: "A rolagem deve ser
      // até o título da seção ou subseção ficar do topo visível [...] (não
      // até o corpo abaixo do título [...] como é atualmente)." CAUSA: a
      // Rodada 99 usava `sec.scrollIntoView({block:'start'})` na SECAO
      // INTEIRA -- alinha o topo da propria `.mapconfig-section` (que
      // inclui uma margem/padding antes do `<h4>`) com o topo do viewport
      // de scroll, mas o cabecalho STICKY do modal (`position:sticky`, ver
      // topo de `open()`) fica por CIMA daquele mesmo topo, cobrindo
      // fisicamente o `<h4>` -- o titulo ficava ESCONDIDO atras do
      // cabecalho fixo, dando a impressao de "rolou demais, foi pro corpo".
      // CORRIGIDO -- calcula manualmente o `scrollTop` alvo do `.modal-sheet`
      // (o elemento com scroll de verdade) a partir da posicao REAL do
      // proprio `<h4>` na tela (`getBoundingClientRect`), subtraindo a
      // altura do cabecalho sticky (medida ao vivo, nao um numero fixo) --
      // funciona não importa a altura do cabecalho ou de containers
      // aninhados com overflow, sem depender do comportamento
      // (inconsistente entre navegadores) do `scrollIntoView` com sticky
      // headers.
      // [16/09/2026 UTC] RODADA 101 -- AJUSTADO -- pedido verbatim: "deve
      // 'bater' e parar no topo da caixa (div.mapconfig-section) [...] So o
      // titulo da janela [...] fique acima [...] Devem ficar colados um
      // acima do outro." A Rodada 100 alinhava o `<h4>` (titulo) ao topo, e
      // ainda subtraia 8px extras de folga -- sobrava um gap visivel entre
      // o cabecalho fixo (a caixa de titulo "⚙️ Configuracoes do mapa") e o
      // topo de verdade da `.mapconfig-section` alvo (a propria `h4` fica
      // com `margin:0` mas a SECAO tem padding ANTES dela, entao alinhar o
      // h4 deixa aquele padding "vazando" acima como gap). CORRIGIDO --
      // agora mede o topo da PROPRIA `.mapconfig-section` (nao do `<h4>`
      // interno) e remove a folga de 8px -- o topo da secao encosta
      // diretamente na base do cabecalho fixo, sem gap nenhum, como pedido.
      const _mcScrollParaTitulo = (sec) => {
        const sheetEl = modal.querySelector('.modal-sheet');
        const cabecalhoSticky = modal.querySelector('.mapconfig-sheet > div');
        if (!sec || !sheetEl) return;
        const alturaSticky = cabecalhoSticky?.getBoundingClientRect().height || 0;
        const sheetRect = sheetEl.getBoundingClientRect();
        const secRect = sec.getBoundingClientRect();
        const delta = secRect.top - sheetRect.top;
        const alvo = sheetEl.scrollTop + delta - alturaSticky;
        sheetEl.scrollTo({ top: Math.max(0, alvo), behavior: 'smooth' });
      };
      // Agrupa as seções por "título principal" (texto antes de " — ").
      const _mcGrupos = [];
      _mcTocSecoes.forEach((sec, i) => {
        const titulo = _mcTituloTexto(sec);
        if (!titulo) return;
        if (!sec.id) sec.id = `mc-toc-secao-${i}`;
        const partes = titulo.split(' — ');
        const principal = partes[0].trim();
        const sufixo = partes.length > 1 ? partes.slice(1).join(' — ').trim() : null;
        let grupo = _mcGrupos[_mcGrupos.length - 1];
        if (!grupo || grupo.principal !== principal) {
          grupo = { principal, itens: [] };
          _mcGrupos.push(grupo);
        }
        grupo.itens.push({ sec, sufixo, tituloCompleto: titulo });
      });
      const _mcTocNav = document.createElement('div');
      _mcTocNav.className = 'mapconfig-toc';
      _mcTocNav.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin:0 0 14px; position:relative;';
      // Fecha qualquer dropdown aberto ao clicar fora da barra de atalhos.
      const _mcFecharDropdowns = () => { _mcTocNav.querySelectorAll('.mapconfig-toc-dropdown').forEach((d) => { d.style.display = 'none'; }); };
      document.addEventListener('mousedown', (e) => { if (!_mcTocNav.contains(e.target)) _mcFecharDropdowns(); });
      _mcGrupos.forEach((grupo) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative; display:inline-flex;';
        const btnPrincipal = document.createElement('button');
        btnPrincipal.type = 'button';
        btnPrincipal.className = 'btn sm secondary';
        btnPrincipal.textContent = grupo.principal;
        btnPrincipal.style.cssText = `font-size:11px; padding:4px 8px; white-space:nowrap;${grupo.itens.length > 1 ? ' border-top-right-radius:0; border-bottom-right-radius:0;' : ''}`;
        btnPrincipal.addEventListener('click', () => { _mcFecharDropdowns(); _mcScrollParaTitulo(grupo.itens[0].sec); });
        wrap.appendChild(btnPrincipal);
        if (grupo.itens.length > 1) {
          const btnSeta = document.createElement('button');
          btnSeta.type = 'button';
          btnSeta.className = 'btn sm secondary';
          btnSeta.textContent = '▾';
          btnSeta.title = `Ver subseções de "${grupo.principal}"`;
          btnSeta.style.cssText = 'font-size:11px; padding:4px 6px; border-left:1px solid rgba(255,255,255,0.15); border-top-left-radius:0; border-bottom-left-radius:0;';
          const dropdown = document.createElement('div');
          dropdown.className = 'mapconfig-toc-dropdown';
          // [16/09/2026 UTC] RODADA 101 -- pedido verbatim: "O dropdown do
          // botao de atalho deve ter scroll caso precise." Ja havia
          // `overflow-y:auto` desde a Rodada 100, mas com `max-height` mais
          // apertado (260px) -- aumentado pra 340px (mais espaço antes de
          // precisar rolar, ainda cabendo confortavelmente dentro da altura
          // tipica do modal) e documentado explicitamente que a intencao E
          // ter scroll interno pra familias de subsecoes longas (ex "📏
          // Trena 3D", com muitas subsecoes) em vez de estourar a tela.
          dropdown.style.cssText = 'display:none; position:absolute; top:100%; left:0; margin-top:4px; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.4); z-index:5; min-width:180px; max-height:340px; overflow-y:auto; padding:4px;';
          grupo.itens.forEach((item) => {
            const opt = document.createElement('button');
            opt.type = 'button';
            opt.className = 'btn sm secondary';
            opt.style.cssText = 'display:block; width:100%; text-align:left; font-size:11px; padding:6px 8px; margin:1px 0; white-space:nowrap; background:transparent; border:none;';
            opt.textContent = item.sufixo || item.tituloCompleto;
            opt.addEventListener('click', () => { dropdown.style.display = 'none'; _mcScrollParaTitulo(item.sec); });
            dropdown.appendChild(opt);
          });
          btnSeta.addEventListener('click', (e) => {
            e.stopPropagation();
            const aberto = dropdown.style.display !== 'none';
            _mcFecharDropdowns();
            dropdown.style.display = aberto ? 'none' : 'block';
          });
          wrap.appendChild(btnSeta);
          wrap.appendChild(dropdown);
        }
        _mcTocNav.appendChild(wrap);
      });
      const _mcCabecalho = modal.querySelector('.mapconfig-sheet > div');
      _mcCabecalho?.after(_mcTocNav);
    }

    // [13/09/2026 UTC] Limpa o loop de animação do globo (requestAnimationFrame)
    // e o intervalo de refresh do relógio real/mundo ao fechar o painel —
    // sem isso o RAF do globo continuaria rodando pra sempre em segundo
    // plano depois do modal ser removido do DOM.
    // [13/09/2026 UTC] Pedido: "o globinho... e a barra da 'Trilha de
    // horas do dia' devem acompanhar simultaneamente [o relógio do
    // mundo]." Reduzido de 15s pra 1s — com 15s entre atualizações, o
    // globo (que anima suavemente até o ângulo alvo, ver `setHora`) e a
    // trilha davam a impressão de ficar "pulando" em saltos grandes, em
    // vez de acompanhar o relógio em tempo real.
    // [16/09/2026 UTC] RODADA 99 -- CORRIGIDO bug verbatim: "ao clicar em
    // 'Seguir relogio do mundo', depois de uns 2s, ele se deseleciona
    // sozinho." CAUSA RAIZ: este intervalo lia `cfg.horaDoDiaManual` -- mas
    // `cfg` eh uma CONST capturada 1 UNICA VEZ no momento em que o modal foi
    // aberto (topo de `open()`), nunca atualizada depois. Clicar no botao
    // "Seguir relogio do mundo" chama `onCommit('mundo')` -> `this.set(...)`,
    // que grava em `this._cache` (o estado de VERDADE, sempre atual) mas
    // NAO muda a variavel local `cfg` -- ela continua congelada no valor de
    // quando o modal abriu (tipicamente `null`, "automatico"). A cada
    // 1000ms este intervalo chamava `horaWidgetApi.setHora(cfg.horaDoDiaManual)`
    // com esse valor CONGELADO, e `setHora` reexecuta `syncUI(valor)`, que
    // reescreve o texto/estado "(ativo)" dos botoes "Seguir relogio do
    // mundo"/"Seguir relogio do aparelho" a partir do valor recebido --
    // ou seja, o proprio refresh periodico desfazia visualmente a escolha
    // do usuario a cada segundo, sempre voltando pro estado de quando o
    // modal foi aberto (percebido como "se desseleciona sozinho" no
    // primeiro tick seguinte ao clique, ~1-2s depois). CORRIGIDO -- passa a
    // ler `this._cache.horaDoDiaManual` (o valor ATUAL de verdade, mantido
    // em dia por `set()`/`previewSet()`) em vez da `cfg` congelada.
    const _globoRefreshInterval = setInterval(() => {
      const horaAtual = this._cache?.horaDoDiaManual;
      if (horaAtual == null || horaAtual === 'mundo') horaWidgetApi?.setHora(horaAtual);
    }, 1000);
    const close = () => { opts.onClose?.(); clearInterval(_globoRefreshInterval); horaWidgetApi?.destroy(); this._trena3DResyncCleanup?.(); this._trena3DResyncCleanup = null; modal.remove(); };
    modal.querySelector('#mc-close').onclick = close;
    modal.querySelector('#mc-close-top').onclick = close; // NOVO (07/09/2026) — ✕ do cabeçalho fixo, ver comentário na criação do HTML
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    // [16/09/2026 UTC] NOVO — botão do cabeçalho que liga/desliga a seleção
    // de texto das opções/descrições em "Configurações 3D" (ver criação do
    // HTML acima, 'mc3dTextoSelecionavel'/'.mapconfig-sheet--selecionavel'
    // em css/style.css). Persistido numa chave própria "solta" no DB (mesmo
    // padrão de 'fotosMarcarAquiAcao'), lida de novo a cada abertura do
    // modal — não precisa re-renderizar o modal inteiro pra refletir a
    // mudança, só alterna a classe no elemento já na tela e atualiza
    // ícone/título/'aria-pressed' do próprio botão.
    modal.querySelector('#mc-toggle-selecionavel')?.addEventListener('click', async (e) => {
      const sheetEl = modal.querySelector('.mapconfig-sheet');
      const ativo = !sheetEl.classList.contains('mapconfig-sheet--selecionavel');
      sheetEl.classList.toggle('mapconfig-sheet--selecionavel', ativo);
      e.currentTarget.textContent = ativo ? '🔓' : '🔒';
      e.currentTarget.title = ativo ? 'Desativar seleção de texto das opções/descrições' : 'Ativar seleção de texto das opções/descrições';
      e.currentTarget.setAttribute('aria-pressed', ativo ? 'true' : 'false');
      await DB.setSetting('mapconfig3DTextoSelecionavel', ativo);
    });

    modal.querySelector('#mc-dup-itens-colar').onchange = async (e) => { await this.set({ duplicarItensAoColar: e.target.checked }); };
    // [15/09/2026 UTC] NOVO — seção "🗺️ Mapa 2D" (ver HTML acima).
    modal.querySelector('#mc-mapa2d-origem-mundo')?.addEventListener('change', async (e) => { await this.set({ mapa2dMostrarOrigemMundo: e.target.checked }); });
    modal.querySelector('#mc-miniatura3d')?.addEventListener('change', async (e) => { await this.set({ miniatura3DAtiva: e.target.checked }); });
    // NOVO (07/09/2026) — ver DEFAULTS.miniatura3DFecharAoSairMapa acima.
    modal.querySelector('#mc-miniatura3d-fechar-ao-sair')?.addEventListener('change', async (e) => { await this.set({ miniatura3DFecharAoSairMapa: e.target.checked }); });
    // [16/09/2026 UTC] NOVO — os 2 checkboxes (Configurações 2D e 3D) leem/
    // escrevem o MESMO campo `trena3DPainelRapidoAtivo` — cada um, ao mudar,
    // sincroniza o outro na hora (sem precisar fechar/reabrir a folha).
    const mc2dPainelRapido = modal.querySelector('#mc-trena3d-painel-rapido');
    const mc3dPainelRapido = modal.querySelector('#mc-trena3d-painel-rapido-3d');
    mc2dPainelRapido?.addEventListener('change', async (e) => {
      if (mc3dPainelRapido) mc3dPainelRapido.checked = e.target.checked;
      await this.set({ trena3DPainelRapidoAtivo: e.target.checked });
    });
    mc3dPainelRapido?.addEventListener('change', async (e) => {
      if (mc2dPainelRapido) mc2dPainelRapido.checked = e.target.checked;
      await this.set({ trena3DPainelRapidoAtivo: e.target.checked });
    });
    // [16/09/2026 UTC] NOVO (RODADA 91) — modo de exibição da janelinha
    // ('agrupado' com rótulo de texto | 'simples' só com contornos). Ver
    // DEFAULTS/view3d.js '_trena3DAtualizarPainelRapido'.
    modal.querySelectorAll('input[name="mc-trena3d-painel-rapido-modo"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DPainelRapidoModo: e.target.value }); });
    });
    // [16/09/2026 UTC] NOVO — "Janela de acesso rápido" — chips. Pedido
    // verbatim: "deve ser possível selecionar os botões e a ordem em que
    // eles vão ficar na janela [...] reaproveitado" o sistema de FLIP já
    // modularizado em js/flip.js (mesmo usado por "Ver lista simples" →
    // "Partes de informação em cada linha"). `window.View3D` já é acessado
    // direto por este arquivo noutros lugares (ver comentários grandes de
    // preview 3D acima) — usado aqui só pra ler a lista "de código" das
    // opções da janelinha (`_trena3DOpcoesPainelRapido`), sem duplicá-la.
    (() => {
      const prChipsBox = modal.querySelector('#mc-trena3d-pr-chips');
      if (!prChipsBox || !window.View3D) return;
      const opcoesTodas = window.View3D._trena3DOpcoesPainelRapido();
      const porCampo = new Map(opcoesTodas.map((o) => [o.campo, o]));
      const construirListaOrdenada = () => {
        const ordemSalva = (this._cache.trena3DPainelRapidoOrdem && this._cache.trena3DPainelRapidoOrdem.length)
          ? this._cache.trena3DPainelRapidoOrdem
          : opcoesTodas.map((o) => o.campo);
        const restantes = new Map(porCampo);
        const lista = [];
        ordemSalva.forEach((campo) => {
          const o = restantes.get(campo);
          if (o) { lista.push(o); restantes.delete(campo); }
        });
        // Opções novas, sem posição salva ainda — entram no final, na
        // mesma ordem relativa que já tinham na lista de código (mesmo
        // raciocínio de `_trena3DOpcoesPainelRapidoEfetivas`, view3d.js).
        opcoesTodas.forEach((o) => { if (restantes.has(o.campo)) lista.push(o); });
        return lista;
      };
      const commitPrOrdem = async () => {
        const ordemDom = [...prChipsBox.children].map((c) => c.dataset.campo);
        await this.set({ trena3DPainelRapidoOrdem: ordemDom });
      };
      const prSortable = Flip.makeSortable(prChipsBox, {
        itemSelector: '.lb-campo-chip',
        ignoreSelector: '.mc-trena3d-pr-chk',
        draggingClass: 'lb-campo-chip-dragging',
        axis: 'auto',
        onDrop: () => commitPrOrdem(),
      });
      const renderPrChips = () => {
        const ocultosAtuais = new Set(this._cache.trena3DPainelRapidoOcultos || []);
        prChipsBox.innerHTML = construirListaOrdenada().map((o) => {
          const iconeHtml = o.svgIcone || Utils.escapeHtml(o.icone || '');
          const tituloResumo = (o.titulo || '').split(' (')[0];
          return `
          <div class="lb-campo-chip" data-campo="${Utils.escapeHtml(o.campo)}" title="${Utils.escapeHtml(o.titulo)} — arraste ⠿ para reordenar">
            <span class="lb-campo-chip-handle">⠿</span>
            <label class="lb-campo-chip-label">
              <input type="checkbox" class="mc-trena3d-pr-chk" ${ocultosAtuais.has(o.campo) ? '' : 'checked'}>
              <span style="display:inline-flex; align-items:center; gap:4px">${iconeHtml} ${Utils.escapeHtml(tituloResumo)}</span>
            </label>
          </div>`;
        }).join('');
        prChipsBox.querySelectorAll('.lb-campo-chip').forEach((chip) => {
          const campo = chip.dataset.campo;
          chip.querySelector('.mc-trena3d-pr-chk').onchange = async (e) => {
            const ocultos = new Set(this._cache.trena3DPainelRapidoOcultos || []);
            if (e.target.checked) ocultos.delete(campo); else ocultos.add(campo);
            await this.set({ trena3DPainelRapidoOcultos: [...ocultos] });
          };
          prSortable.attach(chip);
        });
      };
      renderPrChips();
    })();
    // [RODADA 130] Editor visual dos GRUPOS de espessura/cor da janelinha —
    // mesma técnica do bloco de chips acima (Flip.makeSortable + checkbox de
    // visibilidade), mas cada "chip" aqui é o PRÓPRIO HTML real do grupo
    // (`View3D._trena3DHtmlGrupoAjuste`) — mesmos color pickers e "botão
    // triplo" que aparecem na janelinha, ligados de verdade (mudar a cor
    // aqui já aplica no cenário 3D, igual mudar na janelinha ou no resto
    // desta subseção). `idPrefixo` diferente (`'mc-trena3d-pr-grupo-'`) evita
    // colidir com os `id`s da janelinha real, que pode estar aberta ao mesmo
    // tempo (Ver em 3D + Configurações 3D simultâneos).
    (() => {
      const gruposBox = modal.querySelector('#mc-trena3d-pr-grupos');
      if (!gruposBox || !window.View3D) return;
      const idPrefixo = 'mc-trena3d-pr-grupo-';
      const todosGrupos = window.View3D._trena3DGruposAjustesPainelRapido();
      const porChave = new Map(todosGrupos.map((g) => [g.chave, g]));
      const construirListaOrdenada = () => {
        const ordemSalva = (this._cache.trena3DPainelRapidoOrdemGrupos && this._cache.trena3DPainelRapidoOrdemGrupos.length)
          ? this._cache.trena3DPainelRapidoOrdemGrupos
          : todosGrupos.map((g) => g.chave);
        const restantes = new Map(porChave);
        const lista = [];
        ordemSalva.forEach((chave) => {
          const g = restantes.get(chave);
          if (g) { lista.push(g); restantes.delete(chave); }
        });
        todosGrupos.forEach((g) => { if (restantes.has(g.chave)) lista.push(g); });
        return lista;
      };
      const commitOrdemGrupos = async () => {
        const ordemDom = [...gruposBox.children].map((c) => c.dataset.grupoChave);
        await this.set({ trena3DPainelRapidoOrdemGrupos: ordemDom });
      };
      // [RODADA 133/134] CORRIGIDO -- ignora só os controles que precisam do
      // próprio clique (cor, campo numérico "botão triplo" `.m3d-numfield`,
      // botão de texto) -- o resto da linha (rótulo + espaço vazio) inicia
      // o arraste normalmente, em vez de só o pequeno "⠿".
      const gruposSortable = Flip.makeSortable(gruposBox, {
        itemSelector: '.mc-trena3d-pr-grupo-item',
        ignoreSelector: '.mc-trena3d-pr-grupo-chk, input[type="color"], .m3d-numfield, .m3d-numfield *, .v3d-pr-aj-texto-btn',
        draggingClass: 'lb-campo-chip-dragging',
        axis: 'auto',
        onDrop: () => commitOrdemGrupos(),
      });
      const renderGrupos = () => {
        const ocultosAtuais = new Set(this._cache.trena3DPainelRapidoGruposOcultos || []);
        gruposBox.innerHTML = construirListaOrdenada().map((g) => `
          <div class="mc-trena3d-pr-grupo-item" data-grupo-chave="${g.chave}" style="display:flex; align-items:center; gap:6px; margin:4px 0; padding:4px 6px; border:1px solid rgba(255,255,255,0.08); border-radius:6px; background:rgba(255,255,255,0.03)">
            <span class="lb-campo-chip-handle" title="Arraste ⠿ para reordenar" style="cursor:grab; flex:0 0 auto">⠿</span>
            <label style="display:flex; align-items:center; gap:4px; flex:0 0 auto" title="Mostrar/esconder este grupo na janelinha">
              <input type="checkbox" class="mc-trena3d-pr-grupo-chk" ${ocultosAtuais.has(g.chave) ? '' : 'checked'}>
            </label>
            <div style="flex:1 1 auto; min-width:0">${window.View3D._trena3DHtmlGrupoAjuste(g, idPrefixo)}</div>
          </div>`).join('');
        gruposBox.querySelectorAll('.mc-trena3d-pr-grupo-item').forEach((item) => {
          const chave = item.dataset.grupoChave;
          item.querySelector('.mc-trena3d-pr-grupo-chk').onchange = async (e) => {
            const ocultos = new Set(this._cache.trena3DPainelRapidoGruposOcultos || []);
            if (e.target.checked) ocultos.delete(chave); else ocultos.add(chave);
            await this.set({ trena3DPainelRapidoGruposOcultos: [...ocultos] });
          };
          gruposSortable.attach(item);
        });
        // Liga os controles reais (espessura/cor) de cada grupo — mesmo
        // wiring da janelinha, reaproveitado tal e qual.
        window.View3D._trena3DWireAjustesPainelRapido(gruposBox, construirListaOrdenada(), idPrefixo);
        window.View3D._trena3DResyncAjustesPainelRapido(gruposBox, construirListaOrdenada(), idPrefixo);
      };
      renderGrupos();
      // [RODADA 134] NOVO -- pedido verbatim: "ao mudar os valores nos
      // botões da janelinha da 'Trena 3D', os valores na subseção da
      // janelinha deve mudar de forma recíproca e imediatamente." O sentido
      // "modal -> janelinha real" já funcionava (a janelinha real escuta
      // `MapConfig.onChange` e resincroniza sozinha, ver view3d.js
      // `_onMapConfigChange`/`_trena3DAtualizarPainelRapido`) -- faltava o
      // sentido inverso: esta lista (dentro do modal) nunca escutava
      // `MapConfig.onChange`, só resincronizava no instante em que o modal
      // abria. Corrigido: resincroniza os valores (espessura/cor/texto) de
      // cada grupo aqui também, toda vez que a config mudar por fora
      // (inclusive pelos botões da janelinha real) enquanto o modal
      // estiver aberto. Não refaz a ORDEM/visibilidade (isso só muda por
      // arraste/checkbox dentro deste próprio editor, não pela janelinha),
      // só os valores dos controles já desenhados — mais barato e evita
      // interromper um arraste em andamento.
      const gruposOnExternalChange = () => {
        if (!gruposBox.isConnected) return;
        window.View3D._trena3DResyncAjustesPainelRapido(gruposBox, construirListaOrdenada(), idPrefixo);
      };
      MapConfig.onChange(gruposOnExternalChange);
      this._trena3DPrGruposOnChangeCleanup = () => MapConfig.offChange(gruposOnExternalChange);
    })();
    // BUG CORRIGIDO (05/09/2026), pedido verbatim — teste do usuário:
    // "desabilitei o Retículo métrico e desabilitei a Trena, depois,
    // habilitei a Trena e o Retículo métrico apareceu junto." Causa raiz:
    // cada handler de mudança fazia `{ ...(cfg.ferramentasNavVisiveis||{}),
    // [chave]: checked }` — mas `cfg` é a foto ÚNICA lida no INSTANTE em
    // que o painel abriu (topo de open()), nunca atualizada depois. Ao
    // desmarcar "Retículo métrico" (grava reticulo:false, `this._cache` já
    // reflete isso) e DEPOIS desmarcar "Trena", o segundo handler ainda
    // espalhava o `cfg` ORIGINAL (com reticulo:true, de antes de QUALQUER
    // mudança nesta sessão do painel) por cima — reescrevendo
    // reticulo:true de volta sem querer, junto da mudança de verdade
    // (regua:false). Cada checkbox subsequente "ressuscitava" o valor
    // ORIGINAL de todos os outros. Corrigido lendo o estado ATUAL
    // (`this._cache`, sempre mantido em dia por `set()`, ver `get()`
    // acima) em vez do `cfg` fechado — agora cada toggle só mexe na SUA
    // própria chave, nunca reverte as demais. Mesmo padrão pros botões do
    // cabeçalho (`botoesCabecalhoNavVisiveis`) logo abaixo, que tinha o
    // MESMO bug em potencial (não relatado, mas idêntico por construção).
    MapConfig.NAV_TOOLS.forEach(({ id, chave }) => {
      modal.querySelector('#mc-nav-' + id)?.addEventListener('change', async (e) => {
        await this.set({ ferramentasNavVisiveis: { ...(this._cache?.ferramentasNavVisiveis || {}), [chave]: e.target.checked } });
      });
    });
    MapConfig.NAV_HEADER_BUTTONS.forEach(({ chave }) => {
      modal.querySelector('#mc-navhdr-' + chave)?.addEventListener('change', async (e) => {
        await this.set({ botoesCabecalhoNavVisiveis: { ...(this._cache?.botoesCabecalhoNavVisiveis || {}), [chave]: e.target.checked } });
      });
    });
    // NOVO (05/09/2026) — radios da nova seção "🧭 Modo Navegação" (ação
    // padrão da Régua/Grade ao LIGAR "Modo Navegação", ver
    // DEFAULTS.modoNavReguaAcao/modoNavGradeAcao).
    // NOVO (06/09/2026) — seção "📍 Fotos" (ver HTML acima) — gravado DIRETO
    // via DB.setSetting (chave `fotosMarcarAquiAcao`), fora do `this.set()`/
    // blob `mapa3dConfig` que o resto deste modal usa (mesmo padrão de
    // `mapa2dSnapGrade`, ver comentário grande onde `fotosMarcarAquiAcao` é
    // lida, no topo de `open()`).
    modal.querySelectorAll('input[name="mc-fotos-marcar-aqui"]').forEach((r) => {
      r.addEventListener('change', async (e) => { if (e.target.checked) await DB.setSetting('fotosMarcarAquiAcao', e.target.value); });
    });
    modal.querySelectorAll('input[name="mc-modonav-regua"]').forEach((r) => {
      r.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ modoNavReguaAcao: e.target.value }); });
    });
    modal.querySelectorAll('input[name="mc-modonav-grade"]').forEach((r) => {
      r.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ modoNavGradeAcao: e.target.value }); });
    });
    modal.querySelectorAll('input[name="mc-redraw2d"]').forEach((r) => {
      r.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ desempenho2DModoRedesenho: e.target.value }); });
    });
    modal.querySelector('#mc-doublebuffer')?.addEventListener('change', async (e) => { await this.set({ desempenho2DBufferSecundario: e.target.checked }); });
    modal.querySelectorAll('input[name="mc-camada3d"]').forEach((r) => {
      r.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ camada3DNovosItens: e.target.value }); });
    });
    // [12/09/2026 — FUNDIDA NESTA RODADA] a seção "Câmera"/"Orb de câmera"
    // virou 1 seção só ("Ver através desta câmera", ver HTML acima e nota
    // grande em DEFAULTS.cameraExitViewMode) — 1 único grupo de radios
    // (data-exitview-group="camera"), 1 única chave (cameraExitViewMode).
    modal.querySelectorAll('input[data-exitview-group="camera"]').forEach((r) => {
      r.addEventListener('change', async (e) => {
        if (!e.target.checked) return;
        await this.set({ cameraExitViewMode: e.target.value });
      });
    });
    modal.querySelectorAll('input[name="mc-fisica-colocacao"]').forEach((r) => {
      r.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ ignorarFisica: e.target.value === 'livre' }); });
    });
    modal.querySelector('#mc-raycast-on')?.addEventListener('change', async (e) => { await this.set({ raycastEnabled: e.target.checked }); });
    modal.querySelector('#mc-raycast-style')?.addEventListener('change', async (e) => { await this.set({ raycastHighlightStyle: e.target.value }); });
    modal.querySelector('#mc-raycast-precision')?.addEventListener('change', async (e) => { await this.set({ raycastPrecision: e.target.value }); });
    modal.querySelector('#mc-itemassoc-contorno')?.addEventListener('change', async (e) => { await this.set({ itemAssociado3DContorno: e.target.checked }); });
    modal.querySelector('#mc-itemassoc-selo')?.addEventListener('change', async (e) => { await this.set({ itemAssociado3DSelo: e.target.value }); });
    modal.querySelector('#mc-destaque-extra-raio-3d')?.addEventListener('change', async (e) => { await this.set({ destaqueExtra3DRaioAtivo: e.target.checked }); });
    modal.querySelector('#mc-destaque-extra-dourado-3d')?.addEventListener('change', async (e) => { await this.set({ destaqueExtra3DDouradoAtivo: e.target.checked }); });
    modal.querySelector('#mc-objeto-transparencia-2d')?.addEventListener('change', async (e) => { await this.set({ objetoTransparencia2DAtivo: e.target.checked }); });
    modal.querySelector('#mc-destaque-extra-dourado-2d')?.addEventListener('change', async (e) => { await this.set({ destaqueExtra2DDouradoAtivo: e.target.checked }); });
    modal.querySelector('#mc-destaque-extra-raio-2d')?.addEventListener('change', async (e) => { await this.set({ destaqueExtra2DRaioAtivo: e.target.checked }); });
    modal.querySelector('#mc-atravesparedes-plaquinha')?.addEventListener('change', async (e) => { await this.set({ itemBadge3DAtravesParedesAtivo: e.target.checked }); });
    modal.querySelector('#mc-atravesparedes-dourado')?.addEventListener('change', async (e) => { await this.set({ anelDourado3DAtravesParedesAtivo: e.target.checked }); });
    modal.querySelector('#mc-atravesparedes-raio')?.addEventListener('change', async (e) => { await this.set({ raioAzul3DAtravesParedesAtivo: e.target.checked }); });
    modal.querySelector('#mc-medida-setas')?.addEventListener('change', async (e) => { await this.set({ medidaSetasAtivo: e.target.checked }); });
    modal.querySelector('#mc-medida-circulo')?.addEventListener('change', async (e) => { await this.set({ medidaCirculoAposInserirAtivo: e.target.checked }); });
    modal.querySelector('#mc-medida-reposicionar')?.addEventListener('change', async (e) => { await this.set({ medidaReposicionarExtremidadesAtivo: e.target.checked }); });
    modal.querySelector('#mc-traco-foto-reposicionar')?.addEventListener('change', async (e) => { await this.set({ tracoFotoReposicionarExtremidadesAtivo: e.target.checked }); });
    // NOVO (03/09/2026) — seção "📏 Trena" (ver HTML acima).
    modal.querySelector('#mc-medida2d-reposicionar')?.addEventListener('change', async (e) => { await this.set({ medida2DReposicionarExtremidadesAtivo: e.target.checked }); });
    // NOVO (04/09/2026) — seção "✏️ Traço guia" (ver HTML acima).
    modal.querySelector('#mc-traco2d-reposicionar')?.addEventListener('change', async (e) => { await this.set({ traco2DReposicionarExtremidadesAtivo: e.target.checked }); });
    // NOVO (07/09/2026) — seção "🔄 Rotação do mapa 2D" (ver HTML acima):
    // os 3 botões de girar chamam DIRETO os métodos já existentes em
    // MapView (mesmos usados pelo canto inferior direito da grade) e depois
    // atualizam o campo "Rotação atual" pra refletir o novo valor — só faz
    // sentido enquanto o mapa 2D está de fato montado (`opts.context ===
    // '2d'`, ver comentário grande no HTML), então `window.MapView?.` é só
    // uma precaução extra (nunca deveria faltar aqui).
    const rot2dAtualInput = modal.querySelector('#mc-rot2d-atual');
    const syncRot2dAtual = () => {
      if (!rot2dAtualInput) return;
      const graus = Math.round(((window.MapView?._renderer?.view?.rot || 0) * 180 / Math.PI));
      rot2dAtualInput.value = graus;
    };
    modal.querySelector('#mc-rot2d-north')?.addEventListener('click', () => { window.MapView?._giroMapa2DResetarNorte?.(); syncRot2dAtual(); });
    modal.querySelector('#mc-rot2d-ccw')?.addEventListener('click', () => { window.MapView?._giroMapa2DAntihorario?.(); syncRot2dAtual(); });
    modal.querySelector('#mc-rot2d-cw')?.addEventListener('click', () => { window.MapView?._giroMapa2DHorario?.(); syncRot2dAtual(); });
    // "Rotação atual" editável direto — grava em `view.rot` (radianos) na hora.
    rot2dAtualInput?.addEventListener('input', (e) => {
      if (!window.MapView?._renderer) return;
      const graus = parseFloat(e.target.value);
      if (!Number.isFinite(graus)) return;
      window.MapView._renderer.view.rot = graus * Math.PI / 180;
    });
    // "🔄 Girar arrastando" — mesmo toggle do botão do canto inferior
    // direito (ver mapview.js _toggleMapDragRotate); espelha o estado
    // "active" aqui também, pro botão dentro do modal refletir se o modo já
    // estava ligado (ex.: a pessoa abriu as configurações COM o modo já
    // ativo de antes).
    const dragModeBtn = modal.querySelector('#mc-rot2d-dragmode');
    if (dragModeBtn) dragModeBtn.classList.toggle('active', !!window.MapView?._mapDragRotateAtivo);
    // BUG CORRIGIDO (07/09/2026), pedido verbatim: "o botão 'Girar
    // arrastando' ao ser clicado, deve fazer a janela de 'configurações 2D'
    // ficar ocultada e ser possível girar o mapa com o 'clicar e arrastar'.
    // Ao 'soltar', conclui-se o giro e a janela [...] ressurge, no mesmo
    // nível de rolagem que estava [...] ela não é recriada [...] Este
    // processo é só para quando se acessa o botão 'Girar arrastando' pela
    // janela de 'configurações 2D'. Se o botão [...] for ativado no seu
    // local no canto inferior direito da grade, então, continua procedendo
    // normalmente [toggle liga/desliga de sempre]." CAUSA: antes, este
    // botão só fazia o MESMO toggle liga/desliga do botão do canto da
    // grade — clicar aqui ligava o modo, mas o modal continuava por cima
    // cobrindo a grade inteira, então "clicar e arrastar" nunca alcançava o
    // mapa de verdade por trás (o pedido do usuário é justamente resolver
    // isso). Corrigido: um clique aqui que LIGA o modo agora (não um que
    // desliga — ver `jaAtivo` abaixo) esconde o `.modal-backdrop` INTEIRO
    // via `style.display='none'` (NÃO `.remove()`/fechar — o DOM do modal
    // continua vivo, só invisível, preservando o `scrollTop` de
    // `.modal-sheet`) até o `pointerup`/`pointercancel` GLOBAL seguinte,
    // quando desliga o modo de novo e reexibe o modal restaurando aquele
    // scroll exato.
    dragModeBtn?.addEventListener('click', () => {
      const jaAtivo = !!window.MapView?._mapDragRotateAtivo;
      window.MapView?._toggleMapDragRotate?.();
      const agoraAtivo = !!window.MapView?._mapDragRotateAtivo;
      dragModeBtn.classList.toggle('active', agoraAtivo);
      if (jaAtivo || !agoraAtivo) return; // este clique DESLIGOU o modo (ou algo incoerente) — comportamento normal de toggle, sem esconder nada
      const sheetEl = modal.querySelector('.modal-sheet');
      const scrollTop = sheetEl?.scrollTop || 0;
      modal.style.display = 'none';
      const restaurar = () => {
        window.removeEventListener('pointerup', restaurar, true);
        window.removeEventListener('pointercancel', restaurar, true);
        if (window.MapView?._mapDragRotateAtivo) window.MapView._toggleMapDragRotate?.();
        modal.style.display = '';
        if (sheetEl) sheetEl.scrollTop = scrollTop;
        dragModeBtn.classList.toggle('active', !!window.MapView?._mapDragRotateAtivo);
        syncRot2dAtual();
      };
      window.addEventListener('pointerup', restaurar, true);
      window.addEventListener('pointercancel', restaurar, true);
    });
    // Botão de snap de rotação (1°–180°) — ver _wireMapRotationSnapBtn abaixo.
    this._wireMapRotationSnapBtn(modal.querySelector('#mc-rot2d-snap-btn'));
    // NOVO (07/09/2026) — checkbox "Habilitar snap de rotação" (ver HTML
    // acima) — espelha/sincroniza com o 5º botão da bandeja do canto
    // inferior direito da grade (#map-rotate-snap-toggle, ver mapview.js
    // _setMapRotationSnapAtivo, que já cuida de gravar no DB e sincronizar
    // o outro lado sozinho).
    modal.querySelector('#mc-rot2d-snap-toggle')?.addEventListener('change', (e) => {
      window.MapView?._setMapRotationSnapAtivo?.(e.target.checked);
    });
    // ITEM A1 (rodada 57/v311)
    modal.querySelector('#mc-foto-fmt-atual')?.addEventListener('change', async (e) => { await this.set({ fotoDownloadFormatoAtual: e.target.value }); });
    modal.querySelector('#mc-foto-fmt-todas')?.addEventListener('change', async (e) => { await this.set({ fotoDownloadFormatoTodas: e.target.value }); });

    // RODADA 53 [15/09/2026 UTC] — item B: as 3 opções de atribuição
    // automática de Câmera à foto (ver DEFAULTS.fotoAutoAtribuirCamera).
    modal.querySelectorAll('input[name="mc-foto-auto-camera"]').forEach((r) => {
      r.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ fotoAutoAtribuirCamera: e.target.value }); });
    });
    // [15/09/2026 UTC] NOVO — checkbox "Evitar colocar em cima de objetos"
    // (ver DEFAULTS.fotoGradeEvitarColisao e capture.js _autoPlacePhoto).
    modal.querySelector('#mc-foto-grade-evitar-colisao')?.addEventListener('change', async (e) => {
      await this.set({ fotoGradeEvitarColisao: !!e.target.checked });
    });
    // RODADA 53/54 [15/09/2026 UTC] — item C (parâmetros da grade). O
    // preview agora usa o MESMO Mapping.findGridSlot usado de verdade na
    // captura (capture.js _autoPlacePhoto), em vez de reimplementar o
    // cálculo aqui — garante que o desenho reflete exatamente o resultado
    // real, inclusive a direção/quebra escolhidas (RODADA 54).
    // [15/09/2026 UTC] MUDADO -- pedido verbatim (2ª correção): "o ícone
    // que deve aparecer na disposição de exemplo é o ícone do bola com a
    // ícone de foto e a seta verde (mesma desenho que aparece na grade ao
    // ir na janela de 'Ferramentas', clicar na ferramenta 'Câmera' e
    // inserir uma câmera na grade [...] um ícone de bolinha com o desenho
    // de foto no centro e uma seta verde apontando para o norte). Em vez
    // de ser um fundo branco, deve simular a grade do mapa 2D." CAUSA
    // RAIZ da 1ª tentativa (rodada anterior): a ferramenta "Câmera" da
    // janela "Ferramentas" (`_ptool === 'foto-orb'`, ver mapview.js linha
    // ~4450) NÃO usa `_drawCameraShape` (o leque/cunha de campo de visão,
    // usado por `mapData.cameras` — um conceito ANTIGO/diferente, ligado
    // ao `_mode === 'camera'`) — ela cria um "orb de foto"
    // (`mapData.fotos`), desenhado como uma bolinha verde (`#7cffb2`) com
    // o emoji 🖼️ no centro e uma seta saindo dela na direção
    // `foto.dirAngulo` (ver `this.mapData.fotos.forEach` em mapview.js,
    // logo depois do desenho das câmeras) — É ESSE o desenho reproduzido
    // agora aqui (ícone/cores/proporções copiados 1:1 daquela função).
    // MapConfig é um módulo à parte, sem acesso aos métodos de MapView
    // (mesmo motivo documentado no h4 SVG da seção "Fotos" logo abaixo),
    // então o desenho foi reproduzido aqui em vez de chamado direto.
    const gradePreviewEl = modal.querySelector('#mc-foto-grade-preview');
    const _drawGradePreviewBackground = (ctx, w, h) => {
      // Simula a grade escura do mapa 2D (ver MapView._drawWorldGrid) —
      // fundo quase preto + linhas claras tracejadas espaçadas de 20px
      // (não precisa ser matematicamente igual à grade real — é só um
      // "cenário" de fundo pro ícone de exemplo, sem zoom/mundo de verdade
      // por trás aqui).
      ctx.fillStyle = '#0a0d11';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#2a2d31';
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 4]);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y <= h; y += 20) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    // [15/09/2026 UTC] ALTERADO — pedido verbatim: "Nas 'configurações
    // 2D' [...] em 'Pré-visualização', a câmera de icínio [início] deve ter
    // um destaque maior." Antes, "destaque" só trocava a COR (amarelo em
    // vez de verde) do ícone de início (`i === 0`) — o tamanho ficava
    // igual ao dos demais. Agora, quando `destaque` é verdade, o ícone
    // nasce ~35% maior (`r * 1.35`, afeta bolinha/seta/emoji juntos, já
    // que todo o desenho é proporcional a `r`) E ganha um halo/glow atrás
    // (círculo maior, semitransparente, na mesma cor) — destaque bem mais
    // perceptível que só a mudança de cor de antes.
    const _drawCameraPreviewIcon = (ctx, cx, cy, rBase, destaque, ordem) => {
      const cor = destaque ? '#ffd166' : '#7cffb2';
      const r = destaque ? rBase * 1.35 : rBase;
      if (destaque) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 209, 102, 0.22)';
        ctx.fill();
      }
      const compr = r + 16; // MESMA fórmula de mapview.js ("(selected?10:8)+16"), com r no lugar do raio fixo 8/10
      // Seta apontando pro norte (ângulo 0, sem rotação de mapa nem
      // direção customizada — é só um exemplo estático).
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = cor; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -compr); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -compr - 4); ctx.lineTo(-3.5, -compr + 2); ctx.lineTo(3.5, -compr + 2); ctx.closePath();
      ctx.fillStyle = cor; ctx.fill();
      ctx.restore();
      // Corpo (bolinha) por cima, com o emoji 🖼️ no centro — MESMA ordem
      // de desenho de mapview.js (seta primeiro, "atrás"; bolinha depois).
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = cor;
      ctx.fill();
      ctx.strokeStyle = '#0a0d11'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = `${Math.max(8, r * 1.15)}px sans-serif`; ctx.fillStyle = '#0a0d11'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🖼️', cx, cy + 0.5);
      ctx.textBaseline = 'alphabetic';
      // [15/09/2026 UTC] NOVO — pedido verbatim: "em 'Pré-visualização',
      // deve haver um pequeno número (em cada uma), indicando a ordem das
      // câmeras." Numerozinho pequeno (1-based) num selo redondo escuro no
      // canto inferior-direito de cada ícone — MESMO espírito visual de um
      // "badge" de contagem, não disputa espaço com o emoji 🖼️ do centro.
      if (Number.isFinite(ordem)) {
        const raioSelo = Math.max(5, r * 0.42);
        const sx = cx + r * 0.72, sy = cy + r * 0.72;
        ctx.beginPath();
        ctx.arc(sx, sy, raioSelo, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0d11';
        ctx.fill();
        ctx.strokeStyle = cor; ctx.lineWidth = 1; ctx.stroke();
        ctx.font = `700 ${Math.max(7, raioSelo * 1.15)}px sans-serif`;
        ctx.fillStyle = cor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(ordem), sx, sy + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    };
    const drawGradePreview = () => {
      if (!gradePreviewEl || typeof Mapping === 'undefined') return;
      const ctx = gradePreviewEl.getContext('2d');
      const w = gradePreviewEl.width, h = gradePreviewEl.height;
      ctx.clearRect(0, 0, w, h);
      _drawGradePreviewBackground(ctx, w, h);
      const porLinha = Math.max(1, Number(modal.querySelector('#mc-foto-grade-porlinha')?.value) || 1);
      const dirPrimaria = modal.querySelector('#mc-foto-grade-dir')?.dataset.sel || 'direita';
      const quebra = modal.querySelector('#mc-foto-grade-quebra')?.dataset.sel || 'baixo';
      const N = Math.min(porLinha * 3, 18); // exemplo com 3 linhas completas (pedido: "que fique várias linhas")
      const pts = [];
      for (let i = 0; i < N; i++) pts.push(Mapping.findGridSlot({ x: 0, y: 0 }, i, 1, porLinha, dirPrimaria, quebra));
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const cell = Math.min((w - 24) / Math.max(1, maxX - minX + 1), (h - 24) / Math.max(1, maxY - minY + 1), 28);
      pts.forEach((p, i) => {
        const cx = 12 + (p.x - minX) * cell + cell / 2;
        const cy = 12 + (p.y - minY) * cell + cell / 2;
        _drawCameraPreviewIcon(ctx, cx, cy, cell * 0.22, i === 0, i + 1);
      });
    };
    modal.querySelector('#mc-foto-grade-dist')?.addEventListener('change', async (e) => {
      const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) await this.set({ fotoGradeDistancia: v });
    });
    modal.querySelector('#mc-foto-grade-porlinha')?.addEventListener('input', () => drawGradePreview());
    modal.querySelector('#mc-foto-grade-porlinha')?.addEventListener('change', async (e) => {
      const v = Math.max(1, Math.round(Number(e.target.value) || 1)); await this.set({ fotoGradePorLinha: v });
    });
    modal.querySelector('#mc-foto-grade-origx')?.addEventListener('change', async (e) => {
      const v = Number(e.target.value); if (Number.isFinite(v)) await this.set({ fotoGradeOrigemX: v });
    });
    modal.querySelector('#mc-foto-grade-origy')?.addEventListener('change', async (e) => {
      const v = Number(e.target.value); if (Number.isFinite(v)) await this.set({ fotoGradeOrigemY: v });
    });
    // RODADA 54 [15/09/2026 UTC] — seletor visual de direção primária (4
    // setas ↑↓←→) + sentido de quebra de linha (2 setas, sempre
    // perpendiculares à primária escolhida — 8 combinações no total,
    // conforme pedido original reproduzido na RODADA 54).
    const dirWrap = modal.querySelector('#mc-foto-grade-dir');
    const quebraWrap = modal.querySelector('#mc-foto-grade-quebra');
    const QUEBRA_OPCOES = {
      // primária horizontal -> quebra é vertical (cima/baixo); vice-versa.
      direita: [['baixo', '↓ Baixo'], ['cima', '↑ Cima']],
      esquerda: [['baixo', '↓ Baixo'], ['cima', '↑ Cima']],
      cima: [['direita', '→ Direita'], ['esquerda', '← Esquerda']],
      baixo: [['direita', '→ Direita'], ['esquerda', '← Esquerda']],
    };
    const renderQuebraOpts = (dirPrimaria, quebraSel) => {
      if (!quebraWrap) return;
      const opcoes = QUEBRA_OPCOES[dirPrimaria] || QUEBRA_OPCOES.direita;
      // Se a quebra salva não é válida pra essa primária (ex.: veio de uma
      // primária vertical e agora é horizontal), cai no 1º valor válido.
      const valido = opcoes.some(([v]) => v === quebraSel) ? quebraSel : opcoes[0][0];
      quebraWrap.dataset.sel = valido;
      quebraWrap.innerHTML = opcoes.map(([v, label]) => `<button type="button" class="btn ${v === valido ? '' : 'secondary'} sm" data-quebra="${v}">${label}</button>`).join('');
      quebraWrap.querySelectorAll('button[data-quebra]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          quebraWrap.dataset.sel = btn.dataset.quebra;
          renderQuebraOpts(dirWrap?.dataset.sel || 'direita', btn.dataset.quebra);
          await this.set({ fotoGradeQuebra: btn.dataset.quebra });
          drawGradePreview();
        });
      });
      return valido;
    };
    if (dirWrap) {
      const dirInicial = cfg.fotoGradeDirPrimaria || 'direita';
      dirWrap.dataset.sel = dirInicial;
      const marcarDirAtiva = () => {
        dirWrap.querySelectorAll('button[data-dir]').forEach((b) => {
          b.classList.toggle('secondary', b.dataset.dir !== dirWrap.dataset.sel);
        });
      };
      marcarDirAtiva();
      dirWrap.querySelectorAll('button[data-dir]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          dirWrap.dataset.sel = btn.dataset.dir;
          marcarDirAtiva();
          const quebraValida = renderQuebraOpts(btn.dataset.dir, quebraWrap?.dataset.sel);
          await this.set({ fotoGradeDirPrimaria: btn.dataset.dir, fotoGradeQuebra: quebraValida });
          drawGradePreview();
        });
      });
      renderQuebraOpts(dirInicial, cfg.fotoGradeQuebra || 'baixo');
    }
    // RODADA 53/54 — PENDENTE anterior, RESOLVIDA nesta rodada (RODADA 55,
    // [15/09/2026 UTC]): pedido verbatim "Mapeie as dependências ... e as
    // torne modulares e reaproveitáveis." Ver o mapeamento de dependências
    // completo no comentário grande de `MapView.enterMapPositionPickerMode`
    // (js/mapview.js) — resumo: o fluxo "Mover no mapa" da câmera
    // (`enterPhotoPlacementMode`) pressupõe um `photoId` já salvo só pra 3
    // coisas (ler/gravar o registro da foto, e abrir a roda de rotação);
    // NENHUMA das 3 se aplica aqui — a infraestrutura realmente comum (cruz
    // fixa + faixa "Marcar aqui"/"Cancelar" + guards de prioridade) foi
    // extraída pra `enterMapPositionPickerMode({onConfirm,onCancel})`, uma
    // 3ª variante do mesmo padrão já usado por foto E por item (2 cópias
    // existentes — ver enterItemPlacementMode), sem nenhum id de registro.
    modal.querySelector('#mc-foto-grade-mover')?.addEventListener('click', () => {
      const origXEl = modal.querySelector('#mc-foto-grade-origx');
      const origYEl = modal.querySelector('#mc-foto-grade-origy');
      // Mesmo padrão "esconde o .modal-backdrop inteiro enquanto o gesto
      // dura" já usado pelo botão "Girar arrastando" acima (ver comentário
      // grande dele) — sem isto, o modal (z-index por cima da grade)
      // bloquearia o clique no mapa/na faixa "Marcar aqui" por trás.
      const sheetEl = modal.querySelector('.modal-sheet');
      const scrollTop = sheetEl?.scrollTop || 0;
      modal.style.display = 'none';
      const restaurar = () => {
        modal.style.display = '';
        if (sheetEl) sheetEl.scrollTop = scrollTop;
      };
      window.MapView?.enterMapPositionPickerMode({
        onConfirm: (pos) => {
          restaurar();
          if (origXEl) origXEl.value = pos.x.toFixed(2);
          if (origYEl) origYEl.value = pos.y.toFixed(2);
          this.set({ fotoGradeOrigemX: pos.x, fotoGradeOrigemY: pos.y });
          Utils.toast('Origem da grade definida ✓', { type: 'ok' });
          drawGradePreview();
        },
        onCancel: () => {
          restaurar();
          Utils.toast('Cancelado — origem da grade não foi alterada.', { type: 'info' });
        },
      });
    });
    drawGradePreview();

    // RODADA 53 [15/09/2026 UTC] — item D: nome automático (data/hora,
    // local ou UTC) — ver capture.js `_afterPhotoCaptured`.
    modal.querySelector('#mc-foto-nome-auto')?.addEventListener('change', async (e) => { await this.set({ fotoNomeAutomaticoAtivo: e.target.checked }); });
    // [15/09/2026 UTC] RODADA 55 — trocado o wiring dos 2 radios pelo mesmo
    // `_wireHoraDoDiaWidget` do uso 3D (ver comentário grande dele), sem
    // globo/trilha (só o par de botões "seguir X"/local-UTC).
    this._wireHoraDoDiaWidget(modal, {
      idPrefix: 'mc-fotonome-hora',
      mostrarGlobo: false,
      mostrarTrilha: false,
      altValue: 'utc',
      altLabel: '🌐 Seguir horário UTC',
      autoLabel: '🕐 Hora local do aparelho',
      getValorAtual: () => (cfg.fotoNomeHoraUTC ? 'utc' : null),
      onPreview: () => {},
      onCommit: async (v) => { await this.set({ fotoNomeHoraUTC: v === 'utc' }); },
    });
    modal.querySelector('#mc-antialiasing3d')?.addEventListener('change', async (e) => { await this.set({ antialiasing3D: e.target.checked }); });
    // [13/09/2026] UNIFICADO — wiring do <select> único "Resolução de
    // renderização" (ver HTML acima). Ele grava nos MESMOS DOIS campos de
    // sempre (`resolucao3D` + `resolucaoCustom3D`) — nenhuma lógica de
    // leitura em engine3d.js/view3d.js precisou mudar. "Alta/Média/Baixa"
    // gravam `resolucao3D` e ZERAM `resolucaoCustom3D` (equivalente à
    // antiga opção "Automática" da resolução customizada); "Personalizada…"
    // revela os 3 campos (largura/altura/modo de ajuste, que formam UM
    // objeto só em `resolucaoCustom3D`) sem tocar em `resolucao3D` (fica
    // guardado, mas ignorado internamente por engine3d.js enquanto
    // `_customRes` estiver setado — ver `effDpr = custom ? 1 : dpr`).
    const resModeSel = modal.querySelector('#mc-res-mode');
    const resCustomFields = modal.querySelector('#mc-res-mode-fields');
    const resCustomW = modal.querySelector('#mc-res-custom3d-w');
    const resCustomH = modal.querySelector('#mc-res-custom3d-h');
    const resCustomFit = modal.querySelector('#mc-res-custom3d-fit');
    const gravarResCustom3D = async () => {
      const w = Math.max(this.RES_CUSTOM_MIN, Math.round(Number(resCustomW.value)) || this.RES_CUSTOM_MIN);
      const h = Math.max(this.RES_CUSTOM_MIN, Math.round(Number(resCustomH.value)) || this.RES_CUSTOM_MIN);
      resCustomW.value = w; resCustomH.value = h;
      await this.set({ resolucaoCustom3D: { w, h, fit: resCustomFit.value === 'caber' ? 'caber' : 'esticar' } });
    };
    resModeSel?.addEventListener('change', async (e) => {
      const v = e.target.value;
      if (v === 'custom') {
        resCustomFields.classList.remove('hidden');
        await gravarResCustom3D();
        return;
      }
      resCustomFields.classList.add('hidden');
      await this.set({ resolucao3D: v, resolucaoCustom3D: null });
    });
    resCustomW?.addEventListener('change', gravarResCustom3D);
    resCustomH?.addEventListener('change', gravarResCustom3D);
    resCustomFit?.addEventListener('change', gravarResCustom3D);
    // NOVO (07/09/2026) — ver DEFAULTS.efeitoTelaEscurecida3D acima.
    modal.querySelector('#mc-efeito-tela-escurecida3d')?.addEventListener('change', async (e) => { await this.set({ efeitoTelaEscurecida3D: e.target.checked }); });
    modal.querySelector('#mc-cubo-origem-centro')?.addEventListener('change', async (e) => { await this.set({ cuboOrigemCentro: e.target.checked }); });
    // Wiring compartilhado dos dois pares <select>+<input type="number"> com
    // opção "Personalizada(o)…" (distância de renderização e limite de FPS,
    // pedido do usuário nos dois) — escolher "Personalizada…" no <select>
    // só REVELA o campo numérico (foco automático, pra já poder digitar),
    // sem gravar nada ainda; o valor É gravado só quando o campo numérico
    // muda (perde o foco ou Enter), já clamado pro mínimo — evita gravar um
    // valor inválido/incompleto no meio da digitação.
    const wireCustomField = (selectEl, inputEl, min, setKey) => {
      if (!selectEl || !inputEl) return;
      selectEl.addEventListener('change', async (e) => {
        if (e.target.value === 'custom') {
          inputEl.classList.remove('hidden');
          inputEl.focus();
          inputEl.select();
          return; // aguarda a pessoa digitar um valor no campo (listener abaixo)
        }
        inputEl.classList.add('hidden');
        await this.set({ [setKey]: Number(e.target.value) });
      });
      inputEl.addEventListener('change', async (e) => {
        const v = Math.max(min, Math.round(Number(e.target.value)) || min);
        e.target.value = v;
        await this.set({ [setKey]: v });
      });
    };
    wireCustomField(modal.querySelector('#mc-render-distance'), modal.querySelector('#mc-render-distance-custom'), this.RENDER_DISTANCE_MIN, 'renderDistance');
    wireCustomField(modal.querySelector('#mc-fps-limite'), modal.querySelector('#mc-fps-limite-custom'), this.FPS_LIMITE_MIN, 'fpsLimite');
    modal.querySelector('#mc-modo-luminarias3d')?.addEventListener('change', async (e) => { await this.set({ modoLuminarias3D: e.target.value }); });
    // Carregamento de objetos/itens/câmeras ('objeto'/'chunk') — o campo do
    // tamanho do bloco só aparece/faz sentido no modo 'chunk', mesmo padrão
    // visual (mostra/esconde) dos outros campos condicionais desta tela.
    const objetoModoSel = modal.querySelector('#mc-objeto-render-modo');
    const objetoChunkTamInput = modal.querySelector('#mc-objeto-chunk-tam');
    objetoModoSel?.addEventListener('change', async (e) => {
      objetoChunkTamInput?.classList.toggle('hidden', e.target.value !== 'chunk');
      await this.set({ objetoRenderModo: e.target.value });
    });
    objetoChunkTamInput?.addEventListener('change', async (e) => {
      const v = Utils.clamp(Math.round(Number(e.target.value)) || 10, 2, 100);
      e.target.value = v;
      await this.set({ objetoChunkTamanho: v });
    });
    // [13/09/2026 UTC] NOVO — ver DEFAULTS.objetoLimitePorFrame acima pro
    // pedido/motivo completo. Mesmo padrão visual mostra/esconde de
    // #mc-objeto-chunk-tam logo acima.
    const limiteFrameAtivo = modal.querySelector('#mc-limite-frame-ativo');
    const limiteFrameWrap = modal.querySelector('#mc-limite-frame-wrap');
    const limiteFrameValor = modal.querySelector('#mc-limite-frame-valor');
    limiteFrameAtivo?.addEventListener('change', async (e) => {
      if (limiteFrameWrap) limiteFrameWrap.style.display = e.target.checked ? '' : 'none';
      await this.set({ objetoLimitePorFrameAtivo: e.target.checked });
    });
    limiteFrameValor?.addEventListener('change', async (e) => {
      const v = Math.max(1, Math.round(Number(e.target.value)) || 1200);
      e.target.value = v;
      await this.set({ objetoLimitePorFrame: v });
    });
    // [13/09/2026] NOVO — ver DEFAULTS.cameraZNear/cameraZFar e o HTML
    // `#mc-cam-znear-wrap`/`#mc-cam-zfar-wrap` acima. Monta os 2 "botões
    // triplos" (ModelerUI._createNumField, MESMO componente/idioma de
    // `_wireCamPropsFieldset` em mapview.js, incluindo o clamp manual de
    // `min` — o widget não tem essa opção embutida) e persiste cada
    // mudança via `this.set()` — o MESMO mecanismo de toda esta tela, que
    // já propaga ao vivo pra `Engine3D.setConfig()` (ver view3d.js
    // `_onMapConfigChange`), satisfazendo o pedido de "tempo real" sem
    // nenhum código novo de aplicação — só extrai/lê os 2 campos.
    this._wireDesempenho3DCamPlanes(modal, cfg);
    // Seção "🐞 Debug" — ver DEFAULTS.debugTransferidorAtivo/
    // debugProlongamentoAtivo acima.
    // [12/09/2026] NOVO — handler do interruptor mestre `debugModoAtivo`
    // (ver comentário no HTML/DEFAULTS acima). Pedido verbatim: "coloque um
    // botão para ativar o debug. Ativando o debug, todas as suas opções
    // entram em execução."
    modal.querySelector('#mc-debug-modo-ativo')?.addEventListener('change', async (e) => { await this.set({ debugModoAtivo: e.target.checked }); });
    modal.querySelector('#mc-debug-transferidor')?.addEventListener('change', async (e) => { await this.set({ debugTransferidorAtivo: e.target.checked }); });
    modal.querySelector('#mc-debug-prolongamento')?.addEventListener('change', async (e) => { await this.set({ debugProlongamentoAtivo: e.target.checked }); });
    modal.querySelector('#mc-debug-alvo-orbital')?.addEventListener('change', async (e) => { await this.set({ modeladorMostrarAlvoOrbital: e.target.checked }); });
    modal.querySelector('#mc-debug-enquadramento-camera')?.addEventListener('change', async (e) => { await this.set({ debugEnquadramentoCameraAtivo: e.target.checked }); });
    // [17/09/2026 UTC] NOVO (RODADA 123) — ver DEFAULTS.debugTrena3DCoordenadasAtivo.
    modal.querySelector('#mc-debug-trena3d-coords')?.addEventListener('change', async (e) => { await this.set({ debugTrena3DCoordenadasAtivo: e.target.checked }); });
    // [17/09/2026 UTC] NOVO (RODADA 125) — ver DEFAULTS.debugBotaoTelaAtivo.
    modal.querySelector('#mc-debug-botao-tela')?.addEventListener('change', async (e) => { await this.set({ debugBotaoTelaAtivo: e.target.checked }); });
    // Pedido do usuário (03/09/2026) — ver DEFAULTS.bussola3DAtiva/seção "🧭
    // Bússola 3D" acima.
    modal.querySelector('#mc-bussola3d')?.addEventListener('change', async (e) => { await this.set({ bussola3DAtiva: e.target.checked }); });

    // Seção "🎬 Apresentação" (rodada 48; sub-opções do raio X por categoria
    // + "tudo no cenário" na rodada 49) — botões no topo das configurações
    // 3D; estado do Raio X global é runtime (não persiste no MapConfig —
    // vive em `window.View3D._xrayGlobal`), então aqui só chama direto no
    // View3D em vez de `this.set(...)`.
    const xrayIds = ['mc-xray-objetos', 'mc-xray-paredes', 'mc-xray-portas', 'mc-xray-janelas'];
    const xrayKeys = { 'mc-xray-objetos': 'objetos', 'mc-xray-paredes': 'paredes', 'mc-xray-portas': 'portas', 'mc-xray-janelas': 'janelas' };
    const xrayTudoEl = modal.querySelector('#mc-xray-tudo');
    const readXrayFlags = () => {
      const flags = {};
      xrayIds.forEach((id) => { flags[xrayKeys[id]] = !!modal.querySelector(`#${id}`)?.checked; });
      return flags;
    };
    // "Tudo no cenário" já nasce marcada (sem travar de novo o usuário a cada
    // reabertura) se as 4 categorias já estavam todas ligadas da última vez.
    if (xrayTudoEl && xrayIds.every((id) => modal.querySelector(`#${id}`)?.checked)) {
      xrayTudoEl.checked = true;
      xrayIds.forEach((id) => { const el = modal.querySelector(`#${id}`); if (el) el.disabled = true; });
    }
    xrayIds.forEach((id) => {
      modal.querySelector(`#${id}`)?.addEventListener('change', () => { window.View3D?._toggleGlobalXRay?.(readXrayFlags()); });
    });
    // Pedido do usuário (rodada 49): "uma outra opção 'tudo no cenário', se
    // esta opção for marcada, todas as outras são marcadas e desabilitadas.
    // Voltam a ficar habilitadas, se a opção 'tudo no cenário' for
    // desativada."
    xrayTudoEl?.addEventListener('change', (e) => {
      const ligado = e.target.checked;
      xrayIds.forEach((id) => {
        const el = modal.querySelector(`#${id}`);
        if (!el) return;
        el.disabled = ligado;
        if (ligado) el.checked = true; // desmarcar não força nenhum estado — só destrava, ver comentário acima
      });
      window.View3D?._toggleGlobalXRay?.(readXrayFlags());
    });
    modal.querySelector('#mc-scene-flythrough')?.addEventListener('click', () => { window.View3D?._startSceneFlythrough?.(); close(); });
    // NOVO (07/09/2026), pedido verbatim: "Faça esse código de exemplo e
    // deixe um botão para isso em uma seção nas 'configurações 3D'." — usa
    // `window.View3D._engine.scene` (mesmo padrão singleton de
    // `window.View3D?._startSceneFlythrough?.()` logo acima — View3D é um
    // objeto único, não uma classe instanciada, então a cena ativa sempre
    // mora ali) em vez de `opts.view3d`, que ficaria desatualizado se o
    // modal continuasse aberto entre uma troca de mapa/fechar-reabrir o 3D.
    modal.querySelector('#mc-scripting-demo')?.addEventListener('click', () => {
      window.Scripting?.runDemoWallBuild?.(window.View3D?._engine?.scene);
    });
    // NOVO (07/09/2026), pedido verbatim: "definir luz ambiente" — grava
    // direto (this.set), MESMO padrao de qualquer outro campo desta janela;
    // 'onChange' (MapConfig, ja existente) propaga pro Engine3D.setConfig
    // ativo (ver view3d.js), entao ligar/desligar com o 3D ja aberto ja
    // aplica na hora (mesma mecanica da intensidade da luz direcional/hemi,
    // que ja reage a config sem precisar reabrir a tela).
    modal.querySelector('#mc-luzambiente-intensidade')?.addEventListener('input', async (e) => {
      const v = parseFloat(e.target.value) || 0;
      modal.querySelector('#mc-luzambiente-int-label').textContent = `${v.toFixed(2)}x`;
      await this.set({ luzAmbienteIntensidade: v });
    });
    modal.querySelector('#mc-luzambiente-cor')?.addEventListener('input', async (e) => {
      await this.set({ luzAmbienteCor: e.target.value });
    });
    modal.querySelector('#mc-luzambiente-reset')?.addEventListener('click', async () => {
      await this.set({ luzAmbienteIntensidade: 1, luzAmbienteCor: '#ffffff' });
      const intInput = modal.querySelector('#mc-luzambiente-intensidade');
      const corInput = modal.querySelector('#mc-luzambiente-cor');
      if (intInput) intInput.value = 1;
      if (corInput) corInput.value = '#ffffff';
      const lbl = modal.querySelector('#mc-luzambiente-int-label');
      if (lbl) lbl.textContent = '1.00x';
    });
    // NOVO (04/09/2026), item 5 — os 3 rádios do "🚀 Modo de voo 3D" (ver
    // HTML acima) gravam direto em `modoVoo3D`, lido por App.verNoMapa3D.
    modal.querySelectorAll('input[name="mc-modovoo3d"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ modoVoo3D: e.target.value }); });
    });
    // Seção "🌗 Hora do dia" (pedido do usuário, 03/09/2026).
    // [15/09/2026 UTC] EXTRAÍDA para `_wireHoraDoDiaWidget` (ver comentário
    // grande dela, acima) — RODADA 55, pedido verbatim: "Mapeie as
    // dependências ... e as torne modulares e reaproveitáveis." O antigo
    // `_syncHoraUI` local virou o `syncUI` genérico dentro do widget; a
    // chave `horaDoDiaManual`/o sentinela 'mundo' agora só existem aqui,
    // nos callbacks passados (o widget em si não conhece nenhum dos dois).
    // [15/09/2026 UTC] `horaWidgetApi` guarda o {getHora,setHora,destroy}
    // devolvido pelo widget — usado logo abaixo pelo refresh do relógio do
    // mundo (setHora, no lugar do antigo `_syncHoraUI`) e pelo `close()` do
    // modal (destroy, no lugar do antigo `globoApi?.destroy()`).
    const horaWidgetApi = this._wireHoraDoDiaWidget(modal, {
      idPrefix: 'mc-hora',
      mostrarGlobo: true,
      mostrarTrilha: true,
      altValue: 'mundo',
      altLabel: '🌐 Seguir relógio do mundo',
      autoLabel: '🕐 Seguir relógio do aparelho',
      getValorAtual: () => cfg.horaDoDiaManual,
      getAltHoraDecimal: () => this._horaMundoDecimal(),
      onPreview: (h) => this.previewSet({ horaDoDiaManual: h }),
      onCommit: async (v) => { await this.set({ horaDoDiaManual: v }); },
    });
    // Seção "📍 Centralização ao voltar pro mapa" (contexto 2D, rodada 48).
    modal.querySelectorAll('input[name="mc-2d-centralizar"]').forEach((r) => {
      r.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ centralizacao2DVolta: e.target.value }); });
    });
    // Seção "🗂️ Método de interação de camadas" (pedido do usuário, 03/09/2026).
    modal.querySelectorAll('input[name="mc-interacao-camadas"]').forEach((r) => {
      r.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ metodoInteracaoCamadas: e.target.value }); });
    });

    // ---------- Seção "🧱 Parede" — mesmo espírito dos campos numéricos
    // acima (clamp no mínimo/máximo, grava no "change", não a cada tecla). ----------
    modal.querySelector('#mc-parede-snap-grade-on')?.addEventListener('change', async (e) => { await this.set({ paredeSnapGradeAtivo: e.target.checked }); });
    modal.querySelector('#mc-parede-snap-grade-tam')?.addEventListener('change', async (e) => {
      const cm = Utils.clamp(Math.round(Number(e.target.value)) || 20, this.PAREDE_SNAP_GRADE_MIN * 100, this.PAREDE_SNAP_GRADE_MAX * 100);
      e.target.value = cm;
      await this.set({ paredeSnapGradeTamanho: cm / 100 });
    });
    modal.querySelector('#mc-parede-modificador')?.addEventListener('change', async (e) => { await this.set({ paredeModificador: e.target.value }); });
    modal.querySelector('#mc-parede-modificador-inverter')?.addEventListener('change', async (e) => { await this.set({ paredeModificadorInvertido: e.target.checked }); });
    modal.querySelector('#mc-parede-snap-intersecao')?.addEventListener('change', async (e) => { await this.set({ paredeSnapIntersecaoGrade: e.target.checked }); });
    modal.querySelector('#mc-parede-snap-vertice')?.addEventListener('change', async (e) => { await this.set({ paredeSnapVertice: e.target.checked }); });
    modal.querySelector('#mc-parede-snap-quina')?.addEventListener('change', async (e) => { await this.set({ paredeSnapQuina: e.target.checked }); });
    modal.querySelector('#mc-parede-snap-meio')?.addEventListener('change', async (e) => { await this.set({ paredeSnapMeio: e.target.checked }); });
    modal.querySelector('#mc-parede-snap-angulo')?.addEventListener('change', async (e) => { await this.set({ paredeSnapAngulo: e.target.checked }); });
    modal.querySelector('#mc-parede-snap-angulo-inc')?.addEventListener('change', async (e) => { await this.set({ paredeSnapAnguloIncremento: Number(e.target.value) }); });
    modal.querySelector('#mc-parede-comprimento-min')?.addEventListener('change', async (e) => {
      const cm = Utils.clamp(Math.round(Number(e.target.value)) || 30, 5, 200);
      e.target.value = cm;
      await this.set({ paredeComprimentoMinimo: cm / 100 });
    });
    // Seletor de estilo de junção (cartões com ícone, ver _WALL_JOIN_TYPES/
    // _juncaoIconSvg acima) — clicar/selecionar já atualiza a borda de
    // destaque e a descrição embaixo NA HORA (sem esperar reabrir o painel),
    // além de gravar a config (que dispara _rebuildScene em view3d.js, ver
    // _onMapConfigChange lá — a quina muda de estilo com a cena já aberta).
    modal.querySelectorAll('input[name="mc-juncao"]').forEach((r) => {
      r.addEventListener('change', async (e) => {
        if (!e.target.checked) return;
        const tipo = e.target.value;
        modal.querySelectorAll('.mc-juncao-opt').forEach((el) => {
          el.style.borderColor = el.dataset.tipo === tipo ? 'var(--accent, #4a9eff)' : 'transparent';
        });
        const desc = modal.querySelector('#mc-juncao-desc');
        if (desc) desc.textContent = (this._WALL_JOIN_TYPES.find((t) => t.key === tipo) || {}).desc || '';
        await this.set({ paredeJuncaoTipo: tipo });
      });
    });

    // ---------- Seção "📏 Trena 3D" — botão "Sobre" (documentação) e modo de
    // ancoragem (Ctrl x 4 cliques), ver HTML acima. ----------
    modal.querySelector('#mc-trena3d-sobre-btn')?.addEventListener('click', () => this._abrirDocTrena3D());
    // [16/09/2026 UTC] NOVO (RODADA 92) — botão "↺ Restaurar padrões da
    // Trena 3D": reseta TODO campo cuja chave comece com "trena3D" (Snap,
    // Aparência, Visibilidade, Espessura/cores, Pontas, Destaque de mira,
    // Altura ao vivo, Linha da âncora, Linhas verticais, Guia de grade,
    // Janelinha, etc.) para `MapConfig.DEFAULTS`, num único `this.set(...)`
    // (dispara `_listeners` uma vez só — inclusive `_onMapConfigChange` do
    // view3d.js, que reconstrói a cena 3D/rebuilda linhas/atualiza a
    // janelinha). Depois fecha e reabre esta mesma folha de Configurações
    // 3D pra recarregar TODOS os inputs (número, rádio, checkbox) com os
    // valores restaurados — mais simples e confiável do que reescrever cada
    // um dos ~40 campos manualmente aqui (a chamada usa window.confirm()).
    modal.querySelector('#mc-trena3d-restaurar-padroes')?.addEventListener('click', async () => {
      const ok = window.confirm('Restaurar todas as opções da Trena 3D (Snap, Aparência da medida, Visibilidade, Espessura/cores, Pontas, Destaque de mira, Altura ao vivo, Linha da âncora, Linhas verticais, Guia de grade, Janelinha) para os valores padrão de fábrica?');
      if (!ok) return;
      const patch = {};
      for (const chave of Object.keys(MapConfig.DEFAULTS || {})) {
        if (chave.startsWith('trena3D')) patch[chave] = MapConfig.DEFAULTS[chave];
      }
      await this.set(patch);
      close();
      this.open(map, opts);
    });
    modal.querySelectorAll('input[name="mc-trena3d-modo-ancora"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DModoAncora: e.target.value }); });
    });

    // ---------- Seção "📏 Trena 3D" — snap (toggle + valor), aparência,
    // visibilidade, espessura/cores e pontas (5 subseções, ver HTML acima). ----------
    modal.querySelector('#mc-trena3d-snap-on')?.addEventListener('change', async (e) => {
      await this.set({ trena3DSnapAtivo: e.target.checked });
      // [16/09/2026 UTC] NOVO — o preview de "Gradeado do ladrilho mirado"
      // (seção separada, mais abaixo) usa este mesmo snap pra decidir
      // quantas células desenhar — precisa redesenhar ao mudar aqui também.
      this._trena3DDesenharPreviewGradeSnap(modal);
    });
    // [17/09/2026 UTC] ATUALIZADO (RODADA 118) — "botão triplo" (ver
    // `_montarBotaoTriplo`); o antigo `<input type="number">` (com o
    // `campo.disabled` do toggle acima) virou um `<div>` — o widget não tem
    // um "disabled" próprio, então o toggle desligado só interrompe o EFEITO
    // (via `trena3DSnapAtivo`), não trava mais o arrastar do botão em si.
    this._montarBotaoTriplo(modal, 'mc-trena3d-snap', {
      step: 0.01, minDecimals: 2, min: 0.01, max: 2, chave: 'mc-trena3d-snap',
      aoCommit: (v) => ({ trena3DSnapMetros: v || 0.1 }),
      aposCommit: () => this._trena3DDesenharPreviewGradeSnap(modal),
    });
    modal.querySelectorAll('input[name="mc-trena3d-label"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DLabelEstilo: e.target.value }); });
    });
    // [17/09/2026 UTC] NOVO (RODADA 119) — controle de posição vertical do
    // texto (ver `_trena3DCampoDeslocVerticalLabel`/`_wireTrena3DDeslocVerticalLabel`).
    this._wireTrena3DDeslocVerticalLabel(modal, 'mc-trena3d-label', 'trena3DLabelDeslocVerticalM');
    modal.querySelectorAll('input[name="mc-trena3d-vis"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DVisibilidade: e.target.value }); });
    });
    // [17/09/2026 UTC] NOVO (RODADA 121) — raio de proximidade do
    // personagem + reorganização automática opcional (ver DEFAULTS e
    // comentário grande no HTML desta subseção, acima).
    modal.querySelector('#mc-trena3d-label-raio-ativo')?.addEventListener('change', async (e) => {
      await this.set({ trena3DLabelRaioAtivo: e.target.checked });
    });
    this._montarBotaoTriplo(modal, 'mc-trena3d-label-raio', {
      step: 0.5, minDecimals: 1, min: 0.5, max: 500, chave: 'mc-trena3d-label-raio',
      aoCommit: (v) => ({ trena3DLabelRaioM: v || 15 }),
    });
    modal.querySelector('#mc-trena3d-label-reorganizar')?.addEventListener('change', async (e) => {
      await this.set({ trena3DLabelReorganizarSobreposicao: e.target.checked });
    });
    // [17/09/2026 UTC] NOVO (RODADA 125) — checkbox/cor do "ponto médio da
    // medida" (ver DEFAULTS e comentário grande no HTML desta subseção).
    modal.querySelector('#mc-trena3d-ponto-medio-ativo')?.addEventListener('change', async (e) => {
      await this.set({ trena3DMostrarPontoMedio: e.target.checked });
    });
    modal.querySelector('#mc-trena3d-ponto-medio-cor')?.addEventListener('input', async (e) => {
      await this.set({ trena3DCorPontoMedio: e.target.value });
    });
    // [17/09/2026 UTC] NOVO (RODADA 127) — mostrar/ocultar caixa de texto da
    // medida principal (ver DEFAULTS 'trena3DLabelVisivel').
    modal.querySelector('#mc-trena3d-label-visivel')?.addEventListener('change', async (e) => {
      await this.set({ trena3DLabelVisivel: e.target.checked });
    });
    this._montarBotaoTriplo(modal, 'mc-trena3d-espessura', {
      step: 0.2, minDecimals: 1, min: 0.1, max: 1000, chave: 'mc-trena3d-espessura',
      aoCommit: (v) => ({ trena3DEspessuraCm: v || 2 }),
    });
    modal.querySelector('#mc-trena3d-cor-linha')?.addEventListener('input', async (e) => { await this.set({ trena3DCorLinha: e.target.value }); });
    modal.querySelectorAll('input[name="mc-trena3d-ponta"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DPonta: e.target.value }); });
    });
    // [16/09/2026 UTC] NOVO (RODADA 91) — sub-opções de cada tipo de ponta
    // (esfera/seta/seta com 2 traços/traço perpendicular). Ver DEFAULTS e
    // view3d.js '_trena3DBuildEndpoint'/'_trena3DRebuildLines'.
    this._montarBotaoTriplo(modal, 'mc-trena3d-esfera-tamanho', {
      step: 0.01, minDecimals: 2, min: 0.01, max: 1, chave: 'mc-trena3d-esfera-tamanho',
      aoCommit: (v) => ({ trena3DEsferaTamanho: Utils.clamp(v || 0.02, 0.01, 1) }),
    });
    modal.querySelectorAll('input[name="mc-trena3d-esfera-termino"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DEsferaTerminoLinha: e.target.value }); });
    });
    this._montarBotaoTriplo(modal, 'mc-trena3d-seta-cone-raio', {
      step: 0.1, minDecimals: 1, min: 0.5, max: 15, chave: 'mc-trena3d-seta-cone-raio',
      aoCommit: (v) => ({ trena3DSetaConeRaio: v || 3.2 }),
    });
    this._montarBotaoTriplo(modal, 'mc-trena3d-seta-cone-altura', {
      step: 0.1, minDecimals: 1, min: 0.5, max: 15, chave: 'mc-trena3d-seta-cone-altura',
      aoCommit: (v) => ({ trena3DSetaConeAltura: v || 2.2 }),
    });
    this._montarBotaoTriplo(modal, 'mc-trena3d-seta2-abertura', {
      step: 0.5, minDecimals: 1, min: 0.5, max: 50, chave: 'mc-trena3d-seta2-abertura',
      aoCommit: (v) => ({ trena3DSetaDoisTracosAbertura: v || 6 }),
    });
    this._montarBotaoTriplo(modal, 'mc-trena3d-seta2-comprimento', {
      step: 0.5, minDecimals: 1, min: 0.5, max: 100, chave: 'mc-trena3d-seta2-comprimento',
      aoCommit: (v) => ({ trena3DSetaDoisTracosComprimento: v || 10 }),
    });
    this._montarBotaoTriplo(modal, 'mc-trena3d-traco-comprimento', {
      step: 0.5, minDecimals: 1, min: 1, max: 60, chave: 'mc-trena3d-traco-comprimento',
      aoCommit: (v) => ({ trena3DTracoPerpComprimento: v || 7 }),
    });
    modal.querySelectorAll('input[name="mc-trena3d-traco-alinhamento"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DTracoPerpAlinhamento: e.target.value }); });
    });
    modal.querySelectorAll('input[name="mc-trena3d-traco-modo-render"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DTracoPerpModoRender: e.target.value }); });
    });
    modal.querySelector('#mc-trena3d-suprimir-destaque')?.addEventListener('change', async (e) => {
      await this.set({ trena3DSuprimirDestaqueDuranteAncora: e.target.checked });
      this._trena3DDesenharPreviewDestaqueMira(modal);
    });
    // [RODADA 131] NOVO — cor/tamanho da mira (ver DEFAULTS/HTML acima e
    // view3d.js '_trena3DCfg'/bloco '_trena3DHoverMesh').
    modal.querySelector('#mc-trena3d-mira-cor')?.addEventListener('input', async (e) => { await this.set({ trena3DMiraCor: e.target.value }); });
    this._montarBotaoTriplo(modal, 'mc-trena3d-mira-tamanho', {
      step: 0.1, minDecimals: 1, min: 0.2, max: 5, chave: 'mc-trena3d-mira-tamanho',
      aoCommit: (v) => ({ trena3DMiraTamanho: v || 1 }),
    });
    modal.querySelector('#mc-trena3d-continuar-linha-ancora')?.addEventListener('change', async (e) => { await this.set({ trena3DContinuarLinhaAncoraAposPonto: e.target.checked }); });
    modal.querySelectorAll('input[name="mc-trena3d-linha-ancora-modo"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DLinhaAncoraAposPontoModo: e.target.value }); });
    });
    modal.querySelector('#mc-trena3d-mostrar-medida-linha-ancora')?.addEventListener('change', async (e) => { await this.set({ trena3DMostrarMedidaNaLinhaAncoraAposPonto: e.target.checked }); });
    modal.querySelector('#mc-trena3d-guia-chao-ao-vivo')?.addEventListener('change', async (e) => { await this.set({ trena3DMostrarGuiaChaoAoVivo: e.target.checked }); });
    modal.querySelector('#mc-trena3d-guia-chao-finalizada')?.addEventListener('change', async (e) => { await this.set({ trena3DGuiaChaoFinalizada: e.target.checked }); });
    // [RODADA 130] `input` (não `change`) para aplicar a cor em tempo real
    // enquanto o usuário arrasta/ajusta no seletor nativo do navegador.
    modal.querySelector('#mc-trena3d-guia-chao-cor-linha')?.addEventListener('input', async (e) => { await this.set({ trena3DGuiaChaoCorLinha: e.target.value }); });
    modal.querySelector('#mc-trena3d-guia-chao-cor-texto')?.addEventListener('input', async (e) => { await this.set({ trena3DGuiaChaoCorTexto: e.target.value }); });
    // [RODADA 131] NOVO — modo de altura da "Guia rente ao chão" (ver
    // DEFAULTS/HTML acima e view3d.js '_trena3DGuiaChaoAlturaY').
    modal.querySelectorAll('input[name="mc-trena3d-guia-chao-modo"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DGuiaChaoModo: e.target.value }); });
    });
    this._montarBotaoTriplo(modal, 'mc-trena3d-guia-chao-altura-livre', {
      step: 0.1, minDecimals: 1, min: -50, max: 50, chave: 'mc-trena3d-guia-chao-altura-livre',
      aoCommit: (v) => ({ trena3DGuiaChaoAlturaLivreM: v || 0 }),
    });
    // [17/09/2026 UTC] NOVO (RODADA 114) — espessura/estilo/dash + pontas
    // simplificadas da "Guia rente ao chão" (ver `_wireTrena3DEstiloLinha`).
    this._wireTrena3DEstiloLinha(modal, 'mc-trena3d-guia-chao', 'trena3DGuiaChao', { espessuraPadrao: 1.2, dashPadrao: 12, gapPadrao: 8, comPontas: true });
    this._wireTrena3DDeslocVerticalLabel(modal, 'mc-trena3d-guia-chao', 'trena3DGuiaChaoLabelDeslocVerticalM');
    // [17/09/2026 UTC] NOVO (RODADA 125) — "Em cima e no meio"/"Flutuante".
    modal.querySelectorAll('input[name="mc-trena3d-guia-chao-label"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DGuiaChaoLabelEstilo: e.target.value }); });
    });
    // [17/09/2026 UTC] NOVO (RODADA 127) — mostrar/ocultar caixa de texto da
    // "Guia rente ao chão" (ver DEFAULTS 'trena3DGuiaChaoLabelVisivel').
    modal.querySelector('#mc-trena3d-guia-chao-label-visivel')?.addEventListener('change', async (e) => {
      await this.set({ trena3DGuiaChaoLabelVisivel: e.target.checked });
    });
    modal.querySelector('#mc-trena3d-superficies-laterais')?.addEventListener('change', async (e) => { await this.set({ trena3DPermitirSuperficiesLaterais: e.target.checked }); });
    modal.querySelector('#mc-trena3d-continuar-nivel')?.addEventListener('change', async (e) => { await this.set({ trena3DContinuarNoNivel: e.target.checked }); });
    modal.querySelector('#mc-trena3d-altura-antes-ponto')?.addEventListener('change', async (e) => { await this.set({ trena3DMostrarAlturaAoVivoAntesDoPonto: e.target.checked }); });
    modal.querySelector('#mc-trena3d-linhas-finalizada')?.addEventListener('change', async (e) => { await this.set({ trena3DMostrarLinhasAncoraFinalizada: e.target.checked }); });
    modal.querySelectorAll('input[name="mc-trena3d-linhas-finalizada-modo"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DLinhasAncoraFinalizadaModo: e.target.value }); });
    });
    // [17/09/2026 UTC] NOVO (RODADA 114) — cor + espessura/estilo/dash da
    // "Linhas verticais ancoradas" (compartilhados pelas 3 sub-opções:
    // Altura ao vivo, Linha da âncora, Linhas finalizadas).
    // [RODADA 130] `input` (não `change`) para aplicar em tempo real.
    modal.querySelector('#mc-trena3d-linha-ancora-cor')?.addEventListener('input', async (e) => { await this.set({ trena3DLinhaAncoraCor: e.target.value }); });
    this._wireTrena3DEstiloLinha(modal, 'mc-trena3d-linha-ancora', 'trena3DLinhaAncora', { espessuraPadrao: 1, dashPadrao: 12, gapPadrao: 8 });
    // [RODADA 129] NOVO — "📏 Trena 3D — Ghost/prévia da medida".
    // [RODADA 130] `input` (não `change`) para aplicar em tempo real.
    modal.querySelector('#mc-trena3d-ghost-cor')?.addEventListener('input', async (e) => { await this.set({ trena3DGhostCor: e.target.value }); });
    this._wireTrena3DEstiloLinha(modal, 'mc-trena3d-ghost', 'trena3DGhost', { espessuraPadrao: 1, dashPadrao: 12, gapPadrao: 8 });
    this._wireTrena3DDeslocVerticalLabel(modal, 'mc-trena3d-linha-ancora', 'trena3DLinhaAncoraLabelDeslocVerticalM');
    // [RODADA 131] NOVO — "Caixa de texto" (mostrar/ocultar) da subseção
    // "Linhas verticais ancoradas" (ver DEFAULTS 'trena3DLinhaAncoraLabelVisivel').
    modal.querySelector('#mc-trena3d-linha-ancora-label-visivel')?.addEventListener('change', async (e) => {
      await this.set({ trena3DLinhaAncoraLabelVisivel: e.target.checked });
    });
    modal.querySelector('#mc-trena3d-guia-grade')?.addEventListener('change', async (e) => { await this.set({ trena3DGuiaGradeAtiva: e.target.checked }); });
    modal.querySelectorAll('input[name="mc-trena3d-guia-modo"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DGuiaGradeModoMedida: e.target.value }); });
    });
    modal.querySelector('#mc-trena3d-guia-grade-finalizada')?.addEventListener('change', async (e) => { await this.set({ trena3DGuiaGradeFinalizada: e.target.checked }); });
    modal.querySelector('#mc-trena3d-guia-grade-apos-1-ponto')?.addEventListener('change', async (e) => { await this.set({ trena3DGuiaGradeAposPrimeiroPonto: e.target.checked }); });
    // [RODADA 130] `input` (não `change`) para aplicar em tempo real.
    modal.querySelector('#mc-trena3d-guia-grade-cor-linha')?.addEventListener('input', async (e) => { await this.set({ trena3DGuiaGradeCorLinha: e.target.value }); });
    modal.querySelector('#mc-trena3d-guia-grade-cor-texto')?.addEventListener('input', async (e) => { await this.set({ trena3DGuiaGradeCorTexto: e.target.value }); });
    // [17/09/2026 UTC] NOVO (RODADA 114) — espessura/estilo/dash da "Guia de
    // grade do mundo" (ver `_wireTrena3DEstiloLinha`).
    this._wireTrena3DEstiloLinha(modal, 'mc-trena3d-guia-grade', 'trena3DGuiaGrade', { espessuraPadrao: 2.4, dashPadrao: 12, gapPadrao: 8 });
    this._wireTrena3DDeslocVerticalLabel(modal, 'mc-trena3d-guia-grade', 'trena3DGuiaGradeLabelDeslocVerticalM', { chaveLinhaVertical: 'trena3DGuiaGradeLabelLinhaVertical' });
    // [17/09/2026 UTC] NOVO (RODADA 125) — "Em cima e no meio"/"Flutuante".
    modal.querySelectorAll('input[name="mc-trena3d-guia-grade-label"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DGuiaGradeLabelEstilo: e.target.value }); });
    });
    // [17/09/2026 UTC] NOVO (RODADA 127) — mostrar/ocultar caixa de texto da
    // "Linhas guia da grade do mundo" (ver DEFAULTS 'trena3DGuiaGradeLabelVisivel').
    modal.querySelector('#mc-trena3d-guia-grade-label-visivel')?.addEventListener('change', async (e) => {
      await this.set({ trena3DGuiaGradeLabelVisivel: e.target.checked });
    });
    modal.querySelector('#mc-trena3d-grade-snap')?.addEventListener('change', async (e) => { await this.set({ trena3DGradeSnapLadrilhoAtiva: e.target.checked }); });
    modal.querySelectorAll('input[name="mc-trena3d-grade-snap-modo"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ trena3DGradeSnapLadrilhoModo: e.target.value }); });
    });
    this._montarBotaoTriplo(modal, 'mc-trena3d-grade-snap-espessura', {
      step: 0.5, minDecimals: 1, min: 0.5, max: 10, chave: 'mc-trena3d-grade-snap-espessura',
      aoCommit: (v) => ({ trena3DGradeSnapEspessuraPx: v || 1 }),
      aposCommit: () => this._trena3DDesenharPreviewGradeSnap(modal),
    });
    this._montarBotaoTriplo(modal, 'mc-trena3d-grade-snap-gap', {
      step: 0.1, minDecimals: 1, min: 0.1, max: 50, chave: 'mc-trena3d-grade-snap-gap',
      aoCommit: (v) => ({ trena3DGradeSnapGapCm: v || 1.5 }),
      aposCommit: () => this._trena3DDesenharPreviewGradeSnap(modal),
    });
    // [16/09/2026 UTC] NOVO — cor do gradeado (ver DEFAULTS.trena3DGradeSnapCor
    // e view3d.js '_trena3DAtualizarGradeSnapLadrilho').
    modal.querySelector('#mc-trena3d-grade-snap-cor')?.addEventListener('input', (e) => {
      this._trena3DDesenharPreviewGradeSnap(modal);
    });
    modal.querySelector('#mc-trena3d-grade-snap-cor')?.addEventListener('change', async (e) => {
      await this.set({ trena3DGradeSnapCor: e.target.value });
      this._trena3DDesenharPreviewGradeSnap(modal);
    });

    // [16/09/2026 UTC] NOVO — pedido verbatim: "faça um preview de canvas
    // para se ter noção do que se trata." Preview 2D ilustrativo (não é a
    // cena 3D de verdade — só um esquema simplificado visto de cima) para
    // as seções "Guia de grade do mundo" e "Gradeado do ladrilho mirado".
    // Redesenhado a cada mudança de opção relevante e uma vez ao abrir o
    // modal (chamadas logo abaixo, fora desta lista de listeners).
    this._trena3DDesenharPreviewGuiaGrade(modal);
    this._trena3DDesenharPreviewGradeSnap(modal);
    this._trena3DDesenharPreviewDestaqueMira(modal);
    // [17/09/2026 UTC] NOVO — item 6 (RODADA 110): botão "🌳 Modo
    // árvore/lista" no cabeçalho da seção "📏 Trena 3D" (ver comentário
    // grande junto do `<div id="mc-trena3d-secoes">` mais acima). `await`
    // aqui é seguro — `open()` já é `async` e este trecho já roda depois de
    // várias outras leituras `await DB.getSetting(...)` (ex.
    // `fotosMarcarAquiAcao` no topo do método).
    // [17/09/2026 UTC] CORRIGIDO (RODADA 118) — `_wireTrena3DModoArvore` é
    // `async` e não tinha nenhum `try/catch` ao redor do `await` — qualquer
    // exceção lá dentro derrubava TODO o resto de `open()` que viria depois
    // (silenciosamente, sem nenhum erro visível pro usuário), inclusive
    // `_aplicarCoresSecoes` logo abaixo — candidato forte pra explicar o
    // bug relatado ("a cor [...] ainda está a mesma [...] para todas as
    // seções"). `try/catch` aqui garante que um erro em QUALQUER wiring
    // anterior nunca mais impeça a coloração das seções (nem qualquer outro
    // wiring que venha depois dela) de rodar.
    try { await this._wireTrena3DModoArvore(modal); } catch (e) { console.warn('[MapConfig] _wireTrena3DModoArvore falhou:', e); }
    // [RODADA 139] toggle "📏 Trena 3D" / "➰ Polilinha 3D" (ver comentário
    // grande junto de `#mc-trena3d-modo-toggle` no HTML) — troca `trena3DModo`
    // e re-rotula toda a seção (títulos das subseções) ao vivo.
    try { this._wireTrena3DModoToggle(modal); } catch (e) { console.warn('[MapConfig] _wireTrena3DModoToggle falhou:', e); }
    // [17/09/2026 UTC] NOVO (RODADA 117) — pedido verbatim: "A cor da tira
    // da lateral esquerda deve ser de acordo com a seção, ou seja, toda a
    // seção (suas subseções também) devem ter aquela cor. E cada seção tem
    // a sua cor. A cor deve ser suave, não muito brilhante ou intensa/viva."
    // Ver `_aplicarCoresSecoes` (logo abaixo de `_wireTrena3DModoArvore`).
    try { this._aplicarCoresSecoes(modal); } catch (e) { console.warn('[MapConfig] _aplicarCoresSecoes falhou:', e); }
    modal.querySelector('#mc-trena3d-guia-grade')?.addEventListener('change', () => this._trena3DDesenharPreviewGuiaGrade(modal));
    modal.querySelectorAll('input[name="mc-trena3d-guia-modo"]').forEach((el) => {
      el.addEventListener('change', () => this._trena3DDesenharPreviewGuiaGrade(modal));
    });
    // [16/09/2026 UTC] NOVO — os 2 color-pickers novos também redesenham o
    // preview na hora (mesmo padrão dos outros controles desta subseção).
    modal.querySelector('#mc-trena3d-guia-grade-cor-linha')?.addEventListener('input', () => this._trena3DDesenharPreviewGuiaGrade(modal));
    modal.querySelector('#mc-trena3d-guia-grade-cor-texto')?.addEventListener('input', () => this._trena3DDesenharPreviewGuiaGrade(modal));
    modal.querySelector('#mc-trena3d-grade-snap')?.addEventListener('change', () => this._trena3DDesenharPreviewGradeSnap(modal));
    modal.querySelectorAll('input[name="mc-trena3d-grade-snap-modo"]').forEach((el) => {
      el.addEventListener('change', () => this._trena3DDesenharPreviewGradeSnap(modal));
    });
    // [17/09/2026 UTC] REMOVIDO (RODADA 118) — os 2 listeners de 'input' que
    // ficavam aqui (redesenhar o preview a cada tecla nos antigos
    // `<input type="number">`) ficaram sem efeito depois da conversão pro
    // "botão triplo" (o `<input>` não existe mais); o redesenho ao vivo
    // agora é feito pelo `aposCommit` passado a `_montarBotaoTriplo` acima,
    // que já dispara a cada passo do arraste.

    // ---------- Seção "🚪 Porta / Janela" — mesmo espírito do "Modificador
    // por tecla" da seção 🧱 Parede acima. ----------
    modal.querySelector('#mc-porta-snap-on')?.addEventListener('change', async (e) => { await this.set({ portaSnapCentroBlocoAtivo: e.target.checked }); });
    modal.querySelector('#mc-porta-snap-modificador')?.addEventListener('change', async (e) => { await this.set({ portaSnapModificador: e.target.value }); });
    modal.querySelector('#mc-porta-snap-modificador-inverter')?.addEventListener('change', async (e) => { await this.set({ portaSnapModificadorInvertido: e.target.checked }); });
    // Modo de alinhamento (lista de 3 opções — ver DEFAULTS.
    // portaJanelaModoAlinhamento/objetoModoAlinhamento acima pro pedido do
    // usuário completo e o que cada valor faz). Trocar a opção grava o novo
    // valor E troca qual das 3 descrições (`.d`) fica visível — só uma por
    // vez, a `.hidden` (ver style.css) esconde as outras 2 sem precisar
    // reabrir o painel inteiro pra atualizar o texto.
    const wireModoAlinhamento = (selectEl, descIdPrefix, setKey) => {
      if (!selectEl) return;
      selectEl.addEventListener('change', async (e) => {
        ['personagem', 'cardinal', 'padrao'].forEach((v) => {
          modal.querySelector(`#${descIdPrefix}${v}`)?.classList.toggle('hidden', v !== e.target.value);
        });
        await this.set({ [setKey]: e.target.value });
      });
    };
    wireModoAlinhamento(modal.querySelector('#mc-porta-modo-alinhamento'), 'mc-porta-modo-desc-', 'portaJanelaModoAlinhamento');

    // ---------- Seção "📦 Objeto" — mesmo espírito do bloco de grade da
    // seção 🧱 Parede acima. ----------
    modal.querySelector('#mc-objeto-snap-grade-on')?.addEventListener('change', async (e) => { await this.set({ objetoSnapGradeAtivo: e.target.checked }); });
    modal.querySelector('#mc-objeto-snap-grade-tam')?.addEventListener('change', async (e) => {
      const cm = Utils.clamp(Math.round(Number(e.target.value)) || 20, this.PAREDE_SNAP_GRADE_MIN * 100, this.PAREDE_SNAP_GRADE_MAX * 100);
      e.target.value = cm;
      await this.set({ objetoSnapGradeTamanho: cm / 100 });
    });
    modal.querySelector('#mc-objeto-snap-modificador')?.addEventListener('change', async (e) => { await this.set({ objetoSnapModificador: e.target.value }); });
    modal.querySelector('#mc-objeto-snap-modificador-inverter')?.addEventListener('change', async (e) => { await this.set({ objetoSnapModificadorInvertido: e.target.checked }); });
    // Modo de alinhamento — mesmo wiring (`wireModoAlinhamento`) da seção
    // "🚪 Porta / Janela" acima, ver DEFAULTS.objetoModoAlinhamento.
    wireModoAlinhamento(modal.querySelector('#mc-objeto-modo-alinhamento'), 'mc-objeto-modo-desc-', 'objetoModoAlinhamento');

    // [16/09/2026 UTC] NOVO (RODADA 92) — pedido verbatim: "Ao trocar nas
    // 'configurações 3D' as opções, troca na janelinha automaticamente.
    // Porém, ao trocar na janelinha as opções, acaba por não trocar nas
    // 'configurações 3D' [...] Deve ser vice versa." CAUSA: a janelinha de
    // acesso rápido (view3d.js) já escuta `MapConfig.onChange` e se
    // resincroniza sozinha a cada mudança de config, de QUALQUER origem —
    // mas esta folha de Configurações (o modal aberto por `open()`, este
    // método) NUNCA assinava `MapConfig.onChange` pra resincronizar os
    // PRÓPRIOS `<input>`s dela quando a mudança vinha de FORA do modal (ex.:
    // um clique num botão da janelinha) — os inputs só refletiam o valor
    // que tinham no instante em que o modal foi aberto, ou o que o próprio
    // usuário mudasse DENTRO do modal. CORRIGIDO: resincroniza os
    // checkboxes/radios da seção "📏 Trena 3D" que também existem na
    // janelinha de acesso rápido (`_trena3DOpcoesPainelRapido` em
    // view3d.js) toda vez que a config mudar enquanto este modal estiver
    // aberto — cobre especificamente os campos controláveis pela
    // janelinha (o cenário relatado), não a folha inteira (a maioria dos
    // outros ~200 campos deste modal não tem contraparte fora dele que
    // pudesse mudá-los "por baixo dos panos" enquanto o modal está aberto).
    // `default: 'on'` = campo cujo padrão é ativado (checkbox marcado
    // quando o valor salvo é `undefined`, ou seja, checado via `!== false`
    // no HTML original acima); `default: 'off'` = o oposto (`=== true`).
    const trena3DResyncMapaCheckbox = {
      'mc-trena3d-suprimir-destaque': { campo: 'trena3DSuprimirDestaqueDuranteAncora', default: 'on' },
      'mc-trena3d-altura-antes-ponto': { campo: 'trena3DMostrarAlturaAoVivoAntesDoPonto', default: 'on' },
      'mc-trena3d-continuar-linha-ancora': { campo: 'trena3DContinuarLinhaAncoraAposPonto', default: 'on' },
      'mc-trena3d-mostrar-medida-linha-ancora': { campo: 'trena3DMostrarMedidaNaLinhaAncoraAposPonto', default: 'on' },
      'mc-trena3d-guia-chao-ao-vivo': { campo: 'trena3DMostrarGuiaChaoAoVivo', default: 'off' },
      'mc-trena3d-guia-chao-finalizada': { campo: 'trena3DGuiaChaoFinalizada', default: 'off' },
      'mc-trena3d-superficies-laterais': { campo: 'trena3DPermitirSuperficiesLaterais', default: 'off' },
      'mc-trena3d-continuar-nivel': { campo: 'trena3DContinuarNoNivel', default: 'off' },
      'mc-trena3d-linhas-finalizada': { campo: 'trena3DMostrarLinhasAncoraFinalizada', default: 'off' },
      'mc-trena3d-guia-grade': { campo: 'trena3DGuiaGradeAtiva', default: 'on' },
      'mc-trena3d-guia-grade-finalizada': { campo: 'trena3DGuiaGradeFinalizada', default: 'off' },
      'mc-trena3d-guia-grade-apos-1-ponto': { campo: 'trena3DGuiaGradeAposPrimeiroPonto', default: 'off' },
      'mc-trena3d-grade-snap': { campo: 'trena3DGradeSnapLadrilhoAtiva', default: 'on' },
      // Os 2 checkboxes de "Janela de acesso rápido" (Configurações 2D e
      // 3D) já se sincronizavam entre si via listener próprio — incluídos
      // aqui também, pra cobrir o caso do botão de reabrir (RODADA 92,
      // item 10) mexer no MESMO campo por fora dos 2.
      'mc-trena3d-painel-rapido': { campo: 'trena3DPainelRapidoAtivo', default: 'on' },
      'mc-trena3d-painel-rapido-3d': { campo: 'trena3DPainelRapidoAtivo', default: 'on' },
    };
    const trena3DOnExternalChange = (cNovo) => {
      if (!modal.isConnected) return;
      for (const [id, info] of Object.entries(trena3DResyncMapaCheckbox)) {
        const el = modal.querySelector(`#${id}`);
        if (el && el.type === 'checkbox') {
          el.checked = info.default === 'on' ? (cNovo[info.campo] !== false) : (cNovo[info.campo] === true);
        }
      }
      modal.querySelectorAll('input[name="mc-trena3d-modo-ancora"]').forEach((el) => {
        el.checked = (el.value === 'quatroCliques') === (cNovo.trena3DModoAncora === 'quatroCliques');
      });
      modal.querySelectorAll('input[name="mc-trena3d-painel-rapido-modo"]').forEach((el) => {
        el.checked = (el.value === 'simples') === (cNovo.trena3DPainelRapidoModo === 'simples');
      });
    };
    MapConfig.onChange(trena3DOnExternalChange);
    this._trena3DResyncCleanup = () => {
      MapConfig.offChange(trena3DOnExternalChange);
      this._trena3DPrGruposOnChangeCleanup?.();
      this._trena3DPrGruposOnChangeCleanup = null;
    };
  },

  /** NOVO (07/09/2026), pedido verbatim: "Deve haver um botão para definir
   *  o snap [de rotação do mapa 2D] que varia de 1 grau até 180 graus. Ao
   *  clicar nesse botão e arrastar o valor é alterado com o passo de 1 grau.
   *  O cursor infinito deve ficar ativo para isso. Ao clicar, apenas,
   *  abre-se uma janelinha de diálogo para definir o valor de snap de
   *  rotação do mapa." — liga o botão `#mc-rot2d-snap-btn` (ver HTML da
   *  seção "🔄 Rotação do mapa 2D" em `open()`) aos 2 gestos: um
   *  clique-e-ARRASTE ajusta de 1 em 1 grau por `PX_POR_GRAU` pixels
   *  arrastados, com Pointer Lock ("cursor infinito" — mesmo padrão/mesma
   *  técnica já usada pelo preview de rotação da roda de fotos, ver
   *  mapview.js `_wireFotoPinPreviewOrbit`/`opts.infiniteCursor`); um
   *  CLIQUE simples (sem arrastar — `moved` continua `false`) abre o
   *  diálogo numérico (`_openMapRotationSnapDialog` abaixo). Grava direto
   *  via `DB.setSetting` (chave `mapa2dRotacaoSnapGraus`, mesma lida em
   *  `open()`/mapview.js `_mountPlanta`), fora do blob `mapa3dConfig` —
   *  mesmo padrão de `fotosMarcarAquiAcao`. */
  _wireMapRotationSnapBtn(btn) {
    if (!btn || btn.dataset.snapWired) return; // nunca religa 2x no mesmo botão (modal pode reabrir)
    btn.dataset.snapWired = '1';
    const PX_POR_GRAU = 6; // sensibilidade do arrasto — 6px arrastados = 1°
    let dragging = false, moved = false, accumPx = 0, lastClientX = 0;
    let valorAtual = parseInt((btn.textContent.match(/\d+/) || [15])[0], 10) || 15;
    const commitValor = async (graus) => {
      valorAtual = Utils.clamp(Math.round(graus) || 1, 1, 180);
      btn.textContent = `🔄 ${valorAtual}°`;
      if (window.MapView) window.MapView._mapRotationSnapGraus = valorAtual;
      await DB.setSetting('mapa2dRotacaoSnapGraus', valorAtual);
      return valorAtual;
    };
    btn.style.touchAction = 'none';
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true; moved = false; accumPx = 0; lastClientX = e.clientX;
      try { btn.requestPointerLock?.(); } catch (_) { /* navegador sem suporte — cai pro arrasto normal, com fronteira de tela */ }
      e.preventDefault();
    });
    btn.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const usandoLock = document.pointerLockElement === btn;
      const dx = usandoLock ? (e.movementX || 0) : (e.clientX - lastClientX);
      lastClientX = e.clientX;
      accumPx += dx;
      if (Math.abs(accumPx) >= PX_POR_GRAU) {
        const passos = Math.trunc(accumPx / PX_POR_GRAU);
        accumPx -= passos * PX_POR_GRAU;
        moved = true;
        commitValor(valorAtual + passos);
      }
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      if (document.pointerLockElement === btn) { try { document.exitPointerLock(); } catch (_) { /* ignorado */ } }
      // Clique PARADO (sem arrastar de verdade) — abre o diálogo numérico
      // em vez de só soltar o arrasto (pedido verbatim: "Ao clicar, apenas,
      // abre-se uma janelinha de diálogo").
      if (!moved) this._openMapRotationSnapDialog(valorAtual, commitValor);
    };
    btn.addEventListener('pointerup', endDrag);
    btn.addEventListener('pointercancel', () => {
      dragging = false;
      if (document.pointerLockElement === btn) { try { document.exitPointerLock(); } catch (_) { /* ignorado */ } }
    });
  },

  /** Janelinha simples (mesmo padrão visual de outros modais pequenos do
   *  app, ex. ambientephotos.js `_openMedidaValorModal`) com um campo
   *  numérico único pra digitar o snap de rotação direto (1°–180°). */
  _openMapRotationSnapDialog(valorInicial, commitValor) {
    document.getElementById('mc-rot2d-snap-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'mc-rot2d-snap-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet" style="max-width:320px">
        <div class="handle"></div>
        <h3 style="margin-top:0">🔄 Snap de rotação do mapa</h3>
        <label class="field">
          <span class="lbl">De quantos em quantos graus (1° a 180°)</span>
          <input type="number" id="mc-rot2d-snap-input" min="1" max="180" step="1" value="${valorInicial}">
        </label>
        <div style="display:flex; gap:10px; margin-top:6px">
          <button type="button" class="btn secondary" id="mc-rot2d-snap-cancelar" style="flex:1">Cancelar</button>
          <button type="button" class="btn" id="mc-rot2d-snap-salvar" style="flex:1">✅ Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('#mc-rot2d-snap-input');
    setTimeout(() => { input.focus(); input.select(); }, 30);
    const fechar = () => modal.remove();
    modal.querySelector('#mc-rot2d-snap-cancelar').onclick = fechar;
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) fechar(); });
    const salvar = async () => {
      const v = parseInt(input.value, 10);
      if (Number.isFinite(v)) await commitValor(v);
      fechar();
    };
    modal.querySelector('#mc-rot2d-snap-salvar').onclick = salvar;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
  },

  /** [17/09/2026 UTC] NOVO — pedido verbatim: "Toda a opção deve ter uma
   *  prévia em formato de ícone renderizada como aparece na cena. A app tem
   *  capacidade para gerar várias telas e é possível 'simular' colocar
   *  objetos em cena. Monte uma cena usando recursos do Three.js simula as
   *  opções renderize e construa as prévias (se possível interagíveis, se
   *  não 'screenshots' da cena renderizada)." Diferente dos previews de
   *  `<canvas>` 2D já existentes (`_trena3DDesenharPreviewGuiaChao`/
   *  `_trena3DDesenharPreviewGuiaGrade`, ilustrações desenhadas à mão com
   *  `ctx.lineTo` etc.), este é um RENDER DE VERDADE de uma cena 3D
   *  miniatura, usando as MESMAS primitivas do Three.js que a Trena 3D
   *  real usa (`THREE.Line`/`LineDashedMaterial`, `THREE.Mesh`/
   *  `SphereGeometry`, `THREE.Sprite` com um `CanvasTexture` pro texto da
   *  medida) — só que numa cena pequena e fixa (chão quadriculado + 1
   *  "objeto" de referência), renderizada 1 ÚNICA VEZ por
   *  `THREE.WebGLRenderer.render()` e capturada como PNG
   *  (`renderer.domElement.toDataURL()`) — não é "ao vivo"/interativa (a
   *  cena de verdade muda a cada frame; o próprio pedido já antecipa
   *  "screenshots" como alternativa aceitável quando não for interativo).
   *  `window.THREE` já está GARANTIDO disponível aqui: toda esta seção
   *  "📏 Trena 3D" só existe dentro do contexto '3d' (`opts.context ===
   *  '3d'`), só alcançável abrindo "Configurações 3D" de DENTRO do "Ver em
   *  3D" — onde `engine3d.js`/`view3d.js` já carregaram o Three.js antes
   *  disso. Resultado cacheado por `chave` em `_trena3DPreviewIconCache`
   *  (um `Map`) — cada ícone só é renderizado 1x por sessão do app,
   *  mesmo que a opção correspondente seja redesenhada várias vezes (ex.
   *  toda vez que o modal reabre). */
  _trena3DGerarPreviewIcone(chave, montar) {
    if (!this._trena3DPreviewIconCache) this._trena3DPreviewIconCache = new Map();
    if (this._trena3DPreviewIconCache.has(chave)) return this._trena3DPreviewIconCache.get(chave);
    if (typeof THREE === 'undefined') return null;
    const TAM = 56;
    try {
      if (!this._trena3DPreviewRenderer) {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setSize(TAM, TAM, false);
        renderer.setClearColor(0x14161c, 1);
        this._trena3DPreviewRenderer = renderer;
      }
      const renderer = this._trena3DPreviewRenderer;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
      camera.position.set(2.5, 2.0, 2.5);
      camera.lookAt(0, 0.55, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 0.95));
      const dir = new THREE.DirectionalLight(0xffffff, 0.55);
      dir.position.set(3, 5, 2);
      scene.add(dir);
      // Chão quadriculado 3×3m (mesma escala do ladrilho de 1m do mundo
      // real, ver `_trena3DAtualizarGradeSnapLadrilho`) — dá o mesmo
      // contexto espacial em TODOS os ícones, pra ficarem visualmente
      // consistentes entre si.
      scene.add(new THREE.GridHelper(3, 6, 0x3a3f4a, 0x24262e));
      const chaoBase = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: 0x1c1e24, transparent: true, opacity: 0.55 }));
      chaoBase.rotation.x = -Math.PI / 2;
      chaoBase.position.y = -0.004;
      scene.add(chaoBase);
      // "Kit" de primitivas — cada `spec` (ver tabela `_trena3DPreviewSpecs`
      // logo abaixo) chama estas funções pra montar só os elementos que
      // aquela opção precisa mostrar.
      const addLinha = (a, b, cor, tracejada) => {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
        const mat = tracejada
          ? new THREE.LineDashedMaterial({ color: cor, dashSize: 0.09, gapSize: 0.06 })
          : new THREE.LineBasicMaterial({ color: cor });
        const linha = new THREE.Line(geo, mat);
        if (tracejada) linha.computeLineDistances();
        scene.add(linha);
      };
      const addEsfera = (p, cor, r = 0.055) => {
        const esf = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), new THREE.MeshBasicMaterial({ color: cor }));
        esf.position.set(...p);
        scene.add(esf);
      };
      const addCone = (p, cor, raio = 0.08, altura = 0.16, rotXDeg = 0) => {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(raio, altura, 12), new THREE.MeshBasicMaterial({ color: cor }));
        cone.position.set(...p);
        cone.rotation.x = (rotXDeg * Math.PI) / 180;
        scene.add(cone);
      };
      const addCaixa = (p, cor, largura = 0.5, altura = 1.1, prof = 0.06) => {
        const caixa = new THREE.Mesh(new THREE.BoxGeometry(prof, altura, largura), new THREE.MeshStandardMaterial({ color: cor, roughness: 0.9 }));
        caixa.position.set(...p);
        scene.add(caixa);
      };
      const addTexto = (p, texto, cor) => {
        const c = document.createElement('canvas'); c.width = 160; c.height = 48;
        const ctx = c.getContext('2d');
        ctx.font = 'bold 26px system-ui, sans-serif';
        ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(texto, 80, 24);
        const tex = new THREE.CanvasTexture(c);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        spr.scale.set(0.85, 0.26, 1);
        spr.position.set(...p);
        scene.add(spr);
      };
      montar({ addLinha, addEsfera, addCone, addCaixa, addTexto, THREE, scene });
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      // Limpeza — descarta geometrias/materiais desta cena (o `renderer`
      // em si é reaproveitado entre ícones, só a `scene` é descartável).
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) { if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose()); else obj.material.dispose(); }
      });
      this._trena3DPreviewIconCache.set(chave, dataUrl);
      return dataUrl;
    } catch (e) {
      // Rede de segurança — se o WebGL falhar por qualquer motivo (driver,
      // contexto perdido, etc.), a opção continua funcionando normalmente,
      // só sem o ícone (não quebra o resto do modal).
      console.warn('[MapConfig] Falha ao gerar prévia 3D da Trena 3D:', chave, e);
      return null;
    }
  },

  /** [17/09/2026 UTC] NOVO (RODADA 114) — HTML compartilhado pelos novos
   *  controles de "espessura/estilo/dash" pedidos pro mesmo formato em 3
   *  subseções distintas ("Guia de grade do mundo", "Guia rente ao chão",
   *  "Linhas verticais ancoradas") — pedido verbatim: "além de poder
   *  controlar a cor, deve ser possível definir a espessura das linhas
   *  guia e se são sólida, tracejada ou pontilhada. o line dash deve ser
   *  possível controlar (quando aplicável)." Em vez de repetir o mesmo
   *  bloco de HTML 3 vezes (arriscado — fácil dessincronizar as 3 cópias
   *  numa rodada futura), esta função gera o bloco 1 vez, parametrizado por
   *  `prefixoId` (prefixo dos `id=`/`name=` dos campos, ex.
   *  'mc-trena3d-guia-grade') e `prefixoCampo` (prefixo do NOME do campo de
   *  config lido de `cfg`, ex. 'trena3DGuiaGrade' → lê/escreve
   *  `trena3DGuiaGradeEspessuraCm`/`EstiloLinha`/`DashCm`/`GapCm`).
   *  `opts.comPontas` (opcional) acrescenta a escolha de ponta SIMPLIFICADA
   *  pedida pra "Guia rente ao chão" — pedido verbatim: "deve ser possível
   *  escolher as pontas também (como a explicação toda já está na seção
   *  '📏 Trena 3D — Pontas', então, aqui, deve ser algo bem mais simples)":
   *  só os 5 radios com o mesmo ícone/nome da seção "Pontas", sem nenhuma
   *  das subopções de tamanho/dimensão de lá. Ver `_wireTrena3DEstiloLinha`
   *  (wiring) e `view3d.js#_trena3DBuildLinhaEstilizadaUmaVez`/
   *  `_trena3DAtualizarLinhaEstilizadaAoVivo` (renderização de verdade). */
  _trena3DCamposEstiloLinha(prefixoId, prefixoCampo, cfg, opts = {}) {
    const espessura = Utils.clamp(Number(cfg[`${prefixoCampo}EspessuraCm`]) || opts.espessuraPadrao || 1, 0.1, 15);
    const estiloBruto = cfg[`${prefixoCampo}EstiloLinha`];
    const estilo = (estiloBruto === 'tracejada' || estiloBruto === 'pontilhada') ? estiloBruto : (estiloBruto === 'solida' ? 'solida' : (opts.estiloPadrao || 'solida'));
    const dash = Utils.clamp(Number(cfg[`${prefixoCampo}DashCm`]) || opts.dashPadrao || 12, 0.2, 100);
    const gap = Utils.clamp(Number(cfg[`${prefixoCampo}GapCm`]) || opts.gapPadrao || 8, 0.2, 100);
    const mostraDash = estilo === 'tracejada' || estilo === 'pontilhada';
    let html = `
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:6px 0 4px 0">
            <div style="display:flex; flex-direction:column; gap:2px; flex:0 0 auto; min-width:150px">
              <span class="lbl">Espessura (cm)</span>
              <div id="${prefixoId}-espessura-triplo" data-valor="${espessura}"></div>
            </div>
          </div>
          <div style="margin:0 0 6px 0">
            <label class="radio-opt" style="display:inline-flex; margin:0 10px 0 0">
              <input type="radio" name="${prefixoId}-estilo" value="solida" ${estilo === 'solida' ? 'checked' : ''}>
              <span><span class="t">Sólida</span></span>
            </label>
            <label class="radio-opt" style="display:inline-flex; margin:0 10px 0 0">
              <input type="radio" name="${prefixoId}-estilo" value="tracejada" ${estilo === 'tracejada' ? 'checked' : ''}>
              <span><span class="t">Tracejada</span></span>
            </label>
            <label class="radio-opt" style="display:inline-flex; margin:0">
              <input type="radio" name="${prefixoId}-estilo" value="pontilhada" ${estilo === 'pontilhada' ? 'checked' : ''}>
              <span><span class="t">Pontilhada</span></span>
            </label>
          </div>
          <div id="${prefixoId}-dash-wrap" style="display:${mostraDash ? 'flex' : 'none'}; align-items:center; gap:10px; flex-wrap:wrap; margin:0 0 8px 0">
            <div style="display:flex; flex-direction:column; gap:2px; flex:0 0 auto; min-width:130px">
              <span class="lbl">Traço (cm)</span>
              <div id="${prefixoId}-dash-triplo" data-valor="${dash}"></div>
            </div>
            <div style="display:flex; flex-direction:column; gap:2px; flex:0 0 auto; min-width:130px">
              <span class="lbl">Espaço (cm)</span>
              <div id="${prefixoId}-gap-triplo" data-valor="${gap}"></div>
            </div>
          </div>`;
    if (opts.comPontas) {
      const pontaBruta = cfg[`${prefixoCampo}Ponta`];
      const ponta = ['nenhuma', 'esfera', 'seta', 'setaDoisTracos', 'traco'].includes(pontaBruta) ? pontaBruta : 'nenhuma';
      const opcoes = [
        ['nenhuma', 'Sem pontas'], ['esfera', 'Esfera'], ['seta', 'Seta'], ['setaDoisTracos', '2 traços'], ['traco', 'Traço'],
      ];
      html += `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:2px 0 6px 0">`;
      opcoes.forEach(([v, label]) => {
        html += `<label class="radio-opt" style="display:inline-flex; margin:0">
              <input type="radio" name="${prefixoId}-ponta" value="${v}" ${ponta === v ? 'checked' : ''}>
              <span><span class="t">${label}</span></span>
            </label>`;
      });
      html += `</div><span class="d" style="display:block; margin:0 0 8px 0">Mesmas opções de "📏 Trena 3D — Pontas" (ver lá a explicação de cada uma) — aqui simplificado, sem as subopções de tamanho/dimensão.</span>`;
    }
    return html;
  },

  /** [17/09/2026 UTC] NOVO (RODADA 114) — liga os campos gerados por
   *  `_trena3DCamposEstiloLinha` (mesmos `prefixoId`/`prefixoCampo` — ver
   *  comentário grande lá) aos respectivos campos de config via `this.set`,
   *  e mostra/esconde `#${prefixoId}-dash-wrap` ao trocar sólida ↔
   *  tracejada/pontilhada.
   *  [17/09/2026, RODADA 116] ATUALIZADO — pedido verbatim: "Este mesmo
   *  tipo de botão [o 'botão triplo', ver o apelido/glossário no comentário
   *  de `ModelerUI._createNumField`, js/modeler/modeler-ui.js] deve ser
   *  colocado nas 'configurações 3D' onde tiver alguma variação de valor."
   *  Espessura/Traço/Espaço (antes `<input type="number">` simples, só
   *  reagia a `change` — perdia foco/soltar o Enter) agora usam o MESMO
   *  widget "botão triplo" do Modelador (`ModelerUI._createNumField`, já
   *  carregado antes deste arquivo — ver `<script>` em index.html): arrasta
   *  pra variar continuamente, ou clica nas setas ◄► pra passo fixo — a
   *  aplicação do valor (`onCommit`) já é IMEDIATA a cada passo/arraste, não
   *  só ao perder o foco, o que também ajuda no bug corrigido nesta mesma
   *  rodada de "Espessura" não refletindo ao vivo no cenário sem precisar
   *  mexer em outra opção (ver `view3d.js`). Primeira leva de campos
   *  convertidos (as 3 subseções que já usam este helper compartilhado);
   *  os demais campos numéricos de "configurações 3D" (fora deste helper)
   *  ficam para uma rodada futura de conversão sistemática — ver
   *  progresso-sessao.md pra o inventário do que falta. */
  _wireTrena3DEstiloLinha(modal, prefixoId, prefixoCampo, opts = {}) {
    // `_debouncedPersist` (ver comentário grande lá, logo depois de
    // `onChange` acima) — aplica na hora (`previewSet`, grátis) a cada
    // passo do arraste do "botão triplo" e só GRAVA de verdade (`set`, no
    // IndexedDB) quando o gesto para por `delayMs` — evita gravar a cada
    // pixel arrastado, igual ao padrão já usado pela trilha de "Hora do dia".
    const montarBotaoTriplo = (idMount, { step, minDecimals, min, max, chave, onValor }) => {
      const mount = modal.querySelector(`#${idMount}`);
      if (!mount || typeof window.ModelerUI?._createNumField !== 'function') return;
      const valorInicial = Utils.clamp(Number(mount.dataset.valor) || min, min, max);
      const campo = window.ModelerUI._createNumField({
        value: valorInicial, step, minDecimals,
        onCommit: (v) => this._debouncedPersist(chave, onValor(Utils.clamp(v, min, max))),
      });
      mount.appendChild(campo.el);
    };
    montarBotaoTriplo(`${prefixoId}-espessura-triplo`, {
      step: 0.1, minDecimals: 1, min: 0.1, max: 1000, chave: `${prefixoId}-espessura`,
      onValor: (v) => ({ [`${prefixoCampo}EspessuraCm`]: v || (opts.espessuraPadrao || 1) }),
    });
    modal.querySelectorAll(`input[name="${prefixoId}-estilo"]`).forEach((r) => {
      r.addEventListener('change', async (e) => {
        if (!e.target.checked) return;
        await this.set({ [`${prefixoCampo}EstiloLinha`]: e.target.value });
        const wrap = modal.querySelector(`#${prefixoId}-dash-wrap`);
        if (wrap) wrap.style.display = (e.target.value === 'tracejada' || e.target.value === 'pontilhada') ? 'flex' : 'none';
      });
    });
    montarBotaoTriplo(`${prefixoId}-dash-triplo`, {
      step: 0.2, minDecimals: 1, min: 0.2, max: 100, chave: `${prefixoId}-dash`,
      onValor: (v) => ({ [`${prefixoCampo}DashCm`]: v || (opts.dashPadrao || 12) }),
    });
    montarBotaoTriplo(`${prefixoId}-gap-triplo`, {
      step: 0.2, minDecimals: 1, min: 0.2, max: 100, chave: `${prefixoId}-gap`,
      onValor: (v) => ({ [`${prefixoCampo}GapCm`]: v || (opts.gapPadrao || 8) }),
    });
    if (opts.comPontas) {
      modal.querySelectorAll(`input[name="${prefixoId}-ponta"]`).forEach((r) => {
        r.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ [`${prefixoCampo}Ponta`]: e.target.value }); });
      });
    }
  },

  /** [17/09/2026 UTC] NOVO (RODADA 118) — "botão triplo" GENÉRICO pra um
   *  campo numérico AVULSO (fora do grupo Espessura/Traço/Espaço de
   *  `_trena3DCamposEstiloLinha`/`_wireTrena3DEstiloLinha` acima). Pedido
   *  verbatim: "Algumas subseções da seção 'Trena 3D' [...] ficaram sem o
   *  'botão triplo', por exemplo: 'Snap', 'Espessura e cores', 'Pontas' e
   *  'Gradeado do ladrilho mirado'." Uso: no HTML, troca o
   *  `<input type="number" id="X">` por `<div id="X" data-valor="...">`
   *  (mesmo `id`); no JS (aqui em `_wireTrena3D...`), chama
   *  `this._montarBotaoTriplo(modal, 'X', {step, minDecimals, min, max,
   *  chave: 'X', aoCommit: (v) => ({ campoDeConfig: v })})`. Assim como
   *  `montarBotaoTriplo` (função local de `_wireTrena3DEstiloLinha`), usa
   *  `_debouncedPersist` — aplica na hora via `previewSet`, só GRAVA no
   *  IndexedDB depois do gesto parar. Como o `<input>` deixa de existir,
   *  todo código que antes lia `.value` deste campo (ex. os previews em
   *  canvas de "Snap"/"Gradeado do ladrilho mirado") passa a ler
   *  `.dataset.valor` do mesmo elemento (atualizado a cada `onCommit`
   *  aqui). `opts.aposCommit(valorClampado)` (opcional) roda depois do
   *  `_debouncedPersist`, pra redesenhar previews em tempo real durante o
   *  próprio arraste (sem esperar o debounce de gravação). */
  _montarBotaoTriplo(modal, id, { step, minDecimals = 0, min, max, chave, aoCommit, aposCommit }) {
    const mount = modal.querySelector(`#${id}`);
    if (!mount || typeof window.ModelerUI?._createNumField !== 'function') return null;
    // [17/09/2026 UTC] CORRIGIDO (RODADA 119) — `Number(...) || min` tratava
    // um `data-valor="0"` válido como "ausente" (0 é falsy em JS) e caía
    // sempre no `min` — inofensivo enquanto todo campo convertido tinha
    // `min` positivo (nunca havia 0 de verdade no meio da faixa), mas quebra
    // os novos campos de deslocamento vertical (RODADA 119, `min` negativo,
    // padrão exatamente 0 — "0 = no meio", pedido verbatim). Trocado por um
    // teste explícito de `NaN` (`Number('')`/`Number(undefined)` são `NaN`,
    // únicos casos que devem cair no fallback).
    const valorBruto = Number(mount.dataset.valor);
    const valorInicial = Utils.clamp(Number.isNaN(valorBruto) ? min : valorBruto, min, max);
    const campo = window.ModelerUI._createNumField({
      value: valorInicial, step, minDecimals,
      onCommit: (v) => {
        const vAnterior = Number(mount.dataset.valor);
        const vc = Utils.clamp(v, min, max);
        // [18/09/2026 UTC] NOVO (RODADA 136) — pedido verbatim: quando o
        // usuário segura o botão de incrementar/decrementar e o valor já
        // está no limite (min/max), o clamp faz `vc` ficar igual ao valor
        // anterior e nada muda visualmente — sem indicação de que bateu no
        // limite. Detecta esse caso (valor bruto pedido `v` diferente do
        // clampado `vc`, ou `vc` igual ao `vAnterior` já no limite) e dá um
        // feedback rápido: flash de borda vermelha no próprio elemento do
        // botão triplo por ~200ms. Mudança central aqui — vale para todos
        // os usos de `_montarBotaoTriplo` de uma vez, sem tocar em cada
        // chamada individual.
        if (v !== vc || (!Number.isNaN(vAnterior) && vc === vAnterior && (vc === min || vc === max))) {
          this._flashLimiteBotaoTriplo(mount);
        }
        mount.dataset.valor = vc;
        this._debouncedPersist(chave, aoCommit(vc));
        if (typeof aposCommit === 'function') aposCommit(vc);
      },
    });
    mount.appendChild(campo.el);
    return campo;
  },

  /** [18/09/2026 UTC] NOVO (RODADA 136) — feedback visual de "bateu no
   *  limite" usado por `_montarBotaoTriplo`: aplica um flash de borda
   *  vermelha (outline) por ~200ms no elemento do botão triplo. Reaproveita
   *  um timer guardado em `dataset` pra não empilhar timeouts se o usuário
   *  seguir segurando o botão (limite continua batendo a cada tick). */
  _flashLimiteBotaoTriplo(mount) {
    if (!mount) return;
    if (mount._flashLimiteTimer) clearTimeout(mount._flashLimiteTimer);
    mount.style.outline = '2px solid #ff5555';
    mount.style.outlineOffset = '1px';
    mount.style.borderRadius = mount.style.borderRadius || '4px';
    mount._flashLimiteTimer = setTimeout(() => {
      mount.style.outline = '';
      mount.style.outlineOffset = '';
      mount._flashLimiteTimer = null;
    }, 200);
  },

  /** [17/09/2026 UTC] NOVO (RODADA 119) — pedido verbatim: "Deve ser
   *  possível controlar a distância da caixa do texto em relação [ao ponto
   *  médio 'mAB' da reta 3D] [...] Sendo exatamente no ponto o 0, acima
   *  dele valores positivos e abaixo dele valores negativos." HTML do
   *  controle (1 "botão triplo" + rótulo explicativo curto), reaproveitado
   *  nas 4 subseções pedidas. `opts.comLinhaVertical` (só usado por "Linhas
   *  guia da grade do mundo") acrescenta o checkbox de habilitar a linha
   *  vertical de apoio (ver view3d.js
   *  `_trena3DAtualizarLinhaVerticalDoLabel`/`_trena3DConstruirLinhaVerticalDoLabelFinalizada`).
   *  Ver `_wireTrena3DDeslocVerticalLabel` (wiring). */
  _trena3DCampoDeslocVerticalLabel(idBase, valorM, opts = {}) {
    const v = Utils.clamp(Number(valorM) || 0, -3, 3);
    let html = `
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:8px 0 2px 0">
            <div style="display:flex; flex-direction:column; gap:2px; flex:0 0 auto; min-width:160px">
              <span class="lbl">Posição do texto (m)</span>
              <div id="${idBase}-desloc-triplo" data-valor="${v}" title="Distância, em metros, ao longo da linha vertical que passa pelo ponto médio da medida, onde o rótulo de texto (valor da medida) é posicionado. 0 = exatamente no ponto médio; valores positivos deslocam o texto para cima; valores negativos, para baixo."></div>
            </div>
          </div>
          <span class="d" style="display:block; margin:0 0 6px 0">Desloca a caixa de texto ao longo de uma linha vertical (perpendicular ao chão) que passa pelo ponto médio da própria reta 3D da medida — <b>0</b> é exatamente nesse ponto médio, valores <b>positivos</b> deslocam para cima, <b>negativos</b> para baixo.</span>`;
    if (opts.comLinhaVertical) {
      html += `
          <label class="radio-opt">
            <input type="checkbox" id="${idBase}-desloc-linha-vertical" ${opts.linhaVerticalAtiva ? 'checked' : ''}>
            <span><span class="t">Mostrar a linha vertical usada para deslocar o texto</span><br><span class="d">Só aparece quando a "Posição do texto" acima for diferente de 0 — ajuda a identificar visualmente até onde o texto foi deslocado a partir do ponto médio real.</span></span>
          </label>`;
    }
    return html;
  },

  /** [17/09/2026 UTC] NOVO (RODADA 119) — liga o "botão triplo" gerado por
   *  `_trena3DCampoDeslocVerticalLabel` (mesmo `idBase`) ao campo de config
   *  `chave` (um dos 4 `trena3D*LabelDeslocVerticalM`, ver DEFAULTS), e —
   *  quando `opts.chaveLinhaVertical` for passado — o checkbox opcional ao
   *  campo booleano correspondente (só "Linhas guia da grade do mundo"). */
  _wireTrena3DDeslocVerticalLabel(modal, idBase, chave, opts = {}) {
    this._montarBotaoTriplo(modal, `${idBase}-desloc-triplo`, {
      step: 0.05, minDecimals: 2, min: -3, max: 3, chave: `${idBase}-desloc`,
      aoCommit: (v) => ({ [chave]: v }),
    });
    if (opts.chaveLinhaVertical) {
      modal.querySelector(`#${idBase}-desloc-linha-vertical`)?.addEventListener('change', async (e) => {
        await this.set({ [opts.chaveLinhaVertical]: e.target.checked });
      });
    }
  },

  /** [17/09/2026 UTC] NOVO (RODADA 113) — pedido verbatim: "elas devem
   *  fixar em cache quando já estiverem prontas, para que não tenham de ser
   *  renderizadas toda vez que se clica no botão 'configurações 3D'."
   *  Carrega (1x por sessão, guardado por `_trena3DPreviewCacheDiscoCarregado`)
   *  o cache de prévias já geradas anteriormente, persistido em disco via
   *  `DB.setSetting`/`DB.getSetting` — sobrevive a reinícios do app (o
   *  `Map` em memória, `_trena3DPreviewIconCache`, some a cada reload; este
   *  aqui não). Entradas já presentes no `Map` em memória (geradas nesta
   *  mesma sessão, antes deste carregamento) NUNCA são sobrescritas pelo
   *  valor do disco — o disco só preenche o que ainda falta. */
  async _trena3DCarregarPreviewCacheDoDisco() {
    if (this._trena3DPreviewCacheDiscoCarregado) return;
    this._trena3DPreviewCacheDiscoCarregado = true;
    if (!this._trena3DPreviewIconCache) this._trena3DPreviewIconCache = new Map();
    try {
      const salvo = await DB.getSetting('trena3DPreviewIconesCacheV1', null);
      if (salvo && typeof salvo === 'object') {
        Object.keys(salvo).forEach((chave) => {
          if (!this._trena3DPreviewIconCache.has(chave)) this._trena3DPreviewIconCache.set(chave, salvo[chave]);
        });
      }
    } catch (e) {
      console.warn('[MapConfig] Falha ao carregar cache de prévias 3D da Trena 3D:', e);
    }
  },

  /** [17/09/2026 UTC] NOVO (RODADA 113) — salva o `Map` inteiro de prévias
   *  já geradas (`_trena3DPreviewIconCache`) no disco (`DB.setSetting`),
   *  pra sobreviver a um reinício do app — chamado toda vez que um ícone
   *  NOVO é gerado (ver `trena3DPreAquecerPreviewsEmSegundoPlano`/
   *  `_trena3DPreviewImgTag` logo abaixo). */
  async _trena3DSalvarPreviewCacheNoDisco() {
    try {
      const obj = {};
      (this._trena3DPreviewIconCache || new Map()).forEach((v, k) => { obj[k] = v; });
      await DB.setSetting('trena3DPreviewIconesCacheV1', obj);
    } catch (e) {
      console.warn('[MapConfig] Falha ao salvar cache de prévias 3D da Trena 3D:', e);
    }
  },

  /** [17/09/2026 UTC] NOVO (RODADA 113) — pedido verbatim: "Até para a
   *  primeira vez que as prévias são geradas, elas devem ser feitas em
   *  segundo plano para já ficarem prontas caso ainda não se tenha uma
   *  prévia já cacheada." Chamado (fire-and-forget) assim que "Ver em 3D"
   *  monta (`view3d.js#mount`) — bem antes do usuário conseguir abrir
   *  "Configurações 3D". Gera, em segundo plano (via `requestIdleCallback`,
   *  fallback `setTimeout`, um de cada vez pra nunca travar a thread
   *  principal por muito tempo), toda prévia que AINDA não esteja em cache
   *  (nem em memória, nem em disco) — na prática, quando o usuário abrir o
   *  modal de verdade, a maioria (ou todas) já estarão prontas. Se o modal
   *  já estiver aberto (ex.: usuário reabriu rápido), atualiza também
   *  qualquer `<img data-mc-preview-chave="...">` já presente no DOM. */
  async trena3DPreAquecerPreviewsEmSegundoPlano() {
    await this._trena3DCarregarPreviewCacheDoDisco();
    const chaves = Object.keys(this._trena3DPreviewSpecs || {});
    const pendentes = chaves.filter((c) => !this._trena3DPreviewIconCache.has(c));
    if (!pendentes.length) return;
    const agendar = (typeof requestIdleCallback === 'function')
      ? (fn) => requestIdleCallback(fn, { timeout: 500 })
      : (fn) => setTimeout(fn, 60);
    let algumaNova = false;
    const processarUm = () => {
      const chave = pendentes.shift();
      if (chave) {
        const src = this._trena3DGerarPreviewIcone(chave, this._trena3DPreviewSpecs[chave]);
        if (src) {
          algumaNova = true;
          document.querySelectorAll(`img[data-mc-preview-chave="${chave}"]`).forEach((img) => { img.src = src; });
        }
      }
      if (pendentes.length) agendar(processarUm);
      else if (algumaNova) this._trena3DSalvarPreviewCacheNoDisco();
    };
    agendar(processarUm);
  },

  /** Devolve o HTML de um `<img>` já pronto pra uma `chave` de
   *  `_trena3DPreviewSpecs` (ver logo abaixo) — string vazia se a `chave`
   *  não existir na tabela de especificações.
   *  [17/09/2026 UTC] REESCRITO (RODADA 113) — pedido verbatim: "para que
   *  não tenham de ser renderizadas toda vez que se clica no botão
   *  'configurações 3D' (o que causaria um gargalo e demoraria para abrir a
   *  janela)." A versão anterior (RODADA 111) renderizava a prévia
   *  SINCRONAMENTE, aqui mesmo, na hora de montar o HTML do modal — com
   *  ~19 ícones distintos, era um gargalo real na 1ª abertura de cada
   *  sessão. CORRIGIDO: se a `chave` já está no cache em memória (a maioria
   *  das vezes, graças ao pré-aquecimento em segundo plano — ver
   *  `trena3DPreAquecerPreviewsEmSegundoPlano` — disparado bem antes, ao
   *  montar "Ver em 3D"), devolve o `<img>` já com `src` pronto,
   *  instantâneo. Senão (ainda não cacheada — ex.: 1ª vez, antes do
   *  pré-aquecimento terminar), devolve um `<img>` SEM `src` (só o
   *  placeholder, com as mesmas dimensões — não deixa "buraco" no layout)
   *  e agenda a geração pra rodar logo em seguida (`setTimeout(...,0)`,
   *  fora do fluxo síncrono de montagem do modal), atualizando a imagem no
   *  lugar quando ficar pronta — o modal NUNCA espera o WebGL renderizar
   *  pra abrir, nem na 1ª vez. */
  _trena3DPreviewImgTag(chave) {
    const spec = this._trena3DPreviewSpecs[chave];
    if (!spec) return '';
    if (!this._trena3DPreviewIconCache) this._trena3DPreviewIconCache = new Map();
    const estilo = 'border-radius:6px; border:1px solid rgba(255,255,255,0.14); vertical-align:-13px; margin-right:6px; background:#14161c; flex:0 0 auto';
    // [17/09/2026 UTC] classe `mc-trena3d-preview-icon` (RODADA 110, item 6)
    // segue igual — pro modo árvore/lista conseguir esconder só estes
    // ícones via CSS (ver `.mapconfig-sheet--trena3d-arvore` em css/style.css).
    const cacheado = this._trena3DPreviewIconCache.get(chave);
    if (cacheado) {
      return `<img class="mc-trena3d-preview-icon" data-mc-preview-chave="${chave}" src="${cacheado}" width="40" height="40" style="${estilo}" alt="">`;
    }
    setTimeout(() => {
      if (this._trena3DPreviewIconCache.has(chave)) return; // já foi gerado por outra via (ex.: pré-aquecimento terminou antes) enquanto este timeout esperava
      const src = this._trena3DGerarPreviewIcone(chave, spec);
      if (!src) return;
      document.querySelectorAll(`img[data-mc-preview-chave="${chave}"]`).forEach((img) => { img.src = src; });
      this._trena3DSalvarPreviewCacheNoDisco();
    }, 0);
    return `<img class="mc-trena3d-preview-icon" data-mc-preview-chave="${chave}" width="40" height="40" style="${estilo}" alt="">`;
  },

  /** [17/09/2026 UTC] NOVO — tabela de especificações usada por
   *  `_trena3DPreviewImgTag`/`_trena3DGerarPreviewIcone` (ver comentário
   *  grande acima) — 1 entrada por "aparência distinta" das opções da
   *  seção "📏 Trena 3D". ESCOPO desta rodada (documentado aqui em vez de
   *  espalhado pelo código): a maioria das ~45 opções da seção ganhou um
   *  ícone PRÓPRIO e distinto; algumas checkboxes que descrevem o MESMO
   *  resultado visual final, só mudando o MOMENTO/gatilho em que ele
   *  aparece (ex. as 2 opções de "Modo de ancoragem", que só diferem em
   *  COMO a âncora é acionada, nunca em como ela se parece; ou "Mostrar já
   *  ao segurar o Ctrl"/"...antes de fixar o ponto", que são o mesmo
   *  desenho — bolinha laranja + linha tracejada + texto — em 2 instantes
   *  diferentes da mesma interação), COMPARTILHAM a mesma `chave`/ícone de
   *  propósito — repetir o MESMO desenho não ensinaria nada a mais sobre
   *  aquela opção especificamente, e está documentado abaixo, opção por
   *  opção, qual reaproveita qual. */
  _trena3DPreviewSpecs: {
    // "Modo de ancoragem (ctrl)" — 2 radios (ctrl/quatroCliques):
    // resultado visual da âncora é IDÊNTICO nos 2 (só o clique que aciona
    // muda) — 1 ícone só, reaproveitado pelos 2 radios.
    modoAncora: (k) => {
      k.addLinha([0.35, 0, -0.3], [0.35, 1.05, -0.3], 0xff9f4d, true);
      k.addEsfera([0.35, 0, -0.3], 0xff9f4d, 0.06);
      k.addEsfera([0.35, 1.05, -0.3], 0xff9f4d, 0.06);
    },
    // "Medição em superfícies laterais" — mostra a mira atingindo a face
    // LATERAL de um objeto (uma "parede"), não só o topo.
    superficiesLaterais: (k) => {
      k.addCaixa([0, 0.55, -0.5], 0x6b7280, 0.06, 1.1, 0.9);
      k.addEsfera([0.031, 0.7, -0.15], 0x5ec8ff, 0.05);
      k.addLinha([0.8, 0.7, 0.6], [0.031, 0.7, -0.15], 0x5ec8ff, false);
    },
    // "Continuar no nível do 1º ponto" — plano horizontal extra (gradeado)
    // numa altura fixa, com a mira presa nele.
    continuarNivel: (k) => {
      const grade = new k.THREE.GridHelper(2.2, 5, 0x5ec8ff, 0x2e4a5c);
      grade.position.y = 0.65;
      k.scene.add(grade);
      k.addEsfera([0.3, 0.65, 0.2], 0x5ec8ff, 0.05);
    },
    // "Snap" — gradeado fino (pontilhado) dentro de 1 ladrilho, evidenciando
    // os pontos onde a mira "encaixa".
    snap: (k) => {
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          k.addEsfera([i * 0.45, 0.01, j * 0.45], 0xffffff, 0.02);
        }
      }
      k.addEsfera([0.45, 0.01, -0.45], 0xff9f4d, 0.05);
    },
    // "Aparência da medida" — 2 radios: texto sobreposto ao meio da linha
    // ("sobreLinhaMeio") vs texto flutuando acima dela ("sobreLinha").
    labelSobreLinhaMeio: (k) => {
      k.addLinha([-0.8, 0.6, 0], [0.8, 0.6, 0], 0xffd166, false);
      k.addEsfera([-0.8, 0.6, 0], 0xffd166, 0.05);
      k.addEsfera([0.8, 0.6, 0], 0xffd166, 0.05);
      k.addTexto([0, 0.6, 0.01], '1.60m', '#ffd166');
    },
    labelSobreLinha: (k) => {
      k.addLinha([-0.8, 0.6, 0], [0.8, 0.6, 0], 0xffd166, false);
      k.addEsfera([-0.8, 0.6, 0], 0xffd166, 0.05);
      k.addEsfera([0.8, 0.6, 0], 0xffd166, 0.05);
      k.addTexto([0, 0.95, 0], '1.60m', '#ffd166');
    },
    // "Visibilidade" — 2 radios: linha só aparece se não houver nada na
    // frente ("seVisivel", `depthTest` normal — a caixa cobre ela) vs
    // sempre por cima ("sempre", `depthTest:false` na linha).
    visSeVisivel: (k) => {
      k.addLinha([-0.8, 0.6, -0.5], [0.8, 0.6, -0.5], 0xffd166, false);
      k.addCaixa([0, 0.55, 0], 0x454b58, 0.5, 1.0, 1.0);
    },
    visSempre: (k) => {
      const geo = new k.THREE.BufferGeometry().setFromPoints([new k.THREE.Vector3(-0.8, 0.6, -0.5), new k.THREE.Vector3(0.8, 0.6, -0.5)]);
      const mat = new k.THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false });
      const linha = new k.THREE.Line(geo, mat);
      linha.renderOrder = 999;
      k.scene.add(linha);
      k.addCaixa([0, 0.55, 0], 0x454b58, 0.5, 1.0, 1.0);
    },
    // "Espessura e cores" — 1 ícone representando as 3 cores configuráveis
    // ao mesmo tempo (linha/âncora/mira), num traço mais grosso (cilindro,
    // não uma `THREE.Line` fina) pra também sugerir a "espessura".
    espessuraCores: (k) => {
      const cilindro = new k.THREE.Mesh(new k.THREE.CylinderGeometry(0.035, 0.035, 1.1, 10), new k.THREE.MeshStandardMaterial({ color: 0xffd166 }));
      cilindro.rotation.z = Math.PI / 2;
      cilindro.position.set(0, 0.6, -0.2);
      k.scene.add(cilindro);
      k.addEsfera([-0.55, 0.6, -0.2], 0xff9f4d, 0.06);
      k.addEsfera([0.55, 0.6, -0.2], 0x5ec8ff, 0.06);
    },
    // "Pontas" — 5 radios, 1 ícone cada, mesma linha base (traço amarelo).
    // [17/09/2026 UTC] NOVO (RODADA 114) — "Sem pontas": só a linha, nada
    // nas extremidades (ver `_trena3DBuildEndpoint`, `kind === 'nenhuma'`
    // devolve `null`).
    pontaNenhuma: (k) => {
      k.addLinha([-0.7, 0.6, 0], [0.7, 0.6, 0], 0xffd166, false);
    },
    pontaEsfera: (k) => {
      k.addLinha([-0.7, 0.6, 0], [0.7, 0.6, 0], 0xffd166, false);
      k.addEsfera([-0.7, 0.6, 0], 0xffd166, 0.08);
      k.addEsfera([0.7, 0.6, 0], 0xffd166, 0.08);
    },
    pontaSeta: (k) => {
      k.addLinha([-0.7, 0.6, 0], [0.7, 0.6, 0], 0xffd166, false);
      k.addCone([-0.85, 0.6, 0], 0xffd166, 0.09, 0.22, -90);
      k.addCone([0.85, 0.6, 0], 0xffd166, 0.09, 0.22, 90);
    },
    // [17/09/2026 UTC] CORRIGIDO (RODADA 114) — bug verbatim: "a
    // renderização de prévia acabou ficando com os traços voltados para o
    // lado de fora da medida [...] Deve ficar voltada para o lado de dentro
    // da medida." As pontas soltas de cada traço (a 2ª coordenada de cada
    // `addLinha`, mais afastada do vértice) estavam em `x` MAIS EXTREMO que
    // o próprio vértice (`-0.85`/`0.85`, além de `-0.7`/`0.7`) — abrindo
    // "pra fora" da medida, ao contrário da geometria de verdade
    // (`_trena3DBuildEndpoint`/`kind === 'setaDoisTracos'`, ver comentário
    // grande lá: as pontas soltas ficam recuadas EM DIREÇÃO AO OUTRO PONTO
    // da medida, ou seja, "pra dentro"). CORRIGIDO: as pontas soltas agora
    // ficam em `x` MENOS EXTREMO que o vértice (`-0.55`/`0.55`, entre o
    // vértice e o centro da linha) — abrindo pra dentro, como na cena real.
    pontaSetaDoisTracos: (k) => {
      k.addLinha([-0.7, 0.6, 0], [0.7, 0.6, 0], 0xffd166, false);
      k.addLinha([-0.55, 0.75, 0], [-0.7, 0.6, 0], 0xffd166, false);
      k.addLinha([-0.55, 0.45, 0], [-0.7, 0.6, 0], 0xffd166, false);
      k.addLinha([0.55, 0.75, 0], [0.7, 0.6, 0], 0xffd166, false);
      k.addLinha([0.55, 0.45, 0], [0.7, 0.6, 0], 0xffd166, false);
    },
    pontaTraco: (k) => {
      k.addLinha([-0.7, 0.6, 0], [0.7, 0.6, 0], 0xffd166, false);
      k.addLinha([-0.7, 0.75, 0], [-0.7, 0.45, 0], 0xffd166, false);
      k.addLinha([0.7, 0.75, 0], [0.7, 0.45, 0], 0xffd166, false);
    },
    // "Guia rente ao chão" — 2 checkboxes (ao vivo/finalizada) reaproveitam
    // o MESMO ícone (a diferença entre elas é só QUANDO a guia aparece —
    // durante a medição, ou também depois de pronta — não como ela se
    // parece) + as 2 opções de cor da mesma subseção.
    guiaChao: (k) => {
      k.addLinha([-0.7, 0.01, 0.3], [0.7, 0.01, 0.3], 0x5ec8ff, true);
      k.addEsfera([-0.7, 0.01, 0.3], 0x5ec8ff, 0.05);
      k.addEsfera([0.7, 0.01, 0.3], 0x5ec8ff, 0.05);
      k.addTexto([0, 0.28, 0.3], '2.00m', '#5ec8ff');
    },
    // "Linhas verticais ancoradas" — "Altura ao vivo": as 2 checkboxes
    // (antes/depois da âncora) reaproveitam o MESMO ícone (mesmo desenho —
    // bolinha "no ar" + linha tracejada + texto perto do topo, ver o fix do
    // item 4 da RODADA 110 — só o INSTANTE da interação muda entre elas).
    medidaAoVivoAncora: (k) => {
      k.addLinha([0.2, 0, 0.2], [0.2, 1.3, 0.2], 0xff9f4d, true);
      k.addEsfera([0.2, 0, 0.2], 0xff9f4d, 0.05);
      k.addEsfera([0.2, 1.3, 0.2], 0x5ec8ff, 0.05);
      k.addTexto([0.2, 1.15, 0.2], '⬍1.30m', '#ff9f4d');
    },
    // "Linha da âncora após o 1º ponto" — checkbox "continuar desenhando" +
    // checkbox "mostrar o texto" reaproveitam o MESMO ícone base (linha até
    // o 1º ponto, real, "ateOPonto"); os 2 radios de "Comprimento da linha"
    // têm ícone PRÓPRIO cada um (curta vs. sem teto).
    linhaAncoraAteOPonto: (k) => {
      k.addLinha([0.2, 0, 0.2], [0.2, 0.95, 0.2], 0xff9f4d, true);
      k.addEsfera([0.2, 0, 0.2], 0xff9f4d, 0.05);
      k.addEsfera([0.2, 0.95, 0.2], 0xff9f4d, 0.06);
      k.addTexto([0.2, 1.15, 0.2], '⬍0.95m', '#ff9f4d');
    },
    linhaAncoraInfinita: (k) => {
      k.addLinha([0.2, 0, 0.2], [0.2, 2.4, 0.2], 0xff9f4d, true);
      k.addEsfera([0.2, 0, 0.2], 0xff9f4d, 0.05);
      k.addEsfera([0.2, 0.95, 0.2], 0xff9f4d, 0.06);
    },
    // "Linhas verticais das medidas finalizadas" — checkbox "manter" usa o
    // ícone com as 2 linhas de uma medida já pronta (2 pontos "no ar" +
    // linha amarela entre eles); os 2 radios de "Comprimento da linha"
    // (aplicados às 2 linhas ao mesmo tempo) reaproveitam
    // `linhaAncoraAteOPonto`/`linhaAncoraInfinita` acima — MESMO conceito
    // de comprimento, só que documentado aqui como reaproveitado em vez de
    // desenhado nas 2 pontas simultaneamente (simplificação consciente:
    // desenhar as 2 pontas dobraria o número de elementos sem ensinar nada
    // novo sobre "curta" vs. "infinita" em si).
    linhasFinalizadas: (k) => {
      k.addLinha([-0.5, 0, -0.2], [-0.5, 0.7, -0.2], 0xff9f4d, true);
      k.addLinha([0.5, 0, 0.3], [0.5, 1.1, 0.3], 0xff9f4d, true);
      k.addEsfera([-0.5, 0, -0.2], 0xff9f4d, 0.045);
      k.addEsfera([0.5, 0, 0.3], 0xff9f4d, 0.045);
      k.addLinha([-0.5, 0.7, -0.2], [0.5, 1.1, 0.3], 0xffd166, false);
      k.addEsfera([-0.5, 0.7, -0.2], 0xffd166, 0.05);
      k.addEsfera([0.5, 1.1, 0.3], 0xffd166, 0.05);
    },
    // "Gradeado do ladrilho mirado" — pontilhado denso dentro de 1
    // ladrilho, mais fino/mais denso que o de "Snap" acima (espaçamento
    // menor, sugerindo o sub-grid configurável).
    gradeSnapLadrilho: (k) => {
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          k.addEsfera([i * 0.18, 0.008, j * 0.18], 0xb7ff5e, 0.012);
        }
      }
    },
    // "Linhas guia da grade do mundo" — 3 checkboxes (ao vivo/após 1º
    // ponto/finalizada) + 2 cores reaproveitam o MESMO ícone (2 linhas
    // sólidas rente ao chão até a grade mais próxima, cor azul —
    // consistente com o fix da RODADA 109 que unificou verde/azul).
    guiaGradeMundo: (k) => {
      k.addLinha([0.4, 0.008, -0.9], [0.4, 0.008, 0.9], 0x5ec8ff, false);
      k.addLinha([-0.9, 0.008, -0.4], [0.9, 0.008, -0.4], 0x5ec8ff, false);
      k.addEsfera([0.4, 0.008, -0.4], 0x5ec8ff, 0.05);
      k.addTexto([0.4, 0.25, -0.65], '0.60m', '#5ec8ff');
    },
  },

  /** [17/09/2026 UTC] NOVO — item 6 (RODADA 110), pedido verbatim: "no
   *  cabeçalho da seção 'Trena 3D', coloque um botão de controle de modo
   *  de apresentação das informações [...] a versão em árvore/lista como
   *  uma estrutura de pastas, mas não faltando em nada [...] (sem desenhos
   *  grandes, textos explicativos enormes, nem grandes espaçamentos)."
   *  Liga o botão "🌳 Modo árvore/lista" (dentro do `<h4>` da 1ª
   *  `.mapconfig-section` da Trena 3D, ver `#mc-trena3d-secoes` no
   *  template). NÃO duplica nenhum conteúdo: reorganiza visualmente
   *  (classes CSS, ver `.mapconfig-sheet--trena3d-arvore` em
   *  css/style.css) o MESMO DOM já renderizado pelo modo padrão — todo
   *  campo/opção continua existindo e funcionando idêntico nos 2 modos,
   *  só a apresentação muda. Estado (ligado/desligado) persistido em
   *  `DB.setting` ('mapconfig3DModoArvoreTrena3D'), lido de novo a cada
   *  abertura do modal (mesmo padrão "solto", fora do blob `mapa3dConfig`,
   *  já usado por `mc3dTextoSelecionavel` no topo de `open()`). Se o
   *  contexto for '2d' (`#mc-trena3d-secoes` não existe nesse template),
   *  sai cedo sem fazer nada.
   *  [17/09/2026 UTC] ATUALIZADO (RODADA 117), 2 pedidos verbatim: (1) "o
   *  padrão, agora, deve ser o 'árvore'" — `DB.getSetting(...)` abaixo
   *  trocou o fallback de `false` pra `true`; note que isso só muda o
   *  padrão de uma instalação NOVA (sem nada salvo ainda) — quem já tinha
   *  escolhido o modo padrão explicitamente continua exatamente como
   *  escolheu, já que o valor salvo sempre vence o fallback. (2) "No modo
   *  'árvore', as subseções não devem ser botões [...] estando como
   *  botões, ao clicar, algumas opções acabam ficando ocultadas" — REMOVIDO
   *  todo o mecanismo de clicar no `<h4>` de uma subseção pra
   *  esconder/mostrar o próprio conteúdo (bug relatado pelo usuário); as
   *  subseções agora só recebem a apresentação compacta (CSS), nunca
   *  escondem opções. A única exceção pedida — o toggle "aparece/não
   *  aparece" da lista de botões da janelinha, dentro de "Janela de acesso
   *  rápido" — vira um wiring PRÓPRIO aqui embaixo
   *  (`#mc-trena3d-pr-chips-toggle`/`#mc-trena3d-pr-chips-wrap`, ver
   *  também css/style.css), independente do modo árvore/padrão. */
  /** [RODADA 131] NOVO — 2 pedidos verbatim do mesmo lote, aplicados aqui
   *  porque rodam sempre que a seção "📏 Trena 3D" é (re)desenhada, igual ao
   *  restante deste método:
   *  (1) "Sobre os enables na seção 'Trena 3D', deve ser só clicando em cima
   *  da região da caixinha do enable, não a linha toda [...]." Por padrão,
   *  um `<label>` HTML propaga o clique em QUALQUER parte dele (inclusive o
   *  texto/descrição) pro `<input>` de dentro — aqui isso é interceptado
   *  (`e.preventDefault()` no evento 'click' do LABEL, só quando o alvo do
   *  clique não é o próprio `<input>`) restrito à seção da Trena 3D, sem
   *  mexer no comportamento do resto do app.
   *  (2) "Na seção 'Trena 3D', quando estiver no modo árvore, os titles (do
   *  hover do mouse) devem ter as explicações que tem no outro modo ('modo
   *  explicativo')." No modo árvore a descrição (`.d`) fica escondida via
   *  CSS (`.mapconfig-sheet--trena3d-arvore ... .d { display:none }`) —
   *  preenche um `title` (tooltip nativo do navegador, funciona nos 2 modos)
   *  com o texto do rótulo (`.t`) + descrição (`.d`) de cada opção que ainda
   *  não tiver um `title` próprio mais específico (não sobrescreve nenhum já
   *  existente, ex. o de "Suprimir destaque..."). Chamado 1x, aqui — os
   *  titles ficam disponíveis nos 2 modos (inofensivo/redundante no modo
   *  explicativo, onde a descrição já aparece visível). */
  _trena3DAplicarRestricoesEnableETitles(raiz) {
    if (!raiz) return;
    raiz.querySelectorAll('label.radio-opt, label.field').forEach((label) => {
      const input = label.querySelector(':scope > input, :scope > span > input');
      if (input && (input.type === 'checkbox' || input.type === 'radio')) {
        label.addEventListener('click', (e) => {
          if (e.target !== input) e.preventDefault();
        });
      }
      // [RODADA 132] MUDANÇA — pedido verbatim: "Os titles, no modo árvore,
      // devem aparecer em toda a linha, não só nas caixas dos enables." O
      // title agora é aplicado no `<label>` inteiro (cobre ícone + texto +
      // descrição, a linha toda), não mais só no `<input>`. Reaproveita um
      // `title` mais específico já existente no `<input>` (ex. o da opção
      // "Suprimir destaque..."), quando houver; senão monta a partir de
      // `.t`/`.d`, igual antes. Nunca sobrescreve um `title` que o próprio
      // `<label>` já tenha.
      if (label.title) return;
      let texto = input && input.title ? input.title : '';
      if (!texto) {
        const tEl = label.querySelector('.t');
        const dEl = label.querySelector('.d');
        texto = tEl ? tEl.textContent.trim() : '';
        if (dEl && dEl.textContent.trim()) texto += (texto ? ' — ' : '') + dEl.textContent.trim();
      }
      if (texto) label.title = texto;
    });
  },

  /** [RODADA 139] Toggle "📏 Trena 3D" / "➰ Polilinha 3D" — pedido verbatim:
   *  "deve ter um botão 'Trena 3D' e um botão 'Polilinha 3D' [...] Ao clicar
   *  em um desativa o outro [...] todas as seções devem trocar de nome [...]
   *  Inclusive no botão de cabeçalho das 'configurações 3D' e no botão do
   *  rodapé do 'Ver em 3D'." A "➰ Polilinha 3D" não existe mais como
   *  ferramenta separada — é só um modo (`trena3DModo`) da própria
   *  "📏 Trena 3D", então trocar aqui só precisa: 1) gravar a config, 2)
   *  re-rotular os títulos desta MESMA seção (`_trena3DAplicarTitulosModo`),
   *  3) re-render dos botões deste toggle. O rodapé do "Ver em 3D"
   *  (`_renderHotbar()` em view3d.js) e a "janelinha" de acesso rápido já se
   *  re-renderizam sozinhos via `MapConfig.onChange` (ver `set()` abaixo). */
  _wireTrena3DModoToggle(modal) {
    const wrap = modal.querySelector('#mc-trena3d-modo-toggle');
    if (!wrap) return;
    const btnTrena = modal.querySelector('#mc-trena3d-modo-trena');
    const btnPoli = modal.querySelector('#mc-trena3d-modo-poli');
    this._trena3DAplicarTitulosModo(modal, (this._cache?.trena3DModo) || this.DEFAULTS?.trena3DModo || 'trena');
    const escolher = async (modo) => {
      await this.set({ trena3DModo: modo });
      if (btnTrena) btnTrena.classList.toggle('secondary', modo !== 'trena');
      if (btnPoli) btnPoli.classList.toggle('secondary', modo !== 'poli');
      this._trena3DAplicarTitulosModo(modal, modo);
    };
    btnTrena?.addEventListener('click', () => escolher('trena'));
    btnPoli?.addEventListener('click', () => escolher('poli'));
  },

  /** Troca o prefixo "📏 Trena 3D"/"➰ Polilinha 3D" no início de CADA
   *  título (`<h4>`) dentro da seção "📏 Trena 3D" das Configurações 3D
   *  (`#mc-trena3d-secoes`), preservando qualquer botão/texto que venha
   *  DEPOIS do prefixo no mesmo `<h4>` (ex. "📏 Trena 3D — Snap", os botões
   *  "📖 Sobre"/"🌳 Modo árvore/lista" do cabeçalho principal). Só troca o
   *  PRIMEIRO nó de texto de cada `<h4>` — nunca mexe em filhos (botões,
   *  spans) nem em textos de outras seções fora deste escopo. */
  _trena3DAplicarTitulosModo(modal, modo) {
    const raiz = modal.querySelector('#mc-trena3d-secoes');
    if (!raiz) return;
    const de = 'Trena 3D', paraDe = 'Polilinha 3D';
    const iconeDe = '📏', iconePara = '➰';
    raiz.querySelectorAll('h4').forEach((h4) => {
      const noTexto = h4.childNodes[0];
      if (!noTexto || noTexto.nodeType !== 3) return; // só o 1º nó, e só se for texto puro
      const txt = noTexto.textContent;
      if (modo === 'poli' && txt.includes(`${iconeDe} ${de}`)) {
        noTexto.textContent = txt.replace(`${iconeDe} ${de}`, `${iconePara} ${paraDe}`);
      } else if (modo !== 'poli' && txt.includes(`${iconePara} ${paraDe}`)) {
        noTexto.textContent = txt.replace(`${iconePara} ${paraDe}`, `${iconeDe} ${de}`);
      }
    });
  },

  async _wireTrena3DModoArvore(modal) {
    const raiz = modal.querySelector('#mc-trena3d-secoes');
    try { this._trena3DAplicarRestricoesEnableETitles(raiz); } catch (e) { console.warn('[MapConfig] _trena3DAplicarRestricoesEnableETitles falhou:', e); }
    const btn = modal.querySelector('#mc-trena3d-modo-arvore');
    if (raiz && btn) {
      const sheet = modal.querySelector('.mapconfig-sheet');
      // [17/09/2026 UTC] CORRIGIDO (RODADA 120) — pedido verbatim: "em vez
      // de o outro modo se chamar 'Modo padrão' deve se chamar 'Modo
      // explicativo' (coloque um ícone que traga esta ideia). E o modo
      // atual que ficar ativo é que deve ficar aparecendo ali no botão.
      // Por exemplo, caso esteja-se no modo árvore, então, o ícone deve
      // ser da árvore. Atualmente esta lógica está invertida." Antes,
      // `btn.textContent` mostrava o rótulo do modo PRA ONDE o clique iria
      // (o modo alternativo) — invertido do pedido. Agora mostra o rótulo
      // do modo ATUALMENTE ativo. "Modo padrão" renomeado pra "Modo
      // explicativo" (ícone 💡, distinto do 📖 já usado pelo botão vizinho
      // "Sobre a Trena 3D").
      const aplicar = (ativo) => {
        sheet.classList.toggle('mapconfig-sheet--trena3d-arvore', ativo);
        btn.textContent = ativo ? '🌳 Modo árvore/lista' : '💡 Modo explicativo';
        btn.title = ativo
          ? 'Alterna entre o modo árvore/lista (atual — compacto, como uma estrutura de pastas — mesmas opções, sem nada faltando, só sem os desenhos/textos longos/espaçamentos grandes) e o modo explicativo (ilustrado, com prévias grandes e textos explicativos completos).'
          : 'Alterna entre o modo explicativo (atual — ilustrado, com prévias grandes e textos explicativos completos) e o modo árvore/lista (compacto, como uma estrutura de pastas — mesmas opções, sem nada faltando, só sem os desenhos/textos longos/espaçamentos grandes).';
      };
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const novo = !sheet.classList.contains('mapconfig-sheet--trena3d-arvore');
        await DB.setSetting('mapconfig3DModoArvoreTrena3D', novo);
        aplicar(novo);
      });
      const modoInicial = await DB.getSetting('mapconfig3DModoArvoreTrena3D', true);
      aplicar(modoInicial);
    }
    // Único toggle "aparece/não aparece" que sobrou (ver comentário grande
    // acima) — some/aparece só a lista de chips com o ícone de cada botão
    // da janelinha, fechada por padrão (sem persistir estado entre
    // aberturas: reabrir o modal sempre começa fechado, de propósito, pra
    // manter a folha compacta ao abrir).
    const chipsToggleBtn = modal.querySelector('#mc-trena3d-pr-chips-toggle');
    const chipsWrap = modal.querySelector('#mc-trena3d-pr-chips-wrap');
    if (chipsToggleBtn && chipsWrap) {
      chipsToggleBtn.addEventListener('click', () => {
        const aberto = chipsWrap.classList.toggle('mc-pr-chips-aberto');
        chipsToggleBtn.textContent = aberto ? '🙈 Esconder botões da janelinha' : '🐵 Mostrar botões da janelinha';
      });
    }
  },

  /** [17/09/2026 UTC] NOVO (RODADA 117) — pedido verbatim: "A cor da tira
   *  da lateral esquerda deve ser de acordo com a seção, ou seja, toda a
   *  seção (suas subseções também) devem ter aquela cor. E cada seção tem
   *  a sua cor. A cor deve ser suave, não muito brilhante ou intensa/viva."
   *  Antes, TODA `.mapconfig-section` da folha (2D e 3D, ~55 no total)
   *  usava a MESMA cor fixa pra tira da esquerda (`border-left`, RODADA
   *  99) — nenhum sistema de cor por seção existia ainda (ver comentário
   *  antigo em css/style.css, removido/superado por este). Agora: cada
   *  "seção" (ex. "📏 Trena 3D", "🎬 Apresentação", "📦 Objeto") ganha 1 cor
   *  própria, determinística (mesmo texto → sempre a mesma cor, entre
   *  aberturas/sessões — não é aleatório, é um hash simples do texto do
   *  título), e TODAS as suas subseções (ex. as ~13 "📏 Trena 3D — X")
   *  herdam a MESMA cor da seção-mãe — o "grupo" de cada `.mapconfig-section`
   *  é o texto do `<h4>` até o primeiro " — " (as subseções sempre nomeiam
   *  assim, "Título da seção — Nome da subseção"; sem " — ", o próprio
   *  título inteiro já É o grupo, ex. seções sem subseção nenhuma). Cor
   *  "suave" pedida: HSL com saturação e luminosidade FIXAS e moderadas
   *  (35%/58%) — só o MATIZ (hue) varia por seção, evitando qualquer tom
   *  berrante/neon (que exigiria saturação/luminosidade altas) em qualquer
   *  hash que caia. */
  _mapConfigHashSimples(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) >>> 0;
    return h;
  },
  _mapConfigCorSecao(grupo) {
    const hue = this._mapConfigHashSimples(grupo) % 360;
    // [17/09/2026 UTC] AJUSTADO (RODADA 118) — saturação subiu de 35% pra
    // 46% (ainda longe de berrante/neon, que exigiria algo por volta de
    // 80-100%) só pra garantir que a diferença de matiz entre seções fique
    // perceptível de verdade contra o fundo escuro do app — a versão
    // anterior (35%/58%) não foi confirmada ao vivo num navegador ainda.
    return `hsl(${hue}, 46%, 56%)`;
  },
  _aplicarCoresSecoes(modal) {
    const secoes = modal.querySelectorAll('.mapconfig-section');
    const corPorGrupo = new Map();
    secoes.forEach((sec) => {
      const h4 = sec.querySelector(':scope > h4');
      if (!h4) return;
      // Só o TEXTO direto do <h4> (ignora <svg>/<button> filhos, ex. o
      // ícone SVG de "Fotos" ou os botões "📖 Sobre"/"🌳 Modo árvore" dentro
      // do <h4> principal da Trena 3D) — o título de verdade da seção.
      let titulo = '';
      h4.childNodes.forEach((n) => { if (n.nodeType === Node.TEXT_NODE) titulo += n.textContent; });
      titulo = titulo.trim();
      if (!titulo) return;
      const grupo = titulo.split(' — ')[0].trim() || titulo;
      if (!corPorGrupo.has(grupo)) corPorGrupo.set(grupo, this._mapConfigCorSecao(grupo));
      // [17/09/2026 UTC] CORRIGIDO (RODADA 118) — `setProperty(...,
      // 'important')` em vez de `sec.style.borderLeftColor = ...`: um
      // `!important` inline sempre vence QUALQUER regra da folha de
      // estilos (mesmo uma futura com `!important` também, que inline
      // sempre tem prioridade maior) — blinda contra o bug relatado ("a
      // cor [...] ainda está a mesma [...] para todas as seções"), que
      // pode ter vindo de uma exceção anterior impedindo esta função de
      // rodar (ver `try/catch` no ponto de chamada, em `open()`) ou de
      // qualquer outra causa não confirmada ainda sem navegador de
      // verdade.
      sec.style.setProperty('border-left-color', corPorGrupo.get(grupo), 'important');
    });
  },

  /** [16/09/2026 UTC] NOVO — pedido verbatim: "Em '📏 Trena 3D — Guia de
   *  grade do mundo' [...] faça um preview de canvas para se ter noção do
   *  que se trata." Desenho 2D simplificado, visto de cima, de UM ladrilho
   *  de 1m×1m com um ponto mirado (bolinha azul) fora do canto, e as 2
   *  linhas guia sólidas (X e Z) até a borda do ladrilho conforme o modo
   *  escolhido no radio "esquerdaCima"/"maisPerto" — é só ilustrativo
   *  (não usa nenhum dado real da cena 3D), pra dar noção do conceito. */
  _trena3DDesenharPreviewGuiaGrade(modal) {
    const canvas = modal.querySelector('#mc-trena3d-guia-grade-preview');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const pad = 24;
    const x0 = pad, y0 = pad, x1 = W - pad, y1 = H - pad;
    // Ladrilho (quadrado do mundo, 1m×1m)
    ctx.strokeStyle = '#4a4f5c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    // Ponto mirado — fixo num lugar assimétrico (mais perto da direita/baixo
    // do que da esquerda/cima) pra deixar claro a diferença entre os 2 modos.
    const px = x0 + (x1 - x0) * 0.72;
    const py = y0 + (y1 - y0) * 0.62;
    const modoMaisPerto = modal.querySelector('input[name="mc-trena3d-guia-modo"][value="maisPerto"]')?.checked;
    // [16/09/2026 UTC] NOVO — pedido verbatim: "ao desmarcar a opção
    // 'Mostrar linhas guia...', o desenho azul das linhas na preview deve
    // deixar de ser desenhado também." As linhas/rótulos azuis só são
    // desenhados se a opção estiver ativa — o ladrilho (cinza) continua
    // sempre visível, só de contexto.
    const guiaAtiva = modal.querySelector('#mc-trena3d-guia-grade')?.checked !== false;
    // [16/09/2026 UTC] CORRIGIDO — pedido verbatim: "Deve ser possível
    // definir a cor das linhas guia. Atualmente elas são desenhadas com
    // verde. E na preview está como azul. Deve ser azul para ambos, como
    // padrão." Este preview usava um azul FIXO (`#5ec8ff`), sem nenhuma
    // ligação com a cor de verdade usada na cena 3D (que era um verde FIXO
    // diferente, `0xb7ff5e`) — daí a inconsistência relatada. Agora lê os 2
    // campos novos (`trena3DGuiaGradeCorLinha`/`trena3DGuiaGradeCorTexto`),
    // direto dos color-pickers logo abaixo (não precisa reabrir o modal pra
    // refletir uma mudança de cor — os listeners desses pickers já chamam
    // este método de novo, mesmo padrão dos outros radios/checkboxes desta
    // subseção).
    const corLinhaPreview = modal.querySelector('#mc-trena3d-guia-grade-cor-linha')?.value || '#5ec8ff';
    const corTextoPreview = modal.querySelector('#mc-trena3d-guia-grade-cor-texto')?.value || '#5ec8ff';
    if (guiaAtiva) {
      ctx.strokeStyle = corLinhaPreview;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      // Linha X: esquerda→ponto (padrão) ou lado mais próximo (direita, no exemplo)
      ctx.beginPath();
      if (modoMaisPerto) { ctx.moveTo(x1, py); ctx.lineTo(px, py); } else { ctx.moveTo(x0, py); ctx.lineTo(px, py); }
      ctx.stroke();
      // Linha Z: cima→ponto (padrão) ou lado mais próximo (baixo, no exemplo)
      ctx.beginPath();
      if (modoMaisPerto) { ctx.moveTo(px, y1); ctx.lineTo(px, py); } else { ctx.moveTo(px, y0); ctx.lineTo(px, py); }
      ctx.stroke();
      // Rótulos das medidas, centralizados no meio de cada linha
      ctx.fillStyle = corTextoPreview;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const mxTxt = modoMaisPerto ? '0,28m' : '0,72m';
      const mzTxt = modoMaisPerto ? '0,38m' : '0,62m';
      const midX = modoMaisPerto ? (x1 + px) / 2 : (x0 + px) / 2;
      ctx.fillText(mxTxt, midX, py - 6);
      ctx.save();
      const midY = modoMaisPerto ? (y1 + py) / 2 : (y0 + py) / 2;
      ctx.translate(px + 6, midY);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(mzTxt, 0, 0);
      ctx.restore();
    }
    // Bolinha do ponto mirado
    ctx.fillStyle = corLinhaPreview;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
  },

  /** [16/09/2026 UTC] REFEITO — pedido verbatim: "o preview deve ser de uma
   *  caixa recebendo o destaque 'Raycasting (mira do 3D)'->'Estilo do
   *  destaque' ('Contorno pontilhado na projeção da tela'). E o ladrilho de
   *  mundo em baixo [...] É como montar esta cena no 'Ver em 3D' [...] em
   *  perspectiva de modo que dê pra ver 3 faces do cubo [...] tirar um
   *  screenshot com e sem o pontilhado destacando o cubo." Desenha uma
   *  caixinha isométrica (3 faces visíveis, mesma ideia de "ver de cima
   *  inclinado") sobre um ladrilho de chão, em 2 painéis lado a lado — um
   *  representando o destaque NORMAL (mira comum, sem âncora em jogo — o
   *  contorno pontilhado sempre aparece) e outro representando o momento em
   *  que a âncora está em uso, cujo contorno reage à opção acima. O
   *  contorno usa a MESMA cor/traço do destaque de verdade
   *  (`engine3d.js` `_drawOutline2D`: `rgba(255,242,117,0.85)`,
   *  `setLineDash([5,4])`), só desenhado ao redor da silhueta hexagonal
   *  aproximada da caixa (top+2 faces laterais) em vez do fecho convexo
   *  calculado a partir da projeção 3D de verdade. */
  _trena3DDesenharPreviewDestaqueMira(modal) {
    const canvas = modal.querySelector('#mc-trena3d-destaque-preview');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const suprimirAtivo = modal.querySelector('#mc-trena3d-suprimir-destaque')?.checked !== false;
    const desenharCena = (cx, mostrarContorno, legenda) => {
      const topoY = 20, meioY = 46; // ápice/centro vertical do topo em losango
      const halfW = 24, halfHup = 13, alturaCubo = 30;
      const top = { x: cx, y: topoY };
      const right = { x: cx + halfW, y: topoY + halfHup };
      const bottom = { x: cx, y: topoY + halfHup * 2 };
      const left = { x: cx - halfW, y: topoY + halfHup };
      const rightH = { x: right.x, y: right.y + alturaCubo };
      const bottomH = { x: bottom.x, y: bottom.y + alturaCubo };
      const leftH = { x: left.x, y: left.y + alturaCubo };
      // Ladrilho de chão — losango maior, centrado logo abaixo da base do cubo.
      const chaoCy = bottomH.y + 12, chaoHalfW = 40, chaoHalfH = 16;
      ctx.strokeStyle = '#3a3d47';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, chaoCy - chaoHalfH);
      ctx.lineTo(cx + chaoHalfW, chaoCy);
      ctx.lineTo(cx, chaoCy + chaoHalfH);
      ctx.lineTo(cx - chaoHalfW, chaoCy);
      ctx.closePath();
      ctx.stroke();
      // 3 faces do cubo (top mais clara, laterais mais escuras — sombreado
      // simples só pra dar noção de volume 3D).
      const face = (pts, cor) => {
        ctx.fillStyle = cor;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();
      };
      face([top, right, bottom, left], '#6b7280');
      face([left, bottom, bottomH, leftH], '#454b58');
      face([right, bottom, bottomH, rightH], '#565c6a');
      // Contorno pontilhado amarelo — mesma cor/traço do destaque real
      // ("outline2d"), ao redor da silhueta hexagonal (top→right→rightH→
      // bottomH→leftH→left→top).
      if (mostrarContorno) {
        ctx.strokeStyle = 'rgba(255,242,117,0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(right.x, right.y);
        ctx.lineTo(rightH.x, rightH.y);
        ctx.lineTo(bottomH.x, bottomH.y);
        ctx.lineTo(leftH.x, leftH.y);
        ctx.lineTo(left.x, left.y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = mostrarContorno ? '#ffdf75' : '#7d8390';
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(legenda, cx, H - 6);
    };
    desenharCena(W * 0.27, true, 'mira normal');
    desenharCena(W * 0.73, !suprimirAtivo, 'durante a âncora');
    // Linha divisória sutil entre os 2 painéis.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 8);
    ctx.lineTo(W / 2, H - 16);
    ctx.stroke();
  },

  /** [16/09/2026 UTC] NOVO — pedido verbatim: "Em [...] '📏 Trena 3D —
   *  Gradeado do ladrilho mirado', faça um preview de canvas para se ter
   *  noção do que se trata." Desenho 2D simplificado, visto de cima, do(s)
   *  ladrilho(s) cobertos pelo gradeado conforme o modo escolhido
   *  ("atual"/"quatroLadrilhos"/"metadeEntorno").
   *  [16/09/2026 UTC] CORRIGIDO — pedido verbatim: "O preview não está
   *  condizente com a realidade quando se varia o 'Vão' [...] se o ladrilho
   *  do mundo é 1m×1m e o snap [...] está em 0,1m, então deve aparecer uma
   *  grade de 10×10 'células'. Porém ao aumentar o valor em 'Vão', o
   *  gradeado que aparece no preview está sendo escalado e acaba ficando
   *  com menos 'células visíveis'." CAUSA: a versão anterior usava o mesmo
   *  espaçamento (derivado só do "Vão") tanto pro TAMANHO DA CÉLULA quanto
   *  pro espaçamento dos pontinhos — na cena 3D de verdade
   *  (`_trena3DAtualizarGradeSnapLadrilho`) essas são 2 contas
   *  INDEPENDENTES: o número de células vem do "📏 Trena 3D — Snap"
   *  (`trena3DSnapMetros`/`trena3DSnapAtivo`, outra seção), e "Vão"/
   *  "Espessura" só decidem a aparência do PONTILHADO ao longo de cada
   *  linha de célula já definida por ele — mudar "Vão" nunca muda quantas
   *  células existem. CORRIGIDO: agora o preview calcula `n` (células por
   *  lado) a partir do snap de verdade, desenha as `n-1` linhas internas
   *  de divisão nessa contagem FIXA, e só DEPOIS decora cada uma com
   *  pontinhos espaçados pelo "Vão" — as 2 contas nunca mais se misturam. */
  _trena3DDesenharPreviewGradeSnap(modal) {
    const canvas = modal.querySelector('#mc-trena3d-grade-snap-preview');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const modo = modal.querySelector('input[name="mc-trena3d-grade-snap-modo"]:checked')?.value || 'atual';
    // [17/09/2026 UTC] ATUALIZADO (RODADA 118) — estes 2 campos viraram
    // "botão triplo" (`_montarBotaoTriplo`); o `<input>` some, o valor atual
    // fica em `dataset.valor` do próprio `<div>` mount (atualizado a cada
    // `onCommit`), não mais em `.value`.
    const espessuraPx = Utils.clamp(parseFloat(modal.querySelector('#mc-trena3d-grade-snap-espessura')?.dataset.valor) || 1, 0.5, 10);
    const gapCm = Utils.clamp(parseFloat(modal.querySelector('#mc-trena3d-grade-snap-gap')?.dataset.valor) || 1.5, 0.1, 50);
    // [16/09/2026 UTC] NOVO — lê o snap de verdade (seção "📏 Trena 3D —
    // Snap", campos `#mc-trena3d-snap-on`/`#mc-trena3d-snap`) pra decidir
    // quantas células por lado desenhar — MESMA conta de
    // `_trena3DAtualizarGradeSnapLadrilho` (`passo = snap em metros`;
    // `n = 1/passo`, ex.: 0,1m → 10 células). Sem snap ativo, ou passo ≥ 1m,
    // não há linha interna nenhuma pra desenhar (1 única célula = o próprio
    // ladrilho) — mesmo comportamento da cena 3D real.
    const snapAtivo = modal.querySelector('#mc-trena3d-snap-on')?.checked !== false;
    const snapM = parseFloat(modal.querySelector('#mc-trena3d-snap')?.dataset.valor) || 0.1;
    const passo = snapAtivo ? snapM : 1;
    const n = (passo > 0 && passo < 0.999) ? Utils.clamp(Math.round(1 / passo), 1, 20) : 1;
    const pad = 20;
    const areaLado = Math.min(W, H) - pad * 2;
    // "quatroLadrilhos"/"metadeEntorno" cobrem uma área 2m×2m (4 ladrilhos
    // de 1m se tocando no vértice); "atual" cobre só 1 ladrilho de 1m — o
    // desenho usa a MESMA moldura de 2×2 ladrilhos nos 3 casos só pra dar
    // contexto (mostrando os vizinhos), mudando é a área PONTILHADA.
    const ladrilhoPx = areaLado / 2;
    const cx = pad + ladrilhoPx, cy = pad + ladrilhoPx; // vértice de grade central
    ctx.strokeStyle = '#3a3d47';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(pad, pad + i * ladrilhoPx); ctx.lineTo(pad + areaLado, pad + i * ladrilhoPx); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad + i * ladrilhoPx, pad); ctx.lineTo(pad + i * ladrilhoPx, pad + areaLado); ctx.stroke();
    }
    // Área pontilhada, conforme o modo
    let ax0, ay0, ax1, ay1;
    if (modo === 'quatroLadrilhos') {
      ax0 = pad; ay0 = pad; ax1 = pad + areaLado; ay1 = pad + areaLado;
    } else if (modo === 'metadeEntorno') {
      ax0 = cx - ladrilhoPx / 2; ay0 = cy - ladrilhoPx / 2; ax1 = cx + ladrilhoPx / 2; ay1 = cy + ladrilhoPx / 2;
    } else {
      ax0 = pad; ay0 = pad; ax1 = pad + ladrilhoPx; ay1 = pad + ladrilhoPx; // "atual" — só o 1º ladrilho (canto superior esquerdo)
    }
    // [16/09/2026 UTC] NOVO — pedido verbatim: "ao desmarca a opção
    // 'Mostrar gradeado (pontilhado)...', o gradeado amarelo no preview deve
    // deixar de ser desenhado." A moldura cinza (ladrilhos vizinhos) continua
    // sempre visível, só de contexto — o amarelo (contorno da área + os
    // pontinhos) só aparece com a opção ativa.
    const gradeSnapAtivo = modal.querySelector('#mc-trena3d-grade-snap')?.checked !== false;
    if (gradeSnapAtivo) {
      // [16/09/2026 UTC] MUDANÇA — pedido verbatim: "Faça a preview da mesma
      // cor que estiver o gradeado no ladrilho do mundo [...] deve ser
      // possível escolher a cor do gradeado." Lê AO VIVO do campo de cor
      // (`#mc-trena3d-grade-snap-cor`), não do valor salvo — assim o preview
      // já reflete a cor escolhida antes mesmo de fechar o modal/salvar.
      const corGrade = modal.querySelector('#mc-trena3d-grade-snap-cor')?.value || '#7fd8ff';
      ctx.strokeStyle = corGrade;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ax0, ay0, ax1 - ax0, ay1 - ay0);
      // Pontinhos ao longo de cada linha — espaçamento proporcional ao
      // "Vão" (mapeado numa faixa razoável de pixels só pro preview) e
      // tamanho igual à "Espessura". Independente de `n` (nº de células),
      // que já foi decidido acima só a partir do snap de verdade.
      // [16/09/2026 UTC] MUDANÇA (RODADA 91) — pedido verbatim: "o preview
      // deve ser mais preciso quanto aos valores selecionados em 'Vão'
      // [...] o desenho só está apresentando mudança visual, após variar
      // de '0,1' para '1'." CAUSA: a fórmula antiga (`4 + gapCm*2.2`,
      // clamp mínimo 6) fazia QUALQUER `gapCm` entre 0,1 e ~0,9 cair
      // abaixo do próprio clamp mínimo (4+0,9*2,2=5,98 < 6) — ou seja,
      // todo esse intervalo colapsava no MESMO valor final (6px), sem
      // diferença visual nenhuma entre eles. CORRIGIDO: multiplicador bem
      // maior (2.2 -> 6) e clamp mínimo mais baixo (6 -> 4), dando uma
      // progressão perceptível já dentro de 0,1 a 1,0 (testado
      // mentalmente: 0,1->4(piso do clamp) 0,5->6 1,0->9 1,5->12 5->33
      // 10->40(teto do clamp, valores maiores continuam só "bem
      // espaçado", sem sobrepor pontos nem sumir).
      const espacamentoPx = Utils.clamp(3 + gapCm * 6, 4, 40);
      ctx.fillStyle = corGrade;
      // [16/09/2026 UTC] RODADA 100 — pedido verbatim: "o preview deve
      // ficar mais semelhante ao que aparece na grade no sentido de como o
      // gradeado é montado. Se puder, use a mesma função de impressão
      // adaptada para o preview (sua escala e perspectiva)." ABORDAGEM
      // TOMADA: reuso de FUNÇÃO PURA DE CÁLCULO (não replicação adaptada) —
      // `View3D._trena3DCalcularGradeSnap` (view3d.js) foi extraída
      // exatamente pra isso na Rodada 100: ela não sabe nada de Three.js
      // nem de canvas, só recebe limites x/z + passo do snap + espaçamento,
      // e devolve a lista de linhas + pontos ao longo de cada uma — a MESMA
      // lógica de "quantas linhas, onde ficam, como os pontos se
      // distribuem" que decide o gradeado real da cena 3D. Aqui, o
      // retângulo do preview (`ax0..ax1`/`ay0..ay1`, em PIXELS de canvas)
      // é tratado como um sistema de coordenadas local próprio (0 é o
      // canto do retângulo pontilhado) — como 0 é sempre múltiplo de
      // qualquer `passo`, o alinhamento "a partir da origem" da função
      // pura cai exatamente nas `n-1` linhas igualmente espaçadas
      // (equivalente ao que a conta antiga fazia manualmente com `i/n`,
      // só que agora vem da MESMA função que a cena 3D usa, não de uma
      // fórmula duplicada). Não foi replicada a perspectiva 3D completa —
      // o preview continua sendo um desenho top-down 2D simples (já era
      // assim antes, e é o estilo mais legível pra um preview pequeno
      // dentro do modal) — só a PARTE DE CÁLCULO (não a de desenho) é
      // 100% compartilhada com a cena real, que era o pedido central.
      const passoPreview = n > 1 ? (ax1 - ax0) / n : 1e9; // n=1 → sem linha interna (mesmo caso "sem snap"/"passo>=1m" da cena real)
      const { pontosPorLinha } = window.View3D?._trena3DCalcularGradeSnap
        ? window.View3D._trena3DCalcularGradeSnap({ xMin: ax0, xMax: ax1, zMin: ay0, zMax: ay1, passo: passoPreview, espacamento: espacamentoPx })
        : { pontosPorLinha: [] };
      pontosPorLinha.forEach((pontos) => {
        pontos.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.z, espessuraPx / 2, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }
  },

  /** [16/09/2026 UTC] NOVO — pedido verbatim: "Crie um documento explicando
   *  a funcionalidade desta ferramenta 'Trena 3D' [...] Acessível por um
   *  botão no cabeçalho de início do 'Trena 3D' (nas configurações 3D)."
   *  Janela própria (mesmo padrão visual `modal-backdrop`/`modal-sheet` do
   *  resto do app, ver `_openMapRotationSnapDialog` acima e o próprio `open()`
   *  desta folha), só com texto explicativo — sem nenhum campo de config
   *  aqui, é 100% documentação. Fica por cima da folha de Configurações
   *  (que continua aberta atrás, sem fechar) — só remove a si mesma. */
  _abrirDocTrena3D() {
    document.getElementById('mc-trena3d-doc-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'mc-trena3d-doc-modal';
    modal.className = 'modal-backdrop';
    modal.style.zIndex = '10001'; // por cima da folha de Configurações (que continua aberta atrás)
    modal.innerHTML = `
      <div class="modal-sheet" style="max-width:640px; max-height:82vh; overflow:auto">
        <div class="handle"></div>
        <div style="position:sticky; top:-16px; z-index:1; background:var(--bg-elev); margin:-16px -16px 0; padding:16px 16px 8px; display:flex; align-items:center; justify-content:space-between; gap:8px">
          <h3 style="margin:0">📏 Sobre a ferramenta "Trena 3D"</h3>
          <button type="button" class="icon-btn sm" id="mc-trena3d-doc-close-top" title="Fechar" style="flex:none">✕</button>
        </div>
        <div style="line-height:1.5">
          <h4>O que ela faz</h4>
          <p>A "📏 Trena 3D" mede a distância reta entre 2 pontos dentro do "Ver em 3D" (Mapa → Planta baixa → Ver em 3D → barra de ferramentas). Cada medida fica salva no mapa (some só se você excluir ela) e pode ser configurada (aparência, cor, espessura, visibilidade etc.) na seção "📏 Trena 3D" das Configurações 3D.</p>

          <h4>O básico: 2 cliques numa superfície</h4>
          <p>Com a ferramenta selecionada, mire com o cursor (a mira fica no centro da tela) e clique — o 1º clique marca o 1º ponto DIRETO onde a mira estiver tocando uma superfície real (chão, parede, objeto). Mire outro lugar e clique de novo — o 2º clique marca o 2º ponto e conclui a medida na hora, mostrando a distância entre os 2 pontos.</p>

          <h4>Medindo pontos "no ar" — a âncora</h4>
          <p>Nem todo ponto que você quer medir está numa superfície de verdade — por exemplo, o topo de uma parede a 2,5m de altura, medido a partir do chão bem abaixo dele. Pra esses casos existe a <b>âncora</b>: um clique de ancoragem trava as 2 dimensões horizontais (X e Z) num ponto real da superfície mirada, e libera só a 3ª dimensão (a altura, Y) — o próximo clique fixa essa altura livremente, mirando pra cima ou pra baixo ao longo dessa reta vertical "no ar".</p>
          <p>Há 2 jeitos configuráveis de acionar a âncora (escolha em Configurações 3D → "📏 Trena 3D — Modo de ancoragem (ctrl)"):</p>

          <p><b>Modo "Segurando Ctrl" (padrão):</b></p>
          <ol style="padding-left:20px; margin:6px 0">
            <li>Segure <b>Ctrl</b> e clique mirando numa superfície — isso marca (ou move, se repetir) o ponto de ancoragem, travando X/Z ali. Pode repetir quantas vezes quiser antes de decidir a altura.</li>
            <li>Solte o Ctrl e clique de novo — isso fixa a 3ª dimensão (a altura) nessa reta vertical, completando o ponto "no ar".</li>
          </ol>
          <p>Nesse modo, se você <b>nunca segurar Ctrl</b> durante toda a medição, ela sai do jeito simples de sempre: só 2 cliques, cada um direto numa superfície — o Ctrl é 100% opcional, só usado quando você realmente precisa de um ponto "no ar".</p>

          <p><b>Modo "Sempre com 4 cliques":</b></p>
          <p>Nesse modo o Ctrl não faz nenhuma diferença — toda medida usa exatamente 4 cliques, sempre alternando entre ancorar e fixar, nesta ordem:</p>
          <ol style="padding-left:20px; margin:6px 0">
            <li><b>1º clique</b> — estabelece o ponto de ancoragem do 1º ponto (trava X/Z, libera só a altura).</li>
            <li><b>2º clique</b> — fixa o 1º ponto da medida "no ar", na altura mirada sobre essa reta.</li>
            <li><b>3º clique</b> — estabelece o ponto de ancoragem do 2º ponto (trava X/Z de novo, num lugar novo).</li>
            <li><b>4º clique</b> — fixa o 2º ponto da medida e conclui, mostrando a distância.</li>
          </ol>

          <h4>Enquanto mira, antes de clicar</h4>
          <p>Sempre que uma referência vertical estiver "em jogo" (Ctrl fisicamente segurado no modo Ctrl, ou aguardando o clique de ancoragem no modo 4 cliques), a bolinha de mira e a linha guia tracejada infinita (do chão pra cima, sem teto de altura) ficam laranja em vez de azul. A opção "Mostrar a medida entre a âncora e a bolinha 'no ar' antes de fixar o ponto" decide se essa medida do chão até a bolinha já aparece nesse momento — cobre os 2 casos (Ctrl segurado, âncora ainda não commitada, E âncora já commitada aguardando o 2º clique). Fica em Configurações 3D → "📏 Trena 3D — Linhas verticais ancoradas" → "Altura ao vivo (Antes mesmo de definir o ponto)".</p>

          <h4>A linha da âncora depois do 1º ponto já fixado</h4>
          <p>Por padrão, assim que o 1º ponto da medida é fixado "no ar", a linha tracejada laranja daquela âncora some — só volta a aparecer uma referência vertical quando você ancorar de novo pro 2º ponto. Em Configurações 3D → "📏 Trena 3D — Linhas verticais ancoradas" → "Linha da âncora após o 1º ponto" dá pra fazer ela continuar desenhada mesmo depois disso (opção "Continuar desenhando a linha tracejada..."), escolhendo se ela para na altura real do 1º ponto ou continua infinita, sem teto de altura — e, numa subopção separada, se o texto da medida (⬍ Xm) some junto com o texto ou continua aparecendo do lado da linha.</p>

          <h4>Linhas verticais depois da medida pronta</h4>
          <p>As 2 linhas acima (a do 1º e a do 2º ponto ancorados) somem por padrão assim que a medida é finalizada (os 2 pontos já fixados). Em Configurações 3D → "📏 Trena 3D — Linhas verticais ancoradas" → "Linhas verticais das medidas finalizadas" (desativada por padrão) dá pra manter as 2 linhas desenhadas permanentemente junto com a medida já pronta, do chão até cada ponto "no ar" — com a mesma subopção de "até o ponto" ou "infinita" (sem teto de altura). Pontos que já estavam no chão (sem âncora nenhuma envolvida) não geram linha nenhuma, já que a altura deles já é zero.</p>

          <h4>Cancelando uma medida em andamento</h4>
          <p>Pressione <b>Esc</b> a qualquer momento durante uma medida ainda não concluída — isso descarta o(s) ponto(s) já marcado(s) e qualquer âncora pendente, sem criar nenhuma medida.</p>

          <h4>Outras opções relacionadas</h4>
          <p>Snap de posição (arredonda cada ponto pro múltiplo mais próximo de um valor configurável — segure <b>Shift</b> pra desligar o snap temporariamente), guias de grade do mundo, gradeado do ladrilho mirado (ambos com um preview de canvas ilustrativo, logo abaixo da opção de ativar cada um), estilo/cor/espessura/pontas da medida finalizada, e visibilidade (some ou não quando algo bloqueia a visão) — todas na mesma seção "📏 Trena 3D" das Configurações 3D, aplicadas imediatamente às medidas já desenhadas.</p>

          <!-- [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim, texto pra
               ir no FINAL do conteúdo deste popup, preservando quebras de
               linha como parágrafos. -->
          <!-- [16/09/2026 UTC] MUDANÇA (RODADA 95) — pedido verbatim: "não
               deve ser itálico, deve ser normal." Removido 'font-style:italic'
               -- resto do estilo discreto (cor/tamanho) mantido como estava. -->
          <div style="margin-top:18px; padding-top:10px; border-top:1px solid var(--border); color:var(--text-dim, #9aa1ad); font-size:0.92em">
            <p>E é claro que, ao falar em medidas, é inevitável pensar na palavra que diz:</p>
            <p>Não julgueis, para que não sejais julgados, porque com o juízo com que julgardes sereis julgados, e com a medida com que tiverdes medido vos hão de medir a vós. Mateus 7:1-2 (ARC). <a id="mc-trena3d-doc-versiculo-link" href="https://www.bible.com/pt/bible/212/MAT.7.ARC" target="_blank" rel="noopener">link</a></p>
          </div>
        </div>
        <div style="display:flex; gap:10px; margin-top:14px">
          <button type="button" class="btn" id="mc-trena3d-doc-close" style="flex:1">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const fechar = () => modal.remove();
    modal.querySelector('#mc-trena3d-doc-close-top').onclick = fechar;
    modal.querySelector('#mc-trena3d-doc-close').onclick = fechar;
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) fechar(); });
    // [16/09/2026 UTC] ENDURECIDO (RODADA 96) — pedido verbatim: "Ao clicar
    // no link do versículo bíblico com o botão esquerdo do mouse, deve
    // abrir em uma nova guia." A tag já tinha `target="_blank"
    // rel="noopener"` (comportamento padrão do navegador já deveria bastar
    // sozinho) — não foi encontrado nenhum `preventDefault`/handler de
    // clique GLOBAL em `<a>` nos arquivos disponíveis nesta sessão
    // (`mapconfig.js`/`view3d.js`/`mapview.js`/`engine3d.js`) que pudesse
    // estar interceptando; `app.js` (fora dos arquivos desta sessão) não
    // pôde ser inspecionado pra descartar 100% um handler global de lá.
    // Como reforço defensivo (não deveria ser necessário, mas garante o
    // comportamento pedido mesmo que algo em outro arquivo interfira):
    // listener dedicado no próprio link, que chama `window.open(...)`
    // explicitamente pra um clique de botão esquerdo (`e.button === 0`),
    // com `stopPropagation()` pra não deixar nenhum handler ancestral (ex.
    // o `pointerdown`/fechar do próprio modal, ou qualquer coisa em
    // `app.js`) processar esse clique antes.
    const linkVersiculo = modal.querySelector('#mc-trena3d-doc-versiculo-link');
    linkVersiculo?.addEventListener('click', (e) => {
      if (e.button !== 0) return; // só botão esquerdo — botão do meio/direito já têm seu próprio comportamento nativo (abrir em guia/menu de contexto)
      e.stopPropagation();
      window.open(linkVersiculo.href, '_blank', 'noopener');
      e.preventDefault(); // evita 2 guias abertas (a nossa + a navegação padrão do <a>)
    });
  },
};

window.MapConfig = MapConfig;
