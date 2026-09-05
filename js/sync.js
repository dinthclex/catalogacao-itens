/**
 * sync.js — Sincronização entre múltiplos aparelhos (PCs e celulares) usando o
 * mesmo servidor local já configurado para o salvamento automático (Configurações
 * → "🖥️ Servidor local"). Cada aparelho manda seus itens ao servidor conforme já
 * cataloga (ver autosave.js); este módulo faz o caminho inverso: busca no servidor
 * o que os OUTROS aparelhos enviaram e mescla na base local (IndexedDB) deste
 * aparelho, para que a busca/tabela mostrem o catálogo combinado de todos.
 *
 * Nunca apaga nada local. Nunca funde dois catálogos do mesmo patrimônio em um só
 * (cada item tem id próprio — ver session.js/db.js). Sem servidor configurado, este
 * módulo simplesmente não faz nada — o app continua 100% funcional só localmente.
 */
const SyncModule = {
  _timer: null,
  _syncing: false,

  async pull({ manual = false } = {}) {
    if (this._syncing) return { ok: false, motivo: 'em-andamento' };
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) {
      if (manual) Utils.toast('Configure a URL do servidor local em Configurações primeiro.', { type: 'warn' });
      return { ok: false, motivo: 'sem-url' };
    }
    this._syncing = true;
    try {
      const desde = await DB.getSetting('syncUltimaEm', null);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'listar', desde }),
      });
      if (!res.ok) throw new Error(`Servidor respondeu ${res.status}`);
      const data = await res.json();
      const itens = Array.isArray(data.itens) ? data.itens : [];
      const meuId = window.Session ? Session.id : null;
      let novos = 0;
      let atualizados = 0;
      for (const it of itens) {
        if (!it || !it.id) continue;
        if (meuId && it.origemSessaoId === meuId) continue; // já é meu, veio só por completude do servidor
        const r = await DB.mergeFromRemote(it);
        if (r.changed) { if (r.isNew) novos++; else atualizados++; }
      }
      await DB.setSetting('syncUltimaEm', DB.nowISO());
      if (manual) {
        Utils.toast(
          (novos || atualizados) ? `Sincronizado: ${novos} novo(s), ${atualizados} atualizado(s) de outros aparelhos.` : 'Sincronizado — nada novo de outros aparelhos.',
          { type: 'ok' },
        );
      }
      if (novos || atualizados) App._refreshCurrentView?.();
      return { ok: true, novos, atualizados };
    } catch (e) {
      console.warn('Sincronização falhou:', e);
      if (manual) Utils.toast('Falha ao sincronizar: ' + e.message, { type: 'danger' });
      return { ok: false, motivo: e.message };
    } finally {
      this._syncing = false;
    }
  },

  /** Liga a sincronização automática em segundo plano (a cada ~20s), se configurada e ativada. */
  async startAuto() {
    this.stopAuto();
    const url = await DB.getSetting('servidorUrl', '');
    const ativo = await DB.getSetting('syncAutoAtivo', true);
    if (!url || !ativo) return;
    this.pull().catch(() => {});
    this._timer = setInterval(() => { this.pull().catch(() => {}); }, 20000);
  },

  stopAuto() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  },
};

window.SyncModule = SyncModule;
