/* assets/modelos/robo-limpeza.config.js
 * NOVO (13/09/2026) — tipo de catálogo INDEPENDENTE pro robô de limpeza
 * (backlog do usuário). Mesmo padrão de robo.config.js — o comportamento de
 * trajeto vem de um componente Script (ver assets/modelos/_exemplo-script-
 * robo-limpeza.txt), não deste arquivo; aqui só o cartão de clique padrão
 * e o registro do tipo. Distinção visual: cor cinza-escuro (perfil próprio
 * em js/engine3d-profiles.js, OBJECT3D_PROFILES['robo-limpeza']) — mais
 * escura que o robô base, aproximando o visual de um robô aspirador
 * comercial. HONESTIDADE DE ESCOPO: sem faixa amarela/detalhe multi-cor de
 * verdade (exigiria múltiplos materiais na malha, não um perfil de
 * OBJECT3D_PROFILES) — ver README-ROBOS.md. */
window.ObjectAssets.registerModel('robo-limpeza', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'robo-limpeza',
  nome: 'Robô de Limpeza',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
    //console.log('Objeto Robô de Limpeza (id='+entity.id+') criado na cena.');
  },
  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    //console.log('Objeto Robô de Limpeza (id='+entity.id+') clicado.');
    ctx.view3d._showObjectCard3D(entity);
  },

  /* [14/09/2026] NOVO — pedido verbatim: disponibilizar TODOS os outros
   * eventos de mouse do W3Schools como HOOKS (inertes/comentados por
   * padrão) neste Modelo, na mesma convenção onModel<Evento> já usada por
   * onModelSpawn/onModelClick. Descomente o que precisar. IMPORTANTE —
   * despacho real: onModelClick/onModelDoubleClick/onModelContextmenu têm
   * despacho REAL (ver js/objectassets.js `dispatchMouseEvent3D` e
   * js/view3d.js). Os demais — onModelMouseDown/onModelMouseUp/
   * onModelMouseEnter/onModelMouseLeave/onModelMouseMove/onModelMouseOut/
   * onModelMouseOver — ficam só como HOOK DISPONÍVEL, SEM despacho
   * automático ainda (ver comentário grande no topo de js/objectassets.js
   * e em gabinete.config.js).
  onModelDoubleClick(entity, ctx) {},
  onModelContextmenu(entity, ctx) {},
  onModelMouseDown(entity, ctx) {},
  onModelMouseUp(entity, ctx) {},
  onModelMouseEnter(entity, ctx) {},
  onModelMouseLeave(entity, ctx) {},
  onModelMouseMove(entity, ctx) {},
  onModelMouseOut(entity, ctx) {},
  onModelMouseOver(entity, ctx) {},
  */
});
