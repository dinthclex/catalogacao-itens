/* ============================================================================
 * radio-wave-raytracer.js  --  MOTOR SEPARADO de traçado de raios de rádio (reflexão + refração)
 * [23/09/2026 UTC] NOVO; [24/09/2026 UTC] REVISADO (v2) -- pedido verbatim: "As duas varreduras devem
 * coexistir [...] Caso nenhuma das duas [reflexão/refração] esteja habilitada, então [...] será idêntico ao
 * produzido pela varredura normal." -- por isso a semântica mudou em relação à v1:
 *
 *   - PENETRAÇÃO (o raio atravessa a parede e perde potência) é SEMPRE a linha de base, exatamente como no motor
 *     normal de `js/wifi-signal.js` (cada objeto atravessado remove a fração `atenuacaoDoPick` da potência).
 *   - REFRAÇÃO (`enableRefraction`) = o raio que atravessa o objeto DOBRA pela lei de Snell (vetor de refração)
 *     ao entrar e emerge pela face de saída (também por Snell), deslocado lateralmente -- em vez de seguir reto.
 *   - REFLEXÃO (`enableReflection`) = cada batida gera, ALÉM do raio transmitido, um raio refletido especular
 *     (V − 2·(V·N)·N) com a potência de reflexão do material (Fresnel-Schlick, R + T ≤ 1).
 *   Sem nenhuma das duas, a árvore é só a linha reta com penetração = motor normal.
 *
 * COMO ESTE MÓDULO SE ENCAIXA (Extension Pattern)
 * -----------------------------------------------
 *  Recebe os raios iniciais do motor existente (origem + direções unitárias + P0 com ganho de antena/faixa --
 *  ver `RadioWaveRayTracer.entradaDoAP`) e NÃO altera `wifi-signal.js`. Devolve, por callback (`onSegmento`) e/ou
 *  por nuvem de pontos, os segmentos de raio já com as 3 perdas acumuladas. Só cria `window.RadioWaveRayTracer`.
 *
 * FÍSICA (as 3 perdas, todas cumulativas)
 * ---------------------------------------
 *  Cada segmento carrega `pAcc` (potência após as perdas de SUPERFÍCIE) e `L` (comprimento TOTAL do caminho
 *  desdobrado desde o AP, somando os segmentos anteriores). Em qualquer ponto do segmento:
 *
 *        I = pAcc / L²                                   (perda por DISTÂNCIA -- inverso do quadrado)
 *
 *  Numa batida (a distância L do AP) nascem até 3 filhos:
 *   - PENETRAÇÃO reta:  pAcc' = pAcc · T          (T = 1 − atenuação do app; o baseline do motor normal)
 *   - PENETRAÇÃO refratada (Snell): idem, mas com o caminho dobrado dentro do objeto (deslocamento lateral e
 *     caminho L + espessura percorrida).
 *   - REFLEXÃO:  pAcc' = pAcc · R,  R = min(Fresnel-Schlick, 1 − T, 0,95).
 *  A intensidade só decresce ao longo de um caminho ⇒ cada limiar de nível cruza UMA vez por segmento, de forma
 *  analítica:  I = limiar_k ⇒ L_k = √(pAcc / limiar_k).
 *  Em dB:  P = 10·log10(P0) − 20·log10(L) − Σ perdaRefração(dB) − Σ perdaReflexão(dB).
 *
 *  Vetores (mesma álgebra de THREE.Vector3, em escalares p/ zero alocação no laço quente):
 *   - Reflexão:  V_r = V − 2·(V·N)·N                                (N unitária voltada p/ o raio)
 *   - Refração (Snell):  η = n1/n2, cosI = −V·N, sin²T = η²(1 − cosI²),  V_t = η·V + (η·cosI − cosT)·N
 *
 * LIMITES (evita loops infinitos / travamento)
 * --------------------------------------------
 *  - `maxBounces` (padrão 6) = nº máximo de REFLEXÕES por linhagem de raio. (Refrações/penetrações NÃO gastam
 *    esse orçamento: o motor normal atravessa quantas paredes o sinal aguentar, e a igualdade com ele exige o
 *    mesmo; elas têm o seu teto próprio `maxTravessias`, padrão 4, e a poda por limiar.)
 *  - `rssiThresholdDbm` ('Limiar (dBm)'): o segmento termina onde I cai abaixo dele; nenhum filho nasce se já
 *    nasceria abaixo (poda antecipada da árvore) -- o limiar/perda por distância SEMPRE tem prioridade: se ele
 *    é atingido antes dos tetos de reflexão/refração, o raio para ali mesmo, ainda que reflexões/refrações
 *    "sobrassem" no orçamento. [24/09/2026] NOVO -- pedido verbatim: "Se o 'Limiar (dBm)' o a perda por
 *    distância for atingida primeiro, então o raio para, mesmo não tendo chegado nos limites de reflexão e de
 *    refração configurados."
 *  - Árvore com PILHA EXPLÍCITA (typed array pré-alocada, sem recursão JS nem alocação por raio) e execução
 *    ASSÍNCRONA em lotes por requestAnimationFrame (`orcamentoMs` por quadro).
 * ========================================================================== */
(function (raiz) {
  'use strict';

  // ==========================================================================
  // 1) CONSTANTES (espelham as de wifi-signal.js: mesma escala de intensidade e mesmos 5 níveis)
  // ==========================================================================
  const NIVEIS_PADRAO = Object.freeze([
    Object.freeze({ nome: 'fraco',     limiar: 0.02, cor: [0.94, 0.27, 0.27] }),
    Object.freeze({ nome: 'baixo',     limiar: 0.04, cor: [0.98, 0.45, 0.09] }),
    Object.freeze({ nome: 'médio',     limiar: 0.08, cor: [0.98, 0.80, 0.08] }),
    Object.freeze({ nome: 'bom',       limiar: 0.16, cor: [0.64, 0.90, 0.21] }),
    Object.freeze({ nome: 'excelente', limiar: 0.32, cor: [0.13, 0.77, 0.37] }),
  ]);

  const D_MIN = 0.30;          // m -- distância mínima de referência (I não vai a ∞ colado no AP)
  const D_MAX_ABS = 60;        // m -- teto absoluto do caminho desdobrado (proteção)
  // [25/09/2026] MUDADO -- decisão verbatim do usuário: "Sobre o Access Point (IGNORAR_PERTO = 0.03), deve
  // ignorar a caixa 3D do AP, sim. Está informação deve ficar em algum lugar, também na documentação do AP."
  // A ÚNICA coisa que o raio deve ignorar ao sair do AP é a CAIXA 3D DO PRÓPRIO AP -- e isso já é garantido por
  // identidade, não por distância: AccessPoint._alvos() (wifi-signal.js, usado pelos DOIS motores) nunca
  // inclui as malhas do próprio AP (pick.id === obj.id) na lista de alvos do raycaster. O antigo raio fixo de
  // 3 cm ignorava também superfícies REAIS coladas no AP (ex.: uma viga ou laje a menos de 3 cm dele), o que
  // fazia sumirem reflexões/perdas nessas superfícies ("poucos raios refletidos" com o AP encostado numa viga).
  // Agora vale só uma tolerância numérica de 1 mm (contra a auto-interseção exatamente na origem), igual a
  // EPS_HIT dos raios-filhos. Documentado também em js/ap-docs.js (seção "O que o raio ignora").
  const IGNORAR_PERTO = 1e-3;  // m -- tolerância numérica na origem; a caixa 3D do AP já fica de fora por identidade (ver _alvos)
  const EPS_HIT = 1e-3;        // m -- ignora batidas < 1 mm da origem de um raio-filho (auto-interseção)
  const EPS_OFF = 2e-3;        // m -- afastamento (2 mm) da origem dos filhos, p/ fora da superfície
  const ESPESSURA_MAX = 1.5;   // m -- espessura máxima procurada p/ a face de saída da refração de Snell
  const DESVIO_MIN = 2e-3;     // m -- deslocamento lateral mínimo p/ o ramo refratado contar como diferente do reto
  const ORCAMENTO_MS = 5;      // ms de traçado por quadro (mantém ~60 FPS, igual ao motor atual)
  const MAX_PONTOS_PADRAO = 2000000;
  const NCHAVES = 8;           // nº máx. de objetos já atravessados lembrados por linhagem (1 perda por objeto)

  /** Posições dos campos de um raio na pilha (struct-of-arrays num único Float64Array, sem objetos). */
  const F = Object.freeze({ OX: 0, OY: 1, OZ: 2, DX: 3, DY: 4, DZ: 5, L: 6, P: 7, LRFR: 8, LRFL: 9,
    NREFL: 10, NTRAV: 11, FREFL: 12, MODO: 13, NK: 14, K0: 15, STRIDE: 24 });

  /** Tipo de ponto emitido (`tipos`): 0 = cruzamento de limiar de um nível; 1 = impacto numa superfície. */
  const TIPO = Object.freeze({ CRUZAMENTO: 0, IMPACTO: 1 });
  /** `fimTipo` do callback de segmento: 0 = terminou no limiar; 1 = terminou numa batida; 2 = trecho dentro do objeto. */
  const FIM = Object.freeze({ LIMIAR: 0, BATIDA: 1, INTERIOR: 2 });
  /**
   * Marcação de linhagem (`flags`): bit0 = já refletiu; bits1-2 = MODO da penetração (0 = ainda não atravessou
   * nada / reto e refratado coincidem; 1 = atravessou RETO; 2 = atravessou REFRATADO por Snell).
   */
  const FLAG = Object.freeze({ REFLETIU: 1, MODO_SHIFT: 1 });

  /**
   * Materiais: `n` = índice de refração (√εr, valores típicos), `T` = fração transmitida (= 1 − ATENUACAO do app),
   * `R0` = refletância de POTÊNCIA a incidência normal (valores típicos de literatura p/ 2,4–5 GHz: concreto ~5 dB de
   * perda de reflexão, alvenaria ~6,5 dB, metal ~0,7 dB; ajustáveis por `cfg.materiais`). `T` é reaproveitado de
   * `WifiSignal.atenuacaoDoPick` quando disponível (as barreiras nunca divergem do motor normal).
   */
  const MATERIAIS = Object.freeze({
    concreto:   Object.freeze({ n: 2.3, T: 0.20, R0: 0.30 }),
    alvenaria:  Object.freeze({ n: 2.0, T: 0.20, R0: 0.22 }),
    metal:      Object.freeze({ n: 1.0, T: 0.20, R0: 0.85 }),
    madeira:    Object.freeze({ n: 1.4, T: 0.70, R0: 0.10 }),
    divisoria:  Object.freeze({ n: 1.5, T: 0.70, R0: 0.12 }),
    vidro:      Object.freeze({ n: 2.5, T: 0.85, R0: 0.15 }),
    mobiliario: Object.freeze({ n: 1.5, T: 0.90, R0: 0.06 }),
  });

  // ==========================================================================
  // 2) FUNÇÕES PURAS
  // ==========================================================================
  function intensidadeDeDbm(dbm) { return Number.isFinite(dbm) ? Math.pow(10, dbm / 10) : 0; }
  function dbmDeIntensidade(I) { return I > 0 ? 10 * Math.log10(I) : -Infinity; }

  /** Refletância de Fresnel-Schlick R(θ) = R0 + (1−R0)(1−cosθ)^5, limitada a 1−T (R+T ≤ 1) e a 0,95. */
  function refletancia(R0, cosI, T) {
    const m = 1 - cosI, m2 = m * m;
    return Math.min(R0 + (1 - R0) * m2 * m2 * m, 1 - T, 0.95);
  }

  /** Reflexão especular: V_r = V − 2(V·N)N (N unitária). Escreve em out[o..o+2]. */
  function refletir(dx, dy, dz, nx, ny, nz, out, o) {
    const k = 2 * (dx * nx + dy * ny + dz * nz);
    out[o] = dx - k * nx; out[o + 1] = dy - k * ny; out[o + 2] = dz - k * nz;
  }

  /** Refração vetorial (Snell). N unitária OPOSTA ao raio (V·N<0); eta = n1/n2. `false` = reflexão total interna. */
  function refratar(dx, dy, dz, nx, ny, nz, eta, out, o) {
    const cosI = -(dx * nx + dy * ny + dz * nz);
    const sin2T = eta * eta * (1 - cosI * cosI);
    if (sin2T > 1) return false;
    const c = eta * cosI - Math.sqrt(1 - sin2T);
    const vx = eta * dx + c * nx, vy = eta * dy + c * ny, vz = eta * dz + c * nz;
    const inv = 1 / Math.hypot(vx, vy, vz);
    out[o] = vx * inv; out[o + 1] = vy * inv; out[o + 2] = vz * inv;
    return true;
  }

  /** Material (chave de `MATERIAIS`) de um alvo de raycast; `null` = não é obstáculo. Espelha `atenuacaoDoPick`. */
  function materialDoPick(pick) {
    if (!pick) return null;
    const ref = pick.ref || {};
    switch (pick.type) {
      case 'wall': return ((raiz.WALL_TYPES || {})[ref.tipo] || {}).material || ref.material || 'alvenaria';
      case 'tijolo': return 'alvenaria';
      case 'porta': return ((raiz.DOOR_TYPES || {})[ref.tipo] || {}).material || 'madeira';
      case 'janela': return 'vidro';
      case 'object': {
        const t = ref.tipo;
        if (t === 'pilar' || t === 'viga' || t === 'escada' || t === 'piso') return 'concreto';
        if (t === 'divisoria' || t === 'parede-drywall') return 'divisoria';
        return 'mobiliario';
      }
      default: return null;
    }
  }

  // ==========================================================================
  // 3) CLASSE PRINCIPAL
  // ==========================================================================
  class RadioWaveRayTracer {
    /**
     * @param {object} THREE  namespace do Three.js (no app: `engine.THREE`).
     * @param {object} [cfg]
     * @param {boolean} [cfg.enableReflection=true]  liga os raios REFLETIDOS.
     * @param {boolean} [cfg.enableRefraction=true]  liga a REFRAÇÃO de Snell na penetração (desligado: a penetração segue reta).
     * @param {boolean} [cfg.ambasVariantes=false]   traça, em cada primeira travessia, o ramo reto E o refratado, cada um
     *        marcado (`flags`) -- é o que permite LIGAR/DESLIGAR reflexão/refração DEPOIS da varredura, filtrando.
     * @param {number}  [cfg.maxBounces=6]           máx. de reflexões por linhagem (0-6).
     * @param {number}  [cfg.maxTravessias=4]        teto de objetos atravessados por linhagem (proteção).
     * @param {number}  [cfg.rssiThresholdDbm]       'Limiar (dBm)'. Padrão = limiar do nível 'fraco'.
     * @param {boolean} [cfg.useFresnel=true]        refletância dependente do ângulo.
     * @param {boolean} [cfg.emitirPontos=true]      emite a nuvem de pontos (cruzamentos/impactos). Desligue se só usa `onSegmento`.
     * @param {number}  [cfg.voxelSize=0.05]         funde pontos do mesmo nível/voxel/marcação (mantém o mais forte); 0 = desliga.
     * @param {number}  [cfg.maxPontos=2e6]          teto de pontos emitidos.
     * @param {object}  [cfg.niveis], [cfg.materiais]
     */
    constructor(THREE, cfg) {
      if (!THREE || !THREE.Raycaster) throw new Error('[RadioWaveRayTracer] informe o namespace THREE (engine.THREE).');
      cfg = cfg || {};
      this.THREE = THREE;
      this.enableReflection = cfg.enableReflection !== false;
      this.enableRefraction = cfg.enableRefraction !== false;
      this.ambasVariantes = !!cfg.ambasVariantes;
      this.maxBounces = cfg.maxBounces != null ? Math.max(0, Math.min(6, cfg.maxBounces | 0)) : 6;
      this.maxTravessias = cfg.maxTravessias != null ? Math.max(0, Math.min(NCHAVES, cfg.maxTravessias | 0)) : 4;
      this.useFresnel = cfg.useFresnel !== false;
      this.emitirPontos = cfg.emitirPontos !== false;
      this.voxelSize = cfg.voxelSize != null ? Math.max(0, +cfg.voxelSize) : 0.05;
      this.maxPontos = cfg.maxPontos > 0 ? cfg.maxPontos | 0 : MAX_PONTOS_PADRAO;
      this.orcamentoMs = cfg.orcamentoMs > 0 ? +cfg.orcamentoMs : ORCAMENTO_MS;
      this.niveis = (cfg.niveis || (raiz.WifiSignal && raiz.WifiSignal.NIVEIS) || NIVEIS_PADRAO);
      this.materiais = Object.assign({}, MATERIAIS, cfg.materiais || {});
      this.rssiThresholdDbm = Number.isFinite(cfg.rssiThresholdDbm) ? cfg.rssiThresholdDbm : dbmDeIntensidade(this.niveis[0].limiar);
      this.onProgress = null;   // (0..100) => void
      /** Callback por segmento traçado (sem alocação): (px,py,pz, vx,vy,vz, L0, pAcc, len, fimTipo, flags, pTrans).
       *  `pTrans` = potência do ramo que continua RETO após a batida (0 se não há); só relevante quando fimTipo = BATIDA. */
      this.onSegmento = null;
      this._rc = new THREE.Raycaster(); this._rc2 = new THREE.Raycaster();
      this._tmp = []; this._tmp2 = []; this._lados = [];
      this._nm = new THREE.Matrix3();
      this._ids = new WeakMap(); this._proximoId = 0;
      this._propsCache = new WeakMap();
      this._pilha = null;
      this._vt = new Float64Array(8);      // vetores temporários (reflexão/refração)
      this._bo = new Float64Array(10);     // resultado da refração: [ex,ey,ez, edx,edy,edz, espessura, bdx,bdy,bdz]
      this._token = 0; this._raf = 0; this.rodando = false;
      this._zerarSaida(16384);
    }

    // ------------------------------------------------------------------------------------------------------
    // 3.1) Entradas: raios iniciais vindos do motor existente
    // ------------------------------------------------------------------------------------------------------

    /**
     * Monta a ENTRADA a partir de um `WifiSignal.AccessPoint` (mesma grade esférica, pose, P0 com cardioide/faixa
     * e alvos do motor normal). Devolve também `nT/nP/passo/pose` (a topologia da grade, p/ montar malhas).
     */
    static entradaDoAP(ap, opc) {
      opc = opc || {};
      const W = raiz.WifiSignal, THREE = ap.engine.THREE;
      const pose = ap._pose(); if (!pose) return null;
      const passo = opc.passoGraus || W.DENSIDADES[ap.densidade].passo;
      const nT = Math.max(2, Math.round(180 / passo)), nP = Math.max(4, Math.round(360 / passo));
      const total = 2 + (nT - 1) * nP;
      if (ap.engine._group) ap.engine._group.updateMatrixWorld(true);
      const t = { pose, nT, nP, total }, v = new THREE.Vector3();
      const direcoes = new Float32Array(total * 3), p0 = new Float32Array(total);
      for (let i = 0; i < total; i++) {
        const theta = ap._direcao(t, i, v);
        direcoes[i * 3] = v.x; direcoes[i * 3 + 1] = v.y; direcoes[i * 3 + 2] = v.z;
        p0[i] = W.potenciaBase(ap.powerWatts, ap.signalFrequency, theta);
      }
      return { origem: pose.origem.clone(), direcoes, p0, alvos: ap._alvos(), rssiThresholdDbm: ap.rssiThreshold, nT, nP, total, passo, pose };
    }

    // ------------------------------------------------------------------------------------------------------
    // 3.2) Execução ASSÍNCRONA
    // ------------------------------------------------------------------------------------------------------
    traceAP(ap, opc) { const e = RadioWaveRayTracer.entradaDoAP(ap, opc); return e ? this.run(e) : Promise.resolve(null); }

    /**
     * Traça todos os raios em lotes por quadro (requestAnimationFrame, `orcamentoMs` por quadro) sem congelar o
     * renderizador. Uma execução nova (ou `cancel()`) resolve a anterior com `null`.
     * @param {{origem:{x,y,z}, direcoes:Float32Array, p0:Float32Array, alvos:Array, rssiThresholdDbm?:number}} entrada
     */
    run(entrada) {
      this.cancel();
      const meu = ++this._token;
      const n = entrada.p0.length;
      this._alvos = entrada.alvos || [];
      const dbmLim = Number.isFinite(entrada.rssiThresholdDbm) ? entrada.rssiThresholdDbm : this.rssiThresholdDbm;
      // Limiar efetivo: o mais RESTRITIVO entre o do usuário e o do nível 'fraco' (igual a `distanciasDoRaio`).
      const Iu = intensidadeDeDbm(dbmLim), I0 = this.niveis[0].limiar;
      this._Ithr = Iu > I0 * (1 + 1e-9) ? Iu : I0;   // (ida-e-volta dBm↔linear tem erro ~1e-16)
      this._preparar();
      const est = this._est = { raiosPrimarios: n, segmentos: 0, raycasts: 0, reflexoes: 0, refracoes: 0, travessias: 0,
        podados: 0, pilhaCheia: 0, truncado: false, tempoMs: 0, bounces: this.maxBounces };
      const t0 = performance.now(), agendar = this._agendador();
      this.rodando = true; this._zerarSaida(this.emitirPontos ? Math.min(this.maxPontos, Math.max(16384, n * 8)) : 16);
      let i = 0;
      return new Promise((resolve) => {
        const tick = () => {
          if (meu !== this._token) { resolve(null); return; }
          const limite = performance.now() + this.orcamentoMs;
          const ox = entrada.origem.x, oy = entrada.origem.y, oz = entrada.origem.z;
          while (i < n && !est.truncado) {
            const d = entrada.direcoes, k = i * 3;
            this._tracarArvore(ox, oy, oz, d[k], d[k + 1], d[k + 2], entrada.p0[i], i);
            i++;
            if ((i & 7) === 0 && performance.now() >= limite) break;
          }
          if (typeof this.onProgress === 'function') { try { this.onProgress(Math.floor((i / n) * 100)); } catch (e) { /* UI fechada */ } }
          if (i < n && !est.truncado) { this._raf = agendar(tick); return; }
          est.tempoMs = Math.round(performance.now() - t0);
          this.rodando = false; this._raf = 0;
          resolve(this._finalizar());
        };
        this._raf = agendar(tick);
      });
    }

    cancel() {
      this._token++;
      if (this._raf && typeof cancelAnimationFrame === 'function') { try { cancelAnimationFrame(this._raf); } catch (e) { /* ignore */ } }
      this._raf = 0; this.rodando = false;
    }

    _agendador() {
      if (typeof requestAnimationFrame === 'function') return (cb) => requestAnimationFrame(cb);
      return (cb) => setTimeout(cb, 0);
    }

    _preparar() {
      const cap = (this.maxBounces + 4) * 4;    // DFS: irmãos pendentes ≤ ~3 por nível de reflexão; ×folga
      if (!this._pilha || this._pilha.length < cap * F.STRIDE) this._pilha = new Float64Array(cap * F.STRIDE);
      this._pilhaCap = cap;
      this._lim = new Float64Array(this.niveis.length);
      for (let k = 0; k < this.niveis.length; k++) this._lim[k] = this.niveis[k].limiar;
    }

    // ------------------------------------------------------------------------------------------------------
    // 3.3) Núcleo: árvore de raios de UM raio primário
    // ------------------------------------------------------------------------------------------------------
    _chave(pick) {
      const ref = pick.ref || pick; let id = this._ids.get(ref);
      if (id === undefined) { id = ++this._proximoId; this._ids.set(ref, id); }
      return id;
    }

    _props(pick) {
      const ref = pick.ref || pick; let p = this._propsCache.get(ref);
      if (p !== undefined) return p;
      const nome = materialDoPick(pick);
      if (!nome) p = null;
      else {
        const m = this.materiais[nome] || this.materiais.mobiliario;
        const W = raiz.WifiSignal;
        const atn = W && W.atenuacaoDoPick ? W.atenuacaoDoPick(pick) : null;
        const T = atn != null ? Math.max(0, Math.min(1, 1 - atn)) : m.T;
        const R0 = m.R0 != null ? m.R0 : Math.pow((m.n - 1) / (m.n + 1), 2);
        p = { T, R0, n: m.n, material: nome };
      }
      this._propsCache.set(ref, p);
      return p;
    }

    /**
     * Refração de Snell através de UM objeto. Entra no ponto (hx,hy,hz) com a direção (vx,vy,vz) e normal de entrada
     * (nx,ny,nz) voltada contra o raio; dobra (η = 1/n), procura a face de saída NA MESMA malha (forçando
     * temporariamente `material.side = DoubleSide`, então funciona mesmo com malhas de face única) e refrata de novo ao
     * sair (η = n). Resultado em `this._bo` = [ex,ey,ez, edx,edy,edz, espessura, bdx,bdy,bdz]. `false` = sem saída
     * achada em `ESPESSURA_MAX` (malha aberta) ou reflexão interna: o chamador cai no ramo reto.
     */
    _refratarPelaParede(obj, hx, hy, hz, vx, vy, vz, nx, ny, nz, n) {
      const vt = this._vt, bo = this._bo;
      if (!(n > 1) || !refratar(vx, vy, vz, nx, ny, nz, 1 / n, vt, 0)) return false;
      const bdx = vt[0], bdy = vt[1], bdz = vt[2];
      const THREE = this.THREE, rc = this._rc2, tmp = this._tmp2, lados = this._lados;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      lados.length = 0;
      for (let i = 0; i < mats.length; i++) { lados.push(mats[i].side); mats[i].side = THREE.DoubleSide; }
      rc.ray.origin.set(hx + bdx * EPS_OFF, hy + bdy * EPS_OFF, hz + bdz * EPS_OFF); rc.ray.direction.set(bdx, bdy, bdz);
      rc.near = 0; rc.far = ESPESSURA_MAX; tmp.length = 0;
      try { rc.intersectObject(obj, false, tmp); } finally { for (let i = 0; i < mats.length; i++) mats[i].side = lados[i]; }
      const nm = this._nm;
      for (let h = 0; h < tmp.length; h++) {
        const c = tmp[h]; if (!c.face || c.distance < 1e-4) continue;
        nm.getNormalMatrix(obj.matrixWorld);
        const e = nm.elements, fx = c.face.normal.x, fy = c.face.normal.y, fz = c.face.normal.z;
        let mx = e[0] * fx + e[3] * fy + e[6] * fz, my = e[1] * fx + e[4] * fy + e[7] * fz, mz = e[2] * fx + e[5] * fy + e[8] * fz;
        const il = 1 / (Math.hypot(mx, my, mz) || 1); mx *= il; my *= il; mz *= il;
        if (bdx * mx + bdy * my + bdz * mz <= 0) continue;                // ainda é face de ENTRADA -- procura a de saída
        // saída: normal contra o raio = −n_fora; η = n / 1
        if (!refratar(bdx, bdy, bdz, -mx, -my, -mz, n, vt, 0)) return false;
        const d = c.distance;
        bo[0] = hx + bdx * (EPS_OFF + d); bo[1] = hy + bdy * (EPS_OFF + d); bo[2] = hz + bdz * (EPS_OFF + d);
        bo[3] = vt[0]; bo[4] = vt[1]; bo[5] = vt[2]; bo[6] = EPS_OFF + d; bo[7] = bdx; bo[8] = bdy; bo[9] = bdz;
        return true;
      }
      return false;
    }

    /**
     * Traça a ÁRVORE completa de um raio primário. Por segmento popado da pilha:
     *  1. Se I já < limiar ⇒ descarta. Alcance = √(pAcc/Ithr) − L.
     *  2. Raycast (near=0, far=alcance): 1º obstáculo válido (ainda não atravessado por esta linhagem) = evento.
     *  3. Cruzamentos de limiar dos níveis (analítico) -> pontos; callback `onSegmento`.
     *  4. Na batida: filhos = penetração RETA e/ou REFRATADA (Snell) + REFLEXÃO (V − 2(V·N)N), somando as perdas.
     */
    _tracarArvore(ox, oy, oz, dx, dy, dz, p0) {
      const S = this._pilha, ST = F.STRIDE, cap = this._pilhaCap, rc = this._rc, tmp = this._tmp, nm = this._nm;
      const lim = this._lim, nNiv = lim.length, Ithr = this._Ithr, alvos = this._alvos, vt = this._vt, bo = this._bo;
      const maxB = this.maxBounces, maxTrav = this.maxTravessias, doRefl = this.enableReflection, doRefr = this.enableRefraction;
      const ambas = this.ambasVariantes, fresnel = this.useFresnel, est = this._est, cb = this.onSegmento, pts = this.emitirPontos;
      const inv0 = 1 / (Math.hypot(dx, dy, dz) || 1);
      if (!(p0 > 0)) return;

      let sp = 0, b = 0;
      S[F.OX] = ox; S[F.OY] = oy; S[F.OZ] = oz;
      S[F.DX] = dx * inv0; S[F.DY] = dy * inv0; S[F.DZ] = dz * inv0;
      S[F.L] = 0; S[F.P] = p0; S[F.LRFR] = 0; S[F.LRFL] = 0; S[F.NREFL] = 0; S[F.NTRAV] = 0; S[F.FREFL] = 0; S[F.MODO] = 0; S[F.NK] = 0;
      sp = 1;

      while (sp > 0) {
        b = (--sp) * ST;
        const px = S[b + F.OX], py = S[b + F.OY], pz = S[b + F.OZ];
        const vx = S[b + F.DX], vy = S[b + F.DY], vz = S[b + F.DZ];
        const L = S[b + F.L], pAcc = S[b + F.P], lRfr = S[b + F.LRFR], lRfl = S[b + F.LRFL];
        const nRefl = S[b + F.NREFL] | 0, nTrav = S[b + F.NTRAV] | 0, fRefl = S[b + F.FREFL] | 0, modo = S[b + F.MODO] | 0, nk = S[b + F.NK] | 0;
        const flags = fRefl | (modo << FLAG.MODO_SHIFT);

        const Lc = L > D_MIN ? L : D_MIN;
        if (pAcc / (Lc * Lc) < Ithr) { est.podados++; continue; }
        const Lstop = Math.min(Math.sqrt(pAcc / Ithr), D_MAX_ABS);
        const alcance = Lstop - L;
        if (alcance <= 1e-4) continue;

        rc.ray.origin.set(px, py, pz); rc.ray.direction.set(vx, vy, vz);
        rc.near = 0; rc.far = alcance; tmp.length = 0;
        rc.intersectObjects(alvos, false, tmp);
        est.raycasts++; est.segmentos++;
        let hit = null, props = null, chave = 0;
        const minD = L === 0 ? IGNORAR_PERTO : EPS_HIT;
        for (let h = 0; h < tmp.length; h++) {
          const c = tmp[h];
          if (c.distance < minD) continue;
          const pick = c.object.userData && c.object.userData.pick; if (!pick) continue;
          const key = this._chave(pick);
          let visto = false; for (let q = 0; q < nk; q++) if (S[b + F.K0 + q] === key) { visto = true; break; }
          if (visto) continue;                          // 1 perda por objeto atravessado (como o motor normal)
          const pr = this._props(pick); if (!pr) continue;
          hit = c; props = pr; chave = key; break;
        }
        const fim = hit ? hit.distance : alcance;

        // cruzamentos de limiar (analítico): I = pAcc/L_k² = limiar_k ⇒ L_k = √(pAcc/limiar_k)
        if (pts) {
          for (let k = 0; k < nNiv; k++) {
            const Lk = Math.sqrt(pAcc / lim[k]);
            if (Lk <= L || Lk < D_MIN) continue;
            const s = Lk - L; if (s > fim) continue;
            this._emitir(px + vx * s, py + vy * s, pz + vz * s, dbmDeIntensidade(lim[k]), k, TIPO.CRUZAMENTO, flags,
              20 * Math.log10(Lk), lRfr, lRfl);
            if (est.truncado) return;
          }
        }
        if (!hit) { if (cb) cb(px, py, pz, vx, vy, vz, L, pAcc, alcance, FIM.LIMIAR, flags, 0); continue; }

        // ---- batida ----------------------------------------------------------------------------------
        const Lh = L + hit.distance, Lhc = Lh > D_MIN ? Lh : D_MIN;
        const hx = px + vx * hit.distance, hy = py + vy * hit.distance, hz = pz + vz * hit.distance;
        const Iinc = pAcc / (Lhc * Lhc), distDb = 20 * Math.log10(Lhc);
        let nx, ny, nz;
        if (hit.face) {
          nm.getNormalMatrix(hit.object.matrixWorld);
          const e = nm.elements, fx = hit.face.normal.x, fy = hit.face.normal.y, fz = hit.face.normal.z;
          nx = e[0] * fx + e[3] * fy + e[6] * fz; ny = e[1] * fx + e[4] * fy + e[7] * fz; nz = e[2] * fx + e[5] * fy + e[8] * fz;
          const il = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= il; ny *= il; nz *= il;
        } else { nx = -vx; ny = -vy; nz = -vz; }
        let dn = vx * nx + vy * ny + vz * nz;
        const faceTraseira = dn > 0;
        if (faceTraseira) { nx = -nx; ny = -ny; nz = -nz; dn = -dn; }
        const cosI = Math.max(1e-4, -dn);
        const T = props.T, podeAtravessar = T > 0 && nTrav < maxTrav && nk < NCHAVES;
        const pT = pAcc * T;

        if (cb) cb(px, py, pz, vx, vy, vz, L, pAcc, hit.distance, FIM.BATIDA, flags, podeAtravessar ? pT : 0);
        if (pts) {
          this._emitir(hx, hy, hz, dbmDeIntensidade(Iinc), this._classificar(Iinc), TIPO.IMPACTO, flags, distDb, lRfr, lRfl);
          if (est.truncado) return;
        }

        // REFLEXÃO: pAcc' = pAcc·R ; V_r = V − 2(V·N)N ; perda(dB) = −10·log10(R). Nova linhagem (modo 0, sem chaves).
        if (doRefl && nRefl < maxB) {
          const R = fresnel ? refletancia(props.R0, cosI, T) : Math.min(props.R0, 1 - T, 0.95);
          const pR = pAcc * R;
          if (R > 0 && pR / (Lhc * Lhc) >= Ithr) {
            if (sp < cap) {
              refletir(vx, vy, vz, nx, ny, nz, vt, 0);
              const c2 = sp * ST;
              S[c2 + F.OX] = hx + nx * EPS_OFF; S[c2 + F.OY] = hy + ny * EPS_OFF; S[c2 + F.OZ] = hz + nz * EPS_OFF;
              S[c2 + F.DX] = vt[0]; S[c2 + F.DY] = vt[1]; S[c2 + F.DZ] = vt[2];
              S[c2 + F.L] = Lh; S[c2 + F.P] = pR; S[c2 + F.LRFR] = lRfr; S[c2 + F.LRFL] = lRfl - 10 * Math.log10(R);
              S[c2 + F.NREFL] = nRefl + 1; S[c2 + F.NTRAV] = nTrav; S[c2 + F.FREFL] = 1; S[c2 + F.MODO] = 0; S[c2 + F.NK] = 0;
              sp++; est.reflexoes++;
            } else est.pilhaCheia++;
          } else est.podados++;
        }

        // PENETRAÇÃO (baseline do motor normal) -- reta e/ou refratada (Snell)
        if (podeAtravessar) {
          const perdaDb = -10 * Math.log10(T);
          // ramo refratado: calculado se a linhagem ainda não decidiu (modo 0) ou já é refratada (2), e há refração pedida
          let temBent = false, difere = false;
          if ((modo === 0 || modo === 2) && (ambas || doRefr) && !faceTraseira) {
            temBent = this._refratarPelaParede(hit.object, hx, hy, hz, vx, vy, vz, nx, ny, nz, props.n);
            if (temBent) {
              // desvio lateral do ponto de saída em relação à reta original + diferença de direção
              const ex = bo[0] - hx, ey = bo[1] - hy, ez = bo[2] - hz, pr = ex * vx + ey * vy + ez * vz;
              const lat = Math.hypot(ex - pr * vx, ey - pr * vy, ez - pr * vz);
              const ddir = Math.abs(bo[3] - vx) + Math.abs(bo[4] - vy) + Math.abs(bo[5] - vz);
              difere = lat > DESVIO_MIN || ddir > 1e-3;
            }
          }
          const bentOk = temBent && difere;                      // existe um ramo refratado DIFERENTE do reto
          // ---- ramo RETO ----
          //  modo 1: segue reto; modo 2: só cai aqui se o refratado não existe/coincide (mantém modo 2);
          //  modo 0: se há refratado diferente, traça o reto (modo 1) só quando pedido (ambas ou refração desligada).
          let traceReto, modoReto;
          if (modo === 1) { traceReto = true; modoReto = 1; }
          else if (modo === 2) { traceReto = !bentOk; modoReto = 2; }
          else if (bentOk) { traceReto = ambas || !doRefr; modoReto = 1; }
          else { traceReto = true; modoReto = 0; }
          if (traceReto && pT / (Lhc * Lhc) >= Ithr) {
            if (sp < cap) {
              const c2 = sp * ST;
              S[c2 + F.OX] = hx; S[c2 + F.OY] = hy; S[c2 + F.OZ] = hz;   // sem afastamento: o objeto já está na lista de atravessados
              S[c2 + F.DX] = vx; S[c2 + F.DY] = vy; S[c2 + F.DZ] = vz;
              S[c2 + F.L] = Lh; S[c2 + F.P] = pT; S[c2 + F.LRFR] = lRfr + perdaDb; S[c2 + F.LRFL] = lRfl;
              S[c2 + F.NREFL] = nRefl; S[c2 + F.NTRAV] = nTrav + 1; S[c2 + F.FREFL] = fRefl; S[c2 + F.MODO] = modoReto;
              this._chaves(S, b, c2, nk, chave); sp++; est.travessias++;
            } else est.pilhaCheia++;
          }
          // ---- ramo REFRATADO (modo 2) -- só quando difere do reto ----
          if (bentOk && (ambas || doRefr)) {
            const espes = bo[6], Lb = Lh + espes, Lbc = Lb > D_MIN ? Lb : D_MIN;
            // trecho DENTRO do objeto (p/ os raios mostrarem a dobra): sai do ponto de batida na direção dobrada. Emitido mesmo
            // que o sinal morra dentro do objeto (o consumidor corta no limiar), senão o alcance "encolheria" atrás da parede.
            if (cb && pT / (Lhc * Lhc) >= Ithr) cb(hx, hy, hz, bo[7], bo[8], bo[9], Lh, pT, espes, FIM.INTERIOR, fRefl | (2 << FLAG.MODO_SHIFT), 0);
            if (pT / (Lbc * Lbc) >= Ithr) {
              if (sp < cap) {
                const c2 = sp * ST;
                S[c2 + F.OX] = bo[0]; S[c2 + F.OY] = bo[1]; S[c2 + F.OZ] = bo[2];
                S[c2 + F.DX] = bo[3]; S[c2 + F.DY] = bo[4]; S[c2 + F.DZ] = bo[5];
                S[c2 + F.L] = Lb; S[c2 + F.P] = pT; S[c2 + F.LRFR] = lRfr + perdaDb; S[c2 + F.LRFL] = lRfl;
                S[c2 + F.NREFL] = nRefl; S[c2 + F.NTRAV] = nTrav + 1; S[c2 + F.FREFL] = fRefl; S[c2 + F.MODO] = 2;
                this._chaves(S, b, c2, nk, chave); sp++; est.refracoes++;
              } else est.pilhaCheia++;
            } else est.podados++;
          }
        }
      }
    }

    /** Copia a lista de objetos já atravessados do raio `b` p/ o filho `c2` e acrescenta `chave` (sem alocar). */
    _chaves(S, b, c2, nk, chave) {
      for (let q = 0; q < nk; q++) S[c2 + F.K0 + q] = S[b + F.K0 + q];
      S[c2 + F.K0 + nk] = chave; S[c2 + F.NK] = nk + 1;
    }

    /** Nível (0..n-1) da intensidade `I` (o MAIOR limiar atingido), ou -1 se abaixo do 1º. */
    _classificar(I) {
      const lim = this._lim;
      for (let k = lim.length - 1; k >= 0; k--) if (I >= lim[k]) return k;
      return -1;
    }

    // ------------------------------------------------------------------------------------------------------
    // 3.4) Buffers de saída (crescem por dobra; ao final são consolidados/ordenados por nível)
    // ------------------------------------------------------------------------------------------------------
    _zerarSaida(cap) {
      this._cap = cap; this._n = 0;
      this._pos = new Float32Array(cap * 3); this._dbm = new Float32Array(cap);
      this._niv = new Int8Array(cap); this._tip = new Uint8Array(cap); this._flg = new Uint8Array(cap); this._per = new Float32Array(cap * 3);
    }
    _crescer() {
      const novo = Math.min(this.maxPontos, this._cap * 2);
      if (novo <= this._cap) { this._est.truncado = true; return false; }
      const cp = (A, n) => { const B = new A.constructor(n); B.set(A); return B; };
      this._pos = cp(this._pos, novo * 3); this._dbm = cp(this._dbm, novo); this._niv = cp(this._niv, novo);
      this._tip = cp(this._tip, novo); this._flg = cp(this._flg, novo); this._per = cp(this._per, novo * 3); this._cap = novo;
      return true;
    }
    _emitir(x, y, z, dbm, nivel, tipo, flags, dDb, rfrDb, rflDb) {
      if (nivel < 0) return;
      if (this._n >= this._cap && !this._crescer()) return;
      const i = this._n++, j = i * 3;
      this._pos[j] = x; this._pos[j + 1] = y; this._pos[j + 2] = z;
      this._dbm[i] = dbm; this._niv[i] = nivel; this._tip[i] = tipo; this._flg[i] = flags;
      this._per[j] = dDb; this._per[j + 1] = rfrDb; this._per[j + 2] = rflDb;
    }

    /**
     * Consolidação (voxel, mantém o de MAIOR dBm por nível/marcação) + ordenação por nível (counting sort).
     * Devolve: `{count, positions, dbm, niveis, tipos, flags, perdasDb, cores, offsets, nomes, stats, config}`;
     * o nível k ocupa `[offsets[k], offsets[k+1])`; `perdasDb` = [distância, refração, reflexão] em dB por ponto.
     */
    _finalizar() {
      const nNiv = this.niveis.length, N = this._n;
      let keep = null, m = N;
      if (this.voxelSize > 0 && N > 0) {
        const inv = 1 / this.voxelSize, melhor = new Map(); keep = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
          const j = i * 3;
          const ix = Math.floor(this._pos[j] * inv) + 4096, iy = Math.floor(this._pos[j + 1] * inv) + 4096, iz = Math.floor(this._pos[j + 2] * inv) + 4096;
          const key = ((((ix * 8192) + iy) * 8192 + iz) * 8 + (this._flg[i] & 7)) * 8 + this._niv[i];
          const prev = melhor.get(key);
          if (prev === undefined) { melhor.set(key, i); keep[i] = 1; }
          else if (this._dbm[i] > this._dbm[prev]) { keep[prev] = 0; keep[i] = 1; melhor.set(key, i); }
        }
        m = 0; for (let i = 0; i < N; i++) m += keep[i];
      }
      const cont = new Uint32Array(nNiv + 1);
      for (let i = 0; i < N; i++) if (!keep || keep[i]) cont[this._niv[i] + 1]++;
      for (let k = 0; k < nNiv; k++) cont[k + 1] += cont[k];
      const offsets = cont.slice(), cur = cont.slice(0, nNiv);
      const positions = new Float32Array(m * 3), dbm = new Float32Array(m), niveis = new Int8Array(m);
      const tipos = new Uint8Array(m), flags = new Uint8Array(m), perdasDb = new Float32Array(m * 3), cores = new Float32Array(m * 3);
      for (let i = 0; i < N; i++) {
        if (keep && !keep[i]) continue;
        const k = this._niv[i], o = cur[k]++, j = i * 3, q = o * 3, c = this.niveis[k].cor;
        positions[q] = this._pos[j]; positions[q + 1] = this._pos[j + 1]; positions[q + 2] = this._pos[j + 2];
        perdasDb[q] = this._per[j]; perdasDb[q + 1] = this._per[j + 1]; perdasDb[q + 2] = this._per[j + 2];
        dbm[o] = this._dbm[i]; niveis[o] = k; tipos[o] = this._tip[i]; flags[o] = this._flg[i];
        cores[q] = c[0]; cores[q + 1] = c[1]; cores[q + 2] = c[2];
      }
      this._est.pontosBrutos = N; this._est.pontos = m;
      this._zerarSaida(16);
      return {
        count: m, positions, dbm, niveis, tipos, flags, perdasDb, cores, offsets,
        nomes: this.niveis.map((x) => x.nome), stats: this._est,
        config: { enableReflection: this.enableReflection, enableRefraction: this.enableRefraction, ambasVariantes: this.ambasVariantes,
          maxBounces: this.maxBounces, rssiThresholdDbm: dbmDeIntensidade(this._Ithr), voxelSize: this.voxelSize },
      };
    }

    /** 1 `THREE.Points` por nível dentro de um `THREE.Group`, com `subarray` dos buffers (zero cópia). */
    static criarPontosThree(THREE, res, opc) {
      opc = opc || {};
      const g = new THREE.Group(); g.name = 'radio-wave-raytracer';
      for (let k = 0; k < res.offsets.length - 1; k++) {
        const a = res.offsets[k], b = res.offsets[k + 1];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(res.positions.subarray(a * 3, b * 3), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(res.cores.subarray(a * 3, b * 3), 3));
        const mat = new THREE.PointsMaterial({ size: opc.tamanho || 0.06, vertexColors: true, transparent: true, opacity: opc.opacidade || 0.85, depthWrite: false });
        const pts = new THREE.Points(geo, mat); pts.name = 'nivel-' + res.nomes[k]; pts.frustumCulled = false;
        g.add(pts);
      }
      return g;
    }
  }

  RadioWaveRayTracer.MATERIAIS = MATERIAIS;
  RadioWaveRayTracer.TIPO = TIPO;
  RadioWaveRayTracer.FIM = FIM;
  RadioWaveRayTracer.FLAG = FLAG;
  RadioWaveRayTracer.refletir = refletir;
  RadioWaveRayTracer.refratar = refratar;
  RadioWaveRayTracer.refletancia = refletancia;
  RadioWaveRayTracer.materialDoPick = materialDoPick;
  RadioWaveRayTracer.intensidadeDeDbm = intensidadeDeDbm;
  RadioWaveRayTracer.dbmDeIntensidade = dbmDeIntensidade;

  raiz.RadioWaveRayTracer = RadioWaveRayTracer;
  if (typeof module !== 'undefined' && module.exports) module.exports = RadioWaveRayTracer;
})(typeof window !== 'undefined' ? window : globalThis);
