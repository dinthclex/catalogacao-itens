/* js/cards/orphan-patrimonio-card.js
 * Card do "que restou" de uma associação com um patrimônio já EXCLUÍDO do
 * catálogo (pedido do usuário, 27/08/2026: "Se o patrimônio deixar de
 * existir... no 3D, ao clicar em um objeto que tinha ele como vinculado,
 * deve aparecer apenas o número do patrimônio e um botão para excluir a
 * informação de patrimônio 'restante'"). Extraído de
 * `View3D._showOrphanPatrimonioCard3D` (js/view3d.js) — ver comentário
 * grande no topo de `js/cardsystem.js` pro porquê da extração.
 *
 * Chamado pelo wrapper em view3d.js quando NENHUM dos itens associados ao
 * objeto (`obj.itemIds`) existe mais no catálogo. Mostra só o NÚMERO
 * guardado em cada entrada (ver Mapping.addItemToObject `patrimonio`) —
 * associações feitas ANTES desta funcionalidade existir não têm esse
 * número salvo (mostra um aviso genérico nesse caso) — com um botão por
 * entrada pra apagar essa informação residual (Mapping.removeItemFromObject,
 * que não depende do item existir mais). Uma LISTA, não um único item,
 * porque um objeto pode ter mais de um patrimônio associado (ver
 * mapping.js).
 *
 * NOTA: a checagem "se não há mais nenhuma entrada, não mostra o card"
 * (`if (!entries.length) return;` no original) foi mantida no WRAPPER
 * (`View3D._showOrphanPatrimonioCard3D`), não aqui — é uma decisão de "não
 * montar cartão nenhum", não de conteúdo/estilo do card em si.
 */
window.CardSystem.register('orphan-patrimonio', {
  bodyHtml(obj, ctx) {
    const Utils = ctx.Utils;
    const entries = obj.itemIds || [];
    const rowsHtml = entries.map((e) => `
      <div class="v3d-orphan-row" style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--border)">
        <span style="font-family:monospace">${e.patrimonio ? Utils.escapeHtml(e.patrimonio) : '(número não registrado)'}</span>
        <button type="button" class="btn danger sm v3d-orphan-del" data-id="${e.id}" title="Excluir esta informação de patrimônio (o item já não existe mais no catálogo)">🗑️ Excluir</button>
      </div>`).join('');
    return `
      <div style="text-align:center; font-weight:700; margin-bottom:4px">⚠️ Patrimônio excluído do catálogo</div>
      <p style="font-size:12px; color:var(--text-dim); text-align:center; margin:0 0 8px">Este objeto ainda guarda o número de um ou mais patrimônios já excluídos do catálogo:</p>
      <div>${rowsHtml}</div>
      <button class="btn secondary block sm" id="v3d-fc-close" style="margin-top:10px" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;
  },
  wire(el, obj, ctx) {
    const view3d = ctx.view3d;
    const Mapping = window.Mapping;
    const Utils = ctx.Utils;
    el.querySelector('#v3d-fc-close').onclick = () => el.remove();
    el.querySelectorAll('.v3d-orphan-del').forEach((btn) => {
      btn.onclick = async () => {
        Mapping.removeItemFromObject(view3d._map, obj.id, btn.dataset.id);
        await view3d._afterMapMutated();
        el.remove();
        const fresh = (view3d._map.objects || []).find((o) => o.id === obj.id);
        if (fresh && fresh.itemIds && fresh.itemIds.length) view3d._showOrphanPatrimonioCard3D(fresh);
        else Utils.toast('Informação de patrimônio removida ✓', { type: 'ok' });
      };
    });
  },
});
