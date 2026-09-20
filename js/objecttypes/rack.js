/* js/objecttypes/rack.js
 * Primeiro tipo migrado pro registro de `js/objecttypes/object-type-
 * registry.js` (ver comentário grande lá pro contrato completo) -- molde
 * pros próximos tipos a migrar.
 *
 * Malha 3D: reaproveita `Engine3D.prototype._buildRackMesh` (já isolado em
 * `js/engine3d-rede-mesh.js`, RODADA de modularização anterior) -- este
 * arquivo só MOVE O PONTO DE DECISÃO ("é um Rack? então usa este builder")
 * do `if` fixo que existia dentro de `engine3d.js` (`_buildOneObjectMeshCore`)
 * pra um registro independente. `matchesMesh3D` é uma cópia EXATA da
 * condição que estava no `if` original, pra preservar 100% o
 * comportamento (inclusive o fallback pra caixa genérica quando
 * `window.RackModular`/`RackModularView3D` não carregaram).
 *
 * Desenho 2D e hit-test do Rack usam o caminho GENÉRICO por forma
 * (`_drawFormaShape`, `forma:'retangulo'`) -- não têm código dedicado hoje,
 * por isso `matchesDraw2D`/`hitTest2D` não são registrados aqui. Quando
 * um comportamento 2D específico do Rack for adicionado no futuro, entra
 * neste mesmo arquivo (é o único lugar que precisa mudar).
 */
class RackObjectType {
  matchesMesh3D(obj, perfil) {
    return obj.tipo === 'rack' && perfil.shape === 'box' && !!window.RackModular && !!window.RackModularView3D;
  }

  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    engine._buildRackMesh(obj, perfil, baseY, wireframe, colWireframe);
  }
}

window.ObjectTypes.register('rack', new RackObjectType());
