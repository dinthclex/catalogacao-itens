/*
 * js/rede-storage-energia.js
 * [19/09/2026 UTC] NOVO (RODADA 171)
 *
 * Classes de LÓGICA (sem Three.js, sem DOM) para os novos objetos de TI do catálogo de
 * infraestrutura de redes: No-break/UPS, Storage (NAS/SAN/Disk Shelf) e Unidades de Disco
 * (HD/SSD). Mesmo padrão UMD dos demais módulos "de lógica" do projeto (rede-passiva.js,
 * rack-modular.js): `window.RedeStorageEnergia` no navegador, exportável no Node (permite
 * escrever testes headless sem depender de navegador — importante nesta sessão, que não teve
 * acesso a `device_bash`/navegador o tempo todo).
 *
 * Pedido do usuário (resumo, verbatim nas partes-chave):
 *   "Crie a classe 'StorageDevice' e a classe 'DriveUnit'. Implemente as funções:
 *    storage.insertDrive(driveUnit, slotIndex) ... storage.removeDrive(slotIndex) ...
 *    ups.calculateLoad(totalWatts) ..."
 *
 * Este arquivo é só a CAMADA DE LÓGICA/ESTADO (gerenciamento interno de discos, fórmulas de
 * autonomia, eventos de inserção). A integração visual 3D (malha do slot mudando ao inserir um
 * disco, drag-and-drop de verdade no "Ver em 3D") NÃO foi implementada nesta sessão -- ver
 * RESSALVA no final (RODADA 171). O visual estático das baias (furo +
 * tampa) já existe em js/rede-equip.js (`_construirPassivo`, familia 'storage').
 */
(function (raiz) {
  'use strict';

  // ==========================================================================
  // 1) DriveUnit -- unidade de disco (HD/SSD), objeto pequeno e independente
  // ==========================================================================
  const TECNOLOGIAS_VALIDAS = ['HDD_SATA', 'HDD_SAS', 'SSD_SATA', 'SSD_NVMe'];
  const STATUS_VALIDOS = ['healthy', 'failed', 'empty'];
  const FORMATOS_VALIDOS = ['2.5', '3.5'];

  class DriveUnit {
    /**
     * @param {object} opt
     *   tecnologia: 'HDD_SATA'|'HDD_SAS'|'SSD_SATA'|'SSD_NVMe'
     *   capacidadeTB: number (ex.: 4, 8, 1.92)
     *   status: 'healthy'|'failed'|'empty' (default 'healthy')
     *   formato: '2.5'|'3.5' (default: SSD -> '2.5', HDD -> '3.5')
     *   wattsAtivo: consumo (W) quando instalado e girando/ativo (default por tecnologia)
     */
    constructor(opt) {
      opt = opt || {};
      if (!TECNOLOGIAS_VALIDAS.includes(opt.tecnologia)) throw new RangeError('DriveUnit: tecnologia inválida: ' + opt.tecnologia);
      this.id = opt.id || ('disco_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4));
      this.tecnologia = opt.tecnologia;
      this.capacidadeTB = Number(opt.capacidadeTB) || 0;
      this.status = STATUS_VALIDOS.includes(opt.status) ? opt.status : 'healthy';
      this.formato = FORMATOS_VALIDOS.includes(opt.formato) ? opt.formato : (this.tecnologia.startsWith('SSD') ? '2.5' : '3.5');
      // Consumo típico por tecnologia (W), usado por UPSDevice.calculateLoad quando o chamador
      // não informa o total já somado -- valores de referência de mercado, não fabricante real.
      const WATTS_PADRAO = { HDD_SATA: 7, HDD_SAS: 9, SSD_SATA: 3, SSD_NVMe: 6 };
      this.wattsAtivo = opt.wattsAtivo != null ? Number(opt.wattsAtivo) : WATTS_PADRAO[this.tecnologia];
      // Preenchido por StorageDevice.insertDrive/removeDrive -- não setar na mão.
      this.slotIndex = null;
      this.storageId = null;
    }
    /** Consumo efetivo (0 se status 'failed' -- disco morto não gira/consome pouco, mas aqui
     *  simplificamos como 0 pra ele não contar na carga do no-break). */
    wattsConsumidos() { return this.status === 'failed' ? 0 : this.wattsAtivo; }
  }

  // ==========================================================================
  // 2) StorageDevice -- NAS/SAN/Disk Shelf com baias (drive bays) dinâmicas
  // ==========================================================================
  class StorageDevice {
    /**
     * @param {object} opt
     *   tipo: chave do catálogo (RedeEquip.REDE_CATALOGO.TIPOS), ex. 'storage_24'
     *   nBaias: número de baias (se omitido, lido de RedeEquip.especificar(tipo).baias)
     *   watts: consumo do CHASSI (controladoras/fonte), sem contar os discos (opcional; lido do
     *          catálogo se disponível)
     */
    constructor(opt) {
      opt = opt || {};
      const RE = raiz.RedeEquip;
      const spec = (RE && opt.tipo) ? RE.especificar(opt.tipo) : null;
      this.id = opt.id || ('storage_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4));
      this.tipo = opt.tipo || null;
      this.nBaias = opt.nBaias != null ? Number(opt.nBaias) : ((spec && spec.baias) || 0);
      if (!this.nBaias || this.nBaias < 1) throw new RangeError('StorageDevice: nBaias inválido: ' + this.nBaias);
      this.wattsChassi = opt.watts != null ? Number(opt.watts) : ((spec && spec.watts) || 0);
      // `slots[i]` = DriveUnit instalado no slot `i` (0-based), ou null (vazio).
      this.slots = new Array(this.nBaias).fill(null);
      this.totalCapacity = 0;   // TB -- soma dos discos instalados (recalculada a cada insert/remove)
      // Callbacks opcionais (usados pela integração 3D/UI, quando existir): (storage, slotIndex, drive) => void.
      this.onInsert = typeof opt.onInsert === 'function' ? opt.onInsert : null;
      this.onRemove = typeof opt.onRemove === 'function' ? opt.onRemove : null;
    }
    /** Recalcula `totalCapacity` a partir do estado atual de `slots` -- chamada internamente
     *  por insertDrive/removeDrive; exposta também pra quem quiser forçar um recálculo manual
     *  (ex.: depois de editar `capacidadeTB` de um disco já instalado). */
    _recalcularCapacidade() {
      this.totalCapacity = this.slots.reduce((soma, d) => soma + (d ? d.capacidadeTB : 0), 0);
      return this.totalCapacity;
    }
    /** Insere `driveUnit` no slot `slotIndex` (0-based). Simula "abrir a gaveta, inserir o
     *  disco, fechar" -- hot-swap, não precisa desligar nada. Retorna { ok, erro? }.
     *  Efeitos: (1) grava o disco no array `slots`; (2) marca `driveUnit.slotIndex`/`storageId`;
     *  (3) recalcula `totalCapacity`; (4) chama `onInsert` (gancho pra "adicionar a malha/elemento
     *  do HD" no lado visual, quando existir integração 3D). */
    insertDrive(driveUnit, slotIndex) {
      if (!(driveUnit instanceof DriveUnit)) return { ok: false, erro: 'insertDrive: driveUnit inválido (esperado instância de DriveUnit).' };
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.nBaias) return { ok: false, erro: 'insertDrive: slotIndex fora do intervalo (0..' + (this.nBaias - 1) + ').' };
      if (this.slots[slotIndex]) return { ok: false, erro: 'insertDrive: slot ' + slotIndex + ' já está ocupado.' };
      if (driveUnit.storageId) return { ok: false, erro: 'insertDrive: este disco já está instalado em outro storage/slot -- remova antes de reinstalar.' };
      this.slots[slotIndex] = driveUnit;
      driveUnit.slotIndex = slotIndex;
      driveUnit.storageId = this.id;
      this._recalcularCapacidade();
      if (this.onInsert) this.onInsert(this, slotIndex, driveUnit);
      return { ok: true };
    }
    /** Remove o disco do slot `slotIndex` -- "abre a gaveta e puxa o disco". Retorna
     *  { ok, driveUnit? } (o disco removido, pra quem chamou poder reaproveitá-lo em outro
     *  slot/storage). Efeitos: esvazia o slot, recalcula `totalCapacity`, chama `onRemove`. */
    removeDrive(slotIndex) {
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.nBaias) return { ok: false, erro: 'removeDrive: slotIndex fora do intervalo (0..' + (this.nBaias - 1) + ').' };
      const driveUnit = this.slots[slotIndex];
      if (!driveUnit) return { ok: false, erro: 'removeDrive: slot ' + slotIndex + ' já está vazio.' };
      this.slots[slotIndex] = null;
      driveUnit.slotIndex = null;
      driveUnit.storageId = null;
      this._recalcularCapacidade();
      if (this.onRemove) this.onRemove(this, slotIndex, driveUnit);
      return { ok: true, driveUnit };
    }
    /** Consumo total (W): chassi + soma dos discos instalados e não-'failed'. Usado por
     *  UPSDevice.calculateLoad quando este storage está entre os dispositivos alimentados. */
    wattsConsumidos() {
      return this.wattsChassi + this.slots.reduce((soma, d) => soma + (d ? d.wattsConsumidos() : 0), 0);
    }
    /** Resumo pra UI (menu 3D, ficha de propriedades etc.). */
    resumo() {
      const ocupados = this.slots.filter(Boolean).length;
      return { nBaias: this.nBaias, ocupados, livres: this.nBaias - ocupados, totalCapacity: this.totalCapacity, watts: this.wattsConsumidos() };
    }
  }

  // ==========================================================================
  // 3) UPSDevice -- No-break/UPS: carga (W), autonomia restante, saídas ligadas
  // ==========================================================================
  class UPSDevice {
    /**
     * @param {object} opt
     *   tipo: chave do catálogo (ex. 'nobreak_2u', 'nobreak_corporativo')
     *   potenciaVA / autonomiaMinutos / tipoUps: lidos do catálogo se omitidos
     *   fatorPotencia: VA -> W (default 0.9, típico de UPS "Interactive"/"Online")
     */
    constructor(opt) {
      opt = opt || {};
      const RE = raiz.RedeEquip;
      const spec = (RE && opt.tipo) ? RE.especificar(opt.tipo) : null;
      this.id = opt.id || ('ups_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4));
      this.tipo = opt.tipo || null;
      this.potenciaVA = opt.potenciaVA != null ? Number(opt.potenciaVA) : ((spec && spec.potenciaVA) || 0);
      this.autonomiaMinutosNominal = opt.autonomiaMinutos != null ? Number(opt.autonomiaMinutos) : ((spec && spec.autonomiaMinutos) || 0);
      this.tipoUps = opt.tipoUps || (spec && spec.tipoUps) || 'Interactive';
      this.fatorPotencia = opt.fatorPotencia != null ? Number(opt.fatorPotencia) : 0.9;
      if (!this.potenciaVA || !this.autonomiaMinutosNominal) throw new RangeError('UPSDevice: potenciaVA/autonomiaMinutos inválidos.');
      // Dispositivos conectados às saídas (ex.: StorageDevice, ou qualquer objeto com
      // .wattsConsumidos() -- inclusive um switch/rack cujo consumo já esteja modelado assim em
      // outra parte do app; a função é agnóstica ao tipo, só exige o método).
      this.dispositivosLigados = [];
      // Última carga calculada (W) e autonomia restante (min) -- cache do último calculateLoad().
      this.cargaAtualWatts = 0;
      this.autonomiaRestanteMinutos = this.autonomiaMinutosNominal;
    }
    /** Potência nominal MÁXIMA suportada em Watts (VA * fator de potência -- aproximação padrão
     *  de mercado pra UPS sem o dado exato do fabricante). */
    potenciaMaximaWatts() { return this.potenciaVA * this.fatorPotencia; }
    /** Conecta um dispositivo (algo com `.wattsConsumidos()`, ex. StorageDevice, switch modelado
     *  com consumo) a esta UPS -- representa "plugar na régua de tomadas alimentada por este
     *  no-break". Não modela a PDU como objeto separado aqui (isso é o `pdu8`/`_especPdu` do
     *  catálogo 2D/3D); esta classe soma direto os consumos dos dispositivos passados. */
    plugarDispositivo(dispositivo) {
      if (!dispositivo || typeof dispositivo.wattsConsumidos !== 'function') throw new TypeError('UPSDevice.plugarDispositivo: dispositivo precisa ter wattsConsumidos().');
      if (!this.dispositivosLigados.includes(dispositivo)) this.dispositivosLigados.push(dispositivo);
    }
    desplugarDispositivo(dispositivo) {
      const i = this.dispositivosLigados.indexOf(dispositivo);
      if (i >= 0) this.dispositivosLigados.splice(i, 1);
    }
    /**
     * Soma o consumo (W) de TODOS os dispositivos ativos plugados (switches, storages etc.) e
     * atualiza dinamicamente a autonomia restante da bateria.
     *
     * @param {number} [totalWatts] -- se informado, USA ESTE VALOR diretamente como carga total
     *   (pedido literal do usuário: "ups.calculateLoad(totalWatts): Função que soma o consumo em
     *   Watts de todos os dispositivos ativos... e atualiza dinamicamente a autonomia restante").
     *   Se omitido, soma `wattsConsumidos()` de cada item em `this.dispositivosLigados`.
     *
     * FÓRMULA DE AUTONOMIA (linear, aproximação padrão de datasheet de no-break -- a relação
     * real "carga x tempo" de uma bateria chumbo-ácida/Li-ion não é perfeitamente linear, mas é
     * a aproximação que todo fabricante usa nas tabelas de autonomia por carga, e é a mais
     * defensável sem uma curva de descarga real do fabricante):
     *
     *   autonomiaMinutos = autonomiaMinutosNominal * (potenciaMaximaWatts / cargaAtualWatts)
     *
     * Ou seja: autonomia NOMINAL é definida numa carga de referência de 100% (`potenciaMaximaWatts`);
     * com METADE da carga, a bateria dura O DOBRO (proporção inversa) -- limitado a
     * `autonomiaMinutosNominal * 2` como teto (bateria não dura infinito com carga ~0) e a 0 (nunca
     * negativo). Se `cargaAtualWatts` ultrapassa `potenciaMaximaWatts` (sobrecarga), a autonomia
     * cai proporcionalmente abaixo do nominal (o no-break real entraria em alarme/desligaria -- ver
     * `sobrecarregado` no retorno).
     */
    calculateLoad(totalWatts) {
      const carga = totalWatts != null ? Number(totalWatts) : this.dispositivosLigados.reduce((soma, d) => soma + d.wattsConsumidos(), 0);
      this.cargaAtualWatts = Math.max(0, carga);
      const pMax = this.potenciaMaximaWatts();
      let autonomia;
      if (this.cargaAtualWatts <= 0) autonomia = this.autonomiaMinutosNominal * 2;              // sem carga: teto de 2x o nominal
      else autonomia = this.autonomiaMinutosNominal * (pMax / this.cargaAtualWatts);
      autonomia = Math.max(0, Math.min(autonomia, this.autonomiaMinutosNominal * 2));
      this.autonomiaRestanteMinutos = Math.round(autonomia * 10) / 10;
      return {
        cargaWatts: this.cargaAtualWatts,
        cargaPercentual: pMax > 0 ? Math.round((this.cargaAtualWatts / pMax) * 1000) / 10 : 0,   // 1 casa decimal
        autonomiaMinutos: this.autonomiaRestanteMinutos,
        sobrecarregado: this.cargaAtualWatts > pMax,
      };
    }
  }

  // ==========================================================================
  // 4) Export UMD
  // ==========================================================================
  const API = { DriveUnit, StorageDevice, UPSDevice, TECNOLOGIAS_VALIDAS, STATUS_VALIDOS, FORMATOS_VALIDOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.RedeStorageEnergia = API;
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * RESSALVA (RODADA 171, honestidade sobre o que NÃO foi feito nesta sessão):
 * - Estas classes gerenciam ESTADO/LÓGICA pura -- nada aqui desenha ou anima a malha 3D. A
 *   integração real ("abrir a gaveta" visualmente, arrastar um DriveUnit do inventário pra um
 *   slot no Ver em 3D, colorir o LED do slot por `driveUnit.status`) ainda não existe -- os
 *   ganchos `onInsert`/`onRemove` em StorageDevice já preparam esse ponto de extensão, mas quem
 *   os chama (a camada de UI/3D) ainda não foi escrita.
 * - `js/rede-equip.js` (`_construirPassivo`, familia 'storage') já desenha o painel frontal com
 *   uma baia por slot (furo + tampa fechada), mas de forma ESTÁTICA -- não lê `StorageDevice.slots`
 *   nem reage a insert/removeDrive ainda.
 * - Nada disto foi testado em navegador nesta sessão (sem acesso a `device_bash`); só
 *   `node --check` na sintaxe do arquivo.
 */
