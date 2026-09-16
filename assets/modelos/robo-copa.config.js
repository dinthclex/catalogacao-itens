/* assets/modelos/robo-copa.config.js
 * NOVO (13/09/2026) — tipo de catálogo INDEPENDENTE pro robô de copa/café
 * (backlog do usuário). Mesmo padrão de robo.config.js — o comportamento de
 * trajeto vem de um componente Script (ver assets/modelos/_exemplo-script-
 * robo-copa.txt), não deste arquivo. Distinção visual: um pouco mais alto
 * e cor branca (perfil próprio em js/engine3d-profiles.js,
 * OBJECT3D_PROFILES['robo-copa']) — aproximação de "compartimento/bandeja
 * no topo" pela altura extra. HONESTIDADE DE ESCOPO: sem geometria de
 * bandeja de verdade (compartimento saliente, tampa etc.) nesta rodada —
 * ver README-ROBOS.md. */
window.ObjectAssets.registerModel('robo-copa', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'robo-copa',
  nome: 'Robô de Copa',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
    //console.log('Objeto Robô de Copa (id='+entity.id+') criado na cena.');
  },
  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    //console.log('Objeto Robô de Copa (id='+entity.id+') clicado.');
    ctx.view3d._showObjectCard3D(entity);
  },

  /* [14/09/2026] NOVO — pedido verbatim: disponibilizar TODOS os outros
   * eventos de mouse do W3Schools como HOOKS (inertes/comentados por
   * padrão) neste Modelo, na mesma convenção onModel<Evento> já usada por
   * onModelSpawn/onModelClick. Descomente o que precisar. IMPORTANTE —
   * despacho real: onModelClick/onModelDoubleClick/onModelContextmenu têm
   * despacho REAL (ver js/objectassets.js `dispatchMouseEvent3D` e
   * js/view3d.js). Os demais ficam só como HOOK DISPONÍVEL, SEM despacho
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
