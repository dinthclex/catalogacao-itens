/* js/objecttypes/folha-papel.js
 * [01/10/2026] NOVO (37ª rodada) — "Devemos aproveitar dele o objeto 'Folha de Papel', que deve ser um novo objeto no nosso projeto."
 * Aproveitado de editor_2d_3d_com_folhas_de_anota_o_realistas.html (createPaperTexture/spawnObject 'paper'): a folha é uma textura de
 * canvas (fundo + linhas de caderno + margem vermelha + texto com quebra automática). Diferenças deliberadas em relação ao HTML:
 * tamanho REAL de uma folha A4 (21 x 29,7 cm; o HTML usava 0,8 x 1,0 m só pra ficar visível), e o empilhamento sobre mesas fica por
 * conta do Mapping.addObject (altura automática pela pilha), não do checkPaperOnTable do HTML.
 * Campos do objeto: texto, papelFonte, papelCorTexto; a cor da folha é obj.cor (mesmo campo "Cor" de todo objeto).
 * Texto editado em Propriedades do objeto (seção "Folha de papel") — o duplo clique do HTML não foi portado.
 */
class FolhaPapelMeshBuilder {
  static criarTextura(THREE, texto, bg, corTexto, fonte, opts) {
    // [48ª rodada] opts: { linhas (horizontais), margem (linha vertical vermelha), tam (px da fonte) }
    const o = Object.assign({ linhas: true, margem: true, tam: 30 }, opts || {});
    const tam = Math.max(8, Math.min(80, Number(o.tam) || 30)), lh = Math.round(tam * 34 / 30);
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 724; // proporção A4 (1 : 1,414)
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.02)';
    for (let i = 0; i < 500; i++) ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
    if (o.linhas) for (let y = 46 + lh; y < canvas.height; y += lh) { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(canvas.width - 30, y); ctx.stroke(); }
    if (o.margem) { ctx.strokeStyle = 'rgba(239,68,68,0.2)'; ctx.beginPath(); ctx.moveTo(50, 0); ctx.lineTo(50, canvas.height); ctx.stroke(); }
    ctx.fillStyle = corTexto; ctx.font = tam + 'px ' + fonte; ctx.textBaseline = 'alphabetic';   // [48ª rodada] o texto "senta" na pauta: a linha de base de cada linha de texto = uma linha horizontal
    const marginX = 60, maxWidth = canvas.width - marginX - 30, lineHeight = lh;
    let y = 46 + lh;   // 1ª linha de base = 1ª linha da pauta
    String(texto || '').split('\n').forEach((line) => {
      const words = line.split(' '); let cur = '';
      for (let n = 0; n < words.length; n++) {
        const test = cur + words[n] + ' ';
        if (ctx.measureText(test).width > maxWidth && n > 0) { ctx.fillText(cur, marginX, y); cur = words[n] + ' '; y += lineHeight; }
        else cur = test;
      }
      ctx.fillText(cur, marginX, y); y += lineHeight;
    });
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  _buildFolhaPapelMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const w = perfil.w, d = perfil.d, h = perfil.h;
    const bg = (typeof obj.cor === 'string' && obj.cor) ? obj.cor : '#fef08a';
    const geo = new THREE.BoxGeometry(w, h, d);
    let mat, slotAtlas = null, paramsAtlas = null;
    if (wireframe) {
      mat = new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true });
    } else {
      // [50ª rodada] ATLAS: sem canvas/textura/material por folha -- a folha só aponta (UV) para a sua célula do atlas compartilhado (ver folha-atlas.js).
      const FA = window.FolhaAtlas.init(THREE, { maxTex: this.renderer && this.renderer.capabilities && this.renderer.capabilities.maxTextureSize });
      const params = {
        texto: obj.texto != null ? obj.texto : 'Nova anotação\nEdite o texto em Propriedades.', bg,
        corTexto: obj.papelCorTexto || '#1e293b', fonte: obj.papelFonte || "'Caveat', 'Segoe Print', cursive",
        tam: obj.papelFonteTam || 30, linhas: obj.papelLinhas !== false, margem: obj.papelMargem !== false,
      };
      const { texture, slot } = FA.textureFor(obj.id, params);
      slotAtlas = slot; paramsAtlas = params;
      if (slot) FA.applyUV(geo, 2, slot);   // BoxGeometry: face 2 = +y (topo)
      const lado = FA.sideMaterial(bg);
      // BoxGeometry: índices 0 +x, 1 -x, 2 +y (TOPO, com o texto), 3 -y, 4 +z, 5 -z
      mat = [lado, lado, slot ? FA.materialFor(slot.page) : FA.materialForTexture(texture), lado, lado, lado];
    }
    const mesh = new THREE.Mesh(geo, mat);
    const rotY = objAnguloToRotY(obj.angulo);
    mesh.position.set(obj.x, baseY + h / 2, obj.y);
    mesh.rotation.y = rotY;
    this._group.add(mesh);
    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: Math.max(h / 2, 0.01), z: d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);
    if (!wireframe && window.FolhaAtlas) window.FolhaAtlas.registrar(obj.id, mesh, geo, slotAtlas, paramsAtlas);   // LOD + instanciamento (ver folha-atlas.js)
  }
}

window.ObjectTypes.register('folha-papel', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'folha-papel' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    FolhaPapelMeshBuilder.prototype._buildFolhaPapelMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
