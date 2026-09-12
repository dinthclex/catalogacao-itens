'use strict';
/* ==========================================================================
   VanishCam — Guia 3D "Canto": popup com um cubo 3D interativo (arrastável)
   usado para ESCOLHER VISUALMENTE qual dos 8 cantos do cubo desenhar como
   guia sobre a imagem principal (3 grades formando um canto de sala, a
   partir da origem do gizmo — ver drawCornerGuideOnMain(), chamada por
   draw3DGuide() em canvas-render.js quando state.guide3d==='corner').
   ========================================================================== */

/* --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO
   --------------------------------------------------------------------------
   Rodada 24 (2026-09-09): BUG CORRIGIDO — pedido do usuário: com a janela do
     cubo 3D interativo aberta, rolar a roda do mouse com o cursor FORA da
     caixa do cubo (sobre o fundo escurecido #cornerPopupOverlay) deveria
     continuar dando zoom na imagem principal — não estava funcionando, pois
     o overlay é position:fixed;inset:0 (cobre a tela toda) e capturava TODO
     evento de rolagem antes que chegasse ao listener 'wheel' do viewport
     (canvas-render.js). Novo listener 'wheel' em cornerPopupOverlayEl, logo
     abaixo dos listeners de mousedown/mouseup que já existiam ali (rodada 10)
     para fechar o popup ao clicar fora: usa o MESMO teste que eles
     (e.target.id==='cornerPopupOverlay', ou seja, o alvo é o próprio fundo,
     não a caixa/canvas do cubo por cima dele) para decidir se o cursor está
     "fora" da caixa; se estiver, chama zoomMainImageAt() (nova função,
     extraída da lógica que já existia no listener 'wheel' do viewport — ver
     canvas-render.js) para zoomar a imagem principal. Quando o cursor está
     EM CIMA da caixa/canvas do cubo, e.target é popupCanvas (ou outro
     elemento dentro da caixa), então este listener não faz nada — o listener
     'wheel' já existente em popupCanvas (rodada 15, mais abaixo) continua
     cuidando do zoom do CUBO normalmente, sem mudança nenhuma nele.
   Rodada 18 (2026-09-08): BUG CORRIGIDO — pedido do usuário: "o gizmo do cubo
     3D interativo deve ser igual ao gizmo da imagem principal", relatando que
     as setas Y e Z apareciam em pé de cabeça para baixo entre os dois (ex.:
     Y para cima na imagem principal, mas para BAIXO no popup). Causa: apesar
     de initialPopupRotation() já usar a MESMA rotação R_cw da calibração real
     (ver comentário dessa função, mais abaixo) — ou seja, o vetor de câmera
     `r` calculado em cgProject() já é idêntico ao `pc` usado por
     projectWorldPoint()/worldToCamSpace() (calibration.js) — a fórmula de
     cgProject() fazia `y: ... - r[1]*k*scale` (convenção "Y da câmera para
     cima" comum em popups 3D genéricos), enquanto a projeção real da imagem
     principal faz efetivamente `y: ... + pc[1]*fator` (pc[1] segue a
     convenção de visão computacional usada pelo resto do app, onde +Y da
     câmera aponta para BAIXO na imagem — ver cameraSpaceDir()/
     projectWorldPoint()). Resultado: as DUAS janelas usavam a MESMA matriz de
     rotação, mas espelhavam o eixo vertical de formas opostas ao desenhar —
     confirmado numericamente (script de teste headless) e visualmente
     (screenshots antes/depois) comparando as direções de tela de cada seta
     x/y/z nos dois gizmos para o mesmo state.calib. Corrigido removendo o
     sinal de menos em cgProject() (agora `y: ... + r[1]*k*scale`), a ÚNICA
     mudança necessária — como cgProject() é a projeção usada por TODO o
     desenho do cubo (arestas, quadras de destaque, marcadores de canto, guia
     de grade), a cena inteira do popup passou a ficar consistente com a
     mesma convenção vertical da imagem principal, não só o gizmo.
   Rodada 16 (2026-09-08): 3 pedidos do usuário sobre o popup do cubo 3D
     interativo. (a) BUG CORRIGIDO — o botão do MEIO do mouse clicado DENTRO
     da janela do popup (na verdade em qualquer lugar dela, já que o canvas
     é filho do fundo escurecido e o evento borbulhava) disparava ao mesmo
     tempo o pan da IMAGEM PRINCIPAL (listener do fundo, rodada 13) e um
     início de arraste do próprio popupCanvas (que não filtrava por botão) —
     agora #cornerPopupBox para a propagação de qualquer mousedown de botão
     1 que comece dentro dela, e o mousedown do canvas passou a distinguir
     button===0 (girar/selecionar canto) de button===1 (novo: PAN da vista
     do cubo, usando novas globais popupPanX/popupPanY somadas à projeção em
     cgProject()/popupProject()/renderCubeSceneTo()). O pan da imagem
     principal (fundo escurecido) continua funcionando normalmente para
     cliques do meio FORA da janela do popup. (b) "cursor infinito": tanto
     girar (botão esquerdo) quanto o novo pan (botão do meio) agora usam a
     Pointer Lock API (requestPopupPointerLock()) — enquanto travado, os
     deltas vêm de e.movementX/Y em vez de clientX/Y, então não há mais
     limite físico de tela para continuar arrastando. Cai no cálculo de
     delta antigo se o pointer lock não estiver disponível/falhar; um
     listener de 'pointerlockchange' encerra qualquer arraste pendente se o
     lock for perdido inesperadamente (ex.: Esc). (c) zoom (popupZoom) e
     rotação (popupRot) deixaram de ser resetados em openCornerPopup() — só
     são alinhados com o gizmo (initialPopupRotation()) na primeiríssima vez
     (nova flag popupRotInitialized), preservando o que o usuário deixou
     configurado entre fechar e reabrir a janela (pedido explícito).
   Rodada 15 (2026-09-08): pedido do usuário — "Deve ser possível dar zoom no
     cubo 3D interativo". Nova global popupZoom (padrão 1, resetada sempre
     que o popup abre em openCornerPopup()), multiplicando CG_SCALE tanto em
     popupProject() (usada para achar/desenhar os cantos) quanto em
     renderCornerPopup() (desenho da cena via renderCubeSceneTo()) — ou seja,
     o zoom É a escala de projeção, então a detecção de clique nos cantos
     (pickPopupCorner(), que usa popupProject()) já funciona corretamente com
     qualquer nível de zoom sem precisar de ajuste separado. Novo listener
     'wheel' no popupCanvas: cada evento multiplica popupZoom por um fator
     exponencial de e.deltaY (mesmo padrão usado pelo zoom da imagem
     principal em canvas-render.js), limitado a [POPUP_ZOOM_MIN,
     POPUP_ZOOM_MAX]=[0.35, 5]; preventDefault() evita rolar a página atrás
     do popup.
   Rodada 14 (2026-09-08): retomada de itens da rodada 13 que ainda não tinham
     ficado como o usuário pediu. (a) applyCornerSelectionInstant() (seleção
     SEM animação) não muda mais a orientação atual do cubo — antes ainda
     chamava targetRotationForCorner(c) e "saltava" para a orientação
     canônica do canto na hora; agora só marca a seleção (destaque
     verde/grade), preservando a rotação em que o usuário deixou o cubo. (b)
     ÍCONE do botão corrigido de vez: o motivo real do "borrado"/"cortado" era
     `background-size:cover` esticando/cortando um PNG quadrado de 56x56 para
     caber num botão bem mais largo que alto (width:100% x height:40px) —
     updateCornerIcon() agora mede o tamanho REAL do botão
     (getBoundingClientRect()) e desenha um canvas nesse exato tamanho (x
     devicePixelRatio, para nitidez em telas retina), com uma escala seguindo
     CORNER_ICON_SAFE_SCALE_RATIO (calibrada para nenhum canto/seta do gizmo
     estourar a borda do canvas em NENHUMA rotação — ver frontmostCorner()/o
     comentário da constante) e background-size:'100% 100%' (sem cover, sem
     distorcer proporção — a imagem já nasce do tamanho exato do botão). (c)
     drawGizmoArrows() passou a desenhar uma cabeça de seta em chevron (cópia
     de drawChevronHead(), canvas-render.js, parametrizada por um ctx
     qualquer em vez do `ctx` fixo da imagem principal) — mesmo visual exato
     do gizmo desenhado sobre a foto, em vez da linha simples de antes. (d)
     nova função drawCornerGuideGridInScene() — desenha, além do destaque
     amarelo/verde do canto, as 3 grades da guia (mesma lógica de
     drawCornerGuideOnMain(), só que em coordenadas locais do cubo) tanto no
     popup quanto no ícone, como preview de como a guia "Canto" vai ficar
     desenhada sobre a imagem principal. (e) BUG ENCONTRADO E CORRIGIDO ao
     investigar o ícone: drawCornerQuarters() passava state.cornerGuide.selected
     (formato {x,y,z}) direto para cornerQuarterFaceQuads() (que espera
     {sx,sy,sz}) — o destaque VERDE do canto selecionado nunca tinha aparecido
     de verdade no popup/ícone desde que a feature existe (só o amarelo do
     hover, que já convertia certo).
   Rodada 13 (2026-09-08): mais pedidos do usuário sobre este popup. (a) nova
     função autoSelectCornerForGizmo() — ao trocar "Guia 3D" para "Canto" sem
     nenhum canto ainda escolhido (ver listener de '#guide3d' em
     ui-controls.js), seleciona automaticamente o canto do cubo cuja direção
     (aplicada a state.calib.R_cw, a MESMA rotação usada para abrir o popup —
     ver initialPopupRotation()) fica mais de frente para a câmera — ou seja,
     o canto "natural" dado a orientação real do gizmo da imagem, sem exigir
     que o usuário abra o popup manualmente. (b) novo checkbox
     #cornerPopupAnimateChk ("mover o cubo de forma animada", desmarcado por
     padrão): com ele desmarcado, clicar num canto do popup seleciona na hora
     (sem a animação suave de selectPopupCorner() — ver applyCornerSelection()
     abaixo, chamada por ambos os caminhos). (c) o clique com o BOTÃO DO MEIO
     do mouse no fundo escurecido do popup não fecha mais a janela — em vez
     disso inicia um pan da imagem principal por trás dele (reaproveita as
     globais isPanning/panStart/panOrigin de canvas-render.js), pedido do
     usuário para poder reenquadrar a foto sem precisar fechar o popup.
     updateCornerIcon() ganhou um parâmetro opcional de rotação (antes sempre
     usava a global popupRot), para poder gerar o ícone corretamente mesmo
     quando um canto é selecionado SEM o popup estar aberto (autoSelect).
   Rodada 12 (2026-09-08): 3 correções pedidas pelo usuário. (a) o popup não
     fechava mais corretamente: um clique que COMEÇAVA dentro da janelinha
     (ex.: arrastar o cubo para girar) e terminava com o botão solto FORA
     dela estava sendo interpretado como um "clique fora" (evento nativo
     'click' do navegador usa o alvo do MOUSEUP, não o do mousedown) e
     fechava o popup no meio do arraste — corrigido rastreando manualmente
     onde o mousedown E o mouseup aconteceram (só fecha se os dois forem
     exatamente o fundo escurecido, não a caixa/canvas); também adicionado
     um botão "✕" (#cornerPopupCloseBtn) para fechar explicitamente. (b) o
     ícone do botão (#cornerGuideBtn) ficava borrado — antes era gerado
     tirando um "screenshot" do canvas de 300×300 e reduzindo para 28×28 via
     drawImage (downscale agressivo ~10.7x, borra linhas finas de 1px);
     agora updateCornerIcon() REDESENHA a cena do zero num canvas pequeno
     dedicado (renderCubeSceneTo(), função genérica parametrizada por
     ctx/canvas/escala, usada tanto pelo popup quanto pelo ícone), com
     espessuras de linha e tamanho de gizmo recalculados para aquela
     resolução menor — fica nítido porque nunca passa por um redimensiona-
     mento de imagem rasterizada. (c) o gizmo do cubo interativo (e,
     portanto, a correspondência entre "canto clicado no cubo" e "canto
     desenhado na imagem") não tinha relação alguma com a orientação real
     da câmera calibrada — o popup sempre abria com uma rotação genérica
     fixa (identidade). Agora openCornerPopup() inicializa popupRot com
     state.calib.R_cw (mundo->câmera calibrado; ver prova de equivalência
     no comentário de initialPopupRotation()), fazendo o cubo abrir já na
     MESMA orientação relativa que os eixos do mundo têm na imagem real —
     e as setas do gizmo do popup passaram a usar axisUnitVec() (mesma
     função/convenção do gizmo da imagem, inclusive a inversão visual do Y)
     em vez de eixos crus, para bater exatamente com as cores/direções do
     gizmo desenhado sobre a foto.
   Rodada 10 (2026-09-08): arquivo criado. Pedido do usuário: uma opção
   "Canto" na Guia 3D, com um botão de ícone de cubo que abre uma janelinha
   com um cubo 3D wireframe interativo (mesmo visual da guia "Caixa" + o
   gizmo de eixos), que pode ser girado arrastando (arraste vertical gira em
   torno do eixo horizontal da tela; arraste horizontal em torno do eixo
   vertical). Passar o mouse sobre um canto do cubo destaca esse canto e 1/4
   de cada uma das 3 faces adjacentes a ele; clicar SELECIONA aquele canto,
   com uma animação suave (nunca um "salto") até uma orientação canônica que
   olha de frente para ele, e desenha o mesmo destaque de canto também na
   imagem principal (3 grades formando um canto a partir da origem do
   gizmo). O ícone do botão vira uma "foto" real (screenshot) do cubo
   interativo na orientação final do canto escolhido — gerada automatica-
   mente, sem precisar de 8 ícones desenhados à mão. Clicar fora do popup
   fecha a janela mas preserva o canto selecionado (não é um modal que
   precisa ser confirmado/cancelado).
   -------------------------------------------------------------------------- */

/* ------------------------- álgebra 3x3 local (linha-major) ------------------------- */
// Usa uma convenção PRÓPRIA (matriz como array de LINHAS, não colunas como M3 em math3d.js) só
// dentro deste arquivo, por conveniência das fórmulas de rotação/quaternion abaixo — não deve
// ser confundida com a convenção coluna-major usada no resto do app (M3/R_cw/R_wc).
function cgMatMul(A,B){
  const R=[[0,0,0],[0,0,0],[0,0,0]];
  for(let i=0;i<3;i++) for(let j=0;j<3;j++){ let sum=0; for(let k=0;k<3;k++) sum+=A[i][k]*B[k][j]; R[i][j]=sum; }
  return R;
}
function cgMatVec(A,v){
  return [A[0][0]*v[0]+A[0][1]*v[1]+A[0][2]*v[2], A[1][0]*v[0]+A[1][1]*v[1]+A[1][2]*v[2], A[2][0]*v[0]+A[2][1]*v[1]+A[2][2]*v[2]];
}
function cgRotX(a){ const c=Math.cos(a),si=Math.sin(a); return [[1,0,0],[0,c,-si],[0,si,c]]; }
function cgRotY(a){ const c=Math.cos(a),si=Math.sin(a); return [[c,0,si],[0,1,0],[-si,0,c]]; }
// Rodada 20 (2026-09-09): rotação (fórmula de Rodrigues) em torno de um eixo QUALQUER (não só X/Y
// principais) — necessária para o gimbal de arraste do popup (ver bloco "gimbal de arraste", mais
// abaixo), que gira em torno do eixo de referência do gizmo da imagem principal (raramente
// exatamente X, Y ou Z em espaço de câmera) em vez de sempre em torno do X/Y da TELA. `axis` deve
// ser unitário. Para axis=(1,0,0) ou (0,1,0) reproduz exatamente cgRotX()/cgRotY() (mesma matriz,
// conferido por álgebra), então substitui os dois sem mudar nada onde o eixo já era principal.
function cgRotAxis(axis, angle){
  const [x,y,z] = axis, c=Math.cos(angle), s=Math.sin(angle), t=1-c;
  return [
    [t*x*x+c,   t*x*y-s*z, t*x*z+s*y],
    [t*x*y+s*z, t*y*y+c,   t*y*z-s*x],
    [t*x*z-s*y, t*y*z+s*x, t*z*z+c  ],
  ];
}
function cgIdentity(){ return [[1,0,0],[0,1,0],[0,0,1]]; }
function cgMatToQuat(m){
  const t=m[0][0]+m[1][1]+m[2][2];
  let x,y,z,w;
  if(t>0){ const sc=Math.sqrt(t+1)*2; w=0.25*sc; x=(m[2][1]-m[1][2])/sc; y=(m[0][2]-m[2][0])/sc; z=(m[1][0]-m[0][1])/sc; }
  else if(m[0][0]>m[1][1] && m[0][0]>m[2][2]){ const sc=Math.sqrt(1+m[0][0]-m[1][1]-m[2][2])*2; w=(m[2][1]-m[1][2])/sc; x=0.25*sc; y=(m[0][1]+m[1][0])/sc; z=(m[0][2]+m[2][0])/sc; }
  else if(m[1][1]>m[2][2]){ const sc=Math.sqrt(1+m[1][1]-m[0][0]-m[2][2])*2; w=(m[0][2]-m[2][0])/sc; x=(m[0][1]+m[1][0])/sc; y=0.25*sc; z=(m[1][2]+m[2][1])/sc; }
  else { const sc=Math.sqrt(1+m[2][2]-m[0][0]-m[1][1])*2; w=(m[1][0]-m[0][1])/sc; x=(m[0][2]+m[2][0])/sc; y=(m[1][2]+m[2][1])/sc; z=0.25*sc; }
  return [x,y,z,w];
}
function cgQuatToMat(q){
  const [x,y,z,w]=q;
  return [
    [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
    [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
    [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)],
  ];
}
function cgSlerp(a,b,t){
  let dot=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];
  let bb=b;
  if(dot<0){ dot=-dot; bb=b.map(v=>-v); }
  if(dot>0.9995){
    const r=a.map((v,i)=>v+(bb[i]-v)*t), len=Math.hypot(...r)||1;
    return r.map(v=>v/len);
  }
  const th0=Math.acos(dot), th=th0*t, sinTh0=Math.sin(th0), sinTh=Math.sin(th);
  const s0=Math.cos(th)-dot*sinTh/sinTh0, s1=sinTh/sinTh0;
  return a.map((v,i)=>v*s0+bb[i]*s1);
}

/* ------------------------------- cubo/popup ------------------------------- */
const CORNER_LIST = [];
for(const sx of [-1,1]) for(const sy of [-1,1]) for(const sz of [-1,1]) CORNER_LIST.push({sx,sy,sz});

const popupCanvas = document.getElementById('cornerPopupCanvas');
const pctx = popupCanvas ? popupCanvas.getContext('2d') : null;

let popupRot = cgIdentity();     // orientação atual do cubo no popup (linha-major)
let popupHoverIdx = null;        // índice (em CORNER_LIST) do canto sob o mouse, ou null
let popupDragging = false, popupDragPrev = null;
let popupAnimating = false;
// Rodada 15: zoom do cubo 3D interativo (roda do mouse sobre o popup) — multiplica CG_SCALE em
// popupProject()/renderCornerPopup().
let popupZoom = 1;
const POPUP_ZOOM_MIN = 0.35, POPUP_ZOOM_MAX = 5;
// Rodada 16: pan (arraste com o botão do MEIO, só dentro do popup — nunca mexe na imagem
// principal) — deslocamento em pixels de tela somado à projeção (ver cgProject()/popupProject()).
let popupPanX = 0, popupPanY = 0;
let popupPanning = false, popupPanPrev = null;
// Rodada 16: fica true assim que popupRot já foi definida alguma vez de propósito (seja pela
// auto-seleção de canto — autoSelectCornerForGizmo() — seja pela primeira abertura do popup) —
// usada só para decidir se openCornerPopup() ainda precisa alinhar com o gizmo na hora de abrir;
// depois disso o zoom e a rotação ficam preservados entre fechar/abrir (pedido do usuário).
let popupRotInitialized = false;

/* ------------------------- Rodada 20 (2026-09-09): gimbal de arraste ------------------------- */
// Pedido do usuário: pegar o eixo do gizmo da imagem principal que estiver mais próximo da
// vertical e usá-lo como REFERÊNCIA fixa do cubo interativo — "fixe-o para que sempre fique na
// vertical no cubo 3D interativo" — e então só permitir 2 giros a partir dele: em torno de si
// mesmo (arraste horizontal) e em torno de um eixo perpendicular a ele, paralelo à LARGURA da
// tela (arraste vertical). Isso troca o "arcball" livre de antes (cada frame pré-multiplicava
// cgRotX(dy)/cgRotY(dx) em espaço de tela — rodada 19) por um gimbal de 2 eixos:
//   - arraste HORIZONTAL gira em torno do PRÓPRIO eixo de referência (ele não se move na tela, só
//     o resto do cubo gira ao redor dele);
//   - arraste VERTICAL inclina o eixo de referência em torno do eixo FIXO da largura da tela
//     (câmera-espaço X, que nunca muda) — como toda rotação em torno de um eixo mantém constante
//     a componente do vetor girado ao longo desse eixo, e o eixo de referência começa
//     PERPENDICULAR a ele, ele nunca sai do plano perpendicular a essa largura ("forma um disco").
// Ângulos (yaw/pitch) são acumulados e a rotação final é recalculada do ZERO a cada frame a partir
// de uma base fixa (popupBaseRot) — não por pré-multiplicação incremental — para não acumular
// deriva ("roll") depois de muitos arrastes (rotações em eixos diferentes não comutam).
const PITCH_AXIS_CAM = [1,0,0]; // eixo paralelo à LARGURA da câmera/tela — fixo, nunca muda.
let popupRefAxisWorld = [0,1,0]; // eixo do MUNDO tomado como referência (o mais vertical no gizmo
                                  // da imagem principal) — recalculado só quando o popup (re)alinha
                                  // com o gizmo (ver computeReferenceAxisWorld()/initialPopupRotation()).
let popupBaseRot = cgIdentity();  // orientação-base sobre a qual yaw/pitch são aplicados do zero —
                                   // já NIVELADA para que popupRefAxisWorld caia EXATAMENTE vertical
                                   // nela (ver levelBaseRotToReferenceAxis()), não só aproximadamente.
let popupRefAxisCam = [0,-1,0];   // direção do eixo de referência em espaço de câmera, NA BASE atual
                                   // (exatamente (0,-1,0) logo após o nivelamento).
let popupYaw = 0, popupPitch = 0; // ângulos acumulados desde a última resyncPopupGimbal().
// Rodada 22 (2026-09-09): pedido do usuário — girando na vertical o bastante, a seta do eixo de
// referência passa de apontar para CIMA a apontar para BAIXO na tela (o giro em pitch atravessou a
// horizontal); a partir daí, o MESMO arraste horizontal (mesmo dx) passa a girar visualmente no
// sentido CONTRÁRIO ao de antes — o que é esperado geometricamente (é como olhar um pião girando
// por baixo em vez de por cima: o sentido aparente se inverte, embora a rotação real em torno do
// eixo continue a mesma). Em vez de tentar "desfazer" essa inversão continuamente durante o
// arraste, o usuário pediu que soltar o clique e clicar de novo já corrija o sentido — então
// popupYawSign é recalculado A CADA mousedown (não a cada frame), conferindo se a seta aponta para
// cima ou para baixo NAQUELE momento (ver mousedown do popupCanvas, mais abaixo) e invertendo o
// sinal usado em popupYaw quando ela estiver de cabeça para baixo.
let popupYawSign = 1;

// Entre os 3 eixos do mundo (x/y/z), escolhe o que aparece mais próximo da VERTICAL no gizmo da
// imagem principal (menor componente horizontal em espaço de câmera, mesma convenção de
// projectWorldPoint()/cgProject() — ver rodada 18), e devolve esse eixo com o sinal que aponta
// para CIMA na imagem (+Y de câmera aponta para BAIXO na imagem, então inverte se pc[1]>0).
function computeReferenceAxisWorld(){
  const c = state.calib;
  if(!c) return [0,1,0];
  let bestLetter='y', bestScore=Infinity;
  ['x','y','z'].forEach(letter=>{
    const pc = M3.mulVec(c.R_wc, axisUnitVec(letter));
    const score = Math.abs(pc[0]) / Math.max(Math.abs(pc[1]), 1e-9); // menor = mais vertical
    if(score < bestScore){ bestScore = score; bestLetter = letter; }
  });
  let v = axisUnitVec(bestLetter);
  if(M3.mulVec(c.R_wc, v)[1] > 0) v = V3.neg(v);
  return v;
}
// "Fixe-o para que sempre fique na vertical": R_cw alinha o eixo escolhido com a vertical só
// APROXIMADAMENTE (é só o eixo do mundo mais próximo disso, quase nunca exatamente vertical em
// espaço de câmera). Esta função aplica uma correção MÍNIMA (rotação de menor ângulo possível —
// eixo = normal ao plano formado pela direção atual e o alvo, ângulo = ângulo entre as duas) que
// leva a direção atual do eixo de referência para EXATAMENTE (0,-1,0) (vertical, apontando para
// cima na convenção deste arquivo), preservando ao máximo o resto da orientação (roll) herdada de
// R_cw — ou seja, o cubo continua parecido com o gizmo da imagem, só que agora com o eixo
// escolhido travado, de fato, na vertical.
function levelBaseRotToReferenceAxis(baseRot, refAxisWorld){
  const a = V3.norm(cgMatVec(baseRot, refAxisWorld));
  const b = [0,-1,0];
  const dot = Math.max(-1, Math.min(1, V3.dot(a,b)));
  if(dot > 1-1e-9) return baseRot; // já exatamente vertical — nada a corrigir
  let axis;
  if(dot < -1+1e-9){
    // 180° opostos — infinitos eixos de correção possíveis; qualquer um perpendicular a `b` serve.
    axis = (Math.abs(b[0])<0.9) ? V3.norm(V3.cross(b,[1,0,0])) : V3.norm(V3.cross(b,[0,0,1]));
  } else {
    axis = V3.norm(V3.cross(a,b));
  }
  const angle = Math.acos(dot);
  return cgMatMul(cgRotAxis(axis, angle), baseRot);
}
// Fixa popupBaseRot na orientação ATUAL do cubo (popupRot) e zera yaw/pitch — NÃO é chamada a cada
// arraste: yaw/pitch são acumulados de um arraste para o outro (soltar e arrastar de novo continua
// de onde parou, sem "resetar" nada, e sem risco de deriva — ver recomputePopupRotFromGimbal(),
// que recalcula do zero a partir da base a cada frame). Só é chamada em 2 momentos: (1) quando o
// popup (re)alinha com o gizmo da imagem (initialPopupRotation() já devolve a base NIVELADA — ver
// levelBaseRotToReferenceAxis() — então pitch=0 aí significa, de fato, "eixo de referência
// exatamente vertical", cumprindo o pedido do usuário); (2) depois de um "salto" para um canto
// (selectPopupCorner()/targetRotationForCorner()), que muda popupRot para uma orientação canônica
// arbitrária, não relacionada à base anterior — dali em diante, pitch=0 passa a significar "eixo
// de referência na direção em que ficou após o salto" (não necessariamente vertical), o que é
// esperado: o salto para canto é uma ação deliberada do usuário, independente do gimbal.
function resyncPopupGimbal(){
  popupBaseRot = popupRot;
  popupRefAxisCam = cgMatVec(popupBaseRot, popupRefAxisWorld);
  popupYaw = 0; popupPitch = 0;
}
function recomputePopupRotFromGimbal(){
  popupRot = cgMatMul(cgRotAxis(PITCH_AXIS_CAM, popupPitch), cgMatMul(cgRotAxis(popupRefAxisCam, popupYaw), popupBaseRot));
}

const CG_PROJ_D = 4.2;   // distância "câmera" da projeção simplificada do popup
const CG_CUBE_H = 1;     // meia-aresta do cubo, em coordenadas do popup (-1..1)
const CG_SCALE = 78;     // px por unidade de cubo, na tela do popup

// Projeção genérica (parametrizada por rotação/escala/dimensões do canvas de destino) — usada
// tanto pelo popup interativo (via popupProject(), ligada às globais popupRot/CG_SCALE/
// popupCanvas) quanto pela geração do ÍCONE do botão (updateCornerIcon()), que desenha a cena
// do zero num canvas pequeno dedicado em vez de reduzir uma captura do canvas grande (rodada 12
// — o downscale de imagem rasterizada é o que deixava o ícone borrado).
// Rodada 16: parâmetros opcionais offsetX/offsetY (em pixels de tela) — usados só pelo popup
// interativo (via popupProject(), pan com o botão do meio); o ícone do botão (updateCornerIcon())
// nunca os passa, então continua sempre centralizado.
function cgProject(v, rot, scale, canvasW, canvasH, offsetX, offsetY){
  const r = cgMatVec(rot, v);
  const k = CG_PROJ_D/(CG_PROJ_D - r[2]);
  // Rodada 18 (2026-09-08): era "- r[1]*k*scale" (convenção Y-da-câmera-para-cima). Trocado para
  // "+ r[1]*k*scale" para bater com a convenção REAL usada em projectWorldPoint()/
  // worldToCamSpace() (calibration.js) — onde +Y da câmera aponta para BAIXO na imagem — já que
  // `rot` aqui é a MESMA R_cw da calibração (ver initialPopupRotation()). Sem essa correção, o
  // cubo 3D interativo desenhava com o eixo vertical espelhado em relação à imagem principal
  // (setas Y/Z de cabeça para baixo entre um gizmo e outro), embora usando a mesma rotação.
  return { x: canvasW/2 + (offsetX||0) + r[0]*k*scale, y: canvasH/2 + (offsetY||0) + r[1]*k*scale };
}
function popupProject(v){ return cgProject(v, popupRot, CG_SCALE*popupZoom, popupCanvas.width, popupCanvas.height, popupPanX, popupPanY); }

// As 3 quadras (1/4 de cada face adjacente ao canto c={sx,sy,sz}) que formam o destaque visual
// desse canto — tanto no popup (fillQuadInPopup) quanto, com a mesma geometria mas em unidades
// de mundo reais, na guia desenhada sobre a imagem principal (drawCornerGuideOnMain()).
function cornerQuarterFaceQuads(c, h){
  return [
    [[c.sx*h,0,0],[c.sx*h,c.sy*h,0],[c.sx*h,c.sy*h,c.sz*h],[c.sx*h,0,c.sz*h]], // face x=sx*h
    [[0,c.sy*h,0],[c.sx*h,c.sy*h,0],[c.sx*h,c.sy*h,c.sz*h],[0,c.sy*h,c.sz*h]], // face y=sy*h
    [[0,0,c.sz*h],[c.sx*h,0,c.sz*h],[c.sx*h,c.sy*h,c.sz*h],[0,c.sy*h,c.sz*h]], // face z=sz*h
  ];
}
function fillQuad(targetCtx, projectFn, quad, color){
  targetCtx.beginPath();
  quad.forEach((v,i)=>{ const p=projectFn(v); if(i===0) targetCtx.moveTo(p.x,p.y); else targetCtx.lineTo(p.x,p.y); });
  targetCtx.closePath(); targetCtx.fillStyle=color; targetCtx.fill();
}
function drawCornerQuarters(targetCtx, projectFn, cubeH, hoverIdx){
  const sel = state.cornerGuide.selected;
  // BUG CORRIGIDO (rodada 14, achado ao investigar o ícone): state.cornerGuide.selected usa as
  // chaves {x,y,z} (mesmo formato usado em drawCornerGuideOnMain()/drawCornerGuideGridInScene()),
  // mas cornerQuarterFaceQuads() espera {sx,sy,sz} (formato de CORNER_LIST) — passar `sel` direto
  // fazia c.sx/c.sy/c.sz ficarem `undefined`, e undefined*h=NaN: o destaque VERDE do canto
  // selecionado nunca aparecia de fato no popup/ícone (só o amarelo do hover, que já convertia
  // corretamente logo abaixo). Corrigido convertendo sel->{sx,sy,sz} antes de chamar a função.
  if(sel) cornerQuarterFaceQuads({sx:sel.x,sy:sel.y,sz:sel.z}, cubeH).forEach(q=>fillQuad(targetCtx, projectFn, q,'rgba(62,207,142,0.30)'));
  if(hoverIdx!=null){
    const t = CORNER_LIST[hoverIdx];
    if(!sel || t.sx!==sel.x || t.sy!==sel.y || t.sz!==sel.z)
      cornerQuarterFaceQuads({sx:t.sx,sy:t.sy,sz:t.sz}, cubeH).forEach(q=>fillQuad(targetCtx, projectFn, q,'rgba(255,224,102,0.30)'));
  }
}
// Rodada 14 — pedido do usuário: além do destaque amarelo/verde do canto, mostrar no cubo
// interativo um PREVIEW de como a guia "Canto" vai ficar desenhada sobre a imagem principal —
// mesma lógica de drawCornerGuideOnMain() (mais abaixo, mundo/imagem real), só que em
// coordenadas LOCAIS do cubo (0..cubeH) e via `projectFn` genérico em vez de projectWorldSegment.
function drawCornerGuideGridInScene(targetCtx, projectFn, cubeH, sel, lineWidth){
  if(!sel) return;
  const unit = cubeH/3, N=6;
  const AX = {x:0,y:1,z:2};
  targetCtx.save();
  targetCtx.strokeStyle='rgba(255,255,255,0.55)'; targetCtx.lineWidth=lineWidth;
  function edge(P1,P2){
    const a=projectFn(P1), b=projectFn(P2);
    targetCtx.beginPath(); targetCtx.moveTo(a.x,a.y); targetCtx.lineTo(b.x,b.y); targetCtx.stroke();
  }
  [{n:'x',a:'y',b:'z'},{n:'y',a:'x',b:'z'},{n:'z',a:'x',b:'y'}].forEach(({n,a,b})=>{
    for(let i=0;i<=N;i++){
      const ta=i*unit*sel[a], tb=i*unit*sel[b];
      const P1=[0,0,0], P2=[0,0,0];
      P1[AX[n]]=0; P1[AX[a]]=ta; P1[AX[b]]=0;
      P2[AX[n]]=0; P2[AX[a]]=ta; P2[AX[b]]=N*unit*sel[b];
      edge(P1,P2);
      const P3=[0,0,0], P4=[0,0,0];
      P3[AX[n]]=0; P3[AX[b]]=tb; P3[AX[a]]=0;
      P4[AX[n]]=0; P4[AX[b]]=tb; P4[AX[a]]=N*unit*sel[a];
      edge(P3,P4);
    }
  });
  targetCtx.restore();
}
// Setas do gizmo do cubo interativo — usam axisUnitVec() (calibration.js), a MESMA função/
// convenção (incluindo a inversão visual do eixo Y) usada pelo gizmo desenhado sobre a imagem
// principal, para que as cores/direções batam exatamente entre os dois (ver openCornerPopup()
// e initialPopupRotation() para a rotação inicial que faz a orientação também bater).
// Cópia de drawChevronHead() (canvas-render.js — mesmo gizmo desenhado sobre a foto), só que
// parametrizada por um ctx qualquer (a original usa sempre o `ctx` fixo da imagem principal, não
// dá para chamá-la direto aqui, que desenha em canvases separados — popup/ícone). Pedido do
// usuário (rodada 14): "use uma cópia do gizmo da imagem de projeto para que as orientações das
// setas dos eixos sejam as mesmas" — mesmo visual (cabeça de seta aberta), não só a mesma direção.
function cgDrawChevronHead(targetCtx, sFrom, sTip, color, size){
  const ang = Math.atan2(sTip.y-sFrom.y, sTip.x-sFrom.x);
  const hs = size, spread = 0.5;
  targetCtx.save();
  targetCtx.strokeStyle = color; targetCtx.lineWidth = Math.max(1, size*0.24); targetCtx.lineCap='round'; targetCtx.lineJoin='round';
  targetCtx.setLineDash([]);
  targetCtx.beginPath();
  targetCtx.moveTo(sTip.x-hs*Math.cos(ang-spread), sTip.y-hs*Math.sin(ang-spread));
  targetCtx.lineTo(sTip.x, sTip.y);
  targetCtx.lineTo(sTip.x-hs*Math.cos(ang+spread), sTip.y-hs*Math.sin(ang+spread));
  targetCtx.stroke();
  targetCtx.restore();
}
function drawGizmoArrows(targetCtx, projectFn, cubeH, lineWidth, fontPx, drawLabels){
  const O = projectFn([0,0,0]);
  ['x','y','z'].forEach(letter=>{
    const dir = (typeof axisUnitVec==='function') ? axisUnitVec(letter) : {x:[1,0,0],y:[0,1,0],z:[0,0,1]}[letter];
    const tip = projectFn(dir.map(v=>v*cubeH*1.35));
    targetCtx.strokeStyle = AXIS_LETTER_COLOR[letter]; targetCtx.lineWidth=lineWidth;
    targetCtx.beginPath(); targetCtx.moveTo(O.x,O.y); targetCtx.lineTo(tip.x,tip.y); targetCtx.stroke();
    cgDrawChevronHead(targetCtx, O, tip, AXIS_LETTER_COLOR[letter], Math.max(3, lineWidth*2.2));
    if(drawLabels){
      targetCtx.fillStyle = AXIS_LETTER_COLOR[letter]; targetCtx.font=`bold ${fontPx}px sans-serif`;
      targetCtx.textAlign='center'; targetCtx.textBaseline='middle';
      targetCtx.fillText(letter.toUpperCase(), tip.x+(tip.x-O.x)*0.14, tip.y+(tip.y-O.y)*0.14);
    }
  });
}
// Desenha a cena inteira do cubo (quadras de destaque, arestas, gizmo, marcadores de canto) num
// canvas/projeção quaisquer — parametrizada (rodada 12) para ser reaproveitada tanto pelo popup
// interativo (canvas grande, com hover) quanto pela geração do ÍCONE do botão (canvas pequeno
// dedicado, sem hover) sem depender de reduzir uma imagem já desenhada (o que borrava o ícone).
function renderCubeSceneTo(targetCtx, canvasW, canvasH, rot, scale, cubeH, opts){
  opts = opts || {};
  // Rodada 16: opts.panX/panY (pan do popup interativo com o botão do meio) — o ícone do botão
  // não os passa, então segue sempre centralizado.
  const projectFn = (v)=>cgProject(v, rot, scale, canvasW, canvasH, opts.panX, opts.panY);
  const hoverIdx = opts.hoverIdx!=null ? opts.hoverIdx : null;
  const edgeLineWidth = opts.edgeLineWidth!=null ? opts.edgeLineWidth : 1.1;
  const gizmoLineWidth = opts.gizmoLineWidth!=null ? opts.gizmoLineWidth : 2;
  const fontPx = opts.fontPx!=null ? opts.fontPx : 11;
  const drawLabels = opts.drawLabels!==false;
  const drawMarkers = opts.drawMarkers!==false;
  targetCtx.clearRect(0,0,canvasW,canvasH);
  drawCornerQuarters(targetCtx, projectFn, cubeH, hoverIdx);
  drawCornerGuideGridInScene(targetCtx, projectFn, cubeH, state.cornerGuide.selected, Math.max(0.6, edgeLineWidth*0.7));
  // arestas do cubo — mesmo estilo visual (linhas finas brancas) da Guia 3D "Caixa"
  const P = CORNER_LIST.map(c=>projectFn([c.sx*cubeH, c.sy*cubeH, c.sz*cubeH]));
  targetCtx.strokeStyle='rgba(255,255,255,0.85)'; targetCtx.lineWidth=edgeLineWidth;
  CORNER_LIST.forEach((c,i)=>{
    ['sx','sy','sz'].forEach(axis=>{
      const c2=Object.assign({},c); c2[axis]=-c2[axis];
      const j = CORNER_LIST.findIndex(o=>o.sx===c2.sx&&o.sy===c2.sy&&o.sz===c2.sz);
      if(j>i){ targetCtx.beginPath(); targetCtx.moveTo(P[i].x,P[i].y); targetCtx.lineTo(P[j].x,P[j].y); targetCtx.stroke(); }
    });
  });
  drawGizmoArrows(targetCtx, projectFn, cubeH, gizmoLineWidth, fontPx, drawLabels);
  if(drawMarkers){
    CORNER_LIST.forEach((c,i)=>{
      const sel = state.cornerGuide.selected;
      const isSel = sel && sel.x===c.sx && sel.y===c.sy && sel.z===c.sz;
      const isHover = hoverIdx===i;
      if(!isSel && !isHover) return;
      const p=P[i];
      targetCtx.beginPath(); targetCtx.arc(p.x,p.y, isHover?6:5, 0, Math.PI*2);
      targetCtx.fillStyle = isSel? '#3ecf8e' : '#ffe066'; targetCtx.fill();
      targetCtx.lineWidth=1.2; targetCtx.strokeStyle='#000'; targetCtx.stroke();
    });
  }
}
function renderCornerPopup(){
  if(!pctx) return;
  renderCubeSceneTo(pctx, popupCanvas.width, popupCanvas.height, popupRot, CG_SCALE*popupZoom, CG_CUBE_H, {
    hoverIdx: popupHoverIdx, edgeLineWidth:1.1, gizmoLineWidth:2, fontPx:11, drawLabels:true, drawMarkers:true,
    panX: popupPanX, panY: popupPanY,
  });
}

function pickPopupCorner(mx,my){
  let best=-1, bestD=14;
  CORNER_LIST.forEach((c,i)=>{
    const p = popupProject([c.sx*CG_CUBE_H, c.sy*CG_CUBE_H, c.sz*CG_CUBE_H]);
    const d = Math.hypot(p.x-mx, p.y-my);
    if(d<bestD){ bestD=d; best=i; }
  });
  return best;
}

// Orientação-alvo (linha-major) que, aplicada ao cubo, deixa o canto `c` de frente para o
// "observador" (eixo +z do popup, após a rotação) — usada para animar suavemente até lá.
function targetRotationForCorner(c){
  const dir = V3.norm([c.sx, c.sy, c.sz]);
  let up = [0,1,0];
  if(Math.abs(V3.dot(up,dir))>0.98) up=[1,0,0];
  const zAxis = dir;
  const xAxis = V3.norm(V3.cross(up, zAxis));
  const yAxis = V3.cross(zAxis, xAxis);
  return [xAxis, yAxis, zAxis]; // linhas da matriz
}
// Rodada 14 — CORREÇÃO DE VERDADE do ícone "borrado"/"cortado": o problema não era só
// resolução — era que updateCornerIcon() sempre desenhava num canvas QUADRADO 56x56 e o CSS
// aplicava `background-size:cover` para caber no botão (#cornerGuideBtn), que é bem mais LARGO
// que ALTO (width:100% do painel esquerdo x height:40px) — 'cover' preenche a área toda cortando
// o que sobra dos lados, exatamente o efeito "cortado" relatado. Agora o canvas do ícone é
// desenhado no TAMANHO REAL do botão (medido com getBoundingClientRect()), multiplicado pelo
// devicePixelRatio (nitidez em telas retina/HiDPI), e o CSS usa '100% 100%' em vez de 'cover' —
// como as dimensões já batem exatas, não há mais corte nem distorção.
// Razão (escala do cubo / menor dimensão do canvas) calibrada para que NENHUM canto do cubo nem
// ponta de seta do gizmo (o alcance máximo, em qualquer rotação, é a diagonal do cubo — mais
// longe que a seta — multiplicada pelo fator de perspectiva CG_PROJ_D/(CG_PROJ_D-z), cujo pico
// numérico fica perto de 2.33x a diagonal) estoure a borda do canvas, com uma margem extra de
// ~15% — antes a proporção herdada do popup grande (CG_SCALE) deixava isso sem margem nenhuma,
// o que também contribuía pro "cortado" em certas rotações.
const CORNER_ICON_SAFE_SCALE_RATIO = 0.177;
function updateCornerIcon(rot){
  rot = rot || popupRot;
  const btn = document.getElementById('cornerGuideBtn');
  const dpr = window.devicePixelRatio || 1;
  const rect = btn ? btn.getBoundingClientRect() : null;
  const cssW = (rect && rect.width>4) ? rect.width : 40;
  const cssH = (rect && rect.height>4) ? rect.height : 40;
  const w = Math.max(16, Math.round(cssW*dpr)), h = Math.max(16, Math.round(cssH*dpr));
  const off = document.createElement('canvas'); off.width=w; off.height=h;
  const octx = off.getContext('2d');
  const iconScale = Math.min(w,h) * CORNER_ICON_SAFE_SCALE_RATIO;
  renderCubeSceneTo(octx, w, h, rot, iconScale, CG_CUBE_H, {
    hoverIdx: null, edgeLineWidth:1.6*dpr, gizmoLineWidth:2.6*dpr, drawLabels:false, drawMarkers:true,
  });
  const url = off.toDataURL('image/png');
  state.cornerGuide.iconDataURL = url;
  if(btn){ btn.style.backgroundImage = `url(${url})`; btn.style.backgroundSize='100% 100%'; btn.style.backgroundPosition='center'; btn.textContent=''; }
}
// Canto do cubo cuja direção fica mais de frente para a câmera, sob uma rotação `rot`
// (linha-major) qualquer — usada tanto para achar o canto "natural" dado o gizmo real da imagem
// (autoSelectCornerForGizmo()) quanto, no popup, é implicitamente o que já fica centralizado
// quando o usuário gira o cubo manualmente (não precisa ser chamada para isso).
function frontmostCorner(rot){
  let best=null, bestScore=-Infinity;
  CORNER_LIST.forEach(c=>{
    const dir = V3.norm([c.sx, c.sy, c.sz]);
    const r = cgMatVec(rot, dir);
    if(r[2] > bestScore){ bestScore = r[2]; best = c; }
  });
  return best;
}
// Aplica a seleção de canto `c` IMEDIATAMENTE (sem animar) — usada quando o checkbox "mover o
// cubo de forma animada" está desmarcado (padrão) e por autoSelectCornerForGizmo() (nunca faz
// sentido animar algo que o usuário não iniciou clicando no popup). Rodada 14: NÃO mexe mais em
// popupRot — o usuário pediu que, com a animação desligada, um clique num canto do popup marque
// a seleção (destaque verde + grade) SEM girar o cubo, mantendo a orientação em que ele estava
// (antes ainda "saltava" para a orientação canônica do canto via targetRotationForCorner()).
function applyCornerSelectionInstant(c){
  state.cornerGuide.selected = {x:c.sx, y:c.sy, z:c.sz};
  markDirty();
  renderCornerPopup();
  updateCornerIcon();
  render();
}
// Seleciona automaticamente, sem exigir que o usuário abra o popup, o canto do cubo mais alinhado
// com a orientação REAL do gizmo da imagem (mesma rotação usada para abrir o popup — ver
// initialPopupRotation()) — chamada pelo listener de '#guide3d' (ui-controls.js) ao trocar para
// "Canto" quando ainda não há canto escolhido.
function autoSelectCornerForGizmo(){
  const rot = initialPopupRotation();
  const c = frontmostCorner(rot);
  alignPopupGimbalTo(rot);
  popupRotInitialized = true; // Rodada 16: já alinhado com o gizmo — openCornerPopup() não mexe mais nisso
  state.cornerGuide.selected = {x:c.sx, y:c.sy, z:c.sz};
  markDirty();
  updateCornerIcon(rot);
}
// Anima (nunca "salta") a rotação do popup até a orientação canônica do canto `c`, então marca
// o canto como selecionado, atualiza o ícone do botão e redesenha a guia na imagem principal —
// a janelinha permanece aberta (fechar é só ao clicar FORA dela, ver listener mais abaixo).
function selectPopupCorner(c){
  if(popupAnimating) return;
  // Rodada 13: com o checkbox "mover o cubo de forma animada" desmarcado (padrão), seleciona na
  // hora, sem girar o cubo — só quando marcado é que a animação suave abaixo roda.
  const animateChk = document.getElementById('cornerPopupAnimateChk');
  if(!animateChk || !animateChk.checked){ applyCornerSelectionInstant(c); return; }
  const q0 = cgMatToQuat(popupRot);
  const q1 = cgMatToQuat(targetRotationForCorner(c));
  popupAnimating = true;
  const dur = 420, t0 = performance.now();
  function step(now){
    const t = Math.min(1, (now-t0)/dur);
    const te = t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; // easeInOutQuad
    popupRot = cgQuatToMat(cgSlerp(q0,q1,te));
    renderCornerPopup();
    if(t<1) requestAnimationFrame(step);
    else {
      // Rodada 20: ao terminar o salto, fixa a orientação canônica do canto como nova BASE do
      // gimbal de arraste (ver alignPopupGimbalTo()/resyncPopupGimbal()) — assim, um arraste
      // manual logo em seguida continua suavemente a partir daqui, em vez de "esquecer" o salto
      // na próxima vez que popupYaw/popupPitch forem aplicados.
      alignPopupGimbalTo(targetRotationForCorner(c));
      popupAnimating = false;
      state.cornerGuide.selected = {x:c.sx, y:c.sy, z:c.sz};
      markDirty();
      renderCornerPopup();
      updateCornerIcon();
      render(); // atualiza também a guia de canto desenhada na imagem principal
    }
  }
  requestAnimationFrame(step);
}

/* ------------------------------ abrir/fechar popup ------------------------------ */
// Orientação inicial do cubo ao abrir o popup: reproduz a orientação mundo->câmera REAL da
// calibração atual (state.calib.R_cw), para que os cantos do cubo interativo correspondam
// visualmente aos mesmos cantos/direções do gizmo desenhado sobre a imagem (rodada 12 — antes
// o popup sempre abria "zerado", numa orientação genérica sem relação com a câmera calibrada).
// Prova de que R_cw (armazenado como colunas, convenção de math3d.js) pode ser usado DIRETO como
// matriz linha-major em cgMatVec(): por definição R_cw = M3.transpose(R_wc); expandindo os
// índices dos dois lados, cgMatVec(M3.transpose(M), v) é algebricamente idêntico a
// M3.mulVec(M, v) para qualquer M e v — ou seja, aplicar R_cw via cgMatVec() reproduz
// exatamente M3.mulVec(R_wc, v), a transformação mundo->câmera real usada em todo o resto do
// app (ver worldToCamSpace() em calibration.js).
function initialPopupRotation(){
  const c = state.calib;
  // Rodada 20: também (re)computa o eixo de referência do gimbal de arraste (popupRefAxisWorld) —
  // este é o único lugar onde o popup de fato "alinha com o gizmo" da imagem principal, então é o
  // momento certo de recalcular qual eixo do mundo serve de referência (ver
  // computeReferenceAxisWorld()) — e NIVELA o resultado para que esse eixo caia EXATAMENTE
  // vertical (ver levelBaseRotToReferenceAxis()), em vez de só aproximadamente como R_cw sozinho
  // garantiria — "fixe-o para que sempre fique na vertical no cubo 3D interativo" (pedido do
  // usuário).
  popupRefAxisWorld = computeReferenceAxisWorld();
  const raw = (c && c.R_cw) ? c.R_cw : cgIdentity();
  return levelBaseRotToReferenceAxis(raw, popupRefAxisWorld);
}
// Chamada nos 2 momentos descritos no comentário de resyncPopupGimbal(): logo após obter uma nova
// orientação "de base" para o cubo (alinhamento com o gizmo, ou fim de um salto para canto) — fixa
// essa orientação como base do gimbal e zera yaw/pitch, para que arrastes seguintes girem a partir
// dali em torno do eixo de referência (ver resyncPopupGimbal()).
function alignPopupGimbalTo(rot){
  popupRot = rot;
  resyncPopupGimbal();
}
function openCornerPopup(){
  // Rodada 21 (2026-09-09): pedido do usuário — a checagem de qual eixo do mundo é a referência
  // (o mais vertical no gizmo da imagem) deve ser refeita toda vez que a janela do cubo 3D
  // interativo é ABERTA, não só na primeiríssima vez (como a rodada 16 tinha deixado) — porque o
  // usuário pode trocar os eixos 1/2 dos pontos de fuga, ou girar a calibração o bastante para que
  // outro eixo passe a ser o mais vertical, ENQUANTO o popup estava fechado; sempre precisa haver
  // um eixo fixo, e tem que ser o CORRETO para a calibração atual. initialPopupRotation() sempre
  // recomputa popupRefAxisWorld (efeito colateral) — comparamos com o valor de ANTES de chamá-la
  // para saber se o eixo de referência realmente mudou.
  const prevRefAxis = popupRefAxisWorld;
  const rot = initialPopupRotation();
  const axisChanged = !popupRotInitialized || V3.dot(popupRefAxisWorld, prevRefAxis) < 0.999999;
  if(axisChanged){
    // Eixo novo (ou primeira vez): realinha e reseta a rotação manual — ela não faz mais sentido
    // em torno de um eixo que não é mais a referência. Se o eixo é o MESMO de antes, a rotação
    // manual do usuário continua preservada entre fechar/abrir, como já era (rodada 16).
    alignPopupGimbalTo(rot);
    popupRotInitialized = true;
  }
  document.getElementById('cornerPopupOverlay').classList.remove('hidden');
  renderCornerPopup();
}
function closeCornerPopup(){
  document.getElementById('cornerPopupOverlay').classList.add('hidden');
}
const cornerPopupOverlayEl = document.getElementById('cornerPopupOverlay');
// Rastreamento manual de onde o mousedown/mouseup aconteceram (em vez do evento nativo 'click',
// cujo alvo é o elemento sob o MOUSEUP — isso fechava a janela quando um arraste que COMEÇAVA
// dentro dela, ex.: girar o cubo, terminava solto por cima do fundo escurecido, fora da caixa).
// Só fecha quando os DOIS (mousedown e mouseup) acontecem diretamente no fundo (não na caixa/
// canvas) — um clique/arraste que começou dentro nunca fecha a janela por conta própria.
let cgOverlayDownTarget = null;
if(cornerPopupOverlayEl){
  cornerPopupOverlayEl.addEventListener('mousedown', (e)=>{
    // Rodada 13: botão do MEIO no fundo escurecido não fecha o popup — inicia um pan da imagem
    // principal por trás dele (reaproveita isPanning/panStart/panOrigin/viewport, globais de
    // canvas-render.js; o listener de 'mousemove'/'mouseup' em window de lá já cuida do resto),
    // pedido do usuário para poder reenquadrar a foto sem fechar a janela.
    if(e.button===1){
      const rect = viewport.getBoundingClientRect();
      isPanning = true;
      panStart = [e.clientX-rect.left, e.clientY-rect.top];
      panOrigin = [state.panX, state.panY];
      e.preventDefault();
      return;
    }
    cgOverlayDownTarget = e.target;
  });
  cornerPopupOverlayEl.addEventListener('mouseup', (e)=>{
    if(e.button===1) return; // pan com o botão do meio, tratado acima — nunca fecha o popup.
    if(cgOverlayDownTarget && cgOverlayDownTarget.id==='cornerPopupOverlay' && e.target.id==='cornerPopupOverlay'){
      closeCornerPopup();
    }
    cgOverlayDownTarget = null;
  });
  // Botão do meio do mouse dispara 'auxclick' em vez de abrir o menu de contexto do navegador em
  // alguns casos — e o 'contextmenu' de qualquer botão não deve aparecer sobre o popup.
  cornerPopupOverlayEl.addEventListener('contextmenu', (e)=>e.preventDefault());
  // Rodada 24 (2026-09-09): roda do mouse sobre o fundo escurecido (fora da caixa do cubo) continua
  // dando zoom na imagem principal — ver histórico completo no topo deste arquivo e a nova
  // zoomMainImageAt() em canvas-render.js. e.target.id==='cornerPopupOverlay' é o mesmo teste já
  // usado no mouseup acima para "clique fora da caixa"; dentro da caixa (canvas, texto, botões),
  // e.target é outro elemento, então este listener não faz nada — o zoom do CUBO em si continua
  // sendo tratado pelo listener 'wheel' de popupCanvas (rodada 15, mais abaixo), sem mudança.
  cornerPopupOverlayEl.addEventListener('wheel', (e)=>{
    if(e.target.id!=='cornerPopupOverlay') return;
    e.preventDefault();
    zoomMainImageAt(e.clientX, e.clientY, e.deltaY);
  }, { passive:false });
}
const cornerPopupCloseBtnEl = document.getElementById('cornerPopupCloseBtn');
if(cornerPopupCloseBtnEl){
  cornerPopupCloseBtnEl.addEventListener('click', (e)=>{ e.stopPropagation(); closeCornerPopup(); });
}
// Rodada 16: o botão do meio do mouse deve afetar SÓ o cubo 3D interativo quando o clique começa
// dentro da janela do popup (#cornerPopupBox) — nunca a imagem principal atrás. Antes, como o
// canvas é filho do fundo escurecido (#cornerPopupOverlay) e o mousedown do canvas não parava a
// propagação para botão 1, o listener do fundo (acima) também disparava o pan da imagem
// principal ao mesmo tempo que o próprio canvas tentava girar/arrastar o cubo. Parar aqui, no
// nível da CAIXA inteira (não só do canvas), cobre qualquer clique do meio que comece dentro dela
// (canvas, checkbox, texto, botão fechar) — só o clique do meio no fundo, FORA da caixa, chega
// ao listener do overlay e move a imagem principal, como pedido.
const cornerPopupBoxEl = document.getElementById('cornerPopupBox');
if(cornerPopupBoxEl){
  cornerPopupBoxEl.addEventListener('mousedown', (e)=>{ if(e.button===1) e.stopPropagation(); });
}
// Rodada 16: "cursor infinito" para o arraste do cubo 3D interativo (rotação com botão esquerdo e
// pan com botão do meio) — usa a Pointer Lock API: o cursor do SO fica invisível e travado, e os
// eventos 'mousemove' passam a reportar só o DELTA do movimento (e.movementX/Y), não mais a
// posição absoluta — então não há mais limite de tela para continuar arrastando (o usuário pode
// mover o mouse fisicamente para sempre no mesmo sentido sem o cursor "bater na borda"). Sem
// pointer lock disponível (ou se o pedido falhar), cai no cálculo de delta antigo (clientX/Y).
function requestPopupPointerLock(){
  if(popupCanvas.requestPointerLock){ try{ popupCanvas.requestPointerLock(); }catch(err){} }
}
document.addEventListener('pointerlockchange', ()=>{
  // Saída inesperada do pointer lock (ex.: usuário apertou Esc) — encerra qualquer arraste em
  // andamento para não deixar popupDragging/popupPanning "presos" em true.
  if(document.pointerLockElement!==popupCanvas){ popupDragging=false; popupPanning=false; }
});

if(popupCanvas){
  popupCanvas.addEventListener('mousedown', (e)=>{
    if(popupAnimating) return;
    const rect=popupCanvas.getBoundingClientRect();
    const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    if(e.button===1){
      // Rodada 16: botão do meio DENTRO do popup = pan da VISTA DO CUBO (nunca a imagem
      // principal — ver o stopPropagation() em #cornerPopupBox acima).
      popupPanning=true; popupPanPrev=[mx,my];
      requestPopupPointerLock();
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if(e.button!==0) return;
    const idx = pickPopupCorner(mx,my);
    if(idx>=0){ selectPopupCorner(CORNER_LIST[idx]); return; }
    // Rodada 22 (2026-09-09): pedido do usuário — recalcula popupYawSign a CADA novo clique
    // (mousedown), não a cada frame do arraste. Verifica, NESTE instante, se a seta do eixo de
    // referência está apontando para cima (pc[1]<0, convenção de câmera com +Y para baixo — ver
    // cameraSpaceDir) ou para baixo (pc[1]>0) na tela. Enquanto aponta para cima, mantém o sentido
    // já corrigido pela rodada 20 (dx negativo gira yaw positivo); quando a seta já cruzou a
    // horizontal e aponta para baixo, inverte esse sinal — assim o arraste horizontal sempre "sente"
    // certo a partir do momento em que o usuário solta e clica de novo, mesmo com a seta de cabeça
    // para baixo (o giro real em torno do eixo continua o mesmo; só a direção aparente pedida pelo
    // usuário para o próximo arraste muda).
    const refAxisCamNow = cgMatVec(popupRot, popupRefAxisWorld);
    popupYawSign = (refAxisCamNow[1] <= 0) ? 1 : -1;
    popupDragging=true; popupDragPrev=[mx,my];
    requestPopupPointerLock();
  });
  popupCanvas.addEventListener('mousemove', (e)=>{
    // Rodada 16: também ignora durante o pan (popupPanning) — com o pointer lock ativo, clientX/Y
    // ficam congelados na posição do lock, então testar hover contra eles aqui só produziria
    // resultados errados/obsoletos.
    if(popupDragging || popupPanning || popupAnimating) return;
    const rect=popupCanvas.getBoundingClientRect();
    const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    const idx = pickPopupCorner(mx,my);
    if(idx!==popupHoverIdx){ popupHoverIdx = idx>=0?idx:null; renderCornerPopup(); }
  });
  popupCanvas.addEventListener('mouseleave', ()=>{
    if(popupHoverIdx!=null && !popupDragging){ popupHoverIdx=null; renderCornerPopup(); }
  });
  window.addEventListener('mousemove', (e)=>{
    if(popupAnimating) return;
    const locked = document.pointerLockElement===popupCanvas;
    if(popupPanning){
      let dx, dy;
      if(locked){ dx=e.movementX; dy=e.movementY; }
      else { const rect=popupCanvas.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top; dx=mx-popupPanPrev[0]; dy=my-popupPanPrev[1]; popupPanPrev=[mx,my]; }
      popupPanX+=dx; popupPanY+=dy;
      renderCornerPopup();
      return;
    }
    if(!popupDragging) return;
    let dx, dy;
    if(locked){ dx=e.movementX; dy=e.movementY; }
    else { const rect=popupCanvas.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top; dx=mx-popupDragPrev[0]; dy=my-popupDragPrev[1]; popupDragPrev=[mx,my]; }
    const k=0.008;
    // Rodada 20 (2026-09-09): pedido do usuário — trocar o "arcball" livre (rodadas 16/19, cada
    // frame pré-multiplicava cgRotX(dy)/cgRotY(dx) em espaço de TELA) por um gimbal de 2 eixos
    // preso ao EIXO DE REFERÊNCIA do gizmo da imagem principal (ver bloco "gimbal de arraste", bem
    // acima, e computeReferenceAxisWorld()/levelBaseRotToReferenceAxis()): arraste horizontal (dx)
    // gira em torno do PRÓPRIO eixo de referência (popupRefAxisCam, fixo desde o último
    // alignPopupGimbalTo()); arraste vertical (dy) inclina esse eixo em torno do eixo FIXO
    // paralelo à LARGURA da tela (PITCH_AXIS_CAM=(1,0,0)) — nunca em torno do eixo já inclinado,
    // então o eixo de referência nunca sai do plano perpendicular à largura da tela. yaw/pitch são
    // ACUMULADOS (não resetados a cada arraste) e a rotação final é recalculada do zero a cada
    // frame (recomputePopupRotFromGimbal()), nunca por pré-multiplicação incremental — sem isso,
    // a composição de muitos incrementos pequenos em eixos diferentes (que não comutam) desvia aos
    // poucos o eixo de referência da vertical, mesmo partindo de uma base exatamente nivelada.
    // Sinais escolhidos para reproduzir o MESMO sentido de giro que a rodada 19 já tinha corrigido
    // (cgRotAxis((1,0,0),a)===cgRotX(a) exatamente; e como popupRefAxisCam aponta para CIMA
    // — pc[1]<0 — cgRotAxis(popupRefAxisCam,yaw) ≈ cgRotY(-yaw), daí o sinal trocado em dx).
    // Rodada 22 (2026-09-09): multiplica por popupYawSign, calculado no mousedown (não aqui) —
    // ver comentário no listener 'mousedown' do popupCanvas, acima.
    popupYaw += -dx*k*popupYawSign;
    popupPitch += -dy*k;
    recomputePopupRotFromGimbal();
    renderCornerPopup();
  });
  window.addEventListener('mouseup', ()=>{
    popupDragging=false; popupPanning=false;
    if(document.pointerLockElement===popupCanvas) document.exitPointerLock();
  });
  // Rodada 15: zoom do cubo 3D interativo com a roda do mouse — pedido do usuário ("Deve ser
  // possível dar zoom no cubo 3D interativo"). preventDefault() evita rolar a página por trás.
  popupCanvas.addEventListener('wheel', (e)=>{
    if(popupAnimating) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY*0.0015);
    popupZoom = Math.min(POPUP_ZOOM_MAX, Math.max(POPUP_ZOOM_MIN, popupZoom*factor));
    renderCornerPopup();
  }, { passive:false });
}

/* --------------------- Guia de canto na IMAGEM PRINCIPAL --------------------- */
// Desenha, a partir da origem do gizmo (world = [0,0,0]), 3 grades formando um "canto de sala" —
// cada plano passa pela origem e se estende apenas no quadrante (sinais) do canto escolhido, nos
// seus 2 eixos "no plano" (nunca no eixo normal a ele, que fica sempre em 0). Chamada por
// draw3DGuide() em canvas-render.js quando state.guide3d==='corner'.
function drawCornerGuideOnMain(){
  const sel = state.cornerGuide.selected; if(!sel) return;
  const arrowLen = gizmoArrowLength(), unit = arrowLen/2, N=6;
  const AX = {x:0,y:1,z:2};
  ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=0.75;
  function edge(P1,P2){
    const seg = projectWorldSegment(P1,P2); if(!seg) return;
    ctx.beginPath(); ctx.moveTo(seg[0][0],seg[0][1]); ctx.lineTo(seg[1][0],seg[1][1]); ctx.stroke();
  }
  [{n:'x',a:'y',b:'z'},{n:'y',a:'x',b:'z'},{n:'z',a:'x',b:'y'}].forEach(({n,a,b})=>{
    for(let i=0;i<=N;i++){
      const ta=i*unit*sel[a], tb=i*unit*sel[b];
      const P1=[0,0,0], P2=[0,0,0];
      P1[AX[n]]=0; P1[AX[a]]=ta; P1[AX[b]]=0;
      P2[AX[n]]=0; P2[AX[a]]=ta; P2[AX[b]]=N*unit*sel[b];
      edge(P1,P2);
      const P3=[0,0,0], P4=[0,0,0];
      P3[AX[n]]=0; P3[AX[b]]=tb; P3[AX[a]]=0;
      P4[AX[n]]=0; P4[AX[b]]=tb; P4[AX[a]]=N*unit*sel[a];
      edge(P3,P4);
    }
  });
}
