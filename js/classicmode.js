/**
 * classicmode.js — Modo de apresentação "Clássico" (pré-Workspace/BSP):
 * uma única tela por vez, em tela cheia, com barra de navegação inferior
 * fixa (.bottomnav) — o mesmo visual/comportamento que o app tinha ANTES
 * da rearquitetura com o BSP Splitter (Workspace em blocos
 * redimensionáveis, estilo Blender, ver js/bsplayout.js).
 *
 * NOVO (09/09/2026), pedido verbatim: "Coloque o antigo método de
 * apresentação das coisas sem o BSP splitter screen / dockable, use a
 * pasta da versão que te enviei. Essa alteração de layout pode ser feita
 * pelas 'configurações do app' em uma seção para isso. Faça um
 * transicionador fácil e rápido entre os dois modos de visualização do
 * app BSP/dockable ou o outro jeito. Não sei como descrever o design
 * antigo." Escopo confirmado via pergunta ao usuário (AskUserQuestion):
 * "Sim, exatamente como v60" — pasta "versões/v60 (câmeras com
 * WebGLRenderTarget e layout divisível)" — barra inferior com Tabela/
 * Cartões/Fotos/Mapa/Buscar, cada tela em tela cheia, SEM nenhuma divisão
 * — coexistindo com o modo Workspace/BSP (não o substitui: é uma
 * alternativa que a pessoa liga/desliga a qualquer momento, sem perder o
 * layout do Workspace, que fica intacto enquanto este modo está ativo).
 *
 * COMO FUNCIONA (por que não precisou reescrever a navegação do zero):
 * `App.navigate()`/`App.views`/`App._navStack`/`<main id="view">` NUNCA
 * foram removidos do app durante a rearquitetura do Workspace — continuam
 * ativos por baixo dele, idênticos à versão de referência (confirmado por
 * diff com "versões/v60.../js/app.js") — só ficaram "invisíveis" porque
 * `#view` mora dentro de `#dom-parking` (escondido, ver index.html) e o
 * `<nav class="bottomnav">` foi removido do HTML (o CSS dele continua
 * intacto em style.css, só sem nada no DOM pra usá-lo — ver comentário
 * "LEGADO" lá). Ainda é esse MESMO motor que `App._goToConfNomeField`
 * usa (`this.navigate('configuracoes')`) — só que, sem este módulo, o
 * resultado ficava montado escondido dentro do `#dom-parking`.
 *
 * Este módulo não recria nada disso — só MOVE (nunca clona, preservando
 * TODOS os listeners já ligados 1x no boot) os elementos físicos que
 * `App.navigate()`/o cabeçalho global precisam pra ficarem visíveis:
 * `header.topbar` (o cabeçalho inteiro, com `#topbar-mapa`/
 * `#conf-nome-banner` já dentro dele), `<main id="view">` e
 * `#bottombar-mapa` (barra de zoom da Planta baixa) — para dentro de
 * `#classic-shell` (ver index.html), junto com uma `<nav class="bottomnav">`
 * nova (mesma estrutura/CSS de sempre) construída aqui.
 *
 * TRANSIÇÃO SEM CONFLITO COM O WORKSPACE: o Workspace/BSP também usa
 * `header.topbar` (movido pra dentro da folha 'Info' quando ela existe,
 * ver `EDITOR_TYPES.info` em bsplayout.js) — os dois modos NUNCA ficam
 * visíveis ao mesmo tempo, então ao entrar no modo Clássico este módulo
 * primeiro chama `BSPLayout._unmountAll(BSPLayout._tree)` (a MESMA
 * limpeza que `BSPLayout._render()` já roda antes de qualquer remontagem
 * — ver bsplayout.js, corrigido nesta mesma sessão) pra fazer o Workspace
 * devolver tudo que tinha emprestado, ANTES de mover os elementos pra cá.
 * A árvore de divisões do Workspace (`BSPLayout._tree`) fica INTACTA (só
 * `#app`, a raiz dele, fica escondida) — ao sair do modo Clássico, chamar
 * `BSPLayout._render()` de novo reconstrói o Workspace do zero e ele
 * reencontra o cabeçalho/controles sozinho (a busca é sempre por
 * `getElementById`/`querySelector`, nunca por referência salva de
 * antemão — funciona não importa de onde os elementos estejam vindo).
 *
 * [11/09/2026] ÍNDICE DE FUNÇÕES — cabeçalho adicionado pra evitar buscas
 * exaustivas (mesmo padrão de ambientephotos.js/mapping.js/db.js).
 * - isActive: se o modo Clássico está ativo agora.
 * - openSplashScreen/_showSplashScreenModal: [10/09/2026] splash screen
 *   ("Tela de Abertura") "Conferência de patrimônios" vs. "Mapeamento de
 *   ambientes" — chamada 1x no boot (App._boot(), independente de
 *   Clássico/BSP) e reaberta pela Ajuda ('?') → "Tela de Abertura".
 * - _ensureOperationMode: garante que a splash acima já rodou nesta boot
 *   antes de montar a tela Clássica (pula sozinho se já há nome de
 *   conferência salvo).
 * - _syncLSCache/readCachedPref: espelha o modo de layout ('classic'/'bsp')
 *   em `localStorage` (leitura síncrona, pro <script> inline de index.html
 *   decidir ANTES do IndexedDB abrir, evitando "flash" do Workspace).
 * - _clearBootPrefClass: remove a classe que esconde `#app` até a decisão
 *   de layout (Clássico vs. Workspace) ser conhecida.
 * - _ensureShell: monta (1x, idempotente) a `<nav class="bottomnav">`
 *   dentro de `#classic-shell` com os 5 destinos (Tabela/Cartões/Fotos/
 *   Mapa/Buscar), ligados a `App.navigate()`.
 * - _moveSingletonsInto: move o cabeçalho/`#view`/`#bottombar-mapa` pra
 *   dentro de um container (usado por `enter()`/`exit()` pra trocar entre
 *   o shell Clássico e o `#dom-parking` do Workspace).
 * - _restoreHeaderRowLayout: devolve os elementos do cabeçalho (título,
 *   botão quádruplo, 🔀/👁️/⚙️/❓) que o BSP pode ter movido pra dentro de
 *   uma folha 'Info' de volta pra `.topbar-default-row`, na ordem original.
 * - enter: ativa o modo Clássico (garante modo de operação, monta o shell,
 *   move os singletons pra dentro dele, esconde o Workspace).
 * - exit: volta pro modo Workspace/BSP (inverso de `enter`).
 * - toggle: alterna entre Clássico e Workspace (botão 🔀 do cabeçalho).
 * - restoreFromSettings: aplica, no boot da página, o modo salvo em
 *   `DB.getSetting('layoutMode')` — chamado por `App._boot()`.
 */
const ClassicMode = {
  _active: false,
  _shellEl: null,

  // NOVO (09/09/2026), pedido verbatim: eliminar o "flash" do Workspace/BSP
  // antes de trocar pro modo Clássico ao iniciar o app. `_LS_KEY` espelha o
  // MESMO valor de `layoutMode` (que já era salvo no IndexedDB, ver
  // `DB.setSetting`/`DB.getSetting` abaixo) também em `localStorage` —
  // síncrono, então o script inline no <head> de index.html (ANTES do
  // <link> da folha de estilo) consegue ler ele e já nascer com `#app`
  // escondido via CSS (`html.catalogo-boot-classic #app`, ver
  // css/style.css), sem esperar o IndexedDB abrir. Ver `_applyLSCache`/
  // `_clearBootPrefClass` abaixo.
  _LS_KEY: 'catalogo_layoutMode',

  isActive() { return this._active; },

  // [09/09/2026] Ajuste solicitado pelo usuário: "O app será usado em dois
  // modos principais: um, para conferência de patrimônio; e outro, para
  // tirar fotos e fazer a planta baixa. [...] resolver a obrigatoriedade
  // de colocar o nome da conferência de patrimônio [...] no modo antigo,
  // como resolver? Entre modos de operação principais do app: 'Conferência
  // de patrimônio' ou 'mapeamento de ambientes'." Decisão confirmada com o
  // usuário: ao entrar no modo Clássico, mostrar uma tela/modal pedindo pra
  // escolher entre os 2 modos — "Conferência de patrimônio" (pede o nome,
  // reaproveitando o MESMO campo/config `conferenciaNome` já usado em
  // `App._goToConfNomeField()`/settings.js `#st-conf-nome`, pra manter os 2
  // modos de apresentação consistentes) e "Mapeamento de ambientes" (não
  // pede nome nenhum). Guardado em `DB.setSetting('classicOperationMode', ...)`,
  // mesmo padrão já usado aqui pra `layoutMode`. Mostrado 1x por "boot" da
  // página (não a cada troca BSP<->Clássico dentro da mesma sessão — ver
  // `_opModePickedThisBoot` abaixo), chamado do início de `enter()`.
  _OPMODE_KEY: 'classicOperationMode',
  _opModePickedThisBoot: false,
  // [15/09/2026 UTC] NOVO -- pedido verbatim: "os botões do rodapé devem
  // adquirir uma nova configurações [quando 'Mapeamento de ambientes' é
  // escolhido]." O rodapé (tanto `<nav class="bottomnav">` do modo
  // Clássico, logo abaixo, quanto o painel 'Botões' do Workspace — ver
  // js/bsplayout.js) precisa saber o modo de operação escolhido de forma
  // SÍNCRONA (o próprio HTML dos botões é montado de forma síncrona nos 2
  // lugares) — mesma técnica já usada por `_LS_KEY`/`_syncLSCache`/
  // `readCachedPref` acima pra `layoutMode`, aqui duplicada pra
  // `_OPMODE_KEY`. Espelhado em `localStorage` toda vez que o modo é
  // escolhido/confirmado (ver `finish()` dentro de
  // `_showSplashScreenModal` mais abaixo) e lido de volta, sempre que
  // preciso, por `readCachedOpMode()`.
  _OPMODE_LS_KEY: 'catalogo_opMode',
  _syncOpModeLSCache(modo) {
    try { localStorage.setItem(this._OPMODE_LS_KEY, modo); } catch (e) { /* localStorage indisponível — ignora, só perde a otimização */ }
  },
  readCachedOpMode() {
    try { return localStorage.getItem(this._OPMODE_LS_KEY); } catch (e) { return null; }
  },
  /** Devolve `true` só quando o modo de operação escolhido é
   *  'Mapeamento de ambientes' — usado pelos 2 lugares que desenham o
   *  rodapé de botões (aqui e js/bsplayout.js) pra decidir entre os 2
   *  conjuntos de botões (ver `_FOOTER_DEFS_PADRAO`/
   *  `_FOOTER_DEFS_MAPEAMENTO` abaixo). */
  isModoMapeamento() { return this.readCachedOpMode() === 'mapeamento'; },
  // Definição dos 5 botões do rodapé — 2 conjuntos, um por modo de
  // operação (ver `isModoMapeamento()` acima). `slot` é uma posição FIXA
  // (0 a 4) independente da chave (`key`) do botão que ocupa aquela
  // posição no momento — usado por `_ensureShell`/`updateFooterForMode`
  // abaixo (e pelo equivalente em bsplayout.js) pra sempre achar "o botão
  // que ocupa o slot 0" (a posição de 'Tabela'/'3D') e "o slot 1"
  // ('Cartões'/'Caixa') na hora de trocar — só os slots 0 e 1 mudam entre
  // os 2 conjuntos; os outros 3 (Foto/Mapa/Buscar) são idênticos nos 2.
  _FOOTER_DEFS_PADRAO: [
    { slot: 0, key: 'tabela', ic: '📋', texto: 'Tabela', titulo: 'Ver todos os itens catalogados em tabela' },
    { slot: 1, key: 'flashcards', ic: '🗂️', texto: 'Cartões', titulo: 'Ver os itens catalogados em cartões com foto' },
    { slot: 2, key: 'capturar', ic: '📷', texto: 'Foto', titulo: 'Abrir a câmera para catalogar um novo item' },
    { slot: 3, key: 'mapa', ic: '🗺️', texto: 'Mapa', titulo: 'Ver/editar a planta do ambiente' },
    { slot: 4, key: 'buscar', ic: '🔎', texto: 'Buscar', titulo: 'Buscar um item pelo patrimônio, descrição ou setor' },
  ],
  // NOVO (15/09/2026 UTC), pedido verbatim: "ao selecionar 'Mapeamento de
  // ambientes', os botões do rodapé devem adquirir uma nova configurações.
  // A botão 'Tabela' deve ser trocado pelo botão '3D'. O botão 'Cartões'
  // deve ser trocado pelo botão 'Caixa'." — só os slots 0/1 mudam de
  // chave/ícone/texto; 'ver3d'/'caixa' já existiam como telas próprias
  // (ver App.views em app.js e BSPLayout.EDITOR_TYPES em bsplayout.js —
  // reaproveitadas aqui, nenhuma tela nova precisou ser criada).
  _FOOTER_DEFS_MAPEAMENTO: [
    { slot: 0, key: 'ver3d', ic: '🧊', texto: '3D', titulo: 'Ver a planta em 3D' },
    { slot: 1, key: 'caixa', ic: '📦', texto: 'Caixa', titulo: 'Ver patrimônios/fotos ainda sem lugar no mapa' },
    { slot: 2, key: 'capturar', ic: '📷', texto: 'Foto', titulo: 'Abrir a câmera para catalogar um novo item' },
    { slot: 3, key: 'mapa', ic: '🗺️', texto: 'Mapa', titulo: 'Ver/editar a planta do ambiente' },
    { slot: 4, key: 'buscar', ic: '🔎', texto: 'Buscar', titulo: 'Buscar um item pelo patrimônio, descrição ou setor' },
  ],
  footerDefsFor(modoMapeamento) { return modoMapeamento ? this._FOOTER_DEFS_MAPEAMENTO : this._FOOTER_DEFS_PADRAO; },

  /** [10/09/2026] Pedido verbatim: "transforme-o em um splash screen (Tela
   *  de Abertura) de janela independente, de modo que o app carregue
   *  normalmente, mas esta janela apareça com um botão de 'fechar'.
   *  Clicando fora dela também a fecha." — ANTES, este modal só existia
   *  colado dentro de `enter()` (só aparecia pra quem entrava no modo
   *  Clássico) e não tinha como fechar sem escolher uma opção. Agora:
   *  - `openSplashScreen()` (público, ver abaixo) é a nova porta de entrada
   *    — chamada 1x no boot por `App._boot()` (ver app.js), INDEPENDENTE
   *    do modo Clássico/BSP — e SEM bloquear o resto do boot (chamada sem
   *    `await`, "dispara e esquece", igual às outras etapas "bônus" — o
   *    app carrega normalmente por trás dela).
   *  - Também reaberta manualmente a qualquer momento por Ajuda ('?') →
   *    "Tela de Abertura" (ver `_toggleHelpMenu` em mapview.js), com
   *    `force:true`.
   *  - `_showSplashScreenModal` (privado) é só o desenho/comportamento da
   *    janela em si — botão "✕" no canto e clique fora dela (no backdrop)
   *    fecham sem escolher nada, igual ao padrão já usado noutros modais
   *    do app (ver `js/mapconfig.js` `#mc-close-top`).
   *  - Pedido verbatim: "o texto 'Nome desta conferência' e a entrada de
   *    texto logo abaixo devem ser removidas" — quem escolhe "Conferência
   *    de patrimônios" aqui não digita mais o nome nesta tela; o aviso
   *    persistente no cabeçalho (`#conf-nome-banner`, ver
   *    `App._updateConfNomeBanner` em app.js) continua guiando pra
   *    `⚙️ Configurações → 📦 Catálogo → 🗂️ Conferência de patrimônio` até
   *    um nome ser definido — MAS agora só quando o modo escolhido não for
   *    "Mapeamento de ambientes" (pedido verbatim: nesse modo o aviso
   *    nunca aparece, mesmo sem nome — ver `_updateConfNomeBanner`).
   *
   *  [10/09/2026] NOVO pedido verbatim: "A splash screen deve sempre
   *  aparecer. Uma opção nas 'configurações do app' deve servir para
   *  habilitar/desabilitar que sempre aparece no boot." — CAUSA RAIZ da
   *  rodada anterior: `openSplashScreen()` só mostrava a janela quando o
   *  app "nunca tinha sido usado" (nenhum modo salvo ainda) — depois da
   *  1ª escolha ela nunca mais aparecia sozinha. Agora: sempre que a
   *  preferência `_SPLASH_SEMPRE_KEY` (nova, ver checkbox "🎬 Mostrar a
   *  Tela de Abertura ao iniciar o app" em ⚙️ Configurações → 🖥️ Layout do
   *  app) estiver ligada (padrão), a splash aparece EM TODO BOOT — não só
   *  na 1ª vez. Desligar essa preferência faz `openSplashScreen()` (sem
   *  `force`) não mostrar nada; reabrir manualmente por Ajuda → "Tela de
   *  Abertura" continua funcionando (`force:true` ignora a preferência de
   *  propósito — quem pediu pra ver de novo quer ver, mesmo desligada).
   *  Pedido verbatim (continua valendo): "O padrão é o 'Mapeamento de
   *  ambientes', em caso se feche a splash screen e não se clique em
   *  nenhuma opção" — isso só GRAVA o padrão quando ainda não havia
   *  nenhum modo salvo (1ª vez de verdade); nos boots seguintes (modo já
   *  escolhido antes), fechar sem escolher só fecha a janela e mantém o
   *  modo que já estava salvo — a splash reaparecer todo boot não significa
   *  que a escolha se perde a cada vez. */
  _SPLASH_SEMPRE_KEY: 'splashSempreAoAbrir',

  async openSplashScreen(opts = {}) {
    if (document.getElementById('classicmode-splash-backdrop')) return null; // já aberta — não duplica
    const force = !!opts.force;
    if (!force) {
      let sempreMostrar = true;
      try { sempreMostrar = typeof DB !== 'undefined' ? await DB.getSetting(this._SPLASH_SEMPRE_KEY, true) : true; } catch (e) { /* melhor esforço — na dúvida, mostra (padrão) */ }
      if (!sempreMostrar) return null; // preferência desligada — não mostra sozinha (só via Ajuda -> "Tela de Abertura", force:true)
    }
    let modoJaSalvo = '';
    try { modoJaSalvo = typeof DB !== 'undefined' ? await DB.getSetting(this._OPMODE_KEY, '') : ''; } catch (e) { /* melhor esforço */ }
    // Instalação "antiga" (já tem nome de conferência salvo de ANTES deste
    // modo de operação existir, ver `_ensureOperationMode` — mesma regra
    // de detecção) conta como "já decidido" mesmo sem `_OPMODE_KEY` — só
    // afeta o padrão usado se a janela for fechada sem escolher (abaixo),
    // não impede mais a janela de aparecer (ver pedido "sempre aparecer").
    if (!modoJaSalvo) {
      let nomeJaDefinido = '';
      try { nomeJaDefinido = typeof DB !== 'undefined' ? await DB.getSetting('conferenciaNome', '') : ''; } catch (e) { /* melhor esforço */ }
      if (nomeJaDefinido && nomeJaDefinido.trim()) {
        modoJaSalvo = 'conferencia';
        try { await DB.setSetting(this._OPMODE_KEY, 'conferencia'); } catch (e) { /* melhor esforço */ }
      }
    }
    return this._showSplashScreenModal({ jaTinhaModoSalvo: !!modoJaSalvo });
  },

  /** Desenha e liga a janela da splash screen (Tela de Abertura) — ver
   *  `openSplashScreen` acima pra quando/por que ela é chamada. Devolve
   *  uma Promise que resolve com o modo escolhido ('conferencia'/
   *  'mapeamento'), ou `null` se fechada sem escolher (só quando já havia
   *  um modo salvo antes — ver `jaTinhaModoSalvo`). */
  _showSplashScreenModal({ jaTinhaModoSalvo } = {}) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.id = 'classicmode-splash-backdrop';
      modal.className = 'modal-backdrop classicmode-opmode-backdrop';
      modal.innerHTML = `
        <div class="modal-sheet classicmode-opmode-sheet">
          <div class="handle"></div>
          <button type="button" class="btn secondary sm classicmode-splash-close" id="classicmode-splash-close" title="Fechar (padrão: Mapeamento de ambientes)">✕</button>
          <h3 style="margin:0 0 4px">Modo de operação</h3>
          <p style="font-size:12.5px; color:var(--text-dim); margin:0 0 14px">
            Escolha o que você vai fazer nesta sessão do modo de apresentação clássico.
          </p>
          <div class="classicmode-opmode-choices">
            <button type="button" class="classicmode-opmode-choice" data-mode="conferencia">
              <span class="ic">🗂️</span>
              <span class="lbl">Conferência de patrimônios</span>
              <span class="desc">Conferir/catalogar itens de uma conferência com nome.</span>
            </button>
            <button type="button" class="classicmode-opmode-choice" data-mode="mapeamento">
              <span class="ic">🗺️</span>
              <span class="lbl">Mapeamento de ambientes</span>
              <span class="desc">Tirar fotos e fazer a planta baixa — sem nome de conferência.</span>
            </button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const finish = async (modo) => {
        try { if (typeof DB !== 'undefined') await DB.setSetting(this._OPMODE_KEY, modo); } catch (e) { console.warn('[ClassicMode] falha ao salvar o modo de operação escolhido:', e); }
        // [15/09/2026 UTC] NOVO — mantém o cache síncrono (localStorage,
        // ver `_syncOpModeLSCache`/`readCachedOpMode` acima) em dia,
        // MESMO padrão de `_syncLSCache` já usado aqui pra `layoutMode` —
        // e, com o cache atualizado, anima a troca do rodapé JÁ visível
        // (modo Clássico) e do painel 'Botões' do Workspace (BSPLayout,
        // se algum estiver montado) pros botões do modo recém-escolhido —
        // pedido verbatim: "ao selecionar 'Mapeamento de ambientes', os
        // botões do rodapé devem adquirir uma nova configurações [...] A
        // troca [...] deve ser animada."
        this._syncOpModeLSCache(modo);
        const modoMapeamento = modo === 'mapeamento';
        try { this.updateFooterForMode(modoMapeamento); } catch (e) { console.warn('[ClassicMode] falha ao animar o rodapé do modo Clássico:', e); }
        try { window.BSPLayout?.updateBotoesForMode?.(modoMapeamento); } catch (e) { console.warn('[ClassicMode] falha ao animar o rodapé do Workspace:', e); }
        // [15/09/2026 UTC] NOVO — pedido verbatim: "Ao selecionar o
        // 'Mapeamento de ambientes', na Tela de Abertura, acaba ficando o
        // 'Tabela' sendo mostrado ainda no corpo da tela. Deve ser
        // mostrado o 'Planta baixa'." — navega o corpo da tela (por trás
        // da splash, Clássico OU Workspace — os 2 usam o MESMO
        // `App.navigate`) direto pra "Mapa"->"Planta baixa" quando o modo
        // escolhido é 'mapeamento' (`_forcarTelaInicial`, ver
        // mapview.js `mount()`). Não mexe em nada quando o modo é
        // 'conferencia' (comportamento de sempre — fica onde estava).
        if (modoMapeamento) {
          try {
            if (typeof MapView !== 'undefined') MapView._forcarTelaInicial = 'planta';
            await window.App?.navigate?.('mapa');
          } catch (e) { console.warn('[ClassicMode] falha ao navegar pra "Planta baixa" após escolher "Mapeamento de ambientes":', e); }
        }
        modal.remove();
        this._opModePickedThisBoot = true;
        // Atualiza o aviso "defina o nome da conferência" na hora (ele
        // depende do modo escolhido agora, além do nome — ver
        // App._updateConfNomeBanner) sem precisar trocar de tela.
        try { window.App?._safe?.('App._updateConfNomeBanner (splash)', () => App._updateConfNomeBanner()); } catch (e) { /* ignora */ }
        resolve(modo);
      };
      modal.querySelectorAll('.classicmode-opmode-choice').forEach((btn) => {
        btn.addEventListener('click', () => finish(btn.dataset.mode));
      });
      const fecharSemEscolher = async () => {
        if (!jaTinhaModoSalvo) {
          // 1ª vez de verdade (nenhum modo salvo antes de abrir esta
          // janela) — pedido verbatim: usa "Mapeamento de ambientes" como
          // padrão em vez de deixar sem decisão nenhuma.
          await finish('mapeamento');
        } else {
          modal.remove();
          this._opModePickedThisBoot = true;
          resolve(null);
        }
      };
      modal.querySelector('#classicmode-splash-close').onclick = fecharSemEscolher;
      // Pedido verbatim: "Clicando fora dela também a fecha" — mesmo
      // padrão já usado noutros modais do app (ex. mapconfig.js): só conta
      // clique cujo alvo é o PRÓPRIO backdrop (fora da folha), não um
      // clique que começou dentro da folha e "vazou".
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) fecharSemEscolher(); });
    });
  },

  /** Garante que `this._OPMODE_KEY` tenha algum valor plausível ANTES de
   *  montar a tela Clássica (backfill pra instalações antigas — ver
   *  abaixo) — chamada do início de `enter()`. Idempotente/barata depois
   *  da 1ª vez (`_opModePickedThisBoot`).
   *  [10/09/2026] NÃO abre mais a splash screen daqui — pedido verbatim
   *  desta rodada: "de modo que o app carregue normalmente" (a splash não
   *  pode travar a entrada no modo Clássico). Quem decide se/quando a
   *  splash aparece sozinha agora é só `App._boot()` (chamada única, não
   *  bloqueante, INDEPENDENTE de Clássico/BSP — ver app.js) — este método
   *  só garante que, mesmo sem a splash já ter rodado (ex.: alguém troca
   *  pro modo Clássico pelo botão 🔀 antes da chamada de boot terminar,
   *  ou com a preferência "sempre mostrar" desligada), uma instalação que
   *  já tem `conferenciaNome` salvo de antes não fica sem `_OPMODE_KEY`
   *  nenhum (evita o aviso "defina o nome" se comportar de forma
   *  inconsistente — ver `App._updateConfNomeBanner`). */
  async _ensureOperationMode() {
    if (this._opModePickedThisBoot) return;
    const nomeJaDefinido = typeof DB !== 'undefined' ? await DB.getSetting('conferenciaNome', '') : '';
    if (nomeJaDefinido && nomeJaDefinido.trim()) {
      this._opModePickedThisBoot = true;
      try { await DB.setSetting(this._OPMODE_KEY, 'conferencia'); } catch (e) { /* melhor esforço — só mantém consistente, não bloqueia */ }
    }
    // Propositalmente SEM `await` aqui (e sem nenhum efeito no retorno
    // desta função) — ver comentário grande acima. Se a splash ainda não
    // tiver rodado nesta boot (raro: só quando `enter()` é chamado ANTES
    // da linha de boot em app.js, ex. troca manual bem no início), isto
    // garante que ela ainda apareça (respeitando a preferência "sempre
    // mostrar") — mas sem fazer `enter()`/a tela Clássica esperar por ela.
    this.openSplashScreen();
  },

  /** Espelha `modo` ('classic'/'bsp') em `localStorage[_LS_KEY]` — melhor
   *  esforço, síncrono, chamado toda vez que o modo muda de verdade
   *  (`enter()`/`exit()`) e também 1x no boot (`restoreFromSettings()`,
   *  pra manter o cache em dia mesmo se ele nunca tiver sido escrito
   *  antes, ex.: 1ª visita depois desta correção existir). */
  _syncLSCache(modo) {
    try { localStorage.setItem(this._LS_KEY, modo); } catch (e) { /* localStorage indisponível — ignora, só perde a otimização */ }
  },

  /** NOVO (09/09/2026), pedido verbatim (bug relatado): "Demorou muito para
   *  aparecer alguma coisa na tela, só para saber se é o layout antigo ou o
   *  layout novo." — leitura SÍNCRONA do cache (ver `_syncLSCache` acima),
   *  usada por `App._boot()` para decidir, ANTES de montar qualquer coisa,
   *  se entra direto no modo Clássico (pulando o Workspace/BSPLayout por
   *  completo nesta carga de página — ver app.js) em vez de montar o
   *  Workspace, navegar, só depois trocar pro Clássico (o que fazia a tela
   *  Clássica demorar mais pra aparecer que antes desta correção). Retorna
   *  'classic'/'bsp'/null (nunca guardado ainda). */
  readCachedPref() {
    try { return localStorage.getItem(this._LS_KEY); } catch (e) { return null; }
  },

  /** Remove a classe que o script inline de index.html pode ter colocado
   *  em `<html>` pra esconder `#app` antes do JS terminar de decidir o
   *  modo real — chamada sempre que a decisão de verdade é conhecida
   *  (fim de `restoreFromSettings()`, nos dois casos: confirma 'classic'
   *  — `#app` já está escondido por `enter()` de outro jeito, então
   *  remover a classe não causa nenhum flash — ou desmente um cache
   *  desatualizado dizendo 'classic' quando na verdade é 'bsp', e então
   *  `#app` reaparece aqui, o mais cedo possível). */
  _clearBootPrefClass() {
    document.documentElement.classList.remove('catalogo-boot-classic');
  },

  /** Cria 1 `<button>` do rodapé a partir de uma def (`_FOOTER_DEFS_PADRAO`/
   *  `_FOOTER_DEFS_MAPEAMENTO` acima) — `data-slot` fica marcado nele pra
   *  `updateFooterForMode` conseguir achar de volta "o botão que ocupa
   *  este slot" na hora de trocar o modo, mesmo depois da chave (`key`)
   *  ter mudado (Tabela->3D/Cartões->Caixa). */
  _buildFooterBtn(def) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.view = def.key;
    btn.dataset.slot = String(def.slot);
    btn.title = def.titulo || '';
    btn.innerHTML = `<span class="ic">${def.ic}</span>${Utils.escapeHtml(def.texto)}`;
    btn.addEventListener('click', () => App.navigate(btn.dataset.view));
    return btn;
  },

  /** Constrói (só na 1ª vez — idempotente) a `<nav class="bottomnav">`
   *  dentro de `#classic-shell` (já existe vazio em index.html) — MESMOS
   *  5 destinos/ícones/textos da versão de referência (v60), sem o antigo
   *  botão "🧩 Workspace" (que não faz mais sentido aqui: o Workspace
   *  agora é o OUTRO modo inteiro, não mais "mais uma tela" dentro da
   *  barra — trocar de modo é o botão 🔀 do cabeçalho, ver
   *  index.html/app.js `_wireNav`).
   *  [15/09/2026 UTC] MUDADO -- pedido verbatim: "ao selecionar
   *  'Mapeamento de ambientes', os botões do rodapé devem adquirir uma
   *  nova configurações." Os 5 botões, antes HTML estático fixo, agora
   *  vêm de `footerDefsFor(isModoMapeamento())` — lê o modo já escolhido
   *  (cache síncrono em localStorage, ver `readCachedOpMode` acima) logo
   *  na 1ª montagem, sem animação (nada "trocando" ainda, é a 1ª vez que
   *  o rodapé aparece nesta carga de página). */
  _ensureShell() {
    if (this._shellEl) return this._shellEl;
    const el = document.getElementById('classic-shell');
    if (!el) return null;
    const nav = document.createElement('nav');
    nav.className = 'bottomnav';
    this.footerDefsFor(this.isModoMapeamento()).forEach((def) => nav.appendChild(this._buildFooterBtn(def)));
    el.innerHTML = '';
    el.appendChild(nav);
    this._shellEl = el;
    return el;
  },

  /** [15/09/2026 UTC] NOVO -- pedido verbatim: "ao selecionar 'Mapeamento
   *  de ambientes', os botões do rodapé devem adquirir uma nova
   *  configurações [...] A troca dos botões no rodapé deve ser animada."
   *  Chamada por `finish()` (dentro de `_showSplashScreenModal`, logo
   *  abaixo) sempre que o modo é escolhido/confirmado — troca só os slots
   *  0/1 (Tabela<->3D, Cartões<->Caixa) do `<nav class="bottomnav">" JÁ
   *  montado (se o modo Clássico não estiver ativo/montado ainda, não há
   *  nada a animar aqui — a próxima montagem de `_ensureShell()` já nasce
   *  com o modo certo, sem animação, lendo `readCachedOpMode()`). Cada
   *  slot só é trocado se a chave (`key`) de verdade mudou — evita
   *  reanimar um botão que já está certo (ex.: escolher 'Mapeamento de
   *  ambientes' de novo, sem ter mudado de modo antes). */
  updateFooterForMode(modoMapeamento) {
    if (!this._shellEl) return;
    const nav = this._shellEl.querySelector('.bottomnav');
    if (!nav) return;
    const defs = this.footerDefsFor(modoMapeamento);
    defs.forEach((def) => {
      const atual = nav.querySelector(`.bottomnav button[data-slot="${def.slot}"]`);
      if (atual && atual.dataset.view === def.key) return; // já está certo, nada a trocar
      Utils.animateFooterButtonSwap(atual, () => this._buildFooterBtn(def));
    });
  },

  /** Move `header.topbar`/`<main id="view">`/`#bottombar-mapa` (sempre que
   *  existirem — busca por id/seletor, não por referência salva) pra
   *  dentro de `parentEl`, logo ANTES de `beforeEl` (ou no fim, se
   *  `beforeEl` for nulo) — usado tanto por `enter()` (destino:
   *  `#classic-shell`, antes da `.bottomnav`) quanto por `exit()` (destino:
   *  `#dom-parking`). */
  _moveSingletonsInto(parentEl, beforeEl) {
    const header = document.querySelector('header.topbar');
    const view = document.getElementById('view');
    const bottombarMapa = document.getElementById('bottombar-mapa');
    if (header) parentEl.insertBefore(header, beforeEl || null);
    if (view) parentEl.insertBefore(view, beforeEl || null);
    if (bottombarMapa) parentEl.insertBefore(bottombarMapa, beforeEl || null);
  },

  /** CORRIGIDO (09/09/2026), bug relatado: "faltou os textos que aparecem
   *  ao clicar em cada botão do rodapé [...] Também, alinhados à direita
   *  do cabeçalho do app, tinha os 3 botões: 'Ver lista simples',
   *  'configurações do app' e 'Ajuda'." — quando o Workspace tem uma folha
   *  'Info' (o caso mais comum), o título (`#view-title`), o "botão
   *  quádruplo" (`#topbar-info-layoutbar`) e os 3 botões singleton NÃO
   *  ficam dentro de `header.topbar`/`.topbar-default-row` — o BSP os
   *  ARRANCA de lá e os move pra dentro de 2 "wraps" próprios
   *  (`BSPLayout._infoLeftWrap`/`_infoRightWrap`, ver
   *  `_buildInfoControlsWraps` em bsplayout.js) que vivem no CABEÇALHO da
   *  folha (`.bsp-leaf-header`), não no conteúdo. `_unmountAll` (chamado
   *  em `enter()`, acima) devolve esses 2 wraps pro `#dom-parking` — MAS
   *  os 5 elementos de dentro continuam presos DENTRO dos wraps, em vez de
   *  voltarem pra `.topbar-default-row` (o lugar de onde saíram). Sem
   *  isto, `header.topbar` chegava no modo Clássico com esses 5 elementos
   *  faltando (só sobrava `.spacer` + o botão 🔀, que nunca tinha sido
   *  "extraído" pelo BSP pra começo de conversa). Esta função devolve os 6
   *  elementos (título/quádruplo/🔀/👁️/⚙️/❓) pra dentro de
   *  `.topbar-default-row`, na ORDEM original (mesma de index.html, com o
   *  🔀 novo entrando à esquerda de "👁️ Ver lista simples", pedido
   *  verbatim) — usa `getElementById`/`insertBefore`, então funciona não
   *  importa de onde cada elemento esteja vindo (idempotente: se já
   *  estiver no lugar certo, `insertBefore`/`appendChild` de um filho que
   *  já é filho não faz nada). Chamada só por `enter()` — ao SAIR do modo
   *  Clássico, `BSPLayout._render()` já resolve isto sozinho do jeito dele
   *  (pros wraps de novo), sem precisar desta função. */
  _restoreHeaderRowLayout() {
    const row = document.querySelector('.topbar-default-row');
    if (!row) return;
    const spacer = row.querySelector(':scope > .spacer');
    const layoutbar = document.getElementById('topbar-info-layoutbar');
    const title = document.getElementById('view-title');
    if (layoutbar) row.insertBefore(layoutbar, spacer || null);
    if (title) row.insertBefore(title, spacer || null);
    ['btn-layoutmode-top', 'btn-verlista-top', 'btn-settings-top', 'btn-ajuda-top'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) row.appendChild(el);
    });
  },

  async enter() {
    if (this._active) return;
    // [09/09/2026] Ajuste original: garantir o modo de operação
    // ("Conferência de patrimônios" ou "Mapeamento de ambientes") antes de
    // montar a tela Clássica. [10/09/2026] `_ensureOperationMode` agora só
    // faz um backfill barato (não mostra a splash nem bloqueia) — ver
    // comentário grande nela — por isso continua com `await` aqui (é
    // rápido) sem risco de travar `enter()`.
    await this._ensureOperationMode();
    const shell = this._ensureShell();
    if (!shell) { console.warn('[ClassicMode] #classic-shell não encontrado no HTML — não dá pra entrar no modo Clássico.'); return; }
    // Libera o que o Workspace tiver emprestado (cabeçalho + os 5
    // controles singleton dele) ANTES de arrancar os elementos de dentro
    // de qualquer folha — mesma limpeza usada por BSPLayout._render().
    if (window.BSPLayout?._tree) {
      try { BSPLayout._unmountAll(BSPLayout._tree); } catch (e) { console.warn('[ClassicMode] falha ao liberar o Workspace:', e); }
    }
    this._moveSingletonsInto(shell, shell.querySelector('.bottomnav'));
    // Ver comentário grande em `_restoreHeaderRowLayout` — sem isto, o
    // título/quádruplo/3 botões singleton ficavam presos dentro dos wraps
    // do BSP (parados em #dom-parking), e `header.topbar` chegava aqui
    // praticamente vazio.
    this._restoreHeaderRowLayout();
    const appRoot = document.getElementById('app');
    if (appRoot) appRoot.style.display = 'none';
    shell.classList.add('active');
    this._active = true;
    document.body.classList.add('classic-mode-active');
    this._syncLSCache('classic'); // síncrono — não espera o DB.setSetting abaixo pra já valer no próximo boot
    const alvo = (App.currentView && App.views[App.currentView]) ? App.currentView : 'tabela';
    try { await App.navigate(alvo); } catch (e) { console.warn('[ClassicMode] falha ao montar a tela inicial:', e); }
    if (typeof DB !== 'undefined') {
      try { await DB.setSetting('layoutMode', 'classic'); } catch (e) { /* melhor esforço — não bloqueia a troca de modo */ }
    }
  },

  async exit() {
    if (!this._active) return;
    const prev = App.views[App.currentView];
    if (prev?.unmount) { try { prev.unmount(); } catch (e) { console.warn('[ClassicMode] falha ao desmontar a tela atual:', e); } }
    const parking = document.getElementById('dom-parking');
    if (parking) this._moveSingletonsInto(parking, null);
    if (this._shellEl) this._shellEl.classList.remove('active');
    const appRoot = document.getElementById('app');
    if (appRoot) appRoot.style.display = '';
    this._active = false;
    document.body.classList.remove('classic-mode-active');
    this._syncLSCache('bsp'); // síncrono — ver comentário equivalente em enter()
    // Reconstrói o Workspace do zero — reencontra o cabeçalho/controles
    // sozinho (getElementById/querySelector, não importa de onde vêm).
    // ATUALIZADO (09/09/2026) — ver comentário grande em app.js `_boot()`:
    // quando o modo Clássico está em cache, o boot agora PULA
    // `BSPLayout.mount()` de propósito (entra direto no Clássico, mais
    // rápido) — então `BSPLayout._root`/`_tree` podem nunca ter sido
    // inicializados nesta carga de página. `_render()` sozinho não dá
    // conta disso (espera que `mount()` já tenha rodado antes) — na
    // PRIMEIRA troca pro Workspace de cada carga de página, chama
    // `mount()` (que faz tudo: carrega a lista de layouts, monta a
    // árvore, e já renderiza); depois disso, `_render()` normal.
    if (window.BSPLayout) {
      try {
        if (!BSPLayout._root) await BSPLayout.mount(appRoot);
        else await BSPLayout._render();
      } catch (e) { console.warn('[ClassicMode] falha ao (re)construir o Workspace:', e); }
    }
    if (typeof DB !== 'undefined') {
      try { await DB.setSetting('layoutMode', 'bsp'); } catch (e) { /* melhor esforço */ }
    }
  },

  async toggle() {
    if (this._active) await this.exit(); else await this.enter();
  },

  /** Chamado 1x no boot (ver App._boot, app.js), DEPOIS do Workspace já
   *  estar montado — se a pessoa deixou o modo Clássico ativado da última
   *  vez (`DB.getSetting('layoutMode')`), entra nele direto, sem precisar
   *  clicar no botão 🔀 de novo toda vez que abre o app. */
  async restoreFromSettings() {
    if (typeof DB === 'undefined') { this._clearBootPrefClass(); return; }
    try {
      const modo = await DB.getSetting('layoutMode', 'bsp');
      this._syncLSCache(modo); // mantém o espelho em dia mesmo em quem nunca tinha ele (1ª visita com esta correção)
      // [15/09/2026 UTC] NOVO — mesmo espírito da linha acima, mas pro
      // "Modo de operação" (Conferência/Mapeamento, `_OPMODE_KEY`) — sem
      // isto, quem já tinha um modo salvo no IndexedDB ANTES desta rodada
      // (ver `footerDefsFor`/`_ensureShell`/`updateFooterForMode` acima)
      // nasceria com `readCachedOpMode()` retornando `null` na 1ª
      // montagem do rodapé (cache do localStorage nunca escrito ainda),
      // mostrando os botões padrão (Tabela/Cartões) por engano até a
      // splash screen aparecer de novo (o que, com um modo já salvo, só
      // acontece se a pessoa reabrir a Tela de Abertura na mão).
      try { const opModo = await DB.getSetting(this._OPMODE_KEY, ''); if (opModo) this._syncOpModeLSCache(opModo); } catch (e) { /* melhor esforço */ }
      if (modo === 'classic') await this.enter(); // enter() já sincroniza o cache de novo e #app já está/fica escondido — nenhum flash
    } catch (e) {
      console.warn('[ClassicMode] falha ao restaurar o modo de layout salvo:', e);
    } finally {
      // Decisão real já tomada (classic via enter(), ou bsp por padrão/erro)
      // — a classe do script inline (se existia) não faz mais falta; em
      // 'bsp'/erro, é isto que revela `#app` pra quem tinha um cache
      // desatualizado dizendo 'classic'.
      this._clearBootPrefClass();
    }
  },
};
window.ClassicMode = ClassicMode;
