/* js/rack-cable-routing.js
 * [21/09/2026] MOTOR DE ROTEAMENTO AUTOMÁTICO DOS CABOS HORIZONTAIS (Cat6 / "StructuredCable") do rack.
 *
 * Cabos ligados na TRASEIRA de um Patch Panel montado num rack se organizam sozinhos em feixes (chicotes),
 * descem/sobem pela guia vertical do lado da porta e saem pela abertura da tampa (topo ou base), tudo em
 * passos ORTOGONAIS (retas + curvas de raio mínimo de curvatura), sem diagonais.
 *
 * O que este arquivo entrega (nomes pedidos no enunciado):
 *   1) `rack.getExitNodePosition()`         -> `RackCableRouting.forRack(rackObj, ctx).getExitNodePosition(THREE?)`
 *   2) `rack.calculateCablePath(cabo, pp)`  -> `RackCableRouting.forRack(rackObj, ctx).calculateCablePath(cabo, patchPanel)`
 *   3) Aplicação numa `THREE.CatmullRomCurve3` -> `Engine3D._curvaDeRotaCabo` (js/engine3d-rede-mesh.js), que já
 *      monta um `THREE.CurvePath` (trechos `reto` = LineCurve3, cantos = CatmullRomCurve3 'centripetal').
 *   4) Atualização reativa -> `Engine3D.rackAtualizarRoteamento(rackId)` / `Engine3D.caboUpdateGeometry(caboId)`.
 *
 * PROPRIEDADES DO RACK (objeto do mapa; ver rack-modular.js):
 *   rack.rackCableEntry          = 'top' | 'bottom' | 'nenhum'   (== "cableExitDirection"; 'nenhum' desliga o roteamento)
 *   rack.rackCableExitAlignment  = 'center' | 'left_corner' | 'right_corner' | 'custom'   (== "cableExitAlignment")
 *   rack.rackCustomExitOffset    = { x, y, z }  metros a partir do centro do rack, usado se 'custom' (== "customExitOffset")
 *
 * CONVENÇÕES: o "local do rack" tem X = direita(+)/esquerda(-), Y = altura, Z = frente(+)/traseira(-) (mesma de
 * rack-modular.js). Mundo: `x = rack.x + lx*cos(rotY) + lz*sin(rotY)`, `z = rack.y - lx*sin(rotY) + lz*cos(rotY)`,
 * `rotY = -rack.angulo` (igual a `_redePontoMundo`/`objAnguloToRotY`). Toda a matemática roda no LOCAL do rack
 * (fica trivial: eixos alinhados) e só os pontos finais são levados ao mundo — 1 rotação por ponto, sem matrizes
 * 4x4 nem alocação de THREE.Vector3 no caminho quente (o motor cria os Vector3 só ao montar a curva).
 *
 * PERFORMANCE: os cabos continuam sendo tubos de 6 lados (`_buildTuboEstavel`) com espessura real do Cat6 — poucos
 * polígonos por cabo. Não usamos `THREE.Line2`/fat lines porque elas exigem os módulos `examples/jsm` (LineMaterial,
 * LineGeometry) que o build `lib/three.global.js` do app não garante; o tubo de baixa contagem de faces dá a mesma
 * espessura real sem depender deles. A ordem/posição de cada cabo dentro do feixe é calculada UMA vez por
 * reconstrução (cache por mapa) — O(n log n), não O(n²).
 */
(function (raiz) {
  'use strict';

  // ---- constantes geométricas (metros) -------------------------------------------------------------------
  const RECUO_BARRA_M = 0.05;     // Ponto 2: recuo reto de 5 cm para trás (barra de apoio traseira)
  const RAIO_CURVA_M = 0.025;     // raio de curvatura (>= 4x o diâmetro de um Cat6 ~6,2 mm => 25 mm, norma TIA/EIA)
  const MARGEM_GUIA_M = 0.03;     // folga entre a lateral do rack e o feixe da guia vertical
  const FOLGA_TAMPA_M = 0.012;    // distância (dentro do rack) da chapa onde o feixe faz o desvio horizontal até a furação
  const FOLGA_PORTA_TRAS_M = 0.04; // folga entre a guia vertical e a porta traseira do rack
  const SAIDA_EXTRA_M = 0.06;     // trecho reto além da chapa, antes de seguir para a eletrocalha
  const FOLGA_EMPACOTAMENTO = 1.06;   // 6% de folga entre cabos vizinhos no feixe
  const EPS = 1e-4;

  const _cache = { mapData: null, racks: new Map() };

  // ---- utilidades ----------------------------------------------------------------------------------------
  const _rotY = (o) => -((o && o.angulo) || 0);
  const _aPiso = (mapData) => (mapData && mapData.alturaPiso) || 2.8;
  const _baseY = (rack, mapData) => (rack.piso || 0) * _aPiso(mapData) + (rack.elevacao || 0);

  /** Local do rack (metros) -> mundo. */
  function localParaMundo(rack, lx, lz) {
    const r = _rotY(rack), c = Math.cos(r), s = Math.sin(r);
    return { x: rack.x + lx * c + lz * s, z: rack.y - lx * s + lz * c };
  }
  /** Mundo -> local do rack (metros). */
  function mundoParaLocal(rack, wx, wz) {
    const r = _rotY(rack), c = Math.cos(r), s = Math.sin(r), dx = wx - rack.x, dz = wz - rack.y;
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }

  /** Posição k (0,1,2...) num empacotamento HEXAGONAL espiral de círculos de diâmetro `passo` — o "feixe" volumoso
   *  (cabos encostados uns nos outros em vez de todos no mesmo eixo). Devolve {x,z} relativo ao centro do feixe. */
  function offsetFeixe(k, passo) {
    if (k <= 0) return { x: 0, z: 0 };
    let anel = 1, cap = 6, i = k - 1;
    while (i >= cap) { i -= cap; anel++; cap = 6 * anel; }
    const H = Math.sqrt(3) / 2, D = [[1, 0], [0.5, H], [-0.5, H], [-1, 0], [-0.5, -H], [0.5, -H]];
    const j = Math.floor(i / anel), t = i % anel, a = D[j % 6], b = D[(j + 1) % 6];
    return { x: (a[0] * anel + (b[0] - a[0]) * t) * passo, z: (a[1] * anel + (b[1] - a[1]) * t) * passo };
  }
  /** Raio (m) do feixe de `n` cabos empacotados com `passo`. */
  function raioFeixe(n, passo) {
    let anel = 0, cap = 1;
    while (cap < n) { anel++; cap += 6 * anel; }
    return anel * passo + passo / 2;
  }

  /** Arredonda os cantos de uma polilinha ORTOGONAL: cada canto vira [entrada, meio do arco, saída]. Devolve pontos
   *  `{x,y,z,reto}` — `reto:true` = o trecho até o PRÓXIMO ponto é reta pura; sem `reto` = faz parte de um arco
   *  (CatmullRomCurve3 centripetal em `_curvaDeRotaCabo`). O raio é limitado à metade dos trechos vizinhos. */
  function arredondarCantos(V, raio) {
    // remove pontos repetidos
    const P = [V[0]];
    for (let i = 1; i < V.length; i++) if (Math.hypot(V[i].x - P[P.length - 1].x, V[i].y - P[P.length - 1].y, V[i].z - P[P.length - 1].z) > EPS) P.push(V[i]);
    const dirDe = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz) || 1; return { x: dx / l, y: dy / l, z: dz / l, l }; };
    const out = [{ x: P[0].x, y: P[0].y, z: P[0].z, reto: true }];
    for (let i = 1; i < P.length - 1; i++) {
      const din = dirDe(P[i - 1], P[i]), dout = dirDe(P[i], P[i + 1]);
      const dot = din.x * dout.x + din.y * dout.y + din.z * dout.z;
      if (dot > 0.9995) continue;                                      // colinear: o ponto do meio é redundante
      const r = Math.min(P[i].r != null ? P[i].r : raio, 0.5 * din.l, 0.5 * dout.l);
      if (dot < -0.9995 || r < 0.002) { out.push({ x: P[i].x, y: P[i].y, z: P[i].z, reto: true }); continue; }   // meia-volta/trecho minúsculo: canto vivo
      const E = { x: P[i].x - din.x * r, y: P[i].y - din.y * r, z: P[i].z - din.z * r };
      const X = { x: P[i].x + dout.x * r, y: P[i].y + dout.y * r, z: P[i].z + dout.z * r };
      // arco circular (pernas perpendiculares): centro C = E + dout*r; ponto(θ) = C + r*(-dout*cosθ + din*sinθ), θ = 0..90° (5 pontos)
      const C = { x: E.x + dout.x * r, y: E.y + dout.y * r, z: E.z + dout.z * r };
      for (let a = 0; a <= 4; a++) {
        const th = (a / 4) * Math.PI / 2, c = Math.cos(th), sn = Math.sin(th);
        out.push({ x: C.x + r * (-dout.x * c + din.x * sn), y: C.y + r * (-dout.y * c + din.y * sn), z: C.z + r * (-dout.z * c + din.z * sn), reto: a === 4 });
      }
    }
    const u = P[P.length - 1];
    out.push({ x: u.x, y: u.y, z: u.z, reto: true });
    return out;
  }

  /** Inverte uma polilinha de pontos com `reto` (o flag descreve o trecho ATÉ o próximo ponto). */
  function inverter(pts) {
    const n = pts.length, out = [];
    for (let j = 0; j < n; j++) {
      const p = pts[n - 1 - j];
      out.push({ x: p.x, y: p.y, z: p.z, reto: j < n - 1 ? !!pts[n - 2 - j].reto : true });
    }
    return out;
  }

  /** Organização configurável do feixe (propriedades do rack):
   *   rackCabosFormato       'retangular' (grade colunas x raias, vista de corte retangular, padrão) | 'cilindrico' (grade quase quadrada => feixe redondo)
   *   rackCabosEspacamento   'junto' (1,00, colados, padrão) | 'afastado' (1,06 x o diâmetro) | 'livre' (usa `rackCabosFator`)
   *   rackCabosFator         distância centro a centro em múltiplos do diâmetro do cabo (só p/ 'livre'; 1,00 a 3,00) */
  const FATOR_MIN = 0.87;   // o tubo do cabo é um prisma de 6 lados: com centro a centro = 0,87 x diâmetro as FACES encostam (colados)
  const FATOR_MAX_H = 3, FATOR_MAX_V = 6;
  function organizacao(rackObj) {
    const o = rackObj || {};
    const formato = o.rackCabosFormato === 'cilindrico' ? 'cilindrico' : 'retangular';
    // horizontal: entre cabos vizinhos (lado a lado no agrupamento; também o passo vertical dentro do agrupamento)
    // [21/09/2026] padrão do app agora é 'junto' (colados) -- só cai em 'afastado' se for isso mesmo que estiver salvo.
    const esp = o.rackCabosEspacamento === 'afastado' || o.rackCabosEspacamento === 'livre' ? o.rackCabosEspacamento : 'junto';
    let fator = esp === 'junto' ? FATOR_MIN : FOLGA_EMPACOTAMENTO;
    if (esp === 'livre') { const f = Number(o.rackCabosFator); fator = Number.isFinite(f) ? Math.min(FATOR_MAX_H, Math.max(FATOR_MIN, f)) : FOLGA_EMPACOTAMENTO; }
    // vertical: entre os agrupamentos (parte de baixo/de cima do rack, onde os feixes correm na horizontal)
    const espV = o.rackCabosEspacamentoV === 'afastado' || o.rackCabosEspacamentoV === 'livre' ? o.rackCabosEspacamentoV : 'junto';
    let fatorV = espV === 'junto' ? FATOR_MIN : null;
    if (espV === 'livre') { const f = Number(o.rackCabosFatorV); fatorV = Number.isFinite(f) ? Math.min(FATOR_MAX_V, Math.max(FATOR_MIN, f)) : 2; }
    return { formato, esp, fator, espV, fatorV };
  }

  /** Raios de curva CONCÊNTRICOS: colunas vizinhas com passo horizontal `ph` e diferença vertical `gv` (m) fazem o canto em
   *  arcos concêntricos separados por >= `pmin` (cabo encostado no vizinho, sem atravessar). Devolve o acréscimo de raio por coluna. */
  function passoRaio(ph, gv, pmin) {
    const S = ph + gv - pmin, disc = 2 * (ph - pmin) * (gv - pmin);
    return Math.max(pmin, S - Math.sqrt(Math.max(0, disc)));
  }

  // ---- roteamento por rack ---------------------------------------------------------------------------------
  class RackCableRouting {
    /** Roteamento automático ligado neste rack? (direção 'top'/'bottom'). */
    static ativo(rackObj) {
      return !!(rackObj && rackObj.tipo === 'rack' && (rackObj.rackCableEntry === 'top' || rackObj.rackCableEntry === 'bottom') && raiz.RackModular);
    }
    static limparCache() { _cache.mapData = null; _cache.racks.clear(); }

    /** Cria a "fachada" `rack` com os dois métodos do enunciado.
     *  @param {object} rackObj  objeto `tipo:'rack'` do mapa
     *  @param {{mapData:object, portaTras:(pp:object,porta:number)=>({x,y,z}|null), THREE?:object}} ctx
     *         `portaTras` devolve o ponto (mundo) do bloco IDC/RJ45 na traseira da porta (o motor usa `_redePortaMundoLado`). */
    static forRack(rackObj, ctx) {
      ctx = ctx || {};
      return {
        rack: rackObj,
        /** Coordenada GLOBAL da furação da tampa por onde os cabos passam: `THREE.Vector3` (se `THREE` disponível) ou {x,y,z}. */
        getExitNodePosition: (THREE) => RackCableRouting.getExitNodePosition(rackObj, ctx.mapData, THREE || ctx.THREE),
        /** Waypoints ortogonais (mundo) de um cabo traseiro do `patchPanel` até fora da tampa. */
        calculateCablePath: (cabo, patchPanel) => RackCableRouting.calculateCablePath(rackObj, cabo, patchPanel, ctx),
      };
    }

    /** Ponto (mundo) do centro da abertura da tampa. Y fixo na chapa do topo (`top`) ou da base (`bottom`); X/Z seguem
     *  `rackCableExitAlignment` (center / left_corner / right_corner / custom). `null` se o roteamento está desligado. */
    static getExitNodePosition(rackObj, mapData, THREE) {
      if (!RackCableRouting.ativo(rackObj)) return null;
      const rm = raiz.RackModular.fromObjeto(rackObj), s = rm.posicaoSaidaLocalMm();
      if (!s) return null;
      const w = localParaMundo(rackObj, s.x * 0.001, s.z * 0.001), y = _baseY(rackObj, mapData) + s.y * 0.001;
      return THREE && THREE.Vector3 ? new THREE.Vector3(w.x, y, w.z) : { x: w.x, y, z: w.z };
    }

    /** PLANO do rack (cache por reconstrução do mapa): para cada cabo traseiro de patch panel define
     *   - `lado` ('esq'|'dir'): calha vertical do lado da porta;
     *   - `col`: coluna do PP na calha (0 = encostada na parede = PP mais distante da saída; cada PP a mais soma 1 coluna);
     *   - `lane`: raia de profundidade (0 = mais rasa); a porta mais PERTO da calha ocupa a raia mais rasa, a mais longe a mais
     *     funda -> os trechos laterais nunca se cruzam;
     *   - altura de saída da calha: `rank*passo + coluna*(R+passo)` abaixo da chapa (colunas vizinhas não se cruzam).
     *  Cada PP forma um sub-feixe (grade colunas x raias); esquerdo e direito são translações rígidas até ficarem lado a lado
     *  na furação = um feixe único cuja largura cresce 1 coluna por PP -> super feixe ("feixe de N feixes"). */
    static _plano(rackObj, mapData, ctx) {
      if (_cache.mapData !== mapData) { _cache.mapData = mapData; _cache.racks.clear(); }
      let pl = _cache.racks.get(rackObj.id);
      if (pl) return pl;
      const RE = raiz.RedeEquip, rm = raiz.RackModular.fromObjeto(rackObj), sl = rm.posicaoSaidaLocalMm();
      const K = 0.001, L = rm.dim.largura * K, dirY = sl ? sl.dirY : 1;
      const objs = new Map(((mapData && mapData.objects) || []).map((o) => [o.id, o]));
      const itens = [];
      let dMax = 6.2, zMin = Infinity;
      ((mapData && mapData.cabos) || []).forEach((c) => {
        [c.de, c.para].forEach((ext) => {
          if (!ext || ext.lado !== 'tras') return;
          const eq = objs.get(ext.obj);
          if (!eq || eq.rackId !== rackObj.id) return;
          const sp = RE && RE.especificar(eq.tipo);
          if (!sp || sp.familia !== 'patchpanel') return;
          const w = ctx && ctx.portaTras ? ctx.portaTras(eq, ext.porta) : null;
          if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y) || !Number.isFinite(w.z)) return;
          const l = mundoParaLocal(rackObj, w.x, w.z);
          const d = RE.diametroCabo ? RE.diametroCabo(c) : 6.2; dMax = Math.max(dMax, d); zMin = Math.min(zMin, l.z);
          itens.push({ id: c.id, pp: eq.id, porta: ext.porta || 0, lado: l.x < 0 ? 'esq' : 'dir', lx: l.x, lz: l.z, y: w.y });
        });
      });
      const org = organizacao(rackObj), dM = dMax * K, p = dM * org.fator, pmin = dM * FATOR_MIN * 0.999, zBase = (Number.isFinite(zMin) ? zMin : 0) - RECUO_BARRA_M;
      // cilíndrico: cada PP ocupa `cw` colunas x ceil(m/cw) raias, com cw ~ sqrt(m / (2 PPs)) => seção quase quadrada (feixe redondo)
      const contaPP = (lado) => new Set(itens.filter((it) => it.lado === lado).map((it) => it.pp)).size;
      const contaM = (lado) => { const c = new Map(); itens.filter((it) => it.lado === lado).forEach((it) => c.set(it.pp, (c.get(it.pp) || 0) + 1)); return Math.max(0, ...c.values()); };
      const mM = Math.max(contaM('esq'), contaM('dir'), 1), pP = Math.max(contaPP('esq'), contaPP('dir'), 1);
      const cw = org.formato === 'cilindrico' ? Math.max(1, Math.min(mM, Math.round(Math.sqrt(mM / (2 * pP)) + 0.25))) : 1;
      const lanesPor = Math.ceil(mM / cw);
      // distância vertical entre colunas (agrupamentos): 'afastado' = raio fixo (canto por translação); 'junto'/'livre' pequenos = arcos concêntricos
      const gcTransl = RAIO_CURVA_M + p;
      let gc = org.espV === 'afastado' ? gcTransl : Math.max(pmin, dM * org.fatorV), conc = false;
      if (gc < gcTransl - 1e-9) conc = true;
      const dR = conc ? passoRaio(p, gc, pmin) : 0;   // acréscimo de raio por coluna (só no modo concêntrico)
      pl = { p, zBase, dirY, L, cw, lanesPor, org, gc, conc, dR, dM, byId: new Map(), lado: { esq: { P: 0, m: 0 }, dir: { P: 0, m: 0 } }, mMax: lanesPor };
      ['esq', 'dir'].forEach((lado) => {
        const s = lado === 'esq' ? -1 : 1, xCol0 = s * (L / 2 - MARGEM_GUIA_M);
        const meus = itens.filter((it) => it.lado === lado);
        // colunas: PP mais distante da saída (vertical mais longa) fica encostado na parede
        const pps = [...new Set(meus.map((it) => it.pp))].map((id) => ({ id, y: meus.find((it) => it.pp === id).y }));
        pps.sort((a, b) => (dirY > 0 ? a.y - b.y : b.y - a.y) || String(a.id).localeCompare(String(b.id)));
        pps.forEach((pp, col) => {
          const g = meus.filter((it) => it.pp === pp.id);
          g.sort((a, b) => (Math.abs(a.lx - xCol0) - Math.abs(b.lx - xCol0)) || (a.porta - b.porta));   // perto da calha primeiro
          g.forEach((it, i) => { it.sub = Math.floor(i / lanesPor); it.lane = i % lanesPor; it.col = col * cw + it.sub; });
          pl.lado[lado].m = Math.max(pl.lado[lado].m, Math.min(g.length, lanesPor));
        });
        pl.lado[lado].P = pps.length * cw;
        pl.mMax = Math.max(pl.mMax, pl.lado[lado].m);
        pl.temSub = cw > 1;
        meus.forEach((it) => pl.byId.set(it.id, it));
      });
      // sentido do deslocamento em Z até a furação: define qual raia sobe mais (a mais funda sobe menos quando a furação fica
      // à frente das raias) -> a subida final de uma raia nunca atravessa o trecho em Z de outra da mesma coluna.
      const sl2 = sl || { z: 0 }, ze = sl2.z * K;
      pl.dzSinal = Math.sign((ze + ((pl.mMax - 1) / 2) * p) - zBase) || 1;
      _cache.racks.set(rackObj.id, pl);
      return pl;
    }

    /**
     * Waypoints de um cabo horizontal: traseira do Patch Panel -> fora da tampa do rack. Todos ortogonais (arredondados).
     *  1 Origem            bloco IDC/RJ45 na traseira da porta                       (`ctx.portaTras`)
     *  2 Barra de apoio    recuo RETO de 5 cm para trás (-Z do rack)
     *  3 Entrada na guia   raia de profundidade própria e desvio RETO (eixo X) até a calha vertical do MESMO lado da porta
     *  4 Curva vertical    canto de 90° arredondado -> sobe/desce (eixo Y) conforme `rackCableEntry`
     *  5 Super feixe       na altura própria do cabo segue X e Z até a coluna final; sub-feixes esq/dir ficam lado a lado
     *  6 Destino de saída  atravessa a furação em `getExitNodePosition()` e segue reto 6 cm para fora (`saida` = ponto e direção)
     * @returns {{pontos:{x,y,z,reto:boolean}[], saida:{x,y,z,nx,ny,nz}, nomes:string[]}|null}
     *          `pontos` já no formato de `_curvaDeRotaCabo`; `null` se não se aplica (roteamento off, porta sem traseira...).
     */
    static calculateCablePath(rackObj, cabo, patchPanel, ctx) {
      ctx = ctx || {};
      if (!RackCableRouting.ativo(rackObj) || !cabo || !patchPanel || !ctx.portaTras) return null;
      const mapData = ctx.mapData, rm = raiz.RackModular.fromObjeto(rackObj), saidaLocal = rm.posicaoSaidaLocalMm();
      if (!saidaLocal) return null;
      const ext = cabo.de && cabo.de.obj === patchPanel.id ? cabo.de : (cabo.para && cabo.para.obj === patchPanel.id ? cabo.para : null);
      if (!ext || ext.lado !== 'tras') return null;
      const P1w = ctx.portaTras(patchPanel, ext.porta);
      if (!P1w || !Number.isFinite(P1w.x) || !Number.isFinite(P1w.y) || !Number.isFinite(P1w.z)) return null;
      const pl = RackCableRouting._plano(rackObj, mapData, ctx), it = pl.byId.get(cabo.id);
      if (!it) return null;
      const K = 0.001, p = pl.p, dirY = pl.dirY, s = it.lado === 'esq' ? -1 : 1, oposto = it.lado === 'esq' ? 'dir' : 'esq';
      const baseY = _baseY(rackObj, mapData), plateY = baseY + saidaLocal.y * K;
      const xe = saidaLocal.x * K, ze = saidaLocal.z * K, R = RAIO_CURVA_M;
      const l1 = mundoParaLocal(rackObj, P1w.x, P1w.z);
      // coluna/raia do cabo na calha
      const zl = pl.zBase - (it.lane + (pl.temSub ? 1 : 0)) * p, xc = s * (pl.L / 2 - MARGEM_GUIA_M - it.col * p);
      // coluna/raia finais (feixe único centrado na furação; esq à esquerda, dir à direita, colados)
      const Pe = pl.lado.esq.P, Pd = pl.lado.dir.P, W = (Pe + Pd) * p;
      const xf = it.lado === 'esq' ? xe - W / 2 + (it.col + 0.5) * p : xe + W / 2 - (it.col + 0.5) * p;
      const zf = ze + ((pl.mMax - 1) / 2 - it.lane) * p;
      // altura própria de saída da calha (níveis a partir da chapa); colunas mais internas viram mais abaixo (+ raio de curva)
      // (raias de mesma ordem em colunas vizinhas ficam a `R + p` de distância vertical; a coluna 0 é a mais alta)
      const rank = pl.dzSinal > 0 ? (pl.mMax - 1 - it.lane) : it.lane;
      let yLvl = plateY - dirY * (FOLGA_TAMPA_M + rank * p + it.col * pl.gc);
      if (dirY > 0) yLvl = Math.max(yLvl, P1w.y + 0.03); else yLvl = Math.min(yLvl, P1w.y - 0.03);
      void oposto;
      // sub-coluna (feixe cilíndrico): a corrida lateral sobe `sub * passo` (após meio passo extra atrás) p/ não cruzar as vizinhas
      const yRun = P1w.y + dirY * it.sub * p;
      const Ncol = pl.lado[it.lado].P, Rtop = R + (pl.conc ? (Ncol - 1 - it.col) * pl.dR : 0);   // canto 'sobe e vira para o centro': coluna 0 = arco maior
      const Rsub = R + (pl.conc ? (pl.cw - 1 - it.sub) * passoRaio(p, p, pl.dM * FATOR_MIN * 0.999) : 0);
      if (dirY > 0) yLvl = Math.max(yLvl, yRun + 0.03); else yLvl = Math.min(yLvl, yRun - 0.03);
      const V = [
        [l1.x, P1w.y, l1.z],                                          // 1 Origem
        [l1.x, P1w.y, pl.zBase],                                      // 2 Barra de apoio (recuo reto de 5 cm, -Z)
        ...(it.sub > 0 ? [[l1.x, P1w.y, pl.zBase - p / 2], [l1.x, yRun, pl.zBase - p / 2]] : []),   //   (sub-coluna) meio passo atrás + degrau vertical
        [l1.x, yRun, zl],                                             //   segue reto até a raia própria (colinear)
        { p: [xc, yRun, zl], r: Rsub },                               // 3 Entrada na calha (reto em X) + 4 canto vertical
        { p: [xc, yLvl, zl], r: Rtop },                                               // 5 Super feixe: sobe/desce a calha até a altura própria
        [xf, yLvl, zl],                                               //   desvio X até a coluna final
        [xf, yLvl, zf],                                               //   desvio Z até a raia final
        [xf, plateY + dirY * SAIDA_EXTRA_M, zf],                      // 6 Destino: atravessa a furação e sai 6 cm
      ];
      const mundo = V.map((v) => { const [lx, y, lz] = Array.isArray(v) ? v : v.p; const w = localParaMundo(rackObj, lx, lz); return { x: w.x, y, z: w.z, r: Array.isArray(v) ? undefined : v.r }; });
      const pontos = arredondarCantos(mundo, R);
      const u = pontos[pontos.length - 1];
      return {
        pontos,
        saida: { x: u.x, y: u.y, z: u.z, nx: 0, ny: dirY, nz: 0 },
        nomes: ['origem', 'barra-de-apoio(5cm)', 'entrada-na-guia', 'curva-vertical', 'super-feixe', 'destino-de-saida'],
        plano: { lado: it.lado, coluna: it.col, raia: it.lane, sub: it.sub, nivel: rank, formato: pl.org.formato, espacamento: pl.org.esp, espacamentoV: pl.org.espV },
      };
    }
  }

  RackCableRouting.organizacao = organizacao;
  RackCableRouting.inverter = inverter;
  RackCableRouting.offsetFeixe = offsetFeixe;
  RackCableRouting.raioFeixe = raioFeixe;
  RackCableRouting.arredondarCantos = arredondarCantos;
  RackCableRouting.localParaMundo = localParaMundo;
  RackCableRouting.mundoParaLocal = mundoParaLocal;
  raiz.RackCableRouting = RackCableRouting;
  if (typeof module !== 'undefined' && module.exports) module.exports = RackCableRouting;
})(typeof window !== 'undefined' ? window : globalThis);
