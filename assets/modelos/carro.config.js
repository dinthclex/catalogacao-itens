/* assets/modelos/carro.config.js
 * [13/09/2026] NOVO — "Carro dirigível" (pedido verbatim: "Faça um carro,
 * que é possível entrar nele e sair andando, com aspecto de movimentação
 * real (considerando a inércia de movimento [...]). Deve ter rodas, vidros
 * e um formato de carro de verdade"). Segue o MESMO padrão dos outros
 * ~40 arquivos de assets/modelos/ (registerModel + onModelSpawn/
 * onModelClick + hooks de mouse comentados, ver interruptor.config.js/
 * camera.config.js pro padrão de referência).
 *
 * A GEOMETRIA de verdade (carroceria + cabine + 4 rodas + vidros) mora em
 * `Engine3D._buildCarroMesh` (js/engine3d.js) — mesmo espírito de mesa/
 * luminária/poste/escada/teto-gesso, builders BESPOKE de múltiplas malhas
 * que este arquivo NÃO duplica; ele só define o COMPORTAMENTO (o que
 * acontece ao clicar) e delega a montagem 3D pro motor, através do
 * `tipo:'carro'` deste objeto (ver `OBJECT3D_PROFILES.carro`,
 * engine3d-profiles.js, e a checagem `obj.tipo === 'carro'` em
 * `_buildOneObjectMesh`).
 *
 * FÍSICA DE INÉRCIA e a câmera de 3ª pessoa moram em `js/view3d.js`
 * (`_entrarNoCarro`/`_sairDoCarro`/`_updateCarrosControlados`/
 * `_updateCarroCamera` — ver os comentários grandes lá pras fórmulas
 * exatas de aceleração/fricção/virada e as LIMITAÇÕES honestas desta
 * rodada: sem colisão do carro contra paredes, sem suspensão/inclinação
 * em curva, câmera de 3ª pessoa sem colisão contra paredes atrás do
 * carro).
 *
 * CONTROLES enquanto dirigindo (reaproveita as MESMAS teclas do andar a
 * pé, só que redirecionadas pro carro em vez do jogador enquanto
 * `view3d._carroControlado` está setado — ver guard em `View3D._update`):
 *   - W / seta-pra-cima: acelera
 *   - S / seta-pra-baixo: freia/dá ré
 *   - A/D ou setas laterais: vira (só funciona com o carro já em
 *     movimento — parado, não gira no lugar)
 *   - "E": sai do carro (reaparece a pé, 2m ao lado dele)
 */
window.ObjectAssets.registerModel('carro', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'carro',
  nome: 'Carro',
  propriedades: { interativo: true },

  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D —
    // garante que todo carro do mapa já nasça com uma velocidade numérica
    // válida (0 = parado), mesmo mapas antigos salvos ANTES desta rodada
    // (que não têm o campo `_velocidade` gravado ainda).
    if (entity._velocidade === undefined) entity._velocidade = 0;
    //console.log('Carro (id='+entity.id+') criado na cena.');
  },

  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto — pedido verbatim:
    // "é possível entrar nele". Só entra se NINGUÉM já estiver dirigindo
    // (nem este carro, nem outro — `view3d._carroControlado` é um único
    // slot global, pedido não pede dirigir 2 carros ao mesmo tempo, nem
    // faria sentido com 1 jogador só); clicar num carro enquanto já
    // dirige (ex.: mirando outro carro pela janela do que já está
    // dirigindo) simplesmente não faz nada, sem erro.
    if (ctx.view3d._carroControlado) {
      ctx.Utils?.toast?.('🚗 Já dirigindo — aperte "E" pra sair antes de entrar em outro', { duration: 1800 });
      return;
    }
    ctx.view3d._entrarNoCarro(entity);
  },

  /* [13/09/2026] Demais eventos de mouse do W3Schools, disponíveis como
   * HOOK (mesma convenção documentada em ar-condicionado.config.js/
   * interruptor.config.js — só onModelClick/onModelDoubleClick/
   * onModelContextmenu têm despacho real).
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
