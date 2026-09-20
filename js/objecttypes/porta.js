/* js/objecttypes/porta.js
 * Tipo "porta" migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- pedido verbatim: "Porta e janela [...] são objetos, e
 * devem ser tratados do mesmo jeito que os demais objetos, com suas
 * classes próprias e métodos de interação próprios."
 *
 * MODELO DE DADOS DIFERENTE dos outros 69 tipos já migrados: porta não
 * vive em `mapData.objects` (com `obj.tipo`/`obj.x`/`obj.y` soltos no
 * mapa) -- vive em `mapData.portas`, presa a uma parede por
 * `parentWallId`/`posAoLongoDaParede` (ou solta, "no ar", se
 * `parentWallId` for null). É esse vínculo com a parede que já FAZ a
 * interação descrita pelo pedido ("apontar para uma parede e a porta faz
 * uma abertura") -- ver `js/mapping.js` (`Mapping.addDoor`/
 * `resolveDoorWindowPos`/o corte do vão em `engine3d.js`
 * `setScene`, bloco "paredes") e `js/mapview.js` (ferramenta de
 * posicionar porta, arrastar ao longo da parede). Esta migração cobre a
 * MALHA 3D (o que era a closure `buildDoorOrWindowMesh` dentro de
 * `setScene`, agora um método de verdade, `Engine3D.prototype.
 * _buildDoorOrWindowMesh`) -- a lógica de fixação/corte de vão na parede
 * já é reaproveitada como está, não duplicada aqui.
 *
 * DISPATCH: chamado de um ponto dedicado em `engine3d.js` (`setScene`,
 * onde `mapData.portas`/`mapData.janelas` são percorridos), não pela
 * checagem genérica de `mapData.objects` (`_buildOneObjectMeshCore`) --
 * mesmo espírito de `imagem.js`/`objimport.js` (identificação e ponto de
 * chamada especiais), só que aqui por causa do array de dados diferente,
 * não de `obj.tipo`/`obj.forma`.
 */
class PortaMeshBuilder {
  buildMesh3D(engine, el, mapData) {
    engine._buildDoorOrWindowMesh(el, 'porta', mapData);
  }
}

window.ObjectTypes.register('porta', {
  buildMesh3D(engine, el, mapData) {
    PortaMeshBuilder.prototype.buildMesh3D(engine, el, mapData);
  },
});
