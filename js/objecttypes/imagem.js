/* js/objecttypes/imagem.js
 * Tipo "imagem" (colar/carregar, ver mapview.js `obj.forma:'imagem'`)
 * migrado pro registro (`js/objecttypes/object-type-registry.js`).
 *
 * [20/09/2026 UTC] Pedido verbatim: "Sobre a imagem, em vez de ajustar ao
 * contrato, ajuste a imagem para que fique homogêneo a estrutura do
 * Mapview." — `buildMesh3D` agora usa a MESMA assinatura de todo tipo do
 * registro (`engine, obj, perfil, baseY, wireframe, colWireframe`), igual
 * mesa/pilar/cadeira/etc., mesmo `perfil` e `wireframe`/`colWireframe` não
 * sendo usados aqui (imagem não tem "forma de caixa/cilindro" nem
 * wireframe — é sempre uma folha plana com textura).
 *
 * IDENTIFICAÇÃO POR `obj.forma`, NÃO por `obj.tipo` (diferente de todo
 * outro tipo migrado até agora) — por isso `matchesMesh3D` checa
 * `obj.forma === 'imagem'`. E por causa disso o DISPATCH continua vindo de
 * um ponto específico em `engine3d.js` (`_buildOneObjectMeshCore`, ANTES
 * de `perfil` ser calculado — imagem nem usa `OBJECT3D_PROFILES`), que
 * busca esta definição via `window.ObjectTypes.get('imagem')` e chama
 * `buildMesh3D` direto, em vez de passar pela checagem genérica
 * `tryBuildMesh3D` (que já assume `perfil` pronto). Mesmo assim o objeto
 * fica registrado aqui, com sua própria classe/métodos — só o PONTO DE
 * CHAMADA no dispatcher é especial, não o formato do tipo em si.
 */
class ImagemMeshBuilder {
  _buildImagemMesh(obj, baseY) {
    const THREE = this.THREE;
    const w = Math.max(0.05, obj.largura || 0.5), d = Math.max(0.05, obj.profundidade || 0.5);
    const layer = (this.mapData?.layers || []).find((l) => l.id === obj.layerId);
    const opacidade = layer?.opacidade != null ? Utils.clamp(layer.opacidade, 0, 255) / 255 : 1;
    const texture = obj.src ? new THREE.TextureLoader().load(obj.src) : null;
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      color: texture ? 0xffffff : _hexToThreeColor(obj.cor || '#8a92a3'), // sem `src` válido (não deveria acontecer) — cai numa placa lisa da cor do objeto, em vez de ficar invisível
      transparent: true, opacity: opacidade, side: THREE.DoubleSide, depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2); // deita na horizontal, virada pra CIMA
    const mesh = new THREE.Mesh(geo, mat);
    // Levemente ACIMA do chão (poucos mm) — evita "brigar" com o piso
    // xadrez por baixo (z-fight) quando elevacao=0 (deitada bem em cima
    // dele, o caso mais comum — um "tapete"/decalque no chão).
    mesh.position.set(obj.x, baseY + 0.004, obj.y);
    mesh.rotation.y = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
    this._group.add(mesh);
    const objPos = { x: obj.x, y: baseY, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: 0.05, z: d / 2 }, rotY: mesh.rotation.y, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    mesh.userData.pick = objPick;
    this._pickMeshes.push(mesh);
  }
}

window.ObjectTypes.register('imagem', {
  matchesMesh3D(obj) { return obj.forma === 'imagem'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    ImagemMeshBuilder.prototype._buildImagemMesh.call(engine, obj, baseY);
  },
});
