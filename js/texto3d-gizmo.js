/* js/texto3d-gizmo.js — [73ª rodada] Gizmo 3D (setas X, Y e Z) do objeto Texto no "Ver em 3D".
 * O Texto é um objeto de catálogo comum (tipo 'texto3d', parâmetros em obj.texto3d), que NÃO entra no Modelador — por isso não tinha o gizmo do Modelador.
 * Este gizmo é leve e independente: três setas coloridas (mesmas cores do gizmo do Modelador: X vermelho, Y verde, Z azul), desenhadas por cima da cena
 * no ponto de origem do Texto selecionado/criado. Interação no mesmo modelo da navegação 3D (Pointer Lock): MIRE numa seta (ela acende), SEGURE o botão
 * esquerdo e MOVA o mouse — o Texto desliza ao longo do eixo (X = obj.x, Y = obj.elevacao, Z = obj.y); ao soltar, grava no mapa.
 * Quem chama (view3d.js): update() a cada quadro; mouseDown()/mouseMove()/mouseUp() dos eventos do canvas; `view3d._txGizmoId` = Texto com gizmo. */
(function () {
  const COR = { x: 0xff3352, y: 0x8bdc00, z: 0x2c8fff };
  const G = {
    _grupo: null, _scene: null, _proxies: [], _hover: null,

    alvo(v) {
      const id = v && v._txGizmoId; if (!id || !v._map) return null;
      return (v._map.objects || []).find((o) => o.id === id && o.tipo === 'texto3d') || null;
    },
    /** posição de MUNDO (three) do ponto de origem do objeto: x, y = piso*altura + elevacao, z = obj.y do mapa. */
    origem(v, o) { const h = (v._map && v._map.alturaPiso) || 2.8; return { x: o.x, y: (o.piso || 0) * h + (o.elevacao || 0), z: o.y }; },

    _construir(eng) {
      const THREE = eng.THREE, g = new THREE.Group(); g.name = 'texto3d-gizmo'; g.renderOrder = 999;
      this._proxies = [];
      ['x', 'y', 'z'].forEach((ax) => {
        const sub = new THREE.Group(); sub.userData.axis = ax;
        if (ax === 'x') sub.rotation.z = -Math.PI / 2; else if (ax === 'z') sub.rotation.x = Math.PI / 2;
        const mat = new THREE.MeshBasicMaterial({ color: COR[ax], depthTest: false, depthWrite: false, transparent: true, opacity: 0.85 });
        const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 10), mat); haste.position.y = 0.4;
        const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 14), mat); ponta.position.y = 0.91;
        const prox = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.05, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
        prox.position.y = 0.55; prox.userData.axis = ax;
        [haste, ponta, prox].forEach((m) => { m.renderOrder = 999; sub.add(m); });
        sub.userData.mat = mat; g.add(sub); this._proxies.push(prox);
      });
      g.visible = false; this._grupo = g; this._scene = eng.scene; eng.scene.add(g);
    },

    /** A cada quadro: cria/posiciona/escala o gizmo no Texto alvo (e acende a seta sob a mira). */
    update(v) {
      const eng = v._engine; if (!eng || !eng.THREE || !eng.scene || !eng.camera3) return;
      const o = this.alvo(v), oculto = !o || (window.Modeler3D && Modeler3D.isActive && Modeler3D.isActive());
      if (!this._grupo || this._scene !== eng.scene || this._grupo.parent !== eng.scene) { if (oculto) return; this._construir(eng); }
      const g = this._grupo; g.visible = !oculto; if (oculto) { this._hover = null; return; }
      const p = this.origem(v, o), cam = eng.camera3;
      g.position.set(p.x, p.y, p.z);
      const d = Math.hypot(cam.position.x - p.x, cam.position.y - p.y, cam.position.z - p.z);
      g.scale.setScalar(Math.min(3, Math.max(0.12, d * 0.16)));
      g.updateMatrixWorld(true);
      let hv = v._txGizmoDrag ? v._txGizmoDrag.axis : null;
      if (!hv && document.pointerLockElement && !v._buildTool) { const r = eng.centerRay(v._camera); hv = this._pick(eng, r); }
      this._hover = hv;
      g.children.forEach((sub) => { const on = sub.userData.axis === hv; sub.userData.mat.opacity = on ? 1 : 0.8; sub.scale.set(on ? 1.35 : 1, 1, on ? 1.35 : 1); });
    },

    _pick(eng, ray) {
      if (!this._grupo || !this._grupo.visible) return null;
      const THREE = eng.THREE, rc = new THREE.Raycaster();
      rc.set(new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z), new THREE.Vector3(ray.dir.x, ray.dir.y, ray.dir.z).normalize());
      const hits = rc.intersectObjects(this._proxies, false);
      return hits.length ? hits[0].object.userData.axis : null;
    },

    /** parâmetro t (metros) do ponto do eixo (origem P, direção unitária d) mais próximo do raio (O, D). */
    _t(P, d, ray) {
      const O = ray.origin, D = ray.dir, w = { x: P.x - O.x, y: P.y - O.y, z: P.z - O.z };
      const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
      const a = 1, b = dot(d, D), c = dot(D, D), dd = dot(d, w), e = dot(D, w), den = a * c - b * b;
      if (Math.abs(den) < 1e-6) return 0; // raio paralelo ao eixo
      return (b * e - c * dd) / den;
    },

    mouseDown(v, e) {
      const eng = v._engine, o = this.alvo(v);
      if (!o || !eng || v._buildTool || !this._grupo || !this._grupo.visible) return false;
      const ray = eng.centerRay(v._camera), ax = this._pick(eng, ray); if (!ax) return false;
      const dir = { x: ax === 'x' ? 1 : 0, y: ax === 'y' ? 1 : 0, z: ax === 'z' ? 1 : 0 }, P = this.origem(v, o);
      const r0 = eng.rayFromScreenPoint(0, 0) || ray;
      v._txGizmoDrag = { axis: ax, dir, P, t0: this._t(P, dir, r0), ndcX: 0, ndcY: 0, ini: { x: o.x, y: o.y, elevacao: o.elevacao || 0 }, id: o.id };
      return true;
    },

    mouseMove(v, e) {
      const dr = v._txGizmoDrag, eng = v._engine; if (!dr || !eng) return false;
      const cv = eng.renderer && eng.renderer.domElement, w = (cv && cv.clientWidth) || 1, h = (cv && cv.clientHeight) || 1;
      dr.ndcX = Math.max(-1.5, Math.min(1.5, dr.ndcX + (e.movementX || 0) / (w / 2)));
      dr.ndcY = Math.max(-1.5, Math.min(1.5, dr.ndcY - (e.movementY || 0) / (h / 2)));
      const ray = eng.rayFromScreenPoint(dr.ndcX, dr.ndcY); if (!ray) return true;
      const dt = this._t(dr.P, dr.dir, ray) - dr.t0;
      if (!isFinite(dt)) return true;
      const patch = {};
      if (dr.axis === 'x') patch.x = dr.ini.x + dt; else if (dr.axis === 'z') patch.y = dr.ini.y + dt; else patch.elevacao = Math.max(0, dr.ini.elevacao + dt);
      const obj = Mapping.updateObject(v._map, dr.id, patch);
      try { if (obj && !eng.rebuildObjectIncremental(obj)) v._rebuildScene?.(); } catch (err) { v._rebuildScene?.(); }
      return true;
    },

    mouseUp(v) {
      if (!v._txGizmoDrag) return false;
      v._txGizmoDrag = null;
      try { DB.saveMap(v._map); } catch (err) { console.warn('[Texto3DGizmo] gravar mapa:', err); }
      return true;
    },
  };
  window.Texto3DGizmo = G;
})();
