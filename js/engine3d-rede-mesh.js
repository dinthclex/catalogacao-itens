/* js/engine3d-rede-mesh.js
 * Extraido de `js/engine3d.js` -- pedido verbatim: "No arquivo
 * 'outputs/js/engine3d.js', deixe apenas o core do projeto quanto ao motor
 * 3D. O que [...] usa o core no seu funcionamento e adiciona novos metodos
 * e propriedades deve ser 'recortado' [...] e colocado em um arquivo a
 * parte". Este arquivo cobre TODA a malha 3D de Rack/infraestrutura de
 * rede (switch, patch panel, DIO, bandejas, cabos entre portas, crimpagem traseira,
 * chicotes) -- usa o core do Engine3D (this._group, this.pickables,
 * this.THREE etc.) mas NAO E o motor 3D em si: e uma familia de objetos
 * de catalogo, igual _buildMesaMesh/_buildCadeiraMesh (que continuam no
 * core por serem simples o bastante pra nao pesarem no arquivo).
 *
 * TECNICA: os metodos abaixo sao definidos dentro de uma classe auxiliar
 * (`Engine3DRedeMeshMixin`) EXATAMENTE como estavam em engine3d.js (corpo
 * de classe, sem virgulas entre metodos) -- depois seu `.prototype` e
 * copiado pra `Engine3D.prototype` via `Object.assign`. Zero reescrita de
 * sintaxe, zero risco de erro de virgula/pontuacao ao mover ~1900 linhas.
 * Precisa carregar DEPOIS de `js/engine3d.js` (que declara `class
 * Engine3D`) e ANTES de qualquer `new Engine3D(...)` (ver `js/app.js`).
 */
class Engine3DRedeMeshMixin {
  /** [18/09/2026 UTC] NOVO -- "Rack" modular de 19" (js/rack-modular.js).
   *  `RackModular.fromObjeto(obj)` calcula partes/medidas a partir de
   *  `obj.rackUs`/`obj.rackProfundidade`/`obj.rackMontagem`/`obj.rackTraseiraTipo`/
   *  `obj.rackAcessorios`; `RackModularView3D` monta as malhas (base/teto so em
   *  Z, laterais/trilhos esticados em Y, furos instanciados a cada 44,45mm,
   *  rodizios de tamanho fixo, equipamentos). As malhas saem em coordenadas
   *  LOCAIS de um grupo temporario; aqui cada uma recebe a transformacao de
   *  mundo (posicao/rotacao do objeto) e vai DIRETO em `this._group` (sem grupo
   *  aninhado) -- mesmo padrao de mesa/cadeira, pra `_disposeGroupContents`
   *  (que so descarta filhos de topo) liberar tudo. Origem do rack = centro da
   *  base no plano XZ, Y=0 em `baseY` (que ja soma `obj.elevacao`, ex.: 1,2m
   *  no tipo "parede").
   *
   *  [18/09/2026 UTC] RODADA 164 -- PORTAS: a da frente e de VIDRO (o MESMO
   *  vidro da Janela, `_buildGlassPane`, dentro de moldura de aluminio) e a de
   *  tras e de chapa com grelha (ou uma chapa fixa, `obj.rackTraseiraTipo`).
   *  Cada porta e um `THREE.Group` de topo articulado na dobradica (pivo), que
   *  `_updateRackDoorAnimations` gira ate `obj.anguloAbertura` /
   *  `obj.anguloAberturaTraseira` (0..110 graus, escritos pelo Script de
   *  fabrica do Rack -- duplo clique). Toda malha leva
   *  `userData.rackParte` ('armadura' | 'chapa:<x>' | 'acessorio:<id>' |
   *  'porta:frente' | 'porta:traseira') -- e o que `rackParteSob` le pra o duplo
   *  clique valer SO na porta e o botao direito saber que peca remover. */
  _buildRackMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const rack = window.RackModular.fromObjeto(obj);
    const K = 0.001;
    const mk = (cor) => (wireframe
      ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
      : new THREE.MeshLambertMaterial({ color: cor }));
    const materiais = {
      estrutura: mk(0x1e2126), chapa: mk(perfil.color), trilho: mk(0x9aa0a8), rodizio: mk(0x111111),
      furo: new THREE.MeshBasicMaterial({ color: wireframe ? colWireframe : 0x050505, wireframe: !!wireframe }),
    };
    const view = new window.RackModularView3D(THREE, rack, { mmParaUnidade: K, materiais, criarMaterial: mk });
    const g = view.grupo;
    const rotY = objAnguloToRotY(obj.angulo);
    g.position.set(obj.x, baseY, obj.y);
    g.rotation.y = rotY;
    g.updateMatrixWorld(true);
    const w = rack.dim.largura * K, d = rack.dim.profundidade * K, h = rack.dim.alturaTotal * K;
    const objPos = { x: obj.x, y: baseY + h / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    g.children.slice().forEach((m) => {
      m.applyMatrix4(g.matrixWorld);
      this._group.add(m);
      m.userData.pick = objPick;
      // Furos/conectores (InstancedMesh minusculos) ficam fora do raycast
      // 'pixelperfect' de proposito: o clique no rack ja e coberto pelas
      // demais malhas + pelo OBB acima.
      if (m.isMesh && !m.isInstancedMesh) this._pickMeshes.push(m);
    });

    // ---- Portas articuladas (vidro na frente; chapa com grelha atras) ----
    if (!this._rackRuntime) this._rackRuntime = new Map();
    const rt = { obj, rotY, doors: {} };
    const matPeca = { moldura: mk(0xb7bcc4), chapa: mk(perfil.color), furo: mk(0x0a0a0a), fechadura: mk(0xc9a227) };
    ['frente', 'traseira'].forEach((lado) => {
      const spec = rack.portas && rack.portas[lado];
      if (!spec) return;
      const pg = new THREE.Group();
      const pv = spec.pivo;
      pg.position.set(pv.x * K, pv.y * K, pv.z * K).applyMatrix4(g.matrixWorld);
      pg.rotation.y = rotY;
      const tag = 'porta:' + lado;
      const meshes = [];
      spec.pecas.forEach((p) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(p.tam.x * K, p.tam.y * K, p.tam.z * K), matPeca[p.material] || matPeca.chapa);
        m.position.set(p.pos.x * K, p.pos.y * K, p.pos.z * K);
        m.castShadow = m.receiveShadow = true;
        pg.add(m); meshes.push(m);
      });
      if (spec.vidro) {
        // O MESMO vidro da Janela ("Minecraft", passe de render a parte).
        const gl = this._buildGlassPane(spec.vidro.w * K, spec.vidro.h * K);
        gl.position.set(spec.vidro.pos.x * K, spec.vidro.pos.y * K, spec.vidro.pos.z * K);
        pg.add(gl); meshes.push(gl);
      }
      pg.userData.pick = objPick; pg.userData.rackParte = tag;
      meshes.forEach((m) => { m.userData.pick = objPick; m.userData.rackParte = tag; this._pickMeshes.push(m); });
      this._group.add(pg);
      // Pickable extra (so pro modo 'hitbox'): OBB da FOLHA, atualizado a cada
      // quadro, pra a porta ABERTA (fora do OBB do rack) ainda ser clicavel.
      const dp = { id: obj.id, type: 'object', pos: { x: 0, y: 0, z: 0 }, center: { x: 0, y: 0, z: 0 }, radius: Math.max(spec.w, spec.h) * K * 0.5, ref: obj, rackPorta: lado,
        obb: { half: { x: spec.w * K / 2, y: spec.h * K / 2, z: spec.esp * K / 2 + 0.01 }, rotY, shape: 'box', segments: 14 } };
      this.pickables.push(dp);
      const campo = spec.campoAngulo;
      const ang0 = Math.max(0, Math.min(110, Number(obj[campo]) || 0));
      const door = { pg, spec, pick: dp, ang: ang0 };
      rt.doors[lado] = door;
      this._rackAplicarAngulo(rt, door);
    });
    this._rackRuntime.set(obj.id, rt);
  }

  /** Aplica o angulo (graus) atual da porta `door` do rack `rt`: gira o grupo
   *  em torno da dobradica (sempre PARA FORA do rack) e move o OBB da folha. */
  _rackAplicarAngulo(rt, door) {
    const rad = door.ang * Math.PI / 180;
    const rot = rt.rotY - rad;
    door.pg.rotation.y = rot;
    const K = 0.001, s = door.spec;
    const ox = s.dirX * s.w * K / 2, oy = s.h * K / 2;
    const cx = door.pg.position.x + ox * Math.cos(rot);
    const cz = door.pg.position.z - ox * Math.sin(rot);
    const cy = door.pg.position.y + oy;
    door.pick.pos.x = door.pick.center.x = cx;
    door.pick.pos.y = door.pick.center.y = cy;
    door.pick.pos.z = door.pick.center.z = cz;
    door.pick.obb.rotY = rot;
    door.pg.updateMatrixWorld(true);
  }

  /** Anima (todo quadro, chamado por view3d `_updateScriptLifecycle` ao lado
   *  de `_updateDoorAnimations`) as portas dos racks rumo ao alvo escrito
   *  pelo Script de fabrica: `obj.anguloAbertura` (frente) e
   *  `obj.anguloAberturaTraseira` (tras), 0..110 graus. Velocidade: a do
   *  Script (`obj._velocidadeGrausPorSeg`, vem da rapidez do duplo clique) ou
   *  o padrao (curso todo em ~0,55s). */
  _updateRackDoorAnimations(dt) {
    const rts = this._rackRuntime;
    if (!rts || !rts.size) return;
    for (const [id, rt] of rts) {
      const obj = rt.obj;
      const DPS = (typeof obj._velocidadeGrausPorSeg === 'number' && obj._velocidadeGrausPorSeg > 0) ? obj._velocidadeGrausPorSeg : 110 / 0.55;
      for (const lado of Object.keys(rt.doors)) {
        const door = rt.doors[lado];
        if (!door.pg.parent) { rts.delete(id); break; }   // objeto reconstruido/removido
        const bruto = Number(obj[door.spec.campoAngulo]);
        const alvo = Math.max(0, Math.min(110, isFinite(bruto) ? bruto : 0));
        const diff = alvo - door.ang;
        if (Math.abs(diff) < 0.05) {
          if (door.ang !== alvo) { door.ang = alvo; this._rackAplicarAngulo(rt, door); }
          continue;
        }
        door.ang += Math.sign(diff) * Math.min(Math.abs(diff), DPS * Math.max(0, dt || 0));
        this._rackAplicarAngulo(rt, door);
      }
    }
  }

  // ==========================================================================
  // [18/09/2026 UTC] RODADA 166 -- Equipamentos de rede de RACK 19" (Switch 24/48, Patch Panel
  // 24/48; logica em js/rede-equip.js, malha em `RedeEquipView3D`) + CABOS entre portas.
  // ==========================================================================

  /** Deslocamento Z (mm, no sistema do objeto) do equipamento instalado num rack: leva a placa
   *  frontal ao plano dos trilhos (snap magnetico em Z). 0 se nao esta em rack. */
  _redeZOffMm(obj, spec) {
    if (this._redeCarga && this._redeCarga.id === obj.id && this._redeCarga.zOffMm != null) return this._redeCarga.zOffMm;   // RODADA 167: item sendo carregado
    if (!obj.rackId || !window.RackModular) return 0;
    const rack = (this.mapData?.objects || []).find((o) => o.id === obj.rackId);
    if (!rack || rack.tipo !== 'rack') return 0;
    try {
      const r = window.RackModular.fromObjeto(rack);
      return r.planoMontagem.frontalZ + spec.placaEsp - spec.profundidade / 2;
    } catch (e) { return 0; }
  }

  _buildRedeMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE, RE = window.RedeEquip, K = 0.001;
    const spec = RE.especificar(obj.tipo);
    RE.garantirRede(obj);
    // [19/09/2026 UTC] NOVO (RODADA 206) -- `categoria` (obj.rede.categoria: 'cat5e'|'cat6'|'cat6a'|'cat7',
    // escolhida no painel de propriedades) passada pro `opt` da view -- usada por `_serigrafia()` pra
    // trocar o rótulo "Cat6" gravado na chapa do patch panel pelo valor REAL escolhido pelo usuário (ver
    // comentário lá; antes disso, esse rótulo ficava sempre travado no valor fixo do catálogo).
    const view = new RE.RedeEquipView3D(THREE, spec, { ligado: obj.rede.ligado !== false, parafusos: !!obj.rackId, fibra: obj.rede.fibra || 'SMF', baias: obj.rede.baias || null, categoria: obj.rede.categoria, apAtivo: RE.ehAP(obj.tipo) && obj.rede.ligado !== false && !!(this.mapData && RE.cabosDoObjeto(this.mapData, obj.id).length) });   // [19/09/2026 UTC] NOVO (RODADA 174) -- `baias` p/ colorir as gavetas do Storage
    const zOff = this._redeZOffMm(obj, spec);
    const rotY = objAnguloToRotY(obj.angulo);
    const root = new THREE.Group();
    root.name = 'rede:' + obj.tipo;
    root.position.set(obj.x, baseY, obj.y);
    root.rotation.y = rotY;
    view.group.position.set(0, 0, zOff * K);
    root.add(view.group);
    root.updateMatrixWorld(true);
    const w = spec.largura * K, h = spec.alturaMm * K, d = spec.profundidade * K;
    const lz = zOff * K, cos = Math.cos(rotY), sin = Math.sin(rotY);
    const centro = { x: obj.x + lz * sin, y: baseY + h / 2, z: obj.y + lz * cos };
    const objPick = { id: obj.id, type: 'object', pos: centro, center: centro, radius: Math.max(w, d) * 0.6, ref: obj, obb: { half: { x: w / 2, y: h / 2, z: d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    root.userData.pick = objPick;
    root.traverse((m) => {
      m.userData.pick = objPick; m.userData.redeObj = obj;
      if (wireframe && m.isMesh && !m.isInstancedMesh && m.name !== 'serigrafia') m.material = new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true });
      if (m.isMesh && !m.isInstancedMesh && m.name !== 'serigrafia') this._pickMeshes.push(m);
    });
    this._group.add(root);
    if (!this._redeRuntime) this._redeRuntime = new Map();
    this._redeRuntime.set(obj.id, { obj, view, root });
    // Estado inicial dos LEDs ja na 1a imagem.
    if (RE.ehSwitch(obj.tipo)) this._redeAtualizarUm(this._redeRuntime.get(obj.id));
  }

  _redeAtualizarUm(rt) {
    const RE = window.RedeEquip; if (!RE || !rt || !RE.ehSwitch(rt.obj.tipo)) return;
    const arr = RE.estadosDasPortas(this.mapData, rt.obj), est = {};
    arr.forEach((v, i) => { est[i + 1] = v; });
    rt.view.atualizarLeds(est, this._redeT || 0, rt.obj.rede ? rt.obj.rede.ligado !== false : true);
  }

  /** Anima os LEDs (chamado todo quadro por view3d, junto das portas dos racks). Recalcula o estado
   *  das portas a ~20 Hz; `active` pisca, `idle` fica fixo, `off` apagado. */
  _updateRedeLeds(dt) {
    const rts = this._redeRuntime;
    if (!rts || !rts.size) return;
    this._redeT = (this._redeT || 0) + Math.max(0, dt || 0);
    this._redeAcc = (this._redeAcc || 0) + Math.max(0, dt || 0);
    if (this._redeAcc < 0.05) return;
    this._redeAcc = 0;
    for (const [id, rt] of rts) {
      if (!rt.root.parent) { rts.delete(id); continue; }   // objeto reconstruido/removido
      this._redeAtualizarUm(rt);
    }
  }

  /** Ponto (mundo) e normal da FRENTE da porta `n` do equipamento `obj`. */
  _redePortaMundo(obj, n) {
    const RE = window.RedeEquip, spec = RE && RE.especificar(obj.tipo), p = spec && spec.portaPorN[n];
    if (!p) return null;
    // [19/09/2026 UTC] REVERTIDO DEFINITIVAMENTE (RODADA 176) -- DUAS tentativas de usar
    // `rt.view.group.matrixWorld` pra corrigir o patch cord "enviesado" (RODADA 170 e RODADA 174,
    // esta última já com salvaguardas de Number.isFinite + try/catch) fizeram os cabos do rack
    // sumirem de novo. Como o problema se repetiu MESMO com as salvaguardas, a causa não era (só)
    // valor não-finito -- fica provado que esta abordagem (matrixWorld) tem algum problema mais
    // fundamental de timing/estado que não foi possível diagnosticar por leitura de código, sem
    // acesso a navegador nesta sessão. A PEDIDO EXPLÍCITO DO USUÁRIO ("Reverta e não mexa mais"):
    // revertido para o cálculo manual (o único que se mostrou estável em uso real) e ESTE TRECHO
    // NÃO DEVE SER MEXIDO DE NOVO sem autorização explícita do usuário, mesmo que o bug do patch
    // cord "enviesado" continue sem correção.
    const K = 0.001, baseY = (obj.piso || 0) * (this.mapData?.alturaPiso || 2.8) + (obj.elevacao || 0);
    const rotY = objAnguloToRotY(obj.angulo), cos = Math.cos(rotY), sin = Math.sin(rotY);
    const lx = p.x * K, ly = p.y * K, lz = (spec.profundidade / 2 + this._redeZOffMm(obj, spec)) * K;
    return { x: obj.x + lx * cos + lz * sin, y: baseY + ly, z: obj.y - lx * sin + lz * cos, nx: sin, nz: cos, rotY };
  }

  /** Ponto (mundo) de uma coordenada LOCAL do equipamento: `xmm`/`ymm` = mm no plano frontal (x a partir do
   *  centro, y da base) e `zmm` = mm A PARTIR DA FRENTE (positivo = para fora). Usado para as zonas das guias. */
  _redePontoMundo(obj, xmm, ymm, zmm) {
    const RE = window.RedeEquip, spec = RE && RE.especificar(obj.tipo);
    if (!spec) return null;
    const K = 0.001, baseY = (obj.piso || 0) * (this.mapData?.alturaPiso || 2.8) + (obj.elevacao || 0);
    const rotY = objAnguloToRotY(obj.angulo), cos = Math.cos(rotY), sin = Math.sin(rotY);
    const lx = xmm * K, lz = (spec.profundidade / 2 + this._redeZOffMm(obj, spec) + (zmm || 0)) * K;
    return { x: obj.x + lx * cos + lz * sin, y: baseY + ymm * K, z: obj.y - lx * sin + lz * cos };
  }

  /** ZONAS DE PASSAGEM que alteram a spline do cabo (RODADA 167): (1) guia horizontal 1U/2U do MESMO rack mais
   *  proxima (em U) de `obj` — o cabo e obrigado a passar pelo vao entre dedos mais proximo da porta; (2) guia
   *  vertical (`guia_v`) a ate 0,6 m do ponto medio da corda A-B, no vao mais proximo dessa altura. */
  _redeZonasGuia(A, pa, B, pb, a, b, ladoA, ladoB, pular) {
    pular = pular || {}; // { A:bool, B:bool } -- ponta ja roteada por RackCableRouting (sem barra/guia_h automaticas)
    const RE = window.RedeEquip, zonas = [], objs = this.mapData?.objects || [];
    const escolher = (guia, ponto) => {
      const sp = RE.especificar(guia.tipo), zs = sp && sp.extras && sp.extras.zonas; if (!zs || !zs.length) return null;
      let best = null, bd = 1e9;
      zs.forEach((z) => { const w = this._redePontoMundo(guia, z.x, z.y, z.z); if (!w) return; const d = Math.hypot(w.x - ponto.x, w.y - ponto.y, w.z - ponto.z); if (d < bd) { bd = d; best = w; } });
      return best;
    };
    // [19/09/2026 UTC] NOVO (RODADA 200) -- "applyRackRoutingStandards" (pedido verbatim): quando a ponta e
    // um patch panel montado num rack, o cabo primeiro sai HORIZONTALMENTE por cima da barra de apoio
    // traseira (`spec.barra`, ja modelada em 3D no proprio patch panel, ver rede-equip.js `_construirCorpo`)
    // antes de seguir pro resto da rota -- em vez de sair na diagonal direto da porta pro destino. Ponto
    // marcado `reto:true` (`_curvaDeRotaCabo` respeita isso) pra esse trecho inicial ficar reto de verdade,
    // como um cabo apoiado/preso na barra ficaria na pratica (nao curvado feito mola).
    // [19/09/2026 UTC] CORRIGIDO (RODADA 200, ainda na mesma sessao) -- BUG REAL relatado pelo usuario:
    // "as ligacoes dos cabos no rack desapareceram depois da ultima atualizacao". CAUSA RAIZ: este bloco
    // usava `p.nx`/`p.nz` (a NORMAL de saida da porta), mas `p` aqui e `pa`/`pb` -- pontos PUROS `{x,y,z}`
    // (ver `_caboRota`: `const pa = {x:a.x,y:a.y,z:a.z}`), que NUNCA tiveram `nx`/`nz` -- só `a`/`b` (os
    // objetos originais devolvidos por `_redePortaMundo`/`_redePortaMundoLado`) tem essa normal. `p.nx`
    // undefined * distM = NaN, gerando uma "zona" com coordenadas NaN em QUALQUER cabo com uma ponta num
    // patch panel montado em rack -- entra em `RedePassiva.rotaCabo`, contamina `ctrl`, e a curva/tubo
    // resultante (`_buildTuboEstavel`) fica com geometria invalida (NaN), quebrando o desenho desse cabo
    // (e, pelo relato do usuario, aparentemente afetando o quadro/lote de desenho o suficiente pra outros
    // cabos do MESMO rack sumirem junto). CORRIGIDO: a normal agora vem de `a`/`b` (2 novos parametros
    // desta função, passados por `_caboRota` logo abaixo), nunca de `pa`/`pb`.
    // [19/09/2026 UTC] AMPLIADO (RODADA 201) -- só se aplica quando a PONTA em questão está ligada na
    // TRASEIRA da porta (`lado === 'tras'`, ver `RedeEquip.conectar`) -- um patch cord na FRENTE do
    // painel (uso comum) não tem por que rotear por trás dele; só o cabo horizontal (que já entra por
    // trás, no "ponto de ruptura" de `_redePortaMundoLado`) faz sentido passar pela barra de apoio.
    [[A, pa, a, ladoA, pular.A], [B, pb, b, ladoB, pular.B]].forEach(([o, p, ext, lado, pl]) => {
      if (pl || !o.rackId || !ext || lado !== 'tras') return;
      const sp0 = RE.especificar(o.tipo);
      if (sp0 && sp0.familia === 'patchpanel' && sp0.barra) {
        const distM = (sp0.profundidade + sp0.corpo / 2) * 0.001; // ver `_redeRenderRearCrimping` (FUNDO_MM) -- mesma aproximacao de profundidade ate a barra
        const nx = ext.nx || 0, nz = ext.nz != null ? ext.nz : 1;
        zonas.push({ x: p.x - nx * distM, y: p.y, z: p.z - nz * distM, reto: true });
      }
    });
    [[A, pa, pular.A], [B, pb, pular.B]].forEach(([o, p, pl]) => {
      if (pl || !o.rackId) return;
      let g = null, dmin = 1e9;
      objs.forEach((q) => { if (q.rackId === o.rackId && q.id !== o.id && /^guia_h/.test(q.tipo)) { const d = Math.abs((q.rackU || 0) - (o.rackU || 0)); if (d < dmin && d <= 4) { dmin = d; g = q; } } });
      if (g) { const w = escolher(g, p); if (w && !zonas.some((z) => Math.hypot(z.x - w.x, z.y - w.y, z.z - w.z) < 0.01)) zonas.push(w); }
    });
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 };
    objs.forEach((q) => {
      if (q.tipo !== 'guia_v') return;
      const sp = RE.especificar(q.tipo), c = this._redePontoMundo(q, 0, sp.alturaMm / 2, 0); if (!c) return;
      if (Math.hypot(c.x - mid.x, c.z - mid.z) > 0.6) return;
      const w = escolher(q, mid); if (w) zonas.push(w);
    });
    return zonas;
  }

  /** [20/09/2026 UTC] NOVO -- rota de UMA ponta (traseira de patch panel em rack com saida Topo/Base) ate a
   *  furacao da tampa, via `RackCableRouting.calculateCablePath`. `null` se nao se aplica. */
  _rackRotaExtremidade(c, ext, eq) {
    const RCR = window.RackCableRouting;
    if (!RCR || !ext || ext.lado !== 'tras' || !eq || !eq.rackId) return null;
    const rack = (this.mapData?.objects || []).find((o) => o.id === eq.rackId);
    if (!rack || !RCR.ativo(rack)) return null;
    const r = RCR.calculateCablePath(rack, c, eq, {
      mapData: this.mapData, THREE: this.THREE,
      portaTras: (pp, n) => this._redePortaMundoLado(pp, n, 'tras'),
    });
    return r && r.pontos && r.pontos.length > 1 ? r : null;
  }

  /** [20/09/2026 UTC] API reativa do roteamento por rack: posicao GLOBAL (THREE.Vector3) da furacao da tampa. */
  rackGetExitNodePosition(rackObj) {
    return window.RackCableRouting ? window.RackCableRouting.getExitNodePosition(rackObj, this.mapData, this.THREE) : null;
  }
  /** Direcao/alinhamento da saida mudou -> recalcula a geometria de TODOS os cabos ligados ao rack (e a tampa). */
  rackAtualizarRoteamento(rackObj) { if (typeof rackObj === 'string') rackObj = (this.mapData?.objects || []).find((o) => o.id === rackObj); if (rackObj) this.rebuildObjectIncremental(rackObj); }
  /** `cable.updateGeometry()`: recalcula o tubo de UM cabo (rota + malha) sem reconstruir os demais. */
  caboUpdateGeometry(caboId) { return this.caboAtualizarTuboVivo(caboId); }

  /** [19/09/2026 UTC] NOVO (RODADA 189) — extraído do corpo de `rebuildCabos` (era código inline dentro do
   *  `forEach`) pra ser reaproveitado também pela atualização "ao vivo" de UM cabo só durante o arraste
   *  do gizmo de moldagem (`caboAtualizarTuboVivo`, abaixo) — sem essa extração, mover um nó exigiria
   *  chamar `rebuildCabos()` inteiro (reconstrói TODOS os cabos + bunching) a cada quadro de arraste, caro
   *  pra cenas com muitos cabos. Devolve `{ A, B, a, b, pa, pb, ctrl }` ou `null` (porta/objeto inválido —
   *  mesmas checagens defensivas da RODADA 174, preservadas tal e qual). `c.pontosExtras` (novo campo,
   *  RODADA 189 — pontos de controle que o usuário adiciona/arrasta manualmente pra moldar o cabo, ver
   *  `caboInserirPontoExtra`/`caboMoverPontoExtra`) entram como mais "zonas" no caminho 
   *  — `RedePassiva.rotaCabo` já ordena qualquer lista de zonas pela projeção no eixo A->B, então a ORDEM
   *  em que os pontos foram criados não importa pro resultado geométrico. */
  _caboRota(c, objs, aPiso) {
    const RE = window.RedeEquip, RP = window.RedePassiva;
    const A = objs.get(c.de.obj), B = objs.get(c.para.obj);
    if (!A || !B || !RE.ehEquipRede(A.tipo) || !RE.ehEquipRede(B.tipo)) return null;
    // [19/09/2026 UTC] NOVO (RODADA 201) -- `_redePortaMundoLado` no lugar de `_redePortaMundo` direto:
    // `c.de.lado`/`c.para.lado` (ausente em cabos gravados ANTES desta rodada -- default 'frente', mesmo
    // comportamento de sempre) escolhe se a rota termina na FRENTE (normal de sempre) ou na TRASEIRA
    // (ponto de ruptura, ver `_redePortaMundoLado`) da porta.
    const a = this._redePortaMundoLado(A, c.de.porta, c.de.lado), b = this._redePortaMundoLado(B, c.para.porta, c.para.lado);
    // [19/09/2026 UTC] RODADA 174 -- defesa extra (ver comentário original): coordenada inválida
    // escapando por algum caminho não previsto só PULA este cabo, nunca deixa um NaN chegar na spline.
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.z)) return null;
    const pa = { x: a.x, y: a.y, z: a.z }, pb = { x: b.x, y: b.y, z: b.z };
    let ctrl;
    if (RP) {
      // [19/09/2026 UTC] RODADA 193 -- pedido verbatim: "Os nós não devem se reordenar dinamicamente
      // [...] a ordem dos nós deve ser preservada." Antes, `rotaCabo` reordenava TODAS as zonas (guias
      // automáticas de passagem + nós manuais) só pela projeção geométrica no eixo A→B -- com o cabo
      // esticado (ou perto disso), 2 nós manuais podem ficar praticamente na mesma projeção e "trocar de
      // lugar" a cada recálculo (a cada quadro, durante um arraste). Marca cada ponto de `pontosExtras`
      // com `_ordemManual` (o próprio índice no array, a ordem de criação) -- `rotaCabo` usa isso como
      // critério de desempate ESTÁVEL entre 2 nós manuais (mantém a ordem entre eles sempre, não importa
      // a posição geométrica), só caindo na projeção normal quando pelo menos um dos dois é uma zona-guia
      // automática (essas continuam só por geometria, não têm "ordem de criação" nenhuma pra preservar).
      const extras = (Array.isArray(c.pontosExtras) ? c.pontosExtras : []).map((p, i) => ({ x: p.x, y: p.y, z: p.z, reto: !!p.reto, _ordemManual: i }));
      // [20/09/2026 UTC] NOVO -- roteamento ortogonal por rack (RackCableRouting): a ponta traseira de um patch
      // panel num rack com saida Topo/Base segue barra de apoio -> guia vertical -> furacao da tampa; o resto
      // do cabo (ate a outra ponta / outro rack) continua sendo roteado por `RedePassiva.rotaCabo`.
      const ra = this._rackRotaExtremidade(c, c.de, A), rb = this._rackRotaExtremidade(c, c.para, B);
      if (ra || rb) {
        const de = ra ? ra.saida : pa, para = rb ? rb.saida : pb;
        const nDe = ra ? { x: 0, y: ra.saida.ny, z: 0 } : { x: a.nx, y: 0, z: a.nz };
        const nPara = rb ? { x: 0, y: rb.saida.ny, z: 0 } : { x: b.nx, y: 0, z: b.nz };
        const zn = this._redeZonasGuia(A, de, B, para, a, b, c.de.lado, c.para.lado, { A: !!ra, B: !!rb }).concat(extras);
        let mid = RP.rotaCabo({ x: de.x, y: de.y, z: de.z }, nDe, { x: para.x, y: para.y, z: para.z }, nPara, { zonas: zn });
        if (ra) mid = mid.slice(1);
        if (rb) mid = mid.slice(0, -1);
        ctrl = (ra ? ra.pontos : []).concat(mid, rb ? window.RackCableRouting.inverter(rb.pontos) : []);
      } else {
      const zonas = this._redeZonasGuia(A, pa, B, pb, a, b, c.de.lado, c.para.lado).concat(extras);
      ctrl = RP.rotaCabo(pa, { x: a.nx, y: 0, z: a.nz }, pb, { x: b.nx, y: 0, z: b.nz }, { zonas });
      }
    } else {
      ctrl = [pa, pb];
    }
    return { A, B, a, b, pa, pb, ctrl };
  }

  /** [19/09/2026 UTC] NOVO (RODADA 192) — monta a curva 3D (THREE.CurvePath) de uma rota de cabo `ctrl`
   *  (array de pontos de controle, ver `RedePassiva.rotaCabo`) RESPEITANDO o flag `.reto` de cada ponto:
   *  trechos entre um ponto `reto:true` e o próximo viram `THREE.LineCurve3` (reta pura, sem nenhuma
   *  curvatura), e os demais trechos (≥2 pontos consecutivos sem `reto`) viram um `THREE.CatmullRomCurve3`
   *  ('centripetal', evita overshoot — mesma razão de `RedePassiva.amostrarSpline`). Usado pra construir o
   *  `TubeGeometry` do cabo DIRETO a partir dos pontos de controle (não da polilinha já amostrada) —
   *  assim um trecho marcado reto fica de fato reto, sem ser re-suavizado numa 2ª passada de spline sobre
   *  pontos vizinhos (o que aconteceria se só trocássemos `amostrarSpline` por `amostrarRotaComRetas` e
   *  ainda envolvêssemos o resultado inteiro numa única `CatmullRomCurve3`, como o código fazia antes).
   *  Sem nenhum ponto `reto`, o resultado equivale a uma única `CatmullRomCurve3(ctrl)` (comportamento de
   *  sempre). Devolve `null` se `ctrl` tiver menos de 2 pontos. */
  _curvaDeRotaCabo(ctrl) {
    const THREE = this.THREE;
    if (!Array.isArray(ctrl) || ctrl.length < 2) return null;
    const runs = [];
    let atual = [ctrl[0]];
    for (let i = 0; i < ctrl.length - 1; i++) {
      if (ctrl[i] && ctrl[i].reto) {
        if (atual.length > 1) runs.push({ reto: false, pts: atual });
        runs.push({ reto: true, pts: [ctrl[i], ctrl[i + 1]] });
        atual = [ctrl[i + 1]];
      } else {
        atual.push(ctrl[i + 1]);
      }
    }
    if (atual.length > 1) runs.push({ reto: false, pts: atual });
    const path = new THREE.CurvePath();
    runs.forEach((run) => {
      const vs = run.pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      path.add(run.reto ? new THREE.LineCurve3(vs[0], vs[1]) : new THREE.CatmullRomCurve3(vs, false, 'centripetal'));
    });
    return path;
  }

  /** [19/09/2026 UTC] NOVO (RODADA 195) — pedido verbatim: "O aspecto do cabo sempre deve ser de um
   *  cilindro, mesmo em curvas fechadas. Atualmente, quando é uma curva mais fechada entre dois nós, o
   *  cilindro que representa o cabo se comprime e fica quase como uma fita fina." CAUSA RAIZ: `THREE.
   *  TubeGeometry` (usado antes aqui pra montar o tubo do cabo, ver `caboAtualizarTuboVivo`/
   *  `rebuildCabos`) calcula sozinho o "referencial" (normal/binormal) que gira em volta da curva pra
   *  desenhar o círculo do cabo em cada ponto via `computeFrenetFrames` — um "transporte paralelo" que
   *  arrasta o referencial de um ponto pro próximo girando ele pelo ângulo entre as 2 tangentes
   *  consecutivas. Numa curva bem fechada entre só 2-3 pontos de controle (poucos pontos, ângulo grande
   *  entre eles), esse giro fica instável/degenerado bem no meio da curva -- o círculo que deveria ficar
   *  sempre do MESMO tamanho (é um raio fixo) acaba GIRANDO/torcendo até ficar visto quase de perfil
   *  (de "cara" pra "de lado") naquele trecho -- dando a impressão de "achatar numa fita fina", exatamente
   *  o bug relatado (é uma ilusão de ótica do referencial torto, não o raio encolhendo de verdade).
   *  CORRIGIDO: substituído `THREE.TubeGeometry` (e seu `computeFrenetFrames` problemático) por esta
   *  construção manual do tubo com um referencial "de cima fixo" (`normal = cima × tangente`, com um eixo
   *  de reserva pros trechos quase verticais onde `cima` e a tangente ficam quase paralelos) -- o círculo
   *  nunca gira mais que o estritamente necessário pra acompanhar a curva, então nunca "vira de lado" só
   *  por causa de uma curva fechada. Mesma assinatura de `new THREE.TubeGeometry(curva, tubularSegments,
   *  radius, radialSegments, closed)` (`closed` sempre `false` nos 2 pontos de chamada — não implementado
   *  aqui de propósito, cabo nunca é uma malha fechada em loop) — devolve uma `THREE.BufferGeometry` com
   *  `.type` forçado pra `'TubeGeometry'` (só pra continuar batendo com o `n.geometry?.type ===
   *  'TubeGeometry'` que `caboAtualizarTuboVivo` usa pra reencontrar a malha do tubo já existente — não
   *  precisou mudar aquele ponto de busca). */
  _buildTuboEstavel(curva, tubularSegments, radius, radialSegments) {
    const THREE = this.THREE;
    const n = Math.max(2, tubularSegments | 0);
    const pts = curva.getSpacedPoints(n); // n+1 pontos
    if (!pts || pts.length < 2) return new THREE.BufferGeometry();
    const CIMA = new THREE.Vector3(0, 1, 0);
    const RESERVA = new THREE.Vector3(1, 0, 0); // usado só quando a tangente fica quase paralela a CIMA (trecho quase vertical)
    const tangentes = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const t = new THREE.Vector3().subVectors(b, a);
      return t.lengthSq() < 1e-12 ? new THREE.Vector3(1, 0, 0) : t.normalize();
    });
    // [19/09/2026 UTC] CORRIGIDO -- pedido verbatim: "A cor do cabo ligado entre um switch e outro em
    // outra posição do mapa está um azul mais escuro que o normal. Deve ser por causa de um modo de
    // desenho feito à mão em caso de dobras fechadas do cabo." CAUSA RAIZ REAL (não é cor — cabo e os
    // plugues das pontas usam o MESMO objeto `mat`/mesma cor hexadecimal; o "escurecimento" é uma ilusão
    // de sombreamento): o código antigo (uma linha acima, `tangentes.forEach(...)`) escolhia o eixo de
    // referência (CIMA ou RESERVA) DE FORMA INDEPENDENTE em CADA ponto, só olhando o produto escalar
    // daquele ponto com CIMA. Isolei e reproduzi o bug: 2 tangentes praticamente idênticas (0.576° de
    // diferença entre si) podem cair uma de cada lado do limiar 0.98 -- uma escolhe `ref=CIMA`, a
    // vizinha escolhe `ref=RESERVA` -- e o `normal` resultante vira 180° (!) entre 2 pontos vizinhos do
    // cabo. Isso faz a superfície do tubo "dobrar pra dentro" bem naquele anel, e a normal invertida ali
    // pega luz de um jeito completamente diferente do resto do tubo -- daí o "azul mais escuro" só
    // naquele trecho (sombreamento errado, não a cor). CORRIGIDO: troca-se a escolha independente por
    // "Parallel Transport Frame" via dupla-reflexão (Hanson & Ma) -- o referencial (normal/binormal) é
    // calculado UMA ÚNICA VEZ no ponto 0 e depois PROPAGADO de um ponto pro próximo refletindo o vetor
    // normal anterior contra o plano perpendicular ao segmento (2 reflexões sucessivas cancelam a torção
    // acumulada) -- nunca mais re-escolhe uma referência do zero no meio do caminho, então não pode mais
    // sofrer o salto de 180° acima, mesmo em dobras bem fechadas.
    const normais = [], binormais = [];
    {
      const t0 = tangentes[0];
      const ref0 = Math.abs(t0.dot(CIMA)) > 0.98 ? RESERVA : CIMA;
      const n0 = new THREE.Vector3().crossVectors(ref0, t0);
      if (n0.lengthSq() < 1e-10) n0.set(1, 0, 0);
      n0.normalize();
      normais.push(n0);
      binormais.push(new THREE.Vector3().crossVectors(t0, n0).normalize());
    }
    for (let i = 1; i < pts.length; i++) {
      const v1 = new THREE.Vector3().subVectors(pts[i], pts[i - 1]);
      const c1 = v1.lengthSq();
      if (c1 < 1e-12) { normais.push(normais[i - 1].clone()); binormais.push(binormais[i - 1].clone()); continue; }
      const rL = normais[i - 1].clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(normais[i - 1])));
      const tL = tangentes[i - 1].clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(tangentes[i - 1])));
      const v2 = new THREE.Vector3().subVectors(tangentes[i], tL);
      const c2 = v2.lengthSq();
      const rNovo = c2 < 1e-12 ? rL : rL.clone().sub(v2.clone().multiplyScalar((2 / c2) * v2.dot(rL)));
      rNovo.normalize();
      normais.push(rNovo);
      binormais.push(new THREE.Vector3().crossVectors(tangentes[i], rNovo).normalize());
    }
    const radialSeg = Math.max(3, radialSegments | 0);
    const positions = [], normalsOut = [], uvs = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], normal = normais[i], binormal = binormais[i];
      for (let j = 0; j <= radialSeg; j++) {
        const ang = (j / radialSeg) * Math.PI * 2;
        const cosA = Math.cos(ang), senA = Math.sin(ang);
        // direcao radial (unitaria, ja que normal/binormal sao ortonormais entre si) -- e a propria normal do vertice (superficie de um cilindro)
        const nx = normal.x * cosA + binormal.x * senA;
        const ny = normal.y * cosA + binormal.y * senA;
        const nz = normal.z * cosA + binormal.z * senA;
        positions.push(p.x + nx * radius, p.y + ny * radius, p.z + nz * radius);
        normalsOut.push(nx, ny, nz);
        uvs.push(j / radialSeg, i / (pts.length - 1));
      }
    }
    const idx = [];
    const colStride = radialSeg + 1;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = 0; j < radialSeg; j++) {
        const a = i * colStride + j, b = a + colStride, c2 = a + 1, d = b + 1;
        idx.push(a, b, c2, b, d, c2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normalsOut, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.type = 'TubeGeometry'; // ver comentario grande acima -- so pra `caboAtualizarTuboVivo` continuar reconhecendo a malha
    return geo;
  }

  /** [19/09/2026 UTC] NOVO (RODADA 189) — insere um novo ponto de controle manual (`c.pontosExtras`) no
   *  cabo `caboId`, na posição de mundo `pontoMundo`. Não precisa calcular ONDE inserir no array — a
   *  ordem geométrica é sempre recalculada por projeção em `_caboRota`/`RedePassiva.rotaCabo`, então
   *  basta acrescentar no fim. Devolve o ÍNDICE do novo ponto (pra o gizmo poder arrastar em seguida), ou
   *  `null` se o cabo não existir.
   *  NÃO chama `rebuildCabos()` sozinho — quem chama decide quando reconstruir (o gizmo usa
   *  `caboAtualizarTuboVivo`, mais barato, enquanto arrasta, e só um `rebuildCabos()` completo ao soltar). */
  caboInserirPontoExtra(caboId, pontoMundo) {
    const c = (this.mapData?.cabos || []).find((x) => x.id === caboId);
    if (!c) return null;
    if (!Array.isArray(c.pontosExtras)) c.pontosExtras = [];
    const novo = { x: pontoMundo.x, y: pontoMundo.y, z: pontoMundo.z };
    // [19/09/2026 UTC] CORRIGIDO (RODADA 194) -- pedido verbatim: "coloquei um nó no cabo, depois,
    // tentei colocar um nó à direita [...] deu certo. Depois, tentei colocar outro nó à esquerda do 1º
    // nó, porém não deu certo [...] o novo nó apareceu do lado do 2º nó [...] O nó deve ser colocado no
    // exato ponto do cabo em que se clicou, preservando os nós que já estavam no cabo tanto à esquerda
    // [...] como também à direita." CAUSA RAIZ: a RODADA 193 passou a "congelar" a ordem dos nós
    // manuais pelo ÍNDICE DE CRIAÇÃO (`_ordemManual`, ver `_caboRota`/`RedePassiva.rotaCabo`) -- o que
    // resolve o pedido daquela rodada (nós não reordenam sozinhos enquanto são só ARRASTADOS), mas este
    // método sempre colocava um nó RECÉM-CRIADO no FIM do array (`push`), então um nó criado por ÚLTIMO
    // sempre tinha o MAIOR índice de criação, não importa ONDE geometricamente ele foi clicado -- exatamente
    // o bug relatado. Agora o índice de INSERÇÃO é calculado pela projeção no eixo A→B do cabo (mesma
    // conta de `RedePassiva.rotaCabo`) ANTES de decidir onde colocar (`splice`, não `push`) -- assim um
    // nó novo entra na posição geométrica certa da array (preservando os vizinhos dos 2 lados), e a
    // ordem congelada da RODADA 193 (que só entra em ação DEPOIS, nos arrastos seguintes) já nasce
    // correta a partir daqui.
    let idx = c.pontosExtras.length;
    try {
      const objs = new Map((this.mapData?.objects || []).map((o) => [o.id, o]));
      const aPiso = this.mapData?.alturaPiso || 2.8;
      const r = this._caboRota(c, objs, aPiso);
      if (r && r.pa && r.pb) {
        const ex = r.pb.x - r.pa.x, ey = r.pb.y - r.pa.y, ez = r.pb.z - r.pa.z;
        const l2 = ex * ex + ey * ey + ez * ez || 1;
        const proj = (p) => ((p.x - r.pa.x) * ex + (p.y - r.pa.y) * ey + (p.z - r.pa.z) * ez) / l2;
        const pNovo = proj(novo);
        const achado = c.pontosExtras.findIndex((p) => proj(p) > pNovo);
        idx = achado === -1 ? c.pontosExtras.length : achado;
      }
    } catch (e) { /* melhor esforço -- na dúvida, insere no fim (comportamento de antes desta correção) */ }
    c.pontosExtras.splice(idx, 0, novo);
    return idx;
  }

  /** Move o ponto de controle manual `index` do cabo `caboId` pra `pontoMundo`. */
  caboMoverPontoExtra(caboId, index, pontoMundo) {
    const c = (this.mapData?.cabos || []).find((x) => x.id === caboId);
    if (!c || !Array.isArray(c.pontosExtras) || !c.pontosExtras[index]) return false;
    c.pontosExtras[index].x = pontoMundo.x; c.pontosExtras[index].y = pontoMundo.y; c.pontosExtras[index].z = pontoMundo.z;
    return true;
  }

  /** Remove o ponto de controle manual `index` do cabo `caboId` (ex.: usuário decide simplificar o traçado). */
  caboRemoverPontoExtra(caboId, index) {
    const c = (this.mapData?.cabos || []).find((x) => x.id === caboId);
    if (!c || !Array.isArray(c.pontosExtras) || index < 0 || index >= c.pontosExtras.length) return false;
    c.pontosExtras.splice(index, 1);
    return true;
  }

  /** [19/09/2026 UTC] NOVO (RODADA 192) — alterna o flag `reto` do ponto de controle manual `index` do
   *  cabo `caboId`: pedido verbatim: "ativar desativar o bézier em partes do cabo [...] uma tecla pode
   *  servir para trocar de bézier para linha reta, então, fica um traço reto mesmo (entre um nó e outro)".
   *  `reto: true` faz o SEGMENTO SEGUINTE (deste ponto até o próximo, na ordem geométrica recalculada por
   *  `_caboRota`/`RedePassiva.rotaCabo`) virar uma reta pura em vez de curva Catmull-Rom — ver
   *  `RedePassiva.amostrarRotaComRetas`. Devolve o novo valor do flag (bool), ou `null` se não existir. */
  caboAlternarRetoPontoExtra(caboId, index) {
    const c = (this.mapData?.cabos || []).find((x) => x.id === caboId);
    if (!c || !Array.isArray(c.pontosExtras) || !c.pontosExtras[index]) return null;
    c.pontosExtras[index].reto = !c.pontosExtras[index].reto;
    return c.pontosExtras[index].reto;
  }

  /** Ponto de controle manual mais próximo do RAIO (mesma ideia de `redeCaboSob`, mas mirando as ESFERAS
   *  de alça dos pontos, não o corpo do cabo) — usado pelo gizmo de moldagem pra decidir se o clique
   *  deve PEGAR um ponto já existente (em vez de criar um novo em cima dele sem querer). Devolve
   *  `{ caboId, index, dist }` do mais próximo dentro de `tol` metros, ou `null`. */
  caboPontoExtraSob(origin, dir, maxDist, tol) {
    const cabos = this.mapData?.cabos; if (!Array.isArray(cabos)) return null;
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1, d = { x: dir.x / dl, y: dir.y / dl, z: dir.z / dl };
    const T = tol || 0.05;
    let best = null;
    cabos.forEach((c) => {
      if (!Array.isArray(c.pontosExtras)) return;
      c.pontosExtras.forEach((p, index) => {
        const wx = p.x - origin.x, wy = p.y - origin.y, wz = p.z - origin.z;
        const t = wx * d.x + wy * d.y + wz * d.z;
        if (t < 0.05 || t > maxDist) return;
        const px = wx - d.x * t, py = wy - d.y * t, pz = wz - d.z * t;
        if (Math.hypot(px, py, pz) <= T && (!best || t < best.dist)) best = { caboId: c.id, index, dist: t };
      });
    });
    return best;
  }

  /** [19/09/2026 UTC] NOVO (RODADA 190) — liga/desliga a visibilidade das esferinhas dos pontos de
   *  controle manuais (`c.pontosExtras`) em TODOS os cabos. Pedido verbatim: "No modo 'Moldar cabo', deve
   *  ser possível reposicionar o cabo com as esferas nos nós aparecendo. Ao sair deste modo, as esferas
   *  dos nós deixam de aparecer e não dá mais pra 'moldar' o cabo." Chamado por `view3d-rede.js`
   *  (`_caboMoldarIniciar`/`_caboMoldarCancelar`) — o valor só é LIDO por `rebuildCabos` (que decide se
   *  desenha as esferinhas) e não afeta a geometria do cabo em si (a forma moldada continua valendo com
   *  o modo desligado, só a alça visual some — "não dá mais pra moldar" já é garantido separadamente pelo
   *  fato de `_caboMoldarClique`/`caboPontoExtraSob` só serem chamados com o modo ativo). */
  caboMoldarSetAtivo(ativo) {
    this._caboMoldarAtivo = !!ativo;
  }

  /** [19/09/2026 UTC] NOVO (RODADA 189) — atualização "ao vivo" de UM ÚNICO cabo (chamada a cada quadro
   *  enquanto o usuário arrasta um ponto de controle no gizmo de moldagem) — reconstrói só a geometria do
   *  TUBO daquele cabo (via `_caboRota`, a mesma rota usada por `rebuildCabos`, sem bunching/feixes, que só
   *  fazem sentido levando em conta TODOS os cabos de uma vez). Muito mais barato que `rebuildCabos()`
   *  inteiro a cada quadro — ao SOLTAR o ponto (fim do arraste), o chamador (view3d-rede.js) ainda chama
   *  `rebuildCabos()` uma vez pra reconciliar bunching/feixes com a nova forma do cabo. Os PLUGUES (caixinhas
   *  nas pontas) não precisam ser tocados — só dependem de `a`/`b`, que não mudam ao mover um ponto do meio. */
  caboAtualizarTuboVivo(caboId) {
    if (!this._cabosGroup || !this.mapData) return false;
    const THREE = this.THREE, RE = window.RedeEquip, RP = window.RedePassiva;
    const c = (this.mapData.cabos || []).find((x) => x.id === caboId); if (!c) return false;
    const objs = new Map((this.mapData.objects || []).map((o) => [o.id, o]));
    const aPiso = this.mapData?.alturaPiso || 2.8;
    const r = this._caboRota(c, objs, aPiso); if (!r) return false;
    // [19/09/2026 UTC] RODADA 192 -- `pts` (polilinha, usada pra comprimento/2D/`_cabosInfo`) respeita
    // `.reto` via `amostrarRotaComRetas`; a curva do TUBO (`curva`) é montada à parte, DIRETO de `r.ctrl`
    // (ver `_curvaDeRotaCabo`), pra um trecho reto ficar de fato reto (sem re-suavizar numa 2ª spline).
    const pts = RP ? RP.amostrarRotaComRetas(r.ctrl, 12) : r.ctrl;
    const curva = this._curvaDeRotaCabo(r.ctrl) || new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)), false, 'centripetal');
    const dMm = RE.diametroCabo(c), raio = Math.max(0.0012, dMm / 2000);
    const novaGeo = this._buildTuboEstavel(curva, Math.min(220, Math.max(24, pts.length * 2)), raio, 6);
    let tubo = null;
    this._cabosGroup.traverse((n) => { if (!tubo && n.isMesh && n.userData.caboId === caboId && n.geometry?.type === 'TubeGeometry') tubo = n; });
    if (!tubo) return false; // cabo ainda não tem malha (ex.: acabou de ser criado) -- o próximo rebuildCabos() completo resolve
    tubo.geometry.dispose();
    tubo.geometry = novaGeo;
    // mantém `_cabosInfo` (usado por `redeCaboSob`/BOM) coerente durante o arraste, não só depois do rebuild.
    if (this._cabosInfo && this._cabosInfo.has(caboId)) {
      const info = this._cabosInfo.get(caboId);
      info.pts = pts;
      info.comprimentoM = RP ? RP.comprimentoPolilinha(pts) : info.comprimentoM;
    }
    // [19/09/2026 UTC] NOVO (RODADA 189) -- reposiciona/cria/remove as esferinhas dos pontos de controle
    // manuais deste cabo em sincronia com `c.pontosExtras` — cobre os 3 casos que acontecem ao vivo
    // durante o arraste: mover um índice existente (reposiciona), criar um novo (não existe malha ainda,
    // `caboInserirPontoExtra` só mexeu no array — cria aqui), e uma sobra de um `rebuildCabos()` anterior
    // que já não corresponde a nenhum índice atual (remove).
    const existentes = new Map();
    this._cabosGroup.traverse((n) => { if (n.isMesh && n.userData.caboId === caboId && n.userData.pontoExtraIndex != null) existentes.set(n.userData.pontoExtraIndex, n); });
    const extras = Array.isArray(c.pontosExtras) ? c.pontosExtras : [];
    extras.forEach((p, idx) => {
      let no = existentes.get(idx);
      if (!no) {
        no = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.02, raio * 2.6), 8, 6), new THREE.MeshBasicMaterial({ color: p.reto ? 0xff8c1a : 0xffe066, depthTest: false }));
        no.renderOrder = 997;
        no.userData.caboId = caboId; no.userData.pontoExtraIndex = idx;
        this._cabosGroup.add(no);
      } else existentes.delete(idx);
      no.position.set(p.x, p.y, p.z);
      // [19/09/2026 UTC] RODADA 192 -- reflete o flag `.reto` mesmo num nó já existente (ex.: logo
      // após a tecla B alternar o flag em "Moldar cabo" -- ver view3d-rede.js), sem esperar um
      // `rebuildCabos()` completo pra a cor da bolinha mudar.
      const corAlvo = p.reto ? 0xff8c1a : 0xffe066;
      if (no.material && no.material.color && no.material.color.getHex() !== corAlvo) no.material.color.setHex(corAlvo);
    });
    existentes.forEach((n) => { this._cabosGroup.remove(n); n.geometry.dispose(); n.material.dispose(); });
    return true;
  }

  /** Reconstroi TODOS os cabos (RODADA 167 — v2): spline dinamica Porta A -> Porta B com (a) zonas de passagem
   *  das guias de cabo, (c) BUNCHING por abracadeiras (velcro/
   *  nylon), (d) diametro real do cabo (Cat5e..7 / fibras), (e) `length` conferido (cabo curto = vermelho). */
  /** [19/09/2026 UTC] NOVO (RODADA 200) — pedido verbatim do usuario (prompt de "decapagem virtual" na
   *  traseira de um Patch Panel): decompoe visualmente o cabo `c` nos 8 fios/pares individuais entre um
   *  "ponto de ruptura" (onde a capa externa termina, `RUPTURA_MM` antes do bloco IDC/jack RJ45 traseiro) e
   *  o pino exato (1..8, ordem T568A/T568B) daquele bloco -- só desenhado quando a PONTA em questao e um
   *  equipamento com jacks RJ45 fisicos na traseira (familia 'patchpanel'/'tomada', ver `pinosRJ45`/
   *  `pinoLocalRJ45` em rede-equip.js). Reaproveita `_buildTuboEstavel` (RODADA 195 — NAO usa
   *  `THREE.TubeGeometry` puro, pedido explicito do usuario nesta mesma rodada de manter o metodo atual em
   *  vez do "modo de renderizacao padrao" do Three.js) com raio bem fino (0,6 mm, fio de cobre 24 AWG real)
   *  e poucos segmentos (10) — 8 fios x poucos triangulos cada e desprezivel mesmo com dezenas de cabos por
   *  rack (o pedido explicito de performance foi "nao sobrecarregar a GPU com milhares de poligonos"). Fios
   *  com nome "branco-X" ganham uma 2a malha bem fina por cima (a listra branca) — aproximacao barata em vez
   *  de textura/UV por fio, mas visualmente distingue os 4 pares a olho, que é o que importa aqui. */
  _redeRenderRearCrimping(g, obj, porta, cabo, padrao) {
    const THREE = this.THREE, RE = window.RedeEquip;
    if (!RE || !RE.pinosRJ45 || !RE.pinoLocalRJ45) return;
    const spec = RE.especificar(obj.tipo), p = spec && spec.portaPorN[porta];
    // 'keystone' = tipo de porta usado por patch panel/tomada no catalogo (ver `especificar`/`_especPatch`/
    // `_especTomada`) -- é sempre cobre RJ45 fêmea (a família toda só tem cobre; óptica é outra família,
    // 'dio'), então não existe aqui o caso 'sfp'/'lc' (esses só existem em switch/DIO, que não chegam nesta
    // função -- ver o filtro por família em `rebuildCabos`).
    if (!p || p.tipo !== 'keystone') return;
    const F = spec.profundidade / 2;
    const RUPTURA_MM = 35; // ~3,5cm antes do bloco -- onde a capa externa do cabo "acaba" e os 4 pares se abrem (pedido: "3 a 5cm")
    // [19/09/2026 UTC] RODADA 204 -- CORRIGIDO: `pontoRuptura`/`alvo` usavam `-(spec.profundidade + ...)`,
    // medindo a partir da FRENTE de TODA a peça (bem além do bloco IDC/jack real -- ver comentário
    // equivalente em `_redePortaMundoLado`). Agora ambos usam `_redeZConectorTras` (a coordenada Z real
    // do conector) como referência: `alvo` (cada pino) fica EXATAMENTE nessa profundidade, e
    // `pontoRuptura` fica só RUPTURA_MM antes dela.
    const zConector = this._redeZConectorTras(spec);
    const pontoRuptura = this._redePontoMundo(obj, p.x, p.y, (zConector - RUPTURA_MM) - F);
    if (!pontoRuptura) return;
    const raio = 0.0006; // ~1,2mm de diametro -- fio 24 AWG isolado, dentro da faixa real (0,5-0,6mm de condutor + isolamento)
    RE.pinosRJ45(padrao).forEach((info) => {
      const local = RE.pinoLocalRJ45(p.x, p.y, info.pino);
      const alvo = this._redePontoMundo(obj, local.x, local.y, zConector - F);
      if (!alvo) return;
      // ponto intermediario um pouco "acima" (mais y) da reta ruptura->pino -- puro efeito visual de "fio
      // solto/curvo" entre a capa e o bloco (um fio real nunca fica esticado feito corda de violao aqui).
      const meio = new THREE.Vector3((pontoRuptura.x + alvo.x) / 2, Math.max(pontoRuptura.y, alvo.y) + 0.004, (pontoRuptura.z + alvo.z) / 2);
      const curva = new THREE.CatmullRomCurve3([
        new THREE.Vector3(pontoRuptura.x, pontoRuptura.y, pontoRuptura.z), meio, new THREE.Vector3(alvo.x, alvo.y, alvo.z),
      ], false, 'centripetal');
      const fio = new THREE.Mesh(this._buildTuboEstavel(curva, 10, raio, 5), new THREE.MeshLambertMaterial({ color: info.corHex }));
      fio.userData.caboId = cabo.id; fio.userData.pino = info.pino; fio.userData.par = info.nome;
      g.add(fio);
      if (info.listrado) {
        const listra = new THREE.Mesh(this._buildTuboEstavel(curva, 10, raio * 0.4, 4), new THREE.MeshBasicMaterial({ color: 0xf4f6f8 }));
        listra.userData.caboId = cabo.id;
        g.add(listra);
      }
    });
  }

  rebuildCabos() {
    if (!this._ready || !this._group || !window.RedeEquip) return;
    const THREE = this.THREE, RE = window.RedeEquip, RP = window.RedePassiva;
    if (this._cabosGroup) {
      this._group.remove(this._cabosGroup);
      this._cabosGroup.traverse((n) => { if (n.isMesh) { n.geometry?.dispose?.(); n.material?.dispose?.(); } });
      this._cabosGroup = null;
    }
    this._cabosInfo = new Map();
    if (window.RackCableRouting) window.RackCableRouting.limparCache();
    const cabos = this.mapData?.cabos;
    this._feixes = [];
    if (!Array.isArray(cabos) || !cabos.length) return;
    const g = new THREE.Group(); g.name = 'cabos-rede';
    const objs = new Map((this.mapData.objects || []).map((o) => [o.id, o]));
    const aPiso = this.mapData?.alturaPiso || 2.8;
    // 1) rotas (amostradas)
    const rotas = [], meta = new Map();
    cabos.forEach((c) => {
      // [19/09/2026 UTC] NOVO (RODADA 200) -- try/catch por-cabo tambem AQUI (nao só na etapa "3) malhas",
      // ver comentário da RODADA 174 logo abaixo): uma excecao dentro de `_caboRota`/`_redeZonasGuia` (ex.:
      // o bug real desta mesma rodada, uma zona com coordenada NaN por causa de `p.nx` inexistente)
      // interrompia este `forEach` INTEIRO sem nenhum aviso -- nenhum cabo depois do primeiro problemático
      // chegava a ganhar rota, e por isso "sumiam" TODOS de uma vez (nao só o cabo com o problema), incluindo
      // cabos sem nenhuma relação com patch panel/rack. Reproduz aqui, na etapa de ROTA, a mesma defesa que
      // já existia na etapa de MALHA -- agora as duas etapas são resilientes a um cabo problemático.
      try {
      const r = this._caboRota(c, objs, aPiso);
      if (!r) return;
      const { A, B, a, b, pa, pb, ctrl } = r;
      const dMm = RE.diametroCabo(c);
      // [19/09/2026 UTC] RODADA 192 -- `amostrarSpline` trocado por `amostrarRotaComRetas` pra
      // respeitar `.reto` (bézier/linha reta por trecho) já na polilinha usada pro bunching/comprimento.
      const pts = RP ? RP.amostrarRotaComRetas(ctrl, 12) : ctrl;
      rotas.push({ id: c.id, pts, ctrl, diametroMm: dMm });
      meta.set(c.id, { c, a, b, pa, pb, dMm, A, B }); // A/B (RODADA 200) -- objetos das pontas, p/ crimpagem traseira
      } catch (e) { console.error('rebuildCabos: falha ao calcular a rota do cabo ' + c.id + ' -- pulado, os demais continuam.', e); }
    });
    // 2) bunching por abracadeiras
    let feixes = [], finais = rotas;
    if (RP && rotas.length > 1) {
      const cintas = [];
      objs.forEach((o) => {
        if (o.tipo !== 'abracadeira_velcro' && o.tipo !== 'abracadeira_nylon') return;
        cintas.push({ id: o.id, x: o.x, y: (o.piso || 0) * aPiso + (o.elevacao || 0) + 0.015, z: o.y, captura: 0.12 });
      });
      if (cintas.length) { const r = RP.agruparFeixes(rotas, cintas, { janela: 6 }); finais = r.rotas; feixes = r.feixes; }
    }
    // 3) malhas
    finais.forEach((r) => {
      const m = meta.get(r.id); if (!m) return;
      // [19/09/2026 UTC] NOVO (RODADA 174) -- try/catch por-cabo: um ponto/geometria problemática
      // NUNCA mais derruba o `forEach` inteiro (era a causa mais provável de "todos os cabos
      // sumiram" na RODADA 172) -- na pior hipótese, este UM cabo específico não é desenhado, e um
      // aviso fica no console pra investigar depois.
      try {
      const c = m.c, fibra = String(c.tipo || '').startsWith('fibra');
      const comp = RP ? RP.comprimentoPolilinha(r.pts) : 0;
      const esticado = c.length > 0 && comp > c.length + 1e-6;
      this._cabosInfo.set(c.id, { comprimentoM: comp, esticado, pts: r.pts, diametroMm: m.dMm });
      const cor = new THREE.Color(c.cor || '#2f6fdb'); // RODADA 221 -- revertido de #6fa8dc (RODADA 220) para o azul original
      if (esticado) cor.lerp(new THREE.Color(0xff2d2d), 0.65);
      // [20/09/2026 UTC] CORRIGIDO (RODADA 221) -- pedido verbatim: "olhando o cabo de frente o aspecto
      // acaba sendo escurecido". CAUSA RAIZ: `MeshLambertMaterial` é 100% dependente de N·L (só reage à
      // luz direcional/hemisférica da cena, que aqui roda com intensidades baixas, ver `_hemiLight`/
      // `_ambientLight` em `_initThree` e `_atualizarCeu`) -- SEM nenhum piso mínimo de brilho. Num tubo
      // (superfície continuamente curva), a normal do lado que fica de frente pra câmera é quase sempre
      // bem diferente da normal que aponta pra luz principal -- N·L cai perto de zero exatamente nesse
      // lado "de frente", ficando escuro mesmo a cor base sendo a correta. Um painel plano raramente
      // mostra esse efeito porque o usuário só o vê de um ângulo já favorável à luz; um cabo cilíndrico
      // é visto de TODOS os ângulos ao redor do seu próprio eixo. CORRIGIDO: soma-se um `emissive` sutil
      // (20% da própria cor do cabo) só pra dar um piso de brilho que nunca deixa o lado "sem luz direta"
      // cair a preto -- não deixa o cabo "brilhando" (20% é abaixo do que a luz direta já entrega no lado
      // iluminado), só evita o contraste extremo entre o lado bem-iluminado e o lado de frente à câmera.
      const mat = new THREE.MeshLambertMaterial({ color: cor, emissive: cor.clone().multiplyScalar(0.2) });
      // [19/09/2026 UTC] CORRIGIDO (RODADA 189) -- 'catmullrom' (parametrização uniforme) trocado por
      // 'centripetal' pela mesma razão documentada em `RedePassiva.amostrarSpline` (evita overshoot em
      // pontos de controle desigualmente espaçados) -- esta 2ª passada roda sobre `vs`, que já veio
      // amostrado (denso e quase uniformemente espaçado) por `amostrarSpline`, então o efeito aqui é
      // pequeno na prática, mas mantém as 2 passadas consistentes em vez de misturar 2 parametrizações.
      // [19/09/2026 UTC] RODADA 192 -- quando não houve bunching (`r.ctrl` ainda disponível), a curva do
      // tubo é montada DIRETO dos pontos de controle via `_curvaDeRotaCabo` (respeita `.reto` -- trecho
      // reto fica reto de verdade). Com bunching, `r.ctrl` não sobrevive a `agruparFeixes` (as amostras já
      // foram puxadas em direção às cintas), então cai no comportamento de sempre (spline sobre `r.pts`).
      const curva = (r.ctrl && this._curvaDeRotaCabo(r.ctrl))
        || new THREE.CatmullRomCurve3(r.pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)), false, 'centripetal');
      const raio = Math.max(0.0012, m.dMm / 2000);
      const tubo = new THREE.Mesh(this._buildTuboEstavel(curva, Math.min(220, Math.max(24, r.pts.length * 2)), raio, 6), mat);
      tubo.userData.caboId = c.id;
      g.add(tubo);
      // [19/09/2026 UTC] AMPLIADO (RODADA 201) -- pedido verbatim do usuario: a caixinha de plugue RJ45
      // macho SÓ aparece do lado 'frente' (comportamento de sempre); do lado 'tras' (só existe em porta
      // keystone), em vez da caixinha, entram os 8 fios individuais (bloco abaixo) -- ANTES (RODADA 200)
      // isso era decidido automaticamente pela FAMÍLIA do equipamento (sempre que uma ponta era patch
      // panel/tomada), o que impedia ligar um patch cord na FRENTE de um patch panel (uso real mais comum)
      // sem também ganhar o desenho dos 8 fios -- agora depende só do `lado` que o usuário escolheu ao
      // ligar o cabo (`cabo.de.lado`/`cabo.para.lado`, ver `RedeEquip.conectar`/view3d-rede.js "Ligar cabo").
      [[m.a, m.pa, c.de.lado], [m.b, m.pb, c.para.lado]].forEach(([ext, p, lado]) => {
        if (lado === 'tras') return;
        const plug = new THREE.Mesh(new THREE.BoxGeometry(fibra ? 0.0085 : 0.0125, fibra ? 0.0055 : 0.0095, 0.022), mat);
        plug.position.set(p.x + ext.nx * 0.011, p.y, p.z + ext.nz * 0.011);
        plug.rotation.y = ext.rotY; plug.userData.caboId = c.id;
        g.add(plug);
      });
      // [19/09/2026 UTC] AMPLIADO (RODADA 201) -- "decapagem virtual" na traseira: só desenhada quando o
      // USUÁRIO escolheu explicitamente ligar aquela ponta na TRASEIRA da porta (`lado === 'tras'`, só
      // possível em porta keystone -- ver validação em `RedeEquip.conectar`), nunca mais automaticamente
      // pela família do equipamento -- só visível "olhando por dentro"/por trás do patch panel ou do
      // espelho, exatamente como o usuário descreveu (a posição 3D dos fios já fica atrás do corpo físico
      // do equipamento, então a própria malha do equipamento naturalmente os esconde de quem olha de
      // frente -- nenhuma lógica de visibilidade extra precisou ser criada pra isso).
      if (!fibra && c.tipo !== 'console' && c.tipo !== 'energia') {
        [[m.A, c.de.porta, c.de.lado, c.padrao568A], [m.B, c.para.porta, c.para.lado, c.padrao568B]].forEach(([eq, porta, lado, padrao]) => {
          if (lado !== 'tras') return;
          try { this._redeRenderRearCrimping(g, eq, porta, c, padrao); } catch (e) { /* nao derruba os demais cabos */ }
        });
      }
      // [19/09/2026 UTC] NOVO (RODADA 189, gate por modo na RODADA 190) -- esferinha visível em cada
      // ponto de controle manual (`c.pontosExtras`, ver "Moldar cabo" em view3d-rede.js) -- sem elas, não
      // haveria NADA pra o usuário mirar/clicar pra pegar um nó já existente (`Engine3D.caboPontoExtraSob`
      // só faz a conta geométrica, não desenha nada sozinho). `MeshBasicMaterial` (não recebe sombra/luz)
      // pra ficar sempre bem visível — são um controle de EDIÇÃO, não parte do cabo de verdade, por isso
      // só aparecem com `this._caboMoldarAtivo` ligado (pedido verbatim RODADA 190: "Ao sair deste modo,
      // as esferas dos nós deixam de aparecer") — a FORMA do cabo (a geometria moldada em si) continua
      // valendo com o modo desligado, só a alça visual some.
      if (this._caboMoldarAtivo && Array.isArray(c.pontosExtras) && c.pontosExtras.length) {
        // [19/09/2026 UTC] RODADA 192 -- pedido verbatim: "a cor da bolinha pode ficar diferente
        // [entre bézier/reta]" -- amarelo (0xffe066, cor de sempre) = trecho seguinte em curva (bézier);
        // laranja (0xff8c1a) = trecho seguinte reto (`.reto === true`, alternado pela tecla B em
        // "Moldar cabo", ver view3d-rede.js). Dois materiais (não um por nó) por barateza.
        const matNoCurva = new THREE.MeshBasicMaterial({ color: 0xffe066, depthTest: false });
        const matNoReto = new THREE.MeshBasicMaterial({ color: 0xff8c1a, depthTest: false });
        c.pontosExtras.forEach((p, idx) => {
          const no = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.02, raio * 2.6), 8, 6), p.reto ? matNoReto : matNoCurva);
          no.position.set(p.x, p.y, p.z);
          no.renderOrder = 997;
          no.userData.caboId = c.id; no.userData.pontoExtraIndex = idx;
          g.add(no);
        });
      }
      } catch (e) { console.error('rebuildCabos: falha ao desenhar o cabo ' + (m.c && m.c.id) + ' -- pulado, os demais continuam.', e); }
    });
    // 4) aneis dos feixes (a "cinta" consolidada)
    feixes.forEach((f) => {
      const r0 = finais.find((r) => r.id === f.cabos[0]); if (!r0) return;
      let bi = 0, bd = 1e9; r0.pts.forEach((p, i) => { const d = Math.hypot(p.x - f.centro.x, p.y - f.centro.y, p.z - f.centro.z); if (d < bd) { bd = d; bi = i; } });
      const p0 = r0.pts[Math.max(0, bi - 1)], p1 = r0.pts[Math.min(r0.pts.length - 1, bi + 1)];
      const tan = new THREE.Vector3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z).normalize();
      const R = Math.max(0.004, f.diametroMm / 2000 + 0.0012);
      const anel = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0016, 8, 20), new THREE.MeshLambertMaterial({ color: 0x1e2126 }));
      anel.position.set(f.centro.x, f.centro.y, f.centro.z);
      anel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      anel.userData.feixe = f;
      g.add(anel);
    });
    // 5) [19/09/2026 UTC] NOVO (RODADA 205) -- ORGANIZAÇÃO EM CHICOTES (opt-in, `rack.chicoteHabilitado`
    // via `RackModular.patchChicoteHabilitado`, ver ressalva/escopo no comentário de
    // `_redeRenderChicotesDoRack`). Só entra em jogo por rack, sem afetar racks sem a opção ligada, nem
    // os cabos individuais já desenhados acima (que continuam sendo desenhados normalmente -- este passo
    // é uma camada ADICIONAL, um "super feixe" visual ao longo da guia vertical do rack).
    try { this._redeRenderChicotesTodos(g, objs); } catch (e) { console.error('rebuildCabos: falha ao desenhar chicotes/super feixe -- ignorado.', e); }
    this._feixes = feixes;
    this._cabosGroup = g;
    this._group.add(g);
  }

  /** [19/09/2026 UTC] NOVO (RODADA 205) -- percorre todos os racks do mapa com `rackChicoteHabilitado`
   *  ligado e desenha o super feixe vertical de cada guia (esq/dir). */
  _redeRenderChicotesTodos(g, objs) {
    const RE = window.RedeEquip, RM = window.RackModular;
    if (!RE || !RM || !RE.generateRearChicote || !RE.generateSuperFeixeVertical) return;
    objs.forEach((rackObj) => {
      if (rackObj.tipo !== 'rack' || !rackObj.rackChicoteHabilitado) return;
      if (window.RackCableRouting && window.RackCableRouting.ativo(rackObj)) return; // roteamento por rack ja desenha o super feixe
      try { this._redeRenderChicotesDoRack(g, rackObj, objs); } catch (e) { console.error('chicote do rack ' + rackObj.id + ' -- ignorado.', e); }
    });
  }

  /**
   * [19/09/2026 UTC] NOVO (RODADA 205) -- pedido verbatim ("Engenheiro de Software Principal"):
   * organização traseira em chicotes (requisito 1) + super feixe vertical (requisito 2) + validação
   * física da saída de cabos (requisito 4). A ORGANIZAÇÃO/AGRUPAMENTO em si (que porta vai em qual
   * chicote, diâmetro equivalente por área) é `RedeEquip.generateRearChicote`/`generateSuperFeixeVertical`
   * (lógica pura, rede-equip.js) -- esta função só faz a parte VISUAL: um tubo curto por chicote (do
   * conjunto de portas até um "nó de convergência" perto da barra guia traseira do patch panel) + UM
   * tubo grosso vertical por guia (esq/dir) representando o super feixe, do nível do chicote mais baixo
   * até a abertura escolhida (topo/base, conforme `rack.cableEntry`).
   *
   * ESCOPO/LIMITAÇÃO HONESTA (ver changelog): isto é uma APROXIMAÇÃO visual aditiva -- os cabos
   * individuais continuam sendo desenhados normalmente por `rebuildCabos` (não são escondidos/removidos
   * quando entram num chicote); fundir de verdade as malhas dos cabos individuais num único buffer
   * geométrico (como o pedido original descreve) exigiria reescrever o pipeline de rota por cabo, fora
   * do escopo que deu pra cobrir nesta rodada. Cada guia vertical é aproximada pelas 2 colunas ±205mm
   * (mesma distância X já usada pela barra guia de cabos do patch panel, `spec.barra`/`_redeZonasGuia`)
   * relativas ao CENTRO do rack, não um objeto físico "guia_v" separado (esse é um acessório opcional
   * que o usuário posiciona à parte, sem vínculo automático com o rack).
   */
  _redeRenderChicotesDoRack(g, rackObj, objs) {
    const THREE = this.THREE, RE = window.RedeEquip, RM = window.RackModular;
    // `window.RackModular` É a própria classe (ver rodapé de rack-modular.js: `raiz.RackModular = RackModular`).
    const r = RM.fromObjeto ? RM.fromObjeto(rackObj) : null;
    if (!r) return;
    const patchPaineis = RE.equipDoRack(this.mapData, rackObj.id).filter((o) => { const sp = RE.especificar(o.tipo); return sp && sp.familia === 'patchpanel'; });
    if (!patchPaineis.length) return;
    const chicotesDoRack = [].concat(...patchPaineis.map((pp) => RE.generateRearChicote(this.mapData, pp)));
    if (!chicotesDoRack.length) return;
    const superFeixe = RE.generateSuperFeixeVertical(chicotesDoRack);
    // Validação física (requisito 4) -- roda 1x por rebuild; se der erro, o super feixe fica
    // vermelho e um toast avisa (throttle simples pra não empilhar toasts a cada rebuild).
    const validacao = RM.validateRackCableExit ? RM.validateRackCableExit(rackObj) : { ok: true, alertas: [] };
    if (!validacao.ok) {
      this._chicoteAlertados = this._chicoteAlertados || new Set();
      if (!this._chicoteAlertados.has(rackObj.id)) {
        this._chicoteAlertados.add(rackObj.id);
        validacao.alertas.forEach((a) => window.Utils?.toast?.('⚠️ ' + a.mensagem, { type: 'danger', duration: 6000 }));
      }
    } else if (this._chicoteAlertados) this._chicoteAlertados.delete(rackObj.id);

    // ---- pontos (mundo) de cada chicote: convergem no ponto médio das portas do grupo, na
    // profundidade da barra guia traseira (mesma referência de `_redeZonasGuia`/`spec.barra`). ----
    const matChicote = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
    const matSuperFeixeErro = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x330000 });
    chicotesDoRack.forEach((grupo) => {
      if (!grupo.cabos.length) return;
      // `grupo.id` = "<idDoPatchPanel>_chicote_N" (ver `RedeEquip.generateRearChicote`) -- extrai o id
      // de volta pra achar o objeto certo (um rack pode ter mais de 1 patch panel).
      const ppId = grupo.id.slice(0, grupo.id.lastIndexOf('_chicote_'));
      const eq = objs.get(ppId) || patchPaineis[0];
      const pontos = grupo.portas.map((n) => this._redePortaMundoConectorTras ? this._redePortaMundoConectorTras(eq, n) : null).filter(Boolean);
      if (!pontos.length) return;
      const centro = pontos.reduce((s, p) => ({ x: s.x + p.x / pontos.length, y: s.y + p.y / pontos.length, z: s.z + p.z / pontos.length }), { x: 0, y: 0, z: 0 });
      const raio = Math.max(0.0015, grupo.diametroMm / 2000);
      pontos.forEach((p) => {
        const curva = new THREE.LineCurve3(new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(centro.x, centro.y, centro.z));
        const raioFio = Math.max(0.0012, RE.diametroCabo(grupo.cabos[0]) / 2000);
        g.add(new THREE.Mesh(this._buildTuboEstavel(curva, 6, raioFio, 5), matChicote));
      });
      grupo._pontoConvergencia = centro; grupo._raio = raio;
    });
    // ---- super feixe vertical: 1 tubo por guia (esq/dir), do chicote mais baixo até a abertura. ----
    const K = 0.001, rotY = objAnguloToRotY(rackObj.angulo), cos = Math.cos(rotY), sin = Math.sin(rotY);
    const baseY = (rackObj.piso || 0) * (this.mapData?.alturaPiso || 2.8) + (rackObj.elevacao || 0);
    const alturaTotalM = (r.dim ? r.dim.alturaTotal : 2000) * K, baseM = (r.dim ? r.dim.base : 50) * K, tetoM = (r.dim ? r.dim.teto : 50) * K;
    const yTopo = baseY + alturaTotalM - tetoM / 2, yBase = baseY + baseM / 2;
    ['esq', 'dir'].forEach((calha) => {
      const dados = superFeixe[calha];
      if (!dados || !dados.cabos.length) return;
      const gruposCalha = chicotesDoRack.filter((c) => c.calha === calha && c._pontoConvergencia);
      if (!gruposCalha.length) return;
      const yInicio = Math.min(...gruposCalha.map((c) => c._pontoConvergencia.y));
      const xLocal = (calha === 'esq' ? -1 : 1) * 0.205, zLocal = -0.3; // ±205mm/300mm: mesma referência da barra guia (spec.barra)
      const xMundo = rackObj.x + xLocal * cos + zLocal * sin, zMundo = rackObj.y - xLocal * sin + zLocal * cos;
      const yFim = rackObj.rackCableEntry === 'top' ? yTopo : rackObj.rackCableEntry === 'bottom' ? yBase : yInicio;
      const raioFeixe = Math.max(0.003, dados.diametroMm / 2000);
      const mat = (!validacao.ok) ? matSuperFeixeErro : matChicote;
      const curva = new THREE.LineCurve3(new THREE.Vector3(xMundo, yInicio, zMundo), new THREE.Vector3(xMundo, yFim, zMundo));
      const tubo = new THREE.Mesh(this._buildTuboEstavel(curva, 8, raioFeixe, 8), mat);
      tubo.userData.superFeixeRackId = rackObj.id; tubo.userData.calha = calha;
      g.add(tubo);
    });
  }

  /** Cabo mais proximo do RAIO (origem/direcao em MUNDO) num alcance `maxDist`, com tolerancia lateral `tol` (m):
   *  { caboId, dist }. Amostra as polilinhas guardadas em `_cabosInfo` (barato; o tubo fino de 3 mm e dificil de mirar). */
  redeCaboSob(origin, dir, maxDist, tol) {
    if (!this._cabosInfo || !this._cabosInfo.size) return null;
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1, d = { x: dir.x / dl, y: dir.y / dl, z: dir.z / dl };
    const T = tol || 0.035;
    let best = null;
    for (const [id, info] of this._cabosInfo) {
      const P = info.pts;
      for (let i = 0; i < P.length - 1; i++) {
        // Distancia entre o RAIO (o + t d, t >= 0) e o SEGMENTO P[i]..P[i+1] (ponto mais proximo de duas retas, com clamp).
        const a = P[i], b = P[i + 1], ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = a.x - origin.x, wy = a.y - origin.y, wz = a.z - origin.z;
        const uu = ux * ux + uy * uy + uz * uz, ud = ux * d.x + uy * d.y + uz * d.z, uw = ux * wx + uy * wy + uz * wz, dw = d.x * wx + d.y * wy + d.z * wz;
        const den = uu - ud * ud;
        // minimos quadrados: D + s*A - t*B = 0 e t = E + s*B  =>  s = (B*E - D) / (A - B^2)  (B = ud, E = dw, D = uw, A = uu)
        let sN = den > 1e-12 ? (ud * dw - uw) / den : 0; if (!(sN >= 0)) sN = 0; if (sN > 1) sN = 1;
        const qx = a.x + ux * sN - origin.x, qy = a.y + uy * sN - origin.y, qz = a.z + uz * sN - origin.z;
        const t = qx * d.x + qy * d.y + qz * d.z;
        if (t < 0.1 || t > maxDist) continue;
        const px = qx - d.x * t, py = qy - d.y * t, pz = qz - d.z * t;
        if (Math.hypot(px, py, pz) <= T && (!best || t < best.dist)) best = { caboId: id, dist: t };
      }
    }
    return best;
  }

  // ==========================================================================
  // [18/09/2026 UTC] RODADA 167 -- PEGAR E CARREGAR equipamento de rede (View3D, tecla E).
  // O item sai da cena "normal" (deixa de ser alvo dos raios), acompanha a mira/o personagem e pode ser
  // pousado no chao, sobre uma mesa/rack ou ENCAIXADO numa U do rack (snap magnetico com previa).
  // ==========================================================================

  /** Item de rede sob a mira que pode ser pego (dentro do `alcance`), ou null. */
  redeAlvoParaPegar(origin, dir, alcance) {
    const RE = window.RedeEquip; if (!RE) return null;
    const a = this.redeAlvoSob(origin, dir);
    if (!a || a.kind !== 'rede' || !a.obj || a.dist > (alcance || 3.5)) return null;
    return RE.ehEquipRede(a.obj.tipo) ? a.obj : null;
  }

  /** Comeca a carregar `obj`: tira suas malhas dos raios (senao a mira "bateria" nele mesmo). */
  redeCarregarIniciar(obj) {
    const rt = this._redeRuntime?.get(obj?.id); if (!rt) return false;
    this._pickMeshes = this._pickMeshes.filter((m) => m.userData?.redeObj !== obj);
    this.pickables = this.pickables.filter((p) => p?.ref !== obj);
    if (rt.custom) {   // objeto modelado: a malha editada acompanha a raiz (ghost com a forma atual e a mesma tinta)
      this._pickMeshes = this._pickMeshes.filter((m) => m !== rt.custom);
      rt.root.add(rt.custom);
      rt.custom.position.set(0, rt.customLocalY || 0, 0);
      rt.custom.scale.set(1, 1, 1);
      rt.custom.rotation.set(0, rt.customRotY || 0, 0);
      rt.custom.updateMatrixWorld(true);
    }
    this._redeCarga = { id: obj.id, zOffMm: null };
    this._redeCargaOcultos = null; this._redeCargaCaboT = 0;
    rt.carregando = true;
    return true;
  }

  /** Termina o modo carregar (o chamador faz `rebuildObjectIncremental` para recolocar as malhas nos raios). */
  redeCarregarFim(obj) {
    this._redeCarga = null; this._redeCargaOcultos = null;
    const rt = this._redeRuntime?.get(obj?.id); if (rt) rt.carregando = false;
  }

  _redeTingir(rt, hex) {
    rt.root.traverse((m) => {
      if (!m.isMesh || !m.material || !m.material.emissive) return;
      const mm = Array.isArray(m.material) ? m.material : [m.material];
      mm.forEach((mt) => { if (mt.emissive) { if (mt.userData._em0 == null) mt.userData._em0 = mt.emissive.getHex(); mt.emissive.setHex(hex == null ? mt.userData._em0 : hex); } });
    });
  }

  /**
   * Calcula ONDE o item carregado ficaria para o raio da mira. Retorna
   *  { modo: 'mao'|'chao'|'apoio'|'rack'|'rack-cheio', x, z, y (mundo, base do item), angulo, elevacao (m, rel. ao piso),
   *    rack?, u?, yRelMm? }.
   * cfg: { alcance (m), extraAng (rad, tecla R), passoAng (rad) }
   */
  redeCarregarAlvo(obj, ray, cfg) {
    const RE = window.RedeEquip, RM = window.RackModular;
    cfg = cfg || {};
    const alcance = cfg.alcance || 4, K = 0.001, aPiso = this.mapData?.alturaPiso || 2.8, pisoBase = (obj.piso || 0) * aPiso;
    const o = ray.origin, d = ray.dir, dl = Math.hypot(d.x, d.y, d.z) || 1, dn = { x: d.x / dl, y: d.y / dl, z: d.z / dl };
    let hit = this.raycastSurface(o, dn);
    // Andar acima do terreo: o "chao" e o plano da laje do proprio andar (raycastSurface so conhece y=0).
    if (pisoBase > 1e-6 && (!hit || (hit.restingOnId == null && hit.y <= 1e-6))) {
      const ph = this.raycastPlaneY(o, dn, pisoBase);
      if (ph && (!hit || ph.t < hit.t + 1e-6 || hit.y <= 1e-6)) hit = { x: ph.x, y: pisoBase, z: ph.z, t: ph.t, restingOnId: null };
    }
    const dh = Math.hypot(dn.x, dn.z) || 1;
    const passo = cfg.passoAng || Math.PI / 12;
    const anguloParaJogador = (Math.round((Math.atan2(dn.x / dh, dn.z / dh)) / passo) * passo);   // frente do item voltada ao jogador
    // valor de `obj.angulo` = -rotY ; rotY = atan2(-dx,-dz) = atan2(dx,dz) + PI
    const angulo = -(anguloParaJogador + Math.PI) + (cfg.extraAng || 0);

    // ---- 1) encaixe no rack ----
    if (RM && RE.ehRackavel(obj.tipo)) {
      let melhor = null;
      (this.mapData?.objects || []).forEach((rack) => {
        if (rack.tipo !== 'rack' || (rack.piso || 0) !== (obj.piso || 0)) return;
        if (Math.hypot(rack.x - o.x, rack.y - o.z) > alcance + 1) return;
        let r; try { r = RM.fromObjeto(rack); } catch (e) { return; }
        const rot = objAnguloToRotY(rack.angulo), c = Math.cos(rot), s = Math.sin(rot);
        const baseR = pisoBase + (rack.elevacao || 0);
        const dx = o.x - rack.x, dz = o.z - rack.y;
        const lo = { x: dx * c - dz * s, y: o.y - baseR, z: dx * s + dz * c }, ld = { x: dn.x * c - dn.z * s, y: dn.y, z: dn.x * s + dn.z * c };
        if (ld.z > -1e-6) return;
        const zf = r.planoMontagem.frontalZ * K, t = (zf - lo.z) / ld.z;
        if (t <= 0 || t > alcance) return;
        if (hit && t > hit.t + 0.6) return;
        const px = lo.x + ld.x * t, py = lo.y + ld.y * t;
        if (Math.abs(px) > 0.29 || py < -0.02 || py > (rack.altura || 2) + 0.05) return;
        if (!melhor || t < melhor.t) melhor = { rack, t, py, rot, baseR };
      });
      if (melhor) {
        const pv = RE.previaNoRack(this.mapData, melhor.rack, obj, melhor.py * 1000);
        if (pv.ok) {
          return { modo: 'rack', rack: melhor.rack, u: pv.u, x: melhor.rack.x, z: melhor.rack.y, y: pisoBase + pv.elevacao, elevacao: pv.elevacao, angulo: melhor.rack.angulo || 0, yRelMm: melhor.py * 1000 };
        }
        // sem U livre ali: mostra na altura mirada, em vermelho, e nao deixa soltar
        return { modo: 'rack-cheio', rack: melhor.rack, x: melhor.rack.x, z: melhor.rack.y, y: melhor.baseR + Math.max(0, melhor.py - 0.022), elevacao: (melhor.rack.elevacao || 0) + Math.max(0, melhor.py - 0.022), angulo: melhor.rack.angulo || 0 };
      }
    }
    // ---- 2) superficie (chao / mesa / topo de rack) ao alcance ----
    if (hit && hit.t <= alcance) {
      return { modo: hit.restingOnId ? 'apoio' : 'chao', x: hit.x, z: hit.z, y: hit.y, elevacao: hit.y - pisoBase, angulo };
    }
    // ---- 3) na mao: a frente do jogador, abaixo da altura dos olhos ----
    const px = o.x + (dn.x / dh) * 0.8, pz = o.z + (dn.z / dh) * 0.8, y = o.y - 0.5;
    return { modo: 'mao', x: px, z: pz, y, elevacao: y - pisoBase, angulo };
  }

  /** Aplica o estado calculado por `redeCarregarAlvo` ao item carregado (malha + dados em memoria + cabos). */
  redeCarregarAplicar(obj, est) {
    const rt = this._redeRuntime?.get(obj?.id); if (!rt || !est) return;
    const RE = window.RedeEquip, RM = window.RackModular, spec = rt.view.spec, K = 0.001;
    let zOff = 0;
    if (est.modo === 'rack' && RM) { try { zOff = RM.fromObjeto(est.rack).planoMontagem.frontalZ + spec.placaEsp - spec.profundidade / 2; } catch (e) { zOff = 0; } }
    if (this._redeCarga) this._redeCarga.zOffMm = zOff;
    obj.x = est.x; obj.y = est.z; obj.elevacao = est.elevacao; obj.angulo = est.angulo;
    const rotY = objAnguloToRotY(est.angulo);
    rt.root.position.set(est.x, est.y, est.z);
    rt.root.rotation.y = rotY;
    rt.view.group.position.set(0, 0, zOff * K);
    rt.root.updateMatrixWorld(true);
    const tinta = est.modo === 'rack' ? 0x0b3a7a : est.modo === 'rack-cheio' ? 0x7a1010 : (est.modo === 'mao' ? null : 0x0f5a1f);
    if (rt._tinta !== tinta) { rt._tinta = tinta; this._redeTingir(rt, tinta); }
    // cabos acompanham. [21/09/2026] OTIMIZADO: antes cada ~80 ms reconstruía TODOS os cabos do mapa (tubos, plugues,
    // 8 fios de cada ponta traseira, chicotes...) -> FPS despencava com um patch panel de 24 cabos. Agora só o TUBO dos
    // cabos LIGADOS a este item é refeito (a cada ~33 ms); plugues e fios ficam ocultos enquanto carrega e o
    // `rebuildObjectIncremental` de quando solta (view3d-rede.js) reconstrói tudo uma única vez.
    const agora = performance.now();
    if (!this._redeCargaCaboT || agora - this._redeCargaCaboT > 33) {
      this._redeCargaCaboT = agora;
      const meus = RE.cabosDoObjeto(this.mapData, obj.id);
      if (meus.length) {
        if (!this._cabosGroup) this.rebuildCabos();
        else {
          if (this._redeCargaOcultos !== obj.id) {
            this._redeCargaOcultos = obj.id;
            const ids = new Set(meus.map((c) => c.id));
            this._cabosGroup.traverse((n) => { if (n.isMesh && ids.has(n.userData.caboId) && n.geometry?.type !== 'TubeGeometry' && n.userData.pontoExtraIndex == null) n.visible = false; });
          }
          meus.forEach((c) => this.caboAtualizarTuboVivo(c.id));
        }
      }
    }
  }

  /** Porta (n) do equipamento `obj` sob o raio (origem/direcao em MUNDO), ou null. Usa a placa frontal. */
  redePortaSob(obj, origin, dir) {
    const rt = this._redeRuntime?.get(obj?.id);
    if (!rt || !this.THREE) return null;
    const THREE = this.THREE;
    rt.root.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    rc.set(new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Vector3(dir.x, dir.y, dir.z).normalize());
    // Intersecta com o PLANO frontal (a placa tem furos nas portas: o raio na mira passaria direto).
    const inv = new THREE.Matrix4().copy(rt.view.group.matrixWorld).invert();
    const o = rc.ray.origin.clone().applyMatrix4(inv), d = rc.ray.direction.clone().transformDirection(inv);
    if (Math.abs(d.z) < 1e-9) return null;
    const t = (rt.view.spec.profundidade / 2 - o.z) / d.z;
    if (t < 0) return null;
    const loc = o.add(d.multiplyScalar(t));                            // mm, sistema do equipamento
    let melhor = null, dmin = 1e9;
    rt.view.spec.portas.forEach((p) => {
      const dx = Math.abs(loc.x - p.x), dy = Math.abs(loc.y - p.y);
      if (dx > p.w / 2 + 1.5 || dy > p.h / 2 + (p.tipo === 'keystone' ? 1.5 : 5)) return;   // inclui a faixa do LED/numero
      const dd = dx * dx + dy * dy; if (dd < dmin) { dmin = dd; melhor = p.n; }
    });
    return melhor;
  }

  /** [19/09/2026 UTC] NOVO (RODADA 201) -- pedido verbatim do usuario: "Atualmente, ao pressionar 'L', só
   *  fica disponível ligar nas portas da frente do painel, deve ser possível ligar na parte de trás do
   *  painel". Versão de `redePortaSob` (acima) que também detecta a TRASEIRA (só portas 'keystone' --
   *  patch panel/tomada, as únicas com bloco IDC/jack físico acessível por trás).
   *  [19/09/2026 UTC] CORRIGIDO (RODADA 202) -- BUG REAL relatado pelo usuário: "Fui atrás do patch
   *  panel e cliquei porém é capturado como se tivesse clicado na frente ainda" (mesmo pro espelho de 1
   *  ponto). CAUSA RAIZ: a 1ª versão decidia o lado testando qual PLANO DE PROFUNDIDADE (`z=+F` frente,
   *  `z=-F` trás, `F=profundidade/2`) o raio cruzava primeiro -- mas a geometria real (blocos IDC/jacks,
   *  ver `_construirPassivo` em rede-equip.js) NUNCA fica simetricamente distribuída entre `-F` e `+F`:
   *  ela fica toda concentrada perto da FRENTE (ex.: patch panel, `corpo=40mm` de um total de
   *  `profundidade=140mm`; keystone de parede, jack a poucos mm da frente de um total de `30mm`) -- o
   *  resto do "profundidade" é só espaço vazio reservado pra passagem de cabo dentro do rack/parede, sem
   *  NENHUMA superfície física ali. Testar contra `z=-F` (bem mais atrás que qualquer coisa visível)
   *  raramente acertava o footprint (x,y) de alguma porta -- a função então caía pro plano da frente como
   *  2ª tentativa, que (por estar testando ao longo da MESMA reta, só que numa distância diferente) quase
   *  sempre acertava alguma porta por coincidência de projeção, produzindo exatamente o bug relatado
   *  ("clicar atrás registra como se fosse na frente"). CORRIGIDO: o lado agora é decidido por ONDE A
   *  CÂMERA ESTÁ (`o.z`, a origem do raio já em espaço LOCAL do equipamento, positivo = lado da frente,
   *  negativo = lado de trás — a mesma convenção "FRENTE = +z, origem no centro da planta" documentada no
   *  topo de rede-equip.js), não por qual plano de profundidade o raio cruza primeiro. O PONTO de
   *  interseção usado pra achar o x,y da porta sob a mira passa a ser o PLANO MÉDIO (`z=0`) quando a
   *  câmera está atrás -- suficiente pra achar o footprint x,y correto (idêntico dos 2 lados, já que um
   *  jack keystone é um furo reto atravessando o painel) sem depender da profundidade exata de nenhuma
   *  peça 3D interna. */
  redePortaLadoSob(obj, origin, dir) {
    const rt = this._redeRuntime?.get(obj?.id);
    if (!rt || !this.THREE) return null;
    const THREE = this.THREE;
    rt.root.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    rc.set(new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Vector3(dir.x, dir.y, dir.z).normalize());
    const inv = new THREE.Matrix4().copy(rt.view.group.matrixWorld).invert();
    const o = rc.ray.origin.clone().applyMatrix4(inv), d = rc.ray.direction.clone().transformDirection(inv);
    if (Math.abs(d.z) < 1e-9) return null;
    const spec = rt.view.spec;
    const F = spec.profundidade / 2;
    // [19/09/2026 UTC] RODADA 204 -- 2ª correção: a RODADA 203 usava a face de trás do CORPO/CAIXA
    // inteira (`spec.corpo`/`spec.profundidade-placaEsp`) como limite/plano, mas o usuário reportou que
    // isso ainda deixava o destaque "no ar" (o corpo do patch panel vai de z=30 a z=70, mas os
    // conectores -- os quadrados cinzas do bloco IDC -- ficam em z≈38, e não em z=30) e o clique atrás
    // do espelho continuava falhando (o pequeno footprint do keystone, ~15mm, não tolera o erro de
    // x,y introduzido por testar um plano de profundidade distante do conector real quando o raio tem
    // qualquer inclinação lateral). CORRIGIDO: usa `_redeZConectorTras` -- a mesma coordenada Z EXATA
    // onde o conector físico real fica (bloco IDC do patch panel, jack keystone da tomada/espelho),
    // copiada das fórmulas de construção 3D em rede-equip.js (`z: F - corpo + 8` pro IDC; `zPlacaTras +
    // 0.6` pro keystone) -- tanto pra decidir o lado quanto pro próprio plano de interseção, eliminando
    // o erro de profundidade que antes desalinhava o x,y do clique.
    const zConector = this._redeZConectorTras(spec);
    const lado = o.z < zConector ? 'tras' : 'frente';
    const zPlano = lado === 'tras' ? zConector : F;
    const t = (zPlano - o.z) / d.z;
    if (t < 0) return null;
    const loc = o.clone().add(d.clone().multiplyScalar(t));
    let melhor = null, dmin = 1e9;
    rt.view.spec.portas.forEach((p) => {
      if (lado === 'tras' && p.tipo !== 'keystone') return;   // só keystone (patch panel/tomada) tem acesso pela traseira
      const dx = Math.abs(loc.x - p.x), dy = Math.abs(loc.y - p.y);
      if (dx > p.w / 2 + 1.5 || dy > p.h / 2 + (p.tipo === 'keystone' ? 1.5 : 5)) return;
      const dd = dx * dx + dy * dy; if (dd < dmin) { dmin = dd; melhor = p.n; }
    });
    if (!melhor) return null;
    return { n: melhor, lado };
  }

  /** [19/09/2026 UTC] NOVO (RODADA 201) -- ponto (mundo) e normal do PLUGUE do cabo no lado indicado
   *  ('frente'|'tras') da porta `n`. 'frente' é exatamente `_redePortaMundo` (sem mudança nenhuma no
   *  comportamento de sempre). 'tras' só existe pra porta tipo 'keystone' -- é o mesmo "ponto de
   *  ruptura" usado por `_redeRenderRearCrimping` (a capa do cabo "acaba" ali, ~3,5cm antes do bloco
   *  IDC/jack, e os 8 fios individuais tomam conta do resto do caminho até o pino) -- MANTIDO
   *  EXATAMENTE COM A MESMA DISTÂNCIA (RUPTURA_MM) das 2 funções, de propósito: a rota do cabo principal
   *  (`_caboRota`, que usa esta função) e o desenho dos 8 fios (`_redeRenderRearCrimping`) precisam
   *  terminar/começar NO MESMO PONTO, senão sobraria uma "costura" visível entre o tubo grosso e os fios
   *  finos. Normal da traseira aponta pra FORA da traseira (oposto da normal da frente). */
  _redePortaMundoLado(obj, n, lado) {
    if (lado !== 'tras') return this._redePortaMundo(obj, n);
    const RE = window.RedeEquip, spec = RE && RE.especificar(obj.tipo), p = spec && spec.portaPorN[n];
    if (!p || p.tipo !== 'keystone') return null;
    const F = spec.profundidade / 2;
    const RUPTURA_MM = 35; // mesma constante de `_redeRenderRearCrimping`
    // [19/09/2026 UTC] RODADA 204 -- CORRIGIDO: antes usava `-(spec.profundidade + RUPTURA_MM)`, que
    // mede a partir da FRENTE do objeto inteiro (F), jogando o "ponto de ruptura" 35mm ALÉM do fundo de
    // TODA a peça (ex.: patchpanel24, F=70 => z=-105 -- bem depois até do vão vazio interno do rack,
    // "no ar", nada ali perto). CORRETO: 35mm ANTES do conector físico real (`_redeZConectorTras`), não
    // antes do fim de toda a profundidade catalogada.
    const zConector = this._redeZConectorTras(spec);
    const pt = this._redePontoMundo(obj, p.x, p.y, (zConector - RUPTURA_MM) - F);
    if (!pt) return null;
    const rotY = objAnguloToRotY(obj.angulo), cos = Math.cos(rotY), sin = Math.sin(rotY);
    return { x: pt.x, y: pt.y, z: pt.z, nx: -sin, nz: -cos, rotY: rotY + Math.PI };
  }

  /** [19/09/2026 UTC] NOVO (RODADA 204) -- Z LOCAL (mesma convenção FRENTE=+z do topo de rede-equip.js)
   *  onde fica o conector físico REAL acessado pela traseira de uma porta 'keystone': o bloco IDC (os
   *  "quadrados cinzas") do patch panel (`z: F - corpo + 8`, ver `_construirAtivo`/branch patch panel em
   *  rede-equip.js) ou o jack keystone da tomada/espelho/caixa de piso, colado quase na própria placa
   *  frontal (`z: zPlacaTras + 0.6 = F - placaEsp + 0.6`, ver `_construirPassivo`). Usado tanto pro
   *  clique/hover (`redePortaLadoSob`, `_redePortaMundoConectorTras`) quanto como referência de
   *  distância pro "ponto de ruptura" dos 8 fios (`_redePortaMundoLado`, `_redeRenderRearCrimping`). */
  _redeZConectorTras(spec) {
    const F = spec.profundidade / 2;
    if (spec.familia === 'patchpanel') return F - (spec.corpo || 0) + 8;
    return F - (spec.placaEsp || 0) + 0.6;
  }

  /** [19/09/2026 UTC] NOVO (RODADA 204) -- ponto (mundo) EXATO do conector físico real na traseira de
   *  uma porta 'keystone' (bloco IDC/jack -- ver `_redeZConectorTras`), pra uso em UI (contorno de
   *  destaque, linha fantasma) que deve ficar "grudado" na peça visível, e não recuado 35mm no "ponto de
   *  ruptura" usado pela geometria do cabo (`_redePortaMundoLado`) -- é essa distância de 35mm que o
   *  usuário reportou como "o destaque está no ar, mais atrás do que um objeto sólido". */
  _redePortaMundoConectorTras(obj, n) {
    const RE = window.RedeEquip, spec = RE && RE.especificar(obj.tipo), p = spec && spec.portaPorN[n];
    if (!p || p.tipo !== 'keystone') return null;
    const F = spec.profundidade / 2;
    const zConector = this._redeZConectorTras(spec);
    const pt = this._redePontoMundo(obj, p.x, p.y, zConector - F);
    if (!pt) return null;
    const rotY = objAnguloToRotY(obj.angulo), cos = Math.cos(rotY), sin = Math.sin(rotY);
    return { x: pt.x, y: pt.y, z: pt.z, nx: -sin, nz: -cos, rotY: rotY + Math.PI };
  }

  /** Alvo MAIS PROXIMO do raio entre equipamentos de rede e pecas de racks: { kind:'rede', obj } ou
   *  { kind:'rack', obj, parte }. Serve para clicar num switch DENTRO de um rack (o OBB do rack o cobriria). */
  redeAlvoSob(origin, dir) {
    if (!this.THREE) return null;
    const THREE = this.THREE;
    const malhas = this._pickMeshes.filter((m) => m.userData && (m.userData.redeObj || m.userData.rackParte));
    if (!malhas.length) return null;
    const rc = new THREE.Raycaster();
    rc.set(new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Vector3(dir.x, dir.y, dir.z).normalize());
    const hit = rc.intersectObjects(malhas, false)[0];
    if (!hit) return null;
    const u = hit.object.userData;
    if (u.redeObj) return { kind: 'rede', obj: u.redeObj, dist: hit.distance };
    return { kind: 'rack', obj: u.pick && u.pick.ref, parte: u.rackParte, dist: hit.distance };
  }

  /** Qual PECA do rack `obj` esta sob o raio (origem/direcao em MUNDO)? Devolve
   *  `userData.rackParte` da malha mais proxima do rack ('porta:frente',
   *  'chapa:topo', 'acessorio:<id>', 'armadura'...) ou null se o raio nao
   *  toca nenhuma malha dele (vao entre a armacao). Base do duplo clique so
   *  na porta e do botao direito. */
  rackParteSob(obj, origin, dir) {
    if (!this.THREE || !obj) return null;
    const THREE = this.THREE;
    const malhas = this._pickMeshes.filter((m) => m.userData?.pick?.ref === obj && m.userData.rackParte);
    if (!malhas.length) return null;
    const rc = new THREE.Raycaster();
    rc.set(new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Vector3(dir.x, dir.y, dir.z).normalize());
    const hits = rc.intersectObjects(malhas, false);
    return hits.length ? hits[0].object.userData.rackParte : null;
  }

  /** [15/09/2026 UTC] NOVO — "Cadeira de verdade" (pedido verbatim: "Faça
   *  um modelo 3D diferente para a cadeira (substituindo-o), faça uma
   *  'cadeira de verdade' com pernas e encosto. Não uma caixa genérica como
   *  é atualmente."). Mesmo padrão de `_makeMesaMeshes`/`_buildMesaMesh`
   *  (várias `Mesh` soltas — assento + 4 pernas + encosto — compartilhando
   *  1 pickable/obb aproximado pela caixa delimitadora total): assento fino
   *  na altura real de uma cadeira (~metade da altura total), 4 pernas
   *  finas recuadas pra DENTRO do assento (não nas quinas — mesmo cuidado
   *  já pedido pra mesa), e um encosto — painel vertical fino — na borda de
   *  TRÁS do assento (local Z negativo, antes de girar por `obj.angulo`).
   */
}
// Métodos de `class` não são enumeráveis (`Object.assign` os ignora) — copia pelo nome.
Object.getOwnPropertyNames(Engine3DRedeMeshMixin.prototype).forEach((k) => {
  if (k !== 'constructor') Engine3D.prototype[k] = Engine3DRedeMeshMixin.prototype[k];
});
