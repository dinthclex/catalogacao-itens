/**
 * libloader.js — Carrega a biblioteca de leitura de código de barras
 * (QuaggaJS) de forma DINÂMICA, depois que a tela já apareceu.
 *
 * Antes, bibliotecas de terceiros eram carregadas com <script defer> direto
 * no index.html — e "defer" faz o navegador esperar TODAS elas baixarem por
 * completo antes de disparar "DOMContentLoaded", que é o evento que dispara
 * App.init(). Numa conexão lenta (ou se o CDN demorar), a tela ficava
 * "vazia" por um bom tempo, sem nenhum aviso — parecendo travada/quebrada.
 *
 * Agora ela é injetada via JS depois que a tela principal já foi desenhada (a
 * partir dos dados locais, que não dependem disso), então o app abre quase
 * instantaneamente. Continua carregando em segundo plano, e a tela mostra um
 * aviso com barra de progresso enquanto isso — o cadastro manual funciona
 * normalmente mesmo antes dela terminar de carregar.
 *
 * VENDORIZADA (pasta lib/, sem CDN): desde que o app passou a exigir
 * funcionamento 100% local, o arquivo da biblioteca fica em lib/, junto do
 * resto do app — não depende de internet nem na primeira vez.
 *
 * O visualizador 3D ("Ver em 3D", ver js/view3d.js/js/engine3d.js) usa a
 * biblioteca Three.js, mas carrega lib/three.module.js sozinho, via import()
 * dinâmico dentro de engine3d.js — não passa por este loader.
 */
const LibLoader = {
  LIBS: [
    { nome: 'Leitura de código de barras', url: 'lib/quagga.min.js' },
  ],
  _promise: null,

  _injectScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true; // não bloqueia nada — nem parsing, nem DOMContentLoaded
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao baixar: ' + url));
      document.head.appendChild(script);
    });
  },

  /**
   * Carrega tudo em segundo plano. onProgress(concluidos, total, nomeAtual) é
   * chamado a cada biblioteca que termina.
   */
  loadAll({ onProgress } = {}) {
    if (this._promise) return this._promise;
    const total = this.LIBS.length;
    let done = 0;
    const tick = (nome) => { done++; onProgress?.(done, total, nome); };

    // Código de barras: QuaggaJS não precisa de inicialização assíncrona —
    // Barcode.isAvailable() já detecta sozinho quando "Quagga" está pronto.
    const quaggaP = this._injectScript(this.LIBS[0].url)
      .then(() => tick(this.LIBS[0].nome))
      .catch((e) => { console.warn(e.message); tick(this.LIBS[0].nome); });

    this._promise = Promise.allSettled([quaggaP]);
    return this._promise;
  },
};

window.LibLoader = LibLoader;
