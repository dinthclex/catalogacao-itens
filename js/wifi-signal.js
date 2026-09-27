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

  /** Fração do sinal RESTANTE removida ao atravessar cada tipo de barreira. `mobiliario` é o valor GENÉRICO
   *  (28/09/2026 NOVO) usado por qualquer objeto do catálogo sem regra própria (mesa, cadeira, planta,
   *  impressora, gabinete, monitor, teclado, mouse, etc. -- ver comentário grande em `atenuacaoDoPick`). */
  const ATENUACAO = Object.freeze({ alvenaria: 0.80, concreto: 0.80, pilar: 0.80, viga: 0.80, metal: 0.80, madeira: 0.30, divisoria: 0.30, vidro: 0.15, mobiliario: 0.10 });

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
   * [22/09/2026] NOVO -- pedido verbatim (Engenheiro de Software Principal): "sistema de otimização de
   * topologia de malhas baseado em densidade dinâmica [...] permitir que o usuário aumente a 'Densidade da
   * Verificação' [...] mas sem que isso gere milhões de polígonos na renderização final."
   *  - 'malha_real'         : 1 vértice de malha por raio disparado (o comportamento ORIGINAL, sem
   *    otimização nenhuma) -- proporção 1:1 entre raios e vértices renderizados. Só recomendado com
   *    `densidade` baixa (poucos raios) ou para diagnóstico/depuração visual da varredura crua.
   *  - 'malha_simplificada' (PADRÃO recomendado): a varredura continua disparando TODOS os raios que a
   *    `densidade` pede (a amostragem física -- atenuação/distância -- nunca perde precisão), mas os
   *    vértices da malha final passam por uma esteira de simplificação geométrica adaptativa ANTES de
   *    chegar à GPU -- ver `AccessPoint._construirMalhaSimplificada`/`optimizeSignalMesh` mais abaixo.
   */
  const MODOS_MALHA = Object.freeze({
    malha_real:         Object.freeze({ rotulo: 'Malha real (1 vértice por raio, sem otimização)' }),
    malha_simplificada: Object.freeze({ rotulo: 'Malha simplificada (recomendado)' }),
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
    fatiamento:  Object.freeze({ rotulo: 'Fatiamento 3D → 2D (vetorial, padrão)' }),
    textura:     Object.freeze({ rotulo: 'Textura renderizada (WebGL Render Target)' }),
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
  // [25/09/2026] MUDADO -- decisão verbatim do usuário: "Sobre o Access Point (IGNORAR_PERTO = 0.03), deve
  // ignorar a caixa 3D do AP, sim. Está informação deve ficar em algum lugar, também na documentação do AP."
  // A ÚNICA coisa que o raio deve ignorar ao sair do AP é a CAIXA 3D DO PRÓPRIO AP -- e isso já é garantido por
  // identidade, não por distância: AccessPoint._alvos() (logo abaixo neste arquivo, usado pelos DOIS motores) nunca
  // inclui as malhas do próprio AP (pick.id === obj.id) na lista de alvos do raycaster. O antigo raio fixo de
  // 3 cm ignorava também superfícies REAIS coladas no AP (ex.: uma viga ou laje a menos de 3 cm dele), o que
  // fazia sumirem reflexões/perdas nessas superfícies ("poucos raios refletidos" com o AP encostado numa viga).
  // Agora vale só uma tolerância numérica de 1 mm (contra a auto-interseção exatamente na origem), igual a
  // EPS_HIT dos raios-filhos do motor avançado (radio-wave-raytracer.js). O mesmo vale pro mapa 2D analítico
  // (paredes/portas/janelas/pilares/escadas em segmentos, onde o AP nem é um obstáculo). Documentado também em js/ap-docs.js (seção "O que o raio ignora").
  const IGNORAR_PERTO = 1e-3;  // m -- tolerância numérica na origem; a caixa 3D do AP já fica de fora por identidade (ver _alvos)
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
  function distanciasDoRaio(P0, barreiras, saida, limiarExtraI) {
    const n = NIVEIS.length, nb = barreiras.length;
    saida = saida || new Float32Array(n);
    // [23/09/2026] NOVO -- pedido verbatim: "Se o 'Limiar (dBm)' pode ser usado na varredura normal, então,
    // coloque no escopo este controle." `limiarExtraI` (opcional, já convertido de dBm pra intensidade por
    // `intensidadeDeDbm`, ver `_passo`) é o `rssiThreshold` do AP -- quando mais RESTRITIVO que o limiar
    // físico de um nível (`NIVEIS[k].limiar`), corta o raio ali também (nunca o contrário: um limiar mais
    // FRACO que o do nível 'fraco' não estende nada além do alcance físico já definido pelos 5 níveis).
    for (let k = 0; k < n; k++) {
      const lim = Math.max(NIVEIS[k].limiar, limiarExtraI || 0);
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
   * [22/09/2026] NOVO -- pedido verbatim: "O 'corte' que for feito no 3D deve ser feito no 2D também [...]
   * o mesmo corte que é feito no 3D [...] também poderá ser observada no 2D." Recorta um polígono fechado
   * (laço de `{x,z}`) por UM meio-plano (Sutherland-Hodgman clássico, 1 aresta de recorte): `teste(x,z)`
   * devolve um valor com sinal (distância NÃO normalizada até a reta de corte); mantém o lado `>= 0` (mesma
   * convenção de `THREE.Plane.distanceToPoint`/`clippingPlanes` usada no corte 3D real -- ver
   * `_aplicarCorteSuperficie`/`_aplicarCorteGiro`). Reaproveitado tanto pelo corte 'superficie' (1 clip) quanto
   * pelo 'giro' (2 clips encadeados, ver `_niveisComCorte2D` mais abaixo).
   */
  function _clipPoligonoMeioPlano(loop, teste) {
    if (!loop || loop.length < 3) return loop;
    const out = [];
    for (let i = 0; i < loop.length; i++) {
      const cur = loop[i], prev = loop[(i - 1 + loop.length) % loop.length];
      const vCur = teste(cur.x, cur.z), vPrev = teste(prev.x, prev.z);
      const curDentro = vCur >= 0, prevDentro = vPrev >= 0;
      if (curDentro) {
        if (!prevDentro) {
          const t = vPrev / (vPrev - vCur);
          out.push({ x: prev.x + (cur.x - prev.x) * t, z: prev.z + (cur.z - prev.z) * t });
        }
        out.push(cur);
      } else if (prevDentro) {
        const t = vPrev / (vPrev - vCur);
        out.push({ x: prev.x + (cur.x - prev.x) * t, z: prev.z + (cur.z - prev.z) * t });
      }
    }
    return out;
  }

  /**
   * [22/09/2026] NOVO -- lê o estado da "Vista em Corte" de um AP (`r` = `obj.rede.ap`, já com os defaults de
   * `_cfg()` aplicados ou os mesmos defaults repetidos aqui pro fallback `calcularCorte2D`, que roda sem
   * instância de `AccessPoint`) e devolve `null` (corte desligado) ou um objeto com os testes de meio-plano
   * PRONTOS pra recortar geometria 2D (mundo X/Z), na MESMA convenção matemática do corte 3D real (ver
   * `_aplicarCorteSuperficie`/`_aplicarCorteGiro` -- normais derivadas ali por `THREE.Vector3.applyAxisAngle`,
   * aqui em trigonometria pura pra não depender de `THREE`/engine, já que o fallback roda sem ela).
   * @param {object} r        `obj.rede.ap` (ou equivalente já normalizado).
   * @param {number} ox,oz    posição de mundo do AP.
   * @param {number} y0       altura Y (mundo) do plano de trabalho 2D (`planoTrabalhoY`/mesmo do corte fatiado).
   * @param {number} corteAlturaYAbs  altura Y (mundo) absoluta do plano de corte 'superficie' -- vem de
   *                          `AccessPoint.corteAlturaY` (malha real) ou de uma aproximação no fallback.
   */
  function _corteInfo2D(r, ox, oz, y0, corteAlturaYAbs) {
    if (!r || r.corteAtivo !== true) return null;
    if (r.corteModo === 'giro') {
      const fixoRad = ((Number(r.corteGiroAnguloFixo) || 0) % 360) * Math.PI / 180;
      const sweepRad = Math.max(0, Math.min(1, Number(r.corteGiroPercentual01))) * Math.PI * 2;
      if (sweepRad >= Math.PI * 2 - 1e-6) return null;   // 100% = tudo visível, nada a recortar
      if (sweepRad <= 1e-6) return { modo: 'giro', vazio: true };   // 0% = nada visível
      const movelRad = fixoRad + sweepRad;
      const teste1 = (x, z) => Math.cos(fixoRad) * (x - ox) - Math.sin(fixoRad) * (z - oz);
      const teste2 = (x, z) => Math.cos(movelRad - Math.PI) * (x - ox) - Math.sin(movelRad - Math.PI) * (z - oz);
      return { modo: 'giro', uniao: sweepRad > Math.PI, teste1, teste2 };
    }
    // modo 'superficie' -- mesma fórmula fechada (sem THREE) da composição de rotações de `_aplicarCorteSuperficie`:
    // normal parte de (0,-1,0), gira pelo eixo interno (X) e depois pelo eixo externo (Y) -- ver comentário
    // grande lá pra derivação completa.
    const interno = (Number(r.corteEixoInterno) || 0) * Math.PI / 180;
    const externo = ((Number(r.corteEixoExterno) || 0) % 360) * Math.PI / 180;
    const nx = -Math.sin(interno) * Math.sin(externo), ny = -Math.cos(interno), nz = -Math.sin(interno) * Math.cos(externo);
    if (Math.abs(nx) < 1e-9 && Math.abs(nz) < 1e-9) {
      // plano perfeitamente horizontal -- não corta nada DENTRO do plano Y=y0 fixo do 2D: ou está inteiramente
      // visível (nada a recortar), ou inteiramente invisível (ny sempre negativo aqui, então testa direto).
      return ny * (y0 - corteAlturaYAbs) >= 0 ? null : { modo: 'superficie', vazio: true };
    }
    const teste = (x, z) => nx * (x - ox) + ny * (y0 - corteAlturaYAbs) + nz * (z - oz);
    return { modo: 'superficie', teste };
  }

  /** Aplica `_corteInfo2D` a um conjunto de LOOPS (formato `{loops:{x,z}[][]}` por nível, ver `projectHeatmapTo2D`). */
  function _recortarLoopsComCorte2D(niveis, corte) {
    if (!corte) return niveis;
    if (corte.vazio) return niveis.map((N) => ({ ...N, loops: [] }));
    return niveis.map((N) => {
      let loops;
      if (corte.modo === 'giro') {
        if (corte.uniao) {
          // OU: cada loop original recortado pelos dois meios-planos SEPARADAMENTE, ambos entram como laços
          // distintos (pequena sobreposição de opacidade no meio é cosmética, sem efeito visual relevante --
          // a área coberta final já é a correta, ver comentário grande de `_aplicarCorteGiro`).
          loops = [];
          N.loops.forEach((loop) => {
            const a = _clipPoligonoMeioPlano(loop, corte.teste1); if (a.length >= 3) loops.push(a);
            const b = _clipPoligonoMeioPlano(loop, corte.teste2); if (b.length >= 3) loops.push(b);
          });
        } else {
          // E: os dois clips encadeados (interseção de meios-planos é sempre convexa -- Sutherland-Hodgman
          // encadeado dá o resultado exato).
          loops = N.loops.map((loop) => _clipPoligonoMeioPlano(_clipPoligonoMeioPlano(loop, corte.teste1), corte.teste2)).filter((l) => l.length >= 3);
        }
      } else {
        loops = N.loops.map((loop) => _clipPoligonoMeioPlano(loop, corte.teste)).filter((l) => l.length >= 3);
      }
      return { nome: N.nome, cor: N.cor, alfa: N.alfa, loops };
    });
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
    // [22/09/2026] NOVO -- pedido verbatim: "O 'corte' que for feito no 3D deve ser feito no 2D também." Este
    // fallback amostra por ÂNGULO (phi, mesma convenção `dx=sin(phi),dz=cos(phi)` do resto do arquivo), então
    // pro modo 'giro' o teste é direto por ângulo (sem precisar de `_corteInfo2D`/meio-plano nenhum); pro modo
    // 'superficie' reaproveita o mesmo `_corteInfo2D` (meio-plano em X/Z), testado ponto a ponto abaixo -- sem
    // a malha 3D real, a altura do plano de corte é aproximada como uma fração (`corteAltura01`) da altura de
    // UM piso (`hPiso`), a partir do piso do próprio AP (ressalva honesta: aproximação, igual ao resto desta
    // função -- ver comentário grande no topo dela).
    const corteAlturaYAprox = (obj.piso || 0) * hPiso + (Number(r.corteAltura01) >= 0 ? Number(r.corteAltura01) : 1) * hPiso;
    const corte2D = r.corteAtivo === true ? _corteInfo2D(r, ox, oz, y0, corteAlturaYAprox) : null;
    let giroFixoRad = 0, giroSweepRad = 0;
    if (r.corteAtivo === true && r.corteModo === 'giro') {
      giroFixoRad = ((Number(r.corteGiroAnguloFixo) || 0) % 360) * Math.PI / 180;
      giroSweepRad = Math.max(0, Math.min(1, Number(r.corteGiroPercentual01))) * Math.PI * 2;
    }
    for (let i = 0; i < n; i++) {
      const phi = (i / n) * Math.PI * 2, dx = Math.sin(phi), dz = Math.cos(phi);
      // corte 'giro': fora da fatia [ânguloFixo, ânguloFixo+varredura] -- colapsa o raio na origem (0% do AP em
      // todos os níveis), igual ao que 0% de sinal já significa visualmente (mesma convenção do corte 3D real).
      if (r.corteAtivo === true && r.corteModo === 'giro') {
        const rel = ((phi - giroFixoRad) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (rel > giroSweepRad) { for (let k = 0; k < NIVEIS.length; k++) niveis[k].pontos.push({ x: ox, z: oz }); continue; }
      }
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
      for (let k = 0; k < NIVEIS.length; k++) {
        let px = ox + dx * saida[k], pz = oz + dz * saida[k];
        // corte 'superficie': ponto fora do lado visível do meio-plano -- colapsa na origem (mesma convenção
        // do ramo 'giro' acima).
        if (corte2D && !corte2D.vazio && corte2D.teste && corte2D.teste(px, pz) < 0) { px = ox; pz = oz; }
        else if (corte2D && corte2D.vazio) { px = ox; pz = oz; }
        niveis[k].pontos.push({ x: px, z: pz });
      }
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
        // [28/09/2026] NOVO -- pedido verbatim: "coloquei um objeto Piso em cima de um Access Point [...]
        // porém não houve atenuação [...] Objetos como 'Piso', 'Parede', 'Pilar', 'Viga', 'Porta' e 'Janela'
        // devem ser considerados pelas duas varreduras." O objeto "Piso" (`tipo:'piso'`, uma laje avulsa do
        // catálogo -- ver mapping.js) não estava listado aqui (só a laje ANALÍTICA removida no batch
        // anterior considerava piso/teto, e ela nunca olhava pra objetos de verdade) -- agora conta como
        // concreto, igual à escada. Como este `atenuacaoDoPick` é usado pelos DOIS motores (`_alvos()` é
        // compartilhado, ver comentário grande em `AccessPoint._alvos`), a correção vale pras duas varreduras.
        if (t === 'piso') return ATENUACAO.concreto;
        // [28/09/2026] NOVO -- pedido verbatim: "Na varredura avançada, deve considerar TODOS os objetos do
        // cenário [...] mesa, cadeira, planta, impressora, gabinete, monitor, teclado, mouse ou quaisquer
        // outro objeto disponível no catálogo deve aparecer pontos em suas superfícies." Antes, qualquer
        // tipo de objeto sem regra própria acima caía no `return 0` (0 = "não é barreira"), e como
        // `_alvos()`/`_alvosOrig` só inclui malhas com `atenuacaoDoPick > 0` (ver `AccessPoint._alvos`), o
        // objeto NEM ENTRAVA na lista de alvos do raycaster -- os raios simplesmente atravessavam mesa,
        // cadeira, monitor etc. como se não estivessem lá, sem gerar ponto/colisão nenhuma na superfície
        // deles. Agora qualquer objeto do catálogo sem material específico já mapeado usa um valor genérico
        // (`ATENUACAO.mobiliario`, mais leve que madeira maciça -- a maioria é plástico/metal fino/vidro
        // fino em pouca espessura) em vez de 0, então TODO objeto vira alvo de colisão nos dois motores.
        return ATENUACAO.mobiliario;
      }
      default: return 0;
    }
  }

  // ==========================================================================
  // 2.5) [23/09/2026] REMOVIDO -- pedido verbatim: "Remova todos os botões e métodos implementados para a
  // varredura avançada." (`MATERIAIS_RF`/`materialTypeDoPick`/`perdaPorDistancia`/`FAIXAS_MHZ`/`ganhoAntenaDb`
  // só existiam pro motor de reflexão/refração, removidos junto.)
  // ==========================================================================
  /** dBm-equivalente (escala logarítmica) de uma intensidade normalizada (mesma escala de `NIVEIS[k].limiar`). */
  function dbmDeIntensidade(I) { return I > 0 ? 10 * Math.log10(I) : -Infinity; }
  /** [23/09/2026] NOVO -- inverso de `dbmDeIntensidade`: converte um dBm-equivalente (escala do 'Limiar (dBm)'/
   *  `rssiThreshold`) de volta pra intensidade normalizada, na mesma escala de `NIVEIS[k].limiar` -- é o que
   *  permite a varredura normal respeitar o 'Limiar (dBm)' (ver `distanciasDoRaio`/`_passo`). */
  function intensidadeDeDbm(dbm) { return Number.isFinite(dbm) ? Math.pow(10, dbm / 10) : 0; }

  // ==========================================================================
  // 3) SHADERS DO MAPA VOLUMÉTRICO
  // ==========================================================================
  // O gradiente de cor vem por-vértice (atributo `cor`, RGBA = cor do nível + alfa base); `uFade` faz o fade-in.
  // O alfa é levemente reduzido em ângulos rasantes (efeito de "volume" barato) usando a normal em espaço de vista.
  // [22/09/2026] `#include <clipping_planes_pars_vertex/fragment>` + a chamada em `main()` -- OBRIGATÓRIO pra um
  // `THREE.ShaderMaterial` CUSTOM respeitar `material.clippingPlanes` (a "Vista em Corte"). O three.js só injeta
  // esses trechos automaticamente em materiais PRONTOS (MeshStandardMaterial etc.); um shader escrito à mão, como
  // este, é ignorado pelo clipping a menos que a gente inclua os chunks manualmente (e marque `clipping: true`
  // no material, feito em `_construirMalha`).
  const VERT = '#include <clipping_planes_pars_vertex>\n'
    + 'attribute vec4 cor; varying vec4 vCor; varying float vRasante;\n'
    + 'void main(){ vCor = cor; vec4 mv = modelViewMatrix * vec4(position,1.0);\n'
    + '  vec3 n = normalize(normalMatrix * normal); vRasante = abs(dot(n, normalize(-mv.xyz)));\n'
    + '  gl_Position = projectionMatrix * mv;\n'
    // [22/09/2026] o chunk `clipping_planes_vertex` do three.js espera uma variável chamada exatamente
    // `mvPosition` (posição em espaço de câmera) -- é só um alias de `mv`, já calculado acima.
    + '  vec4 mvPosition = mv;\n'
    + '  #include <clipping_planes_vertex>\n'
    + '}';
  const FRAG = '#include <clipping_planes_pars_fragment>\n'
    + 'uniform float uFade; varying vec4 vCor; varying float vRasante;\n'
    + 'void main(){\n'
    + '  #include <clipping_planes_fragment>\n'
    + '  float a = vCor.a * uFade * (0.55 + 0.45 * vRasante); gl_FragColor = vec4(vCor.rgb, a); }';

  // ==========================================================================
  // 3.5) GERAÇÃO DE MALHA DA VARREDURA -- 'malha_real' × 'malha_simplificada' (MODOS_MALHA)
  // ==========================================================================
  // A varredura amostra o cardioide de sinal numa GRADE ESFÉRICA regular (θ = polar, φ = azimutal -- ver
  // `AccessPoint._direcao`/`startScan`), uma "nuvem de pontos densa" por natureza JÁ ESTRUTURADA (cada raio
  // tem uma posição de grade (ti,pj) bem definida, não é uma nuvem solta/desordenada). Isso é o que permite
  // uma fusão de vértices coplanares EXATA e barata: em vez de reconstruir uma malha do zero a partir de uma
  // núvem de pontos genérica (Delaunay/convex-hull arbitrário -- caro e, em geral, NP-difícil de fazer bem
  // pra "boundary reconstruction" de superfícies não-convexas), percorremos a própria grade com uma técnica
  // de LOD adaptativo hierárquico (quadtree em θ×φ): cada bloco retangular da grade que é aproximadamente
  // PLANO (a distância no centro do bloco bate com a interpolação bilinear dos 4 cantos, dentro de uma
  // tolerância) vira UM ÚNICO quad grande (2 triângulos) -- geometricamente equivalente a "fundir os vértices
  // internos coplanares e manter só o contorno", só que expresso como uma condição de curvatura local em vez
  // de um hull 2D explícito (produz o MESMO resultado prático nesta topologia de grade regular, com custo
  // O(células) em vez de O(n log n) de um Delaunay genérico). Onde a curvatura é alta (quina de um pilar
  // cilíndrico, silhueta de um obstáculo pequeno, lóbulo do cardioide se estreitando) o algoritmo detecta o
  // desvio e SUBDIVIDE, refinando até a resolução máxima da grade (=1 raio por vértice) exatamente ali -- é
  // a "Curvatura Inteligente Adaptativa" pedida: polígonos grandes em superfícies retas, polígonos pequenos
  // só onde a forma realmente muda de direção.

  /** [22/09/2026] NOVO -- 'malha_real': gera as cascas SEM nenhuma otimização (1 vértice de malha por raio
   *  disparado -- proporção 1:1, comportamento ORIGINAL do motor). Opera direto sobre `Float32Array`/
   *  `Uint32Array` pré-alocados do tamanho exato (sem nenhuma alocação de objeto por vértice). */
  /** [23/09/2026] NOVO, [23/09/2026] o motor avançado (único outro chamador) foi removido -- monta o
   *  `THREE.Mesh` multi-material (1 por nível) a partir de `gerado` (saída de `gerarCascasReal`/
   *  `optimizeSignalMesh`) pra `_construirMalha`. */
  function montarMeshDeCascas(THREE, gerado, nNiv, mostrarNiveis, wireframe, nome) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(gerado.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(gerado.nor, 3));
    geo.setAttribute('cor', new THREE.BufferAttribute(gerado.cor, 4));
    geo.setIndex(new THREE.BufferAttribute(gerado.idx, 1));
    geo.computeBoundingSphere();
    const trisOffsets = new Uint32Array(nNiv + 1);
    for (let k = 0; k < nNiv; k++) trisOffsets[k + 1] = trisOffsets[k] + gerado.trisPorCasca[k];
    const uniformsCompartilhado = { uFade: { value: 0 } };
    const materiais = [];
    for (let k = 0; k < nNiv; k++) {
      geo.addGroup(trisOffsets[k] * 3, (trisOffsets[k + 1] - trisOffsets[k]) * 3, k);
      const matNivel = new THREE.ShaderMaterial({
        uniforms: uniformsCompartilhado, vertexShader: VERT, fragmentShader: FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, wireframe: !!wireframe,
        clipping: true, // [22/09/2026] necessário p/ os `#include <clipping_planes_*>` do VERT/FRAG funcionarem
      });
      matNivel.visible = mostrarNiveis[k] !== false;
      materiais.push(matNivel);
    }
    const m = new THREE.Mesh(geo, materiais);
    m.name = nome; m.renderOrder = 8; m.frustumCulled = false;
    m.raycast = function () {};                    // o mapa de sinal nunca intercepta cliques nem raycasts
    m.userData.wifi = true;
    return { mesh: m, trisOffsets };
  }

  function gerarCascasReal(g, t) {
    const { nT, nP, nNiv, vPorCasca, dirs, rayDe, o, niveis, distEfetivo, visivelArr, malhaCompleta } = g;
    // [23/09/2026] AMPLIADO -- pedido verbatim: "o 'Por nível' [...] só a parte das formas 3D que estão
    // 'dentro do nível' [...] entre a casca externa e a casca 'interna' [...] do nível correspondente [...]
    // se for 'excelente', como não tem casca mais interna, acaba sendo no ponto do próprio AP." Antes, as
    // "paredes" laterais iam sempre até o AP (`apexIdx`), certo só pra 'completo' (onde a busca de colisão
    // já é `[0, borda]`, então a fatia É do AP até a borda). Pra 'por nível' (fatiado), a fatia é
    // `[borda do nível mais forte anterior, borda deste nível]` -- então agora cada casca ganha um ANEL
    // INTERNO inteiro (não mais 1 único vértice), na distância `distIn` de CADA raio (a borda do nível mais
    // forte anterior; 0 -- o AP -- só pro nível mais interno, 'excelente', que não tem mais nada "dentro").
    // Com 'completo', `distIn` é sempre 0 pra todo raio (mesmo efeito de antes, só que expresso como um
    // anel todo colapsado no AP em vez de 1 vértice só -- resultado idêntico). A malha vira, então, um
    // "gomo" fechado: casca externa (borda deste nível) + casca interna (borda anterior/AP) + paredes
    // ligando as duas nas arestas onde a colisão começa/termina -- só quando 'Colisão real' está ativo
    // (`visivelArr`/`vA`); em 'Alcance' continua só a casca externa de sempre.
    const vPorCascaTotal = vPorCasca * 2;                        // anel externo + anel interno, por nível
    const tPorCascaMax = 12 * nT * nP;                           // casca externa(2) + interna(2) + paredes (até 4 arestas × 2 tris)
    const pos = new Float32Array(nNiv * vPorCascaTotal * 3), cor = new Float32Array(nNiv * vPorCascaTotal * 4);
    const nor = new Float32Array(pos.length), idx = new Uint32Array(nNiv * tPorCascaMax * 3);
    const trisPorCasca = new Uint32Array(nNiv);
    let ni = 0;
    for (let k = 0; k < nNiv; k++) {
      const base = k * vPorCascaTotal, N = niveis[k], dEk = distEfetivo && distEfetivo[k], vA = visivelArr && visivelArr[k];
      for (let v = 0; v < vPorCasca; v++) {
        // [23/09/2026] CORRIGIDO de novo -- pedido verbatim: "quando estiver marcado 'Colisão real', o
        // desenho deve parar onde houve a colisão." A POSIÇÃO do vértice EXTERNO volta a usar a distância
        // EFETIVA (`distEfetivo`/`dEk`: a colisão real, se achou nesse raio; a borda analítica, senão) --
        // em vez da borda de sempre (`t.dist`) pra TODOS os vértices. Onde há colisão de verdade, a
        // superfície para exatamente ali; onde não há (mas o quad ainda é desenhado por causa de um vizinho
        // colidido, ver `quadVisivel`), continua caindo na borda como aproximação razoável. Em 'Alcance'
        // (`distEfetivo` nulo) nada muda -- sempre a borda de sempre.
        const i = rayDe[v], distOut = dEk ? dEk[i] : t.dist[k][i], p = (base + v) * 3, c = (base + v) * 4;
        pos[p] = o.x + dirs[v * 3] * distOut; pos[p + 1] = o.y + dirs[v * 3 + 1] * distOut; pos[p + 2] = o.z + dirs[v * 3 + 2] * distOut;
        nor[p] = dirs[v * 3]; nor[p + 1] = dirs[v * 3 + 1]; nor[p + 2] = dirs[v * 3 + 2];   // normal ≈ direção radial (bom p/ o efeito rasante)
        cor[c] = N.cor[0]; cor[c + 1] = N.cor[1]; cor[c + 2] = N.cor[2]; cor[c + 3] = N.alfa;
        // anel INTERNO (vértice v + vPorCasca desta casca): borda do nível mais forte anterior ('por nível')
        // ou o próprio AP ('completo'/nível mais interno) -- mesma distância usada pra montar `visivelArr`
        // em `_construirMalha` (`dIn`). Escrito sempre (barato), só REFERENCIADO nos índices quando `vA`.
        const distIn = malhaCompleta ? 0 : (k < nNiv - 1 ? t.dist[k + 1][i] : 0);
        const pIn = (base + vPorCasca + v) * 3, cIn = (base + vPorCasca + v) * 4;
        pos[pIn] = o.x + dirs[v * 3] * distIn; pos[pIn + 1] = o.y + dirs[v * 3 + 1] * distIn; pos[pIn + 2] = o.z + dirs[v * 3 + 2] * distIn;
        nor[pIn] = -dirs[v * 3]; nor[pIn + 1] = -dirs[v * 3 + 1]; nor[pIn + 2] = -dirs[v * 3 + 2];   // voltada pra dentro
        cor[cIn] = N.cor[0]; cor[cIn + 1] = N.cor[1]; cor[cIn + 2] = N.cor[2]; cor[cIn + 3] = N.alfa;
      }
      // [23/09/2026] CORRIGIDO -- pedido verbatim: "a malha gerada na varredura normal deve ficar igual à
      // malha gerada na varredura avançada." Um quad colidido isolado, com vizinhos sem colisão, nunca
      // formava NENHUMA face (nem uma sequer tocando ele) com o antigo "E lógico" dos 4 cantos -- agora basta
      // 1 canto visível (OU lógico) pra desenhar o quad inteiro, fechando esses pontos.
      // [23/09/2026] CORRIGIDO de novo -- pedido verbatim: "apareceu uma forma atrás do AP, sendo que não
      // havia objeto para colidir ali. É só onde houve colisão, 'no ar' não deve aparecer formas." A
      // tentativa anterior tratava os POLOS (`ti===0`/`ti+1===nT` -- a ponta frontal/traseira do cardioide,
      // um único ponto) como SEMPRE visíveis, incondicionalmente -- criava uma forma "fantasma" bem ali
      // mesmo sem NENHUMA colisão real por perto (exatamente o caso relatado, "atrás do AP"). Removido: os
      // polos agora só contam como visíveis quando o próprio raio deles teve colisão real, como qualquer
      // outro raio.
      // [23/09/2026] CORRIGIDO de novo -- pedido verbatim: "ainda está aparecendo algumas faces ligadas a
      // pontos no ar (sem colisão com um objeto)." O "1 de 4" (OU lógico) da correção anterior desenhava o
      // quad inteiro mesmo com só 1 canto colidido -- os outros 3 caíam na borda analítica (posição "no
      // ar", sem nenhuma colisão ali), exatamente o defeito relatado. Volta ao "E lógico": só desenha o
      // quad quando os 4 cantos tiveram colisão real -- um ponto colidido isolado (vizinhos sem colisão)
      // fica sem face nenhuma (preferível a inventar face tocando o ar).
      const quadVisivel = (ti, pj) => {
        if (!vA) return true;
        const va2 = ti * nP + pj, vb2 = ti * nP + (pj + 1) % nP, vc2 = (ti + 1) * nP + pj, vd2 = (ti + 1) * nP + (pj + 1) % nP;
        return !!(vA[rayDe[va2]] && vA[rayDe[vb2]] && vA[rayDe[vc2]] && vA[rayDe[vd2]]);
      };
      const niAntes = ni;
      for (let ti = 0; ti < nT; ti++) for (let pj = 0; pj < nP; pj++) {
        const va = ti * nP + pj, vb = ti * nP + (pj + 1) % nP, vc = (ti + 1) * nP + pj, vd = (ti + 1) * nP + (pj + 1) % nP;
        // [23/09/2026] CORRIGIDO -- o corte por `visivelArr` (só desenha onde houve colisão real) volta a
        // se aplicar SEMPRE que 'Colisão real' estiver ativo (`vA` presente), com ou sem 'completo' -- a
        // única coisa que 'completo' muda é a FAIXA de busca da colisão (ver `_construirMalha`, `dIn`), não
        // se o corte é aplicado.
        if (!quadVisivel(ti, pj)) continue;
        const a = base + va, b = base + vb, c2 = base + vc, e = base + vd;
        idx[ni++] = a; idx[ni++] = c2; idx[ni++] = b;
        idx[ni++] = b; idx[ni++] = c2; idx[ni++] = e;
        if (!vA) continue;   // sem 'Colisão real' não há recorte nenhum -- nunca precisa de casca interna/parede
        // casca INTERNA (mirror da externa, mesmos índices +vPorCasca) -- fecha o "fundo" do gomo.
        const aIn = a + vPorCasca, bIn = b + vPorCasca, cIn = c2 + vPorCasca, eIn = e + vPorCasca;
        idx[ni++] = aIn; idx[ni++] = bIn; idx[ni++] = cIn;
        idx[ni++] = bIn; idx[ni++] = eIn; idx[ni++] = cIn;
        // 4 arestas deste quad -- emite 1 "parede" (2 triângulos, externo→interno) sempre que o quad vizinho
        // do outro lado dela NÃO existir (borda do polo, `ti===0`/`ti===nT-1`) ou não for visível. `side:
        // THREE.DoubleSide` no material (ver `_construirMalha`) deixa a ordem dos vértices não importar.
        if (ti === 0 || !quadVisivel(ti - 1, pj)) { idx[ni++] = a; idx[ni++] = b; idx[ni++] = bIn; idx[ni++] = a; idx[ni++] = bIn; idx[ni++] = aIn; }
        if (ti === nT - 1 || !quadVisivel(ti + 1, pj)) { idx[ni++] = c2; idx[ni++] = e; idx[ni++] = eIn; idx[ni++] = c2; idx[ni++] = eIn; idx[ni++] = cIn; }
        if (!quadVisivel(ti, (pj - 1 + nP) % nP)) { idx[ni++] = a; idx[ni++] = c2; idx[ni++] = cIn; idx[ni++] = a; idx[ni++] = cIn; idx[ni++] = aIn; }
        if (!quadVisivel(ti, (pj + 1) % nP)) { idx[ni++] = b; idx[ni++] = e; idx[ni++] = eIn; idx[ni++] = b; idx[ni++] = eIn; idx[ni++] = bIn; }
      }
      trisPorCasca[k] = (ni - niAntes) / 3;
    }
    // [22/09/2026] NOVO, [23/09/2026] MUDADO -- `trisPorCasca`: quantos triângulos cada nível/casca ocupa
    // no buffer de índices -- usado por `_construirMalha` pra montar `this._grade.trisOffsets`, que
    // `projectHeatmapTo2D` (fatiamento 3D→2D) precisa pra saber ONDE cada casca começa/termina no índice.
    // [23/09/2026] Antes sempre o MESMO `tPorCasca` (este modo não variava a resolução por casca) -- agora
    // pode variar TAMBÉM aqui no modo 'colisão real' (`visivelArr`, acima -- alguns quads não são emitidos),
    // por isso o buffer de índices é alocado no tamanho MÁXIMO (`tPorCascaMax`) e devolvido via `subarray`
    // (só até `ni`, o que foi realmente escrito) -- mesmo padrão já usado por `optimizeSignalMesh`.
    return { pos, nor, cor, idx: idx.subarray(0, ni), nVerts: nNiv * vPorCascaTotal, nTris: ni / 3, trisPorCasca };
  }

  /**
   * [22/09/2026] NOVO -- `optimizeSignalMesh(densePointArray)`: recebe a nuvem de pontos BRUTA da varredura
   * (`g` = grade/direções comuns + `t.dist` = distância de cada raio por nível -- a "densePointArray" desta
   * engine, já que os raios formam uma grade θ×φ regular, não uma núvem solta) e devolve os buffers prontos
   * pra montar a `THREE.BufferGeometry` otimizada e leve ("DETECÇÃO E FUSÃO DE VÉRTICES COPLANARES" +
   * "CURVATURA INTELIGENTE ADAPTATIVA" do pedido -- ver comentário grande da seção acima pra a explicação
   * completa da técnica). Roda 1x por CASCA (nível de sinal) via `processarBloco` (quadtree recursivo,
   * profundidade máxima ~log2(max(nT,nP)), portanto sempre rasa e segura pra pilha de chamadas).
   *
   * Nota de engenharia: a fusão NÃO cruza a "costura" φ=360°→0° (o bloco raiz cobre pj em [0, nP], sem
   * wrap) -- o pior caso é meia dúzia de triângulos extras numa única coluna de costura por casca (o mesmo
   * truque de "duplicar a coluna de fechamento" usado em qualquer esfera UV) -- desprezível perto do ganho
   * de reduzir 90%+ dos polígonos nas regiões planas do cardioide/paredes.
   */
  function optimizeSignalMesh(g, t) {
    const { nT, nP, nNiv, dirs, rayDe, o, niveis, distEfetivo, visivelArr, malhaCompleta } = g;
    // Tolerância de "achatamento": um bloco vira 1 único quad quando o raio amostrado no CENTRO do bloco
    // bate com o raio INTERPOLADO (bilinear) dos 4 cantos dentro desta margem -- é a "mesma superfície
    // plana" (mesmo vetor normal, dentro do ruído numérico do raycast) pedida no enunciado.
    const TOL_REL = 0.015;                 // 1,5% do raio médio do bloco
    const TOL_MIN = 0.02;                  // m -- piso absoluto (evita blocos gigantes quando o raio é pequeno)
    const BLOCO_MAX = Math.max(4, Math.round(Math.max(nT, nP) / 6));   // maior bloco permitido (mantém a silhueta legível mesmo num lóbulo bem liso)
    // Buffers de SAÍDA: pré-alocados no tamanho máximo teórico (= malha_real, o pior caso possível) -- зero
    // alocação de objeto por vértice/triângulo; ao final, `subarray()` devolve uma VIEW (não copia memória)
    // só até o que foi realmente escrito.
    const vPorCascaMax = (nT + 1) * nP, tPorCascaMax = 2 * nT * nP;
    const pos = new Float32Array(nNiv * vPorCascaMax * 3), cor = new Float32Array(nNiv * vPorCascaMax * 4);
    const nor = new Float32Array(pos.length), idx = new Uint32Array(nNiv * tPorCascaMax * 3);
    let nv = 0, ni = 0;                    // cursores de escrita (vértices e índices), somados por TODAS as cascas
    // cache de vértice por (ti,pj) DENTRO da casca atual -- evita duplicar um vértice já emitido quando 2
    // blocos vizinhos compartilham uma aresta (essencial: sem isto a malha ficaria com furos/trincas visuais
    // entre um bloco grande "plano" e um bloco pequeno "refinado" ao lado).
    const cacheChave = new Map();
    // [23/09/2026] NOVO -- pedido verbatim: "'Modo dos pontos/raios' [...] deve atuar também [...] em
    // 'superfície de malha (por nível)'." `distEfetivo`/`visivelArr` (montados em `_construirMalha`, MESMA
    // lógica de `_construirPontosRaios`) trazem, no modo 'colisão real', a distância da colisão de verdade
    // (em vez da borda analítica) e se houve colisão na faixa daquele nível -- `raioDe` passa a devolver a
    // distância EFETIVA (some com `distEfetivo`, senão cai em `t.dist` de sempre, modo 'alcance'), e
    // `temColisao` diz se aquele canto (ti,pj) do nível `k` teve colisão real (sempre `true` no modo
    // 'alcance', já que `visivelArr` é `null` ali).
    // [23/09/2026] CORRIGIDO -- devolve sempre a borda analítica do nível (igual 'Alcance', com ou sem
    // 'completo') -- a posição/forma nunca muda com 'Colisão real', só a MÁSCARA (`temColisao` abaixo)
    // recorta pra mostrar só onde houve colisão real.
    function raioDe(k, ti, pj) { const v = ti * nP + (pj % nP), i = rayDe[v]; return t.dist[k][i]; }
    function temColisao(k, ti, pj) { const va = visivelArr && visivelArr[k]; return !va || !!va[rayDe[ti * nP + (pj % nP)]]; }
    function emitVertice(k, N, ti, pj) {
      const chave = ti * (nP + 1) + pj;
      let vi = cacheChave.get(chave);
      if (vi !== undefined) return vi;
      const v = ti * nP + (pj % nP), dist = raioDe(k, ti, pj);
      const dx = dirs[v * 3], dy = dirs[v * 3 + 1], dz = dirs[v * 3 + 2];
      const p = nv * 3, c = nv * 4;
      pos[p] = o.x + dx * dist; pos[p + 1] = o.y + dy * dist; pos[p + 2] = o.z + dz * dist;
      nor[p] = dx; nor[p + 1] = dy; nor[p + 2] = dz;
      cor[c] = N.cor[0]; cor[c + 1] = N.cor[1]; cor[c + 2] = N.cor[2]; cor[c + 3] = N.alfa;
      vi = nv++; cacheChave.set(chave, vi);
      return vi;
    }
    function emitirQuad(k, N, ti0, pj0, ti1, pj1) {
      const a = emitVertice(k, N, ti0, pj0), b = emitVertice(k, N, ti0, pj1), c2 = emitVertice(k, N, ti1, pj0), d = emitVertice(k, N, ti1, pj1);
      idx[ni++] = a; idx[ni++] = c2; idx[ni++] = b;
      idx[ni++] = b; idx[ni++] = c2; idx[ni++] = d;
    }
    function processarBloco(k, N, ti0, pj0, ti1, pj1) {
      const largT = ti1 - ti0, largP = pj1 - pj0;
      // [23/09/2026] CORRIGIDO -- o corte por `temColisao` volta a se aplicar SEMPRE que 'Colisão real'
      // estiver ativo, com ou sem 'completo' -- 'completo' só muda a FAIXA de busca da colisão (ver
      // `_construirMalha`), não se o corte é aplicado.
      if (visivelArr) {
        const v00 = temColisao(k, ti0, pj0), v01 = temColisao(k, ti0, pj1), v10 = temColisao(k, ti1, pj0), v11 = temColisao(k, ti1, pj1);
        if (!(v00 && v01 && v10 && v11)) {
          if (largT <= 1 && largP <= 1) return;   // folha sem colisão real nos 4 cantos -- nada a desenhar aqui
          // visibilidade mista dentro do bloco -- nunca funde num quad grande (senão "vazaria" área sem
          // colisão real junto com a que colidiu) -- sempre refina até achar exatamente onde a colisão
          // começa/termina, até a resolução máxima da grade se preciso.
          const tiM2 = ti0 + Math.max(1, largT >> 1), pjM2 = pj0 + Math.max(1, largP >> 1);
          processarBloco(k, N, ti0, pj0, tiM2, pjM2);
          processarBloco(k, N, ti0, pjM2, tiM2, pj1);
          processarBloco(k, N, tiM2, pj0, ti1, pjM2);
          processarBloco(k, N, tiM2, pjM2, ti1, pj1);
          return;
        }
      }
      if (largT <= 1 && largP <= 1) { emitirQuad(k, N, ti0, pj0, ti1, pj1); return; }   // folha: resolução máxima da grade
      const r00 = raioDe(k, ti0, pj0), r01 = raioDe(k, ti0, pj1), r10 = raioDe(k, ti1, pj0), r11 = raioDe(k, ti1, pj1);
      const rMed = (r00 + r01 + r10 + r11) / 4;
      const tiM = ti0 + Math.max(1, largT >> 1), pjM = pj0 + Math.max(1, largP >> 1);
      const rCentroReal = raioDe(k, tiM, pjM);          // amostra de verdade (não interpolada) -- mede a curvatura de fato
      const rCentroPlano = rMed;                         // interpolação bilinear ~ média dos 4 cantos (grade regular)
      const tol = Math.max(TOL_MIN, TOL_REL * rMed);
      if (Math.abs(rCentroReal - rCentroPlano) <= tol && largT <= BLOCO_MAX && largP <= BLOCO_MAX) {
        emitirQuad(k, N, ti0, pj0, ti1, pj1);             // região achatada -- funde tudo num único quad grande
        return;
      }
      // curvatura acima da tolerância -- refina (quadtree: 4 sub-blocos)
      processarBloco(k, N, ti0, pj0, tiM, pjM);
      processarBloco(k, N, ti0, pjM, tiM, pj1);
      processarBloco(k, N, tiM, pj0, ti1, pjM);
      processarBloco(k, N, tiM, pjM, ti1, pj1);
    }
    // [22/09/2026] NOVO -- `trisPorCasca[k]`: quantos triângulos a casca `k` ocupou no buffer de índices --
    // AO CONTRÁRIO de `gerarCascasReal`, aqui esse número VARIA por casca (cada nível de sinal tem sua
    // própria curvatura/geometria, logo sua própria contagem de blocos fundidos vs. refinados). `_construirMalha`
    // usa isto pra montar `this._grade.trisOffsets`, essencial pra `projectHeatmapTo2D` (fatiamento 3D→2D)
    // saber onde cada casca começa/termina no índice -- sem isto, o corte 2D leria triângulos da casca ERRADA.
    const trisPorCasca = new Uint32Array(nNiv);
    for (let k = 0; k < nNiv; k++) {
      cacheChave.clear();                                 // costura entre cascas: cada nível tem seus próprios raios/vértices
      const niAntes = ni;
      processarBloco(k, niveis[k], 0, 0, nT, nP);
      trisPorCasca[k] = (ni - niAntes) / 3;
    }
    return { pos: pos.subarray(0, nv * 3), nor: nor.subarray(0, nv * 3), cor: cor.subarray(0, nv * 4), idx: idx.subarray(0, ni), nVerts: nv, nTris: ni / 3, trisPorCasca };
  }

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
      // [24/09/2026] NOVO, [25/09/2026] AMPLIADO -- pedido verbatim: "além do controle de 'mostrar mapa',
      // deve ter um outro controle de exibir os pontos da última batida do raycaster [...] e outra opção
      // de ver os raios do raycaster" + "Faça os 'raios do raycaster' ir trocando a cor conforme os níveis
      // da malha de cor dos 5 níveis que tem [...] deve ser possível escolher quais partes do raio ficam
      // aparecendo [...] Cada parte do raio pode ser ativada individualmente." Construídos junto com a
      // malha (ver `_construirPontosRaios`, chamado por `_concluir` logo depois de `_construirMalha`) a
      // partir dos MESMOS dados já calculados pela varredura (`t.dist[k]` = distância onde cada raio cruza
      // o nível `k`, ver `NIVEIS`) -- não recalcula nada, só desenha o que já existia. 1 THREE.Points + 1
      // THREE.LineSegments POR NÍVEL (5 de cada), cada um ligado/desligado à parte -- o segmento de raio do
      // nível `k` vai do fim do nível mais forte anterior até o ponto onde ESTE nível termina (index 4 =
      // "excelente"/mais forte/mais perto do AP → index 0 = "fraco"/mais fraco/mais longe).
      this.cloudRaycastPorNivel = [null, null, null, null, null];   // THREE.Points[5], 1 por nível de NIVEIS
      this.raiosRaycastPorNivel = [null, null, null, null, null];  // THREE.LineSegments[5], 1 por nível de NIVEIS
      // [23/09/2026] REMOVIDO -- pedido verbatim: "Remova todos os botões e métodos implementados para a
      // varredura avançada." (motor de reflexão/refração `SignalPropagationEngine` e todo o estado
      // `avancado*`/`*Avancado`/`*Avancada` removidos inteiros -- só resta a varredura normal.)
      // [29/09/2026] NOVO -- pedido verbatim: "Faça a opção de 'Vista em Corte' para a varredura normal [...]
      // uma superfície paralela ao chão [...] controlar a altura Y [...] controlar a opacidade [...] barra
      // de 0 a 100%." Estado do plano de corte + o `THREE.Mesh` do plano visual (criado sob demanda, ver
      // `atualizarCorte`/`_corteSuperficie`).
      this._corteSuperficie = null;   // THREE.Mesh do plano translúcido (visual, só aparece com `corteAtivo`)
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
      // [23/09/2026] MUDADO -- pedido verbatim: valor padrão de 'Potência (W)' passa a ser 2 W fixo
      // (antes vinha de `FAIXAS[...].potenciaPadraoW`, ~0,1-0,63W conforme a faixa) -- reaplicado só
      // quando ainda não há valor salvo (`> 0` falso), igual a antes; mudar a Faixa depois continua
      // livre pra reaplicar o padrão típico daquela faixa (ver setter `signalFrequency`), sem relação
      // com este valor inicial.
      if (!(r.ap.potenciaW > 0)) r.ap.potenciaW = 2;
      if (!DENSIDADES[r.ap.densidade]) r.ap.densidade = 'normal';
      // [22/09/2026] NOVO -- ver comentário grande em `MODOS_MALHA` acima. Padrão recomendado: simplificada.
      // [23/09/2026] MUDADO -- pedido verbatim: 'Modo de malha' passa a ter como padrão 'Malha real
      // (1 vértice por raio, sem otimização)' (antes 'malha_simplificada').
      if (!MODOS_MALHA[r.ap.meshMode]) r.ap.meshMode = 'malha_real';
      // [27/09/2026] MUDADO -- pedido verbatim: default era -90 dBm (escala de dBm REAL, de antes da
      // recalibração de `perdaPorDistancia`/`dbmDeIntensidade` pra bater com o motor original -- ver
      // comentário grande de `DBM_MINIMO_VISIVEL`). Agora o padrão É esse limite físico do motor original
      // (onde o nível 'fraco' também acabaria), pra "com as mesmas configurações" as duas varreduras pararem
      // exatamente na mesma distância em campo aberto.
      // [28/09/2026] CORRIGIDO -- pedido verbatim: "verifiquei em um mapa e região em linha reta [...] o
      // cardioide da avançada é muito maior [...] sem refração/reflexão." Causa real: mapas SALVOS antes
      // desta recalibração (rodada 27/09) já tinham `rssiThreshold` gravado no valor antigo (-90, escala de
      // dBm REAL) -- um número FINITO, então o guard acima (só reagia a `!Number.isFinite`) nunca substituía
      // por `DBM_MINIMO_VISIVEL`. Na escala NOVA (perto de 0, nunca chega a -90 com potência/faixa normais),
      // -90 fica MUITO abaixo de qualquer dBm alcançável -- o corte por limiar nunca dispara, e o raio só
      // para no teto absoluto do raycaster (`D_MAX_ABS`, 60 m), daí o cardioide gigante. Agora também
      // repara valores fora do clamp atual (ver `set rssiThreshold`, -80..20) pra qualquer AP salvo antes.
      // [29/09/2026] CORRIGIDO -- pedido verbatim: "o cardioide gerado pela varredura avançada gera um
      // cardioide muito maior (acaba indo até o limite de 60m)." Causa raiz REAL (o fix de 28/09 acima não
      // cobriu este caso): o valor antigo era -90 dBm, mas o SETTER (`set rssiThreshold`) sempre grampeou
      // isso em -80 (`Math.max(-80, ...)`) ANTES de persistir -- então mapas salvos entre 22/09 e 27/09
      // tinham `rssiThreshold` gravado EXATAMENTE `-80`, um valor FINITO e DENTRO do clamp -80..20, que o
      // guard `< -80` (estritamente menor) não pega (`-80 < -80` é falso). Na escala nova, -80 dBm é tão
      // baixo que o corte por limiar praticamente nunca dispara (equivale a ~10.000× mais fraco que o nível
      // "fraco"), então o raio só para no teto absoluto do raycaster (`D_MAX_ABS`, 60 m) -- exatamente o
      // sintoma relatado. -80 é também o EXTREMO inferior do slider/campo "Limiar (dBm)" -- nenhum uso
      // legítimo escolheria manualmente o mínimo absoluto, então tratamos `<= -80` (em vez de `< -80`) como
      // "ainda no valor antigo/nunca customizado de verdade", migrando pra `DBM_MINIMO_VISIVEL` também.
      if (!Number.isFinite(r.ap.rssiThreshold) || r.ap.rssiThreshold <= -80 || r.ap.rssiThreshold > 20) r.ap.rssiThreshold = DBM_MINIMO_VISIVEL;
      if (typeof r.ap.mostrar2D !== 'boolean') r.ap.mostrar2D = true;
      if (!METODOS2D[r.ap.metodo2D]) r.ap.metodo2D = 'fatiamento';
      if (!(r.ap.opacidade2D >= 0) || r.ap.opacidade2D > 1) r.ap.opacidade2D = 1;
      // [24/09/2026] NOVO, [25/09/2026] AMPLIADO -- pedido verbatim: controles de exibir "os pontos da
      // última batida do raycaster" e "os raios do raycaster" (motor original) -- 1 flag POR NÍVEL (5, ver
      // `NIVEIS`), todos desligados por padrão -- estes são um extra pra quem quer enxergar a amostragem
      // "crua" por trás dele). Array de 5 booleanos, índice = índice em `NIVEIS` (0 = fraco/vermelho .. 4 = excelente/verde).
      if (!Array.isArray(r.ap.mostrarPontosNiveis) || r.ap.mostrarPontosNiveis.length !== 5) r.ap.mostrarPontosNiveis = [false, false, false, false, false];
      if (!Array.isArray(r.ap.mostrarRaiosNiveis) || r.ap.mostrarRaiosNiveis.length !== 5) r.ap.mostrarRaiosNiveis = [false, false, false, false, false];
      // [22/09/2026] NOVO -- pedido verbatim: "Na varredura normal deve haver dois modos para os pontos do
      // raycaster (por nível). O jeito atual (até o limite de atenuação para aquele nível) e o outro jeito
      // (apenas onde, dentro daquele nível, houve batida em alguma superfície com raycaster) [...] os 'raios
      // do raycaster (por nível)' devem seguir estes pontos." 'alcance' (padrão, comportamento de sempre) =
      // ponto na borda ANALÍTICA do nível (`t.dist[k][i]`, onde a intensidade cruza o limiar daquele nível,
      // exista ou não uma superfície real ali); 'colisao' = ponto só onde o raycaster realmente bateu numa
      // superfície DENTRO da faixa de distância daquele nível (senão, nem gera ponto/raio pra aquele nível
      // naquele raio -- ver `_construirPontosRaios`).
      if (r.ap.pontosRaycasterModo !== 'alcance' && r.ap.pontosRaycasterModo !== 'colisao') r.ap.pontosRaycasterModo = 'alcance';
      // [23/09/2026] NOVO -- pedido verbatim: "Faça um seletor com duas opções: 'por nível' e 'raio completo'. [...] será possível controlar se [...] o raio apareceram só na parte do nível correspondente ativado no botão ou o raio completo será desenhado partindo do AP até a extremidade mais externa daquele nível." 'porNivel' (padrão, comportamento de sempre) = segmento fatiado, só dentro da faixa [borda-interna, borda-externa] daquele nível; 'completo' = segmento inteiro, sempre a partir da origem do AP até a mesma extremidade (ver `_construirPontosRaios`).
      if (r.ap.raiosExtensao !== 'porNivel' && r.ap.raiosExtensao !== 'completo') r.ap.raiosExtensao = 'porNivel';
      // [26/09/2026] NOVO -- pedido verbatim: "Deve ser possível habilitar as formas 3D produzidas
      // independentemente também [...] mostrá-las individualmente. E também só habilitar a superfície mais
      // externa." Mesmo padrão de `mostrarPontosNiveis`/`mostrarRaiosNiveis` acima (1 booleano por nível de
      // `NIVEIS`), mas aqui o padrão é TODOS LIGADOS (mantém o "mostrar mapa" mostrando as 5 cascas juntas
      // como sempre foi, até o usuário desligar alguma) -- ver `_construirMalha`/`setMostrarMalhaNivel`.
      if (!Array.isArray(r.ap.mostrarMalhaNiveis) || r.ap.mostrarMalhaNiveis.length !== 5) r.ap.mostrarMalhaNiveis = [true, true, true, true, true];
      // [26/09/2026] NOVO -- pedido verbatim: "Deve ser possível selecionar se vai ser sólido ou wireframe
      // (tanto a forma do nível todo quanto a superfície mais externa)." 1 flag só, aplicada às 5 cascas
      // (a "superfície mais externa" é só o nível 0 -- ver `mostrarMalhaNiveis` -- então liga/desliga junto).
      if (typeof r.ap.malhaWireframe !== 'boolean') r.ap.malhaWireframe = false;
      // [24/09/2026] NOVO -- pedido verbatim: tooltip resumido ao mirar o AP em 3D deve mostrar "número
      // de dispositivos conectados" -- contador PRÓPRIO (Wi-Fi não tem cabo físico por cliente pra contar
      // de verdade), editável nas propriedades do AP, começa em 0.
      if (!(r.ap.numDispositivos >= 0)) r.ap.numDispositivos = 0;
      // [25/09/2026] NOVO -- pedido verbatim: "deve ter uma opção para habilitar uma janelinha simplista
      // do AP (mesmo fechando a janela do AP, a janelinha deve ficar ativa, se a opção [...] estiver
      // habilitada)." Persistido (sobrevive a fechar/reabrir a janela de propriedades E a sair/entrar no
      // "Ver em 3D") -- ver `view3d-rede.js` `_wfMiniAtualizarTodas`/`_wfMiniHtml`.
      if (typeof r.ap.miniJanela !== 'boolean') r.ap.miniJanela = false;
      // [24/09/2026] NOVO -- ver `manterAnterior` (getter abaixo). Padrão: comportamento de sempre (nova
      // varredura apaga a anterior) -- lido de `MapConfig.apManterVarreduraNormalAnteriorPadrao` (seção
      // "Configurações 3D" → "📡 Access Point"), `false` se o MapConfig ainda não carregou.
      if (typeof r.ap.manterAnterior !== 'boolean') {
        const mc = raiz.MapConfig && raiz.MapConfig._cache;
        r.ap.manterAnterior = !!(mc && mc.apManterVarreduraNormalAnteriorPadrao);
      }
      // [23/09/2026] REMOVIDO -- pedido verbatim: "Remova todos os botões e métodos implementados para a
      // varredura avançada." (config/estado `avancado*` removidos inteiros.)
      // [29/09/2026] NOVO -- pedido verbatim: "Faça a opção de 'Vista em Corte' para a varredura normal [...]
      // controlar a altura Y [...] controlar a opacidade [...] barra de 0 a 100%." `corteAltura01` é a
      // posição RELATIVA (0..1) do plano dentro da extensão vertical das cascas (0 = base, 1 = topo -- ver
      // `atualizarCorte`, que resolve isso pra uma altura Y absoluta a cada varredura, já que a extensão
      // muda a cada resultado); `corteOpacidade` é só do plano VISUAL (a superfície em si), não das formas.
      if (typeof r.ap.corteAtivo !== 'boolean') r.ap.corteAtivo = false;
      if (!(r.ap.corteAltura01 >= 0) || r.ap.corteAltura01 > 1) r.ap.corteAltura01 = 1;
      if (!(r.ap.corteOpacidade >= 0) || r.ap.corteOpacidade > 1) r.ap.corteOpacidade = 0.35;
      // [22/09/2026] NOVO -- pedido verbatim: "deve ter um outro modo o corte de giro [...] Deve ser possível
      // definir um ângulo fixo (que será o 0) e usar o outro ângulo para variar de 0 até 100% do cardioide
      // visível. O eixo de giro é o Y [...] Por padrão, fica o modo de corte de superfície de cima para baixo
      // (deve ser possível mover este eixo de deslocamento por meio de dois eixos de giro, [...] em um eixo
      // inclinado a 30°, por exemplo)." `corteModo` escolhe entre os dois. `corteGiroAnguloFixo` (graus, 0..360)
      // é a "mão do relógio" fixa (referência = 0%); `corteGiroPercentual01` (0..1) é o quanto a segunda "mão"
      // já girou em torno dela -- ver `atualizarCorte()`/`_atualizarCorteVisual()` pra matemática dos dois
      // planos de recorte (modo 'giro' usa DOIS `THREE.Plane`, `clipIntersection` alternado conforme o ângulo
      // varrido seja <= ou > 180°, ver comentário grande lá).
      // [22/09/2026] MUDADO -- pedido verbatim: "em vez das inclinações serem X e Z, faça 2 eixos aninhados,
      // ou seja, o eixo de fora faz o seu giro e posiciona o eixo interno em alguma posição. Depois, o eixo
      // interno gira sobre si mesmo, enquanto o eixo maior está em sua própria posição." Substitui as duas
      // inclinações independentes (X/Z) por um par giroscópico (gimbal): `corteEixoExterno` (graus, 0..360)
      // gira em torno do eixo Y do mundo, "posicionando" pra qual lado o eixo interno vai apontar;
      // `corteEixoInterno` (graus, -89..89) inclina o plano em torno DESSE eixo já reposicionado -- juntos
      // cobrem qualquer direção de inclinação possível (coordenadas esféricas: externo = azimute, interno =
      // colatitude a partir da vertical), ver `_aplicarCorteSuperficie`.
      if (r.ap.corteModo !== 'superficie' && r.ap.corteModo !== 'giro') r.ap.corteModo = 'superficie';
      if (!Number.isFinite(r.ap.corteEixoExterno)) r.ap.corteEixoExterno = 0; else r.ap.corteEixoExterno = ((r.ap.corteEixoExterno % 360) + 360) % 360;
      if (!Number.isFinite(r.ap.corteEixoInterno)) r.ap.corteEixoInterno = 0; else r.ap.corteEixoInterno = Math.max(-89, Math.min(89, r.ap.corteEixoInterno));
      if (!Number.isFinite(r.ap.corteGiroAnguloFixo)) r.ap.corteGiroAnguloFixo = 0; else r.ap.corteGiroAnguloFixo = ((r.ap.corteGiroAnguloFixo % 360) + 360) % 360;
      if (!(r.ap.corteGiroPercentual01 >= 0) || r.ap.corteGiroPercentual01 > 1) r.ap.corteGiroPercentual01 = 1;
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
    /** [22/09/2026] NOVO -- 'malha_real' (1:1 raio→vértice) ou 'malha_simplificada' (padrão, ver `MODOS_MALHA`). */
    get meshMode() { return this._cfg().meshMode; }
    set meshMode(v) { if (MODOS_MALHA[v]) this._cfg().meshMode = v; }
    /** Limiar de corte (dBm-equivalente -- mesma escala calibrada de `DBM_POR_NIVEL`/`perdaPorDistancia`,
     *  não dBm real de RF) -- abaixo disso o ponto/raio nem chega a ser desenhado. Padrão = `DBM_MINIMO_VISIVEL`
     *  (mesmo limite do nível 'fraco' -- ver comentário grande de `DBM_MINIMO_VISIVEL`).
     */
    get rssiThreshold() { return this._cfg().rssiThreshold; }
    set rssiThreshold(v) { v = Number(v); if (Number.isFinite(v)) this._cfg().rssiThreshold = Math.max(-80, Math.min(20, v)); }
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
        // [25/09/2026] a caixa 3D do PRÓPRIO AP (todas as malhas com pick.id === obj.id) nunca é alvo -- é isto que
        // faz o raio "ignorar a caixa 3D do AP" (decisão do usuário, ver comentário grande de IGNORAR_PERTO).
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
      // [24/09/2026] NOVO -- pedido verbatim: "Deve ter a opção de habilitar ou não [...] se, ao fazer uma nova
      // varredura, fica sendo exibida a varredura anterior (caso esteja habilitada para aparecer) ou não."
      // Com `manterAnterior` ligado a malha/pontos/raios antigos ficam na cena durante a varredura e só são
      // trocados pelos novos ao concluir (ver `_concluir`).
      if (!this.manterAnterior) this.clear();
      if (opc.densidade) this.densidade = opc.densidade;
      if (opc.meshMode) this.meshMode = opc.meshMode;
      const passo = DENSIDADES[this.densidade].passo;
      const nT = Math.max(2, Math.round(180 / passo)), nP = Math.max(4, Math.round(360 / passo));
      const total = 2 + (nT - 1) * nP;                 // polos (2) + anéis intermediários
      const THREE = this.engine.THREE;
      // atualiza matrizes uma vez -- o Raycaster usa matrixWorld das malhas
      if (this.engine._group) this.engine._group.updateMatrixWorld(true);
      this._tarefa = {
        pose, nT, nP, total, passo, i: 0, t0: performance.now(),
        alvos: this._alvos(),
        raycaster: new THREE.Raycaster(),
        dir: new THREE.Vector3(), tmp: [],
        dist: NIVEIS.map(() => new Float32Array(total)),
        P: this.powerWatts, faixa: this.signalFrequency, meshMode: this.meshMode, rssiThreshold: this.rssiThreshold,
        orcamento: Math.max(1, opc.orcamentoMs || ORCAMENTO_MS),
        saida: new Float32Array(NIVEIS.length),
        barreirasPorRaio: new Array(total).fill(null),   // ver `_passo`/`_cfg` (comentário grande, modo 'colisao')
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
          // [28/09/2026] REMOVIDO -- havia aqui um corte analítico extra (2 planos horizontais infinitos,
          // "piso"/"teto" do andar do AP, tratados como concreto) que NÃO existia no motor avançado. Pedido
          // verbatim: "coloquei o AP a 2,95m [...] o semi cardioide da parte de baixo fica mais amplo do
          // que a parte de cima, parece que há uma parede invisível [...] Verifique se tem a ver com a
          // altura do andar [...] refatore para não ter mais esta limitação." Era exatamente isso: como o
          // plano do "teto" ficava perto da altura do AP, o hemisfério de cima batia nele quase de
          // imediato (raio bem curto até lá) enquanto o de baixo tinha o piso bem mais longe -- uma
          // assimetria artificial, sem relação com nenhuma parede/laje real modelada na cena (o único
          // "chão" real, `Engine3D._floorMesh`, não atenua -- ver `atenuacaoDoPick`, `case 'floor'` nem
          // existe, cai no `default: return 0`). Removido pra igualar ao motor avançado: só a geometria
          // REAL (parede/porta/janela/pilar/viga/escada) atenua; sem laje analítica nenhum dos dois motores
          // finge um teto que não está desenhado.
          barreiras.sort((a, b) => a.d - b.d);
        }
        distanciasDoRaio(P0, barreiras, t.saida, intensidadeDeDbm(t.rssiThreshold));
        for (let k = 0; k < NIVEIS.length; k++) t.dist[k][t.i] = t.saida[k];
        // [22/09/2026] NOVO -- guarda as distâncias de TODAS as colisões reais deste raio (não só as que de
        // fato atenuam -- basta ter batido em algo com `atenuacaoDoPick > 0`, mesmo critério de `barreiras`
        // acima), pro modo 'colisao' de `_construirPontosRaios` (ver comentário grande em `_cfg()`) saber,
        // por nível, se existiu uma superfície real dentro daquela faixa de distância.
        t.barreirasPorRaio[t.i] = barreiras.length ? barreiras.map((b) => b.d) : null;
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
      if (this.manterAnterior) this.clear();   // [24/09/2026] troca a varredura antiga (mantida na tela) pela nova
      // [22/09/2026] NOVO -- guarda a tarefa concluída (dist/pose/barreirasPorRaio) pra `pontosRaycasterModo`
      // poder reconstruir os pontos/raios do raycaster instantaneamente ao trocar de modo, sem refazer a
      // varredura (ver setter em `_cfg()`/comentário grande lá).
      this._ultimaTarefa = t;
      this._construirMalha(t);
      this._construirPontosRaios(t);
      // [22/09/2026] NOVO -- "quantos pontos são usados para gerar toda a malha dos níveis de sinal": `raiosBrutos`
      // é a nuvem de pontos AMOSTRADA (raios disparados × níveis de sinal -- a precisão física, sempre máxima,
      // nunca é reduzida); `pontosMalha`/`trianglesMalha` é o que de fato chega à GPU depois da esteira de
      // otimização (idêntico a `raiosBrutos` no modo 'malha_real' -- ver `_construirMalha`/`optimizeSignalMesh`).
      this.ultimoResultado = {
        raios: t.total, tempoMs: Math.round(performance.now() - t.t0), passo: t.passo,
        alcanceM: t.dist[0].reduce((m, v) => (v > m ? v : m), 0),
        meshMode: t.meshMode, raiosBrutos: this.pontosBrutos, pontosMalha: this.pontosMalha, trianglesMalha: this.trianglesMalha,
      };
      this._setProgresso(100);
      this._fadeIn();
      if (typeof this.onDone === 'function') { try { this.onDone(this, this.ultimoResultado); } catch (e) { /* ignore */ } }
    }

    /**
     * [22/09/2026] MUDADO -- vira um DESPACHANTE entre os 2 `meshMode` (ver `MODOS_MALHA`): monta a grade
     * comum (direções unitárias por raio, compartilhadas por todas as cascas -- idêntico a antes) e delega a
     * geração de vértices/índices para `_gerarCascasReal` (comportamento ORIGINAL, 1 vértice por raio) ou
     * `optimizeSignalMesh` (nova esteira de simplificação adaptativa). O restante (material/mesh/inserção na
     * cena) é o mesmo para os 2 modos -- só o CONTEÚDO da geometria muda.
     */
    /**
     * @param {object} t
     * @param {boolean} [instantaneo] [24/09/2026] NOVO -- pedido verbatim: "ao ativar os botões de
     *   'superfície da malha' e, depois, ativar e desativar as opções de 'reflexão' e de 'refração' a malha
     *   pisca (desaparece e reaparece). Faça com que a troca seja imediata sem essa transição." A malha nova
     *   sempre nasce com `uFade=0` e `_fadeIn()` anima 0→1 -- ótimo pra uma varredura terminando agora, mas
     *   perceptível como "pisca" ao só REFILTRAR um resultado já visível (`AccessPointAvancado._refiltrar`,
     *   troca de reflexão/refração). Com `instantaneo=true`, pula a animação: `uFade` vai direto pra 1.
     */
    _construirMalha(t, instantaneo) {
      const THREE = this.engine.THREE, nT = t.nT, nP = t.nP, nNiv = NIVEIS.length;
      const vPorCasca = (nT + 1) * nP;
      // direções unitárias de cada vértice da grade (reutilizadas por todas as cascas E pelos 2 modos de malha)
      const dirs = new Float32Array(vPorCasca * 3), rayDe = new Uint32Array(vPorCasca), d = new THREE.Vector3();
      for (let ti = 0; ti <= nT; ti++) for (let pj = 0; pj < nP; pj++) {
        const r = ti === 0 ? 0 : ti === nT ? 1 : 2 + (ti - 1) * nP + pj, v = ti * nP + pj;
        this._direcao(t, r, d); dirs[v * 3] = d.x; dirs[v * 3 + 1] = d.y; dirs[v * 3 + 2] = d.z; rayDe[v] = r;
      }
      // [23/09/2026] NOVO -- pedido verbatim: "'Modo dos pontos/raios' [...] deve atuar também [...] em
      // 'superfície de malha (por nível)' [...] poderá mostrar a forma 3D (por nível), apenas onde houve
      // colisão, quando 'Colisão real' estiver selecionado." Só no modo 'colisao' (`pontosRaycasterModo`):
      // pra cada nível `k`/raio primário `i`, procura a PRIMEIRA barreira real (`t.barreirasPorRaio[i]`)
      // dentro da faixa `[dIn, dOut]` daquele nível -- MESMA lógica/mesma faixa de `_construirPontosRaios`
      // (ver comentário grande lá). `distEfetivo[k][i]` = distância a usar pro vértice daquele raio/nível
      // (a colisão real, se achou; a borda analítica `dOut`, senão -- só usada se `visivelArr` disser que é
      // visível); `visivelArr[k][i]` = 1 se achou colisão real na faixa, 0 senão. No modo 'alcance' (de
      // sempre) os dois ficam `null` -- `gerarCascasReal`/`optimizeSignalMesh` caem no `t.dist` de sempre.
      // [23/09/2026] NOVO -- pedido verbatim: "ao fazer uma varredura e em 'superfície 3D do motor avançado
      // (por nível)', deixar apenas o 'excelente' ativado, uma forma é desenhada. Está forma é que deve ser
      // feita [...] na varredura normal quando se seleciona 'colisão real' e 'raio completo'." A malha do
      // motor AVANÇADO nunca "fura": todo vértice sempre tem uma distância (a de uma colisão real ao longo
      // do raio, ou a borda física quando não houve nenhuma), dando uma superfície sempre CONTÍNUA. Isso só
      // faz sentido combinado com 'raio completo' (procurar a colisão em toda a extensão [0, borda], não só
      // na fatia [dIn, borda] daquele nível) -- com 'por nível' a malha continua recortada (só aparece onde
      // colidiu, dentro da fatia), como já era.
      const raioCompleto = this.raiosExtensao === 'completo';
      let distEfetivo = null, visivelArr = null;
      if (this.pontosRaycasterModo === 'colisao') {
        distEfetivo = []; visivelArr = [];
        for (let k = 0; k < nNiv; k++) {
          const dE = new Float32Array(t.total), vA = new Uint8Array(t.total);
          for (let i = 0; i < t.total; i++) {
            const dOut = t.dist[k][i];
            // [23/09/2026] CORRIGIDO -- pedido verbatim: "os raios verdes estão indo até o limite do nível
            // fraco mais distante. Não é para ser assim [...] desenhar o raio/malha 'completo' significa
            // partir do AP e ir até o limite do SEU PRÓPRIO nível [...] Esta 'borda' é do próprio nível, não
            // a borda mais externa de todas do cardioide." A tentativa anterior removia o teto `dOut` da
            // busca (usava `bs[0]` em TODA a extensão do raio, sem limite) -- isso deixava um nível mais
            // forte "vazar" até a colisão real de um nível mais fraco (mais distante), errado. Volta a
            // limitar a busca ao teto `dOut` DESTE nível -- só a base (`dIn`) muda: 0 em 'completo' (busca a
            // colisão em toda a faixa [0, borda deste nível]), ou a borda do nível mais forte anterior em
            // 'por nível' (fatiado, comportamento de sempre).
            const dIn = raioCompleto ? 0 : (k < nNiv - 1 ? t.dist[k + 1][i] : 0);
            const bs = t.barreirasPorRaio && t.barreirasPorRaio[i];
            let achou = -1;
            if (bs) { for (let b = 0; b < bs.length; b++) { if (bs[b] >= dIn - 1e-6 && bs[b] <= dOut + 1e-6) { achou = bs[b]; break; } } }
            if (achou < 0) { dE[i] = dOut; vA[i] = 0; } else { dE[i] = achou; vA[i] = 1; }
          }
          distEfetivo.push(dE); visivelArr.push(vA);
        }
      }
      const grade = { THREE, nT, nP, nNiv, vPorCasca, dirs, rayDe, o: t.pose.origem, niveis: NIVEIS, distEfetivo, visivelArr, malhaCompleta: raioCompleto };
      // "pontos brutos": a nuvem de amostragem densa de verdade (raios × níveis) -- SEMPRE na densidade
      // configurada pelo usuário, independente do meshMode (a física/precisão nunca é reduzida).
      this.pontosBrutos = t.total * nNiv;
      const gerado = t.meshMode === 'malha_real' ? gerarCascasReal(grade, t) : optimizeSignalMesh(grade, t);
      this.pontosMalha = gerado.nVerts; this.trianglesMalha = gerado.nTris;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(gerado.pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(gerado.nor, 3));
      geo.setAttribute('cor', new THREE.BufferAttribute(gerado.cor, 4));
      geo.setIndex(new THREE.BufferAttribute(gerado.idx, 1));
      geo.computeBoundingSphere();
      // [26/09/2026] MUDADO -- pedido verbatim: "Deve ser possível habilitar as formas 3D produzidas
      // independentemente também [...] mostrá-las individualmente [...] só habilitar a superfície mais
      // externa [...] selecionar se vai ser sólido ou wireframe." Antes era 1 material ÚNICO pra malha
      // inteira (as 5 cascas juntas, tudo ou nada); agora é 1 `THREE.Mesh` MULTI-MATERIAL -- 1 material POR
      // NÍVEL (clone do mesmo shader, `uniforms` compartilhado entre todos pra 1 fade-in só), cada um
      // associado a um `geometry.group` (o intervalo de índices daquele nível dentro do MESMO buffer, já
      // calculado logo abaixo em `trisOffsets` -- QUALQUER um dos 5 pode ficar oculto (`material.visible =
      // false`, que o WebGLRenderer já respeita por grupo em meshes multi-material) ou em wireframe
      // (`material.wireframe`), sem precisar de 5 malhas/geometrias separadas. `mostrarMalhaNiveis`/
      // `malhaWireframe` (ver getters/setters abaixo) guardam o estado; a mais EXTERNA é o nível 0 ('fraco'
      // -- ver `NIVEIS`), então "só habilitar a superfície mais externa" é só ligar o nível 0 e desligar os
      // outros 4, do mesmo jeito que os pontos/raios por nível já funcionam.
      // [23/09/2026] MUDADO -- monta o `THREE.Mesh` multi-material via `montarMeshDeCascas` (compartilhada
      // (única chamadora desde a remoção do motor avançado).
      const { mesh: m, trisOffsets } = montarMeshDeCascas(THREE, gerado, nNiv, this.mostrarMalhaNiveis, this.malhaWireframe, 'wifi-mapa:' + this.obj.id);
      this.malha = m;
      if (this.engine._group) this.engine._group.add(m);
      // [21/09/2026] NOVO -- guarda a "forma" da grade (nT/nP/vPorCasca) e incrementa a versão da malha: é
      // o que permite a `projetarCorte2D`/`projetarTextura2D` (mais abaixo) fatiar/renderizar esta MESMA
      // malha depois, sem precisar refazer a varredura -- e permite ao mapa 2D saber (comparando a versão)
      // quando o corte em cache ficou desatualizado (nova varredura concluída).
      // [22/09/2026] MUDADO -- `tPorCasca` (fixo) virou `trisOffsets` (por casca): no modo 'malha_simplificada'
      // cada casca ocupa uma faixa de tamanho VARIÁVEL no buffer de índices (`gerado.trisPorCasca[k]`), então
      // `projectHeatmapTo2D` (fatiamento 3D→2D) precisa dos limites reais de cada uma, não de um passo fixo
      // -- ver comentário grande em `optimizeSignalMesh`/`gerarCascasReal` (`trisPorCasca`).
      this._grade = { nT, nP, vPorCasca, trisOffsets };
      this._malhaVersao = (this._malhaVersao || 0) + 1;
      this._corteCache = null;
      this._texturaCache = null;
      // [29/09/2026] NOVO -- reaplica a "Vista em Corte" (se estava ativa) na malha NOVA -- cada
      // `_construirMalha` cria um `THREE.Mesh`/materiais novos, então o `clippingPlanes` da malha anterior
      // não sobrevive sozinho (ver `atualizarCorte`).
      this.atualizarCorte();
      // [22/09/2026] NOVO -- a malha NOVA nasce com `visible` no padrão do THREE.Mesh (`true`), ignorando o
      // que já estava persistido em `mostrar2D` -- sem isto, toda vez que a malha é reconstruída (nova
      // varredura, reentrar no "Ver em 3D" etc.) o mapa "reaparecia" mesmo com "mostrar mapa" desmarcado
      // (até o próximo `atualizarVisibilidade()`/toggle manual). Sincroniza aqui, imediatamente.
      this.atualizarVisibilidade();
      // [23/09/2026] CORRIGIDO -- pedido verbatim: "Ao fazer a varredura normal e alternar entre 'Alcance' e
      // 'Colisão Real' a forma 3D desaparece e não volta mais." CAUSA RAIZ: cada malha NOVA nasce com o
      // uniform `uFade` (compartilhado pelos 5 materiais, ver `uniformsCompartilhado` acima) começando em 0
      // (invisível) -- só `_fadeIn()` (rAF que anima `uFade` 0→1) deixa ela aparecer. `_concluir()` (fim de
      // uma varredura) sempre chamava `_fadeIn()` DEPOIS de `_construirMalha()`, mas o setter
      // `pontosRaycasterModo` (troca de 'Alcance'/'Colisão real', ver comentário grande lá) reconstrói a
      // malha SEM passar por `_concluir()` -- a malha nova ficava presa em `uFade=0` pra sempre (só uma
      // varredura nova, que passa por `_concluir()`, resolvia). Chamar `_fadeIn()` aqui dentro, sempre que
      // uma malha nova nasce (não só ao fim de uma varredura), corrige na raiz -- `_concluir()` continua
      // chamando `_fadeIn()` depois também, mas isso só reinicia o mesmo rAF já em andamento, sem efeito
      // colateral (`_fadeIn()` cancela o anterior antes de começar um novo).
      // [24/09/2026] NOVO -- `instantaneo` (ver doc do método) pula a animação -- `uFade` direto em 1, sem
      // passar por `_fadeIn()`/rAF nenhum, pra um simples refiltro (reflexão/refração) não "piscar".
      if (instantaneo) {
        cancelAnimationFrame(this._fadeRaf);
        (Array.isArray(m.material) ? m.material[0] : m.material).uniforms.uFade.value = 1;
      } else {
        this._fadeIn();
      }
    }

    /** [24/09/2026] NOVO, [25/09/2026] AMPLIADO -- pedido verbatim: "um outro controle de exibir os pontos
     *  da última batida do raycaster [...] e outra opção de ver os raios do raycaster" + "Faça os 'raios do
     *  raycaster' ir trocando a cor conforme os níveis da malha de cor dos 5 níveis que tem [...] deve ser
     *  possível escolher quais partes do raio ficam aparecendo [...] Cada parte do raio pode ser ativada
     *  individualmente." Monta 5 pares de objetos 3D (1 nuvem de pontos + 1 conjunto de segmentos POR
     *  NÍVEL de `NIVEIS`) a partir dos MESMOS dados já calculados pela varredura (`t.dist[k]`, a distância
     *  onde cada raio cruza o nível `k`): o segmento de raio do nível `k` vai do fim do nível mais FORTE
     *  anterior (`t.dist[k+1]`, ou a origem do AP pro nível mais forte, índice 4/"excelente") até onde
     *  ESTE nível termina (`t.dist[k]`) -- emendados, os 5 segmentos formam o raio inteiro, cada trecho na
     *  cor do nível que atravessa (igual à malha). O ponto de cada nível fica na ponta externa do seu
     *  segmento (`t.dist[k]`). Visibilidade inicial vem dos toggles persistidos (`mostrarPontosNiveis`/
     *  `mostrarRaiosNiveis`, 1 flag por nível) -- por padrão todos OFF, mesmo com a varredura pronta. */
    _construirPontosRaios(t) {
      const THREE = this.engine.THREE, n = t.total, nNiv = NIVEIS.length;
      const dir = new THREE.Vector3(), o = t.pose.origem;
      const pontosNiveis = this.mostrarPontosNiveis, raiosNiveis = this.mostrarRaiosNiveis;
      // [22/09/2026] NOVO -- ver comentário grande em `_cfg()`. 'colisao': em vez de usar sempre a borda
      // ANALÍTICA do nível (`dOut`, exista ou não parede ali), só gera ponto/raio pro raio `i`/nível `k`
      // quando existiu uma colisão REAL (`t.barreirasPorRaio[i]`) DENTRO da faixa de distância `[dIn, dOut]`
      // daquele nível -- usa a distância da PRIMEIRA colisão real encontrada nessa faixa (a superfície que
      // realmente está ali) em vez de `dOut`. Sem colisão real na faixa, o raio `i` simplesmente NÃO entra no
      // buffer daquele nível (arrays de tamanho variável, montados abaixo, em vez dos `Float32Array(n*3)` de
      // tamanho fixo do modo 'alcance' -- por isso os dois modos usam listas JS comuns primeiro, convertidas
      // a `Float32Array` só no final). "Os raios [...] devem seguir estes pontos" -- os raios usam a MESMA
      // distância final (`dFinal`) do ponto correspondente, só que o outro extremo do segmento continua
      // fatiado (`dIn`), igual ao modo 'alcance'.
      const modoColisao = this.pontosRaycasterModo === 'colisao';
      // [23/09/2026] NOVO -- ver comentário grande em `_cfg()`/`raiosExtensao`. 'completo': o raio sempre
      // parte da origem do AP (0), em vez de ficar fatiado só dentro da faixa daquele nível.
      const raioCompleto = this.raiosExtensao === 'completo';
      for (let k = 0; k < nNiv; k++) {
        const posList = [], lineList = [];
        for (let i = 0; i < n; i++) {
          const dOut = t.dist[k][i];                                    // borda externa deste nível
          const dIn = raioCompleto ? 0 : (k < nNiv - 1 ? t.dist[k + 1][i] : 0);   // borda interna (nível mais forte anterior, ou a origem)
          let dFinal = dOut;
          if (modoColisao) {
            const bs = t.barreirasPorRaio && t.barreirasPorRaio[i];
            let achou = -1;
            // [23/09/2026] CORRIGIDO -- ver comentário grande em `_construirMalha` (mesma correção): a busca
            // continua sempre limitada ao teto `dOut` DESTE nível -- só a base `dIn` muda com 'completo'.
            if (bs) { for (let b = 0; b < bs.length; b++) { if (bs[b] >= dIn - 1e-6 && bs[b] <= dOut + 1e-6) { achou = bs[b]; break; } } }
            if (achou < 0) continue;   // nenhuma superfície real nesta faixa -- pula este raio/nível
            dFinal = achou;
          }
          this._direcao(t, i, dir);
          posList.push(o.x + dir.x * dFinal, o.y + dir.y * dFinal, o.z + dir.z * dFinal);
          lineList.push(o.x + dir.x * dIn, o.y + dir.y * dIn, o.z + dir.z * dIn, o.x + dir.x * dFinal, o.y + dir.y * dFinal, o.z + dir.z * dFinal);
        }
        const pos = Float32Array.from(posList), linePos = Float32Array.from(lineList);
        const corNivel = NIVEIS[k].cor, cor3 = new THREE.Color(corNivel[0], corNivel[1], corNivel[2]);
        const geoPts = new THREE.BufferGeometry();
        geoPts.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geoPts.computeBoundingSphere();
        const matPts = new THREE.PointsMaterial({ color: cor3, size: 0.045, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
        const pts = new THREE.Points(geoPts, matPts);
        pts.name = 'wifi-raycast-pontos:' + NIVEIS[k].nome + ':' + this.obj.id; pts.renderOrder = 9; pts.frustumCulled = false;
        pts.raycast = function () {};   // nunca intercepta cliques/raycasts do app
        pts.userData.wifi = true;
        pts.visible = !!pontosNiveis[k];
        const geoLines = new THREE.BufferGeometry();
        geoLines.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
        geoLines.computeBoundingSphere();
        const matLines = new THREE.LineBasicMaterial({ color: cor3, transparent: true, opacity: 0.4, depthWrite: false });
        const lines = new THREE.LineSegments(geoLines, matLines);
        lines.name = 'wifi-raycast-raios:' + NIVEIS[k].nome + ':' + this.obj.id; lines.renderOrder = 8; lines.frustumCulled = false;
        lines.raycast = function () {};
        lines.userData.wifi = true;
        lines.visible = !!raiosNiveis[k];
        this.cloudRaycastPorNivel[k] = pts; this.raiosRaycastPorNivel[k] = lines;
        if (this.engine._group) { this.engine._group.add(pts); this.engine._group.add(lines); }
      }
    }

    /** Fade-in suave (uniform `uFade` 0 → 1), guiado por rAF. */
    _fadeIn() {
      const m = this.malha; if (!m) return;
      const t0 = performance.now();
      const passo = () => {
        if (!this.malha || this.malha !== m) return;
        const k = Math.min(1, (performance.now() - t0) / FADE_MS);
        // [26/09/2026] MUDADO -- `m.material` agora é um ARRAY (1 por nível, ver `_construirMalha`), mas
        // todos compartilham o MESMO objeto `uniforms` -- só precisa escrever uma vez.
        (Array.isArray(m.material) ? m.material[0] : m.material).uniforms.uFade.value = k * k * (3 - 2 * k);   // smoothstep
        if (k < 1) this._fadeRaf = requestAnimationFrame(passo);
      };
      cancelAnimationFrame(this._fadeRaf); this._fadeRaf = requestAnimationFrame(passo);
    }

    /** Libera geometria/material da GPU de UMA malha (`THREE.Mesh` multi-material, ver `_construirMalha`) e
     *  a remove da cena -- não mexe em `this.malha`/estado nenhum, só descarta o objeto passado. [24/09/2026]
     *  NOVO -- extraído de `_removerMalha()` pra também ser usado por `AccessPointAvancado._refiltrar()`
     *  (troca instantânea: constrói a malha NOVA primeiro, só depois descarta a ANTIGA por aqui). */
    _disposeMalhaObj(m) {
      if (!m) return;
      if (m.parent) m.parent.remove(m);
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => mt.dispose());
    }
    /** Remove a malha antiga (libera geometria/material da GPU) e os caches/recursos da projeção 2D. */
    /** [23/09/2026] NOVO -- descarte só da malha atual (geometria/materiais + remove da cena), extraído de
     *  `clear()` pra ser reaproveitado por `pontosRaycasterModo` (trocar de modo agora reconstrói TAMBÉM a
     *  malha/superfície -- ver comentário grande no setter -- sem apagar `_ultimaTarefa`/pontos/raios/corte,
     *  ao contrário de `clear()`, que descarta tudo). */
    _removerMalha() {
      this._disposeMalhaObj(this.malha);
      this.malha = null;
    }
    clear() {
      cancelAnimationFrame(this._fadeRaf);
      this._removerMalha();
      // [24/09/2026] NOVO, [25/09/2026] AMPLIADO -- descarta junto as 5 nuvens de pontos/conjuntos de raios
      // do raycaster (1 por nível, ver construtor) -- mesmo ciclo de vida da malha (refeitos a cada nova
      // varredura, ver `_concluir`/`_construirPontosRaios`).
      this._descartarPontosRaios();
      this._grade = null; this._corteCache = null; this._texturaCache = null;
      if (this._rtAlvo) { this._rtAlvo.dispose(); this._rtAlvo = null; }   // libera o WebGLRenderTarget da Opção B
      this._removerCorteSuperficie();   // [29/09/2026] NOVO -- "Vista em Corte" some junto com a malha que recorta
      this._ultimaTarefa = null;
    }
    /** Libera geometria/material da GPU de UM par pontos+raios de um nível e os remove da cena -- não mexe em
     *  `cloudRaycastPorNivel`/`raiosRaycastPorNivel`, só descarta os objetos passados. [24/09/2026] NOVO --
     *  extraído de `_descartarPontosRaios()`, mesmo motivo de `_disposeMalhaObj` (troca instantânea). */
    _disposeParPontosRaios(p, l) {
      if (p) { if (p.parent) p.parent.remove(p); p.geometry.dispose(); p.material.dispose(); }
      if (l) { if (l.parent) l.parent.remove(l); l.geometry.dispose(); l.material.dispose(); }
    }
    /** [22/09/2026] NOVO -- descarte dos 5 pares pontos/raios do raycaster, extraído de `clear()` pra também
     *  ser reaproveitado por `pontosRaycasterModo` (trocar de modo refaz só ISTO, sem mexer na malha/corte). */
    _descartarPontosRaios() {
      for (let k = 0; k < this.cloudRaycastPorNivel.length; k++) {
        this._disposeParPontosRaios(this.cloudRaycastPorNivel[k], this.raiosRaycastPorNivel[k]);
        this.cloudRaycastPorNivel[k] = null; this.raiosRaycastPorNivel[k] = null;
      }
    }

    // [23/09/2026] REMOVIDO -- pedido verbatim: "Remova todos os botões e métodos implementados para a
    // varredura avançada." (startScanAvancado/cancelScanAvancado/clearAvancado/_fadeInAvancado/
    // _construirPontosAvancado/_reconstruirRaiosAvancado/aplicarVisibilidadeAvancado removidos inteiros.)

    /** Mostra/oculta o mapa conforme o AP pode emitir (ligado + cabo). Chamar após ligar/desligar/(des)conectar cabo. */
    atualizarVisibilidade() {
      if (!this.emiteSinal) {
        this.cancelScan();
        if (this.malha) this.malha.visible = false;
        for (let k = 0; k < this.cloudRaycastPorNivel.length; k++) {
          if (this.cloudRaycastPorNivel[k]) this.cloudRaycastPorNivel[k].visible = false;
          if (this.raiosRaycastPorNivel[k]) this.raiosRaycastPorNivel[k].visible = false;
        }
      } else {
        // [22/09/2026] CORRIGIDO -- antes forçava `malha.visible = true` incondicionalmente aqui, ignorando
        // o estado de `mostrar`/`mostrar2D` -- qualquer chamada a `atualizarVisibilidade()` (ex.: ligar/
        // desligar o AP, ver `apSync` em view3d-rede.js) religava a malha mesmo com "mostrar mapa"
        // desmarcado, uma das causas do desalinhamento reportado ("mostrar mapa" ativado/desativado sozinho
        // ao trocar de contexto 2D/3D). Agora respeita o toggle -- `this.mostrar` já é a fonte única de
        // verdade (ver getter/setter logo abaixo).
        if (this.malha) this.malha.visible = this.mostrar;
        const pontosNiveis = this.mostrarPontosNiveis, raiosNiveis = this.mostrarRaiosNiveis;
        for (let k = 0; k < this.cloudRaycastPorNivel.length; k++) {
          if (this.cloudRaycastPorNivel[k]) this.cloudRaycastPorNivel[k].visible = !!pontosNiveis[k];
          if (this.raiosRaycastPorNivel[k]) this.raiosRaycastPorNivel[k].visible = !!raiosNiveis[k];
        }
      }
    }
    // [22/09/2026] CORRIGIDO -- antes checava só `this.malha.parent` (verdadeiro mesmo se `parent` for o
    // `_group` de uma cena 3D JÁ DESCARTADA, de uma sessão "Ver em 3D" anterior) -- agora exige que o pai
    // seja o `_group` da engine ATUAL, senão a malha "existe" mas não está de fato na cena visível.
    get temMalha() { return !!(this.malha && this.engine && this.malha.parent === this.engine._group); }
    /** Liga/desliga só a exibição (sem apagar o resultado). Também persiste em `obj.rede.ap.mostrar2D`, pois o
     *  mapa 2D (Planta Baixa) lê esse mesmo flag para desenhar (ou não) o corte 2D, independente de haver uma
     *  sessão 3D viva com a malha construída.
     *  [22/09/2026] CORRIGIDO -- pedido verbatim: "mesmo estando a opção 'mostrar mapa' já ativada ... tem
     *  que desativar e ativar de novo para o desenho aparecer no mapa 2D" + "voltando pro 'Ver em 3D' ... o
     *  desenho 3D está desligado e a opção 'mostrar mapa' está desativada." Causa raiz: o GETTER lia de DUAS
     *  fontes diferentes dependendo do contexto (`temMalha` -- malha 3D anexada a uma engine viva -- lia
     *  `malha.visible`; senão lia `_cfg().mostrar2D`), então as duas podiam DIVERGIR: `atualizarVisibilidade()`
     *  (chamada ao ligar/desligar o AP, `apSync` em view3d-rede.js) forçava `malha.visible = true` incondicional
     *  (corrigido acima), e o mapa 2D (`_drawApSinal2D`, mapview-rede-2d.js) nem sequer consultava `mostrar` no
     *  caminho principal (malha 3D projetada) -- só o fallback sem malha respeitava `mostrar2D`. Resultado:
     *  ligar/desligar em um contexto não refletia no outro de forma confiável. Agora `_cfg().mostrar2D` é a
     *  ÚNICA fonte de verdade (o getter nunca mais lê `malha.visible` diretamente) -- `malha.visible` é sempre
     *  DERIVADO dela (aqui no setter, em `atualizarVisibilidade()`, e em `_construirMalha`/`_fadeIn`, que agora
     *  sincronizam a malha recém-criada com o valor persistido assim que ela é montada).
     *  Ver também: `_drawApSinal2D` (mapview-rede-2d.js) passou a checar `apExistente.mostrar` ANTES de
     *  escolher qualquer um dos dois caminhos de desenho 2D, então o toggle agora se reflete todo quadro, sem
     *  precisar desligar/religar pra "forçar" um redesenho. */
    set mostrar(v) { v = !!v; this._cfg().mostrar2D = v; if (this.malha) this.malha.visible = v && this.emiteSinal; }
    get mostrar() { return this._cfg().mostrar2D !== false; }
    /** [24/09/2026] NOVO, [25/09/2026] AMPLIADO -- exibir/ocultar os pontos (nuvem) e os raios (linhas) do
     *  raycaster do motor original, POR NÍVEL (0..4, ver `NIVEIS`) -- ver comentário grande no construtor
     *  (`cloudRaycastPorNivel`/`raiosRaycastPorNivel`). `mostrarPontosNiveis`/`mostrarRaiosNiveis` devolvem
     *  o array de 5 booleanos inteiro (pra UI ler todos de uma vez); `setMostrarPontosNivel(k, v)`/
     *  `setMostrarRaiosNivel(k, v)` ligam/desligam UM nível por vez. */
    get mostrarPontosNiveis() { return this._cfg().mostrarPontosNiveis; }
    setMostrarPontosNivel(k, v) {
      v = !!v; const arr = this._cfg().mostrarPontosNiveis;
      arr[k] = v; if (this.cloudRaycastPorNivel[k]) this.cloudRaycastPorNivel[k].visible = v;
    }
    get mostrarRaiosNiveis() { return this._cfg().mostrarRaiosNiveis; }
    setMostrarRaiosNivel(k, v) {
      v = !!v; const arr = this._cfg().mostrarRaiosNiveis;
      arr[k] = v; if (this.raiosRaycastPorNivel[k]) this.raiosRaycastPorNivel[k].visible = v;
    }
    /** [22/09/2026] NOVO, [23/09/2026] AMPLIADO -- ver comentário grande em `_cfg()`. Trocar de modo
     *  reconstrói os pontos/raios E, agora, TAMBÉM a malha/superfície (pedido verbatim: "['Modo dos
     *  pontos/raios'] deve atuar também [...] em 'superfície de malha (por nível)'") -- tudo a partir dos
     *  MESMOS dados já calculados pela última varredura (`this._ultimaTarefa`), sem precisar refazer a
     *  varredura, instantâneo. */
    get pontosRaycasterModo() { return this._cfg().pontosRaycasterModo; }
    set pontosRaycasterModo(v) {
      if (v !== 'alcance' && v !== 'colisao') return;
      this._cfg().pontosRaycasterModo = v;
      if (this._ultimaTarefa) {
        this._descartarPontosRaios(); this._construirPontosRaios(this._ultimaTarefa);
        this._removerMalha(); this._construirMalha(this._ultimaTarefa);
      }
    }
    /** [23/09/2026] NOVO -- ver comentário grande em `_cfg()`. Só afeta os RAIOS (segmentos) do raycaster --
     *  os pontos já são um único ponto na extremidade (não têm "parte de dentro" a mostrar/esconder) e a
     *  malha já representa a extensão completa de cada nível por natureza (é a própria borda/casca, não um
     *  segmento fatiado). Troca reconstrói só os raios, a partir dos dados já calculados -- instantâneo. */
    get raiosExtensao() { return this._cfg().raiosExtensao; }
    set raiosExtensao(v) {
      if (v !== 'porNivel' && v !== 'completo') return;
      this._cfg().raiosExtensao = v;
      if (this._ultimaTarefa) {
        this._descartarPontosRaios(); this._construirPontosRaios(this._ultimaTarefa);
        // [23/09/2026] NOVO -- combinado com 'colisão real', este modo agora TAMBÉM muda a forma da malha
        // (ver comentário grande em `_construirMalha`) -- reconstrói ela também, não só pontos/raios.
        this._removerMalha(); this._construirMalha(this._ultimaTarefa);
      }
    }
    /** [26/09/2026] NOVO -- mesmo padrão acima, mas pra CASCA (superfície 3D) de cada nível da malha do
     *  heatmap (ver `_construirMalha` -- 1 material por nível, `material.visible` liga/desliga aquela casca
     *  sem tocar nas outras). "só habilitar a superfície mais externa" (pedido verbatim) é só chamar
     *  `setMostrarMalhaNivel(0, true)` e desligar os outros 4 -- nível 0 = 'fraco', a casca mais externa. */
    get mostrarMalhaNiveis() { return this._cfg().mostrarMalhaNiveis; }
    setMostrarMalhaNivel(k, v) {
      v = !!v; const arr = this._cfg().mostrarMalhaNiveis; arr[k] = v;
      const mats = this.malha && this.malha.material;
      if (Array.isArray(mats) && mats[k]) mats[k].visible = v;
    }
    /** [26/09/2026] NOVO -- pedido verbatim: "selecionar se vai ser sólido ou wireframe (tanto a forma do
     *  nível todo quanto a superfície mais externa)" -- 1 flag pra todas as 5 cascas da malha (não têm modo
     *  independente por nível; só a VISIBILIDADE é independente, ver `mostrarMalhaNiveis` acima). */
    get malhaWireframe() { return this._cfg().malhaWireframe; }
    set malhaWireframe(v) {
      v = !!v; this._cfg().malhaWireframe = v;
      const mats = this.malha && this.malha.material;
      if (Array.isArray(mats)) mats.forEach((mt) => { mt.wireframe = v; });
    }
    /** [24/09/2026] NOVO -- "número de dispositivos conectados" (pedido verbatim), pro tooltip resumido do
     *  AP em 3D (ver `view3d-rede.js` `_hoverRotulo3D`) -- contador PRÓPRIO, sem ligação com portas/cabos
     *  físicos (Wi-Fi não tem isso), editável nas propriedades do AP. */
    set numDispositivos(v) { v = Math.round(Number(v)); if (Number.isFinite(v) && v >= 0) this._cfg().numDispositivos = v; }
    get numDispositivos() { return this._cfg().numDispositivos; }
    /** [25/09/2026] NOVO -- "janelinha simplista" do AP (ver `view3d-rede.js`) -- persiste mesmo com a
     *  janela de propriedades fechada e entre entradas em "Ver em 3D". */
    set miniJanela(v) { this._cfg().miniJanela = !!v; }
    get miniJanela() { return this._cfg().miniJanela; }
    /** [24/09/2026] NOVO -- "Manter a varredura anterior visível enquanto faz uma nova" (por tipo de varredura: a
     *  normal guarda em `obj.rede.ap.manterAnterior`, a avançada em `obj.rede.apAvancado.manterAnterior`). */
    get manterAnterior() { return !!this._cfg().manterAnterior; }
    set manterAnterior(v) { this._cfg().manterAnterior = !!v; }

    // ---- "Vista em Corte" (varredura normal) -------------------------------------------------------------------
    /** [29/09/2026] NOVO -- pedido verbatim: "Faça a opção de 'Vista em Corte' para a varredura normal [...]
     *  É como ter uma superfície paralela ao chão que se pode controlar a altura Y [...] controlar a
     *  opacidade [...] Uma barra de 0 a 100% [...] até totalmente aparente." Liga/desliga o recorte
     *  (`THREE.Plane` nos 5 materiais de `this.malha`) + o plano visual (`_corteSuperficie`). */
    get corteAtivo() { return this._cfg().corteAtivo; }
    set corteAtivo(v) { this._cfg().corteAtivo = !!v; this.atualizarCorte(); }
    /** Posição do plano de corte, 0..1 (0 = base das cascas -- tudo oculto; 1 = topo -- tudo aparente). Só usada
     *  no modo 'superficie' -- ver `corteModo`. */
    get corteAltura01() { return this._cfg().corteAltura01; }
    set corteAltura01(v) { v = Number(v); if (Number.isFinite(v)) this._cfg().corteAltura01 = Math.max(0, Math.min(1, v)); this.atualizarCorte(); }
    /** Opacidade só do(s) elemento(s) visual(is) do corte (a superfície/as "mãos", não das formas recortadas). */
    get corteOpacidade() { return this._cfg().corteOpacidade; }
    set corteOpacidade(v) { v = Number(v); if (Number.isFinite(v)) this._cfg().corteOpacidade = Math.max(0, Math.min(1, v)); this.atualizarCorte(); }
    /** [22/09/2026] NOVO -- 'superficie' (padrão, de sempre) ou 'giro' (novo modo "corte de giro", ver
     *  comentário grande em `_cfg()`). */
    get corteModo() { return this._cfg().corteModo; }
    set corteModo(v) { this._cfg().corteModo = (v === 'giro') ? 'giro' : 'superficie'; this.atualizarCorte(); }
    /** [22/09/2026] NOVO -- par giroscópico (gimbal) que inclina o plano do modo 'superficie': `corteEixoExterno`
     *  (graus, 0..360) gira em torno do eixo Y do mundo, posicionando a direção do eixo interno; `corteEixoInterno`
     *  (graus, -89..89) inclina o plano em torno desse eixo já reposicionado. 0° interno = plano horizontal de
     *  sempre (externo não tem efeito nenhum nesse caso). Ver `_aplicarCorteSuperficie`. */
    get corteEixoExterno() { return this._cfg().corteEixoExterno; }
    set corteEixoExterno(v) { v = Number(v); if (Number.isFinite(v)) this._cfg().corteEixoExterno = ((v % 360) + 360) % 360; this.atualizarCorte(); }
    get corteEixoInterno() { return this._cfg().corteEixoInterno; }
    set corteEixoInterno(v) { v = Number(v); if (Number.isFinite(v)) this._cfg().corteEixoInterno = Math.max(-89, Math.min(89, v)); this.atualizarCorte(); }
    /** [22/09/2026] NOVO -- ângulo fixo (graus, 0..360) da "mão" de referência do modo 'giro' -- é o 0% da
     *  varredura circular (ver `corteGiroPercentual01`). */
    get corteGiroAnguloFixo() { return this._cfg().corteGiroAnguloFixo; }
    set corteGiroAnguloFixo(v) { v = Number(v); if (Number.isFinite(v)) this._cfg().corteGiroAnguloFixo = ((v % 360) + 360) % 360; this.atualizarCorte(); }
    /** [22/09/2026] NOVO -- 0..1: quanto a "mão" móvel já se afastou da fixa (0% = coincidente/nada visível;
     *  100% = deu a volta inteira/tudo visível), sempre girando no sentido crescente a partir do ângulo fixo. */
    get corteGiroPercentual01() { return this._cfg().corteGiroPercentual01; }
    set corteGiroPercentual01(v) { v = Number(v); if (Number.isFinite(v)) this._cfg().corteGiroPercentual01 = Math.max(0, Math.min(1, v)); this.atualizarCorte(); }
    /** [23/09/2026] CORRIGIDO -- pedido verbatim: "a 'Altura do corte' deve controlar o deslocamento da
     *  superfície de corte pela sua normal bem no centro da superfície. Não como está atualmente." CAUSA
     *  RAIZ: a fórmula antiga (`bb.min.y + corteAltura01*(bb.max.y-bb.min.y)`) deslocava o plano SEMPRE
     *  pelo eixo Y do MUNDO, usando só a extensão vertical (Y) da bounding box -- correto por acaso quando
     *  o corte é horizontal (`corteEixoInterno`/`corteEixoExterno` = 0, onde "pela normal" e "por Y" são a
     *  mesma coisa), mas errado assim que o corte é inclinado: o plano continuava subindo/descendo só em
     *  Y, nunca ao longo da sua PRÓPRIA normal (já inclinada) -- e a referência de 0%/100% (`bb.min.y`/
     *  `bb.max.y`) também não tinha nenhuma relação com o CENTRO da malha, só com os extremos verticais
     *  dela. CORRIGIDO: `_corteSuperficiePonto()` (novo, abaixo) desloca o plano a partir do CENTRO real
     *  da bounding box (`bb.getCenter`), pela normal JÁ INCLINADA (mesma normal usada pelo recorte de
     *  verdade), por uma meia-extensão calculada projetando a meia-diagonal da caixa nessa normal (uma
     *  caixa é centralmente simétrica em torno do próprio centro, então essa meia-extensão vale IGUAL nos
     *  2 sentidos da normal) -- 0% = extremo "de baixo" da normal, 100% = extremo "de cima", sempre
     *  passando pelo centro em 50%, qualquer que seja a inclinação. Quando a normal é puramente vertical
     *  (caso de sempre, inclinação 0/0), o resultado é IDÊNTICO ao de antes (centro ± metade da extensão Y
     *  = `bb.min.y`/`bb.max.y`) -- corrige só o caso inclinado, sem mudar o comportamento já correto. */
    _corteSuperficiePonto() {
      const THREE = this.engine && this.engine.THREE;
      if (!this.malha || !THREE) return null;
      if (!this.malha.geometry.boundingBox) this.malha.geometry.computeBoundingBox();
      const bb = this.malha.geometry.boundingBox;
      const centro = bb.getCenter(new THREE.Vector3());
      const meio = bb.max.clone().sub(centro);   // meia-extensão por eixo (>= 0) -- caixa centralizada em `centro`
      const interno = this.corteEixoInterno * Math.PI / 180, externo = this.corteEixoExterno * Math.PI / 180;
      const normal = new THREE.Vector3(0, -1, 0);
      if (interno) normal.applyAxisAngle(new THREE.Vector3(1, 0, 0), interno);   // eixo interno gira sobre si mesmo
      if (externo) normal.applyAxisAngle(new THREE.Vector3(0, 1, 0), externo);   // eixo externo reposiciona o conjunto
      normal.normalize();
      // meia-extensão da caixa PROJETADA nesta normal (soma das projeções dos 3 semi-eixos -- fórmula
      // padrão de "extensão de uma AABB numa direção"), simétrica em torno de `centro` por construção.
      const meioExtensao = Math.abs(normal.x) * meio.x + Math.abs(normal.y) * meio.y + Math.abs(normal.z) * meio.z;
      const ponto = centro.clone().addScaledVector(normal, meioExtensao * (2 * this.corteAltura01 - 1));
      return { ponto, normal, centro, meioExtensao, interno, externo };
    }
    /** Altura Y (mundo) absoluta do plano de corte AGORA (modo 'superficie') -- só a componente Y do ponto
     *  de `_corteSuperficiePonto()` (mantido por compatibilidade: usado por `_corteInfo2D`/o mapa 2D, que
     *  só precisam da altura, ver comentário de `_corteInfo2D`). `null` sem malha nenhuma construída ainda. */
    get corteAlturaY() {
      const r = this._corteSuperficiePonto();
      return r ? r.ponto.y : null;
    }
    /** Aplica (ou remove) o recorte nos 5 materiais de `this.malha` + cria/atualiza/remove o(s) elemento(s)
     *  visual(is) -- despacha pro modo certo (`corteModo`). Chamada pelos setters acima e sempre que uma malha
     *  nova é construída (ver `_construirMalha`). */
    atualizarCorte() {
      const m = this.malha; if (!m) { this._removerCorteVisual(); return; }
      const THREE = this.engine && this.engine.THREE; if (!THREE) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (!this.corteAtivo) {
        mats.forEach((mt) => { mt.clippingPlanes = null; mt.clipIntersection = false; });
        this._removerCorteVisual();
        return;
      }
      if (this.engine.renderer) this.engine.renderer.localClippingEnabled = true;
      if (this.corteModo === 'giro') this._aplicarCorteGiro(THREE, mats);
      else this._aplicarCorteSuperficie(THREE, mats);
    }
    /** Modo 'superficie' -- um único `THREE.Plane`, orientado pelo par giroscópico `corteEixoExterno`/
     *  `corteEixoInterno` (0/0 = horizontal puro, comportamento de sempre) e posicionado na altura
     *  `corteAlturaY`. Mantém visível o lado "de baixo" do plano em relação à sua normal (0% = plano na base =
     *  nada visível; 100% = plano no topo = tudo visível, com a MESMA convenção de sempre quando a inclinação
     *  é 0/0).
     *  [22/09/2026] MUDADO -- gimbal (eixos aninhados) em vez de inclinação X/Z independente, ver comentário
     *  grande em `_cfg()`: a normal parte de "pra baixo" (0,-1,0), primeiro é inclinada pelo EIXO INTERNO (gira
     *  em torno do eixo X local, um "meridiano" fixo de referência) e SÓ DEPOIS o resultado inteiro é girado
     *  pelo EIXO EXTERNO (em torno do eixo Y do mundo) -- exatamente a ordem descrita no pedido: "o eixo de
     *  fora [...] posiciona o eixo interno [...] o eixo interno gira sobre si mesmo". Em coordenadas esféricas,
     *  `corteEixoInterno` é a colatitude (distância angular da vertical) e `corteEixoExterno` é o azimute --
     *  juntos alcançam QUALQUER direção de inclinação possível com só 2 ângulos. */
    _aplicarCorteSuperficie(THREE, mats) {
      // [23/09/2026] CORRIGIDO -- ver comentário grande de `_corteSuperficiePonto()` logo acima: o plano
      // agora nasce do CENTRO real da malha (não mais de `o.origem` no X/Z + `corteAlturaY` só no Y) e é
      // deslocado pela sua PRÓPRIA normal (não mais só pelo eixo Y do mundo), então `corteAltura01`
      // desloca de fato a superfície de corte "pela sua normal, bem no centro da superfície", em
      // QUALQUER inclinação -- não só quando o corte é horizontal.
      const r = this._corteSuperficiePonto(); if (!r) return;
      const { ponto: pontoNoPlano, normal, interno, externo } = r;
      if (!this._plano) this._plano = new THREE.Plane();
      this._plano.setFromNormalAndCoplanarPoint(normal, pontoNoPlano);
      mats.forEach((mt) => { mt.clippingPlanes = [this._plano]; mt.clipIntersection = false; });
      this._atualizarCorteVisualSuperficie(pontoNoPlano.y, normal, pontoNoPlano, interno, externo);
      this._removerCorteVisualGiro();
    }
    /** [22/09/2026] NOVO -- modo 'giro' ("corte de giro"): DOIS `THREE.Plane` verticais (eixo de giro = Y,
     *  sempre passando pelo eixo Y do próprio AP), um na "mão fixa" (`corteGiroAnguloFixo`, a referência = 0%)
     *  e outro na "mão móvel" (fixo + ângulo varrido, `corteGiroPercentual01 * 360°`). Visto de cima, o efeito
     *  é exatamente o pedido: "como o distanciar entre ponteiros de relógio" -- em 0% as duas mãos coincidem
     *  (nada visível); girando a mão móvel no sentido horário (ângulo crescente) a fatia "aberta" entre as
     *  duas mãos fica visível, até coincidirem de novo em 100% (volta completa = tudo visível).
     *
     *  MATEMÁTICA (mesma convenção de direção de sempre no arquivo -- `dx=sin(phi), dz=cos(phi)`, ver
     *  `calcularCorte2D`/`_direcao`): um plano vertical de ângulo θ, normal `n(θ)=(cosθ,0,-sinθ)`, mantém
     *  visível (lado positivo) o semicírculo `[θ, θ+180°]`. Com θ1 = ânguloFixo e θ2 = ânguloMóvel - 180°:
     *   - se o ângulo varrido (`sweep = percentual01 * 360°`) for <= 180°: a INTERSEÇÃO dos dois semicírculos
     *     (`clipIntersection = false`, comportamento padrão do three.js -- une os planos por "E") é exatamente
     *     a fatia `[ânguloFixo, ânguloMóvel]` -- prova: com θ2 <= θ1+180° (garantido quando sweep<=180°), a
     *     interseção de `[θ1,θ1+180°]` e `[θ2,θ2+180°]` é `[θ1, θ2+180°]` = `[ânguloFixo, ânguloMóvel]`.
     *   - se sweep > 180°: a UNIÃO dos mesmos dois semicírculos (`clipIntersection = true`, "OU") já dá a
     *     fatia maior -- prova: os dois semicírculos passam a se sobrepor (θ2 < θ1+180°), e a união de dois
     *     arcos de 180° que se sobrepõem é um arco contíguo de `360° - (180°-sweep+180°)` = `sweep`, começando
     *     em θ1. Testado numericamente (θ1=0°, sweep=270°): união de `[0°,180°]` e `[90°,270°]` = `[0°,270°]`. ✓
     *  Nos dois casos a transição em sweep=180° é contínua (os dois modos coincidem exatamente ali). */
    _aplicarCorteGiro(THREE, mats) {
      const o = this._pose(); if (!o) return;
      const fixoRad = this.corteGiroAnguloFixo * Math.PI / 180;
      const sweepRad = this.corteGiroPercentual01 * Math.PI * 2;
      const movelRad = fixoRad + sweepRad;
      const origem = new THREE.Vector3(o.origem.x, o.origem.y, o.origem.z);
      const normalDe = (theta) => new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));
      if (!this._planoGiro1) this._planoGiro1 = new THREE.Plane();
      if (!this._planoGiro2) this._planoGiro2 = new THREE.Plane();
      this._planoGiro1.setFromNormalAndCoplanarPoint(normalDe(fixoRad), origem);
      this._planoGiro2.setFromNormalAndCoplanarPoint(normalDe(movelRad - Math.PI), origem);
      const uniao = sweepRad > Math.PI;   // ver prova no comentário grande acima
      mats.forEach((mt) => { mt.clippingPlanes = [this._planoGiro1, this._planoGiro2]; mt.clipIntersection = uniao; });
      this._atualizarCorteVisualGiro(fixoRad, movelRad);
      this._removerCorteVisualSuperficie();
    }
    /** Cria/atualiza o plano visual translúcido do modo 'superficie' (referência de ONDE está o corte) -- um
     *  `THREE.PlaneGeometry`, dimensionado pelo alcance da última varredura (`ultimoResultado.alcanceM`, com
     *  folga), centrado na origem XZ do AP, orientado pela MESMA normal/ponto do plano de recorte de verdade
     *  (`normal`/`pontoNoPlano`, já calculados em `_aplicarCorteSuperficie`). Não recebe sombra/luz
     *  (`MeshBasicMaterial`) -- é uma referência visual, não parte real da cena. */
    _atualizarCorteVisualSuperficie(y, normal, pontoNoPlano, interno, externo) {
      const THREE = this.engine.THREE;
      const alcance = Math.max(1, (this.ultimoResultado && this.ultimoResultado.alcanceM) || 10) * 1.15;
      // [22/09/2026] CORRIGIDO -- pedido verbatim: "faça uma superfície mais larga para cobrir todo o
      // cardioide no modo 'superfície'. Atualmente é bem extenso, porém tem apenas uns 2m de largura." Causa
      // raiz: `geo.rotateX(-Math.PI/2)` (removido abaixo) BATIA a rotação nos vértices da geometria (a
      // extensão que era local Y virava local Z, ficando parada num quadrado 1×1 travado) -- `plano.
      // scale.set(alcance*2, alcance*2, 1)`, feito TODA vez logo abaixo, então escalava os eixos ERRADOS
      // (X e Y, quando a extensão real do plano já rotacionado estava em X e Z): o eixo X esticava
      // corretamente até `alcance*2`, mas o eixo Z (a "largura" de verdade, pós-rotação) ficava sempre
      // travado no tamanho original da geometria (1 metro) -- dava exatamente a tira comprida e estreita
      // reportada. Corrigido não batendo NENHUMA rotação na geometria (fica no padrão do
      // `THREE.PlaneGeometry`, plano local XY) -- toda a orientação (inclusive o caso horizontal de sempre)
      // passa a vir 100% do `quaternion` abaixo, então `scale.set(alcance*2, alcance*2, 1)` agora escala os
      // eixos CERTOS (X/Y locais = a extensão real da geometria) em qualquer orientação.
      if (!this._corteSuperficie) {
        const geo = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const plano = new THREE.Mesh(geo, mat);
        plano.name = 'wifi-corte:' + this.obj.id; plano.renderOrder = 9; plano.frustumCulled = false;
        plano.raycast = function () {}; plano.userData.wifi = true;
        this._corteSuperficie = plano;
        if (this.engine._group) this.engine._group.add(plano);
      }
      const plano = this._corteSuperficie;
      plano.scale.set(alcance * 2, alcance * 2, 1);
      plano.position.copy(pontoNoPlano);
      // [22/09/2026] CORRIGIDO -- pedido verbatim: "o eixo externo deve ser paralelo ao eixo Y do mundo e o
      // eixo interno deve ser perpendicular ao eixo externo. Do jeito que ficou [...] ao mover um dos eixos,
      // faz a superfície de corte só ficar dançando, sem verdadeiramente girar." CAUSA RAIZ:
      // `quaternion.setFromUnitVectors(a, b)` devolve UMA rotação válida que leva `a` até `b`, mas não é a
      // ÚNICA -- existem infinitas (qualquer giro adicional EM TORNO do próprio `b` também serve, já que não
      // muda pra onde `a` vai parar). A escolha do three.js pra essa rotação "sobrando" é uma função contínua
      // da entrada, mas SEM nenhum compromisso de ficar alinhada com `corteEixoExterno`/`corteEixoInterno` --
      // perto de certas configurações (ex.: `normal` passando perto do eixo -Z, ou de -Y) o giro "sobrando"
      // muda bruscamente mesmo pra uma pequena variação de ângulo, exatamente o "dançar sem girar de verdade"
      // relatado (o plano gira em torno da PRÓPRIA normal por conta própria, sem relação com o slider). CORRIGIDO:
      // monta o quaternion final DIRETO dos mesmos dois ângulos/eixos usados pra calcular `normal` (nunca via
      // `setFromUnitVectors`), então o giro "sobrando" fica sempre FIXO/determinístico em vez de arbitrário:
      // `qBase` é uma rotação CONSTANTE (não depende de nenhum slider) que leva a normal padrão do
      // `PlaneGeometry` (+Z local) até "pra baixo" (0,-1,0) -- o mesmo ponto de partida de `normal` em
      // `_aplicarCorteSuperficie`; `qInterno` gira em torno do eixo X do MUNDO (perpendicular ao eixo Y, como
      // pedido); `qExterno` gira em torno do eixo Y do MUNDO (o "eixo externo paralelo ao eixo Y", como
      // pedido) -- aplicados na MESMA ordem de `_aplicarCorteSuperficie` (`qBase` primeiro, `qInterno` depois,
      // `qExterno` por último), então o plano visual sempre gira exatamente 1:1 com os sliders, sem twist
      // residual nenhum.
      if (!this._eixoXMundo) this._eixoXMundo = new THREE.Vector3(1, 0, 0);
      if (!this._eixoYMundo) this._eixoYMundo = new THREE.Vector3(0, 1, 0);
      if (!this._qBaseCorte) this._qBaseCorte = new THREE.Quaternion().setFromAxisAngle(this._eixoXMundo, Math.PI / 2);
      if (!this._qCorteTmp1) this._qCorteTmp1 = new THREE.Quaternion();
      if (!this._qCorteTmp2) this._qCorteTmp2 = new THREE.Quaternion();
      this._qCorteTmp1.setFromAxisAngle(this._eixoXMundo, interno || 0);   // eixo interno -- perpendicular ao externo (Y)
      this._qCorteTmp2.setFromAxisAngle(this._eixoYMundo, externo || 0);   // eixo externo -- paralelo ao eixo Y do mundo
      plano.quaternion.copy(this._qCorteTmp2).multiply(this._qCorteTmp1).multiply(this._qBaseCorte);
      plano.material.opacity = this.corteOpacidade;
    }
    /** [22/09/2026] NOVO -- cria/atualiza as duas "mãos de relógio" visuais do modo 'giro': dois retângulos
     *  verticais finos (`THREE.PlaneGeometry`), um em cada ângulo (fixo/móvel), saindo do AP e se estendendo
     *  pelo alcance da varredura, cobrindo toda a extensão vertical das cascas -- a mesma referência visual
     *  que o plano do modo 'superficie' cumpre lá, mas em forma de "ponteiro" pra deixar claro visualmente os
     *  dois ângulos que definem a fatia visível. A mão fixa usa uma cor neutra (cinza); a móvel usa a mesma
     *  cor azul do modo 'superficie'. */
    _atualizarCorteVisualGiro(fixoRad, movelRad) {
      const THREE = this.engine.THREE, o = this._pose(); if (!o) return;
      const alcance = Math.max(1, (this.ultimoResultado && this.ultimoResultado.alcanceM) || 10) * 1.15;
      let alturaExtent = 3, yMid = o.origem.y;
      if (this.malha) {
        if (!this.malha.geometry.boundingBox) this.malha.geometry.computeBoundingBox();
        const bb = this.malha.geometry.boundingBox;
        alturaExtent = Math.max(0.5, bb.max.y - bb.min.y); yMid = (bb.max.y + bb.min.y) / 2;
      }
      const criarMao = (cor) => {
        const geo = new THREE.PlaneGeometry(1, 1);
        const mat = new THREE.MeshBasicMaterial({ color: cor, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'wifi-corte-giro:' + this.obj.id; mesh.renderOrder = 9; mesh.frustumCulled = false;
        mesh.raycast = function () {}; mesh.userData.wifi = true;
        if (this.engine._group) this.engine._group.add(mesh);
        return mesh;
      };
      if (!this._corteMaos) this._corteMaos = [criarMao(0x9aa3ad), criarMao(0x4f8cff)];
      const [maoFixa, maoMovel] = this._corteMaos;
      [[maoFixa, fixoRad], [maoMovel, movelRad]].forEach(([mesh, theta]) => {
        // ver a matemática de orientação/posição no comentário grande de `_aplicarCorteGiro` (mesma convenção
        // de direção `dx=sin, dz=cos`) -- gira em torno de Y por `theta - 90°` (mapeia o eixo local X, que a
        // malha nasce apontando +X, pra direção mundo (sinθ,cosθ)) e desloca `alcance/2` nessa direção (a mão
        // nasce centrada na origem local, então a metade da largura fica "pra trás" do AP sem este deslocamento).
        mesh.scale.set(alcance, alturaExtent, 1);
        mesh.rotation.set(0, theta - Math.PI / 2, 0);
        mesh.position.set(o.origem.x + Math.sin(theta) * alcance / 2, yMid, o.origem.z + Math.cos(theta) * alcance / 2);
        mesh.material.opacity = this.corteOpacidade;
      });
    }
    _removerCorteVisualSuperficie() {
      const p = this._corteSuperficie; if (!p) return;
      if (p.parent) p.parent.remove(p);
      p.geometry.dispose(); p.material.dispose();
      this._corteSuperficie = null;
    }
    _removerCorteVisualGiro() {
      const maos = this._corteMaos; if (!maos) return;
      maos.forEach((m) => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); });
      this._corteMaos = null;
    }
    /** Remove QUALQUER elemento visual do corte (os dois modos) -- usado ao desligar `corteAtivo`/remover a
     *  malha/trocar de modo. Mantém os nomes antigos (`_removerCorteSuperficie`) como alias, já que `clear()`
     *  ainda chama por esse nome. */
    _removerCorteVisual() { this._removerCorteVisualSuperficie(); this._removerCorteVisualGiro(); }
    _removerCorteSuperficie() { this._removerCorteVisual(); }

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
      // [22/09/2026] NOVO -- pedido verbatim: "O 'corte' que for feito no 3D deve ser feito no 2D também."
      // Chave de cache do estado da "Vista em Corte" (ver `_corteInfo2D`) -- qualquer mudança nela invalida o
      // cache mesmo com a mesma malha/plano Y, senão o mapa 2D ficaria "preso" no corte anterior até algo
      // mais mudar.
      const cfg = this._cfg();
      const corteChave = cfg.corteAtivo ? [cfg.corteModo, cfg.corteEixoExterno, cfg.corteEixoInterno, cfg.corteGiroAnguloFixo, cfg.corteGiroPercentual01, this.corteAlturaY].join('|') : '0';
      // cache: reaproveita o último corte se nada mudou (mesma malha, mesmo plano, mesmo estado do corte) --
      // evita refatiar a cada quadro do mapa 2D só porque o usuário está panorâmicamente arrastando/dando
      // zoom na Planta Baixa.
      const c = this._corteCache;
      if (c && c.malhaVersao === this._malhaVersao && c.planoY === y0 && c.corteChave === corteChave) return c.resultado;
      const geo = this.malha.geometry, pos = geo.attributes.position.array, idx = geo.index.array;
      // [22/09/2026] CORRIGIDO -- `tPorCasca` (passo fixo) não existe mais: no modo 'malha_simplificada'
      // cada casca tem um número DIFERENTE de triângulos (ver `_grade.trisOffsets`, montado em
      // `_construirMalha`), então os limites de cada nível vêm de `trisOffsets[k]`/`trisOffsets[k+1]`.
      const { trisOffsets } = this._grade;
      const origemMundo = this._pose(); // só usada pra devolver `origem` no resultado; o corte em si não depende disso
      let niveis = NIVEIS.map((N, k) => {
        const de = trisOffsets[k] * 3, ate = trisOffsets[k + 1] * 3;
        const segs = _fatiarNivelPorPlano(pos, idx, de, ate, y0);
        return { nome: N.nome, cor: N.cor, alfa: N.alfa, loops: _encadearLoops(segs) };
      });
      // [22/09/2026] NOVO -- aplica a MESMA "Vista em Corte" ativa no 3D (`atualizarCorte()`) sobre os laços
      // 2D já fatiados, recortando-os pelo(s) mesmo(s) meio-plano(s) (ver `_corteInfo2D`/`_recortarLoopsComCorte2D`).
      if (origemMundo && cfg.corteAtivo) {
        const corte = _corteInfo2D(cfg, origemMundo.origem.x, origemMundo.origem.z, y0, this.corteAlturaY);
        if (corte) niveis = _recortarLoopsComCorte2D(niveis, corte);
      }
      const resultado = { origem: origemMundo ? { x: origemMundo.origem.x, z: origemMundo.origem.z } : null, planoY: y0, niveis };
      this._corteCache = { malhaVersao: this._malhaVersao, planoY: y0, corteChave, resultado };
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

    // ---- barra de progresso flutuante (canvas/Sprite) -----------------------------------------------------------
    /** [22/09/2026] NOVO -- pedido verbatim: "Mesmo que saia do tela do AP e a varredura ainda estiver
     *  acontecendo, uma barra deve aparecer próxima ao AP." O painel de propriedades tem sua própria barra
     *  HTML (`.wf-bar`/`.wf-fill`, ver view3d-rede.js), mas ela SOME quando o painel é fechado/outro objeto é
     *  selecionado -- `this.scanning` continua rodando em segundo plano (`_passo`/rAF) independente de UI
     *  nenhuma estar aberta. Esta barra é o EQUIVALENTE em Sprite/canvas (MESMO padrão de
     *  `atualizarEtiqueta` acima -- billboard automático, ancorada no mundo, desenhada pela engine junto com
     *  o resto da cena, não por cima dela via DOM), então continua visível não importa o que esteja
     *  selecionado ou qual painel esteja aberto, contanto que o "Ver em 3D" esteja montado. Chamada 1x por
     *  quadro por `View3DRede._atualizarBarrasProgressoAP` (só itera APs com `.scanning === true` -- ver
     *  comentário lá) -- redesenha o canvas só quando o % mudou (`_progBarPct`), o resto do quadro só
     *  reposiciona o Sprite (barato).
     */
    atualizarBarraProgresso() {
      // [24/09/2026] MUDADO -- pedido verbatim: "Faça as duas barrinhas que aparecem próximas do AP
      // ficarem na mesma caixa, não em caixas separadas." Chamada direta (sem `av`) desenha só o bloco
      // desta instância -- mantido por compatibilidade; o caminho normal é `atualizarBarraProgressoCombinada`
      // (chamada 1x por AP em `View3DRede._atualizarBarrasProgressoAP`, já juntando normal + avançada).
      this.atualizarBarraProgressoCombinada(null);
    }

    /**
     * Barra de progresso combinada (Sprite/canvas único, billboard) -- UMA caixa MAIOR com o nome do AP no
     * topo e, dentro dela, 1 caixa INTERNA por varredura em andamento (esta instância = normal, `av` = a
     * `AccessPointAvancado` do MESMO AP), cada caixa interna com o SEU título e a SUA barrinha, uma embaixo
     * da outra (normal em cima, avançada embaixo). Com só 1 varredura rodando, só a caixa interna dela
     * aparece; sem nenhuma, a caixa inteira some.
     * [24/09/2026] MUDADO -- pedido verbatim: "As barrinhas [...] devem aparecer na mesma caixa próximo do
     * AP. Uma caixa maior que dize o nome do AP, uma caixa mais interna com o título da varredura normal e
     * a sua barrinha e uma outra caixa interna [...] com o título da varredura avançada e a sua barrinha
     * [...] o texto do título acaba ficando em cima da barrinha. O texto de título não deve ficar em cima
     * da barrinha. Cada um deve ter a sua caixa (um embaixo do outro)." Layout reescrito com o título de
     * cada bloco numa linha própria, acima da barrinha, com espaço garantido entre os dois (nada de texto e
     * barra dividindo a mesma linha como antes).
     * @param {AccessPoint|null} [av] a instância AVANÇADA do mesmo AP (`WifiSignal.paraAvancado`), ou `null`
     *        pra desenhar só o bloco desta instância (compatibilidade com `atualizarBarraProgresso()`).
     * @param {string} [rotuloAP] nome/rótulo do AP, mostrado no topo da caixa maior (ex.: labelID ou o nome
     *        padrão do tipo de objeto -- ver `View3DRede._atualizarBarrasProgressoAP`). Sem rótulo, usa "Access Point".
     */
    atualizarBarraProgressoCombinada(av, rotuloAP) {
      const pose = this._pose();
      const blocos = [];
      if (pose && this.scanning) blocos.push({ emoji: '📶', rotulo: 'Varredura normal', pct: Math.round(this.scanProgress), cor: '#3ecb6e' });
      if (pose && av && av !== this && av.scanning) blocos.push({ emoji: '🛰️', rotulo: 'Varredura avançada', pct: Math.round(av.scanProgress), cor: '#4f8cff' });
      if (!pose || !blocos.length) { this.removerBarraProgresso(); return; }
      const THREE = this.engine.THREE;
      const nomeAP = rotuloAP || 'Access Point';
      const assinatura = nomeAP + '|' + blocos.map((b) => b.pct + ':' + b.rotulo).join('|');
      if (this._progBarAssinatura !== assinatura || !this._progBarSprite) {
        const ESC = 2, W = 170 * ESC;
        const PAD = 7 * ESC, TIT_AP_H = 15 * ESC, GAP_TIT_AP = 8 * ESC;
        const BLOCO_GAP_TOPO = 5 * ESC, BLOCO_PAD = 5 * ESC, BLOCO_TIT_H = 13 * ESC, GAP_TIT_BARRA = 6 * ESC, BARRA_H = 6 * ESC, BLOCO_PAD_BAIXO = 6 * ESC;
        const BLOCO_H = BLOCO_PAD + BLOCO_TIT_H + GAP_TIT_BARRA + BARRA_H + BLOCO_PAD_BAIXO;
        const H = PAD + TIT_AP_H + GAP_TIT_AP + blocos.length * (BLOCO_GAP_TOPO + BLOCO_H) + PAD;
        if (!this._progBarCv || this._progBarCv.width !== W || this._progBarCv.height !== H) {
          if (!this._progBarCv) this._progBarCv = document.createElement('canvas');
          this._progBarCv.width = W; this._progBarCv.height = H;
        }
        const cv = this._progBarCv, ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        // caixa MAIOR (nome do AP) -- mesmo estilo visual de sempre (fundo escuro translúcido)
        const raioOut = 8 * ESC;
        ctx.fillStyle = 'rgba(15,20,28,0.9)'; ctx.strokeStyle = 'rgba(74,86,104,0.9)'; ctx.lineWidth = 2 * ESC;
        ctx.beginPath();
        ctx.moveTo(raioOut, 0); ctx.arcTo(W, 0, W, H, raioOut); ctx.arcTo(W, H, 0, H, raioOut);
        ctx.arcTo(0, H, 0, 0, raioOut); ctx.arcTo(0, 0, W, 0, raioOut); ctx.closePath();
        ctx.fill(); ctx.stroke();
        // nome do AP, truncado com "…" se não couber
        let nome = nomeAP;
        ctx.font = 'bold ' + (12 * ESC) + 'px system-ui, sans-serif'; ctx.fillStyle = '#e8ecf2'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const larguraMax = W - PAD * 2;
        while (nome.length > 1 && ctx.measureText('📡 ' + nome).width > larguraMax) nome = nome.slice(0, -1);
        if (nome !== nomeAP) nome = nome.replace(/\s+$/, '') + '…';
        ctx.fillText('📡 ' + nome, PAD, PAD + TIT_AP_H / 2);
        // traço fino separando o nome do AP dos blocos de varredura
        ctx.strokeStyle = 'rgba(74,86,104,0.6)'; ctx.lineWidth = 1 * ESC;
        ctx.beginPath(); ctx.moveTo(PAD, PAD + TIT_AP_H + GAP_TIT_AP / 2); ctx.lineTo(W - PAD, PAD + TIT_AP_H + GAP_TIT_AP / 2); ctx.stroke();
        // 1 caixa INTERNA por bloco (varredura normal/avançada), cada uma com SEU título numa linha e a
        // barrinha noutra (nunca sobrepostos) -- normal em cima, avançada logo abaixo.
        let y = PAD + TIT_AP_H + GAP_TIT_AP;
        blocos.forEach((b) => {
          y += BLOCO_GAP_TOPO;
          const raioIn = 5 * ESC, bx = PAD, bw = W - PAD * 2;
          ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1 * ESC;
          ctx.beginPath();
          ctx.moveTo(bx + raioIn, y); ctx.arcTo(bx + bw, y, bx + bw, y + BLOCO_H, raioIn); ctx.arcTo(bx + bw, y + BLOCO_H, bx, y + BLOCO_H, raioIn);
          ctx.arcTo(bx, y + BLOCO_H, bx, y, raioIn); ctx.arcTo(bx, y, bx + bw, y, raioIn); ctx.closePath();
          ctx.fill(); ctx.stroke();
          // título do bloco (linha própria, acima da barra)
          ctx.font = (11 * ESC) + 'px system-ui, sans-serif'; ctx.fillStyle = '#e8ecf2'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(b.emoji + ' ' + b.rotulo + ' ' + b.pct + '%', bx + BLOCO_PAD, y + BLOCO_PAD + BLOCO_TIT_H / 2);
          // barrinha (linha própria, abaixo do título, com folga garantida entre as duas)
          const barY = y + BLOCO_PAD + BLOCO_TIT_H + GAP_TIT_BARRA, barW = bw - BLOCO_PAD * 2;
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx + BLOCO_PAD, barY, barW, BARRA_H);
          ctx.fillStyle = b.cor; ctx.fillRect(bx + BLOCO_PAD, barY, barW * (b.pct / 100), BARRA_H);
          y += BLOCO_H;
        });
        if (!this._progBarSprite) {
          const tex = new THREE.CanvasTexture(cv);
          if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
          this._progBarTex = tex;
          const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
          const spr = new THREE.Sprite(mat);
          const alturaM = 0.22 * (H / (34 * 2)), largM = alturaM * (W / H);
          spr.scale.set(largM, alturaM, 1);
          spr.renderOrder = 21; spr.userData.wifi = true; spr.raycast = function () {};
          this._progBarSprite = spr;
          if (this.engine._group) this.engine._group.add(spr);
        } else {
          this._progBarTex.needsUpdate = true;
        }
        this._progBarAssinatura = assinatura; this._progBarAltura = H; this._progBarLargura = W;
      }
      // um pouco ACIMA da etiqueta (que fica em +0.18m -- ver atualizarEtiqueta) pra não sobrepor as duas
      this._progBarSprite.position.set(pose.origem.x, pose.origem.y + (this._progDy || 0.42), pose.origem.z);
      const cam = this.engine.camera3;
      if (cam) {
        const dist = cam.position.distanceTo(this._progBarSprite.position);
        const k = Math.max(0.15, Math.min(8, dist / 3));
        const H = this._progBarAltura || 68, W = this._progBarLargura || 280, alturaM = 0.22 * (H / 68), largM = alturaM * (W / H);
        this._progBarSprite.scale.set(largM * k, alturaM * k, 1);
      }
    }

    /** Remove a barra de progresso (varredura terminou/cancelada, ou o AP saiu de cena). */
    removerBarraProgresso() {
      const spr = this._progBarSprite; if (!spr) return;
      if (spr.parent) spr.parent.remove(spr);
      spr.material.map.dispose(); spr.material.dispose();
      this._progBarSprite = null; this._progBarPct = -1;
    }

    // [23/09/2026] REMOVIDO -- pedido verbatim: "Remova todos os botões e métodos implementados para a
    // varredura avançada." (atualizarBarraProgressoAvancado/removerBarraProgressoAvancado removidos.)
  }

  // ==========================================================================
  // [23/09/2026] REMOVIDO -- pedido verbatim: "Remova todos os botões e métodos implementados para a
  // varredura avançada." (classe SignalPropagationEngine inteira removida -- só resta a varredura normal.)

  // [23/09/2026] SIMPLIFICADO -- pedido verbatim: "Remova todos os botões e métodos implementados para a
  // varredura avançada." `DBM_POR_NIVEL`/`LIMIAR_DBM_NIVEL`/`_nivelPorDbm`/`_entrelacarXYZ` só eram usados
  // pelo motor avançado (removido); `DBM_MINIMO_VISIVEL` continua -- é o valor PADRÃO de `rssiThreshold`
  // ("Limiar (dBm)"), usado pela varredura normal.
  const DBM_MINIMO_VISIVEL = dbmDeIntensidade(NIVEIS[0].limiar);

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
  function remover(id) { const ap = instancias.get(id); if (ap) { ap.cancelScan(); ap.clear(); ap.removerEtiqueta(); ap.removerBarraProgresso(); instancias.delete(id); } }
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
    atenuacaoDoPick, interseccaoSegmento, calcularCorte2D, wattsParaDbm, ATENUACAO, FAIXAS, DENSIDADES, NIVEIS, METODOS2D, CSS,
    // [22/09/2026] NOVO -- otimização de malha (ver seção "3.5" acima, logo antes da classe AccessPoint).
    MODOS_MALHA, optimizeSignalMesh, gerarCascasReal, dbmDeIntensidade };
})(typeof window !== 'undefined' ? window : globalThis);
