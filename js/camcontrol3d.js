/* js/camcontrol3d.js
 * Painel de controle da câmera para "Ver em 3D" > Modo Edição > objeto câmera > "Ver através desta câmera".
 *
 * Controla 4 características da câmera vista (e gravadas no objeto câmera do mapa):
 *   1. Pitch  — olhar para cima/baixo          (graus, + = para cima)
 *   2. Yaw    — olhar para os lados            (graus, + = para a direita)
 *   3. Roll   — inclinar a câmera              (graus, + = sentido horário visto da câmera)
 *   4. Altura — posição Y da câmera em relação ao chão do andar dela (metros)
 *
 * Três formas de controle, TODAS sobre o mesmo estado (`estado`) e sempre sincronizadas:
 *   - campos numéricos (digitação direta);
 *   - botões "−" / "+" (D-Pad) com clique e "pressionar e segurar" (Shift = passo x10);
 *   - GIMBAL 3D (miniatura de 150x150 no canto superior): clicar e arrastar
 *       · arrastar no miolo  -> yaw (horizontal) e pitch (vertical) da câmera do cenário;
 *       · arrastar na borda (anel externo) -> roll;
 *       · botão direito (ou Shift + arrastar) -> gira só a VISTA da miniatura (a câmera do cenário não se move).
 *
 * Convenções do app (ver engine3d.js cameraForward / view3d.js): `this._camera.pitch` positivo olha para BAIXO e
 * `yaw` positivo gira para a ESQUERDA (o eixo "direita" do Three é o oposto). Por isso a UI usa os sinais invertidos
 * (pitchUI = -pitch, yawUI = -yaw), como pede o enunciado: + = cima / direita.
 *
 * A miniatura é desenhada em <canvas> 2D com projeção 3D própria (sem criar um 2º WebGLRenderer — o app usa um
 * único contexto WebGL compartilhado, e criar outro é o que causava "Cannot read properties of null (reading precision)").
 * Ordem de rotação equivalente a `YXZ` (yaw, depois pitch, depois roll) — sem gimbal lock, cada ângulo é independente.
 */
(function () {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wrap180 = (d) => { d = ((d + 180) % 360 + 360) % 360 - 180; return d; };

  const CSS = `
  .cc3d-gimbal{position:fixed;top:64px;right:10px;width:150px;height:150px;z-index:2147483001;border-radius:12px;
    background:rgba(16,20,28,.35);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
    touch-action:none;cursor:grab}
  .cc3d-gimbal canvas{width:150px;height:150px;display:block;border-radius:12px}
  .cc3d-panel{position:fixed;top:222px;right:10px;width:262px;z-index:2147483001;color:#e8ecf2;font:12.5px system-ui,sans-serif;
    background:rgba(16,20,28,.55);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:10px 12px;
    backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);box-shadow:0 8px 30px rgba(0,0,0,.45);user-select:none}
  .cc3d-head{display:flex;align-items:center;justify-content:space-between;font-weight:700;margin-bottom:6px}
  .cc3d-head button{background:none;border:none;color:inherit;cursor:pointer;font-size:14px;padding:0 4px}
  .cc3d-row{margin:5px 0}
  .cc3d-row .m3d-numfield{width:100%;box-sizing:border-box;height:26px;border-radius:8px}
  .cc3d-foot{display:flex;gap:6px;margin-top:8px}
  .cc3d-foot button{flex:1;height:26px;border-radius:8px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#fff;font-size:11.5px;cursor:pointer}
  .cc3d-foot button:hover{background:rgba(255,255,255,.17)}
  .cc3d-hint{margin-top:6px;font-size:10.5px;color:#8f99aa;line-height:1.35}
  .cc3d-panel.cc3d-min .cc3d-body{display:none}
  .cc3d-tgl{position:fixed;right:10px;bottom:10px;z-index:2147483100;display:flex;gap:6px}
  .cc3d-tgl button{height:28px;padding:0 10px;border-radius:14px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.10);color:#e8ecf2;
    font:12px system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:.6}
  .cc3d-tgl button.on{opacity:1;background:rgba(111,177,255,.28);border-color:rgba(111,177,255,.7)}
  .cc3d-rings{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483001;user-select:none;touch-action:none;pointer-events:none}
  .cc3d-rings>*{position:absolute;pointer-events:auto}
  .cc3d-ring{border-style:solid;border-color:rgba(255,255,255,.22);border-radius:50%;box-sizing:border-box;cursor:grab;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.4),0 0 0 1px rgba(255,255,255,.35)}
  .cc3d-tick{position:absolute;left:50%;width:2px;margin-left:-1px;background:#ff8a3d}
  .cc3d-knob{position:absolute;border-radius:50%;background:#fff;box-shadow:0 0 8px rgba(111,177,255,.95);pointer-events:none}
  .cc3d-vbar{background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.35);cursor:ns-resize}
  .cc3d-hbar{background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.35);cursor:ew-resize}
  .cc3d-mid{position:absolute;background:rgba(0,0,0,.55)}
  .cc3d-vbar .cc3d-mid{left:0;right:0;top:50%;height:1px}
  .cc3d-hbar .cc3d-mid{top:0;bottom:0;left:50%;width:1px}
  .cc3d-thumb{position:absolute;background:#fff;border-radius:3px;box-shadow:0 0 6px rgba(111,177,255,.9);pointer-events:none}
  .cc3d-vbar .cc3d-thumb{left:1px;right:1px;height:6px}
  .cc3d-hbar .cc3d-thumb{top:1px;bottom:1px;width:6px}
  .cc3d-dpad{position:fixed;right:101px;top:520px;z-index:2147483001;width:78px;display:grid;grid-template-columns:repeat(3,26px);grid-auto-rows:26px;gap:0}
  .cc3d-dpad button{border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.2);color:#3a4252;font-size:11px;cursor:pointer;padding:0;touch-action:none}
  .cc3d-dpad button:hover{background:rgba(255,255,255,.35)} .cc3d-dpad button:active{background:rgba(111,177,255,.55)}
  .cc3d-dpad button[data-d="1"][data-k="pitch"]{border-radius:8px 8px 0 0}.cc3d-dpad button[data-d="-1"][data-k="pitch"]{border-radius:0 0 8px 8px}
  .cc3d-dpad button[data-k="yaw"][data-d="-1"]{border-radius:8px 0 0 8px}.cc3d-dpad button[data-k="yaw"][data-d="1"]{border-radius:0 8px 8px 0}
  `;

  /** Projeta um ponto 3D (mundo, Y para cima) na miniatura, depois de girar a vista (az/el). */
  function makeProjector(az, el, size) {
    const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    const half = size / 2, scale = size * 0.36, dist = 4.2;
    return (p) => {
      // gira em torno de Y (az) e depois inclina em torno de X (el)
      const x1 = p[0] * ca + p[2] * sa, z1 = -p[0] * sa + p[2] * ca;
      const y2 = p[1] * ce - z1 * se, z2 = p[1] * se + z1 * ce;
      const k = dist / (dist - z2);
      return { x: half + x1 * scale * k, y: half - y2 * scale * k, z: z2 };
    };
  }

  function create(view, cam, opts) {
    console.log('[CamControl3D] create() chamado', { temView: !!view, temContainer: !!(view && view._container), camId: cam && cam.id });
    try { view && view._v3dLog && view._v3dLog('[CamControl3D] create() chamado'); } catch (e) { /* ignora */ }
    if (!view || !view._container || !cam) { console.warn('[CamControl3D] create() abortado: falta view/_container/câmera'); return { destroy() {} }; }
    if (!document.getElementById('cc3d-css')) {
      const st = document.createElement('style'); st.id = 'cc3d-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const lp = { yaw: (cam.dirAngulo || 0) - Math.PI, pitch: cam.rotPerp || 0, roll: cam.roll || 0, y: 0 };   // pose local: a cena lê os campos da câmera (View3D._computeFotoCamPose)
    const baseY = (cam.piso || 0) * (view._map?.alturaPiso || 2.8);

    // ---- estado único (radianos internos; a UI mostra graus) ----
    const estado = {
      yaw: lp.yaw, pitch: lp.pitch, roll: lp.roll || 0,   // a cena gira ao contrário do gimbal (pedido): yaw da cena = −yaw do gimbal
      altura: Number.isFinite(cam.altura) ? cam.altura : 1.6,
    };
    const inicial = { ...estado };
    const vista = { az: 0, el: 0.42 };   // az 0: o norte do mundo (−Z) fica para o fundo/topo da miniatura   // vista da miniatura (independente da câmera do cenário)

    // ---- DOM ----
    const gimbal = document.createElement('div');
    gimbal.className = 'cc3d-gimbal';
    gimbal.title = 'Arraste no centro: yaw/pitch · na borda: roll · botão direito ou Shift: só gira a vista da miniatura';
    const cv = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = 150 * dpr; cv.height = 150 * dpr;
    gimbal.appendChild(cv);
    const panel = document.createElement('div');
    panel.className = 'cc3d-panel';
    const CAMPOS = [
      { k: 'pitch', rot: 'Pitch (°)', tip: 'Olhar para cima (+) / baixo (−)', step: 1, min: -89.9, max: 89.9 },
      { k: 'yaw', rot: 'Yaw (°)', tip: 'Olhar para a direita (+) / esquerda (−)', step: 1 },
      { k: 'roll', rot: 'Roll (°)', tip: 'Inclinar: horário (+) / anti-horário (−)', step: 1 },
      { k: 'altura', rot: 'Altura (m)', tip: 'Altura da câmera em relação ao chão', step: 0.05, min: 0, max: 30 },
    ];
    panel.innerHTML = `
      <div class="cc3d-head"><span>🎥 Controle da câmera</span><button type="button" data-a="min" title="Recolher/expandir">▾</button></div>
      <div class="cc3d-body">
        ${CAMPOS.map((c) => `<div class="cc3d-row" data-k="${c.k}" title="${c.tip}"></div>`).join('')}
        <div class="cc3d-foot"><button type="button" data-a="reset" title="Volta aos valores de quando este painel abriu">↺ Restaurar</button>
          <button type="button" data-a="zero" title="Pitch e roll em 0°">⌖ Nivelar</button></div>
        <div class="cc3d-hint">Cada valor é um botão triplo: setas ◄ ► (1 passo), arrastar no meio (contínuo) ou clicar no meio para digitar. Yaw = rumo da bússola (0° = norte do mundo, horário +). Na miniatura: arraste para girar a câmera; borda = roll; botão direito = só gira a vista.</div>
      </div>`;
    // mesmo pai dos overlays de "Ver através desta câmera" (#v3d-camzoom-wrap), para ficar no mesmo contexto de empilhamento
    const pai = document.body;   // position:fixed direto no <body>: nenhum contêiner (overflow/empilhamento) do 3D consegue cortar ou cobrir
    pai.appendChild(gimbal);
    pai.appendChild(panel);
    console.log('[CamControl3D] painel e gimbal construídos e anexados em', pai.className || pai.tagName);
    const dbg = document.createElement('div');
    dbg.className = 'cc3d-hint'; dbg.style.cssText = 'color:#7fdc8f;font-family:monospace;white-space:pre-wrap';
    const atualizaDbg = () => {
      const r = panel.getBoundingClientRect(), g = gimbal.getBoundingClientRect(), cr = { width: window.innerWidth, height: window.innerHeight };
      dbg.textContent = 'DEBUG construído ✓ pai=' + (pai.className || pai.tagName) + '\npainel ' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' z=' + getComputedStyle(panel).zIndex + '\ngimbal ' + Math.round(g.left) + ',' + Math.round(g.top) + ' ' + Math.round(g.width) + 'x' + Math.round(g.height) + '\náreaVisível ' + Math.round(cr.width) + 'x' + Math.round(cr.height);
    };
    (panel.querySelector('.cc3d-body') || panel).appendChild(dbg);
    setTimeout(atualizaDbg, 50); setTimeout(atualizaDbg, 1700);
    // Garante que fiquem na frente da foto-guia/overlays e dentro da área visível (não cortados pelo overflow do contêiner).
    const garantirVisivel = () => {
      if (!gimbal.isConnected) return;
      const cr = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
      panel.style.maxHeight = Math.max(120, cr.height - 232) + 'px'; panel.style.overflowY = 'auto';
      [gimbal, panel].forEach((el) => {
        const r = el.getBoundingClientRect();
        if (el.style.display === 'none') return;
        if (r.width && (r.right > cr.right - 2 || r.left < cr.left)) { el.style.right = '10px'; el.style.left = 'auto'; }
        if (r.width && r.bottom > cr.bottom) el.style.top = Math.max(4, cr.height - r.height - 8) + 'px';
      });
    };
    garantirVisivel(); requestAnimationFrame(garantirVisivel); setTimeout(garantirVisivel, 400); setTimeout(garantirVisivel, 1500);
    window.addEventListener('resize', garantirVisivel);
    // nada do que acontece aqui pode vazar para o 3D (WASD, mouse-look, ferramentas de construção…)
    ['mousedown', 'click', 'dblclick', 'wheel', 'keydown', 'keyup', 'contextmenu', 'touchstart'].forEach((ev) => {   // 'mouseup' fica livre: o botão triplo o escuta no document
      [gimbal, panel].forEach((el) => el.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'contextmenu') e.preventDefault(); }, { passive: false }));
    });

    let fino = 1;   // ajuste fino: 1 = normal; 10 / 100 = a mesma passada do mouse move 10x / 100x mais devagar
    // Campos = "botão triplo" (ModelerUI._createNumField): setas ◄ ►, arrastar no meio, clicar no meio para digitar.
    // `step`/`minDecimals` são getters: acompanham o ajuste fino ao vivo (o widget lê cfg.step a cada clique/arraste).
    const campos = {};
    CAMPOS.forEach((cf) => {
      const slot = panel.querySelector('.cc3d-row[data-k="' + cf.k + '"]');
      const alt = cf.k === 'altura';
      const conf = {
        label: cf.rot, value: 0, suffix: alt ? 'm' : '°', pxPerStep: alt ? 4 : 3,
        get step() { return cf.step / fino; },
        get minDecimals() { return alt ? (fino > 1 ? 3 : 2) : (fino > 1 ? 2 : 1); },
        onCommit: (v) => { deUI(cf.k, v); aplicar('input'); },
      };
      let api = null;
      try { api = window.ModelerUI && ModelerUI._createNumField(conf); } catch (e) { console.warn('[CamControl3D] botão triplo', e); }
      if (!api) {   // reserva: campo numérico simples se o ModelerUI não estiver carregado
        const inp = document.createElement('input'); inp.type = 'number'; inp.step = String(cf.step);
        inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) conf.onCommit(v); });
        api = { el: inp, setValue(v) { if (inp !== document.activeElement) inp.value = v; } };
      }
      slot.appendChild(api.el); campos[cf.k] = api;
    });


    // ---- opções (MapConfig): painel/anéis ligados por padrão; info de debug desligada por padrão ----
    const cfg = () => Object.assign({}, (window.MapConfig && MapConfig._cache) || {}, view._paredeConfig || {});
    const setCfg = (patch) => {
      try { Object.assign(view._paredeConfig || (view._paredeConfig = {}), patch); } catch (e) { /* ignora */ }
      try { window.MapConfig && MapConfig.set(patch); } catch (e) { console.warn('[CamControl3D] salvar opção', e); }
      sincronizar();
    };
    const tgl = document.createElement('div');
    tgl.className = 'cc3d-tgl';
    tgl.innerHTML = '<button type="button" data-t="painel" title="Mostrar/ocultar a tela do Controle de câmera (gimbal + campos)">🎥 Controle</button><button type="button" data-t="aneis" title="Mostrar/ocultar o anel e as barras de rotação">◎ Anéis</button><button type="button" data-t="fino" title="Ajuste fino: alterna entre normal, 10× e 100× mais devagar (vale para anel, barras, gimbal e botões)">🎯 Fino ×1</button>';
    document.body.appendChild(tgl);
    const rings = document.createElement('div');
    rings.className = 'cc3d-rings';
    rings.innerHTML = `
      <div class="cc3d-ring" title="Anel: arraste em volta para rolar (roll). Cursor infinito"><i class="cc3d-tick"></i><b class="cc3d-knob"></b></div>
      <div class="cc3d-vbar" title="Barra vertical: pitch (inclinar). Linha do meio = nível. Cursor infinito"><i class="cc3d-mid"></i><b class="cc3d-thumb"></b></div>
      <div class="cc3d-hbar" title="Barra horizontal: yaw (rumo, 0° = norte). Cursor infinito"><i class="cc3d-mid"></i><b class="cc3d-thumb"></b></div>`;
    const dpad = document.createElement('div');
    dpad.className = 'cc3d-dpad';
    dpad.innerHTML = `
        <span></span><button type="button" data-k="pitch" data-d="1" title="Olhar para cima">▲</button><span></span>
        <button type="button" data-k="yaw" data-d="-1" title="Girar para a esquerda">◀</button><button type="button" data-z="1" title="Nivelar (pitch e roll = 0)">●</button><button type="button" data-k="yaw" data-d="1" title="Girar para a direita">▶</button>
        <span></span><button type="button" data-k="pitch" data-d="-1" title="Olhar para baixo">▼</button><span></span>`;
    document.body.appendChild(dpad);
    document.body.appendChild(rings);
    const sincronizar = () => {
      const c = cfg();
      // [22/09/2026] MUDADO — pedido verbatim: "O padrão, ao recarregar a
      // página, é só o botão 'Anéis' estar ativo. O botão 'Controle' fica
      // desativado e o 'Fino x1' também." Antes, os dois nasciam LIGADOS
      // por padrão (`!== false`, ou seja, "ligado a não ser que a pessoa já
      // tenha desligado antes") — "Controle" agora só liga se a pessoa já
      // tiver ligado explicitamente antes (`=== true`); "Anéis" continua
      // ligado por padrão, como já era. "Fino ×1" já nascia desligado
      // (variável local `fino = 1`, sem persistir estado) — nada a mudar
      // ali.
      const pOn = c.camCtlPainelAtivo === true, aOn = c.camCtlAneisAtivo !== false;
      gimbal.style.display = panel.style.display = pOn ? '' : 'none';
      const eraOff = rings.style.display === 'none'; rings.style.display = dpad.style.display = aOn ? '' : 'none'; if (aOn && eraOff && typeof atualizarAneis === 'function') atualizarAneis();
      tgl.querySelector('[data-t="painel"]').classList.toggle('on', pOn);
      tgl.querySelector('[data-t="aneis"]').classList.toggle('on', aOn);
      dbg.style.display = c.debugCamInfoAtivo === true ? '' : 'none';
    };
    // ---- ordem de empilhamento: o último grupo tocado (botão, clique na janela/anel) assume a frente ----
    const ZF = '2147483002', ZT = '2147483001';
    const gPainel = [gimbal, panel, dpad], gAneis = [rings];
    const frente = (grupo) => { [gPainel, gAneis].forEach((g) => g.forEach((el) => { el.style.zIndex = g === grupo ? ZF : ZT; })); };
    [[gPainel, gPainel], [gAneis, gAneis]].forEach(([g]) => g.forEach((el) => {
      el.addEventListener('pointerdown', () => frente(g), true);   // captura: vale mesmo que o alvo pare a propagação
      el.addEventListener('mousedown', () => frente(g), true);
    }));
    frente(gPainel);
    tgl.querySelector('[data-t="painel"]').onclick = () => { const vaiLigar = !(cfg().camCtlPainelAtivo !== false); if (vaiLigar) frente(gPainel); setCfg({ camCtlPainelAtivo: vaiLigar }); };
    tgl.querySelector('[data-t="fino"]').onclick = (e) => {
      fino = fino === 1 ? 10 : fino === 10 ? 100 : 1;
      e.currentTarget.textContent = '🎯 Fino ×' + fino; e.currentTarget.classList.toggle('on', fino > 1);
      aplicar('init');
    };
    // botões "Controle"/"Anéis"/"Fino" no canto inferior direito da área do "Ver em 3D" (não da tela inteira)
    function posTgl() {
      const w = view._container && (view._container.querySelector('.view3d-wrap') || view._container);
      if (!w) return;
      const r = w.getBoundingClientRect();
      if (!r.width) return;
      tgl.style.right = Math.max(4, Math.round(window.innerWidth - r.right + 10)) + 'px'; tgl.style.bottom = Math.max(4, Math.round(window.innerHeight - r.bottom + 10)) + 'px';
    }
    window.addEventListener('resize', posTgl); setTimeout(posTgl, 60);
    tgl.querySelector('[data-t="aneis"]').onclick = () => { const vaiLigar = !(cfg().camCtlAneisAtivo !== false); if (vaiLigar) frente(gAneis); setCfg({ camCtlAneisAtivo: vaiLigar }); };
    ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'keydown', 'keyup', 'contextmenu', 'touchstart', 'pointerdown', 'pointerup', 'auxclick'].forEach((ev) => {
      [tgl, rings, dpad].forEach((el) => el.addEventListener(ev, (e) => {
        // [22/09/2026] NOVO — pedido verbatim: "ao rodar a roda do mouse em cima do miolo do
        // anel circular ou em cima de um dos 3 anéis deve ser possível continuar dando zoom."
        // `rings` (o <div class="cc3d-rings">, que contém o anel `.cc3d-ring`/miolo `.cc3d-knob`
        // e as 2 barras `.cc3d-vbar`/`.cc3d-hbar`) é um overlay `position:fixed` separado do
        // `<canvas>` do "Ver em 3D" — sem isto, o `stopPropagation()` logo abaixo (necessário pro
        // resto: WASD/clique/etc. não vazarem pro jogo) bloqueava a roda do mouse silenciosamente
        // sempre que o cursor estivesse sobre os anéis, mesmo com "Ver através desta Câmera"
        // ativo. `View3D._zoomFotoCamWheel` é o mesmo zoom (FOV) que já funciona ao rolar sobre o
        // canvas; chamado direto aqui, sem depender de Pointer Lock (que os anéis nem usam).
        if (ev === 'wheel' && el === rings) { try { view._zoomFotoCamWheel?.(e); } catch (err) { /* ignora */ } }
        e.stopPropagation(); if (ev === 'contextmenu') e.preventDefault();
      }, { passive: false }));
    });

    // ---- valores de UI <-> estado ----
    const paraUI = () => ({
      pitch: -estado.pitch * R2D, yaw: wrap180((Math.PI - estado.yaw) * R2D), roll: wrap180(estado.roll * R2D), altura: estado.altura,
    });
    const deUI = (k, v) => {
      if (!Number.isFinite(v)) return;
      if (k === 'pitch') estado.pitch = -clamp(v, -89.9, 89.9) * D2R;
      else if (k === 'yaw') estado.yaw = Math.PI - wrap180(v) * D2R;   // rumo da bússola: 0° = norte do mundo (−Z), sentido horário visto de cima
      else if (k === 'roll') estado.roll = wrap180(v) * D2R;
      else if (k === 'altura') estado.altura = clamp(v, 0, 30);
    };

    let saveT = null;
    const salvarFoto = async () => {
      try {
        const ph = await DB.getAmbientePhoto(cam.id);
        if (ph) await DB.saveAmbientePhoto({ ...ph, mapaDirAngulo: cam.dirAngulo, mapaRotPerp: cam.rotPerp, mapaAltura: cam.altura, mapaRoll: cam.roll });
      } catch (e) { console.warn('[CamControl3D] salvar foto/câmera', e); }
    };
    function aplicar(origem) {
      lp.yaw = estado.yaw; lp.pitch = estado.pitch; lp.roll = estado.roll; lp.y = baseY + estado.altura;
      // câmera (orb de foto): View3D._computeFotoCamPose lê estes campos a cada quadro (a abertura do painel não altera nada)
      if (origem !== 'init') {
        cam.dirAngulo = Math.PI + estado.yaw; cam.rotPerp = estado.pitch; cam.roll = estado.roll; cam.altura = estado.altura;
        view._camCtlSujo = true;
        clearTimeout(saveT);
        saveT = setTimeout(salvarFoto, 400);
        // [22/09/2026] NOVO — pedido verbatim: "Ao mover a câmera com os
        // controles (botões e anéis) o aramado amarelo [...] deve ir
        // junto." Ao vivo, sem esperar o debounce de `salvarFoto` acima —
        // `updateCameraFrustumPose` (engine3d.js) recalcula a base
        // (origem/direção) do aramado a partir do `cam` atual e redesenha.
        try { view._engine?.updateCameraFrustumPose?.(cam.id, cam); } catch (e) { /* ignora */ }
      }
      // 3) UI + miniatura
      const ui = paraUI();
      CAMPOS.forEach((cf) => { const api = campos[cf.k]; if (api && api.setValue) api.setValue(ui[cf.k]); });
      desenhar();
      atualizarAneis();
    }

    // ---- botões − / + com "pressionar e segurar" ----
    let holdT = null, holdI = null;
    const pararHold = () => { clearTimeout(holdT); clearInterval(holdI); holdT = holdI = null; };
    function passo(k, dir, shift) {
      const cf = CAMPOS.find((x) => x.k === k);
      const ui = paraUI();
      deUI(k, ui[k] + dir * cf.step * (shift ? 10 : 1) / fino);
      aplicar('botao');
    }

    // ---- anel (roll) + barra inferior (yaw) + barra vertical (pitch), com cursor infinito (Pointer Lock) + direcional ----
    const elRing = rings.querySelector('.cc3d-ring'), elV = rings.querySelector('.cc3d-vbar'), elH = rings.querySelector('.cc3d-hbar');
    let D = 300;
    // [22/09/2026] MUDADO — CORREÇÃO DE BUG: estas 3 constantes viviam lá embaixo, perto de
    // `posDpad` (onde são usadas), mas `layoutAneis()` (função logo abaixo) já chama `posDpad()`
    // e é ELA MESMA chamada de imediato (`layoutAneis();` mais abaixo, antes da declaração
    // original) — como são `const`, isso caía em "temporal dead zone" (ReferenceError: "Cannot
    // access 'DPAD_W' before initialization") na primeiríssima execução, interrompendo todo o
    // resto da função de configuração no meio (nada depois disso rodava: os botões do D-Pad
    // nunca ganhavam `addEventListener`, e `let rafPend` — usado por `desenhar()` — nunca era
    // inicializado, quebrando também a miniatura/gimbal e, por tabela, as barrinhas de pitch/yaw
    // — bug relatado verbatim: "as barrinhas brancas [...] não estão atualizando ao vivo. O D-pad
    // não está funcionando, nem a renderização da câmera com o gimbal."). Bastava mover a
    // declaração pra ANTES do 1º uso de verdade — sem outra mudança de comportamento.
    const DPAD_W = 78, DPAD_H = 80, DPAD_GAP = 14;
    function layoutAneis() {
      D = Math.round(clamp(Math.min(window.innerWidth * 0.5, window.innerHeight * 0.55), 120, 440));   // até 4× o tamanho anterior (110 px), limitado pela tela
      const bw = Math.max(18, Math.round(D * 0.16)), gap = Math.round(D * 0.06);
      rings.style.width = (D + gap + bw) + 'px'; rings.style.height = (D + gap + bw) + 'px';
      Object.assign(elRing.style, { left: '0px', top: '0px', width: D + 'px', height: D + 'px', borderWidth: Math.round(D * 0.115) + 'px' });
      Object.assign(elV.style, { left: (D + gap) + 'px', top: '0px', width: bw + 'px', height: D + 'px', borderRadius: (bw / 2) + 'px' });
      Object.assign(elH.style, { left: '0px', top: (D + gap) + 'px', width: D + 'px', height: bw + 'px', borderRadius: (bw / 2) + 'px' });
      elRing.querySelector('.cc3d-tick').style.cssText = 'top:-' + Math.round(D * 0.115) + 'px;height:' + Math.round(D * 0.115) + 'px';
      atualizarAneis();
      if (typeof posDpad === 'function') posDpad(); // rings mudaram de tamanho/posição — D-pad acompanha (ver posDpad)
    }
    function atualizarAneis() {
      const ui = paraUI();
      const th = Math.round(D * 0.115), rr = D / 2 - th / 2, a = -ui.roll * D2R, ks = Math.max(10, Math.round(th * 0.9));
      const kn = elRing.querySelector('.cc3d-knob');
      kn.style.width = kn.style.height = ks + 'px';
      kn.style.left = (D / 2 - th + Math.sin(a) * rr - ks / 2) + 'px'; kn.style.top = (D / 2 - th - Math.cos(a) * rr - ks / 2) + 'px';
      const vh = D / 2 - 4;
      elV.querySelector('.cc3d-thumb').style.top = (D / 2 - clamp(ui.pitch / 89.9, -1, 1) * vh - 3) + 'px';
      const hw = D / 2 - 4;
      elH.querySelector('.cc3d-thumb').style.left = (D / 2 + clamp(ui.yaw / 180, -1, 1) * hw - 3) + 'px';
    }
    // mão virtual: com Pointer Lock o cursor do sistema some, então desenhamos a mão (aberta = ✋, fechada ao arrastar = ✊) na posição virtual
    const mao = document.createElement('div');
    mao.style.cssText = 'position:fixed;z-index:2147483600;pointer-events:none;font-size:30px;line-height:1;transform:translate(-50%,-50%);display:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))';
    mao.textContent = '✊';
    document.body.appendChild(mao);
    // arrasto com cursor infinito: pede Pointer Lock (movementX/Y ilimitados); se o navegador negar, cai para o cursor normal (mão fechada via CSS)
    function arrastar(el, aoIniciar, aoMover) {
      let ativo = false, vx = 0, vy = 0, lockPedido = false;
      const fim = () => {
        if (!ativo) return; ativo = false;
        document.removeEventListener('pointermove', mover, true); document.removeEventListener('pointerup', fim, true); document.removeEventListener('pointercancel', fim, true);
        window.removeEventListener('blur', fim); document.removeEventListener('pointerlockchange', aoTrocarLock);
        el.removeEventListener('lostpointercapture', fim);
        if (document.pointerLockElement === el) document.exitPointerLock();
        mao.style.display = 'none'; el.style.cursor = 'grab';
      };
      const mover = (e) => {
        if (!ativo) return;
        if (e.buttons === 0) { fim(); return; }   // soltou o botão (mesmo que o mouseup tenha se perdido): para de girar
        if (document.pointerLockElement === el) {
          vx = clamp(vx + e.movementX, 0, window.innerWidth); vy = clamp(vy + e.movementY, 0, window.innerHeight);
          mao.style.left = vx + 'px'; mao.style.top = vy + 'px';
        } else { vx = e.clientX; vy = e.clientY; }
        aoMover(e.movementX || 0, e.movementY || 0, vx, vy);
      };
      const aoTrocarLock = () => { if (ativo && lockPedido && document.pointerLockElement !== el) fim(); };
      el.style.cursor = 'grab';
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || ativo) return;
        e.preventDefault(); e.stopPropagation(); ativo = true; vx = e.clientX; vy = e.clientY;
        if (aoIniciar(vx, vy, e) === false) { ativo = false; return; }
        document.addEventListener('pointermove', mover, true); document.addEventListener('pointerup', fim, true); document.addEventListener('pointercancel', fim, true);
        window.addEventListener('blur', fim); el.addEventListener('lostpointercapture', fim);
        el.style.cursor = 'grabbing';
        mao.style.left = vx + 'px'; mao.style.top = vy + 'px';
        lockPedido = false;
        const ok = () => { lockPedido = true; mao.style.display = ''; document.addEventListener('pointerlockchange', aoTrocarLock); };
        try { const pr = el.requestPointerLock(); if (pr && pr.then) pr.then(ok).catch(() => { /* sem lock: mão fechada via CSS */ }); else ok(); } catch (err) { /* sem lock */ }
      });
    }
    { // anel: roll só na faixa do anel; no miolo, yaw/pitch diretos (igual ao gimbal)
      let ang0 = 0, modo = 'roll';
      const cen = () => { const r = elRing.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 }; };
      const angDe = (vx, vy) => { const c = cen(); return Math.atan2(vx - c.x, -(vy - c.y)) * R2D; };
      arrastar(elRing, (vx, vy) => {
        const c = cen(), d = Math.hypot(vx - c.x, vy - c.y);
        modo = d < c.R - Math.round(D * 0.115) ? 'miolo' : 'roll';
        ang0 = angDe(vx, vy);
      }, (dx, dy, vx, vy) => {
        if (modo === 'miolo') { deUI('yaw', paraUI().yaw + dx * 0.5 / fino); deUI('pitch', paraUI().pitch - dy * 0.5 / fino); aplicar('miolo'); return; }
        const a = angDe(vx, vy); const d = wrap180(a - ang0); ang0 = a;
        deUI('roll', paraUI().roll - d / fino); aplicar('anel');   // sentido corrigido: arrastar no sentido horário gira a imagem no sentido horário
      });
    }
    arrastar(elH, () => {}, (dx) => { deUI('yaw', paraUI().yaw + dx * 360 / Math.max(1, D) / fino); aplicar('barra'); });   // largura da barra = 1 volta
    arrastar(elV, () => {}, (dx, dy) => { deUI('pitch', paraUI().pitch - dy * 180 / Math.max(1, D) / fino); aplicar('barra'); });   // altura da barra = 180°
    layoutAneis(); window.addEventListener('resize', layoutAneis);
    // [22/09/2026] MUDADO — pedido verbatim: "O D-Pad deve ficar do lado dos
    // anéis se tiver espaço e a tela for mais horizontal do que vertical. O
    // D-Pad deve ficar abaixo dos anéis se tiver espaço e a tela for mais
    // vertical do que horizontal." Antes, o D-pad era posicionado relativo
    // ao painel "Controle" (que agora nasce OCULTO por padrão, ver
    // `sincronizar` acima) — faz mais sentido posicioná-lo relativo aos
    // ANÉIS (`rings`), com quem já compartilha visibilidade (mesmo toggle
    // "◎ Anéis", ver `sincronizar`). Tela "mais horizontal" = paisagem
    // (innerWidth >= innerHeight) → tenta do LADO (direita, senão
    // esquerda); "mais vertical" = retrato → tenta ABAIXO (senão do lado,
    // se não houver espaço embaixo) — sempre com um resguardo pra nunca
    // sair da tela quando o espaço preferido não existir.
    // (DPAD_W/DPAD_H/DPAD_GAP agora declaradas lá em cima, perto de `let D` — ver comentário lá.)
    function posDpad() {
      const r = rings.getBoundingClientRect();
      if (!r.width) return;
      const paisagem = window.innerWidth >= window.innerHeight;
      const espacoDireita = window.innerWidth - r.right, espacoEsquerda = r.left, espacoAbaixo = window.innerHeight - r.bottom;
      let left, top;
      const doLado = () => {
        if (espacoDireita >= DPAD_W + DPAD_GAP) left = r.right + DPAD_GAP;
        else if (espacoEsquerda >= DPAD_W + DPAD_GAP) left = r.left - DPAD_GAP - DPAD_W;
        else left = clamp(r.right + DPAD_GAP, 4, window.innerWidth - DPAD_W - 4);
        top = clamp(Math.round(r.top + r.height / 2 - DPAD_H / 2), 4, window.innerHeight - DPAD_H - 4);
      };
      const doAbaixo = () => {
        left = clamp(Math.round(r.left + r.width / 2 - DPAD_W / 2), 4, window.innerWidth - DPAD_W - 4);
        if (espacoAbaixo >= DPAD_H + DPAD_GAP) top = r.bottom + DPAD_GAP;
        else top = clamp(r.top - DPAD_GAP - DPAD_H, 4, window.innerHeight - DPAD_H - 4);
      };
      if (paisagem) { if (espacoDireita >= DPAD_W + DPAD_GAP || espacoEsquerda >= DPAD_W + DPAD_GAP) doLado(); else doAbaixo(); }
      else if (espacoAbaixo >= DPAD_H + DPAD_GAP) doAbaixo(); else doLado();
      dpad.style.right = 'auto'; dpad.style.left = Math.round(left) + 'px'; dpad.style.top = Math.round(top) + 'px';
    }
    window.addEventListener('resize', posDpad); setTimeout(posDpad, 60);
    dpad.querySelectorAll('button').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); b.setPointerCapture?.(e.pointerId);
        if (b.dataset.z) { estado.pitch = 0; estado.roll = 0; aplicar('zero'); return; }
        const k = b.dataset.k, d = Number(b.dataset.d);
        passo(k, d, e.shiftKey); pararHold();
        holdT = setTimeout(() => { holdI = setInterval(() => passo(k, d, e.shiftKey), 45); }, 350);
      });
      ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, pararHold));
    });

    panel.querySelector('[data-a="min"]').onclick = (e) => { panel.classList.toggle('cc3d-min'); e.target.textContent = panel.classList.contains('cc3d-min') ? '▸' : '▾'; posDpad(); };
    panel.querySelector('[data-a="reset"]').onclick = () => { Object.assign(estado, inicial); aplicar('reset'); };
    panel.querySelector('[data-a="zero"]').onclick = () => { estado.pitch = 0; estado.roll = 0; aplicar('zero'); };

    // ---- miniatura: desenho ----
    const ctx = cv.getContext('2d');
    let rafPend = false;
    function desenhar() {
      if (rafPend) return; rafPend = true;
      requestAnimationFrame(() => { rafPend = false; if (ctx) pintar(); });
    }
    function bases() {
      const cy = Math.cos(estado.yaw), sy = Math.sin(estado.yaw), cp = Math.cos(estado.pitch), sp = Math.sin(estado.pitch);
      // frente: mesma fórmula de cameraForward (rotX depois rotY)
      const f = [sy * cp, -sp, cy * cp];
      const up0 = [0, 1, 0];
      // direita do Three: frente x cima
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
      let r = norm(cross(f, up0));
      let u = norm(cross(r, f)); // cima da câmera (sem roll)
      // roll horário visto da câmera: cima inclina para a direita
      const cr = Math.cos(estado.roll), sr = Math.sin(estado.roll);
      const r2 = [r[0] * cr - u[0] * sr, r[1] * cr - u[1] * sr, r[2] * cr - u[2] * sr];
      const u2 = [u[0] * cr + r[0] * sr, u[1] * cr + r[1] * sr, u[2] * cr + r[2] * sr];
      return { f, r: r2, u: u2, yawFwd: [sy, 0, cy], yawRight: [-cy, 0, sy] };
    }
    function pintar() {
      const S = 150;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      const P = makeProjector(vista.az, vista.el, S);
      const B = bases();
      const linha = (pts, cor, w = 1, fechar = false, alfa = 1) => {
        ctx.beginPath();
        pts.forEach((p, i) => { const q = P(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
        if (fechar) ctx.closePath();
        ctx.globalAlpha = alfa; ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.stroke(); ctx.globalAlpha = 1;
      };
      const circ = (c, u, v, r, n = 48) => {
        const out = [];
        for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r; out.push([c[0] + u[0] * ca + v[0] * sa, c[1] + u[1] * ca + v[1] * sa, c[2] + u[2] * ca + v[2] * sa]); }
        return out;
      };
      // chão em miniatura: grade circular sutil
      const yF = -0.95;
      [0.33, 0.66, 1].forEach((r) => linha(circ([0, yF, 0], [1, 0, 0], [0, 0, 1], r), '#9fb0c8', 1, false, 0.28));
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; linha([[0, yF, 0], [Math.cos(a), yF, Math.sin(a)]], '#9fb0c8', 1, false, 0.2); }
      // norte do mundo (−Z): linha + rótulo "N" no chão da miniatura
      linha([[0, yF, 0], [0, yF, -1.12]], '#ff8a3d', 1.6, false, 0.9);
      { const qn = P([0, yF, -1.28]); ctx.font = 'bold 11px system-ui'; ctx.fillStyle = '#ff8a3d'; ctx.fillText('N', qn.x - 4, qn.y + 3); }
      // gimbal: anel Y (yaw, verde, fixo), anel X (pitch, vermelho, gira com o yaw), anel Z (roll, azul, gira com yaw+pitch)
      linha(circ([0, 0, 0], [1, 0, 0], [0, 0, 1], 0.95), '#4cd964', 2.4);
      linha(circ([0, 0, 0], B.yawFwd, [0, 1, 0], 0.8), '#ff5a5a', 2.4);
      linha(circ([0, 0, 0], B.r, B.u, 0.65), '#5aa9ff', 2.4);
      // modelo da câmera (caixa + lente + capuz), em coordenadas locais (x = direita, y = cima, z = frente)
      const L = (x, y, z) => [B.r[0] * x + B.u[0] * y + B.f[0] * z, B.r[1] * x + B.u[1] * y + B.f[1] * z, B.r[2] * x + B.u[2] * y + B.f[2] * z];
      const hx = 0.26, hy = 0.17, z0 = -0.34, z1 = 0.14;
      const v = [L(-hx, -hy, z0), L(hx, -hy, z0), L(hx, hy, z0), L(-hx, hy, z0), L(-hx, -hy, z1), L(hx, -hy, z1), L(hx, hy, z1), L(-hx, hy, z1)];
      const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]];
      const cores = ['#3b4453', '#4a5568', '#2f3744', '#5b667a', '#3a4252', '#3a4252'];
      faces.map((fc, i) => ({ fc, i, z: fc.reduce((s, k) => s + P(v[k]).z, 0) / 4 })).sort((a, b) => a.z - b.z).forEach(({ fc, i }) => {
        ctx.beginPath(); fc.forEach((k, j) => { const q = P(v[k]); j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.closePath();
        ctx.fillStyle = cores[i]; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = '#9aa7bb'; ctx.lineWidth = 0.8; ctx.stroke();
      });
      const lenteA = circ(L(0, 0, z1), B.r, B.u, 0.13, 20), lenteB = circ(L(0, 0, z1 + 0.22), B.r, B.u, 0.17, 20);
      linha(lenteA, '#cfd6e4', 1.2); linha(lenteB, '#e8ecf2', 1.4);
      for (let i = 0; i < 20; i += 5) linha([lenteA[i], lenteB[i]], '#cfd6e4', 1);
      // seta de direção (para onde a câmera olha) + marca do "cima" da câmera
      linha([L(0, 0, z1 + 0.22), L(0, 0, 1.15)], '#ffd54a', 2.2);
      linha([L(0, hy, 0), L(0, hy + 0.3, 0)], '#ffffff', 2);
      // rótulos dos eixos
      ctx.font = '10px system-ui'; ctx.fillStyle = '#e8ecf2';
      [['Y', [0, 0.95, 0], '#4cd964'], ['X', B.yawFwd.map((c) => c * 0.8), '#ff5a5a'], ['Z', B.f.map((c) => c * 0.65), '#5aa9ff']].forEach(([t, p, cor]) => {
        const q = P(p); ctx.fillStyle = cor; ctx.fillText(t, q.x + 3, q.y - 3);
      });
    }

    // ---- miniatura: interação (clicar e arrastar) ----
    let drag = null;
    const centro = () => { const r = cv.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 }; };
    gimbal.addEventListener('pointerdown', (e) => {
      e.preventDefault(); gimbal.setPointerCapture(e.pointerId); gimbal.style.cursor = 'grabbing';
      const c = centro(), d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
      const modo = (e.button === 2 || e.shiftKey) ? 'vista' : (d > c.R * 0.78 ? 'roll' : 'yawpitch');
      drag = { modo, x: e.clientX, y: e.clientY, ang: Math.atan2(e.clientY - c.y, e.clientX - c.x) };
    });
    gimbal.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.modo === 'vista') {                  // só a câmera representativa/vista da miniatura: cena intacta
        vista.az += dx * 0.012; vista.el = clamp(vista.el + dy * 0.012, -1.4, 1.4);
        drag.x = e.clientX; drag.y = e.clientY; desenhar(); return;
      }
      if (drag.modo === 'roll') {
        const c = centro(), ang = Math.atan2(e.clientY - c.y, e.clientX - c.x);
        let da = ang - drag.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        const ui = paraUI(); deUI('roll', ui.roll + da * R2D / fino);   // sentido horário na tela = roll horário
        drag.ang = ang; drag.x = e.clientX; drag.y = e.clientY; aplicar('gimbal'); return;
      }
      const ui = paraUI();
      deUI('yaw', ui.yaw + dx * 0.5 / fino);        // arrastar para a direita -> olhar para a direita
      deUI('pitch', ui.pitch - dy * 0.5 / fino);    // arrastar para cima -> olhar para cima
      drag.x = e.clientX; drag.y = e.clientY; aplicar('gimbal');
    });
    const fim = () => { drag = null; gimbal.style.cursor = 'grab'; };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => gimbal.addEventListener(ev, fim));

    aplicar('init');
    sincronizar();
    const syncI = setInterval(() => { if (!gimbal.isConnected) { clearInterval(syncI); return; } sincronizar(); atualizarAneis(); atualizaDbg(); posDpad(); posTgl(); }, 500);
    setTimeout(atualizarAneis, 60);

    return {
      destroy() {
        pararHold(); clearTimeout(saveT); clearInterval(syncI); window.removeEventListener('resize', garantirVisivel); tgl.remove(); rings.remove(); dpad.remove(); mao.remove(); window.removeEventListener('resize', layoutAneis); window.removeEventListener('resize', posDpad); window.removeEventListener('resize', posTgl);
        try { if (view._camCtlSujo && window.DB) salvarFoto(); } catch (e) { /* ignora */ }
        gimbal.remove(); panel.remove();
      },
    };
  }

  // HUD de debug SEMPRE visível assim que o "Ver em 3D" abre (mostra se este script carregou e em que modo a câmera está).
  function debugHud(view) {
    try {
      console.log('[CamControl3D] script carregado; HUD de debug criado no Ver em 3D');
      const pai = document.body;
      document.querySelectorAll('.cc3d-hud').forEach((e) => e.remove());
      if (!document.getElementById('cc3d-css')) { const st = document.createElement('style'); st.id = 'cc3d-css'; st.textContent = CSS; document.head.appendChild(st); }
      const h = document.createElement('div');
      h.className = 'cc3d-hud';
      h.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483000;background:rgba(10,14,20,.85);color:#7fdc8f;font:11px monospace;padding:5px 8px;border-radius:6px;pointer-events:none;white-space:pre';
      pai.appendChild(h);
      const tick = () => {
        if (!h.isConnected) return;
        const c = Object.assign({}, (window.MapConfig && MapConfig._cache) || {}, view._paredeConfig || {});
        h.style.display = c.debugCamHudAtivo === true ? '' : 'none';
        if (!view._container || !view._container.isConnected || !view._container.querySelector('#v3d-lockstate')) { h.remove(); try { if (view._camCtl) { view._camCtl.destroy(); view._camCtl = null; } } catch (e) { /* ignora */ } return; }   // saiu do Ver em 3D
        const modo = view._fotoCamMode ? 'câmera de foto' : 'livre';
        h.textContent = 'CamControl3D ✓ carregado · modo: ' + modo + '\npainel: ' + (view._camCtl ? 'ABERTO' : 'fechado') + ' · câmera travada: ' + (view._fotoCamMode ? 'sim' : 'não');
        setTimeout(tick, 500);
      };
      tick();
    } catch (e) { console.error('[CamControl3D] debugHud falhou', e); }
  }
  console.log('[CamControl3D] js/camcontrol3d.js carregado');
  window.CamControl3D = { create, debugHud };
})();
