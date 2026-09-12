'use strict';
/* ==========================================================================
   VanishCam — canvas: viewport, zoom/pan, arraste dos pontos de controle,
   e todas as funções de desenho (linhas de VP, gizmo de eixos com distância
   de referência, ponto principal, guias 3D, leituras do painel direito).
   ========================================================================== */

/* --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO (mais recente primeiro) — este é o
   arquivo mais alterado do projeto, por concentrar todo o desenho e a
   interação de arraste/clique sobre a imagem.
   --------------------------------------------------------------------------
   Rodada 31 (2026-09-09): BUG CORRIGIDO — pedido do usuário: "em algumas
     situações, as opções do Guia 3D deixam de ser desenhadas e só fica o orb
     branca na tela". drawAxisGizmo() desenhava a bolinha branca da ORIGEM do
     gizmo incondicionalmente, mesmo quando state.calib é null (situações
     transitórias e legítimas — ver computeCalibration() em calibration.js —
     como 2 linhas momentaneamente paralelas ao arrastar, ou eixos duplicados)
     e draw3DGuide() e as SETAS do gizmo já corretamente não desenhavam nada
     nesse caso. Agora a função inteira só desenha (setas E bolinha) quando há
     calibração válida, igual ao resto da Guia 3D — nada fica "sobrando" na
     tela. (Este arquivo não foi alterado pela nova versão embutida do
     vanishCam desta mesma rodada — ver js/embed-api.js/index.html/
     js/project-io.js.)
   Rodada 30 (2026-09-09): pedido do usuário — em drawManualPPThirdAxisLines(),
     REMOVIDA a dependência do checkbox de mestre state.manualPPShowThirdAxisLines
     e da subopção state.manualPPThirdAxisLinesInfinite (ambos removidos de
     index.html/state.js). A função passou a ser controlada pelos MESMOS
     axisLineExtension[3]/axisLineInfiniteExtension[3] já usados por
     drawVpLinePair() (rodadas 28/29) — axisLineExtension[3]===false esconde
     tudo; ligado (padrão), desenha de vp3 até a extremidade mais distante;
     axisLineInfiniteExtension[3] prolonga esse trecho até a borda da tela.
   Rodada 29 (2026-09-09): pedido do usuário — SEGUNDO botão de prolongamento
     por eixo (1, 2 e 3), agora em direção ao infinito. Nova função
     computeFarPointExtension() (irmã de computeLineExtension(), logo acima):
     estende a linha, a partir da extremidade MAIS DISTANTE do ponto de fuga,
     até a borda visível da tela (em vez de parar nela) — ao contrário de
     computeLineExtension(), nunca termina no vp, e sempre no sentido que se
     AFASTA dele. drawVpLinePair() ganhou esse segundo segmento, controlado por
     state.axisLineInfiniteExtension[axisIdx] (novo botão .axisInfBtn em
     ui-controls.js/index.html), desligado por padrão nos 3 eixos, como pedido
     explicitamente — independente do prolongamento já existente
     (axisLineExtension, rodada 28, ligado por padrão). Ambos os prolongamentos
     coexistem sem conflito: um cuida do lado PRÓXIMO do vp, o outro do lado
     DISTANTE.
   Rodada 28 (2026-09-09): pedido do usuário. (b) drawManualPPThirdAxisLines()
     ganhou a subopção "Prolongamento infinito" (state.manualPPThirdAxisLinesInfinite,
     DESABILITADA por padrão): agora, por padrão, a linha pára na extremidade do
     par mais DISTANTE de vp3 (a mesma extremidade visível quando Ponto Principal
     = "A partir do 3º ponto de fuga" — antes sempre ia até a borda da tela); só
     quando a subopção está ligada é que volta ao comportamento das rodadas
     26/27 (prolonga até a borda). (c) drawVpLinePair() ganhou o parâmetro opcional
     `axisIdx`: quando informado, o segmento fino de prolongamento (vp/borda da
     tela) só é desenhado se state.axisLineExtension[axisIdx] estiver ligado —
     novos botões .axisExtBtn em ui-controls.js/index.html controlam isso por
     eixo (1, 2 e 3), sem tocar no resto do desenho (linha sólida, bolinhas,
     número). drawAxisLines() passa axisIdx nas 2 chamadas a drawVpLinePair().
     Os itens (a) documentação em "O que é isso?" e (d)/(e) botão de diagonais
     não mexeram neste arquivo — ver ui-controls.js/index.html.
   Rodada 27 (2026-09-09): 2 pedidos do usuário sobre a rodada anterior. (a)
     AJUSTE DE SENTIDO em drawManualPPThirdAxisLines() — a rodada 26 prolongava
     as linhas a partir de vp3 para o lado que se AFASTA do `anchor`; o usuário
     pediu "para o outro lado" — agora prolongam para o lado que PASSA pelo
     `anchor` (e segue além dele), só invertendo o sinal de `dirN` usado no
     prolongamento (ver comentário no corpo da função, mais abaixo). (b) o
     ícone SVG do "explicador visual" (#explainerToggleBtn) deixou de usar
     stroke="currentColor" e ganhou cores próprias fixas (pedido: "faça o
     ícone... ser colorido") — sem mudança de LÓGICA aqui, só de markup em
     index.html (o mesmo SVG, cores incluídas, também passou a ser usado dentro
     de #explainerActiveBanner, no lugar do emoji 🔎 que estava lá).
   Rodada 26 (2026-09-09): retomada de 2 itens da rodada 25 que não ficaram como
     o usuário pediu. (a) AJUSTE em drawManualPPThirdAxisLines() — a rodada 25
     corrigiu a linha para infinita num único sentido, mas partindo do `anchor`
     (extremidade da linha de controle original); o usuário esclareceu que deve
     partir do PRÓPRIO vp3 (onde o par de linhas se cruza) — nada desenhado
     entre `anchor` e `vp3`, só o prolongamento de vp3 até a borda da tela (ver
     comentário no corpo da função, mais abaixo). (b) setExplainerModeActive()
     ganhou 2 pedidos sobre o "explicador visual": o texto do botão
     #explainerToggleBtn passou a viver num <span> à parte
     (#explainerToggleLabel), porque o botão ganhou um ícone SVG fixo em
     index.html (não dava mais para só trocar btn.textContent, isso apagaria o
     ícone); e novo #explainerActiveBanner (index.html/css/style.css) — faixa
     fixa no topo do viewport, mostrada/escondida junto com o modo, avisando
     que clicar/arrastar na imagem estão desligados (pedido explícito: "em
     algum lugar visível, deve ficar a informação").
   Rodada 25 (2026-09-09): 2 pedidos do usuário. (a) BUG CORRIGIDO — em "Ponto
     principal: Manual" + "Mostrar linhas do 3º eixo de fuga" (drawManualPPThird-
     AxisLines()), as 2 semirretas ficavam infinitas nos 2 sentidos (recortadas
     na borda da tela dos dois lados); o usuário pediu que ficassem infinitas em
     só UM sentido, a partir do ponto de encontro (vp3) — igual ao padrão dos
     outros 2 pares de eixo de fuga (segmento real + prolongamento num único
     sentido, ver drawVpLinePair()/computeLineExtension()), só que aqui sem
     parar no próprio vp (o pedido foi para continuar infinita além dele, só
     não estender também para TRÁS do ponto `anchor`). Removida a extensão
     "distBack" (ver comentário no corpo da função, mais abaixo). (b) novo
     "explicador visual": um modo (ligado pelo botão #explainerToggleBtn, na
     nova janela "O que é isso?" — menu Arquivo, ui-controls.js/index.html) em
     que passar o mouse sobre qualquer elemento clicável/arrastável da imagem
     principal desenha uma seta até ele e mostra um texto de 2 linhas ("Isto é:
     <nome>" + descrição) — pedido do usuário para "funcionar para todos os
     elementos do app". Reaproveita TODA a infraestrutura de hit-test já
     existente (hitTestHandles()/buildHandleCandidates(), a mesma usada para
     arrastar) — só troca o que acontece ao passar o mouse/clicar; ver o bloco
     completo "Explicador visual" logo abaixo de vpLockToolActive/
     setVpLockToolActive (explainerModeActive/setExplainerModeActive()/
     explainerInfo()/updateExplainerHover()/drawExplainerHoverArrow()), mais os
     3 pontos de integração: mousedown (desliga clicar/arrastar enquanto ativo),
     mousemove (atualiza o tooltip em vez do hover normal) e render()
     (drawExplainerHoverArrow(), por cima de tudo o mais).
   Rodada 24 (2026-09-09): pedido do usuário — com a janela do cubo 3D interativo
     aberta (Guia 3D > Canto), rolar a roda do mouse com o cursor FORA da caixa
     do cubo (sobre o fundo escurecido) deveria continuar dando zoom na imagem
     principal, como se o popup nem estivesse aberto; só quando o cursor está
     EM CIMA da caixa/canvas do cubo é que a roda deve zoomar só o cubo (isso já
     funcionava). O bug: #cornerPopupOverlay é position:fixed;inset:0 (cobre a
     tela inteira) para poder escurecer tudo e centralizar a caixa, então TODO
     evento de rolagem — mesmo longe da caixa visível — tinha como alvo esse
     fundo, e nunca chegava ao listener 'wheel' do viewport (definido logo
     abaixo), que fica por baixo dele. Corrigido em duas partes: (a) a lógica de
     zoom da imagem principal foi extraída para a função zoomMainImageAt()
     abaixo, reaproveitada pelo listener 'wheel' do viewport; (b) um novo
     listener 'wheel' em #cornerPopupOverlay (ver corner-guide.js, perto dos
     listeners de mousedown/mouseup que já existiam ali para fechar o popup ao
     clicar fora — rodada 10) chama essa mesma função quando e.target é o
     próprio fundo (mesmo teste já usado ali para saber se o clique foi
     "fora" da caixa), repassando o zoom para a imagem principal.
   Rodada 17 (2026-09-08): 4 pedidos do usuário, todos correções de bugs
     descobertos usando "Mover"/"Ancorar"/📏/"Pisos móveis"/"Mover ponto
     médio" em combinações específicas (um deles com um arquivo de projeto
     real enviado pelo usuário, usado para verificar a correção). (a) BUG
     CORRIGIDO — com "Mover"+📏("comprimento fixo")+"Ancorar" ativos ao
     mesmo tempo num eixo, a extremidade-âncora (a mais afastada do vp) era
     recalculada a CADA mousemove; perto o bastante de uma extremidade essa
     escolha podia trocar de lado NO MEIO do próprio arraste, fazendo as
     linhas "andarem"/saltarem de repente. Agora o mousedown de 'vpPoint'
     fixa a âncora de cada linha UMA ÚNICA vez (h.anchorFreeze) quando
     mode='anchor' e distMode='preserveLength'; moveAxisVpTo() passa a
     tratá-la como se estivesse TRAVADA (effLock1/effLock2) pelo resto
     daquele arraste. (b) BUG CORRIGIDO (regressão das rodadas 15/16,
     "Pisos móveis") — o arraste de grade ainda conseguia "disparar" para
     longe e ficar preso lá, mesmo com as salvaguardas da rodada 16, porque
     o método era ITERATIVO (Newton sobre um jacobiano numérico) — um passo
     grande mas "válido" o bastante para passar nas checagens ainda podia
     levar a um lugar onde o jacobiano LOCAL continuava mal-condicionado,
     prendendo a grade lá. Trocado por um método DIRETO e exato (sem
     iteração): screenToWorldOnPlane() (raio câmera→cursor ∩ plano da
     grade) já dá o ponto de mundo exato sob o cursor num só passo —
     applyGridDrag() ficou muito mais simples (~6 linhas) e não tem como
     "disparar" (na pior hipótese, quando a interseção falha, o offset só
     não muda naquele quadro). (c) BUG CORRIGIDO — arrastar "o ponto médio
     gerado pelos 3 pontos de fuga" com 2 dos 3 eixos totalmente travados
     podia fazer o 3º vp "disparar" para dezenas de milhares de pixels de
     distância e nunca mais voltar sozinho (só com Ctrl+Z) — causa raiz: o
     método antigo aplicava um DELTA a cada mousemove e deixava o
     ortocentro "convergir sozinho" quadro a quadro, mas o ortocentro
     depende NÃO-linearmente do 3º vértice, então era uma iteração de ponto
     fixo sem garantia de convergência (divergência confirmada por
     simulação numérica usando o arquivo de projeto real enviado pelo
     usuário: depois de 60 quadros o vp foi parar a ~58.000px do ponto
     original). isAxisFullyLocked() (novo) detecta o caso "2 dos 3 vp's
     travados, 1 livre" e, quando ocorre, resolve a posição do vp livre por
     FÓRMULA FECHADA — solveThirdVertexFromOrthocenter() (novo,
     calibration.js) — sem qualquer iteração; o método antigo (delta) só é
     usado como fallback para as outras combinações de travamento (0, 1 ou
     os 3 travados), onde não há solução única. (d) NOVO selo de quantidade
     (updateVpLockBadge(), ui-controls.js) e o aviso de "4 extremidades
     travadas" (#vp3LockToast) ganhou pausa do contador ao passar o mouse
     ou clicar nele (ver setupVpLockToastPause()).
   Rodada 16 (2026-09-08): 2 pedidos do usuário nesta parte do app. (a) NOVO
     "estado de distância" para o arraste direto do ponto de fuga (botão
     auxiliar 📏, ver ui-controls.js/index.html): pivotEndpoint() ganhou o
     parâmetro `distMode` — 'proportional' é o comportamento original (a
     distância entre as pontas de uma linha varia conforme o vp se move);
     'preserveLength' (novo) mantém essa distância sempre igual à original,
     só girando a linha em torno do pivô para continuar passando pelo alvo.
     adjustAxisLine()/moveAxisVpTo() repassam o `distMode` do eixo
     (state.vpMove[eixo].distMode) para as 2 chamadas de pivotEndpoint().
     (b) CORREÇÃO DE BUG — o Newton de applyGridDrag() (introduzido na
     rodada 15 para o arraste dos "Pisos móveis") podia "disparar" quando o
     jacobiano ficava quase singular (grade quase de perfil para a câmera)
     ou um passo grande demais projetava o ponto de teste para trás da
     câmera no meio da iteração, deixando o offset da grade com um valor
     absurdo — que projetado gerava um monte de linhas quase paralelas
     cobrindo boa parte da tela (o "esbranquiçamento" relatado pelo usuário,
     mais visível da metade de baixo da imagem para baixo). Corrigido com um
     limiar de singularidade RELATIVO à magnitude do próprio jacobiano (em
     vez de um valor absoluto fixo), um teto de tamanho por passo (maxStep)
     e uma validação de que o resultado ainda projeta num ponto válido (na
     frente da câmera) antes de aceitar — qualquer iteração suspeita desfaz
     o passo e para o Newton ali, preservando o último offset válido.
   Rodada 15 (2026-09-08): 3 pedidos do usuário nesta parte do app (ver também
     state.js — sistema de desfazer/refazer — e corner-guide.js — zoom do
     popup do cubo). (a) bringFarPointsClose() ("Trazer para perto")
     reescrita: em vez de um clamp independente por ponto (que podia mudar a
     inclinação da linha do par de eixo), agora cada extremidade fora da tela
     desliza AO LONGO da própria reta que define (clipLineTRange() recorta a
     reta infinita contra a área visível com margem, e o ponto anda só nesse
     intervalo) — a reta nunca muda de orientação, só a posição da
     extremidade nela (pedido explícito do usuário). No modo retângulo os 4
     cantos continuam com o clamp simples de antes, pois um canto é
     compartilhado por 2 retas não-paralelas — preservar a inclinação das
     DUAS ao mesmo tempo é impossível (2 retas só se cruzam no próprio canto
     original). (b) drawHoverIndicator(): quando o candidato sob o "alternar
     entre elementos sobrepostos" é um 'vpPoint' (ponto de fuga, desenhado
     como quadrado preenchido no restante do app), o indicador desenhado
     perto do cursor agora também é um quadrado preenchido (na cor do eixo),
     em vez do círculo genérico usado para as outras alças — antes todo
     candidato usava o mesmo círculo, inconsistente com o desenho real do
     ponto de fuga. (c) CORREÇÃO DE BUG (Guia 3D "Pisos móveis"): arrastar
     uma grade exigia mover o mouse bem mais do que o deslocamento resultante
     na grade, e o ponto exato clicado não acompanhava o cursor — causa: o
     jacobiano numérico usado para converter deslocamento de tela em
     deslocamento de mundo era sempre calculado no CENTRO do plano (o
     offset atual), não no ponto realmente agarrado; sob perspectiva, a
     sensibilidade tela<->mundo varia ponto a ponto, então usar sempre o
     centro como referência dava uma relação errada (e cumulativa) para
     qualquer ponto fora do centro. Corrigido com screenToWorldOnPlane()
     (interseção do raio câmera->cursor com o plano da grade, achando o
     ponto de mundo exato do clique) + applyGridDrag() reescrita para
     resolver por Newton (poucas iterações) o offset que faz ESSE ponto
     específico projetar exatamente sobre o cursor a cada mousemove, em vez
     de só um passo incremental a partir do jacobiano do centro (o
     comportamento antigo foi preservado como applyGridDragIncremental(),
     usado apenas como fallback se a interseção raio-plano falhar). Também:
     o mouseup global passou a fechar o "passo pendente" do histórico de
     desfazer/refazer quando um arraste termina (historyPendingCommit,
     ver state.js) antes de zerar dragTarget.
   Rodada 14 (2026-09-08): CORREÇÃO DE BUG — arrastar "o ponto médio gerado
     pelos 3 pontos de fuga" (movePPFrom3VPBy()) travava e parava de responder
     ao mouse sempre que a configuração momentânea dos 3 VPs deixava de ter
     calibração válida (state.calib=null — ex.: f²<=0 em computeCalibration()),
     porque a função usava `state.calib.pp` como referência do delta e
     retornava cedo (`if(!c) return`) quando calib era nulo — travando o
     arraste até o usuário reposicionar manualmente alguma extremidade para
     "destravar". Corrigido: a referência agora é computePrincipalPoint(vp1,vp2)
     (calibration.js) calculada DIRETO dos 3 VPs atuais — o ortocentro em si
     quase nunca falha (só se as linhas ficarem paralelas), então o arraste
     continua fluido através de qualquer inconsistência momentânea de
     calibração, até ela se desfazer sozinha. (b) novo botão "Trazer para
     perto" (#bringCloseBtn, ui-controls.js) — bringFarPointsClose() abaixo —
     traz de volta para a área visível da tela qualquer ponto de controle que
     esteja fora dela, útil porque as extremidades das linhas de VP costumam
     ficar muito distantes em perspectivas quase-paralelas.
   Rodada 13 (2026-09-08): (a) o clique numa extremidade de linha (axisPoint/
     axisPoint3) agora também trava/destrava ela na hora quando o MODIFICADOR
     configurado (shortcuts.modifierKey, padrão Ctrl — ver state.js) está
     pressionado, mesmo com o "botão de travar" do eixo desativado — antes só
     era possível travar com esse botão ativado primeiro. (b) o listener de
     'keyup' que cicla bolinhas sobrepostas (rodada 8) passou a checar
     e.key===shortcutModifierKeyName() em vez de 'Control' fixo, para
     acompanhar a tecla modificadora configurável.
   Rodada 9 (2026-09-07): adicionado este histórico de alterações (ver
     mesma nota em state.js). Sem mudança de comportamento.
   Rodada 8 (2026-09-07): (a) drawHoverIndicator() passou a só desenhar o
     círculo colorido perto do cursor quando HÁ DE FATO sobreposição (2+
     candidatos na mesma região) — antes aparecia em qualquer hover, e o
     usuário pediu que só aparecesse havendo sobreposição. (b) nova função
     compartilhada nearbyCandidates(sp) (extraída da lógica antes duplicada
     em hitTestHandles() e no handler do Ctrl) e cycleOverlap(direction),
     usada tanto pelo keyup do Ctrl quanto por um novo keydown das setas do
     teclado (↑/→ avança, ↓/← volta) — usuário pediu que as setas também
     pudessem alternar entre bolinhas sobrepostas, não só o Ctrl. (c) leitura
     "Posição da câmera" (outCamX/Y/Z) corrigida para dividir o valor por
     sceneDisplayUnitFactor() (calibration.js) antes de exibir — ver o
     histórico de calibration.js para o detalhe do bug de escala corrigido.
   Rodada 7 (2026-09-07): (a) nova função compartilhada drawVpLinePair(),
     usada tanto pelos pares '1'/'2' quanto pelo par auxiliar do 3º ponto de
     fuga — usuário pediu que esse 3º par fosse desenhado EXATAMENTE como os
     outros 2 (linha sólida em vez de tracejada, com prolongamento, bolinhas
     de extremidade), na cor do eixo atribuído a ele (thirdAxisLetter(), em
     calibration.js) em vez de uma cor fixa. drawPrincipalPoint() também
     passou a usar essa cor dinâmica quando ppMode==='fromThirdVP'. (b) nova
     função candidateColor()/drawHoverIndicator() — pequeno círculo colorido
     perto do cursor mostrando a cor da bolinha que seria arrastada num
     clique (pedido do usuário, pensando em ajudar a identificar sobreposi-
     ções). (c) updateCalibErrorMessage() passou a escolher o TEXTO da
     mensagem de erro conforme state.calibErrorReason — "Atribuição de eixo
     inválida" quando os eixos 1 e 2 são a mesma letra, mensagem genérica
     nos demais casos. (d) nova função withUnit() e uso dela em
     updateReadouts() — sufixos de unidade (px, °, mm, rad) exibidos quando
     state.showUnits está ligado (novo toggle "Mostrar unidades" do usuário).
   Rodada 6 (2026-09-06): (a) buildHandleCandidates() extraída/expandida com
     um novo tipo de alça, kind:'lineNumber' — o número "1"/"2" desenhado no
     meio de cada linha de VP passou a ser arrastável, transladando a linha
     inteira (ou os cantos do retângulo correspondentes, se o Modo retângulo
     estiver ativo) preservando orientação — pedido do usuário. (b) novo
     mecanismo de "ciclo de sobreposição": overlapCycle/regionKey/candSig, e
     um listener de keyup em 'Control' — quando 2+ bolinhas de extremidade
     estão sobrepostas, soltar Ctrl alterna qual fica "na frente" (clicável).
     (c) desenho das bolinhas de extremidade e espessura das linhas passaram
     a usar state.handleRadius/state.lineThickness (novos controles do
     painel esquerdo) em vez de valores fixos (6 e 2). (d) draw3DGuide(): o
     lado do cubo da "Guia 3D" passou a medir 2x o comprimento da seta do
     gizmo (h=gizmoArrowLength(), era metade disso) — pedido do usuário; a
     grade continua com célula = metade da seta (inalterado).
   Rodada 5 (2026-09-06): (a) novas funções getVisibleImageRect(),
     rayExitDistance() e computeLineExtension(), usadas em drawAxisLines()
     para desenhar um prolongamento fino em cada linha de VP, na direção de
     onde o par converge, terminando no próprio ponto de fuga (se visível)
     ou na borda da tela — reproduzindo o comportamento do fSpy original,
     pedido explicitamente pelo usuário. (b) draw3DGuide(): linhas da grade/
     caixa mais finas (lineWidth 0.75, era 1.5) e tamanho de célula da grade
     = metade da seta do gizmo (gizmoArrowLength()/2). (c) nova função
     updateCalibErrorMessage() — mostra/esconde a mensagem "Configuração de
     ponto de fuga inválida..." abaixo de "Distância Focal" quando há imagem
     mas a calibração falhou. (d) correção de bug: a linha "ângulo" do
     painel direito estava DESAPARECENDO quando a calibração falhava; agora
     só fica oculta quando o modo é quaternion, mostrando "—" nos demais
     casos sem calibração válida (igual aos outros campos de leitura).
   Rodada 10 (2026-09-08): pedido grande do usuário — várias features novas:
     (a) drawDiagonals() — linhas diagonais finas (canto-a-canto) sobre a
     imagem, quando state.diagonals.enabled. (b) 3º ponto de fuga móvel:
     candidato kind:'vp3Point' em buildHandleCandidates() (só quando
     state.move3VPEnabled), nova função moveVp3To() (chamada por applyDrag)
     que reposiciona as extremidades NÃO travadas do par axisPoints[3] para
     que a interseção das 2 linhas siga o mouse, respeitando state.vp3Lock;
     drawVp3Extras() desenha os destaques de travamento/alça do 3º VP; o
     "botão de travar" intercepta cliques nas 4 extremidades (kind:'axisPoint3')
     para alternar o travamento em vez de arrastar (ver vp3LockToolActive/
     setVp3LockToolActive(), mousedown). (c) Guia 3D "Pisos móveis"
     (state.guide3d==='gridsMovable'): drawMovableGrids(), movableGridWorldSegments(),
     gridCandidatesAt() (hit-test por distância ponto-segmento em tela) e
     applyGridDrag() (arraste do offset 2D da grade dentro do seu próprio
     plano, via um jacobiano numérico local da projeção — a perspectiva não é
     linear, então a cada mousemove a conversão tela->mundo é recalculada).
     (d) nearbyCandidates() passou a UNIFICAR candidatos de alça (pontos) com
     candidatos de grade (linhas) numa mesma lista ordenada por distância —
     assim o sistema de ciclo de sobreposição (Ctrl/setas) e o indicador perto
     do cursor também funcionam para as grades, como pedido; drawHoverIndicator()
     ganhou um "gradinho" com o rótulo do plano (YZ/XZ/XY) para candidatos de
     grade, em vez do círculo colorido usado para alças de ponto. (e) nova
     função compartilhada projectWorldSegment() (extraída da antiga edge()
     local de draw3DGuide) — usada também pelas grades móveis e pela Guia 3D
     "Canto" (ver js/corner-guide.js, arquivo novo, que desenha os cantos
     tanto no popup do cubo interativo quanto na imagem principal via
     draw3DGuide()). (f) render() ganhou as chamadas de drawDiagonals() e
     drawVp3Extras().
   Rodada 11 (2026-09-08): generalização grande do "mover/travar o 3º ponto
     de fuga" (rodada 10) para os 3 eixos, mais 2 features novas — ver
     histórico completo em state.js (vpMove/movePPFrom3VP/
     manualPPShowThirdAxisLines). Nesta arquivo: (a) vp3LockToolActive (só
     eixo 3) virou vpLockToolActive{1,2,3}/setVpLockToolActive(axisIdx,v).
     (b) moveVp3To()/drawVp3Extras() generalizados para moveAxisVpTo(axisIdx,..)/
     drawVpMoveExtras(axisIdx) — candidato kind:'vp3Point' virou kind:'vpPoint'
     com campo axisIdx (1,2 ou 3). (c) NOVO: pivotEndpoint() — corrige um bug
     relatado pelo usuário em que a extremidade livre de uma linha com 1
     ponto travado podia "saltar" para o lado oposto ao mover o ponto de
     fuga; agora usa a razão colinear ORIGINAL (ponto_livre = travado +
     (alvo-travado)/s, onde s vem da posição do vp ANTIGO na reta) em vez de
     recolocar a uma distância fixa na direção do alvo — preserva o "lado"
     correto sempre. adjustAxisLine() usa essa mesma função tanto para uma
     extremidade explicitamente travada quanto (no modo 'anchor') para o
     pivô escolhido automaticamente (a extremidade mais afastada do vp
     antigo). (d) NOVO: candidato kind:'ppFrom3VP' + movePPFrom3VPBy() — move
     "o ponto médio gerado pelos 3 pontos de fuga" (o ortocentro, quando
     ppMode='fromThirdVP') tentando transladar vp1/vp2/vp3 pelo mesmo delta,
     cada um respeitando seu próprio vpMove[eixo] (mostra 1 aviso combinado
     se nenhum dos 3 puder se mover, em vez de repetir o aviso 3x). (e) NOVO:
     drawManualPPThirdAxisLines() — desenha axisPoints[3] como linhas
     INFINITAS (não só o prolongamento até o vp) quando ppMode='manual' e
     state.manualPPShowThirdAxisLines. (f) drawHoverIndicator() ganhou um
     caso para candidatos kind:'lineNumber' — mostra o mesmo "selo" escuro
     com o número (não só um círculo colorido), igual ao desenho real do
     número no meio da linha (pedido do usuário).
   -------------------------------------------------------------------------- */

const viewport = document.getElementById('viewport');
const ctx = viewport.getContext('2d');

function resizeCanvas(){
  const rect = viewportWrap.getBoundingClientRect();
  viewport.width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
  viewport.height = Math.max(1, Math.floor(rect.height * devicePixelRatio));
  viewport.style.width = rect.width+'px'; viewport.style.height = rect.height+'px';
  render();
}
window.addEventListener('resize', resizeCanvas);

function fitZoom(){
  if(!state.image) return;
  const rect = viewportWrap.getBoundingClientRect();
  const margin=40;
  const sx = (rect.width-margin*2)/state.imageW, sy = (rect.height-margin*2)/state.imageH;
  state.zoom = Math.max(0.02, Math.min(sx, sy));
  state.panX = (rect.width - state.imageW*state.zoom)/2;
  state.panY = (rect.height - state.imageH*state.zoom)/2;
}
// Centraliza a imagem no viewport SEM alterar o nível de zoom atual (usado por "Abrir imagem",
// que deve apenas carregar a imagem centralizada, sem forçar um ajuste de zoom).
function centerImage(){
  if(!state.image) return;
  const rect = viewportWrap.getBoundingClientRect();
  state.panX = (rect.width - state.imageW*state.zoom)/2;
  state.panY = (rect.height - state.imageH*state.zoom)/2;
}

// coordenadas: imagem(px) -> tela(css px)
function imgToScreen(p){ return [p[0]*state.zoom + state.panX, p[1]*state.zoom + state.panY]; }
function screenToImg(p){ return [(p[0]-state.panX)/state.zoom, (p[1]-state.panY)/state.zoom]; }

// Retângulo (em coordenadas de imagem) correspondente à área do viewport atualmente visível na
// tela — usado para limitar o prolongamento das linhas de VP à parte visível da tela.
function getVisibleImageRect(){
  const rect = viewportWrap.getBoundingClientRect();
  const tl = screenToImg([0,0]);
  const br = screenToImg([rect.width, rect.height]);
  return { minX:Math.min(tl[0],br[0]), maxX:Math.max(tl[0],br[0]), minY:Math.min(tl[1],br[1]), maxY:Math.max(tl[1],br[1]) };
}
// Distância (a partir de origin, na direção unitária dir) até a borda do retângulo rect.
function rayExitDistance(origin, dir, rect){
  let tExit = Infinity;
  if(dir[0] > 1e-9) tExit = Math.min(tExit, (rect.maxX-origin[0])/dir[0]);
  else if(dir[0] < -1e-9) tExit = Math.min(tExit, (rect.minX-origin[0])/dir[0]);
  if(dir[1] > 1e-9) tExit = Math.min(tExit, (rect.maxY-origin[1])/dir[1]);
  else if(dir[1] < -1e-9) tExit = Math.min(tExit, (rect.minY-origin[1])/dir[1]);
  if(!isFinite(tExit)) return 0;
  return Math.max(0, tExit);
}
// Calcula o prolongamento (fino) de uma linha de controle [p1,p2] em direção ao ponto de fuga
// `vp` (interseção das 2 linhas do par). Estende a partir da ponta mais próxima do vp, na
// direção que realmente leva até ele (o lado "mais inclinado" na direção da convergência) —
// nunca nos dois sentidos. Termina exatamente no vp, se ele cair dentro da área visível da
// tela; caso contrário, termina na borda visível (rect). Retorna null se as linhas forem
// paralelas (sem vp) ou se o vp cair dentro do próprio segmento (nada a prolongar).
function computeLineExtension(p1, p2, vp, rect){
  if(!vp) return null;
  const d = [p2[0]-p1[0], p2[1]-p1[1]];
  const lenSq = d[0]*d[0]+d[1]*d[1];
  if(lenSq<1e-9) return null;
  const t = ((vp[0]-p1[0])*d[0] + (vp[1]-p1[1])*d[1]) / lenSq;
  let fromPt, dir;
  if(t > 1){ fromPt = p2; dir = d; }
  else if(t < 0){ fromPt = p1; dir = [-d[0],-d[1]]; }
  else return null; // vp fica dentro do próprio segmento — nada a prolongar
  const dirLen = Math.hypot(dir[0],dir[1]);
  const dirN = [dir[0]/dirLen, dir[1]/dirLen];
  const distToVp = Math.hypot(vp[0]-fromPt[0], vp[1]-fromPt[1]);
  const maxDist = rayExitDistance(fromPt, dirN, rect);
  const endDist = Math.min(distToVp, maxDist);
  if(endDist <= 1e-6) return null;
  return [fromPt, [fromPt[0]+dirN[0]*endDist, fromPt[1]+dirN[1]*endDist]];
}
// Rodada 29 (2026-09-09): pedido do usuário — "irmã" de computeLineExtension() acima, mas para o
// SEGUNDO prolongamento por eixo (novo botão .axisInfBtn): em vez de estender a partir da
// extremidade mais PRÓXIMA do vp em direção a ele, estende a partir da extremidade mais DISTANTE
// do vp, no sentido que se AFASTA dele — sempre até a borda visível da tela (nunca até o vp, que
// não faria sentido aqui). Mesma convenção de `t` usada acima para achar qual ponta é a mais
// distante e a direção correta: se t>1 (a ponta próxima do vp é p2), a distante é p1, prolongada
// no sentido -d; se t<0 (a ponta próxima é p1), a distante é p2, prolongada no sentido d. Quando o
// vp cai dentro do próprio segmento (0<=t<=1) não há um "lado distante" bem definido — retorna
// null, igual a computeLineExtension().
function computeFarPointExtension(p1, p2, vp, rect){
  if(!vp) return null;
  const d = [p2[0]-p1[0], p2[1]-p1[1]];
  const lenSq = d[0]*d[0]+d[1]*d[1];
  if(lenSq<1e-9) return null;
  const t = ((vp[0]-p1[0])*d[0] + (vp[1]-p1[1])*d[1]) / lenSq;
  let farPt, dir;
  if(t > 1){ farPt = p1; dir = [-d[0],-d[1]]; }
  else if(t < 0){ farPt = p2; dir = d; }
  else return null;
  const dirLen = Math.hypot(dir[0],dir[1]);
  const dirN = [dir[0]/dirLen, dir[1]/dirLen];
  const maxDist = rayExitDistance(farPt, dirN, rect);
  if(maxDist <= 1e-6) return null;
  return [farPt, [farPt[0]+dirN[0]*maxDist, farPt[1]+dirN[1]*maxDist]];
}

/* --------------------------- Pan / zoom / seleção --------------------------- */
let isPanning=false, panStart=null, panOrigin=null;
let dragTarget=null; // {kind, ...}
let hoverTarget=null;
let lastMouseSP=null; // última posição do mouse em coordenadas de tela (usado pelo ciclo do Ctrl)
// Plano de grade "hot" (perto do cursor ou sendo arrastada) na Guia 3D "Pisos móveis" — usado só
// para o destaque visual (branco -> amarelado), ver drawMovableGrids().
let hoverGridPlane=null;
// Estado (não persistido) do "botão de travar", um por eixo (1, 2, 3): enquanto ativo para um
// eixo, clicar numa das 4 extremidades do seu par de linhas alterna o travamento
// (state.vpMove[eixo].lock) em vez de iniciar um arraste — ver mousedown abaixo e os listeners
// dos botões em ui-controls.js.
let vpLockToolActive = {1:false, 2:false, 3:false};
function setVpLockToolActive(axisIdx, v){ vpLockToolActive[axisIdx]=v; render(); }

/* ---------------------- "Explicador visual" (rodada 25 — 2026-09-09) ------------------------ */
// Pedido do usuário: um modo, ligado/desligado pelo botão #explainerToggleBtn na nova janela
// "O que é isso?" (index.html/ui-controls.js), em que passar o mouse sobre qualquer elemento
// clicável/arrastável da imagem principal (ponto de fuga, extremidade de linha, ponto principal,
// origem do gizmo, grade da Guia 3D "Pisos móveis", etc.) desenha uma seta apontando para ele e
// mostra um texto de 2 linhas — "Isto é: <nome>" e, na linha de baixo, uma descrição do que é/
// para que serve. Não é um estado do PROJETO (não entra em state{}/serializeProject() nem no
// histórico de desfazer/refazer) — é só um modo de interação transitório da sessão atual, mesmo
// padrão de vpLockToolActive acima. Reaproveita TODA a infraestrutura de hit-test já existente
// (hitTestHandles()/buildHandleCandidates(), a mesma usada para arrastar) — os candidatos já têm
// tudo que é preciso (kind, axisIdx, plane, pt) para decidir o texto certo (ver explainerInfo()).
let explainerModeActive = false;
let explainerHoverTarget = null; // último candidato (mesmo formato de hoverTarget) mostrado no tooltip
function setExplainerModeActive(v){
  explainerModeActive = v;
  const btn = document.getElementById('explainerToggleBtn');
  if(btn) btn.classList.toggle('active', v);
  // Rodada 26: o texto do botão vive num <span> à parte (#explainerToggleLabel) desde esta rodada
  // — o botão em si ganhou um ícone SVG fixo (index.html) que btn.textContent=... apagaria junto.
  const label = document.getElementById('explainerToggleLabel');
  if(label) label.textContent = v ? 'Desativar explicador visual' : 'Ativar explicador visual';
  // Rodada 26: pedido do usuário — enquanto ativo, deixar visível (não só no texto da janela "O
  // que é isso?", que pode já estar fechada) que clicar/arrastar na imagem estão desligados.
  const banner = document.getElementById('explainerActiveBanner');
  if(banner) banner.classList.toggle('hidden', !v);
  if(state.image) viewport.style.cursor = v ? 'help' : (hoverTarget? 'grab':'default');
  if(!v) updateExplainerHover(null); // esconde o tooltip/seta na hora, sem esperar o próximo mousemove
  render();
}
// Letra do eixo do mundo (x/y/z) associada a um candidato pelo seu axisIdx (1, 2 ou 3) — mesma
// convenção usada em candidateColor() acima, só que devolvendo a LETRA (para compor o texto),
// não a cor.
function axisLetterForCandidateAxis(axisIdx){
  if(axisIdx===3) return thirdAxisLetter();
  return axisLetter(axisIdx===1 ? state.axis1 : state.axis2);
}
// Título + descrição mostrados no tooltip do explicador para cada TIPO de candidato de handle
// (mesmos "kind" de buildHandleCandidates()/hitTestHandles(), ver canvas-render.js acima) — cobre
// todos os elementos clicáveis/arrastáveis do app, pedido explícito do usuário ("deve funcionar
// para todos os elementos").
function explainerInfo(c){
  switch(c.kind){
    case 'vpPoint': {
      const l = axisLetterForCandidateAxis(c.axisIdx);
      return { title:`Ponto de fuga (eixo ${l})`,
        desc:`Ponto para onde convergem, na imagem, todas as retas paralelas ao eixo ${l} do mundo real. Arraste-o para mover o par de linhas deste eixo direto pelo próprio ponto de fuga (só disponível quando "Mover" está ligado para este eixo).` };
    }
    case 'axisPoint': {
      const l = axisLetterForCandidateAxis(c.axisIdx);
      return { title:`Extremidade da linha do eixo ${l} (${c.axisIdx})`,
        desc:`Alinhe-a com uma aresta da foto que seja paralela ao eixo ${l} no mundo real. As 2 extremidades de cada uma das 2 linhas do par (4 no total) definem, pela interseção das retas, o ponto de fuga deste eixo.` };
    }
    case 'axisPoint3': {
      const l = thirdAxisLetter();
      return { title:`Extremidade da linha auxiliar do 3º eixo (${l})`,
        desc:`Usada só para achar o Ponto Principal "a partir do 3º ponto de fuga" — não participa da calibração dos eixos 1/2 em si.` };
    }
    case 'rectCorner':
      return { title:'Canto do retângulo de calibração',
        desc:'Com o "Modo retângulo" ligado, os pares de linha dos eixos 1 e 2 compartilham estes 4 cantos — mover um canto ajusta as linhas dos 2 eixos ao mesmo tempo.' };
    case 'pp':
      return { title:'Ponto Principal (manual)',
        desc:'O centro óptico da imagem, projetado sobre ela — o ponto por onde passa o eixo de visada da câmera. Neste modo você o posiciona manualmente; em outros modos ele é calculado automaticamente.' };
    case 'ppFrom3VP':
      return { title:'Ponto Principal (a partir dos 3 pontos de fuga)',
        desc:'O ortocentro do triângulo formado pelos 3 pontos de fuga — método clássico para achar o centro óptico quando os 3 eixos do mundo são mutuamente perpendiculares. Arraste para tentar mover os 3 pontos de fuga juntos.' };
    case 'origin':
      return { title:'Origem do gizmo (mundo 3D)',
        desc:'O ponto a partir do qual as 3 setas dos eixos x/y/z são desenhadas — é também a partir dele que a "Distância de referência" e as Guias 3D são posicionadas sobre a imagem.' };
    case 'refPoint':
      return { title:'Extremidade da Distância de referência',
        desc:'Junto com o valor numérico informado no painel esquerdo, fixa a escala REAL (metros, cm, etc.) da cena 3D reconstruída — sem isso, a escala é arbitrária.' };
    case 'lineNumber':
      return { title:`Número da linha "${c.axisIdx}"`,
        desc:'Arraste para transladar a linha inteira (ou os cantos do retângulo correspondentes, com o Modo retângulo ligado), preservando sua orientação.' };
    case 'movableGrid':
      return { title:`Grade da Guia 3D "Pisos móveis" (plano ${c.plane})`,
        desc:'Arraste para deslizar esta grade dentro do seu próprio plano — útil para alinhá-la com uma superfície real visível na foto (um piso, uma parede).' };
    default:
      return { title:'Elemento do VanishCam', desc:'Elemento interativo da calibração.' };
  }
}
// Deslocamento (canvas px) do CANTO do tooltip em relação ao ponto de tela do elemento — usado
// tanto para posicionar o <div> #explainerTooltip (updateExplainerHover(), coordenadas de página)
// quanto para a ponta de PARTIDA da seta desenhada no canvas (drawExplainerHoverArrow(),
// coordenadas do próprio canvas — mesma origem). Foge para o lado oposto perto das bordas do
// viewport, para o tooltip não nascer cortado para fora da tela.
function explainerTooltipOffset(sp){
  const rect = viewportWrap.getBoundingClientRect();
  const dx = sp[0] > rect.width*0.6 ? -220 : 26;
  const dy = sp[1] > rect.height*0.65 ? -66 : 26;
  return [dx,dy];
}
// Atualiza qual candidato está sendo explicado agora (chamado a cada mousemove enquanto
// explainerModeActive, e com null ao sair do canvas ou desligar o modo) — mostra/esconde e
// posiciona o <div> #explainerTooltip; a seta em si é desenhada em render() (drawExplainerHoverArrow()).
function updateExplainerHover(c){
  explainerHoverTarget = c;
  const tip = document.getElementById('explainerTooltip');
  if(!tip) return;
  if(!c){ tip.classList.add('hidden'); return; }
  const info = explainerInfo(c);
  document.getElementById('explainerTooltipTitle').textContent = 'Isto é: ' + info.title;
  document.getElementById('explainerTooltipDesc').textContent = info.desc;
  tip.classList.remove('hidden');
  const anchorSP = c.pt ? s(c.pt) : (lastMouseSP || [0,0]);
  const [dx,dy] = explainerTooltipOffset(anchorSP);
  const rect = viewport.getBoundingClientRect();
  tip.style.left = (rect.left + anchorSP[0] + dx) + 'px';
  tip.style.top = (rect.top + anchorSP[1] + dy) + 'px';
}
// Seta (linha + cabeça em chevron, reaproveitando drawChevronHead() — ver mais abaixo no arquivo)
// do canto do tooltip até o elemento explicado — só quando o candidato tem um ponto de imagem
// definido (c.pt); grades (kind:'movableGrid') não têm um único ponto, então ficam só com o texto
// perto do cursor, sem seta. Chamada em render(), depois de tudo o mais já desenhado.
function drawExplainerHoverArrow(){
  if(!explainerModeActive || !explainerHoverTarget || !explainerHoverTarget.pt) return;
  const sp = s(explainerHoverTarget.pt);
  const [dx,dy] = explainerTooltipOffset(sp);
  const anchor = [sp[0]+dx, sp[1]+dy];
  ctx.save();
  ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.95; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(anchor[0],anchor[1]); ctx.lineTo(sp[0],sp[1]); ctx.stroke();
  ctx.restore();
  drawChevronHead(anchor, sp, '#ffe066');
}

// Estado do "ciclo de sobreposição": quando há 2+ bolinhas de extremidade exatamente uma em
// cima da outra, pressionar e soltar Ctrl alterna qual delas fica "na frente" (clicável) —
// ver keyup de 'Control' mais abaixo e o uso de `overlapCycle` em hitTestHandles().
let overlapCycle = { key:null, order:[], idx:0 };
// Agrupa posições de tela próximas (poucos px de tolerância) na mesma "região", para saber se
// um Ctrl solto agora se refere ao mesmo agrupamento de bolinhas sobrepostas de antes.
function regionKey(sp){ return Math.round(sp[0]/3)+','+Math.round(sp[1]/3); }
// Assinatura textual única de um candidato de handle — usada para lembrar a ordem de ciclagem.
function candSig(c){
  switch(c.kind){
    case 'axisPoint': return `axisPoint:${c.axisIdx}:${c.lineKey}:${c.ptIdx}`;
    case 'rectCorner': return `rectCorner:${c.key}`;
    case 'axisPoint3': return `axisPoint3:${c.lineKey}:${c.ptIdx}`;
    case 'refPoint': return `refPoint:${c.idx}`;
    case 'lineNumber': return `lineNumber:${c.axisIdx}:${c.lineKey}`;
    case 'vpPoint': return `vpPoint:${c.axisIdx}`;
    case 'ppFrom3VP': return 'ppFrom3VP';
    case 'movableGrid': return `movableGrid:${c.plane}`;
    default: return c.kind;
  }
}

/* --------------------- Guia 3D "Pisos móveis" (grades YZ/XZ/XY) --------------------- */
// Eixos (índices 0=x,1=y,2=z) que compõem o PLANO de cada grade (os 2 em que ela pode deslizar
// — nunca no eixo normal ao plano, que não faz parte de state.movableGrids[plane].offset).
const PLANE_AXES = { YZ:[1,2], XZ:[0,2], XY:[0,1] };

// Segmentos de reta (em coordenadas de MUNDO 3D, unidades da cena) que compõem uma grade,
// deslocada pelo seu offset 2D — mesmo padrão de malha usado no modo de grade única antiga
// (ver o antigo bloco 'else' de draw3DGuide), só que agora com o offset somado às 2 coordenadas
// do plano, permitindo "arrastar" a grade inteira sem sair do seu próprio plano.
function movableGridWorldSegments(plane){
  const arrowLen = gizmoArrowLength(), unit = arrowLen/2;
  const axes = PLANE_AXES[plane];
  const off = state.movableGrids[plane].offset;
  const N=10, half=N/2;
  const segs=[];
  for(let i=0;i<=N;i++){
    const t=(i-half)*unit;
    let P1=[0,0,0], P2=[0,0,0];
    P1[axes[0]]=t+off[0]; P1[axes[1]]=-half*unit+off[1];
    P2[axes[0]]=t+off[0]; P2[axes[1]]= half*unit+off[1];
    segs.push([P1,P2]);
    let P3=[0,0,0], P4=[0,0,0];
    P3[axes[1]]=t+off[1]; P3[axes[0]]=-half*unit+off[0];
    P4[axes[1]]=t+off[1]; P4[axes[0]]= half*unit+off[0];
    segs.push([P3,P4]);
  }
  return segs;
}
function drawMovableGrids(){
  ['YZ','XZ','XY'].forEach(plane=>{
    const isHot = (hoverGridPlane===plane) || (dragTarget && dragTarget.kind==='movableGrid' && dragTarget.plane===plane);
    ctx.strokeStyle = isHot ? '#ffe066' : 'rgba(255,255,255,0.85)'; // branco -> amarelado no hover/arraste
    ctx.lineWidth = isHot ? 1.4 : 0.75;
    movableGridWorldSegments(plane).forEach(([P1,P2])=>{
      const seg = projectWorldSegment(P1,P2); if(!seg) return;
      ctx.beginPath(); ctx.moveTo(seg[0][0],seg[0][1]); ctx.lineTo(seg[1][0],seg[1][1]); ctx.stroke();
    });
  });
}
// Distância (em px de tela) de um ponto ao SEGMENTO (a,b) — a "equação geral da reta" citada
// pelo usuário corresponde à distância perpendicular ponto-reta; usamos a variante recortada ao
// segmento (clamped) para não detectar cliques muito além das pontas da grade desenhada.
function pointSegDist(p,a,b){
  const dx=b[0]-a[0], dy=b[1]-a[1];
  const lenSq=dx*dx+dy*dy;
  if(lenSq<1e-9) return Math.hypot(p[0]-a[0],p[1]-a[1]);
  let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/lenSq;
  t=Math.max(0,Math.min(1,t));
  return Math.hypot(p[0]-(a[0]+dx*t), p[1]-(a[1]+dy*t));
}
// Candidatos de grade (uma "região de tolerância" de alguns px) perto de sp — participam da
// mesma lista unificada de nearbyCandidates() (pontos + grades), então o ciclo de sobreposição
// (Ctrl/setas) e o indicador perto do cursor também funcionam entre grades e alças de ponto.
function gridCandidatesAt(sp){
  if(state.guide3d!=='gridsMovable' || !state.calib) return [];
  const tol=6; const out=[];
  ['YZ','XZ','XY'].forEach(plane=>{
    let best=Infinity;
    movableGridWorldSegments(plane).forEach(([P1,P2])=>{
      const seg=projectWorldSegment(P1,P2); if(!seg) return;
      const d=pointSegDist(sp,seg[0],seg[1]);
      if(d<best) best=d;
    });
    if(best<=tol) out.push({plane, d:best});
  });
  return out;
}
// Arraste de uma grade: em vez de converter a posição do mouse para coordenadas de imagem (como
// as demais alças), o alvo é um deslocamento 2D em coordenadas de MUNDO, dentro do próprio plano
// da grade. Como a projeção da câmera é perspectiva (não-linear), a cada mousemove recalculamos
// um jacobiano numérico local (diferenças finitas pequenas nas 2 direções do plano) para converter
// o deslocamento INCREMENTAL de tela (desde o mousemove anterior) num deslocamento incremental de
// mundo — evita acumular erro de uma linearização única feita só no início do arraste.
function worldToScreenPoint(P){
  const pc = worldToCamSpace(P); if(!pc) return null;
  if(pc[2] >= -1e-6) return null; // atrás da câmera: projeção instável para o jacobiano
  return s(projectCamSpacePoint(pc));
}
// Rodada 15: interseção do raio câmera->cursor com o plano da grade (a coordenada, no eixo
// perpendicular ao plano, é sempre 0 — ver movableGridWorldSegments()) — usada em applyGridDrag()
// para descobrir o ponto exato de MUNDO que o usuário agarrou no mousedown (não só o canto/centro
// da grade), para que esse ponto específico acompanhe o cursor durante o arraste. Inverte
// projectCamSpacePoint()/worldToCamSpace(): dado um pixel de tela, reconstrói a direção do raio em
// espaço de câmera (pcz=-1 fixo) e converte para espaço de mundo via R_cw (câmera->mundo).
function screenToWorldOnPlane(sp, normalAxisIdx){
  const c = state.calib; if(!c) return null;
  const ip = screenToImg(sp);
  const dirCam = [ (ip[0]-c.pp[0])/c.f, (ip[1]-c.pp[1])/c.f, -1 ];
  const dirWorld = M3.mulVec(c.R_cw, dirCam);
  const denom = dirWorld[normalAxisIdx];
  if(Math.abs(denom) < 1e-9) return null; // raio quase paralelo ao plano: sem interseção útil
  const t = -c.camPos[normalAxisIdx]/denom;
  if(t <= 1e-6) return null; // interseção ficaria atrás da câmera
  return [ c.camPos[0]+t*dirWorld[0], c.camPos[1]+t*dirWorld[1], c.camPos[2]+t*dirWorld[2] ];
}
// Rodada 15: fallback — comportamento antigo (incremental, jacobiano calculado sempre no CENTRO
// do plano/offset atual). Só é usado quando não foi possível calcular target.grabLocal no
// mousedown (ex.: calibração instável naquele instante). Mantido tal como estava.
function applyGridDragIncremental(target, sp){
  const axes = PLANE_AXES[target.plane];
  const off = state.movableGrids[target.plane].offset;
  const eps = Math.max(1, gizmoArrowLength()*0.02);
  const center=[0,0,0]; center[axes[0]]=off[0]; center[axes[1]]=off[1];
  const p0=worldToScreenPoint(center);
  const cA=center.slice(); cA[axes[0]]+=eps;
  const cB=center.slice(); cB[axes[1]]+=eps;
  const pA=worldToScreenPoint(cA), pB=worldToScreenPoint(cB);
  const dSx=sp[0]-target.prevSP[0], dSy=sp[1]-target.prevSP[1];
  if(p0 && pA && pB){
    const j11=(pA[0]-p0[0])/eps, j21=(pA[1]-p0[1])/eps;
    const j12=(pB[0]-p0[0])/eps, j22=(pB[1]-p0[1])/eps;
    const det=j11*j22-j12*j21;
    if(Math.abs(det)>1e-9){
      off[0]+= (j22*dSx - j12*dSy)/det;
      off[1]+= (-j21*dSx + j11*dSy)/det;
    }
  }
  target.prevSP = sp;
}
// Rodada 17: CORREÇÃO DE BUG — as rodadas 15/16 resolviam o arraste da grade por NEWTON
// (iterativo, baseado num jacobiano numérico), o que se provou frágil demais: mesmo com as
// salvaguardas da rodada 16 (limiar relativo, teto de passo, validação do resultado), o usuário
// ainda conseguia fazer a grade "disparar" para longe e ficar presa lá, dependendo da orientação
// do gizmo — porque um jacobiano mal-condicionado (não necessariamente singular) ainda podia
// gerar um passo grande mas "válido" o bastante para passar nas checagens, e uma vez longe, o
// jacobiano LOCAL naquele lugar errado podia continuar mal-condicionado, prendendo a grade lá
// (só um mouseup+mousedown novo — que recalcula grabLocal do zero via screenToWorldOnPlane() —
// às vezes destravava). A causa raiz era usar um método ITERATIVO/aproximado para um problema que
// tem solução EXATA e direta: a interseção do raio câmera→cursor com o plano da grade
// (screenToWorldOnPlane(), já usada no mousedown para achar o ponto agarrado) dá o ponto de
// mundo EXATO sob o cursor em UM passo, sem jacobiano, sem iteração e portanto sem como
// "disparar" — o novo offset é simplesmente esse ponto menos o ponto agarrado (grabLocal). Se a
// interseção falhar (raio quase paralelo ao plano — caso raro, ex.: olhando quase de perfil para
// a grade), o offset simplesmente não muda naquele quadro (mantém a última posição válida) em vez
// de arriscar um valor ruim.
function applyGridDrag(target, sp){
  if(!target.grabLocal){ applyGridDragIncremental(target, sp); return; }
  const axes = PLANE_AXES[target.plane];
  const normalAxisIdx = 3 - axes[0] - axes[1];
  const wp = screenToWorldOnPlane(sp, normalAxisIdx);
  if(wp){
    const off = state.movableGrids[target.plane].offset;
    off[0] = wp[axes[0]] - target.grabLocal[0];
    off[1] = wp[axes[1]] - target.grabLocal[1];
  }
  target.prevSP = sp;
}

// Rodada 24 (2026-09-09): lógica de zoom da imagem principal extraída para uma função à parte,
// reaproveitada pelo listener 'wheel' do viewport (logo abaixo) E pelo novo listener 'wheel' de
// #cornerPopupOverlay em corner-guide.js (rolar a roda fora da caixa do cubo 3D interativo, com o
// popup aberto, deve continuar dando zoom nesta imagem — pedido do usuário). Recebe clientX/clientY
// (coordenadas de tela do evento, iguais em ambos os listeners) em vez do evento inteiro, para não
// acoplar esta função a nenhum dos dois listeners específicos.
function zoomMainImageAt(clientX, clientY, deltaY){
  if(!state.image) return;
  const rect = viewport.getBoundingClientRect();
  const mx = clientX-rect.left, my=clientY-rect.top;
  const before = screenToImg([mx,my]);
  const factor = Math.exp(-deltaY*0.0015);
  state.zoom = Math.min(40, Math.max(0.01, state.zoom*factor));
  const after = imgToScreen(before);
  state.panX += mx-after[0]; state.panY += my-after[1];
  render();
}

viewport.addEventListener('wheel', (e)=>{
  if(!state.image) return;
  e.preventDefault();
  zoomMainImageAt(e.clientX, e.clientY, e.deltaY);
}, {passive:false});

viewport.addEventListener('mousedown', (e)=>{
  if(!state.image) return;
  const rect = viewport.getBoundingClientRect();
  const sp = [e.clientX-rect.left, e.clientY-rect.top];
  if(e.button===1){ isPanning=true; panStart=sp; panOrigin=[state.panX,state.panY]; e.preventDefault(); return; }
  // Rodada 25: com o "explicador visual" ligado, clicar/arrastar elementos fica desligado de
  // propósito (pedido do usuário: "Clicar/arrastar fica desligado enquanto o explicador está
  // ativo", ver texto da janela "O que é isso?") — evita mover um ponto sem querer enquanto só se
  // está explorando o app; pan (botão do meio, tratado acima) e zoom (roda) continuam funcionando.
  if(e.button===0 && explainerModeActive) return;
  if(e.button===0){
    const h = hitTestHandles(sp);
    if(h){
      // "Botão de travar" ativo PARA O EIXO da extremidade clicada: alterna o travamento
      // (state.vpMove[eixo].lock) em vez de iniciar um arraste normal. 'axisPoint' cobre os
      // eixos 1/2 (fora do Modo retângulo — dentro dele os candidatos são 'rectCorner', que não
      // participam do travamento, ver comentário em vpMove no state.js); 'axisPoint3' é sempre o
      // eixo 3.
      // Rodada 13: também trava/destrava com [modificador]+clique direto na extremidade,
      // mesmo com o "botão de travar" do eixo desligado (shortcutModifierActive(), state.js).
      if(h.kind==='axisPoint' && (vpLockToolActive[h.axisIdx] || shortcutModifierActive(e))){
        const lk = state.vpMove[h.axisIdx].lock;
        lk[h.lineKey][h.ptIdx] = !lk[h.lineKey][h.ptIdx];
        if(typeof updateVpLockBadge==='function') updateVpLockBadge(h.axisIdx);
        markDirty(); render(); e.preventDefault(); return;
      }
      if(h.kind==='axisPoint3' && (vpLockToolActive[3] || shortcutModifierActive(e))){
        const lk = state.vpMove[3].lock;
        lk[h.lineKey][h.ptIdx] = !lk[h.lineKey][h.ptIdx];
        if(typeof updateVpLockBadge==='function') updateVpLockBadge(3);
        markDirty(); render(); e.preventDefault(); return;
      }
      // Arrastar um ponto de fuga diretamente: se as 4 extremidades do seu par de linhas
      // estiverem todas travadas, o ponto é geometricamente imóvel — avisa e não inicia arraste.
      if(h.kind==='vpPoint'){
        const vm = state.vpMove[h.axisIdx];
        const lk = vm.lock;
        if(lk.l1[0]&&lk.l1[1]&&lk.l2[0]&&lk.l2[1]){ showVpLockToast(); e.preventDefault(); return; }
        // Rodada 17: CORREÇÃO DE BUG — com "Mover" + 📏 "comprimento fixo" (distMode==
        // 'preserveLength') + "Ancorar" ativos ao mesmo tempo, a extremidade que serve de pivô/
        // âncora era recalculada a CADA mousemove (a mais distante do vp "antigo" daquele quadro,
        // ver adjustAxisLine()) — perto o bastante do vp de uma extremidade, essa escolha podia
        // trocar de lado no meio do próprio arraste, fazendo as linhas "andarem"/saltarem de
        // repente (pedido do usuário para corrigir). Fixamos aqui, uma ÚNICA vez no início do
        // arraste, qual extremidade de cada linha (l1/l2) é a âncora — moveAxisVpTo() passa a
        // tratá-la como se estivesse TRAVADA pelo resto deste arraste (ver dragTarget.anchorFreeze
        // usado lá), então ela nunca mais troca de lado até o mouseup.
        if(vm.mode==='anchor' && (vm.distMode||'proportional')==='preserveLength'){
          const ap = state.axisPoints[h.axisIdx];
          const oldVp = h.pt;
          function anchorIdxOf(line){
            const d0=Math.hypot(line[0][0]-oldVp[0], line[0][1]-oldVp[1]);
            const d1=Math.hypot(line[1][0]-oldVp[0], line[1][1]-oldVp[1]);
            return d0>=d1 ? 0 : 1;
          }
          h.anchorFreeze = { l1: anchorIdxOf(ap.l1), l2: anchorIdxOf(ap.l2) };
        }
      }
      // Grade da Guia 3D "Pisos móveis": arraste em espaço de MUNDO (offset 2D no plano da
      // grade), não em espaço de imagem — guarda a posição de tela anterior para o jacobiano
      // numérico incremental usado por applyGridDrag() a cada mousemove.
      if(h.kind==='movableGrid'){
        // Rodada 15: calcula, via interseção raio-plano, o ponto exato de MUNDO que foi clicado
        // (no referencial local da grade, sem o offset atual) — é esse ponto que applyGridDrag()
        // vai manter grudado no cursor durante o arraste (ver comentário lá).
        const axes = PLANE_AXES[h.plane];
        const normalAxisIdx = 3 - axes[0] - axes[1];
        const off0 = state.movableGrids[h.plane].offset;
        const wp = screenToWorldOnPlane(sp, normalAxisIdx);
        const grabLocal = wp ? [ wp[axes[0]]-off0[0], wp[axes[1]]-off0[1] ] : null;
        dragTarget = {kind:'movableGrid', plane:h.plane, prevSP:sp, grabLocal};
        e.preventDefault(); return;
      }
      if(h.kind==='lineNumber'){
        // Arraste pelo número: guarda a posição inicial do mouse e uma cópia dos pontos que
        // serão transladados (a linha livre, ou os cantos do retângulo que correspondem a essa
        // mesma linha quando o Modo retângulo está ativo), para aplicar um deslocamento rígido
        // (delta) em applyDrag — nunca uma atribuição direta de ponto, como as demais alças.
        const ref = lineNumberPointRefs(h.axisIdx, h.lineKey);
        h.ref = ref;
        h.startIp = screenToImg(sp);
        h.orig = ref.type==='rect'
          ? ref.keys.map(k=>state.rectCorners[k].slice())
          : [state.axisPoints[ref.axisIdx][ref.lineKey][0].slice(), state.axisPoints[ref.axisIdx][ref.lineKey][1].slice()];
      }
      dragTarget=h; e.preventDefault();
    }
  }
});
window.addEventListener('mousemove', (e)=>{
  const rect = viewport.getBoundingClientRect();
  const sp = [e.clientX-rect.left, e.clientY-rect.top];
  lastMouseSP = sp;
  if(isPanning){
    state.panX = panOrigin[0] + (sp[0]-panStart[0]);
    state.panY = panOrigin[1] + (sp[1]-panStart[1]);
    render(); return;
  }
  if(dragTarget){
    if(dragTarget.kind==='movableGrid'){
      // Arraste de grade: trabalha em espaço de MUNDO (offset dentro do próprio plano), não em
      // espaço de imagem — ver applyGridDrag().
      applyGridDrag(dragTarget, sp);
      markDirty(); render(); return;
    }
    const ip = screenToImg(sp);
    applyDrag(dragTarget, ip);
    markDirty(); render(); return;
  }
  if(state.image){
    const h = hitTestHandles(sp);
    // Rodada 25: com o explicador ligado, o tooltip/seta seguem o candidato sob o mouse em vez do
    // hover normal (cursor 'grab' etc.) — cursor fica 'help' o tempo todo (setExplainerModeActive()).
    if(explainerModeActive){ updateExplainerHover(h); render(); return; }
    const newGridPlane = (h && h.kind==='movableGrid') ? h.plane : null;
    if(h !== hoverTarget || newGridPlane !== hoverGridPlane){
      hoverTarget=h; hoverGridPlane=newGridPlane;
      viewport.style.cursor = h? 'grab':'default';
      render();
    }
  }
});
// Rodada 25: esconde o tooltip do explicador ao sair do canvas (sem isso ele ficava "grudado" na
// última posição, apontando para um elemento que o cursor já não está mais perto).
viewport.addEventListener('mouseleave', ()=>{
  if(explainerModeActive) updateExplainerHover(null);
});
window.addEventListener('mouseup', ()=>{
  isPanning=false;
  // Rodada 15: fecha o "passo de desfazer" do arraste que acabou de terminar (markDirty() só
  // marcou historyPendingCommit=true durante o arraste, para não empilhar 1 snapshot por
  // mousemove — ver o comentário completo em markDirty(), state.js).
  if(historyPendingCommit){ commitUndoSnapshot(); historyPendingCommit=false; }
  dragTarget=null;
});
viewport.addEventListener('contextmenu', (e)=>e.preventDefault());

// Lista de candidatos (com sua distância até sp, em px de tela) dentro do raio de clique —
// compartilhada por hitTestHandles() e pelo ciclo de sobreposição (Ctrl / setas do teclado).
function nearbyCandidates(sp){
  const thresh = state.handleRadius+3;
  const pointCands = buildHandleCandidates()
    .map(c=>{ const sc=imgToScreen(c.pt); return {c, d:Math.hypot(sc[0]-sp[0], sc[1]-sp[1])}; })
    .filter(o=>o.d<=thresh);
  // Candidatos de GRADE (Guia 3D "Pisos móveis") entram na MESMA lista, unificada por distância
  // — assim o ciclo de sobreposição (Ctrl/setas) e o indicador perto do cursor também valem
  // para grades, não só para alças de ponto (pedido explícito do usuário).
  const gridCands = gridCandidatesAt(sp).map(g=>({c:{kind:'movableGrid', plane:g.plane}, d:g.d}));
  return pointCands.concat(gridCands).sort((a,b)=>a.d-b.d);
}
// Avança (direction=1) ou volta (direction=-1) um passo no ciclo de sobreposição na posição
// atual do mouse. Só faz algo (e retorna true) quando há de fato 2+ bolinhas sobrepostas ali —
// chamado tanto ao soltar Ctrl quanto pelas setas do teclado (ver listeners abaixo).
function cycleOverlap(direction){
  if(!state.image || !lastMouseSP) return false;
  const tag = document.activeElement && document.activeElement.tagName;
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return false;
  const nearby = nearbyCandidates(lastMouseSP);
  if(nearby.length<2) return false;
  const key = regionKey(lastMouseSP);
  const sigs = nearby.map(o=>candSig(o.c));
  if(overlapCycle.key===key){
    overlapCycle.order = sigs;
    overlapCycle.idx = (overlapCycle.idx+direction+sigs.length) % sigs.length;
  } else {
    overlapCycle = { key, order: sigs, idx: (direction>0 ? 1 : sigs.length-1) % sigs.length };
  }
  hoverTarget = hitTestHandles(lastMouseSP);
  render();
  return true;
}
// Alternar sobreposições: ao soltar a tecla Control, ou com as setas do teclado (↑/→ avança,
// ↓/← volta), se houver 2+ bolinhas de extremidade exatamente na (ou muito perto da) posição
// atual do mouse, a próxima da "pilha" passa a ser a preferida pelo hitTestHandles() nessa
// região — permitindo clicar em bolinhas que estavam escondidas atrás de outra.
// Rodada 13: a tecla que cicla sobreposições ao ser solta acompanha shortcuts.modifierKey
// (padrão Ctrl, configurável na janela "Atalhos" — ver state.js/ui-controls.js).
window.addEventListener('keyup', (e)=>{ if(e.key===shortcutModifierKeyName()) cycleOverlap(1); });
window.addEventListener('keydown', (e)=>{
  if(e.key==='ArrowUp' || e.key==='ArrowRight'){ if(cycleOverlap(1)) e.preventDefault(); }
  else if(e.key==='ArrowDown' || e.key==='ArrowLeft'){ if(cycleOverlap(-1)) e.preventDefault(); }
});

// Mapeia qual par de pontos deve ser transladado ao arrastar o número "1"/"2" de uma linha:
// em modo livre, são os 2 pontos daquela própria linha (axisPoints[axisIdx][lineKey]); com o
// Modo retângulo ativo, os cantos do retângulo (rectCorners) são compartilhados entre os pares
// 1 e 2 — então a linha "1 l1" corresponde aos cantos TL/TR, "1 l2" a BL/BR, "2 l1" a TL/BL e
// "2 l2" a TR/BR (ver getAxisLinePoints()).
const RECT_EDGE_CORNERS = { '1_l1':['TL','TR'], '1_l2':['BL','BR'], '2_l1':['TL','BL'], '2_l2':['TR','BR'] };
function lineNumberPointRefs(axisIdx, lineKey){
  if(isRectActive()) return { type:'rect', keys: RECT_EDGE_CORNERS[axisIdx+'_'+lineKey] };
  return { type:'axis', axisIdx, lineKey };
}

// Monta a lista de todas as "alças" clicáveis/arrastáveis sobre a imagem: pontas das linhas de
// VP (ou cantos do retângulo, se o Modo retângulo estiver ativo), ponto principal manual, 3ª
// linha auxiliar, origem do gizmo, pontos de distância de referência, e os números "1"/"2" no
// meio de cada linha (usados para transladar a linha inteira).
function buildHandleCandidates(){
  const candidates = [];
  if(isRectActive()){
    Object.keys(state.rectCorners).forEach(key=>{
      candidates.push({kind:'rectCorner', key, pt:state.rectCorners[key]});
    });
  } else {
    for(const axisIdx of [1,2]){
      if(axisIdx===2 && state.vpCount!==2) continue;
      const ap = state.axisPoints[axisIdx];
      ['l1','l2'].forEach(lk=>{
        ap[lk].forEach((pt,ptIdx)=>{
          candidates.push({kind:'axisPoint', axisIdx, lineKey:lk, ptIdx, pt});
        });
      });
      // Alça extra sobre o PRÓPRIO ponto de fuga deste eixo (a interseção do par) — só fora do
      // Modo retângulo (já garantido por estarmos no branch 'else' de isRectActive()) e só
      // quando "Mover" está ligado para este eixo (ver vpMove no state.js).
      if(state.vpMove[axisIdx].enabled){
        const vp = intersectLines(ap.l1, ap.l2);
        if(vp) candidates.push({kind:'vpPoint', axisIdx, pt:vp});
      }
    }
  }
  if(state.ppMode==='manual') candidates.push({kind:'pp', pt:state.principalPointManual});
  if(state.ppMode==='fromThirdVP' && state.vpCount===2){
    const ap3 = state.axisPoints[3];
    ['l1','l2'].forEach(lk=>{ ap3[lk].forEach((pt,ptIdx)=>{ candidates.push({kind:'axisPoint3', lineKey:lk, ptIdx, pt}); }); });
    // Alça extra sobre o PRÓPRIO 3º ponto de fuga (a interseção do par), só quando "Mover" está
    // ligado para o eixo 3 — arrastá-la reposiciona as extremidades não travadas (ver
    // moveAxisVpTo(), chamada por applyDrag abaixo).
    if(state.vpMove[3].enabled){
      const vp3 = intersectLines(ap3.l1, ap3.l2);
      if(vp3) candidates.push({kind:'vpPoint', axisIdx:3, pt:vp3});
    }
    // Alça extra sobre o PONTO PRINCIPAL, quando ele é o ortocentro dos 3 VPs (calculado, não
    // solto) — só quando "Mover ponto médio gerado pelos 3 pontos de fuga" está ligado.
    if(state.movePPFrom3VP && state.calib){
      candidates.push({kind:'ppFrom3VP', pt:state.calib.pp});
    }
  }
  candidates.push({kind:'origin', pt:state.originPoint});
  if(state.refDistMode!=='none'){
    const ray = getAxisRay(state.refDistMode);
    if(ray){
      state.refDistT.forEach((t,idx)=>{
        const pt=[ray.origin[0]+ray.dir[0]*t, ray.origin[1]+ray.dir[1]*t];
        candidates.push({kind:'refPoint', idx, pt});
      });
    }
  }
  const apEff = getAxisLinePoints();
  for(const axisIdx of [1,2]){
    if(axisIdx===2 && state.vpCount!==2) continue;
    const [p1,p2] = apEff[axisIdx].l1;
    candidates.push({kind:'lineNumber', axisIdx, lineKey:'l1', pt:avgPt(p1,p2)});
    const [q1,q2] = apEff[axisIdx].l2;
    candidates.push({kind:'lineNumber', axisIdx, lineKey:'l2', pt:avgPt(q1,q2)});
  }
  return candidates;
}

// Cor associada a um candidato de handle — usada pelo indicador que aparece perto do cursor
// (ver drawHoverIndicator()) para mostrar, com antecedência, a cor da bolinha que seria
// arrastada se o usuário clicasse agora (útil sobretudo ao alternar sobreposições com Ctrl).
function candidateColor(c){
  switch(c.kind){
    case 'axisPoint':
    case 'lineNumber':
      return colorForAxisLetter(axisLetter(c.axisIdx===1 ? state.axis1 : state.axis2));
    case 'vpPoint':
      return c.axisIdx===3 ? colorForAxisLetter(thirdAxisLetter()) : colorForAxisLetter(axisLetter(c.axisIdx===1 ? state.axis1 : state.axis2));
    case 'axisPoint3': return colorForAxisLetter(thirdAxisLetter());
    case 'pp': case 'ppFrom3VP': return '#f1c40f';
    case 'refPoint': return colorForAxisLetter(axisLetter(state.refDistMode));
    default: return '#ffffff'; // origin, rectCorner: sem uma única cor de eixo natural
  }
}
// Pequeno indicador colorido perto do cursor do mouse, mostrando a cor da bolinha que está
// atualmente "na frente" (a que seria pega ao clicar) — só aparece quando há de fato 2+
// bolinhas sobrepostas na posição do mouse (não em todo hover); atualiza sozinho ao alternar
// sobreposições com Ctrl ou com as setas do teclado (ver cycleOverlap() acima).
function drawHoverIndicator(){
  if(!hoverTarget || !lastMouseSP || dragTarget) return;
  if(nearbyCandidates(lastMouseSP).length<2) return;
  const cx = lastMouseSP[0]+15, cy = lastMouseSP[1]+15;
  // Candidato de GRADE: em vez do círculo colorido (que não faz sentido para uma grade, que não
  // tem uma "cor de eixo" única), desenha um pequeno "gradiadinho" com o rótulo do plano
  // (YZ/XZ/XY), indicando que um clique agora pegaria aquela grade, não uma bolinha por baixo.
  if(hoverTarget.kind==='movableGrid'){ drawMiniGridIcon(cx,cy,hoverTarget.plane); return; }
  // Candidato do NÚMERO no meio de uma linha de VP: em vez do círculo colorido simples, mostra o
  // mesmo "selo" (círculo escurecido + número em branco) usado no desenho real desse número —
  // pedido do usuário, para reconhecer de longe que é ESSE elemento (não uma bolinha de ponta).
  if(hoverTarget.kind==='lineNumber'){ drawLineNumberHoverIcon(cx,cy,candidateColor(hoverTarget),String(hoverTarget.axisIdx)); return; }
  const col = candidateColor(hoverTarget);
  // Candidato de PONTO DE FUGA (kind:'vpPoint' — arrastar o eixo 1/2/3 diretamente, "Mover"
  // ligado): o ponto em si é desenhado como um QUADRADO preenchido sobre a imagem (ver
  // drawVpMoveExtras()), não uma bolinha — pedido do usuário para que o indicador de hover perto
  // do cursor use a mesma forma (quadrado preenchido, na cor do eixo), não o círculo genérico.
  if(hoverTarget.kind==='vpPoint'){
    ctx.save();
    ctx.beginPath(); ctx.rect(cx-5,cy-5,10,10);
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth=1.3; ctx.strokeStyle='#000'; ctx.stroke();
    ctx.beginPath(); ctx.rect(cx-5,cy-5,10,10);
    ctx.lineWidth=1; ctx.strokeStyle='#fff'; ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2);
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth=1.3; ctx.strokeStyle='#000'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2);
  ctx.lineWidth=1; ctx.strokeStyle='#fff'; ctx.stroke();
  ctx.restore();
}
// Réplica do "selo" desenhado no meio de cada linha de VP (círculo escurecido + número branco —
// ver drawVpLinePair()), usada como indicador de hover para candidatos kind:'lineNumber' em vez
// do círculo colorido genérico (que não deixava claro que se tratava DESSE elemento específico).
function drawLineNumberHoverIcon(cx,cy,color,labelText){
  ctx.save();
  ctx.beginPath(); ctx.arc(cx,cy,10,0,Math.PI*2);
  ctx.fillStyle='#000'; ctx.globalAlpha=0.55; ctx.fill();
  ctx.globalAlpha=1; ctx.lineWidth=1.3; ctx.strokeStyle=color; ctx.stroke();
  ctx.fillStyle='#fff'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(labelText, cx, cy);
  ctx.restore();
}
function drawMiniGridIcon(cx,cy,plane){
  ctx.save();
  ctx.beginPath(); ctx.arc(cx,cy,11,0,Math.PI*2); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=1;
  for(let i=-1;i<=1;i++){
    ctx.beginPath(); ctx.moveTo(cx-7,cy+i*4); ctx.lineTo(cx+7,cy+i*4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+i*4,cy-7); ctx.lineTo(cx+i*4,cy+7); ctx.stroke();
  }
  ctx.font='bold 8px sans-serif'; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(plane, cx, cy+18);
  ctx.restore();
}

function hitTestHandles(sp){
  if(!state.image) return null;
  const nearby = nearbyCandidates(sp);
  if(nearby.length===0) return null;
  if(nearby.length>1){
    const key = regionKey(sp);
    if(overlapCycle.key===key){
      const sigs = nearby.map(o=>candSig(o.c));
      const wanted = overlapCycle.order[overlapCycle.idx % overlapCycle.order.length];
      const idx = sigs.indexOf(wanted);
      if(idx>=0) return nearby[idx].c;
    }
  }
  return nearby[0].c;
}
function applyDrag(target, ip){
  if(target.kind==='axisPoint'){
    state.axisPoints[target.axisIdx][target.lineKey][target.ptIdx] = ip;
  } else if(target.kind==='rectCorner'){
    state.rectCorners[target.key] = ip;
  } else if(target.kind==='pp'){
    state.principalPointManual = ip;
  } else if(target.kind==='axisPoint3'){
    state.axisPoints[3][target.lineKey][target.ptIdx] = ip;
  } else if(target.kind==='vpPoint'){
    moveAxisVpTo(target.axisIdx, ip);
  } else if(target.kind==='ppFrom3VP'){
    movePPFrom3VPBy(ip);
  } else if(target.kind==='origin'){
    state.originPoint = ip;
  } else if(target.kind==='refPoint'){
    const ray = getAxisRay(state.refDistMode);
    if(ray){
      const dx=ip[0]-ray.origin[0], dy=ip[1]-ray.origin[1];
      let t = dx*ray.dir[0] + dy*ray.dir[1]; // projeção escalar sobre o raio do eixo
      t = Math.max(4, t);
      state.refDistT[target.idx] = t;
    }
  } else if(target.kind==='lineNumber'){
    // Translação rígida: desloca os 2 pontos guardados em target.orig pela mesma diferença
    // entre a posição atual do mouse (ip) e a posição inicial do clique (target.startIp) —
    // preserva o comprimento e a orientação da linha (ou do lado do retângulo).
    const dx = ip[0]-target.startIp[0], dy = ip[1]-target.startIp[1];
    if(target.ref.type==='rect'){
      target.ref.keys.forEach((k,i)=>{
        state.rectCorners[k] = [target.orig[i][0]+dx, target.orig[i][1]+dy];
      });
    } else {
      const {axisIdx, lineKey} = target.ref;
      state.axisPoints[axisIdx][lineKey][0] = [target.orig[0][0]+dx, target.orig[0][1]+dy];
      state.axisPoints[axisIdx][lineKey][1] = [target.orig[1][0]+dx, target.orig[1][1]+dy];
    }
  }
}

/* --------------------- Mover/travar o ponto de fuga (qualquer eixo) ------------------------- */
// Projeção ortogonal do ponto p sobre a reta que passa por a,b.
function projectPointOnLine(p,a,b){
  const dx=b[0]-a[0], dy=b[1]-a[1];
  const lenSq=dx*dx+dy*dy; if(lenSq<1e-9) return a.slice();
  const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/lenSq;
  return [a[0]+dx*t, a[1]+dy*t];
}
// Recalcula a extremidade LIVRE de uma linha (índice freeIdx = 1-lockedIdx) para que a reta
// L(=line[lockedIdx])–F' passe pelo alvo `target`, preservando a mesma RAZÃO COLINEAR que o vp
// ANTIGO tinha em relação a L e à extremidade livre original — em vez de simplesmente recolocar
// F' a uma distância fixa na direção do alvo (o que podia fazer a extremidade "saltar" para o
// lado oposto quando o alvo ficava mais perto do ponto travado do que a extremidade original
// estava — bug relatado pelo usuário). Concretamente: como L, F(original) e oldVp são colineares
// por construção (oldVp = interseção com a OUTRA linha, que está sobre esta reta), existe um
// escalar s tal que oldVp = L + s*(F-L); a nova extremidade fica F' = L + (target-L)/s — mantém
// F' exatamente do mesmo "lado" e na mesma proporção relativa que F tinha, qualquer que seja o
// deslocamento do alvo.
// Rodada 16: novo parâmetro `distMode` — 'proportional' (padrão, comportamento original acima)
// ou 'preserveLength' (pedido do usuário: "um outro estado que preserva a distância relativa
// entre as extremidades dos dois pontos de uma mesma linha"). Em 'preserveLength', a extremidade
// livre F' fica sempre à MESMA distância de L que F estava originalmente — a linha só GIRA em
// torno do pivô L para continuar passando por `target`, nunca estica/encolhe. Alternado pelo
// novo botão auxiliar 📏 (colado à esquerda de "Mover" em cada eixo — ver ui-controls.js).
function pivotEndpoint(line, lockedIdx, oldVp, target, distMode){
  const freeIdx = 1-lockedIdx;
  const L = line[lockedIdx], F = line[freeIdx];
  if(distMode==='preserveLength'){
    const dTL = [target[0]-L[0], target[1]-L[1]];
    const dist = Math.hypot(dTL[0], dTL[1]);
    const origLen = Math.hypot(F[0]-L[0], F[1]-L[1]);
    if(dist<1e-9) return F.slice(); // alvo caiu sobre o pivô: direção indefinida, mantém F onde estava
    const ux = dTL[0]/dist, uy = dTL[1]/dist;
    return [ L[0]+ux*origLen, L[1]+uy*origLen ];
  }
  const dLF = [F[0]-L[0], F[1]-L[1]];
  const lenSq = dLF[0]*dLF[0]+dLF[1]*dLF[1];
  let sVal = 1;
  if(lenSq>1e-9) sVal = ((oldVp[0]-L[0])*dLF[0] + (oldVp[1]-L[1])*dLF[1]) / lenSq;
  if(Math.abs(sVal)<1e-6) sVal = sVal<0 ? -1e-6 : 1e-6; // evita divisão por ~0 (linha degenerada)
  return [ L[0]+(target[0]-L[0])/sVal, L[1]+(target[1]-L[1])/sVal ];
}
// Ajusta uma linha (2 extremidades) para que passe pelo alvo `target`, dado seu travamento
// (lockArr=[bool,bool]) e o modo ('translate'|'anchor') — usado por moveAxisVpTo() para cada uma
// das 2 linhas do eixo. O travamento EXPLÍCITO (1 extremidade travada) manda sempre, em QUALQUER
// modo, já que ele dita um pivô obrigatório; o modo só decide o que fazer quando NENHUMA
// extremidade dessa linha está travada:
// - 'translate': translação rígida (preserva comprimento e direção — comportamento original).
// - 'anchor': a extremidade mais AFASTADA do vp ANTIGO vira o pivô automático (fica com a
//   tendência de permanecer onde estava); só a mais PRÓXIMA se move, girando em torno dela.
function adjustAxisLine(line, lockArr, oldVp, target, mode, distMode){
  if(lockArr[0] && lockArr[1]) return line; // as 2 travadas: não muda
  if(lockArr[0] || lockArr[1]){
    const lockedIdx = lockArr[0] ? 0 : 1;
    const newLine = line.slice();
    newLine[1-lockedIdx] = pivotEndpoint(line, lockedIdx, oldVp, target, distMode);
    return newLine;
  }
  if(mode==='anchor'){
    const d0 = Math.hypot(line[0][0]-oldVp[0], line[0][1]-oldVp[1]);
    const d1 = Math.hypot(line[1][0]-oldVp[0], line[1][1]-oldVp[1]);
    const anchorIdx = d0>=d1 ? 0 : 1; // mais afastado do vp antigo = pivô/ancorado
    const newLine = line.slice();
    newLine[1-anchorIdx] = pivotEndpoint(line, anchorIdx, oldVp, target, distMode);
    return newLine;
  }
  // 'translate' (padrão): translação rígida das 2 extremidades — já preserva o comprimento por
  // conta própria, então `distMode` não se aplica aqui (nada muda entre os 2 estados).
  const dx=target[0]-oldVp[0], dy=target[1]-oldVp[1];
  return [[line[0][0]+dx,line[0][1]+dy],[line[1][0]+dx,line[1][1]+dy]];
}
// Grava de volta as 2 extremidades ajustadas de uma linha do eixo `axisIdx` (1, 2 ou 3). Só é
// chamada para os eixos 1/2 quando o Modo retângulo está DESLIGADO (a feature de mover/travar
// fica oculta na UI com o Modo retângulo ligado — ver comentário em state.vpMove), então sempre
// grava direto em state.axisPoints — nunca precisa lidar com rectCorners aqui.
function writeAxisLine(axisIdx, lineKey, newLine){ state.axisPoints[axisIdx][lineKey] = newLine; }
// Reposiciona as extremidades NÃO travadas do par de linhas do eixo `axisIdx` para que a
// interseção das 2 (o ponto de fuga) siga o alvo `desired` (posição do mouse, em coords de
// imagem), respeitando state.vpMove[axisIdx].lock e .mode (ver adjustAxisLine()). Com as 4
// extremidades travadas, o ponto fica geometricamente imóvel — mostra um aviso (a menos que
// opts.silent) e retorna false; retorna true se algo de fato pôde se mover.
function moveAxisVpTo(axisIdx, desired, opts){
  opts = opts || {};
  const ap = state.axisPoints[axisIdx];
  const vm = state.vpMove[axisIdx];
  const lock = vm.lock, mode = vm.mode;
  const oldVp = intersectLines(ap.l1, ap.l2);
  if(!oldVp) return false;
  const l1Locked = lock.l1[0] && lock.l1[1];
  const l2Locked = lock.l2[0] && lock.l2[1];
  if(l1Locked && l2Locked){ if(!opts.silent) showVpLockToast(); return false; }
  let target = desired;
  if(l1Locked) target = projectPointOnLine(desired, ap.l1[0], ap.l1[1]);
  else if(l2Locked) target = projectPointOnLine(desired, ap.l2[0], ap.l2[1]);
  const distMode = vm.distMode || 'proportional';
  // Rodada 17: se este arraste é um 'vpPoint' deste MESMO eixo com âncora congelada (ver
  // mousedown de 'vpPoint' acima — dragTarget.anchorFreeze, só definido quando mode='anchor' e
  // distMode='preserveLength'), a extremidade congelada passa a ser tratada como TRAVADA para
  // efeito de adjustAxisLine() — nunca mais recalculada por distância a cada quadro.
  const freeze = (dragTarget && dragTarget.kind==='vpPoint' && dragTarget.axisIdx===axisIdx) ? dragTarget.anchorFreeze : null;
  const effLock1 = freeze ? [ lock.l1[0]||freeze.l1===0, lock.l1[1]||freeze.l1===1 ] : lock.l1;
  const effLock2 = freeze ? [ lock.l2[0]||freeze.l2===0, lock.l2[1]||freeze.l2===1 ] : lock.l2;
  writeAxisLine(axisIdx, 'l1', adjustAxisLine(ap.l1, effLock1, oldVp, target, mode, distMode));
  writeAxisLine(axisIdx, 'l2', adjustAxisLine(ap.l2, effLock2, oldVp, target, mode, distMode));
  return true;
}
// Move "o ponto médio gerado pelos 3 pontos de fuga" (o ortocentro de vp1/vp2/vp3, quando
// ppMode='fromThirdVP') — arrastá-lo tenta transladar os 3 VPs pelo MESMO delta (desired - pp
// atual), cada um dentro das limitações do seu próprio vpMove[eixo] (ver moveAxisVpTo()). Se
// NENHUM dos 3 puder se mover (todos com as 4 extremidades travadas), mostra 1 único aviso
// combinado em vez de repeti-lo 3 vezes.
// Um eixo está "totalmente travado" quando as 4 extremidades do seu par de linhas estão
// travadas — nesse caso o vp desse eixo é geometricamente fixo (não se move de jeito nenhum).
function isAxisFullyLocked(axisIdx){
  const lk = state.vpMove[axisIdx].lock;
  return lk.l1[0] && lk.l1[1] && lk.l2[0] && lk.l2[1];
}
function movePPFrom3VPBy(desired){
  // Rodada 14: NÃO depende de state.calib (pode estar null em configurações momentaneamente
  // inválidas durante o arraste) — o ortocentro dos 3 VPs é recalculado direto das linhas atuais
  // via computePrincipalPoint() (calibration.js), que só falha se um dos 3 pares de linha ficar
  // paralelo (vp indefinido).
  const apEff = getAxisLinePoints();
  const vp1 = intersectLines(apEff[1].l1, apEff[1].l2);
  const vp2 = state.vpCount===2 ? intersectLines(apEff[2].l1, apEff[2].l2) : null;
  if(!vp1 || !vp2) return;
  const vp3 = intersectLines(state.axisPoints[3].l1, state.axisPoints[3].l2);

  // Rodada 17: CORREÇÃO DE BUG — caso bem-posto (2 dos 3 vp's totalmente travados, só 1 livre):
  // resolve a posição do vp LIVRE por FÓRMULA FECHADA (solveThirdVertexFromOrthocenter(),
  // calibration.js) em vez do "aplicar delta e deixar convergir sozinho quadro a quadro" abaixo —
  // esse método antigo era uma iteração de ponto fixo NÃO-linear (o ortocentro depende de forma
  // não-linear do 3º vértice) sem garantia de convergência, e podia fazer o vp livre "disparar"
  // para longe e nunca mais voltar (bug relatado pelo usuário: travar os eixos X e Z e arrastar
  // "o ponto médio gerado pelos 3 pontos de fuga" — reproduzido com o arquivo de projeto que ele
  // enviou). Com exatamente 1 vp livre a solução é única e direta, sem iteração possível de
  // divergir.
  const locked1 = isAxisFullyLocked(1), locked2 = isAxisFullyLocked(2), locked3 = isAxisFullyLocked(3);
  const lockedCount = [locked1,locked2,locked3].filter(Boolean).length;
  if(lockedCount===2 && vp1 && vp2 && vp3){
    let A,B,freeIdx;
    if(!locked1){ A=vp2; B=vp3; freeIdx=1; }
    else if(!locked2){ A=vp1; B=vp3; freeIdx=2; }
    else { A=vp1; B=vp2; freeIdx=3; }
    const targetC = solveThirdVertexFromOrthocenter(A, B, desired);
    if(targetC){
      if(!moveAxisVpTo(freeIdx, targetC, {silent:true})) showVpLockToast();
      return;
    }
    // Interseção falhou (configuração degenerada, ex.: A/B/H colineares) — cai no método antigo
    // abaixo como último recurso.
  }

  // Método antigo (delta aplicado a todos os eixos não totalmente travados) — mantido como
  // fallback para quando 0, 1 ou os 3 eixos estão totalmente travados (casos em que a posição do
  // vp livre não é unicamente determinada só pelo ortocentro desejado, então não há fórmula
  // fechada única a aplicar).
  const oldPP = computePrincipalPoint(vp1, vp2);
  const delta = [desired[0]-oldPP[0], desired[1]-oldPP[1]];
  let anyMoved=false;
  [1,2,3].forEach(axisIdx=>{
    const ap = state.axisPoints[axisIdx];
    const oldVp = intersectLines(ap.l1, ap.l2);
    if(!oldVp) return;
    const target=[oldVp[0]+delta[0], oldVp[1]+delta[1]];
    if(moveAxisVpTo(axisIdx, target, {silent:true})) anyMoved=true;
  });
  if(!anyMoved) showVpLockToast();
}
let vpLockToastTimer=null;
function showVpLockToast(){
  const el = document.getElementById('vp3LockToast'); if(!el) return;
  el.textContent = 'As 4 extremidades do par de linhas desse eixo estão travadas — destrave pelo menos uma para poder mover o ponto de fuga.';
  el.classList.remove('hidden');
  clearTimeout(vpLockToastTimer);
  vpLockToastTimer = setTimeout(()=>el.classList.add('hidden'), 3200);
}
// Rodada 17: pedido do usuário — pousar o mouse sobre o aviso (ou clicar nele) zera o contador
// de desaparecimento; ele só volta a contar (do zero) quando o cursor sai da área da caixa.
(function setupVpLockToastPause(){
  const el = document.getElementById('vp3LockToast'); if(!el) return;
  el.addEventListener('mouseenter', ()=>{ clearTimeout(vpLockToastTimer); });
  el.addEventListener('click', ()=>{ clearTimeout(vpLockToastTimer); });
  el.addEventListener('mouseleave', ()=>{
    clearTimeout(vpLockToastTimer);
    vpLockToastTimer = setTimeout(()=>el.classList.add('hidden'), 3200);
  });
})();

/* ------------------------- "Trazer para perto" (rodada 14) --------------------------- */
// Botão do painel esquerdo (#bringCloseBtn, ui-controls.js): as linhas de ponto de fuga
// convergem tanto mais quanto mais "correta"/próxima do infinito a perspectiva for — é comum
// (usuário reportou que "ocorre bastante") as extremidades acabarem MUITO longe do centro da
// imagem em coordenadas de imagem, ficando fora da área visível do viewport atual e difíceis de
// alcançar para arrastar. Este botão traz de volta para dentro da área visível, na posição atual
// de zoom/pan, QUALQUER ponto de controle (extremidades de linha, cantos do retângulo, ponto
// principal manual, origem do gizmo) que esteja fora da tela — sem mexer nos que já estão
// visíveis. É um reposicionamento DIRETO do ponto (igual a arrastá-lo manualmente com o mouse:
// muda a linha/VP correspondente, do mesmo jeito que qualquer arraste normal já faz), não uma
// operação que preserva a direção da linha — não haveria como preservar a direção de 2 linhas
// diferentes que compartilham o mesmo canto no Modo retângulo, então, por consistência, o mesmo
// vale para os pontos "soltos" (fora do Modo retângulo).
function bringFarPointsClose(){
  if(!state.image) return false;
  const r = getVisibleImageRect();
  const w = r.maxX-r.minX, h = r.maxY-r.minY;
  const mx = w*0.08, my = h*0.08; // margem de ~8% para não colar os pontos na borda da tela
  const inset = { minX:r.minX+mx, maxX:r.maxX-mx, minY:r.minY+my, maxY:r.maxY-my };
  let moved = false;
  // Clamp simples e independente (usado para pontos "soltos", sem linha a preservar: ponto
  // principal manual, origem, e — no modo retângulo — os cantos compartilhados, ver nota abaixo).
  function bring(p){
    const outside = p[0]<r.minX || p[0]>r.maxX || p[1]<r.minY || p[1]>r.maxY;
    if(!outside) return p;
    moved = true;
    return [ Math.min(Math.max(p[0], inset.minX), inset.maxX), Math.min(Math.max(p[1], inset.minY), inset.maxY) ];
  }
  // Retorna o intervalo [tmin,tmax] (parâmetro t de origin+t*dir, dir unitário) em que a reta
  // infinita que passa por origin/dir cruza rect, ou null se a reta não cruza rect.
  function clipLineTRange(origin, dir, rect){
    let tmin = -Infinity, tmax = Infinity;
    if(Math.abs(dir[0]) < 1e-9){
      if(origin[0] < rect.minX || origin[0] > rect.maxX) return null;
    } else {
      let t1 = (rect.minX-origin[0])/dir[0], t2 = (rect.maxX-origin[0])/dir[0];
      if(t1>t2){ const tmp=t1; t1=t2; t2=tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    }
    if(Math.abs(dir[1]) < 1e-9){
      if(origin[1] < rect.minY || origin[1] > rect.maxY) return null;
    } else {
      let t1 = (rect.minY-origin[1])/dir[1], t2 = (rect.maxY-origin[1])/dir[1];
      if(t1>t2){ const tmp=t1; t1=t2; t2=tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    }
    if(tmin > tmax) return null;
    return {tmin, tmax};
  }
  // Traz um par de pontos [p1,p2] (as 2 extremidades de UMA linha de eixo) para dentro de "inset",
  // deslizando cada extremidade que estiver fora AO LONGO da própria reta que ela define — ou
  // seja, a reta mantém sua orientação/inclinação, só a posição da extremidade nela muda.
  // Pedido do usuário (Rodada 15): "ele deve só deslocar as extremidades das linhas dos pares dos
  // eixos de fuga seguindo as linhas já postas... as linhas permanecem com a sua orientação e
  // inclinação, e os pontos é que são deslocados através delas."
  function bringLinePair(pair){
    const p1 = pair[0], p2 = pair[1];
    const dx = p2[0]-p1[0], dy = p2[1]-p1[1];
    const len = Math.hypot(dx,dy);
    if(len < 1e-6){
      // Extremidades coincidentes: não há direção definida, cai no clamp simples.
      pair[0] = bring(p1); pair[1] = bring(p2);
      return;
    }
    const dir = [dx/len, dy/len];
    const origin = p1.slice();
    const range = clipLineTRange(origin, dir, inset);
    for(let i=0;i<2;i++){
      const p = pair[i];
      const outside = p[0]<r.minX || p[0]>r.maxX || p[1]<r.minY || p[1]>r.maxY;
      if(!outside) continue;
      moved = true;
      if(range){
        const t = (p[0]-origin[0])*dir[0] + (p[1]-origin[1])*dir[1];
        const tc = Math.min(Math.max(t, range.tmin), range.tmax);
        pair[i] = [ origin[0]+tc*dir[0], origin[1]+tc*dir[1] ];
      } else {
        // A reta não cruza a área visível com a margem — não há como preservar a inclinação e
        // trazer o ponto para dentro; recorre ao clamp simples como último recurso.
        pair[i] = bring(p);
      }
    }
  }
  function bringAxis(axisIdx){
    const ap = state.axisPoints[axisIdx];
    bringLinePair(ap.l1);
    bringLinePair(ap.l2);
  }
  if(isRectActive()){
    // No modo retângulo os 4 cantos (rectCorners) são compartilhados entre 2 linhas cada (ex.:
    // TL pertence à linha TL-TR do eixo 1 E à linha TL-BL do eixo 2). Preservar a inclinação das
    // DUAS linhas ao mesmo tempo é matematicamente impossível para um ponto compartilhado (2
    // retas não-paralelas só se cruzam em 1 ponto — o próprio canto original); então aqui se
    // mantém o clamp simples e independente por canto, como antes.
    ['TL','TR','BL','BR'].forEach(k=>{ state.rectCorners[k] = bring(state.rectCorners[k]); });
  } else {
    bringAxis(1);
    if(state.vpCount===2) bringAxis(2);
  }
  if(state.ppMode==='fromThirdVP' && state.vpCount===2) bringAxis(3);
  if(state.ppMode==='manual') state.principalPointManual = bring(state.principalPointManual);
  state.originPoint = bring(state.originPoint);
  if(moved){ markDirty(); render(); }
  return moved;
}
// Desenha os destaques de um eixo (1, 2 ou 3): um anel dourado nas extremidades TRAVADAS (sempre
// visível), um anel tracejado sutil em TODAS as 4 extremidades enquanto o "botão de travar" está
// ativo PARA ESTE EIXO (indicando que estão clicáveis para travar/destravar), e a própria alça do
// ponto de fuga (um quadrado) quando "Mover" está ligado para este eixo.
function drawVpMoveExtras(axisIdx){
  if(axisIdx===3){ if(state.ppMode!=='fromThirdVP' || state.vpCount!==2) return; }
  else { if(isRectActive()) return; if(axisIdx===2 && state.vpCount!==2) return; }
  const ap = state.axisPoints[axisIdx];
  const col = axisIdx===3 ? colorForAxisLetter(thirdAxisLetter()) : colorForAxisLetter(axisLetter(axisIdx===1?state.axis1:state.axis2));
  const vm = state.vpMove[axisIdx];
  ['l1','l2'].forEach(lk=>{
    ap[lk].forEach((pt,ptIdx)=>{
      const locked = vm.lock[lk][ptIdx];
      if(!locked && !vpLockToolActive[axisIdx]) return;
      const sp = s(pt);
      ctx.save();
      ctx.beginPath(); ctx.arc(sp[0],sp[1], state.handleRadius+5, 0, Math.PI*2);
      if(locked){ ctx.strokeStyle='#ffcc33'; ctx.lineWidth=2.4; ctx.setLineDash([]); }
      else { ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1.4; ctx.setLineDash([3,3]); }
      ctx.stroke();
      ctx.restore();
    });
  });
  if(vm.enabled){
    const vp = intersectLines(ap.l1, ap.l2);
    if(vp){
      const sp = s(vp), r = state.handleRadius+4;
      ctx.save();
      ctx.beginPath(); ctx.rect(sp[0]-r, sp[1]-r, r*2, r*2);
      ctx.fillStyle = col; ctx.globalAlpha=0.85; ctx.fill();
      ctx.globalAlpha=1; ctx.lineWidth=1.5; ctx.strokeStyle='#fff'; ctx.stroke();
      ctx.restore();
      if(hoverTarget && hoverTarget.kind==='vpPoint' && hoverTarget.axisIdx===axisIdx){
        ctx.beginPath(); ctx.rect(sp[0]-r-3, sp[1]-r-3, (r+3)*2, (r+3)*2);
        ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
      }
    }
  }
}
// "Ponto principal: Manual" + opção ligada: desenha o par de linhas do 3º eixo de fuga como linhas
// INFINITAS (recortadas na borda visível da tela dos DOIS lados), na cor do eixo do mundo
// atribuído a ele — só decorativo/visual, não interfere na calibração nem fica arrastável neste
// modo (mesmo comportamento de antes).
//
// Rodada 24 (2026-09-09): BUG CORRIGIDO — pedido do usuário: com "Ponto principal: Manual" e esta
// opção ligadas, ao arrastar o ponto principal manualmente, o cubo da "Guia 3D: Caixa" já mudava
// de forma corretamente (ele usa state.calib, recalculado em TODO render() a partir do ponto
// principal atual — ver computeCalibration()), mas este par de linhas ficava PARADO, sempre nas
// mesmas posições. Causa: a versão anterior desenhava as linhas usando os 2 pontos BRUTOS
// armazenados em state.axisPoints[3].l1/l2 (o par de controle usado só quando
// ppMode==='fromThirdVP' — ver comentário em project-io.js/serializeProject()) — em modo 'manual'
// esses pontos não têm relação nenhuma com o ponto principal, então a linha nunca se movia.
// Corrigido calculando o vanishing point REAL do 3º eixo do mundo (thirdAxisLetter()) a partir da
// calibração atual (state.calib.axisVec[letra], direção em espaço de câmera já calculada por
// computeCalibration() a partir do ponto principal manual — MESMA fonte que já movia o cubo
// corretamente) — mesma fórmula de projeção usada em projectWorldPoint(), só que aplicada
// diretamente à DIREÇÃO do eixo (o "ponto no infinito"), não a um ponto finito do mundo. Cada uma
// das 2 semirretas passa por essa vp3 (que agora acompanha o ponto principal) e por um ponto de
// ANCORAGEM fixo — reaproveita ap3.l1[0]/ap3.l2[0] (os mesmos 2 pontos de antes) só como "de onde
// a linha parte visualmente", sem influenciar mais a DIREÇÃO dela.
function drawManualPPThirdAxisLines(){
  // Rodada 30 (2026-09-09): pedido do usuário — REMOVIDO o checkbox de mestre
  // (state.manualPPShowThirdAxisLines): agora, em modo Manual, o par do 3º eixo é SEMPRE
  // calculado; axisLineExtension[3] abaixo decide se algo chega a ser desenhado.
  if(state.ppMode!=='manual') return;
  const c = state.calib;
  if(!c || !c.axisVec) return;
  const letter3 = thirdAxisLetter();
  let dirCam = c.axisVec[letter3];
  if(!dirCam) return;
  // O ponto de fuga de uma RETA é o mesmo não importa qual dos 2 sentidos do eixo se usa (a
  // projeção de d e de -d cai no mesmo pixel) — escolhe o sinal com z<0 só para reaproveitar a
  // mesma checagem de "atrás da câmera"/quase-paralelo-ao-plano-da-imagem de projectWorldPoint().
  if(dirCam[2] > 0) dirCam = V3.neg(dirCam);
  if(dirCam[2] >= -1e-6) return; // eixo quase paralelo ao plano da imagem: sem vp finito para desenhar
  const vp3 = [c.pp[0] + c.f*dirCam[0]/(-dirCam[2]), c.pp[1] + c.f*dirCam[1]/(-dirCam[2])];

  // Rodada 25 (2026-09-09): BUG CORRIGIDO — pedido do usuário: estas 2 semirretas estavam sendo
  // desenhadas como linhas INFINITAS nos 2 sentidos (recortadas na borda da tela dos dois lados),
  // diferente do padrão usado pelos outros 2 pares de eixo de fuga (drawVpLinePair()/
  // computeLineExtension(): segmento real + prolongamento fino num ÚNICO sentido). Tentativa
  // inicial: linha do `anchor` até `vp3` prolongado até a borda da tela — CORRIGIDO DE NOVO na
  // rodada 26, pois o usuário esclareceu que não é bem esse o comportamento pedido.
  // Rodada 26 (2026-09-09): AJUSTE — a linha infinita deve partir do PRÓPRIO ponto de fuga (vp3,
  // onde o par de linhas se cruza), não do `anchor` — nada desenhado entre `anchor` e `vp3`, só o
  // prolongamento de vp3 até a borda da tela, num único sentido (o que se afasta do `anchor`).
  // Rodada 27 (2026-09-09): AJUSTE DE SENTIDO — pedido do usuário: "as linhas devem ser infinitas
  // para o outro lado". A rodada 26 prolongava vp3 para o lado que se AFASTA do `anchor`; o correto
  // é prolongar para o lado que passa PELO `anchor` (e segue além dele) — ou seja, o mesmo sentido
  // em que o `anchor` já fica, a partir de vp3. Só o sinal de `dirN` usado no prolongamento mudou
  // (de +dirN para -dirN); o resto da lógica (vp3 como ponto de partida, sem trecho desenhado antes
  // dele) continua igual à rodada 26.
  // Rodada 30 (2026-09-09): pedido do usuário — REMOVIDOS o checkbox "Mostrar linhas do 3º eixo de
  // fuga" e a subopção "Prolongamento infinito" (state.manualPPShowThirdAxisLines/
  // manualPPThirdAxisLinesInfinite). No lugar, "mantenha ativos os botões... que já cumprem esse
  // papel": os MESMOS axisLineExtension[3]/axisLineInfiniteExtension[3] usados por drawVpLinePair()
  // em "A partir do 3º ponto de fuga" (rodadas 28/29). axisLineExtension[3] (ligado por padrão)
  // passa a ser o próprio mestre — desligado, nada é desenhado para essa linha; ligado, desenha de
  // vp3 até a extremidade do par MAIS DISTANTE dele (a mesma extremidade que fica visível quando
  // Ponto Principal = "A partir do 3º ponto de fuga", já que ali as 2 semirretas usam justamente
  // ap3.l1/ap3.l2 inteiros). axisLineInfiniteExtension[3] (desligado por padrão) prolonga esse
  // trecho até a borda da tela, no sentido que passa por essa extremidade mais distante.
  if(state.axisLineExtension[3]===false) return;
  const ap3 = state.axisPoints[3];
  const col = colorForAxisLetter(letter3);
  const visRect = getVisibleImageRect();
  const infinite = state.axisLineInfiniteExtension && state.axisLineInfiniteExtension[3]===true;
  [ap3.l1, ap3.l2].forEach(([p0,p1])=>{
    const d0 = Math.hypot(p0[0]-vp3[0], p0[1]-vp3[1]);
    const d1 = Math.hypot(p1[0]-vp3[0], p1[1]-vp3[1]);
    const farPt = d0>=d1 ? p0 : p1; // extremidade do par mais distante de vp3
    const d=[farPt[0]-vp3[0],farPt[1]-vp3[1]]; const len=Math.hypot(d[0],d[1]); if(len<1e-6) return;
    const dirN=[d[0]/len,d[1]/len]; // aponta de vp3 para farPt
    const a = vp3;
    let b;
    if(infinite){
      const distFwd = rayExitDistance(vp3, dirN, visRect); // sentido que passa por farPt, até a borda
      b = [vp3[0]+dirN[0]*distFwd, vp3[1]+dirN[1]*distFwd];
    } else {
      b = farPt; // pára na própria extremidade mais distante
    }
    const sa=s(a), sb=s(b);
    ctx.save();
    ctx.strokeStyle=col; ctx.lineWidth=1; ctx.globalAlpha=0.7; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(sa[0],sa[1]); ctx.lineTo(sb[0],sb[1]); ctx.stroke();
    ctx.restore();
  });
}

/* ------------------------------ Linhas diagonais -------------------------------- */
// Duas linhas finas canto-a-canto sobre a imagem inteira: TL->BR e TR->BL. O cruzamento das duas
// cai exatamente no ponto médio da imagem (é uma propriedade geométrica automática das diagonais
// de um retângulo — não precisa de nenhum cálculo extra). Puramente visual/auxiliar; cor
// escolhida em state.diagonals.color (painel esquerdo, padrão branco).
function drawDiagonals(){
  if(!state.diagonals.enabled) return;
  const w=state.imageW, h=state.imageH;
  const tl=s([0,0]), tr=s([w,0]), bl=s([0,h]), br=s([w,h]);
  ctx.save();
  ctx.strokeStyle = state.diagonals.color; ctx.lineWidth=1; ctx.globalAlpha=0.85; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(tl[0],tl[1]); ctx.lineTo(br[0],br[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tr[0],tr[1]); ctx.lineTo(bl[0],bl[1]); ctx.stroke();
  ctx.restore();
}

/* ================================ Render ==================================== */
function render(){
  const rect = viewportWrap.getBoundingClientRect();
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  ctx.clearRect(0,0,rect.width,rect.height);
  if(!state.image){ computeCalibration(); updateReadouts(); return; }

  ctx.save();
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);
  ctx.drawImage(state.image,0,0);
  if(state.darkenImage){ ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,state.imageW,state.imageH); }
  ctx.restore();

  computeCalibration();

  drawDiagonals();
  drawAxisLines();
  drawManualPPThirdAxisLines();
  drawVpMoveExtras(1); drawVpMoveExtras(2); drawVpMoveExtras(3);
  drawAxisGizmo();
  drawPrincipalPoint();
  draw3DGuide();
  drawHoverIndicator();
  drawExplainerHoverArrow(); // rodada 25: seta do "explicador visual", por cima de tudo o mais

  updateReadouts();
}

function s(p){ return imgToScreen(p); }
function invZoom(){ return 1/state.zoom; }

// Desenha um par de linhas de ponto de fuga completo (prolongamento fino, linha sólida com a
// espessura configurada, número/letra no meio e bolinhas de extremidade) — usado tanto para os
// pares '1'/'2' (calibração principal) quanto para o par auxiliar '3' (usado só para achar o
// ponto principal a partir do 3º ponto de fuga): agora os dois casos são desenhados exatamente
// da mesma forma, cada um na cor do eixo do mundo a que se refere.
// Rodada 28 (2026-09-09): novo parâmetro `axisIdx` (opcional) — quando informado, o segmento fino
// de prolongamento (a parte que vai até o vp/borda da tela) só é desenhado se
// state.axisLineExtension[axisIdx] estiver ligado (padrão: ligado, nos 3 eixos — ver state.js e os
// novos botões .axisExtBtn em ui-controls.js/index.html). Sem axisIdx, mantém o comportamento
// anterior (sempre desenha), para não quebrar chamadas antigas.
function drawVpLinePair(ap, col, labelText, visRect, axisIdx){
  // Ponto de fuga do par (interseção das 2 linhas) — usado para prolongar cada linha na
  // direção em que elas realmente convergem (ver computeLineExtension).
  const vp = intersectLines(ap.l1, ap.l2);
  const extOn = axisIdx===undefined || state.axisLineExtension[axisIdx] !== false;
  // Rodada 29 (2026-09-09): pedido do usuário — SEGUNDO prolongamento, agora a partir da
  // extremidade mais DISTANTE do vp, até a borda da tela (em vez de parar nela); desligado por
  // padrão (axisLineInfiniteExtension[axisIdx], ver state.js) — novo botão .axisInfBtn por eixo.
  const infOn = axisIdx!==undefined && state.axisLineInfiniteExtension && state.axisLineInfiniteExtension[axisIdx]===true;
  ['l1','l2'].forEach(lk=>{
    const [p1,p2] = ap[lk];
    // Prolongamento fino da linha, na direção do ponto de fuga: termina no próprio vp se ele
    // estiver visível na tela, ou na borda visível da tela caso contrário — igual ao
    // comportamento do fSpy original.
    const ext = extOn ? computeLineExtension(p1, p2, vp, visRect) : null;
    if(ext){
      const se1=s(ext[0]), se2=s(ext[1]);
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha = 0.7; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(se1[0],se1[1]); ctx.lineTo(se2[0],se2[1]); ctx.stroke();
      ctx.restore();
    }
    // Rodada 29: prolongamento infinito, do lado oposto (extremidade mais distante do vp) até a
    // borda visível da tela — mesmo estilo visual do prolongamento de cima.
    const extFar = infOn ? computeFarPointExtension(p1, p2, vp, visRect) : null;
    if(extFar){
      const sf1=s(extFar[0]), sf2=s(extFar[1]);
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha = 0.7; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(sf1[0],sf1[1]); ctx.lineTo(sf2[0],sf2[1]); ctx.stroke();
      ctx.restore();
    }
    const sp1=s(p1), sp2=s(p2);
    ctx.strokeStyle = col; ctx.lineWidth=state.lineThickness;
    ctx.beginPath(); ctx.moveTo(sp1[0],sp1[1]); ctx.lineTo(sp2[0],sp2[1]); ctx.stroke();
    // número/letra no meio (clicável/arrastável para os pares 1/2 — ver kind:'lineNumber')
    const mid=[(sp1[0]+sp2[0])/2,(sp1[1]+sp2[1])/2];
    ctx.fillStyle=col; ctx.font='bold 13px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.save(); ctx.fillStyle='#000'; ctx.globalAlpha=0.55;
    ctx.beginPath(); ctx.arc(mid[0],mid[1],10,0,Math.PI*2); ctx.fill(); ctx.restore();
    ctx.fillStyle='#fff'; ctx.fillText(labelText, mid[0], mid[1]);
    // pontas — raio configurável em "Tamanho das bolinhas" (0 a 11, painel esquerdo)
    if(state.handleRadius>0){
      [sp1,sp2].forEach(pt=>{
        ctx.beginPath(); ctx.arc(pt[0],pt[1],state.handleRadius,0,Math.PI*2); ctx.fillStyle=col; ctx.fill();
        ctx.lineWidth=1.5; ctx.strokeStyle='#fff'; ctx.stroke();
      });
    }
  });
}

function drawAxisLines(){
  const apEff = getAxisLinePoints();
  const visRect = getVisibleImageRect();
  for(const axisIdx of [1,2]){
    if(axisIdx===2 && state.vpCount!==2) continue;
    const axisToken = axisIdx===1 ? state.axis1 : state.axis2;
    const col = colorForAxisLetter(axisLetter(axisToken));
    drawVpLinePair(apEff[axisIdx], col, String(axisIdx), visRect, axisIdx);
  }
  if(state.ppMode==='fromThirdVP' && state.vpCount===2){
    // 3º ponto de fuga: mesmo tratamento visual dos outros 2 pares (linha sólida, prolongamento,
    // bolinhas), na cor do eixo do mundo atribuído automaticamente a ele (ver thirdAxisLetter()).
    const col3 = colorForAxisLetter(thirdAxisLetter());
    drawVpLinePair(state.axisPoints[3], col3, '3', visRect, 3);
  }
  // hover highlight
  const hoverR = state.handleRadius+3;
  if(hoverTarget && hoverTarget.kind==='axisPoint'){
    const pt = s(state.axisPoints[hoverTarget.axisIdx][hoverTarget.lineKey][hoverTarget.ptIdx]);
    ctx.beginPath(); ctx.arc(pt[0],pt[1],hoverR,0,Math.PI*2); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
  } else if(hoverTarget && hoverTarget.kind==='rectCorner'){
    const pt = s(state.rectCorners[hoverTarget.key]);
    ctx.beginPath(); ctx.arc(pt[0],pt[1],hoverR,0,Math.PI*2); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
  }
}

/* -------------------------- Gizmo de eixos do mundo ------------------------ */
// Desenha, para uma ponta de tela sA->sB, uma "cabeça de seta" ABERTA (chevron, duas linhas
// formando um "<"/">" — nunca um triângulo preenchido).
function drawChevronHead(sFrom, sTip, color){
  const ang = Math.atan2(sTip[1]-sFrom[1], sTip[0]-sFrom[0]);
  const hs = 9, spread = 0.5;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(sTip[0]-hs*Math.cos(ang-spread), sTip[1]-hs*Math.sin(ang-spread));
  ctx.lineTo(sTip[0], sTip[1]);
  ctx.lineTo(sTip[0]-hs*Math.cos(ang+spread), sTip[1]-hs*Math.sin(ang+spread));
  ctx.stroke();
  ctx.restore();
}
// Marca perpendicular ("I" cap) num ponto de tela, alinhada à direção (em tela) do eixo.
function drawTickMark(sp, screenAngle, color){
  const perp = screenAngle + Math.PI/2;
  const tl = 8;
  ctx.save();
  ctx.strokeStyle=color; ctx.lineWidth=2; ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(sp[0]-tl*Math.cos(perp), sp[1]-tl*Math.sin(perp));
  ctx.lineTo(sp[0]+tl*Math.cos(perp), sp[1]+tl*Math.sin(perp));
  ctx.stroke();
  ctx.restore();
}

// Desenha o prolongamento de UM eixo do mundo (x, y ou z) a partir da origem: em estado normal
// é uma seta sólida terminada em cabeça aberta (chevron) com a letra do eixo logo após a ponta.
// Quando este é o eixo escolhido em "Distância de referência", a linha inteira fica pontilhada
// (sem trecho sólido separado), prolongando-se além da ponta da seta até duas marcas
// perpendiculares que delimitam o segmento de medida (state.refDistT[0]/[1]).
function drawAxisGizmoArrow(letter){
  const ray = getAxisRay(letter);
  if(!ray) return;
  const col = colorForAxisLetter(letter);
  const isActive = state.refDistMode === letter;
  const { origin, dir, arrowLen } = ray;
  const pAt = (t)=>[origin[0]+dir[0]*t, origin[1]+dir[1]*t];

  let maxT = arrowLen;
  if(isActive) maxT = Math.max(arrowLen, state.refDistT[0], state.refDistT[1]);

  const sOrigin = s(origin);
  const sTip = s(pAt(arrowLen));
  const sEnd = s(pAt(maxT));

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  if(isActive) ctx.setLineDash([6,5]); else ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(sOrigin[0],sOrigin[1]); ctx.lineTo(sEnd[0],sEnd[1]); ctx.stroke();
  ctx.restore();

  drawChevronHead(sOrigin, sTip, col);

  // Rótulo (letra maiúscula do eixo) logo após a ponta da seta — sempre visível.
  const screenAng = Math.atan2(sTip[1]-sOrigin[1], sTip[0]-sOrigin[0]);
  const labelOff = 15;
  const lp = [sTip[0]+labelOff*Math.cos(screenAng), sTip[1]+labelOff*Math.sin(screenAng)];
  ctx.save();
  ctx.fillStyle = col; ctx.font = 'bold 14px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(letter.toUpperCase(), lp[0], lp[1]);
  ctx.restore();

  if(isActive){
    [state.refDistT[0], state.refDistT[1]].forEach(t=>{
      const p = s(pAt(t));
      drawTickMark(p, screenAng, col);
    });
    if(hoverTarget && hoverTarget.kind==='refPoint'){
      const hp = s(pAt(state.refDistT[hoverTarget.idx]));
      ctx.beginPath(); ctx.arc(hp[0],hp[1],9,0,Math.PI*2); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
    }
  }
}

// Rodada 31 (2026-09-09): BUG CORRIGIDO — pedido do usuário: "em algumas situações, as opções do
// Guia 3D deixam de ser desenhadas e só fica a bolinha branca na tela". Causa: computeCalibration()
// pode legitimamente deixar state.calib=null em várias situações TRANSITÓRIAS (ex.: enquanto o
// usuário arrasta uma extremidade e as 2 linhas do par passam a ficar momentaneamente paralelas,
// ou os 2 eixos escolhidos ficam iguais — ver calibration.js) — nesses casos draw3DGuide() já
// retorna sem desenhar nada (`if(!c...) return;`) e as SETAS do gizmo (drawAxisGizmoArrow) também
// já respeitavam esse `if(c)`, mas a bolinha branca da ORIGEM do gizmo (este círculo aqui) era
// desenhada incondicionalmente — sobrava sozinha na tela, dando a impressão de que a Guia 3D
// "quebrou". Corrigido: a função inteira (setas E bolinha de origem) agora só desenha quando há
// calibração válida (mesma condição usada por draw3DGuide()/drawAxisGizmoArrow()).
function drawAxisGizmo(){
  const c = state.calib;
  if(!c) return;
  const op = s(state.originPoint);
  ['x','y','z'].forEach(letter=>drawAxisGizmoArrow(letter));
  ctx.beginPath(); ctx.arc(op[0],op[1],7,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
  ctx.lineWidth=1.5; ctx.strokeStyle='#333'; ctx.stroke();
  if(hoverTarget && hoverTarget.kind==='origin'){
    ctx.beginPath(); ctx.arc(op[0],op[1],10,0,Math.PI*2); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
  }
}

function drawPrincipalPoint(){
  let pt, col;
  if(state.ppMode==='manual'){ pt = state.principalPointManual; col='#f1c40f'; }
  else if(state.ppMode==='midpoint'){ pt = [state.imageW/2, state.imageH/2]; col='#f1c40f'; }
  else {
    // 'fromThirdVP': a bolinha do ponto principal fica na cor do eixo do mundo atribuído ao
    // 3º ponto de fuga (mesma cor das linhas/pontas desse par — ver thirdAxisLetter()).
    pt = state.calib ? state.calib.pp : [state.imageW/2, state.imageH/2];
    col = colorForAxisLetter(thirdAxisLetter());
  }
  const sp = s(pt);
  ctx.beginPath(); ctx.arc(sp[0],sp[1],7,0,Math.PI*2);
  if(state.ppMode==='manual'){ ctx.fillStyle=col; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='#7a5c00'; ctx.stroke(); }
  else { ctx.lineWidth=2.5; ctx.strokeStyle=col; ctx.stroke(); }
  // "Mover ponto médio gerado pelos 3 pontos de fuga": um pequeno preenchimento extra deixa claro
  // que esse ponto (normalmente só calculado) agora também é uma alça arrastável.
  if(state.ppMode==='fromThirdVP' && state.movePPFrom3VP){
    ctx.beginPath(); ctx.arc(sp[0],sp[1],3,0,Math.PI*2); ctx.fillStyle=col; ctx.fill();
  }
  if(hoverTarget && (hoverTarget.kind==='pp' || hoverTarget.kind==='ppFrom3VP')){
    ctx.beginPath(); ctx.arc(sp[0],sp[1],10,0,Math.PI*2); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
  }
}

/* --------------------------- Guias 3D (caixa / grade) ----------------------- */
// Projeta um segmento de reta do MUNDO 3D para a TELA, recortando (clip) contra o plano near em
// espaço de câmera antes de projetar — evita que linhas desapareçam/"pulem" ao cruzar a câmera.
// Retorna [ [sx,sy], [sx,sy] ] (pontos de tela) ou null se o segmento inteiro está atrás da
// câmera. Compartilhada por draw3DGuide() (caixa/grade única), drawMovableGrids() ("Pisos
// móveis") e a Guia 3D "Canto" (js/corner-guide.js) — extraída da antiga edge() local a esta
// função para poder ser reaproveitada nos novos modos de guia (rodada 10).
function projectWorldSegment(P1,P2){
  const pc1 = worldToCamSpace(P1), pc2 = worldToCamSpace(P2);
  if(!pc1 || !pc2) return null;
  const clipped = clipSegmentNearPlane(pc1, pc2, -1e-4);
  if(!clipped) return null;
  const a = projectCamSpacePoint(clipped[0]), b = projectCamSpacePoint(clipped[1]);
  return [s(a), s(b)];
}
function draw3DGuide(){
  const c = state.calib; if(!c || state.guide3d==='off') return;
  // Modos novos (rodada 10), com desenho próprio — ver funções dedicadas.
  if(state.guide3d==='gridsMovable'){ drawMovableGrids(); return; }
  if(state.guide3d==='corner'){ if(typeof drawCornerGuideOnMain==='function') drawCornerGuideOnMain(); return; }
  const arrowLen = gizmoArrowLength();
  // Grade: cada célula mede METADE do comprimento da seta do gizmo.
  const unit = arrowLen/2;
  ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=0.75;
  function edge(P1,P2){
    const seg = projectWorldSegment(P1,P2); if(!seg) return;
    ctx.beginPath(); ctx.moveTo(seg[0][0],seg[0][1]); ctx.lineTo(seg[1][0],seg[1][1]); ctx.stroke();
  }
  if(state.guide3d==='box'){
    // O lado (aresta) do cubo deve medir exatamente 2x o comprimento da seta do gizmo — logo a
    // meia-extensão (do centro até cada face) é igual ao próprio comprimento da seta.
    const h=arrowLen;
    function C(sx,sy,sz){ return [sx*h,sy*h,sz*h]; }
    const P=[C(-1,-1,-1),C(1,-1,-1),C(1,1,-1),C(-1,1,-1),C(-1,-1,1),C(1,-1,1),C(1,1,1),C(-1,1,1)];
    const E=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    E.forEach(([i,j])=>edge(P[i],P[j]));
  } else {
    const plane = state.guide3d==='gridYZ'?['y','z']: state.guide3d==='gridXZ'?['x','z']:['x','y'];
    const axisMap={x:0,y:1,z:2};
    const N=10, half=N/2;
    for(let i=0;i<=N;i++){
      const t=(i-half)*unit;
      const P1=[0,0,0], P2=[0,0,0];
      P1[axisMap[plane[0]]]=t; P1[axisMap[plane[1]]]=-half*unit;
      P2[axisMap[plane[0]]]=t; P2[axisMap[plane[1]]]=half*unit;
      edge(P1,P2);
      const P3=[0,0,0], P4=[0,0,0];
      P3[axisMap[plane[1]]]=t; P3[axisMap[plane[0]]]=-half*unit;
      P4[axisMap[plane[1]]]=t; P4[axisMap[plane[0]]]=half*unit;
      edge(P3,P4);
    }
  }
}

/* ============================== Readouts =================================== */
function fmt(n, digits){ if(n==null||!isFinite(n)) return '—'; return n.toFixed(digits==null?4:digits); }
// Acrescenta um sufixo de unidade a um valor já formatado, só quando "Mostrar unidades" está
// ligado (state.showUnits) e o valor não é o traço '—' (nesse caso não faz sentido anexar nada).
function withUnit(valueStr, suffix){
  if(!state.showUnits || valueStr==='—' || !suffix) return valueStr;
  return valueStr + suffix;
}

function updateReadouts(){
  document.getElementById('outImgW').value = withUnit(String(state.imageW||0), ' px');
  document.getElementById('outImgH').value = withUnit(String(state.imageH||0), ' px');

  const c = state.calib;
  if(!c){
    ['outFovH','outFovV','outCamX','outCamY','outCamZ','outOrientX','outOrientY','outOrientZ','outOrientW','outPPX','outPPY','outFocalMM']
      .forEach(id=>document.getElementById(id).value='—');
    updateCalibErrorMessage();
    return;
  }
  updateCalibErrorMessage();
  const angUnit = state.fovUnit==='deg' ? '°' : ' rad';
  const fovH = state.fovUnit==='deg'? rad2deg(c.fovH): c.fovH;
  const fovV = state.fovUnit==='deg'? rad2deg(c.fovV): c.fovV;
  document.getElementById('outFovH').value = withUnit(fmt(fovH,3), angUnit);
  document.getElementById('outFovV').value = withUnit(fmt(fovV,3), angUnit);

  // state.calib.camPos é sempre calculado em METROS (unidade canônica interna — ver
  // computeCalibration()); aqui convertemos para a unidade que o usuário escolheu em
  // "Distância de referência" (ex.: cm) antes de exibir, senão o número mostrado ficaria na
  // unidade errada (ex.: aparentando ser 100x menor quando a unidade escolhida é cm).
  const posConv = sceneDisplayUnitFactor();
  const posUnit = (state.refDistMode!=='none' && state.refDistUnit!=='none') ? (' '+state.refDistUnit) : '';
  document.getElementById('outCamX').value = withUnit(fmt(c.camPos[0]/posConv), posUnit);
  document.getElementById('outCamY').value = withUnit(fmt(c.camPos[1]/posConv), posUnit);
  document.getElementById('outCamZ').value = withUnit(fmt(c.camPos[2]/posConv), posUnit);

  if(state.orientMode==='quat'){
    document.getElementById('outOrientX').value = fmt(c.quat[0]);
    document.getElementById('outOrientY').value = fmt(c.quat[1]);
    document.getElementById('outOrientZ').value = fmt(c.quat[2]);
    document.getElementById('outOrientW').value = fmt(c.quat[3]);
  } else {
    const a = c.axisAngle;
    document.getElementById('outOrientX').value = fmt(a.axis[0]);
    document.getElementById('outOrientY').value = fmt(a.axis[1]);
    document.getElementById('outOrientZ').value = fmt(a.axis[2]);
  }

  if(state.ppUnit==='abs'){
    document.getElementById('outPPX').value = withUnit(fmt(c.pp[0],2), ' px');
    document.getElementById('outPPY').value = withUnit(fmt(c.pp[1],2), ' px');
  } else {
    document.getElementById('outPPX').value = fmt(c.pp[0]/state.imageW,4);
    document.getElementById('outPPY').value = fmt(c.pp[1]/state.imageH,4);
  }

  document.getElementById('focalBody').classList.toggle('hidden', !state.focalEnabled);
  document.getElementById('outFocalMM').value = state.focalEnabled? withUnit(fmt(c.focalMM,3), ' mm') : '—';
}

// Mensagem de erro exibida logo abaixo da seção "Distância Focal" sempre que há uma imagem
// carregada mas a configuração atual dos pontos de fuga não permite calcular a calibração.
// O texto muda conforme o motivo (ver state.calibErrorReason, definido em computeCalibration()):
// atribuir o mesmo eixo do mundo às letras '1' e '2' é um erro de CONFIGURAÇÃO do usuário (não
// um problema geométrico das linhas), então ganha uma mensagem própria e mais específica.
function updateCalibErrorMessage(){
  const el = document.getElementById('calibErrorMsg');
  if(!el) return;
  const showError = !!state.image && !state.calib;
  el.classList.toggle('hidden', !showError);
  if(showError){
    el.textContent = state.calibErrorReason==='duplicateAxis'
      ? 'Atribuição de eixo inválida'
      : 'Configuração de ponto de fuga inválida. Falha ao calcular a distância focal.';
  }
}

// mostra também o ângulo (grau/rad) quando não é quaternion — adicionamos uma linha extra dinamicamente
(function addAngleReadout(){
  const wrap = document.createElement('div');
  wrap.className='readout'; wrap.id='outAngleRow';
  wrap.innerHTML = '<span class="rlabel">ângulo</span><input readonly id="outOrientAngle"><button class="copyBtn" data-copy="outOrientAngle">⧉</button>';
  document.getElementById('outOrientWRow').insertAdjacentElement('afterend', wrap);
  wrap.querySelector('.copyBtn').addEventListener('click', ()=>{
    const el=document.getElementById('outOrientAngle');
    if(navigator.clipboard) navigator.clipboard.writeText(el.value).catch(()=>{});
  });
})();
const _origUpdateReadouts = updateReadouts;
updateReadouts = function(){
  _origUpdateReadouts();
  const row = document.getElementById('outAngleRow');
  const c = state.calib;
  // A linha "ângulo" só deve ficar OCULTA quando o modo é quaternion (não faz sentido ali).
  // Quando não há calibração válida, ela permanece visível mostrando "—", como as demais.
  row.classList.toggle('hidden', state.orientMode==='quat');
  if(state.orientMode!=='quat'){
    if(c){
      const ang = state.orientMode==='axisDeg'? rad2deg(c.axisAngle.angle) : c.axisAngle.angle;
      const angUnit = state.orientMode==='axisDeg' ? '°' : ' rad';
      document.getElementById('outOrientAngle').value = withUnit(fmt(ang,3), angUnit);
    } else {
      document.getElementById('outOrientAngle').value = '—';
    }
  }
};
