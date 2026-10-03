/**
 * hardware-sim.js — "Motor de simulação" do 🖥️ Simulador de Montagem e Manutenção de Hardware.
 *
 * [28/09/2026 UTC] NOVO — pedido verbatim (resumo): "simulador 3D interativo de montagem e
 * manutenção de hardware (PC, Notebook, Workstation, Servidor) com peças trocáveis..., cabos
 * dinâmicos, sistema de encaixe/snap". Este arquivo NÃO duplica dados (isso é js/hardware-catalog.js
 * — `window.HardwareCatalog`) e NÃO duplica funcionalidade que qualquer objeto do mapa já ganha de
 * graça do motor de Scripts (`js/automation.js`/`js/scripts-docs.js`, `SelectionCollection`) e do
 * `SceneObjects` (js/sceneobjects.js): abrir/fechar tampa, ligar/desligar, esconder/mostrar,
 * destacar, animar propriedades — tudo isso o objeto de hardware herda GRÁTIS por já ser um objeto
 * NORMAL do mapa (mesmo padrão de rack/switch em js/rede-equip.js), contanto que:
 *   - um filho seu (a "tampa lateral do gabinete") tenha a classe `.tampa` -- daí
 *     `Select('#meuPc').abrirTampa()`/`.fecharTampa()` (js/automation.js `_comTampas`) já funcionam
 *     exatamente como documentado em `js/scripts-docs.js`;
 *   - o campo `obj.rede = { ligado, ... }` já é lido por `.ligar()`/`.desligar()` do mesmo jeito que
 *     Access Point/Rack usam hoje (reaproveitado aqui pra "ligar a fonte" -- ver `Componente`).
 *
 * O que ESTE arquivo cobre, de verdade (a parte ESPECÍFICA de hardware, que nada genérico do app
 * resolve sozinho):
 *   1) `Componente`       — uma peça INSTALADA numa montagem (par {família, chave de HardwareCatalog}
 *                           + estado de runtime: instalada/danificada/temperatura simulada).
 *   2) `GerenciadorCabos` — cabos INTERNOS da montagem (fonte->placa-mãe 24p, fonte->drives SATA,
 *                           fonte->offboard 12VHPWR/6+2 PCIe) desenhados com `THREE.CatmullRomCurve3`
 *                           + `THREE.TubeGeometry` -- MESMA técnica de `js/engine3d-rede-mesh.js`
 *                           (`_curvaDeRotaCabo`/`rebuildCabos`) e `js/patch-cord.js` (linhas 443-445:
 *                           `new THREE.CatmullRomCurve3(vs, false, 'catmullrom', 0.5)` seguido de
 *                           `new THREE.TubeGeometry(curva, ...)`) -- mas MAIS SIMPLES/independente:
 *                           como estes cabos vivem DENTRO de um único objeto (não conectam objetos
 *                           DIFERENTES do mapa como `map.cabos` faz para rede), não passam pelo
 *                           pipeline `Engine3D.rebuildCabos()` (que depende de `window.RedeEquip` e
 *                           dos pontos de porta específicos de equipamento de rack) -- têm sua
 *                           própria rota curta ponto-a-ponto dentro do gabinete. Ver "O QUE FICOU
 *                           SIMPLIFICADO" no cabeçalho da janela de documentação (hardware-docs.js).
 *   3) `HardwareSimulator` — fachada: monta/desmonta peças (delegando validação a
 *                           `HardwareCatalog.ehCompativel`/`.validarMontagem`), controla o
 *                           SISTEMA DE SNAP POR ÂNCORAS (pedido verbatim: "Deve haver um SISTEMA
 *                           DE SNAP (ANCHORS PARA ACESSÓRIOS) para encaixar as peças no
 *                           dispositivo respectivo") -- `listarAncoras()`/`encaixeMaisProximo()`/
 *                           `tentarEncaixar()` (ver comentários grandes de cada um mais abaixo;
 *                           as âncoras em si são os pontos de `ANCORAS`/`PERFIL_SLOTS`), e
 *                           expõe `construirMalhaPlaceholder()` -- a geometria 3D PROCEDURAL simples
 *                           (caixas/cilindros proporcionais, sem textura/detalhe realista -- pedido
 *                           explícito do usuário de manter placeholder nesta rodada) usada como
 *                           preview de cada peça dentro do gabinete/notebook/workstation/servidor.
 *
 * Módulo UMD, igual ao resto do projeto (window.HardwareSimulator / module.exports).
 */
(function (raiz) {
  'use strict';

  const HC = raiz.HardwareCatalog || (typeof require === 'function' ? require('./hardware-catalog.js') : null);
  if (!HC) throw new Error('[HardwareSimulator] js/hardware-catalog.js precisa ser carregado antes deste arquivo.');

  // ==========================================================================================
  // 1) Componente — uma peça instalada (referência de catálogo + estado de runtime)
  // ==========================================================================================
  /**
   * @param {string} familia 'fonte'|'placaMae'|'cpu'|'ram'|'armazenamento'|'offboard'
   * @param {string} chave   chave dentro do catálogo daquela família (ex.: 'cpu_i5_1700')
   * @param {object} [opts]  { instalada=true, danificada=false, slot=null }
   */
  function Componente(familia, chave, opts) {
    const dados = HC.CATALOGOS[familia] && HC.CATALOGOS[familia][chave];
    if (!dados) throw new Error(`[Componente] chave desconhecida: ${familia}/${chave}`);
    this.familia = familia;
    this.chave = chave;
    this.dados = dados; // referência CONGELADA do catálogo -- nunca mutar (ver header do hardware-catalog.js)
    this.instalada = !opts || opts.instalada !== false;
    this.danificada = !!(opts && opts.danificada);
    this.slot = (opts && opts.slot) || null; // índice/rótulo do encaixe físico ocupado (ver PERFIL_SLOTS)
    // "Temperatura simulada" (°C) -- só um número que sobe devagar quando `ligado` e desce quando
    // não, usado pra colorir o LED/heatsink no placeholder 3D (efeito visual, sem física real).
    this._temperaturaC = 25;
  }
  Componente.prototype.tick = function tick(ligado, deltaSegundos) {
    const alvo = ligado ? (25 + (this.dados.tdp || this.dados.watts || 10) * 0.35) : 25;
    const passo = Math.max(0.02, Math.min(1, deltaSegundos || 0.05));
    this._temperaturaC += (alvo - this._temperaturaC) * passo;
    return this._temperaturaC;
  };

  // ==========================================================================================
  // 2) PERFIL_SLOTS — posições LOCAIS (metros, dentro do gabinete) dos encaixes físicos, por
  //    chassi + família. Usadas tanto pra desenhar o placeholder na posição certa quanto pro
  //    "sistema de encaixe/snap" (§4). Coordenadas ilustrativas/proporcionais (não são um layout
  //    de ATX real medido -- ver "O QUE FICOU SIMPLIFICADO" na documentação).
  // ==========================================================================================
  // "ANCORAS" é o nome público (pedido verbatim: "Deve haver um SISTEMA DE SNAP (ANCHORS PARA
  // ACESSÓRIOS) para encaixar as peças no dispositivo respectivo") pro mesmo dado que
  // `PERFIL_SLOTS` já guardava — mantido como alias (ver `const ANCORAS = PERFIL_SLOTS;` logo
  // abaixo da definição) pra não duplicar o objeto, só deixar o VOCABULÁRIO do sistema de snap
  // (`listarAncoras`/`encaixeMaisProximo`/`tentarEncaixar`, mais abaixo) explícito. Cada família
  // de peça (`familia`, mesmo nome usado em `HardwareCatalog`/`this.pecas`) tem sua CHAVE aqui —
  // EXCETO `armazenamento`, que usa a chave `drive` (nome mais curto, história do arquivo) — ver
  // `FAMILIA_PARA_ANCORA` logo abaixo, que faz essa tradução pra quem só conhece o nome de
  // família do catálogo.
  const PERFIL_SLOTS = {
    pc_gabinete: {
      placaMae: [{ x: 0, y: 0.15, z: -0.08 }],
      fonte: [{ x: 0.07, y: 0.38, z: -0.15 }],
      cpu: [{ x: 0, y: 0.2, z: -0.06 }], // relativo à placa-mãe
      ram: [{ x: 0.03, y: 0.25, z: -0.05 }, { x: 0.045, y: 0.25, z: -0.05 }, { x: 0.06, y: 0.25, z: -0.05 }, { x: 0.075, y: 0.25, z: -0.05 }],
      drive: [{ x: -0.06, y: 0.32, z: 0.12 }, { x: -0.06, y: 0.28, z: 0.12 }, { x: -0.06, y: 0.24, z: 0.12 }, { x: -0.06, y: 0.2, z: 0.12 }, { x: -0.06, y: 0.16, z: 0.12 }, { x: -0.06, y: 0.12, z: 0.12 }],
      offboard: [{ x: -0.03, y: 0.1, z: -0.05 }, { x: -0.03, y: 0.13, z: -0.05 }, { x: -0.03, y: 0.16, z: -0.05 }, { x: -0.03, y: 0.19, z: -0.05 }, { x: -0.03, y: 0.22, z: -0.05 }, { x: -0.03, y: 0.25, z: -0.05 }, { x: -0.03, y: 0.28, z: -0.05 }],
    },
    workstation: {
      placaMae: [{ x: 0, y: 0.17, z: -0.1 }], fonte: [{ x: 0.08, y: 0.42, z: -0.18 }],
      cpu: [{ x: 0, y: 0.22, z: -0.08 }],
      ram: [{ x: 0.035, y: 0.28, z: -0.06 }, { x: 0.05, y: 0.28, z: -0.06 }, { x: 0.065, y: 0.28, z: -0.06 }, { x: 0.08, y: 0.28, z: -0.06 }],
      drive: Array.from({ length: 8 }, (_, i) => ({ x: -0.07, y: 0.36 - i * 0.038, z: 0.14 })),
      offboard: Array.from({ length: 7 }, (_, i) => ({ x: -0.035, y: 0.1 + i * 0.03, z: -0.06 })),
    },
    servidor_rack: {
      placaMae: [{ x: 0, y: 0.02, z: -0.2 }], fonte: [{ x: 0.18, y: 0.02, z: -0.3 }, { x: 0.22, y: 0.02, z: -0.3 }],
      cpu: [{ x: -0.05, y: 0.03, z: -0.15 }, { x: 0.05, y: 0.03, z: -0.15 }],
      ram: Array.from({ length: 8 }, (_, i) => ({ x: -0.15 + i * 0.02, y: 0.04, z: -0.1 })),
      drive: Array.from({ length: 12 }, (_, i) => ({ x: -0.2 + i * 0.035, y: 0.02, z: 0.32 })),
      offboard: Array.from({ length: 4 }, (_, i) => ({ x: -0.1 + i * 0.06, y: 0.02, z: -0.02 })),
    },
    notebook: {
      // Notebook não tem fonte/offboard trocável -- só placa (soldada), RAM SO-DIMM e 1 drive M.2.
      placaMae: [{ x: 0, y: 0.005, z: 0 }],
      cpu: [{ x: 0, y: 0.006, z: -0.02 }],
      ram: [{ x: -0.03, y: 0.006, z: 0.05 }, { x: 0.03, y: 0.006, z: 0.05 }],
      drive: [{ x: 0, y: 0.006, z: 0.09 }],
      fonte: [], offboard: [],
    },
  };
  /** Alias público — ver comentário grande acima de `PERFIL_SLOTS`. */
  const ANCORAS = PERFIL_SLOTS;
  /** Traduz o nome de FAMÍLIA (`HardwareCatalog`/`this.pecas`, ex. `'armazenamento'`) pro nome da
   *  CHAVE dentro de `ANCORAS`/`PERFIL_SLOTS` (ex. `'drive'`) — hoje só `armazenamento`/`drive`
   *  divergem; as outras 5 famílias usam o mesmo nome nos dois lados. Usada por TODO método que
   *  precisa achar âncoras a partir de um nome de família (ver `listarAncoras`/
   *  `encaixeMaisProximo`/`tentarEncaixar` abaixo) — nenhum deles deve indexar `ANCORAS` com o
   *  nome de família cru sem passar por aqui primeiro (bug real corrigido nesta rodada: antes
   *  `encaixeMaisProximo('armazenamento', ...)` não achava NENHUMA âncora, sempre devolvia `null`,
   *  porque `ANCORAS[chassi].armazenamento` nunca existiu — só `ANCORAS[chassi].drive`). */
  const FAMILIA_PARA_ANCORA = Object.freeze({ armazenamento: 'drive' });
  function chaveAncora(familia) { return FAMILIA_PARA_ANCORA[familia] || familia; }

  // ==========================================================================================
  // 3) GerenciadorCabos — cabos internos (fonte<->placa-mãe/drives/offboard), placeholder de tubo
  // ==========================================================================================
  /** @param {object} THREE instância do Three.js já carregada pelo app (window.THREE/r160+) */
  function GerenciadorCabos(THREE) {
    this.THREE = THREE;
    this.grupo = new THREE.Group();
    this.grupo.name = 'hardware-cabos-internos';
    this._cabos = []; // [{ id, tipo, de, para, mesh }]
  }
  /** Cores por tipo de cabo interno -- mesmo espírito de `RedeEquip.REDE_CATALOGO.CABOS` (cor
   *  padrão de fábrica por categoria de cabo), aqui restrito aos tipos internos de PC/servidor. */
  GerenciadorCabos.CORES = Object.freeze({
    atx24: 0x1f2b3a, atx4_8: 0x1a1a1a, sata_dados: 0xb03030, sata_energia: 0xd9d9d9, '12vhpwr': 0x111318, pciE_energia: 0x222222,
  });
  /**
   * Adiciona um cabo interno curto entre dois pontos LOCAIS (Vector3-like {x,y,z}, metros, mesmo
   * espaço do gabinete) -- curva Catmull-Rom com uma leve "barriga" no meio (mesma técnica de
   * `js/patch-cord.js` linha ~443: `new THREE.CatmullRomCurve3(vs, false, 'catmullrom', 0.5)`)
   * seguida de `THREE.TubeGeometry`, exatamente como `js/engine3d-rede-mesh.js` desenha cabos de
   * rede -- só que aqui os pontos de controle são fixos (não seguem rota por zonas-guia, pois o
   * cabo vive todo dentro do mesmo objeto pequeno).
   */
  GerenciadorCabos.prototype.adicionar = function adicionar(id, tipo, de, para, raioTuboM) {
    const THREE = this.THREE;
    const meio = { x: (de.x + para.x) / 2, y: (de.y + para.y) / 2 + 0.01, z: (de.z + para.z) / 2 };
    const vs = [de, meio, para].map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curva = new THREE.CatmullRomCurve3(vs, false, 'catmullrom', 0.5);
    const geo = new THREE.TubeGeometry(curva, 12, raioTuboM || 0.0025, 6, false);
    const cor = GerenciadorCabos.CORES[tipo] || 0x333333;
    const mat = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.7, metalness: 0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'cabo-interno-' + id;
    mesh.userData = { hardwareCaboId: id, tipo };
    this.grupo.add(mesh);
    this._cabos.push({ id, tipo, de, para, mesh });
    return mesh;
  };
  GerenciadorCabos.prototype.limpar = function limpar() {
    this._cabos.forEach((c) => { c.mesh.geometry?.dispose?.(); c.mesh.material?.dispose?.(); this.grupo.remove(c.mesh); });
    this._cabos = [];
  };
  /** Reconstrói o "chicote padrão" de uma montagem (fonte -> placa-mãe, fonte -> cada drive, fonte
   *  -> cada offboard que exija conector de energia) a partir dos slots ocupados -- chamado depois
   *  de qualquer `HardwareSimulator.instalar/remover`. */
  GerenciadorCabos.prototype.reconstruirDaMontagem = function reconstruirDaMontagem(chassiKey, montagem) {
    this.limpar();
    const slots = PERFIL_SLOTS[chassiKey];
    if (!slots || !montagem.fonte || !slots.fonte.length) return; // notebook: sem fonte interna, sem chicote
    const origemFonte = slots.fonte[0];
    if (montagem.placaMae) {
      const destino = slots.placaMae[0];
      this.adicionar('psu-mb', 'atx24', origemFonte, destino, 0.004);
    }
    (montagem.armazenamento || []).forEach((chaveDrive, i) => {
      const destino = slots.drive[i] || slots.drive[slots.drive.length - 1];
      if (destino) this.adicionar('psu-drive-' + i, 'sata_energia', origemFonte, destino, 0.0022);
    });
    (montagem.offboard || []).forEach((chaveOff, i) => {
      const off = HC.OFFBOARD[chaveOff];
      if (!off || !off.exigeConectorPsu) return; // só GPUs "de topo" puxam cabo de energia extra
      const destino = slots.offboard[i] || slots.offboard[slots.offboard.length - 1];
      if (destino) this.adicionar('psu-offboard-' + i, '12vhpwr', origemFonte, destino, 0.003);
    });
  };

  // ==========================================================================================
  // 4) HardwareSimulator — fachada: montar/desmontar + snap + placeholder 3D
  // ==========================================================================================
  /**
   * @param {string} chassiKey chave de `HardwareCatalog.CHASSIS`
   * @param {object} [montagemInicial] mesmo formato de `HardwareCatalog.validarMontagem` (chaves
   *   de catálogo, não instâncias de `Componente` -- o Simulator cria os `Componente`s internamente)
   */
  function HardwareSimulator(chassiKey, montagemInicial) {
    if (!HC.CHASSIS[chassiKey]) throw new Error('[HardwareSimulator] chassi desconhecido: ' + chassiKey);
    this.chassiKey = chassiKey;
    this.chassi = HC.CHASSIS[chassiKey];
    /** @type {{fonte:Componente|null, placaMae:Componente|null, cpu:Componente|null, ram:Componente[], armazenamento:Componente[], offboard:Componente[]}} */
    this.pecas = { fonte: null, placaMae: null, cpu: null, ram: [], armazenamento: [], offboard: [] };
    this.ligado = false;
    this._cabos = null; // GerenciadorCabos, criado sob demanda em `anexarView3D`
    if (montagemInicial) this.montarDeChaves(montagemInicial);
  }

  /** Monta a partir de um objeto de CHAVES de catálogo (formato de `validarMontagem`) -- valida
   *  tudo primeiro (não instala nada se houver problema BLOQUEANTE; avisos passam). */
  HardwareSimulator.prototype.montarDeChaves = function montarDeChaves(m) {
    const r = HC.validarMontagem(Object.assign({ chassi: this.chassiKey }, m));
    if (!r.ok) return { ok: false, problemas: r.problemas };
    if (m.fonte) this.pecas.fonte = new Componente('fonte', m.fonte);
    if (m.placaMae) this.pecas.placaMae = new Componente('placaMae', m.placaMae);
    if (m.cpu) this.pecas.cpu = new Componente('cpu', m.cpu);
    this.pecas.ram = (m.ram || []).map((k) => new Componente('ram', k));
    this.pecas.armazenamento = (m.armazenamento || []).map((k) => new Componente('armazenamento', k));
    this.pecas.offboard = (m.offboard || []).map((k) => new Componente('offboard', k));
    if (this._cabos) this._cabos.reconstruirDaMontagem(this.chassiKey, m);
    return { ok: true, problemas: r.problemas }; // problemas aqui só contém AVISO:* (validarMontagem já teria bloqueado o resto)
  };

  /** Instala UMA peça nova, validando contra o que já está montado (não revalida a montagem
   *  inteira -- mais barato pra UI "arrastar peça -> soltar no slot"). Devolve `{ok, motivo}`.
   *  `slotPreferido` (opcional, só relevante pras famílias de VÁRIAS vias — `ram`/
   *  `armazenamento`/`offboard`) é o índice de ÂNCORA (ver `ANCORAS`/`listarAncoras`) que a peça
   *  deve OCUPAR — normalmente vem de `tentarEncaixar` (a âncora que o snap achou mais perto de
   *  onde o usuário soltou a peça); se não vier (chamada direta, sem passar pelo snap — ex. UI de
   *  lista simples "adicionar RAM"), usa a 1ª âncora LIVRE, em ordem (comportamento de sempre). Em
   *  qualquer um dos dois casos, o índice é GRAVADO em `comp.slot` — é ele (não a posição na lista
   *  `this.pecas[familia]`) que decide onde a peça é desenhada em `construirGrupo3D`, então uma
   *  peça encaixada na âncora #2 continua aparecendo lá mesmo se, depois, uma OUTRA peça for
   *  instalada na #0. */
  HardwareSimulator.prototype.instalar = function instalar(familia, chave, slotPreferido) {
    if (familia === 'placaMae') {
      const r = HC.ehCompativel({ familia: 'chassi', chave: this.chassiKey }, { familia, chave });
      if (!r.ok) return r;
      this.pecas.placaMae = new Componente(familia, chave, { slot: 0 });
      return { ok: true, motivo: '' };
    }
    if (!this.pecas.placaMae && familia !== 'fonte') return { ok: false, motivo: 'Instale a placa-mãe antes.' };
    if (familia === 'cpu' || familia === 'ram' || familia === 'armazenamento' || familia === 'offboard') {
      const r = HC.ehCompativel({ familia: 'placaMae', chave: this.pecas.placaMae.chave }, { familia, chave });
      if (!r.ok) return r;
    }
    if (familia === 'offboard' && this.pecas.fonte) {
      const rf = HC.ehCompativel({ familia: 'fonte', chave: this.pecas.fonte.chave }, { familia, chave });
      if (!rf.ok) return rf;
    }
    if (familia === 'cpu') { this.pecas.cpu = new Componente(familia, chave, { slot: 0 }); }
    else if (familia === 'fonte') { this.pecas.fonte = new Componente(familia, chave, { slot: 0 }); }
    else if (familia === 'ram' || familia === 'armazenamento' || familia === 'offboard') {
      const enc = HC.encaixesValidos(this.chassi, familia === 'ram' ? 'placaMae' : familia, this.pecas[familia].length);
      // RAM usa o limite de slots da PRÓPRIA placa-mãe (não do chassi -- ver validarMontagem), então
      // checa direto contra `placaMae.slotsRam` aqui, mantendo `encaixesValidos` só pra chassi.
      if (familia === 'ram') {
        const limite = this.pecas.placaMae.dados.slotsRam;
        if (this.pecas.ram.length >= limite) return { ok: false, motivo: `Placa-mãe já tem os ${limite} slot(s) de RAM ocupados.` };
      } else if (enc.livres <= 0) return { ok: false, motivo: `Chassi não tem mais encaixe livre pra "${familia}".` };
      const ocupados = new Set(this.pecas[familia].map((c) => c.slot));
      let slot = slotPreferido;
      if (slot == null || ocupados.has(slot)) {
        const total = (ANCORAS[this.chassiKey] && ANCORAS[this.chassiKey][chaveAncora(familia)] || []).length;
        slot = 0;
        while (ocupados.has(slot) && slot < total) slot++;
      }
      this.pecas[familia].push(new Componente(familia, chave, { slot }));
    }
    if (this._cabos) this._cabos.reconstruirDaMontagem(this.chassiKey, this.paraChaves());
    return { ok: true, motivo: '' };
  };

  /** Remove uma peça (índice só relevante pra RAM/armazenamento/offboard, que são arrays — é o
   *  índice DENTRO DA LISTA `this.pecas[familia]`, NÃO o índice da âncora `comp.slot`; use
   *  `listarAncoras`/o próprio array `this.pecas[familia]` pra achar qual índice de LISTA
   *  corresponde à âncora que o usuário clicou/arrastou pra fora). A âncora ocupada por ela é
   *  liberada automaticamente — `listarAncoras`/`encaixeMaisProximo` recalculam ocupação a partir
   *  dos `comp.slot` que SOBRARAM, nunca de um contador solto. */
  HardwareSimulator.prototype.remover = function remover(familia, indice) {
    if (familia === 'cpu') this.pecas.cpu = null;
    else if (familia === 'fonte') this.pecas.fonte = null;
    else if (familia === 'placaMae') { this.pecas.placaMae = null; this.pecas.cpu = null; this.pecas.ram = []; this.pecas.armazenamento = []; this.pecas.offboard = []; }
    else if (Array.isArray(this.pecas[familia])) this.pecas[familia].splice(indice, 1);
    if (this._cabos) this._cabos.reconstruirDaMontagem(this.chassiKey, this.paraChaves());
  };

  /** Serializa a montagem atual de volta pro formato "de chaves" (o que `obj.hardware.montagem`
   *  guarda no mapa -- ver `_DEFAULT_HARDWARE_SCRIPT_CODE` mais abaixo). */
  HardwareSimulator.prototype.paraChaves = function paraChaves() {
    return {
      fonte: this.pecas.fonte && this.pecas.fonte.chave,
      placaMae: this.pecas.placaMae && this.pecas.placaMae.chave,
      cpu: this.pecas.cpu && this.pecas.cpu.chave,
      ram: this.pecas.ram.map((c) => c.chave),
      armazenamento: this.pecas.armazenamento.map((c) => c.chave),
      offboard: this.pecas.offboard.map((c) => c.chave),
    };
  };

  HardwareSimulator.prototype.validar = function validar() {
    return HC.validarMontagem(Object.assign({ chassi: this.chassiKey }, this.paraChaves()));
  };

  /** Lista TODAS as âncoras (pontos de encaixe físicos) de uma família, pro chassi desta
   *  montagem, já marcando quais estão ocupadas (pedido verbatim: "SISTEMA DE SNAP (ANCHORS PARA
   *  ACESSÓRIOS) para encaixar as peças no dispositivo respectivo") — útil pra UI desenhar
   *  marcadores visuais de "onde dá pra encaixar" (ex.: destacar em verde as âncoras livres
   *  enquanto o usuário arrasta uma peça compatível, vermelho/nada nas ocupadas). Devolve
   *  `[]` se o chassi não tem NENHUMA âncora pra essa família (ex. `fonte`/`offboard` num
   *  `notebook`, que não são trocáveis — ver `PERFIL_SLOTS.notebook`). */
  HardwareSimulator.prototype.listarAncoras = function listarAncoras(familia) {
    const chave = chaveAncora(familia);
    const ancoras = ANCORAS[this.chassiKey] && ANCORAS[this.chassiKey][chave];
    if (!ancoras || !ancoras.length) return [];
    const ocupados = this._slotsOcupados(familia);
    return ancoras.map((ponto, indice) => ({ indice, ponto, ocupada: ocupados.has(indice) }));
  };

  /** Devolve o SET de índices de âncora (`comp.slot`) realmente ocupados por peças desta família —
   *  não mais "as N primeiras em ordem": uma peça pode estar na âncora #2 mesmo com só 1 peça
   *  instalada (ex.: veio de `tentarEncaixar`, arrastada até uma âncora específica). Peças de 1
   *  via só (`fonte`/`placaMae`/`cpu`) sempre ocupam a âncora #0 quando presentes. `comp.slot ==
   *  null` (não deveria acontecer -- `instalar` sempre atribui um -- mas cai pra 0 por segurança,
   *  já que é o formato de peças bem antigas/de fora deste módulo). Interno — quem quiser a lista
   *  pronta com `ocupada` já calculado deve chamar `listarAncoras` acima. */
  HardwareSimulator.prototype._slotsOcupados = function _slotsOcupados(familia) {
    if (familia === 'ram' || familia === 'armazenamento' || familia === 'offboard') {
      return new Set(this.pecas[familia].map((c) => (c.slot == null ? 0 : c.slot)));
    }
    return this.pecas[familia] ? new Set([0]) : new Set();
  };

  /**
   * "Sistema de encaixe/snap" — pedido verbatim. `pontoSegurado` = posição LOCAL (metros, dentro
   * do gabinete) de onde o usuário está arrastando a peça (ex.: ponta do raycaster projetada no
   * plano do gabinete). Devolve a ÂNCORA livre mais próxima dentro do raio de captura (padrão
   * 3cm) pra família/chassi, ou `null` se nenhuma estiver perto o bastante -- distância vetorial
   * 3D simples (sem física, sem colisão -- é um ímã visual, igual ao "encaixe" de abraçadeira em
   * `RedePassiva.agruparFeixes`, só que aqui pra POSICIONAR uma peça, não agrupar cabos). Só
   * ENCONTRA a âncora — não instala nada; use `tentarEncaixar` (mais abaixo) pra achar E instalar
   * de uma vez (o fluxo normal de "soltar a peça arrastada").
   */
  HardwareSimulator.prototype.encaixeMaisProximo = function encaixeMaisProximo(familia, pontoSegurado, raioCapturaM) {
    return this.listarAncoras(familia).reduce((melhor, a) => {
      if (a.ocupada) return melhor;
      const dx = a.ponto.x - pontoSegurado.x, dy = a.ponto.y - pontoSegurado.y, dz = a.ponto.z - pontoSegurado.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > (raioCapturaM || 0.03)) return melhor;
      if (melhor && melhor.distancia <= d) return melhor;
      return { indice: a.indice, ponto: a.ponto, distancia: d };
    }, null);
  };

  /**
   * Encontra a âncora livre mais próxima de `pontoSegurado` (ver `encaixeMaisProximo` acima) E,
   * se achar uma dentro do raio de captura, JÁ INSTALA a peça ali (delegando a validação de
   * compatibilidade pra `instalar`, que pode recusar por incompatibilidade mesmo com âncora
   * livre — ex.: RAM DDR5 perto de uma âncora de placa-mãe DDR4). Este é o ponto de entrada ÚNICO
   * recomendado pro fluxo "usuário arrasta peça e solta perto do gabinete": devolve
   * `{ ok, motivo, ancora }` — quando `ok` é `true`, `ancora.ponto` é a posição LOCAL exata
   * `{x,y,z}` (mesmo espaço de `PERFIL_SLOTS`) pra onde a malha da peça deve ser movida
   * MAGNETICAMENTE (pedido verbatim: "mova-o magneticamente para a posição exata (x, y, z) da
   * âncora correspondente") — quem desenha a peça (futuro `Engine3D`/preview de drag) só precisa
   * copiar `ancora.ponto` pra `mesh.position` do grupo pai já posicionado no chassi.
   */
  HardwareSimulator.prototype.tentarEncaixar = function tentarEncaixar(familia, chave, pontoSegurado, raioCapturaM) {
    const ancora = this.encaixeMaisProximo(familia, pontoSegurado, raioCapturaM);
    if (!ancora) return { ok: false, motivo: 'Nenhuma âncora livre dentro do raio de captura pra "' + familia + '".', ancora: null };
    // Passa `ancora.indice` como slot PREFERIDO pra `instalar` -- é ele quem grava `comp.slot`,
    // então a peça fica de fato registrada na âncora que o snap encontrou (não na "próxima livre
    // em ordem"), e é essa mesma âncora que `construirGrupo3D` vai usar pra posicioná-la no 3D.
    const r = this.instalar(familia, chave, ancora.indice);
    if (!r.ok) return { ok: false, motivo: r.motivo, ancora: null };
    return { ok: true, motivo: '', ancora };
  };

  /** Liga/desliga (mesmo campo `obj.rede.ligado` que Access Point/Rack já leem -- ver header do
   *  arquivo). `deltaSegundos` opcional avança a simulação de temperatura de cada peça instalada
   *  (chamado a cada quadro pela view, se quiser o efeito de heatsink/LED esquentando). */
  HardwareSimulator.prototype.ligar = function ligar() { this.ligado = true; return this; };
  HardwareSimulator.prototype.desligar = function desligar() { this.ligado = false; return this; };
  HardwareSimulator.prototype.tick = function tick(deltaSegundos) {
    const todas = [this.pecas.cpu, this.pecas.fonte, ...this.pecas.offboard].filter(Boolean);
    todas.forEach((c) => c.tick(this.ligado, deltaSegundos));
    return todas.map((c) => ({ familia: c.familia, chave: c.chave, temperaturaC: c._temperaturaC }));
  };

  /** Cria/associa o `GerenciadorCabos` (precisa de THREE -- normalmente chamado 1x quando a view
   *  3D do objeto é construída, ver `js/engine3d.js`/futuros hooks de `_buildHardwareMesh`). */
  HardwareSimulator.prototype.anexarView3D = function anexarView3D(THREE) {
    this._cabos = new GerenciadorCabos(THREE);
    this._cabos.reconstruirDaMontagem(this.chassiKey, this.paraChaves());
    return this._cabos;
  };

  // ------------------------------------------------------------------------------------------
  // Geometria PLACEHOLDER (caixas/cilindros proporcionais) -- pedido explícito do usuário de NÃO
  // tentar modelar peças realistas nesta rodada. Cada `construir*` devolve um `THREE.Mesh`/`Group`
  // pronto pra `add()` num grupo pai já posicionado no slot (ver PERFIL_SLOTS).
  // ------------------------------------------------------------------------------------------
  const COR_PLACEHOLDER = Object.freeze({
    fonte: 0x2b2f36, placaMae: 0x0e5c3a, cpu: 0xb0b6c0, ram: 0x1c8f4a,
    armazenamento: 0x1a1d22, offboard: 0x2f343b,
  });
  /** `familia` decide a PROPORÇÃO da caixa (não o tamanho real em mm -- placeholder). */
  function construirMalhaPlaceholder(THREE, familia, dados) {
    const cor = COR_PLACEHOLDER[familia] || 0x8a92a3;
    const mat = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.6, metalness: 0.25 });
    let geo;
    switch (familia) {
      case 'placaMae': geo = new THREE.BoxGeometry(0.19, 0.003, 0.24); break; // "PCB" fina, plana
      case 'fonte': geo = new THREE.BoxGeometry(0.14, 0.086, 0.14); break; // caixa cúbica de PSU
      case 'cpu': geo = new THREE.BoxGeometry(0.04, 0.006, 0.04); break; // pastilha pequena e fina
      case 'ram': geo = new THREE.BoxGeometry(0.005, 0.03, 0.13); break; // pente fino e alto
      case 'armazenamento': {
        const f = dados && dados.formato;
        if (f === 'M2') geo = new THREE.BoxGeometry(0.022, 0.0022, 0.08);
        else if (f === '2.5') geo = new THREE.BoxGeometry(0.07, 0.0095, 0.1);
        else geo = new THREE.BoxGeometry(0.102, 0.0254, 0.147); // 3.5"
        break;
      }
      case 'offboard': geo = new THREE.BoxGeometry(0.02, 0.06, 0.18); break; // placa vertical (perfil PCIe)
      default: geo = new THREE.BoxGeometry(0.05, 0.02, 0.05);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.hardwarePlaceholder = true;
    mesh.userData.familia = familia;
    return mesh;
  }

  /** Constrói o grupo 3D INTEIRO de uma montagem (placeholder de cada peça posicionada pelo
   *  PERFIL_SLOTS do chassi) + o chicote de cabos (se `anexarView3D` já foi chamado). Pensado pra
   *  ser chamado de dentro de um futuro `Engine3D._buildHardwareMesh(obj)` (ver nota no topo do
   *  arquivo e "Integração com o motor 3D" em hardware-docs.js) -- aqui fica desacoplado de
   *  `engine3d.js` de propósito, pra este arquivo continuar testável fora do navegador (`node
   *  --check`, sem depender de canvas/WebGL). */
  HardwareSimulator.prototype.construirGrupo3D = function construirGrupo3D(THREE) {
    const grupo = new THREE.Group();
    grupo.name = 'hardware-montagem-' + this.chassiKey;
    const slots = PERFIL_SLOTS[this.chassiKey] || {};
    const pos = (m, s) => { if (!s) return; m.position.set(s.x, s.y, s.z); grupo.add(m); };
    if (this.pecas.placaMae) pos(construirMalhaPlaceholder(THREE, 'placaMae', this.pecas.placaMae.dados), slots.placaMae && slots.placaMae[0]);
    if (this.pecas.fonte) pos(construirMalhaPlaceholder(THREE, 'fonte', this.pecas.fonte.dados), slots.fonte && slots.fonte[0]);
    if (this.pecas.cpu) pos(construirMalhaPlaceholder(THREE, 'cpu', this.pecas.cpu.dados), slots.cpu && slots.cpu[0]);
    // Posiciona pelo `comp.slot` (índice de ÂNCORA real -- ver `instalar`/`tentarEncaixar`), NÃO
    // pelo índice `i` dentro do array `this.pecas[familia]`: uma peça snapada na âncora #2 tem que
    // aparecer na âncora #2 mesmo que seja a única peça da família instalada até agora (índice 0
    // no array). `c.slot == null` (peça bem antiga, de fora deste módulo) cai pro índice do array
    // como fallback, igual ao comportamento de antes desta correção.
    this.pecas.ram.forEach((c, i) => pos(construirMalhaPlaceholder(THREE, 'ram', c.dados), slots.ram && slots.ram[c.slot == null ? i : c.slot]));
    this.pecas.armazenamento.forEach((c, i) => pos(construirMalhaPlaceholder(THREE, 'armazenamento', c.dados), slots.drive && slots.drive[c.slot == null ? i : c.slot]));
    this.pecas.offboard.forEach((c, i) => pos(construirMalhaPlaceholder(THREE, 'offboard', c.dados), slots.offboard && slots.offboard[c.slot == null ? i : c.slot]));
    if (this._cabos) grupo.add(this._cabos.grupo);
    return grupo;
  };

  // ==========================================================================================
  // 5) Molde padrão de componentes (Script + EventTrigger) — MESMO padrão de
  //    `ObjectStandard._DEFAULT_PORTA_SCRIPT_CODE` (js/objectstandard.js): o gabinete de hardware
  //    nasce com um Script que reage a "Ao Clicar Duas Vezes" chamando `.abrirTampa()/.fecharTampa()`
  //    -- método GENÉRICO de `SelectionCollection` (js/automation.js), reaproveitado sem reescrever
  //    NADA de animação/raycaster: a tampa é só um objeto-filho comum com a classe `.tampa`.
  // ==========================================================================================
  const CODIGO_SCRIPT_PADRAO_HARDWARE = [
    '/* Script padrão do 🖥️ Hardware — nasce em todo chassi novo (ver ObjectStandard.applyDefaultComponents',
    ' * chamado por Mapping.addObject, mesmo mecanismo do molde padrão de "porta"). Usa os métodos',
    ' * GENÉRICOS de SelectionCollection documentados em "🎬 Scripts" (Configurações 2D): .abrirTampa()/',
    ' * .fecharTampa() já sabem girar qualquer filho com a classe ".tampa" -- nenhuma lógica nova aqui. */',
    'function aoClicarDuasVezesNoGabinete() {',
    '  var eu = Select(); // usa a "entrada para seletores" da própria linha do script (o próprio objeto)',
    '  var jaAberta = false;',
    '  eu.each(function (o) { if (o.tampaAberta) jaAberta = true; });',
    '  if (jaAberta) eu.fecharTampa(); else eu.abrirTampa();',
    '}',
    '',
  ].join('\n');

  /** Devolve o array `components` (mesmo formato de `entity.components`, ver js/components.js) pra
   *  usar como "molde padrão" de um chassi de hardware -- passe pra
   *  `ObjectStandard.setDefaultComponents('pc_gabinete', HardwareSimulator.moldeComponentesPadrao())`
   *  (ou faça isso uma vez na UI de "🧩 Editar componentes… > Comportamento padrão deste tipo",
   *  já existente no app) pra todo NOVO objeto desse tipo nascer com o script pronto. */
  function moldeComponentesPadrao() {
    const uid = () => (raiz.Utils && raiz.Utils.uid) ? raiz.Utils.uid('comp') : 'comp_' + Math.random().toString(36).slice(2);
    const scriptId = uid(), eventTriggerId = uid();
    return [
      { id: scriptId, type: 'Script', enabled: true, code: CODIGO_SCRIPT_PADRAO_HARDWARE },
      { id: eventTriggerId, type: 'EventTrigger', enabled: true, events: [
        { event: 'onDoubleClick', actions: [{ targetComponentId: scriptId, method: 'aoClicarDuasVezesNoGabinete', args: [] }] },
      ] },
    ];
  }

  const API = {
    Componente, GerenciadorCabos, HardwareSimulator, PERFIL_SLOTS, ANCORAS, chaveAncora,
    construirMalhaPlaceholder, moldeComponentesPadrao, CODIGO_SCRIPT_PADRAO_HARDWARE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.HardwareSimulator = API;
})(typeof window !== 'undefined' ? window : globalThis);
