/**
 * rede-passiva.js — Infraestrutura PASSIVA de redes: meios de transmissão, acessórios de
 * conexão, acomodação de rack, espelhos/caixas de piso e fixação/identificação.
 *
 * [18/09/2026 UTC] RODADA 167. JavaScript Vanilla (ES6+), SEM dependência de Three.js nem do DOM:
 * só matemática e regras (mesmo padrão UMD de rack-modular.js / rede-equip.js — `window.RedePassiva`
 * no navegador, `module.exports` em Node para teste). O motor 3D (engine3d.js) e o View3D só
 * CONSOMEM estas funções.
 *
 * Unidades: comprimentos de cabo/percurso em METROS (mundo do app); seções/diâmetros em MILÍMETROS.
 *
 * ---------------------------------------------------------------------------
 * ARQUITETURA DE HERANÇA
 *
 *   NetworkElement                       (id, tipo, nome, labelID)
 *   ├── CableElement                     (meio, diâmetro, área da seção)
 *   │   ├── TwistedPairCable             (categoria Cat5e/6/6A/7 + blindagem U/UTP|F/UTP|S/FTP)
 *   │   ├── FiberCable                   (modo SMF | OM3 | OM4 + conector LC/SC/ST)
 *   │   └── PatchCord                    (length em m; liga Porta A -> Porta B; rota/spline)
 *   ├── PassiveAccessory                 (dispositivos passivos de manobra)
 *   │   └── Keystone                     (tomada fêmea RJ-45 com categoria)
 *   ├── RackElement                      (heightInU + snap milimétrico nos trilhos)
 *   │   ├── DIO                          (1U/2U, matriz de portas ópticas LC/SC/ST)
 *   │   ├── GuiaCabo                     (horizontal 1U/2U e vertical; ZONAS DE PASSAGEM)
 *   │   ├── Bandeja                      (fixa | basculante)
 *   │   ├── PDU                          (régua de tomadas)
 *   │   ├── FrenteFalsa
 *   │   └── KitVentilacao
 *   ├── InfraElement                     (infraestrutura física)
 *   │   └── PlacaTomadas                 (aceita 1, 2 ou 4 keystones)
 *   │       ├── EspelhoParede · CaixaPiso
 *   └── FixingElement                    (fixação / identificação)
 *       ├── Abracadeira                  (velcro | nylon) — MODIFICADOR agregador (bunching)
 *       └── Etiqueta                     (labelID mostrado em overlay no hover)
 *
 * Também: validação de compatibilidade (`avaliarConexao`),
 * spline/rota do cabo com zonas de passagem (`rotaCabo`, `amostrarSpline`) e agrupamento de
 * feixes (`agruparFeixes`).
 * ---------------------------------------------------------------------------
 */
(function (raiz) {
  'use strict';

  // ==========================================================================
  // 1) CATÁLOGOS (dados de mercado)
  // ==========================================================================

  /** Categorias de par trançado. `nivel` ordena a compatibilidade retroativa. Diâmetros típicos
   *  (mm) do cabo UTP de 4 pares; a blindagem soma um pouco (ver `BLINDAGENS`). */
  const CATEGORIAS = Object.freeze({
    cat5e: Object.freeze({ rotulo: 'Cat5e', nivel: 1, bandaMHz: 100, diametroMm: 5.2, blindagemPadrao: 'U/UTP' }),
    cat6:  Object.freeze({ rotulo: 'Cat6',  nivel: 2, bandaMHz: 250, diametroMm: 6.0, blindagemPadrao: 'U/UTP' }),
    cat6a: Object.freeze({ rotulo: 'Cat6A', nivel: 3, bandaMHz: 500, diametroMm: 7.6, blindagemPadrao: 'F/UTP' }),
    cat7:  Object.freeze({ rotulo: 'Cat7',  nivel: 4, bandaMHz: 600, diametroMm: 8.0, blindagemPadrao: 'S/FTP' }),
  });
  /** Blindagens (ISO/IEC 11801): U = sem blindagem, F = folha, S = malha; antes da barra = global. */
  const BLINDAGENS = Object.freeze({
    'U/UTP': Object.freeze({ blindado: false, acrescimoMm: 0.0 }),
    'F/UTP': Object.freeze({ blindado: true, acrescimoMm: 0.4 }),
    'S/FTP': Object.freeze({ blindado: true, acrescimoMm: 0.9 }),
  });
  /** Fibras: SMF (monomodo OS2 9/125) e MMF (multimodo OM3/OM4 50/125). `grupo` = família modal. */
  const FIBRAS = Object.freeze({
    SMF: Object.freeze({ rotulo: 'Monomodo (SMF/OS2)', grupo: 'SMF', nivel: 1, diametroCordaoMm: 3.0, diametroCaboMm: 6.0, cor: '#f0c419' }),
    OM3: Object.freeze({ rotulo: 'Multimodo OM3',      grupo: 'MMF', nivel: 1, diametroCordaoMm: 3.0, diametroCaboMm: 6.0, cor: '#22d3ee' }),
    OM4: Object.freeze({ rotulo: 'Multimodo OM4',      grupo: 'MMF', nivel: 2, diametroCordaoMm: 3.0, diametroCaboMm: 6.0, cor: '#a855f7' }),
  });
  /** Conectores. RJ45 = cobre; LC/SC/ST = fibra. */
  const CONECTORES = Object.freeze({
    RJ45: Object.freeze({ meio: 'cobre' }),
    LC: Object.freeze({ meio: 'fibra' }),
    SC: Object.freeze({ meio: 'fibra' }),
    ST: Object.freeze({ meio: 'fibra' }),
  });
  /** Comprimentos comerciais de patch cord (m). */
  const COMPRIMENTOS_PADRAO_M = Object.freeze([0.3, 0.5, 1, 1.5, 2, 3, 5, 7, 10, 15, 20]);
  // ==========================================================================
  // 2) FUNÇÕES PURAS: vetores, compatibilidade, ocupação
  // ==========================================================================
  const _v = {
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
    mul: (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k }),
    len: (a) => Math.hypot(a.x, a.y, a.z),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }),
    cross: (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }),
  };

  /** Diâmetro externo (mm) de um cabo de cobre: base da categoria + acréscimo da blindagem. */
  function diametroCobreMm(categoria, blindagem) {
    const c = CATEGORIAS[categoria] || CATEGORIAS.cat6, b = BLINDAGENS[blindagem] || BLINDAGENS[c.blindagemPadrao];
    return +(c.diametroMm + b.acrescimoMm).toFixed(2);
  }

  /**
   * ESQUEMA DE VALIDAÇÃO DE COMPATIBILIDADE (regras de conexão física).
   *
   * `plug`  = o que está na PONTA do cabo:  { meio, conector, categoria?, blindagem?, fibra? }
   * `porta` = a PORTA/slot que recebe:      { meio, conector, categoria?, blindagem?, fibra? }
   *   (`fibra: 'ANY'` na porta = módulo agnóstico, ex.: SFP — não checa modo.)
   *
   * Regras (na ordem):
   *  R1  meios diferentes                      -> ERRO   (patch cord RJ-45 de cobre em porta LC de fibra)
   *  R2  conectores ópticos diferentes         -> ERRO   (LC não entra em SC/ST)
   *  R3  cobre: plug de categoria MAIOR que a do jack -> AVISO (Cat6A em Cat6 exige... não
   *      atinge o desempenho e o plug maior pode não assentar); plug <= jack -> OK
   *      (Cat6 em keystone Cat6A entra normalmente; é o caso retrocompatível)
   *  R4  cobre: plug blindado em porta sem blindagem (U/UTP) -> AVISO (blindagem sem aterramento)
   *  R5  fibra: SMF x MMF                      -> AVISO forte (encaixa, mas o enlace não fecha)
   *  R6  fibra: OM3 em porta OM4               -> AVISO (reduz o alcance do enlace OM4)
   * @returns {{ok:boolean, nivel:'ok'|'aviso'|'erro', motivos:string[]}} `ok` é falso só em ERRO.
   */
  function avaliarConexao(plug, porta) {
    const motivos = [];
    if (!plug || !porta) return { ok: false, nivel: 'erro', motivos: ['Conector ou porta indefinidos.'] };
    if (plug.meio !== porta.meio) {
      motivos.push(plug.meio === 'cobre'
        ? 'Conector RJ-45 de cobre não encaixa em porta óptica (' + porta.conector + ').'
        : 'Conector óptico (' + plug.conector + ') não encaixa em porta RJ-45 de cobre.');
      return { ok: false, nivel: 'erro', motivos };
    }
    if (plug.conector !== porta.conector) {
      motivos.push('Conector ' + plug.conector + ' não encaixa em porta ' + porta.conector + '.');
      return { ok: false, nivel: 'erro', motivos };
    }
    let nivel = 'ok';
    const aviso = (t) => { motivos.push(t); nivel = 'aviso'; };
    if (plug.meio === 'cobre') {
      const cp = CATEGORIAS[plug.categoria], cj = CATEGORIAS[porta.categoria];
      if (cp && cj && cp.nivel > cj.nivel) aviso('Plug ' + cp.rotulo + ' em tomada ' + cj.rotulo + ': o enlace opera só como ' + cj.rotulo + ' (e o plug pode não assentar).');
      const bp = BLINDAGENS[plug.blindagem], bj = BLINDAGENS[porta.blindagem];
      if (bp && bp.blindado && bj && !bj.blindado) aviso('Cabo blindado (' + plug.blindagem + ') em porta sem blindagem/aterramento.');
    } else if (porta.fibra && porta.fibra !== 'ANY' && plug.fibra) {
      const fp = FIBRAS[plug.fibra], fj = FIBRAS[porta.fibra];
      if (fp && fj && fp.grupo !== fj.grupo) aviso('Fibra ' + fp.rotulo + ' em porta ' + fj.rotulo + ': encaixa, mas o enlace não fecha (modo incompatível).');
      else if (fp && fj && fp.nivel < fj.nivel) aviso('Fibra ' + plug.fibra + ' em porta ' + porta.fibra + ': o alcance do enlace cai para o de ' + plug.fibra + '.');
    }
    return { ok: true, nivel, motivos };
  }

  /** Área da seção transversal de UM cabo (mm²) = π·d²/4. */
  function areaCaboMm2(diametroMm) { return Math.PI * diametroMm * diametroMm / 4; }

  // ==========================================================================
  // 3) SPLINE DO CABO: rota com zonas de passagem, amostragem, comprimento, bunching
  // ==========================================================================

  /** [19/09/2026 UTC] CORRIGIDO (RODADA 189) — pedido verbatim do usuário: "ligar um cabo reto de uma
   *  ponta a outra, o bézier aplicado, faz ficar com um encurvamento acentuado para o lado oposto antes
   *  de ir na reta, em vez de ir direto pela reta de ligação." CAUSA RAIZ: esta função implementava
   *  Catmull-Rom com PARAMETRIZAÇÃO UNIFORME (cada ponto de controle tratado como se estivesse a uma
   *  distância "1" do vizinho, não importa a distância real entre eles) — é EXATAMENTE o caso clássico
   *  documentado pelo próprio Three.js (THREE.CatmullRomCurve3, curveType 'catmullrom' é a opção NÃO
   *  recomendada por eles mesmos) em que pontos de controle muito desigualmente espaçados produzem laços/
   *  "overshoot" na curva. `rotaCabo` (abaixo) gera pontos de controle MUITO desiguais de propósito:
   *  `a`->`a1` é um segmento curto fixo (0,07m, a saída perpendicular da porta), enquanto `a1`->próximo
   *  ponto pode ser vários metros — com parametrização uniforme, isso faz a curva "disparar" longe na
   *  direção de `a1` antes de conseguir virar pra reta, produzindo o encurvamento acentuado pro lado
   *  oposto relatado. CORRIGIDO: reimplementada como Catmull-Rom CENTRÍPETA (α=0,5) — a MESMA fórmula que
   *  o Three.js usa internamente pra `curveType: 'centripetal'` (a opção que o próprio Three.js recomenda
   *  como default, disponível mas não usada por este projeto até agora): os "nós" de parametrização entre
   *  pontos vizinhos são espaçados por `distância^0,25` (ao quadrado, equivalente a `distância^0,5` na raiz)
   *  em vez de sempre "1" — isso elimina o overshoot quando os segmentos têm comprimentos muito diferentes,
   *  incluindo o caso trivial de uma ligação reta (onde a curva agora acompanha a reta A->B de verdade, em
   *  vez de fazer a "barriga" antes de se alinhar). Ver também `Engine3D.rebuildCabos`, que troca o
   *  `curveType` do `THREE.CatmullRomCurve3` de renderização (2ª passada, sobre os pontos JÁ amostrados
   *  aqui) de 'catmullrom' pra 'centripetal' pela mesma razão — consistência entre as 2 passadas.
   *  Devolve `n` amostras por segmento (inclui o ponto final). */
  function amostrarSpline(pts, nPorSeg) {
    const n = Math.max(2, nPorSeg || 8), out = [];
    if (pts.length < 2) return pts.slice();
    const dist3 = (p, q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      // nós centrípetos (α=0,5): dt = distância^0,5 entre pontos consecutivos, com salvaguarda pra
      // pontos repetidos/coincidentes (dt≈0 quebraria a divisão nas fórmulas de tangente abaixo).
      let dt0 = Math.sqrt(dist3(p0, p1)), dt1 = Math.sqrt(dist3(p1, p2)), dt2 = Math.sqrt(dist3(p2, p3));
      if (dt1 < 1e-4) dt1 = 1;
      if (dt0 < 1e-4) dt0 = dt1;
      if (dt2 < 1e-4) dt2 = dt1;
      // por eixo (x/y/z): tangentes não-uniformes em p1/p2 (fórmula de Catmull-Rom centrípeto/Kochanek-
      // Bartels, mesma usada internamente pelo THREE.CatmullRomCurve3 curveType 'centripetal'/'chordal'),
      // depois avaliadas como um polinômio cúbico de Hermite parametrizado em t ∈ [0,1] entre p1 e p2.
      const eixo = (x0, x1, x2, x3) => {
        let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
        let t2v = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
        t1 *= dt1; t2v *= dt1;
        const c0 = x1, c1 = t1, c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2v, c3 = 2 * x1 - 2 * x2 + t1 + t2v;
        return (t) => { const t2 = t * t, t3 = t2 * t; return c0 + c1 * t + c2 * t2 + c3 * t3; };
      };
      const fx = eixo(p0.x, p1.x, p2.x, p3.x), fy = eixo(p0.y, p1.y, p2.y, p3.y), fz = eixo(p0.z, p1.z, p2.z, p3.z);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push({ x: fx(t), y: fy(t), z: fz(t) });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /**
   * [22/09/2026] NOVO -- pedido verbatim: "Liguei um patch cord de frente em um AP e, depois, virei o AP
   * 180°. Então, o patch cord ficou ao contrário direto, sem fazer uma curva como é no mundo real [...] Deve
   * haver um vetor de saída e, quando houver uma dobra, o ponto de dobra deve impedir que, em um mesmo ponto,
   * curve-se 180° direto [...] 2 ou 3 pontos de controle em uma Bézier [...] Isso deve ser feito sempre
   * quando houver uma dobra fechada em uma cabo, em quaisquer partes dele, inclusive nas partes que se ligam
   * aos conectores que ficam nas pontas do cabo/patch cord." CAUSA RAIZ do bug: `amostrarSpline` (Catmull-Rom
   * centrípeta, acima) INTERPOLA através de cada ponto de controle -- ela suaviza a TANGENTE em cada ponto,
   * mas não evita um "bico" visível quando o trecho de ENTRADA e o de SAÍDA de um ponto apontam quase em
   * direções opostas (dobra fechada, perto de 180°): não há folga geométrica nenhuma pra curvar, só um ponto
   * onde o cabo é forçado a "voltar" quase sobre a mesma reta -- exatamente o caso de um conector cujo vetor
   * de saída (`na`/`nb` em `rotaCabo`) vira 180° ao girar o objeto, ficando apontado praticamente na direção
   * inversa do resto do trajeto. CORRIGIDO: varre a sequência de pontos de controle (rodando ANTES de
   * `amostrarSpline`, sobre os MESMOS pontos que ela já recebe -- ver `amostrarRotaComRetas` logo abaixo, que
   * é o único chamador) e, em todo ponto interno cujo ângulo entrada→saída seja "fechado" (< ~110° entre os
   * dois trechos, `cosA < -0.35` -- cobre também o caso extremo de reversão quase exata de 180°), substitui
   * ESSE ÚNICO ponto por 3 pontos formando um pequeno "laço" lateral (perpendicular ao trecho de entrada, do
   * lado estável dado por `cross(entrada, mundoY)`) -- a spline passa a ter folga geométrica de verdade pra
   * curvar em vez de reverter em cima da própria reta, exatamente como um cabo real faz ao dobrar apertado
   * (forma uma volta/curva, nunca um "V" ou reversão instantânea). O raio do laço é proporcional ao menor dos
   * dois trechos adjacentes (nunca maior que eles, pra não "vazar" pra fora do espaço real entre os pontos
   * vizinhos), clampado entre 3cm e 25cm (mesma ordem de grandeza do raio mínimo de curvatura já usado em
   * `rotaCabo`/`saida`). Roda em QUALQUER trecho curvo do cabo -- pontos de controle normais (`pontosExtras`/
   * zonas de passagem) e as próprias pontas de conector (`a1`/`b1` de `rotaCabo`) igualmente, já que todos
   * entram na mesma sequência `ctrl` amostrada aqui -- exatamente o "em quaisquer partes dele, inclusive nas
   * pontas com conectores" do pedido.
   */
  function _suavizarDobrasFechadas(pts) {
    if (!Array.isArray(pts) || pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      const din = _v.sub(p1, p0), dout = _v.sub(p2, p1);
      const Lin = _v.len(din), Lout = _v.len(dout);
      if (Lin < 1e-6 || Lout < 1e-6) { out.push(p1); continue; }
      const dinN = _v.mul(din, 1 / Lin), doutN = _v.mul(dout, 1 / Lout);
      const cosA = dinN.x * doutN.x + dinN.y * doutN.y + dinN.z * doutN.z;
      if (cosA < -0.35) {
        let perp = _v.cross(dinN, { x: 0, y: 1, z: 0 }), pl = _v.len(perp);
        if (pl < 1e-6) { perp = _v.cross(dinN, { x: 1, y: 0, z: 0 }); pl = _v.len(perp); }
        perp = pl > 1e-6 ? _v.mul(perp, 1 / pl) : { x: 1, y: 0, z: 0 };
        const r = Math.max(0.03, Math.min(0.25, Math.min(Lin, Lout) * 0.35));
        // 3 pontos do laço: um pouco ANTES de p1 (recuando pela entrada) + deslocado pro lado; o ápice do
        // laço (bem deslocado pro lado, em cima de p1); um pouco DEPOIS de p1 (avançando pela saída) +
        // deslocado pro lado -- a spline centrípeta (`amostrarSpline`) conecta os 3 com curvatura suave.
        out.push(_v.add(_v.add(p1, _v.mul(dinN, -r * 0.6)), _v.mul(perp, r)));
        out.push(_v.add(p1, _v.mul(perp, r * 1.4)));
        out.push(_v.add(_v.add(p1, _v.mul(doutN, r * 0.6)), _v.mul(perp, r)));
      } else {
        out.push(p1);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /** [19/09/2026 UTC] NOVO (RODADA 192) — pedido verbatim: "Deve ser possível [...] ativar
   *  desativar o bézier em partes do cabo [...] uma tecla pode servir para trocar de bézier para
   *  linha reta, então, fica um traço reto mesmo (entre um nó e outro)." `amostrarSpline` (acima)
   *  sempre trata TODOS os pontos de controle como uma única curva Catmull-Rom contínua — esta
   *  função permite MISTURAR trechos retos com trechos curvos ao longo do MESMO cabo. `ctrl` é o
   *  mesmo array de pontos de controle de sempre (origem, `pontosExtras` na ordem, destino), só
   *  que cada ponto pode ter `reto: true` — quando tem, o SEGMENTO SEGUINTE (deste ponto até o
   *  próximo) vira uma reta pura, cortando a curva em 2 pedaços ali (o pedaço curvo antes dele, se
   *  houver ≥2 pontos, continua sendo uma spline centrípeta normal via `amostrarSpline` — reaproveitada,
   *  não duplicada). `reto` no último ponto (destino) não tem efeito (não há segmento depois dele).
   *  Sem nenhum ponto com `reto`, o resultado é idêntico a `amostrarSpline(ctrl, nPorSeg)` (1 único
   *  trecho curvo, comportamento de sempre). */
  function amostrarRotaComRetas(ctrl, nPorSeg) {
    if (!Array.isArray(ctrl) || ctrl.length < 2) return (ctrl || []).slice();
    // Quebra `ctrl` em "trechos" (runs): cada um é {reto:true, pts:[a,b]} (1 segmento reto) ou
    // {reto:false, pts:[...]} (≥2 pontos, um trecho curvo contínuo).
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
    const out = [];
    runs.forEach((run, ri) => {
      // [22/09/2026] NOVO -- ver comentário grande de `_suavizarDobrasFechadas`: só faz sentido em trechos
      // CURVOS (`amostrarSpline`) -- um trecho `reto` já é intencionalmente uma reta pura (usuário pediu
      // explicitamente), então uma dobra fechada ali é respeitada como está, sem "arredondar" por cima da
      // escolha manual do usuário.
      let pts = run.reto ? [run.pts[0], run.pts[1]] : amostrarSpline(_suavizarDobrasFechadas(run.pts), nPorSeg);
      if (ri > 0) pts = pts.slice(1); // evita duplicar o ponto de junção entre trechos consecutivos
      out.push(...pts);
    });
    return out;
  }
  /** Comprimento (m) de uma polilinha. */
  function comprimentoPolilinha(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += _v.dist(pts[i - 1], pts[i]); return s; }

  /**
   * Pontos de controle da spline de um patch cord entre a Porta A e a Porta B.
   *  - Cada ponta sai da porta por sua NORMAL (`n`, unitária) por `saida` metros (raio mínimo de curvatura).
   *  - `zonas` = ZONAS DE PASSAGEM (guias de cabo, calhas): {x,y,z,raio} — o cabo é obrigado a passar
   *    por dentro delas, na ordem de proximidade ao longo do trajeto A->B (alteram a trajetória).
   *  - Sem zonas: um ponto médio com CAIMENTO proporcional à distância (folga natural do cabo).
   * @returns {{x,y,z}[]} pontos de controle
   */
  function rotaCabo(a, na, b, nb, opt) {
    opt = opt || {};
    // [20/09/2026 UTC] RODADA 222 -- pedido verbatim: "diminua em 40% aquele salto que o cabo dá ao sair
    // do conector de extremidade (o vetor de saída)". Era 0,07m; reduzido pra 0,042m (0,07 * 0,6 -- 40%
    // menor), preservando a DIREÇÃO (ainda ao longo de `na`/`nb`, a normal da porta), só encurtando a
    // distância do "salto" inicial antes de a curva pegar o resto do trajeto.
    // [20/09/2026 UTC] RODADA 223 -- correção: usuário pediu 4cm certinho, não 4,2cm. 0,042 -> 0,04.
    const saida = opt.saida == null ? 0.04 : opt.saida;
    const a1 = _v.add(a, _v.mul(na, saida)), b1 = _v.add(b, _v.mul(nb, saida));
    const ctrl = [a, a1];
    const zonas = (opt.zonas || []).slice();
    if (zonas.length) {
      // Ordena as zonas pela projeção no eixo A->B (do começo ao fim do trajeto).
      // [19/09/2026 UTC] RODADA 193 -- pedido verbatim: "Os nós não devem se reordenar dinamicamente
      // [...] a ordem dos nós deve ser preservada." Entre 2 zonas que sejam AMBAS nós manuais do usuário
      // (`_ordemManual` presente -- ver `Engine3D._caboRota`), a ordem de CRIAÇÃO vence, não a projeção
      // geométrica (que pode empatar/oscilar com o cabo esticado, "trocando" 2 nós próximos a cada
      // recálculo). Zonas-guia automáticas (sem `_ordemManual`) continuam só por geometria, entre si e em
      // relação a qualquer nó manual.
      const eixo = _v.sub(b1, a1), l2 = eixo.x * eixo.x + eixo.y * eixo.y + eixo.z * eixo.z || 1;
      zonas.sort((z1, z2) => {
        if (z1._ordemManual != null && z2._ordemManual != null) return z1._ordemManual - z2._ordemManual;
        return ((_v.sub(z1, a1).x * eixo.x + _v.sub(z1, a1).y * eixo.y + _v.sub(z1, a1).z * eixo.z) / l2)
          - ((_v.sub(z2, a1).x * eixo.x + _v.sub(z2, a1).y * eixo.y + _v.sub(z2, a1).z * eixo.z) / l2);
      });
      // [19/09/2026 UTC] RODADA 192 -- preserva `reto` (bezier/linha reta por trecho, ver
      // `amostrarRotaComRetas` acima) que antes era descartado aqui ao reconstruir o ponto.
      zonas.forEach((z) => ctrl.push({ x: z.x, y: z.y, z: z.z, reto: !!z.reto }));
    } else {
      const mid = _v.lerp(a1, b1, 0.5);
      mid.y -= Math.min(opt.caimentoMax == null ? 0.35 : opt.caimentoMax, 0.06 + _v.dist(a1, b1) * 0.12);
      ctrl.push(mid);
    }
    ctrl.push(b1, b);
    return ctrl;
  }

  /** Menor comprimento comercial de patch cord (m) que cobre `rotaM` com 15 % de folga. */
  function comprimentoPadraoMinimo(rotaM) {
    const alvo = rotaM * 1.15;
    for (const c of COMPRIMENTOS_PADRAO_M) if (c >= alvo) return c;
    return Math.ceil(alvo);
  }

  /**
   * BUNCHING: abraçadeiras (velcro/nylon) agregam os cabos que passam por elas.
   * `rotas` = [{ id, pts:[{x,y,z}], diametroMm }] (polilinhas já AMOSTRADAS);
   * `cintas` = [{ id, x, y, z, captura }] (captura = raio de alcance em metros).
   * Para cada cinta, os cabos cuja polilinha passa dentro de `captura` têm o trecho vizinho puxado
   * (peso suave em cosseno, janela `janela` amostras) até o CENTRÓIDE — todos convergem num feixe único
   * na cinta. Devolve novas rotas (as originais não mudam) e, por cinta, o feixe consolidado:
   * { centro, cabos:[ids], diametroMm = √Σd² (diâmetro do feixe de área equivalente) }.
   */
  function agruparFeixes(rotas, cintas, opt) {
    const janela = (opt && opt.janela) || 6;
    const novas = rotas.map((r) => ({ id: r.id, diametroMm: r.diametroMm, pts: r.pts.map((p) => ({ x: p.x, y: p.y, z: p.z })) }));
    const feixes = [];
    (cintas || []).forEach((c) => {
      const cap = c.captura == null ? 0.25 : c.captura;
      const membros = [];
      novas.forEach((r) => {
        let bi = -1, bd = Infinity;
        r.pts.forEach((p, i) => { const d = _v.dist(p, c); if (d < bd) { bd = d; bi = i; } });
        // amostras esparsas: confere tambem a distancia do centro da cinta ao SEGMENTO entre amostras vizinhas
        let dSeg = bd;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const q0 = r.pts[i], u = _v.sub(r.pts[i + 1], q0), l2 = u.x * u.x + u.y * u.y + u.z * u.z || 1e-12, w = _v.sub(c, q0);
          const t = Math.max(0, Math.min(1, (w.x * u.x + w.y * u.y + w.z * u.z) / l2));
          const d = _v.dist(c, _v.add(q0, _v.mul(u, t))); if (d < dSeg) dSeg = d;
        }
        if (dSeg <= cap) membros.push({ r, i: bi });
      });
      if (membros.length < 2) return;                       // 1 cabo só não forma feixe
      const cen = membros.reduce((s, m) => _v.add(s, m.r.pts[m.i]), { x: 0, y: 0, z: 0 });
      const centro = _v.mul(cen, 1 / membros.length);
      membros.forEach(({ r, i }) => {
        for (let k = -janela; k <= janela; k++) {
          const j = i + k; if (j < 1 || j > r.pts.length - 2) continue;   // nunca mexe nas pontas (portas)
          const w = 0.5 * (1 + Math.cos(Math.PI * k / (janela + 1)));       // 1 no centro -> 0 na borda
          r.pts[j] = _v.lerp(r.pts[j], centro, w);
        }
      });
      feixes.push({ cintaId: c.id, centro, cabos: membros.map((m) => m.r.id), diametroMm: Math.sqrt(membros.reduce((s, m) => s + m.r.diametroMm * m.r.diametroMm, 0)) });
    });
    return { rotas: novas, feixes };
  }

  // ==========================================================================
  // 4) CLASSES
  // ==========================================================================
  let _seq = 0;
  const _uid = (p) => p + '_' + (++_seq).toString(36) + Math.random().toString(36).slice(2, 6);

  /** Raiz abstrata: identidade + `labelID` (etiqueta/anilha mostrada em overlay no hover). */
  class NetworkElement {
    constructor(o) {
      if (new.target === NetworkElement) throw new TypeError('NetworkElement é abstrata.');
      o = o || {};
      this.id = o.id || _uid('ne'); this.tipo = o.tipo || this.constructor.name.toLowerCase();
      this.nome = o.nome || ''; this.labelID = o.labelID || '';
    }
    /** Serialização plana (cabe no mapa/DB). */
    toJSON() { return Object.assign({}, this); }
    /** Texto do overlay de hover (CSS renderiza por cima do objeto). */
    textoOverlay() { return [this.labelID, this.nome].filter(Boolean).join(' · '); }
  }

  // ---- Grupo 1: meios de transmissão ----------------------------------------------------------
  class CableElement extends NetworkElement {
    constructor(o) { super(o); o = o || {}; this.meio = o.meio || 'cobre'; this.diametroMm = o.diametroMm || 6; }
    get areaMm2() { return areaCaboMm2(this.diametroMm); }
    /** Descrição do PLUG das pontas (usado por `avaliarConexao`). Subclasses sobrescrevem. */
    plug() { return { meio: this.meio, conector: 'RJ45' }; }
  }
  class TwistedPairCable extends CableElement {
    constructor(o) {
      o = o || {};
      const cat = CATEGORIAS[o.categoria] ? o.categoria : 'cat6';
      const bl = BLINDAGENS[o.blindagem] ? o.blindagem : CATEGORIAS[cat].blindagemPadrao;
      super(Object.assign({}, o, { meio: 'cobre', diametroMm: o.diametroMm || diametroCobreMm(cat, bl) }));
      this.categoria = cat; this.blindagem = bl;
    }
    plug() { return { meio: 'cobre', conector: 'RJ45', categoria: this.categoria, blindagem: this.blindagem }; }
  }
  class FiberCable extends CableElement {
    constructor(o) {
      o = o || {};
      const modo = FIBRAS[o.modo] ? o.modo : 'SMF';
      super(Object.assign({}, o, { meio: 'fibra', diametroMm: o.diametroMm || FIBRAS[modo].diametroCaboMm }));
      this.modo = modo; this.conector = CONECTORES[o.conector] && CONECTORES[o.conector].meio === 'fibra' ? o.conector : 'LC';
    }
    plug() { return { meio: 'fibra', conector: this.conector, fibra: this.modo }; }
  }
  /**
   * Patch cord: cabo flexível de comprimento `length` (m) que liga a Porta A (origem) à Porta B
   * (destino). Herda o meio/plug de um cabo "base" (cobre ou fibra) — composição, não duplicação.
   */
  class PatchCord extends CableElement {
    /** @param {{base:CableElement|object, length?:number, origem?:{obj,porta}, destino?:{obj,porta}}} o */
    constructor(o) {
      o = o || {};
      const base = o.base instanceof CableElement ? o.base
        : (o.base && o.base.meio === 'fibra' ? new FiberCable(o.base) : new TwistedPairCable(o.base || {}));
      super(Object.assign({}, o, { meio: base.meio, diametroMm: o.diametroMm || (base.meio === 'fibra' ? FIBRAS[base.modo].diametroCordaoMm : base.diametroMm) }));
      this.base = base; this.length = o.length || 1; this.origem = o.origem || null; this.destino = o.destino || null;
    }
    plug() { return this.base.plug(); }
    /** Compatibilidade de AMBAS as pontas com as portas dadas ({meio,conector,...}). */
    validarLigacao(portaA, portaB) {
      const ra = avaliarConexao(this.plug(), portaA), rb = avaliarConexao(this.plug(), portaB);
      const nivel = (!ra.ok || !rb.ok) ? 'erro' : (ra.nivel === 'aviso' || rb.nivel === 'aviso' ? 'aviso' : 'ok');
      return { ok: ra.ok && rb.ok, nivel, motivos: ra.motivos.concat(rb.motivos) };
    }
    /** Spline (pontos de controle) entre as duas portas no espaço: ver `rotaCabo`. `zonas` = guias. */
    rota(a, na, b, nb, zonas) { return rotaCabo(a, na, b, nb, { zonas }); }
    /** O cabo (de `length` m) é curto demais para a rota real? */
    curtoDemais(rotaPts) { return comprimentoPolilinha(amostrarSpline(rotaPts, 10)) > this.length + 1e-9; }
  }

  // ---- Grupo 2: acessórios de conexão e manobra ------------------------------------------------
  class PassiveAccessory extends NetworkElement {}
  /** Keystone / tomada fêmea RJ-45 de uma categoria: `aceita(plug)` aplica a retrocompatibilidade. */
  class Keystone extends PassiveAccessory {
    constructor(o) { super(o); o = o || {}; this.categoria = CATEGORIAS[o.categoria] ? o.categoria : 'cat6'; this.blindagem = o.blindagem || 'U/UTP'; this.ocupado = false; }
    porta() { return { meio: 'cobre', conector: 'RJ45', categoria: this.categoria, blindagem: this.blindagem }; }
    aceita(plug) { return avaliarConexao(plug, this.porta()); }
  }

  // ---- Grupo 3: acomodação e acessórios de rack ------------------------------------------------
  const U_MM = 44.45;
  class RackElement extends NetworkElement {
    constructor(o) { super(o); o = o || {}; this.heightInU = Math.max(1, Math.round(o.heightInU || 1)); this.rackId = o.rackId || null; this.rackU = o.rackU || null; }
    get alturaMm() { return this.heightInU * U_MM; }
    /** Furos de porca-gaiola (mm, no painel): 1º e 3º furo de cada U, em x = ±232,55. */
    furosGaiola() {
      const out = [];
      for (let u = 0; u < this.heightInU; u++) [6.35, 38.1].forEach((off) => [-1, 1].forEach((s) => out.push({ x: s * 232.55, y: u * U_MM + off })));
      return out;
    }
    /** Fixa no rack: 1 parafuso M6 + porca-gaiola virtual por furo (4 por U). */
    parafusos() { return this.rackId ? this.furosGaiola().length : 0; }
    /** Snap milimétrico: y (mm, base do rack = 0) -> U inteira mais próxima (1..us), ou null. */
    snapU(yMm, us) { const u = Math.round((yMm - this.alturaMm / 2) / U_MM) + 1; return (u >= 1 && u + this.heightInU - 1 <= us) ? u : null; }
  }
  /** DIO: matriz de portas EXCLUSIVAS para conectores ópticos (LC/SC/ST), 1U ou 2U. */
  class DIO extends RackElement {
    constructor(o) {
      o = o || {};
      super(Object.assign({}, o, { heightInU: o.heightInU || (o.portas > 24 ? 2 : 1) }));
      this.conector = CONECTORES[o.conector] && CONECTORES[o.conector].meio === 'fibra' ? o.conector : 'LC';
      this.fibra = FIBRAS[o.fibra] ? o.fibra : 'SMF'; this.portas = o.portas || 12;
    }
    /** Descrição da porta n (para a validação): sempre óptica, do conector do DIO. */
    porta() { return { meio: 'fibra', conector: this.conector, fibra: this.fibra }; }
  }
  /** Guia de cabos com ZONAS DE PASSAGEM: pontos por onde a spline dos cabos é obrigada a passar. */
  class GuiaCabo extends RackElement {
    constructor(o) { o = o || {}; super(o); this.orientacao = o.orientacao === 'vertical' ? 'vertical' : 'horizontal'; this.dedos = o.dedos || 5; }
    /** Zonas (mm, no painel: x a partir do centro, y da base, z=0 na frente) — 1 por vão entre dedos. */
    zonasPassagem() {
      const z = [], W = 440, n = this.dedos + 1;
      for (let i = 0; i < n; i++) z.push({ x: -W / 2 + (i + 0.5) * (W / n), y: this.alturaMm / 2, z: 0 });
      return z;
    }
  }
  class Bandeja extends RackElement { constructor(o) { o = o || {}; super(o); this.basculante = !!o.basculante; this.cargaMaxKg = o.cargaMaxKg || (this.basculante ? 30 : 50); } }
  class PDU extends RackElement { constructor(o) { o = o || {}; super(o); this.tomadas = o.tomadas || 8; this.padrao = o.padrao || 'NBR 14136'; } }
  class FrenteFalsa extends RackElement {}
  class KitVentilacao extends RackElement { constructor(o) { o = o || {}; super(o); this.ventoinhas = o.ventoinhas || 2; } }

  // ---- Grupo 4: infraestrutura física e passagem -----------------------------------------------
  class InfraElement extends NetworkElement {}
  /** Espelho de parede / caixa de piso: aceita 1, 2 ou 4 keystones/módulos. */
  class PlacaTomadas extends InfraElement {
    constructor(o) {
      o = o || {};
      super(o);
      this.slots = [1, 2, 4].includes(o.slots) ? o.slots : 1;
      this.keystones = new Array(this.slots).fill(null);
    }
    /** Encaixa um Keystone no 1º slot livre (ou no `indice`). false se cheio. */
    encaixar(keystone, indice) {
      const i = indice != null ? indice : this.keystones.indexOf(null);
      if (i < 0 || i >= this.slots || this.keystones[i]) return false;
      this.keystones[i] = keystone; keystone.ocupado = true; return true;
    }
  }
  class EspelhoParede extends PlacaTomadas {}
  class CaixaPiso extends PlacaTomadas {}

  // ---- Grupo 5: fixação, organização e identificação -------------------------------------------
  class FixingElement extends NetworkElement {}
  /** Abraçadeira (velcro/nylon): MODIFICADOR agregador — `aplicar()` faz o bunching dos cabos. */
  class Abracadeira extends FixingElement {
    constructor(o) { o = o || {}; super(o); this.material = o.material === 'nylon' ? 'nylon' : 'velcro'; this.pos = o.pos || { x: 0, y: 0, z: 0 }; this.captura = o.captura == null ? 0.25 : o.captura; }
    /** Agrupa as `rotas` (ver `agruparFeixes`) que passam por esta abraçadeira. */
    aplicar(rotas) { return agruparFeixes(rotas, [Object.assign({ id: this.id, captura: this.captura }, this.pos)]); }
  }
  class Etiqueta extends FixingElement {
    constructor(o) { o = o || {}; super(o); this.alvo = o.alvo || null; }
  }

  // ==========================================================================
  // 5) FÁBRICA + CATÁLOGO DE OBJETOS PASSIVOS
  // ==========================================================================
  const CLASSES = { TwistedPairCable, FiberCable, PatchCord, Keystone, DIO, GuiaCabo, Bandeja, PDU, FrenteFalsa, KitVentilacao,
    EspelhoParede, CaixaPiso, Abracadeira, Etiqueta };
  /** `fabricar('DIO', {portas:24})` etc. */
  function fabricar(nome, opt) { const C = CLASSES[nome]; if (!C) throw new RangeError('Classe desconhecida: ' + nome); return new C(opt); }

  /** Tipos de CABO oferecidos no app (chave -> descrição). `plug` é o que as pontas têm. */
  const CABOS = Object.freeze({
    cat5e:      Object.freeze({ rotulo: 'Cat5e (U/UTP)',        meio: 'cobre', categoria: 'cat5e', blindagem: 'U/UTP', cor: '#9aa3ad' }),
    cat6:       Object.freeze({ rotulo: 'Cat6 (U/UTP, azul)',   meio: 'cobre', categoria: 'cat6',  blindagem: 'U/UTP', cor: '#2f6fdb' }),
    cat6a:      Object.freeze({ rotulo: 'Cat6A (F/UTP, vermelho)', meio: 'cobre', categoria: 'cat6a', blindagem: 'F/UTP', cor: '#d8362f' }),
    cat7:       Object.freeze({ rotulo: 'Cat7 (S/FTP, preto)',  meio: 'cobre', categoria: 'cat7',  blindagem: 'S/FTP', cor: '#22262b' }),
    fibra_smf:  Object.freeze({ rotulo: 'Fibra SMF (amarelo)',  meio: 'fibra', fibra: 'SMF', conector: 'LC', cor: '#f0c419' }),
    fibra_om3:  Object.freeze({ rotulo: 'Fibra OM3 (aqua)',     meio: 'fibra', fibra: 'OM3', conector: 'LC', cor: '#22d3ee' }),
    fibra_om4:  Object.freeze({ rotulo: 'Fibra OM4 (violeta)',  meio: 'fibra', fibra: 'OM4', conector: 'LC', cor: '#a855f7' }),
  });
  /** Plug e diâmetro (mm, de cordão) de um tipo de cabo do catálogo `CABOS` (chaves legadas: 'fibra' = OM3). */
  function descreverCabo(tipo) {
    const k = tipo === 'fibra' ? 'fibra_om3' : tipo;
    const c = CABOS[k]; if (!c) return null;
    if (c.meio === 'cobre') return { chave: k, plug: { meio: 'cobre', conector: 'RJ45', categoria: c.categoria, blindagem: c.blindagem }, diametroMm: diametroCobreMm(c.categoria, c.blindagem), cor: c.cor, rotulo: c.rotulo };
    return { chave: k, plug: { meio: 'fibra', conector: c.conector, fibra: c.fibra }, diametroMm: FIBRAS[c.fibra].diametroCordaoMm, cor: c.cor, rotulo: c.rotulo };
  }

  const API = {
    U_MM, CATEGORIAS, BLINDAGENS, FIBRAS, CONECTORES, COMPRIMENTOS_PADRAO_M, CABOS,
    diametroCobreMm, avaliarConexao, areaCaboMm2,
    amostrarSpline, amostrarRotaComRetas, comprimentoPolilinha, rotaCabo, comprimentoPadraoMinimo, agruparFeixes, descreverCabo,
    NetworkElement, CableElement, TwistedPairCable, FiberCable, PatchCord, PassiveAccessory, Keystone,
    RackElement, DIO, GuiaCabo, Bandeja, PDU, FrenteFalsa, KitVentilacao,
    InfraElement, PlacaTomadas, EspelhoParede, CaixaPiso,
    FixingElement, Abracadeira, Etiqueta, fabricar,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.RedePassiva = API;
})(typeof window !== 'undefined' ? window : globalThis);
