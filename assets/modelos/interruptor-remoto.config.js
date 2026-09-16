/* assets/modelos/interruptor-remoto.config.js
 * NOVO (13/09/2026) — TAREFA 5 do backlog: "postes de luz com
 * interruptores de controle em algum lugar." O `poste` já existe no
 * catálogo (`js/engine3d.js` `_buildPosteMesh`, `PointLight` real) —
 * REAPROVEITADO sem nenhuma mudança nele. O que é NOVO é este painel de
 * controle remoto: em vez de controlar por RAIO físico (como
 * `interruptor.config.js`, que só alcança luminárias PERTO dele), este
 * controla uma LISTA DESIGNADA de postes por id/nome — permitindo um
 * painel "na portaria/entrada" ligar postes fisicamente longe.
 *
 * ONDE FICA A LISTA DE POSTES CONTROLADOS — mesma decisão de design já
 * usada pros waypoints dos robôs (ver _exemplo-script-robo-trajeto.txt):
 * uma propriedade customizável NO PRÓPRIO OBJETO
 * (`entity.postesControlados`, array de ids), editável no painel de
 * propriedades do objeto (campo de texto/JSON simples) OU programaticamente
 * (`Mapping`/script). Preferido a uma constante fixa no código porque o
 * `interruptor.config.js` de raio já era assim (raio configurável por
 * `entity.raioControle`) — aqui, o "raio" vira uma "lista", mas o
 * espírito de "campo na instância, configurável sem editar código" é o
 * mesmo. Se `entity.postesControlados` não for definido, o painel
 * documenta e avisa (toast) que não há nenhum poste associado — não
 * assume nenhum poste "por perto" por padrão (diferente do interruptor de
 * raio, que sempre teve um raio-padrão sensato; aqui não existe um
 * "padrão razoável" de quais postes controlar sem o usuário decidir).
 *
 * FORMATO de `entity.postesControlados`: array de STRINGS, cada uma o
 * `id` (`entity.id`) do objeto poste alvo (ver painel do objeto poste →
 * campo "id"). Ex.: `["obj_a1b2c3", "obj_d4e5f6"]`.
 */
window.ObjectAssets.registerModel('interruptor-remoto', {
  malhaEstatica: true, // [15/09/2026 UTC] NOVO — carrega a malha estática assets/modelos/<tipo>.malha.js (gerada por ferramentas/gerar_malhas.js) em vez da geometria procedural de OBJECT3D_PROFILES/engine3d.js.
  id: 'interruptor-remoto',
  nome: 'Interruptor Remoto (Postes)',
  propriedades: { interativo: true },

  onModelSpawn(entity, ctx) {
    if (entity.ligado === undefined) entity.ligado = true;
    if (entity.postesControlados === undefined) entity.postesControlados = []; // lista vazia por padrão — usuário associa os postes que quiser
  },

  onModelClick(entity, ctx) {
    entity.ligado = !entity.ligado;

    const map = ctx.map;
    const engine = ctx.view3d?._engine;
    const ids = new Set(entity.postesControlados || []);

    if (!ids.size) {
      ctx.Utils?.toast?.('⚠️ Este interruptor remoto não tem nenhum poste associado (edite "postesControlados" no painel do objeto)', { type: 'warning', duration: 3500 });
    }

    // Postes-alvo — filtra por id DENTRO da lista designada, tipo
    // 'poste' (mesma checagem defensiva de tipo do interruptor de raio,
    // caso um id da lista aponte pra outro tipo de objeto por engano).
    const postesAlvo = (map?.objects || []).filter((o) => o.tipo === 'poste' && ids.has(o.id));
    const idsAlvo = new Set(postesAlvo.map((o) => o.id));

    // Cada poste tem sua PRÓPRIA PointLight real (ver engine3d.js
    // `_buildPosteMesh`) — mesma técnica de `_dynamicLights`/
    // `ownerObjId` já usada pelo interruptor de raio, só filtrando pela
    // lista designada em vez de por distância.
    (engine?._dynamicLights || []).forEach((luz) => {
      if (!luz.userData?.ownerObjId || !idsAlvo.has(luz.userData.ownerObjId)) return;
      if (luz.userData._intensidadeOriginal === undefined) luz.userData._intensidadeOriginal = luz.intensity || 1;
      luz.intensity = entity.ligado ? luz.userData._intensidadeOriginal : 0;
    });

    // Cor de status do próprio painel (mesma convenção verde/cinza).
    const corLigado = 0x3fae4a, corDesligado = 0x8a92a3;
    const corHex = entity.ligado ? corLigado : corDesligado;
    (engine?._pickMeshes || []).forEach((m) => {
      if (m.userData?.pick?.ref === entity && m.material && m.material.color) {
        m.material.color.setHex(corHex);
      }
    });

    ctx.Utils?.toast?.(
      (entity.ligado ? '💡 Postes ligados' : '🌑 Postes desligados') + ` (${postesAlvo.length} de ${ids.size} associado(s) encontrado(s))`,
      { duration: 1600 }
    );
  },
});
