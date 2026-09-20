/**
 * rede-docs.js — RODADA 168 (18/09/2026 UTC)
 *
 * Pedido verbatim: "Coloque uma seção nas 'configurações 2D' sobre os elementos
 * de infraestrutura de rede e um botão nesta seção que, quando clicado, abre uma
 * janela com toda a descrição dos objetos, o que fazem e podem fazer, teclas
 * usadas e renderizações de ilustração de cada objeto."
 *
 * Janela de DOCUMENTACAO (sem nenhum campo de configuracao): `RedeDocs.abrir()`.
 *  - Conteudo textual em `ITENS` (um por tipo do catalogo de rede-equip.js) + secoes gerais (teclas, regras).
 *  - Ilustracoes: (1) icone SVG 2D do mapa (Icons.svgForAnyKey) e (2) render 3D
 *    REAL feito com o mesmo `RedeEquipView3D` que o "Ver em 3D" usa (itens de
 *    rack/tomada). O render
 *    usa UM unico WebGLRenderer compartilhado (evita estourar o limite de
 *    contextos WebGL do navegador), gera PNG e o descarta. Se o WebGL/Three.js
 *    nao estiver disponivel, so o icone SVG aparece (a janela continua util).
 *  - Sem dependencia de rede-passiva.js/rede-equip.js pra abrir: se faltarem, os
 *    textos aparecem e so as ilustracoes 3D ficam de fora.
 * Modulo UMD (window.RedeDocs / module.exports) — a parte de dados e testavel em Node.
 */
(function (raiz) {
  'use strict';

  // ==========================================================================
  // 1) CONTEUDO
  // ==========================================================================
  const GRUPOS = [
    { id: 'ativos',  icone: '🖧', nome: 'Equipamentos de rack (ativos e patch)' },
    { id: 'rack',    icone: '🗄️', nome: 'Organização e acessórios do rack' },
    { id: 'tomadas', icone: '🔌', nome: 'Pontos de rede (parede e piso)' },
    { id: 'fixacao', icone: '🧵', nome: 'Fixação de cabos' },
    { id: 'energia', icone: '🔋', nome: 'Energia e armazenamento (No-break/UPS, Storage)' }, // [19/09/2026 UTC] NOVO (RODADA 171)
  ];

  const T_RACK = ['Ver em 3D: aponte (até ~3,6 m) e aperte E para pegar; ande com ele; clique solta/encaixa; R gira 90°; Q devolve; Esc cancela.',
    'Mapa 2D: Modo Navegação = dois cliques abrem as opções; Modo Edição = clique esquerdo abre as opções; duplo clique abre o painel do equipamento.'];
  const T_PASSO = T_RACK;

  const ITENS = [
    // ---- ativos ----
    { tipo: 'switch24', grupo: 'ativos', nome: 'Switch de 24 portas',
      resumo: 'Switch de acesso 1U com 24 portas RJ-45 10/100/1000 e 4 slots SFP de uplink, em duas fileiras (ímpares em cima, pares embaixo).',
      faz: ['Concentra os cabos de rede vindos do patch panel e dos equipamentos.', 'Mostra um LED por porta (ativo, ocioso, desligado), LED de sistema, botão MODE, console RJ-45 e mini-USB.'],
      pode: ['Ser encaixado em qualquer U livre do rack (encaixe automático por U, com furos das orelhas alinhados).', 'Receber cabos de cobre nas portas RJ-45 e fibra nos slots SFP; cada cabo é validado na hora.', 'Ter o estado de cada porta (automático, ativo, ocioso, desligado) e o nome (hostname) editados no painel.', 'Ser ligado/desligado (LEDs apagam).'],
      teclas: T_RACK },
    { tipo: 'switch48', grupo: 'ativos', nome: 'Switch de 48 portas',
      resumo: 'Igual ao de 24 portas, com 48 portas RJ-45 e 4 SFP no mesmo 1U (fileiras mais densas).',
      faz: ['Mesmas funções do switch de 24, para mais pontos de rede.'],
      pode: ['Tudo o que o switch de 24 faz; o painel lista as 48 portas com rótulo e status.'],
      teclas: T_RACK },
    { tipo: 'patchpanel24', grupo: 'ativos', nome: 'Patch panel de 24 portas',
      resumo: 'Painel de conexão Cat6 de 1U: portas em 4 grupos de 6, numeração sob cada porta e barra guia de cabos na parte de trás.',
      faz: ['Faz a ponte entre o cabeamento horizontal (fixo) e o switch, via patch cords curtos.', 'Organiza e identifica cada ponto (numeração e rótulo por porta).'],
      pode: ['Ser encaixado em um U livre do rack.', 'Receber cabos nas portas; a compatibilidade é conferida (ex.: cabo de categoria maior/menor que o keystone gera aviso).', 'Ter rótulo (labelID) por porta, exibido ao apontar.'],
      teclas: T_RACK },
    { tipo: 'patchpanel48', grupo: 'ativos', nome: 'Patch panel de 48 portas',
      resumo: 'Patch panel Cat6 de 2U com 48 portas em duas fileiras de 24.',
      faz: ['Mesma função do de 24 portas, com o dobro de pontos.'],
      pode: ['Ocupa 2U ao ser encaixado; demais recursos iguais ao de 24 portas.'],
      teclas: T_RACK },
    { tipo: 'dio12', grupo: 'ativos', nome: 'DIO de 12 fibras (1U)',
      resumo: 'Distribuidor Interno Óptico: painel 1U com 12 adaptadores de fibra (duplex LC/SC), onde as fibras do backbone terminam.',
      faz: ['Termina e organiza fibras ópticas dentro do rack, protegendo as emendas.'],
      pode: ['Ser encaixado em um U livre.', 'Receber apenas cabos de fibra: cobre em porta óptica é erro; monomodo (SMF) em multimodo (MMF) é erro; OM3 em porta OM4 gera aviso.'],
      teclas: T_RACK },
    { tipo: 'dio24', grupo: 'ativos', nome: 'DIO de 24 fibras (1U)',
      resumo: 'DIO 1U de maior densidade, com 24 fibras.', faz: ['Mesma função do DIO de 12, para mais fibras.'],
      pode: ['Mesmas regras de compatibilidade de fibra do DIO de 12.'], teclas: T_RACK },
    { tipo: 'dio48', grupo: 'ativos', nome: 'DIO de 48 fibras (2U)',
      resumo: 'DIO de 2U com 48 fibras.', faz: ['Mesma função, alta densidade.'],
      pode: ['Ocupa 2U ao ser encaixado; mesmas regras de fibra.'], teclas: T_RACK },

    // ---- rack ----
    { tipo: 'guia_h1', grupo: 'rack', nome: 'Guia de cabos horizontal 1U',
      resumo: 'Organizador frontal 1U com dedos (argolas) por onde os patch cords passam.',
      faz: ['Mantém os cabos arrumados entre switch e patch panel, respeitando o raio de curvatura.', 'Define zonas de passagem: os cabos são roteados pelos dedos.'],
      pode: ['Ser encaixado em um U livre do rack; os cabos ligados passam pelas zonas de passagem.'], teclas: T_RACK },
    { tipo: 'guia_h2', grupo: 'rack', nome: 'Guia de cabos horizontal 2U',
      resumo: 'Versão de 2U, mais profunda, com mais dedos — para feixes maiores.',
      faz: ['Mesma função do guia 1U, com mais capacidade.'], pode: ['Ocupa 2U no rack.'], teclas: T_RACK },
    { tipo: 'guia_v', grupo: 'rack', nome: 'Guia de cabos vertical',
      resumo: 'Organizador vertical (~1,8 m) que corre ao lado dos trilhos do rack.',
      faz: ['Leva os cabos de cima para baixo do rack sem cruzar a frente dos equipamentos.'],
      pode: ['Ser posicionado no chão junto ao rack (não é por U); pegar com E e soltar onde couber.'], teclas: T_PASSO },
    { tipo: 'bandeja_fixa', grupo: 'rack', nome: 'Bandeja fixa 1U',
      resumo: 'Prateleira 1U, profunda (350 mm), presa nos quatro pontos do trilho.',
      faz: ['Apoia equipamentos sem orelhas de rack (roteador, modem, caixas).'],
      pode: ['Ser encaixada em um U livre do rack.'], teclas: T_RACK },
    { tipo: 'bandeja_basc', grupo: 'rack', nome: 'Bandeja basculante 2U',
      resumo: 'Bandeja de 2U que pode ser inclinada/rebatida para acesso ao equipamento.',
      faz: ['Apoia equipamentos pesados e permite abrir para manutenção.'], pode: ['Ocupa 2U ao ser encaixada.'], teclas: T_RACK },
    { tipo: 'pdu8', grupo: 'rack', nome: 'Régua de tomadas (PDU) 1U',
      resumo: 'Régua 1U com 8 tomadas para alimentar os equipamentos do rack.',
      faz: ['Distribui energia dentro do rack.'], pode: ['Ser encaixada em um U livre. (Não há cálculo de carga elétrica — é um objeto de posicionamento.)'], teclas: T_RACK },
    { tipo: 'frente_falsa', grupo: 'rack', nome: 'Frente falsa 1U',
      resumo: 'Tampa cega de 1U para cobrir U vazio.',
      faz: ['Melhora o visual e o fluxo de ar, fechando os espaços sem equipamento.'], pode: ['Ser encaixada em qualquer U livre.'], teclas: T_RACK },
    { tipo: 'kit_vent', grupo: 'rack', nome: 'Kit de ventilação 1U',
      resumo: 'Módulo 1U com 2 ventoinhas.',
      faz: ['Representa a ventilação forçada do rack (não há simulação térmica).'], pode: ['Ser encaixado em um U livre.'], teclas: T_RACK },

    // ---- energia (No-break/UPS) e storage [19/09/2026 UTC] NOVO (RODADA 171) ----
    { tipo: 'nobreak_torre', grupo: 'energia', nome: 'No-break torre (Interactive)',
      resumo: 'No-break de piso, formato torre, 1500 VA / 15 min de autonomia (classe "Interactive"), 4 tomadas de saída — não se encaixa no rack (posicionado ao lado ou embaixo).',
      faz: ['Alimenta equipamentos menores em redes pequenas.', 'Suas 4 tomadas de saída são portas conectáveis (cabo tipo "energia"), como as do PDU.'],
      pode: ['Ser posicionado livremente no mapa (não é rackável).', 'Ter cada tomada ligada, por cabo, a um switch/storage/PDU (a lógica de carga real — StorageDevice.wattsConsumidos()/UPSDevice.calculateLoad() — está em js/rede-storage-energia.js; a integração automática com os cabos do mapa ainda não foi feita).'],
      teclas: T_RACK },
    { tipo: 'nobreak_1u', grupo: 'energia', nome: 'No-break rack 1U (Interactive)',
      resumo: 'No-break rackável 1U, 1000 VA / 10 min, 4 tomadas de saída, classe "Interactive".',
      faz: ['Mesma função do torre, ocupando 1U do rack.'],
      pode: ['Ser encaixado em um U livre; mesmas 4 tomadas conectáveis.'], teclas: T_RACK },
    { tipo: 'nobreak_2u', grupo: 'energia', nome: 'No-break rack 2U (Interactive)',
      resumo: 'No-break rackável 2U, 2200 VA / 15 min, 6 tomadas de saída.',
      faz: ['Maior capacidade que o 1U, para racks com mais equipamentos ativos.'],
      pode: ['Ocupa 2U ao ser encaixado; 6 tomadas conectáveis.'], teclas: T_RACK },
    { tipo: 'nobreak_corporativo', grupo: 'energia', nome: 'No-break corporativo (Online Double Conversion)',
      resumo: 'No-break de grande porte (20 kVA, classe "Online Double Conversion"), ocupa 18U — espaço dedicado no rack ou gabinete separado —, com módulos de bateria expansíveis e 8 tomadas de saída.',
      faz: ['Mantém data centers/salas de TI funcionando durante falta de energia, com dupla conversão (sem transição perceptível).'],
      pode: ['Ser encaixado num rack com espaço livre suficiente (18U) ou tratado como gabinete próprio.', 'Ter módulos de bateria expansíveis (propriedade `modulosBateriaExpandivel`).'], teclas: T_RACK },
    { tipo: 'storage_12', grupo: 'energia', nome: 'Storage NAS/SAN 12 baias (2U)',
      resumo: 'Disk shelf/NAS/SAN 2U com 12 baias de disco de 3,5", profundidade de servidor (850 mm).',
      faz: ['Representa o armazenamento em rede: cada baia é um slot para uma unidade de disco (HD/SSD).'],
      pode: ['Ser encaixado em 2U do rack.', 'Ter discos inseridos/removidos via as classes StorageDevice/DriveUnit (js/rede-storage-energia.js) — `storage.insertDrive(driveUnit, slotIndex)`/`storage.removeDrive(slotIndex)` recalculam a capacidade total automaticamente. RESSALVA: a interação de arrastar/soltar um disco DIRETO no "Ver em 3D" ainda não foi implementada — as baias hoje são representadas como gavetas fechadas fixas; a lógica de estado já existe e funciona (testada via Node), falta a integração visual.'],
      teclas: T_RACK },
    { tipo: 'storage_24', grupo: 'energia', nome: 'Storage NAS/SAN 24 baias (2U)',
      resumo: 'Disk shelf/NAS/SAN 2U com 24 baias de disco de 2,5" (maior densidade).',
      faz: ['Mesma função do de 12 baias, com o dobro de slots em formato menor.'],
      pode: ['Mesmas regras do de 12 baias.'], teclas: T_RACK },
    { tipo: 'storage_60', grupo: 'energia', nome: 'Storage NAS/SAN 60 baias (4U)',
      resumo: 'Disk shelf de alta densidade, 4U, 60 baias de disco de 3,5", profundidade 1000 mm.',
      faz: ['Armazenamento de grande capacidade (dezenas a centenas de TB, dependendo dos discos instalados).'],
      pode: ['Ocupa 4U ao ser encaixado; mesmas regras de inserção/remoção de disco das demais storages.'], teclas: T_RACK },

    // ---- tomadas ----
    { tipo: 'espelho1', grupo: 'tomadas', nome: 'Espelho de parede 1 módulo',
      resumo: 'Placa 4x4" com 1 módulo (keystone RJ-45).', faz: ['Ponto de rede na parede, onde o usuário liga o notebook/telefone.'],
      pode: ['Ser posicionado na parede (mapa 2D ou pegando com E no 3D); receber 1 cabo.'], teclas: T_PASSO },
    { tipo: 'espelho2', grupo: 'tomadas', nome: 'Espelho de parede 2 módulos',
      resumo: 'Placa com 2 módulos.', faz: ['Dois pontos no mesmo espelho (ex.: dados + voz).'], pode: ['Receber até 2 cabos.'], teclas: T_PASSO },
    { tipo: 'espelho4', grupo: 'tomadas', nome: 'Espelho de parede 4 módulos',
      resumo: 'Placa 4x4" com 4 módulos.', faz: ['Quatro pontos em uma só caixa.'], pode: ['Receber até 4 cabos.'], teclas: T_PASSO },
    { tipo: 'caixa_piso2', grupo: 'tomadas', nome: 'Caixa de piso 2 módulos',
      resumo: 'Caixa embutida no piso com tampa e 2 módulos.', faz: ['Pontos de rede no meio da sala, saindo do piso.'], pode: ['Receber até 2 cabos; ficar rente ao chão.'], teclas: T_PASSO },
    { tipo: 'caixa_piso4', grupo: 'tomadas', nome: 'Caixa de piso 4 módulos',
      resumo: 'Caixa de piso maior, com 4 módulos.', faz: ['Mesma função, para ilhas de trabalho.'], pode: ['Receber até 4 cabos.'], teclas: T_PASSO },

    // ---- fixacao ----
    { tipo: 'abracadeira_velcro', grupo: 'fixacao', nome: 'Abraçadeira de velcro',
      resumo: 'Fita de velcro reutilizável que junta cabos em feixe.',
      faz: ['Agrupa cabos paralelos (feixe/bunching) sem apertar demais.'], pode: ['Ser reaberta e reposicionada; recomendada para cabos de dados.'], teclas: T_PASSO },
    { tipo: 'abracadeira_nylon', grupo: 'fixacao', nome: 'Abraçadeira de nylon',
      resumo: 'Cinta plástica de uso único.', faz: ['Prende feixes de cabos com firmeza.'], pode: ['Fixar cabos em trechos onde não haverá mudança; apertada demais pode danificar cabos de dados.'], teclas: T_PASSO },

  ];

  const GERAL = {
    teclas: [
      ['E', 'Ver em 3D: pega o item de rede apontado (até ~3,6 m). Ele acompanha o personagem.'],
      ['Clique', 'Com um item na mão: solta no chão, mesa ou topo do rack, ou encaixa no U livre do rack.'],
      ['R', 'Gira o item carregado em 90°.'],
      ['Q', 'Devolve o item ao lugar de origem (forma confiável de cancelar).'],
      ['Esc', 'Cancela a ação (o Chrome pode "engolir" o Esc no Pointer Lock — nesse caso use Q).'],
      ['5', 'Abre a barra de Objetos do 3D, de onde se escolhe o tipo a colocar.'],
      ['Modo Navegação', 'Dois cliques no item abrem as opções.'],
      ['Modo Edição', 'Um clique com o botão esquerdo abre as opções.'],
      ['Duplo clique', 'Abre o painel do equipamento (script "Ao Clicar Duas Vezes").'],
      ['Apontar', 'Mostra o labelID (etiqueta) do item/porta em um balão sobre a tela.'],
      // [19/09/2026 UTC] NOVO (RODADA 190) -- pedido verbatim: "Documente as mudanças feitas em
      // 'configurações 2D'... informando as teclas usadas para interação também." As teclas L (RODADA
      // 169) e M (RODADA 189) nunca tinham sido documentadas aqui.
      ['L', 'Liga o modo "Ligar cabo clicando nas portas": mire numa porta e clique 2× (1º marca, 2º confirma) pra escolher a origem, depois a mesma coisa pro destino — o cabo é criado na hora. L de novo ou Esc encerra o modo.'],
      ['M', 'Liga o modo "Moldar cabo": clique no corpo de um cabo já existente pra criar um nó de controle arrastável, ou num nó já existente (esfera amarela) pra pegá-lo. M de novo ou Esc encerra o modo (as esferas somem e o cabo não pode mais ser moldado até religar).'],
      ['Clique (Moldar cabo, com um nó em mãos)', 'Solta o nó na posição atual e recalcula o formato do cabo (bunching incluso).'],
      ['Ctrl (Moldar cabo, segurando um nó)', 'Trava o movimento só no eixo Y (altura), reaproveitando a mesma "trava vertical" da Trena 3D — sem Ctrl, o nó desliza no plano horizontal X/Z, na altura (Y) em que ele estava.'],
      // [19/09/2026 UTC] NOVO (RODADA 192) -- teclas X e B do modo "Moldar cabo" (exclusão de nó e
      // alternância bézier/reta por trecho), documentadas junto das outras teclas do mesmo modo.
      ['X (Moldar cabo)', 'Exclui o nó de controle que está sendo segurado (ou, se nenhum, o que estiver sob a mira). O trajeto do cabo é recalculado sem esse ponto.'],
      ['B (Moldar cabo)', 'Alterna entre bézier (curva, padrão) e reta o trecho SEGUINTE ao nó segurado/mirado — a esfera muda de cor (amarela = curva, laranja = reta) pra indicar o estado atual.'],
      // [19/09/2026 UTC] NOVO (RODADA 195) -- pedido verbatim: "No modo 'M' do cabo, deve aparecer na
      // tela todos os botões de interação que são usados." A tecla Q (RODADA 194, desseleciona o nó
      // sendo segurado -- ver `_caboMoldarDesselecionar` em view3d-rede.js) já estava no HUD fixo do
      // modo (`_caboMoldarDesenharHud`), mas nunca tinha sido acrescentada aqui -- esta tabela geral de
      // teclas de "Descrição dos objetos de rede" (Configurações 2D) ficou desatualizada desde então.
      ['Q (Moldar cabo, com um nó em mãos)', 'Desseleciona o nó SEM confirmar a posição atual (ao contrário do clique, que sempre fixa onde a mira está). Um nó recém-CRIADO neste "pegar" é removido de volta (desfaz a criação); um nó que já EXISTIA volta pra posição que tinha antes de ser pego.'],
    ],
    regras: [
      'Cobre em porta óptica, ou fibra em porta de cobre = erro (a ligação é recusada).',
      'Fibra monomodo (SMF) em porta multimodo (MMF), e vice-versa = erro.',
      'Cabo OM3 em porta OM4 = aviso (funciona, com alcance menor).',
      'Cabo Cat6A em keystone Cat6, ou cabo blindado em porta sem blindagem = aviso.',
      'Cabo curto demais para a rota (com folga) = aviso; comprimentos comerciais de patch cord: 0,3 · 0,5 · 1 · 1,5 · 2 · 3 · 5 · 7 · 10 · 15 · 20 m.',
      // [19/09/2026 UTC] NOVO (RODADA 171).
      'Cabo tipo "energia" (tomadas do No-break/PDU) não passa pela validação de compatibilidade óptica/cobre — é sempre aceito.',
    ],
    // [19/09/2026 UTC] NOVO (RODADA 171) -- Unidades de Disco (HD/SSD) não entram na grade de
    // Objetos como um item de rack: são gerenciadas por código (classe DriveUnit, ver
    // js/rede-storage-energia.js), não posicionadas manualmente no mapa. StorageDevice.insertDrive/
    // removeDrive gerenciam o estado interno das baias e recalculam a capacidade automaticamente;
    // UPSDevice.calculateLoad soma o consumo (W) dos dispositivos ligados a um No-break e calcula a
    // autonomia restante pela fórmula: autonomiaMin = autonomiaMinNominal × (potênciaMáximaW ÷ cargaAtualW).
    driveUnitsEUps: 'HD/SSD (classe DriveUnit): tecnologia (HDD_SATA/HDD_SAS/SSD_SATA/SSD_NVMe), capacidade (TB) e status (healthy/failed/empty); só existem "encaixados" numa baia livre de um Storage (hot-swap). No-break/UPS (classe UPSDevice): calcula a carga (W) de tudo o que está ligado nele e a autonomia restante da bateria, proporcional à carga (metade da carga = o dobro da autonomia). RESSALVA: a lógica está pronta e testada (Node), mas ainda não está conectada à interface do "Ver em 3D" — não há, ainda, um jeito de arrastar um HD pra dentro de um Storage pela interface, nem um mostrador ao vivo da autonomia do No-break.',
    limites: 'Lembretes: tudo aqui é modelo didático de posicionamento e conferência — não há simulação térmica nem raio de curvatura por cabo; o cálculo de carga elétrica/autonomia do No-break (novo nesta rodada) é uma aproximação linear padrão de datasheet, não uma simulação de bateria real.',
  };

  // ==========================================================================
  // 2) RENDER 3D DAS ILUSTRACOES
  // ==========================================================================
  const _estado = { renderer: null, cache: {} };

  function _garantirRenderer(THREE, w, h) {
    if (_estado.renderer) return _estado.renderer;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(w, h, false); r.setPixelRatio(1); r.setClearColor(0x000000, 0);
    _estado.renderer = r; return r;
  }

  /** Renderiza um tipo -> data URL PNG (ou null). */
  function renderizarTipo(THREE, tipo, w, h) {
    const RE = raiz.RedeEquip;
    let grupo = null, disp = [];
    if (RE && RE.especificar && RE.RedeEquipView3D) {
      const spec = RE.especificar(tipo); if (!spec) return null;
      const view = new RE.RedeEquipView3D(THREE, spec, { ligado: true, parafusos: false, fibra: 'SMF' });
      grupo = view.group; disp = view._disp || [];
    }
    if (!grupo) return null;
    const cena = new THREE.Scene();
    cena.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.9));
    const sol = new THREE.DirectionalLight(0xffffff, 1.1); sol.position.set(2, 3, 4); cena.add(sol);
    const luz2 = new THREE.DirectionalLight(0x9db8ff, 0.4); luz2.position.set(-3, 1, -2); cena.add(luz2);
    cena.add(grupo); grupo.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(grupo);
    const centro = box.getCenter(new THREE.Vector3()), tam = box.getSize(new THREE.Vector3());
    const raio = Math.max(0.01, tam.length() / 2);
    const cam = new THREE.PerspectiveCamera(28, w / h, raio * 0.05, raio * 30);
    const dir = new THREE.Vector3(0.75, 0.55, 1).normalize();
    cam.position.copy(centro).addScaledVector(dir, raio * 2.9); cam.lookAt(centro);
    const r = _garantirRenderer(THREE, w, h);
    r.render(cena, cam);
    let url = null; try { url = r.domElement.toDataURL('image/png'); } catch (e) { url = null; }
    disp.forEach((d) => { try { d.dispose && d.dispose(); } catch (e) { /* ignora */ } });
    cena.remove(grupo);
    return url;
  }

  // ==========================================================================
  // 3) JANELA
  // ==========================================================================
  const _esc = (s) => (raiz.Utils && raiz.Utils.escapeHtml) ? raiz.Utils.escapeHtml(String(s)) : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _lista = (arr) => '<ul style="margin:4px 0 8px; padding-left:18px">' + arr.map((x) => '<li>' + _esc(x) + '</li>').join('') + '</ul>';

  function _cartao(it) {
    const svg = (raiz.Icons && raiz.Icons.svgForAnyKey && raiz.Icons.svgForAnyKey(it.tipo)) || '';
    return `<div class="rd-card" id="rd-${it.tipo}" style="border:1px solid var(--border); border-radius:10px; padding:10px; margin:0 0 12px; background:rgba(255,255,255,0.03)">
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-start">
        <div style="flex:none; display:flex; gap:8px">
          <div title="Ícone no mapa 2D" style="width:84px; height:84px; border-radius:8px; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; padding:6px; box-sizing:border-box">${svg}</div>
          <div class="rd-render" data-tipo="${it.tipo}" title="Renderização 3D" style="width:170px; height:112px; border-radius:8px; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; font-size:11px; color:var(--text-dim)">renderizando…</div>
        </div>
        <div style="flex:1 1 220px; min-width:200px">
          <div style="font-weight:600; font-size:14px">${_esc(it.nome)} <span style="font-weight:400; font-size:11px; color:var(--text-dim)">(${_esc(it.tipo)})</span></div>
          <div style="font-size:12.5px; color:var(--text-dim); margin:2px 0 4px">${_esc(it.resumo)}</div>
        </div>
      </div>
      <div style="font-size:12.5px; line-height:1.5; margin-top:6px">
        <b>O que faz</b>${_lista(it.faz)}
        <b>O que pode fazer</b>${_lista(it.pode)}
        <b>Teclas e cliques</b>${_lista(it.teclas)}
      </div>
    </div>`;
  }

  function html() {
    const chips = GRUPOS.map((g) => `<a href="#rd-g-${g.id}" data-rd-go="rd-g-${g.id}" style="display:inline-block; padding:3px 9px; margin:2px; border-radius:12px; background:rgba(255,255,255,0.07); font-size:12px; text-decoration:none; color:inherit">${g.icone} ${_esc(g.nome.split(' (')[0])}</a>`).join('');
    const secoes = GRUPOS.map((g) => `<h4 id="rd-g-${g.id}" style="margin:16px 0 8px">${g.icone} ${_esc(g.nome)}</h4>` + ITENS.filter((i) => i.grupo === g.id).map(_cartao).join('')).join('');
    const teclas = '<table style="width:100%; border-collapse:collapse; font-size:12.5px">' + GERAL.teclas.map((t) => `<tr><td style="padding:3px 8px 3px 0; white-space:nowrap; vertical-align:top"><kbd style="padding:1px 6px; border:1px solid var(--border); border-radius:4px; background:rgba(255,255,255,0.06)">${_esc(t[0])}</kbd></td><td style="padding:3px 0">${_esc(t[1])}</td></tr>`).join('') + '</table>';
    return `<div class="modal-sheet" style="max-width:820px; max-height:88vh; overflow:auto">
      <div class="handle"></div>
      <div style="position:sticky; top:-16px; z-index:2; background:var(--bg-elev); margin:-16px -16px 0; padding:16px 16px 8px; display:flex; align-items:center; justify-content:space-between; gap:8px">
        <h3 style="margin:0">🔌 Infraestrutura de rede — guia dos objetos</h3>
        <button type="button" class="icon-btn sm" id="rd-close-top" title="Fechar" style="flex:none">✕</button>
      </div>
      <div style="line-height:1.5; font-size:13px">
        <p style="color:var(--text-dim); margin:6px 0">Todos os objetos de rede do app: o que são, o que fazem, o que se pode fazer com eles, as teclas usadas e uma renderização de cada um (ícone do mapa 2D à esquerda, imagem 3D ao lado).</p>
        <div style="margin:6px 0 2px">${chips}<a href="#rd-g-teclas" data-rd-go="rd-g-teclas" style="display:inline-block; padding:3px 9px; margin:2px; border-radius:12px; background:rgba(255,255,255,0.07); font-size:12px; text-decoration:none; color:inherit">⌨️ Teclas</a><a href="#rd-g-regras" data-rd-go="rd-g-regras" style="display:inline-block; padding:3px 9px; margin:2px; border-radius:12px; background:rgba(255,255,255,0.07); font-size:12px; text-decoration:none; color:inherit">✅ Regras e ocupação</a></div>
        <h4 id="rd-g-teclas" style="margin:16px 0 8px">⌨️ Teclas e cliques (resumo geral)</h4>
        ${teclas}
        <h4 id="rd-g-regras" style="margin:16px 0 8px">✅ Regras de compatibilidade</h4>
        ${_lista(GERAL.regras)}
        <p style="color:var(--text-dim)">${_esc(GERAL.limites)}</p>
        ${secoes}
      </div>
      <div style="display:flex; gap:10px; margin-top:14px"><button type="button" class="btn" id="rd-close" style="flex:1">Fechar</button></div>
    </div>`;
  }

  function abrir() {
    document.getElementById('rd-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'rd-modal'; modal.className = 'modal-backdrop'; modal.style.zIndex = '10002';
    modal.innerHTML = html();
    document.body.appendChild(modal);
    let vivo = true;
    const fechar = () => { vivo = false; modal.remove(); };
    modal.querySelector('#rd-close-top').onclick = fechar;
    modal.querySelector('#rd-close').onclick = fechar;
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) fechar(); });
    modal.querySelectorAll('[data-rd-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); modal.querySelector('#' + a.dataset.rdGo)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    _renderizarTodas(modal, () => vivo);
    return modal;
  }

  function _renderizarTodas(modal, vivo) {
    const alvos = Array.from(modal.querySelectorAll('.rd-render'));
    const falha = (msg) => alvos.forEach((a) => { if (!a.querySelector('img')) a.textContent = msg; });
    const loader = raiz.Engine3D && raiz.Engine3D._loadThree ? raiz.Engine3D._loadThree() : (raiz.THREE ? Promise.resolve(raiz.THREE) : null);
    if (!loader) { falha('3D indisponível'); return; }
    loader.then((THREE) => {
      const W = 340, H = 224; // 2x do tamanho exibido (nitidez)
      let i = 0;
      const passo = () => {
        if (!vivo() || i >= alvos.length) return;
        const el = alvos[i++]; const tipo = el.dataset.tipo;
        try {
          const url = renderizarTipo(THREE, tipo, W, H);
          if (url) el.innerHTML = `<img alt="Renderização 3D de ${_esc(tipo)}" src="${url}" style="width:100%; height:100%; object-fit:contain">`;
          else el.textContent = 'sem imagem 3D';
        } catch (e) { el.textContent = 'sem imagem 3D'; }
        setTimeout(passo, 16);
      };
      passo();
    }).catch(() => falha('3D indisponível'));
  }

  const API = { GRUPOS, ITENS, GERAL, abrir, html, renderizarTipo };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.RedeDocs = API;
})(typeof window !== 'undefined' ? window : globalThis);
