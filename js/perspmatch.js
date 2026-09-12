/**
 * perspmatch.js — UI e estado de sessão da ferramenta "📐 Camera Match"
 * (Camera Matching / Calibração de câmera por perspectiva).
 *
 * [10/09/2026] Implementação (v1) da spec 'Camera Matching / Persp Match'
 * solicitada pelo usuário (documento salvo no projeto Claude:
 * 'spec-camera-matching-persp-match.md'). Este arquivo cuida de TUDO que é
 * DOM/estado/persistência; a matemática pura (EXIF, pontos de fuga,
 * raycasting, reprojeção) mora em js/perspmatch-math.js (`window.PerspMatchMath`)
 * — ver aquele arquivo pro porquê da separação.
 *
 * DECISÃO DE ARQUITETURA (v1, documentada aqui de propósito pra quem for
 * retomar depois): em vez de "hackear" o motor 3D já em uso (Engine3D/
 * View3D — otimizado pra navegação em 1ª pessoa com física/pointer-lock/
 * hotbar, tudo MUITO acoplado a esse propósito), a ferramenta abre como um
 * overlay MODAL independente, com seu PRÓPRIO `THREE.WebGLRenderer`/
 * `THREE.Scene`/`THREE.PerspectiveCamera`, plugando por cima do app
 * (`document.body`), nunca reaproveitando o loop de render do View3D. A cena
 * 3D usada de fundo (por trás da foto) é uma versão LEVE (wireframe simples,
 * caixas/linhas) construída direto de `map.walls`/`map.objects`/`map.cameras`
 * — não a malha completa e otimizada do Engine3D (texturas, luzes, LOD,
 * customMesh do Modelador etc.). Isso é uma simplificação DELIBERADA da v1
 * (documentada no relatório final): dá pro usuário uma referência visual real
 * o bastante pra alinhar contra a foto, sem o risco de reescrever/acoplar
 * engine3d.js inteiro a um "modo calibração" que ele nunca foi desenhado pra
 * ter. Extensão futura natural: trocar `_buildLightScene` por uma chamada a
 * `Engine3D.setScene` de verdade.
 *
 * Entrypoint: `PerspMatch.open({ map, rebuildScene })` — ver wiring em
 * js/view3d.js (botão "📐 Camera Match" na barra superior do 3D).
 */

const PerspMatch = {
  _s: null, // estado da sessão aberta no momento (só 1 por vez — ver open()/close())

  // ======================================================================
  // Entrada / saída
  // ======================================================================

  /** Abre a ferramenta. `map` = documento do mapa atual (mesmo objeto que
   *  View3D/MapView já têm em memória — Mapping.addCamera/addObject mexem
   *  NELE diretamente, igual todo resto do app). `rebuildScene` (opcional) =
   *  callback pra pedir que a tela de onde a ferramenta foi aberta
   *  redesenhe (ex. `View3D._rebuildScene()`) depois de salvar. */
  async open({ map, rebuildScene } = {}) {
    if (!map) { Utils.toast('⚠️ Nenhum mapa carregado — abra um mapa antes de usar o Camera Match.', { type: 'warn' }); return; }
    if (this._s) this.close(); // nunca duas sessões abertas ao mesmo tempo
    if (typeof THREE === 'undefined') { Utils.toast('⚠️ Motor 3D (Three.js) ainda não carregou — tente de novo em alguns segundos.', { type: 'warn' }); return; }

    this._s = {
      map,
      THREE: window.THREE,
      onRebuildScene: rebuildScene || null,
      session: null,
      camera3: null,
      renderer: null,
      lightScene: null,
      rafHandle: null,
      wireframe: false,
      opacidadeFoto: 70,
      pisoAtivo: 0,
      modoClique: null, // { tipo: 'linha'|'ancora'|'objeto', pontos:[{u,v}], ...extra }
      numFields: {}, // cache dos widgets ModelerUI._createNumField (setValue sem reconstruir)
    };

    this._injectStyleOnce();
    this._buildDom();
    const sessoesExistentes = (typeof DB !== 'undefined') ? await DB.getPerspMatchSessionsForMapa(map.id) : [];
    if (sessoesExistentes.length) {
      this._renderPickerScreen(sessoesExistentes);
    } else {
      this._renderFase0Screen();
    }
  },

  close() {
    if (!this._s) return;
    if (this._s.rafHandle) cancelAnimationFrame(this._s.rafHandle);
    window.removeEventListener('resize', this._s._onResize);
    this._s.el?.remove();
    this._s = null;
  },

  // ======================================================================
  // DOM base / estilo (injetado 1x, reaproveitado nas reaberturas)
  // ======================================================================

  _injectStyleOnce() {
    if (document.getElementById('pm-style')) return;
    const style = document.createElement('style');
    style.id = 'pm-style';
    style.textContent = `
      .pm-overlay { position:fixed; inset:0; z-index:9000; background:#14171c; color:#e8ecf1; display:flex; flex-direction:column; font:13px/1.4 system-ui,sans-serif; }
      .pm-topbar { display:flex; align-items:center; gap:8px; padding:8px 12px; background:#1c2129; border-bottom:1px solid #2c313a; flex-wrap:wrap; }
      .pm-topbar h2 { font-size:15px; margin:0 8px 0 0; flex:none; }
      .pm-topbar .pm-spacer { flex:1; }
      .pm-btn { background:#2c313a; color:#e8ecf1; border:1px solid #3a4048; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:12px; }
      .pm-btn:hover { background:#3a4048; }
      .pm-btn.pm-primary { background:#2f7dd6; border-color:#2f7dd6; }
      .pm-btn.pm-primary:hover { background:#3a8ae0; }
      .pm-btn.pm-danger { background:#7d2f2f; border-color:#7d2f2f; }
      .pm-btn.pm-active { outline:2px solid #4fd1ff; }
      .pm-body { flex:1; display:flex; min-height:0; }
      .pm-viewport-wrap { flex:1; display:flex; align-items:center; justify-content:center; position:relative; background:#0b0d10; overflow:hidden; }
      .pm-viewport { position:relative; }
      .pm-viewport canvas, .pm-viewport img, .pm-viewport svg { position:absolute; top:0; left:0; width:100%; height:100%; }
      .pm-viewport img { pointer-events:none; object-fit:fill; }
      .pm-viewport svg { cursor:crosshair; }
      .pm-sidebar { width:300px; flex:none; background:#1c2129; border-left:1px solid #2c313a; overflow-y:auto; padding:10px; }
      .pm-sidebar h3 { font-size:12px; text-transform:uppercase; letter-spacing:.04em; opacity:.75; margin:14px 0 6px; }
      .pm-sidebar h3:first-child { margin-top:0; }
      .pm-row { display:flex; gap:6px; align-items:center; margin-bottom:6px; flex-wrap:wrap; }
      .pm-row label { flex:1; min-width:70px; opacity:.85; }
      .pm-row input[type=text], .pm-row input[type=number], .pm-row select { flex:1; min-width:70px; background:#0e1116; color:#e8ecf1; border:1px solid #3a4048; border-radius:4px; padding:4px 6px; }
      .pm-hint { font-size:11px; opacity:.65; margin:2px 0 8px; }
      .pm-badge { display:inline-block; padding:2px 6px; border-radius:10px; font-size:10px; font-weight:600; }
      .pm-badge-exif { background:#1f5c3a; color:#8ff0b0; }
      .pm-badge-vp { background:#1f4b5c; color:#8fd8f0; }
      .pm-badge-padrao { background:#5c4a1f; color:#f0d88f; }
      .pm-list-item { background:#12151a; border:1px solid #2c313a; border-radius:6px; padding:6px 8px; margin-bottom:6px; }
      .pm-list-item .pm-row:last-child { margin-bottom:0; }
      .pm-nf-slot { margin-bottom:4px; }
      .pm-fase0-center { margin:auto; text-align:center; max-width:420px; }
      .pm-fase0-center h2 { font-size:20px; }
      .pm-fase0-center .pm-btn { font-size:14px; padding:12px 18px; margin:6px; }
      .pm-picker-item { background:#12151a; border:1px solid #2c313a; border-radius:8px; padding:10px; margin:8px 0; display:flex; justify-content:space-between; align-items:center; gap:10px; }
      .pm-rms-ok { color:#8ff0b0; }
      .pm-rms-warn { color:#f0d88f; }
      .pm-rms-bad { color:#f08f8f; }
    `;
    document.head.appendChild(style);
  },

  _buildDom() {
    const el = document.createElement('div');
    el.className = 'pm-overlay';
    el.innerHTML = `
      <div class="pm-topbar">
        <h2>📐 Camera Match</h2>
        <span id="pm-fov-badge"></span>
        <span id="pm-rms-badge"></span>
        <div class="pm-spacer"></div>
        <button type="button" class="pm-btn pm-primary" id="pm-save" hidden>💾 Confirmar e salvar</button>
        <button type="button" class="pm-btn" id="pm-close">✕ Fechar</button>
      </div>
      <div class="pm-body" id="pm-body"></div>
    `;
    document.body.appendChild(el);
    this._s.el = el;
    el.querySelector('#pm-close').onclick = () => this.close();
    el.querySelector('#pm-save').onclick = () => this._confirmarSalvar();
  },

  _body() { return this._s.el.querySelector('#pm-body'); },

  // ======================================================================
  // Tela "escolher sessão" (spec §4 — sessão reaberta) / Fase 0 (foto)
  // ======================================================================

  _renderPickerScreen(sessoes) {
    const body = this._body();
    body.innerHTML = `<div class="pm-fase0-center" style="max-width:520px">
      <h2>Sessões de Camera Match neste mapa</h2>
      <p class="pm-hint">Reabrir uma sessão carrega a foto e a calibração salvas — ajuste e salve de novo sem repetir a marcação de linhas de fuga do zero.</p>
      <div id="pm-picker-list"></div>
      <button type="button" class="pm-btn pm-primary" id="pm-picker-novo">+ Nova sessão</button>
    </div>`;
    const list = body.querySelector('#pm-picker-list');
    sessoes.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'pm-picker-item';
      const data = s.atualizadoEm ? new Date(s.atualizadoEm).toLocaleString('pt-BR') : '—';
      item.innerHTML = `<span>📷 Sessão de ${data} — ${s.foto?.larguraPx || '?'}×${s.foto?.alturaPx || '?'}px, fonte FoV: ${s.intrinsecos?.fonteFov || '?'}</span>
        <span><button type="button" class="pm-btn" data-act="abrir">Reabrir</button> <button type="button" class="pm-btn pm-danger" data-act="del">🗑️</button></span>`;
      item.querySelector('[data-act=abrir]').onclick = () => this._carregarSessao(s);
      item.querySelector('[data-act=del]').onclick = async () => {
        if (!confirm('Apagar esta sessão Persp Match? A câmera/objetos já salvos no mapa NÃO são removidos, só a sessão de calibração (fica sem poder reabrir/ajustar depois).')) return;
        await DB.deletePerspMatchSession(s.id);
        item.remove();
      };
      list.appendChild(item);
    });
    body.querySelector('#pm-picker-novo').onclick = () => this._renderFase0Screen();
  },

  _renderFase0Screen() {
    const body = this._body();
    body.innerHTML = `<div class="pm-fase0-center">
      <h2>Fase 0 — Foto de referência</h2>
      <p class="pm-hint">Tire ou importe uma foto real do espaço. Fotos IMPORTADAS costumam trazer EXIF (metadados de câmera) — usado pra estimar o campo de visão inicial automaticamente. Fotos "tiradas agora" pelo navegador normalmente NÃO têm EXIF (limitação do próprio navegador) — o FoV cai pro padrão de 60°, ajustável na Fase 2 com linhas de fuga.</p>
      <button type="button" class="pm-btn pm-primary" id="pm-fase0-importar">🖼️ Importar foto</button>
      <button type="button" class="pm-btn" id="pm-fase0-capturar">📷 Tirar agora</button>
      <input type="file" accept="image/*" id="pm-file-importar" hidden>
      <input type="file" accept="image/*" capture="environment" id="pm-file-capturar" hidden>
    </div>`;
    const fi = body.querySelector('#pm-file-importar');
    const fc = body.querySelector('#pm-file-capturar');
    body.querySelector('#pm-fase0-importar').onclick = () => fi.click();
    body.querySelector('#pm-fase0-capturar').onclick = () => fc.click();
    fi.onchange = () => { if (fi.files[0]) this._onFotoSelecionada(fi.files[0], 'importada'); };
    fc.onchange = () => { if (fc.files[0]) this._onFotoSelecionada(fc.files[0], 'capturada'); };
  },

  async _onFotoSelecionada(file, origem) {
    Utils.toast('⏳ Processando foto...', { duration: 1200 });
    let buf;
    try { buf = await file.arrayBuffer(); } catch (e) { Utils.toast('⚠️ Não foi possível ler o arquivo.', { type: 'warn' }); return; }
    const exif = PerspMatchMath.readExif(buf);
    const dataUrl = await this._blobToDataURL(file);
    const img = new Image();
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    } catch (e) { Utils.toast('⚠️ Não foi possível decodificar a imagem.', { type: 'warn' }); return; }
    const larguraPx = img.naturalWidth, alturaPx = img.naturalHeight;
    const { fovHDeg, fovVDeg, fonteFov } = PerspMatchMath.computeFovFromExif(exif, larguraPx, alturaPx);

    const id = Utils.uid('pms');
    this._s.session = {
      id,
      mapaId: this._s.map.id,
      criadoEm: DB.nowISO(),
      atualizadoEm: DB.nowISO(),
      foto: {
        origem,
        dataUrlOuBlobRef: dataUrl,
        larguraPx, alturaPx,
        exif: exif ? { focalLength35mm: exif.focalLength35mm, focalLengthMm: exif.focalLengthMm, sensorWidthMm: exif.sensorWidthMm, make: exif.make, model: exif.model, orientacao: exif.orientacao } : null,
      },
      intrinsecos: { fovHDeg, fovVDeg, fonteFov, pontoPrincipal: { u: 0.5, v: 0.5 } },
      extrinsecos: {
        posicao: this._chuteInicialPosicao(),
        yawDeg: 0, pitchDeg: 0, rollDeg: 0,
        confianca: { erroReprojecaoRmsPx: 0, numPontosControle: 0 },
      },
      planoDeChao: { origem: 'padrao_z0', normal: { x: 0, y: 1, z: 0 }, constante: 0 },
      linhasDeFuga: [],
      ancorasDeEscala: [],
      objetosPosicionados: [],
      arraysReplicados: [],
      planosAuxiliares: [],
    };
    this._renderEditorScreen();
  },

  async _carregarSessao(session) {
    this._s.session = session;
    this._renderEditorScreen();
  },

  _chuteInicialPosicao() {
    const b = this._s.map.bounds;
    if (b && isFinite(b.minX) && isFinite(b.maxX)) return { x: (b.minX + b.maxX) / 2, y: 1.6, z: (b.minY + b.maxY) / 2 };
    return { x: 0, y: 1.6, z: 0 };
  },

  _blobToDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  },

  // ======================================================================
  // Tela principal (Fases 1-4 juntas — backdrop + calibração + posicionamento)
  // ======================================================================

  _renderEditorScreen() {
    const body = this._body();
    body.innerHTML = `
      <div class="pm-viewport-wrap" id="pm-viewport-wrap">
        <div class="pm-viewport" id="pm-viewport">
          <canvas id="pm-canvas"></canvas>
          <img id="pm-img" alt="Foto de referência">
          <svg id="pm-svg"></svg>
        </div>
      </div>
      <div class="pm-sidebar" id="pm-sidebar"></div>
    `;
    this._s.el.querySelector('#pm-save').hidden = false;
    this._s.img = body.querySelector('#pm-img');
    this._s.canvas = body.querySelector('#pm-canvas');
    this._s.svg = body.querySelector('#pm-svg');
    this._s.img.src = this._s.session.foto.dataUrlOuBlobRef;

    this._initCamera3();
    this._buildLightScene();
    this._renderSidebar();
    this._wireViewportClicks();

    this._s._onResize = () => this._layoutViewport();
    window.addEventListener('resize', this._s._onResize);
    this._layoutViewport();
    this._startRenderLoop();
    this._recomputeConfianca();
  },

  _initCamera3() {
    const { THREE } = this._s;
    const s = this._s.session;
    const aspect = s.foto.larguraPx / s.foto.alturaPx;
    const cam = new THREE.PerspectiveCamera(s.intrinsecos.fovVDeg || 50, aspect, 0.05, 500);
    this._s.camera3 = cam;
    this._s.renderer = new THREE.WebGLRenderer({ canvas: this._s.canvas, antialias: true, alpha: true });
    this._s.renderer.setClearColor(0x000000, 0);
    this._syncCamera3();
  },

  /** Aplica `session.intrinsecos`/`extrinsecos` na THREE.PerspectiveCamera de
   *  verdade — chamado sempre que QUALQUER slider/ponto de fuga muda o
   *  estado. `updateMatrixWorld(true)` força a atualização IMEDIATA (não
   *  esperar o próximo frame) porque um clique de posicionamento pode
   *  acontecer logo em seguida, na mesma ação do usuário. */
  _syncCamera3() {
    const { THREE } = this._s;
    const s = this._s.session;
    const cam = this._s.camera3;
    if (!cam) return;
    const aspect = s.foto.larguraPx / s.foto.alturaPx;
    // FoV vertical, derivado do horizontal (editável) — `PerspectiveCamera.fov`
    // do Three.js é SEMPRE vertical; ver spec §2.1 fórmula inversa.
    const fovHRad = Utils.clamp(s.intrinsecos.fovHDeg, 1, 179) * Math.PI / 180;
    const fovVRad = 2 * Math.atan(Math.tan(fovHRad / 2) / aspect);
    s.intrinsecos.fovVDeg = fovVRad * 180 / Math.PI;
    cam.fov = s.intrinsecos.fovVDeg;
    cam.aspect = aspect;
    cam.position.set(s.extrinsecos.posicao.x, s.extrinsecos.posicao.y, s.extrinsecos.posicao.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(
      s.extrinsecos.pitchDeg * Math.PI / 180,
      s.extrinsecos.yawDeg * Math.PI / 180,
      s.extrinsecos.rollDeg * Math.PI / 180,
    );
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  },

  /** Cena 3D LEVE (wireframe) construída direto de map.walls/objects/cameras
   *  — ver comentário de arquitetura no topo do arquivo. Reconstruída
   *  inteira a cada chamada (mapas típicos deste app são pequenos o
   *  bastante — dezenas/centenas de paredes/objetos — pra isso não pesar;
   *  só é chamada ao abrir e ao alternar o toggle wireframe/cor). */
  _buildLightScene() {
    const { THREE } = this._s;
    const map = this._s.map;
    const scene = new THREE.Scene();
    const cor = this._s.wireframe ? 0xffffff : 0x4fd1ff;
    const mat = new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.85 });

    (map.walls || []).forEach((w) => {
      const baseY = (w.piso || 0) * 2.8;
      const h = w.height || 2.6;
      const pts = [
        new THREE.Vector3(w.x1, baseY, w.y1), new THREE.Vector3(w.x2, baseY, w.y2),
        new THREE.Vector3(w.x2, baseY + h, w.y2), new THREE.Vector3(w.x1, baseY + h, w.y1),
        new THREE.Vector3(w.x1, baseY, w.y1),
      ];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    });
    (map.objects || []).forEach((o) => {
      const baseY = (o.piso || 0) * 2.8 + (o.elevacao || 0);
      const larg = o.largura || o.raio * 2 || 0.4, prof = o.profundidade || o.raio * 2 || 0.4, alt = o.altura || 0.5;
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(larg, alt, prof));
      const line = new THREE.LineSegments(geo, mat);
      line.position.set(o.x, baseY + alt / 2, o.y);
      line.rotation.y = -(o.angulo || 0);
      scene.add(line);
    });
    (map.cameras || []).forEach((c) => {
      const baseY = (c.piso || 0) * 2.8 + 1.6;
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.22, 0.16, 0.16));
      const line = new THREE.LineSegments(geo, mat);
      line.position.set(c.x, baseY, c.y);
      scene.add(line);
    });
    // marcadores dos objetos JÁ posicionados nesta sessão (Fase 3) + da
    // câmera calibrada em si (uma pequena cruz na origem/posição da câmera,
    // útil pra ver se a posição bate com a planta enquanto ajusta X/Y/Z).
    const s = this._s.session;
    const matObjNovo = new THREE.LineBasicMaterial({ color: 0xffd24f });
    (s.objetosPosicionados || []).forEach((op) => {
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.3, 0.3, 0.3));
      const line = new THREE.LineSegments(geo, matObjNovo);
      line.position.set(op.posicaoMundo.x, op.posicaoMundo.y + 0.15, op.posicaoMundo.z);
      scene.add(line);
    });
    const grid = new THREE.GridHelper(60, 60, 0x2c313a, 0x1c2129);
    scene.add(grid);
    this._s.lightScene = scene;
  },

  _startRenderLoop() {
    const loop = () => {
      if (!this._s) return;
      this._s.renderer.render(this._s.lightScene, this._s.camera3);
      this._s.rafHandle = requestAnimationFrame(loop);
    };
    this._s.rafHandle = requestAnimationFrame(loop);
  },

  /** Letterbox (spec §Fase1 passo 4): a foto é ajustada por "contain" dentro
   *  do viewport disponível, NUNCA esticada — o aspect da câmera calibrada
   *  (`_syncCamera3`) usa sempre o aspect real da FOTO, não da janela. */
  _layoutViewport() {
    if (!this._s || !this._s.session) return;
    const wrap = this._s.el.querySelector('#pm-viewport-wrap');
    const wrapRect = wrap.getBoundingClientRect();
    const s = this._s.session;
    const photoAspect = s.foto.larguraPx / s.foto.alturaPx;
    const wrapAspect = wrapRect.width / Math.max(1, wrapRect.height);
    let w, h;
    if (photoAspect > wrapAspect) { w = wrapRect.width; h = w / photoAspect; } else { h = wrapRect.height; w = h * photoAspect; }
    const vp = this._s.el.querySelector('#pm-viewport');
    vp.style.width = `${w}px`;
    vp.style.height = `${h}px`;
    const dpr = window.devicePixelRatio || 1;
    this._s.renderer.setPixelRatio(dpr);
    this._s.renderer.setSize(w, h, true);
    this._s.svg.setAttribute('viewBox', `0 0 ${s.foto.larguraPx} ${s.foto.alturaPx}`);
  },

  // ======================================================================
  // Overlay SVG: marcadores de linhas de fuga / âncoras / objetos
  // ======================================================================

  _wireViewportClicks() {
    const svg = this._s.svg;
    svg.onclick = (ev) => {
      const rect = svg.getBoundingClientRect();
      const s = this._s.session;
      const u = (ev.clientX - rect.left) / rect.width * s.foto.larguraPx;
      const v = (ev.clientY - rect.top) / rect.height * s.foto.alturaPx;
      this._onFotoClick({ u, v });
    };
  },

  _onFotoClick(pt) {
    const modo = this._s.modoClique;
    if (!modo) return;
    if (modo.tipo === 'linha') {
      modo.pontos.push(pt);
      this._redrawOverlay();
      if (modo.pontos.length === 4) {
        const vl = {
          id: Utils.uid('vl'),
          segmentos: [[modo.pontos[0], modo.pontos[1]], [modo.pontos[2], modo.pontos[3]]],
          eixoAssociado: null,
        };
        this._s.session.linhasDeFuga.push(vl);
        this._s.modoClique = null;
        this._renderSidebar();
        this._redrawOverlay();
      }
      return;
    }
    if (modo.tipo === 'ancora') {
      modo.pontos.push(pt);
      this._redrawOverlay();
      if (modo.pontos.length === 2) {
        const distStr = prompt('Distância real entre estes 2 pontos, em metros (ex.: 2.70):', '1.00');
        const dist = parseFloat(String(distStr || '').replace(',', '.'));
        this._s.modoClique = null;
        if (!dist || !(dist > 0)) { this._redrawOverlay(); return; }
        const anchor = {
          id: Utils.uid('anchor'),
          pixelA: modo.pontos[0], pixelB: modo.pontos[1],
          distanciaRealM: dist,
          vertical: !!modo.vertical,
          usadaParaEscalaFinal: this._s.session.ancorasDeEscala.length === 0,
        };
        this._s.session.ancorasDeEscala.push(anchor);
        this._renderSidebar();
        this._redrawOverlay();
        this._recomputeConfianca();
      }
      return;
    }
    if (modo.tipo === 'objeto') {
      const resultado = this._posicionarObjetoEmPixel(pt, modo.tipoObjeto, modo.plano, modo.alturaExplicitaM);
      if (!resultado.valid) { Utils.toast(`⚠️ ${resultado.reason}`, { type: 'warn', duration: 4000 }); return; }
      const op = {
        id: Utils.uid('objnovo'),
        clique: pt,
        planoUsado: modo.plano,
        alturaExplicitaM: modo.plano === 'altura_explicita' ? modo.alturaExplicitaM : null,
        posicaoMundo: resultado.point,
        vinculadoAObjetoDoMapa: null,
        tipoObjeto: modo.tipoObjeto || 'generico',
      };
      this._s.session.objetosPosicionados.push(op);
      this._buildLightScene();
      this._renderSidebar();
      this._redrawOverlay();
      this._recomputeConfianca();
    }
  },

  _redrawOverlay() {
    const svg = this._s.svg;
    const s = this._s.session;
    const modo = this._s.modoClique;
    let html = '';
    const circle = (p, cor, r = 6) => `<circle cx="${p.u}" cy="${p.v}" r="${r}" fill="none" stroke="${cor}" stroke-width="3"/>`;
    const line = (a, b, cor) => `<line x1="${a.u}" y1="${a.v}" x2="${b.u}" y2="${b.v}" stroke="${cor}" stroke-width="2"/>`;
    (s.linhasDeFuga || []).forEach((vl, i) => {
      const cor = vl.eixoAssociado === 'x' ? '#ff6b6b' : (vl.eixoAssociado === 'z' ? '#6bb0ff' : '#f0d88f');
      const [seg1, seg2] = vl.segmentos;
      html += line(seg1[0], seg1[1], cor) + line(seg2[0], seg2[1], cor);
      html += circle(seg1[0], cor, 4) + circle(seg1[1], cor, 4) + circle(seg2[0], cor, 4) + circle(seg2[1], cor, 4);
    });
    (s.ancorasDeEscala || []).forEach((a) => {
      html += line(a.pixelA, a.pixelB, '#8ff0b0') + circle(a.pixelA, '#8ff0b0') + circle(a.pixelB, '#8ff0b0');
    });
    (s.objetosPosicionados || []).forEach((op) => {
      html += circle(op.clique, '#ffd24f', 8);
    });
    if (modo) {
      const corModo = modo.tipo === 'linha' ? '#f0d88f' : (modo.tipo === 'ancora' ? '#8ff0b0' : '#ffd24f');
      modo.pontos.forEach((p) => { html += circle(p, corModo, 5); });
    }
    svg.innerHTML = html;
  },

  // ======================================================================
  // Posicionamento por clique -> ponto 3D (spec §2.3)
  // ======================================================================

  _groundPlane() {
    const { THREE } = this._s;
    return new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this._s.pisoAtivo * 2.8));
  },

  _posicionarObjetoEmPixel(pt, tipoObjeto, plano, alturaExplicitaM) {
    const { THREE } = this._s;
    const s = this._s.session;
    const ndc = PerspMatchMath.pixelToNDC(pt.u, pt.v, s.foto.larguraPx, s.foto.alturaPx);
    const planeObj = plano === 'altura_explicita'
      ? PerspMatchMath.horizontalPlaneAtHeight(alturaExplicitaM || 0, THREE)
      : this._groundPlane();
    return PerspMatchMath.raycastToPlane(this._s.camera3, ndc, planeObj, THREE);
  },

  // ======================================================================
  // Âncoras de escala — medição (spec passo 11)
  // ======================================================================

  _medirAncora(anchor) {
    const { THREE } = this._s;
    const s = this._s.session;
    const ndcA = PerspMatchMath.pixelToNDC(anchor.pixelA.u, anchor.pixelA.v, s.foto.larguraPx, s.foto.alturaPx);
    const ndcB = PerspMatchMath.pixelToNDC(anchor.pixelB.u, anchor.pixelB.v, s.foto.larguraPx, s.foto.alturaPx);
    const resA = PerspMatchMath.raycastToPlane(this._s.camera3, ndcA, this._groundPlane(), THREE);
    if (!resA.valid) return null;
    let pontoB;
    if (anchor.vertical) {
      // [10/09/2026] Caso "base + topo de um pilar" (spec §2.3 passo 4 /
      // exemplo literal do passo 11): assume que B está EXATAMENTE acima de
      // A no mundo (mesmo X,Z) — resolve o parâmetro `t` do raio de B usando
      // o eixo (X ou Z) com maior variação (mais estável numericamente,
      // evita dividir por uma direção quase nula), depois lê a altura Y
      // resultante. Ainda usa THREE.Raycaster pra montar o raio — só o
      // "plano" usado pra B é implícito (reta vertical por A), não um
      // THREE.Plane genérico.
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcB.x, ndcB.y), this._s.camera3);
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const useX = Math.abs(d.x) >= Math.abs(d.z);
      const t = useX ? (resA.point.x - o.x) / d.x : (resA.point.z - o.z) / d.z;
      if (!isFinite(t)) return null;
      pontoB = { x: resA.point.x, y: o.y + d.y * t, z: resA.point.z };
    } else {
      const resB = PerspMatchMath.raycastToPlane(this._s.camera3, ndcB, this._groundPlane(), THREE);
      if (!resB.valid) return null;
      pontoB = resB.point;
    }
    anchor._pontoA3D = resA.point;
    anchor._pontoB3D = pontoB;
    const d = Math.hypot(resA.point.x - pontoB.x, resA.point.y - pontoB.y, resA.point.z - pontoB.z);
    return d;
  },

  // ======================================================================
  // Linhas de fuga -> recalcula FoV/orientação (spec §2.2)
  // ======================================================================

  _recalcularCalibracaoPorVPs() {
    const { THREE } = this._s;
    const s = this._s.session;
    const vlX = s.linhasDeFuga.find((vl) => vl.eixoAssociado === 'x');
    const vlZ = s.linhasDeFuga.find((vl) => vl.eixoAssociado === 'z');
    if (!vlX || !vlZ) return;
    const vp1 = PerspMatchMath.vanishingPointFromSegments(vlX.segmentos);
    const vp2 = PerspMatchMath.vanishingPointFromSegments(vlZ.segmentos);
    if (!vp1 || !vp2) { Utils.toast('⚠️ Uma das linhas de fuga está quase paralela a si mesma — marcação ignorada.', { type: 'warn' }); return; }
    const pp = { u: s.intrinsecos.pontoPrincipal.u * s.foto.larguraPx, v: s.intrinsecos.pontoPrincipal.v * s.foto.alturaPx };
    const angDeg = PerspMatchMath.vpSeparationAngleDeg(vp1, vp2, pp);
    if (angDeg < 15) { Utils.toast('⚠️ Os 2 pontos de fuga marcados estão quase na mesma direção — recálculo rejeitado (spec: limiar de 15°). Marque linhas mais distintas.', { type: 'warn', duration: 5000 }); return; }
    const fPx = PerspMatchMath.caprileTorreFocalPx(vp1, vp2, pp);
    if (!fPx) { Utils.toast('⚠️ Os pontos de fuga marcados não são compatíveis com um par ortogonal válido — recálculo rejeitado.', { type: 'warn', duration: 5000 }); return; }
    const fovHDeg = PerspMatchMath.focalPxToFovHDeg(fPx, s.foto.larguraPx);
    const dirX = PerspMatchMath.pixelDirToCameraSpace(vp1, pp, fPx, THREE);
    const dirZ = PerspMatchMath.pixelDirToCameraSpace(vp2, pp, fPx, THREE);
    const { yawDeg, pitchDeg, rollDeg } = PerspMatchMath.orientationFromVPDirections(dirX, dirZ, THREE);
    s.intrinsecos.fovHDeg = fovHDeg;
    s.intrinsecos.fonteFov = (s.intrinsecos.fonteFov === 'exif' || s.intrinsecos.fonteFov === 'exif+vp') ? 'exif+vp' : 'vp';
    s.extrinsecos.yawDeg = yawDeg; s.extrinsecos.pitchDeg = pitchDeg; s.extrinsecos.rollDeg = rollDeg;
    this._syncCamera3();
    this._syncNumFieldsFromSession();
    this._buildLightScene();
    this._recomputeConfianca();
    Utils.toast('✅ FoV/orientação recalculados a partir das linhas de fuga.', { type: 'success', duration: 2000 });
  },

  // ======================================================================
  // Erro de reprojeção / confiança (spec §2.4)
  // ======================================================================

  _recomputeConfianca() {
    const { THREE } = this._s;
    const s = this._s.session;
    const erros = [];
    (s.ancorasDeEscala || []).forEach((a) => {
      this._medirAncora(a); // popula a._pontoA3D/_pontoB3D com o plano/pose ATUAL
      if (a._pontoA3D) erros.push(PerspMatchMath.reprojectionErrorPx(this._s.camera3, a._pontoA3D, a.pixelA, s.foto.larguraPx, s.foto.alturaPx, THREE).erroPx);
      if (a._pontoB3D) erros.push(PerspMatchMath.reprojectionErrorPx(this._s.camera3, a._pontoB3D, a.pixelB, s.foto.larguraPx, s.foto.alturaPx, THREE).erroPx);
    });
    (s.objetosPosicionados || []).forEach((op) => {
      if (op.clique && op.posicaoMundo) erros.push(PerspMatchMath.reprojectionErrorPx(this._s.camera3, op.posicaoMundo, op.clique, s.foto.larguraPx, s.foto.alturaPx, THREE).erroPx);
    });
    const rms = PerspMatchMath.rms(erros);
    s.extrinsecos.confianca = { erroReprojecaoRmsPx: rms, numPontosControle: erros.length };
    const badge = this._s.el.querySelector('#pm-rms-badge');
    if (badge) {
      if (!erros.length) { badge.innerHTML = ''; }
      else {
        const cls = rms <= 3 ? 'pm-rms-ok' : (rms <= 10 ? 'pm-rms-warn' : 'pm-rms-bad');
        badge.innerHTML = `<span class="${cls}">Erro reprojeção: ${rms.toFixed(1)}px (${erros.length} pts)</span>`;
      }
    }
    const fovBadge = this._s.el.querySelector('#pm-fov-badge');
    if (fovBadge) {
      const map = { exif: ['pm-badge-exif', 'FoV: EXIF'], 'exif+vp': ['pm-badge-exif', 'FoV: EXIF+linhas'], vp: ['pm-badge-vp', 'FoV: linhas de fuga'], manual: ['pm-badge-vp', 'FoV: manual'], padrao: ['pm-badge-padrao', '⚠️ FoV: padrão (não confiável)'] };
      const [cls, txt] = map[s.intrinsecos.fonteFov] || map.padrao;
      fovBadge.innerHTML = `<span class="pm-badge ${cls}">${txt}</span>`;
    }
  },

  _syncNumFieldsFromSession() {
    const s = this._s.session;
    const nf = this._s.numFields;
    nf.yaw?.setValue(s.extrinsecos.yawDeg);
    nf.pitch?.setValue(s.extrinsecos.pitchDeg);
    nf.roll?.setValue(s.extrinsecos.rollDeg);
    nf.fov?.setValue(s.intrinsecos.fovHDeg);
    nf.x?.setValue(s.extrinsecos.posicao.x);
    nf.y?.setValue(s.extrinsecos.posicao.y);
    nf.z?.setValue(s.extrinsecos.posicao.z);
  },

  // ======================================================================
  // Sidebar — construção completa (Fases 1-3)
  // ======================================================================

  _renderSidebar() {
    const sb = this._s.el.querySelector('#pm-sidebar');
    sb.innerHTML = '';
    sb.appendChild(this._sidebarBackdrop());
    sb.appendChild(this._sidebarCamera());
    sb.appendChild(this._sidebarLinhasFuga());
    sb.appendChild(this._sidebarAncoras());
    sb.appendChild(this._sidebarObjetos());
    sb.appendChild(this._sidebarReplicar());
  },

  _sidebarBackdrop() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h3>Backdrop</h3>
      <div class="pm-row"><label>Opacidade da foto</label><input type="range" min="0" max="100" value="${this._s.opacidadeFoto}" id="pm-op"></div>
      <div class="pm-row"><label><input type="checkbox" id="pm-wire" ${this._s.wireframe ? 'checked' : ''}> Cena 3D em wireframe</label></div>
      <div class="pm-row"><label>Piso ativo (posicionamento)</label><input type="number" step="1" value="${this._s.pisoAtivo}" id="pm-piso"></div>`;
    wrap.querySelector('#pm-op').oninput = (e) => { this._s.opacidadeFoto = parseFloat(e.target.value); this._s.img.style.opacity = String(this._s.opacidadeFoto / 100); };
    this._s.img.style.opacity = String(this._s.opacidadeFoto / 100);
    wrap.querySelector('#pm-wire').onchange = (e) => { this._s.wireframe = e.target.checked; this._buildLightScene(); };
    wrap.querySelector('#pm-piso').onchange = (e) => { this._s.pisoAtivo = parseInt(e.target.value, 10) || 0; this._recomputeConfianca(); };
    return wrap;
  },

  _sidebarCamera() {
    const wrap = document.createElement('div');
    const h = document.createElement('h3'); h.textContent = 'Câmera (Fase 2)';
    wrap.appendChild(h);
    const s = this._s.session;
    const commitPose = (campo) => (v) => { s.extrinsecos[campo] = v; this._syncCamera3(); this._buildLightScene(); this._recomputeConfianca(); };
    const commitFov = (v) => { s.intrinsecos.fovHDeg = v; s.intrinsecos.fonteFov = 'manual'; this._syncCamera3(); this._recomputeConfianca(); };
    const nf = this._s.numFields;
    const rotGroup = ModelerUI._buildGroup('Rotação (°):', [
      { axis: 'yaw', value: s.extrinsecos.yawDeg, step: 0.5, onCommit: commitPose('yawDeg') },
      { axis: 'pitch', value: s.extrinsecos.pitchDeg, step: 0.5, onCommit: commitPose('pitchDeg') },
      { axis: 'roll', value: s.extrinsecos.rollDeg, step: 0.5, onCommit: commitPose('rollDeg') },
    ]);
    wrap.appendChild(rotGroup.el);
    nf.yaw = { setValue: (v) => rotGroup.setValue('yaw', v) };
    nf.pitch = { setValue: (v) => rotGroup.setValue('pitch', v) };
    nf.roll = { setValue: (v) => rotGroup.setValue('roll', v) };

    const posGroup = ModelerUI._buildGroup('Posição (m):', [
      { axis: 'x', value: s.extrinsecos.posicao.x, step: 0.05, onCommit: (v) => { s.extrinsecos.posicao.x = v; this._syncCamera3(); this._buildLightScene(); this._recomputeConfianca(); } },
      { axis: 'y', value: s.extrinsecos.posicao.y, step: 0.05, onCommit: (v) => { s.extrinsecos.posicao.y = v; this._syncCamera3(); this._buildLightScene(); this._recomputeConfianca(); } },
      { axis: 'z', value: s.extrinsecos.posicao.z, step: 0.05, onCommit: (v) => { s.extrinsecos.posicao.z = v; this._syncCamera3(); this._buildLightScene(); this._recomputeConfianca(); } },
    ]);
    wrap.appendChild(posGroup.el);
    nf.x = { setValue: (v) => posGroup.setValue('x', v) };
    nf.y = { setValue: (v) => posGroup.setValue('y', v) };
    nf.z = { setValue: (v) => posGroup.setValue('z', v) };

    const fovField = ModelerUI._createNumField({ label: 'FoV horiz.:', value: s.intrinsecos.fovHDeg, step: 0.5, suffix: '°', onCommit: commitFov });
    const fovWrap = document.createElement('div'); fovWrap.className = 'pm-nf-slot';
    fovWrap.appendChild(fovField.el);
    wrap.appendChild(fovWrap);
    nf.fov = fovField;

    return wrap;
  },

  _sidebarLinhasFuga() {
    const wrap = document.createElement('div');
    const s = this._s.session;
    wrap.innerHTML = `<h3>Linhas de fuga (${s.linhasDeFuga.length})</h3>
      <p class="pm-hint">Marque 2 segmentos que são paralelos NA REALIDADE (ex.: bordas de uma parede/piso). Clique "+ Nova" e depois 4 pontos na foto (2 por segmento). Associe cada linha a um eixo do mapa (X/Z) para calcular FoV+orientação automaticamente.</p>
      <button type="button" class="pm-btn ${this._s.modoClique?.tipo === 'linha' ? 'pm-active' : ''}" id="pm-vl-novo">+ Nova linha de fuga</button>
      <div id="pm-vl-list"></div>`;
    wrap.querySelector('#pm-vl-novo').onclick = () => {
      this._s.modoClique = { tipo: 'linha', pontos: [] };
      this._renderSidebar();
    };
    const list = wrap.querySelector('#pm-vl-list');
    s.linhasDeFuga.forEach((vl, i) => {
      const item = document.createElement('div');
      item.className = 'pm-list-item';
      item.innerHTML = `<div class="pm-row"><label>Linha ${i + 1}</label>
        <select data-role="eixo"><option value="">Nenhum eixo</option><option value="x" ${vl.eixoAssociado === 'x' ? 'selected' : ''}>Eixo X do mapa</option><option value="z" ${vl.eixoAssociado === 'z' ? 'selected' : ''}>Eixo Z do mapa</option></select>
        <button type="button" class="pm-btn pm-danger" data-role="del">🗑️</button></div>`;
      item.querySelector('[data-role=eixo]').onchange = (e) => {
        vl.eixoAssociado = e.target.value || null;
        this._redrawOverlay();
        this._recalcularCalibracaoPorVPs();
      };
      item.querySelector('[data-role=del]').onclick = () => {
        s.linhasDeFuga.splice(i, 1);
        this._renderSidebar();
        this._redrawOverlay();
      };
      list.appendChild(item);
    });
    return wrap;
  },

  _sidebarAncoras() {
    const wrap = document.createElement('div');
    const s = this._s.session;
    wrap.innerHTML = `<h3>Âncoras de escala (${s.ancorasDeEscala.length})</h3>
      <p class="pm-hint">Clique 2 pontos com distância real conhecida (ex.: base e topo de um pilar de 2,70m — marque "vertical" nesse caso). Resolve a ambiguidade de escala de uma foto única.</p>
      <div class="pm-row"><label><input type="checkbox" id="pm-anchor-vert"> Próxima âncora é vertical (base→topo)</label></div>
      <button type="button" class="pm-btn ${this._s.modoClique?.tipo === 'ancora' ? 'pm-active' : ''}" id="pm-anchor-novo">+ Nova âncora</button>
      <div id="pm-anchor-list"></div>`;
    wrap.querySelector('#pm-anchor-novo').onclick = () => {
      const vertical = wrap.querySelector('#pm-anchor-vert').checked;
      this._s.modoClique = { tipo: 'ancora', pontos: [], vertical };
      this._renderSidebar();
    };
    const list = wrap.querySelector('#pm-anchor-list');
    s.ancorasDeEscala.forEach((a, i) => {
      const medida = this._medirAncora(a);
      const errPct = (medida != null) ? Math.abs(medida - a.distanciaRealM) / a.distanciaRealM * 100 : null;
      const item = document.createElement('div');
      item.className = 'pm-list-item';
      item.innerHTML = `<div class="pm-row"><label>Âncora ${i + 1}${a.vertical ? ' (vertical)' : ''}</label>
        <input type="number" step="0.01" value="${a.distanciaRealM}" data-role="dist" style="width:70px">
        <button type="button" class="pm-btn pm-danger" data-role="del">🗑️</button></div>
        <div class="pm-hint">Medido na calibração atual: ${medida != null ? medida.toFixed(2) + 'm' : '— (fora do plano de chão)'}${errPct != null ? ` · erro ${errPct.toFixed(1)}%` : ''}</div>`;
      item.querySelector('[data-role=dist]').onchange = (e) => {
        a.distanciaRealM = parseFloat(e.target.value) || a.distanciaRealM;
        this._renderSidebar();
      };
      item.querySelector('[data-role=del]').onclick = () => {
        s.ancorasDeEscala.splice(i, 1);
        this._renderSidebar();
        this._redrawOverlay();
        this._recomputeConfianca();
      };
      list.appendChild(item);
    });
    return wrap;
  },

  _sidebarObjetos() {
    const wrap = document.createElement('div');
    const s = this._s.session;
    wrap.innerHTML = `<h3>Objetos posicionados (${s.objetosPosicionados.length})</h3>
      <p class="pm-hint">Clique na foto pra posicionar um objeto novo — a base cai no plano de chão do piso ativo (ver "Backdrop" acima), a menos que você marque uma altura explícita.</p>
      <div class="pm-row"><label>Tipo</label><input type="text" id="pm-obj-tipo" value="generico" placeholder="ex.: mesa, caixa..."></div>
      <div class="pm-row"><label>Plano</label><select id="pm-obj-plano"><option value="chao">Chão (piso ativo)</option><option value="altura_explicita">Altura explícita</option></select></div>
      <div class="pm-row" id="pm-obj-altura-row" hidden><label>Altura (m)</label><input type="number" step="0.05" id="pm-obj-altura" value="1.2"></div>
      <button type="button" class="pm-btn ${this._s.modoClique?.tipo === 'objeto' ? 'pm-active' : ''}" id="pm-obj-novo">📍 Posicionar objeto (clique na foto)</button>
      <div id="pm-obj-list"></div>`;
    const planoSel = wrap.querySelector('#pm-obj-plano');
    const alturaRow = wrap.querySelector('#pm-obj-altura-row');
    planoSel.onchange = () => { alturaRow.hidden = planoSel.value !== 'altura_explicita'; };
    wrap.querySelector('#pm-obj-novo').onclick = () => {
      this._s.modoClique = {
        tipo: 'objeto',
        tipoObjeto: wrap.querySelector('#pm-obj-tipo').value.trim() || 'generico',
        plano: planoSel.value,
        alturaExplicitaM: parseFloat(wrap.querySelector('#pm-obj-altura').value) || 0,
      };
      this._renderSidebar();
    };
    const list = wrap.querySelector('#pm-obj-list');
    s.objetosPosicionados.forEach((op, i) => {
      const item = document.createElement('div');
      item.className = 'pm-list-item';
      item.innerHTML = `<div class="pm-row"><label>${op.tipoObjeto} #${i + 1}${op.vinculadoAObjetoDoMapa ? ' ✅ salvo' : ''}</label>
        <button type="button" class="pm-btn pm-danger" data-role="del">🗑️</button></div>
        <div class="pm-hint">x=${op.posicaoMundo.x.toFixed(2)} y=${op.posicaoMundo.y.toFixed(2)} z=${op.posicaoMundo.z.toFixed(2)}</div>`;
      item.querySelector('[data-role=del]').onclick = () => {
        s.objetosPosicionados.splice(i, 1);
        this._buildLightScene();
        this._renderSidebar();
        this._redrawOverlay();
        this._recomputeConfianca();
      };
      list.appendChild(item);
    });
    return wrap;
  },

  _sidebarReplicar() {
    const wrap = document.createElement('div');
    const s = this._s.session;
    if (s.objetosPosicionados.length < 2) {
      wrap.innerHTML = '<h3>Replicar em série (Fase 3)</h3><p class="pm-hint">Posicione pelo menos 2 objetos primeiro (origem + referência) para replicar em série ao longo da direção entre eles.</p>';
      return wrap;
    }
    const opts = s.objetosPosicionados.map((op, i) => `<option value="${i}">#${i + 1} ${op.tipoObjeto}</option>`).join('');
    wrap.innerHTML = `<h3>Replicar em série (Fase 3)</h3>
      <div class="pm-row"><label>Origem</label><select id="pm-rep-origem">${opts}</select></div>
      <div class="pm-row"><label>Referência</label><select id="pm-rep-ref">${opts}</select></div>
      <div class="pm-row"><label>Espaçamento</label><span id="pm-rep-espac">—</span></div>
      <div class="pm-row"><label>Quantidade total</label><input type="number" min="2" value="4" id="pm-rep-qtd"></div>
      <button type="button" class="pm-btn" id="pm-rep-go">🔁 Replicar</button>`;
    const origemSel = wrap.querySelector('#pm-rep-origem');
    const refSel = wrap.querySelector('#pm-rep-ref');
    refSel.value = '1';
    const atualizaEspac = () => {
      const a = s.objetosPosicionados[parseInt(origemSel.value, 10)];
      const b = s.objetosPosicionados[parseInt(refSel.value, 10)];
      if (!a || !b || a === b) { wrap.querySelector('#pm-rep-espac').textContent = '—'; return null; }
      const d = Math.hypot(a.posicaoMundo.x - b.posicaoMundo.x, a.posicaoMundo.y - b.posicaoMundo.y, a.posicaoMundo.z - b.posicaoMundo.z);
      wrap.querySelector('#pm-rep-espac').textContent = `${d.toFixed(2)}m`;
      return d;
    };
    origemSel.onchange = atualizaEspac; refSel.onchange = atualizaEspac;
    atualizaEspac();
    wrap.querySelector('#pm-rep-go').onclick = () => {
      const ia = parseInt(origemSel.value, 10), ib = parseInt(refSel.value, 10);
      const a = s.objetosPosicionados[ia], b = s.objetosPosicionados[ib];
      if (!a || !b || a === b) { Utils.toast('⚠️ Escolha 2 objetos diferentes.', { type: 'warn' }); return; }
      const espac = atualizaEspac();
      const qtd = Math.max(2, parseInt(wrap.querySelector('#pm-rep-qtd').value, 10) || 2);
      const dir = {
        x: (b.posicaoMundo.x - a.posicaoMundo.x) / espac,
        y: (b.posicaoMundo.y - a.posicaoMundo.y) / espac,
        z: (b.posicaoMundo.z - a.posicaoMundo.z) / espac,
      };
      const pontos = PerspMatchMath.replicateAlongAxis(a.posicaoMundo, dir, espac, qtd);
      // pontos[0] = a, pontos[1] = b (aproximadamente) — só os índices >=2 são NOVOS
      for (let i = 2; i < pontos.length; i++) {
        s.objetosPosicionados.push({
          id: Utils.uid('objnovo'),
          clique: null, // gerado por replicação — sem clique original, não entra no erro de reprojeção
          planoUsado: a.planoUsado,
          alturaExplicitaM: a.alturaExplicitaM,
          posicaoMundo: pontos[i],
          vinculadoAObjetoDoMapa: null,
          tipoObjeto: a.tipoObjeto,
        });
      }
      s.arraysReplicados.push({ origemObjId: a.id, referenciaObjId: b.id, espacamentoM: espac, quantidade: qtd, eixoDirecaoDeVL: null });
      this._buildLightScene();
      this._renderSidebar();
      this._redrawOverlay();
      Utils.toast(`✅ ${pontos.length - 2} objeto(s) novo(s) replicado(s).`, { type: 'success' });
    };
    return wrap;
  },

  // ======================================================================
  // Fase 4 — confirmar e salvar
  // ======================================================================

  async _confirmarSalvar() {
    const { THREE } = this._s;
    const s = this._s.session;
    this._recomputeConfianca();
    const rms = s.extrinsecos.confianca.erroReprojecaoRmsPx;
    const n = s.extrinsecos.confianca.numPontosControle;

    // spec §4 "Foto sem EXIF" — bloqueio LEVE (aviso, não bloqueio duro).
    if (s.intrinsecos.fonteFov === 'padrao' && s.linhasDeFuga.length === 0) {
      const ok = confirm('⚠️ O campo de visão (FoV) ainda é só uma estimativa padrão (60°) — sem EXIF e sem nenhuma linha de fuga marcada, as posições calculadas podem estar bem erradas.\n\nRecomendado: marque pelo menos uma linha de fuga (Fase 2) antes de salvar.\n\nSalvar mesmo assim?');
      if (!ok) return;
    } else if (n > 0 && rms > 10) {
      const ok = confirm(`⚠️ Erro de reprojeção alto (${rms.toFixed(1)}px sobre ${n} pontos de controle) — a calibração pode não estar confiável (linhas de fuga mal marcadas, FoV incorreto, ou distorção de lente não corrigida).\n\nSalvar mesmo assim?`);
      if (!ok) return;
    }

    const cam = this._s.camera3;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    // [10/09/2026] Convenção de ângulo das 'Câmeras' do mapa (ver
    // js/mapping.js addCamera / js/engine3d.js setScene): `angulo` é um
    // ângulo 2D no plano XZ onde `dirX=cos(angulo), dirZ=sin(angulo)` — ou
    // seja, `angulo = atan2(dirZ, dirX)`. Calculado a partir da direção de
    // MUNDO de verdade da câmera calibrada (`camera.getWorldDirection`, API
    // do próprio Three.js) em vez de reconstruído à mão a partir de
    // yaw/pitch/roll separados — evita ter 2 fórmulas de conversão que
    // podem divergir uma da outra.
    const anguloRad = Math.atan2(fwd.z, fwd.x);
    const fovRad = Utils.clamp(s.intrinsecos.fovHDeg, 5, 359) * Math.PI / 180;
    const piso = this._s.pisoAtivo || 0;

    const camObj = Mapping.addCamera(this._s.map, cam.position.x, cam.position.z, {
      angulo: anguloRad,
      fov: fovRad,
      piso,
      origemPerspMatch: s.id,
      // Campos extras (fora do schema padrão de 'Câmeras', que hoje só
      // desenha direção horizontal + FOV a uma altura fixa — ver
      // engine3d.js ALTURA_CAMERA) preservando a pose 3D COMPLETA calculada
      // aqui. Ignorados pelo desenho atual da câmera no 3D (não quebram
      // nada — são só campos extras no registro), mas ficam disponíveis
      // pra uma extensão futura usar altura/pitch/roll de verdade.
      alturaM: cam.position.y,
      pitchDeg: s.extrinsecos.pitchDeg,
      rollDeg: s.extrinsecos.rollDeg,
    });

    let novos = 0;
    for (const op of s.objetosPosicionados) {
      if (op.vinculadoAObjetoDoMapa) continue; // sessão reaberta — já salvo antes
      const novo = Mapping.addObject(this._s.map, op.posicaoMundo.x, op.posicaoMundo.z, op.tipoObjeto || 'generico', {
        elevacao: op.posicaoMundo.y,
        piso,
        origemPerspMatch: s.id,
      });
      op.vinculadoAObjetoDoMapa = novo.id;
      novos++;
    }

    await DB.saveMap(this._s.map);
    s.mapaId = this._s.map.id;
    await DB.savePerspMatchSession(s);
    Utils.toast(`✅ Câmera "${camObj.nome}" e ${novos} objeto(s) novo(s) salvos a partir do Camera Match.`, { type: 'success', duration: 4000 });
    const cb = this._s.onRebuildScene;
    this.close();
    if (typeof cb === 'function') cb();
  },
};

window.PerspMatch = PerspMatch;
