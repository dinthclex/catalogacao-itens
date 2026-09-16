/* assets/modelos/elevador-cabine.config.js
 * NOVO (13/09/2026) — TAREFA 1 do backlog: "elevadores com botões [...]
 * dando para chamar qualquer elevador e mostrar o botão ativo indicando
 * que o elevador está vindo [...] portas automáticas, indicador de
 * andares." Este arquivo é só o "Modelo" (comportamento de CLIQUE/spawn
 * padrão, sempre carregado) do tipo `elevador-cabine` — a LÓGICA de
 * verdade (subir/descer, abrir porta, responder chamada) mora em
 * `_exemplo-script-elevador-cabine.txt`, um componente "Script" que o
 * usuário adiciona ao objeto (MESMA convenção dos robôs — ver
 * robo.config.js: o `.model.js` cuida de clique/aparência, o `.txt` cuida
 * de comportamento por quadro, porque só componentes Script recebem
 * `Update(dt)` a cada quadro — `tickEntity` em js/components.js).
 *
 * SEM o Script anexado, a cabine fica parada (objeto estático comum) —
 * documentado aqui pra não parecer bug: "coloquei o objeto e ele não
 * sobe" = falta anexar o Script, exatamente como os robôs sem trajeto.
 */
window.ObjectAssets.registerModel('elevador-cabine', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'elevador-cabine',
  nome: 'Cabine de Elevador',
  propriedades: { interativo: true },

  onModelSpawn(entity, ctx) {
    // Estado inicial coerente mesmo sem o Script ter rodado `Start()`
    // ainda (o painel de propriedades do objeto já consegue mostrar
    // algo sensato antes do primeiro quadro de "Ver em 3D").
    if (entity.andarAtual === undefined) entity.andarAtual = window.Mapping?.getAndarDaEntidade?.(entity, ctx.map) ?? 0;
    if (entity.andarDestino === undefined) entity.andarDestino = entity.andarAtual;
    if (entity.estado === undefined) entity.estado = 'parado';
    if (entity.anguloAbertura === undefined) entity.anguloAbertura = 0; // porta da cabine fechada
  },

  onModelClick(entity, ctx) {
    // [13/09/2026] NOVO — TAREFA 2 do backlog: "painéis internos [...]
    // Estando dentro do elevador, deve ser possível apertar os botões dos
    // andares". Clicar na cabine ESTANDO DENTRO dela abre o PAINEL DE
    // CONTROLE interno (botões de andar/parada/abrir-fechar porta); clicar
    // nela de FORA (ex.: através de uma porta aberta, ou simplesmente
    // mirando a caixa de longe) continua abrindo o cartão de propriedades
    // de sempre, como antes desta rodada — nada muda pra quem clica de
    // fora. Ver `View3D._jogadorDentroDaCabine`/`_abrirPainelElevador3D`
    // (js/view3d.js) pra definição exata de "dentro" e o conteúdo do painel.
    if (ctx.view3d?._jogadorDentroDaCabine?.(entity)) {
      ctx.view3d._abrirPainelElevador3D(entity, ctx);
      return;
    }
    ctx.view3d._showObjectCard3D(entity);
  },
});
