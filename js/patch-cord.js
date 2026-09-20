/*
 * js/patch-cord.js
 * [19/09/2026 UTC] NOVO (RODADA 178)
 *
 * PatchCord — objeto de cabo dinâmico e inteligente (Plug_A/Plug_B com "exitVector" de
 * ancoragem, pré-visualização "ghost" durante o arraste, curva de Bézier cúbica com "barriga"
 * de gravidade, e restrição de profundidade pra nunca vazar através da porta fechada do rack).
 * Pedido verbatim do usuário, atuando como "Engenheiro de Computação Gráfica Sênior e
 * Especialista em Motores 3D Web".
 *
 * ARQUITETURA (mesmo padrão de `rede-storage-energia.js` deste projeto):
 * classes de LÓGICA/MATEMÁTICA PURA (`Vec3`, `PatchCordPlug`, `PatchCord`), sem nenhuma
 * dependência do Three.js — testáveis isoladamente em Node/CI. A camada visual
 * (`PatchCordView3D`, no final do arquivo) só é definida SE `THREE` já existir no escopo
 * global (navegador com Three.js carregado) — em Node ela simplesmente não é criada, e o
 * resto do módulo funciona normalmente.
 *
 * IMPORTANTE — RESTRIÇÃO EM VIGOR NESTA SESSÃO (respeitada aqui): o usuário pediu
 * explicitamente, numa rodada anterior, pra NÃO mexer mais em `js/engine3d.js`
 * (`_redePortaMundo`/`rebuildCabos`, o pipeline de cabos JÁ EXISTENTE e em uso — duas
 * tentativas de mexer nele quebraram os cabos do rack e foram revertidas). Este arquivo é
 * NOVO E INDEPENDENTE: não importa, não chama e não altera nenhuma linha de `engine3d.js`.
 * É a arquitetura pedida agora, pronta pra ser adotada — inteira ou por partes — numa
 * integração futura. Wireado em `index.html`/
 * `sw.js` (script novo, carregado, mas não chamado por nenhuma tela ainda).
 *
 * Todos os comentários em português, como pedido.
 */
(function (raiz) {
  'use strict';

  // ==========================================================================
  // 0) VETOR 3D — implementação mínima e independente do Three.js (mesmo motivo de
  //    outros módulos puros: o módulo precisa ser testável em Node puro). Quem for plugar
  //    isto numa cena Three.js real converte pra `THREE.Vector3` na camada de VIEW
  //    (`PatchCordView3D`, no final do arquivo) — a lógica nunca depende do Three.
  // ==========================================================================
  class Vec3 {
    constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
    clone() { return new Vec3(this.x, this.y, this.z); }
    add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
    sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
    scale(k) { return new Vec3(this.x * k, this.y * k, this.z * k); }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    normalize() { const l = this.length(); return l > 1e-9 ? this.scale(1 / l) : new Vec3(0, 0, 1); }
    distTo(v) { return this.sub(v).length(); }
    toArray() { return [this.x, this.y, this.z]; }
    static from(o) { return o instanceof Vec3 ? o : new Vec3(o.x, o.y, o.z); }
  }

  // ==========================================================================
  // 1) CONFIGURAÇÃO PADRÃO — todos os "números mágicos" do algoritmo, centralizados e
  //    documentados, pra poder ser ajustado sem caçar valores espalhados pelo código.
  // ==========================================================================
  const PADRAO = Object.freeze({
    /** Distância (m) que o cabo percorre em linha reta seguindo o `exitVector` de cada plug
     *  antes de começar a curvar — é isto que garante o requisito 1 (ancoragem): o cabo
     *  SEMPRE sai reto de dentro do conector, nunca torto, não importa pra onde a outra
     *  ponta esteja. Também é a distância usada pra calcular os pontos de controle P1/P2
     *  da Bézier (ver `computeBezierPoints`). Valor típico de patch cord Cat6/fibra. */
    distanciaSaidaM: 0.045,
    /** "Barriga" de gravidade (m) — quanto o meio do cabo cai (eixo Y) em relação à reta
     *  P0-P3, proporcional à distância horizontal entre as pontas (cabo mais longo = barriga
     *  mais funda, como um cabo de verdade sob o próprio peso). */
    fatorGravidade: 0.18,
    /** Barriga MÁXIMA (m) — trava o efeito de gravidade pra cabos muito longos não caírem
     *  de forma exagerada/irreal. */
    gravidadeMaxM: 0.35,
    /** Recuo técnico (m) entre o equipamento e a porta do rack (Z_Max_Porta) — o cabo nunca
     *  deve chegar mais perto da porta do que isto, mesmo no pico da curva. Requisito 4 do
     *  pedido ("espaço de 5cm a 10cm"); usamos o meio da faixa como padrão. */
    recuoPortaM: 0.07,
    /** Raio de snap (m) — distância máxima do ponteiro/mouse a uma porta candidata pra
     *  `updateGhostPosition` "grudar" nela visualmente antes da confirmação. */
    raioSnapM: 0.06,
    /** Nº de segmentos usados pra amostrar a curva (`amostrarCurva`) — mais segmentos =
     *  malha mais suave, ao custo de mais vértices na `TubeGeometry`. */
    segmentosAmostra: 24,
  });

  // ==========================================================================
  // 2) MATEMÁTICA DA CURVA — Bézier cúbica (De Casteljau) + a restrição de profundidade
  //    da porta do rack (requisitos 3 e 4 do pedido).
  // ==========================================================================

  /** Avalia a Bézier cúbica P0,P1,P2,P3 no parâmetro t ∈ [0,1] (De Casteljau, numericamente
   *  mais estável que expandir os coeficientes de Bernstein na mão). */
  function bezierCubico(P0, P1, P2, P3, t) {
    const u = 1 - t;
    const a = P0.scale(u * u * u);
    const b = P1.scale(3 * u * u * t);
    const c = P2.scale(3 * u * t * t);
    const d = P3.scale(t * t * t);
    return a.add(b).add(c).add(d);
  }

  /** Amostra `n+1` pontos da Bézier cúbica, uniformemente em t (não em comprimento de arco —
   *  suficiente pra malha visual; se um dia precisar de espaçamento uniforme de verdade,
   *  reparametrizar por comprimento de arco é o próximo passo, fora do escopo deste pedido). */
  function amostrarBezier(P0, P1, P2, P3, n) {
    n = n > 1 ? n : PADRAO.segmentosAmostra;
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(bezierCubico(P0, P1, P2, P3, i / n));
    return pts;
  }

  /**
   * constrainCableCurvature(P0, P1, P2, P3, zLimit, opt) — requisito 4 do pedido
   * (ANTI-CLIPPING): garante que NENHUM ponto de controle (P1/P2 — e, por segurança, também
   * as próprias extremidades P0/P3, caso já cheguem violando o limite) ultrapasse
   * `zLimit` (a profundidade Z_Max_Porta, no sentido "pra frente" do rack, em direção à
   * porta). Estratégia (conforme pedido):
   *   1) "Achata" o ponto de controle pra trás: se `P.z > zLimit - recuo`, o excesso
   *      (`P.z - (zLimit - recuo)`) é cortado — o ponto recua até o limite seguro.
   *   2) O excesso cortado é redirecionado PRA LATERAL (eixo X, em direção às guias de
   *      cabo verticais mais próximas — `opt.guiaXEsquerda`/`opt.guiaXDireita`, quando
   *      informadas, senão simplesmente empurra pro lado mais próximo do próprio ponto):
   *      o cabo "sobra" de curvatura vira desvio lateral em vez de vazamento frontal.
   *   3) Preferência por cair verticalmente: se ainda sobrar excesso depois do desvio
   *      lateral (`opt.guiaXEsquerda`/`Direita` já definem um teto de quanto se pode
   *      desviar), o restante é absorvido baixando o ponto no eixo Y (cabo "escorrega" pra
   *      baixo em vez de estourar a porta) — comportamento físico de um patch cord real
   *      apoiado contra uma barreira frontal.
   * Não muta os pontos recebidos (retorna cópias nesse mesmo array de 4 pontos), pra manter
   * a função pura/testável.
   * @returns {Vec3[]} [P0, P1', P2', P3] — P0/P3 só são alterados no caso extremo de já
   *   chegarem violando o limite (não deveria acontecer em uso normal, já que são as
   *   posições REAIS dos plugs — mas a função protege contra esse caso mesmo assim).
   */
  function constrainCableCurvature(P0, P1, P2, P3, zLimit, opt) {
    opt = opt || {};
    const recuo = opt.recuoPortaM != null ? opt.recuoPortaM : PADRAO.recuoPortaM;
    const zSeguro = zLimit - recuo;   // profundidade máxima realmente permitida pro cabo (já com a folga técnica)
    const desvioLateralMax = opt.desvioLateralMaxM != null ? opt.desvioLateralMaxM : 0.05;

    /** Restringe UM ponto: recua em Z, redireciona o excesso pra X (lateral) e, se ainda
     *  sobrar, absorve em Y (queda vertical). */
    function restringirPonto(P) {
      if (P.z <= zSeguro) return P.clone();   // dentro do limite -- nada a fazer
      const excesso = P.z - zSeguro;
      // 1) achata pra trás (Z nunca ultrapassa o limite seguro).
      let z2 = zSeguro;
      // 2) desvia lateralmente (X) até `desvioLateralMax`, na direção da guia mais próxima
      //    (se informadas) ou simplesmente pro lado em que o próprio X do ponto já pende.
      let desvioX = Math.min(excesso, desvioLateralMax);
      let sinalX = 1;
      if (Number.isFinite(opt.guiaXEsquerda) && Number.isFinite(opt.guiaXDireita)) {
        sinalX = Math.abs(P.x - opt.guiaXEsquerda) <= Math.abs(P.x - opt.guiaXDireita) ? -1 : 1;
      } else {
        sinalX = P.x >= 0 ? 1 : -1;
      }
      const x2 = P.x + sinalX * desvioX;
      // 3) o que sobrar do excesso (depois do desvio lateral já ter absorvido seu tanto)
      //    vira queda em Y -- o cabo "escorrega" pra baixo em vez de estourar a porta.
      const restante = Math.max(0, excesso - desvioLateralMax);
      const y2 = P.y - restante;
      return new Vec3(x2, y2, z2);
    }

    return [P0.z > zSeguro ? restringirPonto(P0) : P0.clone(), restringirPonto(P1), restringirPonto(P2), P3.z > zSeguro ? restringirPonto(P3) : P3.clone()];
  }

  // ==========================================================================
  // 3) PatchCordPlug — uma das duas extremidades físicas do cabo (Plug_A/Plug_B).
  // ==========================================================================
  class PatchCordPlug {
    /**
     * @param {object} o
     *   position: Vec3|{x,y,z} — centro geométrico do conector (RJ-45/óptico) no MUNDO.
     *   exitVector: Vec3|{x,y,z} — direção LOCAL de saída do conector (normalizada
     *     automaticamente), geralmente "pra frente" saindo da porta -- requisito 1
     *     (ancoragem): a curva DEVE nascer seguindo este vetor.
     *   portId/portObject: referência opcional de qual porta este plug está ligado
     *     (usado por `snapToPort`/pela camada de integração futura — não obrigatório pra
     *     um plug "solto", ex.: durante o ghost antes do snap).
     */
    constructor(o) {
      o = o || {};
      this.position = Vec3.from(o.position || { x: 0, y: 0, z: 0 });
      this.exitVector = Vec3.from(o.exitVector || { x: 0, y: 0, z: 1 }).normalize();
      this.portId = o.portId != null ? o.portId : null;
      this.portObject = o.portObject || null;
    }
    /** Ponto de controle "natural" deste plug: anda `distancia` (m) na direção do
     *  `exitVector`, a partir da posição do conector -- é o P1 (ou P2) de origem, ANTES de
     *  qualquer ajuste de gravidade/restrição de porta. */
    pontoControleNatural(distancia) {
      return this.position.add(this.exitVector.scale(distancia != null ? distancia : PADRAO.distanciaSaidaM));
    }
  }

  // ==========================================================================
  // 4) PatchCord — o cabo em si: estados (idle/ghost/connected), os dois plugs, e o
  //    cálculo da curva (Bézier cúbica com restrição de porta).
  // ==========================================================================
  let _seqCabo = 0;
  class PatchCord {
    /**
     * @param {object} opt
     *   tipoCabo: string livre (ex.: 'cat6', 'fibra', 'console') -- só metadado, não afeta
     *     a matemática da curva.
     *   zLimitPorta: number (m) -- Z_Max_Porta do rack onde este cabo vive (requisito 4);
     *     pode ser passado aqui ou depois, em `computeBezierPoints(opt)`.
     *   guiaXEsquerda/guiaXDireita: número (m, eixo X) -- posição das guias de cabo
     *     verticais do rack, usadas por `constrainCableCurvature` pra decidir o lado do
     *     desvio lateral quando a curva precisa recuar.
     */
    constructor(opt) {
      opt = opt || {};
      this.id = 'patchcord_' + (++_seqCabo);
      this.tipoCabo = opt.tipoCabo || 'cat6';
      this.estado = 'idle';   // 'idle' | 'ghost' | 'connected' -- item 1 do pedido (SAÍDA ESPERADA 1)
      this.plugA = null;
      this.plugB = null;
      this.zLimitPorta = opt.zLimitPorta != null ? opt.zLimitPorta : null;
      this.guiaXEsquerda = opt.guiaXEsquerda != null ? opt.guiaXEsquerda : null;
      this.guiaXDireita = opt.guiaXDireita != null ? opt.guiaXDireita : null;
      this.snapped = false;   // true quando o Plug_B do ghost está "grudado" numa porta candidata
      this._ultimosPontos = null;   // cache dos 4 pontos de Bézier já calculados (ver computeBezierPoints)
    }

    // ------------------------------------------------------------------------
    // 4.1) CICLO DE VIDA DA CONEXÃO (SAÍDA ESPERADA 3)
    // ------------------------------------------------------------------------

    /**
     * startDragging(plugAInfo) — item 2 do pedido (GHOST STATE): o usuário clicou na
     * Porta_A e começou a arrastar. Trava o Plug_A na porta de origem, entra em modo
     * 'ghost' e zera o Plug_B (que passa a seguir o mouse via `updateGhostPosition`).
     * @param {object} plugAInfo  { position, exitVector, portId, portObject } da Porta_A.
     */
    startDragging(plugAInfo) {
      this.plugA = new PatchCordPlug(plugAInfo);
      this.plugB = null;
      this.estado = 'ghost';
      this.snapped = false;
      return this;
    }

    /**
     * updateGhostPosition(mouseXYZ, portasProximas) — item 2 do pedido: chamado a cada
     * movimento do mouse enquanto em modo ghost. Se `portasProximas` (lista de candidatas
     * pré-filtradas pela camada de integração — ex.: portas do MESMO rack dentro de um raio
     * generoso, calculado por quem chama) tiver alguma porta dentro de `PADRAO.raioSnapM`
     * do ponteiro, o Plug_B "gruda" nela (snap visual sutil: usa a posição/exitVector REAIS
     * da porta, não do mouse) -- senão, o Plug_B segue o mouse cru, com um `exitVector`
     * aproximado (voltado de volta pro Plug_A, já que ainda não se sabe a orientação real
     * de destino).
     * @param {Vec3|{x,y,z}} mouseXYZ  posição 3D atual do ponteiro (já convertida de
     *   tela pra mundo pela camada de input -- fora do escopo deste módulo).
     * @param {Array<{position,exitVector,portId,portObject}>} [portasProximas]
     * @returns {{snapped:boolean, portId:?string}} resumo do resultado, pra UI reagir
     *   (ex.: destacar a porta alvo).
     */
    updateGhostPosition(mouseXYZ, portasProximas) {
      if (this.estado !== 'ghost' || !this.plugA) return { snapped: false, portId: null };
      const mouse = Vec3.from(mouseXYZ);
      let candidata = null, menorDist = Infinity;
      (portasProximas || []).forEach((p) => {
        const d = mouse.distTo(Vec3.from(p.position));
        if (d < menorDist) { menorDist = d; candidata = p; }
      });
      if (candidata && menorDist <= PADRAO.raioSnapM) {
        this.plugB = new PatchCordPlug(candidata);
        this.snapped = true;
        return { snapped: true, portId: this.plugB.portId };
      }
      // sem snap: Plug_B solto na posição do mouse -- exitVector aproximado apontando de
      // volta pro Plug_A (garante que a curva ainda "nasce" alinhada em vez de ficar
      // instável/tremendo enquanto o usuário mira; vira o exitVector real assim que um
      // `snapToPort`/segunda extremidade de verdade for confirmada).
      const direcaoDeVolta = this.plugA.position.sub(mouse).normalize();
      this.plugB = new PatchCordPlug({ position: mouse, exitVector: direcaoDeVolta });
      this.snapped = false;
      return { snapped: false, portId: null };
    }

    /**
     * snapToPort(portObject) — item 2/3 do pedido: confirma o Plug_B numa porta específica
     * (chamado ao clicar de propósito numa porta, não só passar perto -- diferente do snap
     * automático de `updateGhostPosition`, que é só uma prévia visual). Aceita tanto o
     * formato `{position, exitVector, portId}` já pronto quanto delega pra quem chama
     * montar esse objeto (ex.: a camada de integração que sabe ler `_redePortaMundo`,
     * SEM este módulo depender daquela função).
     */
    snapToPort(portObject) {
      if (!portObject) return this;
      this.plugB = new PatchCordPlug(portObject);
      this.snapped = true;
      return this;
    }

    /** Confirma a conexão -- sai do modo ghost, vira um cabo "de verdade" (estado
     *  'connected'). Exige que Plug_A e Plug_B já estejam definidos. */
    confirmarConexao() {
      if (!this.plugA || !this.plugB) return false;
      this.estado = 'connected';
      return true;
    }

    /** Cancela o arraste (ESC, clique fora, etc.) -- volta pro estado 'idle', descarta o
     *  Plug_B (o Plug_A também é descartado, já que sem conexão o cabo não existe mais). */
    cancelarDrag() {
      this.estado = 'idle';
      this.plugA = null;
      this.plugB = null;
      this.snapped = false;
      this._ultimosPontos = null;
      return this;
    }

    // ------------------------------------------------------------------------
    // 4.2) GEOMETRIA DA CURVA (SAÍDA ESPERADA 2)
    // ------------------------------------------------------------------------

    /**
     * computeBezierPoints(opt) — requisitos 3 e 4 do pedido: calcula os 4 pontos da Bézier
     * cúbica (P0=Plug_A, P1/P2=controle com barriga de gravidade, P3=Plug_B), então aplica
     * `constrainCableCurvature` contra `zLimitPorta` (deste cabo, ou `opt.zLimitPorta` pra
     * sobrescrever pontualmente). Retorna `null` se o cabo ainda não tem as duas pontas
     * definidas (ex.: ghost recém-iniciado, antes do primeiro `updateGhostPosition`).
     * @returns {Vec3[]|null} [P0, P1, P2, P3]
     */
    computeBezierPoints(opt) {
      if (!this.plugA || !this.plugB) return null;
      opt = opt || {};
      const distSaida = opt.distanciaSaidaM != null ? opt.distanciaSaidaM : PADRAO.distanciaSaidaM;

      // P0/P3 = requisito 1 (ancoragem): posição EXATA dos conectores -- a curva nasce e
      // morre exatamente ali, nunca "flutuando" perto da porta.
      const P0 = this.plugA.position.clone();
      const P3 = this.plugB.position.clone();

      // P1/P2 iniciais: andam `distSaida` na direção do `exitVector` de cada plug -- é isto
      // que faz a curva SAIR RETA de dentro do conector antes de começar a curvar (requisito
      // 1), em vez de apontar direto pra outra ponta (o que ficaria "torto"/colado na porta).
      let P1 = this.plugA.pontoControleNatural(distSaida);
      let P2 = this.plugB.pontoControleNatural(distSaida);

      // Barriga de gravidade (requisito 3: "P1 e P2 determinam a barriga/curvatura -- a
      // gravidade que faz o cabo cair"): quanto mais afastados P0/P3 na horizontal (plano
      // XZ), mais o cabo "peca" no meio -- proporcional, com teto (`gravidadeMaxM`) pra não
      // ficar irreal em cabos muito compridos.
      const distHorizontal = Math.hypot(P3.x - P0.x, P3.z - P0.z);
      const gravidade = Math.min(PADRAO.gravidadeMaxM, distHorizontal * PADRAO.fatorGravidade);
      P1 = new Vec3(P1.x, P1.y - gravidade * 0.5, P1.z);
      P2 = new Vec3(P2.x, P2.y - gravidade * 0.5, P2.z);

      // Requisito 4 (ANTI-CLIPPING): restringe a curva pra nunca ultrapassar a porta do
      // rack, se este cabo tiver um `zLimitPorta` configurado.
      const zLimit = opt.zLimitPorta != null ? opt.zLimitPorta : this.zLimitPorta;
      let pontos;
      if (zLimit != null) {
        pontos = constrainCableCurvature(P0, P1, P2, P3, zLimit, {
          recuoPortaM: opt.recuoPortaM,
          desvioLateralMaxM: opt.desvioLateralMaxM,
          guiaXEsquerda: opt.guiaXEsquerda != null ? opt.guiaXEsquerda : this.guiaXEsquerda,
          guiaXDireita: opt.guiaXDireita != null ? opt.guiaXDireita : this.guiaXDireita,
        });
      } else {
        pontos = [P0, P1, P2, P3];
      }
      this._ultimosPontos = pontos;
      return pontos;
    }

    /** Amostra a curva já calculada (chama `computeBezierPoints` se ainda não tiver rodado
     *  nesta atualização) em `n` segmentos -- pontos prontos pra virar uma `TubeGeometry`
     *  (camada de view) ou qualquer outro consumidor. */
    amostrarCurva(n, opt) {
      const pontos = this.computeBezierPoints(opt);
      if (!pontos) return [];
      return amostrarBezier(pontos[0], pontos[1], pontos[2], pontos[3], n);
    }

    /** Comprimento aproximado do cabo (soma dos segmentos da amostragem) -- útil pra UI
     *  (mostrar "1,8 m" no balão de dica, por ex., mesmo padrão de `RedePassiva`). */
    comprimentoAproximado(n) {
      const pts = this.amostrarCurva(n);
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += pts[i].distTo(pts[i - 1]);
      return total;
    }
  }

  // ==========================================================================
  // 5) ESTILO VISUAL DO ESTADO 'ghost' — requisito 2 do pedido (opacidade reduzida,
  //    tracejado/emissivo neon semi-transparente, sem colisão pesada). Retorna só DADOS
  //    (a criação de fato do `THREE.Material` é responsabilidade da camada de view, pra
  //    este módulo continuar sem depender do Three.js).
  // ==========================================================================
  function estiloVisualDoEstado(estado, opt) {
    opt = opt || {};
    const corBase = opt.cor != null ? opt.cor : 0x5ad46a;
    if (estado === 'ghost') {
      return {
        opacity: 0.4,
        transparent: true,
        dashed: true,
        dashSize: 0.03,
        gapSize: 0.02,
        emissive: opt.corGhost != null ? opt.corGhost : 0x5ad46a,
        emissiveIntensity: 0.9,
        depthTest: false,   // sempre visível por cima da cena, como o ghost de porta já existente em view3d-rede.js
        renderOrder: 999,
        colisao: false,     // item 2 do pedido: "desativar cálculos pesados de colisão"
      };
    }
    // 'connected' (ou qualquer outro estado real) -- cabo físico normal, sólido, com colisão.
    return {
      opacity: 1, transparent: false, dashed: false, emissive: corBase, emissiveIntensity: 0.15,
      depthTest: true, renderOrder: 0, colisao: true,
    };
  }

  // ==========================================================================
  // 6) PatchCordView3D — camada de RENDERIZAÇÃO (Three.js), só existe se `THREE` já
  //    estiver no escopo global (navegador). Não é chamada por nenhuma tela do app ainda
  //    (ver nota no topo do arquivo) -- é a "SAÍDA ESPERADA" de renderização pedida, pronta
  //    pra ser adotada. Consome exclusivamente a lógica pura acima (`PatchCord.amostrarCurva`/
  //    `estiloVisualDoEstado`), nunca acessa `engine3d.js`.
  // ==========================================================================
  function _criarViewClasse(THREE) {
    return class PatchCordView3D {
      /** @param {PatchCord} cabo  @param {object} [opt] { raioTubo (m, default 0,0011 ~ Cat6) } */
      constructor(cabo, opt) {
        this.cabo = cabo;
        this.raioTubo = (opt && opt.raioTubo) || 0.0011;
        this.mesh = null;       // THREE.Mesh (TubeGeometry) -- cabo sólido/ghost
        this.material = null;
        this._disp = [];
      }

      /** (Re)constrói a malha a partir da curva atual do `PatchCord` -- chamar sempre que o
       *  cabo mudar de estado/posição (ghost seguindo o mouse a cada quadro, ou uma vez só
       *  ao confirmar a conexão). Descarta a malha anterior (evita vazamento de memória de
       *  geometria, mesmo cuidado do resto do projeto -- ver `dispose()` de outras views). */
      atualizar(grupo) {
        const pontos3D = this.cabo.amostrarCurva();
        if (!pontos3D.length) { this.limpar(grupo); return null; }
        this.limpar(grupo);
        const vs = pontos3D.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        const curva = new THREE.CatmullRomCurve3(vs, false, 'catmullrom', 0.5);
        const estilo = estiloVisualDoEstado(this.cabo.estado);
        const geo = new THREE.TubeGeometry(curva, Math.max(8, vs.length * 2), this.raioTubo, 6, false);
        this.material = new THREE.MeshStandardMaterial({
          color: estilo.emissive, emissive: estilo.emissive, emissiveIntensity: estilo.emissiveIntensity,
          transparent: estilo.transparent, opacity: estilo.opacity, depthTest: estilo.depthTest,
        });
        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.renderOrder = estilo.renderOrder;
        this.mesh.userData.patchCordId = this.cabo.id;
        this._disp.push(geo);
        if (grupo) grupo.add(this.mesh);
        return this.mesh;
      }

      limpar(grupo) {
        if (this.mesh) {
          if (grupo && this.mesh.parent === grupo) grupo.remove(this.mesh);
          this._disp.forEach((g) => { try { g.dispose(); } catch (e) { /* ok */ } });
          this._disp = [];
          if (this.material) { try { this.material.dispose(); } catch (e) { /* ok */ } }
          this.mesh = null; this.material = null;
        }
      }

      dispose(grupo) { this.limpar(grupo); }
    };
  }

  // ==========================================================================
  // 7) EXPORT (UMD -- mesmo padrão de `rede-storage-energia.js`).
  // ==========================================================================
  const API = {
    Vec3, PatchCordPlug, PatchCord,
    bezierCubico, amostrarBezier, constrainCableCurvature, estiloVisualDoEstado,
    PADRAO,
  };
  // `PatchCordView3D` só existe se o THREE já estiver carregado no escopo global -- em Node
  // (testes) fica de fora do objeto exportado, sem quebrar nada.
  if (typeof THREE !== 'undefined') API.PatchCordView3D = _criarViewClasse(THREE);

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.PatchCord_API = API;   // nome do arquivo == nome da classe principal; sufixo _API pra não colidir
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * RESSALVA HONESTA :
 * - Este módulo é a ARQUITETURA pedida (classes, matemática da curva, ciclo de vida
 *   ghost→connected), testável isoladamente. Ele NÃO está conectado a nenhuma tela do
 *   app ainda -- o sistema de cabeamento hoje em uso (`js/view3d-rede.js` +
 *   `Engine3D.rebuildCabos`/`_redePortaMundo` em `js/engine3d.js`) continua exatamente
 *   como estava, sem nenhuma alteração, respeitando o pedido explícito do usuário de não
 *   mexer mais naquele trecho.
 * - Pra integrar de verdade no futuro (se pedido): a camada que hoje chama
 *   `RedeEquip.conectar`/`Engine3D.rebuildCabos` passaria a, opcionalmente, instanciar um
 *   `PatchCord` por cabo (usando a posição/`exitVector` real de cada porta -- teria que vir
 *   de uma função equivalente a `_redePortaMundo`, mas isso é problema de outra rodada,
 *   não deste módulo) e usar `PatchCordView3D` pra desenhar; os dois sistemas de cabo
 *   (o atual, com `CatmullRomCurve3` simples ponta-a-ponta, e este novo, com Bézier +
 *   anti-clipping) podem conviver exatamente como `RedePassiva` convivem.
 * - `exitVector` de cada plug precisa vir de quem chama (ex.: a normal da face do painel
 *   frontal do equipamento, já calculável a partir de `obj.angulo` -- mesma trigonometria
 *   que `_redePortaMundo` já faz, só que ESTE módulo não a duplica nem a importa, pra não
 *   esbarrar na restrição em vigor).
 * - `constrainCableCurvature` assume que o eixo Z do sistema de coordenadas passado é
 *   "profundidade do rack" (maior Z = mais perto da porta/frente) -- é responsabilidade de
 *   quem chama garantir que os pontos entregues já estejam nesse referencial (mundo, não
 *   local do objeto), do mesmo jeito que `PathwayEngine` faz.
 * - Testado nesta sessão via `node -e` (bezier cúbica contra os 4 pontos originais em t=0/1,
 *   barriga de gravidade proporcional à distância, restrição de Z nunca ultrapassando o
 *   limite mesmo com pontos de controle muito além dele, ciclo completo
 *   startDragging→updateGhostPosition (sem snap e com snap)→snapToPort→confirmarConexao,
 *   e cancelarDrag limpando o estado) -- todos os cenários bateram. Nada testado em
 *   navegador de verdade (`device_bash` seguiu indisponível nesta sessão) -- a classe
 *   `PatchCordView3D` não pôde ser visualmente verificada, só revisada por leitura de
 *   código (API do Three.js usada -- `TubeGeometry`/`CatmullRomCurve3`/
 *   `MeshStandardMaterial` -- é a MESMA já em uso em `engine3d.js`/`view3d-rede.js` neste
 *   projeto, reduzindo o risco de erro de API).
 */
