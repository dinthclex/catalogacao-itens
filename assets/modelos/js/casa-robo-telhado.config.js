/* assets/modelos/casa-robo-telhado.config.js
 * NOVO (13/09/2026) — mesma correção de `ERR_FILE_NOT_FOUND` que
 * pia.config.js (ver comentário lá pro contexto completo). Este é o
 * TELHADO da casa de robô (companheiro do corpo `casa-robo`, que já
 * tinha seu próprio `.model.js` — ver casa-robo.config.js), gerado por
 * js/geradores-salas.js `gerarCasasRobos`. Puramente
 * decorativo/estrutural, sem comportamento especial.
 */
window.ObjectAssets.registerModel('casa-robo-telhado', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'casa-robo-telhado',
  nome: 'Telhado da Casa de Robô',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {},
  onModelClick(entity, ctx) {
    ctx.view3d._showObjectCard3D(entity);
  },
});
