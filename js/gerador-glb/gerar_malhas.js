#!/usr/bin/env node
/* Gerador de malhas estáticas (.obj + .mtl embrulhados em .malha.js) para
 * TODOS os tipos de OBJECT3D_PROFILES (engine3d-profiles.js), reproduzindo
 * em vértices/arestas/faces tanto os perfis simples (caixa/cilindro/cone)
 * quanto os builders compostos (mesa/cadeira/planta/escada/luminária/poste/
 * relógio/quadro-mesa/teto-gesso/carro) que hoje só existem como código em
 * js/engine3d.js. Valores default (sem instância real): mapData.alturaPiso
 * = 2.8, obj.angulo = 0, obj.escadaDegraus/obj.largura/etc. ausentes (cai
 * no perfil).
 *
 * [15/09/2026 UTC] ALTERADO — pedido verbatim: "Sobre os materiais, use
 * <nome>.mtl para preserválos. Em 'modelos/', faça uma pasta 'obj/' e migre
 * os .obj para lá. Juntamente com os arquivos .obj, os que precisarem ter
 * materiais coloque no arquivo .mtl. Atualize os arquivos .obj respectivos
 * que usam materiais (por exemplo, adicionando 'mtllib <nome>.mtl'). Assim,
 * verdadeiramente não haverá perdas, nem limitações." Duas mudanças:
 *   1) `.obj`/`.mtl` agora vão em `assets/modelos/obj/` (não mais direto em
 *      `assets/modelos/`) — só o `.malha.js` continua em `assets/modelos/`
 *      (endereço que `ObjMeshSource.preload` já espera, ver js/objmeshsource.js
 *      — não mudou, e não precisa mudar: só o .obj/.mtl "fonte" se moveu).
 *   2) Os 6 tipos com MAIS de uma cor no builder de verdade (engine3d.js) —
 *      luminária (carcaça branca + tubo aceso), poste (haste cinza + lâmpada
 *      âmbar), carro (carroceria + rodas pretas + vidro azulado
 *      semitransparente), planta (vaso terracota + folhagem verde),
 *      teto-gesso (placa branca + rodelas cinza) e relógio (mostrador +
 *      ponteiros escuros) — agora marcam cada parte com `usemtl <nome>` no
 *      `.obj` e ganham um `.mtl` companheiro (`newmtl`/`Kd`/`d` opcional pra
 *      vidro semitransparente), gerado por este mesmo script. Os outros 57
 *      tipos (1 cor só) continuam sem `mtllib`/`usemtl` — comportamento
 *      idêntico ao de antes, só o arquivo mudou de pasta.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------- mesh builder genérico ----------
// `mat` (opcional, string) em toda função de desenho: nome do material
// (grupo `usemtl`) daquela peça. `null`/ausente = sem material nenhum (o
// objeto INTEIRO fica sem `usemtl`/`mtllib` no .obj, MESMO comportamento de
// antes desta rodada) — só os 6 tipos multi-material (ver MULTI_MAT_EXTRAS
// abaixo) passam um nome em TODAS as chamadas, nunca deixando peça sem tag.
function newMesh() { return { verts: [], faces: [], faceMats: [] }; }
function addVert(mb, x, y, z) { mb.verts.push([x, y, z]); return mb.verts.length; }
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function dot(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function addTriAuto(mb, pA, pB, pC, hint, mat) {
  const n = cross(sub(pB, pA), sub(pC, pA));
  const order = (dot(n, hint) < 0) ? [pA, pC, pB] : [pA, pB, pC];
  const i0 = addVert(mb, ...order[0]);
  const i1 = addVert(mb, ...order[1]);
  const i2 = addVert(mb, ...order[2]);
  mb.faces.push([i0, i1, i2]);
  mb.faceMats.push(mat || null);
}
function addQuadAuto(mb, p0, p1, p2, p3, hint, mat) {
  addTriAuto(mb, p0, p1, p2, hint, mat);
  addTriAuto(mb, p0, p2, p3, hint, mat);
}

// Caixa alinhada aos eixos, centrada em (cx,cy,cz), tamanho w(X) h(Y) d(Z).
function addBox(mb, w, h, d, cx = 0, cy = 0, cz = 0, mat) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const p = (x, y, z) => [cx + x, cy + y, cz + z];
  // -Y (fundo)
  addQuadAuto(mb, p(-hw,-hh,-hd), p(hw,-hh,-hd), p(hw,-hh,hd), p(-hw,-hh,hd), [0,-1,0], mat);
  // +Y (topo)
  addQuadAuto(mb, p(-hw,hh,-hd), p(-hw,hh,hd), p(hw,hh,hd), p(hw,hh,-hd), [0,1,0], mat);
  // -Z
  addQuadAuto(mb, p(-hw,-hh,-hd), p(-hw,hh,-hd), p(hw,hh,-hd), p(hw,-hh,-hd), [0,0,-1], mat);
  // +Z
  addQuadAuto(mb, p(-hw,-hh,hd), p(hw,-hh,hd), p(hw,hh,hd), p(-hw,hh,hd), [0,0,1], mat);
  // -X
  addQuadAuto(mb, p(-hw,-hh,-hd), p(-hw,-hh,hd), p(-hw,hh,hd), p(-hw,hh,-hd), [-1,0,0], mat);
  // +X
  addQuadAuto(mb, p(hw,-hh,-hd), p(hw,hh,-hd), p(hw,hh,hd), p(hw,-hh,hd), [1,0,0], mat);
}

// Cilindro/cone genérico, eixo escolhível ('x'|'y'|'z'), centrado em (cx,cy,cz).
// rTop/rBottom permitem tronco de cone (vaso) ou cone puro (rTop=0 ou rBottom=0).
function addCylinder(mb, axis, rTop, rBottom, height, segments, cx = 0, cy = 0, cz = 0, mat) {
  const hh = height / 2;
  // Constrói no eixo Y "canônico" e depois remapeia pros eixos escolhidos.
  function remap(x, y, z) {
    if (axis === 'y') return [cx + x, cy + y, cz + z];
    if (axis === 'x') return [cx + y, cy + x, cz + z]; // eixo comprido -> X
    return [cx + x, cy + z, cz + y]; // axis === 'z' -> eixo comprido -> Z
  }
  function axisHint(v) { // direção "comprimento" pra hint das tampas
    if (axis === 'y') return [0, v, 0];
    if (axis === 'x') return [v, 0, 0];
    return [0, 0, v];
  }
  const ring = (r, y) => {
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(remap(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    return pts;
  };
  const top = ring(rTop, hh);
  const bot = ring(rBottom, -hh);
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    const mid = remap(0, 0, 0);
    const radial = sub(top[i], mid);
    addQuadAuto(mb, bot[i], bot[j], top[j], top[i], radial, mat);
  }
  if (rTop > 0.00001) {
    const centerTop = remap(0, hh, 0);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      addTriAuto(mb, centerTop, top[i], top[j], axisHint(1), mat);
    }
  }
  if (rBottom > 0.00001) {
    const centerBot = remap(0, -hh, 0);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      addTriAuto(mb, centerBot, bot[j], bot[i], axisHint(-1), mat);
    }
  }
}

// `mtlFileName` (opcional): quando presente, escreve `mtllib <nome>` logo no
// topo do .obj (pedido verbatim: "Atualize os arquivos .obj respectivos que
// usam materiais (por exemplo, adicionando 'mtllib <nome>.mtl')") e emite
// `usemtl <nome-da-peça>` antes de cada bloco de faces que MUDAR de material
// (`mb.faceMats`, preenchido por addBox/addCylinder acima) — objetos de 1 cor
// só (mb.faceMats todo `null`) nunca emitem nenhum `usemtl`/`mtllib`, byte-a-
// byte igual ao formato de antes desta rodada.
function toObjText(mb, nomeObjeto, mtlFileName) {
  const lines = [`# gerado por assets/obj/gerador-glb/gerar_malhas.js — ${nomeObjeto}`];
  if (mtlFileName) lines.push(`mtllib ${mtlFileName}`);
  lines.push(`o ${nomeObjeto}`);
  for (const v of mb.verts) lines.push(`v ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}`);
  let matAtual; // sentinela `undefined` — 1ª face sempre decide se emite usemtl
  mb.faces.forEach((f, idx) => {
    const m = mb.faceMats[idx] || null;
    if (m !== matAtual) {
      if (m) lines.push(`usemtl ${m}`);
      matAtual = m;
    }
    lines.push(`f ${f[0]} ${f[1]} ${f[2]}`);
  });
  return lines.join('\n') + '\n';
}

// Escreve o `.mtl` companheiro — só `Kd` (cor difusa 0-1) + `d` (opacidade,
// só quando < 1 — vidro do carro) por material; formato mínimo, mas é o
// suficiente pro parser NOVO de js/objmeshsource.js (ver `_erros`/
// `parseObjText`/`register` lá — só lê `newmtl`/`Kd`/`d`, mesmo espírito
// "escopo honesto, documentado" do resto do parser .obj deste projeto).
function toMtlText(materiais, nomeObjeto) {
  const lines = [`# gerado por assets/obj/gerador-glb/gerar_malhas.js — materiais de ${nomeObjeto}`];
  for (const [nome, info] of Object.entries(materiais)) {
    const cor = info.cor;
    const r = ((cor >> 16) & 0xff) / 255, g = ((cor >> 8) & 0xff) / 255, b = (cor & 0xff) / 255;
    lines.push('', `newmtl ${nome}`, `Kd ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`);
    if (typeof info.opacidade === 'number' && info.opacidade < 1) lines.push(`d ${info.opacidade}`);
  }
  return lines.join('\n') + '\n';
}

// ---------- OBJECT3D_PROFILES (copiado de js/engine3d-profiles.js) ----------
const OBJECT3D_PROFILES = {
  mesa: { shape: 'box', w: 1.2, d: 0.6, h: 0.74, y0: 0, color: 0x8a6a4a },
  pilar: { shape: 'box', w: 1.2, d: 0.6, h: 2.8, y0: 0, color: 0x9aa4b2 },
  cadeira: { shape: 'box', w: 0.45, d: 0.45, h: 0.9, y0: 0, color: 0x5a5f6b },
  poltrona: { shape: 'box', w: 0.75, d: 0.75, h: 0.5, y0: 0.4, color: 0x6a5a4a },
  armario: { shape: 'box', w: 0.8, d: 0.45, h: 1.9, y0: 0, color: 0x7c8494 },
  arquivo: { shape: 'box', w: 0.45, d: 0.5, h: 1.3, y0: 0, color: 0x7c8494 },
  estante: { shape: 'box', w: 0.9, d: 0.35, h: 1.8, y0: 0, color: 0x8a7455 },
  quadro: { shape: 'box', w: 1.2, d: 0.05, h: 0.8, y0: 1.1, color: 0xe8ecf2 },
  'quadro-parede': { shape: 'box', w: 0.4, d: 0.03, h: 0.6, y0: 1.4, color: 0x1f3b4d },
  'quadro-mesa': { shape: 'box', w: 0.1, d: 0.03, h: 0.15, y0: 0, color: 0xd4af6a },
  carro: { shape: 'box', w: 1.75, d: 4.3, h: 1.4, y0: 0, color: 0xb33a3a },
  geladeira: { shape: 'box', w: 0.6, d: 0.6, h: 1.7, y0: 0, color: 0xd7dee6 },
  'ar-condicionado': { shape: 'box', w: 0.8, d: 0.2, h: 0.3, y0: 2.1, color: 0xd7dee6 },
  gabinete: { shape: 'box', w: 0.2, d: 0.45, h: 0.42, y0: 0.3, color: 0x2c313a },
  monitor: { shape: 'box', w: 0.5, d: 0.08, h: 0.35, y0: 0.75, color: 0x1c1f26 },
  notebook: { shape: 'box', w: 0.34, d: 0.24, h: 0.02, y0: 0.75, color: 0x2c313a },
  impressora: { shape: 'box', w: 0.45, d: 0.4, h: 0.3, y0: 0.75, color: 0xd7dee6 },
  switch: { shape: 'box', w: 0.3, d: 0.15, h: 0.05, y0: 1.6, color: 0x1c1f26 },
  estabilizador: { shape: 'box', w: 0.2, d: 0.35, h: 0.15, y0: 0.05, color: 0x2c313a },
  teclado: { shape: 'box', w: 0.4, d: 0.15, h: 0.03, y0: 0.75, color: 0x2c313a },
  mouse: { shape: 'box', w: 0.1, d: 0.06, h: 0.03, y0: 0.75, color: 0x2c313a },
  telefone: { shape: 'box', w: 0.18, d: 0.18, h: 0.12, y0: 0.75, color: 0x2c313a },
  grampeador: { shape: 'box', w: 0.16, d: 0.05, h: 0.05, y0: 0.75, color: 0x3a4048 },
  'caixa-som': { shape: 'box', w: 0.18, d: 0.18, h: 0.35, y0: 0, color: 0x2c313a },
  calculadora: { shape: 'box', w: 0.12, d: 0.02, h: 0.18, y0: 0.75, color: 0x2c313a },
  ventilador: { shape: 'cylinder', r: 0.25, h: 0.06, y0: 1.9, color: 0xd7dee6 },
  extintor: { shape: 'cylinder', r: 0.09, h: 0.55, y0: 0, color: 0xc0392b },
  bebedouro: { shape: 'cylinder', r: 0.18, h: 1.0, y0: 0, color: 0xd7dee6 },
  lixeira: { shape: 'cylinder', r: 0.16, h: 0.5, y0: 0, color: 0x556070 },
  coluna: { shape: 'cylinder', r: 0.18, h: 2.6, y0: 0, color: 0x9aa4b2 },
  planta: { shape: 'cone', r: 0.3, h: 0.7, y0: 0, color: 0x3f7d43 },
  porta: { shape: 'box', w: 0.9, d: 0.05, h: 2.05, y0: 0, color: 0x8a6a4a },
  janela: { shape: 'box', w: 1.0, d: 0.05, h: 1.1, y0: 0.9, color: 0xa9c9e6 },
  luminaria: { shape: 'box', w: 1.2, d: 0.16, h: 0.09, y0: 0, color: 0xf2f3f5 },
  'caixa-generica': { shape: 'box', w: 0.4, d: 0.4, h: 0.4, y0: 0, color: 0x8a92a3 },
  piso: { shape: 'box', w: 10, d: 10, h: 0.2, y0: 0, color: 0xb0b0b0 },
  'teto-modular': { shape: 'box', w: 10, d: 10, h: 0.2, y0: 0, color: 0xf3f4f6 },
  'teto-gesso': { shape: 'box', w: 10, d: 10, h: 0.2, y0: 0, color: 0xffffff },
  relogio: { shape: 'cylinder', r: 0.15, h: 0.04, y0: 0, color: 0xf2ede0 },
  poste: { shape: 'cylinder', r: 0.07, h: 4.5, y0: 0, color: 0x494e57 },
  escada: { shape: 'box', w: 1.3, d: 3.0, h: 2.0, y0: 0, color: 0x8a92a3 },
  interruptor: { shape: 'box', w: 0.09, d: 0.04, h: 0.14, y0: 1.1, color: 0xe8ecf2 },
  gabinete2: { shape: 'box', w: 0.18, d: 0.45, h: 0.55, y0: 0.3, color: 0x1c1f26 },
  monitor2: { shape: 'box', w: 0.58, d: 0.03, h: 0.34, y0: 0.75, color: 0x14161b },
  teclado2: { shape: 'box', w: 0.29, d: 0.15, h: 0.03, y0: 0.75, color: 0x2c313a },
  mouse2: { shape: 'box', w: 0.12, d: 0.075, h: 0.045, y0: 0.75, color: 0x3a4048 },
  robo: { shape: 'cylinder', r: 0.2, h: 0.3, y0: 0, color: 0xc7ccd4 },
  'robo-limpeza': { shape: 'cylinder', r: 0.2, h: 0.28, y0: 0, color: 0x5a5f6b },
  'robo-copa': { shape: 'cylinder', r: 0.2, h: 0.4, y0: 0, color: 0xf2f3f5 },
  'robo-recepcionista': { shape: 'cylinder', r: 0.22, h: 0.9, y0: 0, color: 0x3a6ea5 },
  pia: { shape: 'box', w: 0.55, d: 0.45, h: 0.15, y0: 0.78, color: 0xe8ecf2 },
  cafeteira: { shape: 'box', w: 0.22, d: 0.22, h: 0.32, y0: 0.78, color: 0x2c313a },
  'vaso-sanitario': { shape: 'box', w: 0.38, d: 0.55, h: 0.4, y0: 0, color: 0xf2f3f5 },
  mictorio: { shape: 'box', w: 0.35, d: 0.28, h: 0.5, y0: 0.3, color: 0xe8ecf2 },
  'elevador-cabine': { shape: 'box', w: 2.0, d: 2.0, h: 2.2, y0: 0, color: 0xb8c0cc },
  'elevador-botao-chamada': { shape: 'box', w: 0.3, d: 0.05, h: 0.4, y0: 1.1, color: 0xe8ecf2 },
  disjuntor: { shape: 'box', w: 0.5, d: 0.12, h: 0.6, y0: 1.0, color: 0x3a4048 },
  'casa-robo': { shape: 'box', w: 2.2, d: 2.2, h: 1.6, y0: 0, color: 0xd8c6a0 },
  'casa-robo-telhado': { shape: 'cone', r: 1.7, h: 0.9, y0: 1.6, color: 0x9a4b3a },
  'vaga-estacionamento': { shape: 'box', w: 2.5, d: 5.0, h: 0.02, y0: 0, color: 0xe0c93a },
  'cancela-poste': { shape: 'box', w: 0.12, d: 0.12, h: 1.0, y0: 0, color: 0xd23a3a },
  'cancela-haste': { shape: 'box', w: 2.2, d: 0.08, h: 0.08, y0: 0.9, color: 0xe8ecf2 },
  'interruptor-remoto': { shape: 'box', w: 0.09, d: 0.04, h: 0.14, y0: 1.1, color: 0xcfe0f2 },
};
// Tipos com builder COMPOSTO dedicado em engine3d.js (não usam o ramo
// genérico de caixa/cilindro/cone único) — tratados à parte abaixo.
const BESPOKE = new Set(['mesa', 'pilar', 'cadeira', 'planta', 'escada', 'luminaria', 'poste', 'relogio', 'quadro-mesa', 'teto-gesso', 'carro']);

// [15/09/2026 UTC] NOVO — os 6 tipos cujo builder de VERDADE (engine3d.js)
// usa MAIS de 1 cor/material na mesma peça (ver comentários de cada
// build_* abaixo pra correspondência exata com o método bespoke de
// engine3d.js). Cada entrada mapeia nome-do-material -> `{ cor, opacidade? }`
// — `null` significa "usa `perfil.color` deste tipo" (preenchido no laço de
// geração abaixo), pra não duplicar o valor já presente em
// OBJECT3D_PROFILES. Só estes 6 tipos geram `.mtl`/`mtllib`/`usemtl` — os
// outros 57 (perfil de 1 cor só) continuam exatamente como antes.
const MULTI_MAT_EXTRAS = {
  luminaria: { carcaca: null, tubo: { cor: 0xf5faff } },
  poste: { haste: null, lampada: { cor: 0xffd9a0 } },
  carro: { carroceria: null, roda: { cor: 0x1a1a1a }, vidro: { cor: 0x88bbdd, opacidade: 0.4 } },
  planta: { folha: null, vaso: { cor: 0xb5651d } },
  'teto-gesso': { placa: null, rodela: { cor: 0xc7cbd1 } },
  relogio: { mostrador: null, ponteiro: { cor: 0x2c313a } },
};

const ALTURA_PISO_DEFAULT = 2.8;

// ---------- builders compostos (fiéis à matemática de engine3d.js) ----------
function build_mesa(mb) {
  const perfil = OBJECT3D_PROFILES.mesa;
  const w = perfil.w, d = perfil.d;
  const h = (perfil.y0 || 0) + perfil.h;
  const tampoEsp = Math.max(0.03, Math.min(0.06, h * 0.08));
  const pernaEsp = Math.max(0.03, Math.min(0.06, Math.min(w, d) * 0.07));
  const margem = pernaEsp * 1.2;
  const pernaAltura = Math.max(0.05, h - tampoEsp);
  addBox(mb, w, tampoEsp, d, 0, h - tampoEsp / 2, 0);
  const corners = [[w/2-margem, d/2-margem], [-(w/2-margem), d/2-margem], [w/2-margem, -(d/2-margem)], [-(w/2-margem), -(d/2-margem)]];
  corners.forEach(([lx, lz]) => addBox(mb, pernaEsp, pernaAltura, pernaEsp, lx, pernaAltura / 2, lz));
}
function build_pilar(mb) {
  const perfil = OBJECT3D_PROFILES.pilar;
  const w = perfil.w, d = perfil.d, h = ALTURA_PISO_DEFAULT;
  addBox(mb, w, h, d, 0, h / 2, 0);
}
function build_cadeira(mb) {
  const perfil = OBJECT3D_PROFILES.cadeira;
  const w = perfil.w, d = perfil.d;
  const h = (perfil.y0 || 0) + perfil.h;
  const assentoEsp = 0.04;
  const assentoAltura = Math.min(0.46, h * 0.5);
  const pernaEsp = Math.max(0.025, Math.min(0.04, Math.min(w, d) * 0.08));
  const margem = pernaEsp * 1.3;
  const pernaAltura = Math.max(0.05, assentoAltura - assentoEsp / 2);
  const encostoEsp = 0.035;
  const encostoAltura = Math.max(0.1, h - assentoAltura);
  addBox(mb, w, assentoEsp, d, 0, assentoAltura - assentoEsp / 2, 0);
  const corners = [[w/2-margem, d/2-margem], [-(w/2-margem), d/2-margem], [w/2-margem, -(d/2-margem)], [-(w/2-margem), -(d/2-margem)]];
  corners.forEach(([lx, lz]) => addBox(mb, pernaEsp, pernaAltura, pernaEsp, lx, pernaAltura / 2, lz));
  const encostoLocalZ = -(d / 2 - margem);
  addBox(mb, w - margem * 2, encostoAltura, encostoEsp, 0, assentoAltura + encostoAltura / 2, encostoLocalZ);
}
// [15/09/2026 UTC] ALTERADO — vaso ('vaso', terracota 0xb5651d) e folhagem
// ('folha', `perfil.color` verde) agora marcados com `usemtl` PRÓPRIO —
// antes desta rodada os dois saíam na MESMA cor (do parâmetro `cor` único
// de `register()`), perdendo o terracota do vaso (limitação corrigida PRA ESTE tipo).
function build_planta(mb) {
  const perfil = OBJECT3D_PROFILES.planta;
  const r = perfil.r, hTotal = perfil.h;
  const potR = r * 0.6, potRTopo = potR * 1.15;
  const potH = Math.min(0.3, hTotal * 0.35);
  const folhaR = r, folhaH = Math.max(0.1, hTotal - potH);
  addCylinder(mb, 'y', potRTopo, potR, potH, 12, 0, potH / 2, 0, 'vaso');
  addCylinder(mb, 'y', 0, folhaR, folhaH, 12, 0, potH + folhaH / 2, 0, 'folha'); // cone: rTop=0 (ápice em cima)
}
function build_escada(mb) {
  const perfil = OBJECT3D_PROFILES.escada;
  const largura = perfil.w, profundidadeTotal = perfil.d, alturaTotal = ALTURA_PISO_DEFAULT;
  const degraus = Math.max(1, Math.round(alturaTotal / 0.18) || 11);
  const stepDepth = profundidadeTotal / degraus, stepHeight = alturaTotal / degraus;
  for (let i = 0; i < degraus; i++) {
    const h = stepHeight * (i + 1);
    const lz = -profundidadeTotal / 2 + stepDepth * (i + 0.5);
    addBox(mb, largura, h, stepDepth, 0, h / 2, lz);
  }
}
// [15/09/2026 UTC] ALTERADO — carcaça ('carcaca', branca — perfil.color) e
// tubo aceso ('tubo', 0xf5faff) agora com `usemtl` próprio (antes: 1 cor só,
// perdendo o branco do tubo "aceso"). NUANCE que continua existindo mesmo
// com material próprio: no motor de verdade (engine3d.js) o tubo usa
// `MeshBasicMaterial` (não reage a luz/sombra, "brilha" sempre) — o `.mtl`
// só carrega a COR (`Kd`), não o tipo de material; a malha estática usa
// `MeshLambertMaterial` pra tudo (ver js/objmeshsource.js `_buildGroup`), então
// o tubo aqui tem a cor certa mas ainda reage à luz da cena (fica mais
// escuro num canto sem luz) — sutileza sem solução dentro do escopo
// "objetos carregados por arquivo, não por código" (exigiria o `.malha.js`
// carregar TIPO de material por peça, não só cor, o que expandiria o
// formato `.mtl`/parser além do padrão Wavefront usado aqui).
function build_luminaria(mb) {
  const perfil = OBJECT3D_PROFILES.luminaria;
  const w = perfil.w, d = perfil.d, h = perfil.h;
  addBox(mb, w * 0.94, Math.max(0.015, h * 0.3), d, 0, h * 0.85, 0, 'carcaca');
  const raioTubo = Math.max(0.014, d * 0.11);
  const compTubo = w * 0.88;
  [-1, 1].forEach((lado) => addCylinder(mb, 'x', raioTubo, raioTubo, compTubo, 10, 0, h * 0.35, lado * d * 0.24, 'tubo'));
  [-1, 1].forEach((lado) => addBox(mb, w * 0.07, h, d * 1.08, lado * (w / 2 - w * 0.035), h / 2, 0, 'carcaca'));
}
// [15/09/2026 UTC] ALTERADO — haste ('haste', cinza — perfil.color) e
// lâmpada ('lampada', âmbar 0xffd9a0) com `usemtl` próprio. MESMA nuance
// "Basic vs Lambert" documentada acima em `build_luminaria` — cor certa,
// reage à luz (o poste de verdade não).
function build_poste(mb) {
  const perfil = OBJECT3D_PROFILES.poste;
  const alturaHaste = perfil.h, raioHaste = perfil.r;
  addCylinder(mb, 'y', raioHaste, raioHaste * 1.3, alturaHaste, 10, 0, alturaHaste / 2, 0, 'haste');
  const comprimentoBraco = 0.9, raioBraco = raioHaste * 0.75, yBraco = alturaHaste - 0.05;
  addCylinder(mb, 'x', raioBraco, raioBraco, comprimentoBraco, 8, comprimentoBraco / 2, yBraco, 0, 'haste');
  const lampY = yBraco - 0.16;
  addCylinder(mb, 'y', 0.16, 0, 0.22, 10, comprimentoBraco, lampY, 0, 'lampada'); // rTop=0.16 (base em cima), rBottom=0 (ápice embaixo, "virado pra baixo")
}
// [15/09/2026 UTC] ALTERADO — mostrador ('mostrador', perfil.color) e
// ponteiros ('ponteiro', 0x2c313a escuro) com `usemtl` próprio (antes: 1 cor
// só, ponteiros saíam da MESMA cor clara do mostrador — praticamente
// invisíveis). LIMITAÇÃO que continua (não resolvida por `.mtl` nenhum): o
// mostrador de verdade (engine3d.js `_buildRelogioMesh`) usa uma TEXTURA
// procedural (`_getProceduralMostradorTexture`, canvas 2D com os traços de
// hora desenhados) como `map` do material, não só uma cor sólida — `.mtl`
// Wavefront suporta um mapa de textura (`map_Kd <arquivo.png>`), mas isso
// exigiria gerar E versionar uma imagem PNG por tipo (fora do escopo
// "vértices/arestas/faces" original) — o mostrador estático continua sem os
// tracinhos de hora, só a cor de fundo do disco. Ponteiros PARADOS em 12:00
// continuam sendo limitação à parte (sem animação em malha estática, ver
// RODADA 66/67).
function build_relogio(mb) {
  const perfil = OBJECT3D_PROFILES.relogio;
  const r = perfil.r, h = perfil.h;
  const centerY = (perfil.y0 || 0) + r;
  // Disco já "de pé" (eixo Z, mostrador voltado pra +Z/-Z) — equivalente a
  // aplicar mesh.rotation.x=90° diretamente nos vértices (ver engine3d.js
  // _buildRelogioMesh) — "12 horas" fica em +Y.
  addCylinder(mb, 'z', r, r, h, 14, 0, centerY, 0, 'mostrador');
  const fazPonteiro = (comprimento, largura, espessura) => {
    addBox(mb, largura, comprimento, espessura, 0, centerY + comprimento / 2, h / 2 + 0.002, 'ponteiro');
  };
  fazPonteiro(r * 0.5, 0.012, 0.003);
  fazPonteiro(r * 0.72, 0.008, 0.0025);
  fazPonteiro(r * 0.8, 0.003, 0.002);
}
function build_quadro_mesa(mb) {
  const perfil = OBJECT3D_PROFILES['quadro-mesa'];
  const INCLINACAO = 12 * Math.PI / 180;
  const tmp = newMesh();
  addBox(tmp, perfil.w, perfil.h, perfil.d, 0, perfil.h / 2, 0);
  const cos = Math.cos(INCLINACAO), sin = Math.sin(INCLINACAO);
  tmp.verts.forEach((v) => {
    const y = v[1], z = v[2];
    v[1] = y * cos - z * sin;
    v[2] = y * sin + z * cos;
  });
  const base = mb.verts.length;
  mb.verts.push(...tmp.verts);
  tmp.faces.forEach((f) => mb.faces.push([f[0] + base, f[1] + base, f[2] + base]));
  tmp.faceMats.forEach((m) => mb.faceMats.push(m));
}
// [15/09/2026 UTC] ALTERADO — placa ('placa', branca — perfil.color) e
// rodelas de acesso ('rodela', 0xc7cbd1 cinza) com `usemtl` próprio (antes:
// 1 cor só, rodelas saíam brancas iguais à placa — quase invisíveis).
function build_teto_gesso(mb) {
  const perfil = OBJECT3D_PROFILES['teto-gesso'];
  addBox(mb, perfil.w, perfil.h, perfil.d, 0, 0, 0, 'placa');
  const ESPACAMENTO = 2, RAIO_RODELA = 0.075, ESPESSURA_RODELA = 0.01;
  const hw = perfil.w / 2, hd = perfil.d / 2;
  const margem = Math.min(ESPACAMENTO / 2, hw, hd);
  for (let x = -hw + margem; x <= hw - margem + 1e-6; x += ESPACAMENTO) {
    for (let z = -hd + margem; z <= hd - margem + 1e-6; z += ESPACAMENTO) {
      addCylinder(mb, 'y', RAIO_RODELA, RAIO_RODELA, ESPESSURA_RODELA, 16, x, -perfil.h / 2 - ESPESSURA_RODELA / 2 - 0.0005, z, 'rodela');
    }
  }
}
// [15/09/2026 UTC] ALTERADO — carroceria+cabine ('carroceria', vermelho —
// perfil.color), rodas ('roda', 0x1a1a1a preto) e vidros ('vidro', 0x88bbdd
// azulado, `opacidade: 0.4`) com `usemtl` próprio (antes: 1 cor só —
// carro saía inteiro vermelho, sem rodas pretas nem vidro). O `.mtl` grava
// `d 0.4` pro vidro (opacidade Wavefront padrão) — `objmeshsource.js` lê isso
// e aplica `transparent:true, opacity:0.4` no material Three.js
// correspondente, igual ao `MeshLambertMaterial` de verdade do carro
// dirigível (`_buildCarroMesh`).
function build_carro(mb) {
  const perfil = OBJECT3D_PROFILES.carro;
  const raioRoda = 0.32, larguraRoda = 0.22;
  const alturaCarroceria = perfil.h;
  const yCarroceriaBase = raioRoda * 0.75;
  addBox(mb, perfil.w, alturaCarroceria, perfil.d, 0, yCarroceriaBase + alturaCarroceria / 2, 0, 'carroceria');
  const cabineW = perfil.w * 0.7, cabineD = perfil.d * 0.45, cabineH = alturaCarroceria * 0.45;
  const yCabineBase = yCarroceriaBase + alturaCarroceria;
  const cabineZ = -perfil.d * 0.05;
  addBox(mb, cabineW, cabineH, cabineD, 0, yCabineBase + cabineH / 2, cabineZ, 'carroceria');
  const offsetX = perfil.w / 2 - larguraRoda * 0.15;
  const offsetZ = perfil.d / 2 - raioRoda * 1.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addCylinder(mb, 'x', raioRoda, raioRoda, larguraRoda, 16, sx * offsetX, raioRoda, sz * offsetZ, 'roda');
  const ESPESSURA = 0.02, yVidro = yCabineBase + cabineH / 2;
  for (const sx of [-1, 1]) addBox(mb, ESPESSURA, cabineH * 0.65, cabineD * 0.9, sx * (cabineW / 2 - ESPESSURA / 2), yVidro, cabineZ, 'vidro');
  for (const sz of [-1, 1]) addBox(mb, cabineW * 0.85, cabineH * 0.6, ESPESSURA, 0, yVidro, cabineZ + sz * (cabineD / 2 - ESPESSURA / 2), 'vidro');
}

const BESPOKE_BUILDERS = {
  mesa: build_mesa, pilar: build_pilar, cadeira: build_cadeira, planta: build_planta,
  escada: build_escada, luminaria: build_luminaria, poste: build_poste, relogio: build_relogio,
  'quadro-mesa': build_quadro_mesa, 'teto-gesso': build_teto_gesso, carro: build_carro,
};

// ---------- geração ----------
// [16/09/2026 UTC] ALTERADO — as funções/tabelas acima agora também são
// exportadas (`module.exports`, ver fim do arquivo) pra serem reaproveitadas
// por `assets/obj/gerador-glb/gerar_glb.js` (gera `.glb` pros 3 tipos que precisam de
// material PBR/textura de verdade — ver esse arquivo) SEM duplicar a
// matemática dos builders compostos aqui. Por isso a geração de `.obj`/
// `.mtl`/`.malha.js` abaixo só roda quando este arquivo é executado
// DIRETAMENTE (`node assets/obj/gerador-glb/gerar_malhas.js`), nunca quando é só
// `require`'d por outra ferramenta.
function gerarTudo() {
  // `.obj`/`.mtl` "fonte" (editável) agora em assets/modelos/obj/ (pedido
  // verbatim: "Em 'modelos/', faça uma pasta 'obj/' e migre os .obj para
  // lá.") — `.malha.js` (o que o app de fato carrega em tempo de execução,
  // via `ObjMeshSource.preload`) continua em assets/modelos/, sem mudança de
  // endereço nenhuma pro app.
  const objDir = path.resolve(__dirname, '..', '..', 'assets', 'modelos', 'obj');
  fs.mkdirSync(objDir, { recursive: true });
  const malhaOutDir = path.resolve(__dirname, '..', '..', 'assets', 'modelos', 'js');
  const conversorPath = path.resolve(__dirname, 'obj_para_malha_js.js');
  const resumo = [];
  for (const tipo of Object.keys(OBJECT3D_PROFILES)) {
    const perfil = OBJECT3D_PROFILES[tipo];
    const mb = newMesh();
    if (BESPOKE.has(tipo)) {
      BESPOKE_BUILDERS[tipo](mb);
    } else if (perfil.shape === 'cylinder') {
      addCylinder(mb, 'y', perfil.r, perfil.r, perfil.h, 14, 0, (perfil.y0 || 0) + perfil.h / 2, 0);
    } else if (perfil.shape === 'cone') {
      addCylinder(mb, 'y', 0, perfil.r, perfil.h, 14, 0, (perfil.y0 || 0) + perfil.h / 2, 0);
    } else {
      addBox(mb, perfil.w, perfil.h, perfil.d, 0, (perfil.y0 || 0) + perfil.h / 2, 0);
    }
    let mtlFileName = null;
    const extras = MULTI_MAT_EXTRAS[tipo];
    if (extras) {
      const materiais = {};
      for (const [nomeMat, info] of Object.entries(extras)) materiais[nomeMat] = info || { cor: perfil.color };
      mtlFileName = `${tipo}.mtl`;
      fs.writeFileSync(path.join(objDir, mtlFileName), toMtlText(materiais, tipo), 'utf8');
    }
    const objPath = path.join(objDir, `${tipo}.obj`);
    fs.writeFileSync(objPath, toObjText(mb, tipo, mtlFileName), 'utf8');
    const corHex = `0x${perfil.color.toString(16).padStart(6, '0')}`;
    execFileSync('node', [conversorPath, objPath, tipo, corHex], { stdio: 'pipe' });
    resumo.push(`${tipo}: ${mb.verts.length}v/${mb.faces.length}f${mtlFileName ? ` + ${tipo}.mtl` : ''} -> obj/${tipo}.obj -> ${tipo}.malha.js`);
  }
  console.log(resumo.join('\n'));
  console.log(`\nTotal: ${Object.keys(OBJECT3D_PROFILES).length} tipos — .obj/.mtl em ${objDir}, .malha.js gerado pela ferramenta em ${malhaOutDir}`);
}

module.exports = {
  newMesh, addVert, addBox, addCylinder, addTriAuto, addQuadAuto, cross, sub, dot,
  OBJECT3D_PROFILES, BESPOKE, BESPOKE_BUILDERS, MULTI_MAT_EXTRAS, ALTURA_PISO_DEFAULT,
  toObjText, toMtlText,
};

if (require.main === module) gerarTudo();
