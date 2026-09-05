/**
 * modeler-input.js — Modelador 3D: atalhos de teclado e mouse (Tab, G/R/S,
 * E, I, F, X/Delete, A, 1/2/3, seleção). Atualizado (rodada de ajustes,
 * 28/08/2026) pro keymap "clássico" do Blender confirmado pelo usuário:
 *
 *   - "Botão direito seleciona e fica um contorno amarelo" — troca o botão
 *     de SELECIONAR de esquerdo pra DIREITO (era esquerdo, na 1ª versão) —
 *     mesmo esquema do Blender no keymap "Select with: Right Mouse". O
 *     botão ESQUERDO fica dedicado ao arraste dos handles do gizmo (mesma
 *     função de antes); direito, quando NÃO é um arraste de órbita da
 *     câmera (ver limiar de movimento abaixo), seleciona.
 *   - "Tecla A apenas, seleciona/deseleciona tudo" — vira TOGGLE (ver
 *     _selectAllToggle): se nem tudo estiver selecionado, seleciona tudo; se
 *     já estiver tudo selecionado, deseleciona tudo. Alt+A continua
 *     funcionando também como atalho direto de "deselecionar tudo" (pedido
 *     do usuário: "embora possa manter Alt+A funcionando também").
 *
 * Todas as funções recebem `state` (ver modeler-core.js) como 1º argumento.
 */

const ModelerInput = {
  _on(state, target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    state.listeners.push({ target, type, fn, opts });
  },

  bind(state) {
    state.listeners = [];
    const canvas = state.canvas;
    this._on(state, window, 'keydown', (e) => this._onKeyDown(state, e));
    // Pedido do usuário (câmera livre — WASD/setas): precisa saber quais
    // teclas estão SEGURADAS (não só o instante do keydown) pra mover a
    // câmera continuamente a cada quadro — ver `state.keys`, consumido em
    // `Modeler3D._updateFreeCamera`. Mesma ideia do `this._keys` do
    // View3D (view3d.js).
    this._on(state, window, 'keyup', (e) => { state.keys[e.code] = false; });
    this._on(state, canvas, 'mousedown', (e) => this._onMouseDown(state, e));
    this._on(state, window, 'mousemove', (e) => this._onMouseMove(state, e));
    this._on(state, window, 'mouseup', (e) => this._onMouseUp(state, e));
    this._on(state, canvas, 'wheel', (e) => this._onWheel(state, e), { passive: false });
    // Pedido do usuário: "O botão direito deve ser habilitado, no modo
    // Modelador, para apenas o app, pois, atualmente, fica abrindo o menu do
    // navegador." O canvas já tinha essa supressão (e o View3D "de fora"
    // também tem a SUA própria, ver view3d.js `onContextMenu` em
    // _bindDesktopControls) — mas cobria só o `<canvas>` em si, não a UI do
    // Modelador (toolbar/painel N/botão "Sair", que são elementos SEPARADOS,
    // irmãos do canvas dentro de `.view3d-wrap`, ver ModelerUI.build
    // `state.wrapEl.appendChild(root)`). Botão direito sobre a UI (não só
    // sobre a cena 3D) ainda abria o menu do navegador. Suprimido em
    // `state.wrapEl` inteiro (o container que envolve TANTO o canvas quanto
    // toda a UI do Modelador), então nenhum canto da tela enquanto o
    // Modelador está ativo escapa dessa supressão.
    this._on(state, state.wrapEl, 'contextmenu', (e) => e.preventDefault());
  },

  unbind(state) {
    (state.listeners || []).forEach(({ target, type, fn, opts }) => target.removeEventListener(type, fn, opts));
    state.listeners = [];
  },

  _isTypingTarget(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  },

  // ==================== teclado ====================

  _onKeyDown(state, e) {
    if (this._isTypingTarget(e)) return;
    const code = e.code;
    // Pedido do usuário: gravidade liga/desliga com Shift+Espaço, "para
    // qualquer um dos modos (Modelador ou normal)" — aqui é a metade do
    // Modelador (a do modo normal de navegação é em view3d.js `onKeyDown`).
    // Só tem efeito de verdade no modo de câmera LIVRE (o Orbital não tem
    // noção de "cair" — mira sempre um ponto fixo), mas o atalho funciona
    // igual nos dois pra não exigir lembrar QUAL modo está ativo.
    if (code === 'Space' && e.shiftKey) {
      e.preventDefault();
      state.freeCamGravity = !state.freeCamGravity;
      // Ao LIGAR a gravidade, começa sempre "no ar" (`freeCamGrounded =
      // false`) — mesmo se a câmera já estiver bem perto do chão — pra
      // sempre cair de verdade (física) até encostar, igual ao mesmo
      // cuidado em `view3d.js` (`this._grounded = false` no toggle de lá).
      // Ver `Modeler3D._updateFreeCamera` — é essa flag, não a posição, que
      // decide a física a cada quadro.
      if (state.freeCamGravity) { state.freeCamVelY = 0; state.freeCamGrounded = false; }
      Utils.toast?.(state.freeCamGravity ? '🌍 Gravidade ligada' : '🪶 Gravidade desligada (voo livre)', { duration: 1400 });
      return;
    }
    // Câmera livre (pedido do usuário): WASD/setas movem de verdade — ver
    // `Modeler3D._updateFreeCamera`. Intercepta (registra em `state.keys` e
    // NÃO deixa cair nos atalhos de sempre dessas teclas) só quando o modo
    // de posicionamento é 'free' — no modo Orbital (padrão), essas teclas
    // continuam sem função de câmera nenhuma, e 'S'/'A' continuam sendo os
    // atalhos de sempre (Escalar / Selecionar tudo), sem conflito.
    if (state.camPosMode === 'free' && (code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD' || code === 'ArrowUp' || code === 'ArrowDown')) {
      state.keys[code] = true;
      e.preventDefault();
      return;
    }
    // Pedido do usuário: "Deve ser possível pular também no modo 'livre',
    // quando a gravidade está ligada" — mesmo impulso vertical do pulo da
    // navegação normal (`view3d.js` `_jump`, +6), só que aplicado a
    // `state.freeCamVelY`. Só funciona com os pés no chão (`freeCamGrounded`,
    // atualizado em `Modeler3D._updateFreeCamera`) e com a gravidade ligada
    // (sem gravidade não faz sentido "pular" — a câmera já voa livre).
    if (state.camPosMode === 'free' && code === 'Space' && !e.shiftKey) {
      e.preventDefault();
      if (state.freeCamGravity && state.freeCamGrounded) {
        state.freeCamVelY = 6;
        state.freeCamGrounded = false;
      }
      return;
    }
    // Pedido do usuário: "O CTRL+Z/CTRL+Y deve funcionar também" — só fora de
    // um modal G/R/S em andamento (lá, Z já é "travar eixo Z" — ver abaixo —
    // e Enter/Esc já são os atalhos de "confirmar"/"desfazer o arrasto
    // atual"; Ctrl+Z DURANTE um arrasto não é um gesto padrão de nenhum
    // editor, então fica sem efeito de propósito, em vez de fazer algo
    // ambíguo). Aceita tanto Ctrl (Windows/Linux) quanto Cmd (Mac).
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !state.modal) {
      if (code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); this.undo(state); return; }
      if (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); this.redo(state); return; }
    }

    if (state.modal) {
      // `!ctrl`: sem isto, um Ctrl+Z apertado sem querer DURANTE um arrasto
      // (não deveria fazer nada, ver comentário acima) seria interpretado
      // como "travar eixo Z" só porque `e.code` de Ctrl+Z também é 'KeyZ'
      // (o code do teclado não muda com o Ctrl segurado).
      if (!ctrl && (code === 'KeyX' || code === 'KeyY' || code === 'KeyZ')) {
        const axis = code === 'KeyX' ? 'x' : code === 'KeyY' ? 'y' : 'z';
        state.modal.axis = state.modal.axis === axis ? null : axis;
        this._recomputeModalStart(state);
        e.preventDefault();
        return;
      }
      if (code === 'Enter') { this._confirmModal(state); e.preventDefault(); return; }
      if (code === 'Escape') { this._cancelModal(state); e.preventDefault(); return; }
      return;
    }

    if (code === 'Tab') { e.preventDefault(); this.toggleMode(state); return; }
    if (code === 'Escape') { this._deselectAll(state); return; }

    if (state.mode === 'edit') {
      if (code === 'Digit1') { this.setSelectMode(state, 'vertex'); return; }
      if (code === 'Digit2') { this.setSelectMode(state, 'edge'); return; }
      if (code === 'Digit3') { this.setSelectMode(state, 'face'); return; }
      if (code === 'KeyA' && !e.altKey) { this._selectAllToggle(state); return; }
      if (code === 'KeyA' && e.altKey) { this._deselectAll(state); return; }
      if (code === 'KeyE') { this.triggerExtrude(state); return; }
      if (code === 'KeyI') { this.triggerInset(state); return; }
      if (code === 'KeyF') { this.triggerMakeEdgeFace(state); return; }
    }
    // CORRIGIDO (01/09/2026, item 7 da rodada B), pedido verbatim: "No 'Modo
    // Objeto', pressionar 'del' deveria abrir uma janelinha apenas com a
    // opção para deletar. Porém não está funcionando." Causa: `Delete`/
    // `KeyX` ficavam DENTRO do bloco `if (state.mode === 'edit')` acima —
    // mesma classe de bug já corrigida pro Shift+D (ver comentário grande
    // logo abaixo): em Modo Objeto o atalho simplesmente nunca era
    // reconhecido. Tirado pra fora do bloco (mode-agnostic, igual G/R/S/
    // Shift+D) — `openRemoveMenu` já sabia diferenciar os 2 modos por
    // dentro? NÃO sabia (`_removeMenuItems`, único menu que ele mostrava,
    // é só de operações de vértice/aresta/face — sem sentido em Modo
    // Objeto, que não tem essa granularidade, ver comentário grande em
    // `ModelerMesh.duplicate`: "não existe uma 'seleção de objeto' separada
    // da malha inteira"). Por isso `openRemoveMenu` ganhou um `if
    // (state.mode === 'object')` novo (ver função, mais abaixo) — janela
    // com UMA ÚNICA opção "🗑️ Excluir objeto", em vez da lista de 10
    // operações de Edição.
    if (code === 'Delete' || code === 'KeyX') { this.openRemoveMenu(state); return; }
    // NOVO (01/09/2026) — pedido verbatim: "No Modelador, o shift+D deve
    // duplicar o que estiver selecionado." `triggerDuplicate` já existia
    // pronto (usado hoje só pelo item de menu "📋 Duplicar", ver
    // modeler-ui.js) — já encadeia um modal 'G' automático depois de
    // duplicar (arrastar pra posicionar, Enter confirma, Esc reverte),
    // exatamente o comportamento Shift+D do Blender.
    // ATUALIZADO (01/09/2026), pedido verbatim: "A duplicação deve
    // funcionar quando estiver selecionado o 'Modo Objeto'." Tirado de
    // dentro do bloco `if (state.mode === 'edit')` acima — igual a G/R/S
    // (abaixo), o atalho agora é reconhecido nos DOIS modos;
    // `ModelerMesh.duplicate`/`triggerDuplicate` já sabem lidar com Modo
    // Objeto por conta própria (ver comentários grandes lá).
    if (code === 'KeyD' && e.shiftKey) { e.preventDefault(); this.triggerDuplicate(state); return; }
    if (code === 'KeyG') { this._startModal(state, 'G'); return; }
    if (code === 'KeyR') { this._startModal(state, 'R'); return; }
    if (code === 'KeyS') { this._startModal(state, 'S'); return; }
  },

  // ==================== mouse ====================

  _onMouseDown(state, e) {
    // NOVO (02/09/2026), pedido verbatim (rodada C): "No 'editar', dos
    // modelos 3D, é que deve desabilitar a ação padrão do navegador
    // (rolagem rápida, que acaba travando a movimentação do 'editar') do
    // botão do meio do mouse." — a rodada anterior (item B4) só cobriu o
    // visualizador orbital "cru" (`Modelos3DView._iniciarOrbitPreview`,
    // usado pelo "👁️ Ver em 3D" avulso); o Modelador de verdade ("✏️
    // Editar", este arquivo) tinha seu PRÓPRIO listener de `mousedown`
    // (acima, `bind()`) sem o mesmo `e.preventDefault()` — o botão do meio
    // já era tratado logo abaixo (`e.button === 1`, gira a câmera via
    // Pointer Lock), mas o navegador ainda recebia o evento como um clique
    // de auto-scroll normal, abrindo o ícone de "rolagem rápida" por cima
    // da cena e brigando com o Pointer Lock pela movimentação do mouse.
    // `preventDefault()` no `mousedown` do botão do meio é a forma padrão
    // de suprimir esse comportamento do navegador (mesmo padrão já usado em
    // `Modelos3DView._iniciarOrbitPreview`/`onMouseDownMiddleGuard`).
    if (e.button === 1) e.preventDefault();
    state.mouse.downX = e.clientX; state.mouse.downY = e.clientY;
    state.mouse.downButton = e.button; state.mouse.moved = false;

    if (state.modal) {
      if (e.button === 0) { this._confirmModal(state); return; }
      if (e.button === 2) { this._cancelModal(state); return; }
      return;
    }
    if (e.button === 0) {
      // Botão ESQUERDO: só arrasta um handle do gizmo (picking pixel-perfect
      // — ver modeler-gizmo.js). Sem gizmo sob o cursor, não faz nada (a
      // SELEÇÃO agora é sempre pelo botão direito, ver _onMouseUp).
      const axis = ModelerGizmo.pickPixelPerfect(state, e.clientX, e.clientY);
      if (axis) {
        const type = state.gizmoMode === 'move' ? 'G' : state.gizmoMode === 'rotate' ? 'R' : 'S';
        this._startModal(state, type, { axis, endOnMouseUp: true });
      }
    } else if (e.button === 1 || e.button === 2) {
      state.orbitDrag = { lastX: e.clientX, lastY: e.clientY, button: e.button };
      // Pedido do usuário: "No modo Modelador, ao clicar com o botão do
      // meio do mouse para mover a câmera, deve ser o cursor infinito." —
      // mesma técnica já usada nos modais G/R/S/Extrudar (Pointer Lock +
      // cursor falso, ver `_onMouseMove`/`_updateFakeCursor` abaixo) — sem
      // isso, girar a câmera bate na borda física da tela e trava o arrasto.
      // Só pro botão do MEIO (pedido explícito) — o botão DIREITO também
      // gira a câmera quando arrastado, mas também SELECIONA num clique
      // simples (ver `_onMouseUp`); travar o ponteiro nele mudaria esse
      // clique simples de comportamento (o cursor "sumiria" mesmo sem
      // arrastar), então fica de fora.
      if (e.button === 1) {
        // Pedido do usuário (rodada 44, sobre o cursor infinito ainda não
        // ficar "contínuo" na vertical): "acredito que é uma limitação do
        // Three.js. Dá para contornar isso de algum jeito?" Não é bem do
        // Three.js (que nem participa dessa conta — `movementX/Y` vêm
        // direto do navegador) — é uma característica bem documentada do
        // Pointer Lock em si: por padrão, o sistema operacional ainda
        // aplica a curva de aceleração/precisão do mouse ("mouse
        // ballistics", inclusive a opção "Enhance pointer precision" do
        // Windows) nos deltas reportados, mesmo com o cursor travado/
        // escondido — e essa curva tende a AMORTECER movimentos rápidos e
        // grandes, o que se percebe muito mais na vertical (arrastar pra
        // cima/baixo tende a ser um gesto mais curto e mais rápido que
        // girar de um lado pro outro, então a curva "pesa" mais ali,
        // dando a sensação de bater num teto/chão invisível). O Chromium
        // tem uma opção JUSTAMENTE pra isso — `requestPointerLock({
        // unadjustedMovement: true })`, disponível desde a versão 88 —
        // que pede os deltas BRUTOS do dispositivo, sem essa curva, dando
        // um giro de verdade "1 pra 1" e contínuo nos dois eixos. Cai pra
        // trás (sem as opções, `undefined`) em navegadores/versões que não
        // suportam — não trava nada, só volta a ter a curva padrão.
        const tryLock = () => {
          try {
            const p = state.canvas.requestPointerLock?.({ unadjustedMovement: true });
            // Em alguns navegadores `requestPointerLock` com opções retorna
            // uma Promise que REJEITA se `unadjustedMovement` não for
            // suportado (em vez de simplesmente ignorar a opção) — nesse
            // caso, tenta de novo sem opção nenhuma (comportamento antigo,
            // com a curva do SO, melhor que cursor nenhum travado).
            if (p && typeof p.catch === 'function') {
              p.catch(() => { try { state.canvas.requestPointerLock?.(); } catch (err) { /* ignora */ } });
            }
          } catch (err) {
            try { state.canvas.requestPointerLock?.(); } catch (err2) { /* funciona sem pointer lock também, só sem o cursor "infinito" */ }
          }
        };
        tryLock();
        // Correção defensiva já existente (rodada 43): Chromium impõe um
        // pequeno "resfriamento" depois de sair do Pointer Lock (ver
        // `exitPointerLock` no `_onMouseUp` abaixo) antes de aceitar travar
        // de novo — arrastar, soltar e arrastar rápido pode cair nesse
        // intervalo e falhar caladinho. Tenta de novo uma vez, pouco depois.
        setTimeout(() => { if (document.pointerLockElement !== state.canvas && state.orbitDrag) tryLock(); }, 60);
      }
    }
  },

  _onMouseMove(state, e) {
    const rect = state.canvas.getBoundingClientRect();
    // "Cursor infinito" (pedido do usuário: "As coisas que são feitas com o
    // cursor, no modo Modelador, devem ser com o cursor infinito (Extrudar,
    // por exemplo)") — igual ao Blender: arrastar G/R/S/Extrude não deveria
    // travar quando o cursor real bate na borda da tela. Enquanto um modal
    // está travando o ponteiro (ver `_startModal`/`_confirmModal`/
    // `_cancelModal`), o cursor OS fica escondido/fixo, mas os eventos de
    // `mousemove` continuam chegando com `movementX/Y` (o DESLOCAMENTO
    // daquele quadro) — acumula isso num cursor VIRTUAL (`state.mouse.vx/vy`)
    // que pode passar longe dos limites da tela sem problema nenhum (é só um
    // número usado pra matemática de raycasting, não uma posição real na
    // tela). Fora de um modal (ponteiro livre, sem lock), vx/vy acompanham
    // clientX/clientY normalmente.
    if (document.pointerLockElement === state.canvas) {
      state.mouse.vx = (state.mouse.vx ?? e.clientX) + e.movementX;
      state.mouse.vy = (state.mouse.vy ?? e.clientY) + e.movementY;
    } else {
      state.mouse.vx = e.clientX;
      state.mouse.vy = e.clientY;
    }
    state.mouse.x = ((state.mouse.vx - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((state.mouse.vy - rect.top) / rect.height) * 2 + 1;
    if (Math.hypot(e.clientX - state.mouse.downX, e.clientY - state.mouse.downY) > 4) state.mouse.moved = true;
    this._updateFakeCursor(state, rect);

    if (state.modal) { this._updateModal(state, e); return; }
    if (state.orbitDrag) {
      // Com o Pointer Lock ativo (ver `_onMouseDown` acima), `clientX/Y`
      // FICAM PARADOS (o cursor real nem se move) — o deslocamento de
      // verdade vem só de `movementX/Y` (mesma ideia do `vx/vy` logo
      // acima). Sem Pointer Lock (`requestPointerLock` falhou/indisponível),
      // volta pro cálculo antigo por posição.
      const locked = document.pointerLockElement === state.canvas;
      const dx = locked ? (e.movementX || 0) : e.clientX - state.orbitDrag.lastX;
      const dy = locked ? (e.movementY || 0) : e.clientY - state.orbitDrag.lastY;
      state.orbitDrag.lastX = e.clientX; state.orbitDrag.lastY = e.clientY;
      // Pedido do usuário (Shift+MMB, igual ao Blender): "ao segurar shift e
      // mover a câmera com o botão do meio do mouse, ela deve se deslocar
      // lateralmente... num plano paralelo ao plano da tela da câmera" — e,
      // reformulado depois (rodada 43): "a câmera fica apontada para um
      // ponto fixo, certo? Então, ao combinar shift+MMB este ponto
      // juntamente com a câmera movem-se". No Modelador (diferente da
      // navegação normal, `view3d.js`, que não tem um "ponto fixo" literal)
      // o modo órbita tem literalmente esse ponto (`state.orbit.target`) —
      // então panorâmica aqui é TRANSLADAR esse alvo (a posição da câmera é
      // sempre recalculada a partir dele em `_updateOrbitCamera`, então ela
      // acompanha automaticamente). No modo Livre, não há alvo separado —
      // translada a própria posição da câmera (`state.freeCam`). Só pro
      // botão do MEIO (`state.orbitDrag.button === 1`) + Shift — arrastar só
      // com o botão do meio (sem Shift) ou com o direito continua girando,
      // como antes.
      if (state.orbitDrag.button === 1 && e.shiftKey) {
        const THREE = state.THREE;
        const right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
        state.camera.matrixWorld.extractBasis(right, up, fwd);
        // Mesma fórmula/sinais/velocidade já usados em `view3d.js` pro
        // Shift+MMB da navegação normal (ver comentário lá — "agarrar e
        // arrastar" tipo Blender/Google Maps: arrastar pra direita desloca o
        // alvo pra esquerda; arrastar pra baixo desloca o alvo pra cima).
        const PAN_SPEED = 0.012;
        const panX = -right.x * dx + up.x * dy;
        const panY = up.y * dy;
        const panZ = -right.z * dx + up.z * dy;
        const pt = (state.camPosMode === 'free' && state.freeCam) ? state.freeCam : state.orbit.target;
        pt.x += panX * PAN_SPEED;
        pt.y += panY * PAN_SPEED;
        pt.z += panZ * PAN_SPEED;
        return;
      }
      // Pedido do usuário (câmera livre): arrastar continua girando a MIRA
      // (não mais em torno de um alvo fixo — ver `Modeler3D._updateFreeCamera`)
      // — mesmo arrasto do botão direito/meio, só que aplicado a
      // `state.freeCam.yaw/pitch` em vez de `state.orbit.yaw/pitch` quando
      // `camPosMode === 'free'`.
      //
      // Pedido do usuário (rodada 43, correção): "No modo de posicionamento
      // da câmera 'livre', o movimentar horizontal está invertido." Causa
      // raiz: aqui embaixo o yaw usava `-= dx`, sinal certo pro modo Órbita
      // (`state.orbit.yaw` é o ângulo do DESLOCAMENTO da câmera em relação
      // ao alvo, não pra onde ela está olhando — arrastar pra direita tem
      // que girar esse deslocamento na direção oposta pra a câmera parecer
      // girar pra a direita ao redor do alvo). Mas no modo Livre,
      // `state.freeCam.yaw` é usado DIRETO como a direção real pra onde a
      // câmera aponta (mesma convenção de `view3d.js` `this._camera.yaw`,
      // que usa `+= dx` — ver `onMouseMove` lá) — pegar o sinal do Órbita
      // emprestado fazia a câmera Livre virar ao CONTRÁRIO de pra onde o
      // mouse arrasta, e como o WASD sempre anda relativo a PRA ONDE a
      // câmera está de fato olhando (`cameraForwardFlat/cameraRightFlat`,
      // ver `Modeler3D._updateFreeCamera`), girar ao contrário do esperado
      // faz o deslocamento inteiro parecer invertido (o jogador pensa que
      // está olhando num sentido, mas está no oposto). Corrigido separando
      // o sinal por modo.
      const isFree = state.camPosMode === 'free' && state.freeCam;
      const target = isFree ? state.freeCam : state.orbit;
      target.yaw += (isFree ? 1 : -1) * dx * 0.006;
      target.pitch = Math.max(-1.5, Math.min(1.5, target.pitch + dy * 0.006));
    }
  },

  /** "Cursor infinito" (parte visual — ver comentário grande em
   *  modeler-render.js `buildSceneObjects`, onde `state.fakeCursorEl` é
   *  criado): o cursor OS de verdade fica ESCONDIDO pelo próprio Pointer
   *  Lock enquanto travado — este cursor FALSO aparece no lugar dele,
   *  posicionado com o cursor VIRTUAL (`state.mouse.vx/vy`, sem limite)
   *  "dobrado" (módulo) dentro dos limites do canvas — pedido do usuário:
   *  "o cursor deve continuar aparecendo como se saísse de um lado da tela e
   *  reaparecesse do outro". O WRAP é só NESTA posição visual — a conta de
   *  verdade (`state.mouse.x/y`, usada por `_rayFromMouse`) continua vindo
   *  de `vx/vy` SEM módulo nenhum, sem descontinuidade, exatamente como
   *  pedido ("continuando com o reposicionamento contínuo do que estiver
   *  acontecendo no app"). */
  _updateFakeCursor(state, rect) {
    const el = state.fakeCursorEl;
    if (!el) return;
    const locked = document.pointerLockElement === state.canvas;
    if (!locked) { el.style.display = 'none'; return; }
    const wrapX = (((state.mouse.vx - rect.left) % rect.width) + rect.width) % rect.width;
    const wrapY = (((state.mouse.vy - rect.top) % rect.height) + rect.height) % rect.height;
    el.style.display = 'block';
    el.style.left = wrapX + 'px';
    el.style.top = wrapY + 'px';
  },

  _onMouseUp(state, e) {
    if (state.modal && state.modal.endOnMouseUp && e.button === 0) { this._confirmModal(state); return; }
    if (e.button === 1) {
      state.orbitDrag = null;
      // Desfaz o Pointer Lock pedido em `_onMouseDown` (cursor infinito) —
      // mesmo idioma já usado pra sair dos modais G/R/S (ver `_cancelModal`).
      if (document.pointerLockElement === state.canvas) { try { document.exitPointerLock(); } catch (err) { /* ignora */ } }
      return;
    }
    if (e.button === 2) {
      // "Botão direito seleciona" (pedido do usuário) — só conta como
      // SELEÇÃO se o botão direito não foi ARRASTADO (senão era órbita de
      // câmera, ver _onMouseDown/_onMouseMove) — mesmo limiar de 4px usado
      // pra distinguir clique de arraste em qualquer botão.
      const eraArraste = state.mouse.moved;
      state.orbitDrag = null;
      if (!eraArraste) this._handleSelectClick(state, e);
      return;
    }
  },

  _onWheel(state, e) {
    e.preventDefault();
    // Câmera livre (pedido do usuário — ver `Modeler3D._updateFreeCamera`):
    // não existe "distância de um alvo" pra dar zoom, então a roda passa a
    // mover a câmera pra FRENTE/TRÁS na direção que ela está olhando de
    // verdade (incluindo o pitch — `cameraForward`, não a versão achatada
    // do WASD), igual a um "acelerador" de voo comum em editores 3D.
    if (state.camPosMode === 'free' && state.freeCam) {
      const fwd = window.Cam3DMath.cameraForward(state.freeCam);
      const step = -Math.sign(e.deltaY) * 0.4;
      state.freeCam.x += fwd.x * step;
      state.freeCam.y += fwd.y * step;
      state.freeCam.z += fwd.z * step;
      return;
    }
    state.orbit.dist = Math.max(0.5, Math.min(20, state.orbit.dist * (1 + Math.sign(e.deltaY) * 0.1)));
  },

  // ==================== seleção ====================

  _handleSelectClick(state, e) {
    if (state.mode === 'object') {
      state.objectSelected = ModelerRender.pickObjectAtScreen(state, e.clientX, e.clientY);
      return;
    }
    const additive = e.shiftKey;
    const hit = ModelerRender.pickElementAtScreen(state, e.clientX, e.clientY);
    if (!hit) { if (!additive) this._deselectAll(state); return; }
    if (hit.type === 'vertex') this._toggleSel(state, 'verts', hit.index, additive);
    else if (hit.type === 'edge') this._toggleSel(state, 'edges', hit.index, additive);
    // REVERTIDO (03/09/2026) — pedido do usuário: "Ao selecionar o 'Modo
    // Edição', e deixando selecionado 'Face', não está dando para selecionar
    // uma face única ou uma por vez. Todas acabam por ser selecionadas por
    // algum motivo." Causa raiz: a mudança de 01/09/2026 logo abaixo
    // (`_toggleSelLinkedFaces`, comentário antigo preservado ali) passou a
    // selecionar TODAS as faces do componente conectado a cada clique — como
    // a malha inteira normalmente é um único componente conectado (ex.: um
    // cubo comum), isso na prática selecionava sempre TODAS as faces, nunca
    // uma só, exatamente o bug relatado. Face agora usa o MESMO mecanismo de
    // seleção único/toggle de vértice e aresta (`_toggleSel`) — clique normal
    // troca a seleção pra só aquela face; Shift+clique soma/remove só ela da
    // seleção (multi-seleção manual continua funcionando, uma de cada vez).
    else this._toggleSel(state, 'faces', hit.index, additive);
  },

  /** NÃO CHAMADA MAIS (03/09/2026) — ver comentário grande em
   *  `_handleSelectClick` acima pro motivo (virou o bug relatado "todas as
   *  faces acabam selecionadas"). Mantida aqui (não removida) só porque
   *  ainda pode ser útil como base pra um "selecionar faces ligadas"
   *  DELIBERADO no futuro (ex.: um atalho tipo "L" do Blender), mas não é
   *  mais chamada pelo clique normal de seleção.
   *  Seleciona (ou soma à seleção, se `additive`) TODAS as faces do
   *  componente conectado que contém `faceIndex` — ver `_toggleSel`
   *  (mesma máquina de "ativo"/substituir vs somar), só que aplicada a um
   *  GRUPO de faces de uma vez em vez de uma só. */
  _toggleSelLinkedFaces(state, faceIndex, additive) {
    const linked = ModelerMesh.connectedFacesFrom(state, faceIndex);
    if (!additive) { state.sel.faces.clear(); linked.forEach((fi) => state.sel.faces.add(fi)); return; }
    // Shift+clique: mesmo espírito de toggle de `_toggleSel` (soma se não
    // tava lá, remove se já tava) — aqui aplicado ao GRUPO inteiro de uma
    // vez: se TODAS as faces do objeto já estavam selecionadas, o clique
    // desseleciona o grupo inteiro; senão, seleciona (soma) o grupo
    // inteiro — nunca fica "meio selecionado" por um Shift+clique só.
    const jaTodasSelecionadas = [...linked].every((fi) => state.sel.faces.has(fi));
    if (jaTodasSelecionadas) linked.forEach((fi) => state.sel.faces.delete(fi));
    else linked.forEach((fi) => state.sel.faces.add(fi));
  },

  /** `additive=false`: substitui a seleção pelo elemento clicado (não
   *  desseleciona clicando de novo no mesmo — igual ao Blender). O
   *  vértice/aresta clicado por último vira o "ativo" (branco — pedido do
   *  usuário), os outros da seleção ficam amarelos. */
  _toggleSel(state, kind, idx, additive) {
    const set = state.sel[kind];
    if (!additive) {
      set.clear();
      if (kind === 'verts') state.selOrder.verts = [];
      set.add(idx);
      if (kind === 'verts') { state.selOrder.verts.push(idx); state.activeVertex = idx; }
      if (kind === 'edges') state.activeEdge = idx;
    } else if (set.has(idx)) {
      set.delete(idx);
      if (kind === 'verts') {
        state.selOrder.verts = state.selOrder.verts.filter((i) => i !== idx);
        if (state.activeVertex === idx) state.activeVertex = state.selOrder.verts[state.selOrder.verts.length - 1] ?? null;
      }
      if (kind === 'edges' && state.activeEdge === idx) { const rest = [...set]; state.activeEdge = rest.length ? rest[rest.length - 1] : null; }
    } else {
      set.add(idx);
      if (kind === 'verts') { state.selOrder.verts.push(idx); state.activeVertex = idx; }
      if (kind === 'edges') state.activeEdge = idx;
    }
  },

  _isAllSelected(state) {
    if (state.selectMode === 'vertex') return state.cm.vertices.length > 0 && state.sel.verts.size === state.cm.vertices.length;
    if (state.selectMode === 'edge') return state.cm.edges.length > 0 && state.sel.edges.size === state.cm.edges.length;
    return state.cm.faces.length > 0 && state.sel.faces.size === state.cm.faces.length;
  },

  /** Tecla "A" sozinha — pedido do usuário: "apenas, seleciona/deseleciona
   *  tudo" — TOGGLE: se nem tudo estiver selecionado, seleciona tudo; se já
   *  estiver tudo selecionado, deseleciona tudo. */
  _selectAllToggle(state) {
    if (this._isAllSelected(state)) this._deselectAll(state);
    else this._selectAll(state);
  },

  _selectAll(state) {
    if (state.selectMode === 'vertex') {
      state.sel.verts = new Set(state.cm.vertices.map((_, i) => i));
      state.selOrder.verts = state.cm.vertices.map((_, i) => i);
      state.activeVertex = state.selOrder.verts[state.selOrder.verts.length - 1] ?? null;
    } else if (state.selectMode === 'edge') {
      state.sel.edges = new Set(state.cm.edges.map((_, i) => i));
      state.activeEdge = state.cm.edges.length ? state.cm.edges.length - 1 : null;
    } else {
      state.sel.faces = new Set(state.cm.faces.map((_, i) => i));
    }
  },

  _deselectAll(state) {
    state.sel.verts.clear(); state.sel.edges.clear(); state.sel.faces.clear();
    state.selOrder.verts = [];
    state.activeVertex = null; state.activeEdge = null;
  },

  setSelectMode(state, m) {
    state.selectMode = m;
    ModelerUI.updateToolbarActive(state);
    ModelerUI.updateNPanel(state);
  },

  /** Modo Objeto = "mover, girar e organizar objetos inteiros na cena"; Modo
   *  Edição = "esculpir e modificar a forma e a geometria de um objeto
   *  específico" (redação pedida pelo usuário — ver também os tooltips em
   *  modeler-ui.js). */
  toggleMode(state) {
    state.mode = state.mode === 'object' ? 'edit' : 'object';
    if (state.mode === 'object') this._deselectAll(state);
    else state.objectSelected = false;
    ModelerUI.updateToolbarActive(state);
    ModelerUI.updateNPanel(state);
    Utils.toast?.(state.mode === 'edit' ? '🔧 Modo Edição — esculpir a geometria do objeto' : '🧊 Modo Objeto — mover/girar/organizar o objeto inteiro', { duration: 1600 });
  },

  /** Pedido do usuário: "Deve ter um botão para alternar entre os modos de
   *  posicionamento da câmera" — chamado pelo botão da toolbar (ver
   *  modeler-ui.js). A conversão de pose em si (Orbital<->Livre) mora em
   *  `Modeler3D.toggleCamPosMode` (modeler-core.js, junto com o resto da
   *  matemática de câmera do Modelador) — este é só o ponto de entrada
   *  chamado pela UI, no mesmo padrão de `toggleMode` acima. */
  toggleCamPosMode(state) {
    window.Modeler3D.toggleCamPosMode(state);
  },

  // ==================== modal G/R/S ====================

  _startModal(state, type, opts = {}) {
    if (state.mode === 'edit' && !ModelerMesh.selectedVertexIndices(state).length) {
      Utils.toast?.('Nada selecionado.', { type: 'warn', duration: 1400 });
      return;
    }
    // Pedido do usuário: "O CTRL+Z/CTRL+Y deve funcionar também" — empilha o
    // estado ANTES de começar a arrastar (ver ModelerMesh.pushUndo/undo/redo)
    // — mesmo se o usuário cancelar com Esc depois (sem mudar nada de
    // verdade), fica só uma entrada "vazia" inofensiva na pilha, sem custo
    // real. `opts.skipUndoPush`: usado por triggerExtrude/triggerDuplicate,
    // que já empilham o "antes" ELES MESMOS, ANTES de mutar a malha (extrude/
    // duplicate já mudam `state.cm` antes de chamar `_startModal` — empilhar
    // aqui de novo pegaria o estado ERRADO, já mutado).
    // Rótulo pro histórico (01/09/2026, ver ModelerMesh.pushUndo/_logAction).
    if (!opts.skipUndoPush) ModelerMesh.pushUndo(state, type === 'G' ? 'Mover' : type === 'R' ? 'Girar' : 'Escalar');
    // Pedido do usuário — "cursor infinito": trava o ponteiro no canvas
    // assim que um arrasto modal (G/R/S/Extrude/Duplicate) começa —
    // `requestPointerLock()` PRECISA ser chamado de dentro de um gesto do
    // usuário (tecla ou clique, que é sempre o caso aqui: `_onKeyDown`/
    // `_onMouseDown`) — depois disso, `_onMouseMove` passa a acumular
    // `movementX/Y` num cursor virtual sem limite de tela (ver lá). Ignorado
    // silenciosamente se o navegador recusar (ex.: sem suporte) — nesse caso
    // o modal simplesmente continua funcionando do jeito antigo, limitado
    // pela borda da tela.
    // BUG relatado pelo usuário: "Ao pressionar a letra S... deve começar a
    // aplicar escala... de acordo com o movimento feito desde que se
    // pressionou a tecla S. Atualmente, quando se aplica esse recurso em um
    // objeto. Depois, em outro objeto, tenta-se aplicar esse recurso...
    // acaba por aumentar abruptamente." Causa raiz: `startClient` (usado por
    // S e por R "livre", sem eixo travado — ver `_updateModal`, `dx =
    // state.mouse.vx - m.startClient.x`) vinha de `state.mouse.downX/downY`
    // — a posição do ÚLTIMO CLIQUE de mouse de verdade (mousedown), não de
    // onde o cursor está AGORA, no instante em que G/R/S é pressionado (um
    // atalho de TECLADO, sem exigir clique nenhum). Se o cursor tiver se
    // afastado desse último clique (comum ao repetir a operação num objeto
    // diferente, sem clicar de novo perto dali antes de apertar S de novo),
    // `dx` já nasce longe de 0 — a escala pula abruptamente assim que a
    // tecla é apertada, ANTES de qualquer arrasto de verdade. CORRIGIDO:
    // usa `state.mouse.vx/vy` (a posição REAL conhecida mais recente do
    // cursor — ver `_onMouseMove`, sempre atualizada a cada movimento de
    // mouse de verdade, travado ou não) como ponto de partida — cai pra
    // `downX/downY` só no caso extremo de nenhum `mousemove` ter acontecido
    // ainda nesta sessão (`vx`/`vy` ainda `undefined`).
    const startX = state.mouse.vx ?? state.mouse.downX ?? 0;
    const startY = state.mouse.vy ?? state.mouse.downY ?? 0;
    state.mouse.vx = undefined; state.mouse.vy = undefined;
    try { state.canvas.requestPointerLock?.(); } catch (err) { /* ignora — modal funciona sem pointer lock também */ }
    const idxs = state.mode === 'edit' ? ModelerMesh.selectedVertexIndices(state) : null;
    state.modal = {
      type,
      axis: opts.axis || null,
      endOnMouseUp: !!opts.endOnMouseUp,
      pivot: ModelerGizmo.worldPivot(state),
      snapshotVerts: idxs ? idxs.map((i) => ({ i, pos: state.cm.vertices[i].slice() })) : null,
      snapshotGroup: state.mode === 'object' ? { pos: state.group.position.clone(), xf: { ...state.xform } } : null,
      startClient: { x: startX, y: startY },
      lastMouseClient: { x: startX, y: startY },
    };
    this._recomputeModalStart(state);
  },

  _recomputeModalStart(state) {
    const m = state.modal;
    const THREE = state.THREE;
    // Pedido do usuário (rodada 46): "Alguma coisa está havendo, pois
    // quando move para muito longe a posição do objeto, em vez de continuar
    // indo para mais longe, começa a voltar no eixo selecionado." — ver
    // `_axisDragDelta` mais abaixo pra causa raiz completa e a correção
    // (técnica nova, incremental, por projeção em tela — substitui
    // `m.axisT0`/`_closestTOnAxis` pro arrasto de EIXO TRAVADO de G e S).
    // `axisAccumT` é o acumulador dessa técnica nova — "quantas unidades de
    // mundo (G) ou 'passos' de escala (S) já foram arrastados ao longo do
    // eixo travado" — sempre reiniciado em ZERO aqui, tanto ao começar um
    // arrasto quanto ao TROCAR de eixo no meio dele (mesmo comportamento de
    // sempre: trocar de eixo recomeça a medição do zero, a partir de onde o
    // mouse está AGORA, sobre a POSIÇÃO/ESCALA original do início do
    // arrasto — ver `_applyMoveDelta`/`_applyScaleDelta`, que somam/
    // multiplicam sempre em cima do `snapshotGroup`/`snapshotVerts`
    // tirado em `_startModal`, nunca de um valor "atual" intermediário).
    m.axisAccumT = 0;
    m.axisStartRay = this._rayFromMouse(state);
    if (m.axis) {
      const axisDir = new THREE.Vector3(m.axis === 'x' ? 1 : 0, m.axis === 'y' ? 1 : 0, m.axis === 'z' ? 1 : 0);
      m.axisT0 = this._closestTOnAxis(state, m.pivot, axisDir, m.axisStartRay);
    } else {
      const plane = new THREE.Plane();
      const normal = new THREE.Vector3().subVectors(state.camera.position, m.pivot).normalize();
      plane.setFromNormalAndCoplanarPoint(normal, m.pivot);
      m.planeStart = new THREE.Vector3();
      m.axisStartRay.intersectPlane(plane, m.planeStart);
    }
    // Pedido do usuário (28/08/2026) sobre girar pelo GIZMO: "Clicar com o
    // mouse no círculo verde... só habilita que o giro deverá ser no plano
    // perpendicular ao eixo y. É como ter um ponto na borda desse círculo...
    // pegá-lo e girá-lo. O que o cursor do mouse faz é 'controlar esse
    // ponto'." — e depois: "o centro desse círculo... é a origem do objeto
    // (coordenada local 0,0,0)... representada por um círculo 7x7."
    //
    // Rodada seguinte, pedido REFINADO: "considera-se um outro círculo
    // imaginário, formado pela posição do cursor na tela (borda do círculo)
    // e o centro do objeto (centro desse outro círculo imaginário)... No
    // clicar e arrastar, uma volta do cursor ao redor do centro do objeto
    // deve equivaler a uma volta do objeto em torno do seu próprio centro no
    // eixo selecionado." Trocado o cálculo do ângulo (ver `_updateModal`,
    // tipo 'R' com eixo travado) de INTERSEÇÃO 3D raio×plano (instável perto
    // de ângulos de câmera "de raspão", quase de perfil com o anel) pra um
    // círculo IMAGINÁRIO 2D DE TELA — centro = projeção em tela do pivô
    // (`m.pivot`), "borda" = onde o cursor está — o ÂNGULO desse círculo em
    // tela (`atan2` simples) é medido a cada quadro; a "volta do cursor"
    // vira DIRETAMENTE a "volta do objeto" (ver `m.rotFacingSign`, calculado
    // com o sinal certo pra o ponto agarrado seguir o cursor, não o
    // contrário). Reseta o "ponto de referência" (agora um ÂNGULO de tela,
    // não mais um vetor 3D) sempre que o eixo é (re)travado — o centro do
    // círculo já é `m.pivot` (mesmo ponto do gizmo/bolinha de origem, ver
    // ModelerGizmo.worldPivot), não precisa de nada novo aqui além de zerar.
    m.rotScreenRef = null;
    m.rotAccum = 0;
    // Pedido do usuário (rodada seguinte): "Os giros... são com base nas
    // coordenadas de mundo... Não há um gimbal fixo... esse eixo
    // selecionado é sempre paralelo ao eixo respectivo nas coordenadas do
    // mundo." — ver comentário grande em `_applyRotateDelta` pra explicação
    // completa da correção. Aqui só tira a "foto" da orientação ATUAL do
    // objeto (quaternion completo, já incluindo o ângulo base de
    // posicionamento no mapa + qualquer giro anterior desta mesma sessão)
    // toda vez que um eixo é travado/destravado/trocado — inclusive ao
    // alternar pra R "livre" (sem eixo, `m.axis` vira `null`) — é a partir
    // DESTA foto que o próximo giro (em torno do eixo travado, ou do Y por
    // padrão se ficar livre) vai ser aplicado, sempre em cima da orientação
    // mundial verdadeira, nunca via soma de ângulos de Euler (que é o que
    // causava o "gimbal fixo" indesejado).
    if (m.type === 'R' && state.mode === 'object' && state.group) m.rotStartQuat = state.group.quaternion.clone();
  },

  _rayFromMouse(state) {
    state.raycaster.setFromCamera({ x: state.mouse.x, y: state.mouse.y }, state.camera);
    return state.raycaster.ray;
  },

  /** Projeta um ponto de MUNDO pra coordenadas de TELA em espaço de CLIENTE
   *  (mesmo referencial de `e.clientX/clientY`/`state.mouse.vx/vy` — soma o
   *  `rect.left/top`, já que `ModelerRender._projectWorld` devolve
   *  coordenadas relativas ao CANVAS, começando em 0,0 no canto dele, não na
   *  tela toda). `null` se o ponto está atrás da câmera (mesma regra de
   *  `_projectWorld`). Usado pelo círculo imaginário de rotação (`_updateModal`,
   *  tipo 'R') e pela linha tracejada até o pivô (modeler-render.js). */
  _projectScreenClient(state, worldVec3, rect) {
    const p = ModelerRender._projectWorld(state, worldVec3, rect.width, rect.height);
    if (!p) return null;
    return { x: rect.left + p.x, y: rect.top + p.y };
  },

  _closestTOnAxis(state, pivot, axisDir, ray) {
    const d1 = axisDir, d2 = ray.direction;
    const r = new state.THREE.Vector3().subVectors(pivot, ray.origin);
    const a = d1.dot(d1), b = d1.dot(d2), c = d2.dot(d2), d = d1.dot(r), e = d2.dot(r);
    const denom = a * c - b * b;
    if (Math.abs(denom) < 1e-6) return 0;
    return (b * e - c * d) / denom;
  },

  /** Sensibilidade (pixels de TELA por unidade de MUNDO) e direção EM TELA
   *  do eixo `axisDir`, medida num ponto específico (`point`) — não é uma
   *  constante do início do arrasto, é recalculada a cada quadro/chamada, a
   *  partir da projeção em tela de verdade (câmera/perspectiva atuais).
   *  Sonda um passinho pequeno (`EPS`, unidades de mundo) a partir de
   *  `point` na direção do eixo e mede quanto isso se deslocou em tela.
   *  Devolve `null` se o eixo, dali, está de "ponta" pra câmera (os dois
   *  pontos da sonda projetam quase no mesmo lugar em tela — sensibilidade
   *  zero) ou se algum dos dois pontos está atrás da câmera.
   *
   *  Pedido do usuário (rodada 46, 2 problemas resolvidos por esta MESMA
   *  função — ver uso em `_updateModal`, tipos G/S com eixo travado):
   *
   *  1) "quando move para muito longe a posição do objeto, em vez de
   *  continuar indo para mais longe, começa a voltar no eixo selecionado."
   *  Causa raiz da versão anterior (`_closestTOnAxis`, ponto mais próximo
   *  entre a reta do eixo e a reta do raio da câmera): essa fórmula tem uma
   *  singularidade matemática quando o RAIO fica quase PARALELO ao eixo
   *  (`b = d1·d2` se aproxima de ±1, o denominador `1-b²` se aproxima de
   *  zero) — e isso acontece EXATAMENTE quando se arrasta bem longe: um
   *  raio "perseguindo" um ponto cada vez mais distante na mesma reta fica,
   *  ele mesmo, cada vez mais paralelo a ela. Perto dali, uma variação
   *  mínima de ângulo (inevitável, 1 pixel de mouse já muda o ângulo do
   *  raio um pouco) pode fazer o resultado explodir e, pior, TROCAR DE
   *  SINAL — dando exatamente a impressão de "start voltando". A técnica
   *  nova é 100% INCREMENTAL (nunca depende de raio×reta, só de "quantos
   *  pixels de tela equivalem a 1 unidade de mundo NESTE ponto, AGORA") —
   *  não existe divisão que se aproxima de zero por causa de ÂNGULO; na
   *  pior das hipóteses (eixo apontando EXATAMENTE pra câmera) a
   *  sensibilidade vai a zero (nenhum movimento de tela corresponde a
   *  mover dali, fisicamente correto — não dá pra perceber profundidade
   *  "de frente" mesmo) em vez de "explodir" e inverter.
   *
   *  2) "As variações devem ser conforme o nível de zoom [...] zoom
   *  próximo [...] grande movimentação do cursor produz bem pouco efeito
   *  [...] zoom distante [...] pequena movimentação deve produzir um
   *  efeito maior. Isso deve funcionar na escala também." Como a
   *  sensibilidade (`pxPerWorld`) é recalculada AGORA, a cada quadro, a
   *  partir da projeção em tela de verdade, ela já vem automaticamente
   *  MAIOR (mais pixels por unidade de mundo — mais pixels de arrasto
   *  necessários pra mover pouco) quando a câmera está perto (zoom
   *  próximo), e MENOR (menos pixels por unidade — pouco arrasto move
   *  bastante) quando a câmera está longe (zoom distante) — exatamente o
   *  pedido, de graça, sem precisar de nenhum fator extra de "zoom" além
   *  da própria perspectiva. */
  _screenAxisSensitivity(state, point, axisDir) {
    const rect = state.canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const pA = ModelerRender._projectWorld(state, point, w, h);
    const EPS = 0.05;
    const pB = ModelerRender._projectWorld(state, point.clone().addScaledVector(axisDir, EPS), w, h);
    if (!pA || !pB) return null;
    const sdx = pB.x - pA.x, sdy = pB.y - pA.y;
    const screenLen = Math.hypot(sdx, sdy);
    if (screenLen < 1e-4) return null;
    return { dirX: sdx / screenLen, dirY: sdy / screenLen, pxPerWorld: screenLen / EPS };
  },

  _updateModal(state, e) {
    const m = state.modal;
    // `state.mouse.vx/vy` (não `e.clientX/clientY`) — cursor VIRTUAL, sem
    // limite de tela enquanto o ponteiro está travado (ver comentário em
    // `_onMouseMove` — "cursor infinito").
    m.lastMouseClient = { x: state.mouse.vx, y: state.mouse.vy };
    const ray = this._rayFromMouse(state);
    if (m.type === 'G') {
      let worldDelta;
      const THREE = state.THREE;
      if (m.axis) {
        // Técnica nova (rodada 46) — ver `_screenAxisSensitivity` pra causa
        // raiz completa do bug antigo ("volta" ao arrastar muito longe) e
        // pro comportamento zoom-dependente pedido. `curPoint` é ONDE o
        // objeto está AGORA ao longo do eixo (pivô + o quanto já foi
        // acumulado) — recalcular a sensibilidade NESSE ponto, a cada
        // quadro, é o que faz tudo funcionar suave mesmo depois de arrastar
        // bem longe (a sensibilidade vai diminuindo conforme o ponto se
        // afasta da câmera, nunca "explode"/inverte).
        const axisDir = new THREE.Vector3(m.axis === 'x' ? 1 : 0, m.axis === 'y' ? 1 : 0, m.axis === 'z' ? 1 : 0);
        const curPoint = m.pivot.clone().addScaledVector(axisDir, m.axisAccumT || 0);
        const sens = this._screenAxisSensitivity(state, curPoint, axisDir);
        if (sens) {
          const movedPx = (e.movementX || 0) * sens.dirX + (e.movementY || 0) * sens.dirY;
          m.axisAccumT = (m.axisAccumT || 0) + movedPx / sens.pxPerWorld;
        }
        worldDelta = axisDir.clone().multiplyScalar(m.axisAccumT || 0);
      } else {
        const normal = new THREE.Vector3().subVectors(state.camera.position, m.pivot).normalize();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, m.pivot);
        const hit = new THREE.Vector3();
        worldDelta = ray.intersectPlane(plane, hit) ? hit.sub(m.planeStart) : new THREE.Vector3();
      }
      this._applyMoveDelta(state, worldDelta);
    } else if (m.type === 'R') {
      // Girar com um "círculo imaginário" em TELA (2D) — pedido do usuário
      // (ver comentário grande em `_recomputeModalStart`): "considera-se um
      // outro círculo imaginário, formado pela posição do cursor na tela
      // (borda do círculo) e o centro do objeto (centro desse outro círculo
      // imaginário)... uma volta do cursor ao redor do centro do objeto deve
      // equivaler a uma volta do objeto." Em vez de interseção 3D raio×plano
      // (versão anterior — sofria de instabilidade numérica perto de
      // ângulos de câmera "de raspão", quase de perfil com o anel, onde o
      // plano perpendicular ao eixo fica quase paralelo ao raio da câmera),
      // mede o ÂNGULO DE TELA (`Math.atan2`, 2D puro, sempre bem definido)
      // do cursor em volta da projeção em tela do pivô — a DIFERENÇA desse
      // ângulo entre um quadro e o anterior é, por definição, exatamente
      // "quanto o cursor girou ao redor do centro na tela", que é
      // diretamente acumulada como o ângulo de rotação do objeto — por
      // construção, 1 volta completa do cursor em tela = 2π acumulados = 1
      // volta completa do objeto, exatamente como pedido.
      if (m.axis) {
        const THREE = state.THREE;
        const axisDir = new THREE.Vector3(m.axis === 'x' ? 1 : 0, m.axis === 'y' ? 1 : 0, m.axis === 'z' ? 1 : 0);
        const rect = state.canvas.getBoundingClientRect();
        const pivotProj = this._projectScreenClient(state, m.pivot, rect);
        if (pivotProj) {
          const dxs = state.mouse.vx - pivotProj.x, dys = state.mouse.vy - pivotProj.y;
          // Ponto MUITO perto do centro do círculo imaginário (cursor quase
          // em cima da projeção do pivô) — o ângulo fica indefinido/instável
          // bem ali (mesmo problema que qualquer relógio teria com o
          // ponteiro no centro) — pedido do usuário não cobre esse caso
          // extremo; ignora o quadro (mantém o último ângulo válido) em vez
          // de arriscar um salto artificial.
          if (dxs * dxs + dys * dys > 4) {
            const thetaScreen = Math.atan2(dys, dxs);
            // `rotFacingSign`: se o eixo aponta mais pro lado da câmera ou
            // pro lado oposto (produto escalar do eixo com o vetor
            // pivô->câmera) MUDA o sentido em que girar o cursor em tela
            // corresponde a girar o objeto em torno do eixo travado
            // (imagine olhar um relógio de frente vs. por trás — o mesmo
            // giro dos ponteiros parece o sentido OPOSTO). Conferido à mão
            // (com um caso numérico concreto, câmera em 3/4 vista de cima):
            // sinal correto é o OPOSTO do lado da câmera em relação ao eixo.
            const camSide = axisDir.dot(new THREE.Vector3().subVectors(state.camera.position, m.pivot));
            const facingSign = camSide >= 0 ? -1 : 1;
            if (m.rotScreenRef != null) {
              let deltaTheta = thetaScreen - m.rotScreenRef;
              while (deltaTheta > Math.PI) deltaTheta -= Math.PI * 2;
              while (deltaTheta <= -Math.PI) deltaTheta += Math.PI * 2;
              m.rotAccum = (m.rotAccum || 0) + deltaTheta * facingSign;
            }
            m.rotScreenRef = thetaScreen;
          }
        }
        this._applyRotateDelta(state, m.rotAccum || 0, m.axis);
      } else {
        // Sem eixo travado (R "livre", pelo teclado, sem arrastar um anel do
        // gizmo) — simplificação já documentada (ver _applyRotateDelta):
        // gira em torno de Y usando o deslocamento horizontal do mouse
        // (cursor virtual — ver comentário em `_onMouseMove`).
        const dx = state.mouse.vx - m.startClient.x;
        this._applyRotateDelta(state, dx * 0.01, m.axis);
      }
    } else if (m.type === 'S') {
      if (m.axis) {
        // Pedido do usuário: "A mudança de escala do eixo Z, pelo gizmo,
        // está invertida. Os outros eixos devem seguir o mesmo sentido de
        // movimentação do mouse também, não ficarem invertidos." Causa raiz
        // confirmada: a versão anterior (`dx = mouse.vx - startClient.x`)
        // usava só o deslocamento HORIZONTAL da tela, pra QUALQUER eixo —
        // "arrastar pra direita sempre aumenta" — ignorando completamente
        // a direção de verdade de CADA eixo em tela (que depende do ângulo
        // da câmera: às vezes o eixo Z projeta quase na vertical, às vezes
        // na diagonal, às vezes com o sentido visualmente invertido em
        // relação ao eixo do mundo, dependendo de onde a câmera está
        // olhando) — daí Z (e potencialmente qualquer outro eixo, dependendo
        // do ângulo) podia ficar "de trás pra frente". Corrigido usando a
        // MESMA técnica nova do 'G' (`_screenAxisSensitivity`, ver ali pra
        // causa raiz completa): mede a direção EM TELA de verdade do eixo
        // (afastando-se do pivô), e usa só a componente do movimento do
        // mouse NESSA direção — arrastar "no sentido que o eixo aponta na
        // tela" sempre aumenta, na direção oposta sempre diminui, pra
        // QUALQUER eixo, em QUALQUER ângulo de câmera — nunca mais depende
        // de "direita = aumenta" fixo. De brinde, fica zoom-dependente
        // também (pedido: "Isso deve funcionar na escala também") — a
        // mesma sensibilidade recalculada a cada quadro.
        const THREE = state.THREE;
        const axisDir = new THREE.Vector3(m.axis === 'x' ? 1 : 0, m.axis === 'y' ? 1 : 0, m.axis === 'z' ? 1 : 0);
        const sens = this._screenAxisSensitivity(state, m.pivot, axisDir);
        if (sens) {
          const movedPx = (e.movementX || 0) * sens.dirX + (e.movementY || 0) * sens.dirY;
          m.axisAccumT = (m.axisAccumT || 0) + movedPx / sens.pxPerWorld;
        }
        // Curva exponencial (dobra a escala a cada "1 unidade" acumulada,
        // na mesma escala de comprimento usada pelo 'G') em vez da antiga
        // `1 + dx*k` linear — sempre positiva por construção (nunca precisa
        // de um "chão" artificial pra não ficar negativa), e simétrica pra
        // afastar/aproximar do pivô.
        const factor = Math.max(0.02, Math.pow(2, m.axisAccumT || 0));
        this._applyScaleDelta(state, factor, m.axis);
      } else {
        const dx = state.mouse.vx - m.startClient.x;
        this._applyScaleDelta(state, Math.max(0.02, 1 + dx * 0.006), m.axis);
      }
    }
    ModelerMesh.rebuildMeshGeometry(state);
    // Pedido do usuário: "Ao arrastar com o mouse, os valores devem ser
    // atualizados imediatamente nas propriedades." — antes o painel N só
    // era atualizado ao SOLTAR o arrasto (`_confirmModal`); agora atualiza
    // a cada quadro do arrasto também, pra Posição/Rotação/Escala
    // acompanharem em tempo real o que está sendo arrastado.
    ModelerUI.updateNPanel(state);
  },

  _applyMoveDelta(state, worldDelta) {
    if (state.mode === 'object') {
      const snap = state.modal.snapshotGroup.pos;
      state.group.position.set(snap.x + worldDelta.x, snap.y + worldDelta.y, snap.z + worldDelta.z);
    } else {
      const p0 = state.group.position.clone();
      const p1 = p0.clone().add(worldDelta);
      const l0 = state.group.worldToLocal(p0.clone());
      const l1 = state.group.worldToLocal(p1.clone());
      const localDelta = l1.sub(l0);
      state.modal.snapshotVerts.forEach(({ i, pos }) => {
        state.cm.vertices[i][0] = pos[0] + localDelta.x;
        state.cm.vertices[i][1] = pos[1] + localDelta.y;
        state.cm.vertices[i][2] = pos[2] + localDelta.z;
      });
    }
  },

  /** Pedido do usuário: "Os giros que são feitos eixo a eixo são com base
   *  nas coordenadas de mundo. Quando seleciona-se para girar no eixo x, o
   *  eixo x é considerado como primeiro eixo de giro [...] E quando
   *  seleciona-se o eixo z, o eixo z é considerado como primeiro eixo de
   *  giro. Não há um gimbal fixo. Todos os vértices devem girar em torno do
   *  eixo selecionado e esse eixo selecionado é sempre paralelo ao eixo
   *  respectivo nas coordenadas do mundo."
   *
   *  BUG encontrado (a versão anterior violava isso nos dois modos):
   *
   *  MODO OBJETO: `state.xform.rotX/rotY/rotZ` eram 3 ÂNGULOS DE EULER
   *  somados de forma independente e recompostos via `group.rotation.set(x,
   *  y, z)` — o Three.js aplica isso como uma composição INTRÍNSECA (ordem
   *  'XYZ': primeiro X, DEPOIS Y relativo ao resultado, DEPOIS Z relativo a
   *  esse novo resultado). Se o objeto já tinha um giro em X (de uma
   *  travada anterior) e o usuário travava Y numa NOVA travada, o "eixo Y"
   *  usado não era mais o eixo Y do MUNDO — era o eixo Y já inclinado pela
   *  rotação em X anterior (o clássico "gimbal": cada eixo novo gira em
   *  cima do resultado torto do eixo anterior, em vez de sempre em cima do
   *  eixo de mundo de verdade). CORRIGIDO: em vez de somar ângulos de
   *  Euler, cada travada de eixo agora aplica um QUATERNION de rotação em
   *  torno do eixo de MUNDO fixo (`Quaternion.setFromAxisAngle`),
   *  multiplicado PELA ESQUERDA no quaternion TOTAL que o objeto já tinha
   *  no instante em que o eixo foi travado (`m.rotStartQuat`, tirado em
   *  `_recomputeModalStart` — a "foto" de antes desta travada específica) —
   *  "multiplicar pela esquerda" é exatamente "aplicar uma rotação extra em
   *  cima do que já existia, em coordenadas de MUNDO, não do objeto" —
   *  então não importa quantas travadas de eixos diferentes já rolaram
   *  antes, CADA NOVA travada gira em torno do eixo de mundo de verdade,
   *  nunca um eixo "torto" por rotações anteriores. Depois de atualizar o
   *  quaternion de verdade (`state.group.quaternion`), os 3 campos
   *  `xform.rotX/rotY/rotZ` são recalculados a partir dele (só pra manter o
   *  painel N/undo/gravação — que continuam no formato Euler de sempre —
   *  em sincronia; a MATEMÁTICA em si não depende mais desses 3 campos
   *  durante o arrasto).
   *
   *  MODO EDIÇÃO: a versão anterior rotacionava os VÉRTICES em espaço
   *  LOCAL da malha, usando fórmulas de rotação em torno dos eixos LOCAIS
   *  (x/y/z do referencial do objeto) — errado pelo MESMO motivo: se o
   *  objeto já estava girado (rotX/rotY/rotZ não-zero), o eixo local X não
   *  aponta mais na direção do eixo X do mundo. CORRIGIDO: converte cada
   *  vértice pra espaço de MUNDO (`localToWorld`), gira em torno do PIVÔ
   *  (já em mundo) usando o eixo de MUNDO fixo com `Vector3.applyAxisAngle`
   *  (rotação de Rodrigues, em torno de uma direção fixa passando pela
   *  origem — por isso subtrai o pivô antes e soma de volta depois), e
   *  converte de volta pra LOCAL (`worldToLocal`) — funciona corretamente
   *  não importa a rotação/escala atual do objeto. */
  _applyRotateDelta(state, angle, axis) {
    const ax = axis || 'y'; // livre (sem eixo travado) simplificado pra girar em torno de Y — ver modeler-core.js cabeçalho
    const THREE = state.THREE;
    const axisDir = new THREE.Vector3(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0);
    if (state.mode === 'object') {
      const m = state.modal;
      const startQuat = m.rotStartQuat || state.group.quaternion.clone();
      const deltaQuat = new THREE.Quaternion().setFromAxisAngle(axisDir, angle);
      state.group.quaternion.copy(deltaQuat.multiply(startQuat)); // delta (mundo) * início — delta aplicado POR CIMA, em coordenadas de mundo
      const totalEuler = new THREE.Euler().setFromQuaternion(state.group.quaternion, 'XYZ');
      state.xform.rotX = totalEuler.x;
      state.xform.rotY = totalEuler.y - ModelerGizmo.objAnguloToRotY(state.obj.angulo); // tira a contribuição do ângulo de posicionamento no mapa (ver applyXformToGroup) — só sobra o giro "extra" do Modelador
      state.xform.rotZ = totalEuler.z;
      // group.scale não muda aqui — quaternion/escala são independentes na
      // matriz de transformação, não precisa reaplicar `applyXformToGroup`.
    } else {
      const pivotWorld = state.modal.pivot;
      state.modal.snapshotVerts.forEach(({ i, pos }) => {
        const worldPos = state.group.localToWorld(new THREE.Vector3(pos[0], pos[1], pos[2]));
        worldPos.sub(pivotWorld);
        worldPos.applyAxisAngle(axisDir, angle);
        worldPos.add(pivotWorld);
        const localPos = state.group.worldToLocal(worldPos);
        state.cm.vertices[i][0] = localPos.x;
        state.cm.vertices[i][1] = localPos.y;
        state.cm.vertices[i][2] = localPos.z;
      });
    }
  },

  _applyScaleDelta(state, factor, axis) {
    if (state.mode === 'object') {
      const snap = state.modal.snapshotGroup.xf;
      if (!axis || axis === 'x') state.xform.scaleX = snap.scaleX * factor;
      if (!axis || axis === 'y') state.xform.scaleY = snap.scaleY * factor;
      if (!axis || axis === 'z') state.xform.scaleZ = snap.scaleZ * factor;
      ModelerGizmo.applyXformToGroup(state);
    } else {
      const pivotLocal = state.group.worldToLocal(state.modal.pivot.clone());
      state.modal.snapshotVerts.forEach(({ i, pos }) => {
        const nv = pos.slice();
        if (!axis || axis === 'x') nv[0] = pivotLocal.x + (pos[0] - pivotLocal.x) * factor;
        if (!axis || axis === 'y') nv[1] = pivotLocal.y + (pos[1] - pivotLocal.y) * factor;
        if (!axis || axis === 'z') nv[2] = pivotLocal.z + (pos[2] - pivotLocal.z) * factor;
        state.cm.vertices[i] = nv;
      });
    }
  },

  _releasePointerLockIfOwned(state) {
    if (document.pointerLockElement === state.canvas) { try { document.exitPointerLock(); } catch (err) { /* ignora */ } }
    // Esconde o cursor falso na hora, sem esperar o próximo `mousemove`
    // (`pointerlockchange`/o navegador destravando o cursor real pode
    // demorar um instante, e sem isso o retículo falso ficaria visível
    // "grudado" no último lugar até o mouse se mexer de novo).
    if (state.fakeCursorEl) state.fakeCursorEl.style.display = 'none';
  },

  _confirmModal(state) {
    state.modal = null;
    this._releasePointerLockIfOwned(state);
    ModelerMesh.rebuildMeshGeometry(state);
    ModelerUI.updateNPanel(state);
  },

  _cancelModal(state) {
    const m = state.modal;
    if (!m) return;
    if (m.revertOnCancel) {
      state.cm = m.revertOnCancel.cm;
      state.sel = m.revertOnCancel.sel;
      state.selOrder = m.revertOnCancel.selOrder;
    } else if (state.mode === 'object' && m.snapshotGroup) {
      state.group.position.copy(m.snapshotGroup.pos);
      state.xform = { ...m.snapshotGroup.xf };
      ModelerGizmo.applyXformToGroup(state);
    } else if (m.snapshotVerts) {
      m.snapshotVerts.forEach(({ i, pos }) => { state.cm.vertices[i] = pos.slice(); });
    }
    state.modal = null;
    this._releasePointerLockIfOwned(state);
    ModelerMesh.rebuildMeshGeometry(state);
    ModelerUI.updateNPanel(state);
  },

  // ==================== comandos de malha (gatilhos, com toast/aviso) ====================

  triggerExtrude(state) {
    const snap = ModelerMesh.snapshotForRevert(state);
    ModelerMesh.pushUndo(state, 'Extrudar'); // ANTES de mutar — ver comentário em _startModal
    if (!ModelerMesh.extrude(state)) { Utils.toast?.('Selecione vértices/arestas/faces para extrudar.', { type: 'warn', duration: 1800 }); return; }
    this._startModal(state, 'G', { skipUndoPush: true });
    state.modal.revertOnCancel = snap;
    Utils.toast?.('Extrudar — mova o mouse, clique/Enter confirma, Esc cancela', { duration: 2200 });
  },

  triggerInset(state) {
    ModelerMesh.pushUndo(state, 'Inset Faces');
    if (!ModelerMesh.inset(state)) { Utils.toast?.('Inset Faces: selecione uma ou mais faces primeiro.', { type: 'warn', duration: 1800 }); return; }
    Utils.toast?.('Inset Faces aplicado (fator fixo 20%) ✓', { duration: 1800 });
  },

  triggerSubdivide(state) {
    ModelerMesh.pushUndo(state, 'Subdividir');
    if (!ModelerMesh.subdivide(state)) { Utils.toast?.('Subdividir: selecione uma ou mais faces (ou arestas) primeiro.', { type: 'warn', duration: 1800 }); return; }
    Utils.toast?.('Subdividido ✓', { duration: 1500 });
  },

  triggerMakeEdgeFace(state) {
    ModelerMesh.pushUndo(state, 'Criar Aresta/Face');
    const r = ModelerMesh.makeEdgeOrFace(state);
    if (!r.ok) {
      // `face-duplicada` (rodada seguinte): ver comentário grande em
      // `ModelerMesh.makeEdgeOrFace` — recusado de propósito, pra não criar
      // duas faces coincidentes (causa de "face piscando", z-fighting).
      const msg = r.reason === 'submodo' ? 'Make Edge/Face: mude para o Modo de Edição de Vértice (tecla 1) e selecione 2+ vértices.'
        : r.reason === 'face-duplicada' ? 'Já existe uma face com exatamente esses vértices — não criada de novo (evita duas faces coincidentes/"piscando").'
        : 'Selecione ao menos 2 vértices.';
      Utils.toast?.(msg, { type: 'warn', duration: 2200 });
      return;
    }
    Utils.toast?.(r.kind === 'face' ? 'Face criada ✓' : r.kind === 'edge' ? 'Aresta criada ✓' : 'Já existe uma aresta entre esses vértices.', { duration: 1500 });
  },

  /** NOVO (03/09/2026) — "definir origem" (pedido verbatim, seção Editar
   *  da aba Ferramentas, ver modeler-ui.js `_buildFerramentasPanel`).
   *  Desloca o PIVÔ/origem local do objeto pra um ponto `P` (em espaço
   *  local, mesma referência de `state.cm.vertices`) SEM mover o objeto
   *  visualmente: todos os vértices se deslocam por `-P` (o novo pivô vira
   *  0,0,0 local) e `state.group.position` é deslocado pelo mesmo `P`, já
   *  rotacionado/escalado pela transformação ATUAL do grupo (via
   *  `state.group.quaternion`/`state.group.scale`, sempre em dia com
   *  `state.xform` — ver `ModelerGizmo.applyXformToGroup`) — sem essa
   *  compensação o objeto "pularia" de lugar na tela toda vez que a origem
   *  mudasse. `modo`: 'centroMassa' (média de todos os vértices — dá pra
   *  discutir se "centro de massa" deveria pesar por volume/área, mas a
   *  média simples dos vértices é a aproximação padrão usada por editores
   *  3D mais simples, e este Modelador não tem um conceito de densidade),
   *  'centralizadoBaixo'/'centralizadoCima' (centro X/Z do bounding box,
   *  base/topo em Y), 'verticeSelecionado' (o PRIMEIRO vértice selecionado,
   *  na ordem de seleção — "se houver mais de um, será o primeiro
   *  selecionado", pedido verbatim) e 'personalizado' (ponto {x,y,z} em
   *  espaço local, informado pelo usuário — ver
   *  `ModelerUI._promptOrigemPersonalizada`). Só roda em Modo Objeto de
   *  verdade (a malha INTEIRA, nunca uma seleção parcial) — 'personalizado'
   *  e os 3 primeiros modos não dependem de seleção nenhuma; só
   *  'verticeSelecionado' precisa de algo selecionado (avisa e não faz
   *  nada, sem pushUndo, se não houver). */
  setOrigin(state, modo, custom) {
    const V = state.cm.vertices;
    if (!V.length) return;
    let P;
    if (modo === 'centroMassa') {
      let sx = 0, sy = 0, sz = 0;
      V.forEach((v) => { sx += v[0]; sy += v[1]; sz += v[2]; });
      P = [sx / V.length, sy / V.length, sz / V.length];
    } else if (modo === 'centralizadoBaixo' || modo === 'centralizadoCima') {
      const bb = ModelerMesh.localBBox(V);
      P = [(bb.minX + bb.maxX) / 2, modo === 'centralizadoBaixo' ? bb.minY : bb.maxY, (bb.minZ + bb.maxZ) / 2];
    } else if (modo === 'verticeSelecionado') {
      const idx = (state.selOrder?.verts && state.selOrder.verts.length) ? state.selOrder.verts[0]
        : (state.sel?.verts && state.sel.verts.size ? Array.from(state.sel.verts)[0] : null);
      if (idx == null || !V[idx]) { Utils.toast?.('Selecione ao menos um vértice primeiro (Modo de Edição).', { type: 'warn' }); return; }
      P = V[idx].slice();
    } else if (modo === 'personalizado') {
      if (!custom) return;
      P = [custom.x || 0, custom.y || 0, custom.z || 0];
    } else return;
    if (P[0] === 0 && P[1] === 0 && P[2] === 0) { Utils.toast?.('A origem já está nesse ponto.', { type: 'info' }); return; }

    ModelerMesh.pushUndo(state, 'Definir origem');
    V.forEach((v) => { v[0] -= P[0]; v[1] -= P[1]; v[2] -= P[2]; });
    const THREE = state.THREE;
    const offset = new THREE.Vector3(P[0], P[1], P[2]).multiply(state.group.scale).applyQuaternion(state.group.quaternion);
    state.group.position.add(offset);
    ModelerMesh.rebuildMeshGeometry(state);
    ModelerUI.updateToolbarActive(state);
    ModelerUI.updateNPanel(state);
    Utils.toast?.('Origem definida ✓', { type: 'ok', duration: 1500 });
  },

  triggerDuplicate(state) {
    // NOVO (01/09/2026), pedido verbatim: "A duplicação deve funcionar
    // quando estiver selecionado o 'Modo Objeto'." `ModelerMesh.duplicate`
    // agora aceita Modo Objeto (duplica a malha inteira e já troca pra Modo
    // Edição com a cópia selecionada — ver comentário grande lá); só faltava
    // este chamador perceber a troca e atualizar a UI (toolbar/painel N),
    // que só mostra as linhas de Modo Edição (seleção de vértice/aresta/
    // face, ferramentas de malha) depois de `ModelerUI.updateToolbarActive`
    // rodar de novo — sem isso a barra ficava com a cara de "Modo Objeto"
    // (linhas escondidas) mesmo já tendo entrado em edição por baixo dos
    // panos, mesmo bug que `_colocarPrimitiva` já resolvia pra primitivas
    // novas.
    const eraObjectMode = state.mode === 'object';
    const snap = ModelerMesh.snapshotForRevert(state);
    ModelerMesh.pushUndo(state, 'Duplicar'); // ANTES de mutar — ver comentário em _startModal
    if (!ModelerMesh.duplicate(state)) { Utils.toast?.('Nada para duplicar.', { type: 'warn', duration: 1800 }); return; }
    if (eraObjectMode && state.mode === 'edit') {
      ModelerUI.updateToolbarActive(state);
      ModelerUI.updateNPanel(state);
    }
    this._startModal(state, 'G', { skipUndoPush: true });
    state.modal.revertOnCancel = snap;
  },

  /** NOVO (01/09/2026) — "barra lateral estilo Blender" (item grande, aba
   *  'Criar' → seção 'Adicionar Primitiva', ver modeler-ui.js). Pedido
   *  verbatim resume-se a "faça todos esses botões como no Blender" (uma
   *  primitiva por botão, cada uma com seus próprios parâmetros
   *  configuráveis). Diferente do Blender de verdade (que ADICIONA um
   *  OBJETO novo à cena, sem tocar nos outros), este Modelador só concebe
   *  UMA malha por sessão (ver comentário grande no topo de modeler-core.js)
   *  — decisão tomada: em vez de SUBSTITUIR `state.cm` inteiro (destruiria
   *  qualquer edição já em andamento sem aviso, regressão grave), a nova
   *  primitiva é ANEXADA (índices deslocados, mesmo espírito de
   *  `ModelerMesh.mergeMeshes`) e fica sozinha SELECIONADA (submodo Face) ao
   *  final — pivô do gizmo já nasce centrado nela, pronta pra mover/girar/
   *  escalar pra longe do resto da malha com G/R/S ou o gizmo direto, sem
   *  perder o que já existia.
   *
   *  `geradorFn(params)`: qualquer gerador de modeler-mesh.js
   *  (`circleMesh`, `uvSphereMesh` etc.) "curried" pelo chamador (ver
   *  `PRIMITIVE_CATALOG`, modeler-ui.js) — recebe só `params` (objeto
   *  chave/valor) e devolve `{vertices,edges,faces}`. `label`: nome pro
   *  histórico ("Cubo", "Esfera UV" etc — ver ModelerMesh.pushUndo/
   *  _logAction).
   *
   *  "Propriedades como posição, rotação, raio, vértices (se aplicável)
   *  ficam na parte de baixo do submenu" (pedido verbatim) — implementado
   *  como "Ajustar Última Operação" (mesmo espírito do F6 do Blender):
   *  `state._lastPrimitive` guarda os parâmetros + o intervalo exato de
   *  índices (vértices/arestas/faces) que aquela peça ocupa em `state.cm`;
   *  editar um campo do formulário de propriedades (`ajustarUltimaPrimitiva`,
   *  abaixo) REGENERA só aquele intervalo (remove e reinsere no mesmo
   *  lugar), sem empilhar um novo desfazer a cada tecla — só a CRIAÇÃO em
   *  si vira uma entrada no histórico. Fazer QUALQUER outra coisa na malha
   *  invalida esse rastreamento (`ModelerMesh.pushUndo` zera
   *  `state._lastPrimitive` no início de toda ação nova) — depois disso o
   *  formulário de propriedades simplesmente some (nada mais pra ajustar). */
  criarPrimitiva(state, geradorFn, params, label) {
    ModelerMesh.pushUndo(state, label);
    this._colocarPrimitiva(state, geradorFn, params, label, null);
  },

  /** Regenera a ÚLTIMA primitiva inserida com NOVOS parâmetros — chamado
   *  pelos campos numéricos do formulário de propriedades (ver
   *  `ModelerUI.updateCreateProps`). Não empilha undo (ver comentário
   *  grande acima). */
  ajustarUltimaPrimitiva(state, novosParams) {
    if (!state._lastPrimitive) return;
    const lp = state._lastPrimitive;
    Object.assign(lp.params, novosParams);
    this._colocarPrimitiva(state, lp.geradorFn, lp.params, lp.label, lp);
  },

  _colocarPrimitiva(state, geradorFn, params, label, lpExistente) {
    const novaMalha = geradorFn(params);
    let vOffset, eOffset, fOffset;
    if (lpExistente) {
      // Regeneração no lugar — remove a versão anterior desta MESMA peça
      // (intervalo exato gravado da vez passada) antes de reinserir; tudo
      // MAIS na malha (edições feitas antes desta peça existir) fica intacto.
      vOffset = lpExistente.vOffset; eOffset = lpExistente.eOffset; fOffset = lpExistente.fOffset;
      state.cm.vertices.splice(vOffset, lpExistente.vCount);
      state.cm.edges.splice(eOffset, lpExistente.eCount);
      state.cm.faces.splice(fOffset, lpExistente.fCount);
    } else {
      vOffset = state.cm.vertices.length;
      eOffset = state.cm.edges.length;
      fOffset = state.cm.faces.length;
    }
    state.cm.vertices.splice(vOffset, 0, ...novaMalha.vertices.map((v) => v.slice()));
    state.cm.edges.splice(eOffset, 0, ...novaMalha.edges.map(([a, b]) => [a + vOffset, b + vOffset]));
    state.cm.faces.splice(fOffset, 0, ...novaMalha.faces.map((f) => f.map((i) => i + vOffset)));
    if (state.mode !== 'edit') { state.mode = 'edit'; state.objectSelected = false; }
    state.selectMode = 'face';
    const novasFaces = novaMalha.faces.map((_, i) => fOffset + i);
    state.sel = { verts: new Set(), edges: new Set(), faces: new Set(novasFaces) };
    state.selOrder = { verts: [] };
    state.activeVertex = null; state.activeEdge = null;
    state._lastPrimitive = {
      geradorFn, params: { ...params }, label,
      vOffset, vCount: novaMalha.vertices.length,
      eOffset, eCount: novaMalha.edges.length,
      fOffset, fCount: novaMalha.faces.length,
    };
    ModelerMesh.rebuildMeshGeometry(state);
    ModelerUI.updateToolbarActive(state);
    ModelerUI.updateNPanel(state);
    // CORRIGIDO (01/09/2026, item 11 da rodada B), pedido verbatim: "Ao
    // adicionar o cilindro (em 'Criar'->'Cilindro') as propriedades dele
    // não estão sendo aplicadas. Verifique os outro objetos desse menu
    // também." Achado testando ao vivo com Playwright (bounding box do
    // `state.meshObj.geometry` antes/depois de raio/profundidade/vértices
    // — TODOS batiam certo chamando `ajustarUltimaPrimitiva` direto): o bug
    // não é nos DADOS (que sempre atualizavam certo, pra QUALQUER
    // primitiva, não só Cilindro), é na INTERAÇÃO da UI. Causa raiz:
    // `ModelerUI.updateCreateProps` (chamado incondicionalmente aqui, toda
    // vez que este método roda) manda `_renderCreateProps` fazer
    // `wrap.innerHTML = ''` e reconstruir os campos numéricos DO ZERO —
    // mas ARRASTAR um campo (`_createNumField`, "clicar e arrastar pra
    // mudar o valor", igual ao Blender) chama `cfg.onCommit` (que cai bem
    // aqui, via `ajustarUltimaPrimitiva`) a CADA `mousemove` durante o
    // arrasto — ou seja, o próprio elemento `<div>` que o usuário está
    // arrastando era DESTRUÍDO E RECRIADO a cada pixel movido, cortando o
    // arrasto pela raiz (o `mousemove`/`mouseup` continuavam ligados no
    // `document`, então os DADOS seguiam atualizando por baixo dos panos —
    // por isso o teste "chamar a função direto" não via bug nenhum — mas o
    // CAMPO NA TELA virava um elemento novo e estático assim que o dedo
    // começava a arrastar, dando a impressão de "não aplica"/trava depois
    // do 1º pixel). Mesmo problema pra QUALQUER primitiva com campo
    // arrastável (o pedido do usuário já desconfiava — "verifique os
    // outros também"), não só o Cilindro.
    // Corrigido: só reconstrói o painel inteiro numa inserção NOVA
    // (`!lpExistente` — precisa trocar os CAMPOS pra combinar com a
    // primitiva recém-criada). Num AJUSTE de uma primitiva já existente
    // (`lpExistente` truthy — exatamente o caso de arrastar/clicar um
    // campo), os campos em si não mudam (mesma primitiva, mesmos
    // parâmetros) — cada `_createNumField` já atualiza o PRÓPRIO valor em
    // tela sozinho (`commit()`→`renderDisplay()`, sem precisar de nenhum
    // rebuild externo), então pular o rebuild aqui não perde nada E resolve
    // o arrasto. O toast "peça nova" (só faz sentido na hora de inserir,
    // não a cada pixel arrastado depois) também virou exclusivo desse caso.
    if (!lpExistente) {
      ModelerUI.updateCreateProps?.(state);
      Utils.toast?.(`${label} — G/R/S move/gira/escala a peça nova`, { duration: 2000 });
    }
  },

  /** NOVO (02/09/2026), pedido verbatim (item 12 da rodada de 13 itens):
   *  "As lâmpadas devem gerar luz de verdade de acordo com o tipo de
   *  lâmpada." Chamado pelo botão de primitiva de cada marcador da seção
   *  "Lâmpada" (`PRIMITIVE_CATALOG.lampada`, campo `luz` — ver
   *  `_buildCriarPanel`, modeler-ui.js), LOGO DEPOIS de `criarPrimitiva` já
   *  ter inserido a geometria decorativa do marcador — usa
   *  `state._lastPrimitive.vOffset/vCount` (ainda fresco, é exatamente essa
   *  peça que acabou de ser criada) pra saber que faixa de vértices esta luz
   *  deve seguir dali em diante (ver `ModelerRender.updateLampLights`).
   *  Cada tipo vira o `THREE.Light` real correspondente do Three.js — cores/
   *  intensidades/alcances escolhidos na mesma faixa já usada pelas luzes de
   *  verdade do mapa (luminária/poste, ver engine3d.js), adaptados pra uma
   *  cena bem menor (um objeto só, poucos metros). "Sol" (direcional) e
   *  "Spot" precisam de um `.target` (Object3D próprio, também adicionado à
   *  cena — Three.js exige isso pra QUALQUER `DirectionalLight`/`SpotLight`
   *  mirar um ponto que não seja a origem do mundo); "Area" usa
   *  `THREE.RectAreaLight` de verdade, que só ilumina alguma coisa depois de
   *  `RectAreaLightUniformsLib.init()` já ter rodado — ver
   *  `Engine3D._ensureRectAreaLightUniforms`, encadeado no carregamento do
   *  Three.js, então já rodou bem antes de qualquer marcador poder ser
   *  criado. Não empilha undo próprio (a criação do MARCADOR, em
   *  `criarPrimitiva`, já empilhou um — apagar o marcador depois, em Modo
   *  Edição, deixa a faixa de vértices inválida e `updateLampLights` limpa a
   *  luz órfã sozinho no quadro seguinte, sem precisar desfazer nada aqui). */
  _colocarLuzDaLampada(state, tipoLuz) {
    const lp = state._lastPrimitive;
    if (!lp) return;
    const THREE = state.THREE;
    let light;
    switch (tipoLuz) {
      case 'ponto':
        light = new THREE.PointLight(0xfff3d6, 1.2, 6, 2);
        break;
      case 'sol':
        light = new THREE.DirectionalLight(0xfff6d8, 1.4); // mesma cor do sol do mapa, ver engine3d.js sunMat
        light.target = new THREE.Object3D();
        state.scene.add(light.target);
        break;
      case 'spot':
        light = new THREE.SpotLight(0xffffff, 1.6, 8, Math.PI / 6, 0.35, 2);
        light.target = new THREE.Object3D();
        state.scene.add(light.target);
        break;
      case 'hemi':
        light = new THREE.HemisphereLight(0xbfe0ff, 0x3a2f26, 0.7);
        break;
      case 'area':
        light = new THREE.RectAreaLight(0xffffff, 3, 1, 1);
        break;
      default:
        return; // tipo desconhecido — defensivo, nunca deveria acontecer (só chamado com os 5 valores do catálogo)
    }
    state.scene.add(light);
    state.lights.push({ id: Utils.uid('luz'), tipo: tipoLuz, vOffset: lp.vOffset, vCount: lp.vCount, light });
    ModelerRender.updateLampLights(state); // posiciona já no 1º quadro — evita um "pulo" visível vindo da origem (0,0,0) até o quadro seguinte
  },

  /** Menu "Delete" — pedido do usuário, com screenshot do Blender: mesma
   *  lista de itens (traduzidos), incluindo os separadores entre os 3
   *  grupos (excluir de verdade / dissolver sem deixar buraco / operações
   *  de aresta). Chamado tanto pelo atalho de teclado (X/Delete) quanto
   *  pelo botão "🗑️ Excluir ▾" da barra "Remover" — ver
   *  `ModelerUI.showFloatingMenuAt` pro suporte a `{separator:true}`. */
  /** Executa uma operação de malha com undo/redo: empilha o "antes" só
   *  DEPOIS de confirmar que a operação faz sentido pra seleção atual
   *  (`precheck`) — evita empurrar/estourar undo à toa numa operação que
   *  nem vai rodar (o que também limparia o redo sem necessidade). */
  _runMeshOp(state, precheck, fn, msgOk, msgFail, label, cascadeCheck) {
    if (precheck === false) { Utils.toast?.(msgFail || 'Nada pra fazer com a seleção atual.', { type: 'warn', duration: 1800 }); return; }
    ModelerMesh.pushUndo(state, label); // rótulo pro histórico (01/09/2026) — cada chamador abaixo (_removeMenuItems/openMergeMenu) passa o próprio nome do item de menu
    // NOVO (03/09/2026), pedido verbatim: "Se estiver no 'Modo Edição' e
    // todos os vértices ou todas as faces ou todas as arestas estiverem
    // selecionadas, então, o objeto ou seu grupo deve ser totalmente
    // excluído." — `cascadeCheck` (true só nos 3 chamadores de exclusão de
    // verdade: Vértices/Arestas/Faces — não nas variantes "Only"/dissolver/
    // mesclar, que preservam geometria por definição) marca a intenção;
    // aqui capturamos ANTES da operação se a seleção cobria 100% de uma das
    // 3 categorias (vértices, arestas OU faces) da malha atual.
    const preFullVerts = cascadeCheck && state.cm.vertices.length > 0 && state.sel.verts.size === state.cm.vertices.length;
    const preFullEdges = cascadeCheck && state.cm.edges.length > 0 && state.sel.edges.size === state.cm.edges.length;
    const preFullFaces = cascadeCheck && state.cm.faces.length > 0 && state.sel.faces.size === state.cm.faces.length;
    const ok = fn(state);
    if (ok) {
      if (preFullVerts || preFullEdges || preFullFaces) {
        // Seleção era "tudo" numa categoria e a exclusão foi bem-sucedida —
        // não sobra objeto (mesmo raciocínio de `_deleteWholeObject`, ver
        // comentário lá): força a malha inteira a ficar vazia (mesmo que a
        // operação em si só tenha limpado vértices, por ex.: deletar todas
        // as arestas/faces selecionadas com a malha inteira selecionada
        // ainda deixaria pontos soltos — aqui isso conta como "excluir o
        // objeto", não como "esvaziar parcialmente") e reaproveita a mesma
        // limpeza de `_deleteWholeObject` (objectSelected=false inclusive,
        // o que já faz `ModelerGizmo.update` esconder o gizmo — ver
        // correção do "gizmo fantasma" no mesmo dia).
        this._clearWholeMesh(state);
        Utils.toast?.('✓ Objeto excluído', { duration: 1400 });
        return;
      }
      this._deselectAll(state); Utils.toast?.(msgOk || '✓ Removido', { duration: 1400 });
    }
    else { ModelerMesh.undo(state); Utils.toast?.(msgFail || 'Nada pra fazer com a seleção atual.', { type: 'warn', duration: 1800 }); }
  },

  /** Menu "Delete" — pedido do usuário, com screenshot do Blender: mesma
   *  lista de itens (traduzidos), incluindo os separadores entre os 3
   *  grupos (excluir de verdade / dissolver sem deixar buraco / operações
   *  de aresta). Chamado tanto pelo atalho de teclado (X/Delete) quanto
   *  pelo botão "🗑️ Excluir ▾" da barra "Remover" — ver
   *  `ModelerUI.showFloatingMenuAt` pro suporte a `{separator:true}`. */
  openRemoveMenu(state, anchorEl) {
    // CORRIGIDO (01/09/2026, item 7 da rodada B), pedido verbatim: "No
    // 'Modo Objeto', pressionar 'del' deveria abrir uma janelinha apenas
    // com a opção para deletar. Porém não está funcionando." Ramo NOVO:
    // em Modo Objeto a lista de 10 operações de vértice/aresta/face
    // (`_removeMenuItems` abaixo) não faz sentido nenhum (não existe essa
    // granularidade fora do Modo Edição) — janela com UMA ÚNICA opção.
    if (state.mode === 'object') {
      if (!state.objectSelected) { Utils.toast?.('Nada selecionado para excluir — clique no objeto primeiro.', { type: 'warn', duration: 1500 }); return; }
      const items = [{ label: '🗑️ Excluir objeto', run: () => this._deleteWholeObject(state) }];
      if (anchorEl) { ModelerUI.showFloatingMenuAt(state, anchorEl, items); return; }
      ModelerUI.showFloatingMenu(state, items);
      return;
    }
    const hasSel = state.sel.verts.size || state.sel.edges.size || state.sel.faces.size;
    if (!hasSel) { Utils.toast?.('Nada selecionado para excluir.', { type: 'warn', duration: 1500 }); return; }
    // Pedido do usuário: "O menu que aparece quando clica em 'Excluir' e
    // 'Mesclar' deve aparecer logo abaixo de cada um deles." — quando
    // chamado pelo clique do próprio botão (`anchorEl` presente), ancora
    // nele (`showFloatingMenuAt`); pelos outros dois caminhos que também
    // levam aqui (atalho de teclado X/Delete, item "🗑️ Excluir (X)" do menu
    // "Adicionar") não há um botão específico pra ancorar, então mantém o
    // comportamento antigo (`showFloatingMenu`, centralizado no canvas).
    if (anchorEl) { ModelerUI.showFloatingMenuAt(state, anchorEl, this._removeMenuItems(state)); return; }
    ModelerUI.showFloatingMenu(state, this._removeMenuItems(state));
  },

  /** "Excluir objeto" em Modo Objeto (item 7 da rodada B) — como a malha
   *  inteira É o único "objeto" que o Modo Objeto reconhece nesta
   *  arquitetura (`state.cm` — "o grupo", ver comentário grande em
   *  `ModelerMesh.duplicate`), excluir o objeto = esvaziar a malha
   *  inteira. Empilha undo (mesmo padrão de `_runMeshOp`) — dá pra
   *  reverter com Ctrl+Z. */
  _deleteWholeObject(state) {
    ModelerMesh.pushUndo(state, 'Excluir objeto');
    this._clearWholeMesh(state);
    Utils.toast?.('✓ Objeto excluído', { duration: 1400 });
  },

  /** Limpeza compartilhada de "excluir objeto inteiro" — extraída de
   *  `_deleteWholeObject` (03/09/2026) pra ser reaproveitada também pela
   *  cascata do Modo Edição em `_runMeshOp` (selecionar tudo numa
   *  categoria e deletar = objeto inteiro some, gizmo incluso). Quem chama
   *  já cuidou do próprio `pushUndo` antes (aqui não empilha undo de
   *  novo). */
  _clearWholeMesh(state) {
    state.cm.vertices = []; state.cm.edges = []; state.cm.faces = [];
    state.sel = { verts: new Set(), edges: new Set(), faces: new Set() };
    state.selOrder = { verts: [] };
    state.activeVertex = null; state.activeEdge = null;
    state.objectSelected = false;
    ModelerMesh.rebuildMeshGeometry(state);
    ModelerUI.updateToolbarActive(state);
    ModelerUI.updateNPanel(state);
  },

  _removeMenuItems(state) {
    return [
      { label: '🔺 Vértices', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.deleteVertices(s), undefined, undefined, 'Excluir Vértices', true) },
      { label: '➖ Arestas', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.deleteEdges(s), undefined, undefined, 'Excluir Arestas', true) },
      { label: '⬛ Faces', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.deleteFaces(s), undefined, undefined, 'Excluir Faces', true) },
      { label: '⬛➖ Somente Arestas e Faces', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.deleteEdgesFacesKeepVerts(s), '✓ Removido (vértices mantidos)', undefined, 'Excluir Arestas e Faces') },
      { label: '⬛ Somente Faces', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.deleteOnlyFaces(s), '✓ Removido (arestas/vértices mantidos)', undefined, 'Excluir Somente Faces') },
      { separator: true },
      { label: '🔺 Dissolver Vértices', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.dissolveVertices(s), undefined, undefined, 'Dissolver Vértices') },
      { label: '➖ Dissolver Arestas', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.dissolveEdges(s), undefined, undefined, 'Dissolver Arestas') },
      { label: '⬛ Dissolver Faces', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.dissolveFaces(s), undefined, undefined, 'Dissolver Faces') },
      { label: '🧩 Dissolução Limitada', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.limitedDissolve(s), '✓ Dissolvido (faces coplanares)', 'Nenhuma face coplanar adjacente encontrada.', 'Dissolução Limitada') },
      { separator: true },
      { label: '📐 Colapsar Aresta', run: () => this._runMeshOp(state, state.sel.edges.size > 0, (s) => ModelerMesh.edgeCollapse(s), undefined, 'Colapsar Aresta: selecione uma ou mais arestas.', 'Colapsar Aresta') },
      { label: '🔁 Laços de Aresta', run: () => this._runMeshOp(state, state.sel.edges.size > 0, (s) => ModelerMesh.dissolveEdgeLoops(s), undefined, 'Laços de Aresta: selecione uma ou mais arestas.', 'Dissolver Laços de Aresta') },
    ];
  },

  /** Menu "Merge" (tecla M no Blender) — pedido do usuário, com
   *  screenshot: "At Center"/"At Cursor"/"Collapse". Este app não tem
   *  "cursor 3D" (ver `ModelerMesh.mergeAtActive`, simplificação
   *  documentada lá: funde no vértice ATIVO em vez do cursor). "Collapse"
   *  aqui é a MESMA operação de "Colapsar Aresta" do menu Delete — só faz
   *  sentido com aresta(s) selecionada(s) (não com seleção solta de
   *  vértices, que não têm um "ponto médio de aresta" pra colapsar). */
  openMergeMenu(state, anchorEl) {
    const idxs = ModelerMesh.selectedVertexIndices(state);
    if (idxs.length < 2) { Utils.toast?.('Mesclar: selecione 2+ vértices (ou arestas/faces que envolvam 2+).', { type: 'warn', duration: 2000 }); return; }
    // Pedido do usuário, com screenshot do Blender: "duas outras opções
    // ficam bem em cima: 'ao primeiro' ('At First') e 'ao último' ('At
    // Last')" — mesma ordem do menu do Blender (At First/At Last/At
    // Center/At Cursor/Collapse).
    const items = [
      { label: '🥇 No Primeiro', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.mergeAtFirst(s), '✓ Mesclado', undefined, 'Mesclar (No Primeiro)') },
      { label: '🥈 No Último', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.mergeAtLast(s), '✓ Mesclado', undefined, 'Mesclar (No Último)') },
      { label: '🎯 No Centro', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.mergeAtCenter(s), '✓ Mesclado', undefined, 'Mesclar (No Centro)') },
      { label: '📍 No Cursor (vértice ativo)', run: () => this._runMeshOp(state, true, (s) => ModelerMesh.mergeAtActive(s), '✓ Mesclado', undefined, 'Mesclar (No Cursor)') },
      { label: '📐 Colapsar', run: () => this._runMeshOp(state, state.sel.edges.size > 0, (s) => ModelerMesh.edgeCollapse(s), '✓ Colapsado', 'Colapsar: selecione uma ou mais arestas (use "No Centro" para uma seleção solta de vértices).', 'Colapsar') },
    ];
    // Mesmo motivo do `openRemoveMenu` acima ("logo abaixo de cada um deles").
    if (anchorEl) { ModelerUI.showFloatingMenuAt(state, anchorEl, items); return; }
    ModelerUI.showFloatingMenu(state, items);
  },

  /** "Remove Doubles" (botão direto, sem submenu — igual o 3º botão do
   *  screenshot do Blender) — funde vértices coincidentes/quase
   *  coincidentes da seleção (ou da malha inteira, se nada selecionado). */
  triggerRemoveDoubles(state) {
    ModelerMesh.pushUndo(state, 'Remove Doubles');
    const n = ModelerMesh.removeDoubles(state);
    if (!n) { ModelerMesh.undo(state); Utils.toast?.('Remove Doubles: nenhum vértice coincidente encontrado.', { type: 'warn', duration: 1800 }); return; }
    this._deselectAll(state);
    Utils.toast?.(`✓ ${n} grupo(s) de vértice(s) coincidente(s) fundido(s)`, { duration: 2000 });
  },

  // ==================== desfazer/refazer ====================

  /** Ctrl+Z/Ctrl+Y (pedido do usuário: "O CTRL+Z/CTRL+Y deve funcionar
   *  também") — chamado de _onKeyDown, só fora de um modal G/R/S em
   *  andamento (Enter/Esc já são os atalhos "de desfazer" DENTRO do modal).
   *  Restaura malha+seleção+transformação do objeto e atualiza a UI (painel
   *  N/gizmo já são redesenhados por `ModelerMesh._applyFullSnapshot`). */
  undo(state) {
    // 01/09/2026: `ModelerMesh.undo` agora zera `state._lastPrimitive`
    // (ver comentário em modeler-mesh.js) — atualiza também a região de
    // Propriedades da aba "Criar" (barra lateral), senão ela continuaria
    // mostrando campos de uma primitiva que não existe mais nesse intervalo
    // de índices depois do desfazer.
    if (ModelerMesh.undo(state)) { ModelerUI.updateNPanel(state); ModelerUI.updateCreateProps?.(state); Utils.toast?.('↩️ Desfeito', { duration: 900 }); }
  },

  redo(state) {
    if (ModelerMesh.redo(state)) { ModelerUI.updateNPanel(state); ModelerUI.updateCreateProps?.(state); Utils.toast?.('↪️ Refeito', { duration: 900 }); }
  },
};

window.ModelerInput = ModelerInput;
