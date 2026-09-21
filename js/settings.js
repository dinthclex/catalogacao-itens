/**
 * settings.js — Painel de configurações: envio por email/servidor, e
 * backup/restauração dos dados.
 *
 * ---------------------------------------------------------------------
 * [11/09/2026] CABEÇALHO COM ÍNDICE DE FUNÇÕES (pedido recorrente do
 * usuário, "evitar buscas exaustivas") — `SettingsView` é um objeto único
 * (`const SettingsView = {...}`). Listado na ordem em que aparece no
 * arquivo; agrupado por assunto pra facilitar a busca visual.
 *
 * Estado/dados: `_container`, `SETTINGS_CATS` (as 4 abas do painel),
 * `_activeSettingsCat`.
 *
 * Ciclo de vida do painel:
 * - mount(container) — MÉTODO PRINCIPAL, monta o HTML inteiro da tela de
 *   configurações (os ~17 `.settings-section` agrupados nas 4 abas) e liga
 *   todos os handlers — a maior parte do arquivo (linhas ~129-1498) vive
 *   dentro dela.
 * - unmount() — limpeza ao sair da tela (cancela listeners/timers abertos
 *   por mount).
 * - _wireSettingsCats(container) — liga os botões das 4 abas de categoria
 *   à troca de `_activeSettingsCat`/visibilidade dos cards.
 * - _resetarPadroesDoApp() — botão "redefinir padrões" (zera todas as
 *   configurações de todos os menus do app pro valor de fábrica).
 *
 * Permissões do navegador (câmera/geolocalização):
 * - _permLabel(concedida) — rótulo textual (✅/❌) de um estado de permissão.
 * - _cameraPermissionState()/_cameraPermissionGranted() — consulta o
 *   estado atual da permissão de câmera.
 * - _requestGeoPermission()/_requestCameraPermission() — dispara o prompt
 *   nativo do navegador pra pedir cada permissão.
 *
 * Sincronização/servidor/rede:
 * - _renderLastSync() — mostra a data/hora da última sincronização.
 * - _renderServerPrefsStatus() — status atual das preferências de servidor
 *   local/conexão direta.
 * - _wireGuardarDestinos(container) / _syncGuardarServidorUI(container,
 *   checked) — liga os checkboxes de "onde guardar" (local/servidor) e
 *   sincroniza a UI dependente deles.
 * - _serverInstructions(cenario) / _cenarioTexto(cenario) — texto de ajuda
 *   passo-a-passo pra cada cenário de configuração de servidor
 *   (HTTPS local, mkcert, etc.).
 * - _svgTerminal() — ícone SVG usado nas instruções de terminal/servidor.
 * - _wireServerTabs(container) / _wireNodeSubTabs(contentEl) — liga as
 *   abas da seção "Servidor" e as sub-abas do guia Node.
 * - _serverTabContent(tab) / _nodeSubTabContent(sub) — HTML de cada
 *   aba/sub-aba do guia de servidor.
 * - _downloadServerBundle() / _downloadServerBundleNode() /
 *   _downloadServerBundleNodeSimples() / _downloadServerGuideText() —
 *   geram/baixam os pacotes de arquivos e o guia em texto do servidor
 *   local (versões PHP/Node completo/Node simples).
 *
 * Armazenamento/estrutura de arquivos:
 * - _renderStorageSection() — monta a seção com a árvore de uso de
 *   armazenamento.
 * - _abrirModalEstruturaArquivos() — abre o modal explicando a estrutura
 *   de pastas/arquivos usada pelo app.
 * - _renderArvoreStorage(no, profundidade) — desenha recursivamente um nó
 *   da árvore de armazenamento.
 * - _formatBytes(n) — formata um tamanho em bytes pra texto legível
 *   (KB/MB/GB).
 *
 * Exportação/importação/backup:
 * - _downloadFullCatalog() — baixa o catálogo inteiro (backup completo).
 * - _slugify(s) — normaliza um texto pra nome de arquivo seguro.
 * - _pickerRowHtml(id, checked, label, thumbUrl) — HTML de uma linha do
 *   seletor de itens a exportar.
 * - _openExportModal(opts) — abre o modal de exportação (escolha de
 *   itens/formato/destino) — bloco grande, concentra boa parte da lógica
 *   de exportação.
 * - showEventLog() — abre a janela do log de eventos do catálogo.
 * - _importApplyAll(itens, onDuplicate) — aplica um import inteiro de uma
 *   vez, tratando duplicados conforme `onDuplicate`.
 * - _importReviewOneByOne(itens) — fluxo de revisão de import item a item
 *   (confirmar/pular cada um manualmente).
 * ---------------------------------------------------------------------
 */

const SettingsView = {
  _container: null,

  /** Pedido do usuário: "defina abas por categoria, para haver agrupamentos,
   *  de modo que os cards não fiquem soltos" — os ~17 cards
   *  (`.settings-section`) da tela ficavam todos soltos, um embaixo do
   *  outro, numa lista só. Cada card ganhou `data-cat` (ver o HTML montado
   *  em `mount()`) com uma destas 4 chaves; a aba ativa decide quais cards
   *  aparecem (ver `_wireSettingsCats`) — o conteúdo de cada card em si não
   *  muda nada, só agrupa visualmente o que já existia. A última aba ("🗺️
   *  Mapa, 3D e aparelho") termina com os cards HUD/Desfazer/Permissões/
   *  Identificação NESSA ordem — pedido à parte do usuário ("colocados
   *  nessa ordem no final das configurações"), que continua valendo dentro
   *  da aba já que ela é a última. */
  SETTINGS_CATS: [
    { key: 'catalogo', label: '📦 Catálogo', title: 'Catálogo, conferência, ícones e log de eventos' },
    { key: 'backup', label: '💾 Backup e exportação', title: 'Exportação automática, salvamento em arquivo e email' },
    { key: 'servidor', label: '🖥️ Servidor e rede', title: 'Servidor local, conexão direta e sincronização entre aparelhos' },
    { key: 'mapa', label: '🗺️ Mapa, 3D e aparelho', title: 'HUD, desfazer/refazer, permissões e identificação' },
  ],
  _activeSettingsCat: 'catalogo',

  /** NOVO (01/09/2026), item #4 do pedido de 12 itens, verbatim: "Nas
   *  'configurações do app' deve ter um botão para redefinir os padrões do
   *  app (deve afetar todas as opções de todos os menus do app)." Botão
   *  "↩️ Redefinir padrões do app" (barra de fechar, em cima das abas —
   *  ver mount()).
   *
   *  O QUE É RESETADO (todas as chaves abaixo são REMOVIDAS da store
   *  `settings`, via `DB.deleteSetting` — ver comentário grande em db.js
   *  explicando por que remover em vez de reescrever cada uma com seu
   *  valor padrão: evita duplicar ~35 defaults num 2º lugar que pode
   *  ficar dessincronizado do original):
   *  - Todas as chaves "soltas" (uma opção por chave) desta tela
   *    (SettingsView): cenário servidor/rede, salvamento automático em
   *    arquivo (ativo/modo/formato extra), email (destino/assunto/texto/
   *    modo), servidor local (url/incluir imagens), sincronização
   *    automática, exportação automática (ativo/intervalo/destinos/
   *    incluir imagens), captura de IP, velocidade de salvamento do mapa,
   *    HUD, "desfazer sempre visível", grade/réguas/snap do mapa 2D
   *    (`mapa2dGrade`/`mapa2dReguas`/`mapa2dSnapGrade`/`mapa2dSnapGradeM`),
   *    ordem de exibição dos mapas em "Mapa" (`organizeOrder`), ícones
   *    (ativo/baixar da internet/aliases/modo de reserva).
   *  - `mapa3dConfig` (js/mapconfig.js) — o painel "⚙️ Configurações
   *    2D/3D" aberto de DENTRO do mapa (fora desta tela, mas é um "menu do
   *    app" tanto quanto os outros) tem ~45 sub-opções guardadas num único
   *    objeto; removendo a chave inteira, `MapConfig.get()` volta a
   *    devolver só `MapConfig.DEFAULTS` na próxima leitura.
   *  - `catalogo_localbackup_ativo` (localStorage) — preferência de ligar/
   *    desligar o backup leve automático (mesmo sem ter um checkbox nesta
   *    tela hoje, ainda é uma opção configurável, não um dado).
   *
   *  O QUE É DELIBERADAMENTE PRESERVADO (o pedido diz "todas as opções",
   *  mas nem toda entrada salva é uma OPÇÃO — algumas são estado/dado/
   *  identidade, e apagá-las teria efeito colateral destrutivo, não de
   *  "voltar ao padrão"):
   *  - `ambienteAtualId` — qual mapa está selecionado agora; é navegação,
   *    não uma preferência de configuração.
   *  - `conferenciaNome` (e o `conferenciaId`, derivado dela na hora) —
   *    identifica a qual conferência os itens deste aparelho pertencem;
   *    resetar quebraria a unificação entre aparelhos da mesma conferência.
   *  - `_migAutoSaveModoUnico27ago` — flag interna de migração one-shot,
   *    não uma escolha do usuário.
   *  - `catalogo_device_id`/`catalogo_device_label` (localStorage) —
   *    identidade do aparelho (rastreio de quem cadastrou o quê).
   *  - `catalogo_localbackup_v1` (localStorage) e o log de eventos
   *    (`EventLog`) — são DADOS (cópia leve dos itens / histórico), não
   *    configurações; já têm seus próprios botões de limpeza/backup.
   *  - `cameraPermissaoConcedida`/`geoPermissaoConcedida` — cache local da
   *    ÚLTIMA resposta de permissão do navegador, não uma preferência
   *    escolhida; apagar só faria a tela mostrar "não autorizada" enganosamente
   *    enquanto a permissão real concedida ao site continuaria valendo.
   *  - `iconesSvgBaixados` (cache de ícones já baixados da internet) e os
   *    timestamps operacionais `syncUltimaEm`/`autoExportUltimoEm`/
   *    `serverPrefsUltimaEm`/`serverBackupUltimaEm` (estes 2 últimos, NOVOS
   *    — ver js/serverprefs.js) — cache/histórico, não opções escolhidas.
   *  - Itens, tipos, setores, mapas, fotos e backups em si (nada disto é
   *    tocado — só preferências, nunca dados cadastrados).
   *
   *  Depois de resetar, recarrega a página inteira (`location.reload()`,
   *  mesmo padrão já usado em app.js após importar backup/atualizar o
   *  app) em vez de só remontar esta tela: várias telas guardam a config
   *  em CACHE na memória (ex: `MapConfig._cache`, `Perf.enabled`,
   *  `History._alwaysShow`) que não seria invalidado só apagando o valor
   *  no banco — só um reload garante que TODAS elas releiam os padrões
   *  do zero, sem ter que caçar e invalidar cache por cache, módulo por
   *  módulo. */
  // MOVIDO pra fora de `_resetarPadroesDoApp` (01/09/2026), item GRANDE #3
  // do pedido de 12 itens: "As configurações e opções de menu devem ser
  // guardadas em um arquivo a parte". A gravação automática dessas
  // preferências no servidor local (ver js/serverprefs.js,
  // `ServerPrefs.scheduleSync`) precisa da MESMA lista de "isto é
  // preferência de configuração de verdade, aquilo é estado/dado/
  // identidade" já usada pelo botão "Redefinir padrões do app" — hoisted
  // pra uma propriedade compartilhada em vez de uma `const` local, pra não
  // duplicar essa lista (e as duas ficarem desincronizadas) em dois lugares
  // do código. Ver o comentário grande acima (`_resetarPadroesDoApp`) pra a
  // explicação completa do que entra/não entra e por quê.
  CHAVES_PREFERENCIA: [
    'cenarioServidor', 'autoSaveModoArquivo', 'emailDestino', 'emailAssunto', 'emailTextoPadrao', 'emailModo',
    'servidorUrl', 'servidorIncluirImagens', 'guardarIndexedDB', 'autoSaveAtivo', 'autoSaveFormatoExtra', 'syncAutoAtivo',
    'historySempreVisivel', 'mapa2dGrade', 'mapa2dReguas', 'mapa2dSnapGrade', 'mapa2dSnapGradeM', 'imaMagnetPx',
    'render3dModo', 'paredeUniaoDist', 'geoAtivo', 'mapaModoPadrao', 'hudAtivo', 'organizeOrder',
    'mapSaveDebounceMs', 'capturarIpPublico',
    'autoExportAtivo', 'autoExportIntervaloMin', 'autoExportDestinos', 'autoExportIncluirImagens',
    'iconesSvgAtivo', 'iconesSvgBaixarInternet', 'iconesSvgAliases', 'iconesSvgFallback',
    'mapa3dConfig',
    // NOVO (09/09/2026) — ver js/classicmode.js: qual dos 2 modos de
    // apresentação (Workspace/BSP OU Clássico) o app deve abrir da
    // próxima vez. Resetar volta pro padrão (Workspace).
    'layoutMode',
    // [10/09/2026] — ver js/classicmode.js: liga/desliga a Tela de
    // Abertura aparecer sozinha a cada boot. Resetar volta pro padrão
    // (ligada — `cfg.splashSempreAoAbrir !== false`, ver checkbox acima).
    'splashSempreAoAbrir',
  ],

  async _resetarPadroesDoApp() {
    if (!confirm('Redefinir TODAS as opções de TODOS os menus do app para os valores de fábrica?\n\nIsto NÃO apaga itens, tipos, setores, mapas, fotos nem backups — só as preferências (servidor, email, salvamento automático, ícones, mapa 2D/3D, HUD, etc). A página vai recarregar em seguida.')) return;
    for (const chave of this.CHAVES_PREFERENCIA) {
      try { await DB.deleteSetting(chave); } catch (e) { /* segue tentando as outras — uma falha isolada não deve travar o reset inteiro */ }
    }
    try { localStorage.removeItem('catalogo_localbackup_ativo'); } catch (e) { /* ignora */ }
    Utils.toast('Padrões do app restaurados ✓ Recarregando...', { type: 'ok' });
    setTimeout(() => location.reload(), 600);
  },

  _abrirFabrica() {
    if (document.getElementById('st-fabrica-ov')) return;
    const ov = document.createElement('div');
    ov.id = 'st-fabrica-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:2147483600;padding:16px';
    ov.innerHTML = `<div style="background:var(--bg-card,#1e222b);color:var(--text,#e8ecf3);max-width:480px;width:100%;border-radius:12px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.5)">
      <h3 style="margin:0 0 10px">🏭 Carregar Configurações de Fábrica</h3>
      <p style="margin:0 0 8px">Tudo será restaurado ao <b>padrão de fábrica</b>: preferências, opções de todos os menus e dados locais do app.</p>
      <p style="margin:0 0 8px">Os arquivos salvos no navegador (<b>IndexedDB</b>: itens, mapas, fotos etc.) serão <b>desvinculados do app</b> — o app abrirá vazio. Os dados antigos continuam no navegador, mas sem uso pelo app.</p>
      <p style="margin:0 0 14px;opacity:.8;font-size:.9em">Backups em arquivo que você exportou não são afetados. Esta ação não pode ser desfeita pelo app.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn secondary sm" id="st-fab-cancel">Cancelar</button>
        <button class="btn sm" id="st-fab-ok" style="background:#c0392b;color:#fff">Restaurar de fábrica</button>
      </div></div>`;
    document.body.appendChild(ov);
    if (window.WindowManager) { try { WindowManager.register('st-fabrica', { el: ov, kind: 'modal', label: 'Configurações de fábrica' }); } catch (e) { /* ignora */ } }
    ov.querySelector('#st-fab-cancel').onclick = () => ov.remove();
    ov.querySelector('#st-fab-ok').onclick = () => {
      try {
        const ks = [];
        for (let i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i));
        ks.forEach((k) => { if (k !== 'catalogo_db_sufixo') localStorage.removeItem(k); });
        localStorage.setItem('catalogo_db_sufixo', '_' + Date.now());
      } catch (e) { /* ignora */ }
      try { sessionStorage.clear(); } catch (e) { /* ignora */ }
      Utils.toast('Configurações de fábrica carregadas ✓ Recarregando...', { type: 'ok' });
      setTimeout(() => location.reload(), 600);
    };
  },

  async mount(container) {
    this._container = container;
    const cfg = await DB.getAllSettings();
    // Pedido do usuário (27/08/2026): "Como salvar os arquivos" deve estar
    // selecionado, POR PADRÃO, em "Um único arquivo com o catálogo completo"
    // — já era esse o comportamento pra quem NUNCA tivesse mexido na opção
    // (ver o HTML mais abaixo e autosave.js, que já usava 'unico' como
    // padrão), mas se alguma instalação ficou com outro modo gravado de uma
    // versão anterior, corrige aqui, UMA VEZ só (a flag abaixo evita corrigir
    // de novo depois — a partir daí a pessoa é livre pra escolher qualquer
    // modo sem o app voltar a mexer nisso sozinho).
    if (!(await DB.getSetting('_migAutoSaveModoUnico27ago', false))) {
      await DB.setSetting('autoSaveModoArquivo', 'unico');
      await DB.setSetting('_migAutoSaveModoUnico27ago', true);
      cfg.autoSaveModoArquivo = 'unico';
    }
    const total = await DB.countItems();
    // O ID nunca é lido/gerado à parte — é SEMPRE um hash do nome, calculado
    // na hora (pedido do usuário, 26/08/2026 — ver DB.computeConferenciaId).
    // Muda sozinho quando o nome muda (ver #st-conf-nome onchange, abaixo).
    cfg.conferenciaId = DB.computeConferenciaId(cfg.conferenciaNome);

    // Quatro cenários: PC/Celular × com-servidor/sem-servidor (pedido do
    // usuário: "não deve ser mais PC+câmera ou celular+câmera, deve ser só
    // PC ou celular E 'com' ou 'sem' servidor" — a antiga relação de 5
    // cenários, com um cenário misto "câmera no celular, servidor no PC"
    // separado, virou só isso: onde tinha detalhe de câmera/rede, agora é
    // texto dentro do próprio cenário "com servidor", ver _cenarioTexto).
    // Migra valores antigos salvos por versões anteriores do app para as
    // novas chaves, e — sem escolha prévia salva (instalação nova, ou valor
    // antigo "nenhum") — já pré-seleciona "sem servidor" do tipo de
    // aparelho detectado, em vez de deixar em branco.
    const MIGRACAO_CENARIO = { 'pc-pc': 'pc-com-servidor', 'pc-servidor-celular-camera': 'pc-com-servidor', 'celular-celular': 'celular-com-servidor' };
    if (MIGRACAO_CENARIO[cfg.cenarioServidor]) {
      cfg.cenarioServidor = MIGRACAO_CENARIO[cfg.cenarioServidor];
      await DB.setSetting('cenarioServidor', cfg.cenarioServidor);
    }
    if (!cfg.cenarioServidor || cfg.cenarioServidor === 'nenhum') {
      cfg.cenarioServidor = Utils.isMobileDevice() ? 'celular-sem-servidor' : 'pc-sem-servidor';
      await DB.setSetting('cenarioServidor', cfg.cenarioServidor);
    }
    const semServidor = (v) => v === 'pc-sem-servidor' || v === 'celular-sem-servidor';

    // NOVO (08/09/2026), pedido verbatim: "Isso deve ser configuravel
    // em alguma secao das 'configuracoes do app', se ao selecionar a
    // tela que sera exibida, ira abrir em tela cheia ou nao."
    const wsFullscreen = cfg.workspaceFullscreenConfig || {};

    const geoConcedida = await Geo.isPermissionGranted();
    const camConcedida = await this._cameraPermissionGranted();
    const iconesAtivo = await Icons.isEnabled();
    const iconesRemoto = await Icons.remoteEnabled();
    const iconesFallback = await Icons.getFallbackMode();
    const iconAliases = await Icons.getAliases();
    const persistSuportado = typeof navigator !== 'undefined' && !!navigator.storage?.persist;
    const persistido = persistSuportado && (await DB.isStoragePersisted());
    const ipCapturaAtivo = await Session.isIpCaptureEnabled();
    const autoExportAtivo = await AutoExport.isEnabled();
    const autoExportIntervalo = await AutoExport.getIntervalMin();
    const autoExportDestinos = await AutoExport.getDestinos();
    const autoExportIncluirImagens = await AutoExport.getIncluirImagens();
    const autoExportUltimo = await AutoExport.getLastExportAt();
    // Pedido do usuário (rodada 51): "Deve ser identificado se o app está
    // rodando pelo 'file:///' (sem servidor) ou por um servidor local. Esta
    // informação deve ficar logo abaixo da versão." Reaproveita a MESMA
    // detecção já usada pelo card "🖥️ Servidor e rede" (StorageStatus,
    // `_detectEnv` — `location.protocol === 'file:'`, e um HEAD pro
    // servidor pra tentar identificar PHP/Node pelos headers), pra não
    // duplicar essa lógica num segundo lugar.
    const envInfo = await StorageStatus._detectEnv();
    const envLabel = envInfo.isFile
      ? '📄 Rodando direto do arquivo (file:///) — sem servidor'
      : `🖥️ Rodando por servidor local${envInfo.serverKind && envInfo.serverKind !== 'desconhecido' ? ' (' + (envInfo.serverKind === 'php' ? 'PHP' : envInfo.serverKind === 'node' ? 'Node' : envInfo.serverKind) + ')' : ''}`;

    container.innerHTML = `
      <div class="view-pad">

        <!-- Pedido do usuário (28/08/2026): "deve aparecer a versão do app
             e data da última atualização acima dos botões do topo". Ver
             Utils.APP_VERSION/APP_LAST_UPDATE (js/utils.js) — mantidos na
             mão junto com CACHE_VERSION de sw.js. -->
        <div class="settings-appversion">📦 Catalogação de Itens ${Utils.escapeHtml(Utils.APP_VERSION)} · última atualização em ${Utils.escapeHtml(Utils.APP_LAST_UPDATE)}</div>
        <!-- Pedido do usuário (rodada 51): "Deve ser identificado se o app
             está rodando pelo 'file:///' (sem servidor) ou por um servidor
             local [...] logo abaixo da versão." -->
        <div class="settings-appversion" style="margin-top:2px; opacity:0.85; font-size:12px">${envLabel}</div>

        <div class="settings-close-bar">
          <!-- NOVO (01/09/2026), item #4 do pedido de 12 itens, verbatim:
               "Nas 'configurações do app' deve ter um botão para redefinir os
               padrões do app (deve afetar todas as opções de todos os menus
               do app)." Fica na barra de fechar (fora de qualquer
               data-cat="...") de propósito — é o único lugar da tela que
               aparece em TODAS as abas ao mesmo tempo, já que o botão não
               pertence a uma categoria específica, afeta todas. Ver o
               método _resetarPadroesDoApp pra a lista completa do que é
               resetado (e o que é deliberadamente preservado: mapa atual
               selecionado, nome da conferência, identidade do aparelho,
               backups/dados cadastrados). -->
          <button class="btn secondary sm" id="st-reset-padroes" title="Redefinir TODAS as opções de TODOS os menus do app para os valores de fábrica (não apaga itens, fotos, mapas nem backups)">↩️ Redefinir padrões do app</button>
          <button class="btn secondary sm" id="st-fabrica" title="Restaura tudo ao padrão de fábrica e desvincula os dados salvos (IndexedDB) do app">🏭 Carregar Configurações de Fábrica</button>
          <button class="btn secondary sm" id="st-close" title="Fechar as configurações e voltar">✕ Fechar</button>
        </div>

        <div class="settings-cats" id="settings-cats">
          ${this.SETTINGS_CATS.map((c) => `<button type="button" class="settings-cat-tab ${c.key === this._activeSettingsCat ? 'active' : ''}" data-cat="${c.key}" title="${Utils.escapeHtml(c.title)}">${c.label}</button>`).join('')}
        </div>

        <div class="settings-section" data-cat="catalogo">
          <h3>📦 Catálogo</h3>
          <p style="font-size:13px; color:var(--text-dim)">${total} item(ns) cadastrado(s).</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <button class="btn secondary sm" id="st-export" title="Escolher o que exportar (campos, itens e formato de arquivo) e baixar o backup">⬇️ Exportar backup (.json)</button>
            <label class="btn secondary sm" style="cursor:pointer" title="Importar um ou mais backups .json exportados anteriormente (pode selecionar vários arquivos de uma vez)">⬆️ Importar backup
              <input type="file" id="st-import" accept="application/json" multiple class="hidden">
            </label>
            <!-- NOVO (01/09/2026) — item GRANDE #9, decisão do usuário
                 (AskUserQuestion): "Ida e volta (exportar E importar)" — o
                 lado de EXPORTAR do novo formato de texto do mapa vive
                 dentro do modal "⬇️ Exportar backup" (ver _openExportModal,
                 bloco da categoria "Mapas"); o lado de IMPORTAR fica aqui,
                 ao lado do botão de importar backup normal, já que também é
                 "importar algo de um arquivo" — mesma lógica de agrupamento
                 visual. Ver onchange abaixo: em vez de duplicar toda a
                 lógica de mesclagem/conflito de mapas já existente, faz o
                 parser do .txt (MapTxt.parseTexto) e REAPROVEITA o mesmo
                 truque de "File + DataTransfer + evento change sintético"
                 já usado em js/serverprefs.js (restaurarDoServidor) pra
                 disparar o #st-import de cima, que já sabe lidar com mapa
                 duplicado (mesmo mapa_id = mesmo id no arquivo). -->
            <label class="btn secondary sm" style="cursor:pointer" title="Importar um mapa exportado no novo formato de texto (.txt)">📄 Importar mapa (.txt)
              <input type="file" id="st-import-txt" accept=".txt,text/plain" class="hidden">
            </label>
            <!-- NOVO (01/09/2026) — pedido do usuário verbatim: "Deve poder
                 exportar um mapa de exemplo e como comentário todas os
                 significados dos caracteres e como funciona a estrutura do
                 arquivo." Fica aqui (não dentro do modal de Exportar, que
                 exige ter mapas de verdade cadastrados) porque é um arquivo
                 FICTÍCIO, sempre disponível — mesmo num catálogo vazio —
                 pra servir de referência do formato antes mesmo de o
                 usuário ter criado qualquer mapa. Ver MapTxt.exportarExemplo
                 (js/maptxt.js). -->
            <button type="button" class="btn secondary sm" id="st-export-exemplo-txt" title="Baixa um .txt de exemplo (fictício, não é um mapa de verdade), com toda a explicação da estrutura do arquivo e o significado de cada símbolo em comentários">📄 Baixar mapa de EXEMPLO comentado (.txt)</button>
          </div>
          <p style="font-size:11.5px; color:var(--text-dim); margin-top:10px" id="st-persist-status">
            ${!persistSuportado ? 'Este navegador não suporta pedir armazenamento persistente — os dados continuam salvos normalmente aqui, só sem essa garantia extra do navegador contra limpeza automática por falta de espaço.'
              : persistido ? '🔒 Armazenamento persistente ativo — o navegador evita apagar os dados deste app sozinho por falta de espaço. Uma conferência pode continuar em outro dia com os itens intactos (a não ser que os dados do site sejam limpos manualmente).'
              : '⚠️ Armazenamento ainda não confirmado como persistente.'}
          </p>
          ${persistSuportado && !persistido ? '<button class="btn secondary sm" id="st-persist-btn" title="Pedir ao navegador para não apagar os dados deste app automaticamente por falta de espaço">🔒 Ativar armazenamento persistente</button>' : ''}
        </div>

        <!-- Pedido do usuário (28/08/2026): "Arrume algum jeito de colocar
             um botão no app [...] para forçar o navegador a recarregar os
             arquivos todos, sem usar o cache. Para não precisar ficar
             excluindo, toda hora, os 'dados de navegação'." O app já tem
             atualização automática (verifica a cada 20min/ao voltar pra
             aba — ver app.js _registerServiceWorker), mas em alguns casos
             (proxy/servidor intermediário guardando uma cópia antiga,
             navegador demorando pra perceber a troca) só um recarregamento
             manual "sem cache nenhum" resolve — este botão faz na mão,
             dentro do app, o que apagar os "dados de navegação" (Service
             Worker + Cache Storage) faria no navegador, sem precisar mexer
             nas configurações dele nem perder os dados cadastrados (só o
             CACHE dos arquivos do app — nada de IndexedDB/patrimônios é
             tocado, ver App.forceHardReload em app.js). -->
        <div class="settings-section" data-cat="catalogo">
          <h3>🔄 Atualização do app</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">O app já verifica sozinho se há uma versão mais nova (a cada 20 min, ou ao voltar pra esta aba) e recarrega automaticamente quando encontra. Se mesmo assim a tela parecer "presa" numa versão antiga, force uma recarga completa abaixo — refaz o download de TODOS os arquivos do app direto do servidor, sem usar nada guardado (Service Worker + cache do app). Não apaga nenhum patrimônio/foto/mapa cadastrado.</p>
          <button class="btn secondary sm" id="st-force-reload" title="Descarta o Service Worker e o cache do app, e recarrega a página do zero, direto da rede">🔄 Forçar atualização (sem cache)</button>
        </div>

        <!-- NOVO (09/09/2026), pedido verbatim: "Coloque o antigo método
             de apresentação das coisas sem o BSP splitter screen /
             dockable [...] Essa alteração de layout pode ser feita pelas
             'configurações do app' em uma seção para isso. Faça um
             transicionador fácil e rápido entre os dois modos de
             visualização do app BSP/dockable ou o outro jeito." — ver
             js/classicmode.js (window.ClassicMode). Este toggle é
             equivalente ao botão 🔀 do cabeçalho (mesma troca de modo,
             mesmo estado salvo em "layoutMode") — só um 2º jeito de
             acessar a mesma alternância, agora com uma explicação mais
             longa do que cada modo faz, que não cabe no atributo title
             de um ícone. -->
        <div class="settings-section" data-cat="catalogo">
          <h3>🖥️ Layout do app</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Como as telas do app são apresentadas. O botão 🔀 no cabeçalho (ao
            lado de "⚙️ Configurações"/"❓ Ajuda") faz a MESMA troca, a
            qualquer momento — este toggle é só mais um jeito de chegar nela.
          </p>
          <label class="radio-opt" style="margin-top:8px">
            <input type="checkbox" id="st-layout-classico" ${ClassicMode?.isActive?.() ? 'checked' : ''}>
            <span><span class="t">📱 Usar o layout Clássico (tela cheia, uma tela por vez, barra inferior)</span><br><span class="d">Desmarcado (padrão): 🧩 Workspace — blocos redimensionáveis estilo Blender, com a tela "Info"/"Botões" próprias. Marcado: o jeito antigo — Tabela/Cartões/Fotos/Mapa/Buscar em tela cheia, um de cada vez, com barra inferior fixa (igual o app era antes do Workspace existir).</span></span>
          </label>
          <!-- [10/09/2026] Pedido verbatim: "A splash screen deve sempre
               aparecer. Uma opção nas 'configurações do app' deve servir
               para habilitar/desabilitar que sempre aparece no boot." —
               ver ClassicMode.openSplashScreen()/_SPLASH_SEMPRE_KEY em
               js/classicmode.js, chamada (sem bloquear o boot) por
               App._boot() em app.js. Desmarcar aqui NÃO apaga o modo já
               escolhido ('Conferência de patrimônios'/'Mapeamento de
               ambientes') — só para de mostrar a janela sozinha a cada
               vez que o app abre; ainda dá pra reabri-la manualmente por
               Ajuda ('?') → "Tela de Abertura" (ver js/mapview.js). -->
          <label class="radio-opt" style="margin-top:8px">
            <input type="checkbox" id="st-splash-sempre" ${cfg.splashSempreAoAbrir !== false ? 'checked' : ''}>
            <span><span class="t">🎬 Mostrar a Tela de Abertura ao iniciar o app</span><br><span class="d">Marcado (padrão): a janela "Modo de operação" (Conferência de patrimônios / Mapeamento de ambientes) aparece toda vez que o app é aberto — feche com "✕" ou clicando fora dela sem precisar escolher nada. Desmarcado: o app abre direto, sem essa janela (ainda pode ser reaberta por Ajuda ('?') → "Tela de Abertura").</span></span>
          </label>
        </div>

        <div class="settings-section" data-cat="catalogo">
          <h3>🗂️ Conferência de patrimônio</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Identifica a QUAL conferência de patrimônio os itens cadastrados neste aparelho
            pertencem — todo item novo já nasce marcado com ela. Isso permite, ao juntar
            arquivos de vários celulares/PCs na ferramenta de unificação, saber que todos são
            da MESMA conferência (e avisar se algum vier de outra, por engano).
            Além disso, o ID evita conflito quando mais de uma conferência é feita ao mesmo
            tempo — por exemplo, em empresas diferentes: um mesmo número de patrimônio, como
            215513, pode existir legitimamente em ambas. Isso não é erro — cada empresa
            patrimoniou seus próprios ativos e chegou a esse número por conta própria. É o ID
            da conferência que distingue "conferência de patrimônio da empresa A" de
            "conferência de patrimônio da empresa B", mesmo quando o número do patrimônio se
            repete entre elas.
          </p>
          <label class="field">
            <span class="lbl">Nome desta conferência</span>
            <input type="text" id="st-conf-nome" value="${Utils.escapeHtml(cfg.conferenciaNome || '')}" placeholder="ex: Conferência de patrimônio 2026 — Matriz">
          </label>
          <p style="font-size:11px; color:var(--text-dim); font-family:monospace; cursor:help" id="st-conf-id-line" title="Este ID é gerado automaticamente como um hash (uma &quot;impressão digital&quot; determinística, calculada aqui mesmo no aparelho) do NOME da conferência acima — não é sorteado nem guardado à parte. O MESMO nome, em QUALQUER aparelho, sempre gera o MESMO ID, sem precisar copiar ou sincronizar nada — é assim que a ferramenta de unificação reconhece arquivos da mesma conferência. Mudar o nome muda o ID junto.">ID da conferência: ${Utils.escapeHtml(cfg.conferenciaId)}</p>
          <!-- Botão "Unificar fontes diferentes" removido daqui (pedido do
               usuário, rodada 51: "Em 'configurações do app', exclua o
               botão 'Unificar fontes diferentes'.") — a ferramenta em si
               (js/unify.js, rota "unificar") continua existindo/acessível,
               só o atalho por este botão saiu. -->
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <button class="btn secondary sm" id="st-conf-nova" title="Limpa o nome desta conferência (o ID é sempre um hash dele — veja acima) para você digitar o nome de uma conferência DIFERENTE, sem misturar com a anterior">🔄 Iniciar nova conferência</button>
          </div>
        </div>

        <div class="settings-section" data-cat="backup">
          <h3>⏱️ Exportação automática periódica</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Gera um backup só com os itens NOVOS desde a última rodada, a cada X
            minutos, e envia para o(s) destino(s) marcado(s) abaixo. Os itens já
            vão pro servidor local (se configurado em "📡 Sincronização"), na hora
            do cadastro — isto aqui é complementar, mais um jeito de garantir
            backup. <b>Só funciona com o app aberto nesta aba</b> — se fechar,
            para (não existe segundo plano numa página web comum).
          </p>
          <label class="radio-opt">
            <input type="checkbox" id="st-autoexport-ativo" ${autoExportAtivo ? 'checked' : ''}>
            <span><span class="t">Ativar exportação automática periódica</span><br><span class="d">Desativada por padrão.</span></span>
          </label>
          <label class="field" style="margin-top:8px; max-width:200px">
            <span class="lbl">A cada quantos minutos</span>
            <input type="number" id="st-autoexport-intervalo" min="1" step="1" value="${autoExportIntervalo}">
          </label>
          <div style="margin-top:10px">
            <span style="font-size:13px; font-weight:600">Enviar para:</span>
            <label class="radio-opt" style="padding:4px 0">
              <input type="checkbox" class="autoexport-dest" value="download" ${autoExportDestinos.includes('download') ? 'checked' : ''}>
              <span class="t" style="font-size:13.5px">⬇️ Baixar arquivo neste aparelho</span>
            </label>
          </div>
          <label class="radio-opt" style="margin-top:4px">
            <input type="checkbox" id="st-autoexport-imagens" ${autoExportIncluirImagens ? 'checked' : ''}>
            <span><span class="t">Incluir fotos/ícones no backup automático</span><br><span class="d">Ativado por padrão — desative para arquivos bem menores e mais rápidos de enviar.</span></span>
          </label>
          <p style="font-size:11.5px; color:var(--text-dim); margin-top:8px">
            Última exportação automática: ${autoExportUltimo ? Utils.formatDateTime(autoExportUltimo) : 'nunca'}.
          </p>
          <button class="btn secondary sm" id="st-autoexport-now" style="margin-top:6px" title="Roda uma exportação agora mesmo, fora do horário programado">▶️ Exportar agora</button>
        </div>

        <div class="settings-section" data-cat="backup">
          <h3>💾 Salvamento automático em arquivo</h3>
          <label class="radio-opt">
            <input type="checkbox" id="st-autosave-ativo" ${cfg.autoSaveAtivo ? 'checked' : ''}>
            <span><span class="t">Salvar cada item automaticamente no servidor local</span><br><span class="d">Ao confirmar um item na captura, ele é enviado para a URL do servidor (acima) e gravado em arquivo — sem precisar exportar manualmente. Exige o servidor local configurado.</span></span>
          </label>
          <label class="field" style="margin-top:8px">
            <span class="lbl">Como salvar os arquivos</span>
            <select id="st-autosave-modo">
              <option value="individual" ${cfg.autoSaveModoArquivo === 'individual' ? 'selected' : ''}>Um arquivo por item</option>
              <option value="unico" ${(!cfg.autoSaveModoArquivo || cfg.autoSaveModoArquivo === 'unico') ? 'selected' : ''}>Um único arquivo com o catálogo completo</option>
              <option value="ambos" ${cfg.autoSaveModoArquivo === 'ambos' ? 'selected' : ''}>Ambos</option>
            </select>
          </label>
          <label class="field" style="margin-top:8px">
            <span class="lbl">Formato extra do catálogo completo (além do .json, que é sempre mantido)</span>
            <select id="st-autosave-formato">
              <option value="nenhum" ${(!cfg.autoSaveFormatoExtra || cfg.autoSaveFormatoExtra === 'nenhum') ? 'selected' : ''}>Só .json (padrão)</option>
              <option value="txt-simples" ${cfg.autoSaveFormatoExtra === 'txt-simples' ? 'selected' : ''}>+ .txt simples (setor/data + "patrimônio tipo" por linha)</option>
              <option value="csv-completo" ${cfg.autoSaveFormatoExtra === 'csv-completo' ? 'selected' : ''}>+ .csv completo (Excel/planilhas)</option>
              <option value="ambos-formatos" ${cfg.autoSaveFormatoExtra === 'ambos-formatos' ? 'selected' : ''}>+ .txt simples E .csv completo</option>
            </select>
          </label>
          <p style="font-size:12px; color:var(--text-dim); margin-top:8px">
            O arquivo <code>catalogo-unico.json</code> é sempre mantido (é o que a sincronização
            entre aparelhos usa) na mesma pasta do servidor. Escolhendo um formato extra acima,
            <code>catalogo-simples.txt</code> e/ou <code>catalogo-completo.csv</code> também são
            gerados ali, sempre atualizados com o catálogo inteiro.
          </p>
          ${!cfg.autoSaveAtivo ? `<p style="font-size:12px; color:var(--text-dim); margin-top:8px">
            Sem isso ativado, os itens ficam só no IndexedDB do navegador que os cadastrou.
            Enquanto não configurar o servidor, use o botão "⬇️ Sessão" na tela Capturar
            (ou "⬇️ Exportar backup" aqui em cima) para baixar o que já foi catalogado.
          </p>` : ''}
        </div>

        <div class="settings-section" data-cat="backup">
          <h3>✉️ Envio das informações por email</h3>
          <label class="field">
            <span class="lbl">Email de destino</span>
            <input type="email" id="st-email-to" value="${Utils.escapeHtml(cfg.emailDestino || '')}" placeholder="ex: equipe@empresa.com">
          </label>
          <label class="field">
            <span class="lbl">Assunto padrão</span>
            <input type="text" id="st-email-subject" value="${Utils.escapeHtml(cfg.emailAssunto || 'Catalogação de itens')}">
          </label>
          <label class="field">
            <span class="lbl">Texto pré-gravado (pode editar na hora do envio também)</span>
            <textarea id="st-email-text">${Utils.escapeHtml(cfg.emailTextoPadrao || 'Segue a catalogação de itens exportada do app.')}</textarea>
          </label>

          <label class="radio-opt">
            <input type="radio" name="emailmode" value="mailto" ${(!cfg.emailModo || cfg.emailModo === 'mailto') ? 'checked' : ''}>
            <span><span class="t">Só mailto (recomendado)</span><br><span class="d">Abre seu programa de email já preenchido; você confere e clica em enviar. Não precisa de servidor.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="emailmode" value="servidor" ${cfg.emailModo === 'servidor' ? 'checked' : ''}>
            <span><span class="t">Só servidor (automático)</span><br><span class="d">Envia os dados via POST para o servidor local (acima), que pode disparar o email automaticamente.</span></span>
          </label>
          <label class="radio-opt">
            <input type="radio" name="emailmode" value="ambos" ${cfg.emailModo === 'ambos' ? 'checked' : ''}>
            <span><span class="t">Ambos</span><br><span class="d">Abre o mailto E também envia para o servidor configurado.</span></span>
          </label>

          <button class="btn block" id="st-save-email" style="margin-top:14px" title="Salvar as configurações de email e servidor">Salvar configurações</button>
        </div>

        <div class="settings-section" data-cat="catalogo">
          <h3>🖼️ Ícones para itens sem foto</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Quando não há foto (câmera bloqueada, sem câmera disponível, ou cadastro
            manual), o app tenta usar um ícone pronto com base no tipo E na descrição
            digitados — útil para itens comuns de conferência de patrimônio (informática,
            mobiliário de escritório, etc.). Sem nenhum ícone específico compatível,
            a opção abaixo decide o que aparece no lugar.
          </p>
          <label class="radio-opt">
            <input type="checkbox" id="st-icones-ativo" ${iconesAtivo ? 'checked' : ''}>
            <span><span class="t">Usar ícones prontos quando não há foto</span><br><span class="d">Ativado por padrão. As palavras-chave abaixo definem quando cada ícone é escolhido — edite à vontade.</span></span>
          </label>
          <div id="icones-lista" style="max-height:280px; overflow-y:auto; margin-top:10px; padding-right:4px; ${iconesAtivo ? '' : 'opacity:.45; pointer-events:none'}">
            ${Object.keys(Icons.LIBRARY).map((key) => `
              <div style="display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid var(--border)">
                <span style="width:24px; height:24px; flex:none; display:inline-flex; align-items:center; justify-content:center; color:var(--text-dim)">${Icons.svgForKey(key)}</span>
                <span style="width:96px; flex:none; font-size:11px">${Utils.escapeHtml(Icons.LIBRARY[key].label)}</span>
                <input type="text" class="icon-alias-input" data-key="${key}" value="${Utils.escapeHtml(Icons.aliasesToText(iconAliases[key]))}" placeholder="palavras-chave separadas por vírgula" style="flex:1; font-size:11px">
              </div>`).join('')}
          </div>
          <div style="display:flex; gap:8px; margin-top:10px">
            <button class="btn secondary sm" id="st-icones-reset" title="Restaura as palavras-chave de todos os ícones para o padrão de fábrica">↩️ Restaurar padrões</button>
          </div>

          <div style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border)">
            <span class="t" style="font-size:13px; font-weight:600">Se NÃO achar um ícone específico para o tipo/descrição:</span>
            <label class="radio-opt" style="margin-top:4px">
              <input type="radio" name="st-icones-fallback" id="st-icones-fallback-descritivo" value="descritivo" ${iconesFallback === 'descritivo' ? 'checked' : ''}>
              <span><span class="t">Ícone descritivo</span><br><span class="d">Iniciais da descrição/tipo + formas geométricas decorativas — marcado por padrão.</span></span>
            </label>
            <label class="radio-opt">
              <input type="radio" name="st-icones-fallback" id="st-icones-fallback-padrao" value="padrao" ${iconesFallback === 'padrao' ? 'checked' : ''}>
              <span><span class="t">Ícone padrão</span><br><span class="d">Um ícone genérico de caixa/pacote, igual para qualquer item sem correspondência.</span></span>
            </label>
          </div>

          <label class="radio-opt" style="margin-top:14px; padding-top:10px; border-top:1px solid var(--border)">
            <input type="checkbox" id="st-icones-internet" ${iconesRemoto ? 'checked' : ''}>
            <span><span class="t">Tentar baixar ícones extras de um repositório gratuito na internet</span><br><span class="d">Só quando o tipo digitado não bate com nenhum ícone pronto acima. Usa o serviço público Iconify (api.iconify.design), precisa de internet, e vem DESATIVADO por padrão. Se não conseguir baixar, fica registrado no "🧾 Log de eventos" abaixo — o item continua salvo normalmente, só sem esse ícone extra.</span></span>
          </label>
        </div>

        <div class="settings-section" data-cat="catalogo">
          <h3>🧾 Log de eventos</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Registro em sequência dos principais eventos deste aparelho (itens
            cadastrados/editados/excluídos, permissões, conexões, ícones baixados,
            erros ao salvar, etc.) — útil para conferir o que aconteceu sem precisar
            reproduzir o problema de novo. Guardado só neste aparelho (localStorage).
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <button class="btn secondary sm" id="st-eventlog-view" title="Ver o log de eventos deste aparelho">📜 Ver log de eventos (<span id="st-eventlog-count">${EventLog.count()}</span>)</button>
            <button class="btn danger sm" id="st-eventlog-clear" title="Apaga o log de eventos — não afeta o catálogo nem nenhum item">🗑️ Limpar log</button>
          </div>
        </div>

        

        

        <!-- Pedido do usuário (25/08/2026): "diminua para 1s o tempo para
             mandar tudo para o SSD/HD/banco de dados. Deve ter uma opção nas
             configurações do app para isso." Era uma constante fixa de
             3000ms em db.js (MAP_SAVE_DEBOUNCE_MS), agora configurável (ver
             DB.getMapSaveDebounceMs/setMapSaveDebounceMs) — PADRÃO NOVO:
             1s (era 3s). Só afeta a gravação do MAPA (walls/portas/objetos/
             etc, ver db.js saveMap — a tela com mais mutações seguidas do
             app inteiro); o catálogo de ITENS já grava na hora, sem
             debounce nenhum, não tem opção equivalente aqui porque não
             precisa (addItem/updateItem não passam por essa fila). -->
        <div class="settings-section" data-cat="mapa">
          <h3>⏱️ Velocidade de salvamento do mapa</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Editar o mapa (arrastar parede/câmera/objeto, digitar um campo etc.) já grava
            cada mudança na hora na memória — nada se perde ao fechar a aba. A gravação DE
            VERDADE no disco/banco de dados (IndexedDB) é que espera um pouco antes de
            acontecer, pra juntar uma rajada de mudanças rápidas numa gravação só, em vez de
            martelar o disco a cada tecla/arrasto. Este é esse tempo de espera — quanto menor,
            mais rápido os dados chegam no disco de verdade, mas mais gravações acontecem.
          </p>
          <label class="field" style="max-width:240px">
            <span class="lbl">Tempo de espera antes de gravar no disco (segundos)</span>
            <input type="number" id="st-mapsavedebounce" step="0.1" min="${DB.MAP_SAVE_DEBOUNCE_MIN_MS / 1000}" max="${DB.MAP_SAVE_DEBOUNCE_MAX_MS / 1000}" value="${(cfg.mapSaveDebounceMs ?? DB.MAP_SAVE_DEBOUNCE_DEFAULT_MS) / 1000}">
          </label>
          <p style="font-size:11.5px; color:var(--text-dim)">
            Padrão: 1s. Mínimo ${DB.MAP_SAVE_DEBOUNCE_MIN_MS / 1000}s, máximo ${DB.MAP_SAVE_DEBOUNCE_MAX_MS / 1000}s.
          </p>
        </div>

        <!-- Pedido do usuário (27/08/2026): a seção "Conexão direta com outro
             aparelho (Wi-Fi, sem servidor)" foi REMOVIDA daqui (era a
             PRIMEIRA seção desta aba, ver histórico da rodada anterior no
             project.md) — js/p2p.js (P2PModule) continua no disco e
             app.js ainda tenta usá-lo oportunisticamente ao salvar um item
             (P2PModule.pushItem), mas sem esta UI não há mais como abrir
             uma conexão, então isso nunca mais dispara de fato; não removido
             do app inteiro de propósito, pra não mexer em mais arquivos do
             que o pedido pedia. -->
        <!-- REORGANIZADO (07/09/2026), pedido verbatim: "separe o que é
             servidor no sentido de o app estar rodando em um servidor local
             e guardando arquivos localmente da ideia de servidor no sentido
             de interagir com outros aparelhos." Antes desta rodada, um único
             card "🖥️ Servidor local (opcional)" misturava 3 ideias
             diferentes: (a) a CONEXÃO em si (URL, como montar o servidor);
             (b) ARMAZENAMENTO em arquivo por este servidor (pasta de dados,
             restaurar backup, estrutura de arquivos, IndexedDB duplo) —
             pedido do usuário: "não depende do IndexedDB [de OUTROS
             aparelhos], só pelo fato de não depender do IndexedDB [deste
             aparelho]"; (c) SINCRONIZAÇÃO com outros aparelhos (já era um
             card à parte). Viram 3 cards agora: (a) e (c) continuam com os
             mesmos nomes de sempre; (b) é o card novo "💾 Armazenamento no
             servidor" logo abaixo deste. -->
        <div class="settings-section" data-cat="servidor">
          <h3>🖥️ Servidor local (opcional)</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Um site puro (HTML/CSS/JS) não acessa o disco do computador sozinho —
            sem um servidor, não dá para gravar em arquivo nem sincronizar entre
            aparelhos. Esta seção é só sobre a CONEXÃO deste aparelho com um
            servidor local (que você mesmo hospeda); o que ele guarda em arquivo
            está no card "💾 Armazenamento no servidor" logo abaixo, e o uso com
            vários aparelhos ao mesmo tempo está em "🔗 Sincronização entre
            aparelhos", mais abaixo ainda.
          </p>
          <label class="field">
            <span class="lbl">Este aparelho é PC ou celular? E vai ter servidor ou não? (detectamos automaticamente o tipo de aparelho, e já deixamos "sem servidor" marcado)</span>
            <select id="st-cenario">
              <option value="pc-sem-servidor" ${cfg.cenarioServidor === 'pc-sem-servidor' ? 'selected' : ''}>💻 PC, sem servidor</option>
              <option value="pc-com-servidor" ${cfg.cenarioServidor === 'pc-com-servidor' ? 'selected' : ''}>💻 PC, com servidor</option>
              <option value="celular-sem-servidor" ${cfg.cenarioServidor === 'celular-sem-servidor' ? 'selected' : ''}>📱 Celular, sem servidor</option>
              <option value="celular-com-servidor" ${cfg.cenarioServidor === 'celular-com-servidor' ? 'selected' : ''}>📱 Celular, com servidor</option>
            </select>
          </label>
          <div id="st-cenario-semservidor" class="${semServidor(cfg.cenarioServidor) ? '' : 'hidden'}" style="margin:4px 0 10px">
            <button class="btn secondary sm" id="st-baixar-tudo" title="Gera um arquivo para baixar com tudo que já foi catalogado neste aparelho">⬇️ Baixar tudo que já foi catalogado</button>
          </div>
          <!-- NOVO (07/09/2026), pedido verbatim: "já que estou rodando em
               um servidor local. O próprio app deve se comunicar com o
               servidor. Usar caminhos padrão e fazer configurações
               automaticamente de modo que se possa 'ligar' o app ir fazendo
               as atividades e não se preocupar em 'Configurar a URL do
               servidor local'." Ver ServerPrefs.autoDetectarServidorLocal
               (js/serverprefs.js, chamada 1x no boot — app.js) — preenche
               este campo sozinho quando o app é aberto por http(s)://  e
               existe um receive.php/js respondendo na mesma pasta. O campo
               continua editável normalmente pra quem quiser apontar pra
               OUTRO endereço (ex.: servidor rodando em outro aparelho da
               rede) — a detecção automática só age quando este campo está
               vazio, nunca sobrescreve um valor já configurado. -->
          <label class="field ${semServidor(cfg.cenarioServidor) ? 'hidden' : ''}" id="st-webhook-url-field">
            <span class="lbl">URL do servidor — ex: http://192.168.0.10/catalogo/receive.php (o mesmo campo serve tanto para um servidor rodando NESTE aparelho quanto para um servidor rodando em OUTRO aparelho da rede — veja as abas abaixo). Se este app já foi aberto por um endereço http(s):// com um servidor respondendo na mesma pasta, este campo é preenchido sozinho.</span>
            <input type="url" id="st-webhook-url" value="${Utils.escapeHtml(cfg.servidorUrl || '')}" placeholder="http://SEU-SERVIDOR/receive.php">
          </label>
          <label class="radio-opt">
            <input type="checkbox" id="st-webhook-imgs" ${cfg.servidorIncluirImagens ? 'checked' : ''}>
            <span><span class="t">Incluir fotos/avatares nos envios ao servidor</span><br><span class="d">Aumenta bastante o tamanho enviado — desative em conexões lentas.</span></span>
          </label>

          <div id="st-server-instructions" style="font-size:12.5px; color:var(--text-dim); margin-top:10px; white-space:pre-wrap; line-height:1.5; background:var(--bg-elev); border:1px solid var(--border); border-radius:10px; padding:10px"></div>

          <div id="st-servertabs-wrap" class="${semServidor(cfg.cenarioServidor) ? 'hidden' : ''}" style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border)">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px">
              <span style="font-size:13px; font-weight:600">Como montar o servidor — escolha uma forma:</span>
              <button type="button" class="btn secondary sm" id="st-download-guia-texto" title="Baixa um arquivo de texto com o passo a passo completo das 4 formas (PHP, XAMPP, Node.js completo e Node.js simples), formatado igual a um guia">📄 Baixar guia (texto)</button>
            </div>
            <div class="st-servertabs" id="st-servertabs">
              <button type="button" class="st-servertab active" data-tab="php" title="PHP embutido — usa o comando 'php -S', vem junto com qualquer instalação do PHP, sem instalar mais nada">🐘 PHP</button>
              <button type="button" class="st-servertab" data-tab="xampp" title="XAMPP — pacote pronto com PHP + Apache, com painel gráfico (só PC)">🧩 XAMPP</button>
              <button type="button" class="st-servertab" data-tab="node" title="Node.js — alternativa ao PHP, script pronto incluso neste app">🟢 Node.js</button>
            </div>
            <div id="st-servertab-content" class="st-servertab-content"></div>
          </div>
        </div>

        <!-- NOVO (07/09/2026) — card separado, pedido verbatim: "O botão
             que agora é 'Restaurar tudo a partir do servidor', o botão
             'Guardar também no IndexedDB (além do servidor)', a 'Estrutura
             de arquivos do servidor' e, se tiver outra coisa relacionada a
             salvar as coisas localmente (sem a ideia de outros aparelhos,
             só pelo fato de não depender do IndexedDB), devem ficar em um
             card a parte." Também entrou aqui (mesma ideia, "não depende do
             IndexedDB deste aparelho"): status de preferências/backup
             automático e a pasta de dados no servidor — nenhum dos dois
             tem relação com OUTROS aparelhos, só com este servidor guardando
             arquivo. -->
        <!-- REMOVIDO (07/09/2026), pedido verbatim do usuário: "exclua o
             texto: 'O que o servidor local (card acima) guarda em ARQUIVO
             neste aparelho — sem nenhuma relação com outros PCs/celulares
             (isso é o card 🔗 Sincronização entre aparelhos, mais
             abaixo).'" — o parágrafo de introdução deste card foi removido;
             o comentário grande logo acima (fora deste template, ver
             "REORGANIZADO (07/09/2026)") continua documentando por que o
             card existe separado, só o TEXTO VISÍVEL na tela saiu. -->
        <div class="settings-section ${semServidor(cfg.cenarioServidor) ? 'hidden' : ''}" data-cat="servidor" id="st-card-armazenamento">
          <h3>💾 Armazenamento no servidor</h3>
          <!-- NOVO (01/09/2026), item GRANDE #3 do pedido de 12 itens,
               verbatim: "Deve ser possível guardar direto em arquivo pelo
               servidor local, além do indexedDB [...] Deve ser possível
               guardar em uma pasta dentro do projeto (para caso se exclua
               os dados do navegador e não se tenha 'exportado', então,
               seja possível recuperar tudo). As configurações e opções de
               menu devem ser guardadas em um arquivo a parte". Ver
               js/serverprefs.js — envia sozinho, em segundo plano, sempre
               que houver URL de servidor preenchida; o botão abaixo é só
               pra RECUPERAR (nunca acontece sozinho, de propósito — é uma
               ação explícita da pessoa). -->
          <div id="st-serverprefs-status" class="${semServidor(cfg.cenarioServidor) ? 'hidden' : ''}" style="font-size:11.5px; color:var(--text-dim); margin:8px 0"></div>
          <!-- NOVO (03/09/2026) — Pedido do usuário: "deve ser possível
               configurar [a pasta onde o servidor guarda os arquivos]. Por
               padrão é em uma pasta dentro do app [...] Isto deve ficar
               claro visualmente." Campo + botão conversam com
               ServerPrefs.configurarPastaDados/statusArmazenamento (ver
               js/serverprefs.js), que por sua vez conversam com as ações
               "configurar-pasta-dados"/"status-armazenamento" novas em
               server/receive.js/receive.php. -->
          <!-- MUDADO (07/09/2026), pedido verbatim: "E já deixe o nome do
               pasta padrão. e um botão lateral para editar assim como se faz
               com o nome dos mapas. Para evitar apagar sem querer e não se
               lembrar tendo que reiniciar o app." — ANTES: um campo de
               texto (input) sempre aberto/editável (risco de apagar o
               caminho sem querer, e nada visível "de volta" até clicar
               "Salvar pasta" — se a pessoa esquecesse o valor original,
               reiniciar o app não ajudava, já que o campo não carregava
               nada sozinho). AGORA: mesmo padrão de "✏️ Renomear este mapa"
               (ver mapview.js, método _openMapSwitcherModal) — o caminho ATUAL
               (sempre consultado de verdade no servidor, nunca perdido) fica
               só como TEXTO ao lado de um botão ✏️; editar exige um clique
               explícito, que abre uma janela "prompt" JÁ PREENCHIDA com o valor
               atual (nunca em branco) — cancelar (Esc/Cancelar) não muda
               nada. -->
          <div id="st-pastadados-wrap" class="${semServidor(cfg.cenarioServidor) ? 'hidden' : ''}" style="margin-bottom:10px">
            <div class="lbl" style="margin-bottom:4px">Pasta onde o servidor guarda os arquivos</div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
              <span id="st-pastadados-atual" style="font-size:12.5px; flex:1; min-width:140px">Consultando pasta atual no servidor…</span>
              <button type="button" class="icon-btn sm" id="st-pastadados-editar" title="Editar a pasta onde o servidor guarda os arquivos (mesmo botão usado para renomear mapas)">✏️</button>
            </div>
            <span class="d" style="display:block; margin-top:4px">Padrão: uma pasta "storage" dentro da pasta do servidor. Pode apontar para outro lugar (relativo à pasta do servidor, ou um caminho absoluto, ex: D:\Backups\catalogacao).</span>
          </div>
          <!-- RENOMEADO (07/09/2026), pedido verbatim: "O botão 'Restaurar
               tudo do servidor' deve ter o texto trocado para 'Restaurar
               tudo a partir do servidor'." -->
          <!-- NOVO (07/09/2026), pedido verbatim: "O botão 'Restaurar tudo
               a partir do servidor' serve para carregar as informações do
               servidor e copiar para o IndexedDB? Se sim, isso deve ficar
               claro com uma descrição." — resposta: sim, exatamente isso;
               descrição adicionada abaixo do botão (antes só existia como
               "title", que exige passar o mouse por cima pra ler). -->
          <div id="st-serverprefs-actions" class="${semServidor(cfg.cenarioServidor) ? 'hidden' : ''}" style="margin-bottom:10px">
            <button class="btn secondary sm" id="st-restaurar-servidor" title="Busca o backup completo mais recente salvo pelo servidor local (itens, tipos, setores, mapas, fotos e preferências) e importa aqui — útil se os dados do navegador foram apagados sem ter exportado antes">⬇️ Restaurar tudo a partir do servidor</button>
            <p class="d" style="margin-top:6px">Busca o backup completo mais recente que o servidor tem guardado e IMPORTA para o IndexedDB deste aparelho — mesmo fluxo de "⬆️ Importar backup" (pergunta o que fazer com cada item que já existir aqui, nada é apagado sem perguntar). Útil se os dados do navegador deste aparelho foram apagados sem antes exportar/restaurar.</p>
          </div>

          <!-- MUDADO (07/09/2026), pedido verbatim: "No botão 'Guardar
               também no IndexedDB (além do servidor)', diz '...é o que faz
               a tabela/busca/mapa aparecerem na tela...'. Não tem o
               porquê disso, pois basta que as informações estejam
               acessíveis, se for do IndexedDB ou de um arquivo carregado
               via servidor não importa." + "Além da opção 'Guardar no
               IndexedDB', deve ter a opção de 'guardar no servidor'. Uma
               sempre deve ficar ativa ou as duas. Por padrão, agora, o
               IndexedDB deve ficar marcado e, mesmo rodando em um
               servidor, a opção de 'guardar no servidor' fica desmarcada
               por padrão." — ANTES: 1 único toggle "Guardar também no
               IndexedDB (além do servidor)", desligado por padrão, cuja
               descrição justificava (de forma confusa/desnecessária,
               removida agora) o IndexedDB sempre estar ativo citando
               "é o que faz a tabela/busca/mapa aparecerem". AGORA: 2
               checkboxes INDEPENDENTES — "Guardar no IndexedDB" (novo,
               ligado por padrão) e "Guardar no servidor" (reaproveita a
               MESMA chave 'autoSaveAtivo' já usada em "💾 Salvamento
               automático em arquivo", mais abaixo nas Configurações — uma
               coisa só, mostrada em 2 lugares, nunca 2 configurações
               diferentes controlando o mesmo comportamento) — com uma
               trava (ver _wireGuardarDestinos abaixo) que impede
               desmarcar as duas ao mesmo tempo. Ver db.js
               _emitSaveStatus/_saveDestinoCache. -->
          <div class="${semServidor(cfg.cenarioServidor) ? 'hidden' : ''}" id="st-guardar-destinos-field" style="margin-bottom:10px">
            <label class="radio-opt">
              <input type="checkbox" id="st-guardar-indexeddb" ${cfg.guardarIndexedDB === false ? '' : 'checked'}>
              <span><span class="t">Guardar no IndexedDB</span><br><span class="d">Ligado por padrão. Esta opção só muda se a mensagem "✅ Salvo" conta o IndexedDB (banco de dados do navegador deste aparelho) como destino oficial.</span></span>
            </label>
            <label class="radio-opt" style="margin-top:6px">
              <input type="checkbox" id="st-guardar-servidor" ${cfg.autoSaveAtivo ? 'checked' : ''}>
              <span><span class="t">Guardar no servidor</span><br><span class="d">Desligado por padrão, mesmo com um servidor configurado. Ligado, cada item confirmado na captura é enviado automaticamente para o servidor e gravado em arquivo — a MESMA opção de "💾 Salvamento automático em arquivo" mais abaixo nestas Configurações (as duas mudam a mesma coisa; marcar/desmarcar aqui já reflete lá, e vice-versa).</span></span>
            </label>
            <p class="d" style="margin-top:6px" id="st-guardar-destinos-aviso">Pelo menos uma das duas precisa ficar marcada — não é possível desmarcar as duas ao mesmo tempo.</p>
          </div>

          <!-- NOVO (07/09/2026), pedido verbatim: "Se há algo no indexedDB
               e o app está rodando em servidor e for verificado que o que
               está no indexedDB não está no servidor, uma opção para
               gravar tudo no servidor deve ficar disponível, em algum
               lugar. Neste mesmo lugar que ficar este botão, a estrutura
               de pastas deve ser mostrada (com ícones de pastas e clicável
               e interagível)." Ver ServerPrefs.itensFaltandoNoServidor/
               enviarTodosParaServidor/listarArquivos (js/serverprefs.js) e
               a ação nova "listar-arquivos" (server/receive.js/receive.php). -->
          <!-- MUDADO (07/09/2026), pedido verbatim: "Coloque a 'Estrutura
               de arquivos do servidor' em um botão que quando clicado abre
               uma janela e mostra a estrutura." — ANTES: a árvore ficava
               sempre desenhada direto na tela de Configurações (podia ficar
               grande, consultava o servidor toda vez que a tela abria,
               mesmo se a pessoa não quisesse ver isso agora). AGORA: só um
               botão aqui; a árvore é consultada e desenhada dentro de uma
               janela modal (mesmo modal-backdrop/modal-sheet usado no
               resto do app), aberta só quando a pessoa clica — ver
               _abrirModalEstruturaArquivos abaixo. -->
          <div id="st-storage-wrap" class="${semServidor(cfg.cenarioServidor) ? 'hidden' : ''}" style="margin:10px 0; padding-top:10px; border-top:1px solid var(--border)">
            <div id="st-storage-discrepancia" style="font-size:12.5px; color:var(--text-dim); margin-bottom:8px">Verificando itens no servidor…</div>
            <button type="button" class="btn secondary sm" id="st-storage-ver-arvore" title="Abre uma janela mostrando a estrutura de pastas/arquivos de verdade no servidor">📁 Ver estrutura de arquivos no servidor</button>
          </div>
        </div>

        <div class="settings-section ${semServidor(cfg.cenarioServidor) ? 'hidden' : ''}" data-cat="servidor" id="st-card-sync">
          <h3>🔗 Sincronização entre aparelhos (vários PCs/celulares ao mesmo tempo)</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Com o servidor local acima configurado, cada aparelho (PC, celular etc.)
            pode catalogar AO MESMO TEMPO sem conflito — cada item já nasce com um
            ID único, então nada é sobrescrito. Se dois aparelhos catalogarem o
            <b>mesmo número de patrimônio</b>, os dois catálogos ficam salvos e, na
            busca, aparecem juntos numa lista ("N catálogos recebidos para este
            patrimônio"). Este aparelho puxa periodicamente do servidor o que os
            outros enviaram, para que a tabela e a busca mostrem o catálogo combinado.
          </p>
          <label class="field">
            <span class="lbl">Apelido deste aparelho (ajuda a identificar a origem de cada catálogo na busca)</span>
            <input type="text" id="st-device-label" value="${Utils.escapeHtml(Session?.label || '')}" placeholder="ex: Celular do Almoxarifado">
          </label>
          <p style="font-size:11.5px; color:var(--text-dim); font-family:monospace">ID deste aparelho: ${Utils.escapeHtml(Session?.id || '—')}</p>
          <label class="radio-opt">
            <input type="checkbox" id="st-sync-auto" ${cfg.syncAutoAtivo !== false ? 'checked' : ''}>
            <span><span class="t">Sincronizar automaticamente em segundo plano</span><br><span class="d">Busca no servidor a cada ~20s o que outros aparelhos cadastraram, enquanto o app estiver aberto.</span></span>
          </label>
          <div style="display:flex; align-items:center; gap:10px; margin-top:8px; flex-wrap:wrap">
            <button class="btn secondary sm" id="st-sync-now" title="Buscar agora no servidor o que outros aparelhos cadastraram">🔄 Sincronizar agora</button>
            <span id="st-sync-last" style="font-size:11.5px; color:var(--text-dim)"></span>
          </div>
        </div>

        <div class="settings-section" data-cat="mapa">
          <h3>📊 HUD de performance</h3>
          <label class="radio-opt">
            <input type="checkbox" id="st-hud" ${cfg.hudAtivo ? 'checked' : ''}>
            <span><span class="t">Mostrar HUD (FPS / CPU~ / RAM)</span><br><span class="d">Sobrepõe um painel com FPS, uma estimativa de uso de CPU (tempo de frame) e uso de memória — útil para diagnosticar travamentos no mapa (2D) ou na visualização 3D.</span></span>
          </label>
        </div>

        <div class="settings-section" data-cat="mapa">
          <h3>↶ Desfazer/Refazer</h3>
          <label class="radio-opt">
            <input type="checkbox" id="st-history-sempre" ${cfg.historySempreVisivel ? 'checked' : ''}>
            <span><span class="t">Sempre mostrar os botões ↶/↷ na tela</span><br><span class="d">Por padrão, os botões de desfazer/refazer só aparecem quando há alguma ação recente pra desfazer ou refazer. Marque para deixá-los sempre visíveis (desabilitados quando não há nada a fazer). Funciona para: remover orb, excluir foto de ambiente, editar item, excluir item (um ou vários) e importar backup. No PC também dá pra usar Ctrl+Z / Ctrl+Y.</span></span>
          </label>
        </div>

        <div class="settings-section" data-cat="mapa">
          <h3>🔐 Permissões do aparelho</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Ative aqui, de propósito com um toque, em vez de deixar o app pedir escondido
            no meio do cadastro de cada item — a decisão fica guardada neste aparelho e o
            app não pergunta de novo a cada item.
          </p>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:8px">
            <span style="font-size:13.5px">📍 Localização (GPS)<br><span id="perm-geo-status" style="font-size:11.5px; color:var(--text-dim)">${this._permLabel(geoConcedida)}</span></span>
            <button class="btn secondary sm" id="perm-geo-btn" title="Autorizar o uso da localização deste aparelho — pede uma vez e a decisão fica guardada">📍 Ativar geolocalização</button>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:10px">
            <span style="font-size:13.5px">📷 Câmera<br><span id="perm-cam-status" style="font-size:11.5px; color:var(--text-dim)">${this._permLabel(camConcedida)}</span></span>
            <button class="btn secondary sm" id="perm-cam-btn" title="Autorizar o uso da câmera deste aparelho — pede uma vez e a decisão fica guardada">📷 Ativar câmera</button>
          </div>
        </div>

        <div class="settings-section" data-cat="mapa">
          <h3>🌐 Identificação do aparelho de origem</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            No campo "Cadastrado por" de cada item, além do apelido do aparelho (ver "🔗
            Sincronização entre aparelhos" acima), o app já inclui automaticamente o
            sistema operacional e navegador usados (e, em alguns Android/Chrome, o modelo do
            aparelho) — sem precisar de nenhuma permissão especial, pois é a mesma informação
            que qualquer site já recebe do navegador. <b>Importante:</b> nenhum navegador, em
            nenhuma plataforma, permite que uma página web leia o NOME que a pessoa deu ao
            computador/celular (ex: "PC-ALEX") nem o endereço MAC do aparelho — isso é
            bloqueado de propósito por segurança/privacidade, então esta aplicação não tem
            como coletar essas duas informações específicas.
          </p>
          <label class="radio-opt" style="margin-top:8px; padding-top:10px; border-top:1px solid var(--border)">
            <input type="checkbox" id="st-ip-ativo" ${ipCapturaAtivo ? 'checked' : ''}>
            <span><span class="t">Incluir o IP público da rede em cada item cadastrado</span><br><span class="d">Desativado por padrão. Precisa de internet no momento do cadastro (consulta um serviço externo — api.ipify.org). É o IP do roteador/operadora, COMPARTILHADO por todos os aparelhos dessa rede — não identifica o aparelho exato, só a rede. Se não conseguir obter, fica registrado no "🧾 Log de eventos" e o item é salvo normalmente, sem essa informação.</span></span>
          </label>
        </div>

        <!-- NOVO (08/09/2026), pedido verbatim: "Isso deve ser configurável
             em alguma seção das 'configurações do app', se ao selecionar a
             tela que será exibida, irá abrir em tela cheia ou não. Para
             todas que aparecem no dropdown [do Workspace]. [...] por
             padrão, todas devem ocupar apenas o espaço da divisão, não a
             tela cheia." Só as 4 ferramentas que HOJE têm um modo "tela
             cheia" de verdade pra alternar aparecem aqui — 'Mapa 2D'/
             'Ver em 3D'/'Buscar' sempre desenham DENTRO do painel que as
             abriu (nunca tiveram um modo tela cheia pra começo de
             conversa, então não haveria o que ligar/desligar). Lido por
             js/bsplayout.js (EDITOR_TYPES.foto/organizar) e
             js/mapview.js/view3d.js ('Acessar modelos'/Modelador,
             ambos "pertencem" à tela que os abre — ver pedido verbatim
             na mesma rodada). -->
        <div class="settings-section only-workspace" data-cat="mapa">
          <h3>🧩 Workspace — abrir em tela cheia?</h3>
          <p style="font-size:12.5px; color:var(--text-dim)">
            Quando uma divisão de tela do "🧩 Workspace" (barra inferior do app)
            está mostrando uma destas ferramentas, ela normalmente ocupa só o
            espaço daquela divisão. Marque para que, em vez disso, ela sempre
            abra por cima de tudo, cobrindo a tela inteira (como já era antes
            do Workspace existir).
          </p>
          <label class="radio-opt" style="margin-top:8px">
            <input type="checkbox" id="st-ws-fullscreen-foto" ${wsFullscreen.foto ? 'checked' : ''}>
            <span><span class="t">🖼️ Foto</span></span>
          </label>
          <label class="radio-opt">
            <input type="checkbox" id="st-ws-fullscreen-organizar" ${wsFullscreen.organizar ? 'checked' : ''}>
            <span><span class="t">🗂️ Organizar</span></span>
          </label>
          <label class="radio-opt">
            <input type="checkbox" id="st-ws-fullscreen-modelador" ${wsFullscreen.modelador ? 'checked' : ''}>
            <span><span class="t">🛠️ Modelador</span><br><span class="d">Pertence à tela "🧊 Ver em 3D" — aberto de dentro dela (botão "Editar"/duplo-clique num objeto, "🧊 Novo Cubo").</span></span>
          </label>
          <label class="radio-opt">
            <input type="checkbox" id="st-ws-fullscreen-acessarmodelos" ${wsFullscreen.acessarModelos ? 'checked' : ''}>
            <span><span class="t">🛠️ Acessar modelos</span><br><span class="d">Pertence à tela "🗺️ Mapa 2D" — aberto de dentro dela (ferramenta "🪑 Objetos" → botão "🛠️").</span></span>
          </label>
        </div>

      </div>
    `;

    container.querySelector('#st-server-instructions').textContent = this._serverInstructions(cfg.cenarioServidor);
    container.querySelector('#st-cenario').onchange = async (e) => {
      await DB.setSetting('cenarioServidor', e.target.value);
      container.querySelector('#st-server-instructions').textContent = this._serverInstructions(e.target.value);
      container.querySelector('#st-cenario-semservidor').classList.toggle('hidden', !semServidor(e.target.value));
      container.querySelector('#st-webhook-url-field').classList.toggle('hidden', semServidor(e.target.value));
      container.querySelector('#st-servertabs-wrap').classList.toggle('hidden', semServidor(e.target.value));
      container.querySelector('#st-serverprefs-status').classList.toggle('hidden', semServidor(e.target.value));
      container.querySelector('#st-pastadados-wrap')?.classList.toggle('hidden', semServidor(e.target.value));
      container.querySelector('#st-serverprefs-actions').classList.toggle('hidden', semServidor(e.target.value));
      container.querySelector('#st-guardar-destinos-field')?.classList.toggle('hidden', semServidor(e.target.value));
      container.querySelector('#st-storage-wrap')?.classList.toggle('hidden', semServidor(e.target.value));
      // NOVO (RODADA 217) — pedido verbatim: quando "PC, sem servidor" ou
      // "Celular, sem servidor" estiver marcado, os cards inteiros "💾
      // Armazenamento no servidor" e "🔗 Sincronização entre aparelhos"
      // devem deixar de aparecer (antes só sub-blocos internos do 1o card
      // eram escondidos; o card de sincronização nunca escondia nada).
      // Reage ao 'change' do próprio select #st-cenario (mesmo handler
      // acima), então a troca é visível na hora, sem fechar/reabrir as
      // Configurações.
      container.querySelector('#st-card-armazenamento')?.classList.toggle('hidden', semServidor(e.target.value));
      container.querySelector('#st-card-sync')?.classList.toggle('hidden', semServidor(e.target.value));
      const urlInput = container.querySelector('#st-webhook-url');
      const placeholders = {
        'pc-sem-servidor': 'não se aplica neste cenário',
        'celular-sem-servidor': 'não se aplica neste cenário',
        'pc-com-servidor': 'http://localhost/catalogo/receive.php (ou http://localhost:8000/receive.php, dependendo de como você montou o servidor abaixo)',
        'celular-com-servidor': 'http://localhost:8000/receive.php (ou o IP de outro aparelho da rede que esteja com o servidor rodando)',
      };
      urlInput.placeholder = placeholders[e.target.value] || 'http://SEU-SERVIDOR/receive.php';
    };
    this._wireServerTabs(container);
    this._wireSettingsCats(container);
    // Pedido do usuário, 26/08/2026: usa App.back() (desempilha de onde
    // veio) em vez de App.navigate() direto — ver comentário grande em
    // App._navStack (app.js). A versão antiga (App._prevView, uma única
    // variável) formava um CICLO com o botão "Fechar" do Unificar: entrar em
    // Unificar e sair de novo sobrescrevia _prevView com 'unificar', então
    // o "Fechar" daqui passava a voltar pra Unificar em vez de sair de vez.
    // [09/09/2026] CORRIGIDO — bug relatado pelo usuário: "o botão 'fechar'
    // (id='st-close') nas configurações ainda não funciona." Causa raiz:
    // desde a rodada anterior (09/09/2026, `App._openSettingsFullscreen`,
    // ver app.js), SettingsView SÓ é montada dentro do overlay de tela
    // cheia `#settings-fullscreen-overlay` — nunca mais como uma view
    // normal dentro de `#view`/`App.navigate`. Este handler continuava
    // chamando `App.back('tabela')` (o caminho ANTIGO, de quando as
    // Configurações eram só mais uma view empilhável) — isso troca a view
    // por baixo (`#view`) para 'tabela', mas NUNCA remove nem fecha o
    // `<div id="settings-fullscreen-overlay">` (que fica sozinho, sem
    // nenhum código dono dele além de `_openSettingsFullscreen`/seu botão
    // próprio `#settings-fullscreen-close`) — o overlay (fixed, cobrindo a
    // tela inteira, por cima de tudo) continuava visível e intacto, dando a
    // impressão de que o clique em "✕ Fechar" simplesmente não fazia nada.
    // Corrigido chamando o fechamento de VERDADE do overlay (o mesmo botão
    // `#settings-fullscreen-close`, que já faz `SettingsView.unmount()` +
    // `el.remove()` — ver `_openSettingsFullscreen` em app.js) quando ele
    // existir; mantém `App.back('tabela')` como fallback pra qualquer
    // contexto futuro em que SettingsView volte a ser montada fora do
    // overlay (não existe mais hoje, mas evita deixar o botão sem NENHUMA
    // ação nesse caso hipotético).
    container.querySelector('#st-close').onclick = () => {
      const fecharOverlay = document.getElementById('settings-fullscreen-close');
      if (fecharOverlay) fecharOverlay.click();
      else App.back('tabela');
    };
    container.querySelector('#st-reset-padroes').onclick = () => this._resetarPadroesDoApp();
    container.querySelector('#st-fabrica').onclick = () => this._abrirFabrica();
    container.querySelector('#st-baixar-tudo').onclick = () => this._downloadFullCatalog();
    const btnGuiaTexto = container.querySelector('#st-download-guia-texto');
    if (btnGuiaTexto) btnGuiaTexto.onclick = () => this._downloadServerGuideText();
    this._renderLastSync();
    container.querySelector('#st-restaurar-servidor').onclick = () => ServerPrefs.restaurarDoServidor(container);
    // MUDADO (07/09/2026), pedido verbatim: "E já deixe o nome do pasta
    // padrão. e um botão lateral para editar assim como se faz com o nome
    // dos mapas." — botão ✏️ (ver HTML acima) abre um `prompt()` JÁ
    // PREENCHIDO com o caminho atual de verdade (consultado no servidor via
    // `statusArmazenamento()`, nunca um valor "esquecido" de um campo em
    // branco) — mesmo padrão de `.map-switch-rename` em mapview.js
    // (`_openMapSwitcherModal`). Cancelar o prompt (Esc/Cancelar) não muda
    // nada; confirmar em branco volta pro padrão (pasta "storage").
    const btnPastaDadosEditar = container.querySelector('#st-pastadados-editar');
    if (btnPastaDadosEditar) {
      btnPastaDadosEditar.onclick = async () => {
        const status = await ServerPrefs.statusArmazenamento();
        if (!status) { Utils.toast('Não foi possível consultar o servidor agora (verifique se ele está rodando).', { type: 'warn' }); return; }
        const novaPasta = prompt('Pasta onde o servidor deve guardar os arquivos:\n\n(deixe em branco para voltar ao padrão — uma pasta "storage" dentro da pasta do servidor)', status.pastaDadosAtual || '');
        if (novaPasta === null) return; // cancelou — nada muda
        const resultado = await ServerPrefs.configurarPastaDados(novaPasta.trim());
        if (resultado) this._renderServerPrefsStatus();
      };
    }
    // MUDADO (07/09/2026), pedido verbatim: "Agora, além da a opção
    // 'Guardar no IndexedDB', deve ter a opção de 'guardar no servidor'.
    // Uma sempre deve ficar ativa ou as duas." — ANTES: um único checkbox
    // '#st-espelhar-indexeddb' (chave 'servidorEspelharIndexedDB'). AGORA:
    // dois checkboxes independentes com trava mútua (ver `_wireGuardarDestinos`
    // abaixo) e o botão que abre a árvore de arquivos em modal (ver
    // `_abrirModalEstruturaArquivos` abaixo).
    this._wireGuardarDestinos(container);
    const btnVerArvore = container.querySelector('#st-storage-ver-arvore');
    if (btnVerArvore) btnVerArvore.onclick = () => this._abrirModalEstruturaArquivos();
    this._renderServerPrefsStatus();
    this._renderStorageSection();

    container.querySelector('#perm-geo-btn').onclick = () => this._requestGeoPermission();
    container.querySelector('#perm-cam-btn').onclick = () => this._requestCameraPermission();
    container.querySelector('#st-ip-ativo').onchange = async (e) => {
      await Session.setIpCaptureEnabled(e.target.checked);
      EventLog.log(`Captura de IP público ${e.target.checked ? 'ativada' : 'desativada'}.`, { tipo: 'info' });
    };

    container.querySelector('#st-icones-ativo').onchange = async (e) => {
      await Icons.setEnabled(e.target.checked);
      const lista = container.querySelector('#icones-lista');
      if (lista) { lista.style.opacity = e.target.checked ? '' : '.45'; lista.style.pointerEvents = e.target.checked ? '' : 'none'; }
    };
    container.querySelectorAll('.icon-alias-input').forEach((input) => {
      input.onchange = async (e) => { await Icons.setAliasesForKey(e.target.dataset.key, e.target.value); };
    });
    container.querySelector('#st-icones-reset').onclick = async () => {
      if (!confirm('Restaurar as palavras-chave de TODOS os ícones para o padrão de fábrica?')) return;
      await Icons.resetAliases();
      Utils.toast('Palavras-chave restauradas ✓', { type: 'ok' });
      // Remonta a tela pra refletir os valores restaurados — preserva o
      // scroll (pedido do usuário: rolagem não deve resetar sem ser um
      // reload de verdade), já que isto reconstrói o HTML inteiro do zero.
      const scrollTop = container.scrollTop;
      await this.mount(container);
      container.scrollTop = scrollTop;
    };
    container.querySelector('#st-icones-internet').onchange = async (e) => { await Icons.setRemoteEnabled(e.target.checked); };
    container.querySelectorAll('input[name="st-icones-fallback"]').forEach((input) => {
      input.onchange = async (e) => {
        if (!e.target.checked) return;
        await Icons.setFallbackMode(e.target.value);
        EventLog.log(`Ícone sem correspondência específica passou a usar: ${e.target.value === Icons.FALLBACK_PADRAO ? 'ícone padrão (caixa)' : 'ícone descritivo (iniciais)'}.`, { tipo: 'info' });
      };
    });

    container.querySelector('#st-eventlog-view').onclick = () => this.showEventLog();
    container.querySelector('#st-eventlog-clear').onclick = () => {
      if (EventLog.count() === 0) { Utils.toast('O log já está vazio.', { type: 'warn' }); return; }
      if (!confirm('Limpar o log de eventos deste aparelho? Isso não afeta o catálogo nem nenhum item.')) return;
      EventLog.clear();
      container.querySelector('#st-eventlog-count').textContent = '0';
      Utils.toast('Log de eventos limpo ✓', { type: 'ok' });
    };

    container.querySelector('#st-persist-btn')?.addEventListener('click', async () => {
      const r = await DB.requestPersistentStorage();
      const statusEl = container.querySelector('#st-persist-status');
      if (r.persistido) {
        if (statusEl) statusEl.textContent = '🔒 Armazenamento persistente ativo — o navegador evita apagar os dados deste app sozinho por falta de espaço.';
        container.querySelector('#st-persist-btn')?.remove();
        Utils.toast('Armazenamento persistente ativado ✓', { type: 'ok' });
        EventLog.log('Armazenamento persistente concedido (pedido manual).', { tipo: 'ok' });
      } else {
        Utils.toast('O navegador não concedeu armazenamento persistente desta vez (pode depender de critérios internos dele, como o app já estar instalado/usado com frequência).', { type: 'warn', duration: 6000 });
        EventLog.log('Armazenamento persistente não concedido (pedido manual).', { tipo: 'aviso' });
      }
    });

    container.querySelector('#st-force-reload')?.addEventListener('click', async () => {
      const btn = container.querySelector('#st-force-reload');
      btn.disabled = true;
      btn.textContent = 'Recarregando…';
      EventLog.log('Atualização forçada pedida pelo usuário (sem cache).', { tipo: 'info' });
      await App.forceHardReload();
    });

    container.querySelector('#st-export').onclick = () => this._openExportModal();

    container.querySelector('#st-autoexport-ativo').onchange = async (e) => {
      await AutoExport.setEnabled(e.target.checked);
      await AutoExport.start();
    };
    container.querySelector('#st-autoexport-intervalo').onchange = async (e) => {
      await AutoExport.setIntervalMin(e.target.value);
      await AutoExport.start();
    };
    container.querySelectorAll('.autoexport-dest').forEach((chk) => {
      chk.onchange = async () => {
        const marcados = [...container.querySelectorAll('.autoexport-dest:checked')].map((c) => c.value);
        await AutoExport.setDestinos(marcados);
      };
    });
    container.querySelector('#st-autoexport-imagens').onchange = async (e) => { await AutoExport.setIncluirImagens(e.target.checked); };
    container.querySelector('#st-autoexport-now').onclick = async (ev) => {
      const btn = ev.currentTarget;
      const original = btn.textContent;
      btn.disabled = true; btn.textContent = 'Exportando…';
      try { await AutoExport.runNow(); } finally {
        btn.disabled = false; btn.textContent = original;
        const p = container.querySelector('#st-autoexport-ativo')?.closest('.settings-section')?.querySelector('p:last-of-type');
        const ultimo = await AutoExport.getLastExportAt();
        if (p) p.textContent = `Última exportação automática: ${ultimo ? Utils.formatDateTime(ultimo) : 'nunca'}.`;
      }
    };

    container.querySelector('#st-import').onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      // Aceita vários arquivos de uma vez, de propósito — desde que "Exportar
      // backup" também pode gerar um .json PARA CADA item (em vez de um
      // arquivo único), importar precisa juntar todos eles numa só operação.
      // FASE 1: só lê e junta tudo (nenhuma escrita ainda) — os itens de
      // TODOS os arquivos entram numa lista única antes de decidir o que
      // fazer com duplicados, pra perguntar UMA vez só, não por arquivo.
      let todosOsItens = [];
      let falhasLeitura = 0;
      // Mapas encontrados nos arquivos (`dump.maps`) — pedido do usuário
      // (28/08/2026): "o botão importar tem que ter a nova interpretação das
      // coisas. Agora há a possibilidade de criar mais de um mapa e fotos
      // são atreladas a cada mapa, além dos patrimônios." Até aqui,
      // `dump.maps` era simplesmente IGNORADO na importação (fundido/perdido
      // no único mapa "atual" do aparelho) — agora cada mapa do backup é
      // importado de verdade (ver DB.importMaps, FASE 2 abaixo), preservando
      // seu id pra itens/fotos que apontam pra ele (`ambienteId`) serem
      // reencaixados no mapa CERTO, não mais "o mapa atual". Dedup por id —
      // o mesmo mapa pode aparecer em mais de um arquivo selecionado (ex.:
      // "Um arquivo por item" gera um .json por mapa); a última ocorrência
      // lida vale.
      const mapasPorId = new Map();
      // Tipos/setores/fotos de ambiente de TODOS os arquivos, juntados aqui
      // (em vez de chamar DB.importSupplementary por arquivo, como antes) —
      // as fotos só podem ser reencaixadas no mapa certo DEPOIS que os mapas
      // acima forem resolvidos (FASE 2), então a mesclagem de verdade fica
      // pra depois (FASE 3).
      let todosOsTypes = [], todosOsSetores = [], todasMapPhotos = [], todasFotosAmbiente = [];
      // Pedido do usuário (v310): "se são 7 arquivos, deve aparecer algo como
      // 'Salvando (1/7)...' e uma barrinha" + "enquanto as informações estão
      // sendo processadas... deve aparecer no canto da tela uma barrinha...
      // às vezes, sem ter um recurso visual, do nada, aparece uma janela
      // perguntando se deseja substituir os arquivos" — liga o "modo em
      // lote" do selo (ver App.setBulkSaveStatus em app.js) JÁ NESTA FASE de
      // leitura/parse (antes de qualquer pergunta de conflito aparecer), pra
      // deixar visualmente claro, do início ao fim, que algo está em
      // andamento. Continua ativo durante as FASES 2-5 abaixo (mapas,
      // complementos, itens) — só desliga no fim do fluxo inteiro (ou em
      // qualquer `return` de cancelamento/erro no meio do caminho).
      App.setBulkSaveStatus?.(`📥 Lendo arquivo (1/${files.length})…`, { current: 0, total: files.length });
      let _loteConcluido = false;
      try {
      let _i = 0;
      for (const file of files) {
        _i++;
        App.setBulkSaveStatus?.(`📥 Lendo arquivo (${_i}/${files.length})…`, { current: _i - 1, total: files.length });
        try {
          const text = await file.text();
          const dump = JSON.parse(text);
          const normalizado = Array.isArray(dump) ? { versao: 1, items: dump } : dump;
          if (Array.isArray(normalizado.items)) todosOsItens = todosOsItens.concat(normalizado.items);
          if (Array.isArray(normalizado.maps)) normalizado.maps.forEach((m) => { if (m?.id) mapasPorId.set(m.id, m); });
          if (Array.isArray(normalizado.types)) todosOsTypes = todosOsTypes.concat(normalizado.types);
          if (Array.isArray(normalizado.sectors)) todosOsSetores = todosOsSetores.concat(normalizado.sectors);
          if (Array.isArray(normalizado.mapPhotos)) todasMapPhotos = todasMapPhotos.concat(normalizado.mapPhotos);
          // `fotosDeAmbiente` (chave usada pelo formato categorizado de "⬇️
          // Exportar" — ver _openExportModal) tem o MESMO formato de registro
          // de `mapPhotos` (backup completo) — pedido do usuário: "Exportei
          // os mapas e fotos ligadas a eles, depois importei, porém não
          // aparecem": esta chave não era lida aqui antes desta correção, um
          // backup exportado só com a categoria "Imagens" simplesmente não
          // trazia nenhuma foto de volta na importação.
          if (Array.isArray(normalizado.fotosDeAmbiente)) todasFotosAmbiente = todasFotosAmbiente.concat(normalizado.fotosDeAmbiente);
        } catch (err) {
          falhasLeitura++;
          console.warn(`Falha ao ler "${file.name}":`, err);
        }
      }
      e.target.value = '';
      const mapasEncontrados = [...mapasPorId.values()];

      if (!todosOsItens.length && !mapasEncontrados.length && !todasMapPhotos.length && !todasFotosAmbiente.length && !todosOsTypes.length && !todosOsSetores.length) {
        if (falhasLeitura) { Utils.toast(`Não foi possível ler ${falhasLeitura} arquivo(s) — veja o console.`, { type: 'danger' }); return; }
        Utils.toast('Nenhum item, mapa ou foto encontrado nos arquivos selecionados.', { type: 'warn' });
        return;
      }

      // FASE 2 (mapas): pergunta o que fazer com mapas que colidem com um
      // mapa já local (mesmo id — normalmente reimportando o próprio backup
      // no mesmo aparelho), só se houver algum. Sem conflito nenhum, cada
      // mapa do backup já entra direto como um mapa NOVO (ver DB.importMaps).
      // Pedido do usuário (28/08/2026): "Deve haver a possibilidade de
      // mesclar mapas e fotos. Também na importação..." — agora reusa o
      // helper compartilhado `Utils.importMapsWithConflictUI` (ver
      // utils.js), que além de manter/substituir/ambos/cancelar também
      // oferece "🔀 Mesclar — escolher mapa a mapa" (revisão individual,
      // com contagem de itens/fotos/objetos de cada lado).
      let mapIdRemap = new Map();
      let rMaps = { criados: 0, atualizados: 0, mantidos: 0, criadosMaps: [], atualizadosAntes: [], idRemap: new Map() };
      if (mapasEncontrados.length) {
        const resultado = await Utils.importMapsWithConflictUI(mapasEncontrados, {
          countNewSide: (m) => ({
            itens: todosOsItens.filter((it) => it?.ambienteId === m.id).length,
            fotos: [...todasMapPhotos, ...todasFotosAmbiente].filter((p) => p?.ambienteId === m.id).length,
          }),
        });
        if (!resultado) { Utils.toast('Importação cancelada — nada foi alterado.', { type: 'warn' }); return; }
        rMaps = resultado;
        mapIdRemap = rMaps.idRemap;
        if (rMaps.criados || rMaps.atualizados) App._refreshCurrentView?.();
      }

      // FASE 3: tipos/setores/fotos de ambiente — sem conflito de duplicado
      // aqui; as fotos são reencaixadas no mapa CERTO via `mapIdRemap` (o
      // mapa de onde vieram no backup), não mais forçadas no mapa "atual"
      // do aparelho (ver DB.importSupplementary).
      await DB.importSupplementary(
        { types: todosOsTypes, sectors: todosOsSetores, mapPhotos: todasMapPhotos, fotosDeAmbiente: todasFotosAmbiente },
        { mapIdRemap },
      );

      if (!todosOsItens.length) {
        const partes = [];
        if (rMaps.criados) partes.push(`${rMaps.criados} mapa(s) novo(s)`);
        if (rMaps.atualizados) partes.push(`${rMaps.atualizados} mapa(s) com a planta substituída`);
        if (rMaps.mantidos) partes.push(`${rMaps.mantidos} mapa(s) mantido(s) como já estavam`);
        if (todasMapPhotos.length + todasFotosAmbiente.length) partes.push(`${todasMapPhotos.length + todasFotosAmbiente.length} foto(s) de ambiente`);
        if (falhasLeitura) partes.push(`${falhasLeitura} arquivo(s) não lido(s)`);
        Utils.toast(`Backup importado ✓ — ${partes.join(', ') || 'nada a fazer'}.`, { type: 'ok', duration: 5500 });
        EventLog.log(`Backup importado (sem patrimônios): ${partes.join(', ') || 'nada a fazer'} (${files.length} arquivo(s)).`, { tipo: 'ok' });
        App._refreshCurrentView?.();
        AmbientePhotos.refreshIfOpen?.();
        return;
      }

      // Reencaixa `item.ambienteId` no mapa CERTO (o de onde o item veio no
      // backup — via `mapIdRemap`, resolvido na FASE 2 acima), em vez de
      // forçar tudo no mapa "atual" do aparelho como antes desta correção. Um
      // ambienteId que não está no remapeamento mas já bate com um mapa
      // LOCAL válido (ex.: reimportando neste mesmo aparelho, sem mudança de
      // mapa nenhuma) é mantido como está; só cai pro mapa "atual" como
      // último recurso quando não sobra nenhuma das duas opções (backup
      // antigo/de outro aparelho sem informação de mapa nenhuma).
      if (todosOsItens.some((it) => it?.ambienteId)) {
        const mapasLocaisIds = new Set((await DB.getAllMaps()).map((m) => m.id));
        let singleMap = null;
        const remapeados = [];
        for (const it of todosOsItens) {
          if (!it || !it.ambienteId) { remapeados.push(it); continue; }
          let destino = mapIdRemap.get(it.ambienteId) || (mapasLocaisIds.has(it.ambienteId) ? it.ambienteId : null);
          if (!destino) {
            if (!singleMap) singleMap = await DB.getOrCreateSingleMap();
            destino = singleMap.id;
          }
          remapeados.push(destino === it.ambienteId ? it : { ...it, ambienteId: destino });
        }
        todosOsItens = remapeados;
      }

      // FASE 4: pergunta o que fazer com duplicados, SÓ SE houver algum (mesmo
      // ID ou mesmo patrimônio já cadastrado aqui) — um backup 100% novo não
      // interrompe o usuário com pergunta nenhuma.
      const conflitos = await DB.countImportConflicts(todosOsItens);
      let onDuplicate = 'ambos';
      let aplicarATodos = true;
      if (conflitos > 0) {
        const resultado = await Utils.showChoiceModal({
          title: 'Itens já existentes encontrados',
          message: `${conflitos} de ${todosOsItens.length} item(ns) deste backup já existem aqui (mesmo ID ou mesmo número de patrimônio). Quer manter os dois (item importado vira uma entrada separada) ou atualizar os já existentes com os dados importados?`,
          choices: [
            { value: 'ambos', label: '➕ Manter os dois' },
            { value: 'atualizar', label: '🔁 Atualizar os já existentes', secondary: true },
            { value: 'cancelar', label: 'Cancelar importação', secondary: true },
          ],
          checkbox: { label: 'Aplicar esta escolha a todos os conflitos (desmarque para revisar um por um)', defaultChecked: true, autoSubmitOnUncheck: true },
        });
        if (!resultado || !resultado.value || resultado.value === 'cancelar') { Utils.toast('Importação cancelada — nada foi alterado.', { type: 'warn' }); return; }
        onDuplicate = resultado.value;
        aplicarATodos = resultado.checked;
      }

      // FASE 5: aplica de fato.
      //  - "Aplicar a todos" marcado (padrão): _importApplyAll() aplica o
      //    lote inteiro de uma vez, com a MESMA regra escolhida acima —
      //    "manter os dois" gera ID novo só quando o ID batia (mantém como
      //    está quando só o patrimônio batia); "atualizar" mescla campo a
      //    campo no item existente, sem apagar o que este backup não trouxe.
      //  - Desmarcado: revisa CADA conflito individualmente (_importReviewOneByOne),
      //    perguntando manter os dois / atualizar / pular para cada um, com
      //    opção de parar a revisão a qualquer momento (o que já foi
      //    aplicado até ali permanece).
      // Em ambos os casos, o resultado inclui os itens criados/o "antes" dos
      // atualizados — dá pra desfazer a importação INTEIRA de uma vez (Ctrl+Z),
      // mesmo sendo várias mutações separadas no banco.
      try {
        const r = aplicarATodos
          ? await this._importApplyAll(todosOsItens, onDuplicate)
          : await this._importReviewOneByOne(todosOsItens);
        const partes = [];
        if (r.criados) partes.push(`${r.criados} novo(s)`);
        if (r.atualizados) partes.push(`${r.atualizados} atualizado(s)`);
        if (r.ignorados) partes.push(`${r.ignorados} ignorado(s) (sem dados suficientes)`);
        // Pedido do usuário (28/08/2026): mapas/fotos de ambiente entram no
        // MESMO resumo dos patrimônios quando o backup trouxer as duas
        // coisas juntas (ver FASE 2/3 acima) — antes desta rodada, mapas
        // eram simplesmente ignorados na importação, então nunca apareciam
        // aqui nem em lugar nenhum.
        if (rMaps.criados) partes.push(`${rMaps.criados} mapa(s) novo(s)`);
        if (rMaps.atualizados) partes.push(`${rMaps.atualizados} mapa(s) com a planta substituída`);
        if (rMaps.mantidos) partes.push(`${rMaps.mantidos} mapa(s) mantido(s) como já estavam`);
        if (todasMapPhotos.length + todasFotosAmbiente.length) partes.push(`${todasMapPhotos.length + todasFotosAmbiente.length} foto(s) de ambiente`);
        if (falhasLeitura) partes.push(`${falhasLeitura} arquivo(s) não lido(s)`);
        Utils.toast(`Backup importado ✓ — ${partes.join(', ') || 'nada a fazer'}.`, { type: 'ok', duration: 5500 });
        EventLog.log(`Backup importado: ${partes.join(', ') || 'nada a fazer'} (${files.length} arquivo(s)).`, { tipo: 'ok' });
        if (r.criadosItens?.length || r.atualizadosAntes?.length) {
          const criadosItens = r.criadosItens, atualizadosAntes = r.atualizadosAntes;
          History.push({
            label: `importar ${criadosItens.length + atualizadosAntes.length} item(ns)`,
            undo: async () => {
              for (const it of criadosItens) await DB.deleteItem(it.id);
              for (const a of atualizadosAntes) await DB.putItemRaw(a.before);
            },
            redo: async () => {
              for (const it of criadosItens) await DB.putItemRaw(it);
              for (const a of atualizadosAntes) await DB.updateItem(a.before.id, a.raw);
            },
          });
        }
      } catch (err) {
        console.error('Falha ao importar backup:', err);
        Utils.toast('Erro ao importar: ' + err.message, { type: 'danger', duration: 6000 });
        EventLog.log(`Falha ao importar backup: ${err.message}`, { tipo: 'erro' });
      }
      App._refreshCurrentView?.();
      AmbientePhotos.refreshIfOpen?.();
      _loteConcluido = true;
      } finally {
        // Desliga o "modo em lote" do selo (ver App.setBulkSaveStatus) não
        // importa como o fluxo termina — sucesso, cancelamento numa das
        // perguntas (mapas/duplicados) ou erro inesperado no meio do
        // caminho (`_loteConcluido` só existe pra documentar a intenção,
        // não é usada na decisão: o finally cobre TODO caminho de saída).
        App.clearBulkSaveStatus?.();
      }
    };

    // NOVO (01/09/2026) — item GRANDE #9: importar um mapa no novo formato
    // de texto (.txt) — ver comentário grande no HTML acima (label
    // "📄 Importar mapa (.txt)") e js/maptxt.js (MapTxt.parseTexto).
    container.querySelector('#st-import-txt').onchange = async (e) => {
      const file = (e.target.files || [])[0];
      e.target.value = '';
      if (!file) return;
      try {
        const texto = await file.text();
        const { map, avisos } = await MapTxt.parseTexto(texto);
        if (!map.walls.length && !map.portas.length && !map.janelas.length && !map.objects.length) {
          Utils.toast('Nenhuma parede, porta, janela ou objeto encontrado neste arquivo — confira se é um .txt exportado por "📄 Baixar mapa (.txt)".', { type: 'warn', duration: 6500 });
          return;
        }
        if (avisos.length) {
          console.warn('Avisos ao importar mapa .txt:', avisos);
          Utils.toast(`Mapa lido com ${avisos.length} aviso(s) (patrimônio não encontrado) — veja o console.`, { type: 'warn', duration: 6000 });
        }
        // Reaproveita o pipeline de importação de backup já existente e
        // testado (`#st-import` acima) — monta um "backup" em memória com
        // só este mapa dentro e dispara o mesmo input via
        // File+DataTransfer+evento `change` sintético (mesmo truque de
        // js/serverprefs.js restaurarDoServidor). Como `map.id` vem do
        // `mapa_id=` do cabeçalho do próprio .txt, reimportar o MESMO mapa
        // aciona naturalmente a janela de conflito "já existe um mapa com
        // esse id" que o #st-import já sabe mostrar.
        const dump = { versao: 1, exportadoEm: DB.nowISO(), maps: [map] };
        const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
        const nomeArq = (map.nome || 'mapa').replace(/[^a-z0-9_-]+/gi, '_') + '.txt-importado.json';
        const fakeFile = new File([blob], nomeArq, { type: 'application/json' });
        const dt = new DataTransfer();
        dt.items.add(fakeFile);
        const importInput = container.querySelector('#st-import');
        importInput.files = dt.files;
        importInput.dispatchEvent(new Event('change'));
      } catch (err) {
        console.error('Falha ao importar mapa .txt:', err);
        Utils.toast('Erro ao importar o arquivo .txt: ' + err.message, { type: 'danger', duration: 6500 });
      }
    };

    // NOVO (01/09/2026) — pedido do usuário verbatim: "Deve poder exportar
    // um mapa de exemplo e como comentário todas os significados dos
    // caracteres e como funciona a estrutura do arquivo." Não depende de
    // nenhum mapa real cadastrado — `MapTxt.exportarExemplo()` monta um
    // mapa fictício em memória só pra este fim (ver js/maptxt.js).
    container.querySelector('#st-export-exemplo-txt').onclick = () => {
      const texto = MapTxt.exportarExemplo();
      Utils.downloadText(texto, 'mapa-de-exemplo.txt', 'text/plain', { notify: false });
      Utils.toast('Mapa de exemplo baixado ✓ — abra num editor de texto com a quebra de linha automática desligada pra ver o desenho alinhado', { type: 'ok', duration: 6500 });
    };

    container.querySelector('#st-conf-nome').onchange = async (e) => {
      const nome = e.target.value.trim();
      await DB.setSetting('conferenciaNome', nome);
      Utils.toast('Nome da conferência salvo ✓', { type: 'ok' });
      // Some com o aviso do cabeçalho na hora (pedido do usuário) — sem isso
      // só sumiria na próxima troca de tela (ver App._updateConfNomeBanner).
      App._updateConfNomeBanner?.();
      // Atualiza o ID exibido NA HORA (pedido do usuário, 26/08/2026: "o ID
      // da conferência deve ser um hash do nome") — sem precisar remontar a
      // tela inteira pra ver o novo hash já refletido.
      const idLine = container.querySelector('#st-conf-id-line');
      if (idLine) idLine.textContent = `ID da conferência: ${DB.computeConferenciaId(nome)}`;
    };
    container.querySelector('#st-conf-nova').onclick = async () => {
      // Pedido do usuário, 26/08/2026: "o ID da conferência deve ser um hash
      // do nome" — não existe mais um ID solto pra sortear de novo; a única
      // forma de "começar uma conferência nova" agora é dar um nome novo (ou
      // limpar o nome, o que o aviso do cabeçalho vai lembrar de preencher).
      if (!confirm('Iniciar uma nova conferência? Os itens já cadastrados continuam existindo normalmente — isso só limpa o NOME desta conferência (o ID é sempre um hash dele, veja acima) para você digitar um nome novo, e os PRÓXIMOS itens/exportações não se misturarem com a conferência anterior na hora de unificar.')) return;
      await DB.setSetting('conferenciaNome', '');
      Utils.toast('Nome limpo — defina o nome da nova conferência abaixo ✓', { type: 'ok' });
      App._updateConfNomeBanner?.();
      await this.mount(this._container);
      // Já deixa o campo pronto pra digitar o novo nome (mesmo espírito do
      // clique no aviso do cabeçalho — ver App._goToConfNomeField).
      this._container.querySelector('#st-conf-nome')?.focus();
    };

    // NOVO (09/09/2026) — ver js/classicmode.js. `ClassicMode.toggle()` já
    // cuida de mostrar/esconder tudo E salvar `layoutMode` sozinho (mesmo
    // método usado pelo botão 🔀 do cabeçalho) — este onchange só decide
    // qual direção chamar, comparando o estado atual com o que a pessoa
    // acabou de marcar/desmarcar (evita chamar enter() de novo se já
    // estava ativo, ou vice-versa, o que `toggle()` sozinho não sabe
    // distinguir de um clique duplo no checkbox).
    container.querySelector('#st-layout-classico').onchange = async (e) => {
      if (e.target.checked === !!ClassicMode?.isActive?.()) return;
      await ClassicMode?.toggle?.();
    };
    container.querySelector('#st-hud').onchange = async (e) => { await Perf.setEnabled(e.target.checked); };
    container.querySelector('#st-history-sempre').onchange = async (e) => { await History.setAlwaysShow(e.target.checked); };
    // [10/09/2026] Pedido verbatim: toggle "Mostrar a Tela de Abertura ao
    // iniciar o app" — ver comentário grande junto do checkbox HTML acima.
    container.querySelector('#st-splash-sempre').onchange = async (e) => { await DB.setSetting('splashSempreAoAbrir', e.target.checked); };

    // NOVO (08/09/2026), pedido verbatim: "Isso deve ser configuravel
    // em alguma secao das 'configuracoes do app', se ao selecionar a
    // tela que sera exibida, ira abrir em tela cheia ou nao. Para
    // todas que aparecem no dropdown."
    const wsFullscreenSave = async () => {
      await DB.setSetting('workspaceFullscreenConfig', {
        foto: container.querySelector('#st-ws-fullscreen-foto').checked,
        organizar: container.querySelector('#st-ws-fullscreen-organizar').checked,
        modelador: container.querySelector('#st-ws-fullscreen-modelador').checked,
        acessarModelos: container.querySelector('#st-ws-fullscreen-acessarmodelos').checked,
      });
    };
    container.querySelector('#st-ws-fullscreen-foto').onchange = wsFullscreenSave;
    container.querySelector('#st-ws-fullscreen-organizar').onchange = wsFullscreenSave;
    container.querySelector('#st-ws-fullscreen-modelador').onchange = wsFullscreenSave;
    container.querySelector('#st-ws-fullscreen-acessarmodelos').onchange = wsFullscreenSave;

    // Pedido do usuário (25/08/2026): campo em SEGUNDOS na tela (mais
    // natural pra digitar), convertido pra ms na hora de salvar — DB já
    // clampa entre MIN/MAX de novo por dentro (ver setMapSaveDebounceMs),
    // então mesmo um valor digitado fora da faixa não quebra nada, só é
    // ajustado pro limite mais próximo.
    container.querySelector('#st-mapsavedebounce').onchange = async (e) => {
      const segundos = parseFloat(e.target.value);
      const ms = await DB.setMapSaveDebounceMs((Number.isFinite(segundos) ? segundos : DB.MAP_SAVE_DEBOUNCE_DEFAULT_MS / 1000) * 1000);
      e.target.value = ms / 1000; // reflete de volta o valor já clampado, se o usuário tiver digitado algo fora da faixa
    };
    container.querySelector('#st-save-email').onclick = async () => {
      await DB.setSetting('emailDestino', container.querySelector('#st-email-to').value.trim());
      await DB.setSetting('emailAssunto', container.querySelector('#st-email-subject').value.trim());
      await DB.setSetting('emailTextoPadrao', container.querySelector('#st-email-text').value);
      await DB.setSetting('emailModo', container.querySelector('input[name=emailmode]:checked')?.value || 'mailto');
      await DB.setSetting('servidorUrl', container.querySelector('#st-webhook-url').value.trim());
      await DB.setSetting('servidorIncluirImagens', container.querySelector('#st-webhook-imgs').checked);
      Utils.toast('Configurações salvas ✓', { type: 'ok' });
    };

    // MUDADO (07/09/2026), pedido verbatim: "além da opção 'Guardar no
    // IndexedDB', deve ter a opção de 'guardar no servidor'. Uma sempre
    // deve ficar ativa ou as duas." — este checkbox (#st-autosave-ativo,
    // aqui em "Salvamento automático em arquivo") e o novo #st-guardar-
    // servidor (card "Armazenamento no servidor", mais acima) controlam a
    // MESMA chave 'autoSaveAtivo' — mudar um sincroniza o outro na hora
    // (ver `_syncGuardarServidorUI` abaixo). Trava: não deixa desmarcar
    // este se "Guardar no IndexedDB" também já estiver desmarcado.
    container.querySelector('#st-autosave-ativo').onchange = async (e) => {
      if (!e.target.checked && !(container.querySelector('#st-guardar-indexeddb')?.checked ?? true)) {
        e.target.checked = true; // reverte — não pode desmarcar as duas
        Utils.toast('Pelo menos uma das duas ("Guardar no IndexedDB" ou "Guardar no servidor") precisa ficar marcada.', { type: 'warn', duration: 4500 });
        return;
      }
      await DB.setSetting('autoSaveAtivo', e.target.checked);
      this._syncGuardarServidorUI(container, e.target.checked);
      if (e.target.checked && !(await DB.getSetting('servidorUrl', ''))) {
        Utils.toast('Configure também a URL do servidor local acima para o salvamento automático funcionar.', { type: 'warn', duration: 4500 });
      }
    };
    container.querySelector('#st-autosave-modo').onchange = async (e) => {
      await DB.setSetting('autoSaveModoArquivo', e.target.value);
    };
    container.querySelector('#st-autosave-formato').onchange = async (e) => {
      await DB.setSetting('autoSaveFormatoExtra', e.target.value);
    };

    container.querySelector('#st-device-label').onchange = (e) => {
      Session.setLabel(e.target.value);
      Utils.toast('Apelido do aparelho salvo ✓', { type: 'ok' });
    };
    container.querySelector('#st-sync-auto').onchange = async (e) => {
      await DB.setSetting('syncAutoAtivo', e.target.checked);
      if (e.target.checked) SyncModule.startAuto(); else SyncModule.stopAuto();
    };
    container.querySelector('#st-sync-now').onclick = async (e) => {
      e.target.disabled = true;
      await SyncModule.pull({ manual: true });
      this._renderLastSync();
      e.target.disabled = false;
    };
  },

  /** Liga as abas de CATEGORIA no topo das Configurações (ver SETTINGS_CATS)
   *  — clicar numa aba mostra só os `.settings-section[data-cat]` daquela
   *  categoria, escondendo os demais (`display:none`, sem remontar nada).
   *  A aba ativa fica lembrada em `_activeSettingsCat` — reabrir
   *  Configurações depois volta na mesma aba de antes, em vez de sempre
   *  voltar pra primeira. */
  _wireSettingsCats(container) {
    const tabsWrap = container.querySelector('#settings-cats');
    if (!tabsWrap) return;
    const aplicar = (cat) => {
      this._activeSettingsCat = cat;
      tabsWrap.querySelectorAll('.settings-cat-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
      });
      container.querySelectorAll('.settings-section[data-cat]').forEach((sec) => {
        sec.classList.toggle('hidden', sec.dataset.cat !== cat);
      });
    };
    tabsWrap.querySelectorAll('.settings-cat-tab').forEach((btn) => {
      btn.onclick = () => aplicar(btn.dataset.cat);
    });
    aplicar(this._activeSettingsCat);
  },

  // ---------- Permissões do aparelho (localização / câmera) — pedidas de
  // propósito por um clique explícito aqui, em vez de escondidas no meio da
  // captura, para não ficar perguntando de novo a cada item. ----------
  _permLabel(concedida) {
    return concedida ? '🟢 Autorizada' : '⚪ Ainda não autorizada';
  },

  /** Consulta o estado ATUAL da permissão de câmera diretamente no navegador,
   *  quando suportado (Chrome/Edge; Firefox/Safari não suportam consultar
   *  "camera" pela Permissions API) — cai para o que guardamos por conta
   *  própria da última vez que o botão "Ativar câmera" foi usado. */
  async _cameraPermissionState() {
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'camera' });
        return status.state; // 'granted' | 'denied' | 'prompt'
      }
    } catch (e) { /* navegador não suporta consultar esta permissão especificamente */ }
    return null;
  },

  async _cameraPermissionGranted() {
    const state = await this._cameraPermissionState();
    if (state === 'granted') return true;
    if (state === 'denied') return false;
    return DB.getSetting('cameraPermissaoConcedida', false);
  },

  async _requestGeoPermission() {
    const btn = this._container?.querySelector('#perm-geo-btn');
    if (btn) { btn.disabled = true; }
    const r = await Geo.requestPermission();
    if (btn) btn.disabled = false;
    const statusEl = this._container?.querySelector('#perm-geo-status');
    if (statusEl) statusEl.textContent = this._permLabel(r.granted);
    if (r.granted) {
      Utils.toast('Localização autorizada ✓ — não vai pedir de novo a cada item.', { type: 'ok' });
    } else {
      Utils.toast('Não foi possível autorizar a localização' + (r.motivo ? ': ' + r.motivo : '') + '. Se você negou por engano, mude isso no ícone de cadeado/informações do site, na barra de endereço.', { type: 'danger', duration: 6000 });
    }
  },

  /** Só precisa abrir a câmera por um instante para o navegador registrar a
   *  decisão — desliga o stream na hora em seguida (não fica com a câmera
   *  ligada nas Configurações). */
  async _requestCameraPermission() {
    const btn = this._container?.querySelector('#perm-cam-btn');
    const motivoIndisponivel = Utils.cameraUnsupportedReason();
    if (motivoIndisponivel) { Utils.toast(motivoIndisponivel, { type: 'danger', duration: 8000 }); return; }
    if (btn) btn.disabled = true;
    let granted = false, motivo = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      granted = true;
    } catch (e) {
      motivo = e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
        ? 'permissão negada — mude isso no ícone de câmera/cadeado da barra de endereço'
        : (e.message || e.name);
    }
    await DB.setSetting('cameraPermissaoConcedida', granted);
    if (btn) btn.disabled = false;
    const statusEl = this._container?.querySelector('#perm-cam-status');
    if (statusEl) statusEl.textContent = this._permLabel(granted);
    if (granted) {
      Utils.toast('Câmera autorizada ✓ — não vai pedir de novo a cada item.', { type: 'ok' });
      EventLog.log('Permissão de câmera concedida.', { tipo: 'ok' });
    } else {
      Utils.toast('Não foi possível autorizar a câmera: ' + motivo, { type: 'danger', duration: 6000 });
      EventLog.log(`Permissão de câmera negada/indisponível: ${motivo}`, { tipo: 'aviso' });
    }
  },

  async _renderLastSync() {
    const el = this._container?.querySelector('#st-sync-last');
    if (!el) return;
    const ultima = await DB.getSetting('syncUltimaEm', null);
    el.textContent = ultima ? `Última sincronização: ${Utils.formatDateTime(ultima)}` : 'Ainda não sincronizado nesta instalação.';
  },

  /** NOVO (01/09/2026), item GRANDE #3 do pedido de 12 itens — mesmo padrão
   *  de `_renderLastSync` acima, só que pros 2 envios automáticos ao
   *  servidor local (ver js/serverprefs.js): preferências (debounced, a
   *  cada mudança) e backup completo (periódico, a cada 5min). Chamado 1x
   *  ao montar a tela — não fica se re-atualizando sozinho enquanto a tela
   *  está aberta (mesma simplificação aceita em `_renderLastSync`; reabrir
   *  Configurações mostra o horário mais recente). */
  async _renderServerPrefsStatus() {
    const el = this._container?.querySelector('#st-serverprefs-status');
    if (!el) return;
    const [prefsEm, backupEm] = await Promise.all([
      DB.getSetting('serverPrefsUltimaEm', null),
      DB.getSetting('serverBackupUltimaEm', null),
    ]);
    // NOVO (03/09/2026) — ícone de status ✅ (já salvou alguma vez) / ⏳
    // (configurado, mas ainda não salvou nada) — "isto deve ficar claro
    // visualmente", pedido do usuário.
    const icone = (backupEm || prefsEm) ? '✅' : '⏳';
    const partes = [
      `${icone} Preferências salvas no servidor: ${prefsEm ? Utils.formatDateTime(prefsEm) : 'ainda não'}`,
      `Backup completo salvo no servidor: ${backupEm ? Utils.formatDateTime(backupEm) : 'ainda não'}`,
    ];
    el.textContent = partes.join(' · ');

    // NOVO (03/09/2026) — pasta de dados ATUAL, consultada de verdade no
    // servidor (não um valor salvo localmente, que poderia estar
    // desatualizado se a pessoa editou config.json à mão) — ver
    // ServerPrefs.statusArmazenamento. Silencioso se o servidor não
    // responder (offline etc.) — mesmo espírito do resto desta tela.
    const atualEl = this._container?.querySelector('#st-pastadados-atual');
    if (atualEl && typeof ServerPrefs !== 'undefined') {
      atualEl.textContent = 'Consultando pasta atual no servidor…';
      const status = await ServerPrefs.statusArmazenamento();
      atualEl.textContent = status ? `📁 Pasta atual: ${status.pastaDadosAtual}` : '⚠️ Não foi possível consultar o servidor agora (verifique se ele está rodando).';
    }
  },

  /** NOVO (07/09/2026), pedido verbatim: "Se há algo no indexedDB e o app
   *  está rodando em servidor e for verificado que o que está no indexedDB
   *  não está no servidor, uma opção para gravar tudo no servidor deve
   *  ficar disponível [...]". Chamada 1x ao montar a tela (mesmo espírito de
   *  `_renderServerPrefsStatus`): compara IndexedDB×servidor (ver
   *  `ServerPrefs.itensFaltandoNoServidor`) e mostra "N item(ns) faltando" +
   *  botão "📤 Gravar tudo no servidor" (só aparece se houver algo faltando);
   *  "✅ tudo sincronizado" se não houver nada; aviso se não for possível
   *  consultar (servidor offline etc.).
   *
   *  MUDADO (07/09/2026), pedido verbatim: "Coloque a 'Estrutura de arquivos
   *  do servidor' em um botão que quando clicado abre uma janela e mostra a
   *  estrutura." — a árvore de pastas/arquivos SAIU desta função (que antes
   *  também desenhava em `#st-storage-tree` direto na tela) e foi para
   *  `_abrirModalEstruturaArquivos` abaixo, consultada só quando a pessoa
   *  clica no botão "📁 Ver estrutura de arquivos no servidor" (ver HTML). */
  async _renderStorageSection() {
    const elDiscrepancia = this._container?.querySelector('#st-storage-discrepancia');
    if (!elDiscrepancia) return;

    elDiscrepancia.textContent = 'Verificando itens no servidor…';

    const faltando = await ServerPrefs.itensFaltandoNoServidor();

    if (faltando === null) {
      elDiscrepancia.innerHTML = '⚠️ Não foi possível verificar agora (o servidor local está rodando?)';
    } else if (faltando.length === 0) {
      elDiscrepancia.innerHTML = '✅ Tudo que está no IndexedDB deste aparelho já está no servidor.';
    } else {
      elDiscrepancia.innerHTML = '';
      const aviso = document.createElement('span');
      aviso.textContent = `⚠️ ${faltando.length} item(ns) estão no IndexedDB deste aparelho mas ainda não no servidor. `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn secondary sm';
      btn.textContent = '📤 Gravar tudo no servidor';
      btn.title = 'Envia cada item faltando para o servidor local agora, e atualiza o backup completo em seguida';
      // MUDADO (07/09/2026), pedido verbatim: "Também só vai guardar tudo na
      // pasta 'storage' do servidor se for clicado no botão 'guardar tudo'.
      // Se houver conflito de arquivos deve aparecer uma janela perguntando
      // se deseja substituir os arquivos. A janela deve ser no mesmo modelo
      // da janela de 'importar' do app." — antes de enviar, consulta a
      // árvore de arquivos já existente no servidor; se houver QUALQUER
      // arquivo lá (não vazio), pergunta com `Utils.showChoiceModal` (o
      // mesmo modal genérico usado em "⬆️ Importar backup") antes de
      // prosseguir. Servidor vazio → envia direto, sem perguntar nada.
      btn.onclick = async () => {
        const arquivosAtuais = await ServerPrefs.listarArquivos();
        const servidorTemArquivos = !!(arquivosAtuais && (arquivosAtuais.arvore?.filhos || []).some((f) => (f.filhos && f.filhos.length) || f.tipo === 'arquivo'));
        if (servidorTemArquivos) {
          const escolha = await Utils.showChoiceModal({
            title: '⚠️ Já existem arquivos no servidor',
            message: 'A pasta de armazenamento do servidor já tem arquivos. Enviar agora pode SUBSTITUIR arquivos com o mesmo nome (mesmo patrimônio/foto/mapa). Deseja continuar e substituir?',
            choices: [
              { label: 'Substituir e continuar', value: 'substituir' },
              { label: 'Cancelar', value: null },
            ],
          });
          if (escolha !== 'substituir') return;
        }
        btn.disabled = true;
        const textoOriginal = btn.textContent;
        const resultado = await ServerPrefs.enviarTodosParaServidor(faltando, (atual, total) => {
          btn.textContent = `Enviando (${atual}/${total})…`;
        });
        btn.textContent = textoOriginal;
        btn.disabled = false;
        Utils.toast(
          resultado.falhas
            ? `Enviado ${resultado.enviados}/${resultado.total} — ${resultado.falhas} falha(s) (servidor pode ter caído no meio; tente de novo).`
            : `✅ ${resultado.enviados} item(ns) enviado(s) ao servidor.`,
          { type: resultado.falhas ? 'warn' : 'ok' },
        );
        this._renderStorageSection();
      };
      elDiscrepancia.appendChild(aviso);
      elDiscrepancia.appendChild(btn);
    }
  },

  /** NOVO (07/09/2026), pedido verbatim: "Coloque a 'Estrutura de arquivos
   *  do servidor' em um botão que quando clicado abre uma janela e mostra a
   *  estrutura." Janela no mesmo padrão `modal-backdrop`/`modal-sheet` usado
   *  em `_downloadFullCatalog` acima — abre, consulta `ServerPrefs.
   *  listarArquivos()` na hora, desenha com `_renderArvoreStorage` (que já
   *  trata pasta vazia sem setinha — ver comentário lá), com um botão
   *  "🔄 Atualizar" pra reconsultar sem fechar/reabrir a janela. */
  async _abrirModalEstruturaArquivos() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet" style="text-align:left">
        <div class="handle"></div>
        <h3 style="margin-top:0">📁 Estrutura de arquivos no servidor</h3>
        <div style="display:flex; gap:8px; margin-bottom:8px">
          <button type="button" class="btn secondary sm" id="mea-atualizar" title="Consultar de novo a estrutura no servidor">🔄 Atualizar</button>
        </div>
        <div id="mea-arvore" style="max-height:min(60vh, 420px); overflow:auto; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:10px; padding:8px">Consultando…</div>
        <button class="btn secondary block" id="mea-close" style="margin-top:10px" title="Fechar esta janela">Fechar</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#mea-close').onclick = () => modal.remove();

    const elArvore = modal.querySelector('#mea-arvore');
    const carregar = async () => {
      elArvore.textContent = 'Consultando…';
      const arquivos = await ServerPrefs.listarArquivos();
      if (!arquivos) {
        elArvore.textContent = '⚠️ Não foi possível consultar a estrutura de pastas agora (o servidor local está rodando?)';
        return;
      }
      elArvore.innerHTML = '';
      elArvore.appendChild(this._renderArvoreStorage(arquivos.arvore));
    };
    modal.querySelector('#mea-atualizar').onclick = () => carregar();
    carregar();
  },

  /** NOVO (07/09/2026) — trava mútua entre "Guardar no IndexedDB"
   *  (`#st-guardar-indexeddb`, chave nova `guardarIndexedDB`) e "Guardar no
   *  servidor" (`#st-guardar-servidor`, MESMA chave `autoSaveAtivo` já usada
   *  por `#st-autosave-ativo` em "💾 Salvamento automático em arquivo" —
   *  ver comentário grande nesse handler abaixo). Pedido verbatim: "Uma
   *  sempre deve ficar ativa ou as duas." */
  _wireGuardarDestinos(container) {
    const chkIndexedDB = container.querySelector('#st-guardar-indexeddb');
    const chkServidor = container.querySelector('#st-guardar-servidor');
    if (chkIndexedDB) {
      chkIndexedDB.onchange = async (e) => {
        if (!e.target.checked && !(chkServidor?.checked ?? false)) {
          e.target.checked = true; // reverte — não pode desmarcar as duas
          Utils.toast('Pelo menos uma das duas ("Guardar no IndexedDB" ou "Guardar no servidor") precisa ficar marcada.', { type: 'warn', duration: 4500 });
          return;
        }
        await DB.setSetting('guardarIndexedDB', e.target.checked);
      };
    }
    if (chkServidor) {
      chkServidor.onchange = async (e) => {
        if (!e.target.checked && !(chkIndexedDB?.checked ?? true)) {
          e.target.checked = true; // reverte — não pode desmarcar as duas
          Utils.toast('Pelo menos uma das duas ("Guardar no IndexedDB" ou "Guardar no servidor") precisa ficar marcada.', { type: 'warn', duration: 4500 });
          return;
        }
        await DB.setSetting('autoSaveAtivo', e.target.checked);
        // Sincroniza o outro checkbox que controla a MESMA chave, mais
        // abaixo na tela (ver `#st-autosave-ativo`/`_syncGuardarServidorUI`).
        const chkAutoSave = container.querySelector('#st-autosave-ativo');
        if (chkAutoSave) chkAutoSave.checked = e.target.checked;
        if (e.target.checked && !(await DB.getSetting('servidorUrl', ''))) {
          Utils.toast('Configure também a URL do servidor local acima para o salvamento automático funcionar.', { type: 'warn', duration: 4500 });
        }
      };
    }
  },

  /** NOVO (07/09/2026) — chamado pelo handler de `#st-autosave-ativo` (ver
   *  comentário grande lá) para refletir a mudança no `#st-guardar-servidor`
   *  correspondente (mesma chave `autoSaveAtivo`, mostrada em 2 lugares). */
  _syncGuardarServidorUI(container, checked) {
    const chk = container.querySelector('#st-guardar-servidor');
    if (chk) chk.checked = checked;
  },

  /** Desenha 1 nó da árvore devolvida por "listar-arquivos" (ver comentário
   *  grande em `_renderStorageSection` acima). Pasta COM filhos → `<details>`
   *  com o nome como `<summary>` (clique abre/fecha os filhos); pasta VAZIA
   *  → uma linha simples, SEM `<details>` (ver "BUG CORRIGIDO 07/09/2026"
   *  abaixo — sem filhos pra abrir, a setinha não faz sentido); arquivo →
   *  uma linha com tamanho formatado; nó "info" (lista truncada, ver
   *  server/receive.js/php) → um aviso em itálico, sem ícone. Recursivo —
   *  a profundidade já vem limitada pelo próprio servidor (ver
   *  `listarArvore`/`limite` lá), então não precisa limitar de novo aqui. */
  _renderArvoreStorage(no, profundidade = 0) {
    if (no.tipo === 'arquivo') {
      const div = document.createElement('div');
      div.style.cssText = 'padding-left:20px; color:var(--text-dim)';
      div.textContent = `📄 ${no.nome} (${this._formatBytes(no.tamanho)})`;
      return div;
    }
    if (no.tipo === 'info') {
      const div = document.createElement('div');
      div.style.cssText = 'padding-left:20px; font-style:italic; color:var(--text-dim)';
      div.textContent = no.nome;
      return div;
    }
    const filhos = no.filhos || [];
    // BUG CORRIGIDO (07/09/2026), pedido verbatim: "Quando as pastas
    // estiverem vazias a setinha não deve aparecer." — CAUSA RAIZ: todo nó
    // de pasta virava um `<details>` nativo do HTML, que SEMPRE desenha a
    // setinha de expandir/recolher sozinho (é o navegador quem desenha,
    // não o app), mesmo sem nenhum filho pra mostrar dentro. CORRIGIDO:
    // pasta SEM filhos agora vira uma linha simples (`<div>`, igual a um
    // arquivo), nunca um `<details>` — só pastas COM pelo menos 1 filho
    // continuam usando `<details>` (onde a setinha faz sentido de verdade).
    if (filhos.length === 0) {
      const div = document.createElement('div');
      div.style.cssText = `padding-left:${profundidade === 0 ? 0 : 20}px; margin-left:${profundidade === 0 ? 0 : 10}px; color:var(--text-dim)`;
      div.textContent = `📁 ${no.nome} (vazia)`;
      return div;
    }
    const det = document.createElement('details');
    det.open = profundidade < 2; // raiz + as 5 pastas de topo (3d/images/text/raw/app) começam abertas; mais fundo que isso, fechado (clique expande — "interagível" do pedido)
    const sum = document.createElement('summary');
    sum.textContent = `📁 ${no.nome} (${filhos.length})`;
    sum.style.cursor = 'pointer';
    det.appendChild(sum);
    filhos.forEach((filho) => det.appendChild(this._renderArvoreStorage(filho, profundidade + 1)));
    det.style.marginLeft = '10px';
    return det;
  },

  _formatBytes(n) {
    if (!n) return '0 B';
    const unidades = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i ? 1 : 0)} ${unidades[i]}`;
  },

  unmount() {
    this._container = null;
    this._p2pWired = false; // permite religar a UI do P2P na próxima vez que a tela abrir
  },

  /**
   * Baixa um arquivo com TUDO que já foi catalogado neste aparelho — usado
   * pelos cenários "sem servidor" (PC ou celular), onde não há salvamento
   * automático em arquivo. Mesma escolha de formato (.txt simples / .csv
   * completo / .json) já oferecida na tela Capturar para a sessão atual, mas
   * aqui cobrindo o catálogo INTEIRO, não só os itens desta sessão.
   */
  async _downloadFullCatalog() {
    const itens = await DB.getAllItems();
    if (itens.length === 0) { Utils.toast('Ainda não há nenhum item catalogado neste aparelho.', { type: 'warn' }); return; }

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet" style="text-align:center">
        <div class="handle"></div>
        <h3 style="margin-top:0">Baixar ${itens.length} item(ns) catalogado(s)</h3>
        <p style="font-size:12.5px; color:var(--text-dim)">
          Sem servidor configurado, este é o jeito de garantir uma cópia de tudo que já
          foi cadastrado neste aparelho — guarde o arquivo, ou transfira para outro
          aparelho (cabo, Bluetooth, e-mail, nuvem) e use "🔗 Unificar fontes diferentes"
          lá para juntar com o que os outros catalogaram. Só 📦 patrimônios (texto) — para
          incluir também 🖼️ imagens e 🗺️ mapas, use "⬇️ Exportar backup" em "📦 Catálogo".
        </p>
        <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap">
          <button class="btn secondary block" id="dc-txt" title="Baixar uma lista simples de texto: setor, data, e uma linha 'patrimônio tipo' por item">📄 Baixar .TXT simples</button>
          <button class="btn secondary block" id="dc-csv" title="Baixar o catálogo completo em planilha CSV">⬇️ Baixar .CSV (Excel)</button>
          <button class="btn block" id="dc-json" title="Baixar o catálogo completo em JSON (use para unificar com outros aparelhos depois)">⬇️ Baixar .JSON</button>
        </div>
        <button class="btn secondary block" id="dc-close" style="margin-top:8px" title="Fechar esta janela">Fechar</button>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#dc-close').onclick = () => modal.remove();

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    modal.querySelector('#dc-json').onclick = async () => {
      const dump = await DB.exportAll();
      Utils.downloadJSON(dump, `catalogacao-completo-${stamp}.json`);
    };
    modal.querySelector('#dc-csv').onclick = () => {
      Utils.downloadBlob(new Blob([Utils.itemsToCSV(itens)], { type: 'text/csv;charset=utf-8' }), `catalogacao-completo-${stamp}.csv`);
    };
    modal.querySelector('#dc-txt').onclick = async () => {
      const { campos, organizarPorSetor } = await Utils.getTxtConfig();
      Utils.downloadBlob(new Blob([Utils.itemsToSimpleTxt(itens, { campos, organizarPorSetor })], { type: 'text/plain;charset=utf-8' }), `catalogacao-completo-${stamp}.txt`);
    };
  },

  // "👁️ Ver lista simples" (janela + chips de "Partes de informação") virou um módulo
  // separado — pedido do usuário, 26/08/2026: "deve ser uma função modular também, um
  // código só para ele" — ver js/verlistasimples.js (`VerListaSimples.show(opts)`).

  _slugify(s) {
    return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'item';
  },

  /**
   * Janela "Exportar backup": escolher QUAIS patrimônios/fotos/mapas
   * exportar (uma lista de cada categoria) e o FORMATO do arquivo (tudo
   * junto, ou um arquivo por categoria). Com tudo selecionado nas 3 listas +
   * "tudo junto", o resultado é idêntico ao backup completo de antes desta
   * janela existir.
   *
   * Pedido do usuário (27/08/2026) — duas simplificações nesta janela:
   * 1) "Quais campos de cada patrimônio" (um grupo de checkboxes que existia
   *    aqui, EXPORT_FIELD_GROUPS) foi removido: um patrimônio exportado
   *    agora SEMPRE leva o registro inteiro, sem escolha de campos.
   * 2) As 3 categorias (Patrimônios/Imagens/Mapas) usavam duas etapas —
   *    escolher entre "Todos os itens" ou "Selecionar itens específicos" e,
   *    só depois de escolher a segunda, a lista de fato aparecia. Agora a
   *    lista de cada categoria já aparece direto ao abrir as opções dela
   *    (tudo pré-marcado — deixe tudo marcado pra exportar tudo, ou
   *    desmarque só o que não quiser). A opção "Um arquivo por item, dentro
   *    desta categoria" (uma 3ª opção dentro de cada categoria) também foi
   *    removida — pra exportar UM item só agora basta desmarcar os outros
   *    na lista da categoria.
   *
   * Antes de gerar os arquivos, um manipulador de dependências entre
   * categorias (ver js/exportdeps.js) confere se algum patrimônio
   * selecionado tem uma foto vinculada (item.fotoAnexadaId) sem a categoria
   * Imagens estar marcada — nesse caso, pergunta antes de exportar só o
   * patrimônio "solto" (sem a foto referenciada).
   */
  /** Pedido do usuário: "tudo que tem haver com isso [importar/exportar]
   *  deve ter a distinção entre imagens, patrimônios e mapas (com ícones de
   *  cada um dos três)" — usa os MESMOS três emojis/nomes já usados em
   *  storagestatus.js (`_categoryBlocksHtml`), pro usuário reconhecer a
   *  mesma divisão em vários lugares do app. "Imagens" aqui reúne fotos de
   *  patrimônio (a foto vinculada a cada item, ver item.fotoAnexadaId) E
   *  fotos de ambiente — a mesma junção que já aparece no selo de
   *  armazenamento do cabeçalho. */
  EXPORT_CATEGORIAS: [
    { key: 'patrimonios', emoji: '📦', label: 'Patrimônios', desc: 'Identificação, setor, datas — texto, sem fotos.' },
    { key: 'imagens', emoji: '🖼️', label: 'Imagens', desc: 'Fotos de patrimônio (vinculadas) + fotos de ambiente.' },
    { key: 'mapas', emoji: '🗺️', label: 'Mapas', desc: 'Plantas baixas (paredes/objetos/pinos), incluindo imagens coladas nelas.' },
  ],

  /** Uma linha de checkbox+rótulo(+miniatura opcional) reutilizada pelas 3
   *  listas de seleção da janela de exportação (patrimônios/imagens/mapas). */
  _pickerRowHtml(id, checked, label, thumbUrl) {
    return `<label style="display:flex; align-items:center; gap:8px; padding:4px 2px; font-size:12px; border-bottom:1px solid var(--border)">
      <input type="checkbox" class="exp-item-chk" data-id="${id}" ${checked ? 'checked' : ''}>
      ${thumbUrl ? `<img src="${thumbUrl}" style="width:26px;height:26px;border-radius:6px;object-fit:cover;flex:none">` : ''}
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${label}</span>
    </label>`;
  },

  /** `opts.onlyMapId` (novo — pedido do usuário, item 12 do feedback do
   *  Organizar: "um botão de exportar deve ter em cada card: 'exportar
   *  apenas este mapa'") — pré-seleciona SÓ este mapa e os patrimônios/
   *  fotos que pertencem a ele nas 3 listas, em vez de tudo marcado (o
   *  padrão de sempre). Reaproveita esta MESMA janela em vez de duplicar a
   *  lógica de geração de arquivo/zip/subpastas — a pessoa ainda vê a
   *  janela normal (pode ajustar a seleção antes de baixar), só com o
   *  ponto de partida já filtrado pro mapa que ela clicou (ver
   *  organizeview.js `_wireCard`, botão `.organize-map-export-btn`). */
  async _openExportModal(opts = {}) {
    const { onlyMapId = null } = opts;
    const total = await DB.countItems();
    const resumo = await DB.getAllSummaries();
    const cfg = await DB.getAllSettings();
    const ambientePhotos = await DB.getAllAmbientePhotos();
    const maps = await DB.getAllMaps();
    const itensComFotoVinculada = resumo.filter((it) => it.fotoAnexadaId);

    // Pedido do usuário (27/08/2026): "Quando não tem nenhum patrimônio
    // cadastrado, mas existem mapas e fotos, deve ser possível 'exportar'...
    // Não deve aparecer mensagens desse tipo, deve-se poder ir até a tela de
    // exportação. Ali, ao clicar nas categorias é que vai aparecer se tem ou
    // não algum arquivo." — antes, esta janela era bloqueada só com base em
    // PATRIMÔNIOS (`total === 0`), mesmo havendo mapas/fotos de ambiente pra
    // exportar. Agora só bloqueia quando as 3 categorias estão TODAS vazias;
    // dentro da janela, cada categoria já mostra sua própria contagem entre
    // parênteses (Patrimônios/Imagens/Mapas, ver mais abaixo), então dá pra
    // perceber ali mesmo o que tem ou não pra exportar.
    if (total === 0 && ambientePhotos.length === 0 && maps.length === 0) {
      Utils.toast('Ainda não há nenhum patrimônio, foto ou mapa catalogado para exportar.', { type: 'warn' });
      return;
    }

    const servidorAtivo = !!(cfg.autoSaveAtivo && cfg.servidorUrl);
    const situacaoTxt = location.protocol === 'file:'
      ? 'Este app está aberto via <code>file:///</code> — sem servidor configurado, os arquivos abaixo são a única cópia que sai deste navegador.'
      : (servidorAtivo
        ? 'Servidor local configurado e ativo — 📦 Patrimônios também são enviados automaticamente pra lá a cada cadastro (💾 Salvamento automático em arquivo); os arquivos abaixo continuam sendo úteis como cópia extra/portátil.'
        : 'Este app foi aberto via servidor, mas o salvamento automático não está ativo — os arquivos abaixo são a única cópia que sai deste navegador (veja "💾 Salvamento automático em arquivo" para automatizar isso).');

    // Seleção inicial: TUDO marcado nas 3 listas (equivalente ao backup
    // completo de sempre, até alguém desmarcar algo) — OU, com
    // `onlyMapId`, só o mapa clicado e o que pertence a ele.
    const selPatrimonios = new Set((onlyMapId ? resumo.filter((it) => it.ambienteId === onlyMapId) : resumo).map((it) => it.id));
    const selFotosItens = new Set((onlyMapId ? itensComFotoVinculada.filter((it) => it.ambienteId === onlyMapId) : itensComFotoVinculada).map((it) => it.id));
    const selFotosAmbiente = new Set((onlyMapId ? ambientePhotos.filter((f) => f.ambienteId === onlyMapId) : ambientePhotos).map((f) => f.id));
    const selMapas = new Set(onlyMapId ? maps.filter((m) => m.id === onlyMapId).map((m) => m.id) : maps.map((m) => m.id));
    const onlyMapNome = onlyMapId ? Utils.escapeHtml((maps.find((m) => m.id === onlyMapId) && window.Mapping?.displayName?.(maps.find((m) => m.id === onlyMapId))) || 'este mapa') : '';

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <h3 style="margin-top:0">⬇️ Exportar backup${onlyMapId ? ` — ${onlyMapNome}` : ''}</h3>
        <p style="font-size:11.5px; color:var(--text-dim)">${situacaoTxt}</p>
        ${onlyMapId ? `<p style="font-size:11.5px; color:var(--text-dim)">Pré-selecionado só o mapa "<b>${onlyMapNome}</b>" e os patrimônios/fotos dele (veio do botão "exportar apenas este mapa" em Organizar) — ajuste as listas abaixo se quiser incluir mais coisa.</p>` : ''}

        <span style="display:block; font-size:12.5px; color:var(--text-dim); margin-bottom:5px; margin-top:6px">O que exportar — marque para incluir; clique no bloco para ver/escolher os itens de cada categoria</span>
        <div class="exp-cats">
          <div class="exp-cat-block" data-key="patrimonios">
            <div class="exp-cat-row">
              <input type="checkbox" class="exp-cat" data-key="patrimonios" checked title="Incluir Patrimônios na exportação">
              <button type="button" class="exp-cat-btn" data-key="patrimonios" aria-expanded="false" title="Ver/escolher os patrimônios">
                <span class="exp-cat-ic" aria-hidden="true">📦${servidorAtivo ? '<span class="exp-cat-badge" title="Também enviado automaticamente ao servidor configurado">🖥️</span>' : ''}</span>
                <span class="exp-cat-txt"><b>Patrimônios</b><br><span class="d">Identificação, setor, datas — texto, sem fotos. (${total})</span></span>
                <span class="exp-cat-chevron" aria-hidden="true">▾</span>
              </button>
            </div>
            <div class="exp-cat-opts hidden" id="exp-opts-patrimonios">
              <input type="text" class="exp-picker-filter" data-list="patrimonios" placeholder="Filtrar por patrimônio, descrição, tipo ou setor…" style="width:100%; margin-bottom:6px">
              <div style="display:flex; gap:8px; margin-bottom:6px">
                <button type="button" class="btn secondary sm exp-marcar-todos" data-list="patrimonios">Marcar todos</button>
                <button type="button" class="btn secondary sm exp-desmarcar-todos" data-list="patrimonios">Desmarcar todos</button>
              </div>
              <div class="exp-picker-list" id="exp-list-patrimonios" style="max-height:220px; overflow:auto; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:10px; padding:6px"></div>
              <p style="font-size:11.5px; color:var(--text-dim)"><span id="exp-count-patrimonios">${selPatrimonios.size}</span> de ${resumo.length} selecionado(s)</p>
            </div>
          </div>

          <div class="exp-cat-block" data-key="imagens">
            <div class="exp-cat-row">
              <input type="checkbox" class="exp-cat" data-key="imagens" checked title="Incluir Imagens na exportação">
              <button type="button" class="exp-cat-btn" data-key="imagens" aria-expanded="false" title="Ver/escolher as fotos">
                <span class="exp-cat-ic" aria-hidden="true">🖼️</span>
                <span class="exp-cat-txt"><b>Imagens</b><br><span class="d">Fotos de patrimônio (${itensComFotoVinculada.length}) + fotos de ambiente (${ambientePhotos.length}).</span></span>
                <span class="exp-cat-chevron" aria-hidden="true">▾</span>
              </button>
            </div>
            <div class="exp-cat-opts hidden" id="exp-opts-imagens">
              <div style="display:flex; gap:8px; margin-bottom:6px">
                <button type="button" class="btn secondary sm exp-marcar-todos" data-list="imagens">Marcar todos</button>
                <button type="button" class="btn secondary sm exp-desmarcar-todos" data-list="imagens">Desmarcar todos</button>
              </div>
              <div class="exp-picker-list" id="exp-list-imagens" style="max-height:220px; overflow:auto; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:10px; padding:6px"></div>
              <p style="font-size:11.5px; color:var(--text-dim)"><span id="exp-count-imagens">${selFotosItens.size + selFotosAmbiente.size}</span> de ${itensComFotoVinculada.length + ambientePhotos.length} selecionada(s)</p>
            </div>
          </div>

          <div class="exp-cat-block" data-key="mapas">
            <div class="exp-cat-row">
              <input type="checkbox" class="exp-cat" data-key="mapas" checked title="Incluir Mapas na exportação">
              <button type="button" class="exp-cat-btn" data-key="mapas" aria-expanded="false" title="Ver/escolher os mapas/ambientes">
                <span class="exp-cat-ic" aria-hidden="true">🗺️</span>
                <span class="exp-cat-txt"><b>Mapas</b><br><span class="d">Planta baixa (paredes/objetos/pinos), incluindo imagens coladas nela. (${maps.length})</span></span>
                <span class="exp-cat-chevron" aria-hidden="true">▾</span>
              </button>
            </div>
            <!-- CORRIGIDO (01/09/2026) — pedido do usuário verbatim: "Onde
                 ficou o 'exportar' da versão de texto do mapa? Atualmente,
                 só tem o 'importar' da versão de texto." Causa raiz: o
                 contraparte de IMPORTAR ("📄 Importar mapa (.txt)") fica
                 sempre visível, ao lado de "⬆️ Importar backup", direto na
                 tela de Configurações — já este botão de EXPORTAR vivia
                 DENTRO de #exp-opts-mapas, que só aparece depois de clicar
                 no chevron "▾"/"Ver/escolher os mapas" (escondido por
                 padrão, class="hidden") — por isso passava despercebido.
                 Continua "junto do ⬇️ Exportar" (decisão já confirmada com o
                 usuário pro item GRANDE #9), só que agora FORA do bloco
                 recolhível, sempre visível assim que o modal de Exportar
                 abre — igual visibilidade do botão de importar. Continua
                 usando selMapas (que já vem com TODOS os mapas marcados
                 por padrão) — funciona igual mesmo que o usuário nunca abra
                 a lista de escolher mapas. -->
            <button type="button" class="btn secondary sm" id="exp-mapas-txt" style="margin:6px 0 4px" title="Gera um .txt por mapa marcado (por padrão, todos) no novo formato simples de texto (paredes/portas/janelas/objetos/patrimônios/andares) — ver 'O que é isso' no próprio arquivo">📄 Baixar mapa(s) como texto (.txt)</button>
            <div class="exp-cat-opts hidden" id="exp-opts-mapas">
              <div style="display:flex; gap:8px; margin-bottom:6px">
                <button type="button" class="btn secondary sm exp-marcar-todos" data-list="mapas">Marcar todos</button>
                <button type="button" class="btn secondary sm exp-desmarcar-todos" data-list="mapas">Desmarcar todos</button>
              </div>
              <div class="exp-picker-list" id="exp-list-mapas" style="max-height:220px; overflow:auto; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:10px; padding:6px"></div>
              <p style="font-size:11.5px; color:var(--text-dim)"><span id="exp-count-mapas">${selMapas.size}</span> de ${maps.length} selecionado(s) — controla quais mapas o botão "📄 Baixar mapa(s) como texto (.txt)" acima também exporta</p>
            </div>
          </div>
        </div>

        <!-- ITEM A10 (rodada 57/v311), pedido do usuário verbatim: "no
             'exportar' do app, deve aparecer uma lista do que entra na
             exportação, logo abaixo dos botões de categorias. Mapa, cada
             foto com seu grupo de patrimônios ou só os patrimônios, etc.
             Deve ser uma seção 'O que vai nessa exportação:'." Preenchida/
             atualizada por atualizarResumoExportacao() (chamada sempre que
             uma categoria ou um item de dentro dela muda de seleção — ver
             atualizarUI/atualizarContagens mais abaixo). -->
        <div id="exp-summary-wrap" style="margin-top:12px; padding:10px 12px; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:10px">
          <strong style="font-size:12.5px">O que vai nessa exportação:</strong>
          <ul id="exp-summary-list" style="margin:6px 0 0; padding-left:18px; font-size:11.5px; color:var(--text-dim)"></ul>
        </div>

        <span style="display:block; font-size:12.5px; color:var(--text-dim); margin-bottom:5px; margin-top:14px">Como agrupar os arquivos</span>
        <label class="radio-opt"><input type="radio" name="exp-formato" value="junto" checked><span><span class="t">Tudo junto num arquivo só</span><br><span class="d">Gera um único .json: se houver mais de uma categoria marcada acima, todas entram juntas nesse mesmo arquivo; se só uma categoria estiver marcada, o arquivo único é formado só com ela. Inclui também tipos/setores salvos e configurações do app quando TODOS os patrimônios estão selecionados (backup completo).</span></span></label>

        <!-- Pedido do usuário (27/08/2026): estas duas opções + a subpasta
             abaixo ficam visualmente "presas" (borda à esquerda + recuo) pra
             deixar claro que "Salvar cada categoria numa subpasta" se aplica
             às DUAS ("Um arquivo por categoria" e "Um arquivo por item"), não
             só à primeira delas como antes. -->
        <div id="exp-formato-multi-wrap" style="border-left:2px solid var(--border); padding-left:10px; margin-top:2px">
          <label class="radio-opt" id="exp-formato-categoria-wrap"><input type="radio" name="exp-formato" value="categoria"><span><span class="t">Um arquivo por categoria</span><br><span class="d">Até 3 arquivos separados — um para Patrimônios, um para Imagens, um para Mapas (só das categorias marcadas). Só disponível com mais de uma categoria marcada acima.</span></span></label>
          <label class="radio-opt" id="exp-formato-item-wrap"><input type="radio" name="exp-formato" value="item"><span><span class="t">Um arquivo por item</span><br><span class="d">Um .json separado para cada patrimônio, cada foto e cada mapa marcados nas listas acima.</span></span></label>

          <label class="radio-opt" id="exp-subpastas-wrap" style="margin-top:6px">
            <input type="checkbox" id="exp-subpastas">
            <span><span class="t">Salvar cada categoria numa subpasta (imagens/, patrimonios/, mapas/)</span><br><span class="d">Vale para as duas opções acima ("Um arquivo por categoria" e "Um arquivo por item"). Funciona no Chrome/Edge — outros navegadores podem ignorar e salvar tudo direto na pasta Downloads.</span></span>
          </label>
        </div>

        <div style="display:flex; gap:8px; margin-top:14px">
          <button class="btn secondary block" id="exp-cancel" title="Fechar sem exportar">Cancelar</button>
          <button class="btn block" id="exp-confirm" title="Gerar e baixar o(s) arquivo(s)">⬇️ Exportar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#exp-cancel').onclick = () => modal.remove();

    const subpastasWrap = modal.querySelector('#exp-subpastas-wrap');
    const subpastasChk = modal.querySelector('#exp-subpastas');
    const formatoCategoriaWrap = modal.querySelector('#exp-formato-categoria-wrap');
    const formatoCategoriaRadio = modal.querySelector('input[name="exp-formato"][value="categoria"]');

    // ---------- As 3 listas (patrimônios/imagens/mapas) — mesmo padrão pras
    // 3, cada uma com seu(s) Set(s) de selecionados/filtro/contagem próprios ----------
    const listas = {
      patrimonios: {
        el: modal.querySelector('#exp-list-patrimonios'), sel: selPatrimonios,
        rows: () => resumo.map((it) => ({ id: it.id, label: `${Utils.escapeHtml(it.patrimonio || '(sem número)')} — ${Utils.escapeHtml(it.descricao || it.tipo || 'sem descrição')}`, hay: `${it.patrimonio} ${it.descricao} ${it.tipo} ${it.setor}`.toLowerCase() })),
      },
      imagens: {
        el: modal.querySelector('#exp-list-imagens'), sel: null, // combina os 2 sets abaixo, um por linha (r.set)
        rows: () => [
          ...itensComFotoVinculada.map((it) => ({ id: `item:${it.id}`, realId: it.id, set: selFotosItens, label: `📎 ${Utils.escapeHtml(it.patrimonio || it.descricao || '(sem número)')} (foto vinculada)`, hay: `${it.patrimonio} ${it.descricao}`.toLowerCase(), thumb: null })),
          ...ambientePhotos.map((f) => ({ id: `amb:${f.id}`, realId: f.id, set: selFotosAmbiente, label: `🏞️ ${Utils.escapeHtml(f.nome || 'Foto de ambiente')}`, hay: `${f.nome || ''}`.toLowerCase(), thumb: f.thumbDataUrl || f.dataUrl })),
        ],
      },
      mapas: {
        el: modal.querySelector('#exp-list-mapas'), sel: selMapas,
        rows: () => maps.map((m) => ({ id: m.id, label: Utils.escapeHtml(m.nome || 'Ambiente sem nome'), hay: (m.nome || '').toLowerCase() })),
      },
    };

    const atualizarContagens = () => {
      modal.querySelector('#exp-count-patrimonios').textContent = String(selPatrimonios.size);
      modal.querySelector('#exp-count-imagens').textContent = String(selFotosItens.size + selFotosAmbiente.size);
      modal.querySelector('#exp-count-mapas').textContent = String(selMapas.size);
      atualizarResumoExportacao();
    };

    /** ITEM A10 — ver comentário grande no HTML acima (`#exp-summary-wrap`).
     *  Monta uma listinha em texto simples do que VAI SAIR desta exportação,
     *  cruzando as 3 categorias marcadas com as seleções individuais de
     *  cada uma — chamada sempre que qualquer contagem muda (categoria
     *  marcada/desmarcada, item individual marcado/desmarcado). */
    const atualizarResumoExportacao = () => {
      const listEl = modal.querySelector('#exp-summary-list');
      if (!listEl) return;
      const cats = categoriasMarcadas ? categoriasMarcadas() : [...modal.querySelectorAll('.exp-cat:checked')].map((c) => c.dataset.key);
      const linhas = [];
      if (cats.includes('patrimonios')) {
        linhas.push(selPatrimonios.size
          ? `📦 ${selPatrimonios.size} patrimônio(s) (identificação, setor, datas — sem fotos)`
          : '📦 Patrimônios — nenhum selecionado');
      }
      if (cats.includes('imagens')) {
        const partes = [];
        if (selFotosItens.size) partes.push(`${selFotosItens.size} foto(s) de patrimônio (cada uma com o(s) patrimônio(s) vinculado(s) a ela)`);
        if (selFotosAmbiente.size) partes.push(`${selFotosAmbiente.size} foto(s) de ambiente (planta baixa) — cada uma com o grupo de patrimônios/orbs marcados nela, se houver`);
        linhas.push(partes.length ? `🖼️ ${partes.join(' + ')}` : '🖼️ Imagens — nenhuma selecionada');
      }
      if (cats.includes('mapas')) {
        linhas.push(selMapas.size
          ? `🗺️ ${selMapas.size} mapa(s) — planta baixa (paredes/objetos/portas/janelas) e os patrimônios vinculados a pontos nela`
          : '🗺️ Mapas — nenhum selecionado');
      }
      listEl.innerHTML = linhas.length
        ? linhas.map((l) => `<li>${l}</li>`).join('')
        : '<li>Nenhuma categoria marcada — nada será exportado.</li>';
    };

    const renderLista = (key, filtro) => {
      const L = listas[key];
      const q = (filtro || '').trim().toLowerCase();
      const rows = L.rows().filter((r) => !q || r.hay.includes(q));
      L.el.innerHTML = rows.length
        ? rows.map((r) => this._pickerRowHtml(r.id, (r.set || L.sel).has(r.realId ?? r.id), r.label, r.thumb)).join('')
        : 'Nada encontrado com esse filtro.';
      L.el.querySelectorAll('.exp-item-chk').forEach((chk) => {
        chk.onchange = (e) => {
          const row = rows.find((r) => r.id === e.target.dataset.id);
          const set = row?.set || L.sel;
          const realId = row?.realId ?? e.target.dataset.id;
          if (e.target.checked) set.add(realId); else set.delete(realId);
          atualizarContagens();
        };
      });
    };
    Object.keys(listas).forEach((key) => renderLista(key, ''));

    modal.querySelectorAll('.exp-picker-filter').forEach((input) => {
      input.oninput = Utils.debounce((e) => renderLista(e.target.dataset.list, e.target.value), 150);
    });
    // Pedido do usuário (27/08/2026): "Marcar visíveis" virou "Marcar todos"
    // porque tem que marcar TODOS os patrimônios cadastrados (não só as
    // linhas que aparecem depois do filtro de texto) — daí operar direto
    // sobre os dados completos de cada lista (`L.rows()`), não sobre os
    // checkboxes desenhados na tela agora, e só depois re-renderizar
    // respeitando o filtro atual (se houver). Mesma lógica pras 3 categorias
    // (Patrimônios/Imagens/Mapas), que agora têm os dois botões.
    const marcarOuDesmarcarTodos = (key, valor) => {
      const L = listas[key];
      L.rows().forEach((r) => {
        const set = r.set || L.sel;
        const realId = r.realId ?? r.id;
        if (valor) set.add(realId); else set.delete(realId);
      });
      const filtroAtual = modal.querySelector(`.exp-picker-filter[data-list="${key}"]`)?.value || '';
      renderLista(key, filtroAtual);
      atualizarContagens();
    };
    modal.querySelectorAll('.exp-marcar-todos').forEach((btn) => {
      btn.onclick = () => marcarOuDesmarcarTodos(btn.dataset.list, true);
    });
    modal.querySelectorAll('.exp-desmarcar-todos').forEach((btn) => {
      btn.onclick = () => marcarOuDesmarcarTodos(btn.dataset.list, false);
    });

    // NOVO (01/09/2026) — item GRANDE #9: "📄 Baixar mapa(s) marcado(s) como
    // texto (.txt)" — ver comentário grande no HTML acima. Um arquivo por
    // mapa selecionado (MapTxt.exportarMapa é síncrono — nenhum dado extra
    // precisa vir do DB, o patrimônio vinculado já está copiado em
    // `obj.itemIds[].patrimonio`).
    modal.querySelector('#exp-mapas-txt').onclick = async (ev) => {
      if (!selMapas.size) { Utils.toast('Marque ao menos um mapa na lista acima.', { type: 'warn' }); return; }
      const btn = ev.currentTarget;
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Gerando…';
      try {
        const mapasParaExportar = (await Promise.all([...selMapas].map((id) => DB.getMap(id)))).filter(Boolean);
        mapasParaExportar.forEach((m, i) => {
          const texto = MapTxt.exportarMapa(m);
          const nomeArq = `${(m.nome || 'mapa').replace(/[^a-z0-9_-]+/gi, '_')}.txt`;
          // `notify:false` em todos menos o último — evita uma leva de toasts
          // "arquivo baixado" repetidos quando há vários mapas marcados
          // (mesmo padrão já usado no laço "Um arquivo por item" mais abaixo).
          Utils.downloadText(texto, nomeArq, 'text/plain', { notify: i === mapasParaExportar.length - 1 });
        });
        Utils.toast(`${mapasParaExportar.length} arquivo(s) .txt gerado(s) ✓`, { type: 'ok' });
      } catch (err) {
        console.error('Falha ao gerar .txt do(s) mapa(s):', err);
        Utils.toast('Erro ao gerar o(s) arquivo(s) .txt: ' + err.message, { type: 'danger' });
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    };

    // ---------- Clicar no checkbox só marca/desmarca a categoria (não
    // expande); clicar no botão largo (nome+descrição) só expande/recolhe
    // (não mexe no checkbox) — pedido do usuário: "O fato de marcar o
    // checkbox, já é escolher todos eles" (dois alvos de clique separados).
    // A lista de cada categoria já aparece direto ao expandir (pedido do
    // usuário, 27/08/2026 — ver comentário grande no topo desta função). ----------
    modal.querySelectorAll('.exp-cat-btn').forEach((btn) => {
      btn.onclick = () => {
        const key = btn.dataset.key;
        const opts = modal.querySelector(`#exp-opts-${key}`);
        const abrir = opts.classList.contains('hidden');
        opts.classList.toggle('hidden', !abrir);
        btn.setAttribute('aria-expanded', String(abrir));
        btn.classList.toggle('open', abrir);
      };
    });

    const categoriasMarcadas = () => [...modal.querySelectorAll('.exp-cat:checked')].map((c) => c.dataset.key);

    const atualizarUI = () => {
      const cats = categoriasMarcadas();
      modal.querySelectorAll('.exp-cat-block').forEach((block) => {
        block.classList.toggle('exp-cat-off', !cats.includes(block.dataset.key));
      });
      atualizarResumoExportacao(); // ITEM A10 — categoria marcada/desmarcada também muda o resumo

      // Pedido do usuário (27/08/2026): "Um arquivo por categoria" só faz
      // sentido — e só fica habilitada — quando há mais de uma categoria
      // marcada; se estava selecionada e deixou de poder ser usada, cai de
      // volta pra "junto" (igual ao que já acontecia com "Salvar cada
      // categoria numa subpasta" logo abaixo).
      const podeCategoria = cats.length > 1;
      formatoCategoriaRadio.disabled = !podeCategoria;
      formatoCategoriaWrap.style.opacity = podeCategoria ? '' : '.5';
      if (!podeCategoria && formatoCategoriaRadio.checked) {
        formatoCategoriaRadio.checked = false;
        modal.querySelector('input[name="exp-formato"][value="junto"]').checked = true;
      }

      const formato = modal.querySelector('input[name="exp-formato"]:checked').value;
      // "Salvar cada categoria numa subpasta" está atrelada tanto a "Um
      // arquivo por categoria" quanto a "Um arquivo por item" (pedido do
      // usuário, 27/08/2026) — daí o agrupamento visual dos três acima.
      const podeSubpastas = cats.length > 1 && (formato === 'categoria' || formato === 'item');
      subpastasChk.disabled = !podeSubpastas;
      subpastasWrap.style.opacity = podeSubpastas ? '' : '.5';
      if (!podeSubpastas) subpastasChk.checked = false;
    };
    modal.querySelectorAll('.exp-cat').forEach((chk) => { chk.onchange = atualizarUI; });
    modal.querySelectorAll('input[name="exp-formato"]').forEach((r) => { r.onchange = atualizarUI; });
    atualizarUI();

    modal.querySelector('#exp-confirm').onclick = async (ev) => {
      const btn = ev.currentTarget;
      const cats = categoriasMarcadas();
      if (!cats.length) { Utils.toast('Marque ao menos uma categoria (Patrimônios/Imagens/Mapas).', { type: 'warn' }); return; }
      const formato = modal.querySelector('input[name="exp-formato"]:checked').value;
      const subpastas = subpastasChk.checked && !subpastasChk.disabled;

      // Pedido do usuário (28/08/2026): "se houver 0 patrimônios
      // catalogados, mesmo que a categoria patrimônios esteja marcada, não
      // deve ser exibida a mensagem '...ou desmarque a categoria
      // patrimônios', impedindo o download. Para exportar, só haverá um
      // bloqueio que é quando tiver 0 patrimônios E 0 fotos E 0 mapas." —
      // antes, cada categoria MARCADA com a lista vazia bloqueava sozinha
      // (3 checks separados) — bastava não ter NENHUM patrimônio cadastrado
      // (lista sempre vazia nesse caso) pra travar a exportação de
      // fotos/mapas mesmo com as duas outras categorias cheias. Agora só
      // bloqueia quando as TRÊS estão vazias ao mesmo tempo — do contrário,
      // uma categoria marcada mas sem nada pra exportar (0 selecionados ou
      // 0 cadastrados) simplesmente sai de fora do arquivo, sem travar as
      // outras.
      if (selPatrimonios.size === 0 && (selFotosItens.size + selFotosAmbiente.size) === 0 && selMapas.size === 0) {
        Utils.toast('Não há patrimônios, fotos nem mapas para exportar.', { type: 'warn' });
        return;
      }

      // ---------- Manipulador de dependências entre categorias (ver
      // js/exportdeps.js): patrimônio(s) selecionado(s) com uma foto
      // vinculada, sem a categoria Imagens marcada — pergunta antes de
      // seguir (pedido do usuário, 27/08/2026). ----------
      if (cats.includes('patrimonios')) {
        const itensSelecionados = resumo.filter((it) => selPatrimonios.has(it.id));
        const podeSeguir = await ExportDeps.checkPatrimonioSemFoto({
          itensParaExportar: itensSelecionados,
          imagensIncluida: cats.includes('imagens'),
        });
        if (!podeSeguir) return;
      }

      btn.disabled = true;
      const textoOriginal = btn.textContent;
      btn.textContent = 'Exportando…';
      try {
        const exportadoEm = DB.nowISO();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const pasta = (cat) => (subpastas ? `${cat}/` : '');
        let totalGerado = 0;

        // ---------- Monta os dados de cada categoria marcada (só os itens
        // selecionados nas listas acima) ----------
        let patrimonios = null;
        if (cats.includes('patrimonios')) {
          const brutos = (await Promise.all([...selPatrimonios].map((id) => DB.getItem(id)))).filter(Boolean);
          // Pedido do usuário (27/08/2026): "ainda está com imagens [...]
          // idênticas entre 'avatarDataUrl' e 'thumbDataUrl'. [...] devem
          // ser eliminados. Deve haver apenas uma imagem representativa em
          // SVG no arquivo exportado." — `avatarDataUrl` (campo legado, só
          // presente em itens bem antigos) sai do arquivo; no lugar, TODO
          // patrimônio exportado leva um `avatarSvg` único (a mesma imagem
          // que a Tabela/Cartões já mostram — ver Avatar.itemIconSvg, que
          // aqui também respeita um `avatarSvg` já existente, de um item que
          // já tinha sido importado antes). Ao importar de volta (ver db.js
          // addItem), esse campo é preservado — "quando for importado,
          // então sim, o SVG é renderizado para produzir a imagem".
          const iconStateExport = await Avatar.loadIconState();
          const itensCompletos = brutos.map((it) => {
            const { avatarDataUrl, thumbDataUrl, ...resto } = it;
            resto.avatarSvg = it.avatarSvg || Avatar.itemIconSvg(it, iconStateExport);
            return resto;
          });
          patrimonios = { itensCompletos };
        }
        let imagens = null;
        if (cats.includes('imagens')) {
          const fotosDeItens = (await Promise.all(
            [...selFotosItens].map(async (itemId) => {
              const it = (patrimonios?.itensCompletos || []).find((x) => x.id === itemId) || await DB.getItem(itemId);
              if (!it?.fotoAnexadaId) return null;
              const foto = await DB.getAmbientePhoto(it.fotoAnexadaId);
              if (!foto) return null;
              return { itemId: it.id, patrimonio: it.patrimonio, descricao: it.descricao, nome: foto.nome, dataUrl: foto.dataUrl, thumbDataUrl: foto.thumbDataUrl };
            }),
          )).filter(Boolean);
          const fotosDeAmbiente = (await Promise.all([...selFotosAmbiente].map((id) => DB.getAmbientePhoto(id)))).filter(Boolean);
          imagens = { fotosDeItens, fotosDeAmbiente };
        }
        let mapasExport = null;
        if (cats.includes('mapas')) mapasExport = (await Promise.all([...selMapas].map((id) => DB.getMap(id)))).filter(Boolean);

        if (formato === 'junto') {
          let dump = { versao: 1, exportadoEm };
          if (cats.includes('patrimonios')) dump.items = patrimonios.itensCompletos;
          if (cats.includes('imagens')) { dump.fotosDeItens = imagens.fotosDeItens; dump.fotosDeAmbiente = imagens.fotosDeAmbiente; }
          if (cats.includes('mapas')) dump.maps = mapasExport;
          // Backup completo de verdade (tipos/setores/configurações) só faz
          // sentido levando TODOS os patrimônios cadastrados — senão o
          // arquivo mistura um recorte com configurações do app inteiro.
          if (cats.includes('patrimonios') && selPatrimonios.size === resumo.length) {
            const [types, sectors, settingsAll] = await Promise.all([DB.getAllTypes(), DB.getAllSectors(), DB.getAllSettings()]);
            dump = { ...dump, types, sectors, settings: settingsAll };
            if (!dump.maps) dump.maps = await DB.getAllMaps();
          }
          Utils.downloadJSON(dump, `catalogacao-backup-${stamp}.json`);
          totalGerado++;
        } else if (formato === 'categoria') {
          if (cats.includes('patrimonios')) { Utils.downloadJSON({ versao: 1, exportadoEm, items: patrimonios.itensCompletos }, `${pasta('patrimonios')}catalogacao-patrimonios-${stamp}.json`, { notify: false }); totalGerado++; await new Promise((r) => setTimeout(r, 150)); }
          if (cats.includes('imagens')) { Utils.downloadJSON({ versao: 1, exportadoEm, fotosDeItens: imagens.fotosDeItens, fotosDeAmbiente: imagens.fotosDeAmbiente }, `${pasta('imagens')}catalogacao-imagens-${stamp}.json`, { notify: false }); totalGerado++; await new Promise((r) => setTimeout(r, 150)); }
          if (cats.includes('mapas')) { Utils.downloadJSON({ versao: 1, exportadoEm, maps: mapasExport }, `${pasta('mapas')}catalogacao-mapas-${stamp}.json`, { notify: false }); totalGerado++; }
        } else if (formato === 'item') {
          // Pedido do usuário (27/08/2026): "Um arquivo por item" — um .json
          // separado pra CADA registro (cada patrimônio, cada foto, cada
          // mapa) das categorias marcadas acima, não só um arquivo por
          // categoria inteira. Nome do arquivo sanitizado pra não quebrar em
          // nenhum sistema de arquivos.
          const nomeArquivo = (s) => String(s || 'sem-nome').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'sem-nome';
          if (cats.includes('patrimonios')) {
            for (const it of patrimonios.itensCompletos) {
              Utils.downloadJSON({ versao: 1, exportadoEm, items: [it] }, `${pasta('patrimonios')}catalogacao-patrimonio-${nomeArquivo(it.patrimonio || it.id)}-${stamp}.json`, { notify: false });
              totalGerado++;
              await new Promise((r) => setTimeout(r, 150));
            }
          }
          if (cats.includes('imagens')) {
            for (const foto of imagens.fotosDeItens) {
              Utils.downloadJSON({ versao: 1, exportadoEm, fotosDeItens: [foto] }, `${pasta('imagens')}catalogacao-imagem-item-${nomeArquivo(foto.patrimonio || foto.itemId)}-${stamp}.json`, { notify: false });
              totalGerado++;
              await new Promise((r) => setTimeout(r, 150));
            }
            for (const foto of imagens.fotosDeAmbiente) {
              Utils.downloadJSON({ versao: 1, exportadoEm, fotosDeAmbiente: [foto] }, `${pasta('imagens')}catalogacao-imagem-ambiente-${nomeArquivo(foto.nome || foto.id)}-${stamp}.json`, { notify: false });
              totalGerado++;
              await new Promise((r) => setTimeout(r, 150));
            }
          }
          if (cats.includes('mapas')) {
            for (const mapa of mapasExport) {
              Utils.downloadJSON({ versao: 1, exportadoEm, maps: [mapa] }, `${pasta('mapas')}catalogacao-mapa-${nomeArquivo(mapa.nome || mapa.id)}-${stamp}.json`, { notify: false });
              totalGerado++;
              await new Promise((r) => setTimeout(r, 150));
            }
          }
        }

        Utils.toast(`${totalGerado} arquivo(s) exportado(s) ✓`, { type: 'ok' });
        EventLog.log(`Backup exportado: categorias [${cats.join(', ')}], agrupamento "${formato}", ${totalGerado} arquivo(s).`, { tipo: 'ok' });
        modal.remove();
      } catch (err) {
        console.error('Falha ao exportar backup:', err);
        Utils.toast('Não foi possível exportar: ' + (err?.message || err), { type: 'danger', duration: 5000 });
        EventLog.log(`Falha ao exportar backup: ${err?.message || err}`, { tipo: 'erro' });
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    };
  },


  /**
   * Mostra o log de eventos (ver eventlog.js) — tudo que o app registrou como
   * relevante neste aparelho, mais recente primeiro.
   */
  showEventLog() {
    const list = EventLog.getAll().slice().reverse();
    const cores = { ok: 'var(--ok, #3ecf8e)', aviso: 'var(--warn, #e8b339)', erro: 'var(--danger, #ef5a5a)', info: 'var(--text-dim)' };
    const icones = { ok: '✓', aviso: '⚠️', erro: '✗', info: '·' };

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="handle"></div>
        <h3 style="margin-top:0">🧾 Log de eventos (${list.length})</h3>
        <p style="font-size:11.5px; color:var(--text-dim)">Mais recente primeiro. Guardado só neste aparelho.</p>
        <input type="text" id="ev-filter" placeholder="Filtrar por texto…" style="width:100%; margin-bottom:8px">
        <div id="ev-list" style="max-height:50vh; overflow:auto; background:var(--bg-elev-2); border:1px solid var(--border); border-radius:10px; padding:10px; font-size:12px; line-height:1.7; font-family:monospace"></div>
        <div style="display:flex; gap:8px; margin-top:10px">
          <button class="btn secondary block" id="ev-download" title="Baixar o log de eventos como .txt">📄 Baixar .TXT</button>
          <button class="btn block" id="ev-close" title="Fechar esta janela">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#ev-close').onclick = () => modal.remove();

    const box = modal.querySelector('#ev-list');
    const render = (filtro) => {
      const q = (filtro || '').trim().toLowerCase();
      const filtered = q ? list.filter((ev) => ev.mensagem.toLowerCase().includes(q)) : list;
      box.innerHTML = filtered.length
        ? filtered.map((ev) => `<div style="padding:3px 0; border-bottom:1px solid var(--border)">
            <span style="color:var(--text-dim)">${Utils.escapeHtml(Utils.formatDateTime(ev.ts))}</span>
            <span style="color:${cores[ev.tipo] || cores.info}"> ${icones[ev.tipo] || icones.info} </span>
            ${Utils.escapeHtml(ev.mensagem)}
          </div>`).join('')
        : (list.length ? 'Nada encontrado com esse filtro.' : 'Nenhum evento registrado ainda.');
    };
    render('');
    modal.querySelector('#ev-filter').oninput = (e) => render(e.target.value);

    modal.querySelector('#ev-download').onclick = () => {
      const txt = list.slice().reverse().map((ev) => `[${ev.ts}] (${ev.tipo}) ${ev.mensagem}`).join('\r\n');
      Utils.downloadBlob(new Blob([txt], { type: 'text/plain;charset=utf-8' }), `log-eventos-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    };
  },

  /**
   * Texto de instruções para UM cenário específico. Se "cenario" for omitido
   * ou desconhecido, devolve o guia completo com todos os cenários juntos
   * (usado no LEIA-ME.txt baixável, que precisa fazer sentido sozinho, fora
   * do app).
   */
  _serverInstructions(cenario) {
    if (cenario && this._cenarioTexto(cenario)) return this._cenarioTexto(cenario);
    const intro =
`O app funciona todo no navegador, sem precisar de nenhum servidor. Esse
servidor local é OPCIONAL, necessário só se você quiser: (a) que o envio por
email seja automático, (b) que cada item seja salvo automaticamente em
arquivo, e/ou (c) que vários aparelhos cataloguem ao mesmo tempo e vejam o
mesmo catálogo (veja "🔗 Sincronização entre aparelhos" mais abaixo).

A relação é simples: este aparelho é um PC ou um celular, e vai ter servidor
("com servidor") ou não ("sem servidor") — escolha em "Este aparelho é PC ou
celular?" no app, que a explicação certa aparece ali. Resumo dos quatro:`;
    const partes = ['pc-sem-servidor', 'pc-com-servidor', 'celular-sem-servidor', 'celular-com-servidor'].map((c) => this._cenarioTexto(c));
    const rodape =
`Formas de montar o servidor (quando "com servidor" está escolhido): PHP
embutido (comando "php -S", sem instalar mais nada além do PHP), XAMPP
(pacote com painel gráfico, só PC) ou Node.js — veja as três abas na seção
"🖥️ Servidor local" do app, cada uma com o passo a passo e os arquivos
prontos para baixar.

Observação: o config.php (aba PHP/XAMPP) é OPCIONAL — sem ele, salvamento
automático e sincronização funcionam normalmente; só o envio automático de
email fica desativado até você criar o config.php (renomeie
config.php.example). A versão Node.js (aba Node.js) ainda não envia email
automaticamente — use a versão PHP se precisar dessa função agora.`;
    return [intro, ...partes, rodape].join('\n\n');
  },

  _cenarioTexto(cenario) {
    const textos = {
      'pc-sem-servidor':
`CENÁRIO: PC, sem servidor
Uso típico: só um PC catalogando, sem configurar nada de servidor. Os itens
ficam guardados no navegador (IndexedDB) deste PC.

1. Use a câmera do PC (webcam) normalmente na tela Capturar — funciona sem
   nenhuma configuração extra.
2. De vez em quando (ou ao terminar), toque em "⬇️ Baixar tudo que já foi
   catalogado" acima para gerar um arquivo com o catálogo completo — guarde
   como backup, ou para levar a outro PC/celular.
3. Para juntar com o que foi catalogado em OUTROS aparelhos (cada um também
   sem servidor, cada um gerando seu próprio arquivo), use "🔗 Unificar fontes
   diferentes" (em "🗂️ Conferência de patrimônio", mais acima) — junta os
   arquivos de todos numa lista só, sem duplicar nem perder nada.`,

      'celular-sem-servidor':
`CENÁRIO: Celular, sem servidor
Uso típico: catalogar em campo só com o celular, sem instalar nada (sem
Termux, sem servidor nenhum). Os itens ficam guardados no navegador
(IndexedDB) deste celular.

1. Use a câmera do celular normalmente na tela Capturar.
2. De vez em quando (ou ao terminar), toque em "⬇️ Baixar tudo que já foi
   catalogado" acima — o arquivo vai para a pasta de Downloads do celular.
   Guarde/transfira esse arquivo (cabo, Bluetooth, WhatsApp, e-mail etc.) para
   juntar com outros depois.
3. Para juntar com o que foi catalogado em OUTROS aparelhos, use "🔗 Unificar
   fontes diferentes" (mais acima) em qualquer um deles.
4. Se preferir que os itens capturados no celular apareçam DIRETO no PC, sem
   precisar baixar/transferir arquivo nenhum, monte um servidor local (veja
   "🖥️ Servidor local" e "🔗 Sincronização entre aparelhos" logo abaixo) —
   os dois aparelhos passam a enxergar o mesmo catálogo pela rede Wi-Fi.`,

      'pc-com-servidor':
`CENÁRIO: PC, com servidor
Uso típico: catalogar usando a webcam do computador, com o servidor rodando
ali mesmo (nenhuma rede envolvida) — ou usando este PC como o servidor que
OUTROS aparelhos (celulares, outros PCs) também vão usar pela rede Wi-Fi.

1. Escolha uma das três formas de montar o servidor nas abas logo abaixo
   (🐘 PHP, 🧩 XAMPP ou 🟢 Node.js) e siga o passo a passo dela.
2. Nesta tela, em "URL do servidor" (acima), use o endereço indicado na aba
   escolhida — normalmente http://localhost/... ou http://localhost:8000/...
3. Abra o app (index.html) neste mesmo PC normalmente — o servidor só é
   usado para salvar em arquivo/enviar email/sincronizar, não para servir a
   página em si.
4. Use a câmera do PC (webcam) normalmente na tela Capturar.

QUER QUE OUTRO APARELHO (ex.: um celular) TAMBÉM USE ESTE SERVIDOR? Ele
precisa estar na MESMA REDE WI-FI deste PC (o servidor é local, não está na
internet — dados móveis/4G/5G não alcançam). Descubra o IP deste PC na rede
(Prompt de Comando → "ipconfig" → "Endereço IPv4", ex.: 192.168.0.10) e, no
OUTRO aparelho, em "URL do servidor", use esse IP no lugar de "localhost"
(ex.: http://192.168.0.10:8000/receive.php).

ATENÇÃO — a câmera do OUTRO aparelho pode ser bloqueada por segurança:
navegadores só liberam a câmera em "contexto seguro" (HTTPS ou "localhost").
Acessar pelo IP (http://192.168.0.10/...) NÃO conta como seguro, então o
Chrome de um celular acessando por aí pode recusar a câmera. Duas soluções:
  a) (Recomendado) Gere um certificado HTTPS local com mkcert
     (https://github.com/FiloSottile/mkcert) para o IP/nome deste PC e
     configure o servidor (Apache do XAMPP, ou o próprio PHP/Node.js) para
     usá-lo, acessando por https://192.168.0.10/....
  b) (Mais rápido, só para testes) No OUTRO aparelho, abra
     chrome://flags/#unsafely-treat-insecure-origin-as-secure , adicione
     http://192.168.0.10 (com a porta, se houver) na lista, ative a flag e
     reinicie o Chrome — ele passa a tratar esse endereço como seguro só
     naquele aparelho.

Alternativa avançada (fora da mesma Wi-Fi, dados móveis): exigiria configurar
redirecionamento de porta no roteador (expõe este PC à internet — não
recomendado) ou uma VPN pessoal tipo Tailscale/ZeroTier ligando os dois
aparelhos numa rede virtual. Foge do escopo simples deste app — para o uso
comum, mantenha os dois aparelhos na mesma Wi-Fi.`,

      'celular-com-servidor':
`CENÁRIO: Celular, com servidor
Duas formas de ter "servidor" com o celular:

(a) INSTALAR O SERVIDOR NO PRÓPRIO CELULAR (Android, via Termux) — útil para
    catalogar em campo, sem PC por perto, salvando automaticamente em
    arquivo no próprio aparelho. Veja a aba 🐘 PHP ou 🟢 Node.js logo abaixo
    — cada uma explica também a versão para Termux/Android, além da versão
    PC. Depois de rodar o servidor no celular (ex.: "php -S localhost:8000"
    ou "node receive.js" dentro do Termux), em "URL do servidor" (acima),
    use: http://localhost:8000/receive.php — como o navegador está acessando
    "localhost" nele mesmo, a câmera funciona sem exigir HTTPS. (iPhone/iOS
    não tem um equivalente direto ao Termux para isso — use a opção (b)
    abaixo.)

(b) USAR O SERVIDOR DE OUTRO APARELHO NA REDE (normalmente um PC) — mais
    simples na prática: o PC monta o servidor (veja o cenário "PC, com
    servidor" e as abas 🐘 PHP / 🧩 XAMPP / 🟢 Node.js) e este celular só
    aponta pra ele. Os dois aparelhos precisam estar na MESMA REDE WI-FI
    (dados móveis não alcançam um servidor local). Em "URL do servidor"
    (acima), use o IP do outro aparelho, ex.: http://192.168.0.10:8000/
    receive.php — veja as notas sobre câmera/HTTPS no cenário "PC, com
    servidor".

Os arquivos salvos (no caso (a)) ficam dentro da pasta que você criou no
celular (ex.: /sdcard/catalogo/catalogo-unico.json) — copie para o PC depois
(cabo USB ou enviando o arquivo) quando quiser consolidar.`,
    };
    return textos[cenario] || '';
  },

  /** Pequeno ícone de terminal (SVG genérico, mesmo estilo/traço dos ícones
   *  de storagestatus.js) — só para ilustrar as abas de "como montar o
   *  servidor" (pedido do usuário: "pequenos desenhos ilustrativos se for
   *  cabível"), nada além de decoração leve. */
  _svgTerminal() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2"/>
      <path d="M6.5 9.5l3.5 3-3.5 3M12.5 15.5h5"/>
    </svg>`;
  },

  /**
   * Liga as três abas "Como montar o servidor" (🐘 PHP / 🧩 XAMPP / 🟢
   * Node.js) dentro da seção "🖥️ Servidor local" — igual a abas de
   * navegador (pedido do usuário: "seleciona a aba e o conteúdo preenche a
   * área dessa seção nas configurações, em vez de toda a tela"): clicar
   * troca só o `#st-servertab-content` desta seção, sem remontar a tela de
   * Configurações inteira. Guias simples e passo a passo, com os comandos
   * de terminal destacados (`.st-cmd`, ver css/style.css) e um botão de
   * download específico de cada forma (os arquivos .php servem tanto para a
   * aba PHP quanto para a aba XAMPP — é o mesmo servidor por baixo, só muda
   * COMO ele é ligado).
   */
  _wireServerTabs(container) {
    const tabsWrap = container.querySelector('#st-servertabs');
    const contentEl = container.querySelector('#st-servertab-content');
    if (!tabsWrap || !contentEl) return; // seção "sem servidor" — abas nem existem no DOM agora
    const renderTab = (tab) => {
      contentEl.innerHTML = this._serverTabContent(tab);
      contentEl.querySelectorAll('.st-download-server-php').forEach((btn) => { btn.onclick = () => this._downloadServerBundle(); });
      contentEl.querySelectorAll('.st-download-server-node').forEach((btn) => { btn.onclick = () => this._downloadServerBundleNode(); });
      contentEl.querySelectorAll('.st-download-server-node-simples').forEach((btn) => { btn.onclick = () => this._downloadServerBundleNodeSimples(); });
      if (tab === 'node') this._wireNodeSubTabs(contentEl);
    };
    tabsWrap.querySelectorAll('.st-servertab').forEach((btn) => {
      btn.onclick = () => {
        tabsWrap.querySelectorAll('.st-servertab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderTab(btn.dataset.tab);
      };
    });
    renderTab('php'); // aba inicial
  },

  /**
   * Sub-abas DENTRO da aba "🟢 Node.js" (mesmo padrão de "aba de navegador"
   * das abas de fora — PHP/XAMPP/Node.js — só que um nível mais interno):
   * "💾 Servidor completo" é o script receive.js já existente (salva
   * automaticamente no disco + sincroniza aparelhos, igual ao PHP);
   * "📁 Servidor simples" é o passo a passo que o usuário mandou no arquivo
   * "passos node.js.docx" (pacote `http-server`, só serve os arquivos do
   * app pela rede — sem salvar nada sozinho). Pedido do usuário: "deixe o
   * jeito que você colocou em uma subaba e faça outra subaba do Node.js e
   * coloque os passos descritos no arquivo que te enviei".
   */
  _wireNodeSubTabs(contentEl) {
    const subTabsWrap = contentEl.querySelector('#st-nodesubtabs');
    const subContentEl = contentEl.querySelector('#st-nodesubtab-content');
    if (!subTabsWrap || !subContentEl) return;
    const renderSub = (sub) => {
      subContentEl.innerHTML = this._nodeSubTabContent(sub);
      subContentEl.querySelectorAll('.st-download-server-node').forEach((btn) => { btn.onclick = () => this._downloadServerBundleNode(); });
      subContentEl.querySelectorAll('.st-download-server-node-simples').forEach((btn) => { btn.onclick = () => this._downloadServerBundleNodeSimples(); });
    };
    subTabsWrap.querySelectorAll('.st-nodesubtab').forEach((btn) => {
      btn.onclick = () => {
        subTabsWrap.querySelectorAll('.st-nodesubtab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderSub(btn.dataset.nodesub);
      };
    });
    renderSub('completo'); // sub-aba inicial
  },

  _serverTabContent(tab) {
    const icone = `<span class="st-servertab-icon" aria-hidden="true">${this._svgTerminal()}</span>`;
    if (tab === 'xampp') {
      return `
        ${icone}
        <p style="font-size:12.5px; color:var(--text-dim); margin-top:4px">Pacote pronto com PHP + Apache e painel gráfico — sem usar terminal nenhum. <b>Só para PC</b> (Windows/Mac/Linux); não existe versão para celular.</p>
        <ol class="st-steps">
          <li>Baixe e instale o XAMPP em <a href="https://www.apachefriends.org/" target="_blank" rel="noopener">apachefriends.org</a>.</li>
          <li>Baixe os arquivos prontos deste app: <button type="button" class="btn secondary sm st-download-server-php" title="Baixar receive.php e config.php prontos para colocar no seu servidor">⬇️ Baixar arquivos do servidor (.php)</button></li>
          <li>Copie os dois arquivos (receive.php e config.php) para:<div class="st-cmd">C:\\xampp\\htdocs\\catalogo\\</div>(crie a pasta "catalogo" se não existir).</li>
          <li>(Opcional) Abra config.php num editor de texto e preencha o email de destino, se for usar o envio automático por email.</li>
          <li>Abra o Painel de Controle do XAMPP e clique em "Start" ao lado de "Apache".</li>
          <li>Em "URL do servidor" (acima), use:<div class="st-cmd">http://localhost/catalogo/receive.php</div></li>
        </ol>
        <p class="st-servertab-note">Se a câmera for de um celular acessando este servidor pela mesma rede Wi-Fi, troque "localhost" pelo IP deste PC — veja o texto do cenário "PC, com servidor" logo acima para os detalhes de rede/câmera/HTTPS.</p>`;
    }
    if (tab === 'node') {
      return `
        ${icone}
        <p style="font-size:12.5px; color:var(--text-dim); margin-top:4px">Alternativa ao PHP — mesma ideia (um servidor rodando na sua máquina), usando Node.js. Duas formas de montar, escolha uma:</p>
        <div class="st-nodesubtabs" id="st-nodesubtabs">
          <button type="button" class="st-nodesubtab active" data-nodesub="completo" title="Script pronto deste app (receive.js): salva automaticamente no disco (individual/único + .txt/.csv) e sincroniza entre aparelhos, igual à versão PHP">💾 Servidor completo</button>
          <button type="button" class="st-nodesubtab" data-nodesub="simples" title="Pacote http-server: só serve os arquivos do app pela rede (ex.: abrir do celular), não salva nada sozinho no disco">📁 Servidor simples (http-server)</button>
        </div>
        <div id="st-nodesubtab-content"></div>`;
    }
    // php (aba inicial)
    return `
      ${icone}
      <p style="font-size:12.5px; color:var(--text-dim); margin-top:4px">"Servidor embutido" do próprio PHP (comando <code>php -S</code>) — não precisa instalar Apache nem nada além do PHP em si.</p>
      <ol class="st-steps">
        <li>Baixe o PHP (gratuito) em <a href="https://www.php.net/downloads" target="_blank" rel="noopener">php.net/downloads</a> e instale — no Windows, descompacte o zip numa pasta (ex.: C:\\php) e adicione essa pasta ao PATH do sistema.</li>
        <li>Baixe os arquivos prontos deste app: <button type="button" class="btn secondary sm st-download-server-php" title="Baixar receive.php e config.php prontos para colocar no seu servidor">⬇️ Baixar arquivos do servidor (.php)</button></li>
        <li>Coloque os dois arquivos (receive.php e config.php) numa pasta, por exemplo <code>catalogo/</code>.</li>
        <li>Abra um terminal (Prompt de Comando/PowerShell/Terminal) DENTRO dessa pasta e rode:<div class="st-cmd">php -S localhost:8000</div>Deixe essa janela aberta enquanto for usar o app.</li>
        <li>Em "URL do servidor" (acima), use:<div class="st-cmd">http://localhost:8000/receive.php</div></li>
      </ol>
      <p class="st-servertab-note"><b>No celular (Android, via Termux):</b> instale o <a href="https://termux.dev/" target="_blank" rel="noopener">Termux</a> e rode:<div class="st-cmd">pkg install php
termux-setup-storage</div>copie os dois arquivos baixados pra uma pasta (ex.: /sdcard/catalogo/), entre nela (<code>cd /sdcard/catalogo</code>) e rode o mesmo comando <code>php -S localhost:8000</code> do passo 4. (iPhone/iOS não tem um equivalente direto ao Termux — use um PC com servidor nesse caso.)</p>
      <p class="st-servertab-note">Quer que OUTRO aparelho da mesma rede Wi-Fi (ex.: um celular) envie pra este servidor? Troque "localhost" pelo IP deste aparelho na rede (Windows: <code>ipconfig</code>; Android/Termux: <code>ip addr</code>) — ex.: http://192.168.0.10:8000/receive.php.</p>`;
  },

  /**
   * Conteúdo das 2 sub-abas dentro de "🟢 Node.js" — ver `_wireNodeSubTabs`.
   * "completo" = o passo a passo que já existia (receive.js, salva sozinho
   * no disco). "simples" = passo a passo extraído do arquivo enviado pelo
   * usuário ("passos node.js.docx": Node.js + pacote `http-server`, sem
   * script de salvamento nenhum — é só um servidor de arquivos estáticos,
   * exatamente como nos `iniciar_node.bat` que o usuário já tinha criado à
   * mão nesse mesmo formato).
   */
  _nodeSubTabContent(sub) {
    if (sub === 'simples') {
      return `
        <p style="font-size:12.5px; color:var(--text-dim); margin-top:4px">Só serve os arquivos do app pela rede (ex.: abrir o app do celular usando o endereço do PC) — <b>não</b> salva nada sozinho no disco. Para salvamento automático, use a sub-aba "💾 Servidor completo" acima.</p>
        <ol class="st-steps">
          <li>Baixe e instale o Node.js (versão LTS) em <a href="https://nodejs.org/" target="_blank" rel="noopener">nodejs.org</a>.</li>
          <li>Abra um terminal na pasta do projeto (onde está o index.html) e instale um servidor simples, uma única vez:<div class="st-cmd">npm install -g http-server</div></li>
          <li>Dentro da pasta do projeto, crie um arquivo de texto novo chamado <code>iniciar.bat</code> (mude a extensão de .txt para .bat) com o conteúdo:<div class="st-cmd">@off
echo Iniciando o Servidor Local...
start http://localhost:8080
http-server -p 8080
pause</div></li>
          <li>Pronto — dê dois cliques em <code>iniciar.bat</code>. Ele abre o servidor e o navegador automaticamente em <code>http://localhost:8080</code>.</li>
          <li>Quer abrir do celular pela mesma rede Wi-Fi? Descubra o IP do PC (Windows: <code>ipconfig</code>) e acesse, no celular:<div class="st-cmd">http://192.168.0.10:8080</div>(troque pelo IP mostrado no PC).</li>
        </ol>
        <p class="st-servertab-note"><b>No Mac:</b> crie um arquivo <code>iniciar.command</code> com o conteúdo:<div class="st-cmd">cd "$(dirname "$0")" && http-server -p 8080</div>e dê permissão de execução no terminal:<div class="st-cmd">chmod +x iniciar.command</div></p>
        <p class="st-servertab-note">Já baixe o <code>iniciar.bat</code> pronto: <button type="button" class="btn secondary sm st-download-server-node-simples" title="Baixar iniciar.bat pronto para dar dois cliques">⬇️ Baixar iniciar.bat</button></p>
        <p class="st-servertab-note"><b>Limitação:</b> essa forma não tem "salvamento automático"/sincronização entre aparelhos (não existe um receive.js/receive.php por trás) — use a exportação/backup do app normalmente. Serve principalmente para acessar o app por http:// em vez de file:// (ex.: usar a câmera do celular acessando o app do PC pela rede).</p>`;
    }
    // completo (sub-aba inicial) — conteúdo que já existia
    return `
      <p style="font-size:12.5px; color:var(--text-dim); margin-top:4px">O script já vem pronto, sem precisar instalar nenhuma biblioteca extra (só o Node.js em si).</p>
      <ol class="st-steps">
        <li>Baixe e instale o Node.js (versão LTS) em <a href="https://nodejs.org/" target="_blank" rel="noopener">nodejs.org</a>.</li>
        <li>Baixe o arquivo pronto deste app: <button type="button" class="btn secondary sm st-download-server-node" title="Baixar receive.js pronto para colocar no seu servidor">⬇️ Baixar arquivo do servidor (.js)</button></li>
        <li>Coloque o arquivo numa pasta, por exemplo <code>catalogo/</code>.</li>
        <li>Abra um terminal (Prompt de Comando/PowerShell/Terminal) DENTRO dessa pasta e rode:<div class="st-cmd">node receive.js</div>Deixe essa janela aberta enquanto for usar o app.</li>
        <li>Em "URL do servidor" (acima), use:<div class="st-cmd">http://localhost:8000/receive.php</div>(o script Node responde em qualquer caminho — pode manter ".../receive.php" mesmo sendo Node por trás, só para o campo continuar com a mesma cara de sempre.)</li>
      </ol>
      <p class="st-servertab-note"><b>No celular (Android, via Termux):</b> instale o <a href="https://termux.dev/" target="_blank" rel="noopener">Termux</a> e rode:<div class="st-cmd">pkg install nodejs</div>copie o receive.js baixado pra uma pasta (ex.: /sdcard/catalogo/), entre nela (<code>cd /sdcard/catalogo</code>) e rode <code>node receive.js</code>, do mesmo jeito do passo 4.</p>
      <p class="st-servertab-note"><b>Limitação desta versão Node.js:</b> cobre salvamento automático (individual/único + formatos extras .txt/.csv) e sincronização entre aparelhos, igual à versão PHP — só não envia email automaticamente ainda (a opção "servidor" de email continua precisando da versão PHP/XAMPP por enquanto).</p>`;
  },

  _downloadServerBundle() {
    // NOVO (07/09/2026), pedido verbatim do usuario: "retire as copias
    // embutidas do js/settings.js e deixe em arquivos separados em .js
    // (arquivo com apenas uma variavel com uma string de texto gigante)
    // mesmo para funcionar em 'file:///'. E deixar mais organizado e
    // estruturado." Conteudo agora mora em
    // js/serverbundles/receive-php-bundle.js (carregado ANTES deste
    // arquivo — ver index.html), gerado programaticamente a partir do
    // server/receive.php REAL (nunca mais digitado a mao aqui — elimina
    // o risco de esta copia ficar desatualizada de novo, como estava
    // antes desta rodada). O fallback (string curta) só aparece se, por
    // algum motivo, esse arquivo não tiver sido carregado.
    const receivePhp = window.RECEIVE_PHP_BUNDLE || '<?php\n// RECEIVE_PHP_BUNDLE não carregado — verifique se js/serverbundles/receive-php-bundle.js existe e foi incluído em index.html antes de settings.js.';
    const configPhp = `<?php
// config.php — configurações do modo servidor
define('DESTINO_EMAIL', 'seuemail@exemplo.com'); // para onde enviar
define('EMAIL_REMETENTE', 'catalogo@localhost');
// Se seu provedor exigir SMTP autenticado, adapte receive.php para usar
// PHPMailer (https://github.com/PHPMailer/PHPMailer) em vez de mail().
`;
    const readme = this._serverInstructions();

    Utils.downloadBlob(new Blob([receivePhp], { type: 'text/plain' }), 'receive.php');
    setTimeout(() => Utils.downloadBlob(new Blob([configPhp], { type: 'text/plain' }), 'config.php'), 300);
    setTimeout(() => Utils.downloadBlob(new Blob([readme], { type: 'text/plain' }), 'LEIA-ME-servidor.txt'), 600);
  },

  /**
   * Versão Node.js do servidor local (aba 🟢 Node.js) — mesma API que o app
   * já fala com receive.php ("salvar-item"/"listar"), sem precisar instalar
   * NENHUMA biblioteca externa (só `http`/`fs`/`path` do próprio Node). Não
   * envia email automaticamente (precisaria de um servidor SMTP configurado
   * à parte) — quem precisar disso agora deve usar a versão PHP/XAMPP.
   */
  _downloadServerBundleNode() {
    // NOVO (07/09/2026) — mesma explicação do bloco `receivePhp` acima
    // (ver comentário grande lá). Conteúdo agora mora em
    // js/serverbundles/receive-node-bundle.js, gerado a partir do
    // server/receive.js REAL.
    const receiveJs = window.RECEIVE_NODE_BUNDLE || '// receive.js\n// RECEIVE_NODE_BUNDLE não carregado — verifique se js/serverbundles/receive-node-bundle.js existe e foi incluído em index.html antes de settings.js.';
    Utils.downloadBlob(new Blob([receiveJs], { type: 'text/plain' }), 'receive.js');
    Utils.toast('receive.js baixado — rode "node receive.js" numa pasta com esse arquivo para subir o servidor.', { type: 'ok', duration: 5500 });
  },

  /** Baixa o `iniciar.bat` pronto da sub-aba "📁 Servidor simples
   *  (http-server)" — mesmo conteúdo do arquivo enviado pelo usuário
   *  ("passos node.js.docx") e igual ao `iniciar_node.bat` que ele já tinha
   *  criado à mão (não mexo nesse arquivo do usuário, só ofereço a mesma
   *  receita pronta para quem ainda não tem). Diferente do receive.js, este
   *  NÃO salva nada sozinho — só liga o `http-server` na pasta do app. */
  _downloadServerBundleNodeSimples() {
    const iniciarBat = `@echo off
echo Iniciando o Servidor Local...
:: Abre o navegador automaticamente no endereco local
start http://localhost:8080
:: Serve os arquivos desta pasta (onde estiver o index.html) via http-server
:: Instale uma vez, se ainda nao instalou: npm install -g http-server
http-server -p 8080
pause
`;
    Utils.downloadBlob(new Blob([iniciarBat], { type: 'text/plain' }), 'iniciar.bat');
    Utils.toast('iniciar.bat baixado — coloque na pasta do app (junto do index.html) e dê dois cliques nele.', { type: 'ok', duration: 5500 });
  },

  /**
   * Botão "📄 Baixar guia (texto)" ao lado das abas "Como montar o
   * servidor" — pedido do usuário: "Assim como esse arquivo está [o docx
   * enviado], coloque um pequeno botão para baixar as explicações textuais
   * formatadas também das 3 formas (PHP, XAMPP e as duas formas do Node)".
   * Gera UM arquivo .txt só, com as 4 formas (PHP / XAMPP / Node.js —
   * completo / Node.js — simples) formatadas como um guia passo a passo
   * (títulos, passos numerados e comandos destacados em bloco), no mesmo
   * espírito do arquivo .docx que o usuário mandou — sem depender de
   * nenhuma biblioteca de geração de .docx (o app não vendoriza uma, e o
   * conteúdo em si já é só texto/passos/comandos, sem formatação rica).
   */
  _downloadServerGuideText() {
    const linha = (ch = '=') => ch.repeat(60);
    const titulo = (t) => `\n${linha()}\n${t}\n${linha()}\n`;
    const subtitulo = (t) => `\n${t}\n${'-'.repeat(t.length)}\n`;
    const passos = (lista) => lista.map((p, i) => `  ${i + 1}. ${p}`).join('\n') + '\n';
    const cmd = (c) => `\n      ${c.split('\n').join('\n      ')}\n`;

    let txt = '';
    txt += titulo('CATALOGAÇÃO DE ITENS — GUIA: COMO MONTAR O SERVIDOR LOCAL');
    txt += '\nEscolha UMA das formas abaixo (não precisa montar todas). Cada uma\n';
    txt += 'permite salvar/sincronizar o catálogo automaticamente entre aparelhos,\n';
    txt += 'exceto a "Node.js — simples", que só serve os arquivos do app pela rede.\n';

    txt += titulo('1) PHP — servidor embutido');
    txt += '"Servidor embutido" do próprio PHP (comando "php -S") — não precisa\n';
    txt += 'instalar Apache nem nada além do PHP em si.\n';
    txt += subtitulo('Passos');
    txt += passos([
      'Baixe o PHP (gratuito) em https://www.php.net/downloads e instale — no Windows, descompacte o zip numa pasta (ex.: C:\\php) e adicione essa pasta ao PATH do sistema.',
      'Baixe os arquivos prontos deste app (botão "⬇️ Baixar arquivos do servidor (.php)" na aba PHP das Configurações): receive.php e config.php.',
      'Coloque os dois arquivos numa pasta, por exemplo catalogo/.',
      'Abra um terminal DENTRO dessa pasta e rode:' + cmd('php -S localhost:8000'),
      'Em "URL do servidor" (nas Configurações), use:' + cmd('http://localhost:8000/receive.php'),
    ]);
    txt += '\nNo celular (Android, via Termux): instale o Termux (https://termux.dev/) e rode:';
    txt += cmd('pkg install php\ntermux-setup-storage');
    txt += 'copie os dois arquivos baixados pra uma pasta (ex.: /sdcard/catalogo/), entre\n';
    txt += 'nela (cd /sdcard/catalogo) e rode o mesmo comando "php -S localhost:8000".\n';
    txt += '(iPhone/iOS não tem um equivalente direto ao Termux — use um PC com servidor.)\n';

    txt += titulo('2) XAMPP — pacote pronto (PHP + Apache)');
    txt += 'Pacote pronto com PHP + Apache e painel gráfico — sem usar terminal nenhum.\n';
    txt += 'Só para PC (Windows/Mac/Linux); não existe versão para celular.\n';
    txt += subtitulo('Passos');
    txt += passos([
      'Baixe e instale o XAMPP em https://www.apachefriends.org/',
      'Baixe os arquivos prontos deste app: receive.php e config.php.',
      'Copie os dois arquivos para:' + cmd('C:\\xampp\\htdocs\\catalogo\\') + '(crie a pasta "catalogo" se não existir).',
      '(Opcional) Abra config.php num editor de texto e preencha o email de destino, se for usar o envio automático por email.',
      'Abra o Painel de Controle do XAMPP e clique em "Start" ao lado de "Apache".',
      'Em "URL do servidor", use:' + cmd('http://localhost/catalogo/receive.php'),
    ]);

    txt += titulo('3) Node.js — servidor completo (salva no disco)');
    txt += 'Alternativa ao PHP — mesma ideia, usando Node.js. O script já vem pronto,\n';
    txt += 'sem precisar instalar nenhuma biblioteca extra (só o Node.js em si).\n';
    txt += subtitulo('Passos');
    txt += passos([
      'Baixe e instale o Node.js (versão LTS) em https://nodejs.org/',
      'Baixe o arquivo pronto deste app: receive.js.',
      'Coloque o arquivo numa pasta, por exemplo catalogo/.',
      'Abra um terminal DENTRO dessa pasta e rode:' + cmd('node receive.js') + 'Deixe essa janela aberta enquanto for usar o app.',
      'Em "URL do servidor", use:' + cmd('http://localhost:8000/receive.php') + '(o script Node responde em qualquer caminho — pode manter ".../receive.php" mesmo sendo Node por trás.)',
    ]);
    txt += '\nNo celular (Android, via Termux): instale o Termux e rode:';
    txt += cmd('pkg install nodejs');
    txt += 'copie o receive.js baixado pra uma pasta (ex.: /sdcard/catalogo/), entre nela\n';
    txt += '(cd /sdcard/catalogo) e rode "node receive.js".\n';
    txt += '\nLimitação: cobre salvamento automático e sincronização entre aparelhos,\n';
    txt += 'igual à versão PHP — só não envia email automaticamente ainda.\n';

    txt += titulo('4) Node.js — servidor simples (http-server)');
    txt += 'Só serve os arquivos do app pela rede (ex.: abrir do celular usando o\n';
    txt += 'endereço do PC) — NÃO salva nada sozinho no disco. Para salvamento\n';
    txt += 'automático, use a forma "3) Node.js — servidor completo" acima.\n';
    txt += subtitulo('Passos');
    txt += passos([
      'Baixe e instale o Node.js (versão LTS) em https://nodejs.org/',
      'Abra um terminal na pasta do projeto (onde está o index.html) e instale um servidor simples, uma única vez:' + cmd('npm install -g http-server'),
      'Dentro da pasta do projeto, crie um arquivo de texto novo chamado "iniciar.bat" (mude a extensão de .txt para .bat) com o conteúdo:' + cmd('@echo off\necho Iniciando o Servidor Local...\nstart http://localhost:8080\nhttp-server -p 8080\npause'),
      'Dê dois cliques em iniciar.bat. Ele abre o servidor e o navegador automaticamente em http://localhost:8080.',
      'Para abrir do celular pela mesma rede Wi-Fi, descubra o IP do PC (Windows: ipconfig) e acesse, no celular:' + cmd('http://192.168.0.10:8080') + '(troque pelo IP mostrado no PC).',
    ]);
    txt += '\nNo Mac: crie um arquivo "iniciar.command" com o conteúdo:';
    txt += cmd('cd "$(dirname "$0")" && http-server -p 8080');
    txt += 'e dê permissão de execução no terminal:';
    txt += cmd('chmod +x iniciar.command');

    txt += `\n${linha()}\nGerado por Catalogação de Itens em ${new Date().toISOString().slice(0, 10)}\n${linha()}\n`;

    Utils.downloadBlob(new Blob([txt], { type: 'text/plain' }), 'guia-servidor-local.txt');
    Utils.toast('Guia baixado (guia-servidor-local.txt) com as 4 formas de montar o servidor.', { type: 'ok', duration: 5000 });
  },

  /** Aplica TODO o lote de uma vez, com uma única regra de conflito
   *  ("aplicar a todos") — equivalente a DB.importItems(), só que rodando
   *  item a item por aqui mesmo (em vez de dentro de db.js) para poder
   *  capturar o "antes" de cada item alterado e o registro completo de cada
   *  item criado, e assim montar UM comando de desfazer para o lote inteiro
   *  (ver o push de History em #st-import logo abaixo). */
  async _importApplyAll(itens, onDuplicate) {
    let criados = 0, atualizados = 0, ignorados = 0;
    const criadosItens = [], atualizadosAntes = [];
    const total = (itens || []).length;
    let i = 0;
    for (const raw of itens || []) {
      i++;
      // "Salvando (N/total)..." + barrinha (pedido do usuário v310, item 2) —
      // este é o loop que de fato grava cada item importado no IndexedDB.
      if (total > 1) App.setBulkSaveStatus?.(`💾 Salvando (${i}/${total})…`, { current: i - 1, total });
      if (!raw || (!raw.id && !raw.patrimonio && !raw.descricao)) { ignorados++; continue; }
      const conflito = await DB.findImportConflict(raw);
      const r = await DB.applyImportDecision(raw, conflito, onDuplicate);
      if (r.tipo === 'criado') { criados++; criadosItens.push(r.item); }
      else if (r.tipo === 'atualizado') { atualizados++; atualizadosAntes.push({ before: conflito.existente, raw }); }
      else ignorados++;
    }
    return { criados, atualizados, ignorados, criadosItens, atualizadosAntes };
  },

  /** Revisão de import ITEM A ITEM — usada quando o usuário desmarca
   *  "aplicar a todos" na tela de conflitos. Itens sem conflito nenhum
   *  entram direto (sem perguntar); só os que colidem (mesmo ID ou mesmo
   *  patrimônio) abrem um modal individual, com a opção de parar a revisão
   *  a qualquer momento (o que já foi aplicado até ali permanece salvo). */
  async _importReviewOneByOne(itens) {
    let criados = 0, atualizados = 0, ignorados = 0;
    const criadosItens = [], atualizadosAntes = [];
    for (let i = 0; i < itens.length; i++) {
      const raw = itens[i];
      if (itens.length > 1) App.setBulkSaveStatus?.(`💾 Salvando (${i + 1}/${itens.length})…`, { current: i, total: itens.length });
      if (!raw || (!raw.id && !raw.patrimonio && !raw.descricao)) { ignorados++; continue; }
      const conflito = await DB.findImportConflict(raw);
      if (!conflito) {
        const r = await DB.applyImportDecision(raw, null, 'ambos');
        criados++;
        criadosItens.push(r.item);
        continue;
      }
      const ex = conflito.existente;
      const escolha = await Utils.showChoiceModal({
        title: `Conflito ${i + 1}/${itens.length}`,
        message: `Item do backup: "${raw.descricao || raw.tipo || 'sem descrição'}" (patrimônio: ${raw.patrimonio || '—'})\nJá cadastrado aqui: "${ex.descricao || ex.tipo || 'sem descrição'}" (patrimônio: ${ex.patrimonio || '—'}, setor: ${ex.setor || '—'}).\n\nO que fazer com este item?`,
        choices: [
          { value: 'ambos', label: '➕ Manter os dois' },
          { value: 'atualizar', label: '🔁 Atualizar o já existente', secondary: true },
          { value: 'pular', label: '⏭️ Pular este item', secondary: true },
          { value: 'cancelar', label: 'Parar a revisão (mantém o que já foi feito até aqui)', secondary: true, danger: true },
        ],
      });
      if (!escolha || escolha === 'cancelar') {
        Utils.toast(`Revisão interrompida — ${criados + atualizados} item(ns) já aplicados antes de parar.`, { type: 'warn' });
        break;
      }
      const r = await DB.applyImportDecision(raw, conflito, escolha);
      if (r.tipo === 'criado') { criados++; criadosItens.push(r.item); }
      else if (r.tipo === 'atualizado') { atualizados++; atualizadosAntes.push({ before: ex, raw }); }
      else ignorados++;
    }
    return { criados, atualizados, ignorados, criadosItens, atualizadosAntes };
  },
};

window.SettingsView = SettingsView;
