/* js/model3dloader.js
 * NOVO (13/09/2026) — pedido verbatim do usuário: "Implemente um pipeline de
 * carregamento de modelo (ex. GLTFLoader do three.js) e um novo campo no
 * perfil tipo modeloArquivo: 'monitor.glb', com fallback pra geometria
 * procedural atual quando o arquivo não existir. Para poder substituir os
 * modelos 3D por outros modelados em um programa de modelagem 3D."
 *
 * HONESTIDADE DE ESCOPO — LEIA ANTES DE ACHAR QUE É O `GLTFLoader` OFICIAL
 * DO THREE.JS OU QUE FALTA ALGO AQUI SEM EXPLICAÇÃO:
 *
 * O `THREE.GLTFLoader` de verdade (pasta `examples/jsm/loaders/` do
 * three.js) só é distribuído como módulo ES (`import`/`export`) pelos
 * mantenedores a partir da versão instalada aqui (r160) — não existe mais
 * build "clássica" (`<script>` global, sem bundler) oficial dele há várias
 * versões. E `<script type="module">` com `import` de arquivo LOCAL
 * (`file://`) é bloqueado pelo Chrome/Chromium por CORS — a MESMA restrição
 * (documentada em `js/objectassets.js`, comentário grande no topo) que já
 * bloqueia `fetch()` de arquivo local, só que também vale pra módulos ES,
 * não só pra `fetch` puro. Nesta sessão eu tentei baixar o código-fonte
 * oficial do `GLTFLoader.js` (r160) pra adaptar manualmente pra script
 * clássico (troca de `import`/`export` por acesso direto a `window.THREE`)
 * — o acesso de rede deste ambiente bloqueou TODOS os hosts onde esse
 * arquivo está disponível (GitHub raw, jsdelivr, unpkg, registro npm),
 * então não tive como buscar o código-fonte de verdade pra adaptar com
 * segurança (eu NÃO vou reescrever de memória um parser de +2000 linhas de
 * um formato binário estruturado e arriscar erros sutis sem poder
 * conferir contra a fonte original).
 *
 * Em vez disso, este arquivo é um parser de glTF/GLB **escrito do zero**
 * direto a partir da especificação aberta glTF 2.0 (Khronos Group,
 * documento público, não código de terceiros) — cobre o caminho comum de
 * "modelei uma peça simples num programa de modelagem e exportei como
 * .glb" (Blender, por exemplo), mas NÃO é um substituto 100% completo do
 * `GLTFLoader` oficial. O que FUNCIONA:
 *   - Contêiner `.glb` binário (chunk JSON + chunk BIN embutido) E `.gltf`
 *     JSON puro com buffers embutidos via `data:` URI (base64) — NÃO
 *     arquivos `.gltf` que referenciam um `.bin`/imagens EXTERNOS por nome
 *     de arquivo separado (exigiria importar vários arquivos de uma vez;
 *     fora de escopo desta rodada — exporte como `.glb` único, ou `.gltf`
 *     com "Embed" ligado no seu programa de modelagem, pra tudo virar
 *     `data:` URI dentro de um arquivo só).
 *   - Malhas (`meshes[].primitives[]`) com `POSITION`/`NORMAL`/`TEXCOORD_0`
 *     e índices (`UNSIGNED_BYTE`/`UNSIGNED_SHORT`/`UNSIGNED_INT`), modo
 *     TRIANGLES (o padrão de toda exportação comum).
 *   - Hierarquia de nós (`nodes[].children`), com transform por `matrix`
 *     OU `translation`/`rotation`/`scale` separados.
 *   - Cor base do material (`materials[].pbrMetallicRoughness.
 *     baseColorFactor`) — aplicada como a cor de um `THREE.MeshLambertMaterial`
 *     (mesma classe de material já usada em todo o resto do motor deste
 *     projeto — ver `engine3d.js` — por consistência visual/desempenho,
 *     não os PBR completos `MeshStandardMaterial` que o glTF pede "de
 *     verdade"). `doubleSided` é respeitado (`side: THREE.DoubleSide`).
 *
 * O que NÃO é suportado nesta 1ª versão (documentado, não escondido):
 *   - Texturas (`baseColorTexture`/normal map/etc.) — o modelo aparece só
 *     com a cor base sólida, sem a imagem da textura.
 *   - Animações, esqueletos/skinning, morph targets, câmeras/luzes
 *     embutidas no arquivo, accessors esparsos (`sparse`).
 *   - Compressão Draco/KTX2 (extensões `KHR_draco_mesh_compression`/
 *     `KHR_texture_basisu`) — um `.glb` exportado com compressão Draco
 *     ligada não vai carregar (mensagem de erro clara, não uma falha
 *     silenciosa) — desligue "Draco compression" ao exportar.
 * Se algum dia isso precisar cobrir mais do formato, o caminho mais seguro
 * é substituir este arquivo pelo `GLTFLoader.js` oficial adaptado (quando
 * o acesso de rede permitir baixar a fonte original) — a API pública
 * abaixo (`window.Model3DLoader`) foi desenhada pra não precisar mudar
 * nada em quem já a usa (`engine3d.js`/`cards/object-card.js`) se isso
 * acontecer.
 *
 * ARMAZENAMENTO: o arquivo importado (bytes originais, como base64) é
 * salvo na store nova do IndexedDB `modelos3d` (ver js/db.js,
 * `DB_VERSION` 5->6) — assim ele sobrevive a recarregar a página, igual
 * qualquer outro dado do app. O `THREE.Group` já PRONTO (parseado) fica
 * só em memória (`_cache`), reconstruído 1x por carregamento de página
 * (`preloadAll()`, chamado por `view3d.js` antes de montar a cena) —
 * parsear de novo é barato (é só matemática sobre os bytes já em RAM, sem
 * nenhuma rede envolvida), então não há necessidade de cache persistente
 * do resultado parseado, só dos bytes originais.
 */
window.Model3DLoader = (function () {
  const _cache = {}; // nome -> THREE.Group (o "molde" — sempre clonado antes de ir pra cena)
  const _erros = {}; // nome -> string do último erro de parse (pra diagnóstico, ver listNames)
  let _preloadPromise = null;

  // ---------- leitura de accessor/bufferView (glTF 2.0) ----------

  const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

  function _typedArrayCtor(componentType) {
    switch (componentType) {
      case 5120: return Int8Array;
      case 5121: return Uint8Array;
      case 5122: return Int16Array;
      case 5123: return Uint16Array;
      case 5125: return Uint32Array;
      case 5126: return Float32Array;
      default: throw new Error(`componentType glTF não suportado: ${componentType}`);
    }
  }

  /** Lê um accessor inteiro pra um Array/TypedArray "achatado" (1 componente
   *  atrás do outro) — não usa `byteStride`/accessors esparsos (`sparse`),
   *  que exportadores comuns (Blender "glTF Separate/Binary" padrão) não
   *  costumam gerar; se aparecerem, lança erro claro em vez de devolver
   *  dado errado silenciosamente. */
  function _readAccessor(json, bytes, accessorIdx) {
    const acc = json.accessors[accessorIdx];
    if (!acc) throw new Error(`accessor #${accessorIdx} inexistente`);
    if (acc.sparse) throw new Error('accessors "sparse" não são suportados por este parser (ver comentário no topo de model3dloader.js)');
    const numComp = NUM_COMPONENTS[acc.type];
    if (!numComp) throw new Error(`tipo de accessor glTF não suportado: ${acc.type}`);
    const count = acc.count;
    const Ctor = _typedArrayCtor(acc.componentType);
    if (acc.bufferView === undefined) {
      // Accessor sem bufferView (permitido no spec pra "tudo zero", raro em
      // exportação real) — devolve um array zerado do tamanho certo.
      return new Ctor(count * numComp);
    }
    const bv = json.bufferViews[acc.bufferView];
    const compSize = COMPONENT_BYTES[acc.componentType];
    const stride = bv.byteStride || (numComp * compSize);
    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    if (stride === numComp * compSize) {
      // Caminho comum (sem entrelaçamento) — um `slice`/leitura direta.
      return new Ctor(bytes.buffer, bytes.byteOffset + base, count * numComp);
    }
    // Dados entrelaçados (`byteStride` maior que o necessário) — copia
    // componente a componente pra um array novo, contíguo.
    const out = new Ctor(count * numComp);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const readers = {
      1: (o, signed) => (signed ? view.getInt8(o) : view.getUint8(o)),
      2: (o, signed) => (signed ? view.getInt16(o, true) : view.getUint16(o, true)),
      4: (o, signed) => (acc.componentType === 5126 ? view.getFloat32(o, true) : (signed ? view.getInt32(o, true) : view.getUint32(o, true))),
    };
    const signed = [5120, 5122].includes(acc.componentType);
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < numComp; c++) {
        out[i * numComp + c] = readers[compSize](base + i * stride + c * compSize, signed);
      }
    }
    return out;
  }

  // ---------- resolução de buffers (GLB BIN chunk OU data: URI) ----------

  function _base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function _resolveBuffers(json, glbBinChunk) {
    return (json.buffers || []).map((buf, idx) => {
      if (!buf.uri) {
        // Sem `uri` = referência ao chunk BIN do próprio .glb (só o buffer
        // #0 pode fazer isso, pela spec).
        if (idx !== 0 || !glbBinChunk) throw new Error(`buffer #${idx} sem "uri" e sem chunk BIN — arquivo .glb malformado ou é um .gltf que precisa de "uri"`);
        return glbBinChunk;
      }
      if (buf.uri.startsWith('data:')) {
        const comma = buf.uri.indexOf(',');
        return _base64ToBytes(buf.uri.slice(comma + 1));
      }
      // Arquivo externo (.bin separado) — fora de escopo (ver comentário
      // grande no topo do arquivo: exporte como .glb único ou .gltf com
      // "Embed").
      throw new Error(`buffer #${idx} referencia um arquivo externo ("${buf.uri}") — não suportado; exporte como .glb único ou .gltf com "Embed"/buffers embutidos`);
    });
  }

  // ---------- montagem da malha/hierarquia three.js ----------

  function _buildMaterial(json, materialIdx) {
    const THREE = window.THREE;
    const mat = (materialIdx !== undefined && json.materials) ? json.materials[materialIdx] : null;
    const baseColor = mat?.pbrMetallicRoughness?.baseColorFactor;
    const color = baseColor ? new THREE.Color(baseColor[0], baseColor[1], baseColor[2]) : new THREE.Color(0x9aa2b1);
    return new THREE.MeshLambertMaterial({
      color,
      transparent: !!(baseColor && baseColor[3] !== undefined && baseColor[3] < 1),
      opacity: (baseColor && baseColor[3] !== undefined) ? baseColor[3] : 1,
      side: mat?.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
  }

  function _buildPrimitive(json, buffersBytes, primitive) {
    const THREE = window.THREE;
    const attrs = primitive.attributes || {};
    if (attrs.POSITION === undefined) throw new Error('primitiva sem atributo POSITION');
    const bufferViewBytes = (accessorIdx) => {
      const acc = json.accessors[accessorIdx];
      const bv = json.bufferViews[acc.bufferView];
      return buffersBytes[bv.buffer];
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(_readAccessor(json, bufferViewBytes(attrs.POSITION), attrs.POSITION), 3));
    if (attrs.NORMAL !== undefined) {
      geo.setAttribute('normal', new THREE.BufferAttribute(_readAccessor(json, bufferViewBytes(attrs.NORMAL), attrs.NORMAL), 3));
    }
    if (attrs.TEXCOORD_0 !== undefined) {
      geo.setAttribute('uv', new THREE.BufferAttribute(_readAccessor(json, bufferViewBytes(attrs.TEXCOORD_0), attrs.TEXCOORD_0), 2));
    }
    if (primitive.indices !== undefined) {
      geo.setIndex(new THREE.BufferAttribute(_readAccessor(json, bufferViewBytes(primitive.indices), primitive.indices), 1));
    }
    if (!attrs.NORMAL) geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, _buildMaterial(json, primitive.material));
    return mesh;
  }

  function _buildNode(json, buffersBytes, nodeIdx, meshCacheByIdx) {
    const THREE = window.THREE;
    const node = json.nodes[nodeIdx];
    const group = new THREE.Group();
    if (node.name) group.name = node.name;
    if (Array.isArray(node.matrix) && node.matrix.length === 16) {
      const m = new THREE.Matrix4().fromArray(node.matrix);
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
      m.decompose(pos, quat, scl);
      group.position.copy(pos); group.quaternion.copy(quat); group.scale.copy(scl);
    } else {
      if (node.translation) group.position.set(node.translation[0], node.translation[1], node.translation[2]);
      if (node.rotation) group.quaternion.set(node.rotation[0], node.rotation[1], node.rotation[2], node.rotation[3]);
      if (node.scale) group.scale.set(node.scale[0], node.scale[1], node.scale[2]);
    }
    if (node.mesh !== undefined) {
      if (!meshCacheByIdx.has(node.mesh)) {
        const meshDef = json.meshes[node.mesh];
        const meshGroup = new THREE.Group();
        (meshDef.primitives || []).forEach((prim) => {
          if (prim.mode !== undefined && prim.mode !== 4) return; // só TRIANGLES (modo 4, o padrão) — ver limitações no topo do arquivo
          meshGroup.add(_buildPrimitive(json, buffersBytes, prim));
        });
        meshCacheByIdx.set(node.mesh, meshGroup);
      }
      // Clona o grupo da malha (não a malha crua guardada no cache) — um
      // MESMO `meshes[]` pode ser referenciado por vários `nodes[]`
      // (instanciamento dentro do próprio arquivo glTF); clonar aqui
      // preserva essa semântica sem duplicar geometria/material na CPU
      // (THREE.Object3D.clone() compartilha geometry/material por padrão).
      group.add(meshCacheByIdx.get(node.mesh).clone());
    }
    (node.children || []).forEach((childIdx) => group.add(_buildNode(json, buffersBytes, childIdx, meshCacheByIdx)));
    return group;
  }

  /** Parseia um `ArrayBuffer` (.glb OU .gltf lido como bytes) e devolve um
   *  `THREE.Group` novo (raiz da(s) cena(s) default do arquivo) — síncrono
   *  (sem nenhuma rede/imagem externa envolvida nesta versão, ver
   *  limitações no topo do arquivo). Lança (`throw`) com mensagem clara em
   *  caso de formato não suportado — quem chama decide o que fazer
   *  (`registerFromFile`/`preloadAll` abaixo capturam e guardam em
   *  `_erros`). */
  /** Garante `window.THREE` carregado ANTES de qualquer parse (todo o resto
   *  deste arquivo usa `THREE.*` direto, sem passar como parâmetro — mesmo
   *  padrão de `engine3d.js`). `Engine3D._loadThree()` é `static` e já
   *  CACHEIA a própria Promise (ver comentário grande dela) — chamar aqui
   *  não injeta um 2º `<script>`/duplica trabalho nenhum, só "pega carona"
   *  na mesma promessa (resolvida na hora se o "Ver em 3D" já tiver aberto
   *  antes nesta sessão de página). Sem isto, `preloadAll()` chamado por
   *  `view3d.js` ANTES do motor 3D terminar de carregar (1ª abertura da
   *  página) quebraria com `THREE is not defined` no meio do parse. */
  async function _ensureThreeReady() {
    if (window.THREE) return;
    if (typeof window.Engine3D?._loadThree === 'function') {
      await window.Engine3D._loadThree();
    }
    if (!window.THREE) throw new Error('THREE (motor 3D) ainda não carregado — abra "Ver em 3D" ao menos uma vez antes de importar um modelo.');
  }

  function parseArrayBuffer(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let json, glbBinChunk = null;
    const magic = new DataView(arrayBuffer, 0, 4).getUint32(0, true);
    if (magic === 0x46546c67) {
      // Contêiner .glb binário — ver spec "GLB File Format".
      const dv = new DataView(arrayBuffer);
      const version = dv.getUint32(4, true);
      if (version !== 2) throw new Error(`versão do glTF binário não suportada: ${version} (só a versão 2 é suportada)`);
      const totalLength = dv.getUint32(8, true);
      let offset = 12;
      while (offset < totalLength) {
        const chunkLength = dv.getUint32(offset, true);
        const chunkType = dv.getUint32(offset + 4, true);
        const chunkStart = offset + 8;
        if (chunkType === 0x4e4f534a) { // 'JSON'
          const jsonText = new TextDecoder('utf-8').decode(bytes.subarray(chunkStart, chunkStart + chunkLength));
          json = JSON.parse(jsonText);
        } else if (chunkType === 0x004e4942) { // 'BIN\0'
          glbBinChunk = bytes.subarray(chunkStart, chunkStart + chunkLength);
        }
        offset = chunkStart + chunkLength;
      }
      if (!json) throw new Error('.glb sem chunk JSON — arquivo malformado');
    } else {
      // Não é .glb — tenta como .gltf (JSON puro em UTF-8).
      const text = new TextDecoder('utf-8').decode(bytes);
      json = JSON.parse(text);
    }
    if (!json.asset || !String(json.asset.version || '').startsWith('2')) {
      throw new Error(`versão do glTF não suportada (esperado "2.x", recebido "${json.asset?.version}")`);
    }
    if (json.extensionsRequired && json.extensionsRequired.some((e) => e !== 'KHR_materials_unlit')) {
      throw new Error(`arquivo exige extensão(ões) glTF não suportada(s): ${json.extensionsRequired.join(', ')} (ex.: compressão Draco/KTX2 — desligue ao exportar)`);
    }
    const buffersBytes = _resolveBuffers(json, glbBinChunk);
    const sceneIdx = json.scene !== undefined ? json.scene : 0;
    const scene = json.scenes && json.scenes[sceneIdx];
    if (!scene) throw new Error('arquivo sem nenhuma cena (scenes[]) — nada pra desenhar');
    const meshCacheByIdx = new Map();
    const root = new window.THREE.Group();
    (scene.nodes || []).forEach((nodeIdx) => root.add(_buildNode(json, buffersBytes, nodeIdx, meshCacheByIdx)));
    return root;
  }

  // ---------- API pública ----------

  return {
    /** true assim que `nome` está pronto em memória pra `getClone()` — usado
     *  por `engine3d.js` (síncrono, dentro do laço de construção da cena;
     *  NUNCA dispara carregamento sozinho — quem garante que já está
     *  carregado é `preloadAll()`, chamado por view3d.js ANTES de montar a
     *  cena). Devolve `false` tanto pra "nunca importado" quanto pra
     *  "importado mas falhou ao parsear" (ver `getError` pra distinguir). */
    hasModel(nome) { return !!(nome && _cache[nome]); },

    /** [16/09/2026 UTC] NOVO — exposto publicamente pra `js/glbmeshsource.js`
     *  (malha `.glb` ESTÁTICA/embutida no projeto, ex. `luminaria.glb`/
     *  `poste.glb`/`relogio.glb` gerados por `assets/obj/gerador-glb/
     *  gerar_glb.js`) reaproveitar o MESMO parser glTF em vez de duplicar
     *  ~150 linhas de leitura de accessor/bufferView/material. Recebe um
     *  `ArrayBuffer` (.glb OU .gltf com buffers embutidos via `data:` —
     *  ver limitações no topo do arquivo) e devolve um `THREE.Group` novo
     *  — mesmo contrato de sempre, lança em caso de formato não suportado.
     *  Comportamento e limitações IDÊNTICOS pras duas origens (usuário
     *  importando pelo cartão do objeto, OU um `.glb` estático do próprio
     *  projeto) — nenhuma vantagem/desvantagem por vir de um lado ou
     *  do outro. */
    parseArrayBuffer,

    /** Mensagem do último erro de parse pra `nome`, ou `null` se nunca deu
     *  erro (ou nunca foi importado) — usado pela UI de importação
     *  (`js/cards/object-card.js`) pra mostrar o que deu errado, em vez de só
     *  "sumir" e cair no fallback procedural silenciosamente. */
    getError(nome) { return _erros[nome] || null; },

    /** Nomes de todo modelo já importado (carregado ou não) — pra listar
     *  numa UI de escolha, se algum dia fizer sentido reaproveitar o mesmo
     *  modelo importado uma vez em VÁRIOS tipos/objetos diferentes. */
    listNames() { return Object.keys(_cache); },

    /** Clona (nunca devolve a referência guardada — mesma regra de sempre
     *  neste projeto pra dado compartilhado, ver DB.js) o `THREE.Group` já
     *  parseado de `nome`, ou `null` se não disponível — `engine3d.js`
     *  adiciona o clone na cena; o "molde" em `_cache` nunca é mexido
     *  diretamente. */
    getClone(nome) {
      const g = _cache[nome];
      return g ? g.clone() : null;
    },

    /** Lê um `File` (do `<input type="file">`, ver cards/object-card.js),
     *  parseia, guarda o resultado em memória (`_cache[nome]`) E persiste os
     *  bytes originais (base64) na store `modelos3d` do IndexedDB (ver
     *  js/db.js) pra sobreviver a um recarregamento de página. `nome` é a
     *  chave que vai em `obj.modeloArquivo`/`perfil.modeloArquivo` — por
     *  padrão o próprio nome do arquivo escolhido (ex. "monitor.glb"),
     *  mas pode ser customizado por quem chama. Lança em caso de erro de
     *  parse (a UI decide como mostrar isso ao usuário) — mas AINDA salva
     *  os bytes brutos no IndexedDB antes de tentar parsear, então um erro
     *  de parse não perde o arquivo (pode ser corrigido/reimportado
     *  depois sem reenviar o arquivo nem perder o registro). */
    async registerFromFile(file, nome) {
      const chave = nome || file.name;
      await _ensureThreeReady();
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      await window.DB?.putModelo3D?.(chave, base64, { nomeArquivoOriginal: file.name, bytes: bytes.length, importadoEm: window.DB?.nowISO?.() || new Date().toISOString() });
      try {
        const group = parseArrayBuffer(arrayBuffer);
        _cache[chave] = group;
        delete _erros[chave];
      } catch (err) {
        _erros[chave] = err?.message || String(err);
        delete _cache[chave];
        throw err;
      }
      return chave;
    },

    /** Remove um modelo importado (IndexedDB + memória) — objetos que
     *  ainda referenciam esse `nome` em `modeloArquivo` simplesmente caem
     *  de volta na geometria procedural (`hasModel` passa a devolver
     *  `false`), sem precisar limpar `modeloArquivo` deles manualmente
     *  (mesmo espírito de fallback gracioso do resto deste sistema). */
    async remove(nome) {
      delete _cache[nome];
      delete _erros[nome];
      await window.DB?.deleteModelo3D?.(nome);
    },

    /** Carrega TODOS os modelos já importados (da store `modelos3d`) pra
     *  memória, parseando cada um — chamado 1x por `view3d.js`
     *  `_rebuildScene()` ANTES de `Engine3D.setScene(...)` (que é
     *  síncrono e precisa achar tudo já em `_cache`). Idempotente/cacheado
     *  (`_preloadPromise`) — chamadas repetidas (reabrir "Ver em 3D" várias
     *  vezes na mesma sessão de página) não reparseiam do zero; só um
     *  `remove`/`registerFromFile` novo altera o cache depois disso, sem
     *  precisar de outro preload completo. */
    async preloadAll() {
      if (_preloadPromise) return _preloadPromise;
      _preloadPromise = (async () => {
        const registros = (await window.DB?.getAllModelos3D?.()) || [];
        if (registros.length) await _ensureThreeReady();
        for (const reg of registros) {
          try {
            const bin = atob(reg.base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            _cache[reg.nome] = parseArrayBuffer(bytes.buffer);
            delete _erros[reg.nome];
          } catch (err) {
            _erros[reg.nome] = err?.message || String(err);
            console.error(`[Model3DLoader] falha ao parsear modelo importado "${reg.nome}":`, err);
          }
        }
      })();
      return _preloadPromise;
    },
  };
})();
