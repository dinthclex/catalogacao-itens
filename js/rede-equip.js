/**
 * rede-equip.js — Equipamentos de rede de RACK 19": Switch 24p, Switch 48p,
 * Patch Panel 24p e Patch Panel 48p (catalogo do app de projeto de redes).
 *
 * [18/09/2026 UTC] RODADA 166. Abordagem escolhida: JavaScript Vanilla (ES6+),
 * classes de LOGICA pura (sem Three.js) + uma VIEW Three.js (r160+, InstancedMesh)
 * em `RedeEquipView3D`. Mesma arquitetura de `rack-modular.js` (UMD: funciona no
 * navegador — `window.RedeEquip` — e em Node, para teste).
 *
 * Unidades: TUDO em milimetros (mm) na logica e na view (o grupo 3D e escalado
 * por 0,001 pelo motor => metros). Origem local do equipamento: centro da
 * PLANTA (x=0, z=0), base em y=0; FRENTE = +z; x cresce para a direita de quem
 * olha de frente. Coordenadas do painel frontal: x em mm a partir do centro,
 * y em mm a partir da BASE do equipamento.
 *
 * ---------------------------------------------------------------------------
 * PADROES DE MERCADO usados (pesquisados):
 *  - Largura do painel frontal: 19" = 482,6 mm (EIA-310 / IEC 60297).
 *  - Distancia horizontal entre centros dos furos das orelhas: 465,1 mm
 *    (464,2-465,8 mm) => furos em x = +-232,55 mm.
 *  - 1U = 44,45 mm; furos a 6,35 / 22,225 / 38,1 mm da borda inferior de cada U
 *    (equipamentos de 1U usam o 1o e o 3o furo da U).
 *  - Abertura entre trilhos: 450,85 mm => corpo do equipamento ~440 mm.
 *  - Jack RJ-45 (8P8C): janela ~11,7 x 8,4 mm + chave (trava) ~4,6 x 2,6 mm.
 *  - Switch de acesso 1U: 24 ou 48 RJ-45 10/100/1000 + 4 SFP (uplink), duas
 *    fileiras (impares em cima, pares embaixo — padrao Cisco Catalyst),
 *    LED por porta, LED de sistema (SYST), botao MODE, console RJ-45 (cabo azul
 *    "rollover") e console mini-USB. Profundidade tipica 250 mm.
 *  - Patch panel Cat6: portas em GRUPOS DE 6 (24p = 4 grupos de 6; 48p = 2U com
 *    2 fileiras de 24), numeracao sob cada porta, barra guia de cabos traseira.
 * ---------------------------------------------------------------------------
 *
 * Interacao (pedido: "funcionamento por scripts, como a Porta"): cada equipamento
 * nasce com Script + Gatilho "Ao Clicar Duas Vezes" (ver `componentesPadrao`).
 * Estado em `obj.rede` ({ ligado, hostname, portas:{ [n]:{ rotulo, status } } });
 * cabos em `map.cabos` ([{ id, tipo, cor, de:{obj,porta}, para:{obj,porta}, rotulo }]).
 */
(function (raiz) {
  'use strict';

  // ==========================================================================
  // 1) CATALOGO / CONSTANTES
  // ==========================================================================
  const U_MM = 44.45;
  const REDE_CATALOGO = Object.freeze({
    U_MM,
    LARGURA_19_MM: 482.6,
    LARGURA_CORPO_MM: 440,
    DISTANCIA_FUROS_MM: 465.1,
    FUROS_ORELHA_NA_U_MM: Object.freeze([6.35, 38.1]),
    PLACA_ESP_MM: 2.5,
    RJ45: Object.freeze({ janelaW: 11.7, janelaH: 8.4, chaveW: 4.6, chaveH: 2.6 }),
    SFP: Object.freeze({ w: 13.8, h: 8.6 }),
    TIPOS: Object.freeze({
      switch24:     Object.freeze({ familia: 'switch',     rotulo: 'Switch de 24 portas',       rj45: 24, sfp: 4, alturaU: 1, profundidade: 250, modelo: 'SW-24G' }),
      switch48:     Object.freeze({ familia: 'switch',     rotulo: 'Switch de 48 portas',       rj45: 48, sfp: 4, alturaU: 1, profundidade: 250, modelo: 'SW-48G' }),
      patchpanel24: Object.freeze({ familia: 'patchpanel', rotulo: 'Patch panel de 24 portas',  rj45: 24, sfp: 0, alturaU: 1, profundidade: 140, corpo: 40, barra: 100, modelo: 'PP-24 Cat6' }),
      patchpanel48: Object.freeze({ familia: 'patchpanel', rotulo: 'Patch panel de 48 portas',  rj45: 48, sfp: 0, alturaU: 2, profundidade: 140, corpo: 40, barra: 100, modelo: 'PP-48 Cat6' }),
      // [18/09/2026 UTC] RODADA 167 -- infraestrutura PASSIVA (ver js/rede-passiva.js). `rackavel` (padrao
      // true) = tem orelhas 19" e encaixa por U; `largura`/`altura` (mm) so para itens fora de rack.
      dio12:        Object.freeze({ familia: 'dio',        rotulo: 'DIO de 12 fibras (1U)',    rj45: 0, sfp: 0, fibras: 12, alturaU: 1, profundidade: 200, modelo: 'DIO-12' }),
      dio24:        Object.freeze({ familia: 'dio',        rotulo: 'DIO de 24 fibras (1U)',    rj45: 0, sfp: 0, fibras: 24, alturaU: 1, profundidade: 200, modelo: 'DIO-24' }),
      dio48:        Object.freeze({ familia: 'dio',        rotulo: 'DIO de 48 fibras (2U)',    rj45: 0, sfp: 0, fibras: 48, alturaU: 2, profundidade: 200, modelo: 'DIO-48' }),
      guia_h1:      Object.freeze({ familia: 'guia',       rotulo: 'Guia de cabos horizontal 1U', rj45: 0, sfp: 0, alturaU: 1, profundidade: 60, protrusao: 60, dedos: 5, orientacao: 'horizontal', modelo: 'GC-1U' }),
      guia_h2:      Object.freeze({ familia: 'guia',       rotulo: 'Guia de cabos horizontal 2U', rj45: 0, sfp: 0, alturaU: 2, profundidade: 60, protrusao: 80, dedos: 6, orientacao: 'horizontal', modelo: 'GC-2U' }),
      guia_v:       Object.freeze({ familia: 'guia',       rotulo: 'Guia de cabos vertical',   rj45: 0, sfp: 0, alturaU: 0, altura: 1800, largura: 100, profundidade: 100, protrusao: 40, dedos: 9, orientacao: 'vertical', rackavel: false, modelo: 'GC-V' }),
      bandeja_fixa: Object.freeze({ familia: 'bandeja',    rotulo: 'Bandeja fixa 1U',          rj45: 0, sfp: 0, alturaU: 1, profundidade: 350, modelo: 'BJ-1U' }),
      bandeja_basc: Object.freeze({ familia: 'bandeja',    rotulo: 'Bandeja basculante 2U',    rj45: 0, sfp: 0, alturaU: 2, profundidade: 350, basculante: true, modelo: 'BJ-2U-B' }),
      pdu8:         Object.freeze({ familia: 'pdu',        rotulo: 'Régua de tomadas (PDU) 1U', rj45: 0, sfp: 0, alturaU: 1, profundidade: 50, tomadas: 8, modelo: 'PDU-8' }),
      frente_falsa: Object.freeze({ familia: 'frente',     rotulo: 'Frente falsa 1U',          rj45: 0, sfp: 0, alturaU: 1, profundidade: 10, modelo: 'FF-1U' }),
      kit_vent:     Object.freeze({ familia: 'ventilacao', rotulo: 'Kit de ventilação 1U',     rj45: 0, sfp: 0, alturaU: 1, profundidade: 100, ventoinhas: 2, modelo: 'KV-2' }),
      espelho1:     Object.freeze({ familia: 'tomada',     rotulo: 'Espelho de parede 1 módulo', rj45: 1, sfp: 0, alturaU: 0, largura: 86, altura: 86, profundidade: 30, rackavel: false, modulos: 1, modelo: 'EP-1' }),
      espelho2:     Object.freeze({ familia: 'tomada',     rotulo: 'Espelho de parede 2 módulos', rj45: 2, sfp: 0, alturaU: 0, largura: 86, altura: 86, profundidade: 30, rackavel: false, modulos: 2, modelo: 'EP-2' }),
      espelho4:     Object.freeze({ familia: 'tomada',     rotulo: 'Espelho de parede 4 módulos', rj45: 4, sfp: 0, alturaU: 0, largura: 102, altura: 102, profundidade: 30, rackavel: false, modulos: 4, modelo: 'EP-4' }),
      caixa_piso2:  Object.freeze({ familia: 'tomada',     rotulo: 'Caixa de piso 2 módulos',  rj45: 2, sfp: 0, alturaU: 0, largura: 110, altura: 60, profundidade: 110, rackavel: false, modulos: 2, piso: true, modelo: 'CP-2' }),
      caixa_piso4:  Object.freeze({ familia: 'tomada',     rotulo: 'Caixa de piso 4 módulos',  rj45: 4, sfp: 0, alturaU: 0, largura: 130, altura: 60, profundidade: 130, rackavel: false, modulos: 4, piso: true, modelo: 'CP-4' }),
      // [21/09/2026 UTC] NOVO -- Access Point Wi-Fi (semi-direcional, painel de parede/teto). Frente (+Z local) = lobo
      // principal de sinal; 1 porta RJ-45 (keystone) na face frontal-inferior, que recebe cabo estruturado/patch cord.
      // O motor de mapeamento de sinal fica em js/wifi-signal.js (`WifiSignal`).
      access_point: Object.freeze({ familia: 'ap', rotulo: 'Access Point Wi-Fi (AP)', rj45: 1, sfp: 0, alturaU: 0, largura: 200, altura: 200, profundidade: 40, rackavel: false, watts: 12, modelo: 'AP-WF6' }),
      abracadeira_velcro: Object.freeze({ familia: 'abracadeira', rotulo: 'Abraçadeira de velcro', rj45: 0, sfp: 0, alturaU: 0, largura: 30, altura: 30, profundidade: 14, rackavel: false, material: 'velcro', modelo: 'AB-V' }),
      abracadeira_nylon:  Object.freeze({ familia: 'abracadeira', rotulo: 'Abraçadeira de nylon',  rj45: 0, sfp: 0, alturaU: 0, largura: 30, altura: 30, profundidade: 14, rackavel: false, material: 'nylon', modelo: 'AB-N' }),
      // [19/09/2026 UTC] NOVO (RODADA 171) -- pedido verbatim do usuário (resumo): "novos objetos de
      // TI interativos... NO-BREAKS/UPS... STORAGE PARA RACK (NAS/SAN/DISK SHELF)... UNIDADES DE
      // DISCO (HD/SSD)". As dimensões/propriedades abaixo seguem exatamente o que foi pedido; a
      // classe RedeEquipView3D ganhou branches novos ('nobreak'/'storage') em `_construirPassivo()`
      // pra desenhar cada um (ver mais abaixo neste arquivo). Unidade de disco (HD/SSD) NÃO é um
      // "equipamento de rede rackável" — é um objeto pequeno independente, tratado por classes
      // próprias em js/rede-storage-energia.js (DriveUnit), não entra neste catálogo de rack.
      nobreak_torre:      Object.freeze({ familia: 'nobreak', rotulo: 'No-break torre (Interactive)', rj45: 0, sfp: 0, alturaU: 0, largura: 190, altura: 380, profundidade: 400, rackavel: false, tomadas: 4, potenciaVA: 1500, autonomiaMinutos: 15, tipoUps: 'Interactive', watts: 900, modelo: 'NB-T1500' }),
      nobreak_1u:         Object.freeze({ familia: 'nobreak', rotulo: 'No-break rack 1U (Interactive)', rj45: 0, sfp: 0, alturaU: 1, profundidade: 480, tomadas: 4, potenciaVA: 1000, autonomiaMinutos: 10, tipoUps: 'Interactive', watts: 700, modelo: 'NB-R1000' }),
      nobreak_2u:         Object.freeze({ familia: 'nobreak', rotulo: 'No-break rack 2U (Interactive)', rj45: 0, sfp: 0, alturaU: 2, profundidade: 480, tomadas: 6, potenciaVA: 2200, autonomiaMinutos: 15, tipoUps: 'Interactive', watts: 1600, modelo: 'NB-R2200' }),
      nobreak_corporativo: Object.freeze({ familia: 'nobreak', rotulo: 'No-break corporativo (Online Double Conversion)', rj45: 0, sfp: 0, alturaU: 18, profundidade: 800, tomadas: 8, potenciaVA: 20000, autonomiaMinutos: 8, tipoUps: 'Online Double Conversion', modulosBateriaExpandivel: true, watts: 16000, modelo: 'NB-C20K' }),
      storage_12: Object.freeze({ familia: 'storage', rotulo: 'Storage NAS/SAN 12 baias (2U)', rj45: 0, sfp: 0, alturaU: 2, profundidade: 850, baias: 12, baiaFormato: '3.5', watts: 220, modelo: 'ST-12B' }),
      storage_24: Object.freeze({ familia: 'storage', rotulo: 'Storage NAS/SAN 24 baias (2U)', rj45: 0, sfp: 0, alturaU: 2, profundidade: 850, baias: 24, baiaFormato: '2.5', watts: 260, modelo: 'ST-24B' }),
      storage_60: Object.freeze({ familia: 'storage', rotulo: 'Storage NAS/SAN 60 baias (4U)', rj45: 0, sfp: 0, alturaU: 4, profundidade: 1000, baias: 60, baiaFormato: '3.5', watts: 480, modelo: 'ST-60B' }),
    }),
    // Tipos de cabo (cor padrao de mercado por categoria/uso).
    // Chaves = catalogo de js/rede-passiva.js (`RedePassiva.CABOS`) + 'fibra' (legado = OM3) + 'console'.
    // [21/09/2026] pedido verbatim: "o 'azul' não deve estar presente neste texto, pois é possível
    // mudar a cor do cabo logo abaixo (acaba ficando incoerente)." `cor` aqui é só a cor PADRÃO de
    // fábrica de cada tipo (usada quando o cabo ainda não tem `cabo.cor` próprio -- ver o color
    // picker "Cor do cabo" em view3d-rede.js) -- o nome da cor foi removido de todos os `rotulo`
    // (não só o Cat6 citado), já que qualquer um deles pode ter a cor trocada pelo usuário.
    CABOS: Object.freeze({
      cat5e:     Object.freeze({ rotulo: 'Cat5e (U/UTP)',        cor: '#9aa3ad' }),
      cat6:      Object.freeze({ rotulo: 'Cat6 (U/UTP)',         cor: '#2f6fdb' }),
      cat6a:     Object.freeze({ rotulo: 'Cat6A (F/UTP)',        cor: '#d8362f' }),
      cat7:      Object.freeze({ rotulo: 'Cat7 (S/FTP)',         cor: '#22262b' }),
      fibra_smf: Object.freeze({ rotulo: 'Fibra SMF',            cor: '#f0c419' }),
      fibra_om3: Object.freeze({ rotulo: 'Fibra OM3',            cor: '#22d3ee' }),
      fibra_om4: Object.freeze({ rotulo: 'Fibra OM4',            cor: '#a855f7' }),
      fibra:     Object.freeze({ rotulo: 'Fibra (legado = OM3)', cor: '#22d3ee' }),
      console:   Object.freeze({ rotulo: 'Console',              cor: '#38bdf8' }),
      energia:   Object.freeze({ rotulo: 'Cabo de energia',      cor: '#111318' }),   // [19/09/2026 UTC] NOVO (RODADA 171) -- PDU/nobreak <-> equipamento
    }),
    STATUS: Object.freeze(['auto', 'active', 'idle', 'off']),
  });

  // Mapeamento status -> aparencia (3D e CSS). `active` pisca, `idle` verde fixo, `off` apagado.
  const LED_ESTILOS = Object.freeze({
    active: Object.freeze({ cor: 0x35ff6b, rotulo: 'Ativo (tráfego)',  css: 'rede-led active', pisca: true }),
    idle:   Object.freeze({ cor: 0x35ff6b, rotulo: 'Ocioso (link)',    css: 'rede-led idle',   pisca: false }),
    off:    Object.freeze({ cor: 0x0b120d, rotulo: 'Desligado',        css: 'rede-led off',    pisca: false }),
  });
  const LED_COR_DIM = 0x0f5a24;   // "apagao" do pisca do status active
  const LED_COR_AMBAR = 0xffb020;

  /** CSS para LEDs em HTML (menus/painel): `.rede-led.active` pisca com animacao. */
  const REDE_LED_CSS = [
    '.rede-led{display:inline-block;width:9px;height:6px;border-radius:2px;vertical-align:middle;margin-right:4px}',
    '.rede-led.off{background:#0b120d;box-shadow:inset 0 0 0 1px #24352a}',
    '.rede-led.idle{background:#35ff6b;box-shadow:0 0 5px #35ff6b}',
    '.rede-led.active{background:#35ff6b;box-shadow:0 0 5px #35ff6b;animation:rede-led-blink .35s steps(2,start) infinite}',
    '@keyframes rede-led-blink{50%{background:#0f5a24;box-shadow:none}}',
  ].join('');

  // ==========================================================================
  // 2) LAYOUT DAS PORTAS (especificacao geometrica) — por REPETICAO/LOOP
  // ==========================================================================
  /** Centros x das colunas com folga por GRUPO (e por BLOCO). */
  function _colunasX(nCols, pitch, x0, gapGrupo, gapBloco, grupo, blocoCols) {
    const xs = []; let x = x0;
    for (let c = 0; c < nCols; c++) {
      if (c > 0 && c % grupo === 0) x += (blocoCols && c % blocoCols === 0) ? gapBloco : gapGrupo;
      xs.push(x + pitch / 2); x += pitch;
    }
    return { xs, larguraTotal: x - x0, xFim: x };
  }

  function _especSwitch(tipo, T) {
    const n = T.rj45, cols = n / 2, H = T.alturaU * U_MM, grande = n === 48;
    const pitch = grande ? 13.2 : 16.4;
    const x0 = grande ? -150 : -112;
    // 24p: 2 blocos horizontais de 12 (fileira de cima = impares, de baixo = pares), grupos de 4 colunas.
    // 48p: 4 blocos de 12 (2 por fileira), 24 em cima e 24 embaixo, grupos de 4 colunas.
    const col = _colunasX(cols, pitch, x0, grande ? 2.0 : 4.0, grande ? 6.0 : 0, 4, grande ? 12 : 0);
    const frameW = Math.min(14.0, pitch - 0.9), frameH = 12.6;
    const yTop = 32.15, yBot = 12.3;
    const portas = [];
    for (let c = 0; c < cols; c++) {
      portas.push({ n: 2 * c + 1, tipo: 'rj45', x: col.xs[c], y: yTop, w: frameW, h: frameH, linha: 'sup', ledX: col.xs[c], ledY: yTop + frameH / 2 + 2.6 });
      portas.push({ n: 2 * c + 2, tipo: 'rj45', x: col.xs[c], y: yBot, w: frameW, h: frameH, linha: 'inf', ledX: col.xs[c], ledY: yBot - frameH / 2 - 2.6 });
    }
    // 4 SFP (uplink) em 2 colunas x 2 linhas: n+1 (sup-esq), n+2 (inf-esq), n+3 (sup-dir), n+4 (inf-dir).
    const sfpX = grande ? [192.5, 208.5] : [152, 170];
    const sfpY = [30.8, 13.6];
    for (let c = 0; c < 2; c++) for (let l = 0; l < 2; l++) {
      const y = sfpY[l];
      portas.push({ n: n + 1 + c * 2 + l, tipo: 'sfp', x: sfpX[c], y, w: REDE_CATALOGO.SFP.w + 1.8, h: REDE_CATALOGO.SFP.h + 1.8, linha: l === 0 ? 'sup' : 'inf',
        ledX: sfpX[c], ledY: l === 0 ? y + (REDE_CATALOGO.SFP.h + 1.8) / 2 + 2.2 : y - (REDE_CATALOGO.SFP.h + 1.8) / 2 - 2.2 });
    }
    // Cluster da esquerda: LEDs de sistema, botao MODE, console RJ-45 (azul) e console mini-USB.
    const ex = grande
      ? { sys: [['syst', -213, 35, 'SYST'], ['rps', -213, 26, 'RPS'], ['stat', -213, 17, 'STAT'], ['duplx', -198, 35, 'DUPLX'], ['speed', -198, 26, 'SPEED']],
          mode: { x: -183, y: 22, r: 3.2 }, console: { x: -166, y: 31, w: 12.6, h: 12.6 }, usb: { x: -166, y: 13, w: 8, h: 3.6 } }
      : { sys: [['syst', -213, 35, 'SYST'], ['rps', -213, 26, 'RPS'], ['stat', -213, 17, 'STAT'], ['duplx', -190, 35, 'DUPLX'], ['speed', -190, 26, 'SPEED']],
          mode: { x: -160, y: 22, r: 3.6 }, console: { x: -140, y: 31, w: 14, h: 12.6 }, usb: { x: -140, y: 13, w: 8, h: 3.6 } };
    return { portas, layout: { pitch, colunas: cols, xIni: x0, xFim: col.xFim, frameW, frameH, yTop, yBot }, extras: ex };
  }

  function _especPatch(tipo, T) {
    const n = T.rj45, H = T.alturaU * U_MM, linhas = T.alturaU === 2 ? 2 : 1, porLinha = n / linhas;
    const pitch = 16.0, gapGrupo = 8.0;                      // GRUPOS DE 6 portas
    const col = _colunasX(porLinha, pitch, -(porLinha * pitch + (porLinha / 6 - 1) * gapGrupo) / 2, gapGrupo, gapGrupo, 6, 0);
    const yLinhas = linhas === 2 ? [68.5, 31.5] : [26];
    const portas = [];
    for (let l = 0; l < linhas; l++) for (let c = 0; c < porLinha; c++) {
      portas.push({ n: l * porLinha + c + 1, tipo: 'keystone', x: col.xs[c], y: yLinhas[l], w: 14.6, h: 16.5, linha: l === 0 ? 'sup' : 'inf', grupo: Math.floor(c / 6) + 1 });
    }
    return { portas, layout: { pitch, gapGrupo, colunas: porLinha, linhas, yLinhas, xIni: -(porLinha * pitch + (porLinha / 6 - 1) * gapGrupo) / 2, xFim: col.xFim, jackW: 14.6, jackH: 16.5, grupos: porLinha / 6 }, extras: {} };
  }

  /** DIO: matriz de portas ÓPTICAS (12 colunas; 1U = 1-2 linhas, 2U = 4 linhas). */
  function _especDio(T) {
    const n = T.fibras, cols = 12, linhas = n / cols, H = T.alturaU * U_MM, pitch = 24, dy = 14;
    const x0 = -(cols * pitch) / 2, yTopo = H / 2 + (linhas - 1) * dy / 2;
    const portas = [];
    for (let l = 0; l < linhas; l++) for (let c = 0; c < cols; c++) portas.push({ n: l * cols + c + 1, tipo: 'lc', x: x0 + pitch * (c + 0.5), y: yTopo - l * dy, w: 12.5, h: 9, linha: l === 0 ? 'sup' : 'inf' });
    return { portas, layout: { colunas: cols, linhas, pitch, dy }, extras: {} };
  }
  /** Guia de cabos: ZONAS DE PASSAGEM (vãos entre dedos) — pontos (mm) por onde a spline dos cabos é forçada. */
  function _especGuia(T) {
    const H = (T.altura || T.alturaU * U_MM), n = T.dedos + 1, zonas = [], W = T.largura ? T.largura : 440;
    for (let i = 0; i < n; i++) {
      if (T.orientacao === 'vertical') zonas.push({ x: 0, y: (i + 0.5) * (H / n), z: T.protrusao / 2 });
      else zonas.push({ x: -W / 2 + (i + 0.5) * (W / n), y: H / 2, z: T.protrusao / 2 });
    }
    return { portas: [], layout: { dedos: T.dedos, orientacao: T.orientacao }, extras: { zonas } };
  }
  /** Espelho/caixa de piso: 1, 2 ou 4 módulos keystone (RJ-45). */
  function _especTomada(T) {
    const k = T.modulos, H = T.altura, W = T.largura, jw = 14.6, jh = 16.5, portas = [];
    const pos = k === 1 ? [[0, 0]] : k === 2 ? [[-12, 0], [12, 0]] : [[-12, 11], [12, 11], [-12, -11], [12, -11]];
    pos.forEach((q, i) => portas.push({ n: i + 1, tipo: 'keystone', x: q[0], y: H / 2 + q[1], w: jw, h: jh, linha: 'sup', grupo: 1 }));
    return { portas, layout: { modulos: k }, extras: {} };
  }
  /** Access Point: 1 porta RJ-45 (keystone) na parte inferior da face frontal. */
  function _especAP(T) {
    return { portas: [{ n: 1, tipo: 'keystone', x: 0, y: 34, w: 14.6, h: 16.5, linha: 'sup', grupo: 1 }], layout: { modulos: 1 }, extras: { ap: true } };
  }
  function _especSimples() { return { portas: [], layout: {}, extras: {} }; }
  /** No-break/UPS: as "portas" são as TOMADAS de saída (tipo 'tomada_energia'), em 1 ou 2 fileiras
   *  na frente, espelhando o layout já usado pelo PDU (`x0=-170, passo=340/(n-1)`) — nada de novo
   *  reinventado, só reaproveitado pro nobreak também ter saídas clicáveis/conectáveis. */
  function _especNobreak(T) {
    const n = T.tomadas || 0, portas = [];
    if (n > 0) {
      const H = T.altura || T.alturaU * U_MM, x0 = -170, passo = n > 1 ? 340 / (n - 1) : 0;
      for (let i = 0; i < n; i++) portas.push({ n: i + 1, tipo: 'tomada_energia', x: x0 + i * passo, y: H / 2, w: 18, h: 18, linha: 'meio', grupo: 1 });
    }
    return { portas, layout: {}, extras: { display: true } };
  }
  /** Storage (NAS/SAN/Disk Shelf): as "portas" são as BAIAS (drive bays) do painel frontal, tipo
   *  'baia' — dispostas em grade (linhas de até 12 colunas), do mesmo jeito que outros equipamentos
   *  descrevem sua frente como uma lista de retângulos posicionáveis. `slotIndex` = `n - 1`. */
  function _especStorage(T) {
    const H = T.altura || T.alturaU * U_MM, nb = T.baias || 0, cols = Math.min(nb, 12) || 1;
    const linhas = Math.ceil(nb / cols), bw = 320 / cols, bh = (H - 12) / linhas, portas = [];
    for (let i = 0; i < nb; i++) {
      const col = i % cols, lin = Math.floor(i / cols);
      portas.push({ n: i + 1, tipo: 'baia', x: -160 + bw * (col + 0.5), y: H - 6 - bh * (lin + 0.5), w: bw - 3, h: bh - 3, linha: 'baia' + lin, grupo: lin + 1, slotIndex: i });
    }
    return { portas, layout: { cols, linhas }, extras: { baiaFormato: T.baiaFormato || '3.5' } };
  }

  const _specCache = {};
  /** Especificacao geometrica completa de um tipo ('switch24'|...). */
  function especificar(tipo) {
    if (_specCache[tipo]) return _specCache[tipo];
    const T = REDE_CATALOGO.TIPOS[tipo];
    if (!T) return null;
    const base = T.familia === 'switch' ? _especSwitch(tipo, T) : T.familia === 'patchpanel' ? _especPatch(tipo, T)
      : T.familia === 'dio' ? _especDio(T) : T.familia === 'guia' ? _especGuia(T) : T.familia === 'tomada' ? _especTomada(T) : T.familia === 'ap' ? _especAP(T)
      : T.familia === 'nobreak' ? _especNobreak(T) : T.familia === 'storage' ? _especStorage(T) : _especSimples();
    const rackavel = T.rackavel !== false;
    const spec = Object.assign({
      tipo, familia: T.familia, rotulo: T.rotulo, modelo: T.modelo,
      alturaU: T.alturaU, alturaMm: T.altura || T.alturaU * U_MM, rackavel,
      largura: T.largura || REDE_CATALOGO.LARGURA_19_MM, larguraCorpo: T.largura || REDE_CATALOGO.LARGURA_CORPO_MM,
      profundidade: T.profundidade, corpo: T.corpo || 0, barra: T.barra || 0,
      placaEsp: rackavel ? REDE_CATALOGO.PLACA_ESP_MM : 3,
      protrusao: T.protrusao || 0, dedos: T.dedos || 0, basculante: !!T.basculante, tomadas: T.tomadas || 0, ventoinhas: T.ventoinhas || 0, material: T.material || '',
      nRJ45: T.rj45, nSFP: T.sfp, nFibras: T.fibras || 0, nPortas: T.rj45 + T.sfp + (T.fibras || 0),
      furosOrelha: [],
      // [19/09/2026 UTC] NOVO (RODADA 171) -- campos das familias 'nobreak'/'storage'.
      watts: T.watts || 0, potenciaVA: T.potenciaVA || 0, autonomiaMinutos: T.autonomiaMinutos || 0,
      tipoUps: T.tipoUps || '', modulosBateriaExpandivel: !!T.modulosBateriaExpandivel,
      baias: T.baias || 0, baiaFormato: T.baiaFormato || '',
    }, base);
    // Furos das orelhas: em x = +-232,55 mm, nos furos 1 e 3 de CADA U (6,35 e 38,1 mm). So itens rackaveis.
    for (let u = 0; rackavel && u < T.alturaU; u++) REDE_CATALOGO.FUROS_ORELHA_NA_U_MM.forEach((off) => {
      [-1, 1].forEach((sx) => spec.furosOrelha.push({ x: sx * REDE_CATALOGO.DISTANCIA_FUROS_MM / 2, y: u * U_MM + off, w: 7.0, h: 6.6 }));
    });
    spec.portaPorN = {}; spec.portas.forEach((p) => { spec.portaPorN[p.n] = p; });
    spec.textos = _textosDoPainel(spec);
    _specCache[tipo] = Object.freeze(spec);
    return _specCache[tipo];
  }

  /** Serigrafia do painel (numeracao, marcas de grupo, rotulos fixos). */
  function _textosDoPainel(spec) {
    const t = [];
    const L = spec.layout;
    if (spec.familia === 'switch') {
      spec.portas.forEach((p) => {
        if (p.tipo === 'rj45') t.push({ txt: String(p.n), x: p.x, y: p.linha === 'sup' ? p.y - p.h / 2 - 1.9 : p.y + p.h / 2 + 1.9, s: 2.5 });
        else t.push({ txt: String(p.n), x: p.x, y: p.linha === 'sup' ? p.y - p.h / 2 - 1.9 : p.y + p.h / 2 + 1.9, s: 2.4 });
      });
      spec.extras.sys.forEach(([id, x, y, nome]) => t.push({ txt: nome, x: x + 3, y, s: 1.9, align: 'left' }));
      t.push({ txt: 'MODE', x: spec.extras.mode.x, y: spec.extras.mode.y - spec.extras.mode.r - 2, s: 1.9 });
      t.push({ txt: 'CONSOLE', x: spec.extras.console.x, y: spec.extras.console.y - spec.extras.console.h / 2 - 2, s: 1.9 });
      t.push({ txt: 'USB', x: spec.extras.usb.x, y: spec.extras.usb.y - 3.6, s: 1.7 });
      t.push({ txt: 'SFP', x: (spec.portaPorN[spec.nRJ45 + 1].x + spec.portaPorN[spec.nRJ45 + 3].x) / 2, y: 22.2, s: 2.4 });
      t.push({ txt: spec.modelo + '  ' + spec.nRJ45 + 'x 10/100/1000 + 4x SFP', x: -214, y: 41.6, s: 2.1, align: 'left' });
    } else if (spec.familia === 'dio') {
      spec.portas.forEach((p) => t.push({ txt: String(p.n), x: p.x, y: p.y - p.h / 2 - 2.2, s: 2.6 }));
      t.push({ txt: spec.modelo + ' — ' + spec.nFibras + ' fibras (LC duplex)', x: -214, y: spec.alturaMm - 3.2, s: 2.2, align: 'left' });
    } else if (spec.familia !== 'patchpanel') {
      if (spec.rackavel && spec.familia !== 'abracadeira') t.push({ txt: spec.modelo, x: -214, y: spec.alturaMm - 3.2, s: 2.2, align: 'left' });
    } else {
      spec.portas.forEach((p) => {
        t.push({ txt: String(p.n), x: p.x, y: p.y - p.h / 2 - 2.4, s: 3.1 });
      });
      // Marcas de grupo (linha fina no vao entre grupos) e faixa "1-6".
      const linhasY = L.yLinhas;
      linhasY.forEach((yc) => {
        for (let g = 0; g < L.grupos; g++) {
          const primeira = spec.portas.find((p) => Math.abs(p.y - yc) < 0.01 && p.grupo === g + 1);
          const ultima = spec.portas.filter((p) => Math.abs(p.y - yc) < 0.01 && p.grupo === g + 1).pop();
          t.push({ linha: true, x1: primeira.x - 7.3, x2: ultima.x + 7.3, y: yc + 8.25 + 1.4 });
        }
      });
      t.push({ txt: spec.modelo + ' — ' + spec.nRJ45 + ' portas — 1/2 U'.replace('1/2', String(spec.alturaU)), x: -214, y: spec.alturaMm - 3.2, s: 2.2, align: 'left' });
    }
    return t;
  }

  // ==========================================================================
  // 3) CLASSES DE LOGICA (sem Three.js): estado das portas, LEDs, snap no rack
  // ==========================================================================
  class EquipamentoRede {
    /** @param {string} tipo 'switch24'|'switch48'|'patchpanel24'|'patchpanel48'
     *  @param {object} [opt] { ligado, rotulos:{n:txt}, status:{n:'active'|'idle'|'off'|'auto'} } */
    constructor(tipo, opt) {
      opt = opt || {};
      this.spec = especificar(tipo);
      if (!this.spec) throw new RangeError('Tipo de equipamento de rede desconhecido: ' + tipo);
      this.tipo = tipo;
      this.heightInU = this.spec.alturaU;               // 1 ou 2 (contrato pedido)
      this.ligado = opt.ligado !== false;
      this.portas = {};
      this.spec.portas.forEach((p) => { this.portas[p.n] = { n: p.n, tipo: p.tipo, rotulo: (opt.rotulos && opt.rotulos[p.n]) || '', status: (opt.status && opt.status[p.n]) || 'auto' }; });
    }
    /** Deslocamento (mm) do PONTO DE ENCAIXE (canto U da frente dos trilhos: x=0 centralizado,
     *  base da U, plano dos furos) ate a ORIGEM do equipamento (centro da planta, base): usado
     *  pelo snap para travar X (=0), alinhar Y na U inteira e centralizar em Z no plano do rack. */
    getSnapOffset() {
      return { x: 0, y: 0, z: this.spec.placaEsp - this.spec.profundidade / 2, alturaMm: this.spec.alturaMm, alturaU: this.heightInU };
    }
    /** Snap magnetico: dado o Y (mm, no eixo do rack, base do rack = 0) onde o usuario soltou o
     *  equipamento, devolve a U INTEIRA mais proxima (1..us), ja travando x=0. `rack` = RackModular. */
    snapNoRack(rack, yMm, ignorarId) {
      const s = rack.snap(yMm, this.heightInU, ignorarId);
      if (!s.ok) return s;
      const o = this.getSnapOffset();
      return { ok: true, uInicial: s.uInicial, x: 0, y: s.y + o.y, z: rack.planoMontagem.frontalZ + o.z, alturaU: this.heightInU };
    }
    /** Status EFETIVO por porta: 'active' | 'idle' | 'off' (LED). Patch panel nao tem LED. */
    statusPorta(n) {
      if (this.spec.familia !== 'switch' || !this.ligado) return 'off';
      const st = this.portas[n] && this.portas[n].status;
      return (st === 'active' || st === 'idle' || st === 'off') ? st : 'off';
    }
    setStatus(n, status) { if (this.portas[n] && REDE_CATALOGO.STATUS.includes(status)) this.portas[n].status = status; }
    setRotulo(n, txt) { if (this.portas[n]) this.portas[n].rotulo = String(txt || ''); }
    /** Posicao (mm, sistema local do equipamento) da FRENTE de uma porta. */
    posPorta(n) { return portaLocal(this.tipo, n); }
  }
  class Switch24 extends EquipamentoRede { constructor(o) { super('switch24', o); } }
  class Switch48 extends EquipamentoRede { constructor(o) { super('switch48', o); } }
  class PatchPanel24 extends EquipamentoRede { constructor(o) { super('patchpanel24', o); } }
  class PatchPanel48 extends EquipamentoRede { constructor(o) { super('patchpanel48', o); } }
  const CLASSES = { switch24: Switch24, switch48: Switch48, patchpanel24: PatchPanel24, patchpanel48: PatchPanel48 };
  /** Fabrica um equipamento (RODADA 167: qualquer tipo do catalogo — DIO, guia, PDU... usam a classe base). */
  function criar(tipo, opt) { const C = CLASSES[tipo]; if (C) return new C(opt); if (!REDE_CATALOGO.TIPOS[tipo]) throw new RangeError('Tipo desconhecido: ' + tipo); return new EquipamentoRede(tipo, opt); }

  /** Posicao local (mm) da frente da porta `n`: x/y do painel, z = plano da frente (+prof/2). */
  function portaLocal(tipo, n) {
    const s = especificar(tipo); const p = s && s.portaPorN[n];
    if (!p) return null;
    return { x: p.x, y: p.y, z: s.profundidade / 2 };
  }

  // ==========================================================================
  // 4) DADOS NO MAPA (objeto + cabos)
  // ==========================================================================
  function ehEquipRede(tipo) { return !!(tipo && REDE_CATALOGO.TIPOS[tipo]); }
  function ehRackavel(tipo) { const t = REDE_CATALOGO.TIPOS[tipo]; return !!t && t.rackavel !== false; }
  function ehSwitch(tipo) { return !!(REDE_CATALOGO.TIPOS[tipo] && REDE_CATALOGO.TIPOS[tipo].familia === 'switch'); }
  // [19/09/2026 UTC] NOVO (RODADA 171).
  function ehAP(tipo) { return !!(REDE_CATALOGO.TIPOS[tipo] && REDE_CATALOGO.TIPOS[tipo].familia === 'ap'); }
  function ehNobreak(tipo) { return !!(REDE_CATALOGO.TIPOS[tipo] && REDE_CATALOGO.TIPOS[tipo].familia === 'nobreak'); }
  function ehStorage(tipo) { return !!(REDE_CATALOGO.TIPOS[tipo] && REDE_CATALOGO.TIPOS[tipo].familia === 'storage'); }

  /** Garante `obj.rede` ({ligado, hostname, portas}) — idempotente. */
  function garantirRede(obj) {
    if (!obj) return null;
    if (!obj.rede || typeof obj.rede !== 'object') obj.rede = {};
    if (obj.rede.ligado === undefined) obj.rede.ligado = ehSwitch(obj.tipo) || ehAP(obj.tipo);
    if (typeof obj.rede.hostname !== 'string') obj.rede.hostname = '';
    if (!obj.rede.portas || typeof obj.rede.portas !== 'object') obj.rede.portas = {};
    const fam = REDE_CATALOGO.TIPOS[obj.tipo] && REDE_CATALOGO.TIPOS[obj.tipo].familia;
    if (fam === 'patchpanel' || fam === 'tomada' || fam === 'ap') { if (!obj.rede.categoria) obj.rede.categoria = 'cat6'; if (!obj.rede.blindagem) obj.rede.blindagem = 'U/UTP'; }
    if (fam === 'dio') { if (!obj.rede.conector) obj.rede.conector = 'LC'; if (!obj.rede.fibra) obj.rede.fibra = 'SMF'; }
    // [19/09/2026 UTC] NOVO (RODADA 174) -- `obj.rede.baias` = { [slotIndex]: {tecnologia,
    // capacidadeTB, status} } -- estado SERIALIZÁVEL (plain object, salvo no mapa) que espelha o
    // que uma instância de `RedeStorageEnergia.StorageDevice`/`DriveUnit` representaria em
    // memória; ver `baiaInserir`/`baiaRemover`/`storageResumo` abaixo, que são a "ponte" entre esse
    // estado salvo e as classes de lógica (usadas só pra centralizar a fórmula de capacidade —
    // nada aqui depende de rede-storage-energia.js estar carregado, é opcional).
    if (fam === 'storage' && (!obj.rede.baias || typeof obj.rede.baias !== 'object')) obj.rede.baias = {};
    return obj.rede;
  }

  // ==========================================================================
  // [19/09/2026 UTC] NOVO (RODADA 174) -- Storage (baias) e No-break (carga/autonomia): "ponte"
  // entre o estado salvo no mapa (`obj.rede.baias`, plain object) e as classes de lógica de
  // js/rede-storage-energia.js (StorageDevice/DriveUnit/UPSDevice), quando disponíveis. Tudo aqui
  // funciona MESMO SEM aquele arquivo carregado (fórmulas replicadas de forma simples), mas usa as
  // classes quando `window.RedeStorageEnergia` existe, pra não duplicar a lógica de autonomia.
  // ==========================================================================
  const WATTS_PADRAO_DISCO = { HDD_SATA: 7, HDD_SAS: 9, SSD_SATA: 3, SSD_NVMe: 6 };

  /** Insere um disco (config simples: tecnologia/capacidadeTB/status) no slot `slotIndex` de um
   *  objeto Storage do mapa. Retorna { ok, erro? }. */
  function baiaInserir(obj, slotIndex, opt) {
    const sp = especificar(obj.tipo); if (!sp || sp.familia !== 'storage') return { ok: false, erro: 'Não é um Storage.' };
    if (!sp.portaPorN[slotIndex + 1]) return { ok: false, erro: 'Baia inexistente.' };
    const r = garantirRede(obj);
    if (r.baias[slotIndex]) return { ok: false, erro: 'Baia ' + (slotIndex + 1) + ' já está ocupada.' };
    opt = opt || {};
    const tecnologia = opt.tecnologia && WATTS_PADRAO_DISCO[opt.tecnologia] ? opt.tecnologia : 'HDD_SATA';
    r.baias[slotIndex] = { tecnologia, capacidadeTB: Number(opt.capacidadeTB) || 4, status: opt.status || 'healthy' };
    return { ok: true };
  }
  /** Remove o disco do slot `slotIndex`. Retorna { ok, erro?, drive? }.
   *  Observação: nenhuma das duas funções chama `notificarMudanca`/`DB.saveMap` -- quem chama (ver
   *  view3d-rede.js) já salva o mapa e reconstrói a malha 3D logo em seguida. */
  function baiaRemover(obj, slotIndex) {
    const sp = especificar(obj.tipo); if (!sp || sp.familia !== 'storage') return { ok: false, erro: 'Não é um Storage.' };
    const r = garantirRede(obj); const drive = r.baias[slotIndex];
    if (!drive) return { ok: false, erro: 'Baia ' + (slotIndex + 1) + ' já está vazia.' };
    delete r.baias[slotIndex];
    return { ok: true, drive };
  }
  /** Resumo do storage: baias ocupadas/livres e capacidade total (TB) -- soma direta de
   *  `capacidadeTB`, mesma fórmula de `StorageDevice._recalcularCapacidade()`. */
  function storageResumo(obj) {
    const sp = especificar(obj.tipo); const r = garantirRede(obj);
    const nBaias = sp.baias || 0, baias = r.baias || {};
    let ocupados = 0, totalCapacity = 0, watts = sp.watts || 0;
    for (let i = 0; i < nBaias; i++) { const d = baias[i]; if (d) { ocupados++; totalCapacity += d.capacidadeTB || 0; if (d.status !== 'failed') watts += WATTS_PADRAO_DISCO[d.tecnologia] || 6; } }
    return { nBaias, ocupados, livres: nBaias - ocupados, totalCapacity, watts };
  }
  /** Carga (W) + autonomia (min) de um No-break: soma `storageResumo(x).watts` de todo Storage
   *  ligado a ele por um cabo tipo 'energia' (nas duas pontas), mais o watts do próprio chassi do
   *  no-break (`sp.watts`, consumo interno/perdas). Usa `RedeStorageEnergia.UPSDevice` quando
   *  disponível (fórmula idêntica replicada aqui como fallback caso o arquivo não esteja
   *  carregado). */
  function upsCarga(map, obj) {
    const sp = especificar(obj.tipo); if (!sp || sp.familia !== 'nobreak') return null;
    // [19/09/2026 UTC] NOVO (RODADA 174) -- modelo simplificado de "o que este No-break alimenta":
    // todo Storage/switch INSTALADO NO MESMO RACK (`obj.rackId`), já que as "portas" de um Storage
    // são as baias de disco (não faz sentido modelar um cabo de energia ligado numa baia). Fora de
    // rack (no-break torre), soma só o consumo do próprio chassi.
    const dispositivos = obj.rackId ? (map.objects || []).filter((o) => o.rackId === obj.rackId && o.id !== obj.id && ehEquipRede(o.tipo)) : [];
    let totalWatts = sp.watts || 0;
    dispositivos.forEach((o) => {
      const os = especificar(o.tipo); if (!os) return;
      if (os.familia === 'storage') totalWatts += storageResumo(o).watts;
      else if (os.familia !== 'nobreak' && os.watts) totalWatts += os.watts;
    });
    const UPS = raiz.RedeStorageEnergia;
    if (UPS && UPS.UPSDevice) {
      try {
        const u = new UPS.UPSDevice({ potenciaVA: sp.potenciaVA, autonomiaMinutos: sp.autonomiaMinutos, tipoUps: sp.tipoUps });
        return Object.assign({ nDispositivos: dispositivos.length }, u.calculateLoad(totalWatts));
      } catch (e) { /* cai no fallback abaixo */ }
    }
    // Fallback (mesma fórmula de UPSDevice.calculateLoad, replicada, caso o arquivo de classes não
    // esteja carregado por algum motivo).
    const pMax = (sp.potenciaVA || 0) * 0.9;
    let autonomia = totalWatts <= 0 ? (sp.autonomiaMinutos || 0) * 2 : (sp.autonomiaMinutos || 0) * (pMax / totalWatts);
    autonomia = Math.max(0, Math.min(autonomia, (sp.autonomiaMinutos || 0) * 2));
    return { nDispositivos: dispositivos.length, cargaWatts: totalWatts, cargaPercentual: pMax > 0 ? Math.round((totalWatts / pMax) * 1000) / 10 : 0, autonomiaMinutos: Math.round(autonomia * 10) / 10, sobrecarregado: totalWatts > pMax };
  }

  /** Patch de campos do objeto (2D/3D): forma retangular real (m). */
  function patchParaObjeto(tipo) {
    const s = especificar(tipo);
    return { forma: 'retangulo', largura: s.largura / 1000, profundidade: s.profundidade / 1000, altura: s.alturaMm / 1000 };
  }

  function _cabos(map) { if (!map) return []; if (!Array.isArray(map.cabos)) map.cabos = []; return map.cabos; }
  function cabosDoObjeto(map, id) { return _cabos(map).filter((c) => c.de.obj === id || c.para.obj === id); }
  // [19/09/2026 UTC] AMPLIADO (RODADA 201) -- pedido verbatim do usuario: a FRENTE e a TRASEIRA de uma
  // porta de patch panel/tomada agora sao 2 pontos fisicos de ligacao INDEPENDENTES (patch cord na
  // frente pra um switch, cabo horizontal na traseira pra uma tomada -- os 2 ao mesmo tempo na MESMA
  // porta e exatamente o uso real de um patch panel). `lado` ('frente'|'tras') opcional -- quando
  // informado, so conta cabo NAQUELE lado especifico; omitido, mantem o comportamento antigo (bate em
  // QUALQUER lado -- cabos antigos, de antes desta rodada, nao tem `.lado` gravado, entao so respondem
  // a chamadas sem `lado`, que e exatamente o que os callers antigos ja faziam).
  function caboDaPorta(map, id, n, lado) {
    return _cabos(map).find((c) => {
      const deBate = c.de.obj === id && c.de.porta === n && (lado == null || (c.de.lado || 'frente') === lado);
      const paraBate = c.para.obj === id && c.para.porta === n && (lado == null || (c.para.lado || 'frente') === lado);
      return deBate || paraBate;
    }) || null;
  }
  function _achar(map, id) { return (map && map.objects || []).find((o) => o.id === id) || null; }
  function outroLado(cabo, id, n) { return (cabo.de.obj === id && cabo.de.porta === n) ? cabo.para : cabo.de; }

  /** Status EFETIVO ('active'|'idle'|'off') de uma porta considerando energia, forcamento manual e cabo. */
  function statusEfetivo(map, obj, n) {
    if (!obj || !ehSwitch(obj.tipo)) return 'off';
    const r = garantirRede(obj);
    if (!r.ligado) return 'off';
    const forcado = r.portas[n] && r.portas[n].status;
    if (forcado === 'active' || forcado === 'idle' || forcado === 'off') return forcado;
    const cabo = caboDaPorta(map, obj.id, n);
    if (!cabo) return 'off';
    const par = outroLado(cabo, obj.id, n);
    const outro = _achar(map, par.obj);
    if (!outro) return 'off';
    if (ehSwitch(outro.tipo)) return garantirRede(outro).ligado ? 'active' : 'off';   // enlace so sobe com o outro lado ligado
    return 'active';                                                               // patch panel/dispositivo: assume o outro extremo ativo
  }
  /** Array (indice n-1) com o status efetivo de TODAS as portas do switch. */
  function estadosDasPortas(map, obj) {
    const s = especificar(obj.tipo); const out = new Array(s.nPortas);
    for (let n = 1; n <= s.nPortas; n++) out[n - 1] = statusEfetivo(map, obj, n);
    return out;
  }

  function _RP() { return raiz.RedePassiva || null; }

  // ==========================================================================
  // 4-B) DECAPAGEM VIRTUAL / CRIMPAGEM TRASEIRA (8 VIAS, T568A/T568B)
  // ==========================================================================
  // [19/09/2026 UTC] NOVO (RODADA 200) -- pedido verbatim do usuario (prompt de
  // "Engenheiro de Software Principal"): decompor o cabo de rede de cobre nos 8
  // fios/pares individuais que se ligam fisicamente ao bloco IDC (110 punch
  // down)/RJ45 femea na TRASEIRA de um patch panel ou tomada (keystone), e
  // classificar a montagem como "Straight-Through" ou "Crossover" comparando o
  // padrao de pinagem usado em cada ponta -- exatamente como um instalador real
  // faria com um testador de cabo. Mantido em `rede-equip.js` (nao em
  // `rede-passiva.js`) porque a geometria dos 8 fios depende de `portaLocal`
  // (coordenadas do PAINEL do equipamento), que ja mora aqui.
  //
  // Ordem dos pares nos 8 pinos do conector RJ45 (T568A e T568B -- EIA/TIA-568):
  //  T568A: 1 Branco/Verde 2 Verde 3 Branco/Laranja 4 Azul 5 Branco/Azul
  //         6 Laranja 7 Branco/Marrom 8 Marrom
  //  T568B: 1 Branco/Laranja 2 Laranja 3 Branco/Verde 4 Azul 5 Branco/Azul
  //         6 Verde 7 Branco/Marrom 8 Marrom
  // (pinos 4/5/7/8 sao identicos nos dois padroes -- só os pares laranja/verde
  // trocam de posicao entre si; por isso ligar T568A numa ponta e T568B na
  // outra produz um cabo CROSSOVER de verdade, nao só uma etiqueta diferente).
  const T568_ORDEM = {
    A: ['branco-verde', 'verde', 'branco-laranja', 'azul', 'branco-azul', 'laranja', 'branco-marrom', 'marrom'],
    B: ['branco-laranja', 'laranja', 'branco-verde', 'azul', 'branco-azul', 'verde', 'branco-marrom', 'marrom'],
  };
  const T568_COR_PAR = { verde: 0x2ecc71, laranja: 0xe67e22, azul: 0x2f6fdb, marrom: 0x8b5e34 };

  /** Pinagem dos 8 fios (1..8) de um jack RJ45 no padrao `padrao` ('A'|'B', default 'B' -- o mais comum em
   *  redes de dados comerciais no Brasil/EUA). Cada fio: { pino, nome, corHex, listrado (branco/X) }. */
  function pinosRJ45(padrao) {
    const ordem = T568_ORDEM[String(padrao || 'B').toUpperCase() === 'A' ? 'A' : 'B'];
    return ordem.map((nome, i) => {
      const listrado = nome.indexOf('branco-') === 0;
      const base = listrado ? nome.slice(7) : nome;
      return { pino: i + 1, nome, corHex: T568_COR_PAR[base] || 0xcccccc, listrado };
    });
  }
  /** Posicao LOCAL (mm, mesmo sistema de `portaLocal`) do pino `pino` (1..8) de uma porta RJ45 cujo centro
   *  fica em `px,py` -- os 8 contatos ficam numa fileira reta de ~10 mm (medida real do jack 8P8C),
   *  centralizada no eixo x da porta, todos na mesma altura `py` do painel. */
  function pinoLocalRJ45(px, py, pino) {
    const LARG_MM = 10, passo = LARG_MM / 7;
    return { x: px - LARG_MM / 2 + passo * (pino - 1), y: py };
  }
  /** Classifica a montagem do cabo comparando o padrao de pinagem usado em cada ponta: 'straight' quando
   *  as duas pontas usam o MESMO padrao (T568A-T568A ou T568B-T568B), 'crossover' quando divergem. */
  function classificarLigacao(padraoA, padraoB) {
    return String(padraoA || 'B').toUpperCase() === String(padraoB || 'B').toUpperCase() ? 'straight' : 'crossover';
  }

  /** Descricao fisica da PORTA `n` do equipamento (para `RedePassiva.avaliarConexao`).
   *  switch RJ-45 = aceita qualquer categoria; SFP = modulo agnostico; keystone (patch/tomada) = categoria
   *  e blindagem configuradas em `obj.rede`; DIO = so optica, conector/fibra configurados em `obj.rede`. */
  function descritorPorta(obj, n) {
    const sp = especificar(obj.tipo), p = sp && sp.portaPorN[n];
    if (!p) return null;
    const r = garantirRede(obj);
    if (p.tipo === 'rj45') return { meio: 'cobre', conector: 'RJ45', categoria: 'cat7', blindagem: 'S/FTP' };
    if (p.tipo === 'sfp') return { meio: 'fibra', conector: 'LC', fibra: 'ANY' };
    if (p.tipo === 'lc') return { meio: 'fibra', conector: r.conector || 'LC', fibra: r.fibra || 'SMF' };
    return { meio: 'cobre', conector: 'RJ45', categoria: r.categoria || 'cat6', blindagem: r.blindagem || 'U/UTP' };
  }
  /** Diametro externo (mm) do cabo. */
  function diametroCabo(c) { const RP = _RP(), d = RP && RP.descreverCabo(c.tipo); return d ? d.diametroMm : 6; }

  // ==========================================================================
  // [19/09/2026 UTC] NOVO (RODADA 205) -- ORGANIZAÇÃO TRASEIRA EM CHICOTES
  // (CABLE COMBING & BUNDLING), pedido verbatim como "Engenheiro de Software
  // Principal": agrupa os cabos ligados na TRASEIRA (`lado==='tras'`) de um patch
  // panel/switch em subgrupos ("chicotes", tipicamente 6/12/24 cabos), cada um
  // preso a uma calha (esquerda/direita). É OPCIONAL -- só roda quando
  // `rack.chicoteHabilitado` está ligado (ver `rack-modular.js`,
  // `RackModular.patchChicoteHabilitado`); sem isso, o app continua desenhando
  // cada cabo individualmente (comportamento de sempre).
  //
  // Esta função é LÓGICA PURA (sem Three.js) -- devolve grupos com as PORTAS e
  // um DIÂMETRO EQUIVALENTE do feixe, prontos pra `Engine3D` desenhar (a
  // geometria/fusão de malhas 3D fica no motor, que já sabe converter porta ->
  // ponto no mundo). Diâmetro do feixe: soma das ÁREAS de seção transversal dos
  // cabos individuais (não dos diâmetros -- um feixe de N cabos NÃO tem N vezes
  // o diâmetro de 1 cabo, tem √N vezes, já que área cresce com o quadrado do
  // raio) -- fórmula padrão de mercado pra estimar o diâmetro de um chicote.
  // ==========================================================================

  /** Diâmetro (mm) de um FEIXE equivalente a `diametrosMm` cabos individuais somados por área. */
  function diametroFeixe(diametrosMm) {
    if (!diametrosMm || !diametrosMm.length) return 0;
    const areaTotal = diametrosMm.reduce((soma, d) => soma + Math.PI * (d / 2) * (d / 2), 0);
    return 2 * Math.sqrt(areaTotal / Math.PI);
  }

  /**
   * Agrupa os cabos ligados pela TRASEIRA de `patchPanelObj` em subgrupos de
   * até `porGrupo` portas (padrão 12 -- mercado usa 6/12/24), alternando a
   * calha de destino ('esq'|'dir') a cada grupo -- ex.: portas 1-12 na calha
   * esquerda, 13-24 na direita, pro peso/volume ficar balanceado dos 2 lados
   * da barra guia de cabos traseira (`spec.barra`, já existente em
   * `_construirAtivo`/rede-equip.js).
   *
   * @param {object} map              Mapa (pra achar os cabos via `cabosDoObjeto`).
   * @param {object} patchPanelObj    Objeto do patch panel/switch (`obj.tipo` de família 'patchpanel').
   * @param {object} [opt]
   * @param {number} [opt.porGrupo=12]  Tamanho máximo de cada chicote (6, 12 ou 24 são os usuais).
   * @returns {Array<{ id, calha:'esq'|'dir', portas:number[], cabos:object[], diametroMm:number }>}
   *          Um item por chicote. `cabos` já vem filtrado (só os que têm ponta
   *          nessa porta com `lado==='tras'`) -- útil pro motor 3D iterar.
   */
  function generateRearChicote(map, patchPanelObj, opt) {
    opt = opt || {};
    const porGrupo = Math.max(1, opt.porGrupo || 12);
    const spec = especificar(patchPanelObj.tipo);
    if (!spec || spec.familia !== 'patchpanel') return [];
    const cabosDoEquip = cabosDoObjeto(map, patchPanelObj.id);
    // Só as portas que têm um cabo ligado PELA TRASEIRA (`lado==='tras'`) entram num chicote --
    // uma porta sem nada ligado, ou ligada só pela frente (patch cord curto pro switch do mesmo
    // rack), não produz fio nenhum saindo pra trás.
    const portasComCaboTras = spec.portas
      .map((p) => p.n)
      .filter((n) => cabosDoEquip.some((c) =>
        (c.de.obj === patchPanelObj.id && c.de.porta === n && c.de.lado === 'tras') ||
        (c.para.obj === patchPanelObj.id && c.para.porta === n && c.para.lado === 'tras')))
      .sort((a, b) => a - b);
    const grupos = [];
    for (let i = 0; i < portasComCaboTras.length; i += porGrupo) {
      const portas = portasComCaboTras.slice(i, i + porGrupo);
      const cabos = portas.map((n) => cabosDoEquip.find((c) =>
        (c.de.obj === patchPanelObj.id && c.de.porta === n && c.de.lado === 'tras') ||
        (c.para.obj === patchPanelObj.id && c.para.porta === n && c.para.lado === 'tras'))).filter(Boolean);
      grupos.push({
        id: patchPanelObj.id + '_chicote_' + (grupos.length + 1),
        calha: grupos.length % 2 === 0 ? 'esq' : 'dir',   // alterna esquerda/direita a cada grupo novo
        portas, cabos,
        diametroMm: diametroFeixe(cabos.map(diametroCabo)),
      });
    }
    return grupos;
  }

  /**
   * AGRUPAMENTO VERTICAL (requisito 2 do pedido): recebe os chicotes de TODOS
   * os patch panels/switches de um rack (um `generateRearChicote` por
   * equipamento) e funde os que descem pela MESMA guia vertical (esq/dir) num
   * único "super feixe", cujo diâmetro cresce com a raiz quadrada do total de
   * cabos contidos (mesma fórmula de área de `diametroFeixe`). Puramente
   * lógico -- devolve, por guia, o diâmetro final e a lista de cabos
   * envolvidos; quem desenha o tubo (`Engine3D`) decide o traçado 3D real.
   *
   * @param {Array} chicotesDoRack  `[].concat(...equipamentos.map(eq => generateRearChicote(map, eq)))`
   * @returns {{ esq: {diametroMm, cabos}, dir: {diametroMm, cabos} }}
   */
  function generateSuperFeixeVertical(chicotesDoRack) {
    const porCalha = { esq: [], dir: [] };
    (chicotesDoRack || []).forEach((g) => { (porCalha[g.calha] || porCalha.esq).push(...g.cabos); });
    const montar = (cabos) => ({ cabos, diametroMm: diametroFeixe(cabos.map(diametroCabo)) });
    return { esq: montar(porCalha.esq), dir: montar(porCalha.dir) };
  }

  /**
   * Conecta um cabo (patch cord) entre duas portas. Retorna { ok, cabo, avisos } ou { ok:false, erro }.
   * VALIDACAO (js/rede-passiva.js `avaliarConexao`): o PLUG do cabo escolhido e comparado com CADA porta
   * — cobre em porta optica / conector LC em SC = ERRO (recusa); plug Cat6A em keystone Cat6, fibra SMF
   * em porta MMF etc. = AVISO (conecta, mas o aviso fica em `cabo.avisos` e aparece nos menus).
   * opt: { tipo, conector ('LC'|'SC'|'ST', fibra), length (m; 0 = automatico), labelID, cor }
   */
  function conectar(map, aObj, aPorta, bObj, bPorta, opt) {
    opt = opt || {};
    const A = typeof aObj === 'string' ? _achar(map, aObj) : aObj, B = typeof bObj === 'string' ? _achar(map, bObj) : bObj;
    if (!A || !B) return { ok: false, erro: 'Equipamento não encontrado.' };
    const sa = especificar(A.tipo), sb = especificar(B.tipo);
    if (!sa || !sb) return { ok: false, erro: 'Só é possível cabear equipamentos de rede.' };
    if (!sa.portaPorN[aPorta] || !sb.portaPorN[bPorta]) return { ok: false, erro: 'Porta inexistente.' };
    // [19/09/2026 UTC] NOVO (RODADA 201) -- pedido verbatim do usuario: "ligar na parte de tras do patch
    // panel [...] deve ser possivel fazer isso tambem, nao de forma automatica" -- `opt.ladoA`/`opt.ladoB`
    // ('frente'|'tras', default 'frente') escolhem qual FACE fisica daquela porta recebe o plugue deste
    // cabo. 'tras' so existe em porta tipo 'keystone' (patch panel/tomada -- as UNICAS familias com bloco
    // IDC/jack fisico acessivel por tras; switch/DIO so tem frente).
    const ladoA = opt.ladoA === 'tras' ? 'tras' : 'frente', ladoB = opt.ladoB === 'tras' ? 'tras' : 'frente';
    if (ladoA === 'tras' && sa.portaPorN[aPorta].tipo !== 'keystone') return { ok: false, erro: 'Esta porta de ' + (A.nome || A.tipo) + ' não tem acesso pela traseira.' };
    if (ladoB === 'tras' && sb.portaPorN[bPorta].tipo !== 'keystone') return { ok: false, erro: 'Esta porta de ' + (B.nome || B.tipo) + ' não tem acesso pela traseira.' };
    if (A.id === B.id && aPorta === bPorta && ladoA === ladoB) return { ok: false, erro: 'Origem e destino são a mesma porta (e o mesmo lado).' };
    if (caboDaPorta(map, A.id, aPorta, ladoA)) return { ok: false, erro: 'A porta ' + aPorta + ' (' + ladoA + ') de ' + (A.nome || A.tipo) + ' já tem um cabo.' };
    if (caboDaPorta(map, B.id, bPorta, ladoB)) return { ok: false, erro: 'A porta ' + bPorta + ' (' + ladoB + ') de ' + (B.nome || B.tipo) + ' já tem um cabo.' };
    const RP = _RP();
    const da = descritorPorta(A, aPorta), db = descritorPorta(B, bPorta);
    // Tipo padrao: fibra se alguma ponta e optica (usa o modo da porta do DIO), senao Cat6.
    const optica = da.meio === 'fibra' || db.meio === 'fibra';
    const fibraPorta = (da.fibra && da.fibra !== 'ANY') ? da.fibra : ((db.fibra && db.fibra !== 'ANY') ? db.fibra : 'OM3');
    let tipoCabo = opt.tipo === 'console' ? 'console' : ((opt.tipo && (REDE_CATALOGO.CABOS[opt.tipo])) ? opt.tipo : (optica ? 'fibra_' + fibraPorta.toLowerCase() : 'cat6'));
    if (tipoCabo === 'fibra') tipoCabo = 'fibra_om3';
    const cabo = { id: 'cabo_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), tipo: tipoCabo,
      cor: opt.cor || REDE_CATALOGO.CABOS[tipoCabo].cor, rotulo: opt.rotulo || '', labelID: opt.labelID || opt.rotulo || '', length: opt.length > 0 ? opt.length : 0,
      de: { obj: A.id, porta: aPorta, lado: ladoA }, para: { obj: B.id, porta: bPorta, lado: ladoB }, avisos: [] };
    // [19/09/2026 UTC] NOVO (RODADA 171) -- cabo de ENERGIA (tomada do PDU/no-break <-> equipamento
    // alimentado) não tem "meio cobre/fibra" no sentido de rede de dados; pula a validação de
    // compatibilidade de plug (`RedePassiva.avaliarConexao`), que só faz sentido pra cabeamento
    // estruturado (Cat/fibra).
    const desc = RP && tipoCabo !== 'console' && tipoCabo !== 'energia' ? RP.descreverCabo(tipoCabo) : null;
    if (desc) {
      const plug = Object.assign({}, desc.plug);
      if (plug.meio === 'fibra') plug.conector = opt.conector || (da.meio === 'fibra' && da.conector) || (db.meio === 'fibra' && db.conector) || plug.conector;
      cabo.conector = plug.meio === 'fibra' ? plug.conector : 'RJ45';
      if (plug.categoria) { cabo.categoria = plug.categoria; cabo.blindagem = plug.blindagem; }
      if (plug.fibra) cabo.fibra = plug.fibra;
      for (const [porta, nome, n] of [[da, A.nome || A.tipo, aPorta], [db, B.nome || B.tipo, bPorta]]) {
        const r = RP.avaliarConexao(plug, porta);
        if (!r.ok) return { ok: false, erro: (nome + ' porta ' + n + ': ' + r.motivos.join(' ')) };
        r.motivos.forEach((m) => cabo.avisos.push(nome + ' porta ' + n + ': ' + m));
      }
    }
    // [19/09/2026 UTC] NOVO (RODADA 200) -- padrao de pinagem T568A/T568B em CADA ponta (independentes --
    // um instalador pode, por engano ou de proposito, usar padroes diferentes em cada extremidade fisica
    // do mesmo cabo) só se aplica a cobre com plugue RJ45 (fibra/console nao tem "par trancado" pra crimpar).
    // `opt.padrao568A`/`opt.padrao568B` (ou `opt.padrao568` pras duas pontas de uma vez) -- default 'B'.
    if (cabo.conector === 'RJ45' || (!cabo.conector && tipoCabo !== 'console' && tipoCabo !== 'energia' && !optica)) {
      const pA = (opt.padrao568A || opt.padrao568 || 'B').toString().toUpperCase() === 'A' ? 'A' : 'B';
      const pB = (opt.padrao568B || opt.padrao568 || 'B').toString().toUpperCase() === 'A' ? 'A' : 'B';
      cabo.padrao568A = pA; cabo.padrao568B = pB;
      cabo.linkType = classificarLigacao(pA, pB);
      // `opt.exigirStraight` = politica da empresa/projeto exige cabo Straight-Through nesta conexao
      // (ex.: entre 2 patch panels ou patch panel<->tomada -- crossover so faz sentido ligando 2 equipamentos
      // ativos "burros" direto, sem switch entre eles). Crossover fora dessa politica vira AVISO visivel.
      if (opt.exigirStraight && cabo.linkType === 'crossover') {
        cabo.avisos.push('Padrão de pinagem diferente em cada ponta (T568' + pA + ' / T568' + pB + ') — cabo é CROSSOVER; esta ligação deveria ser Straight-Through.');
      }
    }
    _cabos(map).push(cabo);
    notificarMudanca(map, { cabos: true });
    return { ok: true, cabo, avisos: cabo.avisos };
  }
  function desconectar(map, caboId) {
    const arr = _cabos(map); const i = arr.findIndex((c) => c.id === caboId);
    if (i < 0) return false;
    arr.splice(i, 1); notificarMudanca(map, { cabos: true }); return true;
  }
  function desconectarPorta(map, objId, n) {
    const c = caboDaPorta(map, objId, n);
    return c ? desconectar(map, c.id) : false;
  }
  /** Remove os cabos de um equipamento excluido. */
  function removerCabosDoObjeto(map, id) {
    if (!map || !Array.isArray(map.cabos)) return;
    const antes = map.cabos.length;
    for (let i = map.cabos.length - 1; i >= 0; i--) { const c = map.cabos[i]; if (c.de.obj === id || c.para.obj === id) map.cabos.splice(i, 1); }   // in-place: copias rasas do mapa (3D) veem a mesma lista
    if (map.cabos.length !== antes) notificarMudanca(map, { cabos: true });
  }

  /** Gancho unico de "mudou algo": o View3D liga `RedeEquip.aoMudar` (reconstroi cabos 3D e salva). */
  function notificarMudanca(map, info) {
    if (typeof raiz.RedeEquip !== 'undefined' && typeof raiz.RedeEquip.aoMudar === 'function') { try { raiz.RedeEquip.aoMudar(map, info || {}); } catch (e) { /* nao derruba o script */ } }
    else if (typeof raiz.DB !== 'undefined' && raiz.DB.saveMap && map) { try { raiz.DB.saveMap(map); } catch (e) { /* idem */ } }
  }

  // ==========================================================================
  // 5) INTEGRACAO COM O RACK (snap magnetico por U)
  // ==========================================================================
  function _RM() { return raiz.RackModular || null; }
  function _rotY(ang) {
    const P = raiz.Engine3DProfiles; return P && P.objAnguloToRotY ? P.objAnguloToRotY(ang) : -(ang || 0);
  }
  function equipDoRack(map, rackId) { return (map && map.objects || []).filter((o) => o.rackId === rackId && ehEquipRede(o.tipo)); }

  /** RackModular do objeto-rack com TODA a ocupacao (acessorios decorativos + equipamentos reais). */
  function _rackComOcupacao(map, rack, ignorarId) {
    const RM = _RM(); if (!RM) return null;
    const r = RM.fromObjeto(rack);
    equipDoRack(map, rack.id).forEach((e) => {
      if (e.id === ignorarId || !(e.rackU >= 1)) return;
      const s = especificar(e.tipo);
      r.ocupar('rede_' + e.id, e.rackU, s.alturaU, 'bandeja');
    });
    return r;
  }
  function primeiraULivre(map, rack, alturaU, ignorarId) {
    const r = _rackComOcupacao(map, rack, ignorarId); return r ? r.primeiraUlivre(alturaU) : 0;
  }

  /** Ponto (x,y) em metros dentro da planta do rack (considera rotacao)? */
  function pontoDentroDoRack(rack, x, y) {
    const rot = _rotY(rack.angulo), c = Math.cos(rot), s = Math.sin(rot);
    const dx = x - rack.x, dz = y - rack.y;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) <= (rack.largura || 0.6) / 2 && Math.abs(lz) <= (rack.profundidade || 0.6) / 2;
  }

  /** Posiciona `equip` no rack (U escolhida ou a mais proxima/1a livre). Grava rackId/rackU + x,y,angulo,elevacao. */
  function instalarNoRack(map, equip, rack, uDesejada, yRelMm) {
    const RM = _RM(); if (!RM || !rack || rack.tipo !== 'rack') return { ok: false, erro: 'Rack inválido.' };
    if (!ehRackavel(equip.tipo)) return { ok: false, erro: 'Este item não é montado em rack.' };
    const eq = criar(equip.tipo);
    const r = _rackComOcupacao(map, rack, equip.id);
    let u = 0;
    if (uDesejada >= 1) { if (r.ocupar('tmp_' + equip.id, Math.round(uDesejada), eq.heightInU, 'bandeja')) { u = Math.round(uDesejada); r.liberar('tmp_' + equip.id); } }
    if (!u && typeof yRelMm === 'number') { const s = eq.snapNoRack(r, yRelMm, equip.id); if (s.ok) u = s.uInicial; }
    if (!u) u = r.primeiraUlivre(eq.heightInU);
    if (!u) return { ok: false, erro: 'Sem espaço livre de ' + eq.heightInU + 'U neste rack.' };
    equip.rackId = rack.id; equip.rackU = u;
    sincronizarUm(map, equip);
    return { ok: true, u };
  }
  function retirarDoRack(map, equip) {
    const rack = _achar(map, equip.rackId);
    equip.rackId = null; equip.rackU = null;
    if (rack) {                                   // deixa ao lado do rack, na mesma altura em que estava
      const rot = _rotY(rack.angulo), c = Math.cos(rot), s = Math.sin(rot);
      const d = (rack.largura || 0.6) / 2 + (equip.largura || 0.4826) / 2 + 0.15;
      equip.x = rack.x + d * c; equip.y = rack.y - d * s;
    }
  }
  /** Copia x/y/angulo/piso e calcula a elevacao (m) a partir do rack + U. Solta o equipamento se o rack sumiu/encolheu. */
  function sincronizarUm(map, equip) {
    if (!equip.rackId) return false;
    const rack = _achar(map, equip.rackId), RM = _RM();
    if (!rack || rack.tipo !== 'rack' || !RM || !(equip.rackU >= 1)) { equip.rackId = null; equip.rackU = null; return true; }
    const r = RM.fromObjeto(rack), eq = criar(equip.tipo);
    if (equip.rackU + eq.heightInU - 1 > r.us) { equip.rackId = null; equip.rackU = null; return true; }
    const no = r.nosSnap[equip.rackU - 1];
    equip.x = rack.x; equip.y = rack.y; equip.angulo = rack.angulo || 0; equip.piso = rack.piso || 0;
    equip.elevacao = (rack.elevacao || 0) + no.yBase / 1000;
    return true;
  }
  /** Sincroniza todos (ou so os de um rack) — chamado ao carregar o mapa e ao mudar o rack. */
  function sincronizarNoRack(map, rackId) {
    let mudou = false;
    (map && map.objects || []).forEach((o) => { if (ehEquipRede(o.tipo) && o.rackId && (!rackId || o.rackId === rackId)) mudou = sincronizarUm(map, o) || mudou; });
    return mudou;
  }
  /** Ao COLOCAR um equipamento sobre um rack (2D ou 3D): encaixa magneticamente na U mais proxima. */
  function autoSnapAoColocar(map, obj) {
    if (!ehEquipRede(obj.tipo) || !ehRackavel(obj.tipo) || !_RM()) return null;
    const racks = (map.objects || []).filter((o) => o.tipo === 'rack' && (o.piso || 0) === (obj.piso || 0) && pontoDentroDoRack(o, obj.x, obj.y));
    for (const rack of racks) {
      const yRel = ((typeof obj.elevacao === 'number' ? obj.elevacao : (rack.elevacao || 0)) - (rack.elevacao || 0)) * 1000 + especificar(obj.tipo).alturaMm / 2;
      const res = instalarNoRack(map, obj, rack, 0, yRel);
      if (res.ok) return { rack, u: res.u };
    }
    return null;
  }

  /** PREVIA do encaixe (sem gravar): dado o rack e a altura (mm, a partir da base do rack) do CENTRO
   *  do item, devolve { ok, u, elevacao (m, absoluta = rack + yBase da U) } ou { ok:false }.
   *  Usada pelo modo "pegar e carregar" (View3D) para desenhar o item ja travado na U enquanto se mira. */
  function previaNoRack(map, rack, equip, yRelMm) {
    const RM = _RM(); if (!RM || !rack || rack.tipo !== 'rack' || !ehRackavel(equip.tipo)) return { ok: false };
    const eq = criar(equip.tipo), r = _rackComOcupacao(map, rack, equip.id);
    const sn = eq.snapNoRack(r, yRelMm, equip.id);
    if (!sn || !sn.ok) return { ok: false };
    const no = r.nosSnap[sn.uInicial - 1];
    return { ok: true, u: sn.uInicial, elevacao: (rack.elevacao || 0) + no.yBase / 1000, planoZmm: r.planoMontagem.frontalZ, alturaRackMm: (r.nosSnap[r.us - 1] ? r.nosSnap[r.us - 1].yBase + 44.45 : 0) };
  }

  /** Cria um equipamento JA instalado no rack (usado pelo painel do rack). */
  function criarNoRack(map, rack, tipo, uInicial) {
    const M = raiz.Mapping; if (!M || !ehEquipRede(tipo) || !ehRackavel(tipo)) return null;
    const s = especificar(tipo);
    if (!(uInicial >= 1) && !primeiraULivre(map, rack, s.alturaU)) return null;
    const obj = M.addObject(map, rack.x, rack.y, tipo, { elevacao: rack.elevacao || 0, angulo: rack.angulo || 0, piso: rack.piso || 0 });
    const res = instalarNoRack(map, obj, rack, uInicial || 0);
    if (!res.ok) { M.removeObject(map, obj.id); return null; }
    return obj;
  }

  // ==========================================================================
  // 6) SCRIPTS DE FABRICA (funcionamento por script, como a Porta)
  // ==========================================================================
  const REDE_SCRIPT_SWITCH = [
    '/**',
    ' * SWITCH — o funcionamento é feito por este Script (como o da Porta).',
    ' * Interação: DUPLO CLIQUE (Modo Navegação) liga/desliga o switch. Para',
    ' * cabear, use o painel de propriedades (Rede) ou o menu no Modo Edição.',
    ' * Estado: obj.rede.ligado, obj.rede.hostname, obj.rede.portas[n].{rotulo,status}',
    ' * status da porta: "auto" (segue o cabo) | "active" (pisca) | "idle" (fixo) | "off".',
    ' * Funções úteis (chame de outros Scripts): ligar(), desligar(), alternarEnergia(),',
    ' *   rotularPorta(n, texto), forcarStatusPorta(n, status), conectarPorta(n, outroId, outraPorta, tipoCabo),',
    ' *   desconectarPorta(n), resumoPortas().',
    ' */',
    'function Start() {',
    '  RedeEquip.garantirRede(obj);',
    '}',
    '',
    'function Update() {',
    '  // Nada por quadro — os LEDs (verde fixo/piscando/apagado) são animados pelo motor 3D.',
    '}',
    '',
    'var _debounceAte = 0;',
    '',
    '/** Gatilho "Ao Clicar Duas Vezes": alterna a energia do switch. */',
    'function aoClicarDuasVezes() {',
    '  var agora = Date.now();',
    '  if (agora < _debounceAte) return;',
    '  _debounceAte = agora + 350;',
    '  alternarEnergia();',
    '  if (typeof Utils !== "undefined" && Utils.toast) Utils.toast((obj.nome || "Switch") + (obj.rede.ligado ? " ligado" : " desligado"), { duration: 1400 });',
    '}',
    '',
    'function ligar() { RedeEquip.garantirRede(obj).ligado = true; RedeEquip.notificarMudanca(map, {}); }',
    'function desligar() { RedeEquip.garantirRede(obj).ligado = false; RedeEquip.notificarMudanca(map, {}); }',
    'function alternarEnergia() { var r = RedeEquip.garantirRede(obj); r.ligado = !r.ligado; RedeEquip.notificarMudanca(map, {}); }',
    'function rotularPorta(n, texto) { var r = RedeEquip.garantirRede(obj); r.portas[n] = r.portas[n] || {}; r.portas[n].rotulo = String(texto || ""); RedeEquip.notificarMudanca(map, {}); }',
    'function forcarStatusPorta(n, status) { var r = RedeEquip.garantirRede(obj); r.portas[n] = r.portas[n] || {}; r.portas[n].status = status; RedeEquip.notificarMudanca(map, {}); }',
    'function conectarPorta(n, outroId, outraPorta, tipoCabo) { return RedeEquip.conectar(map, obj, n, outroId, outraPorta, { tipo: tipoCabo }); }',
    'function desconectarPorta(n) { return RedeEquip.desconectarPorta(map, obj.id, n); }',
    'function resumoPortas() {',
    '  var s = RedeEquip.especificar(obj.tipo), out = [];',
    '  for (var n = 1; n <= s.nPortas; n++) out.push({ porta: n, status: RedeEquip.statusEfetivo(map, obj, n), rotulo: (obj.rede.portas[n] || {}).rotulo || "", cabo: !!RedeEquip.caboDaPorta(map, obj.id, n) });',
    '  return out;',
    '}',
    '',
  ].join('\n');

  const REDE_SCRIPT_PATCH = [
    '/**',
    ' * PATCH PANEL — passivo (sem energia/LED). Duplo clique mostra quantas portas',
    ' * estão cabeadas. Rótulos de porta: obj.rede.portas[n].rotulo (aparecem no painel).',
    ' * Funções úteis: rotularPorta(n, texto), conectarPorta(n, outroId, outraPorta, tipoCabo),',
    ' *   desconectarPorta(n), resumoPortas().',
    ' */',
    'function Start() {',
    '  RedeEquip.garantirRede(obj);',
    '}',
    '',
    'function Update() {',
    '}',
    '',
    'var _debounceAte = 0;',
    '',
    '/** Gatilho "Ao Clicar Duas Vezes": informa o uso do patch panel. */',
    'function aoClicarDuasVezes() {',
    '  var agora = Date.now();',
    '  if (agora < _debounceAte) return;',
    '  _debounceAte = agora + 600;',
    '  var s = RedeEquip.especificar(obj.tipo), usadas = RedeEquip.cabosDoObjeto(map, obj.id).length;',
    '  if (typeof Utils !== "undefined" && Utils.toast) Utils.toast((obj.nome || "Patch panel") + ": " + usadas + "/" + s.nPortas + " portas cabeadas", { duration: 2200 });',
    '}',
    '',
    'function rotularPorta(n, texto) { var r = RedeEquip.garantirRede(obj); r.portas[n] = r.portas[n] || {}; r.portas[n].rotulo = String(texto || ""); RedeEquip.notificarMudanca(map, {}); }',
    'function conectarPorta(n, outroId, outraPorta, tipoCabo) { return RedeEquip.conectar(map, obj, n, outroId, outraPorta, { tipo: tipoCabo }); }',
    'function desconectarPorta(n) { return RedeEquip.desconectarPorta(map, obj.id, n); }',
    'function resumoPortas() {',
    '  var s = RedeEquip.especificar(obj.tipo), out = [];',
    '  for (var n = 1; n <= s.nPortas; n++) out.push({ porta: n, rotulo: (obj.rede.portas[n] || {}).rotulo || "", cabo: !!RedeEquip.caboDaPorta(map, obj.id, n) });',
    '  return out;',
    '}',
    '',
  ].join('\n');

  /** Componentes de fabrica (Script + Gatilho onDoubleClick -> aoClicarDuasVezes), ids novos. */
  function componentesPadrao(tipo, uid) {
    const gerar = uid || ((p) => p + '_' + Math.random().toString(36).slice(2, 10));
    const scriptId = gerar('comp'), trigId = gerar('comp');
    return [
      { id: scriptId, type: 'Script', enabled: true, code: ehSwitch(tipo) ? REDE_SCRIPT_SWITCH : REDE_SCRIPT_PATCH },
      { id: trigId, type: 'EventTrigger', enabled: true,
        events: [{ event: 'onDoubleClick', actions: [{ targetComponentId: scriptId, method: 'aoClicarDuasVezes', args: [] }] }] },
    ];
  }

  // ==========================================================================
  // 7) VIEW THREE.JS (mm; o motor escala o grupo por 0,001). Sem dependencia do app.
  // ==========================================================================
  /**
   * Monta a malha 3D de um equipamento. `THREE` e injetado (mesma instancia do motor).
   * - Placa frontal = ExtrudeGeometry com FUROS REAIS (portas RJ-45 com chave, SFP, console,
   *   USB e furos oblongos das orelhas), gerados por LOOP sobre `spec.portas`.
   * - Cavidades, contatos dourados e LEDs sao InstancedMesh (1 draw call cada).
   * - Serigrafia (numeracao, grupos, rotulos) = 1 textura de canvas (ignorada sem `document`).
   * Origem: centro da planta, base y=0, frente +z (ver cabecalho).
   */
  class RedeEquipView3D {
    constructor(THREE, spec, opt) {
      opt = opt || {}; this.opt = opt;
      this.THREE = THREE; this.spec = spec;
      this.group = new THREE.Group();
      this.group.name = 'rede-' + spec.tipo;
      this.group.scale.setScalar(0.001);
      this.group.userData.redeView = this;
      this._disp = [];
      this.ledIndice = {};        // n da porta -> indice na malha de LEDs
      this.ledSys = {};           // id do LED de sistema -> indice
      this._ledMalha = null;
      this._sig = '';
      this._cores = { on: new THREE.Color(0x35ff6b), dim: new THREE.Color(LED_COR_DIM), off: new THREE.Color(0x0b120d), amb: new THREE.Color(LED_COR_AMBAR), tmp: new THREE.Color() };
      this._construir();
      this.atualizarLeds(opt.estados || {}, 0, opt.ligado !== false);
    }

    _reg(o) { this._disp.push(o); return o; }
    _mat(cor, metal, rug) { return this._reg(new this.THREE.MeshStandardMaterial({ color: cor, metalness: metal == null ? 0.3 : metal, roughness: rug == null ? 0.6 : rug })); }
    _mesh(geo, mat, x, y, z) { const m = new this.THREE.Mesh(this._reg(geo), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m; }
    _box(w, h, d, mat, x, y, z) { return this._mesh(new this.THREE.BoxGeometry(w, h, d), mat, x, y, z); }

    /** InstancedMesh de caixas: `lista` = [{x,y,z,w,h,d}] (mm). */
    _caixas(lista, mat, cast) {
      const T = this.THREE;
      const im = new T.InstancedMesh(this._reg(new T.BoxGeometry(1, 1, 1)), mat, Math.max(1, lista.length));
      const m4 = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), s = new T.Vector3();
      const qz = new T.Quaternion(), ez = new T.Euler();
      lista.forEach((c, i) => { p.set(c.x, c.y, c.z); s.set(c.w, c.h, c.d); if (c.rz) { ez.set(0, 0, c.rz); qz.setFromEuler(ez); m4.compose(p, qz, s); } else m4.compose(p, q, s); im.setMatrixAt(i, m4); });
      im.count = lista.length; im.instanceMatrix.needsUpdate = true; im.castShadow = !!cast; im.receiveShadow = true;
      this.group.add(im); return im;
    }

    _construir() {
      if (this.spec.familia !== 'switch' && this.spec.familia !== 'patchpanel') { this._construirPassivo(); return; }
      const T = this.THREE, s = this.spec, W = s.largura, H = s.alturaMm, F = s.profundidade / 2, E = s.placaEsp;
      const ehSw = s.familia === 'switch';
      const zPlacaTras = F - E;
      const matPlaca = this._mat(ehSw ? 0x363c44 : 0x1f2225, 0.55, 0.5);
      const matCorpo = this._mat(ehSw ? 0x2a2e34 : 0x2b2f34, 0.5, 0.6);
      const matEscuro = this._reg(new T.MeshStandardMaterial({ color: 0x06080a, metalness: 0.1, roughness: 0.9 }));

      // ---- Placa frontal com furos reais ----
      const sh = new T.Shape();
      sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, H); sh.lineTo(-W / 2, H); sh.closePath();
      const furo = (pts) => { const p = new T.Path(); pts.forEach((pt, i) => (i ? p.lineTo(pt[0], pt[1]) : p.moveTo(pt[0], pt[1]))); p.closePath(); sh.holes.push(p); };
      const rj = REDE_CATALOGO.RJ45;
      const furoRJ = (cx, cy, w, h, cima) => {
        const cw = rj.chaveW, ch = rj.chaveH, d = cima ? 1 : -1;
        const y0 = cy - d * h / 2, y1 = cy + d * h / 2, y2 = y1 + d * ch;
        furo(cima
          ? [[cx - w / 2, y0], [cx + w / 2, y0], [cx + w / 2, y1], [cx + cw / 2, y1], [cx + cw / 2, y2], [cx - cw / 2, y2], [cx - cw / 2, y1], [cx - w / 2, y1]]
          : [[cx - w / 2, y0], [cx - w / 2, y1], [cx - cw / 2, y1], [cx - cw / 2, y2], [cx + cw / 2, y2], [cx + cw / 2, y1], [cx + w / 2, y1], [cx + w / 2, y0]]);
      };
      const furoRect = (cx, cy, w, h) => furo([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]);
      // Furos oblongos das orelhas (parafusos M6 de gaiola): 7,0 x 6,6 mm.
      s.furosOrelha.forEach((f) => {
        const r = f.h / 2, nseg = 8, pts = [];
        for (let i = 0; i <= nseg; i++) { const a = -Math.PI / 2 + Math.PI * i / nseg; pts.push([f.x + (f.w / 2 - r) + Math.cos(a) * r, f.y + Math.sin(a) * r]); }
        for (let i = 0; i <= nseg; i++) { const a = Math.PI / 2 + Math.PI * i / nseg; pts.push([f.x - (f.w / 2 - r) + Math.cos(a) * r, f.y + Math.sin(a) * r]); }
        furo(pts);
      });
      const cav = [], cavCons = [], cavSfp = [], contatos = [], jacks = [], jackCav = [];
      s.portas.forEach((p) => {
        if (p.tipo === 'rj45') {
          const cima = p.linha === 'sup';
          furoRJ(p.x, p.y, rj.janelaW, rj.janelaH, cima);
          cav.push({ x: p.x, y: p.y + (cima ? rj.chaveH / 2 : -rj.chaveH / 2), z: zPlacaTras + 0.6, w: rj.janelaW - 0.1, h: rj.janelaH + rj.chaveH - 0.1, d: 0.2 });
          contatos.push({ x: p.x, y: p.y + (cima ? -rj.janelaH / 2 + 1.1 : rj.janelaH / 2 - 1.1), z: zPlacaTras + 0.75, w: rj.janelaW - 2.4, h: 0.9, d: 0.2 });
        } else if (p.tipo === 'sfp') {
          furoRect(p.x, p.y, p.w, p.h);
          cavSfp.push({ x: p.x, y: p.y, z: zPlacaTras + 0.5, w: p.w - 0.1, h: p.h - 0.1, d: 0.2 });
        } else { // keystone do patch panel: janela retangular; o jack passa por ela
          furoRect(p.x, p.y, p.w, p.h);
          jacks.push({ x: p.x, y: p.y, z: F - 9.2, w: p.w - 0.5, h: p.h - 0.5, d: 21.6 });
          const cima = false;
          jackCav.push({ x: p.x, y: p.y + rj.chaveH / 2 - 0.4, z: F + 1.65, w: rj.janelaW, h: rj.janelaH + rj.chaveH, d: 0.1 });
          contatos.push({ x: p.x, y: p.y - rj.janelaH / 2 + 0.9, z: F + 1.75, w: rj.janelaW - 2.4, h: 0.9, d: 0.1 });
        }
      });
      if (ehSw) {
        const ex = s.extras;
        furoRJ(ex.console.x, ex.console.y, ex.console.w - 2, rj.janelaH, true);
        cavCons.push({ x: ex.console.x, y: ex.console.y + rj.chaveH / 2, z: zPlacaTras + 0.6, w: ex.console.w - 2.1, h: rj.janelaH + rj.chaveH - 0.1, d: 0.2 });
        furoRect(ex.usb.x, ex.usb.y, ex.usb.w, ex.usb.h);
        cav.push({ x: ex.usb.x, y: ex.usb.y, z: zPlacaTras + 0.6, w: ex.usb.w - 0.1, h: ex.usb.h - 0.1, d: 0.2 });
      }
      const gPlaca = this._reg(new T.ExtrudeGeometry(sh, { depth: E, bevelEnabled: false, curveSegments: 6 }));
      const placa = this._mesh(gPlaca, matPlaca, 0, 0, zPlacaTras);
      placa.name = 'placa-frontal';
      this.group.userData.redePlaca = placa;
      this._placa = placa;

      // ---- Cavidades / contatos / LEDs (instanciados) ----
      this._caixas(cav, matEscuro, false);
      this._caixas(cavSfp, this._mat(0x15181b, 0.7, 0.4), false);
      if (cavCons.length) this._caixas(cavCons, this._reg(new T.MeshStandardMaterial({ color: 0x1d6fa8, metalness: 0.1, roughness: 0.6 })), false);
      if (jackCav.length) this._caixas(jackCav, matEscuro, false);
      this._caixas(contatos, this._mat(0xd4af37, 0.9, 0.3), false);

      if (ehSw) {
        // ---- Corpo, ventilacao lateral, traseira (entrada de energia + ventoinha) ----
        const prof = s.profundidade - E, cw = s.larguraCorpo;
        this._box(cw, H - 1.2, prof, matCorpo, 0, H / 2, F - E - prof / 2);
        const fend = [];
        for (let i = 0; i < 14; i++) fend.push({ x: -150 + i * 22, y: H - 0.55, z: F - E - prof / 2, w: 12, h: 0.3, d: prof * 0.6 });
        this._caixas(fend, matEscuro, false);
        const zTras = F - s.profundidade;
        this._box(28, 20, 6, this._mat(0x101214, 0.2, 0.7), 168, H / 2, zTras - 3);           // entrada IEC C14
        this._box(24, 12, 0.6, matEscuro, 168, H / 2 + 2, zTras - 6.2);
        this._box(44, 36, 1, this._mat(0x15181b, 0.5, 0.6), -150, H / 2, zTras - 0.5);        // grade da ventoinha
        // Botao MODE (cilindro).
        const ex = s.extras;
        const bt = new T.CylinderGeometry(ex.mode.r, ex.mode.r, 1.8, 20); bt.rotateX(Math.PI / 2);
        this._mesh(bt, this._mat(0xb9c0c8, 0.8, 0.35), ex.mode.x, ex.mode.y, F + 0.9);
        // LEDs: portas + LEDs de sistema, 1 InstancedMesh.
        const leds = [];
        s.portas.forEach((p) => { this.ledIndice[p.n] = leds.length; leds.push({ x: p.ledX, y: p.ledY, z: F + 0.35, w: 3.8, h: 1.7, d: 0.7 }); });
        ex.sys.forEach((e) => { this.ledSys[e[0]] = leds.length; leds.push({ x: e[1], y: e[2], z: F + 0.35, w: 3.2, h: 2.2, d: 0.7 }); });
        const mb = this._reg(new T.MeshBasicMaterial({ color: 0xffffff }));
        const im = this._caixas(leds, mb, false);
        im.setColorAt(0, this._cores.off);
        for (let i = 0; i < leds.length; i++) im.setColorAt(i, this._cores.off);
        im.instanceColor.needsUpdate = true;
        this._ledMalha = im;
      } else {
        // ---- Patch panel: bandejas superior/inferior, jacks, IDC traseiros e barra guia de cabos ----
        const corpo = s.corpo, zc = F - E - (corpo - E) / 2;
        const matJack = this._mat(0xe3e6ea, 0.15, 0.55);
        this._caixas(jacks, matJack, true);
        this._box(s.larguraCorpo, 1.2, corpo - E, matCorpo, 0, 0.6, zc);
        this._box(s.larguraCorpo, 1.2, corpo - E, matCorpo, 0, H - 0.6, zc);
        this._box(s.larguraCorpo, H - 2.4, 1.5, this._mat(0x0d5c2e, 0.1, 0.7), 0, H / 2, F - corpo + 3);       // PCB traseira (verde)
        const idc = [];
        s.portas.forEach((p) => idc.push({ x: p.x, y: p.y, z: F - corpo + 8, w: 12.5, h: 13.5, d: 12 }));
        this._caixas(idc, this._mat(0xd9dde2, 0.1, 0.6), false);
        // Barra guia de cabos (100 mm atras do corpo): 2 hastes + barra transversal.
        const zFim = F - s.profundidade, zHaste = (F - corpo + zFim) / 2, matBarra = this._mat(0x9aa2aa, 0.8, 0.4);
        [-205, 205].forEach((x) => this._box(4, 4, s.barra, matBarra, x, H / 2, zHaste));
        this._box(s.larguraCorpo - 6, 8, 3, matBarra, 0, H / 2, zFim + 1.5);
      }
      if (this.opt.parafusos && s.furosOrelha && s.furosOrelha.length) this._parafusos();
      const dec = this._serigrafia();
      if (dec) this.group.add(dec);
    }

    /** Parafusos M6 + porcas-gaiola VIRTUAIS nos furos das orelhas (so quando o item esta instalado num rack). */
    _parafusos() {
      const T = this.THREE, s = this.spec, F = s.profundidade / 2;
      const g = this._reg(new T.CylinderGeometry(3.3, 3.3, 1.4, 14)); g.rotateX(Math.PI / 2);
      const im = new T.InstancedMesh(g, this._mat(0xc2c8d0, 0.9, 0.35), s.furosOrelha.length);
      const m4 = new T.Matrix4();
      s.furosOrelha.forEach((f, i) => { m4.makeTranslation(f.x, f.y, F + 0.7); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true; this.group.add(im);
      // porca-gaiola (atras da orelha): pequena chapa quadrada
      this._caixas(s.furosOrelha.map((f) => ({ x: f.x, y: f.y, z: F - s.placaEsp - 0.8, w: 10, h: 10, d: 1.4 })), this._mat(0x8d949c, 0.8, 0.5), false);
    }

    /** Itens PASSIVOS: DIO, guias de cabo, bandejas, PDU, frente falsa, kit de ventilacao, espelho/caixa de
     *  piso e abracadeiras. Mesma convencao de eixos (origem no centro da planta, base y=0, frente +z). */
    _construirPassivo() {
      const T = this.THREE, s = this.spec, W = s.largura, H = s.alturaMm, F = s.profundidade / 2, E = s.placaEsp, fam = s.familia;
      const zPlacaTras = F - E;
      const claro = fam === 'tomada' || fam === 'ap';
      const matPlaca = this._mat(claro ? 0xe9ebee : 0x2f343b, claro ? 0.05 : 0.5, claro ? 0.6 : 0.5);
      const matCorpo = this._mat(0x23272c, 0.5, 0.6);
      const matEscuro = this._reg(new T.MeshStandardMaterial({ color: 0x06080a, metalness: 0.1, roughness: 0.9 }));
      const matMetal = this._mat(0x9aa2aa, 0.8, 0.4);
      const sh = new T.Shape();
      sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, H); sh.lineTo(-W / 2, H); sh.closePath();
      const furo = (pts) => { const p = new T.Path(); pts.forEach((pt, i) => (i ? p.lineTo(pt[0], pt[1]) : p.moveTo(pt[0], pt[1]))); p.closePath(); sh.holes.push(p); };
      const furoRect = (cx, cy, w, h) => furo([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]);
      const furoCirc = (cx, cy, r) => { const p = new T.Path(); p.absarc(cx, cy, r, 0, Math.PI * 2, false); sh.holes.push(p); };
      // Orelhas oblongas (itens de rack).
      s.furosOrelha.forEach((f) => {
        const r = f.h / 2, nseg = 8, pts = [];
        for (let i = 0; i <= nseg; i++) { const a = -Math.PI / 2 + Math.PI * i / nseg; pts.push([f.x + (f.w / 2 - r) + Math.cos(a) * r, f.y + Math.sin(a) * r]); }
        for (let i = 0; i <= nseg; i++) { const a = Math.PI / 2 + Math.PI * i / nseg; pts.push([f.x - (f.w / 2 - r) + Math.cos(a) * r, f.y + Math.sin(a) * r]); }
        furo(pts);
      });

      if (fam === 'abracadeira') {
        const cor = s.material === 'nylon' ? 0xe8e6de : 0x2b2e33;
        const anel = new T.TorusGeometry(11, 2.4, 8, 24);
        this._mesh(anel, this._mat(cor, 0.1, 0.8), 0, H / 2, 0);
        this._box(8, 5, 6, this._mat(s.material === 'nylon' ? 0xd7d4ca : 0x1c1e22, 0.1, 0.8), 0, H / 2 - 11, 0);
        if (s.material === 'velcro') this._box(16, 4, 1.2, this._mat(0xb9bec6, 0.1, 0.9), 0, H / 2 + 11, 0);   // tira de gancho
        return;
      }

      const cavidades = [], contatos = [];
      if (fam === 'dio') {
        const fib = (this.opt.fibra) || 'SMF';
        const corAd = fib === 'SMF' ? 0x2f6fdb : (fib === 'OM4' ? 0x7c3aed : 0x22c7d8);   // adaptador azul (SMF), aqua (OM3), violeta (OM4)
        const ad = [];
        s.portas.forEach((p) => {
          furoRect(p.x, p.y, p.w, p.h);
          ad.push({ x: p.x, y: p.y, z: F + 0.8, w: p.w - 0.6, h: p.h - 0.6, d: 3.6 });
          cavidades.push({ x: p.x - 2.6, y: p.y, z: F + 2.65, w: 3.4, h: 3.4, d: 0.3 }, { x: p.x + 2.6, y: p.y, z: F + 2.65, w: 3.4, h: 3.4, d: 0.3 });
        });
        this._caixas(ad, this._mat(corAd, 0.1, 0.5), false);
      } else if (fam === 'tomada' || fam === 'ap') {
        const rj = REDE_CATALOGO.RJ45, jk = [];
        s.portas.forEach((p) => {
          furoRect(p.x, p.y, p.w, p.h);
          jk.push({ x: p.x, y: p.y, z: F - 6, w: p.w - 0.5, h: p.h - 0.5, d: 12 + 1.2 });
          cavidades.push({ x: p.x, y: p.y + rj.chaveH / 2 - 0.4, z: F + 0.7, w: rj.janelaW, h: rj.janelaH + rj.chaveH, d: 0.2 });
          contatos.push({ x: p.x, y: p.y - rj.janelaH / 2 + 0.9, z: F + 0.85, w: rj.janelaW - 2.4, h: 0.9, d: 0.1 });
        });
        this._caixas(jk, this._mat(0xf4f5f7, 0.05, 0.5), false);
        if (fam === 'tomada') { furoCirc(0, H - 6, 2); furoCirc(0, 6, 2); }           // furos de parafuso
      } else if (fam === 'pdu') {
        const n = s.tomadas, x0 = -170, passo = 340 / (n - 1), pinos = [];
        for (let i = 0; i < n; i++) {
          const cx = x0 + i * passo; furoRect(cx, H / 2, 24, 20);
          cavidades.push({ x: cx, y: H / 2, z: zPlacaTras + 0.6, w: 23.6, h: 19.6, d: 0.2 });
          pinos.push({ x: cx - 4.2, y: H / 2, z: zPlacaTras + 0.8, w: 2.4, h: 6, d: 0.2 }, { x: cx + 4.2, y: H / 2, z: zPlacaTras + 0.8, w: 2.4, h: 6, d: 0.2 });
        }
        this._caixas(pinos, this._mat(0xd4af37, 0.9, 0.3), false);
        this._box(14, 8, 3, this._mat(0xc81e1e, 0.1, 0.5), -208, H / 2, F + 1.5);        // chave liga/desliga
      } else if (fam === 'ventilacao') {
        const n = s.ventoinhas, lam = [];
        for (let i = 0; i < n; i++) {
          const cx = (i - (n - 1) / 2) * 150; furoCirc(cx, H / 2, 17);
          for (let k = 0; k < 5; k++) lam.push({ x: cx, y: H / 2, z: zPlacaTras + 3, w: 16, h: 3.4, d: 0.8, rz: k * Math.PI / 5 });   // pas
          cavidades.push({ x: cx, y: H / 2, z: zPlacaTras + 1.2, w: 5, h: 5, d: 2 });                                            // cubo
        }
        this._caixas(lam, this._mat(0x1c1f24, 0.3, 0.6), false);
      }
      // [19/09/2026 UTC] NOVO (RODADA 171) -- No-break/UPS: mesmas "tomadas de saída" do PDU
      // (furo + pinos dourados), reaproveitando o layout `x0/passo`; um mostrador (LCD) simples
      // acima delas quando `s.layout.extras && s.layout.extras.display` (ver `_especNobreak`).
      if (fam === 'nobreak') {
        const pinos = [];
        s.portas.forEach((p) => {
          furoRect(p.x, p.y, p.w, p.h);
          cavidades.push({ x: p.x, y: p.y, z: zPlacaTras + 0.6, w: p.w - 0.4, h: p.h - 0.4, d: 0.2 });
          pinos.push({ x: p.x - 4.2, y: p.y, z: zPlacaTras + 0.8, w: 2.4, h: 6, d: 0.2 }, { x: p.x + 4.2, y: p.y, z: zPlacaTras + 0.8, w: 2.4, h: 6, d: 0.2 });
        });
        if (pinos.length) this._caixas(pinos, this._mat(0xd4af37, 0.9, 0.3), false);
        if (s.extras && s.extras.display) furoRect(-W / 2 + 44, H - 10, 60, 14);
      }
      // Storage (NAS/SAN/Disk Shelf): cada "porta" (`s.portas`, tipo 'baia') vira o furo da frente
      // + uma tampa (gaveta fechada, cor cinza-escura). RESSALVA: esta é
      // uma representação visual ESTÁTICA das baias -- o drag-and-drop/estado por slot (inserir/
      // remover disco, cor por status) é gerenciado pelas classes StorageDevice/DriveUnit em
      // js/rede-storage-energia.js, mas a INTEGRAÇÃO com esta malha 3D (recolorir/animar a gaveta
      // de um slot específico quando um disco é inserido) ainda não foi implementada.
      else if (fam === 'storage') {
        // [19/09/2026 UTC] NOVO (RODADA 174) -- cada baia é colorida individualmente conforme
        // `this.opt.baias[slotIndex]` (estado salvo em `obj.rede.baias`, ver
        // `RedeEquip.baiaInserir/baiaRemover/garantirRede` em rede-equip.js): vazia = tampa cinza-
        // escura sem disco; ocupada = "disco" saliente colorido por status (healthy = verde,
        // failed = vermelho). `_caixas()` só aceita UM material por chamada (é um único
        // InstancedMesh) — como cada baia pode ter uma cor DIFERENTE, usamos `_box()` individual
        // por slot aqui (até 60 chamadas no maior storage — aceitável, executado só na construção/
        // reconstrução do objeto, não por quadro).
        const baias = this.opt.baias || {};
        const CORES = { healthy: 0x3ecb6e, failed: 0xd8362f, empty: 0x545a63 };
        s.portas.forEach((p) => {
          furoRect(p.x, p.y, p.w, p.h);
          const drive = baias[p.slotIndex], status = drive ? (drive.status || 'healthy') : 'empty';
          const corTampa = CORES[status] || CORES.empty;
          this._box(p.w - 1, p.h - 1, drive ? 3.2 : 1.6, this._mat(corTampa, drive ? 0.3 : 0.6, 0.5), p.x, p.y, zPlacaTras + (drive ? 1.5 : 0.9));
          cavidades.push({ x: p.x, y: p.y, z: zPlacaTras + (drive ? 3.1 : 1.9), w: 3, h: 1.6, d: 0.2 });   // LED de status do slot
        });
      }
      if (cavidades.length) this._caixas(cavidades, matEscuro, false);
      if (contatos.length) this._caixas(contatos, this._mat(0xd4af37, 0.9, 0.3), false);

      const placa = this._mesh(this._reg(new T.ExtrudeGeometry(sh, { depth: E, bevelEnabled: false, curveSegments: 8 })), matPlaca, 0, 0, zPlacaTras);
      placa.name = 'placa-frontal'; this.group.userData.redePlaca = placa; this._placa = placa;

      // ---- corpo / partes proprias de cada familia ----
      const profCorpo = s.profundidade - E;
      if (fam === 'dio') this._box(s.larguraCorpo, H - 1.2, profCorpo, matCorpo, 0, H / 2, zPlacaTras - profCorpo / 2);
      else if (fam === 'pdu') this._box(s.larguraCorpo, H - 4, profCorpo, matCorpo, 0, H / 2, zPlacaTras - profCorpo / 2);
      else if (fam === 'ventilacao') this._box(s.larguraCorpo, H - 4, profCorpo, matCorpo, 0, H / 2, zPlacaTras - profCorpo / 2);
      else if (fam === 'tomada') this._box(W - 8, H - 8, profCorpo, matCorpo, 0, H / 2, zPlacaTras - profCorpo / 2);
      else if (fam === 'ap') {
        // Corpo do AP + 'lente' de antena (painel escuro em relevo) + LEDs de status.
        this._box(W - 8, H - 8, profCorpo, matCorpo, 0, H / 2, zPlacaTras - profCorpo / 2);
        this._box(W - 60, H - 90, 2, this._mat(0xcfd4da, 0.05, 0.7), 0, H / 2 + 24, F + 1);
        // [22/09/2026] NOVO -- pedido verbatim: "Coloque LEDs no modelo do Access Point como no padrão
        // usado no mercado." Um AP de parede/teto real (Ubiquiti/Cisco/TP-Link/Aruba etc.) costuma ter
        // uma FILEIRA de LEDs redondos pequenos na frente, cada um indicando um estado PRÓPRIO -- Energia
        // (aceso quando ligado), Rede/LAN (aceso quando há cabo na porta RJ-45) e Wi-Fi/Sinal (aceso só
        // quando de fato EMITINDO sinal, ou seja, ligado E com cabo). Antes havia só 1 LED quadrado único
        // já combinando "ligado+cabo" num estado só (`apAtivo`, ver `engine3d-rede-mesh.js`) -- virou 3
        // LEDs redondos (mais próximo do padrão real), cada um refletendo só o seu próprio estado.
        const ligado = !!(this.opt && this.opt.ligado);
        const emiteSinal = !!(this.opt && this.opt.apAtivo); // já é "ligado E com cabo" (ver engine3d-rede-mesh.js)
        const temCabo = emiteSinal; // AP só chega a `apAtivo` com energia + cabo — mesma condição aqui
        const matLed = (on, corOn) => this._mat(on ? corOn : 0x2c3034, on ? 0.1 : 0.3, on ? 0.35 : 0.75);
        const ledGeo = () => { const g = new T.CylinderGeometry(1.7, 1.7, 1.1, 14); g.rotateX(Math.PI / 2); return g; };
        this._mesh(ledGeo(), matLed(ligado, 0x3ecb6e), -11, 14, F + 0.6);       // Energia (verde)
        this._mesh(ledGeo(), matLed(temCabo, 0x2f6fdb), 0, 14, F + 0.6);        // Rede/LAN (azul)
        this._mesh(ledGeo(), matLed(emiteSinal, 0xf5c518), 11, 14, F + 0.6);    // Wi-Fi/Sinal (âmbar)
        [-1, 1].forEach((sx) => this._box(4, H - 100, 6, this._mat(0xb9bec6, 0.2, 0.6), sx * (W / 2 - 22), H / 2 + 24, F + 3));   // aletas de antena
      }
      else if (fam === 'frente') this._box(s.larguraCorpo, H - 4, profCorpo, matCorpo, 0, H / 2, zPlacaTras - profCorpo / 2);
      else if (fam === 'nobreak' || fam === 'storage') this._box(s.rackavel ? s.larguraCorpo : W - 10, H - (s.rackavel ? 4 : 10), profCorpo, matCorpo, 0, H / 2, zPlacaTras - profCorpo / 2);
      else if (fam === 'guia') {
        const prot = s.protrusao, dedos = [];
        this._box(s.larguraCorpo ? Math.min(s.larguraCorpo, W) - 4 : 436, H - 2, Math.max(4, profCorpo), matCorpo, 0, H / 2, zPlacaTras - Math.max(4, profCorpo) / 2);
        if (s.layout.orientacao === 'vertical') {
          const n = s.dedos + 1;
          for (let i = 0; i < s.dedos; i++) dedos.push({ x: i % 2 ? 32 : -32, y: (i + 1) * (H / n), z: F + prot / 2, w: 32, h: 7, d: prot });     // dedos alternados
        } else {
          const n = s.dedos + 1, passo = 440 / n;
          for (let i = 1; i <= s.dedos; i++) dedos.push({ x: -220 + i * passo, y: H / 2, z: F + prot / 2, w: 7, h: H - 6, d: prot });
        }
        this._caixas(dedos, this._mat(0x3b4048, 0.6, 0.5), true);
      } else if (fam === 'bandeja') {
        const prof = s.profundidade - E, matB = this._mat(0x767d8b, 0.7, 0.45);
        const tray = this._box(s.larguraCorpo - 6, 3, prof, matB, 0, s.basculante ? H * 0.28 : 6, zPlacaTras - prof / 2);
        [-1, 1].forEach((sx) => this._box(3, s.basculante ? 26 : 12, prof, matB, sx * (s.larguraCorpo / 2 - 4.5), s.basculante ? H * 0.28 + 12 : 12, zPlacaTras - prof / 2));   // abas laterais
        this._box(s.larguraCorpo - 6, 12, 3, matB, 0, s.basculante ? H * 0.28 + 6 : 12, zPlacaTras - prof + 1.5);                                                         // aba traseira
        if (s.basculante) { tray.rotation.x = 0.16; tray.position.y += 6; }
        const furos = []; for (let i = 0; i < 12; i++) furos.push({ x: -180 + i * 33, y: s.basculante ? H * 0.28 + 1.6 : 7.6, z: zPlacaTras - prof / 2, w: 18, h: 0.4, d: prof * 0.8 });
        this._caixas(furos, matEscuro, false);
      }
      if (s.rackavel && this.opt.parafusos) this._parafusos();
      const dec = this._serigrafia(); if (dec) this.group.add(dec);
    }

    /** Numeracao/rotulos/linhas de grupo da placa (canvas). Sem `document` (Node) => null. */
    _serigrafia() {
      if (typeof document === 'undefined') return null;
      const T = this.THREE, s = this.spec, k = 7, W = s.largura, H = s.alturaMm;
      const cv = document.createElement('canvas'); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
      const c = cv.getContext('2d'); if (!c) return null;
      c.clearRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#f4f6f8'; c.strokeStyle = '#f4f6f8'; c.textBaseline = 'middle';
      const X = (x) => (x + W / 2) * k, Y = (y) => (H - y) * k;
      if (s.familia === 'switch') { c.lineWidth = 0.5 * k; [-220.3, 220.3].forEach((x) => { c.beginPath(); c.moveTo(X(x), Y(0)); c.lineTo(X(x), Y(H)); c.stroke(); }); }
      // [19/09/2026 UTC] NOVO (RODADA 206) -- pedido verbatim: "ao tentar trocar o Keystone de cat6
      // para cat5e, o nome que fica aparecendo no patch panel, no 'Ver em 3D', continua sem mudança."
      // CAUSA RAIZ: o texto da chapa (`s.textos`, montado em `_textosDoPainel`) usa `s.modelo`, um
      // texto ESTÁTICO do catálogo (ex.: 'PP-24 Cat6') -- `spec` é congelado e cacheado por TIPO
      // (`_specCache`, ver `especificar()`), compartilhado por TODOS os patch panels desse tipo, então
      // nunca poderia refletir a categoria escolhida por CADA objeto individualmente (`obj.rede.categoria`)
      // -- mesmo reconstruindo o equipamento do zero (`rebuildObjectIncremental` já fazia isso
      // corretamente), o texto desenhado seria sempre o mesmo. CORRIGIDO aqui, na hora de desenhar o
      // canvas (POR INSTÂNCIA, via `this.opt.categoria` -- ver `Engine3D` passando `obj.rede.categoria`
      // na criação da view): troca só a palavra "CatX" dentro do texto do modelo pela categoria REAL
      // escolhida, sem tocar no `spec` congelado/compartilhado.
      const CAT_ROTULO = { cat5e: 'Cat5e', cat6: 'Cat6', cat6a: 'Cat6A', cat7: 'Cat7' };
      const modeloEfetivo = (s.familia === 'patchpanel' && this.opt.categoria && CAT_ROTULO[this.opt.categoria])
        ? s.modelo.replace(/Cat\w+$/i, CAT_ROTULO[this.opt.categoria]) : null;
      s.textos.forEach((t) => {
        if (t.linha) { c.lineWidth = 0.7 * k; c.beginPath(); c.moveTo(X(t.x1), Y(t.y)); c.lineTo(X(t.x2), Y(t.y)); c.stroke(); return; }
        const txt = modeloEfetivo ? t.txt.replace(s.modelo, modeloEfetivo) : t.txt;
        c.font = 'bold ' + Math.round(t.s * k * 1.15) + 'px Arial, Helvetica, sans-serif';
        c.textAlign = t.align === 'left' ? 'left' : 'center';
        c.fillText(txt, X(t.x), Y(t.y));
      });
      const tex = this._reg(new T.CanvasTexture(cv));
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = 8;
      const mat = this._reg(new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      const m = new T.Mesh(this._reg(new T.PlaneGeometry(W, H)), mat);
      m.position.set(0, H / 2, s.profundidade / 2 + 0.06);
      m.name = 'serigrafia'; m.renderOrder = 2;
      return m;
    }

    /** Posicao (mm, sistema do equipamento) da frente da porta n. */
    portaPosMm(n) { return portaLocal(this.spec.tipo, n); }

    /**
     * Atualiza os LEDs. `estados` = { [n]: 'active'|'idle'|'off' }; `tSeg` = tempo em segundos.
     * active: pisca em verde (pseudo-aleatorio por porta); idle: verde fixo; off: apagado.
     */
    atualizarLeds(estados, tSeg, ligado) {
      const im = this._ledMalha; if (!im) return;
      const C = this._cores, t = tSeg || 0;
      let algumAtivo = false, algumLink = false, sig = ligado ? '1' : '0';
      const s = this.spec;
      for (let i = 1; i <= s.nPortas; i++) { const st = ligado ? (estados[i] || 'off') : 'off'; sig += st[0]; if (st === 'active') algumAtivo = true; if (st !== 'off') algumLink = true; }
      if (!algumAtivo && sig === this._sig) return;
      this._sig = sig;
      const frac = (v) => v - Math.floor(v);
      for (let n = 1; n <= s.nPortas; n++) {
        const idx = this.ledIndice[n]; if (idx == null) continue;
        const st = ligado ? (estados[n] || 'off') : 'off';
        let cor = C.off;
        if (st === 'idle') cor = C.on;
        else if (st === 'active') cor = frac(Math.sin(n * 12.9898 + Math.floor(t * 9 + n * 3.7) * 78.233) * 43758.5453) > 0.35 ? C.on : C.dim;
        im.setColorAt(idx, cor);
      }
      const sys = { syst: ligado ? C.on : C.off, rps: C.off, stat: ligado ? C.on : C.off, duplx: (ligado && algumLink) ? C.on : C.off, speed: (ligado && algumAtivo) ? C.amb : C.off };
      Object.keys(this.ledSys).forEach((id) => im.setColorAt(this.ledSys[id], sys[id] || C.off));
      im.instanceColor.needsUpdate = true;
    }

    dispose() {
      this._disp.forEach((o) => { try { if (o.map && o.map.dispose) o.map.dispose(); o.dispose(); } catch (e) { /* ok */ } });
      this._disp = [];
      if (this._ledMalha && this._ledMalha.dispose) this._ledMalha.dispose();
    }
  }

  const API = {
    REDE_CATALOGO, LED_ESTILOS, REDE_LED_CSS, especificar, portaLocal,
    EquipamentoRede, Switch24, Switch48, PatchPanel24, PatchPanel48, criar,
    ehEquipRede, ehSwitch, ehAP, ehRackavel, ehNobreak, ehStorage, garantirRede, patchParaObjeto, descritorPorta, diametroCabo,
    pinosRJ45, pinoLocalRJ45, classificarLigacao,   // [19/09/2026 UTC] NOVO (RODADA 200)
    diametroFeixe, generateRearChicote, generateSuperFeixeVertical,   // [19/09/2026 UTC] NOVO (RODADA 205)
    baiaInserir, baiaRemover, storageResumo, upsCarga,   // [19/09/2026 UTC] NOVO (RODADA 174)
    TIPOS_RACKAVEIS: Object.keys(REDE_CATALOGO.TIPOS).filter((k) => REDE_CATALOGO.TIPOS[k].rackavel !== false),
    cabosDoObjeto, caboDaPorta, outroLado, statusEfetivo, estadosDasPortas,
    conectar, desconectar, desconectarPorta, removerCabosDoObjeto, notificarMudanca, aoMudar: null,
    equipDoRack, primeiraULivre, pontoDentroDoRack, instalarNoRack, retirarDoRack, sincronizarUm, sincronizarNoRack,
    autoSnapAoColocar, criarNoRack, previaNoRack,
    REDE_SCRIPT_SWITCH, REDE_SCRIPT_PATCH, componentesPadrao,
    RedeEquipView3D,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.RedeEquip = API;
})(typeof window !== 'undefined' ? window : globalThis);
