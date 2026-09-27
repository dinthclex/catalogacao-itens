/* ============================================================================
 * wifi-signal-avancado.js  --  VARREDURA AVANÇADA (reflexão + refração) do Access Point
 * [24/09/2026 UTC] NOVO -- pedido verbatim: "As duas varreduras devem coexistir, podendo ser feitas as duas ao
 * mesmo tempo. As nuvens de pontos da varredura normal e da varredura avançada devem ser diferentes. [...] Os
 * controles que tem na varredura normal devem ter também na varredura avançada ('superfície', 'pontos',
 * 'raios' cada um com os seus 5 níveis)."
 *
 * COMO FUNCIONA
 * -------------
 *  `AccessPointAvancado` ESTENDE `WifiSignal.AccessPoint` (js/wifi-signal.js) e reaproveita TODO o pipeline de
 *  desenho dele (malha multi-material por nível, pontos/raios por nível, fade-in, barra de progresso, modos
 *  'alcance'/'colisão', 'por nível'/'completo', wireframe) -- só o que muda é:
 *   1) ESTADO PRÓPRIO: a configuração de exibição vive em `obj.rede.apAvancado` (independente da varredura normal, então
 *      as duas coexistem e cada uma liga/desliga suas malhas/pontos/raios à parte). Faixa, potência, densidade,
 *      limiar e modo de malha são COMPARTILHADOS com a normal (`obj.rede.ap`) -- as duas medem a MESMA antena.
 *   2) MOTOR: em vez de 1 raio reto por direção, usa `RadioWaveRayTracer` (js/radio-wave-raytracer.js), que traça a
 *      árvore de raios com penetração, REFRAÇÃO (Snell) e REFLEXÃO, com as 3 perdas cumulativas (distância,
 *      refração, reflexão) -- assíncrono, em lotes por quadro, cancelável.
 *
 * COMO O MESMO RESULTADO ALIMENTA MALHA, PONTOS E RAIOS -- e permite ligar/desligar reflexão/refração DEPOIS
 * ------------------------------------------------------------------------------------------------------------
 *  A varredura traça SEMPRE a árvore completa (reta + refratada + refletida), cada segmento marcado com a sua
 *  linhagem (`flags`: já refletiu? atravessou reto ou refratado?). Os 4 estados dos interruptores (reflexão ×
 *  refração) filtram esses segmentos SEM refazer a varredura:
 *     visível(seg) = (!refletiu || REFLEXÃO ligada) && (modo==0 || (modo==2) == REFRAÇÃO ligada)
 *  Com os dois DESLIGADOS só sobra a penetração reta = exatamente o motor normal (malha idêntica: mesmas
 *  distâncias; pontos/raios usam a MESMA rotina do motor normal, ver `_construirPontosRaios`).
 *
 *  MALHA (superfície): mantém a topologia radial (1 vértice por raio da grade esférica) do motor normal --
 *  assim o pipeline de malha/otimização/wireframe é o mesmo --, mas a distância de cada vértice em cada nível é o
 *  ALCANCE RADIAL MÁXIMO de tudo o que o traçador achou naquela direção (varrendo cada segmento visível em passos
 *  menores que a célula angular): a refração desloca as bordas atrás dos objetos e a reflexão ESTENDE o alcance
 *  em direções que o raio direto não alcançava (sombras). Um vetor de distâncias por estado (4).
 *  PONTOS/RAIOS: desenhados a partir dos segmentos reais (com as dobras de reflexão/refração visíveis), por nível.
 * ========================================================================== */
(function (raiz) {
  'use strict';
  const WS = raiz.WifiSignal, RT = raiz.RadioWaveRayTracer;
  if (!WS || !WS.AccessPoint) { console.error('[wifi-signal-avancado] wifi-signal.js precisa ser carregado antes.'); return; }
  if (!RT) { console.error('[wifi-signal-avancado] radio-wave-raytracer.js precisa ser carregado antes.'); return; }

  const AccessPoint = WS.AccessPoint, NIVEIS = WS.NIVEIS;
  const D_MIN = 0.30;            // m (mesmo do motor normal)
  const N_SEG = 12;              // floats por segmento guardado

  /** Chaves de config que ficam COMPARTILHADAS com a varredura normal (mesma antena física). */
  const COMPARTILHADAS = new Set(['frequencia', 'potenciaW', 'densidade', 'meshMode', 'rssiThreshold', 'miniJanela', 'numDispositivos']);

  /** Estados (reflexão, refração) -> índice 0..3 (bit0 = reflexão, bit1 = refração). */
  const combo = (refl, refr) => (refl ? 1 : 0) | (refr ? 2 : 0);
  /** Máscara (bits = estados) em que um segmento com `refletiu` e `modo` é VISÍVEL. */
  const MASCARA = (() => {
    const m = new Uint8Array(2 * 3);
    for (let refletiu = 0; refletiu < 2; refletiu++) for (let modo = 0; modo < 3; modo++) {
      let bits = 0;
      for (let c = 0; c < 4; c++) {
        const R = !!(c & 1), F = !!(c & 2);
        if ((refletiu === 0 || R) && (modo === 0 || (modo === 2) === F)) bits |= (1 << c);
      }
      m[refletiu * 3 + modo] = bits;
    }
    return m;
  })();

  class AccessPointAvancado extends AccessPoint {
    constructor(obj, engine) {
      super(obj, engine);
      this._progRotulo = 'Avançada…'; this._progDy = 0.66;   // barra flutuante logo acima da barra da varredura normal
      this._tracador = null; this._variantes = null; this._seg = null;
    }

    // ---- estado persistente: `obj.rede.apAvancado` (exibição) + `obj.rede.ap` (compartilhado) --------------------
    /** Config da exibição avançada (defaults). NÃO inclui o que é compartilhado com a varredura normal. */
    _cfgAv() {
      const RE = raiz.RedeEquip; if (RE) RE.garantirRede(this.obj);
      const r = this.obj.rede = this.obj.rede || {};
      const a = (r.apAvancado && typeof r.apAvancado === 'object') ? r.apAvancado : (r.apAvancado = {});
      if (typeof a.mostrar2D !== 'boolean') a.mostrar2D = true;
      if (!Array.isArray(a.mostrarPontosNiveis) || a.mostrarPontosNiveis.length !== 5) a.mostrarPontosNiveis = [false, false, false, false, false];
      if (!Array.isArray(a.mostrarRaiosNiveis) || a.mostrarRaiosNiveis.length !== 5) a.mostrarRaiosNiveis = [false, false, false, false, false];
      if (!Array.isArray(a.mostrarMalhaNiveis) || a.mostrarMalhaNiveis.length !== 5) a.mostrarMalhaNiveis = [true, true, true, true, true];
      if (typeof a.malhaWireframe !== 'boolean') a.malhaWireframe = false;
      if (a.pontosRaycasterModo !== 'alcance' && a.pontosRaycasterModo !== 'colisao') a.pontosRaycasterModo = 'alcance';
      if (a.raiosExtensao !== 'porNivel' && a.raiosExtensao !== 'completo') a.raiosExtensao = 'porNivel';
      // reflexão/refração: por padrão LIGADAS (pedido verbatim: "O modo de refração padrão deve ser que a refração ocorra.")
      if (typeof a.reflexao !== 'boolean') a.reflexao = true;
      if (typeof a.refracao !== 'boolean') a.refracao = true;
      if (!(a.maxBounces >= 0) || a.maxBounces > 6) a.maxBounces = 6;
      if (!(a.maxTravessias >= 0) || a.maxTravessias > 8) a.maxTravessias = 4;
      // [24/09/2026] NOVO -- padrão lido de `MapConfig.apManterVarreduraAvancadaAnteriorPadrao` (seção
      // "Configurações 3D" → "📡 Access Point"), mesmo esquema da varredura normal (ver wifi-signal.js).
      if (typeof a.manterAnterior !== 'boolean') {
        const mc = raiz.MapConfig && raiz.MapConfig._cache;
        a.manterAnterior = !!(mc && mc.apManterVarreduraAvancadaAnteriorPadrao);
      }
      return a;
    }
    /** `_cfg()` das rotinas herdadas: chaves compartilhadas vão pra `obj.rede.ap`, o resto pra `obj.rede.apAvancado`. */
    _cfg() {
      const base = AccessPoint.prototype._cfg.call(this), av = this._cfgAv();
      if (!this._cfgProxy || this._cfgProxy._base !== base || this._cfgProxy._av !== av) {
        const p = new Proxy({}, {
          get: (_, k) => (k === '_base' ? base : k === '_av' ? av : (COMPARTILHADAS.has(k) ? base[k] : av[k])),
          set: (_, k, v) => { (COMPARTILHADAS.has(k) ? base : av)[k] = v; return true; },
          has: (_, k) => (COMPARTILHADAS.has(k) ? k in base : k in av),
        });
        this._cfgProxy = p;
      }
      return this._cfgProxy;
    }

    // ---- interruptores de fenômeno (podem mudar DEPOIS da varredura: só refiltram o resultado guardado) ---------
    get reflexao() { return !!this._cfg().reflexao; }
    set reflexao(v) { this._cfg().reflexao = !!v; this._refiltrar(); }
    get refracao() { return !!this._cfg().refracao; }
    set refracao(v) { this._cfg().refracao = !!v; this._refiltrar(); }
    /** Máx. de reflexões por raio (0-6 -- ver `RadioWaveRayTracer.maxBounces`). Vale a partir da PRÓXIMA varredura. */
    get maxBounces() { return this._cfg().maxBounces; }
    set maxBounces(v) { v = Math.round(Number(v)); if (v >= 0 && v <= 6) this._cfg().maxBounces = v; }
    /** Máx. de travessias/refrações por raio (0-8 -- ver `RadioWaveRayTracer.maxTravessias`). Vale a partir da PRÓXIMA varredura.
     *  [24/09/2026] NOVO -- pedido verbatim: "Coloque como limites, 6 reflexões e 4 refrações." */
    get maxTravessias() { return this._cfg().maxTravessias; }
    set maxTravessias(v) { v = Math.round(Number(v)); if (v >= 0 && v <= 8) this._cfg().maxTravessias = v; }
    get estadoFenomenos() { return combo(this.reflexao, this.refracao); }

    /** Reconstrói malha/pontos/raios a partir do resultado JÁ guardado, no estado atual dos interruptores.
     *  [24/09/2026] MUDADO -- pedido verbatim: "ao ativar os botões de 'superfície da malha' e, depois,
     *  ativar e desativar as opções de 'reflexão' e de 'refração' a malha pisca (desaparece e reaparece).
     *  Faça com que a troca seja imediata sem essa transição." Duas causas, as duas corrigidas: 1) a ordem
     *  era REMOVER a malha/pontos/raios antigos e só DEPOIS construir os novos (uma malha "some" antes da
     *  próxima aparecer) -- invertido: constrói os NOVOS primeiro, descarta os ANTIGOS só depois, nunca
     *  existe um instante sem nada na tela; 2) toda malha nova sempre entrava com fade-in (`_fadeIn()`,
     *  opacidade 0→1 animada) -- ótimo ao TERMINAR uma varredura, mas parece um "piscar" ao só REFILTRAR um
     *  resultado que já estava visível -- `_construirMalha(t, true)` pula essa animação (ver doc dela,
     *  wifi-signal.js). */
    _refiltrar() {
      if (!this._variantes) return;
      const t = this._variantes[this.estadoFenomenos];
      if (!t) return;
      this._ultimaTarefa = t;
      if (this.malha || this.cloudRaycastPorNivel.some(Boolean)) {
        const malhaAntiga = this.malha;
        const pontosAntigos = this.cloudRaycastPorNivel.slice(), raiosAntigos = this.raiosRaycastPorNivel.slice();
        this._construirPontosRaios(t);
        this._construirMalha(t, true);
        this._disposeMalhaObj(malhaAntiga);
        for (let k = 0; k < pontosAntigos.length; k++) this._disposeParPontosRaios(pontosAntigos[k], raiosAntigos[k]);
      }
    }

    // ---- ciclo de vida da varredura -------------------------------------------------------------------------------
    atualizarCorte() { /* a "Vista em corte" só existe na varredura normal */ }

    cancelScan() {
      if (this._tracador) { try { this._tracador.cancel(); } catch (e) { /* ignore */ } }
      super.cancelScan();
    }

    /**
     * Inicia a varredura avançada (assíncrona, em lotes por quadro; cancelável com `cancelScan()`).
     * @param {{densidade?:string, meshMode?:string}} [opc]
     */
    startScan(opc) {
      opc = opc || {};
      if (!this.emiteSinal) {
        this.clear();
        return { ok: false, erro: !this.isOn ? 'O AP está desligado.' : 'Ligue um cabo na porta RJ-45 do AP para ele emitir sinal.' };
      }
      if (opc.densidade) this.densidade = opc.densidade;
      if (opc.meshMode) this.meshMode = opc.meshMode;
      const entrada = RT.entradaDoAP(this);
      if (!entrada) return { ok: false, erro: 'AP ainda não está na cena 3D.' };
      this.cancelScan();
      if (!this.manterAnterior) this.clear();
      const THREE = this.engine.THREE, nNiv = NIVEIS.length, total = entrada.total;

      // Resultado por ESTADO (4): distâncias radiais por nível/raio + colisões por raio (p/ o modo 'colisão real').
      const dist = [], barr = [];
      for (let c = 0; c < 4; c++) {
        const d = NIVEIS.map(() => new Float32Array(total).fill(D_MIN));   // ≥ D_MIN, como `distanciasDoRaio`
        dist.push(d); barr.push(new Array(total).fill(null));
      }
      const S = this._seg = { n: 0, cap: 4096, dados: new Float32Array(4096 * N_SEG) };
      const q = entrada.pose.q, o = entrada.pose.origem;
      // rotação inversa do AP (mundo -> local) p/ achar a CÉLULA da grade esférica de um ponto
      const inv = q.clone().invert(), v = new THREE.Vector3();
      const dTh = Math.PI / entrada.nT, dPh = (2 * Math.PI) / entrada.nP, nT = entrada.nT, nP = entrada.nP;
      const passoRad = entrada.passo * Math.PI / 180;
      const lim = NIVEIS.map((n) => n.limiar);
      const classificar = (I) => { for (let k = nNiv - 1; k >= 0; k--) if (I >= lim[k]) return k; return -1; };
      // índice da célula (mesma numeração de `_direcao`): 0 = polo +Z, 1 = polo -Z, 2+(ti-1)*nP+pj = anéis
      const celula = (x, y, z) => {
        v.set(x - o.x, y - o.y, z - o.z).applyQuaternion(inv);
        const r = v.length(); if (r < 1e-9) return -1;
        const th = Math.acos(Math.max(-1, Math.min(1, v.z / r)));
        let ti = Math.round(th / dTh); if (ti <= 0) return 0; if (ti >= nT) return 1;
        let ph = Math.atan2(v.y, v.x); if (ph < 0) ph += 2 * Math.PI;
        let pj = Math.round(ph / dPh); if (pj >= nP) pj = 0;
        return 2 + (ti - 1) * nP + pj;
      };
      // atualiza o alcance radial dos níveis 0..kk na célula `cel`, nos estados de `mask`
      const marcar = (cel, r, kk, mask) => {
        if (cel < 0 || kk < 0) return;
        for (let c = 0; c < 4; c++) { if (!(mask & (1 << c))) continue; const d = dist[c]; for (let k = 0; k <= kk; k++) if (r > d[k][cel]) d[k][cel] = r; }
      };

      const tr = this._tracador = new RT(THREE, {
        enableReflection: true, enableRefraction: true, ambasVariantes: true,   // traça TUDO; os interruptores só filtram depois
        maxBounces: this.maxBounces, maxTravessias: this.maxTravessias, emitirPontos: false, rssiThresholdDbm: this.rssiThreshold,
      });
      tr.onSegmento = (px, py, pz, vx, vy, vz, L0, pAcc, len, fimTipo, flags, pTrans) => {
        // guarda o segmento (p/ os raios/pontos por nível)
        if (S.n >= S.cap) { const nd = new Float32Array(S.cap * 2 * N_SEG); nd.set(S.dados); S.dados = nd; S.cap *= 2; }
        const b = S.n++ * N_SEG, D = S.dados;
        D[b] = px; D[b + 1] = py; D[b + 2] = pz; D[b + 3] = vx; D[b + 4] = vy; D[b + 5] = vz;
        D[b + 6] = L0; D[b + 7] = pAcc; D[b + 8] = len; D[b + 9] = fimTipo; D[b + 10] = flags; D[b + 11] = pTrans;
        const mask = MASCARA[(flags & 1) * 3 + ((flags >> 1) & 3)];
        if (!mask) return;
        // varre o segmento: I(s) = pAcc/(L0+s)²; em cada amostra o nível `kk` atingido estende os níveis 0..kk
        const sMax = Math.min(len, Math.sqrt(pAcc / lim[0]) - L0);
        if (sMax < 0) return;
        let s = 0;
        while (true) {
          const x = px + vx * s, y = py + vy * s, z = pz + vz * s;
          const Lc = Math.max(D_MIN, L0 + s), kk = classificar(pAcc / (Lc * Lc));
          const r = Math.hypot(x - o.x, y - o.y, z - o.z);
          if (kk >= 0) marcar(celula(x, y, z), r, kk, mask);
          if (s >= sMax) break;
          s = Math.min(sMax, s + Math.max(0.05, Math.min(0.5, Math.max(r, D_MIN) * passoRad * 0.5)));
        }
        // bordas EXATAS dos níveis dentro do segmento (cruzamento analítico: L_k = √(pAcc/limiar_k))
        for (let k = 0; k < nNiv; k++) {
          const sk = Math.sqrt(pAcc / lim[k]) - L0;
          if (sk > 0 && sk <= len + 1e-9) marcar(celula(px + vx * sk, py + vy * sk, pz + vz * sk), Math.hypot(px + vx * sk - o.x, py + vy * sk - o.y, pz + vz * sk - o.z), k, mask);
        }
        // batida: a face da superfície é a borda dos níveis que ainda existiam ali (a penetração continua noutro segmento)
        if (fimTipo === 1) {
          const Lh = L0 + len, kh = classificar(pAcc / (Math.max(D_MIN, Lh) * Math.max(D_MIN, Lh)));
          const hx = px + vx * len, hy = py + vy * len, hz = pz + vz * len, cel = celula(hx, hy, hz), rh = Math.hypot(hx - o.x, hy - o.y, hz - o.z);
          marcar(cel, rh, kh, mask);
          if (cel >= 0) for (let c = 0; c < 4; c++) if (mask & (1 << c)) (barr[c][cel] || (barr[c][cel] = [])).push(rh);
        }
      };

      const P0 = this.powerWatts, faixa = this.signalFrequency;
      this._tarefa = { avancada: true };
      this.scanning = true; this._setProgresso(0);
      tr.onProgress = (p) => this._setProgresso(Math.min(99, p));
      const t0 = performance.now();
      const meshMode = this.meshMode, rssi = this.rssiThreshold;
      tr.run(entrada).then((res) => {
        if (!res) return;                                          // cancelada/substituída
        if (this._tracador !== tr) return;
        this._tracador = null;
        // monta 1 "tarefa" no formato do motor normal por ESTADO (é o que `_construirMalha` consome)
        const variantes = [];
        for (let c = 0; c < 4; c++) {
          for (let i = 0; i < total; i++) if (barr[c][i]) barr[c][i].sort((a, b) => a - b);
          variantes.push({
            avancada: true, estado: c, pose: entrada.pose, nT, nP, total, passo: entrada.passo, i: total, t0,
            dist: dist[c], barreirasPorRaio: barr[c], P: P0, faixa, meshMode, rssiThreshold: rssi,
          });
        }
        this._variantes = variantes; this._segStats = res.stats;
        const t = variantes[this.estadoFenomenos];
        // `_concluir` (base) chama `clear()` quando `manterAnterior` -- não pode apagar os dados desta varredura nova.
        this._preservarDados = true;
        try { this._concluir(t); } finally { this._preservarDados = false; }
        if (this.ultimoResultado) { this.ultimoResultado.avancada = true; this.ultimoResultado.stats = res.stats; this.ultimoResultado.tempoMs = Math.round(performance.now() - t0); this.ultimoResultado.raios = total; }
      }).catch((e) => { console.error('[varredura avançada]', e); this.scanning = false; this._tarefa = null; });
      return { ok: true, raios: total };
    }

    clear() {
      super.clear();
      if (!this._preservarDados) { this._variantes = null; this._seg = null; }
    }

    // ---- pontos e raios a partir dos SEGMENTOS reais -------------------------------------------------------------
    /**
     * Com os dois fenômenos desligados usa EXATAMENTE a rotina do motor normal (garante a igualdade pedida);
     * com qualquer um ligado desenha, por nível, os pontos/raios dos segmentos visíveis (mostrando as dobras).
     */
    _construirPontosRaios(t) {
      if (!this._seg || (t && t.estado === 0)) { super._construirPontosRaios(t); this._ajustarPontosRaios(); return; }
      const THREE = this.engine.THREE, nNiv = NIVEIS.length, S = this._seg, D = S.dados;
      const estado = t.estado;
      const pontosNiveis = this.mostrarPontosNiveis, raiosNiveis = this.mostrarRaiosNiveis;
      const modoColisao = this.pontosRaycasterModo === 'colisao', completo = this.raiosExtensao === 'completo';
      const lim = NIVEIS.map((n) => n.limiar);
      for (let k = 0; k < nNiv; k++) {
        const posList = [], lineList = [];
        for (let i = 0; i < S.n; i++) {
          const b = i * N_SEG, flags = D[b + 10];
          if (!(MASCARA[(flags & 1) * 3 + ((flags >> 1) & 3)] & (1 << estado))) continue;
          const px = D[b], py = D[b + 1], pz = D[b + 2], vx = D[b + 3], vy = D[b + 4], vz = D[b + 5];
          const L0 = D[b + 6], pAcc = D[b + 7], len = D[b + 8], fim = D[b + 9], pTrans = D[b + 11];
          const sOut = Math.sqrt(pAcc / lim[k]) - L0;                       // onde ESTE nível termina neste segmento
          if (sOut <= 1e-9) continue;
          const sIn = k < nNiv - 1 ? Math.max(0, Math.sqrt(pAcc / lim[k + 1]) - L0) : 0;   // onde o nível mais forte termina
          const a = completo ? 0 : sIn;
          let bEnd = Math.min(len, sOut);
          if (bEnd <= a + 1e-6) continue;
          let pt = -1;
          if (modoColisao) {
            // só onde houve BATIDA dentro da faixa deste nível
            if (fim !== 1 || len < a - 1e-6 || len > sOut + 1e-6) continue;
            pt = len; bEnd = len;
          } else if (sOut <= len + 1e-6) pt = sOut;                         // o nível termina DENTRO do segmento
          else if (fim === 1) {                                              // a parede corta o nível (a penetração não o sustenta)
            const Lh = L0 + len; if ((pTrans / (Lh * Lh)) < lim[k]) pt = len;
          }
          lineList.push(px + vx * a, py + vy * a, pz + vz * a, px + vx * bEnd, py + vy * bEnd, pz + vz * bEnd);
          if (pt >= 0) posList.push(px + vx * pt, py + vy * pt, pz + vz * pt);
        }
        this._criarNivelPontosRaios(k, Float32Array.from(posList), Float32Array.from(lineList), !!pontosNiveis[k], !!raiosNiveis[k]);
      }
      this._ajustarPontosRaios();
    }

    _criarNivelPontosRaios(k, pos, linePos, verPontos, verRaios) {
      const THREE = this.engine.THREE, c = NIVEIS[k].cor, cor3 = new THREE.Color(c[0], c[1], c[2]);
      const geoPts = new THREE.BufferGeometry(); geoPts.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geoPts.computeBoundingSphere();
      const pts = new THREE.Points(geoPts, new THREE.PointsMaterial({ color: cor3, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
      pts.renderOrder = 9; pts.frustumCulled = false; pts.raycast = function () {}; pts.userData.wifi = true; pts.visible = verPontos;
      const geoL = new THREE.BufferGeometry(); geoL.setAttribute('position', new THREE.BufferAttribute(linePos, 3)); geoL.computeBoundingSphere();
      const lines = new THREE.LineSegments(geoL, new THREE.LineBasicMaterial({ color: cor3, transparent: true, opacity: 0.5, depthWrite: false }));
      lines.renderOrder = 8; lines.frustumCulled = false; lines.raycast = function () {}; lines.userData.wifi = true; lines.visible = verRaios;
      this.cloudRaycastPorNivel[k] = pts; this.raiosRaycastPorNivel[k] = lines;
      if (this.engine._group) { this.engine._group.add(pts); this.engine._group.add(lines); }
    }

    /** Nomes próprios (distintos da varredura normal) e pontos um pouco maiores: "as nuvens devem ser diferentes". */
    _ajustarPontosRaios() {
      for (let k = 0; k < NIVEIS.length; k++) {
        const p = this.cloudRaycastPorNivel[k], l = this.raiosRaycastPorNivel[k];
        if (p) { p.name = 'wifi-adv-pontos:' + NIVEIS[k].nome + ':' + this.obj.id; p.material.size = 0.06; }
        if (l) { l.name = 'wifi-adv-raios:' + NIVEIS[k].nome + ':' + this.obj.id; }
      }
    }

    _construirMalha(t, instantaneo) {
      super._construirMalha(t, instantaneo);
      if (this.malha) this.malha.name = 'wifi-adv-mapa:' + this.obj.id;
    }
  }

  // ==========================================================================
  // REGISTRO DE INSTÂNCIAS (1 avançada por AP, ao lado da normal de `WifiSignal.para`)
  // ==========================================================================
  const instanciasAv = new Map();
  function paraAvancado(obj, engine) {
    let ap = instanciasAv.get(obj.id);
    if (!ap) { ap = new AccessPointAvancado(obj, engine); instanciasAv.set(obj.id, ap); }
    ap.obj = obj; ap.engine = engine;
    return ap;
  }
  function removerAvancado(id) {
    const ap = instanciasAv.get(id);
    if (ap) { ap.cancelScan(); ap.clear(); ap.removerEtiqueta(); ap.removerBarraProgresso(); instanciasAv.delete(id); }
  }
  const remover0 = WS.remover;
  WS.remover = function (id) { if (remover0) remover0(id); removerAvancado(id); };

  WS.AccessPointAvancado = AccessPointAvancado;
  WS.paraAvancado = paraAvancado;
  WS.removerAvancado = removerAvancado;
  WS.instanciaAvancadaExistente = (id) => instanciasAv.get(id) || null;
})(typeof window !== 'undefined' ? window : globalThis);
