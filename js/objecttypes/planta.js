/* js/objecttypes/planta.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- mesmo padrão de mesa.js/pilar.js/cadeira.js. Malha 3D
 * extraída ao pé da letra de `js/engine3d.js` (_buildPlantaMesh); a
 * condição de `matchesMesh3D` é cópia EXATA do `if` que existia no
 * dispatcher original (`_buildOneObjectMeshCore`), preservando a mesma
 * prioridade/comportamento.
 */
class PlantaMeshBuilder {
    _buildPlantaMesh(obj, perfil, baseY, wireframe, colWireframe) {
      const THREE = this.THREE;
      const r = perfil.r || 0.3;
      const hTotal = perfil.h || 0.7;
      const rotY = objAnguloToRotY(obj.angulo);
      const potR = r * 0.6, potRTopo = potR * 1.15;
      const potH = Math.min(0.3, hTotal * 0.35);
      const folhaR = r;
      const folhaH = Math.max(0.1, hTotal - potH);
      const matVaso = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: 0xb5651d }); // terracota
      const matFolha = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: perfil.color });
      const meshes = [];

      // Vaso: tronco de cone (CylinderGeometry aceita raioTopo != raioBase —
      // topo mais largo que a base, formato clássico de vaso de planta).
      const vaso = new THREE.Mesh(new THREE.CylinderGeometry(potRTopo, potR, potH, 12), matVaso);
      vaso.position.set(obj.x, baseY + potH / 2, obj.y);
      vaso.rotation.y = rotY;
      meshes.push(vaso);

      // Folhagem: cone verde (mesma forma de antes), agora sentada em cima
      // da boca do vaso em vez de flutuar desde o chão.
      const folha = new THREE.Mesh(new THREE.ConeGeometry(folhaR, folhaH, 12), matFolha);
      folha.position.set(obj.x, baseY + potH + folhaH / 2, obj.y);
      folha.rotation.y = rotY;
      meshes.push(folha);

      meshes.forEach((m) => this._group.add(m));
      const hFull = potH + folhaH;
      const objPos = { x: obj.x, y: baseY + hFull / 2, z: obj.y };
      const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(potRTopo, folhaR) * 1.1, ref: obj, obb: { half: { x: folhaR, y: hFull / 2, z: folhaR }, rotY, shape: 'cylinder', segments: 12 } };
      this.pickables.push(objPick);
      const temScriptAtivo = Array.isArray(obj.components) && obj.components.some((c) => c.type === 'Script' && c.enabled !== false);
      meshes.forEach((m) => {
        m.userData.pick = objPick;
        this._pickMeshes.push(m);
        if (temScriptAtivo) this._tagScriptBase(m, obj, baseY);
      });
    }
}

window.ObjectTypes.register('planta', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'planta' && perfil.shape === 'cone'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    PlantaMeshBuilder.prototype._buildPlantaMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
