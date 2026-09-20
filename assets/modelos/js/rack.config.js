/* assets/modelos/rack.config.js
 * NOVO (18/09/2026 UTC) -- Modelo (comportamento padrao do TIPO) do objeto
 * parametrico "Rack" (rack modular de 19"), no mesmo padrao dos demais
 * `<tipo>.config.js` (ver mesa.config.js/switch.config.js). O clique cai no
 * cartao generico do objeto. NAO usa `malhaEstatica`: a malha do Rack nao e
 * fixa -- e montada por codigo (js/rack-modular.js + Engine3D._buildRackMesh)
 * a partir de `obj.rackUs`/`obj.rackProfundidade`, entao qualquer .malha.js
 * estatica ignoraria as medidas escolhidas pelo usuario. */
window.ObjectAssets.registerModel('rack', {
  id: 'rack',
  nome: 'Rack',
  propriedades: { interativo: true, parametrico: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
  },
  onModelClick(entity, ctx) {
    // roda ao clicar com o botao esquerdo NESTE objeto
    ctx.view3d._showObjectCard3D(entity);
  },
});
