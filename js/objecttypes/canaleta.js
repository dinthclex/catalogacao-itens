/* js/objecttypes/canaleta.js -- Canaleta PVC: peça única de tamanho fixo (caixa a partir de
 * `OBJECT3D_PROFILES['canaleta']`), sem motor de desenho próprio -- mesmo padrão de
 * impressora.js (reaproveita `Engine3D.prototype._buildGenericCatalogMesh`).
 */
window.ObjectTypes.register('canaleta', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'canaleta' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    engine._buildGenericCatalogMesh(obj, perfil, baseY, wireframe, colWireframe);
  },
});
