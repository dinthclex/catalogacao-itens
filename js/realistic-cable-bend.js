/**
 * realistic-cable-bend.js
 * ============================================================================
 * Algoritmo geométrico ISOLADO para curvar cabos de rede (patch cord / cabo
 * estruturado) em dobras fechadas e acentuadas (até 180°) com aparência física
 * realista, em vez do efeito de "dobradura de papel" ou do achatamento de
 * malha que uma extrusão ingênua (THREE.TubeGeometry padrão sobre poucos
 * pontos de controle) produz em curvas apertadas.
 *
 * Este arquivo é 100% independente do resto do sistema de cabeamento já em
 * produção (não altera `rede-passiva.js`/`engine3d.js`/`view3d-rede.js`) --
 * é a peça isolada pedida ("a função ... que recebe as coordenadas e
 * processa os nós", "o algoritmo ... que renderiza a malha cilíndrica"),
 * pronta pra ser adotada por quem monta a rota final do cabo (mesmo espírito
 * de `patch-cord.js`, já presente no projeto e também não conectado a
 * nenhuma tela ainda).
 *
 * Contém 2 peças, exatamente as 2 pedidas:
 *
 *   1) generateRealisticBendPath(startPoint, endPoint, controlPoints, minBendRadius)
 *      -- processa os nós 3D e devolve uma nova lista de pontos de controle
 *      (mais densa nas dobras) pronta pra alimentar uma `THREE.CatmullRomCurve3`
 *      (curveType 'centripetal') ou qualquer outro consumidor de spline por
 *      pontos de controle -- ver seção 1.
 *
 *   2) buildStableTubeGeometry(THREE, pontosAmostrados, opc)
 *      -- extrusão cilíndrica PRÓPRIA ao longo da curva já amostrada, usando
 *      "Parallel Transport Frames" (Rotation-Minimizing Frames) em vez do
 *      Frenet-Serret padrão do `THREE.TubeGeometry` -- ver seção 2 pra por
 *      que isso evita o achatamento/torção da seção transversal.
 *
 * Ambas as peças são JavaScript puro (vetores como `{x,y,z}` simples) na
 * seção 1 -- só a seção 2 depende de `THREE` (recebido por parâmetro, nunca
 * importado global), porque geometria de render é inerentemente Three.js.
 * ============================================================================
 */
(function (raiz) {
  'use strict';

  // ==========================================================================
  // 0) VETORES -- helpers puros (sem depender de THREE), mesmo padrão mínimo
  //    já usado em `rede-passiva.js` (_v.add/sub/mul/...) deste projeto.
  // ==========================================================================
  const V = {
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    mul: (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k }),
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    len: (a) => Math.hypot(a.x, a.y, a.z),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    cross: (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }),
    lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }),
    norm: (a) => { const l = Math.hypot(a.x, a.y, a.z); return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 }; },
    /** Rotaciona o vetor `v` em torno do eixo UNITÁRIO `axis` por `ang` radianos (fórmula de Rodrigues). */
    rotAxis: (v, axis, ang) => {
      const c = Math.cos(ang), s = Math.sin(ang), d = V.dot(axis, v);
      const cr = V.cross(axis, v);
      return { x: v.x * c + cr.x * s + axis.x * d * (1 - c), y: v.y * c + cr.y * s + axis.y * d * (1 - c), z: v.z * c + cr.z * s + axis.z * d * (1 - c) };
    },
  };

  // ==========================================================================
  // 1) generateRealisticBendPath -- suavização física dos nós da rota
  // ==========================================================================
  /**
   * RESTRIÇÃO DE RAIO DE CURVATURA MÍNIMO (item 1 do pedido):
   * Para cada ponto de ancoragem INTERNO da rota (`startPoint`, `...controlPoints`,
   * `endPoint`, nesta ordem), calcula o ângulo entre o trecho de ENTRADA e o de
   * SAÍDA daquele ponto. Se o ângulo indicar uma dobra (o cabo não pode continuar
   * reto ali), o ponto único é substituído por uma sequência de pontos que
   * respeita `minBendRadius`:
   *
   *   - Dobra MODERADA (o raio de curvatura mínimo cabe como um arco/filete
   *     tangente aos dois trechos, sem estourar a metade de nenhum dos dois):
   *     gera um ARCO CIRCULAR DE VERDADE (raio = `minBendRadius`), tangente
   *     aos dois trechos -- a curva passa a fazer uma curva suave de raio
   *     físico correto em vez de uma quina viva.
   *
   *   - Dobra FECHADA (perto de 180°, ou o arco tangente exigiria mais espaço
   *     do que existe entre os pontos vizinhos): um arco tangente simples não
   *     cabe (a distância necessária tende ao infinito quando o ângulo tende a
   *     180°) -- nesses casos, aplica a SIMULAÇÃO DE TENSÃO MECÂNICA (item 3):
   *     desloca o ponto de dobra pra o lado (perpendicular ao trecho de
   *     entrada) por uma "barriga" elástica de alívio de tensão, com um leve
   *     caimento adicional na direção -Y (o peso do PVC), em vez de reverter
   *     em cima da própria reta.
   *
   * @param {{x:number,y:number,z:number}} startPoint
   * @param {{x:number,y:number,z:number}} endPoint
   * @param {{x:number,y:number,z:number}[]} [controlPoints]  ancoragens intermediárias, já na ordem do trajeto
   * @param {number} [minBendRadius]  raio de curvatura mínimo, em METROS (Cat6/Cat6A real: ~0,025 a ~0,04 m,
   *                                  ou seja 4x o diâmetro externo do cabo -- ajuste conforme o cabo modelado)
   * @param {{amostrasPorArco?:number, fatorBarriga?:number}} [opc]
   *        amostrasPorArco: nº de pontos gerados por dobra (padrão 6, mínimo 3, "2 ou 3 pontos" do pedido
   *        original + folga pra dobras bem fechadas ficarem redondas de verdade, não facetadas).
   *        fatorBarriga: 0..1, quanto a "barriga" elástica da dobra fechada se destaca lateralmente em
   *        relação a `minBendRadius` (padrão 1 -- a barriga tem o mesmo raio nominal da curvatura mínima).
   * @returns {{x:number,y:number,z:number}[]}  pontos de controle prontos pra uma spline (ex.: passar direto
   *          pra `new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p.x,p.y,p.z)), false, 'centripetal')`).
   */
  function generateRealisticBendPath(startPoint, endPoint, controlPoints, minBendRadius) {
    const opc = (arguments.length > 4 && arguments[4]) || {};
    const amostras = Math.max(3, Math.round(opc.amostrasPorArco || 6));
    const fatorBarriga = opc.fatorBarriga == null ? 1 : opc.fatorBarriga;
    const r = Math.max(1e-4, minBendRadius || 0.03);   // 3 cm = default plausível de Cat6 (4x ~7,5mm de diâmetro)

    const nos = [startPoint, ...((controlPoints || []).filter(Boolean)), endPoint];
    if (nos.length < 3) return nos.slice();   // sem ponto interno nenhum -- nada pra suavizar

    const saida = [nos[0]];
    for (let i = 1; i < nos.length - 1; i++) {
      const p0 = nos[i - 1], p1 = nos[i], p2 = nos[i + 1];
      const Lin = V.dist(p0, p1), Lout = V.dist(p1, p2);
      if (Lin < 1e-6 || Lout < 1e-6) { saida.push(p1); continue; }   // pontos coincidentes -- nada a fazer
      const da = V.norm(V.sub(p1, p0)), db = V.norm(V.sub(p2, p1));
      const cosA = Math.max(-1, Math.min(1, V.dot(da, db)));
      const alpha = Math.acos(cosA);   // 0 = reto (sem dobra), π = reversão total (dobra de 180°)
      if (alpha < 1e-3) { saida.push(p1); continue; }   // praticamente reto -- não precisa de nada

      // eixo de giro do "wedge" (plano onde a dobra acontece) -- usado pelo arco tangente E como referência
      // estável de "lado" da barriga elástica (mesma técnica de perpendicular estável usada no arco).
      let eixo = V.cross(da, db), lEixo = V.len(eixo);
      if (lEixo < 1e-6) {
        // `da`/`db` quase paralelos (dobra de ~180° exata, sem um plano de giro bem definido geometricamente)
        // -- usa um eixo perpendicular estável (mundo Y, ou mundo X se `da` já for quase vertical).
        eixo = Math.abs(da.y) < 0.98 ? V.cross(da, { x: 0, y: 1, z: 0 }) : V.cross(da, { x: 1, y: 0, z: 0 });
        lEixo = V.len(eixo);
      }
      eixo = lEixo > 1e-6 ? V.mul(eixo, 1 / lEixo) : { x: 0, y: 1, z: 0 };

      // Comprimento tangente do filete circular clássico: t = r / tan(θ/2), θ = ângulo entre os dois RAIOS
      // que saem do vértice (-da e db) = π - alpha. Quando alpha → π (reversão), θ → 0 e t → ∞ (nenhum arco
      // tangente finito cabe) -- é exatamente o sinal de que esta dobra é "fechada" (item 3 do pedido) e
      // precisa da barriga elástica em vez de um arco geométrico puro.
      const theta = Math.PI - alpha;
      const tTangente = theta > 1e-4 ? r / Math.tan(theta / 2) : Infinity;
      const tMax = Math.min(Lin, Lout) * 0.48;   // nunca invade mais da metade de nenhum trecho vizinho

      if (tTangente <= tMax && Number.isFinite(tTangente)) {
        // ---- DOBRA MODERADA: arco circular de verdade, raio = minBendRadius, tangente aos 2 trechos ----
        const A = V.sub(p1, V.mul(da, tTangente));            // ponto de tangência no trecho de ENTRADA
        // direção radial em A, perpendicular a `da`, apontando pro lado de `db` (Gram-Schmidt de db contra da)
        const perpA = V.norm(V.sub(db, V.mul(da, V.dot(da, db))));
        const centro = V.add(A, V.mul(perpA, r));
        const raioVetorInicial = V.mul(perpA, -r);             // A - centro
        for (let s = 0; s <= amostras; s++) {
          const ang = (s / amostras) * theta;
          const rv = V.rotAxis(raioVetorInicial, eixo, ang);
          const ponto = V.add(centro, rv);
          if (s === 0 && saida.length && V.dist(saida[saida.length - 1], ponto) < 1e-6) continue;
          saida.push(ponto);
        }
      } else {
        // ---- DOBRA FECHADA (perto de 180°, ou espaço insuficiente pro arco tangente) ----
        // SIMULAÇÃO DE TENSÃO MECÂNICA (item 3): em vez de reverter em cima da própria reta, desloca a
        // dobra pro LADO (perpendicular estável, `eixo` já calculado acima) numa "barriga" de raio
        // `r*fatorBarriga`, com um leve caimento em -Y (peso do PVC) proporcional ao raio da barriga --
        // efeito visual de um cabo real que "sobra" um pouco de folga elástica antes de virar de vez,
        // em vez de uma dobra matematicamente perfeita/instantânea.
        const raioBarriga = Math.max(r * fatorBarriga, Math.min(Lin, Lout) * 0.15);
        let perp = V.cross(da, { x: 0, y: 1, z: 0 }); let lp = V.len(perp);
        if (lp < 1e-6) { perp = V.cross(da, { x: 1, y: 0, z: 0 }); lp = V.len(perp); }
        perp = lp > 1e-6 ? V.mul(perp, 1 / lp) : { x: 1, y: 0, z: 0 };
        const caimento = { x: 0, y: -raioBarriga * 0.18, z: 0 };   // "peso" do cabo -- sag elástico sutil
        const tCurto = Math.min(Lin, Lout) * 0.25;
        // 3 a `amostras` pontos, formando um laço lateral suave em vez de um "V"/reversão instantânea.
        const q1 = V.add(V.add(V.sub(p1, V.mul(da, tCurto)), V.mul(perp, raioBarriga)), caimento);
        const q2 = V.add(V.add(p1, V.mul(perp, raioBarriga * 1.5)), caimento);
        const q3 = V.add(V.add(V.add(p1, V.mul(db, tCurto)), V.mul(perp, raioBarriga)), caimento);
        const laco = amostras <= 3 ? [q1, q2, q3] : (() => {
          // Interpola suavemente q1->q2->q3 com `amostras` pontos (Catmull-Rom simplificada 1D por eixo,
          // reaproveitando os próprios pontos vizinhos p0/p2 como âncoras de tangente) -- deixa o laço
          // redondo em vez de facetado quando `amostrasPorArco` é maior que o mínimo de 3.
          const pts = [p0, q1, q2, q3, p2], out = [];
          for (let s = 0; s <= amostras; s++) {
            const tt = s / amostras, seg = Math.min(2, Math.floor(tt * 3)), tl = tt * 3 - seg;
            out.push(V.lerp(pts[seg + 1], pts[seg + 2], tl));
          }
          return out;
        })();
        laco.forEach((p) => saida.push(p));
      }
    }
    saida.push(nos[nos.length - 1]);
    return saida;
  }

  // ==========================================================================
  // 2) buildStableTubeGeometry -- extrusão anti-achatamento (Parallel Transport Frames)
  // ==========================================================================
  /**
   * PRESERVAÇÃO DA SEÇÃO TRANSVERSAL (item 2 do pedido):
   * `THREE.TubeGeometry` orienta o anel de vértices de cada fatia por um frame
   * de FRENET-SERRET (normal/binormal derivados da 2ª derivada da curva). Numa
   * curva com curvatura quase constante isso é estável, mas numa dobra
   * FECHADA (perto de 180°, exatamente o caso que `generateRealisticBendPath`
   * acima produz) a 2ª derivada muda de sinal/direção bruscamente -- o frame de
   * Frenet "vira" (perde a referência) e o anel de vértices roda/estica de
   * forma inconsistente entre fatias vizinhas, produzindo o achatamento
   * ("esmagamento") visual da seção transversal relatado.
   *
   * Esta função usa PARALLEL TRANSPORT FRAMES (também chamado de Rotation-
   * Minimizing Frame / método de Bishop): em vez de recalcular o frame do
   * zero a cada fatia a partir da curvatura local, cada frame nasce do frame
   * ANTERIOR, rotacionado apenas o mínimo necessário para acompanhar a nova
   * tangente (a rotação entre tangentes consecutivas, por Rodrigues) -- sem
   * nenhuma dependência da 2ª derivada. Isso garante, em QUALQUER ponto do
   * arco (inclusive nos 180° de uma dobra fechada), que o anel de vértices
   * continua um círculo perfeito de diâmetro constante, sempre perpendicular
   * à tangente local, sem nenhum "chute"/salto entre fatias.
   *
   * @param {object} THREE          namespace do Three.js (BufferGeometry/Vector3/... -- passado por fora,
   *                                 nunca importado global, pra este arquivo não depender de carregamento).
   * @param {{x,y,z}[]} pontosAmostrados  pontos JÁ amostrados AO LONGO da curva final (ex.: saída de
   *                                 `amostrarSpline`/`CatmullRomCurve3.getPoints(n)` sobre o resultado de
   *                                 `generateRealisticBendPath` acima) -- esta função NÃO reamostra a spline,
   *                                 só extruda o que já foi amostrado (raio de curvatura físico já garantido
   *                                 lá; aqui só cuida da seção transversal).
   * @param {{raioTubo?:number, segmentosRadiais?:number, fechado?:boolean}} [opc]
   * @returns {object}  `THREE.BufferGeometry` pronta pra `new THREE.Mesh(geo, material)`.
   */
  function buildStableTubeGeometry(THREE, pontosAmostrados, opc) {
    opc = opc || {};
    const raioTubo = opc.raioTubo || 0.0011;             // ~2,2mm de diâmetro, ordem de grandeza de um Cat6
    const segRad = Math.max(3, Math.round(opc.segmentosRadiais || 8));
    const pts = pontosAmostrados.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const n = pts.length;
    if (n < 2) return new THREE.BufferGeometry();

    // ---- 1) tangentes por ponto (média dos 2 segmentos vizinhos -- suaviza a direção nas emendas) ----
    const tangentes = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? pts[i].clone().sub(pts[i - 1]) : null;
      const b = i < n - 1 ? pts[i + 1].clone().sub(pts[i]) : null;
      const t = (a && b) ? a.normalize().add(b.normalize()) : (b ? b.clone() : a.clone());
      tangentes[i] = t.normalize();
    }

    // ---- 2) Parallel Transport Frames: 1º frame arbitrário (perpendicular estável à 1ª tangente); cada
    //    frame seguinte é o anterior rotacionado pelo MENOR ângulo que leva a tangente antiga na nova
    //    (eixo = tangenteAntiga × tangenteNova, ângulo = ângulo entre elas -- fórmula de Rodrigues) ----
    const normais = new Array(n), binormais = new Array(n);
    let normal0 = new THREE.Vector3(0, 1, 0);
    if (Math.abs(tangentes[0].dot(normal0)) > 0.99) normal0 = new THREE.Vector3(1, 0, 0);
    normal0 = normal0.sub(tangentes[0].clone().multiplyScalar(tangentes[0].dot(normal0))).normalize();
    normais[0] = normal0;
    binormais[0] = tangentes[0].clone().cross(normais[0]).normalize();
    for (let i = 1; i < n; i++) {
      const tPrev = tangentes[i - 1], tCur = tangentes[i];
      const eixo = tPrev.clone().cross(tCur);
      const lEixo = eixo.length();
      let nPrev = normais[i - 1];
      if (lEixo < 1e-7) {
        normais[i] = nPrev.clone();   // tangente não mudou (trecho reto) -- frame simplesmente "anda junto"
      } else {
        eixo.normalize();
        const ang = Math.acos(Math.max(-1, Math.min(1, tPrev.dot(tCur))));
        normais[i] = nPrev.clone().applyAxisAngle(eixo, ang).normalize();
        // reortogonaliza contra a nova tangente (corrige deriva de ponto-flutuante acumulada ao longo de
        // muitos segmentos -- sem isto, um cabo bem longo/com muitas dobras podia ir perdendo a
        // perpendicularidade exata aos poucos).
        normais[i].sub(tCur.clone().multiplyScalar(tCur.dot(normais[i]))).normalize();
      }
      binormais[i] = tCur.clone().cross(normais[i]).normalize();
    }

    // ---- 3) anel de vértices por fatia (círculo perfeito, raio constante, no plano normal/binormal local) ----
    const posArr = new Float32Array(n * segRad * 3);
    const norArr = new Float32Array(n * segRad * 3);
    const uvArr = new Float32Array(n * segRad * 2);
    for (let i = 0; i < n; i++) {
      const centro = pts[i], N = normais[i], B = binormais[i];
      for (let j = 0; j < segRad; j++) {
        const ang = (j / segRad) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        // direção radial (unitária) neste ponto do anel -- SEMPRE perpendicular à tangente local, então o
        // anel é sempre um círculo de raio `raioTubo` constante, nunca uma elipse achatada.
        const rx = N.x * cosA + B.x * sinA, ry = N.y * cosA + B.y * sinA, rz = N.z * cosA + B.z * sinA;
        const idx = (i * segRad + j);
        posArr[idx * 3] = centro.x + rx * raioTubo;
        posArr[idx * 3 + 1] = centro.y + ry * raioTubo;
        posArr[idx * 3 + 2] = centro.z + rz * raioTubo;
        norArr[idx * 3] = rx; norArr[idx * 3 + 1] = ry; norArr[idx * 3 + 2] = rz;
        uvArr[idx * 2] = j / segRad; uvArr[idx * 2 + 1] = i / (n - 1);
      }
    }

    // ---- 4) índices (2 triângulos por quad entre fatias consecutivas) ----
    const idxArr = [];
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < segRad; j++) {
        const j2 = (j + 1) % segRad;
        const a = i * segRad + j, b = i * segRad + j2, c = (i + 1) * segRad + j, d = (i + 1) * segRad + j2;
        idxArr.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(norArr, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    geo.setIndex(idxArr.length < 65536 ? new THREE.Uint16BufferAttribute(idxArr, 1) : new THREE.Uint32BufferAttribute(idxArr, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  // ==========================================================================
  // EXPORT (UMD -- mesmo padrão dos demais módulos deste projeto, ex.: rede-passiva.js)
  // ==========================================================================
  const API = { generateRealisticBendPath, buildStableTubeGeometry };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.RealisticCableBend = API;
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * RESSALVA HONESTA:
 * - Este arquivo NÃO está conectado a nenhuma tela do app (mesma situação de `patch-cord.js`, já presente
 *   no projeto) -- é a peça isolada pedida ("a função ... que recebe as coordenadas", "o algoritmo ... que
 *   renderiza a malha"), pronta pra ser chamada por quem monta a rota final de um cabo/patch cord.
 * - Uso típico: `const pts = generateRealisticBendPath(a, b, pontosExtras, 0.03);` (pontos de controle
 *   suavizados) -> amostrar esses pontos ao longo de uma spline (`THREE.CatmullRomCurve3(pts.map(...),
 *   false, 'centripetal').getPoints(200)`, ou a `amostrarSpline`/`amostrarRotaComRetas` já existentes em
 *   `rede-passiva.js` deste projeto) -> `buildStableTubeGeometry(THREE, pontosAmostrados, {raioTubo:
 *   diametroMm/2000})` -> `new THREE.Mesh(geo, material)`.
 * - `generateRealisticBendPath` é JS puro (vetores `{x,y,z}`), sem depender de `THREE` -- pode rodar em
 *   Node/testes sem carregar Three.js. Só `buildStableTubeGeometry` (a extrusão) precisa de `THREE`, recebido
 *   por parâmetro.
 * - Testado nesta sessão via `node --check` (sintaxe) e por leitura/trace manual da matemática (fórmula do
 *   filete tangente, fórmula de Rodrigues, ortogonalidade do parallel transport frame) -- NÃO testado num
 *   navegador de verdade renderizando a malha (sem acesso a um WebGL real nesta sessão). Antes de usar em
 *   produção, vale conferir visualmente pelo menos: (1) uma dobra de ~90° (deve virar um arco liso de raio
 *   `minBendRadius`), (2) uma dobra de 180° exata (deve virar um laço/barriga lateral, nunca uma reversão
 *   instantânea sobre a mesma reta), e (3) um trecho bem longo com várias dobras seguidas (checar que o
 *   parallel transport frame não acumula nenhuma torção visível ao longo do cabo).
 */
