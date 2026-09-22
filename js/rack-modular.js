/* =============================================================================
 * rack-modular.js — Objeto paramétrico "Rack Modular de 19 polegadas"
 * -----------------------------------------------------------------------------
 * Script clássico (sem módulos), no padrão do projeto. Expõe:
 *   window.RackModular        -> lógica PURA (sem Three.js): validação, medidas,
 *                                partes, pontos de snap, ocupação, serialização.
 *   window.RackModularView3D  -> montagem/atualização em Three.js (recebe THREE
 *                                por injeção; NÃO recria malhas ao mudar U/prof).
 *   window.RACK_CATALOGO      -> constantes de mercado e matriz de inputs válidos.
 *
 * CONVENÇÕES
 *  - Toda a lógica trabalha em MILÍMETROS. A conversão para a unidade do motor
 *    (ex.: 0.001 = metros) é feita só na camada de view (parâmetro `mmParaUnidade`).
 *  - Origem local: centro do rack no plano XZ; Y = 0 é o ponto mais baixo (chão,
 *    ou, no tipo "parede", a face de baixo da base).
 *  - Eixos: X = largura, Y = altura, Z = profundidade. Frente do rack = +Z.
 *  - Numeração das Us: U1 é a de BAIXO (índice 1..n de baixo para cima). Se o
 *    app preferir U1 no topo (padrão de datacenter), use `rotuloU()`.
 * ========================================================================== */
(function (raiz) {
  'use strict';

  // ==========================================================================
  // 1) CONSTANTES E MATRIZ DE INPUTS VÁLIDOS (regras de negócio)
  // ==========================================================================
  const RACK_CATALOGO = Object.freeze({
    U_MM: 44.45,                       // 1U = 1,75" = 44,45 mm (EIA-310)
    LARGURA_EXTERNA_MM: 600,           // gabinete externo (padrão 19" comercial)
    LARGURA_19_MM: 482.6,              // 19" entre as abas de fixação (EIA-310)
    DISTANCIA_FUROS_MM: 465.1,         // centro-a-centro dos furos, esq/dir (EIA-310)
    // Furos EIA-310: 3 por U, a estas distâncias da BASE da unidade:
    FUROS_POR_U_MM: Object.freeze([6.35, 22.225, 38.1]),

    ALTURAS_U: Object.freeze([1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,22,24,26,28,
                              32,34,36,40,42,44,45,46,47,48,50,52]),
    PROFUNDIDADES_MM: Object.freeze([300,350,450,470,500,570,600,670,700,770,
                                     800,870,1000,1100,1200]),

    // Regra de tipo: <=14U => "parede"; >=16U => "piso".
    LIMITE_PAREDE_U: 14,
    // Rack tipo "parede": altura padrão da BASE em relação ao chão (m), usada como
    // `obj.elevacao` ao colocar/trocar o tipo no mapa (piso => 0).
    ELEVACAO_PAREDE_M: 1.2,

    // Componentes FIXOS (nunca recebem escala vertical — mantêm aspecto 1:1).
    TETO_MM: 40,
    BASE: Object.freeze({
      parede: Object.freeze({ total: 50,  chapa: 50, rodizio: 0  }),
      // Piso: base estrutural mais alta = rodízios (80) + chapa reforçada (40).
      piso:   Object.freeze({ total: 120, chapa: 40, rodizio: 80 }),
    }),
    RODIZIO: Object.freeze({ raio: 30, inset: 70 }),  // inset = recuo dos cantos
    LATERAL_ESP_MM: 20,                // espessura visual das chapas laterais
    PORTA_ESP_MM: 25,                  // espessura das portas (frente/trás)
    TRILHO: Object.freeze({ largura: 20, profundidade: 20, recuo: 60 }),
    FECHADURA: Object.freeze({ w: 30, h: 40, d: 15, margemBorda: 45 }),
    // Chapas metalicas (laterais/topo/base/traseira): folha fina. As portas ficam
    // na "zona de porta" (PORTA_ESP_MM) nas duas pontas da profundidade.
    CHAPA_ESP_MM: 3,
    // Armacao (postes de canto + perfis de topo/base): tubos 40x40 mm.
    ARMACAO_MM: 40,
    // Porta de vidro: moldura de aluminio de 30 mm + vidro (mesmo vidro da Janela).
    MOLDURA_PORTA_MM: 30,
    // Furo quadrado de porca-gaiola (padrao de mercado: 9,5 x 9,5 mm).
    FURO_MM: 9.5,
    // Pecas desmontaveis (chave em obj.rackMontagem) — ordem/rotulos usados pela UI.
    PECAS: Object.freeze([
      Object.freeze({ chave: 'frente',     rotulo: 'Porta frontal (vidro)' }),
      Object.freeze({ chave: 'traseira',   rotulo: 'Traseira (porta ou chapa)' }),
      Object.freeze({ chave: 'lateralEsq', rotulo: 'Chapa lateral esquerda' }),
      Object.freeze({ chave: 'lateralDir', rotulo: 'Chapa lateral direita' }),
      Object.freeze({ chave: 'topo',       rotulo: 'Tampa de cima' }),
      Object.freeze({ chave: 'base',       rotulo: 'Tampa de baixo' }),
    ]),
    TRASEIRA_TIPOS: Object.freeze(['porta', 'chapa']),
    // [19/09/2026 UTC] NOVO (RODADA 205) -- pedido verbatim (prompt de "Engenheiro de Software
    // Principal"): estados configuráveis das tampas de cima/baixo do rack.
    //   'fechada'       -> chapa metálica sólida e contínua (comportamento de sempre).
    //   'com_abertura'  -> chapa com recorte retangular central (passa-cabos) + acabamento de
    //                      borracha/escova de proteção contra poeira nas bordas do recorte.
    //   'sem_tampa'     -> chapa totalmente removida (equivalente ao antigo `montagem.topo/base=false`).
    TAMPA_ESTADOS: Object.freeze(['fechada', 'com_abertura', 'sem_tampa']),
    // Recorte do passa-cabos: fração da largura/profundidade útil da chapa ocupada pelo vão central.
    PASSA_CABOS: Object.freeze({ fracaoLargura: 0.6, fracaoProfundidade: 0.55, escovaEsp: 4, escovaCor: 0x18181a }),
    // Por onde o cabeamento estruturado deve escoar pra fora do rack (regra 4 -- validação física).
    CABLE_ENTRY_OPCOES: Object.freeze(['nenhum', 'top', 'bottom']),
    // [21/09/2026] Alinhamento da abertura (furação) da tampa por onde o feixe de cabos sai:
    // 'center' (centro da tampa), 'left_corner'/'right_corner' (quina TRASEIRA esquerda/direita) ou
    // 'custom' (X/Z locais em `customExitOffset`, metros a partir do centro do rack). `MARGEM_MM` =
    // folga mínima entre a borda da abertura e a borda da chapa.
    CABLE_EXIT_ALINHAMENTOS: Object.freeze(['center', 'left_corner', 'right_corner', 'custom']),
    SAIDA_CABOS: Object.freeze({ margemMm: 20 }),
    // Equipamentos 19" que encaixam nas Us (tipo -> rotulo, cor da frente).
    ACESSORIOS: Object.freeze({
      'switch':        Object.freeze({ rotulo: 'Switch',              cor: 0x3c4658 }),
      'patch-panel':   Object.freeze({ rotulo: 'Patch panel',         cor: 0x59606e }),
      'organizador':   Object.freeze({ rotulo: 'Organizador de cabos', cor: 0x2f3541 }),
      'bandeja':       Object.freeze({ rotulo: 'Bandeja',             cor: 0x767d8b }),
    }),
  });

  // ==========================================================================
  // 2) FUNÇÕES UTILITÁRIAS PURAS
  // ==========================================================================

  /** Altura útil interna (mm) — regra 2: AlturaU_Interna = Us * 44,45. */
  function alturaUtilMm(us) { return us * RACK_CATALOGO.U_MM; }

  /** Tipo padrão pela regra de negócio (<=14U parede, >=16U piso). */
  function tipoPadrao(us) {
    return us <= RACK_CATALOGO.LIMITE_PAREDE_U ? 'parede' : 'piso';
  }

  /** Valida os inputs. Retorna { ok, erros[] } — não lança, p/ uso em UI. */
  function validar(us, profundidade) {
    const erros = [];
    if (!RACK_CATALOGO.ALTURAS_U.includes(us))
      erros.push('Altura inválida: ' + us + 'U. Permitidas: ' + RACK_CATALOGO.ALTURAS_U.join(', '));
    if (!RACK_CATALOGO.PROFUNDIDADES_MM.includes(profundidade))
      erros.push('Profundidade inválida: ' + profundidade + ' mm. Permitidas: ' + RACK_CATALOGO.PROFUNDIDADES_MM.join(', '));
    return { ok: erros.length === 0, erros };
  }

  /** Valor permitido mais próximo (útil p/ slider/entrada livre na UI). */
  function valorMaisProximo(lista, v) {
    return lista.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  }

  // ==========================================================================
  // 3) CLASSE PRINCIPAL — RackModular (lógica pura, sem Three.js)
  // ==========================================================================
  const MONTAGEM_COMPLETA = Object.freeze({ frente: true, traseira: true, lateralEsq: true, lateralDir: true, topo: true, base: true });

  /** Escurece uma cor 0xRRGGBB (fator 0..1) — usada no corpo dos equipamentos. */
  function _escurecer(hex, f) {
    const r = Math.round(((hex >> 16) & 255) * f), g = Math.round(((hex >> 8) & 255) * f), b = Math.round((hex & 255) * f);
    return (r << 16) | (g << 8) | b;
  }

  class RackModular {
    /**
     * @param {object} p
     * @param {number} p.us            Altura em Us (da matriz permitida).
     * @param {number} p.profundidade  Profundidade externa em mm (da matriz).
     * @param {'parede'|'piso'} [p.tipo]  Sobrescreve o tipo padrão (opcional).
     * @param {object} [p.montagem]    Peças presentes (chaves de RACK_CATALOGO.PECAS).
     * @param {'porta'|'chapa'} [p.traseiraTipo]  O que fecha a traseira.
     * @param {Array}  [p.acessorios]  [{id,tipo,uInicial,alturaU}] já instalados.
     * @param {object} [p.tampaEstado]  { topo, base } -- 'fechada'|'com_abertura'|'sem_tampa'.
     * @param {'nenhum'|'top'|'bottom'} [p.cableEntry]  Por onde os cabos escoam pra fora do rack.
     * @param {boolean} [p.chicoteHabilitado]  Liga a organização em chicotes traseiros (RODADA 205).
     * @param {'center'|'left_corner'|'right_corner'|'custom'} [p.cableExitAlignment]  Onde fica a abertura da tampa (padrão 'center').
     * @param {{x:number,y?:number,z:number}} [p.customExitOffset]  X/Z locais (m, a partir do centro do rack) quando 'custom'.
     */
    constructor(p) {
      p = p || {};
      this.us = 0;
      this.profundidade = 0;
      this.tipo = 'parede';
      this._tipoManual = null;   // null => usa a regra automática
      this.montagem = Object.assign({}, MONTAGEM_COMPLETA, p.montagem || {});
      // [19/09/2026 UTC] NOVO (RODADA 205) -- `tampaEstado` é a fonte de verdade de topo/base a
      // partir de agora; `montagem.topo`/`.base` (legado, usado pelo resto de `_montarPartes` e
      // pela UI de "montar/desmontar peças") é DERIVADO dele logo abaixo, nunca o contrário. Se o
      // caller só passou o `montagem` legado (ex.: mapas salvos antes desta rodada, com
      // `topo:false`), herda isso como 'sem_tampa' -- comportamento idêntico ao de sempre.
      const TE = RACK_CATALOGO.TAMPA_ESTADOS;
      const herdar = (chave) => (p.montagem && p.montagem[chave] === false) ? 'sem_tampa' : 'fechada';
      const pTE = p.tampaEstado || {};
      this.tampaEstado = {
        topo: TE.includes(pTE.topo) ? pTE.topo : herdar('topo'),
        base: TE.includes(pTE.base) ? pTE.base : herdar('base'),
      };
      this.montagem.topo = this.tampaEstado.topo !== 'sem_tampa';
      this.montagem.base = this.tampaEstado.base !== 'sem_tampa';
      this.cableEntry = RACK_CATALOGO.CABLE_ENTRY_OPCOES.includes(p.cableEntry) ? p.cableEntry : 'nenhum';
      this.chicoteHabilitado = !!p.chicoteHabilitado;
      this.cableExitAlignment = RACK_CATALOGO.CABLE_EXIT_ALINHAMENTOS.includes(p.cableExitAlignment) ? p.cableExitAlignment : 'center';
      const ceo = p.customExitOffset || {};
      this.customExitOffset = { x: Number(ceo.x) || 0, y: Number(ceo.y) || 0, z: Number(ceo.z) || 0 };
      this.traseiraTipo = RACK_CATALOGO.TRASEIRA_TIPOS.includes(p.traseiraTipo) ? p.traseiraTipo : 'porta';
      this.dim = null;           // medidas calculadas (mm)
      this.partes = [];          // caixas/cilindros (armação, chapas, trilhos, equipamentos)
      this.portas = { frente: null, traseira: null };   // especificação das portas (vidro/metal)
      this.portasAcessorios = [];// conectores/encaixes desenhados na frente dos equipamentos
      this.nosSnap = [];         // matriz de pontos de ancoragem (1 por U)
      this._ocupacao = new Map();// id acessório -> { uInicial, alturaU, tipo }
      (p.acessorios || []).forEach((a) => {
        if (a && a.id && a.uInicial >= 1) this._ocupacao.set(a.id, { uInicial: a.uInicial, alturaU: a.alturaU || 1, tipo: a.tipo || 'switch' });
      });
      this.UpdateDimensions(p.us || 12, p.profundidade || 600, p.tipo);
    }

    // ------------------------------------------------------------------------
    // UpdateDimensions: ÚNICO ponto de entrada para mudar U / profundidade.
    // Recalcula tudo a partir dos dois inputs (fonte única da verdade) e
    // devolve um relatório do que mudou, p/ a view saber o que atualizar.
    // ------------------------------------------------------------------------
    UpdateDimensions(us, profundidade, tipoManual) {
      const v = validar(us, profundidade);
      if (!v.ok) throw new RangeError(v.erros.join(' | '));

      const antes = { us: this.us, profundidade: this.profundidade, tipo: this.tipo };
      if (tipoManual !== undefined) this._tipoManual = tipoManual || null;

      this.us = us;
      this.profundidade = profundidade;
      this.tipo = this._tipoManual || tipoPadrao(us);

      this._calcularMedidas();   // Eixo Y (regra 2) + X fixo + Z
      this._montarNosSnap();     // regra 4: matriz de âncoras

      // Equipamentos que não cabem mais na nova altura são desalocados.
      const soltos = [];
      this._ocupacao.forEach((o, id) => {
        if (o.uInicial + o.alturaU - 1 > this.us) { this._ocupacao.delete(id); soltos.push(id); }
      });
      this._marcarOcupacaoNosNos();
      this._montarPartes();      // regra 3: fixo x esticável x reposicionado

      return {
        mudouAltura: antes.us !== us,
        mudouProfundidade: antes.profundidade !== profundidade,
        mudouTipo: antes.tipo !== this.tipo,     // exige (re)criar rodízios
        acessoriosSoltos: soltos,
      };
    }

    /** Recalcula as peças depois de mudar `montagem`/`traseiraTipo`/equipamentos. */
    Remontar() { this._marcarOcupacaoNosNos(); this._montarPartes(); }

    // ------------------------------------------------------------------------
    // Medidas (mm)
    // ------------------------------------------------------------------------
    _calcularMedidas() {
      const C = RACK_CATALOGO;
      const base = C.BASE[this.tipo];
      const alturaU = alturaUtilMm(this.us);                  // AlturaU_Interna
      this.dim = {
        alturaU,                                              // altura útil
        teto: C.TETO_MM,
        base: base.total,                                     // 50 (parede) | 120 (piso)
        baseChapa: base.chapa,
        rodizio: base.rodizio,
        alturaTotal: alturaU + C.TETO_MM + base.total,        // Altura_Total
        largura: C.LARGURA_EXTERNA_MM,                        // X fixo
        profundidade: this.profundidade,                      // Z (input)
        // Profundidade da armação: descontadas as 2 zonas de porta (frente/trás).
        profundidadeArmacao: this.profundidade - 2 * C.PORTA_ESP_MM,
        yInicioUteis: base.total,                             // onde começa a 1ª U
        yFimUteis: base.total + alturaU,                      // onde o teto começa
      };
    }

    // ------------------------------------------------------------------------
    // Peças. Cada uma traz `grupo` — a que "peça desmontável" pertence:
    //   'armadura' (postes, perfis, trilhos, rodízios — nunca some),
    //   'chapa:lateralEsq|lateralDir|topo|base|traseira', 'acessorio:<id>'.
    // As portas ficam em `this.portas` (têm articulação e vidro, ver abaixo).
    // `modo`: "fixa" (nunca escala em Y), "esticavel_y", "escala_z",
    // "reposiciona_z". `tam`/`pos` = TAMANHO REAL e CENTRO em mm — a view usa
    // `tam` no mapeamento de UV (textura não distorce ao esticar).
    // ------------------------------------------------------------------------
    _montarPartes() {
      const C = RACK_CATALOGO, d = this.dim, M = this.montagem;
      const L = d.largura, P = d.profundidade, Pa = d.profundidadeArmacao;
      const T = C.CHAPA_ESP_MM, eP = C.PORTA_ESP_MM, A = C.ARMACAO_MM;
      const yUi = d.yInicioUteis, yUf = d.yFimUteis;
      const partes = [];
      const add = (id, grupo, modo, tam, pos, extra) =>
        partes.push(Object.assign({ id, grupo, modo, tam, pos }, extra || {}));

      // ===================== ARMAÇÃO (sempre presente) =====================
      // Postes de canto: esticam em Y. Ficam encostados na face interna das laterais.
      const xPoste = L / 2 - T - A / 2, zPoste = Pa / 2 - A / 2;
      [['poste_fe', -1, +1], ['poste_fd', +1, +1], ['poste_te', -1, -1], ['poste_td', +1, -1]].forEach(([id, sx, sz]) =>
        add(id, 'armadura', 'esticavel_y', { x: A, y: d.alturaU, z: A },
          { x: sx * xPoste, y: yUi + d.alturaU / 2, z: sz * zPoste }, { material: 'estrutura' }));
      // Perfis (moldura) de topo e de base: 2 ao longo de X + 2 ao longo de Z.
      // Altura fixa (1:1): ficam sob as tampas, que têm CHAPA_ESP_MM.
      const molduras = (prefixo, yBaixo, altura) => {
        const yc = yBaixo + altura / 2;
        [+1, -1].forEach((sz) => add(prefixo + '_x' + (sz > 0 ? 'f' : 't'), 'armadura', 'escala_z',
          { x: L - 2 * T, y: altura, z: A }, { x: 0, y: yc, z: sz * zPoste }, { material: 'estrutura' }));
        [-1, +1].forEach((sx) => add(prefixo + '_z' + (sx < 0 ? 'e' : 'd'), 'armadura', 'escala_z',
          { x: A, y: altura, z: Pa - 2 * A }, { x: sx * xPoste, y: yc, z: 0 }, { material: 'estrutura' }));
      };
      molduras('moldura_topo', yUf, d.teto - T);
      molduras('moldura_base', d.rodizio, d.baseChapa - T);

      // Trilhos 19" (4 colunas): esticam em Y. Plano de furos em X = ±232,55.
      const R = C.TRILHO, xTri = C.DISTANCIA_FUROS_MM / 2;
      const zTri = Pa / 2 - R.recuo;
      this.planoMontagem = { frontalZ: zTri + R.profundidade / 2, traseiroZ: -zTri - R.profundidade / 2, x: 0 };
      [['trilho_fe', -1, +1], ['trilho_fd', +1, +1], ['trilho_te', -1, -1], ['trilho_td', +1, -1]].forEach(([id, sx, sz]) =>
        add(id, 'armadura', 'esticavel_y', { x: R.largura, y: d.alturaU, z: R.profundidade },
          { x: sx * xTri, y: yUi + d.alturaU / 2, z: sz * zTri }, { material: 'trilho', faceFuros: sz }));

      // Rodízios (só tipo "piso"): tamanho FIXO, nos 4 cantos.
      if (d.rodizio > 0) {
        const RD = C.RODIZIO;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) =>
          add('rodizio_' + (i + 1), 'armadura', 'fixa', { x: RD.raio * 2, y: d.rodizio, z: RD.raio * 2 },
            { x: sx * (L / 2 - RD.inset), y: d.rodizio / 2, z: sz * (P / 2 - RD.inset) },
            { formato: 'cilindro', material: 'rodizio' }));
      }

      // ================= CHAPAS METÁLICAS (removíveis) =====================
      if (M.lateralEsq) add('chapa_lateral_esq', 'chapa:lateralEsq', 'esticavel_y', { x: T, y: d.alturaU, z: P },
        { x: -(L / 2 - T / 2), y: yUi + d.alturaU / 2, z: 0 }, { material: 'chapa' });
      if (M.lateralDir) add('chapa_lateral_dir', 'chapa:lateralDir', 'esticavel_y', { x: T, y: d.alturaU, z: P },
        { x: (L / 2 - T / 2), y: yUi + d.alturaU / 2, z: 0 }, { material: 'chapa' });
      // [19/09/2026 UTC] NOVO (RODADA 205) -- `estadoTampa` viaja junto na parte pra
      // `RackModularView3D` decidir entre chapa sólida (`_criarMalha`, de sempre) e chapa com
      // recorte + escova (`_criarMalhaTampaComAbertura`) quando `estadoTampa==='com_abertura'`.
      if (M.topo) add('chapa_topo', 'chapa:topo', 'escala_z', { x: L, y: T, z: P },
        { x: 0, y: yUf + d.teto - T / 2, z: 0 }, { material: 'chapa', estadoTampa: this.tampaEstado.topo, aberturaOffset: this.aberturaOffsetMm('topo') });
      if (M.base) add('chapa_base', 'chapa:base', 'escala_z', { x: L, y: T, z: P },
        { x: 0, y: d.base - T / 2, z: 0 }, { material: 'chapa', estadoTampa: this.tampaEstado.base, aberturaOffset: this.aberturaOffsetMm('base') });
      if (M.traseira && this.traseiraTipo === 'chapa') add('chapa_traseira', 'chapa:traseira', 'esticavel_y',
        { x: L - 2 * T, y: d.alturaU, z: T }, { x: 0, y: yUi + d.alturaU / 2, z: -P / 2 + T / 2 }, { material: 'chapa' });

      // ============================ PORTAS =================================
      this.portas = {
        frente: M.frente ? this._especificarPorta('frente', 'vidro') : null,
        traseira: (M.traseira && this.traseiraTipo === 'porta') ? this._especificarPorta('traseira', 'metal') : null,
      };

      // ==================== EQUIPAMENTOS NAS Us ============================
      this._montarAcessorios(partes);
      this.partes = partes;
    }

    /**
     * Porta articulada de mercado. Coordenadas das peças RELATIVAS ao pivô (a
     * dobradiça, na base da porta): a folha ocupa x de 0 a dirX*w, y de 0 a h.
     *  - frente: dobradiça à esquerda (visto de frente), folha de VIDRO
     *    temperado com moldura de alumínio + fechadura na borda livre.
     *  - traseira: dobradiça do lado oposto, folha de chapa com grelha de
     *    ventilação + fechadura.
     */
    _especificarPorta(lado, material) {
      const C = RACK_CATALOGO, d = this.dim, T = C.CHAPA_ESP_MM, eP = C.PORTA_ESP_MM, Mo = C.MOLDURA_PORTA_MM, F = C.FECHADURA;
      const w = d.largura - 2 * T, h = d.alturaU, dirX = lado === 'frente' ? +1 : -1, sz = lado === 'frente' ? +1 : -1;
      const pecas = [];
      const cx = dirX * w / 2, cy = h / 2;                    // centro da folha
      const box = (id, tx, ty, tz, px, py, pz, mat) => pecas.push({ id, material: mat, tam: { x: tx, y: ty, z: tz }, pos: { x: px, y: py, z: pz } });
      let vidro = null;
      if (material === 'vidro') {
        // Moldura de alumínio: 4 barras. O vidro (mesmo da Janela) fica no meio da espessura.
        box('moldura_sup', w, Mo, eP, cx, h - Mo / 2, 0, 'moldura');
        box('moldura_inf', w, Mo, eP, cx, Mo / 2, 0, 'moldura');
        box('moldura_esq', Mo, Math.max(h - 2 * Mo, 1), eP, dirX * Mo / 2, cy, 0, 'moldura');
        box('moldura_dir', Mo, Math.max(h - 2 * Mo, 1), eP, dirX * (w - Mo / 2), cy, 0, 'moldura');
        vidro = { w: Math.max(w - 2 * Mo, 1), h: Math.max(h - 2 * Mo, 1), pos: { x: cx, y: cy, z: 0 } };
      } else {
        // Porta metálica cega com grelha de ventilação (o comum na traseira).
        box('folha', w, h, eP * 0.8, cx, cy, 0, 'chapa');
        const nGrelhas = Math.max(0, Math.min(6, Math.floor(h / 150)));
        for (let i = 0; i < nGrelhas; i++) {
          const gy = h * (i + 1) / (nGrelhas + 1);
          box('grelha_' + i, w - 160, 12, 2, cx, gy, sz * (eP * 0.4 + 0.5), 'furo');
        }
      }
      // Fechadura: tamanho FIXO, na borda livre, saliente para fora.
      box('fechadura', F.w, F.h, F.d, dirX * (w - Mo / 2), cy, sz * (eP / 2 + F.d / 2), 'fechadura');
      return {
        lado, material, dirX, w, h, esp: eP,
        // Pivô (dobradiça) no sistema local do rack (mm). y = base da folha.
        pivo: { x: -dirX * (d.largura / 2 - T), y: d.yInicioUteis, z: sz * (d.profundidade / 2 - eP / 2) },
        pecas, vidro,
        campoAngulo: lado === 'frente' ? 'anguloAbertura' : 'anguloAberturaTraseira',
      };
    }

    // ------------------------------------------------------------------------
    // Equipamentos (switch, patch panel...). Frente de 19" x altura em Us, encostada
    // na face frontal dos trilhos; corpo para dentro do rack. As conexões são só
    // desenho (instanciado pela view).
    // ------------------------------------------------------------------------
    _montarAcessorios(partes) {
      const C = RACK_CATALOGO, d = this.dim, U = C.U_MM, L19 = C.LARGURA_19_MM;
      const zF = this.planoMontagem.frontalZ;
      const corpoProf = Math.max(60, Math.min(380, d.profundidadeArmacao - 130));
      this.portasAcessorios = [];
      this._ocupacao.forEach((o, id) => {
        const def = C.ACESSORIOS[o.tipo] || C.ACESSORIOS.switch;
        const no = this.nosSnap[o.uInicial - 1];
        if (!no) return;
        const h = o.alturaU * U, yb = no.yBase, yc = yb + h / 2;
        const grupo = 'acessorio:' + id;
        partes.push({ id: 'acess_' + id + '_frente', grupo, modo: 'fixa', tam: { x: L19, y: h - 1, z: 3 },
          pos: { x: 0, y: yc, z: zF + 1.5 }, cor: def.cor });
        partes.push({ id: 'acess_' + id + '_corpo', grupo, modo: 'fixa',
          tam: { x: L19 - 40, y: h - 3, z: o.tipo === 'bandeja' ? corpoProf : corpoProf * 0.8 },
          pos: { x: 0, y: yc, z: zF - (o.tipo === 'bandeja' ? corpoProf : corpoProf * 0.8) / 2 }, cor: _escurecer(def.cor, 0.6) });
        const zp = zF + 3 + 0.6;
        const porta = (x, y, w, hh) => this.portasAcessorios.push({ x, y, z: zp, w, h: hh, d: 1.2 });
        if (o.tipo === 'switch') {           // 2 fileiras de 12 RJ45 por U (24 portas em 1U)
          const linhas = 2 * o.alturaU;
          for (let r = 0; r < linhas; r++) for (let i = 0; i < 12; i++)
            porta(-200 + i * 16, yb + (r + 0.5) * (h / linhas), 14, 11);
        } else if (o.tipo === 'patch-panel') { // 24 portas por U, 1 fileira por U
          for (let r = 0; r < o.alturaU; r++) for (let i = 0; i < 24; i++)
            porta(-(24 * 18.5) / 2 + 9.25 + i * 18.5, yb + (r + 0.5) * U, 15, 15);
        } else if (o.tipo === 'organizador') { // dedos guia-cabo
          for (let r = 0; r < o.alturaU; r++) for (let i = 0; i < 6; i++)
            porta(-200 + i * 80, yb + (r + 0.5) * U, 60, 26);
        }
      });
    }

    // ------------------------------------------------------------------------
    // Furos dos trilhos: NÃO são esticados — são REPETIDOS a cada 44,45 mm
    // (3 por U: 6,35 / 22,225 / 38,1 mm). Iguais para os 4 trilhos.
    // ------------------------------------------------------------------------
    furosTrilhoY() {
      const C = RACK_CATALOGO, ys = [];
      for (let i = 0; i < this.us; i++)
        for (const off of C.FUROS_POR_U_MM)
          ys.push(this.dim.yInicioUteis + i * C.U_MM + off);
      return ys;
    }

    // ------------------------------------------------------------------------
    // SISTEMA DE SNAP — matriz de nós de ancoragem, 1 por U.
    // Nó i (1..n, de baixo p/ cima): yBase = yInicio + (i-1)*44,45 ; yCentro =
    // yBase + 22,225 ; yTopo = yBase + 44,45. Cálculo multiplicativo (sem soma
    // acumulada) => sem erro de arredondamento crescente nem sobreposição.
    // ------------------------------------------------------------------------
    _montarNosSnap() {
      const C = RACK_CATALOGO, d = this.dim, nos = [];
      for (let i = 1; i <= this.us; i++) {
        const yBase = d.yInicioUteis + (i - 1) * C.U_MM;
        nos.push({ indice: i, rotulo: this.rotuloU(i), yBase, yCentro: yBase + C.U_MM / 2,
                   yTopo: yBase + C.U_MM, ocupadoPor: null });
      }
      this.nosSnap = nos;
    }

    /** Rótulo da U. `topoPrimeiro=true` numera U1 no topo (padrão datacenter). */
    rotuloU(i, topoPrimeiro) { return 'U' + (topoPrimeiro ? this.us - i + 1 : i); }

    /** Posição 3D (mm, locais) onde o equipamento é fixado: frente ou trás. */
    posicaoEncaixe(uInicial, alturaU, face) {
      const yBase = this.nosSnap[uInicial - 1].yBase;
      return { x: this.planoMontagem.x, y: yBase + (alturaU * RACK_CATALOGO.U_MM) / 2,
               z: face === 'traseira' ? this.planoMontagem.traseiroZ : this.planoMontagem.frontalZ,
               larguraUtil: RACK_CATALOGO.LARGURA_19_MM };
    }

    /**
     * Snap: dado o Y (mm, local) onde o usuário soltou o equipamento e a sua
     * altura em Us, devolve a U inicial VÁLIDA e livre mais próxima. Nunca
     * devolve posição sobreposta a outro equipamento nem fora dos trilhos.
     */
    snap(yLocal, alturaAcessorioU, ignorarId) {
      const C = RACK_CATALOGO, hU = alturaAcessorioU;
      if (!(hU >= 1) || hU > this.us) return { ok: false, motivo: 'Acessório maior que o rack.' };
      const yBaseDesejada = yLocal - (hU * C.U_MM) / 2;
      const ideal = Math.round((yBaseDesejada - this.dim.yInicioUteis) / C.U_MM) + 1;
      const max = this.us - hU + 1;
      const alvo = Math.min(Math.max(ideal, 1), max);
      for (let delta = 0; delta <= this.us; delta++) {
        for (const u of (delta === 0 ? [alvo] : [alvo - delta, alvo + delta])) {
          if (u >= 1 && u <= max && this._livre(u, hU, ignorarId)) {
            const no = this.nosSnap[u - 1];
            return { ok: true, uInicial: u, y: no.yBase, yCentro: no.yBase + (hU * C.U_MM) / 2 };
          }
        }
      }
      return { ok: false, motivo: 'Sem espaço livre para ' + hU + 'U.' };
    }

    /** Primeira U livre (de baixo p/ cima) que comporta `hU` Us; 0 se não há. */
    primeiraUlivre(hU) {
      for (let u = 1; u <= this.us - hU + 1; u++) if (this._livre(u, hU)) return u;
      return 0;
    }

    _livre(uInicial, hU, ignorarId) {
      for (const [id, o] of this._ocupacao) {
        if (id === ignorarId) continue;
        if (uInicial <= o.uInicial + o.alturaU - 1 && o.uInicial <= uInicial + hU - 1) return false;
      }
      return true;
    }

    /** Instala um equipamento numa U (após snap). Retorna false se ocupado/fora. */
    ocupar(id, uInicial, alturaU, tipo) {
      if (uInicial < 1 || uInicial + alturaU - 1 > this.us) return false;
      if (!this._livre(uInicial, alturaU, id)) return false;
      this._ocupacao.set(id, { uInicial, alturaU, tipo: tipo || (this._ocupacao.get(id) || {}).tipo || 'switch' });
      this.Remontar();
      return true;
    }
    liberar(id) { this._ocupacao.delete(id); this.Remontar(); }

    _marcarOcupacaoNosNos() {
      this.nosSnap.forEach((n) => { n.ocupadoPor = null; });
      this._ocupacao.forEach((o, id) => {
        for (let u = o.uInicial; u < o.uInicial + o.alturaU; u++)
          if (this.nosSnap[u - 1]) this.nosSnap[u - 1].ocupadoPor = id;
      });
    }

    acessorios() {
      return [...this._ocupacao].map(([id, o]) => ({ id, tipo: o.tipo, uInicial: o.uInicial, alturaU: o.alturaU }));
    }

    // ------------------------------------------------------------------------
    // Integração com Mapa 2D e persistência (as características "ficam" no
    // objeto: 2D e 3D leem os MESMOS campos).
    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // [21/09/2026] Saída de cabos (furação da tampa) -- ver js/rack-cable-routing.js.
    // Coordenadas LOCAIS do rack (mm): x = direita (+) / esquerda (-), y = a partir do piso da base
    // do rack, z = frente (+) / traseira (-) -- a MESMA convenção de `partes[].pos`.
    // ------------------------------------------------------------------------
    /** Deslocamento máximo (mm) do centro da abertura em X/Z sem sair da chapa (tampa topo/base). */
    _saidaLimitesMm() {
      const C = RACK_CATALOGO, d = this.dim, PC = C.PASSA_CABOS, m = C.SAIDA_CABOS.margemMm;
      const hw = d.largura * PC.fracaoLargura / 2, hd = d.profundidade * PC.fracaoProfundidade / 2;
      return { x: Math.max(0, d.largura / 2 - hw - m), z: Math.max(0, d.profundidade / 2 - hd - m) };
    }
    /** Centro (mm, X/Z locais) da abertura da tampa conforme `cableExitAlignment`:
     *  'center' -> (0,0); 'left_corner'/'right_corner' -> quina TRASEIRA esquerda/direita (o mais
     *  perto possível do canto, mantendo a abertura inteira dentro da chapa); 'custom' -> `customExitOffset`
     *  (m) limitado à chapa. */
    posicaoSaidaXZMm() {
      const lim = this._saidaLimitesMm(), a = this.cableExitAlignment;
      if (a === 'left_corner') return { x: -lim.x, z: -lim.z };
      if (a === 'right_corner') return { x: lim.x, z: -lim.z };
      if (a === 'custom') {
        const cl = (v, m) => Math.max(-m, Math.min(m, v));
        return { x: cl(this.customExitOffset.x * 1000, lim.x), z: cl(this.customExitOffset.z * 1000, lim.z) };
      }
      return { x: 0, z: 0 };
    }
    /** Deslocamento da abertura DESTA tampa ('topo'|'base'): só a tampa por onde os cabos saem
     *  (`cableEntry`) acompanha o alinhamento; a outra continua com a abertura central. */
    aberturaOffsetMm(lado) {
      const usa = (lado === 'topo' && this.cableEntry === 'top') || (lado === 'base' && this.cableEntry === 'bottom');
      return usa ? this.posicaoSaidaXZMm() : { x: 0, z: 0 };
    }
    /** Nó de saída (mm, coordenadas locais do rack) no MEIO da chapa da tampa: `{ x, y, z, lado, dirY }` ou
     *  `null` com `cableEntry === 'nenhum'`. `y` = altura do meio da chapa (topo: yFimUteis + teto - chapa/2;
     *  base: base - chapa/2), `dirY` = +1 (sai para cima) / -1 (sai para baixo). */
    posicaoSaidaLocalMm() {
      if (this.cableEntry !== 'top' && this.cableEntry !== 'bottom') return null;
      const C = RACK_CATALOGO, d = this.dim, T = C.CHAPA_ESP_MM, xz = this.posicaoSaidaXZMm();
      const topo = this.cableEntry === 'top';
      return { x: xz.x, y: topo ? d.yFimUteis + d.teto - T / 2 : d.base - T / 2, z: xz.z, lado: topo ? 'topo' : 'base', dirY: topo ? 1 : -1 };
    }

    /** Retângulo ocupado no Mapa 2D (mm) — largura x profundidade. */
    footprint2D() {
      return { largura: this.dim.largura, profundidade: this.dim.profundidade,
               alturaTotal: this.dim.alturaTotal, tipo: this.tipo };
    }
    toJSON() {
      return { kind: 'rackModular19', v: 3, us: this.us, profundidade: this.profundidade, tipo: this._tipoManual,
               montagem: Object.assign({}, this.montagem), traseiraTipo: this.traseiraTipo, acessorios: this.acessorios(),
               tampaEstado: Object.assign({}, this.tampaEstado), cableEntry: this.cableEntry, chicoteHabilitado: this.chicoteHabilitado,
               cableExitAlignment: this.cableExitAlignment, customExitOffset: Object.assign({}, this.customExitOffset) };
    }
    static fromJSON(j) {
      return new RackModular({ us: j.us, profundidade: j.profundidade, tipo: j.tipo, montagem: j.montagem,
                               traseiraTipo: j.traseiraTipo, acessorios: j.acessorios,
                               tampaEstado: j.tampaEstado, cableEntry: j.cableEntry, chicoteHabilitado: j.chicoteHabilitado,
                               cableExitAlignment: j.cableExitAlignment, customExitOffset: j.customExitOffset });
    }

    // ------------------------------------------------------------------------
    // Ponte com o OBJETO DO MAPA (`map.objects[i]`, ver js/mapping.js). O objeto
    // guarda: rackUs, rackProfundidade, rackMontagem, rackTraseiraTipo,
    // rackAcessorios. As medidas 2D/3D (`largura`/`profundidade`/`altura`, em
    // METROS) são DERIVADAS de Us/profundidade por `patchParaObjeto`.
    // ------------------------------------------------------------------------
    /** Reconstrói o rack de um objeto do mapa; valores ausentes/inválidos caem
     *  no permitido mais próximo (padrão 12U x 600 mm, tudo montado, traseira porta). */
    static fromObjeto(obj) {
      const C = RACK_CATALOGO;
      const us = valorMaisProximo(C.ALTURAS_U, Number(obj && obj.rackUs) || 12);
      const prof = valorMaisProximo(C.PROFUNDIDADES_MM, Number(obj && obj.rackProfundidade) || 600);
      return new RackModular({ us, profundidade: prof, montagem: obj && obj.rackMontagem,
                               traseiraTipo: obj && obj.rackTraseiraTipo, acessorios: obj && obj.rackAcessorios,
                               tampaEstado: obj && obj.rackTampaEstado, cableEntry: obj && obj.rackCableEntry,
                               chicoteHabilitado: obj && obj.rackChicoteHabilitado,
                               cableExitAlignment: obj && obj.rackCableExitAlignment, customExitOffset: obj && obj.rackCustomExitOffset });
    }
    /** Patch (para Mapping.updateObject) que aplica novos Us/profundidade ao
     *  objeto: parâmetros + forma 2D + altura total + elevação (parede/piso). */
    static patchParaObjeto(obj, us, profundidade) {
      const antes = RackModular.fromObjeto(obj);
      const r = RackModular.fromObjeto(obj);
      r.UpdateDimensions(us, profundidade);
      const patch = {
        rackUs: r.us, rackProfundidade: r.profundidade,
        forma: 'retangulo',
        largura: r.dim.largura / 1000,
        profundidade: r.dim.profundidade / 1000,
        altura: r.dim.alturaTotal / 1000,
        rackAcessorios: r.acessorios(),      // os que não cabem mais saem sozinhos
      };
      if (antes.tipo !== r.tipo || typeof (obj && obj.elevacao) !== 'number')
        patch.elevacao = r.tipo === 'parede' ? RACK_CATALOGO.ELEVACAO_PAREDE_M : 0;
      return patch;
    }
    /** Liga/desliga peças: `mudancas` = { frente:false, topo:true, ... }. */
    static patchMontagem(obj, mudancas) {
      const atual = Object.assign({}, MONTAGEM_COMPLETA, (obj && obj.rackMontagem) || {});
      RACK_CATALOGO.PECAS.forEach((p) => { if (mudancas && p.chave in mudancas) atual[p.chave] = !!mudancas[p.chave]; });
      const patch = { rackMontagem: atual };
      // [21/09/2026] CORRIGIDO -- pedido verbatim: "as opções 'Tampa de baixo' e 'Tampa de cima'
      // acabam não aplicando o efeito imediatamente." Desde a RODADA 205 quem manda de verdade em
      // topo/base é `rackTampaEstado` (não mais `rackMontagem.topo/base`, que virou só espelho
      // legado) -- `fromObjeto`/o construtor SEMPRE re-derivam `this.montagem.topo/base` a partir
      // de `rackTampaEstado`, então marcar/desmarcar aqui sem também mexer em `rackTampaEstado`
      // era sobrescrito na hora seguinte e nunca aparecia no 3D. Sincroniza os dois: desmarcado
      // -> 'sem_tampa' (tampa removida); marcado -> 'fechada' (chapa sólida), A MENOS que já
      // estivesse 'com_abertura' (preserva o furo -- só "reinstala" a chapa, não fecha sozinho).
      ['topo', 'base'].forEach((chave) => {
        if (!mudancas || !(chave in mudancas)) return;
        const atualTE = Object.assign({ topo: 'fechada', base: 'fechada' }, obj && obj.rackTampaEstado, patch.rackTampaEstado);
        const novoEstado = mudancas[chave] ? (atualTE[chave] === 'sem_tampa' ? 'fechada' : atualTE[chave]) : 'sem_tampa';
        if (novoEstado !== atualTE[chave]) { atualTE[chave] = novoEstado; patch.rackTampaEstado = atualTE; }
      });
      return patch;
    }
    static patchDesmontarTudo(obj) {
      const m = {}; RACK_CATALOGO.PECAS.forEach((p) => { m[p.chave] = false; });
      return RackModular.patchMontagem(obj, m);
    }
    static patchMontarTudo(obj) {
      const m = {}; RACK_CATALOGO.PECAS.forEach((p) => { m[p.chave] = true; });
      return RackModular.patchMontagem(obj, m);
    }
    static patchTraseiraTipo(obj, tipo) {
      return { rackTraseiraTipo: RACK_CATALOGO.TRASEIRA_TIPOS.includes(tipo) ? tipo : 'porta' };
    }
    // [19/09/2026 UTC] NOVO (RODADA 205) -- SAÍDA ESPERADA (1): "Métodos de atualização de estado
    // das tampas e re-renderização geométrica do rack na tela." `chave` é 'topo'|'base'; `estado` é
    // um de `RACK_CATALOGO.TAMPA_ESTADOS`. Segue o mesmo padrão `patch*` dos demais métodos desta
    // classe (devolve um patch pro objeto do mapa -- quem persiste/re-renderiza é o chamador, via
    // `Mapping.updateObject`/`RackModularView3D.atualizar()`, igual a `patchMontagem`).
    static patchTampaEstado(obj, chave, estado) {
      if (chave !== 'topo' && chave !== 'base') return {};
      const est = RACK_CATALOGO.TAMPA_ESTADOS.includes(estado) ? estado : 'fechada';
      const atual = Object.assign({ topo: 'fechada', base: 'fechada' }, obj && obj.rackTampaEstado);
      atual[chave] = est;
      return { rackTampaEstado: atual };
    }
    /** Por onde o cabeamento deve escoar pra fora do rack -- usado por `validateRackCableExit`. */
    static patchCableEntry(obj, entrada) {
      return { rackCableEntry: RACK_CATALOGO.CABLE_ENTRY_OPCOES.includes(entrada) ? entrada : 'nenhum' };
    }
    /** [21/09/2026] Direção da saída dos cabos: 'top' | 'bottom' | 'nenhum' (roteamento automático desligado). */
    static patchCableExitDirection(obj, direcao) { return RackModular.patchCableEntry(obj, direcao); }
    /** [21/09/2026] Alinhamento da abertura da tampa: 'center' | 'left_corner' | 'right_corner' | 'custom'. */
    static patchCableExitAlignment(obj, alinhamento) {
      return { rackCableExitAlignment: RACK_CATALOGO.CABLE_EXIT_ALINHAMENTOS.includes(alinhamento) ? alinhamento : 'center' };
    }
    /** [21/09/2026] X/Z (m, a partir do centro do rack) da abertura quando o alinhamento é 'custom'. */
    static patchCustomExitOffset(obj, x, z) {
      const atual = (obj && obj.rackCustomExitOffset) || {};
      return { rackCustomExitOffset: { x: Number.isFinite(x) ? x : (Number(atual.x) || 0), y: 0, z: Number.isFinite(z) ? z : (Number(atual.z) || 0) } };
    }
    /** [21/09/2026] Organização do feixe de cabos: formato 'retangular' | 'cilindrico'. */
    static patchCabosFormato(obj, formato) { return { rackCabosFormato: formato === 'cilindrico' ? 'cilindrico' : 'retangular' }; }
    /** [21/09/2026] Espaçamento entre cabos: 'junto' (colados, padrão) | 'afastado' | 'livre' (usa `rackCabosFator`). */
    static patchCabosEspacamento(obj, esp) { return { rackCabosEspacamento: esp === 'afastado' || esp === 'livre' ? esp : 'junto' }; }
    /** [21/09/2026] Distância centro a centro entre cabos, em múltiplos do diâmetro (0,87 = colados a 3,00; só vale em 'livre'). */
    static patchCabosFator(obj, fator) { const f = Number(fator); return { rackCabosFator: Number.isFinite(f) ? Math.min(3, Math.max(0.87, f)) : 1.06 }; }
    /** [21/09/2026] Distância VERTICAL entre os agrupamentos (feixes na horizontal): 'junto' (padrão) | 'afastado' | 'livre' (usa `rackCabosFatorV`). */
    static patchCabosEspacamentoV(obj, esp) { return { rackCabosEspacamentoV: esp === 'afastado' || esp === 'livre' ? esp : 'junto' }; }
    /** [21/09/2026] Distância vertical entre agrupamentos em múltiplos do diâmetro (0,87 = colados a 6,00). */
    static patchCabosFatorV(obj, fator) { const f = Number(fator); return { rackCabosFatorV: Number.isFinite(f) ? Math.min(6, Math.max(0.87, f)) : 2 }; }
    /** Liga/desliga a organização em chicotes traseiros (opcional -- requisito 4 do pedido). */
    static patchChicoteHabilitado(obj, habilitado) {
      return { rackChicoteHabilitado: !!habilitado };
    }
    // [19/09/2026 UTC] NOVO (RODADA 205) -- SAÍDA ESPERADA (3): "A função de validação de
    // consistência física que impede anomalias visuais (cabos atravessando chapas de metal
    // fechadas)." Puramente informativa -- NÃO lança e NÃO impede a ação, só relata; quem chama
    // (motor 3D) decide como sinalizar (ex.: pintar o super feixe de vermelho piscante + toast).
    // Aceita tanto um objeto de mapa cru quanto uma instância já construída de `RackModular`.
    static validateRackCableExit(rackObjOuInstancia) {
      const r = rackObjOuInstancia instanceof RackModular ? rackObjOuInstancia : RackModular.fromObjeto(rackObjOuInstancia);
      const alertas = [];
      if (r.cableEntry === 'top' && r.tampaEstado.topo === 'fechada') {
        alertas.push({ lado: 'topo', mensagem: "Erro: Cabos obstruídos. Altere a configuração da tampa superior para 'com_abertura' ou 'sem_tampa'." });
      }
      if (r.cableEntry === 'bottom' && r.tampaEstado.base === 'fechada') {
        alertas.push({ lado: 'base', mensagem: "Erro: Cabos obstruídos. Altere a configuração da tampa inferior para 'com_abertura' ou 'sem_tampa'." });
      }
      return { ok: alertas.length === 0, alertas };
    }
    /** Adiciona um equipamento na 1ª U livre (ou em `uInicial`, se der). null se não cabe. */
    static patchAddAcessorio(obj, tipo, alturaU, uInicial, novoId) {
      if (!RACK_CATALOGO.ACESSORIOS[tipo]) return null;
      const r = RackModular.fromObjeto(obj);
      const h = Math.max(1, Math.round(alturaU) || 1);
      let u = uInicial ? Math.round(uInicial) : r.primeiraUlivre(h);
      if (!u || !r.ocupar(novoId, u, h, tipo)) {
        u = r.primeiraUlivre(h);
        if (!u || !r.ocupar(novoId, u, h, tipo)) return null;
      }
      return { rackAcessorios: r.acessorios() };
    }
    static patchRemoveAcessorio(obj, id) {
      const r = RackModular.fromObjeto(obj);
      r.liberar(id);
      return { rackAcessorios: r.acessorios() };
    }

    /** Componentes "de fábrica" do Rack (mesmo esquema do Script da Porta, sem
     *  maçaneta): Script com `aoClicarDuasVezes` + Gatilho "Ao Clicar Duas Vezes".
     *  `uid` = função geradora de ids (Utils.uid). O hit-test do duplo clique
     *  só chega aqui quando a mira está numa PORTA (ver View3D). */
    static componentesPadrao(uid) {
      const gerar = uid || ((p) => p + '_' + Math.random().toString(36).slice(2, 10));
      const scriptId = gerar('comp'), trigId = gerar('comp');
      return [
        { id: scriptId, type: 'Script', enabled: true, code: RACK_SCRIPT_PORTA },
        { id: trigId, type: 'EventTrigger', enabled: true,
          events: [{ event: 'onDoubleClick', actions: [{ targetComponentId: scriptId, method: 'aoClicarDuasVezes', args: [] }] }] },
      ];
    }
  }

  // Script de fábrica do Rack (adaptação do script da Porta: sem maçaneta, ângulo
  // de abertura de rack ~110°, e 2 portas — `obj._rackPortaAcertada` diz qual foi
  // acertada pela mira: 'frente' (vidro) ou 'traseira').
  const RACK_SCRIPT_PORTA = [
    '/**',
    ' * Rack: abre/fecha a PORTA acertada pelo duplo clique. O motor 3D anima',
    ' * sozinho (Engine3D._updateRackDoorAnimations) olhando os campos abaixo:',
    ' *   obj.anguloAbertura          -> porta da frente (vidro), 0..110 graus',
    ' *   obj.anguloAberturaTraseira  -> porta de trás (quando houver)',
    ' */',
    'function Start() {',
    '  if (obj.anguloAbertura === undefined) obj.anguloAbertura = 0;',
    '  if (obj.anguloAberturaTraseira === undefined) obj.anguloAberturaTraseira = 0;',
    '}',
    '',
    'function Update() {',
    '  // Nada por quadro — a animação suave é feita pelo motor 3D.',
    '}',
    '',
    'var ABERTURA_GRAUS = 110;',
    'var _debounceAte = 0;',
    '',
    '// A velocidade dos 2 cliques do duplo clique influencia a velocidade da porta.',
    'function _calcularVelocidadeGrausPorSeg() {',
    "  var intervaloMs = (typeof view3d !== 'undefined' && view3d && typeof view3d._ultimoIntervaloDuploCliqueMs === 'number')",
    '    ? view3d._ultimoIntervaloDuploCliqueMs',
    '    : 300;',
    '  var MS_MIN = 100, MS_MAX = 600;',
    '  var t = (Math.max(MS_MIN, Math.min(MS_MAX, intervaloMs)) - MS_MIN) / (MS_MAX - MS_MIN);',
    '  var RAPIDO = 90 / 0.25, LENTO = 90 / 0.8;',
    '  return RAPIDO + (LENTO - RAPIDO) * t;',
    '}',
    '',
    '/** Gatilho "Ao Clicar Duas Vezes" (só dispara com a mira numa PORTA do rack). */',
    'function aoClicarDuasVezes() {',
    '  var agora = Date.now();',
    '  if (agora < _debounceAte) return;',
    '  var velocidade = _calcularVelocidadeGrausPorSeg();',
    '  obj._velocidadeGrausPorSeg = velocidade;',
    '  _debounceAte = agora + Math.round((ABERTURA_GRAUS / velocidade) * 1000) + 50;',
    "  var campo = obj._rackPortaAcertada === 'traseira' ? 'anguloAberturaTraseira' : 'anguloAbertura';",
    '  var estaAberta = (obj[campo] || 0) > 45;',
    '  obj[campo] = estaAberta ? 0 : ABERTURA_GRAUS;',
    '}',
    '',
  ].join('\n');

  // ==========================================================================
  // 4) VIEW THREE.JS — cria as malhas das PEÇAS (caixas) e dos furos/conectores
  //    instanciados. As PORTAS (vidro + dobradiça animada) são montadas pelo
  //    motor (Engine3D._buildRackMesh), que tem o vidro da Janela.
  // ==========================================================================
  class RackModularView3D {
    /**
     * @param {object} THREE  Biblioteca injetada.
     * @param {RackModular} rack
     * @param {object} [opt]
     * @param {number} [opt.mmParaUnidade=0.001]  mm -> unidade do motor.
     * @param {object} [opt.materiais]  { estrutura, chapa, trilho, rodizio, furo }
     * @param {function} [opt.criarMaterial]  (corHex) => material (peças com `cor`, ex. equipamentos)
     * @param {number} [opt.texturaTileMm=200]    Tamanho real que 1 repetição de textura cobre.
     */
    constructor(THREE, rack, opt) {
      opt = opt || {};
      this.THREE = THREE;
      this.rack = rack;
      this.k = opt.mmParaUnidade || 0.001;
      this.tile = opt.texturaTileMm || 200;
      this.mat = Object.assign({}, this._materiaisPadrao(), opt.materiais || {});
      this._criarMaterial = opt.criarMaterial || null;
      this._matPorCor = new Map();
      this.grupo = new THREE.Group();
      this.grupo.name = 'RackModular19';
      this.malhas = new Map();
      this._sync();
    }

    _materiaisPadrao() {
      const T = this.THREE, m = (c) => new T.MeshStandardMaterial({ color: c, metalness: .5, roughness: .55 });
      return { estrutura: m(0x1e2126), chapa: m(0x2b2f36), trilho: m(0x9aa0a8), rodizio: m(0x111111),
               furo: new T.MeshBasicMaterial({ color: 0x050505 }) };
    }

    _materialDe(p) {
      if (p.cor != null) {
        if (!this._matPorCor.has(p.cor))
          this._matPorCor.set(p.cor, this._criarMaterial ? this._criarMaterial(p.cor)
            : new this.THREE.MeshStandardMaterial({ color: p.cor, metalness: .3, roughness: .6 }));
        return this._matPorCor.get(p.cor);
      }
      return this.mat[p.material] || this.mat.chapa;
    }

    /** UVs em ESCALA DE MUNDO (1 repetição = `tile` mm) — esticar em Y/Z nunca achata a textura. */
    _dimensionarCaixa(geo, t) {
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      if (!geo.userData.base) { geo.userData.base = Float32Array.from(pos.array); geo.userData.uv0 = Float32Array.from(uv.array); }
      const b = geo.userData.base, u0 = geo.userData.uv0, s = this.k;
      for (let i = 0; i < pos.count; i++) pos.setXYZ(i, b[i*3] * t.x * s, b[i*3+1] * t.y * s, b[i*3+2] * t.z * s);
      const dimsFace = [[t.z, t.y],[t.z, t.y],[t.x, t.z],[t.x, t.z],[t.x, t.y],[t.x, t.y]];
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, u0[i*2] * dimsFace[f][0] / this.tile, u0[i*2+1] * dimsFace[f][1] / this.tile);
      }
      pos.needsUpdate = true; uv.needsUpdate = true;
      geo.computeBoundingSphere(); geo.computeBoundingBox();
    }

    _criarMalha(p) {
      const T = this.THREE;
      let geo;
      if (p.formato === 'cilindro') geo = new T.CylinderGeometry(p.tam.x / 2 * this.k, p.tam.x / 2 * this.k, p.tam.y * this.k, 16);
      else { geo = new T.BoxGeometry(1, 1, 1); this._dimensionarCaixa(geo, p.tam); }
      const m = new T.Mesh(geo, this._materialDe(p));
      m.name = p.id; m.castShadow = m.receiveShadow = true;
      m.userData.rackParte = p.grupo;
      this.grupo.add(m); this.malhas.set(p.id, m);
      return m;
    }

    // [19/09/2026 UTC] NOVO (RODADA 205) -- pedido verbatim: "'com_abertura': A chapa é
    // renderizada com um recorte retangular central vazado (passa-cabos) dotado de acabamento de
    // borracha/escova de proteção contra poeira." A chapa (topo/base) é HORIZONTAL -- espessura ao
    // longo de Y, largura/profundidade em X/Z -- diferente da placa frontal vertical de
    // rede-equip.js (espessura em Z), por isso o Shape é desenhado em (x,z) e a extrusão é rodada
    // pra Y depois (`geo.rotateX`). Reaproveita o MESMO padrão de "shape com buraco" já usado em
    // `_construirAtivo`/`_construirPassivo` (rede-equip.js) pra furos de conector, só que aqui o
    // buraco é o próprio passa-cabos, sem nenhum conector dentro. Devolve a geometria (mundo real,
    // já na unidade do motor -- NÃO passa por `_dimensionarCaixa`, que assume um BoxGeometry
    // unitário reescalado).
    _geometriaTampaComAbertura(p) {
      const T = this.THREE, k = this.k, PC = RACK_CATALOGO.PASSA_CABOS;
      const w = p.tam.x * k, prof = p.tam.z * k, esp = p.tam.y * k;
      const hw = (w * PC.fracaoLargura) / 2, hd = (prof * PC.fracaoProfundidade) / 2;
      // [21/09/2026] centro da abertura deslocado (alinhamento da saída de cabos) -- a chapa em si continua centrada.
      const ao = p.aberturaOffset || { x: 0, z: 0 }, ox = ao.x * k, oz = ao.z * k;
      const sh = new T.Shape();
      sh.moveTo(-w / 2, -prof / 2); sh.lineTo(w / 2, -prof / 2); sh.lineTo(w / 2, prof / 2); sh.lineTo(-w / 2, prof / 2); sh.closePath();
      const furo = new T.Path();
      furo.moveTo(ox - hw, oz - hd); furo.lineTo(ox + hw, oz - hd); furo.lineTo(ox + hw, oz + hd); furo.lineTo(ox - hw, oz + hd); furo.closePath();
      sh.holes.push(furo);
      const geo = new T.ExtrudeGeometry(sh, { depth: esp, bevelEnabled: false, curveSegments: 4 });
      geo.rotateX(Math.PI / 2);   // Shape em (x,z) + extrusão em Z-local -> vira Y depois de rodar
      geo.translate(0, esp / 2, 0); // recentraliza a espessura em torno de y=0 (mesma convenção da caixa)
      return { geo, hw, hd, esp, ox, oz };
    }

    /** 4 barras finas de borracha/escova em volta do recorte (só decorativo -- sem física real).
     *  Devolve `{ mesh, offsetLocal }[]` -- `offsetLocal` é a posição RELATIVA ao centro da chapa
     *  (`p.pos`), pra `_sync` conseguir reposicionar depois sem recriar as barras a cada quadro. */
    _criarEscovaFrame(hw, hd, esp, ox = 0, oz = 0) {
      const T = this.THREE, PC = RACK_CATALOGO.PASSA_CABOS, matEscova = this._matEscova || (this._matEscova =
        new T.MeshStandardMaterial({ color: PC.escovaCor, roughness: 0.95, metalness: 0 }));
      const espEscova = PC.escovaEsp * this.k, out = [];
      const bar = (largura, profundidade, cx, cz) => {
        const mesh = new T.Mesh(new T.BoxGeometry(largura, esp * 0.9, profundidade), matEscova);
        out.push({ mesh, offsetLocal: { x: cx, y: 0, z: cz } });
      };
      // 2 barras ao longo de X (bordas -z/+z do recorte) + 2 ao longo de Z (bordas -x/+x).
      bar(hw * 2 + espEscova * 2, espEscova, ox, oz - hd - espEscova / 2);
      bar(hw * 2 + espEscova * 2, espEscova, ox, oz + hd + espEscova / 2);
      bar(espEscova, hd * 2, ox - hw - espEscova / 2, oz);
      bar(espEscova, hd * 2, ox + hw + espEscova / 2, oz);
      return out;
    }

    /** Cria (ou recria) a malha de uma tampa 'com_abertura' + suas 4 barras de escova, todas
     *  registradas em `this.malhas` sob `p.id` e `p.id + '_escovaN'` (pra `_sync` conseguir
     *  limpar/detectar mudança de estado e reposicionar depois). */
    _criarMalhaTampaComAbertura(p) {
      const T = this.THREE, k = this.k;
      const { geo, hw, hd, esp, ox, oz } = this._geometriaTampaComAbertura(p);
      const m = new T.Mesh(geo, this._materialDe(p));
      m.name = p.id; m.castShadow = m.receiveShadow = true;
      m.userData.rackParte = p.grupo; m.userData.estadoTampa = 'com_abertura';
      m.userData.aberturaKey = ((p.aberturaOffset && p.aberturaOffset.x) || 0) + '|' + ((p.aberturaOffset && p.aberturaOffset.z) || 0);
      this.grupo.add(m); this.malhas.set(p.id, m);
      this._criarEscovaFrame(hw, hd, esp, ox, oz).forEach(({ mesh, offsetLocal }, i) => {
        mesh.name = p.id + '_escova' + i; mesh.userData.rackParte = p.grupo;
        mesh.userData._offsetLocal = offsetLocal;
        mesh.position.set(p.pos.x * k + offsetLocal.x, p.pos.y * k + offsetLocal.y, p.pos.z * k + offsetLocal.z);
        this.grupo.add(mesh); this.malhas.set(mesh.name, mesh);
      });
      return m;
    }

    _sync() {
      const ids = new Set(this.rack.partes.map((p) => p.id));
      for (const [id, m] of this.malhas) {
        const idBase = id.replace(/_escova\d+$/, '');
        if (!ids.has(idBase)) { this.grupo.remove(m); m.geometry.dispose(); this.malhas.delete(id); }
      }
      for (const p of this.rack.partes) {
        const querAbertura = p.estadoTampa === 'com_abertura';
        let m = this.malhas.get(p.id);
        const tinhaAbertura = !!(m && m.userData.estadoTampa === 'com_abertura');
        // Estado da tampa mudou ('fechada'<->'com_abertura') -- a geometria não é reescalável
        // como as caixas normais, precisa ser recriada do zero (inclui as barras de escova).
        const chaveAb = querAbertura ? (((p.aberturaOffset && p.aberturaOffset.x) || 0) + '|' + ((p.aberturaOffset && p.aberturaOffset.z) || 0)) : '';
        const abMudou = !!(m && querAbertura && tinhaAbertura && m.userData.aberturaKey !== chaveAb);   // [21/09/2026] alinhamento da saída mudou -> recria o recorte
        if (m && (querAbertura !== tinhaAbertura || abMudou)) {
          this.grupo.remove(m); m.geometry.dispose(); this.malhas.delete(p.id);
          ['_escova0', '_escova1', '_escova2', '_escova3'].forEach((suf) => {
            const esc = this.malhas.get(p.id + suf);
            if (esc) { this.grupo.remove(esc); esc.geometry.dispose(); this.malhas.delete(p.id + suf); }
          });
          m = null;
        }
        if (!m) m = querAbertura ? this._criarMalhaTampaComAbertura(p) : this._criarMalha(p);
        m.userData.rackParte = p.grupo;
        if (p.formato !== 'cilindro' && !querAbertura) this._dimensionarCaixa(m.geometry, p.tam);
        m.position.set(p.pos.x * this.k, p.pos.y * this.k, p.pos.z * this.k);
        if (querAbertura) {
          ['_escova0', '_escova1', '_escova2', '_escova3'].forEach((suf) => {
            const esc = this.malhas.get(p.id + suf);
            if (esc && esc.userData._offsetLocal) {
              const o = esc.userData._offsetLocal;
              esc.position.set(p.pos.x * this.k + o.x, p.pos.y * this.k + o.y, p.pos.z * this.k + o.z);
            }
          });
        }
      }
      this._sincronizarFuros();
      this._sincronizarConectores();
    }

    /** Furos quadrados EIA-310 (porca-gaiola): InstancedMesh pré-alocado p/ 52U. */
    _sincronizarFuros() {
      const T = this.THREE, r = this.rack, F = RACK_CATALOGO.FURO_MM;
      const MAX = 4 * RACK_CATALOGO.FUROS_POR_U_MM.length * 52;
      if (!this.furos) {
        this.furos = new T.InstancedMesh(new T.BoxGeometry(F * this.k, F * this.k, 1.2 * this.k), this.mat.furo, MAX);
        this.furos.name = 'furos_trilhos'; this.furos.userData.rackParte = 'armadura';
        this.grupo.add(this.furos);
      }
      const ys = r.furosTrilhoY(), M = new T.Matrix4();
      let n = 0;
      r.partes.filter((p) => p.id.startsWith('trilho_')).forEach((tr) => {
        const zFace = tr.pos.z + tr.faceFuros * (tr.tam.z / 2);
        ys.forEach((y) => { M.setPosition(tr.pos.x * this.k, y * this.k, zFace * this.k); this.furos.setMatrixAt(n++, M); });
      });
      this.furos.count = n;
      this.furos.instanceMatrix.needsUpdate = true;
    }

    /** Conectores/encaixes (RJ45, dedos guia-cabo) na frente dos equipamentos. */
    _sincronizarConectores() {
      const T = this.THREE, lista = this.rack.portasAcessorios;
      const MAX = 52 * 48 + 64;
      if (!this.conectores) {
        this.conectores = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), this.mat.furo, MAX);
        this.conectores.name = 'conectores_equipamentos'; this.conectores.userData.rackParte = 'armadura';
        this.grupo.add(this.conectores);
      }
      const M = new T.Matrix4(), q = new T.Quaternion(), pos = new T.Vector3(), sc = new T.Vector3();
      const n = Math.min(lista.length, MAX);
      for (let i = 0; i < n; i++) {
        const c = lista[i];
        pos.set(c.x * this.k, c.y * this.k, c.z * this.k); sc.set(c.w * this.k, c.h * this.k, c.d * this.k);
        M.compose(pos, q, sc); this.conectores.setMatrixAt(i, M);
      }
      this.conectores.count = n;
      this.conectores.instanceMatrix.needsUpdate = true;
    }

    atualizar() { this._sync(); }
    UpdateDimensions(us, profundidade, tipo) {
      const rel = this.rack.UpdateDimensions(us, profundidade, tipo);
      this.atualizar();
      return rel;
    }
  }

  const API = { RackModular, RackModularView3D, RACK_CATALOGO,
                utils: { alturaUtilMm, tipoPadrao, validar, valorMaisProximo } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { raiz.RackModular = RackModular; raiz.RackModularView3D = RackModularView3D;
         raiz.RACK_CATALOGO = RACK_CATALOGO; raiz.RackUtils = API.utils; }
})(typeof window !== 'undefined' ? window : globalThis);
