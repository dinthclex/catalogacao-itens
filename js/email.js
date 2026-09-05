/**
 * email.js — Envio das informações por email e/ou para um servidor próprio.
 *
 * Modo "mailto": monta um e-mail (com texto pré-gravado ou digitado na hora)
 * e abre o programa de e-mail padrão do usuário já preenchido — não precisa
 * de servidor nenhum, mas exige que o usuário clique em "enviar" manualmente
 * (limitação inerente a uma página web estática, sem backend).
 *
 * Modo "servidor": além do mailto, envia os dados via POST para uma URL
 * própria do usuário (webhook/PHP que ele mesmo hospeda — ver server/README).
 */

const EmailModule = {
  buildMailto({ to, subject, body }) {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    return `mailto:${encodeURIComponent(to || '')}?${params.toString()}`;
  },

  openMailClient({ to, subject, body }) {
    const url = this.buildMailto({ to, subject, body });
    window.location.href = url;
  },

  /** Gera o texto padrão de exportação de um ou mais itens (para o corpo do email). */
  formatItemsAsText(items) {
    return items.map((it) => (
      `• Patrimônio: ${it.patrimonio || '—'}\n` +
      `  Descrição: ${it.descricao || '—'}\n` +
      `  Tipo: ${it.tipo || '—'} | Setor: ${it.setor || '—'}\n` +
      // Pedido do usuário (27/08/2026): "Inserido em" removido — "Criado
      // originalmente em" já cumpre esse papel.
      `  Criado em: ${Utils.formatDateTime(it.criadoOriginalmenteEm || it.criadoEm)}\n` +
      `  Modificado em: ${Utils.formatDateTime(it.modificadoEm)}\n`
    )).join('\n');
  },

  async sendToWebhook(url, payload, { includeImages = false } = {}) {
    if (!url) throw new Error('URL do servidor não configurada.');
    const body = includeImages ? payload : this._stripImages(payload);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Servidor respondeu ${res.status}`);
    return res.json().catch(() => ({}));
  },

  _stripImages(payload) {
    const clone = JSON.parse(JSON.stringify(payload));
    if (Array.isArray(clone.items)) {
      clone.items.forEach((it) => { delete it.fotoDataUrl; delete it.avatarDataUrl; delete it.thumbDataUrl; });
    }
    return clone;
  },

  async runConfiguredExport(items, { manualText = '' } = {}) {
    const cfg = await DB.getAllSettings();
    const mode = cfg.emailModo || 'mailto'; // 'mailto' | 'servidor' | 'ambos'
    const results = { mailtoAberto: false, servidorEnviado: false, erro: null };

    const textoBase = manualText || cfg.emailTextoPadrao || 'Segue catalogação de itens exportada do app.';
    const corpo = `${textoBase}\n\n${this.formatItemsAsText(items)}`;

    if (mode === 'mailto' || mode === 'ambos') {
      this.openMailClient({ to: cfg.emailDestino || '', subject: cfg.emailAssunto || 'Catalogação de itens', body: corpo });
      results.mailtoAberto = true;
    }
    if (mode === 'servidor' || mode === 'ambos') {
      try {
        await this.sendToWebhook(cfg.servidorUrl, {
          enviadoEm: DB.nowISO(), textoAcompanhante: textoBase, items,
        }, { includeImages: !!cfg.servidorIncluirImagens });
        results.servidorEnviado = true;
      } catch (e) {
        results.erro = e.message;
      }
    }
    return results;
  },
};

window.EmailModule = EmailModule;
