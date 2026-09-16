#!/usr/bin/env node
/* assets/obj/gerador-glb/glb-writer.js
 * [16/09/2026 UTC] NOVO — escritor de glTF binário (.glb) mínimo, escrito
 * do zero a partir da especificação (https://registry.khronos.org/glTF/),
 * sem NENHUMA dependência externa (sem `gltf-pipeline`/`three.js` rodando
 * em Node) — mesmo espírito "sem dependência nativa, funciona offline" do
 * resto das ferramentas deste projeto (`gerar_malhas.js`/
 * `canvas2d-node.js`).
 *
 * PRA QUE SERVE: `assets/obj/gerador-glb/gerar_glb.js` usa isto pra gerar
 * `assets/modelos/luminaria.glb`/`poste.glb`/`relogio.glb` — os 3 tipos
 * cujas limitações (material "sempre aceso"/textura do mostrador) só um
 * formato com material PBR de verdade (`emissiveFactor`) e textura
 * embutida (glTF permite imagem binária dentro do PRÓPRIO `.glb`, sem
 * arquivo `.png` separado) resolvem — ver a pergunta do usuário "que tipo
 * de arquivo pode resolver todas as limitações?" respondida no chat.
 *
 * ESCOPO (mínimo, mas suficiente pros 3 tipos acima): 1 malha, N
 * primitivas (1 por grupo de material — TRIANGLES, NÃO indexado, mesmo
 * espírito do `.obj` gerado por `gerar_malhas.js`), 1 material PBR por
 * primitiva (`baseColorFactor` + opcional `emissiveFactor` "sempre
 * aceso"/opcional `alphaMode:'BLEND'`+`baseColorFactor[3]` pra
 * semitransparência), 1 imagem/textura PNG opcional embutida (usada só
 * pelo mostrador do relógio). NÃO IMPLEMENTADO (fora do que os 3 tipos
 * precisam): esqueleto/skinning, animação (`KHR_animation`/canais de
 * keyframe — ver limitação "ponteiros parados" documentada em
 * progresso-sessao.md, que CONTINUA existindo mesmo no `.glb` por esse
 * motivo), múltiplas malhas/cenas, LODs, compressão Draco.
 */

/** `primitivas`: array de `{ positions: Float32Array (x,y,z por vértice,
 *  NÃO indexado), normals: Float32Array (mesmo tamanho), uvs: Float32Array
 *  opcional (u,v por vértice — só quando o material da primitiva usa
 *  textura), materialIndex: number }`.
 *  `materiais`: array de `{ nome, cor: 0xrrggbb, emissivo?: true (glow
 *  "sempre aceso" — pedido implícito nas limitações documentadas),
 *  opacidade?: number (< 1 = `alphaMode:'BLEND'`), texturaPng?: Buffer
 *  (PNG bruto — vira `baseColorTexture` deste material) }`.
 *  Devolve um `Buffer` pronto pra `fs.writeFileSync(caminho, buffer)`. */
function construirGlb({ primitivas, materiais, nomeObjeto }) {
  const bufferChunks = []; // partes binárias concatenadas, na ordem em que são adicionadas
  let byteOffsetAtual = 0;
  const bufferViews = [];
  function adicionarBufferView(dataBuffer, target) {
    // Alinhamento de 4 bytes entre bufferViews — boa prática glTF (mesmo
    // sem ser estritamente exigido pra todo tipo de view), evita qualquer
    // ambiguidade de leitor.
    const resto = byteOffsetAtual % 4;
    if (resto !== 0) {
      const pad = Buffer.alloc(4 - resto);
      bufferChunks.push(pad);
      byteOffsetAtual += pad.length;
    }
    const idx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: byteOffsetAtual, byteLength: dataBuffer.length, ...(target ? { target } : {}) });
    bufferChunks.push(dataBuffer);
    byteOffsetAtual += dataBuffer.length;
    return idx;
  }

  const accessors = [];
  const images = [];
  const textures = [];
  const gltfMateriais = materiais.map((m) => {
    const r = ((m.cor >> 16) & 0xff) / 255, g = ((m.cor >> 8) & 0xff) / 255, b = (m.cor & 0xff) / 255;
    const opacidade = (typeof m.opacidade === 'number') ? m.opacidade : 1;
    const mat = {
      name: m.nome,
      pbrMetallicRoughness: {
        baseColorFactor: [r, g, b, opacidade],
        metallicFactor: 0,
        roughnessFactor: 0.85,
      },
    };
    if (m.emissivo) {
      // "Sempre aceso" — glow que não depende da luz da cena (ver limitação
      // documentada: `.mtl` não tinha como expressar isso, `.glb`/PBR tem).
      mat.emissiveFactor = [r, g, b];
    }
    if (opacidade < 1) mat.alphaMode = 'BLEND';
    if (m.texturaPng) {
      const bvIdx = adicionarBufferView(m.texturaPng, null);
      const imgIdx = images.length;
      images.push({ bufferView: bvIdx, mimeType: 'image/png' });
      const texIdx = textures.length;
      textures.push({ source: imgIdx });
      mat.pbrMetallicRoughness.baseColorTexture = { index: texIdx };
      // Com textura, a cor de base (que já carrega a cor de fundo do
      // mostrador) deve ficar branca — a IMAGEM já tem a cor certa
      // pintada nela (mesma convenção usada em engine3d.js
      // `_buildRelogioMesh`: `color: 0xffffff` + `map`, ver comentário lá).
      mat.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, opacidade];
    }
    return mat;
  });

  const meshPrimitivas = primitivas.map((p) => {
    const nVerts = p.positions.length / 3;
    const posBuf = Buffer.from(p.positions.buffer, p.positions.byteOffset, p.positions.byteLength);
    const posBvIdx = adicionarBufferView(posBuf, 34962); // ARRAY_BUFFER
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < nVerts; i++) {
      const x = p.positions[i * 3], y = p.positions[i * 3 + 1], z = p.positions[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const posAccIdx = accessors.length;
    accessors.push({ bufferView: posBvIdx, componentType: 5126, count: nVerts, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });

    const normBuf = Buffer.from(p.normals.buffer, p.normals.byteOffset, p.normals.byteLength);
    const normBvIdx = adicionarBufferView(normBuf, 34962);
    const normAccIdx = accessors.length;
    accessors.push({ bufferView: normBvIdx, componentType: 5126, count: nVerts, type: 'VEC3' });

    const attributes = { POSITION: posAccIdx, NORMAL: normAccIdx };
    if (p.uvs) {
      const uvBuf = Buffer.from(p.uvs.buffer, p.uvs.byteOffset, p.uvs.byteLength);
      const uvBvIdx = adicionarBufferView(uvBuf, 34962);
      const uvAccIdx = accessors.length;
      accessors.push({ bufferView: uvBvIdx, componentType: 5126, count: nVerts, type: 'VEC2' });
      attributes.TEXCOORD_0 = uvAccIdx;
    }
    return { attributes, mode: 4, material: p.materialIndex }; // mode 4 = TRIANGLES, sem "indices" (não-indexado)
  });

  const json = {
    asset: { version: '2.0', generator: 'assets/obj/gerador-glb/glb-writer.js (catalogacao-itens)' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: nomeObjeto }],
    meshes: [{ name: nomeObjeto, primitives: meshPrimitivas }],
    materials: gltfMateriais,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffsetAtual }],
  };
  if (images.length) json.images = images;
  if (textures.length) json.textures = textures;

  const binBuffer = Buffer.concat(bufferChunks, byteOffsetAtual);
  let jsonStr = JSON.stringify(json);
  // Chunk JSON precisa terminar alinhado em 4 bytes — glTF pede padding com
  // espaço (0x20) pro chunk JSON e zero (0x00) pro chunk BIN.
  while (jsonStr.length % 4 !== 0) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  let binPadded = binBuffer;
  if (binPadded.length % 4 !== 0) {
    binPadded = Buffer.concat([binPadded, Buffer.alloc(4 - (binPadded.length % 4))]);
  }

  const totalLength = 12 + (8 + jsonBuf.length) + (8 + binPadded.length);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4); // versão glTF 2.0
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.write('JSON', 4, 'ascii');

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binPadded.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0' little-endian

  return Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binPadded]);
}

module.exports = { construirGlb };
