/* js/polybool2d.js — [76ª rodada] Subtração de polígonos 2D (contorno − recortes/furos), sem dependências (o app roda offline em file:///).
 * Usado pelo Piso editável (js/objecttypes/piso-custom.js): um recorte (furo) que cruza a borda do piso vira um ENTALHE (ex.: cortar o canto para encaixar um pilar/viga);
 * um recorte totalmente interno continua sendo um furo. Algoritmo: Greiner–Hormann (interseções + marcação entrada/saída) com os recortes levemente "inflados" (0,1 mm)
 * para que bordas coincidentes/colineares com a borda do piso (o caso normal de um canto alinhado) virem cruzamentos transversais, sem casos degenerados.
 *
 * API:  PolyBool2D.diferenca(contorno, cortes) -> [{ outer: [[x,y]...], holes: [[[x,y]...], ...] }, ...]
 *       (contorno e cortes = anéis simples [[x,y],...] sem repetir o 1º ponto; devolve 0..n regiões com furos). Em caso de falha numérica devolve null.
 *       PolyBool2D.area(anel) -> área com sinal. */
(function () {
  'use strict';
  const EPS_INFLAR = 1e-4; // 0,1 mm

  function area(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

  function dentro(px, py, r) { // ponto no anel (par-ímpar)
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if (((a[1] > py) !== (b[1] > py)) && (px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
    }
    return c;
  }

  /** Infla o anel por `e` metros (miter limitado), qualquer orientação. */
  function inflar(r, e) {
    const n = r.length, s = area(r) >= 0 ? 1 : -1, out = [];
    for (let i = 0; i < n; i++) {
      const a = r[(i + n - 1) % n], b = r[i], c = r[(i + 1) % n];
      let d1x = b[0] - a[0], d1y = b[1] - a[1], d2x = c[0] - b[0], d2y = c[1] - b[1];
      const l1 = Math.hypot(d1x, d1y) || 1, l2 = Math.hypot(d2x, d2y) || 1;
      d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
      // normais para FORA (anel anti-horário => normal = (dy, -dx))
      const n1x = s * d1y, n1y = -s * d1x, n2x = s * d2y, n2y = -s * d2x;
      let mx = n1x + n2x, my = n1y + n2y; const ml = Math.hypot(mx, my);
      if (ml < 1e-9) { out.push([b[0] + n1x * e, b[1] + n1y * e]); continue; }
      mx /= ml; my /= ml;
      const k = Math.min(3, 1 / Math.max(1e-6, mx * n1x + my * n1y));
      out.push([b[0] + mx * e * k, b[1] + my * e * k]);
    }
    return out;
  }

  function lista(r) {
    const vs = r.map((p) => ({ x: p[0], y: p[1], intersect: false, alpha: 0, entry: false, processed: false, neighbour: null, next: null, prev: null }));
    vs.forEach((v, i) => { v.next = vs[(i + 1) % vs.length]; v.prev = vs[(i + vs.length - 1) % vs.length]; });
    return vs;
  }
  function inserir(de, ate, iv) { // entre `de` e `ate` (vértices originais consecutivos), ordenado por alpha
    let c = de.next;
    while (c !== ate && c.intersect && c.alpha < iv.alpha) c = c.next;
    iv.next = c; iv.prev = c.prev; c.prev.next = iv; c.prev = iv;
  }

  /** Greiner–Hormann. (srcFwd, clipFwd): união (false,false), interseção (true,true), A−B (false,true). Devolve array de anéis, ou null se degenerar. */
  function gh(A, B, srcFwd, clipFwd) {
    const S = lista(A), C = lista(B); let n = 0;
    for (let i = 0; i < S.length; i++) {
      const p0 = S[i], p1 = S[(i + 1) % S.length];
      for (let j = 0; j < C.length; j++) {
        const q0 = C[j], q1 = C[(j + 1) % C.length];
        const d = (q1.y - q0.y) * (p1.x - p0.x) - (q1.x - q0.x) * (p1.y - p0.y);
        if (Math.abs(d) < 1e-14) continue;
        const ua = ((q1.x - q0.x) * (p0.y - q0.y) - (q1.y - q0.y) * (p0.x - q0.x)) / d;
        const ub = ((p1.x - p0.x) * (p0.y - q0.y) - (p1.y - p0.y) * (p0.x - q0.x)) / d;
        if (ua <= 0 || ua >= 1 || ub <= 0 || ub >= 1) continue;
        const x = p0.x + ua * (p1.x - p0.x), y = p0.y + ua * (p1.y - p0.y);
        const a = { x, y, intersect: true, alpha: ua, entry: false, processed: false, neighbour: null, next: null, prev: null };
        const b = { x, y, intersect: true, alpha: ub, entry: false, processed: false, neighbour: null, next: null, prev: null };
        a.neighbour = b; b.neighbour = a;
        inserir(p0, p1, a); inserir(q0, q1, b); n++;
      }
    }
    if (n === 0) return 'sem-cruzamento';
    if (n % 2) return null;
    srcFwd = srcFwd !== dentro(A[0][0], A[0][1], B);
    clipFwd = clipFwd !== dentro(B[0][0], B[0][1], A);
    const marca = (v0, fwd) => { let v = v0; do { if (v.intersect) { v.entry = fwd; fwd = !fwd; } v = v.next; } while (v !== v0); };
    marca(S[0], srcFwd); marca(C[0], clipFwd);
    // percorre
    const todos = []; { let v = S[0]; do { if (v.intersect) todos.push(v); v = v.next; } while (v !== S[0]); }
    const rings = [];
    for (const ini of todos) {
      if (ini.processed) continue;
      const ring = []; let cur = ini, guarda = 0;
      do {
        cur.processed = true; if (cur.neighbour) cur.neighbour.processed = true;
        ring.push([cur.x, cur.y]);
        if (cur.entry) { do { cur = cur.next; ring.push([cur.x, cur.y]); if (++guarda > 100000) return null; } while (!cur.intersect); }
        else { do { cur = cur.prev; ring.push([cur.x, cur.y]); if (++guarda > 100000) return null; } while (!cur.intersect); }
        cur = cur.neighbour;
      } while (cur && !cur.processed);
      ring.pop(); // o último repete o ponto inicial
      const lim = [];
      ring.forEach((p) => { const q = lim[lim.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) lim.push(p); });
      if (lim.length >= 3 && Math.abs(area(lim)) > 1e-10) rings.push(lim);
    }
    return rings;
  }

  /** A − B para anéis simples. Devolve { tipo:'anel', rings } | { tipo:'vazio' } | { tipo:'intacto' } | { tipo:'furo' } (B inteiro dentro de A) | null. */
  function sub(A, B) {
    const r = gh(A, B, false, true);
    if (r === null) return null;
    if (r === 'sem-cruzamento') {
      if (dentro(B[0][0], B[0][1], A)) return { tipo: 'furo' };
      if (dentro(A[0][0], A[0][1], B)) return { tipo: 'vazio' };
      return { tipo: 'intacto' };
    }
    return { tipo: 'anel', rings: r };
  }

  /** união de A e B (simples); se não se cruzam e nenhum contém o outro, devolve null no campo `rings` (disjuntos). */
  function uniao(A, B) {
    const r = gh(A, B, false, false);
    if (r === null) return null;
    if (r === 'sem-cruzamento') {
      if (dentro(B[0][0], B[0][1], A)) return [A];
      if (dentro(A[0][0], A[0][1], B)) return [B];
      return [A, B];
    }
    // maior anel = contorno externo da união (anéis menores seriam ilhas/furos internos — descartados: a ilha entra no recorte)
    r.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    return r.length ? [r[0]] : [A, B];
  }

  function diferenca(contorno, cortes) {
    // se um caso degenerado escapar, tenta de novo com a inflação ×3 e ×9 (continua sub-milimétrico)
    for (const k of [1, 3, 9]) { const r = diferenca1(contorno, cortes, k); if (r) return r; }
    return null;
  }
  function diferenca1(contorno, cortes, mult) {
    try {
      // cada recorte é inflado por um valor ligeiramente DIFERENTE: bordas coincidentes entre recortes (ou com o contorno) deixam de ser colineares.
      let cs = (cortes || []).filter((c) => c && c.length >= 3).map((c, i) => inflar(c, EPS_INFLAR * mult * (1 + 0.31 * i + 0.07 * i * i)));
      // funde recortes que se sobrepõem (ficam disjuntos entre si)
      let mudou = true, guarda = 0;
      while (mudou && guarda++ < 50) {
        mudou = false;
        for (let i = 0; i < cs.length && !mudou; i++) for (let j = i + 1; j < cs.length && !mudou; j++) {
          const u = uniao(cs[i], cs[j]); if (u === null) return null;
          if (u.length === 1) { cs.splice(j, 1); cs.splice(i, 1, u[0]); mudou = true; }
        }
      }
      let faces = [{ outer: contorno.map((p) => [p[0], p[1]]), holes: [] }];
      const internos = [];
      for (const K of cs) {
        const novas = []; let interno = false;
        for (const f of faces) {
          const r = sub(f.outer, K); if (r === null) return null;
          if (r.tipo === 'intacto') novas.push(f);
          else if (r.tipo === 'vazio') { /* face engolida */ }
          else if (r.tipo === 'furo') { novas.push(f); interno = true; }
          else r.rings.forEach((ring) => novas.push({ outer: ring, holes: [] }));
        }
        faces = novas; if (interno) internos.push(K);
      }
      internos.forEach((K) => { const f = faces.find((x) => dentro(K[0][0], K[0][1], x.outer)); if (f) f.holes.push(K); });
      return faces;
    } catch (err) { return null; }
  }

  window.PolyBool2D = { diferenca, area, inflar };
  if (typeof module !== 'undefined') module.exports = window.PolyBool2D;
})();
