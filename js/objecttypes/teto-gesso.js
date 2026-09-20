/* js/objecttypes/teto-gesso.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- mesmo padrão dos demais. Malha 3D extraída ao pé da
 * letra de `js/engine3d.js` (_buildTetoGessoMesh); a condição de
 * `matchesMesh3D` é cópia EXATA do `if` que existia no dispatcher
 * original (`_buildOneObjectMeshCore`).
 */
class TetoGessoMeshBuilder {
    _buildTetoGessoMesh(obj, perfil, baseY, wireframe, colWireframe) {
      const THREE = this.THREE;
      const group = new THREE.Group();
      const matPlaca = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: perfil.color });
      const placaGeo = new THREE.BoxGeometry(perfil.w, perfil.h, perfil.d);
      const placa = new THREE.Mesh(placaGeo, matPlaca);
      group.add(placa);
      // Rodelas de acesso: grid espaçado a cada 2m, começando perto de uma
      // borda (não centralizado exatamente na borda, pra não cortar metade da
      // rodela pra fora da placa) — mesma ideia do grid do retículo métrico
      // (`obj.reticuloMetrico`) logo abaixo neste arquivo, só que fixo em 2m
      // e sem opção de configurar (pedido não pediu controle nenhum pro
      // usuário aqui, só o efeito visual).
      if (!wireframe) {
        const ESPACAMENTO = 2; // metros
        const RAIO_RODELA = 0.075; // 15cm de diâmetro
        const ESPESSURA_RODELA = 0.01; // 1cm
        const matRodela = new THREE.MeshLambertMaterial({ color: 0xc7cbd1 });
        const rodelaGeo = new THREE.CylinderGeometry(RAIO_RODELA, RAIO_RODELA, ESPESSURA_RODELA, 16);
        const hw = perfil.w / 2, hd = perfil.d / 2;
        const margem = Math.min(ESPACAMENTO / 2, hw, hd);
        for (let x = -hw + margem; x <= hw - margem + 1e-6; x += ESPACAMENTO) {
          for (let z = -hd + margem; z <= hd - margem + 1e-6; z += ESPACAMENTO) {
            const rodela = new THREE.Mesh(rodelaGeo, matRodela);
            // Face de BAIXO da placa: -perfil.h/2 (centro da placa é y=0 no
            // espaço local do grupo) menos metade da espessura da rodela,
            // menos uma folga mínima só pra evitar z-fighting.
            rodela.position.set(x, -perfil.h / 2 - ESPESSURA_RODELA / 2 - 0.0005, z);
            group.add(rodela);
          }
        }
      }
      const centerY = baseY + perfil.y0 + perfil.h / 2;
      group.position.set(obj.x, centerY, obj.y);
      group.rotation.y = objAnguloToRotY(obj.angulo);
      this._group.add(group);
      const raioPick = Math.max(perfil.w || 0.5, perfil.d || 0.5) * 0.6;
      const objPos = { x: obj.x, y: centerY, z: obj.y };
      const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: raioPick, ref: obj, obb: { half: { x: perfil.w / 2, y: perfil.h / 2, z: perfil.d / 2 }, rotY: group.rotation.y, shape: 'box', segments: 14 } };
      this.pickables.push(objPick);
      group.userData.pick = objPick;
      this._pickMeshes.push(group);
      if (Array.isArray(obj.components) && obj.components.some((c) => c.type === 'Script' && c.enabled !== false)) this._tagScriptBase(group, obj, baseY);
    }
}

window.ObjectTypes.register('teto-gesso', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'teto-gesso' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    TetoGessoMeshBuilder.prototype._buildTetoGessoMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
