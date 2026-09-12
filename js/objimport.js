/**
 * objimport.js — Importação de objetos 3D customizados a partir de
 * arquivos .obj (pedido do usuário, rodada 51: "Deve ser possível carregar
 * arquivos .obj de modo que sejam incorporados ao app [...] um botão de
 * importar .obj para que apareça junto com os demais objetos. Caso esteja
 * rodando por servidor, uma requisição é feita ao servidor para listar o
 * diretório dos objetos e retorná-los. Caso esteja operando por 'file:///'
 * deve aparecer um botão para importar manualmente. Deste jeito fica na
 * memória RAM, enquanto a página não der refresh.").
 *
 * Guardado 100% em memória (array `_items`, nunca gravado no IndexedDB nem
 * em `localStorage`) — some sozinho se a página recarregar, exatamente
 * como pedido. Cada item vira uma entrada a mais no catálogo de objetos do
 * 3D (ver `getCatalogEntries`, consumido por view3d.js junto com
 * `Icons.mapObjectCatalog()`).
 *
 * Parser de .obj ESCRITO À MÃO aqui (não é o `OBJLoader` oficial do
 * Three.js — o projeto não vendoriza a versão examples/jsm dele, só o
 * núcleo, e adaptar o loader oficial de ES module pra `<script>` clássico
 * seria bem mais trabalho pra um app que já roda 100% offline sob
 * file:///). Cobre o caso comum: vértices (`v`), normais (`vn`) e faces
 * (`f`, com ou sem `/vt`/`/vn`, triangulando faces com mais de 3 vértices
 * por leque/fan) — sem suporte a grupos/materiais (`.mtl`), curvas ou
 * "free-form surfaces". Suficiente pra malhas simples exportadas de
 * qualquer editor 3D comum (Blender, SketchUp, etc. exportando OBJ triangulado
 * ou em quads).
 */
const ObjImport = {
  _items: [], // [{ key, label, text, geom: {positions,normals,bbox} | null }]
  _nextId: 1,
  _serverFetchTried: false,
  // "Enquanto os arquivos estão sendo processados [...] deve aparecer um
  // ícone com mensagem avisando que está carregando ainda" (pedido do
  // usuário, rodada 52) — contador simples (não booleano) porque
  // `importFiles`/`tryLoadFromServer` podem, em teoria, rodar ao mesmo
  // tempo (usuário clica "importar" enquanto a busca automática do
  // servidor ainda está em andamento) — só fica "ocioso" quando NENHUma
  // das duas está rodando. `_busyListeners` — pub/sub simples (sem
  // depender de nenhum framework de eventos do projeto) pra quem exibe o
  // aviso (mapview.js, tela "Mapa") saber a hora exata de atualizar, em vez
  // de ficar consultando num intervalo.
  _busyCount: 0,
  _busyListeners: [],

  isBusy() { return this._busyCount > 0; },
  onBusyChange(fn) { this._busyListeners.push(fn); },
  offBusyChange(fn) { this._busyListeners = this._busyListeners.filter((f) => f !== fn); },
  _setBusy(delta) {
    this._busyCount = Math.max(0, this._busyCount + delta);
    this._busyListeners.forEach((fn) => { try { fn(this.isBusy()); } catch (e) { /* nunca deixa um listener quebrado travar a importação */ } });
  },

  /** `true` só pra chaves geradas por este módulo — usado por engine3d.js
   *  (dispatcher `_buildOneObjectMesh`) e view3d.js (footprint/ghost) pra
   *  decidir se um `obj.tipo` é um objeto importado, sem precisar de nenhum
   *  outro campo extra no objeto do mapa. */
  isCustomKey(key) { return typeof key === 'string' && key.startsWith('objimport:'); },

  /** Lê o texto de um arquivo .obj e monta a geometria (vértices já
   *  triangulados). Não lança — devolve `null` num arquivo vazio/sem
   *  nenhuma face válida, pra quem chama avisar o usuário em vez de
   *  quebrar. */
  _parseObjText(text) {
    const verts = []; // [ [x,y,z], ... ] — 1 entrada por linha "v"
    const norms = []; // [ [x,y,z], ... ] — 1 entrada por linha "vn"
    const outPositions = [];
    const outNormals = [];
    let outNormalsCompletas = true;
    const lines = String(text || '').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line[0] === '#') continue;
      const sp = line.indexOf(' ');
      if (sp < 0) continue;
      const tag = line.slice(0, sp);
      const rest = line.slice(sp + 1).trim();
      if (tag === 'v') {
        const p = rest.split(/\s+/).map(Number);
        if (p.length >= 3 && p.every((n) => Number.isFinite(n))) verts.push([p[0], p[1], p[2]]);
      } else if (tag === 'vn') {
        const p = rest.split(/\s+/).map(Number);
        if (p.length >= 3 && p.every((n) => Number.isFinite(n))) norms.push([p[0], p[1], p[2]]);
      } else if (tag === 'f') {
        const tokens = rest.split(/\s+/).filter(Boolean);
        if (tokens.length < 3) continue;
        const refs = tokens.map((tok) => {
          const bits = tok.split('/');
          const vi = parseInt(bits[0], 10);
          const ni = bits.length >= 3 && bits[2] ? parseInt(bits[2], 10) : null;
          return {
            v: vi > 0 ? vi - 1 : verts.length + vi, // índice negativo = relativo ao FIM da lista (padrão OBJ)
            n: ni != null ? (ni > 0 ? ni - 1 : norms.length + ni) : null,
          };
        }).filter((r) => verts[r.v]);
        if (refs.length < 3) continue;
        // Triangulação em leque (fan) — cobre triângulos (já é 1 triângulo),
        // quads (2 triângulos) e polígonos convexos simples de N lados.
        for (let i = 1; i < refs.length - 1; i++) {
          [refs[0], refs[i], refs[i + 1]].forEach((r) => {
            const p = verts[r.v];
            outPositions.push(p[0], p[1], p[2]);
            const n = r.n != null ? norms[r.n] : null;
            if (n) outNormals.push(n[0], n[1], n[2]);
            else { outNormals.push(0, 0, 0); outNormalsCompletas = false; }
          });
        }
      }
    }
    // MUDADO (07/09/2026), pedido verbatim: "Mesmo que seja um arquivo com
    // apenas um grupo de vértices, sem definição de faces e ligação para
    // definir arestas. Nesse caso, emitir uma notificação a respeito disso,
    // mas renderizar a forma mesmo assim." — ANTES, um .obj sem nenhuma face
    // válida (`outPositions.length < 9`) era REJEITADO por completo aqui
    // (`return null`), e `addFromText` avisava "não tem nenhuma face .obj
    // válida" sem importar nada. AGORA: só rejeita de verdade quando não há
    // NEM vértice nenhum (`verts.length === 0`, arquivo realmente vazio/
    // inválido) — um arquivo só com "v x y z" (sem nenhum "f") continua
    // sendo importado, com `positions: null` (nada pra triangular) e
    // `points` (a lista crua de vértices, achatada) pra quem desenha
    // (engine3d.js `_buildObjImportMesh`) cair numa NUVEM DE PONTOS em vez
    // de simplesmente não aparecer nada — "renderizar a forma mesmo assim".
    // O aviso ("emitir uma notificação") fica a cargo de `addFromText`
    // abaixo, que já sabe se `positions` veio nulo.
    if (outPositions.length < 9) {
      if (verts.length === 0) return null; // arquivo realmente sem nenhum "v" válido
      const flat = [];
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      verts.forEach((v) => {
        flat.push(v[0], v[1], v[2]);
        if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
        if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
        if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
      });
      return { positions: null, points: flat, normals: null, bbox: { minX, minY, minZ, maxX, maxY, maxZ } };
    }
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < outPositions.length; i += 3) {
      const x = outPositions[i], y = outPositions[i + 1], z = outPositions[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return {
      positions: outPositions,
      normals: outNormalsCompletas ? outNormals : null, // incompleta (algum vértice sem normal no arquivo) — deixa o THREE.js calcular todas de novo (computeVertexNormals), em vez de uma mistura de reais+zeros
      bbox: { minX, minY, minZ, maxX, maxY, maxZ },
    };
  },

  /** Adiciona um objeto ao catálogo em memória a partir do TEXTO de um
   *  .obj já lido (de um `<input type="file">` ou de uma resposta do
   *  servidor — os dois caminhos convergem aqui). `nomeArquivo` vira o
   *  rótulo mostrado na lista (sem a extensão). Devolve a entrada criada,
   *  ou `null` se o arquivo não tinha geometria válida (avisa via
   *  `Utils.toast`, se disponível). */
  addFromText(nomeArquivo, text) {
    const geom = this._parseObjText(text);
    if (!geom) {
      Utils.toast?.(`"${nomeArquivo}" não tem nenhum vértice/face .obj válido.`, { type: 'warn' });
      return null;
    }
    // NOVO (07/09/2026), pedido verbatim: "emitir uma notificação a respeito
    // disso [arquivo sem faces], mas renderizar a forma mesmo assim." — ver
    // comentário grande em `_parseObjText` acima (`geom.positions === null`
    // = arquivo só com vértices, sem nenhuma face "f").
    if (!geom.positions) {
      Utils.toast?.(`"${nomeArquivo}" importado só com vértices — o arquivo não define nenhuma face/aresta. Vai aparecer como uma nuvem de pontos no 3D (sem superfície).`, { type: 'warn', duration: 6000 });
    }
    const key = `objimport:${this._nextId++}`;
    const label = String(nomeArquivo || 'objeto').replace(/\.obj$/i, '');
    const item = { key, label, text, geom };
    this._items.push(item);
    // NOVO (07/09/2026), pedido verbatim: "Os objetos carregados devem
    // poder ser acessados pela ferramenta 'Objetos' no 2D e no 3D." — ANTES,
    // um item importado só aparecia no catálogo do 3D (view3d.js concatena
    // `getCatalogEntries()` na hotbar/painel próprios) — a ferramenta
    // "Objetos" do mapa 2D (mapview.js `_openObjectPickerPanel`/
    // `_pickObjectType`) só lê `Icons.mapObjectCatalog()`, que nunca sabia
    // desses itens. Registrar aqui em `Icons.MAP_OBJECT_EXTRAS` (MESMO
    // mecanismo que Modelos3DView usa pros tipos "custom-*" criados em
    // "➕ Criar novo modelo", ver modelos3d.js `ensureCustomTypesRegistered`)
    // resolve os dois de uma vez, sem precisar mexer em mapview.js: como
    // `mapObjectCatalog()` já lê as chaves de `MAP_OBJECT_EXTRAS`
    // DINAMICAMENTE a cada chamada (comentário de `ensureCustomTypesRegistered`),
    // o objeto aparece na hora na ferramenta "Objetos" 2D, com o MESMO ícone
    // genérico de caixa (svg abaixo, igual ao de `getCatalogEntries`) que já
    // usa no 3D — e o ícone de verdade no CANVAS 2D (`_getIconImage`/
    // `Icons.dataUrlForKey`, mapview.js) passa a desenhar algo em vez de
    // ficar em branco (ambos leem `Icons.svgForAnyKey`, que por sua vez lê
    // `MAP_OBJECT_EXTRAS`). Também dá acesso a "🎨 Representação 2D" (editor
    // de ícone SVG já existente, ver modelos3d.js `_abrirEditor2D`/
    // `customIconSvgOverrides`) — que só sabe editar chaves que já existem
    // em `MAP_OBJECT_EXTRAS`/`LIBRARY`.
    if (window.Icons?.MAP_OBJECT_EXTRAS) {
      window.Icons.MAP_OBJECT_EXTRAS[key] = { label: `📥 ${label}`, svg: this._GENERIC_SVG };
    }
    return item;
  },

  /** Geometria "crua" (posições/normais/caixa delimitadora, sem nada de
   *  Three.js) de um item já importado — `null` se a chave não existe mais
   *  (página deu refresh, ou o objeto foi salvo num mapa e reaberto depois
   *  sem reimportar o mesmo arquivo). Consumido por engine3d.js
   *  `_buildObjImportMesh`. */
  getGeometryData(key) {
    const item = this._items.find((i) => i.key === key);
    return item ? item.geom : null;
  },

  /** Caixa delimitadora (metros, direto do arquivo .obj — sem normalizar
   *  escala) de um item importado, no MESMO formato de
   *  `Engine3DProfiles.computeObjectFootprint` (`{w,d,h,shape:'box'}`) —
   *  usado pelo ghost/colisão de colocação (ver view3d.js/engine3d.js
   *  `objectFootprint`). `null` se a chave não existe (mesmos casos de
   *  `getGeometryData`). */
  getFootprint(key) {
    const geom = this.getGeometryData(key);
    if (!geom) return null;
    const { minX, maxX, minY, maxY, minZ, maxZ } = geom.bbox;
    return { w: Math.max(0.02, maxX - minX), d: Math.max(0.02, maxZ - minZ), h: Math.max(0.02, maxY - minY), shape: 'box' };
  },

  /** Entradas no MESMO formato de `Icons.mapObjectCatalog()`
   *  (`{key,label,svg}`) — view3d.js concatena isso na hotbar/painel de
   *  objetos, junto com o catálogo padrão, então um item importado aparece
   *  "junto com os demais objetos" (pedido do usuário) sem precisar de
   *  nenhuma lista separada. Ícone genérico (caixa 3D) igual pra todos —
   *  não dá pra gerar uma miniatura de verdade sem renderizar o .obj numa
   *  cena 3D à parte, fora do escopo desta rodada. */
  // Ícone genérico (caixa 3D) usado tanto aqui (catálogo do 3D) quanto no
  // registro em `Icons.MAP_OBJECT_EXTRAS` (ver `addFromText` acima, catálogo
  // 2D) — mesmo SVG, uma cópia só, pra não desalinhar os dois catálogos se
  // um dia precisar mudar o desenho. Fica sobrescrito por
  // `customIconSvgOverrides` (ver modelos3d.js) assim que o usuário desenhar
  // um ícone próprio em "🎨 Representação 2D", igual a qualquer outro tipo.
  _GENERIC_SVG: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/></svg>',
  getCatalogEntries() {
    return this._items.map((i) => ({ key: i.key, label: `📥 ${i.label}`, svg: this._GENERIC_SVG, isObjImport: true }));
  },

  /** Lista simples `{key,label}` de tudo já importado nesta sessão — usada
   *  por Modelos3DView (js/modelos3d.js) pra oferecer "🎨 Representação 2D"
   *  em cada objeto importado, junto com os 33 tipos fixos/customizados do
   *  catálogo. NOVO (07/09/2026), pedido verbatim: "no botão 'Acessar
   *  modelos' deve ser possível visualizar os objetos carregados e, também,
   *  definir um ícone 2D para cada objeto". */
  listImported() {
    return this._items.map((i) => ({ key: i.key, label: i.label }));
  },

  /** Importação manual (pedido do usuário: "Caso esteja operando por
   *  'file:///' deve aparecer um botão para importar manualmente") — lê um
   *  ou mais arquivos escolhidos pelo usuário via `<input type="file">`
   *  (chamado por view3d.js) e adiciona cada um ao catálogo. Devolve a
   *  quantidade de arquivos importados com sucesso. */
  /** NOVO (07/09/2026), pedido verbatim: "Quando rodando em um servidor,
   *  deve ser guardado em 'storage/3d/'." — best-effort, "dispara e
   *  esquece" (nunca aguardada por `importFiles`, mesmo padrão de
   *  `AutoSave.pushItem`/tantos outros pontos do app): se houver
   *  `servidorUrl` configurada, envia o TEXTO CRU do .obj pra ação nova
   *  'salvar-arquivo-3d' (ver server/receive.php/receive.js), que grava de
   *  verdade em disco — sem isso, o import continua funcionando igual
   *  (memória RAM, some no F5), só sem a cópia física no servidor. Falha
   *  silenciosa em qualquer erro (servidor offline, ação não implementada
   *  numa versão antiga do servidor etc.) — importar um .obj nunca deveria
   *  travar nem avisar erro por causa disso, é um "a mais".
   */
  async _salvarNoServidor(nomeArquivo, text) {
    try {
      const url = await DB.getSetting('servidorUrl', '');
      if (!url) return;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'salvar-arquivo-3d', nomeArquivo, conteudo: text }),
      });
    } catch (e) { /* silencioso de propósito — ver comentário acima */ }
  },

  async importFiles(fileList) {
    this._setBusy(1);
    try {
      let ok = 0;
      for (const file of Array.from(fileList || [])) {
        if (!/\.obj$/i.test(file.name)) { Utils.toast?.(`"${file.name}" ignorado — só arquivos .obj.`, { type: 'warn' }); continue; }
        try {
          const text = await file.text();
          if (this.addFromText(file.name, text)) { ok++; this._salvarNoServidor(file.name, text); }
        } catch (e) {
          Utils.toast?.(`Não consegui ler "${file.name}".`, { type: 'warn' });
        }
      }
      return ok;
    } finally {
      this._setBusy(-1); // SEMPRE desliga o aviso, mesmo se algo der errado no meio (ver `finally`)
    }
  },

  /** Modo servidor (pedido do usuário: "Caso esteja rodando por servidor,
   *  uma requisição é feita ao servidor para listar o diretório dos
   *  objetos e retorná-los") — MESMO padrão de requisição já usado por
   *  sync.js (POST com `{acao}` pro `servidorUrl` configurado); precisa de
   *  uma nova ação `'listarObjs'` no servidor PHP/Node (gerados como
   *  template em settings.js — ver `_gerarReceivePhp`/`_gerarReceiveJs`),
   *  que devolve `{ok:true, arquivos:[{nome, conteudo}]}` lendo o
   *  diretório `objetos/` ao lado do script. Chamada uma vez (guardada em
   *  `_serverFetchTried`) ao abrir o painel de objetos do 3D pela primeira
   *  vez nesta sessão — não fica repetindo a cada abertura do painel.
   *  Silenciosa em qualquer falha (servidor sem essa ação implementada
   *  ainda, offline, etc.) — importar objetos é um recurso a mais, nunca
   *  deveria travar nem poluir a tela com erro se não estiver configurado. */
  async tryLoadFromServer() {
    if (this._serverFetchTried) return 0;
    this._serverFetchTried = true;
    if (location.protocol === 'file:') return 0; // sem servidor nenhum — nada a fazer aqui (ver importFiles)
    this._setBusy(1);
    try {
      const url = await DB.getSetting('servidorUrl', '');
      if (!url) return 0;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'listarObjs' }),
      });
      if (!resp.ok) return 0;
      const data = await resp.json();
      if (!data || data.ok !== true || !Array.isArray(data.arquivos)) return 0;
      let ok = 0;
      data.arquivos.forEach((a) => { if (a?.nome && a?.conteudo && this.addFromText(a.nome, a.conteudo)) ok++; });
      return ok;
    } catch (e) {
      return 0; // servidor sem a ação implementada, offline, etc. — silencioso de propósito (ver comentário acima)
    } finally {
      this._setBusy(-1);
    }
  },
};

window.ObjImport = ObjImport;
