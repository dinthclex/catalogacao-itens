/* assets/modelos/vaga-estacionamento.config.js
 * NOVO (13/09/2026) — TAREFA 4 do backlog: "Deve ter pátio
 * estacionamento, cancelas, cerca, áreas de acesso." Marcação de vaga —
 * decalque fino no chão (ver js/engine3d-profiles.js `vaga-
 * estacionamento`), sem comportamento além do cartão padrão de objeto.
 */
window.ObjectAssets.registerModel('vaga-estacionamento', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'vaga-estacionamento',
  nome: 'Vaga de Estacionamento',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {},
  onModelClick(entity, ctx) {
    ctx.view3d._showObjectCard3D(entity);
  },
});
