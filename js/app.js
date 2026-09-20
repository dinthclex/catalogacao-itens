/**
 * app.js — Controlador principal: roteamento entre views, modal de detalhe/edição
 * de item, inicialização do app (PWA, service worker, configurações).
 */

const App = {
  currentView: 'tabela',
  sensorTracker: null,
  mapaModo: 'manual',

  // Pedido do usuário: "faça com que os scrolls do app sejam preservados...
  // abre-se um menu, rola um pouco e, depois, fecha esse menu. Ao abri-lo
  // novamente está voltando ao topo." — cada troca de tela (navigate()) faz
  // `container.innerHTML = ''` e remonta do zero (ver navigate() abaixo),
  // então o scroll de `#view` sempre voltava a 0. Guarda aqui, em memória
  // (por isso "só é resetado quando recarrega a página" — objeto comum, não
  // localStorage/DB), o scrollTop de cada tela na hora de SAIR dela, e
  // devolve na hora de voltar. Chave = nome da view (ex: 'configuracoes').
  _viewScrollMemory: {},

  // Pilha de "de onde vim" pros botões "✕ Fechar" (Configurações/Unificar —
  // ver navigate()/back() abaixo). Pedido do usuário, 26/08/2026: relatou um
  // CICLO — "Unificar fontes diferentes" -> Fechar -> Configurações ->
  // Fechar -> devolvia pra "Unificar" em vez de sair de vez. Causa: a versão
  // antiga usava uma ÚNICA variável (`_prevView`), sobrescrita em TODA
  // navegação — inclusive as causadas pelos próprios botões "Fechar", que
  // apagavam de onde o usuário tinha vindo ANTES de abrir Configurações
  // (Tabela) e colocavam "Unificar" no lugar. Uma pilha de verdade resolve
  // pra qualquer profundidade de telas com "Fechar" (não só este par).
  _navStack: [],

  views: {
    tabela: TableView,
    flashcards: FlashcardsView,
    capturar: CaptureView,
    mapa: MapView,
    buscar: SearchView,
    configuracoes: SettingsView,
    unificar: UnifyView,
    // NOVO (01/09/2026), item GRANDE #5 do pedido de 12 itens — rota da tela
    // "🛠️ Acessar modelos" (ver js/modelos3d.js), aberta pelo botão dentro
    // do painel de Objetos do Mapa (decisão do usuário via AskUserQuestion:
    // "No painel de Objetos do mapa", não em Configurações do app).
    modelos3d: Modelos3DView,
    // NOVO (07/09/2026), pedido verbatim: "layout estilo Blender [...]
    // Crie um layout de interface modular, redimensionável e baseada em
    // blocos (tiled workspace)." — ver js/bsplayout.js (window.BSPLayout)
    // pra estrutura de estado/árvore comentada. Segue o MESMO contrato
    // mount(container)/unmount() de qualquer outra tela — nada de especial
    // precisou mudar aqui em `navigate()` pra acomodar o Workspace.
    workspace: BSPLayout,
    // [15/09/2026 UTC] NOVO — pedido verbatim: "ao selecionar 'Mapeamento
    // de ambientes', os botões do rodapé devem adquirir uma nova
    // configurações. A botão 'Tabela' deve ser trocado pelo botão '3D'. O
    // botão 'Cartões' deve ser trocado pelo botão 'Caixa'." — o rodapé do
    // modo Clássico (ver js/classicmode.js) chama `App.navigate(view)`
    // igual a qualquer outro botão dele, então 'ver3d'/'caixa' precisam
    // existir aqui com o MESMO contrato `mount(container)`/`unmount()` —
    // adaptadores finos em cima de `View3D`/`PhotoGrid`, que já
    // implementavam a mesma tela pro painel 'Botões'/'Telas' do Workspace
    // (ver `EDITOR_TYPES.ver3d`/`EDITOR_TYPES.caixa` em bsplayout.js —
    // MESMOS módulos reaproveitados, nenhuma tela nova). `View3D.mount`
    // precisa de `{ ambienteId }` (não existe um "mapa atual" implícito
    // fora do Mapa/Workspace) — usa `DB.getOrCreateSingleMap()`, a MESMA
    // fonte que `MapView`/`PhotoGrid` já usam pra decidir "o" mapa quando
    // não veio de um contexto mais específico.
    ver3d: {
      async mount(container) {
        const map = await DB.getOrCreateSingleMap();
        await View3D.mount(container, { ambienteId: map.id });
      },
      unmount() { try { View3D.unmount?.(); } catch (e) { console.warn('[App] falha ao desmontar "3D" (rodapé):', e); } },
    },
    caixa: {
      async mount(container) {
        await PhotoGrid.mountCaixaScreen(container, { onClose: () => App.back('tabela') });
        return PhotoGrid;
      },
      // `App.navigate()` chama `prev.unmount()` SEM argumento nenhum (ver
      // mais abaixo) — ao contrário do painel 'Botões'/'Telas' do
      // Workspace (bsplayout.js), que passa a instância de volta pro
      // `unmount(instance)`. `PhotoGrid.unmountCaixaScreen()` já é um
      // método estático sem estado próprio (hoje um no-op — ver
      // photogrid.js), então chamar direto no módulo (em vez de esperar
      // um `instance`, que nunca chega aqui) é equivalente e correto.
      unmount() { try { PhotoGrid.unmountCaixaScreen?.(); } catch (e) { console.warn('[App] falha ao desmontar "Caixa" (rodapé):', e); } },
    },
  },

  titles: {
    tabela: 'Catalogação de Itens', flashcards: 'Cartões', capturar: 'Foto', // [15/09/2026 UTC] MUDADO — pedido verbatim: "Mudar nome do botão 'Fotos' para 'Foto'. Preserve o ícone."
    mapa: 'Mapa do ambiente', buscar: 'Buscar item', configuracoes: 'Configurações',
    unificar: 'Unificar conferência', modelos3d: 'Modelos 3D',
    workspace: 'Workspace',
    ver3d: 'Visualização 3D', caixa: 'Caixa', // [15/09/2026 UTC] NOVO — títulos das 2 telas novas do rodapé em "Mapeamento de ambientes" (ver views.ver3d/views.caixa acima).
  },

  async init() {
    this._wireNav(); // liga os cliques dos botões (idempotente — seguro chamar de novo em "tentar novamente")
    this._initSaveStatusBar(); // mensagem "salvando.../salvo ✓" no topo (pedido do usuário) — ver método abaixo
    await this._boot();
  },

  /** Mensagem avisando quando algo está sendo salvo e quando já foi salvo —
   *  E ONDE (pedido do usuário: "localStorage, cookies, DB do navegador,
   *  etc"). Toda gravação de verdade do app passa por `db.js` `tx()` num
   *  modo 'readwrite' (addItem/updateItem/deleteItem/saveMap/setSetting/...
   *  — TODOS os métodos de escrita, sem exceção — ver comentário grande ali)
   *  — então um único listener aqui (DB.onSaveStatus) cobre a gravação do
   *  app inteiro (item, mapa, configuração, o que for), não só uma tela
   *  específica. Elemento próprio, POR CIMA de qualquer cabeçalho (inclusive
   *  o do Mapa, que troca o cabeçalho padrão por um próprio — ver
   *  mapview.js) — estilo 100% inline (não usa `style.css`), fixo, sempre
   *  visível não importa a tela atual.
   *  Fica: "💾 Salvando…" enquanto a gravação está em voo; ao concluir,
   *  "✅ Salvo — <onde>" (a mensagem some sozinha depois de alguns segundos —
   *  o AVISO de "acabou de salvar" é o que importa, não um rótulo permanente
   *  ocupando espaço na tela pra sempre). Num erro, fica "⚠️ Falha ao salvar —
   *  <onde>" e NÃO some sozinho (precisa que a pessoa note).
   *
   *  Pedido do usuário (rodada seguinte): "não há problema em ir mostrando
   *  as mensagens... são muitas coisas saltando na tela... essas mudanças
   *  devem aparecer em um lugar fixo para evitar ficar saltando no topo da
   *  tela toda hora" — ou seja, a FREQUÊNCIA das mensagens está OK (cada
   *  mudança isolada + a gravação em si continuam avisando normalmente),
   *  o problema era a ANIMAÇÃO: antes, o selo entrava DESLIZANDO de fora da
   *  tela (`translateY(-120%)` até `0`), descendo por CIMA do cabeçalho da
   *  tela atual toda vez que aparecia — com uma gravação por mudança isso
   *  acontece o tempo todo, parecendo o selo inteiro "pulando" pra dentro/
   *  fora da tela sem parar. Agora o selo fica num canto fixo (topo direito,
   *  sempre à mesma distância da borda, nunca em cima do cabeçalho central
   *  de nenhuma tela) e só troca de aparência com uma transição de OPACIDADE
   *  (aparece/desaparece no lugar, nunca se desloca) — mesmo texto/cores de
   *  antes, só a animação/posição mudaram. */
  _initSaveStatusBar() {
    if (this._saveStatusEl) return; // idempotente, mesmo espírito de _wireNav
    const host = document.createElement('div');
    host.id = 'save-status-host';
    host.style.cssText = [
      'position:fixed', 'top:calc(8px + env(safe-area-inset-top,0))', 'right:calc(8px + env(safe-area-inset-right,0))',
      'z-index:9999', 'pointer-events:none', 'display:flex', 'flex-direction:column', 'align-items:flex-end', 'gap:4px',
    ].join(';');
    document.body.appendChild(host);
    const el = document.createElement('div');
    el.id = 'save-status-bar';
    el.style.cssText = [
      'opacity:0',
      'padding:4px 14px', 'border-radius:10px',
      'font:600 12px/1.4 sans-serif', 'color:#0a0d11', 'background:#7cffb2',
      'box-shadow:0 2px 8px rgba(0,0,0,.35)', 'pointer-events:none',
      'transition:opacity .25s ease, background-color .25s ease',
      'white-space:nowrap', 'max-width:60vw', 'overflow:hidden', 'text-overflow:ellipsis',
    ].join(';');
    host.appendChild(el);
    // Barrinha de progresso do "modo em lote" (pedido do usuário v310: itens
    // 1-3 — ver comentário grande logo abaixo de `setBulkSaveStatus`) — fica
    // dentro do MESMO host fixo do selo acima, logo abaixo dele, escondida
    // (opacity:0) exceto quando `setBulkSaveStatus` recebe `current`/`total`.
    const barWrap = document.createElement('div');
    barWrap.id = 'save-status-progress-wrap';
    barWrap.style.cssText = [
      'opacity:0', 'width:180px', 'max-width:60vw', 'height:6px', 'border-radius:4px',
      'background:rgba(0,0,0,.25)', 'overflow:hidden', 'box-shadow:0 2px 8px rgba(0,0,0,.3)',
      'transition:opacity .25s ease',
    ].join(';');
    const barFill = document.createElement('div');
    barFill.id = 'save-status-progress-fill';
    barFill.style.cssText = 'height:100%; width:0%; background:#4f8cff; transition:width .2s ease;';
    barWrap.appendChild(barFill);
    host.appendChild(barWrap);
    this._saveStatusEl = el;
    this._saveStatusBarWrap = barWrap;
    this._saveStatusBarFill = barFill;
    this._saveStatusHideTimer = null;
    this._bulkSaveActive = false; // ver comentário grande em setBulkSaveStatus abaixo
    const show = (text, bg) => {
      clearTimeout(this._saveStatusHideTimer);
      el.textContent = text;
      el.style.background = bg;
      el.style.opacity = '1';
    };
    const hideLater = (ms) => {
      clearTimeout(this._saveStatusHideTimer);
      this._saveStatusHideTimer = setTimeout(() => { el.style.opacity = '0'; }, ms);
    };
    this._saveStatusShow = show;
    this._saveStatusHideLater = hideLater;
    DB.onSaveStatus((status, info) => {
      // Pedido do usuário (v310): "'Salvo IndexedDB' (verde) acaba cobrindo
      // a outra mensagem 'Salvando...' (azul)". Não são dois toasts
      // empilhados — é o MESMO elemento reaproveitado — mas numa gravação em
      // LOTE (ex.: importar backup com centenas de itens), cada item dispara
      // seu próprio 'saving'→'saved' em sequência rápida, e o 'saved' verde
      // do item anterior mal termina de aparecer quando o 'saving' azul do
      // próximo já troca de novo — na prática o selo fica quase sempre
      // verde "por cima" do azul. Enquanto o "modo em lote" está ativo (ver
      // `setBulkSaveStatus`), quem controla o texto/cor é quem chamou esse
      // modo (ex.: #st-import em settings.js, com "Salvando (N/total)…" +
      // barrinha) — os eventos individuais de 'saving'/'saved' por item são
      // ignorados aqui pra não brigar com essa mensagem. Erros SEMPRE
      // aparecem, em lote ou não.
      if (this._bulkSaveActive && status !== 'error') return;
      if (status === 'saving') {
        show('💾 Salvando…', '#4f8cff');
      } else if (status === 'saved') {
        // NOVO (07/09/2026), pedido verbatim: "mude até a cor do fundo da
        // notificação" quando estiver rodando em servidor local — verde
        // (#7cffb2) continua só pro caso 100% IndexedDB (sem servidor);
        // com servidor configurado, um tom diferente (azul-petróleo) deixa
        // visualmente claro que o destino mudou, mesmo antes de ler o texto
        // (info.where/info.servidorAtivo vêm de db.js, ver _emitSaveStatus).
        show(`✅ Salvo — ${info.where}`, info.servidorAtivo ? '#5fd0c8' : '#7cffb2');
        hideLater(2500);
      } else if (status === 'error') {
        show(`⚠️ Falha ao salvar — ${info.where}`, '#ff6b6b');
        // não some sozinho — erro precisa ser notado (ver Utils.toast já
        // disparado à parte por _notifyDbError, este aqui é só o resumo fixo)
      }
    });
  },

  /** Liga o "modo em lote" do selo de salvamento (ver comentário grande
   *  dentro de `_initSaveStatusBar` acima, no listener de `DB.onSaveStatus`)
   *  — usado por qualquer fluxo que grave/leia MUITAS coisas em sequência
   *  (hoje: importação de backup em settings.js, #st-import) pra mostrar UMA
   *  mensagem estável de progresso ("Lendo (2/7)…", "Salvando (14/230)…") em
   *  vez de deixar `DB.onSaveStatus` piscar azul/verde a cada gravação
   *  individual.
   *  `opts.current`/`opts.total`: se ambos vierem definidos (>0), mostra
   *  também a barrinha de progresso proporcional; omitir pra só mostrar o
   *  texto (ex.: fase de LEITURA dos arquivos escolhidos, antes de saber
   *  quantos itens no total vão ser gravados — é justamente essa fase, hoje
   *  silenciosa, que faz a pergunta de "substituir mapas?" parecer surgir
   *  "do nada", pedido do usuário item 3 — ver settings.js). `opts.bg` troca
   *  a cor (padrão azul, mesma do "Salvando…" de sempre). */
  setBulkSaveStatus(text, { current, total, bg = '#4f8cff' } = {}) {
    if (!this._saveStatusEl) this._initSaveStatusBar();
    this._bulkSaveActive = true;
    this._saveStatusShow(text, bg);
    if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
      const pct = Math.max(0, Math.min(100, (current / total) * 100));
      this._saveStatusBarFill.style.width = pct + '%';
      this._saveStatusBarWrap.style.opacity = '1';
    } else {
      this._saveStatusBarWrap.style.opacity = '0';
    }
  },

  /** Desliga o "modo em lote" (ver `setBulkSaveStatus` acima) — devolve o
   *  selo pro comportamento normal (reage de novo a `DB.onSaveStatus` por
   *  gravação individual) e some com a barrinha de progresso. Quem chama
   *  normalmente já dispara seu próprio `Utils.toast` de resumo ("Backup
   *  importado ✓ — ...") logo em seguida — este método só limpa o selo
   *  fixo, não substitui esse resumo. */
  clearBulkSaveStatus() {
    this._bulkSaveActive = false;
    if (this._saveStatusBarWrap) this._saveStatusBarWrap.style.opacity = '0';
    if (this._saveStatusEl) this._saveStatusHideLater?.(400);
  },

  /** Liga a navegação uma única vez. Não depende do banco de dados nem de mais nada. */
  _wireNav() {
    if (this._navWired) return;
    this._navWired = true;
    // REMOVIDO (08/09/2026), pedido verbatim: "O 'cabeçalho' e o 'rodapé'
    // do app não devem existir mais do jeito antigo (apenas HTML)."/"Agora
    // o rodapé deve desaparecer [...] e a tela 'Botões' é que deve ficar
    // ali em baixo." — o <nav class="bottomnav"> de verdade foi removido
    // de index.html; o clique dos botões (chamar App.navigate) agora é
    // ligado diretamente dentro de EDITOR_TYPES.botoes.mount()
    // (js/bsplayout.js), já que os botões são recriados toda vez que essa
    // divisão é montada — não faz mais sentido religar aqui uma única vez
    // no boot.
    // NOVO (08/09/2026): botão de emergência sempre visível
    // (#bsp-shell-reset-btn, index.html, FORA do sistema de divisões) —
    // restaura o layout padrão (Info/Conteúdo/Botões) se a pessoa fechar
    // a divisão 'Info' sem querer e ficar sem a barra de controles de
    // layout (único jeito de voltar, nesse caso).
    document.getElementById('bsp-shell-reset-btn')?.addEventListener('click', () => {
      this._safe('BSPLayout.resetToDefault', () => BSPLayout.resetToDefault());
    });
    // REMOVIDO (08/09/2026), pedido verbatim: "O dropdown dentro da tela de
    // 'Info' deve ser eliminado." — o <select id="topbar-info-select"> (e
    // todo o wiring dele aqui) foi removido junto com `_infoMode`/
    // `_enterInfoMode`/`_exitInfoMode` logo abaixo. Era redundante com o
    // dropdown próprio de cada folha do BSP (.bsp-leaf-select, já tem a
    // opção "ℹ️ Info") e era a causa raiz confirmada de 3 bugs relatados
    // juntos: escolher outra opção nele chamava `_exitInfoMode()`, que
    // zerava a barra de 4 botões de layouts (`#topbar-info-layoutbar`) e
    // desligava `_infoMode` — do qual `BSPLayout._renderInfoBarControls()`
    // dependia pra desenhar aquele botão. Como nada no sistema NOVO (a
    // folha 'info' do BSP, sempre presente desde a rearquitetura) voltava
    // a ligar `_infoMode`, a barra ficava permanentemente vazia depois da
    // 1ª troca — mesmo voltando pra 'Info' pelo dropdown de cada folha.
    // Ver comentário grande em index.html/bsplayout.js.
    document.getElementById('btn-verlista-top').onclick = () => this._showListaSimplesGlobal();
    // SUBSTITUÍDO (09/09/2026), pedido verbatim: "Em 'Info', ao clicar em
    // 'Configurações do app' (o ícone) a tela de 'configurações do app'
    // não está abrindo, deve abrir em tela cheia." — a rodada anterior
    // (08/09/2026) tinha corrigido `BSPLayout.revealEditorType` pra
    // RECRIAR a folha 'configuracoes' se ela não existisse mais na árvore
    // ativa (bug real, documentado no changelog), mas o pedido agora é
    // outro: em vez de revelar/redimensionar uma DIVISÃO do BSP (que ainda
    // podia ficar pequena, atrás de outro painel, ou simplesmente passar
    // despercebida — daí o "não está abrindo" mesmo já funcionando por
    // baixo), o botão passa a abrir Configurações como uma SOBREPOSIÇÃO EM
    // TELA CHEIA de verdade (`_openSettingsFullscreen`, logo abaixo — MESMO
    // padrão de 'foto'/'organizar', ver EDITOR_TYPES em js/bsplayout.js),
    // sempre visível e óbvia, igual o pedido descreve. `EDITOR_TYPES.
    // configuracoes` continua existindo em bsplayout.js pra quem quiser
    // ATRIBUIR "⚙️ Configurações" manualmente ao dropdown de uma divisão
    // (uso avançado) — só o botão ⚙️ do cabeçalho global mudou de
    // comportamento.
    document.getElementById('btn-settings-top').onclick = () => this._openSettingsFullscreen();
    // Pedido do usuário (31/08/2026): botão "Ajuda" saiu da barra de
    // ferramentas do Mapa (só aparecia lá dentro) e foi pro cabeçalho
    // global, ao lado de "⚙️ Configurações" — ver index.html e a nota
    // grande em mapview.js (_toggleHelpMenu). O conteúdo (popover com "Log
    // de alterações"/"Sobre") continua morando em MapView; só o botão que
    // dispara mudou de lugar.
    document.getElementById('btn-ajuda-top').onclick = (e) => window.MapView?._toggleHelpMenu?.(e.currentTarget);
    // NOVO (09/09/2026), pedido verbatim: "Faça um transicionador fácil e
    // rápido entre os dois modos de visualização do app BSP/dockable ou o
    // outro jeito." — ver js/classicmode.js (window.ClassicMode). Este
    // botão fica no MESMO cabeçalho global que viaja entre os dois modos
    // (dentro da folha 'Info' do Workspace, ou dentro de `#classic-shell`
    // no modo Clássico — é o MESMO elemento físico nos dois casos), então
    // fica "sempre acessível" automaticamente, sem precisar de nenhum
    // tratamento especial aqui — decisão confirmada via AskUserQuestion.
    document.getElementById('btn-layoutmode-top').onclick = () => ClassicMode.toggle();
    // Aviso "defina o nome da conferência" (pedido do usuário) — tocar nele
    // já leva direto pro campo, em vez de só dizer o caminho e deixar a
    // pessoa procurar sozinha (ver _goToConfNomeField abaixo).
    document.getElementById('conf-nome-banner').onclick = () => this._goToConfNomeField();
    // Se outra aba/janela deste app abrir uma versão mais nova enquanto esta
    // aba está aberta, o banco local é fechado aqui (ver db.js) para não
    // travar a outra aba — mostramos um aviso em vez de deixar essa aba
    // quebrar silenciosamente na próxima ação.
    window.addEventListener('catalogo:db-desatualizado', () => this._showStaleBanner());
  },

  // REMOVIDO (08/09/2026), pedido verbatim: "O dropdown dentro da tela de
  // 'Info' deve ser eliminado." — `_infoMode`/`_enterInfoMode`/
  // `_exitInfoMode`/`_syncTopbarInfoSelect` (mais o <select id="topbar-
  // info-select"> que eles controlavam) foram removidos. Esse "modo Info"
  // avulso do cabeçalho era de ANTES da rearquitetura que tornou a folha
  // 'info' parte permanente do BSP (sempre presente, ver
  // BSPLayout._defaultTree()) — ficou redundante e, pior, era a causa raiz
  // confirmada de bugs relatados juntos: `BSPLayout._renderInfoBarControls()`
  // (a barra de 4 botões de layouts, "botão quádruplo") só desenhava
  // enquanto `_infoMode` estava ligado — e nada no sistema novo voltava a
  // ligá-lo, então a barra ficava permanentemente vazia. Ver comentário
  // grande em bsplayout.js `_renderInfoBarControls`, que agora desenha
  // sempre, sem depender de nenhum "modo" — e index.html, onde o <select>
  // ficava. Os 3 pontos que chamavam `_syncTopbarInfoSelect(view)`
  // (navigate(), closeView3D(), closeModelos3D()) também não precisam mais
  // dela — removidos junto.

  async _boot() {
    document.getElementById('init-error')?.remove();
    EventLog.log('Aplicativo iniciado.');
    // NOVO (07/09/2026), pedido verbatim (debug): "coloque no console do
    // navegador tudo o que está sendo feito [...] para eu ver o que está
    // travando." — marca de tempo do INÍCIO do boot, pra medir tudo daqui
    // pra frente contra o mesmo ponto zero (ver `_safe` acima, prefixo
    // "[BOOT]", e "[DB]"/"[SERVIDOR]" nos outros arquivos).
    this._dbgBootInicio = performance.now();
    console.log('[BOOT] _boot(): iniciado.');
    try {
      // ATUALIZADO (09/09/2026), pedido verbatim (bug relatado): "Demorou
      // muito para aparecer alguma coisa na tela, só para saber se é o
      // layout antigo ou o layout novo." — CAUSA RAIZ: a correção anterior
      // do "flash" (mesma data, ver classicmode.js/css/index.html) impedia
      // o Workspace/BSP de aparecer errado por uma fração de segundo, MAS
      // manteve a ORDEM antiga — montar o Workspace inteiro, navegar pra
      // 'tabela' dentro dele, só DEPOIS trocar pro Clássico — então, com o
      // Clássico em cache, a tela ficava LISA (nada visível, só a
      // .boot-bar fina no topo) pelo tempo de montar+navegar o Workspace
      // INTEIRO, que ia ser jogado fora um instante depois mesmo assim.
      // Resultado: demorava MAIS que antes (antes, pelo menos o Workspace
      // aparecia rápido, mesmo sendo o "errado"). Agora: se o cache
      // (`ClassicMode.readCachedPref()`, síncrono) já diz 'classic', o
      // Workspace NEM É MONTADO aqui — entra direto em `ClassicMode.enter()`
      // (que não depende do Workspace estar montado, ver `enter()` em
      // classicmode.js) — a tela Clássica aparece o mais rápido que a
      // arquitetura permite. O Workspace só é montado de verdade se/quando
      // a pessoa apertar 🔀 pra voltar pra ele (ver `ClassicMode.exit()`,
      // atualizado na mesma rodada pra chamar `BSPLayout.mount()` na 1ª
      // vez em vez de só `_render()`) — nunca antes disso, nunca
      // bloqueando a tela Clássica.
      const prefereClassico = ClassicMode.readCachedPref() === 'classic';
      if (prefereClassico) {
        console.log('[BOOT] modo Clássico em cache — entrando direto (Workspace/BSP não é montado agora)...');
        this._safe('Session.init', () => Session.init());
        this._safe('registerServiceWorker', () => this._registerServiceWorker());
        this._waitForDB(8000).catch((err) => {
          console.error('Falha ao abrir o banco local:', err);
          this._showInitError(err);
        });
        if (!sessionStorage.getItem('catalogo_sessao_inicio')) {
          sessionStorage.setItem('catalogo_sessao_inicio', DB.nowISO());
        }
        await this._safe('ClassicMode.enter (boot)', () => ClassicMode.enter());
        console.log(`[BOOT] ClassicMode.enter(): concluído em ${(performance.now() - this._dbgBootInicio).toFixed(0)}ms desde o início do boot — tela principal já visível a partir daqui.`);
        this._hideBootBar();
        // Só confirma/sincroniza o cache com o banco de verdade (melhor
        // esforço) — a tela já está decidida e visível, isto não bloqueia
        // nada; `enter()` é idempotente (`if (this._active) return`) então
        // não faz nada de mais mesmo se o banco também disser 'classic'.
        this._safe('ClassicMode.syncCacheFromDB', () => ClassicMode.restoreFromSettings());
      } else {
        // Fluxo original, sem mudança: Workspace/BSPLayout passa a ser a
        // raiz PERMANENTE do app inteiro (não mais uma tela opcional
        // acessada pelo antigo botão de rodapé) — montada AQUI, ANTES de
        // qualquer `navigate()`, porque só depois desta chamada
        // `<main id="view">` (e o cabeçalho `header.topbar`) passam a
        // existir de verdade dentro do DOM (movidos de `#dom-parking`, ver
        // index.html, pra dentro das divisões 'conteudo'/'info' — ver
        // EDITOR_TYPES em js/bsplayout.js). `BSPLayout.mount()` já tolera
        // o banco local ainda não estar pronto (mesmo comportamento de
        // sempre, quando Workspace era aberta manualmente antes do boot
        // terminar).
        console.log('[BOOT] BSPLayout.mount(#app): montando cabeçalho/conteúdo/botões como divisões permanentes...');
        await BSPLayout.mount(document.getElementById('app'));
        console.log('[BOOT] BSPLayout.mount(#app): concluído.');
        this._safe('Session.init', () => Session.init()); // identidade única deste aparelho (ver session.js)
        this._safe('registerServiceWorker', () => this._registerServiceWorker());

        // ANTES: um `await this._waitForDB(8000)` aqui travava a tela inteira
        // (nada aparecia em #view, só a barra de progresso) pelo tempo que o
        // banco local levasse pra abrir de verdade — em aparelhos/navegadores
        // mais lentos isso podia chegar perto do teto de 8s com a tela vazia.
        // Agora _waitForDB roda em PARALELO, só como um "vigia": mostra a
        // barra de progresso e, se o banco genuinamente NUNCA abrir, desiste
        // depois de `ms` com um erro claro — sem bloquear mais nada. A
        // navegação (abaixo) já espera o banco sozinha, naturalmente, através
        // de openDB()/tx() (ver db.js) — a diferença é que a ESTRUTURA da
        // tela (barra de busca, botões, cabeçalho) aparece na hora, e só os
        // DADOS (que realmente dependem do banco) ficam pendentes por um
        // instante, em vez de tudo congelado atrás da barra de progresso.
        this._waitForDB(8000).catch((err) => {
          console.error('Falha ao abrir o banco local:', err);
          this._showInitError(err);
        });

        if (!sessionStorage.getItem('catalogo_sessao_inicio')) {
          sessionStorage.setItem('catalogo_sessao_inicio', DB.nowISO());
        }

        // [13/09/2026] NOVO — pedido verbatim: "Ao dar boot, ou seja, ao
        // carregar a página, pela primeira vez, por trás da splash screen
        // (Tela de Abertura), deve carregar, por padrão, o modo
        // 'Mapeamento de ambientes'." Antes, esta linha sempre navegava
        // pra 'tabela' (tela de catalogação de itens), não importa o
        // modo de operação — mesmo numa instalação NOVA, sem nada
        // catalogado ainda, escolhendo depois "Mapeamento de ambientes"
        // na splash screen (ver js/classicmode.js, que já usa esse MESMO
        // modo como padrão da própria splash quando fechada sem escolher
        // nada — "O padrão é o 'Mapeamento de ambientes'"). A tela por
        // trás da splash (Workspace) abria sempre em 'Tabela'
        // (catalogação), inconsistente com esse padrão. CORRIGIDO: só
        // numa instalação genuinamente NOVA (mesma detecção de "nunca foi
        // usado" já usada em classicmode.js — nenhum modo de operação
        // salvo E nenhum nome de conferência salvo), a tela inicial passa
        // a ser 'mapa' (Mapeamento de ambientes) em vez de 'tabela'. Uma
        // instalação que já tinha ALGUM modo escolhido ou nome de
        // conferência definido antes desta correção continua abrindo em
        // 'Tabela' normalmente (comportamento inalterado pra quem já usa
        // o app).
        let telaInicialPadrao = 'tabela';
        try {
          const [modoJaEscolhido, nomeJaDefinido] = await Promise.all([
            DB.getSetting(window.ClassicMode?._OPMODE_KEY || 'classicOperationMode', ''),
            DB.getSetting('conferenciaNome', ''),
          ]);
          // [19/09/2026 UTC] CORRIGIDO (RODADA 194) -- pedido verbatim: "Continua aparecendo o 'Tabela'
          // ao iniciar o app, quando clica-se fora da splash screen, sem selecionar uma das opções que
          // aparece ali." CAUSA RAIZ DE VERDADE (a "correção" da RODADA 193 tinha o bug ERRADO): o valor
          // gravado em `_OPMODE_KEY` pelas escolhas da splash (ver `data-mode` dos botões/`finish(modo)`
          // em classicmode.js) é a STRING `'mapeamento'`, nunca `'mapa'` -- a comparação
          // `modoJaEscolhido === 'mapa'` da rodada passada NUNCA batia com nada de verdade (bug bobo de
          // string errada), então aquele "conserto" não teve efeito nenhum na prática — nem no F5 (o caso
          // que motivou a RODADA 193) nem no "fechar a splash sem escolher" (que reusa este MESMO cálculo
          // de `telaInicialPadrao`, já que `App._boot()` chama `navigate(telaInicialPadrao)` ANTES de
          // `ClassicMode.openSplashScreen()` — a splash abre por CIMA de uma tela que já foi decidida por
          // este trecho, sem esperar a escolha do usuário). Corrigido pra comparar com o valor certo,
          // `'mapeamento'`.
          const instalacaoNova = !modoJaEscolhido && !(nomeJaDefinido && nomeJaDefinido.trim());
          if (instalacaoNova || modoJaEscolhido === 'mapeamento') telaInicialPadrao = 'mapa';
        } catch (e) { /* melhor esforço — na dúvida, mantém 'tabela' */ }
        // [15/09/2026 UTC] NOVO — pedido verbatim: "Ao selecionar o
        // 'Mapeamento de ambientes' [...] Deve ser mostrado o 'Planta
        // baixa'." — mesma correção de `js/classicmode.js` (`finish()`),
        // aplicada aqui pro caminho de boot de uma instalação nova (que já
        // abre direto em 'mapa', ver comentário grande acima): pula a tela
        // de ENTRADA do Mapa (botões Planta baixa/Fotos/Caixa) e vai
        // direto pra Planta baixa (`MapView._forcarTelaInicial`, ver
        // mapview.js `mount()`).
        // [19/09/2026 UTC] RODADA 192 -- pedido verbatim: "por padrao, quando for
        // o modo 'Mapeamento de ambientes', deve ficar a tela do 'Caixa'"
        // -- trocado de 'planta' (RODADA de 15/09) pra 'caixa'.
        if (telaInicialPadrao === 'mapa' && typeof MapView !== 'undefined') MapView._forcarTelaInicial = 'caixa';
        console.log(`[BOOT] navigate(${telaInicialPadrao}): iniciando (tela principal ainda não está na tela)...`);
        await this.navigate(telaInicialPadrao);
        console.log(`[BOOT] navigate(${telaInicialPadrao}): concluído em ${(performance.now() - this._dbgBootInicio).toFixed(0)}ms desde o início do boot — tela principal já visível a partir daqui.`);
        // Cobre o caso raro do cache estar ausente/desatualizado (ex.: 1ª
        // vez que esta correção roda: o banco já diz 'classic' de uma
        // sessão anterior, mas ainda não existia cache nenhum) — só nesse
        // caso raro volta a acontecer o "flash" antigo (ver classicmode.js).
        await this._safe('ClassicMode.restoreFromSettings', () => ClassicMode.restoreFromSettings());
        this._hideBootBar();
      }
      this._safe('App.checkDuplicatePatrimoniosOnBoot', () => this._checkDuplicatePatrimoniosOnBoot());
      // [10/09/2026] Pedido verbatim: "Ao iniciar o app, quando o app nunca
      // foi usado no dispositivo, aparece o 'Modo de operação', transforme-o
      // em um splash screen (Tela de Abertura) de janela independente, de
      // modo que o app carregue normalmente, mas esta janela apareça com um
      // botão de 'fechar'." — ANTES, esse modal só rodava dentro de
      // `ClassicMode.enter()` (só aparecia pra quem entrava no modo Clássico,
      // e bloqueava a montagem da tela Clássica até ser respondido). Agora:
      // chamado aqui, 1x por boot, INDEPENDENTE do modo Clássico/BSP (os dois
      // ramos acima já convergiram nesta linha).
      // [10/09/2026] NOVO pedido verbatim, mesma rodada: "A splash screen
      // deve sempre aparecer. Uma opção nas 'configurações do app' deve
      // servir para habilitar/desabilitar que sempre aparece no boot." —
      // `openSplashScreen()` (ver js/classicmode.js) agora mostra a janela
      // EM TODO BOOT (não só na 1ª vez), a menos que a preferência "🎬
      // Mostrar a Tela de Abertura ao iniciar o app" (⚙️ Configurações →
      // 🖥️ Layout do app, chave `splashSempreAoAbrir`, padrão ligada) esteja
      // desligada — nesse caso a chamada não faz nada. SEM `await`: "dispara
      // e esquece", igual às outras etapas "bônus" desta seção — não atrasa
      // nada do boot, a tela principal (Clássica ou Workspace) já está de
      // pé por trás dela.
      this._safe('ClassicMode.openSplashScreen (boot)', () => ClassicMode.openSplashScreen());

      // A partir daqui, tudo é "bônus" que roda em segundo plano — a tela
      // principal já está pronta e usável independentemente disso.
      this.mapaModo = await DB.getSetting('mapaModoPadrao', 'manual');
      await this._safe('Perf.init', () => Perf.init());
      await this._safe('History.init', () => History.init()); // desfazer/refazer (Ctrl+Z/Ctrl+Y) — ver js/history.js

      // Pede pro navegador não apagar os dados deste app sozinho por falta de
      // espaço — assim uma conferência de patrimônio que continua em outro
      // dia encontra os itens já cadastrados intactos (dentro do que o
      // navegador permite; se o CACHE/DADOS DO SITE forem limpos manualmente,
      // nenhuma configuração evita isso). Não bloqueia o início do app.
      this._safe('DB.requestPersistentStorage', async () => {
        const r = await DB.requestPersistentStorage();
        if (r.suportado) EventLog.log(`Armazenamento persistente: ${r.persistido ? 'concedido' : 'não concedido pelo navegador'}.`, { tipo: r.persistido ? 'ok' : 'aviso' });
      });

      this._loadRecognitionLibs();
      // MUDADO (07/09/2026), pedido verbatim: "Fica tudo travando [...] Logo
      // que o app inicia ficou muito travado, deixe os processos rodando em
      // segundo plano para não travar o app." — ANTES, o `await` aqui
      // BLOQUEAVA as linhas seguintes (SyncModule.startAuto/AutoExport.start/
      // ServerPrefs.start) por até uns 6s (2 candidatos de URL, 3s de prazo
      // cada, se nenhum servidor responder — ver serverprefs.js) toda vez
      // que o app abria sem 'servidorUrl' ainda preenchida — contribuindo
      // pro travamento relatado logo no início do app. Como essas 3 linhas
      // só fazem algo de verdade quando 'servidorUrl' JÁ está preenchida, a
      // "espera" só existia pra não perder a 1ª sincronização/envio depois
      // de ligar o app — isso não precisa BLOQUEAR o resto do boot: agora a
      // detecção roda em paralelo ("dispara e esquece", igual ao resto desta
      // seção) e, quando terminar (com ou sem sucesso), ela mesma dispara as
      // 3 linhas seguintes via `.then()` — o boot não fica mais parado
      // esperando o resultado da sondagem de rede.
      const _iniciarDependentesDoServidor = () => {
        this._safe('SyncModule.startAuto', () => SyncModule.startAuto()); // puxa catálogo de outros aparelhos, se houver servidor configurado
        this._safe('AutoExport.start', () => AutoExport.start()); // backup automático periódico dos itens novos, se ativado (ver autoexport.js)
        // NOVO (01/09/2026), item GRANDE #3 do pedido de 12 itens: envia
        // preferências (ao mudar) e backup completo (periódico, em lote —
        // ver js/serverprefs.js) pro servidor local configurado, se houver.
        this._safe('ServerPrefs.start', () => ServerPrefs.start());
      };
      this._safe('ServerPrefs.autoDetectarServidorLocal', () => ServerPrefs.autoDetectarServidorLocal()).then(_iniciarDependentesDoServidor);
      // Selo "onde os dados ficam guardados" no cabeçalho (pedido do usuário —
      // ver storagestatus.js) — roda depois da tela principal já estar de pé,
      // igual aos outros itens "bônus" desta seção; não depende da detecção
      // acima (não precisa esperar por ela).
      this._safe('StorageStatus.mount', () => StorageStatus.mount());
      console.log(`[BOOT] _boot(): função síncrona terminou de disparar tudo em ${(performance.now() - this._dbgBootInicio).toFixed(0)}ms desde o início (itens "bônus" acima continuam rodando em segundo plano — ver as linhas "[BOOT] ...: concluído em..." e "[SERVIDOR] ..." que ainda vão aparecer depois desta).`);
    } catch (err) {
      console.error('Falha ao iniciar o app:', err);
      this._showInitError(err);
    }
  },

  /** Checagem de patrimônio duplicado também "ao carregar a página" (além dos
   *  pontos que já recalculam na hora: tabela/busca/detalhe do item/orbs/mapa,
   *  toda vez que são abertos) — roda uma vez no boot e avisa com um toast
   *  (sem travar nada) se já existir algum duplicado no catálogo, mesmo que a
   *  pessoa nem chegue a abrir a tabela/busca nesta sessão. */
  async _checkDuplicatePatrimoniosOnBoot() {
    const dupSet = await DB.getDuplicatePatrimonios();
    if (dupSet.size > 0) {
      EventLog.log(`${dupSet.size} patrimônio(s) duplicado(s) encontrado(s) no catálogo ao abrir o app.`, { tipo: 'aviso' });
      Utils.toast(`⚠️ ${dupSet.size} patrimônio${dupSet.size > 1 ? 's' : ''} duplicado${dupSet.size > 1 ? 's' : ''} no catálogo`, { type: 'warn', duration: 5000 });
    }
  },

  /** Roda fn (síncrona ou assíncrona) sem deixar uma exceção interromper o
   *  resto do init(). NOVO (07/09/2026), pedido verbatim (debug): "coloque
   *  no console do navegador tudo o que está sendo feito pelo servidor e em
   *  segundo plano para eu ver o que está travando." — cada chamada por
   *  `_safe` (praticamente TODA etapa "bônus" do boot passa por aqui, ver
   *  `_boot()` abaixo) agora loga início/duração com o prefixo "[BOOT]" —
   *  se algo travar por um instante no início do app, a etapa "presa" fica
   *  visível (a linha "iniciando..." aparece, mas a de "concluído em Xms"
   *  demora a aparecer). */
  _safe(label, fn) {
    const _dbgInicio = performance.now();
    console.log(`[BOOT] ${label}: iniciando...`);
    try {
      const r = fn();
      if (r && typeof r.catch === 'function') {
        return r
          .then((v) => { console.log(`[BOOT] ${label}: concluído em ${(performance.now() - _dbgInicio).toFixed(0)}ms`); return v; })
          .catch((e) => { console.log(`[BOOT] ${label}: FALHOU após ${(performance.now() - _dbgInicio).toFixed(0)}ms`); console.warn(`${label} falhou:`, e); });
      }
      console.log(`[BOOT] ${label}: concluído (síncrono) em ${(performance.now() - _dbgInicio).toFixed(0)}ms`);
      return r;
    } catch (e) {
      console.log(`[BOOT] ${label}: FALHOU (síncrono) após ${(performance.now() - _dbgInicio).toFixed(0)}ms`);
      console.warn(`${label} falhou:`, e);
    }
  },

  /**
   * Espera o banco local abrir, mostrando uma barra de progresso REAL (não só
   * "carregando…") preenchendo conforme o tempo passa, até "ms". Se estourar,
   * REJEITA com uma mensagem clara — a promessa do banco continua tentando em
   * segundo plano (se abrir depois, "tentar novamente" pega ela pronta na hora).
   */
  _waitForDB(ms = 8000) {
    const bar = document.getElementById('boot-bar');
    const fill = bar?.querySelector('.boot-bar-fill');
    const label = bar?.querySelector('.boot-bar-label');
    bar?.classList.remove('hidden');
    bar?.classList.add('boot-bar--determinate');
    const start = Date.now();
    const tick = () => {
      const elapsed = Math.min(ms, Date.now() - start);
      if (fill) fill.style.width = `${Math.round((elapsed / ms) * 100)}%`;
      if (label) label.textContent = `Abrindo banco de dados… (${(elapsed / 1000).toFixed(0)}s/${ms / 1000}s)`;
    };
    tick();
    const timer = setInterval(tick, 100);
    const cleanup = () => { clearInterval(timer); bar?.classList.remove('boot-bar--determinate'); };

    let timeoutTimer;
    const timeout = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => reject(new Error('Tempo esgotado ao abrir o banco de dados local. Se outra aba/janela deste app estiver aberta com uma versão antiga, feche-a — abas com a mesma versão podem ficar abertas ao mesmo tempo sem problema.')), ms);
    });
    return Promise.race([Promise.resolve(DB.getAllSettings()).finally(() => clearTimeout(timeoutTimer)), timeout]).finally(cleanup);
  },

  _hideBootBar() {
    document.getElementById('boot-bar')?.classList.add('hidden');
  },

  /** Mostra um erro visível (em vez de tela em branco) quando a inicialização falha, com botão de tentar de novo. */
  _showInitError(err) {
    this._hideBootBar();
    const view = document.getElementById('view');
    if (!view) return;
    const msg = (err && (err.message || String(err))) || 'Erro desconhecido';
    view.innerHTML = `
      <div class="empty-state" id="init-error" style="text-align:left; max-width:560px; margin:0 auto; padding:40px 16px">
        <div class="ic" style="text-align:center">⚠️</div>
        <p style="text-align:center">Não consegui iniciar o app.</p>
        <p style="font-size:12px; color:var(--text-dim)">
          Se possível, abra o console do navegador (tecla F12 → aba "Console") e
          envie a mensagem de erro — isso ajuda a corrigir rápido. Detalhe técnico:
        </p>
        <pre style="white-space:pre-wrap; word-break:break-word; font-size:11px; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:8px; padding:10px; overflow:auto">${Utils.escapeHtml(msg)}</pre>
        <div style="display:flex; gap:8px; justify-content:center; margin-top:14px">
          <button class="btn secondary" id="init-retry" title="Tentar iniciar o app de novo, sem recarregar a página inteira">↻ Tentar novamente</button>
          <button class="btn" onclick="location.reload()" title="Recarregar a página inteira do zero">🔄 Recarregar página</button>
        </div>
      </div>`;
    document.getElementById('init-retry').onclick = () => this._boot();
  },

  /** Avisa (sem forçar nada) que esta aba ficou desatualizada porque outra aba abriu uma versão mais nova. */
  _showStaleBanner() {
    if (document.getElementById('stale-banner')) return;
    const el = document.createElement('div');
    el.id = 'stale-banner';
    el.className = 'stale-banner';
    el.innerHTML = `
      <span>Uma versão mais nova deste app foi aberta em outra aba — esta aba pode parar de salvar. Recarregue quando puder.</span>
      <button class="btn sm" onclick="location.reload()" title="Recarregar esta aba para usar a versão mais nova">🔄 Recarregar</button>`;
    document.body.appendChild(el);
  },

  /** Mostra/esconde o aviso "defina o nome da conferência" no cabeçalho
   *  (#conf-nome-banner, ver index.html) — pedido do usuário: "se não tiver
   *  nome definido para a conferência de patrimônio, deve ser exibido no
   *  cabeçalho uma mensagem chamativa". Chamado a cada troca de tela (ver
   *  navigate() abaixo) e também assim que um nome é salvo (ver settings.js
   *  #st-conf-nome onchange) — assim o aviso some na hora, sem precisar
   *  trocar de tela pra "atualizar". Barato (DB.getSetting usa um cache em
   *  memória — ver db.js _settingsCache), sem problema chamar toda vez.
   *
   *  [10/09/2026] Pedido verbatim: "Caso se selecione, na tela de 'Modo de
   *  operação', a opção 'Mapeamento de ambientes', então, a mensagem
   *  persistente 'Defina o nome para a conferência de patrimônio' não deve
   *  aparecer." — antes, este aviso só olhava pro nome (`conferenciaNome`);
   *  agora também olha pro modo de operação escolhido na splash screen
   *  (`DB.getSetting(ClassicMode._OPMODE_KEY)`, ver js/classicmode.js) — se
   *  for 'mapeamento', o aviso fica escondido MESMO sem nome nenhum
   *  definido (nesse modo não existe "conferência" pra nomear). Nos outros
   *  casos (modo 'conferencia', ou modo ainda não escolhido/1ª visita) o
   *  comportamento de sempre continua: aparece até um nome ser definido. */
  async _updateConfNomeBanner() {
    const banner = document.getElementById('conf-nome-banner');
    if (!banner) return;
    try {
      const [nome, modoOperacao] = await Promise.all([
        DB.getSetting('conferenciaNome', ''),
        DB.getSetting(window.ClassicMode?._OPMODE_KEY || 'classicOperationMode', ''),
      ]);
      const temNome = !!(nome && nome.trim());
      const modoMapeamento = modoOperacao === 'mapeamento';
      banner.classList.toggle('hidden', temNome || modoMapeamento);
    } catch (e) {
      // Sem banco disponível ainda (ex: bem no início do boot) — deixa
      // escondido; a próxima chamada (próxima troca de tela) tenta de novo.
      console.warn('_updateConfNomeBanner falhou:', e);
    }
  },

  /** Pedido do usuário (31/08/2026): "No botão 'Ver lista simples' no
   *  cabeçalho do app, mesmo tendo patrimônios catalogados (foram
   *  importados de um arquivo .json proveniente de um 'exportar' de outro
   *  aparelho com este mesmo app), não está aparecendo nenhum item na
   *  lista." CAUSA RAIZ: este botão (ícone "👁️" na barra de cima,
   *  presente em TODA tela — não só no Mapa) estava chamando
   *  `MapView._showAmbienteListaSimples()`, que só lista os itens do mapa
   *  ATUALMENTE ativo em `MapView._map` (`DB.getItemsByAmbiente`, com um
   *  fallback pra `DB.getOrCreateSingleMap()` se nenhum mapa foi aberto
   *  ainda nesta sessão). Desde que o app passou a suportar VÁRIOS mapas
   *  (`ambienteId` por item, mapas próprios em vez de um único ambiente
   *  implícito), um backup importado de outro aparelho traz seus próprios
   *  mapas — os itens ficam corretamente vinculados a ELES (ver
   *  settings.js, importação de backup, "Reencaixa item.ambienteId no
   *  mapa CERTO"), não ao mapa que por acaso está "atual" neste aparelho.
   *  Um botão global do cabeçalho (visível em Tabela/Cartões/Fotos/Buscar,
   *  não só dentro do Mapa) não deveria depender de qual mapa está
   *  "ativo" — o esperado é ver TODOS os itens catalogados, de qualquer
   *  mapa. Corrigido usando `DB.getAllSummaries()` (mesma fonte "leve" já
   *  usada pela tela Tabela, que já lista certo itens de qualquer mapa)
   *  em vez de uma lista restrita a um `ambienteId`. */
  async _showListaSimplesGlobal() {
    try {
      if (!window.VerListaSimples?.show) {
        Utils.toast?.('⚠️ "Ver lista simples" ainda não carregou (o app pode precisar recarregar a página — às vezes duas vezes, por causa do cache offline). Recarregue e tente de novo.', { type: 'warn', duration: 7000 });
        return;
      }
      const itens = await DB.getAllSummaries();
      window.VerListaSimples.show({ items: itens, titulo: 'Todos os itens catalogados' });
    } catch (err) {
      console.error('[Ver lista simples] Falha ao abrir (global):', err);
      Utils.toast?.(`⚠️ Não consegui abrir "Ver lista simples" (${err?.message || err}).`, { type: 'danger', duration: 7000 });
    }
  },

  /** Ativado ao tocar no aviso do cabeçalho acima — em vez de só descrever o
   *  caminho (⚙️ Configurações → 📦 Catálogo → 🗂️ Conferência de
   *  patrimônio), já abre direto nele: força a aba "Catálogo" (onde a seção
   *  mora — ver SettingsView.SETTINGS_CATS/_activeSettingsCat em
   *  settings.js), navega pra Configurações, e dá foco + destaque breve no
   *  campo do nome assim que a tela termina de montar. */
  async _goToConfNomeField() {
    if (window.SettingsView) window.SettingsView._activeSettingsCat = 'catalogo';
    await this.navigate('configuracoes');
    const input = document.getElementById('st-conf-nome');
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus();
    input.classList.add('field-flash-highlight');
    setTimeout(() => input.classList.remove('field-flash-highlight'), 1800);
  },

  /**
   * NOVO (09/09/2026), pedido verbatim: "Em 'Info', ao clicar em
   * 'Configurações do app' (o ícone) a tela de 'configurações do app' não
   * está abrindo, deve abrir em tela cheia." — abre `SettingsView` como uma
   * sobreposição fixa cobrindo a janela inteira (`position:fixed; inset:0`),
   * por CIMA de todo o BSPLayout, em vez de tentar revelar/redimensionar
   * uma divisão dele. Mesmo princípio de `.organize-overlay`/
   * `#ambphotos-overlay` (ver css/style.css e organizeview.js): um `<div>`
   * solto, fora da árvore de divisões, com `document.body.appendChild`.
   * Idempotente — clicar de novo com a tela já aberta não duplica nada.
   */
  async _openSettingsFullscreen() {
    if (document.getElementById('settings-fullscreen-overlay')) return;
    const el = document.createElement('div');
    el.id = 'settings-fullscreen-overlay';
    el.className = 'settings-fullscreen-overlay';
    el.innerHTML = `
      <div class="settings-fullscreen-topbar">
        <div class="settings-fullscreen-title">⚙️ Configurações do app</div>
        <button type="button" class="btn secondary sm" id="settings-fullscreen-close">✕ Fechar</button>
      </div>
      <div class="settings-fullscreen-body" id="settings-fullscreen-body"></div>
    `;
    document.body.appendChild(el);
    const fechar = () => {
      // SettingsView.unmount() só zera a referência interna do container
      // (ver settings.js) — não precisa "desfazer" nada visualmente porque o
      // <div> inteiro (com tudo dentro) é removido do DOM logo em seguida.
      window.SettingsView?.unmount?.();
      el.remove();
    };
    el.querySelector('#settings-fullscreen-close').onclick = fechar;
    // Esc fecha também (mesmo padrão de outras telas cheias do app, como o
    // Modelador 3D) — listener 'once' pra não vazar/duplicar entre aberturas.
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape' && document.getElementById('settings-fullscreen-overlay')) {
        fechar();
        document.removeEventListener('keydown', onEsc);
      }
    });
    await window.SettingsView?.mount?.(el.querySelector('#settings-fullscreen-body'));
  },

  /**
   * Carrega bibliotecas de terceiros em segundo plano (ver libloader.js) e
   * mostra uma barrinha de progresso enquanto isso — some sozinha ao terminar.
   * A tela principal e o cadastro manual já funcionam antes disso terminar.
   */
  _loadRecognitionLibs() {
    const widget = document.getElementById('lib-status');
    const fill = document.getElementById('lib-status-fill');
    const text = document.getElementById('lib-status-text');
    if (!widget) return;
    widget.classList.remove('hidden');
    LibLoader.loadAll({
      onProgress: (done, total, nome) => {
        if (fill) fill.style.width = `${Math.round((done / total) * 100)}%`;
        if (text) text.textContent = done < total ? `Carregando ${nome}… (${done}/${total})` : 'Bibliotecas prontas ✓';
      },
    }).finally(() => {
      setTimeout(() => widget.classList.add('hidden'), 1200);
    });
  },

  /** `opts.isBack` (usado só por back(), abaixo) — navegação DE VOLTA, não
   *  empilha (ver _navStack acima): senão o próprio botão "Fechar" contaria
   *  como mais um passo "pra frente", cavando a pilha e nunca voltando de
   *  verdade (era exatamente o ciclo relatado pelo usuário). */
  async navigate(view, opts = {}) {
    if (!this.views[view]) return;
    // [19/09/2026 UTC] NOVO (RODADA 195) -- flag "já navegou pelo menos 1x nesta carga de página", pra
    // `ClassicMode.enter()` conseguir distinguir "boot do zero" (nenhuma tela de verdade decidida ainda)
    // de "já tem uma tela em curso" (troca manual pelo botão 🔀 no meio de uma sessão) -- ver comentário
    // grande em classicmode.js `enter()` (`this.currentView` SEMPRE é truthy, mesmo antes do 1º
    // `navigate()` de verdade -- é inicializado como `'tabela'` de fábrica, nunca `null`/`undefined`, ver
    // a declaração do objeto App logo no topo deste arquivo -- não dava pra usar como sinal de "ainda não
    // navegou").
    this._navegouAoMenosUmaVez = true;
    // NOVO (08/09/2026): 'workspace' (BSPLayout) agora é a raiz
    // PERMANENTE do app inteiro (ver BSPLayout.mount(#app) em _boot()
    // abaixo) — navegar pra ela indireta/programaticamente aninharia o
    // Workspace dentro de si mesmo e corromperia `BSPLayout._tree`. Nada
    // chama isto nesta rodada (o botão "Workspace" da divisão 'Botões'
    // não chama navigate pra essa chave, de propósito), mas fica como
    // rede de segurança.
    if (view === 'workspace') { console.warn('[App] navigate("workspace") ignorado — o Workspace já é a raiz permanente do app.'); return; }
    // NOVO (07/09/2026), "sistematização da pilha de retorno" -- achado da
    // auditoria pedida pelo usuário ("faça uma auditoria exaustiva de todos
    // os outros caminhos não-padrão do app"): 'Mapa'->'Organizar' abre a
    // Planta baixa 2D/3D por cima de si mesmo (organizeview.js
    // _openMapExternally) ESCONDENDO seu próprio overlay (display:none, sem
    // remover do DOM) e deixando um botão flutuante "🗂️ Voltar ao
    // Organizar" (#organize-return-btn) fixo em document.body -- só ELE
    // sabia limpar essa tela escondida direito (_closeExternalScreen). Se o
    // usuário, em vez de tocar nesse botão, usa qualquer caminho PADRÃO de
    // navegação (aqui: barra inferior/qualquer chamada a App.navigate) pra
    // sair da Planta baixa/3D, o overlay escondido e o botão flutuante
    // ficavam ÓRFÃOS -- o botão continuava aparecendo por cima de QUALQUER
    // tela seguinte, e um clique nele "sequestrava" a navegação de volta
    // pro Organizar, mesmo o usuário já tendo seguido em frente havia
    // tempo. Corrigido chamando OrganizeView.close() (já existente, mesmo
    // botão "✕" de sempre usa) sempre que esse botão flutuante ainda existir
    // na hora de navegar -- reaproveita a limpeza de verdade (remove o
    // overlay do DOM, tira listeners, devolve o HUD de performance) E o
    // aviso de "há alterações pendentes" já existente (close() só fecha
    // direto se não houver nada pendente; havendo, mostra o mesmo diálogo
    // de sempre em vez de descartar silenciosamente).
    if (typeof OrganizeView !== 'undefined' && document.getElementById('organize-return-btn')) {
      try { OrganizeView.close(); } catch (e) { console.warn('Falha ao limpar o Organizar órfão ao navegar:', e); }
    }
    const prev = this.views[this.currentView];
    if (prev?.unmount) { try { prev.unmount(); } catch (e) { console.warn(`unmount("${this.currentView}") falhou:`, e); } }

    if (this.currentView !== view && !opts.isBack) this._navStack.push(this.currentView);

    // NOVO (09/09/2026): inclui `.bottomnav button` no mesmo seletor —
    // ver js/classicmode.js. A barra inferior do modo Clássico usa a MESMA
    // convenção de sempre (`data-view` + classe `.active`), então basta
    // acrescentá-la aqui pra ficar sincronizada com `App.navigate()` sem
    // nenhum código especial dentro de classicmode.js.
    document.querySelectorAll('.bsp-botoes-btn, .bottomnav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    document.getElementById('view-title').textContent = this.titles[view] || 'Catalogação de Itens';
    this._safe('App._updateConfNomeBanner', () => this._updateConfNomeBanner());
    // Na tela "Mapa", os botões de Ver lista simples/Configurações do topbar
    // global saem de cena (viram um cluster próprio da tela, ver mapview.js)
    // pra deixar o topo livre, só com o título — pedido explícito do usuário.
    document.body.classList.toggle('view-mapa', view === 'mapa');
    const container = document.getElementById('view');
    // Preserva o scroll de cada tela entre visitas (pedido do usuário — ver
    // `_viewScrollMemory` acima): guarda onde a tela que está SAINDO ficou
    // rolada antes de limpar o container, devolve depois de montar a nova
    // (ou a mesma, se o scroll salvo for desta view — 0 se nunca visitada).
    this._viewScrollMemory[this.currentView] = container.scrollTop;
    container.innerHTML = '';
    this.currentView = view;
    // NOVO (07/09/2026), pedido verbatim (debug): mede quanto tempo cada
    // tela leva pra montar (ex.: a tela "tabela", montada logo no boot —
    // se o catálogo tiver muitos itens, desenhar todas as linhas da tabela
    // pode ser o que está travando, não necessariamente o servidor).
    const _dbgInicioMount = performance.now();
    console.log(`[NAV] views.${view}.mount(): iniciando...`);
    try {
      await this.views[view].mount(container);
      console.log(`[NAV] views.${view}.mount(): concluído em ${(performance.now() - _dbgInicioMount).toFixed(0)}ms`);
    } catch (e) {
      // Nunca deixa a tela em branco silenciosamente: mostra o que deu errado.
      console.error(`Falha ao abrir a tela "${view}":`, e);
      container.innerHTML = `
        <div class="empty-state">
          <div class="ic">⚠️</div>
          Não consegui abrir esta tela.
          <div style="font-size:11px; color:var(--text-dim); margin-top:8px">${Utils.escapeHtml(e.message || String(e))}</div>
          <button class="btn secondary sm" style="margin-top:12px" onclick="location.reload()" title="Recarregar a página inteira">🔄 Recarregar</button>
        </div>`;
      // NOVO (07/09/2026), pedido verbatim: "inquebrável, tudo com estrutura
      // try{}catch(){} [...] um botão com exatamente o que apareceu no
      // console (como copiar o que apareceu no console [...] e colar na
      // janela desse botão de detalhes do erro)." Este try/catch já existia
      // (a tela nunca ficava em branco sem aviso), mas o aviso era só um
      // texto curto (`e.message`) — sem stack trace nem jeito de copiar.
      // Chamar ModuleHost aqui ACRESCENTA o modal com "Detalhes do
      // erro"/"Copiar" por cima do cartão acima (que continua mostrando o
      // botão "🔄 Recarregar", ainda visível depois de fechar o modal).
      if (typeof ModuleHost !== 'undefined') ModuleHost.showLoadError(`Tela "${this.titles[view] || view}"`, e);
    }
    container.scrollTop = this._viewScrollMemory[view] || 0;
  },

  /** Botão "✕ Fechar" (Configurações/Unificar, e qualquer outra tela
   *  parecida no futuro) — desempilha `_navStack` (ver comentário grande no
   *  topo do objeto) em vez de navegar "pra frente" como um destino comum.
   *  `fallback` só é usado se a pilha estiver vazia (ex.: tela aberta direto
   *  por algum atalho, sem nenhuma navegação anterior registrada nesta
   *  sessão) — evita ficar sem destino nenhum nesse caso raro. */
  /** [20/09/2026 UTC] NOVO (RODADA 230) -- fallback de `closeView3D()` (ver comentário
   *  grande lá) pro caso raro de `_navStack` vazia (nenhuma navegação anterior registrada
   *  nesta sessão antes de abrir o "3D" do rodapé). MESMA detecção de modo de operação já
   *  usada em `_boot()` pra decidir `telaInicialPadrao`/`MapView._forcarTelaInicial` --
   *  "Mapeamento de ambientes" (ou splash fechada sem escolher nada numa instalação nova)
   *  tem 'Caixa' como tela padrão; qualquer outro modo mantém 'Tabela'. Duplicar essa
   *  detecção (em vez de guardar `telaInicialPadrao` como propriedade) é proposital: aqui
   *  o valor precisa refletir o modo de operação ATUAL (pode ter mudado depois do boot),
   *  não o congelado no momento em que o app abriu. */
  async _prevViewFallbackPadrao() {
    try {
      const [modoJaEscolhido, nomeJaDefinido] = await Promise.all([
        DB.getSetting(window.ClassicMode?._OPMODE_KEY || 'classicOperationMode', ''),
        DB.getSetting('conferenciaNome', ''),
      ]);
      const instalacaoNova = !modoJaEscolhido && !(nomeJaDefinido && nomeJaDefinido.trim());
      if (instalacaoNova || modoJaEscolhido === 'mapeamento') return 'caixa';
    } catch (e) { /* melhor esforço — na dúvida, mantém 'tabela' */ }
    return 'tabela';
  },

  async back(fallback = 'tabela') {
    const target = this._navStack.pop() || fallback;
    await this.navigate(target, { isBack: true });
  },

  // NOVO (07/09/2026) — virou `async` (era síncrona) pra poder dar `await`
  // em `View3D.mount(...)` dentro do try/catch novo (ver comentário grande
  // abaixo) — nenhum dos chamadores (mapview.js/app.js, ver grep) usa o
  // valor de retorno nem `await`s esta função, então torná-la assíncrona é
  // 100% compatível com todo código existente (uma Promise "solta" a mais,
  // igual várias outras chamadas fire-and-forget já existentes no app).
  async openView3D(ambienteId) {
    // Bug relatado pelo usuário: "Ver em 3D não está funcionando" — na
    // prática a view 3D montava normalmente por baixo, mas esta função
    // pulava por cima do desmonte da tela anterior (ao contrário de
    // `navigate()`, que sempre chama `prev.unmount()` primeiro). Vindo do
    // Mapa (Planta baixa), isso deixava `body.view-mapa-planta` ligada e o
    // cabeçalho/rodapé de 4 linhas do Mapa (#topbar-mapa/#bottombar-mapa —
    // fixos, FORA de #view) continuavam cobrindo a tela inteira por cima do
    // 3D, dando a impressão de que o clique não fez nada. Mesma limpeza que
    // `navigate()` já faz: desmonta a view atual e atualiza `_prevView`
    // antes de trocar.
    const prev = this.views[this.currentView];
    if (prev?.unmount) { try { prev.unmount(); } catch (e) { console.warn(`unmount("${this.currentView}") falhou:`, e); } }
    if (this.currentView !== '__view3d__') this._prevView = this.currentView;
    document.body.classList.remove('view-mapa');
    const container = document.getElementById('view');
    // 25/08/2026 — BUG corrigido (pedido do usuário: "posicionando o
    // personagem no 2D e indo para o 3D, a posição não é preservada" —
    // mas o caminho inverso, 3D->2D, funcionava certinho). Esta chamada a
    // `View3D.unmount()` era incondicional, mesmo quando o 3D não estava
    // montado no momento (ex.: vindo direto do Mapa 2D — nesse caso quem já
    // desmonta a view atual é o `prev.unmount()` logo acima, que desmonta o
    // MapView, não o View3D). `View3D.unmount()` NUNCA limpa `this._camera`/
    // `this._map` (só `this._container`, ver view3d.js) — então essa 2ª
    // chamada "fantasma" reexecutava o bloco que grava a posição da câmera
    // de volta em `MapView._personagem2D`, só que usando o `this._camera`
    // ANTIGO (da última vez que o 3D esteve aberto), sobrescrevendo a
    // posição fresca que o usuário acabara de definir no 2D — bem antes de
    // `View3D.mount()`, logo abaixo, ler esse valor. Resultado: 2D->3D
    // "voltava" pra posição antiga; 3D->2D funcionava porque `closeView3D()`
    // só desmonta o 3D uma vez. Corrigido checando `View3D._container`
    // (só truthy enquanto realmente montado) antes de chamar unmount() de
    // novo — mantém a limpeza defensiva de contexto WebGL pro caso em que o
    // 3D já estivesse mesmo montado, sem o efeito colateral no caminho 2D.
    if (View3D._container) View3D.unmount?.();
    container.innerHTML = '';
    document.getElementById('view-title').textContent = 'Visualização 3D';
    // BUG CORRIGIDO (07/09/2026), pedido verbatim: "inquebrável, tudo com
    // estrutura try{}catch(){} para evitar o app quebrar [...] Apresentando
    // uma mensagem como 'não consegui carregar aquele módulo'." Antes,
    // `View3D.mount(...)` era chamado SEM try/catch nenhum (ao contrário de
    // `navigate()`/`closeView3D()`/`closeModelos3D()`, que já tratavam
    // falha de mount há mais tempo) — uma exceção aqui (ex.: Three.js
    // falhando ao carregar, engine3d.js lançando ao montar a cena) ficava
    // só no console, com a tela 3D em branco sem aviso nenhum.
    try {
      await View3D.mount(container, { ambienteId });
      this.currentView = '__view3d__';
      this.views.__view3d__ = View3D;
    } catch (e) {
      console.error('Falha ao abrir "Ver em 3D":', e);
      container.innerHTML = `
        <div class="empty-state">
          <div class="ic">⚠️</div>
          Não consegui abrir o "Ver em 3D".
          <div style="font-size:11px; color:var(--text-dim); margin-top:8px">${Utils.escapeHtml(e.message || String(e))}</div>
          <button class="btn secondary sm" style="margin-top:12px" onclick="location.reload()" title="Recarregar a página inteira">🔄 Recarregar</button>
        </div>`;
      if (typeof ModuleHost !== 'undefined') ModuleHost.showLoadError('Ver em 3D', e);
      // Mesmo o mount tendo falhado, marca a view atual como o 3D (igual ao
      // caminho de sucesso) — assim "voltar"/fechar continua funcionando
      // normalmente a partir daqui, em vez de ficar num limbo sem view
      // registrada.
      this.currentView = '__view3d__';
      this.views.__view3d__ = View3D;
    }
  },

  /** Botão "✕ Sair do 3D" (view3d.js) — antes chamava App.navigate('mapa'),
   *  que SEMPRE reabre a tela de entrada do Mapa (2 botões grandes), porque
   *  é isso que navigate()/MapView.mount() fazem por padrão (decisão
   *  deliberada de outra rodada — ver comentário em MapView.mount). Bug
   *  relatado pelo usuário: "é uma pilha de telas" — sair do 3D deveria
   *  voltar pra Planta baixa, de onde "Ver em 3D" foi clicado, não pro topo
   *  da pilha do Mapa. Aqui, se a tela de origem (_prevView, guardada por
   *  openView3D) era o Mapa, volta direto pra Planta baixa
   *  (MapView.mountAfterView3D) em vez de passar por navigate('mapa'); pra
   *  qualquer outra tela de origem, comportamento idêntico a navigate(). */
  async closeView3D() {
    // NOVO (07/09/2026) — mesmo caso do Organizar órfão documentado em
    // App.navigate() logo acima: sair do 3D pelo próprio botão "✕ Sair do
    // 3D" (em vez do botão flutuante "🗂️ Voltar ao Organizar") também
    // deixava aquele botão e o overlay escondido do Organizar órfãos,
    // quando o 3D tinha sido aberto a partir dele (organizeview.js
    // _openMapExternally, modo '3d'). Mesma limpeza.
    if (typeof OrganizeView !== 'undefined' && document.getElementById('organize-return-btn')) {
      try { OrganizeView.close(); } catch (e) { console.warn('Falha ao limpar o Organizar órfão ao sair do 3D:', e); }
    }
    const prev = this.views.__view3d__;
    if (prev?.unmount) { try { prev.unmount(); } catch (e) { console.warn('unmount(__view3d__) falhou:', e); } }
    // [20/09/2026 UTC] CORRIGIDO (RODADA 230) -- pedido verbatim: "Ao ir em 'Ver em 3D' pelo
    // botão do rodapé do app e, depois, clicar em 'Sair do 3D', está retornando para a tela
    // 'Tabela'. Deve voltar para a tela padrão da opção escolhida." CAUSA RAIZ: este `target`
    // só conhecia `this._prevView` -- uma variável escrita SÓ por `openView3D(ambienteId)`
    // (o 3D aberto DE DENTRO da Planta baixa do Mapa, ver comentário grande acima). O botão
    // "3D" do RODAPÉ, porém, é uma tela normal do roteador (`views.ver3d`, ver topo do
    // arquivo) aberta via `App.navigate('ver3d')` -- que nunca escreve em `_prevView` (usa
    // `_navStack`, a pilha de "de onde vim" já existente pra `App.back()`). Chegando por
    // esse caminho, `_prevView` ficava com um valor VELHO de uma sessão anterior de 3D
    // embutido no Mapa (ou `undefined`, numa sessão sem nenhum) -- então o `|| 'tabela'`
    // sempre "vencia" (ou o valor velho errado), não importa se a tela de origem de
    // verdade era 'caixa' (padrão de 'Mapeamento de ambientes'), 'mapa', ou qualquer outra.
    // CORRIGIDO: quando o 3D atual foi aberto pelo rodapé (`currentView === 'ver3d'`),
    // usa a MESMA pilha `_navStack` de `App.back()` -- o topo dela é exatamente a tela de
    // onde o usuário veio antes de clicar "3D", então "Sair do 3D" volta pra ELA (Caixa,
    // Mapa, ou qualquer outra), em vez de sempre 'Tabela'. Só cai no fallback fixo
    // (`_prevViewFallbackPadrao()`, calculado abaixo a partir do MESMO modo de operação
    // usado no boot -- ver `telaInicialPadrao` em `_boot()`) se a pilha estiver vazia (ex.:
    // 'ver3d' foi a 1ª tela desta sessão, sem navegação anterior registrada) -- nesse caso
    // raro, "Mapeamento de ambientes" (ou splash fechada sem escolher nada) volta pra
    // 'Caixa', igual ao pedido verbatim citado acima; qualquer outro modo mantém 'Tabela'.
    // O caminho antigo (`_prevView`, 3D embutido no Mapa) continua IDÊNTICO -- não mexe
    // nesse caso, que já funcionava certo.
    const veioDoRodape = this.currentView === 'ver3d';
    const target = veioDoRodape
      ? (this._navStack.pop() || await this._prevViewFallbackPadrao())
      : (this._prevView || 'tabela');
    document.querySelectorAll('.bsp-botoes-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === target));
    document.getElementById('view-title').textContent = this.titles[target] || 'Catalogação de Itens';
    document.body.classList.toggle('view-mapa', target === 'mapa');
    const container = document.getElementById('view');
    container.innerHTML = '';
    this.currentView = target;
    try {
      if (target === 'mapa' && typeof MapView !== 'undefined') await MapView.mountAfterView3D(container);
      else await this.views[target]?.mount(container);
    } catch (e) {
      console.error(`Falha ao voltar pra tela "${target}" depois do 3D:`, e);
      container.innerHTML = `
        <div class="empty-state">
          <div class="ic">⚠️</div>
          Não consegui abrir esta tela.
          <div style="font-size:11px; color:var(--text-dim); margin-top:8px">${Utils.escapeHtml(e.message || String(e))}</div>
          <button class="btn secondary sm" style="margin-top:12px" onclick="location.reload()" title="Recarregar a página inteira">🔄 Recarregar</button>
        </div>`;
      // NOVO (07/09/2026) — ver comentário grande em navigate()/openView3D().
      if (typeof ModuleHost !== 'undefined') ModuleHost.showLoadError(`Tela "${this.titles[target] || target}"`, e);
    }
  },

  /** NOVO (03/09/2026) — MESMO padrão/MESMO motivo de `closeView3D()` logo
   *  acima, agora pro botão "✕ Fechar" de Modelos3DView (js/modelos3d.js,
   *  aberta a partir de "🛠️ Acessar modelos" no painel "🪑 Objetos" do mapa).
   *  Pedido do usuário: "ao clicar em 'Fechar' deve voltar para o mapa com a
   *  janela dos objetos aberta, não deve voltar a tela do 'Mapa'." Chamado
   *  no lugar de `App.back('mapa')` (ver `#m3dv-close` em modelos3d.js) —
   *  `back()` sempre passa por `navigate()`/`MapView.mount()` normal, que
   *  reinicia a tela do Mapa na tela de ENTRADA (2 botões grandes), perdendo
   *  a Planta baixa e o painel de Objetos. Aqui, sempre que a tela de origem
   *  era o Mapa (o único jeito de chegar em Modelos3DView hoje — ver botão
   *  "🛠️" no painel de Objetos), vai direto pra Planta baixa com o painel de
   *  Objetos reaberto (`MapView.mountAfterModelos3D`, ver mapview.js). Pra
   *  qualquer outra origem hipotética (nenhuma existe hoje), cai no
   *  `App.back('mapa')` de sempre — nunca fica sem destino nenhum. */
  async closeModelos3D() {
    const prev = this.views.modelos3d;
    if (prev?.unmount) { try { prev.unmount(); } catch (e) { console.warn('unmount(modelos3d) falhou:', e); } }
    // Já desmontou `prev` manualmente acima (mesmo padrão de `closeView3D`)
    // — daqui pra baixo NUNCA passa por `navigate()`/`back()` de novo (eles
    // chamariam `unmount()` uma 2ª vez em cima do que já foi desmontado).
    const target = this._navStack.pop() || 'mapa';
    document.querySelectorAll('.bsp-botoes-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === target));
    document.getElementById('view-title').textContent = this.titles[target] || 'Catalogação de Itens';
    document.body.classList.toggle('view-mapa', target === 'mapa');
    const container = document.getElementById('view');
    container.innerHTML = '';
    this.currentView = target;
    try {
      if (target === 'mapa' && typeof MapView !== 'undefined') await MapView.mountAfterModelos3D(container);
      else await this.views[target]?.mount(container);
    } catch (e) {
      console.error('Falha ao voltar pro Mapa depois de Modelos 3D:', e);
      container.innerHTML = `
        <div class="empty-state">
          <div class="ic">⚠️</div>
          Não consegui abrir esta tela.
          <div style="font-size:11px; color:var(--text-dim); margin-top:8px">${Utils.escapeHtml(e.message || String(e))}</div>
          <button class="btn secondary sm" style="margin-top:12px" onclick="location.reload()" title="Recarregar a página inteira">🔄 Recarregar</button>
        </div>`;
      // NOVO (07/09/2026) — ver comentário grande em navigate()/openView3D().
      if (typeof ModuleHost !== 'undefined') ModuleHost.showLoadError(`Tela "${this.titles[target] || target}"`, e);
    }
  },

  // ---------- Formulário de item (novo / editar) ----------
  /**
   * `opts.fotoAnexadaId` (novo — ver js/db.js `item.fotoAnexadaId`): pré-
   * preenche o campo "Foto desse patrimônio" com uma mapPhoto já salva —
   * usado pelo modal de vínculo da tela "Fotos" (ver js/capture.js
   * _openPhotoLinkModal, opção "🏷️ Este é um patrimônio") ao abrir este
   * MESMO formulário pra um item NOVO. Ignorado quando `existingItem` já
   * tem seu próprio `fotoAnexadaId` (edição normal — o que já está salvo no
   * item manda). Em qualquer um dos dois casos, ou digitando do zero pela
   * Tabela ("+ Novo"), a pessoa também pode escolher/trocar/remover pelo
   * botão "📷 Anexar foto" (ver `_pickExistingPhoto` abaixo) — não é só
   * pré-preenchimento automático.
   *
   * `opts.onSaved(saved)` (novo, opcional): chamado depois de um salvamento
   * bem-sucedido (novo OU edição), além de tudo que este método já fazia
   * (toast/refresh/etc.) — usado pelo mesmo fluxo acima pra voltar pra
   * Tabela depois de cadastrar um patrimônio a partir de uma foto (ver
   * capture.js) sem esta função precisar saber nada sobre navegação.
   *
   * `opts.prefillPatrimonio` (novo, opcional, só usado pra um item NOVO):
   * pré-preenche "Número de patrimônio" sem tratar como edição — usado pela
   * tela "Fotos" (ver capture.js) pra não perder a leitura automática do
   * código de barras (js/barcode.js, recurso separado e mantido) mesmo
   * agora que o "isto é um patrimônio" do modal de vínculo abre este
   * formulário genérico em vez do formulário próprio da câmera.
   */
  async openItemForm(existingItem = null, opts = {}) {
    const ambienteId = await DB.getSetting('ambienteAtualId', null);
    let fotoAnexadaId = existingItem?.fotoAnexadaId || opts.fotoAnexadaId || null;
    let fotoAnexadaPreview = null;
    if (fotoAnexadaId) {
      const fotoPre = await DB.getAmbientePhoto(fotoAnexadaId);
      if (fotoPre) fotoAnexadaPreview = fotoPre.thumbDataUrl || fotoPre.dataUrl || null;
      else fotoAnexadaId = null; // referência quebrada (foto excluída depois) — não trava o formulário
    }
    // Ícone do item (edição) desenhado em SVG na hora — ver avatar.js.
    const iconState = existingItem ? await Avatar.loadIconState() : null;
    const avatarPreviewSvg = existingItem ? Avatar.itemIconSvg(existingItem, iconState) : '';
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <h3 style="margin-top:0">${existingItem ? 'Editar item' : 'Novo item'}</h3>
        ${existingItem ? `<div class="detail-avatar">${avatarPreviewSvg}</div>` : ''}
        <label class="field"><span class="lbl">Número de patrimônio${(!existingItem && opts.prefillPatrimonio) ? ' (lido automaticamente — confira)' : ''}</span>
          <input type="text" id="ef-patrimonio" value="${Utils.escapeHtml(existingItem?.patrimonio || (!existingItem ? (opts.prefillPatrimonio || '') : ''))}" placeholder="ex: 000123"></label>
        <label class="field"><span class="lbl">Descrição</span>
          <input type="text" id="ef-descricao" value="${Utils.escapeHtml(existingItem?.descricao || '')}" placeholder="ex: Cadeira giratória azul"></label>
        <label class="field"><span class="lbl">Tipo</span>
          <input type="text" id="ef-tipo" value="${Utils.escapeHtml(existingItem?.tipo || (!existingItem ? (sessionStorage.getItem('catalogo_tipo_fixo') || '') : ''))}" placeholder="ex: Cadeira"></label>
        <label class="field"><span class="lbl">Setor / Local</span>
          <input type="text" id="ef-setor" value="${Utils.escapeHtml(existingItem?.setor || sessionStorage.getItem('catalogo_setor_sessao') || '')}" placeholder="ex: Almoxarifado 2º andar"></label>
        ${!existingItem ? `
        <label class="radio-opt">
          <input type="checkbox" id="ef-sticky-tipo">
          <span><span class="t">Fixar este tipo para os próximos</span><br><span class="d">Útil para cadastrar vários itens iguais em sequência.</span></span>
        </label>` : ''}
        <div class="field">
          <span class="lbl">Foto desse patrimônio</span>
          <div class="foto-anexada-row" id="ef-foto-row"></div>
        </div>
        <div style="display:flex; gap:8px; margin-top:14px">
          <button class="btn secondary block" id="ef-cancel" title="Fechar sem salvar as alterações">Cancelar</button>
          <button class="btn block" id="ef-save" title="Salvar as alterações deste item">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    Utils.attachAutocomplete(modal.querySelector('#ef-tipo'), () => DB.getAllTypes(), () => {}, (nome) => DB.deleteType(nome), {
      iconProvider: async (nome) => { const key = await Icons.matchByTipo(nome); return key ? Icons.svgForKey(key) : null; },
    });
    Utils.attachAutocomplete(modal.querySelector('#ef-setor'), () => DB.getAllSectors(), () => {}, (nome) => DB.deleteSector(nome));

    // ---- Campo "Foto desse patrimônio" (ver js/db.js item.fotoAnexadaId) ----
    // Só guarda a REFERÊNCIA (id) — nunca duplica a imagem no item (ver
    // comentário grande em db.js addItem). "📷 Anexar foto" abre um seletor
    // simples com TODAS as fotos do mapa (ver _pickExistingPhoto abaixo).
    const fotoRow = modal.querySelector('#ef-foto-row');
    const renderFotoRow = () => {
      fotoRow.innerHTML = `
        ${fotoAnexadaPreview ? `<img class="foto-anexada-thumb" src="${fotoAnexadaPreview}" alt="">` : ''}
        <button type="button" class="btn secondary sm" id="ef-foto-anexar" title="Escolher uma foto já existente para anexar a este patrimônio">📷 ${fotoAnexadaId ? 'Trocar foto' : 'Anexar foto'}</button>
        <button type="button" class="btn secondary sm${fotoAnexadaId ? '' : ' hidden'}" id="ef-foto-remover" title="Remover a foto anexada deste patrimônio">✕ Remover</button>
      `;
      fotoRow.querySelector('#ef-foto-anexar').onclick = async () => {
        // Pedido do usuário: ao abrir uma "tela" por cima desta (o seletor de
        // fotos, que por sua vez pode abrir a câmera por cima dele), a de
        // baixo deve SUMIR (não ficar visível/empilhada atrás) — igual à
        // pilha de telas do Mapa (Planta baixa/Foto/Caixa, ver mapview.js
        // _showScreen + botão "← Voltar"). Reaparece assim que a de cima
        // resolve, seja escolhendo uma foto ou voltando sem escolher nada.
        modal.classList.add('hidden');
        let escolhida;
        try {
          escolhida = await App._pickExistingPhoto();
        } finally {
          modal.classList.remove('hidden');
        }
        if (!escolhida) return;
        fotoAnexadaId = escolhida.id;
        fotoAnexadaPreview = escolhida.thumbDataUrl || escolhida.dataUrl || null;
        renderFotoRow();
      };
      fotoRow.querySelector('#ef-foto-remover').onclick = () => {
        fotoAnexadaId = null;
        fotoAnexadaPreview = null;
        renderFotoRow();
      };
    };
    renderFotoRow();

    modal.querySelector('#ef-cancel').onclick = () => modal.remove();
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#ef-save').onclick = async (ev) => {
      const btn = ev.currentTarget;
      const textoOriginal = btn.textContent;
      const patch = {
        patrimonio: modal.querySelector('#ef-patrimonio').value.trim(),
        descricao: modal.querySelector('#ef-descricao').value.trim(),
        tipo: modal.querySelector('#ef-tipo').value.trim(),
        setor: modal.querySelector('#ef-setor').value.trim(),
        fotoAnexadaId: fotoAnexadaId || null,
      };
      if (!patch.patrimonio && !patch.descricao && !patch.tipo && !patch.setor) { Utils.toast('Informe ao menos o patrimônio, a descrição, o tipo ou o setor.', { type: 'warn' }); return; }

      // "Fixar este tipo"/setor da sessão — MESMA lógica/MESMA chave de sessionStorage que a
      // tela "Fotos" (Capturar, ver js/capture.js _openForm/_toggleStickyTipo/
      // _promptSessionSetor) já usa, pra "fixar" aqui valer lá e vice-versa — pedido do
      // usuário: o botão "✏️ Manual" da tela Fotos agora abre este MESMO formulário (em vez de
      // um formulário próprio dela), então os dois precisam ler/escrever o mesmo lugar. Setor
      // sempre "gruda" pro resto da sessão ao salvar (mesmo sem checkbox — já era assim antes,
      // só que só dentro de Capturar); tipo só gruda se a caixa for marcada.
      if (!existingItem && modal.querySelector('#ef-sticky-tipo')?.checked && patch.tipo) {
        sessionStorage.setItem('catalogo_tipo_fixo', patch.tipo);
        window.CaptureView?.syncButtons?.();
      }
      if (patch.setor && patch.setor !== sessionStorage.getItem('catalogo_setor_sessao')) {
        sessionStorage.setItem('catalogo_setor_sessao', patch.setor);
        window.CaptureView?.syncButtons?.();
      }

      // "alvo" é o item que vai ser efetivamente gravado: o próprio existingItem
      // (edição normal), OU outro item já existente escolhido para SUBSTITUIR
      // (quando o patrimônio digitado bate com um item diferente já cadastrado),
      // OU null (cria um item novo mesmo).
      let alvo = existingItem;
      if (!existingItem && patch.patrimonio) {
        const duplicado = await DB.getItemByPatrimonio(patch.patrimonio);
        if (duplicado) {
          const escolha = await Utils.showChoiceModal({
            title: 'Patrimônio já cadastrado',
            message: `Já existe um item com o patrimônio "${patch.patrimonio}" (${duplicado.descricao || duplicado.tipo || 'sem descrição'}, setor: ${duplicado.setor || '—'}). O que deseja fazer?`,
            choices: [
              { value: 'substituir', label: '🔁 Substituir o item existente' },
              { value: 'ambos', label: '➕ Manter os dois (itens separados)', secondary: true },
              { value: 'cancelar', label: 'Cancelar', secondary: true },
            ],
          });
          if (!escolha || escolha === 'cancelar') return;
          if (escolha === 'substituir') alvo = duplicado;
        }
      }

      btn.disabled = true;
      try {
        let saved;
        let beforeSnapshot = null; // usado só pra permitir desfazer, quando é uma EDIÇÃO
        if (alvo) {
          beforeSnapshot = { ...alvo };
          saved = await DB.updateItem(alvo.id, patch);
        } else {
          // Nenhum ícone/avatar é mais gerado/gravado aqui — o ícone colorido
          // do item (Tabela/Cartões/detalhe) é desenhado em SVG na hora, a
          // partir só de tipo/descrição (ver avatar.js Avatar.iconSvgMarkup).
          patch.ambienteId = ambienteId;
          if (await DB.getSetting('geoAtivo', true) && Geo.isAvailable()) {
            btn.textContent = 'Localizando…';
            const geo = await Geo.getOneShot({ timeout: 4000 });
            btn.textContent = textoOriginal;
            if (geo) { patch.geoLat = geo.lat; patch.geoLng = geo.lng; patch.geoAccuracy = geo.accuracy; patch.geoObtidoEm = geo.obtidoEm; }
          }
          patch.capturaIpPublico = await Session.getPublicIpIfEnabled(); // null se a opção estiver desativada (padrão) ou sem internet
          saved = await DB.addItem(patch);
        }
        modal.remove();
        Utils.toast(alvo ? 'Item substituído ✓' : 'Item salvo ✓', { type: 'ok' });
        this._refreshCurrentView();
        AmbientePhotos.refreshIfOpen?.(); // se um orb mostrava o patrimônio/descrição antigos, atualiza na hora
        AutoSave.pushItem(saved, { isUpdate: !!alvo }).catch(() => {});
        P2PModule.pushItem(saved).catch(() => {}); // envia direto pro outro aparelho conectado (sem servidor), se houver
        LocalBackup.pushItem(saved); // cópia leve (só patrimônio/tipo/setor) no localStorage deste aparelho
        EventLog.log(`Item ${alvo ? 'substituído' : 'cadastrado'} (manual): ${saved.patrimonio || saved.descricao || saved.id}`, { tipo: 'ok' });
        if (!alvo) Icons.maybeEnrichWithRemoteIcon(saved).catch(() => {});
        // Desfazer/refazer só cobre EDIÇÃO de item já existente (o pedido do
        // usuário foi especificamente "uma alteração em um item do catálogo")
        // — criar item novo não empilha comando aqui.
        if (alvo && beforeSnapshot) {
          const alvoId = alvo.id, patchAplicado = { ...patch };
          History.push({
            label: 'editar item',
            undo: async () => { await DB.putItemRaw(beforeSnapshot); },
            redo: async () => { await DB.updateItem(alvoId, patchAplicado); },
          });
        }
        if (opts.onSaved) await opts.onSaved(saved);
        // Item GENUINAMENTE NOVO (não edição nem "🔁 Substituir" — ver
        // `alvo` acima): abre o mesmo modal de vínculo pedido pelo usuário
        // pra fotos (task #108), agora pra patrimônios (task #109) — ver
        // _openItemLinkModal abaixo.
        if (!alvo) this._openItemLinkModal(saved);
      } catch (err) {
        // Sem isto, qualquer erro inesperado aqui dentro deixava o botão "Salvar"
        // preso (desabilitado, sem nenhum aviso) — parecendo que ele tinha
        // simplesmente parado de funcionar, sem nenhuma pista do motivo real.
        console.error('Falha ao salvar item:', err);
        Utils.toast('Não foi possível salvar: ' + (err?.message || err), { type: 'danger', duration: 5000 });
        EventLog.log(`Falha ao salvar item (manual): ${err?.message || err}`, { tipo: 'erro' });
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    };
  },

  async _refreshCurrentView() {
    const v = this.views[this.currentView];
    if (v?.refresh) await v.refresh();
  },

  /** Seletor simples (grade de miniaturas) de uma foto JÁ EXISTENTE no mapa
   *  (mapPhoto — ver js/db.js/js/ambientephotos.js) pra anexar a um
   *  patrimônio (botão "📷 Anexar foto" em openItemForm acima). Mesmo
   *  espírito/mesmo padrão de modal de `Utils.pickItem` (busca de item),
   *  só que sem busca — a lista de fotos costuma ser pequena o bastante pra
   *  uma grade só, sem precisar filtrar por texto. Devolve o registro da
   *  foto escolhida (não só o id — já poupa quem chama de buscar nome/
   *  thumbnail de novo), ou null se cancelado. */
  async _pickExistingPhoto() {
    return new Promise((resolve) => {
      // Pedido do usuário: a janela anterior (formulário do item) só deve
      // sumir IMEDIATAMENTE ANTES desta aqui entrar em cena — nenhum instante
      // sem nenhuma janela visível. Por isso o modal é criado e colocado no
      // DOM de forma 100% síncrona (nada de `await` antes do appendChild),
      // com um estado "carregando" — a busca das fotos no banco (que pode
      // demorar um pouco, sobretudo na primeira vez) roda DEPOIS, sem
      // bloquear a exibição do modal em si. Bug relatado: antes, `await
      // DB.getAllAmbientePhotos()` rodava ANTES de criar o modal, deixando
      // uma janela de tempo com tudo escondido e nenhuma janela visível.
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-sheet">
          <div class="handle"></div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px">
            <h3 style="margin:0">Escolher foto para anexar</h3>
            <button type="button" class="icon-btn sm" id="pp-new-photo" title="Tirar uma foto nova agora e já anexar">📷 Tirar foto</button>
          </div>
          <p id="pp-loading" style="font-size:12.5px; color:var(--text-dim); text-align:center; padding:10px 0">Carregando fotos…</p>
          <div class="photo-pick-grid hidden" id="pp-grid"></div>
          <button class="btn secondary block" id="pp-cancel" style="margin-top:10px" title="Voltar para a tela anterior sem escolher nenhuma foto">← Voltar</button>
        </div>`;
      document.body.appendChild(modal);
      let resolved = false;
      const finish = (foto) => { if (resolved) return; resolved = true; modal.remove(); resolve(foto); };
      modal.querySelector('#pp-cancel').onclick = () => finish(null);
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) finish(null); });
      // Pedido do usuário: no seletor de "Anexar foto", um botão no canto
      // superior direito pra tirar uma foto NOVA na hora, sem precisar sair
      // pra tela "Fotos" primeiro — a foto tirada aqui já entra como uma
      // mapPhoto de verdade (ver App._takeQuickPhoto) e já resolve este
      // seletor com ela, exatamente como se tivesse sido escolhida da grade.
      // Mesma pilha de telas do item acima: este modal SOME enquanto a
      // câmera está aberta por cima, e reaparece quando ela resolve/volta.
      modal.querySelector('#pp-new-photo').onclick = async () => {
        modal.classList.add('hidden');
        let nova;
        try {
          nova = await App._takeQuickPhoto();
        } finally {
          modal.classList.remove('hidden');
        }
        if (nova) finish(nova);
      };
      // Carrega as fotos DEPOIS do modal já estar visível — cada miniatura é
      // adicionada como seu próprio elemento (não um innerHTML gigante de
      // uma vez), então elas vão "aparecendo" conforme o navegador decodifica
      // cada imagem, em vez de travar tudo até a última terminar.
      (async () => {
        const fotos = await DB.getAllAmbientePhotos();
        if (resolved) return; // já foi fechado (ex: cancelado) antes da busca terminar
        const loading = modal.querySelector('#pp-loading');
        const grid = modal.querySelector('#pp-grid');
        if (!fotos.length) {
          if (loading) loading.textContent = 'Nenhuma foto no mapa ainda — tire uma na tela "Fotos", em Mapa → Foto, ou pelo botão "📷 Tirar foto" acima.';
          return;
        }
        loading?.remove();
        grid?.classList.remove('hidden');
        fotos.forEach((f) => {
          const tile = document.createElement('button');
          tile.type = 'button';
          tile.className = 'photo-pick-tile';
          tile.title = f.nome || 'Escolher esta foto';
          tile.innerHTML = `<img src="${f.thumbDataUrl || f.dataUrl || ''}" alt="">`;
          tile.onclick = () => finish(f);
          grid?.appendChild(tile);
        });
      })();
    });
  },

  /** Câmera rápida "num modal só" — tira UMA foto e já salva como mapPhoto de
   *  verdade (mesmo padrão de qualidade/redimensionamento de capture.js
   *  _captureAndProcess/_afterPhotoCaptured — Utils.resizeImage 2400px/85%
   *  pra dataUrl cheia + 220px/75% pro thumb —, e mesma checagem de suporte
   *  de Utils.cameraUnsupportedReason), só que SEM o resto daquela tela
   *  inteira (sem código de barras, sem sessão de captura, sem "fixar
   *  tipo") — pensada pra qualquer lugar do app que só precise de "tirar
   *  uma foto agora" sem trocar de tela (ver botão "📷 Tirar foto" em
   *  _pickExistingPhoto acima). Reaproveita as MESMAS classes CSS da tela
   *  "Fotos" (.camera-wrap/.camera-topbar/.camera-controls/.shutter-btn —
   *  ver capture.js), só que dentro de um `<div>` com `position:fixed;
   *  inset:0` próprio (a tela "Fotos" normalmente é o próprio container de
   *  view em tela cheia; aqui não há uma view dedicada, então o wrap se
   *  posiciona sozinho por cima de tudo). Devolve o registro da foto salva,
   *  ou `null` se cancelado/sem câmera disponível. */
  async _takeQuickPhoto() {
    const motivoIndisponivel = Utils.cameraUnsupportedReason();
    if (motivoIndisponivel) {
      Utils.toast('Câmera indisponível: ' + motivoIndisponivel, { type: 'danger', duration: 6000 });
      return null;
    }
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'camera-wrap';
      overlay.style.cssText = 'position:fixed; inset:0; z-index:400';
      overlay.innerHTML = `
        <video id="qp-video" autoplay playsinline muted></video>
        <div class="camera-topbar">
          <button class="icon-btn" id="qp-close" title="Voltar para o seletor de fotos sem tirar nenhuma">← Voltar</button>
        </div>
        <div class="camera-controls">
          <button class="shutter-btn" id="qp-shutter" title="Tirar foto"></button>
        </div>
      `;
      document.body.appendChild(overlay);
      const video = overlay.querySelector('#qp-video');
      let stream = null, resolved = false;
      const finish = (photo) => {
        if (resolved) return;
        resolved = true;
        if (stream) stream.getTracks().forEach((t) => t.stop());
        overlay.remove();
        resolve(photo);
      };
      overlay.querySelector('#qp-close').onclick = () => finish(null);
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      }).then((s) => { stream = s; video.srcObject = s; }).catch((e) => {
        console.warn('Erro ao acessar câmera (tirar foto rápida):', e);
        Utils.toast('Não foi possível acessar a câmera: ' + (e.message || e.name || e), { type: 'danger', duration: 5000 });
        finish(null);
      });
      overlay.querySelector('#qp-shutter').onclick = async () => {
        if (!video.videoWidth) { Utils.toast('Câmera ainda carregando…', { type: 'warn' }); return; }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = await Utils.resizeImage(canvas, 2400, 0.85);
        const thumbDataUrl = await Utils.resizeImage(canvas, 220, 0.75);
        const map = await DB.getOrCreateSingleMap();
        const photo = await DB.addAmbientePhoto({ ambienteId: map.id, dataUrl, thumbDataUrl, nome: '', setor: sessionStorage.getItem('catalogo_setor_sessao') || '' });
        finish(photo);
      };
    });
  },

  /**
   * Modal com as 3 escolhas pedidas pelo usuário pra um PATRIMÔNIO recém-
   * cadastrado (task #109) — mesmo padrão do modal de vínculo de foto (task
   * #108, ver capture.js _openPhotoLinkModal), só que aqui a 2ª opção é
   * "posição numa foto" em vez de "isto é um patrimônio" (que não faz
   * sentido pra um item que está se registrando agora):
   *  1. "🗺️ Vincular a uma posição no mapa" — modo de escolher a posição na
   *     Planta baixa (ver MapView.enterItemPlacementMode).
   *  2. "📷 Vincular a uma posição em uma foto" — escolhe uma foto já
   *     existente (_pickExistingPhoto acima) e marca um orb nela ligado a
   *     este item (ver AmbientePhotos.enterOrbPlacementForItem).
   *  3. "Deixar sem vínculo por enquanto" — posiciona o item sozinho, na
   *     periferia de tudo que já existe no mapa (mesma ideia de
   *     capture.js _autoPlacePhoto), marcando `mapaAuto: true` — ainda
   *     aparece como pino (fácil de achar) mas continua contando como
   *     "sem lugar" pra 📦 Caixa (ver PhotoGrid.getUnsorted).
   * Toque fora do modal equivale à opção 3, igual ao modal de foto.
   * Só é chamado para itens GENUINAMENTE NOVOS (ver openItemForm acima e
   * capture.js _openForm, que só chamam isto quando `!alvo`/`!substituirId`)
   * — editar ou substituir um item já existente não reabre este modal.
   */
  _openItemLinkModal(item) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet" style="text-align:center">
        <div class="handle"></div>
        <h3 style="margin-top:0">Patrimônio cadastrado — vincular a um lugar?</h3>
        <div style="display:flex; flex-direction:column; gap:8px">
          <button type="button" class="btn block" id="il-mapa" title="Escolher, na planta baixa 2D, onde este patrimônio fica">🗺️ Vincular a uma posição no mapa</button>
          <button type="button" class="btn secondary block" id="il-foto" title="Marcar, numa foto já existente, onde este patrimônio está">📷 Vincular a uma posição em uma foto</button>
          <button type="button" class="btn secondary block" id="il-skip" title="Guardar o item na 📦 Caixa por enquanto — dá pra vincular depois">Deixar sem vínculo por enquanto</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // `decidido` evita disparar o "deixar sem vínculo" (fallback do toque
    // fora do modal) DEPOIS que uma das 3 opções já tiver sido escolhida —
    // mesmo cuidado de _openPhotoLinkModal em capture.js.
    let decidido = false;
    const skip = () => { if (decidido) return; decidido = true; this._autoPlaceItem(item.id); };

    modal.addEventListener('mousedown', (e) => { if (e.target === modal) { modal.remove(); skip(); } });

    modal.querySelector('#il-mapa').onclick = async () => {
      decidido = true;
      modal.remove();
      await App.navigate('mapa');
      await MapView.enterItemPlacementMode(item.id, {
        // "Cancelar" na faixa do mapa cai no MESMO resultado de "deixar sem
        // vínculo" (pedido explícito da spec, igual ao modal de foto).
        onCancel: (itemId) => this._autoPlaceItem(itemId),
      });
    };

    modal.querySelector('#il-foto').onclick = async () => {
      decidido = true;
      modal.remove();
      const foto = await App._pickExistingPhoto();
      if (!foto) { await this._autoPlaceItem(item.id); return; } // cancelou a escolha da foto: mesmo fallback de "deixar sem vínculo"
      const map = await DB.getOrCreateSingleMap();
      await AmbientePhotos.enterOrbPlacementForItem(map, item.id, {
        startPhotoId: foto.id,
        onDone: () => {},
        onCancel: (itemId) => this._autoPlaceItem(itemId),
      });
    };

    modal.querySelector('#il-skip').onclick = () => {
      modal.remove();
      skip();
    };
  },

  /**
   * Posiciona `itemId` automaticamente na periferia de tudo que já existe no
   * mapa (ver Mapping.findPeripheralSlot) e marca `mapaAuto: true` — mesma
   * ideia de capture.js _autoPlacePhoto, só que pra um item do catálogo em
   * vez de uma mapPhoto. Usado tanto pela opção 3 do modal acima quanto por
   * um "Cancelar" no meio das opções 1/2.
   */
  async _autoPlaceItem(itemId) {
    try {
      const map = await DB.getOrCreateSingleMap();
      const item = await DB.getItem(itemId);
      if (!item) return;
      const todosItens = await DB.getAllItems();
      const index = todosItens.filter((it) => it.id !== itemId && it.mapaAuto === true).length;
      const slot = Mapping.findPeripheralSlot(map, index);
      await DB.updateItem(itemId, { mapaX: slot.x, mapaY: slot.y, mapaPiso: slot.piso || 0, mapaAuto: true });
      await MapView._refreshMapaIfShowing?.();
      Utils.toast('Patrimônio guardado na 📦 Caixa — dá para vincular a um lugar depois.', { type: 'ok' });
    } catch (err) {
      console.error('Falha ao posicionar item automaticamente:', err);
      Utils.toast('Não foi possível guardar a posição do patrimônio: ' + (err?.message || err), { type: 'danger', duration: 5000 });
    }
  },

  // ---------- Detalhe do item (flashcard modal) ----------
  /** REMOVIDO (04/09/2026), pedido verbatim (item 5): "No 'Buscar', as
   *  opções de 'como chegar lá no 3D' devem ficar nas 'configurações 3D'. O
   *  padrão é o órbita." — este seletor modal (perguntava TODA VEZ que
   *  "👁️ Ver no mapa 3D" era clicado, item/foto, ou a busca ia pro 3D) foi
   *  substituído por uma preferência persistida em MapConfig
   *  (`modoVoo3D`, ver mapconfig.js seção "🚀 Modo de voo 3D" dentro do
   *  contexto 3D) — lida direto por `verNoMapa3D` logo abaixo, sem
   *  interromper mais o fluxo com uma pergunta a cada viagem. Função
   *  removida por ficar órfã (nenhuma outra chamada restante).
   */

  /** NOVO (03/09/2026), pedido verbatim (itens 1/2): botões "👁️ Ver no mapa
   *  2D"/"👁️ Ver no mapa 3D" — reaproveitado tanto pelo patrimônio
   *  (showItemDetail) quanto pela foto (ambientephotos.js), sem duplicar o
   *  fluxo de navegação. `pos` = {x, y, ambienteId} (mundo, mesmo espaço de
   *  mapaX/mapaY — ver Mapping). */
  async verNoMapa2D(pos) {
    if (pos.ambienteId) await DB.setSetting('ambienteAtualId', pos.ambienteId); // item 4: troca pro mapa certo, se for outro
    await this.navigate('mapa');
    // ATUALIZADO (07/09/2026), pedido verbatim: "melhorar a busca (o
    // deslocamento enquanto vai até o item encontrado) no 2D e 3D" -- antes
    // usava `centerViewOnPoint` (TELEPORTE instantâneo pro destino, sem
    // nenhuma transição). O mapa 2D já tinha, desde a busca interna dele
    // (🔍 "Buscar no mapa", ver mapview.js MapView.flyViewTo), o efeito de
    // 3 fases "afasta / desloca / aproxima" -- só não era usado AINDA por
    // este funil (a busca GLOBAL da aba "Buscar"). Passa a usar o MESMO
    // `flyViewTo`, com fallback pro comportamento antigo (`centerViewOnPoint`)
    // só por segurança, caso `flyViewTo` não exista por algum motivo.
    if (typeof MapView.flyViewTo === 'function') MapView.flyViewTo(pos.x, pos.y, { zoomPct: 150 });
    else MapView.centerViewOnPoint?.(pos.x, pos.y, 150);
  },
  /** NOVO (04/09/2026), pedido verbatim: "No card de informações do
   *  patrimônio deve ter mais uma informação: 'Marcação em foto'... Quando
   *  clicado, vai até a foto (em 'Mapa'->'Foto') e destaca visualmente o
   *  orb do patrimônio naquela foto." — acha a foto/orb (ver
   *  DB.findOrbFotoByItem), troca pro mapa certo se for outro (mesmo
   *  espírito do item 4 de verNoMapa2D/3D acima), navega pra 'mapa' e
   *  entra DIRETO na tela "Foto" (em vez da tela de entrada do Mapa) já
   *  na foto certa, com o orb destacado (ver mapview.js _showScreen/
   *  photogrid.js mountFotoScreen/ambientephotos.js AmbientePhotos.open,
   *  todos com `startPhotoId`/`highlightOrbId` novos nesta mesma rodada). */
  async verMarcacaoEmFoto(itemId) {
    const found = await DB.findOrbFotoByItem(itemId);
    if (!found) { Utils.toast('Este patrimônio ainda não tem nenhuma marcação (orb) em foto nenhuma.', { type: 'warn' }); return; }
    // NOVO (04/09/2026), "sistematização da pilha de retorno" — pedido
    // verbatim: "Sempre que um botão ou ação levar para uma tela, porém não
    // foi feito pelo 'caminho padrão' (...), deve ter um botão de retorno
    // para a tela anterior." O caminho PADRÃO até a tela "Foto" é
    // 'Mapa'->'Foto' (fecha voltando pra entrada do Mapa, ver
    // MapView._showScreen). Quando se chega aqui por outro caminho (ex.:
    // 'Buscar' -> ficha do item -> "Marcação em foto"), a view ATUAL no
    // momento da chamada (`this.currentView`) já É a origem de verdade —
    // basta guardá-la ANTES de navegar pro Mapa e repassar como
    // `returnTo`, pra tela "Foto" trocar seu botão de fechar por um de
    // retorno pra lá (em vez do padrão "voltar pro Mapa").
    const origin = this.currentView;
    if (found.photo.ambienteId) await DB.setSetting('ambienteAtualId', found.photo.ambienteId);
    await this.navigate('mapa');
    await MapView._showScreen('foto', { startPhotoId: found.photo.id, highlightOrbId: found.orb.id, returnTo: origin !== 'mapa' ? origin : null });
  },

  async verNoMapa3D(pos) {
    // ATUALIZADO (04/09/2026), item 5 — modo lido direto de "⚙️
    // Configurações do mapa › 3D › 🚀 Modo de voo 3D" (padrão 'orbita'), em
    // vez de perguntar com um seletor modal a cada viagem (ver comentário
    // grande onde pickFlightMode3D existia, logo acima).
    const cfg3d = (typeof MapConfig !== 'undefined') ? await MapConfig.get() : {};
    const mode = cfg3d.modoVoo3D || 'orbita';
    if (pos.ambienteId) await DB.setSetting('ambienteAtualId', pos.ambienteId);
    this.openView3D(pos.ambienteId);
    // View3D.mount é assíncrono (carrega malha/objetos) — só dá pra voar
    // depois que a cena/câmera existirem de verdade; um pequeno poll
    // (mesmo espírito de outros "espera X existir" no app) evita um
    // flyCameraTo perdido chamado cedo demais.
    const tentativas = 40;
    for (let i = 0; i < tentativas; i++) {
      if (window.View3D?._camera && window.View3D?._map) { View3D.flyCameraTo(pos.x, pos.y, pos.z, { mode }); return; }
      await new Promise((r) => setTimeout(r, 100));
    }
  },

  /** NOVO (04/09/2026), pedido verbatim (item 8): "A foto do patrimônio
   *  deve ser exibida no mesmo modelo de 'Mapa'->'Foto', ou seja, as
   *  dimensões da imagem logo acima à esquerda, poder ampliar e reduzir
   *  também (nesses aspectos)." — visor de tela cheia com canvas próprio
   *  (independente do de ambientephotos.js, que é o editor inteiro de
   *  ambiente/orbs/medidas — reaproveitar ele por cima seria complicar à
   *  toa pra exibir uma foto solta), reproduzindo SÓ os 2 aspectos citados:
   *  (a) rótulo "LxA" ancorado acima-esquerda da foto, MESMO estilo visual
   *  (caixa arredondada semitransparente + borda clara, mesma fonte/
   *  padding) de ambientephotos.js `_drawResolutionLabel`; (b) roda do
   *  mouse + pinça (toque) pra zoom, arrastar pra mover — MESMA mecânica/
   *  constantes (`MIN_ZOOM`/`MAX_ZOOM`) de ambientephotos.js
   *  `_attachPanZoom`. Reaproveitado de qualquer lugar que precise mostrar
   *  uma foto solta neste padrão (chamado hoje só por showItemDetail, mas
   *  genérico o bastante — só recebe a URL da imagem). */
  openFotoDimensZoomViewer(dataUrl) {
    if (!dataUrl) return;
    const MIN_ZOOM = 0.02, MAX_ZOOM = 100; // mesmos limites de ambientephotos.js
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.style.cssText = 'background:rgba(0,0,0,.92); display:flex; align-items:center; justify-content:center; touch-action:none';
    overlay.innerHTML = `
      <canvas id="fdz-canvas" style="width:100%; height:100%; display:block; cursor:grab"></canvas>
      <button class="btn secondary" style="position:fixed; top:14px; right:14px" id="fdz-close">✕ Fechar</button>`;
    document.body.appendChild(overlay);
    const canvas = overlay.querySelector('#fdz-canvas');
    const ctx = canvas.getContext('2d');
    const view = { cx: 0, cy: 0, zoom: 1 };
    let img = null, imgW = 0, imgH = 0;

    const resizeCanvas = () => {
      canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
    };
    const worldToScreen = (x, y) => ({
      x: canvas.width / 2 + (x - view.cx) * view.zoom,
      y: canvas.height / 2 + (y - view.cy) * view.zoom,
    });
    const screenToWorld = (sx, sy) => ({
      x: (sx - canvas.width / 2) / view.zoom + view.cx,
      y: (sy - canvas.height / 2) / view.zoom + view.cy,
    });
    const roundRectPath = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    // MESMO estilo/posição de ambientephotos.js _drawResolutionLabel (ver
    // comentário grande lá) — reproduzido aqui em vez de importado, porque
    // aquele método depende de campos internos do editor inteiro
    // (this._img/this._canvas) que este visor solto não tem.
    const drawResolutionLabel = () => {
      if (!img || !imgW || !imgH) return;
      const topLeft = worldToScreen(0, 0);
      const label = `${imgW} x ${imgH}`;
      ctx.font = '600 12px sans-serif';
      const textW = ctx.measureText(label).width;
      const padX = 8, boxW = textW + padX * 2, boxH = 20;
      const boxX = Utils.clamp(topLeft.x, 6, Math.max(6, canvas.width - boxW - 6));
      const boxY = Utils.clamp(topLeft.y - boxH - 6, 6, Math.max(6, canvas.height - boxH - 6));
      ctx.fillStyle = 'rgba(10,12,16,.82)';
      roundRectPath(boxX, boxY, boxW, boxH, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, boxX + padX, boxY + boxH / 2 + 0.5);
    };
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!img) return;
      ctx.save();
      ctx.translate(canvas.width / 2 - view.cx * view.zoom, canvas.height / 2 - view.cy * view.zoom);
      ctx.scale(view.zoom, view.zoom);
      ctx.drawImage(img, 0, 0, imgW, imgH);
      ctx.restore();
      drawResolutionLabel();
    };
    const fitToScreen = () => {
      resizeCanvas();
      const fitZoom = Math.min(canvas.width / imgW, canvas.height / imgH) * 0.96;
      view.cx = imgW / 2; view.cy = imgH / 2; view.zoom = Utils.clamp(fitZoom, MIN_ZOOM, MAX_ZOOM);
    };

    Utils.loadBitmap(dataUrl).then((bitmap) => {
      img = bitmap;
      imgW = bitmap.naturalWidth || bitmap.width;
      imgH = bitmap.naturalHeight || bitmap.height;
      fitToScreen();
      render();
    }).catch((err) => {
      console.error('Falha ao carregar a foto no visor:', err);
      Utils.toast('Não foi possível carregar esta foto.', { type: 'danger' });
    });

    // Pan (arrastar) + zoom (roda do mouse/pinça) — mesma mecânica de
    // ambientephotos.js _attachPanZoom, sem o resto (orbs/medidas/traço).
    const pointers = new Map();
    let dragging = false, lastX = 0, lastY = 0, pinchStartDist = 0, pinchStartZoom = 1;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.style.cursor = 'grabbing'; }
      else if (pointers.size === 2) {
        dragging = false;
        const pts = [...pointers.values()];
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        pinchStartZoom = view.zoom;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const rect = canvas.getBoundingClientRect();
        const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
        const sx = (midX - rect.left) * (canvas.width / rect.width);
        const sy = (midY - rect.top) * (canvas.height / rect.height);
        const worldBefore = screenToWorld(sx, sy);
        view.zoom = Utils.clamp(pinchStartZoom * (dist / pinchStartDist), MIN_ZOOM, MAX_ZOOM);
        view.cx = worldBefore.x - (sx - canvas.width / 2) / view.zoom;
        view.cy = worldBefore.y - (sy - canvas.height / 2) / view.zoom;
        render();
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      view.cx -= dx / view.zoom; view.cy -= dy / view.zoom;
      render();
    });
    const endPointer = (e) => {
      pointers.delete(e.pointerId);
      pinchStartDist = 0;
      if (pointers.size === 1) { const [p] = pointers.values(); dragging = true; lastX = p.x; lastY = p.y; }
      else { dragging = false; canvas.style.cursor = 'grab'; }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', (e) => {
      if (!img) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
      const worldBefore = screenToWorld(sx, sy);
      view.zoom = Utils.clamp(view.zoom * (e.deltaY > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM);
      view.cx = worldBefore.x - (sx - canvas.width / 2) / view.zoom;
      view.cy = worldBefore.y - (sy - canvas.height / 2) / view.zoom;
      render();
    }, { passive: false });

    const onResize = () => { if (img) { resizeCanvas(); render(); } };
    window.addEventListener('resize', onResize);
    const fechar = () => { window.removeEventListener('resize', onResize); overlay.remove(); };
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) fechar(); });
    overlay.querySelector('#fdz-close').onclick = fechar;
  },

  async showItemDetail(id) {
    const item = await DB.getItem(id);
    if (!item) return;
    await DB.touchLastConsulted(id);
    const dupSet = await DB.getDuplicatePatrimonios();
    const isDup = !!(item.patrimonio && dupSet.has(item.patrimonio.trim()));
    // "Foto desse patrimônio" (ver js/db.js item.fotoAnexadaId) — só a
    // referência fica no item; a miniatura é buscada aqui na hora de exibir
    // (nunca duplicada no registro do item). Sem exagero: um <img> só.
    const fotoAnexada = item.fotoAnexadaId ? await DB.getAmbientePhoto(item.fotoAnexadaId) : null;
    // NOVO (04/09/2026), pedido verbatim: "No card de informações do
    // patrimônio deve ter mais uma informação: 'Marcação em foto'... entre
    // 'Foto' e 'Posição no mapa'." — checado aqui (não só no clique) pra já
    // saber se o botão nasce habilitado ou não, mesmo padrão dos botões
    // "👁️2D"/"👁️3D" logo abaixo.
    const marcacaoFoto = await DB.findOrbFotoByItem(item.id);
    // Ícone do item desenhado em SVG na hora — ver avatar.js.
    const iconState = await Avatar.loadIconState();
    const avatarSvg = Avatar.itemIconSvg(item, iconState);

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <div class="detail-avatar">${avatarSvg}</div>
        ${isDup ? `<div class="badge" style="display:block; text-align:center; background:rgba(199,125,255,.15); border-color:#c77dff; color:#e6c8ff; margin:4px 0">⚠️ Patrimônio duplicado — este número também está em outro item do catálogo</div>` : ''}
        <div style="text-align:center; font-family:monospace; color:var(--text-dim)">${Utils.escapeHtml(item.patrimonio || '—')}</div>
        <div style="text-align:center; font-weight:700; font-size:16px; margin:4px 0 10px">${Utils.escapeHtml(item.descricao || '(sem descrição)')}</div>
        <div class="detail-grid">
          <div class="k">Tipo</div><div class="v">${Utils.escapeHtml(item.tipo || '—')}</div>
          <div class="k">Setor</div><div class="v">${Utils.escapeHtml(item.setor || '—')}</div>
          <!-- Pedido do usuário: "quando já foi criado não tem um campo
               dizendo 'foto:'" — o formulário Novo/Editar já mostra "Foto
               desse patrimônio" (ver openItemForm acima), mas o DETALHE de
               um item já criado só mostrava a miniatura anexada (ver
               fotoAnexada, calculado no topo desta função) sem NENHUM texto
               rotulando o que ela é — ficava "solta" antes da grade de
               campos, sem o padrão "k"/"v" (rótulo/valor) usado em todo o
               resto. Agora é uma linha "Foto" igual às outras, com a
               miniatura dentro do valor quando houver uma anexada. -->
          <!-- BUG CORRIGIDO (03/09/2026), investigação pedida verbatim
               (item 7): "Onde ficam as fotos de patrimônios agora (onde se
               pode ver e interagir com elas)?" — a miniatura abaixo já
               existia (rodada anterior), mas era só um <img> ESTÁTICO, sem
               NENHUM jeito de ver em tamanho cheio (a foto tagueada
               tipo:'patrimonio' na captura, ver capture.js, foi EXCLUÍDA de
               'Mapa'->'Foto'/📦 Caixa na rodada anterior — DB.
               getPhotosByAmbiente/PhotoGrid.getUnsorted — então essa
               miniatura aqui é hoje o ÚNICO lugar acessível dela). Não
               estava tecnicamente "órfã" no banco (fotoAnexadaId sempre
               apontava certo, ✏️ Editar já permitia trocar/remover via
               #ef-foto-anexar/#ef-foto-remover), mas VER a foto de perto
               era impossível — cursor/id/clique adicionados agora (ver
               #di-foto-anexada-view abaixo) pra abrir em tela cheia, MESMO
               espírito de "tocar numa miniatura pra ampliar" já usado
               noutras partes do app (ex.: mapview.js #fotopin-thumb). -->
          <div class="k">Foto</div><div class="v">${fotoAnexada ? `<img class="detail-foto-anexada" id="di-foto-anexada-view" src="${fotoAnexada.thumbDataUrl || fotoAnexada.dataUrl}" title="Foto desse patrimônio — toque para ver em tela cheia" style="cursor:pointer">` : 'Nenhuma anexada'}</div>
          <!-- NOVO (04/09/2026), pedido verbatim: "No card de informações do
               patrimônio deve ter mais uma informação: 'Marcação em
               foto'... Um botão com o ícone do alfinete vermelho. Quando
               clicado, vai até a foto (em 'Mapa'->'Foto') e destaca
               visualmente o orb do patrimônio naquela foto." — linha entre
               "Foto" (acima, foto ANEXADA ao item — anexo direto, sem
               relação com orbs) e "Posição no mapa" (abaixo), exatamente
               como pedido. 📍 (alfinete vermelho) desabilitado quando o
               item não tem NENHUMA marcação (orb) em foto de ambiente
               nenhuma — ver DB.findOrbFotoByItem/App.verMarcacaoEmFoto. -->
          <div class="k">Marcação em foto</div><div class="v">${marcacaoFoto ? Utils.escapeHtml(marcacaoFoto.photo.nome || '(foto sem nome)') : '—'} <button type="button" class="icon-btn sm" id="di-marcacao-foto" ${marcacaoFoto ? '' : 'disabled'} title="${marcacaoFoto ? 'Ver a marcação deste patrimônio na foto' : 'Este patrimônio ainda não tem nenhuma marcação (orb) em foto nenhuma'}">📍</button></div>
          <!-- NOVO (03/09/2026), pedido verbatim: "Assim como em 'Mapa'->
               'Foto' tem o botão 'Editar a posição desta foto no mapa', deve
               haver um botão igual a este ao acessar os patrimônios já
               cadastrados." — botão "🗺️" ao lado da posição (ver
               #di-map-link abaixo), mesmo texto/mecanismo do botão análogo
               de ambientephotos.js (_openMapLinkFlow/#ambphotos-map-link):
               texto muda conforme já ter posição salva ou não. -->
          <div class="k">Posição no mapa</div><div class="v">${typeof item.mapaX === 'number' ? `x=${item.mapaX.toFixed(1)} y=${item.mapaY.toFixed(1)}` : '—'} <button type="button" class="icon-btn sm" id="di-map-link" title="${typeof item.mapaX === 'number' ? 'Editar a posição deste patrimônio no mapa' : 'Vincular este patrimônio a um lugar no mapa'}">🗺️</button>
          <!-- NOVO (03/09/2026), pedido verbatim (item 1): "coloque também a
               possibilidade de ver onde está no mapa 2D... e no mapa 3D...
               Estes novos botões só devem ficar habilitados quando houver
               alguma posição definida ainda." — mapaAuto=true (posição
               provisória de canto, ainda NÃO "de propósito" — ver
               autoPlaceOnMap acima) não conta como "posição definida" pra
               este botão, mesmo espírito do "—" mostrado acima quando não
               há mapaX/mapaY nenhum. -->
          <button type="button" class="icon-btn sm" id="di-map-view2d" ${(typeof item.mapaX === 'number' && !item.mapaAuto) ? '' : 'disabled'} title="Ver no mapa 2D">👁️2D</button>
          <button type="button" class="icon-btn sm" id="di-map-view3d" ${(typeof item.mapaX === 'number' && !item.mapaAuto) ? '' : 'disabled'} title="Ver no mapa 3D">👁️3D</button>
          </div>
          <div class="k">Geolocalização (GPS)</div><div class="v">${(typeof item.geoLat === 'number' && typeof item.geoLng === 'number') ? `<a href="${Geo.mapsLink(item.geoLat, item.geoLng)}" target="_blank" rel="noopener">${item.geoLat.toFixed(5)}, ${item.geoLng.toFixed(5)}</a>${typeof item.geoAccuracy === 'number' ? ` (±${Math.round(item.geoAccuracy)}m)` : ''}` : '—'}</div>
          <!-- Pedido do usuário (27/08/2026): removido o campo "Inserido em"
               (criadoEm) -- "Criado originalmente em" já cumpre esse papel
               (data fixa, definida uma única vez, não muda em edições/
               exportações/importações/unificações/sincronizações). O campo
               técnico criadoEm (quando o registro entrou NESTE aparelho/
               banco) continua existindo nos dados, só não tem mais uma linha
               própria aqui. -->
          <div class="k">Criado originalmente em</div><div class="v">${Utils.formatDateTime(item.criadoOriginalmenteEm || item.criadoEm)}</div>
          <div class="k">Modificado em</div><div class="v">${Utils.formatDateTime(item.modificadoEm)}</div>
          <div class="k">Última consulta</div><div class="v">${Utils.formatDateTime(item.ultimaConsultaEm)}</div>
          <!-- Pedido do usuário (27/08/2026): "Cadastrado por" mais completo,
               "de modo que o dispositivo seja mais único" — origemDispositivoInfo
               ganhou RAM/resolução (ver session.js _loadDeviceInfo) e agora
               mostra também a "impressão digital" do aparelho
               (origemDispositivoFingerprint — hash de GPU/núcleos/fontes/
               canvas/áudio/fuso/idioma; cálculo modularizado em 27/08/2026
               para js/devicefingerprint.js, ver Session._computeFingerprint):
               ajuda a diferenciar dois aparelhos parecidos mesmo quando o
               localStorage de um deles for apagado (o que reseta
               origemSessaoId/Session.id). Nenhum dos dois identifica a
               PESSOA, só o aparelho físico. -->
          <div class="k">Cadastrado por</div><div class="v">${item.origemSessaoLabel ? `📱 ${Utils.escapeHtml(item.origemSessaoLabel)}` : (item.origemSessaoId === Session?.id ? 'Este aparelho' : '—')}${item.origemDispositivoInfo ? `<br><span style="font-size:11px; color:var(--text-dim)">${Utils.escapeHtml(item.origemDispositivoInfo)}</span>` : ''}${item.origemDispositivoFingerprint ? `<br><span style="font-size:10px; color:var(--text-dim)" title="Identificador baseado em hardware/navegador — ajuda a diferenciar aparelhos parecidos, não identifica a pessoa">🔒 ${Utils.escapeHtml(item.origemDispositivoFingerprint)}</span>` : ''}</div>
          ${item.capturaIpPublico ? `<div class="k">IP público (rede)</div><div class="v" style="font-family:monospace">${Utils.escapeHtml(item.capturaIpPublico)}</div>` : ''}
        </div>
        <div style="display:flex; gap:8px; margin:10px 3px 3px; flex-wrap:wrap">
          <button class="btn secondary" id="di-edit" title="Editar os dados deste item">✏️ Editar</button>
          <button class="btn secondary" id="di-email" title="Enviar este item por email, conforme configurado">✉️ Enviar por email</button>
          <button class="btn danger" id="di-delete" title="Excluir este item definitivamente">🗑️ Excluir</button>
          <button class="btn block" id="di-close" style="flex:1" title="Fechar esta janela">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#di-close').onclick = () => modal.remove();
    modal.querySelector('#di-edit').onclick = () => { modal.remove(); this.openItemForm(item); };
    // NOVO (03/09/2026), pedido verbatim: "Assim como em 'Mapa'->'Foto' tem
    // o botão 'Editar a posição desta foto no mapa', deve haver um botão
    // igual a este ao acessar os patrimônios já cadastrados." — fecha esta
    // ficha, navega pra 'mapa' e entra no MESMO fluxo de cruz+"Marcar aqui"
    // já usado pra vincular/editar a posição de um item (ver
    // MapView.enterItemPlacementMode, generalizado no mesmo pedido a partir
    // do fluxo que já existia pra fotos — enterPhotoPlacementMode). Tanto ao
    // confirmar quanto ao cancelar, reabre esta MESMA ficha (`onConfirm`/
    // `onCancel`) — mesmo espírito do botão análogo em ambientephotos.js
    // (_openMapLinkFlow).
    modal.querySelector('#di-map-link').onclick = async () => {
      modal.remove();
      const reabrir = (itemId) => this.showItemDetail(itemId);
      await App.navigate('mapa');
      await MapView.enterItemPlacementMode(item.id, { onCancel: reabrir, onConfirm: reabrir });
    };
    // NOVO (03/09/2026), pedido verbatim (item 1) — ver App.verNoMapa2D/
    // verNoMapa3D/pickFlightMode3D acima; os botões já nascem `disabled`
    // (ver HTML acima) quando não há posição definida, então nem precisam
    // de checagem aqui dentro.
    // ATUALIZADO (04/09/2026), pedido verbatim (item 8): "A foto do
    // patrimônio deve ser exibida no mesmo modelo de 'Mapa'->'Foto', ou
    // seja, as dimensões da imagem logo acima à esquerda, poder ampliar e
    // reduzir também (nesses aspectos)." — o visor de tela cheia da rodada
    // anterior (um `<img>` simples, `object-fit:contain`, sem zoom nem
    // rótulo de resolução) foi trocado por `App.openFotoDimensZoomViewer`
    // (ver função abaixo): MESMO padrão visual/mecânico do canvas de
    // 'Mapa'->'Foto' (ambientephotos.js `_drawResolutionLabel`/
    // `_attachPanZoom`/`worldToScreen`/`MIN_ZOOM`/`MAX_ZOOM`) nestes 2
    // aspectos — rótulo "LxA" ancorado acima-esquerda da imagem (mesmo
    // estilo de caixa) + zoom por roda do mouse/pinça + arrastar para
    // mover — SEM reaproveitar o resto daquele componente (orbs, medidas,
    // traço-guia etc., que não fazem sentido pra uma foto de patrimônio
    // solta, sem ambiente/mapa).
    const fotoViewBtn = modal.querySelector('#di-foto-anexada-view');
    if (fotoViewBtn) fotoViewBtn.onclick = () => this.openFotoDimensZoomViewer(fotoAnexada.dataUrl || fotoAnexada.thumbDataUrl);
    // NOVO (04/09/2026), pedido verbatim — botão "📍" da linha "Marcação em
    // foto" (ver HTML acima); nasce `disabled` quando não há marcação (ver
    // `marcacaoFoto` calculado no topo desta função), então nem precisa de
    // checagem extra aqui dentro (mesmo padrão de #di-map-view2d/3d acima).
    modal.querySelector('#di-marcacao-foto').onclick = () => {
      modal.remove();
      this.verMarcacaoEmFoto(item.id);
    };
    modal.querySelector('#di-map-view2d').onclick = async () => {
      modal.remove();
      await this.verNoMapa2D({ x: item.mapaX, y: item.mapaY, ambienteId: item.ambienteId });
    };
    modal.querySelector('#di-map-view3d').onclick = async () => {
      modal.remove();
      await this.verNoMapa3D({ x: item.mapaX, y: item.mapaY, ambienteId: item.ambienteId });
    };
    modal.querySelector('#di-delete').onclick = async () => {
      if (!confirm('Excluir este item definitivamente?')) return;
      const snapshot = { ...item }; // pra poder desfazer a exclusão
      await DB.deleteItem(item.id);
      LocalBackup.removeItem(item.id);
      modal.remove();
      Utils.toast('Item excluído', { type: 'warn' });
      EventLog.log(`Item excluído: ${item.patrimonio || item.descricao || item.id}`, { tipo: 'aviso' });
      this._refreshCurrentView();
      // Se este item tinha um orb marcado numa foto do ambiente (a janela de
      // detalhes pode ter sido aberta tocando nesse orb), atualiza o rótulo
      // pra "(item removido)" na hora, sem precisar trocar de foto e voltar.
      AmbientePhotos.refreshIfOpen?.();
      History.push({
        label: 'excluir item',
        undo: async () => { await DB.putItemRaw(snapshot); LocalBackup.pushItem(snapshot); },
        redo: async () => { await DB.deleteItem(snapshot.id); LocalBackup.removeItem(snapshot.id); },
      });
    };
    modal.querySelector('#di-email').onclick = async () => {
      const texto = prompt('Texto para acompanhar o email (opcional):', '');
      if (texto === null) return;
      const r = await EmailModule.runConfiguredExport([item], { manualText: texto });
      if (r.erro) Utils.toast('Erro ao enviar ao servidor: ' + r.erro, { type: 'danger' });
      else Utils.toast('Envio processado ✓', { type: 'ok' });
    };
  },

  /**
   * Registra o Service Worker (ver sw.js) E garante que uma versão nova dele
   * (CACHE_VERSION mudou) seja detectada e assumida ATIVAMENTE, em vez de
   * confiar só no navegador pra decidir sozinho quando checar de novo —
   * pedido explícito do usuário ("em vez de depender do navegador para não
   * armazenar em cache"). Três partes:
   *   1. `updateViaCache: 'none'` — o PRÓPRIO arquivo sw.js nunca é servido
   *      do cache HTTP do navegador ao checar por atualização; sempre busca
   *      a versão mais nova dele na rede.
   *   2. Checagem ativa (`registration.update()`) ao voltar o foco na aba e
   *      periodicamente — não espera só a checagem automática do navegador
   *      (que só roda em navegações, e pode ficar bem espaçada numa aba que
   *      fica aberta por muito tempo, como é comum num PWA).
   *   3. Assim que o SW novo assume o controle desta aba (`controllerchange`
   *      — ver skipWaiting()/clients.claim() em sw.js), recarrega uma única
   *      vez automaticamente, garantindo que o JS/HTML/CSS em uso na tela
   *      sejam sempre os mais novos. `hadController` evita recarregar na
   *      primeiríssima instalação (quando ainda não havia nenhum SW
   *      controlando a página) — só dispara numa TROCA de versão de verdade.
   */
  _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      const checkForUpdate = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      setInterval(checkForUpdate, 20 * 60 * 1000); // a cada 20min, enquanto a aba ficar aberta
    }).catch((e) => console.warn('SW falhou:', e));

    let refreshed = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed || !hadController) return;
      refreshed = true;
      Utils.toast?.('🔄 Atualizando para a versão mais nova…', { type: 'ok', duration: 1500 });
      setTimeout(() => window.location.reload(), 600);
    });
  },

  /** Pedido do usuário (28/08/2026): "Arrume algum jeito de colocar um
   *  botão no app [...] para forçar o navegador a recarregar os arquivos
   *  todos, sem usar o cache. Para não precisar ficar excluindo, toda hora,
   *  os 'dados de navegação'." — botão em Configurações → 📦 Catálogo → "🔄
   *  Atualização do app" (ver settings.js) chama isto. A atualização
   *  automática de sempre (`_registerServiceWorker` acima) depende do
   *  navegador perceber que `sw.js` mudou (`registration.update()`) — na
   *  prática quase sempre funciona, mas em alguns cenários (um proxy/
   *  servidor intermediário guardando uma cópia velha, um navegador
   *  particular demorando a perceber) pode ficar "preso". Isto aqui é o
   *  equivalente, de DENTRO do app, a apagar manualmente os "dados de
   *  navegação" do site: desregistra TODO Service Worker deste
   *  origin (para de interceptar requisições) e apaga TODAS as entradas do
   *  Cache Storage (`caches.delete`, onde o app-shell fica guardado — ver
   *  sw.js `APP_SHELL`), e só então recarrega a página — sem esses dois,
   *  ela buscaria tudo direto da rede DE QUALQUER JEITO. NÃO mexe em
   *  IndexedDB (onde ficam os patrimônios/fotos/mapas) nem em nenhum dado
   *  cadastrado — só no que é "arquivo do próprio app". */
  async forceHardReload() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      }
    } catch (e) { console.warn('forceHardReload: falha ao desregistrar Service Worker:', e); }
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      }
    } catch (e) { console.warn('forceHardReload: falha ao apagar o Cache Storage:', e); }
    window.location.reload();
  },
};

window.App = App;
window.addEventListener('DOMContentLoaded', () => {
  // Rede de segurança final: se App.init() falhar de um jeito que nem o
  // try/catch interno dela previu, ainda assim mostramos algo em vez de
  // deixar a tela em branco sem explicação nenhuma.
  App.init().catch((e) => {
    console.error('App.init() falhou de forma não tratada:', e);
    document.getElementById('boot-bar')?.classList.add('hidden');
    const view = document.getElementById('view');
    if (view) {
      view.innerHTML = `
        <div class="empty-state">
          <div class="ic">⚠️</div>
          Erro ao iniciar o app.
          <div style="font-size:11px; color:var(--text-dim); margin-top:8px">${(e && (e.message || String(e))) || 'Erro desconhecido'}</div>
          <button class="btn secondary sm" style="margin-top:12px" onclick="location.reload()" title="Recarregar a página inteira">🔄 Recarregar</button>
        </div>`;
    }
  });
});
