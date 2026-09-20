/* js/objecttypes/cadeira.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- pedido verbatim: "Transforme em classe do objeto,
 * metodos, propriedades". Malha 3D extraida de `js/engine3d.js`
 * (`_buildCadeiraMesh`), preservada ao pe da letra (mesma tecnica de
 * classe auxiliar + `.call(engine, ...)` usada nos tipos anteriores).
 * `matchesMesh3D` e copia EXATA da condicao que estava no `if` antigo do
 * dispatcher (ver `Engine3D.prototype._buildOneObjectMeshCore`).
 */
class CadeiraMeshBuilder {

  _buildCadeiraMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const w = perfil.w || 0.45, d = perfil.d || 0.45;
    const h = (perfil.y0 || 0) + (perfil.h != null ? perfil.h : 0.9); // altura total chão -> topo do encosto
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const rotY = objAnguloToRotY(obj.angulo);
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const assentoEsp = 0.04;
    const assentoAltura = Math.min(0.46, h * 0.5); // altura real de assento de cadeira (~45cm do chão)
    const pernaEsp = Math.max(0.025, Math.min(0.04, Math.min(w, d) * 0.08));
    const margem = pernaEsp * 1.3; // perna recuada pra DENTRO do assento, não na quina (mesmo pedido já feito pra mesa)
    const pernaAltura = Math.max(0.05, assentoAltura - assentoEsp / 2);
    const encostoEsp = 0.035;
    const encostoAltura = Math.max(0.1, h - assentoAltura);
    const meshes = [];

    const assento = new THREE.Mesh(new THREE.BoxGeometry(w, assentoEsp, d), mat);
    assento.position.set(obj.x, baseY + assentoAltura - assentoEsp / 2, obj.y);
    assento.rotation.y = rotY;
    meshes.push(assento);

    // 4 cantos em coordenadas LOCAIS (antes de girar) — mesma técnica
    // local->mundo de `_makeMesaMeshes` (cos/sin de `objAnguloToRotY`).
    const cornersLocal = [
      [w / 2 - margem, d / 2 - margem], [-(w / 2 - margem), d / 2 - margem],
      [w / 2 - margem, -(d / 2 - margem)], [-(w / 2 - margem), -(d / 2 - margem)],
    ];
    const pernaGeo = new THREE.BoxGeometry(pernaEsp, pernaAltura, pernaEsp);
    cornersLocal.forEach(([lx, lz]) => {
      const wx = obj.x + lx * cos + lz * sin;
      const wz = obj.y - lx * sin + lz * cos;
      const perna = new THREE.Mesh(pernaGeo, mat);
      perna.position.set(wx, baseY + pernaAltura / 2, wz);
      perna.rotation.y = rotY;
      meshes.push(perna);
    });

    // Encosto: painel fino vertical na borda TRASEIRA do assento (local
    // Z negativo — "trás" da cadeira, oposto de onde alguém senta de frente).
    const encostoLocalZ = -(d / 2 - margem);
    const ex = obj.x + encostoLocalZ * sin;
    const ez = obj.y + encostoLocalZ * cos;
    const encosto = new THREE.Mesh(new THREE.BoxGeometry(w - margem * 2, encostoAltura, encostoEsp), mat);
    encosto.position.set(ex, baseY + assentoAltura + encostoAltura / 2, ez);
    encosto.rotation.y = rotY;
    meshes.push(encosto);

    meshes.forEach((m) => this._group.add(m));
    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.65, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    const temScriptAtivo = Array.isArray(obj.components) && obj.components.some((c) => c.type === 'Script' && c.enabled !== false);
    meshes.forEach((m) => {
      m.userData.pick = objPick;
      this._pickMeshes.push(m);
      if (temScriptAtivo) this._tagScriptBase(m, obj, baseY);
    });
  }
}

window.ObjectTypes.register('cadeira', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'cadeira' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    CadeiraMeshBuilder.prototype._buildCadeiraMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
