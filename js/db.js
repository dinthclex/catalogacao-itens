/**
 * db.js — Camada de dados local (IndexedDB).
 * Guarda itens, tipos cadastrados, setores, ambientes/mapas e configurações.
 * Projetada para escalar a milhares de itens (índices por patrimônio, tipo, setor, ambiente).
 *
 * ---- Cache em RAM (leitura instantânea) + gravação sempre imediata no disco ----
 * Cada store (items/types/sectors/maps/mapPhotos/settings) é carregada do
 * IndexedDB só UMA VEZ por recarregamento de página — na primeira leitura
 * feita nela, não importa qual view chamou primeiro — e fica guardada num
 * Map em memória (ver `makeStoreCache` abaixo). Toda leitura depois disso
 * (DB.getAllItems, DB.getItem, DB.getAllTypes, DB.getSetting, ...) responde
 * na hora, sem tocar o disco de novo — é por isso que trocar de tela
 * (Tabela/Cartões/Buscar) não relê o banco a cada troca.
 *
 * Isto é um cache "write-THROUGH", não "write-back": toda gravação
 * (addItem/updateItem/deleteItem/setSetting/...) continua indo pro
 * IndexedDB IMEDIATAMENTE, do mesmo jeito que sempre foi — o cache em RAM
 * só é atualizado DEPOIS que o disco confirmou a gravação, nunca antes e
 * nunca em lote/atrasado. Um cache write-BACK (que só grava no disco de
 * vez em quando, tipo página de memória de SO) seria mais rápido pra
 * gravar, mas arriscaria perder o que só estava em RAM se a aba fechar/
 * travar antes dessa gravação em lote — inaceitável para um catálogo de
 * patrimônio. Aqui não existe essa janela de risco: qualquer gravação
 * confirmada pelo app já está no disco.
 *
 * Cada método de leitura devolve sempre uma CÓPIA rasa (`{...registro}`)
 * do que está no cache, nunca a referência guardada nele — assim, se algum
 * código de tela alterar o objeto recebido (ex.: `item.foo = 'x'` só pra
 * uso local), isso NUNCA corrompe o cache silenciosamente (o cache só muda
 * através dos métodos de escrita abaixo, sempre depois de confirmar no
 * disco).
 *
 * Nota sobre múltiplas abas: se você abrir este app em duas abas ao mesmo
 * tempo no MESMO aparelho, cada aba tem seu próprio cache em RAM — uma
 * gravação feita numa aba não aparece automaticamente na outra até essa
 * outra ser recarregada (F5). Entre APARELHOS diferentes isso não muda em
 * nada: a sincronização via servidor (ver sync.js) chama DB.mergeFromRemote
 * normalmente, que atualiza o cache desta aba do jeito de sempre.
 *
 * [11/09/2026] ÍNDICE DE FUNÇÕES — cabeçalho adicionado pra evitar buscas
 * exaustivas (mesmo padrão de ambientephotos.js/mapping.js).
 *
 * Helpers de módulo (fora do objeto `DB`, no topo do arquivo):
 * - openDB: abre/faz upgrade do IndexedDB (cria stores/índices na 1ª vez).
 * - onSaveStatus/_emitSaveStatus: assinatura/emissão do indicador "salvando…
 *   /salvo" da barra de status (ver infobar.js).
 * - _notifyDbError: toast padronizado de erro de banco (storage cheio etc.).
 * - tx: helper de transação IndexedDB (Promise em cima de `IDBTransaction`).
 * - _flushMapSave/flushPendingMapSaves: força a gravação de um `saveMap`
 *   debounced pendente (ex. antes de fechar a aba/trocar de tela).
 * - reqToPromise: `IDBRequest` -> Promise.
 * - uuid/nowISO: geração de id/timestamp ISO usados em todo registro novo.
 * - tokenize: normaliza string pra índice de busca (search.js).
 * - cloneRec: cópia rasa de um registro (nunca devolve a referência do cache).
 * - makeStoreCache: fábrica do cache em RAM write-through (1 por store) —
 *   núcleo do mecanismo descrito no comentário grande acima.
 * - _chaveObjectModel: chave composta tipo+nível pra cache de modelos 3D.
 *
 * DB (objeto — API pública usada por toda a aplicação):
 * - _invalidateDupCache/computeConferenciaId/getDuplicatePatrimonios: cache e
 *   cálculo de patrimônios DUPLICADOS (mesmo número cadastrado 2x).
 * - addItem/updateItem/deleteItem/putItemRaw: CRUD de um item catalogado.
 * - addFotoMarcacaoAoItem/addMapaMarcacaoAoItem: anexa ao item uma marcação
 *   feita numa foto/no mapa (ver ambientephotos.js/mapview.js).
 * - mergeFromRemote: aplica um item vindo do servidor (sync.js), resolvendo
 *   conflito por `modificadoEm` mais recente.
 * - touchLastConsulted: atualiza "última vez visto" de um item (histórico).
 * - getItem/getItemByPatrimonio/countItems/getItemsPage/searchItems/
 *   getItemsSince/getItemsByAmbiente/getAllItems/getAllSummaries: leituras
 *   de item — página/busca/filtro por ambiente/lista resumida pra tabela.
 * - touchType/getAllTypes/deleteType, touchSector/getAllSectors/deleteSector:
 *   CRUD de tipos e setores cadastrados (autocompletar do formulário).
 * - saveMap (debounced)/getMapSaveDebounceMs/setMapSaveDebounceMs: grava o
 *   mapa (2D/3D) — atrasado por padrão pra não regravar a cada pixel de
 *   arraste; `_flushMapSave` acima força a gravação imediata quando preciso.
 * - getMap/getAllMaps/getOrCreateSingleMap/addMap/setCurrentMap/deleteMap:
 *   CRUD de mapas/ambientes (inclui hierarquia de sub-ambientes).
 * - addAmbientePhoto/saveAmbientePhoto/getAmbientePhoto/getPhotosByAmbiente/
 *   getAllAmbientePhotos: CRUD de fotos de ambiente ("orb de foto" no mapa
 *   2D/3D e fotos de patrimônio — ver `tipo` no registro).
 * - findOrbFotoByItem: acha a foto-orb (se houver) associada a um item.
 * - deleteAmbientePhoto: remove uma foto (e desfaz vínculos dependentes).
 * - getSetting/setSetting/deleteSetting/getAllSettings: preferências do app
 *   (chave/valor) — usado por TODA tela pra persistir UI/config do usuário.
 * - getObjectModel/getObjectModelsForTipo/getAllObjectModels/setObjectModel/
 *   deleteObjectModel: modelos 3D customizados por tipo/nível de objeto.
 * - requestPersistentStorage/isStoragePersisted/storageEstimate: API do
 *   navegador pra armazenamento persistente/quota (ver storagestatus.js).
 * - exportAll: monta o dump completo do banco (backup/exportação).
 * - countMapConflicts/findMapConflicts/countLinkedToMap/importMaps/
 *   importSupplementary: fluxo de IMPORTAÇÃO de mapas de um backup/outro
 *   dispositivo, com detecção/resolução de conflito (mapa já existe etc.).
 * - findImportConflict/applyImportDecision/countImportConflicts/importItems:
 *   mesmo fluxo de conflito, só que pra ITENS (patrimônios) importados.
 * - savePerspMatchSession/getPerspMatchSession/getPerspMatchSessionsForMapa/
 *   deletePerspMatchSession: CRUD de sessões salvas do antigo "Camera Match"
 *   (js/perspmatch.js — tela desligada, mas os dados/API continuam aqui).
 *
 * ---- Erros sempre notificados ----
 * Toda operação (leitura OU gravação) passa por `tx()` abaixo — qualquer
 * falha aí (banco corrompido, quota estourada, transação abortada, etc.)
 * dispara um toast de aviso (ver `_notifyDbError`) além de continuar
 * rejeitando a Promise normalmente pra quem chamou tratar como já tratava.
 * Sem isso, uma falha de leitura/gravação em algum canto do app passava
 * batido, silenciosa, como uma promessa rejeitada que ninguém viu.
 */

const DB_NAME = 'catalogacao_itens_db';
// [10/09/2026] Implementação da spec 'Camera Matching / Persp Match'
// solicitada pelo usuário: bump de versão (4 -> 5) pra criar a store nova
// `perspMatchSessions` (ver onupgradeneeded logo abaixo) — guarda a sessão de
// calibração (foto + EXIF + linhas de fuga + âncoras de escala + pose
// calculada) à PARTE dos objetos normais do mapa, no mesmo espírito de
// `mapPhotos` (fotos pesadas não devem viver dentro do documento do mapa,
// que é salvo com muita frequência).
const DB_VERSION = 5;

const STORES = {
  items: 'items',
  types: 'types',
  sectors: 'sectors',
  maps: 'maps',
  mapPhotos: 'mapPhotos',
  settings: 'settings',
  // NOVO (01/09/2026), item GRANDE #5: modelos 3D customizados POR TIPO (não
  // por objeto individual — isso já existe via `obj.customMesh`, feito no
  // Modeler3D de sempre). Cada registro é UM nível (detalhado OU lowpoly) de
  // UM tipo, com `id` = `${tipo}__${nivel}` (ver `_chaveObjectModel` abaixo)
  // — assim dois `put()` do mesmo tipo em níveis diferentes nunca colidem, e
  // dá pra ler/gravar cada nível independente sem precisar reescrever o
  // outro.
  objectModels: 'objectModels',
  // [10/09/2026] Sessões de "📐 Camera Match" — ver js/perspmatch.js e a
  // especificação salva no projeto ('spec-camera-matching-persp-match.md').
  // Uma sessão é uma UNIDADE por foto (nunca um objeto do mapa em si — ver
  // comentário grande no CRUD abaixo).
  perspMatchSessions: 'perspMatchSessions',
};

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const upgradeTx = req.transaction;

      if (!db.objectStoreNames.contains(STORES.items)) {
        const items = db.createObjectStore(STORES.items, { keyPath: 'id' });
        items.createIndex('patrimonio', 'patrimonio', { unique: false });
        items.createIndex('tipo', 'tipo', { unique: false });
        items.createIndex('setor', 'setor', { unique: false });
        items.createIndex('ambienteId', 'ambienteId', { unique: false });
        items.createIndex('criadoEm', 'criadoEm', { unique: false });
        items.createIndex('modificadoEm', 'modificadoEm', { unique: false });
        items.createIndex('ultimaConsultaEm', 'ultimaConsultaEm', { unique: false });
        // índice composto simples para busca textual pré-tokenizada
        items.createIndex('buscaTokens', 'buscaTokens', { unique: false, multiEntry: true });
        // aparelho/sessão que originou o item — usado na sincronização entre múltiplos PCs/celulares
        items.createIndex('origemSessaoId', 'origemSessaoId', { unique: false });
      } else if (ev.oldVersion < 2) {
        // migração: bancos criados antes da v2 já têm a store "items", só falta o índice novo
        const items = upgradeTx.objectStore(STORES.items);
        if (!items.indexNames.contains('origemSessaoId')) {
          items.createIndex('origemSessaoId', 'origemSessaoId', { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(STORES.types)) {
        const types = db.createObjectStore(STORES.types, { keyPath: 'nome' });
        types.createIndex('usos', 'usos', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.sectors)) {
        db.createObjectStore(STORES.sectors, { keyPath: 'nome' });
      }

      if (!db.objectStoreNames.contains(STORES.maps)) {
        db.createObjectStore(STORES.maps, { keyPath: 'id' });
      }

      // Fotos do ambiente (foto do lugar, com zoom/pan e "orbs" marcados nela,
      // cada um associado a um item) — ver ambientephotos.js. Guardadas numa
      // store própria (não dentro do objeto do mapa) porque o mapa é salvo com
      // frequência (paredes/trilha mudando o tempo todo no modo assistido) e
      // as fotos são pesadas (dataURL) — juntar tudo faria toda gravação do
      // mapa reescrever todas as fotos à toa.
      if (!db.objectStoreNames.contains(STORES.mapPhotos)) {
        const mapPhotos = db.createObjectStore(STORES.mapPhotos, { keyPath: 'id' });
        mapPhotos.createIndex('ambienteId', 'ambienteId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }

      // NOVO (01/09/2026), item GRANDE #5 do pedido de 12 itens: "editar o
      // modelo dos objetos 3D padrão [...] dois modelos: um mais detalhado e
      // um low poly" — store nova, ver comentário grande em STORES acima.
      if (!db.objectStoreNames.contains(STORES.objectModels)) {
        const objectModels = db.createObjectStore(STORES.objectModels, { keyPath: 'id' });
        objectModels.createIndex('tipo', 'tipo', { unique: false });
      }

      // [10/09/2026] Implementação da spec 'Camera Matching / Persp Match':
      // store nova para as sessões de calibração por foto — ver comentário
      // grande em STORES.perspMatchSessions acima e no CRUD mais abaixo
      // ('---------- PERSP MATCH ----------').
      if (!db.objectStoreNames.contains(STORES.perspMatchSessions)) {
        const perspMatch = db.createObjectStore(STORES.perspMatchSessions, { keyPath: 'id' });
        perspMatch.createIndex('mapaId', 'mapaId', { unique: false });
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      // Permite várias abas/janelas deste app abertas AO MESMO TEMPO sem
      // conflito: se, mais tarde, uma aba nova abrir uma versão mais nova do
      // app (DB_VERSION maior), o navegador avisa TODAS as conexões antigas
      // via "versionchange" antes de deixar a nova aba prosseguir. Sem este
      // handler, esta aba ficaria seguraando o banco e bloquearia a outra aba
      // indefinidamente (foi exatamente esse o bug relatado). Fechando aqui,
      // a outra aba consegue abrir na hora — e avisamos quem estiver usando
      // esta aba para recarregar quando puder (ela para de conseguir salvar
      // depois deste fechamento).
      db.onversionchange = () => {
        db.close();
        _dbPromise = null;
        window.dispatchEvent(new CustomEvent('catalogo:db-desatualizado'));
      };
      resolve(db);
    };
    req.onerror = () => { _notifyDbError(req.error, 'abrir banco local'); reject(req.error); };
    // Só acontece se ainda existir uma conexão de uma aba que NÃO trata
    // "versionchange" (ex.: uma aba com uma versão do app anterior a esta
    // correção). Nesse caso específico ainda não tem como evitar a espera —
    // por isso quem chama openDB() (app.js) tem um prazo próprio para não
    // travar a UI pra sempre.
    req.onblocked = () => {
      console.warn('Abertura do banco local bloqueada — feche outras abas/janelas deste app e recarregue.');
      if (window.Utils && typeof Utils.toast === 'function') {
        Utils.toast('⚠️ Não foi possível abrir o banco local — feche outras abas/janelas deste app e recarregue a página.', { type: 'warn', duration: 8000 });
      }
    };
  });
  return _dbPromise;
}

// ---------- Status de gravação (pedido do usuário: mensagem no topo do
// cabeçalho quando algo está sendo salvo/já foi salvo, e ONDE) ----------
// Toda gravação de verdade passa por `tx()` com mode 'readwrite' (addItem/
// updateItem/deleteItem/saveMap/setSetting/... — TODOS os métodos de
// escrita do DBApi, sem exceção, já que nenhum deles grava sem passar por
// aqui) — então ligar o aviso bem AQUI, num só lugar, cobre a gravação
// inteira do app de uma vez, sem precisar espalhar chamadas em cada método
// (e sem risco de esquecer um novo método de escrita no futuro). Quem quiser
// mostrar isso na tela assina com `DB.onSaveStatus(cb)` — ver app.js, que
// desenha a mensagem no topo do cabeçalho (fora do vanilla-JS "singleton
// global" de sempre, mas o mesmo padrão pub/sub simples usado noutros
// cantos do app, ex.: EventLog). `cb(status, info)`: status é 'saving' |
// 'saved' | 'error'; `info.where` é sempre 'IndexedDB (banco de dados do
// navegador)' — é a ÚNICA gravação de verdade que passa por aqui (o app
// também guarda uma cópia leve de patrimônio/tipo/setor em `localStorage`
// só pra backup rápido — ver LocalBackup.pushItem em app.js — mas essa
// cópia é best-effort e não representativa da gravação "de verdade", que é
// sempre esta aqui).
const _saveStatusListeners = new Set();
function onSaveStatus(cb) {
  if (typeof cb !== 'function') return () => {};
  _saveStatusListeners.add(cb);
  return () => _saveStatusListeners.delete(cb);
}

// NOVO (07/09/2026), pedido verbatim: "já que está rodando em um servidor
// local, então, deve guardar as coisas nele (na sua pasta de dados). E a
// mensagem fica [...] 'Salvo - no dispositivo (banco de dados do servidor
// local)'. Se os dois estiverem habilitados para guardar (ou seja, o
// indexedDB também), então, a mensagem deve mencionar que foi nos dois
// 'IndexedDB' e 'Dispositivo local'." — `_emitSaveStatus` roda a cada
// gravação de verdade (`tx()` abaixo), SÍNCRONO, então não dá pra consultar
// `DB.getSetting` (assíncrono, e é o PRÓPRIO IndexedDB) ali dentro. Este
// cache em memória guarda as chaves relevantes, populado 1x quando o banco
// abre e mantido atualizado por `setSetting()` sempre que uma delas muda
// (ver mais abaixo).
// MUDADO (07/09/2026), pedido verbatim: "além da opção 'Guardar no
// IndexedDB', deve ter a opção de 'guardar no servidor'. Uma sempre deve
// ficar ativa ou as duas. Por padrão, agora, o IndexedDB deve ficar
// marcado e, mesmo rodando em um servidor, a opção de 'guardar no
// servidor' fica desmarcada por padrão." — troca 'espelharIndexedDB' (a
// ideia antiga era "servidor é o destino principal, IndexedDB é o mirror
// opcional") por 2 chaves independentes: 'guardarIndexedDB' (novo,
// 'guardarNoIndexedDB' — default true, ver settings.js/DEFAULTS) e
// 'guardarServidor' (reaproveita a chave JÁ EXISTENTE 'autoSaveAtivo' —
// "Salvar cada item automaticamente no servidor local", ver autosave.js —
// em vez de criar uma 3ª chave fazendo a mesma coisa; settings.js agora
// mostra um checkbox pra ela também dentro do card "Armazenamento no
// servidor", além do já existente em "Salvamento automático em arquivo").
const _saveDestinoCache = { servidorUrl: '', guardarIndexedDB: true, guardarServidor: false };
// A população inicial deste cache (lendo `_settingsCache.ensure()`) fica
// logo ABAIXO de `_settingsCache` ser declarado mais adiante neste arquivo
// (é um `const`, então referenciá-lo aqui em cima ainda não existiria —
// "temporal dead zone") — ver o bloco perto de `makeStoreCache(STORES.settings, 'key')`.

// BUG CORRIGIDO (07/09/2026), pedido verbatim: "Quando estiver em um
// servidor o backup automático de 'TUDO' não deve ser feito. O botão de
// exportar já cumpre esta função (de fazer um backup)." + relato de
// travamento real no console: "[SERVIDOR] _pushBackupCompleto:
// JSON.stringify() concluído em 22842ms — payload de 195455KB [...] Deu
// para ver que enviou ~195MB em 22s com o navegador travado (ficou
// travado mesmo)." — a rodada anterior (v407) tinha trocado "espelhar TUDO
// a cada gravação" por "acumular e enviar em LOTE" (por tamanho/tempo),
// mas ainda assim, mais cedo ou mais tarde, o mesmo `DB.exportAll()` +
// `JSON.stringify` de TUDO (itens+fotos em base64+mapas+modelos 3D) rodava
// — só que com menos frequência, o payload ficou ENORME (195MB), e
// `JSON.stringify` de um payload desse tamanho é MUITO mais lento que o
// tempo total economizado por rodar com menos frequência (22.8s travado de
// uma vez, pior do que travamentos menores e mais frequentes). CORRIGIDO
// AGORA: o espelhamento automático de TUDO foi REMOVIDO POR COMPLETO (nem
// em lote) — `_emitSaveStatus` não aciona mais nada no ServerPrefs. O
// backup completo pro servidor só acontece por AÇÃO EXPLÍCITA da pessoa
// (botão "📤 Gravar tudo no servidor", ver serverprefs.js
// `enviarTodosParaServidor`/`_pushBackupCompleto`) — o "botão de exportar"
// citado pelo usuário (⬇️ Exportar backup, download local) continua
// cobrindo o caso de backup manual de tudo, sem depender do servidor.
// Salvamentos automáticos de ITEM INDIVIDUAL continuam existindo
// normalmente (ver `AutoSave.pushItem`, chamado em app.js só pro item que
// acabou de ser confirmado — "para as coisas que estão em uso no
// momento", pedido verbatim) — isto NUNCA foi o que travava (payload de 1
// item é pequeno), só o espelho de TUDO.
function _emitSaveStatus(status) {
  // "Uma sempre deve ficar ativa ou as duas" (pedido verbatim, garantido
  // pela UI em settings.js — não deixa desmarcar as duas ao mesmo tempo).
  const guardarServidor = !!(_saveDestinoCache.servidorUrl && _saveDestinoCache.guardarServidor);
  const guardarIndexedDB = !!_saveDestinoCache.guardarIndexedDB;
  // ATENÇÃO: tecnicamente o IndexedDB continua sendo gravado SEMPRE (é o
  // banco que TODA a interface do app lê pra mostrar tabela/busca/mapa —
  // desligar isso de verdade quebraria o app inteiro, não é uma opção
  // real) — o checkbox "Guardar no IndexedDB" (e a mensagem abaixo) reflete
  // só QUAIS destinos contam como "oficiais" pra pessoa, não uma escolha
  // técnica real de onde os dados ficam guardados.
  let where;
  if (guardarServidor && guardarIndexedDB) where = 'servidor local + IndexedDB (banco de dados do navegador)';
  else if (guardarServidor) where = 'no dispositivo (banco de dados do servidor local)';
  else where = 'IndexedDB (banco de dados do navegador)';
  const info = { where, servidorAtivo: guardarServidor };
  _saveStatusListeners.forEach((cb) => {
    try { cb(status, info); } catch (e) { console.error('Erro num listener de DB.onSaveStatus:', e); }
  });
}

// ---------- Notificação centralizada de erro (ver comentário no topo do arquivo) ----------
let _lastDbErrorMsg = '';
let _lastDbErrorAt = 0;
function _notifyDbError(err, contexto) {
  const msg = (err && err.message) || String(err || 'Erro desconhecido');
  const agora = Date.now();
  // Evita "spam" de toasts idênticos quando várias operações falham quase ao
  // mesmo tempo (ex.: excluir vários itens em lote com o disco sem espaço) —
  // um aviso já visível de sobra pra entender que algo deu errado; a mesma
  // mensagem só aparece de novo depois de 4s sem repetir.
  if (msg === _lastDbErrorMsg && (agora - _lastDbErrorAt) < 4000) return;
  _lastDbErrorMsg = msg; _lastDbErrorAt = agora;
  console.error(`Erro no banco de dados (${contexto}):`, err);
  if (window.Utils && typeof Utils.toast === 'function') {
    Utils.toast(`⚠️ Erro ao acessar o banco de dados: ${msg}`, { type: 'danger', duration: 6000 });
  }
  window.EventLog?.log?.(`Erro no banco de dados (${contexto}): ${msg}`, { tipo: 'erro' });
}

// NOVO (07/09/2026), pedido verbatim (debug): "para debug coloque no
// console do navegador tudo o que está sendo feito pelo servidor e em
// segundo plano para eu ver o que está travando." — cada transação do
// IndexedDB (leitura OU escrita) agora loga início/duração no console, com
// o prefixo "[DB]" — inclui o 1º "ensure()" de cada store (`makeStoreCache`
// abaixo), que lê TUDO daquele store de uma vez (o candidato mais provável
// pra "travar no início", se o catálogo tiver muitos itens/fotos em
// base64). `performance.now()` (não `Date.now()`) pra precisão de
// milissegundos sem depender do relógio do sistema.
function tx(storeNames, mode, fn) {
  const isWrite = mode === 'readwrite'; // só grava de verdade nesse modo — leitura não dispara o aviso
  if (isWrite) _emitSaveStatus('saving');
  const _dbgNomes = Array.isArray(storeNames) ? storeNames.join('+') : storeNames;
  const _dbgInicio = performance.now();
  console.log(`[DB] tx(${_dbgNomes}, ${mode}) iniciada...`);
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    Promise.resolve(fn(t)).then((r) => { result = r; }).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transação abortada'));
  })).then((result) => {
    if (isWrite) _emitSaveStatus('saved');
    console.log(`[DB] tx(${_dbgNomes}, ${mode}) concluída em ${(performance.now() - _dbgInicio).toFixed(0)}ms`);
    return result;
  }).catch((err) => {
    if (isWrite) _emitSaveStatus('error');
    console.log(`[DB] tx(${_dbgNomes}, ${mode}) FALHOU após ${(performance.now() - _dbgInicio).toFixed(0)}ms:`, err);
    _notifyDbError(err, `${mode} em ${_dbgNomes}`);
    throw err;
  });
}

// ---------- Debounce/batch de saveMap (ver comentário grande acima do
// método DBApi.saveMap) ----------
// Tempo configurável pelo usuário (Configurações → 📦 Catálogo → "⏱️
// Velocidade de salvamento", ver settings.js) — pedido do usuário
// (25/08/2026): "diminua para 1s o tempo para mandar tudo para o
// SSD/HD/banco de dados. Deve ter uma opção nas configurações do app para
// isso." Era um `const` fixo de 3000ms; agora é só o valor PADRÃO/de
// FALLBACK (usado enquanto a pessoa nunca mexeu na opção) — o valor de
// verdade, se já configurado, vem de `DB.getSetting('mapSaveDebounceMs',
// ...)`, lido a cada nova "janela" de espera aberta em `saveMap()` abaixo
// (não a cada mutação absorvida por uma janela já aberta — só quando uma
// rajada nova começa). `MIN`/`MAX` existem pra sempre limitar o campo
// numérico das Configurações a uma faixa sensata (nunca 0 — viraria uma
// gravação de verdade a cada tecla digitada de novo, o problema original
// que esse debounce resolveu; nem um valor absurdamente alto, que devolve
// o próprio arquivo/notificação "salvo" atrasada demais pro gosto de
// alguém que queira aumentar em vez de diminuir).
const MAP_SAVE_DEBOUNCE_DEFAULT_MS = 1000;
const MAP_SAVE_DEBOUNCE_MIN_MS = 200;
const MAP_SAVE_DEBOUNCE_MAX_MS = 15000;
const _pendingMapSaves = new Map(); // id do mapa -> { rec, timer, waiters:[{resolve,reject}] }

function _flushMapSave(id) {
  const pending = _pendingMapSaves.get(id);
  if (!pending) return Promise.resolve();
  _pendingMapSaves.delete(id);
  clearTimeout(pending.timer);
  return tx([STORES.maps], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.maps).put(pending.rec)))
    .then(() => { pending.waiters.forEach((w) => w.resolve(cloneRec(pending.rec))); })
    .catch((e) => { pending.waiters.forEach((w) => w.reject(e)); });
}

// Chamado por mapview.js ao sair da tela Mapa (ver _unmountPlanta) — não faz
// sentido deixar uma gravação pendente "no ar" depois que a pessoa já saiu
// da tela que a gerou. Também ligado a `pagehide` abaixo, pra não perder os
// últimos <3s de edição se a aba for fechada/recarregada bem no meio da
// janela de espera (o próprio risco que passa a existir por adiar a
// gravação — antes disso, gravação imediata não tinha essa lacuna).
function flushPendingMapSaves() {
  return Promise.all([..._pendingMapSaves.keys()].map(_flushMapSave));
}
window.addEventListener('pagehide', () => { flushPendingMapSaves(); });

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowISO() {
  return new Date().toISOString();
}

function tokenize(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function cloneRec(r) { return r ? { ...r } : r; }

/**
 * Fábrica do cache em RAM de UMA store (ver comentário grande no topo do
 * arquivo) — mesmo padrão pras 6 stores, só troca o nome da store e o campo
 * que serve de chave (`keyPath`). `.ensure()` carrega do IndexedDB só na
 * PRIMEIRA vez que é chamado (concorrente ou não — todo mundo espera a
 * mesma promise) e devolve o Map(chave→registro) já pronto; chamadas
 * seguintes devolvem o Map na hora, sem tocar o disco de novo.
 */
function makeStoreCache(storeName, keyPath) {
  let map = null;
  let ready = null;
  return {
    async ensure() {
      if (!ready) {
        ready = tx([storeName], 'readonly', (t) => reqToPromise(t.objectStore(storeName).getAll()))
          .then((all) => { map = new Map(all.map((r) => [r[keyPath], r])); })
          .catch((e) => { ready = null; throw e; }); // falhou: permite tentar de novo na próxima leitura
      }
      await ready;
      return map;
    },
  };
}

const _itemsCache = makeStoreCache(STORES.items, 'id');
const _typesCache = makeStoreCache(STORES.types, 'nome');
const _sectorsCache = makeStoreCache(STORES.sectors, 'nome');
const _mapsCache = makeStoreCache(STORES.maps, 'id');
const _mapPhotosCache = makeStoreCache(STORES.mapPhotos, 'id');
const _settingsCache = makeStoreCache(STORES.settings, 'key');

// NOVO (07/09/2026) — população inicial de `_saveDestinoCache` (declarado
// mais acima, perto de `_emitSaveStatus`) — precisa vir AQUI, depois de
// `_settingsCache` já existir. Roda 1x quando o banco abre; depois disso,
// `setSetting()` mantém o cache atualizado sozinho a cada mudança de
// 'servidorUrl'/'guardarIndexedDB'/'autoSaveAtivo' (ver mais abaixo).
_settingsCache.ensure().then((map) => {
  _saveDestinoCache.servidorUrl = map.get('servidorUrl')?.value || '';
  // 'guardarIndexedDB' — NOVO (07/09/2026), default TRUE (pedido verbatim:
  // "por padrão, agora, o IndexedDB deve ficar marcado") — precisa desse
  // '?? true' explícito porque a chave pode nunca ter sido gravada ainda
  // (instalação nova/pessoa que nunca abriu esta opção), e nesse caso
  // 'map.get(...)' devolve 'undefined', que '!!undefined' resolveria pra
  // 'false' (o OPOSTO do padrão pedido).
  const guardarIndexedDBSalvo = map.get('guardarIndexedDB')?.value;
  _saveDestinoCache.guardarIndexedDB = (guardarIndexedDBSalvo === undefined) ? true : !!guardarIndexedDBSalvo;
  // 'guardarServidor' reaproveita a chave já existente 'autoSaveAtivo' (ver
  // comentário grande acima de '_saveDestinoCache') — default false, igual
  // sempre foi.
  _saveDestinoCache.guardarServidor = !!map.get('autoSaveAtivo')?.value;
}).catch(() => {});
const _objectModelsCache = makeStoreCache(STORES.objectModels, 'id');
// [10/09/2026] Cache da store nova de sessões Persp Match — mesmo padrão
// makeStoreCache já usado por todas as outras stores neste arquivo.
const _perspMatchCache = makeStoreCache(STORES.perspMatchSessions, 'id');

// Chave de registro da store `objectModels` — ver comentário grande em
// STORES.objectModels acima. Função central pra nunca montar essa string
// diferente em dois lugares (leitura e gravação teriam que concordar).
function _chaveObjectModel(tipo, nivel) { return `${tipo}__${nivel}`; }

const DBApi = {
  STORES,
  uuid,
  nowISO,
  onSaveStatus, // ver comentário grande acima de tx() — assina 'saving'/'saved'/'error'
  flushPendingMapSaves, // ver comentário grande acima de saveMap() — força já qualquer gravação de mapa adiada

  // Limites/padrão do campo "⏱️ Velocidade de salvamento" nas Configurações
  // (ver settings.js) — expostos aqui pra não duplicar os números em dois
  // arquivos (ver comentário grande acima de MAP_SAVE_DEBOUNCE_DEFAULT_MS).
  MAP_SAVE_DEBOUNCE_DEFAULT_MS,
  MAP_SAVE_DEBOUNCE_MIN_MS,
  MAP_SAVE_DEBOUNCE_MAX_MS,

  // Cache em RAM do resultado de getDuplicatePatrimonios() — usado no destaque
  // "⚠️ patrimônio duplicado" em vários lugares (tabela, busca, orbs, pinos do
  // mapa, detalhe do item). Sem isto, ABRIR O DETALHE DE UM ITEM (App.
  // showItemDetail) refazia uma varredura do catálogo INTEIRO (getAllSummaries)
  // toda vez — rápido com poucos itens, mas notável com um catálogo grande, e
  // sempre desnecessário quando nada mudou desde a última consulta. Invalidado
  // (_dupCache = null) em QUALQUER mutação de item (addItem/updateItem/
  // deleteItem/putItemRaw/mergeFromRemote) — a próxima chamada recalcula uma
  // vez só e cacheia de novo. (Independente do cache de itens acima — este
  // aqui é só o Set derivado, mais barato ainda de recalcular agora que
  // getAllSummaries() já lê da RAM em vez do disco.)
  _dupCache: null,
  _invalidateDupCache() { this._dupCache = null; },

  /** ID da conferência de patrimônio — SEMPRE um hash determinístico do NOME
   *  dela (`conferenciaNome`), nunca mais um valor aleatório sorteado e
   *  guardado à parte (pedido do usuário, 26/08/2026: "O ID da conferência
   *  deve ser um hash do nome"). Puro/síncrono (não mexe no banco) — quem
   *  chama já tem o nome em mãos, ou busca com `getSetting('conferenciaNome',
   *  ...)` antes. O mesmo nome, em QUALQUER aparelho, sempre resulta no
   *  MESMO ID — é justamente pra isso que o ID serve (ver comentário grande
   *  em addItem, abaixo, e em settings.js): reconhecer duas fontes como "a
   *  mesma conferência" ao unificar, só combinando o NOME digitado, sem
   *  precisar copiar/sincronizar um ID à parte entre os aparelhos. Trocar o
   *  nome troca o ID junto — é a forma de "começar uma conferência nova"
   *  agora (ver settings.js #st-conf-nova). Ver Utils.hashString pro
   *  algoritmo em si. */
  computeConferenciaId(nome) {
    return Utils.hashString((nome || '').trim());
  },

  // ---------- ITEMS ----------
  async addItem(data) {
    const id = data.id || uuid();
    const ts = nowISO();
    // Identifica A QUAL conferência de patrimônio este item pertence — permite,
    // na ferramenta de unificação (vários aparelhos), saber que arquivos são
    // da MESMA conferência (e avisar quando alguém tentar unificar arquivos de
    // conferências diferentes por engano). Calculado na hora (hash do nome
    // atual — ver computeConferenciaId), mesmo sem o usuário nunca ter aberto
    // as Configurações (nome vazio ainda gera um ID válido, só que igual em
    // toda instalação sem nome definido — por isso o aviso no cabeçalho, ver
    // App._updateConfNomeBanner, pede pra definir um nome).
    const conferenciaNome = data.conferenciaNome ?? (await this.getSetting('conferenciaNome', ''));
    const conferenciaId = data.conferenciaId || this.computeConferenciaId(conferenciaNome);
    const item = {
      id,
      conferenciaId,
      conferenciaNome,
      patrimonio: data.patrimonio || '',
      descricao: data.descricao || '',
      tipo: data.tipo || '',
      setor: data.setor || '',
      // Pedido do usuário (27/08/2026): o ícone colorido do item (Tabela/
      // Cartões, quando não há foto) passou a ser desenhado em SVG em tempo
      // de execução (ver avatar.js Avatar.iconSvgMarkup), a partir só de
      // tipo/descrição — NENHUMA imagem é mais gravada aqui pra isso. Os
      // campos `avatarDataUrl`/`thumbDataUrl` existiam ANTES como um PNG
      // rasterizado (canvas.toDataURL) e, sem foto real, ficavam com a
      // MESMA imagem duplicada nos dois — daí terem sido unificados/
      // removidos daqui. `avatarDataUrl` continua aceito (não gerado) só
      // por compatibilidade com itens antigos já sincronizados/importados
      // de antes desta mudança (ver mergeFromRemote/putItemRaw) — nenhuma
      // tela nova volta a desenhá-lo.
      avatarDataUrl: data.avatarDataUrl || null,
      // Pedido do usuário (27/08/2026): na exportação, "avatarDataUrl" e
      // "thumbDataUrl" ainda saíam preenchidos (imagens idênticas, herdadas
      // de itens antigos) — removidos DO ARQUIVO EXPORTADO (ver settings.js
      // _openExportModal), substituídos por uma ÚNICA imagem representativa
      // em SVG (`avatarSvg`, gerada por Avatar.iconSvgMarkup no momento da
      // exportação). Ao importar esse arquivo de volta, este campo é
      // preservado tal como veio — é o que Avatar.itemIconSvg (ver
      // avatar.js) usa PRIMEIRO ao desenhar o item, garantindo a mesma
      // aparência de quando foi exportado. Um item criado direto neste
      // aparelho (câmera/manual) NUNCA preenche isto — cai sempre no
      // cálculo dinâmico normal (mesmo espírito de avatarDataUrl acima,
      // nunca gerado por nenhuma tela nova, só aceito na importação).
      avatarSvg: data.avatarSvg || null,
      fotoDataUrl: data.fotoDataUrl || null,
      // Pedido do usuário (28/08/2026): "O campo código de barras não deve
      // mais existir" — `patrimonioCodigoBarras` (texto bruto decodificado
      // do código de barras 1D da etiqueta) foi REMOVIDO do item. O código
      // de barras em si continua lido normalmente (ver barcode.js/
      // capture.js) — só não é mais guardado como campo próprio; segue
      // servindo apenas para SUGERIR o número de patrimônio na hora de
      // cadastrar (ver capture.js `patrimonioSugerido`/app.js
      // `prefillPatrimonio`).
      ambienteId: data.ambienteId || null,
      mapaX: typeof data.mapaX === 'number' ? data.mapaX : null,
      mapaY: typeof data.mapaY === 'number' ? data.mapaY : null,
      mapaPiso: data.mapaPiso || 0,
      // `true` quando mapaX/mapaY acima foram preenchidos AUTOMATICAMENTE pelo
      // app como posição de reserva (ver Mapping.findPeripheralSlot) — ex.:
      // uma foto virou "isto é um patrimônio" mas o usuário ainda não marcou
      // onde ela fica de fato. Um item com `mapaAuto: true` AINDA aparece
      // como pino no mapa (fácil de achar, pedido do usuário), mas continua
      // contando como "sem lugar" pra a 📦 Caixa (ver js/photogrid.js
      // getUnsorted) até alguém posicioná-lo de propósito — o que também
      // LIMPA esta flag (nunca fica true depois de um posicionamento
      // deliberado). Ausente/false (o padrão) = posição escolhida de
      // propósito por alguém (ou por uma ação explícita de vincular).
      mapaAuto: data.mapaAuto === true,
      // Referência a uma foto do mapa (mapPhoto.id, ver addAmbientePhoto
      // abaixo) "anexada" a este patrimônio — ex.: a foto tirada na tela
      // "Fotos" quando a pessoa escolhe "🏷️ Este é um patrimônio" no modal
      // de vínculo (ver js/capture.js), ou anexada manualmente ao cadastrar/
      // editar um item pela Tabela (ver App.openItemForm, botão "📷 Anexar
      // foto"). Só a REFERÊNCIA (id) é guardada aqui — NUNCA os dados da
      // imagem em si (isso ficaria duplicado; a imagem já mora só na store
      // mapPhotos) — quem quiser mostrar a miniatura busca a foto por este
      // id (ver App.showItemDetail). Uma foto com este vínculo conta como
      // "com lugar" (não aparece na 📦 Caixa) mesmo sem mapaX/mapaY próprio
      // (ver js/photogrid.js getUnsorted) — o vínculo com o patrimônio já é,
      // por si só, um "lugar" pra ela.
      fotoAnexadaId: data.fotoAnexadaId || null,
      // Posição GLOBAL (GPS), além da posição relativa ao mapa acima —
      // opcional, só preenchida quando o navegador tem/permite geolocalização
      // (ver geo.js). Útil para diferenciar locais distantes entre si.
      geoLat: typeof data.geoLat === 'number' ? data.geoLat : null,
      geoLng: typeof data.geoLng === 'number' ? data.geoLng : null,
      geoAccuracy: typeof data.geoAccuracy === 'number' ? data.geoAccuracy : null,
      geoObtidoEm: data.geoObtidoEm || null,
      // aparelho/sessão que cadastrou este item — permite vários PCs/celulares
      // catalogarem ao mesmo tempo sem conflito (cada item já nasce com um id
      // globalmente único) e permite ver, na busca, de qual aparelho veio cada
      // catálogo repetido do mesmo número de patrimônio.
      origemSessaoId: data.origemSessaoId || (window.Session ? window.Session.id : null),
      origemSessaoLabel: data.origemSessaoLabel || (window.Session ? window.Session.label : null),
      // Informação best-effort do APARELHO (SO/navegador/modelo, quando o
      // navegador expõe isso) — NÃO é o nome que a pessoa deu ao computador/
      // celular nas configurações do sistema operacional: nenhum navegador
      // expõe esse nome (nem o endereço MAC) para uma página web, por
      // segurança/privacidade. Ver session.js.
      origemDispositivoInfo: data.origemDispositivoInfo || (window.Session ? window.Session.deviceInfoText : null),
      // "Impressão digital" do aparelho — pedido do usuário (27/08/2026):
      // hash combinando várias características de hardware/navegador (GPU,
      // núcleos, RAM, fontes instaladas, renderização de canvas/áudio,
      // fuso-horário/idioma etc — cálculo mora em js/devicefingerprint.js
      // DeviceFingerprint.computeFingerprint(), chamado por
      // Session._computeFingerprint desde a modularização de 27/08/2026)
      // pra tornar "Cadastrado por" mais único mesmo entre dois aparelhos
      // parecidos, e mesmo que o `origemSessaoId` acima (que depende de um
      // valor gravado no localStorage) seja perdido por a pessoa ter limpado
      // os dados do navegador. NÃO identifica a pessoa dona do aparelho.
      origemDispositivoFingerprint: data.origemDispositivoFingerprint || (window.Session ? window.Session.deviceFingerprint : null),
      // IP público (da rede/roteador — não o endereço exato deste aparelho,
      // que o navegador também nunca expõe) — só preenchido se a opção
      // estiver ativada nas Configurações E houver internet no momento do
      // cadastro. Ver Session.getPublicIpIfEnabled().
      capturaIpPublico: data.capturaIpPublico || null,
      criadoEm: ts,
      // BUG relatado pelo usuário: "quando eu importo o catálogo em outro
      // aparelho, as três datas ('Inserido em', 'Modificado em' e 'Última
      // consulta') ficam iguais." Causa: aqui embaixo essas duas linhas
      // sempre usavam `ts` (agora), IGNORANDO os valores que `data` (o item
      // importado) já trazia — então TODO item recém-importado ficava com
      // os 3 campos cravados no exato momento da importação, mesmo tendo
      // sido modificado/consultado de verdade em datas bem anteriores no
      // aparelho de origem. `criadoEm` continua sendo sempre "agora" DE
      // PROPÓSITO (é "quando entrou NESTE aparelho/DB" — ver comentário
      // logo abaixo sobre criadoOriginalmenteEm, que é quem guarda a data
      // de criação de verdade); já `modificadoEm`/`ultimaConsultaEm` são o
      // histórico real do item, então devem ser PRESERVADOS quando vierem
      // preenchidos num import/backup — só caem em "agora" numa criação
      // nova de verdade (Capturar/+Novo), quando `data` não traz nada.
      modificadoEm: data.modificadoEm || ts,
      ultimaConsultaEm: data.ultimaConsultaEm || ts,
      // Data de criação ORIGINAL, IMUTÁVEL — diferente de criadoEm/
      // modificadoEm acima (que mudam por natureza: criadoEm reflete quando
      // o registro foi inserido NESTE aparelho/DB, podendo ser bem depois da
      // criação de verdade se veio de um import/backup; modificadoEm muda a
      // cada edição). Esta aqui é definida UMA vez só e nunca mais tocada —
      // nem em edição (ver updateItem, que ignora qualquer valor vindo em
      // `patch` pra este campo), nem em export/import/unificação/sync (ver
      // mergeFromRemote, mesma proteção). Se `data` já trouxer um valor
      // (item importado que já tinha essa data marcada), preserva; senão,
      // se `data` tiver ao menos um criadoEm de origem (import de um
      // registro ANTIGO, de antes deste campo existir), usa ele como melhor
      // estimativa disponível; só cai em "agora" (ts) quando é mesmo uma
      // criação nova de verdade (Capturar/+Novo).
      criadoOriginalmenteEm: data.criadoOriginalmenteEm || data.criadoEm || ts,
      // Pedido do usuário (27/08/2026): "se o patrimônio estiver vinculado a
      // uma imagem [...] ele recebe, no seu pacote próprio de informações, a
      // resolução da imagem, a posição relativa de sua marcação na imagem, o
      // nome da imagem, o setor da imagem e a data em que a imagem foi
      // tirada [...] podem acabar sendo várias marcações em fotos distintas,
      // então pode acabar sendo uma lista." Cada entrada é gravada NA HORA da
      // marcação (ver AmbientePhotos._placeOrbAt) com uma CÓPIA desses 5
      // dados — não uma referência só — de propósito: mesmo que a foto em si
      // seja apagada depois (ou não carregue), o item ainda sabe onde/quando
      // foi marcado nela. `fotoId` também vai junto (além dos 5 campos
      // pedidos) só para permitir religar com a foto de verdade quando ela
      // ainda existir (ex.: abrir a foto a partir do item).
      marcacoesFotos: Array.isArray(data.marcacoesFotos) ? data.marcacoesFotos : [],
      // Mesma ideia acima, só que para marcações no MAPA (2D/3D) em vez de
      // numa foto — pedido do usuário: "se foi marcado em uma posição do
      // mapa também deve ficar guardado nele. Podem acabar sendo várias
      // posições, então pode ser uma lista." Cada entrada é gravada num
      // posicionamento DELIBERADO (ver MapView._placeItemPinAt/
      // _placeNewItemPinAt) — não em cada arraste/undo — mesmo espírito de
      // marcacoesFotos acima: histórico de "onde este item já foi marcado",
      // não só a posição atual (que continua em mapaX/mapaY/mapaPiso, como
      // sempre foi).
      marcacoesMapa: Array.isArray(data.marcacoesMapa) ? data.marcacoesMapa : [],
    };
    item.buscaTokens = [
      ...new Set([
        ...tokenize(item.patrimonio),
        ...tokenize(item.descricao),
        ...tokenize(item.tipo),
        ...tokenize(item.setor),
      ]),
    ];
    await tx([STORES.items], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.items).add(item)));
    // Cache atualizado SÓ DEPOIS do disco confirmar (ver comentário no topo
    // do arquivo — write-through, nunca write-back). `ensure()` aqui não
    // recarrega nada se o cache já estava pronto; se ainda não estava, já
    // vai carregar do disco incluindo este item que acabamos de gravar.
    const map = await _itemsCache.ensure();
    map.set(id, item);
    this._invalidateDupCache();
    if (item.tipo) await this.touchType(item.tipo);
    if (item.setor) await this.touchSector(item.setor);
    return cloneRec(item);
  },

  async updateItem(id, patch) {
    const map = await _itemsCache.ensure();
    const existing = map.get(id);
    if (!existing) throw new Error('Item não encontrado: ' + id);
    const updated = { ...existing, ...patch, id };
    updated.modificadoEm = nowISO();
    // criadoOriginalmenteEm é IMUTÁVEL (ver comentário grande em addItem) —
    // ignora qualquer valor que `patch` tenha trazido pra este campo (nunca
    // deveria, mas alguns chamadores passam o registro inteiro como patch,
    // ex.: applyImportDecision) e sempre mantém o que já estava gravado.
    // Auto-repara registros ANTIGOS que nunca tiveram esse campo (de antes
    // dele existir) usando o criadoEm de sempre como melhor estimativa —
    // assim, a partir da 1ª edição depois de atualizar o app, até um item
    // antigo ganha uma data original (nunca mais muda depois disso).
    updated.criadoOriginalmenteEm = existing.criadoOriginalmenteEm || existing.criadoEm || nowISO();
    updated.buscaTokens = [
      ...new Set([
        ...tokenize(updated.patrimonio),
        ...tokenize(updated.descricao),
        ...tokenize(updated.tipo),
        ...tokenize(updated.setor),
      ]),
    ];
    await tx([STORES.items], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.items).put(updated)));
    map.set(id, updated);
    this._invalidateDupCache();
    if (updated.tipo) await this.touchType(updated.tipo);
    if (updated.setor) await this.touchSector(updated.setor);
    return cloneRec(updated);
  },

  /**
   * Acrescenta UMA marcação em foto ao "pacote próprio de informações" do
   * item (ver campo `marcacoesFotos` em addItem) — pedido do usuário
   * (27/08/2026). Chamado por AmbientePhotos._placeOrbAt no exato momento em
   * que a marcação (orb) é colocada na foto. Guarda uma CÓPIA dos 5 dados
   * pedidos (resolução, posição relativa, nome, setor e data da foto), não
   * uma referência só, para sobreviver mesmo que a foto não possa mais ser
   * carregada depois.
   * @param {string} itemId
   * @param {{fotoId:string, resolucao:{largura:number,altura:number}, posicao:{xNorm:number,yNorm:number}, nomeImagem:string, setor:string, dataImagem:string}} marcacao
   */
  async addFotoMarcacaoAoItem(itemId, marcacao) {
    const map = await _itemsCache.ensure();
    const existing = map.get(itemId);
    if (!existing) return null;
    const entrada = {
      id: uuid(),
      fotoId: marcacao.fotoId || null,
      resolucao: marcacao.resolucao || null,
      posicao: marcacao.posicao || null,
      nomeImagem: marcacao.nomeImagem || '',
      setor: marcacao.setor || '',
      dataImagem: marcacao.dataImagem || null,
      criadoEm: nowISO(),
    };
    const marcacoesFotos = [...(existing.marcacoesFotos || []), entrada];
    return this.updateItem(itemId, { marcacoesFotos });
  },

  /**
   * Mesma ideia de addFotoMarcacaoAoItem acima, só que para uma marcação no
   * MAPA (campo `marcacoesMapa` em addItem) — pedido do usuário
   * (27/08/2026). Chamado por MapView._placeItemPinAt/_placeNewItemPinAt no
   * momento de um posicionamento DELIBERADO (não em arrastes/desfazer).
   * @param {string} itemId
   * @param {{mapaId:string, nomeMapa:string, x:number, y:number, piso:number}} marcacao
   */
  async addMapaMarcacaoAoItem(itemId, marcacao) {
    const map = await _itemsCache.ensure();
    const existing = map.get(itemId);
    if (!existing) return null;
    const entrada = {
      id: uuid(),
      mapaId: marcacao.mapaId || null,
      nomeMapa: marcacao.nomeMapa || '',
      x: typeof marcacao.x === 'number' ? marcacao.x : null,
      y: typeof marcacao.y === 'number' ? marcacao.y : null,
      piso: marcacao.piso || 0,
      criadoEm: nowISO(),
    };
    const marcacoesMapa = [...(existing.marcacoesMapa || []), entrada];
    return this.updateItem(itemId, { marcacoesMapa });
  },

  /**
   * Mescla um item vindo de outro aparelho (via SyncModule.pull()) na base local.
   * NUNCA sobrescreve um item local mais recente, NUNCA apaga nada, e NUNCA funde
   * itens de patrimônios iguais em um só — cada id é um catálogo independente, então
   * dois aparelhos cadastrando o mesmo número de patrimônio ao mesmo tempo resultam
   * em dois registros, ambos preservados (e visíveis juntos na busca).
   */
  async mergeFromRemote(remoteItem) {
    if (!remoteItem || !remoteItem.id) return { changed: false };
    const map = await _itemsCache.ensure();
    const existing = map.get(remoteItem.id);
    if (existing && (existing.modificadoEm || '') >= (remoteItem.modificadoEm || '')) {
      return { changed: false, isNew: false };
    }
    const merged = { ...existing, ...remoteItem };
    // criadoOriginalmenteEm é IMUTÁVEL (ver comentário grande em addItem/
    // updateItem) — se este item já existia localmente, a versão remota
    // NUNCA pode sobrescrever a data original já gravada aqui, mesmo o
    // remoto "vencendo" por ter um modificadoEm mais novo (isso só decide
    // qual CONTEÚDO fica, não quando o item nasceu de verdade). Se é um
    // item novo pra este aparelho (!existing), usa o valor do remoto (ou,
    // faltando ele — remoto ainda numa versão antiga do app —, o criadoEm
    // dele como estimativa, ou por fim agora mesmo).
    merged.criadoOriginalmenteEm = (existing && existing.criadoOriginalmenteEm)
      || remoteItem.criadoOriginalmenteEm || remoteItem.criadoEm || nowISO();
    merged.buscaTokens = [
      ...new Set([
        ...tokenize(merged.patrimonio),
        ...tokenize(merged.descricao),
        ...tokenize(merged.tipo),
        ...tokenize(merged.setor),
      ]),
    ];
    await tx([STORES.items], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.items).put(merged)));
    map.set(merged.id, merged);
    this._invalidateDupCache();
    if (merged.tipo) await this.touchType(merged.tipo);
    if (merged.setor) await this.touchSector(merged.setor);
    return { changed: true, isNew: !existing, item: cloneRec(merged) };
  },

  async touchLastConsulted(id) {
    const map = await _itemsCache.ensure();
    const existing = map.get(id);
    if (!existing) return null;
    const updated = { ...existing, ultimaConsultaEm: nowISO() };
    await tx([STORES.items], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.items).put(updated)));
    map.set(id, updated);
    return cloneRec(updated);
  },

  async deleteItem(id) {
    await tx([STORES.items], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.items).delete(id)));
    const map = await _itemsCache.ensure();
    map.delete(id);
    this._invalidateDupCache();
  },

  /** Restaura um item EXATAMENTE como estava — usado só pelo desfazer/refazer
   *  (ver js/history.js). Diferente de addItem()/updateItem(), NÃO regenera
   *  criadoEm/modificadoEm/buscaTokens: grava o registro inteiro tal como
   *  veio, pra desfazer uma edição ou exclusão restaurar o item byte a byte. */
  async putItemRaw(record) {
    await tx([STORES.items], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.items).put(record)));
    const map = await _itemsCache.ensure();
    map.set(record.id, { ...record });
    this._invalidateDupCache();
  },

  async getItem(id) {
    const map = await _itemsCache.ensure();
    return cloneRec(map.get(id));
  },

  async getItemByPatrimonio(patrimonio) {
    const map = await _itemsCache.ensure();
    for (const it of map.values()) { if (it.patrimonio === patrimonio) return cloneRec(it); }
    return undefined;
  },

  async countItems() {
    const map = await _itemsCache.ensure();
    return map.size;
  },

  /**
   * Página de itens ordenada por `sortBy` — antes usava um cursor do
   * IndexedDB (bom pra não carregar tudo em memória de uma vez); agora que
   * o cache já mantém TODOS os itens em RAM de qualquer forma (ver
   * comentário no topo do arquivo), só ordena o array em memória — mesmo
   * resultado, sem tocar o disco.
   * @param {object} opts { offset, limit, sortBy, direction }
   */
  async getItemsPage({ offset = 0, limit = 50, sortBy = 'modificadoEm', direction = 'prev' } = {}) {
    const map = await _itemsCache.ensure();
    const arr = [...map.values()];
    arr.sort((a, b) => {
      const av = a[sortBy], bv = b[sortBy];
      if (av === bv) return 0;
      return (av ?? '') > (bv ?? '') ? 1 : -1;
    });
    if (direction === 'prev') arr.reverse();
    return arr.slice(offset, offset + limit).map(cloneRec);
  },

  async searchItems(queryStr, { limit = 200 } = {}) {
    const tokens = tokenize(queryStr);
    if (tokens.length === 0) return this.getItemsPage({ offset: 0, limit });
    const map = await _itemsCache.ensure();
    const scored = [];
    for (const it of map.values()) {
      const bt = it.buscaTokens || [];
      let score = 0;
      for (const tok of tokens) { if (bt.some((b) => b.startsWith(tok))) score++; }
      if (score > 0) scored.push({ item: it, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((x) => cloneRec(x.item));
  },

  /** Itens inseridos ou modificados a partir de um instante (ISO) — usado para
   *  "baixar o que foi catalogado nesta sessão" quando não há servidor configurado. */
  async getItemsSince(isoTimestamp) {
    const all = await this.getAllItems();
    return all.filter((it) => (it.criadoEm && it.criadoEm >= isoTimestamp) || (it.modificadoEm && it.modificadoEm >= isoTimestamp));
  },

  async getItemsByAmbiente(ambienteId) {
    const map = await _itemsCache.ensure();
    return [...map.values()].filter((it) => it.ambienteId === ambienteId).map(cloneRec);
  },

  async getAllItems() {
    const map = await _itemsCache.ensure();
    return [...map.values()].map(cloneRec);
  },

  /**
   * Versão "leve" para listas com milhares de itens: NÃO traz fotoDataUrl
   * completo (o ícone de cada linha é um SVG desenhado na hora a partir de
   * tipo/descrição — ver avatar.js — não precisa de nenhuma imagem aqui),
   * evitando montar centenas de MB de HTML/objetos ao desenhar a tabela/
   * flashcards. Use getItem(id) para os detalhes completos.
   */
  async getAllSummaries() {
    const map = await _itemsCache.ensure();
    const out = [];
    for (const it of map.values()) {
      out.push({
        id: it.id, patrimonio: it.patrimonio, descricao: it.descricao, tipo: it.tipo, setor: it.setor,
        ambienteId: it.ambienteId, mapaX: it.mapaX, mapaY: it.mapaY, fotoAnexadaId: it.fotoAnexadaId,
        // Pedido do usuário (27/08/2026): imagem representativa em SVG de um
        // item IMPORTADO (ver comentário grande em addItem) — precisa estar
        // aqui pra Tabela (que só lê o resumo leve) continuar respeitando
        // ela em vez de recalcular do zero (ver Avatar.itemIconSvg).
        avatarSvg: it.avatarSvg,
        // `criadoEm` continua aqui (uso técnico interno — sync/ordenação de
        // fallback), mas o campo "Inserido em" foi removido da UI (pedido do
        // usuário, 27/08/2026): `criadoOriginalmenteEm` é quem aparece agora
        // pra pessoa (ver app.js showItemDetail e o seletor de ordenação em
        // table.js).
        criadoEm: it.criadoEm, criadoOriginalmenteEm: it.criadoOriginalmenteEm,
        modificadoEm: it.modificadoEm, ultimaConsultaEm: it.ultimaConsultaEm,
        origemSessaoId: it.origemSessaoId, origemSessaoLabel: it.origemSessaoLabel,
        geoLat: it.geoLat, geoLng: it.geoLng,
      });
    }
    return out;
  },

  /**
   * Conjunto de valores de patrimônio que aparecem em 2+ itens no catálogo
   * inteiro (para o aviso "⚠️ patrimônio duplicado" — na tabela, na busca,
   * no detalhe do item e nos orbs/pins do mapa). Itens sem patrimônio (vazio)
   * nunca contam como duplicados entre si, igual à regra já usada em outras
   * partes do app. Baseado em getAllSummaries() (leve, sem fotos completas).
   */
  async getDuplicatePatrimonios() {
    if (this._dupCache) return this._dupCache;
    const all = await this.getAllSummaries();
    const counts = new Map();
    for (const it of all) {
      const p = (it.patrimonio || '').trim();
      if (!p) continue;
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    const dups = new Set();
    for (const [p, n] of counts) { if (n >= 2) dups.add(p); }
    this._dupCache = dups;
    return dups;
  },

  // ---------- TYPES (tipos cadastrados p/ autofill) ----------
  async touchType(nome, defaults = null) {
    const map = await _typesCache.ensure();
    const existing = map.get(nome);
    const rec = existing ? { ...existing } : { nome, usos: 0, defaults: {} };
    rec.usos += 1;
    if (defaults) rec.defaults = { ...rec.defaults, ...defaults };
    await tx([STORES.types], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.types).put(rec)));
    map.set(nome, rec);
    return cloneRec(rec);
  },

  async getAllTypes() {
    const map = await _typesCache.ensure();
    return [...map.values()].map(cloneRec).sort((a, b) => b.usos - a.usos);
  },

  async deleteType(nome) {
    await tx([STORES.types], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.types).delete(nome)));
    const map = await _typesCache.ensure();
    map.delete(nome);
  },

  // ---------- SECTORS ----------
  async touchSector(nome) {
    const map = await _sectorsCache.ensure();
    const existing = map.get(nome);
    const rec = existing ? { ...existing } : { nome, usos: 0 };
    rec.usos += 1;
    await tx([STORES.sectors], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.sectors).put(rec)));
    map.set(nome, rec);
    return cloneRec(rec);
  },

  async getAllSectors() {
    const map = await _sectorsCache.ensure();
    return [...map.values()].map(cloneRec).sort((a, b) => b.usos - a.usos);
  },

  async deleteSector(nome) {
    await tx([STORES.sectors], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.sectors).delete(nome)));
    const map = await _sectorsCache.ensure();
    map.delete(nome);
  },

  // ---------- MAPS / AMBIENTES ----------
  // Pedido do usuário: "a mensagem de que foi salvo no DB aparece
  // imediatamente, deveria ser depois de 3s ou com o acúmulo de coisas para
  // guardar" — editar o mapa (arrastar parede/câmera/objeto, digitar um
  // campo, etc.) é a tela com mais mutações seguidas em pouco tempo do app
  // inteiro, e cada uma delas disparava uma gravação DE VERDADE no
  // IndexedDB na hora (ver mapview.js `_saveMap`: "TODA mutação do mapa...
  // passa por aqui"), com o aviso 'saving'/'saved' (ver tx() acima) piscando
  // a cada uma. Agora `saveMap` grava OTIMISTAMENTE no cache em memória na
  // hora — então `getMap`/`getAllMaps` nunca leem dado velho, nada que lê o
  // mapa logo em seguida quebra — mas a gravação de verdade no IndexedDB (e
  // o aviso que ela dispara) é ADIADA: a 1ª chamada de uma rajada abre uma
  // janela de `getMapSaveDebounceMs()` (configurável, 1s por padrão — ver
  // comentário grande acima de MAP_SAVE_DEBOUNCE_DEFAULT_MS); toda chamada
  // seguinte dentro dela só atualiza o registro pendente (o mais recente
  // vale — os do meio nunca chegam a ser gravados sozinhos, só a versão
  // final da rajada), e todas elas resolvem juntas quando a gravação de
  // fato acontece — uma rajada de mudanças dentro da janela configurada vira
  // 1 gravação (e 1 aviso "salvo") só. `id` próprio por mapa (não um único
  // slot global) porque duplicar um ambiente salva vários mapas em sequência
  // (ver `_duplicarComFilhos` abaixo) — cada um deve poder ter sua própria
  // janela sem interferir nas dos outros.
  async saveMap(mapObj) {
    const id = mapObj.id || uuid();
    const rec = { ...mapObj, id, atualizadoEm: nowISO() };
    const map = await _mapsCache.ensure();
    map.set(id, rec); // otimista — ver comentário acima
    let pending = _pendingMapSaves.get(id);
    let abrindoJanelaNova = false;
    const resultado = new Promise((resolve, reject) => {
      if (pending) {
        pending.rec = rec; // absorve nesta janela já aberta — não reinicia o timer
        pending.waiters.push({ resolve, reject });
      } else {
        abrindoJanelaNova = true;
        // Reserva a janela JÁ AQUI, de forma síncrona (dentro do executor da
        // Promise, que roda na hora) — antes de qualquer `await` abaixo pra
        // ler a configuração de velocidade. Sem isso, duas chamadas de
        // `saveMap` pro MESMO mapa, disparadas em sequência rápida, poderiam
        // as duas caírem no `else` (nenhuma via a outra como "pending" ainda,
        // porque a leitura da config é assíncrona) e abrir 2 janelas/2
        // gravações em vez de 1.
        pending = { rec, waiters: [{ resolve, reject }], timer: null };
        _pendingMapSaves.set(id, pending);
      }
    });
    if (abrindoJanelaNova) {
      const debounceMs = await this.getMapSaveDebounceMs();
      // `pending` pode já ter um `rec` mais novo aqui (uma chamada seguinte
      // absorveu nesta mesma janela enquanto a config estava sendo lida) —
      // sem problema, o timer só é criado agora, e `_flushMapSave` sempre lê
      // `pending.rec` na hora de gravar, então pega a versão mais recente.
      pending.timer = setTimeout(() => _flushMapSave(id), debounceMs);
    }
    return resultado;
  },

  /** Tempo (ms) de espera antes de gravar de verdade uma rajada de mudanças
   *  no mapa (ver saveMap acima) — configurável em Configurações → 📦
   *  Catálogo → "⏱️ Velocidade de salvamento" (ver settings.js). Sempre
   *  clampado entre MIN/MAX (ver constantes no topo do arquivo), mesmo que
   *  algo tenha gravado um valor fora da faixa por fora desta função. */
  async getMapSaveDebounceMs() {
    const v = Number(await this.getSetting('mapSaveDebounceMs', MAP_SAVE_DEBOUNCE_DEFAULT_MS));
    if (!Number.isFinite(v)) return MAP_SAVE_DEBOUNCE_DEFAULT_MS;
    return Math.min(MAP_SAVE_DEBOUNCE_MAX_MS, Math.max(MAP_SAVE_DEBOUNCE_MIN_MS, v));
  },

  /** Grava a nova velocidade (ms), já clampada entre MIN/MAX — usado pelo
   *  campo numérico das Configurações (ver settings.js). Não afeta uma
   *  janela de espera JÁ ABERTA (o timer dela já foi criado com o valor
   *  antigo) — só a próxima rajada, o que é aceitável pra uma opção de
   *  configuração (não precisa reagir "ao vivo" no meio de uma edição já em
   *  andamento). */
  async setMapSaveDebounceMs(ms) {
    const v = Math.min(MAP_SAVE_DEBOUNCE_MAX_MS, Math.max(MAP_SAVE_DEBOUNCE_MIN_MS, Number(ms) || MAP_SAVE_DEBOUNCE_DEFAULT_MS));
    await this.setSetting('mapSaveDebounceMs', v);
    return v;
  },

  async getMap(id) {
    const map = await _mapsCache.ensure();
    return cloneRec(map.get(id));
  },

  async getAllMaps() {
    const map = await _mapsCache.ensure();
    return [...map.values()].map(cloneRec);
  },

  /**
   * Pedido do usuário (27/08/2026): "Deve haver a possibilidade de fazer
   * mais mapas. Atualmente é apenas um mapa que vai direto para ele" —
   * reverte a decisão de uma rodada anterior ("Não vai haver mais
   * ambientes... Todos os ambientes vão ser apenas um ambiente", ver
   * histórico abaixo) SEM renomear nada (ambienteId, ambienteAtualId,
   * Mapping, getMap/saveMap/getAllMaps continuam exatamente como sempre
   * foram, e este método continua sendo chamado com o MESMO nome em todos
   * os lugares que já chamavam antes — mapview.js/photogrid.js — pra não
   * precisar tocar em cada um deles): agora devolve o mapa ATUALMENTE
   * selecionado (`ambienteAtualId`), não funde mais múltiplos mapas em um
   * só. A UI de criar/trocar/renomear/excluir mapas mora em mapview.js
   * (ver MapView._openMapSwitcherModal, botão na tela de entrada do Mapa).
   *  - 0 mapas salvos: cria um (Mapping.newMap) e já marca como o atual.
   *  - `ambienteAtualId` aponta pra um mapa que existe: devolve ele.
   *  - `ambienteAtualId` vazio ou apontando pra um mapa que não existe mais
   *    (foi excluído, ou é o resquício da fusão de versões antigas): cai
   *    pro primeiro mapa da lista e já marca ele como o atual.
   * Nome do método mantido por compatibilidade (não é mais "single" de
   * verdade, mas trocar o nome exigiria mexer em muitos outros arquivos).
   */
  async getOrCreateSingleMap() {
    const maps = await this.getAllMaps();

    if (maps.length === 0) {
      const map = Mapping.newMap({ nome: 'Ambiente' });
      await this.saveMap(map);
      await this.setSetting('ambienteAtualId', map.id);
      return map;
    }

    const atualId = await this.getSetting('ambienteAtualId', null);
    const atual = atualId ? maps.find((m) => m.id === atualId) : null;
    if (atual) return atual;

    // `ambienteAtualId` vazio ou obsoleto — cai pro primeiro mapa da lista.
    const primeiro = maps[0];
    await this.setSetting('ambienteAtualId', primeiro.id);
    return primeiro;
  },

  /** Cria um mapa NOVO e vazio (pedido do usuário, 27/08/2026 — "possibilidade
   *  de fazer mais mapas") — não mexe em qual é o mapa atual; quem chama
   *  decide se/quando trocar pra ele (ver MapView._openMapSwitcherModal,
   *  que chama `setCurrentMap` logo em seguida). */
  async addMap(data) {
    const map = Mapping.newMap(data || {});
    await this.saveMap(map);
    return map;
  },

  /** Marca qual mapa é "o atual" — o que `getOrCreateSingleMap()` acima
   *  devolve, e o que toda tela do Mapa (Planta baixa/Foto/Caixa) usa ao
   *  ser (re)montada. */
  async setCurrentMap(id) {
    await this.setSetting('ambienteAtualId', id);
  },

  async deleteMap(id) {
    // Aninhamento de ambientes (rodada 10, ver mapping.js parentId): se o
    // ambiente removido tinha ambientes FILHOS "dentro" dele, eles não podem
    // ficar com um parentId apontando pra uma id que não existe mais — cada
    // filho direto é reencaixado no PAI do ambiente removido (sobe um nível
    // na árvore, como remover uma pasta e o conteúdo dela subir pra pasta de
    // cima), ou vira raiz (parentId null) se o removido já era raiz. Feito
    // ANTES de apagar, pra ainda ter acesso ao parentId do removido.
    const map = await _mapsCache.ensure();
    const removed = map.get(id);
    const novoParentId = removed?.parentId || null;
    const filhos = [...map.values()].filter((m) => (m.parentId || null) === id);
    for (const filho of filhos) await this.saveMap({ ...filho, parentId: novoParentId });
    await tx([STORES.maps], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.maps).delete(id)));
    map.delete(id);

    // Rodada 11 (ação "Excluir ambiente" no menu do Mapa): excluir um
    // ambiente não pode deixar referências penduradas por aí — itens que
    // estavam pinados nele (ambienteId/mapaX/mapaY/mapaPiso) ficariam
    // "presos" num ambiente que não existe mais, e fotos do ambiente
    // (mapPhotos, com seus orbs) ficariam órfãs, sem nenhuma tela que
    // consiga mais abri-las. Os itens em si NÃO são apagados — só perdem o
    // pino/vínculo com este ambiente e continuam no catálogo normalmente.
    const itemsMap = await _itemsCache.ensure();
    const itensAfetados = [...itemsMap.values()].filter((it) => it.ambienteId === id);
    for (const it of itensAfetados) await this.updateItem(it.id, { ambienteId: null, mapaX: null, mapaY: null, mapaPiso: 0 });

    const photosMap = await _mapPhotosCache.ensure();
    const fotosAfetadas = [...photosMap.values()].filter((p) => p.ambienteId === id);
    for (const p of fotosAfetadas) await this.deleteAmbientePhoto(p.id);
  },

  // ---------- FOTOS DO AMBIENTE (foto do lugar + "orbs" ligados a itens) ----------
  // Ver ambientephotos.js. Cada foto pertence a um ambiente (ambienteId) e
  // guarda seus próprios orbs: [{ id, xNorm, yNorm, itemId, criadoEm }]
  // (posição normalizada 0..1 relativa ao tamanho da própria imagem, pra não
  // depender de resolução/zoom).
  //
  // `mapaX`/`mapaY`/`mapaPiso` (opcionais, ver js/photogrid.js e
  // mapview.js _refreshFotosNoMapa): posição da FOTO na planta baixa 2D —
  // mesmo conceito/mesma unidade/mesma convenção de `item.mapaX`/`mapaY`/
  // `mapaPiso` (metros no espaço do mapa, `piso` = andar, default 0 quando
  // colocada — ver Mapping/mapview.js), só que aqui é a foto inteira que
  // ganha um pino, não um item do catálogo. `undefined`/`null` (o padrão,
  // inclusive em toda foto já existente) significa "ainda sem lugar na
  // planta" — cai na "📦 Caixa" (ver PhotoGrid.getUnsorted). Preenchido pelo
  // "modal de vincular" que abre logo depois de tirar uma foto na tela
  // "Fotos" (ver js/capture.js _openPhotoLinkModal): tanto por um toque
  // deliberado na planta (mapaX/mapaY "de verdade", mapaAuto ausente/false)
  // quanto por um posicionamento automático de reserva na periferia do mapa
  // (ver Mapping.findPeripheralSlot) quando a pessoa opta por não vincular
  // ainda — nesse segundo caso `mapaAuto: true` também é gravado (ver campo
  // abaixo).
  //
  // `mapaAuto` (opcional, mesmo conceito/mesmo nome de `item.mapaAuto` acima
  // — ver comentário lá): `true` só quando mapaX/mapaY foram preenchidos
  // automaticamente (posição de reserva/periferia), nunca por um toque
  // deliberado na planta. Uma foto com `mapaAuto: true` continua aparecendo
  // como pino no mapa (fácil de achar) mas continua contando como "sem
  // lugar" pra 📦 Caixa (ver PhotoGrid.getUnsorted) até alguém a posicionar
  // de propósito (o que também limpa esta flag).
  //
  // `mapaLayerId` (NOVO, 03/09/2026 — pedido do usuário: "O orb de foto
  // também deve pertencer a uma camada") — mesmo campo/mesma convenção de
  // `item.mapaLayerId` (ver Mapping.resolveLayerId/ensureAllElementsLayered
  // em mapping.js): id da camada do mapa a que este pino pertence, pra
  // participar do sistema de camadas (visibilidade, isolamento de
  // interação — ver mapview.js `_layersInteragiveis`). `null`/ausente até a
  // 1ª vinculação de propósito (ver `_placePhotoPinAtWorld`, mapview.js).
  async addAmbientePhoto(data) {
    const id = data.id || uuid();
    const ts = nowISO();
    const rec = {
      id,
      ambienteId: data.ambienteId || null,
      // NOVO (03/09/2026), pedido verbatim: "Deve haver uma separação entre
      // as fotos dos ambientes e as fotos que objetivam que apareça só o
      // número de patrimônio." — antes disto, TODA foto tirada em 'Fotos'
      // (ver capture.js) virava uma mapPhoto igual, mesmo quando a pessoa
      // escolhia "🏷️ Este é um patrimônio" no modal de vínculo (só uma foto
      // do NÚMERO/etiqueta, pra registro do item — nunca deveria aparecer
      // misturada com fotos de ambiente de verdade em 'Mapa'->'Foto'/📦
      // Caixa). `tipo: 'ambiente'` (padrão, cobre toda foto tirada sem essa
      // intenção específica) | `'patrimonio'` (marcado por capture.js
      // _openPhotoLinkModal quando a foto vira o anexo de um item — ver
      // item.fotoAnexadaId). Ver DB.getPhotosByAmbiente/PhotoGrid.getUnsorted
      // pra onde esse filtro é aplicado.
      tipo: data.tipo === 'patrimonio' ? 'patrimonio' : 'ambiente',
      nome: data.nome || '',
      // Setor do ambiente NO MOMENTO em que a foto foi tirada — pedido do
      // usuário (27/08/2026), parte dos 5 dados que uma marcação em foto
      // carrega consigo para o item marcado nela (ver `marcacoesFotos` em
      // addItem/addFotoMarcacaoAoItem). Preenchido pelos pontos que criam uma
      // foto nova (capture.js/ambientephotos.js/app.js) a partir do setor da
      // sessão de captura corrente; ausente em fotos já existentes de antes
      // desta mudança (fica string vazia, igual a um item sem setor).
      setor: data.setor || '',
      dataUrl: data.dataUrl || null,
      thumbDataUrl: data.thumbDataUrl || data.dataUrl || null,
      orbs: data.orbs || [],
      mapaX: typeof data.mapaX === 'number' ? data.mapaX : null,
      mapaY: typeof data.mapaY === 'number' ? data.mapaY : null,
      mapaPiso: typeof data.mapaPiso === 'number' ? data.mapaPiso : null,
      mapaAuto: data.mapaAuto === true,
      mapaLayerId: data.mapaLayerId || null,
      criadoEm: ts,
      atualizadoEm: ts,
    };
    await tx([STORES.mapPhotos], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.mapPhotos).add(rec)));
    const map = await _mapPhotosCache.ensure();
    map.set(id, rec);
    return cloneRec(rec);
  },

  /** Regrava a foto inteira (usado ao adicionar/editar/remover um orb, renomear etc.). */
  async saveAmbientePhoto(photoObj) {
    const rec = { ...photoObj, atualizadoEm: nowISO() };
    await tx([STORES.mapPhotos], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.mapPhotos).put(rec)));
    const map = await _mapPhotosCache.ensure();
    map.set(rec.id, rec);
    return cloneRec(rec);
  },

  async getAmbientePhoto(id) {
    const map = await _mapPhotosCache.ensure();
    return cloneRec(map.get(id));
  },

  /** Fotos de AMBIENTE de um mapa (usada por 'Mapa'->'Foto'/'Planta baixa'
   *  e telas de ambiente de organizeview.js) — exclui de propósito fotos
   *  marcadas `tipo: 'patrimonio'` (ver comentário grande em
   *  addAmbientePhoto): estas são só a foto do NÚMERO de um item, não devem
   *  se misturar com a grade/orbs de fotos de ambiente de verdade. */
  async getPhotosByAmbiente(ambienteId) {
    const map = await _mapPhotosCache.ensure();
    return [...map.values()]
      .filter((r) => r.ambienteId === ambienteId && r.tipo !== 'patrimonio')
      .map(cloneRec)
      .sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || ''));
  },

  async getAllAmbientePhotos() {
    const map = await _mapPhotosCache.ensure();
    return [...map.values()].map(cloneRec);
  },

  /** NOVO (04/09/2026), pedido verbatim: "No card de informações do
   *  patrimônio deve ter mais uma informação: 'Marcação em foto'... Quando
   *  clicado, vai até a foto (em 'Mapa'->'Foto') e destaca visualmente o
   *  orb do patrimônio naquela foto." — acha a 1ª foto de AMBIENTE (nunca
   *  `tipo:'patrimonio'`, ver addAmbientePhoto -- essas nunca têm orbs de
   *  propósito) que tenha um orb com `itemId` igual ao pedido. Varre
   *  `getAllAmbientePhotos()` (poucas fotos tipicamente, sem necessidade de
   *  índice/cache próprio) -- se um item algum dia tiver mais de um orb em
   *  fotos diferentes (não impedido em nenhum lugar), retorna só o
   *  PRIMEIRO encontrado (ordem não garantida entre chamadas -- uso atual
   *  é só "achar UM lugar pra mostrar", não "achar todos"). */
  async findOrbFotoByItem(itemId) {
    if (!itemId) return null;
    const fotos = await this.getAllAmbientePhotos();
    for (const foto of fotos) {
      if (foto.tipo === 'patrimonio') continue;
      const orb = (foto.orbs || []).find((o) => o.itemId === itemId);
      if (orb) return { photo: foto, orb };
    }
    return null;
  },

  async deleteAmbientePhoto(id) {
    await tx([STORES.mapPhotos], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.mapPhotos).delete(id)));
    const map = await _mapPhotosCache.ensure();
    map.delete(id);
  },

  // ---------- SETTINGS ----------
  async getSetting(key, fallback = null) {
    const map = await _settingsCache.ensure();
    const rec = map.get(key);
    return rec ? rec.value : fallback;
  },

  async setSetting(key, value) {
    const rec = { key, value };
    await tx([STORES.settings], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.settings).put(rec)));
    const map = await _settingsCache.ensure();
    map.set(key, rec);
    // NOVO (01/09/2026), item GRANDE #3 do pedido de 12 itens: "As
    // configurações e opções de menu devem ser guardadas em um arquivo a
    // parte" — ver js/serverprefs.js (ServerPrefs.scheduleSync, debounced).
    // Só dispara pra chaves de PREFERÊNCIA de verdade
    // (`SettingsView.CHAVES_PREFERENCIA`, mesma lista do botão "Redefinir
    // padrões do app") — NUNCA pra estado/dado/timestamp operacional
    // (`ambienteAtualId`, `syncUltimaEm`, os próprios
    // `serverPrefsUltimaEm`/`serverBackupUltimaEm` que ServerPrefs grava de
    // volta aqui...), senão cada `setSetting` do app inteiro (a maioria sem
    // nada a ver com "opção de configuração") reagendaria um envio ao
    // servidor à toa — e, pior, `serverPrefsUltimaEm` reagendando A SI
    // MESMO criaria um laço infinito de reenvio a cada 4s pra sempre.
    if (window.SettingsView?.CHAVES_PREFERENCIA?.includes(key)) window.ServerPrefs?.scheduleSync?.();
    // NOVO (07/09/2026) — mantém `_saveDestinoCache` (ver `_emitSaveStatus`
    // acima) sempre atual, sem precisar reabrir o app: assim que a URL do
    // servidor ou os checkboxes "Guardar no IndexedDB"/"Guardar no
    // servidor" mudam em Configurações, a PRÓXIMA gravação já mostra a
    // mensagem certa.
    if (key === 'servidorUrl') _saveDestinoCache.servidorUrl = value || '';
    if (key === 'guardarIndexedDB') _saveDestinoCache.guardarIndexedDB = !!value;
    if (key === 'autoSaveAtivo') _saveDestinoCache.guardarServidor = !!value;
  },

  // NOVO (01/09/2026), item #4 do pedido de 12 itens: "Nas 'configurações do
  // app' deve ter um botão para redefinir os padrões do app (deve afetar
  // todas as opções de todos os menus do app)." Faltava uma forma de REMOVER
  // uma chave da store `settings` (só existia `setSetting`, que sempre
  // GRAVA um valor) — sem isto, "redefinir" teria que conhecer o valor
  // padrão de cada uma das ~35 chaves espalhadas por 10 arquivos diferentes
  // (settings.js, autoexport.js, icons.js, mapview.js, perf.js, ...) num
  // único lugar central, e esses defaults ficariam DUPLICADOS (um no
  // arquivo dono da opção, outro no botão de reset) — arriscando os dois
  // ficarem dessincronizados no futuro. Removendo a chave em vez de
  // reescrevê-la, cada `getSetting(chave, padrão)` volta a cair no próprio
  // `padrão` já escrito ali do lado de quem lê — a fonte da verdade
  // continua sendo uma só. Ver `SettingsView._resetarPadroesDoApp` (js/
  // settings.js) pra a lista completa de chaves resetadas e as que são
  // deliberadamente PRESERVADAS (mapa atual selecionado, nome da
  // conferência, identidade do aparelho, dados/backups).
  async deleteSetting(key) {
    await tx([STORES.settings], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.settings).delete(key)));
    const map = await _settingsCache.ensure();
    map.delete(key);
    // Mesmo gatilho de ServerPrefs que setSetting logo acima (ver comentário
    // grande lá) — o botão "Redefinir padrões do app" chama `deleteSetting`
    // pra cada chave preferência, e essas mudanças também precisam chegar
    // ao arquivo de preferências do servidor (senão ele ficaria com valores
    // velhos depois de um reset).
    if (window.SettingsView?.CHAVES_PREFERENCIA?.includes(key)) window.ServerPrefs?.scheduleSync?.();
    // NOVO (07/09/2026) — mesmo motivo do comentário grande em `setSetting`
    // acima: chave apagada volta pro respectivo padrão (servidorUrl='',
    // guardarIndexedDB=TRUE — pedido verbatim, autoSaveAtivo=false).
    if (key === 'servidorUrl') _saveDestinoCache.servidorUrl = '';
    if (key === 'guardarIndexedDB') _saveDestinoCache.guardarIndexedDB = true;
    if (key === 'autoSaveAtivo') _saveDestinoCache.guardarServidor = false;
  },

  // ---------- MODELOS 3D CUSTOMIZADOS POR TIPO ----------
  // NOVO (01/09/2026), item GRANDE #5 do pedido de 12 itens, verbatim:
  // "Deve ser possível editar o modelo dos objetos 3D padrão. Também devem
  // ter dois modelos: um mais detalhado e um low poly (para melhorar
  // desempenho)." `nivel` é sempre 'detalhado' ou 'lowpoly'. O registro
  // guarda o MESMO formato `{vertices, edges, faces}` que `obj.customMesh`
  // já usa pro Modelador 3D de objeto único (ver modeler-core.js) — assim o
  // Modelador não precisa aprender um formato novo, só um destino novo pra
  // salvar (ver js/modeler/modeler-core.js `_salvarModelo`).
  async getObjectModel(tipo, nivel) {
    const map = await _objectModelsCache.ensure();
    const rec = map.get(_chaveObjectModel(tipo, nivel));
    return rec ? cloneRec(rec) : null;
  },

  /** Os dois níveis de um tipo de uma vez só — { detalhado, lowpoly }, cada
   *  um `null` se aquele nível ainda não foi customizado (cai no builder
   *  padrão/hard-coded, ver engine3d.js `_buildOneObjectMesh`). */
  async getObjectModelsForTipo(tipo) {
    const map = await _objectModelsCache.ensure();
    return {
      detalhado: cloneRec(map.get(_chaveObjectModel(tipo, 'detalhado'))) || null,
      lowpoly: cloneRec(map.get(_chaveObjectModel(tipo, 'lowpoly'))) || null,
    };
  },

  async getAllObjectModels() {
    const map = await _objectModelsCache.ensure();
    return [...map.values()].map(cloneRec);
  },

  async setObjectModel(tipo, nivel, mesh) {
    const id = _chaveObjectModel(tipo, nivel);
    const rec = { id, tipo, nivel, mesh, modificadoEm: nowISO() };
    await tx([STORES.objectModels], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.objectModels).put(rec)));
    const map = await _objectModelsCache.ensure();
    map.set(id, rec);
  },

  async deleteObjectModel(tipo, nivel) {
    const id = _chaveObjectModel(tipo, nivel);
    await tx([STORES.objectModels], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.objectModels).delete(id)));
    const map = await _objectModelsCache.ensure();
    map.delete(id);
  },

  // ---------- ARMAZENAMENTO PERSISTENTE ----------
  // Sem isto, o navegador PODE (em casos raros, mas pode — principalmente em
  // celulares com pouquíssimo espaço livre) apagar sozinho os dados deste
  // site (IndexedDB do catálogo E localStorage das listas leves/log) para
  // liberar espaço para outros sites, sem avisar. Pedir "armazenamento
  // persistente" avisa o navegador que estes dados importam e não devem ser
  // removidos automaticamente — só se a própria pessoa limpar os dados do
  // site manualmente (ou desinstalar o navegador). Cobre a origem inteira
  // (IndexedDB + localStorage juntos), não só uma das duas. Sem suporte no
  // navegador, os dados continuam salvos normalmente, só sem essa garantia
  // extra — por isso é sempre tentado, mas nunca é bloqueante. (Não passa
  // por tx()/_notifyDbError de propósito: é uma checagem best-effort, uma
  // falha aqui não indica um problema real de leitura/gravação do catálogo.)
  async requestPersistentStorage() {
    try {
      if (!navigator.storage?.persist) return { suportado: false, persistido: false };
      const jaEstava = await navigator.storage.persisted?.();
      if (jaEstava) return { suportado: true, persistido: true };
      const concedido = await navigator.storage.persist();
      return { suportado: true, persistido: concedido };
    } catch (e) {
      return { suportado: false, persistido: false, erro: e.message };
    }
  },

  async isStoragePersisted() {
    try { return !!(await navigator.storage?.persisted?.()); } catch (e) { return false; }
  },

  async storageEstimate() {
    try { return (await navigator.storage?.estimate?.()) || null; } catch (e) { return null; }
  },

  async getAllSettings() {
    const map = await _settingsCache.ensure();
    const obj = {};
    map.forEach((r, k) => { obj[k] = r.value; });
    return obj;
  },

  // ---------- EXPORT / IMPORT (backup, email, servidor) ----------
  async exportAll() {
    const [items, types, sectors, maps, mapPhotos, settings, objectModels] = await Promise.all([
      this.getAllItems(), this.getAllTypes(), this.getAllSectors(), this.getAllMaps(), this.getAllAmbientePhotos(), this.getAllSettings(),
      // NOVO (01/09/2026), item GRANDE #5: os modelos 3D customizados por
      // tipo entram no backup completo (servidor E exportação manual) —
      // senão "excluir os dados do navegador" (o próprio cenário que
      // motivou o item GRANDE #3, servidor local) perderia um modelo
      // customizado sem nenhuma forma de recuperar.
      this.getAllObjectModels(),
    ]);
    return {
      versao: 1,
      exportadoEm: nowISO(),
      items, types, sectors, maps, mapPhotos, settings, objectModels,
    };
  },

  /** Só CONTA quantos mapas de `maps` já colidem com um mapa local (mesmo
   *  id) — mesmo espírito de countImportConflicts(), só que para mapas (ver
   *  importMaps logo abaixo). Usado pra decidir se vale perguntar algo ao
   *  usuário antes de importar (nenhum mapa colidindo = nada pra perguntar,
   *  todos entram como mapas novos direto). */
  async countMapConflicts(maps) {
    if (!maps?.length) return 0;
    const local = await _mapsCache.ensure();
    return maps.filter((m) => m?.id && local.has(m.id)).length;
  },

  /** Igual a `countMapConflicts`, mas devolve o PAR completo `{m, existente}`
   *  de cada mapa colidente (não só a contagem) — pedido do usuário
   *  (28/08/2026): "se há várias coisas para decidir, deve aparecer em uma
   *  única janela. Não ficar aparecendo uma janela por decisão a se tomar."
   *  Usado por `Utils.importMapsWithConflictUI` (ver utils.js) pra montar
   *  de uma vez TODAS as linhas do modal de mesclagem em lote, em vez de
   *  perguntar mapa por mapa dentro do loop de `importMaps`. */
  async findMapConflicts(maps) {
    if (!maps?.length) return [];
    const local = await _mapsCache.ensure();
    const pares = [];
    for (const m of maps) {
      if (!m?.id) continue;
      const existente = local.get(m.id);
      if (existente) pares.push({ m, existente: cloneRec(existente) });
    }
    return pares;
  },

  /** Conta quantos itens/fotos do CATÁLOGO LOCAL (já salvos neste aparelho)
   *  apontam pra um mapa (`ambienteId`) — pedido do usuário (28/08/2026):
   *  "para cada mapa, no momento da escolha [de mesclagem], deve aparecer a
   *  quantidade... de itens/objetos/coisas que tem nele." Usado por
   *  `Utils.importMapsWithConflictUI` (ver utils.js) pra montar as "flags"
   *  de contagem do lado "já existe neste aparelho" — o lado "novo" (backup,
   *  ou resultado de "Unificar fontes diferentes") é contado por quem chama,
   *  que já tem essa lista em memória (não precisa ir ao banco pra isso). */
  async countLinkedToMap(mapId) {
    const [itemsMap, photosMap] = await Promise.all([_itemsCache.ensure(), _mapPhotosCache.ensure()]);
    const itens = [...itemsMap.values()].filter((it) => it.ambienteId === mapId).length;
    const fotos = [...photosMap.values()].filter((p) => p.ambienteId === mapId).length;
    return { itens, fotos };
  },

  /**
   * Importa mapas de um backup — pedido do usuário (28/08/2026): "o botão
   * importar tem que ter a nova interpretação das coisas. Agora há a
   * possibilidade de criar mais de um mapa e fotos são atreladas a cada
   * mapa, além dos patrimônios." Substitui a suposição antiga de "mapa único
   * pra sempre" (ver histórico abaixo — `replaceMapFloorPlan`/o reencaixe
   * forçado em `getOrCreateSingleMap` que existiam aqui foram REMOVIDOS):
   * até aqui, TODO `dump.maps` era simplesmente IGNORADO na importação, e
   * toda foto/planta do backup era jogada dentro do único mapa "atual" do
   * aparelho — com múltiplos mapas (rodada 6) isso silenciosamente perdia ou
   * misturava mapas/fotos vindos de outro ambiente que não o "atual".
   *
   * Agora cada mapa do backup é tratado como uma entidade própria, igual a
   * um patrimônio: sem conflito (id que ainda não existe aqui) é criado
   * direto, preservando seu id — é assim que itens/fotos que apontam pra
   * ele (`ambienteId`) continuam batendo certinho depois de reencaixados
   * (ver `idRemap` abaixo). Com conflito (mesmo id de um mapa já local, ex.:
   * reimportando o próprio backup no mesmo aparelho), segue `onDuplicate`:
   *  - 'ambos': cria uma CÓPIA do mapa importado com id NOVO (mantém os
   *    dois mapas separados, o nome ganha "(importado)" pra diferenciar).
   *  - 'substituir': sobrescreve só a PLANTA (paredes/pontos/câmeras/
   *    objetos/textos/portas/janelas/camadas/bounds/modo) do mapa LOCAL já
   *    existente com a do backup — mesma ideia da extinta
   *    `replaceMapFloorPlan`, só que mirada no mapa certo por id, não mais
   *    "o mapa atual". Mantém id/nome/criadoEm/parentId locais intactos.
   *  - 'manter': ignora a versão do backup — o mapa local não é tocado (o id
   *    já bate com ele, então itens/fotos que apontam pra este id continuam
   *    funcionando normalmente, sem precisar de remapeamento nenhum).
   * Devolve { idRemap, criados, atualizados, mantidos, criadosMaps,
   * atualizadosAntes } — `idRemap` é um Map(idNoBackup -> idFinalLocal) que
   * quem chama (settings.js) usa pra reencaixar `item.ambienteId` e
   * `mapPhoto.ambienteId` dos registros importados no mapa que eles
   * REALMENTE pertenciam no backup (ver importSupplementary logo abaixo),
   * em vez de tudo cair no mapa "atual" do aparelho.
   */
  async importMaps(maps, onDuplicate = 'ambos') {
    const idRemap = new Map();
    let criados = 0, atualizados = 0, mantidos = 0;
    const criadosMaps = [], atualizadosAntes = [];
    const local = await _mapsCache.ensure();
    const CAMPOS_PLANTA = ['walls', 'points', 'trilha', 'cameras', 'objects', 'textos', 'portas', 'janelas', 'layers', 'bounds', 'modo'];
    for (const m of maps || []) {
      if (!m || !m.id) continue;
      const existente = local.get(m.id);
      if (!existente) {
        const salvo = await this.saveMap({ ...m });
        idRemap.set(m.id, salvo.id);
        criados++; criadosMaps.push(salvo);
        continue;
      }
      // `onDuplicate` pode ser uma string (regra igual pra todos) OU uma
      // função assíncrona `(m, existente) => 'ambos'|'substituir'|'manter'`
      // (revisão mapa a mapa) — pedido do usuário (28/08/2026): "Deve ser
      // possível decidir qual mapa vai ficar" — ver Utils.importMapsWithConflictUI.
      const decisao = typeof onDuplicate === 'function' ? await onDuplicate(m, cloneRec(existente)) : onDuplicate;
      if (decisao === 'substituir') {
        const antes = cloneRec(existente);
        const novo = { ...existente };
        for (const campo of CAMPOS_PLANTA) if (m[campo] !== undefined) novo[campo] = m[campo];
        const salvo = await this.saveMap(novo);
        idRemap.set(m.id, salvo.id);
        atualizados++; atualizadosAntes.push({ before: antes, importado: m });
        continue;
      }
      if (decisao === 'ambos') {
        const copia = { ...m, id: uuid(), nome: `${m.nome || 'Ambiente'} (importado)` };
        const salvo = await this.saveMap(copia);
        idRemap.set(m.id, salvo.id);
        criados++; criadosMaps.push(salvo);
        continue;
      }
      // 'manter': mapa local existente não é tocado — o id do backup já bate com ele.
      idRemap.set(m.id, existente.id);
      mantidos++;
    }
    return { idRemap, criados, atualizados, mantidos, criadosMaps, atualizadosAntes };
  },

  /** Mescla as listas complementares de um backup (tipos/setores/fotos de
   *  ambiente salvos) — sem itens (que passam por countImportConflicts()/
   *  importItems(), acima) nem mapas (que passam por importMaps(), acima —
   *  chamado ANTES desta função, pra já ter `mapIdRemap` pronto).
   *
   *  Fotos de ambiente (`dump.mapPhotos`, do backup completo, OU
   *  `dump.fotosDeAmbiente`, do formato categorizado de "⬇️ Exportar" —
   *  mesmo formato de registro nas duas chaves, ver settings.js
   *  `_openExportModal`; ESTA SEGUNDA CHAVE não era lida aqui até esta
   *  correção, então um backup exportado só com a categoria "Imagens"
   *  simplesmente não trazia nenhuma foto de volta — pedido do usuário:
   *  "Exportei os mapas e fotos ligadas a eles, depois importei, porém não
   *  aparecem"): cada foto tem seu `ambienteId` reencaixado via
   *  `mapIdRemap` (o mapa de onde ela REALMENTE veio no backup, não mais
   *  "o mapa atual" do aparelho como antes). Uma foto cujo `ambienteId` não
   *  está no remapeamento (backup antigo sem informação de mapa nenhuma, ou
   *  um id que nem o remapeamento nem nenhum mapa local reconhece) cai pro
   *  mapa "atual" do aparelho como último recurso — pra nunca perder a foto,
   *  mesmo sem saber de qual mapa ela era. */
  async importSupplementary(dump, { mapIdRemap = null } = {}) {
    if (!dump) return false;
    const fotosAmbiente = [...(dump.mapPhotos || []), ...(dump.fotosDeAmbiente || [])];
    let singleMap = null; // só busca o mapa "atual" se realmente precisar (fallback abaixo)
    const local = await _mapsCache.ensure();
    const fotosRemapeadas = [];
    for (const p of fotosAmbiente) {
      if (!p || !p.id) continue;
      if (!p.ambienteId) { fotosRemapeadas.push(p); continue; }
      let destino = mapIdRemap?.get(p.ambienteId) || (local.has(p.ambienteId) ? p.ambienteId : null);
      if (!destino) {
        if (!singleMap) singleMap = await this.getOrCreateSingleMap();
        destino = singleMap.id;
      }
      fotosRemapeadas.push({ ...p, ambienteId: destino });
    }
    // NOVO (01/09/2026), item GRANDE #5: modelos 3D customizados por tipo
    // (`dump.objectModels`, do backup completo — ver exportAll acima) também
    // são globais como types/sectors (não pertencem a um mapa específico),
    // por isso entram aqui e não em importMaps/importItems.
    await tx([STORES.types, STORES.sectors, STORES.mapPhotos, STORES.objectModels], 'readwrite', async (t) => {
      for (const t2 of dump.types || []) await reqToPromise(t.objectStore(STORES.types).put(t2));
      for (const s of dump.sectors || []) await reqToPromise(t.objectStore(STORES.sectors).put(s));
      for (const p of fotosRemapeadas) await reqToPromise(t.objectStore(STORES.mapPhotos).put(p));
      for (const m of dump.objectModels || []) await reqToPromise(t.objectStore(STORES.objectModels).put(m));
    });
    const [tMap, sMap, pMap, mMap] = await Promise.all([
      _typesCache.ensure(), _sectorsCache.ensure(), _mapPhotosCache.ensure(), _objectModelsCache.ensure(),
    ]);
    (dump.types || []).forEach((r) => tMap.set(r.nome, r));
    (dump.sectors || []).forEach((r) => sMap.set(r.nome, r));
    fotosRemapeadas.forEach((r) => pMap.set(r.id, r));
    (dump.objectModels || []).forEach((r) => mMap.set(r.id, r));
    return true;
  },

  /** Para a revisão de import ITEM A ITEM (usada quando o usuário desmarca
   *  "aplicar a todos" na tela de conflitos): devolve { existente, porId }
   *  se este item colide com algo já cadastrado (mesmo ID ou mesmo
   *  patrimônio), ou null se não há conflito nenhum (pode ser importado
   *  direto, sem perguntar nada). Mesma regra de colisão usada em
   *  countImportConflicts()/importItems(), só que item a item. */
  async findImportConflict(raw) {
    if (!raw) return null;
    const porId = raw.id ? await this.getItem(raw.id) : null;
    if (porId) return { existente: porId, porId: true };
    if (raw.patrimonio) {
      const porPatrimonio = await this.getItemByPatrimonio(raw.patrimonio);
      if (porPatrimonio) return { existente: porPatrimonio, porId: false };
    }
    return null;
  },

  /** Aplica a decisão de UM item de import já resolvido (usada pela revisão
   *  um-a-um E pela importação em lote em settings.js) — mesma semântica de
   *  'ambos'/'atualizar' de importItems(), só que decidida item a item.
   *  Devolve { tipo: 'criado'|'atualizado'|'ignorado', item } — `item` é o
   *  registro salvo (com o id real, útil pra depois desfazer a importação
   *  inteira: um "criado" vira DB.deleteItem(item.id), um "atualizado" tem
   *  o "antes" em conflito.existente para restaurar com DB.putItemRaw). */
  async applyImportDecision(raw, conflito, decisao) {
    if (decisao === 'pular') return { tipo: 'ignorado' };
    if (!conflito) { const item = await this.addItem(raw); return { tipo: 'criado', item }; }
    if (decisao === 'atualizar') { const item = await this.updateItem(conflito.existente.id, raw); return { tipo: 'atualizado', item }; }
    // 'ambos': mesma regra de importItems() — se o ID batia, gera um novo
    // pra não colidir; se só o patrimônio batia (IDs já diferentes), entra
    // como está.
    const item = conflito.porId ? await this.addItem({ ...raw, id: uuid() }) : await this.addItem(raw);
    return { tipo: 'criado', item };
  },

  /** Só CONTA quantos itens de `items` já colidem com algo existente (mesmo
   *  ID ou mesmo patrimônio) — usado pra decidir se vale perguntar algo ao
   *  usuário antes de importar (um backup 100% novo não pergunta nada). */
  async countImportConflicts(items) {
    let n = 0;
    for (const raw of items || []) {
      if (!raw) continue;
      const porId = raw.id ? await this.getItem(raw.id) : null;
      const porPatrimonio = (!porId && raw.patrimonio) ? await this.getItemByPatrimonio(raw.patrimonio) : null;
      if (porId || porPatrimonio) n++;
    }
    return n;
  },

  /**
   * Importa itens de um backup, resolvendo duplicados (mesmo ID OU mesmo
   * patrimônio já cadastrado aqui) de acordo com `onDuplicate`:
   *  - 'ambos': mantém os dois registros. Se o ID batia com um item já
   *    existente, gera um ID NOVO para o item importado (evita dois itens
   *    com o mesmo ID — inconsistência); se só o patrimônio batia (IDs já
   *    diferentes), entra como está — os IDs já são únicos, sem problema.
   *  - 'atualizar': mescla os dados importados no item já existente (por ID,
   *    ou por patrimônio quando o ID não bate mas o patrimônio sim) — nunca
   *    cria um registro duplicado. Só os campos presentes no arquivo são
   *    tocados (um backup parcial nunca apaga campos que não exportou).
   * Um item sem nenhum conflito é sempre criado normalmente, com os padrões
   * de sempre preenchendo o que faltar (ver addItem).
   */
  async importItems(items, { onDuplicate = 'ambos' } = {}) {
    let criados = 0, atualizados = 0, ignorados = 0;
    for (const raw of items || []) {
      if (!raw || (!raw.id && !raw.patrimonio && !raw.descricao)) { ignorados++; continue; }
      const porId = raw.id ? await this.getItem(raw.id) : null;
      const porPatrimonio = (!porId && raw.patrimonio) ? await this.getItemByPatrimonio(raw.patrimonio) : null;
      const existente = porId || porPatrimonio;

      if (!existente) {
        await this.addItem(raw); // addItem já preserva raw.id quando presente
        criados++;
        continue;
      }

      if (onDuplicate === 'atualizar') {
        await this.updateItem(existente.id, raw); // updateItem força o id do item EXISTENTE de qualquer forma
        atualizados++;
      } else {
        if (porId) {
          await this.addItem({ ...raw, id: uuid() }); // mesmo ID batia: gera um novo pra não colidir
        } else {
          await this.addItem(raw); // só o patrimônio batia, IDs já diferentes — entra como está
        }
        criados++;
      }
    }
    return { criados, atualizados, ignorados };
  },

  // ---------- PERSP MATCH (sessões de "📐 Camera Match") ----------
  // [10/09/2026] Implementação da spec 'Camera Matching / Persp Match'
  // solicitada pelo usuário (ver doc do projeto
  // 'spec-camera-matching-persp-match.md', seção 3 "Estrutura de Dados").
  // Uma sessão preserva a FOTO original + toda a calibração (EXIF, linhas de
  // fuga, âncoras de escala, objetos posicionados) para permitir reabrir e
  // ajustar mais tarde sem repetir o trabalho manual — NUNCA é, ela mesma,
  // um objeto do mapa (câmera/objeto calibrados são gravados à parte, via
  // Mapping.addCamera/addObject, quando a sessão é confirmada — ver
  // js/perspmatch.js `_confirmarSalvar`). Mesmo padrão de CRUD das outras
  // stores deste arquivo (cache local + put/delete espelhando o cache).
  async savePerspMatchSession(session) {
    const rec = { ...session, atualizadoEm: nowISO() };
    if (!rec.criadoEm) rec.criadoEm = rec.atualizadoEm;
    await tx([STORES.perspMatchSessions], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.perspMatchSessions).put(rec)));
    const map = await _perspMatchCache.ensure();
    map.set(rec.id, rec);
    return cloneRec(rec);
  },

  async getPerspMatchSession(id) {
    const map = await _perspMatchCache.ensure();
    return cloneRec(map.get(id));
  },

  /** Todas as sessões vinculadas a UM mapa — usado pra listar "sessões Persp
   *  Match já feitas neste mapa" (reabrir/ajustar) na entrada da ferramenta. */
  async getPerspMatchSessionsForMapa(mapaId) {
    const map = await _perspMatchCache.ensure();
    return [...map.values()].filter((r) => r.mapaId === mapaId).map(cloneRec)
      .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
  },

  async deletePerspMatchSession(id) {
    await tx([STORES.perspMatchSessions], 'readwrite', (t) => reqToPromise(t.objectStore(STORES.perspMatchSessions).delete(id)));
    const map = await _perspMatchCache.ensure();
    map.delete(id);
  },
};

window.DB = DBApi;
