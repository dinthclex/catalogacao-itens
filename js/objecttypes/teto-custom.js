/* js/objecttypes/teto-custom.js — [86ª rodada] CustomCeiling: gêmea do CustomFloor (js/objecttypes/piso-custom.js) para o TETO/forro.
 * Mesma arquitetura de performance: geometria ESTÁTICA por padrão (Mesh comum, zero custo por quadro); recálculo + upload à GPU (com dispose() da antiga)
 * somente em updateVertices(), chamado a cada movimento do mouse durante o arrasto de um vértice.
 * Diferenciais do teto: material DoubleSide (visível por fora/por cima e por dentro, olhando para cima), mesh.position.y = alturaParedes (pé-direito),
 * forro fino (espessura padrão 0,05 m, sem bevel) e setVisible() para esconder o teto e ver os móveis.
 * Reaproveita a triangulação do piso (furos/recortes via PisoCustom.faces → PolyBool2D) quando disponível; sem ela usa Shape + holes diretos. */
(function () {
  'use strict';
  class CustomCeiling {
    /**
     * @param {Array<THREE.Vector2|{x,y}|[x,y]>} verticesContorno  contorno externo (metros, plano da planta)
     * @param {Array<Array>} furos            claraboias / vãos de escada (cada furo = lista de vértices)
     * @param {number} alturaParedes          pé-direito (ex.: 2.8): o teto fica em y = alturaParedes
     * @param {object} [opcoes] { THREE, espessura, material, cor }
     */
    constructor(verticesContorno, furos = [], alturaParedes = 2.8, opcoes = {}) {
      this.THREE = opcoes.THREE || window.THREE;
      this.verticesContorno = verticesContorno;
      this.furos = furos;
      this.alturaParedes = alturaParedes;
      // Extrusão padrão: forro fino, sem bevel e com o mínimo de segmentos (triangulação/upload baratos durante o arrasto).
      this.extrudeSettings = { depth: opcoes.espessura ?? 0.05, bevelEnabled: false, steps: 1, curveSegments: 1 };
      this.material = opcoes.material || new this.THREE.MeshLambertMaterial({ color: opcoes.cor ?? 0xf3f4f6, side: this.THREE.DoubleSide });
      this.material.side = this.THREE.DoubleSide;   // obrigatório: visto por fora/por cima E por dentro do cômodo
      this.mesh = null;
      this._init();
    }

    _v2(p) { const T = this.THREE; return Array.isArray(p) ? new T.Vector2(p[0], p[1]) : new T.Vector2(p.x, p.y); }
    _arr(p) { return Array.isArray(p) ? p : [p.x, p.y]; }

    _init() {
      this.mesh = new this.THREE.Mesh(this.buildGeometry(), this.material);
      this.mesh.name = 'CustomCeiling';
      this.mesh.position.y = this.alturaParedes;
    }

    /** Shape + Paths dos furos. Winding: contorno CCW e furos CW (senão o earcut pode tratar o furo como sólido). */
    buildGeometry(contorno = this.verticesContorno, furos = this.furos) {
      const T = this.THREE;
      const ccw = (pts) => (T.ShapeUtils.isClockWise(pts) ? pts.slice().reverse() : pts);
      const cw = (pts) => (T.ShapeUtils.isClockWise(pts) ? pts : pts.slice().reverse());
      const paraPts = (r) => r.map((p) => this._v2(p));
      const C = contorno.map((p) => this._arr(p)), F = furos.map((f) => f.map((p) => this._arr(p)));
      const PC = window.PisoCustom;
      // com PisoCustom: contorno − (furos ∪ recortes) (entalhes/divisões viram várias regiões); sem: contorno + furos simples.
      const faces = PC && PC.faces ? PC.faces(C, F) : [{ outer: C, holes: F.filter((h) => h.length >= 3) }];
      const shapes = [];
      for (const f of faces) {
        if (!f.outer || f.outer.length < 3) continue;
        const shape = new T.Shape(ccw(paraPts(f.outer)));
        for (const h of f.holes) if (h && h.length >= 3) shape.holes.push(new T.Path(cw(paraPts(h))));
        shapes.push(shape);
      }
      if (!shapes.length) shapes.push(new T.Shape([new T.Vector2(0, 0), new T.Vector2(0.001, 0), new T.Vector2(0, 0.001)])); // sliver invisível, sem quebrar a Mesh
      const geo = new T.ExtrudeGeometry(shapes, this.extrudeSettings);
      // Shape em XY, extrusão em +Z. rotateX(+90°): (x,y,z) -> (x,-z,y): o y do contorno vira o Z do mundo (= y do mapa 2D); a extrusão desce de y=0.
      // translate(0, depth, 0): o forro ocupa y ∈ [0, depth] local, e a mesh sobe até alturaParedes.
      geo.rotateX(Math.PI / 2);
      geo.translate(0, this.extrudeSettings.depth, 0);
      return geo;
    }

    /** Teto visível/oculto (ver os móveis por cima no modo 3D). */
    setVisible(visivel) { if (this.mesh) this.mesh.visible = !!visivel; }
    isVisible() { return !!(this.mesh && this.mesh.visible); }

    /** Chamado a cada movimento do mouse durante o arrasto de um vértice. Gera a geometria nova ANTES de descartar a antiga (se a triangulação falhar a antiga permanece)
     *  e libera a antiga na GPU com dispose(); o material é reaproveitado. */
    updateVertices(novosVerticesContorno, novosFuros = this.furos, novaAltura) {
      this.verticesContorno = novosVerticesContorno;
      this.furos = novosFuros;
      if (novaAltura != null) { this.alturaParedes = novaAltura; this.mesh.position.y = novaAltura; }
      const nova = this.buildGeometry();
      this.mesh.geometry.dispose();             // evita vazamento de VRAM (buffers órfãos)
      this.mesh.geometry = nova;
      this.mesh.geometry.computeBoundingSphere();
    }

    getMesh() { return this.mesh; }
    dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
  }
  window.CustomCeiling = CustomCeiling;

  /* ── EXEMPLO PRÁTICO ──
   *   const T = THREE;
   *   const contorno = [new T.Vector2(0,0), new T.Vector2(8,0), new T.Vector2(8,6), new T.Vector2(0,6)];
   *   const claraboia = [[new T.Vector2(3,2), new T.Vector2(5,2), new T.Vector2(5,4), new T.Vector2(3,4)]];
   *   const teto = new CustomCeiling(contorno, claraboia, 2.8);          // teto a 2,8 m
   *   scene.add(teto.getMesh());
   *   document.querySelector('#btn-teto').addEventListener('click', () => teto.setVisible(!teto.isVisible()));   // botão da interface
   *   // durante o arrasto de um vértice:  teto.updateVertices(novoContorno, claraboia, 2.8);
   */
})();
