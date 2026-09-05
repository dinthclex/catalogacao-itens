/**
 * serverprefs.js — NOVO (01/09/2026), item GRANDE #3 do pedido de 12 itens,
 * verbatim: "Deve ser possível guardar direto em arquivo pelo servidor
 * local, além do indexedDB. [...] Deve ser possível guardar em uma pasta
 * dentro do projeto (para caso se exclua os dados do navegador e não se
 * tenha 'exportado', então, seja possível recuperar tudo). As configurações
 * e opções de menu devem ser guardadas em um arquivo a parte, algo como
 * 'preferências do usuário'." Mensagem de acompanhamento, também verbatim:
 * "Deve funcionar independente de navegador."
 *
 * Duas responsabilidades, ambas em cima do MESMO servidor local que já
 * existia pro salvamento automático de itens (autosave.js) e sincronização
 * (sync.js) — reaproveita a mesma chave `servidorUrl`, sem nenhuma
 * configuração nova pra pessoa preencher:
 *
 * 1) PREFERÊNCIAS — sempre que uma opção de verdade muda (ver
 *    `SettingsView.CHAVES_PREFERENCIA`, mesma lista usada pelo botão
 *    "Redefinir padrões do app" — nunca estado/dado/identidade), db.js
 *    chama `scheduleSync()` (debounced, alguns segundos), que envia TODAS
 *    as preferências atuais pro servidor de uma vez (ação
 *    "salvar-preferencias" — ver server/receive.js), num arquivo SEPARADO
 *    (preferencias-usuario.json) do catálogo de itens.
 * 2) BACKUP COMPLETO — a cada alguns minutos (`start()`, chamado 1x no
 *    boot do app — ver app.js), envia um espelho de `DB.exportAll()`
 *    inteiro (ação "salvar-backup-completo") — é o que permite "recuperar
 *    tudo" depois (ver `restaurarDoServidor`, chamada pelo botão
 *    "⬇️ Restaurar tudo do servidor" em Configurações → 🖥️ Servidor local)
 *    caso os dados do navegador sejam apagados sem um "exportar" manual
 *    ter sido feito antes.
 *
 * "Independente do navegador": o `server/receive.js` (novo, real, versionado
 * no projeto — ver esse arquivo) é um processo Node separado; uma vez
 * rodando, ele continua de pé e com os arquivos gravados em disco mesmo com
 * o navegador/aba FECHADOS — só reabrir o app depois (aqui ou noutro
 * aparelho) que ele volta a falar com o mesmo servidor.
 *
 * Sem `servidorUrl` configurada, este módulo inteiro não faz NADA (mesma
 * filosofia de autosave.js/sync.js) — o app continua 100% funcional só
 * localmente, e nenhuma das duas responsabilidades acima tenta se conectar
 * a lugar nenhum.
 */
const ServerPrefs = {
  _backupTimer: null,
  _debouncedPush: null,

  // 5 minutos — mesma ordem de grandeza do "quanto tempo eu aceitaria
  // perder de volta ao IndexedDB numa queda de energia/navegador travado",
  // sem gerar tráfego de rede a cada poucos segundos (o backup completo
  // pode ficar grande — fotos em base64 inclusas — diferente do "salvar-
  // item" de autosave.js, que já manda cada item na hora que é confirmado).
  BACKUP_INTERVALO_MS: 5 * 60 * 1000,

  /** Chamado 1x no boot do app (ver app.js, junto de SyncModule.startAuto/
   *  AutoExport.start) — liga o envio periódico do backup completo, se
   *  houver servidor configurado. Sem servidor, não faz nada (nem agenda o
   *  timer) — mesmo padrão de SyncModule.startAuto. */
  async start() {
    this.stopAuto();
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) return;
    this._pushBackupCompleto().catch(() => {});
    this._backupTimer = setInterval(() => { this._pushBackupCompleto().catch(() => {}); }, this.BACKUP_INTERVALO_MS);
  },

  stopAuto() {
    if (this._backupTimer) clearInterval(this._backupTimer);
    this._backupTimer = null;
  },

  /** Chamado por DB.setSetting/deleteSetting (ver db.js) toda vez que uma
   *  chave de PREFERÊNCIA de verdade muda (`SettingsView.CHAVES_PREFERENCIA`
   *  — db.js já filtra isso antes de chamar aqui, então esta função não
   *  precisa checar de novo). Debounced: mudar várias opções em sequência
   *  rápida (ex.: abrir Configurações e mexer em 5 campos seguidos) manda
   *  UM envio só, com o estado final, não um POST por tecla/clique. */
  scheduleSync() {
    if (!this._debouncedPush) this._debouncedPush = Utils.debounce(() => { this._pushPreferencias().catch(() => {}); }, 4000);
    this._debouncedPush();
  },

  async _pushPreferencias() {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) return;
    try {
      const preferencias = {};
      // Lê cada chave de novo (em vez de receber um "snapshot" de quem
      // chamou scheduleSync) de propósito — entre o momento em que o
      // debounce foi agendado e os 4s se passarem, outras preferências
      // podem ter mudado também; isto sempre manda o estado mais atual de
      // TODAS elas, nunca uma foto antiga de só a que disparou o debounce.
      for (const chave of SettingsView.CHAVES_PREFERENCIA) {
        preferencias[chave] = await DB.getSetting(chave, undefined);
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'salvar-preferencias', preferencias }),
      });
      // `serverPrefsUltimaEm` é um TIMESTAMP OPERACIONAL (mesma categoria de
      // `syncUltimaEm`/`autoExportUltimoEm`), de propósito FORA de
      // `SettingsView.CHAVES_PREFERENCIA` — se estivesse dentro, gravar ele
      // aqui reagendaria este mesmo envio pra sempre (db.js chama
      // scheduleSync de novo a cada setSetting de uma chave da lista).
      if (res.ok) await DB.setSetting('serverPrefsUltimaEm', DB.nowISO());
    } catch (e) { /* silencioso/não-bloqueante — mesmo padrão de autosave.js/sync.js */ }
  },

  async _pushBackupCompleto() {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) return;
    try {
      const backup = await DB.exportAll();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'salvar-backup-completo', backup }),
      });
      if (res.ok) await DB.setSetting('serverBackupUltimaEm', DB.nowISO());
    } catch (e) { /* silencioso/não-bloqueante */ }
  },

  /** Botão "⬇️ Restaurar tudo do servidor" (Configurações → 🖥️ Servidor
   *  local) — pedido verbatim: "para caso se exclua os dados do navegador e
   *  não se tenha 'exportado', então, seja possível recuperar tudo". Busca
   *  o `backup-completo.json` mais recente salvo pelo servidor (ação
   *  "carregar-backup-completo") e REAPROVEITA o fluxo de importação de
   *  backup já existente e testado (`#st-import` onchange, settings.js) —
   *  em vez de duplicar toda aquela lógica (mesclagem de mapas, conflito de
   *  itens, barra de progresso, etc.), monta um `File` em memória com o
   *  JSON recebido e dispara o MESMO `<input type=file>` via `DataTransfer`
   *  + evento `change` sintético. `container` é o container da tela de
   *  Configurações (pra achar o `#st-import` — precisa estar montada). */
  // NOVO (03/09/2026) — Pedido do usuário: "deve ser possível configurar [a
  // pasta onde o servidor guarda os arquivos]. Por padrão é em uma pasta
  // dentro do app [...] Isto deve ficar claro visualmente." Duas funções
  // novas, ambas conversando com as ações NOVAS de mesmo nome em
  // server/receive.js/receive.php (ver comentário grande lá):
  //  - `statusArmazenamento()`: só CONSULTA (sem alterar nada) o caminho
  //    real, em disco, onde os arquivos estão sendo gravados agora — usado
  //    por settings.js pra exibir isto na tela (o "ficar claro visualmente"
  //    do pedido). Silencioso em caso de falha (servidor offline etc.) —
  //    mesmo padrão do resto deste arquivo — devolve `null` nesse caso.
  //  - `configurarPastaDados(pasta)`: ALTERA a pasta configurada no servidor
  //    (string vazia = volta pro padrão). Chamado pelo botão "💾 Salvar
  //    pasta" da tela de Configurações.
  async statusArmazenamento() {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) return null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'status-armazenamento' }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.ok ? data : null;
    } catch (e) { return null; }
  },

  async configurarPastaDados(pasta) {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) { Utils.toast('Configure a URL do servidor local primeiro.', { type: 'warn' }); return null; }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'configurar-pasta-dados', pastaDados: pasta }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) { Utils.toast('Falha ao configurar a pasta: ' + (data?.erro || res.status), { type: 'danger' }); return null; }
      Utils.toast('Pasta de dados do servidor atualizada ✓', { type: 'ok' });
      return data;
    } catch (e) {
      Utils.toast('Falha ao configurar a pasta: ' + e.message, { type: 'danger' });
      return null;
    }
  },

  async restaurarDoServidor(container) {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) { Utils.toast('Configure a URL do servidor local em Configurações primeiro.', { type: 'warn' }); return; }
    if (!confirm('Buscar o backup completo salvo no servidor local e importar aqui?\n\nIsto NÃO apaga nada já cadastrado neste aparelho — item duplicado será perguntado, igual à importação normal de um arquivo (⬆️ Importar backup).')) return;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'carregar-backup-completo' }),
      });
      if (!res.ok) throw new Error(`Servidor respondeu ${res.status}`);
      const data = await res.json();
      if (!data.backup) { Utils.toast('O servidor local ainda não tem nenhum backup completo salvo.', { type: 'warn' }); return; }
      const blob = new Blob([JSON.stringify(data.backup)], { type: 'application/json' });
      const file = new File([blob], 'backup-completo-servidor.json', { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = container?.querySelector?.('#st-import');
      if (!input) { Utils.toast('Abra as Configurações antes de restaurar.', { type: 'warn' }); return; }
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    } catch (e) {
      Utils.toast('Falha ao buscar o backup do servidor: ' + e.message, { type: 'danger' });
    }
  },
};
window.ServerPrefs = ServerPrefs;
