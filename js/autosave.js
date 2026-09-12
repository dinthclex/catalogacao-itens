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
  // NOVO (07/09/2026), pedido verbatim: "Os salvamentos automáticos, quando
  // estiver em um servidor e estiver marcada a opção de 'guardar em
  // servidor', devem ser feitos para as coisas que estão em uso no
  // momento." — 'autoSaveAtivo' é agora EXATAMENTE a chave por trás do
  // checkbox "Guardar no servidor" (ver settings.js `#st-guardar-servidor`/
  // `_wireGuardarDestinos`), então este método (chamado a cada item
  // confirmado, via `pushItem` abaixo, chamado direto de app.js) já
  // satisfaz o pedido sem nenhuma mudança de lógica aqui — só o item que
  // acabou de ser usado/confirmado é enviado, nunca o catálogo inteiro
  // (isso é o botão "📤 Gravar tudo no servidor"/"⬇️ Exportar backup").
  async isEnabled() {
    return !!(await DB.getSetting('autoSaveAtivo', false));
  },

  // NOVO (07/09/2026), pedido verbatim: "uma opção para gravar tudo no
  // servidor deve ficar disponível" — o botão "📤 Gravar tudo no servidor"
  // (ver serverprefs.js/settings.js) precisa poder enviar um item MESMO com
  // o "salvamento automático" (autoSaveAtivo) desligado — é justamente pra
  // quem cadastrou itens ANTES de configurar o servidor, ou com o autosave
  // desligado. `force: true` pula a checagem de `isEnabled()` abaixo; todo
  // o resto do envio continua idêntico.
  async pushItem(item, { isUpdate = false, force = false, silent = false } = {}) {
    const ativo = force || (await this.isEnabled());
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
      // `silent` — NOVO (07/09/2026): usado pelo envio em LOTE de "📤 Gravar
      // tudo no servidor" (ver ServerPrefs.enviarTodosParaServidor) — sem
      // isto, enviar centenas de itens de uma vez dispararia centenas de
      // toasts empilhados, um por item.
      if (resultado?.caminhos?.length && !silent) {
        Utils.toast(`Salvo no servidor em: ${resultado.caminhos.join(' · ')}`, { type: 'ok', duration: 4500 });
      }
      window.EventLog?.log?.(`Envio automático ao servidor local: ok (${item.patrimonio || item.descricao || item.id}).`, { tipo: 'ok' });
      return { enviado: true, resultado };
    } catch (e) {
      console.warn('Salvamento automático falhou (item continua salvo localmente):', e);
      if (!silent) Utils.toast('Item salvo localmente, mas o servidor de auto-salvamento não respondeu.', { type: 'warn' });
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
