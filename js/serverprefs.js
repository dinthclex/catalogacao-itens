/**
 * serverprefs.js — NOVO (01/09/2026), item GRANDE #3 do pedido de 12 itens,
 * verbatim: "Deve ser possível guardar direto em arquivo pelo servidor
 * local, além do indexedDB. [...] Deve ser possível guardar em uma pasta
 * dentro do projeto (para caso se exclua os dados do navegador e não se
 * tenha 'exportado', então, seja possível recuperar tudo). As configurações
 * e opções de menu devem ser guardadas em um arquivo a parte, algo como
 * 'preferências do usuário'." Mensagem de acompanhamento, também verbatim:
 * "Deve funcionar independente de navegador."
 *
 * Duas responsabilidades, ambas em cima do MESMO servidor local que já
 * existia pro salvamento automático de itens (autosave.js) e sincronização
 * (sync.js) — reaproveita a mesma chave `servidorUrl`, sem nenhuma
 * configuração nova pra pessoa preencher:
 *
 * 1) PREFERÊNCIAS — sempre que uma opção de verdade muda (ver
 *    `SettingsView.CHAVES_PREFERENCIA`, mesma lista usada pelo botão
 *    "Redefinir padrões do app" — nunca estado/dado/identidade), db.js
 *    chama `scheduleSync()` (debounced, alguns segundos), que envia TODAS
 *    as preferências atuais pro servidor de uma vez (ação
 *    "salvar-preferencias" — ver server/receive.js), num arquivo SEPARADO
 *    (preferencias-usuario.json) do catálogo de itens.
 * 2) BACKUP COMPLETO — a cada alguns minutos (`start()`, chamado 1x no
 *    boot do app — ver app.js), envia um espelho de `DB.exportAll()`
 *    inteiro (ação "salvar-backup-completo") — é o que permite "recuperar
 *    tudo" depois (ver `restaurarDoServidor`, chamada pelo botão
 *    "⬇️ Restaurar tudo a partir do servidor" em Configurações → 💾
 *    Armazenamento no servidor — RENOMEADO em 07/09/2026, pedido do usuário)
 *    caso os dados do navegador sejam apagados sem um "exportar" manual
 *    ter sido feito antes.
 *
 * "Independente do navegador": o `server/receive.js` (novo, real, versionado
 * no projeto — ver esse arquivo) é um processo Node separado; uma vez
 * rodando, ele continua de pé e com os arquivos gravados em disco mesmo com
 * o navegador/aba FECHADOS — só reabrir o app depois (aqui ou noutro
 * aparelho) que ele volta a falar com o mesmo servidor.
 *
 * Sem `servidorUrl` configurada, este módulo inteiro não faz NADA (mesma
 * filosofia de autosave.js/sync.js) — o app continua 100% funcional só
 * localmente, e nenhuma das duas responsabilidades acima tenta se conectar
 * a lugar nenhum.
 */
const ServerPrefs = {
  // NOVO (07/09/2026), pedido verbatim: "já que estou rodando em um
  // servidor local. O próprio app deve se comunicar com o servidor. Usar
  // caminhos padrão e fazer configurações automaticamente de modo que se
  // possa 'ligar' o app ir fazendo as atividades e não se preocupar em
  // 'Configurar a URL do servidor local'." — separa duas ideias que
  // estavam misturadas na mesma seção de Configurações (pedido do usuário
  // na mesma mensagem, ver settings.js): "este app está rodando servido
  // por um servidor local" (esta função) é uma coisa; "conversar com
  // OUTROS aparelhos" (sync.js) é outra, e não depende desta detecção.
  //
  // Quando o app é aberto por http(s):// (em vez de file:///), é bem
  // provável que exista um receive.php/receive.js "colado" na mesma pasta
  // — é exatamente como as 4 formas documentadas em
  // server/LEIA-ME-servidor.txt funcionam (XAMPP copia receive.php pra
  // dentro de htdocs/catalogo/ JUNTO do resto do app; "php -S" serve a
  // pasta inteira, receive.php incluso). Por isso o CAMINHO PADRÃO tentado
  // é sempre "receive.php" na MESMA pasta de onde o app foi carregado
  // (resolvido com `new URL(...)`, então já reflete corretamente qualquer
  // sub-pasta, ex.: /catalogo/) — funciona tanto pra receive.php quanto pra
  // receive.js, já que a versão Node responde numa URL com QUALQUER nome
  // (ver receive.js — "o script Node responde em qualquer caminho").
  //
  // Só entra em ação (e só nesse caso) se: (a) o protocolo for http/https
  // (nunca em file:///, onde não existe "mesma pasta" nenhuma pra tentar) e
  // (b) 'servidorUrl' ainda estiver VAZIA — nunca sobrescreve uma URL já
  // configurada manualmente (ex.: apontando pra outro aparelho da rede, ou
  // pra uma porta customizada do Node.js, que este palpite não adivinharia).
  // A "sondagem" é uma chamada real à ação inofensiva 'status-armazenamento'
  // (só consulta, não muda nada) com um prazo curto (3s, via AbortController)
  // pra não atrasar o boot do app se não houver nada respondendo ali.
  //
  // RESSALVA (documentada aqui e explicada ao usuário no chat): como isto
  // roda a cada boot enquanto 'servidorUrl' estiver vazia, se a pessoa
  // limpar o campo manualmente pra "desligar" o servidor de propósito
  // enquanto o app continua sendo servido por http(s):// com um
  // receive.php/js respondendo ali, a próxima vez que abrir o app esta
  // função vai preencher a URL de novo sozinha — não existe hoje uma forma
  // de "recusar para sempre" separada de simplesmente trocar o cenário para
  // "sem servidor" nas Configurações (que continua funcionando: a URL fica
  // preenchida mas a seção correspondente fica escondida/inativa).
  async autoDetectarServidorLocal() {
    if (!/^https?:$/.test(location.protocol)) return { detectado: false, motivo: 'file' };
    const urlAtual = await DB.getSetting('servidorUrl', '');
    if (urlAtual) return { detectado: false, motivo: 'ja-configurado' };

    // BUG CORRIGIDO (07/09/2026), pedido verbatim: "Por que ainda aparece
    // estas mensagens: 'Não foi possível consultar o servidor agora...'...
    // No meu caso, estou usando o php com o comando executado na mesma
    // pasta do projeto (php -S 127.0.0.1:8000)... Como o nome do arquivo é
    // index.html, por ser 'index.html', então, ele é carregado." — causa
    // raiz: esta função só testava 1 candidato ("receive.php" na MESMA
    // pasta do index.html), mas no projeto real o receive.php/receive.js
    // fica dentro da subpasta "server/" (ver server/receive.php). Quando o
    // usuário roda "php -S" direto na raiz do projeto (sem copiar nada pra
    // fora), a URL correta é ".../server/receive.php", não ".../receive.php"
    // — por isso a detecção falhava silenciosamente, "servidorUrl" ficava
    // vazio, e "statusArmazenamento"/"itensFaltandoNoServidor"/
    // "listarArquivos" (cada um com "if (!url) return null") caíam nas 3
    // mensagens de erro relatadas. Agora testa uma LISTA de candidatos, na
    // ordem mais provável primeiro: "server/receive.php" (layout real deste
    // projeto, como entregue) e só depois "receive.php" (layout do XAMPP do
    // LEIA-ME, onde o arquivo é copiado pra fora da pasta "server/"). O
    // nome do arquivo ("receive.php") funciona também para quem usa
    // receive.js (Node), pois o servidor Node responde em qualquer caminho
    // — só a PASTA do candidato importa, não o nome do arquivo em si.
    const candidatos = [
      new URL('server/receive.php', location.href).href,
      new URL('receive.php', location.href).href,
    ];

    // NOVO (07/09/2026), pedido verbatim (debug): "coloque no console do
    // navegador tudo o que está sendo feito pelo servidor e em segundo
    // plano para eu ver o que está travando." — prefixo "[SERVIDOR]" em
    // TODO log deste arquivo, pra dar pra filtrar no console do navegador
    // (DevTools → aba Console → caixa de filtro → digitar "[SERVIDOR]").
    console.log(`[SERVIDOR] autoDetectarServidorLocal: testando ${candidatos.length} candidato(s)...`, candidatos);
    for (const candidata of candidatos) {
      const _dbgInicio = performance.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        console.log(`[SERVIDOR] autoDetectarServidorLocal: tentando ${candidata} ...`);
        const res = await fetch(candidata, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acao: 'status-armazenamento' }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) { console.log(`[SERVIDOR] autoDetectarServidorLocal: ${candidata} respondeu ${res.status} (não-ok) em ${(performance.now() - _dbgInicio).toFixed(0)}ms — tentando próximo candidato.`); continue; }
        const data = await res.json().catch(() => null);
        if (!data?.ok) { console.log(`[SERVIDOR] autoDetectarServidorLocal: ${candidata} respondeu sem 'ok' em ${(performance.now() - _dbgInicio).toFixed(0)}ms — tentando próximo candidato.`); continue; }

        await DB.setSetting('servidorUrl', candidata);
        // Também já marca o cenário como "com servidor" (mantendo PC/celular
        // já detectado — ver Utils.isMobileDevice() em settings.js) — sem
        // isto, a URL ficaria preenchida mas a seção continuaria escondida
        // (cenário ainda em "sem-servidor"), contrariando o pedido de "não se
        // preocupar em configurar".
        const cenarioAtual = await DB.getSetting('cenarioServidor', '');
        if (!cenarioAtual || cenarioAtual.endsWith('sem-servidor')) {
          await DB.setSetting('cenarioServidor', Utils.isMobileDevice() ? 'celular-com-servidor' : 'pc-com-servidor');
        }
        console.log(`[SERVIDOR] autoDetectarServidorLocal: ${candidata} respondeu OK em ${(performance.now() - _dbgInicio).toFixed(0)}ms — servidor detectado.`);
        window.EventLog?.log?.(`Servidor local detectado automaticamente em: ${candidata}`, { tipo: 'ok' });
        Utils.toast(`🖥️ Servidor local detectado automaticamente — arquivos serão guardados nele a partir de agora.`, { type: 'ok', duration: 5000 });
        return { detectado: true, url: candidata };
      } catch (e) {
        console.log(`[SERVIDOR] autoDetectarServidorLocal: ${candidata} FALHOU em ${(performance.now() - _dbgInicio).toFixed(0)}ms (${e.message}) — tentando próximo candidato.`);
        continue;
      }
    }
    console.log('[SERVIDOR] autoDetectarServidorLocal: nenhum candidato respondeu.');
    return { detectado: false, motivo: 'nenhum-candidato-respondeu' };
  },

  _backupTimer: null,
  _flushCheckTimer: null, // não usado mais (era do mecanismo de espelhamento automático, REMOVIDO) — só limpeza defensiva, ver stopAuto()
  _debouncedPush: null,

  // BUG CORRIGIDO (07/09/2026), pedido verbatim: "Quando estiver em um
  // servidor o backup automático de 'TUDO' não deve ser feito. O botão de
  // exportar já cumpre esta função (de fazer um backup)." + relato real de
  // travamento no console: um payload de 195455KB (~190MB!) levou 22842ms
  // (quase 23 SEGUNDOS) só no `JSON.stringify`, travando o navegador de
  // verdade. A rodada anterior (v407) já tinha tentado resolver isso
  // acumulando mudanças e enviando em LOTE (por tamanho/tempo) em vez de a
  // cada gravação — mas ainda assim, mais cedo ou mais tarde, rodava o
  // MESMO `DB.exportAll()`+`JSON.stringify` de TUDO, e com um catálogo
  // grande o payload ficou enorme demais pra isso não travar. REMOVIDO
  // POR COMPLETO nesta rodada: não existe mais NENHUM espelhamento
  // automático de "tudo" pro servidor — nem a cada gravação, nem em lote,
  // nem periódico. O backup completo (`_pushBackupCompleto`, mais abaixo)
  // só roda por AÇÃO EXPLÍCITA da pessoa: o botão "📤 Gravar tudo no
  // servidor" (`enviarTodosParaServidor`, mais abaixo) chama no final, e é
  // só isso — "só vai guardar tudo na pasta 'storage' do servidor se for
  // clicado no botão 'guardar tudo'", pedido verbatim. Salvamentos
  // automáticos continuam existindo, mas só por ITEM INDIVIDUAL (ver
  // `AutoSave.pushItem`, chamado direto de app.js pro item que acabou de
  // ser confirmado — nunca um payload gigante, e é exatamente "para as
  // coisas que estão em uso no momento", pedido verbatim desta mesma
  // conversa).

  /** Chamado 1x no boot do app (ver app.js, junto de SyncModule.startAuto/
   *  AutoExport.start). Não faz mais NENHUM envio automático de backup
   *  completo (ver "BUG CORRIGIDO 07/09/2026" acima) — mantido só por
   *  compatibilidade com quem chama (`app.js`), e como ponto único caso um
   *  futuro pedido volte a precisar de algo automático aqui. */
  async start() {
    this.stopAuto();
  },

  stopAuto() {
    if (this._flushCheckTimer) clearInterval(this._flushCheckTimer); // limpeza de um timer de versão anterior (v407), se ainda existir
    this._flushCheckTimer = null;
    if (this._backupTimer) clearInterval(this._backupTimer); // limpeza de um timer de versão ainda mais antiga, se ainda existir
    this._backupTimer = null;
  },

  /** Chamado por DB.setSetting/deleteSetting (ver db.js) toda vez que uma
   *  chave de PREFERÊNCIA de verdade muda (`SettingsView.CHAVES_PREFERENCIA`
   *  — db.js já filtra isso antes de chamar aqui, então esta função não
   *  precisa checar de novo). Debounced: mudar várias opções em sequência
   *  rápida (ex.: abrir Configurações e mexer em 5 campos seguidos) manda
   *  UM envio só, com o estado final, não um POST por tecla/clique. */
  scheduleSync() {
    if (!this._debouncedPush) this._debouncedPush = Utils.debounce(() => { this._pushPreferencias().catch(() => {}); }, 4000);
    this._debouncedPush();
  },

  async _pushPreferencias() {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) return;
    const _dbgInicio = performance.now();
    console.log('[SERVIDOR] _pushPreferencias: iniciando...');
    try {
      const preferencias = {};
      // Lê cada chave de novo (em vez de receber um "snapshot" de quem
      // chamou scheduleSync) de propósito — entre o momento em que o
      // debounce foi agendado e os 4s se passarem, outras preferências
      // podem ter mudado também; isto sempre manda o estado mais atual de
      // TODAS elas, nunca uma foto antiga de só a que disparou o debounce.
      for (const chave of SettingsView.CHAVES_PREFERENCIA) {
        preferencias[chave] = await DB.getSetting(chave, undefined);
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'salvar-preferencias', preferencias }),
      });
      console.log(`[SERVIDOR] _pushPreferencias: fetch respondeu ${res.status} em ${(performance.now() - _dbgInicio).toFixed(0)}ms.`);
      // `serverPrefsUltimaEm` é um TIMESTAMP OPERACIONAL (mesma categoria de
      // `syncUltimaEm`/`autoExportUltimoEm`), de propósito FORA de
      // `SettingsView.CHAVES_PREFERENCIA` — se estivesse dentro, gravar ele
      // aqui reagendaria este mesmo envio pra sempre (db.js chama
      // scheduleSync de novo a cada setSetting de uma chave da lista).
      if (res.ok) await DB.setSetting('serverPrefsUltimaEm', DB.nowISO());
    } catch (e) {
      console.log(`[SERVIDOR] _pushPreferencias: FALHOU após ${(performance.now() - _dbgInicio).toFixed(0)}ms (${e.message}).`);
      /* silencioso/não-bloqueante — mesmo padrão de autosave.js/sync.js */
    }
  },

  async _pushBackupCompleto() {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) return;
    // NOVO (07/09/2026), pedido verbatim (debug) — mede SEPARADAMENTE as 3
    // etapas pesadas desta função (exportAll, JSON.stringify, fetch), pra
    // apontar exatamente qual delas está travando: `DB.exportAll()` é
    // assíncrono mas o TRABALHO em si (montar o objeto com todos os itens/
    // fotos/mapas) pode demorar; `JSON.stringify` do resultado é 100%
    // SÍNCRONO — se o catálogo for grande (fotos em base64 inclusas), é o
    // candidato MAIS provável a travar a thread principal por um tempo
    // visível; `fetch` é assíncrono (rede, não trava a thread, só demora).
    console.log('[SERVIDOR] _pushBackupCompleto: iniciando (DB.exportAll())...');
    const _dbgInicio = performance.now();
    try {
      const backup = await DB.exportAll();
      const _dbgAposExport = performance.now();
      console.log(`[SERVIDOR] _pushBackupCompleto: DB.exportAll() concluído em ${(_dbgAposExport - _dbgInicio).toFixed(0)}ms — ${backup.items?.length || 0} itens, ${backup.mapPhotos?.length || 0} fotos, ${backup.maps?.length || 0} mapas, ${backup.objectModels?.length || 0} modelos 3D. Serializando (JSON.stringify, SÍNCRONO)...`);
      const corpo = JSON.stringify({ acao: 'salvar-backup-completo', backup });
      const _dbgAposStringify = performance.now();
      console.log(`[SERVIDOR] _pushBackupCompleto: JSON.stringify() concluído em ${(_dbgAposStringify - _dbgAposExport).toFixed(0)}ms — payload de ${(corpo.length / 1024).toFixed(0)}KB. Enviando ao servidor (fetch)...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: corpo,
      });
      console.log(`[SERVIDOR] _pushBackupCompleto: fetch respondeu ${res.status} em ${(performance.now() - _dbgAposStringify).toFixed(0)}ms — TOTAL da operação: ${(performance.now() - _dbgInicio).toFixed(0)}ms.`);
      if (res.ok) await DB.setSetting('serverBackupUltimaEm', DB.nowISO());
    } catch (e) {
      console.log(`[SERVIDOR] _pushBackupCompleto: FALHOU após ${(performance.now() - _dbgInicio).toFixed(0)}ms (${e.message}).`);
      /* silencioso/não-bloqueante */
    }
  },

  // HISTÓRICO (mantido pra contexto — NÃO reflete mais o comportamento
  // atual, ver "BUG CORRIGIDO 07/09/2026" logo acima de `start()`): rodadas
  // anteriores tentaram aproximar "guarda TUDO no servidor" automaticamente
  // (1x a cada gravação, depois em lote por tempo/tamanho) chamando
  // `_pushBackupCompleto()` sozinho em segundo plano. Isso foi REMOVIDO por
  // completo nesta rodada — o payload de "tudo" cresce junto com o
  // catálogo, e mesmo em lote acabou travando o navegador por >20s com um
  // catálogo grande (relatado pelo usuário). `_pushBackupCompleto()`
  // continua existindo, só que agora só roda por ação EXPLÍCITA da pessoa
  // (`enviarTodosParaServidor`, logo abaixo, chamada pelo botão "📤 Gravar
  // tudo no servidor").

  // NOVO (07/09/2026), pedido verbatim: "Se há algo no indexedDB e o app
  // está rodando em servidor e for verificado que o que está no indexedDB
  // não está no servidor, uma opção para gravar tudo no servidor deve
  // ficar disponível". Compara os itens do IndexedDB deste aparelho com o
  // que o servidor já tem no catálogo central (ação "listar", sem "desde" —
  // busca TODOS, não só os alterados recentemente) e devolve só os que
  // faltam lá (por ID único — nunca por patrimônio, mesmo critério do resto
  // do app). `null` se o servidor não responder (mesmo padrão do resto
  // deste arquivo) — quem chama trata como "não foi possível verificar
  // agora", não como "está tudo sincronizado".
  async itensFaltandoNoServidor() {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) return null;
    try {
      const [resLocal, resServidor] = await Promise.all([
        DB.getAllItems(),
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'listar' }) }),
      ]);
      if (!resServidor.ok) return null;
      const dataServidor = await resServidor.json();
      const idsNoServidor = new Set((dataServidor.itens || []).map((it) => it.id));
      return resLocal.filter((it) => !idsNoServidor.has(it.id));
    } catch (e) { return null; }
  },

  // Botão "📤 Gravar tudo no servidor" — envia CADA item faltando (ver
  // `itensFaltandoNoServidor` acima) individualmente com `force: true`
  // (ignora o "salvamento automático" estar desligado — ver autosave.js) +
  // `silent: true` (um toast só, no final, em vez de um por item), e por
  // fim dispara um backup completo imediato (não-debounced, ver
  // `_pushBackupCompleto`) pra cobrir também mapas/tipos/setores/fotos/
  // configurações, não só os itens do catálogo. `onProgresso(atual, total)`
  // opcional, pra settings.js atualizar uma barra/contador na tela.
  async enviarTodosParaServidor(itensFaltando, onProgresso) {
    const total = itensFaltando.length;
    let enviados = 0;
    let falhas = 0;
    for (let i = 0; i < itensFaltando.length; i++) {
      const r = await AutoSave.pushItem(itensFaltando[i], { force: true, silent: true });
      if (r.enviado) enviados++; else falhas++;
      onProgresso?.(i + 1, total);
    }
    await this._pushBackupCompleto().catch(() => {});
    return { enviados, falhas, total };
  },

  // NOVO (07/09/2026), pedido verbatim: "a estrutura de pastas deve ser
  // mostrada (com ícones de pastas e clicável e interagível)" — ver ação
  // "listar-arquivos" em server/receive.js/receive.php. `null` se o
  // servidor não responder (mesmo padrão do resto deste arquivo).
  async listarArquivos() {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) return null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'listar-arquivos' }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.ok ? data : null;
    } catch (e) { return null; }
  },

  /** Botão "⬇️ Restaurar tudo a partir do servidor" (Configurações → 💾
   *  Armazenamento no servidor) — pedido verbatim: "para caso se exclua os dados do navegador e
   *  não se tenha 'exportado', então, seja possível recuperar tudo". Busca
   *  o `backup-completo.json` mais recente salvo pelo servidor (ação
   *  "carregar-backup-completo") e REAPROVEITA o fluxo de importação de
   *  backup já existente e testado (`#st-import` onchange, settings.js) —
   *  em vez de duplicar toda aquela lógica (mesclagem de mapas, conflito de
   *  itens, barra de progresso, etc.), monta um `File` em memória com o
   *  JSON recebido e dispara o MESMO `<input type=file>` via `DataTransfer`
   *  + evento `change` sintético. `container` é o container da tela de
   *  Configurações (pra achar o `#st-import` — precisa estar montada). */
  // NOVO (03/09/2026) — Pedido do usuário: "deve ser possível configurar [a
  // pasta onde o servidor guarda os arquivos]. Por padrão é em uma pasta
  // dentro do app [...] Isto deve ficar claro visualmente." Duas funções
  // novas, ambas conversando com as ações NOVAS de mesmo nome em
  // server/receive.js/receive.php (ver comentário grande lá):
  //  - `statusArmazenamento()`: só CONSULTA (sem alterar nada) o caminho
  //    real, em disco, onde os arquivos estão sendo gravados agora — usado
  //    por settings.js pra exibir isto na tela (o "ficar claro visualmente"
  //    do pedido). Silencioso em caso de falha (servidor offline etc.) —
  //    mesmo padrão do resto deste arquivo — devolve `null` nesse caso.
  //  - `configurarPastaDados(pasta)`: ALTERA a pasta configurada no servidor
  //    (string vazia = volta pro padrão). Chamado pelo botão "💾 Salvar
  //    pasta" da tela de Configurações.
  async statusArmazenamento() {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) return null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'status-armazenamento' }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.ok ? data : null;
    } catch (e) { return null; }
  },

  async configurarPastaDados(pasta) {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) { Utils.toast('Configure a URL do servidor local primeiro.', { type: 'warn' }); return null; }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'configurar-pasta-dados', pastaDados: pasta }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) { Utils.toast('Falha ao configurar a pasta: ' + (data?.erro || res.status), { type: 'danger' }); return null; }
      Utils.toast('Pasta de dados do servidor atualizada ✓', { type: 'ok' });
      return data;
    } catch (e) {
      Utils.toast('Falha ao configurar a pasta: ' + e.message, { type: 'danger' });
      return null;
    }
  },

  async restaurarDoServidor(container) {
    const url = await DB.getSetting('servidorUrl', '');
    if (!url) { Utils.toast('Configure a URL do servidor local em Configurações primeiro.', { type: 'warn' }); return; }
    if (!confirm('Buscar o backup completo salvo no servidor local e importar aqui?\n\nIsto NÃO apaga nada já cadastrado neste aparelho — item duplicado será perguntado, igual à importação normal de um arquivo (⬆️ Importar backup).')) return;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'carregar-backup-completo' }),
      });
      if (!res.ok) throw new Error(`Servidor respondeu ${res.status}`);
      const data = await res.json();
      if (!data.backup) { Utils.toast('O servidor local ainda não tem nenhum backup completo salvo.', { type: 'warn' }); return; }
      const blob = new Blob([JSON.stringify(data.backup)], { type: 'application/json' });
      const file = new File([blob], 'backup-completo-servidor.json', { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = container?.querySelector?.('#st-import');
      if (!input) { Utils.toast('Abra as Configurações antes de restaurar.', { type: 'warn' }); return; }
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    } catch (e) {
      Utils.toast('Falha ao buscar o backup do servidor: ' + e.message, { type: 'danger' });
    }
  },
};
window.ServerPrefs = ServerPrefs;
