/* js/objecttypes/pilar.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- pedido verbatim: "Transforme em classe do objeto,
 * metodos, propriedades". Malha 3D extraida de `js/engine3d.js`
 * (`_buildPilarMesh`), preservada ao pe da letra (mesma tecnica de
 * classe auxiliar + `.call(engine, ...)` usada nos tipos anteriores).
 * `matchesMesh3D` e copia EXATA da condicao que estava no `if` antigo do
 * dispatcher (ver `Engine3D.prototype._buildOneObjectMeshCore`).
 */
class PilarMeshBuilder {

  /** [15/09/2026 UTC] NOVO — "Pilar", objeto comum de catálogo (pedido
   *  verbatim: "faça dois novos objetos: 'Mesa' e 'Pilar' [...] O objeto
   *  'Pilar' deve ter a altura que define a distância entre um andar e
   *  outro e dimensões de 120cmx60cm [...] é só um objeto comum" — sem
   *  gizmo/forma especial, um `THREE.BoxGeometry` só, do chão até o teto
   *  do andar onde foi colocado. `w`/`d` vêm de `perfil` (1.2×0.6m, ver
   *  `OBJECT3D_PROFILES.pilar`); `h` NUNCA vem de `perfil.h` (que é só um
   *  valor de fábrica pro ghost/footprint) — sempre `this.mapData?.
   *  alturaPiso` (a distância real entre andares deste mapa), igual
   *  `_buildEscadaMesh` já faz pra escada. */
  _buildPilarMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const w = perfil.w || 1.2, d = perfil.d || 0.6;
    const h = this.mapData?.alturaPiso || 2.8;
    const mat = wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: perfil.color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    const centerY = baseY + h / 2;
    mesh.position.set(obj.x, centerY, obj.y);
    mesh.rotation.y = objAnguloToRotY(obj.angulo);
    this._group.add(mesh);
    const objPos = { x: obj.x, y: centerY, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY: mesh.rotation.y, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);
  }
}

window.ObjectTypes.register('pilar', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'pilar' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    PilarMeshBuilder.prototype._buildPilarMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
