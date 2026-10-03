/* js/objecttypes/piso-custom.js — [74ª rodada] Piso com CONTORNO livre (vértices) e FUROS (ex.: vão de escada), editável em tempo real.
 *
 * [81ª rodada] PRIORIDADE: a malha 3D de TODO Piso sai daqui, dos mesmos dados que o 2D desenha (nunca do molde estático). Sem edição = retângulo largura × profundidade;
 * com `obj.pisoPoligono` = contorno livre + furos:
 *   obj.pisoPoligono = { contorno: [[x, y], ...], furos: [ [[x, y], ...], ... ] }   // metros, LOCAIS à origem do objeto (obj.x, obj.y), antes de girar por obj.angulo
 *   espessura da laje = obj.altura (a mesma "Altura" do painel); base = elevação do objeto (baseY do motor 3D).
 * `obj.largura`/`obj.profundidade` continuam existindo (= caixa do contorno) para o hit-test, o "andar" (Mapping.getPisos) e o painel não quebrarem.
 *
 * PERFORMANCE (requisito): a malha é ESTÁTICA. Nada roda no requestAnimationFrame. A triangulação (earcut dentro de ExtrudeGeometry) e o upload à GPU só acontecem
 * em `CustomFloor.updateVertices()`, chamado SOMENTE enquanto um vértice é arrastado (2D ou 3D) — e SEMPRE com `geometry.dispose()` da geometria anterior (sem vazamento de VRAM).
 *
 * Contém: classe `CustomFloor` (THREE), helpers de dados `PisoCustom` (usados também pelo 2D/painel/edição) e o registro 'piso' no ObjectTypes (malha 3D). */
(function () {
  'use strict';

  /* ─────────────────────────────── dados / helpers puros (sem THREE) ─────────────────────────────── */
  const PC = {
    /** [87ª rodada] tipos com contorno livre/recortes: Piso e os Tetos do catálogo (CustomFloor / CustomCeiling compartilham a mesma edição). */
    TIPOS: ['piso', 'teto-modular', 'teto-gesso', 'telha'],
    ehTipo(t) { return this.TIPOS.indexOf(t) >= 0; },
    ehTeto(t) { return t === 'teto-modular' || t === 'teto-gesso'; },
    /** [88ª rodada] DESENHO DE REFERÊNCIA (Piso e Teto): 'nenhum' (cinza liso) | 'lajota30' (30×30 cm, rejunte 1 mm) | 'lajota60' (60×60) | 'modular60' (placas de forro 60×60).
     *  Padrão por tipo (compatível com o que já existia): Piso = nenhum (ou 'lajota60' se tinha acabamento 'lajota'); Teto modular = 'modular60'; Teto de gesso = nenhum. */
    PADROES: { nenhum: 'Sem (liso)', lajota30: 'Lajota 30×30 cm (rejunte 1 mm)', lajota60: 'Lajota 60×60 cm', modular60: 'Placas 60×60 cm (forro modular)' },
    padraoDe(obj) {
      if (obj && obj.padrao && this.PADROES[obj.padrao]) return obj.padrao;
      if (!obj) return 'nenhum';
      if (obj.tipo === 'piso') return obj.acabamento === 'lajota' ? 'lajota60' : 'nenhum';
      return obj.tipo === 'teto-modular' ? 'modular60' : 'nenhum';
    },
    kindDe(pad) { return pad === 'lajota30' ? 'lajota30' : pad === 'lajota60' ? 'lajota' : pad === 'modular60' ? 'modular' : null; },
    /** Material do Piso/Teto: textura do padrão (UV em metros → repeat = 1/ladrilho, ver _getProceduralFloorTexture(kind,1,1)) ou cor lisa. */
    materialPadrao(engine, obj, THREE, corPadrao, wireframe, colWireframe, sombra) {
      if (wireframe) return new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true });
      const kind = this.kindDe(this.padraoDe(obj));
      if (kind && engine._getProceduralFloorTexture) return new THREE.MeshLambertMaterial({ map: engine._getProceduralFloorTexture(kind, 1, 1), color: 0xffffff });
      const c = new THREE.Color(); try { c.set(obj.cor || corPadrao); } catch (e) { c.set(corPadrao); }
      return new THREE.MeshLambertMaterial({ color: c });
    },
    tem(obj) { return !!(obj && this.ehTipo(obj.tipo) && obj.pisoPoligono && Array.isArray(obj.pisoPoligono.contorno) && obj.pisoPoligono.contorno.length >= 3); },
    /** Converte o retângulo do Piso (largura × profundidade) em contorno de 4 vértices. Idempotente. */
    tornarEditavel(obj) {
      if (!obj || !this.ehTipo(obj.tipo)) return false;
      if (this.tem(obj)) return false;
      const w = (obj.largura || 10) / 2, d = (obj.profundidade || 10) / 2;
      obj.pisoPoligono = { contorno: [[-w, -d], [w, -d], [w, d], [-w, d]], furos: [] };
      return true;
    },
    /** [81ª rodada] PRIORIDADE: os dados que o 2D desenha são a fonte da malha 3D. Piso editado => obj.pisoPoligono; piso não editado => retângulo largura × profundidade
     *  (as medidas padrão só servem para colocar o objeto). Nunca o molde estático (assets/modelos/js/piso.malha.js). */
    dados(obj) {
      if (this.tem(obj)) return obj.pisoPoligono;
      const w = (obj && obj.largura || 10) / 2, d = (obj && obj.profundidade || 10) / 2;
      return { contorno: [[-w, -d], [w, -d], [w, d], [-w, d]], furos: [] };
    },
    /** Volta a ser o retângulo comum (descarta contorno e furos; largura/profundidade = caixa atual). */
    restaurarRetangulo(obj) { if (obj) delete obj.pisoPoligono; },
    /** Adiciona um furo retangular w × h (m) no centro do contorno. Devolve o índice do furo. */
    adicionarFuro(obj, w = 1, h = 1) {
      if (!this.tem(obj)) this.tornarEditavel(obj);
      const bb = this.bbox(obj), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
      w = Math.min(w, (bb.x1 - bb.x0) * 0.5); h = Math.min(h, (bb.y1 - bb.y0) * 0.5);
      obj.pisoPoligono.furos.push([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]);
      return obj.pisoPoligono.furos.length - 1;
    },
    /** Adiciona um RECORTE retangular w × h (m) num canto da caixa do contorno (escolhe o canto pela quantidade de recortes/furos já existentes), saindo 0,3 m para fora do canto
     *  para o corte ficar limpo. Arraste os vértices do recorte para ajustar (ex.: encaixar um pilar ou viga). Recortes e furos são a mesma coisa: o que cruza a borda vira entalhe. */
    adicionarRecorte(obj, w = 1.2, h = 1.2) {
      if (!this.tem(obj)) this.tornarEditavel(obj);
      const bb = this.bbox(obj), k = obj.pisoPoligono.furos.length % 4, o = 0.3;
      const ex = (k === 0 || k === 3) ? bb.x0 : bb.x1, ey = (k < 2) ? bb.y0 : bb.y1, sx = (ex === bb.x0) ? 1 : -1, sy = (ey === bb.y0) ? 1 : -1;
      const xa = ex - sx * o, xb = ex + sx * w, ya = ey - sy * o, yb = ey + sy * h;
      obj.pisoPoligono.furos.push([[xa, ya], [xb, ya], [xb, yb], [xa, yb]]);
      return obj.pisoPoligono.furos.length - 1;
    },
    removerUltimoFuro(obj) { if (this.tem(obj)) obj.pisoPoligono.furos.pop(); },
    bbox(obj) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      ((obj.pisoPoligono && obj.pisoPoligono.contorno) || []).forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      return { x0, x1, y0, y1 };
    },
    /** Mantém `largura`/`profundidade` = caixa do contorno (hit-test, andar, painel). */
    sincronizarCaixa(obj) {
      const b = this.bbox(obj); if (b.x0 > b.x1) return;
      obj.largura = Math.max(0.05, b.x1 - b.x0); obj.profundidade = Math.max(0.05, b.y1 - b.y0);
    },
    /** Recentra a ORIGEM no centro da caixa do contorno (x/y do objeto andam junto, o piso não se mexe no mundo). Chamar ao SOLTAR o arrasto. */
    recentrar(obj) {
      const b = this.bbox(obj); if (b.x0 > b.x1) return;
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      if (Math.abs(cx) < 1e-6 && Math.abs(cy) < 1e-6) { this.sincronizarCaixa(obj); return; }
      const a = obj.angulo || 0, c = Math.cos(a), s = Math.sin(a);
      obj.x += cx * c - cy * s; obj.y += cx * s + cy * c;   // mesma rotação do 2D (ctx.rotate(angulo)): local -> mundo
      const mv = (p) => { p[0] -= cx; p[1] -= cy; };
      obj.pisoPoligono.contorno.forEach(mv); obj.pisoPoligono.furos.forEach((f) => f.forEach(mv));
      this.sincronizarCaixa(obj);
    },
    /** Lista plana de TODOS os vértices editáveis: { anel: -1 (contorno) | índice do furo, i, p:[x,y] }. */
    vertices(obj) {
      const out = [];
      obj.pisoPoligono.contorno.forEach((p, i) => out.push({ anel: -1, i, p }));
      obj.pisoPoligono.furos.forEach((f, k) => f.forEach((p, i) => out.push({ anel: k, i, p })));
      return out;
    },
    anel(obj, anel) { return anel < 0 ? obj.pisoPoligono.contorno : obj.pisoPoligono.furos[anel]; },
    /** Insere um vértice no meio da aresta (anel, i -> i+1) mais próxima de (x,y) local, se a distância ≤ tol (m). Devolve {anel,i} do vértice novo (ou false). */
    inserirNaAresta(obj, x, y, tol) {
      let melhor = null;
      const teste = (pts, anel) => pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)), px = a[0] + t * dx, py = a[1] + t * dy, d = Math.hypot(x - px, y - py);
        if (d <= tol && (!melhor || d < melhor.d)) melhor = { d, anel, i, px, py };
      });
      teste(obj.pisoPoligono.contorno, -1); obj.pisoPoligono.furos.forEach((f, k) => teste(f, k));
      if (!melhor) return false;
      PC.anel(obj, melhor.anel).splice(melhor.i + 1, 0, [melhor.px, melhor.py]);
      return { anel: melhor.anel, i: melhor.i + 1 };   // truthy: vértice criado (anel/índice, para já arrastá-lo)
    },
    /** [84ª rodada] Ponto mais próximo sobre as arestas (contorno e recortes), em coords locais, se a distância ≤ tol — usado pelo ghost de ＋ Vértice. */
    pontoNaAresta(obj, x, y, tol) {
      let m = null;
      const teste = (pts) => pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)), px = a[0] + t * dx, py = a[1] + t * dy, d = Math.hypot(x - px, y - py);
        if (d <= tol && (!m || d < m.d)) m = { d, p: [px, py] };
      });
      teste(obj.pisoPoligono.contorno); obj.pisoPoligono.furos.forEach(teste);
      return m && m.p;
    },
    /** [89ª] Cópia do contorno/furos esticada em (kx, ky) em torno da origem local (o gizmo redimensiona a caixa centrada na origem). */
    escalado(pp, kx, ky) { const e = (r) => r.map((p) => [p[0] * kx, p[1] * ky]); return { contorno: e(pp.contorno), furos: pp.furos.map(e) }; },
    /** Remove o vértice (contorno/furo) se o anel continuar com ≥ 3 pontos; um furo que ficaria com < 3 some inteiro. */
    removerVertice(obj, anel, i) {
      const pts = PC.anel(obj, anel);
      if (pts.length > 3) { pts.splice(i, 1); return true; }
      if (anel >= 0) { obj.pisoPoligono.furos.splice(anel, 1); return true; }
      return false;
    },
  };
  /** Regiões efetivas do piso = contorno − (furos ∪ recortes): [{ outer, holes }]. Memoizado pela geometria (só recalcula quando um vértice muda).
   *  Furo totalmente interno => furo; recorte que cruza a borda => entalhe (js/polybool2d.js). Sem a biblioteca/em falha numérica: contorno com furos simples. */
  let _memoK = null, _memoV = null;
  PC.faces = function (contorno, furos) {
    const k = JSON.stringify([contorno, furos]);
    if (k === _memoK) return _memoV;
    let f = null;
    if (!furos.length) f = [{ outer: contorno, holes: [] }];
    else if (window.PolyBool2D) f = window.PolyBool2D.diferenca(contorno, furos.filter((r) => r && r.length >= 3));
    if (!f) f = [{ outer: contorno, holes: furos.filter((r) => r && r.length >= 3) }];
    _memoK = k; _memoV = f; return f;
  };
  /** [86ª rodada] Faces + caixa do piso para os testes de CHÃO por quadro (gravidade/colisão): cache por objeto (WeakMap) invalidado por um hash numérico barato
   *  das coordenadas (sem JSON.stringify). Em repouso o custo por quadro é: 1 hash O(n) + teste da caixa; o polígono só é percorrido se o ponto cair na caixa. */
  const _wmFaces = new WeakMap();
  PC.facesRapido = function (obj) {
    const pp = obj.pisoPoligono; let h = pp.contorno.length * 131 + pp.furos.length * 17;
    const acc = (r) => { for (let i = 0; i < r.length; i++) h += r[i][0] * (i + 1.3) + r[i][1] * (i + 2.7); };
    acc(pp.contorno); pp.furos.forEach((f, k) => { h += k * 3.1; acc(f); });
    const c = _wmFaces.get(pp); if (c && c.h === h) return c;
    const b = PC.bbox(obj), n = { h, faces: PC.faces(pp.contorno, pp.furos), x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 };
    _wmFaces.set(pp, n); return n;
  };
  window.PisoCustom = PC;

  /* ─────────────────────────────── CustomFloor (THREE) ─────────────────────────────── */
  class CustomFloor {
    /**
     * @param {Array<{x,y}|THREE.Vector2>} verticesContorno  contorno externo (metros, plano da planta)
     * @param {Array<Array<{x,y}|THREE.Vector2>>} furos       furos internos
     * @param {object} [opcoes] { THREE, espessura, material, flag2D }
     */
    constructor(verticesContorno, furos = [], opcoes = {}) {
      this.THREE = opcoes.THREE || window.THREE;
      this.verticesContorno = verticesContorno;
      this.furos = furos;
      this.flag2D = !!opcoes.flag2D;
      // Extrusão padrão: sem bevel e com o MÍNIMO de segmentos — menos vértices = triangulação e upload mais baratos durante o arrasto.
      this.extrudeSettings = { depth: opcoes.espessura ?? 0.2, bevelEnabled: false, steps: 1, curveSegments: 1 };
      this.material = opcoes.material || new this.THREE.MeshLambertMaterial({ color: 0x8a92a3 });
      this.mesh = null;
      this._init();
    }

    _v2(p) { const T = this.THREE; return Array.isArray(p) ? new T.Vector2(p[0], p[1]) : new T.Vector2(p.x, p.y); }

    _init() {
      this.mesh = new this.THREE.Mesh(this.buildGeometry(), this.material);
      this.mesh.name = 'CustomFloor';
      // Sem loop próprio: depois de criada é uma Mesh comum/estática (zero custo por quadro).
    }

    /** Shape + Paths dos furos. Winding: contorno anti-horário (CCW) e furos horários (CW), do contrário o earcut pode tratar o furo como sólido. */
    buildGeometry(contorno = this.verticesContorno, furos = this.furos, flag2D = this.flag2D) {
      const T = this.THREE;
      const ccw = (pts) => (T.ShapeUtils.isClockWise(pts) ? pts.slice().reverse() : pts);
      const cw = (pts) => (T.ShapeUtils.isClockWise(pts) ? pts : pts.slice().reverse());
      const paraPts = (r) => r.map((p) => this._v2(p));
      // Regiões efetivas: contorno − (furos ∪ recortes). Entalhes/divisões podem gerar várias regiões; cada uma vira um Shape (ExtrudeGeometry aceita array).
      const faces = PC.faces(contorno.map((p) => (Array.isArray(p) ? p : [p.x, p.y])), furos.map((f) => f.map((p) => (Array.isArray(p) ? p : [p.x, p.y]))));
      const shapes = [];
      for (const f of faces) {
        if (!f.outer || f.outer.length < 3) continue;
        const shape = new T.Shape(ccw(paraPts(f.outer)));
        for (const h of f.holes) { if (h && h.length >= 3) shape.holes.push(new T.Path(cw(paraPts(h)))); } // winding: externo CCW, furos CW (senão o earcut pode tratar o furo como sólido)
        shapes.push(shape);
      }
      if (!shapes.length) shapes.push(new T.Shape([new T.Vector2(0, 0), new T.Vector2(0.001, 0), new T.Vector2(0, 0.001)])); // recortes engoliram o piso: sliver invisível, sem quebrar a Mesh
      const geo = flag2D ? new T.ShapeGeometry(shapes, 1) : new T.ExtrudeGeometry(shapes, this.extrudeSettings);
      // Shape vive em XY e a extrusão sai em +Z. rotateX(+90°): (x, y, z) -> (x, -z, y) — o y do contorno vira o Z do mundo (igual ao y do mapa 2D),
      // a extrusão desce a partir de y=0; o translate sobe a laje para ocupar y ∈ [0, espessura] (base = elevação do objeto).
      geo.rotateX(Math.PI / 2);
      if (!flag2D) geo.translate(0, this.extrudeSettings.depth, 0);
      return geo;
    }

    /** Chamado a cada movimento do mouse durante o drag de um vértice. Gera a nova ANTES de descartar a antiga (se a triangulação falhar, a antiga permanece)
     *  e libera a antiga na GPU com dispose() — sem isso cada movimento deixaria buffers órfãos na VRAM. O material é reaproveitado (não recebe dispose). */
    updateVertices(novosVerticesContorno, novosFuros = this.furos, espessura) {
      this.verticesContorno = novosVerticesContorno;
      this.furos = novosFuros;
      if (espessura != null) this.extrudeSettings.depth = espessura;
      const nova = this.buildGeometry();
      this.mesh.geometry.dispose();
      this.mesh.geometry = nova;
      this.mesh.geometry.computeBoundingSphere(); // raycast/frustum culling usam a esfera; recalculada só aqui, não por quadro
    }

    getMesh() { return this.mesh; }

    dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
  }
  window.CustomFloor = CustomFloor;

  /* ─────────────────────────────── desenho 2D ─────────────────────────────── */
  /** `ctx` já está no centro/rotação do objeto (convenção de _drawFormaShape). Preenchimento com furos (evenodd), contorno e — com o piso ativo — alças dos vértices.
   *  Devolve o ponto (px, relativo ao centro) do selo de item. */
  PC.draw2D = function (renderer, ctx, obj, selected, strokeColor, strokeW, fillMode) {
    const z = renderer.view.zoom, pp = obj.pisoPoligono;
    const faces = PC.faces(pp.contorno, pp.furos);
    ctx.beginPath();
    faces.forEach((f) => [f.outer].concat(f.holes).forEach((pts) => { pts.forEach((p, i) => { if (i) ctx.lineTo(p[0] * z, p[1] * z); else ctx.moveTo(p[0] * z, p[1] * z); }); ctx.closePath(); }));
    if (fillMode !== 'stroke') {
      const alpha = (obj.tipo && !renderer.objetoTransparencia2DAtivo) ? 1 : (selected ? 0.55 : 0.35);
      const corTelha = (obj.tipo === 'telha' && window.CustomRoof) ? (window.CustomRoof.MATERIAIS[window.CustomRoof.cfgDe(obj).material] || {}).cor : null;   // [88ª] a cor do material aparece no 2D na hora
      ctx.fillStyle = renderer._fillStyleFor(ctx, corTelha || obj.cor || '#8a92a3', obj.fillType, alpha);
      ctx.fill('evenodd');
    }
    if (fillMode !== 'stroke' && obj.tipo === 'telha' && window.CustomRoof) { try { window.CustomRoof.draw2D(ctx, obj, z, renderer.mapData, selected); } catch (e) { console.warn('[Telha] draw2D:', e); } }   // [88ª] formato, águas e união
    if (fillMode !== 'stroke' && obj.tipo === 'telha') { ctx.beginPath(); faces.forEach((f) => [f.outer].concat(f.holes).forEach((pts) => { pts.forEach((p, i) => { if (i) ctx.lineTo(p[0] * z, p[1] * z); else ctx.moveTo(p[0] * z, p[1] * z); }); ctx.closePath(); })); }   // o desenho da telha usou o caminho: refaz o do contorno antes do traço
    if (fillMode !== 'fill') {
      ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeW; ctx.setLineDash(renderer._lineDashFor(obj.strokeStyle, strokeW)); ctx.stroke(); ctx.setLineDash([]);
    }
    // [84ª rodada] ícone impresso do piso: continua aparecendo no desenho 2D mesmo com o contorno editado/recortado (recortado pela forma real, preenchimento evenodd).
    if (fillMode !== 'stroke' && obj.tipo && renderer._getIconImage) {
      const img = renderer._getIconImage(obj.tipo);
      if (img && img.complete && img.naturalWidth) {
        const bb = PC.bbox(obj), isz = Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0) * z * 0.6;
        if (isz > 2) { ctx.save(); ctx.clip('evenodd'); ctx.drawImage(img, ((bb.x0 + bb.x1) / 2) * z - isz / 2, ((bb.y0 + bb.y1) / 2) * z - isz / 2, isz, isz); ctx.restore(); }
      }
    }
    // [84ª rodada] ghost: onde o vértice (＋ Vértice) ou o próximo ponto do recorte será inserido.
    const gh = window.PisoCustomEdit && window.PisoCustomEdit.ghostDe(obj);
    if (gh) { ctx.save(); ctx.beginPath(); ctx.arc(gh[0] * z, gh[1] * z, 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(124,255,178,0.45)'; ctx.fill(); ctx.setLineDash([3, 2]); ctx.strokeStyle = '#7cffb2'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
    const des = window.PisoCustomEdit && window.PisoCustomEdit.desenhoDe(obj);
    if (des) { // recorte sendo desenhado como polilinha (js/piso-custom-edit.js): traço tracejado + linha até o cursor + pontos
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#7cffb2'; ctx.lineWidth = 2; ctx.beginPath();
      des.pts.forEach((p, i) => { if (i) ctx.lineTo(p[0] * z, p[1] * z); else ctx.moveTo(p[0] * z, p[1] * z); });
      if (des.mouse) ctx.lineTo(des.mouse[0] * z, des.mouse[1] * z);
      ctx.stroke(); ctx.setLineDash([]);
      des.pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(p[0] * z, p[1] * z, i === 0 ? 6 : 4, 0, Math.PI * 2); ctx.fillStyle = i === 0 ? '#7cffb2' : '#ffffff'; ctx.fill(); ctx.strokeStyle = '#1b2430'; ctx.lineWidth = 1.2; ctx.stroke(); });
      ctx.restore();
    }
    // [81ª rodada] sem seleção: só o formato final (preenchimento + contorno), sem vértices nem tracejado dos recortes.
    const ativo = !!(window.PisoCustomEdit && window.PisoCustomEdit.ativo2D(renderer, obj));
    if (ativo && pp.furos.length) { // recortes/furos: contorno tracejado laranja (mostra o desenho do recorte mesmo quando ele já virou entalhe)
      ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 1.2; ctx.beginPath();
      pp.furos.forEach((pts) => { pts.forEach((p, i) => { if (i) ctx.lineTo(p[0] * z, p[1] * z); else ctx.moveTo(p[0] * z, p[1] * z); }); ctx.closePath(); });
      ctx.stroke(); ctx.restore();
    }
    if (ativo) {
      PC.vertices(obj).forEach((v) => {
        ctx.beginPath(); ctx.rect(v.p[0] * z - 4.5, v.p[1] * z - 4.5, 9, 9);
        ctx.fillStyle = v.anel < 0 ? '#ffffff' : '#ffb347'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1b2430'; ctx.setLineDash([]); ctx.stroke();
      });
    }
    const b = PC.bbox(obj);
    return { x: Math.max(b.x0 * z + 10, (b.x1 * z) - 10), y: Math.min(b.y1 * z - 10, (b.y0 * z) + 10) };
  };

  /* ─────────────────────────────── integração com o motor 3D ─────────────────────────────── */
  PC._pickDe = function (engine, mesh, obj, pick) {
    const THREE = engine.THREE;
    mesh.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(mesh), c = box3.getCenter(new THREE.Vector3()), s = box3.getSize(new THREE.Vector3());
    const pos = { x: c.x, y: c.y, z: c.z }, hx = Math.max(0.05, s.x / 2), hy = Math.max(0.05, s.y / 2), hz = Math.max(0.05, s.z / 2);
    if (!pick) pick = { id: obj.id, type: 'object', ref: obj };
    Object.assign(pick, { pos, center: pos, radius: Math.max(hx, hz) * 1.2, obb: { half: { x: hx, y: hy, z: hz }, rotY: 0, shape: 'box', segments: 14 } });
    return pick;
  };

  /** Atualização EM TEMPO REAL (arrasto): troca só a geometria da malha existente (dispose da antiga) — não reconstrói o objeto nem a cena.
   *  Devolve true se atualizou; false se o objeto ainda não tem malha própria (o chamador cai em rebuildObjectIncremental). */
  PC.atualizar3D = function (engine, obj) {
    if (!engine || !engine._pickMeshes) return false;
    const mesh = engine._pickMeshes.find((m) => m.userData && m.userData.pisoCustom && m.userData.pick && m.userData.pick.ref === obj);
    if (!mesh) return false;
    const pp = PC.dados(obj);   // [81ª] mesmos dados do 2D
    mesh.userData.pisoCustom.updateVertices(pp.contorno, pp.furos, Math.max(0.01, obj.altura || 0.2));
    PC._pickDe(engine, mesh, obj, mesh.userData.pick);
    // [88ª] telhados unidos: ao mexer num vértice, os outros membros da união refazem suas facetas (a superfície é uma peça única)
    if (obj.tipo === 'telha' && window.CustomRoof && engine.mapData) window.CustomRoof.membros(obj, engine.mapData).forEach((o) => { if (o !== obj && o.id !== obj.id) { try { engine.rebuildObjectIncremental(o); } catch (e) { /* segue */ } } });
    return true;
  };

  /** [79ª rodada b] Atualização DIRETA do 3D por id, sem depender do sync genérico do mapa (_sync3DLive/_sync3DAlvo): copia o piso do 2D para o objeto da cena 3D (se forem objetos distintos),
   *  troca a geometria da malha existente (ou reconstrói o objeto, se ainda não era "piso editável") e regrava a linha de base. Chamado ao fim de cada edição do piso no 2D. */
  PC.forcar3D = function (obj) {
    try {
      const v = window.View3D, eng = v && v._engine; if (!eng || !eng._ready || !eng.mapData || !obj) return false;
      const o3 = (eng.mapData.objects || []).find((x) => x.id === obj.id);
      if (!o3) { if (v._rebuildScene) v._rebuildScene({ liveSync: true }); return true; }
      if (o3 !== obj) {
        ['x', 'y', 'angulo', 'largura', 'profundidade', 'altura', 'elevacao', 'cor', 'acabamento', 'padrao', 'telha'].forEach((k) => { if (obj[k] === undefined) delete o3[k]; else o3[k] = obj[k]; });
        if (obj.pisoPoligono) o3.pisoPoligono = JSON.parse(JSON.stringify(obj.pisoPoligono)); else delete o3.pisoPoligono;
      }
      const mesh = (eng._pickMeshes || []).find((m) => m.userData && m.userData.pisoCustom && m.userData.pick && m.userData.pick.ref === o3);
      if (mesh) {   // [81ª] a malha do Piso é sempre a própria (CustomFloor): só troca a geometria, com os mesmos dados do 2D
        const pp = PC.dados(o3);
        mesh.userData.pisoCustom.updateVertices(pp.contorno, pp.furos, Math.max(0.01, o3.altura || 0.2));
        mesh.position.x = o3.x; mesh.position.z = o3.y; mesh.rotation.y = -(o3.angulo || 0);
        PC._pickDe(eng, mesh, o3, mesh.userData.pick);
        if (eng._liveBase) eng._liveBase.set(o3, eng._liveSnap(o3));
      } else if (!eng.rebuildObjectIncremental(o3) && v._rebuildScene) v._rebuildScene({ liveSync: true });
      if (eng.requestRender) eng.requestRender();
      return true;
    } catch (err) { console.warn('[PisoCustom] forcar3D:', err); return false; }
  };

  /** [80ª rodada] 3D -> 2D: espelha no objeto do mapa 2D (MapView) o contorno/furos/caixa editados no 3D e pede redesenho — com objetos compartilhados é só o redesenho; com cópias, copia os campos. */
  PC.espelhar2D = function (o3) {
    try {
      const mv = window.MapView; if (!mv || !mv._map || !o3) return false;
      const o2 = (mv._map.objects || []).find((x) => x.id === o3.id); if (!o2) return false;
      if (o2 !== o3) {
        ['x', 'y', 'angulo', 'largura', 'profundidade', 'altura'].forEach((k) => { if (o3[k] !== undefined) o2[k] = o3[k]; });
        if (o3.pisoPoligono) o2.pisoPoligono = JSON.parse(JSON.stringify(o3.pisoPoligono)); else delete o2.pisoPoligono;
      }
      mv._redrawDirty = true;
      return true;
    } catch (err) { console.warn('[PisoCustom] espelhar2D:', err); return false; }
  };

  /** [87ª rodada] TETO do catálogo (teto-modular / teto-gesso) LIGADO ao CustomCeiling: enquanto não for editado, o teto continua com o desenho de sempre (retângulo, rodelas do gesso etc.);
   *  ao ganhar contorno livre/recortes (obj.pisoPoligono — mesmos botões/vértices do Piso), a malha 3D sai desses dados com CustomCeiling (DoubleSide, forro de espessura = obj.altura, base = elevação). */
  const _tetoDef = {
    matchesMesh3D(obj) { return PC.ehTeto(obj && obj.tipo) && (PC.tem(obj) || (obj.tipo === 'teto-gesso' && PC.padraoDe(obj) !== 'nenhum')); },   // [88ª] gesso só sai do desenho de sempre se ganhar um padrão
    malhaPropria(obj) { return PC.ehTeto(obj && obj.tipo) && (PC.tem(obj) || (obj.tipo === 'teto-gesso' && PC.padraoDe(obj) !== 'nenhum')); },
    buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
      const THREE = engine.THREE, pp = PC.dados(obj), esp = Math.max(0.01, obj.altura || 0.2);
      const mat = PC.materialPadrao(engine, obj, THREE, obj.tipo === 'teto-gesso' ? '#ffffff' : '#f3f4f6', wireframe, colWireframe);
      const teto = new window.CustomCeiling(pp.contorno, pp.furos, baseY, { THREE, espessura: esp, material: mat });
      const mesh = teto.getMesh();
      mesh.position.set(obj.x, baseY, obj.y);
      mesh.rotation.y = -(obj.angulo || 0);
      engine._group.add(mesh);
      const pick = PC._pickDe(engine, mesh, obj, null);
      engine.pickables.push(pick);
      mesh.userData.pick = pick;
      // adaptador: o resto da edição (2D/3D) chama updateVertices(contorno, furos, ESPESSURA) como no CustomFloor
      mesh.userData.pisoCustom = { updateVertices(c, f, e) { teto.extrudeSettings.depth = e; teto.updateVertices(c, f); mesh.position.y = baseY; }, getMesh: () => mesh };
      engine._pickMeshes.push(mesh);
    },
  };
  window.ObjectTypes.register('teto-modular', _tetoDef);
  window.ObjectTypes.register('teto-gesso', _tetoDef);

  window.ObjectTypes.register('piso', {
    // [81ª rodada] PRIORIDADE (pedido do usuário): todo Piso é desenhado no 3D pelos MESMOS dados do 2D — o molde estático (piso.malha.js, molde de "Acessar modelos", customMesh)
    // é sempre ignorado (ver `_malhaPropria` em engine3d.js _buildOneObjectMeshCore). Exceção: piso usado como retículo métrico (desenho próprio do motor).
    matchesMesh3D(obj) { return !!(obj && obj.tipo === 'piso' && !obj.reticuloMetrico); },
    malhaPropria(obj) { return !!(obj && obj.tipo === 'piso' && !obj.reticuloMetrico); },
    buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
      const THREE = engine.THREE, pp = PC.dados(obj);   // [81ª] contorno editado ou retângulo largura × profundidade — os mesmos dados que o 2D desenha
      const mat = PC.materialPadrao(engine, obj, THREE, '#8a92a3', wireframe, colWireframe);   // [88ª] desenho de referência (padrão: nenhum = cinza liso)
      const floor = new CustomFloor(pp.contorno, pp.furos, { THREE, espessura: Math.max(0.01, obj.altura || 0.2), material: mat });
      const mesh = floor.getMesh();
      mesh.position.set(obj.x, baseY, obj.y);
      mesh.rotation.y = -(obj.angulo || 0); // = objAnguloToRotY (bate com a rotação do 2D)
      engine._group.add(mesh);
      const pick = PC._pickDe(engine, mesh, obj, null);
      engine.pickables.push(pick);
      mesh.userData.pick = pick;
      mesh.userData.pisoCustom = floor;
      engine._pickMeshes.push(mesh);
    },
  });
})();
