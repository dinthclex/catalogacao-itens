/* js/objecttypes/janela.js -- ver comentário grande em porta.js (mesmo
 * padrão exato, mesmo vínculo com parede via `parentWallId`). A malha 3D
 * cobre tanto a janela genérica (moldura + vidro "Minecraft") quanto a de
 * correr de 2 folhas (`el.tipo === 'correr_2folhas'`, delegada internamente
 * a `Engine3D.prototype._buildJanelaCorrer2Folhas` por
 * `_buildDoorOrWindowMesh`, mesmo comportamento de antes).
 */
class JanelaMeshBuilder {
  buildMesh3D(engine, el, mapData) {
    engine._buildDoorOrWindowMesh(el, 'janela', mapData);
  }
}

window.ObjectTypes.register('janela', {
  buildMesh3D(engine, el, mapData) {
    JanelaMeshBuilder.prototype.buildMesh3D(engine, el, mapData);
  },
});
