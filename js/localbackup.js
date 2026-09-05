/**
 * localbackup.js — Cópia leve e independente dos itens catalogados, guardada
 * no localStorage do navegador (celular OU PC), além do IndexedDB que já é o
 * banco principal do app. Ativado por padrão, mas pode ser desligado nas
 * Configurações.
 *
 * Por quê: o localStorage é bem mais limitado em tamanho (uns 5-10MB no
 * total, dependendo do navegador) e só guarda texto — NÃO cabem as fotos/
 * avatares dos itens ali. Por isso esta cópia guarda só o essencial de cada
 * item (patrimônio, tipo, descrição, setor, data) — o mesmo tipo de
 * informação do arquivo .txt simples — não o item completo. A ideia é servir
 * de rede de segurança BEM simples: se algo acontecer com o banco principal
 * (IndexedDB), ainda dá pra ver rapidinho quais patrimônios já foram
 * cadastrados, direto pelas Configurações → "📝 Lista simples", sem depender
 * de mais nada (nem abrir banco de dados, nem servidor, nem exportar arquivo).
 */
const LocalBackup = {
  KEY: 'catalogo_localbackup_v1',
  ENABLED_KEY: 'catalogo_localbackup_ativo',

  /** Ativado por padrão — só fica desativado se o usuário desligar explicitamente. */
  isEnabled() {
    try {
      const v = localStorage.getItem(this.ENABLED_KEY);
      return v === null ? true : v === '1';
    } catch (e) { return false; } // localStorage indisponível (ex: modo privado restrito)
  },

  setEnabled(v) {
    try { localStorage.setItem(this.ENABLED_KEY, v ? '1' : '0'); } catch (e) { /* ignora */ }
  },

  isSupported() {
    try { return typeof localStorage !== 'undefined'; } catch (e) { return false; }
  },

  /** Guarda (ou atualiza, se o item já existir na lista) a versão resumida do
   *  item. Chamado nos mesmos pontos que AutoSave.pushItem()/P2PModule.pushItem() —
   *  sempre que um item é criado ou editado. */
  pushItem(item) {
    if (!this.isEnabled() || !item?.id) return;
    try {
      const list = this._readRaw();
      const rec = {
        id: item.id,
        patrimonio: item.patrimonio || '',
        tipo: item.tipo || '',
        descricao: item.descricao || '',
        setor: item.setor || '',
        criadoEm: item.criadoEm || new Date().toISOString(),
      };
      const idx = list.findIndex((x) => x.id === item.id);
      if (idx >= 0) list[idx] = rec; else list.push(rec);
      localStorage.setItem(this.KEY, JSON.stringify(list));
    } catch (e) {
      // provavelmente cota do localStorage esgotada — não deve travar o cadastro,
      // que já foi salvo normalmente no IndexedDB de qualquer forma.
      console.warn('LocalBackup: não foi possível salvar (cota do navegador?)', e);
    }
  },

  /** Remove da lista quando o item é excluído do catálogo. */
  removeItem(id) {
    if (!id) return;
    try {
      const list = this._readRaw().filter((x) => x.id !== id);
      localStorage.setItem(this.KEY, JSON.stringify(list));
    } catch (e) { /* ignora */ }
  },

  getAll() { return this._readRaw(); },
  count() { return this._readRaw().length; },

  clear() {
    try { localStorage.removeItem(this.KEY); } catch (e) { /* ignora */ }
  },

  _readRaw() {
    try {
      const raw = localStorage.getItem(this.KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  },
};

window.LocalBackup = LocalBackup;
