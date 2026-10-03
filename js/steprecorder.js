/* js/steprecorder.js
 * [01/10/2026] NOVO (63ª rodada) — "Step events": gravador de passos do usuário. Registra, NA ORDEM, cada botão apertado/tela acessada (cliques, duplo clique, botão direito,
 * mudanças de campos, atalhos de teclado, arrastes/rolagem em canvas, erros do console) e guarda tudo num JSON para ser enviado (💾 Baixar JSON).
 *
 * Como usar: a pílula flutuante no canto inferior esquerdo (⏺ gravando / ⏸ pausado). Atalho: Ctrl+Alt+R liga/desliga. A gravação sobrevive a recarregar a página
 * (fica no localStorage, até 4000 passos; os mais antigos saem primeiro). 🗑 limpa. API: window.StepRecorder.{start,stop,toggle,clear,exportar,eventos}.
 *
 * Privacidade: valores de <input type=password> nunca são gravados; textos digitados em campos são gravados só no "change" (ao sair do campo) e cortados em 200 caracteres.
 * Nada sai do navegador: o arquivo só é gerado quando você clica em Baixar. */
(function () {
  'use strict';
  if (window.StepRecorder) return;
  const KEY = 'stepRecorder.v1', MAX = 4000;
  const S = { on: false, ev: [], t0: 0, n: 0, inicio: null, pill: null, saveTimer: 0, wheel: null, ptr: null };

  const lsGet = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const salvar = () => {
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ on: S.on, inicio: S.inicio, n: S.n, ev: S.ev })); } catch (e) { /* cheio/bloqueado: segue em memória */ } }, 400);
  };
  const cut = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

  // ---- descrição de um elemento alvo -------------------------------------------------------------------------------------------------
  const INTERATIVO = 'button,a,input,select,textarea,summary,label,canvas,[role=button],[role=tab],[role=menuitem],[onclick],.btn,[data-action],[data-view],[data-tool]';
  const seg = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList && el.classList.length ? '.' + Array.from(el.classList).slice(0, 2).join('.') : '');
  function descrever(t) {
    if (!t || !t.closest) return { tag: String(t && t.nodeName || '?') };
    const el = t.closest(INTERATIVO) || t;
    const d = { tag: el.tagName.toLowerCase() };
    if (el.id) d.id = el.id;
    if (el.name) d.name = el.name;
    if (el.type && (el.tagName === 'INPUT' || el.tagName === 'BUTTON')) d.type = el.type;
    if (el.classList && el.classList.length) d.classe = Array.from(el.classList).slice(0, 4).join(' ');
    const txt = cut(el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' ? '' : (el.innerText || el.textContent), 60);
    if (txt) d.texto = txt;
    const tit = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'));
    if (tit) d.titulo = cut(tit, 80);
    if (el.tagName === 'INPUT' && el.placeholder) d.placeholder = cut(el.placeholder, 40);
    if (el.tagName === 'LABEL' || el.closest('label')) { const lb = el.closest('label'); if (lb) d.rotulo = cut(lb.innerText, 50); }
    if (el.dataset) { const k = Object.keys(el.dataset).slice(0, 5); if (k.length) { d.data = {}; k.forEach((q) => { d.data[q] = cut(el.dataset[q], 40); }); } }
    // caminho curto (até 4 ancestrais) e contexto (tela do Workspace / janela)
    const cam = []; let p = el.parentElement;
    for (let i = 0; p && i < 4 && p !== document.body; i++, p = p.parentElement) cam.push(seg(p));
    if (cam.length) d.caminho = cam;
    const leaf = el.closest('.bsp-leaf');
    if (leaf) {
      const sel = leaf.querySelector('select');
      d.tela = cut(sel && sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0].text : '', 40) || undefined;
    }
    const jan = el.closest('.map-panel, .map2d-props-panel, .modal, [role=dialog], .flashcard3d-overlay, .settings-modal, [class*=panel]');
    if (jan) { const h = jan.querySelector('h1,h2,h3,.map-panel-title,.modal-title,[class*=title]'); const ti = cut(h && h.innerText, 50); d.janela = ti ? ti : seg(jan); }
    return d;
  }
  function valorDe(el) {
    if (!el) return undefined;
    if (el.type === 'password') return '(oculto)';
    if (el.type === 'checkbox' || el.type === 'radio') return !!el.checked;
    if (el.tagName === 'SELECT') return cut(el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text : el.value, 80) + ' [' + cut(el.value, 60) + ']';
    if (el.type === 'file') return cut(Array.from(el.files || []).map((f) => f.name).join(', '), 120);
    return cut(el.value != null ? el.value : el.textContent, 200);
  }

  // ---- registro ---------------------------------------------------------------------------------------------------------------------
  function reg(tipo, dados) {
    if (!S.on) return;
    const agora = Date.now();
    const e = Object.assign({ n: ++S.n, t: new Date(agora).toISOString(), ms: agora - S.t0, tipo }, dados || {});
    S.ev.push(e);
    if (S.ev.length > MAX) S.ev.splice(0, S.ev.length - MAX);
    atualizarPilula(); salvar();
  }
  const naPilula = (t) => !!(S.pill && t && t.nodeType === 1 && S.pill.contains(t));
  const mods = (e) => { const m = []; if (e.ctrlKey) m.push('Ctrl'); if (e.altKey) m.push('Alt'); if (e.shiftKey) m.push('Shift'); if (e.metaKey) m.push('Meta'); return m.length ? m.join('+') : undefined; };
  const campoTexto = (t) => t && t.nodeType === 1 && (t.tagName === 'TEXTAREA' || t.isContentEditable || (t.tagName === 'INPUT' && !/^(checkbox|radio|button|range|color|file|submit)$/.test(t.type)));

  function flushWheel() {
    if (!S.wheel) return; const w = S.wheel; S.wheel = null;
    reg('rolagem', { alvo: w.alvo, deltaY: Math.round(w.dy), deltaX: Math.round(w.dx), eventos: w.n, mods: w.mods });
  }
  function ligar() {
    const opt = { capture: true, passive: true };
    const clique = (nome) => (e) => {
      if (!S.on || naPilula(e.target)) return;
      reg(nome, { botao: e.button, alvo: descrever(e.target), x: Math.round(e.clientX), y: Math.round(e.clientY), mods: mods(e) });
    };
    window.addEventListener('click', clique('clique'), opt);
    window.addEventListener('dblclick', clique('duplo-clique'), opt);
    window.addEventListener('contextmenu', clique('botao-direito'), opt);
    window.addEventListener('auxclick', (e) => { if (e.button === 1) clique('botao-meio')(e); }, opt);
    window.addEventListener('change', (e) => {
      if (!S.on || naPilula(e.target)) return;
      reg('campo', { alvo: descrever(e.target), valor: valorDe(e.target) });
    }, opt);
    window.addEventListener('keydown', (e) => {
      if (!S.on || e.repeat || naPilula(e.target)) return;
      const especial = e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1;   // Enter, Escape, Setas, F-keys, Delete...
      if (campoTexto(e.target) && !especial) return;      // digitação normal em campo: só o "change" interessa
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      reg('tecla', { tecla: e.key, codigo: e.code, mods: mods(e), em: campoTexto(e.target) ? descrever(e.target) : (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : undefined) });
    }, opt);
    window.addEventListener('wheel', (e) => {
      if (!S.on || naPilula(e.target)) return;
      if (!S.wheel) S.wheel = { alvo: descrever(e.target), dx: 0, dy: 0, n: 0, mods: mods(e), timer: 0 };
      S.wheel.dx += e.deltaX; S.wheel.dy += e.deltaY; S.wheel.n++;
      clearTimeout(S.wheel.timer); S.wheel.timer = setTimeout(flushWheel, 450);
    }, opt);
    // arraste/ação em canvas (2D/3D): 1 passo por gesto, com deslocamento e duração (não grava cada movimento)
    window.addEventListener('pointerdown', (e) => {
      if (!S.on || naPilula(e.target) || !(e.target && e.target.tagName === 'CANVAS')) return;
      S.ptr = { x: e.clientX, y: e.clientY, t: Date.now(), alvo: descrever(e.target), botao: e.button, mods: mods(e) };
    }, opt);
    window.addEventListener('pointerup', (e) => {
      const p = S.ptr; S.ptr = null; if (!S.on || !p) return;
      const dx = Math.round(e.clientX - p.x), dy = Math.round(e.clientY - p.y);
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) reg('arraste-canvas', { alvo: p.alvo, botao: p.botao, de: [Math.round(p.x), Math.round(p.y)], dx, dy, duracaoMs: Date.now() - p.t, mods: p.mods });
    }, opt);
    window.addEventListener('hashchange', () => reg('navegacao', { url: location.href }));
    window.addEventListener('popstate', () => reg('navegacao', { url: location.href }));
    document.addEventListener('visibilitychange', () => reg('visibilidade', { estado: document.visibilityState }));
    window.addEventListener('bsp-foco-mudou', () => reg('foco-painel', {}));
    window.addEventListener('error', (e) => reg('erro-js', { mensagem: cut(e.message, 300), arquivo: cut(e.filename, 120), linha: e.lineno }));
    window.addEventListener('unhandledrejection', (e) => reg('erro-promessa', { mensagem: cut(e.reason && (e.reason.stack || e.reason.message || e.reason), 300) }));
    ['error', 'warn'].forEach((nivel) => {
      const orig = console[nivel];
      console[nivel] = function () { try { if (S.on) reg('console-' + nivel, { mensagem: cut(Array.from(arguments).map((a) => (a && a.message) || (typeof a === 'string' ? a : (function () { try { return JSON.stringify(a); } catch (_) { return String(a); } })())).join(' '), 300) }); } catch (_) { /* ignora */ } return orig.apply(this, arguments); };
    });
    window.addEventListener('keydown', (e) => { if (e.ctrlKey && e.altKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); API.toggle(); } });
    window.addEventListener('beforeunload', () => { if (S.on) { reg('descarregar-pagina', {}); try { localStorage.setItem(KEY, JSON.stringify({ on: S.on, inicio: S.inicio, n: S.n, ev: S.ev })); } catch (e) { /* ignora */ } } });
  }

  // ---- pílula de controle -----------------------------------------------------------------------------------------------------------
  function criarPilula() {
    const css = document.createElement('style');
    css.textContent = '#step-rec{position:fixed;left:8px;bottom:8px;z-index:2147483000;font:12px system-ui,sans-serif;color:#e5e7eb;background:rgba(17,24,39,.92);border:1px solid #374151;border-radius:999px;padding:3px 4px 3px 8px;display:flex;align-items:center;gap:4px;box-shadow:0 2px 10px rgba(0,0,0,.4);user-select:none}' +
      '#step-rec button{all:unset;cursor:pointer;padding:2px 7px;border-radius:999px;font-size:12px}#step-rec button:hover{background:#374151}' +
      '#step-rec .dot{width:9px;height:9px;border-radius:50%;background:#6b7280}#step-rec.on .dot{background:#ef4444;animation:srp 1.2s infinite}@keyframes srp{50%{opacity:.35}}' +
      '#step-rec .acoes{display:flex;gap:2px}#step-rec.min .acoes{display:none}';
    document.head.appendChild(css);
    const p = document.createElement('div'); p.id = 'step-rec'; p.setAttribute('data-step-recorder', '1');
    p.innerHTML = '<span class="dot"></span><span class="cnt" title="Passos gravados">0</span><span class="acoes">' +
      '<button data-a="toggle" title="Gravar / pausar (Ctrl+Alt+R)">⏺ Gravar</button><button data-a="baixar" title="Baixar os passos em JSON">💾 JSON</button><button data-a="limpar" title="Apagar os passos gravados">🗑</button></span><button data-a="min" title="Recolher / expandir">⇔</button>';
    p.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'toggle') API.toggle(); else if (a === 'baixar') API.exportar(); else if (a === 'limpar') { if (confirm('Apagar os ' + S.ev.length + ' passos gravados?')) API.clear(); } else if (a === 'min') { p.classList.toggle('min'); try { localStorage.setItem(KEY + '.min', p.classList.contains('min') ? '1' : '0'); } catch (_) { /* ignora */ } }
    });
    try { if (localStorage.getItem(KEY + '.min') === '1') p.classList.add('min'); } catch (_) { /* ignora */ }
    document.body.appendChild(p); S.pill = p; aplicarPilula(); atualizarPilula();
  }
  /** [65ª] A pílula só aparece se o checkbox das configurações estiver marcado (padrão: DESLIGADA; o gravador também começa desligado). */
  const pilulaOn = () => { try { return localStorage.getItem(KEY + '.pill') === '1'; } catch (_) { return false; } };
  function aplicarPilula() { if (S.pill) S.pill.style.display = pilulaOn() ? '' : 'none'; }
  function atualizarPilula() {
    const p = S.pill; if (!p) return;
    p.classList.toggle('on', S.on);
    p.querySelector('.cnt').textContent = String(S.ev.length);
    const tg = p.querySelector('[data-a=toggle]'); if (tg) tg.textContent = S.on ? '⏸ Pausar' : '⏺ Gravar';
  }

  // ---- API --------------------------------------------------------------------------------------------------------------------------
  function contexto() {
    let versao = ''; try { const m = document.querySelector('script[src*="app.js"]'); versao = m ? m.getAttribute('src') : ''; } catch (_) { /* ignora */ }
    return { url: location.href, navegador: navigator.userAgent, janela: [innerWidth, innerHeight], tela: [screen.width, screen.height], pixelRatio: devicePixelRatio, idioma: navigator.language, classesBody: cut(document.body.className, 160), script: versao };
  }
  const API = {
    start() { if (S.on) return; S.on = true; if (!S.t0 || !S.ev.length) { S.t0 = Date.now(); S.inicio = new Date().toISOString(); } reg('inicio-gravacao', contexto()); atualizarPilula(); salvar(); },
    stop() { if (!S.on) return; flushWheel(); reg('fim-gravacao', {}); S.on = false; atualizarPilula(); salvar(); },
    toggle() { S.on ? API.stop() : API.start(); },
    clear() { S.ev = []; S.n = 0; S.t0 = Date.now(); S.inicio = new Date().toISOString(); atualizarPilula(); salvar(); },
    eventos() { return S.ev.slice(); },
    /** [64ª] passo de diagnóstico enviado pelo próprio app (ex.: resultado de uma reconstrução 3D) -- só grava se a gravação estiver ligada. */
    diag(tipo, dados) { try { reg('diagnostico-' + tipo, dados); } catch (e) { /* ignora */ } },
    ativo() { return S.on; },
    pilulaVisivel() { return pilulaOn(); },
    pilula(v) { try { localStorage.setItem(KEY + '.pill', v ? '1' : '0'); } catch (_) { /* ignora */ } aplicarPilula(); },
    /** HTML da seção "⏺ Gravador de passos" (mesmo bloco em Configurações do app, 2D e 3D); `idp` = prefixo dos ids. Ligar com `wireControls(raiz, idp)`. */
    controlsHtml(idp) {
      return '<p style="font-size:12.5px; color:var(--text-dim)">Grava, na ordem, cada botão, campo, tecla e tela que você usa (com hora), para baixar um arquivo JSON e enviar para análise de problemas. Desligado por padrão. Nada sai do aparelho; senhas nunca são gravadas e textos longos são cortados. Atalho: Ctrl+Alt+R. Para problemas no painel de propriedades do 3D, ligue ANTES de abri-lo.</p>' +
        '<label class="radio-opt"><input type="checkbox" id="' + idp + '-pilula"' + (pilulaOn() ? ' checked' : '') + '><span><span class="t">Mostrar a pílula do gravador (canto inferior esquerdo)</span><br><span class="d">Desmarcado (padrão): a pílula fica escondida; a gravação continua podendo ser ligada pelos botões abaixo ou por Ctrl+Alt+R.</span></span></label>' +
        '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px"><button type="button" class="btn secondary sm" id="' + idp + '-toggle">⏺ Gravar</button><button type="button" class="btn secondary sm" id="' + idp + '-baixar">💾 Baixar JSON</button><button type="button" class="btn secondary sm" id="' + idp + '-limpar">🗑 Limpar</button><span id="' + idp + '-info" style="font-size:11.5px; color:var(--text-dim)"></span></div>';
    },
    wireControls(raiz, idp) {
      if (!raiz) return;
      const q = (x) => raiz.querySelector('#' + idp + '-' + x);
      const att = () => { const bt = q('toggle'), inf = q('info'); if (bt) bt.textContent = S.on ? '⏸ Pausar' : '⏺ Gravar'; if (inf) inf.textContent = (S.on ? 'Gravando — ' : 'Parado — ') + S.ev.length + ' passos'; };
      const pc = q('pilula'); if (pc) pc.onchange = () => API.pilula(pc.checked);
      const bt = q('toggle'); if (bt) bt.onclick = () => { API.toggle(); att(); };
      const bx = q('baixar'); if (bx) bx.onclick = () => API.exportar();
      const lm = q('limpar'); if (lm) lm.onclick = () => { if (confirm('Apagar os ' + S.ev.length + ' passos gravados?')) { API.clear(); att(); } };
      att();
    },
    exportar() {
      flushWheel();
      const fim = new Date();
      const dados = { app: 'catalogacao-itens', formato: 'step-events/1', gravacao: Object.assign({ inicio: S.inicio, exportadoEm: fim.toISOString(), totalPassos: S.ev.length }, contexto()), passos: S.ev };
      const p2 = (n) => String(n).padStart(2, '0');
      const nome = 'passos-' + fim.getFullYear() + p2(fim.getMonth() + 1) + p2(fim.getDate()) + '-' + p2(fim.getHours()) + p2(fim.getMinutes()) + p2(fim.getSeconds()) + '.json';
      if (window.Utils && Utils.downloadJSON) Utils.downloadJSON(dados, nome);
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
      return dados;
    },
  };
  window.StepRecorder = API;

  function iniciar() {
    const salvo = lsGet();
    if (salvo && Array.isArray(salvo.ev)) { S.ev = salvo.ev.slice(-MAX); S.n = salvo.n || S.ev.length; S.inicio = salvo.inicio || null; S.t0 = S.inicio ? Date.parse(S.inicio) : Date.now(); }
    ligar(); criarPilula();
    if (salvo && salvo.on && pilulaOn()) { S.on = true; reg('pagina-carregada', contexto()); atualizarPilula(); }
  }
  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);
})();
