/**
 * autosave.js — Salvamento automático de cada item num servidor local (opcional).
 *
 * Uma página web pura não tem acesso ao sistema de arquivos do computador
 * (por segurança do navegador) — por isso, para os itens caírem
 * automaticamente em arquivo (e para o PC e o celular enxergarem o MESMO
 * catálogo), é preciso um servidor local rodando em algum lugar da rede
 * (normalmente no PC) para onde o app envia cada item assim que é
 * confirmado. Tanto o navegador do PC quanto o do celular (na mesma Wi-Fi)
 * apontam para essa mesma URL — é isso que faz os dois "verem" o mesmo
 * catálogo. Veja server/LEIA-ME-servidor.txt para montar esse servidor
 * (é o mesmo servidor PHP opcional usado para automatizar o envio de email).
 *
 * Sem servidor configurado, o app continua funcionando normalmente —
 * cada item fica salvo localmente no IndexedDB do navegador que o
 * cadastrou (uso normal, sem sincronização entre aparelhos).
 */

const AutoSave = {
  async isEnabled() {
    return !!(await DB.getSetting('autoSaveAtivo', false));
  },

  async pushItem(item, { isUpdate = false } = {}) {
    const ativo = await this.isEnabled();
    if (!ativo) return { enviado: false, motivo: 'desativado' };

    const url = await DB.getSetting('servidorUrl', '');
    if (!url) return { enviado: false, motivo: 'sem-url' };

    const modoArquivo = await DB.getSetting('autoSaveModoArquivo', 'unico'); // individual | unico | ambos
    const formatoExtra = await DB.getSetting('autoSaveFormatoExtra', 'nenhum'); // nenhum | txt-simples | csv-completo | ambos-formatos
    // Mesma configuração de campos/ordem/organização usada no .txt gerado no
    // próprio navegador (ver "👁️ Ver lista" / Utils.itemsToSimpleTxt) — envia
    // junto pro servidor poder gerar o catalogo-simples.txt IGUAL, em vez de
    // ficar preso ao formato fixo antigo (patrimônio + tipo).
    const { campos: txtCampos, organizarPorSetor: txtOrganizarPorSetor } = await Utils.getTxtConfig();
    const payload = {
      acao: 'salvar-item',
      modoArquivo,
      formatoExtra,
      txtCampos,
      txtOrganizarPorSetor,
      isUpdate,
      enviadoEm: DB.nowISO(),
      item: this._stripHeavyFields(item, await DB.getSetting('servidorIncluirImagens', false)),
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Servidor respondeu ${res.status}`);
      const resultado = await res.json().catch(() => ({}));
      // Mostra onde exatamente ficou salvo no servidor — o caminho vem do
      // próprio servidor (ele sabe onde está no disco; o navegador nunca sabe
      // isso por conta própria, por segurança).
      if (resultado?.caminhos?.length) {
        Utils.toast(`Salvo no servidor em: ${resultado.caminhos.join(' · ')}`, { type: 'ok', duration: 4500 });
      }
      window.EventLog?.log?.(`Envio automático ao servidor local: ok (${item.patrimonio || item.descricao || item.id}).`, { tipo: 'ok' });
      return { enviado: true, resultado };
    } catch (e) {
      console.warn('Salvamento automático falhou (item continua salvo localmente):', e);
      Utils.toast('Item salvo localmente, mas o servidor de auto-salvamento não respondeu.', { type: 'warn' });
      window.EventLog?.log?.(`Envio automático ao servidor local falhou (${item.patrimonio || item.descricao || item.id}): ${e.message}`, { tipo: 'erro' });
      return { enviado: false, motivo: e.message };
    }
  },

  _stripHeavyFields(item, incluirImagens) {
    if (incluirImagens) return item;
    const { fotoDataUrl, avatarDataUrl, thumbDataUrl, ...rest } = item;
    return rest;
  },
};

window.AutoSave = AutoSave;
