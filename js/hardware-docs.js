/**
 * hardware-docs.js — [28/09/2026 UTC] NOVO
 *
 * Pedido verbatim (resumo): "simulador 3D interativo de montagem e manutenção de hardware (PC,
 * Notebook, Workstation, Servidor)... com uma matriz de compatibilidade em JSON" — documentação
 * ligada em "Configurações 2D", MESMO padrão exato de `js/scripts-docs.js`/`js/rede-docs.js`
 * (`SECOES`, `_lista`, `_codigo`, `html()`, `abrir()`), reaproveitando a mesma estrutura de
 * modal/handle/chips/seções — sem NENHUM `<select>` literal não escapado no texto (bug real já
 * corrigido no projeto antes — todo `<select>`/`<code>` mencionado aqui passa por `_esc` ou já
 * vem como HTML de `<code>` de propósito, nunca digitado cru dentro de uma string sem `_esc`).
 *
 * Janela de DOCUMENTAÇÃO (sem nenhum campo de configuração): `HardwareDocs.abrir()`.
 * Módulo UMD (window.HardwareDocs / module.exports), igual a rede-docs.js/scripts-docs.js.
 */
(function (raiz) {
  'use strict';

  const _esc = (s) => (raiz.Utils && raiz.Utils.escapeHtml) ? raiz.Utils.escapeHtml(String(s)) : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _lista = (arr) => '<ul style="margin:4px 0 8px; padding-left:18px">' + arr.map((x) => '<li>' + x + '</li>').join('') + '</ul>';
  const _codigo = (txt) => `<pre style="margin:6px 0 10px; padding:10px 12px; border-radius:8px; background:rgba(0,0,0,0.35); border:1px solid var(--border); overflow-x:auto; font-size:12px; line-height:1.5"><code>${_esc(txt)}</code></pre>`;

  const HC = raiz.HardwareCatalog;

  /** Monta uma tabela HTML simples {rotulo -> ...campos} a partir de um catálogo congelado do
   *  HardwareCatalog -- usado pra listar Chassis/Fontes/Sockets sem repetir os dados aqui (a
   *  documentação lê o catálogo DE VERDADE, nunca uma cópia -- nunca desincroniza). */
  function _tabelaDoCatalogo(catalogo, colunas) {
    if (!catalogo) return '<p style="color:var(--text-dim)">Catálogo indisponível (js/hardware-catalog.js não carregado).</p>';
    const linhas = Object.keys(catalogo).map((k) => {
      const item = catalogo[k];
      const tds = colunas.map((c) => `<td style="padding:3px 10px 3px 0">${_esc(item[c.campo] != null ? item[c.campo] : '—')}</td>`).join('');
      return `<tr><td style="padding:3px 10px 3px 0; white-space:nowrap"><code>${_esc(k)}</code></td>${tds}</tr>`;
    }).join('');
    const cabecalho = `<tr><th style="text-align:left; padding:3px 10px 3px 0">chave</th>${colunas.map((c) => `<th style="text-align:left; padding:3px 10px 3px 0">${_esc(c.rotulo)}</th>`).join('')}</tr>`;
    return `<table style="width:100%; border-collapse:collapse; font-size:12px; margin:6px 0 12px">${cabecalho}${linhas}</table>`;
  }

  // ==========================================================================
  // 1) SEÇÕES
  // ==========================================================================
  const SECOES = [
    { id: 'visao-geral', icone: '🎬', nome: 'O que é o "🖥️ Hardware / Montagem de PC"',
      itens: [
        'Categoria de objetos inseríveis no mapa (painel "Ferramentas > Objetos > Por categoria") com 4 chassis: <b>PC de mesa</b> (<code>pc_gabinete</code>), <b>Notebook</b>, <b>Workstation</b> e <b>Servidor (rack)</b> (<code>servidor_rack</code>) — mesmo padrão de categoria/ícone/cor de "🌐 Redes de Computadores", ver <code>js/objcategorias.js</code>.',
        'Cada chassi é um objeto NORMAL do mapa (herda tudo de <code>SceneObjects</code>/Scripts de graça — visibilidade, opacidade, destaque, animação, mover, girar — ver seção "🎬 Scripts" desta mesma janela de Configurações 2D) com um campo próprio <code>obj.hardware</code> guardando a MONTAGEM atual (chaves do catálogo, nunca cópias dos dados — ver próxima seção).',
        'O "motor de regras" (matriz de compatibilidade completa) mora em <code>js/hardware-catalog.js</code> (<code>window.HardwareCatalog</code>). O "motor de simulação" (peças instaladas, cabos internos, snap, placeholder 3D) mora em <code>js/hardware-sim.js</code> (<code>window.HardwareSimulator</code>). Nenhum dos dois depende de Three.js pra RODAR (só pra DESENHAR) — dá pra validar uma montagem inteira sem nenhum navegador aberto.',
      ] },
    { id: 'integracao-rede', icone: '🔌', nome: 'Integração com "🔌 Infraestrutura de rede" e "🌐 Redes de Computadores"',
      itens: [
        'A ARQUITETURA de <code>js/hardware-catalog.js</code> copia deliberadamente a de <code>js/rede-equip.js</code> (<code>RedeEquip.REDE_CATALOGO.TIPOS</code>): objetos <code>Object.freeze</code>d, um "molde" por chave, nunca mutado — quem monta um PC guarda só as CHAVES (ex. <code>{cpu:\'cpu_i5_1700\'}</code>), do mesmo jeito que um cabo de rede guarda <code>{tipo:\'cat6\'}</code> em vez de copiar a cor/rótulo do Cat6.',
        'Os cabos INTERNOS da montagem (fonte↔placa-mãe/drives/offboard) usam a MESMA técnica de desenho dos cabos de rede: <code>THREE.CatmullRomCurve3</code> + <code>THREE.TubeGeometry</code>, igual a <code>Engine3D.rebuildCabos</code> (<code>js/engine3d-rede-mesh.js</code>) e ao cabo "vivo" de <code>js/patch-cord.js</code> (<code>new THREE.CatmullRomCurve3(vs, false, \'catmullrom\', 0.5)</code> seguido de <code>new THREE.TubeGeometry(curva, ...)</code>) — reaproveitado em <code>HardwareSimulator.GerenciadorCabos</code>, só que com rota curta ponto-a-ponto (ver "O que ficou simplificado" mais abaixo).',
        'A categoria de objeto "🌐 Redes de Computadores" continua exatamente como estava — "🖥️ Hardware / Montagem de PC" é uma categoria NOVA e SEPARADA (cor laranja, não o ciano de redes) pra não confundir "equipamento de REDE" (switch, patch panel — cabeamento ENTRE objetos do mapa) com "montagem INTERNA de um PC/notebook/servidor" (peças DENTRO de um único objeto).',
        'O gabinete de hardware NASCE com um Script + EventTrigger "Ao Clicar Duas Vezes" que chama <code>.abrirTampa()</code>/<code>.fecharTampa()</code> — o MESMO método genérico de <code>SelectionCollection</code> (documentado na seção "🎬 Scripts" desta janela) usado por QUALQUER objeto com um filho de classe <code>.tampa</code> — nenhum raycaster/animação novo foi escrito pra isso, é o comportamento genérico "de graça" citado acima.',
      ] },
    { id: 'chassis', icone: '📦', nome: 'Chassis (as 4 categorias pedidas)', itens: [], tabela: () => _tabelaDoCatalogo(HC && HC.CHASSIS, [
      { campo: 'rotulo', rotulo: 'Nome' }, { campo: 'familia', rotulo: 'Família' },
    ]) },
    { id: 'fontes', icone: '🔋', nome: 'Fontes de alimentação (AT/ATX 20/24p/12VHPWR, 80 Plus)', itens: [
      'Conectores suportados: <code>AT</code>, <code>ATX20</code>, <code>ATX24</code>, <code>ATX24+12VHPWR</code>. Selos 80 Plus (eficiência): White → Bronze → Silver → Gold → Platinum → Titanium.',
    ], tabela: () => _tabelaDoCatalogo(HC && HC.FONTES, [
      { campo: 'rotulo', rotulo: 'Nome' }, { campo: 'conector', rotulo: 'Conector' }, { campo: 'watts', rotulo: 'Watts' }, { campo: 'eficiencia', rotulo: '80 Plus' },
    ]) },
    { id: 'placas-mae', icone: '🧩', nome: 'Placas-mãe (formato, socket, RAM, PCIe/PCI/AGP, SATA/IDE/M.2)', itens: [
      'Formatos: <code>ATX</code>, <code>mATX</code>, <code>ITX</code>, <code>servidor-1s</code> (1 soquete), <code>servidor-2s</code> (dual-socket), <code>proprietaria-notebook</code>.',
    ], tabela: () => _tabelaDoCatalogo(HC && HC.PLACAS_MAE, [
      { campo: 'rotulo', rotulo: 'Nome' }, { campo: 'formato', rotulo: 'Formato' }, { campo: 'socket', rotulo: 'Socket CPU' }, { campo: 'sata', rotulo: 'SATA' }, { campo: 'ide', rotulo: 'IDE' },
    ]) },
    { id: 'cpus', icone: '🧠', nome: 'Processadores (PGA/LGA, socket, geração)', itens: [
      'Socket <code>tipo:\'PGA\'</code> = pinos NO processador (ex.: AM4). <code>tipo:\'LGA\'</code> = pinos NA placa-mãe, contatos no processador (ex.: LGA1700, AM5).',
    ], tabela: () => _tabelaDoCatalogo(HC && HC.CPUS, [
      { campo: 'rotulo', rotulo: 'Nome' }, { campo: 'socket', rotulo: 'Socket' }, { campo: 'nucleos', rotulo: 'Núcleos' }, { campo: 'tdp', rotulo: 'TDP (W)' },
    ]) },
    { id: 'ram', icone: '💾', nome: 'Memória RAM (SDR/DDR1-5, DIMM/SO-DIMM)', itens: [
      'Gerações: <code>SDR</code>, <code>DDR1</code>, <code>DDR2</code>, <code>DDR3</code>, <code>DDR4</code>, <code>DDR4-ECC</code> (servidor), <code>DDR5</code>. Formatos: <code>DIMM</code> (desktop/servidor) e <code>SODIMM</code> (notebook) — não trocam entre si mesmo com a mesma geração.',
    ], tabela: () => _tabelaDoCatalogo(HC && HC.RAM, [
      { campo: 'rotulo', rotulo: 'Nome' }, { campo: 'geracao', rotulo: 'Geração' }, { campo: 'formato', rotulo: 'Formato' }, { campo: 'gb', rotulo: 'GB' },
    ]) },
    { id: 'armazenamento', icone: '🗄️', nome: 'Armazenamento (IDE/SATA2/SATA3, 3.5"/2.5", M.2 NVMe)', itens: [
      'Um SSD M.2 NVMe PCIe mais rápido que o slot da placa-mãe ainda ENCAIXA (compatível), só roda na velocidade do slot — o validador avisa isso (não bloqueia).',
    ], tabela: () => _tabelaDoCatalogo(HC && HC.ARMAZENAMENTO, [
      { campo: 'rotulo', rotulo: 'Nome' }, { campo: 'interface', rotulo: 'Interface' }, { campo: 'formato', rotulo: 'Formato' }, { campo: 'gb', rotulo: 'GB' },
    ]) },
    { id: 'offboard', icone: '🎛️', nome: 'Placas offboard (PCI/AGP/PCIe x1/x4/x8/x16 — GPU, rede, Wi-Fi, RAID/SAS, som)', itens: [
      'Um slot PCIe físico maior aceita placas menores (uma placa x1 encaixa num slot x16), o contrário não. GPUs de topo podem exigir o conector <code>12VHPWR</code> da fonte — sem ele, a validação bloqueia.',
    ], tabela: () => _tabelaDoCatalogo(HC && HC.OFFBOARD, [
      { campo: 'rotulo', rotulo: 'Nome' }, { campo: 'categoria', rotulo: 'Categoria' }, { campo: 'barramento', rotulo: 'Barramento' }, { campo: 'watts', rotulo: 'Watts' },
    ]) },
    { id: 'compatibilidade', icone: '✅', nome: 'A matriz de compatibilidade — <code>HardwareCatalog.ehCompativel()</code>', itens: [
      '<code>HardwareCatalog.ehCompativel(componenteA, componenteB)</code> — recebe dois <code>{familia, chave}</code> (família = <code>\'chassi\'|\'fonte\'|\'placaMae\'|\'cpu\'|\'ram\'|\'armazenamento\'|\'offboard\'</code>) e devolve <code>{ok, motivo}</code>. Cobre os pares: chassi↔placa-mãe (formato físico), placa-mãe↔CPU (socket), placa-mãe↔RAM (geração + formato DIMM/SO-DIMM), placa-mãe↔armazenamento (interface/slot M.2), placa-mãe↔offboard (barramento PCIe/PCI/AGP) e fonte↔offboard (conector de energia extra).',
      '<code>HardwareCatalog.encaixesValidos(chassi, tipoComponente)</code> — devolve <code>{total, ocupados, livres}</code> de um tipo de encaixe (<code>\'fonte\'|\'placaMae\'|\'offboard\'|\'drive\'</code>) do chassi.',
      '<code>HardwareCatalog.validarMontagem(montagem)</code> — checagem de ALTO NÍVEL de uma montagem inteira (chassi + fonte + placa-mãe + CPU + arrays de RAM/armazenamento/offboard, tudo em CHAVES de catálogo): roda todos os pares relevantes de <code>ehCompativel</code> de uma vez, checa contagem de slots ocupados vs. disponíveis, e soma a WATTAGEM necessária (TDP da CPU + watts de cada offboard + ~8W por drive + 40W fixo de placa-mãe/ventoinhas) contra a fonte escolhida — acima de 100% bloqueia, acima de 80% só avisa (<code>"AVISO: ..."</code>, não conta como erro bloqueante).',
    ], extra: () => _codigo([
      "// Exemplo real (js/hardware-catalog.js):",
      "const r = HardwareCatalog.ehCompativel(",
      "  { familia: 'placaMae', chave: 'pm_am5_atx_ddr5' },",
      "  { familia: 'cpu', chave: 'cpu_i5_1700' },",
      ");",
      "// r = { ok: false, motivo: 'Socket incompatível: placa-mãe usa AM5, CPU é LGA1700.' }",
      "",
      "const montagem = HardwareCatalog.validarMontagem({",
      "  chassi: 'pc_gabinete', fonte: 'fonte_atx24_650_gold', placaMae: 'pm_am5_atx_ddr5',",
      "  cpu: 'cpu_ryzen9_am5', ram: ['ram_ddr5_32g_dimm', 'ram_ddr5_32g_dimm'],",
      "  armazenamento: ['nvme_pcie4_1tb'], offboard: ['gpu_pcie_x16_topo'],",
      "});",
      "// montagem.ok === false -- fonte de 650W não cobre a GPU de topo que exige 12VHPWR",
    ].join('\n')) },
    { id: 'simulador', icone: '🛠️', nome: 'O motor de simulação — <code>HardwareSimulator</code>', itens: [
      '<code>new HardwareSimulator(chassiKey, montagemInicial?)</code> — cria uma montagem vazia (ou já valida/monta a partir de chaves). <code>.instalar(familia, chave)</code>/<code>.remover(familia, indice)</code> trocam UMA peça por vez, revalidando contra o que já está montado (sem reprocessar a montagem inteira — mais barato pra "arrastar peça, soltar no slot"). <code>.validar()</code> roda <code>HardwareCatalog.validarMontagem</code> na montagem atual.',
      '<code>.encaixeMaisProximo(familia, pontoSegurado, raioCapturaM=0.03)</code> — o "sistema de encaixe/snap" pedido: dado um ponto 3D local (ex. onde o raycaster projetou o clique/arrasto), devolve o slot livre mais próximo dentro do raio de captura (distância vetorial 3D simples), ou <code>null</code> se nada estiver perto o bastante.',
      '<code>.anexarView3D(THREE)</code> cria o <code>GerenciadorCabos</code> (cabos internos) e monta o chicote padrão (fonte→placa-mãe, fonte→cada drive, fonte→offboard que exija conector extra). <code>.construirGrupo3D(THREE)</code> devolve um <code>THREE.Group</code> pronto com o placeholder de cada peça posicionado + os cabos — pensado pra um futuro <code>Engine3D._buildHardwareMesh(obj)</code> (ver "Integração com o motor 3D" abaixo).',
      '<code>.ligar()</code>/<code>.desligar()</code> — mesmo campo <code>obj.rede.ligado</code> que Access Point/Rack já usam (reaproveitado, não reinventado). <code>.tick(deltaSegundos)</code> avança uma temperatura simulada simples (sobe quando ligado, desce quando não) usada só pra efeito visual de heatsink/LED — não é uma simulação térmica real.',
    ] },
    { id: 'integracao-3d', icone: '🧊', nome: 'Integração com o motor 3D (Engine3D) — o que já funciona e o próximo passo', itens: [
      'O que já é AUTOMÁTICO, sem nenhum código específico de hardware: o objeto aparece no mapa 2D/3D como uma caixa placeholder (perfil em <code>js/engine3d-profiles.js</code>, mesmas dimensões do chassi em <code>HardwareCatalog.CHASSIS</code>), pode ser movido/girado/selecionado, herda Scripts (abrir/fechar tampa, ligar/desligar, destacar, animar) e aparece na grade "Ferramentas > Objetos > Por categoria" em "🖥️ Hardware / Montagem de PC".',
      'O PRÓXIMO PASSO (fora do escopo desta rodada, pedido do usuário de focar arquitetura/dados): um método <code>Engine3D._buildHardwareMesh(obj)</code>, no mesmo espírito de <code>Engine3D._buildRedeMesh</code>, que chame <code>new HardwareSimulator(obj.tipo, obj.hardware?.montagem).construirGrupo3D(this.THREE)</code> e adicione o grupo resultante dentro da malha do objeto — hoje a montagem existe e é válida/simulável (testável 100% em Node, sem navegador), só ainda não é DESENHADA automaticamente dentro do gabinete no mapa 3D.',
    ] },
    { id: 'simplificado', icone: '⚠️', nome: 'O que ficou placeholder/simplificado nesta rodada', itens: [
      'Geometria 3D de cada peça: caixas/cilindros proporcionais SEM textura/detalhe realista (pedido explícito do usuário) — <code>HardwareSimulator.construirMalhaPlaceholder</code>.',
      'Posições dos slots (<code>PERFIL_SLOTS</code> em <code>js/hardware-sim.js</code>) são ILUSTRATIVAS/proporcionais, não um layout ATX/rack medido de verdade.',
      'Cabos internos usam rota curta ponto-a-ponto (origem→meio elevado→destino) — NÃO passam pelo pipeline de roteamento por zonas-guia/bunching de <code>js/rede-passiva.js</code>/<code>js/rack-cable-routing.js</code> (que resolve cabos ENTRE objetos diferentes do mapa; os cabos de hardware vivem dentro de um único objeto).',
      '"Temperatura simulada" (<code>Componente.tick</code>) é só um número que sobe/desce pra colorir um LED/heatsink — não é uma simulação térmica real (sem airflow, sem case, sem throttling).',
      'Raycaster de "clicar numa peça específica pra trocar" (ex. clicar direto na GPU dentro do gabinete aberto) ainda não existe — hoje a troca é só via <code>HardwareSimulator.instalar/remover</code> chamado por código/uma futura UI; o que já funciona pelo CLIQUE do usuário é abrir/fechar a tampa do gabinete inteiro (herdado do sistema de Scripts).',
      'O QUE ESTÁ COMPLETO (não é placeholder): a matriz de compatibilidade inteira pedida (fontes AT/ATX 20/24p/12VHPWR + 80 Plus, placas-mãe ATX/mATX/ITX/servidor 1S/2S com socket/RAM/PCIe/PCI/AGP/SATA/IDE/M.2, CPUs PGA/LGA por socket/geração, RAM SDR→DDR5 DIMM/SO-DIMM, armazenamento IDE/SATA2/SATA3/M.2-NVMe por geração PCIe, offboard PCI/AGP/PCIe x1-x16 por categoria), as funções de validação (<code>ehCompativel</code>/<code>encaixesValidos</code>/<code>validarMontagem</code>) e o sistema de encaixe/snap por distância vetorial.',
    ] },
  ];

  // ==========================================================================
  // 2) JANELA
  // ==========================================================================
  function html() {
    const chips = SECOES.map((s) => `<a href="#hd-g-${s.id}" data-hd-go="hd-g-${s.id}" style="display:inline-block; padding:3px 9px; margin:2px; border-radius:12px; background:rgba(255,255,255,0.07); font-size:12px; text-decoration:none; color:inherit">${s.icone} ${_esc(s.nome.replace(/<[^>]+>/g, '').split(' (')[0].split(' —')[0])}</a>`).join('');
    const secoesHtml = SECOES.map((s) => {
      const extra = (typeof s.extra === 'function') ? s.extra() : '';
      const tabela = (typeof s.tabela === 'function') ? s.tabela() : '';
      return `<h4 id="hd-g-${s.id}" style="margin:16px 0 8px">${s.icone} ${s.nome}</h4>${s.itens.length ? _lista(s.itens) : ''}${tabela}${extra}`;
    }).join('');
    return `<div class="modal-sheet" style="max-width:860px; max-height:88vh; overflow:auto">
      <div class="handle"></div>
      <div style="position:sticky; top:-16px; z-index:2; background:var(--bg-elev); margin:-16px -16px 0; padding:16px 16px 8px; display:flex; align-items:center; justify-content:space-between; gap:8px">
        <h3 style="margin:0">🖥️ Hardware / Montagem de PC — guia e matriz de compatibilidade</h3>
        <button type="button" class="icon-btn sm" id="hd-close-top" title="Fechar" style="flex:none">✕</button>
      </div>
      <div style="line-height:1.5; font-size:13px">
        <p style="color:var(--text-dim); margin:6px 0">Os 4 chassis (PC, Notebook, Workstation, Servidor), o catálogo completo de peças (fontes, placas-mãe, CPUs, RAM, armazenamento, offboard), a matriz de compatibilidade e como o simulador se integra com Scripts/rede.</p>
        <div style="margin:6px 0 2px">${chips}</div>
        ${secoesHtml}
      </div>
      <div style="display:flex; gap:10px; margin-top:14px"><button type="button" class="btn" id="hd-close" style="flex:1">Fechar</button></div>
    </div>`;
  }

  function abrir() {
    document.getElementById('hd-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'hd-modal'; modal.className = 'modal-backdrop'; modal.style.zIndex = '10002';
    modal.innerHTML = html();
    document.body.appendChild(modal);
    const fechar = () => modal.remove();
    modal.querySelector('#hd-close-top').onclick = fechar;
    modal.querySelector('#hd-close').onclick = fechar;
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) fechar(); });
    modal.querySelectorAll('[data-hd-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); modal.querySelector('#' + a.dataset.hdGo)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    return modal;
  }

  const API = { SECOES, abrir, html };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.HardwareDocs = API;
})(typeof window !== 'undefined' ? window : globalThis);
