/* js/cards/confirm-card.js
 * [15/09/2026 UTC] NOVO — pedido verbatim: "A janelinha de confirmação que
 * aparece deve ser um card (e ficar em 'js/cards/'), não um 'alert()'." (dito
 * sobre o diálogo de "há alterações não salvas" do editor de molde, ver
 * js/modelos3d.js `_sairEditor`, que antes usava `confirm()` nativo do
 * navegador). Em vez de fazer um card ESPECÍFICO só pra esse diálogo (o que
 * exigiria um novo arquivo pra cada futuro "tem certeza?" do app), este é um
 * card GENÉRICO de confirmação — reaproveitável por QUALQUER tela que
 * precise perguntar algo com botões (título + mensagem + lista de botões
 * livre), seguindo o mesmo contrato de `js/cards/*.js` já documentado em
 * `js/cardsystem.js` (comentário grande no topo de lá).
 *
 * USO — `CardSystem.mount(container, 'confirm', data, ctx)`, onde `data` é:
 *   {
 *     title: 'Alterações não salvas',       // texto do título (obrigatório)
 *     message: 'Deseja salvar antes de sair?', // texto do corpo (opcional)
 *     buttons: [                            // 1+ botões, na ordem exibida
 *       { id: 'salvar', label: '💾 Salvar e sair', variant: 'primary' },
 *       { id: 'descartar', label: '🗑️ Sair sem salvar', variant: 'danger' },
 *       { id: 'cancelar', label: '✕ Cancelar', variant: 'secondary' },
 *     ],
 *     onChoose(id) { ... },                 // chamado com o `id` do botão clicado
 *   }
 * `container` é qualquer elemento com `position` não-`static` (ex.:
 * `.modelos3d-overlay`, que é `position:fixed` — ver js/modelos3d.js) —
 * `.flashcard3d-overlay` (classe compartilhada, ver css/style.css) já
 * centraliza sozinho dentro do container mais próximo posicionado.
 * `ctx` não é usado por este card (aceito só pelo contrato padrão de
 * `CardSystem.mount`) — pode ser passado como `{}`.
 */
window.CardSystem.register('confirm', {
  bodyHtml(data) {
    const Utils = window.Utils;
    const esc = (s) => (Utils?.escapeHtml ? Utils.escapeHtml(String(s ?? '')) : String(s ?? ''));
    const title = esc(data?.title || 'Confirmar');
    const message = data?.message ? `<p class="confirm-card-msg">${esc(data.message)}</p>` : '';
    const botoes = (data?.buttons || []).map((b) => (
      `<button type="button" class="btn ${b.variant || 'secondary'} sm confirm-card-btn" data-id="${esc(b.id)}">${esc(b.label)}</button>`
    )).join('');
    return `
      <div class="confirm-card-title">${title}</div>
      ${message}
      <div class="confirm-card-btns">${botoes}</div>
    `;
  },
  wire(el, data) {
    el.querySelectorAll('.confirm-card-btn').forEach((btn) => {
      btn.onclick = () => {
        el.remove();
        data?.onChoose?.(btn.dataset.id);
      };
    });
  },
});
