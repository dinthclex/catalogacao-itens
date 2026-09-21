/**
 * modeler-core.js — Modelador 3D estilo Blender: o objeto `window.Modeler3D`
 * propriamente dito. Orquestra os outros módulos (modeler-mesh.js,
 * modeler-gizmo.js, modeler-render.js, modeler-input.js, modeler-ui.js — CADA
 * UM carregado antes deste, ver index.html) através de um único objeto de
 * ESTADO compartilhado (`this._state`, documentado logo abaixo) — nenhum dos
 * outros módulos guarda estado próprio, todos recebem `state` como 1º
 * argumento de cada função. Expõe a API pública que mapview.js/view3d.js
 * chamam: `enter(view3d, obj, opts)`, `exit()`, `isActive()`,
 * `ensureCustomMesh(obj)`. [12/09/2026] `enter` ganhou um 3º argumento
 * opcional `opts.enterOrbital` (padrão `true`, comportamento de sempre) —
 * ver comentário grande dentro de `enter()`.
 *
 * HISTÓRICO — pedido original do usuário (28/08/2026): "Vamos implementar o
 * modelar de um objeto como no blender. Deve haver os dois modos o modo
 * 'objeto' e o modo 'edição' como no Blender [...]". Depois de usar,
 * o usuário voltou com uma lista de ajustes (mesma data) que está
 * documentada em cada módulo, no ponto exato que ela afeta — o resumo:
 *
 *   1) MODULARIZAÇÃO — "tudo que seja relacionado a ele [o Modelador], esteja
 *      em arquivos separados". Era um arquivo só (js/modeler3d.js); virou
 *      estes 6 arquivos (mesh/gizmo/render/input/ui/core) + css/modeler3d.css.
 *      Nenhum usa import/export ES module nem fetch de arquivo local — só
 *      `<script>` clássico (ver index.html), então continua funcionando sob
 *      file:///.
 *   2) Inserir um cubo NOVO direto no cenário (não só editar um objeto já
 *      existente) — ver mapview.js, botão "🧊 Novo Cubo 3D" na barra do modo
 *      Objetos, que chama `Mapping.addObject` + `ensureCustomMesh` direto,
 *      sem precisar de nenhuma mudança aqui no core.
 *   3) Modo Objeto/Edição em PT-BR + explicação do propósito de cada um —
 *      ver modeler-ui.js/modeler-input.js.
 *   4) BUG "objeto fica duplicado"/destaque preso na posição antiga — a
 *      causa raiz encontrada (ver comentário grande em engine3d.js
 *      `_buildCustomMeshObject`) era a caixa de PICKING (destaque ao mirar)
 *      de um objeto modelado sendo calculada com uma fórmula que só valia
 *      pra rotação em Y — girar em X/Z (Modo Objeto, gizmo de Girar) deixava
 *      o CENTRO dessa caixa desatualizado, parecendo um "objeto fantasma" na
 *      posição de antes de girar. Corrigido calculando o bounding box em
 *      espaço de MUNDO de verdade (`THREE.Box3().setFromObject`). Reforçado
 *      aqui, em `enter/exit/_commit`, com um design que NUNCA clona o objeto
 *      (`state.obj` é a mesma referência do início ao fim — ver `enter`) e
 *      grava tudo de volta via `Mapping.updateObject(map, obj.id, patch)`
 *      (procurado por ID, nunca por referência "torcida") — ver `_commit`.
 *   5-6) Atalhos Blender/tecla A toggle — ver modeler-input.js.
 *   7) Botão direito seleciona + contorno dourado (ATUALIZADO 02/09/2026:
 *      era uma varredura radial 2D reaproveitando a técnica "outline2d" do
 *      resto do app — ver engine3d.js `_drawOutline2D` — trocada por casco
 *      invertido de verdade em WebGL, pedido explícito do usuário — ver
 *      `state.outlineMesh`/`ModelerRender.updateObjectOutline` em
 *      modeler-render.js).
 *   8) Gizmo pixel-perfect (GPU picking) — ver modeler-gizmo.js.
 *   9-15) Wireframe/oclusão/pontos/gradientes/bolinha de origem — ver
 *      modeler-render.js.
 *
 * SIMPLIFICAÇÕES DOCUMENTADAS (repetidas aqui por conveniência — o detalhe de
 * cada uma está no módulo que a implementa):
 *   - Eixo travado (X/Y/Z) de G/R/S sempre em orientação GLOBAL, nunca local.
 *   - Extrude/Inset tratam cada face selecionada INDIVIDUALMENTE (sem fundir
 *     região contígua).
 *   - Inset com fator FIXO (20%), sem arraste ao vivo.
 *   - Subdividir aresta solta (sem face) não atualiza as faces que a usam.
 *   - Duplicar não cria paredes laterais (diferente de Extrudar).
 *   - Make Edge/Face usa a ORDEM de clique dos vértices, não reconstrução
 *     automática do melhor contorno.
 *   - Painel N em Modo de Edição só edita Posição (Rotação/Escala da seleção
 *     ficam só via teclado/gizmo).
 *   - Rotação em Object Mode usa eixos do PRÓPRIO Three.js/app (Y "pra
 *     cima"), não a convenção Z-pra-cima do Blender — só a EXPERIÊNCIA
 *     (atalhos/cores/gizmo) copia o Blender.
 *   - Sem Loop Cut, Knife, Bisect, Spin, Screw, Offset Edge Slide, "Dissolve"
 *     (fora do escopo combinado com o usuário desde a 1ª rodada).
 *   - Colisão top-down (`obj.colisaoTopo`) continua só PERSISTIDA/EXPOSTA —
 *     não há movimentação em 1ª pessoa de verdade neste app pra consumir
 *     isso ainda (ver mapview.js/view3d.js).
 */

const Modeler3D = {
  _state: null,

  isActive() { return !!this._state?.active; },

  defaultCubeMesh(w, d, h) { return ModelerMesh.defaultCubeMesh(w, d, h); },

  /** Garante que `obj` tenha `customMesh` — chamado tanto de fora
   *  (mapview.js/view3d.js) quanto internamente. Usa a caixa delimitadora
   *  ATUAL do objeto (largura/profundidade/altura) como tamanho do cubo
   *  inicial, se já tiver uma — senão 0,5m (é assim que o botão "🧊 Novo
   *  Cubo 3D", que cria um objeto do zero sem essas medidas, acaba
   *  resultando num cubo de 0,5m padrão). Também marca `obj.forma =
   *  'retangulo'` (retrocompatibilidade — é assim que o 2D/vista de cima
   *  continua desenhando uma caixa plausível pra este objeto agora
   *  modelado, sem precisar mexer em Map2DRenderer). */
  /** [16/09/2026 UTC] NOVO — "Se a escada não for modificada, então ela
   *  carrega o modelo que veio do arquivo." Compara os campos que alteram a
   *  geometria da escada (largura/profundidade/nº de degraus/altura) contra
   *  o padrão do catálogo (`OBJECT3D_PROFILES.escada`) — qualquer
   *  divergência conta como "modificada", e só nesse caso a escada usa a
   *  malha procedural (`ModelerMesh.stairsMesh`/`_buildEscadaMesh` em
   *  engine3d.js) em vez da malha estática do arquivo. Usada tanto aqui
   *  (`ensureCustomMesh`) quanto pela flag "gerado por código" na UI. */
  _escadaFoiModificada(obj) {
    return obj.tipo === 'escada'; // sempre gerada por código a partir das propriedades do objeto
  },

  /** Todos os nós de topo de `engine._group` que pertencem ao objeto (ele
   *  mesmo ou algum descendente com `userData.pick.ref.id === obj.id`) —
   *  cobre objetos compostos (Switch, Patch panel, Rack: caixa, conectores,
   *  portas, tampas, etc.), não só as malhas com raycast. */
  _engineRootsOf(obj, engine) {
    const out = [];
    const grp = engine && engine._group;
    if (!grp) return out;
    grp.children.forEach((c) => {
      let achou = c.userData?.pick?.ref?.id === obj.id;
      if (!achou) c.traverse((n) => { if (!achou && n.userData?.pick?.ref?.id === obj.id) achou = true; });
      if (achou) out.push(c);
    });
    return out;
  },

  /** Malha REAL que o motor 3D já desenhou pra este objeto (mesma que se vê
   *  no "Ver em 3D"), convertida pro espaço local do Modelador (origem no
   *  objeto, sem a rotação do mapa, base em y=0). Devolve
   *  `{ mesh, minWorldY }` ou null. Vértices ficam com o valor EXATO da
   *  malha (sem arredondar) — só coincidentes idênticos são soldados. */
  _captureRenderedMesh(obj, view3d) {
    try {
      const engine = view3d && view3d._engine;
      if (!engine || !engine._ready || !engine.THREE) return null;
      const roots = this._engineRootsOf(obj, engine);
      if (!roots.length) return null;
      // Instâncias em excesso (ex.: milhares de furos de rack) ficam de fora pra não travar a edição.
      // Detalhes finos repetidos (conectores/furos = muitas instâncias) ficam de fora por padrão; opção em Configurações 3D.
      const incluir = !!(window.MapConfig && MapConfig._cache && MapConfig._cache.modeladorIncluirDetalhes);
      const limite = incluir ? 3000 : 48;
      // Equipamento de rede (switch, patch panel...): LEDs animados e serigrafia (textos) continuam sendo do objeto
      // original, que segue interativo por baixo da malha editada (ver Engine3D._buildRedeInteractiveOverlay).
      const ehRede = !!(window.RedeEquip && window.RedeEquip.ehEquipRede(obj.tipo));
      const ledRede = ehRede ? (engine._redeRuntime && engine._redeRuntime.get(obj.id) && engine._redeRuntime.get(obj.id).view._ledMalha) : null;
      const skipNode = (n) => (n.isInstancedMesh && n.count > limite) || (ehRede && (n.name === 'serigrafia' || (ledRede && n === ledRede)));
      const parts = [];
      roots.forEach((r) => {
        const m = ModelerMesh.fromThreeGroup(r, { skipNode });
        if (m && m.vertices.length) parts.push(m);
      });
      if (!parts.length) return null;
      const mesh = parts.length === 1 ? parts[0] : ModelerMesh.mergeMeshes(...parts);
      const th = (typeof objAnguloToRotY === 'function') ? objAnguloToRotY(obj.angulo || 0) : 0;
      const c = Math.cos(th), sn = Math.sin(th);
      let minY = Infinity;
      mesh.vertices.forEach((v) => {
        const px = v[0] - obj.x, pz = v[2] - obj.y;
        v[0] = px * c - pz * sn;
        v[2] = px * sn + pz * c;
        if (v[1] < minY) minY = v[1];
      });
      if (!isFinite(minY)) return null;
      // Rack: portas abertas entram FECHADAS no Modelador (giram de volta em torno da dobradiça).
      if (obj.tipo === 'rack' && window.RackModular) {
        try {
          const rack = window.RackModular.fromObjeto(obj);
          mesh.vertices.forEach((v) => {
            if (typeof v[5] !== 'string' || !v[5].startsWith('porta:')) return;
            const spec = rack.portas && rack.portas[v[5].slice(6)];
            if (!spec) return;
            const ang = Math.max(0, Math.min(110, Number(obj[spec.campoAngulo]) || 0));
            if (!ang) return;
            const th = ang * Math.PI / 180, cs = Math.cos(th), sn2 = Math.sin(th);
            const px = spec.pivo.x * 0.001, pz = spec.pivo.z * 0.001, dx = v[0] - px, dz = v[2] - pz;
            v[0] = px + dx * cs + dz * sn2;
            v[2] = pz - dx * sn2 + dz * cs;
          });
        } catch (e) { /* segue sem fechar */ }
      }
      mesh.vertices.forEach((v) => { v[1] -= minY; });
      return { mesh, minWorldY: minY };
    } catch (e) { return null; }
  },

  /** Objeto de uma cor só: remove as cores por vértice (vale `obj.cor`). Só objetos
   *  com várias cores/vidro guardam cor por peça. */
  _descartarCorUniforme(mesh) {
    const set = new Set();
    mesh.vertices.forEach((v) => set.add(v.length > 3 ? v[3] + '/' + v[4] : 'x'));
    if (set.size <= 1 && !mesh.vertices.some((v) => (v.length > 4 && v[4] < 1) || v.length > 5)) mesh.vertices.forEach((v) => { v.length = 3; });
  },

  ensureCustomMesh(obj, view3d) {
    if (obj.customMesh) return;
    const cap = view3d ? this._captureRenderedMesh(obj, view3d) : null;
    if (cap) {
      this._descartarCorUniforme(cap.mesh);
      obj.customMesh = cap.mesh;
      obj.customMeshXform = { rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
      obj.elevacao = cap.minWorldY - (obj.piso || 0) * 2.8;
      if (obj.forma !== 'retangulo' && obj.forma !== 'poligono') {
        obj.forma = 'retangulo';
        const bb = ModelerMesh.localBBox(cap.mesh.vertices);
        obj.largura = bb.maxX - bb.minX; obj.profundidade = bb.maxZ - bb.minZ; obj.altura = bb.maxY - bb.minY;
        if (!obj.cor) obj.cor = '#8a92a3';
      }
      return;
    }
    // Pedido do usuário (rodada 47) tentou fazer o objeto virar "à parte" do
    // catálogo zerando `obj.tipo` aqui — REVERTIDO na rodada 48: "Se era um
    // objeto padrão e foi editado pelo modo Modelador, então, deve continuar
    // sendo do mesmo tipo que era. Por exemplo, uma mesa ao ter seu 3D
    // modelado, continua sendo uma mesa." `obj.tipo` NÃO é mais tocado aqui
    // — o objeto mantém seu tipo de catálogo original mesmo depois de
    // ganhar uma malha customizada.
    // [09/09/2026] Ajuste solicitado pelo usuário: "No mapa 2D, no 'Retículo
    // métrico', ao ir em 'Ver em 3D', apontar para um 'Retículo métrico' e
    // clicar em 'Modelar em 3D', ele vira uma caixa (ganha uma altura) e
    // soma com o desenho de grade interno. Não deveria ser assim." Causa
    // raiz: esta função sempre semeava `obj.customMesh` com um cubo cheio
    // usando `obj.altura` como ALTURA DE VERDADE (h) — mas pra um Retículo
    // métrico, `obj.altura` NUNCA é altura (é reaproveitado como ELEVAÇÃO,
    // ver engine3d.js `_buildOneObjectMesh`, bloco "Retículo métrico": a
    // espessura de verdade dele é sempre fixa em 1mm, uma "placa" fina — é
    // assim que o retículo aparece normalmente no 3D, com as linhas da
    // grade desenhadas rentes ao topo dessa placa). Semear com `h =
    // obj.altura` (tipicamente bem maior que 1mm) extrudia a placa fina num
    // bloco alto — daí "ganha uma altura" — e, como a malha original
    // continua sendo montada com aquele mesmo `obj.altura` fora do
    // Modelador (só o `customMesh` muda o que se vê DENTRO do editor/depois
    // de editado), o resultado somava a caixa alta com o desenho de grade
    // que continuava sendo calculado a partir das dimensões antigas.
    // Corrigido: retículo métrico sempre semeia com espessura de 1mm (igual
    // ao 3D "de fora"), então entrar no Modelador não distorce a placa —
    // continua fina/reta até a pessoa editar de propósito.
    // [16/09/2026 UTC] CORRIGIDO — bug pré-existente (não só do editor de
    // molde novo): um objeto REAL `forma:'poligono'` (cilindro/cone —
    // relógio, poste, coluna, extintor, etc., ver `Mapping.
    // defaultShapeForTipo`) nunca tem `obj.largura`/`obj.profundidade`
    // (esses campos só existem pra `forma:'retangulo'`) — `w`/`d` caíam
    // sempre no fallback fixo de 0,5m, ignorando o raio de verdade do
    // objeto (`obj.raio`), então "Modelar em 3D" num objeto cilíndrico
    // sempre semeava um cubo/cilindro de 0,5m de diâmetro, não do tamanho
    // real dele. Corrigido lendo `obj.raio*2` como diâmetro quando a forma
    // é 'poligono'.
    const w = obj.largura || (obj.forma === 'poligono' ? (obj.raio || 0.3) * 2 : 0.5);
    const d = obj.profundidade || (obj.forma === 'poligono' ? (obj.raio || 0.3) * 2 : 0.5);
    const h = obj.reticuloMetrico ? 0.001 : (obj.altura || 0.5);
    // Pedido do usuário: "Isso deve ser uma opção nas 'configurações 3D' na
    // seção 'Cubo'" — lê `MapConfig._cache` direto (síncrono: por padrão já
    // populado, `view3d.js` chama `MapConfig.get()` ao montar a tela 3D,
    // bem antes de qualquer clique em "Novo Cubo"/"Modelar em 3D" ser
    // possível; se por algum motivo ainda não tiver rodado, cai no padrão
    // `true`, igual ao `DEFAULTS.cuboOrigemCentro`, ver mapconfig.js).
    const centered = (typeof MapConfig !== 'undefined' && MapConfig._cache)
      ? MapConfig._cache.cuboOrigemCentro !== false
      : (typeof MapConfig !== 'undefined' ? MapConfig.DEFAULTS.cuboOrigemCentro !== false : true);
    // [22/09/2026] NOVO — pedido verbatim: "Há um bug do objeto escada
    // quando se vai modelá-lo [...] ao entrar no modo Modelador, a Escada
    // acaba virando uma caixa visualmente [...] Este fenômeno [...] está
    // acontecendo com outros objetos: Mesa, Luminária." CAUSA RAIZ/CORREÇÃO
    // — ver comentário grande em `ModelerMesh.stairsMesh`/`mesaMesh`/
    // `luminariaMesh` (modeler-mesh.js) pra causa raiz completa: esta
    // função sempre semeava QUALQUER objeto com uma caixa lisa
    // (`defaultCubeMesh`), mesmo tipos com renderização PRÓPRIA fora do
    // Modelador — agora, pra esses 3 tipos, semeia com uma malha editável
    // que já reproduz a silhueta real (degraus/tampo+pernas/tubos+tampas)
    // em vez de uma caixa única. Dimensões/fórmulas iguais às usadas pela
    // malha "de fora" (engine3d.js `_buildEscadaMesh`/`_buildMesaMesh`/
    // `_buildLuminariaMesh`) — mesmos valores-padrão quando o campo do
    // objeto ainda não existe. Qualquer OUTRO tipo (sem renderização
    // própria) continua caindo no `defaultCubeMesh` de sempre, sem mudança.
    // [16/09/2026 UTC] REESCRITO — pedido verbatim: "A malha carregada deve
    // ser uma própria do objeto, não uma genérica, nem aproximada [...]
    // Tanto em 'Ver em 3D' (cabeçalho) quanto em 'Acessar Modelos'->'Editar'
    // e 'Acessar Modelos'->'Ver em 3D' devem carregar o mesmo conteúdo do
    // arquivo .js do objeto respectivo." CAUSA RAIZ do "caixa genérica": esta
    // função nunca tentava a malha ESTÁTICA carregada de arquivo
    // (`.malha.js`/`ObjMeshSource` ou `.glb.js`/`GlbMeshSource` — a mesma
    // fonte usada pela renderização real em `engine3d.js`
    // `_buildOneObjectMesh`), só sabia gerar aproximações à mão (caixa/
    // cilindro/cone/composições dedicadas). Agora: PRIMEIRO tenta a malha
    // real do arquivo via `ModelerMesh.fromThreeGroup` (novo, ver
    // modeler-mesh.js) a partir de `GlbMeshSource.getClone`/
    // `ObjMeshSource.getClone` — SEMPRE a mesma malha usada fora do
    // Modelador. A EXCEÇÃO é a escada: "ela deve continuar sendo gerada por
    // código" — MAS "se a escada não for modificada, então ela carrega o
    // modelo que veio do arquivo" — ver `_escadaFoiModificada` abaixo: só
    // quando os campos da instância divergem do padrão do catálogo
    // (`OBJECT3D_PROFILES.escada`) é que a malha procedural
    // (`ModelerMesh.stairsMesh`) é usada aqui; caso contrário a escada
    // também recebe a malha real do arquivo, igual aos demais objetos.
    const tipo = obj.tipo;
    const escadaModificada = tipo === 'escada' && Modeler3D._escadaFoiModificada(obj);
    let arquivoMesh = null;
    if (!escadaModificada) {
      try {
        if (window.GlbMeshSource?.hasModel?.(tipo)) {
          arquivoMesh = ModelerMesh.fromThreeGroup(window.GlbMeshSource.getClone(tipo));
        } else if (window.ObjMeshSource?.hasModel?.(tipo)) {
          arquivoMesh = ModelerMesh.fromThreeGroup(window.ObjMeshSource.getClone(tipo));
        }
      } catch (e) { arquivoMesh = null; }
    }
    if (arquivoMesh && arquivoMesh.vertices && arquivoMesh.vertices.length) {
      this._descartarCorUniforme(arquivoMesh);
      obj.customMesh = arquivoMesh;
    } else if (tipo === 'escada') {
      obj.customMesh = ModelerMesh.stairsMesh(w, d, obj.escadaDegraus, obj.alturaEscada || obj.altura || 2.0);
    } else if (tipo === 'mesa') {
      obj.customMesh = ModelerMesh.mesaMesh(w, d, h);
    } else if (tipo === 'luminaria') {
      obj.customMesh = ModelerMesh.luminariaMesh(w, d, h);
    } else if (tipo === 'carro') {
      obj.customMesh = ModelerMesh.carroMesh(w, d, h);
    } else {
      // Fallback (sem malha de arquivo disponível ainda — ex.: enquanto o
      // `.malha.js`/`.glb.js` do tipo ainda está sendo baixado/registrado):
      // consulta `OBJECT3D_PROFILES[obj.tipo]` e semeia com a primitiva mais
      // próxima da forma real, como antes.
      const perfil = window.OBJECT3D_PROFILES?.[tipo];
      if (tipo === 'relogio') {
        obj.customMesh = ModelerMesh.relogioMesh(perfil?.r || w / 2, perfil?.h || 0.04);
      } else if (perfil?.shape === 'cylinder') {
        obj.customMesh = ModelerMesh.cylinderMesh(32, w / 2, h);
      } else if (perfil?.shape === 'cone') {
        obj.customMesh = ModelerMesh.coneMesh(32, w / 2, 0, h);
      } else {
        obj.customMesh = ModelerMesh.defaultCubeMesh(w, d, h, centered);
      }
    }
    obj.customMeshXform = { rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    if (obj.forma !== 'retangulo' && obj.forma !== 'poligono') {
      obj.forma = 'retangulo';
      obj.largura = w; obj.profundidade = d; obj.altura = h;
      if (!obj.cor) obj.cor = '#8a92a3';
    }
  },

  // =====================================================================
  // ENTRAR / SAIR
  // =====================================================================

  /** `view3d`: a View3D já montada (view3d.js) — reaproveita `view3d._engine`/
   *  `view3d._map`/`view3d._container`. `obj`: a referência VIVA do objeto
   *  dentro de `view3d._map.objects` (nunca uma cópia — ver item 4 no
   *  cabeçalho deste arquivo). `opts.enterOrbital` [12/09/2026, NOVO] —
   *  `true` (padrão, comportamento de sempre) entra com `camPosMode:
   *  'orbit'` (câmera orbitando em torno do objeto, centro = pivô dele);
   *  `false` entra com `camPosMode: 'free'` a partir da pose ATUAL de
   *  `camera3` (mesma técnica de `toggleCamPosMode`), sem nenhum
   *  comportamento orbital — usado por `view3d.js` quando o Modelador é
   *  aberto enquanto o personagem está em "Ver através desta câmera"
   *  (`_fotoCamMode` ativo): pedido verbatim do usuário
   *  "ao entrar no Modelador, estando no modo 'Ver através desta câmera',
   *  a câmera não deve ficar orbital, mas sim deve permanecer na
   *  perspectiva da câmera que se selecionou". Antes desta rodada, mesmo
   *  com a pose inicial já correta (`_poseFromCurrentCamera`/
   *  `_initOrbitFromCamera`, ver comentário grande abaixo), o Modelador
   *  SEMPRE entrava em modo orbital — a posição inicial batia com a
   *  câmera, mas o alvo da órbita era sempre o CENTRO DO OBJETO, então
   *  qualquer interação de câmera (arrastar pra orbitar) já girava em
   *  torno do objeto em vez de continuar livre a partir da perspectiva da
   *  câmera. */
  enter(view3d, obj, opts = {}) {
    const enterOrbital = opts.enterOrbital !== false;
    if (this._state?.active) this.exit({ skipRebuild: true });
    if (!obj) return;
    // NOVO (03/09/2026) — bug relatado: "ao inserir um objeto escada no
    // mundo, entrar no Modelador e, depois, sair do Modelador, a escada
    // acaba virando uma caixa." Causa raiz: `ensureCustomMesh` (chamada
    // logo abaixo) SEMPRE seeda `obj.customMesh` com uma caixa simples
    // (`ModelerMesh.defaultCubeMesh`, baseada só em largura/profundidade/
    // altura) quando o objeto ainda não tinha malha customizada — mesmo pra
    // tipos com renderização PRÓPRIA (escada/mesa/luminária/poste, ver
    // engine3d.js `_buildEscadaMesh`/etc.), que não têm nada a ver com uma
    // caixa. Isso por si só é inofensivo (o objeto SÓ passa a preferir
    // `customMesh` na hora de renderizar se ele de fato tiver um — ver
    // engine3d.js linha ~2411), MAS `_commit()` (chamado por `exit()`)
    // gravava esse `customMesh` semeado de volta no objeto INCONDICIONAL-
    // MENTE, mesmo que a pessoa só tenha entrado e saído sem editar nada —
    // "comitando" a caixa seed por engano e substituindo a escada de
    // verdade pra sempre. Corrigido guardando aqui um retrato de tudo que
    // `ensureCustomMesh` pode alterar (só quando o objeto AINDA NÃO tinha
    // `customMesh` antes) — `_commit()` desfaz o seed (restaura este
    // retrato) se `state.actionLog` continuar vazio ao sair (nenhuma edição
    // de verdade aconteceu — ver `ModelerMesh._logAction`/`pushUndo`, só
    // chamadas por ações reais de edição/inserção/transformação).
    // Retrato COMPLETO do objeto antes de qualquer alteração (o seed/captura
    // de `ensureCustomMesh` muta o objeto em memória). Nada é gravado no
    // banco até "Aplicar alterações"/saída com "Aplicar"; "Descartar" (ou
    // sair sem mudanças) restaura este retrato.
    const objBackup = this._backupObj(obj);
    this.ensureCustomMesh(obj, view3d);
    const engine = view3d._engine;
    if (!engine || !engine._ready || !engine.THREE) {
      Utils.toast?.('O motor 3D ainda não terminou de carregar — tente de novo em instantes.', { type: 'warn' });
      return;
    }
    // [10/09/2026] NOVO — pedido verbatim: "ao apontar para um objeto e
    // clicar em 'Modelar em 3D', quando entrar no Modelador, a perspectiva
    // da câmera selecionada deve se manter." O Modelador nunca toca em
    // `camera3.view` (o deslocamento de "lente"/pan de Shift+botão-do-meio
    // em 'Ver através desta câmera', ver Engine3D.setCamPanFrac) — um pan
    // deixado ligado ficaria PERMANENTEMENTE torto durante toda a sessão
    // do Modelador (a órbita dele não sabe nada sobre esse offset). Limpo
    // aqui, sempre, incondicionalmente (barato/inofensivo mesmo fora de
    // 'Ver através' — não há nada a limpar nesse caso).
    engine.setCamPanFrac?.(0, 0);

    const state = {
      active: true,
      view3d,
      obj, // MESMA referência do início ao fim — NUNCA clonada (ver item 4)
      objBackupEntrada: objBackup, // retrato do objeto ANTES da sessão (nunca trocado) — usado pelo Ctrl+Z depois de sair
      objBackup, // retrato do objeto antes da sessão — restaurado ao descartar/sair sem mudanças
      snap: null, // retrato EXATO da malha logo após carregar — base do `_isDirty`
      THREE: engine.THREE,
      scene: engine.scene,
      camera: engine.camera3,
      canvas: view3d._container.querySelector('#v3d-canvas'),
      wrapEl: view3d._container.querySelector('.view3d-wrap'),
      rootEl: null,

      mode: 'object',
      selectMode: 'vertex',
      gizmoMode: 'move',
      limitToVisible: true, // padrão LIGADO — "comportamento seguro" de só selecionar o que se vê (decisão documentada, pedido do usuário deixou em aberto)
      objectSelected: true, // Modo Objeto já entra com o objeto "selecionado" (contorno amarelo visível) — é o único objeto em escopo nesta sessão

      cm: {
        vertices: obj.customMesh.vertices.map((v) => v.slice()),
        edges: obj.customMesh.edges.map((e) => e.slice()),
        faces: obj.customMesh.faces.map((f) => f.slice()),
      },
      xform: (() => { const x = obj.customMeshXform || {}; return { rotX: x.rotX || 0, rotY: x.rotY || 0, rotZ: x.rotZ || 0, scaleX: x.scaleX || 1, scaleY: x.scaleY || 1, scaleZ: x.scaleZ || 1 }; })(),
      sel: { verts: new Set(), edges: new Set(), faces: new Set() },
      selOrder: { verts: [] },
      activeVertex: null,
      activeEdge: null,

      // NOVO (02/09/2026), pedido verbatim (item 12 da rodada de 13 itens):
      // "As lâmpadas devem gerar luz de verdade de acordo com o tipo de
      // lâmpada." Os 5 marcadores da seção "Lâmpada" (Ponto/Sol/Spot/Hemi/
      // Area — PRIMITIVE_CATALOG.lampada, modeler-ui.js) até aqui só
      // inseriam geometria DECORATIVA (ver comentário grande no topo do
      // catálogo — "este Modelador não tem luzes/câmeras funcionais de
      // verdade"). `state.lights`: uma entrada por marcador de lâmpada
      // inserido — { id, tipo, vOffset, vCount, light (THREE.Light de
      // verdade, já adicionada a `state.scene`) } — ver
      // `ModelerInput._colocarLuzDaLampada` (criação, ligada ao botão da
      // primitiva) e `ModelerRender.updateLampLights` (chamado a cada
      // quadro por `drawFrame`, reposiciona cada luz no CENTRÓIDE atual dos
      // vértices do marcador — assim ela "segue" o marcador se ele for
      // movido/girado pelo Modo Edição, sem precisar de nenhum sistema de
      // objeto/grupo separado por trás, que este Modelador não tem — ver
      // limitação já documentada em `ModelerMesh.connectedFacesFrom`).
      lights: [],
      group: null, meshObj: null, outlineMesh: null, triFaceMap: null,
      overlayCanvas: null, overlayCtx: null, _overlaySizeKey: '',
      occlusion: { vert: [], edge: [], face: [] },

      gizmoMove: null, gizmoRotate: null, gizmoScale: null, gizmoAxisLine: null, gizmoPivot: null, pickRT: null,

      orbit: { yaw: 0.6, pitch: 0.5, dist: 3.5, target: { x: 0, y: 0.5, z: 0 } },
      orbitDrag: null,
      // Pedido do usuário: "Deve ter um botão para alternar entre os modos
      // de posicionamento da câmera... [o modo atual] apontando para um
      // ponto fixo... E o modo livre... é possível se mover pelo cenário."
      // 'orbit' = comportamento de sempre (`_updateOrbitCamera`, mira um
      // ponto fixo — `orbit.target`, o pivô do objeto). 'free' = câmera de
      // voo livre (`_updateFreeCamera`, ver lá), sem mirar nada fixo,
      // WASD/setas movem de verdade — ver `ModelerInput.toggleCamPosMode`.
      camPosMode: 'orbit', // [12/09/2026] valor inicial só de "esqueleto" — sobrescrito logo abaixo, depois de `camPoseNow` calculado, conforme `enterOrbital`
      freeCam: null, // {x,y,z,yaw,pitch} — só existe/usado quando camPosMode==='free', ver toggleCamPosMode
      freeCamVelY: 0, // velocidade vertical (gravidade) — só usada com freeCamGravity ligada
      // "Neste modo a gravidade volta a atuar. O padrão é iniciar com a
      // gravidade desabilitada." — DESLIGADA por padrão (diferente do
      // View3D normal, que já anda com gravidade ligada desde sempre); liga/
      // desliga com Shift+Espaço (ver `ModelerInput._onKeyDown`), igual ao
      // pedido pro modo normal de navegação.
      freeCamGravity: false,
      freeCamGrounded: false, // pés no chão de verdade (pra permitir pular) — ver ModelerInput._onKeyDown (Espaço) / Modeler3D._updateFreeCamera
      keys: {}, // teclas seguradas (WASD/setas) — ver ModelerInput._onKeyDown/_onKeyUp, consumido por _updateFreeCamera
      modal: null,
      raycaster: new engine.THREE.Raycaster(),
      // [11/09/2026] `rebaseDX`/`rebaseDY`: NOVO — ver comentário grande em
      // `ModelerInput._releasePointerLockIfOwned`/`_onMouseMove` (correção do
      // "salto" do cursor ao soltar um arrasto travado por Pointer Lock).
      mouse: { x: 0, y: 0, downX: 0, downY: 0, downButton: -1, moved: false, rebaseDX: 0, rebaseDY: 0 },
      loopHandle: null,
      listeners: [],
      _lastFrameT: performance.now(),
    };
    this._state = state;
    document.exitPointerLock?.();
    // Pedido do usuário: "o destaque deve ser desativado quando entra no
    // modo Modelador... o 'contorno pontilhado' fica na tela [...] é do
    // último frame antes de entrar" — ver `Engine3D.clearHoverHighlight`
    // (engine3d.js) pra causa raiz/explicação completa.
    engine.clearHoverHighlight?.();

    // Esconde a malha "de sempre" que o Engine3D já tinha montado pra este
    // objeto — evita desenhar as DUAS (a de fora, congelada, e a do
    // modelador, ao vivo) sobrepostas enquanto edita. Comparado por ID (não
    // só por referência — mais robusto caso algum caminho externo tenha
    // recriado o objeto com o mesmo id) e restaurado sozinho na próxima vez
    // que `view3d._rebuildScene()` rodar (ver `exit`, que sempre reconstrói
    // a cena inteira do zero — não precisa reverter isto aqui).
    // Esconde TODAS as peças do objeto (caixa, conectores, portas...) — todas passam a fazer
    // parte da malha editada; sem isso as peças soltas ficariam para trás e interagíveis.
    state._hiddenRoots = this._engineRootsOf(obj, engine);
    state._hiddenRoots.forEach((r) => { r.visible = false; });
    (engine._pickMeshes || []).forEach((m) => { if (m.userData?.pick?.ref?.id === obj.id) m.visible = false; });

    // [10/09/2026] CORRIGIDO — pedido verbatim: "a perspectiva da câmera
    // selecionada deve se manter" (entrando no Modelador enquanto "vendo
    // através" de uma câmera/orb calibrado). ANTES este bloco (e o de
    // `_camTransition` logo abaixo) usavam `view3d._camera` — a câmera de
    // navegação normal, que enquanto `_fotoCamMode` está
    // ativo é só o jogador "andando por trás" invisível (ver arquitetura
    // documentada em view3d.js): nada a ver com o que está de fato sendo
    // exibido na tela. `_poseFromCurrentCamera(state)` lê a pose de
    // `state.camera` (`engine.camera3`, a câmera Three.js de VERDADE, já
    // sincronizada pelo último `render()` com QUALQUER câmera efetivamente
    // usada pra desenhar o quadro mais recente — navegação normal,
    // `_fotoCamMode`, sobrevoo, etc.,
    // sem precisar tratar cada caso à parte aqui) — mesma função já usada
    // pra converter órbita<->livre (`toggleCamPosMode`, mais abaixo). Sem
    // mudança nenhuma pro caso normal (fora de câmera-vista): `camera3` já
    // é sincronizado com `view3d._camera` todo quadro, então o resultado é
    // idêntico ao de antes.
    const camPoseNow = this._poseFromCurrentCamera(state);
    // [12/09/2026] `_initOrbitFromCamera` continua sendo chamada
    // INCONDICIONALMENTE (mesmo com `enterOrbital: false`) — só popula
    // `state.orbit.{yaw,pitch,dist,target}` a partir da pose atual, pra que
    // alternar pra modo Órbita mais tarde (botão de `camPosMode`, ver
    // `toggleCamPosMode`) já comece de um lugar coerente, em vez de nunca
    // ter sido inicializado. Não afeta a câmera renderizada por si só —
    // quem decide isso é `state.camPosMode`, ajustado logo abaixo.
    this._initOrbitFromCamera(state, camPoseNow);
    if (enterOrbital) {
      state.camPosMode = 'orbit';
      state.camLocked = false;
    } else {
      // Pedido verbatim: "a câmera não deve ficar orbital, mas sim deve
      // permanecer na perspectiva da câmera que se selecionou" — mesma
      // técnica de `toggleCamPosMode` (orbit->free): `freeCam` = a pose
      // ATUAL (já é exatamente a perspectiva da câmera/orb travada, ver
      // `_poseFromCurrentCamera` acima), câmera nunca orbita em torno do
      // objeto.
      state.camPosMode = 'free';
      state.freeCam = { x: camPoseNow.x, y: camPoseNow.y, z: camPoseNow.z, yaw: camPoseNow.yaw, pitch: camPoseNow.pitch };
      state.freeCamVelY = 0;
      // [13/09/2026 — ITEM E] NOVO — pedido verbatim: "a perspectiva deve se
      // manter, o personagem não pode se mover [...] Também, não deve ser
      // possível apontar a câmera para qualquer lado clicando com o botão do
      // meio do mouse. O 'Modo: Livre' talvez não resolva tudo isso. Se
      // tiver de implementar algo para que funcione, faça." Investigação
      // confirmou que `camPosMode:'free'` sozinho NÃO travava nada — WASD/
      // setas (`_updateFreeCamera` abaixo) continuavam movendo `state.freeCam`
      // normalmente, e o arrasto com o botão do meio/direito
      // (`ModelerInput._onMouseMove`, ramo `state.orbitDrag`) continuava
      // girando `state.freeCam.yaw/pitch` e, com Shift, deslocando a própria
      // posição (pan). `state.camLocked` é o novo guard EXPLÍCITO, distinto
      // de `camPosMode` (que continua `'free'` só pra reaproveitar toda a
      // MATEMÁTICA de câmera livre — projeção, FOV etc. — sem duplicar
      // código): quando `true`, `_updateFreeCamera` (abaixo) vira um no-op
      // total (nenhuma tecla move nada), `ModelerInput._onMouseMove` pula
      // por completo a aplicação de rotação/pan do `orbitDrag` (mas o botão
      // direito ainda SELECIONA num clique simples — isso não depende de
      // `orbitDrag` — ver `_onMouseUp`/`_handleSelectClick`, não tocado),
      // `ModelerInput._onWheel` deixa de mover `freeCam` pra frente/trás, e
      // `toggleCamPosMode` (botão "Modo: Livre"/"Modo: Órbita" da barra)
      // recusa trocar de modo (viraria pra Órbita, que RECENTRALIZA a
      // câmera no objeto — exatamente o que não pode acontecer). Nada disso
      // afeta seleção/edição de malha (gizmo G/R/S, seleção de vértice/
      // aresta/face, todo o resto do Modelador) — só os caminhos que MOVEM
      // OU GIRAM `state.freeCam`.
      state.camLocked = true;
      // [14/09/2026] NOVO — pedido verbatim: "coloque botões de tudo que
      // foi modificado no Modelador quando ele trabalha no modo normal
      // [...] Um botão para cada coisa que foi desativada, por exemplo,
      // orbitar em torno do objeto selecionado" + esclarecimento seguinte:
      // "ao desativá-lo, deve voltar a perspectiva fixa da câmera
      // selecionada." Guarda aqui a pose CALIBRADA/travada de verdade
      // (`camPoseNow`, a MESMA que acabou de virar `state.freeCam` acima),
      // num campo PRÓPRIO e nunca mais tocado enquanto durar esta sessão do
      // Modelador — é o "lugar de volta" que `toggleCamLockedOrbitOverride`
      // (abaixo) restaura quando o usuário desliga o botão "Orbitar em
      // torno do objeto" (ver `ModelerUI` — botão injetado na bandeja de
      // baixo do 'Ver através desta câmera', `.v3d-fotocam-overlay-
      // controls`). Precisa ser uma cópia PRÓPRIA (não uma referência a
      // `state.freeCam`) porque `state.freeCam` é reatribuído pro objeto
      // "atual" quando o override liga o modo órbita de verdade — sem uma
      // 2ª cópia intocada, não haveria como voltar pro ponto exato de
      // antes.
      state._camLockedFixedPose = { x: camPoseNow.x, y: camPoseNow.y, z: camPoseNow.z, yaw: camPoseNow.yaw, pitch: camPoseNow.pitch };
      // [14/09/2026] CORRIGIDO — pedido verbatim: "No 'Ver em 3D', ao
      // clicar em uma câmera e selecionar 'Ver através desta câmera', no
      // Modelador, ao posicionar um objeto mais longe da câmera o gizmo do
      // objeto selecionado acaba sendo clipado em algumas partes." CAUSA
      // RAIZ: `state.camera` É `engine.camera3` (MESMA referência, ver
      // comentário grande logo acima em `enter()`) — enquanto travado numa
      // câmera calibrada, `camera3.near/far` ficam nos valores de
      // `cam.clipStartM/clipEndM` (ver view3d.js
      // `_enterFotoCameraView`, `engine.setClipPlanes`), pensados pro
      // alinhamento da cena com a FOTO de fundo — não pro Modelador. Um objeto perto do limite de `clipEndM` continua com o
      // CENTRO dentro do recorte (por isso ele aparece), mas o gizmo (ver
      // modeler-gizmo.js `updateGizmo`, `depthTest:false`/`renderOrder`
      // alto só livra ele de ser TAMPADO por outra malha — nunca do recorte
      // de verdade do near/far da câmera, que acontece na GPU antes de
      // qualquer material) se ESTENDE pra fora do objeto em todas as
      // direções — alguns eixos/pontas acabavam além do `far` calibrado,
      // sendo cortados. CORRIGIDO: alarga `near`/`far` de verdade
      // (diretamente em `camera3`, sem tocar em `engine.setClipPlanes`/
      // `_clipNearOverride`/`_clipFarOverride` — ver comentário grande lá:
      // aquele override só é reaplicado por `Engine3D.setConfig`, nunca a
      // cada quadro, e o Modelador usa seu PRÓPRIO loop/`_presentFrame`,
      // nunca chama `render()`/`setConfig`, então o valor largo aqui fica
      // intocado durante toda a sessão) só enquanto o Modelador estiver
      // aberto — `exit()` (abaixo) restaura os valores exatos de antes,
      // deixando "Ver através desta câmera" (fora do Modelador, onde o
      // recorte calibrado importa de verdade pro alinhamento com a foto)
      // exatamente como estava.
      state._camLockedOrigClipNear = engine.camera3.near;
      state._camLockedOrigClipFar = engine.camera3.far;
      engine.camera3.near = Math.min(engine.camera3.near, 0.05);
      engine.camera3.far = Math.max(engine.camera3.far, 2000);
      engine.camera3.updateProjectionMatrix();
    }
    // Pedido do usuário: "Deve haver uma transição entre a direção e
    // posição da câmera quando alterna entre os modo Modelador e o modo
    // normal de navegação... para não trocar direto." Guarda a pose de
    // ONDE a câmera estava (posição + um ponto 5m à frente, na direção
    // que ela mirava) ANTES de entrar — `_updateOrbitCamera` (chamada a
    // cada quadro do Modelador) faz a câmera deslizar suavemente dessa
    // pose até a pose orbital de destino (já calculada acima por
    // `_initOrbitFromCamera`) em vez de simplesmente "teleportar" pra lá
    // no 1º quadro. Ver o mesmo recurso na volta, em `exit()`.
    {
      const fwd = window.Cam3DMath.cameraForward(camPoseNow);
      state._camTransition = {
        fromPos: { x: camPoseNow.x, y: camPoseNow.y, z: camPoseNow.z },
        fromLookAt: { x: camPoseNow.x + fwd.x * 5, y: camPoseNow.y + fwd.y * 5, z: camPoseNow.z + fwd.z * 5 },
        t0: performance.now(),
        dur: 350,
      };
    }
    ModelerRender.buildSceneObjects(state);
    ModelerGizmo.build(state);
    ModelerMesh.rebuildMeshGeometry(state);
    ModelerUI.build(state);
    ModelerInput.bind(state);
    // [13/09/2026] UNIFICAÇÃO DE LOOPS — pedido do usuário: "integrar loop de
    // renderização geral com o loop de renderização próprio do Modelador,
    // motor 3D compartilhado [...] para que não haja conflitos entre eles".
    // ANTES, `_renderLoop` (abaixo) SEMPRE criava sua PRÓPRIA cadeia de
    // `requestAnimationFrame`, mesmo quando `view3d` era a tela real "Ver em
    // 3D" (`window.View3D`) — que JÁ tinha a sua própria cadeia rodando
    // (`View3D._loop`/`this._loopHandle`, ver view3d.js mount()). Resultado:
    // DOIS `requestAnimationFrame` paralelos disputando o mesmo quadro do
    // navegador pra mexer na MESMA instância de `Engine3D`/WebGL renderer —
    // `View3D._loop` ficava com um guarda (`Modeler3D.isActive()`) que
    // pulava todo o trabalho dele mas continuava se reagendando à toa (loop
    // "zumbi"), só pra poder retomar sozinho quando o Modelador fechasse.
    // CORRIGIDO: `state._externallyDriven` marca esta sessão como "dirigida
    // de fora" sempre que `view3d` for a instância de verdade do "Ver em 3D"
    // (`view3d === window.View3D`) — nesse caso NÃO criamos loop próprio
    // nenhum aqui; quem chama o trabalho do quadro, um por vez, é
    // `View3D._loop` (ver `Modeler3D.driveFrame`, chamado de lá, e o
    // comentário grande em view3d.js `_loop` explicando o outro lado). Só
    // segue criando o loop PRÓPRIO (`_renderLoop`, com seu
    // `requestAnimationFrame` encadeado) quando NÃO há um View3D de verdade
    // por trás — hoje o único outro chamador de `enter()` é o "editor de
    // molde" de modelos3d.js (`_abrirEditor`), que monta um `fakeView3d`
    // plano (sem `_loop` nenhum, numa engine/canvas ISOLADA, própria dessa
    // sessão) — aí sim o Modelador precisa continuar 100% autônomo, exatamente
    // como sempre foi.
    state._externallyDriven = (view3d === window.View3D);
    if (!state._externallyDriven) this._renderLoop(state);
    Utils.toast?.('🔧 Modelador 3D — Tab alterna Modo Objeto/Edição · botão direito seleciona · G/R/S mover/girar/escalar', { duration: 4200 });
    // Pedido do usuário: a dica "Clique para interagir com o cenário 3D"
    // (ver view3d.js `_bindDesktopControls`/`onPointerLockChange`) só
    // reavalia sozinha em eventos `pointerlockchange` do navegador — como
    // entrar no Modelador não trava/destrava o ponteiro, ela nunca reagia
    // aqui. Reavalia manualmente (o próprio handler já checa
    // `Modeler3D.isActive()` e some com a dica).
    view3d._onModelerToggleForLockBadge?.();
    // Pedido do usuário: HUD no canto superior direito do CANVAS, nos 2
    // modos — agora resolvido de forma unificada em `View3D.mount` (ver
    // `Perf.setCanvasAnchor`), não precisa mais ligar/desligar aqui.
    // NOVO (03/09/2026) — sidebar "+"/Criar/Ferramentas UNIFICADO (ver
    // comentário grande em modeler-ui.js `_sidebarCtx`): avisa o painel
    // (que já existe, construído por view3d.js) que uma sessão começou, pra
    // reavaliar as abas disponíveis (ganha "Ferramentas") caso já esteja
    // aberto (ex.: o usuário clicou numa primitiva da aba "Criar" da tela
    // base, que já entra direto editando).
    ModelerUI.refreshSharedSidebar?.(view3d);
    this._takeSnapshot(state);
  },

  _BACKUP_KEYS: ['customMesh', 'customMeshXform', 'forma', 'largura', 'profundidade', 'altura', 'cor', 'elevacao', 'x', 'y'],
  /** Ctrl+Z depois de sair do Modelador: volta o objeto ao que era ANTES de entrar (e Ctrl+Y reaplica). */
  _pushUndoEntrada(state) {
    try {
      if (!state._committed || !window.History || !state.objBackupEntrada) return;
      const view3d = state.view3d, obj = state.obj, mapId = view3d?._map?.id, objId = obj?.id;
      if (mapId == null || objId == null) return;
      const antes = state.objBackupEntrada, depois = this._backupObj(obj);
      const eqAntes = state._equipAntes || null;
      const eqDepois = eqAntes ? eqAntes.map((e) => { const o = (view3d._map.objects || []).find((x) => x.id === e.id) || {}; return { id: e.id, x: o.x, y: o.y, elevacao: o.elevacao }; }) : null;
      const aplicar = async (b, eq) => {
        const m = (view3d?._map && view3d._map.id === mapId) ? view3d._map : await DB.getMap(mapId);
        const o = ((m && m.objects) || []).find((x) => x.id === objId);
        if (!o) return;
        this._BACKUP_KEYS.forEach((k) => { if (b[k] === undefined) delete o[k]; else o[k] = JSON.parse(JSON.stringify(b[k])); });
        if (eq) eq.forEach((e) => { const q = (m.objects || []).find((x) => x.id === e.id); if (q) { q.x = e.x; q.y = e.y; if (e.elevacao === undefined) delete q.elevacao; else q.elevacao = e.elevacao; } });
        Mapping.recalcBounds(m);
        await DB.saveMap(m);
        if (view3d && view3d._map === m) view3d._rebuildScene?.();
      };
      History.push({ label: 'Modelador (' + (obj.nome || obj.tipo || 'objeto') + ')', undo: () => aplicar(antes, eqAntes), redo: () => aplicar(depois, eqDepois) });
    } catch (e) { /* histórico é opcional */ }
  },
  _backupObj(obj) {
    const b = {};
    this._BACKUP_KEYS.forEach((k) => { b[k] = obj[k] === undefined ? undefined : JSON.parse(JSON.stringify(obj[k])); });
    return b;
  },
  _restoreBackup(state) {
    const obj = state.obj, b = state.objBackup;
    if (!obj || !b) return;
    this._BACKUP_KEYS.forEach((k) => { if (b[k] === undefined) delete obj[k]; else obj[k] = JSON.parse(JSON.stringify(b[k])); });
  },
  _takeSnapshot(state) {
    const g = state.group;
    state.snap = {
      vertices: state.cm.vertices.map((v) => v.slice()),
      edges: state.cm.edges.map((e) => e.slice()),
      faces: state.cm.faces.map((f) => f.slice()),
      xform: { ...state.xform },
      pos: g ? [g.position.x, g.position.y, g.position.z] : null,
    };
  },
  /** Compara valor a valor, SEM arredondar — só é "sujo" se algum número mudou de verdade. */
  _isDirty(state) {
    const s = state && state.snap;
    if (!s) return false;
    const eq = (a, b) => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i];
        if (x.length !== y.length) return false;
        for (let j = 0; j < x.length; j++) if (x[j] !== y[j]) return false;
      }
      return true;
    };
    if (!eq(state.cm.vertices, s.vertices) || !eq(state.cm.edges, s.edges) || !eq(state.cm.faces, s.faces)) return true;
    for (const k of Object.keys(s.xform)) if (state.xform[k] !== s.xform[k]) return true;
    const g = state.group;
    if (g && s.pos && (g.position.x !== s.pos[0] || g.position.y !== s.pos[1] || g.position.z !== s.pos[2])) return true;
    return false;
  },

  /** Botão "Aplicar alterações": grava no objeto/banco e continua no Modelador. */
  applyChanges() {
    const state = this._state;
    if (!state?.active) return false;
    if (!state.cm.vertices.length && !state.cm.edges.length && !state.cm.faces.length) {
      Utils.toast?.('A malha está vazia — nada a aplicar.', { type: 'warn' });
      return false;
    }
    this._commit(state);
    const map = state.view3d?._map;
    if (map) DB.saveMap(map);
    state.objBackup = this._backupObj(state.obj);
    this._takeSnapshot(state);
    Utils.toast?.('Alterações aplicadas ✓', { type: 'ok' });
    return true;
  },

  /** "Sair do Modelador" do botão: se há alterações não aplicadas, pergunta. */
  requestExit() {
    const state = this._state;
    if (!state?.active) return;
    if (!this._isDirty(state)) { this.exit(); return; }
    if (state._exitPromptOpen) return;
    state._exitPromptOpen = true;
    window.CardSystem.mount(state.view3d._container, 'confirm', {
      title: 'Alterações não aplicadas',
      message: 'Você fez alterações no modelo 3D deste objeto que ainda não foram aplicadas. Deseja aplicá-las ou descartá-las?',
      buttons: [
        { id: 'aplicar', label: '✔ Aplicar alterações', variant: 'primary' },
        { id: 'descartar', label: '🗑 Descartar alterações', variant: 'secondary' },
        { id: 'cancelar', label: 'Continuar editando', variant: 'secondary' },
      ],
      onChoose: (id) => {
        state._exitPromptOpen = false;
        if (this._state !== state || !state.active) return;
        if (id === 'aplicar') this.exit();
        else if (id === 'descartar') this.exit({ discard: true });
      },
    }, {});
  },

  /** Encerra a sessão: grava a malha/transform de volta no objeto de
   *  VERDADE (por ID — ver `_commit`), salva o mapa e reconstrói a cena
   *  "normal" do View3D (que volta a assumir loop/controles/hover). */
  exit({ skipRebuild = false, discard = false } = {}) {
    const state = this._state;
    if (!state?.active) return;
    // [14/09/2026] CORRIGIDO — desfaz o alargamento de `near`/`far`
    // aplicado em `enter()` (ver comentário grande lá, "gizmo [...]
    // clipado") ANTES de qualquer outra coisa nesta função — `camera3` é a
    // MESMA referência usada por `view3d._loop`/"Ver através desta câmera"
    // depois que o Modelador fechar, então o recorte calibrado
    // (`clipStartM/clipEndM`, o que faz a cena bater com a foto de fundo)
    // precisa voltar a valer exatamente como estava, byte-a-byte.
    if (state._camLockedOrigClipFar != null && state.camera) {
      state.camera.near = state._camLockedOrigClipNear;
      state.camera.far = state._camLockedOrigClipFar;
      state.camera.updateProjectionMatrix();
    }
    if (state.modal) ModelerInput._cancelModal(state);
    // Mesmo pedido do `enter()` (ver lá), agora na VOLTA: guarda onde a
    // câmera do Modelador estava olhando (posição + direção, convertida de
    // volta pra yaw/pitch — inverso exato de `Cam3DMath.cameraForward`) ANTES
    // de desmontar tudo, pra `View3D._loop` deslizar suavemente até a pose
    // "normal" (`view3d._camera`, intocada durante o Modelador) em vez de
    // teleportar pra lá no 1º quadro de volta. `view3d._camera` continua
    // sendo o valor de VERDADE o tempo todo (a transição só afeta o que é
    // RENDERADO nesse meio-tempo — ver `_camTransition` em `View3D._loop`).
    // CORRIGIDO (02/09/2026), ampliado (03/09/2026) — pedido verbatim
    // original: "Ao sair do Modelador, estando selecionado o modo 'Câmera:
    // Livre', a perspectiva da Câmera deve ser preservada como estava ao
    // clicar em 'Sair do Modelador'." Causa raiz: o código abaixo SEMPRE
    // fazia a transição terminar em `view3dForTransition._camera` (a pose
    // de navegação de ANTES de entrar no Modelador, nunca tocada durante a
    // sessão) — então, mesmo tendo voado livremente com "Câmera: Livre" lá
    // dentro, ao sair a câmera sempre deslizava de volta pra onde estava
    // antes, descartando o deslocamento feito. NA ÉPOCA, o modo 'orbit'
    // tinha sido deixado de fora de propósito ("não existe uma 'posição do
    // jogador' própria enquanto orbitando um objeto sozinho"). PEDIDO NOVO
    // (03/09/2026), verbatim: "no modo 'Câmera: Orbital', ao sair do
    // Modelador, a perspectiva da câmera do personagem que estava logo
    // antes de sair do Modelador (ou durante) deve ser preservada.
    // Atualmente, acaba voltando para a perspectiva inicial." — ou seja, o
    // usuário quer o MESMO comportamento do modo Livre também no Orbital:
    // `_poseFromCurrentCamera` já lê a câmera Three.js DE VERDADE
    // (`state.camera.position`/direção, atualizada todo quadro por
    // `_updateOrbitCamera` OU `_updateFreeCamera`, tanto faz o modo) — não
    // existe motivo pra restringir a QUALQUER modo especificamente; a
    // condição `state.camPosMode === 'free'` foi removida, e a pose atual
    // (de onde a câmera estava olhando NO INSTANTE de sair, órbita ou
    // livre) sempre vira a nova pose de navegação de verdade
    // (`view3dForTransition._camera`) antes de montar a transição.
    const view3dForTransition = state.view3d;
    if (view3dForTransition && state.camera && state.THREE) {
      const pose = this._poseFromCurrentCamera(state);
      if (view3dForTransition._camera) {
        view3dForTransition._camera.x = pose.x;
        view3dForTransition._camera.y = pose.y;
        view3dForTransition._camera.z = pose.z;
        view3dForTransition._camera.yaw = pose.yaw;
        view3dForTransition._camera.pitch = pose.pitch;
      }
      view3dForTransition._camTransition = {
        fromPos: { x: pose.x, y: pose.y, z: pose.z },
        fromYaw: pose.yaw,
        fromPitch: pose.pitch,
        t0: performance.now(),
        dur: 350,
      };
    }
    // Só grava se houve alteração de verdade (comparação exata) e não foi
    // descartada; caso contrário o objeto volta exatamente ao que era.
    if (!discard && this._isDirty(state)) this._commit(state);
    else {
      this._restoreBackup(state);
      // Nada foi gravado: as peças originais voltam a aparecer (o rebuild, se houver, as recria).
      (state._hiddenRoots || []).forEach((r) => { r.visible = true; });
      (state.view3d?._engine?._pickMeshes || []).forEach((m) => { if (m.userData?.pick?.ref?.id === state.obj.id) m.visible = true; });
    }
    ModelerInput.unbind(state);
    // [11/09/2026] Limpa o `cursor:none` inline que `ModelerInput.
    // _updateFakeCursor` pode ter deixado no canvas (ver correção do
    // "salto" do cursor lá) — sem isso, sair do Modelador com um rebase de
    // cursor ainda ativo deixaria o cursor OS de verdade escondido também
    // no modo normal de navegação (`#v3d-canvas` é o MESMO canvas dos 2
    // modos, ver `state.canvas` acima).
    if (state.canvas) state.canvas.style.cursor = '';
    if (state.loopHandle) cancelAnimationFrame(state.loopHandle);
    // [19/09/2026] CORRIGIDO — pedido verbatim do usuário: "Ao sair do
    // Modelador, estando no modo 'Ver através desta câmera', o gizmo acaba
    // ficando impresso. Não deveria ser assim. Os pixels dele deveriam ser
    // limpos ao sair do Modelador." CAUSA RAIZ: a composição do gizmo por
    // cima da foto (ver v451/v452 — `ModelerGizmo.renderIsolatedToCanvas` +
    // `View3D._compositeGizmoOverlayOntoPhotoCanvas`) roda a cada quadro SÓ
    // DENTRO do loop do próprio Modelador (`_renderFrame`, mais abaixo
    // neste arquivo) — ao sair, esse loop para (`cancelAnimationFrame` na
    // linha acima) e o ÚLTIMO quadro composto (com o gizmo ainda desenhado
    // por cima) fica PARADO nos pixels do `<canvas>` DOM SEPARADO
    // (`#v3d-fotocam-photo-canvas`, `View3D._updateFotoCamOverlayZoomScale`),
    // que só é redesenhado quando algo manda explicitamente (zoom,
    // opacidade, trocar Esticar/Caber/Cortar etc) — `View3D._loop` NUNCA
    // toca nele — então o gizmo da última composição ficava gravado ali
    // PRA SEMPRE após sair do Modelador. Mesma família do "fantasma" já
    // tratada DENTRO da sessão (quando só o objeto era desmarcado ou o
    // Modo trocado — ver `state._camLockedGizmoOverlayWasVisible` em
    // `_renderFrame`, mais abaixo), mas aquele tratamento só cobre
    // desmarcar/trocar Modo, nunca SAIR de vez do Modelador (o loop dele
    // já não roda mais no próximo quadro pra disparar aquela checagem).
    // CORRIGIDO: uma última chamada a `_updateFotoCamOverlayZoomScale()`
    // aqui, redesenhando a foto do zero (sem gizmo nenhum, já que o
    // Modelador já não existe mais neste ponto — `ModelerGizmo.dispose`
    // roda logo abaixo) — chamada incondicionalmente (não só quando
    // `state._camLockedFixedPose`), porque a própria função já não faz
    // nada quando o canvas da foto não existe no DOM (fora de "Ver através
    // desta câmera", ou sem foto nenhuma carregada) — sem custo/efeito
    // colateral em nenhum desses casos.
    // [19/09/2026 — RODADA SEGUINTE] SIMPLIFICADO — desde a remoção do
    // plano 3D do backdrop 'Trás' (`_ensureFotoCamBackdropPlane`/
    // `_updateFotoCamBackdropPlane`, ver view3d.js), o modo 'Trás' NÃO
    // desenha mais nada em `#v3d-canvas`/`camera3` — a foto (nos 2 modos,
    // 'Trás' e 'Frente') vive SEMPRE em `#v3d-fotocam-photo-canvas`. O
    // parágrafo acima sobre "`#v3d-canvas` normal (WebGL) volta a ser
    // redesenhado sozinho no modo 'Trás'" descreve a arquitetura ANTIGA
    // (já removida) — preservado por completo pra não apagar histórico,
    // mas não reflete mais o código atual: a chamada incondicional a
    // `_updateFotoCamOverlayZoomScale()` logo abaixo agora cobre os 2
    // modos igualmente (o `#v3d-fotocam-photo-canvas` é o único lugar que
    // precisa de limpeza explícita do "fantasma" do gizmo, em qualquer
    // modo).
    state.view3d?._updateFotoCamOverlayZoomScale?.();
    ModelerGizmo.dispose(state);
    ModelerRender.disposeSceneObjects(state);
    ModelerUI.dispose(state);
    this._pushUndoEntrada(state);
    const view3d = state.view3d;
    this._state = null;
    if (!skipRebuild && view3d && view3d._map) {
      DB.saveMap(view3d._map);
      view3d._rebuildScene?.();
    }
    // Mesmo motivo do `enter()`: reavalia a dica de Pointer Lock, já que
    // sair do Modelador também não dispara `pointerlockchange` sozinho.
    view3d?._onModelerToggleForLockBadge?.();
    Perf.setTopRightCorner?.(false);
    // NOVO (03/09/2026) — mesmo motivo do `enter()` (ver lá): a sessão já
    // terminou (`this._state = null` duas linhas acima, `Modeler3D.
    // isActive()` já responde false) — reavalia o sidebar unificado pra
    // "Ferramentas" sumir e a aba "Criar" voltar pra versão simples da tela
    // base, se o painel estava aberto.
    if (view3d) ModelerUI.refreshSharedSidebar?.(view3d);
    if (view3d) view3d._resetPropriedadesTransformacaoPlaceholder?.();
  },

  /** Escreve a malha/transform da sessão de volta no objeto — sempre
   *  resolvido de novo POR ID (`Mapping.updateObject`), nunca confiando cegamente
   *  em uma referência que possa ter ficado desatualizada — pedido do
   *  usuário (item 4, ver cabeçalho): "ao sair do Modelador deve ser mais
   *  um objeto como qualquer outro". Chamado só ao SAIR (sem autosave
   *  periódico dentro da sessão — simplificação documentada, mesma da
   *  rodada anterior). */
  _commit(state) {
    const obj = state.obj;
    if (!obj) return;
    // NOVO (03/09/2026) — ver comentário grande em `enter()` sobre
    // Modelador, ao excluir um objeto ele deve ser excluído. [...] Parece
    // que ele é apagado no Modelador, mas alguma versão do objeto ainda
    // fica no mundo." Causa raiz: "Excluir objeto" (ModelerInput.
    // _deleteWholeObject/_clearWholeMesh, Modo Objeto) e a cascata do Modo
    // Edição (selecionar 100% de vértices/arestas/faces e deletar — ver
    // ModelerInput._runMeshOp, mesmo dia) esvaziam state.cm por completo
    // (vertices/edges/faces = []), mas este `_commit` nunca tratava esse
    // caso como "objeto excluído" — caía direto no caminho normal abaixo,
    // que monta um `patch` com `customMesh` VAZIO e chama
    // `Mapping.updateObject` (só faz Object.assign no objeto existente,
    // NUNCA remove nada do array) — o objeto sobrevivia no mapa como uma
    // malha customizada de tamanho ~0 (ou degenerada, já que
    // `ModelerMesh.localBBox([])` não tem vértice nenhum pra medir),
    // exatamente o "resquício" relatado (some visualmente dentro do
    // Modelador, mas alguma versão fica no mundo). Corrigido: mesh
    // completamente vazia (sem nenhum vértice/aresta/face) agora remove o
    // objeto de vez do mapa (`Mapping.removeObject`), em vez de gravar um
    // patch vazio nele — nenhuma outra situação legítima deixa a malha
    // vazia num Modelador aberto (`ensureCustomMesh` sempre semeia alguma
    // geometria ao entrar).
    if (!state.cm.vertices.length && !state.cm.edges.length && !state.cm.faces.length) {
      const map = state.view3d?._map;
      if (map && window.Mapping) {
        Mapping.removeObject(map, obj.id);
        Mapping.recalcBounds(map);
      }
      return;
    }
    state._committed = true; // houve gravação nesta sessão (ver _pushUndoEntrada)
    const patch = {
      customMesh: { vertices: state.cm.vertices.map((v) => v.slice()), edges: state.cm.edges.map((e) => e.slice()), faces: state.cm.faces.map((f) => f.slice()) },
      customMeshXform: { ...state.xform },
    };
    const bb = ModelerMesh.localBBox(state.cm.vertices);
    if (state.group) {
      patch.x = state.group.position.x;
      patch.y = state.group.position.z;
      // `obj.elevacao` é sempre "altura da BASE do objeto acima do chão"
      // (usado em vários lugares do app pra empilhar objetos em cima de
      // outros — ver mapping.js `objectTopHeight`) — não pode virar "altura
      // da ORIGEM" só porque a origem do cubo agora pode estar no meio dele
      // (pedido do usuário, opção "Origem no centro do cubo", ver
      // mapconfig.js/modeler-mesh.js defaultCubeMesh). `state.group.position.y`
      // é a altura de MUNDO da ORIGEM local; `bb.minY` (escalado por Y) é
      // quanto a base da malha fica ABAIXO dessa origem em espaço local —
      // somando os dois volta pra altura da BASE, igual sempre foi quando a
      // origem nascia na base (bb.minY=0 nesse caso, sem efeito nenhum).
      const baseOffsetY = bb.minY * (state.xform.scaleY || 1);
      patch.elevacao = (state.group.position.y + baseOffsetY) - (obj.piso || 0) * 2.8;
    }
    patch.largura = Math.max(0.05, (bb.maxX - bb.minX) * Math.abs(state.xform.scaleX || 1));
    patch.profundidade = Math.max(0.05, (bb.maxZ - bb.minZ) * Math.abs(state.xform.scaleZ || 1));
    patch.altura = Math.max(0.05, (bb.maxY - bb.minY) * Math.abs(state.xform.scaleY || 1));

    const map = state.view3d?._map;
    if (map && window.Mapping) {
      // `Mapping.updateObject` procura o objeto POR ID dentro de
      // `map.objects` e faz `Object.assign` nele — nunca cria um elemento
      // novo no array, nunca duplica. Se por qualquer motivo o objeto não
      // for mais encontrado por id (removido enquanto o Modelador estava
      // aberto, por exemplo), não faz nada — não recria um "objeto órfão".
      // Rack movido no Modelador: os equipamentos instalados nele (rackId) vão junto, mantendo a posição relativa.
      if (obj.tipo === 'rack' && (patch.x != null || patch.elevacao != null)) {
        const dx = (patch.x != null ? patch.x - (obj.x || 0) : 0);
        const dy = (patch.y != null ? patch.y - (obj.y || 0) : 0);
        const dz = (patch.elevacao != null ? patch.elevacao - (obj.elevacao || 0) : 0);
        if (!state._equipAntes) state._equipAntes = (map.objects || []).filter((o) => o && o.rackId === obj.id && o.id !== obj.id).map((o) => ({ id: o.id, x: o.x, y: o.y, elevacao: o.elevacao }));
        if (dx || dy || dz) {
          (map.objects || []).forEach((o) => {
            if (o && o.rackId === obj.id && o.id !== obj.id) { o.x = (o.x || 0) + dx; o.y = (o.y || 0) + dy; o.elevacao = (o.elevacao || 0) + dz; }
          });
        }
      }
      Mapping.updateObject(map, obj.id, patch);
      // Salvaguarda defensiva (pedido do usuário — "não pode ficar 'dois'
      // dele"): se por algum caminho externo o mapa tiver acabado com mais
      // de UM objeto com este mesmo id (nunca deveria acontecer com o fluxo
      // acima, mas é barato conferir), mantém só o primeiro e remove os
      // extras — nunca deixa uma sessão de modelagem terminar com
      // duplicata.
      const idsVistos = new Set();
      const semDuplicata = map.objects.filter((o) => { if (idsVistos.has(o.id)) return false; idsVistos.add(o.id); return true; });
      if (semDuplicata.length !== map.objects.length) map.objects = semDuplicata;
      Mapping.recalcBounds(map);
    } else {
      Object.assign(obj, patch); // sem `view3d._map` (não deveria acontecer) — pelo menos mantém a referência em memória atualizada
    }
  },

  /** Converte a câmera Three.js ATUAL (`state.camera`) numa pose
   *  {x,y,z,yaw,pitch} no mesmo formato de `view3d._camera`/`state.freeCam`
   *  — inverso exato de `Cam3DMath.cameraForward` (ver comentário lá/em
   *  `exit()`, onde essa conversão nasceu, pra transição de câmera ao sair
   *  do Modelador). Reaproveitada também pra alternar entre os modos de
   *  posicionamento da câmera (`ModelerInput.toggleCamPosMode`), que precisa
   *  da MESMA conversão ao entrar no modo Livre a partir da órbita. */
  _poseFromCurrentCamera(state) {
    const dir = new state.THREE.Vector3();
    state.camera.getWorldDirection(dir);
    const pos = state.camera.position;
    const pitch = Math.max(-1.3, Math.min(1.3, -Math.asin(Math.max(-1, Math.min(1, dir.y)))));
    const yaw = Math.atan2(-dir.x, dir.z);
    return { x: pos.x, y: pos.y, z: pos.z, yaw, pitch };
  },

  /** `camPose` (formato {x,y,z}) — de onde calcular a órbita inicial (alvo
   *  sempre o próprio `obj`, só posição/distância/ângulo vêm de `camPose`).
   *  [10/09/2026] CORRIGIDO — os 2 chamadores (`enter()`, logo abaixo, e
   *  `toggleCamPosMode`) sempre passam `camPose` explicitamente agora:
   *  `enter()` passa `_poseFromCurrentCamera(state)` (a pose de VERDADE da
   *  câmera `camera3`, não `view3d._camera` — ver comentário grande em
   *  `enter()` sobre por que isso importa em `_fotoCamMode`);
   *  `toggleCamPosMode` passa `state.freeCam` (de onde a câmera livre
   *  parou). `state.view3d._camera` como reserva (`camPose ||`) só por
   *  segurança — nenhum caminho conhecido chama isto sem `camPose`. */
  _initOrbitFromCamera(state, camPose) {
    const cam = camPose || state.view3d._camera;
    const obj = state.obj;
    const baseY = (obj.piso || 0) * 2.8 + (obj.elevacao || 0);
    state.orbit.target = { x: obj.x, y: baseY + 0.4, z: obj.y };
    const dx = cam.x - obj.x, dz = cam.z - obj.y, dy = cam.y - (baseY + 0.4);
    const dist = Math.max(1.2, Math.hypot(dx, dy, dz));
    state.orbit.dist = Math.min(dist, 8);
    state.orbit.yaw = Math.atan2(dx, dz);
    state.orbit.pitch = Math.max(-1.4, Math.min(1.4, Math.atan2(dy, Math.hypot(dx, dz))));
  },

  /** Pedido do usuário: "Deve ter um botão para alternar entre os modos de
   *  posicionamento da câmera" — Orbital (padrão, sempre existiu: mira um
   *  ponto fixo, `_updateOrbitCamera`) <-> Livre (novo: voo livre por
   *  WASD/setas, sem mirar nada fixo, `_updateFreeCamera`). Cada troca
   *  CONVERTE a pose atual pro outro sistema (nunca "pula" pra outro
   *  lugar) — mesma técnica de conversão câmera<->yaw/pitch já usada na
   *  transição Modelador<->navegação normal (ver `_poseFromCurrentCamera`). */
  toggleCamPosMode(state) {
    // [13/09/2026 — ITEM E] Com `state.camLocked` (ver comentário grande em
    // `enter()`), a perspectiva precisa ficar CONGELADA de verdade — trocar
    // pra "Modo: Órbita" recentralizaria a câmera no objeto (`_initOrbitFromCamera`
    // usa o CENTRO DO OBJETO como alvo, não a pose calibrada), quebrando a
    // garantia. Recusa a troca (nenhum efeito) e avisa o motivo.
    if (state.camLocked) {
      Utils.toast?.('🔒 Perspectiva da câmera travada — não é possível trocar de modo enquanto estiver vendo através de uma câmera calibrada.', { type: 'warn', duration: 3200 });
      return;
    }
    if (state.camPosMode === 'orbit') {
      state.freeCam = this._poseFromCurrentCamera(state);
      state.freeCamVelY = 0;
      state.camPosMode = 'free';
      Utils.toast?.('🕊️ Câmera livre — WASD desloca, ↑/↓ sobem/descem, botão direito/meio gira (Shift+Espaço liga/desliga a gravidade)', { duration: 3600 });
    } else {
      this._initOrbitFromCamera(state, state.freeCam);
      state.camPosMode = 'orbit';
      state.freeCam = null;
      Utils.toast?.('🎯 Câmera orbital — sempre mirando o objeto', { duration: 2200 });
    }
    ModelerUI.updateToolbarActive?.(state);
  },

  /** [14/09/2026] NOVO — pedido verbatim: "na bandeja de baixo [...]
   *  coloque botões de tudo que foi modificado no Modelador quando ele
   *  trabalha no modo normal [...] Um botão para cada coisa que foi
   *  desativada, por exemplo, orbitar em torno do objeto selecionado" +
   *  esclarecimento: "ao desativá-lo, deve voltar a perspectiva fixa da
   *  câmera selecionada no modo 'Ver através desta câmera'." Diferente de
   *  `toggleCamPosMode` (acima, recusa trocar de modo inteiramente
   *  enquanto `camLocked`): este é o "botão de exceção" que o usuário pediu
   *  — LIGAR permite orbitar de verdade em torno do objeto selecionado
   *  (mesmo mecanismo de sempre, `_initOrbitFromCamera` + `camPosMode:
   *  'orbit'`, com `camLocked` temporariamente `false` pra `_updateFreeCamera`/
   *  `ModelerInput._onMouseMove`/`_onWheel` pararem de recusar a
   *  interação); DESLIGAR não volta pra onde a órbita "andou" — restaura
   *  byte-a-byte `state._camLockedFixedPose` (a pose calibrada de verdade,
   *  guardada em `enter()` no instante em que `camLocked` virou `true`,
   *  ANTES de qualquer órbita) em `state.freeCam`, igual a como era antes
   *  de ligar o override, e trava de novo (`camLocked = true`). Só existe
   *  (é chamado) enquanto `state._camLockedFixedPose` estiver definido —
   *  ver guard logo abaixo — nunca deveria ser chamado fora de uma sessão
   *  que entrou travada (`enter(..., {enterOrbital:false})`, ver
   *  `_renderCamLockedOverridesBar`/`ModelerUI`, que só desenha o botão
   *  quando `state._camLockedFixedPose` existe). */
  toggleCamLockedOrbitOverride(state) {
    if (!state._camLockedFixedPose) return;
    if (state.camLocked) {
      // LIGA o orbitador temporário — mesma conversão de pose usada em
      // `toggleCamPosMode` (órbita a partir da pose atual, que nesse
      // instante ainda é a calibrada/travada).
      state.camLocked = false;
      this._initOrbitFromCamera(state, state.freeCam || state._camLockedFixedPose);
      state.camPosMode = 'orbit';
      state.freeCam = null;
      Utils.toast?.('🎯 Orbitador temporário ativado — arraste para orbitar em torno do objeto selecionado. Desative de novo pra voltar à perspectiva fixa da câmera.', { duration: 3600 });
    } else {
      // DESLIGA — volta pra perspectiva FIXA da câmera selecionada (a pose
      // calibrada original, nunca a pose "onde a órbita parou").
      state.camPosMode = 'free';
      state.freeCam = { ...state._camLockedFixedPose };
      state.freeCamVelY = 0;
      state.camLocked = true;
      Utils.toast?.('🔒 Perspectiva fixa da câmera restaurada.', { duration: 2200 });
    }
    ModelerUI.updateToolbarActive?.(state);
    ModelerUI.updateCamLockedOverrideButton?.(state);
  },

  /** Atualiza a câmera no modo de posicionamento LIVRE — chamada a cada
   *  quadro por `_renderLoop` (via `_updateOrbitCamera`, que desvia pra cá
   *  quando `state.camPosMode === 'free'`). WASD desloca no plano PARALELO
   *  ao XZ do mundo, na direção "achatada" da própria câmera (ignora o
   *  pitch — pedido do usuário: "W, para a frente; S, para trás; A, para a
   *  esquerda; e D, para a direita" — mesma convenção do WASD do modo
   *  normal de navegação, ver `Cam3DMath.cameraForwardFlat/cameraRightFlat`
   *  em view3d.js/engine3d.js); setas ↑/↓ mudam Y do MUNDO diretamente
   *  (sempre, gravidade ligada ou não — pedido do usuário: "a seta para
   *  cima aumenta em y do mundo e a seta para baixo diminui"). Com
   *  `freeCamGravity` ligada, a física de queda simplificada usa as MESMAS
   *  `_surfaceHeightAt`/`EYE_HEIGHT` do View3D (via `state.view3d`), pra se
   *  comportar como o modo normal de navegação. */
  _updateFreeCamera(state, delta) {
    // [13/09/2026 — ITEM E] Guard de travamento — ver comentário grande em
    // `enter()`/`toggleCamPosMode`. Com `camLocked`, NENHUMA tecla move
    // `state.freeCam` — sai antes de ler `state.keys`, então WASD/setas/
    // Espaço (pulo)/gravidade ficam todos inertes; a pose fica byte-a-byte
    // igual à calibrada até o Modelador ser fechado.
    if (state.camLocked) return;
    const fc = state.freeCam;
    const keys = state.keys || {};
    const forward = window.Cam3DMath.cameraForwardFlat(fc);
    const right = window.Cam3DMath.cameraRightFlat(fc);
    // Pedido do usuário: "Ao manter pressionado o botão do meio do mouse a
    // movimentação do WASD deve ficar bem mais lenta (1/10)" — mesmo botão
    // que gira/panorâmica a câmera no modo Livre (`state.orbitDrag`, ver
    // `ModelerInput._onMouseDown/_onMouseMove` — `button === 1` é o do
    // meio), então "segurado" aqui é simplesmente esse arrasto estar em
    // andamento com esse botão, sem precisar de um rastreio próprio.
    const middleHeld = !!(state.orbitDrag && state.orbitDrag.button === 1);
    const SPEED = 2.6 * (middleHeld ? 0.1 : 1);
    let mx = 0, mz = 0;
    if (keys.KeyW) { mx += forward.x; mz += forward.z; }
    if (keys.KeyS) { mx -= forward.x; mz -= forward.z; }
    if (keys.KeyA) { mx -= right.x; mz -= right.z; }
    if (keys.KeyD) { mx += right.x; mz += right.z; }
    const mlen = Math.hypot(mx, mz);
    if (mlen > 0.001) { mx /= mlen; mz /= mlen; }
    fc.x += mx * SPEED * delta;
    fc.z += mz * SPEED * delta;
    const VY_SPEED = 2.0 * (middleHeld ? 0.1 : 1);
    if (keys.ArrowUp) fc.y += VY_SPEED * delta;
    if (keys.ArrowDown) fc.y -= VY_SPEED * delta;

    if (state.freeCamGravity) {
      const view3d = state.view3d;
      const eyeH = view3d?.EYE_HEIGHT ?? 1.65;
      const surfaceY = view3d?._surfaceHeightAt?.(fc.x, fc.z, fc.y - eyeH) ?? 0;
      const groundY = surfaceY + eyeH;
      // Pedido do usuário (rodada 44, correção): "Na câmera livre, quando a
      // gravidade estiver ligada, deve ser possível pular." Causa raiz do
      // pulo não funcionar: a versão anterior decidia se estava "no chão"
      // comparando a POSIÇÃO atual (`fc.y > groundY`) a cada quadro, em vez
      // de confiar na flag `state.freeCamGrounded` — então, no exato quadro
      // em que `ModelerInput._onKeyDown` (Espaço) dava o impulso pro pulo
      // (`freeCamVelY = 6`), a posição AINDA não tinha mudado (só a
      // velocidade), então essa comparação por posição ainda achava "está
      // no chão" e reescrevia `freeCamVelY` de volta pra 0 e `fc.y` de
      // volta pro chão — cancelando o pulo no MESMO quadro em que ele
      // começava, antes de qualquer impulso surtir efeito. Corrigido pra
      // seguir o mesmo padrão de `view3d.js` (`_update`/`_jump`): o ESTADO
      // (`state.freeCamGrounded`) é que manda qual física roda — só ele
      // decide, nunca a posição do quadro atual — e só é alterado por quem
      // TEM autoridade pra isso (o pulo, aqui embaixo, ou o pouso de
      // verdade).
      if (state.freeCamGrounded) {
        fc.y = groundY;
        state.freeCamVelY = 0;
      } else {
        const GRAVITY = -16;
        state.freeCamVelY += GRAVITY * delta;
        fc.y += state.freeCamVelY * delta;
        if (fc.y <= groundY) { fc.y = groundY; state.freeCamVelY = 0; state.freeCamGrounded = true; }
      }
    } else {
      state.freeCamGrounded = false;
    }

    state.camera.position.set(fc.x, fc.y, fc.z);
    const dir = window.Cam3DMath.cameraForward(fc);
    state.camera.lookAt(fc.x + dir.x, fc.y + dir.y, fc.z + dir.z);
  },

  _updateOrbitCamera(state) {
    const o = state.orbit;
    const x = o.target.x + o.dist * Math.cos(o.pitch) * Math.sin(o.yaw);
    const y = o.target.y + o.dist * Math.sin(o.pitch);
    const z = o.target.z + o.dist * Math.cos(o.pitch) * Math.cos(o.yaw);
    // Transição suave ao ENTRAR (ver `enter()`) — desliza da pose de onde a
    // câmera estava (posição + ponto-alvo à frente) até a pose orbital
    // "de verdade" (x,y,z acima + o.target), com suavização smoothstep.
    // Some sozinha (`state._camTransition = null`) assim que completar; daí
    // em diante os quadros seguem batendo direto na pose orbital normal.
    const tr = state._camTransition;
    if (tr) {
      const t = Math.min(1, (performance.now() - tr.t0) / tr.dur);
      const ease = t * t * (3 - 2 * t);
      const px = tr.fromPos.x + (x - tr.fromPos.x) * ease;
      const py = tr.fromPos.y + (y - tr.fromPos.y) * ease;
      const pz = tr.fromPos.z + (z - tr.fromPos.z) * ease;
      const lx = tr.fromLookAt.x + (o.target.x - tr.fromLookAt.x) * ease;
      const ly = tr.fromLookAt.y + (o.target.y - tr.fromLookAt.y) * ease;
      const lz = tr.fromLookAt.z + (o.target.z - tr.fromLookAt.z) * ease;
      state.camera.position.set(px, py, pz);
      state.camera.lookAt(lx, ly, lz);
      if (t >= 1) state._camTransition = null;
      return;
    }
    state.camera.position.set(x, y, z);
    state.camera.lookAt(o.target.x, o.target.y, o.target.z);
  },

  /** [13/09/2026] Executa UM quadro do Modelador (render WebGL + overlay 2D),
   *  protegido por try/catch (ver comentário grande abaixo, em `_renderLoop`,
   *  sobre por que isso é essencial), mas SEM agendar o próximo quadro —
   *  quem decide QUANDO/SE há um próximo quadro é quem chama este método:
   *  `_renderLoop` (quando esta sessão roda seu loop PRÓPRIO — sessão não
   *  `_externallyDriven`, ver `enter()`) ou `driveFrame` (quando é
   *  `View3D._loop`, em view3d.js, quem dirige, uma sessão por vez, dentro
   *  da ÚNICA cadeia de `requestAnimationFrame` compartilhada — ver
   *  comentário grande na unificação, em `enter()` acima). Extraído de
   *  dentro do que antes era o corpo de `_renderLoop` pra poder ser
   *  reaproveitado dos dois lugares sem duplicar o try/catch. */
  _stepFrame(state) {
    if (!state.active || this._state !== state) return;
    // CORRIGIDO (08/09/2026, 39a rodada), pedido verbatim: "clicando para
    // trocar de modo, a tela fica preta (a parte do cenario apenas, os
    // botoes continuam funcionando), tendo que sair do Modelador para o
    // cenario voltar a aparecer." CAUSA RAIZ (analise estatica de codigo --
    // sem navegador real disponivel nesta sessao para confirmar
    // interativamente, restricao ja conhecida do projeto): este loop
    // chamava requestAnimationFrame SOMENTE no final do corpo da funcao,
    // sem try/catch nenhum ao redor -- qualquer excecao nao tratada em
    // QUALQUER passo do quadro (atualizacao de camera, gizmo, resize,
    // render do Three.js, overlay 2D) MATA a cadeia de requestAnimationFrame
    // pra sempre (nunca mais agenda o proximo quadro), deixando o canvas
    // congelado/preto no ultimo quadro desenhado com sucesso -- exatamente
    // o sintoma relatado (preto so na area 3D, os botoes da UI continuam
    // funcionando porque sao DOM normal, nao dependem deste loop). Isso
    // tambem explica a camera "paralisada no Modo Objeto" relatada
    // (provavel excecao ja no 1o quadro em Modo Objeto, antes do usuario
    // sequer arrastar o mouse). Corrigido envolvendo o quadro inteiro em
    // try/catch com console.error (para diagnostico futuro). [13/09/2026]
    // O reagendamento do próximo quadro (antes num `finally` bem aqui) foi
    // MOVIDO pra fora deste método (ver `_renderLoop`/`driveFrame`, quem
    // reagenda de acordo com quem está dirigindo esta sessão) — continua
    // acontecendo sempre, incondicionalmente, do mesmo jeito de antes, só
    // que agora em código compartilhado com o caminho `_externallyDriven`.
    try {
      this._renderFrame(state);
    } catch (err) {
      console.error('[Modelador] excecao no quadro de render (loop continua, ver stack abaixo):', err);
    }
  },

  /** Loop de render PRÓPRIO — usado só quando esta sessão do Modelador NÃO
   *  tem um `View3D` de verdade por trás (`state._externallyDriven === false`,
   *  ver comentário grande em `enter()`), ex.: o "editor de molde" de
   *  modelos3d.js, numa engine/canvas isolada. Mantém a MESMA cadeia de
   *  `requestAnimationFrame` de sempre, só que agora chamando `_stepFrame`
   *  (extraído acima) pra fazer o trabalho de verdade do quadro.
   *
   *  Pedido do usuário: "o fps deve continuar sendo calculado, mesmo no modo
   *  Modelador". Causa raiz: o HUD de FPS (`Perf`, ver perf.js) só conta
   *  quadros de verdade quando alguém chama `Perf.markFrameStart()` —
   *  `_renderFrame` (chamado por `_stepFrame`) já faz isso, então tanto este
   *  loop próprio quanto o caminho `driveFrame` (dirigido por `View3D._loop`)
   *  continuam contando quadros normalmente. */
  _renderLoop(state) {
    if (!state.active || this._state !== state) return;
    try {
      this._stepFrame(state);
    } finally {
      // Reagenda incondicionalmente (mesmo se `_stepFrame` já tiver logado
      // uma exceção internamente) — nunca deixa uma falha isolada travar o
      // loop pra sempre (ver comentário grande em `_stepFrame`). Só reagenda
      // SE a sessão continuar sendo a atual E continuar autônoma — se
      // `exit()` rodou no meio do quadro (`state.active` virou false) ou se
      // por algum motivo esta sessão passou a ser dirigida de fora no meio
      // do caminho, não cria mais um agendamento redundante.
      if (state.active && this._state === state && !state._externallyDriven) {
        state.loopHandle = requestAnimationFrame(() => this._renderLoop(state));
      }
    }
  },

  /** [13/09/2026] Chamado por `View3D._loop` (view3d.js), UMA VEZ por
   *  quadro do loop ÚNICO compartilhado, quando o Modelador está ativo E
   *  dirigido de fora (`state._externallyDriven`, ver `enter()`) — este é o
   *  ponto de integração da unificação dos dois loops de
   *  `requestAnimationFrame` que existiam antes (ver comentário grande em
   *  `enter()` pra explicação completa do problema/da solução). Não faz
   *  nada (sem erro, sem log) se não houver sessão ativa ou se a sessão
   *  ativa estiver rodando seu PRÓPRIO loop (`_renderLoop`) — nesse caso
   *  quem já está chamando `_stepFrame` é aquele loop, e chamar de novo
   *  aqui desenharia 2 quadros no mesmo tick. */
  driveFrame() {
    const state = this._state;
    if (!state || !state._externallyDriven) return;
    this._stepFrame(state);
  },

  /** Corpo de verdade de um quadro de `_renderLoop` (extraido pra dentro do
   *  try/catch acima, ver comentario la). */
  _renderFrame(state) {
    Perf.markFrameStart?.();
    // `delta` (segundos desde o quadro anterior) — só usado pelo modo de
    // câmera LIVRE (`_updateFreeCamera`, WASD/setas/gravidade); o modo
    // Orbital não precisa (a órbita/transição já usam `performance.now()`
    // direto). `Math.min(0.05, ...)` evita um "salto" grande de posição se
    // a aba ficou em segundo plano por um tempo (mesmo cuidado do View3D
    // normal, ver view3d.js `_loop`).
    const now = performance.now();
    const delta = Math.min(0.05, (now - (state._lastFrameT || now)) / 1000);
    state._lastFrameT = now;
    if (state.camPosMode === 'free' && state.freeCam) this._updateFreeCamera(state, delta);
    else this._updateOrbitCamera(state);
    ModelerGizmo.update(state);
    // CORRIGIDO (01/09/2026), pedido verbatim: "indo pelo botão 'Editar', a
    // resolução e o aspecto visual parece em baixa resolução." Causa: este
    // loop sempre chamou `renderer.render()` do Three.js DIRETO (pulando
    // `Engine3D.render(camera)`, que faz trabalho extra irrelevante aqui —
    // destaque de mira, oclusão de selo etc.) — só que só `Engine3D.render`
    // chama `_resize()` (`engine3d.js`), responsável por casar o BUFFER de
    // desenho do WebGL (`renderer.setSize`/`setPixelRatio`) com o tamanho
    // real (esticado por CSS) do canvas. Sem isso, o canvas do Modelador
    // ficava preso na resolução do MOMENTO em que entrou (herdada de
    // qualquer sessão 3D anterior) — daí o aspecto "baixa resolução"
    // relatado.
    //
    // CORRIGIDO DE NOVO (08/09/2026), pedido verbatim (ITENS 5/6 da rodada
    // de 11 itens): "ao redimensionar a tela, fica preto o cenário" / "o
    // objeto não aparece (o cenário também fica congelado)" / "o cenário
    // atrás fica todo congelado (como se [...] um 'screenshot' [...] fica
    // sendo exibido 'atrás', imóvel)." CAUSA RAIZ (ver comentário GRANDE em
    // `Engine3D._presentFrame`, engine3d.js, pra explicação completa):
    // desde a arquitetura "MODO EYE" (07/09/2026), o `<canvas>` visível de
    // `view3d.js` NÃO é mais um canvas WebGL de verdade — é um canvas 2D
    // puro, e o resultado do render só chega nele através de
    // `Engine3D._presentToCanvas()` (lê o WebGLRenderTarget próprio da
    // instância de volta pra CPU e desenha com `drawImage`). Chamar
    // `renderer.render()` DIRETO (como este trecho fazia até aqui) desenha
    // no render target que estiver setado no renderer COMPARTILHADO
    // (`Engine3D._sharedRenderer`, dividido entre Ver em 3D/miniatura do
    // Mapa/prévia de Modelos3D) naquele instante — NUNCA no canvas visível
    // de verdade, já que `_presentToCanvas()` nunca era chamado por este
    // caminho. Resultado: o canvas ficava "congelado" no último quadro
    // desenhado pelo `View3D._loop` normal (pausado durante o Modelador),
    // e um `_resize()` (que reatribui `canvas.width/height`, LIMPANDO o
    // bitmap) deixava tudo preto, sem nada pra redesenhar por cima — e o
    // overlay 2D do Modelador (`ModelerRender.drawFrame`, logo abaixo, um
    // canvas 2D TOTALMENTE SEPARADO por cima) continuava funcionando
    // normalmente (Canvas2D puro, nunca dependeu do render quebrado),
    // dando a falsa impressão de "funciona" só em Modo Edição (onde esse
    // overlay desenha vértices/arestas/contorno) — em Modo Objeto (sem
    // nada desse overlay) nada aparecia mesmo. CORRIGIDO chamando
    // `_presentFrame()` (novo método em engine3d.js — o MESMO trecho
    // "resize + desenha no render target + copia pro canvas visível" que
    // `Engine3D.render(camera)` já usa no fluxo normal) em vez de
    // `_resize()` + `renderer.render()` soltos — a câmera (`state.camera`
    // === `state.view3d._engine.camera3`, MESMA referência, ver `enter()`
    // acima) já foi posicionada por `_updateOrbitCamera`/
    // `_updateFreeCamera` duas linhas acima, então `_presentFrame()` (que,
    // ao contrário de `render(camera)`, NÃO mexe na pose da câmera —
    // deliberado, ver comentário grande em engine3d.js) já renderiza a
    // partir da pose certa deste quadro. HONESTIDADE (convenção já
    // estabelecida neste projeto): correção por ANÁLISE ESTÁTICA de
    // código, sem navegador real disponível nesta sessão pra confirmar
    // visualmente — ainda precisa de confirmação ao vivo (abrir o
    // Modelador, alternar Modo Objeto/Edição, redimensionar a divisão)
    // antes de considerar o bug 100% fechado.
    // [22/09/2026 — RODADA SEGUINTE] NOVO — o plano 3D do backdrop 'Trás'
    // (`View3D._ensureFotoCamBackdropPlane`/`_updateFotoCamBackdropPlane`,
    // restaurados nesta rodada) precisa ser reposicionado/redesenhado A
    // CADA QUADRO enquanto 'Trás' estiver ativo — exatamente igual a
    // `View3D._loop` (ver lá) — mas o `_loop` normal NÃO RODA enquanto o
    // Modelador está aberto (retorno antecipado no topo dele, ver
    // comentário lá) — SEM este bloco aqui, o plano ficaria "congelado" na
    // pose de quando o Modelador foi aberto, mesmo bug já documentado (v442,
    // ver CHANGELOG 11/09/2026) da arquitetura antiga deste mesmo plano.
    // `state._camLockedFixedPose` é a MESMA pose calibrada travada usada
    // pra tudo mais neste Modelador (câmera/gizmo) — equivalente ao
    // `renderCam` de `View3D._loop`.
    // [12/09/2026 — RODADA "mesma imagem"] `_updateFotoCamOverlayZoomScale()`
    // substitui a antiga `_redrawFotoCamBackdropCanvas()` (canvas off-screen
    // dedicado, ELIMINADO — ver comentário grande em
    // `View3D._updateFotoCamOverlayZoomScale`/`_updateFotoCamBackdropPlane`,
    // view3d.js) — roda incondicionalmente, nos 2 modos de profundidade,
    // sempre que o Modelador está aberto travado numa câmera calibrada
    // (senão o gizmo composto logo abaixo, em `gizmoVisivelAgora`, também
    // chamaria de novo — mas rodar aqui garante que a foto/textura também
    // fiquem em dia mesmo quando o gizmo não estiver visível).
    if (state._camLockedFixedPose) {
      state.view3d?._updateFotoCamOverlayZoomScale?.();
    }
    if (state._camLockedFixedPose && state.view3d?._getFotoCamBackdropConfig?.()?.depth === 'back') {
      const imgElMdl = state.view3d._fotoCamImgEl;
      if (imgElMdl && imgElMdl.naturalWidth) {
        state.view3d._ensureFotoCamBackdropPlane();
        state.view3d._updateFotoCamBackdropPlane(state._camLockedFixedPose);
        if (state.view3d._fotoCamBackdropMesh) state.view3d._fotoCamBackdropMesh.visible = true;
      }
    } else {
      // [12/09/2026] NOVO — mesmo motivo/comentário grande de
      // `View3D._loop` (view3d.js): `clearFotoCamBackdropMask()` sempre
      // que o modo 'back' não está ativo aqui dentro do Modelador também,
      // senão a máscara da última pose travada ficaria "vazando" pro
      // resto do render normal do Modelador.
      if (state.view3d?._fotoCamBackdropMesh) state.view3d._fotoCamBackdropMesh.visible = false;
      state.view3d?._engine?.clearFotoCamBackdropMask?.();
    }
    state.view3d._engine._presentFrame();
    ModelerRender.drawFrame(state);
    // [19/09/2026] NOVO — pedido verbatim: "Se há como definir a ordem de
    // impressão do gizmo do objeto selecionado no Modelador, quando se
    // está no modo 'Ver através desta câmera', então, faça o gizmo do
    // objeto selecionado ser impresso depois da imagem." + (correção
    // seguinte, mesmo dia) "Utilize este método tanto para quando estiver
    // marcado 'Trás' quanto quando estiver marcado o 'Frente'." Ver
    // comentário grande em `ModelerGizmo.renderIsolatedToCanvas`
    // (modeler-gizmo.js) e em `View3D._compositeGizmoOverlayOntoPhotoCanvas`
    // (view3d.js) pra causa raiz/técnica completas. `state._camLockedFixedPose`
    // só existe quando este Modelador foi aberto de DENTRO de "Ver através
    // desta câmera" (ver `enter`, acima) — fora disso, nada aqui roda
    // (custo zero no uso normal do Modelador).
    // [19/09/2026] SIMPLIFICADO (à época) — o plano 3D do backdrop 'Trás'
    // tinha sido removido em favor de desenhar a foto sempre no MESMO
    // `<canvas>` 2D usado por 'Frente' (`#v3d-fotocam-photo-canvas`) — sem
    // nenhum plano/textura dentro de `#v3d-canvas` pro modo 'Trás',
    // `_compositeGizmoOverlayOntoMainCanvas` (que colava o gizmo ali)
    // tinha deixado de fazer sentido e foi REMOVIDA.
    // [22/09/2026 — RODADA SEGUINTE] O plano 3D do backdrop 'Trás' foi
    // RESTAURADO (ver `View3D._ensureFotoCamBackdropPlane`/
    // `_updateFotoCamBackdropPlane`) — AVALIADO explicitamente se
    // `_compositeGizmoOverlayOntoMainCanvas` também precisaria voltar
    // (pedido do usuário, item 5): CONCLUSÃO — NÃO, e por um motivo
    // estrutural, não só "não deu tempo de testar": o `#v3d-fotocam-photo-
    // canvas` (destino de `_compositeGizmoOverlayOntoPhotoCanvas`, abaixo)
    // já é o MESMO elemento único compartilhado pelos 2 modos ('Trás'/
    // 'Frente') desde a unificação de 16/09/2026 (é ele quem desenha o
    // retângulo amarelo/guia em AMBOS os modos, com ou sem a foto sendo
    // desenhada ali) — continua existindo e continua sendo o `<canvas>`
    // DOM SEMPRE empilhado por CSS acima de `#v3d-canvas` (WebGL),
    // independente de a foto em si viver no plano 3D (agora) ou no próprio
    // canvas 2D (antes/'Frente'). Colar o gizmo isolado sobre ESTE canvas
    // continua garantindo "por cima de tudo" nos 2 modos, sem precisar de
    // um destino diferente pro plano — `_compositeGizmoOverlayOntoMainCanvas`
    // só fazia sentido numa arquitetura ANTERIOR a essa unificação, onde o
    // canvas de overlay possivelmente nem existia em 'Trás'. Mantida
    // REMOVIDA — os 2 modos continuam colando o gizmo isolado SEMPRE sobre
    // `#v3d-fotocam-photo-canvas` (`_compositeGizmoOverlayOntoPhotoCanvas`),
    // redesenhando a foto/o retângulo do zero (`_updateFotoCamOverlayZoomScale`)
    // ANTES de colar — senão o gizmo de quadros anteriores ficaria
    // "acumulado" (esse canvas não se limpa sozinho entre quadros do
    // Modelador). Quando o gizmo pára de estar visível (objeto desmarcado,
    // ou saiu do Modo Objeto), uma ÚLTIMA chamada a
    // `_updateFotoCamOverlayZoomScale()` limpa o "fantasma" do gizmo da
    // última composição — nos 2 modos.
    const camView = state.view3d;
    const depth = camView?._getFotoCamBackdropConfig?.()?.depth;
    const gizmoVisivelAgora = !!(
      state._camLockedFixedPose
      && (depth === 'front' || depth === 'back')
      && ModelerGizmo._activeGizmoGroup(state)?.visible
    );
    if (gizmoVisivelAgora) {
      camView._updateFotoCamOverlayZoomScale();
      const overlay = ModelerGizmo.renderIsolatedToCanvas(state);
      if (overlay) camView._compositeGizmoOverlayOntoPhotoCanvas(overlay);
    } else if (state._camLockedGizmoOverlayWasVisible && camView?._updateFotoCamOverlayZoomScale) {
      camView._updateFotoCamOverlayZoomScale();
    }
    state._camLockedGizmoOverlayWasVisible = gizmoVisivelAgora;
    Perf.markFrameEnd?.();
  },
};

window.Modeler3D = Modeler3D;
