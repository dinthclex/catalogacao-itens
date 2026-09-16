/* assets/modelos/cancela-haste.config.js
 * NOVO (15/09/2026 UTC) — rodada "malha estática pra todos os objetos"
 * (pedido verbatim: "O objetivo é não ter objetos no app que são gerados
 * diretamente por código, mas sim carregados por arquivo"). "Cancela-haste"
 * não tinha um `assets/modelos/cancela-haste.config.js` próprio (caía no
 * fallback `_generic.config.js`) — criado agora, mesmo padrão de
 * cancela-poste.config.js (peça irmã), só pra poder endereçar
 * `cancela-haste.malha.js` (gerado por ferramentas/gerar_malhas.js a partir
 * do perfil simples de OBJECT3D_PROFILES['cancela-haste']). Comportamento
 * de abrir/fechar (via `entity.anguloAbertura`) continua em
 * `_exemplo-script-cancela.txt`/lógica de view3d.js — nada muda aqui além
 * da malha. Clique continua caindo no cartão genérico. */
window.ObjectAssets.registerModel('cancela-haste', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'cancela-haste',
  nome: 'Cancela (haste)',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
  },
  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    ctx.view3d._showObjectCard3D(entity);
  },
});
