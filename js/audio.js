/* js/audio.js
 * NOVO (13/09/2026) — INFRAESTRUTURA DE ÁUDIO DO ZERO. Antes desta rodada o
 * projeto não tinha NENHUMA infraestrutura de som — nem `AudioContext`, nem
 * pasta de arquivos de áudio, nem elemento `<audio>` em lugar nenhum
 * (conferido por busca no código-fonte inteiro antes de escrever este
 * arquivo). Pedido verbatim (câmera de segurança estilo PS1): "A
 * movimentação da câmera deve ter som (agora o projeto vai ter som). O som
 * do motor dela e barulho que faz ao movimentar-se."
 *
 * DECISÃO DE ESCOPO — SOM SINTETIZADO, NÃO ARQUIVO GRAVADO (leia antes de
 * achar que falta um .mp3 "de verdade"): esta sessão de trabalho não tem
 * como gerar/gravar um arquivo de áudio real (nenhuma ferramenta de síntese
 * de áudio para arquivo, nem acesso a bancos de som prontos) nem como testar
 * ao vivo se um arquivo assim tocaria certo no navegador do usuário. Em vez
 * de arriscar entregar um `<audio src="assets/sons/motor.mp3">` apontando
 * pra um arquivo que não existe (quebra silenciosa) ou baixar um arquivo de
 * terceiro sem poder validar licença/qualidade, a alternativa 100% viável
 * SEM depender de arquivo externo é sintetizar o som na hora via Web Audio
 * API (osciladores) — um "zumbido" de servo motor grave com leve modulação,
 * ligado só enquanto a câmera está de fato girando e mudo nas pausas. A
 * PORTA FICA ABERTA pra trocar por um arquivo `.mp3`/`.wav` real depois: se
 * o usuário tiver (ou gravar) um arquivo de som de motor, bastaria trocar a
 * implementação de `tocarSomMotor` por um `new Audio('assets/sons/motor-
 * camera.mp3')` com `.play()`/`.pause()`, mantendo a MESMA API pública
 * (`AudioFX.tocarSomMotor(iniciar)`) — nenhum código que já chama essa API
 * precisaria mudar.
 *
 * POLÍTICA DE AUTOPLAY DOS NAVEGADORES — tratada aqui: um `AudioContext` só
 * pode emitir som depois de alguma interação real do usuário na página
 * (clique/toque/tecla) — criar/usar um antes disso lança exceção ou fica
 * "suspenso" silenciosamente. Este módulo NUNCA cria o `AudioContext` no
 * carregamento do arquivo — só na primeira interação (`pointerdown`/`click`/
 * `keydown` no `document`, capturados 1x com `{ once:true }`), e qualquer
 * chamada a `tocarSomMotor` ANTES dessa primeira interação é simplesmente
 * enfileirada (silenciosa, sem erro) até o contexto existir. Isso cobre o
 * caso comum deste app: a pessoa já clica em algo (abrir "Ver em 3D",
 * navegar num menu) bem antes de qualquer câmera começar a girar sozinha.
 *
 * API PÚBLICA (única, pequena de propósito):
 *   - AudioFX.tocarSomMotor(iniciar: true|false) — true liga o zumbido do
 *     motor (ou já deixa agendado pra ligar assim que o áudio destravar);
 *     false desliga. Chamadas repetidas com o mesmo valor são baratas/no-op
 *     (não reinicia o oscilador à toa a cada quadro de um script que chama
 *     isto sem parar).
 *   - AudioFX.disponivel() — true se o `AudioContext` já foi criado/
 *     destravado (útil só pra diagnóstico/log; NÃO é preciso checar isto
 *     antes de chamar `tocarSomMotor`, que já lida com o caso "ainda
 *     travado" sozinho).
 *   - AudioFX.tocarSomMotorCarro(ligar: true|false, velocidadeAtual: number)
 *     — [13/09/2026] NOVO, mesma técnica/infraestrutura do item acima, MAS
 *     API/estado SEPARADOS (ver comentário grande junto da implementação,
 *     mais abaixo, pra por quê): liga/desliga o zumbido do motor do "carro
 *     dirigível" (view3d.js `_updateCarrosControlados`) e, enquanto ligado,
 *     ajusta a frequência do oscilador proporcional a `velocidadeAtual`
 *     (m/s) a cada chamada — não precisa esperar `ligar` mudar de valor pra
 *     ouvir o pitch subir/descer com a velocidade.
 *
 * Pensado desde já pra qualquer outro som pontual do app reaproveitar esta
 * mesma infraestrutura de desbloqueio (`_ensureUnlocked`/fila de pendências)
 * sem duplicar a lógica de autoplay — mas, por enquanto, o único som real
 * implementado é o do motor da câmera (escopo desta rodada). */
window.AudioFX = {
  _ctx: null,
  _unlockListenersAdded: false,
  _motorOsc: null,   // oscilador grave (o "corpo" do zumbido do servo)
  _motorLfo: null,   // oscilador lento modulando o ganho (o "tremor"/textura do motor)
  _motorLfoGain: null,
  _motorGain: null,  // ganho mestre do som do motor (fade in/out suave, evita "clique" audível)
  _motorLigado: false, // último estado PEDIDO (true/false) — não confundir com o oscilador já existir de fato
  _pendenteAoDestravar: null, // guarda o último `iniciar` pedido ANTES do áudio destravar

  /** true assim que o AudioContext existe e não está mais suspenso (ou seja,
   *  a primeira interação do usuário já aconteceu). Só informativo. */
  disponivel() {
    return !!this._ctx && this._ctx.state === 'running';
  },

  /** Registra (uma única vez) os listeners de destravamento no documento.
   *  Chamado sozinho na primeira `tocarSomMotor` — nenhum outro arquivo do
   *  app precisa saber que isto existe. */
  _ensureUnlockListeners() {
    if (this._unlockListenersAdded) return;
    this._unlockListenersAdded = true;
    const destravar = () => {
      try {
        if (!this._ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return; // navegador sem Web Audio API — som simplesmente não toca, sem quebrar o app
          this._ctx = new AC();
        }
        if (this._ctx.state === 'suspended') this._ctx.resume();
        // Se algum código já tinha pedido pra tocar o motor ANTES do áudio
        // destravar, aplica agora que já dá pra criar nós de áudio de verdade.
        if (this._pendenteAoDestravar !== null) {
          const pendente = this._pendenteAoDestravar;
          this._pendenteAoDestravar = null;
          this.tocarSomMotor(pendente);
        }
      } catch (err) {
        console.warn('[AudioFX] não foi possível iniciar o áudio (navegador pode ter bloqueado):', err);
      }
    };
    // `once:true` — cada listener se remove sozinho depois de disparar 1x;
    // os 3 juntos cobrem mouse, toque (o pointerdown já cobre touch/caneta
    // em navegadores modernos) e teclado, sem duplicar destravamento.
    document.addEventListener('pointerdown', destravar, { once: true, passive: true });
    document.addEventListener('keydown', destravar, { once: true });
  },

  /** Liga (`iniciar:true`) ou desliga (`iniciar:false`) o zumbido sintético
   *  do motor/servo. Seguro de chamar a cada quadro de um script (ex.: um
   *  `Update()` que checa `this._estado==='girando'` toda vez) — só faz
   *  trabalho de verdade quando o valor pedido MUDA em relação ao último. */
  tocarSomMotor(iniciar) {
    this._ensureUnlockListeners();
    if (!this._ctx || this._ctx.state !== 'running') {
      // Áudio ainda travado (nenhuma interação do usuário até agora) — só
      // memoriza a intenção mais recente; `_ensureUnlockListeners` reaplica
      // assim que destravar. Sem erro, sem log de barulho a cada quadro.
      this._pendenteAoDestravar = iniciar;
      return;
    }
    if (iniciar === this._motorLigado) return; // já está no estado pedido — no-op
    this._motorLigado = iniciar;
    const ctx = this._ctx;
    const AGORA = ctx.currentTime;
    const FADE = 0.08; // segundos — evita "clique" audível ligando/desligando abrupto
    if (iniciar) {
      if (this._motorOsc) return; // já ligado (defensivo — não deveria cair aqui, ver guard acima)
      // Oscilador principal: onda "sawtooth" grave (~70Hz) — mais "elétrica"/
      // mecânica do que uma senoide pura, lembrando um servo motor pequeno.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(70, AGORA);
      // LFO (baixa frequência) modulando o GANHO do oscilador principal —
      // dá o "tremor"/textura de motor girando sob esforço, em vez de um tom
      // constante e artificial demais.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(9, AGORA); // ~9 tremores por segundo
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0.15, AGORA); // profundidade da modulação (0..1 do ganho mestre)
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0, AGORA);
      masterGain.gain.linearRampToValueAtTime(0.06, AGORA + FADE); // volume BAIXO de propósito — som ambiente, não protagonista
      lfo.connect(lfoGain);
      lfoGain.connect(masterGain.gain); // LFO soma/subtrai em cima do ganho-base acima
      osc.connect(masterGain);
      masterGain.connect(ctx.destination);
      osc.start();
      lfo.start();
      this._motorOsc = osc;
      this._motorLfo = lfo;
      this._motorLfoGain = lfoGain;
      this._motorGain = masterGain;
    } else {
      const osc = this._motorOsc, lfo = this._motorLfo, gain = this._motorGain;
      if (!osc) return; // já estava desligado
      this._motorOsc = this._motorLfo = this._motorLfoGain = this._motorGain = null;
      try {
        gain.gain.cancelScheduledValues(AGORA);
        gain.gain.setValueAtTime(gain.gain.value, AGORA);
        gain.gain.linearRampToValueAtTime(0, AGORA + FADE);
      } catch (err) { /* nó já pode ter sido desconectado — ignora */ }
      // Para os osciladores um pouco DEPOIS do fade-out terminar, não na
      // hora — parar um oscilador com ganho ainda audível soa como um corte
      // seco ("clique").
      setTimeout(() => {
        try { osc.stop(); lfo.stop(); } catch (err) { /* já parado/desconectado */ }
      }, Math.ceil(FADE * 1000) + 20);
    }
  },

  // [13/09/2026] NOVO — som do motor do "carro dirigível" (pedido verbatim:
  // "Som do motor (reaproveitando js/audio.js): enquanto _carroControlado
  // ativo e velocidade>0.1, toque um som contínuo de motor com pitch
  // proporcional à velocidade"). DELIBERADAMENTE um estado/API SEPARADOS de
  // `tocarSomMotor`/`_motorOsc` acima (o zumbido da câmera PS1) — mesmo
  // reaproveitando a MESMA técnica (oscilador serrote grave + LFO de
  // textura + fade in/out via GainNode, comentário grande no topo deste
  // arquivo explica a decisão de síntese em vez de arquivo .mp3, vale
  // igualmente aqui) — os dois sons podem, em teoria, precisar tocar ao
  // mesmo tempo (uma câmera PS1 girando enquanto o jogador dirige por
  // perto) e compartilhar as MESMAS variáveis de instância quebraria um
  // dos dois nesse cenário raro.
  _carroOsc: null,
  _carroLfo: null,
  _carroLfoGain: null,
  _carroGain: null,
  _carroLigado: false,

  /** Liga/desliga o zumbido do motor do carro e, enquanto ligado, ajusta a
   *  FREQUÊNCIA do oscilador principal proporcional a `velocidadeAtual`
   *  (m/s) — mais acelerado, motor mais agudo, igual um motor de verdade
   *  "subindo de marcha" (aproximação simples, sem simular marchas de
   *  verdade — fora de escopo). Chamado TODO quadro por
   *  `view3d.js _updateCarrosControlados` enquanto `_carroControlado`
   *  estiver ativo (o `ligar` muda de valor só ao entrar/sair do carro ou
   *  cruzar o limiar de velocidade 0.1 m/s citado no pedido — variar só a
   *  frequência, com o motor já ligado, é barato/sem religar nada). */
  tocarSomMotorCarro(ligar, velocidadeAtual) {
    this._ensureUnlockListeners();
    if (!this._ctx || this._ctx.state !== 'running') return; // sem áudio destravado ainda — ignora (o próximo quadro chama de novo, sem prejuízo perceptível; diferente de tocarSomMotor acima, sem fila de pendência aqui de propósito, já que este é chamado a cada quadro enquanto dirigindo, não uma vez só)
    const ctx = this._ctx;
    const AGORA = ctx.currentTime;
    const FADE = 0.12;
    if (ligar) {
      // Frequência: 55Hz "em marcha lenta" (velocidade~0) subindo até
      // ~180Hz perto da velocidade máxima documentada em
      // `_updateCarrosControlados` (20 m/s) — `Math.abs` trata marcha-ré
      // (velocidade negativa) igual à frente, motor não "sabe" o sentido.
      const v = Math.min(20, Math.abs(velocidadeAtual || 0));
      const freq = 55 + (v / 20) * 125;
      if (!this._carroOsc) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, AGORA);
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(12, AGORA);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0.12, AGORA);
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0, AGORA);
        masterGain.gain.linearRampToValueAtTime(0.05, AGORA + FADE); // volume baixo — som ambiente, mesmo critério do motor da câmera acima
        lfo.connect(lfoGain);
        lfoGain.connect(masterGain.gain);
        osc.connect(masterGain);
        masterGain.connect(ctx.destination);
        osc.start();
        lfo.start();
        this._carroOsc = osc; this._carroLfo = lfo; this._carroLfoGain = lfoGain; this._carroGain = masterGain;
        this._carroLigado = true;
      } else {
        // Já ligado — só desliza a frequência suavemente até o novo valor
        // (evita "degrau" audível de pitch a cada quadro, chamado várias
        // vezes por segundo sem essa suavização).
        try { this._carroOsc.frequency.linearRampToValueAtTime(freq, AGORA + 0.08); } catch (err) { /* nó já pode ter sido descartado num quadro concorrente — ignora */ }
      }
    } else {
      if (!this._carroOsc) { this._carroLigado = false; return; } // já estava desligado
      const osc = this._carroOsc, lfo = this._carroLfo, gain = this._carroGain;
      this._carroOsc = this._carroLfo = this._carroLfoGain = this._carroGain = null;
      this._carroLigado = false;
      try {
        gain.gain.cancelScheduledValues(AGORA);
        gain.gain.setValueAtTime(gain.gain.value, AGORA);
        gain.gain.linearRampToValueAtTime(0, AGORA + FADE);
      } catch (err) { /* nó já pode ter sido desconectado — ignora */ }
      setTimeout(() => {
        try { osc.stop(); lfo.stop(); } catch (err) { /* já parado/desconectado */ }
      }, Math.ceil(FADE * 1000) + 20);
    }
  },
};
