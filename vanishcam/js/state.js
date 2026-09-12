'use strict';
/* ==========================================================================
   VanishCam — estado global, constantes e pequenas funções de apoio ao estado.
   ========================================================================== */

/* --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO (mais recente primeiro)
   Cada entrada resume O QUE mudou, QUANDO (rodada de pedidos do usuário) e
   POR QUÊ — para dar continuidade ao projeto sem perder o contexto de
   decisões já tomadas. Ver também o histórico equivalente nos outros
   arquivos (calibration.js, canvas-render.js, project-io.js, ui-controls.js)
   e o resumo consolidado em claude/status.md (Projeto VanishCam no Claude).
   --------------------------------------------------------------------------
   Rodada 30 (2026-09-09): pedido do usuário — REMOVIDOS os campos
     manualPPShowThirdAxisLines e manualPPThirdAxisLinesInfinite (e suas
     entradas em captureUndoSnapshot()/applyUndoSnapshotObj()). "Ponto
     principal: Manual" agora sempre mostra o par de linhas do 3º eixo,
     controlado só por axisLineExtension[3]/axisLineInfiniteExtension[3]
     (que já existiam) — ver drawManualPPThirdAxisLines() em canvas-render.js.
   Rodada 29 (2026-09-09): novo campo axisLineInfiniteExtension{1,2,3} (pedido
     do usuário) — SEGUNDO botão de prolongamento por eixo (o primeiro, da
     rodada 28, é axisLineExtension acima): estende a linha, além da
     extremidade do par MAIS DISTANTE do ponto de fuga, até a borda visível da
     tela (em vez de parar nela) — ver computeFarPointExtension()/
     drawVpLinePair() em canvas-render.js. Desligado por padrão nos 3 eixos,
     como pedido explicitamente. Entra no histórico de desfazer/refazer.
   Rodada 28 (2026-09-09): 2 campos novos de state{} (2 pedidos do usuário).
     (a) manualPPThirdAxisLinesInfinite — subopção de manualPPShowThirdAxisLines
     (Ponto principal: Manual): desabilitada por padrão, como pedido; controla
     se as linhas do 3º eixo (nesse modo) ficam infinitas até a borda da tela ou
     param na extremidade mais distante do par — ver drawManualPPThirdAxisLines()
     em canvas-render.js para os detalhes. (b) axisLineExtension{1,2,3} — liga/
     desliga, por eixo, o prolongamento fino desenhado por drawVpLinePair() até
     o ponto de fuga (pedido: "sem bagunçar o layout já definido", implementado
     nos 3 eixos — ver index.html/ui-controls.js para os novos botões-ícone).
     Ambos entram no histórico de desfazer/refazer (captureUndoSnapshot()/
     applyUndoSnapshotObj() abaixo).
   Rodada 23 (2026-09-09): rebranding para VanishCam (pedido do usuário — ver
     histórico completo em index.html/project-io.js). Aqui: SHORTCUTS_STORAGE_KEY
     (chave do localStorage onde os atalhos configuráveis são salvos) mudou de
     'fspyWebShortcuts' para 'vanishCamShortcuts' — efeito colateral esperado:
     usuários com atalhos já customizados numa sessão anterior deste navegador
     voltam ao padrão uma única vez (não é dado do projeto, é só preferência
     local do app, então não há risco de perda de projetos salvos).
   Rodada 16 (2026-09-08): vpMove[eixo] ganhou o campo distMode ('proportional'
     padrão, ou 'preserveLength') — novo botão auxiliar 📏 ao lado de "Mover"
     em cada eixo (index.html/ui-controls.js), consumido por
     pivotEndpoint()/adjustAxisLine() em canvas-render.js. Como vpMove já
     entra INTEIRO (por referência) em captureUndoSnapshot()/
     applyUndoSnapshotObj() (ver rodada 15 abaixo), o novo campo já é
     coberto pelo desfazer/refazer sem qualquer alteração adicional aqui.
   Rodada 15 (2026-09-08): novo sistema de DESFAZER/REFAZER (Ctrl+Z / Ctrl+Y) —
     pedido do usuário: "toda a ação do app" (ligar/desligar botões, mover/
     arrastar, selecionar opção em listas), EXCETO zoom e mover a imagem com o
     botão do meio. Em vez de instrumentar manualmente cada um dos dezenas de
     listeners espalhados por ui-controls.js/canvas-render.js/corner-guide.js,
     o histórico se conecta num ÚNICO ponto: markDirty() — já chamada por
     praticamente toda ação que muda o projeto neste app (padrão consistente
     desde a criação). markDirty() agora decide: se um arraste está em
     andamento (dragTarget != null, canvas-render.js — cobre pontos E grades
     móveis, os 2 únicos casos que chamam markDirty() em CADA mousemove), só
     marca historyPendingCommit=true (o snapshot de fato só é tirado no
     'mouseup', 1 passo de desfazer por arraste inteiro); senão, tira um
     snapshot na hora (ações "instantâneas": checkbox/dropdown/clique).
     Pan (botão do meio) e zoom (roda do mouse) nunca chamam markDirty() neste
     app — já ficam de fora do histórico sozinhos, sem precisar de exceção
     explícita. Ver captureUndoSnapshot()/applyUndoSnapshotObj() abaixo para
     exatamente o que entra no snapshot (tudo relativo ao "conteúdo" do
     projeto — pontos, configurações — EXCETO imagem, zoom/pan, e dados
     derivados/recalculáveis como calib e o ícone do canto).
   Rodada 14 (2026-09-08): o modo padrão de vpMove{1,2,3} (usado quando "Mover"
     está ligado para um eixo) mudou de 'translate' para 'anchor' — pedido
     explícito do usuário ("por padrão, para os 3 eixos de fuga, a opção
     'Ancorar' deve ficar marcada"). Mesma mudança replicada nos outros 2
     lugares que criam esse objeto (resetProject() e o fallback de projetos
     antigos sem vpMove, ambos em project-io.js).
   Rodada 13 (2026-09-08): novo bloco de ATALHOS CONFIGURÁVEIS do app (variável
     global `shortcuts`, separada de `state{}` de propósito — é preferência do
     APLICATIVO, salva no localStorage do navegador, e não deve ir dentro do
     arquivo de projeto .fspy.json). Pedido do usuário: (a) Ctrl+clique numa
     extremidade de linha trava/destrava só ela (antes só era possível com o
     "botão de travar" ativado); (b) Ctrl+clique no próprio botão "Travar"
     trava/destrava as 4 extremidades do eixo de uma vez; (c) a tecla "Ctrl"
     usada nesses 2 atalhos (e no já existente "segurar Ctrl para ciclar
     bolinhas sobrepostas", rodada 8) deve poder ser trocada por Alt/Shift numa
     janela de configuração — daí `shortcuts.modifierKey` em vez de checar
     e.ctrlKey/e.key==='Control' diretamente em canvas-render.js/ui-controls.js
     (ver shortcutModifierActive()/shortcutModifierKeyName() abaixo, usadas
     nesses 2 arquivos).
   Rodada 9 (2026-09-07): adicionado este histórico de alterações (e o
     equivalente nos demais arquivos do projeto) — pedido explícito do
     usuário para documentar em comentários o que foi feito, quando e por
     quê, à medida que o projeto evolui. Sem mudança de comportamento.
   Rodada 7 (2026-09-07): novos campos showUnits (toggle "Mostrar unidades"
     do painel direito) e calibErrorReason (motivo de uma calibração
     inválida — 'duplicateAxis' vs 'generic' — usado para escolher a
     mensagem de erro certa). Comentário sobre AXIS_LETTER_COLOR atualizado:
     a cor do 3º ponto de fuga deixou de ser fixa (removida a constante
     VP3_COLOR) e passou a seguir dinamicamente o eixo atribuído a ele
     (ver thirdAxisLetter() em calibration.js).
   Rodada 6 (2026-09-06): novos campos handleRadius (raio das bolinhas de
     extremidade, 0 a 11) e lineThickness (espessura das linhas de VP) —
     usuário pediu controles no painel esquerdo para ajustar a aparência do
     desenho dos pontos de controle.
   Rodada 5 (2026-09-06): comentário adicionado em CADA campo do objeto
     state{} explicando para que serve (pedido explícito do usuário: "coloque
     comentários... para falar para que serve as propriedades e valores").
     O campo originPoint ganhou destaque especial no comentário por responder
     à pergunta do usuário sobre qual é o nome do campo que guarda "a posição
     do gizmo em cima da imagem" no arquivo de projeto salvo.
   Rodada 10 (2026-09-08): pedido grande do usuário, com várias features novas:
     (a) diagonals{enabled,color} — linhas diagonais finas canto-a-canto sobre a
     imagem (painel esquerdo), cruzando exatamente no centro da imagem, com
     botão de escolha de cor (padrão branco). (b) move3VPEnabled + vp3Lock —
     nova opção (abaixo do "Ponto principal", só quando 'fromThirdVP') para
     mover o 3º ponto de fuga arrastando o PRÓPRIO ponto (em vez de só suas 4
     extremidades), com um "botão de travar" que marca até 3 das 4
     extremidades do par de linhas do 3º eixo como fixas (a 4ª/demais se
     ajustam para que o ponto de fuga siga o mouse); com as 4 travadas, o
     ponto fica imóvel e um aviso é mostrado. (c) movableGrids — novo modo de
     "Guia 3D": 'gridsMovable' ("Pisos móveis"), as 3 grades (YZ/XZ/XY)
     desenhadas juntas, cada uma arrastável dentro do seu próprio plano
     (offset 2D salvo por grade). (d) cornerGuide — novo modo de "Guia 3D":
     'corner' ("Canto"), com um botão que abre um cubo 3D interativo (popup)
     para escolher visualmente qual dos 8 cantos do cubo deve ser desenhado
     como guia (3 grades formando um canto, a partir da origem do gizmo) —
     ver js/corner-guide.js (arquivo novo). (e) zoom/panX/panY passaram a ser
     salvos no arquivo de projeto (settings) — antes eram sempre resetados/
     recalculados (fitZoom) ao salvar/abrir um projeto.
   Rodada 11 (2026-09-08): generalização grande do que foi feito na rodada 10
     para o 3º ponto de fuga: (a) move3VPEnabled/vp3Lock (só existiam para o
     eixo 3) foram substituídos por vpMove{1,2,3} — cada eixo agora tem sua
     própria alça de "mover o ponto de fuga direto", seu próprio travamento
     por extremidade, e um NOVO campo mode ('translate'|'anchor') — pedido
     explícito do usuário para poder escolher entre transladar a linha
     inteira (comportamento antigo) ou "ancorar" a extremidade mais afastada
     do ponto de fuga (só a mais próxima se move). Para os eixos 1/2, a
     feature só é exposta com o Modo retângulo desligado (ver comentário
     acima de vpMove). (b) movePPFrom3VP — nova opção para mover o ponto
     principal quando ele é o ortocentro dos 3 VPs (ppMode='fromThirdVP').
     (c) manualPPShowThirdAxisLines — nova opção para mostrar o par de
     linhas do 3º eixo (como linhas infinitas) quando ppMode='manual'.
   -------------------------------------------------------------------------- */

const state = {
  // A imagem carregada no projeto: o <img> em si (image/imageEl — o mesmo objeto, duplicado
  // por conveniência), suas dimensões em pixels, e a data URL/URL de onde ela veio (usada ao
  // salvar o projeto e ao exportar a imagem).
  image:null, imageEl:null, imageW:0, imageH:0, imageDataURL:null,
  fileName:null, projectHandleName:null, dirty:false, // dirty=true -> há alterações não salvas

  vpCount:2,               // quantos pontos de fuga o usuário está usando: 1 ou 2
  axis1:'-x', axis2:'-z',  // eixo do mundo ('x','-x','y','-y','z' ou '-z') atribuído a cada VP
  oneVpFovDeg:50,          // campo de visão horizontal (graus) informado manualmente no modo de 1 VP

  // "Distância de referência": permite fixar a escala absoluta do mundo 3D dizendo que um
  // segmento, medido ao longo de um dos eixos (x, y ou z), tem um comprimento real conhecido.
  refDistMode:'none', refDistValue:0.2, refDistUnit:'m',

  ppMode:'midpoint',  // como o ponto principal é determinado: 'midpoint' | 'manual' | 'fromThirdVP'
  rectMode:true,      // liga os 2 pares de linha de VP num retângulo de 4 cantos compartilhados
  guide3d:'off',      // guia 3D sobreposta à imagem: 'off' | 'box' | 'gridYZ' | 'gridXZ' | 'gridXY'
                      // | 'gridsMovable' (as 3 grades juntas, arrastáveis) | 'corner' (canto do cubo)
  darkenImage:true,   // escurece a imagem de fundo para destacar os desenhos por cima

  fovUnit:'deg',              // unidade da leitura "Campo de Visão": 'deg' ou 'rad'
  orientMode:'axisDeg',       // formato da leitura "Orientação da câmera": 'axisDeg'|'axisRad'|'quat'
  ppUnit:'abs',                // unidade da leitura "Ponto Principal": 'abs' (pixels) ou 'rel' (0..1)
  focalEnabled:true,           // se a seção "Distância Focal" está habilitada/visível
  sensorW:36, sensorH:24, cameraPresetKey:'custom', // dimensões do sensor (mm) e preset escolhido

  // Pontos de controle em coordenadas da imagem (pixels, origem no canto sup-esq da imagem)
  // Cada eixo de ponto de fuga tem 2 linhas com 2 pontos cada => 4 pontos.
  axisPoints:{
    1:{ l1:[[0,0],[0,0]], l2:[[0,0],[0,0]] },
    2:{ l1:[[0,0],[0,0]], l2:[[0,0],[0,0]] },
    3:{ l1:[[0,0],[0,0]], l2:[[0,0],[0,0]] }, // usado apenas para "Ponto principal: a partir do 3º ponto de fuga"
  },
  principalPointManual:[0,0], // posição (px de imagem) do ponto principal quando ppMode='manual'
  // originPoint = posição 2D (em pixels de imagem) do GIZMO DO MUNDO sobre a imagem: o ponto
  // a partir do qual as 3 setas dos eixos x/y/z são desenhadas. É este o campo, no arquivo de
  // projeto salvo (.vanishcam.json), que guarda "a posição do gizmo em cima da imagem".
  originPoint:[0,0],
  // Distância de referência: 2 escalares (distância em px de imagem, ao longo do raio que
  // parte da origem seguindo a direção do eixo escolhido — ver getAxisRay()).
  refDistT:[40,90],

  // Modo retângulo: 4 cantos compartilhados entre os 2 pares de eixos de VP.
  // TL-TR = eixo 1 linha 1; BL-BR = eixo 1 linha 2; TL-BL = eixo 2 linha 1; TR-BR = eixo 2 linha 2.
  rectCorners:{ TL:[0,0], TR:[0,0], BL:[0,0], BR:[0,0] },

  // Aparência do desenho dos pontos de controle sobre a imagem (ajustável no painel esquerdo).
  handleRadius:6,   // raio (px de tela) das "bolinhas" das extremidades das linhas: 0 a 11
  lineThickness:2,  // espessura (px de tela) das linhas dos pares de pontos de fuga

  showUnits:false,  // se true, os valores do painel direito exibem sufixos de unidade (px, °, mm, ...)

  // Linhas diagonais finas sobre a imagem: canto superior-esquerdo -> inferior-direito, e canto
  // superior-direito -> inferior-esquerdo. O cruzamento das duas cai exatamente no ponto médio
  // da imagem. Puramente decorativo/auxiliar (não participa da calibração); cor escolhida pelo
  // botão ao lado do checkbox, no painel esquerdo.
  diagonals:{ enabled:false, color:'#ffffff' },

  // "Mover ponto de fuga" (generalizado na rodada 11 para os 3 eixos — antes só existia para o
  // 3º). Uma entrada por eixo (1, 2 e 3): enabled liga uma alça extra bem em cima do próprio
  // ponto de fuga daquele eixo (a interseção do seu par de linhas), arrastável diretamente; mode
  // é 'translate' (translada a linha inteira mantendo sua forma — comportamento original) ou
  // 'anchor' (a extremidade mais AFASTADA do ponto de fuga tende a ficar ancorada na posição
  // original; só a mais PRÓXIMA se move, girando em torno da afastada); lock diz quais das 4
  // extremidades (2 por linha, l1/l2) NÃO devem se mover — até 3 podem ficar travadas; com as 4,
  // o ponto de fuga fica imóvel (ver moveAxisVpTo() em canvas-render.js). Para os eixos 1 e 2,
  // essa alça só é oferecida com o Modo retângulo DESLIGADO (com ele ligado, os pares de linha
  // compartilham cantos entre si — rectCorners — e o conceito de "travar só as extremidades do
  // eixo 1" deixa de ser bem definido, já que um canto é ao mesmo tempo do eixo 1 e do eixo 2).
  // O estado do "botão de travar" em si (enquanto ativo, clicar numa extremidade alterna seu
  // travamento em vez de arrastar) é transitório, não persistido — ver vpLockToolActive em
  // canvas-render.js.
  vpMove:{
    1:{ enabled:false, mode:'anchor', distMode:'proportional', lock:{l1:[false,false], l2:[false,false]} },
    2:{ enabled:false, mode:'anchor', distMode:'proportional', lock:{l1:[false,false], l2:[false,false]} },
    3:{ enabled:false, mode:'anchor', distMode:'proportional', lock:{l1:[false,false], l2:[false,false]} },
  },
  // "Mover ponto médio gerado pelos 3 pontos de fuga": só relevante quando ppMode==='fromThirdVP'
  // (nesse modo, o ponto principal É o ortocentro de vp1/vp2/vp3 — não um ponto solto). Quando
  // ligado, uma alça extra aparece sobre esse ponto; arrastá-la tenta transladar os 3 pontos de
  // fuga (1, 2 e 3) pelo MESMO delta, cada um respeitando as próprias limitações de vpMove[eixo]
  // (travamento/modo) — move o que der dentro dessas limitações (ver movePPFrom3VPBy()).
  movePPFrom3VP:false,
  // Rodada 30 (2026-09-09): pedido do usuário — os campos manualPPShowThirdAxisLines (checkbox
  // "Mostrar linhas do 3º eixo de fuga") e manualPPThirdAxisLinesInfinite (subopção "Prolongamento
  // infinito") foram REMOVIDOS. "Ponto principal: Manual" agora SEMPRE mostra o par de linhas do
  // 3º eixo de fuga (o MESMO axisPoints[3] usado/editável quando ppMode='fromThirdVP' — ver
  // drawManualPPThirdAxisLines(), canvas-render.js), na cor do eixo do mundo atribuído a ele
  // (thirdAxisLetter()) — sem precisar de um checkbox de mestre: os 2 controles que restaram são os
  // MESMOS axisLineExtension[3]/axisLineInfiniteExtension[3] abaixo (pedido do usuário: "mantenha
  // ativo os botões... que já cumprem este papel").

  // Rodada 28 (2026-09-09): pedido do usuário — um jeito de ligar/desligar, por eixo, o
  // prolongamento fino desenhado por drawVpLinePair() (canvas-render.js) entre a extremidade mais
  // próxima do par de linhas e o próprio ponto de fuga (ou a borda da tela, se ele não estiver
  // visível) — 1 e 2 são os eixos principais de calibração; 3 é o par auxiliar, só desenhado assim
  // quando ppMode='fromThirdVP'. true (padrão) = comportamento de sempre (prolongamento desenhado);
  // false = só o segmento real entre as 2 extremidades, sem o prolongamento fino.
  axisLineExtension:{1:true, 2:true, 3:true},

  // Rodada 29 (2026-09-09): pedido do usuário — SEGUNDO botão de prolongamento por eixo, agora
  // estendendo em direção ao INFINITO a partir da extremidade do par MAIS DISTANTE do ponto de
  // fuga (em vez de parar nela) — ver computeFarPointExtension()/drawVpLinePair() em
  // canvas-render.js. Independente de axisLineExtension acima (aquele cuida do prolongamento
  // fino ATÉ o ponto de fuga, do lado mais PRÓXIMO). Desligado por padrão nos 3 eixos, como pedido
  // explicitamente ("deve ficar desativado por padrão para os 3 eixos de fuga").
  axisLineInfiniteExtension:{1:false, 2:false, 3:false},

  // Guia 3D "Pisos móveis (grades YZ, XZ e XY)": as 3 grades desenhadas juntas, cada uma podendo
  // ser arrastada (clicar numa de suas linhas e arrastar) DENTRO do seu próprio plano — o
  // deslocamento (offset) de cada grade é 2D, nas 2 coordenadas de mundo do seu próprio plano
  // (ex.: grade YZ desliza em Y e Z; nunca em X, que é a normal do plano). Ver movableGrids.js.
  movableGrids:{ YZ:{offset:[0,0]}, XZ:{offset:[0,0]}, XY:{offset:[0,0]} },

  // Guia 3D "Canto": qual dos 8 cantos do cubo foi escolhido no cubo 3D interativo (popup —
  // ver js/corner-guide.js), como sinais (+1/-1) de cada eixo. null = nenhum canto escolhido
  // ainda (a guia 'corner' fica sem desenhar nada até o usuário abrir o popup e clicar num
  // canto). iconDataURL é uma "foto" (data URL) do cubo interativo na orientação final do canto
  // escolhido, usada como ícone do botão — gerada automaticamente ao selecionar (não editável
  // pelo usuário), não persistida no arquivo de projeto (é barata de regerar).
  cornerGuide:{ selected:null, iconDataURL:null }, // selected ex.: {x:1,y:1,z:1}

  // viewport (zoom e posição do pan são salvos no arquivo de projeto — rodada 10)
  zoom:1, panX:0, panY:0,

  // resultado da calibração (recalculado) e o motivo de uma eventual falha (ver computeCalibration())
  calib:null, calibErrorReason:null,
};

// Cor por letra de eixo do mundo (x/y/z) — usada nas linhas dos pontos de fuga, nas setas do
// gizmo, na distância de referência e nas "bolinhas" dos seletores. É a MESMA cor independente
// do sinal (ex.: 'x' e '-x' têm a mesma cor).
const AXIS_LETTER_COLOR = {x:'#e74c3c', y:'#70BF41', z:'#4aa3ff'};
// (a cor do 3º ponto de fuga — usado p/ "Ponto principal: a partir do 3º ponto de fuga" — não é
// mais fixa: segue o eixo do mundo atribuído automaticamente a ele, ver thirdAxisLetter() em
// calibration.js)

function isRectActive(){ return state.rectMode && state.vpCount===2; }
// Retorna os 4 "pontos efetivos" dos eixos de VP a usar em desenho/cálculo: quando o modo
// retângulo está ativo, deriva as 2 linhas de cada eixo a partir dos 4 cantos compartilhados.
function getAxisLinePoints(){
  if(isRectActive()){
    const c = state.rectCorners;
    return {
      1:{ l1:[c.TL, c.TR], l2:[c.BL, c.BR] },
      2:{ l1:[c.TL, c.BL], l2:[c.TR, c.BR] },
    };
  }
  return state.axisPoints;
}
function avgPt(a,b){ return [(a[0]+b[0])/2, (a[1]+b[1])/2]; }

/* ---------------------- Atalhos configuráveis do app (rodada 13) ------------------------ */
// NÃO faz parte de state{} (não é salvo no arquivo de projeto .vanishcam.json) — é uma preferência do
// aplicativo, persistida em localStorage (ver loadShortcuts()/saveShortcuts() logo abaixo) e
// editável na janela "Atalhos" (menu Arquivo > Atalhos — ver js/ui-controls.js). modifierKey é a
// tecla usada por 3 atalhos relacionados: (1) segurar+soltar para ciclar bolinhas sobrepostas na
// posição do mouse (rodada 8, hoje configurável); (2) [modificador]+clique numa extremidade de
// linha, para travar/destravar só ela na hora, sem precisar ativar o "botão de travar" antes
// (ver mousedown em canvas-render.js); (3) [modificador]+clique no próprio botão "Travar" de um
// eixo, para travar/destravar as 4 extremidades dele de uma vez (ver ui-controls.js).
const DEFAULT_SHORTCUTS = { modifierKey:'ctrl' }; // 'ctrl' | 'alt' | 'shift'
let shortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
const SHORTCUTS_STORAGE_KEY = 'vanishCamShortcuts'; // Rodada 23: era 'fspyWebShortcuts'
function loadShortcuts(){
  try{
    const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && (parsed.modifierKey==='ctrl'||parsed.modifierKey==='alt'||parsed.modifierKey==='shift')){
        shortcuts.modifierKey = parsed.modifierKey;
      }
    }
  }catch(err){ /* localStorage indisponível ou JSON inválido: mantém o padrão */ }
}
function saveShortcuts(){
  try{ localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts)); }catch(err){ /* ignora (ex.: modo privado sem storage) */ }
}
loadShortcuts();
// Nome do e.key correspondente ao modificador escolhido — usado no listener de 'keyup' que
// cicla sobreposições ao SOLTAR a tecla (canvas-render.js).
function shortcutModifierKeyName(){ return {ctrl:'Control', alt:'Alt', shift:'Shift'}[shortcuts.modifierKey] || 'Control'; }
// Se o modificador configurado está pressionado num MouseEvent/KeyboardEvent — usado nos
// listeners de clique (canvas-render.js: travar 1 extremidade; ui-controls.js: travar as 4).
function shortcutModifierActive(e){
  const k = shortcuts.modifierKey;
  if(k==='alt') return !!e.altKey;
  if(k==='shift') return !!e.shiftKey;
  return !!e.ctrlKey;
}

/* ---------------------- Desfazer/Refazer (Ctrl+Z / Ctrl+Y) — rodada 15 ------------------------ */
const UNDO_STACK_LIMIT = 200;
let undoStack = [], redoStack = [];
let suppressHistoryPush = false;   // true durante applyUndoSnapshotObj(), evita recursão
let historyPendingCommit = false;  // true enquanto um arraste (dragTarget) está mudando o estado
let lastUndoSnapshotJSON = null;   // dedupe: evita empilhar 2 snapshots idênticos seguidos

// Tudo que entra no histórico de desfazer/refazer — o "conteúdo" do projeto (pontos de controle
// e todas as opções configuráveis), EXCETO: imagem (não muda com desfazer/refazer), zoom/panX/
// panY (pedido explícito do usuário para nunca entrarem no histórico) e dados DERIVADOS/
// recalculáveis (state.calib, cornerGuide.iconDataURL) — esses são recomputados/regenerados
// depois de aplicar um snapshot, nunca guardados dentro dele.
function captureUndoSnapshot(){
  return {
    vpCount:state.vpCount, axis1:state.axis1, axis2:state.axis2, oneVpFovDeg:state.oneVpFovDeg,
    refDistMode:state.refDistMode, refDistValue:state.refDistValue, refDistUnit:state.refDistUnit,
    ppMode:state.ppMode, rectMode:state.rectMode, guide3d:state.guide3d, darkenImage:state.darkenImage,
    fovUnit:state.fovUnit, orientMode:state.orientMode, ppUnit:state.ppUnit, focalEnabled:state.focalEnabled,
    sensorW:state.sensorW, sensorH:state.sensorH, cameraPresetKey:state.cameraPresetKey,
    axisPoints:state.axisPoints, principalPointManual:state.principalPointManual, originPoint:state.originPoint,
    refDistT:state.refDistT, rectCorners:state.rectCorners,
    handleRadius:state.handleRadius, lineThickness:state.lineThickness, showUnits:state.showUnits,
    diagonals:state.diagonals, vpMove:state.vpMove, movePPFrom3VP:state.movePPFrom3VP,
    // Rodada 30: manualPPShowThirdAxisLines/manualPPThirdAxisLinesInfinite REMOVIDOS (ver comentário
    // na definição de state{} acima) — os campos abaixo já cobrem o mesmo papel nos 3 eixos.
    axisLineExtension:state.axisLineExtension, // rodada 28
    axisLineInfiniteExtension:state.axisLineInfiniteExtension, // rodada 29
    movableGrids:state.movableGrids,
    cornerGuideSelected: state.cornerGuide.selected,
    shortcutsModifierKey: (typeof shortcuts!=='undefined') ? shortcuts.modifierKey : undefined,
  };
}
// Tira um snapshot e empilha em undoStack (como JSON — clone barato e já "congelado", imune a
// mutações futuras dos objetos ao vivo em state). Ignorado durante applyUndoSnapshotObj() e
// enquanto não há imagem carregada (nada de útil a desfazer ainda).
function commitUndoSnapshot(){
  if(suppressHistoryPush || !state.image) return;
  const json = JSON.stringify(captureUndoSnapshot());
  if(json===lastUndoSnapshotJSON) return; // nada mudou de fato desde o último snapshot — evita lixo
  undoStack.push(json);
  if(undoStack.length>UNDO_STACK_LIMIT) undoStack.shift();
  redoStack.length = 0; // uma ação nova sempre invalida qualquer "refazer" pendente
  lastUndoSnapshotJSON = json;
}
// Chamada ao abrir/trocar/começar um projeto (project-io.js: resetProject()/loadProjectData()/
// loadImageFile()) — reinicia o histórico com o estado recém-carregado como ponto de partida
// (não faz sentido "desfazer" para antes do projeto atual ter sido aberto).
function resetUndoHistory(){
  undoStack = []; redoStack = [];
  historyPendingCommit = false;
  lastUndoSnapshotJSON = state.image ? JSON.stringify(captureUndoSnapshot()) : null;
}
// Restaura um snapshot capturado por captureUndoSnapshot() de volta em `state`, recomputa a
// calibração e resincroniza TODOS os controles da UI com os novos valores (mesma função usada
// ao abrir um projeto — syncControlsFromState(), project-io.js) — assim um "desfazer" atualiza
// visualmente checkboxes/dropdowns/sliders, não só o desenho sobre a imagem.
function applyUndoSnapshotObj(snap){
  suppressHistoryPush = true;
  Object.assign(state, {
    vpCount:snap.vpCount, axis1:snap.axis1, axis2:snap.axis2, oneVpFovDeg:snap.oneVpFovDeg,
    refDistMode:snap.refDistMode, refDistValue:snap.refDistValue, refDistUnit:snap.refDistUnit,
    ppMode:snap.ppMode, rectMode:snap.rectMode, guide3d:snap.guide3d, darkenImage:snap.darkenImage,
    fovUnit:snap.fovUnit, orientMode:snap.orientMode, ppUnit:snap.ppUnit, focalEnabled:snap.focalEnabled,
    sensorW:snap.sensorW, sensorH:snap.sensorH, cameraPresetKey:snap.cameraPresetKey,
    axisPoints:snap.axisPoints, principalPointManual:snap.principalPointManual, originPoint:snap.originPoint,
    refDistT:snap.refDistT, rectCorners:snap.rectCorners,
    handleRadius:snap.handleRadius, lineThickness:snap.lineThickness, showUnits:snap.showUnits,
    diagonals:snap.diagonals, vpMove:snap.vpMove, movePPFrom3VP:snap.movePPFrom3VP,
    // Rodada 30: manualPPShowThirdAxisLines/manualPPThirdAxisLinesInfinite REMOVIDOS do undo/redo
    // (campos removidos de state{} — ver comentário na definição acima).
    axisLineExtension: snap.axisLineExtension || state.axisLineExtension,
    // Rodada 29: mesmo tratamento defensivo do campo acima, para snapshots feitos antes desta rodada.
    axisLineInfiniteExtension: snap.axisLineInfiniteExtension || state.axisLineInfiniteExtension,
    movableGrids:snap.movableGrids,
  });
  state.cornerGuide = { selected: snap.cornerGuideSelected || null, iconDataURL: null };
  if(snap.shortcutsModifierKey && typeof shortcuts!=='undefined') shortcuts.modifierKey = snap.shortcutsModifierKey;
  state.dirty = true;
  if(typeof computeCalibration==='function') computeCalibration();
  if(typeof syncControlsFromState==='function') syncControlsFromState();
  const cornerBtn = document.getElementById('cornerGuideBtn');
  if(cornerBtn){ cornerBtn.style.backgroundImage=''; cornerBtn.textContent='🧊'; }
  updateTitle();
  if(typeof render==='function') render();
  suppressHistoryPush = false;
}
function undoAction(){
  if(undoStack.length<2) return; // precisa sobrar pelo menos o estado ANTERIOR ao atual no topo
  const current = undoStack.pop();
  redoStack.push(current);
  const prevJSON = undoStack[undoStack.length-1];
  lastUndoSnapshotJSON = prevJSON;
  applyUndoSnapshotObj(JSON.parse(prevJSON));
}
function redoAction(){
  if(redoStack.length===0) return;
  const json = redoStack.pop();
  undoStack.push(json);
  lastUndoSnapshotJSON = json;
  applyUndoSnapshotObj(JSON.parse(json));
}
// Ctrl+Z desfaz, Ctrl+Y (ou Ctrl+Shift+Z) refaz — ignorado com o foco num campo de texto/select
// (deixa o undo NATIVO do navegador funcionar ali, ex.: dentro de um <input type=number>).
window.addEventListener('keydown', (e)=>{
  const tag = document.activeElement && document.activeElement.tagName;
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
  if(!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if(key==='z' && !e.shiftKey){ e.preventDefault(); undoAction(); }
  else if(key==='y' || (key==='z' && e.shiftKey)){ e.preventDefault(); redoAction(); }
});

function markDirty(){
  state.dirty = true; updateTitle();
  if(suppressHistoryPush) return;
  // dragTarget (canvas-render.js) != null enquanto um arraste de ponto/grade está em andamento
  // — markDirty() é chamada em CADA mousemove nesse caso; adia o snapshot para o 'mouseup'
  // (ver window.addEventListener('mouseup',...) em canvas-render.js).
  if(typeof dragTarget!=='undefined' && dragTarget){ historyPendingCommit = true; return; }
  commitUndoSnapshot();
}
function updateTitle(){
  const name = state.fileName || 'sem título';
  document.getElementById('appTitle').textContent = 'VanishCam — ' + name + (state.dirty?' *':'');
}

/* ---------------------------- Unidades ------------------------------ */
const UNIT_TO_M = {none:1, mm:0.001, cm:0.01, m:1, km:1000, in:0.0254, ft:0.3048, mi:1609.344};

/* ---------------------------- Câmeras (sensores) ------------------------ */
const CAMERA_PRESETS = [
  {key:'custom', name:'Câmera customizada', w:36, h:24},
  {key:'ff', name:'Full-frame (36 x 24 mm)', w:36, h:24},
  {key:'apsc_canon', name:'APS-C Canon (22.3 x 14.9 mm)', w:22.3, h:14.9},
  {key:'apsc_nikon', name:'APS-C Nikon/Sony/Fuji (23.5 x 15.6 mm)', w:23.5, h:15.6},
  {key:'m43', name:'Micro 4/3 (17.3 x 13 mm)', w:17.3, h:13},
  {key:'1inch', name:'1 polegada (13.2 x 8.8 mm)', w:13.2, h:8.8},
  {key:'iphone', name:'Smartphone típico (1/2.55", 6.17 x 4.55 mm)', w:6.17, h:4.55},
  {key:'gopro', name:'GoPro (6.17 x 4.55 mm)', w:6.17, h:4.55},
  {key:'mediumformat', name:'Médio formato (44 x 33 mm)', w:44, h:33},
  {key:'super35', name:'Super 35mm cine (24.89 x 18.66 mm)', w:24.89, h:18.66},
];
