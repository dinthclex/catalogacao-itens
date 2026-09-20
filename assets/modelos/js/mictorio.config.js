/* assets/modelos/mictorio.config.js
 * NOVO (13/09/2026) — mesma correção de `ERR_FILE_NOT_FOUND` que
 * pia.config.js (ver comentário lá pro contexto completo): tipo já
 * existente (perfil em js/engine3d-profiles.js, usado pelo banheiro
 * masculino gerado em js/geradores-salas.js) sem `.model.js` de
 * auto-registro. Decorativo, sem estado especial documentado.
 */
window.ObjectAssets.registerModel('mictorio', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'mictorio',
  nome: 'Mictório',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {},
  onModelClick(entity, ctx) {
    ctx.view3d._showObjectCard3D(entity);
  },
});
