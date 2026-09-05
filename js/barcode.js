/**
 * barcode.js — Leitura LOCAL de código de barras (1D) a partir de uma imagem
 * estática (o frame tirado na tela "Fotos"), usando a biblioteca QuaggaJS.
 *
 * Por que isto existe: diferente de um reconhecimento "por olho" (adivinhar
 * dígitos parecidos por semelhança visual, com chance de erro), um código de
 * barras não tem ambiguidade: o padrão de barras ou corresponde exatamente a
 * uma sequência válida numa simbologia conhecida (Code128, Code39, EAN,
 * Codabar, Interleaved 2de5...), ou simplesmente não decodifica nada — não
 * existe "quase certo" aqui. Por isso, quando a etiqueta tem um código de
 * barras (como as etiquetas de patrimônio costumam ter), a leitura já vem
 * pré-preenchida no formulário de cadastro (ver js/capture.js).
 *
 * Isto é uma leitura DETERMINÍSTICA de um código de barras real impresso na
 * etiqueta.
 */
const Barcode = {
  // Simbologias mais comuns em etiquetas de patrimônio/inventário.
  READERS: ['code_128_reader', 'code_39_reader', 'ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader', 'codabar_reader', 'i2of5_reader'],
  TIMEOUT_MS: 4000,

  isAvailable() {
    return typeof Quagga !== 'undefined';
  },

  /**
   * Tenta decodificar um código de barras numa imagem estática (canvas ou
   * dataURL). Devolve { code, format } quando consegue decodificar algo, ou
   * null quando não há biblioteca disponível, não há código de barras
   * legível na imagem, ou o tempo limite de segurança estourou (o
   * Quagga.decodeSingle, em raríssimos casos com imagens muito grandes/
   * ruidosas, pode demorar mais do que vale a pena esperar aqui).
   * @param {HTMLCanvasElement|string} source
   * @returns {Promise<{code:string, format:string}|null>}
   */
  decode(source) {
    if (!this.isAvailable() || !source) return Promise.resolve(null);
    let src;
    try {
      src = (typeof source === 'string') ? source : source.toDataURL('image/png');
    } catch (e) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => { if (done) return; done = true; resolve(value); };
      const safety = setTimeout(() => finish(null), this.TIMEOUT_MS);
      try {
        Quagga.decodeSingle({
          src,
          locate: true,
          inputStream: { size: 1000 },
          decoder: { readers: this.READERS },
        }, (result) => {
          clearTimeout(safety);
          if (result && result.codeResult && result.codeResult.code) {
            finish({ code: result.codeResult.code, format: result.codeResult.format || '' });
          } else {
            finish(null);
          }
        });
      } catch (e) {
        clearTimeout(safety);
        finish(null);
      }
    });
  },
};

window.Barcode = Barcode;
