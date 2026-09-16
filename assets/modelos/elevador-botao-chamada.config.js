/* assets/modelos/elevador-botao-chamada.config.js
 * NOVO (13/09/2026) — TAREFA 1 do backlog: painel de botão de chamada de
 * elevador, um por andar/lado do acesso central. Ao contrário da cabine
 * (que precisa de Script pra se mover quadro-a-quadro), o BOTÃO só reage
 * a CLIQUE — cabe inteiro num `onModelClick` normal, sem precisar de
 * componente Script (mesmo raciocínio de interruptor.config.js: clique é
 * evento discreto, não precisa de Update(dt)).
 *
 * COMUNICAÇÃO COM A(S) CABINE(S) — usa o BARRAMENTO GLOBAL DE EVENTOS
 * novo (`window.SceneEventBus.emitGlobal`/`onGlobalEvent`, ver
 * js/components.js) porque o botão e a cabine são objetos DIFERENTES do
 * mapa, e o `SceneEventBus.emit` antigo só entrega dentro do MESMO
 * objeto — ver comentário grande em js/components.js explicando por que
 * essa infraestrutura teve que ser criada nesta rodada.
 *   - Emite `'chamarElevador'` com `{ piso, idBotao }` ao clicar.
 *   - Acende (cor "chamando") até ouvir `'elevadorChegou'` com o mesmo
 *     `piso` (emitido pela cabine quando ela chega/abre a porta nesse
 *     andar — ver _exemplo-script-elevador-cabine.txt).
 * Este `.model.js` (rodando fora de um componente Script) TAMBÉM
 * registra um ouvinte global — via `onModelSpawn`, chamado 1x quando o
 * objeto aparece na cena, mesmo "gancho de 1x" que o Script usa em
 * `Start()`.
 */
window.ObjectAssets.registerModel('elevador-botao-chamada', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'elevador-botao-chamada',
  nome: 'Botão de Chamada de Elevador',
  propriedades: { interativo: true },

  onModelSpawn(entity, ctx) {
    if (entity.chamando === undefined) entity.chamando = false;
    // Evita registrar 2 ouvintes globais se `onModelSpawn` for chamado
    // mais de uma vez pro mesmo objeto (ex.: reentrar em "Ver em 3D") —
    // guarda de idempotência simples por instância.
    if (entity._elevBotaoOuvinteRegistrado) return;
    entity._elevBotaoOuvinteRegistrado = true;
    window.SceneEventBus?.onGlobalEvent?.('elevadorChegou', (dados) => {
      const meuPiso = window.Mapping?.getAndarDaEntidade?.(entity, ctx.map) ?? 0;
      if (dados?.piso !== meuPiso) return;
      if (!entity.chamando) return; // já apagado, nada a fazer
      entity.chamando = false;
      _pintarBotao(entity, ctx);
    });
  },

  onModelClick(entity, ctx) {
    if (entity.chamando) return; // já chamado, esperando a cabine — clique de novo não faz nada (evita "spam" de chamadas)
    entity.chamando = true;
    _pintarBotao(entity, ctx);
    const piso = window.Mapping?.getAndarDaEntidade?.(entity, ctx.map) ?? 0;
    window.SceneEventBus?.emitGlobal?.('chamarElevador', { piso, idBotao: entity.id });
    ctx.Utils?.toast?.(`🛗 Elevador chamado (piso ${piso})`, { duration: 1200 });
  },
});

/** Pinta a peça 3D de verdade do botão (amarelo/laranja = chamando à
 *  espera, cinza claro = ocioso) — MESMA técnica de `_pickMeshes`/cor por
 *  material já usada em interruptor.config.js (procura pela malha cujo
 *  `userData.pick.ref === entity`, sem precisar reconstruir a cena). */
function _pintarBotao(entity, ctx) {
  const engine = ctx.view3d?._engine;
  const corChamando = 0xe0a028, corOcioso = 0xe8ecf2;
  const corHex = entity.chamando ? corChamando : corOcioso;
  (engine?._pickMeshes || []).forEach((m) => {
    if (m.userData?.pick?.ref === entity && m.material && m.material.color) {
      m.material.color.setHex(corHex);
    }
  });
}
