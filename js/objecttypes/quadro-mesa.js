/* js/objecttypes/quadro-mesa.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- mesmo padrão de mesa.js/pilar.js/cadeira.js. Malha 3D
 * extraída ao pé da letra de `js/engine3d.js` (_buildQuadroMesaMesh); a
 * condição de `matchesMesh3D` é cópia EXATA do `if` que existia no
 * dispatcher original (`_buildOneObjectMeshCore`), preservando a mesma
 * prioridade/comportamento.
 */
class QuadroMesaMeshBuilder {
    _buildQuadroMesaMesh(obj, perfil, baseY, wireframe, colWireframe) {
      const THREE = this.THREE;
      const INCLINACAO = 12 * Math.PI / 180; // ~12°, pedido do usuário
      const geo = new THREE.BoxGeometry(perfil.w, perfil.h, perfil.d);
      const mat = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: perfil.color });
      const mesh = new THREE.Mesh(geo, mat);
      // Pivô na base (não no centro) — inclinar em torno do CENTRO faria o
      // porta-retrato "afundar" na mesa de um lado; deslocando a geometria
      // em +h/2 antes de qualquer rotação, a origem do mesh fica na BASE, e
      // a inclinação em X gira o porta-retrato em torno dela mesma (igual um
      // porta-retrato de verdade balançando sobre o pé de apoio).
      geo.translate(0, perfil.h / 2, 0);
      const centerY = baseY + perfil.y0;
      mesh.position.set(obj.x, centerY, obj.y);
      const rotY = objAnguloToRotY(obj.angulo);
      mesh.rotation.set(INCLINACAO, rotY, 0);
      this._group.add(mesh);
      const raioPick = Math.max(perfil.w, perfil.d) * 0.6;
      const objPos = { x: obj.x, y: centerY + perfil.h / 2, z: obj.y };
      const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: raioPick, ref: obj, obb: { half: { x: perfil.w / 2, y: perfil.h / 2, z: perfil.d / 2 }, rotY, shape: 'box', segments: 14 } };
      this.pickables.push(objPick);
      mesh.userData.pick = objPick;
      this._pickMeshes.push(mesh);
    }
}

window.ObjectTypes.register('quadro-mesa', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'quadro-mesa' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    QuadroMesaMeshBuilder.prototype._buildQuadroMesaMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
