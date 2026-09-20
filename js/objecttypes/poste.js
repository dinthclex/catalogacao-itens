/* js/objecttypes/poste.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- mesmo padrão de mesa.js/pilar.js/cadeira.js. Malha 3D
 * extraída ao pé da letra de `js/engine3d.js` (_buildPosteMesh); a
 * condição de `matchesMesh3D` é cópia EXATA do `if` que existia no
 * dispatcher original (`_buildOneObjectMeshCore`), preservando a mesma
 * prioridade/comportamento.
 */
class PosteMeshBuilder {
    _buildPosteMesh(obj, perfil, baseY, wireframe, colWireframe) {
      const THREE = this.THREE;
      const alturaHaste = perfil.h || 4.5;
      const raioHaste = perfil.r || 0.07;
      const rotY = objAnguloToRotY(obj.angulo);
      const cos = Math.cos(rotY), sin = Math.sin(rotY);
      const matHaste = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: perfil.color || 0x494e57 });
      // Luminária na ponta — cor PRÓPRIA (MeshBasicMaterial, não reage à luz
      // da cena), mesmo motivo do tubo da luminária de teto: precisa parecer
      // "acesa" mesmo no escuro. Tom quente (âmbar, tipo vapor de sódio) —
      // diferente do branco frio da luminária de teto, pra ficar visualmente
      // distinto (lâmpada de rua clássica vs. fluorescente de interior).
      const matLampada = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
      const meshes = [];

      // Haste vertical (leve afunilamento pra base — mais grossa embaixo).
      const hasteGeo = new THREE.CylinderGeometry(raioHaste, raioHaste * 1.3, alturaHaste, 10);
      const haste = new THREE.Mesh(hasteGeo, matHaste);
      haste.position.set(obj.x, baseY + alturaHaste / 2, obj.y);
      meshes.push(haste);

      // Braço: um trecho reto na direção "de frente" do poste (obj.angulo),
      // saindo de perto do topo da haste — versão simplificada de um braço
      // curvo (formato real de poste de rua), suficiente pra "ver que ali tem
      // um poste com luminária apontando pra um lado", igual ao nível de
      // detalhe já aceito nos outros perfis deste arquivo.
      const comprimentoBraco = 0.9;
      const raioBraco = raioHaste * 0.75;
      const yBraco = baseY + alturaHaste - 0.05;
      const bracoGeo = new THREE.CylinderGeometry(raioBraco, raioBraco, comprimentoBraco, 8);
      const braco = new THREE.Mesh(bracoGeo, matHaste);
      const lx = comprimentoBraco / 2;
      braco.position.set(obj.x + lx * cos, yBraco, obj.y - lx * sin);
      braco.rotation.z = Math.PI / 2; // deita o cilindro (eixo Y local -> horizontal)
      braco.rotation.y = rotY;
      meshes.push(braco);

      // Luminária: cone virado pra baixo na ponta do braço (silhueta clássica
      // de poste de rua, vista de baixo).
      const lampGeo = new THREE.ConeGeometry(0.16, 0.22, 10);
      const lamp = new THREE.Mesh(lampGeo, matLampada);
      const wx = obj.x + comprimentoBraco * cos, wz = obj.y - comprimentoBraco * sin;
      const lampY = yBraco - 0.16;
      lamp.position.set(wx, lampY, wz);
      lamp.rotation.x = Math.PI; // ponta do cone pra baixo
      meshes.push(lamp);

      meshes.forEach((m) => this._group.add(m));
      const objPos = { x: obj.x, y: baseY + alturaHaste / 2, z: obj.y };
      const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(alturaHaste / 2, comprimentoBraco), ref: obj, obb: { half: { x: raioHaste * 3, y: alturaHaste / 2, z: raioHaste * 3 }, rotY, shape: 'cylinder', segments: 10 } };
      this.pickables.push(objPick);
      meshes.forEach((m) => { m.userData.pick = objPick; this._pickMeshes.push(m); });

      // Luz de verdade — SEMPRE (ver decisão de design documentada acima),
      // cor quente (mesmo tom da lâmpada, sódio). Mesmo orçamento
      // compartilhado das luminárias (`_maxLuzesReais`). AJUSTADO
      // (02/09/2026) — intensidade/alcance agora são `LUZ_LUMINARIA_*` × 3
      // (ver constantes/comentário grande logo acima de `_maxLuzesReais`),
      // pedido verbatim: "O poste de luz deve iluminar 3 vezes o que a
      // luminária ilumina."
      if ((this._dynamicLights?.length || 0) < this._maxLuzesReais()) {
        const luz = new THREE.PointLight(0xffcf8c, Engine3D.LUZ_POSTE_INTENSITY, Engine3D.LUZ_POSTE_DISTANCE, 2);
        luz.position.set(wx, lampY, wz);
        // [13/09/2026] NOVO — `ownerObjId` (mesmo campo já usado pela luz da
        // luminária, ver `_buildLuminariaMesh`/linha com
        // `luz.userData.ownerObjId = obj.id`, ~10 linhas acima na função
        // irmã): faltava aqui, o que impedia qualquer código (ex.: um
        // interruptor) de achar "a luz de verdade DESTE poste" por id —
        // necessário pro `interruptor-remoto.model.js` novo (TAREFA 5 do
        // backlog: painel de controle remoto que liga/desliga uma LISTA
        // de postes por id, de longe, sem raio físico).
        luz.userData.ownerObjId = obj.id;
        this.scene.add(luz);
        this._dynamicLights = this._dynamicLights || [];
        this._dynamicLights.push(luz);
      }
    }
}

window.ObjectTypes.register('poste', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'poste' && perfil.shape === 'cylinder'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    PosteMeshBuilder.prototype._buildPosteMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
