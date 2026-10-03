/* js/objcategorias.js
 * Categorias do catálogo "Ferramentas > Objetos" (mapa 2D). Usado pela opção
 * "Por categoria" do painel de objetos (mapview.js _openObjectPickerPanel):
 * cada categoria vira um subtítulo colorido com ícone e os objetos da
 * categoria aparecem logo abaixo, com o mesmo botão de sempre.
 *
 * Objeto sem categoria conhecida cai em "Outros". Objetos importados
 * (assets/modelos/js/_novos-objetos.js) informam a própria categoria.
 * Para criar objetos/categorias novos: edite CATEGORIAS/MAPA abaixo.
 */
(function () {
  const CATEGORIAS = [
    { id: 'escritorio', label: 'Escritório', cor: '#4a90d9', icone: '🖥️' },
    { id: 'redes', label: 'Redes de Computadores', cor: '#2bb3b3', icone: '🌐' },
    // [28/09/2026 UTC] NOVO -- 🖥️ Simulador de Montagem e Manutenção de Hardware (ver
    // js/hardware-catalog.js/js/hardware-sim.js). Cor diferente da 'redes' pra não confundir na
    // grade "Por categoria" (equipamento de REDE vs. montagem INTERNA de um PC/notebook/servidor).
    { id: 'hardware', label: 'Hardware / Montagem de PC', cor: '#d97706', icone: '🖥️' },
    { id: 'eletrica', label: 'Elétrica, Iluminação e Clima', cor: '#e6b422', icone: '💡' },
    { id: 'estrutura', label: 'Estrutura e Acabamento', cor: '#5b6b8c', icone: '🏗️' }, // cinza / azul escuro: desenho técnico
    { id: 'mobiliario', label: 'Mobiliário e Decoração', cor: '#a0703c', icone: '🪑' }, // marrom / madeira: elementos estáticos configuráveis
    { id: 'copa', label: 'Copa e Sanitários', cor: '#c0568a', icone: '🚰' },
    { id: 'externa', label: 'Área externa', cor: '#7cb342', icone: '🌳' },
    { id: 'robotica', label: 'Automação e Robótica (Agentes Ativos)', cor: '#39ff88', icone: '🤖' }, // verde / neon: elementos dinâmicos
    { id: 'formas', label: 'Formas e Anotações (Elementos Primitivos / Ferramentas)', cor: '#9c7ae6', icone: '🔷' },
    { id: 'outros', label: 'Outros', cor: '#8a92a3', icone: '📦' },
  ];

  const MAPA = {
    escritorio: 'folha-papel gabinete monitor teclado mouse gabinete2 monitor2 teclado2 mouse2 notebook impressora estabilizador telefone grampeador calculadora arquivo quadro',
    redes: 'rack switch24 switch48 patchpanel24 patchpanel48 dio12 dio24 dio48 guia_h1 guia_h2 guia_v bandeja_fixa bandeja_basc pdu8 nobreak_torre nobreak_1u nobreak_2u nobreak_corporativo storage_12 storage_24 storage_60 frente_falsa kit_vent access_point espelho1 espelho2 espelho4 caixa_piso2 caixa_piso4 abracadeira_velcro abracadeira_nylon eletrocalha leito canaleta eletroduto',
    hardware: 'pc_gabinete notebook workstation servidor_rack',
    eletrica: 'luminaria-mesa interruptor interruptor-remoto disjuntor luminaria ventilador ar-condicionado',
    estrutura: 'pilar viga teto-modular teto-gesso telha elevador-cabine elevador-botao-chamada piso parede porta janela',
    mobiliario: 'mesa cadeira poltrona armario estante planta quadro-parede quadro-mesa relogio caixa-som lixeira extintor escada caixa-generica',
    copa: 'bebedouro geladeira cafeteira vaso-sanitario mictorio pia',
    externa: 'carro vaga-estacionamento cancela-haste cancela-poste poste',
    robotica: 'robo robo-limpeza robo-copa robo-recepcionista casa-robo casa-robo-telhado',
    formas: 'cubo texto',
  };
  const _porChave = {};
  Object.keys(MAPA).forEach((cat) => MAPA[cat].split(' ').forEach((k) => { _porChave[k] = cat; }));

  /* [83ª rodada] TIPO DE USO dentro de cada categoria — pedido: separar o catálogo em "Mobiliário Padrão" (básicos: comuns, leves, genéricos, replicados
   * várias vezes) e "Objetos Especiais" (únicos, detalhados, pesados ou de uso pontual). Fica CENTRALIZADO aqui, ao lado das categorias, para a busca e o
   * salvamento do mapa continuarem universais (o mapa salva só o `tipo` do objeto; o tipo de uso é derivado da chave, nunca gravado em cada objeto).
   * Formato equivalente em JSON (ver catalogoJSON() abaixo):
   *   { "categorias": [ { "id": "mobiliario", "label": "Mobiliário e Decoração",
   *       "itens": [ { "chave": "cadeira", "tipoUso": "basico" }, { "chave": "escada", "tipoUso": "especial" } ] } ] }
   * Padrão = "basico". Liste aqui só os ESPECIAIS. Objetos importados podem informar `tipoUso` em NovosObjetos.registrar({ ..., tipoUso: 'especial' }). */
  const TIPOS_USO = {
    basico: { id: 'basico', label: 'OBJETOS PADRÃO', icone: '▦', dica: 'Objetos comuns e leves, replicados várias vezes pelo cenário (geometria compartilhada no 3D).' },
    especial: { id: 'especial', label: 'Objetos Especiais', icone: '★', dica: 'Objetos únicos, detalhados ou pesados, de uso pontual (malha própria, carregamento isolado no 3D).' },
  };
  const ESPECIAIS = 'carro escada elevador-cabine teto-gesso poste relogio planta ar-condicionado robo robo-limpeza robo-copa robo-recepcionista casa-robo casa-robo-telhado rack nobreak_corporativo storage_60 servidor_rack workstation';
  const _usoPorChave = {};
  ESPECIAIS.split(' ').forEach((k) => { _usoPorChave[k] = 'especial'; });

  window.ObjCategorias = {
    CATEGORIAS,
    /** Registra/atualiza a categoria de uma chave (objetos importados). */
    definir(chave, categoriaId) { if (chave && categoriaId) _porChave[chave] = categoriaId; },
    idDe(chave) { return _porChave[chave] || _porChave[String(chave).replace(/\d+$/, '')] || 'outros'; },
    get(id) { return CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1]; },
    deChave(chave) { return this.get(this.idDe(chave)); },
    // ---- [83ª rodada] tipo de uso (Mobiliário Padrão × Objetos Especiais) ----
    TIPOS_USO,
    /** 'basico' | 'especial' da chave do catálogo (padrão 'basico'). */
    tipoUsoDe(chave) { return _usoPorChave[chave] || _usoPorChave[String(chave).replace(/\d+$/, '')] || 'basico'; },
    /** Registra/atualiza o tipo de uso de uma chave (objetos importados). */
    definirTipoUso(chave, tipoUso) { if (chave && TIPOS_USO[tipoUso]) _usoPorChave[chave] = tipoUso; },
    /** Filtragem: recebe os itens (de UMA categoria já escolhida) e separa em dois arrays antes de renderizar. `chaveDe` lê a chave de cada item. */
    separarPorUso(itens, chaveDe = (o) => o.key) {
      const itensBasicos = [], itensEspeciais = [];
      (itens || []).forEach((o) => { (this.tipoUsoDe(chaveDe(o)) === 'especial' ? itensEspeciais : itensBasicos).push(o); });
      return { itensBasicos, itensEspeciais };
    },
    /** Itens de uma categoria (pelo id) a partir de uma lista completa do catálogo, já separados por uso. */
    filtrarCategoria(catalogo, categoriaId, chaveDe = (o) => o.key) {
      return this.separarPorUso((catalogo || []).filter((o) => this.idDe(chaveDe(o)) === categoriaId), chaveDe);
    },
    /** Estrutura centralizada (JSON) do catálogo: categorias -> itens { chave, tipoUso }. Útil para exportar/conferir. */
    catalogoJSON(chaves) {
      const lista = chaves || Object.keys(_porChave);
      return { categorias: CATEGORIAS.map((c) => ({ id: c.id, label: c.label, itens: lista.filter((k) => this.idDe(k) === c.id).map((k) => ({ chave: k, tipoUso: this.tipoUsoDe(k) })) })) };
    },
    /** GANCHO para o motor 3D (engine3d.js _estrategiaMalha): 'basico' => clonar a malha COMPARTILHANDO a geometria (e, com muitos iguais, InstancedMesh);
     *  'especial' => carregamento ISOLADO (geometria própria do objeto). */
    estrategiaMalha(chave) { return this.tipoUsoDe(chave) === 'especial' ? 'isolada' : 'compartilhada'; },
  };
})();
