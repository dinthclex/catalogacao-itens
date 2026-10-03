/**
 * js/dbmonitor.js — Monitor de leituras/escritas do IndexedDB (gráfico + janela + miniatura).
 *
 * [01/10/2026] NOVO — pedido verbatim: "Implemente uma janela que mostrar as leituras e escritas do IndexedDB, como um gráfico.
 * Cada um com uma cor podendo habilitar/desabilitar o desenho da 'leitura' e da 'escrita'. Será útil para verificar o quanto de
 * tempo fica nesta atividade, pelo próprio app. Implemente também a versão miniatura deste gráfico. Deve poder se escolher a
 * velocidade de atualização do gráfico. Deve ser possível ver também, no gráfico, a quantidade de bytes gravadas/lidas, também
 * deve ser possível habilitar/desabilitar que apareçam no gráfico. Ao habilitar/desabilitar de algum desenho aparecer no
 * gráfico, eles devem continuar a ser atualizados. [...] A janela de 'lembrança' deve poder ser regulada [...]".
 *
 * Script comum (sem módulos ES — funciona em file:///), carregado ANTES de js/db.js (ver index.html), sem depender de nenhum
 * outro arquivo do app para funcionar (usa `window.DB`/`window.Utils` só se existirem: persistir a config e levar a janela
 * pra frente). Peças:
 *   1) COLETOR  — `DBMonitor.inicio/fim/instrumentar`, chamados por `tx()` em js/db.js (com `?.`: se este arquivo não
 *      carregar, o banco funciona igual). Os dados são SEMPRE coletados, com ou sem janela aberta, com ou sem cada série
 *      habilitada — habilitar/desabilitar só muda o que é DESENHADO (por isso, ao reabilitar, os valores já estão atualizados).
 *   2) GRÁFICO  — `DBMonitor.desenhar(canvas, {mini})`: % do tempo com ao menos uma transação de leitura/escrita em andamento
 *      em cada intervalo (áreas) + bytes lidos/gravados por intervalo (linhas tracejadas, eixo à direita).
 *   3) JANELA e MINIATURA flutuantes + `controlsHtml/wireControls` (os MESMOS controles aparecem na janela e em
 *      Configurações do app > Mapa, 3D e aparelho).
 * [01/10/2026] Bytes REAIS (pedido verbatim: "Em vez de colocar estimativas, coloque os valores reais, pois é possível capturá-los na leitura e na gravação"): `tamanhoSerializado` calcula o tamanho exato da serialização do V8 (o formato que o navegador grava no IndexedDB) de cada registro gravado (put/add) e de cada resultado lido (get/getAll/cursor).
 * Limites honestos: (a) a duração de cada transação é medida do `db.transaction()` até `oncomplete` — inclui a espera na fila
 * do próprio IndexedDB e o atraso do navegador entregar o evento (se a thread principal estiver ocupada, a transação "demora"
 * mesmo sendo minúscula); (b) os bytes são o tamanho REAL SERIALIZADO do dado trafegado (não o tamanho em disco do LevelDB, que tem
 * compressão/overhead e a página não enxerga), calculado sem JSON.stringify (que travaria o app em registros grandes); (c) guarda no máximo
 * MAX_EVENTOS transações brutas (as mais antigas saem), mas os TOTAIS desde o carregamento da página nunca se perdem.
 */
(function () {
  'use strict';
  if (window.DBMonitor) return;

  const MAX_EVENTOS = 100000;
  const CFG_PADRAO = {
    miniAtiva: false,          // mostrar a miniatura flutuante
    velocidadeMs: 1000,        // 0 = pausado (continua coletando, só não redesenha)
    memoria: 'sessao',         // 'sessao' (desde que a página carregou) | 'recente' (última janela de tempo)
    memoriaValor: 60,          // tamanho da janela 'recente'...
    memoriaUnidade: 's',       // ...em 's' | 'min' | 'h'
    mostrarLeitura: true,
    mostrarEscrita: true,
    mostrarBytesLidos: false,
    mostrarBytesGravados: false,
  };
  const COR = { leitura: '#2fb8a6', escrita: '#f08a3c' };

  const eventos = [];            // transações FINALIZADAS: { ini, fim, modo:'leitura'|'escrita', stores, rotulo, bytes, ok }
  const emAndamento = new Map(); // id -> { ini, modo, stores, rotulo, bytes }
  const totais = { leitura: { n: 0, ms: 0, bytes: 0 }, escrita: { n: 0, ms: 0, bytes: 0 } };
  let seq = 0;
  let cfg = { ...CFG_PADRAO };
  let cfgCarregada = false;
  const ouvintes = new Set();

  // ---------------------------------------------------------------- coletor
  /** TAMANHO REAL SERIALIZADO de um valor — o mesmo que o navegador grava/lê no IndexedDB (structured clone do V8: tags de 1 byte,
   *  inteiros em varint zigzag, doubles de 8 bytes, strings de 1 byte/caractere quando são Latin-1 e 2 bytes quando não são, objetos e
   *  arrays com seus terminadores/contagens, referências repetidas como back-reference, Blob/ArrayBuffer com o tamanho exato).
   *  Calculado percorrendo o valor, SEM criar JSON nem copiar nada (um JSON.stringify de mapa grande travaria o app por segundos).
   *  Validado contra `v8.serialize` do Node (mesmo formato) — idêntico byte a byte em números, textos, objetos, arrays, Date, Map e Set. Única
   *  diferença possível: número INTEIRO que o V8 guardou como double (resultado de conta, ex. 3 = 1,5×2) ocupa 9 bytes lá e 2–5 aqui (JS não
   *  distingue os dois), e ArrayBufferView, cujo cabeçalho varia entre navegadores (poucos bytes).
   *  Não é o tamanho em disco do LevelDB (que tem compressão/overhead e a página não consegue ver) — é o tamanho real do dado
   *  trafegado. O custo da própria medição é somado em `custoMedicaoMs` (mostrado na janela). */
  let custoMedicaoMs = 0;
  const RE_LATIN1 = /^[\u0000-\u00ff]*$/;
  function varint(n) { let b = 1; while (n >= 128) { n = Math.floor(n / 128); b++; } return b; }
  function tamanhoSerializado(v) {
    const t0 = performance.now();
    let total = 2; // cabeçalho (0xFF + versão)
    const vistos = new Map();
    let nos = 0;
    const pilha = [v];
    while (pilha.length && nos < 5000000) {
      const x = pilha.pop();
      nos++;
      if (x === undefined || x === null || x === true || x === false) { total += 1; continue; }
      const tipo = typeof x;
      if (tipo === 'number') {
        if (Number.isInteger(x) && x >= -1073741824 && x <= 1073741823) { const z = x < 0 ? (-x * 2 - 1) : x * 2; total += 1 + varint(z); } else total += 9;
        continue;
      }
      if (tipo === 'string') { total += 1 + varint(x.length) + (RE_LATIN1.test(x) ? x.length : 2 * x.length); continue; }
      if (tipo === 'bigint') { total += 1 + 1 + 8; continue; }
      if (tipo !== 'object') continue;
      if (vistos.has(x)) { total += 1 + varint(vistos.get(x)); continue; }
      vistos.set(x, vistos.size);
      if (typeof Blob !== 'undefined' && x instanceof Blob) { total += 2 + x.size; continue; }
      if (x instanceof ArrayBuffer) { total += 1 + varint(x.byteLength) + x.byteLength; continue; }
      if (ArrayBuffer.isView(x)) { total += 1 + 1 + varint(x.byteOffset) + varint(x.byteLength) + 1 + 1 + varint(x.buffer.byteLength) + x.buffer.byteLength; continue; }
      if (x instanceof Date) { total += 9; continue; }
      if (x instanceof Map) { total += 2 + varint(x.size * 2); x.forEach((val, k) => { pilha.push(k); pilha.push(val); }); continue; }
      if (x instanceof Set) { total += 2 + varint(x.size); x.forEach((val) => pilha.push(val)); continue; }
      if (Array.isArray(x)) { total += 1 + varint(x.length) + 1 + 1 + varint(x.length); for (let i = 0; i < x.length; i++) pilha.push(x[i]); continue; }
      let n = 0;
      for (const k in x) { if (!Object.prototype.hasOwnProperty.call(x, k)) continue; n++; total += 1 + varint(k.length) + k.length; pilha.push(x[k]); }
      total += 2 + varint(n);
    }
    custoMedicaoMs += performance.now() - t0;
    return total;
  }

  // [01/10/2026] NOVO — "Coloque no painel do IndexedDB um jeito de poder ver a lista das 29 esperas do mapa, além de outras que tenham,
  // (cada função que grava no IndexedDB). Coloque, também, um contador de chamadas para cada uma também e os tempos (último, mais rápido e
  // mais demorado). Coloque estas informações em uma aba a parte." Registro por função, desde o carregamento da página:
  //   tipo 'espera'   = chamadas `_saveMap('nome')` do mapa; tempo = quanto o CHAMADOR esperou (da chamada até a Promise resolver);
  //   tipo 'gravacao' = funções do DB (setSetting, saveMap, updateItem, addItem...); tempo = duração real da transação readwrite
  //                     (do db.transaction() até oncomplete — inclui fila do IndexedDB e atraso do navegador, ver limites acima).
  const funcs = new Map();
  function regFunc(nome, tipo) {
    const k = tipo + '|' + nome;
    let f = funcs.get(k);
    if (!f) { f = { nome, tipo, n: 0, ultimo: null, min: null, max: null, total: 0 }; funcs.set(k, f); }
    return f;
  }
  function registrar(nome, tipo, ms) {
    const f = regFunc(nome, tipo);
    f.n++; f.ultimo = ms; f.total += ms;
    if (f.min == null || ms < f.min) f.min = ms;
    if (f.max == null || ms > f.max) f.max = ms;
  }
  function espera(nome, ms) { registrar(nome, 'espera', ms); }
  function declarar(nomes, tipo) { (Array.isArray(nomes) ? nomes : [nomes]).forEach((n) => regFunc(n, tipo || 'espera')); }
  function zerarFuncs() { funcs.forEach((f) => { f.n = 0; f.ultimo = null; f.min = null; f.max = null; f.total = 0; }); }
  /** Nome da função a partir do rótulo da transação: `setSetting("x")` -> `setSetting`. */
  function nomeDoRotulo(r, stores) { const n = String(r || '').replace(/\(.*$/, '').trim(); return n || `(sem rótulo) ${stores}`; }

  function inicio(info) {
    const id = ++seq;
    emAndamento.set(id, {
      ini: performance.now(),
      modo: info && info.modo === 'readwrite' ? 'escrita' : 'leitura',
      stores: (info && info.stores) || '?',
      rotulo: (info && info.rotulo) || '',
      bytes: 0,
    });
    return id;
  }

  function somarBytes(id, n) {
    const e = emAndamento.get(id);
    if (e && n > 0) e.bytes += n;
  }

  function fim(id, ok) {
    const e = emAndamento.get(id);
    if (!e) return;
    emAndamento.delete(id);
    const f = performance.now();
    const ev = { ini: e.ini, fim: f, modo: e.modo, stores: e.stores, rotulo: e.rotulo, bytes: e.bytes, ok: ok !== false };
    eventos.push(ev);
    if (eventos.length > MAX_EVENTOS) eventos.splice(0, eventos.length - MAX_EVENTOS);
    const t = totais[ev.modo];
    t.n++; t.ms += f - e.ini; t.bytes += e.bytes;
    if (ev.modo === 'escrita') registrar(nomeDoRotulo(ev.rotulo, ev.stores), 'gravacao', f - e.ini);
  }

  /** Embrulha `t.objectStore(...)` de UMA transação para contar bytes: `put/add` contam o registro gravado;
   *  `get/getAll/openCursor` contam o que a leitura devolve (no evento `success`). Não muda o comportamento. */
  function instrumentar(t, id) {
    if (!t || typeof t.objectStore !== 'function') return;
    const origObjectStore = t.objectStore.bind(t);
    const embrulha = (alvo) => new Proxy(alvo, {
      get(obj, prop) {
        const v = obj[prop];
        if (typeof v !== 'function') return v;
        if (prop === 'put' || prop === 'add') {
          return (rec, ...resto) => { try { somarBytes(id, tamanhoSerializado(rec)); } catch (e) { /* só métrica */ } return v.call(obj, rec, ...resto); };
        }
        if (prop === 'get' || prop === 'getAll' || prop === 'openCursor') {
          return (...args) => {
            const req = v.apply(obj, args);
            try {
              req.addEventListener('success', () => {
                const r = req.result;
                if (r && typeof r === 'object' && 'value' in r && typeof r.continue === 'function') somarBytes(id, tamanhoSerializado(r.value));
                else somarBytes(id, tamanhoSerializado(r));
              });
            } catch (e) { /* só métrica */ }
            return req;
          };
        }
        if (prop === 'index') return (...args) => embrulha(v.apply(obj, args));
        return v.bind(obj);
      },
    });
    t.objectStore = (nome) => embrulha(origObjectStore(nome));
  }

  // ----------------------------------------------------------------- config
  async function carregarConfig() {
    if (cfgCarregada) return cfg;
    cfgCarregada = true;
    try {
      if (window.DB && typeof DB.getSetting === 'function') {
        const salvo = await DB.getSetting('dbMonitorConfig', null);
        if (salvo && typeof salvo === 'object') cfg = { ...CFG_PADRAO, ...salvo };
      }
    } catch (e) { /* segue com o padrão */ }
    aplicarCfg();
    return cfg;
  }

  function setConfig(patch) {
    cfg = { ...cfg, ...patch };
    try { if (window.DB && typeof DB.setSetting === 'function') DB.setSetting('dbMonitorConfig', cfg); } catch (e) { /* ignora */ }
    aplicarCfg();
    ouvintes.forEach((fn) => { try { fn(cfg); } catch (e) { /* ignora */ } });
  }

  // ----------------------------------------------------------------- gráfico
  // [01/10/2026] MUDADO — "os desenhos que já haviam sido impressos ficam mudando de forma [...] Se o valor já foi capturado no tempo,
  // então, aquele valor que já é conhecido e fixo deve produzir sempre o mesmo desenho." CAUSA RAIZ: os intervalos (buckets) eram
  // calculados RELATIVOS à janela [agora − memória, agora], que desliza a cada redesenho — as fronteiras dos intervalos andavam
  // alguns ms por quadro e cada transação caía em intervalos diferentes, então o mesmo dado mudava de forma. Agora os intervalos
  // ficam numa grade ABSOLUTA (múltiplos de `bw` ms desde o carregamento da página) e a janela é alinhada a essa grade: um intervalo
  // já fechado nunca muda de valor nem de forma — o gráfico só rola. (`bw` só muda quando a janela 'desde que a página carregou'
  // cresce o bastante para trocar de degrau da escada abaixo; com 'última porção de tempo' a janela é fixa e `bw` nunca muda.)
  // Estado de VISTA (zoom) — só em memória, não persiste: tempo (t0/t1 fixos; null = ao vivo) e escala vertical ('auto' | fração).
  const vista = { t0: null, t1: null, yMax: 'auto' };
  const ESCADA_BW = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000, 7200000, 21600000];
  const ESCALAS_Y = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];

  function janelaDeTempo(agora, semVista) {
    if (!semVista && vista.t0 != null && vista.t1 != null) return { t0: vista.t0, t1: vista.t1, fixa: true };
    if (cfg.memoria === 'recente') {
      const mult = cfg.memoriaUnidade === 'h' ? 3600000 : cfg.memoriaUnidade === 'min' ? 60000 : 1000;
      const dur = Math.max(1000, (Number(cfg.memoriaValor) || 60) * mult);
      return { t0: agora - dur, t1: agora };
    }
    return { t0: 0, t1: Math.max(agora, 1000) }; // performance.now() == 0 no carregamento da página
  }

  function fmtBytes(n) {
    if (n < 1024) return Math.round(n) + ' B';
    if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 2 : 1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  function fmtDur(ms) {
    if (ms < 10) return ms.toFixed(2) + ' ms';   // [01/10/2026] 2 casas abaixo de 10 ms (esperas do mapa são < 1 ms)
    if (ms < 1000) return Math.round(ms) + ' ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + ' s';
    if (ms < 3600000) return (ms / 60000).toFixed(1) + ' min';
    return (ms / 3600000).toFixed(1) + ' h';
  }
  function fmtPct(f) { const p = f * 100; return (p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2)) + '%'; }

  /** Grade absoluta: devolve { bw, t0, nB } alinhados a múltiplos de bw. */
  function grade(span, alvoBuckets, t0Bruto, t1Bruto) {
    let bw = ESCADA_BW[ESCADA_BW.length - 1];
    for (const c of ESCADA_BW) { if (span / c <= alvoBuckets) { bw = c; break; } }
    const t0 = Math.floor(t0Bruto / bw) * bw;
    const t1 = Math.ceil(t1Bruto / bw) * bw;
    return { bw, t0, t1, nB: Math.max(1, Math.round((t1 - t0) / bw)) };
  }

  /** Por intervalo da grade: fração do tempo ocupada (união das transações em andamento) de cada modo + bytes reais. */
  function calcularSeries(g) {
    const { bw, t0, t1, nB } = g;
    const serie = {
      leitura: { ocupado: new Float64Array(nB), bytes: new Float64Array(nB), ms: 0, n: 0, totalBytes: 0 },
      escrita: { ocupado: new Float64Array(nB), bytes: new Float64Array(nB), ms: 0, n: 0, totalBytes: 0 },
    };
    const agora = performance.now();
    const todos = eventos.concat([...emAndamento.values()].map((e) => ({ ini: e.ini, fim: agora, modo: e.modo, bytes: e.bytes })));
    const intervalos = { leitura: [], escrita: [] };
    for (const e of todos) {
      if (e.fim < t0 || e.ini > t1) continue;
      const s = serie[e.modo];
      s.n++; s.ms += e.fim - e.ini; s.totalBytes += e.bytes;
      intervalos[e.modo].push(e);
      const b = Math.floor((e.fim - t0) / bw);
      if (b >= 0 && b < nB) s.bytes[b] += e.bytes; // bytes contam no intervalo em que a transação TERMINOU (fixo depois de fechado)
    }
    for (const modo of ['leitura', 'escrita']) {
      const lista = intervalos[modo].sort((a, b) => a.ini - b.ini);
      const uni = []; // une sobrepostas: "tempo com ao menos 1 transação" nunca passa de 100%
      for (const e of lista) {
        const ult = uni[uni.length - 1];
        if (ult && e.ini <= ult.fim) ult.fim = Math.max(ult.fim, e.fim); else uni.push({ ini: e.ini, fim: e.fim });
      }
      for (const u of uni) {
        const a = Math.max(u.ini, t0), z = Math.min(u.fim, t1);
        if (z <= a) continue;
        const b0 = Math.max(0, Math.floor((a - t0) / bw)), b1 = Math.min(nB - 1, Math.floor((z - t0) / bw));
        for (let b = b0; b <= b1; b++) {
          const ini = t0 + b * bw;
          const ov = Math.min(z, ini + bw) - Math.max(a, ini);
          if (ov > 0) serie[modo].ocupado[b] += ov / bw;
        }
      }
    }
    return serie;
  }

  function desenhar(canvas, opts) {
    if (!canvas) return;
    const mini = !!(opts && opts.mini);
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || canvas.width, cssH = canvas.clientHeight || canvas.height;
    if (!cssW || !cssH) return;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const css = getComputedStyle(document.documentElement);
    const corTexto = (css.getPropertyValue('--text-dim') || '#9aa4b2').trim();
    const corGrade = (css.getPropertyValue('--border') || '#2a303a').trim();
    const padL = mini ? 2 : 40, padR = mini ? 2 : 52, padT = mini ? 2 : 8, padB = mini ? 2 : 18;
    const W = cssW - padL - padR, H = cssH - padT - padB;
    if (W < 10 || H < 10) return;
    const agora = performance.now();
    const j = janelaDeTempo(agora, mini); // a miniatura sempre acompanha o tempo real (ignora a vista com zoom)
    const usaVistaTempo = !!j.fixa;
    const alvo = Math.max(20, Math.min(400, Math.floor(W / (mini ? 2 : 4))));
    const g = grade(j.t1 - j.t0, alvo, j.t0, j.t1);
    const s = calcularSeries(g);
    const { nB, bw } = g;
    const bwPx = W / nB;
    // escala vertical (zoom Y): 'auto' ajusta ao maior valor visível; senão, o teto escolhido
    let maxFrac = 1;
    if (vista.yMax === 'auto') {
      let m = 0;
      if (cfg.mostrarLeitura) for (let b = 0; b < nB; b++) m = Math.max(m, s.leitura.ocupado[b]);
      if (cfg.mostrarEscrita) for (let b = 0; b < nB; b++) m = Math.max(m, s.escrita.ocupado[b]);
      maxFrac = ESCALAS_Y.find((c) => c >= m * 1.05) || 1;
    } else maxFrac = Number(vista.yMax) || 1;
    let maxBytes = 1;
    for (let b = 0; b < nB; b++) {
      if (cfg.mostrarBytesLidos) maxBytes = Math.max(maxBytes, s.leitura.bytes[b]);
      if (cfg.mostrarBytesGravados) maxBytes = Math.max(maxBytes, s.escrita.bytes[b]);
    }
    const yPx = (v) => padT + H - Math.min(1, v / maxFrac) * H;
    // grade + eixos
    ctx.lineWidth = 1; ctx.strokeStyle = corGrade; ctx.fillStyle = corTexto;
    ctx.font = '10px ' + (css.getPropertyValue('--font') || 'sans-serif');
    ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach((f) => {
      const y = padT + H - f * H;
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(padL, y + 0.5); ctx.lineTo(padL + W, y + 0.5); ctx.stroke(); ctx.globalAlpha = 1;
      if (!mini) { ctx.textAlign = 'right'; ctx.fillText(fmtPct(f * maxFrac), padL - 4, y); }
    });
    if (!mini) {
      ctx.textAlign = 'left';
      if (cfg.mostrarBytesLidos || cfg.mostrarBytesGravados) { ctx.fillText(fmtBytes(maxBytes), padL + W + 4, padT + 6); ctx.fillText('0 B', padL + W + 4, padT + H - 2); }
      ctx.textBaseline = 'alphabetic';
      const rot = usaVistaTempo ? 'vista fixa · ' + fmtDur(j.t1 - j.t0) : (cfg.memoria === 'recente' ? '−' + fmtDur(j.t1 - j.t0) : 'início da página');
      ctx.textAlign = 'left'; ctx.fillText(rot + ' · intervalo ' + fmtDur(bw), padL, cssH - 4);
      ctx.textAlign = 'right'; ctx.fillText(usaVistaTempo ? fmtDur(j.t1) : 'agora', padL + W, cssH - 4);
    }
    // áreas de % do tempo ocupado
    const area = (arr, cor) => {
      ctx.beginPath(); ctx.moveTo(padL, padT + H);
      for (let b = 0; b < nB; b++) { const y = yPx(arr[b]); ctx.lineTo(padL + b * bwPx, y); ctx.lineTo(padL + (b + 1) * bwPx, y); }
      ctx.lineTo(padL + W, padT + H); ctx.closePath();
      ctx.globalAlpha = 0.28; ctx.fillStyle = cor; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath();
      for (let b = 0; b < nB; b++) { const y = yPx(arr[b]), x = padL + b * bwPx; if (b === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); ctx.lineTo(x + bwPx, y); }
      ctx.strokeStyle = cor; ctx.lineWidth = mini ? 1 : 1.5; ctx.stroke();
    };
    if (cfg.mostrarLeitura) area(s.leitura.ocupado, COR.leitura);
    if (cfg.mostrarEscrita) area(s.escrita.ocupado, COR.escrita);
    // bytes reais (linhas tracejadas, eixo da direita)
    const linhaBytes = (arr, cor) => {
      ctx.beginPath(); ctx.setLineDash([4, 3]);
      for (let b = 0; b < nB; b++) { const x = padL + b * bwPx + bwPx / 2, y = padT + H - (arr[b] / maxBytes) * H; if (b === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = cor; ctx.lineWidth = mini ? 1 : 1.5; ctx.stroke(); ctx.setLineDash([]);
    };
    if (cfg.mostrarBytesLidos) linhaBytes(s.leitura.bytes, COR.leitura);
    if (cfg.mostrarBytesGravados) linhaBytes(s.escrita.bytes, COR.escrita);
    if (!canvas.__dbmGeom || !mini) canvas.__dbmGeom = { padL, W, t0: g.t0, t1: g.t1 };
    return s;
  }

  function resumoTexto(s) {
    if (!s) return '';
    const l = s.leitura, e = s.escrita;
    return `Leituras: ${l.n} · ${fmtDur(l.ms)} · ${fmtBytes(l.totalBytes)}   |   Escritas: ${e.n} · ${fmtDur(e.ms)} · ${fmtBytes(e.totalBytes)}`;
  }

  function maisLentas(n) {
    const { t0 } = janelaDeTempo(performance.now());
    return eventos.filter((e) => e.fim >= t0).sort((a, b) => (b.fim - b.ini) - (a.fim - a.ini)).slice(0, n);
  }

  // --------------------------------------------------------- controles (HTML)
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /** HTML dos controles — usado tanto pela janela quanto por Configurações do app (`idp` = prefixo de id, único por uso). */
  function controlsHtml(idp) {
    const sel = (v, a) => (String(v) === String(a) ? ' selected' : '');
    const chk = (v) => (v ? ' checked' : '');
    return `
      <div class="dbm-controls" data-dbm-idp="${esc(idp)}">
        <div class="dbm-row">
          <label title="Cada tipo de desenho pode ser ligado/desligado — os dados continuam sendo coletados e atualizados mesmo com o desenho desligado."><input type="checkbox" id="${idp}-leitura"${chk(cfg.mostrarLeitura)}> <span class="dbm-sw" style="background:${COR.leitura}"></span> Leitura (tempo)</label>
          <label title="Percentual do tempo, em cada intervalo do gráfico, com ao menos uma transação de ESCRITA em andamento."><input type="checkbox" id="${idp}-escrita"${chk(cfg.mostrarEscrita)}> <span class="dbm-sw" style="background:${COR.escrita}"></span> Escrita (tempo)</label>
          <label title="Bytes lidos em cada intervalo — tamanho real serializado do que foi lido (linha tracejada, eixo da direita)."><input type="checkbox" id="${idp}-blidos"${chk(cfg.mostrarBytesLidos)}> <span class="dbm-sw dbm-sw-tr" style="border-color:${COR.leitura}"></span> Bytes lidos</label>
          <label title="Bytes gravados em cada intervalo — tamanho real serializado do que foi gravado (linha tracejada, eixo da direita)."><input type="checkbox" id="${idp}-bgrav"${chk(cfg.mostrarBytesGravados)}> <span class="dbm-sw dbm-sw-tr" style="border-color:${COR.escrita}"></span> Bytes gravados</label>
        </div>
        <div class="dbm-row">
          <label title="Com que frequência o gráfico é redesenhado. 'Pausado' congela o desenho, mas a coleta continua.">Atualizar a cada
            <select id="${idp}-vel">
              <option value="250"${sel(cfg.velocidadeMs, 250)}>0,25 s</option><option value="500"${sel(cfg.velocidadeMs, 500)}>0,5 s</option>
              <option value="1000"${sel(cfg.velocidadeMs, 1000)}>1 s</option><option value="2000"${sel(cfg.velocidadeMs, 2000)}>2 s</option>
              <option value="5000"${sel(cfg.velocidadeMs, 5000)}>5 s</option><option value="10000"${sel(cfg.velocidadeMs, 10000)}>10 s</option>
              <option value="0"${sel(cfg.velocidadeMs, 0)}>Pausado</option>
            </select></label>
        </div>
        <div class="dbm-row">
          <label title="O que o gráfico mostra: tudo desde que a página foi carregada, ou só a última porção de tempo.">Memória do gráfico
            <select id="${idp}-mem">
              <option value="sessao"${sel(cfg.memoria, 'sessao')}>Desde que a página carregou</option>
              <option value="recente"${sel(cfg.memoria, 'recente')}>Só a última porção de tempo</option>
            </select></label>
          <span id="${idp}-mem-rec" style="${cfg.memoria === 'recente' ? '' : 'display:none'}">
            <input type="number" id="${idp}-memv" min="1" max="999" step="1" value="${Number(cfg.memoriaValor) || 60}" style="width:4.5em">
            <select id="${idp}-memu"><option value="s"${sel(cfg.memoriaUnidade, 's')}>segundos</option><option value="min"${sel(cfg.memoriaUnidade, 'min')}>minutos</option><option value="h"${sel(cfg.memoriaUnidade, 'h')}>horas</option></select>
          </span>
        </div>
      </div>`;
  }

  /** Liga os controles gerados por `controlsHtml(idp)` dentro de `raiz`. */
  function wireControls(raiz, idp) {
    const q = (suf) => raiz.querySelector('#' + idp + '-' + suf);
    const ligaChk = (suf, campo) => { const el = q(suf); if (el) el.onchange = (e) => setConfig({ [campo]: !!e.target.checked }); };
    ligaChk('leitura', 'mostrarLeitura'); ligaChk('escrita', 'mostrarEscrita'); ligaChk('blidos', 'mostrarBytesLidos'); ligaChk('bgrav', 'mostrarBytesGravados');
    const vel = q('vel'); if (vel) vel.onchange = (e) => setConfig({ velocidadeMs: parseInt(e.target.value, 10) || 0 });
    const mem = q('mem');
    if (mem) mem.onchange = (e) => { setConfig({ memoria: e.target.value }); const r = q('mem-rec'); if (r) r.style.display = e.target.value === 'recente' ? '' : 'none'; };
    const mv = q('memv'); if (mv) mv.onchange = (e) => { const v = parseInt(e.target.value, 10); if (v >= 1) setConfig({ memoriaValor: v }); };
    const mu = q('memu'); if (mu) mu.onchange = (e) => setConfig({ memoriaUnidade: e.target.value });
    // outro lugar (janela <-> Configurações) mudou a config: sincroniza estes controles
    const sync = (c) => {
      const set = (suf, prop, val) => { const el = q(suf); if (el && document.activeElement !== el) el[prop] = val; };
      set('leitura', 'checked', c.mostrarLeitura); set('escrita', 'checked', c.mostrarEscrita);
      set('blidos', 'checked', c.mostrarBytesLidos); set('bgrav', 'checked', c.mostrarBytesGravados);
      set('vel', 'value', String(c.velocidadeMs)); set('mem', 'value', c.memoria); set('memv', 'value', String(c.memoriaValor)); set('memu', 'value', c.memoriaUnidade);
      const r = q('mem-rec'); if (r) r.style.display = c.memoria === 'recente' ? '' : 'none';
      if (!raiz.isConnected) ouvintes.delete(sync);
    };
    ouvintes.add(sync);
  }

  // ------------------------------------------------------- janela + miniatura
  function injetarCss() {
    if (document.getElementById('dbm-css')) return;
    const st = document.createElement('style');
    st.id = 'dbm-css';
    st.textContent = `
      .dbm-panel{position:fixed;left:16px;top:70px;width:560px;max-width:96vw;background:var(--bg-elev,#171b21);color:var(--text,#e7ebf0);border:1px solid var(--border,#2a303a);border-radius:10px;box-shadow:var(--shadow,0 6px 24px rgba(0,0,0,.35));z-index:3000;font-size:12.5px;display:flex;flex-direction:column}
      .dbm-head{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--border,#2a303a);cursor:move;touch-action:none;user-select:none}
      .dbm-head b{flex:1}
      .dbm-body{padding:8px 10px;display:flex;flex-direction:column;gap:6px}
      .dbm-canvas{width:100%;height:200px;display:block;touch-action:none;cursor:grab}
      .dbm-controls{display:flex;flex-direction:column;gap:6px}
      .dbm-row{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
      .dbm-row label{display:inline-flex;align-items:center;gap:5px}
      .dbm-sw{display:inline-block;width:12px;height:12px;border-radius:3px}
      .dbm-sw-tr{background:transparent;border-top:2px dashed;height:0;width:16px;border-radius:0}
      .dbm-resumo{color:var(--text-dim,#9aa4b2);font-size:11.5px}
      .dbm-abas{display:flex;gap:4px;margin:0 0 6px}
      .dbm-aba{font-size:12px;padding:3px 10px;border:1px solid var(--border,#3a4150);border-radius:6px 6px 0 0;background:transparent;color:var(--text-dim,#9aa4b2);cursor:pointer}
      .dbm-aba.ativa{background:var(--accent,#4c8dff);color:#fff;border-color:var(--accent,#4c8dff)}
      .dbm-tab-wrap{max-height:340px;overflow:auto}
      .dbm-tab{width:100%;border-collapse:collapse;font-size:11px}
      .dbm-tab th,.dbm-tab td{padding:2px 6px;border-bottom:1px solid var(--border,#2a303c);text-align:right;white-space:nowrap}
      .dbm-tab th:first-child,.dbm-tab td:first-child{text-align:left;white-space:normal;word-break:break-all}
      .dbm-tab th{position:sticky;top:0;background:var(--panel,#1c212b);color:var(--text-dim,#9aa4b2);font-weight:600}
      .dbm-tab tr.zero td{opacity:.45}
      .dbm-lentas{font-size:11px;color:var(--text-dim,#9aa4b2);max-height:90px;overflow:auto;font-family:monospace}
      .dbm-mini{position:fixed;left:16px;bottom:64px;width:200px;height:66px;background:var(--bg-elev,#171b21);border:1px solid var(--border,#2a303a);border-radius:8px;box-shadow:var(--shadow,0 6px 24px rgba(0,0,0,.35));z-index:3000;cursor:pointer;overflow:hidden}
      .dbm-mini canvas{width:100%;height:100%;display:block}
      .dbm-mini-x{position:absolute;right:2px;top:0;font-size:11px;line-height:14px;padding:0 4px;color:var(--text-dim,#9aa4b2);cursor:pointer;background:transparent;border:0}
    `;
    document.head.appendChild(st);
  }

  function arrastavel(el, handle, chave) {
    let dx = 0, dy = 0, ativo = false, moveu = false, foX = 0, foY = 0, foW = window.innerWidth, foH = window.innerHeight;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button,select,input')) return;
      const r = el.getBoundingClientRect(); const fo = Utils.fixedOrigin(el); foX = fo.x; foY = fo.y; foW = fo.w; foH = fo.h;   // [01/10/2026] 44ª rodada — ver Utils.fixedOrigin (Workspace)
      dx = e.clientX - r.left; dy = e.clientY - r.top; ativo = true; moveu = false;
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
    });
    handle.addEventListener('pointermove', (e) => {
      if (!ativo) return;
      moveu = true;
      el.style.left = Math.max(0, Math.min(foW - 40, e.clientX - dx - foX)) + 'px';
      el.style.top = Math.max(0, Math.min(foH - 30, e.clientY - dy - foY)) + 'px';
      el.style.bottom = 'auto';
    });
    const fimArraste = () => { if (ativo) { ativo = false; posicoes[chave] = { left: el.style.left, top: el.style.top }; } };
    handle.addEventListener('pointerup', fimArraste); handle.addEventListener('pointercancel', fimArraste);
    el.__dbmMoveu = () => moveu;
  }
  const posicoes = {};

  let janelaEl = null, miniEl = null, timer = null, timerFn = null;

  let abaAtiva = 'grafico';
  function mostrarAba() {
    if (!janelaEl) return;
    janelaEl.querySelectorAll('.dbm-aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === abaAtiva));
    janelaEl.querySelectorAll('[data-painel]').forEach((p) => { p.hidden = p.dataset.painel !== abaAtiva; });
  }

  function desenharFuncoes() {
    const corpo = janelaEl && janelaEl.querySelector('#dbmw-f-corpo'); if (!corpo) return;
    const tipo = janelaEl.querySelector('#dbmw-f-tipo').value, ord = janelaEl.querySelector('#dbmw-f-ord').value;
    const lista = [...funcs.values()].filter((f) => tipo === 'todas' || f.tipo === tipo);
    lista.sort((a, b) => (ord === 'nome' ? a.nome.localeCompare(b.nome) : ((b[ord] || 0) - (a[ord] || 0)) || a.nome.localeCompare(b.nome)));
    const t = (v) => (v == null ? '—' : fmtDur(v));
    corpo.innerHTML = lista.map((f) => `<tr class="${f.n ? '' : 'zero'}"><td>${esc(f.nome)}</td><td>${f.tipo === 'espera' ? 'espera do mapa' : 'gravação DB'}</td><td>${f.n}</td><td>${t(f.ultimo)}</td><td>${t(f.min)}</td><td>${t(f.max)}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma função registrada ainda.</td></tr>';
  }

  function redesenharTudo() {
    if (janelaEl && abaAtiva === 'funcoes') desenharFuncoes();
    if (janelaEl && abaAtiva === 'grafico') {
      const s = desenhar(janelaEl.querySelector('.dbm-canvas'), { mini: false });
      const r = janelaEl.querySelector('[data-painel="grafico"] .dbm-resumo'); if (r) r.textContent = resumoTexto(s);
      const cm = janelaEl.querySelector('#dbmw-custo'); if (cm) cm.textContent = 'Custo da própria medição de bytes desde o carregamento: ' + fmtDur(custoMedicaoMs) + '.';
      const l = janelaEl.querySelector('.dbm-lentas');
      if (l) {
        const lista = maisLentas(5);
        l.textContent = lista.length ? ('Transações mais lentas na janela de tempo:\n' + lista.map((e) => `${fmtDur(e.fim - e.ini).padStart(8)}  ${e.modo === 'escrita' ? 'escrita' : 'leitura'}  ${e.stores}${e.rotulo ? '  · ' + e.rotulo : ''}  · ${fmtBytes(e.bytes)}`).join('\n')) : 'Nenhuma transação registrada ainda.';
      }
    }
    if (miniEl) desenhar(miniEl.querySelector('canvas'), { mini: true });
  }

  function aplicarCfg() {
    if (timer) { clearInterval(timer); timer = null; }
    const algoVisivel = !!(janelaEl || miniEl);
    if (algoVisivel && cfg.velocidadeMs > 0) timer = setInterval(redesenharTudo, cfg.velocidadeMs);
    redesenharTudo(); // ao mudar qualquer opção (inclusive pausado) já mostra o estado atualizado
    if (cfg.miniAtiva && !miniEl) criarMini();
    else if (!cfg.miniAtiva && miniEl) { miniEl.remove(); miniEl = null; if (timer && !janelaEl) { clearInterval(timer); timer = null; } }
  }

  function criarMini() {
    injetarCss();
    miniEl = document.createElement('div');
    miniEl.className = 'dbm-mini';
    miniEl.title = 'Monitor do IndexedDB (miniatura) — clique para abrir a janela completa; arraste para mover. Verde = leitura, laranja = escrita.';
    miniEl.innerHTML = '<canvas></canvas><button type="button" class="dbm-mini-x" title="Fechar a miniatura">✕</button>';
    document.body.appendChild(miniEl);
    if (posicoes.mini) { miniEl.style.left = posicoes.mini.left; miniEl.style.top = posicoes.mini.top; miniEl.style.bottom = 'auto'; }
    arrastavel(miniEl, miniEl, 'mini');
    miniEl.addEventListener('click', (e) => { if (e.target.closest('.dbm-mini-x') || miniEl.__dbmMoveu()) return; abrirJanela(); });
    miniEl.querySelector('.dbm-mini-x').onclick = (e) => { e.stopPropagation(); setConfig({ miniAtiva: false }); };
    try { window.Utils?.bringToFront?.(miniEl); } catch (e) { /* ignora */ }
    if (!timer && cfg.velocidadeMs > 0) timer = setInterval(redesenharTudo, cfg.velocidadeMs);
    redesenharTudo();
  }

  async function abrirJanela() {
    await carregarConfig();
    if (janelaEl) { try { window.Utils?.bringToFront?.(janelaEl); } catch (e) { /* ignora */ } return; }
    injetarCss();
    janelaEl = document.createElement('div');
    janelaEl.className = 'dbm-panel';
    janelaEl.innerHTML = `
      <div class="dbm-head"><b>💾 Monitor do IndexedDB</b>
        <button type="button" class="icon-btn sm" id="dbm-mini-btn" title="Mostrar/ocultar a miniatura flutuante do gráfico">🗗</button>
        <button type="button" class="icon-btn sm" id="dbm-fechar" title="Fechar">✕</button></div>
      <div class="dbm-body">
        <!-- [01/10/2026] NOVO — "Coloque estas informações em uma aba a parte." Abas: Gráfico | Funções que gravam. -->
        <div class="dbm-abas">
          <button type="button" class="dbm-aba ativa" data-aba="grafico" title="Gráfico de leituras e gravações no tempo">📈 Gráfico</button>
          <button type="button" class="dbm-aba" data-aba="funcoes" title="Lista de cada função que grava no IndexedDB (e das esperas do mapa), com contador de chamadas e tempos">🧾 Funções que gravam</button>
        </div>
        <div data-painel="funcoes" hidden>
          <div class="dbm-row">
            <label title="Filtra a lista por tipo.">Mostrar
              <select id="dbmw-f-tipo"><option value="todas">Todas</option><option value="espera">Esperas do mapa (_saveMap)</option><option value="gravacao">Gravações no IndexedDB (DB)</option></select></label>
            <label title="Ordem da lista.">Ordenar por
              <select id="dbmw-f-ord"><option value="n">Mais chamadas</option><option value="max">Mais demorado</option><option value="ultimo">Último tempo</option><option value="nome">Nome</option></select></label>
            <button type="button" class="btn secondary sm" id="dbmw-f-zerar" title="Zera contadores e tempos (a lista continua)">↺ Zerar contadores</button>
          </div>
          <div class="dbm-tab-wrap"><table class="dbm-tab"><thead><tr><th>Função / chamador</th><th>Tipo</th><th>Chamadas</th><th title="Tempo da última chamada">Último</th><th title="Menor tempo">Mais rápido</th><th title="Maior tempo">Mais demorado</th></tr></thead><tbody id="dbmw-f-corpo"></tbody></table></div>
          <div class="dbm-resumo">Espera do mapa = tempo que o chamador esperou por <code>_saveMap('nome')</code> (da chamada até a Promise resolver; ~0 ms é o esperado, pois a gravação roda em segundo plano). Gravação = duração real da transação de escrita no IndexedDB (inclui fila do banco). Valores desde o carregamento da página; chamadas sem nome aparecem como "função · arquivo:linha".</div>
        </div>
        <div data-painel="grafico">
        <canvas class="dbm-canvas"></canvas>
        <div class="dbm-resumo"></div>
        <!-- [01/10/2026] NOVO — "Na janela do 'Monitor do IndexedDB' deve ser possível dar 'zoom', de modo que se possa ampliar o que aparece no gráfico. Pois, na maioria das vezes, as variações são muito pequenas." Zoom de TEMPO (roda do mouse / botões; arraste move) e de ESCALA VERTICAL (seletor ou Shift+roda; 'Automática' ajusta ao maior valor visível). -->
        <div class="dbm-row">
          <label title="Teto do eixo vertical (% do tempo ocupado). 'Automática' ajusta ao maior valor visível; valores menores ampliam variações pequenas. Atalho: Shift + roda do mouse sobre o gráfico.">Escala vertical
            <select id="dbmw-yzoom"><option value="auto">Automática</option><option value="1">100%</option><option value="0.5">50%</option><option value="0.2">20%</option><option value="0.1">10%</option><option value="0.05">5%</option><option value="0.02">2%</option><option value="0.01">1%</option></select></label>
          <button type="button" class="btn secondary sm" id="dbmw-zin" title="Ampliar o tempo (zoom in) — também: roda do mouse sobre o gráfico">🔍＋ tempo</button>
          <button type="button" class="btn secondary sm" id="dbmw-zout" title="Reduzir o tempo (zoom out)">🔍－ tempo</button>
          <button type="button" class="btn secondary sm" id="dbmw-live" title="Volta à vista normal (ao vivo, escala automática)">↺ Ao vivo</button>
        </div>
        <div class="dbm-resumo">Roda do mouse = zoom no tempo · Shift + roda = escala vertical · arraste = mover no tempo (a vista fica fixa até clicar em "Ao vivo").</div>
        ${controlsHtml('dbmw')}
        <pre class="dbm-lentas" style="margin:0"></pre>
        <div class="dbm-resumo">Área = % do tempo com ao menos uma transação em andamento (inclui espera na fila do banco). Linhas tracejadas = bytes reais (tamanho serializado do que foi gravado/lido; não é o tamanho em disco). Intervalos já fechados não mudam mais. Os dados são coletados mesmo com a janela fechada.</div>
        <div class="dbm-resumo" id="dbmw-custo"></div>
        </div>
      </div>`;
    document.body.appendChild(janelaEl);
    if (posicoes.janela) { janelaEl.style.left = posicoes.janela.left; janelaEl.style.top = posicoes.janela.top; }
    arrastavel(janelaEl, janelaEl.querySelector('.dbm-head'), 'janela');
    wireControls(janelaEl, 'dbmw');
    ligarZoom(janelaEl);
    janelaEl.querySelectorAll('.dbm-aba').forEach((b) => { b.onclick = () => { abaAtiva = b.dataset.aba; mostrarAba(); redesenharTudo(); }; });
    ['dbmw-f-tipo', 'dbmw-f-ord'].forEach((id) => { const el = janelaEl.querySelector('#' + id); if (el) el.onchange = redesenharTudo; });
    janelaEl.querySelector('#dbmw-f-zerar').onclick = () => { zerarFuncs(); redesenharTudo(); };
    mostrarAba();
    janelaEl.querySelector('#dbm-fechar').onclick = fecharJanela;
    janelaEl.querySelector('#dbm-mini-btn').onclick = () => setConfig({ miniAtiva: !cfg.miniAtiva });
    janelaEl.addEventListener('pointerdown', () => { try { window.Utils?.bringToFront?.(janelaEl); } catch (e) { /* ignora */ } }, true);
    try { window.Utils?.bringToFront?.(janelaEl); } catch (e) { /* ignora */ }
    aplicarCfg();
    avisarBotoes();
  }

  /** Zoom/arrastar da janela: ver comentário em `vista`. */
  function ligarZoom(raiz) {
    const cv = raiz.querySelector('.dbm-canvas');
    const ySel = raiz.querySelector('#dbmw-yzoom');
    const NIVEIS_Y = ['auto', '1', '0.5', '0.2', '0.1', '0.05', '0.02', '0.01'];
    const tempoAtual = () => { const j = janelaDeTempo(performance.now()); return { t0: j.t0, t1: j.t1 }; };
    const zoomTempo = (fator, centroT) => {
      const { t0, t1 } = tempoAtual();
      const c = centroT == null ? (t0 + t1) / 2 : centroT;
      const span = Math.min(24 * 3600000, Math.max(500, (t1 - t0) * fator));
      const f = (c - t0) / (t1 - t0 || 1);
      vista.t0 = c - span * f; vista.t1 = vista.t0 + span;
      redesenharTudo();
    };
    const setY = (v) => { vista.yMax = v; if (ySel) ySel.value = String(v); redesenharTudo(); };
    if (ySel) ySel.onchange = () => setY(ySel.value === 'auto' ? 'auto' : Number(ySel.value));
    raiz.querySelector('#dbmw-zin').onclick = () => zoomTempo(0.5);
    raiz.querySelector('#dbmw-zout').onclick = () => zoomTempo(2);
    raiz.querySelector('#dbmw-live').onclick = () => { vista.t0 = null; vista.t1 = null; setY('auto'); };
    const tempoDoX = (clientX) => {
      const g = cv.__dbmGeom; if (!g) return null;
      const r = cv.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - r.left - g.padL) / g.W));
      return g.t0 + f * (g.t1 - g.t0);
    };
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.shiftKey) {
        const i = Math.max(0, NIVEIS_Y.indexOf(String(vista.yMax)));
        const n = Math.max(0, Math.min(NIVEIS_Y.length - 1, i + (e.deltaY < 0 ? 1 : -1)));
        setY(NIVEIS_Y[n] === 'auto' ? 'auto' : Number(NIVEIS_Y[n]));
      } else zoomTempo(e.deltaY < 0 ? 0.8 : 1.25, tempoDoX(e.clientX));
    }, { passive: false });
    let arr = null;
    cv.addEventListener('pointerdown', (e) => { const { t0, t1 } = tempoAtual(); arr = { x: e.clientX, t0, t1 }; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ } });
    cv.addEventListener('pointermove', (e) => {
      if (!arr) return;
      const g = cv.__dbmGeom; if (!g) return;
      const dt = -((e.clientX - arr.x) / g.W) * (arr.t1 - arr.t0);
      if (Math.abs(e.clientX - arr.x) < 3 && vista.t0 == null) return;
      vista.t0 = arr.t0 + dt; vista.t1 = arr.t1 + dt;
      redesenharTudo();
    });
    const solta = () => { arr = null; };
    cv.addEventListener('pointerup', solta); cv.addEventListener('pointercancel', solta);
  }

  function fecharJanela() {
    if (!janelaEl) return;
    try { window.Utils?.releaseFront?.(janelaEl); } catch (e) { /* ignora */ }
    janelaEl.remove(); janelaEl = null;
    aplicarCfg();
    avisarBotoes();
  }

  function alternarJanela() { if (janelaEl) fecharJanela(); else abrirJanela(); }
  function janelaAberta() { return !!janelaEl; }
  const botoes = new Set();
  function avisarBotoes() { botoes.forEach((fn) => { try { fn(!!janelaEl); } catch (e) { /* ignora */ } }); }

  window.DBMonitor = {
    inicio, fim, instrumentar, espera, declarar, funcoesSnapshot: () => [...funcs.values()].map((f) => ({ ...f })), zerarFuncs, somarBytes, tamanhoSerializado, custoMedicao: () => custoMedicaoMs,
    getConfig: () => ({ ...cfg }), setConfig, carregarConfig,
    controlsHtml, wireControls, desenhar,
    abrirJanela, fecharJanela, alternarJanela, janelaAberta,
    aoMudarJanela(fn) { botoes.add(fn); },
    totais: () => JSON.parse(JSON.stringify(totais)),
    _teste: { grade, calcularSeries, janelaDeTempo, vista, eventos },
    COR, CFG_PADRAO,
  };

  // carrega a config assim que o DB estiver pronto (a 1ª tentativa roda depois do carregamento dos scripts)
  window.addEventListener('load', () => { setTimeout(() => { carregarConfig(); }, 0); });
})();
