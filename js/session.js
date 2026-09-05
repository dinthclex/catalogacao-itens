/**
 * session.js — Identidade única deste aparelho/instalação do app (persistida em
 * localStorage, sobrevive a recarregar a página — diferente do "setor da sessão",
 * que é por aba/abertura e fica em sessionStorage).
 *
 * É essa identidade que permite vários PCs e celulares catalogarem SIMULTANEAMENTE
 * e sem conflito: todo item já nasce com um id globalmente único (crypto.randomUUID,
 * gerado em db.js) e é carimbado com o ID (e apelido) do aparelho que o cadastrou.
 * Assim:
 *   1) dois aparelhos nunca sobrescrevem o item um do outro, mesmo enviando ao mesmo
 *      tempo para o mesmo servidor;
 *   2) cadastrar o MESMO número de patrimônio em dois aparelhos gera dois catálogos
 *      independentes — nenhum é perdido, e a busca mostra os dois numa lista;
 *   3) dá pra ver, na busca/detalhe do item, de qual aparelho veio cada catálogo.
 *
 * Pedido do usuário (27/08/2026, histórico): "o campo 'Cadastrado por' deve
 * ser mais completo agora de modo que o dispositivo seja mais único" — duas
 * peças, que se complementam (a "implementação mista" que o usuário descreveu):
 *   A) `id` acima (UUID em localStorage) — já existia, é o método "mais simples e
 *      direto": sobrevive a recarregar a página, mas SOME se a pessoa limpar os
 *      dados do site/navegador (nesse caso, um novo `id` é gerado do zero).
 *   B) `deviceFingerprint` — um hash combinando várias características de
 *      HARDWARE/navegador (não depende de nenhum dado gravado no aparelho) —
 *      mesmo que o localStorage seja limpo, o fingerprint tende a continuar o
 *      mesmo, permitindo reconhecer "isto muito provavelmente é o mesmo
 *      aparelho de antes" mesmo sem o `id` persistido.
 * Nenhum dos dois IDENTIFICA a pessoa dona do aparelho — só permite diferenciar
 * fisicamente um aparelho de outro (o objetivo aqui: saber quantos/quais aparelhos
 * distintos foram usados pra catalogar, não quem são as pessoas).
 *
 * MODULARIZAÇÃO (27/08/2026, pedido do usuário: "Tudo referente a
 * 'identificação do aparelho para tornar o dispositivo único' deve ficar em
 * um arquivo a parte"): toda a peça B (cálculo do fingerprint — GPU, canvas,
 * áudio, fontes, RAM/tela estimada etc.) foi movida para o novo módulo
 * js/devicefingerprint.js (window.DeviceFingerprint) — carregado ANTES deste
 * arquivo no index.html. session.js continua dono só da peça A (id/label
 * simples em localStorage) e chama DeviceFingerprint para preencher
 * deviceInfoText/deviceDetails/deviceFingerprint abaixo.
 */
const Session = {
  id: null,
  label: null,
  // Preenchido em segundo plano por _loadDeviceInfo() logo abaixo — pode
  // ainda estar null nos primeiríssimos itens salvos bem na abertura do app
  // (a consulta ao navegador, quando disponível, é assíncrona).
  deviceInfoText: null,
  // Pacote completo (não só o resumo em texto acima) com cada dado bruto
  // coletado — útil se algum dia precisar mostrar/exportar os detalhes
  // separadamente em vez do texto já formatado.
  deviceDetails: null,
  // Hash de identificação de hardware/navegador (ver comentário grande
  // acima) — também preenchido em segundo plano, de forma assíncrona
  // (algumas das fontes usadas, como a renderização de áudio, só respondem
  // depois de alguns instantes).
  deviceFingerprint: null,
  IP_SETTING: 'capturarIpPublico',

  init() {
    this.id = localStorage.getItem('catalogo_device_id');
    if (!this.id) {
      this.id = this._genId();
      localStorage.setItem('catalogo_device_id', this.id);
    }
    this.label = localStorage.getItem('catalogo_device_label') || this._defaultLabel();
    this._loadDeviceInfo(); // não bloqueia — só preenche deviceInfoText/deviceDetails quando terminar
    this._computeFingerprint(); // idem, pra deviceFingerprint
    return this;
  },

  /**
   * Informação BEST-EFFORT do aparelho — usada para enriquecer "Cadastrado
   * por" nos itens. IMPORTANTE: isto NÃO é o nome que a pessoa deu ao
   * computador/celular nas configurações do sistema (ex: "PC-ALEX"), nem o
   * endereço MAC — nenhum navegador, em nenhuma plataforma, expõe esse nome
   * nem o MAC para uma página web comum (é bloqueado de propósito, por
   * privacidade/segurança).
   *
   * (27/08/2026) A implementação de verdade mora agora em
   * js/devicefingerprint.js (window.DeviceFingerprint.loadDeviceInfo()) —
   * ver o comentão de MODULARIZAÇÃO no topo deste arquivo.
   */
  async _loadDeviceInfo() {
    try {
      const info = await window.DeviceFingerprint?.loadDeviceInfo?.();
      this.deviceInfoText = info?.deviceInfoText ?? null;
      this.deviceDetails = info?.deviceDetails ?? null;
    } catch (e) { /* nunca deve travar o app por causa disto */ }
  },

  /**
   * "Impressão digital" do aparelho — combina várias características de
   * hardware/navegador que, JUNTAS, tendem a ser únicas o bastante para
   * diferenciar aparelhos, mesmo que o localStorage (o `id` acima) seja
   * apagado. Não identifica a PESSOA — só ajuda a reconhecer "este aparelho
   * físico já apareceu antes".
   *
   * (27/08/2026) A implementação de verdade (GPU/canvas/áudio/fontes/fuso/
   * idioma etc.) mora agora em js/devicefingerprint.js
   * (window.DeviceFingerprint.computeFingerprint()) — ver o comentão de
   * MODULARIZAÇÃO no topo deste arquivo. Resultado gravado em
   * `deviceFingerprint` (hash cyrb53 de Utils.hashString — mesmo algoritmo já
   * usado em outras partes do app, ver db.js computeConferenciaId).
   */
  async _computeFingerprint() {
    try {
      this.deviceFingerprint = (await window.DeviceFingerprint?.computeFingerprint?.()) ?? null;
    } catch (e) { this.deviceFingerprint = null; }
  },

  // ---------- IP público (opcional, desativado por padrão) ----------
  /** Navegadores NUNCA expõem o IP real (nem o MAC) deste aparelho para uma
   *  página web — o mais próximo disso é consultar um serviço externo que
   *  devolve o IP PÚBLICO da rede (o do roteador/operadora, compartilhado por
   *  todos os aparelhos dessa rede — não identifica o aparelho exato). Por
   *  isso vem DESATIVADO por padrão, exige internet, e falhas só ficam no
   *  log de eventos (nunca impedem o item de ser salvo). */
  async isIpCaptureEnabled() {
    try { return !!(await window.DB?.getSetting?.(this.IP_SETTING, false)); } catch (e) { return false; }
  },
  async setIpCaptureEnabled(v) { try { await window.DB?.setSetting?.(this.IP_SETTING, !!v); } catch (e) { /* ignora */ } },

  _timeoutSignal(ms) {
    try { return AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined; } catch (e) { return undefined; }
  },

  async getPublicIpIfEnabled() {
    try {
      if (!(await this.isIpCaptureEnabled())) return null;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
      const res = await fetch('https://api.ipify.org?format=json', { signal: this._timeoutSignal(4000) });
      if (!res.ok) throw new Error('resposta ' + res.status);
      const data = await res.json();
      return data?.ip || null;
    } catch (e) {
      window.EventLog?.log?.(`IP público: não foi possível obter (${e.message || e}).`, { tipo: 'aviso' });
      return null;
    }
  },

  _genId() {
    try {
      if (crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
    } catch (e) { /* segue para o fallback */ }
    return 'dev-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  },

  _defaultLabel() {
    const tipo = (window.Utils?.isMobileDevice?.() ?? /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '')) ? 'Celular' : 'PC';
    return `${tipo}-${(this.id || '????').slice(0, 4)}`;
  },

  setLabel(label) {
    this.label = (label || '').trim() || this._defaultLabel();
    localStorage.setItem('catalogo_device_label', this.label);
    return this.label;
  },
};

window.Session = Session;
