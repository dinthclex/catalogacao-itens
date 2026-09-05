/**
 * gdrive.js — Backup no Google Drive DA PRÓPRIA PESSOA (conta pessoal), como
 * mais um "destino" além de baixar no aparelho / enviar a um servidor local.
 *
 * Como isto é um app 100% cliente (sem servidor próprio), a conexão com o
 * Google é feita com o login OAuth do NAVEGADOR (Google Identity Services —
 * o "Fazer login com o Google" padrão do próprio Google), pedindo só a
 * permissão "drive.file" — o app só enxerga/edita os arquivos que ELE MESMO
 * criou no Drive da pessoa (uma pasta "Catalogação de Itens"), nunca o resto
 * do Drive.
 *
 * IMPORTANTE (limitação real do Google, não deste app): o login do Google só
 * funciona com o app aberto por um endereço http/https de verdade (com um
 * "Client ID" cadastrado no Google Cloud Console autorizando aquele endereço)
 * — NÃO funciona abrindo o arquivo direto (file://) nem em IP local sem HTTPS
 * na maioria dos casos. Ver o guia enviado sobre como publicar o app num
 * endereço https gratuito (ex: GitHub Pages) pra poder usar esta função.
 * Todo o resto do app continua funcionando 100% offline/local sem isso.
 */

const GDrive = {
  CLIENT_ID_KEY: 'gdriveClientId',
  FOLDER_ID_KEY: 'gdriveFolderId',
  SCOPE: 'https://www.googleapis.com/auth/drive.file',

  _tokenClient: null,
  _accessToken: null,
  _tokenExpiresAt: 0,
  _userEmail: null,

  async getClientId() {
    try { return (await window.DB?.getSetting?.(this.CLIENT_ID_KEY, '')) || ''; } catch (e) { return ''; }
  },
  async setClientId(v) {
    try { await window.DB?.setSetting?.(this.CLIENT_ID_KEY, (v || '').trim()); } catch (e) { /* ignora */ }
    // trocar de Client ID invalida a sessão/pasta anteriores
    this._accessToken = null; this._tokenExpiresAt = 0; this._userEmail = null;
    try { await window.DB?.setSetting?.(this.FOLDER_ID_KEY, null); } catch (e) { /* ignora */ }
  },

  isConnected() { return !!this._accessToken && Date.now() < this._tokenExpiresAt; },
  connectedEmail() { return this._userEmail; },

  _loadGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve(true);
    return new Promise((resolve) => {
      const existente = document.querySelector('script[data-gsi]');
      if (existente) { existente.addEventListener('load', () => resolve(true)); existente.addEventListener('error', () => resolve(false)); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true; s.dataset.gsi = '1';
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  },

  /** Abre o consentimento do Google (se preciso) e guarda um token de acesso
   *  válido por ~1h — a pessoa continua "conectada" enquanto o app ficar
   *  aberto; ao reabrir o app, pede de novo (nenhuma senha/token fica salvo). */
  async connect() {
    const clientId = await this.getClientId();
    if (!clientId) throw new Error('Configure o "Client ID do Google Cloud" nas Configurações antes de conectar.');
    const ok = await this._loadGis();
    if (!ok || !window.google?.accounts?.oauth2) {
      throw new Error('Não foi possível carregar o login do Google — precisa de internet, e o app precisa estar aberto por um endereço http/https (não funciona abrindo o arquivo direto). Veja o guia de publicação.');
    }
    return new Promise((resolve, reject) => {
      try {
        this._tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: this.SCOPE,
          callback: async (resp) => {
            if (resp?.error) {
              window.EventLog?.log?.(`Google Drive: falha ao conectar (${resp.error}).`, { tipo: 'erro' });
              reject(new Error(resp.error));
              return;
            }
            this._accessToken = resp.access_token;
            this._tokenExpiresAt = Date.now() + (Number(resp.expires_in || 3600) * 1000) - 30000;
            try { this._userEmail = await this._fetchUserEmail(); } catch (e) { this._userEmail = null; }
            window.EventLog?.log?.(`Google Drive: conectado${this._userEmail ? ' como ' + this._userEmail : ''}.`, { tipo: 'ok' });
            resolve({ email: this._userEmail });
          },
          error_callback: (err) => {
            window.EventLog?.log?.(`Google Drive: login cancelado ou bloqueado (${err?.type || err}).`, { tipo: 'aviso' });
            reject(new Error(err?.type || 'Login cancelado.'));
          },
        });
        this._tokenClient.requestAccessToken({ prompt: this.isConnected() ? '' : 'consent' });
      } catch (e) { reject(e); }
    });
  },

  disconnect() {
    if (this._accessToken && window.google?.accounts?.oauth2?.revoke) {
      try { window.google.accounts.oauth2.revoke(this._accessToken, () => {}); } catch (e) { /* ignora */ }
    }
    this._accessToken = null; this._tokenExpiresAt = 0; this._userEmail = null;
    window.EventLog?.log?.('Google Drive: desconectado.', { tipo: 'info' });
  },

  async _fetchUserEmail() {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${this._accessToken}` },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.email || null;
  },

  async _ensureToken() {
    if (this.isConnected()) return this._accessToken;
    await this.connect();
    return this._accessToken;
  },

  /** Acha (ou cria, na primeira vez) a pasta "Catalogação de Itens" no Drive
   *  da pessoa — todos os backups enviados por este app vão sempre pra lá. */
  async _ensureFolder() {
    const salvo = await window.DB?.getSetting?.(this.FOLDER_ID_KEY, null);
    if (salvo) return salvo;
    const token = await this._ensureToken();
    const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and name='Catalogação de Itens' and trashed=false");
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Não foi possível procurar a pasta no Drive (${res.status}).`);
    const data = await res.json();
    let folderId = data?.files?.[0]?.id;
    if (!folderId) {
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Catalogação de Itens', mimeType: 'application/vnd.google-apps.folder' }),
      });
      if (!createRes.ok) throw new Error(`Não foi possível criar a pasta no Drive (${createRes.status}).`);
      const created = await createRes.json();
      folderId = created.id;
    }
    await window.DB?.setSetting?.(this.FOLDER_ID_KEY, folderId);
    return folderId;
  },

  /** Envia um arquivo de texto (JSON/TXT/CSV) pro Drive, dentro da pasta do
   *  app — upload "multipart" simples (sem biblioteca do Google, só fetch). */
  async uploadFile(filename, content, mimeType = 'application/json') {
    const token = await this._ensureToken();
    const folderId = await this._ensureFolder();
    const boundary = 'catalogacao-' + this._randomBoundary();
    const metadata = { name: filename, parents: [folderId] };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n` +
      `--${boundary}--`;
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Falha ao enviar pro Drive (${res.status}): ${t.slice(0, 200)}`);
    }
    return res.json();
  },

  _randomBoundary() {
    // sem Math.random no restante do app por causa de determinismo em testes,
    // mas aqui é só um separador de multipart — não precisa de criptografia,
    // só ser improvável de aparecer dentro do conteúdo enviado.
    return `${Date.now().toString(36)}${this._counter = (this._counter || 0) + 1}`;
  },
};

window.GDrive = GDrive;
