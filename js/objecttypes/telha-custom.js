/* js/objecttypes/telha-custom.js — [88ª rodada] águas 1–4 + união de telhados (ver GEOMETRIA abaixo). [87ª rodada] CustomRoof: telhado/telha com FORMATO geométrico editável + TIPO de telha comercial (material × formato) por texturas PBR.
 *
 * [88ª] ÁGUAS (1, 2, 3 ou 4): a altura é h = tan(incl) × min(distâncias às bordas "de beiral" da caixa do contorno): 1 água = 1 distância; 2 = duas bordas longas (cumeeira central);
 *   3 = + uma ponta em meia-água (empena na outra); 4 = as quatro bordas (espigões nos cantos). Cada termo do min() é um PLANO: o contorno (− furos/recortes) é recortado em uma FACETA por plano
 *   (PolyBool2D.diferenca com faixas externas da região convexa) e cada faceta é triangulada. UV em unidades de LADRILHO (metros ÷ tamanho real da telha), orientado pela inclinação da faceta.
 *   UNIÃO: telhados com o mesmo obj.telha.grupo viram uma peça única: cada membro mantém só as partes da sua superfície que NÃO ficam abaixo da superfície dos outros (superfície = máximo das alturas),
 *   então as águas se encontram em cumeeiras/vales reais e cada objeto continua selecionável/editável.
 * GEOMETRIA (87ª) — o telhado é uma "casca" de duas águas (cumeeira ao longo do lado MAIOR da caixa do contorno): o contorno (e furos/recortes) é dividido em duas metades pela cumeeira (PolyBool2D, o mesmo
 *   do Piso/Teto) e cada metade vira um plano inclinado triangulado (ShapeUtils.triangulateShape = earcut). Altura de um ponto = alturaBase + tan(inclinação) × (meio-vão − |u − uCumeeira|), onde u é a
 *   coordenada perpendicular à cumeeira. Inclinação 0 = telhado plano. Estática por padrão; só `updateGeometry()` (arrasto de vértice / mudança de inclinação) recalcula e dá dispose() na antiga.
 *
 * TELHA SEM PESAR A GEOMETRIA — as ondulações/encaixes NÃO são vértices: vêm de um normalMap (e bumpMap) gerado proceduralmente de um mapa de ALTURAS (canvas): o mapa de alturas é convertido em normais por
 *   diferenças finitas (Sobel); o fragment shader perturba a normal por pixel, então a luz "enxerga" as ondas, aba trapezoidal, escamas romanas e juntas de shingle em um plano liso (poucos triângulos).
 *   O albedo (`map`) é o mesmo mapa de alturas tingido pela cor do material (cavas mais escuras). Cada material tem roughness/metalness/transmissão próprios (ver MATERIAIS).
 * ESCALA REAL — cada formato tem um tamanho REAL de ladrilho de textura (TEXTURA_M: largura × comprimento em metros, ex.: 4 ondas de 0,10 m). UV vai de 0 a 1 sobre o comprimento real do telhado (ao longo da cumeeira)
 *   e o comprimento real da água (da cumeeira ao beiral, medido sobre a inclinação); texture.repeat = (comprimento / ladrilhoLargura, água / ladrilhoComprimento), com wrapS/wrapT = RepeatWrapping — a telha
 *   nunca fica esticada nem fora de escala, em qualquer tamanho/inclinação.
 * Tempo real: `setTileType(material, formato)` só troca textura/propriedades do material (a geometria não é tocada). */
(function () {
  'use strict';

  /** Materiais do mercado. cor = albedo base; rugosidade/metal = PBR; transmissao > 0 => MeshPhysicalMaterial com transmissão (vidro/PET/fibra); opacidade < 1 => transparent. */
  const MATERIAIS = {
    concreto:  { rotulo: 'Concreto',            cor: '#8f9194', rugosidade: 0.92, metal: 0.0,  relevo: 1.0 },                       // fosco, poroso: rugosidade alta, sem metal
    zinco:     { rotulo: 'Zinco galvanizado',   cor: '#b8c0c8', rugosidade: 0.32, metal: 0.95, relevo: 1.0 },                       // metal polido: metalness ~1, rugosidade baixa (brilho)
    pvc:       { rotulo: 'PVC',                 cor: '#d8cfc0', rugosidade: 0.45, metal: 0.0,  relevo: 0.9, verniz: 0.35 },          // plástico: leve verniz (clearcoat)
    ceramica:  { rotulo: 'Cerâmica',            cor: '#b4502c', rugosidade: 0.68, metal: 0.0,  relevo: 1.0 },                       // barro queimado: semifosco
    fibra:     { rotulo: 'Fibra de vidro',      cor: '#d9d4bd', rugosidade: 0.55, metal: 0.0,  relevo: 0.9, transmissao: 0.35, opacidade: 0.92, espessura: 0.01 }, // translúcida
    vidro:     { rotulo: 'Vidro',               cor: '#bfe2ec', rugosidade: 0.04, metal: 0.0,  relevo: 0.35, transmissao: 1.0, opacidade: 0.35, ior: 1.5, espessura: 0.02 }, // transparente, liso
    pet:       { rotulo: 'PET',                 cor: '#d5ecf2', rugosidade: 0.16, metal: 0.0,  relevo: 0.8, transmissao: 0.85, opacidade: 0.5, ior: 1.57, espessura: 0.005 },
    solar:     { rotulo: 'Fotovoltaica',        cor: '#0c1a36', rugosidade: 0.14, metal: 0.55, relevo: 0.25, verniz: 1.0, solar: true } // liso, escuro, reflexivo (vidro temperado sobre células)
  };
  /** Formatos: tamanho real do ladrilho da textura (m): [largura ao longo da cumeeira, comprimento ao longo da água]. */
  const FORMATOS = {
    ondulada:    { rotulo: 'Ondulada',                tam: [0.40, 0.40] },    // 4 ondas de 0,10 m
    trapezoidal: { rotulo: 'Trapezoidal',             tam: [0.40, 0.40] },    // 2 trapézios de 0,20 m
    romana:      { rotulo: 'Romana/Portuguesa',       tam: [0.40, 0.60] },    // 2 telhas de 0,20 m × 2 fiadas de 0,30 m, sobrepostas
    plana:       { rotulo: 'Plana (shingle)',         tam: [0.66, 0.40] }     // 2 placas de 0,33 m × 2 fiadas de 0,20 m, juntas desencontradas
  };

  /* ───────────── gerador de mapa de ALTURAS (0..1) por formato ───────────── */
  function alturaEm(formato, u, v) {   // u,v ∈ [0,1) no ladrilho
    const fr = (x) => x - Math.floor(x), tri = (x) => Math.abs(fr(x) - 0.5) * 2;
    if (formato === 'ondulada') return 0.5 + 0.5 * Math.sin(u * 4 * 2 * Math.PI);                                       // senóide: 4 ondas
    if (formato === 'trapezoidal') { const t = tri(u * 2); return Math.min(1, Math.max(0, (1 - t) * 2.2 - 0.3)); }       // trapézio: topo plano, flancos inclinados, vale plano
    if (formato === 'romana') {                                                                                         // meia-cana (telha capa/canal) + degrau de sobreposição por fiada
      const w = 0.5 + 0.5 * Math.sin(fr(u * 2) * 2 * Math.PI - Math.PI / 2), f = fr(v * 2);
      return Math.min(1, w * (0.55 + 0.45 * f) + (f < 0.06 ? -0.25 : 0));
    }
    // plana: placas retangulares, junta (sulco) de 2% e fiadas desencontradas
    const fi = Math.floor(v * 2), uu = fr(u * 2 + (fi % 2) * 0.5), vv = fr(v * 2);
    const junta = (uu < 0.03 || uu > 0.97 || vv < 0.04) ? 0 : 1;
    return junta * (0.7 + 0.3 * vv);
  }
  const _cacheTex = {};
  /** Canvas de alturas, normais (Sobel) e albedo para (material, formato); cacheado, as instâncias clonam (clone() compartilha a imagem, cada uma ganha seu repeat). */
  function gerarTexturas(THREE, matKey, formato) {
    const k = matKey + ':' + formato; if (_cacheTex[k]) return _cacheTex[k];
    const N = 256, mat = MATERIAIS[matKey], fmt = mat.solar ? 'plana' : formato;
    const alt = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) alt[y * N + x] = mat.solar ? ((x % 64 < 2 || y % 64 < 2) ? 0.0 : 1.0) : alturaEm(fmt, x / N, y / N);
    const h = (x, y) => alt[((y + N) % N) * N + ((x + N) % N)];
    const cN = document.createElement('canvas'), cA = document.createElement('canvas'), cB = document.createElement('canvas'); cN.width = cN.height = cA.width = cA.height = cB.width = cB.height = N;
    const gN = cN.getContext('2d'), gA = cA.getContext('2d'), gB = cB.getContext('2d'), iN = gN.createImageData(N, N), iA = gA.createImageData(N, N), iB = gB.createImageData(N, N);
    const base = new THREE.Color(mat.cor), forca = 3.2 * mat.relevo;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      // normalMap: n = normalize(-dh/dx·forca, -dh/dy·forca, 1) → codificada em RGB ([-1,1] → [0,255]); azul-claro = superfície plana
      const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
      const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
      let nx = -dx * forca * 0.25, ny = dy * forca * 0.25, nz = 1; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
      const i = (y * N + x) * 4;
      iN.data[i] = (nx * 0.5 + 0.5) * 255; iN.data[i + 1] = (ny * 0.5 + 0.5) * 255; iN.data[i + 2] = (nz * 0.5 + 0.5) * 255; iN.data[i + 3] = 255;
      const a = alt[y * N + x], sombra = 0.62 + 0.38 * a, ruido = 1 + (((x * 73856093) ^ (y * 19349663)) % 17) / 17 * 0.05;   // cavas mais escuras + grão leve
      iA.data[i] = Math.min(255, base.r * 255 * sombra * ruido); iA.data[i + 1] = Math.min(255, base.g * 255 * sombra * ruido); iA.data[i + 2] = Math.min(255, base.b * 255 * sombra * ruido); iA.data[i + 3] = 255;
      const g = a * 255; iB.data[i] = iB.data[i + 1] = iB.data[i + 2] = g; iB.data[i + 3] = 255;   // bumpMap = o próprio mapa de alturas (tons de cinza)
    }
    gN.putImageData(iN, 0, 0); gA.putImageData(iA, 0, 0); gB.putImageData(iB, 0, 0);
    const tex = (c, cor) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (cor && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return t; };
    return (_cacheTex[k] = { map: tex(cA, true), normalMap: tex(cN, false), tam: FORMATOS[fmt].tam });   // [89ª] sem bumpMap: o normalMap já dá o relevo (menos uma textura por material)
  }

  /* ───────────── [88ª] geometria PURA (sem THREE): facetas planas por água ───────────── */
  const AGUAS = { 1: '1 água (meia-água)', 2: '2 águas', 3: '3 águas', 4: '4 águas' };
  const radDe = (inc) => (typeof inc === 'string' && inc.trim().endsWith('%')) ? Math.atan(parseFloat(inc) / 100) : (Number(inc) || 0) * Math.PI / 180;
  const areaAnel = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  /** Mantém o lado A·x + B·y + C ≤ 0 de um polígono convexo (Sutherland–Hodgman). */
  function recortarConvexo(poly, A, B, C) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], fp = A * p[0] + B * p[1] + C, fq = A * q[0] + B * q[1] + C;
      if (fp <= 0) out.push(p);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  }
  const BIG = 1e3;
  /** Faixa externa (semiplano) de uma aresta de polígono CCW: tudo à direita de p→q. */
  function faixaFora(p, q) {
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = uy, ny = -ux;
    return [[p[0] - ux * BIG, p[1] - uy * BIG], [q[0] + ux * BIG, q[1] + uy * BIG], [q[0] + ux * BIG + nx * BIG, q[1] + uy * BIG + ny * BIG], [p[0] - ux * BIG + nx * BIG, p[1] - uy * BIG + ny * BIG]];
  }
  /** Facetas do telhado (coords locais do contorno). Cada faceta: { outer, holes, ax, ay, c } com altura = ax·x + ay·y + c (relativa à base) e (nx,ny) = direção "morro acima" unitária. */
  function facetasProprias(contorno, furos, incRad, aguas) {
    const PB = window.PolyBool2D, C = contorno.map((p) => [p[0], p[1]]), F = (furos || []).filter((f) => f && f.length >= 3).map((f) => f.map((p) => [p[0], p[1]]));
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; C.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const alongX = (x1 - x0) >= (y1 - y0), tan = Math.tan(incRad), N = Math.max(1, Math.min(4, Math.round(aguas) || 2));
    // distâncias lineares (A, B, C): d = A·x + B·y + C — u = eixo transversal à cumeeira, a = eixo ao longo dela
    const dU0 = alongX ? [0, 1, -y0] : [1, 0, -x0], dU1 = alongX ? [0, -1, y1] : [-1, 0, x1], dA1 = alongX ? [-1, 0, x1] : [0, -1, y1], dA0 = alongX ? [1, 0, -x0] : [0, 1, -y0];
    const termos = N === 1 ? [dU0] : N === 2 ? [dU0, dU1] : N === 3 ? [dU0, dU1, dA1] : [dU0, dU1, dA0, dA1];
    const caixa = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], out = [];
    termos.forEach((dk, k) => {
      let R = caixa;
      termos.forEach((dj, j) => { if (j !== k && R.length >= 3) R = recortarConvexo(R, dk[0] - dj[0], dk[1] - dj[1], dk[2] - dj[2]); });
      if (R.length < 3 || Math.abs(areaAnel(R)) < 1e-6) return;
      let faces = null;
      if (termos.length === 1) faces = (PB && F.length) ? PB.diferenca(C, F) : null;
      else if (PB) {
        const faixas = [];
        for (let i = 0; i < R.length; i++) {   // só as arestas que NÃO estão sobre a caixa (as de divisão das águas) precisam de faixa
          const p = R[i], q = R[(i + 1) % R.length], naCaixa = (Math.abs(p[0] - x0) < 1e-9 && Math.abs(q[0] - x0) < 1e-9) || (Math.abs(p[0] - x1) < 1e-9 && Math.abs(q[0] - x1) < 1e-9) || (Math.abs(p[1] - y0) < 1e-9 && Math.abs(q[1] - y0) < 1e-9) || (Math.abs(p[1] - y1) < 1e-9 && Math.abs(q[1] - y1) < 1e-9);
          if (!naCaixa) faixas.push(faixaFora(p, q));
        }
        faces = PB.diferenca(C, F.concat(faixas));
      }
      if (!faces) faces = [{ outer: C, holes: F }];
      const g = Math.hypot(dk[0], dk[1]) * tan;
      faces.forEach((f) => { if (f.outer && f.outer.length >= 3 && Math.abs(areaAnel(f.outer)) > 1e-6) out.push({ outer: f.outer, holes: f.holes || [], ax: tan * dk[0], ay: tan * dk[1], c: tan * dk[2], nx: g > 1e-9 ? dk[0] : 0, ny: g > 1e-9 ? dk[1] : 1 }); });
    });
    return out;
  }
  const rot = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
  const _memo = new Map(), _matCache = new Map();
  const cfgDe = (obj) => Object.assign({ material: 'ceramica', formato: 'romana', inclinacao: 30, aguas: 2, grupo: '' }, obj && obj.telha || {});
  /** Membros de uma união (mesmo obj.telha.grupo), na ordem do mapa. */
  function membros(obj, mapData) {
    const g = cfgDe(obj).grupo; if (!g || !mapData) return [];
    return (mapData.objects || []).filter((o) => o && o.tipo === 'telha' && cfgDe(o).grupo === g);
  }
  /** Facetas finais de UM telhado (coords locais dele): próprias − partes cobertas pela superfície mais alta dos outros membros da união. { facetas, juncoes } (juncoes = anéis cortados, p/ o 2D). Memoizado. */
  function facetasDe(obj, mapData) {
    const PC = window.PisoCustom, pp = PC.dados(obj), cfg = cfgDe(obj), mem = membros(obj, mapData), ap = (mapData && mapData.alturaPiso) || 2.8;
    // [89ª] chave NUMÉRICA (sem JSON.stringify por quadro): soma ponderada das coordenadas/parâmetros do telhado e dos unidos a ele
    let h1 = 0, h2 = 0, k = 0; const add = (v) => { v = +v || 0; k++; h1 += v * (k % 97 + 1.31); h2 = (h2 * 31 + v * 1009 + k) % 1e12; };
    const sig = (o) => { const c = cfgDe(o), d = PC.dados(o); add(o.x); add(o.y); add(o.angulo); add(o.piso); add(o.elevacao); add(radDe(c.inclinacao)); add(c.aguas); add(d.contorno.length); d.contorno.forEach((p) => { add(p[0]); add(p[1]); }); d.furos.forEach((f) => { add(f.length); f.forEach((p) => { add(p[0]); add(p[1]); }); }); };
    sig(obj); mem.forEach((o) => { if (o.id !== obj.id) { add(String(o.id).length); sig(o); } });
    const key = h1.toFixed(6) + ':' + h2;
    const hit = _memo.get(obj.id); if (hit && hit.key === key) return hit.val;
    const own = facetasProprias(pp.contorno, pp.furos, radDe(cfg.inclinacao), cfg.aguas), PB = window.PolyBool2D;
    let facetas = own; const juncoes = [];
    const outros = mem.filter((o) => o.id !== obj.id);
    if (outros.length && PB) {
      const ia = obj.angulo || 0, ti = [obj.x || 0, obj.y || 0], baseI = (obj.piso || 0) * ap + (obj.elevacao || 0), idxI = mem.findIndex((o) => o.id === obj.id);
      // facetas dos outros, no referencial local deste telhado
      const alheias = [];
      outros.forEach((o) => {
        const d = PC.dados(o), c = cfgDe(o), ja = o.angulo || 0, tj = [o.x || 0, o.y || 0], dBase = ((o.piso || 0) * ap + (o.elevacao || 0)) - baseI, ganha = mem.findIndex((m) => m.id === o.id) < idxI;
        const pF = facetasProprias(d.contorno, d.furos, radDe(c.inclinacao), c.aguas);
        const aLocal = (p) => { const w = rot(p, ja); return rot([w[0] + tj[0] - ti[0], w[1] + tj[1] - ti[1]], -ia); };   // j-local → i-local
        const aJ = (q) => { const w = rot(q, ia); return rot([w[0] + ti[0] - tj[0], w[1] + ti[1] - tj[1]], -ja); };      // i-local → j-local
        pF.forEach((f) => {
          const h = (q) => { const p = aJ(q); return dBase + f.ax * p[0] + f.ay * p[1] + f.c; }, c0 = h([0, 0]);
          alheias.push({ outer: f.outer.map(aLocal), holes: f.holes.map((r) => r.map(aLocal)), ax: h([1, 0]) - c0, ay: h([0, 1]) - c0, c: c0, ganha });
        });
      });
      const bb = (r) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; r.forEach((p) => { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }); return [a, b, c, d]; };
      const novas = [];
      own.forEach((F) => {
        const bf = bb(F.outer), cortes = [];
        alheias.forEach((G) => {
          const bg = bb(G.outer); if (bg[1] < bf[0] || bg[0] > bf[1] || bg[3] < bf[2] || bg[2] > bf[3]) return;
          const da = G.ax - F.ax, db = G.ay - F.ay, dc = G.c - F.c, L2 = da * da + db * db;
          let regioes = null;
          if (L2 < 1e-12) { if (dc > 1e-6 || (Math.abs(dc) <= 1e-6 && G.ganha)) regioes = [{ outer: G.outer, holes: G.holes }]; }
          else {   // região onde G é MAIS ALTA que F: semiplano da·x + db·y + dc > 0
            const L = Math.sqrt(L2), nx = da / L, ny = db / L, p0 = [-dc * da / L2, -dc * db / L2], ux = -ny, uy = nx;
            const faixa = [[p0[0] - ux * BIG, p0[1] - uy * BIG], [p0[0] + ux * BIG, p0[1] + uy * BIG], [p0[0] + ux * BIG - nx * BIG, p0[1] + uy * BIG - ny * BIG], [p0[0] - ux * BIG - nx * BIG, p0[1] - uy * BIG - ny * BIG]];
            regioes = PB.diferenca(G.outer, G.holes.concat([faixa]));
          }
          (regioes || []).forEach((r) => { if (r.outer && r.outer.length >= 3 && Math.abs(areaAnel(r.outer)) > 1e-6) cortes.push(r.outer); });
        });
        if (!cortes.length) { novas.push(F); return; }
        const rest = PB.diferenca(F.outer, F.holes.concat(cortes));
        if (!rest) { novas.push(F); return; }
        cortes.forEach((r) => juncoes.push(r));
        rest.forEach((r) => { if (r.outer && r.outer.length >= 3 && Math.abs(areaAnel(r.outer)) > 1e-6) novas.push({ outer: r.outer, holes: r.holes || [], ax: F.ax, ay: F.ay, c: F.c, nx: F.nx, ny: F.ny }); });
      });
      facetas = novas;
    }
    const val = { facetas, juncoes }; _memo.set(obj.id, { key, val }); return val;
  }

  /** [89ª] Altura do telhado (relativa à base = elevação do objeto) no ponto de MUNDO (wx, wy): plano da faceta que cobre o ponto, ou null se fora do telhado. Usada pela física do personagem. */
  function alturaNoPonto(obj, mapData, wx, wy) {
    const f = facetasDe(obj, mapData).facetas, p = rot([wx - (obj.x || 0), wy - (obj.y || 0)], -(obj.angulo || 0)), x = p[0], y = p[1];
    const dentro = (r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; };
    for (let i = 0; i < f.length; i++) if (dentro(f[i].outer) && !f[i].holes.some(dentro)) return f[i].ax * x + f[i].ay * y + f[i].c;
    return null;
  }

  class CustomRoof {
    /**
     * @param {Array<THREE.Vector2|{x,y}|[x,y]>} verticesContorno  contorno do telhado (metros, plano da planta)
     * @param {number|string} inclinacao   graus (30) ou porcentagem ('45%')
     * @param {number} alturaBase          y onde o telhado começa (beiral)
     * @param {{material:string, formato:string, aguas?:number}} configuracaoTelha  ex.: { material: 'ceramica', formato: 'romana', aguas: 4 }
     * @param {object} [opcoes] { THREE, furos, facetas (já calculadas, ex.: com união) }
     */
    constructor(verticesContorno, inclinacao = 30, alturaBase = 2.8, configuracaoTelha = { material: 'ceramica', formato: 'romana' }, opcoes = {}) {
      this.THREE = opcoes.THREE || window.THREE;
      this.verticesContorno = verticesContorno; this.furos = opcoes.furos || [];
      this.inclinacao = inclinacao; this.alturaBase = alturaBase; this._facetas = opcoes.facetas || null;
      this.config = { material: configuracaoTelha.material, formato: configuracaoTelha.formato, aguas: configuracaoTelha.aguas || 2 };
      this.material = null; this.mesh = null; this._wire = false;
      this._init();
    }
    _arr(p) { return Array.isArray(p) ? p : [p.x, p.y]; }
    _rad(inc) { return radDe(inc); }

    _init() {
      const geo = this.buildGeometry();
      this.material = this._criarMaterial();
      this.mesh = new this.THREE.Mesh(geo, this.material);
      this.mesh.name = 'CustomRoof';
    }

    /** Triangula cada faceta (earcut). Posições: (x, alturaBase + ax·x + ay·y + c, y). UV em unidades de ladrilho: U = (p·t)/larguraLadrilho, V = (p·n / cos)/comprimentoLadrilho (n = morro acima, t = ao longo do beiral). */
    buildGeometry(facetas) {
      const T = this.THREE, inc = this._rad(this.inclinacao), cos = Math.max(0.2, Math.cos(inc));
      const fm = FORMATOS[this.config.formato] || FORMATOS.ondulada, mt = MATERIAIS[this.config.material] || MATERIAIS.ceramica, tam = mt.solar ? FORMATOS.plana.tam : fm.tam;
      facetas = facetas || this._facetas || facetasProprias(this.verticesContorno.map((p) => this._arr(p)), (this.furos || []).map((f) => f.map((p) => this._arr(p))), inc, this.config.aguas);
      const pos = [], uv = [], idx = [], V = (p) => new T.Vector2(p[0], p[1]);
      for (const f of facetas) {
        const pts = f.outer.concat(...f.holes), tris = T.ShapeUtils.triangulateShape(f.outer.map(V), f.holes.map((h) => h.map(V))), off = pos.length / 3;
        const L = Math.hypot(f.nx, f.ny) || 1, nx = f.nx / L, ny = f.ny / L, tx = -ny, ty = nx;
        pts.forEach((p) => {
          pos.push(p[0], this.alturaBase + f.ax * p[0] + f.ay * p[1] + f.c, p[1]);
          uv.push((p[0] * tx + p[1] * ty) / tam[0], ((p[0] * nx + p[1] * ny) / cos) / tam[1]);
        });
        tris.forEach((t) => idx.push(off + t[0], off + t[1], off + t[2]));
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      g.computeVertexNormals(); g.computeBoundingSphere();
      return g;
    }

    /** [89ª] MATERIAL COMPARTILHADO por (material, formato): todos os telhados iguais usam a MESMA instância (e as mesmas texturas) — uma só compilação de shader, uma só subida de textura à GPU,
     *  menos trocas de estado por quadro. As UVs já estão em unidades de ladrilho (repeat 1×1), então o material não depende do tamanho de cada telhado. Nunca é descartado por um telhado só. */
    _criarMaterial() {
      const T = this.THREE, key = MATERIAIS[this.config.material] ? this.config.material : 'ceramica', fmtKey = FORMATOS[this.config.formato] ? this.config.formato : 'ondulada';
      const real0 = !!CustomRoof.TRANSMISSAO_REAL; const ck = key + '|' + fmtKey + (real0 ? '|r' : ''); _matCache.set(T, _matCache.get(T) || {}); const C = _matCache.get(T);
      if (C[ck]) return C[ck];
      const m = MATERIAIS[key], base = gerarTexturas(T, key, fmtKey);
      const props = { color: 0xffffff, roughness: m.rugosidade, metalness: m.metal, side: T.DoubleSide, map: base.map, normalMap: base.normalMap };
      // Vidro/PET/fibra: por padrão translúcidos por OPACIDADE (barato). `CustomRoof.TRANSMISSAO_REAL = true` liga a transmissão física (refração por `ior`), que custa um passe extra de renderização da cena inteira.
      const real = real0 && m.transmissao;
      const mat = (m.verniz || real) ? new T.MeshPhysicalMaterial(props) : new T.MeshStandardMaterial(props);
      mat.normalScale = new T.Vector2(m.relevo, m.relevo);
      mat.transparent = m.opacidade != null && m.opacidade < 1; mat.opacity = m.opacidade != null ? m.opacidade : 1;
      if (mat.isMeshPhysicalMaterial) { mat.transmission = real ? m.transmissao : 0; mat.ior = m.ior || 1.45; mat.thickness = real ? (m.espessura || 0) : 0; mat.clearcoat = m.verniz || 0; mat.clearcoatRoughness = 0.08; }
      mat.userData.roofShared = true;
      return (C[ck] = mat);
    }
    /** Modo "fio" do 3D: material próprio (o compartilhado nunca é alterado). */
    setWireframe(cor) { const T = this.THREE; this.material = new T.MeshBasicMaterial({ color: cor, wireframe: true }); this.mesh.material = this.material; this._wire = true; }

    /** [89ª] Texturas/propriedades já vêm do material compartilhado (ver _criarMaterial): nada a clonar nem subir de novo. */
    _aplicarTexturas() { /* mantido por compatibilidade */ }

    /** [88ª] Troca material/formato: REGENERA a geometria (as UVs dependem do tamanho real do ladrilho do formato) — nova geometria antes de descartar a antiga — e as texturas. */
    setTileType(material, formato, aguas) {
      if (aguas && aguas !== this.config.aguas) this._facetas = null;
      this.config = { material, formato, aguas: aguas || this.config.aguas };
      if (!this._wire) { this.material = this._criarMaterial(); this.mesh.material = this.material; }   // troca para o material compartilhado do novo tipo (sem descartar o antigo)
      this._regerar();
    }
    _regerar() { const nova = this.buildGeometry(); this.mesh.geometry.dispose(); this.mesh.geometry = nova; }

    /** Edição do formato da casa / inclinação / águas / união: geometria nova ANTES de descartar a antiga (se falhar, a antiga fica), dispose() sem vazar VRAM. */
    updateGeometry(novosVertices, novaInclinacao, novosFuros = this.furos, novaAlturaBase, novasAguas, novasFacetas) {
      this.verticesContorno = novosVertices; this.furos = novosFuros;
      if (novaInclinacao != null) this.inclinacao = novaInclinacao;
      if (novaAlturaBase != null) this.alturaBase = novaAlturaBase;
      if (novasAguas != null) this.config.aguas = novasAguas;
      this._facetas = novasFacetas || null;
      this._regerar();
    }
    /** Alias de compatibilidade com o fluxo de edição de vértices do app (contorno, furos). */
    updateRoof(novosVertices, novosFuros, facetas) { this.updateGeometry(novosVertices, null, novosFuros, undefined, undefined, facetas); }
    setVisible(v) { if (this.mesh) this.mesh.visible = !!v; }
    getMesh() { return this.mesh; }
    dispose() { this.mesh.geometry.dispose(); if (this._wire) this.material.dispose(); }   // material/texturas compartilhados ficam no cache
  }
  CustomRoof.TRANSMISSAO_REAL = false;
  CustomRoof.MATERIAIS = MATERIAIS; CustomRoof.FORMATOS = FORMATOS; CustomRoof.AGUAS = AGUAS;
  CustomRoof.alturaNoPonto = alturaNoPonto; CustomRoof.facetasProprias = facetasProprias; CustomRoof.facetasDe = facetasDe; CustomRoof.membros = membros; CustomRoof.cfgDe = cfgDe;
  window.CustomRoof = CustomRoof;

  /* ───────────── desenho 2D (chamado por PisoCustom.draw2D com o ctx no centro do objeto): material, formato, divisões das águas e união ───────────── */
  const _esp = { ondulada: [0.10, 0], trapezoidal: [0.20, 0], romana: [0.20, 0.30], plana: [0.33, 0.20] };   // espaçamento das linhas ao longo / através da água (m)
  function caminho(ctx, f, z) { [f.outer].concat(f.holes).forEach((r) => { r.forEach((p, i) => { if (i) ctx.lineTo(p[0] * z, p[1] * z); else ctx.moveTo(p[0] * z, p[1] * z); }); ctx.closePath(); }); }
  CustomRoof.draw2D = function (ctx, obj, z, mapData, selected) {
    const cfg = cfgDe(obj), { facetas, juncoes } = facetasDe(obj, mapData), pp = window.PisoCustom.dados(obj), sp = _esp[cfg.formato] || _esp.ondulada;
    // 1) hachura do FORMATO (só se legível na escala atual)
    facetas.forEach((f) => {
      const L = Math.hypot(f.nx, f.ny) || 1, nx = f.nx / L, ny = f.ny / L, tx = -ny, ty = nx;
      let sMin = 1e9, sMax = -1e9, nMin = 1e9, nMax = -1e9; f.outer.forEach((p) => { const s = p[0] * tx + p[1] * ty, n = p[0] * nx + p[1] * ny; sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); nMin = Math.min(nMin, n); nMax = Math.max(nMax, n); });
      ctx.save(); ctx.beginPath(); caminho(ctx, f, z); ctx.clip('evenodd'); ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1; ctx.beginPath();
      if (sp[0] * z >= 3 && (sMax - sMin) / sp[0] < 400) for (let s = Math.ceil(sMin / sp[0]) * sp[0]; s <= sMax; s += sp[0]) { ctx.moveTo((tx * s + nx * nMin) * z, (ty * s + ny * nMin) * z); ctx.lineTo((tx * s + nx * nMax) * z, (ty * s + ny * nMax) * z); }
      if (sp[1] && sp[1] * z >= 3 && (nMax - nMin) / sp[1] < 400) for (let n = Math.ceil(nMin / sp[1]) * sp[1]; n <= nMax; n += sp[1]) { ctx.moveTo((tx * sMin + nx * n) * z, (ty * sMin + ny * n) * z); ctx.lineTo((tx * sMax + nx * n) * z, (ty * sMax + ny * n) * z); }
      ctx.stroke(); ctx.restore();
    });
    // 2) união: regiões onde outro telhado domina (laranja) — recortadas ao contorno deste
    if (juncoes.length) {
      ctx.save(); ctx.beginPath(); pp.contorno.forEach((p, i) => { if (i) ctx.lineTo(p[0] * z, p[1] * z); else ctx.moveTo(p[0] * z, p[1] * z); }); ctx.closePath(); ctx.clip();
      ctx.beginPath(); juncoes.forEach((r) => { r.forEach((p, i) => { if (i) ctx.lineTo(p[0] * z, p[1] * z); else ctx.moveTo(p[0] * z, p[1] * z); }); ctx.closePath(); });
      ctx.fillStyle = 'rgba(255,152,0,0.22)'; ctx.fill(); ctx.setLineDash([8, 4]); ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }
    // 3) linhas de divisão das águas (cumeeira/espigões/vales): arestas internas das facetas, tracejado claro sobre um fio escuro
    const dist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
    const aneis = [pp.contorno].concat(pp.furos), naBorda = (m) => aneis.some((r) => r.some((a, i) => dist(m, a, r[(i + 1) % r.length]) < 0.02));
    ctx.save(); ctx.beginPath();
    facetas.forEach((f) => [f.outer].concat(f.holes).forEach((r) => r.forEach((a, i) => { const b = r[(i + 1) % r.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (!naBorda(m)) { ctx.moveTo(a[0] * z, a[1] * z); ctx.lineTo(b[0] * z, b[1] * z); } })));
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3.5; ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.setLineDash([7, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    // 4) seta de caimento (morro abaixo) no centro de cada faceta
    facetas.forEach((f) => {
      if (!(Math.abs(f.ax) + Math.abs(f.ay) > 1e-9)) return;
      let cx = 0, cy = 0; f.outer.forEach((p) => { cx += p[0]; cy += p[1]; }); cx /= f.outer.length; cy /= f.outer.length;
      const L = Math.hypot(f.nx, f.ny) || 1, dx = -f.nx / L, dy = -f.ny / L, len = Math.max(9, Math.min(22, 0.5 * z)), X = cx * z, Y = cy * z;
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.6; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 2;
      ctx.beginPath(); ctx.moveTo(X - dx * len / 2, Y - dy * len / 2); ctx.lineTo(X + dx * len / 2, Y + dy * len / 2); ctx.stroke();
      const ex = X + dx * len / 2, ey = Y + dy * len / 2; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - dx * 5 - dy * 3.5, ey - dy * 5 + dx * 3.5); ctx.lineTo(ex - dx * 5 + dy * 3.5, ey - dy * 5 - dx * 3.5); ctx.closePath(); ctx.fill(); ctx.restore();
    });
    // 5) com união: contorno laranja grosso (salienta que este telhado faz parte de uma peça única)
    if (cfg.grupo) { ctx.save(); ctx.beginPath(); pp.contorno.forEach((p, i) => { if (i) ctx.lineTo(p[0] * z, p[1] * z); else ctx.moveTo(p[0] * z, p[1] * z); }); ctx.closePath(); ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore(); }
  };

  /* ───────────── integração com o catálogo: objeto 'telha' (contorno editável como o Piso: obj.pisoPoligono) ─────────────
   * obj.telha = { material, formato, inclinacao (graus), aguas (1–4), grupo (união) }  — padrão: cerâmica romana a 30°, 2 águas. Base do telhado = elevação do objeto. */
  const PC = window.PisoCustom;
  window.ObjectTypes.register('telha', {
    matchesMesh3D(obj) { return !!(obj && obj.tipo === 'telha'); },
    malhaPropria(obj) { return !!(obj && obj.tipo === 'telha'); },   // dados do 2D (contorno/retângulo + telha) > molde
    buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
      CustomRoof.TRANSMISSAO_REAL = !!(engine._config && engine._config.refracaoVidros3D);   // [90ª] opção das Configurações 3D (padrão: opacidade)
      const THREE = engine.THREE, pp = PC.dados(obj), c = cfgDe(obj), fac = facetasDe(obj, engine.mapData).facetas;
      const roof = new CustomRoof(pp.contorno, c.inclinacao, 0, { material: c.material, formato: c.formato, aguas: c.aguas }, { THREE, furos: pp.furos, facetas: fac });
      if (wireframe) roof.setWireframe(colWireframe);
      const mesh = roof.getMesh();
      mesh.position.set(obj.x, baseY, obj.y); mesh.rotation.y = -(obj.angulo || 0);
      engine._group.add(mesh);
      const pick = PC._pickDe(engine, mesh, obj, null);
      engine.pickables.push(pick); mesh.userData.pick = pick; mesh.userData.roof = roof; mesh.userData.telhaCfg = JSON.stringify(c);
      // adaptador para a edição de vértices (2D/3D): refaz as facetas (com a união) e troca só a geometria
      mesh.userData.pisoCustom = { updateVertices(ct, fu) { roof.updateGeometry(ct, null, fu, undefined, undefined, facetasDe(obj, engine.mapData).facetas); }, getMesh: () => mesh };
      engine._pickMeshes.push(mesh);
    },
  });
})();
