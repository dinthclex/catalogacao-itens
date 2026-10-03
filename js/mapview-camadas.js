/**
 * js/mapview-camadas.js — janela "🗂️ Camadas" do Mapa 2D (extraída de mapview.js).
 *
 * [01/10/2026] NOVO — pedido verbatim: "Lembrando que todo o app deve funcionar em 'file:///'. Os códigos da janela 'Camadas' devem ser modulares e independentes o máximo possível do restante dos códigos do app. De modo que se facilite as manutenções e edições nos códigos relacionados a janela 'Camadas'."
 *
 * Como funciona: script comum (SEM import/export/fetch — funciona em file:///), carregado
 * logo DEPOIS de js/mapview.js (ver index.html) e registrado no sw.js. Adiciona os métodos da
 * janela em `MapView` via Object.assign (mesmo padrão de js/mapview-rede-2d.js). Tudo da janela
 * mora AQUI: abrir/fechar/alternar a janela, desenhar a lista, arrastar-pra-reordenar (FLIP),
 * os 7 botões de ação, o modal "Propriedades da camada" (+ seu HTML), o isolamento de erros
 * (_camadasGuard*) e o histórico Ctrl+Z/Ctrl+Y (_camadas*Snapshot/_camadasHistPush).
 *
 * Dependências do resto do app (únicas): Utils, DB, Mapping, History, MapConfig (só em
 * _ensureLayer3D) e, de MapView, `_map`, `_renderer`, `_activeLayerId`, `_saveMap`,
 * `_makePanelDraggable/_makePanelResizable`, `_navMode`, `_refreshItensNoMapa`,
 * `_reloadMapIfShowing`, `_layersPanelEl` (campo declarado em mapview.js, lido por outros
 * pontos do mapa). Chamado de fora: `_toggleLayersPanel/_openLayersPanel/_closeLayersPanel/
 * _renderLayersPanel/_ensureLayer3D/_openLayerPropertiesPanel`. Se este arquivo falhar ao
 * carregar, só a janela Camadas deixa de responder (o botão 🗂️ não abre); o resto do app continua.
 */
(function () {
  'use strict';
  if (!window.MapView) { console.error('[mapview-camadas] MapView não encontrado — js/mapview.js precisa carregar antes deste arquivo.'); return; }
  Object.assign(window.MapView, {
    // Modal (não o painel flutuante genérico) de "Propriedades da camada" — ver _openLayerPropertiesPanel.
    _layerPropsModalEl: null,
    // Duração (ms) da animação FLIP do arrastar/soltar da lista — mesmo valor pra tocar (_ensureLayersFlipLoop) e travar novas trocas (_onLayerRowDragMove, drag.lockedUntil).
    _LAYER_FLIP_DURATION_MS: 180,

  _toggleLayersPanel() {
    // NOVO (03/09/2026) — ver comentário grande em _toggleNavMode: as 4
    // janelas (Histórico/Cores/Camadas/Ferramentas) ficam bloqueadas
    // enquanto "🧭 Modo Navegação" está ligado, mesmo aviso já usado por
    // _setPTool pras ferramentas de edição.
    if (this._navMode) { Utils.toast('Desative o "🧭 Modo Navegação" para usar as janelas de edição.', { type: 'warn' }); return; }
    if (this._layersPanelEl) this._closeLayersPanel();
    else this._openLayersPanel();
  },

  // ---------- Isolamento da janela "🗂️ Camadas" (pedido do usuário,
  // 22/08/2026): "As funções que tem haver com a 'janela das camadas' e
  // suas interações devem ser independentes do restante do código (para
  // que caso 'quebrem', não prejudiquem a aplicação inteira)". As funções
  // "de entrada" desse subsistema (abrir/fechar o painel, abrir/fechar as
  // Propriedades da camada, (re)desenhar a lista, garantir a camada 3D)
  // viram wrappers finos que chamam a implementação de verdade (sufixo
  // `Impl`) dentro de um try/catch — qualquer erro ali fica CONTIDO aqui:
  // loga no console, avisa com um toast, mas nunca sobe pra quebrar quem
  // chamou (o mount da tela Mapa, um atalho de teclado, o loop de desenho
  // etc.). Como TODA chamada interna entre essas funções já usa o nome
  // público (ex.: `this._renderLayersPanel()`, não `...Impl()` direto),
  // proteger só os wrappers já cobre em cascata toda a árvore de chamadas
  // — os botões/campos individuais (tbtn add/del/dup/..., clique/duplo-
  // clique na linha, campos de Propriedades) ganham a mesma proteção
  // via `_camadasGuard`/`_camadasGuardAsync` abaixo, usados ao ligar cada
  // `onclick`/`onchange`/`oninput` deles. ----------
  _camadasErroContido(err, label) {
    console.error(`[Janela de Camadas] Falha em "${label}" — contida, o resto do app continua funcionando:`, err);
    Utils.toast?.(`⚠️ A janela de Camadas encontrou um problema (${label}) — o resto do app não foi afetado.`, { type: 'danger', duration: 5500 });
  },
  /** Embrulha um handler SÍNCRONO (ex.: um `onclick`) — usado pros botões e
   *  campos individuais da janela de Camadas/Propriedades da camada. */
  _camadasGuard(fn, label) {
    return (...args) => {
      try { return fn(...args); } catch (err) { this._camadasErroContido(err, label); return undefined; }
    };
  },
  /** Mesma ideia, pra um handler ASSÍNCRONO — também contém uma REJEIÇÃO
   *  (não só um `throw` síncrono), que do contrário viraria um "unhandled
   *  promise rejection" solto. */
  _camadasGuardAsync(fn, label) {
    return async (...args) => {
      try { return await fn(...args); } catch (err) { this._camadasErroContido(err, label); return undefined; }
    };
  },

  /** Garante que a camada "Adicionados no 3D" já apareça na janela de
   *  Camadas sempre que essa for a configuração ativa (Configurações 3D >
   *  camada dos itens novos), em vez de só nascer na hora em que algo é de
   *  fato construído dentro do 3D (ver view3d.js `_layerIdParaNovosItens`,
   *  que cria/reaproveita a mesma camada pelo nome) — pedido do usuário: "a
   *  opção de camada separada 'Adicionados no 3D' ... deve existir na
   *  janela de camadas. Caso ainda não exista, deve ser criada." */
  async _ensureLayer3DImpl() {
    if (!this._map || typeof MapConfig === 'undefined') return;
    const cfg = await MapConfig.get();
    if ((cfg.camada3DNovosItens || 'separada') !== 'separada') return;
    const existente = (this._map.layers || []).find((l) => l.nome === 'Adicionados no 3D');
    if (!existente) {
      Mapping.addLayer(this._map, 'Adicionados no 3D');
      await this._saveMap('_ensureLayer3DImpl');
    }
  },
  async _ensureLayer3D(...args) { return this._camadasGuardAsync(() => this._ensureLayer3DImpl(...args), 'garantir camada 3D')(); },

  async _openLayersPanelImpl() {
    this._closeLayersPanel();
    if (!this._container || !this._map) return;
    // 22/08/2026 — BUG corrigido (pedido do usuário: "acabou ficando com
    // duas 'janelas de camadas'"): virar `async` (pro `await
    // _ensureLayer3D()` acima) abriu uma janela de corrida — se esta função
    // fosse chamada de novo ANTES do await resolver (ex.: duas coisas
    // pedindo pra abrir o painel de Camadas quase juntas), a 2ª chamada
    // também rodava `_closeLayersPanel()` (sem achar nada pra fechar ainda,
    // já que a 1ª ainda não tinha criado o painel dela) e as DUAS acabavam
    // criando um painel cada, depois do respectivo await. Um "token de
    // geração" simples resolve: só a chamada mais RECENTE (a que por
    // último incrementou `_layersPanelGen`) segue em frente e cria o
    // painel; qualquer chamada mais antiga, ao acordar do await, percebe
    // que não é mais a mais recente e desiste sem criar nada.
    const myGen = (this._layersPanelGen = (this._layersPanelGen || 0) + 1);
    await this._ensureLayer3D();
    if (myGen !== this._layersPanelGen || !this._container) return;
    this._closeLayersPanel(); // por segurança — se outra chamada mais antiga chegou a criar algo entre o await e aqui
    const panel = document.createElement('div');
    panel.className = 'map-obj-picker-panel map-layers-panel'; // reaproveita o estilo base do painel persistente (posição/fundo/borda)
    this._container.querySelector('.map2d-wrap')?.appendChild(panel);
    this._layersPanelEl = panel;
    // Posição padrão (pedido do usuário): canto INFERIOR DIREITO — só quando
    // ainda não há uma posição lembrada de um arraste anterior nesta sessão
    // (ver _panelPositions/_applyRememberedPanelPos, chamado logo abaixo,
    // que sobrescreve isto se houver). Estilo inline (não em css/style.css,
    // ausente neste recorte do workspace — ver CONTEXTO-PROJETO.md) porque
    // a classe-base (.map-obj-picker-panel) por padrão ancorava perto do
    // topo, como os outros painéis desse tipo (Ferramentas etc.).
    if (!this._panelPositions?.layers) {
      panel.style.top = 'auto';
      panel.style.left = 'auto';
      panel.style.right = '12px';
      panel.style.bottom = '12px';
    }
    // [10/09/2026] NOVO — pedido verbatim: "por padrão, no app (de
    // fábrica), ela vem com a mínima largura dela [...] as suas dimensões
    // preservadas ao recarregar a página." Lê o tamanho salvo (ver
    // `onResizeEnd` em `_makePanelResizable`, logo abaixo); sem nada salvo
    // ainda (instalação nova, ou quem nunca redimensionou esta janela),
    // aplica a largura MÍNIMA permitida (220px, mesmo valor passado a
    // `_makePanelResizable` como `minWidth` — precisa bater com aquele
    // número pra ser de fato "a mínima largura dela") como padrão de
    // fábrica, em vez dos 300px fixos que `.map-layers-panel` definia até
    // então — a altura de fábrica continua a mesma de sempre (340px, só o
    // CSS mesmo, nenhum `style.height` aqui), já que o pedido foi só sobre
    // a LARGURA mínima.
    const savedSize = await DB.getSetting('mapa2dCamadasPanelSize', null);
    // Mesma proteção de corrida do `await this._ensureLayer3D()` acima —
    // este novo `await` abre a MESMA janela de risco (outra chamada mais
    // recente pode ter mandado fechar/reabrir tudo enquanto este esperava).
    if (myGen !== this._layersPanelGen) { panel.remove(); return; }
    if (savedSize && savedSize.w && savedSize.h) {
      panel.style.width = savedSize.w + 'px';
      panel.style.height = savedSize.h + 'px';
    } else {
      panel.style.width = '220px';
    }
    this._renderLayersPanel();
    this._applyRememberedPanelPos(panel, 'layers');
    // Abrir (e qualquer interação depois) conta como "selecionar" este
    // painel — deve ficar na frente de Ferramentas/Histórico (pedido do
    // usuário, ver Utils.bringToFront).
    Utils.bringToFront(panel);
    panel.addEventListener('pointerdown', () => Utils.bringToFront(panel), true);
    panel.addEventListener('pointerup', () => Utils.bringToFront(panel), true); // [15/09/2026 UTC] "No clique e após soltar o botão esquerdo do mouse"
  },
  async _openLayersPanel(...args) { return this._camadasGuardAsync(() => this._openLayersPanelImpl(...args), 'abrir janela de camadas')(); },

  _closeLayersPanelImpl() {
    Utils.releaseFront(this._layersPanelEl); // [15/09/2026 UTC] "ao fechar, volta pro z-index normal"
    this._layersPanelEl?.remove();
    this._layersPanelEl = null;
  },
  _closeLayersPanel(...args) { return this._camadasGuard(() => this._closeLayersPanelImpl(...args), 'fechar janela de camadas')(); },

  /** Redesenha o CONTEÚDO do painel de camadas (mantém o painel aberto) —
   *  chamado depois de qualquer mudança (criar/duplicar/mesclar/reordenar/
   *  excluir/alternar visibilidade/trocar a selecionada), em vez de reabrir
   *  do zero. Reaplica _makePanelDraggable/_makePanelResizable a cada chamada
   *  porque o innerHTML é todo reconstruído — os elementos antigos (cabeçalho
   *  arrastável, alça de redimensionar) somem junto, então os listeners
   *  precisam ser recolocados nos novos.
   *
   *  Layout (pedido do usuário, estilo Paint.NET): cada linha só tem o NOME
   *  da camada + o olho de visibilidade à direita — nada mais. Os 7 botões de
   *  ação (Adicionar/Remover/Duplicar/Mesclar/Mover cima/Mover baixo/
   *  Propriedades) ficam juntos numa barra FIXA embaixo do painel, como
   *  quadrados alinhados à esquerda, e agem sobre a camada SELECIONADA (a
   *  linha com `.active` — é a mesma noção de "camada ativa" que recebe
   *  elementos novos ao desenhar, ver _activeLayerId). Bloqueio (🔒) não tem
   *  mais botão na linha — mora dentro de "⚙️ Propriedades" agora. */
  /** Clicar/arrastar/soltar pra reordenar a lista de camadas (pedido do
   *  usuário — "As lógicas de flip aplique elas nas camadas também"), além
   *  dos botões ↑/↓ que já existiam (continuam funcionando do mesmo jeito,
   *  um passo por vez). Um clique PARADO (sem deslocamento vertical de
   *  verdade) continua só selecionando a camada — igual sempre foi; só um
   *  arraste de fato (> 6px) entra em modo "reordenar". Usa listeners no
   *  `document` (não na própria linha) pro arraste continuar acompanhando o
   *  dedo/mouse mesmo depois que `_renderLayersPanel` reconstrói a lista do
   *  zero no meio do gesto (cada linha nova é um elemento DOM diferente). */
  _wireLayerRowDrag(row, id) {
    row.addEventListener('pointerdown', this._camadasGuard((e) => {
      if (e.target.closest('button')) return; // não atrapalha o olho de visibilidade
      // Evita que o gesto de clicar-e-arrastar comece selecionando o TEXTO
      // do nome da camada (comportamento padrão do navegador pra um
      // mousedown+mousemove em cima de texto) — pedido do usuário. `_layersPanelEl.style.userSelect`
      // (ver _onLayerRowDragMove) cobre o resto do arraste; isto aqui cobre
      // o instante inicial, antes mesmo de saber se vai virar um arraste de
      // verdade (limiar de 6px).
      e.preventDefault();
      this._layerRowDrag = { id, startY: e.clientY, dragging: false };
      const onMove = (ev) => this._onLayerRowDragMove(ev);
      const onUp = this._camadasGuard(() => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        this._onLayerRowDragEnd();
      }, 'terminar arraste de camada');
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    }, 'iniciar arraste de camada'));
    row.addEventListener('click', this._camadasGuard(() => {
      // Um clique que terminou em arraste de verdade não deve TAMBÉM contar
      // como "selecionar" (senão a seleção trocaria pra qualquer camada só
      // de passar o dedo por cima ao arrastar) — ver _layerRowDragMoved,
      // ligado em _onLayerRowDragMove e desligado aqui.
      if (this._layerRowDragMoved) { this._layerRowDragMoved = false; return; }
      this._activeLayerId = id;
      this._saveMap();
      this._renderLayersPanel();
    }, 'selecionar camada'));
    // 22/08/2026, pedido do usuário: "dois cliques em cima de uma camada
    // deve ser o mesmo que ir em configurações da camada selecionada" —
    // seleciona (mesmo efeito do clique simples acima) e já abre o painel
    // "⚙️ Propriedades da camada" (o mesmo do botão ⚙️ na barra de baixo),
    // num só gesto.
    row.addEventListener('dblclick', this._camadasGuard((e) => {
      if (e.target.closest('button')) return; // não conflita com o botão de visibilidade
      this._activeLayerId = id;
      this._saveMap();
      this._renderLayersPanel();
      this._openLayerPropertiesPanel(id);
    }, 'abrir propriedades por duplo clique'));
  },

  _onLayerRowDragMove(e) {
    const drag = this._layerRowDrag;
    const panel = this._layersPanelEl;
    if (!drag || !panel || !this._map) return;
    if (!drag.dragging) {
      if (Math.abs(e.clientY - drag.startY) < 6) return;
      drag.dragging = true;
      this._layerRowDragMoved = true;
      // Impede seleção de texto durante o arraste (pedido do usuário) — sem
      // isso, o gesto de clicar-e-arrastar em cima do nome da camada
      // seleciona o TEXTO da linha (comportamento padrão do navegador),
      // o que não faz sentido no meio de um arraste de reordenar.
      panel.style.userSelect = 'none';
      // Pedido do usuário, 25/08/2026: "ao clicar e arrastar uma camada, a
      // camada deve mover junto com o cursor do mouse até o 'soltar'. Não
      // deve 'magnetizar' na próxima posição de camada." — `drag.startRowTop`
      // guarda a posição de TELA da linha (sem nenhum transform ainda) bem
      // no instante em que o arraste passa a valer de verdade (limiar de
      // 6px acima) — é o "zero" a partir do qual a distância total
      // percorrida pelo cursor (ver _followDraggedLayerRow, chamada no fim
      // desta função) é medida, pro resto do gesto inteiro.
      const row = panel.querySelector(`.map-layer-row[data-id="${drag.id}"]`);
      drag.startRowTop = row ? row.getBoundingClientRect().top : e.clientY;
      // Pedido do usuário: "a movimentação vertical da camada que está
      // sendo arrastada deve ficar limitada ao retângulo formado pelas
      // camadas presentes. Por exemplo, se há 3 camadas, o retângulo
      // limitador terá altura de 3 camadas." Medido uma única vez aqui, no
      // início do arraste: a ALTURA total (nº de camadas × altura de cada
      // linha) não muda durante o gesto — só a ORDEM interna muda — então
      // esse retângulo continua válido do início ao fim, sem precisar
      // remedir a cada troca de posição.
      const rowsTodas = [...panel.querySelectorAll('.map-layer-row')];
      if (rowsTodas.length) {
        const rects = rowsTodas.map((r) => r.getBoundingClientRect());
        drag.listTop = Math.min(...rects.map((r) => r.top));
        drag.listBottom = Math.max(...rects.map((r) => r.bottom));
        // Pedido do usuário, 25/08/2026: "se movo muito rápido a camada
        // arrastada, a mais da ponta acaba não flipando... o que importa é a
        // variação em y" — altura média de UMA linha, medida uma única vez
        // aqui (todas as linhas têm a mesma altura), usada abaixo pra
        // calcular a posição-ALVO a partir do DESLOCAMENTO vertical
        // acumulado do cursor, em vez de testar se o cursor está (na hora
        // exata deste evento) dentro do retângulo de tela de alguma outra
        // linha — ver o motivo desse troca logo abaixo.
        drag.rowH = rects.length ? (drag.listBottom - drag.listTop) / rects.length : 0;
      }
    }
    const now = performance.now();
    const rows = [...panel.querySelectorAll('.map-layer-row')];
    rows.forEach((r) => { r.style.opacity = r.dataset.id === drag.id ? '0.55' : ''; });
    // "Uma vez ativado o flip (de cima pra baixo ou de baixo pra cima), ele
    // não pode ser interrompido até terminar, então é liberado para um novo
    // flip" (pedido do usuário) — enquanto a animação do ÚLTIMO flip ainda
    // está rodando (`drag.lockedUntil`, ver _LAYER_FLIP_DURATION_MS/
    // _flipLayerRows), nenhuma TROCA DE POSIÇÃO nova pode disparar. Isto
    // agora só governa as OUTRAS linhas "flipando" pra abrir espaço — a
    // própria linha arrastada nunca fica presa por este bloqueio: ela
    // acompanha o cursor sempre (chamada incondicional no fim desta função),
    // troca de posição ou não (pedido do usuário: "a flipagem fica por
    // conta apenas das camadas que devem deixar o seu lugar atual para
    // liberar a posição para a camada que está sendo arrastada").
    if (!(drag.lockedUntil && now < drag.lockedUntil)) {
      // Pedido do usuário, 25/08/2026: "se movo muito rápido a camada
      // arrastada, a mais da ponta acaba não flipando. Não pode ser por
      // tempo ou por estar apenas dentro da área da janela das camadas...
      // o que importa é a variação em y." — o critério ANTIGO era testar se
      // `e.clientY` (a posição do cursor NESTE evento específico) caía
      // dentro do retângulo de tela de alguma OUTRA linha: num arraste
      // rápido, o navegador manda bem menos eventos de pointermove do que
      // pixels percorridos, então o cursor podia "pular" de uma linha
      // direto pra outra bem mais longe sem NUNCA estar, num evento sequer,
      // sobre as linhas do meio — e como só uma troca de posição acontece
      // por chamada, a farthest (mais na ponta) nunca era alcançada. Além
      // disso, esse teste não pegava o cursor saindo da JANELA (nenhuma
      // linha tem retângulo até lá), mesmo sendo um arraste válido.
      //
      // Novo critério: a posição-ALVO (índice na lista) é calculada a
      // partir do DESLOCAMENTO vertical acumulado do cursor desde o início
      // do arraste (`e.clientY - drag.startY`) — a MESMA distância usada
      // por _followDraggedLayerRow pra mover a linha arrastada — aplicada
      // à posição NATURAL da linha (`drag.startRowTop`) e então limitada ao
      // retângulo da lista (`drag.listTop`/`drag.listBottom`), exatamente
      // como a própria linha arrastada já fica limitada visualmente. O
      // índice é só "em qual dos N espaços de altura `drag.rowH` (a partir
      // do topo da lista) o CENTRO dessa posição cai" — uma conta direta,
      // sem nenhum teste de "está dentro do retângulo de tela de outra
      // linha AGORA", então nunca pula nem depende de o cursor estar
      // fisicamente sobre a janela.
      const fromIdx = this._map.layers.findIndex((l) => l.id === drag.id);
      let toIdx = fromIdx;
      if (fromIdx !== -1 && drag.listTop != null && drag.listBottom != null && drag.rowH > 0) {
        let desiredTop = drag.startRowTop + (e.clientY - drag.startY);
        const maxTop = Math.max(drag.listTop, drag.listBottom - drag.rowH);
        desiredTop = Utils.clamp(desiredTop, drag.listTop, maxTop);
        const desiredCenter = desiredTop + drag.rowH / 2;
        toIdx = Utils.clamp(Math.floor((desiredCenter - drag.listTop) / drag.rowH), 0, this._map.layers.length - 1);
      }
      if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
        if (!drag.antesH) drag.antesH = this._camadasAntes(); // [01/10/2026] histórico — estado de ORIGEM, capturado antes da 1ª troca do arraste
        Mapping.reorderLayerToIndex(this._map, drag.id, toIdx);
        this._renderLayersPanel(); // reconstrói a lista já na nova ordem — FLIP cuida das OUTRAS linhas (a arrastada segue o cursor à parte, ver _followDraggedLayerRow)
        drag.lockedUntil = now + this._LAYER_FLIP_DURATION_MS; // trava novas TROCAS até a animação deste flip terminar (não afeta o acompanhamento do cursor)
      }
    }
    this._followDraggedLayerRow(e);
  },

  /** Mantém a linha ARRASTADA (ver _onLayerRowDragMove) grudada no cursor
   *  durante o gesto inteiro, sem "magnetizar" pra posição da próxima camada
   *  — pedido do usuário, 25/08/2026. Mede a posição NATURAL da linha agora
   *  (sem nenhum transform — mesma técnica de _flipLayerRows, só que
   *  aplicada a CADA movimento do cursor em vez de uma vez só depois de
   *  reconstruir) e desloca ela (translateY) pra bater exatamente com
   *  `drag.startRowTop` + a distância total percorrida pelo cursor desde o
   *  início do arraste. Funciona tanto entre trocas de posição (linha
   *  parada no DOM, só acompanha o cursor por transform) quanto NA HORA de
   *  uma troca (a linha é reconstruída num índice novo por
   *  `_renderLayersPanel`, dentro de _onLayerRowDragMove, e este método é
   *  chamado de novo logo em seguida — reancora o deslocamento a partir da
   *  nova posição natural, sem nenhum "pulo" visual pro usuário). */
  _followDraggedLayerRow(e) {
    const drag = this._layerRowDrag;
    const panel = this._layersPanelEl;
    if (!drag?.dragging || !panel || drag.startRowTop == null) return;
    const row = panel.querySelector(`.map-layer-row[data-id="${drag.id}"]`);
    if (!row) return;
    row.style.transform = ''; // some por um instante pra medir a posição NATURAL (sem transform) abaixo
    row.style.zIndex = '5'; // sempre por cima das outras linhas enquanto arrasta, mesmo passando visualmente por cima delas
    const naturalRect = row.getBoundingClientRect();
    let desiredTop = drag.startRowTop + (e.clientY - drag.startY);
    // Pedido do usuário: limita o deslocamento vertical ao retângulo
    // formado pelas camadas (ver `drag.listTop`/`drag.listBottom`, medidos
    // uma vez no início do arraste) — a linha nunca sai por cima da
    // primeira camada nem por baixo da última. `maxTop` desconta a própria
    // altura da linha (`naturalRect.height`) do limite de baixo, senão ela
    // poderia ultrapassar o fundo do retângulo antes de encostar a base nele.
    if (drag.listTop != null && drag.listBottom != null) {
      const maxTop = Math.max(drag.listTop, drag.listBottom - naturalRect.height);
      desiredTop = Utils.clamp(desiredTop, drag.listTop, maxTop);
    }
    const offset = desiredTop - naturalRect.top;
    row.style.transform = Math.abs(offset) > 0.5 ? `translateY(${offset}px)` : '';
  },

  _onLayerRowDragEnd() {
    const wasDragging = this._layerRowDrag?.dragging;
    const dragAntesH = this._layerRowDrag?.antesH;
    const dragId = this._layerRowDrag?.id;
    this._layerRowDrag = null;
    if (this._layersPanelEl) this._layersPanelEl.style.userSelect = '';
    // [01/10/2026] NOVO — reordenar arrastando entra no histórico como UMA entrada (origem -> destino final, não uma por troca intermediária).
    if (wasDragging && dragAntesH) this._camadasHistPush(`Camada "${(this._map.layers.find((x) => x.id === dragId) || {}).nome || ''}" reordenada`, dragAntesH);
    if (wasDragging) { this._saveMap(); this._renderLayersPanel(); } // tira a opacidade de "arrastando" e persiste a ordem final
  },

  /** Anima (FLIP) cada linha que MUDOU de posição de tela entre a
   *  reconstrução anterior (`prevRects`, capturado no início de
   *  _renderLayersPanel) e a atual — só requestAnimationFrame PRÓPRIO
   *  (`_layersFlipLoopId`/`_layerFlipAnims`), nunca CSS transition, mesmo
   *  padrão de organizeview.js/photogrid.js (ver `_flipAnims`/
   *  `_ensureFlipLoop` lá — replicado aqui pra uma lista comum de linhas
   *  HTML em vez de um grid desenhado em canvas). */
  _flipLayerRows(prevRects) {
    const panel = this._layersPanelEl;
    if (!panel || !prevRects || !prevRects.size) return;
    this._layerFlipAnims = this._layerFlipAnims || new Map();
    // Pedido do usuário, 25/08/2026 ("não deve magnetizar"): a linha sendo
    // arrastada agora tem posição PRÓPRIA, grudada no cursor o tempo todo
    // (ver _followDraggedLayerRow) — nunca entra no FLIP, que é só pras
    // OUTRAS linhas "deixando o lugar" pra abrir espaço pra ela (pedido do
    // usuário: "a flipagem fica por conta apenas das camadas que devem
    // deixar o seu lugar atual"). Sem esta exclusão, as duas animações
    // ficariam brigando pelo mesmo `row.style.transform` a cada quadro —
    // _followDraggedLayerRow rodando a cada pointermove, o laço do FLIP
    // (_ensureLayersFlipLoop) rodando a cada requestAnimationFrame.
    const draggedId = this._layerRowDrag?.dragging ? this._layerRowDrag.id : null;
    panel.querySelectorAll('.map-layer-row').forEach((row) => {
      if (row.dataset.id === draggedId) { this._layerFlipAnims.delete(row.dataset.id); return; }
      const prev = prevRects.get(row.dataset.id);
      if (!prev) return;
      const cur = row.getBoundingClientRect();
      const dy = prev.top - cur.top;
      if (Math.abs(dy) < 0.5) return;
      this._layerFlipAnims.set(row.dataset.id, { dy, start: performance.now() });
    });
    this._ensureLayersFlipLoop();
  },

  _ensureLayersFlipLoop() {
    if (this._layersFlipLoopId) return;
    const DURATION = this._LAYER_FLIP_DURATION_MS;
    const step = () => {
      const panel = this._layersPanelEl;
      if (!panel || !this._layerFlipAnims || !this._layerFlipAnims.size) { this._layersFlipLoopId = null; return; }
      const now = performance.now();
      for (const [id, anim] of this._layerFlipAnims) {
        const row = panel.querySelector(`.map-layer-row[data-id="${id}"]`);
        if (!row) { this._layerFlipAnims.delete(id); continue; }
        const t = Math.min(1, (now - anim.start) / DURATION);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cúbico
        const offset = anim.dy * (1 - eased);
        row.style.transform = Math.abs(offset) > 0.5 ? `translateY(${offset}px)` : '';
        if (t >= 1) { row.style.transform = ''; this._layerFlipAnims.delete(id); }
      }
      this._layersFlipLoopId = requestAnimationFrame(step);
    };
    this._layersFlipLoopId = requestAnimationFrame(step);
  },

  // [01/10/2026] NOVO — "Todos os 7 botões de ação da janela camadas, a reordenança das camadas (origem e destino) e as alterações de quaisquer um de seus campos (Nome, Visível,Bloqueada,Opacidade) em cada camada devem entrar no histórico e ficarem sujeitas ao ctrl+z/ctrl+y." Causa raiz: só o botão "excluir" chamava `History.push`; add/dup/merge/up/down, o arrastar-pra-reordenar, o olho da linha e o OK das Propriedades mutavam `this._map` e só gravavam. Solução: helpers genéricos de ANTES/DEPOIS (mesmos campos do snapshot da exclusão) + camada ativa. Desfazer/refazer aplicam o snapshot direto em `this._map` (se o ambiente está aberto — sem depender da gravação debounced no banco) ou no banco (se o usuário já saiu do ambiente).
  _CAMADAS_SNAP_CAMPOS: ['walls', 'points', 'trilha', 'objects', 'textos', 'portas', 'janelas', 'layers', 'bounds'],
  _camadasSnapshot() {
    return JSON.parse(JSON.stringify(Object.fromEntries(this._CAMADAS_SNAP_CAMPOS.map((c) => [c, this._map[c]]))));
  },
  async _camadasAplicarSnapshot(mapId, snap, activeId) {
    const clone = JSON.parse(JSON.stringify(snap));
    if (this._map?.id === mapId) {
      Object.assign(this._map, clone);
      this._activeLayerId = activeId;
      this._renderer?.setMapData(this._map);
      this._renderLayersPanel();
      try { this._saveMap(); } catch (err) { console.warn('[MapView] salvar após desfazer/refazer camadas:', err); }
    } else {
      const m = await DB.getMap(mapId);
      if (!m) return;
      Object.assign(m, clone);
      await DB.saveMap(m);
    }
  },
  /** Registra no histórico uma mudança de camadas já aplicada. `antes` =
   *  { snap, active } capturado ANTES da mutação; o DEPOIS é capturado aqui. */
  _camadasHistPush(label, antes) {
    if (!this._map || !antes) return;
    const mapId = this._map.id;
    const depoisSnap = this._camadasSnapshot();
    const depoisActive = this._activeLayerId;
    if (JSON.stringify(antes.snap) === JSON.stringify(depoisSnap) && antes.active === depoisActive) return; // nada mudou de verdade
    History.push({
      label,
      undo: () => this._camadasAplicarSnapshot(mapId, antes.snap, antes.active),
      redo: () => this._camadasAplicarSnapshot(mapId, depoisSnap, depoisActive),
    });
  },
  _camadasAntes() { return { snap: this._camadasSnapshot(), active: this._activeLayerId }; },

  _renderLayersPanel(...args) { return this._camadasGuard(() => this._renderLayersPanelImpl(...args), 'desenhar a lista de camadas')(); },

  _renderLayersPanelImpl() {
    const panel = this._layersPanelEl;
    if (!panel || !this._map) return;
    const layers = this._map.layers || [];
    const idx = layers.findIndex((l) => l.id === this._activeLayerId);
    const isTopmost = idx <= 0;
    const isBottommost = idx === -1 || idx === layers.length - 1;
    const semSelecao = idx === -1;
    // FLIP (First/Last/Invert/Play — mesma técnica de organizeview.js/
    // photogrid.js: só requestAnimationFrame próprio, NUNCA CSS transition)
    // pra reordenar arrastando (ver _wireLayerRowDrag) — guarda a posição
    // de cada linha ANTES de reconstruir o innerHTML abaixo; sem isso a
    // linha "pularia" direto pro lugar novo sem nenhuma transição.
    const prevRects = new Map();
    panel.querySelectorAll('.map-layer-row').forEach((row) => prevRects.set(row.dataset.id, row.getBoundingClientRect()));
    // Pedido do usuário: "algo está acontecendo quando se clica em uma das
    // camadas mais abaixo, acaba voltando sozinha para cima o scroll" —
    // TODA troca de seleção/visibilidade/etc. reconstrói `panel.innerHTML`
    // do zero (FLIP acima cuida da posição das LINHAS, mas não da rolagem
    // da lista em si), o que recria `#map-layers-list` como um elemento
    // NOVO — e um elemento novo sempre nasce com scrollTop=0, mesmo que a
    // pessoa estivesse rolada mais pra baixo. Guarda a rolagem ANTES de
    // reconstruir e reaplica no elemento novo logo abaixo, na mesma
    // posição de antes.
    const prevScrollTop = panel.querySelector('#map-layers-list')?.scrollTop || 0;
    // [01/10/2026] NOVO — "Ao possicionar o cursor do mouse exatamente em cima do ícone de cadeado da camada que está bloqueada, deve aparecer um title explicativo. No restante, como já é, deve aparecer o title genérico da camada ativa." Causa raiz: o cadeado era só texto dentro do label da linha, herdando o title genérico; agora é um span próprio (.map-layer-lock) com title próprio — o title mais interno vence só sobre o cadeado.
    panel.innerHTML = `
      <div class="map-panel-clip">
        <div class="map-panel-head" id="map-layers-head"><b>🗂️ Camadas</b><button type="button" class="icon-btn sm map-panel-close" id="map-layers-close" title="Fechar">✕</button></div>
        <div class="map-layers-list" id="map-layers-list">
          ${layers.map((l) => `
          <div class="map-layer-row ${l.id === this._activeLayerId ? 'active' : ''}" data-id="${l.id}" title="${Utils.escapeHtml(l.nome)} — clique para selecionar, clique e arraste para reordenar">
            <span class="map-layer-name-label">${l.bloqueada ? '<span class="map-layer-lock" title="Camada bloqueada — seus elementos ficam visíveis, mas não podem ser selecionados, movidos nem editados no mapa. Desbloqueie em ⚙️ Propriedades.">🔒</span> ' : ''}${Utils.escapeHtml(l.nome)}</span>
            <button type="button" class="icon-btn sm map-layer-vis" data-act="vis" title="${l.visivel === false ? 'Camada oculta — clique pra mostrar' : 'Camada visível — clique pra ocultar'}">${l.visivel === false ? '🚫' : '👁️'}</button>
          </div>
          `).join('')}
        </div>
        <div class="map-layers-toolbar">
          <button type="button" class="map-layers-tbtn" data-act="add" title="Adicionar nova camada">➕</button>
          <button type="button" class="map-layers-tbtn" data-act="del" ${layers.length <= 1 ? 'disabled' : ''} title="${layers.length <= 1 ? 'Precisa sobrar ao menos 1 camada' : 'Remover camada selecionada — exclui tudo que estiver nela (dá pra desfazer com Ctrl+Z)'}">🗑️</button>
          <button type="button" class="map-layers-tbtn" data-act="dup" ${semSelecao ? 'disabled' : ''} title="Duplicar camada selecionada">⧉</button>
          <button type="button" class="map-layers-tbtn" data-act="merge" ${isBottommost ? 'disabled' : ''} title="${isBottommost ? 'Não há camada abaixo pra mesclar' : 'Mesclar com a camada de baixo'}">⬇⧉</button>
          <button type="button" class="map-layers-tbtn" data-act="up" ${isTopmost ? 'disabled' : ''} title="Mover a camada selecionada para cima">↑</button>
          <button type="button" class="map-layers-tbtn" data-act="down" ${isBottommost ? 'disabled' : ''} title="Mover a camada selecionada para baixo">↓</button>
          <button type="button" class="map-layers-tbtn" data-act="props" ${semSelecao ? 'disabled' : ''} title="Propriedades da camada selecionada">⚙️</button>
        </div>
      </div>
    `;
    const newList = panel.querySelector('#map-layers-list');
    if (newList) newList.scrollTop = prevScrollTop;
    panel.querySelector('#map-layers-close').onclick = () => this._closeLayersPanel();
    panel.querySelectorAll('.map-layer-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-act="vis"]').onclick = this._camadasGuard((e) => {
        e.stopPropagation();
        const l = this._map.layers.find((l) => l.id === id);
        const antesH = this._camadasAntes(); // [01/10/2026] histórico (Ctrl+Z/Y) — ver _camadasHistPush
        Mapping.setLayerVisible(this._map, id, l.visivel === false);
        this._camadasHistPush(`Camada "${l.nome}" ${l.visivel === false ? 'ocultada' : 'exibida'}`, antesH);
        this._saveMap();
        this._renderLayersPanel();
      }, 'alternar visibilidade da camada');
      // Um arraste em ANDAMENTO (ver _wireLayerRowDrag/_layerRowDrag) chegou
      // aqui no meio da reconstrução do zero — reaplica o estado "sendo
      // arrastada" nesta linha nova pra não perder o feedback visual.
      if (this._layerRowDrag?.dragging && this._layerRowDrag.id === id) row.style.opacity = '0.55';
      this._wireLayerRowDrag(row, id);
    });
    this._flipLayerRows(prevRects);
    const tbtn = (act) => panel.querySelector(`.map-layers-tbtn[data-act="${act}"]`);
    tbtn('add').onclick = this._camadasGuard(() => {
      const antesH = this._camadasAntes(); // [01/10/2026] histórico (Ctrl+Z/Y)
      const l = Mapping.addLayer(this._map, undefined, this._activeLayerId);   // [01/10/2026] NOVO — nasce em cima da camada ativa (ver Mapping.addLayer)
      this._activeLayerId = l.id;
      this._camadasHistPush(`Camada "${l.nome}" adicionada`, antesH);
      this._saveMap();
      this._renderLayersPanel();
    }, 'adicionar camada');
    // Pedido do usuário (22/08/2026): "Quando uma camada é excluída, tudo
    // que estiver na grade através dela também deve ser excluído" —
    // Mapping.removeLayer já cuida de paredes/pontos/objetos/
    // textos/portas/janelas (ver lá), mas os PINOS DE PATRIMÔNIO
    // (`map.itens`, ver _refreshItensNoMapa) não vivem dentro do `map` —
    // são registros à parte no banco (mapaLayerId), então precisam ser
    // "removidos da grade" aqui, à parte (mesma ação de "Remover do mapa":
    // zera mapaX/mapaY/mapaPiso, sem apagar o cadastro do item — ver
    // view3d.js _removeWithTool, que já faz exatamente isso). Guarda um
    // snapshot ANTES/DEPOIS pra dar pra desfazer (Ctrl+Z) — precisa ser uma
    // cópia PROFUNDA (JSON round-trip) porque os arrays de `this._map` são
    // mutados diretamente no lugar por Mapping.removeLayer, então uma cópia
    // rasa (`{...map}` ou DB.getMap, que faz o mesmo) acabaria "seguindo" a
    // mutação em vez de preservar o estado de antes.
    const PLANTA_CAMPOS = ['walls', 'points', 'trilha', 'objects', 'textos', 'portas', 'janelas', 'layers', 'bounds'];
    const plantaSnapshot = () => JSON.parse(JSON.stringify(
      Object.fromEntries(PLANTA_CAMPOS.map((c) => [c, this._map[c]])),
    ));
    // Qual camada fica selecionada depois de excluir a atual — pedido do
    // usuário (22/08/2026): "A atual é excluída e a seleção de camada vai
    // para a de baixo, em vez de não selecionar coisa alguma. A não ser que
    // esteja selecionada a última camada (mais embaixo), então ao excluí-la,
    // a de cima passa a ser a selecionada. Isso tudo até, caso aconteça,
    // chegar a uma só camada". `idx` é a posição da camada excluída ANTES
    // da remoção; depois que `Mapping.removeLayer` tira ela do array, tudo
    // que estava ABAIXO sobe uma posição — então `layers[idx]` (já sem a
    // excluída) é exatamente "a que ficou logo abaixo dela". Se a excluída
    // era a última (idx == length ANTES, ou seja, não sobra nada nessa
    // posição depois), `Math.min` cai pro último índice válido — "a que
    // ficou acima dela", agora virando a nova última.
    const proximaSelecao = (layers, idx) => layers[Math.min(idx, layers.length - 1)]?.id || null;
    tbtn('del').onclick = this._camadasGuard(() => {
      if (this._map.layers.length <= 1 || !this._activeLayerId) return;
      const deletedId = this._activeLayerId;
      const deletedIdx = this._map.layers.findIndex((l) => l.id === deletedId);
      const layerNome = (this._map.layers.find((l) => l.id === deletedId) || {}).nome || 'Camada';
      const nElementos = Mapping.countInLayer(this._map, deletedId);
      const itensNaCamada = (this._map.itens || []).filter((it) => it.layerId === deletedId);
      const mapId = this._map.id;
      const antes = plantaSnapshot();
      const ok = Mapping.removeLayer(this._map, deletedId);
      if (!ok) return;
      this._activeLayerId = proximaSelecao(this._map.layers, deletedIdx);
      // Pedido do usuário: "as exclusões de camada devem ser imediatas, não
      // devem esperar guardar no banco de dados" — tudo que é ESTADO (o
      // `map` em memória, incluindo os pinos de patrimônio que somem da
      // grade) já mudou acima/abaixo SINCRONAMENTE; a interface (toast,
      // painel, desfazer) reage na hora, e só a GRAVAÇÃO de verdade
      // (`DB.updateItem`/`_saveMap`) roda em segundo plano, sem travar nada
      // disso — mesmo espírito da correção anterior no botão "OK" das
      // Propriedades da camada.
      this._map.itens = (this._map.itens || []).filter((it) => it.layerId !== deletedId);
      const depois = plantaSnapshot();
      const partes = [`${nElementos} elemento(s)`];
      if (itensNaCamada.length) partes.push(`${itensNaCamada.length} patrimônio(s) removido(s) da grade`);
      Utils.toast(`Camada "${layerNome}" removida — ${partes.join(' e ')} junto.`, { type: 'ok' });
      this._renderLayersPanel();
      (async () => {
        for (const it of itensNaCamada) await DB.updateItem(it.id, { mapaX: null, mapaY: null, mapaPiso: 0 });
        await this._saveMap('_renderLayersPanelImpl');
      })();
      History.push({
        label: `Camada "${layerNome}" removida`,
        undo: async () => {
          const m = await DB.getMap(mapId);
          if (!m) return;
          Object.assign(m, antes);
          for (const it of itensNaCamada) await DB.updateItem(it.id, { mapaX: it.x, mapaY: it.y, mapaPiso: it.piso });
          await DB.saveMap(m);
          await this._reloadMapIfShowing(mapId);
          if (this._map?.id === mapId) {
            this._activeLayerId = deletedId;
            if (itensNaCamada.length) await this._refreshItensNoMapa();
            this._renderLayersPanel();
          }
        },
        redo: async () => {
          const m = await DB.getMap(mapId);
          if (!m) return;
          Object.assign(m, depois);
          for (const it of itensNaCamada) await DB.updateItem(it.id, { mapaX: null, mapaY: null, mapaPiso: 0 });
          await DB.saveMap(m);
          await this._reloadMapIfShowing(mapId);
          if (this._map?.id === mapId) {
            this._activeLayerId = proximaSelecao(this._map.layers, deletedIdx);
            if (itensNaCamada.length) await this._refreshItensNoMapa();
            this._renderLayersPanel();
          }
        },
      });
    }, 'excluir camada');
    tbtn('dup').onclick = this._camadasGuard(() => {
      if (!this._activeLayerId) return;
      const antesH = this._camadasAntes(); // [01/10/2026] histórico (Ctrl+Z/Y)
      const nova = Mapping.duplicateLayer(this._map, this._activeLayerId);
      if (nova) {
        this._activeLayerId = nova.id;
        this._camadasHistPush(`Camada duplicada: "${nova.nome}"`, antesH);
        this._saveMap();
        Utils.toast(`Camada duplicada: "${nova.nome}".`, { type: 'ok' });
        this._renderLayersPanel();
      }
    }, 'duplicar camada');
    tbtn('merge').onclick = this._camadasGuard(() => {
      const i = this._map.layers.findIndex((l) => l.id === this._activeLayerId);
      if (i === -1 || i === this._map.layers.length - 1) return;
      const destinoId = this._map.layers[i + 1].id;
      const antesH = this._camadasAntes(); // [01/10/2026] histórico (Ctrl+Z/Y)
      const origemNome = this._map.layers[i].nome;
      const ok = Mapping.mergeLayerDown(this._map, this._activeLayerId);
      if (ok) {
        this._activeLayerId = destinoId;
        this._camadasHistPush(`Camada "${origemNome}" mesclada com a de baixo`, antesH);
        this._saveMap();
        Utils.toast('Camadas mescladas.', { type: 'ok' });
        this._renderLayersPanel();
      }
    }, 'mesclar camadas');
    tbtn('up').onclick = this._camadasGuard(() => {
      if (!this._activeLayerId) return;
      const antesH = this._camadasAntes(); // [01/10/2026] histórico (Ctrl+Z/Y)
      Mapping.reorderLayer(this._map, this._activeLayerId, 'up');
      this._camadasHistPush(`Camada "${(this._map.layers.find((x) => x.id === this._activeLayerId) || {}).nome || ''}" movida para cima`, antesH);
      this._saveMap();
      this._renderLayersPanel();
    }, 'mover camada pra cima');
    tbtn('down').onclick = this._camadasGuard(() => {
      if (!this._activeLayerId) return;
      const antesH = this._camadasAntes(); // [01/10/2026] histórico (Ctrl+Z/Y)
      Mapping.reorderLayer(this._map, this._activeLayerId, 'down');
      this._camadasHistPush(`Camada "${(this._map.layers.find((x) => x.id === this._activeLayerId) || {}).nome || ''}" movida para baixo`, antesH);
      this._saveMap();
      this._renderLayersPanel();
    }, 'mover camada pra baixo');
    tbtn('props').onclick = this._camadasGuard(() => { if (this._activeLayerId) this._openLayerPropertiesPanel(this._activeLayerId); }, 'abrir propriedades da camada');

    this._makePanelDraggable(panel, 'layers');
    // [10/09/2026] NOVO — pedido verbatim: "a janela 'Camadas' deve ter as
    // suas dimensões preservadas ao recarregar a página." Persiste via
    // `DB.setSetting` (MESMO mecanismo/convenção de nome já usado por toda
    // outra preferência de UI deste app — ver `mapa2dGrade`/`mapa2dReguas`/
    // `mapa2dSnapGrade` etc. logo acima neste arquivo) — não em
    // `_panelPositions` (que só dura a sessão, nunca sobrevive a um F5, ver
    // comentário grande em `_applyRememberedPanelPos`) nem em
    // `localStorage` direto (o app já padroniza tudo em `DB.getSetting`/
    // `setSetting`, que passa pelo IndexedDB — mesmo lugar que a posição
    // NÃO usa hoje, mas que TAMANHO precisa por ser um pedido explícito de
    // sobreviver a recarregar). Salva só no soltar o redimensionamento
    // (`onResizeEnd`, ver `_makePanelResizable`), nunca a cada pixel.
    this._makePanelResizable(panel, {
      minWidth: 220, minHeight: 200, maxWidth: 560, maxHeight: 640,
      onResizeEnd: (w, h) => { DB.setSetting('mapa2dCamadasPanelSize', { w, h }); },
    });
  },

  /** Painel de propriedades da camada (botão "⚙️" na barra de baixo do
   *  painel de camadas) — nome, visibilidade, bloqueio e opacidade num só
   *  lugar, igual ao diálogo de propriedades de camada do Paint.NET.
   *
   *  Pedido do usuário (20/08/2026): deixou de reaproveitar o painel
   *  flutuante genérico (_openPanel — não-modal, igual todos os outros
   *  painéis do app) e virou um MODAL de verdade — fundo cobrindo a tela
   *  inteira (bloqueia clique/toque em qualquer outra coisa, inclusive
   *  cabeçalho/outros painéis, enquanto está aberto) com dois botões no
   *  rodapé: "OK" (confirma e salva) e "Cancelar" (desfaz tudo que foi
   *  mexido nesta sessão do painel — volta nome/visível/bloqueada/opacidade
   *  pro valor de quando abriu — e fecha sem salvar). A opacidade agora tem
   *  um campo numérico editável direto, além da barra (os dois ficam
   *  sincronizados, mexer num atualiza o outro). Nenhuma mudança é
   *  persistida no banco (`_saveMap`) até OK ou Cancelar — enquanto o
   *  usuário mexe nos campos, só o desenho em tela (`_renderer.setMapData`)
   *  e a lista de camadas por trás (`_renderLayersPanel`) refletem ao vivo. */
  _openLayerPropertiesPanel(...args) { return this._camadasGuard(() => this._openLayerPropertiesPanelImpl(...args), 'abrir propriedades da camada')(); },

  _openLayerPropertiesPanelImpl(layerId) {
    const l = (this._map?.layers || []).find((l) => l.id === layerId);
    if (!l) return;
    this._closeLayerPropertiesModal();
    const orig = { nome: l.nome, visivel: l.visivel !== false, bloqueada: !!l.bloqueada, opacidade: l.opacidade ?? 255 };
    const antesH = this._camadasAntes(); // [01/10/2026] histórico (Ctrl+Z/Y) — estado de quando o painel abriu; 1 entrada por OK
    const backdrop = document.createElement('div');
    backdrop.className = 'map-layerprops-modal-backdrop';
    // SEM escurecer o fundo (pedido do usuário) — a opacidade que a pessoa
    // está ajustando no painel precisa continuar visível por trás dele, sem
    // nenhum tingimento por cima atrapalhando a comparação visual. O
    // bloqueio de interação (o "resto do app não responde enquanto isto
    // está aberto") continua igual — vem do próprio fundo `fixed`/`inset:0`
    // capturando todo pointerdown/click (ver abaixo), não da cor dele.
    backdrop.style.cssText = 'position:fixed; inset:0; background:transparent; z-index:99999; display:flex; align-items:center; justify-content:center; touch-action:none;';
    backdrop.innerHTML = this._camadasTemplatePropriedades(l);
    document.body.appendChild(backdrop);
    this._layerPropsModalEl = backdrop;
    // Prioridade exclusiva: qualquer toque FORA do cartão (no próprio fundo
    // escurecido) é engolido aqui — não fecha sozinho (evita fechar sem
    // querer/perder o que estava digitando; só OK/Cancelar fecham de
    // propósito), mas também não deixa vazar pro que está atrás.
    backdrop.addEventListener('pointerdown', (e) => e.stopPropagation());
    backdrop.addEventListener('click', (e) => e.stopPropagation());

    const nomeEl = backdrop.querySelector('#layerprops-nome');
    const visEl = backdrop.querySelector('#layerprops-visivel');
    const bloqEl = backdrop.querySelector('#layerprops-bloqueada');
    const rangeEl = backdrop.querySelector('#layerprops-opacidade');
    const numEl = backdrop.querySelector('#layerprops-opacidade-num');

    nomeEl.oninput = this._camadasGuard((e) => { Mapping.renameLayer(this._map, layerId, e.target.value); this._renderLayersPanel(); }, 'renomear camada');
    visEl.onchange = this._camadasGuard((e) => { Mapping.setLayerVisible(this._map, layerId, e.target.checked); this._renderer?.setMapData(this._map); this._renderLayersPanel(); }, 'alternar visibilidade nas propriedades');
    bloqEl.onchange = this._camadasGuard((e) => { Mapping.setLayerLocked(this._map, layerId, e.target.checked); this._renderLayersPanel(); }, 'alternar bloqueio da camada');
    // Barra E campo numérico ficam sincronizados — mexer num reflete no outro na hora.
    const applyOpacidade = this._camadasGuard((v) => {
      v = Utils.clamp(parseInt(v, 10) || 0, 0, 255);
      rangeEl.value = v;
      numEl.value = v;
      Mapping.setLayerOpacity(this._map, layerId, v);
      this._renderer?.setMapData(this._map);
    }, 'ajustar opacidade da camada');
    rangeEl.oninput = (e) => applyOpacidade(e.target.value);
    numEl.oninput = (e) => applyOpacidade(e.target.value);

    // 22/08/2026, pedido do usuário: "o botão de ok deve funcionar
    // imediatamente, não esperar que seja guardado no banco de dados" —
    // cada campo (nome/visível/bloqueada/opacidade) já aplica a mudança em
    // `this._map` NA HORA (ver nomeEl/visEl/bloqEl/applyOpacidade acima),
    // então fechar o painel não depende de esperar o `_saveMap()` (a
    // gravação em si) terminar — só dispara ela em segundo plano.
    const confirmarOk = this._camadasGuard(() => {
      const lf = (this._map.layers || []).find((x) => x.id === layerId);
      if (lf) {
        const mud = [];
        if (lf.nome !== orig.nome) mud.push('nome');
        if ((lf.visivel !== false) !== orig.visivel) mud.push('visível');
        if (!!lf.bloqueada !== orig.bloqueada) mud.push('bloqueada');
        if ((lf.opacidade ?? 255) !== orig.opacidade) mud.push('opacidade');
        if (mud.length) this._camadasHistPush(`Camada "${orig.nome}": ${mud.join(', ')} alterado(s)`, antesH);
      }
      this._closeLayerPropertiesModal();
      this._saveMap();
    }, 'confirmar propriedades da camada');
    backdrop.querySelector('#layerprops-ok').onclick = confirmarOk;
    // Pedido do usuário, 26/08/2026: "Pressionar ENTER no campo do nome ou
    // no campo do número da transparência deve ter a mesma função de quando
    // se clica em 'OK'." — o valor mais recente já foi aplicado em
    // `this._map` a cada tecla (ver nomeEl.oninput/numEl.oninput acima), o
    // ENTER só precisa confirmar/fechar, exatamente como o botão OK.
    nomeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarOk(); } });
    numEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarOk(); } });
    // Pedido do usuário: "ao dar dois cliques em cima da camada, a janela...
    // deve vir com o texto do nome já selecionado" — foca e seleciona todo
    // o texto do campo "Nome" assim que o painel abre (por qualquer
    // caminho — duplo clique na linha ou o botão "⚙️ Propriedades" da barra
    // de baixo, ambos chamam esta mesma função), pronto pra já digitar por
    // cima sem precisar apagar o nome antigo primeiro.
    nomeEl.focus();
    nomeEl.select();
    backdrop.querySelector('#layerprops-cancelar').onclick = this._camadasGuardAsync(async () => {
      // Desfaz tudo que foi mexido nesta sessão do painel, voltando aos
      // valores de quando abriu — e persiste esse estado revertido (caso
      // algum campo já tivesse sido salvo antes por outro caminho).
      Mapping.renameLayer(this._map, layerId, orig.nome);
      Mapping.setLayerVisible(this._map, layerId, orig.visivel);
      Mapping.setLayerLocked(this._map, layerId, orig.bloqueada);
      Mapping.setLayerOpacity(this._map, layerId, orig.opacidade);
      this._renderer?.setMapData(this._map);
      // [01/10/2026] CORRIGIDO — pedido verbatim: "ao clicar em 'cancelar', a janela deve fechar imediatamente. Atualmente, demora por volta de 1s [...] Acho que tem alguma coisa a ver com a gravação no IndexedDB." CAUSA RAIZ: `await this._saveMap()` ficava ANTES de fechar o modal, e _saveMap só resolve depois do debounce (~1s, valor configurado de gravação) + a gravação no IndexedDB — mesmo erro que o botão OK já tinha corrigido em 22/08/2026. Agora o estado já foi revertido em memória acima, então fecha na hora e a gravação segue em segundo plano (sem await).
      this._renderLayersPanel();
      this._closeLayerPropertiesModal();
      try { this._saveMap(); } catch (err) { console.warn('[MapView] salvar após cancelar propriedades da camada:', err); }
    }, 'cancelar propriedades da camada');
  },

  _closeLayerPropertiesModalImpl() {
    this._layerPropsModalEl?.remove();
    this._layerPropsModalEl = null;
  },
  _closeLayerPropertiesModal(...args) { return this._camadasGuard(() => this._closeLayerPropertiesModalImpl(...args), 'fechar propriedades da camada')(); },

  /** HTML do modal 'Propriedades da camada' (movido de js/cards/map-dynamic-cards.js em 01/10/2026 — pedido verbatim: "Os códigos da janela 'Camadas' devem ser modulares e independentes o máximo possível do restante dos códigos do app."). `l` é o objeto da camada. */
  _camadasTemplatePropriedades(l) {
  return `
      <div class="map2d-props-panel map-layerprops-modal" style="position:static; max-width:340px; width:90vw; max-height:85vh; overflow:auto;">
        <div class="map-panel-head"><b>⚙️ Propriedades da camada</b></div>
        <!-- [01/10/2026] MUDADO — pedido verbatim: "Faça o campo para entrada de nome da camada maior, preenchendo todo o espaço em branco da linha." O rótulo deixa de ocupar 120px+ (flex:1 1 120px do CSS geral) e o campo preenche o resto da linha, com letra e padding maiores. -->
        <!-- [01/10/2026] NOVO — "Ao acessar o botão Propriedades da camada ativa, deve haver titles explicativos nos campos." Causa raiz: só o span de Bloqueada tinha title; agora cada campo (rótulo + controle) explica o que faz. -->
        <label class="map-panel-field" style="flex-wrap:nowrap" title="Nome da camada, exibido na lista da janela Camadas. Pode ser qualquer texto e não precisa ser único. Enter confirma."><span style="flex:0 0 auto; min-width:0">Nome</span><input type="text" id="layerprops-nome" class="map-layerprops-nome" title="Digite o novo nome da camada (Enter = OK)" style="flex:1 1 auto; min-width:0; width:100%; font-size:15px; padding:9px 10px" value="${Utils.escapeHtml(l.nome)}"></label>
        <label class="map-panel-field" title="Marcada: os elementos da camada aparecem no mapa 2D e no Ver em 3D. Desmarcada: a camada fica oculta (nada dela é desenhado), mas nada é apagado."><span>Visível</span><input type="checkbox" id="layerprops-visivel" title="Mostrar ou ocultar a camada inteira" ${l.visivel !== false ? 'checked' : ''}></label>
        <label class="map-panel-field" title="Bloqueia a camada contra edição acidental (o cadeado 🔒 aparece na lista)."><span title="Camada bloqueada: os elementos dela continuam visíveis, mas não podem ser movidos, editados, apagados nem colados; e, se for a camada ativa, nada novo pode ser criado nela.">Bloqueada</span><input type="checkbox" id="layerprops-bloqueada" ${l.bloqueada ? 'checked' : ''}></label>
        <label class="map-panel-field" title="Transparência da camada: 0 = totalmente transparente, 255 = totalmente opaca. Vale só para o desenho; não altera os dados."><span>Opacidade</span>
          <input type="range" id="layerprops-opacidade" title="Arraste para ajustar a opacidade (0 a 255)" min="0" max="255" step="1" value="${l.opacidade ?? 255}" style="flex:1">
          <input type="number" id="layerprops-opacidade-num" title="Valor exato da opacidade (0 a 255); acompanha a barra ao lado. Enter = OK" min="0" max="255" step="1" value="${l.opacidade ?? 255}" style="width:4.4em">
        </label>
        <div class="map-panel-actions" style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
          <button type="button" class="btn secondary sm" id="layerprops-cancelar" title="Descarta o que foi alterado aqui e fecha (nada vai para o histórico)">Cancelar</button>
          <button type="button" class="btn sm" id="layerprops-ok" title="Confirma as alterações e fecha — entram no histórico (Ctrl+Z desfaz)">OK</button>
        </div>
      </div>
    `;

  },
  });
})();
// [01/10/2026] NOVO — idem mapview.js: declara no Monitor do IndexedDB as 2 chamadas nomeadas `await this._saveMap('...')` desta janela.
try { if (window.DBMonitor && window.DBMonitor.declarar) window.DBMonitor.declarar(['_ensureLayer3DImpl', '_renderLayersPanelImpl'], 'espera'); } catch (e) { /* monitor é opcional */ }
