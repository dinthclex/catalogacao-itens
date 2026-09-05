/**
 * eventlog.js — Log de eventos: registro textual, em sequência, de coisas
 * relevantes que aconteceram na aplicação (item cadastrado/editado/excluído,
 * conexões — servidor/P2P —, permissões concedidas/negadas, ícone baixado da
 * internet ou não, erros ao salvar, etc.). Acessível pelo botão "📜 Ver log de
 * eventos" nas Configurações — útil pra entender o que aconteceu sem precisar
 * reproduzir o problema de novo.
 *
 * Guardado no localStorage deste aparelho (independente do IndexedDB, então
 * continua acessível mesmo se o banco principal tiver algum problema), com um
 * limite de entradas (as mais antigas vão saindo) pra não crescer sem parar —
 * não é um log de TODO clique/evento do navegador (isso encheria o
 * armazenamento sem trazer muito valor), e sim dos eventos que de fato
 * importam pra entender o uso do app.
 */
const EventLog = {
  KEY: 'catalogo_eventlog_v1',
  MAX: 500,

  isSupported() {
    try { return typeof localStorage !== 'undefined'; } catch (e) { return false; }
  },

  /** @param {string} mensagem @param {object} [opts] @param {'info'|'ok'|'aviso'|'erro'} [opts.tipo] */
  log(mensagem, { tipo = 'info' } = {}) {
    if (!this.isSupported()) return;
    try {
      const lista = this._readRaw();
      lista.push({ ts: new Date().toISOString(), tipo, mensagem: String(mensagem) });
      while (lista.length > this.MAX) lista.shift();
      localStorage.setItem(this.KEY, JSON.stringify(lista));
    } catch (e) { /* localStorage cheio/indisponível — nunca deve travar o app por causa do log */ }
  },

  getAll() { return this._readRaw(); },
  count() { return this._readRaw().length; },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* ignora */ } },

  _readRaw() {
    try {
      const raw = localStorage.getItem(this.KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  },
};

window.EventLog = EventLog;
