/**
 * perspmatch-math.js — Núcleo matemático/algorítmico da ferramenta
 * "📐 Camera Match" (Camera Matching / Calibração de câmera por perspectiva).
 *
 * [10/09/2026] Implementação da spec 'Camera Matching / Persp Match'
 * solicitada pelo usuário (documento salvo no projeto Claude:
 * 'spec-camera-matching-persp-match.md', seções 2 "Pipeline Matemático" e 4
 * "Tratamento de Erros"). Este arquivo é PURO (nenhuma manipulação de DOM,
 * nenhuma leitura de `window.DB`/`Mapping`) de propósito — só recebe números/
 * THREE.Vector3/THREE.Plane e devolve números, pra poder ser testado e
 * raciocinado sobre isoladamente. A parte de UI/estado de sessão/persistência
 * fica em js/perspmatch.js (que USA este módulo).
 *
 * Depende só de `window.THREE` (já carregado pelo motor 3D, ver engine3d.js)
 * — carregado como <script> clássico, sem nenhum bundler, igual todo o resto
 * do app (ver comentário grande em index.html sobre carregamento sob
 * file:///). Nenhuma dependência externa nova: o leitor de EXIF abaixo é
 * escrito à mão (TIFF/EXIF é um formato binário simples o bastante pra não
 * precisar de uma biblioteca só pra ler ~6 campos).
 */

const PerspMatchMath = {

  // ======================================================================
  // 2.1 — EXIF mínimo (leitor escrito à mão, sem biblioteca externa)
  // ======================================================================

  /** Acha o início do cabeçalho TIFF dentro do segmento APP1 ("Exif\0\0...")
   *  de um JPEG. `dataView` sobre o ArrayBuffer bruto do arquivo. Devolve o
   *  offset (bytes, a partir do início do arquivo) onde o TIFF começa, ou
   *  `null` se não for um JPEG ou não tiver segmento APP1/Exif nenhum (caso
   *  MUITO comum — ver spec §4 "Foto sem EXIF"). Não lança exceção nunca:
   *  qualquer achado de estrutura inesperada só faz devolver `null` (EXIF
   *  ausente/inutilizável é tratado como caso normal, não erro). */
  _findApp1ExifOffset(dataView) {
    try {
      if (dataView.byteLength < 4 || dataView.getUint16(0) !== 0xFFD8) return null; // assinatura JPEG
      let offset = 2;
      const len = dataView.byteLength;
      while (offset + 4 <= len) {
        if (dataView.getUint8(offset) !== 0xFF) break;
        const marker = dataView.getUint8(offset + 1);
        // SOI/EOI (D8/D9), RSTn (D0-D7) e TEM (01) não têm campo de tamanho.
        if (marker === 0xD8 || marker === 0xD9 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
          offset += 2;
          continue;
        }
        if (marker === 0xDA) break; // Start Of Scan — dados de imagem começam aqui, sem mais metadados relevantes antes
        if (offset + 4 > len) break;
        const segLen = dataView.getUint16(offset + 2);
        if (marker === 0xE1 && offset + 8 <= len) {
          const sig = String.fromCharCode(
            dataView.getUint8(offset + 4), dataView.getUint8(offset + 5), dataView.getUint8(offset + 6),
            dataView.getUint8(offset + 7), dataView.getUint8(offset + 8) || 0,
          );
          if (sig.slice(0, 4) === 'Exif') return offset + 4 + 6; // pula "Exif\0\0" (6 bytes)
        }
        offset += 2 + segLen;
      }
    } catch (e) { /* arquivo truncado/corrompido — trata como "sem EXIF", nunca quebra o import da foto */ }
    return null;
  },

  /** Lê os campos EXIF relevantes (spec §2.1) a partir de um ArrayBuffer de
   *  imagem JPEG. Devolve `null` se não achar EXIF utilizável — quem chama
   *  (js/perspmatch.js) cai pro FoV padrão (60°) nesse caso, exatamente como
   *  a spec pede. Campos: `focalLength35mm` (o mais confiável, já normalizado
   *  pro crop factor), `focalLengthMm` (focal real, sem conversão de sensor —
   *  ver nota abaixo), `orientation` (tag EXIF Orientation, 1-8), `make`,
   *  `model`. NÃO lê `FocalPlaneXResolution`/sensor size (spec §2.1 caminho
   *  alternativo quando `FocalLengthIn35mmFilm` está ausente): exigiria uma
   *  tabela de tamanhos de sensor por modelo de câmera que este parser
   *  mínimo não tem — documentado como limitação da v1 (ver relatório final);
   *  nesse caso específico (tem `FocalLength` mas não tem o 35mm) o app cai
   *  pro padrão (60°) em vez de arriscar uma conversão errada. */
  readExif(arrayBuffer) {
    const dv = new DataView(arrayBuffer);
    const tiffStart = this._findApp1ExifOffset(dv);
    if (tiffStart === null || tiffStart + 8 > dv.byteLength) return null;
    try {
      const bom = dv.getUint16(tiffStart);
      if (bom !== 0x4949 && bom !== 0x4D4D) return null; // nem 'II' nem 'MM' — TIFF inválido
      const little = bom === 0x4949;
      const get16 = (o) => dv.getUint16(o, little);
      const get32 = (o) => dv.getUint32(o, little);
      const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8 };

      const readIFD = (ifdRelOffset) => {
        const ifdAbs = tiffStart + ifdRelOffset;
        if (ifdAbs + 2 > dv.byteLength) return { entries: {} };
        const count = get16(ifdAbs);
        const entries = {};
        for (let i = 0; i < count; i++) {
          const entryOff = ifdAbs + 2 + i * 12;
          if (entryOff + 12 > dv.byteLength) break;
          const tag = get16(entryOff);
          const type = get16(entryOff + 2);
          const numValues = get32(entryOff + 4);
          const typeSize = TYPE_SIZE[type] || 1;
          const totalSize = typeSize * numValues;
          const valueFieldOff = entryOff + 8;
          const dataOff = totalSize > 4 ? (tiffStart + get32(valueFieldOff)) : valueFieldOff;
          if (dataOff < 0 || dataOff + totalSize > dv.byteLength) continue;
          let value = null;
          if (type === 3) { // SHORT
            value = numValues === 1 ? get16(dataOff) : Array.from({ length: numValues }, (_, k) => get16(dataOff + k * 2));
          } else if (type === 4) { // LONG
            value = numValues === 1 ? get32(dataOff) : Array.from({ length: numValues }, (_, k) => get32(dataOff + k * 4));
          } else if (type === 5) { // RATIONAL (unsigned)
            const readRat = (o) => { const n = get32(o), d = get32(o + 4); return d ? n / d : 0; };
            value = numValues === 1 ? readRat(dataOff) : Array.from({ length: numValues }, (_, k) => readRat(dataOff + k * 8));
          } else if (type === 10) { // SRATIONAL (assinado) — usado por alguns campos GPS/exposição, não pelos 6 que lemos, mas suportado por completude
            const readSRat = (o) => { const n = dv.getInt32(o, little), d = dv.getInt32(o + 4, little); return d ? n / d : 0; };
            value = numValues === 1 ? readSRat(dataOff) : Array.from({ length: numValues }, (_, k) => readSRat(dataOff + k * 8));
          } else if (type === 2) { // ASCII
            let s = '';
            for (let k = 0; k < numValues - 1; k++) s += String.fromCharCode(dv.getUint8(dataOff + k));
            value = s;
          }
          entries[tag] = value;
        }
        return { entries };
      };

      const ifd0Offset = get32(tiffStart + 4);
      const ifd0 = readIFD(ifd0Offset);
      let exifEntries = {};
      const exifIfdPtr = ifd0.entries[0x8769]; // ExifIFD pointer (relativo ao início do TIFF)
      if (typeof exifIfdPtr === 'number') exifEntries = readIFD(exifIfdPtr).entries;

      const focalLength35mm = typeof exifEntries[0xA405] === 'number' ? exifEntries[0xA405] : null;
      const focalLengthMm = typeof exifEntries[0x920A] === 'number' ? exifEntries[0x920A] : null;
      const make = typeof ifd0.entries[0x010F] === 'string' ? ifd0.entries[0x010F].trim() : null;
      const model = typeof ifd0.entries[0x0110] === 'string' ? ifd0.entries[0x0110].trim() : null;
      const orientation = typeof ifd0.entries[0x0112] === 'number' ? ifd0.entries[0x0112] : 1;

      if (!focalLength35mm && !focalLengthMm) return null; // EXIF existe mas sem nenhum dado de focal utilizável
      return { focalLength35mm, focalLengthMm, sensorWidthMm: null, make, model, orientacao: orientation };
    } catch (e) {
      return null; // qualquer estrutura inesperada -> trata como "sem EXIF" (nunca quebra o fluxo)
    }
  },

  /** FoV inicial a partir do EXIF (spec §2.1 fórmulas) ou padrão configurável
   *  quando ausente/inutilizável. `imgWidthPx/imgHeightPx` SEMPRE vêm das
   *  dimensões reais do arquivo decodificado (nunca só do EXIF — ver nota da
   *  spec: EXIF pode estar desatualizado se a imagem foi recortada). */
  computeFovFromExif(exif, imgWidthPx, imgHeightPx, fovPadraoDeg = 60) {
    const aspect = imgWidthPx / Math.max(1, imgHeightPx);
    if (exif && exif.focalLength35mm && exif.focalLength35mm > 0) {
      const fovH = 2 * Math.atan(36 / (2 * exif.focalLength35mm));
      const fovV = 2 * Math.atan(Math.tan(fovH / 2) / aspect);
      return { fovHDeg: fovH * 180 / Math.PI, fovVDeg: fovV * 180 / Math.PI, fonteFov: 'exif' };
    }
    // Sem `focalLength35mm` utilizável (ausente, ou só `focalLength` sem dado
    // de sensor pra converter — ver nota grande em readExif) -> padrão,
    // marcado 'padrao' pra UI avisar "não confiável" (spec §4).
    const fovH = fovPadraoDeg * Math.PI / 180;
    const fovV = 2 * Math.atan(Math.tan(fovH / 2) / aspect);
    return { fovHDeg: fovPadraoDeg, fovVDeg: fovV * 180 / Math.PI, fonteFov: 'padrao' };
  },

  /** [10/09/2026] NOVO — pedido verbatim do usuário: "No objeto câmera e no
   *  'orb da foto' deve ser possível definir as propriedades da câmera tanto
   *  no 2D quanto no 3D. São as mesmas do Blender." Blender mantém Lens >
   *  Focal Length (mm) e o FOV sempre SINCRONIZADOS (editar um recalcula o
   *  outro), dados o par (distância focal, largura do sensor) — mesmo modelo
   *  pinhole de `computeFovFromExif` acima, só que parametrizado pela largura
   *  de sensor REAL configurada pelo usuário (Blender default: 36mm/"Full
   *  Frame"), não fixa em 36mm. FoV devolvido é HORIZONTAL, em graus — quem
   *  chama decide se usa direto (convenção `cam.fov`/`fov` deste app, ver
   *  js/mapping.js addCamera) ou converte pra vertical (aspect) se precisar.
   *  `null` em qualquer entrada inválida (nunca lança, quem chama decide o
   *  fallback). */
  fovDegFromFocalLength(focalMm, sensorWidthMm) {
    if (!(focalMm > 0) || !(sensorWidthMm > 0)) return null;
    const fovH = 2 * Math.atan(sensorWidthMm / (2 * focalMm));
    return fovH * 180 / Math.PI;
  },

  /** Inverso de `fovDegFromFocalLength` — usado quando o campo editado é o
   *  FoV (°) em vez da focal (mm), pra recalcular a focal e manter os dois
   *  campos sincronizados (mesmo espírito do Blender). `fovDeg` deve ser
   *  < 180° (senão a tangente diverge — fisicamente sem sentido pra uma
   *  lente pinhole de qualquer forma). */
  focalLengthFromFovDeg(fovDeg, sensorWidthMm) {
    if (!(fovDeg > 0) || fovDeg >= 180 || !(sensorWidthMm > 0)) return null;
    const fovH = fovDeg * Math.PI / 180;
    return sensorWidthMm / (2 * Math.tan(fovH / 2));
  },

  // ======================================================================
  // 2.2 — Pontos de fuga: interseção de retas, Caprile–Torre, orientação
  // ======================================================================

  /** Interseção de 2 retas 2D definidas por pares de pontos (p1,p2) e
   *  (p3,p4) — fórmula exata da spec §2.2. Devolve `null` quando as retas são
   *  quase paralelas entre si (denominador perto de zero — resultado
   *  numericamente instável, spec §4 "pontos de fuga quase paralelos"). */
  lineIntersection(p1, p2, p3, p4) {
    const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(denom) < 1e-6) return null;
    const a = p1.x * p2.y - p1.y * p2.x;
    const b = p3.x * p4.y - p3.y * p4.x;
    const x = (a * (p3.x - p4.x) - (p1.x - p2.x) * b) / denom;
    const y = (a * (p3.y - p4.y) - (p1.y - p2.y) * b) / denom;
    return { x, y };
  },

  /** Ponto de fuga de UMA "linha-guia" (par de segmentos marcados paralelos
   *  no mundo real) — usa o ponto médio dos dois segmentos como par de retas
   *  pra `lineIntersection`. `segmentos` = [[{u,v},{u,v}], [{u,v},{u,v}]]
   *  (mesmo formato de `linhasDeFuga[].segmentos` na sessão, seção 3 da
   *  spec). */
  vanishingPointFromSegments(segmentos) {
    if (!segmentos || segmentos.length !== 2) return null;
    const [[p1, p2], [p3, p4]] = segmentos;
    return this.lineIntersection(p1, p2, p3, p4);
  },

  /** Ângulo (graus) entre as direções PRINCIPAL->VP1 e PRINCIPAL->VP2 — usado
   *  pra detectar 2 pontos de fuga "quase na mesma direção" (spec §4:
   *  "detectar isso comparando o ângulo entre as duas direções... se abaixo
   *  de um limiar (~15°), rejeitar"). Aqui a comparação é feita a partir do
   *  ponto principal (equivalente, em espírito, à "direção média dos
   *  segmentos" da spec: ambos os pontos de fuga, vistos a partir do centro
   *  óptico, são a mesma grandeza que o cálculo de Caprile–Torre usa logo
   *  abaixo — reaproveitar o mesmo vetor evita 2 definições de "direção"
   *  divergentes dentro do mesmo pipeline). */
  vpSeparationAngleDeg(vp1, vp2, principalPoint) {
    const d1x = vp1.x - principalPoint.x, d1y = vp1.y - principalPoint.y;
    const d2x = vp2.x - principalPoint.x, d2y = vp2.y - principalPoint.y;
    const m1 = Math.hypot(d1x, d1y), m2 = Math.hypot(d2x, d2y);
    if (!m1 || !m2) return 0;
    let cos = (d1x * d2x + d1y * d2y) / (m1 * m2);
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos) * 180 / Math.PI;
  },

  /** Distância focal em PIXELS a partir de 2 pontos de fuga ORTOGONAIS (spec
   *  §2.2, método de Caprile–Torre): `f² = -(VP1-pp)·(VP2-pp)`. Devolve
   *  `null` quando o resultado seria imaginário (f² <= 0) — acontece quando
   *  os 2 "pontos de fuga" marcados não são geometricamente compatíveis com
   *  um par ortogonal de verdade (linhas mal marcadas). `pp` = ponto
   *  principal em pixels (spec: aproximado pelo centro da imagem se
   *  desconhecido). */
  caprileTorreFocalPx(vp1, vp2, pp) {
    const d1x = vp1.x - pp.x, d1y = vp1.y - pp.y;
    const d2x = vp2.x - pp.x, d2y = vp2.y - pp.y;
    const fSquared = -(d1x * d2x + d1y * d2y);
    if (!(fSquared > 0)) return null;
    return Math.sqrt(fSquared);
  },

  /** Converte distância focal em pixels para FoV horizontal (graus), dada a
   *  largura real da imagem em pixels — `FoV = 2*atan(largura_img_px / (2*f))`
   *  (spec §2.2). */
  focalPxToFovHDeg(fPx, imgWidthPx) {
    return 2 * Math.atan(imgWidthPx / (2 * fPx)) * 180 / Math.PI;
  },

  /** Orientação (yaw/pitch/roll, graus, MESMA convenção do resto do app —
   *  ver engine3d.js: yaw em torno de Y mundo, câmera olha -Z local antes de
   *  rotacionar) a partir das direções (em coordenadas de CÂMERA) para os 2
   *  pontos de fuga ortogonais já associados a eixo do mapa pelo usuário
   *  (spec passo 10 da UX — `eixoAssociado`). `dirXcam`/`dirZcam` são
   *  THREE.Vector3 unitários (ver `pixelDirToCameraSpace` abaixo) apontando,
   *  em espaço de câmera, para o ponto de fuga do eixo mundo X e do eixo
   *  mundo Z respectivamente.
   *
   *  Dedução: se D é a matriz cujas colunas são [dirXcam, dirYcam, dirZcam]
   *  (dirYcam = "up" do mundo em espaço de câmera, pelo produto vetorial),
   *  então por construção `D * eixoMundoX = dirXcam` etc — ou seja, D é a
   *  matriz de mudança de base MUNDO->CÂMERA. A rotação que queremos
   *  (CÂMERA->MUNDO, a mesma convenção de `camera.quaternion`/`camera.lookAt`
   *  do resto do app) é a INVERSA de D — como D é ortonormal, usar
   *  `Matrix4.invert()` do Three.js (equivalente a uma transposição, mas sem
   *  reimplementar a álgebra à mão — spec: "não é necessário reimplementar a
   *  matemática de projeção manualmente"). */
  orientationFromVPDirections(dirXcam, dirZcam, THREE) {
    // "up" do mundo em espaço de câmera = produto vetorial das outras duas
    // direções; o sinal (dirZ×dirX, não dirX×dirZ) é escolhido para resultar
    // predominantemente em +Y (câmeras comuns não ficam de cabeça pra baixo)
    // — se a associação de eixo feita pelo usuário estiver invertida, a
    // Fase 2 da UX (seta de confirmação sobre o mapa 2D, spec §4) deixa
    // corrigir com 1 clique.
    let dirYcam = new THREE.Vector3().crossVectors(dirZcam, dirXcam).normalize();
    // Gram-Schmidt: reortonormaliza dirZ a partir de X e Y já perpendiculares
    // entre si, absorvendo o ruído de clique do usuário nas linhas de fuga
    // (na prática, dirXcam e dirZcam medidos na imagem raramente são
    // EXATAMENTE perpendiculares).
    const dirZortho = new THREE.Vector3().crossVectors(dirXcam, dirYcam).normalize();
    const D = new THREE.Matrix4().makeBasis(dirXcam, dirYcam, dirZortho);
    const R = D.clone().invert(); // câmera->mundo
    const euler = new THREE.Euler().setFromRotationMatrix(R, 'YXZ');
    // [10/09/2026] `THREE.MathUtils` só existe em versões mais recentes do
    // Three.js — usa conversão direta (sem depender de qual versão exata
    // está carregada em runtime, ver libloader.js) por segurança.
    const RAD2DEG = 180 / Math.PI;
    return {
      yawDeg: euler.y * RAD2DEG,
      pitchDeg: euler.x * RAD2DEG,
      rollDeg: euler.z * RAD2DEG,
    };
  },

  /** Converte um ponto de fuga (pixels) + distância focal (pixels) numa
   *  direção UNITÁRIA em coordenadas de câmera local. Y invertido (pixel V
   *  cresce pra BAIXO; espaço 3D Y cresce pra CIMA) e Z=-f (câmera olha pro
   *  -Z local, convenção Three.js/OpenGL — mesma nota da spec §2, topo do
   *  arquivo). */
  pixelDirToCameraSpace(vp, pp, fPx, THREE) {
    const dx = vp.x - pp.x;
    const dy = -(vp.y - pp.y);
    return new THREE.Vector3(dx, dy, -fPx).normalize();
  },

  // ======================================================================
  // 2.3 — Clique 2D -> ponto 3D (raycasting via THREE.Raycaster/THREE.Plane)
  // ======================================================================

  /** Pixel (u,v, origem no canto superior-esquerdo da FOTO, não do viewport)
   *  -> NDC [-1,1] (spec §2.3, passo 1). */
  pixelToNDC(u, v, imgWidthPx, imgHeightPx) {
    return { x: (2 * u / imgWidthPx) - 1, y: 1 - (2 * v / imgHeightPx) };
  },

  /** Raycast do centro óptico da câmera CALIBRADA (uma THREE.PerspectiveCamera
   *  de verdade, com fov/aspect/pose já aplicados) através do pixel clicado,
   *  intersectando um `THREE.Plane` (chão, auxiliar, ou altura explícita —
   *  spec §2.3 passos 2-3). Reaproveita `THREE.Raycaster`/`Ray.intersectPlane`
   *  diretamente (nenhuma matemática de projeção reimplementada à mão, como
   *  pedido). Rejeita com mensagem clara quando o raio é quase paralelo ao
   *  plano (perto do horizonte) — spec §2.3, "numericamente instável". */
  raycastToPlane(camera3, ndc, plane, THREE) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera3);
    const denom = plane.normal.dot(raycaster.ray.direction);
    if (Math.abs(denom) < 1e-4) {
      return { valid: false, reason: 'Este ponto está muito perto do horizonte para este plano — a posição calculada seria numericamente instável. Tente clicar mais perto da base do objeto, ou use um plano auxiliar/altura explícita.' };
    }
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, target);
    if (!hit) {
      return { valid: false, reason: 'O raio não intersecta este plano na direção da foto (o plano ficaria atrás da câmera).' };
    }
    return { valid: true, point: { x: target.x, y: target.y, z: target.z } };
  },

  /** Caso "altura conhecida explícita" (spec §2.3, passo 4 e UX passo 12,
   *  3ª opção): plano HORIZONTAL na altura Y = `alturaM` do mundo. */
  horizontalPlaneAtHeight(alturaM, THREE) {
    // Plane na forma normal·p + constant = 0, normal=(0,1,0) -> constant = -alturaM
    return new THREE.Plane(new THREE.Vector3(0, 1, 0), -alturaM);
  },

  /** Caso "topo de um pilar" (spec §2.3, passo 4, 1ª frase): plano VERTICAL
   *  passando pela base já resolvida, alinhado à direção informada (eixo de
   *  fuga vertical se existir, senão a direção da câmera projetada no plano
   *  horizontal). `direcaoXZ` = {x,z} unitário no plano XZ. */
  verticalPlaneThroughPoint(pontoBase, direcaoXZ, THREE) {
    // normal do plano vertical = perpendicular a direcaoXZ no plano XZ (o
    // plano CONTÉM a reta vertical que passa por pontoBase E a direção
    // horizontal informada — a normal é perpendicular a essa direção).
    const nx = -direcaoXZ.z, nz = direcaoXZ.x;
    const normal = new THREE.Vector3(nx, 0, nz).normalize();
    const plane = new THREE.Plane();
    plane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(pontoBase.x, pontoBase.y, pontoBase.z));
    return plane;
  },

  // ======================================================================
  // 2.4 — Erro de reprojeção
  // ======================================================================

  /** Reprojeta um ponto 3D de volta pela câmera calibrada e compara com o
   *  pixel original clicado (spec §2.4). `camera3.project()` já faz toda a
   *  matemática de projeção (matriz de projeção + view) — de novo, Three.js
   *  em vez de reimplementar. */
  reprojectionErrorPx(camera3, point3D, pixelOriginal, imgWidthPx, imgHeightPx, THREE) {
    const v = new THREE.Vector3(point3D.x, point3D.y, point3D.z).project(camera3);
    const u = (v.x + 1) / 2 * imgWidthPx;
    const vv = (1 - v.y) / 2 * imgHeightPx;
    const dx = u - pixelOriginal.u, dy = vv - pixelOriginal.v;
    return { uReprojetado: u, vReprojetado: vv, erroPx: Math.hypot(dx, dy) };
  },

  /** RMS de uma lista de erros individuais (spec §2.4 "erro médio (RMS)"). */
  rms(valores) {
    if (!valores || !valores.length) return 0;
    const somaQuad = valores.reduce((acc, v) => acc + v * v, 0);
    return Math.sqrt(somaQuad / valores.length);
  },

  // ======================================================================
  // Fase 3 — Array/replicação ao longo do eixo de fuga (spec passo 13)
  // ======================================================================

  /** Pontos igualmente espaçados a partir de `origem`, na `direcao` (vetor
   *  unitário {x,y,z}), espaçados `espacamentoM` metros, `quantidade` vezes
   *  (inclui a própria origem como item 0). */
  replicateAlongAxis(origem, direcao, espacamentoM, quantidade) {
    const pts = [];
    for (let i = 0; i < quantidade; i++) {
      pts.push({
        x: origem.x + direcao.x * espacamentoM * i,
        y: origem.y + direcao.y * espacamentoM * i,
        z: origem.z + direcao.z * espacamentoM * i,
      });
    }
    return pts;
  },
};

window.PerspMatchMath = PerspMatchMath;
