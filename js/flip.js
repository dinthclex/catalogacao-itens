/**
 * flip.js — Módulo separado (pedido do usuário, 28/08/2026: "Modularize o flip dos botões
 * que é usado atualmente em 'Ver lista simples' de modo que seja possível usar seus
 * atributos e métodos em outras partes do código") com a técnica de arraste-para-reordenar
 * com animação FLIP (First-Last-Invert-Play) — extraída de verlistasimples.js (que usava
 * isto só para os chips de "Partes de informação em cada linha"), agora reutilizável por
 * qualquer lista/fileira do app. A "📋 Tabela" (table.js) usa este módulo para arrastar e
 * reordenar colunas (ver `_attachColDrag` lá).
 *
 * A técnica (documentada em detalhe originalmente em verlistasimples.js, preservada aqui
 * sem mudanças de comportamento):
 *  - O elemento ARRASTADO tem posição PRÓPRIA — um `transform: translate(...)` recalculado
 *    a cada pointermove pra grudar exatamente no ponto onde o dedo/mouse pegou ele
 *    (`followDrag`) — nunca fica "parado" esperando a vez de ser animado.
 *  - O FLIP das OUTRAS linhas/colunas (que abrem espaço) usa um laço próprio de
 *    requestAnimationFrame (não CSS transition, que só começa a contar a duração no
 *    PRÓXIMO frame — descompasso pequeno mas real com a trava de troca abaixo).
 *  - "Swap threshold" geométrico: uma troca de posição só acontece quando o cursor cruza a
 *    METADE do alvo NO SENTIDO do movimento — não basta "estar em cima" do alvo. Sem isto,
 *    um vizinho bem mais largo/alto que o arrastado continua "embaixo do cursor" mesmo
 *    depois de trocar de lugar, e a checagem seguinte desfaz a troca — fica "flipando" pra
 *    lá e pra cá indefinidamente enquanto os tamanhos forem bem diferentes.
 *  - Trava de tempo (`swapLockedUntil`) — uma troca nova só é aceita depois que a animação
 *    FLIP da troca anterior termina de vez, evitando alternar rápido demais.
 *
 * Carregado como <script> comum (sem type="module") — mesmo padrão de todos os outros
 * arquivos do app (o app roda direto de file:///, que bloqueia módulos ES6 por CORS).
 * Precisa vir ANTES de qualquer arquivo que use `window.Flip` (verlistasimples.js,
 * table.js) e depois de utils.js no index.html/sw.js.
 */
const Flip = {
  DURATION_MS: 200,
  DRAG_THRESHOLD: 8,

  /**
   * Cria um "sortable": arraste-para-reordenar com animação FLIP, para os filhos diretos
   * de `container` que casam com `opts.itemSelector`. Devolve `{attach, flipMove,
   * cancelDrag}` — chame `attach(el)` uma vez para cada elemento arrastável (ex: a cada
   * `renderX()` que recria os elementos).
   *
   * Opções:
   *  - itemSelector (obrigatório): seletor CSS dos itens arrastáveis, filhos diretos de
   *    `container` (ex: '.lb-campo-chip', '.vtable-th').
   *  - handleSelector (opcional): se informado, só um pointerdown DENTRO deste seletor
   *    inicia o arrasto (em vez do item inteiro). Ex: uma "alça" tipo ⠿.
   *  - ignoreSelector (opcional): pointerdown dentro deste seletor NUNCA inicia arrasto,
   *    mesmo sem handleSelector (ex: um checkbox ou botão dentro do item).
   *  - draggingClass (opcional): classe CSS aplicada ao item enquanto está sendo arrastado.
   *  - axis ('auto' | 'x' | 'y', default 'auto'): 'auto' decide, a cada comparação com o
   *    alvo, se ele está na "mesma linha" (eixo X) ou não (eixo Y) — como uma fileira
   *    `flex-wrap`. 'x' força sempre horizontal (uma única linha, como cabeçalhos de
   *    tabela); 'y' força sempre vertical (uma lista).
   *  - dragThreshold (opcional, default DRAG_THRESHOLD): px de movimento antes de
   *    considerar "arrasto" em vez de um clique/toque parado.
   *  - duration (opcional, default DURATION_MS): duração da animação FLIP em ms.
   *  - onDragStart(el) (opcional): chamado quando o arrasto de fato começa (passou do
   *    threshold).
   *  - onDrop(orderedEls) (opcional): chamado ao soltar, DEPOIS de mover de verdade (não em
   *    um clique parado) — `orderedEls` é a ordem final dos filhos do container no DOM.
   *  - onClick(el, e) (opcional): chamado no pointerup quando NÃO houve arrasto (toque/
   *    clique parado) — útil quando o mesmo elemento também deve responder a clique normal.
   */
  makeSortable(container, opts = {}) {
    const duration = opts.duration || Flip.DURATION_MS;
    const threshold = opts.dragThreshold || Flip.DRAG_THRESHOLD;
    const axisMode = opts.axis || 'auto';
    let dragState = null;
    let swapLockedUntil = 0;
    let flipAnims = new Map(); // elemento (que NÃO é o arrastado) → {dx,dy,start}
    let flipLoopId = null;

    const ensureFlipLoop = () => {
      if (flipLoopId) return;
      const step = () => {
        if (!flipAnims.size) { flipLoopId = null; return; }
        const now = performance.now();
        for (const [el, anim] of flipAnims) {
          if (!el.isConnected) { flipAnims.delete(el); continue; }
          const t = Math.min(1, (now - anim.start) / duration);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cúbico
          const ox = anim.dx * (1 - eased), oy = anim.dy * (1 - eased);
          el.style.transform = (Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) ? `translate(${ox}px,${oy}px)` : '';
          if (t >= 1) { el.style.transform = ''; flipAnims.delete(el); }
        }
        flipLoopId = requestAnimationFrame(step);
      };
      flipLoopId = requestAnimationFrame(step);
    };

    /** FLIP genérico — mede a posição de cada filho de `container` ANTES, aplica
     *  `mutate()` (reordenar no DOM), e anima cada um que mudou de posição de volta pro
     *  lugar visual antigo até o novo. `draggedEl` (se houver) nunca entra na animação —
     *  tem posição própria, grudada no cursor (ver followDrag). */
    const flipMove = (mutate, draggedEl) => {
      const items = [...container.children];
      const firstRects = new Map(items.map((c) => [c, c.getBoundingClientRect()]));
      mutate();
      const now = performance.now();
      items.forEach((c) => {
        if (c === draggedEl) { flipAnims.delete(c); return; }
        const first = firstRects.get(c);
        const last = c.getBoundingClientRect();
        const dx = first.left - last.left, dy = first.top - last.top;
        if (!dx && !dy) { flipAnims.delete(c); return; }
        flipAnims.set(c, { dx, dy, start: now });
      });
      ensureFlipLoop();
    };

    /** Mantém o elemento ARRASTADO grudado no cursor durante o gesto inteiro: mede a
     *  posição NATURAL dele agora (sem nenhum transform) e desloca (translate) pra bater
     *  exatamente com o ponto onde o cursor pegou ele (`grab.x/y`, guardado uma vez no
     *  início do arrasto). Chamada incondicionalmente a cada pointermove. */
    const followDrag = (el, grab, e) => {
      el.style.transform = '';
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - grab.x) - rect.left;
      const dy = (e.clientY - grab.y) - rect.top;
      el.style.transform = (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) ? `translate(${dx}px,${dy}px)` : '';
    };

    const cancelDrag = () => {
      if (dragState) {
        const { el } = dragState;
        if (opts.draggingClass) el.classList.remove(opts.draggingClass);
        el.style.transform = '';
        el.style.zIndex = '';
        el.style.pointerEvents = '';
        flipAnims.delete(el);
      }
      dragState = null;
    };

    const attach = (el) => {
      let pointerId = null, downX = 0, downY = 0, moved = false, grab = null;
      const onMove = (e) => {
        if (e.pointerId !== pointerId) return;
        const dx = e.clientX - downX, dy = e.clientY - downY;
        if (!moved) {
          if (Math.hypot(dx, dy) <= threshold) return;
          moved = true;
          dragState = { el };
          if (opts.draggingClass) el.classList.add(opts.draggingClass);
          el.style.zIndex = '5'; // sempre por cima dos outros, mesmo passando visualmente por cima deles
          el.style.pointerEvents = 'none'; // sem isto, elementFromPoint (abaixo) acharia o PRÓPRIO elemento em vez do que está embaixo dele
          const rect0 = el.getBoundingClientRect();
          grab = { x: downX - rect0.left, y: downY - rect0.top };
          if (opts.onDragStart) opts.onDragStart(el);
        }
        e.preventDefault();
        followDrag(el, grab, e);
        const now = performance.now();
        if (now < swapLockedUntil) return; // só o elemento arrastado acompanha o cursor sem parar — a TROCA de posição espera o flip anterior terminar de vez
        const hitEl = document.elementFromPoint(e.clientX, e.clientY);
        const target = hitEl && hitEl.closest ? hitEl.closest(opts.itemSelector) : null;
        if (!target || target === el || target.parentElement !== container) return;
        const items = [...container.children];
        const fromIdx = items.indexOf(el), toIdx = items.indexOf(target);
        if (fromIdx === -1 || toIdx === -1) return;
        const forward = fromIdx < toIdx;
        const targetRect = target.getBoundingClientRect();
        const prevTransform = el.style.transform;
        el.style.transform = ''; // mede a posição NATURAL do arrastado (sem o transform que o gruda no cursor)
        const natRect = el.getBoundingClientRect();
        el.style.transform = prevTransform;
        let sameRow;
        if (axisMode === 'x') sameRow = true;
        else if (axisMode === 'y') sameRow = false;
        else sameRow = Math.abs(targetRect.top - natRect.top) < targetRect.height / 2;
        // Swap threshold: só troca quando o cursor cruza a METADE do alvo no sentido do
        // movimento (ver comentário no topo do arquivo) — evita "flipar" pra lá e pra cá
        // quando os itens têm tamanhos bem diferentes.
        const passedHalfway = sameRow
          ? (forward ? e.clientX >= targetRect.left + targetRect.width / 2 : e.clientX <= targetRect.left + targetRect.width / 2)
          : (forward ? e.clientY >= targetRect.top + targetRect.height / 2 : e.clientY <= targetRect.top + targetRect.height / 2);
        if (!passedHalfway) return;
        flipMove(() => {
          if (forward) container.insertBefore(el, target.nextSibling);
          else container.insertBefore(el, target);
        }, el);
        followDrag(el, grab, e); // reancora a partir da nova posição natural (pós-reorder) — sem nenhum "pulo" visual
        swapLockedUntil = now + duration;
      };
      const finish = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onCancel);
        pointerId = null;
      };
      const onUp = (e) => {
        if (e.pointerId !== pointerId) return;
        finish();
        const wasMoved = moved;
        moved = false;
        if (wasMoved) { cancelDrag(); if (opts.onDrop) opts.onDrop([...container.children]); }
        else if (opts.onClick) opts.onClick(el, e);
      };
      const onCancel = (e) => {
        if (e.pointerId !== pointerId) return;
        finish();
        moved = false;
        cancelDrag();
      };
      el.addEventListener('pointerdown', (e) => {
        if (opts.ignoreSelector && e.target.closest(opts.ignoreSelector)) return;
        if (opts.handleSelector && !e.target.closest(opts.handleSelector)) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        pointerId = e.pointerId; downX = e.clientX; downY = e.clientY; moved = false;
        swapLockedUntil = 0; // um gesto novo nunca deve nascer travado por causa do gesto anterior
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onCancel);
      });
    };

    return { attach, flipMove, cancelDrag };
  },
};
// Mesma convenção de TODOS os módulos do app: `const Flip = {...}` sozinho NÃO cria
// `window.Flip` (nível-topo com `const` fica só no escopo léxico do script). Sem esta
// linha, `window.Flip?.makeSortable?.()` em outro arquivo silenciosamente não acharia nada.
window.Flip = Flip;
