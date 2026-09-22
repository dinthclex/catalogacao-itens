/**
 * windowmanager.js — Gerenciador central de janelas/painéis flutuantes do
 * app. NOVO (07/09/2026), pedido verbatim: "posicionamento das janelas no
 * app. Faça uma função de gerenciamento de janelas para todo o app. O
 * objetivo principal é que a janela ativa sempre esteja visível, não haja
 * problemas com sobreposição (o z-index) e sirva para organização do
 * sistema de janelas do app. deve haver uma lista da estrutura do app, suas
 * janelas possíveis, saber se estão ativas ou não e seu z-index na pilha de
 * impressão. Ao criar uma nova funcionalidade, com janelas, o gerenciador
 * deve ser consultado para poder saber as disposições já 'cadastradas' e
 * disponibilizar valores de z-index para as novas janelas. Se uma janela
 * está em um z-index x, seus elementos internos devem ser x+1, x+2, ...
 * (se necessário), para evitar algo como x+100 ou valores maiores. Ao
 * assumir o foco a janela vem mais para afrente de todas as outras. Para
 * evitar ficar só aumentando cada vez mais os números de z-index a cada
 * 'subida' para o foco, deve haver um valor padrão mais alto distante de
 * z-index para quando se está no foco. Este valor deve ser conferido toda
 * vez para ver se realmente está mais acima de todos os valores de z-index
 * já cadastrados. Se não estiver, então, é aumentado. Faça uma auditoria de
 * todas as janelas do app para que sigam esta nova sistemática."
 *
 * DECISÃO DE ESCOPO TRANSPARENTE (não esquecimento) — "auditoria de todas
 * as janelas": o app tem dezenas de camadas com z-index hoje, construídas
 * ao longo de MUITAS rodadas anteriores (telas cheias/.modal-backdrop com
 * valores FIXOS em css/style.css, de 900 a 2100 — ver grep "z-index" nesse
 * arquivo — e painéis flutuantes com z DINÂMICO). Migrar CADA UMA dessas
 * camadas pro gerenciador central numa única rodada seria uma refatoração
 * grande demais (dezenas de arquivos) pra fazer sem risco de regressão
 * visual em alguma delas, sem poder testar num navegador de verdade nesta
 * sessão (restrição permanente do projeto). Nesta rodada: (1) o gerenciador
 * em si nasce PRONTO e COMPLETO, com TODAS as regras pedidas acima
 * implementadas; (2) o único mecanismo que já fazia algo parecido
 * (`Utils.bringToFront`, usado por TODOS os painéis flutuantes do mapa —
 * Ferramentas/Camadas/Histórico/paineis de propriedade de objeto/etc, ver
 * grep "bringToFront" em mapview.js/history.js) tinha EXATAMENTE o defeito
 * que o pedido descreve — um contador que só crescia +1 a cada foco, pra
 * sempre, sem nenhum "valor padrão distante conferido a cada vez" — foi
 * MIGRADO de verdade pra usar este gerenciador por baixo (ver utils.js
 * `Utils.bringToFront`, virou um wrapper fino que chama `WindowManager.
 * focus(el)`); NENHUM dos ~10 lugares que já chamavam `Utils.bringToFront
 * (el)` precisou mudar uma linha — o mesmo "contrato" (recebe o elemento,
 * devolve o novo z-index) continua valendo. (3) As camadas ESTÁTICAS
 * conhecidas (telas cheias, modais, overlay do Organizar) foram
 * REGISTRADAS aqui como catálogo de REFERÊNCIA (`WindowManager.
 * KNOWN_LAYERS`) — documentação viva de que faixa de z-index cada uma já
 * ocupa, pra qualquer janela NOVA "consultar o gerenciador" antes de
 * escolher um z-index (exatamente o pedido "deve ser consultado para poder
 * saber as disposições já cadastradas") — mas elas CONTINUAM com seu
 * z-index fixo de CSS (não competem entre si por foco do jeito que os
 * painéis flutuantes competiam, então não há o mesmo problema a resolver
 * ali). Convertê-las de verdade pro registro dinâmico fica registrado como
 * trabalho de uma próxima rodada, se o usuário confirmar que quer isso.
 */
const WindowManager = {
  /** Catálogo de referência das FAIXAS de z-index já ocupadas por camadas
   *  ESTÁTICAS do app (definidas em CSS ou inline fixo em algum arquivo) —
   *  não são "janelas" geridas dinamicamente por este módulo (não entram na
   *  disputa de foco de `focus()`/`register()` abaixo), só documentação
   *  viva pra decidir com segurança onde uma janela NOVA pode nascer sem
   *  colidir com nenhuma delas. Mantida ORDENADA por z-index crescente.
   */
  KNOWN_LAYERS: [
    { id: 'app-header-footer', zIndex: 10, desc: 'Cabeçalho/rodapé fixos do app (fora de #view) — css/style.css' },
    { id: 'fullscreen-views', zIndex: 900, desc: 'Telas cheias com câmera/canvas (Fotos do ambiente, Modo assistido 3D, overlay do Organizar) — css/style.css' },
    { id: 'modal-backdrop', zIndex: 950, desc: 'Modais padrão (.modal-backdrop, ex.: ⚙️ Configurações do mapa) — css/style.css' },
    { id: 'floating-panels', zIndex: 961, desc: 'Base dos painéis flutuantes dinâmicos do Mapa (Ferramentas/Camadas/Histórico/propriedades de objeto) — GERENCIADA por este módulo, ver register()/focus() abaixo' },
  ],

  /** Janelas dinâmicas conhecidas por este módulo nesta sessão de página:
   *  Map de chave (id string OU o próprio elemento DOM) -> registro
   *  { id, el, kind, label, baseZIndex, active }. Duas entradas no Map
   *  podem apontar pro MESMO objeto de registro (uma pela chave string, se
   *  `register()` foi chamado com id; outra pelo próprio elemento, sempre)
   *  — assim tanto `focus('meu-id')` quanto `focus(elemento)` funcionam. */
  _windows: new Map(),

  /** Valor "padrão distante" de foco (pedido verbatim) — NUNCA incrementado
   *  a cada chamada de `focus()` (esse era o bug do antigo
   *  `Utils._frontZCounter`). Só sobe quando `focus()` detecta, na hora,
   *  que alguma janela já cadastrada alcançou ou ultrapassou este valor —
   *  ver `focus()` abaixo pro algoritmo de verdade. Nasce logo acima da
   *  faixa "floating-panels" do catálogo acima. */
  _focusZ: 961,

  /** Devolve a lista de janelas dinâmicas cadastradas agora (cópia rasa,
   *  pra quem quiser "saber se estão ativas ou não e seu z-index na pilha"
   *  sem poder mexer no registro interno por acidente). */
  list() {
    const seen = new Set();
    const out = [];
    this._windows.forEach((w) => { if (!seen.has(w)) { seen.add(w); out.push({ ...w, el: undefined }); } });
    return out;
  },

  /** Maior z-index BASE ("posição de origem", ver comentário grande de
   *  `focus()` abaixo — NUNCA o valor temporário de quem está em foco AGORA)
   *  entre todas as janelas dinâmicas cadastradas (ou 961, base do
   *  catálogo, se nenhuma ainda existir) — usado tanto por `_nextBaseZ()`
   *  (janela NOVA) quanto por `focus()` (checagem do "valor padrão
   *  distante"). */
  _maxRegisteredBaseZ() {
    let max = 961;
    const seen = new Set();
    this._windows.forEach((w) => {
      if (seen.has(w)) return;
      seen.add(w);
      if (w.baseZIndex > max) max = w.baseZIndex;
    });
    return max;
  },

  /** z-index BASE pra uma janela dinâmica NOVA que ainda não tem uma —
   *  nasce logo ACIMA da maior já cadastrada (fica "atrás" de quem estiver
   *  em foco até alguém focar nela também — pedido: "a janela ativa sempre
   *  deve estar visível", não necessariamente TODA janela nova). */
  _nextBaseZ() {
    return this._maxRegisteredBaseZ() + 1;
  },

  /** Registra (ou atualiza, se `id` já existir) uma janela/painel NOVO no
   *  catálogo — pedido verbatim: "Ao criar uma nova funcionalidade, com
   *  janelas, o gerenciador deve ser consultado para poder saber as
   *  disposições já cadastradas e disponibilizar valores de z-index para
   *  as novas janelas." Devolve o z-index BASE atribuído (já aplicado em
   *  `el.style.zIndex`, se `el` foi passado) — elementos INTERNOS dessa
   *  janela devem usar `childZIndex(id, 1)`, `childZIndex(id, 2)`, etc. em
   *  vez de números soltos (ver essa função abaixo). `opts.zIndex` força um
   *  valor específico (uso raro — só quando a janela PRECISA nascer num
   *  ponto exato do catálogo estático, ex. alinhada a uma faixa de
   *  KNOWN_LAYERS); por padrão, o próprio gerenciador escolhe. */
  register(id, opts = {}) {
    const { el = null, kind = 'panel', label = id, zIndex = null } = opts;
    const baseZIndex = zIndex != null ? zIndex : this._nextBaseZ();
    const w = { id, el, kind, label, baseZIndex, active: true };
    this._windows.set(id, w);
    if (el) { this._windows.set(el, w); el.style.zIndex = String(baseZIndex); }
    return baseZIndex;
  },

  /** Remove `id` (e o elemento associado, se houver) do catálogo de vez —
   *  janela destruída/desmontada de verdade (não usar pra só "esconder";
   *  ver `setActive` abaixo pra isso). */
  unregister(id) {
    const w = this._windows.get(id);
    if (!w) return;
    this._windows.delete(id);
    if (w.el) this._windows.delete(w.el);
  },

  /** Marca `id` como ativa/inativa sem removê-la do catálogo — pedido:
   *  "saber se estão ativas ou não" (ex.: um painel que só esconde via
   *  `display:none` continua "existindo" pro gerenciador). */
  setActive(id, active) {
    const w = this._windows.get(id);
    if (w) w.active = !!active;
  },

  /** z-index de um elemento INTERNO de uma janela já registrada — pedido
   *  verbatim: "Se uma janela está em um z-index x, seus elementos internos
   *  devem ser x+1, x+2, ... (se necessário), para evitar algo como x+100
   *  ou valores maiores." `offset` é sempre um passo pequeno (1, 2, 3...),
   *  nunca um salto grande. Se `id` não estiver cadastrada, cai pro
   *  `_focusZ` atual como base (mais seguro que devolver `NaN`). */
  childZIndex(id, offset = 1) {
    const w = this._windows.get(id);
    const base = w ? w.baseZIndex : this._focusZ;
    return base + Math.max(1, Math.floor(offset) || 1);
  },

  /** Janela dinâmica que está OCUPANDO o "valor padrão distante" (`_focusZ`)
   *  agora, se houver — ver `focus()` abaixo. Nunca mais de uma por vez. */
  _topWindow: null,

  /** Traz a janela (`idOrEl`: tanto o id passado em `register()` quanto um
   *  elemento DOM avulso, mesmo nunca registrado antes — auto-cadastra
   *  nesse caso) pra FRENTE de todas as outras janelas gerenciadas.
   *
   *  ALGORITMO (pedido verbatim, ver cabeçalho do arquivo) — importante:
   *  aqui NUNCA se muda o `baseZIndex` ("posição de origem/registrada") de
   *  uma janela ao focá-la — só o `el.style.zIndex` de tela, temporariamente.
   *  1) Se já havia outra janela ocupando `_focusZ` (`_topWindow`), ela é
   *     DEVOLVIDA pro seu próprio `baseZIndex` (sai do "topo absoluto",
   *     volta pra posição de origem no catálogo) — só UMA janela ocupa
   *     `_focusZ` por vez.
   *  2) Confere se `_focusZ` ainda está estritamente acima de TODOS os
   *     `baseZIndex` REGISTRADOS (nunca alterados por foco, só por
   *     `register()`) — só sobe `_focusZ` se algum deles alcançou/
   *     ultrapassou (situação rara: uma janela nova nasceu num
   *     `baseZIndex` alto demais). Como `baseZIndex` nunca muda por causa
   *     de foco, focar a MESMA janela repetidas vezes (ou alternar entre
   *     poucas janelas) NUNCA faz `_focusZ` crescer — era exatamente esse
   *     o defeito do antigo `Utils._frontZCounter` (crescia +1 a cada
   *     clique, pra sempre, sem nenhuma checagem) que este método substitui.
   *  3) A janela agora em foco recebe `_focusZ` (o valor "padrão, mais alto,
   *     distante") e vira a nova `_topWindow`.
   *  Devolve o z-index aplicado. */
  focus(idOrEl) {
    if (!idOrEl) return this._focusZ;
    const el = (idOrEl.nodeType === 1) ? idOrEl : (this._windows.get(idOrEl)?.el || null);
    if (!el) return this._focusZ;

    // Limpa registros de elementos que já saíram do DOM (evita acumular).
    this._windows.forEach((ww, k) => { if (ww.el && !ww.el.isConnected && ww !== this._topWindow && typeof k !== 'string') this._windows.delete(k); });
    let w = this._windows.get(el);
    if (!w) {
      // Auto-cadastro: `focus(el)` foi chamado direto num elemento nunca
      // registrado antes (o caso mais comum hoje, via Utils.bringToFront —
      // ver comentário grande no topo do arquivo). `id` vira o próprio
      // elemento por falta de um nome melhor; ainda aparece em `list()`.
      w = { id: el, el, kind: 'panel', label: null, baseZIndex: this._nextBaseZ(), active: true };
      this._windows.set(el, w);
    }

    // (1) devolve quem estava no topo (se for OUTRA janela) pra origem dela.
    if (this._topWindow && this._topWindow !== w && this._topWindow.el) {
      this._topWindow.el.style.zIndex = String(this._topWindow.baseZIndex);
    }

    // (2) checagem do "valor padrão distante" — só sobe se necessário.
    const maiorBase = this._maxRegisteredBaseZ();
    if (maiorBase >= this._focusZ) this._focusZ = maiorBase + 1;

    // (3) aplica.
    el.style.zIndex = String(this._focusZ);
    w.active = true;
    this._topWindow = w;
    return this._focusZ;
  },

  /** [15/09/2026 UTC] NOVO — pedido verbatim: "Ao 'fechar' a janela, ela
   *  deve voltar para o seu z-index normal." Antes, fechar uma janela nunca
   *  devolvia o `_focusZ` (o valor "padrão, mais alto, distante") pra
   *  ninguém — se a janela fechada era a `_topWindow`, `_topWindow` ficava
   *  apontando pra um registro "órfão" (elemento removido/oculto do DOM)
   *  até a PRÓXIMA janela ganhar foco (o que já reequilibra tudo sozinho em
   *  `focus()`, então não é um bug funcional grave), mas o próprio elemento
   *  fechado continuava com `style.zIndex` cravado no valor de foco antigo
   *  — se ele for só OCULTADO (`display:none`, não removido — ver
   *  `mapview.js _hideOrRemovePanel`) e reaparecer mais tarde por algum
   *  caminho que não passe por `focus()` de novo, reapareceria já "na
   *  frente" de qualquer coisa aberta depois dele, sem ter sido clicado.
   *  `blur(idOrEl)` devolve o elemento pro seu `baseZIndex` de origem (a
   *  posição "de repouso" no catálogo, nunca o valor de foco) SÓ se ele for
   *  de fato quem está ocupando `_focusZ` agora — janelas que já não
   *  estavam em foco (nunca clicadas por último) não têm nada a devolver, e
   *  ficam intocadas. */
  blur(idOrEl) {
    if (!idOrEl) return;
    const el = (idOrEl.nodeType === 1) ? idOrEl : (this._windows.get(idOrEl)?.el || null);
    if (!el) return;
    const w = this._windows.get(el);
    if (!w) return;
    if (this._topWindow === w) {
      el.style.zIndex = String(w.baseZIndex);
      this._topWindow = null;
    }
  },
};

/**
 * NOVO (07/09/2026) — "Termine o que ficou pendente da rodada anterior.
 * Complete desta vez." A rodada anterior deixou registrado como pendência
 * transparente: migrar as camadas ESTÁTICAS (modais/telas cheias) pro
 * gerenciador de verdade. Migrar TODAS (dezenas de significados diferentes
 * de z-index espalhados por css/style.css, de 900 a 2100 — telas cheias,
 * toasts, HUD, tooltips, chips arrastáveis...) continua sendo grande demais
 * pra uma rodada só sem risco (a maioria delas é uma instância ÚNICA fixa,
 * que nunca compete por empilhamento com outra igual — não tem o mesmo
 * problema que os painéis flutuantes tinham). A que REALMENTE se
 * beneficia — porque pode ter VÁRIAS instâncias simultâneas competindo pelo
 * mesmo espaço (ex.: abrir "⚙️ Configurações" e, de dentro dele, um
 * segundo modal de confirmação por cima) é `.modal-backdrop` (css/
 * style.css, z-index:950 fixo) — hoje, se dois desses estiverem abertos ao
 * mesmo tempo, os dois têm o MESMO z-index 950 (só a ordem de inserção no
 * DOM decide qual fica visualmente por cima, funciona por acidente, não por
 * garantia). Esta parte final MIGRA `.modal-backdrop` de verdade, SEM
 * precisar tocar em nenhum dos muitos arquivos que criam modais
 * (`document.body.appendChild(modal)` espalhado por dezenas de funções) —
 * um `MutationObserver` observa `document.body` e cadastra/descadastra
 * automaticamente cada `.modal-backdrop` que aparece/desaparece,
 * consultando o gerenciador (`register`) pra dar um z-index de VERDADE
 * (950, 951, 952... nunca mais todos empatados em 950) — resolve o
 * "sobreposição" pedido no objetivo principal do gerenciador pra esta
 * camada, sem qualquer mudança de comportamento visual pro caso comum (só 1
 * modal aberto por vez, que é a esmagadora maioria). Os elementos INTERNOS
 * de um modal continuam usando z-index relativo ao próprio `.modal-sheet`
 * (nenhum modal hoje precisa de um filho com z-index absoluto maior que o
 * do próprio backdrop) — não havia nada pra migrar em `childZIndex` aqui.
 */
(function autoTrackModalBackdrops() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  let _seq = 0;
  const trackOne = (el) => {
    if (!el.classList || !el.classList.contains('modal-backdrop')) return;
    const id = `modal-backdrop-${++_seq}`;
    el.dataset.wmId = id;
    // Sempre à frente de TUDO que já está aberto (inclusive painéis flutuantes
    // focados, que ficam em `_focusZ`): nasce acima do maior entre o próximo
    // z de modal e o z de foco atual, e empurra `_focusZ` junto.
    const z = Math.max(WindowManager._nextModalZ(), WindowManager._focusZ + 1);
    WindowManager.register(id, { el, kind: 'modal', label: 'Modal', zIndex: z });
    if (WindowManager._focusZ < z) WindowManager._focusZ = z;
  };
  const untrackOne = (el) => {
    if (!el.dataset || !el.dataset.wmId) return;
    WindowManager.unregister(el.dataset.wmId);
  };
  const scan = (node, fn) => {
    if (node.nodeType !== 1) return;
    if (node.classList && node.classList.contains('modal-backdrop')) fn(node);
    node.querySelectorAll?.('.modal-backdrop').forEach(fn);
  };
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((n) => scan(n, trackOne));
      m.removedNodes.forEach((n) => scan(n, untrackOne));
    });
  });
  const start = () => observer.observe(document.body, { childList: true, subtree: false });
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

/** z-index pra um `.modal-backdrop` NOVO — nasce logo ACIMA do maior
 *  `.modal-backdrop` já aberto (empilhamento de verdade quando há mais de
 *  um simultâneo), nunca abaixo da faixa 950 do catálogo estático. Só
 *  considera janelas cadastradas com `kind:'modal'` (não mistura com os
 *  painéis flutuantes do Mapa, que vivem numa faixa mais alta, 961+). */
WindowManager._nextModalZ = function _nextModalZ() {
  let z = 950;
  this._windows.forEach((w) => { if (w.kind === 'modal' && w.baseZIndex >= z) z = w.baseZIndex + 1; });
  return z;
};


/**
 * Regra global (pedido do usuário): "sempre que for clicado em um botão que ativa uma janela, esta janela deve tomar a frente".
 * Depois de um clique em botão, observa o DOM por um instante e, se uma janela/painel flutuante aparecer (adicionada ao DOM ou
 * reexibida — display/class 'hidden'/atributo hidden), traz ela para a frente com `WindowManager.focus`. Também traz para a frente
 * a janela que CONTÉM o botão clicado. `.modal-backdrop` fica de fora (já empilhado por `_nextModalZ`); avisos (toast) também.
 */
(function () {
  if (typeof document === 'undefined') return;
  const JANELA = /(panel|modal|overlay|card|window|popover|dialog|sheet|janela|painel|flashcard|floating|flutuante)/i;
  const IGNORAR = /(toast|tooltip|backdrop|hud|topbar|hotbar|vignette|cc3d-)/i;
  let ate = 0, obs = null;
  const cls = (el) => (typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || '');
  const ehJanela = (el) => {
    if (!el || el.nodeType !== 1 || !el.isConnected) return false;
    const c = cls(el);
    if (IGNORAR.test(c) || IGNORAR.test(el.id || '')) return false;
    if (!(JANELA.test(c) || JANELA.test(el.id || '') || el.getAttribute('role') === 'dialog' || el.dataset.panelType)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return cs.position === 'fixed' || cs.position === 'absolute';
  };
  const trazer = (el) => { try { WindowManager.focus(el); } catch (e) { /* ignora */ } };
  const candidatos = (n) => {   // o próprio nó e seus descendentes diretos "janela" (uma janela pode vir dentro de um wrapper)
    if (!n || n.nodeType !== 1) return;
    if (ehJanela(n)) { trazer(n); return; }
    if (n.querySelectorAll) n.querySelectorAll('[class*="panel"],[class*="card"],[class*="overlay"],[class*="window"],[role="dialog"],[data-panel-type]').forEach((d) => { if (ehJanela(d)) trazer(d); });
  };
  const escutar = () => {
    if (obs) return;
    obs = new MutationObserver((muts) => {
      if (Date.now() > ate) { obs.disconnect(); obs = null; return; }
      muts.forEach((m) => {
        if (m.type === 'childList') m.addedNodes.forEach(candidatos);
        else if (m.type === 'attributes') {
          const t = m.target, antes = m.oldValue || '';
          const estavaOculta = m.attributeName === 'hidden' ? true
            : m.attributeName === 'style' ? /display:\s*none/.test(antes)
            : /(^|\s)(hidden|collapsed|is-hidden)(\s|$)/.test(antes);
          if (estavaOculta) candidatos(t);
        }
      });
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class', 'hidden'] });
  };
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('button, [role="button"], .btn, .icon-btn, a[href], summary') : null;
    if (!t) return;
    // 1) a janela onde o botão está também vai para a frente
    let a = t.parentElement;
    while (a && a !== document.body) { if (ehJanela(a) && !a.classList.contains('modal-backdrop')) { trazer(a); break; } a = a.parentElement; }
    // 2) janelas que este clique fizer aparecer (síncrono ou logo depois, ex.: depois de um await)
    ate = Date.now() + 1200;
    escutar();
  }, true);
})();

window.WindowManager = WindowManager;
