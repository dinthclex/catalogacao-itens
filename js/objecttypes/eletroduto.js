/* js/objecttypes/eletroduto.js -- Eletroduto: peça única de tamanho fixo (caixa a partir de
 * `OBJECT3D_PROFILES['eletroduto']`), sem motor de desenho próprio -- mesmo padrão de
 * impressora.js (reaproveita `Engine3D.prototype._buildGenericCatalogMesh`).
 */
window.ObjectTypes.register('eletroduto', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'eletroduto' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    engine._buildGenericCatalogMesh(obj, perfil, baseY, wireframe, colWireframe);
  },
});
