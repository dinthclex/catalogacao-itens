/* assets/modelos/teto-gesso.config.js
 * [13/09/2026] NOVO — pedido do usuário: "teto de gesso com rodelas de
 * acesso (gabinete/chefia)". Segue o MESMO padrão de arquivo de override
 * por tipo já usado por coluna.config.js/gabinete.config.js: por enquanto o
 * clique continua caindo no cartão genérico
 * (ctx.view3d._showObjectCard3D(entity)) — a malha de verdade (placa lisa
 * branca + discos cinza-claro/"rodelas de acesso" na face de baixo,
 * distribuídos num grid a cada 2m) é montada em js/engine3d.js
 * (`_buildTetoGessoMesh`, chamado no ramo dedicado `obj.tipo ===
 * 'teto-gesso'` de `_buildOneObjectMesh`) e o perfil-base
 * (dimensões/cor de fallback da placa) vive em js/engine3d-profiles.js
 * (`OBJECT3D_PROFILES['teto-gesso']`). Customize aqui, sem mexer em
 * js/view3d.js, quando "Teto de gesso" precisar de comportamento próprio
 * (ex.: destacar visualmente ao clicar). */
window.ObjectAssets.registerModel('teto-gesso', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'teto-gesso',
  nome: 'Teto de gesso',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
    //console.log('Objeto Teto de gesso (id='+entity.id+') criado na cena.');
  },
  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    //console.log('Objeto Teto de gesso (id='+entity.id+') clicado.');
    ctx.view3d._showObjectCard3D(entity);
  },

  /* [14/09/2026] NOVO — pedido verbatim: disponibilizar TODOS os outros
   * eventos de mouse do W3Schools como HOOKS (inertes/comentados por
   * padrão) neste Modelo, na mesma convenção onModel<Evento> já usada por
   * onModelSpawn/onModelClick. Descomente o que precisar (ex.: mover a
   * chamada de ctx.view3d._showObjectCard3D(entity) de onModelClick pra
   * outro evento, se um dia fizer sentido). IMPORTANTE — despacho real:
   * onModelClick/onModelDoubleClick/onModelContextmenu têm despacho REAL
   * (ver js/objectassets.js `dispatchMouseEvent3D` e js/view3d.js — mesmo
   * raycaster de mira central de sempre, só trocando o evento do DOM que
   * dispara a checagem: 'click'/'dblclick'/'contextmenu'). Os demais —
   * onModelMouseDown/onModelMouseUp/onModelMouseEnter/onModelMouseLeave/
   * onModelMouseMove/onModelMouseOut/onModelMouseOver — ficam só como HOOK
   * DISPONÍVEL, SEM despacho automático ainda (ver comentário grande no
   * topo de js/objectassets.js).
  onModelDoubleClick(entity, ctx) {}, // clique duplo com o botão esquerdo neste objeto
  onModelContextmenu(entity, ctx) {}, // clique com o botão direito neste objeto (abre o menu de contexto do navegador, a menos que ctx previna)
  onModelMouseDown(entity, ctx) {}, // botão do mouse pressionado (ainda não solto) sobre este objeto
  onModelMouseUp(entity, ctx) {}, // botão do mouse solto sobre este objeto
  onModelMouseEnter(entity, ctx) {}, // o ponteiro do mouse entra na área deste objeto (não borbulha — só dispara neste objeto)
  onModelMouseLeave(entity, ctx) {}, // o ponteiro do mouse sai da área deste objeto (não borbulha)
  onModelMouseMove(entity, ctx) {}, // o ponteiro do mouse se move enquanto está sobre este objeto
  onModelMouseOut(entity, ctx) {}, // o ponteiro do mouse sai da área deste objeto (borbulha — dispara também em objetos "pai", diferente de onModelMouseLeave)
  onModelMouseOver(entity, ctx) {}, // o ponteiro do mouse entra na área deste objeto (borbulha, diferente de onModelMouseEnter)
  */
});
