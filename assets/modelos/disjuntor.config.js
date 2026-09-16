/* assets/modelos/disjuntor.config.js
 * NOVO (13/09/2026) — TAREFA 2 do backlog: "Uma sala por andar com os
 * disjuntores (devem funcionar de verdade)." Segue 100% o MESMO
 * mecanismo já implementado pro `interruptor` de luz (raio de controle
 * sobre luminárias, ver interruptor.config.js) — reaproveitado quase
 * literalmente, só com raio MAIOR (cobre uma sala inteira, não só o
 * alcance de um interruptor de parede) e um visual de "quadro elétrico"
 * em vez de interruptor único.
 *
 * O QUE "FUNCIONA DE VERDADE" SIGNIFICA HOJE (honesto, leia antes de
 * achar que falta algo): desliga/liga TODAS as luminárias dentro de
 * `entity.raioControle` (padrão 15m — "sala inteira", pedido verbatim),
 * exatamente como o interruptor comum, só maior. NÃO desliga
 * "monitores/computadores" ainda: investigação desta rodada (`grep` em
 * js/engine3d-profiles.js e nos `.model.js` já existentes) não achou
 * NENHUM tipo de objeto do catálogo com um campo de estado "ligado/
 * desligado" além da luminária (monitor/gabinete/notebook são só peças
 * visuais estáticas, sem `entity.ligado` nem tela acesa/apagada) — então
 * não havia nada além de luz pra desligar de verdade. A extensão fica
 * PRONTA: o loop abaixo já é genérico o bastante (`tiposEletricos`) pra
 * incluir qualquer tipo novo que ganhe um campo `entity.ligado` no
 * futuro — só adicionar o tipo na lista.
 *
 * VISUAL: um quadro elétrico não é 1 alavanca, são váRIAS (pedido:
 * "painel retangular com várias alavancas pequenas, ex: 6-12
 * disjuntores por quadro") — mas cada objeto do mapa é UMA peça 3D só
 * (não há sub-objetos dentro de um objeto no motor atual); a
 * geometria (caixa) já é maior que o interruptor comum pra "parecer"
 * um quadro com várias alavancas (aproximação visual, sem geometria de
 * alavanca individual real nesta rodada — mesma simplificação de outros
 * objetos "aproximados" do catálogo, ex.: vaso-sanitario/mictorio).
 */
window.ObjectAssets.registerModel('disjuntor', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'disjuntor',
  nome: 'Disjuntor (Quadro Elétrico)',
  propriedades: { interativo: true },

  onModelSpawn(entity, ctx) {
    if (entity.ligado === undefined) entity.ligado = true; // estado inicial: energia ligada
  },

  onModelClick(entity, ctx) {
    entity.ligado = !entity.ligado;

    const map = ctx.map;
    const engine = ctx.view3d?._engine;
    const raio = entity.raioControle || 15; // "sala inteira" — bem maior que os 8m padrão do interruptor comum
    const r2 = raio * raio;

    // Luminárias dentro do raio (mesma técnica de interruptor.config.js).
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

    // Extensão pronta pra outros dispositivos "elétricos" do catálogo, o
    // dia que existirem (ver comentário grande no topo do arquivo) — hoje
    // esta lista está vazia de propósito (nenhum tipo com `entity.ligado`
    // além de luminária foi achado nesta rodada), mas o mecanismo abaixo
    // já cobre qualquer tipo que precise só de "procurar por raio +
    // inverter `.ligado`", sem precisar reescrever este arquivo.
    const TIPOS_ELETRICOS_EXTRAS = []; // ex. futuro: ['computador-ligavel', 'ar-condicionado-ligavel']
    if (TIPOS_ELETRICOS_EXTRAS.length) {
      (map?.objects || []).forEach((o) => {
        if (!TIPOS_ELETRICOS_EXTRAS.includes(o.tipo)) return;
        const dx = o.x - entity.x, dy = o.y - entity.y;
        if ((dx * dx + dy * dy) > r2) return;
        o.ligado = entity.ligado;
      });
    }

    // Cor da alavanca principal do quadro (vermelho=desligado/verde=ligado
    // — mesma convenção visual pedida, reaproveitando o padrão já usado
    // no interruptor comum).
    const corLigado = 0x3fae4a, corDesligado = 0xc0392b;
    const corHex = entity.ligado ? corLigado : corDesligado;
    (engine?._pickMeshes || []).forEach((m) => {
      if (m.userData?.pick?.ref === entity && m.material && m.material.color) {
        m.material.color.setHex(corHex);
      }
    });

    ctx.Utils?.toast?.(entity.ligado ? '⚡ Energia da sala ligada' : '🔌 Energia da sala desligada', { duration: 1400 });
  },
});
