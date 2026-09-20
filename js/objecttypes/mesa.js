/* js/objecttypes/mesa.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- pedido verbatim: "Transforme em classe do objeto,
 * metodos, propriedades". Malha 3D extraida de `js/engine3d.js`
 * (`_buildMesaMesh`), preservada ao pe da letra (mesma tecnica de
 * classe auxiliar + `.call(engine, ...)` usada nos tipos anteriores).
 * `matchesMesh3D` e copia EXATA da condicao que estava no `if` antigo do
 * dispatcher (ver `Engine3D.prototype._buildOneObjectMeshCore`).
 */
class MesaMeshBuilder {
  _buildMesaMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const rotY = objAnguloToRotY(obj.angulo);
    const { meshes, w, d, h } = this._makeMesaMeshes(obj, perfil, baseY, mat);
    meshes.forEach((m) => this._group.add(m));
    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    // [13/09/2026] NOVO — mesa animada por Script (pedido do usuário, Task 3
    // do prédio de 40 andares: "algumas mesas... também devem ter scripts de
    // animação") — ver `_tagScriptBase`/`_syncScriptedObjectTransforms`.
    const temScriptAtivo = Array.isArray(obj.components) && obj.components.some((c) => c.type === 'Script' && c.enabled !== false);
    meshes.forEach((m) => {
      m.userData.pick = objPick;
      this._pickMeshes.push(m);
      if (temScriptAtivo) this._tagScriptBase(m, obj, baseY);
    });
  }
}

window.ObjectTypes.register('mesa', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'mesa' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    MesaMeshBuilder.prototype._buildMesaMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
