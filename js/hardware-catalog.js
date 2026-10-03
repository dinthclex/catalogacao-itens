/**
 * hardware-catalog.js — Catálogo/motor de REGRAS do "🖥️ Simulador de Montagem e Manutenção de
 * Hardware" (PC, Notebook, Workstation, Servidor).
 *
 * [28/09/2026 UTC] NOVO — pedido verbatim (resumo): "simulador 3D interativo de montagem e
 * manutenção de hardware (PC, Notebook, Workstation, Servidor) com peças trocáveis (fontes,
 * placas-mãe, CPUs, RAM, armazenamento, placas offboard), cabos dinâmicos, sistema de
 * encaixe/snap, e uma matriz de compatibilidade em JSON" — usando como REFERÊNCIA e INTEGRANDO
 * com os dois subsistemas de rede já existentes: '🔌 Infraestrutura de rede' (js/rede-equip.js —
 * catálogo de equipamento modular com `TIPOS`/componentes/portas/compatibilidade, congelado com
 * `Object.freeze`, exatamente o padrão reaproveitado abaixo) e '🌐 Redes de Computadores'
 * (categoria de objetos inseríveis no mapa, via js/objcategorias.js/js/novosobjetos.js).
 *
 * Mesma arquitetura de js/rede-equip.js: módulo UMD (window.HardwareCatalog / module.exports),
 * classes de LÓGICA PURA (sem Three.js — a "view" fica em js/hardware-sim.js), tudo em objetos
 * `Object.freeze`d (o "molde" nunca é mutado direto — quem monta um PC guarda só as CHAVES do
 * catálogo, nunca uma cópia dos dados).
 *
 * Este arquivo é o "motor de regras" (dados + validação). js/hardware-sim.js é o "motor de
 * simulação" (classes com estado: `Componente` instalado, `GerenciadorCabos`, `HardwareSimulator`)
 * — ele importa/usa este catálogo, nunca duplica os dados aqui.
 */
(function (raiz) {
  'use strict';

  // ==========================================================================================
  // 1) CHASSIS (as 4 categorias pedidas: PC, Notebook, Workstation, Servidor)
  // ==========================================================================================
  // `encaixes` declara, por FAMÍLIA de componente ("fonte"|"placaMae"|"offboard"|"drive"), quantos
  // encaixes físicos o chassi tem — usado por `encaixesValidos()` abaixo. `formatosPlacaMae`
  // restringe quais formatos de placa-mãe cabem fisicamente no chassi.
  const CHASSIS = Object.freeze({
    pc_gabinete: Object.freeze({
      rotulo: 'PC de mesa (gabinete)', familia: 'desktop',
      formatosPlacaMae: Object.freeze(['ATX', 'mATX', 'ITX']),
      encaixes: Object.freeze({ fonte: 1, placaMae: 1, offboard: 7, drive: 6 }),
      largura: 0.2, altura: 0.45, profundidade: 0.45,
    }),
    notebook: Object.freeze({
      rotulo: 'Notebook', familia: 'portatil',
      formatosPlacaMae: Object.freeze(['proprietaria-notebook']),
      // Notebook não tem slots PCIe/PCI abertos (offboard=0) nem fonte trocável (é uma fonte
      // externa/carregador, fora do escopo de "peça interna trocável"); RAM em SO-DIMM.
      encaixes: Object.freeze({ fonte: 0, placaMae: 1, offboard: 0, drive: 1 }),
      largura: 0.36, altura: 0.02, profundidade: 0.25,
    }),
    workstation: Object.freeze({
      rotulo: 'Workstation', familia: 'desktop',
      formatosPlacaMae: Object.freeze(['ATX', 'servidor-1s']),
      encaixes: Object.freeze({ fonte: 1, placaMae: 1, offboard: 7, drive: 8 }),
      largura: 0.22, altura: 0.5, profundidade: 0.5,
    }),
    servidor_rack: Object.freeze({
      rotulo: 'Servidor (rack)', familia: 'servidor',
      formatosPlacaMae: Object.freeze(['servidor-1s', 'servidor-2s']),
      // Servidor rack: fonte redundante (2 encaixes), várias baias hot-swap.
      encaixes: Object.freeze({ fonte: 2, placaMae: 1, offboard: 4, drive: 12 }),
      largura: 0.4826, altura: 0.0889, profundidade: 0.7, // 2U, 19" -- mesmas constantes de RedeEquip.REDE_CATALOGO
    }),
  });

  // ==========================================================================================
  // 2) FONTES DE ALIMENTAÇÃO (PSU) — AT/ATX 20/24 pinos + 12VHPWR, wattagem, eficiência 80 Plus
  // ==========================================================================================
  const CONECTOR_PSU = Object.freeze(['AT', 'ATX20', 'ATX24', 'ATX24+12VHPWR']);
  const EFICIENCIA_80PLUS = Object.freeze(['Nenhum', 'White', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Titanium']);
  const FONTES = Object.freeze({
    fonte_at_200: Object.freeze({ rotulo: 'Fonte AT 200W', conector: 'AT', watts: 200, eficiencia: 'Nenhum', modelo: 'PSU-AT200' }),
    fonte_atx20_300: Object.freeze({ rotulo: 'Fonte ATX 300W (20 pinos)', conector: 'ATX20', watts: 300, eficiencia: 'Nenhum', modelo: 'PSU-ATX20-300' }),
    fonte_atx24_450: Object.freeze({ rotulo: 'Fonte ATX 450W (24 pinos) 80 Plus White', conector: 'ATX24', watts: 450, eficiencia: 'White', modelo: 'PSU-450W' }),
    fonte_atx24_550_bronze: Object.freeze({ rotulo: 'Fonte ATX 550W 80 Plus Bronze', conector: 'ATX24', watts: 550, eficiencia: 'Bronze', modelo: 'PSU-550B' }),
    fonte_atx24_650_gold: Object.freeze({ rotulo: 'Fonte ATX 650W 80 Plus Gold', conector: 'ATX24', watts: 650, eficiencia: 'Gold', modelo: 'PSU-650G' }),
    fonte_atx24_850_platinum: Object.freeze({ rotulo: 'Fonte ATX 850W 80 Plus Platinum', conector: 'ATX24', watts: 850, eficiencia: 'Platinum', modelo: 'PSU-850P' }),
    fonte_atx24_1200_titanium_12vhpwr: Object.freeze({ rotulo: 'Fonte ATX 1200W 80 Plus Titanium (24p + 12VHPWR)', conector: 'ATX24+12VHPWR', watts: 1200, eficiencia: 'Titanium', modelo: 'PSU-1200T' }),
    fonte_servidor_redundante_1100: Object.freeze({ rotulo: 'Fonte redundante de servidor 1100W 80 Plus Platinum', conector: 'ATX24', watts: 1100, eficiencia: 'Platinum', hotswap: true, modelo: 'PSU-SRV1100' }),
  });

  // ==========================================================================================
  // 3) SOCKETS DE CPU (PGA/LGA) — usados por PLACAS_MAE.socket e CPUS.socket
  // ==========================================================================================
  const SOCKETS_CPU = Object.freeze({
    // Intel LGA (pinos na placa-mãe, contatos no processador)
    lga775: Object.freeze({ rotulo: 'LGA775', tipo: 'LGA', fabricante: 'Intel' }),
    lga1155: Object.freeze({ rotulo: 'LGA1155', tipo: 'LGA', fabricante: 'Intel' }),
    lga1151: Object.freeze({ rotulo: 'LGA1151', tipo: 'LGA', fabricante: 'Intel' }),
    lga1200: Object.freeze({ rotulo: 'LGA1200', tipo: 'LGA', fabricante: 'Intel' }),
    lga1700: Object.freeze({ rotulo: 'LGA1700', tipo: 'LGA', fabricante: 'Intel' }),
    lga2011: Object.freeze({ rotulo: 'LGA2011 (servidor/HEDT)', tipo: 'LGA', fabricante: 'Intel' }),
    lga4189: Object.freeze({ rotulo: 'LGA4189 (Xeon Scalable)', tipo: 'LGA', fabricante: 'Intel' }),
    // AMD PGA (pinos no processador, furos na placa-mãe) e AM5/TR (LGA)
    am4: Object.freeze({ rotulo: 'AM4', tipo: 'PGA', fabricante: 'AMD' }),
    am5: Object.freeze({ rotulo: 'AM5', tipo: 'LGA', fabricante: 'AMD' }),
    sp3: Object.freeze({ rotulo: 'SP3 (EPYC)', tipo: 'LGA', fabricante: 'AMD' }),
  });

  // ==========================================================================================
  // 4) PLACAS-MÃE — formato (ATX/mATX/ITX/servidor dual-socket), socket, gerações de RAM,
  //    slots PCIe/PCI/AGP, portas SATA/IDE/M.2, conector de alimentação
  // ==========================================================================================
  const FORMATO_PLACA_MAE = Object.freeze(['ATX', 'mATX', 'ITX', 'servidor-1s', 'servidor-2s', 'proprietaria-notebook']);
  const PLACAS_MAE = Object.freeze({
    pm_am4_matx_ddr4: Object.freeze({
      rotulo: 'Placa-mãe mATX AM4 (DDR4)', formato: 'mATX', socket: 'am4', conectorAlimentacao: 'ATX24',
      geracoesRam: Object.freeze(['DDR4']), formatoRam: 'DIMM', slotsRam: 4, ramMaxGb: 128,
      pcie: Object.freeze([{ tipo: 'x16', versao: 4, qtd: 1 }, { tipo: 'x1', versao: 4, qtd: 2 }]),
      pci: 0, agp: 0, sata: 4, ide: 0, m2: Object.freeze([{ pcie: 4, qtd: 1 }]),
      modelo: 'MB-A4M-D4',
    }),
    pm_am5_atx_ddr5: Object.freeze({
      rotulo: 'Placa-mãe ATX AM5 (DDR5)', formato: 'ATX', socket: 'am5', conectorAlimentacao: 'ATX24+12VHPWR',
      geracoesRam: Object.freeze(['DDR5']), formatoRam: 'DIMM', slotsRam: 4, ramMaxGb: 256,
      pcie: Object.freeze([{ tipo: 'x16', versao: 5, qtd: 1 }, { tipo: 'x4', versao: 4, qtd: 2 }, { tipo: 'x1', versao: 4, qtd: 2 }]),
      pci: 0, agp: 0, sata: 6, ide: 0, m2: Object.freeze([{ pcie: 5, qtd: 1 }, { pcie: 4, qtd: 2 }]),
      modelo: 'MB-A5A-D5',
    }),
    pm_lga1700_atx_ddr5: Object.freeze({
      rotulo: 'Placa-mãe ATX LGA1700 (DDR5)', formato: 'ATX', socket: 'lga1700', conectorAlimentacao: 'ATX24+12VHPWR',
      geracoesRam: Object.freeze(['DDR5', 'DDR4']), formatoRam: 'DIMM', slotsRam: 4, ramMaxGb: 192,
      pcie: Object.freeze([{ tipo: 'x16', versao: 5, qtd: 1 }, { tipo: 'x4', versao: 4, qtd: 1 }, { tipo: 'x1', versao: 3, qtd: 3 }]),
      pci: 0, agp: 0, sata: 6, ide: 0, m2: Object.freeze([{ pcie: 4, qtd: 3 }]),
      modelo: 'MB-L1700A-D5',
    }),
    pm_lga1155_matx_ddr3: Object.freeze({
      rotulo: 'Placa-mãe mATX LGA1155 (DDR3)', formato: 'mATX', socket: 'lga1155', conectorAlimentacao: 'ATX24',
      geracoesRam: Object.freeze(['DDR3']), formatoRam: 'DIMM', slotsRam: 2, ramMaxGb: 16,
      pcie: Object.freeze([{ tipo: 'x16', versao: 3, qtd: 1 }, { tipo: 'x1', versao: 2, qtd: 1 }]),
      pci: 1, agp: 0, sata: 4, ide: 1, m2: Object.freeze([]),
      modelo: 'MB-L1155M-D3',
    }),
    pm_lga775_atx_ddr2: Object.freeze({
      rotulo: 'Placa-mãe ATX LGA775 (DDR2, AGP legado)', formato: 'ATX', socket: 'lga775', conectorAlimentacao: 'ATX24',
      geracoesRam: Object.freeze(['DDR2']), formatoRam: 'DIMM', slotsRam: 4, ramMaxGb: 8,
      pcie: Object.freeze([{ tipo: 'x1', versao: 1, qtd: 2 }]),
      pci: 3, agp: 1, sata: 2, ide: 2, m2: Object.freeze([]),
      modelo: 'MB-L775A-D2',
    }),
    pm_itx_am4_ddr4: Object.freeze({
      rotulo: 'Placa-mãe ITX AM4 (DDR4)', formato: 'ITX', socket: 'am4', conectorAlimentacao: 'ATX24',
      geracoesRam: Object.freeze(['DDR4']), formatoRam: 'DIMM', slotsRam: 2, ramMaxGb: 64,
      pcie: Object.freeze([{ tipo: 'x16', versao: 4, qtd: 1 }]),
      pci: 0, agp: 0, sata: 2, ide: 0, m2: Object.freeze([{ pcie: 4, qtd: 1 }]),
      modelo: 'MB-A4I-D4',
    }),
    pm_servidor_lga4189_1s: Object.freeze({
      rotulo: 'Placa-mãe servidor 1 soquete LGA4189 (DDR4 ECC)', formato: 'servidor-1s', socket: 'lga4189', conectorAlimentacao: 'ATX24',
      geracoesRam: Object.freeze(['DDR4-ECC']), formatoRam: 'DIMM', slotsRam: 8, ramMaxGb: 1024,
      pcie: Object.freeze([{ tipo: 'x16', versao: 4, qtd: 4 }, { tipo: 'x8', versao: 4, qtd: 2 }]),
      pci: 0, agp: 0, sata: 8, ide: 0, m2: Object.freeze([{ pcie: 4, qtd: 2 }]),
      modelo: 'MB-SRV4189-1S',
    }),
    pm_servidor_sp3_2s: Object.freeze({
      rotulo: 'Placa-mãe servidor dual-socket SP3 (DDR4 ECC)', formato: 'servidor-2s', socket: 'sp3', conectorAlimentacao: 'ATX24',
      geracoesRam: Object.freeze(['DDR4-ECC']), formatoRam: 'DIMM', slotsRam: 16, ramMaxGb: 2048,
      pcie: Object.freeze([{ tipo: 'x16', versao: 4, qtd: 6 }]),
      pci: 0, agp: 0, sata: 8, ide: 0, m2: Object.freeze([{ pcie: 4, qtd: 2 }]),
      modelo: 'MB-SRV-SP3-2S', socketsCpu: 2,
    }),
    pm_notebook_am5: Object.freeze({
      rotulo: 'Placa de notebook (BGA soldada, classe AM5)', formato: 'proprietaria-notebook', socket: null, conectorAlimentacao: null,
      geracoesRam: Object.freeze(['DDR5']), formatoRam: 'SODIMM', slotsRam: 2, ramMaxGb: 64,
      pcie: Object.freeze([]), pci: 0, agp: 0, sata: 0, ide: 0, m2: Object.freeze([{ pcie: 4, qtd: 2 }]),
      cpuSoldado: true, // notebook típico: CPU já vem soldado na placa -- não há "socket" pra trocar
      modelo: 'MB-NB-BGA',
    }),
  });

  // ==========================================================================================
  // 5) PROCESSADORES — PGA/LGA, socket específico, geração
  // ==========================================================================================
  const CPUS = Object.freeze({
    cpu_pentium4_775: Object.freeze({ rotulo: 'Pentium 4 (LGA775)', socket: 'lga775', geracao: 'NetBurst', tdp: 84, nucleos: 1, modelo: 'CPU-P4-775' }),
    cpu_core2duo_775: Object.freeze({ rotulo: 'Core 2 Duo (LGA775)', socket: 'lga775', geracao: 'Core', tdp: 65, nucleos: 2, modelo: 'CPU-C2D-775' }),
    cpu_i3_1155: Object.freeze({ rotulo: 'Core i3 2ª/3ª ger. (LGA1155)', socket: 'lga1155', geracao: 'Sandy/Ivy Bridge', tdp: 65, nucleos: 2, modelo: 'CPU-I3-1155' }),
    cpu_i5_1155: Object.freeze({ rotulo: 'Core i5 2ª/3ª ger. (LGA1155)', socket: 'lga1155', geracao: 'Sandy/Ivy Bridge', tdp: 77, nucleos: 4, modelo: 'CPU-I5-1155' }),
    cpu_i5_1700: Object.freeze({ rotulo: 'Core i5 12ª/13ª ger. (LGA1700)', socket: 'lga1700', geracao: 'Alder/Raptor Lake', tdp: 125, nucleos: 14, modelo: 'CPU-I5-1700' }),
    cpu_i9_1700: Object.freeze({ rotulo: 'Core i9 13ª ger. (LGA1700)', socket: 'lga1700', geracao: 'Raptor Lake', tdp: 253, nucleos: 24, modelo: 'CPU-I9-1700' }),
    cpu_ryzen5_am4: Object.freeze({ rotulo: 'Ryzen 5 (AM4)', socket: 'am4', geracao: 'Zen 2/3', tdp: 65, nucleos: 6, modelo: 'CPU-R5-AM4' }),
    cpu_ryzen7_am4: Object.freeze({ rotulo: 'Ryzen 7 (AM4)', socket: 'am4', geracao: 'Zen 2/3', tdp: 105, nucleos: 8, modelo: 'CPU-R7-AM4' }),
    cpu_ryzen9_am5: Object.freeze({ rotulo: 'Ryzen 9 (AM5)', socket: 'am5', geracao: 'Zen 4/5', tdp: 170, nucleos: 16, modelo: 'CPU-R9-AM5' }),
    cpu_xeon_scalable_4189: Object.freeze({ rotulo: 'Xeon Scalable (LGA4189)', socket: 'lga4189', geracao: 'Ice Lake-SP', tdp: 205, nucleos: 32, servidor: true, modelo: 'CPU-XEON-4189' }),
    cpu_epyc_sp3: Object.freeze({ rotulo: 'EPYC (SP3)', socket: 'sp3', geracao: 'Zen 2/3', tdp: 225, nucleos: 64, servidor: true, modelo: 'CPU-EPYC-SP3' }),
    cpu_notebook_soldado: Object.freeze({ rotulo: 'CPU de notebook (soldado/BGA)', socket: null, geracao: 'Mobile', tdp: 28, nucleos: 8, soldado: true, modelo: 'CPU-NB-BGA' }),
  });

  // ==========================================================================================
  // 6) MEMÓRIA RAM — SDR/DDR1-5, DIMM/SO-DIMM
  // ==========================================================================================
  const GERACOES_RAM = Object.freeze(['SDR', 'DDR1', 'DDR2', 'DDR3', 'DDR4', 'DDR4-ECC', 'DDR5']);
  const FORMATOS_RAM = Object.freeze(['DIMM', 'SODIMM']);
  const RAM = Object.freeze({
    ram_sdr_256_dimm: Object.freeze({ rotulo: 'SDRAM 256MB (DIMM)', geracao: 'SDR', formato: 'DIMM', gb: 0.25, modelo: 'RAM-SDR-256' }),
    ram_ddr1_1g_dimm: Object.freeze({ rotulo: 'DDR1 1GB (DIMM)', geracao: 'DDR1', formato: 'DIMM', gb: 1, modelo: 'RAM-D1-1G' }),
    ram_ddr2_2g_dimm: Object.freeze({ rotulo: 'DDR2 2GB (DIMM)', geracao: 'DDR2', formato: 'DIMM', gb: 2, modelo: 'RAM-D2-2G' }),
    ram_ddr3_4g_dimm: Object.freeze({ rotulo: 'DDR3 4GB (DIMM)', geracao: 'DDR3', formato: 'DIMM', gb: 4, modelo: 'RAM-D3-4G' }),
    ram_ddr3_4g_sodimm: Object.freeze({ rotulo: 'DDR3 4GB (SO-DIMM, notebook)', geracao: 'DDR3', formato: 'SODIMM', gb: 4, modelo: 'RAM-D3-4G-SO' }),
    ram_ddr4_8g_dimm: Object.freeze({ rotulo: 'DDR4 8GB (DIMM)', geracao: 'DDR4', formato: 'DIMM', gb: 8, modelo: 'RAM-D4-8G' }),
    ram_ddr4_16g_dimm: Object.freeze({ rotulo: 'DDR4 16GB (DIMM)', geracao: 'DDR4', formato: 'DIMM', gb: 16, modelo: 'RAM-D4-16G' }),
    ram_ddr4_16g_sodimm: Object.freeze({ rotulo: 'DDR4 16GB (SO-DIMM, notebook)', geracao: 'DDR4', formato: 'SODIMM', gb: 16, modelo: 'RAM-D4-16G-SO' }),
    ram_ddr4ecc_32g_dimm: Object.freeze({ rotulo: 'DDR4 32GB ECC (DIMM, servidor)', geracao: 'DDR4-ECC', formato: 'DIMM', gb: 32, modelo: 'RAM-D4E-32G' }),
    ram_ddr5_16g_dimm: Object.freeze({ rotulo: 'DDR5 16GB (DIMM)', geracao: 'DDR5', formato: 'DIMM', gb: 16, modelo: 'RAM-D5-16G' }),
    ram_ddr5_32g_dimm: Object.freeze({ rotulo: 'DDR5 32GB (DIMM)', geracao: 'DDR5', formato: 'DIMM', gb: 32, modelo: 'RAM-D5-32G' }),
    ram_ddr5_32g_sodimm: Object.freeze({ rotulo: 'DDR5 32GB (SO-DIMM, notebook)', geracao: 'DDR5', formato: 'SODIMM', gb: 32, modelo: 'RAM-D5-32G-SO' }),
  });

  // ==========================================================================================
  // 7) ARMAZENAMENTO — IDE/SATA2/SATA3 3.5"/2.5", M.2 NVMe por geração PCIe
  // ==========================================================================================
  const INTERFACES_ARMAZENAMENTO = Object.freeze(['IDE', 'SATA2', 'SATA3', 'M2-NVME']);
  const ARMAZENAMENTO = Object.freeze({
    hd_ide_40g: Object.freeze({ rotulo: 'HD IDE 40GB (3.5")', interface: 'IDE', formato: '3.5', gb: 40, tipo: 'HDD', modelo: 'HDD-IDE-40G' }),
    hd_sata2_500g: Object.freeze({ rotulo: 'HD SATA2 500GB (3.5")', interface: 'SATA2', formato: '3.5', gb: 500, tipo: 'HDD', modelo: 'HDD-S2-500G' }),
    hd_sata3_2tb: Object.freeze({ rotulo: 'HD SATA3 2TB (3.5")', interface: 'SATA3', formato: '3.5', gb: 2000, tipo: 'HDD', modelo: 'HDD-S3-2T' }),
    hd_sata3_4tb: Object.freeze({ rotulo: 'HD SATA3 4TB (3.5", servidor/storage)', interface: 'SATA3', formato: '3.5', gb: 4000, tipo: 'HDD', modelo: 'HDD-S3-4T' }),
    ssd_sata2_120g: Object.freeze({ rotulo: 'SSD SATA2 120GB (2.5")', interface: 'SATA2', formato: '2.5', gb: 120, tipo: 'SSD', modelo: 'SSD-S2-120G' }),
    ssd_sata3_500g: Object.freeze({ rotulo: 'SSD SATA3 500GB (2.5")', interface: 'SATA3', formato: '2.5', gb: 500, tipo: 'SSD', modelo: 'SSD-S3-500G' }),
    ssd_sata3_1tb: Object.freeze({ rotulo: 'SSD SATA3 1TB (2.5")', interface: 'SATA3', formato: '2.5', gb: 1000, tipo: 'SSD', modelo: 'SSD-S3-1T' }),
    nvme_pcie3_500g: Object.freeze({ rotulo: 'SSD M.2 NVMe PCIe 3.0 500GB', interface: 'M2-NVME', formato: 'M2', gb: 500, tipo: 'SSD', pcie: 3, modelo: 'NVME-P3-500G' }),
    nvme_pcie4_1tb: Object.freeze({ rotulo: 'SSD M.2 NVMe PCIe 4.0 1TB', interface: 'M2-NVME', formato: 'M2', gb: 1000, tipo: 'SSD', pcie: 4, modelo: 'NVME-P4-1T' }),
    nvme_pcie5_2tb: Object.freeze({ rotulo: 'SSD M.2 NVMe PCIe 5.0 2TB', interface: 'M2-NVME', formato: 'M2', gb: 2000, tipo: 'SSD', pcie: 5, modelo: 'NVME-P5-2T' }),
  });

  // ==========================================================================================
  // 8) PLACAS OFFBOARD — PCI/AGP/PCIe x1/x4/x16 (GPU, rede, Wi-Fi, RAID/SAS, som)
  // ==========================================================================================
  const BARRAMENTOS_OFFBOARD = Object.freeze(['PCI', 'AGP', 'PCIe-x1', 'PCIe-x4', 'PCIe-x8', 'PCIe-x16']);
  const CATEGORIAS_OFFBOARD = Object.freeze(['GPU', 'rede', 'wifi', 'raid-sas', 'som', 'captura']);
  const OFFBOARD = Object.freeze({
    gpu_agp: Object.freeze({ rotulo: 'GPU AGP (legado)', categoria: 'GPU', barramento: 'AGP', watts: 40, modelo: 'GPU-AGP' }),
    gpu_pci: Object.freeze({ rotulo: 'GPU PCI (legado)', categoria: 'GPU', barramento: 'PCI', watts: 25, modelo: 'GPU-PCI' }),
    gpu_pcie_x16_entrada: Object.freeze({ rotulo: 'GPU PCIe x16 (entrada)', categoria: 'GPU', barramento: 'PCIe-x16', watts: 120, modelo: 'GPU-X16-E' }),
    gpu_pcie_x16_topo: Object.freeze({ rotulo: 'GPU PCIe x16 (topo de linha, exige 12VHPWR)', categoria: 'GPU', barramento: 'PCIe-x16', watts: 450, exigeConectorPsu: '12VHPWR', modelo: 'GPU-X16-TOP' }),
    placa_rede_pci: Object.freeze({ rotulo: 'Placa de rede Gigabit (PCI)', categoria: 'rede', barramento: 'PCI', watts: 5, modelo: 'NIC-PCI-1G' }),
    placa_rede_pcie_x1: Object.freeze({ rotulo: 'Placa de rede Gigabit (PCIe x1)', categoria: 'rede', barramento: 'PCIe-x1', watts: 5, modelo: 'NIC-X1-1G' }),
    placa_rede_10g_pcie_x4: Object.freeze({ rotulo: 'Placa de rede 10G (PCIe x4)', categoria: 'rede', barramento: 'PCIe-x4', watts: 10, modelo: 'NIC-X4-10G' }),
    placa_wifi_pcie_x1: Object.freeze({ rotulo: 'Placa Wi-Fi 6E (PCIe x1)', categoria: 'wifi', barramento: 'PCIe-x1', watts: 4, modelo: 'WIFI-X1-6E' }),
    placa_raid_sas_pcie_x8: Object.freeze({ rotulo: 'Controladora RAID/SAS (PCIe x8, servidor)', categoria: 'raid-sas', barramento: 'PCIe-x8', watts: 15, modelo: 'RAID-X8-SAS' }),
    placa_som_pci: Object.freeze({ rotulo: 'Placa de som (PCI)', categoria: 'som', barramento: 'PCI', watts: 3, modelo: 'SND-PCI' }),
    placa_som_pcie_x1: Object.freeze({ rotulo: 'Placa de som (PCIe x1)', categoria: 'som', barramento: 'PCIe-x1', watts: 3, modelo: 'SND-X1' }),
    placa_captura_pcie_x4: Object.freeze({ rotulo: 'Placa de captura de vídeo (PCIe x4)', categoria: 'captura', barramento: 'PCIe-x4', watts: 8, modelo: 'CAP-X4' }),
  });

  // ==========================================================================================
  // 9) FUNÇÕES DE VALIDAÇÃO — a "matriz de compatibilidade" propriamente dita
  // ==========================================================================================

  /** Slots de barramento de uma placa-mãe, "achatados" em uma lista de strings tipo
   *  BARRAMENTOS_OFFBOARD (ex.: placa com `pcie:[{tipo:'x16',qtd:1}]` -> `['PCIe-x16']`),
   *  concatenada com `pci`/`agp` (contagem simples, sem "tipo/versão"). */
  function _slotsOffboardDaPlaca(placaMae) {
    const lista = [];
    (placaMae.pcie || []).forEach((s) => { for (let i = 0; i < s.qtd; i++) lista.push({ barramento: 'PCIe-' + s.tipo, versaoPcie: s.versao }); });
    for (let i = 0; i < (placaMae.pci || 0); i++) lista.push({ barramento: 'PCI' });
    for (let i = 0; i < (placaMae.agp || 0); i++) lista.push({ barramento: 'AGP' });
    return lista;
  }

  /**
   * `ehCompativel(componenteA, componenteB)` — pedido verbatim do usuário: função central da
   * matriz de compatibilidade. Cada argumento é `{ familia, chave }` (`familia` = uma das chaves
   * de CATALOGOS abaixo: 'placaMae'|'cpu'|'ram'|'armazenamento'|'offboard'|'fonte'; `chave` = a
   * chave do item dentro do catálogo daquela família, ex. `{familia:'cpu', chave:'cpu_i5_1700'}`).
   * Resolve o PAR de famílias reconhecido e devolve `{ ok, motivo }` — `motivo` (string, vazio se
   * `ok`) explica a incompatibilidade em português, pronto pra mostrar na UI.
   */
  function ehCompativel(componenteA, componenteB) {
    if (!componenteA || !componenteB) return { ok: false, motivo: 'Componente ausente.' };
    // normaliza pra sempre testar na mesma ordem (independente de quem o chamador passou primeiro)
    const ORDEM = ['chassi', 'placaMae', 'fonte', 'cpu', 'ram', 'armazenamento', 'offboard'];
    let a = componenteA, b = componenteB;
    if (ORDEM.indexOf(a.familia) > ORDEM.indexOf(b.familia)) { const t = a; a = b; b = t; }
    const par = a.familia + '->' + b.familia;
    const A = CATALOGOS[a.familia] && CATALOGOS[a.familia][a.chave];
    const B = CATALOGOS[b.familia] && CATALOGOS[b.familia][b.chave];
    if (!A || !B) return { ok: false, motivo: 'Chave de catálogo desconhecida (' + a.familia + '/' + a.chave + ' ou ' + b.familia + '/' + b.chave + ').' };

    switch (par) {
      case 'placaMae->cpu': {
        if (B.soldado || A.cpuSoldado) return { ok: false, motivo: 'CPU soldado nesta placa (típico de notebook) — não é trocável.' };
        if (A.socket !== B.socket) return { ok: false, motivo: `Socket incompatível: placa-mãe usa ${SOCKETS_CPU[A.socket]?.rotulo || A.socket}, CPU é ${SOCKETS_CPU[B.socket]?.rotulo || B.socket}.` };
        return { ok: true, motivo: '' };
      }
      case 'placaMae->ram': {
        if (!A.geracoesRam.includes(B.geracao)) return { ok: false, motivo: `Geração de RAM incompatível: placa-mãe aceita ${A.geracoesRam.join('/')}, pente é ${B.geracao}.` };
        if (A.formatoRam !== B.formato) return { ok: false, motivo: `Formato físico incompatível: placa-mãe usa ${A.formatoRam}, pente é ${B.formato}.` };
        return { ok: true, motivo: '' };
      }
      case 'placaMae->armazenamento': {
        if (B.interface === 'IDE') return A.ide > 0 ? { ok: true, motivo: '' } : { ok: false, motivo: 'Placa-mãe não tem porta IDE.' };
        if (B.interface === 'SATA2' || B.interface === 'SATA3') return A.sata > 0 ? { ok: true, motivo: '' } : { ok: false, motivo: 'Placa-mãe não tem porta SATA.' };
        if (B.interface === 'M2-NVME') {
          const slot = (A.m2 || []).find((s) => s.pcie >= 1);
          if (!slot) return { ok: false, motivo: 'Placa-mãe não tem slot M.2.' };
          return { ok: true, motivo: B.pcie > slot.pcie ? `Compatível, mas SUBUTILIZADO: SSD é PCIe ${B.pcie}.0, slot só entrega PCIe ${slot.pcie}.0 (funciona na velocidade do slot).` : '' };
        }
        return { ok: false, motivo: 'Interface de armazenamento desconhecida.' };
      }
      case 'placaMae->offboard': {
        const exigido = B.barramento;
        if (exigido === 'PCI') return A.pci > 0 ? { ok: true, motivo: '' } : { ok: false, motivo: 'Placa-mãe não tem slot PCI.' };
        if (exigido === 'AGP') return A.agp > 0 ? { ok: true, motivo: '' } : { ok: false, motivo: 'Placa-mãe não tem slot AGP.' };
        // PCIe-xN: um slot xN físico aceita placas xN ou menores (x1 cabe em x16, não o contrário)
        const n = Number(String(exigido).split('-x')[1]);
        const slots = _slotsOffboardDaPlaca(A).filter((s) => s.barramento.startsWith('PCIe-'));
        const cabe = slots.find((s) => Number(s.barramento.split('-x')[1]) >= n);
        if (!cabe) return { ok: false, motivo: `Placa-mãe não tem slot PCIe x${n} (ou maior) livre.` };
        return { ok: true, motivo: '' };
      }
      case 'fonte->cpu': return { ok: true, motivo: '' }; // fonte não depende do socket, só de wattagem (ver validarMontagem)
      case 'fonte->offboard': {
        if (B.exigeConectorPsu && A.conector !== B.exigeConectorPsu && !A.conector.includes(B.exigeConectorPsu)) {
          return { ok: false, motivo: `Esta placa exige conector ${B.exigeConectorPsu}, fonte selecionada não tem.` };
        }
        return { ok: true, motivo: '' };
      }
      case 'chassi->placaMae': {
        const chassi = CATALOGOS.chassi[a.chave] || CHASSIS[a.chave];
        if (!chassi) return { ok: false, motivo: 'Chassi desconhecido.' };
        if (!chassi.formatosPlacaMae.includes(B.formato)) return { ok: false, motivo: `Chassi ${chassi.rotulo} não aceita placa-mãe formato ${B.formato} (aceita: ${chassi.formatosPlacaMae.join(', ')}).` };
        return { ok: true, motivo: '' };
      }
      default:
        return { ok: false, motivo: `Par de famílias não coberto pela matriz de compatibilidade: ${par}.` };
    }
  }

  /**
   * `encaixesValidos(chassi, tipoComponente)` — pedido verbatim. `chassi` = chave de CHASSIS
   * (ou o objeto já resolvido). `tipoComponente` = 'fonte'|'placaMae'|'offboard'|'drive'.
   * Devolve `{ total, ocupados, livres }` — `ocupados` é opcional (0 se não informado), pensado
   * pra UI mostrar "3 de 7 slots PCIe livres" etc. Lança se o tipo for desconhecido.
   */
  function encaixesValidos(chassi, tipoComponente, ocupadosAtual) {
    const c = typeof chassi === 'string' ? CHASSIS[chassi] : chassi;
    if (!c) throw new Error('Chassi desconhecido: ' + chassi);
    if (!(tipoComponente in c.encaixes)) throw new Error('Tipo de componente desconhecido: ' + tipoComponente);
    const total = c.encaixes[tipoComponente];
    const ocupados = Math.max(0, Number(ocupadosAtual) || 0);
    return { total, ocupados, livres: Math.max(0, total - ocupados) };
  }

  /**
   * `validarMontagem(montagem)` — checagem de ALTO NÍVEL de uma montagem inteira (não só um par):
   * `montagem = { chassi, fonte, placaMae, cpu, ram:[chaves], armazenamento:[chaves], offboard:[chaves] }`
   * (todas as chaves são chaves de catálogo, ex. `chassi:'pc_gabinete'`). Devolve
   * `{ ok, problemas:[string] }` — roda TODOS os pares relevantes via `ehCompativel` e soma
   * também a checagem de WATTAGEM total (soma de `watts` de CPU+offboard+drives vs `fonte.watts`,
   * com folga de 20% recomendada — abaixo disso gera aviso, não bloqueia).
   */
  function validarMontagem(m) {
    const problemas = [];
    if (!m || !m.chassi) return { ok: false, problemas: ['Nenhum chassi selecionado.'] };
    const chassi = CHASSIS[m.chassi];
    if (!chassi) return { ok: false, problemas: [`Chassi desconhecido: ${m.chassi}`] };

    if (m.placaMae) {
      const r = ehCompativel({ familia: 'chassi', chave: m.chassi }, { familia: 'placaMae', chave: m.placaMae });
      if (!r.ok) problemas.push(r.motivo);
    }
    if (m.placaMae && m.cpu) {
      const r = ehCompativel({ familia: 'placaMae', chave: m.placaMae }, { familia: 'cpu', chave: m.cpu });
      if (!r.ok) problemas.push(r.motivo);
    }
    if (m.placaMae && Array.isArray(m.ram)) {
      m.ram.forEach((chaveRam) => {
        const r = ehCompativel({ familia: 'placaMae', chave: m.placaMae }, { familia: 'ram', chave: chaveRam });
        if (!r.ok) problemas.push(`RAM "${RAM[chaveRam]?.rotulo || chaveRam}": ${r.motivo}`);
      });
      const placa = PLACAS_MAE[m.placaMae];
      if (placa && m.ram.length > placa.slotsRam) problemas.push(`Placa-mãe tem ${placa.slotsRam} slot(s) de RAM, ${m.ram.length} pente(s) foram instalados.`);
    }
    if (m.placaMae && Array.isArray(m.armazenamento)) {
      m.armazenamento.forEach((chaveDrive) => {
        const r = ehCompativel({ familia: 'placaMae', chave: m.placaMae }, { familia: 'armazenamento', chave: chaveDrive });
        if (!r.ok) problemas.push(`Armazenamento "${ARMAZENAMENTO[chaveDrive]?.rotulo || chaveDrive}": ${r.motivo}`);
      });
      const enc = encaixesValidos(chassi, 'drive', m.armazenamento.length);
      if (enc.ocupados > enc.total) problemas.push(`Chassi tem ${enc.total} baia(s) de armazenamento, ${enc.ocupados} unidade(s) foram instaladas.`);
    }
    if (m.placaMae && Array.isArray(m.offboard)) {
      m.offboard.forEach((chaveOff) => {
        const r = ehCompativel({ familia: 'placaMae', chave: m.placaMae }, { familia: 'offboard', chave: chaveOff });
        if (!r.ok) problemas.push(`Placa offboard "${OFFBOARD[chaveOff]?.rotulo || chaveOff}": ${r.motivo}`);
        if (m.fonte) {
          const rf = ehCompativel({ familia: 'fonte', chave: m.fonte }, { familia: 'offboard', chave: chaveOff });
          if (!rf.ok) problemas.push(`Placa offboard "${OFFBOARD[chaveOff]?.rotulo || chaveOff}": ${rf.motivo}`);
        }
      });
      const enc = encaixesValidos(chassi, 'offboard', m.offboard.length);
      if (enc.ocupados > enc.total) problemas.push(`Chassi tem ${enc.total} slot(s) offboard, ${enc.ocupados} placa(s) foram instaladas.`);
    }
    if (m.fonte) {
      const fonte = FONTES[m.fonte];
      if (!fonte) problemas.push(`Fonte desconhecida: ${m.fonte}`);
      else {
        const wattsNecessarios = (m.cpu && CPUS[m.cpu]?.tdp || 0)
          + (Array.isArray(m.offboard) ? m.offboard.reduce((s, k) => s + (OFFBOARD[k]?.watts || 0), 0) : 0)
          + (Array.isArray(m.armazenamento) ? m.armazenamento.length * 8 : 0) // ~8W médio por HD/SSD
          + 40; // placa-mãe + ventoinhas, estimativa fixa
        if (wattsNecessarios > fonte.watts) problemas.push(`Fonte de ${fonte.watts}W insuficiente: a montagem consome ~${wattsNecessarios}W.`);
        else if (wattsNecessarios > fonte.watts * 0.8) problemas.push(`AVISO: fonte de ${fonte.watts}W está no limite (~${wattsNecessarios}W, recomendado manter até 80% da capacidade).`);
      }
    }
    if (chassi.encaixes.fonte === 0 && m.fonte) problemas.push(`${chassi.rotulo} não tem fonte interna trocável (fonte externa/carregador).`);

    return { ok: problemas.filter((p) => !p.startsWith('AVISO:')).length === 0, problemas };
  }

  // Índice de todos os catálogos por "família" (usado por `ehCompativel`/relatórios genéricos).
  const CATALOGOS = Object.freeze({
    chassi: CHASSIS, fonte: FONTES, placaMae: PLACAS_MAE, cpu: CPUS, ram: RAM,
    armazenamento: ARMAZENAMENTO, offboard: OFFBOARD, socketCpu: SOCKETS_CPU,
  });

  const API = {
    CHASSIS, FONTES, PLACAS_MAE, CPUS, RAM, ARMAZENAMENTO, OFFBOARD, SOCKETS_CPU,
    CONECTOR_PSU, EFICIENCIA_80PLUS, FORMATO_PLACA_MAE, GERACOES_RAM, FORMATOS_RAM,
    INTERFACES_ARMAZENAMENTO, BARRAMENTOS_OFFBOARD, CATEGORIAS_OFFBOARD, CATALOGOS,
    ehCompativel, encaixesValidos, validarMontagem,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.HardwareCatalog = API;
})(typeof window !== 'undefined' ? window : globalThis);
