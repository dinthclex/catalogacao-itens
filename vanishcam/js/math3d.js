'use strict';
/* ==========================================================================
   VanishCam — utilitários de álgebra vetorial/matricial 3D.
   ========================================================================== */

/* --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO
   Este arquivo não sofreu nenhuma alteração desde a criação do projeto —
   as funções de álgebra vetorial/matricial básicas (V3, M3, rad2deg/deg2rad)
   não precisaram mudar em nenhuma das rodadas de pedidos do usuário.
   -------------------------------------------------------------------------- */

const V3 = {
  sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
  scale:(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  len:(a)=>Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]),
  norm:(a)=>{const l=V3.len(a)||1e-9; return [a[0]/l,a[1]/l,a[2]/l];},
  neg:(a)=>[-a[0],-a[1],-a[2]],
};
// matriz 3x3 como array de 3 colunas [c0,c1,c2], cada uma [x,y,z]
const M3 = {
  mulVec:(M,v)=>{
    return [
      M[0][0]*v[0]+M[1][0]*v[1]+M[2][0]*v[2],
      M[0][1]*v[0]+M[1][1]*v[1]+M[2][1]*v[2],
      M[0][2]*v[0]+M[1][2]*v[1]+M[2][2]*v[2],
    ];
  },
  transpose:(M)=>[
    [M[0][0],M[1][0],M[2][0]],
    [M[0][1],M[1][1],M[2][1]],
    [M[0][2],M[1][2],M[2][2]],
  ],
};

function rad2deg(r){ return r*180/Math.PI; }
function deg2rad(d){ return d*Math.PI/180; }
