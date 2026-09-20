/* js/objecttypes/caixa-generica.js -- tipo de catálogo GENÉRICO (caixa/cilindro/
 * cone a partir de `OBJECT3D_PROFILES['caixa-generica']`), migrado pro registro
 * (mesmo padrão de robo-limpeza.js/robo-copa.js/etc.). Nunca teve builder
 * bespoke -- reaproveita `Engine3D.prototype._buildGenericCatalogMesh`
 * (extraído de `js/engine3d.js`), sem duplicar a malha. Condição de
 * `matchesMesh3D` copia a forma (`shape: 'box'`) do profile em
 * engine3d-profiles.js.
 */
class CaixaGenericaMeshBuilder {
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    engine._buildGenericCatalogMesh(obj, perfil, baseY, wireframe, colWireframe);
  }
}

window.ObjectTypes.register('caixa-generica', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'caixa-generica' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    CaixaGenericaMeshBuilder.prototype.buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
