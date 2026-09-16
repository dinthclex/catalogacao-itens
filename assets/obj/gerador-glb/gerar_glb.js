#!/usr/bin/env node
/* assets/obj/gerador-glb/gerar_glb.js
 * [16/09/2026 UTC] NOVO — pedido verbatim: "Faça os .glb nos objetos que
 * precisarem." Responde à pergunta que o usuário fez antes ("que tipo de
 * arquivo pode resolver todas as limitações?"): dos 63 tipos do catálogo,
 * só 3 têm uma limitação que SÓ um formato com material PBR de verdade e
 * textura embutida resolve (`.obj`+`.mtl` não alcança, ver progresso-
 * sessao.md RODADA 68):
 *   - luminaria/poste: o tubo/lâmpada usa `MeshBasicMaterial` no motor de
 *     verdade — "sempre aceso", não escurece na sombra. `.mtl` só tem `Kd`
 *     (cor), sem equivalente; glTF tem `emissiveFactor`, que aproxima esse
 *     brilho — ver `materiais: [...{emissivo:true}]` abaixo.
 *   - relogio: o mostrador usa uma TEXTURA (canvas 2D com os tracinhos de
 *     hora) como `map`, não uma cor sólida — `.mtl` não suporta textura
 *     embutida (só `map_Kd <arquivo.png>` externo); glTF permite a imagem
 *     PNG inteira DENTRO do próprio `.glb` (`images[].bufferView`). A
 *     textura é gerada com o MESMO código de `assets/js/mostrador-canvas.js`
 *     usado ao vivo no navegador (via `canvas2d-node.js`, ver esse arquivo)
 *     — nunca duas fontes de verdade pro desenho do mostrador.
 *
 * Reaproveita os builders de `gerar_malhas.js` (`BESPOKE_BUILDERS`,
 * `addBox`/`addCylinder` — MESMA matemática/winding já usada e validada
 * pelos `.obj`) — este script só "achata" o resultado indexado (`mb.verts`/
 * `mb.faces`/`mb.faceMats`) em arrays não-indexados agrupados por material
 * (posições + normais de face, "flat shading" — mesmo estilo do parser
 * `.obj`/`ObjMeshSource`) e, pro relógio, calcula coordenadas de textura
 * (UV) a partir da posição local X/Z de cada vértice do disco do
 * mostrador.
 *
 * LIMITAÇÃO que PERSISTE mesmo no `.glb` (documentada, não escondida): os
 * ponteiros do relógio continuam PARADOS — animação de verdade (`KHR_
 * animation`) e a integração de tocar essa animação no motor (Model3DLoader/
 * engine3d.js hoje só faz `getClone` estático, sem playback de clipe) são
 * escopo bem maior que "gere o .glb" — não implementado nesta rodada, fica
 * documentado como próximo passo caso o usuário confirme que quer.
 *
 * USO: `node assets/obj/gerador-glb/gerar_glb.js` — gera (sobrescreve)
 * `assets/modelos/luminaria.glb`, `assets/modelos/poste.glb` e
 * `assets/modelos/relogio.glb`.
 */
const fs = require('fs');
const path = require('path');
const { newMesh, BESPOKE_BUILDERS, OBJECT3D_PROFILES, cross, sub } = require('./gerar_malhas.js');
const { construirGlb } = require('./glb-writer.js');
const { criarContexto2D, paraPngBuffer } = require('./canvas2d-node.js');
const MostradorCanvas = require('../../js/mostrador-canvas.js');

function normalizar(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Achata a malha INDEXADA (`mb.verts`/`mb.faces`/`mb.faceMats`, o mesmo
 *  formato usado por `gerar_malhas.js` pro `.obj`) em 1 primitiva não-
 *  indexada por grupo de material — normais recalculadas por FACE (flat
 *  shading, mesmo estilo do parser `.obj`/`ObjMeshSource` quando o `.obj`
 *  não traz `vn`). `uvFn(nomeMaterial, vertice[x,y,z]) => [u,v]|null` é
 *  opcional — só o material do mostrador do relógio usa (textura); os
 *  demais grupos saem sem `TEXCOORD_0` (não precisam, material sem
 *  textura). */
function achatarPorMaterial(mb, uvFn) {
  const porMaterial = new Map(); // nome -> { positions:[], normals:[], uvs:[]|null }
  mb.faces.forEach((f, idx) => {
    const nomeMat = mb.faceMats[idx] || '_sem_material_';
    const [ia, ib, ic] = f;
    const a = mb.verts[ia - 1], b = mb.verts[ib - 1], c = mb.verts[ic - 1];
    const normal = normalizar(cross(sub(b, a), sub(c, a)));
    if (!porMaterial.has(nomeMat)) porMaterial.set(nomeMat, { positions: [], normals: [], uvs: uvFn ? [] : null });
    const grupo = porMaterial.get(nomeMat);
    for (const v of [a, b, c]) {
      grupo.positions.push(v[0], v[1], v[2]);
      grupo.normals.push(normal[0], normal[1], normal[2]);
      if (uvFn) {
        const uv = uvFn(nomeMat, v) || [0.5, 0.5];
        grupo.uvs.push(uv[0], uv[1]);
      }
    }
  });
  return porMaterial;
}

function gerarGlbBespoke(tipo, materiaisSpec, uvFn) {
  const mb = newMesh();
  BESPOKE_BUILDERS[tipo](mb);
  const porMaterial = achatarPorMaterial(mb, uvFn);
  const nomesMateriais = Array.from(porMaterial.keys());
  const primitivas = [];
  const materiaisGlb = [];
  nomesMateriais.forEach((nomeMat, idx) => {
    const grupo = porMaterial.get(nomeMat);
    const spec = materiaisSpec[nomeMat] || { cor: OBJECT3D_PROFILES[tipo].color };
    materiaisGlb.push({
      nome: nomeMat,
      cor: spec.cor,
      emissivo: !!spec.emissivo,
      opacidade: spec.opacidade,
      texturaPng: spec.texturaPng,
    });
    primitivas.push({
      positions: Float32Array.from(grupo.positions),
      normals: Float32Array.from(grupo.normals),
      uvs: grupo.uvs ? Float32Array.from(grupo.uvs) : null,
      materialIndex: idx,
    });
  });
  return construirGlb({ nomeObjeto: tipo, primitivas, materiais: materiaisGlb });
}

function main() {
  const outDir = path.resolve(__dirname, '..', '..', 'modelos');
  fs.mkdirSync(outDir, { recursive: true });
  const resumo = [];

  // luminaria: 'carcaca' (perfil.color, opaca normal) + 'tubo' (0xf5faff,
  // EMISSIVO — "sempre aceso", ver limitação documentada no topo).
  {
    const glb = gerarGlbBespoke('luminaria', {
      carcaca: { cor: OBJECT3D_PROFILES.luminaria.color },
      tubo: { cor: 0xf5faff, emissivo: true },
    });
    fs.writeFileSync(path.join(outDir, 'luminaria.glb'), glb);
    resumo.push(`luminaria.glb: ${(glb.length / 1024).toFixed(1)} KB (materiais: carcaca, tubo [emissivo])`);
  }

  // poste: 'haste' (perfil.color) + 'lampada' (0xffd9a0, EMISSIVO).
  {
    const glb = gerarGlbBespoke('poste', {
      haste: { cor: OBJECT3D_PROFILES.poste.color },
      lampada: { cor: 0xffd9a0, emissivo: true },
    });
    fs.writeFileSync(path.join(outDir, 'poste.glb'), glb);
    resumo.push(`poste.glb: ${(glb.length / 1024).toFixed(1)} KB (materiais: haste, lampada [emissivo])`);
  }

  // relogio: 'mostrador' (textura PNG assada com assets/js/mostrador-canvas.js,
  // via canvas2d-node.js) + 'ponteiro' (0x2c313a, cor sólida — ponteiros
  // continuam PARADOS, ver limitação documentada no topo).
  {
    const perfil = OBJECT3D_PROFILES.relogio;
    const TAMANHO_TEXTURA = 512; // maior que os 256px ao vivo — .glb é um asset estático, "custa" 1 vez só, vale a nitidez extra
    const corHexFundo = '#' + perfil.color.toString(16).padStart(6, '0');
    const ctx = criarContexto2D(TAMANHO_TEXTURA, TAMANHO_TEXTURA);
    MostradorCanvas.desenhar(ctx, TAMANHO_TEXTURA, corHexFundo);
    const pngBuffer = paraPngBuffer(ctx);
    const r = perfil.r;
    // UV do disco do mostrador: projeta a posição LOCAL (x,z — plano do
    // disco, eixo do cilindro é 'z' nesta peça, ver build_relogio em
    // gerar_malhas.js) num círculo centralizado na textura quadrada, MESMA
    // convenção de centro/raio que assets/js/mostrador-canvas.js desenha
    // (círculo ocupando o quadrado inteiro, raio = metade do lado).
    const uvFn = (nomeMat, v) => {
      if (nomeMat !== 'mostrador') return [0.5, 0.5]; // ponteiro não usa textura — UV irrelevante, nunca lido (grupo sem `texturaPng`)
      return [0.5 + v[0] / (2 * r), 0.5 - v[2] / (2 * r)];
    };
    const glb = gerarGlbBespoke('relogio', {
      mostrador: { cor: perfil.color, texturaPng: pngBuffer },
      ponteiro: { cor: 0x2c313a },
    }, uvFn);
    fs.writeFileSync(path.join(outDir, 'relogio.glb'), glb);
    resumo.push(`relogio.glb: ${(glb.length / 1024).toFixed(1)} KB (materiais: mostrador [textura ${TAMANHO_TEXTURA}x${TAMANHO_TEXTURA}], ponteiro) — ponteiros continuam parados, ver comentário no topo do arquivo`);
  }

  console.log(resumo.join('\n'));
}

if (require.main === module) main();
module.exports = { gerarGlbBespoke, achatarPorMaterial };
