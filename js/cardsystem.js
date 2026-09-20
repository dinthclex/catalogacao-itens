/* js/cardsystem.js
 * NOVO (13/09/2026) — pedido verbatim: "Sobre o sistema de cards (a
 * janelinha que aparece ao clicar em um objeto), faça algum jeito para
 * poder configurá-las, os estilos e textos quando clica o que acontece.
 * Estava pensando em fazer uma pasta chamada 'cards/' e todos eles ficam
 * ali. São as janelas do app. Em vez de ser injeções em innerHTML nos
 * arquivos do projeto."
 *
 * O QUE ERA ANTES: as 5 "janelinhas" que aparecem ao mirar/clicar em algo
 * no "Ver em 3D" (objeto do catálogo, câmera, orb de foto, aglomerado de
 * tijolos soltos, patrimônio órfão) eram montadas via `innerHTML` de
 * template literal DIRETO dentro de `js/view3d.js`
 * (`_showObjectCard3D`/`_showCameraCard3D`/`_showFotoPinCard3D`/
 * `_showTijoloAglomeradoCard3D`/`_showOrphanPatrimonioCard3D`) — texto,
 * estilo inline e lógica de clique tudo misturado no meio de um arquivo de
 * ~12 mil linhas.
 *
 * O QUE É AGORA: cada uma dessas 5 janelinhas ("cards") virou um arquivo
 * PRÓPRIO em `cards/` (`cards/object-card.js`, `cards/camera-card.js`,
 * etc.) que se AUTO-REGISTRA aqui chamando `CardSystem.register(id, def)`.
 * `view3d.js` passou a ter só WRAPPERS FINOS que juntam os dados (o objeto/
 * câmera/etc. + o `ctx`) e mandam pro `CardSystem` montar — quem quiser
 * mudar o TEXTO, o ESTILO (inclusive um `<style>` inline escopado, se
 * precisar de algo que `cards/cards.css` compartilhado não cobre) ou O QUE
 * ACONTECE AO CLICAR num botão de um card específico agora abre só o
 * arquivo daquele card em `cards/`, sem tocar em `view3d.js`.
 *
 * MESMA RESTRIÇÃO TÉCNICA, MESMA SOLUÇÃO JÁ USADA PARA `assets/modelos/`
 * (ver comentário grande no topo de `js/objectassets.js` — leia lá pra
 * explicação completa, aqui só o resumo): o app roda 100% client-side via
 * `file:///`, sem servidor — `fetch()`/`XMLHttpRequest` de um arquivo
 * `file://` local é bloqueado por CORS, então um `.json`/`.html` puro não
 * dá pra carregar de dentro do JS da página. UMA tag `<script src="...">`
 * carrega de `file://` sem esse bloqueio — por isso cada arquivo de card é
 * um `.js` que se auto-registra, e não um `.html`/`.json` puro.
 *
 * DIFERENÇA DELIBERADA em relação a `assets/modelos/` (documentada aqui pra
 * não parecer inconsistência): lá são ~60+ tipos possíveis (todo `tipo` de
 * objeto do catálogo, fixo ou customizado pelo usário), carregados SOB
 * DEMANDA via `<script>` criada dinamicamente (`ObjectAssets._tryLoadScript`)
 * porque não dá pra saber de antemão quais tipos existem. Cards são um
 * conjunto FIXO e pequeno (hoje só 5) — não há necessidade nenhuma de
 * lazy-load; por isso `cards/*.js` são carregados com tags `<script>`
 * ESTÁTICAS direto no `index.html`, na mesma seção dos outros scripts de
 * infraestrutura (mais simples, sem Promise/`onerror`/cache de tentativas).
 *
 * CSS: diferente de JS, uma folha de estilo carregada por
 * `<link rel="stylesheet" href="arquivo/local.css">` funciona normalmente
 * de `file://` — CSS não sofre a mesma restrição de CORS que `fetch()`/
 * `XMLHttpRequest` sofrem (só afeta LEITURA de conteúdo via JavaScript; uma
 * tag `<link>`/`<script src>`/`<img src>` sempre pôde carregar de
 * `file://` sem bloqueio — é exatamente por isso que o app inteiro já
 * carrega `css/style.css`/`css/modeler3d.css` desse jeito desde sempre, ver
 * `index.html`). Por isso existe `cards/cards.css`, carregado normalmente
 * via `<link>` no `index.html` — cada card PODE usar classes de lá, ou
 * incluir um `<style>` inline escopado no próprio `bodyHtml`/`build` dele
 * quando quiser algo só seu, sem mexer no compartilhado.
 *
 * FORMATO DE UM ARQUIVO DE CARD — ver `cards/README.md` pra documentação
 * completa com exemplos; resumo aqui pra quem só quer o contrato da API:
 *
 *   CardSystem.register('meu-card', {
 *     // Caminho SIMPLES (a maioria dos cards) — HTML e wiring separados:
 *     bodyHtml(data, ctx) { return `<div>...</div>`; },
 *     wire(elCartao, data, ctx) { elCartao.querySelector('#x').onclick = ...; },
 *
 *     // OU caminho "build" (só quando o HTML e o wiring precisam
 *     // compartilhar um cálculo feito UMA VEZ SÓ — ex.: `cards/object-card.js`,
 *     // que decide a lista de botões finais uma vez e usa o MESMO resultado
 *     // tanto pra gerar o HTML quanto pra prender os listeners, evitando
 *     // rodar `onModelCardButtons` do Modelo do objeto duas vezes):
 *     build(data, ctx) { return { html: '...', wire(elCartao) { ... } }; },
 *   });
 *
 * `data` é o(s) dado(s) relevante(s) do card (o objeto do mapa, a câmera, a
 * foto, etc. — quem o `view3d.js` já tinha em mãos ao decidir mostrar aquele
 * card). `ctx` é o MESMO formato já usado por `onModelClick`/`onModelSpawn`
 * de `assets/modelos/` (`{view3d, DB, Utils, map, Components, Scripting,
 * ...}` — ver `ObjectAssets.buildCtx`), dando a qualquer card acesso ao
 * app inteiro sem precisar reinventar nada.
 */
window.CardSystem = {
  _cards: {}, // id do card -> def registrada

  /** Chamado pelo PRÓPRIO arquivo `cards/<algo>-card.js` ao carregar. */
  register(id, def) {
    this._cards[id] = def || {};
  },

  get(id) { return this._cards[id]; },

  /** Monta o elemento DOM do card `id` a partir de `data`/`ctx`, remove
   *  qualquer card já aberto (MESMO padrão que toda `_show*Card3D` de
   *  `view3d.js` já seguia: só um card na tela por vez) e anexa em
   *  `container` (sempre `this._container` de `View3D`, o mesmo elemento
   *  onde o canvas 3D e os overlays de tela cheia vivem). Devolve o
   *  elemento montado (ou `null` se o card `id` não existe/não carregou —
   *  quem chama decide o fallback, ver `_showObjectCard3D` em view3d.js).
   *  NÃO chama `document.exitPointerLock()` — isso continua sendo
   *  responsabilidade de quem chama (view3d.js), por rodar sempre, mesmo
   *  quando o card não existe/dá erro (ver comentário grande em
   *  `_showObjectCard3D`, view3d.js, sobre por que essa ordem importa). */
  mount(container, id, data, ctx) {
    const def = this._cards[id];
    if (!def) {
      console.error(`[CardSystem] card "${id}" não está registrado (arquivo cards/${id}...-card.js ausente ou com erro de sintaxe?)`);
      return null;
    }
    const existing = container.querySelector('.flashcard3d-overlay');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'flashcard3d-overlay';

    let html = '';
    let wireFn = null;
    if (typeof def.build === 'function') {
      const built = def.build(data, ctx) || {};
      html = built.html || '';
      wireFn = built.wire;
    } else {
      html = typeof def.bodyHtml === 'function' ? (def.bodyHtml(data, ctx) || '') : '';
      wireFn = def.wire;
    }
    el.innerHTML = html;
    container.appendChild(el);
    // Janela nova sempre à frente das outras (ver js/windowmanager.js).
    try { window.WindowManager?.focus?.(el); } catch (e) { /* segue sem z-index gerenciado */ }
    if (typeof wireFn === 'function') {
      try { wireFn(el, data, ctx); } catch (err) { console.error(`[CardSystem] erro ao "wire" o card "${id}":`, err); }
    }
    return el;
  },
};
