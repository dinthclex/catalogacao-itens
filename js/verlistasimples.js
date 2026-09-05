/**
 * verlistasimples.js — Módulo separado (pedido do usuário, 26/08/2026: "O 'Ver lista
 * simples' deve ser uma função modular também, um código só para ele. Deve funcionar em
 * file:///") com TODA a janela "👁️ Ver lista simples" — antes vivia dentro de
 * settings.js (`SettingsView.showListaSimples`) — junto com os chips de "Partes de
 * informação em cada linha" (marcar/desmarcar e arrastar ⠿ pra reordenar).
 *
 * Dois jeitos de abrir esta janela:
 *  - Botão "👁️" na barra de cima (presente em toda tela) — usa a cópia leve do
 *    LocalBackup (patrimônio/tipo/descrição/setor, sem fotos, guardada no localStorage).
 *  - "Ver lista simples" de um ambiente específico, no Mapa (mapview.js) — passa
 *    `opts.items` com a lista REAL e completa daquele ambiente (direto do catálogo,
 *    IndexedDB via DB.getItemsByAmbiente), e `opts.titulo` com o nome do ambiente.
 *
 * Carregado como <script> comum (sem type="module") — o app roda direto de file:///, e
 * módulos ES6 (import/export) são bloqueados por CORS nesse protocolo. Mesmo padrão de
 * TODOS os outros arquivos do app (DB, Utils, Mapping, MapSelection, PhotoGrid,
 * AmbientePhotos...): um objeto global (`window.VerListaSimples`), carregado depois de
 * `utils.js`/`localbackup.js` (usados aqui) e antes de `app.js` no index.html.
 *
 * O arraste dos chips de "Partes de informação" usa a mesma técnica (FLIP com
 * requestAnimationFrame próprio, chip arrastado com posição própria grudada no cursor,
 * trava de nova troca até a animação anterior terminar, e — pedido do usuário, 26/08/2026:
 * "tem botões de comprimentos diferentes... o vizinho fica flipando pra um lado e outro" —
 * um "swap threshold" geométrico: só troca quando o cursor cruza a METADE do alvo no
 * sentido do movimento, não bastando "estar em cima" dele) já usada na janela "🗂️ Camadas"
 * do Mapa (mapview.js `_followDraggedLayerRow`/`_flipLayerRows`/`drag.lockedUntil`) — ver
 * comentários detalhados dentro de `show()` abaixo.
 */
const VerListaSimples = {
  /**
   * Mostra a lista simples (como no .txt) — `opts.items`: quando informado, usa esta
   * lista de itens (já carregada de DB, ex: DB.getItemsByAmbiente) em vez da cópia leve
   * do LocalBackup (usado pelo Mapa, que precisa da lista REAL e completa daquele
   * ambiente, não da rede de segurança global do LocalBackup, que só guarda o que passou
   * por pushItem e pode ficar incompleta). `opts.titulo`: rótulo do cabeçalho, quando
   * `items` é usado.
   */
  async show(opts = {}) {
    const list = (opts.items || LocalBackup.getAll()).slice()
      .sort((a, b) => (a.patrimonio || '').localeCompare(b.patrimonio || '', 'pt-BR', { numeric: true }));

    let { campos, organizarPorSetor } = await Utils.getTxtConfig();
    campos = campos.map((c) => ({ ...c })); // cópia local, editável, só salva quando muda de fato

    // CORRIGIDO (31/08/2026), pedido verbatim: "Sobre os patrimônios
    // duplicados, em qualquer lugar no app que houver a apresentação de
    // patrimônios, deve-se indicar visualmente quais estão duplicados."
    // Esta tela ainda não tinha nenhuma indicação — mesma fonte de verdade
    // usada em todo o resto do app (`DB.getDuplicatePatrimonios()`, ver
    // app.js/search.js/organizeview.js/etc.). Decisão de design: o `<pre>`
    // abaixo é `textContent` PURO (mesmo texto, caractere a caractere, que
    // vira o .TXT baixado por "📄 Baixar .TXT") — não dá pra colorir uma
    // palavra sem misturar HTML ali dentro, e mudar o CONTEÚDO do .txt em
    // si (ex.: inserindo um "⚠️" na frente de cada linha duplicada) alteraria
    // o formato do arquivo exportado, fora do escopo deste pedido. Por isso
    // a indicação aqui é um resumo separado (`#lb-dup-warn`), sem tocar no
    // texto/arquivo em si.
    const dupSet = await DB.getDuplicatePatrimonios();

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <h3 style="margin-top:0">👁️ ${opts.titulo ? Utils.escapeHtml(opts.titulo) : 'Ver lista'} (${list.length} patrimônio(s))</h3>
        <p style="font-size:11.5px; color:var(--text-dim)">
          ${opts.items
            ? 'Lista completa deste ambiente, direto do catálogo — não é a cópia leve do LocalBackup.'
            : 'Cópia leve salva no localStorage deste aparelho (sem fotos) — independente do catálogo principal. Útil para conferir rapidinho o que já foi cadastrado, e para escolher como cada linha do .txt fica montada.'}
        </p>
        <div style="background:var(--bg-elev-2); border:1px solid var(--border); border-radius:10px; padding:10px; margin-bottom:10px">
          <div style="font-size:12px; font-weight:600; margin-bottom:6px">Partes de informação em cada linha (marque e arraste ⠿ para reordenar)</div>
          <div id="lb-campos" class="lb-campos-row"></div>
          <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; margin-top:10px; padding-top:8px; border-top:1px solid var(--border)">
            <input type="checkbox" id="lb-organizar-setor" ${organizarPorSetor ? 'checked' : ''}>
            Organizar lista por setor / local (agrupa e ordena antes de montar, em vez da ordem de cadastro)
          </label>
        </div>
        <input type="text" id="lb-filter" placeholder="Filtrar por patrimônio, tipo, descrição ou setor…" style="width:100%; margin-bottom:8px">
        <div id="lb-dup-warn" style="display:none; font-size:11.5px; color:#e6c8ff; background:rgba(199,125,255,.15); border:1px solid #c77dff; border-radius:6px; padding:4px 8px; margin-bottom:8px"></div>
        <pre id="lb-list" style="max-height:40vh; overflow:auto; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:10px; padding:10px; font-size:12px; line-height:1.6; white-space:pre-wrap; margin:0; font-family:monospace"></pre>
        <div style="display:flex; gap:8px; margin-top:10px">
          <button class="btn secondary block" id="lb-download" title="Baixar esta lista como .txt, com os campos e a ordem escolhidos acima">📄 Baixar .TXT</button>
          <button class="btn block" id="lb-close" title="Fechar esta janela">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#lb-close').onclick = () => modal.remove();

    const pre = modal.querySelector('#lb-list');
    const camposBox = modal.querySelector('#lb-campos');

    const dupWarnEl = modal.querySelector('#lb-dup-warn');
    const renderPreview = (filtro) => {
      const q = (filtro || '').trim().toLowerCase();
      const filtered = q ? list.filter((it) => `${it.patrimonio} ${it.tipo} ${it.descricao} ${it.setor}`.toLowerCase().includes(q)) : list;
      pre.textContent = filtered.length
        ? Utils.itemsToSimpleTxt(filtered, { campos, organizarPorSetor })
        : (list.length ? 'Nada encontrado com esse filtro.' : 'Nenhum item salvo ainda nesta lista local.');
      // Ver comentário grande acima (setup do `dupSet`) — resumo à parte,
      // sem misturar com o texto puro do `<pre>`/.txt.
      const nDup = new Set(filtered.filter((it) => it.patrimonio && dupSet.has(it.patrimonio.trim())).map((it) => it.patrimonio.trim())).size;
      dupWarnEl.style.display = nDup ? '' : 'none';
      dupWarnEl.textContent = nDup ? `⚠️ ${nDup} número${nDup > 1 ? 's' : ''} de patrimônio duplicado${nDup > 1 ? 's' : ''} nesta lista (também aparece(m) em outro item do catálogo).` : '';
    };

    /** Lê a ordem final dos chips direto do DOM (pelo data-key de cada um) e
     *  reescreve o array local `campos` nessa ordem. */
    const commitCampoOrderFromDom = async () => {
      const orderedKeys = [...camposBox.children].map((c) => c.dataset.key);
      campos.sort((a, b) => orderedKeys.indexOf(a.key) - orderedKeys.indexOf(b.key));
      await Utils.setTxtConfig({ campos });
      renderPreview(modal.querySelector('#lb-filter').value);
    };

    // FLIP (First-Last-Invert-Play) + arraste-com-swap-threshold — modularizado (pedido do
    // usuário, 28/08/2026: "Modularize o flip dos botões que é usado atualmente em 'Ver
    // lista simples' de modo que seja possível usar seus atributos e métodos em outras
    // partes do código") em js/flip.js (`window.Flip.makeSortable`) — toda a técnica
    // (chip arrastado com posição própria grudada no cursor, FLIP das outras via
    // requestAnimationFrame, trava de tempo, swap threshold geométrico) foi extraída pra
    // lá; ver comentários detalhados nesse arquivo. Usado também pelo arraste de colunas
    // da "📋 Tabela" (table.js `_attachColDrag`).
    const camposSortable = Flip.makeSortable(camposBox, {
      itemSelector: '.lb-campo-chip',
      ignoreSelector: '.lb-campo-chk', // clicar no checkbox não deve iniciar arrasto
      draggingClass: 'lb-campo-chip-dragging',
      axis: 'auto', // fileira flex-wrap — decide linha-a-linha (mesmo comportamento de antes)
      onDrop: () => commitCampoOrderFromDom(),
    });

    const renderCampos = () => {
      camposBox.innerHTML = campos.map((c) => `
        <div class="lb-campo-chip" data-key="${Utils.escapeHtml(c.key)}" title="Arraste para reordenar">
          <span class="lb-campo-chip-handle">⠿</span>
          <label class="lb-campo-chip-label">
            <input type="checkbox" class="lb-campo-chk" ${c.ativo ? 'checked' : ''}>
            ${Utils.escapeHtml(Utils.TXT_CAMPO_LABELS[c.key] || c.key)}
          </label>
        </div>`).join('');

      camposBox.querySelectorAll('.lb-campo-chip').forEach((chip) => {
        const key = chip.dataset.key;
        chip.querySelector('.lb-campo-chk').onchange = async (e) => {
          const campo = campos.find((c) => c.key === key);
          if (campo) campo.ativo = e.target.checked;
          await Utils.setTxtConfig({ campos });
          renderPreview(modal.querySelector('#lb-filter').value);
        };
        camposSortable.attach(chip);
      });
    };

    renderCampos();
    renderPreview('');
    modal.querySelector('#lb-filter').oninput = (e) => renderPreview(e.target.value);
    modal.querySelector('#lb-organizar-setor').onchange = async (e) => {
      organizarPorSetor = e.target.checked;
      await Utils.setTxtConfig({ organizarPorSetor });
      renderPreview(modal.querySelector('#lb-filter').value);
    };

    modal.querySelector('#lb-download').onclick = () => {
      Utils.downloadBlob(new Blob([Utils.itemsToSimpleTxt(list, { campos, organizarPorSetor })], { type: 'text/plain;charset=utf-8' }), `lista-simples-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    };
  },
};
// Pedido do usuário, 26/08/2026: "O botão não está funcionando" — ERA ISTO. `const
// VerListaSimples = {...}` sozinho NÃO cria `window.VerListaSimples` (declaração de
// nível-topo com `const`/`let` fica no "escopo léxico global" do script, não vira
// propriedade do objeto `window` — só `var`/`function` de nível-topo viram). Chamadas
// dentro do PRÓPRIO arquivo (ex: `VerListaSimples.show()` sem `window.` na frente, em
// settings.js) enxergavam o objeto normalmente — só as chamadas de OUTRO arquivo escritas
// como `window.VerListaSimples?.show?.()` (mapview.js) é que silenciosamente não achavam
// nada (o `?.` engole o "undefined" sem erro nenhum — daí o botão "não fazer nada").
// Mesma convenção de TODOS os outros módulos do app (ver final de mapview.js
// `window.MapView = MapView`, settings.js `window.SettingsView = SettingsView`, unify.js
// `window.UnifyView = UnifyView`) — só esqueci de repetir aqui na hora de extrair este
// módulo. Essencial pra file:///: sem servidor/módulos ES6, é assim que um arquivo
// carregado via <script> comum expõe algo pros outros lerem.
window.VerListaSimples = VerListaSimples;
