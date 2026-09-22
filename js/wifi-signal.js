/* ============================================================================
 * wifi-signal.js  --  Access Point (AP) + Motor de Mapeamento Volumétrico de Sinal Wi-Fi 3D
 * [21/09/2026 UTC] NOVO.
 *
 * O que este módulo faz
 * ---------------------
 *  1) `AccessPoint`: modelo de estado de um AP do mapa (objeto do tipo 'access_point', família 'ap' em
 *     rede-equip.js). Propriedades: `isOn`, `hasCableConnected`, `signalFrequency`, `powerWatts`. O AP tem 1 porta
 *     RJ-45 (a "porta 1", que aceita cabo estruturado/patch cord como qualquer outra porta do sistema de rede).
 *     O sinal só é gerado/mostrado quando `isOn && hasCableConnected` (o cabo entrega dados + PoE).
 *  2) Diagrama de antena semi-direcional (cardioide): ganho máximo no eixo +Z LOCAL do AP (a "frente"), caindo para os
 *     lados e para trás:   g(θ) = piso + (1 - piso) * ((1 + cosθ) / 2)^diretividade      (θ = ângulo p/ o eixo +Z).
 *  3) Varredura por raycast em grade esférica (passo em graus configurável, padrão 5°), ASSÍNCRONA: processada em
 *     micro-lotes por quadro (requestAnimationFrame) com orçamento de tempo, para não travar a thread principal (60 FPS).
 *  4) Física: intensidade I(d) = P0 / d², com P0 = potência × ganho(θ) × fator da faixa; cada barreira atravessada retira
 *     uma fração do sinal RESTANTE (alvenaria/concreto/pilar/viga 80%, porta de madeira/divisória 30%, vidro/janela 15%).
 *  5) O resultado vira uma malha `THREE.BufferGeometry` translúcida (cascas aninhadas por nível de sinal, com gradiente
 *     verde → amarelo → vermelho feito num ShaderMaterial), com fade-in ao terminar.
 *  6) `scanProgress` (0–100) alimenta a barra de progresso HTML/CSS do painel do AP.
 *
 * Sem dependências além do Three.js já carregado pela engine (recebida via `engine.THREE`).
 * Exposto em `window.WifiSignal`.
 * ========================================================================== */
(function (raiz) {
  'use strict';

  // ==========================================================================
  // 1) CONSTANTES FÍSICAS / DE CALIBRAÇÃO
  // ==========================================================================

  /** Fração do sinal RESTANTE removida ao atravessar cada tipo de barreira. */
  const ATENUACAO = Object.freeze({ alvenaria: 0.80, concreto: 0.80, pilar: 0.80, viga: 0.80, metal: 0.80, madeira: 0.30, divisoria: 0.30, vidro: 0.15 });

  /**
   * Faixas: `fator` escala P0 (frequências maiores → alcance menor, na média). `potenciaPadraoW` -- [21/09/2026]
   * NOVO, pedido verbatim: "coloque valores reais de potência de sinal de dispositivos wi-fi do mercado. Por
   * exemplo, 28 dBm (630 mW) em 2,4 GHz e 27 dBm (501 mW) em 5 GHz." -- são as potências de saída (EIRP) TÍPICAS
   * de APs Wi-Fi comerciais/enterprise por faixa (regulamentação Anatel/FCC limita a banda de 2,4 GHz a até
   * ~30 dBm e a de 5 GHz a valores um pouco menores; 6 GHz é mais recente e opera tipicamente com potência mais
   * baixa, ~20 dBm, sob regras de "potência espectral" mais restritivas). Usado como valor inicial de
   * `powerWatts` (ver `_cfg()`) e reaplicado quando a Faixa muda (ver setter `signalFrequency`).
   */
  const FAIXAS = Object.freeze({
    '2.4GHz': Object.freeze({ rotulo: '2,4 GHz (maior alcance)', fator: 1.00, potenciaPadraoW: 0.630, potenciaPadraoDbm: 28 }),
    '5GHz':   Object.freeze({ rotulo: '5 GHz (equilibrado)', fator: 0.60, potenciaPadraoW: 0.501, potenciaPadraoDbm: 27 }),
    '6GHz':   Object.freeze({ rotulo: '6 GHz (mais rápido, menor alcance)', fator: 0.45, potenciaPadraoW: 0.100, potenciaPadraoDbm: 20 }),
  });

  /** Converte Watts → dBm (0 dBm = 1 mW): dBm = 10·log10(mW). Só pra EXIBIÇÃO (o motor de física usa Watts). */
  function wattsParaDbm(w) { return w > 0 ? 10 * Math.log10(w * 1000) : -Infinity; }

  /** Densidade da varredura: passo angular da grade esférica (menor = mais raios = mais preciso e mais lento). */
  const DENSIDADES = Object.freeze({
    rapida:    Object.freeze({ passo: 10, rotulo: 'Rápida (10°)' }),
    normal:    Object.freeze({ passo: 5,  rotulo: 'Normal (5°)' }),
    detalhada: Object.freeze({ passo: 3,  rotulo: 'Detalhada (3°)' }),
    maxima:    Object.freeze({ passo: 2,  rotulo: 'Máxima (2°)' }),
  });

  /**
   * [21/09/2026] NOVO -- método de PROJEÇÃO 2D do mapa de calor volumétrico 3D sobre a Planta Baixa (pedido
   * verbatim: "projetando os dados volumétricos tridimensionais diretamente sobre o mapa/planta baixa 2D").
   * Os dois métodos partem da MESMA malha 3D já varrida (`AccessPoint._construirMalha`) -- ou seja, herdam
   * automaticamente TODOS os obstáculos que o raycast 3D já considera (paredes, portas, janelas, pilares,
   * vigas, lajes de piso/teto, escada -- ver `atenuacaoDoPick`), ao contrário do corte 2D "leve"
   * (`calcularCorte2D`, mais abaixo) usado só como ÚLTIMO RECURSO quando ainda não existe nenhuma varredura
   * 3D feita (mapa aberto sem nunca ter entrado no "Ver em 3D" nesta sessão) -- esse recurso considera só
   * paredes, por isso não é o caminho padrão nem o ideal:
   *  - 'fatiamento' (Opção A, PADRÃO): fatia matematicamente a malha 3D (triângulos) por um plano horizontal
   *    Y = altura de trabalho, virando um polígono 2D exato do "corte" -- é vetorial (zoom sem perda),
   *    baratíssimo de recalcular (poucos ms mesmo em malhas de dezenas de milhares de triângulos, porque é
   *    um único laço linear sobre os índices) e não depende de um segundo render WebGL a cada quadro do
   *    mapa 2D (que usa Canvas 2D, não Three.js) -- por isso é o padrão.
   *  - 'textura' (Opção B): renderiza a malha 3D vista de cima (câmera ortográfica) para um canvas oculto
   *    (WebGLRenderTarget) UMA VEZ por varredura, e o mapa 2D só faz `ctx.drawImage` desse bitmap já pronto
   *    a cada quadro -- mais fiel a efeitos de shader (gradiente/transparência por ângulo) mas custa 1 render
   *    WebGL extra sempre que a varredura muda (não a cada quadro do mapa 2D, que só reusa o bitmap).
   */
  const METODOS2D = Object.freeze({
    fatiamento: Object.freeze({ rotulo: 'Fatiamento 3D → 2D (vetorial, padrão)' }),
    textura:    Object.freeze({ rotulo: 'Textura renderizada (WebGL Render Target)' }),
  });

  /** Níveis de sinal (intensidade mínima em "W/m²" normalizados) → uma casca por nível, da mais externa (fraca) p/ a interna. */
  const NIVEIS = Object.freeze([
    Object.freeze({ nome: 'fraco',     limiar: 0.02, cor: [0.94, 0.27, 0.27], alfa: 0.07 }),   // vermelho
    Object.freeze({ nome: 'baixo',     limiar: 0.04, cor: [0.98, 0.45, 0.09], alfa: 0.09 }),   // laranja
    Object.freeze({ nome: 'médio',     limiar: 0.08, cor: [0.98, 0.80, 0.08], alfa: 0.11 }),   // amarelo
    Object.freeze({ nome: 'bom',       limiar: 0.16, cor: [0.64, 0.90, 0.21], alfa: 0.13 }),   // verde-limão
    Object.freeze({ nome: 'excelente', limiar: 0.32, cor: [0.13, 0.77, 0.37], alfa: 0.16 }),   // verde
  ]);

  const D_MIN = 0.30;          // m -- distância mínima de referência (evita I → ∞ colado no AP)
  const D_MAX_ABS = 60;        // m -- teto absoluto de alcance (proteção)
  const IGNORAR_PERTO = 0.03;  // m -- ignora interseções coladas na origem (a própria placa/parede de montagem)
  const ORCAMENTO_MS = 5;      // ms de raycast por quadro (mantém ~60 FPS)
  const FADE_MS = 700;         // duração do fade-in da malha
  const DIRETIVIDADE = 1.2;    // expoente do cardioide
  const GANHO_MIN = 0.03;      // lobo traseiro residual

  // ==========================================================================
  // 2) FUNÇÕES PURAS (testáveis sem WebGL)
  // ==========================================================================

  /** Ganho de antena (0..1) para o ângulo `theta` (rad) em relação ao eixo +Z local do AP (cardioide semi-direcional). */
  function ganhoAntena(theta) {
    const c = 0.5 * (1 + Math.cos(theta));
    return GANHO_MIN + (1 - GANHO_MIN) * Math.pow(c, DIRETIVIDADE);
  }

  /** P0 do raio: potência (W) × ganho × fator de faixa. Intensidade em `d` metros = P0 / d². */
  function potenciaBase(powerWatts, faixa, theta) {
    const f = FAIXAS[faixa] || FAIXAS['5GHz'];
    return Math.max(0, powerWatts) * ganhoAntena(theta) * f.fator;
  }

  /** Alcance máximo (m) de um raio com base P0 (onde I cai ao menor limiar), sem barreiras. */
  function alcanceMax(P0) {
    const iMin = NIVEIS[0].limiar;
    return Math.min(D_MAX_ABS, Math.sqrt(P0 / iMin));
  }

  /**
   * Núcleo da física de UM raio: dado P0 e a lista de barreiras ordenadas por distância
   * (`[{d, atenuacao}]`, atenuacao ∈ [0,1] = fração removida do sinal restante), devolve, para cada nível de
   * `NIVEIS`, a distância (m) em que a intensidade cruza o limiar daquele nível pela 1ª vez.
   *
   *   I(d) = P0 · Π(1 − aᵢ) / d²      (produto sobre as barreiras com dᵢ < d)
   *
   * Como I só decresce com d (a queda 1/d² é contínua e as barreiras só derrubam), o cruzamento é único: percorremos os
   * segmentos entre barreiras; se a intensidade JÁ está abaixo do limiar ao começar o segmento, o cruzamento foi
   * a própria barreira (a face da parede); senão resolvemos d = √(P0·rem / limiar) e vemos se cai dentro do segmento.
   */
  function distanciasDoRaio(P0, barreiras, saida) {
    const n = NIVEIS.length, nb = barreiras.length;
    saida = saida || new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const lim = NIVEIS[k].limiar;
      // Se nem na distância de referência o sinal atinge o limiar, o nível fica "colado" no AP.
      if (P0 / (D_MIN * D_MIN) < lim) { saida[k] = D_MIN; continue; }
      let rem = 1, ini = D_MIN, res = D_MAX_ABS;
      for (let i = 0; i <= nb; i++) {
        // Invariante: no início do segmento a intensidade P0·rem/ini² ainda é >= limiar.
        const fim = i < nb ? Math.max(barreiras[i].d, ini) : Infinity;
        const dk = Math.sqrt((P0 * rem) / lim);          // onde I(d) = limiar com `rem` constante
        if (dk <= fim) { res = Math.max(ini, dk); break; }
        ini = fim; rem *= (1 - barreiras[i].atenuacao);   // chegou à barreira ainda acima do limiar; aplica a perda
        if ((P0 * rem) / (ini * ini) < lim) { res = ini; break; }   // a barreira derrubou abaixo do limiar: o nível termina na face dela
      }
      saida[k] = Math.min(res, D_MAX_ABS);
    }
    return saida;
  }

  /**
   * Interseção de um SEGMENTO origem→alvo (ox,oz)→(ex,ez) com um SEGMENTO de parede (x1,z1)-(x2,z2), no plano XZ.
   * Devolve a distância (m) da origem até o ponto de interseção, ou `null` se não houver (paralelos ou fora dos
   * dois segmentos). Usada pelo corte 2D do AP (sem depender de raycasting 3D/malhas).
   */
  function interseccaoSegmento(ox, oz, ex, ez, x1, z1, x2, z2) {
    const dx = ex - ox, dz = ez - oz;
    const sx = x2 - x1, sz = z2 - z1;
    const denom = dx * sz - dz * sx;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((x1 - ox) * sz - (z1 - oz) * sx) / denom;
    const s = ((x1 - ox) * dz - (z1 - oz) * dx) / denom;
    if (t < 0 || t > 1 || s < 0 || s > 1) return null;
    return t * Math.hypot(dx, dz);
  }

  /**
   * [21/09/2026] NOVO -- fatia UM nível (casca) da malha 3D do mapa de sinal (técnica de "marching triangles")
   * por um plano horizontal `y0`: para cada triângulo do intervalo `[deIdx, ateIdx)` do índice da geometria,
   * compara o sinal de `y - y0` em cada vértice; se os 3 vértices não têm todos o mesmo sinal, o plano cruza
   * exatamente 2 das 3 arestas do triângulo -- calcula os 2 pontos de cruzamento (interpolação linear na
   * aresta) e devolve o segmento (x,z) resultante. Concatenando os segmentos de TODOS os triângulos que
   * cruzam o plano, o contorno do corte pode ser reconstruído (ver `_encadearLoops`, logo abaixo).
   * @returns {{ax:number,az:number,bx:number,bz:number}[]}
   */
  function _fatiarNivelPorPlano(pos, idx, deIdx, ateIdx, y0) {
    const segs = [];
    const interp = (ia, ib, ya, yb) => {
      const t = (y0 - ya) / (yb - ya);
      return { x: pos[ia * 3] + (pos[ib * 3] - pos[ia * 3]) * t, z: pos[ia * 3 + 2] + (pos[ib * 3 + 2] - pos[ia * 3 + 2]) * t };
    };
    for (let i = deIdx; i < ateIdx; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const ya = pos[a * 3 + 1], yb = pos[b * 3 + 1], yc = pos[c * 3 + 1];
      const sa = ya >= y0, sb = yb >= y0, sc = yc >= y0;
      if (sa === sb && sb === sc) continue;   // triângulo inteiro de um só lado do plano -- não cruza
      const pts = [];
      if (sa !== sb) pts.push(interp(a, b, ya, yb));
      if (sb !== sc) pts.push(interp(b, c, yb, yc));
      if (sc !== sa) pts.push(interp(c, a, yc, ya));
      if (pts.length === 2) segs.push({ ax: pts[0].x, az: pts[0].z, bx: pts[1].x, bz: pts[1].z });
    }
    return segs;
  }

  /**
   * [21/09/2026] NOVO -- encadeia os segmentos soltos de `_fatiarNivelPorPlano` em um ou mais LAÇOS fechados
   * (polígonos), unindo pelos extremos que coincidem (dentro de uma tolerância `eps`, pra fechar folgas de
   * ponto-flutuante entre triângulos vizinhos que compartilham aresta). Uma malha "estrelada" (como as cascas
   * do AP, vistas de um plano que a corta uma vez em cada direção) normalmente gera 1 laço por nível, mas o
   * algoritmo aceita múltiplos (ex.: lobo traseiro do cardioide separado por uma sombra de parede).
   * @returns {{x:number,z:number}[][]}
   */
  function _encadearLoops(segs, eps) {
    eps = eps || 1e-3;
    const chave = (x, z) => Math.round(x / eps) + ',' + Math.round(z / eps);
    // cada ponto (por chave) aponta pra até 2 segmentos que o tocam (aresta compartilhada por 2 triângulos).
    const porPonto = new Map();
    segs.forEach((s, i) => {
      const ka = chave(s.ax, s.az), kb = chave(s.bx, s.bz);
      (porPonto.get(ka) || porPonto.set(ka, []).get(ka)).push(i);
      (porPonto.get(kb) || porPonto.set(kb, []).get(kb)).push(i);
    });
    const usados = new Array(segs.length).fill(false), loops = [];
    for (let i0 = 0; i0 < segs.length; i0++) {
      if (usados[i0]) continue;
      usados[i0] = true;
      const s0 = segs[i0], loop = [{ x: s0.ax, z: s0.az }, { x: s0.bx, z: s0.bz }];
      let pontaX = s0.bx, pontaZ = s0.bz, guarda = segs.length + 4;   // guarda contra laços mal-formados (não fecha)
      while (guarda-- > 0) {
        const vizinhos = porPonto.get(chave(pontaX, pontaZ)) || [];
        const prox = vizinhos.find((j) => !usados[j]);
        if (prox == null) break;
        usados[prox] = true;
        const s = segs[prox];
        const daPontaA = Math.hypot(s.ax - pontaX, s.az - pontaZ) < Math.hypot(s.bx - pontaX, s.bz - pontaZ);
        const prox_x = daPontaA ? s.bx : s.ax, prox_z = daPontaA ? s.bz : s.az;
        loop.push({ x: prox_x, z: prox_z });
        pontaX = prox_x; pontaZ = prox_z;
        if (Math.hypot(pontaX - loop[0].x, pontaZ - loop[0].z) < eps * 4) break;   // fechou o laço
      }
      if (loop.length >= 3) loops.push(loop);
    }
    return loops;
  }

  /**
   * [21/09/2026] NOVO -- corte 2D (plano XZ, no nível Y do AP) do mapa de sinal, para desenho na Planta Baixa
   * (mapview.js / mapview-rede-2d.js), SEM depender da engine 3D (raycaster/malhas) -- usa só os dados do mapa
   * (`map.walls`) e a posição/ângulo 2D do próprio objeto (`obj.x`, `obj.y`, `obj.angulo`). É uma simplificação
   * da física 3D: considera apenas PAREDES como barreiras (portas, janelas, pilares/vigas e as lajes de
   * piso/teto não entram nesta primeira versão -- o corte é só a "fatia" no plano do AP). Segue a mesma
   * convenção já usada pelo editor 2D pra paredes (ver `Mapping.addWall`): o campo `piso` delas não filtra
   * nada de propósito no mapa 2D (todo andar aparece sobreposto), então este corte também não filtra por
   * piso -- considera TODAS as paredes do mapa, do jeito que o resto do editor 2D já mostra tudo junto.
   * Convenção de eixos: mesma de `objAnguloToRotY`/`Mapping` -- eixo local +Z (frente) do objeto mapeia para o
   * mundo (-sin(angulo), cos(angulo)); `obj.x`/`obj.y` são as coordenadas de mundo X/Z.
   * @param {object} obj  Objeto do mapa (tipo 'access_point').
   * @param {object} map  Dados do mapa (precisa de `.walls`; `RedeEquip.cabosDoObjeto` decide se há cabo).
   * @returns {null|{origem:{x:number,z:number}, niveis:Array<{nome:string,cor:number[],alfa:number,pontos:{x:number,z:number}[]}>}}
   */
  /** Extremos (x,z) de um segmento formado por um objeto "de largura" (porta/janela: ponto + ângulo + largura),
   *  na mesma convenção de eixos de `Mapping._footprintBox`/`objAnguloToRotY`: local +X (largura) → mundo
   *  (cos(angulo), sin(angulo)). */
  function _segmentoDeVao(o) {
    const ang = o.angulo || 0, hw = (o.largura || 0.8) / 2, cx = Math.cos(ang), cz = Math.sin(ang);
    return { x1: o.x - hw * cx, z1: o.y - hw * cz, x2: o.x + hw * cx, z2: o.y + hw * cz };
  }

  /** 4 arestas (segmentos) da caixa orientada de um objeto (pilar/viga/escada/etc.), reaproveitando
   *  `Mapping._footprintBox` (mesma convenção de largura/profundidade × ângulo já usada pelo empilhamento). */
  function _segmentosDeCaixa(o) {
    const M = raiz.Mapping; if (!M || !M._footprintBox) return [];
    const b = M._footprintBox(o), cx = Math.cos(b.angulo), cz = Math.sin(b.angulo);
    // cantos: local (±hx,±hz) -> mundo (x,z) via eixo local +X=(cx,cz), +Z=(-cz,cx) (mesma convenção)
    const cant = [[-b.hx, -b.hz], [b.hx, -b.hz], [b.hx, b.hz], [-b.hx, b.hz]].map(([lx, lz]) => ({ x: b.x + lx * cx - lz * cz, z: b.y + lx * cz + lz * cx }));
    return [0, 1, 2, 3].map((i) => ({ x1: cant[i].x, z1: cant[i].z, x2: cant[(i + 1) % 4].x, z2: cant[(i + 1) % 4].z }));
  }

  /**
   * [21/09/2026] NOVO -- física 2D do FALLBACK (sem varredura 3D ainda, ver comentário grande acima de
   * `METODOS2D`) atualizada por pedido verbatim: "No mapa 2D, a fallback deve considerar portas (deve
   * considerar se a porta estiver aberta ou fechada), janelas, vigas, pilares, escadas (dependendo do nível
   * dos degraus)." Como este corte é feito num plano Y FIXO (`y0`, mesma altura de trabalho de
   * `planoTrabalhoY` -- 1,0 m do piso), cada tipo de obstáculo só atenua o raio se sua PRÓPRIA extensão
   * vertical realmente cruza `y0` naquele ponto -- não é mais "qualquer parede sempre bloqueia":
   *  - parede: usa `wall.height` (altura real dela, RODADA 01/09 -- meia-parede não bloqueia acima do topo).
   *  - porta: ignorada se `porta.aberta` (porta aberta não atenua); fechada, atenua só se `y0` cair dentro
   *    de `[elevacaoBase, elevacaoBase+altura]` (o vão da porta).
   *  - janela: atenua só se `y0` cair dentro de `[elevacaoBase+alturaPeitoril, elevacaoBase+alturaPeitoril+altura]`
   *    (abaixo do peitoril ou acima da verga, o vidro não está lá -- é alvenaria, já coberta pela parede-mãe).
   *  - pilar/viga/outros objetos estruturais: atenua só se `y0` cair dentro de `[elevacao, elevacao+altura]`
   *    do próprio objeto (viga tipicamente só perto do teto; pilar tipicamente do piso ao teto).
   *  - escada: RESSALVA HONESTA (aproximação) -- sem uma varredura 3D real, aproxima cada degrau como um
   *    "espelho" que cresce em Y ao longo do comprimento da escada (de `elevacao` até `elevacao+alturaEscada`
   *    em `escadaDegraus` passos); o ponto por onde o raio cruza a caixa da escada cai numa certa distância
   *    ao longo dela -- se a altura do degrau NAQUELE trecho já superou `y0`, o raio é bloqueado (o corpo do
   *    degrau já "tapa" o plano de trabalho ali); mais perto do início (degraus baixos) o raio passa livre.
   */
  function calcularCorte2D(obj, map) {
    const RE = raiz.RedeEquip;
    if (!RE || !RE.ehAP(obj.tipo)) return null;
    const isOn = !!(obj.rede && obj.rede.ligado !== false);
    const hasCable = !!(map && RE.cabosDoObjeto(map, obj.id).length > 0);
    if (!isOn || !hasCable) return null;
    const r = (obj.rede && obj.rede.ap) || {};
    if (r.mostrar2D === false) return null;   // "mostrar mapa" desligado (padrão: ligado)
    const P = r.potenciaW > 0 ? r.potenciaW : FAIXAS[FAIXAS[r.frequencia] ? r.frequencia : '5GHz'].potenciaPadraoW;
    const faixa = FAIXAS[r.frequencia] ? r.frequencia : '5GHz';
    const ang = obj.angulo || 0, fx = -Math.sin(ang), fz = Math.cos(ang);
    const ox = obj.x, oz = obj.y;
    const hPiso = map.alturaPiso || 2.8, y0 = (obj.piso || 0) * hPiso + 1.0;   // plano de trabalho: 1,0 m do piso
    const paredes = map.walls || [];
    const portas = (map.portas || []).filter((p) => !p.aberta);   // porta aberta: sem barreira nenhuma
    const janelas = map.janelas || [];
    const pilaresVigas = (map.objects || []).filter((o) => o.tipo === 'pilar' || o.tipo === 'viga' || o.tipo === 'divisoria' || o.tipo === 'parede-drywall');
    const escadas = (map.objects || []).filter((o) => o.tipo === 'escada');
    const passo = 6, n = Math.round(360 / passo);
    const niveis = NIVEIS.map((N) => ({ nome: N.nome, cor: N.cor, alfa: N.alfa, pontos: [] }));
    const saida = new Float32Array(NIVEIS.length);
    for (let i = 0; i < n; i++) {
      const phi = (i / n) * Math.PI * 2, dx = Math.sin(phi), dz = Math.cos(phi);
      const dot = Math.max(-1, Math.min(1, dx * fx + dz * fz));
      const theta = Math.acos(dot);
      const P0 = potenciaBase(P, faixa, theta);
      const alcance = alcanceMax(P0);
      const barreiras = [];
      if (alcance > D_MIN) {
        const ex = ox + dx * alcance, ez = oz + dz * alcance;
        // paredes -- só bloqueiam se o plano de trabalho estiver dentro da altura real da parede
        for (let w = 0; w < paredes.length; w++) {
          const pw = paredes[w];
          if (y0 > (pw.height != null ? pw.height : 2.6)) continue;
          const d = interseccaoSegmento(ox, oz, ex, ez, pw.x1, pw.y1, pw.x2, pw.y2);
          if (d != null && d > IGNORAR_PERTO) {
            const mat = ((raiz.WALL_TYPES || {})[pw.tipo] || {}).material || 'alvenaria';
            barreiras.push({ d, atenuacao: ATENUACAO[mat] != null ? ATENUACAO[mat] : ATENUACAO.alvenaria });
          }
        }
        // portas fechadas -- vão vertical [elevacaoBase, elevacaoBase+altura]
        for (let p = 0; p < portas.length; p++) {
          const pt = portas[p], baseY = pt.elevacaoBase || 0, altura = pt.altura || 2.1;
          if (y0 < baseY || y0 > baseY + altura) continue;
          const s = _segmentoDeVao(pt), d = interseccaoSegmento(ox, oz, ex, ez, s.x1, s.z1, s.x2, s.z2);
          if (d != null && d > IGNORAR_PERTO) {
            const mat = ((raiz.DOOR_TYPES || {})[pt.tipo] || {}).material || 'madeira';
            barreiras.push({ d, atenuacao: ATENUACAO[mat] != null ? ATENUACAO[mat] : ATENUACAO.madeira });
          }
        }
        // janelas -- vão vertical [elevacaoBase+alturaPeitoril, +altura] (abaixo/acima disso é alvenaria, já coberta pela parede)
        for (let j = 0; j < janelas.length; j++) {
          const jn = janelas[j], baseY = (jn.elevacaoBase || 0) + (jn.alturaPeitoril != null ? jn.alturaPeitoril : 1.0), altura = jn.altura || 1.2;
          if (y0 < baseY || y0 > baseY + altura) continue;
          const s = _segmentoDeVao(jn), d = interseccaoSegmento(ox, oz, ex, ez, s.x1, s.z1, s.x2, s.z2);
          if (d != null && d > IGNORAR_PERTO) barreiras.push({ d, atenuacao: ATENUACAO.vidro });
        }
        // pilares/vigas/divisórias -- vão vertical [elevacao, elevacao+altura] do próprio objeto
        for (let o = 0; o < pilaresVigas.length; o++) {
          const ov = pilaresVigas[o], baseY = ov.elevacao || 0, altura = ov.altura || hPiso;
          if (y0 < baseY || y0 > baseY + altura) continue;
          const segs = _segmentosDeCaixa(ov);
          let dMin = null;
          for (let s = 0; s < segs.length; s++) { const d = interseccaoSegmento(ox, oz, ex, ez, segs[s].x1, segs[s].z1, segs[s].x2, segs[s].z2); if (d != null && (dMin == null || d < dMin)) dMin = d; }
          if (dMin != null && dMin > IGNORAR_PERTO) {
            const t = ov.tipo === 'viga' ? 'viga' : ov.tipo === 'pilar' ? 'pilar' : 'divisoria';
            barreiras.push({ d: dMin, atenuacao: ATENUACAO[t] != null ? ATENUACAO[t] : ATENUACAO.divisoria });
          }
        }
        // escadas -- aproximação por degrau (ver comentário grande da função)
        for (let e = 0; e < escadas.length; e++) {
          const es = escadas[e], segs = _segmentosDeCaixa(es);
          let dMin = null;
          for (let s = 0; s < segs.length; s++) { const d = interseccaoSegmento(ox, oz, ex, ez, segs[s].x1, segs[s].z1, segs[s].x2, segs[s].z2); if (d != null && (dMin == null || d < dMin)) dMin = d; }
          if (dMin == null || dMin <= IGNORAR_PERTO) continue;
          const M = raiz.Mapping, box = M && M._footprintBox ? M._footprintBox(es) : null;
          if (!box) continue;
          // posição do cruzamento ao longo do comprimento da escada (0 = início/base, 1 = topo)
          const px = ox + dx * dMin, pz = oz + dz * dMin;
          const cz2 = Math.cos(box.angulo), sz2 = Math.sin(box.angulo);
          const lz = -(px - box.x) * sz2 + (pz - box.y) * cz2;   // coordenada local ao longo da profundidade
          const t = Math.max(0, Math.min(1, (lz + box.hz) / (2 * box.hz || 1)));
          const nDeg = Math.max(1, es.escadaDegraus || 11), alturaEsc = es.alturaEscada || es.altura || hPiso;
          const degrauIdx = Math.min(nDeg - 1, Math.floor(t * nDeg));
          const topoDegrauY = (es.elevacao || 0) + (alturaEsc / nDeg) * (degrauIdx + 1);
          if (y0 < topoDegrauY) barreiras.push({ d: dMin, atenuacao: ATENUACAO.concreto });
        }
        barreiras.sort((a, b) => a.d - b.d);
      }
      distanciasDoRaio(P0, barreiras, saida);
      for (let k = 0; k < NIVEIS.length; k++) niveis[k].pontos.push({ x: ox + dx * saida[k], z: oz + dz * saida[k] });
    }
    return { origem: { x: ox, z: oz }, niveis };
  }

  /** Fração removida por um alvo de raycast (`userData.pick` da malha). 0 = não é barreira. */
  function atenuacaoDoPick(pick) {
    if (!pick) return 0;
    const ref = pick.ref || {};
    switch (pick.type) {
      case 'wall': {
        const mat = ((raiz.WALL_TYPES || {})[ref.tipo] || {}).material || ref.material;
        return ATENUACAO[mat] != null ? ATENUACAO[mat] : ATENUACAO.alvenaria;
      }
      case 'tijolo': return ATENUACAO.alvenaria;
      case 'porta': {
        const mat = ((raiz.DOOR_TYPES || {})[ref.tipo] || {}).material || 'madeira';
        return ATENUACAO[mat] != null ? ATENUACAO[mat] : ATENUACAO.madeira;
      }
      case 'janela': return ATENUACAO.vidro;
      case 'object': {
        const t = ref.tipo;
        if (t === 'pilar' || t === 'viga') return ATENUACAO[t];
        if (t === 'divisoria' || t === 'parede-drywall') return ATENUACAO.divisoria;
        // [21/09/2026] NOVO -- pedido verbatim: "Assim como no versão do 3D, deve considerar paredes,
        // portas, janelas, pilares, vigas, piso/teto, escada." A escada (estrutura maciça, geralmente
        // concreto/metal) também atenua o sinal ao ser atravessada pelo raio.
        if (t === 'escada') return ATENUACAO.concreto;
        return 0;
      }
      default: return 0;
    }
  }

  // ==========================================================================
  // 3) SHADERS DO MAPA VOLUMÉTRICO
  // ==========================================================================
  // O gradiente de cor vem por-vértice (atributo `cor`, RGBA = cor do nível + alfa base); `uFade` faz o fade-in.
  // O alfa é levemente reduzido em ângulos rasantes (efeito de "volume" barato) usando a normal em espaço de vista.
  const VERT = 'attribute vec4 cor; varying vec4 vCor; varying float vRasante;\n'
    + 'void main(){ vCor = cor; vec4 mv = modelViewMatrix * vec4(position,1.0);\n'
    + '  vec3 n = normalize(normalMatrix * normal); vRasante = abs(dot(n, normalize(-mv.xyz)));\n'
    + '  gl_Position = projectionMatrix * mv; }';
  const FRAG = 'uniform float uFade; varying vec4 vCor; varying float vRasante;\n'
    + 'void main(){ float a = vCor.a * uFade * (0.55 + 0.45 * vRasante); gl_FragColor = vec4(vCor.rgb, a); }';

  // ==========================================================================
  // 4) CLASSE AccessPoint
  // ==========================================================================
  const instancias = new Map();   // obj.id -> AccessPoint (uma por AP do mapa)

  class AccessPoint {
    /**
     * @param {object} obj     Objeto do mapa (tipo 'access_point'). O estado persistente fica em `obj.rede.ap`.
     * @param {object} engine  Engine3D (precisa de THREE, mapData, _group, _pickMeshes, _redeRuntime).
     */
    constructor(obj, engine) {
      this.obj = obj; this.engine = engine;
      this.scanProgress = 0;          // 0..100
      this.scanning = false;
      this.onProgress = null;         // callback(pct, ap) -- barra de progresso do painel
      this.onDone = null;             // callback(ap, resultado)
      this.malha = null;              // THREE.Mesh do mapa volumétrico
      this._tarefa = null;            // estado da varredura em andamento
      this._raf = 0;
      this._fadeRaf = 0;
      this.ultimoResultado = null;    // { raios, tempoMs, passo, alcanceM }
    }

    // ---- estado persistente (obj.rede.ap) -------------------------------------------------------------------
    _cfg() {
      const RE = raiz.RedeEquip; if (RE) RE.garantirRede(this.obj);
      const r = this.obj.rede = this.obj.rede || {};
      if (!r.ap || typeof r.ap !== 'object') r.ap = {};
      if (!FAIXAS[r.ap.frequencia]) r.ap.frequencia = '5GHz';
      // [21/09/2026] CORRIGIDO -- pedido verbatim: "coloque valores reais de potência de sinal de dispositivos
      // wi-fi do mercado [...] 28 dBm (630 mW) em 2,4 GHz e 27 dBm (501 mW) em 5 GHz." Antes o padrão vinha de
      // `T.watts` (a POTÊNCIA ELÉTRICA/PoE do catálogo de rede, ex.: 12 W — consumo do aparelho, não a potência
      // de RF irradiada) -- um AP real jamais IRRADIA 12 W de RF (o limite regulatório em 2,4 GHz já é ~1 W);
      // usar aquele valor aqui inflava o alcance calculado de forma nada realista. Agora usa a potência de RF
      // (EIRP) típica de mercado por FAIXA (`FAIXAS[...].potenciaPadraoW`).
      if (!(r.ap.potenciaW > 0)) r.ap.potenciaW = FAIXAS[r.ap.frequencia].potenciaPadraoW;
      if (!DENSIDADES[r.ap.densidade]) r.ap.densidade = 'normal';
      if (typeof r.ap.mostrar2D !== 'boolean') r.ap.mostrar2D = true;
      if (!METODOS2D[r.ap.metodo2D]) r.ap.metodo2D = 'fatiamento';
      if (!(r.ap.opacidade2D >= 0) || r.ap.opacidade2D > 1) r.ap.opacidade2D = 1;
      return r.ap;
    }
    /** AP ligado? (`obj.rede.ligado`, o mesmo botão "Ligar/Desligar" dos demais equipamentos). */
    get isOn() { return !!(this.obj.rede && this.obj.rede.ligado !== false); }
    set isOn(v) { (raiz.RedeEquip && raiz.RedeEquip.garantirRede(this.obj)); this.obj.rede.ligado = !!v; this.atualizarVisibilidade(); }
    /** Há cabo (estruturado ou patch cord) ligado à porta RJ-45? Derivado dos cabos do mapa — nunca fica dessincronizado. */
    get hasCableConnected() {
      const RE = raiz.RedeEquip, mapa = this.engine && this.engine.mapData;
      if (!RE || !mapa) return false;
      return RE.cabosDoObjeto(mapa, this.obj.id).length > 0;
    }
    get signalFrequency() { return this._cfg().frequencia; }
    /** Ao trocar de faixa, a potência volta ao padrão real de mercado DAQUELA faixa (ver `FAIXAS`) -- bate com
     *  o comportamento de um AP de verdade (cada banda tem seu próprio limite/costume de potência de saída). */
    set signalFrequency(v) { if (FAIXAS[v]) { const c = this._cfg(); c.frequencia = v; c.potenciaW = FAIXAS[v].potenciaPadraoW; } }
    get powerWatts() { return this._cfg().potenciaW; }
    set powerWatts(v) { v = Number(v); if (v > 0) this._cfg().potenciaW = Math.min(v, 2); }   // 2 W = teto folgado acima de qualquer faixa real
    /** Potência atual em dBm, só para EXIBIÇÃO (ver `wattsParaDbm`). */
    get powerDbm() { return wattsParaDbm(this.powerWatts); }
    get densidade() { return this._cfg().densidade; }
    set densidade(v) { if (DENSIDADES[v]) this._cfg().densidade = v; }
    /** Método de projeção do mapa 2D: 'fatiamento' (padrão, Opção A) ou 'textura' (Opção B). */
    get metodo2D() { return this._cfg().metodo2D; }
    set metodo2D(v) { if (METODOS2D[v]) this._cfg().metodo2D = v; }
    /** Opacidade do mapa de calor 2D (0..1) -- equivalente, no Canvas 2D da Planta Baixa, ao pedido
     *  "heatmap2D.material.opacity = 0.5" (lá o 3D usa `material.uniforms`/`ShaderMaterial`; aqui, como o
     *  mapa 2D é desenhado em Canvas 2D — não Three.js —, o multiplicador é aplicado via `ctx.globalAlpha`
     *  no momento do desenho, mesmo efeito visual). */
    get opacidade2D() { return this._cfg().opacidade2D; }
    set opacidade2D(v) { v = Number(v); if (v >= 0 && v <= 1) this._cfg().opacidade2D = v; }
    /** Só emite (e mostra) sinal com o AP ligado E cabo conectado. */
    get emiteSinal() { return this.isOn && this.hasCableConnected; }

    // ---- geometria de montagem -------------------------------------------------------------------------------
    /** Origem (mundo), eixo frontal (+Z local, mundo) e quaternion do AP, a partir da malha da família 'rede'. */
    _pose() {
      const THREE = this.engine.THREE, rt = this.engine._redeRuntime && this.engine._redeRuntime.get(this.obj.id);
      if (!rt || !rt.root) return null;
      const RE = raiz.RedeEquip, sp = RE.especificar(this.obj.tipo);
      rt.root.updateMatrixWorld(true);
      const K = 0.001, zOff = (rt.view && rt.view.group) ? rt.view.group.position.z : 0;
      // ponto de emissão: centro da face frontal (1 cm à frente da placa, para não nascer dentro da geometria do AP)
      const origem = rt.root.localToWorld(new THREE.Vector3(0, (sp.alturaMm / 2) * K, zOff + (sp.profundidade / 2) * K + 0.01));
      const q = new THREE.Quaternion(); rt.root.getWorldQuaternion(q);
      return { origem, q, frente: new THREE.Vector3(0, 0, 1).applyQuaternion(q) };
    }

    /** Alvos de raycast: paredes, portas, janelas, tijolos e objetos estruturais (pilar/viga) que atenuam o sinal. */
    _alvos() {
      const lista = this.engine._pickMeshes || [];
      const out = [];
      for (let i = 0; i < lista.length; i++) {
        const m = lista[i], p = m && m.userData && m.userData.pick;
        if (!p || p.id === this.obj.id) continue;
        if (atenuacaoDoPick(p) > 0) out.push(m);
      }
      return out;
    }

    // ---- varredura assíncrona --------------------------------------------------------------------------------
    /**
     * Limpa a malha antiga e inicia uma varredura em segundo plano (micro-lotes por quadro).
     * @param {{densidade?:string, orcamentoMs?:number}} [opc]
     * @returns {{ok:boolean, erro?:string}}
     */
    startScan(opc) {
      opc = opc || {};
      if (!this.emiteSinal) {
        this.clear();
        return { ok: false, erro: !this.isOn ? 'O AP está desligado.' : 'Ligue um cabo na porta RJ-45 do AP para ele emitir sinal.' };
      }
      const pose = this._pose();
      if (!pose) return { ok: false, erro: 'AP ainda não está na cena 3D.' };
      this.cancelScan();
      this.clear();
      if (opc.densidade) this.densidade = opc.densidade;
      const passo = DENSIDADES[this.densidade].passo;
      const nT = Math.max(2, Math.round(180 / passo)), nP = Math.max(4, Math.round(360 / passo));
      const total = 2 + (nT - 1) * nP;                 // polos (2) + anéis intermediários
      const THREE = this.engine.THREE;
      // atualiza matrizes uma vez -- o Raycaster usa matrixWorld das malhas
      if (this.engine._group) this.engine._group.updateMatrixWorld(true);
      const mapa = this.engine.mapData || {}, hPiso = mapa.alturaPiso || 2.8, piso = this.obj.piso || 0;
      this._tarefa = {
        pose, nT, nP, total, passo, i: 0, t0: performance.now(),
        alvos: this._alvos(),
        raycaster: new THREE.Raycaster(),
        dir: new THREE.Vector3(), tmp: [],
        dist: NIVEIS.map(() => new Float32Array(total)),
        P: this.powerWatts, faixa: this.signalFrequency,
        yPiso: piso * hPiso, yTeto: (piso + 1) * hPiso,
        orcamento: Math.max(1, opc.orcamentoMs || ORCAMENTO_MS),
        saida: new Float32Array(NIVEIS.length),
      };
      this.scanning = true; this._setProgresso(0);
      this._raf = requestAnimationFrame(() => this._passo());
      return { ok: true, raios: total };
    }

    cancelScan() {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0; this._tarefa = null; this.scanning = false;
    }

    /** Direção (mundo) do raio de índice `idx` na grade esférica do AP e o ângulo θ p/ o eixo frontal. */
    _direcao(t, idx, alvo) {
      let ti, pj;
      if (idx === 0) { ti = 0; pj = 0; } else if (idx === 1) { ti = t.nT; pj = 0; } else { const k = idx - 2; ti = 1 + Math.floor(k / t.nP); pj = k % t.nP; }
      const theta = (ti / t.nT) * Math.PI, phi = (pj / t.nP) * Math.PI * 2, s = Math.sin(theta);
      alvo.set(s * Math.cos(phi), s * Math.sin(phi), Math.cos(theta)).applyQuaternion(t.pose.q);   // eixo polar = +Z local
      return theta;
    }

    /** UM micro-lote: processa raios até estourar o orçamento de tempo do quadro, depois devolve o controle. */
    _passo() {
      const t = this._tarefa; if (!t) return;
      const limite = performance.now() + t.orcamento;
      const rc = t.raycaster, o = t.pose.origem;
      while (t.i < t.total) {
        const theta = this._direcao(t, t.i, t.dir);
        const P0 = potenciaBase(t.P, t.faixa, theta);
        const alcance = alcanceMax(P0);
        const barreiras = [];
        if (alcance > D_MIN) {
          rc.set(o, t.dir); rc.near = 0; rc.far = alcance;
          t.tmp.length = 0;
          rc.intersectObjects(t.alvos, false, t.tmp);   // já ordenado por distância
          const vistos = new Set();                      // cada objeto conta UMA vez (entrada; as faces de saída de uma parede não duplicam)
          for (let h = 0; h < t.tmp.length; h++) {
            const hit = t.tmp[h];
            if (hit.distance < IGNORAR_PERTO) continue;
            const pick = hit.object.userData.pick, chave = pick.ref || pick;
            if (vistos.has(chave)) continue;
            const a = atenuacaoDoPick(pick);
            if (a > 0) { vistos.add(chave); barreiras.push({ d: hit.distance, atenuacao: a }); }
          }
          // Lajes (piso e teto do andar): planos horizontais tratados como concreto -- interseção analítica, sem malha.
          if (Math.abs(t.dir.y) > 1e-4) {
            const dPiso = (t.yPiso - o.y) / t.dir.y, dTeto = (t.yTeto - o.y) / t.dir.y;
            [dPiso, dTeto].forEach((dl) => { if (dl > IGNORAR_PERTO && dl < alcance) barreiras.push({ d: dl, atenuacao: ATENUACAO.concreto }); });
            barreiras.sort((a, b) => a.d - b.d);
          }
        }
        distanciasDoRaio(P0, barreiras, t.saida);
        for (let k = 0; k < NIVEIS.length; k++) t.dist[k][t.i] = t.saida[k];
        t.i++;
        if ((t.i & 15) === 0 && performance.now() >= limite) break;   // checa o relógio a cada 16 raios (barato)
      }
      this._setProgresso(Math.min(100, Math.floor((t.i / t.total) * 100)));
      if (t.i < t.total) { this._raf = requestAnimationFrame(() => this._passo()); return; }
      this._concluir(t);
    }

    _setProgresso(p) {
      this.scanProgress = p;
      if (typeof this.onProgress === 'function') { try { this.onProgress(p, this); } catch (e) { /* UI fechada */ } }
    }

    /** Fim da varredura: monta a malha, faz o fade-in e notifica. */
    _concluir(t) {
      this._raf = 0; this._tarefa = null; this.scanning = false;
      this._construirMalha(t);
      this.ultimoResultado = { raios: t.total, tempoMs: Math.round(performance.now() - t.t0), passo: t.passo, alcanceM: t.dist[0].reduce((m, v) => (v > m ? v : m), 0) };
      this._setProgresso(100);
      this._fadeIn();
      if (typeof this.onDone === 'function') { try { this.onDone(this, this.ultimoResultado); } catch (e) { /* ignore */ } }
    }

    /**
     * Constrói UMA BufferGeometry com todas as cascas (uma por nível): vértices = origem + dir × distância do raio.
     * Malha em grade (anéis de θ × meridianos de φ); os polos usam 1 raio só e se repetem por meridiano.
     */
    _construirMalha(t) {
      const THREE = this.engine.THREE, nT = t.nT, nP = t.nP, nNiv = NIVEIS.length;
      const vPorCasca = (nT + 1) * nP, tPorCasca = 2 * nT * nP;
      const pos = new Float32Array(nNiv * vPorCasca * 3), cor = new Float32Array(nNiv * vPorCasca * 4);
      const nor = new Float32Array(pos.length), idx = new Uint32Array(nNiv * tPorCasca * 3);
      // direções unitárias de cada vértice (reutilizadas por todas as cascas)
      const dirs = new Float32Array(vPorCasca * 3), rayDe = new Uint32Array(vPorCasca), d = new THREE.Vector3();
      for (let ti = 0; ti <= nT; ti++) for (let pj = 0; pj < nP; pj++) {
        const r = ti === 0 ? 0 : ti === nT ? 1 : 2 + (ti - 1) * nP + pj, v = ti * nP + pj;
        this._direcao(t, r, d); dirs[v * 3] = d.x; dirs[v * 3 + 1] = d.y; dirs[v * 3 + 2] = d.z; rayDe[v] = r;
      }
      const o = t.pose.origem;
      for (let k = 0; k < nNiv; k++) {
        const base = k * vPorCasca, N = NIVEIS[k];
        for (let v = 0; v < vPorCasca; v++) {
          const dist = t.dist[k][rayDe[v]], p = (base + v) * 3, c = (base + v) * 4;
          pos[p] = o.x + dirs[v * 3] * dist; pos[p + 1] = o.y + dirs[v * 3 + 1] * dist; pos[p + 2] = o.z + dirs[v * 3 + 2] * dist;
          nor[p] = dirs[v * 3]; nor[p + 1] = dirs[v * 3 + 1]; nor[p + 2] = dirs[v * 3 + 2];   // normal ≈ direção radial (bom p/ o efeito rasante)
          cor[c] = N.cor[0]; cor[c + 1] = N.cor[1]; cor[c + 2] = N.cor[2]; cor[c + 3] = N.alfa;
        }
        let q = k * tPorCasca * 3;
        for (let ti = 0; ti < nT; ti++) for (let pj = 0; pj < nP; pj++) {
          const a = base + ti * nP + pj, b = base + ti * nP + (pj + 1) % nP, c2 = base + (ti + 1) * nP + pj, e = base + (ti + 1) * nP + (pj + 1) % nP;
          idx[q++] = a; idx[q++] = c2; idx[q++] = b;
          idx[q++] = b; idx[q++] = c2; idx[q++] = e;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('cor', new THREE.BufferAttribute(cor, 4));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mat = new THREE.ShaderMaterial({
        uniforms: { uFade: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.name = 'wifi-mapa:' + this.obj.id; m.renderOrder = 8; m.frustumCulled = false;
      m.raycast = function () {};                    // o mapa de sinal nunca intercepta cliques nem raycasts
      m.userData.wifi = true;
      this.malha = m;
      if (this.engine._group) this.engine._group.add(m);
      // [21/09/2026] NOVO -- guarda a "forma" da grade (nT/nP/vPorCasca/tPorCasca) e incrementa a versão da
      // malha: é o que permite a `projetarCorte2D`/`projetarTextura2D` (mais abaixo) fatiar/renderizar esta
      // MESMA malha depois, sem precisar refazer a varredura -- e permite ao mapa 2D saber (comparando a
      // versão) quando o corte em cache ficou desatualizado (nova varredura concluída).
      this._grade = { nT, nP, vPorCasca, tPorCasca };
      this._malhaVersao = (this._malhaVersao || 0) + 1;
      this._corteCache = null;
      this._texturaCache = null;
    }

    /** Fade-in suave (uniform `uFade` 0 → 1), guiado por rAF. */
    _fadeIn() {
      const m = this.malha; if (!m) return;
      const t0 = performance.now();
      const passo = () => {
        if (!this.malha || this.malha !== m) return;
        const k = Math.min(1, (performance.now() - t0) / FADE_MS);
        m.material.uniforms.uFade.value = k * k * (3 - 2 * k);   // smoothstep
        if (k < 1) this._fadeRaf = requestAnimationFrame(passo);
      };
      cancelAnimationFrame(this._fadeRaf); this._fadeRaf = requestAnimationFrame(passo);
    }

    /** Remove a malha antiga (libera geometria/material da GPU) e os caches/recursos da projeção 2D. */
    clear() {
      cancelAnimationFrame(this._fadeRaf);
      if (this.malha) {
        if (this.malha.parent) this.malha.parent.remove(this.malha);
        this.malha.geometry.dispose(); this.malha.material.dispose(); this.malha = null;
      }
      this._grade = null; this._corteCache = null; this._texturaCache = null;
      if (this._rtAlvo) { this._rtAlvo.dispose(); this._rtAlvo = null; }   // libera o WebGLRenderTarget da Opção B
    }

    /** Mostra/oculta o mapa conforme o AP pode emitir (ligado + cabo). Chamar após ligar/desligar/(des)conectar cabo. */
    atualizarVisibilidade() {
      if (!this.emiteSinal) { this.cancelScan(); if (this.malha) this.malha.visible = false; }
      else if (this.malha) this.malha.visible = true;
    }
    get temMalha() { return !!(this.malha && this.malha.parent); }
    /** Liga/desliga só a exibição (sem apagar o resultado). Também persiste em `obj.rede.ap.mostrar2D`, pois o
     *  mapa 2D (Planta Baixa) lê esse mesmo flag para desenhar (ou não) o corte 2D, independente de haver uma
     *  sessão 3D viva com a malha construída. */
    set mostrar(v) { v = !!v; this._cfg().mostrar2D = v; if (this.malha) this.malha.visible = v && this.emiteSinal; }
    get mostrar() { return this.temMalha ? !!this.malha.visible : this._cfg().mostrar2D !== false; }

    // ---- projeção 2D (mapa de calor sobre a Planta Baixa) ----------------------------------------------------
    /** Altura (Y absoluto, mundo) do plano de trabalho padrão para a projeção 2D: 1,0 m acima do piso do
     *  próprio AP (altura útil onde ficam notebooks/celulares) — pedido verbatim: "fixado na coordenada
     *  Y = 1.0 metro do chão". Usada como padrão quando `projetarCorte2D`/`projetarTextura2D` são chamados
     *  sem um `targetPlaneY` explícito. */
    get planoTrabalhoY() {
      const mapa = this.engine && this.engine.mapData, hPiso = (mapa && mapa.alturaPiso) || 2.8;
      return (this.obj.piso || 0) * hPiso + 1.0;
    }

    /**
     * OPÇÃO A (padrão) -- `projectHeatmapTo2D`: fatia a malha 3D JÁ VARRIDA (todas as cascas de nível) por um
     * plano horizontal Y = `targetPlaneY` (ou `planoTrabalhoY` por padrão), devolvendo, por nível de sinal, o(s)
     * polígono(s) 2D (mundo X/Z) do "corte" -- a interseção matemática exata entre o plano e os triângulos da
     * malha (técnica de "marching triangles": para cada triângulo, testa o sinal de `y - targetPlaneY` em cada
     * vértice; se não são todos iguais, o plano cruza 1 ou 2 arestas do triângulo, calculadas por interpolação
     * linear; os segmentos resultantes de todos os triângulos de um nível são então ENCADEADOS pelos extremos
     * em comum, formando um ou mais laços/polígonos fechados -- ver `_fatiarNivelPorPlano`/`_encadearLoops`).
     * Como a malha 3D já foi construída considerando TODOS os obstáculos do raycast (paredes, portas, janelas,
     * pilares, vigas, lajes de piso/teto e escada — ver `atenuacaoDoPick`), o corte herda automaticamente as
     * mesmas "sombras de sinal" da vista 3D — não é um recorte que só reage a paredes.
     * Escolha de performance: é o método padrão porque é puramente vetorial/CPU (um laço linear sobre os
     * ~nNiv·2·nT·nP triângulos já existentes, tipicamente poucos milésimos de segundo) e não exige nenhum
     * render WebGL extra a cada quadro do mapa 2D (que é Canvas 2D puro) — ao contrário da Opção B.
     * @param {number} [targetPlaneY]  Y absoluto (mundo) do plano de corte; padrão: `this.planoTrabalhoY`.
     * @returns {null|{origem:{x:number,z:number}, planoY:number, niveis:Array<{nome:string,cor:number[],alfa:number,loops:{x:number,z:number}[][]}>}}
     */
    projectHeatmapTo2D(targetPlaneY) {
      if (!this.malha || !this._grade) return null;
      const y0 = targetPlaneY != null ? targetPlaneY : this.planoTrabalhoY;
      // cache: reaproveita o último corte se nada mudou (mesma malha, mesmo plano) -- evita refatiar a cada
      // quadro do mapa 2D só porque o usuário está panorâmicamente arrastando/dando zoom na Planta Baixa.
      const c = this._corteCache;
      if (c && c.malhaVersao === this._malhaVersao && c.planoY === y0) return c.resultado;
      const geo = this.malha.geometry, pos = geo.attributes.position.array, idx = geo.index.array;
      const { tPorCasca } = this._grade;
      const origemMundo = this._pose(); // só usada pra devolver `origem` no resultado; o corte em si não depende disso
      const niveis = NIVEIS.map((N, k) => {
        const de = k * tPorCasca * 3, ate = de + tPorCasca * 3;
        const segs = _fatiarNivelPorPlano(pos, idx, de, ate, y0);
        return { nome: N.nome, cor: N.cor, alfa: N.alfa, loops: _encadearLoops(segs) };
      });
      const resultado = { origem: origemMundo ? { x: origemMundo.origem.x, z: origemMundo.origem.z } : null, planoY: y0, niveis };
      this._corteCache = { malhaVersao: this._malhaVersao, planoY: y0, resultado };
      return resultado;
    }
    /** Alias em português (mesmo método) -- ver `projectHeatmapTo2D`. */
    projetarCorte2D(targetPlaneY) { return this.projectHeatmapTo2D(targetPlaneY); }

    /**
     * OPÇÃO B -- render-to-texture: posiciona uma `THREE.OrthographicCamera` no topo do AP, olhando pra baixo
     * (-Y), e renderiza SÓ a malha do mapa de sinal (isolada via `THREE.Layers`, sem precisar esconder o resto
     * da cena) num canvas pequeno oculto -- o resultado é um bitmap 2D já pronto que o mapa da Planta Baixa só
     * precisa "colar" (`ctx.drawImage`) na posição/escala corretas a cada quadro (bem mais barato por quadro
     * que a Opção A seria SEM cache, mas o próprio cache da Opção A já a deixa igualmente barata -- por isso
     * esta opção é OPCIONAL/avançada: fica melhor quando se quer o gradiente exato do `ShaderMaterial` 3D
     * (efeito "rasante" incluso) em vez dos degraus de cor sólida por nível da Opção A).
     * Reaproveita o `THREE.WebGLRenderer` da engine 3D (mesmo contexto GPU, sem criar um 2º contexto WebGL) --
     * por isso só funciona enquanto a sessão "Ver em 3D" está aberta (mesma limitação da malha em si: ambos
     * dependem do raycast 3D já ter sido feito); com o mapa 2D sozinho (sem nunca ter aberto o 3D), cai no
     * fallback `calcularCorte2D` (ver mais abaixo), que é independente da engine.
     * @param {{tamanhoPx?:number}} [opc]
     * @returns {null|{canvas:HTMLCanvasElement, minX:number,maxX:number,minZ:number,maxZ:number}}
     */
    projectHeatmapToTexture(opc) {
      opc = opc || {};
      if (!this.malha || !this.engine || !this.engine.renderer || !this.engine.THREE) return null;
      const THREE = this.engine.THREE, tam = opc.tamanhoPx || 256;
      const c = this._texturaCache;
      if (c && c.malhaVersao === this._malhaVersao && c.tam === tam) return c.resultado;
      const alcance = (this.ultimoResultado && this.ultimoResultado.alcanceM) || 10;
      const o = this._pose(); if (!o) return null;
      const meia = Math.max(1, alcance);
      // câmera ortográfica olhando de cima (-Y) pra baixo, enquadrando o alcance máximo da varredura.
      if (!this._rtCamera) this._rtCamera = new THREE.OrthographicCamera(-meia, meia, meia, -meia, 0.05, meia * 2 + 5);
      const cam = this._rtCamera;
      cam.left = -meia; cam.right = meia; cam.top = meia; cam.bottom = -meia; cam.near = 0.05; cam.far = meia * 2 + 5;
      cam.position.set(o.origem.x, o.origem.y + meia + 1, o.origem.z);
      cam.up.set(0, 0, -1);          // "norte" da textura = -Z do mundo (mesma orientação do mapview: Z cresce pra baixo na tela)
      cam.lookAt(o.origem.x, o.origem.y, o.origem.z);
      cam.layers.set(31); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      // isola SÓ a malha do sinal na camada 31 (não precisa esconder o resto da cena pra renderizar isolado).
      const camadaOriginal = this.malha.layers.mask;
      this.malha.layers.set(31);
      if (!this._rtAlvo) this._rtAlvo = new THREE.WebGLRenderTarget(tam, tam, { depthBuffer: false });
      else if (this._rtAlvo.width !== tam) this._rtAlvo.setSize(tam, tam);
      const renderer = this.engine.renderer;
      const alvoAnterior = renderer.getRenderTarget();
      const corAnterior = new THREE.Color(); renderer.getClearColor(corAnterior);
      const alfaAnterior = renderer.getClearAlpha();
      renderer.setRenderTarget(this._rtAlvo);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(this.malha, cam);
      // devolve a malha à camada 0 (visível na cena normal de novo) e restaura o estado do renderer.
      this.malha.layers.mask = camadaOriginal;
      renderer.setRenderTarget(alvoAnterior);
      renderer.setClearColor(corAnterior, alfaAnterior);
      // lê os pixels do render target pra um <canvas> 2D comum -- é isso que `ctx.drawImage` consegue desenhar
      // no Canvas 2D da Planta Baixa (um WebGLRenderTarget não pode ser usado direto por um contexto 2D).
      const buf = new Uint8Array(tam * tam * 4);
      renderer.readRenderTargetPixels(this._rtAlvo, 0, 0, tam, tam, buf);
      if (!this._rtCanvas) { this._rtCanvas = document.createElement('canvas'); this._rtCanvas.width = tam; this._rtCanvas.height = tam; }
      const ctx2 = this._rtCanvas.getContext('2d'), imgData = ctx2.createImageData(tam, tam);
      // WebGL lê a imagem de baixo pra cima -- inverte as linhas ao copiar pro ImageData (que é de cima pra baixo).
      for (let y = 0; y < tam; y++) imgData.data.set(buf.subarray(y * tam * 4, (y + 1) * tam * 4), (tam - 1 - y) * tam * 4);
      ctx2.putImageData(imgData, 0, 0);
      const resultado = { canvas: this._rtCanvas, minX: o.origem.x - meia, maxX: o.origem.x + meia, minZ: o.origem.z - meia, maxZ: o.origem.z + meia };
      this._texturaCache = { malhaVersao: this._malhaVersao, tam, resultado };
      return resultado;
    }
    /** Alias em português (mesmo método) -- ver `projectHeatmapToTexture`. */
    projetarTextura2D(opc) { return this.projectHeatmapToTexture(opc); }

    // ---- etiqueta flutuante (rótulo) -------------------------------------------------------------------------
    /** [21/09/2026] NOVO -- pedido verbatim: "no Access Point, no 'Ver em 3D' [...] na 'Etiqueta
     *  (rótulo flutuante)', este rótulo deve ficar próxima do próprio AP e deve ser feito
     *  diretamente no canvas, não com HTML/CSS." Diferente do overlay HTML genérico de rótulo de
     *  equipamento (view3d-rede.js `_hoverRotulo3D`), que fica fixo no CENTRO DA TELA (acompanha a
     *  mira, não o objeto), isto é um `THREE.Sprite` com `CanvasTexture` ancorado no MUNDO logo
     *  acima do AP -- billboard automático do próprio `THREE.Sprite` (sempre de frente pra
     *  câmera, sem código extra), desenhado pela engine junto com o resto da cena 3D, não por cima
     *  dela via DOM. Chamado a cada quadro por `View3DRede._atualizarEtiquetasAP` (todo AP do
     *  mapa, não só o mirado -- por isso "sempre visível", não um tooltip de hover).
     * @param {string} texto  labelID do AP (ou o rótulo padrão do tipo, se não houver um definido).
     */
    atualizarEtiqueta(texto) {
      const pose = this._pose();
      if (!pose || !texto) { this.removerEtiqueta(); return; }
      const THREE = this.engine.THREE;
      if (this._etiquetaTexto !== texto || !this._etiquetaSprite) {
        this.removerEtiqueta();
        const ESC = 2; // fator de supersampling p/ o texto não ficar borrado (canvas != CSS px)
        const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
        const fonte = (13 * ESC) + 'px system-ui, sans-serif';
        ctx.font = fonte;
        const txt = '📡 ' + texto, padX = 10 * ESC, padY = 7 * ESC;
        cv.width = Math.ceil(ctx.measureText(txt).width + padX * 2);
        cv.height = Math.ceil(13 * ESC + padY * 2);
        ctx.font = fonte;   // redefine a fonte -- trocar cv.width/height reseta o contexto 2D
        const raio = 7 * ESC;
        ctx.fillStyle = 'rgba(15,20,28,0.85)'; ctx.strokeStyle = 'rgba(74,86,104,0.9)'; ctx.lineWidth = 2 * ESC;
        ctx.beginPath();
        ctx.moveTo(raio, 0); ctx.arcTo(cv.width, 0, cv.width, cv.height, raio); ctx.arcTo(cv.width, cv.height, 0, cv.height, raio);
        ctx.arcTo(0, cv.height, 0, 0, raio); ctx.arcTo(0, 0, cv.width, 0, raio); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8ecf2'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        ctx.fillText(txt, cv.width / 2, cv.height / 2 + ESC);
        const tex = new THREE.CanvasTexture(cv);
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
        const spr = new THREE.Sprite(mat);
        const alturaM = 0.20, largM = alturaM * (cv.width / cv.height);
        spr.userData.largM0 = largM; spr.userData.alturaM0 = alturaM;   // tamanho DE REFERÊNCIA (ver ajuste de escala abaixo)
        spr.scale.set(largM, alturaM, 1);
        spr.renderOrder = 20;   // acima da malha do mapa de sinal (renderOrder 8) e do resto da cena
        spr.userData.wifi = true;
        spr.raycast = function () {};   // etiqueta nunca intercepta cliques/raycasts (igual à malha do mapa)
        this._etiquetaSprite = spr; this._etiquetaTexto = texto;
        if (this.engine._group) this.engine._group.add(spr);
      }
      // Ancorada um pouco ACIMA do ponto de emissão do sinal (a "frente" do AP), não em cima dele.
      this._etiquetaSprite.position.set(pose.origem.x, pose.origem.y + 0.18, pose.origem.z);
      this._etiquetaSprite.visible = true;
      // [21/09/2026] NOVO -- pedido verbatim: "este rótulo [...] no mesmo modelo de quando se aponta para um
      // cabo e aparece informações sobre ele. Aquele modelo de caixa e tamanho na tela (sem ampliar
      // grandemente quando se está perto do AP)." Um `THREE.Sprite` comum cresce na tela conforme a câmera
      // se aproxima (perspectiva) -- diferente do balão HTML do hover de cabo (`_hoverRotulo3D`), que é
      // sempre do MESMO tamanho em pixels de tela, não importa a distância. Como este rótulo precisa
      // continuar sendo um Sprite no MUNDO 3D (pedido anterior: "deve ser feito diretamente no canvas, não
      // com HTML/CSS" -- billboard automático), o jeito de imitar esse comportamento "tamanho de tela
      // constante" é reescalar o sprite PROPORCIONALMENTE à distância da câmera a cada quadro: o tamanho
      // aparente na tela de um objeto no mundo é ~ escala/distância, então escala = escalaBase·(distância/
      // distânciaDeReferência) cancela a perspectiva e mantém o tamanho na tela sempre igual (mesmo espírito
      // do balão de cabo).
      const cam = this.engine.camera3;
      if (cam) {
        const dist = cam.position.distanceTo(this._etiquetaSprite.position);
        const k = Math.max(0.15, Math.min(8, dist / 3));   // 3 m = distância de referência (tamanho "normal")
        this._etiquetaSprite.scale.set(this._etiquetaSprite.userData.largM0 * k, this._etiquetaSprite.userData.alturaM0 * k, 1);
      }
    }

    /** Remove a etiqueta (AP saiu do mapa, ou ainda não está montado em cena — ver `_pose`). */
    removerEtiqueta() {
      const spr = this._etiquetaSprite; if (!spr) return;
      if (spr.parent) spr.parent.remove(spr);
      spr.material.map.dispose(); spr.material.dispose();
      this._etiquetaSprite = null; this._etiquetaTexto = null;
    }
  }

  // ==========================================================================
  // 5) API PÚBLICA
  // ==========================================================================
  /** Devolve (criando se preciso) o AccessPoint do objeto — reaponta `obj`/`engine` para os atuais. */
  function para(obj, engine) {
    let ap = instancias.get(obj.id);
    if (!ap) { ap = new AccessPoint(obj, engine); instancias.set(obj.id, ap); }
    ap.obj = obj; ap.engine = engine;
    return ap;
  }
  /** Esquece (e limpa a malha de) um AP removido do mapa. */
  function remover(id) { const ap = instancias.get(id); if (ap) { ap.cancelScan(); ap.clear(); ap.removerEtiqueta(); instancias.delete(id); } }
  function ehAP(obj) { return !!(obj && raiz.RedeEquip && raiz.RedeEquip.ehAP(obj.tipo)); }
  /** [21/09/2026] NOVO -- devolve a instância JÁ EXISTENTE (sem criar) de um AP, ou `null`. Diferente de
   *  `para(obj, engine)` (que exige um `engine` e cria se preciso), isto é o que o mapa 2D usa pra saber se
   *  já existe uma malha 3D varrida (Opção A/B) SEM precisar de uma engine 3D viva -- se a resposta for
   *  `null` (nunca abriu "Ver em 3D" nesta sessão), o mapa 2D cai no fallback `calcularCorte2D`. */
  function instanciaExistente(id) { return instancias.get(id) || null; }

  /** CSS da barra de progresso animada (injetado no painel do AP). A barra some a 100% (`.wf-bar.wf-fim`). */
  const CSS = '.wf-bar{height:10px;border-radius:6px;background:#1b2028;border:1px solid #333a45;overflow:hidden;margin-top:6px;transition:opacity .5s ease,height .5s ease,margin .5s ease}'
    + '.wf-bar.wf-fim{opacity:0;height:0;margin:0;border-width:0}'
    + '.wf-fill{height:100%;width:0;border-radius:6px;background:repeating-linear-gradient(45deg,#22c55e 0 10px,#16a34a 10px 20px);background-size:28px 28px;animation:wf-listra 0.8s linear infinite;transition:width .15s linear}'
    + '@keyframes wf-listra{from{background-position:0 0}to{background-position:28px 0}}'
    + '.wf-leg{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 3px 0 8px;vertical-align:middle}';

  raiz.WifiSignal = { AccessPoint, para, remover, ehAP, instanciaExistente, ganhoAntena, potenciaBase, alcanceMax, distanciasDoRaio,
    atenuacaoDoPick, interseccaoSegmento, calcularCorte2D, wattsParaDbm, ATENUACAO, FAIXAS, DENSIDADES, NIVEIS, METODOS2D, CSS };
})(typeof window !== 'undefined' ? window : globalThis);
