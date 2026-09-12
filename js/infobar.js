/**
 * infobar.js — window.InfoBar: painel "Info", mostrando o título da tela
 * atual + os mesmos 2 botões de atalho do cabeçalho global (👁️ Ver lista
 * simples / ⚙️ Configurações). Segue o mesmo contrato de qualquer tipo de
 * editor dockável do Workspace (`async mount(container)` / `unmount()`),
 * assim como MapView/View3D/SearchView já fazem — ver `js/bsplayout.js`
 * `EDITOR_TYPES.info`.
 *
 * NOVO (08/09/2026), pedido verbatim: "Ao selecionar o 'Mapa 2D' no
 * dropdown [...] Sim, será transformado em uma possibilidade de tela como
 * opção no dropdown. Será o 'Info'." — essa era originalmente uma ideia
 * levantada por mim (Claude) numa rodada anterior de brainstorm; o usuário
 * confirmou explicitamente que deve virar uma opção de editor dockável de
 * verdade, reaproveitando os MESMOS handlers já existentes no cabeçalho
 * global (`#btn-verlista-top`/`#btn-settings-top`), em vez de duplicar a
 * lógica deles.
 */

const InfoBar = {
  _container: null,

  async mount(container) {
    this._container = container;
    const view = (typeof App !== 'undefined') ? App.currentView : null;
    const titulo = (typeof App !== 'undefined' && App.titles && App.titles[view]) ? App.titles[view] : 'Catalogação de Itens';
    container.innerHTML = `
      <div class="infobar-shell">
        <h2 class="infobar-title">${Utils.escapeHtml(titulo)}</h2>
        <div class="spacer"></div>
        <button class="icon-btn" id="infobar-verlista" title="Ver lista simples (patrimônio/tipo/descrição/setor)">👁️</button>
        <button class="icon-btn" id="infobar-settings" title="Configurações">⚙️</button>
      </div>
    `;
    container.querySelector('#infobar-verlista').onclick = () => App._showListaSimplesGlobal?.();
    container.querySelector('#infobar-settings').onclick = () => App.navigate?.('configuracoes');
    return this;
  },

  unmount() {
    if (this._container) this._container.innerHTML = '';
    this._container = null;
  },
};

window.InfoBar = InfoBar;
