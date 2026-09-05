/**
 * geo.js — Geolocalização (GPS/rede) opcional, além da posição no mapa.
 *
 * O item já guarda uma posição RELATIVA ao mapa construído (mapaX/mapaY,
 * em metros a partir da origem do mapeamento). Este módulo adiciona, quando
 * disponível e permitido pelo usuário, uma posição GLOBAL (latitude/
 * longitude do GPS do aparelho) — útil para saber em qual prédio/área um
 * item foi cadastrado quando há vários locais distantes entre si, ou quando
 * ainda não existe mapa nenhum construído.
 *
 * 100% local: a posição só é lida da API de geolocalização do navegador e
 * fica guardada no item, como qualquer outro campo — só sai deste aparelho
 * se você mesmo configurar e ativar o envio por servidor/email.
 *
 * PERMISSÃO: antes, o app pedia a localização escondido dentro do fluxo de
 * captura (toda vez que a tela "Capturar" abria, ou a cada item manual) — em
 * alguns navegadores/aparelhos isso fazia o pedido nativo aparecer de novo a
 * cada item, em vez de só uma vez. Agora existe um botão dedicado nas
 * Configurações ("Ativar geolocalização") que pede a permissão UMA VEZ, de
 * propósito, a partir de um clique explícito do usuário — e o resultado fica
 * guardado (settings.js). O restante do app só tenta usar geolocalização
 * automaticamente se já souber que a permissão foi concedida (pela consulta
 * ao navegador, quando suportada, ou pelo que foi guardado da última vez que
 * o botão foi usado) — nunca mais dispara o pedido nativo escondido no meio
 * da captura.
 */
const Geo = {
  last: null, // { lat, lng, accuracy, obtidoEm }
  _watchId: null,
  _listeners: [],
  PERM_SETTING: 'geoPermissaoConcedida',

  /** Registra uma função para ser chamada a cada atualização de posição
   *  recebida enquanto start() estiver ativo (ex.: modo assistido 2D por
   *  GPS, no Mapa) — devolve uma função para cancelar o registro. */
  addListener(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter((f) => f !== fn); };
  },

  isAvailable() {
    return 'geolocation' in navigator;
  },

  /** O que a gente mesmo guardou da última vez que a permissão foi resolvida
   *  (pelo botão em Configurações, ou por uma tentativa anterior bem-sucedida). */
  async hasStoredPermission() {
    return DB.getSetting(this.PERM_SETTING, false);
  },

  /** Consulta o estado ATUAL da permissão diretamente no navegador — mais
   *  confiável que qualquer coisa guardada por nós, mas nem todo navegador
   *  suporta consultar a permissão de geolocalização (ex.: Safari não). */
  async browserPermissionState() {
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        return status.state; // 'granted' | 'denied' | 'prompt'
      }
    } catch (e) { /* navegador não suporta consultar esta permissão especificamente */ }
    return null;
  },

  /** Já podemos tentar usar geolocalização automaticamente (sem arriscar
   *  disparar um pedido nativo escondido no meio da captura)? Prioriza a
   *  consulta ao navegador; sem suporte a ela, usa o que já foi guardado. */
  async isPermissionGranted() {
    const state = await this.browserPermissionState();
    if (state === 'granted') return true;
    if (state === 'denied') return false;
    return this.hasStoredPermission(); // 'prompt' ou consulta indisponível
  },

  /**
   * Pede a permissão DE PROPÓSITO — chamado pelo botão "Ativar geolocalização"
   * nas Configurações, disparado por um clique explícito do usuário (o jeito
   * mais confiável de um navegador aceitar mostrar o pedido nativo). Guarda o
   * resultado para as próximas vezes.
   */
  async requestPermission() {
    if (!this.isAvailable()) return { granted: false, motivo: 'Geolocalização não é suportada neste navegador.' };
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          this.last = {
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy, obtidoEm: DB.nowISO(),
          };
          await DB.setSetting(this.PERM_SETTING, true);
          window.EventLog?.log?.('Permissão de geolocalização concedida.', { tipo: 'ok' });
          resolve({ granted: true });
        },
        async (err) => {
          await DB.setSetting(this.PERM_SETTING, false);
          window.EventLog?.log?.(`Permissão de geolocalização negada/indisponível: ${err.message}`, { tipo: 'aviso' });
          resolve({ granted: false, motivo: err.message, code: err.code });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      );
    });
  },

  /** Observação contínua (baixo custo) enquanto a tela de captura está aberta
   *  — só inicia de fato se a permissão já foi concedida antes (pelo botão em
   *  Configurações); do contrário, não insiste sozinho. */
  async start() {
    if (!this.isAvailable() || this._watchId != null) return;
    if (!(await this.isPermissionGranted())) return;
    try {
      this._watchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.last = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            obtidoEm: DB.nowISO(),
          };
          this._listeners.forEach((fn) => { try { fn(this.last); } catch (e) { /* ignora erro de um listener */ } });
        },
        (err) => { console.warn('Geolocalização indisponível/negada:', err.message); },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 },
      );
    } catch (e) { console.warn('Geolocalização falhou ao iniciar:', e); }
  },

  stop() {
    if (this._watchId != null && this.isAvailable()) {
      navigator.geolocation.clearWatch(this._watchId);
    }
    this._watchId = null;
  },

  /** Última posição conhecida (do watch em andamento), se houver. */
  snapshot() {
    return this.last ? { ...this.last } : null;
  },

  /** Leitura pontual (para telas que não mantêm o watch ligado, ex.: form
   *  manual) — mesma regra: só tenta se a permissão já foi concedida antes. */
  async getOneShot({ timeout = 4000 } = {}) {
    if (this.last) return this.snapshot();
    if (!this.isAvailable()) return null;
    if (!(await this.isPermissionGranted())) return null;
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const fix = {
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy, obtidoEm: DB.nowISO(),
          };
          this.last = fix;
          finish(fix);
        },
        () => finish(null),
        { enableHighAccuracy: true, timeout, maximumAge: 30000 },
      );
      setTimeout(() => finish(null), timeout + 250);
    });
  },

  mapsLink(lat, lng) {
    return `https://maps.google.com/?q=${lat},${lng}`;
  },
};

window.Geo = Geo;
