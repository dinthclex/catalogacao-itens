/* assets/modelos/cancela.config.js
 * NOVO (13/09/2026) — TAREFA 4 do backlog: "cancelas [...] uma haste
 * horizontal articulada tipo braço de estacionamento [...] que pode ser
 * erguida/abaixada." Tipo `cancela` = a HASTE (o poste é um objeto
 * separado, `cancela-poste`, geometria fixa — ver js/geradores-salas.js
 * `gerarCancela`).
 *
 * INVESTIGAÇÃO / DECISÃO DE MECANISMO (honesta, leia antes de comparar
 * com a porta automática): o pedido dizia pra reaproveitar "o MESMO
 * padrão de animação de porta já implementado (ângulo animado
 * suavemente)". Investigando `Engine3D._updateDoorAnimations`
 * (engine3d.js) nesta rodada: essa função só anima objetos que estão em
 * `map.portas` (a lista real de portas do prédio) — um objeto comum do
 * mapa (`map.objects`, que é o que `cancela` é) NUNCA passa por ali,
 * mesmo definindo `entity.anguloAbertura`. Por isso a cancela usa, em vez
 * disso, o mecanismo GENÉRICO que TODO objeto scriptado já tem disponível
 * — `obj.angulo` (rotação em torno do eixo Y, radianos), sincronizado
 * TODO quadro pra qualquer objeto com Script por
 * `Engine3D._syncScriptedObjectTransforms` (o MESMO mecanismo confirmado
 * funcional pelos robôs/relógios animados — nenhum código novo de
 * sincronização precisou ser escrito). O Script
 * (`_exemplo-script-cancela.txt`) anima `obj.angulo` suavemente de 0
 * (abaixada, bloqueando) até -90°/-π/2 (erguida na vertical), quadro a
 * quadro, com a MESMA "sensação" de animação suave da porta — só que
 * via `angulo` em vez de `anguloAbertura`.
 *
 * SIMPLIFICAÇÃO CONHECIDA (documentada, aceita pelo pedido: "ao clicar
 * (ou detectar um carro perto, mais simples: só clique mesmo,
 * documentado como simplificação)"): a haste gira em torno do PRÓPRIO
 * CENTRO geométrico (mesmo pivô de qualquer objeto `angulo`-rotacionado
 * do app), não em torno de uma dobradiça na ponta encostada no poste —
 * uma cancela de verdade gira em torno da base fixa no poste. Um pivô de
 * verdade na ponta exigiria offset de geometria customizado (fora do
 * sistema `angulo` genérico) — fora de escopo desta rodada. Visualmente
 * a haste ainda "levanta e abaixa" de forma reconhecível, só que girando
 * em torno do meio, não da ponta.
 *
 * Este `.model.js` só cuida de spawn/clique (mesma convenção de
 * elevador-cabine.config.js) — a ANIMAÇÃO em si é o Script,
 * `_exemplo-script-cancela.txt`, que precisa ser adicionado como
 * componente ao objeto (sem ele, a cancela fica parada, um objeto
 * comum).
 */
window.ObjectAssets.registerModel('cancela', {
  id: 'cancela',
  nome: 'Cancela (Haste)',
  propriedades: { interativo: true },

  onModelSpawn(entity, ctx) {
    if (entity.abaixada === undefined) entity.abaixada = true; // estado inicial: bloqueando a passagem
  },

  onModelClick(entity, ctx) {
    ctx.view3d._showObjectCard3D(entity);
  },
});
