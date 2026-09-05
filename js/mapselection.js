/**
 * mapselection.js — Módulo separado (pedido do usuário, 25/08/2026: "tudo referente as
 * funções de selecionar, deixe em um arquivo separado (modular)... Ficará mais simples de
 * fazer alterações e melhorias estando modularizado") com TODA a lógica "pura" (geometria/
 * conjuntos, sem tocar em `this._map`/DOM/histórico) das 3 ferramentas de seleção estilo
 * Paint.NET do Mapa 2D — Selecionar (retângulo), Laço, Elipse:
 *
 *  - Os 5 modos de combinação (Substituir/Adicionar/Subtrair/Interseção/Invertido) e seus
 *    ícones — ver MapView._selectionModeButtonsHtml/_wireSelectionModeButtons (mapview.js).
 *  - Teste ponto-dentro-de-forma (retângulo/elipse/laço via Ray-Casting) — usado tanto pra
 *    decidir quais ELEMENTOS do mapa (pinos/câmeras/objetos/textos/paredes/portas/janelas)
 *    caem dentro de uma região desenhada (ver MapView._forEachSelectableEl/
 *    _recomputeToolSelectionFromRegions) quanto pelo próprio desenho do contorno.
 *  - A "álgebra de conjuntos" das 5 combinações (união/subtração/interseção/XOR/substituir)
 *    sobre um Set de chaves "kind:id" — MESMA lógica aplicada tanto a elementos quanto ao
 *    campo contínuo usado pra desenhar o contorno unificado (Marching Squares).
 *  - O "limite granular" da seleção (pedido do usuário, 25/08/2026: "a ideia do pixel será
 *    entendida como o snap da grade ou, se não estiver definido o snap, será de 1cm") — os
 *    PONTOS/vértices de cada forma desenhada (retângulo/laço/elipse) nascem já alinhados a
 *    essa distância, nunca em qualquer posição contínua do mouse — ver snapPoint() abaixo e
 *    as chamadas em mapview.js (_onObjectsPointerDown/_onObjectsPointerMove, ferramentas
 *    'select'/'lasso'/'ellipse').
 *  - O desenho do contorno tracejado "andando" (marching ants) unificado de várias formas
 *    sobrepostas (Marching Squares sobre um campo contínuo que respeita o modo de cada
 *    forma) — usado por Map2DRenderer.render() (mapview.js).
 *
 * O ESTADO (quais regiões existem agora, qual é a seleção atual, qual ferramenta está
 * ativa, desfazer/refazer, mover/redimensionar em grupo, recortar/colar) continua em
 * mapview.js — está fundido demais com o resto do app (dezenas de outras ferramentas
 * compartilham as mesmas funções gigantes de pointerdown/move/up, undo/histórico, camadas)
 * pra extrair sem um risco alto de quebrar tudo o mais. Este arquivo é só a "matemática"
 * pura por trás — sem isso, "modularizar" viraria só mover código sem separar responsabilidade
 * de verdade. Toda função aqui é PURA (sem `this`, sem ler/escrever nada fora dos parâmetros).
 *
 * Carregado como <script> comum (sem type="module") — o app roda direto de file:///, e
 * módulos ES6 (import/export) são bloqueados por CORS nesse protocolo. Mesmo padrão de
 * TODOS os outros arquivos do app (DB, Utils, Mapping, PhotoGrid, AmbientePhotos...): um
 * objeto global (`window.MapSelection`), carregado ANTES de mapview.js no index.html.
 */
const MapSelection = {
  // Opacidade do preenchimento das áreas de seleção — mesmo valor de sempre (ver
  // Map2DRenderer.drawShapeSet), extraído pra cá pra não duplicar a constante.
  FILL_ALPHA: 0.28,

  // ---------- Os 5 modos de combinação ----------
  // Cada `id` aqui é exatamente o que applySetOp() espera receber — ver MapView.
  // _selectionModeButtonsHtml/_wireSelectionModeButtons (mapview.js) pros 5 botões do
  // cabeçalho, um por modo.
  MODES: [
    { id: 'replace', label: 'Substituir', title: 'Substituir — cada nova seleção troca a anterior inteira. Com Ctrl pressionado, vira temporariamente "Adicionar (União)".' },
    { id: 'add', label: 'Adicionar (União)', title: 'Adicionar (União) — soma a nova área à seleção já feita, sempre, independente do Ctrl.' },
    { id: 'subtract', label: 'Subtrair', title: 'Subtrair — remove a nova área da seleção já feita (uma borracha por área: só apaga, nunca cria seleção nova).' },
    { id: 'intersect', label: 'Interseção', title: 'Interseção — só sobrevive o que estava dentro da seleção já feita E dentro da nova área; sem sobreposição com uma seleção anterior, não tem efeito nenhum.' },
    { id: 'invert', label: 'Invertido', title: 'Invertido — a área da nova seleção soma onde ainda não tinha seleção e remove de onde já tinha (e vice-versa).' },
  ],

  /** Ícone (SVG inline) de um modo de combinação — dois "retângulos de seleção" (A à esquerda,
   *  B à direita, se sobrepondo no meio) decompostos em 3 pedaços SEM sobreposição entre si
   *  (só-A, sobreposição, só-B), cada modo preenche um subconjunto diferente desses 3 pedaços. */
  modeIconSvg(mode) {
    const outlineA = '<rect x="1" y="2" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2,1.3" opacity="0.5"/>';
    const outlineB = '<rect x="7" y="2" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2,1.3" opacity="0.5"/>';
    const A_ONLY = '<rect x="1.3" y="2.3" width="5.4" height="9.4" rx="1"/>';
    const OVERLAP = '<rect x="7" y="2.3" width="4" height="9.4"/>';
    const B_ONLY = '<rect x="11.3" y="2.3" width="5.4" height="9.4" rx="1"/>';
    const fillsByMode = {
      replace: OVERLAP + B_ONLY,
      add: A_ONLY + OVERLAP + B_ONLY,
      subtract: A_ONLY,
      intersect: OVERLAP,
      invert: A_ONLY + B_ONLY,
    };
    return `<svg viewBox="0 0 18 14" width="16" height="13">${outlineA}${outlineB}<g fill="currentColor" fill-opacity="0.85">${fillsByMode[mode] || ''}</g></svg>`;
  },

  /** Modo de combinação EFETIVO pra este gesto (clique ou arraste) — normalmente é só o modo
   *  ativo no grupo dos 5 botões, mas quando esse modo é 'replace' (o padrão), segurar
   *  Ctrl/Cmd vira temporariamente 'add' — preserva o atalho de sempre pra "somar sem trocar
   *  de botão". Nos outros 4 modos, Ctrl não muda nada (o botão escolhido já manda sozinho —
   *  pedido explícito do usuário: "Adicionar... elimina a necessidade de segurar o CTRL"). */
  effectiveMode(combineMode, ctrlOrMeta) {
    if ((combineMode || 'replace') === 'replace' && ctrlOrMeta) return 'add';
    return combineMode || 'replace';
  },

  /** Ray casting clássico (par/ímpar) — funciona pra qualquer polígono simples, inclusive
   *  côncavo (o formato de um laço desenhado à mão quase nunca é convexo). */
  pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  /** Testa se (x,y) cai dentro de UMA região de seleção `r` — `r.type` é 'rect'
   *  ({x0,y0,x1,y1}), 'ellipse' ({cx,cy,rx,ry} — equação (x-cx)²/rx² + (y-cy)²/ry² ≤ 1) ou
   *  'lasso' ({pts}, via pointInPolygon). Funciona em qualquer espaço (mundo OU tela) — quem
   *  chama decide, contanto que `x,y` e os campos de `r` estejam no MESMO espaço. */
  pointInRegion(x, y, r) {
    if (r.type === 'rect') {
      return x >= Math.min(r.x0, r.x1) && x <= Math.max(r.x0, r.x1) && y >= Math.min(r.y0, r.y1) && y <= Math.max(r.y0, r.y1);
    }
    if (r.type === 'ellipse') {
      if (!r.rx || !r.ry) return false;
      const dx = (x - r.cx) / r.rx, dy = (y - r.cy) / r.ry;
      return (dx * dx + dy * dy) <= 1;
    }
    if (r.type === 'lasso') return this.pointInPolygon(x, y, r.pts);
    return false;
  },

  /** Aplica UM modo de combinação — `keys` é o conjunto "novo" produzido por uma ação (os
   *  elementos dentro de UMA região, ou um único elemento clicado) contra `currentSet` (o
   *  estado acumulado até agora). MUTA e devolve `currentSet` (mesmo estilo enxuto do
   *  MapView._toolSelection original — evita alocar um Set novo em 'add'/'subtract'/
   *  'intersect'/'invert', só em 'replace'):
   *   - 'replace': vira exatamente `keys` (descarta o que já havia).
   *   - 'add' (União): `keys` entram, o que já havia continua.
   *   - 'subtract': `keys` saem da seleção acumulada (nunca CRIA seleção — "borracha por
   *     área", só apaga — precisa já haver seleção pra ter efeito).
   *   - 'intersect': só sobrevive o que estava em AMBOS — sem nada previamente selecionado em
   *     comum com `keys`, o resultado é vazio (precisa já haver seleção pra ter efeito).
   *   - 'invert' (XOR): o que estava dentro de `keys` E já selecionado sai, o que estava
   *     dentro de `keys` e NÃO selecionado entra — funciona com ou sem seleção prévia. */
  applySetOp(currentSet, mode, keys) {
    switch (mode) {
      case 'add': keys.forEach((k) => currentSet.add(k)); return currentSet;
      case 'subtract': keys.forEach((k) => currentSet.delete(k)); return currentSet;
      case 'intersect': { const next = new Set([...currentSet].filter((k) => keys.has(k))); currentSet.clear(); next.forEach((k) => currentSet.add(k)); return currentSet; }
      case 'invert': keys.forEach((k) => { if (currentSet.has(k)) currentSet.delete(k); else currentSet.add(k); }); return currentSet;
      case 'replace':
      default: currentSet.clear(); keys.forEach((k) => currentSet.add(k)); return currentSet;
    }
  },

  /** Recalcula a seleção do ZERO a partir de TODAS as regiões (`regions`, em ORDEM), cada uma
   *  combinada com o acumulado conforme seu `r.mode` — mesma ideia de applySetOp, só que
   *  dobrando (fold) região por região. `candidates` é a lista PRONTA de elementos
   *  testáveis, já coletada por quem chama (ver MapView._forEachSelectableEl): cada item é
   *  `{kind, id, x, y}` — a "chave" da seleção é sempre `${kind}:${id}`. Devolve um Set NOVO
   *  (não mexe em nenhum Set existente). */
  computeFromRegions(regions, candidates) {
    const result = new Set();
    (regions || []).forEach((r) => {
      const inRegion = new Set();
      (candidates || []).forEach((c) => { if (this.pointInRegion(c.x, c.y, r)) inRegion.add(`${c.kind}:${c.id}`); });
      this.applySetOp(result, r.mode || 'replace', inRegion);
    });
    return result;
  },

  /** O "limite granular" de um ponto novo de seleção (pedido do usuário, 25/08/2026): os
   *  vértices/pontos de uma forma de seleção (retângulo/laço/elipse), ao nascerem, encaixam
   *  no múltiplo mais próximo dessa distância — o passo do "🧲 Snap na grade" (`gridSnapMeters`)
   *  QUANDO ele estiver ligado (`gridSnapOn`), ou 1cm (0.01m) como padrão quando não estiver.
   *  Não é o "pixel da grade" fixo (~0,0265cm, TRUE_SCALE_CSS_PX_PER_METER) que o resto do
   *  mapa usa pra outras coisas (Reta/Curva no zoom máximo etc.) — a seleção usa este,
   *  próprio, bem mais grosso. Idempotente: já vindo de `screenToWorld()` com o snap geral
   *  LIGADO (que já arredonda pro mesmo `gridSnapMeters`), aplicar de novo aqui não muda
   *  nada — só entra em ação de verdade quando o snap geral está DESLIGADO. */
  snapPoint(world, gridSnapOn, gridSnapMeters) {
    const step = (gridSnapOn && gridSnapMeters > 0) ? gridSnapMeters : 0.01;
    return { x: Math.round(world.x / step) * step, y: Math.round(world.y / step) * step };
  },

  // ==================== Desenho do contorno (Map2DRenderer) ====================
  // Tudo abaixo trabalha em coordenadas de TELA (px) — quem chama (Map2DRenderer.render())
  // já converteu as regiões (guardadas em metros do MUNDO) pra tela via regionToScreenShape.

  /** Converte uma região de seleção (retângulo/laço/elipse), guardada em coordenadas do
   *  MUNDO, pra um descritor em coordenadas de TELA (px) — `worldToScreen` é a função
   *  Map2DRenderer.worldToScreen, `zoom` é view.zoom (px de tela por metro do mundo). */
  regionToScreenShape(r, worldToScreen, zoom) {
    if (r.type === 'rect') {
      const a = worldToScreen(r.x0, r.y0), b = worldToScreen(r.x1, r.y1);
      return { type: 'rect', x0: a.x, y0: a.y, x1: b.x, y1: b.y, mode: r.mode };
    }
    if (r.type === 'ellipse') {
      const c = worldToScreen(r.cx, r.cy);
      return { type: 'ellipse', cx: c.x, cy: c.y, rx: Math.max(0, r.rx * zoom), ry: Math.max(0, r.ry * zoom), mode: r.mode };
    }
    if (r.type === 'lasso') {
      return { type: 'lasso', pts: (r.pts || []).map((p) => worldToScreen(p.x, p.y)), mode: r.mode };
    }
    return { type: 'rect', x0: 0, y0: 0, x1: 0, y1: 0, mode: r.mode };
  },

  shapeBounds(s) {
    if (s.type === 'rect') return { x0: Math.min(s.x0, s.x1), y0: Math.min(s.y0, s.y1), x1: Math.max(s.x0, s.x1), y1: Math.max(s.y0, s.y1) };
    if (s.type === 'ellipse') return { x0: s.cx - s.rx, y0: s.cy - s.ry, x1: s.cx + s.rx, y1: s.cy + s.ry };
    if (s.type === 'lasso' && s.pts?.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      s.pts.forEach((p) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
      return { x0, y0, x1, y1 };
    }
    return { x0: 0, y0: 0, x1: 0, y1: 0 };
  },

  /** Campo escalar CONTÍNUO de uma forma num ponto — positivo = dentro (quanto maior, "mais
   *  dentro"), negativo = fora — usado só pra INTERPOLAR o ponto exato de cruzamento da
   *  fronteira ao longo de uma aresta da grade do Marching Squares (ver drawShapeSet), em vez
   *  de cair sempre no meio da aresta (o que gerava uma "escadinha" em formas curvas). */
  shapeField(s, x, y) {
    if (s.type === 'rect') {
      const a = Math.min(s.x0, s.x1), b = Math.max(s.x0, s.x1), c = Math.min(s.y0, s.y1), d = Math.max(s.y0, s.y1);
      return Math.min(x - a, b - x, y - c, d - y);
    }
    if (s.type === 'ellipse') {
      const dx = (x - s.cx) / (s.rx || 0.0001), dy = (y - s.cy) / (s.ry || 0.0001);
      return 1 - (dx * dx + dy * dy);
    }
    if (s.type === 'lasso' && s.pts?.length > 2) {
      const inside = this.pointInPolygon(x, y, s.pts);
      let minD = Infinity;
      const pts = s.pts;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const d = this.pointToSegDist(x, y, pts[j].x, pts[j].y, pts[i].x, pts[i].y);
        if (d < minD) minD = d;
      }
      return inside ? minD : -minD;
    }
    return -1;
  },

  /** Distância de um ponto (x,y) até o SEGMENTO ax,ay→bx,by — usado só por shapeField (laço)
   *  pra achar a distância até a aresta mais próxima do polígono. */
  pointToSegDist(x, y, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 1e-9 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy;
    return Math.hypot(x - px, y - py);
  },

  /** Reduz um polígono a no máximo `maxPts` pontos (amostragem uniforme) — só alimenta o
   *  campo do Marching Squares (shapeField/drawShapeSet), nunca a seleção em si (que sempre
   *  usa o polígono completo, via pointInPolygon/pointInRegion). */
  decimatePts(pts, maxPts) {
    if (pts.length <= maxPts) return pts;
    const out = [];
    const step = pts.length / maxPts;
    for (let i = 0; i < maxPts; i++) out.push(pts[Math.floor(i * step)]);
    return out;
  },

  /** Campo combinado respeitando o MODO de cada forma — dobra (fold) as formas NA ORDEM em
   *  que foram criadas, exatamente como applySetOp faz pra um Set de chaves — aqui só que
   *  sobre um CAMPO contínuo, pra alimentar o Marching Squares (drawShapeSet). O SINAL do
   *  resultado (`>=0` = dentro da seleção final, `<0` = fora) é sempre topologicamente
   *  correto pra QUALQUER combinação de modos; a MAGNITUDE é só uma aproximação razoável
   *  usada pra interpolar o ponto exato de cruzamento numa aresta da grade. */
  combinedFoldField(shapes, x, y) {
    let inside = false;
    let val = -1;
    shapes.forEach((s) => {
      const v = this.shapeField(s, x, y);
      const c = v >= 0;
      const mode = s.mode || 'replace';
      if (mode === 'add') {
        if (c) { inside = true; val = v; } else if (!inside) { val = Math.min(val, v); }
      } else if (mode === 'subtract') {
        if (c) { inside = false; val = -Math.abs(v) - 0.001; }
      } else if (mode === 'intersect') {
        inside = inside && c;
        val = inside ? Math.min(val, v) : -Math.max(Math.abs(val), Math.abs(v)) - 0.001;
      } else if (mode === 'invert') {
        if (c) { inside = !inside; val = inside ? v : -v; } else if (!inside) { val = Math.min(val, v); }
      } else { // 'replace'
        inside = c; val = v;
      }
    });
    return val;
  },

  /** Path2D EXATO (vetorial, sem rasterizar nada) de UMA forma de seleção — usado tanto pro
   *  caso comum (só 1 forma ativa) quanto como sub-caminho do preenchimento unido de várias
   *  formas (ver drawShapeSet) — nesse 2º uso, todas as sub-formas precisam "girar" no MESMO
   *  sentido (aqui: sempre horário, em telas com y pra baixo) pra regra de preenchimento
   *  'nonzero' unir as áreas em vez de criar buracos onde elas se sobrepõem. */
  shapeExactPath(s) {
    const p = new Path2D();
    if (s.type === 'rect') {
      const a = Math.min(s.x0, s.x1), b = Math.max(s.x0, s.x1), c = Math.min(s.y0, s.y1), d = Math.max(s.y0, s.y1);
      p.rect(a, c, Math.max(0, b - a), Math.max(0, d - c)); // Path2D.rect() sempre traça TL→TR→BR→BL — horário com y pra baixo
    } else if (s.type === 'ellipse') {
      p.ellipse(s.cx, s.cy, Math.max(0.01, s.rx), Math.max(0.01, s.ry), 0, 0, Math.PI * 2); // sentido padrão (counterclockwise=false) também é horário aqui
    } else if (s.type === 'lasso' && s.pts?.length > 2) {
      // Shoelace pra saber o sentido em que o usuário desenhou o laço — se não vier horário
      // (área > 0, mesma convenção do rect acima), inverte a ordem dos pontos antes de montar
      // o caminho.
      let area = 0;
      for (let i = 0; i < s.pts.length; i++) {
        const a = s.pts[i], b = s.pts[(i + 1) % s.pts.length];
        area += a.x * b.y - b.x * a.y;
      }
      const pts = area < 0 ? s.pts : s.pts.slice().reverse();
      p.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
      p.closePath();
    }
    return p;
  },

  /** Path2D reduzido pro CONTORNO TRACEJADO (marching ants) — só entra em ação pra elipses
   *  "gigantes" na tela (zoom bem alto). Pedido do usuário, 25/08/2026: "ao aumentar muito o
   *  zoom o FPS [cai] por causa de uma seleção feita. Ela nem está desenhada na tela em algum
   *  momento, mas deve estar sendo renderizada... a forma da máscara de seleção está sendo
   *  renderizada nesse tamanho maior desnecessariamente."
   *
   *  Medido (benchmark isolado, Chromium headless): um CONTORNO TRACEJADO (ctx.setLineDash +
   *  ctx.stroke) sobre uma elipse com raio de TELA de 500.000px custa ~220ms por quadro — o
   *  motor do navegador precisa "achatar" (tessellate) o arco INTEIRO (0→2π) em segmentinhos de
   *  reta pra poder desenhar os traços, mesmo com quase tudo (ou tudo!) fora da tela; um recorte
   *  de ctx.clip() NÃO ajuda (mesmo custo, testado) porque esse achatamento acontece ANTES do
   *  recorte. Um ARCO PARCIAL (ellipse(...,startAngle,endAngle) cobrindo só a vizinhança da
   *  tela) custa uma FRAÇÃO disso — a mesma elipse de 500.000px cai pra ~0,2ms limitando o arco
   *  a pouco mais de 1 radiano. Importante: o PREENCHIMENTO (fill) NÃO sofre desse problema (fica
   *  barato em QUALQUER tamanho, testado até 50.000.000px) — só o contorno tracejado precisa
   *  desse tratamento; por isso só ele passa por aqui (ver uso em drawShapeSet). Retângulo e
   *  laço são feitos só de retas (sem curva pra achatar) — testado, não sofrem desse custo em
   *  nenhum tamanho — por isso sempre devolvem `undefined` (comportamento de sempre, sem
   *  nenhuma mudança).
   *
   *  Devolve:
   *   - `undefined`: elipse pequena o bastante (ou grande mas cabendo toda na tela com folga) —
   *     quem chama usa o Path2D normal (shapeExactPath), sem NENHUMA mudança de comportamento.
   *   - `null`: nenhum trecho da BORDA está perto da tela — ou a elipse inteira está longe (fora
   *     da tela) ou a tela inteira está bem no MEIO dela (zoom bem alto, olhando só o interior) —
   *     nos dois casos não há contorno visível nenhum pra desenhar (o preenchimento, se for o
   *     caso, continua sendo desenhado normalmente por quem chama).
   *   - um Path2D: só o(s) arco(s) da borda perto da tela (com folga de segurança), pronto pra
   *     ser usado no lugar do Path2D exato no ctx.stroke() tracejado. */
  strokePathForDashes(s, w, h) {
    if (s.type !== 'ellipse') return undefined;
    const rx = Math.max(0.01, s.rx), ry = Math.max(0.01, s.ry);
    const SAFE_RADIUS_PX = 4000; // abaixo disso, o contorno tracejado sempre sai barato (testado)
    if (Math.max(rx, ry) <= SAFE_RADIUS_PX) return undefined;
    const cx = s.cx, cy = s.cy;
    const PAD = 300; // folga generosa (px de tela) — cobre a espessura do traço + a resolução da amostragem abaixo
    const vx0 = -PAD, vy0 = -PAD, vx1 = w + PAD, vy1 = h + PAD;
    if (cx + rx < vx0 || cx - rx > vx1 || cy + ry < vy0 || cy - ry > vy1) return null; // longe demais da tela por completo
    // Amostra a borda em N ângulos — N cresce com o "tamanho" da elipse (alvo: uma corda de
    // ~60px na tela entre amostras vizinhas) pra nenhum trecho visível caber inteiro ENTRE duas
    // amostras; a amostragem em si é só aritmética (barata mesmo em N grande — nada de canvas).
    const circumf = 2 * Math.PI * Math.max(rx, ry);
    const N = Math.min(20000, Math.max(64, Math.ceil(circumf / 60)));
    const inside = new Uint8Array(N);
    let anyInside = false, allInside = true;
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      const x = cx + rx * Math.cos(th), y = cy + ry * Math.sin(th);
      const ok = x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1;
      inside[i] = ok ? 1 : 0;
      if (ok) anyInside = true; else allInside = false;
    }
    if (allInside) return undefined; // a elipse toda cabe na tela (com folga) — path normal, sem custo extra mesmo
    if (!anyInside) return null; // nada da borda por perto — ou tá longe, ou a tela está toda dentro dela (zoom alto no meio)
    // Agrupa os índices "dentro" em trechos contíguos (CIRCULAR — o fim conecta com o início),
    // cada um virando um arco próprio (com uma margem de folga pra não cortar o traço rente à
    // borda da tela).
    const MARGIN = 4;
    let i0 = 0;
    while (i0 < N && inside[i0]) i0++; // acha um ponto "fora" pra começar (evita partir um trecho ao meio no índice 0)
    const runs = [];
    let cur = null;
    for (let k = 0; k < N; k++) {
      const idx = (i0 + k) % N;
      if (inside[idx]) {
        if (!cur) cur = { from: idx, to: idx }; else cur.to = idx;
      } else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    const path = new Path2D();
    runs.forEach((r) => {
      const fromI = (r.from - MARGIN + N) % N;
      const toI = (r.to + MARGIN) % N;
      const startAngle = (fromI / N) * Math.PI * 2;
      let endAngle = (toI / N) * Math.PI * 2;
      if (endAngle <= startAngle) endAngle += Math.PI * 2;
      const sx = cx + rx * Math.cos(startAngle), sy = cy + ry * Math.sin(startAngle);
      path.moveTo(sx, sy);
      path.ellipse(cx, cy, rx, ry, 0, startAngle, endAngle);
    });
    return path;
  },

  /** Desenha um CONJUNTO de formas de seleção (retângulo/laço/elipse) como um desenho só —
   *  onde as áreas se sobrepõem não dá pra distinguir uma forma da outra. Dois caminhos bem
   *  diferentes conforme a quantidade:
   *
   *  - 1 forma só (o caso mais comum, de longe): desenha o Path2D EXATO da forma
   *    (shapeExactPath) — vetorial de verdade, então preenchimento E contorno ficam perfeitos
   *    em QUALQUER zoom, sem nenhuma "escadinha" nem risco de sumir.
   *
   *  - 2+ formas (só acontece com formas já finalizadas sobrepostas): o PREENCHIMENTO ainda é
   *    vetorial exato (soma dos Path2D exatos de cada forma, via canvas OFFSCREEN com
   *    globalCompositeOperation por forma, na MESMA ordem/modo que applySetOp aplicaria a um
   *    Set — Substituir/Adicionar/Subtrair/Interseção/Invertido de verdade, não só união). Só
   *    o CONTORNO (que precisa virar uma linha ÚNICA e contínua ao redor da união, sem
   *    costuras internas) usa Marching Squares sobre o campo contínuo de combinedFoldField.
   *
   *  `cache` é um objeto que o CHAMADOR possui e reaproveita entre quadros (evita recriar o
   *  canvas offscreen a cada frame) — só precisa ter `selMaskCanvas`/`selMaskCtx` (criados
   *  aqui na 1ª chamada se ainda não existirem). `antsOffset` é a fase atual do tracejado
   *  "andando" (ver Map2DRenderer, incrementada a cada quadro). */
  drawShapeSet(ctx, shapes, w, h, cache, antsOffset) {
    if (!shapes || !shapes.length) return;
    ctx.save();
    ctx.fillStyle = '#092329';
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -(antsOffset || 0);
    ctx.strokeStyle = '#01cfe7';
    ctx.lineWidth = shapes.length > 1 ? 1.5 : 2;

    if (shapes.length === 1) {
      // Sozinha, uma forma 'subtract'/'intersect' combinada com NADA (não há seleção prévia
      // nenhuma pra subtrair/intersectar) resulta em seleção VAZIA de verdade — desenhá-la
      // preenchida enganaria (pareceria selecionada sem estar). 'replace'/'add'/'invert'
      // sozinhas sempre resultam na própria forma.
      const mode0 = shapes[0].mode || 'replace';
      if (mode0 === 'subtract' || mode0 === 'intersect') { ctx.restore(); return; }
      const path = this.shapeExactPath(shapes[0]);
      ctx.globalAlpha = this.FILL_ALPHA;
      ctx.fill(path, 'nonzero');
      ctx.globalAlpha = 1;
      // 25/08/2026 — pedido do usuário: FPS caindo com zoom bem alto numa elipse selecionada.
      // Ver strokePathForDashes acima: pra elipses "gigantes" na tela, troca o Path2D exato
      // (caro pro contorno TRACEJADO nesse caso) por só o(s) arco(s) perto da tela.
      const dashPath = this.strokePathForDashes(shapes[0], w, h);
      if (dashPath !== null) ctx.stroke(dashPath || path);
      ctx.restore();
      return;
    }

    if (!cache.selMaskCanvas) { cache.selMaskCanvas = document.createElement('canvas'); cache.selMaskCtx = cache.selMaskCanvas.getContext('2d'); }
    if (cache.selMaskCanvas.width !== w || cache.selMaskCanvas.height !== h) { cache.selMaskCanvas.width = w; cache.selMaskCanvas.height = h; }
    const mctx = cache.selMaskCtx;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = '#092329';
    const COMPOSITE_BY_MODE = { replace: 'source-over', add: 'source-over', subtract: 'destination-out', intersect: 'destination-in', invert: 'xor' };
    shapes.forEach((s) => {
      const mode = s.mode || 'replace';
      if (mode === 'replace') mctx.clearRect(0, 0, w, h); // substitui TUDO que veio antes, não só soma
      mctx.globalCompositeOperation = COMPOSITE_BY_MODE[mode] || 'source-over';
      mctx.fill(this.shapeExactPath(s), 'nonzero');
    });
    mctx.globalCompositeOperation = 'source-over';
    // A composição em si (mctx acima) precisa ficar 100% OPACA — Substituir/Adicionar/
    // Subtrair/Interseção/Invertido são operações de canal alfa (destination-out/
    // destination-in/xor) que só combinam certo com alfa cheio. A transparência visual entra
    // só agora, ao "carimbar" a máscara já pronta de volta no canvas principal.
    ctx.globalAlpha = this.FILL_ALPHA;
    ctx.drawImage(cache.selMaskCanvas, 0, 0);
    ctx.globalAlpha = 1;

    // Contorno: Marching Squares interpolado sobre os limites REAIS das formas (sem clampar
    // no tamanho da tela — cortar ali fazia o preenchimento "sumir" no zoom quando a seleção
    // passava da borda da tela).
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    shapes.forEach((s) => {
      const b = this.shapeBounds(s);
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    });
    const PAD = 6;
    x0 = Math.floor(x0 - PAD); y0 = Math.floor(y0 - PAD);
    x1 = Math.ceil(x1 + PAD); y1 = Math.ceil(y1 + PAD);
    if (x1 <= x0 || y1 <= y0) { ctx.restore(); return; }
    const MAX_CELLS = 220; // teto de células por eixo — mantém o custo por quadro sob controle
    const step = Math.max(3, Math.ceil(Math.max(x1 - x0, y1 - y0) / MAX_CELLS));
    const nx = Math.max(1, Math.ceil((x1 - x0) / step));
    const ny = Math.max(1, Math.ceil((y1 - y0) / step));
    const fieldShapes = shapes.map((s) => (s.type === 'lasso' && s.pts?.length > 60) ? { ...s, pts: this.decimatePts(s.pts, 60) } : s);
    const field = new Float32Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      const py = y0 + j * step;
      for (let i = 0; i <= nx; i++) {
        const px = x0 + i * step;
        field[j * (nx + 1) + i] = this.combinedFoldField(fieldShapes, px, py);
      }
    }
    const at = (i, j) => field[j * (nx + 1) + i];
    const lerpEdge = (pA, vA, pB, vB) => {
      const denom = vA - vB;
      const t = Math.abs(denom) > 1e-6 ? Math.min(1, Math.max(0, vA / denom)) : 0.5;
      return { x: pA.x + (pB.x - pA.x) * t, y: pA.y + (pB.y - pA.y) * t };
    };
    const segs = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const vTL = at(i, j), vTR = at(i + 1, j), vBR = at(i + 1, j + 1), vBL = at(i, j + 1);
        const tl = vTL >= 0 ? 1 : 0, tr = vTR >= 0 ? 1 : 0, br = vBR >= 0 ? 1 : 0, bl = vBL >= 0 ? 1 : 0;
        const c = tl * 8 + tr * 4 + br * 2 + bl;
        if (c === 0 || c === 15) continue;
        const px0 = x0 + i * step, px1 = x0 + (i + 1) * step, py0 = y0 + j * step, py1 = y0 + (j + 1) * step;
        const ptTL = { x: px0, y: py0 }, ptTR = { x: px1, y: py0 }, ptBR = { x: px1, y: py1 }, ptBL = { x: px0, y: py1 };
        const top = lerpEdge(ptTL, vTL, ptTR, vTR), bottom = lerpEdge(ptBL, vBL, ptBR, vBR);
        const left = lerpEdge(ptTL, vTL, ptBL, vBL), right = lerpEdge(ptTR, vTR, ptBR, vBR);
        const push = (a, b) => segs.push([a, b]);
        // Tabela padrão de Marching Squares (casos 5/10 são "ambíguos" — resolvidos aqui como
        // 2 diagonais separadas, um artefato raríssimo e irrelevante pras formas de seleção).
        switch (c) {
          case 1: push(left, bottom); break;
          case 2: push(bottom, right); break;
          case 3: push(left, right); break;
          case 4: push(top, right); break;
          case 5: push(left, top); push(bottom, right); break;
          case 6: push(top, bottom); break;
          case 7: push(left, top); break;
          case 8: push(top, left); break;
          case 9: push(top, bottom); break;
          case 10: push(top, right); push(left, bottom); break;
          case 11: push(top, right); break;
          case 12: push(right, left); break;
          case 13: push(bottom, right); break;
          case 14: push(left, bottom); break;
          default: break;
        }
      }
    }
    if (!segs.length) { ctx.restore(); return; }
    const key = (p) => `${Math.round(p.x * 4)},${Math.round(p.y * 4)}`;
    const adj = new Map();
    segs.forEach(([a, b]) => {
      const ka = key(a), kb = key(b);
      if (!adj.has(ka)) adj.set(ka, { pt: a, links: [] });
      if (!adj.has(kb)) adj.set(kb, { pt: b, links: [] });
      adj.get(ka).links.push(kb);
      adj.get(kb).links.push(ka);
    });
    const segKey = (ka, kb) => (ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`);
    const usedSeg = new Set();
    const paths = [];
    segs.forEach(([a, b]) => {
      const ka0 = key(a), kb0 = key(b);
      if (usedSeg.has(segKey(ka0, kb0))) return;
      usedSeg.add(segKey(ka0, kb0));
      const path = [a, b];
      let curK = kb0, guard = 0;
      while (guard++ < 20000) {
        const node = adj.get(curK);
        const nextK = node?.links.find((nk) => !usedSeg.has(segKey(curK, nk)));
        if (nextK === undefined) break;
        usedSeg.add(segKey(curK, nextK));
        path.push(adj.get(nextK).pt);
        curK = nextK;
        if (curK === ka0) break; // laço fechado — volta ao ponto de partida
      }
      paths.push(path);
    });
    const strokePath = new Path2D();
    paths.forEach((p) => {
      strokePath.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) strokePath.lineTo(p[i].x, p[i].y);
    });
    ctx.stroke(strokePath);
    ctx.restore();
  },
};
