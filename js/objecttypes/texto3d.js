/* js/objecttypes/texto3d.js — [69ª rodada] Objeto "Texto" UNIFICADO (botão "Texto" da janela Ferramentas do 2D == botão "Texto" do Criar do 3D).
 * É um objeto de catálogo comum (obj.tipo === 'texto3d', forma 'retangulo') cujos parâmetros ficam em `obj.texto3d` (mesmos campos do gerador
 * `ModelerMesh.textoMesh` do Modelador). A MESMA malha alimenta o 3D (via _buildCustomMeshObject) e o desenho 2D (contornos das letras vistos de cima),
 * então o texto aparece nos dois ao mesmo tempo. "Modelar em 3D" captura a malha renderizada como em qualquer objeto (vira customMesh e passa a mandar).
 * Dimensões (largura/profundidade/altura) = extensão da malha ao redor da origem (caixa simétrica, para o hit-test genérico cobrir o texto inteiro). */
(function () {
  // [73ª rodada] cache por TEXTO (JSON dos parâmetros), não mais por objeto: o gizmo 2D cria um objeto novo a cada quadro e a malha (triangulação
  // da fonte) é cara. Guarda a malha-base (sem escala) e a malha já esticada; limite pequeno para não crescer sem fim.
  const MEMO = new Map();
  const memo = (key, fazer) => {
    if (MEMO.has(key)) { const v = MEMO.get(key); MEMO.delete(key); MEMO.set(key, v); return v; }
    const v = fazer(); MEMO.set(key, v);
    if (MEMO.size > 24) MEMO.delete(MEMO.keys().next().value);
    return v;
  };
  const T = {
    params(obj) { return Object.assign({}, window.ModelerMesh.TEXTO_DEFAULTS, (obj && obj.texto3d) || {}); },
    /** [73ª rodada] Malha do Texto já ESTICADA por `escalaX` (largura) e `escalaZ` (profundidade) — o redimensionar do gizmo 2D grava esses dois
     *  campos em `obj.texto3d`. Escala = 1 (padrão) devolve a malha original. Vale para 2D (contornos), 3D e "Modelar em 3D" (captura a malha esticada). */
    mesh(obj) {
      const p = T.params(obj), pre = window.THREE ? '3|' : '2|';
      const ex = Number.isFinite(p.escalaX) && p.escalaX > 0 ? p.escalaX : 1, ez = Number.isFinite(p.escalaZ) && p.escalaZ > 0 ? p.escalaZ : 1;
      const base = Object.assign({}, p); delete base.escalaX; delete base.escalaZ;
      const mb = memo(pre + 'b|' + JSON.stringify(base), () => window.ModelerMesh.textoMesh(base));
      if (ex === 1 && ez === 1) return mb;
      return memo(pre + 's|' + ex.toFixed(5) + '|' + ez.toFixed(5) + '|' + JSON.stringify(base), () => {
        const m = Object.assign({}, mb);
        m.vertices = mb.vertices.map((v) => [v[0] * ex, v[1], v[2] * ez]);
        if (mb.outlines) m.outlines = mb.outlines.map((fs) => fs.map((c) => c.map((q) => [q[0] * ex, q[1] * ez])));
        return m;
      });
    },
    /** largura/profundidade/altura que o objeto deve ter para os parâmetros `p` (caixa simétrica em torno da origem). */
    dimsFor(p) {
      const m = T.mesh({ texto3d: p || {} });
      let minX = 0, maxX = 0, minY = 0, maxY = 0, minZ = 0, maxZ = 0;
      m.vertices.forEach((v) => { minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]); minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]); minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]); });
      return {
        largura: Math.max(0.1, 2 * Math.max(Math.abs(minX), Math.abs(maxX))),
        profundidade: Math.max(0.1, 2 * Math.max(Math.abs(minZ), Math.abs(maxZ))),
        altura: Math.max(0.01, maxY - minY),
      };
    },
    /** Grava forma/dimensões coerentes com os parâmetros atuais (chamado ao criar e a cada edição). */
    sync(obj) {
      if (!obj.texto3d) obj.texto3d = {};
      obj.forma = 'retangulo';
      Object.assign(obj, T.dimsFor(obj.texto3d));
    },
    schema() { const e = window.PRIMITIVE_CATALOG && window.PRIMITIVE_CATALOG.outros.find((x) => x.key === 'texto'); return e ? e.params : []; },

    /** HTML dos campos. [71ª rodada] REORGANIZADO: antes era uma lista corrida e longa de cabeçalhos/campos soltos (um campo por linha, sem
     *  agrupamento visual). Agora: campo de texto no topo e UMA SEÇÃO RECOLHÍVEL (<details>) por cabeçalho do esquema (Forma, Geometria, Fonte,
     *  Parágrafo, Caixa de texto), com os subtítulos (Espaçamento/Deslocamento; Dimensões/Deslocamento) como blocos aninhados e os campos numéricos
     *  em grade de 2 colunas. Mesmos data-t3d / data-t3d-choice de antes, então wireFields() não mudou. Funciona no painel escuro do 3D e no painel do 2D. */
    fieldsHtml(obj) {
      const p = T.params(obj), esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const BRD = 'border:1px solid rgba(128,140,160,.35)', LBL = 'font-size:11px;opacity:.8';
      const campo = (f) => {
        const v = p[f.key];
        if (f.isBool) return `<label style="grid-column:1/-1;display:flex;gap:8px;align-items:center;font-size:12.5px"><input type="checkbox" data-t3d="${f.key}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
        if (f.isChoice) return `<div style="grid-column:1/-1;display:flex;flex-direction:column;gap:3px"><span style="${LBL}">${esc(f.label)}</span><div style="display:flex;gap:4px;flex-wrap:wrap">${f.isChoice.map(([val, lab]) => `<button type="button" class="btn secondary sm${v === val ? ' active' : ''}" data-t3d-choice="${f.key}" data-v="${val}" style="flex:1 1 auto;${v === val ? 'outline:2px solid #7cffb2;' : ''}" aria-pressed="${v === val}">${esc(lab)}</button>`).join('')}</div></div>`;
        return `<label style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="${LBL}">${esc(f.label)}</span><input type="number" data-t3d="${f.key}" step="${f.step || 0.01}"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''} value="${v}" style="width:100%;box-sizing:border-box;min-width:0"></label>`;
      };
      // 3+ controles (Espaçamento, Chanfro) = um abaixo do outro (1 coluna); 1–2 campos = lado a lado.
      const grade = (campos) => campos.length ? `<div style="display:grid;grid-template-columns:${campos.length >= 3 ? '1fr' : '1fr 1fr'};gap:6px 8px;align-items:end">${campos.map(campo).join('')}</div>`  /* [73ª] align-items:end: rótulo de 2 linhas não desalinha as entradas lado a lado */ : '';
      // Agrupa o esquema: secoes = [{ titulo, campos:[], subs:[{ titulo, campos:[] }] }]
      const secoes = []; let sec = null, sub = null;
      T.schema().forEach((f) => {
        if (f.isText) return;
        if (f.heading) {
          if (f.sub) { sub = { titulo: f.heading, campos: [] }; if (sec) sec.subs.push(sub); }
          else { sec = { titulo: f.heading, campos: [], subs: [] }; sub = null; secoes.push(sec); }
          return;
        }
        (sub || sec || (sec = { titulo: 'Geral', campos: [], subs: [] }, secoes.push(sec), sec)).campos.push(f);
      });
      const tf = T.schema().find((f) => f.isText);
      const out = ['<div id="obj-t3d" style="display:flex;flex-direction:column;gap:8px;min-width:0">'];
      out.push(`<div style="font-size:12.5px;font-weight:600">🔤 Texto 3D</div>`);
      if (tf) out.push(`<label style="display:flex;flex-direction:column;gap:2px"><span style="${LBL}">${esc(tf.label)}</span><textarea data-t3d="${tf.key}" rows="3" style="width:100%;box-sizing:border-box;resize:vertical">${esc(p[tf.key])}</textarea></label>`);
      secoes.forEach((s, i) => {
        // As 2 primeiras seções (Forma/Geometria) e a de Fonte ficam abertas; Parágrafo e Caixa de texto também (todas abertas por padrão, recolhíveis).
        out.push(`<details open style="${BRD};border-radius:8px;padding:0"><summary style="cursor:pointer;font-size:12.5px;font-weight:600;padding:6px 8px;user-select:none">${esc(s.titulo)}</summary><div style="display:flex;flex-direction:column;gap:8px;padding:2px 8px 8px">`);
        out.push(grade(s.campos));
        s.subs.forEach((b) => {
          out.push(`<div style="border-left:2px solid rgba(124,255,178,.5);padding-left:8px;display:flex;flex-direction:column;gap:5px"><div style="font-size:11px;font-weight:600;opacity:.8">${esc(b.titulo)}</div>${grade(b.campos)}</div>`);
        });
        out.push('</div></details>');
      });
      out.push('<div style="font-size:11px;opacity:.7">Largura/profundidade/altura seguem o texto. Use "Modelar em 3D" para editar a malha à mão.</div></div>');
      return out.join('');
    },
    /** Liga os campos: `getObj()` devolve o objeto atual; `save(patch)` grava (salvarCampo do painel). */
    wireFields(root, getObj, save) {
      const fs = root.querySelector('#obj-t3d'); if (!fs) return;
      const schema = T.schema().filter((f) => f.key);
      const aplica = (key, val) => {
        const o = getObj(); const novo = Object.assign({}, o.texto3d || {}, { [key]: val });
        save(Object.assign({ texto3d: novo }, T.dimsFor(novo)));
      };
      fs.querySelectorAll('[data-t3d]').forEach((el) => {
        const key = el.getAttribute('data-t3d'), f = schema.find((x) => x.key === key) || {};
        if (f.isBool) el.addEventListener('change', () => aplica(key, el.checked));
        else if (f.isText) el.addEventListener('input', () => aplica(key, el.value));
        else el.addEventListener('input', () => { let n = parseFloat(el.value); if (!isFinite(n)) return; if (f.isInt) n = Math.round(n); if (f.min != null) n = Math.max(f.min, n); if (f.max != null) n = Math.min(f.max, n); aplica(key, n); });
      });
      fs.querySelectorAll('[data-t3d-choice]').forEach((b) => b.addEventListener('click', () => {
        aplica(b.getAttribute('data-t3d-choice'), b.getAttribute('data-v'));
        // [71ª rodada] o destaque (preenchimento azul = classe `active` + contorno verde) acompanha o botão SELECIONADO; antes só o contorno mudava e o azul ficava preso no botão inicial.
        fs.querySelectorAll(`[data-t3d-choice="${b.getAttribute('data-t3d-choice')}"]`).forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); x.style.outline = x === b ? '2px solid #7cffb2' : ''; });
      }));
    },

    /** [71ª rodada] Caixa justa (metros, eixos de tela: y para baixo, relativa à origem do objeto) dos contornos das letras vistos de cima.
     *  Usada pela caixa tracejada amarela (draw2D) E pelo gizmo cinza/azul do mapa (MapView._formaDraftScreenGeom), para as duas coincidirem.
     *  Se não houver contornos devolve x0>x1 (chamador cai na caixa simétrica). */
    bbox2D(obj) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      const m = T.mesh(obj);
      (m.outlines || []).forEach((fs) => fs.forEach((c) => c.forEach((q) => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, -q[1]); y1 = Math.max(y1, -q[1]); })));
      return { x0, x1, y0, y1 };
    },

    /** Desenho 2D: contornos das letras (vistos de cima). `ctx` já está no centro/rotação do objeto (convenção de _drawFormaShape). Devolve o ponto do selo. */
    draw2D(renderer, ctx, obj, selected) {
      const z = renderer.view.zoom, m = T.mesh(obj), cor = obj.cor || '#e6e9ee';
      ctx.beginPath();
      (m.outlines || []).forEach((formas) => formas.forEach((c) => {
        c.forEach((q, i) => { const X = q[0] * z, Y = -q[1] * z; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
        ctx.closePath();
      }));
      ctx.fillStyle = cor; ctx.fill('evenodd');
      ctx.lineWidth = 1; ctx.strokeStyle = selected ? '#ffd166' : (obj.corContorno || 'rgba(0,0,0,.55)'); ctx.stroke();
      const wpx = Math.max(6, (obj.largura || 0.5) * z), dpx = Math.max(6, (obj.profundidade || 0.3) * z);
      if (selected) {
        const bb = T.bbox2D(obj); let x0 = bb.x0, x1 = bb.x1, y0 = bb.y0, y1 = bb.y1;
        if (x0 > x1) { x0 = -wpx / 2 / z; x1 = wpx / 2 / z; y0 = -dpx / 2 / z; y1 = dpx / 2 / z; }
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5;
        // [73ª rodada] com o gizmo de 8 alças ativo (rascunho de reedição) a própria caixa do gizmo É a caixa do Texto — só a cruz da origem é desenhada.
        if (!obj.gizmoAtivo) ctx.strokeRect(x0 * z - 4, y0 * z - 4, (x1 - x0) * z + 8, (y1 - y0) * z + 8);
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke(); ctx.restore();
      }
      return { x: Math.max(0, wpx / 2 - 10), y: -Math.max(0, dpx / 2 - 10) };
    },
  };
  window.Texto3D = T;

  window.ObjectTypes.register('texto3d', {
    matchesMesh3D(obj) { return obj.tipo === 'texto3d' && !obj.customMesh && !!window.ModelerMesh; },
    buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
      const m = T.mesh(obj);
      const clone = Object.assign({}, obj, { customMesh: { vertices: m.vertices.map((v) => v.slice()), edges: m.edges.map((e) => e.slice()), faces: m.faces.map((f) => f.slice()) }, customMeshXform: obj.customMeshXform || { rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } });
      const n0 = engine.pickables.length;
      engine._buildCustomMeshObject(clone, baseY, wireframe, colWireframe);
      for (let i = n0; i < engine.pickables.length; i++) if (engine.pickables[i].ref === clone) engine.pickables[i].ref = obj;
    },
  });
})();
