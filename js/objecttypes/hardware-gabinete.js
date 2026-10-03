/* js/objecttypes/hardware-gabinete.js
 * NOVO (28/09/2026) — liga o motor de "Exploded View Assembly" (`js/hardware-exploded.js`) ao
 * objeto de catálogo `pc_gabinete` (família "🖥️ Hardware / Montagem de PC", ver `js/objcategorias.js`)
 * dentro do "Ver em 3D" de verdade -- pedido verbatim: "Ainda não está sendo possível interagir no
 * 3D. Para tirar a tampa do Gabinete e trocar peças no seu interior [...] O gabinete não pode ser
 * um bloco único [...] onde o usuário pode interagir e montar/desmontar as peças reais através de
 * cliques na tela ou comandos na interface 2D/3D."
 *
 * Mesmo padrão de `js/objecttypes/rack.js` (primeiro tipo migrado pro registro) + `_rackRuntime`
 * (`js/engine3d-rede-mesh.js`, `_buildRackMesh`): a malha 3D e o "estado vivo" (aqui, a instância
 * de `HardwareExploded.ExplodedAssembly`) moram num Map por objeto (`engine._hardwareRuntime`),
 * pra sobreviver a reconstruções incrementais da CENA sem perder qual peça está montada/desmontada
 * -- ver `_buildHardwareGabineteMesh` abaixo, que REAPROVEITA a instância já existente em vez de
 * criar uma nova do zero sempre que a malha é (re)construída.
 *
 * ESCOPO: só o `pc_gabinete` (gabinete de torre/desktop) ganha o Exploded View nesta rodada -- as
 * peças pedidas (chapa lateral, painel frontal, filtro de poeira, espelho traseiro, gavetas de
 * disco...) são de um gabinete de torre; `notebook`/`workstation`/`servidor_rack` continuam com o
 * placeholder GENÉRICO de caixa única (`_buildGenericCatalogMesh`, mesmo comportamento de antes
 * desta rodada) até um pedido específico de exploded view pra eles também.
 */
class HardwareGabineteMeshBuilder {

  /** Acha (ou cria, na 1ª vez) o par {grupo3D, assembly} deste `obj` específico, guardado em
   *  `engine._hardwareRuntime` (Map obj.id -> {grupo, assembly, luzInterna}). Reconstruir a malha
   *  (ex. `rebuildObjectIncremental`, mudança de posição/ângulo) NÃO deve resetar quais peças
   *  estão montadas/desmontadas -- por isso a instância de `ExplodedAssembly` só é criada 1x; nas
   *  vezes seguintes, o grupo 3D é recriado (peças placeholder novas) mas o ESTADO
   *  (montada/desmontada de cada peça) da instância antiga é reaplicado nele na hora (ver
   *  `_reaplicarEstado` abaixo), então uma peça que o usuário tinha tirado continua tirada mesmo
   *  depois de mover o gabinete no mapa 2D. */
  _obterOuCriarRuntime(engine, obj) {
    if (!engine._hardwareRuntime) engine._hardwareRuntime = new Map();
    const THREE = engine.THREE;
    const HE = window.HardwareExploded;
    // [28/09/2026] `obj.hardware?.tipoEspelhoIO` (opcional, gravado em `obj` como qualquer outra
    // propriedade persistida do objeto) escolhe a variante de espelho traseiro na 1ª construção --
    // pedido: "Deve ser possível trocar o espelho traseiro". Trocas feitas DEPOIS (via
    // `assembly.trocarEspelhoIO(...)`) não recriam o objeto, então não passam por aqui de novo.
    const tipoEspelhoInicial = (obj.hardware && obj.hardware.tipoEspelhoIO) || 'padrao';
    const { grupo, luzInterna } = HE.construirGabinetePlaceholder(THREE, tipoEspelhoInicial);
    const assembly = new HE.ExplodedAssembly(grupo, THREE);

    const anterior = engine._hardwareRuntime.get(obj.id);
    if (anterior) {
      // Reaplica o estado (montada/desmontada) da instância ANTERIOR nas peças do grupo NOVO --
      // sem animação (posiciona direto no alvo final: reconstrução de malha não é uma ação do
      // usuário, não faz sentido "animar" de novo algo que já tinha acontecido antes).
      Object.keys(assembly.estadoGabinete).forEach((chave) => {
        const velho = anterior.assembly.estadoGabinete[chave];
        const novo = assembly.estadoGabinete[chave];
        if (!velho || velho.montada) return; // já nasce montada por padrão -- só precisa tratar quem estava DESMONTADA
        novo.montada = false;
        novo.mesh.position.copy(novo.posicaoDesmontada);
      });
      assembly._atualizarLuzInterna();
    }
    const rt = { grupo, assembly, luzInterna };
    engine._hardwareRuntime.set(obj.id, rt);
    return rt;
  }

  _buildHardwareGabineteMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const engine = this;
    const THREE = engine.THREE;
    const { grupo: g, assembly } = HardwareGabineteMeshBuilder.prototype._obterOuCriarRuntime(engine, obj);

    // Dimensões do placeholder (ver COR_PLACEHOLDER/caixas em hardware-exploded.js): ~0.21 x 0.45 x
    // 0.45m (largura x altura x profundidade), mesma ordem de grandeza de um gabinete ATX real.
    const w = 0.21, h = 0.45, d = 0.45;
    const rotY = objAnguloToRotY(obj.angulo);
    g.position.set(obj.x, baseY + h / 2, obj.y);
    g.rotation.y = rotY;
    g.updateMatrixWorld(true);

    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY, shape: 'box', segments: 14 } };
    engine.pickables.push(objPick);
    g.traverse((m) => {
      if (!m.isMesh) return;
      m.userData.pick = objPick;
      // [28/09/2026] `hardwarePecaSob` (abaixo) não usa mais raycast triângulo-a-triângulo contra
      // estas malhas pra decidir qual PEÇA foi clicada -- ver `ExplodedAssembly.prototype.
      // pecaSobRaio` (hardware-exploded.js) e o comentário grande em `PECAS_REMOVIVEIS` sobre o bug
      // corrigido ("só funcionava bem de frente"). As malhas continuam entrando em `_pickMeshes`
      // só pra o hit-test GROSSO (modo 'pixelperfect') achar "isto é o objeto `obj`" (`userData.
      // pick`) -- a peça ESPECÍFICA é resolvida depois, por OBB, não por triângulo.
      engine._pickMeshes.push(m);
    });
    engine._group.add(g);

    // Sombra de alta definição + PBR das partes metálicas (pedido verbatim, ver função grande em
    // hardware-exploded.js) -- 1x por (re)construção, barato (só ajusta metalness/roughness dos
    // materiais que já existem, não recria nada).
    window.HardwareExploded.configurarRealismoGabinete(THREE, engine.renderer, g);

    // Requisito técnico #4 (Interface 2D/3D Conectada) -- expõe window.desmontarTudo()/
    // montarTudo()/alternarPeca() pra botões HTML fora da cena (ver comentário grande em
    // `ExplodedAssembly.anexarInterfaceGlobal`, hardware-exploded.js). Com vários gabinetes na
    // mesma cena, as 3 funções sempre operam sobre o ÚLTIMO construído/reconstruído -- pra um
    // botão mirar um gabinete ESPECÍFICO entre vários, use `engine.hardwareAssemblyDe(obj)` +
    // chame os métodos direto na instância, sem passar pelas funções globais.
    assembly.anexarInterfaceGlobal();

    return assembly;
  }
}

window.ObjectTypes.register('hardware-gabinete', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'pc_gabinete' && perfil.shape === 'box' && !!window.HardwareExploded; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    HardwareGabineteMeshBuilder.prototype._buildHardwareGabineteMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});

/** Requisito técnico #1 (Raycasting Interativo) — "qual PEÇA do gabinete `obj` está sob o raio
 *  (origem/direção em MUNDO)?" [28/09/2026] REESCRITO -- pedido verbatim (bug relatado): "As
 *  chapas laterais devem ter o raycaster funcionais em qualquer ângulo. Atualmente tem que ficar
 *  bem de frente para elas para montar/desmontar." Delega inteiro pra `ExplodedAssembly.prototype.
 *  pecaSobRaio` (js/hardware-exploded.js) -- que testa uma caixa orientada (OBB) BEM mais grossa
 *  no eixo fino de cada peça em vez de raycast triângulo-a-triângulo contra a malha visual fina
 *  (a causa raiz do bug: um raio só cruza uma chapa de 6mm quase-de-frente pra ela). A malha
 *  desenhada continua fina/realista -- só a detecção de clique ficou mais generosa. Devolve a
 *  CHAVE da peça (`estadoGabinete`, ex. `'chapaLateralEsquerda'`) ou `null`. Quem chama isto (ver
 *  integração em `js/view3d.js`) passa a chave direto pra `assembly.alternarPeca(chave)`. */
window.Engine3D.prototype.hardwarePecaSob = function hardwarePecaSob(obj, origin, dir) {
  const assembly = this.hardwareAssemblyDe(obj);
  return assembly ? assembly.pecaSobRaio(origin, dir) : null;
};

/** [28/09/2026] NOVO — "o raio está mirando no botão de ligar/desligar deste gabinete?" Pedido
 *  verbatim: "Observe como o objeto Switch liga/desliga. O Gabinete deve ser do mesmo jeito, só
 *  que deve estar apontando para o botão ligar/desligar. Use pixel perfect para isso." Delega pra
 *  `ExplodedAssembly.prototype.botaoPowerSobRaio` -- que, diferente de `hardwarePecaSob` acima
 *  (OBB grosso pras tampas), faz um `THREE.Raycaster` de VERDADE contra só a malha do botão,
 *  exatamente como o modo 'pixelperfect' de "Configurações 3D" faz pro resto da cena. Usado por
 *  `js/view3d.js` (`_cliqueEdicao3D`) ANTES de testar as tampas -- botão tem prioridade sobre as
 *  peças, já que fica na mesma região do painel frontal. */
window.Engine3D.prototype.hardwareBotaoPowerSob = function hardwareBotaoPowerSob(obj, origin, dir) {
  const assembly = this.hardwareAssemblyDe(obj);
  return assembly ? assembly.botaoPowerSobRaio(origin, dir) : false;
};

/** Devolve a instância de `ExplodedAssembly` já construída pra este `obj` (ou `null`, se a malha
 *  dele ainda não foi montada nesta cena) -- usado por `js/view3d.js` pra chamar
 *  `.alternarPeca()`/`.desmontarTudo()`/`.montarTudo()`/`.tick()` sem precisar saber NADA de como
 *  o runtime é guardado internamente. */
window.Engine3D.prototype.hardwareAssemblyDe = function hardwareAssemblyDe(obj) {
  return (this._hardwareRuntime && this._hardwareRuntime.get(obj.id) || {}).assembly || null;
};
