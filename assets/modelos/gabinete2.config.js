/* assets/modelos/gabinete2.config.js
 * NOVO (13/09/2026) — VARIANTE INDEPENDENTE do tipo "gabinete", pedido
 * verbatim do usuário: "Faça novos modelos para o Gabinete, Monitor,
 * Teclado e Mouse [...] Faça um jeito de acrescentar esses novos modelos
 * como objetos independentes. [...] fica, por exemplo, o Gabinete que já
 * tem (gabinete.config.js) e o novo 'gabinete2.config.js'." Este arquivo NÃO
 * substitui gabinete.config.js — os dois tipos ('gabinete' e 'gabinete2')
 * convivem lado a lado no catálogo "Ferramentas→Objetos", cada um com seu
 * próprio perfil 3D (ver js/engine3d-profiles.js, OBJECT3D_PROFILES.
 * gabinete2 — formato "torre" vertical, mais alto/fino que a variante 1,
 * que é uma caixa baixa/deitada). Segue EXATAMENTE o mesmo padrão de
 * gabinete.config.js/monitor.config.js — mesmo comportamento de clique
 * (cartão genérico), só o `nome`/`id` mudam pra diferenciar no catálogo. */
window.ObjectAssets.registerModel('gabinete2', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'gabinete2',
  nome: 'Gabinete (Torre)',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
    //console.log('Objeto Gabinete (Torre) (id='+entity.id+') criado na cena.');
  },
  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    //console.log('Objeto Gabinete (Torre) (id='+entity.id+') clicado.');
    // Mesmo cartão do `_generic` por enquanto — troque aqui pra customizar
    // só o comportamento de "gabinete2", sem afetar "gabinete" nem nenhum
    // outro tipo.
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
