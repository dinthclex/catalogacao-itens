/* js/objmeshsource.js
 * [15/09/2026 UTC] NOVO — pedido verbatim: "Atualmente os modelos 3D ficam
 * em 'assets/modelos' com o nome padronizado '<nome-do-modelo>.model.js'.
 * A malha de pontos como um arquivo '.obj'. Há algum jeito de apenas
 * renomear o '.obj' para '.js', fazendo algum parser interno lê-lo de modo
 * diferente para não considerá-lo como javaScript, mesmo sendo '.js'? A
 * malha do objeto (o '.obj' dele) deve ficar em um arquivo separado e ser
 * endereçado em '<nome-do-modelo>.model.js', mas deve continuar
 * funcionando com o protocolo 'file:///'."
 *
 * RESPOSTA CURTA (documentada aqui pra não se perder — ver explicação
 * completa dada ao usuário no chat): um "renomear" NU não funciona — quando
 * um `<script src="x.js">` é carregado, o PRÓPRIO NAVEGADOR (não um parser
 * nosso) sempre tenta interpretar o conteúdo como JavaScript de verdade,
 * não importa a extensão; texto de `.obj` puro ("v 0 0 0", "f 1 2 3", ...)
 * NÃO é sintaxe JS válida e daria SyntaxError na hora. A saída (o que este
 * arquivo implementa) é EMBRULHAR o texto do `.obj` dentro de JS válido —
 * uma chamada `ObjMeshSource.register('nome', "v 0 0 0\nf 1 2 3\n...")` —
 * então o arquivo `.js` fica 100% válido pro navegador (só executa uma
 * atribuição/chamada de função, nada mais), e o "parser interno" que lê o
 * conteúdo de MODO DIFERENTE é este módulo aqui, que trata aquela STRING
 * como dado de malha (não como código) e a converte em geometria.
 *
 * POR QUE ISSO FUNCIONA COM 'file:///' (mesma pergunta já resolvida antes
 * neste projeto pra `assets/modelos/<tipo>.model.js` — ver comentário
 * grande no topo de js/objectassets.js, e pra modelos importados — ver
 * js/model3dloader.js): `fetch()`/`XMLHttpRequest`/`import` de um arquivo
 * LOCAL são bloqueados por CORS no Chrome/Chromium ao abrir a página direto
 * do disco (sem servidor). MAS um elemento `<script src="...">` NUNCA passa
 * por essa checagem de CORS — é assim que o app inteiro (todo `js/*.js` no
 * index.html, e cada `assets/modelos/*.model.js`) já carrega hoje.
 * `js/objectassets.js` `_tryLoadScript` já injeta `<script>` dinamicamente
 * pra carregar cada `.model.js` sob demanda; este módulo faz EXATAMENTE a
 * mesma coisa pra um arquivo IRMÃO de malha (ver `preload` abaixo).
 *
 * CONVENÇÃO DE ARQUIVOS (nova, paralela a `<tipo>.model.js`):
 *   assets/modelos/<tipo>.malha.js
 * Conteúdo esperado (gerado automaticamente por
 * `ferramentas/obj_para_malha_js.js` — ver esse script, evita ter que
 * escrever a mão o `JSON.stringify`/escapar o texto do `.obj`):
 *   window.ObjMeshSource.register('<tipo>', "v -0.5 0 -0.5\nv 0.5 0 -0.5\n...");
 *
 * COMO É "ENDEREÇADO EM <nome-do-modelo>.model.js" (pedido explícito do
 * usuário): o arquivo de MODELO (`assets/modelos/<tipo>.model.js`) declara
 * que quer uma malha estática passando `malhaEstatica: true` pro objeto de
 * `ObjectAssets.registerModel(...)` — ver exemplo em
 * `_exemplo-model-malha-obj.txt` em `assets/exemplos/`. Isso dispara (ver
 * js/objectassets.js `registerModel`) o carregamento em segundo plano do
 * `.malha.js` irmão, com o MESMO nome (`<tipo>`) — nenhum campo extra pra
 * digitar duas vezes o nome do tipo.
 *
 * [15/09/2026 UTC] ALTERADO — pedido verbatim: "Sobre os materiais, use
 * <nome>.mtl para preserválos. [...] Assim, verdadeiramente não haverá
 * perdas, nem limitações." O `.obj`-fonte (agora em `assets/modelos/obj/`,
 * ver `ferramentas/gerar_malhas.js`) pode ter `mtllib`/`usemtl` de verdade —
 * `ferramentas/obj_para_malha_js.js` lê o `.mtl` companheiro e embute os
 * materiais lidos como `opts.materiais` no `register(...)` gerado. Este
 * módulo agora entende os DOIS formatos: `register(nome, texto)` (1 cor só,
 * de sempre) e `register(nome, texto, { cor, materiais: { <nomeMat>: { cor,
 * opacidade? } } })` (múltiplas cores, 1 por grupo `usemtl` do `.obj`) — ver
 * `parseObjText`/`_buildGroup` abaixo pra como cada `usemtl` vira um
 * `THREE.Group` da `BufferGeometry` com seu próprio material no array.
 *
 * SUPORTE DE FORMATO `.obj` (ESCOPO HONESTO, escrito do zero a partir da
 * especificação Wavefront OBJ, sem depender do `OBJLoader` oficial do
 * three.js pelo MESMO motivo já documentado em js/model3dloader.js —
 * distribuído só como módulo ES, `import` local bloqueado por CORS em
 * 'file:///'):
 *   FUNCIONA: vértices (`v x y z`), normais (`vn x y z`), faces (`f ...`)
 *   com qualquer combinação de `v`, `v/vt`, `v//vn`, `v/vt/vn` por vértice,
 *   índices negativos (relativos ao fim da lista, como o spec permite),
 *   faces com MAIS de 3 vértices (polígono convexo simples) — trianguladas
 *   em leque (fan) a partir do 1º vértice da face — e `usemtl <nome>`
 *   (agrupamento de faces por material, ver acima — precisa de `opts.
 *   materiais[nome]` pra ter efeito; sem isso a malha inteira usa
 *   `opts.cor`/cinza padrão, IGUAL a antes desta rodada).
 *   NÃO FUNCIONA (mesmo espírito "documentado, não escondido" do resto do
 *   projeto): múltiplos objetos/grupos (`o`/`g`) — tudo vira UMA malha só
 *   (com vários MATERIAIS possíveis, mas sempre 1 `THREE.Mesh`); coordenadas
 *   de textura (`vt`) são lidas mas não aplicadas — sem sistema de mapa de
 *   imagem neste pipeline (`.mtl` só dá cor sólida via `Kd`, nunca
 *   `map_Kd`), mesma limitação do `.glb` (ver model3dloader.js); tipo de
 *   material do `.mtl` (`illum`, brilho especular `Ks`/`Ns`) — só `Kd`
 *   (cor) e `d` (opacidade) são lidos, todo material vira
 *   `MeshLambertMaterial` (reage à luz da cena) mesmo que o objeto original
 *   em engine3d.js usasse `MeshBasicMaterial` pra alguma peça "sempre
 *   acesa" (ex.: tubo da luminária/lâmpada do poste — ver comentário em
 *   `ferramentas/gerar_malhas.js` `build_luminaria`/`build_poste`);
 *   "smoothing groups" (`s`). Sem normais no arquivo (`vn` ausente), usa
 *   `BufferGeometry.computeVertexNormals()` sobre geometria NÃO indexada —
 *   dá sombreamento "flat" (uma normal por triângulo, não suavizado entre
 *   triângulos vizinhos) — aceitável pro estilo "low poly" já usado no
 *   resto do motor (ver engine3d.js).
 */
window.ObjMeshSource = (function () {
  const _texts = {}; // nome -> texto bruto do .obj (registrado pelo .malha.js)
  const _cache = {}; // nome -> THREE.Group já parseado/pronto (molde — nunca mexido direto, só clonado)
  const _cores = {}; // nome -> cor opcional (hex number) passada em register()
  const _materiais = {}; // [15/09/2026 UTC] NOVO — nome -> { <nomeMaterial>: { cor, opacidade? } } opcional, passado em register()
  const _erros = {}; // nome -> string do último erro de parse
  const _attempted = {}; // nome -> true (já tentou carregar o .malha.js, 1x por página)
  const _preloadPromises = {};

  /** MESMO algoritmo de `ObjectAssets._slug` (js/objectassets.js) — nomes
   *  de tipo com acento/espaço viram um nome de arquivo seguro. Duplicado
   *  aqui (em vez de depender de `window.ObjectAssets` carregar primeiro)
   *  de propósito — este módulo tem que funcionar sozinho, mesmo se algum
   *  dia for reaproveitado fora do contexto de tipos de objeto do mapa. */
  function _slug(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_');
  }

  /** Parser `.obj` escrito do zero — ver escopo suportado no comentário
   *  grande do topo do arquivo. Devolve `{ positions: number[], normals:
   *  number[]|null, grupos: {material:string|null, start:number,
   *  count:number}[] }` — arrays "achatados" (x,y,z,x,y,z,...), NÃO
   *  indexados (cada triângulo com seus 3 vértices próprios, nunca
   *  compartilhados) — o jeito mais simples/robusto de montar geometria a
   *  partir de índices `f` arbitrários sem ter que deduplicar combinações
   *  (v,vt,vn) manualmente. `grupos` (NOVO, 15/09/2026 UTC) marca faixas
   *  contíguas de VÉRTICES (unidade compatível com `BufferGeometry.
   *  addGroup`) associadas ao material vigente no momento (`usemtl <nome>`,
   *  `null` enquanto nenhum foi declarado ainda) — usado por `_buildGroup`
   *  pra montar 1 `THREE.Group`/material por trecho quando `opts.materiais`
   *  foi passado em `register`; se o `.obj` nunca usa `usemtl`, `grupos`
   *  vira uma única faixa com `material: null` (equivalente a "sem
   *  materiais", comportamento IDÊNTICO ao de antes desta rodada). Lança
   *  erro com mensagem clara em caso de sintaxe inesperada (nunca falha
   *  silenciosamente/geometria errada). */
  function parseObjText(texto) {
    const verts = []; // cada item: [x,y,z]
    const norms = []; // cada item: [x,y,z]
    const positions = [];
    const normals = [];
    let temNormaisSuficientes = true;
    let matAtual = null;
    const grupos = [];
    function _fecharGrupo(countVerts) {
      if (!countVerts) return;
      const startVerts = positions.length / 3 - countVerts;
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.material === matAtual) {
        ultimo.count += countVerts;
      } else {
        grupos.push({ material: matAtual, start: startVerts, count: countVerts });
      }
    }
    const linhas = String(texto || '').split('\n');
    for (let li = 0; li < linhas.length; li++) {
      const linhaCrua = linhas[li];
      const linha = linhaCrua.trim();
      if (!linha || linha[0] === '#') continue;
      const partes = linha.split(/\s+/);
      const cmd = partes[0];
      if (cmd === 'v') {
        const x = parseFloat(partes[1]), y = parseFloat(partes[2]), z = parseFloat(partes[3]);
        if ([x, y, z].some((n) => Number.isNaN(n))) throw new Error(`linha ${li + 1}: 'v' com coordenada inválida — "${linhaCrua}"`);
        verts.push([x, y, z]);
      } else if (cmd === 'vn') {
        const x = parseFloat(partes[1]), y = parseFloat(partes[2]), z = parseFloat(partes[3]);
        if ([x, y, z].some((n) => Number.isNaN(n))) throw new Error(`linha ${li + 1}: 'vn' com coordenada inválida — "${linhaCrua}"`);
        norms.push([x, y, z]);
      } else if (cmd === 'usemtl') {
        // NOVO (15/09/2026 UTC) — troca o material "vigente" pras próximas
        // faces (até o próximo `usemtl` ou fim do arquivo). `null`/ausente
        // (partes[1] vazio) volta pro "sem material" — não deveria
        // acontecer em arquivos gerados por `gerar_malhas.js` (sempre
        // nomeia), mas fica defensivo pra `.obj` externo malformado.
        matAtual = partes[1] || null;
      } else if (cmd === 'f') {
        const refs = partes.slice(1).map((tok) => {
          const campos = tok.split('/'); // "v", "v/vt", "v//vn", "v/vt/vn"
          let vi = parseInt(campos[0], 10);
          if (vi < 0) vi = verts.length + vi + 1; // índice negativo = relativo ao fim (spec OBJ)
          let ni = campos[2] ? parseInt(campos[2], 10) : null;
          if (ni != null && ni < 0) ni = norms.length + ni + 1;
          if (!vi || vi < 1 || vi > verts.length) throw new Error(`linha ${li + 1}: 'f' referencia vértice #${vi} inexistente — "${linhaCrua}"`);
          return { vi, ni };
        });
        if (refs.length < 3) throw new Error(`linha ${li + 1}: 'f' com menos de 3 vértices — "${linhaCrua}"`);
        // Triangulação em leque: (0,1,2), (0,2,3), (0,3,4), ... — válido só
        // pra polígonos convexos simples (a grande maioria de exportações
        // reais de programas de modelagem já sai triangulada ou em quads).
        const countAntes = positions.length / 3;
        for (let i = 1; i < refs.length - 1; i++) {
          for (const ref of [refs[0], refs[i], refs[i + 1]]) {
            const v = verts[ref.vi - 1];
            positions.push(v[0], v[1], v[2]);
            if (ref.ni != null && norms[ref.ni - 1]) {
              const n = norms[ref.ni - 1];
              normals.push(n[0], n[1], n[2]);
            } else {
              temNormaisSuficientes = false;
            }
          }
        }
        _fecharGrupo(positions.length / 3 - countAntes);
      }
      // outros comandos ('vt', 'o', 'g', 'mtllib', 's', ...) — ignorados de
      // propósito, ver escopo documentado no topo do arquivo ('mtllib' é
      // lido por `ferramentas/obj_para_malha_js.js`, não por este parser em
      // tempo de execução — o `.malha.js` já chega com `opts.materiais`
      // pronto, sem precisar reabrir o `.mtl` no navegador).
    }
    if (!positions.length) throw new Error('nenhuma face (\'f\') válida encontrada no .obj — malha vazia');
    return { positions, normals: (temNormaisSuficientes && normals.length === positions.length) ? normals : null, grupos };
  }

  /** Constrói o `THREE.Group`-molde de `nome` a partir do texto já
   *  registrado (`_texts[nome]`) — 1x, cacheado em `_cache[nome]`; chamadas
   *  seguintes só clonam (mesma regra de sempre neste projeto pra "molde"
   *  compartilhado — ver `Model3DLoader.getClone`). */
  function _buildGroup(nome) {
    if (_cache[nome]) return _cache[nome];
    const THREE = window.THREE;
    if (!THREE) throw new Error('THREE ainda não carregado — ObjMeshSource depende do motor 3D já montado');
    const texto = _texts[nome];
    if (!texto) return null;
    const { positions, normals, grupos } = parseObjText(texto);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals(); // flat shading (geometria não-indexada) — ver comentário de escopo no topo
    }
    const corPadrao = (typeof _cores[nome] === 'number') ? _cores[nome] : 0x8a92a3; // cinza padrão — MESMA cor do perfil genérico (engine3d-profiles.js)
    const materiaisInfo = _materiais[nome]; // { nomeMat: { cor, opacidade? } } opcional (ver register())
    const temGruposComMaterial = grupos.some((g) => g.material);
    let material;
    if (temGruposComMaterial && materiaisInfo) {
      // NOVO (15/09/2026 UTC) — 1 THREE.Material por nome de `usemtl`
      // distinto (na ordem em que aparecem primeiro no .obj), mais 1
      // material extra "padrão" (corPadrao) só se alguma faixa ficou SEM
      // `usemtl` (defensivo — os builders de `gerar_malhas.js` sempre
      // marcam TODAS as faces de um objeto multi-material, então isso não
      // deveria disparar pros 6 tipos gerados, mas cobre um `.obj` externo
      // que misture faces com e sem material).
      const nomesUnicos = [];
      grupos.forEach((g) => { if (g.material && !nomesUnicos.includes(g.material)) nomesUnicos.push(g.material); });
      const materiaisTHREE = nomesUnicos.map((nomeMat) => {
        const info = materiaisInfo[nomeMat] || {};
        const cor = (typeof info.cor === 'number') ? info.cor : corPadrao;
        const params = { color: cor };
        if (typeof info.opacidade === 'number' && info.opacidade < 1) { params.transparent = true; params.opacity = info.opacidade; }
        return new THREE.MeshLambertMaterial(params);
      });
      let indiceSemMaterial = -1;
      grupos.forEach((g) => {
        let idx;
        if (g.material) {
          idx = nomesUnicos.indexOf(g.material);
        } else {
          if (indiceSemMaterial === -1) {
            indiceSemMaterial = materiaisTHREE.length;
            materiaisTHREE.push(new THREE.MeshLambertMaterial({ color: corPadrao }));
          }
          idx = indiceSemMaterial;
        }
        geometry.addGroup(g.start, g.count, idx);
      });
      material = materiaisTHREE;
    } else {
      material = new THREE.MeshLambertMaterial({ color: corPadrao });
    }
    const mesh = new THREE.Mesh(geometry, material);
    const group = new THREE.Group();
    group.add(mesh);
    _cache[nome] = group;
    delete _erros[nome];
    return group;
  }

  /** MESMO padrão de `ObjectAssets._tryLoadScript` — injeta `<script
   *  src="...">`, resolve em QUALQUER caso (sucesso OU 404), nunca rejeita
   *  (arquivo de malha ausente é normal — nem todo tipo precisa de uma). */
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
    /** Chamado pelo PRÓPRIO arquivo `assets/modelos/<nome>.malha.js` ao
     *  carregar — registra o texto bruto do `.obj` (embrulhado em string
     *  JS, ver `ferramentas/obj_para_malha_js.js`). `opts.cor` é opcional
     *  (número hex, ex. `0xb5651d`) — cor sólida do material de fallback
     *  (usada quando o `.obj` não tem `usemtl`/`opts.materiais`, OU pra
     *  qualquer face sem grupo de material). `opts.materiais` (NOVO,
     *  15/09/2026 UTC) é opcional — `{ <nomeMaterial>: { cor: hexNumber,
     *  opacidade?: number } }`, 1 entrada por `usemtl <nome>` usado no
     *  `.obj` (ver `ferramentas/obj_para_malha_js.js`, que lê isso de um
     *  `.mtl` companheiro automaticamente). NÃO parseia na hora (só guarda
     *  a string/objeto) — parse de verdade só acontece em `getClone`/
     *  `preload`'s primeira chamada bem-sucedida, igual ao resto do
     *  projeto adia trabalho pesado pro instante em que é realmente
     *  preciso. */
    register(nome, texto, opts) {
      _texts[nome] = texto;
      if (opts && typeof opts.cor === 'number') _cores[nome] = opts.cor;
      if (opts && opts.materiais && typeof opts.materiais === 'object') _materiais[nome] = opts.materiais;
    },

    /** true assim que `nome` tem texto de malha registrado — SÍNCRONA,
     *  pensada pro mesmo uso de `Model3DLoader.hasModel` dentro do laço de
     *  construção de cena (`engine3d.js` `_buildOneObjectMesh`): quem
     *  garante que já tentou carregar ANTES da cena ser montada é
     *  `ObjectAssets.ensureMeshesReadyForMap` (chamado por view3d.js
     *  `_rebuildScene`, mesmo espírito de `Model3DLoader.preloadAll`). */
    hasModel(nome) { return !!(nome && _texts[nome]); },

    /** Mensagem do último erro de parse, ou `null`. */
    getError(nome) { return _erros[nome] || null; },

    /** Clona (nunca a referência guardada) o `THREE.Group` de `nome`, ou
     *  `null` se não disponível/falhou ao parsear. Mesma assinatura de
     *  `Model3DLoader.getClone` de propósito — `engine3d.js` reaproveita o
     *  MESMO builder (`_buildModeloArquivoMesh`, agora com uma fonte
     *  escolhível) pras duas origens de malha externa (.glb importado E
     *  .obj estático), sem duplicar código de posicionar/pickable/etc. */
    getClone(nome) {
      try {
        const g = _buildGroup(nome);
        return g ? g.clone() : null;
      } catch (err) {
        _erros[nome] = err?.message || String(err);
        console.error(`[ObjMeshSource] falha ao parsear malha "${nome}":`, err);
        return null;
      }
    },

    /** Tenta carregar `assets/modelos/js/<slug(nome)>.malha.js` — só uma vez
     *  por `nome` (a vida inteira da página); chamadas seguintes devolvem
     *  a MESMA Promise já em andamento/resolvida (evita 2 `<script>`
     *  duplicados se `preload` for chamado 2x rápido pro mesmo tipo, ex.
     *  de `ObjectAssets.registerModel` E de `preloadDeclared` juntos).
     *  [20/09/2026 UTC] Caminho ATUALIZADO — pedido verbatim: "Em
     *  'outputs/modelo/' migre os '*.js' (*.malha.js e *.config.js) para
     *  uma pasta js, ficando 'outputs/assets/modelos/js/'." Só o `.malha.js`
     *  (código) mudou de pasta; `.obj`/`.mtl`/`.glb` (dados de modelo)
     *  continuam direto em `assets/modelos/`. */
    preload(nome) {
      if (!nome) return Promise.resolve(false);
      if (_preloadPromises[nome]) return _preloadPromises[nome];
      _attempted[nome] = true;
      _preloadPromises[nome] = _tryLoadScript(`assets/modelos/js/${_slug(nome)}.malha.js`);
      return _preloadPromises[nome];
    },

    /** Espera TODAS as tentativas de `preload` já disparadas (por
     *  `ObjectAssets.registerModel`, ver js/objectassets.js) terminarem —
     *  chamado por `ObjectAssets.ensureMeshesReadyForMap` DEPOIS de
     *  carregar todo `.model.js` do mapa (que é quem dispara os
     *  `preload`, ver "endereçado em <nome>.model.js" no comentário do
     *  topo) e ANTES de `Engine3D.setScene`, pra geometria estática já
     *  estar pronta na 1ª renderização. */
    async awaitAllPending() {
      await Promise.all(Object.values(_preloadPromises));
    },
  };
})();
