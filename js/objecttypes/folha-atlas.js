/* js/objecttypes/folha-atlas.js
 * [50ª rodada, revisto na 51ª] ATLAS DE TEXTURA + INSTANCIAMENTO + LOD para as Folhas de Papel (objeto 'folha-papel').
 *
 * PROBLEMA ORIGINAL: um <canvas> 512x724 + CanvasTexture + material POR folha (~2 MB de VRAM cada) e 1 draw call por folha.
 *
 * ARQUITETURA
 *  - Atlas por "camada de resolução" (tier): lo = célula 256x362 (todas as folhas), mid = 512x724 (as ~12 mais próximas), hi = 1024x1448 (as ~4 mais próximas).
 *    A célula é sempre a proporção A4 (1 : 1,414) com escala uniforme: MESMA densidade em X e Y. Páginas nascem sob demanda (mid/hi só quando alguém chega perto).
 *  - ANTI-VAZAMENTO: cada célula tem uma BORDA (gutter) de 16 px pintada com a cor da própria folha; a UV usa só a área de conteúdo. Com mipmaps e filtro linear,
 *    o que "vaza" nas bordas é a cor da própria folha, nunca o conteúdo da vizinha (até o mip nível 4, quando a folha já ocupa poucos pixels na tela).
 *  - Edição: só a célula é limpa/redesenhada (clip) e a página recebe needsUpdate (flag; várias edições no mesmo quadro = 1 upload). Conteúdo igual = nada é feito.
 *  - LOD: longe -> célula lo (256 px; VRAM ~0,6 MB/folha em vez de ~2 MB) + mipmap; perto -> promovida a mid/hi (texto nítido) e volta ao se afastar (histerese).
 *  - INSTANCIAMENTO (liga ao motor): o motor continua com 1 malha por folha (picking/OBB/mover ao vivo dependem dela), mas, como já faz com os outros tipos
 *    (Engine3D._instancedPools / userData._inst), a malha individual fica invisível e UM InstancedMesh por página desenha todas as folhas daquela página (1 draw call
 *    por página de 20 folhas, em vez de 20). Folha promovida ao LOD alto usa _instancePromote (volta a ser desenhada individualmente, com a célula 'alta').
 *
 * API: FolhaAtlas.init(THREE,{maxTex}) · textureFor(id,params) · registrar(engine,id,mesh,geo,slot,params) · buildPools(engine) · updateLOD(engine,camera)
 *      applyUV(geometry,faceIndex,slot) · fallbackTexture · materialFor(page) · sideMaterial(cor) · stats()
 * params: { texto, bg, corTexto, fonte, tam, linhas, margem }
 */
(function () {
  const DESIGN_W = 512, DESIGN_H = 724;   // espaço de desenho A4 (1 : 1,414)
  const GUT = 16;                          // borda anti-vazamento (px de textura, em cada lado da célula)
  const NEAR_ON = 0.9, NEAR_OFF = 1.3, NEAR_MAX = 4;   // LOD alto: liga < 0,9 m, desliga > 1,3 m, no máx. 4 folhas

  function desenharFolha(ctx, p) {
    const o = Object.assign({ texto: '', bg: '#fef08a', corTexto: '#1e293b', fonte: 'Arial', tam: 30, linhas: true, margem: true }, p || {});
    const tam = Math.max(8, Math.min(80, Number(o.tam) || 30)), lh = Math.round(tam * 34 / 30);
    ctx.fillStyle = o.bg; ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    ctx.fillStyle = 'rgba(0,0,0,0.02)';
    for (let i = 0; i < 200; i++) ctx.fillRect(Math.random() * DESIGN_W, Math.random() * DESIGN_H, 2, 2);
    ctx.lineWidth = 1;
    if (o.linhas) { ctx.strokeStyle = 'rgba(0,0,0,0.08)'; for (let y = 46 + lh; y < DESIGN_H; y += lh) { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(DESIGN_W - 30, y); ctx.stroke(); } }
    if (o.margem) { ctx.strokeStyle = 'rgba(239,68,68,0.2)'; ctx.beginPath(); ctx.moveTo(50, 0); ctx.lineTo(50, DESIGN_H); ctx.stroke(); }
    ctx.fillStyle = o.corTexto; ctx.font = tam + 'px ' + o.fonte; ctx.textBaseline = 'alphabetic';
    const marginX = 60, maxWidth = DESIGN_W - marginX - 30;
    let y = 46 + lh;   // linha de base do texto = linhas da pauta
    String(o.texto || '').split('\n').forEach((line) => {
      quebrarParagrafo(ctx, line, maxWidth).forEach((l) => { ctx.fillText(l, marginX, y); y += lh; });
    });
  }

  /** [55ª rodada] ALGORITMO ÚNICO de quebra de linha da folha (usado pelo desenho 3D acima E pelo editor do painel, via FolhaAtlas.layout): quebra entre palavras
   *  (separador ' ') quando "linha atual + palavra + espaço" passa de maxWidth (medido com o ctx.font corrente); cada linha devolvida mantém o espaço final. */
  function quebrarParagrafo(ctx, line, maxWidth) {
    const words = line.split(' '), out = []; let cur = '';
    for (let n = 0; n < words.length; n++) {
      const test = cur + words[n] + ' ';
      if (ctx.measureText(test).width > maxWidth && n > 0) { out.push(cur); cur = words[n] + ' '; } else cur = test;
    }
    out.push(cur);
    return out;
  }

  const FolhaAtlas = {
    THREE: null, maxTex: 4096, tiers: null, sheets: new Map(), _fallback: new Map(), _frame: 0, _hiSet: new Set(),

    /** Quebra de linha idêntica à do desenho 3D, para o editor do painel: devolve { display, softs } -- `display` é o texto com '\n' inseridos nas quebras automáticas
     *  (o espaço que as precede continua no texto) e `softs` são os índices (em `display`) desses '\n' automáticos; o '\n' digitado pelo usuário não entra em `softs`. */
    layout(texto, fonte, tam) {
      if (!this._medCtx) this._medCtx = document.createElement('canvas').getContext('2d');
      const ctx = this._medCtx, t = Math.max(8, Math.min(80, Number(tam) || 30));
      ctx.font = t + 'px ' + fonte;
      const maxW = DESIGN_W - 60 - 30; let display = '', softs = [];
      String(texto == null ? '' : texto).split('\n').forEach((p, pi) => {
        if (pi > 0) display += '\n';
        const ls = quebrarParagrafo(ctx, p, maxW);
        ls.forEach((l, li) => { if (li > 0) { softs.push(display.length); display += '\n'; } display += (li === ls.length - 1) ? l.slice(0, -1) : l; });   // o espaço final da última linha é artifício do algoritmo
      });
      return { display, softs };
    },

    init(THREE, opts) {
      if (this.THREE) return this;
      this.THREE = THREE;
      this.maxTex = (opts && opts.maxTex) || 4096;
      const mk = (nome, escala, colsMax, rowsMax) => {
        const slotW = DESIGN_W * escala, slotH = DESIGN_H * escala, cellW = slotW + 2 * GUT, cellH = slotH + 2 * GUT;
        const cols = Math.max(1, Math.min(colsMax, Math.floor(this.maxTex / cellW))), rows = Math.max(1, Math.min(rowsMax, Math.floor(this.maxTex / cellH)));
        return { nome, escala, slotW, slotH, cellW, cellH, cols, rows, W: cols * cellW, H: rows * cellH, pages: [], byId: new Map() };
      };
      // 3 camadas de resolução (o desenho é sempre A4 com escala UNIFORME: mesma densidade em X e Y):
      //  lo  = 256x362 (todas as folhas; ~0,6 MB de VRAM/folha em vez de ~2 MB) · mid = 512x724 (as ~12 mais próximas) · hi = 1024x1448 (as ~4 mais próximas, de perto)
      this.tiers = { lo: mk('lo', 0.5, 7, 10), mid: mk('mid', 1, 3, 4), hi: mk('hi', 2, 1, 1) };   // hi: 1 célula por página (~6 MB): cada tecla da folha em edição reenvia só 6 MB à GPU, não 25 MB
      try { document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => this.repaintAll()); } catch (e) { /* ignora */ }
      return this;
    },

    _novaPagina(t) {
      const THREE = this.THREE;
      const canvas = document.createElement('canvas'); canvas.width = t.W; canvas.height = t.H;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, t.W, t.H);
      const texture = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 8; texture.userData.compartilhado = true;
      const total = t.cols * t.rows;
      const page = { tier: t, canvas, ctx, texture, free: Array.from({ length: total }, (_, i) => total - 1 - i), index: t.pages.length, material: null, capacity: total };
      t.pages.push(page); return page;
    },

    acquire(id, tierName) {
      const t = this.tiers[tierName || 'lo'];
      let s = t.byId.get(id); if (s) return s;
      let page = t.pages.find((p) => p.free.length); if (!page) page = this._novaPagina(t);
      const idx = page.free.pop(), col = idx % t.cols, row = Math.floor(idx / t.cols);
      const px = col * t.cellW, py = row * t.cellH;   // origem da CÉLULA (com borda)
      s = {
        id, tier: t, page, slotIndex: idx, key: null, params: null, px, py,
        // UV só da área de CONTEÚDO (sem a borda). Linha 0 = topo do canvas = v alto (flipY).
        uMin: (px + GUT) / t.W, uMax: (px + GUT + t.slotW) / t.W,
        vMax: 1 - (py + GUT) / t.H, vMin: 1 - (py + GUT + t.slotH) / t.H,
        gutU: GUT / t.W,
      };
      t.byId.set(id, s); return s;
    },

    paint(id, params, tierName) {
      const s = this.acquire(id, tierName), p = params || {};
      const key = [p.texto, p.bg, p.corTexto, p.fonte, p.tam, p.linhas, p.margem].join('\u0001');
      if (s.key === key) return s;
      s.key = key; s.params = Object.assign({}, p); this._desenharSlot(s); return s;
    },

    _desenharSlot(s) {
      const t = s.tier, ctx = s.page.ctx;
      ctx.save();
      ctx.beginPath(); ctx.rect(s.px, s.py, t.cellW, t.cellH); ctx.clip();
      ctx.clearRect(s.px, s.py, t.cellW, t.cellH);
      ctx.fillStyle = s.params.bg || '#ffffff'; ctx.fillRect(s.px, s.py, t.cellW, t.cellH);   // célula INTEIRA (borda incluída) na cor da folha
      ctx.translate(s.px + GUT, s.py + GUT); ctx.scale(t.slotW / DESIGN_W, t.slotH / DESIGN_H);   // escala UNIFORME: mesma densidade em X e Y
      desenharFolha(ctx, s.params);
      ctx.restore();
      s.page.texture.needsUpdate = true;
    },

    repaintAll() { Object.values(this.tiers || {}).forEach((t) => t.byId.forEach((s) => { if (s.params) this._desenharSlot(s); })); },

    release(id, tierName) {
      const t = this.tiers[tierName || 'lo'], s = t.byId.get(id); if (!s) return;
      s.page.free.push(s.slotIndex); t.byId.delete(id);
    },

    /** Aponta as UVs de UMA face (4 vértices) de uma BoxGeometry para a célula (área de conteúdo). */
    applyUV(geometry, faceIndex, slot) {
      const uv = geometry.attributes.uv, b = faceIndex * 4;
      if (!geometry.userData.uv0) { geometry.userData.uv0 = []; for (let i = 0; i < 4; i++) geometry.userData.uv0.push([uv.getX(b + i), uv.getY(b + i)]); }
      for (let i = 0; i < 4; i++) {
        const [u, v] = geometry.userData.uv0[i];
        uv.setXY(b + i, slot.uMin + (slot.uMax - slot.uMin) * u, slot.vMin + (slot.vMax - slot.vMin) * v);
      }
      uv.needsUpdate = true;
    },

    fallbackTexture(p) {
      const THREE = this.THREE, key = [p.bg, p.linhas, p.margem].join('|');
      let t = this._fallback.get(key); if (t) return t;
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 181;
      const cx = cv.getContext('2d'); cx.scale(128 / DESIGN_W, 181 / DESIGN_H);
      desenharFolha(cx, { texto: '', bg: p.bg, linhas: p.linhas, margem: p.margem });
      t = new THREE.CanvasTexture(cv); t.userData.compartilhado = true; if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      this._fallback.set(key, t); return t;
    },

    textureFor(id, p) {
      const vazio = !String(p.texto == null ? '' : p.texto).trim();
      if (vazio) { this.release(id, 'lo'); this.release(id, 'mid'); this.release(id, 'hi'); return { texture: this.fallbackTexture(p), slot: null }; }
      const slot = this.paint(id, p, 'lo');
      return { texture: slot.page.texture, slot };
    },

    materialForTexture(tex) { if (!tex.userData.mat) { tex.userData.mat = new this.THREE.MeshLambertMaterial({ map: tex }); tex.userData.mat.userData.compartilhado = true; } return tex.userData.mat; },
    sideMaterial(cor) { this._lados = this._lados || new Map(); let m = this._lados.get(cor); if (!m) { m = new this.THREE.MeshLambertMaterial({ color: cor }); m.userData.compartilhado = true; this._lados.set(cor, m); } return m; },
    materialFor(page) { if (!page.material) { page.material = new this.THREE.MeshLambertMaterial({ map: page.texture }); page.material.userData.compartilhado = true; } return page.material; },

    /** O builder chama isto a cada malha criada: o registro permite ao LOD achar as folhas e trocar a célula. */
    registrar(id, mesh, geo, slot, params) {
      const ant = this.sheets.get(id), agora = performance.now();
      const chave = (p) => [p.texto, p.bg, p.corTexto, p.fonte, p.tam, p.linhas, p.margem].join('\u0001');
      // [52ª rodada] FOLHA EM EDIÇÃO nunca perde nitidez: quando o conteúdo muda (a cada tecla) a malha é reconstruída, e antes a nova nascia na célula 'lo' (256 px) e só
      // voltava à célula alta no próximo updateLOD (alguns quadros borrados). Agora a nova malha já nasce na MESMA camada que a anterior tinha -- e, se o conteúdo mudou, é
      // "fixada" na camada mais alta (1024 px) por 8 s após a última alteração, qualquer que seja a distância e sem contar no limite de 4 do LOD.
      let editadoAte = ant ? (ant.editadoAte || 0) : 0;
      if (ant && ant.params && chave(ant.params) !== chave(params)) editadoAte = agora + 8000;
      let alvo = ant ? ant.nivel : 0;
      if (agora < editadoAte) alvo = 2;
      if (!slot) alvo = 0;
      if (ant && ant.nivel > 0 && ant.nivel !== alvo) this.release(id, ant.nivel === 2 ? 'hi' : 'mid');
      const sh = { id, mesh, geo, slot, params, nivel: 0, editadoAte, matSlot: slot ? this.materialFor(slot.page) : mesh.material[2] };
      this.sheets.set(id, sh);
      mesh.userData._folha = { id };
      if (alvo > 0) {
        const cs = this.paint(id, params, alvo === 2 ? 'hi' : 'mid');   // repinta a célula (mesma célula; só o conteúdo muda) ANTES do próximo quadro
        this.applyUV(geo, 2, cs); mesh.material[2] = this.materialFor(cs.page); sh.nivel = alvo;
      }
    },

    // ---------- INSTANCIAMENTO ----------
    /** Chamado pelo motor no fim de setScene (depois de _rebuildInstancedPools): 1 InstancedMesh por página 'lo' com >= 4 folhas. A malha individual fica invisível (picking intacto). */
    buildPools(engine) {
      const THREE = this.THREE; if (!THREE || !this.tiers) return;
      const porPagina = new Map();
      (engine._pickMeshes || []).forEach((m) => {
        const f = m.userData && m.userData._folha; if (!f || !m.parent) return;
        const sh = this.sheets.get(f.id); if (!sh || sh.mesh !== m || !sh.slot || !m.geometry.parameters) return;
        if (!porPagina.has(sh.slot.page)) porPagina.set(sh.slot.page, []);
        porPagina.get(sh.slot.page).push(sh);
      });
      if (!engine._zeroInstMatrix) engine._zeroInstMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
      const LIMIAR = 4;
      porPagina.forEach((lista, page) => {
        if (lista.length < LIMIAR) return;
        const gp = lista[0].mesh.geometry.parameters;
        const geo = new THREE.BoxGeometry(gp.width, gp.height, gp.depth);
        const rect = new Float32Array(page.capacity * 4);
        geo.setAttribute('aSlotRect', new THREE.InstancedBufferAttribute(rect, 4));
        const gutU = GUT / page.tier.W;
        const mat = new THREE.MeshLambertMaterial({ map: page.texture });
        mat.onBeforeCompile = (sh) => {
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec4 aSlotRect;')
            // topo (+Y) = célula do atlas; laterais/fundo = um ponto da BORDA da célula (cor da própria folha), nunca o texto esticado
            .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = (normal.y > 0.5) ? mix(aSlotRect.xy, aSlotRect.zw, uv) : vec2(aSlotRect.x - ' + (gutU * 0.5).toFixed(6) + ', 0.5 * (aSlotRect.y + aSlotRect.w));\n#endif');
        };
        const inst = new THREE.InstancedMesh(geo, mat, page.capacity);
        for (let i = 0; i < page.capacity; i++) inst.setMatrixAt(i, engine._zeroInstMatrix);
        const poolKey = 'folha-papel::pg' + page.index;
        lista.forEach((sh) => {
          const m = sh.mesh, s = sh.slot; m.updateMatrix();
          inst.setMatrixAt(s.slotIndex, m.matrix);
          rect.set([s.uMin, s.vMin, s.uMax, s.vMax], s.slotIndex * 4);
          m.userData._inst = { tipo: 'folha-papel', piso: 0, poolKey, index: s.slotIndex, matrix: m.matrix.clone() };
          m.visible = false;
        });
        inst.instanceMatrix.needsUpdate = true; geo.attributes.aSlotRect.needsUpdate = true;
        inst.frustumCulled = false;   // 20 caixas de 24 vértices: o corte por frustum custaria mais do que desenhar
        inst.castShadow = inst.receiveShadow = !!(engine._sombrasAtivas && engine._sombrasAtivas());
        engine._group.add(inst);
        engine._instancedPools[poolKey] = { mesh: inst, count: page.capacity, tipo: 'folha-papel', piso: 0 };
      });
    },

    // ---------- LOD ----------
    /** Chamado a cada quadro pelo motor (barato: distâncias de dezenas/centenas de folhas, a cada 6 quadros).
     *  nível 0 (lo, 256 px) = padrão/longe, desenhada na instância; nível 1 (mid, 512 px) < ~1,4 m (máx. 12); nível 2 (hi, 1024 px) < ~0,55 m (máx. 4). Histerese na saída. */
    updateLOD(engine, camera) {
      if (!this.tiers || !camera || (++this._frame % 6)) return;
      const cp = camera.position, cand = [];
      this.sheets.forEach((sh, id) => {
        if (!sh.mesh.parent) { this._liberarAltos(sh); this.release(id, 'lo'); this.sheets.delete(id); return; }   // objeto removido: libera as células
        if (!sh.slot) return;
        const p = sh.mesh.position, d = Math.hypot(p.x - cp.x, p.y - cp.y, p.z - cp.z);
        let nv = 0;
        if (d < (sh.nivel === 2 ? 0.8 : 0.55)) nv = 2; else if (d < (sh.nivel >= 1 ? 1.8 : 1.4)) nv = 1;
        const fixa = performance.now() < (sh.editadoAte || 0);   // em edição: sempre a camada mais alta
        if (fixa) nv = 2;
        cand.push({ sh, d, nv, fixa });
      });
      cand.sort((a, b) => (b.fixa - a.fixa) || (a.d - b.d));   // as fixadas (em edição) primeiro: nunca rebaixadas por limite
      let n2 = 0, n1 = 0;
      cand.forEach((c) => {
        let nv = c.nv;
        if (!c.fixa && nv === 2 && n2 >= 4) nv = 1;
        if (!c.fixa && nv >= 1 && n1 >= 12) nv = 0;
        if (nv === 2) n2++; if (nv >= 1) n1++;
        if (nv !== c.sh.nivel) this._trocarNivel(engine, c.sh, nv);
      });
    },

    _liberarAltos(sh) { if (sh.nivel === 1) this.release(sh.id, 'mid'); else if (sh.nivel === 2) this.release(sh.id, 'hi'); sh.nivel = 0; },

    _trocarNivel(engine, sh, nv) {
      const m = sh.mesh;
      if (sh.nivel === 1) this.release(sh.id, 'mid'); else if (sh.nivel === 2) this.release(sh.id, 'hi');
      if (nv === 0) {
        this.applyUV(sh.geo, 2, sh.slot); m.material[2] = sh.matSlot;
        if (m.userData._inst) engine._instanceDemote(m);   // volta a ser desenhada pela instância
      } else {
        const slot = this.paint(sh.id, sh.params, nv === 2 ? 'hi' : 'mid');
        this.applyUV(sh.geo, 2, slot); m.material[2] = this.materialFor(slot.page);
        if (sh.nivel === 0 && m.userData._inst) engine._instancePromote(m);   // sai da instância: desenhada individualmente com a célula mais nítida
      }
      sh.nivel = nv;
    },

    stats() {
      const t = this.tiers; if (!t) return {};
      const mb = (x) => x.pages.length * x.W * x.H * 4 * 1.33 / 1048576;
      const por = {}; Object.keys(t).forEach((k) => { por[k] = { paginas: t[k].pages.length, celulas: t[k].byId.size, pagina: t[k].W + 'x' + t[k].H }; });
      return { tiers: por, vramAproxMB: Math.round(mb(t.lo) + mb(t.mid) + mb(t.hi)) };
    },
  };
  window.FolhaAtlas = FolhaAtlas;
})();
