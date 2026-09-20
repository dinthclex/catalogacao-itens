/* js/objecttypes/robo-copa.js -- ver comentário grande em robo-limpeza.js
 * (mesmo padrão exato, só troca o `tipo`). */
class RoboCopaMeshBuilder {
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    engine._buildGenericCatalogMesh(obj, perfil, baseY, wireframe, colWireframe);
  }
}

window.ObjectTypes.register('robo-copa', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'robo-copa' && perfil.shape === 'cylinder'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    RoboCopaMeshBuilder.prototype.buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
