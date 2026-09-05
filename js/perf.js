/**
 * perf.js — HUD de performance (ativável/desativável), para acompanhar
 * FPS/CPU~/RAM enquanto o mapa (2D) ou o visualizador 3D estão em uso.
 *
 * "CPU %" é uma ESTIMATIVA (navegadores não expõem uso real de CPU do
 * processo por razões de privacidade/segurança): medimos quanto do
 * orçamento de cada frame (16.6ms a 60fps) o trabalho da própria página
 * está consumindo. "RAM" usa performance.memory (heap JS), quando
 * disponível (Chrome/Android); em outros navegadores mostra "indisponível".
 *
 * "FPS" conta QUADROS DE VERDADE DESENHADOS (ver markFrameStart, chamada só
 * por mapview.js/view3d.js quando de fato redesenham), não a frequência do
 * requestAnimationFrame do navegador — por isso reflete corretamente um
 * "Limite de FPS" configurado (Configurações › 🧊 do 3D) ou o modo "Sob
 * demanda" do 2D, sempre que uma dessas 2 telas está ativa. CORRIGIDO
 * (01/09/2026, pedido verbatim: "O hud deve funcionar (ter seus valores
 * atualizados) independente de qualquer coisa") — fora dessas 2 telas (onde
 * nenhuma chama markFrameStart), o HUD já NÃO fica mais travado em "0": cai
 * num fallback que conta o próprio requestAnimationFrame do HUD (ver
 * `_fallbackFrames`/`_tick`, mais abaixo), refletindo a taxa de atualização
 * natural da aba. "CPU%" nesse fallback fica em 0 de propósito (não há
 * trabalho de RENDERIZAÇÃO nenhum pra medir fora de um canvas ativo — 0% é
 * a resposta certa, não uma falha). "RAM" nunca dependeu de nenhuma tela —
 * sempre atualizou (e continua atualizando) em qualquer lugar do app.
 */

const Perf = {
  enabled: false,
  _hudEl: null,
  _frameStart: 0,
  _fps: 0,
  _cpuPct: 0,
  _frames: 0,
  _lastFpsT: 0,
  _busyAccum: 0,

  async init() {
    this.enabled = await DB.getSetting('hudAtivo', false);
    this._buildHud();
  },

  async setEnabled(v) {
    this.enabled = v;
    await DB.setSetting('hudAtivo', v);
    if (this._hudEl) this._hudEl.classList.toggle('hidden', !v);
  },

  /** Pedido do usuário (rodada anterior): HUD no canto superior direito
   *  dentro do Modelador 3D. Pedido do usuário (rodada seguinte, mais
   *  específico): "O hud deve ficar no canto superior direito da área do
   *  canvas, não é do app, para não cobrir o botão de 'configurações do
   *  app'. E é nos 2 modos (Modelador e normal de navegação)." — ou seja,
   *  não é mais um liga/desliga por modo: ancora o HUD DENTRO do container
   *  do canvas 3D (`.view3d-wrap`, que já é `position:relative` — ver
   *  css/style.css) assim que a Visualização 3D abre (`View3D.mount`), nos
   *  dois modos (normal e Modelador), e desfaz ao fechar (`View3D.unmount`).
   *  Como o `.view3d-wrap` fica ABAIXO do `<header class="topbar">` (onde
   *  mora `#btn-settings-top`) e não por cima dele, ancorar o HUD ao TOPO
   *  do `.view3d-wrap` (em vez do topo da JANELA) já resolve sozinho o "não
   *  cobrir o botão de configurações", sem precisar calcular a posição do
   *  botão em si. Fora do 3D (Mapa 2D etc.), o HUD volta pro
   *  `document.body` e pra posição padrão (borda direita, centralizado na
   *  vertical — ver `_buildHud`), sem mudança nenhuma. */
  setCanvasAnchor(wrapEl) {
    if (!this._hudEl) return;
    if (wrapEl) {
      wrapEl.appendChild(this._hudEl);
      this._hudEl.classList.add('perf-hud-canvas');
    } else {
      document.body.appendChild(this._hudEl);
      this._hudEl.classList.remove('perf-hud-canvas');
    }
  },
  // Mantido por compatibilidade (não usado mais — ver setCanvasAnchor acima).
  setTopRightCorner(on) {
    this._hudEl?.classList.toggle('perf-hud-topright', !!on);
  },

  /** ITEM B (retomado 31/08/2026), pedido verbatim: "O hud ainda não fica
   *  aparecendo no 'Organizar'. Aparece no 'Mapa' (na tela que tem o botão
   *  'Organizar'), porém na tela do 'Organizar' ele não aparece. Verifiquei
   *  que nas 'configurações do app' estava marcado para o hud aparecer."
   *  Causa: o HUD sempre viveu direto em `document.body`, `position:fixed`,
   *  `z-index:60` (ver `_buildHud` acima) — isso funciona em cima do Mapa 2D
   *  porque aquela tela faz parte do fluxo normal da página (não é um
   *  overlay por cima de tudo). "Organizar" É um overlay de tela cheia
   *  (`.organize-overlay`, `position:fixed; z-index:900`, ver style.css) —
   *  sendo um IRMÃO do HUD dentro de `document.body`, com z-index MAIOR, ele
   *  pinta por cima do HUD inteiro, escondendo ele de vez (mesmo com
   *  `enabled` true e o HUD tecnicamente no DOM).
   *  Mesma ideia de solução já usada pro 3D (`setCanvasAnchor` acima), só
   *  que sem trocar a POSIÇÃO visual (o HUD já fica bem — borda direita,
   *  meio da vertical — em qualquer tela que não seja o 3D; não precisa da
   *  posição "canto superior direito do canvas" específica de lá, que é
   *  pensada pra não cobrir um botão de configurações que só existe dentro
   *  do Modelador 3D): só MOVE o elemento do HUD pra dentro do container do
   *  overlay que está abrindo. Como `.organize-overlay` é `position:fixed`
   *  com `z-index`, ela cria um novo CONTEXTO DE EMPILHAMENTO — todo
   *  descendente dela (o HUD incluso, mesmo continuando `position:fixed`)
   *  passa a competir por z-index só DENTRO desse contexto, não mais contra
   *  o 900 do overlay inteiro; o `z-index:60` do HUD volta a "valer" ali
   *  dentro. O HUD continua com a MESMA classe/CSS de sempre (não usa
   *  `.perf-hud-canvas`) — como `position:fixed` ancora na JANELA, não no
   *  elemento-pai, a posição visual não muda nadinha, só a ORDEM de
   *  pintura. Chamado por `OrganizeView._buildOverlay()` (abrir, passando o
   *  próprio overlay) e `OrganizeView.close()` (fechar, passando `null` —
   *  devolve pro `document.body` ANTES do overlay ser removido do DOM, senão
   *  o HUD seria removido junto e sumiria de vez até recarregar a página). */
  mountIn(containerEl) {
    if (!this._hudEl) return;
    (containerEl || document.body).appendChild(this._hudEl);
  },

  _buildHud() {
    if (this._hudEl) return;
    const el = document.createElement('div');
    el.id = 'perf-hud';
    el.className = this.enabled ? '' : 'hidden';
    // Posição: borda direita, centralizado na VERTICAL — não mais no
    // topo-direita. No topo-direita ficava por cima dos botões das barras
    // internas de cada tela (toolbar do mapa 2D, barra de cima da câmera/3D,
    // etc. — todas nascem perto do topo, ver .map2d-toolbar/.camera-topbar),
    // tapando visualmente botões e seleções (mesmo sem bloquear o toque,
    // já que pointer-events:none deixa o clique passar direto). O meio da
    // borda direita é a região mais livre em qualquer tela: topo e rodapé
    // são onde ficam as barras de ferramentas/controles (topbar, bottomnav,
    // joystick/pular/correr do 3D, controles da câmera).
    el.style.cssText = 'position:fixed; right:8px; top:50%; transform:translateY(-50%); z-index:60;'
      + 'background:rgba(10,12,16,.82); border:1px solid #2a303a; border-radius:8px; padding:6px 9px;'
      + 'font-family:monospace; font-size:11px; color:#baffce; line-height:1.5; pointer-events:none; min-width:118px;';
    document.body.appendChild(el);
    this._hudEl = el;
    requestAnimationFrame((t) => this._tick(t));
  },

  /** Chame no início do trabalho pesado do frame (render/física) e markFrameEnd() no fim,
   *  para medir quanto do orçamento do frame foi consumido (estimativa de "CPU").
   *
   *  Bug relatado pelo usuário: "no Limite de FPS (configurações 3D), os
   *  limites não estão funcionando". O LIMITE em si (ver view3d.js `_loop`)
   *  já pulava o `render()` de verdade quando ainda não tinha passado tempo
   *  suficiente — isso sempre funcionou. O que não refletia o limite era
   *  este HUD: `_tick()` (linha abaixo) contava `this._frames++` no seu
   *  PRÓPRIO `requestAnimationFrame`, disparado a cada quadro do NAVEGADOR
   *  (tipicamente ~60/quadro por segundo da tela), não a cada quadro
   *  DESENHADO de verdade — então o "FPS" mostrado ficava sempre perto da
   *  taxa nativa da tela, mesmo com um limite de 30 configurado (o motor
   *  estava mesmo desenhando só 30x/s, só o NÚMERO no HUD não mudava).
   *  Agora `_frames` é incrementado AQUI, em `markFrameStart()` — chamada
   *  só quando um quadro de verdade é desenhado (view3d.js `_loop`, dentro
   *  do "if" que já respeita o limite de FPS; mapview.js `step`, que já
   *  pula quando o modo "Sob demanda" não tem nada novo pra desenhar) — e
   *  `_tick()` vira só um cronômetro que soma esses quadros reais numa
   *  janela de 500ms, sem contar nada por conta própria. */
  markFrameStart() { this._frameStart = performance.now(); this._frames++; },
  markFrameEnd() {
    if (!this._frameStart) return;
    this._busyAccum += performance.now() - this._frameStart;
    this._frameStart = 0;
  },

  // CORRIGIDO (01/09/2026), pedido verbatim: "O hud deve funcionar (ter
  // seus valores atualizados) independente de qualquer coisa. Atualmente,
  // só tem seus valores atualizados em 'Mapa'->'Planta baixa'->'Ver em
  // 3D'." Antes desta correção, o comentário no topo do arquivo já
  // documentava isso como intencional: fora do Mapa 2D/3D (Tabela/
  // Cartões/Buscar/Organizar/tela inicial/etc.), NADA chama
  // `markFrameStart` (não existe nenhum canvas sendo redesenhado ali), e o
  // FPS/CPU% dependiam 100% dele — ficavam travados em "0" pra sempre,
  // dando a impressão de HUD quebrado/parado (RAM sozinha continuava
  // atualizando normalmente, via `performance.memory`, lido de novo a cada
  // 500ms em `_render()` abaixo, independente de tudo isso — só FPS/CPU%
  // que travavam). `_fallbackFrames` conta o PRÓPRIO `requestAnimationFrame`
  // deste laço (roda pra sempre, decoupled de qualquer tela) — usado só
  // quando NENHUM quadro "de verdade" foi contado na janela de 500ms (ou
  // seja, estamos numa tela sem loop de render nenhum): o FPS passa a
  // refletir a taxa de atualização natural da aba (tipicamente a taxa de
  // atualização da tela, ~60) em vez de ficar zerado. Quando HÁ atividade de
  // canvas na janela (Mapa 2D ou 3D), o comportamento fica EXATAMENTE como
  // antes (`_frames`/`_busyAccum` de `markFrameStart`/`markFrameEnd`) — sem
  // regressão nenhuma na precisão do "Limite de FPS" (pedido de rodada
  // anterior, ver comentário grande acima de `markFrameStart`). CPU%
  // continua 0 no modo fallback DE PROPÓSITO (não é um bug residual): o que
  // esse número mede é "quanto do orçamento do frame o TRABALHO DE
  // RENDERIZAÇÃO consome" — fora de um canvas ativo não existe esse
  // trabalho pra medir, 0% já é a resposta correta, não uma falha de
  // instrumentação.
  _fallbackFrames: 0,

  _tick(t) {
    if (!this._lastFpsT) this._lastFpsT = t;
    this._fallbackFrames++;
    const elapsed = t - this._lastFpsT;
    if (elapsed >= 500) {
      if (this._frames > 0) {
        this._fps = Math.round((this._frames * 1000) / elapsed);
        const budget = this._frames * 16.6667;
        this._cpuPct = budget > 0 ? Utils.clamp(Math.round((this._busyAccum / budget) * 100), 0, 100) : 0;
      } else {
        this._fps = Math.round((this._fallbackFrames * 1000) / elapsed);
        this._cpuPct = 0;
      }
      this._frames = 0; this._busyAccum = 0; this._fallbackFrames = 0; this._lastFpsT = t;
      this._render();
    }
    requestAnimationFrame((tt) => this._tick(tt));
  },

  _render() {
    if (!this._hudEl || !this.enabled) return;
    const mem = performance.memory
      ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} / ${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(0)} MB`
      : 'indisponível';
    const cpuColor = this._cpuPct > 80 ? '#ef5a5a' : (this._cpuPct > 50 ? '#e8b339' : '#3ecf8e');
    this._hudEl.innerHTML = `
      <div>FPS: <b>${this._fps}</b></div>
      <div>CPU~: <b style="color:${cpuColor}">${this._cpuPct}%</b></div>
      <div>RAM: <b>${mem}</b></div>
    `;
  },
};

window.Perf = Perf;
