/* js/texto3d-cruz.js — [74ª rodada] Cruz de referência da ORIGEM do objeto Texto no "Ver em 3D".
 * Aparece enquanto a aba vertical "Texto" está aberta, no ponto (x, y=piso+elevação, z) do Texto editado: 3 eixos finos (X vermelho, Y verde, Z azul, as mesmas cores do gizmo
 * do Modelador) atravessando a origem, por cima da cena. Serve para ver onde está a origem das coordenadas e conferir os alinhamentos.
 * NÃO é gizmo (não move nada): o gizmo de mover/girar/escalar é só o do Modelador. Quem chama: view3d.js, `Texto3DCruz.update(view)` a cada quadro. */
(function () {
  const COR = { x: 0xff3352, y: 0x8bdc00, z: 0x2c8fff };
  const C = {
    _grupo: null, _scene: null,
    alvo(v) {
      const id = v && v._textoAlvoId; if (!id || !v._map) return null;
      return (v._map.objects || []).find((o) => o.id === id && o.tipo === 'texto3d') || null;
    },
    _aberta(v) {
      const t = v._container && v._container.querySelector('#m3d-sidebar-toggle');
      const aba = window.ModelerUI && ModelerUI._sidebarCtx && ModelerUI._sidebarCtx(v);
      return !!(t && t.classList.contains('open') && aba && aba._sidebarTab === 'texto');
    },
    _construir(eng) {
      const THREE = eng.THREE, g = new THREE.Group(); g.name = 'texto3d-cruz'; g.renderOrder = 998;
      ['x', 'y', 'z'].forEach((ax) => {
        const p = new Float32Array(6), i = ax === 'x' ? 0 : ax === 'y' ? 1 : 2; p[i] = -1; p[3 + i] = 1;
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
        const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: COR[ax], depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 }));
        l.renderOrder = 998; l.frustumCulled = false; g.add(l);
      });
      const pt = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }));
      pt.renderOrder = 999; g.add(pt);
      g.visible = false; this._grupo = g; this._scene = eng.scene; eng.scene.add(g);
    },
    update(v) {
      const eng = v._engine; if (!eng || !eng.THREE || !eng.scene || !eng.camera3) return;
      const o = this.alvo(v), mostrar = !!o && this._aberta(v) && !(window.Modeler3D && Modeler3D.isActive && Modeler3D.isActive());
      if (!this._grupo || this._scene !== eng.scene || this._grupo.parent !== eng.scene) { if (!mostrar) return; this._construir(eng); }
      const g = this._grupo; g.visible = mostrar; if (!mostrar) return;
      const h = (v._map && v._map.alturaPiso) || 2.8, cam = eng.camera3;
      const x = o.x, y = (o.piso || 0) * h + (o.elevacao || 0), z = o.y;
      g.position.set(x, y, z);
      const d = Math.hypot(cam.position.x - x, cam.position.y - y, cam.position.z - z);
      g.scale.setScalar(Math.min(2, Math.max(0.15, d * 0.12)));
    },
  };
  window.Texto3DCruz = C;
})();
