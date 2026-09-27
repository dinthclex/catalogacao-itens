/**
 * js/lib/tweenengine.js — Motor de interpolação (tweening) do app
 * (`window.TWEEN`), sintaxe compatível com a Tween.js "de verdade" (mesmos
 * nomes: `TWEEN.Tween`, `.to()`, `.duration()`, `.easing()`, `.delay()`,
 * `.repeat()`, `.yoyo()`, `.chain()`, `.onUpdate()`/`.onComplete()`/
 * `.onStop()`, `.start()`/`.stop()`, `TWEEN.update()`, `TWEEN.Group`,
 * `TWEEN.Easing.*`), pra scripts escritos pra uma lib de tween qualquer
 * funcionarem aqui sem precisar reaprender nada:
 *
 *   new TWEEN.Tween(obj.position)
 *     .to({ y: obj.position.y + 0.4 }, 800)
 *     .easing(TWEEN.Easing.Elastic.Out)
 *     .yoyo(true).repeat(Infinity)
 *     .start();
 *
 * [26/09/2026] DECISÃO — chegamos a vendorizar a biblioteca "Tween.js" de
 * terceiros de verdade (`lib/tween.umd.js`, build UMD oficial que o
 * usuário enviou), mas ela tinha uma pegadinha de versão (a partir da v18):
 * `new Tween(objeto)` SEM um 2º argumento (`group`) nunca entra no grupo
 * que `TWEEN.update()` de fato atualiza — animações feitas com a sintaxe
 * simples documentada (a de cima, sem gerenciar grupo manualmente) não
 * animavam NADA, silenciosamente, sem erro nenhum. Precisou de um "shim"
 * por cima só pra restaurar o comportamento simples esperado. Decisão:
 * ficar só com ESTE motor (escrito do zero pra este projeto, não é uma
 * cópia de nenhuma lib de terceiros) — MESMA sintaxe pra quem usa de fora,
 * mas sem a pegadinha (o comportamento "sem 2º argumento = grupo padrão,
 * sempre" é o único que existe aqui). Também garante zero dependência de
 * rede: carregado como <script> clássico (igual a TODOS os outros
 * arquivos de js/ — ver index.html), funciona tanto aberto direto como
 * arquivo (file:///.../index.html) quanto por qualquer servidor.
 */
(function (global) {
  'use strict';

  const _all = new Set(); // todos os tweens ativos nesta "instância" global

  /** Funções de suavização (easing) — entrada/saída 0..1 -> 0..1.
   *  Fórmulas-padrão de animação (as mesmas usadas por praticamente
   *  qualquer motor de tween do mercado — são funções matemáticas
   *  genéricas, não texto/código de nenhuma biblioteca específica). */
  const Easing = {
    Linear: { None: (k) => k },
    Quadratic: {
      In: (k) => k * k,
      Out: (k) => k * (2 - k),
      InOut: (k) => (k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k),
    },
    Cubic: {
      In: (k) => k * k * k,
      Out: (k) => --k * k * k + 1,
      InOut: (k) => (k < 0.5 ? 4 * k * k * k : (k - 1) * (2 * k - 2) * (2 * k - 2) + 1),
    },
    Sinusoidal: {
      In: (k) => 1 - Math.cos((k * Math.PI) / 2),
      Out: (k) => Math.sin((k * Math.PI) / 2),
      InOut: (k) => 0.5 * (1 - Math.cos(Math.PI * k)),
    },
    Exponential: {
      In: (k) => (k === 0 ? 0 : Math.pow(1024, k - 1)),
      Out: (k) => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k)),
      InOut: (k) => {
        if (k === 0) return 0;
        if (k === 1) return 1;
        if ((k *= 2) < 1) return 0.5 * Math.pow(1024, k - 1);
        return 0.5 * (-Math.pow(2, -10 * (k - 1)) + 2);
      },
    },
    Elastic: {
      In: (k) => {
        if (k === 0) return 0;
        if (k === 1) return 1;
        return -Math.pow(2, 10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI);
      },
      Out: (k) => {
        if (k === 0) return 0;
        if (k === 1) return 1;
        return Math.pow(2, -10 * k) * Math.sin((k - 0.1) * 5 * Math.PI) + 1;
      },
      InOut: (k) => {
        if (k === 0) return 0;
        if (k === 1) return 1;
        k *= 2;
        if (k < 1) return -0.5 * Math.pow(2, 10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI);
        return 0.5 * Math.pow(2, -10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI) + 1;
      },
    },
    Bounce: {
      In: (k) => 1 - Easing.Bounce.Out(1 - k),
      Out: (k) => {
        if (k < 1 / 2.75) return 7.5625 * k * k;
        if (k < 2 / 2.75) return 7.5625 * (k -= 1.5 / 2.75) * k + 0.75;
        if (k < 2.5 / 2.75) return 7.5625 * (k -= 2.25 / 2.75) * k + 0.9375;
        return 7.5625 * (k -= 2.625 / 2.75) * k + 0.984375;
      },
      InOut: (k) => (k < 0.5 ? Easing.Bounce.In(k * 2) * 0.5 : Easing.Bounce.Out(k * 2 - 1) * 0.5 + 0.5),
    },
    Back: {
      In: (k) => 2.70158 * k * k * k - 1.70158 * k * k,
      Out: (k) => 1 - Easing.Back.In(1 - k),
      InOut: (k) => (k < 0.5 ? Easing.Back.In(k * 2) * 0.5 : Easing.Back.Out(k * 2 - 1) * 0.5 + 0.5),
    },
  };

  function interpolateValue(start, end, t) {
    return start + (end - start) * t;
  }

  class Tween {
    constructor(object) {
      this._object = object;
      this._valuesStart = {};
      this._valuesEnd = {};
      this._duration = 1000;
      this._easingFn = Easing.Linear.None;
      this._startTime = null;
      this._delayTime = 0;
      this._repeat = 0;
      this._yoyo = false;
      this._reversed = false;
      this._onUpdateCb = null;
      this._onCompleteCb = null;
      this._onStopCb = null;
      this._running = false;
      this._chainedTweens = [];
    }

    to(properties, durationMs) {
      this._valuesEnd = properties;
      if (typeof durationMs === 'number') this._duration = durationMs;
      return this;
    }

    duration(ms) { this._duration = ms; return this; }
    easing(fn) { this._easingFn = fn || Easing.Linear.None; return this; }
    delay(ms) { this._delayTime = ms; return this; }
    repeat(n) { this._repeat = n; return this; }
    yoyo(flag) { this._yoyo = !!flag; return this; }
    onUpdate(cb) { this._onUpdateCb = cb; return this; }
    onComplete(cb) { this._onCompleteCb = cb; return this; }
    onStop(cb) { this._onStopCb = cb; return this; }
    chain(...tweens) { this._chainedTweens = tweens; return this; }

    start(time) {
      _all.add(this);
      this._running = true;
      this._startTime = (typeof time === 'number' ? time : now()) + this._delayTime;
      this._valuesStart = {};
      for (const prop in this._valuesEnd) {
        // Se a propriedade não existir ainda no objeto (comum em scripts
        // animando um campo opcional, ex.: `elevacao` num objeto que nunca
        // teve elevação própria), começa de 0 em vez de `undefined` — sem
        // isso a interpolação resultaria em `NaN` (0 é o valor-padrão de
        // toda propriedade numérica não-definida deste tipo no app).
        const atual = this._object[prop];
        this._valuesStart[prop] = typeof atual === 'number' ? atual : 0;
      }
      return this;
    }

    stop() {
      if (!this._running) return this;
      _all.delete(this);
      this._running = false;
      if (this._onStopCb) this._onStopCb(this._object);
      return this;
    }

    isPlaying() { return this._running; }

    update(time) {
      if (!this._running) return false;
      if (time < this._startTime) return true;
      const elapsed = (time - this._startTime) / this._duration;
      const t = Math.min(1, elapsed);
      const easedT = this._easingFn(this._reversed ? 1 - t : t);
      for (const prop in this._valuesEnd) {
        const startVal = this._valuesStart[prop];
        const endVal = this._valuesEnd[prop];
        if (typeof startVal === 'number' && typeof endVal === 'number') {
          this._object[prop] = interpolateValue(startVal, endVal, easedT);
        }
      }
      if (this._onUpdateCb) this._onUpdateCb(this._object, t);
      if (t >= 1) {
        if (this._repeat > 0 || this._repeat === Infinity) {
          if (this._repeat !== Infinity) this._repeat--;
          if (this._yoyo) this._reversed = !this._reversed;
          this._startTime = time + this._delayTime;
          return true;
        }
        this._running = false;
        _all.delete(this);
        if (this._onCompleteCb) this._onCompleteCb(this._object);
        for (const nextTween of this._chainedTweens) nextTween.start(time);
        return false;
      }
      return true;
    }
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function update(time) {
    const t = typeof time === 'number' ? time : now();
    for (const tween of Array.from(_all)) tween.update(t);
    return _all.size > 0;
  }

  function removeAll() {
    for (const tween of Array.from(_all)) tween.stop();
  }

  /** `TWEEN.Group` — pra quem QUISER gerenciar um conjunto de tweens
   *  separado do padrão global (mesmo espírito da Tween.js "de verdade"),
   *  chamando `grupo.update()` no lugar de `TWEEN.update()`. Sem nenhuma
   *  pegadinha de 2º argumento: usar `TWEEN.Tween` normalmente (sem grupo)
   *  sempre entra no grupo padrão global — `Group` é só um extra opcional,
   *  nunca obrigatório. */
  class Group {
    constructor() { this._tweens = new Set(); }
    add(tween) { this._tweens.add(tween); return this; }
    remove(tween) { this._tweens.delete(tween); return this; }
    removeAll() { for (const t of Array.from(this._tweens)) t.stop(); this._tweens.clear(); }
    update(time) {
      const t = typeof time === 'number' ? time : now();
      for (const tween of Array.from(this._tweens)) tween.update(t);
      return this._tweens.size > 0;
    }
  }

  const TWEEN = { Tween, Easing, Group, update, removeAll, now };
  global.TWEEN = TWEEN;
})(typeof window !== 'undefined' ? window : this);
