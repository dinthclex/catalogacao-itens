/* js/objecttypes/rede-equip.js -- equipamentos de rack 19" (switch,
 * patch panel, DIO, bandejas, PDU, nobreak, storage, espelhos, caixas de
 * piso, abraçadeiras -- todo `tipo` presente em `REDE_CATALOGO.TIPOS`,
 * ver js/rede-equip.js). Malha 3D: reaproveita
 * `Engine3D.prototype._buildRedeMesh` (js/engine3d-rede-mesh.js), que já
 * monta a peça certa a partir do catálogo dinâmico (`RedeEquip.
 * ehEquipRede`) -- um ÚNICO builder cobre TODOS os modelos dessa família
 * (a lista de modelos vive em dados, `REDE_CATALOGO.TIPOS`, não em `if`s
 * separados por tipo).
 */
class RedeEquipMeshBuilder {
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    engine._buildRedeMesh(obj, perfil, baseY, wireframe, colWireframe);
  }
}

window.ObjectTypes.register('rede-equip', {
  matchesMesh3D(obj, perfil) {
    return !!(window.RedeEquip && window.RedeEquip.ehEquipRede(obj.tipo) && perfil.shape === 'box');
  },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    RedeEquipMeshBuilder.prototype.buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
