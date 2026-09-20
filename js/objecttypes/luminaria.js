/* js/objecttypes/luminaria.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- mesmo padrão de mesa.js/pilar.js/cadeira.js. Malha 3D
 * extraída ao pé da letra de `js/engine3d.js` (_buildLuminariaMesh); a
 * condição de `matchesMesh3D` é cópia EXATA do `if` que existia no
 * dispatcher original (`_buildOneObjectMeshCore`), preservando a mesma
 * prioridade/comportamento.
 */
class LuminariaMeshBuilder {
    _buildLuminariaMesh(obj, perfil, baseY, wireframe, colWireframe) {
      const THREE = this.THREE;
      const w = perfil.w || 1.2, d = perfil.d || 0.16, h = perfil.h || 0.09;
      const rotY = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
      const cos = Math.cos(rotY), sin = Math.sin(rotY);
      const matCarcaca = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: perfil.color || 0xf2f3f5 });
      // Tubo "aceso" — cor PRÓPRIA (MeshBasicMaterial, não reage à luz da
      // cena), senão pareceria uma lâmpada apagada num ambiente escuro (o
      // motivo de existir a luminária, ver a luz de verdade lá embaixo).
      const matTubo = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshBasicMaterial({ color: 0xf5faff });
      const meshes = [];
      // Folha de metal branco envolvendo a parte de cima da peça.
      const topo = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, Math.max(0.015, h * 0.3), d), matCarcaca);
      topo.position.set(obj.x, baseY + h * 0.85, obj.y);
      topo.rotation.y = rotY;
      meshes.push(topo);
      // 2 lâmpadas compridas, lado a lado, quase do comprimento total da peça.
      const raioTubo = Math.max(0.014, d * 0.11);
      const tuboGeo = new THREE.CylinderGeometry(raioTubo, raioTubo, w * 0.88, 10);
      [-1, 1].forEach((lado) => {
        const lz = lado * d * 0.24; // offset local (perpendicular ao comprimento)
        const wx = obj.x + 0 * cos + lz * sin;
        const wz = obj.y - 0 * sin + lz * cos;
        const tubo = new THREE.Mesh(tuboGeo, matTubo);
        tubo.position.set(wx, baseY + h * 0.35, wz);
        // Eixo do cilindro (Y local) precisa ficar DEITADO ao longo do
        // comprimento da peça — gira 90° em Z antes de aplicar rotY (mesma
        // ordem de composição do Three.js: local primeiro, depois mundo).
        tubo.rotation.z = Math.PI / 2;
        tubo.rotation.y = rotY;
        meshes.push(tubo);
      });
      // Caixas retangulares nas duas extremidades.
      const capGeo = new THREE.BoxGeometry(w * 0.07, h, d * 1.08);
      [-1, 1].forEach((lado) => {
        const lx = lado * (w / 2 - w * 0.035);
        const wx = obj.x + lx * cos + 0 * sin;
        const wz = obj.y - lx * sin + 0 * cos;
        const cap = new THREE.Mesh(capGeo, matCarcaca);
        cap.position.set(wx, baseY + h / 2, wz);
        cap.rotation.y = rotY;
        meshes.push(cap);
      });
      meshes.forEach((m) => this._group.add(m));
      const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
      const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY, shape: 'box', segments: 14 } };
      this.pickables.push(objPick);
      meshes.forEach((m) => { m.userData.pick = objPick; this._pickMeshes.push(m); });

      // Luz de verdade — pedido do usuário: "ela deve deixar o que está
      // próximo mais claro". `distance` limita o ALCANCE (falloff físico até
      // zerar ali, não ilumina o mapa inteiro) e a CONTAGEM de luzes de verdade
      // é limitada por Engine3D.MAX_LUMINARIA_LIGHTS (ver setScene/comentário
      // na constante) — as duas formas de "limite de atuação" pedidas, pra não
      // pesar no desempenho. Cor levemente fria (fluorescente). Só no modo
      // "dinâmico" (ver mapconfig.js modoLuminarias3D) — no modo "leve" a
      // iluminação é só cor (ver _tintForLight, já aplicado no material dos
      // objetos vizinhos), sem NENHUMA luz de verdade, de propósito.
      if (this._config.modoLuminarias3D !== 'leve' && (this._dynamicLights?.length || 0) < this._maxLuzesReais()) {
        const luz = new THREE.PointLight(0xeaf2ff, Engine3D.LUZ_LUMINARIA_INTENSITY, Engine3D.LUZ_LUMINARIA_DISTANCE, 2);
        luz.position.set(obj.x, baseY, obj.y);
        // [14/09/2026] NOVO — marca de quem é essa luz + a intensidade
        // ORIGINAL (antes de qualquer interruptor apagar/acender) — usado por
        // assets/modelos/interruptor.model.js pra achar as `PointLight`
        // reais das luminárias dentro do raio de controle e alternar entre
        // intensidade 0 (apagada) e este valor guardado (sem precisar
        // "adivinhar" `Engine3D.LUZ_LUMINARIA_INTENSITY` de novo, caso mude).
        luz.userData.ownerObjId = obj.id;
        luz.userData._intensidadeOriginal = Engine3D.LUZ_LUMINARIA_INTENSITY;
        this.scene.add(luz);
        this._dynamicLights = this._dynamicLights || [];
        this._dynamicLights.push(luz);
      }
    }
}

window.ObjectTypes.register('luminaria', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'luminaria' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    LuminariaMeshBuilder.prototype._buildLuminariaMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
