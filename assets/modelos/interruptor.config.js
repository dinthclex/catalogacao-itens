/* assets/modelos/interruptor.config.js
 * [14/09/2026] NOVO — "Interruptor de luz": objeto de parede que, ao
 * clicar, liga/desliga as luminárias (`tipo:'luminaria'`) dentro de um
 * raio configurável (`entity.raioControle`, padrão 8m — não achado nenhum
 * sistema de "vínculo A↔B" reaproveitável em js/mapping.js na busca desta
 * rodada: o que existe lá é "item de catálogo associado a um objeto do
 * mapa" (obj.itemIds), outra relação — por isso a abordagem por raio,
 * mais simples e já documentada como aceitável). Segue o MESMO padrão dos
 * outros ~38 arquivos de assets/modelos/ (ver ar-condicionado.config.js:
 * registerModel + console.log comentado + hooks de mouse documentados).
 *
 * LIMITAÇÃO CONHECIDA (documentada, pedido explícito de não gastar tempo
 * demais decidindo): raio simples em linha reta (distância euclidiana 2D,
 * ignora paredes no meio) — um interruptor pode "enxergar" e controlar uma
 * luminária do cômodo vizinho se ela estiver dentro do raio. Ajuste
 * `entity.raioControle` (painel de objeto, campo numérico) por instância
 * pra mitigar, ou baixe o padrão abaixo se isso incomodar em muitos mapas.
 */
window.ObjectAssets.registerModel('interruptor', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'interruptor',
  nome: 'Interruptor',
  propriedades: { interativo: true },

  onModelSpawn(entity, ctx) {
    // roda 1x quando ESTE objeto aparece pela primeira vez na cena 3D
    //console.log('Interruptor (id='+entity.id+') criado na cena.');
    if (entity.ligado === undefined) entity.ligado = true; // estado inicial: aceso (mesmo padrão das luminárias, sempre acesas até alguém desligar)
  },

  onModelClick(entity, ctx) {
    // roda ao clicar com o botão esquerdo NESTE objeto
    //console.log('Interruptor (id='+entity.id+') clicado.');
    entity.ligado = !entity.ligado;

    const map = ctx.map;
    const engine = ctx.view3d?._engine;
    const raio = entity.raioControle || 8;
    const r2 = raio * raio;

    // Luminárias do mapa dentro do raio (distância 2D — ver LIMITAÇÃO
    // acima) — cada uma pode ter 0 ou 1 `PointLight` real associada (ver
    // `Engine3D` `_buildLuminariaMesh`: só as primeiras
    // `MAX_LUMINARIA_LIGHTS` ganham luz de verdade; as demais só existem
    // como peça visual — nada a alternar nelas além da própria peça, que
    // este Modelo não altera, de propósito: apagar a PEÇA inteira mudaria
    // a geometria visível mesmo sem luz real, comportamento incerto).
    const luminarias = (map?.objects || []).filter((o) => {
      if (o.tipo !== 'luminaria') return false;
      const dx = o.x - entity.x, dy = o.y - entity.y;
      return (dx * dx + dy * dy) <= r2;
    });
    const idsAlvo = new Set(luminarias.map((o) => o.id));
    (engine?._dynamicLights || []).forEach((luz) => {
      if (!luz.userData?.ownerObjId || !idsAlvo.has(luz.userData.ownerObjId)) return;
      if (luz.userData._intensidadeOriginal === undefined) luz.userData._intensidadeOriginal = luz.intensity || 1;
      luz.intensity = entity.ligado ? luz.userData._intensidadeOriginal : 0;
    });

    // Cor de status do próprio interruptor (verde=ligado, cinza=desligado)
    // — muda o material da(s) malha(s) de VERDADE já na cena (achadas pelo
    // mesmo `pick.ref===entity`, ver engine3d.js `_buildOneObjectMesh`/
    // `_pickMeshes`), sem precisar reconstruir a cena inteira.
    const corLigado = 0x3fae4a, corDesligado = 0x8a92a3;
    const corHex = entity.ligado ? corLigado : corDesligado;
    (engine?._pickMeshes || []).forEach((m) => {
      if (m.userData?.pick?.ref === entity && m.material && m.material.color) {
        m.material.color.setHex(corHex);
      }
    });

    ctx.Utils?.toast?.(entity.ligado ? '💡 Luzes ligadas' : '🌑 Luzes desligadas', { duration: 1200 });
  },

  /* [14/09/2026] Demais eventos de mouse do W3Schools, disponíveis como
   * HOOK (mesma convenção documentada em ar-condicionado.config.js — só
   * onModelClick/onModelDoubleClick/onModelContextmenu têm despacho real).
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
