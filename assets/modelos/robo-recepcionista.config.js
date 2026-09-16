/* assets/modelos/robo-recepcionista.config.js
 * NOVO (13/09/2026) — tipo de catálogo INDEPENDENTE pro robô recepcionista
 * (backlog do usuário). Mesmo padrão de robo.config.js — o comportamento de
 * trajeto vem de um componente Script (ver assets/modelos/_exemplo-script-
 * robo-recepcionista.txt), não deste arquivo. Distinção visual: mais alto
 * que os outros dois e cor azul corporativo (perfil próprio em
 * js/engine3d-profiles.js, OBJECT3D_PROFILES['robo-recepcionista']).
 *
 * [13/09/2026] ESCLARECIMENTO DO USUÁRIO SOBRE O "HOLOGRAMA"/"TROCAR DE
 * UNIFORME" — leia isto ANTES da nota de "honestidade de escopo" mais
 * antiga logo abaixo, que ainda descreve o entendimento ANTIGO (mais
 * complexo) do pedido: "Sobre o robô recepcionista 'trocar de uniforme' é
 * só um nome dado para o momento em que ela vai desligar o holograma e
 * ligá-lo, depois de alguma coisa feita na sala dos robôs." Ou seja: NÃO é
 * preciso simular fisicamente uma troca de roupa nem um modelo humanoide
 * articulado — só um EFEITO VISUAL SIMPLIFICADO de "holograma
 * ligado/desligado" no momento em que o robô está na sala dos robôs. Isso
 * ESTÁ implementado agora (ver `onModelSpawn`/`onModelTick` abaixo e o
 * script de exemplo atualizado): enquanto `entity.hologramaLigado!==false`
 * (padrão ligado), o material do robô fica azul-translúcido/emissivo
 * (visual "holograma"); quando o script muda pra `false` (na sala dos
 * robôs), o material troca pra um cinza metálico opaco ("real"/sem
 * holograma) por alguns segundos, antes de ligar de novo e voltar pra
 * recepção. SIMPLIFICAÇÃO DELIBERADA, documentada por transparência: isto
 * é TROCA DE MATERIAL/COR do mesmo cilindro simples que já existia — não um
 * modelo humanoide real nem um efeito de holograma volumétrico (raios de
 * varredura, ruído/glitch, etc.). Dado o esclarecimento do usuário (é só o
 * momento de "ficar sem holograma" simulado visualmente), isto CUMPRE o
 * pedido.
 *
 * HONESTIDADE DE ESCOPO — NOTA ANTIGA, MANTIDA SÓ COMO HISTÓRICO (o
 * esclarecimento acima SUBSTITUI o entendimento abaixo — não há mais
 * pendência de "modelo humanoide" pra este efeito específico; um modelo
 * humanoide de verdade, se algum dia for pedido de novo por outro motivo,
 * continuaria sendo uma peça de conteúdo/arte 3D separada e maior, fora do
 * escopo de infraestrutura): o pedido original deste robô incluía um
 * MODELO HUMANOIDE dedicado com um EFEITO DE HOLOGRAMA que liga/desliga pra
 * "trocar de uniforme" — interpretação inicial que motivou adiar o efeito
 * inteiro. O esclarecimento do usuário (acima) mostrou que o efeito visual
 * simples já é suficiente. */
window.ObjectAssets.registerModel('robo-recepcionista', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'robo-recepcionista',
  nome: 'Robô Recepcionista',
  propriedades: { interativo: true },
  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
    //console.log('Objeto Robô Recepcionista (id='+entity.id+') criado na cena.');
    // [13/09/2026] NOVO — garante o campo com um valor padrão (holograma
    // LIGADO, o estado "normal" de recepção) pra qualquer câmera 3D que
    // leia `entity.hologramaLigado` antes do primeiro Update() de um Script
    // rodar (ex.: a própria malha, ao ser construída — ver
    // Engine3D._buildOneObjectMesh/perfil 'robo-recepcionista' em
    // engine3d.js, que agora lê este campo pra escolher a cor/emissive
    // inicial da malha).
    if (entity.hologramaLigado === undefined) entity.hologramaLigado = true;
  },
  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    //console.log('Objeto Robô Recepcionista (id='+entity.id+') clicado.');
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
