'use strict';
/* ==========================================================================
   VanishCam — calibração de câmera a partir de pontos de fuga (1 ou 2 VPs)
   e projeção de pontos do mundo 3D de volta para a imagem.
   ========================================================================== */

/* --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO (mais recente primeiro)
   --------------------------------------------------------------------------
   Rodada 17 (2026-09-08): nova função solveThirdVertexFromOrthocenter(A,B,H)
     — inverso de orthocenter(A,B,C): dados 2 vértices FIXOS (A,B) e o
     ortocentro H desejado, resolve o 3º vértice por fórmula fechada
     (interseção de 2 retas), sem iteração. Usada por movePPFrom3VPBy()
     (canvas-render.js) para corrigir um bug de divergência numérica ao
     arrastar "o ponto médio gerado pelos 3 pontos de fuga" com 2 dos 3
     eixos travados — ver o histórico de canvas-render.js para os detalhes.
   Rodada 9 (2026-09-07): adicionado este histórico de alterações (ver
     mesma nota em state.js). Sem mudança de comportamento.
   Rodada 8 (2026-09-07): CORREÇÃO DE BUG DE ESCALA — nova função
     sceneDisplayUnitFactor(). O usuário reportou (com um projeto real
     anexado, distância de referência = 99cm) que a posição da câmera em z
     aparecia como "1.36" quando deveria ser ~120-130 (comparado ao fSpy
     original, que deu ~126 com a mesma imagem/config). Causa: camPos é
     calculado SEMPRE em metros internamente (ver computeCalibration()), mas
     a leitura "Posição da câmera" mostrava esse valor em metros rotulado
     com a unidade que o usuário escolheu (ex.: 'cm'), sem de fato converter
     — um valor correto de 1.36 METROS aparecia como se fosse 1.36
     CENTÍMETROS. sceneDisplayUnitFactor() retorna o fator de conversão
     metros->unidade escolhida, usado tanto na leitura (canvas-render.js)
     quanto na exportação de JSON (project-io.js) — resultado corrigido:
     136.45 cm, próximo do valor de referência do fSpy original.
   Rodada 7 (2026-09-07): nova função thirdAxisLetter() — determina
     automaticamente a letra do eixo do mundo atribuída ao 3º ponto de fuga
     (usado só pelo modo "Ponto principal: a partir do 3º ponto de fuga"),
     a partir dos eixos escolhidos em '1'/'2': letras diferentes -> a que
     sobra das 3; MESMA letra (atribuição inválida) -> regra pedida
     explicitamente pelo usuário (x&x->y, y&y->x, z&z->x). Usada só para
     decidir a COR de exibição das linhas/bolinha desse 3º ponto de fuga
     (ver canvas-render.js) — não interfere na matemática da calibração.
     computeCalibration() também passou a gravar state.calibErrorReason
     ('duplicateAxis' | 'generic') a cada tentativa, para que a mensagem de
     erro certa seja escolhida no painel direito.
   Rodada 5 (2026-09-06): axisUnitVec('y') passou a retornar [0,-1,0] em vez
     de [0,1,0] — Y invertido de propósito para que a orientação do gizmo
     desenhado bata com a do Blender (pedido do usuário: "É exatamente como
     é, só que com o Y para o outro sentido"). Afeta só a direção VISUAL
     desenhada/arrastada do eixo y (gizmo e distância de referência); não
     afeta a matemática da calibração em si. Nova função gizmoArrowLength()
     (comprimento das setas do gizmo, proporcional à distância câmera-origem)
     extraída para ser compartilhada entre o desenho do gizmo e a "Guia 3D"
     — usuário pediu para reduzir as setas à metade do tamanho anterior.
   -------------------------------------------------------------------------- */

function intersectLines(l1,l2){
  // l1=[p1,p2], l2=[p3,p4] -> ponto de interseção das retas (não segmentos)
  const [x1,y1]=l1[0], [x2,y2]=l1[1], [x3,y3]=l2[0], [x4,y4]=l2[1];
  const d = (x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if(Math.abs(d)<1e-9) return null;
  const px = ((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4))/d;
  const py = ((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4))/d;
  return [px,py];
}
// Vetor unitário do mundo para um token de eixo ('x','-x','y','-y','z' ou '-z'). O eixo Y é
// invertido de propósito (retorna [0,-1,0] para '+y') para que a orientação do gizmo desenhado
// bata com a do Blender (mesma disposição/cores, só que com o Y apontando para o outro lado).
// Isso só afeta a DIREÇÃO VISUAL desenhada/arrastada para o eixo y (gizmo e distância de
// referência); não afeta a matemática da calibração em si (posição/orientação da câmera), que
// é resolvida a partir dos pontos de fuga e das letras/sinais escolhidos pelo usuário, não a
// partir deste vetor "canônico".
function axisUnitVec(token){
  const sign = token[0]==='-'? -1:1;
  const letter = token.replace('-','');
  const v = {x:[1,0,0], y:[0,-1,0], z:[0,0,1]}[letter];
  return V3.scale(v, sign);
}
function axisLetter(token){ return token.replace('-',''); }
function axisSign(token){ return token[0]==='-'? -1:1; }
function colorForAxisLetter(letter){ return AXIS_LETTER_COLOR[letter] || '#ffffff'; }

// Letra do eixo do mundo atribuída automaticamente ao 3º ponto de fuga — usado apenas pelo modo
// "Ponto principal: a partir do 3º ponto de fuga" (linhas auxiliares em state.axisPoints[3]).
// - Quando os eixos 1 e 2 têm letras DIFERENTES (caso normal), o 3º eixo é a letra que sobra
//   das 3 (x,y,z) — a mesma lógica usada para completar a base em solveAxis3().
// - Quando os eixos 1 e 2 têm a MESMA letra (atribuição inválida — calibração impossível), o
//   3º eixo segue por convenção: x&x -> y; y&y -> x; z&z -> x.
function thirdAxisLetter(){
  const l1 = axisLetter(state.axis1), l2 = axisLetter(state.axis2);
  if(l1===l2) return {x:'y', y:'x', z:'x'}[l1];
  return ['x','y','z'].find(l=>l!==l1 && l!==l2);
}

// Fator de conversão da unidade CANÔNICA interna de state.calib.camPos (sempre metros — ver
// computeCalibration(), onde "realMeters = refDistValue * UNIT_TO_M[refDistUnit]") para a
// unidade que o usuário escolheu em "Distância de referência" (state.refDistUnit). Usado tanto
// na leitura "Posição da câmera" (canvas-render.js) quanto na exportação de JSON
// (exportCameraJSON em project-io.js), para que o valor mostrado/exportado esteja na MESMA
// unidade escolhida (ex.: cm), em vez de sempre em metros. Sem uma distância de referência real
// estabelecida (refDistMode==='none'), a escala é arbitrária e o fator é 1 (sem conversão).
function sceneDisplayUnitFactor(){
  if(state.refDistMode==='none' || state.refDistUnit==='none') return 1;
  return UNIT_TO_M[state.refDistUnit] || 1;
}

// Comprimento (em pixels de imagem) das setas do gizmo do mundo — proporcional à distância da
// câmera até a origem, para que fiquem com um tamanho visualmente razoável em qualquer escala
// de cena. Usado tanto para desenhar as 3 setas x/y/z quanto para a grade/caixa da "Guia 3D"
// (cujo tamanho de célula é definido como metade deste valor — ver draw3DGuide()).
function gizmoArrowLength(){
  const c = state.calib;
  if(!c) return 40; // fallback razoável antes de haver calibração válida
  return Math.max(V3.len(c.camPos)*0.15, 1e-6);
}

// Direção (em pixels de imagem, unitária) do prolongamento de um eixo do mundo (x/y/z) a partir
// do ponto de origem — usada para desenhar/arrastar a "distância de referência" como um
// prolongamento do gizmo de eixos (seta -> tracejado -> segmento de medida).
function getAxisRay(letter){
  const origin = state.originPoint;
  const c = state.calib;
  if(c){
    const arrowLen = gizmoArrowLength();
    const tip = projectWorldPoint(V3.scale(axisUnitVec(letter), arrowLen));
    if(tip){
      const dx=tip[0]-origin[0], dy=tip[1]-origin[1];
      const len = Math.hypot(dx,dy);
      if(len>1e-6) return {origin, dir:[dx/len,dy/len], arrowLen:len};
    }
  }
  // fallback (sem calibração válida ainda): usa a direção crua até o VP correspondente, se houver.
  const apEff = getAxisLinePoints();
  function fromVp(idx, token){
    if(axisLetter(token)!==letter) return null;
    const ap = apEff[idx];
    const vp = intersectLines(ap.l1, ap.l2);
    if(!vp) return null;
    let dx=(vp[0]-origin[0])*axisSign(token), dy=(vp[1]-origin[1])*axisSign(token);
    const len = Math.hypot(dx,dy);
    if(len<1e-6) return null;
    return {origin, dir:[dx/len,dy/len], arrowLen:Math.min(40,len*0.15)};
  }
  return fromVp(1, state.axis1) || (state.vpCount===2 ? fromVp(2, state.axis2) : null);
}

function computePrincipalPoint(vp1,vp2){
  const w=state.imageW,h=state.imageH;
  if(state.ppMode==='manual') return state.principalPointManual.slice();
  if(state.ppMode==='midpoint') return [w/2,h/2];
  if(state.ppMode==='fromThirdVP'){
    // Método clássico: com 3 pontos de fuga mutuamente ortogonais, o ponto principal
    // é o ortocentro do triângulo formado por eles. Precisa de um 3º ponto de fuga
    // (linhas de controle adicionais, desenhadas na cor do eixo z) além dos 2 eixos calibrados.
    if(vp1 && vp2 && state.vpCount===2){
      const vp3 = intersectLines(state.axisPoints[3].l1, state.axisPoints[3].l2);
      if(vp3) return orthocenter(vp1,vp2,vp3);
    }
    return [w/2,h/2];
  }
  return [w/2,h/2];
}
function orthocenter(A,B,C){
  // ortocentro do triângulo ABC — interseção das alturas de A e B
  function sub(p,q){return [p[0]-q[0],p[1]-q[1]];}
  const bc=sub(C,B), ca=sub(A,C);
  const dirA=[-bc[1],bc[0]];
  const dirB=[-ca[1],ca[0]];
  const lineA=[A,[A[0]+dirA[0],A[1]+dirA[1]]];
  const lineB=[B,[B[0]+dirB[0],B[1]+dirB[1]]];
  const p = intersectLines(lineA,lineB);
  return p||C;
}
// Rodada 17: INVERSO de orthocenter() — dados 2 vértices FIXOS do triângulo (A,B) e o ortocentro
// H desejado, resolve o 3º vértice C por FÓRMULA FECHADA (interseção de 2 retas), sem iteração.
// Usado por movePPFrom3VPBy() (canvas-render.js) para corrigir um bug: antes, ao arrastar "o
// ponto médio gerado pelos 3 pontos de fuga" com 2 dos 3 eixos travados, o código aplicava um
// DELTA (desired-oldPP) ao vp livre a cada mousemove e deixava o ortocentro "convergir sozinho"
// quadro a quadro — mas o ortocentro depende NÃO-LINEARMENTE do 3º vértice (as direções das
// alturas usadas em orthocenter() dependem da posição de C), então essa era uma iteração de
// ponto fixo sem garantia de convergência: o vp livre podia "disparar" para longe e nunca mais
// voltar (bug relatado pelo usuário, reproduzido no arquivo "sala de TI - frente servidor.json"
// travando os eixos X e Z e arrastando o ponto médio). Com A e B fixos, a posição do 3º vértice
// C tal que orthocenter(A,B,C)=H é ÚNICA e pode ser obtida diretamente: por definição de
// ortocentro, a altura de A (a reta AH) é perpendicular a BC, então a reta BC (que passa por B)
// tem direção perpendicular a (H-A); simetricamente, a reta AC (que passa por A) tem direção
// perpendicular a (H-B). C é a interseção dessas 2 retas.
function solveThirdVertexFromOrthocenter(A, B, H){
  function perp(v){ return [-v[1], v[0]]; }
  const dirThroughA = perp([H[0]-B[0], H[1]-B[1]]); // reta AC ⟂ BH
  const dirThroughB = perp([H[0]-A[0], H[1]-A[1]]); // reta BC ⟂ AH
  const lineThroughA = [A, [A[0]+dirThroughA[0], A[1]+dirThroughA[1]]];
  const lineThroughB = [B, [B[0]+dirThroughB[0], B[1]+dirThroughB[1]]];
  return intersectLines(lineThroughA, lineThroughB);
}

function solveAxis3(dir1,s1,a1letter,dir2,s2,a2letter){
  const v1 = V3.scale(dir1,s1); // vetor cam-space representando eixo +a1letter
  const v2 = V3.scale(dir2,s2);
  const order=['x','y','z'];
  const a3letter = order.find(a=>a!==a1letter && a!==a2letter);
  // sinal do produto vetorial cíclico: x×y=z, y×z=x, z×x=y  => +1 ; caso inverso => -1
  const cyc = {x:{y:'z'},y:{z:'x'},z:{x:'y'}};
  let sign=1;
  if(cyc[a1letter] && cyc[a1letter][a2letter]===a3letter) sign=1;
  else sign=-1;
  const cross = V3.cross(v1,v2);
  const v3 = V3.scale(cross, sign); // vetor cam-space representando eixo +a3letter
  const axisVec = {}; axisVec[a1letter]=V3.norm(v1); axisVec[a2letter]=V3.norm(v2); axisVec[a3letter]=V3.norm(v3);
  return axisVec;
}

function buildRotationFromAxisVectors(axisVec){
  // M (cam<-world): colunas = vetores em cam-space dos eixos +x,+y,+z do mundo
  const M = [axisVec.x, axisVec.y, axisVec.z]; // M[0]=colX, M[1]=colY, M[2]=colZ
  // R_wc = M (mundo->câmera). R_cw = transposta.
  const R_cw = M3.transpose(M);
  return {R_wc:M, R_cw};
}

function matToAxisAngle(R){
  // R = R_cw (câmera->mundo), colunas R[0],R[1],R[2]
  const m00=R[0][0],m11=R[1][1],m22=R[2][2];
  const trace = m00+m11+m22;
  let angle = Math.acos(Math.max(-1,Math.min(1,(trace-1)/2)));
  let axis;
  if(angle < 1e-6){ axis=[1,0,0]; angle=0; }
  else if(Math.abs(angle-Math.PI) < 1e-4){
    // caso degenerado
    const xx=(R[0][0]+1)/2, yy=(R[1][1]+1)/2, zz=(R[2][2]+1)/2;
    axis = V3.norm([Math.sqrt(Math.max(0,xx)),Math.sqrt(Math.max(0,yy)),Math.sqrt(Math.max(0,zz))]);
  } else {
    const rx = R[1][2]-R[2][1];
    const ry = R[2][0]-R[0][2];
    const rz = R[0][1]-R[1][0];
    axis = V3.norm([rx,ry,rz]);
  }
  return {axis, angle};
}
function matToQuat(R){
  // R dado como colunas [c0,c1,c2]; monta linha-major m[row][col]
  const m = [
    [R[0][0],R[1][0],R[2][0]],
    [R[0][1],R[1][1],R[2][1]],
    [R[0][2],R[1][2],R[2][2]],
  ];
  const t = m[0][0]+m[1][1]+m[2][2];
  let x,y,z,w;
  if(t>0){
    const s=Math.sqrt(t+1)*2;
    w=0.25*s; x=(m[2][1]-m[1][2])/s; y=(m[0][2]-m[2][0])/s; z=(m[1][0]-m[0][1])/s;
  } else if(m[0][0]>m[1][1] && m[0][0]>m[2][2]){
    const s=Math.sqrt(1+m[0][0]-m[1][1]-m[2][2])*2;
    w=(m[2][1]-m[1][2])/s; x=0.25*s; y=(m[0][1]+m[1][0])/s; z=(m[0][2]+m[2][0])/s;
  } else if(m[1][1]>m[2][2]){
    const s=Math.sqrt(1+m[1][1]-m[0][0]-m[2][2])*2;
    w=(m[0][2]-m[2][0])/s; x=(m[0][1]+m[1][0])/s; y=0.25*s; z=(m[1][2]+m[2][1])/s;
  } else {
    const s=Math.sqrt(1+m[2][2]-m[0][0]-m[1][1])*2;
    w=(m[1][0]-m[0][1])/s; x=(m[0][2]+m[2][0])/s; y=(m[1][2]+m[2][1])/s; z=0.25*s;
  }
  return [x,y,z,w];
}

function cameraSpaceDir(pt, pp, f){
  return V3.norm([pt[0]-pp[0], pt[1]-pp[1], -f]);
}

// Dado um raio partindo da câmera em C0 com direção dWorld, e o eixo do mundo axisDir passando
// pela origem, resolve (mínimos quadrados) o parâmetro s tal que o ponto do raio mais próximo
// da reta do eixo esteja em s*axisDir. Usado para converter os 2 pontos da "distância de
// referência" (que ficam sobre o prolongamento do eixo, ver getAxisRay) em coordenadas 3D reais.
function pointAxisCoordinate(dWorld, axisDir, C0){
  const negC0 = V3.neg(C0), nAxis = V3.neg(axisDir);
  const M11=V3.dot(dWorld,dWorld), M12=V3.dot(dWorld,nAxis);
  const M21=M12, M22=V3.dot(nAxis,nAxis);
  const b1=V3.dot(dWorld,negC0), b2=V3.dot(nAxis,negC0);
  const det=M11*M22-M12*M21;
  if(Math.abs(det)<1e-12) return null;
  return (M11*b2-M21*b1)/det;
}

function computeCalibration(){
  // Motivo de uma eventual falha, usado só para escolher a mensagem de erro exibida no painel
  // direito (ver updateCalibErrorMessage() em canvas-render.js): 'duplicateAxis' quando os 2
  // pontos de fuga foram atribuídos ao MESMO eixo do mundo (erro de configuração do usuário,
  // não um problema geométrico das linhas), ou 'generic' para qualquer outra causa (linhas
  // quase paralelas, ponto de fuga atrás da câmera, etc.).
  state.calibErrorReason = null;
  if(!state.image) { state.calib=null; return; }
  const w=state.imageW, h=state.imageH;
  let vp1=null, vp2=null, f=null, pp=null;

  const apEff = getAxisLinePoints();
  const l1a = apEff[1].l1, l1b = apEff[1].l2;
  vp1 = intersectLines(l1a,l1b);
  if(state.vpCount===2){
    const l2a = apEff[2].l1, l2b = apEff[2].l2;
    vp2 = intersectLines(l2a,l2b);
  }
  if(!vp1 || (state.vpCount===2 && !vp2)) { state.calib=null; state.calibErrorReason='generic'; return; }
  // Os 2 pontos de fuga precisam representar eixos do mundo DIFERENTES (x/y/z) — o sinal
  // (ex.: 'y' e '-y') pode se repetir, mas a letra não, senão a base 3D fica indeterminada.
  if(state.vpCount===2 && axisLetter(state.axis1)===axisLetter(state.axis2)) { state.calib=null; state.calibErrorReason='duplicateAxis'; return; }

  pp = computePrincipalPoint(vp1,vp2);

  if(state.vpCount===2){
    const dx1=vp1[0]-pp[0], dy1=vp1[1]-pp[1];
    const dx2=vp2[0]-pp[0], dy2=vp2[1]-pp[1];
    const f2 = -(dx1*dx2+dy1*dy2);
    if(f2<=0){ state.calib=null; state.calibErrorReason='generic'; return; }
    f = Math.sqrt(f2);
  } else {
    // 1 VP: foco derivado do campo de visão manual
    const hfov = deg2rad(state.oneVpFovDeg);
    f = (w/2)/Math.tan(hfov/2);
  }

  const dir1 = cameraSpaceDir(vp1, pp, f);
  const dir2 = state.vpCount===2 ? cameraSpaceDir(vp2, pp, f) : null;

  let axisVec;
  if(state.vpCount===2){
    axisVec = solveAxis3(dir1, axisSign(state.axis1), axisLetter(state.axis1), dir2, axisSign(state.axis2), axisLetter(state.axis2));
  } else {
    // 1 VP: assume roll zero (horizonte nivelado). av = eixo do VP.
    const av = axisLetter(state.axis1), sv = axisSign(state.axis1);
    const dirV = V3.scale(dir1, sv);
    const order=['x','y','z'].filter(a=>a!==av);
    const ah1letter = order[0], ah2letter = order[1];
    let horiz = [1,0,0];
    let proj = V3.sub(horiz, V3.scale(dirV, V3.dot(horiz,dirV)));
    if(V3.len(proj) < 1e-6) proj = V3.sub([0,1,0], V3.scale(dirV, V3.dot([0,1,0],dirV)));
    const dirAh1 = V3.norm(proj);
    const cyc = {x:{y:'z'},y:{z:'x'},z:{x:'y'}};
    const sign = (cyc[av] && cyc[av][ah1letter]===ah2letter) ? 1 : -1;
    const dirAh2 = V3.scale(V3.cross(dirV,dirAh1), sign);
    axisVec = {}; axisVec[av]=dirV; axisVec[ah1letter]=dirAh1; axisVec[ah2letter]=V3.norm(dirAh2);
  }

  const {R_wc, R_cw} = buildRotationFromAxisVectors(axisVec);

  // posição da câmera
  const originDir = cameraSpaceDir(state.originPoint, pp, f);
  const originDirWorld = M3.mulVec(R_cw, originDir);
  const C0 = V3.neg(originDirWorld); // câmera a distância unitária da origem

  let scale = 1;
  if(state.refDistMode!=='none' && state.refDistValue>0){
    const ray = getAxisRay(state.refDistMode);
    if(ray){
      const r1 = [ray.origin[0]+ray.dir[0]*state.refDistT[0], ray.origin[1]+ray.dir[1]*state.refDistT[0]];
      const r2 = [ray.origin[0]+ray.dir[0]*state.refDistT[1], ray.origin[1]+ray.dir[1]*state.refDistT[1]];
      const d1w = M3.mulVec(R_cw, cameraSpaceDir(r1, pp, f));
      const d2w = M3.mulVec(R_cw, cameraSpaceDir(r2, pp, f));
      const axisDir = axisUnitVec(state.refDistMode);
      const s1 = pointAxisCoordinate(d1w, axisDir, C0);
      const s2 = pointAxisCoordinate(d2w, axisDir, C0);
      if(s1!=null && s2!=null){
        const l0 = Math.abs(s2-s1);
        if(l0>1e-9){
          const realMeters = state.refDistValue * UNIT_TO_M[state.refDistUnit];
          scale = realMeters / l0;
        }
      }
    }
  }
  const camPos = V3.scale(C0, scale);

  const fovH = 2*Math.atan((w/2)/f);
  const fovV = 2*Math.atan((h/2)/f);
  const axisAngle = matToAxisAngle(R_cw);
  const quat = matToQuat(R_cw);
  const focalMM = f * state.sensorW / w;

  state.calib = {vp1,vp2,pp,f,R_cw,R_wc,camPos,fovH,fovV,axisAngle,quat,focalMM,axisVec};
}

/* ============================== Projeção 3D ================================= */
function projectWorldPoint(P){
  const c = state.calib; if(!c) return null;
  const rel = V3.sub(P, c.camPos);
  const pc = M3.mulVec(c.R_wc, rel); // world->cam
  if(pc[2] >= -1e-6) return null; // atrás da câmera
  const u = c.pp[0] + c.f * pc[0]/(-pc[2]);
  const v = c.pp[1] + c.f * pc[1]/(-pc[2]);
  return [u,v];
}

// Transforma um ponto do mundo para o espaço da câmera (sem projetar) — usado para poder
// recortar (clip) segmentos de reta contra o plano da câmera antes de projetar, evitando que
// linhas da grade/caixa 3D desapareçam ou "pulem" quando cruzam a posição da câmera.
function worldToCamSpace(P){
  const c = state.calib; if(!c) return null;
  return M3.mulVec(c.R_wc, V3.sub(P, c.camPos));
}
function projectCamSpacePoint(pc){
  const c = state.calib;
  return [c.pp[0] + c.f*pc[0]/(-pc[2]), c.pp[1] + c.f*pc[1]/(-pc[2])];
}
// Recorta o segmento (pc1,pc2), em espaço de câmera, contra o plano near (z = nearZ, câmera
// olha para -z). Retorna [a,b] recortados (ambos com z<=nearZ) ou null se o segmento inteiro
// estiver atrás da câmera.
function clipSegmentNearPlane(pc1, pc2, nearZ){
  const z1=pc1[2], z2=pc2[2];
  const vis1 = z1 < nearZ, vis2 = z2 < nearZ;
  if(!vis1 && !vis2) return null;
  if(vis1 && vis2) return [pc1, pc2];
  const t = (nearZ - z1) / (z2 - z1);
  const cross = [ pc1[0]+(pc2[0]-pc1[0])*t, pc1[1]+(pc2[1]-pc1[1])*t, nearZ ];
  return vis1 ? [pc1, cross] : [cross, pc2];
}
