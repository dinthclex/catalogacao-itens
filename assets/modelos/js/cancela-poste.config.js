/* assets/modelos/cancela-poste.config.js
 * NOVO (13/09/2026) — mesma correção de `ERR_FILE_NOT_FOUND` que
 * pia.config.js (ver comentário lá pro contexto completo). Este é o
 * POSTE fixo da cancela (companheiro da HASTE `cancela`, que já tinha
 * seu próprio `.model.js` — ver cancela.config.js), gerado por
 * js/geradores-salas.js `gerarCancela`. Puramente estrutural/decorativo
 * — não anima nem reage a clique além do card padrão.
 */
window.ObjectAssets.registerModel('cancela-poste', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'cancela-poste',
  nome: 'Poste da Cancela',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {},
  onModelClick(entity, ctx) {
    ctx.view3d._showObjectCard3D(entity);
  },
});
