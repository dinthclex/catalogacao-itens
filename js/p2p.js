/**
 * p2p.js — Conexão DIRETA entre dois aparelhos (ex: celular com a câmera e PC
 * recebendo os itens), pela mesma rede Wi-Fi, SEM precisar de nenhum servidor
 * (nem PHP, nem Termux, nem XAMPP). Usa WebRTC (RTCPeerConnection + um
 * DataChannel), a mesma tecnologia usada por chamadas de vídeo direto no
 * navegador — aqui usada só para trocar dados.
 *
 * Como não existe NENHUM servidor envolvido (nem para os itens, nem para a
 * combinação inicial da conexão — chamada de "sinalização"), essa combinação
 * inicial é feita copiando um pequeno código de um aparelho e colando no
 * outro, uma ÚNICA vez (por WhatsApp, Bluetooth, e-mail, o que for mais fácil
 * entre os dois aparelhos que estão fisicamente juntos). Depois de conectados,
 * os itens catalogados são enviados diretamente de um aparelho para o outro,
 * sem passar por mais nada — inclusive continua funcionando sem internet
 * nenhuma, só com os dois aparelhos na mesma rede Wi-Fi (nenhum servidor STUN/
 * TURN externo é usado de propósito).
 *
 * Um aparelho é o "anfitrião" (quem RECEBE — normalmente o PC) e o outro é o
 * "convidado" (quem ENVIA — normalmente o celular, com a câmera). Uma vez
 * conectados, todo item novo catalogado no aparelho convidado é enviado
 * automaticamente para o anfitrião, que salva no próprio banco local dele
 * (IndexedDB) — os dois ficam com o catálogo combinado.
 */
const P2PModule = {
  _pc: null,
  _channel: null,
  _role: null, // 'host' | 'guest'
  _status: 'idle', // idle | connecting | connected | closed
  _statusHandlers: [],
  _recvBuffers: new Map(),
  _sendSeq: 0,
  _remoteLabel: null,
  sentCount: 0,
  receivedCount: 0,

  isSupported() {
    return typeof RTCPeerConnection !== 'undefined';
  },

  onStatus(cb) { this._statusHandlers.push(cb); },

  status() { return this._status; },
  remoteLabel() { return this._remoteLabel; },

  _setStatus(s) {
    const mudou = s !== this._status;
    this._status = s;
    if (mudou && (s === 'connected' || s === 'closed')) {
      window.EventLog?.log?.(s === 'connected'
        ? `Conexão direta (P2P) estabelecida${this._remoteLabel ? ' com ' + this._remoteLabel : ''}.`
        : 'Conexão direta (P2P) encerrada.', { tipo: s === 'connected' ? 'ok' : 'aviso' });
    }
    this._statusHandlers.forEach((cb) => { try { cb(s); } catch (e) { /* ignora erro de UI */ } });
  },

  /** Espera a coleta de candidatos de conexão (ICE) terminar, ou 4s, o que vier
   *  primeiro. Necessário porque, sem servidor de sinalização, o código trocado
   *  entre os aparelhos já precisa vir com TODOS os candidatos incluídos — não
   *  há como mandar mais depois de gerado o código. */
  _waitIceComplete(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      let t;
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          clearTimeout(t);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
      t = setTimeout(() => { pc.removeEventListener('icegatheringstatechange', check); resolve(); }, 4000);
    });
  },

  _newPeerConnection() {
    // iceServers vazio DE PROPÓSITO: os dois aparelhos estão na mesma rede
    // local, então os candidatos "host" (endereço na própria rede) já bastam
    // — não precisa de nenhum serviço externo pela internet para conectar.
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if ((s === 'disconnected' || s === 'failed' || s === 'closed') && this._status === 'connected') {
        this._setStatus('closed');
      }
    };
    return pc;
  },

  _wireChannel(channel) {
    this._channel = channel;
    channel.onopen = () => {
      this._setStatus('connected');
      try { channel.send(JSON.stringify({ t: 'hello', label: window.Session?.label || '?' })); } catch (e) { /* ignora */ }
    };
    channel.onclose = () => { if (this._status !== 'idle') this._setStatus('closed'); };
    channel.onerror = () => { /* oniceconnectionstatechange já cobre o status */ };
    channel.onmessage = (ev) => this._onMessage(ev.data);
  },

  async _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.t === 'hello') {
      this._remoteLabel = msg.label || null;
      this._setStatus('connected'); // reemite pra UI atualizar o nome do outro aparelho
      return;
    }
    if (msg.t !== 'chunk') return;
    let buf = this._recvBuffers.get(msg.id);
    if (!buf) { buf = { total: msg.n, parts: new Array(msg.n) }; this._recvBuffers.set(msg.id, buf); }
    buf.parts[msg.i] = msg.d;
    if (buf.parts.every((p) => p !== undefined)) {
      this._recvBuffers.delete(msg.id);
      try {
        const item = JSON.parse(buf.parts.join(''));
        const r = await window.DB.mergeFromRemote(item);
        if (r.changed) {
          this.receivedCount++;
          window.Utils?.toast?.(`📥 Item recebido de ${this._remoteLabel || 'outro aparelho'}: ${item.patrimonio || item.descricao || '(sem número)'}`, { type: 'ok', duration: 2200 });
          window.EventLog?.log?.(`Item recebido por conexão direta (P2P) de ${this._remoteLabel || 'outro aparelho'}: ${item.patrimonio || item.descricao || '(sem número)'}.`, { tipo: 'ok' });
          window.App?._refreshCurrentView?.();
        }
      } catch (e) { console.warn('P2P: item recebido inválido', e); }
    }
  },

  /** Lado que RECEBE (ex: PC) — gera o código de convite ("oferta"). */
  async createOffer() {
    this.disconnect();
    this._role = 'host';
    this._setStatus('connecting');
    const pc = this._newPeerConnection();
    this._pc = pc;
    this._wireChannel(pc.createDataChannel('catalogo', { ordered: true }));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this._waitIceComplete(pc);
    return JSON.stringify({ type: pc.localDescription.type, sdp: pc.localDescription.sdp });
  },

  /** Lado que RECEBE (ex: PC) — depois de colar a "resposta" gerada pelo outro aparelho. */
  async acceptAnswer(answerText) {
    if (!this._pc || this._role !== 'host') throw new Error('Gere um código de convite primeiro.');
    const desc = JSON.parse(answerText);
    await this._pc.setRemoteDescription(new RTCSessionDescription(desc));
  },

  /** Lado que ENVIA (ex: celular) — cola o código de convite do outro aparelho e gera a "resposta". */
  async acceptOfferAndCreateAnswer(offerText) {
    this.disconnect();
    this._role = 'guest';
    this._setStatus('connecting');
    const desc = JSON.parse(offerText);
    const pc = this._newPeerConnection();
    this._pc = pc;
    pc.ondatachannel = (e) => this._wireChannel(e.channel);
    await pc.setRemoteDescription(new RTCSessionDescription(desc));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this._waitIceComplete(pc);
    return JSON.stringify({ type: pc.localDescription.type, sdp: pc.localDescription.sdp });
  },

  disconnect() {
    if (this._channel) { try { this._channel.close(); } catch (e) { /* ignora */ } this._channel = null; }
    if (this._pc) { try { this._pc.close(); } catch (e) { /* ignora */ } this._pc = null; }
    this._role = null;
    this._remoteLabel = null;
    this._recvBuffers.clear();
    this._setStatus('idle');
  },

  /** Envia um item catalogado para o outro aparelho — sem efeito nenhum (nem
   *  erro) se não houver conexão ativa, para poder ser chamado sempre, do
   *  mesmo jeito que AutoSave.pushItem(). Divide em pedaços pequenos porque um
   *  item com foto pode passar do tamanho máximo de uma única mensagem do
   *  DataChannel. */
  async pushItem(item) {
    if (!this._channel || this._channel.readyState !== 'open') return { enviado: false };
    const CHUNK = 12000;
    const text = JSON.stringify(item);
    const total = Math.max(1, Math.ceil(text.length / CHUNK));
    const id = `${Date.now()}-${this._sendSeq++}`;
    for (let i = 0; i < total; i++) {
      const parte = text.slice(i * CHUNK, (i + 1) * CHUNK);
      this._channel.send(JSON.stringify({ t: 'chunk', id, i, n: total, d: parte }));
    }
    this.sentCount++;
    return { enviado: true };
  },
};

window.P2PModule = P2PModule;
