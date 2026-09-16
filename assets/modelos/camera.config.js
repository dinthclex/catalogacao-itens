/* assets/modelos/camera.config.js
 * NOVO (12/09/2026) — Modelo padrão do TIPO "câmera" (comportamento
 * PADRÃO de TODA câmera do mapa, salvo se um objeto específico tiver seu
 * próprio arquivo em assets/instancias/ sobrepondo, ver
 * js/objectassets.js). Formato equivalente ao exemplo do pedido do
 * usuário (id/nome/propriedades/scripts onSpawn/onClick), auto-registrado
 * via `ObjectAssets.registerModel` — ver o comentário grande no topo de
 * js/objectassets.js pra por que é `.js` (auto-registro) em vez de `.json`
 * puro (fetch de arquivo local é bloqueado por CORS em `file://`).
 *
 * "onModelClick" aqui reproduz EXATAMENTE o cartão de 4 opções que o
 * usuário descreveu como exemplo no pedido original ("ao clicar em uma
 * câmera com o botão esquerdo do mouse, abre-se uma janela com 4 opções:
 * 'Ver através desta câmera', 'Abrir foto', 'Propriedades da câmera' e
 * 'Fechar'") — ESSE cartão já existia, testado em produção, como
 * `View3D._showCameraCard3D` (js/view3d.js); em vez de duplicar ~90 linhas
 * de HTML/wiring aqui (risco de regressão sem poder testar ao vivo esta
 * rodada), o Modelo delega pra ela através do `ctx.view3d` recebido —
 * fielmente ao espírito "arquivo de configuração define o comportamento",
 * já que É este arquivo (não mais um `if (hit.type==='camera')` fixo em
 * view3d.js) quem agora DECIDE que uma câmera abre esse cartão ao clicar.
 * Ver js/objectassets.js `dispatchClick3D`, chamado por view3d.js no lugar
 * do switch antigo. */
window.ObjectAssets.registerModel('camera', {
  id: 'camera',
  nome: 'Câmera',
  propriedades: { interativo: true },

  // [14/09/2026] onModelSpawn(entity, ctx) — roda 1x por câmera, na
  // primeira vez que ela aparece na cena 3D (ver js/objectassets.js
  // `dispatchSpawn3D`, chamado por view3d.js `_rebuildScene`). `ctx` agora
  // também traz `Components`/`Scripting`/`SceneObjects`/`SceneEventBus`/
  // `ObjectStandard` — INTEGRAÇÃO com os "scripts de objeto" já
  // existentes (pedido verbatim: "Faça um jeito de integrar os scripts de
  // objeto com o que acabamos de fazer"). Deixado INERTE por padrão (não
  // muda nenhuma câmera real sem o usuário pedir) — o exemplo comentado
  // abaixo mostra como um Modelo poderia "semear" um Script padrão em
  // código pra toda câmera que ainda não tenha nenhum componente (2º
  // caminho pra comportamento padrão, complementar ao já existente via UI
  // "⚙️ Comportamento padrão"/ObjectStandard.applyDefaultComponents,
  // que roda na CRIAÇÃO do objeto — este aqui alcançaria também câmeras
  // JÁ existentes de mapas antigos):
  //
  //   onModelSpawn(entity, ctx) {
  //     const comps = ctx.Components.ensureComponents(entity);
  //     if (!comps.length) {
  //       ctx.Components.addComponent(entity, 'Script', {
  //         code: 'function Start(){}\nfunction onClick(){}',
  //       });
  //     }
  //   },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
    //console.log('Objeto Câmera (id='+entity.id+') criado na cena.');
  },

  // onModelClick(entity, ctx) — MESMO nome do prompt de referência.
  // `ctx` completo (ver `ObjectAssets.buildCtx`): { view3d, DB, Utils,
  // map, Components, Scripting, SceneObjects, SceneEventBus,
  // ObjectStandard }.
  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    //console.log('Objeto Câmera (id='+entity.id+') clicado.');
    ctx.view3d._showCameraCard3D(entity);
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
