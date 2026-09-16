/* assets/modelos/piso.config.js
 * NOVO (13/09/2026) — mesma correção de `ERR_FILE_NOT_FOUND` já aplicada
 * a pia/cafeteira/vaso-sanitario/mictorio/cancela-poste/casa-robo-telhado
 * (ver pia.config.js pro contexto completo): o tipo `piso` já existe há
 * várias rodadas — é a peça plantável usada por `Mapping.getPisos`/
 * `getAndarDaEntidade`/`filterByPiso` (js/mapping.js) pra derivar a que
 * andar cada objeto pertence, e pelo mosaico de lajes da v4 — mas nunca
 * tinha ganho seu `.model.js` de auto-registro. Sem comportamento
 * especial no clique além do card padrão (a edição de acabamento —
 * `obj.acabamento`, ex. 'lajota' — já é feita pelo painel de
 * propriedades comum, não precisa de lógica extra aqui).
 */
window.ObjectAssets.registerModel('piso', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'piso',
  nome: 'Piso',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {},
  onModelClick(entity, ctx) {
    ctx.view3d._showObjectCard3D(entity);
  },
});
