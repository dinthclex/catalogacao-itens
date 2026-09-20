/* js/objecttypes/eletrocalha.js -- Eletrocalha: peça única de tamanho fixo (caixa a partir de
 * `OBJECT3D_PROFILES['eletrocalha']`), sem motor de desenho próprio -- mesmo padrão de
 * impressora.js (reaproveita `Engine3D.prototype._buildGenericCatalogMesh`).
 */
window.ObjectTypes.register('eletrocalha', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'eletrocalha' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    engine._buildGenericCatalogMesh(obj, perfil, baseY, wireframe, colWireframe);
  },
});
