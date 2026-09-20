/* js/objecttypes/robo-limpeza.js
 * Tipo de objeto do catálogo (pedido verbatim: "Os robôs [robo-copa/
 * robo-limpeza/robo-recepcionista] devem ser do catálogo normal também").
 * Malha 3D: reaproveita `Engine3D.prototype._buildGenericCatalogMesh`
 * (extraído de `js/engine3d.js` -- o builder genérico de caixa/cilindro/
 * cone a partir de `OBJECT3D_PROFILES[obj.tipo]`, usado por vários tipos
 * ainda não migrados) -- este robô nunca teve geometria bespoke, sempre
 * foi um cilindro colorido simples (ver `engine3d-profiles.js`), então
 * registrar aqui só MOVE A DECISÃO pro registro, sem duplicar a malha.
 */
class RoboLimpezaMeshBuilder {
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    engine._buildGenericCatalogMesh(obj, perfil, baseY, wireframe, colWireframe);
  }
}

window.ObjectTypes.register('robo-limpeza', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'robo-limpeza' && perfil.shape === 'cylinder'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    RoboLimpezaMeshBuilder.prototype.buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
