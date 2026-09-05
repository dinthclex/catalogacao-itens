/**
 * devicefingerprint.js — MODULARIZADO em 27/08/2026, a pedido do usuário:
 * "Tudo referente a 'identificação do aparelho para tornar o dispositivo
 * único' deve ficar em um arquivo a parte (modularizado)". Antes, todo este
 * código morava dentro de session.js — foi movido pra cá sem mudar nenhum
 * comportamento (mesmos algoritmos, mesmos comentários originais, só
 * reorganizados num módulo próprio).
 *
 * Continua um `<script>` comum (sem import/export ES module), então funciona
 * igual antes quando o app é aberto direto do disco (file:///), sem
 * precisar de servidor nenhum — só é preciso incluir este arquivo ANTES de
 * js/session.js no index.html (ver ordem dos <script> lá).
 *
 * O que faz: calcula, em segundo plano, uma "impressão digital" (fingerprint)
 * do APARELHO/NAVEGADOR — combinação de características de hardware/software
 * que tende a ser estável no mesmo aparelho e diferente de aparelho pra
 * aparelho — usada por session.js pra enriquecer o "Cadastrado por" de cada
 * item, mesmo que o localStorage (onde fica o id simples, esse sim ainda em
 * session.js) seja apagado. NÃO identifica a pessoa — só ajuda a diferenciar
 * fisicamente um aparelho de outro.
 */
const DeviceFingerprint = {
  /**
   * Informação BEST-EFFORT do aparelho — usada para enriquecer "Cadastrado
   * por" nos itens. IMPORTANTE: isto NÃO é o nome que a pessoa deu ao
   * computador/celular nas configurações do sistema (ex: "PC-ALEX"), nem o
   * endereço MAC — nenhum navegador, em nenhuma plataforma, expõe esse nome
   * nem o MAC para uma página web comum (é bloqueado de propósito, por
   * privacidade/segurança).
   *
   * Pedido do usuário (27/08/2026, texto original — decisão histórica que
   * deu origem a este módulo): antes só tinha SO/navegador/modelo (ex.:
   * "Android · Chrome · SM-A346M") — agora ganhou RAM e resolução física
   * estimada com o tamanho da tela em polegadas (ex.: "Android · Chrome ·
   * SM-A346M · 6G (RAM) · 1920x1080 (7,5pol)"), usando navigator.deviceMemory,
   * screen.width/height e devicePixelRatio. Núcleos do processador
   * (hardwareConcurrency), placa gráfica (WebGL) e pontos de toque
   * (maxTouchPoints) também são coletados, mas ficam só em `deviceDetails`
   * (não no texto compacto) — participam do fingerprint (ver
   * computeFingerprint) para ajudar a diferenciar aparelhos parecidos.
   *
   * @returns {Promise<{deviceInfoText: string|null, deviceDetails: object|null}>}
   */
  async loadDeviceInfo() {
    try {
      const ua = navigator.userAgent || '';
      let so = 'Sistema desconhecido';
      if (/Windows/i.test(ua)) so = 'Windows';
      else if (/Android/i.test(ua)) so = 'Android';
      else if (/iPhone|iPad|iPod|iOS/i.test(ua)) so = 'iOS';
      else if (/Mac OS X/i.test(ua)) so = 'macOS';
      else if (/Linux/i.test(ua)) so = 'Linux';
      let navegador = 'Navegador desconhecido';
      if (/Edg\//i.test(ua)) navegador = 'Edge';
      else if (/OPR\//i.test(ua)) navegador = 'Opera';
      else if (/Chrome\//i.test(ua)) navegador = 'Chrome';
      else if (/Firefox\//i.test(ua)) navegador = 'Firefox';
      else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) navegador = 'Safari';

      let modelo = null;
      try {
        if (navigator.userAgentData?.getHighEntropyValues) {
          const hi = await navigator.userAgentData.getHighEntropyValues(['model']);
          if (hi?.model) modelo = hi.model;
        }
      } catch (e) { /* Client Hints não suportado/negado — segue sem o modelo */ }

      const ram = this._getRamLabel();
      const tela = this._getScreenLabel();
      const gpu = await this._getGpuInfo();

      const deviceInfoText = [so, navegador, modelo, ram, tela].filter(Boolean).join(' · ');
      const deviceDetails = {
        so,
        navegador,
        modelo,
        ramGB: (typeof navigator.deviceMemory === 'number') ? navigator.deviceMemory : null,
        nucleos: navigator.hardwareConcurrency || null,
        gpu,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        orientacao: screen.orientation?.type?.includes('portrait') ? 'retrato' : (screen.orientation?.type?.includes('landscape') ? 'paisagem' : null),
        resolucaoCss: `${screen.width || 0}x${screen.height || 0}`,
        devicePixelRatio: window.devicePixelRatio || 1,
      };
      return { deviceInfoText, deviceDetails };
    } catch (e) {
      return { deviceInfoText: null, deviceDetails: null };
    }
  },

  /** navigator.deviceMemory: só Chrome/Edge/Opera implementam (Firefox/
   *  Safari não) — e, por privacidade, o navegador arredonda pra um valor
   *  "de referência" (0.25/0.5/1/2/4/8), nunca a RAM exata instalada. Ainda
   *  assim, já ajuda bastante a diferenciar dois aparelhos parecidos. */
  _getRamLabel() {
    const gb = navigator.deviceMemory;
    if (typeof gb !== 'number') return null;
    return `${gb}G (RAM)`;
  },

  /** Resolução FÍSICA estimada (screen.width/height já vêm em pixels
   *  "lógicos"/CSS — multiplicar por devicePixelRatio aproxima da resolução
   *  real do painel) + tamanho da tela em polegadas — ver
   *  _estimateScreenInches logo abaixo pro porquê disso ser uma ESTIMATIVA,
   *  nunca um valor exato. */
  _getScreenLabel() {
    try {
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.round((screen.width || 0) * dpr);
      const ph = Math.round((screen.height || 0) * dpr);
      if (!pw || !ph) return null;
      const pol = this._estimateScreenInches(pw, ph);
      return pol ? `${pw}x${ph} (${pol}pol)` : `${pw}x${ph}`;
    } catch (e) { return null; }
  },

  /** ESTIMATIVA grosseira do tamanho físico da tela, em polegadas — pedido
   *  do usuário (ex.: "1920x1080 (7,5pol)"). Nenhuma página web tem acesso
   *  ao DPI/PPI real do painel físico (isso não é exposto por nenhum
   *  navegador, em nenhuma plataforma) — o que dá pra fazer é ASSUMIR uma
   *  densidade de pixels típica por categoria de aparelho (celular tela
   *  pequena/densa, tablet tela grande, PC com monitor comum) e calcular a
   *  diagonal a partir disso. Serve como referência aproximada para
   *  diferenciar aparelhos na lista — NUNCA deve ser tratado como medida
   *  exata (o mesmo aparelho real pode aparecer com ±1~2 polegadas de
   *  diferença do valor verdadeiro, dependendo do modelo). */
  _estimateScreenInches(pw, ph) {
    try {
      const isTouch = (navigator.maxTouchPoints || 0) > 0;
      const maiorLado = Math.max(pw, ph);
      let ppiAssumido;
      if (!isTouch) ppiAssumido = 100; // monitor de PC/notebook comum
      else if (maiorLado >= 2200) ppiAssumido = 264; // tablet grande (referência: iPad)
      else ppiAssumido = 400; // celular típico (a maioria fica entre ~300-450)
      const diagonalPx = Math.hypot(pw, ph);
      const pol = diagonalPx / ppiAssumido;
      return pol > 0 ? pol.toFixed(1).replace('.', ',') : null;
    } catch (e) { return null; }
  },

  /** Nome da placa gráfica (GPU), via a extensão WEBGL_debug_renderer_info —
   *  nem todo navegador/config expõe isto (pode vir bloqueado por
   *  fingerprinting-resistance em alguns Firefox, por exemplo) — falha
   *  silenciosamente nesse caso. */
  async _getGpuInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return null;
      const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      return renderer ? String(renderer) : null;
    } catch (e) { return null; }
  },

  /**
   * "Impressão digital" do aparelho — combina várias características de
   * hardware/navegador que, JUNTAS, tendem a ser únicas o bastante para
   * diferenciar aparelhos, mesmo que o localStorage (o `id` simples, ver
   * session.js) seja apagado. Não identifica a PESSOA — só ajuda a
   * reconhecer "este aparelho físico já apareceu antes".
   *
   * De propósito, NÃO inclui nível de bateria (navigator.getBattery()): ele
   * muda a cada instante, o que tornaria o hash INSTÁVEL de uma catalogação
   * pra outra no MESMO aparelho — o oposto do que um fingerprint precisa
   * ser. Pelo mesmo motivo, também evita o IP público (isso já é capturado
   * à parte, opcionalmente, ver Session.getPublicIpIfEnabled — é da REDE,
   * não do aparelho, e muda trocando de wi-fi/dados móveis).
   *
   * Resultado: hash cyrb53 de Utils.hashString (mesmo algoritmo já usado em
   * outras partes do app, ver db.js computeConferenciaId) — curto, estável
   * entre catalogações no mesmo aparelho/navegador, mas de leitura direta
   * (não é criptográfico) — como TODO fingerprinting via navegador, pode
   * mudar se o navegador for atualizado, o driver de vídeo mudar, ou (em
   * alguns navegadores) a cada reinstalação do sistema.
   *
   * @returns {Promise<string|null>}
   */
  async computeFingerprint() {
    try {
      const partes = [];
      partes.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
      partes.push(navigator.language || '');
      partes.push((navigator.languages || []).join(','));
      partes.push(String(navigator.hardwareConcurrency || ''));
      partes.push(String(navigator.deviceMemory || ''));
      partes.push(String(navigator.maxTouchPoints || ''));
      partes.push(`${screen.width || 0}x${screen.height || 0}x${screen.colorDepth || 0}`);
      partes.push(String(window.devicePixelRatio || ''));
      partes.push((await this._getGpuInfo()) || '');
      partes.push(this._canvasFingerprint());
      partes.push(await this._audioFingerprint());
      partes.push(this._fontsFingerprint());
      const combinado = partes.join('|');
      return (window.Utils?.hashString ? Utils.hashString(combinado) : null);
    } catch (e) { return null; }
  },

  /** Renderiza texto/formas numa <canvas> invisível e lê o resultado como
   *  imagem — pequenas diferenças de fonte/antialiasing/driver de vídeo
   *  entre aparelhos tendem a gerar pixels levemente diferentes mesmo com o
   *  mesmo código, uma das bases mais usadas de fingerprinting (ex.:
   *  FingerprintJS). Nunca sai daqui como imagem — só entra, já misturada,
   *  no hash final (computeFingerprint). */
  _canvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 40;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 100, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Catalogação de Itens 27/08', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Catalogação de Itens 27/08', 4, 17);
      return canvas.toDataURL();
    } catch (e) { return ''; }
  },

  /** Renderiza um áudio simples num contexto OFFLINE (nunca toca som de
   *  verdade) e mede o resultado — igual à canvas acima, mas explorando
   *  diferenças de processamento de áudio entre aparelhos/navegadores. */
  async _audioFingerprint() {
    try {
      const AudioCtxCls = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!AudioCtxCls) return '';
      const ctx = new AudioCtxCls(1, 5000, 44100);
      const oscillator = ctx.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 10000;
      const compressor = ctx.createDynamicsCompressor();
      oscillator.connect(compressor);
      compressor.connect(ctx.destination);
      oscillator.start(0);
      const buffer = await Promise.race([
        ctx.startRendering(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
      ]);
      const data = buffer.getChannelData(0);
      let soma = 0;
      for (let i = 4500; i < 4600 && i < data.length; i++) soma += Math.abs(data[i]);
      return soma.toFixed(8);
    } catch (e) { return ''; }
  },

  /** Detecta (sem baixar nem inspecionar arquivo nenhum) quais de uma lista
   *  de fontes comuns estão instaladas, medindo a largura de um texto de
   *  teste com cada uma e comparando com as fontes genéricas do navegador —
   *  se a largura mudar, a fonte existe de verdade no aparelho. A LISTA de
   *  fontes que aparecem instaladas varia bastante entre SO/aparelho, mais
   *  um ingrediente pro fingerprint. */
  _fontsFingerprint() {
    try {
      const testFonts = ['Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia', 'Comic Sans MS', 'Impact', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Roboto', 'Noto Sans', 'Calibri'];
      const baseFonts = ['monospace', 'sans-serif', 'serif'];
      const testString = 'mmmmmmmmmmlli';
      const testSize = '72px';
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      const baseWidths = {};
      baseFonts.forEach((bf) => { ctx.font = `${testSize} ${bf}`; baseWidths[bf] = ctx.measureText(testString).width; });
      const detectadas = testFonts.filter((font) => baseFonts.some((bf) => {
        ctx.font = `${testSize} ${font}, ${bf}`;
        return ctx.measureText(testString).width !== baseWidths[bf];
      }));
      return detectadas.join(',');
    } catch (e) { return ''; }
  },
};

window.DeviceFingerprint = DeviceFingerprint;
