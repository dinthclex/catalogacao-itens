/* js/piso-custom-edit.js — [74ª rodada] Edição interativa dos vértices do Piso com contorno livre/furos (ver js/objecttypes/piso-custom.js).
 *
 * MAPA 2D — com o Piso editável selecionado aparecem as alças (quadrados brancos = contorno, laranja = furos):
 *   • arrastar uma alça move o vértice (a malha 2D é redesenhada na hora; nada roda fora do arrasto);
 *   • duplo clique numa aresta insere um vértice; Alt+clique numa alça remove o vértice (anel com ≥ 3 pontos).
 * VER EM 3D — selecionando (clicando) o Piso editável aparecem esferas nos vértices (por cima da cena). No modelo de navegação com Pointer Lock: MIRE uma esfera
 *   (ela acende), SEGURE o botão esquerdo e MOVA o mouse — o vértice desliza no plano do topo da laje e a malha é atualizada em tempo real
 *   (CustomFloor.updateVertices: gera a geometria nova e dá dispose() na antiga). Ao soltar, grava no mapa.
 * Em repouso nenhum código daqui roda por quadro: o 3D só confere o alvo se houver um Piso selecionado, e o 2D só reage a eventos do mouse. */
(function () {
  'use strict';
  const PC = () => window.PisoCustom;
  const rot = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };

  /** [87ª rodada] SNAP do mapa 2D (🧲 Snap na grade, passo em metros): vale também para os vértices do piso/teto, no 2D e no 3D. Coordenadas locais → mundo (x,y) → arredonda → local.
   *  Sem o MapView montado (só "Ver em 3D") usa o último valor lido de DB ('mapa2dSnapGrade'/'mapa2dSnapGradeM'). */
  const SNAP = { on: true, m: 0.1 };
  const lerSnap = () => { try { if (window.DB && DB.getSetting) { DB.getSetting('mapa2dSnapGrade', true).then((v) => { SNAP.on = v !== false; }); DB.getSetting('mapa2dSnapGradeM', 0.1).then((v) => { SNAP.m = +v || 0.1; }); } } catch (_) { /* ok */ } };
  lerSnap();
  const snapLocal = (obj, l) => {
    const mv = window.MapView, ativo = mv && mv._map && mv._gridSnap !== undefined ? !!mv._gridSnap : SNAP.on, passo = (mv && mv._map && mv._gridSnapMeters > 0) ? mv._gridSnapMeters : SNAP.m;
    if (!ativo || !(passo > 0)) return l;
    const a = obj.angulo || 0, w = rot(l[0], l[1], a), wx = Math.round((obj.x + w[0]) / passo) * passo, wy = Math.round((obj.y + w[1]) / passo) * passo;
    return rot(wx - obj.x, wy - obj.y, -a);
  };

  /* ───────────────────────────────────────── 2D ───────────────────────────────────────── */
  const E2 = {
    drag: null, modoVertice: false, desenho: null, _bloqueiaClick: false, ghost: null,
    /** [84ª rodada] ponto-fantasma de inserção (local ao piso) para o piso `obj`, ou null. */
    ghostDe(obj) { const g = this.ghost; return g && g.id === obj.id && (this.modoVertice || this.desenho) && !this.drag ? g.p : null; },
    /** Piso editável "ativo" no mapa: o selecionado (selectedObjectId) ou o da seleção das ferramentas. */
    ativo2D(renderer, obj) {
      if (!PC() || !PC().tem(obj)) return false;
      const mv = window.MapView; if (!mv || mv._renderer !== renderer) return false;
      // [81ª rodada] vértices/alças só com o piso SELECIONADO de verdade (o que a ferramenta Selecionar mostra). `renderer.selectedObjectId` sozinho fica "grudado" depois de
      // clicar no vazio, então só vale fora da ferramenta Selecionar. Arrasto/desenho de recorte em andamento também mantêm as alças.
      if ((this.drag && this.drag.id === obj.id) || (this.desenho && this.desenho.id === obj.id)) return true;
      const ts = mv._toolSelection;
      if (ts && ts.size) return ts.has('object:' + obj.id);
      return mv._ptool !== 'select' && renderer.selectedObjectId === obj.id;
    },
    _ativos() {
      const mv = window.MapView; if (!mv || !mv._map || !mv._renderer || !PC()) return [];
      return (mv._map.objects || []).filter((o) => this.ativo2D(mv._renderer, o));
    },
    _canvasXY(e, canvas) { const r = canvas.getBoundingClientRect(); return { sx: (e.clientX - r.left) * (canvas.width / r.width), sy: (e.clientY - r.top) * (canvas.height / r.height) }; },
    _local(obj, sx, sy) { const w = window.MapView._renderer.screenToWorld(sx, sy), r = rot(w.x - obj.x, w.y - obj.y, -(obj.angulo || 0)); return r; },
    _hit(obj, sx, sy, tol) {
      const R = window.MapView._renderer; let best = null;
      PC().vertices(obj).forEach((v) => {
        const r = rot(v.p[0], v.p[1], obj.angulo || 0), s = R.worldToScreen(obj.x + r[0], obj.y + r[1]), d = Math.hypot(s.x - sx, s.y - sy);
        if (d <= tol && (!best || d < best.d)) best = { d, anel: v.anel, i: v.i };
      });
      return best;
    },
    /* ---- desenho do recorte como polilinha: cliques adicionam pontos (podem passar da borda do piso); fecha no 1º ponto / duplo clique / Enter; Esc cancela; Backspace volta um ponto ---- */
    desenhoDe(obj) { const d = this.desenho; return d && d.id === obj.id ? d : null; },
    iniciarDesenho(obj) {
      this.modoVertice = false; this.desenho = { id: obj.id, pts: [], mouse: null };
      window.MapView._redrawDirty = true; BAR._chave = null;
      try { Utils.toast('✂️ Desenhe o recorte: clique os pontos (pode passar da borda do piso). Feche clicando no 1º ponto, com duplo clique ou Enter. Backspace volta um ponto; Esc cancela.', { duration: 6000 }); } catch (_) { /* toast opcional */ }
    },
    cancelarDesenho() { if (!this.desenho) return; this.desenho = null; window.MapView._redrawDirty = true; BAR._chave = null; BAR.sync(); },
    fecharDesenho() {
      const d = this.desenho; if (!d) return;
      const mv = window.MapView, obj = (mv._map.objects || []).find((o) => o.id === d.id);
      this.desenho = null; BAR._chave = null;
      if (obj && PC().tem(obj) && d.pts.length >= 3) { obj.pisoPoligono.furos.push(d.pts.map((p) => [p[0], p[1]])); this._fim(obj); }
      mv._redrawDirty = true; BAR.sync();
    },
    _desenhoDown(e, sx, sy) {
      const d = this.desenho, mv = window.MapView, obj = (mv._map.objects || []).find((o) => o.id === d.id);
      if (!obj || !PC().tem(obj)) { this.desenho = null; return false; }
      e.stopImmediatePropagation(); e.preventDefault(); this._bloqueiaClick = true;
      const l = this._local(obj, sx, sy);
      if (d.pts.length >= 3) { // clicou perto do 1º ponto: fecha
        const R = mv._renderer, r = rot(d.pts[0][0], d.pts[0][1], obj.angulo || 0), s = R.worldToScreen(obj.x + r[0], obj.y + r[1]);
        if (Math.hypot(s.x - sx, s.y - sy) <= 12) { this.fecharDesenho(); return true; }
      }
      d.pts.push(l); d.mouse = l; mv._redrawDirty = true; return true;
    },
    down(e) {
      const canvas = e.target; if (e.button !== 0 || !canvas || canvas.id !== 'map-canvas') return;
      const mv = window.MapView; if (!mv || !mv._map) return;
      const { sx, sy } = this._canvasXY(e, canvas);
      if (this.desenho) { this._desenhoDown(e, sx, sy); return; }
      for (const obj of this._ativos()) {
        let h = this._hit(obj, sx, sy, 11), inseriu = false;
        if (!h && this.modoVertice) { // ferramenta "＋ Vértice": clicar numa aresta cria um vértice ali e já o arrasta
          const l = this._local(obj, sx, sy), novo = PC().inserirNaAresta(obj, l[0], l[1], 10 / Math.max(1e-6, mv._renderer.view.zoom));
          if (novo) { h = novo; inseriu = true; mv._redrawDirty = true; }
        }
        if (!h) continue;
        e.stopImmediatePropagation(); e.preventDefault(); this._bloqueiaClick = true; setTimeout(() => { E2._bloqueiaClick = false; }, 600);
        if (e.altKey) { if (PC().removerVertice(obj, h.anel, h.i)) { PC().sincronizarCaixa(obj); this._fim(obj); } return; }
        this.drag = { id: obj.id, anel: h.anel, i: h.i, moveu: false, inseriu };
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ok */ }
        return;
      }
    },
    move(e) {
      if (!this.drag && (this.modoVertice || this.desenho)) { // ghost do ponto de inserção
        const mv1 = window.MapView, c1 = mv1 && mv1._container && mv1._container.querySelector('#map-canvas');
        const o1 = c1 && (this.desenho ? (mv1._map.objects || []).find((o) => o.id === this.desenho.id) : this._ativos()[0]);
        if (o1 && PC().tem(o1)) { const { sx, sy } = this._canvasXY(e, c1), l = this._local(o1, sx, sy);
          const p = this.desenho ? l : PC().pontoNaAresta(o1, l[0], l[1], 10 / Math.max(1e-6, mv1._renderer.view.zoom));
          this.ghost = p ? { id: o1.id, p } : null; mv1._redrawDirty = true; }
      }
      if (this.desenho && !this.drag) {
        const mv0 = window.MapView, canvas0 = mv0._container && mv0._container.querySelector('#map-canvas'), obj0 = (mv0._map.objects || []).find((o) => o.id === this.desenho.id);
        if (canvas0 && obj0) { const { sx, sy } = this._canvasXY(e, canvas0); this.desenho.mouse = this._local(obj0, sx, sy); mv0._redrawDirty = true; }
        return;
      }
      const d = this.drag; if (!d) return;
      const mv = window.MapView, canvas = mv._container && mv._container.querySelector('#map-canvas'); if (!canvas) return;
      const obj = (mv._map.objects || []).find((o) => o.id === d.id); if (!obj || !PC().tem(obj)) { this.drag = null; return; }
      e.stopImmediatePropagation(); e.preventDefault();
      const { sx, sy } = this._canvasXY(e, canvas), l = e.altKey ? this._local(obj, sx, sy) : snapLocal(obj, this._local(obj, sx, sy)), p = PC().anel(obj, d.anel)[d.i];
      if (!p) return;
      p[0] = l[0]; p[1] = l[1]; d.moveu = true;
      PC().sincronizarCaixa(obj);          // largura/profundidade = caixa do contorno (a origem só é recentrada ao soltar, para o piso não "andar" sob o cursor)
      mv._redrawDirty = true;
      // [80ª rodada] tempo real 2D -> 3D: a malha 3D acompanha o arraste (1 troca de geometria por quadro, a antiga é descartada).
      if (!this._raf3D) { this._raf3D = requestAnimationFrame(() => { this._raf3D = 0; const o = (window.MapView._map.objects || []).find((x) => x.id === d.id); if (o) PC().forcar3D(o); }); }
    },
    up(e) {
      const d = this.drag; if (!d) return; this.drag = null;
      const mv = window.MapView, obj = (mv._map.objects || []).find((o) => o.id === d.id);
      // [78ª rodada] CORRIGIDO: clicar na aresta (＋ Vértice) cria o vértice sem arrastar -> antes não gravava nem avisava o 3D (só o 2D mostrava o vértice novo). Agora `inseriu` também fecha a edição.
      if (obj && (d.moveu || d.inseriu)) { e.stopImmediatePropagation(); this._fim(obj); }
    },
    dblclick(e) {
      const canvas = e.target; if (!canvas || canvas.id !== 'map-canvas') return;
      if (this.desenho) { e.stopImmediatePropagation(); e.preventDefault(); if (this.desenho.pts.length > 3) this.desenho.pts.pop(); /* o 2º clique do duplo clique já somou um ponto repetido */ this.fecharDesenho(); return; }
      const mv = window.MapView; if (!mv || !mv._map) return;
      const { sx, sy } = this._canvasXY(e, canvas);
      for (const obj of this._ativos()) {
        if (this._hit(obj, sx, sy, 11)) continue;
        const l = this._local(obj, sx, sy), tol = 8 / Math.max(1e-6, mv._renderer.view.zoom);
        if (PC().inserirNaAresta(obj, l[0], l[1], tol)) { e.stopImmediatePropagation(); e.preventDefault(); this._fim(obj); return; }
      }
    },
    _fim(obj) {
      const mv = window.MapView; PC().recentrar(obj); mv._redrawDirty = true;
      try { mv._saveMap(); } catch (err) { console.warn('[PisoCustomEdit] gravar mapa:', err); }
      try { PC().forcar3D(obj); } catch (_) { /* 3D fechado */ }   // [79ª b] atualiza a malha 3D direto, por id
      try { if (mv._panelEl) mv._openObjectPanel(obj); } catch (_) { /* painel opcional */ }
    },
  };

  /* ───────────────────────────────────────── 3D ───────────────────────────────────────── */
  const E3 = {
    _grupo: null, _scene: null, _esferas: [], _chave: '', _hover: null, drag: null,
    alvo(v) {
      const id = v && v._pisoEditId; if (!id || !v._map || !PC()) return null;
      const o = (v._map.objects || []).find((x) => x.id === id);
      return PC().tem(o) ? o : null;
    },
    _mesh(v, o) { const eng = v._engine; return eng && eng._pickMeshes && eng._pickMeshes.find((m) => m.userData && m.userData.pisoCustom && m.userData.pick && m.userData.pick.ref === o); },
    _topoY(v, o) { const m = this._mesh(v, o); return m ? m.position.y + Math.max(0.01, o.altura || 0.2) : null; },
    _mundo(o, p, y) { const r = rot(p[0], p[1], o.angulo || 0); return { x: o.x + r[0], y, z: o.y + r[1] }; },
    _construir(eng, n) {
      const THREE = eng.THREE;
      if (!this._grupo || this._scene !== eng.scene) { this._grupo = new THREE.Group(); this._grupo.name = 'piso-custom-alcas'; this._grupo.renderOrder = 999; this._scene = eng.scene; eng.scene.add(this._grupo); this._esferas = []; }
      while (this._esferas.length < n) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 }));
        m.renderOrder = 999; this._grupo.add(m); this._esferas.push(m);
      }
      while (this._esferas.length > n) { const m = this._esferas.pop(); this._grupo.remove(m); m.geometry.dispose(); m.material.dispose(); }
    },
    update(v) {
      const eng = v._engine; if (!eng || !eng.THREE || !eng.scene || !eng.camera3) return;
      const o = this.alvo(v), oculto = !o || (window.Modeler3D && Modeler3D.isActive && Modeler3D.isActive());
      if (oculto) { if (this._grupo) this._grupo.visible = false; this._hover = null; return; }
      const topo = this._topoY(v, o); if (topo == null) { if (this._grupo) this._grupo.visible = false; return; }
      if (this.drag) this._seguir(v, eng);
      const vs = PC().vertices(o); this._construir(eng, vs.length); this._grupo.visible = true;
      const cam = eng.camera3.position;
      vs.forEach((vt, k) => {
        const w = this._mundo(o, vt.p, topo), d = Math.hypot(cam.x - w.x, cam.y - w.y, cam.z - w.z), r = Math.min(0.5, Math.max(0.05, d * 0.018));
        const m = this._esferas[k]; m.position.set(w.x, w.y, w.z); m.userData.r = r;
        const quente = this.drag ? (this.drag.anel === vt.anel && this.drag.i === vt.i) : (this._hover && this._hover.k === k);
        m.scale.setScalar(quente ? r * 1.5 : r); m.material.color.setHex(quente ? 0xffe066 : (vt.anel < 0 ? 0xffffff : 0xffb347));
      });
      if (!this.drag) this._hover = (document.pointerLockElement && !v._buildTool) ? this._pick(eng, eng.centerRay(v._camera)) : null;
    },
    /** esfera mais próxima do raio da mira (tolerância = 2,2 × raio visual). */
    _pick(eng, ray) {
      if (!this._grupo || !this._grupo.visible) return null;
      const D = ray.dir, L = Math.hypot(D.x, D.y, D.z) || 1; let best = null;
      this._esferas.forEach((m, k) => {
        const px = m.position.x - ray.origin.x, py = m.position.y - ray.origin.y, pz = m.position.z - ray.origin.z;
        const t = (px * D.x + py * D.y + pz * D.z) / L; if (t <= 0) return;
        const d = Math.hypot(px - t * D.x / L, py - t * D.y / L, pz - t * D.z / L);
        if (d <= m.userData.r * 2.2 && (!best || d < best.d)) best = { d, k };
      });
      return best;
    },
    /** [85ª rodada] Raio que passa pelo ponto virtual (ndcX, ndcY) da tela, montado com a MESMA base yaw/pitch usada pela mira (centerRay) — assim o ponto (0,0) é exatamente o raio que escolheu a esfera
     *  e o vértice não "salta" ao começar o arrasto (antes usava a matriz da câmera Three, que pode diferir da mira em 1 quadro/offset). */
    _raioVirtual(v, eng, ndcX, ndcY) {
      const cam = v._camera, c3 = eng.camera3; if (!cam || !c3) return eng.rayFromScreenPoint(ndcX, ndcY);
      const f = eng.centerRay(cam).dir, fl = Math.hypot(f.x, f.z) || 1;
      const r = { x: -f.z / fl, y: 0, z: f.x / fl };           // direita = dir × cima (mesma convenção do THREE)
      const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };   // r × f
      const tv = Math.tan((c3.fov || 72) * Math.PI / 360), th = tv * (c3.aspect || 1);
      const d = { x: f.x + r.x * ndcX * th + u.x * ndcY * tv, y: f.y + r.y * ndcX * th + u.y * ndcY * tv, z: f.z + r.z * ndcX * th + u.z * ndcY * tv };
      const L = Math.hypot(d.x, d.y, d.z) || 1;
      return { origin: { x: cam.x, y: cam.y, z: cam.z }, dir: { x: d.x / L, y: d.y / L, z: d.z / L } };
    },
    _planoY(ray, y) { if (Math.abs(ray.dir.y) < 1e-6) return null; const t = (y - ray.origin.y) / ray.dir.y; if (t <= 0) return null; return { x: ray.origin.x + t * ray.dir.x, z: ray.origin.z + t * ray.dir.z }; },
    mouseDown(v, e) {
      const eng = v._engine, o = this.alvo(v); if (!o || !eng || v._buildTool || !this._grupo || !this._grupo.visible) return false;
      let h = this._pick(eng, eng.centerRay(v._camera)); const topo = this._topoY(v, o); if (topo == null) return false;
      if (!h && e.shiftKey) { // Shift + clique numa ARESTA (mirando-a): cria um vértice ali e já o arrasta
        const hit = this._planoY(eng.centerRay(v._camera), topo);
        if (hit) {
          const l = rot(hit.x - o.x, hit.z - o.y, -(o.angulo || 0)), novo = PC().inserirNaAresta(o, l[0], l[1], 0.35);
          if (novo) { PC().atualizar3D(eng, o); PC().espelhar2D(o); h = { k: PC().vertices(o).findIndex((q) => q.anel === novo.anel && q.i === novo.i) }; }
        }
      }
      if (!h) return false;
      const vt = PC().vertices(o)[h.k]; if (!vt) return false;
      if (e.altKey) { if (PC().removerVertice(o, vt.anel, vt.i)) { PC().sincronizarCaixa(o); this._gravar(v, o); } return true; }
      const r0 = eng.centerRay(v._camera), hit = this._planoY(r0, topo);
      const lc = hit ? rot(hit.x - o.x, hit.z - o.y, -(o.angulo || 0)) : vt.p.slice();
      this.drag = { id: o.id, anel: vt.anel, i: vt.i, topo, off: [vt.p[0] - lc[0], vt.p[1] - lc[1]] };
      return true;
    },
    /** [86ª rodada] O vértice SEGUE O CURSOR (a mira) deslizando sobre a superfície do próprio piso: durante o arrasto a câmera continua girando normalmente (mouseMove devolve false)
     *  e, a cada quadro (update), o vértice vai para onde o raio da mira cruza o plano do topo da laje. A folga inicial entre a esfera e o ponto exato da mira some em ~0,15 s (sem salto). */
    mouseMove() { return false; },
    _seguir(v, eng) {
      const d = this.drag; if (!d) return;
      const o = (v._map.objects || []).find((x) => x.id === d.id); if (!o || !PC().tem(o)) { this.drag = null; return; }
      const ray = eng.centerRay(v._camera), hit = this._planoY(ray, d.topo); if (!hit) return;
      d.off[0] *= 0.8; d.off[1] *= 0.8; if (Math.abs(d.off[0]) + Math.abs(d.off[1]) < 1e-3) { d.off[0] = 0; d.off[1] = 0; }
      const l = rot(hit.x - o.x, hit.z - o.y, -(o.angulo || 0)), p = PC().anel(o, d.anel)[d.i]; if (!p) return;
      const sn = snapLocal(o, [l[0] + d.off[0], l[1] + d.off[1]]), nx = sn[0], ny = sn[1];
      if (Math.abs(nx - p[0]) < 1e-5 && Math.abs(ny - p[1]) < 1e-5) return;   // parado: nada a refazer
      p[0] = nx; p[1] = ny;
      PC().sincronizarCaixa(o);
      if (!PC().atualizar3D(eng, o)) { try { eng.rebuildObjectIncremental(o); } catch (_) { v._rebuildScene && v._rebuildScene(); } }   // dispose da geometria antiga + nova
      PC().espelhar2D(o);   // 3D -> 2D em tempo real
    },
    mouseUp(v) {
      const d = this.drag; if (!d) return false; this.drag = null;
      const o = (v._map.objects || []).find((x) => x.id === d.id); if (o) { PC().recentrar(o); this._gravar(v, o); }
      return true;
    },
    _gravar(v, o) {
      const eng = v._engine;
      try { if (!eng.rebuildObjectIncremental(o)) v._rebuildScene && v._rebuildScene(); } catch (_) { v._rebuildScene && v._rebuildScene(); }
      PC().espelhar2D(o);   // [80ª rodada] 3D -> 2D ao soltar/inserir/remover
      try { DB.saveMap(v._map); } catch (err) { console.warn('[PisoCustomEdit] gravar mapa:', err); }
    },
  };

  /* ─────────────────────── barra de botões no cabeçalho do mapa 2D (#tbm-piso-bar) ─────────────────────── */
  const BAR = {
    _chave: null,
    /** Piso alvo dos botões: o de um rascunho de reedição (piso comum com gizmo) ou o piso editável selecionado. */
    alvoInfo() {
      const mv = window.MapView; if (!mv || !mv._map) return null;
      const d = mv._formaDraft;
      if (d && d.reedit && d.stamp && PC().ehTipo(d.stamp.tipo)) return { id: d.reedit.id, custom: false, draft: true };
      const a = E2._ativos()[0];
      return a ? { id: a.id, custom: true, draft: false } : null;
    },
    /** Chamada por quadro do mapa (só compara uma chave; mexe no DOM apenas quando muda). */
    sync() {
      try { TOG.sync(); } catch (err) { console.warn('[PisoCustomEdit] toggle:', err); }
      const bar = document.getElementById('tbm-piso-bar'); if (!bar) return;
      const info = this.alvoInfo(), o = info && !info.draft ? (window.MapView._map.objects || []).find((x) => x.id === info.id) : null;
      const chave = info ? (info.draft ? 'd' : 'c') + ':' + (o && o.pisoPoligono ? o.pisoPoligono.furos.length : 0) + (E2.modoVertice ? 'v' : '') + (E2.desenho ? 'z' : '') : '-';
      if (chave === this._chave) return; this._chave = chave;
      bar.style.display = info ? 'inline-flex' : 'none';
      const custom = !!(info && info.custom), nf = o && o.pisoPoligono ? o.pisoPoligono.furos.length : 0;
      const rm = document.getElementById('tbm-piso-rm'), rc = document.getElementById('tbm-piso-rect');
      if (rm) rm.style.display = nf ? '' : 'none';
      if (rc) rc.style.display = custom ? '' : 'none';
      const bv = document.getElementById('tbm-piso-vertice'), bz = document.getElementById('tbm-piso-recorte');
      if (bv) bv.classList.toggle('active', !!E2.modoVertice);
      if (bz) bz.classList.toggle('active', !!E2.desenho);
      if (!info) { E2.modoVertice = false; E2.desenho = null; }
    },
    /** Resolve o piso alvo (fechando o gizmo de redimensionar, se estiver aberto) e, se pedido, converte em piso editável. */
    obter(converter) {
      const mv = window.MapView, info = this.alvoInfo(); if (!mv || !info) return null;
      if (info.draft) { try { mv._finalizeFormaDraft(); } catch (_) { /* ok */ } }
      const o = (mv._map.objects || []).find((x) => x.id === info.id); if (!o) return null;
      if (converter && !PC().tem(o)) { PC().tornarEditavel(o); try { PC().forcar3D(o); } catch (_) { /* ok */ } }
      if (PC().tem(o)) { mv._toolSelection = new Set(['object:' + o.id]); mv._renderer.selectedObjectId = o.id; mv._selectedObjectId = o.id; }
      return o;
    },
    agir(acao) {
      const mv = window.MapView; if (!mv) return;
      const o = this.obter(acao !== 'rect'); if (!o) return;
      if (acao === 'recorte') { const ja = !!E2.desenho; E2.cancelarDesenho(); E2.ghost = null; if (!ja) E2.iniciarDesenho(o); mv._redrawDirty = true; this._chave = null; this.sync(); return; }
      if (acao === 'vertice') { E2.cancelarDesenho(); E2.ghost = null; mv._redrawDirty = true; E2.modoVertice = !E2.modoVertice; this._chave = null; this.sync();
        if (E2.modoVertice) { try { Utils.toast('＋ Vértice: clique numa aresta do piso (ou do recorte) para criar um vértice e arraste para posicioná-lo.', { duration: 4500 }); } catch (_) { /* ok */ } }
        return; }
      E2.cancelarDesenho(); E2.modoVertice = false;
      if (acao === 'rm') PC().removerUltimoFuro(o);
      else if (acao === 'rect') { PC().restaurarRetangulo(o); }
      if (acao !== 'rect') PC().sincronizarCaixa(o);
      mv._redrawDirty = true; this._chave = null;
      try { mv._saveMap(); } catch (err) { console.warn('[PisoCustomEdit] gravar mapa:', err); }
      try { PC().forcar3D(o); } catch (_) { /* 3D fechado */ }
      try { if (mv._panelEl) mv._openObjectPanel(o); } catch (_) { /* painel opcional */ }
      this.sync();
    },
  };
  /* ─────────────────────── [89ª] botão ⇄ no canto superior direito da caixa: alterna GIZMO (mover/redimensionar/girar) ⇄ VÉRTICES ─────────────────────── */
  const TOG = {
    el: null,
    /** Alvo: objeto editável com vértices visíveis (modo 'vertices') ou rascunho de reedição com gizmo de Piso/Teto/Telha (modo 'gizmo'). */
    alvo() {
      const mv = window.MapView; if (!mv || !mv._map || !mv._renderer || !PC()) return null;
      const d = mv._formaDraft;
      if (d && d.reedit && d.stamp && PC().ehTipo(d.stamp.tipo)) return { modo: 'gizmo', d };
      const a = E2._ativos()[0];
      return a ? { modo: 'vertices', o: a } : null;
    },
    rm() { if (this.el) { this.el.remove(); this.el = null; } if (this.pb) { this.pb.remove(); this.pb = null; } },
    sync() {
      const mv = window.MapView, t = this.alvo();
      if (!t || (E2.desenho)) { this.rm(); return; }
      const R = mv._renderer;
      let wx, wy, ang, w, h;
      if (t.modo === 'gizmo') { wx = t.d.x; wy = t.d.y; ang = t.d.angulo || 0; w = t.d.largura; h = t.d.profundidade; }
      else { const b = PC().bbox(t.o); wx = t.o.x; wy = t.o.y; ang = t.o.angulo || 0; w = b.x1 - b.x0; h = b.y1 - b.y0; const c = rot((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, ang); wx += c[0]; wy += c[1]; }
      const k = rot(w / 2, -h / 2, ang), s0 = R.worldToScreen(wx + k[0], wy + k[1]), a2 = ang + (R.view.rot || 0), c2 = Math.cos(a2), n2 = Math.sin(a2);
      const ox = 64, oy = -26;   // [91ª] 🗒️ Propriedades a 26 px do canto (nos dois modos) e este botão ao lado, a 64 px   // no gizmo, ao lado do botão 🗒️ (que fica a 26 px do canto)
      const p = mv._canvasScreenToViewportPx(s0.x + ox * c2 - oy * n2, s0.y + ox * n2 + oy * c2); if (!p) { this.rm(); return; }
      if (!this.el) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'map2d-forma-prop-btn'; b.id = 'tbm-piso-toggle'; b.style.background = '#7a4df5';
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.alternar(); });
        ['mousedown', 'pointerdown', 'dblclick'].forEach((ev) => b.addEventListener(ev, (e) => e.stopPropagation()));
        (mv._container ? (mv._container.querySelector('.map2d-wrap') || mv._container) : document.body).appendChild(b); this.el = b;
      }
      // [91ª] Modo vértices: o botão 🗒️ de propriedades também aparece (no modo gizmo é o do próprio MapView)
      if (t.modo === 'vertices') {
        const q = mv._canvasScreenToViewportPx(s0.x + 26 * c2 - oy * n2, s0.y + 26 * n2 + oy * c2);
        if (q) {
          if (!this.pb) {
            const pb = document.createElement('button'); pb.type = 'button'; pb.className = 'map2d-forma-prop-btn'; pb.id = 'tbm-piso-props'; pb.textContent = '🗒️'; pb.title = 'Abrir janela de propriedades';
            pb.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const o = this.alvo() && this.alvo().o; if (o) { try { mv._openObjectPanel(o); } catch (err) { console.warn('[PisoCustomEdit] props:', err); } } });
            ['mousedown', 'pointerdown', 'dblclick'].forEach((ev) => pb.addEventListener(ev, (e) => e.stopPropagation()));
            (mv._container ? (mv._container.querySelector('.map2d-wrap') || mv._container) : document.body).appendChild(pb); this.pb = pb;
          }
          this.pb.style.left = Math.round(q.x) + 'px'; this.pb.style.top = Math.round(q.y) + 'px'; this.pb.hidden = false;
        }
      } else if (this.pb) { this.pb.remove(); this.pb = null; }
      const g = t.modo === 'gizmo';
      if (this.el.dataset.modo !== t.modo) { this.el.dataset.modo = t.modo; this.el.textContent = g ? '◇' : '⤢'; this.el.title = g ? 'Mostrar os vértices (editar o contorno)' : 'Mostrar o gizmo (mover, redimensionar e girar)'; }
      this.el.style.left = Math.round(p.x) + 'px'; this.el.style.top = Math.round(p.y) + 'px'; this.el.hidden = false;
    },
    alternar() {
      const mv = window.MapView, t = this.alvo(); if (!mv || !t) return;
      E2.cancelarDesenho(); E2.modoVertice = false; E2.ghost = null;
      if (t.modo === 'gizmo') {   // gizmo -> vértices: grava o rascunho e liga o modo de vértices
        const id = t.d.reedit.id; Promise.resolve(mv._finalizeFormaDraft()).then(() => {
          const o = (mv._map.objects || []).find((x) => x.id === id); if (!o) return;
          if (!PC().tem(o)) { PC().tornarEditavel(o); try { PC().forcar3D(o); } catch (_) { /* ok */ } }
          mv._toolSelection = new Set(['object:' + o.id]); mv._renderer.selectedObjectId = o.id; mv._selectedObjectId = o.id; mv._redrawDirty = true; BAR._chave = null;
        });
      } else {   // vértices -> gizmo: caixa = contorno (recentra a origem) e reedição com o gizmo do app
        const o = t.o; PC().recentrar(o); if (!o.forma) o.forma = 'retangulo';
        mv._toolSelection = new Set(['object:' + o.id]);
        mv._startFormaReedit(o); mv._redrawDirty = true; BAR._chave = null;
      }
    },
  };

  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('#tbm-piso-bar button'); if (!b) return;
    const acao = { 'tbm-piso-vertice': 'vertice', 'tbm-piso-recorte': 'recorte', 'tbm-piso-rm': 'rm', 'tbm-piso-rect': 'rect' }[b.id];
    if (acao) { e.stopPropagation(); BAR.agir(acao); }
  }, true);

  setInterval(() => { try { if (TOG.el) { const c = document.getElementById('map-canvas'); if (!c || !c.offsetParent) TOG.rm(); } } catch (_) { /* ok */ } }, 600);   // Planta baixa fechada: o botão não fica solto na tela
  window.PisoCustomEdit = {
    syncBar: () => BAR.sync(), bar: BAR, tog: TOG, desenhoDe: (o) => E2.desenhoDe(o), ghostDe: (o) => E2.ghostDe(o),
    ativo2D: (r, o) => E2.ativo2D(r, o), e2: E2, e3: E3,
    update3D: (v) => E3.update(v), mouseDown3D: (v, e) => E3.mouseDown(v, e), mouseMove3D: (v, e) => E3.mouseMove(v, e), mouseUp3D: (v) => E3.mouseUp(v),
  };
  // 2D: captura (fase de captura do document) para ganhar do arrastar/selecionar objeto do mapa; só reage quando há um Piso editável ativo sob o cursor.
  document.addEventListener('pointerdown', (e) => { try { E2.down(e); } catch (err) { console.error('[PisoCustomEdit]', err); } }, true);
  document.addEventListener('pointermove', (e) => { if (E2.drag) { try { E2.move(e); } catch (err) { console.error('[PisoCustomEdit]', err); } } }, true);
  document.addEventListener('pointerup', (e) => { if (E2.drag) { try { E2.up(e); } catch (err) { console.error('[PisoCustomEdit]', err); } } }, true);
  // o clique que sucede um pontilhado/arrasto/inserção não deve chegar ao mapa (selecionar/limpar seleção).
  document.addEventListener('click', (e) => {
    if (!E2._bloqueiaClick && !E2.desenho) return;
    if (e.target && e.target.id === 'map-canvas') { e.stopImmediatePropagation(); e.preventDefault(); }
    E2._bloqueiaClick = false;
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!E2.desenho && !E2.modoVertice) return;
    const t = e.target, tag = t && t.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (E2.desenho) E2.cancelarDesenho(); else { E2.modoVertice = false; BAR._chave = null; BAR.sync(); } }
    else if (E2.desenho && e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); E2.fecharDesenho(); }
    else if (E2.desenho && e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); E2.desenho.pts.pop(); window.MapView._redrawDirty = true; }
  }, true);
  document.addEventListener('pointermove', (e) => { if ((E2.desenho || E2.modoVertice) && !E2.drag) { try { E2.move(e); } catch (err) { console.error('[PisoCustomEdit]', err); } } }, true);
  document.addEventListener('dblclick', (e) => { try { E2.dblclick(e); } catch (err) { console.error('[PisoCustomEdit]', err); } }, true);
})();
