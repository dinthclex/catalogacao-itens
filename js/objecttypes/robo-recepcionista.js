/* js/objecttypes/robo-recepcionista.js -- ver comentário grande em
 * robo-limpeza.js (mesmo padrão exato pra MALHA 3D, só troca o `tipo`).
 *
 * OBSERVAÇÃO: o efeito de "holograma" (cor/opacidade/emissive ao vivo,
 * ligado/desligado por Script -- ver `obj.hologramaLigado`) NÃO é
 * construção de malha, é ATUALIZAÇÃO por quadro de um objeto já
 * construído -- continua em `Engine3D.prototype._syncScriptedObjectTransforms`
 * (`js/engine3d.js`), que já checa `obj.tipo === 'robo-recepcionista'`
 * point a point, igual antes. Migrar ISSO pro registro (ex.: um hook
 * `tickMesh3D`) é possível numa rodada futura, mas está fora do escopo
 * desta migração (que é só a MALHA 3D / `buildMesh3D`).
 */
class RoboRecepcionistaMeshBuilder {
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    engine._buildGenericCatalogMesh(obj, perfil, baseY, wireframe, colWireframe);
  }
}

window.ObjectTypes.register('robo-recepcionista', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'robo-recepcionista' && perfil.shape === 'cylinder'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    RoboRecepcionistaMeshBuilder.prototype.buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
