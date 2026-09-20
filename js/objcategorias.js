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
    escritorio: 'gabinete monitor teclado mouse gabinete2 monitor2 teclado2 mouse2 notebook impressora estabilizador telefone grampeador calculadora arquivo quadro',
    redes: 'rack switch24 switch48 patchpanel24 patchpanel48 dio12 dio24 dio48 guia_h1 guia_h2 guia_v bandeja_fixa bandeja_basc pdu8 nobreak_torre nobreak_1u nobreak_2u nobreak_corporativo storage_12 storage_24 storage_60 frente_falsa kit_vent espelho1 espelho2 espelho4 caixa_piso2 caixa_piso4 abracadeira_velcro abracadeira_nylon eletrocalha leito canaleta eletroduto',
    eletrica: 'interruptor interruptor-remoto disjuntor luminaria ventilador ar-condicionado',
    estrutura: 'pilar viga teto-modular teto-gesso elevador-cabine elevador-botao-chamada piso parede porta janela',
    mobiliario: 'mesa cadeira poltrona armario estante planta quadro-parede quadro-mesa relogio caixa-som lixeira extintor escada caixa-generica',
    copa: 'bebedouro geladeira cafeteira vaso-sanitario mictorio pia',
    externa: 'carro vaga-estacionamento cancela-haste cancela-poste poste',
    robotica: 'robo robo-limpeza robo-copa robo-recepcionista casa-robo casa-robo-telhado',
    formas: 'cubo texto',
  };
  const _porChave = {};
  Object.keys(MAPA).forEach((cat) => MAPA[cat].split(' ').forEach((k) => { _porChave[k] = cat; }));

  window.ObjCategorias = {
    CATEGORIAS,
    /** Registra/atualiza a categoria de uma chave (objetos importados). */
    definir(chave, categoriaId) { if (chave && categoriaId) _porChave[chave] = categoriaId; },
    idDe(chave) { return _porChave[chave] || _porChave[String(chave).replace(/\d+$/, '')] || 'outros'; },
    get(id) { return CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1]; },
    deChave(chave) { return this.get(this.idDe(chave)); },
  };
})();
