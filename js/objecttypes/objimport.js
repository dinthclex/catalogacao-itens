/* js/objecttypes/objimport.js
 * Tipo "objimport" (arquivo .obj importado pelo usuário, rodada 51 -- ver
 * js/objimport.js) migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- pedido verbatim: "Os objetos importados pelo usuário
 * (obimport) devem passar pelo registro como um objeto normal."
 *
 * IDENTIFICAÇÃO DINÂMICA: `obj.tipo` não é um valor fixo de catálogo aqui
 * -- é a CHAVE em memória de CADA arquivo importado (`objimport:<algo>`,
 * ver `ObjImport.isCustomKey`), diferente pra cada importação distinta do
 * usuário. Por isso `matchesMesh3D` não compara `obj.tipo` a uma string
 * fixa (como todo outro tipo do registro) -- usa o PREDICADO
 * `ObjImport.isCustomKey(obj.tipo)`, mesmo espírito de `imagem.js`
 * (identificado por `obj.forma`, não por um `tipo` fixo).
 *
 * MESMO MOTIVO/MESMO PADRÃO de `imagem.js` pro PONTO DE DISPATCH: chamado
 * de um lugar específico em `engine3d.js` (`_buildOneObjectMeshCore`),
 * ANTES de `perfil` existir (objimport nem usa `OBJECT3D_PROFILES`) --
 * busca esta definição via `window.ObjectTypes.get('objimport')` e chama
 * direto, checando o `true`/`false` de retorno (arquivo pode não estar
 * mais em memória depois de um refresh -- nesse caso cai no perfil
 * genérico, como sempre).
 */
class ObjImportMeshBuilder {

  /** Malha de um objeto importado de arquivo .obj (rodada 51 — ver
   *  js/objimport.js). `ObjImport.getGeometryData(key)` devolve os vértices
   *  já triangulados (posições, normais quando o próprio .obj trouxe, e a
   *  caixa delimitadora bruta do arquivo) SEM depender de Three.js — é este
   *  método que monta a `THREE.BufferGeometry` de verdade, igual a
   *  qualquer outra malha do motor. Recentraliza no eixo horizontal (X/Z)
   *  pelo CENTRO da caixa delimitadora do arquivo, e assenta a BASE (Y
   *  mínimo do arquivo) no chão (`baseY`) — um .obj comum, modelado em
   *  qualquer editor externo, raramente já nasce com a origem exatamente
   *  no meio da base, então sem isso a peça apareceria flutuando ou
   *  enterrada, ou fora do centro do "quadrado" onde foi clicada. Devolve
   *  `false` (sem adicionar nada) se o arquivo não está mais em memória
   *  (RAM apagada por um refresh de página, ver comentário no dispatcher
   *  acima) ou não tem geometria válida, pra quem chama cair no perfil
   *  genérico em vez de travar. */
  _buildObjImportMesh(obj, baseY, wireframe, colWireframe) {
    const data = window.ObjImport?.getGeometryData(obj.tipo);
    if (!data) return false;
    const THREE = this.THREE;
    // NOVO (07/09/2026), pedido verbatim: "Mesmo que seja um arquivo com
    // apenas um grupo de vértices, sem definição de faces [...] renderizar
    // a forma mesmo assim." — `data.positions === null` (ver objimport.js
    // `_parseObjText`) é exatamente esse caso: .obj só com linhas "v", sem
    // nenhum "f". Antes isso fazia esta função devolver `false` (nada
    // aparecia — caía no perfil genérico do dispatcher). Agora vira uma
    // NUVEM DE PONTOS (THREE.Points) com os vértices crus (`data.points`,
    // já achatado por `_parseObjText`), recentralizada pela mesma caixa
    // delimitadora usada pro caminho normal (mesh triangulada) logo abaixo
    // — mesmo posicionamento/rotação, só a geometria/material que mudam.
    if (!data.positions) {
      if (!data.points || data.points.length < 3) return false; // nada mesmo (nem 1 vértice) — cai no perfil genérico
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.Float32BufferAttribute(data.points, 3));
      const bb = data.bbox;
      pgeo.translate(-(bb.minX + bb.maxX) / 2, -bb.minY, -(bb.minZ + bb.maxZ) / 2);
      const pmat = new THREE.PointsMaterial({ color: _hexToThreeColor(obj.cor || '#9aa4b2'), size: 0.05, sizeAttenuation: true });
      const points = new THREE.Points(pgeo, pmat);
      points.position.set(obj.x, baseY, obj.y);
      points.rotation.y = objAnguloToRotY(obj.angulo);
      this._group.add(points);
      const objPos = { x: obj.x, y: baseY, z: obj.y };
      const w = Math.max(0.05, bb.maxX - bb.minX), d = Math.max(0.05, bb.maxZ - bb.minZ);
      const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: 0.05, z: d / 2 }, rotY: points.rotation.y, shape: 'box', segments: 14 } };
      this.pickables.push(objPick);
      points.userData.pick = objPick;
      this._pickMeshes.push(points);
      return true;
    }
    if (data.positions.length < 9) return false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    if (data.normals) geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    else geo.computeVertexNormals();
    // Recentraliza X/Z no meio da caixa delimitadora do arquivo e desloca Y
    // pra a base (mínimo) ficar em 0 — feito na PRÓPRIA geometria (não só
    // na posição da malha), pra a rotação (`mesh.rotation.y`, aplicada
    // depois) girar em torno do centro de verdade da peça, não de um canto
    // qualquer do arquivo original.
    const bb = data.bbox;
    geo.translate(-(bb.minX + bb.maxX) / 2, -bb.minY, -(bb.minZ + bb.maxZ) / 2);
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: _hexToThreeColor(obj.cor || '#9aa4b2') });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(obj.x, baseY, obj.y);
    mesh.rotation.y = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
    this._group.add(mesh);
    const w = bb.maxX - bb.minX, d = bb.maxZ - bb.minZ, h = bb.maxY - bb.minY;
    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6 || 0.3, ref: obj, obb: { half: { x: w / 2 || 0.2, y: h / 2 || 0.2, z: d / 2 || 0.2 }, rotY: mesh.rotation.y, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);
    return true;
  }

}

window.ObjectTypes.register('objimport', {
  matchesMesh3D(obj) { return !!window.ObjImport?.isCustomKey(obj.tipo); },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    return ObjImportMeshBuilder.prototype._buildObjImportMesh.call(engine, obj, baseY, wireframe, colWireframe);
  },
});
