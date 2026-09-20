/* js/glbmeshsource.js
 * [16/09/2026 UTC] NOVO — pedido verbatim: "Implemente o ObjMeshSource para
 * .glb como você mencionou." só carrega modelo IMPORTADO
 * PELO USUÁRIO em tempo de execução, salvo no IndexedDB; não existia
 * nenhum jeito de um `.glb` ESTÁTICO/EMBUTIDO no próprio projeto (ex.
 * `assets/modelos/luminaria.glb`) ser carregado automaticamente, do jeito
 * que `js/objmeshsource.js` já faz pro `.obj`).
 *
 * MESMO PROBLEMA, MESMA SOLUÇÃO de `js/objmeshsource.js` (ver comentário
 * grande no topo desse arquivo pra explicação completa): um `.glb` é
 * binário — não dá nem pra "embrulhar como string" direto feito o texto do
 * `.obj` (que já é texto). A saída: o `.glb` é lido como bytes, convertido
 * pra BASE64 (texto puro, seguro dentro de uma string JS) e embrulhado
 * numa chamada `window.GlbMeshSource.register('<tipo>', "<base64...>")` —
 * um arquivo `assets/modelos/<tipo>.glb.js`, carregado por `<script
 * src="...">` (NUNCA por `fetch()`, bloqueado por CORS em `file:///` —
 * mesmo motivo de sempre, documentado em js/objectassets.js/
 * js/model3dloader.js/js/objmeshsource.js).
 *
 * GERAÇÃO do `.glb.js`: `assets/obj/gerador-glb/gerar_glb.js` (Node) já
 * gera o `.glb` bruto; o wrapper `.glb.js` (base64) é gerado por
 * `assets/obj/gerador-glb/glb_para_js.js` (NOVO, ver esse arquivo) — mesma
 * relação que `ferramentas/obj_para_malha_js.js` tem com o `.obj` puro.
 *
 * DECODE/PARSE: reaproveita `window.Model3DLoader.parseArrayBuffer` (agora
 * exposto publicamente por esse módulo, ver comentário lá) — MESMO parser
 * glTF pras duas origens (usuário importando pelo cartão do objeto, OU
 * `.glb` estático deste módulo), zero duplicação, MESMAS limitações
 * documentadas em js/model3dloader.js (sem animação/Draco/KTX2, etc.).
 *
 * CONTRATO IDÊNTICO a `window.ObjMeshSource`/`window.Model3DLoader`
 * (`hasModel`/`getClone`/`preload`/`awaitAllPending`) de propósito —
 * `engine3d.js` `_buildModeloArquivoMesh` já aceita qualquer "loader" com
 * esse formato (`{ hasModel, getClone }`), então plugar esta 3ª origem não
 * exige reescrever nada do posicionamento/pickable/wireframe, só mais um
 * `if` no laço de decisão de malha (ver `_buildOneObjectMesh`).
 */
window.GlbMeshSource = (function () {
  const _base64 = {}; // nome -> string base64 bruta (registrada pelo .glb.js)
  const _cache = {}; // nome -> THREE.Group já parseado (molde — nunca mexido direto, só clonado)
  const _erros = {}; // nome -> string do último erro de parse
  const _preloadPromises = {};

  /** MESMO algoritmo de slug de `ObjectAssets._slug`/`ObjMeshSource._slug`
   *  — duplicado aqui de propósito (mesma razão: este módulo funciona
   *  sozinho, sem depender de outro carregar primeiro). */
  function _slug(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_');
  }

  function _base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  /** Constrói o `THREE.Group`-molde de `nome` a partir do base64 já
   *  registrado — 1x, cacheado (mesma regra de "molde" compartilhado de
   *  sempre neste projeto). Delega o parse de verdade pro
   *  `Model3DLoader.parseArrayBuffer` (ver comentário no topo do arquivo). */
  function _buildGroup(nome) {
    if (_cache[nome]) return _cache[nome];
    if (!window.Model3DLoader?.parseArrayBuffer) throw new Error('Model3DLoader ainda não carregado — GlbMeshSource depende dele pra parsear o .glb');
    const b64 = _base64[nome];
    if (!b64) return null;
    const arrayBuffer = _base64ToArrayBuffer(b64);
    const group = window.Model3DLoader.parseArrayBuffer(arrayBuffer);
    _cache[nome] = group;
    delete _erros[nome];
    return group;
  }

  /** MESMO padrão de `ObjectAssets._tryLoadScript`/`ObjMeshSource._tryLoadScript`
   *  — injeta `<script src="...">`, resolve em QUALQUER caso (sucesso OU
   *  404), nunca rejeita (arquivo de `.glb` ausente é normal — nem todo
   *  tipo precisa de um). */
  function _tryLoadScript(url) {
    return new Promise((resolve) => {
      const el = document.createElement('script');
      el.src = url;
      el.onload = () => resolve(true);
      el.onerror = () => resolve(false);
      document.head.appendChild(el);
    });
  }

  return {
    /** Chamado pelo PRÓPRIO arquivo `assets/modelos/<tipo>.glb.js` ao
     *  carregar — registra o base64 bruto do `.glb` (embrulhado em string
     *  JS, ver `assets/obj/gerador-glb/glb_para_js.js`). NÃO parseia na
     *  hora (só guarda a string) — parse de verdade só acontece em
     *  `getClone`, igual ao resto do projeto adia trabalho pesado pro
     *  instante em que é realmente preciso. */
    register(nome, base64) {
      _base64[nome] = base64;
    },

    /** true assim que `nome` tem base64 registrado — SÍNCRONA, mesmo uso
     *  de `ObjMeshSource.hasModel`/`Model3DLoader.hasModel` dentro do laço
     *  de construção de cena (`engine3d.js` `_buildOneObjectMesh`). Quem
     *  garante que já tentou carregar ANTES da cena ser montada é
     *  `ObjectAssets.ensureMeshesReadyForMap` (mesmo espírito de
     *  `ObjMeshSource.awaitAllPending`, ver abaixo). */
    hasModel(nome) { return !!(nome && _base64[nome]); },

    /** Mensagem do último erro de parse, ou `null`. */
    getError(nome) { return _erros[nome] || null; },

    /** Clona (nunca a referência guardada) o `THREE.Group` de `nome`, ou
     *  `null` se não disponível/falhou ao parsear. Mesma assinatura de
     *  `ObjMeshSource.getClone`/`Model3DLoader.getClone` de propósito —
     *  `engine3d.js` reaproveita o MESMO builder genérico
     *  (`_buildModeloArquivoMesh`) pras 3 origens de malha externa. */
    getClone(nome) {
      try {
        const g = _buildGroup(nome);
        return g ? g.clone() : null;
      } catch (err) {
        _erros[nome] = err?.message || String(err);
        console.error(`[GlbMeshSource] falha ao parsear malha "${nome}":`, err);
        return null;
      }
    },

    /** Tenta carregar `assets/modelos/<slug(nome)>.glb.js` — só uma vez
     *  por `nome` (a vida inteira da página); chamadas seguintes devolvem
     *  a MESMA Promise já em andamento/resolvida. */
    preload(nome) {
      if (!nome) return Promise.resolve(false);
      if (_preloadPromises[nome]) return _preloadPromises[nome];
      _preloadPromises[nome] = _tryLoadScript(`assets/modelos/${_slug(nome)}.glb.js`);
      return _preloadPromises[nome];
    },

    /** Espera TODAS as tentativas de `preload` já disparadas terminarem —
     *  chamado por `ObjectAssets.ensureMeshesReadyForMap` (mesmo espírito
     *  de `ObjMeshSource.awaitAllPending`), ANTES de `Engine3D.setScene`. */
    async awaitAllPending() {
      await Promise.all(Object.values(_preloadPromises));
    },
  };
})();
