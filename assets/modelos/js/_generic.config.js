/* assets/modelos/_generic.config.js
 * NOVO (12/09/2026) — Modelo padrão UNIVERSAL: usado por QUALQUER `tipo`
 * de objeto do catálogo (fixo OU customizado, "Acessar modelos" ->
 * "+ Criar modelo") que NÃO tenha o seu próprio arquivo
 * `assets/modelos/<tipo>.model.js`. É isto que garante o pedido "todos os
 * objetos, não só os padrão [...], mas também os novos devem seguir a
 * mesma organização" SEM precisar de um arquivo por tipo — um tipo NOVO
 * (criado agora ou daqui a um ano) automaticamente cai aqui até que
 * alguém, opcionalmente, crie um `assets/modelos/<tipo>.model.js` próprio
 * pra ele (ver js/objectassets.js `ensureModelLoaded`/`_generic` no
 * fallback de `dispatchClick3D`).
 *
 * `onModelClick` delega pro cartão genérico já existente
 * (`View3D._showObjectCard3D`). */
window.ObjectAssets.registerModel('_generic', {
  id: '_generic',
  nome: 'Objeto (padrão)',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
    //console.log('Objeto Objeto (padrão) (id='+entity.id+') criado na cena.');
  },
  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    //console.log('Objeto Objeto (padrão) (id='+entity.id+') clicado.');
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
   * DISPONÍVEL, SEM despacho automático ainda: mousedown/mouseup do canvas
   * já são usados por várias ferramentas de construção (tijolo, câmera
   * orbital, etc. — reaproveitar o mesmo listener arriscaria regressão
   * nelas) e hover contínuo (enter/leave/move/out/over) exigiria rastrear
   * a cada `mousemove` qual objeto está sob o mouse (raycaster contínuo,
   * custo de desempenho e refatoração maior) — ver comentário grande no
   * topo de js/objectassets.js.
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
