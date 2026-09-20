/* js/relogio-mundo.js
 * NOVO (13/09/2026) — RELÓGIO DE TEMPO REAL DO MUNDO. Peça de
 * infraestrutura que faltava, documentada como LIMITAÇÃO em pelo menos 2
 * rodadas anteriores (ver comentários em
 * `assets/modelos/_exemplo-script-robo-copa.txt` e
 * `assets/modelos/_exemplo-script-robo-recepcionista.txt`, que usavam
 * `Date.now()` — hora REAL do navegador — como substituto temporário por
 * falta disto): "o dia avança em tempo real" foi pedido verbatim pelo
 * usuário no backlog geral do prédio, e vários robôs (copa, recepcionista,
 * limpeza) precisam saber que HORAS SÃO no prédio (não no computador do
 * usuário) pra decidir se estão dentro do expediente, na hora do almoço,
 * etc.
 *
 * DECISÃO DE DESIGN — 1 relógio, tempo REAL por padrão, velocidade
 * configurável: o prédio é "24 horas" (documentado em rodada anterior sobre
 * robôs de limpeza) e o pedido foi "avança em tempo real", então o padrão
 * É 1 segundo real = 1 segundo simulado (`velocidade = 1`). Mas testar uma
 * rotina de expediente (08h-18h) esperando o dia inteiro de verdade não é
 * viável pra ninguém testar o app — daí o multiplicador `velocidade`
 * configurável (ex.: 60 => 1 segundo real = 1 minuto simulado, um dia
 * inteiro passa em 24 minutos reais; 3600 => 1 dia inteiro em 24 segundos
 * reais). `velocidade` É PERSISTIDA (é config), mas o RELÓGIO EM SI nunca é
 * persistido/"congelado" — a cada carregamento da página ele decide de novo
 * a hora atual (sincronizando com `new Date()` real, no modo padrão) e daí
 * pra frente sempre anda pra frente sozinho, nunca lido de volta de um
 * "ponto salvo" (isso é DELIBERADO: um relógio simulado que reiniciasse do
 * mesmo horário toda vez que a página recarregasse não seria "tempo real",
 * seria só um cronômetro de sessão).
 *
 * DUAS FONTES DE HORÁRIO INICIAL (ambas configuráveis, ver
 * `RelogioMundo.setConfig`):
 *   - `sincronizarComHoraReal: true` (PADRÃO) — o relógio do mundo começa
 *     EXATAMENTE na hora/dia da semana reais do sistema (`new Date()`) no
 *     instante em que este arquivo carrega, e daí em diante avança em cima
 *     dela multiplicado por `velocidade`. Ou seja, com `velocidade=1`
 *     (padrão), o relógio do mundo effectively RASTREIA o relógio real do
 *     computador do usuário pra sempre (mesma hora, sempre) — que é
 *     exatamente "24 horas, tempo real" pedido.
 *   - `sincronizarComHoraReal: false` — ignora a hora real e sempre começa
 *     em `horaInicialFixa` (ex.: "07:00", string "HH:MM") no dia da semana
 *     atual, útil pra quem quer sempre começar o dia virtual no mesmo
 *     ponto (ex.: testar sempre a partir do início do expediente) —
 *     `velocidade` continua se aplicando a partir daí.
 *
 * O QUE É PERSISTIDO (`DB.getSetting`/`DB.setSetting`, MESMO padrão já
 * usado por `js/mapconfig.js` — confirmado lendo aquele arquivo antes de
 * escrever este) — chave única `relogioMundoConfig`, um objeto com:
 *   velocidade, sincronizarComHoraReal, horaInicialFixa,
 *   horaInicioExpediente, horaAlmocoInicio, horaAlmocoFim,
 *   horaFimExpediente, horaTrocaTurno.
 * NÃO é persistido: a hora atual do relógio em si (ver acima, deliberado).
 *
 * SISTEMA DE EVENTOS — reaproveita o barramento GLOBAL já criado numa
 * rodada anterior (`SceneEventBus.emitGlobal`/`onGlobalEvent`, ver
 * `js/components.js`), em vez de inventar um novo sistema de pub/sub só
 * pro relógio. A cada "tick" (ver `_TICK_MS` abaixo) este módulo comparara
 * o minuto simulado ANTERIOR com o ATUAL e, se algum horário configurado
 * foi cruzado nesse intervalo, emite UMA VEZ (nunca repetidamente enquanto
 * o relógio continuar dentro do mesmo minuto):
 *   - 'inicioExpediente'  — ao cruzar `horaInicioExpediente`
 *   - 'horaAlmoco'        — ao cruzar `horaAlmocoInicio`
 *   - 'fimAlmoco'         — ao cruzar `horaAlmocoFim`
 *   - 'fimExpediente'     — ao cruzar `horaFimExpediente`
 *   - 'trocaDeTurno'      — ao cruzar `horaTrocaTurno` (independente dos
 *                           outros — pensado pro robô recepcionista/guarda
 *                           trocarem de turno num horário PRÓPRIO, que pode
 *                           ou não coincidir com o expediente comum)
 * Cada evento leva como payload `{ hora, minuto, diaDaSemana }` (a hora
 * simulada no instante exato do cruzamento). Qualquer Script de objeto pode
 * escutar via `SceneEventBus.onGlobalEvent('inicioExpediente', fn)` — 100%
 * igual ao padrão já documentado pro elevador
 * (`js/components.js`, comentário "NOVO — BARRAMENTO GLOBAL DE EVENTOS").
 *
 * EXPOSIÇÃO PRO SANDBOX DE SCRIPT — NENHUMA mudança de assinatura foi
 * necessária em `_compileCode`/`_getOrCreateModule` (js/components.js):
 * como já documentado ali (comentário "`SceneEventBus` já é global... todo
 * Script... já ficam acessíveis"), qualquer `window.X` já é visível de
 * dentro de um Script sem precisar ser passado como parâmetro da `Function`
 * — então `window.RelogioMundo` (este módulo) JÁ FICA disponível como
 * `RelogioMundo` dentro de qualquer Start()/Update() de objeto, sem
 * nenhuma mudança em components.js. Ainda assim, por consistência com
 * `ctx.Components`/`ctx.SceneEventBus`/etc. (ver `js/objectassets.js`
 * `buildCtx`), este módulo TAMBÉM foi adicionado a `buildCtx` como
 * `ctx.RelogioMundo` — ver a pequena adição feita lá — pros ganchos
 * onModelSpawn/onModelClick (que recebem `ctx`, não globals soltos por
 * padrão de estilo) também poderem usá-lo sem precisar de `window.`.
 *
 * API PÚBLICA:
 *   RelogioMundo.getHoraAtual() -> { horas, minutos, segundos, diaDaSemana }
 *     diaDaSemana: 0 (domingo) .. 6 (sábado), igual `Date.getDay()`.
 *   RelogioMundo.isHorarioComercial() -> bool (entre horaInicioExpediente
 *     e horaFimExpediente, e NÃO durante o almoço)
 *   RelogioMundo.isHoraAlmoco() -> bool
 *   RelogioMundo.getConfig() -> cópia rasa da config atual
 *   RelogioMundo.setConfig(patch) -> mescla patch na config, persiste
 *     (DB.setSetting) e aplica na hora (ex.: mudar `velocidade` no meio do
 *     dia não reinicia o relógio, só muda a taxa daí pra frente)
 *   RelogioMundo.formatarHora(h) -> "HH:MM" (h = objeto de getHoraAtual()
 *     ou omitido, usa a hora atual)
 *   RelogioMundo.attachHUD(container) -> pluga um pequeno indicador visual
 *     (canto do container, ex. `.view3d-wrap` do "Ver em 3D") mostrando a
 *     hora atual do prédio + status (expediente/almoço/fora do expediente)
 *     e permitindo clicar pra ciclar a velocidade (1x/10x/60x/300x/1x...).
 *     Idempotente — chamar de novo no mesmo container não duplica o HUD.
 *
 * FORMATO — `window.RelogioMundo` (script clássico, mesmo padrão de
 * exposição de js/audio.js/js/geradores-salas.js/etc.), sem depender de
 * nenhum outro arquivo carregar antes (usa `window.DB`/`window.SceneEventBus`
 * só quando disponíveis, com `?.`, pra nunca quebrar se este script por
 * algum motivo carregar antes deles).
 */
(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Config — defaults sensatos, todos ajustáveis via setConfig/HUD.
  // -----------------------------------------------------------------------
  const DEFAULTS = {
    velocidade: 1, // 1 = tempo real (1s real = 1s simulado). 60 = 1s real = 1min simulado. etc.
    sincronizarComHoraReal: true, // true = começa na hora real do sistema; false = usa horaInicialFixa
    horaInicialFixa: '07:00', // usado só quando sincronizarComHoraReal=false
    horaInicioExpediente: '08:00',
    horaAlmocoInicio: '12:00',
    horaAlmocoFim: '13:00',
    horaFimExpediente: '18:00',
    horaTrocaTurno: '18:00', // pode ser igual ou diferente do fim de expediente (turno de guarda/recepção)
  };

  const SETTING_KEY = 'relogioMundoConfig';
  // [15/09/2026 UTC] NOVO — pedido verbatim: "Troque as referências de
  // relógio, no código, relacionadas a ser 'do prédio', pois deve ser 'do
  // mundo' [...] tendo 'RelogioPredio.getHoraAtual()' num mapa novo que
  // não tem um prédio, ficará incoerente." Renomeado `window.RelogioPredio`
  // -> `window.RelogioMundo` e a chave de config persistida
  // `relogioPredioConfig` -> `relogioMundoConfig` em todo o projeto (a lista de arquivos foi atualizada na mesma rodada). Chave antiga mantida aqui só pra 1 leitura de migração (ver
  // `_carregarConfigPersistida` mais abaixo) — sem isso, quem já tinha
  // ajustado `velocidade`/horários no `⚙️` antes desta rodada perderia a
  // configuração ao abrir o app de novo (a chave nova nasceria vazia).
  const SETTING_KEY_ANTIGA = 'relogioPredioConfig';
  const TICK_MS = 250; // granularidade de checagem — fino o bastante pra não perder cruzamento de minuto mesmo em velocidade alta

  let _config = { ...DEFAULTS };

  // Estado interno do relógio "ao vivo" — NUNCA persistido (ver comentário
  // grande no topo do arquivo sobre por quê).
  let _baseRealMs = Date.now(); // Date.now() no instante em que a base foi (re)fixada
  let _baseSimMs = 0; // ms-do-dia simulados (0..86399999) no instante _baseRealMs
  let _baseDiaSemana = new Date().getDay();
  let _ultimoMinutoChecado = -1; // minuto-do-dia (0..1439) já checado p/ eventos, evita disparo repetido

  function _horaStrParaMinutos(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return 0;
    return (Number(m[1]) % 24) * 60 + (Number(m[2]) % 60);
  }

  function _minutosParaHoraStr(totalMin) {
    const h = Math.floor(totalMin / 60) % 24;
    const m = Math.floor(totalMin) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Fixa a base do relógio a partir da config atual (chamado na
   *  inicialização e sempre que `sincronizarComHoraReal`/`horaInicialFixa`
   *  mudam via setConfig — nunca chamado só por `velocidade` mudar, pra não
   *  "pular" a hora atual ao só acelerar/desacelerar). */
  function _refixarBase() {
    const agora = new Date();
    _baseRealMs = agora.getTime();
    if (_config.sincronizarComHoraReal) {
      _baseSimMs = (agora.getHours() * 3600 + agora.getMinutes() * 60 + agora.getSeconds()) * 1000 + agora.getMilliseconds();
      _baseDiaSemana = agora.getDay();
    } else {
      _baseSimMs = _horaStrParaMinutos(_config.horaInicialFixa) * 60000;
      _baseDiaSemana = agora.getDay();
    }
    _ultimoMinutoChecado = -1; // reseta a checagem de eventos pra não disparar tudo de uma vez na hora nova
  }

  /** Recalcula a hora simulada ATUAL a partir da base + tempo real
   *  decorrido * velocidade. Não muta `_baseRealMs`/`_baseSimMs` (isso só
   *  acontece em `_refixarBase`, chamada raramente) — evita acúmulo de
   *  erro de arredondamento a cada tick. */
  function _calcularAgora() {
    const decorridoReal = Date.now() - _baseRealMs;
    const decorridoSim = decorridoReal * (Number(_config.velocidade) || 1);
    const totalSimMs = _baseSimMs + decorridoSim;
    const diasPassados = Math.floor(totalSimMs / 86400000);
    const msNoDia = ((totalSimMs % 86400000) + 86400000) % 86400000; // sempre positivo
    const diaDaSemana = ((_baseDiaSemana + diasPassados) % 7 + 7) % 7;
    const totalSeg = Math.floor(msNoDia / 1000);
    return {
      horas: Math.floor(totalSeg / 3600) % 24,
      minutos: Math.floor(totalSeg / 60) % 60,
      segundos: totalSeg % 60,
      diaDaSemana,
      _minutoDoDia: Math.floor(msNoDia / 60000), // uso interno (checagem de eventos)
    };
  }

  function getHoraAtual() {
    const h = _calcularAgora();
    return { horas: h.horas, minutos: h.minutos, segundos: h.segundos, diaDaSemana: h.diaDaSemana };
  }

  function isHoraAlmoco() {
    const h = _calcularAgora();
    const minAtual = h._minutoDoDia;
    const ini = _horaStrParaMinutos(_config.horaAlmocoInicio);
    const fim = _horaStrParaMinutos(_config.horaAlmocoFim);
    return minAtual >= ini && minAtual < fim;
  }

  function isHorarioComercial() {
    const h = _calcularAgora();
    const minAtual = h._minutoDoDia;
    const ini = _horaStrParaMinutos(_config.horaInicioExpediente);
    const fim = _horaStrParaMinutos(_config.horaFimExpediente);
    if (minAtual < ini || minAtual >= fim) return false;
    return !isHoraAlmoco();
  }

  function formatarHora(h) {
    const hh = h || getHoraAtual();
    return `${String(hh.horas).padStart(2, '0')}:${String(hh.minutos).padStart(2, '0')}`;
  }

  function getConfig() {
    return { ..._config };
  }

  function setConfig(patch) {
    if (!patch || typeof patch !== 'object') return getConfig();
    const precisaRefixar = ('sincronizarComHoraReal' in patch) || ('horaInicialFixa' in patch);
    _config = { ..._config, ...patch };
    if (precisaRefixar) _refixarBase();
    window.DB?.setSetting?.(SETTING_KEY, _config).catch?.(() => {});
    _atualizarHUDs();
    return getConfig();
  }

  // -----------------------------------------------------------------------
  // Checagem/disparo de eventos — 1x por cruzamento de horário configurado,
  // via SceneEventBus.emitGlobal (mesmo barramento já usado pelo elevador).
  // -----------------------------------------------------------------------
  function _checarEventos() {
    const h = _calcularAgora();
    const minAtual = h._minutoDoDia;
    if (_ultimoMinutoChecado === minAtual) return; // ainda no mesmo minuto simulado, nada a checar
    const anterior = _ultimoMinutoChecado;
    _ultimoMinutoChecado = minAtual;
    if (anterior < 0) return; // primeira checagem depois de (re)fixar a base — não dispara nada retroativo

    const payload = { hora: h.horas, minuto: h.minutos, diaDaSemana: h.diaDaSemana };
    const marcos = [
      ['horaInicioExpediente', 'inicioExpediente'],
      ['horaAlmocoInicio', 'horaAlmoco'],
      ['horaAlmocoFim', 'fimAlmoco'],
      ['horaFimExpediente', 'fimExpediente'],
      ['horaTrocaTurno', 'trocaDeTurno'],
    ];
    // Cruzou de `anterior` (exclusivo) até `minAtual` (inclusivo), dentro do
    // mesmo dia (não trata virada de dia entre 2 ticks — TICK_MS=250ms com
    // velocidade default até 300x avança no máximo ~1,25min por tick, nunca
    // pula um dia inteiro; velocidades absurdamente maiores que isso não são
    // um caso de uso real deste app e ficam fora de escopo).
    for (const [chaveConfig, nomeEvento] of marcos) {
      const alvo = _horaStrParaMinutos(_config[chaveConfig]);
      const cruzou = minAtual > anterior ? (alvo > anterior && alvo <= minAtual) : (alvo > anterior || alvo <= minAtual); // cobre virada 23:59->00:00
      if (cruzou) window.SceneEventBus?.emitGlobal?.(nomeEvento, payload);
    }
  }

  // -----------------------------------------------------------------------
  // HUD opcional — pequeno indicador visual, plugável em qualquer container
  // (pensado pro `.view3d-wrap` do "Ver em 3D", ao lado do HUD de FPS/pos).
  // -----------------------------------------------------------------------
  const _CICLO_VELOCIDADES = [1, 10, 60, 300];
  const _huds = new Set(); // elementos já plugados, pra _atualizarHUDs saber quem redesenhar

  function _statusTexto() {
    if (isHoraAlmoco()) return 'Almoço';
    if (isHorarioComercial()) return 'Expediente';
    return 'Fora do expediente';
  }

  function _atualizarHUDs() {
    if (!_huds.size) return;
    const h = getHoraAtual();
    const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    for (const el of _huds) {
      if (!el.isConnected) { _huds.delete(el); continue; }
      const relogioEl = el.querySelector('[data-rp-hora]');
      const statusEl = el.querySelector('[data-rp-status]');
      const velEl = el.querySelector('[data-rp-vel]');
      if (relogioEl) relogioEl.textContent = `🕐 ${DIAS[h.diaDaSemana]} ${formatarHora(h)}`;
      if (statusEl) statusEl.textContent = _statusTexto();
      if (velEl) velEl.textContent = `${_config.velocidade}x`;
    }
  }

  // [13/09/2026] MOVIDO — pedido verbatim: "A caixa com a hora e o texto
  // 'Expediente'/'Fora de expediente' deve ficar do lado esquerdo da roda
  // dos pontos cardeais. Pois, atualmente, está em baixo do botão 'Sair em
  // 3D'." CAUSA RAIZ: esta caixa nascia com `top:8px;left:8px` (canto
  // superior esquerdo do `.view3d-wrap`), mesma região onde o botão
  // "✕ Sair do 3D" (id="v3d-close", view3d.js ~linha 395) já fica — ele não
  // tem posição fixa própria, só nasce cedo no fluxo normal do topo/canto
  // esquerdo de um toolbar, então os dois acabavam se sobrepondo.
  // CORRIGIDO: reposicionado pra encostar à ESQUERDA da roda da bússola
  // (`.v3d-compass-ring`, css/style.css ~linha 3238), que tem posição
  // conhecida e fixa: `top:78px; right:96px`, raio `--v3d-compass-r:62px`
  // encolhido por `transform:scale(.8)` → raio efetivo em tela
  // 62*0.8=49.6px, ou seja a roda ocupa aprox. de `right:46px` até
  // `right:146px`, centralizada verticalmente em `top:78px`. Usando o mesmo
  // `top:78px` (mesmo ancestral posicionado `.view3d-wrap`, já
  // `position:relative`) e `right:156px` (146px de borda externa da roda +
  // ~10px de respiro), a caixa fica logo à esquerda da roda sem
  // sobrepor. Como esta caixa (ao contrário da roda, que é width:0/height:0)
  // tem altura de verdade (padding + 3 linhas de texto), usamos
  // `transform:translateY(-50%)` pra centralizá-la verticalmente sobre
  // `top:78px` do mesmo jeito que a roda fica centralizada ali (a roda usa
  // `translate(-50%,-50%)` nos filhos a partir do próprio ponto zero).
  // Não tentamos reagir dinamicamente à bússola estar oculta (opção
  // "🧭 Bússola 3D" / `.v3d-compass-ring.hidden`, ver
  // `_applyBussola3DVisibilidade` em view3d.js) — pedido do usuário é só
  // "colocar do lado esquerdo da roda", posição fixa mesmo que a roda
  // esteja desligada, no mesmo espírito simples do resto do HUD deste app.
  // Todo o resto do estilo (background/cor/fonte/padding/border-radius/
  // pointer-events/cursor/user-select) permanece IDÊNTICO — só a
  // posição (top/left→right) e a nova `transform` mudaram.
  function attachHUD(container) {
    if (!container || container.querySelector?.('.relogio-mundo-hud')) return; // idempotente
    const el = document.createElement('div');
    el.className = 'relogio-mundo-hud';
    el.style.cssText = 'position:absolute;top:78px;right:156px;transform:translateY(-50%);z-index:20;background:rgba(0,0,0,.55);color:#fff;font:12px/1.4 monospace;padding:6px 9px;border-radius:6px;pointer-events:auto;cursor:pointer;user-select:none;';
    // [13/09/2026 UTC] Rótulo visível ajustado de "Relógio do prédio" pra
    // "Relógio do mundo" — correção explícita do usuário: este relógio,
    // quando usado pelo botão "Seguir relógio do mundo" (mapconfig.js),
    // representa a hora de TODO o cenário 3D, não só do prédio. O nome
    // interno do módulo/global (`RelogioMundo`) e a lógica de
    // expediente/almoço (legitimamente sobre o prédio, usada por scripts
    // de NPC) não mudaram — só este texto voltado ao usuário.
    el.title = 'Relógio do mundo (tempo real) — clique pra mudar a velocidade de simulação';
    el.innerHTML = '<div data-rp-hora></div><div data-rp-status style="opacity:.85"></div><div data-rp-vel style="opacity:.6"></div>';
    el.addEventListener('click', () => {
      const idx = _CICLO_VELOCIDADES.indexOf(Number(_config.velocidade));
      const prox = _CICLO_VELOCIDADES[(idx + 1) % _CICLO_VELOCIDADES.length] || 1;
      setConfig({ velocidade: prox });
    });
    (container.style && (container.style.position || (container.style.position = 'relative')));
    container.appendChild(el);
    _huds.add(el);
    _atualizarHUDs();
  }

  // -----------------------------------------------------------------------
  // Inicialização — carrega config persistida (se houver), fixa a base, e
  // liga o loop de checagem de eventos (independente de qualquer HUD estar
  // plugado — os robôs precisam dos eventos mesmo sem ninguém olhando pra
  // tela do "Ver em 3D").
  // -----------------------------------------------------------------------
  _refixarBase();
  setInterval(() => { _checarEventos(); _atualizarHUDs(); }, TICK_MS);

  (async function _carregarConfigPersistida() {
    try {
      let salva = await window.DB?.getSetting?.(SETTING_KEY, null);
      // [15/09/2026 UTC] NOVO — migração 1x da chave antiga (ver comentário
      // grande em `SETTING_KEY_ANTIGA` acima): só entra aqui se a chave NOVA
      // ainda não existir (`salva` null) — depois da 1ª vez, `setConfig`
      // já grava tudo na chave nova e este bloco nunca mais encontra nada
      // pra migrar (`salva` da chave nova deixa de ser null).
      if (!salva) {
        const antiga = await window.DB?.getSetting?.(SETTING_KEY_ANTIGA, null);
        if (antiga && typeof antiga === 'object') {
          salva = antiga;
          window.DB?.setSetting?.(SETTING_KEY, antiga).catch?.(() => {});
        }
      }
      if (salva && typeof salva === 'object') {
        const precisaRefixar = ('sincronizarComHoraReal' in salva) || ('horaInicialFixa' in salva);
        _config = { ...DEFAULTS, ...salva };
        if (precisaRefixar) _refixarBase();
      }
    } catch (err) {
      console.warn('[RelogioMundo] não foi possível carregar config persistida, usando defaults:', err);
    }
  })();

  window.RelogioMundo = {
    getHoraAtual,
    isHorarioComercial,
    isHoraAlmoco,
    getConfig,
    setConfig,
    formatarHora,
    attachHUD,
  };
})();
