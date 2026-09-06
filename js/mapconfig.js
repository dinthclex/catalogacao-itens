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
 */

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
    // Pedido do usuário (28/08/2026, rodada do Modelador 3D): "Não use
    // antialiasing" — padrão mudado de `true` pra `false` (desligado custa
    // menos GPU, e é o visual "cru" que o Blender também usa no viewport por
    // padrão); só pega efeito reabrindo o 3D (ver engine3d.js _initThree).
    antialiasing3D: false,
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
    debugTransferidorAtivo: true,
    debugProlongamentoAtivo: true,
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
    // Traço guia" de 'Mapa'->'Foto' (ambientephotos.js
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

  /** Chamado sempre que a config muda (por este painel OU por qualquer outro
   *  lugar) — usado pelo Engine3D/MapView pra reagir na hora (ex: religar o
   *  raycast) sem precisar reabrir a tela. */
  onChange(fn) { this._listeners.push(fn); },

  // NOVO (03/09/2026) — seção "🌗 Hora do dia": formata um número de hora
  // fracionário (ex.: 13.5) como "13:30", pro label ao lado da trilha.
  _formatHora(h) {
    const hn = ((Number(h) || 0) % 24 + 24) % 24;
    const hh = Math.floor(hn);
    const mm = Math.round((hn - hh) * 60) % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  },

  /** Remove um listener cadastrado por onChange — usado no unmount de quem
   *  assinou (MapView), pra não empilhar listeners "mortos" (apontando pra
   *  uma tela já fechada) a cada vez que a tela do mapa é reaberta. */
  offChange(fn) { this._listeners = this._listeners.filter((l) => l !== fn); },

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
    const rdCustom = !this.RENDER_DISTANCE_PRESETS.includes(Number(cfg.renderDistance));
    const fpsCustom = Number(cfg.fpsLimite) > 0 && !this.FPS_LIMITE_PRESETS.includes(Number(cfg.fpsLimite));
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet mapconfig-sheet">
        <div class="handle"></div>
        <h3 style="margin-top:0">⚙️ Configurações do mapa</h3>

        <div class="mapconfig-section">
          <label class="radio-opt">
            <input type="checkbox" id="mc-dup-itens-colar" ${cfg.duplicarItensAoColar ? 'checked' : ''}>
            <span><span class="t">Duplicar itens ao colar?</span><br><span class="d">Um item só pode ter uma posição no mapa, então "colar" um item copiado normalmente não faz nada (só avisa). Ligando isto, colar cria um registro de item NOVO (cópia dos campos do original) na posição colada. Recortar+colar sempre funciona (só move o mesmo item), com ou sem isto ligado.</span></span>
          </label>
        </div>

        ${opts.context === '2d' ? `
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
             'mapa2dSnapGrade'), não o padrão do resto deste arquivo. -->
        <div class="mapconfig-section">
          <h4>📍 Fotos</h4>
          <span class="d" style="display:block; margin-bottom:5px">Ao confirmar "✅ Marcar aqui" (vincular uma foto a uma posição no mapa, em "Fotos" → tirar/escolher foto → 🗺️), o que fazer depois:</span>
          <label class="radio-opt">
            <input type="radio" name="mc-fotos-marcar-aqui" value="permanecer" ${fotosMarcarAquiAcao !== 'fotos' ? 'checked' : ''}>
            <span><span class="t">Permanecer em Mapa → Planta baixa (padrão)</span><br><span class="d">Continua na tela onde o botão "Marcar aqui" está — dá pra ajustar mais coisas no mapa em seguida, sem precisar entrar de novo.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="mc-fotos-marcar-aqui" value="fotos" ${fotosMarcarAquiAcao === 'fotos' ? 'checked' : ''}>
            <span><span class="t">Voltar para Fotos</span><br><span class="d">Volta pra tela "Fotos" (o mesmo botão do rodapé do app) — comportamento de antes desta rodada.</span></span>
          </label>
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
          <h4><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-4px; margin-right:2px"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" stroke="none"/><path d="M3 16l5.5-5 4 4 3-3L21 16"/></svg> Foto</h4>
          <label class="radio-opt">
            <input type="checkbox" id="mc-medida-setas" ${cfg.medidaSetasAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Seta nas extremidades da medida</span><br><span class="d">Depois de tocar em "✅ Inserir medida" (ferramenta 📏 Medidas de "Mapa" → "Foto"), a reta ganha uma pequena seta em cada ponta.</span></span>
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
               "✏️ Traço guia" de 'Mapa'->'Foto'. Ver DEFAULTS acima
               (tracoFotoReposicionarExtremidadesAtivo). -->
          <label class="radio-opt" style="margin-top:10px">
            <input type="checkbox" id="mc-traco-foto-reposicionar" ${cfg.tracoFotoReposicionarExtremidadesAtivo ? 'checked' : ''}>
            <span><span class="t">Reposicionar traços feitos pelas suas extremidades</span><br><span class="d">Com a ferramenta "✏️ Traço guia" ativa, toque e arraste numa ponta de um traço já inserido pra mover ela. Desligado por padrão — um traço já inserido fica fixo, sem jeito de mexer nas pontas sem querer.</span></span>
          </label>
          <!-- ITEM A1 (rodada 57/v311) — ver DEFAULTS acima pro texto do pedido verbatim -->
          <label class="radio-opt" style="margin-top:10px; display:block">
            <span class="t">Formato do arquivo em "⬇️ Baixar esta foto"</span><br>
            <span class="d">Tipo de imagem gerado ao clicar em "Baixar esta foto" em "Mapa" → "Foto".</span>
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
             DEFAULTS.horaDoDiaManual acima pro significado completo. Os 4
             botões e a trilha (range 0h-23h59) escrevem no MESMO campo
             (horaDoDiaManual), então ficam sempre "de acordo" entre si —
             ver o wiring em mc-hora-btn/mc-hora-trilha mais abaixo. -->
        <div class="mapconfig-section">
          <h4>🌗 Hora do dia</h4>
          <span class="d" style="display:block; margin-bottom:8px">Controla a posição do Sol/Lua e a iluminação da cena. Por padrão, o app segue a hora real do relógio do aparelho — os controles abaixo permitem travar num horário fixo (útil pra testar a iluminação de noite sem esperar a noite chegar de verdade).</span>
          <div class="mc-hora-botoes" style="display:flex; gap:6px; flex-wrap:wrap">
            <button type="button" class="btn secondary mc-hora-btn" data-hora="8">🌅 Manhã</button>
            <button type="button" class="btn secondary mc-hora-btn" data-hora="13">☀️ Dia</button>
            <button type="button" class="btn secondary mc-hora-btn" data-hora="18">🌇 Tarde</button>
            <button type="button" class="btn secondary mc-hora-btn" data-hora="22">🌙 Noite</button>
          </div>
          <label class="field" style="margin-top:10px">
            <span class="lbl">Trilha de horas do dia — <span id="mc-hora-trilha-label">${this._formatHora(cfg.horaDoDiaManual != null ? Number(cfg.horaDoDiaManual) : (new Date().getHours() + new Date().getMinutes() / 60))}</span></span>
            <input type="range" id="mc-hora-trilha" min="0" max="23.983" step="0.25"
              value="${cfg.horaDoDiaManual != null ? Number(cfg.horaDoDiaManual) : (new Date().getHours() + new Date().getMinutes() / 60)}">
          </label>
          <button type="button" class="btn secondary block" id="mc-hora-auto" style="margin-top:8px" ${cfg.horaDoDiaManual == null ? 'disabled' : ''}>🕐 Seguir relógio do aparelho ${cfg.horaDoDiaManual == null ? '(ativo)' : ''}</button>
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
          </label>
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
          <label class="field">
            <span class="lbl">Resolução</span>
            <select id="mc-resolucao3d">
              <option value="alta" ${(cfg.resolucao3D || 'alta') === 'alta' ? 'selected' : ''}>Alta (mais nítido — padrão)</option>
              <option value="media" ${cfg.resolucao3D === 'media' ? 'selected' : ''}>Média</option>
              <option value="baixa" ${cfg.resolucao3D === 'baixa' ? 'selected' : ''}>Baixa (mais FPS)</option>
            </select>
          </label>
          <label class="radio-opt" style="margin-top:10px">
            <input type="checkbox" id="mc-antialiasing3d" ${cfg.antialiasing3D !== false ? 'checked' : ''}>
            <span><span class="t">Suavização de bordas (antialiasing)</span><br><span class="d">Desligar custa menos GPU (mais FPS), mas as bordas ficam serrilhadas. Só faz efeito da próxima vez que "Ver em 3D" for aberto — não muda com a tela já aberta.</span></span>
          </label>
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
          <label class="radio-opt">
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

    const close = () => { opts.onClose?.(); modal.remove(); };
    modal.querySelector('#mc-close').onclick = close;
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });

    modal.querySelector('#mc-dup-itens-colar').onchange = async (e) => { await this.set({ duplicarItensAoColar: e.target.checked }); };
    modal.querySelector('#mc-miniatura3d')?.addEventListener('change', async (e) => { await this.set({ miniatura3DAtiva: e.target.checked }); });
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
    // ITEM A1 (rodada 57/v311)
    modal.querySelector('#mc-foto-fmt-atual')?.addEventListener('change', async (e) => { await this.set({ fotoDownloadFormatoAtual: e.target.value }); });
    modal.querySelector('#mc-foto-fmt-todas')?.addEventListener('change', async (e) => { await this.set({ fotoDownloadFormatoTodas: e.target.value }); });
    modal.querySelector('#mc-resolucao3d')?.addEventListener('change', async (e) => { await this.set({ resolucao3D: e.target.value }); });
    modal.querySelector('#mc-antialiasing3d')?.addEventListener('change', async (e) => { await this.set({ antialiasing3D: e.target.checked }); });
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
    // Seção "🐞 Debug" — ver DEFAULTS.debugTransferidorAtivo/
    // debugProlongamentoAtivo acima.
    modal.querySelector('#mc-debug-transferidor')?.addEventListener('change', async (e) => { await this.set({ debugTransferidorAtivo: e.target.checked }); });
    modal.querySelector('#mc-debug-prolongamento')?.addEventListener('change', async (e) => { await this.set({ debugProlongamentoAtivo: e.target.checked }); });
    modal.querySelector('#mc-debug-alvo-orbital')?.addEventListener('change', async (e) => { await this.set({ modeladorMostrarAlvoOrbital: e.target.checked }); });
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
    // NOVO (04/09/2026), item 5 — os 3 rádios do "🚀 Modo de voo 3D" (ver
    // HTML acima) gravam direto em `modoVoo3D`, lido por App.verNoMapa3D.
    modal.querySelectorAll('input[name="mc-modovoo3d"]').forEach((el) => {
      el.addEventListener('change', async (e) => { if (e.target.checked) await this.set({ modoVoo3D: e.target.value }); });
    });
    // Seção "🌗 Hora do dia" (pedido do usuário, 03/09/2026) — os 4 botões
    // (Manhã/Dia/Tarde/Noite) E a trilha escrevem no MESMO campo
    // (`horaDoDiaManual`), então ficam sempre "de acordo": mudar um atualiza
    // o valor salvo, e a trilha/label é redesenhada na hora (sem esperar
    // reabrir o painel) pra refletir o novo valor imediatamente — ver
    // `_syncHoraUI` abaixo, chamada pelos três wirings.
    const trilhaEl = modal.querySelector('#mc-hora-trilha');
    const trilhaLabelEl = modal.querySelector('#mc-hora-trilha-label');
    const autoBtnEl = modal.querySelector('#mc-hora-auto');
    const _syncHoraUI = (horaManual) => {
      const horaExibida = horaManual != null ? Number(horaManual) : (new Date().getHours() + new Date().getMinutes() / 60);
      if (trilhaEl) trilhaEl.value = String(horaExibida);
      if (trilhaLabelEl) trilhaLabelEl.textContent = this._formatHora(horaExibida);
      if (autoBtnEl) {
        autoBtnEl.disabled = horaManual == null;
        autoBtnEl.textContent = `🕐 Seguir relógio do aparelho ${horaManual == null ? '(ativo)' : ''}`;
      }
    };
    modal.querySelectorAll('.mc-hora-btn').forEach((b) => {
      b.addEventListener('click', async () => {
        const h = Number(b.dataset.hora);
        await this.set({ horaDoDiaManual: h });
        _syncHoraUI(h);
      });
    });
    trilhaEl?.addEventListener('input', () => { if (trilhaLabelEl) trilhaLabelEl.textContent = this._formatHora(Number(trilhaEl.value)); });
    trilhaEl?.addEventListener('change', async () => {
      const h = Number(trilhaEl.value);
      await this.set({ horaDoDiaManual: h });
      _syncHoraUI(h);
    });
    autoBtnEl?.addEventListener('click', async () => {
      await this.set({ horaDoDiaManual: null });
      _syncHoraUI(null);
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
  },
};

window.MapConfig = MapConfig;
