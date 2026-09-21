/* js/botoeslayout.js
 * Distribuição EDITÁVEL de barras de botões: a janela "🧰 Ferramentas" do Mapa 2D e o rodapé (hotbar) do "Ver em 3D".
 * A edição acontece em seções das "configurações 2D" / "configurações 3D" (arrastar, remover, adicionar); as barras
 * reais só LEEM o estado salvo (ver `visiveis()`).
 *
 * Estado salvo por chave em DB.setSetting('botoesLayout_<chave>'):
 *   { ordem: [ids na ordem escolhida], ocultos: [ids padrão removidos], extras: [ids de botões acrescentados] }
 * Sem estado salvo = ordem original, todos os botões padrão visíveis e nenhum extra (o layout de fábrica).
 *
 * cfg: { chave, defs() -> botões padrão [{ id, ... }], defExtra(id) -> def de um extra (ou null),
 *        catalogoExtras() -> [{ id, ... }] que podem ser acrescentados, grid() -> elemento da barra,
 *        htmlBotao(def), aoMudar?() (depois de salvar), ligar?(grid), aoRenderizar?(grid), rotulo?(def), iconeHtml?(def),
 *        permanente?: true (edição sempre ligada, usada nas seções de configurações), eixo?: 'x'|'y'|'auto' }
 */
(function () {
  const PREFIXO = 'botoesLayout_';

  function ordenar(defs, est) {
    const oc = new Set((est && est.ocultos) || []);
    const idx = new Map(((est && est.ordem) || []).map((id, i) => [id, i]));
    return defs
      .map((d, i) => ({ d, k: idx.has(d.id) ? idx.get(d.id) : 100000 + i }))
      .filter((x) => !oc.has(x.d.id))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.d);
  }

  async function carregar(chave) {
    let est = null;
    try { est = await DB.getSetting(PREFIXO + chave, null); } catch (e) { /* usa o padrão */ }
    const arr = (v) => (Array.isArray(v) ? v : []);
    return { ordem: arr(est && est.ordem), ocultos: arr(est && est.ocultos), extras: arr(est && est.extras) };
  }

  const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  function criar(cfg) {
    const ctl = {
      editando: !!cfg.permanente,
      est: { ordem: [], ocultos: [], extras: [] },
      _bar: null,

      async carregar() { this.est = await carregar(cfg.chave); this._carregado = true; return this.est; },
      /** Padrão + extras acrescentados (na ordem de definição). */
      todos() {
        const extras = (this.est.extras || []).map((id) => (cfg.defExtra ? cfg.defExtra(id) : null)).filter(Boolean);
        return cfg.defs().concat(extras);
      },
      visiveis() { return ordenar(this.todos(), this.est); },
      async _salvar() { try { await DB.setSetting(PREFIXO + cfg.chave, this.est); } catch (e) { console.warn('[BotoesLayout] falha ao salvar', e); } if (cfg.aoMudar) { try { cfg.aoMudar(); } catch (e) { console.warn(e); } } },

      /** (Re)desenha a barra conforme o estado atual e liga os handlers do chamador. */
      async renderizar(recarregar) {
        if (recarregar !== false && !this._carregado) await this.carregar();
        const grid = cfg.grid();
        if (!grid) return;
        grid.innerHTML = this.visiveis().map((d) => cfg.htmlBotao(d)).join('');
        if (cfg.ligar) cfg.ligar(grid);
        this._limparEdicao(grid);
        if (this.editando) this._decorar(grid);
        if (cfg.aoRenderizar) cfg.aoRenderizar(grid);
      },

      _limparEdicao(grid) {
        grid.classList.toggle('bl-edit', this.editando);
        if (this._bar) { this._bar.remove(); this._bar = null; }
        if (this._captura) { grid.removeEventListener('click', this._captura, true); this._captura = null; }
      },

      alternarEdicao(forcar) {
        this.editando = typeof forcar === 'boolean' ? forcar : !this.editando;
        return this.renderizar(false);
      },

      _decorar(grid) {
        // 1) bloqueia o clique normal dos botões e trata o ✕
        this._captura = (e) => {
          const x = e.target.closest && e.target.closest('.bl-x');
          e.preventDefault(); e.stopPropagation();
          if (!x) return;
          const el = x.closest('[data-blid]');
          if (!el) return;
          const id = el.dataset.blid;
          if ((this.est.extras || []).includes(id)) {   // botão acrescentado: sai de vez
            this.est.extras = this.est.extras.filter((v) => v !== id);
            this.est.ordem = this.est.ordem.filter((v) => v !== id);
          } else if (!this.est.ocultos.includes(id)) this.est.ocultos.push(id);
          this._salvar(); this.renderizar(false);
        };
        grid.addEventListener('click', this._captura, true);
        const ord = window.Flip && window.Flip.makeSortable ? window.Flip.makeSortable(grid, {
          itemSelector: '[data-blid]',
          draggingClass: 'bl-item-dragging',
          axis: cfg.eixo || 'auto',
          ignoreSelector: '.bl-x',
          onDrop: (els) => {
            const vis = els.map((el) => el.dataset.blid).filter(Boolean);
            const resto = this.est.ordem.filter((id) => !vis.includes(id));
            this.est.ordem = vis.concat(resto);
            this._salvar();
          },
        }) : null;
        grid.querySelectorAll('[data-blid]').forEach((el) => {
          el.classList.add('bl-item');
          const x = document.createElement('span');
          x.className = 'bl-x'; x.textContent = '✕'; x.title = 'Remover este botão da barra';
          el.appendChild(x);
          if (ord) ord.attach(el);
        });
        // 2) faixa de comandos
        const bar = document.createElement('div');
        bar.className = 'bl-bar';
        bar.innerHTML = `
          <div class="bl-bar-row">
            <button type="button" class="btn secondary sm" data-a="add" title="Adicionar um botão à barra (removidos ou objetos do catálogo)">➕ Adicionar</button>
            <button type="button" class="btn secondary sm" data-a="padrao" title="Volta à ordem e aos botões de fábrica">↺ Padrão</button>
            ${cfg.permanente ? '' : '<button type="button" class="btn primary sm" data-a="ok" title="Terminar a edição">✔ Concluir</button>'}
          </div>
          <div class="bl-bar-hint">Arraste os botões para mudar a ordem · ✕ remove</div>
          <div class="bl-add-list" hidden></div>`;
        grid.insertAdjacentElement('afterend', bar);
        this._bar = bar;
        const lista = bar.querySelector('.bl-add-list');
        const ok = bar.querySelector('[data-a="ok"]');
        if (ok) ok.onclick = () => this.alternarEdicao(false);
        bar.querySelector('[data-a="padrao"]').onclick = () => {
          this.est = { ordem: [], ocultos: [], extras: [] }; this._salvar(); this.renderizar(false);
        };
        const rot = (d) => (cfg.rotulo ? cfg.rotulo(d) : (d.label || d.id));
        const ico = (d) => (cfg.iconeHtml ? cfg.iconeHtml(d) : (d.icon || ''));
        const itemBtn = (d, tipo) => `<button type="button" class="bl-add-item" data-id="${esc(d.id)}" data-tipo="${tipo}" title="${esc(rot(d))}">${ico(d)}<span>${esc(rot(d))}</span></button>`;
        const escolher = (id, tipo) => {
          const visIds = this.visiveis().map((d) => d.id);   // antes de reexibir: o novo botão vai para o fim
          if (tipo === 'extra') { if (!this.est.extras.includes(id)) this.est.extras.push(id); }
          else this.est.ocultos = this.est.ocultos.filter((v) => v !== id);
          this.est.ordem = visIds.filter((v) => v !== id).concat([id]);
          this._salvar(); this.renderizar(false);
        };
        bar.querySelector('[data-a="add"]').onclick = () => {
          if (!lista.hidden) { lista.hidden = true; return; }
          const removidos = cfg.defs().filter((d) => this.est.ocultos.includes(d.id));
          const jaTem = new Set(this.est.extras || []);
          const catalogo = (cfg.catalogoExtras ? cfg.catalogoExtras() : []).filter((d) => !jaTem.has(d.id));
          lista.innerHTML = `
            ${removidos.length ? `<div class="bl-add-tit">Botões removidos</div><div class="bl-add-grp">${removidos.map((d) => itemBtn(d, 'padrao')).join('')}</div>` : ''}
            ${catalogo.length ? `<div class="bl-add-tit">Objetos do catálogo</div><input type="search" class="bl-add-busca" placeholder="Buscar objeto…"><div class="bl-add-grp" data-cat="1">${catalogo.map((d) => itemBtn(d, 'extra')).join('')}</div>` : ''}
            ${!removidos.length && !catalogo.length ? '<div class="bl-add-tit">Nada para adicionar.</div>' : ''}`;
          lista.hidden = false;
          const busca = lista.querySelector('.bl-add-busca');
          if (busca) busca.oninput = () => {
            const q = busca.value.trim().toLowerCase();
            lista.querySelectorAll('.bl-add-grp[data-cat] .bl-add-item').forEach((b) => { b.style.display = !q || b.title.toLowerCase().includes(q) ? '' : 'none'; });
          };
          lista.querySelectorAll('.bl-add-item').forEach((b) => { b.onclick = () => escolher(b.dataset.id, b.dataset.tipo); });
        };
      },
    };
    return ctl;
  }

  window.BotoesLayout = { criar, ordenar, carregar };
})();
