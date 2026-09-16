/* js/cards/tijolo-aglomerado-card.js
 * Card mostrado ao mirar/selecionar um "aglomerado" de tijolos soltos
 * (parede feita empilhando a ferramenta de tijolo, ainda sem virar um
 * objeto de verdade) no "Ver em 3D". Extraído de
 * `View3D._showTijoloAglomeradoCard3D` (js/view3d.js) — ver comentário
 * grande no topo de `js/cardsystem.js` pro porquê da extração.
 *
 * `data` aqui não é usado (o aglomerado inteiro é tratado como uma coisa só,
 * sem um objeto individual pra passar) — `ctx.view3d` é quem dá acesso aos
 * métodos de verdade (`_tijoloAglomeradoVirarObjeto`/`_openDeleteConfirmPopup`,
 * ambos já existentes em view3d.js, não duplicados aqui).
 *
 * 2 ações: "🔧 Modelar em 3D" reaproveita `_tijoloAglomeradoVirarObjeto()`
 * (funde os tijolos 'Caixa' sem textura num objeto de verdade com
 * `customMesh` e entra direto no Modelador); "🗑️ Excluir" reaproveita
 * `_openDeleteConfirmPopup()` (mesmo popup de confirmação estilo Blender já
 * usado pra qualquer outro objeto/parede/item — ele mesmo mira de novo com
 * `hoverPick`, então funciona igual clicando com a ferramenta 🗑️ Remover ou
 * apertando DEL).
 */
window.CardSystem.register('tijolo-aglomerado', {
  bodyHtml() {
    return `
      <div style="text-align:center; font-weight:700; margin-bottom:8px">🧱 Aglomerado de tijolos</div>
      <button class="btn secondary block sm" id="v3d-tj-modelar" title="Fundir os tijolos num objeto único e editar a malha 3D vértice a vértice, como no Blender">🔧 Modelar em 3D</button>
      <button class="btn danger block sm" id="v3d-tj-excluir" title="Excluir o aglomerado inteiro">🗑️ Excluir</button>
      <button class="btn block sm" id="v3d-fc-close" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;
  },
  wire(el, data, ctx) {
    const view3d = ctx.view3d;
    el.querySelector('#v3d-fc-close').onclick = () => el.remove();
    el.querySelector('#v3d-tj-modelar').onclick = () => { el.remove(); view3d._tijoloAglomeradoVirarObjeto(); };
    el.querySelector('#v3d-tj-excluir').onclick = () => { el.remove(); view3d._openDeleteConfirmPopup(); };
  },
});
