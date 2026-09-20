/* assets/modelos/pia.config.js
 * NOVO (13/09/2026) — corrige um `ERR_FILE_NOT_FOUND` no console: o tipo
 * `pia` já existe há várias rodadas (perfil visual em
 * js/engine3d-profiles.js, usado pela copa e pelos banheiros gerados em
 * js/geradores-salas.js), mas nunca tinha ganho um `.model.js` próprio —
 * o app tenta carregar `assets/modelos/pia.config.js` pra TODO tipo de
 * objeto que aparece no mapa (auto-registro), então sem o arquivo dava
 * esse aviso no console. Objeto puramente decorativo/de infraestrutura,
 * sem comportamento especial (sem torneira "ligável" — nenhum campo de
 * estado documentado no perfil) — mesmo padrão de casa-robo.config.js.
 */
window.ObjectAssets.registerModel('pia', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'pia',
  nome: 'Pia',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {},
  onModelClick(entity, ctx) {
    ctx.view3d._showObjectCard3D(entity);
  },
});
