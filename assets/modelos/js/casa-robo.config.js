/* assets/modelos/casa-robo.config.js
 * NOVO (13/09/2026) — TAREFA 3 do backlog: "Eles [os robôs] devem ter
 * casas de verdade em algum lugar mais afastado do mapa." Geometria
 * básica de propósito (composição simples de caixa + telhado, ver
 * js/engine3d-profiles.js tipos `casa-robo`/`casa-robo-telhado`) — sem
 * comportamento especial: é só um objeto decorativo/de infraestrutura
 * (a casa em si não faz nada sozinha; ver js/geradores-salas.js
 * `gerarCasasRobos` e a TAREFA 3 no relatório da sessão pra a limitação
 * documentada — "ida e volta por horário" fica pra depois).
 */
window.ObjectAssets.registerModel('casa-robo', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'casa-robo',
  nome: 'Casa de Robô',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTA casa aparece pela primeira vez na cena 3D
  },
  onModelClick(entity, ctx) {
    ctx.view3d._showObjectCard3D(entity);
  },
});
