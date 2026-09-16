/* assets/modelos/gabinete.config.js
 * EXEMPLO (12/09/2026) — Modelo ESPECÍFICO do tipo "gabinete", citado
 * verbatim pelo usuário como exemplo ("na janela 'Ferramentas'->
 * 'Objetos'->'Gabinete', está ali um botão [...] Tudo que é relacionado a
 * este objeto deve estar em um arquivo dele na pasta 'assets/'"). Mostra
 * como um tipo do catálogo pode ter seu PRÓPRIO arquivo em vez de cair no
 * `_generic.config.js` — aqui, propositalmente, o comportamento de clique
 * continua IDÊNTICO ao genérico (mesmo cartão "🔧 Modelar em 3D"/
 * "Fechar") pra não mudar nada visível sem poder testar ao vivo; o que
 * importa demonstrar é o MECANISMO: qualquer tipo (fixo ou customizado)
 * pode ganhar um arquivo assim, e a partir daí ELE (não mais um `if`
 * genérico) é quem decide o comportamento. Pra customizar de verdade,
 * troque `onModelClick` abaixo (ex.: adicionar um botão extra no cartão,
 * chamar `ObjectStandard.addHistoricoEntry`, abrir uma janela própria,
 * etc.) — sem precisar mexer em js/view3d.js. */
window.ObjectAssets.registerModel('gabinete', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'gabinete',
  nome: 'Gabinete',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
    //console.log('Objeto Gabinete (id='+entity.id+') criado na cena.');
  },
  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    //console.log('Objeto Gabinete (id='+entity.id+') clicado.');
    // Mesmo cartão do `_generic` por enquanto — troque aqui pra customizar
    // só o comportamento de "gabinete", sem afetar nenhum outro tipo.
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
