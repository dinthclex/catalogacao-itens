/* assets/modelos/pilar.config.js
 * NOVO (15/09/2026 UTC) — rodada "malha estática pra todos os objetos"
 * (pedido verbatim: "O objetivo é não ter objetos no app que são gerados
 * diretamente por código, mas sim carregados por arquivo"). "Pilar" não
 * tinha um `assets/modelos/pilar.config.js` próprio (caía no fallback
 * `_generic.config.js`) — criado agora, mesmo padrão de mesa.config.js/
 * cadeira.config.js, só pra poder endereçar `pilar.malha.js` (gerado por
 * ferramentas/gerar_malhas.js a partir de `_buildPilarMesh`, engine3d.js —
 * ver limitação sobre altura fixa em 2.8m documentada lá/em
 * progresso-sessao.md). Clique continua caindo no cartão genérico. */
window.ObjectAssets.registerModel('pilar', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'pilar',
  nome: 'Pilar',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
  },
  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    ctx.view3d._showObjectCard3D(entity);
  },
});
