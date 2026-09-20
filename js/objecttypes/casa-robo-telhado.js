/* js/objecttypes/casa-robo-telhado.js -- tipo de catálogo GENÉRICO (caixa/cilindro/
 * cone a partir de `OBJECT3D_PROFILES['casa-robo-telhado']`), migrado pro registro
 * (mesmo padrão de robo-limpeza.js/robo-copa.js/etc.). Nunca teve builder
 * bespoke -- reaproveita `Engine3D.prototype._buildGenericCatalogMesh`
 * (extraído de `js/engine3d.js`), sem duplicar a malha. Condição de
 * `matchesMesh3D` copia a forma (`shape: 'cone'`) do profile em
 * engine3d-profiles.js.
 */
class CasaRoboTelhadoMeshBuilder {
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    engine._buildGenericCatalogMesh(obj, perfil, baseY, wireframe, colWireframe);
  }
}

window.ObjectTypes.register('casa-robo-telhado', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'casa-robo-telhado' && perfil.shape === 'cone'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    CasaRoboTelhadoMeshBuilder.prototype.buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
