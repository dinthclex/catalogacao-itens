/* js/novosobjetos.js
 * Objetos NOVOS importados para o catálogo "Ferramentas > Objetos".
 * O app roda por file:/// (dois cliques), então não há servidor nem fetch de
 * arquivo local: cada objeto novo é um pequeno arquivo .js que se registra
 * sozinho. A lista fica em assets/modelos/js/_novos-objetos.js (o "manifesto"),
 * carregado pelo index.html logo depois deste arquivo, e cada linha dela chama
 * NovosObjetos.registrar({...}) -- ver o passo a passo na janela
 * "Importar objeto" (js/cards/importar-objeto-card.js).
 *
 * registrar() liga o objeto ao restante do app:
 *   - OBJECT3D_PROFILES[tipo]      (dimensões/cor de referência, caixa)
 *   - Icons.MAP_OBJECT_EXTRAS[tipo] (ícone + nome no catálogo)
 *   - ObjCategorias.definir        (categoria do painel "Por categoria")
 * A malha 3D real vem de assets/modelos/js/<tipo>.malha.js, carregada sob
 * demanda pelo <tipo>.config.js (ObjectAssets, malhaEstatica:true).
 * `criadoEm` (ISO) alimenta o indicador "novo" do painel de objetos.
 */
(function () {
  const _lista = new Map();
  const _datas = new Map();
  const SVG_PADRAO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l8.5 4.5v10L12 21.5 3.5 17V7z"/><path d="M3.5 7L12 11.5 20.5 7M12 11.5v10"/></svg>';

  const NovosObjetos = {
    registrar(def) {
      if (!def || !def.tipo) return;
      const tipo = String(def.tipo);
      const d = Object.assign({ nome: tipo, categoria: 'outros', w: 0.5, d: 0.5, h: 0.5, y0: 0, cor: 0x8a92a3, criadoEm: null }, def);
      _lista.set(tipo, d);
      if (window.OBJECT3D_PROFILES && !window.OBJECT3D_PROFILES[tipo]) {
        window.OBJECT3D_PROFILES[tipo] = { shape: 'box', w: d.w, d: d.d, h: d.h, y0: d.y0, color: d.cor };
      }
      if (window.Icons?.MAP_OBJECT_EXTRAS && !window.Icons.MAP_OBJECT_EXTRAS[tipo] && !window.Icons.LIBRARY?.[tipo]) {
        window.Icons.MAP_OBJECT_EXTRAS[tipo] = { label: d.nome, svg: d.svg || SVG_PADRAO };
      }
      window.ObjCategorias?.definir(tipo, d.categoria);
    },
    /** Marca só a data de criação de um tipo que não vem do manifesto (modelo criado em "Criar novo modelo",
     *  objeto carregado com "Testar agora"), para também ganhar o selo "novo". */
    marcar(tipo, criadoEm) { if (tipo && criadoEm) _datas.set(tipo, criadoEm); },
    listar() { return [..._lista.values()]; },
    info(tipo) { return _lista.get(tipo) || null; },
    SVG_PADRAO,

    /** Milissegundos desde a criação (null se o tipo não é um objeto importado). */
    idadeMs(tipo, agora) {
      const d = _lista.get(tipo);
      const quando = (d && d.criadoEm) || _datas.get(tipo);
      if (!quando) return null;
      const t = Date.parse(quando);
      if (!Number.isFinite(t)) return null;
      return Math.max(0, (agora || Date.now()) - t);
    },

    /** true se o objeto ainda está dentro do período de "novo". */
    ehNovo(tipo, cfg, agora) {
      const idade = this.idadeMs(tipo, agora);
      if (idade == null) return false;
      const horas = Math.max(0.01, Number(cfg?.objetoNovoDuracaoHoras) || 24);
      return idade <= horas * 3600e3;
    },

    /** 'agora mesmo', 'há 1 minuto', 'há uma hora', 'há um dia', 'há 1 semana'... */
    textoRelativo(ms) {
      const min = Math.floor(ms / 60e3);
      if (min < 1) return 'agora mesmo';
      if (min < 60) return min === 1 ? 'há 1 minuto' : `há ${min} minutos`;
      const h = Math.floor(min / 60);
      if (h < 24) return h === 1 ? 'há uma hora' : `há ${h} horas`;
      const dias = Math.floor(h / 24);
      if (dias < 7) return dias === 1 ? 'há um dia' : `há ${dias} dias`;
      const sem = Math.floor(dias / 7);
      if (dias < 30) return sem === 1 ? 'há 1 semana' : `há ${sem} semanas`;
      const mes = Math.floor(dias / 30);
      return mes === 1 ? 'há 1 mês' : `há ${mes} meses`;
    },

    /** HTML do selo "novo" (ou '' se não é novo). cfg = MapConfig.get(). */
    seloHtml(tipo, cfg, agora) {
      if (!this.ehNovo(tipo, cfg, agora)) return '';
      const idade = this.idadeMs(tipo, agora);
      const horas = Math.max(0.01, Number(cfg?.objetoNovoDuracaoHoras) || 24);
      const frac = idade / (horas * 3600e3);
      // 'fixo' (padrão): mesmo selo durante todo o período. 'variavel': muda de cor/estágio com o tempo.
      const fase = cfg?.objetoNovoIndicador === 'variavel' ? (frac < 0.34 ? 1 : frac < 0.67 ? 2 : 3) : 0;
      const txt = cfg?.objetoNovoTexto ? `<span class="map-obj-novo-txt">${this.textoRelativo(idade)}</span>` : '';
      return `<span class="map-obj-novo map-obj-novo-f${fase}" title="Objeto novo — importado ${this.textoRelativo(idade)}">✦ novo</span>${txt}`;
    },
  };
  window.NovosObjetos = NovosObjetos;
})();
