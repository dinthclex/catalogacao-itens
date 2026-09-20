#!/usr/bin/env node
/* js/gerador-glb/canvas2d-node.js
 * [16/09/2026 UTC] NOVO — peça de apoio pro pedido "gere um .glb com a
 * textura do mostrador assada dentro" (ver `gerar_malhas.js`,
 * `_buildRelogioGlb`). `assets/js/mostrador-canvas.js` (o arquivo com os
 * comandos de desenho de verdade, pedido do usuário) só sabe chamar um
 * subconjunto pequeno e bem definido de métodos de
 * `CanvasRenderingContext2D` — `fillStyle`/`strokeStyle`/`lineWidth`/
 * `fillRect`/`beginPath`/`moveTo`/`lineTo`/`arc`/`stroke` — este arquivo
 * IMPLEMENTA esse mesmo subconjunto rodando em Node puro (sem
 * `document`/`<canvas>` de navegador, e SEM nenhuma dependência nativa tipo
 * `npm install canvas`, que precisaria compilar bindings C++/Cairo —
 * inviável neste projeto offline-first/`file:///`).
 *
 * ESCOPO HONESTO (mesmo espírito "documentado, não escondido" do resto do
 * projeto): não é um Canvas2D completo — só rasteriza retângulo sólido
 * (`fillRect`), linhas retas com espessura (`moveTo`/`lineTo`/`stroke`) e
 * círculos/arcos completos com espessura (`arc`/`stroke`, só ângulo
 * completo 0..2π — suficiente pro que `mostrador-canvas.js` de fato usa).
 * NÃO implementa: texto, gradientes, `clip`, transformações (`translate`/
 * `rotate`/`scale`), composição alfa avançada, arcos parciais. Cada
 * primitiva é "pintada" amostrando pontos ao longo da forma e carimbando um
 * disco cheio (raio = metade da espessura da linha) em cada ponto —
 * simples e robusto o bastante pro estilo "low poly"/traços grossos deste
 * projeto, mas serrilhado em zoom bem próximo (sem anti-aliasing de
 * verdade). Suficiente pra textura de 256×512px do mostrador do relógio,
 * que nunca é vista de perto o bastante pra essa diferença importar.
 *
 * USO (programático, não tem CLI própria — chamado por gerar_malhas.js):
 *   const { criarContexto2D, paraPngBuffer } = require('./canvas2d-node.js');
 *   const ctx = criarContexto2D(tamanhoPx, tamanhoPx);
 *   window.MostradorCanvas.desenhar(ctx, tamanhoPx, '#f2ede0'); // mesmo arquivo do navegador
 *   const pngBuffer = paraPngBuffer(ctx);
 */
const zlib = require('zlib');

/** Cria o buffer RGBA (Uint8ClampedArray, 4 bytes/pixel) e devolve um objeto
 *  que implementa o subconjunto de `CanvasRenderingContext2D` documentado
 *  acima. */
function criarContexto2D(largura, altura) {
  const pixels = new Uint8ClampedArray(largura * altura * 4);
  // Fundo transparente por padrão (igual um <canvas> de verdade recém-criado).
  let fillStyle = '#000000';
  let strokeStyle = '#000000';
  let lineWidth = 1;
  let path = []; // lista de [x,y] do `moveTo`/`lineTo` corrente (1 subcaminho só — suficiente pro uso de mostrador-canvas.js)

  function parseCor(css) {
    // Aceita '#rrggbb' e 'rgba(r,g,b,a)' — os DOIS formatos usados por
    // mostrador-canvas.js, nada além disso (ver escopo no topo do arquivo).
    if (css[0] === '#') {
      const r = parseInt(css.slice(1, 3), 16), g = parseInt(css.slice(3, 5), 16), b = parseInt(css.slice(5, 7), 16);
      return [r, g, b, 255];
    }
    const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\)/.exec(css);
    if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), m[4] != null ? Math.round(parseFloat(m[4]) * 255) : 255];
    return [0, 0, 0, 255]; // fallback defensivo — nunca deveria acontecer com o uso real deste projeto
  }

  function setPixel(x, y, rgba) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= largura || y >= altura) return;
    const i = (y * largura + x) * 4;
    const a = rgba[3] / 255;
    if (a >= 1) {
      pixels[i] = rgba[0]; pixels[i + 1] = rgba[1]; pixels[i + 2] = rgba[2]; pixels[i + 3] = 255;
    } else {
      // Alpha blend simples sobre o que já está no buffer (permite as
      // molduras/marcações translúcidas de mostrador-canvas.js, ex.
      // 'rgba(30,25,15,0.35)').
      const aExist = pixels[i + 3] / 255;
      const aOut = a + aExist * (1 - a);
      for (let c = 0; c < 3; c++) pixels[i + c] = aOut > 0 ? (rgba[c] * a + pixels[i + c] * aExist * (1 - a)) / aOut : 0;
      pixels[i + 3] = Math.round(aOut * 255);
    }
  }

  function carimbarDisco(cx, cy, raio, rgba) {
    const r2 = raio * raio;
    const x0 = Math.floor(cx - raio), x1 = Math.ceil(cx + raio);
    const y0 = Math.floor(cy - raio), y1 = Math.ceil(cy + raio);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) setPixel(x, y, rgba);
      }
    }
  }

  function carimbarSegmento(x0, y0, x1, y1, raio, rgba) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const passos = Math.max(1, Math.ceil(dist / Math.max(0.5, raio * 0.5)));
    for (let i = 0; i <= passos; i++) {
      const t = i / passos;
      carimbarDisco(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, raio, rgba);
    }
  }

  return {
    set fillStyle(v) { fillStyle = v; },
    get fillStyle() { return fillStyle; },
    set strokeStyle(v) { strokeStyle = v; },
    get strokeStyle() { return strokeStyle; },
    set lineWidth(v) { lineWidth = v; },
    get lineWidth() { return lineWidth; },
    fillRect(x, y, w, h) {
      const rgba = parseCor(fillStyle);
      for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(altura, Math.ceil(y + h)); yy++) {
        for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(largura, Math.ceil(x + w)); xx++) {
          setPixel(xx, yy, rgba);
        }
      }
    },
    beginPath() { path = []; },
    moveTo(x, y) { path.push([x, y, 'move']); },
    lineTo(x, y) { path.push([x, y, 'line']); },
    // `arc` só suporta ângulo completo (0..2π) — o único uso real em
    // mostrador-canvas.js (a moldura circular). Marca o círculo inteiro
    // como 1 "subcaminho" próprio pra `stroke()` reconhecer.
    arc(cx, cy, raio) { path.push([cx, cy, 'arc', raio]); },
    stroke() {
      const rgba = parseCor(strokeStyle);
      const raioPincel = Math.max(0.5, lineWidth / 2);
      for (const seg of path) {
        if (seg[2] === 'arc') {
          const [cx, cy, , raio] = seg;
          const passos = Math.max(8, Math.ceil((2 * Math.PI * raio) / Math.max(0.5, raioPincel * 0.5)));
          for (let i = 0; i < passos; i++) {
            const a = (i / passos) * Math.PI * 2;
            carimbarDisco(cx + Math.cos(a) * raio, cy + Math.sin(a) * raio, raioPincel, rgba);
          }
        }
      }
      // Segmentos `moveTo`/`lineTo` (retos) — desenha entre pares
      // consecutivos que não sejam 'arc'.
      let anterior = null;
      for (const seg of path) {
        if (seg[2] === 'arc') { anterior = null; continue; }
        if (anterior) carimbarSegmento(anterior[0], anterior[1], seg[0], seg[1], raioPincel, rgba);
        anterior = seg;
      }
    },
    // Metadados usados por `paraPngBuffer` abaixo.
    _largura: largura,
    _altura: altura,
    _pixels: pixels,
  };
}

/** Encoder PNG mínimo — só o suficiente pra um RGBA 8-bit sem paleta
 *  (color type 6, sem interlace), usando `zlib` (nativo do Node, sem
 *  dependência externa nenhuma) pra compressão DEFLATE dos scanlines
 *  (filtro 0 — "None" — em cada linha, o jeito mais simples/robusto,
 *  suficiente pro tamanho pequeno de uma textura de mostrador). */
function paraPngBuffer(ctx) {
  const { _largura: w, _altura: h, _pixels: pixels } = ctx;
  // CRC32 — implementação direta da tabela padrão (spec PNG), sem libs.
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(tipo, dados) {
    const tipoBuf = Buffer.from(tipo, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length, 0);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tipoBuf, dados])), 0);
    return Buffer.concat([len, tipoBuf, dados, crc]);
  }
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // compression/filter/interlace = padrão
  // Dados brutos: 1 byte de filtro (0 = None) + w*4 bytes de pixel, por linha.
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const destOff = y * (1 + w * 4);
    raw[destOff] = 0; // filtro None
    const srcOff = y * w * 4;
    pixels.subarray ? Buffer.from(pixels.buffer, pixels.byteOffset + srcOff, w * 4).copy(raw, destOff + 1)
      : raw.set(pixels.slice(srcOff, srcOff + w * 4), destOff + 1);
  }
  const idatData = zlib.deflateSync(raw);
  return Buffer.concat([assinatura, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { criarContexto2D, paraPngBuffer };
