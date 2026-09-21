/* js/cards/importar-objeto-card.js
 * Janela "Importar objeto" (Ferramentas > Objetos > Acessar modelos). Junta:
 *   1) o CONVERSOR .obj(+.mtl) -> .malha.js/.config.js (antes uma página à parte,
 *      js/gerador-glb/conversor-obj-js.html), e
 *   2) o PASSO A PASSO de como colocar um objeto novo no app (texto longo escondido
 *      atrás do botão "Passo a passo e detalhes").
 * Uso: ImportarObjetoCard.open({ onTestar(files) -> Promise, onFechar() }).
 * Tudo roda no navegador; nenhum arquivo sai do computador.
 */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- conversão (mesma lógica do conversor original) ----------
  function parseMtlText(texto) {
    const materiais = {}; let atual = null;
    String(texto || '').split('\n').forEach((crua) => {
      const linha = crua.trim();
      if (!linha || linha[0] === '#') return;
      const p = linha.split(/\s+/);
      if (p[0] === 'newmtl') { atual = p[1]; if (atual) materiais[atual] = {}; }
      else if (p[0] === 'Kd' && atual) {
        const rgb = [1, 2, 3].map((i) => parseFloat(p[i]));
        if (!rgb.some(Number.isNaN)) materiais[atual].corHex = rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * 255))).toString(16).padStart(2, '0')).join('');
      } else if (p[0] === 'd' && atual) {
        const d = parseFloat(p[1]); if (!Number.isNaN(d)) materiais[atual].opacidade = d;
      }
    });
    return materiais;
  }
  function lerMateriaisDoObj(textoObj, porNome) {
    const m = /^\s*mtllib\s+(\S+)/m.exec(textoObj);
    if (!m) return { materiais: null, aviso: 'sem .mtl (usa a cor padrão do tipo)' };
    const txt = porNome.get(m[1].trim().toLowerCase());
    if (txt === undefined) return { materiais: null, aviso: `faltou arrastar "${m[1]}" junto (materiais/cores não incluídos)` };
    const mats = parseMtlText(txt);
    return Object.keys(mats).length ? { materiais: mats, aviso: null } : { materiais: null, aviso: `"${m[1]}" sem cores reconhecíveis` };
  }
  function gerarMalhaJs(tipo, nomeObj, textoObj, mats) {
    let opts = '';
    if (mats) {
      const linhas = Object.entries(mats).filter(([, i]) => i.corHex).map(([n, i]) => `    ${JSON.stringify(n)}: { cor: 0x${i.corHex}${typeof i.opacidade === 'number' && i.opacidade < 1 ? `, opacidade: ${i.opacidade}` : ''} }`);
      if (linhas.length) opts = `, {\n  materiais: {\n${linhas.join(',\n')}\n  }\n}`;
    }
    return `/* assets/modelos/js/${tipo}.malha.js
 * GERADO pela janela "Importar objeto" a partir de "${nomeObj}".
 * NÃO É CÓDIGO DE VERDADE: é o texto do .obj embrulhado numa chamada JS, porque o
 * app abre por file:/// (dois cliques) e o navegador não deixa ler arquivos locais
 * com fetch(); um <script> comum é permitido. Ver js/objmeshsource.js.
 */
window.ObjMeshSource.register(${JSON.stringify(tipo)}, ${JSON.stringify(textoObj)}${opts});
`;
  }
  function gerarConfigJs(tipo, nome) {
    return `/* assets/modelos/js/${tipo}.config.js -- GERADO pela janela "Importar objeto".
 * Liga o tipo "${tipo}" à malha estática ${tipo}.malha.js. Edite os eventos abaixo
 * (onModelClick etc.) se o objeto precisar de comportamento próprio. */
window.ObjectAssets.registerModel(${JSON.stringify(tipo)}, {
  malhaEstatica: true,
  id: ${JSON.stringify(tipo)},
  nome: ${JSON.stringify(nome)},
  propriedades: { interativo: true },
  onModelClick(entity, ctx) { ctx.view3d._showObjectCard3D(entity); },
});
`;
  }
  function medir(textoObj) {
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], n = 0;
    textoObj.split('\n').forEach((l) => {
      if (l.charCodeAt(0) !== 118 || l[1] !== ' ') return; // "v "
      const p = l.trim().split(/\s+/); const v = [1, 2, 3].map((i) => parseFloat(p[i]));
      if (v.some(Number.isNaN)) return;
      n++; for (let i = 0; i < 3; i++) { if (v[i] < mn[i]) mn[i] = v[i]; if (v[i] > mx[i]) mx[i] = v[i]; }
    });
    if (!n) return null;
    const r = (x) => Math.round(x * 100) / 100;
    return { w: r(mx[0] - mn[0]) || 0.1, d: r(mx[2] - mn[2]) || 0.1, h: r(mx[1] - mn[1]) || 0.1, y0: r(mn[1]) };
  }
  function nomeDoTipo(arq) {
    return arq.replace(/\.[^./\\]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'objeto';
  }
  const qs = (v) => "'" + String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  function linhaManifesto(it) {
    const m = it.medidas || { w: 0.5, d: 0.5, h: 0.5, y0: 0 };
    return `NovosObjetos.registrar({ tipo: ${qs(it.tipo)}, nome: ${qs(it.nome || it.tipo)}, categoria: ${qs(it.categoria || 'outros')}, criadoEm: ${qs(it.criadoEm || new Date().toISOString())}, w: ${m.w}, d: ${m.d}, h: ${m.h}, y0: ${m.y0}, cor: 0x8a92a3 });`;
  }
  function baixar(nome, texto, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: mime || 'text/javascript;charset=utf-8' }));
    a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- geração do .bat ----------
  // O .bat leva os arquivos DENTRO dele (texto em base64 nas linhas ":::chave|dados", depois do "exit /b") e um
  // PowerShell curto os extrai para assets\\modelos\\js\\. Só aspas simples dentro do comando do PowerShell.
  function b64(texto) {
    const bytes = new TextEncoder().encode(texto);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const CRLF = '\r\n';
  function cabecalhoBat(titulo) {
    return [
      '@echo off', 'chcp 65001 >nul', 'setlocal', 'cd /d "%~dp0"', `title ${titulo}`,
      'echo ============================================================',
      `echo  ${titulo}`,
      'echo ============================================================',
      'if not exist "index.html" goto :pasta_errada',
      'if not exist "assets\\modelos\\js" mkdir "assets\\modelos\\js"',
      'echo Pasta do app encontrada: %cd%', 'echo.',
    ];
  }
  function rodapeBat() {
    return [
      'echo.', 'echo Pronto! Agora abra/recarregue o app com Ctrl+F5.', 'echo.', 'pause', 'exit /b 0',
      ':pasta_errada', 'echo.',
      'echo [ERRO] Este arquivo NAO esta na pasta do app: nao encontrei o index.html aqui.',
      'echo        Pasta atual: %cd%', 'echo.',
      'echo O QUE FAZER: mova este .bat para a MESMA pasta que contem o index.html',
      'echo e de dois cliques nele novamente.', 'echo.', 'pause', 'exit /b 1',
    ];
  }
  function gerarBatImportar(itens) {
    const L = cabecalhoBat(`Importar objeto${itens.length > 1 ? 's' : ''} para o app`);
    const carga = [];
    const ps = (chave, destino) => `powershell -NoProfile -ExecutionPolicy Bypass -Command "$k='${chave}'; $s=New-Object Text.StringBuilder; foreach($l in [IO.File]::ReadLines('%~f0')){ if($l.StartsWith(':::'+$k+'|')){ [void]$s.Append($l.Substring($k.Length+4)) } }; [IO.File]::WriteAllBytes((Join-Path $PWD.Path '${destino}'),[Convert]::FromBase64String($s.ToString()))"`;
    itens.forEach((it, n) => {
      const t = it.tipo;
      const malha = gerarMalhaJs(t, it.arquivo, it.texto, it.materiais);
      const cfg = gerarConfigJs(t, it.nome || t);
      const linha = linhaManifesto(it);
      const dM = `assets\\modelos\\js\\${t}.malha.js`, dC = `assets\\modelos\\js\\${t}.config.js`, dN = 'assets\\modelos\\js\\_novos-objetos.js';
      L.push(`echo --- Objeto ${n + 1}/${itens.length}: ${t} ---`);
      L.push(`echo [1/3] Criando ${dM}`); L.push(ps(`m${n}`, dM)); L.push('if errorlevel 1 goto :falhou');
      L.push(`echo [2/3] Criando ${dC}`); L.push(ps(`c${n}`, dC)); L.push('if errorlevel 1 goto :falhou');
      L.push(`echo [3/3] Registrando no manifesto ${dN}`);
      L.push('echo       ' + linha.replace(/%/g, '%%').replace(/[<>&|^]/g, '^$&'));
      L.push(`powershell -NoProfile -ExecutionPolicy Bypass -Command "$k='x${n}'; $s=New-Object Text.StringBuilder; foreach($l in [IO.File]::ReadLines('%~f0')){ if($l.StartsWith(':::'+$k+'|')){ [void]$s.Append($l.Substring($k.Length+4)) } }; $novo=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($s.ToString())); $f=Join-Path $PWD.Path '${dN}'; $q=[string][char]39; $m='tipo: '+$q+'${t}'+$q; $ant=@(); if(Test-Path $f){ $ant=@(Get-Content -LiteralPath $f -Encoding UTF8 | Where-Object { -not $_.Contains($m) }) }; [IO.File]::WriteAllLines($f, [string[]]($ant+$novo), (New-Object Text.UTF8Encoding $false))"`);
      L.push('if errorlevel 1 goto :falhou'); L.push('echo.');
      carga.push([`m${n}`, malha], [`c${n}`, cfg], [`x${n}`, linha]);
    });
    L.push('goto :fim', ':falhou', 'echo.', 'echo [ERRO] Algo deu errado ao gravar os arquivos. Confira se o PowerShell esta disponivel e se a pasta nao e somente-leitura.', 'pause', 'exit /b 2', ':fim');
    const corpo = L.concat(rodapeBat());
    // A linha do manifesto usa aspas simples (nada de aspas duplas dentro do comando).
    const payload = [];
    carga.forEach(([k, txt]) => { const d = b64(txt); for (let i = 0; i < d.length; i += 6000) payload.push(`:::${k}|${d.slice(i, i + 6000)}`); });
    return corpo.join(CRLF) + CRLF + payload.join(CRLF) + CRLF;
  }
  function gerarBatExcluir(tipo) {
    const L = cabecalhoBat(`Excluir objeto ${tipo} do app`);
    const dN = 'assets\\modelos\\js\\_novos-objetos.js';
    ['malha', 'config', 'glb'].forEach((ext, n) => {
      const d = `assets\\modelos\\js\\${tipo}.${ext}.js`;
      L.push(`echo [${n + 1}/4] Removendo ${d}`);
      L.push(`if exist "${d}" (del /q "${d}" & echo       removido) else (echo       nao existe - ok)`);
    });
    L.push(`echo [4/4] Removendo a linha do objeto em ${dN}`);
    L.push(`powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=Join-Path $PWD.Path '${dN}'; $q=[string][char]39; $m='tipo: '+$q+'${tipo}'+$q; if(Test-Path $f){ $ant=@(Get-Content -LiteralPath $f -Encoding UTF8); $novo=@($ant | Where-Object { -not $_.Contains($m) }); [IO.File]::WriteAllLines($f, [string[]]$novo, (New-Object Text.UTF8Encoding $false)); Write-Host ('      linhas removidas: ' + ($ant.Count-$novo.Count)) } else { Write-Host '      manifesto nao existe - ok' }"`);
    return L.concat(rodapeBat()).join(CRLF) + CRLF;
  }
  const AVISO_FILE = 'O app abre direto pelo arquivo index.html (endereço file:///…). Nesse modo o navegador não deixa uma página gravar, apagar ou ler arquivos das pastas do computador. Por isso o app gera um .bat: você baixa e dá dois cliques nele, e é o Windows (não o navegador) que grava os arquivos na pasta do app.';
  const lerTexto = (f) => new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => err(r.error); r.readAsText(f); });

  // ---------- estilo ----------
  function garantirCss() {
    if (document.getElementById('imp-obj-css')) return;
    const st = document.createElement('style'); st.id = 'imp-obj-css';
    st.textContent = `
.imp-obj-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;color-scheme:dark}
.imp-obj-box{background:#1c2230;color:#e6ebf5;border:1px solid #39425a;border-radius:12px;width:min(720px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.5);font-size:13px}
.imp-obj-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #39425a}
.imp-obj-head h2{margin:0;font-size:16px}
.imp-obj-body{padding:14px 16px;overflow:auto;display:flex;flex-direction:column;gap:12px}
.imp-obj-drop{border:2px dashed #4a5573;border-radius:10px;padding:26px 12px;text-align:center;color:#9aa6bf;transition:.15s}
.imp-obj-drop.over{border-color:#ffd166;background:rgba(255,209,102,.08);color:#fff}
.imp-obj-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.imp-obj-actions button[disabled]{opacity:.35;cursor:not-allowed}
.imp-obj-hint{font-size:11.5px;color:#9aa6bf}
.imp-obj-list{display:flex;flex-direction:column;gap:6px}
.imp-obj-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #39425a;border-radius:8px;font-size:12.5px;flex-wrap:wrap}
.imp-obj-row .nm{flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imp-obj-row input,.imp-obj-row select{font-size:12px;max-width:170px;background:#0f1420;color:#e6ebf5;border:1px solid #4a5573;border-radius:6px;padding:4px 6px}
.imp-obj-row input::placeholder{color:#7d88a3}
.imp-obj-warn{color:#ffb454;font-size:11px}
.imp-obj-term{background:#0a0d14;color:#7CFC98;border:1px solid #2b3a2f;border-radius:8px;padding:10px 12px;font:12px/1.5 Consolas,'Courier New',monospace;white-space:pre-wrap;word-break:break-all;position:relative}
.imp-obj-term .dim{color:#8fa39a}
.imp-obj-mf h4{margin:0 0 4px;font-size:13px}
.imp-obj-editor{background:#fff;color:#1b1f2a;border:1px solid #b9c0cf;border-radius:6px;padding:8px 10px;font:12px/1.5 Consolas,'Courier New',monospace;white-space:pre-wrap;word-break:break-all;margin:0;position:relative;user-select:all}
.imp-obj-term button{position:absolute;top:6px;right:6px}
.imp-obj-det{border-top:1px solid #39425a;padding-top:10px;line-height:1.5}
.imp-obj-det h3{font-size:14px;margin:14px 0 4px}
.imp-obj-det code,.imp-obj-det pre{background:rgba(255,255,255,.07);border-radius:4px;font-size:12px}
.imp-obj-det code{padding:1px 4px}.imp-obj-det pre{padding:8px;overflow:auto;white-space:pre-wrap}
.imp-obj-det .aviso,.imp-obj-aviso{background:rgba(255,209,102,.12);border-left:3px solid #ffd166;padding:8px 10px;border-radius:4px}
.imp-obj-btn{cursor:pointer}
`;
    document.head.appendChild(st);
  }

  const PASSO_A_PASSO = `
<div class="aviso"><b>Por que é assim?</b> ${esc(AVISO_FILE)} Também não é possível ler um .obj/.glb direto da pasta com <code>fetch()</code> (bloqueio CORS de <code>file:///</code>); já uma tag <code>&lt;script src&gt;</code> é permitida — por isso o modelo vira um arquivo <code>.js</code> que se registra sozinho.</div>

<h3>Método rápido (recomendado): o .bat</h3>
<p><b>1.</b> No programa de modelagem (Blender etc.), exporte em <b>OBJ</b> marcando "materiais" (gera <code>.obj</code> + <code>.mtl</code>). Use <b>metros</b>, eixo <b>Y para cima</b>, origem no centro da base. Cada material precisa de cor difusa (<code>Kd</code>); transparência (<code>d</code>) é aceita; texturas de imagem não são usadas no OBJ.<br>
<b>2.</b> Arraste o <code>.obj</code> <b>junto com o .mtl</b> para a área da janela (ou use "Selecionar arquivos"). Ajuste o nome do tipo e a categoria.<br>
<b>3.</b> O botão <b>⬇ Baixar .bat</b> fica ativo. Baixe e <b>dê dois cliques</b> nele, <b>na mesma pasta que contém o index.html</b> (o .bat confere isso e avisa se estiver na pasta errada).<br>
<b>4.</b> O prompt mostra o que está fazendo: cria <code>assets/modelos/js/&lt;tipo&gt;.malha.js</code>, cria <code>assets/modelos/js/&lt;tipo&gt;.config.js</code> e anexa a linha do objeto em <code>assets/modelos/js/_novos-objetos.js</code> (o "manifesto"; o texto dela aparece também no quadro escuro da janela).<br>
<b>5.</b> Recarregue o app com <b>Ctrl+F5</b>. O objeto aparece em Ferramentas → Objetos com o selo "novo".</p>

<h3>Método manual (sem o .bat)</h3>
<ol>
<li>Clique em "⬇ .js soltos" na linha do objeto (baixa dois arquivos).</li>
<li>Copie <code>&lt;tipo&gt;.malha.js</code> para <code>assets/modelos/js/</code>.</li>
<li>Copie <code>&lt;tipo&gt;.config.js</code> para <code>assets/modelos/js/</code>.</li>
<li>Copie a linha do quadro "Manifesto" (botão 📋 Copiar).</li>
<li>Cole essa linha no fim de <code>assets/modelos/js/_novos-objetos.js</code>.</li>
<li>Recarregue o app com Ctrl+F5.</li>
</ol>
<p>Categorias válidas: <code>escritorio, redes, eletrica, estrutura, mobiliario, copa, externa, robotica, formas, outros</code>. Para ícone 2D próprio, acrescente <code>svg: '&lt;svg …&gt;…&lt;/svg&gt;'</code> na linha do manifesto.</p>

<h3>Excluir um objeto</h3>
<p>Em Ferramentas → Objetos → Acessar modelos, use "🗑 Excluir" no objeto. Ele some do catálogo na hora (isso é reversível com "♻️ Restaurar objetos"); a janela de exclusão oferece um .bat que apaga de vez os arquivos do objeto e a linha dele no manifesto.</p>

<h3>Outras situações</h3>
<p><b>Só uma caixa (sem modelo):</b> basta a linha do manifesto — o app desenha uma caixa com as medidas.<br>
<b>Textura de imagem / material "sempre aceso":</b> use <b>.glb</b> (ver <code>js/glbmeshsource.js</code> e <code>js/gerador-glb/</code>); o OBJ só guarda cor sólida.<br>
<b>Objeto paramétrico (tamanho muda por objeto, como a Escada):</b> é sempre código: perfil em <code>js/engine3d-profiles.js</code>, ícone em <code>js/icons.js</code>, construtor em <code>js/objecttypes/&lt;tipo&gt;.js</code> (+ tag no <code>index.html</code>) e categoria em <code>js/objcategorias.js</code>.<br>
<b>Testar sem gravar nada:</b> "⚡ Testar agora" carrega o .obj só nesta sessão (some ao recarregar).</p>
`;

  function criarOverlay(id, titulo, standalone, onFechar) {
    garantirCss();
    document.getElementById(id)?.remove();
    const ov = document.createElement('div');
    ov.id = id; ov.className = 'imp-obj-ov';
    ov.innerHTML = `<div class="imp-obj-box" role="dialog" aria-label="${esc(titulo)}">
      <div class="imp-obj-head"><h2>${titulo}</h2>${standalone ? '' : '<button type="button" class="btn secondary sm" data-x title="Fechar esta janela">✕</button>'}</div>
      <div class="imp-obj-body"></div></div>`;
    document.body.appendChild(ov);
    try { window.WindowManager?.register?.(id, { el: ov, kind: 'modal', label: titulo }); window.WindowManager?.focus?.(ov); } catch (e) { /* ok */ }
    if (!ov.style.zIndex) ov.style.zIndex = '2147483600';
    const fechar = () => { ov.remove(); try { window.WindowManager?.unregister?.(id); } catch (e) { /* ok */ } if (onFechar) onFechar(); };
    ov.querySelector('[data-x]')?.addEventListener('click', fechar);
    if (!standalone) ov.addEventListener('mousedown', (e) => { if (e.target === ov) fechar(); });
    return { ov, body: ov.querySelector('.imp-obj-body'), fechar };
  }
  const mkBtn = (cls, txt, title) => { const b = document.createElement('button'); b.type = 'button'; b.className = `btn ${cls} sm imp-obj-btn`; b.textContent = txt; b.title = title; return b; };

  function open(opts) {
    opts = opts || {};
    const { ov, body, fechar } = criarOverlay('imp-obj-ov', '📥 Importar objeto', !!opts.standalone, opts.onFechar);
    const cats = window.ObjCategorias?.CATEGORIAS || [{ id: 'outros', label: 'Outros' }];
    body.innerHTML = `
      <div class="imp-obj-drop" id="imp-drop" title="Solte aqui o arquivo .obj e o .mtl (com as cores) do seu modelo 3D">Arraste aqui o <b>.obj</b> (e o <b>.mtl</b>)</div>
      <div class="imp-obj-actions">
        <label class="btn primary sm imp-obj-btn" title="Escolher, no computador, o .obj e o .mtl do modelo"><span>📂 Selecionar arquivos</span><input type="file" id="imp-input" accept=".obj,.mtl" multiple style="display:none"></label>
        <button type="button" class="btn primary sm imp-obj-btn" id="imp-bat" disabled title="Baixa um .bat pronto para estes arquivos. Fica ativo depois de escolher os arquivos.">⬇ Baixar .bat</button>
        <button type="button" class="btn secondary sm imp-obj-btn" id="imp-toggle" title="Mostrar/ocultar o passo a passo completo e os detalhes">📖 Passo a passo e detalhes</button>
      </div>
      <div class="imp-obj-hint" id="imp-hint">Escolha o(s) arquivo(s) para liberar o .bat. Depois: baixe o .bat e dê dois cliques nele, na mesma pasta do index.html.</div>
      <div class="imp-obj-list" id="imp-list"></div>
      <div class="imp-obj-mf" id="imp-term" hidden></div>
      <div class="imp-obj-det" id="imp-det" hidden>${PASSO_A_PASSO}</div>`;
    const det = body.querySelector('#imp-det');
    body.querySelector('#imp-toggle').onclick = () => { det.hidden = !det.hidden; if (!det.hidden) det.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    const lista = body.querySelector('#imp-list'), term = body.querySelector('#imp-term'), btnBat = body.querySelector('#imp-bat'), hint = body.querySelector('#imp-hint');
    const itens = [];
    const validos = () => itens.filter((i) => !i.erro);

    const desenharTerm = () => {
      const v = validos();
      term.hidden = !v.length;
      if (!v.length) return;
      v.forEach((it) => { it.criadoEm = it.criadoEm || new Date().toISOString(); });
      term.innerHTML = '<h4>Manifesto</h4>';
      const ed = document.createElement('pre'); ed.className = 'imp-obj-editor';
      ed.textContent = v.map(linhaManifesto).join('\n');
      term.appendChild(ed);
      const c = mkBtn('secondary', '📋 Copiar', 'Copiar a(s) linha(s) do manifesto');
      c.style.marginTop = '6px';
      c.onclick = async () => { const t = v.map(linhaManifesto).join('\n'); try { await navigator.clipboard.writeText(t); window.Utils?.toast?.('Manifesto copiado', { type: 'ok' }); } catch (e) { window.prompt('Copie:', t); } };
      term.appendChild(c);
    };
    const atualizarBat = () => {
      const n = validos().length;
      btnBat.disabled = !n;
      hint.textContent = n
        ? 'Baixe o .bat e dê dois cliques nele, na MESMA pasta que contém o index.html. Ele cria os arquivos do objeto e o registra no app.'
        : 'Escolha o(s) arquivo(s) para liberar o .bat. Depois: baixe o .bat e dê dois cliques nele, na mesma pasta do index.html.';
    };
    btnBat.onclick = () => {
      const v = validos(); if (!v.length) return;
      v.forEach((it) => { it.criadoEm = new Date().toISOString(); });
      baixar(v.length === 1 ? `importar-${v[0].tipo}.bat` : 'importar-objetos.bat', gerarBatImportar(v), 'application/x-bat;charset=utf-8');
      window.Utils?.toast?.('.bat baixado — dê dois cliques nele na pasta do index.html', { type: 'ok' });
    };

    const desenhar = () => {
      lista.innerHTML = '';
      itens.forEach((it) => {
        const row = document.createElement('div'); row.className = 'imp-obj-row';
        row.innerHTML = `<span class="nm" title="${esc(it.arquivo)}">${it.erro ? '⚠️' : '✅'} ${esc(it.arquivo)}${it.aviso ? `<br><span class="imp-obj-warn">${esc(it.aviso)}</span>` : ''}</span>`;
        if (it.erro) { row.insertAdjacentHTML('beforeend', `<span class="imp-obj-warn">${esc(it.erro)}</span>`); lista.appendChild(row); return; }
        const inp = document.createElement('input'); inp.value = it.tipo; inp.title = 'Nome do tipo (minúsculas, sem espaços) — vira o nome dos arquivos';
        inp.oninput = () => { it.tipo = nomeDoTipo(inp.value); desenharTerm(); };
        const nome = document.createElement('input'); nome.value = it.nome; nome.placeholder = 'Nome exibido'; nome.title = 'Nome que aparece na lista de objetos';
        nome.oninput = () => { it.nome = nome.value.trim() || it.tipo; desenharTerm(); };
        const sel = document.createElement('select'); sel.title = 'Categoria em que o objeto aparece em "Por categoria"';
        sel.innerHTML = cats.map((c) => `<option value="${c.id}"${c.id === it.categoria ? ' selected' : ''}>${esc(c.label.replace(/ \(.*/, ''))}</option>`).join('');
        sel.onchange = () => { it.categoria = sel.value; desenharTerm(); };
        row.append(nome, inp, sel);
        if (opts.onTestar) {
          const bT = mkBtn('secondary', '⚡ Testar agora', 'Carrega este objeto só nesta sessão (some ao recarregar) para conferir o modelo antes de instalar');
          bT.onclick = async () => { await opts.onTestar([it.file].concat(it.mtlFile ? [it.mtlFile] : [])); };
          row.appendChild(bT);
        }
        const bS = mkBtn('secondary', '⬇ .js soltos', 'Método manual: baixa só os arquivos .malha.js e .config.js deste objeto');
        bS.onclick = () => { baixar(`${it.tipo}.malha.js`, gerarMalhaJs(it.tipo, it.arquivo, it.texto, it.materiais)); setTimeout(() => baixar(`${it.tipo}.config.js`, gerarConfigJs(it.tipo, it.nome || it.tipo)), 350); };
        row.appendChild(bS);
        lista.appendChild(row);
      });
      desenharTerm(); atualizarBat();
    };

    const processar = async (files) => {
      const arr = Array.from(files || []);
      const porNome = new Map();
      const mtls = arr.filter((f) => /\.mtl$/i.test(f.name));
      for (const f of mtls) porNome.set(f.name.toLowerCase(), await lerTexto(f));
      const objs = arr.filter((x) => /\.obj$/i.test(x.name));
      for (const f of objs) {
        try {
          const texto = await lerTexto(f);
          const { materiais, aviso } = lerMateriaisDoObj(texto, porNome);
          const mm = /^\s*mtllib\s+(\S+)/m.exec(texto);
          itens.push({ arquivo: f.name, file: f, mtlFile: mm ? mtls.find((x) => x.name.toLowerCase() === mm[1].trim().toLowerCase()) : null, texto, materiais, aviso, tipo: nomeDoTipo(f.name), nome: f.name.replace(/\.[^.]+$/, ''), categoria: 'outros', medidas: medir(texto) });
        } catch (e) { itens.push({ arquivo: f.name, erro: 'não consegui ler o arquivo' }); }
      }
      if (!objs.length) itens.push({ arquivo: arr[0]?.name || '(nenhum)', erro: 'envie um arquivo .obj (com o .mtl junto)' });
      desenhar();
    };
    const drop = body.querySelector('#imp-drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => processar(e.dataTransfer.files));
    body.querySelector('#imp-input').onchange = (e) => { processar(e.target.files); e.target.value = ''; };
    return { close: fechar };
  }

  /** Janela mostrada DEPOIS de confirmar a exclusão de um objeto: lista o que precisa ser apagado/alterado e
   *  oferece o .bat que faz isso. `info`: { tipo, nome, codigo (objeto padrão definido em código?) }. */
  function abrirExclusao(info) {
    const tipo = info.tipo;
    const { body, fechar } = criarOverlay('imp-obj-excl', '🗑 Excluir objeto — arquivos e alterações', false);
    const arquivos = [`assets\\modelos\\js\\${tipo}.malha.js`, `assets\\modelos\\js\\${tipo}.config.js`, `assets\\modelos\\js\\${tipo}.glb.js (se existir)`];
    const nav = info.soNavegador
      ? '<div class="imp-obj-aviso">Este objeto foi criado/carregado dentro do app (fica guardado no navegador, não em arquivos do projeto). Ele já foi ocultado do catálogo e pode voltar com "♻️ Restaurar objetos". O .bat abaixo só é necessário se você também instalou arquivos com este mesmo nome.</div>'
      : '';
    const codigo = info.codigo
      ? `<div class="imp-obj-aviso">"${esc(info.nome || tipo)}" é um objeto <b>padrão do app</b> (definido em código). Ele já foi <b>ocultado do catálogo</b> e pode voltar com "♻️ Restaurar objetos". Para removê-lo de vez do código seria preciso editar à mão: <code>js/engine3d-profiles.js</code> (perfil), <code>js/icons.js</code> (ícone), <code>js/objcategorias.js</code> (categoria) e, se existir, <code>js/objecttypes/${esc(tipo)}.js</code> (+ a tag no <code>index.html</code>). O .bat abaixo só apaga os arquivos de modelo.</div>`
      : '';
    body.innerHTML = `
      <div>O objeto <b>${esc(info.nome || tipo)}</b> foi removido do catálogo. Para apagar também os arquivos dele do projeto:</div>
      ${info.soNavegador
        ? `<div class="imp-obj-term"><span class="dim">Objeto:</span>\n  ${esc(info.nome || tipo)}\n<span class="dim">Guardado só no navegador — não há arquivos do projeto para apagar.</span></div>`
        : `<div class="imp-obj-term"><span class="dim">apague:</span>\n${arquivos.map((a) => '  ' + esc(a)).join('\n')}\n<span class="dim">altere:</span>\n  assets\\modelos\\js\\_novos-objetos.js  <span class="dim">(remova a linha  tipo: '${esc(tipo)}')</span></div>`}
      ${codigo}${nav}
      <div class="imp-obj-actions"><button type="button" class="btn primary sm imp-obj-btn" id="exc-bat" title="Baixa o .bat que apaga os arquivos acima. Dê dois cliques nele, na pasta do index.html.">⬇ Baixar .bat de exclusão</button></div>
      <div class="imp-obj-hint">Baixe o .bat e dê dois cliques nele, <b>na mesma pasta que contém o index.html</b> (ele confere e avisa se estiver na pasta errada). Depois recarregue o app com Ctrl+F5.</div>
      <div class="imp-obj-aviso"><b>Por que um .bat?</b> ${esc(AVISO_FILE)}</div>`;
    body.querySelector('#exc-bat').onclick = () => baixar(`excluir-${tipo}.bat`, gerarBatExcluir(tipo), 'application/x-bat;charset=utf-8');
    return { close: fechar };
  }

  window.ImportarObjetoCard = { open, abrirExclusao };
})();
