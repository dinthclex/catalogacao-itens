/**
 * js/trena3d.js — Motor da "📏 Trena 3D" extraído de `view3d.js` (RODADA 191).
 *
 * [19/09/2026 UTC] NOVO — pedido verbatim: "Torne o 'Trena 3D' modular e
 * instanciável, mesmo que envolva mexer em todo código dele, não importa o
 * seu tamanho. Retire do arquivo maior e coloque em um arquivo separado,
 * para que seja possível usá-lo em outros sites que renderizam 3D e possam
 * usar os seus recursos de eventos de clique, atalhos e botões. Faça um
 * método para gerar o que aparece nas 'configurações 3D' atualmente para
 * poder imprimir em uma janela genérica. Torne-o reutilizável, instanciável,
 * simples e modular."
 *
 * O que era ~4950 linhas de métodos soltos dentro do objeto-singleton
 * `View3D` (js/view3d.js) virou esta classe `Trena3D`, de verdade
 * instanciável (`new Trena3D(opts)`) — `view3d.js` cria e mantém 1
 * instância (`this._trena3D`, mesmo padrão de singleton reaproveitado que o
 * resto do módulo já usa), mas nada aqui dentro depende disso: outra
 * página/app que renderize THREE.js pode criar sua PRÓPRIA instância,
 * apontando os adaptadores abaixo pros seus próprios objetos.
 *
 * COMO REUTILIZAR EM OUTRO SITE
 * ------------------------------
 * new Trena3D({
 *   getContainer: () => elementoDOMDoViewport3D,     // required
 *   getCamera:    () => suaCameraThreeAtual,         // required
 *   getEngine:    () => seuMotor3D,                  // required — ver "Contrato do `engine`" abaixo
 *   getKeys:      () => seuObjetoDeTeclasFisicas,     // required — { ShiftLeft: bool, ControlLeft: bool, ... }
 *   getMap:       () => seuObjetoDeDadosDoMapa,       // required — só precisa expor `.medidas2d` (array, criado sozinho se faltar)
 *   isToolActive: () => suaFerramentaAtiva === 'trena3d', // opcional — default: sempre "ativa"
 *   getLayerIdParaNovosItens: () => undefined,        // opcional
 *   isDebugCoordsAtivo: () => false,                  // opcional
 *   configAdapter: meuAdaptadorDeConfig,              // opcional — mesmo "formato" do `MapConfig` do app (ver abaixo); sem isso, cai nos padrões internos
 *   toast: (msg, opts) => minhaLibDeToast.show(msg, opts), // opcional — sem isso, cai em `window.Utils.toast` (se existir) ou `console.log`
 *   THREE: MeuTHREE,                                  // opcional — default: `window.THREE` global (mesma convenção do resto do app)
 *   iconesPainelRapido: meusIcones,                    // opcional — default: `window.TRENA3D_ICONS_PAINEL_RAPIDO` (ver js/trena3d-icons.js)
 * });
 *
 * Contrato do `engine` (o que a Trena 3D efetivamente chama nele):
 *   - `raycastSurface(origin, dir)` / `raycastSurfaceAmpliado(origin, dir)` → hit `{ point, normal, type, ... }` ou null
 *   - `raycastPlaneY?.(origin, dir, nivelY)` → ponto no plano Y=nivelY (opcional)
 *   - `centerRay(camera)` → `{ origin: THREE.Vector3, dir: THREE.Vector3 }` (raio saindo do centro da tela)
 *   - `scene` (propriedade, THREE.Scene onde os grupos/linhas da Trena 3D são adicionados)
 *
 * Contrato do `configAdapter` (mesmo formato do `MapConfig` do app — todos
 * os campos lidos/escritos usam o prefixo `trena3D*`, ver DEFAULTS abaixo):
 *   - `_cache` (objeto plano com os valores atuais)
 *   - `DEFAULTS` (objeto plano com os valores padrão)
 *   - `set(patch)` → Promise (mescla e persiste `patch` no `_cache`)
 *   - `_montarBotaoTriplo(el, id, opts)` (widget de botão "tri-estado" usado no painel de ajustes rápidos — só é chamado se o site quiser reaproveitar o painel/HTML pronto via `renderConfigPanel`/`gerarPainelDeAjustes`)
 *
 * Sem `configAdapter`, a Trena 3D funciona igual, só que sempre com os
 * valores DEFAULT internos (nunca lê nem escreve nada persistente) — ainda
 * assim plenamente utilizável (medir, clicar, atalhos, tudo funciona).
 *
 * MÉTODOS PÚBLICOS PRINCIPAIS (o que outro código de fora chama)
 * ----------------------------------------------------------------
 * - `mount()` / `destroy()` — ciclo de vida (chamar ao abrir/fechar a visão 3D)
 * - `onMapConfigChange(c)` — chamar sempre que a config mudar (redesenha na hora se algo relevante mudou)
 * - `click(ctrlHeld)` — clique principal da ferramenta (1º/2º ponto da medida)
 * - `beforeRender()` — chamar 1x por quadro, ANTES de `engine.render(...)` (oclusão/visibilidade das medidas)
 * - `afterRender(camera3)` — chamar 1x por quadro, DEPOIS de `engine.render(...)` (atualiza prévia/rótulos/overlay 2D)
 * - `cancelarMedidaEmAndamento()` / `cancelarMedidaPendente()` — cancelar a medida a meio caminho (Esc / trocar de ferramenta)
 * - `pickAtRay(ray)` / `removerMedida(id)` — achar/excluir uma medida existente pelo raio da mira
 * - `renderConfigPanel(containerEl, opts)` — **NOVO** (ver pedido acima): gera o MESMO conteúdo (grupos de ajustes + wiring dos controles) que hoje só aparecia na janelinha flutuante de acesso rápido, e imprime dentro de QUALQUER elemento contêiner passado — é isso que torna possível reaproveitar a UI de configurações da Trena 3D numa janela genérica própria (modal, painel lateral, o que for), em vez de só na janelinha fixa.
 *
 * O restante dos métodos (todos começando com `_trena3D...`, um "resquício"
 * do nome que tinham dentro do objeto `View3D` original) são detalhes
 * internos — mantidos com o mesmo nome de propósito (facilita comparar com
 * o histórico do git de antes desta rodada), mas não
 * fazem parte do contrato público da classe.
 */
class Trena3D {
  constructor(opts = {}) {
    this._opts = opts || {};
    this._cfgAdapter = opts.configAdapter || null;
  }

  // ---------------------------------------------------------------------
  // Adaptadores (host) — cada `get _xxx()` abaixo resolve, na hora, pro
  // objeto/valor atual passado no construtor. Como são GETTERS (não campos
  // copiados 1x na construção), refletem sempre o estado mais recente do
  // host (ex.: `this._camera` já muda sozinho conforme a câmera do site
  // hospedeiro muda) — todo o resto desta classe (extraído de `view3d.js`
  // sem precisar renomear nada) já usava exatamente esses mesmos nomes de
  // propriedade (`this._camera`, `this._container`, etc.), então os
  // getters abaixo são o ÚNICO ponto de acoplamento com o host.
  get _buildTool() { return this._opts.isToolActive ? (this._opts.isToolActive() ? 'trena3d' : null) : 'trena3d'; }
  get _camera() { return this._opts.getCamera ? this._opts.getCamera() : null; }
  get _container() { return this._opts.getContainer ? this._opts.getContainer() : null; }
  get _engine() { return this._opts.getEngine ? this._opts.getEngine() : null; }
  get _keys() { return this._opts.getKeys ? (this._opts.getKeys() || {}) : {}; }
  get _map() { return this._opts.getMap ? this._opts.getMap() : null; }

  _isDebugTrena3DCoordenadasAtivo() {
    return this._opts.isDebugCoordsAtivo ? !!this._opts.isDebugCoordsAtivo() : false;
  }
  _layerIdParaNovosItens() {
    return this._opts.getLayerIdParaNovosItens ? this._opts.getLayerIdParaNovosItens() : undefined;
  }
  /** Substitui os `Utils.toast(...)` originais — usa o `toast` injetado no
   *  construtor; sem ele, cai no `Utils.toast` global (se existir, mesmo
   *  comportamento de sempre dentro do app catalogacao-itens) ou, em
   *  último caso (outro site, sem nenhum dos dois), só loga no console —
   *  nunca quebra por falta de uma lib de toast. */
  _toast(msg, toastOpts) {
    if (this._opts.toast) return this._opts.toast(msg, toastOpts);
    if (typeof Utils !== 'undefined' && Utils.toast) return Utils.toast(msg, toastOpts);
    console.log('[Trena3D]', msg);
  }

  // ---------------------------------------------------------------------
  // Núcleo da Trena 3D (extraído tal e qual de `view3d.js`, RODADA 191 —
  // ver cabeçalho do arquivo). Todos os métodos internos abaixo mantêm o
  // nome original (`_trena3DXxx`) e continuam chamando uns aos outros
  // exatamente como antes (`this._trena3DYyy(...)`) — como agora são
  // métodos-irmãos desta mesma classe, essas chamadas cruzadas continuam
  // válidas sem precisar renomear nada. Os únicos pontos que mudaram de
  // verdade: acesso a `this._camera`/`this._container`/`this._engine`/
  // `this._keys`/`this._map`/`this._buildTool` agora passam pelos
  // getters do host logo acima; `MapConfig` global virou `this._cfgAdapter`;
  // `Utils.toast(...)` virou `this._toast(...)`.
  // ---------------------------------------------------------------------

  _trena3DSnapStep() {
    const cfg = (!!this._cfgAdapter && this._cfgAdapter._cache) ? this._cfgAdapter._cache : null;
    const passo = cfg?.trena3DSnapMetros ?? (!!this._cfgAdapter ? this._cfgAdapter.DEFAULTS?.trena3DSnapMetros : 0.1);
    return Math.max(0.01, Number(passo) || 0.1);
  }

  /** [16/09/2026 UTC] NOVO — toggle liga/desliga do snap (a subseção ganhou
   *  um "cabeçalho" liga/desliga + valor, igual ao "🧲 Snap de parede" do
   *  mapa 2D — ver mapconfig.js). Com o snap desligado, `_trena3DSnap`
   *  devolve o valor exato, sem arredondar. */
  _trena3DSnapAtivo() {
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Outra subseção deve ser
    // segurar o shift para desativar o snap." Segurar Shift (`this._keys`,
    // igual o Ctrl real-time já usado em `_trena3DUpdatePreview`/
    // `_trena3DAtualizarDestaqueSuprimido`) desliga o snap TEMPORARIAMENTE,
    // não importa o valor configurado — solta o Shift e volta ao normal.
    if (this._keys?.ShiftLeft || this._keys?.ShiftRight) return false;
    const cfg = (!!this._cfgAdapter && this._cfgAdapter._cache) ? this._cfgAdapter._cache : null;
    const v = cfg?.trena3DSnapAtivo;
    return v !== undefined ? v !== false : (!!this._cfgAdapter ? this._cfgAdapter.DEFAULTS?.trena3DSnapAtivo !== false : true);
  }

  _trena3DSnap(v) {
    if (!this._trena3DSnapAtivo()) return v;
    const passo = this._trena3DSnapStep();
    return Math.round(v / passo) * passo;
  }

  /** [16/09/2026 UTC] NOVO — lê de uma vez toda a configuração da seção
   *  "📏 Trena 3D" de ⚙️ Configurações 3D (aparência do rótulo,
   *  visibilidade/oclusão, espessura, cores e formato das pontas — ver
   *  mapconfig.js). Mesmo padrão de fallback de `_trena3DSnapStep` acima
   *  (cache → DEFAULTS → valor fixo), só que pra todos os campos de uma
   *  vez, já que quase todo método de renderização da Trena 3D precisa de
   *  vários deles ao mesmo tempo. */
  /** [RODADA 139] Modo atual da "📏 Trena 3D"/"➰ Polilinha 3D"
   *  (`trena3DModo`, ver DEFAULTS em mapconfig.js) — 'trena' (padrão) ou
   *  'poli'. Mesmo padrão cache→DEFAULTS→fallback de `_trena3DCfg()` logo
   *  abaixo, só que pra este único campo (lido em vários lugares deste
   *  arquivo: `_renderHotbar`, `_trena3DClick`, `_trena3DUpdatePreview`). */
  _trena3DModo() {
    const cache = (!!this._cfgAdapter && this._cfgAdapter._cache) ? this._cfgAdapter._cache : null;
    const def = (!!this._cfgAdapter && this._cfgAdapter.DEFAULTS) ? this._cfgAdapter.DEFAULTS : {};
    const v = cache ? cache.trena3DModo : undefined;
    return (v !== undefined ? v : (def.trena3DModo !== undefined ? def.trena3DModo : 'trena')) || 'trena';
  }

  _trena3DCfg() {
    const cache = (!!this._cfgAdapter && this._cfgAdapter._cache) ? this._cfgAdapter._cache : null;
    const def = (!!this._cfgAdapter && this._cfgAdapter.DEFAULTS) ? this._cfgAdapter.DEFAULTS : {};
    const g = (k, fallback) => { const v = cache ? cache[k] : undefined; return v !== undefined ? v : (def[k] !== undefined ? def[k] : fallback); };
    return {
      labelEstilo: g('trena3DLabelEstilo', 'sobreLinha'),
      // [17/09/2026 UTC] NOVO (RODADA 127) — pedido verbatim: "Deve ser
      // possível controlar se a caixa de texto com a medida vai aparecer ou
      // não em [...] 'Visibilidade' (para a medida), 'Guia rente ao chão' e
      // 'Linhas guia da grade do mundo'. Por padrão todas ativadas." Ver
      // DEFAULTS (mapconfig.js) — a linha/pontas/esfera continuam
      // desenhadas normalmente, só a caixa de texto HTML é afetada.
      labelVisivel: g('trena3DLabelVisivel', true) !== false,
      guiaChaoLabelVisivel: g('trena3DGuiaChaoLabelVisivel', true) !== false,
      guiaGradeLabelVisivel: g('trena3DGuiaGradeLabelVisivel', true) !== false,
      // [17/09/2026 UTC] NOVO (RODADA 119) — pedido verbatim: controlar a
      // posição da caixa de texto ao longo de uma linha vertical (perpen-
      // dicular ao chão) que passa pelo ponto médio ('mAB') da reta 3D a
      // que o texto pertence — 0 = exatamente em cima de 'mAB', positivo =
      // acima (mundo Y+), negativo = abaixo. 4 campos independentes, 1 por
      // subseção que ganhou este controle (ver `_montarBotaoTriplo` em
      // mapconfig.js e `_trena3DDeslocarPontoY` logo abaixo, usado nos 6
      // pontos de código onde cada rótulo é de fato posicionado). Todos com
      // padrão 0 — sem NENHUMA mudança de comportamento pra quem não mexer.
      labelDeslocVerticalM: Number(g('trena3DLabelDeslocVerticalM', 0)) || 0,
      guiaChaoLabelDeslocVerticalM: Number(g('trena3DGuiaChaoLabelDeslocVerticalM', 0)) || 0,
      linhaAncoraLabelDeslocVerticalM: Number(g('trena3DLinhaAncoraLabelDeslocVerticalM', 0)) || 0,
      guiaGradeLabelDeslocVerticalM: Number(g('trena3DGuiaGradeLabelDeslocVerticalM', 0)) || 0,
      // [17/09/2026 UTC] NOVO (RODADA 119) — pedido verbatim: "para esta
      // opção [Linhas guia da grade do mundo], deve ter um enable de
      // aparecer a linha vertical (perpendicular ao chão) que é usada para
      // deslocar o texto." Só esta subseção ganhou o enable — as outras 3
      // não foram pedidas com esse extra.
      guiaGradeLabelLinhaVertical: g('trena3DGuiaGradeLabelLinhaVertical', false) === true,
      visibilidade: g('trena3DVisibilidade', 'seVisivel'),
      // [17/09/2026 UTC] NOVO (RODADA 121) — pedido verbatim: raio de
      // proximidade do personagem (só mostrar caixa de texto dentro do
      // raio) + reorganização automática anti-sobreposição agora opcional
      // (padrão desligada). Ver `_trena3DUpdateLabels`/
      // `_trena3DAfastarRotulosSobrepostos`.
      labelRaioAtivo: g('trena3DLabelRaioAtivo', false) === true,
      labelRaioM: Number(g('trena3DLabelRaioM', 15)) || 15,
      labelReorganizarSobreposicao: g('trena3DLabelReorganizarSobreposicao', false) === true,
      espessuraCm: Number(g('trena3DEspessuraCm', 2)) || 2,
      corLinha: g('trena3DCorLinha', '#ffd166'),
      // [18/09/2026 UTC] NOVO (RODADA 141) — modo de desenho ("formas 3D"
      // padrão, cilindros de verdade | "formas 2D", overlay leve — ver
      // '_trena3DRebuildLines'/'_trena3DDesenhar2DOverlay' mais abaixo).
      modoRenderizacao: g('trena3DModoRenderizacao', '3d') === '2d' ? '2d' : '3d',
      // [RODADA 129] REMOVIDO — `trena3DCorAncora`/`trena3DCorMira` (2
      // campos extras que viviam no grupo "Linha da medida" da janelinha,
      // "Cor da âncora/linha vertical" e "Cor da mira normal"). Investigação
      // confirmou a suspeita do usuário: são vestígios sem propósito visual
      // distinto — só existem 2 linhas de âncora por medida (uma por ponta,
      // P1/P2), e ambas já usam `linhaAncoraCorInt`/`trena3DLinhaAncoraCor`
      // (config da subseção separada "Linha da âncora"/"📏 Trena 3D — Linhas
      // verticais ancoradas", mesmo default `#ff9f4d`). O marcador fixo no pé
      // da linha (`_trena3DAnchorGroundMesh`) agora usa `linhaAncoraCorInt`
      // diretamente (unificado — ver uso abaixo), e a bolinha indicadora de
      // clique (`_trena3DHoverMesh`) volta a usar as cores fixas de sempre
      // (laranja/azul, os mesmos valores que já eram os DEFAULTS destas 2
      // configs removidas) — ela é só um cursor de mira, não uma das "linhas
      // da medida", não precisando de campo de cor próprio.
      ponta: g('trena3DPonta', 'esfera'),
      // [16/09/2026 UTC] NOVO (RODADA 91) — sub-opções de cada tipo de
      // ponta. Ver DEFAULTS em mapconfig.js pro raciocínio completo de
      // cada uma (todas preservam o comportamento de sempre como padrão,
      // exceto `tracoPerpModoRender`, mudado a pedido explícito).
      // [RODADA 135] MUDANÇA -- deixou de ser multiplicador, agora é o
      // raio da esfera em METROS direto, sempre limitado a [0.01, 1]
      // mesmo que algum valor antigo (multiplicador, ex. 1.7) tenha
      // sobrevivido num config salvo -- Utils.clamp cobre esse caso.
      esferaTamanho: Utils.clamp(Number(g('trena3DEsferaTamanho', 0.02)) || 0.02, 0.01, 1),
      esferaTerminoLinha: g('trena3DEsferaTerminoLinha', 'centro'),
      setaConeRaio: Number(g('trena3DSetaConeRaio', 3.2)) || 3.2,
      setaConeAltura: Number(g('trena3DSetaConeAltura', 2.2)) || 2.2,
      setaDoisTracosAbertura: Number(g('trena3DSetaDoisTracosAbertura', 6)) || 6,
      setaDoisTracosComprimento: Number(g('trena3DSetaDoisTracosComprimento', 10)) || 10,
      tracoPerpComprimento: Number(g('trena3DTracoPerpComprimento', 7)) || 7,
      tracoPerpAlinhamento: g('trena3DTracoPerpAlinhamento', 'centralizado'),
      tracoPerpModoRender: g('trena3DTracoPerpModoRender', 'paraleloVertical'),
      suprimirDestaqueDuranteAncora: g('trena3DSuprimirDestaqueDuranteAncora', true) !== false,
      // [16/09/2026 UTC] REMOVIDO — pedido verbatim: "Colapse as duas
      // subseções [...] A opção da subseção 'Altura ao vivo' deixa de
      // existir." `trena3DMostrarAlturaAoVivo` não é mais lido — os 2
      // lugares que dependiam dela (`_trena3DP1HeightLine`/o caso "sem
      // âncora nenhuma" de `_trena3DLiveHeightLine`) usam valores fixos
      // agora, ver comentários em `_trena3DUpdatePreview`.
      mostrarAlturaAoVivoAntesDoPonto: g('trena3DMostrarAlturaAoVivoAntesDoPonto', true) !== false,
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Coloque como outra opção
      // dentro de 'Altura ao vivo (Antes mesmo de definir o ponto)' para
      // definir que a medida laranja aparece ou não já ao segurar o ctrl. Em
      // vez de sempre deixar ativo." Cobre o caso "Ctrl segurado, âncora
      // AINDA não commitada" (antes disso era sempre `true`, sem opção — ver
      // `_trena3DUpdatePreview`, variável `alturaPermitidaPorConfig`).
      // [16/09/2026 UTC] REMOVIDO — pedido verbatim: "a opção 'Sempre
      // desenhada enquanto a Trena 3D estiver ativa' deve ser removida do
      // projeto" (RODADA 90: `trena3DAlturaAoVivoSempreDesenhada`/
      // `alturaAoVivoSempreDesenhada`) — ver `_trena3DUpdatePreview`.
      // [16/09/2026 UTC] NOVO (RODADA 94) — pedido verbatim: "desenhar uma
      // medida guia rente ao chão até a posição do cursor do mouse." Ver
      // `_trena3DUpdatePreview` (linha `_trena3DGuiaChaoLine`, cor verde).
      mostrarGuiaChaoAoVivo: g('trena3DMostrarGuiaChaoAoVivo', false) === true,
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve haver outra opção:
      // 'Mostrar guia depois que a medida foi finalizada'." Ver
      // `_trena3DRebuildLines`.
      guiaChaoFinalizada: g('trena3DGuiaChaoFinalizada', false) === true,
      // [16/09/2026 UTC] NOVO (RODADA 98) — cores separadas por "parte" da
      // guia rente ao chão (linha vs texto), ver DEFAULTS/mapconfig.js.
      guiaChaoCorLinha: g('trena3DGuiaChaoCorLinha', '#7dff6e') || '#7dff6e',
      guiaChaoCorTexto: g('trena3DGuiaChaoCorTexto', '#d9ff8a') || '#d9ff8a',
      // [17/09/2026 UTC] NOVO (RODADA 114) — espessura/estilo/dash + ponta
      // (simplificada) da "Guia rente ao chão" — ver
      // `_trena3DBuildLinhaEstilizadaUmaVez`/`_trena3DAtualizarLinhaEstilizadaAoVivo`.
      guiaChaoEstiloLinha: { estiloLinha: g('trena3DGuiaChaoEstiloLinha', 'tracejada'), espessuraCm: Number(g('trena3DGuiaChaoEspessuraCm', 1.2)) || 1.2, dashCm: Number(g('trena3DGuiaChaoDashCm', 12)) || 12, gapCm: Number(g('trena3DGuiaChaoGapCm', 8)) || 8 },
      guiaChaoPonta: g('trena3DGuiaChaoPonta', 'nenhuma'),
      // [RODADA 131] NOVO — modo de altura da "Guia rente ao chão" ('renteChao'
      // | 'proximaChao' | 'afastadaChao' | 'livre') + valor usado no modo
      // 'livre'. Ver DEFAULTS/mapconfig.js e '_trena3DGuiaChaoAlturaY' abaixo.
      guiaChaoModo: g('trena3DGuiaChaoModo', 'renteChao') || 'renteChao',
      guiaChaoAlturaLivreM: Number(g('trena3DGuiaChaoAlturaLivreM', 0)) || 0,
      // [16/09/2026 UTC] NOVO (RODADA 98) — pedido verbatim: "Deve ser
      // possível colocar medidas apontando para lados [...] Deve ter uma
      // subseção para isso com uma opção para que o raycaster atinja os
      // lados." Ver `_trena3DRaycastPrincipal`/`Engine3D.raycastSurfaceAmpliado`.
      permitirSuperficiesLaterais: g('trena3DPermitirSuperficiesLaterais', false) === true,
      // [16/09/2026 UTC] NOVO (RODADA 101) — pedido verbatim: "Após
      // estabelecer o 1º ponto da medida deve ser possível 'continuar
      // naquele nível' (de y) [...] estando livre para movimentar o Z e
      // X." Ver `_trena3DUpdatePreview` (`modoContinuarNivel`) e
      // `_trena3DAtualizarGradeNivelInfinita`.
      continuarNoNivel: g('trena3DContinuarNoNivel', false) === true,
      // [18/09/2026 UTC] NOVO (RODADA 146) — pedido verbatim: alternar entre
      // o modo atual "apenas uma medida" (padrão, `false`) e "medidas em
      // sequência" (`true` — depois de finalizar uma medida, o 2º ponto
      // commitado vira automaticamente o 1º ponto da próxima, permitindo
      // desenhar uma sequência de medidas conectadas ponta-a-ponta, cada
      // uma uma entrada INDEPENDENTE em `map.medidas2d`). Ver
      // `_trena3DFinalize` (onde o encadeamento acontece de verdade) — a
      // opção '⇔▦' acima (`continuarNoNivel`) já lê `_trena3DPendingP1.y`
      // dinamicamente, então passa a usar o "novo chão" automaticamente,
      // sem nenhuma mudança adicional necessária nela.
      modoSequencia: g('trena3DModoSequencia', false) === true,
      // [18/09/2026 UTC] NOVO (RODADA 148) — pedido verbatim: subopção
      // "medidas únicas"/"medidas agrupadas" dentro de "Medidas em
      // sequência" (só tem efeito com `modoSequencia` true). Ver DEFAULTS
      // (mapconfig.js) e `_trena3DFinalize` (grupoId/grupoOrdem) logo abaixo.
      sequenciaTipo: g('trena3DSequenciaTipo', 'unicas') === 'agrupadas' ? 'agrupadas' : 'unicas',
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Coloque uma opção de
      // continuar desenhando a linha laranja tracejada até o 1º ponto da
      // medida (por padrão, ativada) [...] Uma subopção [...] infinita ou
      // vai até o 1º ponto da medida (por padrão [...] 'vai até o 1º ponto'
      // [...] ativa)." Ver `_trena3DUpdatePreview` (bloco de
      // `_trena3DP1HeightLine`).
      continuarLinhaAncoraAposPonto: g('trena3DContinuarLinhaAncoraAposPonto', true) !== false,
      linhaAncoraAposPontoModo: g('trena3DLinhaAncoraAposPontoModo', 'ateOPonto'),
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Outra subopção é imprimir
      // junto com a linha laranja tracejada infinita (ou até o 1º ponto, com
      // isso, não sendo infinita) o texto laranja da medida (logo depois de
      // definir o 1º ponto da medida)." Controla só o RÓTULO de texto
      // (`_trena3DP1HeightLabelEl`) — a linha em si continua regida só por
      // `continuarLinhaAncoraAposPonto`/`linhaAncoraAposPontoModo` acima. Ver
      // `_trena3DUpdatePreview` (bloco de `_trena3DP1HeightLine`).
      mostrarMedidaNaLinhaAncoraAposPonto: g('trena3DMostrarMedidaNaLinhaAncoraAposPonto', true) !== false,
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Semelhante a subseção
      // 'Linha da âncora após o 1º ponto', mas agora nas duas linhas (a
      // linha [...] que vai do 1º ponto âncora até o 1º ponto da medida e a
      // [...] do 2º ponto âncora até o 2º ponto da medida). Deve ter uma
      // subseção para definir se ficam impressas após a medida ser
      // finalizada (por padrão, desativada). E uma subopção se desenha do
      // chão até os pontos da medida ou se as duas vão ser infinitas." Ver
      // `_trena3DRebuildLines` — como o X/Z de um ponto ancorado já É o
      // X/Z da própria âncora (só a altura fica livre), não precisa guardar
      // nada novo por medida: a linha vai de (x,0,z) até (x,y,z) de CADA
      // ponto já salvo (`m.x1/z1/y1` e `m.x2/z2/y2`), igual ao raciocínio da
      // linha viva em `_trena3DUpdatePreview`.
      mostrarLinhasAncoraFinalizada: g('trena3DMostrarLinhasAncoraFinalizada', false) === true,
      linhasAncoraFinalizadaModo: g('trena3DLinhasAncoraFinalizadaModo', 'ateOPonto'),
      // [17/09/2026 UTC] NOVO (RODADA 114) — cor + espessura/estilo/dash da
      // "Linhas verticais ancoradas" (compartilhados pelas 3 sub-opções:
      // Altura ao vivo, Linha da âncora, Linhas finalizadas — ver
      // `_trena3DAnchorLine`/`_trena3DP1HeightLine`/`_trena3DLiveHeightLine`
      // e o bloco `mostrarLinhasAncoraFinalizada` acima). Padrão preserva a
      // aparência de sempre (laranja tracejada fina).
      linhaAncoraCorInt: this._trena3DHexToInt(g('trena3DLinhaAncoraCor', '#ff9f4d'), 0xff9f4d),
      linhaAncoraEstiloLinha: { estiloLinha: g('trena3DLinhaAncoraEstiloLinha', 'tracejada'), espessuraCm: Number(g('trena3DLinhaAncoraEspessuraCm', 1)) || 1, dashCm: Number(g('trena3DLinhaAncoraDashCm', 12)) || 12, gapCm: Number(g('trena3DLinhaAncoraGapCm', 8)) || 8 },
      // [RODADA 131] NOVO — "Caixa de texto" (mostrar/ocultar) das 2 caixas
      // de texto ("⬍ Xm") da subseção "Linhas verticais ancoradas" (ver
      // `_trena3DP1HeightLabelEl`/`_trena3DLiveHeightLabelEl` abaixo).
      linhaAncoraLabelVisivel: g('trena3DLinhaAncoraLabelVisivel', true) !== false,
      // [RODADA 131] NOVO — cor/tamanho configuráveis da mira
      // (`_trena3DHoverMesh`, bolinha indicadora "aqui vai cair o clique")
      // no estado NORMAL (sem âncora/Ctrl) — padrões preservam a cor/
      // tamanho fixos de sempre (azul `#5ec8ff`, raio 0,045m = tamanho '1').
      miraCorInt: this._trena3DHexToInt(g('trena3DMiraCor', '#5ec8ff'), 0x5ec8ff),
      miraTamanho: Number(g('trena3DMiraTamanho', 1)) || 1,
      // [RODADA 129] NOVO — cor/espessura/estilo/dash configuráveis do
      // "ghost"/prévia da medida (`_trena3DGuideLine`, linha tracejada azul
      // clara entre o 1º ponto já fixado e a bolinha que segue o cursor,
      // antes do 2º clique). Mesmo padrão de `linhaAncoraCorInt`/
      // `linhaAncoraEstiloLinha` acima. Padrão preserva a aparência de
      // sempre (azul `#5ec8ff`, tracejada, 12cm/8cm — os mesmos valores que
      // já estavam fixos no código, em metros: `dashSize:0.12`/`gapSize:0.08`).
      // [RODADA 131] MUDANÇA — pedido verbatim: cor/espessura padrão iguais
      // às da "Linha da medida" (`trena3DCorLinha`/`trena3DEspessuraCm`),
      // mantendo o estilo tracejado — continua editável separadamente.
      ghostCorInt: this._trena3DHexToInt(g('trena3DGhostCor', '#ffd166'), 0xffd166),
      ghostEstiloLinha: { estiloLinha: g('trena3DGhostEstiloLinha', 'tracejada'), espessuraCm: Number(g('trena3DGhostEspessuraCm', 1)) || 1, dashCm: Number(g('trena3DGhostDashCm', 12)) || 12, gapCm: Number(g('trena3DGhostGapCm', 8)) || 8 },
      // [16/09/2026 UTC] NOVO — 'ctrl' (padrão, comportamento de sempre:
      // segurar Ctrl ancora, soltar+clicar fixa "no ar"; sem usar Ctrl,
      // medida normal de 2 cliques) | 'quatroCliques' (novo: Ctrl ignorado,
      // toda medida sempre usa 4 cliques alternando âncora/ponto). Ver
      // _trena3DClick/_trena3DUpdatePreview/_trena3DAtualizarDestaqueSuprimido.
      modoAncora: g('trena3DModoAncora', 'ctrl'),
      // [18/09/2026 UTC] NOVO (RODADA 149) — ver comentário grande em
      // mapconfig.js (DEFAULTS.trena3DAncorarPontoMedida) e
      // `_trena3DEncontrarPontaProximaMedida`/`_trena3DRaycastChaoNivel`
      // logo abaixo — liga a "ancoragem no ponto de medida já feita".
      ancorarPontoMedida: g('trena3DAncorarPontoMedida', false) === true,
      guiaGradeAtiva: g('trena3DGuiaGradeAtiva', true) !== false,
      guiaGradeModoMedida: g('trena3DGuiaGradeModoMedida', 'esquerdaCima'),
      // [16/09/2026 UTC] NOVO — pedido verbatim: "coloque como outra opção
      // para aparecer após finalizar a medida. Isto acabará afetando a
      // todas as medidas no mapa." Ver `_trena3DRebuildLines`.
      guiaGradeFinalizada: g('trena3DGuiaGradeFinalizada', false) === true,
      // [16/09/2026 UTC] NOVO (RODADA 104) — pedido verbatim: "quando o 1º
      // ponto já foi definido, continuar mostrando elas (enquanto não se
      // definiu o 2º ponto ainda)." Ver `_trena3DAtualizarGuiaGrade`.
      guiaGradeAposPrimeiroPonto: g('trena3DGuiaGradeAposPrimeiroPonto', false) === true,
      // [18/09/2026 UTC] NOVO (RODADA 154) — "▦2 Mostrar no 2º ponto,
      // enquanto define o 2º", opção irmã da acima — ver `_trena3DAtualizarGuiaGrade`/
      // `_trena3DUpdatePreview` (chamada com sufixo '2').
      guiaGradeNoSegundoPonto: g('trena3DGuiaGradeNoSegundoPonto', false) === true,
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser possível definir
      // a cor das linhas guia [...] Deve ser azul para ambos, como padrão."
      // Antes, `_trena3DAtualizarGuiaGrade`/`_trena3DRebuildLines` usavam
      // uma cor verde FIXA no código (`0xb7ff5e`) — agora lêem estes 2
      // campos (linha/texto separados, mesmo padrão de
      // `guiaChaoCorLinha`/`guiaChaoCorTexto`).
      guiaGradeCorLinha: g('trena3DGuiaGradeCorLinha', '#5ec8ff') || '#5ec8ff',
      guiaGradeCorTexto: g('trena3DGuiaGradeCorTexto', '#5ec8ff') || '#5ec8ff',
      // [17/09/2026 UTC] NOVO (RODADA 114) — espessura/estilo/dash da "Guia
      // de grade do mundo" (compartilhados por ao vivo/finalizada).
      guiaGradeEstiloLinha: { estiloLinha: g('trena3DGuiaGradeEstiloLinha', 'solida'), espessuraCm: Number(g('trena3DGuiaGradeEspessuraCm', 2.4)) || 2.4, dashCm: Number(g('trena3DGuiaGradeDashCm', 12)) || 12, gapCm: Number(g('trena3DGuiaGradeGapCm', 8)) || 8 },
      gradeSnapLadrilhoAtiva: g('trena3DGradeSnapLadrilhoAtiva', true) !== false,
      gradeSnapLadrilhoModo: g('trena3DGradeSnapLadrilhoModo', 'atual'),
      gradeSnapEspessuraPx: Number(g('trena3DGradeSnapEspessuraPx', 3)) || 3,
      gradeSnapDashCm: Number(g('trena3DGradeSnapDashCm', 1)) || 1,
      gradeSnapGapCm: Number(g('trena3DGradeSnapGapCm', 2)) || 2,
      // [16/09/2026 UTC] NOVO — pedido verbatim: "deve ser possível escolher
      // a cor do gradeado (que, atualmente, é um azul. Esta deve ser a cor
      // padrão...)." Padrão é o mesmo hex antes fixo no código
      // (`0x7fd8ff`, ver `_trena3DAtualizarGradeSnapLadrilho`).
      gradeSnapCor: g('trena3DGradeSnapCor', '#7fd8ff'),
      // [17/09/2026 UTC] NOVO (RODADA 125) — "mostrar ponto médio da
      // medida" (esfera vermelha) + cor configurável. Ver DEFAULTS
      // (mapconfig.js) e o bloco 'SphereGeometry'/'geoMeioFin' em
      // `_trena3DRebuildLines`, abaixo.
      mostrarPontoMedio: g('trena3DMostrarPontoMedio', true) !== false,
      corPontoMedio: g('trena3DCorPontoMedio', '#ff2d2d') || '#ff2d2d',
      // [17/09/2026 UTC] NOVO (RODADA 125) — "Em cima e no meio"/"Flutuante"
      // pra "Guia rente ao chão"/"Linhas guia da grade do mundo" — mesmo
      // conceito de `labelEstilo` acima, só que 1 campo por guia.
      guiaChaoLabelEstilo: g('trena3DGuiaChaoLabelEstilo', 'sobreLinha'),
      guiaGradeLabelEstilo: g('trena3DGuiaGradeLabelEstilo', 'sobreLinha'),
    };
  }

  /** '#rrggbb' → inteiro hex (0xrrggbb) pro THREE aceitar direto num
   *  `color:` de material. Usado em todo lugar que lê uma das cores
   *  configuráveis acima (`_trena3DCfg`). */
  _trena3DHexToInt(hex, fallbackInt) {
    if (typeof hex !== 'string') return fallbackInt;
    const n = parseInt(hex.replace('#', ''), 16);
    return Number.isFinite(n) ? n : fallbackInt;
  }

  /** [16/09/2026 UTC] NOVO — constrói uma "linha grossa" de verdade (não um
   *  `THREE.Line`, que ignora `linewidth` na esmagadora maioria das
   *  GPUs/navegadores — limitação conhecida do WebGL, não bug deste app):
   *  um cilindro alinhado entre `p1`/`p2`, raio real em METROS (não
   *  pixels), então a espessura configurada (`trena3DEspessuraCm`) fica
   *  igual não importa o zoom/distância — pedido verbatim: "definir a
   *  espessura da linha entre as extremidades". `depthTest:false` (mesmo
   *  de sempre) — a visibilidade "atrás de paredes/objetos" é decidida à
   *  parte, por raycast (`_trena3DAtualizarOclusao`), não pelo depth buffer
   *  da GPU. */
  _trena3DBuildFatLine(p1, p2, corInt, raioMetros) {
    const THREE = window.THREE;
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    if (len < 1e-5) return null;
    const geo = new THREE.CylinderGeometry(raioMetros, raioMetros, len, 8, 1, false);
    const mat = new THREE.MeshBasicMaterial({ color: corInt, depthTest: false, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.renderOrder = 999;
    return mesh;
  }

  /** [17/09/2026 UTC] NOVO (RODADA 114) — helper compartilhado pelos novos
   *  controles de "espessura/estilo/dash" ("Guia de grade do mundo", "Guia
   *  rente ao chão", "Linhas verticais ancoradas" — ver
   *  `_trena3DCamposEstiloLinha`/`_wireTrena3DEstiloLinha` em
   *  mapconfig.js). Devolve um `THREE.Object3D` NOVO — um `Mesh` cilíndrico
   *  sólido de verdade (`_trena3DBuildFatLine`, espessura real em metros)
   *  se `estiloCfg.estiloLinha === 'solida'`, ou uma `THREE.Line` fina com
   *  `LineDashedMaterial` (tracejada/pontilhada, dash/gap configuráveis)
   *  caso contrário. Uso: pontos "descartados/recriados a cada rebuild"
   *  (linhas de medidas já FINALIZADAS, recriadas do zero a cada rebuild
   *  completo do mapa) — pra uma linha "ao vivo" que precisa PERSISTIR o
   *  mesmo objeto entre quadros (só mudando a geometria), ver
   *  `_trena3DAtualizarLinhaEstilizadaAoVivo` logo abaixo. "Pontilhada" é
   *  aproximada por um traço bem curto (a `LineDashedMaterial` do WebGL só
   *  desenha segmentos retos, nunca pontos redondos de verdade) — usa o
   *  próprio `dashCm` configurado, mas limitado a no máximo 2cm, pra ficar
   *  visualmente "pontilhado" mesmo que o usuário digite um valor maior. */
  _trena3DBuildLinhaEstilizadaUmaVez(p1, p2, corInt, estiloCfg) {
    const estilo = (estiloCfg?.estiloLinha === 'tracejada' || estiloCfg?.estiloLinha === 'pontilhada') ? estiloCfg.estiloLinha : 'solida';
    const raioM = Math.max(0.0008, (Number(estiloCfg?.espessuraCm) || 1.2) / 200);
    if (estilo === 'solida') {
      return this._trena3DBuildFatLine(p1, p2, corInt, raioM);
    }
    // [17/09/2026 UTC] CORRIGIDO (RODADA 120) — bug relatado: "ao variar a
    // 'Espessura', somente quando está selecionado 'Sólido' é que está
    // sendo aplicado visualmente [...] quando se está selecionado
    // 'Tracejada' e 'Pontilhada', a 'Espessura' não está sendo aplicada."
    // CAUSA RAIZ: tracejada/pontilhada usavam `THREE.Line`+
    // `LineDashedMaterial` — no WebGL, `Line`/`linewidth` é IGNORADO por
    // quase toda GPU/driver (limitação de longa data da API, documentada há
    // anos pelo próprio Three.js), então NENHUMA espessura configurada
    // jamais teve efeito nesses 2 estilos — só o "Sólido" (`_trena3DBuildFatLine`,
    // um cilindro 3D de verdade, com raio real) sempre respeitou a
    // espessura. CORRIGIDO: tracejada/pontilhada agora são desenhadas com a
    // MESMA técnica de cilindro real — vários trechos de
    // `_trena3DBuildFatLine` em sequência ao longo do segmento, do
    // comprimento do "traço" (`dashM`) intercalados com vãos vazios
    // (`gapM`) — ver `_trena3DBuildLinhaTracejadaEspessa` — a espessura
    // configurada agora se aplica igualmente aos 3 estilos.
    const dashM = Math.max(0.005, (Number(estiloCfg?.dashCm) || 12) / 100);
    const gapM = Math.max(0.005, (Number(estiloCfg?.gapCm) || 8) / 100);
    const dashEfetivo = estilo === 'pontilhada' ? Math.min(dashM, 0.02) : dashM;
    return this._trena3DBuildLinhaTracejadaEspessa(p1, p2, corInt, raioM, dashEfetivo, gapM);
  }

  /** [17/09/2026 UTC] NOVO (RODADA 120) — ver comentário grande em
   *  `_trena3DBuildLinhaEstilizadaUmaVez` (causa raiz do bug corrigido).
   *  Aproxima uma linha tracejada/pontilhada com ESPESSURA REAL, desenhando
   *  1 cilindro (`_trena3DBuildFatLine`) por "traço", do comprimento
   *  `dashM`, intercalado por um vão vazio `gapM`, repetido ao longo de todo
   *  o segmento `p1`→`p2` — devolve um `THREE.Group` com todos os
   *  cilindros (ou `null` se os pontos coincidirem/o passo for inválido).
   *  Mais caro que a antiga `THREE.Line` (N objetos 3D reais em vez de 1
   *  única geometria fina), mas é o único jeito de ter espessura de
   *  verdade — cada medida tem no máximo algumas dezenas de traços, custo
   *  desprezível pra cena inteira. */
  _trena3DBuildLinhaTracejadaEspessa(p1, p2, corInt, raioM, dashM, gapM) {
    const THREE = window.THREE;
    const dist = p1.distanceTo(p2);
    if (dist < 1e-5) return null;
    const passo = dashM + gapM;
    if (passo <= 1e-6) return null;
    const dir = p2.clone().sub(p1).normalize();
    const grupo = new THREE.Group();
    let d = 0;
    while (d < dist - 1e-6) {
      const fim = Math.min(d + dashM, dist);
      if (fim > d + 1e-6) {
        const a = p1.clone().add(dir.clone().multiplyScalar(d));
        const b = p1.clone().add(dir.clone().multiplyScalar(fim));
        const seg = this._trena3DBuildFatLine(a, b, corInt, raioM);
        if (seg) grupo.add(seg);
      }
      d += passo;
    }
    return grupo.children.length ? grupo : null;
  }

  /** [17/09/2026 UTC] NOVO (RODADA 114) — mesma ideia de
   *  `_trena3DBuildLinhaEstilizadaUmaVez` (ver comentário grande lá), mas
   *  pra linhas "ao vivo" que precisam PERSISTIR entre quadros (só a
   *  geometria muda a cada chamada — recriar o objeto inteiro toda hora
   *  seria desperdício). `refName` é o nome da propriedade em `this` onde o
   *  objeto fica guardado entre chamadas (ex. `'_trena3DAnchorLine'`). Se o
   *  ESTILO mudou desde a última chamada (usuário trocou sólida↔tracejada
   *  nas Configurações 3D, com a linha já em tela), o objeto antigo
   *  (`Mesh` ou `Line`, tipos incompatíveis entre si) é descartado e um
   *  novo é criado do tipo certo; senão, só atualiza geometria/cor/dash no
   *  MESMO objeto (barato, sem alocar geometria/material novos a cada
   *  quadro). Devolve o objeto atual (já adicionado a `grupo`), ou `null`
   *  se os pontos coincidirem (nada a desenhar). */
  /** [17/09/2026 UTC] CORRIGIDO (RODADA 120) — descarta `obj` liberando
   *  geometria/material — de um `Mesh`/`Line` direto (como sempre foi) OU,
   *  agora, de um `THREE.Group` de vários cilindros (o novo caso tracejado/
   *  pontilhado com espessura real, ver `_trena3DBuildLinhaTracejadaEspessa`)
   *  — cada filho do grupo tem sua PRÓPRIA geometria/material (não há nada
   *  pra liberar no próprio `Group`, que não tem `geometry`/`material`). */
  _trena3DDescartarLinhaEstilizada(obj) {
    if (!obj) return;
    if (obj.isGroup) {
      obj.children.forEach((filho) => { filho.geometry?.dispose(); filho.material?.dispose(); });
    } else {
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
  }

  _trena3DAtualizarLinhaEstilizadaAoVivo(refName, grupo, p1, p2, corInt, estiloCfg) {
    const estilo = (estiloCfg?.estiloLinha === 'tracejada' || estiloCfg?.estiloLinha === 'pontilhada') ? estiloCfg.estiloLinha : 'solida';
    // [17/09/2026 UTC] CORRIGIDO (RODADA 120) — tracejada/pontilhada agora
    // são um `THREE.Group` de vários cilindros reais (ver comentário grande
    // em `_trena3DBuildLinhaEstilizadaUmaVez`/`_trena3DBuildLinhaTracejadaEspessa`),
    // não dá mais pra "atualizar geometria no mesmo objeto" como a antiga
    // `THREE.Line` fazia (o NÚMERO de cilindros muda conforme o
    // comprimento/dash/gap a cada quadro) — sempre descarta e recria o
    // grupo inteiro pra esses 2 estilos; só "Sólido" (1 único `Mesh`)
    // continua com a otimização de reaproveitar/atualizar o mesmo objeto.
    if (this[refName] && (this[refName].userData?.__estiloTipo !== estilo || estilo !== 'solida')) {
      grupo.remove(this[refName]);
      this._trena3DDescartarLinhaEstilizada(this[refName]);
      this[refName] = null;
    }
    if (!this[refName]) {
      const obj = this._trena3DBuildLinhaEstilizadaUmaVez(p1, p2, corInt, estiloCfg);
      if (!obj) return null;
      obj.userData.__estiloTipo = estilo;
      obj.renderOrder = 999;
      grupo.add(obj);
      this[refName] = obj;
      return obj;
    }
    // Só chega aqui pro estilo 'solida' com o objeto já existindo (o `if`
    // acima já força descarte+recriação em todo outro caso) — cilindro
    // único: mais simples/barato recriar geometria+orientação do zero
    // (mesma conta de `_trena3DBuildFatLine`) do que tentar remontar a
    // `CylinderGeometry` em cima da existente.
    grupo.remove(this[refName]);
    this[refName].geometry.dispose();
    this[refName].material.dispose();
    const raioM = Math.max(0.0008, (Number(estiloCfg?.espessuraCm) || 1.2) / 200);
    const novo = this._trena3DBuildFatLine(p1, p2, corInt, raioM);
    if (!novo) { this[refName] = null; return null; }
    novo.userData.__estiloTipo = 'solida';
    novo.renderOrder = 999;
    grupo.add(novo);
    this[refName] = novo;
    return novo;
  }

  /** [16/09/2026 UTC] NOVO — pedido verbatim: "opções de pontas. Uma ponta
   *  é a atual (uma esfera). Outra opção é uma seta. Outra opção é uma
   *  traço perpendicular a medida feita." `dirParaFora` é o vetor unitário
   *  apontando PRA FORA da medida a partir deste ponto (ex.: no ponto
   *  `p1`, aponta de `p2` pra `p1` — "pra fora" do segmento) — usado só
   *  pela 'seta' (define pra onde ela aponta); a 'esfera'/'traco' não
   *  precisam de direção pra fora, só da direção da LINHA em si (pro
   *  traço, calcular a perpendicular). `dirLinha` é sempre de p1→p2. */
  // [16/09/2026 UTC] MUDANÇA (RODADA 91) — ganhou o parâmetro `cfg` (o
  // mesmo objeto de `_trena3DCfg()`, já lido pelo chamador) pra acessar as
  // novas sub-opções de cada tipo de ponta (tamanho da esfera, dimensões
  // do cone da seta, "seta com 2 traços" NOVA, dimensões/alinhamento/modo
  // do traço perpendicular) sem precisar replicar leitura de config aqui
  // dentro — todo `cfg?.campo` tem fallback pro valor hardcoded de sempre,
  // então chamar esta função sem `cfg` (nenhum lugar faz isso, mas por
  // segurança) preserva o comportamento antigo.
  _trena3DBuildEndpoint(kind, pos, dirLinha, dirParaFora, corInt, raioMetros, cfg) {
    // [17/09/2026 UTC] NOVO (RODADA 114) — pedido verbatim: "deve haver uma
    // opção 'sem pontas' (deve ser a primeira opção)." Nenhuma geometria
    // extra na extremidade — só a linha da medida em si, sem esfera/seta/
    // traço nenhum.
    if (kind === 'nenhuma') return null;
    const THREE = window.THREE;
    const mat = new THREE.MeshBasicMaterial({ color: corInt, depthTest: false, transparent: true, opacity: 0.95 });
    let mesh;
    if (kind === 'seta') {
      // [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve ser
      // possível definir o tamanho da base do cone da seta e a altura do
      // cone da seta individualmente. Os valores atuais devem ser o
      // padrão." `cfg.setaConeRaio`/`cfg.setaConeAltura` são os
      // multiplicadores de sempre (3.2/2.2), agora configuráveis.
      // [17/09/2026 UTC] CORRIGIDO (RODADA 118) — bug relatado: "ao variar
      // o 'Raio da base', não está sendo aplicado ao cone (nenhuma
      // variação visual). Atualmente, apenas a altura está funcionando."
      // CAUSA RAIZ: o piso de segurança (`Math.max(..., 0.045)`) era MAIOR
      // que `raioMetros * raioMult` na faixa inteira "baixa/média" do
      // slider de `raioMult` (min 0,5 até ~4,5, de um total de 0,5-15) —
      // com `raioMetros` default (~0,01m, de `espessuraCm=2`), só valores
      // de `raioMult` ACIMA de ~4,5 conseguiam superar o piso e mostrar
      // alguma diferença; abaixo disso, o cone ficava sempre "grudado" no
      // piso, DE VERDADE sem reagir ao slider, exatamente como relatado —
      // já a altura (`coneAltura = coneRaio * alturaMult`) continuava
      // mudando visualmente porque ela multiplica o `alturaMult` (que o
      // usuário estava variando) pelo `coneRaio` ATUAL (mesmo travado no
      // piso), então a altura sempre refletia a mudança, mascarando o
      // problema do raio. Piso reduzido pra um valor bem menor (mesma
      // ordem de grandeza do usado em `_trena3DBuildFatLine`), só o
      // suficiente pra evitar geometria de raio zero/negativo — nunca mais
      // maior que o menor valor alcançável pelo próprio slider.
      const raioMult = Number(cfg?.setaConeRaio) || 3.2;
      const alturaMult = Number(cfg?.setaConeAltura) || 2.2;
      // [17/09/2026 UTC] CORRIGIDO (RODADA 120) — pedido verbatim: "'Raio da
      // base do cone' deve afetar só o raio da base do cone (não a sua
      // altura). E a opção 'Altura do cone' deve afetar somente a altura do
      // cone (não a base do cone). Atualmente, mexendo em uma acaba
      // alterando o outro." CAUSA RAIZ: `coneAltura = coneRaio * alturaMult`
      // — a altura era calculada MULTIPLICANDO pelo raio já calculado, então
      // qualquer mudança no raio (`raioMult`) também mudava a altura, mesmo
      // com `alturaMult` intocado. CORRIGIDO: os 2 agora partem
      // separadamente de `raioMetros` (a espessura base da linha, a mesma
      // referência que sempre foi usada, sem depender um do outro) — mudar
      // um multiplicador não tem mais nenhum efeito colateral no outro.
      const coneRaio = Math.max(raioMetros * raioMult, 0.0008);
      const coneAltura = Math.max(raioMetros * alturaMult, 0.0008);
      const geo = new THREE.ConeGeometry(coneRaio, coneAltura, 10);
      geo.translate(0, -coneAltura / 2, 0); // pivot no ápice (era no centro) — a ponta fica exatamente em `pos`
      mesh = new THREE.Mesh(geo, mat);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirParaFora);
      mesh.position.copy(pos);
    } else if (kind === 'setaDoisTracos') {
      // [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve ser
      // possível definir outro tipo de seta (a seta com dois traços) [...]
      // controlar a distância entre as pontas que ficam soltas [...] E
      // definir o comprimento gerado pela distância entre o ponto de
      // encontro das duas linhas e a projeção delas na linha da medida."
      // Geometria: o "vértice" (onde as 2 linhas se encontram) fica
      // exatamente na PONTA da medida (`pos`, igual à seta cheia acima);
      // as 2 linhas abrem PRA TRÁS (`dirParaFora` invertido — se afastando
      // da ponta, ao longo da própria linha da medida) até 2 pontas
      // soltas, separadas entre si por `abertura` (perpendicular à linha,
      // usando o mesmo tipo de vetor perpendicular do "traço" abaixo) e
      // recuadas `comprimento` ao longo da linha — ou seja, a projeção de
      // cada ponta solta sobre a linha da medida cai exatamente a
      // `comprimento` de distância do vértice, como pedido.
      const abertura = Math.max(0.01, (Number(cfg?.setaDoisTracosAbertura) || 6) / 100);
      const comprimento = Math.max(0.01, (Number(cfg?.setaDoisTracosComprimento) || 10) / 100);
      const cima = new THREE.Vector3(0, 1, 0);
      let perpOut = new THREE.Vector3().crossVectors(dirParaFora, cima);
      if (perpOut.lengthSq() < 1e-6) perpOut = new THREE.Vector3().crossVectors(dirParaFora, new THREE.Vector3(1, 0, 0));
      perpOut.normalize();
      const raioTraco = Math.max(raioMetros * 0.8, 0.006);
      const base = pos.clone().add(dirParaFora.clone().multiplyScalar(-comprimento));
      const pontaA = base.clone().add(perpOut.clone().multiplyScalar(abertura / 2));
      const pontaB = base.clone().add(perpOut.clone().multiplyScalar(-abertura / 2));
      const grupo = new THREE.Group();
      const seg1 = this._trena3DBuildFatLine(pos, pontaA, corInt, raioTraco);
      const seg2 = this._trena3DBuildFatLine(pos, pontaB, corInt, raioTraco);
      if (seg1) grupo.add(seg1);
      if (seg2) grupo.add(seg2);
      mesh = grupo;
    } else if (kind === 'traco') {
      // [16/09/2026 UTC] MUDANÇA (RODADA 91) — pedido verbatim: "deve ser
      // possível definir o comprimento [...] e se ele fica centralizado,
      // parte da ponta [...] para cima ou [...] para baixo. Além de como
      // ele será renderizado [...] 'do jeito atual' ou [...] paralelos as
      // linhas [...] perpendiculares ao chão [...] Por padrão, fica [este
      // último] modo." `cfg.tracoPerpModoRender`: 'atual' mantém a conta
      // de sempre (perpendicular à LINHA e ao eixo Y — um vetor
      // horizontal-ish); 'paraleloVertical' (NOVO padrão) usa o próprio
      // eixo Y como direção do traço, reutilizando a MESMA orientação da
      // linha vertical tracejada da âncora (`_trena3DAnchorLine`/
      // `_trena3DLiveHeightLine`, sempre `(0,1,0)`) — com um fallback
      // horizontal só pro caso raro da medida já ser vertical (aí "paralelo
      // ao eixo Y" coincidiria com a própria linha da medida, inútil).
      const modoRender = cfg?.tracoPerpModoRender === 'atual' ? 'atual' : 'paraleloVertical';
      let perp;
      if (modoRender === 'paraleloVertical') {
        const y = new THREE.Vector3(0, 1, 0);
        const dirLinhaNorm = dirLinha.clone().normalize();
        if (Math.abs(dirLinhaNorm.dot(y)) > 0.999) {
          perp = new THREE.Vector3().crossVectors(dirLinha, new THREE.Vector3(1, 0, 0));
          if (perp.lengthSq() < 1e-6) perp = new THREE.Vector3().crossVectors(dirLinha, new THREE.Vector3(0, 0, 1));
        } else {
          perp = y.clone();
        }
      } else {
        const cima = new THREE.Vector3(0, 1, 0);
        perp = new THREE.Vector3().crossVectors(dirLinha, cima);
        if (perp.lengthSq() < 1e-6) perp = new THREE.Vector3().crossVectors(dirLinha, new THREE.Vector3(1, 0, 0));
      }
      perp.normalize();
      // [17/09/2026 UTC] CORRIGIDO (RODADA 118) — mesma causa raiz do bug
      // do "Raio da base" da seta (ver comentário grande lá): o piso
      // `0.16` era MAIOR que `raioMetros * comprMult` em quase toda a
      // faixa do slider (1 a 20, `raioMetros` default ~0,01m → só
      // `comprMult` acima de ~16 conseguia superar o piso) — "nenhuma
      // alteração visual [...] o traço sempre fica com o mesmo
      // comprimento" relatado batia exatamente com isso. Piso reduzido
      // pra só evitar comprimento zero/negativo.
      const comprMult = Number(cfg?.tracoPerpComprimento) || 7;
      const compr = Math.max(raioMetros * comprMult, 0.005);
      const geo = new THREE.CylinderGeometry(Math.max(raioMetros * 0.8, 0.006), Math.max(raioMetros * 0.8, 0.006), compr, 6);
      mesh = new THREE.Mesh(geo, mat);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), perp);
      // [16/09/2026 UTC] NOVO (RODADA 91) — "se ele fica centralizado,
      // parte da ponta [...] para cima ou [...] para baixo." Comportamento
      // de sempre (`centralizado`) mantinha o cilindro centrado em `pos` —
      // 'paraCima'/'paraBaixo' deslocam o CENTRO do cilindro por metade do
      // comprimento, ao longo de `perp`, fazendo a ponta `pos` coincidir
      // com uma das extremidades do traço em vez do meio dele.
      let offset = 0;
      if (cfg?.tracoPerpAlinhamento === 'paraCima') offset = compr / 2;
      else if (cfg?.tracoPerpAlinhamento === 'paraBaixo') offset = -compr / 2;
      mesh.position.copy(pos).add(perp.clone().multiplyScalar(offset));
    } else {
      // [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve ser
      // possível definir o tamanho da esfera." `cfg.esferaTamanho` é o
      // multiplicador de sempre (1.7), agora configurável.
      // [17/09/2026 UTC] CORRIGIDO (RODADA 120) — bug relatado: "o tamanho
      // da esfera não está mudando, mesmo alterando o valor de 'Tamanho da
      // esfera'." MESMA classe de bug já corrigida em outros pontos desta
      // função (RODADA 118): o piso de segurança `0.035` era MAIOR que
      // `raioMetros * tamanhoMult` em boa parte da faixa do slider (0,3 a
      // 10, `raioMetros` default ~0,01m → só `tamanhoMult` acima de ~3,5
      // conseguia superar o piso) — a esfera ficava "grudada" no piso,
      // sem reagir de verdade ao slider abaixo disso. Piso reduzido pra
      // `0.0008` (mesma ordem de grandeza usada nos outros pisos desta
      // função).
      // [RODADA 135] MUDANÇA -- `esferaTamanho` agora é o raio ABSOLUTO da
      // esfera em metros (antes era um multiplicador de `raioMetros`) --
      // sempre limitado a [0.01, 1], mesmo que um valor fora da faixa
      // chegue aqui por algum caminho (config salva antiga, etc.).
      const r = Utils.clamp(Number(cfg?.esferaTamanho) || 0.02, 0.01, 1);
      const geo = new THREE.SphereGeometry(r, 8, 8);
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
    }
    mesh.renderOrder = 999;
    return mesh;
  }

  /** [16/09/2026 UTC] NOVO (RODADA 98) — pedido verbatim: "Deve ser possível
   *  colocar medidas apontando para lados (parede, porta janela, objetos
   *  pela lateral). Atualmente, é só a parte de cima dos objetos [...] uma
   *  opção para que o raycaster atinja os lados." INVESTIGAÇÃO: todo
   *  raycasting de ancoragem/clique da Trena 3D (`_trena3DClick`/
   *  `_trena3DUpdatePreview`) já passava por `Engine3D.raycastSurface` —
   *  que só considera malhas 'object'/'tijolo' (paredes e porta/janela
   *  ficam de fora por completo) e, mesmo nessas, só aceita uma face com
   *  normal virada pra CIMA (`worldNormal.y < 0.5` descarta o resto) — ou
   *  seja, a Trena 3D nunca conseguia mesmo mirar uma parede ou a lateral
   *  de um objeto, exatamente como relatado. Esta função central decide
   *  qual raycast usar: o de sempre (`raycastSurface`, comportamento
   *  padrão preservado) ou o novo `raycastSurfaceAmpliado` (parede/porta/
   *  janela incluídos, sem filtro de normal) quando a opção nova
   *  `trena3DPermitirSuperficiesLaterais` está ativa — chamada nos 3
   *  pontos onde a Trena 3D decide onde um ponto vai cair (1º ponto, 2º
   *  ponto, âncora Ctrl). `cfgJaLido` opcional evita reler `_trena3DCfg()`
   *  quando quem chama já tem uma cópia fresca em mãos (evita recalcular a
   *  mesma config 2x no mesmo frame/clique). */
  _trena3DRaycastPrincipal(ray, cfgJaLido) {
    const cfg = cfgJaLido || this._trena3DCfg();
    return cfg.permitirSuperficiesLaterais
      ? this._engine.raycastSurfaceAmpliado(ray.origin, ray.dir)
      : this._engine.raycastSurface(ray.origin, ray.dir);
  }

  /** [16/09/2026 UTC] CORRIGIDO — pedido verbatim: "Esta opção deve servir
   *  para ser um novo 'chão'. [...] o clique não deve ser interceptado
   *  pela chão de ladrilho do mundo e sim por este novo chão, com uma
   *  altura a mais em y." Antes desta correção, `cfg.continuarNoNivel`
   *  (RODADA 101) só mudava a MIRA visual (`_trena3DUpdatePreview` —
   *  `modoContinuarNivel`, via `Engine3D.raycastPlaneY`) — o CLIQUE de
   *  verdade que decide onde o ponto é fixado continuava chamando
   *  `_trena3DRaycastPrincipal` (geometria real: chão de ladrilho do
   *  mundo y=0, paredes, objetos), então clicar podia "furar" pro chão de
   *  baixo (ou não registrar nada) num lugar diferente do que a mira
   *  mostrava. Esta função central substitui `_trena3DRaycastPrincipal`
   *  em TODO ponto onde a Trena 3D decide onde um clique "aterrissa" (1º
   *  ponto, 2º ponto, âncora Ctrl) — mesma condição/mesmo plano que a
   *  prévia já usa (`!this._trena3DVerticalAnchor && cfg.continuarNoNivel
   *  && this._trena3DPendingP1`): com o 1º ponto já fixado e a opção
   *  ativa (e nenhuma âncora vertical em curso), o "chão" passa a ser o
   *  plano horizontal Y = altura do 1º ponto, não mais y=0. Sem 1º ponto
   *  fixado, ou com a opção desativada, ou com âncora vertical em curso,
   *  comportamento 100% igual a antes (delega para
   *  `_trena3DRaycastPrincipal`). */
  _trena3DRaycastChaoNivel(ray, cfgJaLido) {
    const cfg = cfgJaLido || this._trena3DCfg();
    // [18/09/2026 UTC] NOVO (RODADA 149) — pedido verbatim: "Ativando está
    // opção [...] será possível apontar para a ponta de uma medida já feita
    // e começar a medida ou a ancorar a linha âncora a partir dela. [...] O
    // y desse ponto apontado, torna-se o novo 'chão'." Checada ANTES de
    // qualquer outra coisa (inclusive do "chão de nível" de
    // `continuarNoNivel`, logo abaixo — a ponta de uma medida já existente é
    // um alvo mais específico/intencional, tem prioridade) — este é o ÚNICO
    // ponto de decisão de onde um clique "aterrissa" chamado tanto pelo
    // fluxo de ancoragem (Ctrl) quanto pelo fluxo de ponto direto (ver
    // `_trena3DClick`, os 3 call-sites), então checar aqui cobre os 2 casos
    // pedidos (a) e (b) de uma vez só, sem duplicar nada em `_trena3DClick`.
    // Quando uma ponta é encontrada, ela é devolvida NO LUGAR do raycast
    // normal — dali em diante, `_trena3DClick` trata como se tivesse
    // atingido essa ponta na cena de verdade (define o 1º/2º ponto ali, ou
    // ancora X/Z ali). Como o Y devolvido é o Y REAL da ponta encontrada, o
    // "chão" some sozinho pra reaproveitar (sem nenhum código extra): quando
    // vira o 1º ponto (`_trena3DPendingP1`), a opção "Continuar no nível do
    // 1º ponto" já lê `_trena3DPendingP1.y` dinamicamente a cada quadro (ver
    // comentário grande logo acima desta função) — então o Y da ponta
    // encontrada passa a valer como "chão" pros próximos cliques dessa
    // medida exatamente do mesmo jeito que o Y de qualquer 1º ponto normal
    // já valia antes desta rodada.
    if (cfg.ancorarPontoMedida) {
      const ponta = this._trena3DEncontrarPontaProximaMedida(ray);
      if (ponta) return { x: ponta.x, y: ponta.y, z: ponta.z };
    }
    if (!this._trena3DVerticalAnchor && cfg.continuarNoNivel && this._trena3DPendingP1) {
      const nivelY = this._trena3DPendingP1.y;
      const hit = this._engine.raycastPlaneY?.(ray.origin, ray.dir, nivelY);
      return hit ? { x: hit.x, y: nivelY, z: hit.z } : null;
    }
    return this._trena3DRaycastPrincipal(ray, cfg);
  }

  /** [18/09/2026 UTC] NOVO (RODADA 149) — detecção de proximidade entre a
   *  mira (raio 3D central, Pointer Lock) e as PONTAS (P1/P2) de qualquer
   *  medida já salva em `map.medidas2d` — inclusive segmentos dentro de
   *  "medidas agrupadas" (RODADA 148), que são só entradas normais de
   *  `medidas2d` com `grupoId`/`grupoOrdem`, então já são cobertas sem
   *  nenhum tratamento especial, iterando o array inteiro como sempre.
   *  MECANISMO ESCOLHIDO: distância do RAIO 3D até o ponto (perpendicular),
   *  NÃO projeção em pixels de tela — mesmo padrão já usado por
   *  `_trena3DPickAtRay` (excluir medida clicando nela no 3D, logo abaixo
   *  neste arquivo) e por `_trena3DClosestPointOnVerticalLine` (linha
   *  âncora). Preferido a pixels de tela por 3 motivos: (1) reaproveita a
   *  MESMA matemática de raio já usada em todo o resto da Trena 3D — nenhum
   *  código novo de projeção câmera→tela precisou ser escrito ou testado;
   *  (2) funciona igual não importa o zoom/FOV/resolução da janela, sem
   *  precisar calibrar um raio em px que "sinta" igual em qualquer tela; (3)
   *  o raio da mira SEMPRE passa pelo centro exato da tela (Pointer Lock,
   *  mira fixa) — a "distância em pixels até o centro" seria simplesmente a
   *  MESMA conta de novo, só que via matriz de projeção, mais cara e mais
   *  código pra chegar no mesmo resultado. Raio de tolerância em METROS
   *  (`RAIO_TOLERANCIA_M`): 0,35m — folga generosa o bastante pra "grudar"
   *  mirando perto (não exatamente em cima, pixel a pixel) da ponta, mas
   *  pequena o bastante pra não roubar cliques destinados a uma superfície
   *  normal a poucos passos dali. Devolve a ponta mais PRÓXIMA do raio
   *  dentre todas as candidatas dentro da tolerância (não a 1ª encontrada),
   *  e só considera pontos "na frente" da câmera (`t >= 0`) — mesma guarda
   *  usada em `_trena3DClosestPointOnVerticalLine`. */
  _trena3DEncontrarPontaProximaMedida(ray) {
    if (!this._map) return null;
    const medidas = this._map.medidas2d;
    if (!medidas || !medidas.length) return null;
    const RAIO_TOLERANCIA_M = 0.35;
    const dirLen = Math.hypot(ray.dir.x, ray.dir.y, ray.dir.z) || 1;
    const dx = ray.dir.x / dirLen, dy = ray.dir.y / dirLen, dz = ray.dir.z / dirLen;
    let melhor = null;
    let melhorDist = RAIO_TOLERANCIA_M;
    // Mesma convenção x/y/z<->mundo 3D usada em `_trena3DFinalize`/
    // `_trena3DRebuildLines`: `y` da medida (2D) é a profundidade `z` do
    // mundo 3D; `z` da medida é a altura `y` do mundo 3D.
    const testarPonta = (px, py, pz) => {
      const ox = px - ray.origin.x, oy = py - ray.origin.y, oz = pz - ray.origin.z;
      const t = ox * dx + oy * dy + oz * dz;
      if (t < 0) return;
      const cx = ray.origin.x + dx * t, cy = ray.origin.y + dy * t, cz = ray.origin.z + dz * t;
      const dist = Math.hypot(px - cx, py - cy, pz - cz);
      if (dist < melhorDist) { melhorDist = dist; melhor = { x: px, y: py, z: pz }; }
    };
    medidas.forEach((m) => {
      testarPonta(m.x1, m.z1 || 0, m.y1);
      testarPonta(m.x2, m.z2 || 0, m.y2);
    });
    return melhor;
  }

  /** Clique principal da ferramenta "📏 Trena 3D" (hotbar, `_buildTool ===
   *  'trena3d'`) — chamado pelo `onClick` do canvas (ver mais acima), SEMPRE
   *  com a mira central (Pointer Lock), igual às outras ferramentas desta
   *  hotbar. `ctrlHeld`: `e.ctrlKey` do clique que acabou de acontecer. */
  _trena3DClick(ctrlHeld) {
    if (!this._map || !this._engine || typeof Mapping === 'undefined') return;
    // [16/09/2026 UTC] NOVO — guarda contra clique duplicado. Usuário
    // relatou "parece imprimir duas medidas simultâneas" ao finalizar UMA
    // medida nova (2 cliques). HIPÓTESE MAIS PROVÁVEL: o evento `click` do
    // canvas disparando 2x seguidas pro MESMO clique físico — este mesmo
    // arquivo já lida, em outro lugar (`canvas.requestPointerLock?.()
    // ?.catch?.(...)`, mais acima), com quirks conhecidos de clique/
    // Pointer Lock brigando entre si; um clique físico às vezes gera mais
    // de um evento `click` no navegador perto de um lock/unlock de
    // ponteiro (ou, num teclado/mouse específico, um "double-fire" de
    // hardware). SEM esta guarda, a 2ª chamada (poucos milissegundos
    // depois, mira praticamente igual) processava o estado JÁ avançado
    // pela 1ª chamada como se fosse um clique novo de verdade — plantando
    // um 2º "ponto pendente" fantasma que o PRÓXIMO clique do usuário
    // (com outra intenção qualquer) acabava fechando sozinho como uma
    // medida curta indesejada, dando a impressão de "duas medidas" por uma
    // ação só. Nenhuma pessoa clica 2x de propósito em menos de ~150ms —
    // qualquer chamada mais rápida que isso é tratada como o MESMO clique
    // físico e ignorada (o clique de verdade seguinte funciona normal).
    const agoraClique = performance.now();
    if (this._trena3DLastClickAt != null && (agoraClique - this._trena3DLastClickAt) < 150) return;
    this._trena3DLastClickAt = agoraClique;
    // [16/09/2026 UTC] CORRIGIDO — bug encontrado nesta rodada (achado ao
    // investigar o pedido do 4-cliques): 'modoQuatroCliques'/'cfgClick' eram
    // usados mais abaixo nesta função (nos blocos 'if (ctrlHeld)'/'if
    // (this._trena3DVerticalAnchor)') mas não estavam mais sendo declarados
    // aqui — sumiram numa edição anterior (mesma classe de bug do
    // 'modoAncora' que sumiu de '_trena3DCfg()', ver Rodada 85). Isso jogava
    // um ReferenceError toda vez que se clicava segurando Ctrl (ou soltava
    // pra fixar um ponto "no ar") — ou seja, a ferramenta "Trena 3D" com
    // âncora (Ctrl OU "Sempre com 4 cliques") estava quebrada de verdade,
    // não só o modo "Sempre com 4 cliques" como já reportado. Readicionado.
    const cfgClick = this._trena3DCfg();
    const modoQuatroCliques = cfgClick.modoAncora === 'quatroCliques';
    // No modo "Sempre com 4 cliques", o Ctrl físico é ignorado por completo
    // — todo clique sem âncora ainda ativa vira automaticamente um clique
    // "com Ctrl" (marca âncora); todo clique COM âncora já ativa vira
    // automaticamente um clique "sem Ctrl" (comita o ponto "no ar").
    if (modoQuatroCliques) ctrlHeld = !this._trena3DVerticalAnchor;
    const ray = this._engine.centerRay(this._camera);
    // [16/09/2026 UTC] REESCRITO — pedido verbatim do usuário (mecânica de
    // âncora generalizada pros 2 pontos, não só o 2º como na rodada
    // anterior): "Tanto para o primeiro quanto para o segundo clique, se
    // segurar o ctrl, o clique feito [...] deve fazer um ponto de
    // ancoragem para estabelecer uma linha perpendicular ao 'chão' e poder
    // selecionar (com snap) algum ponto nessa linha para poder clicar e
    // fixar 'no ar'". Sequência confirmada pelo usuário (exemplo numerado):
    // qualquer clique SEGURANDO Ctrl (não importa se é o 1º ou o 2º ponto
    // da medida que está sendo escolhido agora) só MARCA/SOBRESCREVE a
    // âncora — mira num ponto real do chão/objeto/parede, mesma
    // `raycastSurface` de sempre, e nunca finaliza nada, por mais vezes
    // que se repita. O clique seguinte SEM Ctrl (depois de pelo menos 1
    // âncora marcada) é que COMITA o ponto (1º ou 2º, o que estiver
    // faltando) — "no ar", restrito à reta vertical que passa pela âncora
    // (X/Z travados no ponto ancorado, só a altura vem da mira atual, via
    // `_trena3DClosestPointOnVerticalLine`, MESMA conta usada pela prévia
    // ao vivo em `_trena3DUpdatePreview`). Sem âncora nenhuma ativa, um
    // clique sem Ctrl continua se comportando exatamente como antes desta
    // rodada: mira direto contra uma superfície de verdade.
    if (ctrlHeld) {
      const hit = this._trena3DRaycastChaoNivel(ray, cfgClick);
      if (!hit) {
        this._toast(modoQuatroCliques
          ? 'Trena 3D: mire numa superfície pra marcar o ponto de ancoragem.'
          : 'Trena 3D: segure Ctrl mirando numa superfície pra marcar a âncora.', { type: 'warn', duration: 1800 });
        return;
      }
      this._trena3DVerticalAnchor = { x: this._trena3DSnap(hit.x), z: this._trena3DSnap(hit.z) };
      const qual = this._trena3DPendingP1 ? '2º' : '1º';
      this._toast(modoQuatroCliques
        ? `Trena 3D: ponto de ancoragem do ${qual} ponto marcado — clique de novo pra fixar o ${qual} ponto da medida nesta linha "no ar".`
        : `Trena 3D: âncora marcada — solte o Ctrl e clique pra fixar o ${qual} ponto nesta linha "no ar" (ou segure Ctrl de novo pra mover a âncora).`, { duration: 2800 });
      return;
    }
    if (this._trena3DVerticalAnchor) {
      // Âncora já marcada e este clique veio SEM Ctrl (modo "Ctrl") OU é o
      // clique de consumo automático (modo "quatroCliques") — comita o
      // ponto que estiver faltando "no ar", sobre a reta vertical da
      // âncora, e consome/esquece a âncora (a PRÓXIMA âncora, se houver, é
      // sempre marcada do zero — por um novo Ctrl-clique no modo "Ctrl", ou
      // automaticamente no 3º clique da sequência no modo "quatroCliques").
      const anchor = this._trena3DVerticalAnchor;
      const p = this._trena3DClosestPointOnVerticalLine(ray, anchor.x, anchor.z);
      this._trena3DVerticalAnchor = null;
      if (!this._trena3DPendingP1) {
        this._trena3DPendingP1 = p;
        this._toast(modoQuatroCliques
          ? 'Trena 3D: 1º ponto marcado "no ar" — clique pra marcar o ponto de ancoragem do 2º ponto.'
          : 'Trena 3D: 1º ponto marcado "no ar" — clique no 2º (ou segure Ctrl pra ancorar de novo).', { duration: 2200 });
        return;
      }
      this._trena3DFinalize(this._trena3DPendingP1, p);
      return;
    }
    // Sem âncora ativa — só chega aqui no modo "Ctrl" (no modo
    // "quatroCliques", `ctrlHeld` acima é sempre `true` quando não há
    // âncora nenhuma, então este trecho nunca roda — nesse modo, mede-se
    // SEMPRE por âncora, nunca clicando direto numa superfície). Modo
    // "Ctrl", sem nunca ter usado Ctrl: comportamento de sempre, mira
    // direto contra uma superfície de verdade (chão/objeto/parede).
    if (!this._trena3DPendingP1) {
      const hit = this._trena3DRaycastChaoNivel(ray, cfgClick);
      if (!hit) { this._toast('Trena 3D: mire numa superfície pro 1º ponto (ou segure Ctrl pra medir "no ar").', { type: 'warn', duration: 1800 }); return; }
      this._trena3DPendingP1 = { x: this._trena3DSnap(hit.x), y: this._trena3DSnap(hit.y), z: this._trena3DSnap(hit.z) };
      this._toast('Trena 3D: 1º ponto marcado — clique no 2º (segure Ctrl pra medir "no ar").', { duration: 2200 });
      return;
    }
    const hit2 = this._trena3DRaycastChaoNivel(ray, cfgClick);
    if (!hit2) { this._toast('Trena 3D: mire numa superfície pro 2º ponto (ou segure Ctrl pra medir "no ar").', { type: 'warn', duration: 2200 }); return; }
    const p2 = { x: this._trena3DSnap(hit2.x), y: this._trena3DSnap(hit2.y), z: this._trena3DSnap(hit2.z) };
    this._trena3DFinalize(this._trena3DPendingP1, p2);
  }

  /** Ponto mais próximo entre o raio da mira (`ray.origin`/`ray.dir`) e a
   *  reta vertical infinita que passa por `(ax, *, az)` — projeção do vetor
   *  do ponto de partida do raio até a reta na direção horizontal do raio
   *  (a componente Y do raio não entra nessa conta: só decide ONDE ao
   *  longo do raio, em X/Z, ele passa mais perto da reta; a altura final
   *  vem de aplicar esse mesmo `t` na equação do raio). Resultado sempre
   *  travado em `[0, 6]` metros de altura — evita medidas "no ar" a uma
   *  distância absurda se a mira estiver quase paralela à reta vertical
   *  (caso degenerado em que a projeção fica numericamente instável). */
  /** [16/09/2026 UTC] NOVO — pedido verbatim: "Elimine o teto de 6m das
   *  linhas tracejadas perpendiculares ao chão (linhas âncora)." Antes, a
   *  altura (Y) de um ponto ancorado (`_trena3DClosestPointOnVerticalLine`)
   *  era limitada a no máximo 6m (`Math.min(6, ...)`) — mesmo limite usado
   *  pra desenhar a reta tracejada de referência inteira
   *  (`_trena3DAnchorLine`/`_trena3DP1HeightLine` em modo 'infinita'/linha
   *  das medidas finalizadas em modo 'infinita'). Removido o teto: a altura
   *  não tem mais limite superior algum (só o piso em y=0 continua, uma
   *  âncora não pode ficar "abaixo do chão"). Como as linhas tracejadas de
   *  referência (que representam TODA a extensão selecionável da reta, não
   *  só até a altura já escolhida) precisam de um número finito pra
   *  desenhar a geometria, usam este valor bem alto — bem além de qualquer
   *  altura prática de uso real do app — em vez do antigo 6m, dando a
   *  impressão visual de uma reta sem teto nenhum. */
  _trena3DAlturaLinhaAncoraSemTeto() {
    return 250;
  }

  _trena3DClosestPointOnVerticalLine(ray, ax, az) {
    const dx = ray.dir.x, dz = ray.dir.z;
    const denom = dx * dx + dz * dz;
    let t = 0;
    if (denom > 1e-8) {
      t = ((ax - ray.origin.x) * dx + (az - ray.origin.z) * dz) / denom;
      t = Math.max(0, t);
    }
    const y = ray.origin.y + t * ray.dir.y;
    return { x: this._trena3DSnap(ax), y: this._trena3DSnap(Math.max(0, y)), z: this._trena3DSnap(az) };
  }

  /** Grava a medida finalizada em `map.medidas2d` (MESMO array/formato da
   *  Trena 2D — ver `Mapping.addWall`-style `x1,y1,x2,y2` — só que `y` de
   *  cada ponto (a ALTURA, eixo vertical de verdade em three.js) vira
   *  `z1`/`z2`, e o `z` do ponto (a coordenada "profundidade" do mundo 3D)
   *  vira o `y1`/`y2` de sempre — mesma convenção já usada em TODO o resto
   *  do app pra converter entre o plano 2D (x,y) e o mundo 3D (x,y=altura,
   *  z), ver `Engine3D._buildOneObjectMeshCore`/`obj.x`/`obj.y`). */
  _trena3DFinalize(p1, p2) {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    if (dist < 0.02) { this._toast('Trena 3D: os 2 pontos ficaram quase no mesmo lugar — medida ignorada.', { type: 'warn', duration: 2200 }); this._trena3DPendingP1 = null; this._trena3DVerticalAnchor = null; return; }
    if (!this._map.medidas2d) this._map.medidas2d = [];
    const cfgSeqPre = this._trena3DCfg ? this._trena3DCfg() : null;
    // [18/09/2026 UTC] NOVO (RODADA 148) — pedido verbatim: "Na opção
    // 'Medidas em sequência' deve ter uma subopção para que sejam ou
    // 'medidas únicas' ou 'medidas agrupadas'. A 'medidas agrupadas' acaba
    // sendo uma polilinha e deve ser tratada assim e guardada assim
    // também." DECISÃO DE ARQUITETURA (ver comentário grande em
    // DEFAULTS.trena3DSequenciaTipo, mapconfig.js): em vez de uma entrada
    // de N pontos (`pontos:[...]`), cada segmento continua sendo salvo
    // exatamente como hoje (entrada própria x1/y1/z1/x2/y2/z2) — só ganha
    // 2 campos novos, `grupoId` (UUID comum a todos os segmentos da MESMA
    // sequência agrupada) e `grupoOrdem` (posição do segmento dentro do
    // grupo, 0-based) — como o modo sequência já faz o 2º ponto de um
    // segmento virar o 1º do próximo (RODADA 146), essa lista ordenada por
    // `grupoOrdem` JÁ É, de fato, uma polilinha de pontos compartilhados,
    // sem duplicar nenhuma coordenada além da que a sequência já duplicava
    // (cada `pN` vive em 2 segmentos: como `x2/y2/z2` de um e `x1/y1/z1` do
    // seguinte). `_trena3DRebuildLines`/edição/exclusão continuam
    // ignorando os 2 campos novos por completo — nenhuma mudança de
    // renderização foi necessária, o desenho encadeado já existia desde a
    // RODADA 146. O grupo "fecha" (o PRÓXIMO segmento, se houver, começa um
    // `grupoId` NOVO) em 3 situações, todas já existentes como pontos de
    // "reset" de `_trena3DPendingP1`: pressionar ESC
    // (`_trena3DCancelarMedidaEmAndamento`), sair/trocar de ferramenta
    // (`setBuildTool`) ou desmontar a cena 3D (`unmount`) — ver os 3
    // lugares que agora também zeram `_trena3DGrupoAtualId`.
    const seqAtiva = !!(cfgSeqPre && cfgSeqPre.modoSequencia);
    const agruparAtivo = seqAtiva && cfgSeqPre.sequenciaTipo === 'agrupadas';
    let grupoIdAtual = null;
    let grupoOrdemAtual = 0;
    if (agruparAtivo) {
      if (!this._trena3DGrupoAtualId) { this._trena3DGrupoAtualId = DB.uuid(); this._trena3DGrupoAtualOrdem = 0; }
      grupoIdAtual = this._trena3DGrupoAtualId;
      grupoOrdemAtual = this._trena3DGrupoAtualOrdem;
      this._trena3DGrupoAtualOrdem += 1;
    } else {
      // Fora do modo "agrupadas" (inclusive "medidas únicas" dentro da
      // própria "sequência"), nenhum grupo fica pendente — a próxima vez
      // que "agrupadas" for reativado começa um `grupoId` totalmente novo.
      this._trena3DGrupoAtualId = null;
      this._trena3DGrupoAtualOrdem = 0;
    }
    this._map.medidas2d.push({
      id: DB.uuid(),
      x1: p1.x, y1: p1.z, z1: p1.y,
      x2: p2.x, y2: p2.z, z2: p2.y,
      modo: 'manual3d',
      layerId: this._layerIdParaNovosItens ? this._layerIdParaNovosItens() : undefined,
      criadoEm: DB.nowISO(),
      nome: Mapping._nextObjectName(this._map, 'Trena'),
      ...(grupoIdAtual ? { grupoId: grupoIdAtual, grupoOrdem: grupoOrdemAtual } : {}),
    });
    // [18/09/2026 UTC] NOVO (RODADA 146) — pedido verbatim: modo "medidas em
    // sequência" (alternativa ao modo padrão "apenas uma medida"). Quando
    // ativo (`cfg.trena3DModoSequencia`), o ponto que acabou de ser
    // commitado (`p2`) vira o NOVO `_trena3DPendingP1` da PRÓXIMA medida —
    // em vez de resetar pra `null` e exigir clicar do zero, o próximo
    // clique já começa a desenhar a 2ª medida a partir de onde a anterior
    // terminou. Cada medida continua sendo uma entrada INDEPENDENTE em
    // `map.medidas2d` (não uma polilinha única) — só o FLUXO de criação
    // encadeia visualmente ponta-a-ponta. A opção '⇔▦' (`continuarNoNivel`,
    // ver `_trena3DDeterminarAlvo3D`/`_update`) já lê `this._trena3DPendingP1.y`
    // DINAMICAMENTE a cada quadro — nenhuma mudança adicional foi necessária
    // ali: como `_trena3DPendingP1` agora é atualizado pra `p2` neste modo,
    // o "chão" da opção '⇔▦' automaticamente passa a ser a altura do último
    // ponto commitado, sem nenhuma variável de altura "congelada".
    const cfgSeq = this._trena3DCfg ? this._trena3DCfg() : null;
    if (cfgSeq && cfgSeq.modoSequencia) {
      this._trena3DPendingP1 = { x: p2.x, y: p2.y, z: p2.z };
    } else {
      this._trena3DPendingP1 = null;
    }
    this._trena3DVerticalAnchor = null;
    DB.saveMap(this._map);
    this._trena3DRebuildLines();
    this._toast(`Trena 3D: ${dist.toFixed(2)}m ✓`, { type: 'ok', duration: 2600 });
  }

  /** Grupo THREE dedicado às linhas/pontas da Trena 3D — separado do resto
   *  da cena (`this._engine.scene`) só pra poder ser limpo/reconstruído
   *  inteiro sem tocar em mais nada, mesmo padrão de outros grupos
   *  auxiliares do motor (ver `_sunMesh`/`_moonMesh`, engine3d.js). */
  _trena3DEnsureGroup() {
    const THREE = window.THREE;
    if (!THREE || !this._engine?.scene) return null;
    if (!this._trena3DGroup) {
      this._trena3DGroup = new THREE.Group();
      this._trena3DGroup.name = 'trena3d';
      this._engine.scene.add(this._trena3DGroup);
    }
    return this._trena3DGroup;
  }

  /** Descarta e recria TODAS as linhas 3D + rótulos DOM de todas as medidas
   *  salvas (`map.medidas2d`) — chamado por `_rebuildScene()` (reabrir o
   *  "Ver em 3D", trocar de andar/câmadas) e logo após salvar uma medida
   *  nova/editada (`_trena3DFinalize`). Medidas "puramente 2D" (z1/z2
   *  ausentes ou ambos 0) também ganham uma linha aqui — pedido do usuário
   *  não distingue medida "nova" de "antiga", só pede que a Trena TODA
   *  passe a existir no 3D.
   *  [16/09/2026 UTC] CORRIGIDO — bug relatado: "as medidas 3D só aparecem
   *  depois de uma segunda entrada no 3D. Entra, sai, entra de novo. Então,
   *  as medidas aparecem." CAUSA RAIZ: `_rebuildScene()` chama
   *  `this._engine.setScene(...)` e, IMEDIATAMENTE depois (mesmo bloco
   *  síncrono), este método — mas `Engine3D.setScene` (engine3d.js) tem uma
   *  guarda pra quando o Three.js AINDA está carregando (`if (!this._ready)
   *  { this._pendingScene = mapData; return; }`, só na PRIMEIRÍSSIMA vez
   *  que "Ver em 3D" é aberto numa aba — `_initThree()` é assíncrono e pode
   *  não ter terminado ainda) — nesse caso `this._engine.scene` também
   *  ainda não existe (só é criado dentro de `_initThree`), então
   *  `_trena3DEnsureGroup()` (abaixo) falha e devolve `null` NA HORA, e as
   *  medidas nunca são desenhadas. Quando `_initThree()` termina, ele
   *  aplica sozinho o `_pendingScene` guardado (`this.setScene(pending)`),
   *  mas ESSA chamada interna não sabe nada da Trena 3D — nunca re-chama
   *  este método. Na 2ª entrada, `_ready` já está `true` desde a 1ª vez, daí
   *  `setScene` roda direto (sem guardar em pending) e tudo funciona.
   *  CORRIGIDO: quando este método falha por falta de `scene` ainda pronta,
   *  marca `this._trena3DPendingRebuild = true` — `_loop()` (chamado todo
   *  quadro) tenta de novo sozinho a cada quadro enquanto essa flag estiver
   *  ligada, e para de tentar assim que conseguir (ver `_loop`). */
  _trena3DRebuildLines() {
    const THREE = window.THREE;
    const grupo = this._trena3DEnsureGroup();
    if (!THREE || !grupo || !this._map) { this._trena3DPendingRebuild = true; return; }
    this._trena3DPendingRebuild = false;
    while (grupo.children.length) {
      const child = grupo.children.pop();
      // [16/09/2026 UTC] NOVO — cada medida agora vira um SUBGRUPO (linha
      // grossa + 2 pontas, ver `_trena3DCfg`/`_trena3DBuildFatLine`/
      // `_trena3DBuildEndpoint` abaixo), não mais 1 `Line` + 2 esferas soltas
      // direto em `grupo` — precisa descer 1 nível a mais pra liberar
      // geometria/material de cada peça.
      // [16/09/2026 UTC] MUDANÇA (RODADA 91) — a ponta "seta com dois
      // traços" (NOVA) é ela mesma um `THREE.Group` (2 segmentos de linha),
      // ou seja, agora existe um 3º nível possível (subgrupo → ponta-grupo
      // → segmento) — trocado o descarte de 1 nível fixo por uma função
      // RECURSIVA (`descartar`), que desce por qualquer profundidade de
      // `Group`s aninhados, evitando vazar geometria/material da ponta nova.
      const descartar = (obj) => {
        (obj.children || []).forEach(descartar);
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      };
      descartar(child);
    }
    (this._trena3DLabelEls || []).forEach((el) => el.remove());
    this._trena3DLabelEls = [];
    // [16/09/2026 UTC] NOVO — 1 entrada por medida (id/objeto 3D/rótulo/
    // ponto médio), usada por `_trena3DAtualizarOclusao` (visibilidade
    // "só se estiver visível") e por `_trena3DPickAtRay`/
    // `_trena3DRemoverMedida` (excluir a medida clicando nela no 3D).
    this._trena3DEntries = [];
    const cfg = this._trena3DCfg();
    const corLinhaInt = this._trena3DHexToInt(cfg.corLinha, 0xffd166);
    // cm → raio em metros: espessura configurada é o DIÂMETRO do "tubo" (o
    // que a palavra "espessura de uma linha" normalmente quer dizer), então
    // raio = (cm/100)/2.
    const raioLinha = Math.max(0.001, (cfg.espessuraCm || 2) / 200);
    const medidas = this._map.medidas2d || [];
    // [18/09/2026 UTC] NOVO (RODADA 141) — modo "formas 2D": junta aqui os
    // pontos/cor de cada medida (linha PRINCIPAL só — escopo reduzido
    // conscientemente, ver comentário grande na subseção "Aparência da
    // medida" em mapconfig.js) pro overlay 2D desenhar a cada quadro em vez
    // de construir geometria 3D — ver `_trena3DDesenhar2DOverlay` mais
    // abaixo, chamado no loop principal (`_loop`), perto de
    // `this._engine.render(renderCam)`.
    const modo2D = cfg.modoRenderizacao === '2d';
    this._trena3D2DMedidas = modo2D ? [] : null;
    medidas.forEach((m) => {
      const p1 = new THREE.Vector3(m.x1, m.z1 || 0, m.y1);
      const p2 = new THREE.Vector3(m.x2, m.z2 || 0, m.y2);
      if (modo2D) {
        this._trena3D2DMedidas.push({ p1, p2 });
        // Nada de geometria 3D pra esta medida no modo 2D — pula direto pra
        // próxima (as subseções "Linha da âncora"/"Guias"/"Ponto médio" etc.
        // abaixo, todas em 3D, também ficam de fora do modo 2D nesta
        // primeira versão).
        return;
      }
      const subgrupo = new THREE.Group();
      // `userData.medidaId` em TODA malha desta medida (subgrupo + cada
      // filho) — pedido verbatim: "deve ser possível excluir a medida pelo
      // 3D mesmo" — ver `_trena3DPickAtRay` (raycast direto contra
      // `this._trena3DGroup`, sobe até achar este id no `userData`).
      subgrupo.userData.medidaId = m.id;
      const dirLinha = new THREE.Vector3().subVectors(p2, p1);
      if (dirLinha.length() > 1e-5) {
        const dirNorm = dirLinha.clone().normalize();
        // [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "se a medida
        // termina na ponta mais próxima da esfera, no centro da esfera ou
        // na ponta mais afastada da esfera (a medida acaba passando por
        // dentro da esfera)." Só se aplica com `cfg.ponta === 'esfera'` —
        // desloca os pontos usados pra desenhar a LINHA (não a esfera em
        // si, que continua centrada exatamente em `p1`/`p2` de sempre) pra
        // encolher ('proxima', linha para antes de tocar a esfera) ou
        // esticar ('distante', linha atravessa a esfera inteira) o
        // cilindro da linha. 'centro' (padrão) não desloca nada — mesmo
        // comportamento de sempre (linha vai exatamente de p1 a p2).
        let fatP1 = p1, fatP2 = p2;
        if (cfg.ponta === 'esfera' && (cfg.esferaTerminoLinha === 'proxima' || cfg.esferaTerminoLinha === 'distante')) {
          // [RODADA 135] MUDANÇA -- `esferaTamanho` agora é o raio
          // absoluto em metros (não mais multiplicador de `raioLinha`).
          const raioEsfera = Utils.clamp(Number(cfg.esferaTamanho) || 0.02, 0.01, 1);
          const sinal = cfg.esferaTerminoLinha === 'proxima' ? 1 : -1;
          fatP1 = p1.clone().add(dirNorm.clone().multiplyScalar(sinal * raioEsfera));
          fatP2 = p2.clone().add(dirNorm.clone().multiplyScalar(-sinal * raioEsfera));
        }
        // [18/09/2026 UTC] MUDANÇA (RODADA 142) — pedido verbatim: "só se
        // estiver visível" hoje esconde a medida INTEIRA quando só uma PARTE
        // dela está tapada (ex: reta vertical atravessando um piso elevado —
        // a parte de cima, visível, sumia junto com a de baixo, tapada).
        // Corrigido dividindo a linha em `TRENA3D_OCLUSAO_N_SEGMENTOS`
        // sub-cilindros (em vez de 1 só) — cada um vira sua própria malha,
        // testada e escondida/mostrada INDIVIDUALMENTE por
        // `_trena3DAtualizarOclusao` (ver lá, usa o PONTO MÉDIO de cada
        // sub-segmento em vez de só o ponto médio da medida inteira).
        // `segMeshes` guarda {mesh, mid} de cada pedaço pra essa função
        // achar sem precisar percorrer `subgrupo.children` (que tem outras
        // malhas junto, guias/esfera/etc.). Número de amostras é um meio-
        // termo deliberado entre granularidade e custo (1 raycast por
        // sub-segmento por medida por quadro) — não precisa ser
        // configurável, só razoável (bom senso de performance pedido).
        const segMeshes = [];
        const nSeg = this._TRENA3D_OCLUSAO_N_SEGMENTOS || (this._TRENA3D_OCLUSAO_N_SEGMENTOS = 8);
        for (let i = 0; i < nSeg; i++) {
          const ta = i / nSeg, tb = (i + 1) / nSeg;
          const a = fatP1.clone().lerp(fatP2, ta);
          const b = fatP1.clone().lerp(fatP2, tb);
          const seg = this._trena3DBuildFatLine(a, b, corLinhaInt, raioLinha);
          if (seg) {
            seg.userData.medidaId = m.id;
            subgrupo.add(seg);
            segMeshes.push({ mesh: seg, mid: a.clone().lerp(b, 0.5) });
          }
        }
        const ponta1 = this._trena3DBuildEndpoint(cfg.ponta, p1, dirNorm, dirNorm.clone().negate(), corLinhaInt, raioLinha, cfg);
        const ponta2 = this._trena3DBuildEndpoint(cfg.ponta, p2, dirNorm, dirNorm, corLinhaInt, raioLinha, cfg);
        // [17/09/2026 UTC] NOVO (RODADA 114) — `_trena3DBuildEndpoint` agora
        // pode devolver `null` (opção "Sem pontas") — guarda antes de usar.
        if (ponta1) { ponta1.userData.medidaId = m.id; subgrupo.add(ponta1); }
        if (ponta2) { ponta2.userData.medidaId = m.id; subgrupo.add(ponta2); }
        // [RODADA 142] guarda as referências pra `_trena3DAtualizarOclusao`
        // testar/mostrar cada pedaço (linha+pontas) individualmente — ver
        // uso de `entriesExtra` logo abaixo, no `push` de `_trena3DEntries`.
        var trena3DSegMeshes = segMeshes, trena3DPonta1 = ponta1, trena3DPonta2 = ponta2;
      }
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ter uma subseção para
      // definir se ficam impressas após a medida ser finalizada (por padrão,
      // desativada). E uma subopção se desenha do chão até os pontos da
      // medida ou se as duas vão ser infinitas." Linhas tracejadas laranja,
      // do chão (y=0) até CADA ponto da medida (`p1`/`p2`) — se um ponto foi
      // fixado "no ar" via âncora, seu X/Z já É o X/Z da própria âncora,
      // então essa linha reproduz exatamente a "linha da âncora" daquele
      // ponto, agora persistida junto com a medida já finalizada.
      if (cfg.mostrarLinhasAncoraFinalizada) {
        const linhaInfinitaFinal = cfg.linhasAncoraFinalizadaModo === 'infinita';
        [p1, p2].forEach((pt) => {
          if (Math.abs(pt.y) <= 0.01) return; // ponto já no chão — linha seria só um pontinho
          const baseF = new THREE.Vector3(pt.x, 0, pt.z);
          const topoF = new THREE.Vector3(pt.x, linhaInfinitaFinal ? this._trena3DAlturaLinhaAncoraSemTeto() : pt.y, pt.z);
          // [17/09/2026 UTC] MUDANÇA (RODADA 114) — cor + espessura/estilo/
          // dash agora configuráveis (`cfg.linhaAncoraCorInt`/
          // `cfg.linhaAncoraEstiloLinha`), em vez do laranja/tracejado FIXO
          // de sempre — padrão preserva a aparência exata de antes.
          const linhaF = this._trena3DBuildLinhaEstilizadaUmaVez(baseF, topoF, cfg.linhaAncoraCorInt, cfg.linhaAncoraEstiloLinha);
          if (linhaF) { linhaF.renderOrder = 999; linhaF.userData.medidaId = m.id; subgrupo.add(linhaF); }
          // [RODADA 132] NOVO — pedido verbatim: a opção "Mostrar caixa de
          // texto com a medida" (subseção "Linhas verticais ancoradas") deve
          // "habilitar aparecer a medida do chão até o ponto de extremidade
          // da medida feita [...] para as duas linhas âncora" — texto "⬍ Xm"
          // (mesmo formato/estilo das versões ao vivo) para CADA uma das 2
          // linhas âncora de uma medida já finalizada, gated por
          // `cfg.linhaAncoraLabelVisivel` (mesmo campo que já controla as
          // versões ao vivo — ver '_trena3DUpdatePreview'). Recriado do zero
          // a cada rebuild, igual aos rótulos de 'guiaChaoFin'/'guiaGradeFin'
          // já existentes logo abaixo/acima.
          if (cfg.linhaAncoraLabelVisivel) {
            const meioF = this._trena3DDeslocarPontoY(new THREE.Vector3(pt.x, pt.y * 0.5, pt.z), cfg.linhaAncoraLabelDeslocVerticalM);
            const labelF = document.createElement('div');
            labelF.className = 'v3d-trena3d-label v3d-trena3d-label--preview';
            Object.assign(labelF.style, {
              position: 'fixed', left: '0', top: '0', transform: 'translate(-50%,-50%)',
              background: 'rgba(20,22,28,0.7)', color: '#ff9f4d', font: '600 12px/1.2 system-ui, sans-serif',
              padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '5',
              border: '1px dashed #ff9f4d',
            });
            labelF.textContent = `⬍ ${pt.y.toFixed(2)}m`;
            labelF.dataset.mx = String(meioF.x); labelF.dataset.my = String(meioF.y); labelF.dataset.mz = String(meioF.z);
            document.body.appendChild(labelF);
            this._trena3DLabelEls.push(labelF);
          }
        });
      }
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Em '📏 Trena 3D — Guia de
      // grade do mundo', coloque como outra opção para aparecer após
      // finalizar a medida. Isto acabará afetando a todas as medidas no
      // mapa." Generaliza `_trena3DAtualizarGuiaGrade` (que só roda pro
      // ponto mirado AO VIVO) pra cada um dos 2 pontos desta medida JÁ
      // finalizada — MESMA conta de eixo/modo (`cfg.guiaGradeModoMedida`),
      // mas persistida como parte do `subgrupo` (descartada/recriada junto
      // com ele a cada rebuild, ao contrário da versão ao vivo que vive em
      // `_trena3DPreviewGroup`) e com rótulos próprios empurrados pra
      // `this._trena3DLabelEls` (limpos automaticamente no próximo rebuild,
      // mesmo mecanismo dos rótulos de distância).
      // [16/09/2026 UTC] CORRIGIDO — pedido verbatim: "as linhas guia devem
      // ser rente a superfície em que foi usada para fazer a ancoragem/
      // medida (não 'no ar' como está atualmente)." A grade do "ladrilho do
      // mundo" só existe mesmo na altura y=0 — desenhar a guia na altura Y
      // do PRÓPRIO PONTO (que pode estar "no ar", elevado por uma âncora)
      // não correspondia a nenhuma grade real àquela altura, ficando
      // visualmente flutuando sem referência. Corrigido: as guias agora
      // sempre nascem/terminam em Y=0 (rente ao chão, onde a grade do mundo
      // de verdade vive), usando só a projeção X/Z do ponto — a MESMA X/Z
      // da superfície onde a ancoragem/medida foi feita (a âncora só desloca
      // a ALTURA do ponto, X/Z ficam travados na superfície original desde
      // `_trena3DClosestPointOnVerticalLine`).
      if (cfg.guiaGradeFinalizada) {
        // [16/09/2026 UTC] CORRIGIDO — pedido verbatim: "Deve ser possível
        // definir a cor das linhas guia. Atualmente elas são desenhadas com
        // verde. E na preview está como azul. Deve ser azul para ambos,
        // como padrão." Era um verde FIXO (`0xb7ff5e`) — agora lê
        // `cfg.guiaGradeCorLinha`/`cfg.guiaGradeCorTexto` (mesmos campos da
        // versão AO VIVO em `_trena3DAtualizarGuiaGrade`, ver `_trena3DCfg`).
        const corGradeFin = this._trena3DHexToInt(cfg.guiaGradeCorLinha, 0x5ec8ff);
        const corGradeFinTextoCss = cfg.guiaGradeCorTexto || '#5ec8ff';
        [p1, p2].forEach((pt) => {
          const modoMedida = cfg.guiaGradeModoMedida;
          const gradeX = modoMedida === 'maisPerto' ? Math.round(pt.x) : Math.floor(pt.x);
          const gradeZ = modoMedida === 'maisPerto' ? Math.round(pt.z) : Math.floor(pt.z);
          const distX = Math.abs(pt.x - gradeX);
          const distZ = Math.abs(pt.z - gradeZ);
          const criarGuia = (pA, pB, texto) => {
            // [17/09/2026 UTC] MUDANÇA (RODADA 114) — espessura/estilo/dash
            // agora configuráveis (ver `cfg.guiaGradeEstiloLinha`), em vez
            // do raio sólido fixo (`0.008`) de sempre.
            const meshG = this._trena3DBuildLinhaEstilizadaUmaVez(pA, pB, corGradeFin, cfg.guiaGradeEstiloLinha);
            if (meshG) { meshG.renderOrder = 997; meshG.userData.medidaId = m.id; subgrupo.add(meshG); }
            const meioGReal = pA.clone().add(pB).multiplyScalar(0.5);
            // [17/09/2026 UTC] NOVO (RODADA 119) — deslocamento vertical
            // (`cfg.guiaGradeLabelDeslocVerticalM`) + a linha vertical de
            // apoio opcional (`cfg.guiaGradeLabelLinhaVertical`), ligando o
            // ponto médio de verdade (`meioGReal`) ao ponto onde o texto
            // efetivamente fica (`meioG`).
            // [17/09/2026 UTC] AJUSTADO (RODADA 125) — "Em cima e no meio"
            // ('sobreLinhaMeio'): sem deslocamento vertical, ponto real.
            const deslocVerticalGEfetivo = cfg.guiaGradeLabelEstilo === 'sobreLinhaMeio' ? 0 : cfg.guiaGradeLabelDeslocVerticalM;
            const linhaApoioG = this._trena3DConstruirLinhaVerticalDoLabelFinalizada(meioGReal, deslocVerticalGEfetivo, corGradeFin, cfg);
            if (linhaApoioG) { linhaApoioG.userData.medidaId = m.id; subgrupo.add(linhaApoioG); }
            const meioG = this._trena3DDeslocarPontoY(meioGReal, deslocVerticalGEfetivo);
            const labelG = document.createElement('div');
            labelG.className = 'v3d-trena3d-label v3d-trena3d-label--grade';
            Object.assign(labelG.style, {
              position: 'fixed', left: '0', top: '0', transform: 'translate(-50%,-50%)',
              background: 'rgba(20,22,28,0.7)', color: corGradeFinTextoCss, font: '600 11px/1.2 system-ui, sans-serif',
              padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '5',
              border: `1px dashed ${corGradeFinTextoCss}`,
            });
            labelG.textContent = texto;
            // [17/09/2026 UTC] NOVO (RODADA 127) — ver comentário grande junto
            // de 'label.dataset.tipoLabel' (rótulo da medida principal), mesmo
            // conceito pra 'cfg.guiaGradeLabelVisivel'.
            labelG.dataset.tipoLabel = 'guiaGrade';
            labelG.dataset.mx = String(meioG.x); labelG.dataset.my = String(meioG.y); labelG.dataset.mz = String(meioG.z);
            document.body.appendChild(labelG);
            this._trena3DLabelEls.push(labelG);
          };
          if (distX > 0.005) criarGuia(new THREE.Vector3(pt.x, 0, pt.z), new THREE.Vector3(gradeX, 0, pt.z), `↔ ${distX.toFixed(2)}m`);
          if (distZ > 0.005) criarGuia(new THREE.Vector3(pt.x, 0, pt.z), new THREE.Vector3(pt.x, 0, gradeZ), `↕ ${distZ.toFixed(2)}m`);
        });
      }
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve haver outra opção:
      // 'Mostrar guia depois que a medida foi finalizada'. Esta opção afeta
      // todas as guias, pois todas elas (que já estão finalizadas) encaixam-
      // se nesse critério." Generaliza a "Guia rente ao chão" (que antes só
      // existia AO VIVO, entre o 1º ponto e a mira atual, ver
      // '_trena3DUpdatePreview'/'_trena3DGuiaChaoLine') pra cada medida JÁ
      // finalizada — mesma conta (projeção no plano do chão y=0 dos 2
      // pontos da medida) e mesmas cores configuráveis
      // ('cfg.guiaChaoCorLinha'/'cfg.guiaChaoCorTexto'), persistida como
      // parte do 'subgrupo' (descartada/recriada junto com ele a cada
      // rebuild) — mesmo padrão do bloco 'guiaGradeFinalizada' logo acima.
      if (cfg.guiaChaoFinalizada) {
        // [RODADA 131] MUDANÇA — Y comum às 2 pontas conforme `cfg.guiaChaoModo`
        // (ver '_trena3DGuiaChaoAlturaY'), em vez de sempre y=0 (chão).
        const yChaoFin = this._trena3DGuiaChaoAlturaY(cfg, p1.y, p2.y);
        const p1ChaoFin = new THREE.Vector3(p1.x, yChaoFin, p1.z);
        const p2ChaoFin = new THREE.Vector3(p2.x, yChaoFin, p2.z);
        const distChaoFin = p1ChaoFin.distanceTo(p2ChaoFin);
        if (distChaoFin > 0.005) {
          const corChaoFinInt = this._trena3DHexToInt(cfg.guiaChaoCorLinha, 0x7dff6e);
          // [17/09/2026 UTC] MUDANÇA (RODADA 114) — espessura/estilo/dash
          // configuráveis (`cfg.guiaChaoEstiloLinha`), em vez do raio sólido
          // fixo (`0.006`) de sempre; e pontas (simplificadas,
          // `cfg.guiaChaoPonta`) nas 2 extremidades, quando escolhidas.
          const meshChaoFin = this._trena3DBuildLinhaEstilizadaUmaVez(p1ChaoFin, p2ChaoFin, corChaoFinInt, cfg.guiaChaoEstiloLinha);
          if (meshChaoFin) { meshChaoFin.renderOrder = 996; meshChaoFin.userData.medidaId = m.id; subgrupo.add(meshChaoFin); }
          if (cfg.guiaChaoPonta && cfg.guiaChaoPonta !== 'nenhuma') {
            const raioPontaChaoFin = Math.max(0.0008, (Number(cfg.guiaChaoEstiloLinha?.espessuraCm) || 1.2) / 200);
            const dirChaoFin = new THREE.Vector3().subVectors(p2ChaoFin, p1ChaoFin);
            if (dirChaoFin.length() > 1e-5) {
              const dirChaoFinNorm = dirChaoFin.clone().normalize();
              const pontaChaoFin1 = this._trena3DBuildEndpoint(cfg.guiaChaoPonta, p1ChaoFin, dirChaoFinNorm, dirChaoFinNorm.clone().negate(), corChaoFinInt, raioPontaChaoFin, cfg);
              const pontaChaoFin2 = this._trena3DBuildEndpoint(cfg.guiaChaoPonta, p2ChaoFin, dirChaoFinNorm, dirChaoFinNorm, corChaoFinInt, raioPontaChaoFin, cfg);
              if (pontaChaoFin1) { pontaChaoFin1.userData.medidaId = m.id; subgrupo.add(pontaChaoFin1); }
              if (pontaChaoFin2) { pontaChaoFin2.userData.medidaId = m.id; subgrupo.add(pontaChaoFin2); }
            }
          }
          // [17/09/2026 UTC] NOVO (RODADA 119) — deslocamento vertical
          // (`cfg.guiaChaoLabelDeslocVerticalM`) do texto ao longo da linha
          // perpendicular ao chão que passa pelo ponto médio desta guia.
          // [17/09/2026 UTC] AJUSTADO (RODADA 125) — "Em cima e no meio"
          // ('sobreLinhaMeio'): usa o ponto médio REAL, sem nenhum
          // deslocamento vertical (mesmo padrão de 'trena3DLabelEstilo').
          const meioChaoRealFin = p1ChaoFin.clone().add(p2ChaoFin).multiplyScalar(0.5);
          const meioChaoFin = cfg.guiaChaoLabelEstilo === 'sobreLinhaMeio'
            ? meioChaoRealFin
            : this._trena3DDeslocarPontoY(meioChaoRealFin, cfg.guiaChaoLabelDeslocVerticalM);
          const labelChaoFin = document.createElement('div');
          labelChaoFin.className = 'v3d-trena3d-label v3d-trena3d-label--guia-chao';
          Object.assign(labelChaoFin.style, {
            position: 'fixed', left: '0', top: '0', transform: 'translate(-50%,-50%)',
            background: 'rgba(20,22,28,0.7)', color: cfg.guiaChaoCorTexto || '#d9ff8a', font: '600 12px/1.2 system-ui, sans-serif',
            padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '5',
            border: `1px dashed ${cfg.guiaChaoCorTexto || '#d9ff8a'}`,
          });
          labelChaoFin.textContent = `⬌ ${distChaoFin.toFixed(2)}m`;
          // [17/09/2026 UTC] NOVO (RODADA 127) — ver comentário grande junto
          // de 'label.dataset.tipoLabel' (rótulo da medida principal, acima)
          // — mesmo conceito, pra 'cfg.guiaChaoLabelVisivel'.
          labelChaoFin.dataset.tipoLabel = 'guiaChao';
          labelChaoFin.dataset.mx = String(meioChaoFin.x); labelChaoFin.dataset.my = String(meioChaoFin.y); labelChaoFin.dataset.mz = String(meioChaoFin.z);
          document.body.appendChild(labelChaoFin);
          this._trena3DLabelEls.push(labelChaoFin);
        }
      }
      // [17/09/2026 UTC] NOVO (RODADA 120) — pedido verbatim: "Faça o ponto
      // que fica bem na metade do comprimento de cada medida aparecer uma
      // esfera vermelha." Esfera fixa (sem configuração), sempre no ponto
      // médio REAL da linha (p1↔p2, sem nenhum deslocamento vertical de
      // rótulo aplicado — distinto do `meio` calculado logo abaixo, usado
      // só pra posicionar o texto/label).
      // [17/09/2026 UTC] AJUSTADO (RODADA 125) — pedido verbatim: "deve ter
      // uma opção para imprimir a esfera vermelha, mas com o nome de
      // 'mostrar ponto médio da medida'. deve dar para escolher a cor da
      // esfera." Todo o bloco (esfera + rótulo de debug de coordenadas)
      // agora só roda se `cfg.mostrarPontoMedio` estiver ligado (padrão
      // ligado, preserva o comportamento de sempre) — cor lida de
      // `cfg.corPontoMedio` em vez do `0xff2d2d` fixo.
      if (cfg.mostrarPontoMedio) {
        const meioEsferaFin = p1.clone().add(p2).multiplyScalar(0.5);
        const geoMeioFin = new THREE.SphereGeometry(Math.max(raioLinha * 1.4, 0.02), 10, 10);
        const matMeioFin = new THREE.MeshBasicMaterial({ color: this._trena3DHexToInt(cfg.corPontoMedio, 0xff2d2d), depthTest: false });
        const meshMeioFin = new THREE.Mesh(geoMeioFin, matMeioFin);
        meshMeioFin.position.copy(meioEsferaFin);
        meshMeioFin.renderOrder = 999;
        meshMeioFin.userData.medidaId = m.id;
        subgrupo.add(meshMeioFin);
        // [17/09/2026 UTC] NOVO (RODADA 123) — DEBUG TEMPORÁRIO, pedido
        // verbatim do usuário pra investigar a divergência visual relatada
        // entre a caixa de texto e a esfera vermelha: "imprima junto com o
        // texto (para teste) as coordenadas x e y do canvas. Na esfera
        // vermelha, ao lado dela, imprima as coordenadas x e y da tela
        // também." Rótulo pequeno, ancorado no MESMO ponto 3D da esfera
        // (`meioEsferaFin`), deslocado 8px pra direita (`translate(8px,
        // -50%)`, não centralizado como os outros — de propósito, pra não
        // tampar a esfera) — preenchido com as coordenadas de tela
        // calculadas em `_trena3DUpdateLabels` (mesmo texto "x,y" também
        // adicionado à caixa de texto principal da medida, via
        // `dataset.baseTexto`, logo abaixo). REMOVER depois de confirmado
        // se a posição calculada bate ou não com a da esfera.
        const debugEsferaLabel = document.createElement('div');
        debugEsferaLabel.className = 'v3d-trena3d-label v3d-trena3d-label--debug';
        Object.assign(debugEsferaLabel.style, {
          position: 'fixed', left: '0', top: '0', transform: 'translate(8px, -50%)',
          background: 'rgba(255,45,45,0.9)', color: '#fff', font: '700 10px/1.2 monospace',
          padding: '1px 4px', borderRadius: '3px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '6',
        });
        debugEsferaLabel.dataset.mx = String(meioEsferaFin.x);
        debugEsferaLabel.dataset.my = String(meioEsferaFin.y);
        debugEsferaLabel.dataset.mz = String(meioEsferaFin.z);
        debugEsferaLabel.dataset.debugEsfera = '1';
        document.body.appendChild(debugEsferaLabel);
        this._trena3DLabelEls.push(debugEsferaLabel);
      }
      grupo.add(subgrupo);
      const meio = p1.clone().add(p2).multiplyScalar(0.5);
      const label = document.createElement('div');
      label.className = 'v3d-trena3d-label';
      // [16/09/2026 UTC] Estilo inline de propósito (em vez de css/style.css)
      // — mesmo espírito de outros overlays HUD pontuais deste arquivo (ver
      // `_addHistoricoDestaque`/HUD de FPS): evita mexer numa folha de
      // estilo global só por causa de um rótulo pequeno e autocontido.
      // `position:fixed` (não `absolute`) DE PROPÓSITO: `_trena3DUpdateLabels`
      // calcula a posição a partir de `canvas.getBoundingClientRect()`
      // (coordenadas relativas à JANELA) — `fixed` é o único jeito de usar
      // essas coordenadas direto, sem depender de qual ancestral posicionado
      // o `<div>` acabar tendo (evita todo bug de "rótulo deslocado" por
      // causa de algum container intermediário com `position:relative`).
      // [16/09/2026 UTC] CORRIGIDO — pedido verbatim, com a imagem de
      // referência "texto no meio da medida.png": "a opção 'Em cima da
      // linha e no meio' deve ficar como a imagem [...] o texto da medida
      // como deve ficar ('em cima do traço' e centralizado)." CAUSA: o
      // `transform` era `translate(-50%,-50%)` pros 2 estilos de rótulo —
      // o rótulo ficava CENTRALIZADO em cima do próprio traço (metade da
      // caixa de texto cobrindo a linha), não ACIMA dele como na imagem.
      // CORRIGIDO (na época): só pro estilo 'sobreLinhaMeio', o `transform`
      // subia a caixa inteira pra cima do ponto de ancoragem
      // (`translate(-50%, calc(-100% - 6px))`).
      // [17/09/2026 UTC] REVERTIDO (RODADA 122) — pedido verbatim: "a caixa
      // de texto deve ficar como se estivesse dentro da esfera vermelha na
      // projeção da tela" (a referência de ancoragem usada, em ambos os
      // estilos, é o CENTRO da caixa de texto — `left`/`top` recebem a
      // projeção em tela do ponto 3D em `dataset.mx/my/mz` — ver
      // `_trena3DUpdateLabels` — e o `transform` decide qual parte da caixa
      // fica exatamente nesse ponto). Com a esfera vermelha (RODADA 120)
      // agora desenhada exatamente nesse mesmo ponto médio 3D (RODADA 121,
      // item 3), "subir" a caixa deixava-a flutuando ACIMA da esfera, não
      // dentro dela — voltado a `translate(-50%,-50%)` (mesmo dos 2
      // estilos) pra centralizar a caixa exatamente sobre a esfera, como
      // pedido. Único efeito colateral aceito (o motivo original desta
      // mudança, RODADA 93): a caixa volta a cobrir uma pequena parte da
      // própria linha/esfera no ponto médio — inevitável se a caixa deve
      // ficar centralizada exatamente ali.
      const modoSobreLinhaMeio = cfg.labelEstilo === 'sobreLinhaMeio';
      Object.assign(label.style, {
        position: 'fixed', left: '0', top: '0',
        transform: 'translate(-50%,-50%)',
        background: 'rgba(20,22,28,0.85)', color: cfg.corLinha || '#ffd166', font: '600 12px/1.2 system-ui, sans-serif',
        padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '5',
      });
      const dist = p1.distanceTo(p2);
      label.textContent = `📏 ${dist.toFixed(2)}m`;
      // [17/09/2026 UTC] NOVO (RODADA 123) — DEBUG TEMPORÁRIO (ver
      // comentário grande no bloco da esfera vermelha, acima) — guarda o
      // texto "de verdade" (sem as coordenadas) pra `_trena3DUpdateLabels`
      // poder reconstruir `textContent` a cada quadro (base + coordenadas
      // calculadas naquele quadro) sem perder o texto original.
      label.dataset.baseTexto = label.textContent;
      // [17/09/2026 UTC] NOVO (RODADA 127) — marca o tipo do rótulo pra
      // `_trena3DUpdateLabels` poder escondê-lo quando a respectiva opção
      // "Mostrar caixa de texto" estiver desligada (ver `cfg.labelVisivel`).
      label.dataset.tipoLabel = 'medida';
      // [16/09/2026 UTC] REESTRUTURADO — "Aparência da medida" agora tem 2
      // valores: 'sobreLinha' (padrão, rotulado "Flutuante" na UI — projeta
      // o meio 3D exato `meio`, sem deslocamento nenhum) e 'sobreLinhaMeio'
      // (NOVO, rotulado "Em cima da linha e no meio" — centraliza o rótulo
      // na MÉDIA DOS 2 EXTREMOS JÁ PROJETADOS NA TELA, não na projeção do
      // meio em 3D — as duas contas diferem sob perspectiva). O antigo
      // valor 'flutuante' (deslocamento de +0,18m em Y antes de projetar)
      // foi REMOVIDO — não existe mais nenhum branch pra ele. Pra
      // 'sobreLinhaMeio', `_trena3DUpdateLabels` precisa dos 2 extremos em
      // 3D separadamente (não dá pra pré-calcular 1 único ponto aqui,
      // porque a média correta só existe DEPOIS de projetar cada extremo —
      // guardados em `dataset.p1x/p1y/p1z`/`dataset.p2x/p2y/p2z`, lidos lá).
      label.dataset.modoLabel = modoSobreLinhaMeio ? 'sobreLinhaMeio' : 'sobreLinha';
      // [17/09/2026 UTC] NOVO (RODADA 119) — deslocamento vertical (metros,
      // config `cfg.labelDeslocVerticalM`) aplicado a `meio` (estilo
      // "Flutuante"/'sobreLinha') e a `p1`/`p2` IGUALMENTE (estilo "Em cima
      // da linha e no meio"/'sobreLinhaMeio', que projeta os 2 extremos
      // separadamente e faz a média DEPOIS de projetar — deslocar os 2
      // extremos pelo mesmo tanto em Y antes de projetar desloca a média
      // resultante na mesma direção, sem precisar de um branch específico
      // pra este estilo). Padrão 0 = nenhuma mudança (`_trena3DDeslocarPontoY`
      // devolve o próprio ponto sem clonar quando `deslocM` é 0/falsy).
      const meioDesloc = this._trena3DDeslocarPontoY(meio, cfg.labelDeslocVerticalM);
      label.dataset.mx = String(meioDesloc.x); label.dataset.my = String(meioDesloc.y); label.dataset.mz = String(meioDesloc.z);
      // [17/09/2026 UTC] CORRIGIDO (RODADA 121) — pedido verbatim: "Exatamente
      // na coordenada 3D da esfera vermelha [...] é que deve ficar a caixa do
      // texto da medida (quando estiver marcada a opção 'Em cima da linha e
      // no meio')." Antes, este estilo projetava os 2 EXTREMOS da medida
      // separadamente (com o deslocamento vertical de rótulo aplicado a cada
      // um) e centralizava na MÉDIA já em tela — agora usa o MESMO ponto
      // médio real (`meio`, sem nenhum deslocamento) da esfera vermelha
      // recém-adicionada, projetado como um ponto único (`p1x`===`p2x` faz
      // `_trena3DUpdateLabels` calcular a "média" de 1 ponto com ele mesmo,
      // ou seja, o próprio ponto — reaproveita o branch existente sem
      // duplicar a lógica de projeção). Deliberadamente ignora
      // `cfg.labelDeslocVerticalM` neste estilo (o pedido é fixar exatamente
      // na esfera, que nunca se desloca) — o estilo "Flutuante" continua
      // respeitando o deslocamento normalmente (`meioDesloc`, acima).
      if (modoSobreLinhaMeio) {
        label.dataset.p1x = String(meio.x); label.dataset.p1y = String(meio.y); label.dataset.p1z = String(meio.z);
        label.dataset.p2x = String(meio.x); label.dataset.p2y = String(meio.y); label.dataset.p2z = String(meio.z);
      }
      document.body.appendChild(label);
      this._trena3DLabelEls.push(label);
      // [RODADA 142] `segMeshes`/`p1`/`p2`/`ponta1`/`ponta2` — usados por
      // `_trena3DAtualizarOclusao` pra testar/alternar visibilidade POR
      // PEDAÇO (em vez da medida inteira de uma vez, ver comentário grande
      // lá). Podem vir `undefined` (medida degenerada, `dirLinha` ~0) — a
      // função de oclusão já trata isso com fallback pro `midpoint`.
      this._trena3DEntries.push({
        id: m.id, obj3d: subgrupo, labelEl: label, midpoint: meio,
        p1, p2, segMeshes: trena3DSegMeshes, ponta1: trena3DPonta1, ponta2: trena3DPonta2,
      });
    });
  }

  /** [16/09/2026 UTC] NOVO — pedido verbatim: "definir [...] se fica
   *  aparecendo como já é atualmente (sempre imprimindo [...]) [...] ou
   *  imprimir se estiver visível [...] Por exemplo, se tiver objetos 'na
   *  frente' [...] então, a medida não aparece." Chamado todo quadro (ver
   *  `_loop`, junto de `_trena3DUpdateLabels`) — esconde a malha 3D (linha
   *  +pontas) e marca o rótulo correspondente como oculto (`dataset.oculto`,
   *  lido por `_trena3DUpdateLabels` pra não desenhá-lo) sempre que
   *  `Engine3D.isSegmentOccluded` (câmera → ponto médio da medida) achar
   *  algo real bloqueando no meio do caminho. Com "Sempre aparecer"
   *  configurado, garante que tudo fica visível (útil se o usuário troca a
   *  opção enquanto algo já estava escondido). */
  /** [18/09/2026 UTC] MUDANÇA (RODADA 142) — pedido verbatim: uma medida
   *  vertical que atravessa um piso elevado (parte de baixo tapada, parte de
   *  cima visível) sumia INTEIRA — porque só havia 1 raycast (câmera → ponto
   *  médio da medida INTEIRA) decidindo visível/oculto pra tudo de uma vez.
   *  Corrigido junto com `_trena3DRebuildLines` (que agora divide a linha
   *  principal em `_TRENA3D_OCLUSAO_N_SEGMENTOS` sub-cilindros, ver
   *  `entry.segMeshes`): aqui, cada sub-segmento (e cada ponta, `ponta1`/
   *  `ponta2`) é testado e escondido/mostrado INDIVIDUALMENTE — só os
   *  pedaços realmente atrás de geometria somem, o resto continua visível.
   *  `obj3d` (o subgrupo inteiro) fica sempre `visible = true` agora — quem
   *  decide aparecer ou não são as malhas-filhas (segmento a segmento);
   *  as decorações que não são a linha/pontas principal (guias, linhas-
   *  âncora, esfera do ponto médio) ficam DE FORA deste teste granular
   *  (corte de escopo deliberado — o pedido era sobre "a medida" desaparecer
   *  inteira, essas decorações continuam seguindo suas próprias opções de
   *  visibilidade de sempre). O rótulo de texto (`labelEl.dataset.oculto`)
   *  só fica marcado oculto quando NENHUM pedaço (segmentos + pontas) está
   *  visível — com pelo menos 1 pedaço visível, o texto continua aparecendo
   *  (mostra a medida "existe", mesmo parcialmente tapada). Modo "formas 2D"
   *  (`_trena3DDesenhar2DOverlay`) NÃO tem essa granularidade nesta rodada —
   *  ver comentário lá (corte de escopo: arquitetura de overlay 2D desenha
   *  1 linha reta por medida a cada quadro via canvas 2D, sem sub-malhas
   *  3D pra testar oclusão pedaço a pedaço; manter o teste único por medida
   *  lá é aceitável, já documentado no pedido do usuário como não-bloqueante). */
  _trena3DAtualizarOclusao() {
    const entries = this._trena3DEntries;
    if (!entries || !entries.length || !this._engine) return;
    const cfg = this._trena3DCfg();
    const semTeste = cfg.visibilidade !== 'seVisivel' || typeof this._engine.isSegmentOccluded !== 'function';
    if (semTeste) {
      entries.forEach((e) => {
        e.obj3d.visible = true;
        if (e.segMeshes) e.segMeshes.forEach((s) => { s.mesh.visible = true; });
        if (e.ponta1) e.ponta1.visible = true;
        if (e.ponta2) e.ponta2.visible = true;
        if (e.labelEl) e.labelEl.dataset.oculto = '';
      });
      return;
    }
    const cam = this._camera;
    const origem = { x: cam.x, y: cam.y, z: cam.z };
    entries.forEach((e) => {
      e.obj3d.visible = true;
      let algumaParteVisivel = false;
      if (e.segMeshes && e.segMeshes.length) {
        e.segMeshes.forEach((s) => {
          const bloqueado = this._engine.isSegmentOccluded(origem, s.mid);
          s.mesh.visible = !bloqueado;
          if (!bloqueado) algumaParteVisivel = true;
        });
      } else {
        // Fallback (medida degenerada, sem `segMeshes` — `dirLinha` ~0):
        // mesmo teste único de sempre, pelo ponto médio.
        const bloqueado = this._engine.isSegmentOccluded(origem, { x: e.midpoint.x, y: e.midpoint.y, z: e.midpoint.z });
        algumaParteVisivel = !bloqueado;
      }
      if (e.ponta1) {
        const b1 = this._engine.isSegmentOccluded(origem, { x: e.p1.x, y: e.p1.y, z: e.p1.z });
        e.ponta1.visible = !b1;
        if (!b1) algumaParteVisivel = true;
      }
      if (e.ponta2) {
        const b2 = this._engine.isSegmentOccluded(origem, { x: e.p2.x, y: e.p2.y, z: e.p2.z });
        e.ponta2.visible = !b2;
        if (!b2) algumaParteVisivel = true;
      }
      if (e.labelEl) e.labelEl.dataset.oculto = algumaParteVisivel ? '' : '1';
    });
  }

  /** [16/09/2026 UTC] NOVO — pedido verbatim: "deixar de fazer o destaque
   *  feito pelo raycaster [...] enquanto está ativa a linha perpendicular
   *  [...] Por padrão ativa." Chamado todo quadro (`_loop`) — repassa pro
   *  motor (`Engine3D.setHoverHighlightSuppressed`) se o destaque de mira
   *  normal deve ficar desligado agora: só quando a ferramenta ativa é a
   *  Trena 3D E existe uma referência vertical em jogo (âncora já commitada
   *  OU Ctrl fisicamente segurado — mesmo par de condições de
   *  `_trena3DUpdatePreview`) E a opção correspondente está ligada. */
  _trena3DAtualizarDestaqueSuprimido() {
    if (!this._engine?.setHoverHighlightSuppressed) return;
    const cfg = this._trena3DCfg();
    // [16/09/2026 UTC] NOVO — mesma generalização de `_trena3DUpdatePreview`
    // pro modo "quatroCliques": sem âncora nenhuma ativa, o PRÓXIMO clique
    // sempre vai ancorar (então já conta como "referência vertical em
    // jogo" mesmo sem Ctrl nenhum envolvido); com âncora já commitada,
    // conta de qualquer jeito, como sempre.
    const modoQuatroCliques = cfg.modoAncora === 'quatroCliques';
    const ctrlFisicoSegurado = modoQuatroCliques ? !this._trena3DVerticalAnchor : !!(this._keys?.ControlLeft || this._keys?.ControlRight);
    const ancoraEmJogo = !!this._trena3DVerticalAnchor || ctrlFisicoSegurado;
    const suprimir = this._buildTool === 'trena3d' && ancoraEmJogo && cfg.suprimirDestaqueDuranteAncora;
    this._engine.setHoverHighlightSuppressed(suprimir);
  }

  /** [16/09/2026 UTC] NOVO — pedido verbatim: "deve ser possível excluir a
   *  medida pelo 3D mesmo." Raycast direto contra as malhas de
   *  `this._trena3DGroup` (a MESMA técnica de sempre, `THREE.Raycaster`,
   *  mas restrita a este grupo — DELIBERADAMENTE fora do sistema genérico
   *  de `pickables`/`hoverPick` do motor: registrar medidas lá exigiria uma
   *  caixa/OBB por segmento, que o motor não modela pra retas arbitrárias
   *  no espaço — mais simples e igualmente eficaz fazer um raycast dedicado
   *  aqui, já que o grupo tem poucas dezenas de medidas no pior caso).
   *  Sobe de filho em filho até achar `userData.medidaId` (a linha/pontas
   *  o carregam direto; o subgrupo TAMBÉM, por segurança). */
  _trena3DPickAtRay(ray) {
    const THREE = window.THREE;
    if (!THREE || !this._trena3DGroup || !this._trena3DGroup.children.length) return null;
    if (!this._trena3DRaycaster) this._trena3DRaycaster = new THREE.Raycaster();
    this._trena3DRaycaster.set(
      new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z),
      new THREE.Vector3(ray.dir.x, ray.dir.y, ray.dir.z).normalize(),
    );
    const hits = this._trena3DRaycaster.intersectObjects(this._trena3DGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.userData?.medidaId == null && o.parent) o = o.parent;
      if (o?.userData?.medidaId != null) return { medidaId: o.userData.medidaId, t: h.distance };
    }
    return null;
  }

  /** Remove 1 medida de `map.medidas2d` pelo id — chamado por
   *  `_removeWithTool`/`_openDeleteConfirmPopup` (fallback quando a mira
   *  não pegou nada mais específico, ver lá) quando `_trena3DPickAtRay`
   *  acha uma medida sob a mira. */
  _trena3DRemoverMedida(id) {
    if (!this._map?.medidas2d?.length) return false;
    const antes = this._map.medidas2d.length;
    this._map.medidas2d = this._map.medidas2d.filter((m) => m.id !== id);
    if (this._map.medidas2d.length === antes) return false;
    DB.saveMap(this._map);
    this._trena3DRebuildLines();
    this._toast('Medida removida 🗑️', { type: 'ok', duration: 1400 });
    return true;
  }

  /** Chamado a cada quadro renderizado (ver `_loop`, logo depois de
   *  `this._engine.render(renderCam)`) — reposiciona cada rótulo (o "texto
   *  da medida", um `<div>` HTML comum, sempre 2D/na tela de verdade) na
   *  projeção em tela do seu ponto médio 3D ("por ponto de referência",
   *  técnica de billboard/HUD ancorado — ver comentário grande no topo
   *  desta seção). Esconde o rótulo quando o ponto cai atrás da câmera
   *  (`w <= 0` depois de `project()`) ou fora da tela. */
  /** [16/09/2026 UTC] NOVO — pedido verbatim: "na mesma função que desenha a
   *  linha laranja tracejada perpendicular ao chão, desenhe também o texto
   *  da medida juntamente." Projeta e posiciona UM rótulo (`<div>` de
   *  texto) na hora, sem esperar `_trena3DUpdateLabels` (chamada depois,
   *  numa passada separada) — usado pelas 2 linhas laranjas tracejadas
   *  perpendiculares ao chão desta função (`_trena3DP1HeightLine`/
   *  `_trena3DLiveHeightLine`), logo depois de cada uma ser desenhada,
   *  eliminando de vez a classe de bug já vista aqui antes (Rodada 83): um
   *  rótulo cujo texto/posição são calculados numa função e só desenhados
   *  numa PASSADA SEPARADA, mais tarde, corre o risco de ficar 1 quadro
   *  "atrasado" em relação à própria linha — juntar os 2 no MESMO lugar
   *  evita esse risco de vez, não só corrige a ordem de chamada. MESMA
   *  conta de projeção mundo→tela de `_trena3DUpdateLabels` (só que
   *  aplicada imediatamente, a UM elemento por vez, em vez de numa lista). */
  /** [17/09/2026 UTC] NOVO (RODADA 119) — pedido verbatim: "considere...
   *  uma linha vertical, perpendicular ao chão, que passa por este ponto
   *  [o ponto médio 'mAB' da reta 3D] no mundo 3D, a caixa de texto da
   *  medida tem o seu centro [...] que se desloca nessa linha vertical
   *  [...] considera uma distância relativa em relação a 'mAB' [...] Sendo
   *  exatamente no ponto o 0, acima dele valores positivos e abaixo dele
   *  valores negativos." Soma `deslocM` (metros, config) ao eixo Y (o eixo
   *  "pra cima" deste motor, ver `_trena3DP1HeightLine`/`baseF`/`topoF` em
   *  outros pontos deste arquivo, sempre com Y crescendo do chão pro alto)
   *  de `ponto` — devolve um Vector3 NOVO (nunca muta `ponto`, que quase
   *  sempre é reaproveitado por quem chama pra outra coisa, ex. `p1`/`p2`
   *  de uma medida). `deslocM` 0/undefined devolve o PRÓPRIO `ponto`
   *  (sem clonar) — atalho barato pro caso (padrão) de ninguém ter mexido
   *  no novo controle. */
  _trena3DDeslocarPontoY(ponto, deslocM) {
    if (!deslocM) return ponto;
    const p = ponto.clone();
    p.y += deslocM;
    return p;
  }

  /** [RODADA 131] NOVO — pedido verbatim: a "Guia rente ao chão" na verdade
   *  é a distância entre as 2 linhas âncoras (uma por ponta da medida, cada
   *  uma indo do chão até a altura real daquele ponto) — esta função decide
   *  em que altura Y (comum às 2 pontas, já que a guia é sempre HORIZONTAL/
   *  paralela ao chão) essa guia fica, conforme `cfg.guiaChaoModo`:
   *  - 'renteChao' (padrão): Y=0 — comportamento de sempre.
   *  - 'proximaChao': Y = altura do extremo MAIS BAIXO da medida — a guia
   *    fica com uma extremidade em comum com a extremidade mais baixa dela.
   *  - 'afastadaChao': Y = altura do extremo MAIS ALTO da medida — mesma
   *    ideia, só que com a extremidade mais alta.
   *  - 'livre': Y = `cfg.guiaChaoAlturaLivreM` (0 = chão), valor arbitrário
   *    escolhido em "Configurações 3D" (ver comentário grande no HTML da
   *    subseção, mapconfig.js — o pedido de poder "deslocar esta medida em
   *    qualquer ponto das linhas âncoras" ao vivo no cenário 3D, por
   *    arraste do mouse, NÃO foi implementado nesta rodada — sem
   *    Playwright/device_bash disponível pra testar uma interação nova de
   *    arraste com segurança, o valor é definido por um campo numérico nas
   *    Configurações 3D em vez disso).
   *  `yA`/`yB` são as alturas REAIS dos 2 pontos da medida (em metros,
   *  relativas ao chão — mesma referência de `p1.y`/`p2.y`/`alvo.y`). */
  _trena3DGuiaChaoAlturaY(cfg, yA, yB) {
    const modo = cfg.guiaChaoModo || 'renteChao';
    if (modo === 'proximaChao') return Math.min(yA, yB);
    if (modo === 'afastadaChao') return Math.max(yA, yB);
    if (modo === 'livre') return Number(cfg.guiaChaoAlturaLivreM) || 0;
    return 0;
  }

  /** [17/09/2026 UTC] NOVO (RODADA 119) — pedido verbatim, só pra "Linhas
   *  guia da grade do mundo": "deve ter um enable de aparecer a linha
   *  vertical (perpendicular ao chão) que é usada para deslocar o texto.
   *  Para melhor identificar visualmente." Desenha (ou esconde) 1 linha
   *  fina entre `mAB` (o ponto médio de verdade da guia, sem deslocamento)
   *  e o ponto JÁ deslocado (`mAB` + `deslocM` em Y) onde o texto realmente
   *  fica ancorado — só aparece quando `cfg.guiaGradeLabelLinhaVertical`
   *  está ligado E `deslocM !== 0` (com deslocamento 0 os 2 pontos
   *  coincidem, não haveria segmento nenhum pra desenhar). Reaproveita
   *  `_trena3DAtualizarLinhaEstilizadaAoVivo` (mesmo cilindro fino sólido
   *  já usado pelas próprias guias) — `chave` deve ser única por instância
   *  (ao vivo eixo X, ao vivo eixo Z, ou 1 por [medida finalizada × ponto ×
   *  eixo], pra não colidirem entre si no cache de objetos 3D daquele
   *  helper). */
  _trena3DAtualizarLinhaVerticalDoLabel(chave, grupo, mAB, deslocM, corInt, cfg) {
    if (!cfg?.guiaGradeLabelLinhaVertical || !deslocM) {
      const obj = this[chave];
      if (obj) obj.visible = false;
      return;
    }
    const pDeslocado = this._trena3DDeslocarPontoY(mAB, deslocM);
    const obj = this._trena3DAtualizarLinhaEstilizadaAoVivo(chave, grupo, mAB, pDeslocado, corInt, { estiloLinha: 'pontilhada', espessuraCm: 0.6, dashCm: 4, gapCm: 4 });
    if (obj) obj.renderOrder = 996;
  }

  /** [17/09/2026 UTC] NOVO (RODADA 119) — mesma linha de apoio do helper
   *  acima (`_trena3DAtualizarLinhaVerticalDoLabel`), só que pra versão
   *  FINALIZADA (dentro de `_trena3DRebuildLines`, construída 1 vez por
   *  medida/rebuild e adicionada a `subgrupo`, igual às demais linhas
   *  finalizadas desta função) — devolve o objeto 3D (ou `null`) em vez de
   *  guardar num campo `this[chave]` (a versão ao vivo precisa reaproveitar
   *  o mesmo objeto entre quadros; a finalizada é descartada/recriada
   *  inteira a cada rebuild, então não precisa desse cache). */
  _trena3DConstruirLinhaVerticalDoLabelFinalizada(mAB, deslocM, corInt, cfg) {
    if (!cfg?.guiaGradeLabelLinhaVertical || !deslocM) return null;
    const pDeslocado = this._trena3DDeslocarPontoY(mAB, deslocM);
    return this._trena3DBuildLinhaEstilizadaUmaVez(mAB, pDeslocado, corInt, { estiloLinha: 'pontilhada', espessuraCm: 0.6, dashCm: 4, gapCm: 4 });
  }

  _trena3DProjetarLabelImediato(el, wx, wy, wz) {
    if (!el) return;
    const THREE = window.THREE;
    const camera = this._engine?.camera3;
    const canvas = this._container?.querySelector('#v3d-canvas');
    if (!THREE || !camera || !camera.isCamera || !canvas) { el.style.display = 'none'; return; }
    const rect = canvas.getBoundingClientRect();
    const pMundo = new THREE.Vector3(wx, wy, wz);
    // [16/09/2026 UTC] NOVO (RODADA 93) — mesmo guard-clause de
    // "atrás da câmera" aplicado em `_trena3DUpdateLabels` (ver comentário
    // grande lá pra explicação completa da causa raiz) — aplicado aqui
    // também, já que este é o outro ponto do código que faz a mesma conta
    // de projeção mundo→tela (usado pelas linhas laranjas tracejadas de
    // altura ao vivo/1º ponto), sujeito ao mesmo bug.
    const pCam = pMundo.clone().applyMatrix4(camera.matrixWorldInverse);
    if (pCam.z >= 0) { el.style.display = 'none'; return; }
    const v = pMundo.clone();
    v.project(camera);
    if (v.z > 1 || v.z < -1) { el.style.display = 'none'; return; }
    if (v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) { el.style.display = 'none'; return; }
    // [17/09/2026 UTC] CORRIGIDO (RODADA 124) — pedido verbatim, com print
    // comprovando: "Mesmo as coordenadas da tela estando iguais, a posição
    // da esfera e da caixa do texto estão diferentes." CAUSA RAIZ
    // ENCONTRADA: `sx`/`sy` eram calculados como FRAÇÃO de
    // `rect.width`/`rect.height` (0..rect.width, 0..rect.height) — ou seja,
    // relativos ao CANTO SUPERIOR ESQUERDO DO PRÓPRIO CANVAS — mas aplicados
    // direto em `style.left`/`style.top` de um elemento `position:fixed`,
    // que são relativos ao CANTO SUPERIOR ESQUERDO DA JANELA (viewport).
    // Sempre que o canvas não começa exatamente no (0,0) da janela
    // (`rect.left`/`rect.top` != 0 — por exemplo, com qualquer barra/UI
    // acima ou à esquerda do canvas do "Ver em 3D"), TODO rótulo ficava
    // deslocado por exatamente `rect.left`/`rect.top` em relação ao
    // conteúdo 3D de verdade (desenhado pelo WebGL dentro dos limites reais
    // do canvas) — inclusive a esfera vermelha (RODADA 120), que por ser
    // parte da cena 3D sempre apareceu na posição CERTA, só os rótulos HTML
    // é que ficavam errados. Nunca tinha sido percebido antes porque não
    // havia nenhuma referência visual tão precisa quanto a esfera pra
    // comparar. Corrigido somando `rect.left`/`rect.top` — mesmo ajuste
    // replicado em TODOS os outros pontos do código que fazem esta mesma
    // conta (`_trena3DProjetarLabelAoLadoDoPonto`/`_trena3DUpdateLabels`,
    // logo abaixo).
    const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
    el.style.display = '';
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
  }

  /** [17/09/2026 UTC] NOVO (RODADA 113) — parte do fix verbatim: "a caixa do
   *  texto nunca deve cobrir a extremidade da medida (a extremidade deve
   *  sempre ficar visível)." Ao contrário de `_trena3DProjetarLabelImediato`
   *  (projeta 1 ponto e centraliza o texto exatamente nele), esta função
   *  projeta DOIS pontos (`pontoTopo`, o de verdade sendo medido, e
   *  `pontoBase`, uma referência pra calcular uma DIREÇÃO) e desloca o
   *  texto por `deslocamentoPx` PIXELS DE TELA na direção de `pontoTopo`
   *  para `pontoBase` — nunca em metros no espaço do mundo, que
   *  encolheria/cresceria na tela dependendo do zoom/distância da câmera.
   *  Assim a separação visual entre o texto e `pontoTopo` (a extremidade
   *  real da medida) fica sempre a mesma, em qualquer zoom. */
  _trena3DProjetarLabelAoLadoDoPonto(el, pontoTopo, pontoBase, deslocamentoPx) {
    if (!el) return;
    const THREE = window.THREE;
    const camera = this._engine?.camera3;
    const canvas = this._container?.querySelector('#v3d-canvas');
    if (!THREE || !camera || !camera.isCamera || !canvas) { el.style.display = 'none'; return; }
    const rect = canvas.getBoundingClientRect();
    const projetar = (p) => {
      const pCam = p.clone().applyMatrix4(camera.matrixWorldInverse);
      if (pCam.z >= 0) return null; // atrás da câmera
      const v = p.clone();
      v.project(camera);
      if (v.z > 1 || v.z < -1) return null;
      // [17/09/2026 UTC] CORRIGIDO (RODADA 124) — mesmo bug/mesma correção
      // de `_trena3DProjetarLabelImediato` (ver comentário grande lá): soma
      // `rect.left`/`rect.top` (posição do canvas na JANELA), sem os quais
      // `style.left`/`top` (relativos à janela, `position:fixed`) ficavam
      // deslocados sempre que o canvas não começa em (0,0).
      return { x: (v.x * 0.5 + 0.5) * rect.width + rect.left, y: (-v.y * 0.5 + 0.5) * rect.height + rect.top };
    };
    const sTopo = projetar(pontoTopo);
    if (!sTopo) { el.style.display = 'none'; return; }
    const sBase = projetar(pontoBase);
    // Direção padrão (se `pontoBase` não puder ser projetado, ou os 2
    // pontos caírem no mesmo pixel de tela): pra baixo — mesmo sentido de
    // sempre (em direção ao chão), só que agora em pixels, não em metros.
    let dx = 0;
    let dy = 1;
    if (sBase) {
      const vx = sBase.x - sTopo.x;
      const vy = sBase.y - sTopo.y;
      const len = Math.hypot(vx, vy);
      if (len > 2) { dx = vx / len; dy = vy / len; }
    }
    el.style.display = '';
    el.style.left = `${sTopo.x + dx * deslocamentoPx}px`;
    el.style.top = `${sTopo.y + dy * deslocamentoPx}px`;
  }

  /** [18/09/2026 UTC] NOVO (RODADA 141) — pedido verbatim: modo "formas 2D"
   *  da Trena 3D (ver DEFAULTS/UI em mapconfig.js, subseção "📏 Trena 3D —
   *  Aparência da medida"). Cria (uma vez) um `<canvas>` 2D comum, sobreposto
   *  ao `#v3d-canvas` WebGL (mesmo `#v3d-camzoom-wrap`, que já é
   *  `position:absolute; inset:0`, ver `.v3d-fotocam-photo-canvas` — MESMO
   *  padrão de posicionamento já usado pelo overlay de foto da câmera),
   *  `pointer-events:none` (nunca intercepta clique/mira) e `z-index` só um
   *  pouco acima do canvas WebGL (a UI de verdade — HUD, botões, painéis —
   *  fica toda FORA de `#v3d-camzoom-wrap`, então nunca fica por baixo deste
   *  overlay). Retorna `null` sem criar nada se o modo 2D não estiver ativo
   *  E o canvas ainda não existir (não cria à toa em cenas que nunca usam
   *  este modo). */
  _trena3DEnsure2DOverlayCanvas(criar) {
    let cv = this._trena3D2DOverlayEl;
    if (cv && cv.isConnected) return cv;
    if (!criar) return null;
    const wrap = this._container?.querySelector('#v3d-camzoom-wrap');
    if (!wrap) return null;
    cv = document.createElement('canvas');
    cv.id = 'v3d-trena3d-2d-overlay';
    cv.style.position = 'absolute';
    cv.style.inset = '0';
    cv.style.pointerEvents = 'none';
    cv.style.zIndex = '5'; // acima do `#v3d-canvas` (z-index implícito 0), abaixo de qualquer painel/HUD de verdade
    wrap.appendChild(cv);
    this._trena3D2DOverlayEl = cv;
    return cv;
  }

  /** Desenha (ou limpa/esconde) o overlay 2D da Trena 3D — chamado todo
   *  quadro no `_loop`, logo depois de `this._engine.render(renderCam)`
   *  (mesmo ponto de `_trena3DUpdateLabels`, MESMA razão: precisa da câmera
   *  THREE de verdade — `camera.matrixWorldInverse`/`projectionMatrix` —
   *  já atualizada com a pose deste quadro). ESCOPO REDUZIDO
   *  CONSCIENTEMENTE (ver comentário grande em mapconfig.js/DEFAULTS): só a
   *  linha PRINCIPAL de cada medida é desenhada — sem pontas/esferas/
   *  setas/linhas de âncora/guias/ponto médio, todas exclusivas do modo 3D
   *  nesta 1ª versão. Objetivo explícito do usuário (evitar pesar o
   *  desempenho com milhares de medidas na tela): nenhuma geometria/mesh
   *  Three.js é criada por medida neste modo — só 2 `Vector3.project()` +
   *  um `stroke()` de canvas 2D por medida, por quadro, MUITO mais barato
   *  que cilindros 3D reais (sem triângulos, sem draw call de WebGL extra
   *  por medida). */
  _trena3DDesenhar2DOverlay(camera) {
    const cfg = this._trena3DCfg();
    const modo2D = cfg.modoRenderizacao === '2d';
    const medidas2D = this._trena3D2DMedidas;
    if (!modo2D || !medidas2D || !medidas2D.length || !camera || !camera.isCamera) {
      // Nada a desenhar neste quadro (modo 3D, ou modo 2D sem nenhuma
      // medida ainda) — esconde/limpa o overlay se ele já existe (evita
      // deixar uma linha "fantasma" de um quadro anterior na tela), mas
      // nunca CRIA o canvas à toa.
      const cvExistente = this._trena3DEnsure2DOverlayCanvas(false);
      if (cvExistente) { cvExistente.style.display = 'none'; }
      return;
    }
    const canvas3D = this._container?.querySelector('#v3d-canvas');
    if (!canvas3D) return;
    const cv = this._trena3DEnsure2DOverlayCanvas(true);
    if (!cv) return;
    cv.style.display = '';
    // Resolução do overlay = resolução CSS do canvas WebGL (não a resolução
    // interna dele, que pode estar limitada por `resolucao3D` — o overlay
    // 2D é leve o bastante pra sempre desenhar nítido, na resolução real de
    // tela, igual ao `#v3d-fotocam-photo-canvas`).
    const w = Math.max(1, Math.round(canvas3D.clientWidth || canvas3D.width || 1));
    const h = Math.max(1, Math.round(canvas3D.clientHeight || canvas3D.height || 1));
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = cfg.corLinha || '#ffd166';
    // Espessura configurada (cm) é um raio de CILINDRO 3D (ver
    // `_trena3DRebuildLines`) — não existe conversão exata pra px de tela
    // (depende da distância da câmera, perspectiva); aproximação simples e
    // previsível: espessura em cm × 1.5, com mínimo de 1.5px, só pra dar uma
    // noção visual proporcional à espessura configurada.
    ctx.lineWidth = Math.max(1.5, (cfg.espessuraCm || 2) * 1.5);
    ctx.lineCap = 'round';
    ctx.beginPath();
    medidas2D.forEach(({ p1, p2 }) => {
      // Mesmo guard "atrás da câmera" usado em `_trena3DProjetarLabelImediato`/
      // `_trena3DUpdateLabels` — sem ele, pontos atrás da câmera projetam
      // pra dentro da NDC (-1..1) de qualquer jeito (a matemática da
      // projeção perspectiva "dobra" pontos atrás pra frente), desenhando
      // uma linha fantasma errada na tela.
      // [18/09/2026 UTC] CORRIGIDO (RODADA 142) — bug relatado verbatim: "no
      // modo 2D, ao apontar a câmera do personagem um pouco pra baixo, uma
      // medida vertical que estava indo pra cima passa a aparecer invertida,
      // indo pra baixo." CAUSA RAIZ: antes, só pulava o segmento quando OS 2
      // pontos estavam atrás da câmera (`c1.z >= 0 && c2.z >= 0`) — com só 1
      // deles atrás (caso comum: olhar pra baixo faz o plano da câmera
      // cruzar uma medida vertical no meio), desenhava mesmo assim
      // ("aproximação sem recorte", aceita antes como limitação conhecida).
      // `Vector3.project(camera)` de um ponto ATRÁS da câmera devolve
      // coordenadas de tela ESPELHADAS (a matemática da projeção perspectiva
      // "dobra" o ponto pra frente) — end aí a linha "vira", exatamente o
      // sintoma de inversão relatado. Corrigido: agora pula o segmento
      // INTEIRO (não desenha nada, em vez de desenhar errado/espelhado)
      // sempre que QUALQUER um dos 2 pontos estiver fora do frustum válido —
      // atrás da câmera (`c.z >= 0`, convenção Three.js: a câmera olha pro
      // -Z do seu próprio espaço, então um ponto na frente tem `z` NEGATIVO
      // em `matrixWorldInverse` — mesma convenção já usada acima) OU com
      // profundidade normalizada fora de [-1,1] depois de `project()`
      // (`v.z`, mesmo guard já usado por `_trena3DProjetarLabelImediato`/
      // `_trena3DProjetarLabelAoLadoDoPonto`, replicado aqui).
      const c1 = p1.clone().applyMatrix4(camera.matrixWorldInverse);
      const c2 = p2.clone().applyMatrix4(camera.matrixWorldInverse);
      if (c1.z >= 0 || c2.z >= 0) return; // qualquer um dos 2 pontos atrás da câmera — nada a desenhar (evita a linha "virar"/espelhar)
      const v1 = p1.clone().project(camera);
      const v2 = p2.clone().project(camera);
      if (!isFinite(v1.x) || !isFinite(v1.y) || !isFinite(v2.x) || !isFinite(v2.y)) return;
      if (v1.z > 1 || v1.z < -1 || v2.z > 1 || v2.z < -1) return; // fora do frustum válido — mesmo guard já usado nos rótulos
      const sx1 = (v1.x * 0.5 + 0.5) * w, sy1 = (-v1.y * 0.5 + 0.5) * h;
      const sx2 = (v2.x * 0.5 + 0.5) * w, sy2 = (-v2.y * 0.5 + 0.5) * h;
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
    });
    ctx.stroke();
  }

  _trena3DUpdateLabels(camera) {
    const els = this._trena3DLabelEls;
    // [16/09/2026 UTC] NOVO — o rótulo de PRÉVIA ao vivo (`_trena3DUpdatePreview`)
    // usa exatamente a mesma técnica de billboard (projeção mundo→tela) dos
    // rótulos já finalizados — reaproveita este MESMO loop de projeção em
    // vez de duplicar a conta em outro lugar, só juntando-o na lista por um
    // quadro quando ele estiver visível (`display !== 'none'`).
    const previewEl = this._trena3DPreviewLabelEl;
    const previewVisivel = !!previewEl && previewEl.style.display !== 'none';
    // [16/09/2026 UTC] REMOVIDO (Rodada 84) — os rótulos de altura do 1º
    // ponto "no ar" (`_trena3DP1HeightLabelEl`) e de altura "ao vivo"
    // (`_trena3DLiveHeightLabelEl`) NÃO são mais projetados aqui, numa
    // passada separada e mais tardia: pedido verbatim do usuário, "na mesma
    // função que desenha a linha laranja tracejada perpendicular ao chão,
    // desenhe também o texto da medida juntamente" — os 2 agora são
    // projetados na hora, dentro da própria `_trena3DUpdatePreview` (ver
    // `_trena3DProjetarLabelImediato`, chamado logo depois de cada uma
    // dessas 2 linhas ser desenhada/atualizada). Isso elimina de vez a
    // classe de bug já vista aqui (Rodada 81/83): um rótulo calculado numa
    // função e só desenhado numa passada separada corre o risco de ficar 1
    // quadro atrasado em relação à própria linha.
    // [16/09/2026 UTC] NOVO — idem, agora pros 2 rótulos de "guia de grade
    // do mundo" (`_trena3DAtualizarGuiaGrade`), eixo X e eixo Z.
    const gradeXEl = this._trena3DGuiaGradeXLabelEl;
    const gradeXVisivel = !!gradeXEl && gradeXEl.style.display !== 'none';
    const gradeZEl = this._trena3DGuiaGradeZLabelEl;
    const gradeZVisivel = !!gradeZEl && gradeZEl.style.display !== 'none';
    // [18/09/2026 UTC] CORRIGIDO (RODADA 155) — bug relatado: com "▦2
    // Mostrar no 2º ponto, enquanto define o 2º" ativada, as caixas de
    // texto da guia de grade referente ao 2º ponto não apareciam. CAUSA
    // RAIZ: `_trena3DAtualizarGuiaGrade` (RODADA 154) passou a criar uma 2ª
    // instância independente dos rótulos (`_trena3DGuiaGradeXLabelEl2`/
    // `...ZLabelEl2`, sufixo '2') — mas este loop, que faz a projeção
    // mundo→tela (posiciona de verdade cada caixa de texto na hora certa a
    // cada quadro), só conhecia os nomes de propriedade SEM sufixo,
    // ignorando por completo os elementos novos: eles chegavam a ser
    // criados e adicionados ao DOM (por isso o texto/conteúdo interno
    // estava certo), mas nunca tinham `left`/`top` calculados — ficavam
    // parados no canto (0,0) da tela, de fato invisíveis na prática.
    const gradeX2El = this._trena3DGuiaGradeXLabelEl2;
    const gradeX2Visivel = !!gradeX2El && gradeX2El.style.display !== 'none';
    const gradeZ2El = this._trena3DGuiaGradeZLabelEl2;
    const gradeZ2Visivel = !!gradeZ2El && gradeZ2El.style.display !== 'none';
    if ((!els || !els.length) && !previewVisivel && !gradeXVisivel && !gradeZVisivel && !gradeX2Visivel && !gradeZ2Visivel) return;
    if (!camera) return;
    const THREE = window.THREE;
    const canvas = this._container?.querySelector('#v3d-canvas');
    if (!THREE || !canvas) return;
    // Guarda defensiva NOVA — `camera.isCamera` (flag padrão de QUALQUER
    // câmera THREE de verdade) confere que `camera` tem mesmo
    // `matrixWorldInverse`/`projectionMatrix` antes de chamar `project()`
    // (ver bug corrigido acima, `_loop`: um argumento errado — a pose crua,
    // não uma câmera THREE — travava a tela inteira aqui dentro). Não devia
    // mais acontecer depois da correção lá, mas sair calado em vez de
    // travar tudo de novo é mais seguro que confiar cegamente no chamador.
    if (!camera.isCamera) return;
    const rect = canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    // [16/09/2026 UTC] NOVO (RODADA 93) — pedido verbatim: "Certifique-se que
    // os textos [...] é impresso só quando está dentro da frustrum e à
    // frente da tela (não atrás da tela, mas com a linha de texto passando
    // pela tela. Se não, acaba imprimindo texto que está com a linha
    // passando pela tela, porém está atrás da câmera)." CAUSA RAIZ: a
    // checagem antiga só olhava `v.z` DEPOIS de `Vector3.project(camera)`
    // (coordenada normalizada -1..1) — mas um ponto ATRÁS da câmera pode
    // projetar matematicamente para dentro de -1..1 em X/Y/Z (a divisão por
    // W da projeção perspectiva inverte o sinal quando W é negativo,
    // "dobrando" o ponto pro lado oposto da tela) — ou seja, `v.z` sozinho
    // NÃO detecta com segurança "atrás da câmera". Corrigido com um teste
    // explícito no ESPAÇO DA CÂMERA (antes de projetar): transforma o ponto
    // por `camera.matrixWorldInverse` e verifica a coordenada Z resultante
    // — convenção Three.js, a câmera "olha" para -Z local, então qualquer
    // ponto à frente tem Z local NEGATIVO; Z local >= 0 significa atrás (ou
    // exatamente no plano da câmera) e é tratado como fora do frustum,
    // independente do que `.project()` calcular depois.
    const atrasDaCamera = (p) => {
      const pCam = p.clone().applyMatrix4(camera.matrixWorldInverse);
      return pCam.z >= 0;
    };
    const todosOsRotulos = [...(els || []), ...(previewVisivel ? [previewEl] : []), ...(gradeXVisivel ? [gradeXEl] : []), ...(gradeZVisivel ? [gradeZEl] : []), ...(gradeX2Visivel ? [gradeX2El] : []), ...(gradeZ2Visivel ? [gradeZ2El] : [])];
    // [16/09/2026 UTC] NOVO (RODADA 98) — pedido verbatim: "quando tiver
    // várias caixas de texto na mesma região, nenhuma delas fique em cima
    // da outra, ficando mais próximo possível da sua medida de
    // referência." Em vez de aplicar `style.left/top` direto (posição
    // "ideal", já projetada), cada rótulo visível vira uma entrada em
    // `pendentes` — a posição de tela só é aplicada de verdade DEPOIS do
    // passo de anti-sobreposição logo abaixo (`_trena3DAfastarRotulosSobrepostos`).
    // [17/09/2026 UTC] NOVO (RODADA 121) — pedido verbatim: "Deve haver uma
    // opção de imprimir as caixas de texto só as que estiverem próximas do
    // personagem. Um raio deve poder ser estabelecido para isso." Lido 1x
    // por quadro (fora do forEach) — `cfg.labelRaioAtivo`/`cfg.labelRaioM`
    // (DEFAULTS `false`/`15`, sem mudança de comportamento pra quem não
    // ligar). Distância medida a partir de `this._camera` (posição de
    // olhos do jogador/personagem no motor, mesma referência já usada por
    // `_trena3DAtualizarOclusao` acima).
    const cfg = this._trena3DCfg();
    const raioAtivo = cfg.labelRaioAtivo;
    const raioM = cfg.labelRaioM;
    const cam3 = this._camera;
    // [17/09/2026 UTC] NOVO (RODADA 123) — pedido verbatim: "imprima junto
    // com o texto (para teste) as coordenadas x e y do canvas. Na esfera
    // vermelha, ao lado dela, imprima as coordenadas x e y da tela também
    // [...] deixe como opções na seção debug das configurações 3D."
    // `sx`/`sy` aqui são os MESMOS valores usados logo abaixo pra
    // posicionar `el` (`pendentes.push`) — ou seja, o número impresso é
    // EXATAMENTE a coordenada que o código está usando pra colocar aquele
    // elemento na tela, sem nenhum cálculo paralelo/duplicado. Controlado
    // por `_isDebugTrena3DCoordenadasAtivo()` (Configurações 3D → 🐞 Debug
    // → "Coordenadas de tela da Trena 3D", desligado por padrão) — quando
    // desligado, o rótulo extra da esfera fica escondido e o texto da
    // medida volta ao normal (`dataset.baseTexto`, sem coordenadas).
    const debugCoordsAtivo = this._isDebugTrena3DCoordenadasAtivo();
    const aplicarDebugCoords = (elDebug, sx, sy) => {
      if (elDebug.dataset.debugEsfera === '1') {
        elDebug.style.display = debugCoordsAtivo ? '' : 'none';
        if (debugCoordsAtivo) elDebug.textContent = `🔴 x:${Math.round(sx)},y:${Math.round(sy)}`;
        return;
      }
      if (elDebug.dataset.baseTexto !== undefined) {
        elDebug.textContent = debugCoordsAtivo
          ? `${elDebug.dataset.baseTexto} [${Math.round(sx)},${Math.round(sy)}]`
          : elDebug.dataset.baseTexto;
      }
    };
    const pendentes = [];
    todosOsRotulos.forEach((el) => {
      // [16/09/2026 UTC] NOVO — "Visibilidade": rótulo de uma medida marcada
      // como oculta por `_trena3DAtualizarOclusao` (algo bloqueando a visão
      // até ela) nem chega a ser projetado — some junto com a linha/pontas.
      if (el.dataset.oculto === '1') { el.style.display = 'none'; return; }
      // [17/09/2026 UTC] NOVO (RODADA 127) — pedido verbatim: "Deve ser
      // possível controlar se a caixa de texto com a medida vai aparecer ou
      // não em [...]. Por padrão todas ativadas." A linha/pontas/esfera do
      // ponto médio continuam sendo desenhadas normalmente — só a caixa de
      // texto HTML (este `el`) é escondida quando o respectivo flag estiver
      // desligado (ver `dataset.tipoLabel`, aplicado na criação de cada
      // rótulo em `_trena3DRebuildLines`/`_trena3DUpdatePreview`).
      if (el.dataset.tipoLabel === 'medida' && !cfg.labelVisivel) { el.style.display = 'none'; return; }
      if (el.dataset.tipoLabel === 'guiaChao' && !cfg.guiaChaoLabelVisivel) { el.style.display = 'none'; return; }
      if (el.dataset.tipoLabel === 'guiaGrade' && !cfg.guiaGradeLabelVisivel) { el.style.display = 'none'; return; }
      // [17/09/2026 UTC] NOVO (RODADA 121) — raio de proximidade do
      // personagem. `dataset.mx/my/mz` existe em TODO rótulo (inclusive
      // 'sobreLinhaMeio', que também os grava — ver criação do rótulo,
      // acima) — usado aqui só pra medir distância, mesmo quando o estilo
      // 'sobreLinhaMeio' vai projetar por outro caminho (p1x/p2x) logo
      // abaixo.
      if (raioAtivo && cam3 && el.dataset.mx !== undefined) {
        const dx = parseFloat(el.dataset.mx) - cam3.x;
        const dy = parseFloat(el.dataset.my) - cam3.y;
        const dz = parseFloat(el.dataset.mz) - cam3.z;
        if ((dx * dx + dy * dy + dz * dz) > raioM * raioM) { el.style.display = 'none'; return; }
      }
      // [16/09/2026 UTC] NOVO — branch pro estilo 'sobreLinhaMeio' ("Em cima
      // da linha e no meio"): projeta os 2 EXTREMOS da medida separadamente
      // e centraliza o rótulo na MÉDIA das 2 posições JÁ EM TELA — diferente
      // de projetar o meio em 3D (`dataset.mx/my/mz`, usado pelo estilo
      // 'sobreLinha'/"Flutuante"), já que projeção em perspectiva não é
      // linear (média-depois-de-projetar ≠ projeção-da-média). Rótulos sem
      // `dataset.p1x`/etc. (ex. prévia ao vivo, guias de grade) não têm
      // `modoLabel` e caem no `else`, mesmo comportamento de sempre.
      if (el.dataset.modoLabel === 'sobreLinhaMeio' && el.dataset.p1x !== undefined) {
        const p1 = new THREE.Vector3(parseFloat(el.dataset.p1x), parseFloat(el.dataset.p1y), parseFloat(el.dataset.p1z));
        const p2 = new THREE.Vector3(parseFloat(el.dataset.p2x), parseFloat(el.dataset.p2y), parseFloat(el.dataset.p2z));
        // [16/09/2026 UTC] NOVO (RODADA 93) — pedido verbatim: "considere...
        // qualquer um dos dois extremos [...] já que a linha 'passa pela
        // tela' pode ter uma extremidade atrás da câmera e outra na
        // frente" — QUALQUER um dos 2 extremos atrás da câmera já esconde
        // o rótulo inteiro (a média de um ponto válido com um ponto
        // "dobrado" pra trás não tem sentido geométrico nenhum).
        if (atrasDaCamera(p1) || atrasDaCamera(p2)) { el.style.display = 'none'; return; }
        const v1 = p1.clone().project(camera);
        const v2 = p2.clone().project(camera);
        const foraDoFrustumXY = (pv) => pv.x < -1 || pv.x > 1 || pv.y < -1 || pv.y > 1;
        if ((v1.z > 1 || v1.z < -1) && (v2.z > 1 || v2.z < -1)) { el.style.display = 'none'; return; }
        if (foraDoFrustumXY(v1) && foraDoFrustumXY(v2)) { el.style.display = 'none'; return; }
        // [17/09/2026 UTC] CORRIGIDO (RODADA 124) — mesmo bug/mesma
        // correção de `_trena3DProjetarLabelImediato` (ver comentário
        // grande lá) — soma `rect.left`/`rect.top`.
        const sx1 = (v1.x * 0.5 + 0.5) * rect.width + rect.left, sy1 = (-v1.y * 0.5 + 0.5) * rect.height + rect.top;
        const sx2 = (v2.x * 0.5 + 0.5) * rect.width + rect.left, sy2 = (-v2.y * 0.5 + 0.5) * rect.height + rect.top;
        el.style.display = '';
        const sxMedio = (sx1 + sx2) / 2, syMedio = (sy1 + sy2) / 2;
        aplicarDebugCoords(el, sxMedio, syMedio);
        pendentes.push({ el, x: sxMedio, y: syMedio });
        return;
      }
      const pMeio = new THREE.Vector3(parseFloat(el.dataset.mx), parseFloat(el.dataset.my), parseFloat(el.dataset.mz));
      // [16/09/2026 UTC] NOVO (RODADA 93) — mesmo guard-clause do branch
      // acima, aplicado ao ponto médio único do estilo "Flutuante".
      if (atrasDaCamera(pMeio)) { el.style.display = 'none'; return; }
      v.copy(pMeio).project(camera);
      if (v.z > 1 || v.z < -1) { el.style.display = 'none'; return; }
      if (v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) { el.style.display = 'none'; return; }
      // [17/09/2026 UTC] CORRIGIDO (RODADA 124) — mesmo bug/mesma correção
      // de `_trena3DProjetarLabelImediato` (ver comentário grande lá) —
      // soma `rect.left`/`rect.top`.
      const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
      el.style.display = '';
      aplicarDebugCoords(el, sx, sy);
      pendentes.push({ el, x: sx, y: sy });
    });
    // [17/09/2026 UTC] NOVO (RODADA 121) — pedido verbatim: "Coloque como
    // mais uma opção a reorganização automática das caixas de texto para
    // que elas não se sobreponham na tela. Atualmente isso é sempre feito,
    // sem ser opcional. Por padrão, deve ficar desligado." Com a opção
    // desligada (padrão), aplica a posição "ideal" (já projetada) direto,
    // sem passar pelo algoritmo anti-sobreposição — mesmo comportamento de
    // antes desta opção existir (RODADA 98), só que agora opcional.
    if (cfg.labelReorganizarSobreposicao) {
      this._trena3DAfastarRotulosSobrepostos(pendentes);
    } else {
      pendentes.forEach((p) => { p.el.style.left = `${p.x}px`; p.el.style.top = `${p.y}px`; });
    }
  }

  /** [16/09/2026 UTC] NOVO (RODADA 98) — pedido verbatim: "quando tiver
   *  várias caixas de texto na mesma região, nenhuma delas fique em cima
   *  da outra, ficando mais próximo possível da sua medida de referência."
   *  Algoritmo guloso simples (não é um solver sofisticado, nem precisa
   *  ser — só evitar sobreposição óbvia): itera os rótulos em ORDEM
   *  ESTÁVEL (a ordem em que `_trena3DUpdateLabels` os montou, que segue
   *  `_trena3DLabelEls`, por sua vez preenchido na ordem das medidas do
   *  mapa — mesma medida sempre cai na mesma posição da lista entre
   *  quadros, evitando "tremedeira" por reordenação). Pra cada rótulo,
   *  compara contra TODOS os já processados ANTES dele na lista (não os
   *  que vêm depois — cada um só reage ao que já foi "decidido"); se as
   *  caixas (usando a largura/altura REAL do elemento, `getBoundingClientRect`)
   *  se sobrepõem, empurra o rótulo ATUAL na direção VERTICAL mínima
   *  necessária pra parar de sobrepor aquele outro — mantém a posição
   *  IDEAL (a projeção de verdade da medida) o mais intacta possível,
   *  movendo só o necessário, e só no eixo vertical (mais previsível
   *  visualmente que espalhar em qualquer direção). Depois de resolver
   *  contra um, continua comparando o MESMO rótulo (já deslocado) contra
   *  os próximos já processados, then aplica a posição final de
   *  `style.left/top` só no final, pra todos de uma vez. */
  _trena3DAfastarRotulosSobrepostos(pendentes) {
    if (!pendentes.length) return;
    // Dimensões reais de cada caixa — lidas ANTES de qualquer reposição
    // (a largura/altura do elemento não muda com `left`/`top`, só o
    // conteúdo/CSS mudam ela, então é seguro ler uma vez aqui).
    for (const p of pendentes) {
      const r = p.el.getBoundingClientRect();
      p.w = r.width || 60;
      p.h = r.height || 20;
    }
    for (let i = 1; i < pendentes.length; i++) {
      const atual = pendentes[i];
      for (let j = 0; j < i; j++) {
        const outro = pendentes[j];
        const dx = Math.abs(atual.x - outro.x);
        const dy = Math.abs(atual.y - outro.y);
        const limiteX = (atual.w + outro.w) / 2;
        const limiteY = (atual.h + outro.h) / 2;
        if (dx >= limiteX || dy >= limiteY) continue; // não sobrepõe nesse par — nada a fazer
        // Sobrepõe — empurra o ATUAL na vertical, pro lado que já estava
        // mais perto (mantém mais próximo da posição ideal do que inverter
        // pro lado oposto) — se estiverem exatamente na mesma altura
        // (`dy===0`), empurra pra baixo por convenção (sentido arbitrário,
        // só precisa ser consistente entre quadros pra não "tremer").
        const direcao = atual.y >= outro.y ? 1 : -1;
        const distanciaNecessaria = limiteY - dy + 1; // +1px de folga visual entre as caixas
        atual.y += direcao * distanciaNecessaria;
      }
    }
    for (const p of pendentes) {
      p.el.style.left = `${p.x}px`;
      p.el.style.top = `${p.y}px`;
    }
  }

  /** Grupo THREE dedicado à PRÉVIA ao vivo da Trena 3D (indicador de onde o
   *  clique vai cair + linha guia tracejada) — separado de `_trena3DGroup`
   *  (medidas JÁ finalizadas) de propósito: `_trena3DRebuildLines` descarta
   *  e recria `_trena3DGroup` inteiro a cada medida nova/andar trocado, e
   *  misturar os dois faria a prévia sumir/piscar toda vez que qualquer
   *  medida é salva. Mesmo padrão de `_trena3DEnsureGroup` acima. */
  _trena3DEnsurePreviewGroup() {
    const THREE = window.THREE;
    if (!THREE || !this._engine?.scene) return null;
    if (!this._trena3DPreviewGroup) {
      this._trena3DPreviewGroup = new THREE.Group();
      this._trena3DPreviewGroup.name = 'trena3d-preview';
      this._engine.scene.add(this._trena3DPreviewGroup);
    }
    return this._trena3DPreviewGroup;
  }

  /** [16/09/2026 UTC] NOVO — pedido verbatim do usuário, em 3 partes:
   *  (1) "deve aparecer um indicativo de que se clicar ali onde o
   *  raycaster está batendo é ali que vai ser inserida a medida" — esfera
   *  pequena (`_trena3DHoverMesh`) sempre na superfície mirada, visível o
   *  tempo todo com a ferramenta "📏 Trena 3D" ativa (mesmo antes do 1º
   *  clique). (2) "linhas guia tracejadas devem ser apresentadas" — depois
   *  do 1º ponto já marcado, uma `THREE.Line` tracejada (`LineDashedMaterial`)
   *  do 1º ponto até a mira atual, com um rótulo HTML mostrando a distância
   *  ao vivo (mesmo mecanismo de billboard de `_trena3DUpdateLabels`, só
   *  que recalculado every frame em vez de só ao salvar). (3) "deve
   *  aparecer uma linha guia entre a âncora inserida (quando se segura o
   *  ctrl) e o cursor do mouse seguindo a linha perpendicular ao chão" —
   *  quando `_trena3DVerticalAnchor` já foi estabelecido (Ctrl no 2º
   *  clique), o alvo da prévia deixa de ser a superfície mirada direto e
   *  passa a ser `_trena3DClosestPointOnVerticalLine` (MESMA conta usada
   *  pra finalizar de verdade — ver `_trena3DClick` — garante que a prévia
   *  sempre mostra EXATAMENTE onde a medida vai cair se clicar agora).
   *  Chamado a cada quadro por `_loop`, incondicionalmente — a checagem de
   *  "ferramenta ativa" é feita aqui dentro (esconde tudo e sai cedo se
   *  `_buildTool !== 'trena3d'`), mesmo espírito de `_trena3DUpdateLabels`. */
  /** [16/09/2026 UTC] NOVO — pedido verbatim: "Outra subseção é sobre
   *  mostrar linhas tracejadas guias a partir do lado do ladrilho do mundo
   *  (na verdade, dos múltiplos de 1m. Como o ladrilho do mundo está em
   *  fase com 1m, então, acaba sendo isso mesmo). Por exemplo, aponta-se
   *  para um ponto 0,3m à direita do ladrilho que está à esquerda (uma
   *  linha tracejada guia deve ser impressa aí) e 0,4m à baixo do ladrilho
   *  que está em cima (uma linha tracejada guia deve ser impressa aí
   *  também). As medidas também devem aparecer (no meio e centralizadas).
   *  Por padrão, fica ativada." Chamado a cada quadro por
   *  `_trena3DUpdatePreview`, com o mesmo `alvo` (ponto que a mira/bolinha
   *  está definindo agora, no chão OU "no ar") — desenha até 2 linhas
   *  tracejadas curtas (eixo X e eixo Z), cada uma do `alvo` até o
   *  "ladrilho" (múltiplo de 1m) mais próximo NAQUELE eixo, com um rótulo
   *  HTML no meio (mesma técnica de billboard de `_trena3DPreviewLabelEl`).
   *  Some sozinho (linha em si E rótulo) quando o `alvo` já está bem em
   *  cima do múltiplo de 1m naquele eixo (distância ~0), pra não desenhar
   *  uma linha de comprimento zero. */
  /** [16/09/2026 UTC] RODADA 104 — pedido verbatim: "Na subseção '📏 Trena
   *  3D — Guia de grade do mundo', deve haver outra opção para
   *  habilitar/desabilitar o desenho das guias de grade, quando o 1º ponto
   *  já foi definido, continuar mostrando elas (enquanto não se definiu o
   *  2º ponto ainda)." INVESTIGAÇÃO: antes desta rodada, esta função era
   *  chamada por `_trena3DUpdatePreview` INCONDICIONALMENTE a cada quadro
   *  (com o `alvo` de QUALQUER fase — antes do 1º ponto OU mirando o 2º),
   *  e só verificava `cfg.guiaGradeAtiva` — ou seja, tecnicamente as guias
   *  já podiam continuar aparecendo durante a mira do 2º ponto, sem
   *  distinção de fase nenhuma. Para dar ao usuário um controle SEPARADO
   *  dessa fase específica (como pedido — um novo checkbox dedicado,
   *  `trena3DGuiaGradeAposPrimeiroPonto`, default `false`), esta função
   *  agora TAMBÉM verifica se há um 1º ponto já fixado
   *  (`this._trena3DPendingP1`) e, nesse caso, exige que a nova opção
   *  esteja ativa para continuar desenhando — sem ela (padrão), as guias
   *  de grade escondem assim que o 1º ponto é fixado, voltando a aparecer
   *  só depois que a medida inteira é concluída/cancelada. Antes do 1º
   *  ponto, o comportamento continua controlado só por
   *  `cfg.guiaGradeAtiva`, como sempre.
   *
   *  [16/09/2026 UTC] CORREÇÃO (RODADA 105) — a verificação de fase
   *  (`this._trena3DPendingP1` + `cfg.guiaGradeAposPrimeiroPonto`) que
   *  existia AQUI DENTRO foi removida: ela só decidia se ESCONDIA tudo,
   *  mas não resolvia QUAL PONTO usar como referência de desenho — e o
   *  chamador (`_trena3DUpdatePreview`) continuava passando sempre a mira
   *  atual (`alvo`), então, mesmo com a opção ativa, as guias apareciam
   *  relativas ao ladrilho da MIRA DO 2º PONTO, não ao ladrilho do 1º
   *  ponto fixo — que é o comportamento correto confirmado pelo usuário.
   *  Agora essa decisão de fase é feita inteiramente no ponto de chamada:
   *  ele já escolhe e passa o `alvo` certo (o 1º ponto fixo, a mira atual,
   *  ou `null` para esconder), e esta função apenas desenha as guias
   *  relativas a QUALQUER ponto que receber — função "burra"/agnóstica de
   *  fase, como sempre foi por dentro. */
  /** [18/09/2026 UTC] MUDANÇA (RODADA 154) — 2º parâmetro `sufixo` NOVO,
   *  pedido verbatim: além da opção já existente "▦1 Mostrar no 1º ponto,
   *  enquanto mira o 2º" (renomeada nesta rodada, era "Continuar mostrando
   *  depois do 1º ponto..."), o usuário pediu uma opção IRMÃ, "▦2 Mostrar
   *  no 2º ponto, enquanto define o 2º" — as duas podem ficar ativas ao
   *  MESMO TEMPO (uma guia no 1º ponto fixo + outra na mira atual do 2º
   *  ponto, simultaneamente), então esta função (que só sabia desenhar UMA
   *  guia por vez, sempre nas MESMAS 6 propriedades de instância fixas —
   *  `_trena3DGuiaGradeXLine`/`...ZLine`/labels/linhas verticais) precisa
   *  de um 2º conjunto de objetos 3D/DOM independente pra não sobrescrever
   *  o 1º quando as duas chamadas acontecerem no mesmo quadro. `sufixo`
   *  (string vazia por padrão — comportamento e nomes de propriedade
   *  IDÊNTICOS a antes pra quem já chama sem o 2º argumento) é acrescentado
   *  em TODAS as chaves de estado usadas aqui dentro — ver chamadas em
   *  `_trena3DUpdatePreview` logo abaixo, uma sem sufixo (guia do 1º ponto)
   *  e outra com `sufixo='2'` (guia do 2º ponto/mira atual). */
  _trena3DAtualizarGuiaGrade(alvo, sufixo = '') {
    const THREE = window.THREE;
    const grupo = this._trena3DPreviewGroup;
    const cfg = this._trena3DCfg();
    const kXLine = `_trena3DGuiaGradeXLine${sufixo}`;
    const kZLine = `_trena3DGuiaGradeZLine${sufixo}`;
    const kXLabel = `_trena3DGuiaGradeXLabelEl${sufixo}`;
    const kZLabel = `_trena3DGuiaGradeZLabelEl${sufixo}`;
    const esconderTudo = () => {
      if (this[kXLine]) this[kXLine].visible = false;
      if (this[kZLine]) this[kZLine].visible = false;
      if (this[kXLabel]) this[kXLabel].style.display = 'none';
      if (this[kZLabel]) this[kZLabel].style.display = 'none';
      // [17/09/2026 UTC] NOVO (RODADA 119) — esconde também as 2 linhas
      // verticais de apoio (ver `construirLabel`/`_trena3DAtualizarLinhaVerticalDoLabel`
      // acima) junto com o resto, senão ficariam "penduradas" visíveis.
      if (this[`${kXLine}LinhaVertical`]) this[`${kXLine}LinhaVertical`].visible = false;
      if (this[`${kZLine}LinhaVertical`]) this[`${kZLine}LinhaVertical`].visible = false;
    };
    if (!THREE || !grupo || !alvo || !cfg.guiaGradeAtiva) { esconderTudo(); return; }
    // [16/09/2026 UTC] CORRIGIDO — pedido verbatim: "Deve ser possível
    // definir a cor das linhas guia. Atualmente elas são desenhadas com
    // verde. E na preview está como azul. Deve ser azul para ambos, como
    // padrão." Era um verde FIXO no código (`0xb7ff5e`) — agora lê
    // `cfg.guiaGradeCorLinha`/`cfg.guiaGradeCorTexto` (ver `_trena3DCfg`),
    // cada "parte" com a própria cor configurável (mesmo padrão da "Guia
    // rente ao chão"), ambas com o mesmo azul (`#5ec8ff`) como padrão.
    const corGrade = this._trena3DHexToInt(cfg.guiaGradeCorLinha, 0x5ec8ff);
    const corGradeCss = cfg.guiaGradeCorTexto || '#5ec8ff';
    // [16/09/2026 UTC] NOVO — pedido verbatim: "As linhas guias devem ser
    // sólidas e um pouco mais espessas." Trocado de `THREE.Line`+
    // `LineDashedMaterial` (tracejada, fina — `linewidth` é ignorado na
    // maioria das GPUs, ver `_trena3DBuildFatLine`) pra um cilindro real
    // (MESMA técnica das medidas já finalizadas), sólido e com espessura de
    // verdade em metros, não pixels.
    const construirLinha = (chave, p1, p2) => {
      // [17/09/2026 UTC] MUDANÇA (RODADA 114) — espessura/estilo/dash
      // configuráveis (`cfg.guiaGradeEstiloLinha`), via o helper
      // compartilhado que já persiste o objeto entre quadros (mais barato
      // que o antigo remove+recria SEMPRE, que só existia pra desenhar um
      // cilindro sólido de espessura fixa).
      const obj = this._trena3DAtualizarLinhaEstilizadaAoVivo(chave, grupo, p1, p2, corGrade, cfg.guiaGradeEstiloLinha);
      if (obj) obj.renderOrder = 997;
    };
    const construirLabel = (chave, texto, meio) => {
      if (!this[chave]) {
        const el = document.createElement('div');
        el.className = 'v3d-trena3d-label v3d-trena3d-label--grade';
        Object.assign(el.style, {
          position: 'fixed', left: '0', top: '0', transform: 'translate(-50%,-50%)',
          background: 'rgba(20,22,28,0.7)', font: '600 11px/1.2 system-ui, sans-serif',
          padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '5',
        });
        document.body.appendChild(el);
        this[chave] = el;
      }
      // [17/09/2026 UTC] NOVO (RODADA 127) — ver comentário grande junto de
      // 'label.dataset.tipoLabel' (rótulo finalizado da medida), mesmo
      // conceito pra 'cfg.guiaGradeLabelVisivel'.
      this[chave].dataset.tipoLabel = 'guiaGrade';
      // [16/09/2026 UTC] CORRIGIDO — a cor da label agora é CONFIGURÁVEL
      // (`cfg.guiaGradeCorTexto`, ver acima), então precisa ser reaplicada
      // TODA VEZ (não só na criação do elemento, dentro do `if` acima) —
      // senão, mudar a cor nas Configurações 3D não teria efeito nas labels
      // que já existiam de um frame anterior.
      this[chave].style.color = corGradeCss;
      this[chave].style.border = `1px dashed ${corGradeCss}`;
      this[chave].textContent = texto;
      // [17/09/2026 UTC] NOVO (RODADA 119) — deslocamento vertical
      // (`cfg.guiaGradeLabelDeslocVerticalM`) + linha vertical de apoio
      // opcional (`cfg.guiaGradeLabelLinhaVertical`), mesmo mecanismo da
      // versão FINALIZADA (ver `criarGuia`/`_trena3DRebuildLines`) — aqui,
      // como este bloco é chamado de novo a cada quadro (ao vivo), a linha
      // de apoio usa `_trena3DAtualizarLinhaVerticalDoLabel` (reaproveita o
      // MESMO objeto 3D entre quadros, em vez de recriar), com uma `chave`
      // derivada e estável por rótulo (`chave + 'LinhaVertical'`).
      // [17/09/2026 UTC] AJUSTADO (RODADA 125) — "Em cima e no meio"
      // ('sobreLinhaMeio'): sem nenhum deslocamento vertical, ponto real.
      const deslocVerticalEfetivo = cfg.guiaGradeLabelEstilo === 'sobreLinhaMeio' ? 0 : cfg.guiaGradeLabelDeslocVerticalM;
      this._trena3DAtualizarLinhaVerticalDoLabel(`${chave}LinhaVertical`, grupo, meio, deslocVerticalEfetivo, corGrade, cfg);
      const meioDesloc = this._trena3DDeslocarPontoY(meio, deslocVerticalEfetivo);
      this[chave].dataset.mx = String(meioDesloc.x);
      this[chave].dataset.my = String(meioDesloc.y);
      this[chave].dataset.mz = String(meioDesloc.z);
      this[chave].style.display = '';
    };
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Outra opção é como as
    // medidas vão ser apresentadas no ladrilho, como é atualmente é uma
    // opção. Outra é sempre partindo da esquerda numa medida e de cima para
    // a outra medida (esta deve ser a padrão)." `maisPerto` (jeito
    // ORIGINAL desta seção, rodada anterior): mede sempre até o múltiplo de
    // 1m MAIS PRÓXIMO em cada eixo (pode ser o da esquerda OU o da
    // direita/de cima OU o de baixo, o que estiver mais perto).
    // `esquerdaCima` (NOVO padrão): mede SEMPRE a partir do lado esquerdo
    // do ladrilho no eixo X e SEMPRE a partir de cima no eixo Z,
    // independente de qual está mais perto — `Math.floor` em vez de
    // `Math.round` nos 2 eixos (o "lado esquerdo"/"de cima" de um ladrilho
    // de 1m é sempre o múltiplo de 1m mais BAIXO que a coordenada).
    const modoMedida = cfg.guiaGradeModoMedida;
    const gradeX = modoMedida === 'maisPerto' ? Math.round(alvo.x) : Math.floor(alvo.x);
    const gradeZ = modoMedida === 'maisPerto' ? Math.round(alvo.z) : Math.floor(alvo.z);
    const distX = Math.abs(alvo.x - gradeX);
    const distZ = Math.abs(alvo.z - gradeZ);
    if (distX > 0.005) {
      const pA = new THREE.Vector3(alvo.x, alvo.y, alvo.z);
      const pB = new THREE.Vector3(gradeX, alvo.y, alvo.z);
      construirLinha(kXLine, pA, pB);
      construirLabel(kXLabel, `↔ ${distX.toFixed(2)}m`, pA.clone().add(pB).multiplyScalar(0.5));
    } else {
      if (this[kXLine]) this[kXLine].visible = false;
      if (this[kXLabel]) this[kXLabel].style.display = 'none';
      if (this[`${kXLine}LinhaVertical`]) this[`${kXLine}LinhaVertical`].visible = false;
    }
    if (distZ > 0.005) {
      const pA = new THREE.Vector3(alvo.x, alvo.y, alvo.z);
      const pB = new THREE.Vector3(alvo.x, alvo.y, gradeZ);
      construirLinha(kZLine, pA, pB);
      construirLabel(kZLabel, `↕ ${distZ.toFixed(2)}m`, pA.clone().add(pB).multiplyScalar(0.5));
    } else {
      if (this[kZLine]) this[kZLine].visible = false;
      if (this[kZLabel]) this[kZLabel].style.display = 'none';
      if (this[`${kZLine}LinhaVertical`]) this[`${kZLine}LinhaVertical`].visible = false;
    }
  }

  /** [16/09/2026 UTC] NOVO — pedido verbatim: "desenhar um gradeado dentro
   *  do ladrilho de mundo que está sendo alvo no momento, conforme o snap
   *  definido. Um gradeado feito com linha [pontilhadas]. Por padrão
   *  ativado." Desenha as linhas de divisão INTERNAS da área alvo (ver
   *  `cfg.gradeSnapLadrilhoModo` abaixo pra qual área exatamente),
   *  espaçadas pelo passo de snap configurado (`_trena3DSnapStep()`) — ex.:
   *  passo 0.1m → grade 10×10 por ladrilho de 1m. Se o passo já é >= 1m (ou
   *  o snap está desligado), não há linha interna nenhuma pra desenhar (o
   *  próprio ladrilho já é a menor unidade) — o método simplesmente esconde
   *  tudo e sai. Uma única `THREE.LineSegments` (não `THREE.Line`) pra tudo
   *  — `computeLineDistances()` reinicia a distância acumulada a CADA PAR
   *  de vértices num `LineSegments` (ao contrário de um `THREE.Line`/tira
   *  contínua, que acumula sem parar), então o tracejado/pontilhado fica
   *  correto em cada linha mesmo com várias desenhadas de uma vez só (bem
   *  mais barato que 1 mesh por linha). [16/09/2026 UTC] NOVO — pedido
   *  verbatim: "deve ser pontilhado e não tracejado" — `dashSize` bem
   *  pequeno (~espessura de um ponto) + `gapSize` bem maior (o vão entre
   *  pontos), em vez do tracejado "meio a meio" de antes. */
  /** [16/09/2026 UTC] RODADA 100 — NOVO — pedido verbatim: "o preview deve
   *  ficar mais semelhante ao que aparece na grade no sentido de como o
   *  gradeado é montado. Se puder, use a mesma função de impressão adaptada
   *  para o preview." Função PURA (sem Three.js, sem canvas, sem `this`
   *  além de nada) que descreve o gradeado do "Snap" em coordenadas
   *  genéricas (x,z) — funciona tanto pra desenhar na cena 3D real (onde
   *  x/z são metros do mundo, com Y fixo por fora) quanto pro preview 2D do
   *  modal (onde x/z são só um retângulo local 0..largura/0..altura, sem
   *  relação com o mundo de verdade). Reutiliza a MESMA lógica de
   *  alinhamento (`posicoesAlinhadas`) que já existia só dentro de
   *  `_trena3DAtualizarGradeSnapLadrilho` antes desta rodada — as linhas
   *  ficam nos múltiplos de `passo` a partir da origem (x=0/z=0) do sistema
   *  de coordenadas que for passado, dentro de `[xMin,xMax]`/`[zMin,zMax]`,
   *  bordas exclusas (a borda do próprio ladrilho/vizinhança já é desenhada
   *  à parte, por quem chama). Devolve `{linhas, pontosPorLinha}`: `linhas`
   *  é a lista de segmentos `{x0,z0,x1,z1}`; `pontosPorLinha[i]` é a lista
   *  de pontos `{x,z}` já espaçados por `espacamento` ao longo da linha `i`
   *  (mesmo índice) — cada consumidor só precisa desenhar um ponto/marcador
   *  em cada `{x,z}`, sem repetir nenhuma conta de quantas linhas existem
   *  ou onde os pontinhos caem. */
  _trena3DCalcularGradeSnap({ xMin, xMax, zMin, zMax, passo, espacamento }) {
    const posicoesAlinhadas = (min, max) => {
      const out = [];
      if (!(passo > 0)) return out;
      const inicio = Math.ceil((min + 1e-6) / passo) * passo;
      for (let v = inicio; v < max - 1e-6; v += passo) {
        if (v > min + 1e-4) out.push(v);
      }
      return out;
    };
    const xs = posicoesAlinhadas(xMin, xMax);
    const zs = posicoesAlinhadas(zMin, zMax);
    const linhas = [];
    xs.forEach((x) => linhas.push({ eixo: 'x', x0: x, z0: zMin, x1: x, z1: zMax }));
    zs.forEach((z) => linhas.push({ eixo: 'z', x0: xMin, z0: z, x1: xMax, z1: z }));
    const pontosPorLinha = linhas.map((l) => {
      const dx = l.x1 - l.x0, dz = l.z1 - l.z0;
      const comprimento = Math.hypot(dx, dz);
      const pontos = [];
      if (comprimento < 1e-6 || !(espacamento > 0)) { pontos.push({ x: l.x0, z: l.z0 }); return pontos; }
      const passos = Math.max(1, Math.round(comprimento / espacamento));
      for (let i = 0; i <= passos; i++) {
        const t = i / passos;
        pontos.push({ x: l.x0 + dx * t, z: l.z0 + dz * t });
      }
      return pontos;
    });
    return { linhas, pontosPorLinha };
  }

  /** [16/09/2026 UTC] RODADA 101 — NOVO — pedido verbatim: "Um gradeado
   *  infinito de 1mx1m (em fase com o ladrilho do mundo) deve ser
   *  desenhado" — parte visual do recurso "Continuar no nível do 1º
   *  ponto". Usa `THREE.GridHelper` (linhas simples, muito barato —
   *  mesmo motivo já documentado no chão "wireframe" do Engine3D) com
   *  1 divisão por metro, numa área grande (`TAMANHO`, abaixo) o
   *  suficiente pra dar a impressão de "infinito" sem custo de geometria
   *  ilimitada de verdade. Recentralizado a cada quadro no vértice de
   *  grade (múltiplo de 1m) mais próximo do alvo atual — mantém sempre a
   *  MESMA fase da grade do mundo (linhas exatamente sobre os múltiplos de
   *  1m a partir da origem x=0/z=0), não importa pra onde a mira andar. */
  _trena3DAtualizarGradeNivelInfinita(ativo, y, centroX, centroZ) {
    const THREE = window.THREE;
    const grupo = this._trena3DPreviewGroup;
    if (!THREE || !grupo) return;
    if (!ativo) {
      if (this._trena3DGradeNivelHelper) this._trena3DGradeNivelHelper.visible = false;
      return;
    }
    const TAMANHO = 40; // metros de lado — grande o bastante pra parecer infinito na visão típica em 1ª pessoa
    if (!this._trena3DGradeNivelHelper) {
      const helper = new THREE.GridHelper(TAMANHO, TAMANHO, 0x7dd8ff, 0x7dd8ff);
      helper.material.transparent = true;
      helper.material.opacity = 0.28;
      helper.material.depthWrite = false;
      helper.renderOrder = 995;
      grupo.add(helper);
      this._trena3DGradeNivelHelper = helper;
    }
    this._trena3DGradeNivelHelper.position.set(Math.round(centroX), y, Math.round(centroZ));
    this._trena3DGradeNivelHelper.visible = true;
  }

  _trena3DAtualizarGradeSnapLadrilho(alvo) {
    const THREE = window.THREE;
    const grupo = this._trena3DPreviewGroup;
    const cfg = this._trena3DCfg();
    if (!THREE || !grupo || !alvo || !cfg.gradeSnapLadrilhoAtiva) {
      if (this._trena3DGradeSnapLines) this._trena3DGradeSnapLines.visible = false;
      return;
    }
    const passo = this._trena3DSnapStep();
    if (!(passo > 0) || passo >= 0.999) {
      if (this._trena3DGradeSnapLines) this._trena3DGradeSnapLines.visible = false;
      return;
    }
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ter uma opção (sobre o
    // gradeado) que o desenhe 'nos quatro ladrilhos do entorno', do 'jeito
    // atual' ou 'metade de cada ladrilho do entorno'." As 3 áreas possíveis
    // (todas centradas no VÉRTICE de grade mais próximo de `alvo`, exceto o
    // "jeito atual", que usa o ladrilho que CONTÉM `alvo`, não o vértice):
    // - 'atual' (padrão/jeito de sempre): só o ladrilho de 1m que contém
    //   `alvo` — `Math.floor` de cada eixo até `+1`.
    // - 'quatroLadrilhos': os 4 ladrilhos inteiros que se tocam no vértice
    //   de grade mais próximo — área de 2m×2m (`vértice -1` até `vértice
    //   +1` em cada eixo).
    // - 'metadeEntorno': só a METADE de cada um dos 4 ladrilhos mais perto
    //   do vértice — como cada ladrilho contribui só a metade mais próxima
    //   do vértice, o resultado é um quadrado de 1m×1m CENTRADO no vértice
    //   (em vez de com canto nele, como no modo 'atual').
    const modo = cfg.gradeSnapLadrilhoModo;
    let xMin, xMax, zMin, zMax;
    if (modo === 'quatroLadrilhos' || modo === 'metadeEntorno') {
      const vx = Math.round(alvo.x);
      const vz = Math.round(alvo.z);
      const meiaLargura = modo === 'quatroLadrilhos' ? 1 : 0.5;
      xMin = vx - meiaLargura; xMax = vx + meiaLargura;
      zMin = vz - meiaLargura; zMax = vz + meiaLargura;
    } else {
      xMin = Math.floor(alvo.x); xMax = xMin + 1;
      zMin = Math.floor(alvo.z); zMax = zMin + 1;
    }
    const y = alvo.y;
    // [16/09/2026 UTC] RODADA 100 — pedido verbatim: "o preview deve ficar
    // mais semelhante ao que aparece na grade [...] Se puder, use a mesma
    // função de impressão adaptada para o preview." A lógica de CONSTRUÇÃO
    // do gradeado (quantas linhas, onde ficam, como os pontinhos se
    // distribuem ao longo de cada uma) foi extraída pra função pura
    // `_trena3DCalcularGradeSnap` logo abaixo — ela não sabe nada de
    // Three.js nem de canvas 2D, só recebe limites (x/z) + passo do snap +
    // espaçamento dos pontinhos, e devolve uma estrutura de dados (lista de
    // linhas + lista de pontos ao longo de cada linha). Esta função (cena
    // 3D real) e `mapconfig.js#_trena3DDesenharPreviewGradeSnap` (preview
    // 2D do modal) agora chamam a MESMA função pura pra decidir ONDE ficam
    // as linhas/pontos — só o "desenho" final diverge (aqui vira geometria
    // Three.js num plano Y fixo; lá vira um `ctx.arc()` de canvas 2D).
    const espacamento = Math.max(0.005, (cfg.gradeSnapDashCm + cfg.gradeSnapGapCm) / 100);
    const { linhas, pontosPorLinha } = this._trena3DCalcularGradeSnap({ xMin, xMax, zMin, zMax, passo, espacamento });
    const pontos = [];
    linhas.forEach((_l, i) => {
      pontosPorLinha[i].forEach((p) => { pontos.push(p.x, y, p.z); });
    });
    if (!pontos.length) {
      if (this._trena3DGradeSnapLines) this._trena3DGradeSnapLines.visible = false;
      return;
    }
    const arr = new Float32Array(pontos);
    const espessuraPx = Math.max(0.5, cfg.gradeSnapEspessuraPx);
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Faça a preview da mesma cor
    // que estiver o gradeado no ladrilho do mundo [...] deve ser possível
    // escolher a cor do gradeado (que, atualmente, é um azul. Esta deve ser
    // a cor padrão...)." Cor lida de `cfg.gradeSnapCor` (novo campo
    // `trena3DGradeSnapCor` em mapconfig.js) em vez do hex fixo `0x7fd8ff`
    // — esse mesmo hex vira o valor padrão (`'#7fd8ff'`) do novo campo, pra
    // não mudar a aparência de quem nunca mexeu na opção.
    const corHex = String(cfg.gradeSnapCor || '#7fd8ff').replace('#', '0x');
    if (!this._trena3DGradeSnapLines) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.PointsMaterial({ color: Number(corHex), size: espessuraPx, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.7 });
      this._trena3DGradeSnapLines = new THREE.Points(geo, mat);
      this._trena3DGradeSnapLines.renderOrder = 996;
      grupo.add(this._trena3DGradeSnapLines);
    } else {
      this._trena3DGradeSnapLines.geometry.dispose();
      this._trena3DGradeSnapLines.geometry = new THREE.BufferGeometry();
      this._trena3DGradeSnapLines.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      this._trena3DGradeSnapLines.material.size = espessuraPx;
      this._trena3DGradeSnapLines.material.color.set(Number(corHex));
    }
    this._trena3DGradeSnapLines.visible = true;
  }

  _trena3DUpdatePreview() {
    const THREE = window.THREE;
    const grupo = this._trena3DEnsurePreviewGroup();
    const ativo = this._buildTool === 'trena3d';
    if (!THREE || !grupo || !this._engine || !this._map || !ativo) {
      if (grupo) grupo.visible = false;
      if (this._trena3DPreviewLabelEl) this._trena3DPreviewLabelEl.style.display = 'none';
      // [16/09/2026 UTC] NOVO (RODADA 94) — o rótulo da guia rente ao chão
      // (`_trena3DGuiaChaoLabelEl`) é filho de `document.body`, não do
      // `grupo` 3D — `grupo.visible=false` não o esconde sozinho, precisa
      // do mesmo tratamento explícito que `_trena3DPreviewLabelEl` já tem
      // aqui, senão fica "grudado" na tela ao sair da Trena 3D.
      if (this._trena3DGuiaChaoLabelEl) this._trena3DGuiaChaoLabelEl.style.display = 'none';
      return;
    }
    grupo.visible = true;
    const cfg = this._trena3DCfg();
    const ray = this._engine.centerRay(this._camera);
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Ao segurar o ctrl, não só a
    // bolinha muda de cor, mas também a linha tracejada infinita
    // perpendicular ao chão deve ser desenhada" — ANTES desta rodada, a
    // linha/marcador da âncora só apareciam DEPOIS de um clique com Ctrl
    // (`_trena3DVerticalAnchor` já commitado). Agora, enquanto o Ctrl está
    // FISICAMENTE segurado (`this._keys['ControlLeft'/'ControlRight']` —
    // mesmo objeto que `onKeyDown`/`onKeyUp` já mantêm pra TODAS as teclas,
    // ver `_bindDesktopControls`), mesmo sem ter clicado ainda, a mira
    // mostra ao vivo ONDE a âncora cairia se você clicasse agora (segue o
    // olhar livremente, ainda não travado em X/Z nenhum). Um clique de
    // verdade com Ctrl "commita" isso em `_trena3DVerticalAnchor` (ver
    // `_trena3DClick`) — a partir daí a linha para de seguir a mira livre e
    // passa a ficar fixa naquele X/Z (só a ALTURA do indicador azul/laranja
    // continua livre, restrita à própria reta).
    // [16/09/2026 UTC] NOVO — pedido verbatim: modo "Sempre com 4 cliques"
    // (`cfg.modoAncora === 'quatroCliques'`, ver Configurações 3D → "Como
    // funciona a ancoragem"): o Ctrl físico deixa de ter qualquer efeito —
    // a "prévia de âncora" (mostrar onde ela cairia antes mesmo de clicar)
    // passa a aparecer sempre que NÃO houver âncora commitada ainda
    // (`!this._trena3DVerticalAnchor`), já que o PRÓXIMO clique nesse modo
    // SEMPRE ancora. Reaproveita a MESMA variável `ctrlFisicoSegurado` (só
    // generalizada) em todo o resto desta função (cor da mira, altura ao
    // vivo antes do ponto etc.) sem precisar duplicar nenhuma lógica.
    const modoQuatroCliques = cfg.modoAncora === 'quatroCliques';
    const ctrlFisicoSegurado = modoQuatroCliques ? !this._trena3DVerticalAnchor : !!(this._keys?.ControlLeft || this._keys?.ControlRight);
    let alvo = null;
    let ax = null, az = null; // X/Z da âncora (commitada OU só "prévia" com Ctrl segurado, ou sempre no modo "4 cliques") pra desenhar o marcador+linha
    // [16/09/2026 UTC] RODADA 101 — NOVO — pedido verbatim: "Após
    // estabelecer o 1º ponto da medida deve ser possível 'continuar naquele
    // nível' (de y) de modo que é como se tivesse feito já o 2º ponto
    // âncora na mesma altura de y, porém não fixo e estando livre para
    // movimentar o Z e X." Terceiro modo de mira, só entra em jogo quando
    // NENHUMA âncora vertical estiver commitada (a âncora Ctrl continua com
    // prioridade total — comportamento antigo intocado) E já existir um 1º
    // ponto fixado (`_trena3DPendingP1`) E a opção `cfg.continuarNoNivel`
    // estiver ativa: em vez de mirar uma SUPERFÍCIE de verdade
    // (`_trena3DRaycastPrincipal`, que pode estar em qualquer Y), a mira
    // passa a interceptar o PLANO horizontal Y = (altura do 1º ponto) —
    // `Engine3D.raycastPlaneY` (já existente, usado noutros lugares pro
    // mesmo tipo de interseção) — X/Z ficam 100% livres (seguem o cursor
    // nesse plano), só o Y fica travado na altura do 1º ponto. `ax`/`az`
    // ficam `null` neste modo (não é uma "âncora" de verdade, não desenha a
    // linha/marcador laranja da âncora — é um plano de mira, não um ponto).
    const modoContinuarNivel = !this._trena3DVerticalAnchor && cfg.continuarNoNivel && !!this._trena3DPendingP1;
    if (this._trena3DVerticalAnchor) {
      // Âncora já commitada (1+ clique com Ctrl já feito) — "no ar",
      // restrito à reta vertical que passa por ela. Mesma função usada por
      // `_trena3DClick` pra finalizar de verdade.
      ax = this._trena3DVerticalAnchor.x; az = this._trena3DVerticalAnchor.z;
      alvo = this._trena3DClosestPointOnVerticalLine(ray, ax, az);
    } else if (modoContinuarNivel) {
      const nivelY = this._trena3DPendingP1.y;
      const hit = this._engine.raycastPlaneY?.(ray.origin, ray.dir, nivelY);
      if (hit) alvo = { x: this._trena3DSnap(hit.x), y: nivelY, z: this._trena3DSnap(hit.z) };
    } else {
      // [18/09/2026 UTC] NOVO (RODADA 149) — pista visual pedida ("Dê alguma
      // pista visual [...] destacar/realçar a ponta da medida quando
      // estiver 'grudando' nela"): com a opção ligada, a MIRA/bolinha (que
      // já segue o cursor livremente aqui, antes de qualquer clique) salta
      // direto pra cima da ponta encontrada em vez de continuar seguindo a
      // superfície mirada — já deixa claro, em tempo real, que aquele
      // clique vai "grudar" ali. Mesma função central de proximidade usada
      // pelo clique de verdade (`_trena3DRaycastChaoNivel`), só que chamada
      // aqui direto (esta função NUNCA passa por `_trena3DRaycastChaoNivel`
      // — sempre usou `_trena3DRaycastPrincipal` puro, ver comentário da
      // opção "Continuar no nível" acima) pra não herdar o "chão de nível"
      // por engano só na prévia visual.
      const pontaSnap = cfg.ancorarPontoMedida ? this._trena3DEncontrarPontaProximaMedida(ray) : null;
      const hit = pontaSnap || this._trena3DRaycastPrincipal(ray, cfg);
      if (hit) {
        alvo = { x: this._trena3DSnap(hit.x), y: this._trena3DSnap(hit.y), z: this._trena3DSnap(hit.z) };
        // Nenhuma âncora commitada ainda, mas Ctrl está segurado agora —
        // mostra a referência "em prévia", seguindo a mira livremente (X/Z
        // ainda não travados, só mostra onde ficaria SE clicasse já).
        if (ctrlFisicoSegurado) { ax = alvo.x; az = alvo.z; }
      }
    }
    // Gradeado infinito de 1×1m (em fase com o ladrilho do mundo — mesma
    // origem x=0/z=0 do resto da Trena 3D) desenhado no plano Y do "nível"
    // fixado pelo 1º ponto, substituindo visualmente qualquer referência de
    // grade que apareceria no chão nesse momento (o "🌍 Guia de grade do
    // mundo"/"📏 Gradeado do ladrilho mirado" já seguem `alvo.y`
    // automaticamente — ver `_trena3DAtualizarGuiaGrade`/
    // `_trena3DAtualizarGradeSnapLadrilho` abaixo, chamadas com o MESMO
    // `alvo` já no nível certo — só faltava este gradeado INFINITO
    // dedicado, que os outros 2 (limitados a 1-4 ladrilhos) não cobrem).
    this._trena3DAtualizarGradeNivelInfinita(modoContinuarNivel && !!alvo, modoContinuarNivel ? this._trena3DPendingP1.y : 0, alvo ? alvo.x : 0, alvo ? alvo.z : 0);
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Outra subseção é sobre
    // mostrar linhas tracejadas guias a partir do lado do ladrilho do mundo
    // [...] dos múltiplos de 1m [...] As medidas também devem aparecer (no
    // meio e centralizadas). Por padrão, fica ativada." Ver
    // `_trena3DAtualizarGuiaGrade` abaixo — roda pro `alvo` de QUALQUER
    // situação (no chão OU "no ar" via âncora), então a guia de grade
    // funciona nos 2 casos.
    // [16/09/2026 UTC] CORREÇÃO (RODADA 105) — causa raiz real do bug
    // relatado na opção "Continuar mostrando depois do 1º ponto...": a
    // opção `guiaGradeAposPrimeiroPonto` (RODADA 104) já evitava esconder a
    // guia quando o 1º ponto estava fixado, mas o ponto passado para
    // `_trena3DAtualizarGuiaGrade` continuava sendo `alvo` — ou seja, a MIRA
    // ATUAL do 2º ponto, não o 1º ponto fixo. O usuário confirmou que o
    // esperado é justamente o oposto: com o 1º ponto já commitado, as guias
    // (linhas verdes + rótulos de distância) devem continuar relativas ao
    // LADRILHO DO 1º PONTO (fixo), e não ao ladrilho da mira atual, que se
    // move livremente enquanto o 2º ponto ainda não foi definido. Por isso
    // agora escolhemos explicitamente qual ponto usar como referência:
    // - Sem 1º ponto ainda: comportamento inalterado, usa a mira atual
    //   (`alvo`), como sempre foi.
    // - Com 1º ponto fixado e a opção ativa: usa `this._trena3DPendingP1`
    //   (o 1º ponto, fixo) em vez de `alvo`.
    // - Com 1º ponto fixado e a opção desativada: passa `null`, que já
    //   aciona o `esconderTudo()` existente dentro da própria função (o
    //   antigo `if (this._trena3DPendingP1 && !cfg.guiaGradeAposPrimeiroPonto)`
    //   dentro de `_trena3DAtualizarGuiaGrade` foi removido por ficar
    //   redundante — a decisão de fase agora é feita aqui, no ponto de
    //   chamada, de forma única e explícita).
    const alvoGuiaGrade = this._trena3DPendingP1
      ? (cfg.guiaGradeAposPrimeiroPonto ? this._trena3DPendingP1 : null)
      : alvo;
    this._trena3DAtualizarGuiaGrade(alvoGuiaGrade);
    // [18/09/2026 UTC] NOVO (RODADA 154) — pedido verbatim: opção IRMÃ da
    // acima ("▦1 Mostrar no 1º ponto, enquanto mira o 2º"), agora chamada
    // "▦2 Mostrar no 2º ponto, enquanto define o 2º" (`cfg.guiaGradeNoSegundoPonto`,
    // novo campo `trena3DGuiaGradeNoSegundoPonto`) — só faz sentido com o 1º
    // ponto já fixado (é aí que existe de fato uma mira "do 2º ponto"
    // separada do 1º) e desenha relativa à mira ATUAL (`alvo`), com um
    // sufixo de instância PRÓPRIO ('2') pra não competir com a guia do 1º
    // ponto acima — as duas podem ficar visíveis ao mesmo tempo.
    const alvoGuiaGrade2 = (this._trena3DPendingP1 && cfg.guiaGradeNoSegundoPonto) ? alvo : null;
    this._trena3DAtualizarGuiaGrade(alvoGuiaGrade2, '2');
    // [16/09/2026 UTC] NOVO — pedido verbatim: "desenhar um gradeado dentro
    // do ladrilho de mundo que está sendo alvo no momento, conforme o snap
    // definido [...] Por padrão ativado." Ver `_trena3DAtualizarGradeSnapLadrilho`.
    this._trena3DAtualizarGradeSnapLadrilho(alvo);
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Deve ser exibida uma linha
    // tracejada para servir de referência visual para poder marcar um
    // ponto nela" — a reta vertical INTEIRA da âncora (do chão, y=0, até
    // `_trena3DAlturaLinhaAncoraSemTeto()` — desde a remoção do antigo teto
    // de 6m, ver comentário grande lá, este valor só existe pra dar um
    // comprimento finito à geometria, sem limite de altura real nenhum),
    // visível tanto com a âncora já commitada QUANTO em prévia (Ctrl
    // segurado, ainda sem clicar — ver acima), cor laranja (`0xff9f4d`) pra
    // não confundir com a linha azul "até o outro ponto da medida" logo
    // abaixo. Um marcador fixo (`_trena3DAnchorGroundMesh`) no pé da reta
    // completa a referência.
    if (ax != null) {
      if (!this._trena3DAnchorGroundMesh) {
        const geo = new THREE.SphereGeometry(0.05, 10, 10);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff9f4d, depthTest: false, transparent: true, opacity: 0.95 });
        this._trena3DAnchorGroundMesh = new THREE.Mesh(geo, mat);
        this._trena3DAnchorGroundMesh.renderOrder = 999;
        grupo.add(this._trena3DAnchorGroundMesh);
      }
      // [RODADA 129] UNIFICADO — antes lia `cfg.corAncora` (campo "Cor da
      // âncora/linha vertical", removido da janelinha nesta rodada por ser
      // redundante — ver comentário grande em `_trena3DCfg()`). Este marcador
      // é o pé da PRÓPRIA linha de âncora, então agora usa a cor real da
      // linha (`cfg.linhaAncoraCorInt`) diretamente — mesmo default
      // (`#ff9f4d`), comportamento visual idêntico ao de antes.
      this._trena3DAnchorGroundMesh.material.color.setHex(cfg.linhaAncoraCorInt ?? 0xff9f4d);
      this._trena3DAnchorGroundMesh.visible = true;
      this._trena3DAnchorGroundMesh.position.set(ax, 0, az);
      const baseV = new THREE.Vector3(ax, 0, az);
      const topoV = new THREE.Vector3(ax, this._trena3DAlturaLinhaAncoraSemTeto(), az);
      // [17/09/2026 UTC] MUDANÇA (RODADA 114) — cor + espessura/estilo/dash
      // agora configuráveis (`cfg.linhaAncoraCorInt`/`cfg.linhaAncoraEstiloLinha`
      // — padrão preserva a aparência exata de antes, laranja tracejada).
      const anchorLineObj = this._trena3DAtualizarLinhaEstilizadaAoVivo('_trena3DAnchorLine', grupo, baseV, topoV, cfg.linhaAncoraCorInt, cfg.linhaAncoraEstiloLinha);
      if (anchorLineObj) { anchorLineObj.renderOrder = 999; anchorLineObj.visible = true; }
    } else {
      if (this._trena3DAnchorGroundMesh) this._trena3DAnchorGroundMesh.visible = false;
      if (this._trena3DAnchorLine) this._trena3DAnchorLine.visible = false;
    }
    // Indicador ("aqui vai cair o clique") — esfera pequena na superfície
    // mirada (ou no ponto "no ar" da reta vertical, em modo Ctrl).
    if (!this._trena3DHoverMesh) {
      const geo = new THREE.SphereGeometry(0.045, 10, 10);
      const mat = new THREE.MeshBasicMaterial({ color: 0x5ec8ff, depthTest: false, transparent: true, opacity: 0.9 });
      this._trena3DHoverMesh = new THREE.Mesh(geo, mat);
      this._trena3DHoverMesh.renderOrder = 999;
      grupo.add(this._trena3DHoverMesh);
    }
    this._trena3DHoverMesh.visible = !!alvo;
    if (alvo) this._trena3DHoverMesh.position.set(alvo.x, alvo.y, alvo.z);
    // [16/09/2026 UTC] REVISTO — pedido verbatim: "Ao segurar o ctrl já
    // deve trocar a cor da bolinha [...] pra indicar visualmente que houve
    // mudança de interpretação do app por causa do segurar do botão ctrl."
    // Antes, só ficava laranja com a âncora já COMMITADA (depois de 1
    // clique) — agora troca na hora, assim que o Ctrl é FISICAMENTE
    // segurado (`ctrlFisicoSegurado`, calculado acima), mesmo antes de
    // clicar — e continua laranja com a âncora commitada mesmo depois de
    // soltar o Ctrl (até a medida ser finalizada/cancelada), já que nesse
    // caso o próximo clique ainda vai comitar "no ar" independente do
    // estado do Ctrl. Volta pro azul de sempre (`0x5ec8ff`) só quando
    // NENHUM dos dois está ativo (comportamento "normal", mira direto numa
    // superfície real). `setHex` direto no material (em vez de trocar o
    // `Mesh` inteiro) é mais barato — chamado todo quadro.
    // [RODADA 129] REVERTIDO pra cores fixas — `cfg.corAncora`/`cfg.corMira`
    // foram removidos (ver comentário grande em `_trena3DCfg()`): eram campos
    // vestigiais sem linha própria pra colorir, só coincidência de valor com
    // outras configs. Esta bolinha indicadora ("aqui vai cair o clique")
    // continua trocando de cor sozinha conforme o estado (laranja em modo
    // Ctrl/âncora, azul em mira normal), só que com os hex fixos de sempre.
    // [RODADA 131] MUDANÇA — estado normal (sem âncora/Ctrl) agora usa a cor
    // configurável `cfg.miraCorInt` (padrão 0x5ec8ff, mesmo azul de sempre)
    // em vez do hex fixo; estado ancorado continua laranja fixo (fora do
    // escopo deste pedido, ver comentário grande no HTML da subseção).
    this._trena3DHoverMesh.material.color.setHex((this._trena3DVerticalAnchor || ctrlFisicoSegurado) ? 0xff9f4d : (cfg.miraCorInt ?? 0x5ec8ff));
    // [RODADA 131] NOVO — tamanho configurável (`cfg.miraTamanho`, padrão 1 =
    // tamanho de sempre) aplicado via escala, todo quadro — reflete o
    // slider ao vivo sem precisar recriar a geometria da esfera.
    this._trena3DHoverMesh.scale.setScalar(Number(cfg.miraTamanho) || 1);
    // Linha guia tracejada + rótulo de distância ao vivo — só depois do 1º
    // ponto já estar marcado (antes disso não há "de onde" traçar).
    if (this._trena3DPendingP1 && alvo) {
      const p1v = new THREE.Vector3(this._trena3DPendingP1.x, this._trena3DPendingP1.y, this._trena3DPendingP1.z);
      const p2v = new THREE.Vector3(alvo.x, alvo.y, alvo.z);
      // [RODADA 129] MUDANÇA — cor/espessura/estilo/dash agora configuráveis
      // (`cfg.ghostCorInt`/`cfg.ghostEstiloLinha` — padrão preserva a
      // aparência exata de antes, azul tracejada fina). Antes era uma
      // `THREE.Line` com `LineDashedMaterial` fixa; agora reaproveita o
      // mesmo helper "ao vivo" já usado pela linha da âncora/guia de chão
      // (`_trena3DAtualizarLinhaEstilizadaAoVivo`), que já cuida de
      // reconstruir a geometria a cada quadro (inclusive trocando de tipo
      // de objeto ao alternar sólida/tracejada/pontilhada).
      const ghostObj = this._trena3DAtualizarLinhaEstilizadaAoVivo('_trena3DGuideLine', grupo, p1v, p2v, cfg.ghostCorInt, cfg.ghostEstiloLinha);
      if (ghostObj) { ghostObj.renderOrder = 999; ghostObj.visible = true; }
      // [17/09/2026 UTC] NOVO (RODADA 120) — mesma esfera vermelha do meio
      // real (ver `_trena3DRebuildLines`), só que pra medida AINDA sendo
      // feita (ao vivo) — mesmo raciocínio do rótulo acima: sem isso, a
      // esfera "apareceria do nada" só quando a medida fosse finalizada.
      if (!this._trena3DPreviewMeioMesh) {
        const geoMeioPrev = new THREE.SphereGeometry(0.02, 10, 10);
        const matMeioPrev = new THREE.MeshBasicMaterial({ color: 0xff2d2d, depthTest: false });
        this._trena3DPreviewMeioMesh = new THREE.Mesh(geoMeioPrev, matMeioPrev);
        this._trena3DPreviewMeioMesh.renderOrder = 999;
        grupo.add(this._trena3DPreviewMeioMesh);
      }
      this._trena3DPreviewMeioMesh.visible = true;
      this._trena3DPreviewMeioMesh.position.copy(p1v.clone().add(p2v).multiplyScalar(0.5));
      if (!this._trena3DPreviewLabelEl) {
        const el = document.createElement('div');
        el.className = 'v3d-trena3d-label v3d-trena3d-label--preview';
        Object.assign(el.style, {
          position: 'fixed', left: '0', top: '0', transform: 'translate(-50%,-50%)',
          background: 'rgba(20,22,28,0.7)', color: '#5ec8ff', font: '600 12px/1.2 system-ui, sans-serif',
          padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '5',
          border: '1px dashed #5ec8ff',
        });
        document.body.appendChild(el);
        this._trena3DPreviewLabelEl = el;
      }
      // [17/09/2026 UTC] NOVO (RODADA 127) — ver comentário grande junto de
      // 'label.dataset.tipoLabel' (rótulo finalizado da medida, em
      // `_trena3DRebuildLines`), mesmo conceito pro rótulo AO VIVO.
      this._trena3DPreviewLabelEl.dataset.tipoLabel = 'medida';
      const dist = p1v.distanceTo(p2v);
      this._trena3DPreviewLabelEl.textContent = `📏 ${dist.toFixed(2)}m`;
      // [17/09/2026 UTC] NOVO (RODADA 119) — mesmo deslocamento vertical
      // (`cfg.labelDeslocVerticalM`) do rótulo já FINALIZADO (ver
      // `_trena3DRebuildLines`), aplicado aqui também pro rótulo AO VIVO
      // (enquanto a medida ainda está sendo feita) — sem isso, o texto
      // "pularia" de posição só quando a medida fosse finalizada.
      const meio = this._trena3DDeslocarPontoY(p1v.clone().add(p2v).multiplyScalar(0.5), cfg.labelDeslocVerticalM);
      this._trena3DPreviewLabelEl.dataset.mx = String(meio.x);
      this._trena3DPreviewLabelEl.dataset.my = String(meio.y);
      this._trena3DPreviewLabelEl.dataset.mz = String(meio.z);
      this._trena3DPreviewLabelEl.style.display = '';
    } else {
      if (this._trena3DGuideLine) this._trena3DGuideLine.visible = false;
      if (this._trena3DPreviewLabelEl) this._trena3DPreviewLabelEl.style.display = 'none';
      if (this._trena3DPreviewMeioMesh) this._trena3DPreviewMeioMesh.visible = false;
    }
    // [16/09/2026 UTC] NOVO — pedido verbatim: "a primeira guia tracejada
    // deve continuar aparecendo e apresentar a medida do chão até o ponto
    // 'no ar'" — depois que o 1º ponto é comitado "no ar" via âncora (y
    // diferente de 0), a referência vertical usada pra colocá-lo lá NÃO
    // deve sumir (a rodada anterior deixava — a âncora é consumida/`null`
    // assim que o ponto é comitado em `_trena3DClick`, então o bloco
    // acima, condicionado a `this._trena3DVerticalAnchor`, escondia tudo
    // no quadro seguinte). Esta linha é INDEPENDENTE da âncora ativa
    // agora: reconstruída a partir do próprio `_trena3DPendingP1` já
    // salvo, do chão (y=0) até ele, com um rótulo mostrando essa altura —
    // continua visível enquanto o 2º ponto ainda não foi escolhido, e some
    // (junto com o resto da prévia) ao finalizar a medida ou trocar de
    // ferramenta. Só aparece quando o 1º ponto está mesmo "no ar" (y > 0
    // dentro de uma margem — um 1º ponto colocado do jeito normal, direto
    // numa superfície, quase sempre já tem y=0 ali mesmo, então a linha
    // seria só um pontinho sem utilidade nenhuma).
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Coloque uma opção de
    // continuar desenhando a linha laranja tracejada até o 1º ponto da
    // medida (por padrão, ativada) [...] Uma subopção deve ter para definir
    // se a linha laranja tracejada fica infinita ou vai até o 1º ponto da
    // medida (por padrão, a opção do 'vai até o 1º ponto da medida' deve
    // ficar ativa)." `cfg.continuarLinhaAncoraAposPonto` liga/desliga a
    // linha inteira (era sempre ligada antes, via a extinta opção "Altura
    // ao vivo" — ver comentário grande em `_trena3DCfg`); `cfg.
    // linhaAncoraAposPontoModo` decide até onde ela vai: 'ateOPonto'
    // (padrão — só até `p1.y`, comprimento real da medida) ou 'infinita'
    // (até `_trena3DAlturaLinhaAncoraSemTeto()`, sem teto de altura real,
    // ver comentário grande em `_trena3DClosestPointOnVerticalLine` — dá a
    // impressão de "a mesma reta perpendicular de antes, só que sem
    // sumir").
    // [RODADA 132] MUDANÇA — pedido verbatim: mesmo com "Continuar
    // desenhando a linha tracejada [...]" desmarcada, se "Mostrar também o
    // texto da medida junto com essa linha" estiver marcada, o TEXTO deve
    // aparecer mesmo assim ("o cálculo deve ser feito para ser usado para
    // mostrar apenas o texto se a opção de mostrar a linha estiver
    // desabilitada"). Portão externo agora só depende de haver um 1º ponto
    // "no ar" de verdade — a LINHA (`cfg.continuarLinhaAncoraAposPonto`) e o
    // TEXTO (`cfg.mostrarMedidaNaLinhaAncoraAposPonto`) são checados cada um
    // por si, independentes, dentro do bloco.
    if (this._trena3DPendingP1 && Math.abs(this._trena3DPendingP1.y) > 0.01) {
      const p1 = this._trena3DPendingP1;
      if (cfg.continuarLinhaAncoraAposPonto) {
        const linhaInfinita = cfg.linhaAncoraAposPontoModo === 'infinita';
        const baseV = new THREE.Vector3(p1.x, 0, p1.z);
        const topoV = new THREE.Vector3(p1.x, linhaInfinita ? this._trena3DAlturaLinhaAncoraSemTeto() : p1.y, p1.z);
        // [17/09/2026 UTC] MUDANÇA (RODADA 114) — cor + espessura/estilo/dash
        // agora configuráveis (ver comentário grande no bloco `_trena3DAnchorLine` acima).
        const p1HeightLineObj = this._trena3DAtualizarLinhaEstilizadaAoVivo('_trena3DP1HeightLine', grupo, baseV, topoV, cfg.linhaAncoraCorInt, cfg.linhaAncoraEstiloLinha);
        if (p1HeightLineObj) { p1HeightLineObj.renderOrder = 999; p1HeightLineObj.visible = true; }
      } else if (this._trena3DP1HeightLine) {
        this._trena3DP1HeightLine.visible = false;
      }
      // [16/09/2026 UTC] NOVO — pedido verbatim: "Outra subopção é imprimir
      // junto com a linha [...] o texto laranja da medida [...]." O texto
      // agora é opcional (`cfg.mostrarMedidaNaLinhaAncoraAposPonto`) — e
      // [RODADA 132] independente da linha estar sendo desenhada ou não (ver
      // comentário grande acima).
      if (cfg.mostrarMedidaNaLinhaAncoraAposPonto && cfg.linhaAncoraLabelVisivel) {
        if (!this._trena3DP1HeightLabelEl) {
          const el = document.createElement('div');
          el.className = 'v3d-trena3d-label v3d-trena3d-label--preview';
          Object.assign(el.style, {
            position: 'fixed', left: '0', top: '0', transform: 'translate(-50%,-50%)',
            background: 'rgba(20,22,28,0.7)', color: '#ff9f4d', font: '600 12px/1.2 system-ui, sans-serif',
            padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '5',
            border: '1px dashed #ff9f4d',
          });
          document.body.appendChild(el);
          this._trena3DP1HeightLabelEl = el;
        }
        this._trena3DP1HeightLabelEl.textContent = `⬍ ${p1.y.toFixed(2)}m`;
        // [16/09/2026 UTC] NOVO — o rótulo fica sempre no meio do trecho REAL
        // da medida (chão até `p1.y`), nunca no meio da linha "infinita"
        // inteira (`_trena3DAlturaLinhaAncoraSemTeto()`) — senão, no modo
        // 'infinita', o texto flutuaria longe do ponto medido de verdade,
        // na metade dessa altura bem maior.
        // [17/09/2026 UTC] NOVO (RODADA 119) — deslocamento vertical
        // (`cfg.linhaAncoraLabelDeslocVerticalM`) ao longo desta MESMA linha
        // vertical, a partir do seu próprio ponto médio.
        const meioAltura = this._trena3DDeslocarPontoY(new THREE.Vector3(p1.x, p1.y * 0.5, p1.z), cfg.linhaAncoraLabelDeslocVerticalM);
        // [16/09/2026 UTC] NOVO — projeta o texto JUNTO, aqui mesmo, na MESMA
        // função que acabou de desenhar a linha (`_trena3DP1HeightLine`, logo
        // acima) — ver `_trena3DProjetarLabelImediato`.
        this._trena3DProjetarLabelImediato(this._trena3DP1HeightLabelEl, meioAltura.x, meioAltura.y, meioAltura.z);
      } else if (this._trena3DP1HeightLabelEl) {
        this._trena3DP1HeightLabelEl.style.display = 'none';
      }
    } else {
      if (this._trena3DP1HeightLine) this._trena3DP1HeightLine.visible = false;
      if (this._trena3DP1HeightLabelEl) this._trena3DP1HeightLabelEl.style.display = 'none';
    }
    // [16/09/2026 UTC] NOVO — pedido verbatim: "imprimir a distância em
    // relação ao 'chão' próximo da bolinha que o cursor do mouse define
    // 'no ar' ou não. Por padrão ativado. Atualmente, a medida da linha
    // tracejada guia só aparece depois que se clicar e se estabelece um
    // ponto da medida." DIFERENTE do bloco acima (que só existe depois do
    // 1º ponto já ter sido COMITADO "no ar", e fica fixo nele): este aqui
    // segue o `alvo` atual AO VIVO, ANTES de qualquer clique — a "bolinha"
    // que o cursor define agora, seja pra escolher o 1º ponto OU o 2º.
    // Element separado (`_trena3DLiveHeightLine`/`_trena3DLiveHeightLabelEl`)
    // porque os dois podem estar visíveis AO MESMO TEMPO (ex.: 1º ponto já
    // fixado "no ar" — linha acima fixa nele — enquanto se mira o 2º ponto
    // também "no ar" — esta linha aqui, ao vivo, seguindo a mira).
    // [16/09/2026 UTC] CORRIGIDO — bug relatado: "mesmo a opção [...]
    // Altura ao vivo [...] estando marcada, a medida da altura [...] só
    // aparece depois do clique. Deve aparecer antes mesmo de clicar [...]
    // clicou segurando o ctrl, então, não só a linha tracejada infinita
    // guia deve aparecer de imediato (como já está acontecendo), mas
    // também a medida do chão até a bolinha 'no ar'." CAUSA: o limiar
    // `Math.abs(alvo.y) > 0.01` (só pra evitar uma linha de comprimento
    // zero num clique comum no chão) também escondia a medida bem no
    // instante em que a âncora acabou de ser commitada/está em prévia — a
    // MESMA referência vertical (`ax`/`az`/linha tracejada laranja) já
    // aparece de imediato nesse momento (ver acima), então a medida de
    // altura correspondente deve aparecer junto, mesmo que o valor comece
    // em 0.00m (a câmera ainda não foi inclinada pra cima/baixo). Em modo
    // "vertical" (`ctrlFisicoSegurado` OU âncora já commitada) o limiar é
    // ignorado — só continua valendo pro caso normal (clique comum na
    // superfície, sem âncora em jogo), pra não gerar uma linha "0.00m"
    // inútil toda vez que se mira o chão sem nenhuma âncora envolvida.
    // [16/09/2026 UTC] NOVO — pedido verbatim: "Ao clicar segurando o ctrl
    // cria-se uma âncora no chão com uma bolinha laranja [...] mesmo
    // enquanto não se fixe o outro ponto laranja com um clique, a medida
    // entre os pontos laranjas deve aparecer [...] Se já não tem opção pra
    // isso, deve ter [...] logo após a opção '📏 Trena 3D — Altura ao
    // vivo', uma subseção de 'antes mesmo de definir o ponto'." Opção NOVA
    // e DEDICADA (`mostrarAlturaAoVivoAntesDoPonto`) só pro caso exato
    // descrito — âncora no chão JÁ commitada (`_trena3DVerticalAnchor`),
    // mas o ponto "no ar" correspondente ainda NÃO foi fixado por um
    // clique. [16/09/2026 UTC] REMOVIDO — pedido verbatim: "Colapse as duas
    // subseções '📏 Trena 3D — Altura ao vivo' e '📏 Trena 3D — Antes mesmo
    // de definir o ponto' [...] deixe a opção e a descrição textual de
    // 'Antes mesmo de definir o ponto'. A opção da subseção 'Altura ao
    // vivo' deixa de existir." A opção geral "Altura ao vivo" não existe
    // mais como config — o caso que ela cobria (mira comum numa superfície
    // elevada, sem âncora nenhuma em jogo) fica sempre ativo agora (era o
    // padrão de qualquer forma).
    const ancoraJaCommitada = !!this._trena3DVerticalAnchor;
    const emModoVertical = ancoraJaCommitada || ctrlFisicoSegurado;
    // [RODADA 132] MUDANÇA — as 2 opções antigas ("Mostrar já ao segurar
    // o Ctrl"/"Mostrar a medida entre a âncora e a bolinha 'no ar'")
    // foram UNIDAS numa só (`cfg.mostrarAlturaAoVivoAntesDoPonto`), que
    // agora cobre os 2 casos (Ctrl segurado OU âncora já commitada). O caso
    // normal (sem Ctrl, sem âncora nenhuma em jogo) continua sempre
    // permitido — o limiar de altura mínima logo abaixo já filtra ele sozinho.
    const alturaPermitidaPorConfig = (ancoraJaCommitada || ctrlFisicoSegurado)
      ? cfg.mostrarAlturaAoVivoAntesDoPonto
      : true;
    // [16/09/2026 UTC] REMOVIDO — pedido verbatim: "Na subseção '📏 Trena 3D
    // — Altura ao vivo (Antes mesmo de definir o ponto)' a opção 'Sempre
    // desenhada enquanto a Trena 3D estiver ativa' deve ser removida do
    // projeto." Opção `trena3DAlturaAoVivoSempreDesenhada` (RODADA 90),
    // checkbox `mc-trena3d-altura-sempre` e o campo `sempreDesenhada` que
    // ela alimentava aqui foram removidos por completo (UI em mapconfig.js
    // e leitura em `_trena3DCfg()`, ambos junto desta mudança) — a linha
    // volta a depender só de `alturaPermitidaPorConfig`/`emModoVertical`/
    // limiar de altura mínima, exatamente como antes da Rodada 90 existir.
    if (alturaPermitidaPorConfig && alvo && (emModoVertical || Math.abs(alvo.y) > 0.01)) {
      const baseV2 = new THREE.Vector3(alvo.x, 0, alvo.z);
      const topoV2 = new THREE.Vector3(alvo.x, alvo.y, alvo.z);
      // [17/09/2026 UTC] MUDANÇA (RODADA 114) — cor + espessura/estilo/dash
      // agora configuráveis (ver comentário grande no bloco `_trena3DAnchorLine` acima).
      const liveHeightLineObj = this._trena3DAtualizarLinhaEstilizadaAoVivo('_trena3DLiveHeightLine', grupo, baseV2, topoV2, cfg.linhaAncoraCorInt, cfg.linhaAncoraEstiloLinha);
      if (liveHeightLineObj) { liveHeightLineObj.renderOrder = 999; liveHeightLineObj.visible = true; }
      // [RODADA 131] NOVO — "Caixa de texto" (cfg.linhaAncoraLabelVisivel):
      // a linha acima continua sempre desenhada normalmente, só a caixa de
      // texto ("⬍ Xm") é escondida quando esta opção estiver desligada.
      if (!cfg.linhaAncoraLabelVisivel) {
        if (this._trena3DLiveHeightLabelEl) this._trena3DLiveHeightLabelEl.style.display = 'none';
      } else {
      if (!this._trena3DLiveHeightLabelEl) {
        const el = document.createElement('div');
        el.className = 'v3d-trena3d-label v3d-trena3d-label--preview';
        Object.assign(el.style, {
          position: 'fixed', left: '0', top: '0', transform: 'translate(-50%,-50%)',
          background: 'rgba(20,22,28,0.7)', color: '#ff9f4d', font: '600 12px/1.2 system-ui, sans-serif',
          padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '5',
          border: '1px dashed #ff9f4d',
        });
        document.body.appendChild(el);
        this._trena3DLiveHeightLabelEl = el;
      }
      this._trena3DLiveHeightLabelEl.textContent = `⬍ ${alvo.y.toFixed(2)}m`;
      // [17/09/2026 UTC] MUDANÇA (RODADA 110) — pedido verbatim: "ao
      // aparecer da linha laranja tracejada infinita, o texto que apresenta
      // a sua medida deve ficar próximo do ponto que está sendo definido
      // pelo cursor do mouse em y. Não mais ao meio da medida inteira."
      // Trocado o ponto médio do segmento inteiro por perto do próprio
      // ponto mirado (`topoV2`/`alvo`).
      // [17/09/2026 UTC] CORRIGIDO (RODADA 113) — pedido verbatim: "Sobre o
      // texto ficar próximo do ponto gerado pelo cursor do mouse na linha
      // laranja tracejada infinita, a caixa do texto nunca deve cobrir a
      // extremidade da medida (a extremidade deve sempre ficar visível)."
      // CAUSA RAIZ: o deslocamento da Rodada 110 era em METROS no espaço do
      // MUNDO (`Math.min(0.15, alvo.y)`, até 15cm em direção ao chão) — um
      // deslocamento fixo em metros encolhe/cresce NA TELA dependendo da
      // distância da câmera, então em zooms mais distantes ainda dava pra
      // sobrepor a bolinha do indicador. CORRIGIDO: troca a projeção por
      // `_trena3DProjetarLabelAoLadoDoPonto`, que desloca o texto em PIXELS
      // NA TELA (não mais em metros no mundo) — projeta o ponto do topo
      // (`topoV2`) e um ponto de referência (`baseV2`, o chão) pra tela,
      // calcula a direção 2D entre eles e desloca o texto por uma
      // quantidade fixa em pixels (26px) nessa direção — garante a mesma
      // separação visual da extremidade da medida em QUALQUER zoom/
      // distância de câmera.
      // [17/09/2026 UTC] NOVO (RODADA 119) — pedido verbatim: controlar a
      // posição do texto ao longo desta MESMA linha vertical, relativo ao
      // seu ponto médio (0 = no meio, positivo/negativo = acima/abaixo dele)
      // — `cfg.linhaAncoraLabelDeslocVerticalM`. Com o valor padrão (0),
      // preserva 100% o comportamento da RODADA 113 acima (texto perto do
      // TOPO, nunca cobrindo a extremidade, deslocado em PIXELS na tela);
      // só quando o usuário mexe no novo controle é que o texto passa a
      // ser posicionado a partir do PONTO MÉDIO da linha, deslocado em
      // METROS no mundo (`_trena3DProjetarLabelImediato`) — as 2 técnicas
      // de deslocamento (pixels-na-tela vs. metros-no-mundo) não se somam,
      // já que resolvem o mesmo problema (onde colocar o texto nesta linha)
      // de formas incompatíveis entre si.
      if (cfg.linhaAncoraLabelDeslocVerticalM) {
        const meioAlturaLive = this._trena3DDeslocarPontoY(baseV2.clone().add(topoV2).multiplyScalar(0.5), cfg.linhaAncoraLabelDeslocVerticalM);
        this._trena3DProjetarLabelImediato(this._trena3DLiveHeightLabelEl, meioAlturaLive.x, meioAlturaLive.y, meioAlturaLive.z);
      } else {
        this._trena3DProjetarLabelAoLadoDoPonto(this._trena3DLiveHeightLabelEl, topoV2, baseV2, 26);
      }
      }
    } else {
      if (this._trena3DLiveHeightLine) this._trena3DLiveHeightLine.visible = false;
      if (this._trena3DLiveHeightLabelEl) this._trena3DLiveHeightLabelEl.style.display = 'none';
    }
    // [16/09/2026 UTC] NOVO (RODADA 94) — pedido verbatim: "desenhar uma
    // medida guia rente ao chão até a posição do cursor do mouse." Nova
    // opção `trena3DMostrarGuiaChaoAoVivo` (padrão desativado) — enquanto o
    // 1º ponto da medida já estiver marcado (`_trena3DPendingP1`) e a mira
    // estiver acertando algo (`alvo`), desenha uma linha tracejada
    // ADICIONAL no PLANO DO CHÃO (y=0) ligando a projeção XZ do 1º ponto à
    // projeção XZ do alvo atual — ou seja, a distância HORIZONTAL entre os
    // 2 pontos, ignorando qualquer diferença de altura entre eles (útil pra
    // medir "quanto anda no chão" mesmo mirando pontos em alturas
    // diferentes). [16/09/2026 UTC] MUDANÇA (RODADA 98) — pedido verbatim:
    // "Cada parte ali deve ter a sua cor característica." A linha e o
    // texto/rótulo agora usam campos de cor SEPARADOS e configuráveis
    // (`cfg.guiaChaoCorLinha`/`cfg.guiaChaoCorTexto`, padrões verde/
    // verde-limão — ver DEFAULTS) em vez da mesma cor fixa pras 2 "partes"
    // — a cor de cada uma é reaplicada TODO quadro (`material.color.set`/
    // `el.style.color`) pra refletir mudança ao vivo no color-picker, sem
    // precisar recriar a linha/o elemento. Ainda distintas do laranja
    // (linhas verticais da âncora/altura ao vivo) e do azul (linha guia
    // "3D direta" entre os 2 pontos, `_trena3DGuideLine` acima), pra não
    // confundir as 3 linhas quando aparecem juntas na tela.
    if (cfg.mostrarGuiaChaoAoVivo && this._trena3DPendingP1 && alvo) {
      // [RODADA 131] MUDANÇA — mesma conta de Y comum às 2 pontas do bloco
      // finalizado acima, aplicada aqui à versão AO VIVO.
      const yChaoAoVivo = this._trena3DGuiaChaoAlturaY(cfg, this._trena3DPendingP1.y, alvo.y);
      const p1Chao = new THREE.Vector3(this._trena3DPendingP1.x, yChaoAoVivo, this._trena3DPendingP1.z);
      const alvoChao = new THREE.Vector3(alvo.x, yChaoAoVivo, alvo.z);
      // [17/09/2026 UTC] MUDANÇA (RODADA 114) — espessura/estilo/dash agora
      // configuráveis (`cfg.guiaChaoEstiloLinha`), em vez da linha fina
      // tracejada FIXA de sempre; e pontas (simplificadas,
      // `cfg.guiaChaoPonta`) nas 2 extremidades, quando escolhidas.
      const corChaoAoVivoInt = this._trena3DHexToInt(cfg.guiaChaoCorLinha, 0x7dff6e);
      const guiaChaoObj = this._trena3DAtualizarLinhaEstilizadaAoVivo('_trena3DGuiaChaoLine', grupo, p1Chao, alvoChao, corChaoAoVivoInt, cfg.guiaChaoEstiloLinha);
      if (guiaChaoObj) { guiaChaoObj.renderOrder = 999; guiaChaoObj.visible = true; }
      if (this._trena3DGuiaChaoPontas) {
        this._trena3DGuiaChaoPontas.forEach((p) => grupo.remove(p));
        this._trena3DGuiaChaoPontas = null;
      }
      if (cfg.guiaChaoPonta && cfg.guiaChaoPonta !== 'nenhuma') {
        const dirChaoAoVivo = new THREE.Vector3().subVectors(alvoChao, p1Chao);
        if (dirChaoAoVivo.length() > 1e-5) {
          const dirChaoAoVivoNorm = dirChaoAoVivo.clone().normalize();
          const raioPontaChaoAoVivo = Math.max(0.0008, (Number(cfg.guiaChaoEstiloLinha?.espessuraCm) || 1.2) / 200);
          const pontaChaoAoVivo1 = this._trena3DBuildEndpoint(cfg.guiaChaoPonta, p1Chao, dirChaoAoVivoNorm, dirChaoAoVivoNorm.clone().negate(), corChaoAoVivoInt, raioPontaChaoAoVivo, cfg);
          const pontaChaoAoVivo2 = this._trena3DBuildEndpoint(cfg.guiaChaoPonta, alvoChao, dirChaoAoVivoNorm, dirChaoAoVivoNorm, corChaoAoVivoInt, raioPontaChaoAoVivo, cfg);
          this._trena3DGuiaChaoPontas = [];
          if (pontaChaoAoVivo1) { grupo.add(pontaChaoAoVivo1); this._trena3DGuiaChaoPontas.push(pontaChaoAoVivo1); }
          if (pontaChaoAoVivo2) { grupo.add(pontaChaoAoVivo2); this._trena3DGuiaChaoPontas.push(pontaChaoAoVivo2); }
        }
      }
      if (!this._trena3DGuiaChaoLabelEl) {
        const el = document.createElement('div');
        el.className = 'v3d-trena3d-label v3d-trena3d-label--preview';
        Object.assign(el.style, {
          position: 'fixed', left: '0', top: '0', transform: 'translate(-50%,-50%)',
          background: 'rgba(20,22,28,0.7)', font: '600 12px/1.2 system-ui, sans-serif',
          padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: '5',
        });
        document.body.appendChild(el);
        this._trena3DGuiaChaoLabelEl = el;
      }
      this._trena3DGuiaChaoLabelEl.style.color = cfg.guiaChaoCorTexto;
      this._trena3DGuiaChaoLabelEl.style.border = `1px dashed ${cfg.guiaChaoCorTexto}`;
      const distChao = p1Chao.distanceTo(alvoChao);
      this._trena3DGuiaChaoLabelEl.textContent = `⬌ ${distChao.toFixed(2)}m`;
      // [17/09/2026 UTC] NOVO (RODADA 119) — mesmo deslocamento vertical da
      // versão finalizada (ver `_trena3DRebuildLines`), aplicado aqui pro
      // rótulo AO VIVO desta guia.
      // [17/09/2026 UTC] AJUSTADO (RODADA 125) — "Em cima e no meio" usa o
      // ponto médio real, sem deslocamento (mesma lógica do bloco
      // finalizado, `meioChaoFin`, em `_trena3DRebuildLines`).
      const meioChaoRealAoVivo = p1Chao.clone().add(alvoChao).multiplyScalar(0.5);
      const meioChao = cfg.guiaChaoLabelEstilo === 'sobreLinhaMeio'
        ? meioChaoRealAoVivo
        : this._trena3DDeslocarPontoY(meioChaoRealAoVivo, cfg.guiaChaoLabelDeslocVerticalM);
      this._trena3DProjetarLabelImediato(this._trena3DGuiaChaoLabelEl, meioChao.x, meioChao.y, meioChao.z);
      // [17/09/2026 UTC] NOVO (RODADA 127) — "Mostrar caixa de texto"
      // ('cfg.guiaChaoLabelVisivel'). Este rótulo é projetado imediatamente
      // (`_trena3DProjetarLabelImediato`, acima), não pelo loop compartilhado
      // de `_trena3DUpdateLabels` — por isso precisa do próprio guard aqui,
      // depois da projeção (senão ela reaplicaria `display:''`).
      if (!cfg.guiaChaoLabelVisivel) this._trena3DGuiaChaoLabelEl.style.display = 'none';
    } else {
      if (this._trena3DGuiaChaoLine) this._trena3DGuiaChaoLine.visible = false;
      if (this._trena3DGuiaChaoLabelEl) this._trena3DGuiaChaoLabelEl.style.display = 'none';
      // [17/09/2026 UTC] NOVO (RODADA 114) — remove também as pontas (se
      // alguma ficou de uma chamada anterior), já que elas não são
      // "escondidas" (`visible=false`) e sim recriadas do zero a cada
      // chamada em que a guia está ativa (ver bloco acima).
      if (this._trena3DGuiaChaoPontas) { this._trena3DGuiaChaoPontas.forEach((p) => grupo.remove(p)); this._trena3DGuiaChaoPontas = null; }
    }
  }

  /** [16/09/2026 UTC] NOVO — pedido verbatim: "Faça uma janelinha com todas
   *  as opções do 'Trena 3D' de modo que fique ícones para o que se pode
   *  ativar/desativar [...] Será como um acesso rápido. Deve ser possível
   *  mover a janelinha e ativá-la/desativá-la nas 'configurações 2D', na
   *  seção 'Trena 3D'. Por padrão, ativado. O caminho até a janela deve
   *  aparecer no título dela. Deve ser possível mover a janela clicando em
   *  qualquer parte da sua área de impressão, exceto os botões. Deve ter um
   *  botão de fechar 'X', também." Janelinha pequena, `position:fixed`
   *  (mesmo motivo dos rótulos — anexada em `document.body`, não em
   *  `this._container`), com um botão por opção booleana configurável da
   *  "📏 Trena 3D" — cada botão já É o ícone (texto curto/emoji + `title`
   *  com a descrição completa, texto só aparece se necessário) e reflete o
   *  estado atual (classe `.on`/`.off`). Construída uma vez por sessão do
   *  "Ver em 3D" (`mount()`) e sincronizada a cada mudança de config
   *  (`_onMapConfigChange`) — cobre tanto cliques nela mesma quanto mudanças
   *  feitas direto nas Configurações 3D. O "✕" só ESCONDE a janelinha
   *  nesta sessão do 3D (`this._trena3DPainelRapidoFechadoManualmente`) —
   *  não mexe na opção persistida "Mostrar janela de acesso rápido..." das
   *  Configurações 2D; reabrir "Ver em 3D" a traz de volta. Posição do
   *  arraste também é só-desta-sessão (não persiste entre aberturas — ver
   *  DEFAULTS._trena3DPainelRapidoPos abaixo). */
  /** [17/09/2026 UTC] NOVO (RODADA 125) — pedido verbatim: "Nas
   *  'configurações 3D', na seção de debug, deve ter um botão que habilita
   *  aparecer/não aparecer o botão que liga/desliga o debug em algum lugar
   *  da tela." Não existia nenhum botão flutuante de debug até esta rodada
   *  — criado aqui um botão 🐞 fixo no canto inferior ESQUERDO (o canto
   *  direito já é usado pelo botão "reabrir a janelinha da Trena 3D", ver
   *  `_trena3DMostrarBotaoReabrirPainelRapido` logo abaixo), que alterna
   *  `debugModoAtivo` com 1 clique. Sua PRÓPRIA visibilidade é controlada
   *  por `debugBotaoTelaAtivo` (mapconfig.js, seção "🐞 Debug"). Chamado no
   *  `mount()` e sempre que a config mudar (`_onMapConfigChange`). */
  _trena3DEnsureDebugBotaoTela() {
    if (!this._cfgAdapter) return;
    const cache = this._cfgAdapter._cache || {};
    const def = this._cfgAdapter.DEFAULTS || {};
    const ativo = (cache.debugBotaoTelaAtivo ?? def.debugBotaoTelaAtivo) !== false;
    if (!ativo) {
      if (this._trena3DDebugBotaoTelaEl) this._trena3DDebugBotaoTelaEl.style.display = 'none';
      return;
    }
    const debugLigado = (cache.debugModoAtivo ?? def.debugModoAtivo) === true;
    // [18/09/2026 UTC] CORRIGIDO (RODADA 154) — bug relatado: "ao ir no 'Ver
    // em 3D' e ativar o debug [...] ao clicar em 'Sair do 3D' e entrar
    // novamente, o botão do debug desaparece." Causa raiz: `this` aqui é o
    // módulo View3D (reaproveitado entre aberturas, não recriado a cada
    // `mount()`), então `this._trena3DDebugBotaoTelaEl` sobrevivia como
    // referência a um `<button>` já DESANEXADO do DOM (o `_container` antigo
    // foi destruído ao "Sair do 3D", levando o botão junto) — o `if` abaixo
    // via essa referência "verdadeira" (o objeto ainda existe em memória) e
    // só atualizava esse elemento fantasma, sem nunca criar um botão NOVO
    // dentro do `_container` novo desta reentrada. Corrigido: só reaproveita
    // o botão salvo se ele ainda estiver realmente conectado ao `_container`
    // ATUAL — caso contrário, esquece a referência velha e recria do zero
    // logo abaixo (mesmo caminho de "1ª vez", agora também usado em
    // reaberturas).
    if (this._trena3DDebugBotaoTelaEl && this._container && this._container.contains(this._trena3DDebugBotaoTelaEl)) {
      this._trena3DDebugBotaoTelaEl.style.display = '';
      this._trena3DDebugBotaoTelaEl.classList.toggle('active', debugLigado);
      this._trena3DDebugBotaoTelaEl.style.background = debugLigado ? 'rgba(255,45,45,0.85)' : 'rgba(20,22,28,0.92)';
      this._trena3DDebugBotaoTelaEl.style.color = debugLigado ? '#fff' : '#c7cbd4';
      return;
    }
    this._trena3DDebugBotaoTelaEl = null;
    if (this._container && !this._container.style.position) this._container.style.position = 'relative';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v3d-trena3d-debug-botao-tela';
    btn.textContent = '🐞';
    btn.title = 'Liga/desliga o modo Debug (Configurações 3D → 🐞 Debug)';
    Object.assign(btn.style, {
      position: 'absolute', bottom: '14px', left: '14px', zIndex: '2147483000',
      width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
      border: '1px solid rgba(255,255,255,0.15)', background: debugLigado ? 'rgba(255,45,45,0.85)' : 'rgba(20,22,28,0.92)',
      color: debugLigado ? '#fff' : '#c7cbd4', fontSize: '15px', boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0',
    });
    btn.addEventListener('click', async () => {
      const atual = (this._cfgAdapter._cache?.debugModoAtivo ?? this._cfgAdapter.DEFAULTS?.debugModoAtivo) === true;
      await this._cfgAdapter.set({ debugModoAtivo: !atual });
    });
    this._container?.appendChild(btn);
    this._trena3DDebugBotaoTelaEl = btn;
  }

  /** [17/09/2026 UTC] NOVO (RODADA 125) — pedido verbatim: "Deve ter algum
   *  jeito de poder trocar a espessura e as cores para cada opção que tem
   *  esses tipos de configurações pela própria janelinha da 'Trena 3D'. Sem
   *  mexer na disposição atual dos botões. Com visual simplesta e usando os
   *  botões triplos e caixas de cor." Bloco NOVO, `.v3d-trena3d-pr-ajustes`,
   *  inserido DEPOIS de `.v3d-trena3d-pr-botoes` (ver `_trena3DEnsurePainelRapido`)
   *  — não altera a disposição dos botões já existentes. Reaproveita o
   *  "botão triplo" (`this._cfgAdapter._montarBotaoTriplo`, o mesmo widget usado em
   *  Configurações 3D) — funciona aqui porque a função só precisa de um
   *  elemento com `.querySelector('#id')`, não necessariamente o `<modal>`
   *  de verdade. Colapsado dentro de um `<details>` (visual "simplesta",
   *  fora do caminho de quem só usa os botões normais). */
  /** [RODADA 130] Definições DE CÓDIGO (fonte única) de cada "grupo" de
   *  espessura/cor da janelinha — pedido verbatim (reorganizar a ordem para
   *  Linha da medida → Ponto médio → Prévia da medida → Linha de âncora →
   *  Guia rente ao chão → Guia de grade) e pedido de permitir reordenar/
   *  esconder isso pela subseção "Janela de acesso rápido" (mapconfig.js,
   *  `_trena3DHtmlEditorGruposAjustes`/`_wireEditorGruposAjustesPainelRapido`
   *  reaproveitam ESTA MESMA lista e `_trena3DHtmlGrupoAjuste` abaixo, pra
   *  garantir fidelidade visual 100% entre o editor no modal e a janelinha
   *  real, sem duplicar HTML/CSS). Cada item: `chave` (id estável, usado nos
   *  campos de ordem/visibilidade), `rotulo` (texto exibido), `esp` (null
   *  quando o grupo não tem "botão triplo" de espessura — caso do "Ponto
   *  médio", que é uma esfera, não uma linha) e `cores` (1 ou 2 color
   *  pickers). */
  _trena3DGruposAjustesPainelRapido() {
    return [
      { chave: 'linha', rotulo: 'Linha da medida',
        esp: { min: 0.1, max: 1000, campo: 'trena3DEspessuraCm', fallback: 1 },
        cores: [{ sufixo: 'cor', campo: 'trena3DCorLinha', padrao: '#ffd166', titulo: 'Cor da medida finalizada' }],
        // [RODADA 132] NOVO — pedido verbatim: "Na janelinha da 'Trena 3D'
        // deve ter a possibilidade de ativar/desativar os textos das
        // medidas [...] ao lado dos botões de cor." Botão-toggle intuitivo
        // (ícone 🔤) que liga/desliga a mesma config já usada pelas
        // subseções de "Caixa de texto" das Configurações 3D — ver
        // '_trena3DHtmlGrupoAjuste'/'_trena3DWireAjustesPainelRapido'/
        // '_trena3DResyncAjustesPainelRapido' abaixo.
        texto: 'trena3DLabelVisivel' },
      { chave: 'pontomedio', rotulo: 'Ponto médio',
        esp: null,
        cores: [{ sufixo: 'cor', campo: 'trena3DCorPontoMedio', padrao: '#ff2d2d', titulo: 'Cor da esfera do ponto médio' }] },
      { chave: 'ghost', rotulo: 'Prévia da medida',
        esp: { min: 0.1, max: 1000, step: 0.1, campo: 'trena3DGhostEspessuraCm', fallback: 1 },
        cores: [{ sufixo: 'cor', campo: 'trena3DGhostCor', padrao: '#ffd166', titulo: 'Cor da prévia da medida' }] },
      { chave: 'linhaancora', rotulo: 'Linha de âncora',
        esp: { min: 0.1, max: 1000, step: 0.1, campo: 'trena3DLinhaAncoraEspessuraCm', fallback: 1 },
        cores: [{ sufixo: 'cor', campo: 'trena3DLinhaAncoraCor', padrao: '#ff9f4d', titulo: 'Cor da linha da âncora' }],
        texto: 'trena3DLinhaAncoraLabelVisivel' },
      { chave: 'guiachao', rotulo: 'Guia rente ao chão',
        esp: { min: 0.1, max: 1000, step: 0.1, campo: 'trena3DGuiaChaoEspessuraCm', fallback: 1.2 },
        cores: [
          { sufixo: 'cor-linha', campo: 'trena3DGuiaChaoCorLinha', padrao: '#7dff6e', titulo: 'Cor da linha' },
          { sufixo: 'cor-texto', campo: 'trena3DGuiaChaoCorTexto', padrao: '#d9ff8a', titulo: 'Cor do texto' },
        ],
        texto: 'trena3DGuiaChaoLabelVisivel' },
      { chave: 'guiagrade', rotulo: 'Guia de grade',
        esp: { min: 0.1, max: 1000, step: 0.1, campo: 'trena3DGuiaGradeEspessuraCm', fallback: 2.4 },
        cores: [
          { sufixo: 'cor-linha', campo: 'trena3DGuiaGradeCorLinha', padrao: '#5ec8ff', titulo: 'Cor da linha' },
          { sufixo: 'cor-texto', campo: 'trena3DGuiaGradeCorTexto', padrao: '#5ec8ff', titulo: 'Cor do texto' },
        ],
        texto: 'trena3DGuiaGradeLabelVisivel' },
    ];
  }

  /** [RODADA 130] Aplica a ordem/visibilidade escolhida pelo usuário
   *  (`trena3DPainelRapidoOrdemGrupos`/`trena3DPainelRapidoGruposOcultos`,
   *  mesmo padrão já usado pelos chips de botões —
   *  `trena3DPainelRapidoOrdem`/`trena3DPainelRapidoOcultos`) sobre a lista
   *  de código acima. `incluirOcultos` (usado pelo editor no modal, que
   *  precisa mostrar TODOS os grupos, mesmo os escondidos da janelinha real,
   *  pra que dê pra reexibi-los) faz o filtro de ocultos ser pulado. */
  _trena3DGruposAjustesEfetivos(incluirOcultos = false) {
    const todos = this._trena3DGruposAjustesPainelRapido();
    const porChave = new Map(todos.map((g) => [g.chave, g]));
    const cache = (!!this._cfgAdapter && this._cfgAdapter._cache) || {};
    const ordemSalva = (cache.trena3DPainelRapidoOrdemGrupos && cache.trena3DPainelRapidoOrdemGrupos.length)
      ? cache.trena3DPainelRapidoOrdemGrupos
      : todos.map((g) => g.chave);
    const restantes = new Map(porChave);
    const lista = [];
    ordemSalva.forEach((chave) => {
      const g = restantes.get(chave);
      if (g) { lista.push(g); restantes.delete(chave); }
    });
    todos.forEach((g) => { if (restantes.has(g.chave)) lista.push(g); });
    if (incluirOcultos) return lista;
    const ocultos = new Set(cache.trena3DPainelRapidoGruposOcultos || []);
    return lista.filter((g) => !ocultos.has(g.chave));
  }

  /** [RODADA 130] HTML de UM grupo (espessura + cor(es)) — extraído de
   *  `_trena3DHtmlAjustesPainelRapido` pra poder ser reaproveitado
   *  IDENTICAMENTE pelo editor visual do modal de Configurações 3D
   *  (mapconfig.js). `idPrefixo` deixa os `id`s únicos quando o mesmo grupo
   *  aparece 2x na página (janelinha real + editor do modal, ao mesmo
   *  tempo) — o padrão (`'v3d-pr-aj-'`) é o já usado pela janelinha desde a
   *  Rodada 125. */
  _trena3DHtmlGrupoAjuste(g, idPrefixo = 'v3d-pr-aj-') {
    const idEsp = g.esp ? `${idPrefixo}${g.chave}-esp` : null;
    const espHtml = g.esp
      ? `<div id="${idEsp}" data-valor="${g.esp.fallback}" data-min="${g.esp.min}" data-max="${g.esp.max}" data-step="${g.esp.step || 0.2}" data-min-decimals="1" style="flex:0 0 auto"></div>`
      : '';
    const coresHtml = g.cores.map((c) => `<input type="color" id="${idPrefixo}${g.chave}-${c.sufixo}" value="${c.padrao}" title="${Utils.escapeHtml(c.titulo)}" style="width:20px; height:20px; border:none; padding:0; border-radius:3px; cursor:pointer; flex:0 0 auto">`).join('');
    // [RODADA 132] NOVO — botão-toggle "🔤" (mostrar/ocultar a caixa de
    // texto desta medida), ao lado dos botões de cor — só quando `g.texto`
    // existe (nem todo grupo tem uma caixa de texto própria: "Ponto médio" é
    // só uma esfera, "Prévia da medida" não tem texto persistido). Estado
    // visual (ativo/inativo) lido direto do cache do this._cfgAdapter no momento em
    // que o HTML é montado — resincronizado depois por
    // '_trena3DResyncAjustesPainelRapido'.
    const textoAtivoInicial = !g.texto || ((!!this._cfgAdapter && this._cfgAdapter._cache && this._cfgAdapter._cache[g.texto]) !== false);
    const textoBtn = g.texto
      ? `<button type="button" class="v3d-pr-aj-texto-btn" id="${idPrefixo}${g.chave}-texto" data-campo="${g.texto}" title="Mostrar/ocultar a caixa de texto desta medida" aria-pressed="${textoAtivoInicial ? 'true' : 'false'}" style="flex:0 0 auto; width:22px; height:20px; padding:0; border:none; border-radius:3px; cursor:pointer; font-size:12px; line-height:1; display:inline-flex; align-items:center; justify-content:center; background:${textoAtivoInicial ? 'rgba(126,216,255,0.35)' : 'rgba(255,255,255,0.08)'}; color:${textoAtivoInicial ? '#fff' : '#8a8f99'}">🔤</button>`
      : '';
    return `
          <div class="v3d-trena3d-pr-aj-grupo" data-grupo="${g.chave}" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin:3px 0">
            <span style="flex:1 1 auto; min-width:70px; color:#c7cbd4">${Utils.escapeHtml(g.rotulo)}</span>
            ${espHtml}
            ${coresHtml}
            ${textoBtn}
          </div>`;
  }

  _trena3DHtmlAjustesPainelRapido() {
    const grupos = this._trena3DGruposAjustesEfetivos();
    return `
      <details class="v3d-trena3d-pr-ajustes" style="width:100%; margin-top:4px; border-top:1px solid rgba(255,255,255,0.1); padding-top:4px; box-sizing:border-box; font-size:11px">
        <summary style="cursor:pointer; color:#9aa1ad; user-select:none">🎨 Espessura/cor/texto</summary>
        <div style="margin-top:4px">
          ${grupos.map((g) => this._trena3DHtmlGrupoAjuste(g)).join('')}
        </div>
      </details>`;
  }

  /** Liga os controles gerados por `_trena3DHtmlAjustesPainelRapido()` (ou,
   *  reaproveitado pelo editor do modal, por `_trena3DHtmlGrupoAjuste` de
   *  cada grupo isoladamente) aos mesmos campos de config das Configurações
   *  3D (`this._cfgAdapter.set`) — mesmo wiring, só que direto na janelinha (ou no
   *  editor do modal, quando `grupos`/`idPrefixo` são passados). */
  _trena3DWireAjustesPainelRapido(el, grupos, idPrefixo = 'v3d-pr-aj-') {
    if (!this._cfgAdapter || typeof this._cfgAdapter._montarBotaoTriplo !== 'function') return;
    const cfg = this._trena3DCfg();
    const listaGrupos = grupos || this._trena3DGruposAjustesEfetivos();
    const espessuraAtual = {
      trena3DEspessuraCm: cfg.espessuraCm,
      trena3DGhostEspessuraCm: cfg.ghostEstiloLinha?.espessuraCm,
      trena3DLinhaAncoraEspessuraCm: cfg.linhaAncoraEstiloLinha.espessuraCm,
      trena3DGuiaChaoEspessuraCm: cfg.guiaChaoEstiloLinha.espessuraCm,
      trena3DGuiaGradeEspessuraCm: cfg.guiaGradeEstiloLinha.espessuraCm,
    };
    listaGrupos.forEach((g) => {
      if (g.esp) {
        const id = `${idPrefixo}${g.chave}-esp`;
        const mount = el.querySelector(`#${id}`);
        if (mount) {
          mount.dataset.valor = Utils.clamp(Number(espessuraAtual[g.esp.campo]) || g.esp.fallback, g.esp.min, g.esp.max);
          this._cfgAdapter._montarBotaoTriplo(el, id, {
            step: g.esp.step || 0.2, minDecimals: 1, min: g.esp.min, max: g.esp.max, chave: id,
            aoCommit: (v) => ({ [g.esp.campo]: v || g.esp.fallback }),
          });
        }
      }
      g.cores.forEach((c) => {
        el.querySelector(`#${idPrefixo}${g.chave}-${c.sufixo}`)?.addEventListener('input', async (e) => {
          await this._cfgAdapter.set({ [c.campo]: e.target.value });
        });
      });
      // [RODADA 132] NOVO — botão-toggle da caixa de texto (ver
      // '_trena3DHtmlGrupoAjuste' acima).
      if (g.texto) {
        const btnTexto = el.querySelector(`#${idPrefixo}${g.chave}-texto`);
        btnTexto?.addEventListener('click', async () => {
          const atual = (this._cfgAdapter._cache?.[g.texto] ?? this._cfgAdapter.DEFAULTS?.[g.texto]) !== false;
          await this._cfgAdapter.set({ [g.texto]: !atual });
          this._trena3DAtualizarBotaoTextoAjuste(btnTexto, !atual);
        });
      }
    });
  }

  /** [RODADA 132] NOVO — aplica o estilo visual (ativo/inativo) do
   *  botão-toggle "🔤" de um grupo, reaproveitado pelo wiring (clique) e
   *  pelo resync (mudança vinda de fora, ex. Configurações 3D). */
  _trena3DAtualizarBotaoTextoAjuste(btn, ativo) {
    if (!btn) return;
    btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    btn.style.background = ativo ? 'rgba(126,216,255,0.35)' : 'rgba(255,255,255,0.08)';
    btn.style.color = ativo ? '#fff' : '#8a8f99';
  }

  /** Resincroniza os controles de `_trena3DHtmlAjustesPainelRapido()` com a
   *  config atual (chamado por `_trena3DAtualizarPainelRapido`, quando a
   *  config muda por qualquer outra via — ex. modal "Configurações 3D"). */
  _trena3DResyncAjustesPainelRapido(el, grupos, idPrefixo = 'v3d-pr-aj-') {
    if (!el || !this._cfgAdapter) return;
    const cache = this._cfgAdapter._cache || {};
    const def = this._cfgAdapter.DEFAULTS || {};
    const g = (k, fb) => (cache[k] !== undefined ? cache[k] : (def[k] !== undefined ? def[k] : fb));
    const listaGrupos = grupos || this._trena3DGruposAjustesEfetivos();
    listaGrupos.forEach((grupo) => {
      grupo.cores.forEach((c) => {
        const input = el.querySelector(`#${idPrefixo}${grupo.chave}-${c.sufixo}`);
        if (input && document.activeElement !== input) input.value = g(c.campo, c.padrao);
      });
      // [RODADA 132] NOVO — resincroniza o botão-toggle "🔤" (ver
      // '_trena3DHtmlGrupoAjuste'/'_trena3DWireAjustesPainelRapido' acima).
      if (grupo.texto) {
        const btnTexto = el.querySelector(`#${idPrefixo}${grupo.chave}-texto`);
        if (btnTexto) this._trena3DAtualizarBotaoTextoAjuste(btnTexto, g(grupo.texto, true) !== false);
      }
    });
  }

  _trena3DEnsurePainelRapido() {
    if (!this._cfgAdapter) return;
    // [19/09/2026 UTC] RODADA 218 — pedido verbatim: "Tanto a janela 'Trena
    // 3D' quanto o botão no canto inferior direito para reativá-la devem
    // ficar ativos, apenas quando a opção 'Trena 3D' estiver marcada (botão
    // 'Trena 3D' no rodapé do 'Ver em 3D')." CAUSA RAIZ: `isToolActive`
    // (passado pelo view3d.js como `() => this._buildTool === 'trena3d'`,
    // ver construtor no topo do arquivo) só era usado pro getter interno
    // `_buildTool` (linha ~87) — que controla clique/atalhos da MEDIÇÃO em
    // si — mas NUNCA era consultado aqui, então a janelinha de acesso rápido
    // e o botão de reabrir dependiam SÓ de `trena3DPainelRapidoAtivo` (opção
    // dentro de "⚙️ Configurações 3D"), aparecendo sempre, mesmo com a
    // ferramenta "📏 Trena 3D" do rodapé do "Ver em 3D" nunca selecionada.
    // Agora, com a ferramenta INATIVA, esconde os dois incondicionalmente
    // (sem tocar `_trena3DPainelRapidoFechadoManualmente`, pra não interferir
    // no fechamento manual de quando a ferramenta estiver ativa de novo) —
    // reagindo na hora, já que `_selectBuildTool` (view3d.js) chama este
    // método toda vez que a ferramenta ativa muda.
    const ferramentaTrena3DAtiva = this._opts.isToolActive ? !!this._opts.isToolActive() : true;
    if (!ferramentaTrena3DAtiva) {
      if (this._trena3DPainelRapidoEl) this._trena3DPainelRapidoEl.style.display = 'none';
      this._trena3DMostrarBotaoReabrirPainelRapido(false);
      return;
    }
    // [16/09/2026 UTC] NOVO — `trena3DPainelRapidoAtivo` vive nas
    // "Configurações 2D" (não faz parte do objeto retornado por
    // `_trena3DCfg()`, que só cobre a seção "📏 Trena 3D" das
    // Configurações 3D) — lido direto do cache do this._cfgAdapter.
    const painelAtivoCfg = (this._cfgAdapter._cache?.trena3DPainelRapidoAtivo ?? this._cfgAdapter.DEFAULTS?.trena3DPainelRapidoAtivo) !== false;
    const deveMostrar = painelAtivoCfg && !this._trena3DPainelRapidoFechadoManualmente;
    if (!deveMostrar) {
      if (this._trena3DPainelRapidoEl) this._trena3DPainelRapidoEl.style.display = 'none';
      // [16/09/2026 UTC] NOVO — pedido verbatim: "desativando a janelinha ao
      // clicar no seu botão de fechar, deve ter um botão para fazer ela
      // aparecer de novo. Para não ter que ir nas 'configurações 3D' de novo
      // só para habilitá-la."
      // [16/09/2026 UTC] MUDANÇA (RODADA 92) — pedido verbatim: "Ao
      // desativar a janelinha, nas 'configurações 3D', deve surgir o botão
      // no canto inferior direito [...] Tudo deve ser atado [...] botões
      // espelho." Antes, o botãozinho SÓ aparecia se `painelAtivoCfg` ainda
      // estivesse `true` (ou seja, só no fechamento manual pelo "✕" da
      // própria janelinha) — desligar a opção direto nas Configurações 3D
      // fazia a janelinha sumir SEM deixar nenhum jeito de reabri-la sem
      // voltar lá. Agora o botão aparece sempre que a janelinha não estiver
      // visível, por QUALQUER motivo (config desligada OU fechamento
      // manual) — ver também o `click` do botão logo abaixo, que agora
      // TAMBÉM liga `trena3DPainelRapidoAtivo` de volta, não só reabre.
      this._trena3DMostrarBotaoReabrirPainelRapido(true);
      return;
    }
    this._trena3DMostrarBotaoReabrirPainelRapido(false);
    if (this._trena3DPainelRapidoEl) { this._trena3DPainelRapidoEl.style.display = ''; this._trena3DAtualizarPainelRapido(); return; }
    const el = document.createElement('div');
    el.className = 'v3d-trena3d-painel-rapido';
    const posInicial = this._trena3DPainelRapidoPos || { top: 64, right: 12 };
    // [16/09/2026 UTC] MUDANÇA — pedido verbatim: "Faça-o ficar no canto da
    // tela do 'Ver em 3D', não no canto da tela do app (como está
    // atualmente)." Antes era `position:fixed` + `document.body` (relativo à
    // viewport inteira do navegador); agora é `position:absolute` + filho de
    // `this._container` (relativo à área do próprio "Ver em 3D"). Garante
    // que o container tenha `position:relative` (necessário pra
    // `position:absolute` dos filhos respeitar os limites dele, não da
    // viewport) só se ele ainda não tiver um `position` explícito — não
    // sobrescreve caso já exista algo definido via CSS/classe.
    if (this._container && !this._container.style.position) this._container.style.position = 'relative';
    // [16/09/2026 UTC] NOVO (RODADA 94) — pedido verbatim: "Deve ser
    // possível redimensionar a janelinha. Faça ela, por padrão, um pouco
    // mais larga de início [...] de modo que caiba os dois primeiros grupos
    // de botões no modo simples." LARGURA PADRÃO aumentada de 180px pra
    // 300px — os 2 primeiros grupos de `_trena3DOpcoesPainelRapido()`
    // ("Como funciona a ancoragem" + "Altura ao vivo") somam 4 botões de
    // ~28px + espaçamento; 300px dá espaço confortável pra eles ficarem
    // lado a lado (ou em no máximo 2 linhas curtas) mesmo no modo "simples"
    // (sem o texto do rótulo do grupo). `resize:both`+`overflow:auto`
    // escolhido em vez de um "handle" customizado — é a forma mais simples
    // de integrar redimensionamento em HTML/CSS puro, e não conflita com o
    // arraste já existente: o `pointerdown` abaixo agora ignora cliques nos
    // ~16px finais do canto inferior direito (onde o navegador desenha o
    // handle de resize nativo), deixando o comportamento nativo assumir ali
    // em vez de iniciar um arraste.
    // [16/09/2026 UTC] MUDANÇA (RODADA 96) — pedido verbatim: "A janelinha
    // não deve gerar scroll, deve travar ao não poder encolher mais. Todos
    // os botões tem de ficar visíveis." Trocado `overflow:auto` por
    // `overflow:hidden` (nunca mais aparece barra de rolagem); em troca, o
    // `min-width`/`min-height` passam a ser CALCULADOS DINAMICAMENTE a
    // partir do conteúdo real (`_trena3DAjustarLimitesPainelRapido`,
    // chamado logo abaixo e sempre que os botões são redesenhados), em vez
    // dos valores fixos pequenos de antes (160px/54px) — que permitiam
    // encolher além do que os botões precisavam, cortando-os sem scroll
    // pra compensar. Agora o handle nativo de `resize:both` simplesmente
    // trava antes de conseguir esconder qualquer botão.
    // [16/09/2026 UTC] MUDANÇA (RODADA 98) — pedido verbatim: "A janelinha
    // está com transição de movimento, remova isso. Deve ser imediato os
    // redimensionamentos. Deve ser possível redimensioná-la pelos 4
    // cantos, em baixo e os 2 lados." `transition:'none'` explícito (não
    // encontrada nenhuma regra `transition` no CSS visada especificamente
    // a esta janelinha, mas nenhuma outra causa concreta foi encontrada
    // pra 2 dos pedidos do usuário desta rodada além do fix em
    // `_trena3DAjustarLimitesPainelRapido` abaixo — reforço defensivo,
    // idêntico ao espírito do fix do HUD de performance na Rodada 97).
    // `resize:'both'` REMOVIDO (só permitia redimensionar pelo canto
    // inferior direito, e o handle nativo do navegador tem seu próprio
    // fluxo — não dava pra restringir a 7 direções específicas nem tirar
    // eventual esticamento de reflow com ele) — substituído por 7 handles
    // CUSTOMIZADOS (ver mais abaixo), um pra cada direção pedida (4 cantos
    // + embaixo + os 2 lados, sem o topo).
    Object.assign(el.style, {
      position: 'absolute', top: `${posInicial.top}px`,
      left: posInicial.left != null ? `${posInicial.left}px` : '',
      right: posInicial.left != null ? '' : `${posInicial.right}px`,
      zIndex: '2147483000', background: 'rgba(20,22,28,0.92)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '8px', padding: '4px 6px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
      userSelect: 'none', cursor: 'move', fontFamily: 'system-ui, sans-serif',
      width: `${this._trena3DPainelRapidoTamanho?.width || 300}px`,
      height: this._trena3DPainelRapidoTamanho?.height ? `${this._trena3DPainelRapidoTamanho.height}px` : 'auto',
      maxWidth: '480px', maxHeight: '70vh',
      overflow: 'hidden', boxSizing: 'border-box', transition: 'none',
    });
    // [16/09/2026 UTC] RODADA 103 — SIMPLIFICADO — pedido verbatim: "deve
    // ser possível fazer isso apenas pelas suas laterais, variando
    // manualmente a largura. A altura fica reajustada automaticamente pelo
    // reajustar dos botões." Os 7 handles da Rodada 98 (4 cantos + embaixo
    // + 2 lados) viraram só 2 — 'w'/'e' (os 2 lados) — REMOVIDOS os cantos
    // (nw/ne/sw/se) e o de baixo ('s'): não existe mais NENHUM jeito de
    // arrastar a altura manualmente. Ela passa a ser SEMPRE 'auto' (ver
    // `_trena3DAjustarLimitesPainelRapido`, também simplificado nesta
    // rodada) — só a LARGURA continua sendo escolha do usuário.
    const handlesHtml = [
      { dir: 'w', cursor: 'ew-resize', style: 'top:6px; bottom:6px; left:-3px; width:6px;' },
      { dir: 'e', cursor: 'ew-resize', style: 'top:6px; bottom:6px; right:-3px; width:6px;' },
    ].map((h) => `<div class="v3d-trena3d-pr-resize" data-resize-dir="${h.dir}" style="position:absolute; ${h.style} cursor:${h.cursor}; z-index:1;"></div>`).join('');
    el.innerHTML = `
      <div class="v3d-trena3d-pr-titulo" style="font-size:10px; line-height:1.3; color:#9aa1ad; padding:2px 4px 4px; white-space:normal">Mapa → Planta baixa → Ver em 3D → ⚙️3D → 📏 Trena 3D</div>
      <div style="display:flex; align-items:center; justify-content:flex-end; margin:-2px -2px 2px 0">
        <button type="button" data-pr-fechar="1" title="Fechar esta janelinha (some só nesta sessão do 3D — reabra em Configurações 2D → Trena 3D, ou entrando de novo no 3D)" style="cursor:pointer; border:none; background:transparent; color:#9aa1ad; font-size:13px; line-height:1; padding:2px 4px">✕</button>
      </div>
      <div class="v3d-trena3d-pr-botoes" style="display:flex; flex-wrap:wrap; gap:6px; width:100%; min-width:0; box-sizing:border-box"></div>
      ${this._trena3DHtmlAjustesPainelRapido()}
      ${handlesHtml}`;
    (this._container || document.body).appendChild(el);
    this._trena3DPainelRapidoEl = el;
    // [RODADA 130] Marca a assinatura de ordem/visibilidade já usada nesta
    // 1ª renderização, pra `_trena3DAtualizarPainelRapido` saber que ainda
    // não precisa refazer o bloco do zero na próxima chamada.
    const ajustesElInicial = el.querySelector('.v3d-trena3d-pr-ajustes');
    if (ajustesElInicial) ajustesElInicial.dataset.assinaturaGrupos = this._trena3DGruposAjustesEfetivos().map((g) => g.chave).join(',');
    el.querySelectorAll('.v3d-trena3d-pr-resize').forEach((h) => this._trena3DWireResizeHandle(el, h, h.dataset.resizeDir));
    this._trena3DWireAjustesPainelRapido(el);
    // [16/09/2026 UTC] NOVO (RODADA 94) — lê o tamanho salvo pelo usuário no
    // IndexedDB (assíncrono) e sobrescreve o padrão de 300px assim que
    // disponível — se não houver nada salvo ainda, fica no padrão novo.
    // [16/09/2026 UTC] RODADA 103 — SIMPLIFICADO — só a LARGURA é
    // customizável/persistida agora (ver comentário grande na criação dos
    // handles, acima) — a altura NUNCA é lida do IndexedDB nem aplicada
    // como valor fixo, fica sempre 'auto' (já é o valor inicial do
    // elemento, definido mais acima em `Object.assign(el.style,...)`).
    this._trena3DCarregarTamanhoPainelRapido().then((tamanho) => {
      if (!tamanho || !this._trena3DPainelRapidoEl) return;
      this._trena3DPainelRapidoTamanho = tamanho;
      if (tamanho.width) this._trena3DPainelRapidoEl.style.width = `${tamanho.width}px`;
      this._trena3DAjustarLimitesPainelRapido();
    }).catch(() => {});
    // [16/09/2026 UTC] NOVO (RODADA 94) — `ResizeObserver` detecta qualquer
    // mudança de tamanho do elemento — debounced (300ms) antes de persistir
    // no IndexedDB, pra não gravar a cada pixel arrastado. [16/09/2026 UTC]
    // MUDANÇA (RODADA 98) — antes disparava pelo `resize:both` nativo;
    // agora dispara pelas mudanças de `style.width/height` feitas pelos 7
    // handles customizados (`_trena3DWireResizeHandle`) — o
    // `ResizeObserver` em si não mudou, só a origem do redimensionamento.
    if (typeof ResizeObserver !== 'undefined') {
      let debounceId = null;
      this._trena3DPainelRapidoResizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        // [17/09/2026 UTC] CORRIGIDO — BUG relatado verbatim: "A janelinha
        // deve preservar as suas dimensões ao marcar/desmarcar 'Mostrar
        // janela de acesso rápido...'." CAUSA RAIZ: o `ResizeObserver`
        // continua "ligado" (`.observe(el)`) mesmo quando a janelinha está
        // escondida (`el.style.display='none'`, ver `_trena3DEnsurePainelRapido`
        // — desmarcar a opção NÃO desconecta o observer, só esconde o
        // elemento). Um elemento `display:none` reporta `contentRect` como
        // 0×0 pro navegador — então, no exato instante em que a janelinha
        // era escondida, este callback disparava com `entry.contentRect.width
        // === 0`, calculava uma largura "de mentira" de 12px (só o padding)
        // e, 300ms depois, GRAVAVA essa largura quebrada no IndexedDB
        // (`_trena3DSalvarTamanhoPainelRapido`) — destruindo a largura real
        // que o usuário tinha escolhido. Ao remarcar a opção, a janelinha
        // reaparecia, mas a largura persistida já estava corrompida (12px),
        // então na PRÓXIMA vez que fosse recarregada do zero (nova sessão do
        // "Ver em 3D") vinha minúscula. CORRIGIDO: ignora por completo
        // qualquer tick do observer enquanto a janelinha estiver escondida
        // (`display:'none'`) ou com `contentRect` vazio (0×0) — nem
        // recalcula `min-height` nem agenda gravação nenhuma nesses casos,
        // já que um elemento invisível não representa nenhuma dimensão real
        // escolhida pelo usuário.
        if (el.style.display === 'none' || entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return;
        const w = Math.round(entry.contentRect.width + 12); // +padding (box-sizing:border-box já inclui, mas contentRect é só o conteúdo)
        // [16/09/2026 UTC] NOVO (RODADA 96) — a cada tick do redimensionamento
        // (inclusive DURANTE o arrasto do handle nativo, não só ao soltar),
        // recalcula `min-height` a partir de `scrollHeight` do conteúdo NA
        // LARGURA ATUAL — como o `flex-wrap` já reflui os botões conforme a
        // largura (Rodada 95), `scrollHeight` já reflete corretamente
        // quantas linhas de botões cabem nessa largura específica. Setar
        // `min-height` de volta pro elemento faz o handle nativo de
        // `resize:both` recusar encolher mais na VERTICAL a partir do
        // próximo frame, antes que qualquer botão fique cortado (já que
        // `overflow:hidden` não teria mais uma barra de rolagem pra
        // compensar).
        // [16/09/2026 UTC] CORRIGIDO — BUG relatado verbatim: "O min-height
        // vai diminuindo muito devagar, era para ser o menor valor possível
        // imediatamente. Não sei se é um evento que fica atualizando em
        // passos em vez de dar um valor definitivo para a altura." CAUSA
        // RAIZ: EXATAMENTE isso — `this._trena3DPainelRapidoEl.scrollHeight`
        // é AUTORREFERENTE: um elemento com `min-height` já aplicado nunca
        // relata `scrollHeight` menor que o próprio `min-height` atual (é a
        // definição de "min-height" — um piso que a própria caixa não pode
        // ficar abaixo, então medir o `scrollHeight` DELA MESMA só pode
        // manter ou AUMENTAR o valor, nunca diminuir, mesmo que o conteúdo
        // precise de menos espaço agora). Resultado: a cada tick do
        // `ResizeObserver` (um por pixel arrastado), este código só conseguia
        // "travar" o `min-height` inflado que já estava ali — só encolhia de
        // verdade quando `_trena3DAjustarLimitesPainelRapido()` (chamado só
        // em MOMENTOS pontuais — abrir a janelinha, criar o mapa, etc., não a
        // cada tick de resize) rodava por fora e recalculava certo via clone
        // (que reseta `min-height:'0'` ANTES de medir, sem essa
        // autorreferência) — dando a impressão de "encolher em passos",
        // devagar, um pouco a cada vez que esse outro método por acaso
        // rodava. CORRIGIDO: chama `_trena3DAjustarLimitesPainelRapido()`
        // (a MESMA função que já calcula certo, via clone, sem
        // autorreferência) a cada tick, em vez de ler `scrollHeight` da
        // própria janelinha — o valor final correto passa a ser aplicado
        // IMEDIATAMENTE em qualquer tick, encolhendo ou crescendo, nunca mais
        // só "travando" o valor antigo.
        this._trena3DAjustarLimitesPainelRapido();
        clearTimeout(debounceId);
        debounceId = setTimeout(() => {
          // [16/09/2026 UTC] RODADA 103 — SIMPLIFICADO — só a LARGURA é
          // persistida agora (não existe mais handle vertical nenhum, ver
          // comentário grande na criação dos handles) — a altura nunca
          // mais é salva/aplicada como valor fixo.
          this._trena3DPainelRapidoTamanho = { width: w };
          this._trena3DSalvarTamanhoPainelRapido(w);
        }, 300);
      });
      this._trena3DPainelRapidoResizeObserver.observe(el);
    }
    // Arrastar — clicar em QUALQUER parte da janelinha exceto botões (o "✕"
    // e os ícones de opção, ambos elementos <button>) já move ela.
    // [16/09/2026 UTC] MUDANÇA — limites do arraste agora são o
    // `getBoundingClientRect()` do `this._container` (a área do "Ver em 3D"),
    // não mais `window.innerWidth/innerHeight` (a viewport inteira), já que a
    // janelinha passou a ser `position:absolute` dentro dele.
    let arrastando = null;
    el.addEventListener('pointerdown', (e) => {
      // [16/09/2026 UTC] MUDANÇA (RODADA 98) — antes ignorava só os ~16px
      // do canto inferior direito (onde o `resize:both` nativo desenhava
      // seu handle); agora que o resize é feito por 7 `<div>`s dedicados
      // (`.v3d-trena3d-pr-resize`, ver acima), basta ignorar cliques
      // NELES (e nos botões, como já era) — cada handle tem seu próprio
      // `pointerdown` (`_trena3DWireResizeHandle`) que faz `stopPropagation`
      // de qualquer forma, mas o check aqui evita até começar um arraste
      // de posição por engano nesse meio tempo.
      // [17/09/2026 UTC] CORRIGIDO (RODADA 127) — pedido verbatim: "A parte
      // das cores não está sendo possível acessar na janelinha. Clico em
      // cima, porém é tomado como sendo mover a janela." CAUSA: este guard
      // só ignorava botões (`<button>`) e os handles de resize — o bloco
      // "🎨 Espessura/cores" (RODADA 125, `.v3d-trena3d-pr-ajustes`) tem
      // `<input type="color">`, `<summary>` (do `<details>`) e os botões
      // triplos (que são `<button>`, já cobertos), mas o próprio `<details>`/
      // `<summary>`/`<input type="color">` não são `<button>` e por isso
      // qualquer clique neles (inclusive só pra abrir/fechar o `<details>`)
      // iniciava um arraste da janelinha inteira em vez de interagir com o
      // controle. Ignora agora qualquer clique dentro de
      // `.v3d-trena3d-pr-ajustes` por inteiro (cobre o `<summary>`, os
      // `<input type="color">` e qualquer outro controle futuro desse
      // bloco), além de continuar ignorando `<button>`/handles de resize.
      // [RODADA 134] CORRIGIDO -- pedido verbatim: "na parte de baixo
      // (nas cores), deveria ser possível clicar e arrastar em toda
      // janela exceto os botões para poder movê-la, porém, nesta região,
      // a região das cores isto não está funcionando." CAUSA: igual ao
      // bug já corrigido no editor de grupos do modal (RODADA 133) --
      // este guard excluía TODO o bloco `.v3d-trena3d-pr-ajustes`
      // (rótulo + espessura + cores + texto de cada grupo) da área que
      // inicia o arraste de POSIÇÃO da janelinha inteira, sobrando só os
      // <button>/handles de resize como exceção -- clicar no rótulo do
      // grupo ou no espaço vazio ao redor das cores não movia a
      // janelinha. CORRIGIDO: em vez de excluir a `div` inteira, exclui
      // só os controles que precisam do próprio clique (`input
      // type="color"`, o campo numérico "botão triplo" `.m3d-numfield`
      // e `<summary>`, que abre/fecha o `<details>`) -- o resto da
      // janelinha (inclusive a região das cores, fora dos círculos em
      // si) volta a iniciar o arraste normalmente.
      if (e.target.closest('button') || e.target.closest('.v3d-trena3d-pr-resize') || e.target.closest('input[type="color"]') || e.target.closest('.m3d-numfield') || e.target.closest('summary')) return;
      const rect = el.getBoundingClientRect();
      arrastando = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!arrastando) return;
      const contRect = (this._container || document.body).getBoundingClientRect();
      const left = Math.max(0, Math.min(contRect.width - 40, e.clientX - contRect.left - arrastando.dx));
      const top = Math.max(0, Math.min(contRect.height - 24, e.clientY - contRect.top - arrastando.dy));
      el.style.left = `${left}px`; el.style.right = '';
      el.style.top = `${top}px`;
      this._trena3DPainelRapidoPos = { left, top };
    });
    const pararArraste = () => { arrastando = null; };
    el.addEventListener('pointerup', pararArraste);
    el.addEventListener('pointercancel', pararArraste);
    el.querySelector('[data-pr-fechar]').addEventListener('click', () => {
      this._trena3DPainelRapidoFechadoManualmente = true;
      el.style.display = 'none';
      this._trena3DMostrarBotaoReabrirPainelRapido(true);
    });
    this._trena3DAtualizarPainelRapido();
  }

  /** [16/09/2026 UTC] RODADA 103 — SIMPLIFICADO — pedido verbatim: "deve
   *  ser possível fazer isso apenas pelas suas laterais, variando
   *  manualmente a largura. A altura fica reajustada automaticamente."
   *  Antes (Rodada 98/102) `dir` podia ser qualquer combinação de
   *  's'/'w'/'e'/'n' (7 handles: 4 cantos + embaixo + 2 lados) — agora só
   *  existem os 2 handles dos lados ('w'/'e', ver `_trena3DEnsurePainelRapido`),
   *  então `dir` é sempre exatamente 'w' OU 'e', nunca mais com componente
   *  vertical nenhum. Toda a lógica de `height`/`top` (`dir.includes('s')`/
   *  `dir.includes('n')`) foi removida — a altura nunca é tocada por este
   *  método, fica inteiramente a cargo de `style.height:'auto'`
   *  (`_trena3DAjustarLimitesPainelRapido` recalcula só `min-height`).
   *  Ajusta `left` (não `top`) quando a direção é 'w' (esquerda) — já que a
   *  origem do elemento é o canto superior esquerdo, resize pela esquerda
   *  precisa mover essa origem pra manter o canto direito fixo. Respeita
   *  `min-width`/`max-width` já calculados (ver
   *  `_trena3DAjustarLimitesPainelRapido`) via `Utils.clamp`, e SEM
   *  nenhuma `transition` — a mudança de `style.width/left` é aplicada
   *  direto a cada `pointermove`, sem animação. */
  _trena3DWireResizeHandle(el, handle, dir) {
    let estado = null;
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); // não deixa o `pointerdown` do painel (arraste de posição) também disparar
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      estado = { startX: e.clientX, startW: rect.width, startLeft: rect.left };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!estado) return;
      const contRect = (this._container || document.body).getBoundingClientRect();
      const minW = parseFloat(el.style.minWidth) || 140;
      const maxW = parseFloat(el.style.maxWidth) || 480;
      const dx = e.clientX - estado.startX;
      if (dir === 'e') {
        el.style.width = `${Utils.clamp(estado.startW + dx, minW, maxW)}px`;
      } else if (dir === 'w') {
        const novaLargura = Utils.clamp(estado.startW - dx, minW, maxW);
        const novoLeft = estado.startLeft - contRect.left + (estado.startW - novaLargura);
        el.style.width = `${novaLargura}px`;
        el.style.left = `${Math.max(0, novoLeft)}px`;
        el.style.right = '';
        this._trena3DPainelRapidoPos = { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
      }
    });
    const finalizar = (e) => {
      if (!estado) return;
      estado = null;
      try { handle.releasePointerCapture(e.pointerId); } catch (_e) { /* já solto, ignora */ }
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      this._trena3DPainelRapidoTamanho = { width: w };
      this._trena3DSalvarTamanhoPainelRapido(w);
    };
    handle.addEventListener('pointerup', finalizar);
    handle.addEventListener('pointercancel', finalizar);
  }

  /** [16/09/2026 UTC] NOVO (RODADA 94) — wrapper mínimo de IndexedDB só pra
   *  persistir o tamanho (largura/altura) da janelinha de acesso rápido,
   *  redimensionada manualmente pelo usuário via `resize:both` — pedido
   *  verbatim: "o valor de redimensionamento deve ser guardado no IndexedDB
   *  para ser retomado em um próximo recarregar de página [...] não
   *  localStorage." Banco `catalogacao-itens-db` (nome dedicado, não
   *  reaproveita nenhum outro banco do app — evita qualquer risco de
   *  colidir com um `onupgradeneeded` de outro módulo que já tenha uma
   *  versão própria), object store `trena3d-painel-rapido`, chave fixa
   *  `tamanho`. Aberto/fechado a cada operação (não mantido aberto entre
   *  chamadas) — uso raro o bastante (só ao criar a janelinha e, no máximo,
   *  1x a cada 300ms enquanto o usuário arrasta o handle de resize) pra não
   *  justificar gerenciar uma conexão persistente. */
  _trena3DAbrirDBPainelRapido() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponível')); return; }
      const req = indexedDB.open('catalogacao-itens-db', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('trena3d-painel-rapido')) {
          db.createObjectStore('trena3d-painel-rapido');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  /** [16/09/2026 UTC] NOVO (RODADA 96) — pedido verbatim: "E o 'Agrupado' e
   *  o 'Simples', cada um deve ter suas próprias dimensões." Antes, uma
   *  chave FIXA ('tamanho') guardava um único tamanho pra QUALQUER modo —
   *  redimensionar no modo "simples" (mais compacto, sem texto de rótulo)
   *  também afetava o modo "agrupado" (precisa de mais espaço pros
   *  rótulos) e vice-versa. Agora a chave é `tamanho-agrupado` ou
   *  `tamanho-simples`, conforme `trena3DPainelRapidoModo` atual — cada
   *  modo lembra seu próprio tamanho customizado, independente do outro. */
  _trena3DChaveTamanhoPainelRapido() {
    const modo = (this._cfgAdapter?._cache?.trena3DPainelRapidoModo ?? this._cfgAdapter?.DEFAULTS?.trena3DPainelRapidoModo) === 'simples' ? 'simples' : 'agrupado';
    return `tamanho-${modo}`;
  }
  // [16/09/2026 UTC] RODADA 103 — SIMPLIFICADO — pedido verbatim: "deve
  // ser possível fazer isso apenas pelas suas laterais, variando
  // manualmente a largura. A altura fica reajustada automaticamente."
  // Removido o `alturaCustomizada`/`height` da Rodada 102 (não existe mais
  // NENHUM handle vertical — a altura nunca mais é escolha do usuário, é
  // sempre 'auto') — só a LARGURA é salva/restaurada agora.
  async _trena3DSalvarTamanhoPainelRapido(width) {
    try {
      const chave = this._trena3DChaveTamanhoPainelRapido();
      const db = await this._trena3DAbrirDBPainelRapido();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('trena3d-painel-rapido', 'readwrite');
        tx.objectStore('trena3d-painel-rapido').put({ width }, chave);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (e) {
      // Sem navegador/IndexedDB indisponível (ex. modo privado com bloqueio
      // total de storage) — falha silenciosa, a janelinha continua
      // funcionando normalmente, só não persiste o tamanho entre sessões.
    }
  }
  async _trena3DCarregarTamanhoPainelRapido() {
    try {
      const chave = this._trena3DChaveTamanhoPainelRapido();
      const db = await this._trena3DAbrirDBPainelRapido();
      const tamanho = await new Promise((resolve, reject) => {
        const tx = db.transaction('trena3d-painel-rapido', 'readonly');
        const req = tx.objectStore('trena3d-painel-rapido').get(chave);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return tamanho;
    } catch (e) {
      return null;
    }
  }

  /** [16/09/2026 UTC] NOVO — botãozinho flutuante que aparece só depois de
   *  fechar a janelinha de acesso rápido pelo "✕" dela (ver
   *  `_trena3DEnsurePainelRapido` acima) — clicar nele reabre a janelinha na
   *  hora, sem precisar abrir as Configurações 3D de novo só pra religar a
   *  opção. Fica fixo num canto discreto (canto inferior direito), bem
   *  pequeno — o mesmo espírito "pequeno simples e prático" da janelinha. */
  /** [16/09/2026 UTC] RODADA 101 -- NOVO -- ver comentário grande em
   *  `mount()` sobre a causa raiz do scroll vazando na tela "Ver em 3D".
   *  Chamado pelo `ResizeObserver` de `this._container` sempre que ele
   *  muda de tamanho (ex. redimensionar a janela do navegador) -- garante
   *  que a janelinha de acesso rápido continue com `left+width`/
   *  `top+height` dentro dos limites ATUAIS do container, empurrando-a de
   *  volta pra dentro se necessário (nunca aumenta o tamanho dela, só
   *  reposiciona). Não faz nada se a janelinha não existir (fechada/nunca
   *  aberta) — não força ela a aparecer. */
  _trena3DClampPainelRapidoNoContainer() {
    const el = this._trena3DPainelRapidoEl;
    const cont = this._container;
    if (!el || !cont) return;
    const contRect = cont.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const larguraMax = Math.max(0, contRect.width - elRect.width);
    const alturaMax = Math.max(0, contRect.height - elRect.height);
    // A janelinha pode estar posicionada por `left`/`top` OU por
    // `right`/`top` (canto padrão inicial, ver `posInicial` em
    // `_trena3DEnsurePainelRapido`) — normaliza pra `left`/`top` absolutos
    // relativos ao container antes de clampar, evitando 2 caminhos de
    // cálculo divergentes.
    let left = el.style.left ? parseFloat(el.style.left) : (contRect.width - (el.style.right ? parseFloat(el.style.right) : 0) - elRect.width);
    let top = el.style.top ? parseFloat(el.style.top) : 0;
    if (!Number.isFinite(left)) left = 0;
    if (!Number.isFinite(top)) top = 0;
    const novoLeft = Utils.clamp(left, 0, larguraMax);
    const novoTop = Utils.clamp(top, 0, alturaMax);
    if (novoLeft !== left || el.style.right) { el.style.left = `${novoLeft}px`; el.style.right = ''; }
    if (novoTop !== top) el.style.top = `${novoTop}px`;
    this._trena3DPainelRapidoPos = { left: novoLeft, top: novoTop };
  }

  _trena3DMostrarBotaoReabrirPainelRapido(mostrar) {
    if (!mostrar) {
      if (this._trena3DBotaoReabrirEl) this._trena3DBotaoReabrirEl.style.display = 'none';
      return;
    }
    if (this._trena3DBotaoReabrirEl) { this._trena3DBotaoReabrirEl.style.display = ''; return; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v3d-trena3d-painel-rapido-reabrir';
    btn.textContent = '📏';
    btn.title = 'Reabrir a janelinha de acesso rápido da Trena 3D';
    // [16/09/2026 UTC] ENDURECIDO — pedido verbatim (rodada seguinte):
    // "Não estou vendo o botãozinho flutuante". Sem navegador nesta sessão
    // pra reproduzir, então a mitigação é defensiva: `zIndex` bem mais alto
    // (era '20', mesmo valor da janelinha — se algo do 3D ficar por cima
    // com um z-index maior, ambos sofreriam, mas o botão é pequeno e fácil
    // de ficar atrás de qualquer painel/HUD que já exista) e
    // `display:flex`+centralização explícita (o emoji sozinho sem
    // `align-items`/`justify-content` pode renderizar deslocado dependendo
    // da fonte do sistema).
    // [16/09/2026 UTC] MUDANÇA — pedido verbatim: "Faça-o ficar no canto da
    // tela do 'Ver em 3D', não no canto da tela do app (como está
    // atualmente)." Mesma mudança da janelinha acima: `position:absolute` +
    // filho de `this._container`, ao invés de `position:fixed` + `document.body`.
    if (this._container && !this._container.style.position) this._container.style.position = 'relative';
    Object.assign(btn.style, {
      position: 'absolute', bottom: '14px', right: '14px', zIndex: '2147483000',
      width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
      border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(20,22,28,0.92)',
      color: '#c7cbd4', fontSize: '15px', boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0',
    });
    btn.addEventListener('click', () => {
      this._trena3DPainelRapidoFechadoManualmente = false;
      this._trena3DMostrarBotaoReabrirPainelRapido(false);
      // [16/09/2026 UTC] NOVO (RODADA 92) — pedido verbatim: "o botão de
      // reabrir, ao ser clicado, deve tanto reabrir a janelinha quanto
      // marcar trena3DPainelRapidoAtivo=true de volta (e refletir isso no
      // checkbox das configurações 3D, já que pediu reciprocidade total)."
      // Cobre o caso do botão ter aparecido por causa da opção
      // `trena3DPainelRapidoAtivo` estar desligada (não só por fechamento
      // manual) — sem isto, clicar aqui reabriria a janelinha só nesta
      // sessão, mas ela sumiria nu na próxima vez (`_trena3DEnsurePainelRapido`
      // continuaria vendo `painelAtivoCfg === false`). `this._cfgAdapter.set`
      // dispara `onChange` pra todo mundo (inclusive o próprio
      // `_onMapConfigChange` deste arquivo e o resync novo do modal de
      // Configurações, ver mapconfig.js) — os checkboxes correspondentes
      // (Configurações 2D e 3D) se atualizam sozinhos, sem código extra
      // aqui.
      if (!!this._cfgAdapter) this._cfgAdapter.set({ trena3DPainelRapidoAtivo: true });
      this._trena3DEnsurePainelRapido();
    });
    (this._container || document.body).appendChild(btn);
    this._trena3DBotaoReabrirEl = btn;
  }

  /** Lista de opções booleanas da "📏 Trena 3D" cobertas pela janelinha de
   *  acesso rápido (ver `_trena3DEnsurePainelRapido` acima) — cada uma vira
   *  1 botão/ícone. `campo` é a chave salva em this._cfgAdapter (sem o prefixo
   *  `trena3D`), `icone` é o texto curto do botão (emoji quando existe um
   *  óbvio, texto curto quando não) e `titulo` é a descrição completa
   *  (tooltip, via `title` do `<button>` — "imprimir texto apenas se
   *  necessário" ficou assim: o botão em si só tem o ícone, o texto some
   *  no hover). */
  /** [16/09/2026 UTC] NOVO (RODADA 90) — cada opção ganhou `grupo`, o nome
   *  da subseção de Configurações 3D de onde ela vem (pedido verbatim: "Na
   *  janelinha, agrupe, visualmente, os botões que pertencem a mesma
   *  subseção.") — usado por `_trena3DAtualizarPainelRapido` pra desenhar
   *  os botões em sub-containers separados por grupo, em vez de todos
   *  soltos num `flex-wrap` só. A ORDEM da lista já segue a ordem das
   *  próprias subseções em Configurações 3D — grupos consecutivos na lista
   *  ficam visualmente agrupados na janelinha também.
   *  [16/09/2026 UTC] MUDANÇA — pedido verbatim: "Agora não precisa mais
   *  agrupar os botões por subseção e sim por funções. As três flags devem
   *  ficar juntas em um mesmo grupo." O `grupo` deixa de ser garantidamente
   *  "o nome da subseção de onde o campo vem" (regra antiga acima) — agora é
   *  livre pra refletir a FUNÇÃO da opção, podendo juntar campos de
   *  subseções diferentes no mesmo grupo (como já era feito, como EXCEÇÃO
   *  pontual, com `GuiaGradeFinalizada`/`MostrarLinhasAncoraFinalizada` —
   *  agora essa junção é a regra, não mais uma exceção). Concretamente
   *  nesta rodada: as 3 opções "flag" que mantêm alguma guia/linha visível
   *  DEPOIS de uma medida já finalizada (`GuiaChaoFinalizada`,
   *  `MostrarLinhasAncoraFinalizada`, `GuiaGradeFinalizada` — cada uma de
   *  uma subseção diferente: "Guia rente ao chão", "Linhas verticais
   *  ancoradas" e "Linhas guia da grade do mundo") passam a compartilhar 1
   *  único grupo funcional. A ORDEM dentro da lista continua a mesma ordem
   *  em que essas 3 opções aparecem em Configurações 3D (de cima pra
   *  baixo, pela ordem das próprias subseções).
   *  [18/09/2026 UTC] REVERTIDO PARCIALMENTE (RODADA 151) — pedido verbatim
   *  do usuário passou a pedir o INVERSO para justamente essas 3 flags
   *  "*Finalizada": `GuiaChaoFinalizada` voltou a agrupar com
   *  `MostrarGuiaChaoAoVivo` ("Guia rente ao chão") e `GuiaGradeFinalizada`
   *  voltou a agrupar com `GuiaGradeAtiva`/`GuiaGradeAposPrimeiroPonto`
   *  ("Linhas guia da grade do mundo") — ou seja, de volta a agrupamento
   *  POR SUBSEÇÃO pra essas duas, não mais por função. Só
   *  `MostrarLinhasAncoraFinalizada` continua sozinha no grupo funcional
   *  antigo ("Guias depois de finalizar a medida", agora com 1 item só) —
   *  a regra de "agrupar por função" (parágrafo acima) continua válida
   *  como PADRÃO geral pra `grupo` (ainda é assim que várias outras opções
   *  desta lista foram agrupadas), só não se aplica mais a este caso
   *  específico. */
  /** [19/09/2026 UTC] RODADA 191 — dados (ícones/rótulos/grupos) movidos
   *  pra `js/trena3d-icons.js` (`window.TRENA3D_ICONS_PAINEL_RAPIDO`) —
   *  pedido verbatim: "Ícones, CSS, tudo deve ficar modular e em
   *  arquivos separados." Este método só devolve essa lista (ou uma
   *  passada via `opts.iconesPainelRapido` no construtor, pra quem for
   *  reaproveitar esta classe noutro site com seu PRÓPRIO conjunto de
   *  ícones/opções, sem precisar editar este arquivo). */
  _trena3DOpcoesPainelRapido() {
    return this._opts.iconesPainelRapido || (typeof window !== 'undefined' ? (window.TRENA3D_ICONS_PAINEL_RAPIDO || []) : []);
  }

  /** [16/09/2026 UTC] NOVO — pedido verbatim: "Na subseção da janelinha,
   *  deve ser possível selecionar os botões e a ordem em que eles vão ficar
   *  na janela." Aplica, por cima da lista "de código"
   *  (`_trena3DOpcoesPainelRapido`), a customização do usuário:
   *  `trena3DPainelRapidoOcultos` (campos que ele desmarcou, ver mapconfig.js
   *  "Janela de acesso rápido") remove itens da lista, e
   *  `trena3DPainelRapidoOrdem` reordena o que sobrou. Um `campo` que exista
   *  em `trena3DPainelRapidoOrdem` mas NÃO exista mais na lista de código
   *  (opção removida numa rodada futura) é simplesmente ignorado — nunca dá
   *  erro. Um `campo` que exista na lista de código mas AINDA NÃO tenha
   *  posição salva em `trena3DPainelRapidoOrdem` (opção nova, criada depois
   *  da última vez que o usuário reordenou) entra no FINAL, na mesma ordem
   *  relativa que já tinha na lista de código — nunca "some" da janelinha
   *  por causa de uma reordenação anterior que não sabia que ele existia. */
  _trena3DOpcoesPainelRapidoEfetivas() {
    const todas = this._trena3DOpcoesPainelRapido();
    const ocultos = new Set((this._cfgAdapter?._cache?.trena3DPainelRapidoOcultos ?? this._cfgAdapter?.DEFAULTS?.trena3DPainelRapidoOcultos) || []);
    const visiveis = todas.filter((opt) => !ocultos.has(opt.campo));
    const ordem = (this._cfgAdapter?._cache?.trena3DPainelRapidoOrdem ?? this._cfgAdapter?.DEFAULTS?.trena3DPainelRapidoOrdem) || [];
    if (!ordem.length) return visiveis;
    const porCampo = new Map(visiveis.map((opt) => [opt.campo, opt]));
    const resultado = [];
    ordem.forEach((campo) => {
      const opt = porCampo.get(campo);
      if (opt) { resultado.push(opt); porCampo.delete(campo); }
    });
    // Sobras (opções novas, ainda sem posição salva) — mantém a ordem
    // relativa original da lista de código, no final.
    visiveis.forEach((opt) => { if (porCampo.has(opt.campo)) resultado.push(opt); });
    return resultado;
  }

  /** Redesenha o conteúdo dos botões da janelinha (ver acima) a partir da
   *  config atual — chamado ao criar a janelinha e a cada mudança de config
   *  (`_onMapConfigChange`), pra refletir também mudanças feitas direto nas
   *  Configurações 3D (não só clique nela mesma).
   *  [17/09/2026 UTC] REESCRITO (RODADA 113) — pedido verbatim (correção da
   *  animação da RODADA 110): "a animação do aparecer/reaparecer dos botões
   *  na janelinha [...] deve ser por passos. Desaparece, ficando vazio por
   *  alguns milisegundos, depois, os botões do lado [...] 'deslizam para o
   *  lado'. Sobre o aparecer, é o contrário, 1º, os botões deslizam para o
   *  lado [...] para abrir um espaço para que o botão que acabou de ser
   *  ativado naquela posição possa ficar ali. Fica alguns milisegundos
   *  vazio, depois, o botão que acabou de ser ativado vai surgindo do seu
   *  centro." A versão anterior encolhia o botão sumindo E reconstruía os
   *  vizinhos NO MESMO INSTANTE (tudo simultâneo) — esta versão quebra em
   *  fases sequenciais de verdade, cada uma só começando depois que a
   *  anterior termina, usando a técnica FLIP (First-Last-Invert-Play, ver
   *  `_trena3DFlipCapturarPosicoes`/`_trena3DFlipAnimarParaPosicoesNovas`
   *  logo abaixo) pra fazer os botões vizinhos "deslizarem" de verdade
   *  quando o espaço abre/fecha, em vez de só "pularem" pro lugar novo.
   *  Todo o HTML de fato (grupos, botão de modo de ancoragem, cada botão de
   *  opção) foi extraído pra `_trena3DConstruirConteudoPainelRapido`
   *  (definida logo abaixo), chamada uma vez por fase — cada fase passa o
   *  `Set` de `campo`s que devem existir no DOM naquele instante (e, opcionalmente,
   *  quais desses devem nascer "invisíveis", só ocupando espaço no layout
   *  sem aparecer ainda). */
  _trena3DAtualizarPainelRapido() {
    const el = this._trena3DPainelRapidoEl;
    if (!el || el.style.display === 'none') return;
    // [17/09/2026 UTC] NOVO (RODADA 125) — resincroniza os controles de
    // espessura/cor do bloco "🎨 Espessura/cores" (ver
    // `_trena3DHtmlAjustesPainelRapido`) com a config atual, caso ela tenha
    // mudado por outra via (ex. modal "Configurações 3D").
    // [RODADA 130] Se a ORDEM/VISIBILIDADE dos grupos mudou (editada pelo
    // usuário na subseção "Janela de acesso rápido" → "🐵 Mostrar botões da
    // janelinha"), o bloco inteiro precisa ser refeito do zero — resync
    // sozinho só atualiza valores de cor de elementos que já existem no DOM
    // na ordem antiga.
    const gruposAtuais = this._trena3DGruposAjustesEfetivos();
    const assinaturaGrupos = gruposAtuais.map((g) => g.chave).join(',');
    const ajustesEl = el.querySelector('.v3d-trena3d-pr-ajustes');
    if (!ajustesEl || ajustesEl.dataset.assinaturaGrupos !== assinaturaGrupos) {
      const novoHtml = this._trena3DHtmlAjustesPainelRapido();
      if (ajustesEl) ajustesEl.outerHTML = novoHtml; else el.insertAdjacentHTML('beforeend', novoHtml);
      const novoAjustesEl = el.querySelector('.v3d-trena3d-pr-ajustes');
      if (novoAjustesEl) novoAjustesEl.dataset.assinaturaGrupos = assinaturaGrupos;
      this._trena3DWireAjustesPainelRapido(el);
    }
    this._trena3DResyncAjustesPainelRapido(el);
    const wrap = el.querySelector('.v3d-trena3d-pr-botoes');
    if (!wrap) return;

    const camposVisiveisAntes = this._trena3DPainelRapidoCamposVisiveis || null;
    const novosCampos = new Set(this._trena3DOpcoesPainelRapidoEfetivas().map((opt) => opt.campo));

    // Uma nova chamada chegou enquanto uma coreografia de fases anterior
    // ainda estava rodando (ex.: usuário clicou em 2 chips bem rápido) —
    // cancela o passo pendente. O novo diff (calculado logo abaixo, contra
    // `camposVisiveisAntes` que reflete o ÚLTIMO ESTADO VISUAL CONHECIDO,
    // não necessariamente o que estava no meio da animação cancelada) parte
    // do resultado já aplicado até agora, então não há "salto" — só a
    // continuação fica mais rápida que o usuário esperava, o que é
    // preferível a duas coreografias se atropelando.
    if (this._trena3DPainelRapidoFaseTimer) {
      clearTimeout(this._trena3DPainelRapidoFaseTimer);
      this._trena3DPainelRapidoFaseTimer = null;
    }

    const removidos = camposVisiveisAntes ? [...camposVisiveisAntes].filter((c) => !novosCampos.has(c)) : [];
    const adicionados = camposVisiveisAntes ? [...novosCampos].filter((c) => !camposVisiveisAntes.has(c)) : [];
    this._trena3DPainelRapidoCamposVisiveis = novosCampos;

    if (!camposVisiveisAntes || (!removidos.length && !adicionados.length)) {
      // 1ª renderização (nada a comparar ainda) OU uma mudança de config
      // que não altera QUAIS campos aparecem (ex.: trocou o modo de
      // ancoragem, ou o modo agrupado/simples) — desenha direto, sem
      // coreografia (não há nada "aparecendo"/"sumindo" pra animar).
      this._trena3DConstruirConteudoPainelRapido(wrap, novosCampos, null);
      this._trena3DAjustarLimitesPainelRapido();
      return;
    }

    const DUR_ENCOLHER = 180; // = duração de `.footernav-btn-swap-out` (css/style.css)
    const PAUSA_VAZIO = 90; // "ficando vazio por alguns milisegundos"
    const DUR_DESLIZE = 220; // duração do "deslizar" FLIP dos vizinhos
    const semAdicionadosAinda = new Set([...novosCampos].filter((c) => !adicionados.includes(c)));

    // FASE de "sumir": fecha o espaço que os botões removidos deixam,
    // deslizando os vizinhos — chamada depois do encolher+pausa (removidos)
    // ou direto, se não havia nenhum removido nesta chamada.
    const faseFecharGapDosRemovidos = () => {
      const rectsAntes = this._trena3DFlipCapturarPosicoes(wrap);
      this._trena3DConstruirConteudoPainelRapido(wrap, semAdicionadosAinda, null);
      this._trena3DFlipAnimarParaPosicoesNovas(wrap, rectsAntes, DUR_DESLIZE);
      this._trena3DAjustarLimitesPainelRapido();
      this._trena3DPainelRapidoFaseTimer = setTimeout(faseAbrirGapProsAdicionados, adicionados.length ? DUR_DESLIZE : 0);
    };

    // FASE de "aparecer", passo 1: os botões adicionados entram no DOM (na
    // posição/grupo final deles) porém INVISÍVEIS (`opacity:0`) — só de
    // ocupar espaço no layout, isso já empurra os vizinhos, que deslizam
    // (FLIP) da posição antiga pra nova.
    const faseAbrirGapProsAdicionados = () => {
      if (!adicionados.length) { this._trena3DPainelRapidoFaseTimer = null; return; }
      const rectsAntes = this._trena3DFlipCapturarPosicoes(wrap);
      this._trena3DConstruirConteudoPainelRapido(wrap, novosCampos, new Set(adicionados));
      this._trena3DFlipAnimarParaPosicoesNovas(wrap, rectsAntes, DUR_DESLIZE);
      this._trena3DAjustarLimitesPainelRapido();
      this._trena3DPainelRapidoFaseTimer = setTimeout(faseCrescerAdicionados, DUR_DESLIZE + PAUSA_VAZIO);
    };

    // FASE de "aparecer", passo 2 (depois da pausa vazia): o(s) botão(ões)
    // recém-ativado(s) finalmente aparece(m), crescendo do próprio centro
    // (`.footernav-btn-swap-in`, mesma animação de sempre).
    const faseCrescerAdicionados = () => {
      adicionados.forEach((campo) => {
        const btn = wrap.querySelector(`button[data-pr-campo="${campo}"]`);
        if (!btn) return;
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
        btn.classList.add('footernav-btn-swap-in');
        btn.addEventListener('animationend', () => btn.classList.remove('footernav-btn-swap-in'), { once: true });
      });
      this._trena3DPainelRapidoFaseTimer = null;
    };

    if (removidos.length) {
      // FASE de "sumir", passo 1: o(s) botão(ões) desativado(s) encolhe(m)
      // NO PRÓPRIO LUGAR (`.footernav-btn-swap-out`, mesma animação de
      // sempre) — ainda ocupando o espaço deles no layout (opacity some,
      // mas a "caixa" continua lá), então nada mais se move ainda.
      removidos.forEach((campo) => {
        const btn = wrap.querySelector(`button[data-pr-campo="${campo}"]`);
        if (!btn) return;
        btn.style.pointerEvents = 'none';
        btn.classList.add('footernav-btn-swap-out');
      });
      this._trena3DPainelRapidoFaseTimer = setTimeout(faseFecharGapDosRemovidos, DUR_ENCOLHER + PAUSA_VAZIO);
    } else {
      faseAbrirGapProsAdicionados();
    }
  }

  /** [17/09/2026 UTC] NOVO — parte da coreografia por fases da janelinha
   *  (ver comentário grande em `_trena3DAtualizarPainelRapido`). Tira uma
   *  "foto" (`getBoundingClientRect`) da posição de tela de cada botão
   *  ATUALMENTE no DOM, indexada por `data-pr-campo` — usada como "First"
   *  da técnica FLIP, antes de uma reconstrução que muda o layout. */
  _trena3DFlipCapturarPosicoes(wrap) {
    const rects = new Map();
    wrap.querySelectorAll('button[data-pr-campo]').forEach((btn) => {
      rects.set(btn.dataset.prCampo, btn.getBoundingClientRect());
    });
    return rects;
  }

  /** [17/09/2026 UTC] NOVO — parte da coreografia por fases da janelinha
   *  (ver comentário grande em `_trena3DAtualizarPainelRapido`). Depois de
   *  uma reconstrução do DOM (o "Last" da técnica FLIP), compara a posição
   *  nova de cada botão que já existia (`rectsAntes`) com a posição atual —
   *  aplica instantaneamente um `transform: translate(...)` que o deixa
   *  VISUALMENTE ainda na posição antiga ("Invert", sem transição), força
   *  um reflow, e então anima esse transform de volta a `translate(0,0)`
   *  com uma transição de verdade ("Play") — o olho vê o botão "deslizar"
   *  suavemente da posição antiga até a nova. Botões que não existiam antes
   *  (não estão em `rectsAntes`) são ignorados aqui (não têm "de onde"
   *  deslizar — ficam só na posição final, controlados por outra fase). */
  _trena3DFlipAnimarParaPosicoesNovas(wrap, rectsAntes, duracaoMs) {
    wrap.querySelectorAll('button[data-pr-campo]').forEach((btn) => {
      const antes = rectsAntes.get(btn.dataset.prCampo);
      if (!antes) return;
      const depois = btn.getBoundingClientRect();
      const dx = antes.left - depois.left;
      const dy = antes.top - depois.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return; // não se moveu — nada a animar
      btn.style.transition = 'none';
      btn.style.transform = `translate(${dx}px, ${dy}px)`;
      // eslint-disable-next-line no-unused-expressions
      btn.getBoundingClientRect(); // força o navegador a aplicar o transform acima antes de ligar a transição de volta
      requestAnimationFrame(() => {
        btn.style.transition = `transform ${duracaoMs}ms ease`;
        btn.style.transform = 'translate(0px, 0px)';
        let limpo = false;
        const limpar = () => { if (limpo) return; limpo = true; btn.style.transition = ''; btn.style.transform = ''; };
        btn.addEventListener('transitionend', limpar, { once: true });
        setTimeout(limpar, duracaoMs + 80); // rede de segurança (ex.: `prefers-reduced-motion` pulando a transição)
      });
    });
  }

  /** [17/09/2026 UTC] NOVO — desenha o conteúdo de verdade da janelinha
   *  (grupos, botão de modo de ancoragem, cada botão de opção) dentro de
   *  `wrap`, incluindo SÓ os `campo`s presentes em `camposIncluir` (mais o
   *  botão de modo de ancoragem, que não é um `campo` e sempre aparece).
   *  Extraído de dentro de `_trena3DAtualizarPainelRapido` (ver comentário
   *  grande lá) pra poder ser chamado uma vez por FASE da coreografia, cada
   *  vez com um subconjunto diferente de campos "presentes no DOM agora".
   *  `camposInvisiveis` (opcional) é um subconjunto de `camposIncluir`: os
   *  botões correspondentes são desenhados normalmente (ocupam espaço no
   *  layout, pros vizinhos poderem "abrir espaço" deslizando) mas com
   *  `opacity:0`+`pointer-events:none` — usado só na fase de "abrir espaço"
   *  do aparecer, antes do botão de fato crescer/aparecer. */
  _trena3DConstruirConteudoPainelRapido(wrap, camposIncluir, camposInvisiveis) {
    const cfg = this._trena3DCfg();
    wrap.innerHTML = '';
    // Botão extra, no topo da lista: alterna o modo de ancoragem ("Ctrl" vs
    // "Sempre com 4 cliques") — não é booleano, mas cabe no mesmo espírito
    // de "acesso rápido" e é a opção mais usada da seção "Como funciona a
    // ancoragem".
    // [16/09/2026 UTC] MUDANÇA (RODADA 90) — pedido verbatim: "Na
    // janelinha, agrupe, visualmente, os botões que pertencem a mesma
    // subseção." Em vez de um único `flex-wrap` com todos os botões
    // soltos, cada GRUPO (ver `_trena3DOpcoesPainelRapido`/`grupo`) agora
    // vira seu próprio sub-container (`.v3d-trena3d-pr-grupo`) — leve
    // borda/fundo diferenciado + rótulo pequeno com o nome da subseção de
    // origem, e um `gap` maior ENTRE grupos que DENTRO de cada um. O botão
    // de "modo de ancoragem" (não-booleano, tratado à parte) entra no
    // mesmo grupo "Como funciona a ancoragem" da opção
    // 'SuprimirDestaqueDuranteAncora', já que é a mesma subseção de
    // Configurações 3D.
    // [16/09/2026 UTC] NOVO (RODADA 91) — pedido verbatim: "deve haver uma
    // opção do modo como a janelinha vai aparecer. Este modo atual é uma
    // delas. E o outro mais simples é o que estava antes [...] neste caso
    // não precisa imprimir texto, mas um contorno [...] já basta." Novo
    // campo `trena3DPainelRapidoModo` ('agrupado', padrão/o modo da Rodada
    // 90, com rótulo de texto por grupo; 'simples', o modo anterior — SEM
    // o texto do rótulo, mas MANTENDO o contorno/fundo sutil de cada
    // grupo, como pedido explicitamente ("um contorno [...] já basta").
    const modoPainel = (this._cfgAdapter?._cache?.trena3DPainelRapidoModo ?? this._cfgAdapter?.DEFAULTS?.trena3DPainelRapidoModo) === 'simples' ? 'simples' : 'agrupado';
    // [16/09/2026 UTC] NOVO (RODADA 96) — pedido verbatim: "E o 'Agrupado' e
    // o 'Simples', cada um deve ter suas próprias dimensões." Detecta troca
    // de modo (comparando com o modo da última chamada) e, quando muda,
    // carrega assincronamente o tamanho salvo PRO NOVO MODO (chave separada
    // no IndexedDB, ver `_trena3DChaveTamanhoPainelRapido`) — se não houver
    // nada salvo pra ele ainda, `_trena3DAjustarLimitesPainelRapido` (chamado
    // no final desta função) garante que a janelinha pelo menos não fique
    // menor que o mínimo necessário pro conteúdo do modo novo.
    if (this._trena3DPainelRapidoModoAnterior !== modoPainel) {
      this._trena3DPainelRapidoModoAnterior = modoPainel;
      this._trena3DCarregarTamanhoPainelRapido().then((tamanho) => {
        if (!this._trena3DPainelRapidoEl) return;
        this._trena3DPainelRapidoTamanho = tamanho || null;
        if (tamanho?.width) this._trena3DPainelRapidoEl.style.width = `${tamanho.width}px`;
        // [16/09/2026 UTC] RODADA 103 — SIMPLIFICADO — a altura nunca mais
        // é lida/aplicada como valor fixo (não existe mais handle
        // vertical algum) — fica sempre 'auto', compacta pro conteúdo
        // exato do modo novo.
        this._trena3DPainelRapidoEl.style.height = 'auto';
        this._trena3DAjustarLimitesPainelRapido();
      }).catch(() => {});
    }
    const grupos = new Map(); // nome do grupo -> <div> do grupo (na ordem de 1ª aparição)
    const obterOuCriarGrupo = (nome) => {
      if (grupos.has(nome)) return grupos.get(nome);
      const g = document.createElement('div');
      g.className = 'v3d-trena3d-pr-grupo';
      // [16/09/2026 UTC] MUDANÇA (RODADA 95) — pedido verbatim: "Ao
      // redimensionar a janelinha, os botões/grupos de botões devem ir se
      // reorganizando conforme a largura disponível." CAUSA RAIZ: por
      // padrão, um item flex tem `min-width:auto` (nunca encolhe abaixo do
      // conteúdo) — sem `minWidth:'0'`/`maxWidth:'100%'` aqui, cada GRUPO
      // (item do `flex-wrap` de `wrap`, `.v3d-trena3d-pr-botoes`) recusava
      // encolher, então o `flexWrap` de dentro dele (nos próprios botões,
      // logo abaixo) nunca chegava a ser exercitado — o grupo simplesmente
      // transbordava pra fora da janelinha em vez de quebrar linha. Com
      // `minWidth:0` o grupo pode encolher até a largura disponível, e
      // `maxWidth:100%` impede um grupo sozinho de forçar a janelinha
      // inteira a ficar mais larga que o usuário escolheu no resize.
      Object.assign(g.style, {
        display: 'flex', flexDirection: 'column', gap: '2px',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '6px', padding: '3px 3px 4px', minWidth: '0', maxWidth: '100%',
        transition: 'none', // [16/09/2026 UTC] RODADA 98 — reforço defensivo, ver comentário grande em `_trena3DAjustarLimitesPainelRapido`.
      });
      if (modoPainel === 'agrupado') {
        const rotulo = document.createElement('div');
        rotulo.className = 'v3d-trena3d-pr-grupo-rotulo';
        rotulo.textContent = nome;
        Object.assign(rotulo.style, {
          fontSize: '8px', lineHeight: '1.2', color: '#7d8391', padding: '0 2px',
          whiteSpace: 'normal', textTransform: 'uppercase', letterSpacing: '0.02em',
        });
        g.appendChild(rotulo);
      }
      const botoes = document.createElement('div');
      botoes.className = 'v3d-trena3d-pr-grupo-botoes';
      // [16/09/2026 UTC] MUDANÇA (RODADA 95) — mesmo motivo do `minWidth:0`
      // no grupo pai (ver comentário grande acima): sem ele aqui também,
      // esta linha de botões (que já tinha `flexWrap:wrap` desde sempre)
      // não conseguia encolher o suficiente pra quebrar de verdade dentro
      // de um grupo mais estreito.
      Object.assign(botoes.style, { display: 'flex', flexWrap: 'wrap', gap: '4px', minWidth: '0' });
      g.appendChild(botoes);
      wrap.appendChild(g);
      grupos.set(nome, g);
      return g;
    };
    const NOME_GRUPO_ANCORAGEM = 'Como funciona a ancoragem';
    const grupoAncoragem = obterOuCriarGrupo(NOME_GRUPO_ANCORAGEM);
    const botoesAncoragem = grupoAncoragem.querySelector('.v3d-trena3d-pr-grupo-botoes');
    const btnModo = document.createElement('button');
    btnModo.type = 'button';
    const quatro = cfg.modoAncora === 'quatroCliques';
    btnModo.textContent = quatro ? '4×' : '🖱️';
    btnModo.title = quatro
      ? 'Modo de ancoragem: "Sempre com 4 cliques" — clique pra voltar ao modo "Segurando Ctrl"'
      : 'Modo de ancoragem: "Segurando Ctrl" — clique pra mudar pro modo "Sempre com 4 cliques"';
    Object.assign(btnModo.style, this._trena3DEstiloBotaoPainelRapido(true));
    btnModo.addEventListener('click', () => { this._cfgAdapter.set({ trena3DModoAncora: quatro ? 'ctrl' : 'quatroCliques' }); });
    botoesAncoragem.appendChild(btnModo);
    // [16/09/2026 UTC] NOVO — usa a lista já filtrada/reordenada pela
    // customização do usuário (ver `_trena3DOpcoesPainelRapidoEfetivas`) em
    // vez da lista "crua" de código.
    // [17/09/2026 UTC] MUDANÇA — só desenha os campos presentes em
    // `camposIncluir` (cada FASE da coreografia passa um subconjunto
    // diferente, ver comentário grande em `_trena3DAtualizarPainelRapido`);
    // os presentes em `camposInvisiveis` (subconjunto de `camposIncluir`)
    // nascem com `opacity:0` — ocupam espaço no layout (pros vizinhos
    // "abrirem espaço" deslizando) mas ainda não aparecem de verdade.
    this._trena3DOpcoesPainelRapidoEfetivas().forEach((opt) => {
      if (!camposIncluir.has(opt.campo)) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.prCampo = opt.campo; // [17/09/2026 UTC] identifica o botão por `campo` pra FLIP/diff entre fases (ver comentário grande acima).
      const ligado = !!cfg[opt.campo.charAt(0).toLowerCase() + opt.campo.slice(1)];
      // [16/09/2026 UTC] NOVO (RODADA 96) — pedido verbatim: "o ícone
      // 'Suprimir destaque de hover durante a ancoragem' deve ser trocado
      // pelo render do cubo com destaque pontilhado." Opções com `svgIcone`
      // (só esta, por enquanto) usam esse SVG mini como conteúdo do botão
      // em vez de um emoji em `opt.icone` — `innerHTML` em vez de
      // `textContent`.
      if (opt.svgIcone) {
        btn.innerHTML = opt.svgIcone;
      } else {
        btn.textContent = opt.icone;
      }
      btn.title = `${opt.titulo} (${ligado ? 'ativado' : 'desativado'})`;
      Object.assign(btn.style, this._trena3DEstiloBotaoPainelRapido(ligado));
      if (camposInvisiveis && camposInvisiveis.has(opt.campo)) {
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
      }
      btn.addEventListener('click', () => { this._cfgAdapter.set({ [`trena3D${opt.campo}`]: !ligado }); });
      const grupoEl = obterOuCriarGrupo(opt.grupo || 'Outras opções');
      grupoEl.querySelector('.v3d-trena3d-pr-grupo-botoes').appendChild(btn);
    });
    // [16/09/2026 UTC] NOVO (RODADA 96) — recalcula os limites mínimos de
    // tamanho toda vez que os botões são redesenhados (troca de modo
    // agrupado/simples, ou qualquer mudança de config que altere a lista).
    this._trena3DAjustarLimitesPainelRapido();
  }

  /** [16/09/2026 UTC] NOVO (RODADA 96) — pedido verbatim: "A janelinha não
   *  deve gerar scroll, deve travar ao não poder encolher mais. Todos os
   *  botões tem de ficar visíveis." Calcula `min-width`/`min-height` a
   *  partir do CONTEÚDO DE VERDADE (em vez de um valor fixo pequeno que
   *  permitia encolher além do que os botões precisam).
   *  [16/09/2026 UTC] REESCRITO (RODADA 98) — pedido verbatim: "Ao clicar
   *  em um botão, a janelinha começa a transição de movimento de novo." A
   *  versão anterior (Rodada 96) media o mínimo mutando a LARGURA DO
   *  PRÓPRIO ELEMENTO VISÍVEL (forçava `el.style.width='10px'`, lia
   *  `scrollWidth`, restaurava) — essa função é chamada TODA VEZ que os
   *  botões são redesenhados, ou seja, A CADA CLIQUE em qualquer botão da
   *  janelinha (`_trena3DAtualizarPainelRapido` chama isto no final).
   *  Mesmo sem nenhuma `transition` CSS de verdade encontrada, mutar a
   *  largura do elemento REAL, na tela, duas vezes seguidas (encolhe,
   *  depois restaura) a cada clique é o suficiente pra dar a impressão de
   *  "a janelinha se mexendo" que o usuário relatou — mesmo que
   *  tecnicamente aconteça "no mesmo quadro". CORRIGIDO: a medição agora
   *  acontece num CLONE invisível (`visibility:hidden`, fora do fluxo via
   *  `position:fixed` e `top:-9999px`), nunca tocando a largura do
   *  elemento visível — o painel de verdade não sofre NENHUMA mutação de
   *  tamanho além da que o próprio usuário pediu (arrastando um dos 7
   *  handles) ou de um resize salvo sendo restaurado ao abrir. */
  /** [16/09/2026 UTC] RODADA 102 — CORRIGIDO bug verbatim: "A janelinha
   *  deve ter as menores dimensões possíveis. Atualmente, a altura está
   *  muito grande e fica um grande 'espaço em branco'." CAUSA RAIZ REAL
   *  (Rodada 102): o `height` salvo no IndexedDB era aplicado como valor
   *  FIXO incondicionalmente, mesmo quando vinha só de um arrasto de
   *  LARGURA (o número era um efeito colateral do `height:auto` daquele
   *  momento, não uma escolha vertical de verdade) — uma vez fixado, nunca
   *  mais encolhia. A Rodada 102 corrigiu isso com um flag
   *  `alturaCustomizada`.
   *  [16/09/2026 UTC] RODADA 103 — SIMPLIFICADO AINDA MAIS — pedido
   *  verbatim: "deve ser possível fazer isso apenas pelas suas laterais,
   *  variando manualmente a largura. A altura fica reajustada
   *  automaticamente." Removidos TODOS os handles verticais (ver
   *  `_trena3DEnsurePainelRapido`/`_trena3DWireResizeHandle`) — não existe
   *  mais NENHUMA forma de o usuário fixar uma altura manualmente, então o
   *  flag `alturaCustomizada` da Rodada 102 deixou de fazer sentido e foi
   *  removido: `style.height` agora é SEMPRE `'auto'`, incondicionalmente,
   *  recalculado (junto com `min-height`, que segue protegendo contra
   *  corte de botões) toda vez que esta função roda — ou seja, toda vez
   *  que os botões/grupos mudam (troca de modo, config alterada, novo
   *  botão adicionado, ou o próprio conteúdo quebrando linha por causa de
   *  uma largura menor escolhida no resize horizontal). Só a LARGURA
   *  continua podendo crescer aqui (nunca encolher sozinha) se ficar
   *  abaixo do mínimo recém-calculado — ex. depois de trocar pro modo
   *  "agrupado", que precisa de mais espaço pros rótulos de texto. */
  _trena3DAjustarLimitesPainelRapido() {
    const el = this._trena3DPainelRapidoEl;
    if (!el) return;
    // [16/09/2026 UTC] CORRIGIDO — pedido verbatim: "A altura da janelinha
    // [...] deve ser sempre a mínima possível, só os botões devem ficar
    // dentro da janelinha, não espaços em branco." CAUSA RAIZ: `minHeight`
    // era calculado no MESMO clone estreitíssimo (`width:'10px'`) usado só
    // pra achar `minWidth` — a 10px de largura o `flex-wrap` empilha quase
    // 1 botão por linha (o pior caso, mais alto possível), então
    // `scrollHeight` desse clone media a altura que o conteúdo ocuparia
    // numa coluna única, não a altura de verdade na largura REAL da
    // janelinha (300px+). Como `min-height` é um piso que o CSS nunca deixa
    // a altura (mesmo `auto`) ficar abaixo dele, a janelinha ficava travada
    // nesse valor inflado sempre que era maior que a altura de verdade —
    // sobrando espaço em branco embaixo dos botões toda vez que os botões
    // cabiam em menos linhas na largura real do que cabiam a 10px.
    // CORREÇÃO: `minWidth` continua vindo do clone de 10px (mede o conteúdo
    // "inquebrável" mais largo — ex. o botão mais largo — de forma
    // independente da largura atual); `minHeight` agora vem de um SEGUNDO
    // clone, medido na LARGURA EFETIVA que a janelinha vai realmente usar
    // (a atual, ou o novo `minWidth` se a atual for menor que ele) — ou
    // seja, a altura mínima de verdade PARA aquela largura, nunca mais que
    // o necessário pros botões que cabem nela.
    const cloneLargura = el.cloneNode(true);
    Object.assign(cloneLargura.style, {
      position: 'fixed', top: '-9999px', left: '-9999px', visibility: 'hidden',
      width: '10px', height: 'auto', minWidth: '0', minHeight: '0', pointerEvents: 'none',
    });
    document.body.appendChild(cloneLargura);
    const minWidth = Math.max(140, cloneLargura.scrollWidth);
    document.body.removeChild(cloneLargura);
    el.style.minWidth = `${minWidth}px`;
    // Largura: só cresce se a atual (customizada pelo usuário ou padrão)
    // ficou abaixo do mínimo recém-calculado — nunca encolhe sozinha.
    const larguraAtual = el.getBoundingClientRect().width;
    const larguraEfetiva = Math.max(minWidth, larguraAtual || minWidth);
    if (larguraAtual < minWidth) {
      el.style.width = `${minWidth}px`;
    }
    const cloneAltura = el.cloneNode(true);
    Object.assign(cloneAltura.style, {
      position: 'fixed', top: '-9999px', left: '-9999px', visibility: 'hidden',
      width: `${larguraEfetiva}px`, height: 'auto', minWidth: '0', minHeight: '0', pointerEvents: 'none',
    });
    document.body.appendChild(cloneAltura);
    const minHeight = cloneAltura.scrollHeight;
    document.body.removeChild(cloneAltura);
    el.style.minHeight = `${minHeight}px`;
    // Altura sempre automática — nunca mais uma escolha manual do usuário.
    el.style.height = 'auto';
  }

  /** Estilo inline compartilhado dos botões da janelinha — "on" (opção
   *  ativa) fica destacado (fundo laranja), "off" fica apagado, ambos do
   *  mesmo tamanho pequeno (28×24px) pra ficar "pequeno simples e
   *  prático" mesmo com 9 botões. */
  _trena3DEstiloBotaoPainelRapido(ligado) {
    return {
      cursor: 'pointer', border: '1px solid ' + (ligado ? '#ff9f4d' : 'rgba(255,255,255,0.15)'),
      background: ligado ? 'rgba(255,159,77,0.25)' : 'rgba(255,255,255,0.06)',
      color: ligado ? '#ffd8ae' : '#c7cbd4', borderRadius: '5px', minWidth: '28px', height: '24px',
      fontSize: '12px', lineHeight: '1', padding: '0 3px',
    };
  }

  /** [16/09/2026 UTC] NOVO — extraído do `onKeyDown` (Escape) pra poder ser
   *  chamado de MAIS de um lugar. Pedido do usuário: "O esc não está
   *  cancelando uma medida em curso. Apenas desliga o pointer lock. Ao
   *  clicar de novo na tela [...] a medida que estava sendo feita não foi
   *  'zerada'." Causa raiz suspeita: em pelo menos algumas situações o
   *  `keydown` do Escape usado pra SAIR do Pointer Lock nativo do navegador
   *  não chega (ou não chega a tempo/de forma confiável) até este
   *  `window.addEventListener('keydown', ...)` — o navegador pode tratar
   *  esse Escape como um gesto "reservado" pro próprio unlock, sem garantir
   *  a entrega do evento à página (comportamento que varia entre
   *  navegadores/versões, diferente de um Escape normal com o Pointer Lock
   *  já destravado). Resultado: o cancelamento cadastrado APENAS no
   *  `onKeyDown` roda quando o Escape "sobra" pra página, mas não quando o
   *  navegador o consome inteiro pra si. CORRIGIDO com REFORÇO (mesmo
   *  espírito do bloco em `onPointerLockChange` sobre `_pointerUnlockGraceUntil`,
   *  que já lida com esse mesmo tipo de inconsistência entre navegadores):
   *  além de continuar cancelando no `keydown` (cobre Escape com o Pointer
   *  Lock JÁ destravado, ou navegadores que entregam o evento normalmente),
   *  agora TAMBÉM cancela ao detectar que o Pointer Lock saiu do canvas por
   *  QUALQUER motivo (`onPointerLockChange`) enquanto havia uma medida
   *  pendente — cobre exatamente o caso relatado: destravar sem o
   *  `keydown` da Trena 3D ter rodado. */
  _trena3DCancelarMedidaEmAndamento() {
    // [18/09/2026 UTC] NOVO (RODADA 148) — ESC também é o critério escolhido
    // pra "fechar" um grupo de "medidas agrupadas" em andamento (ver
    // comentário grande em `_trena3DFinalize`): mesmo quando não há
    // `_trena3DPendingP1`/`_trena3DVerticalAnchor` pendente (ex.: usuário só
    // quer encerrar a sequência sem estar no meio de um segmento), zera o
    // `grupoId` acumulado pra que o PRÓXIMO clique, se houver, comece um
    // grupo novo em vez de continuar anexando ao grupo antigo.
    const tinhaGrupo = !!this._trena3DGrupoAtualId;
    this._trena3DGrupoAtualId = null;
    this._trena3DGrupoAtualOrdem = 0;
    if (!this._trena3DPendingP1 && !this._trena3DVerticalAnchor) {
      if (tinhaGrupo) this._toast('Trena 3D: grupo de medidas agrupadas encerrado.', { duration: 1500 });
      return;
    }
    this._trena3DPendingP1 = null;
    this._trena3DVerticalAnchor = null;
    this._trena3DClearPreview();
    this._toast('Trena 3D: medida em andamento cancelada.', { duration: 1500 });
  }

  /** Chamado ao sair/trocar de "📏 Trena 3D" (ver acima) — some com a
   *  prévia (indicador + linha tracejada + rótulo ao vivo) na hora, sem
   *  esperar o próximo quadro (`_trena3DUpdatePreview` já esconderia
   *  sozinho no quadro seguinte por `_buildTool !== 'trena3d'`, mas isso
   *  deixaria 1 quadro "fantasma" com a prévia da ferramenta anterior
   *  ainda visível — pouco, mas evitável de graça). */
  _trena3DClearPreview() {
    if (this._trena3DPreviewGroup) this._trena3DPreviewGroup.visible = false;
    if (this._trena3DHoverMesh) this._trena3DHoverMesh.visible = false;
    if (this._trena3DGuideLine) this._trena3DGuideLine.visible = false;
    if (this._trena3DPreviewMeioMesh) this._trena3DPreviewMeioMesh.visible = false;
    // [16/09/2026 UTC] NOVO — mesmo tratamento acima, agora pro marcador +
    // linha tracejada laranja da âncora (`_trena3DUpdatePreview`).
    if (this._trena3DAnchorGroundMesh) this._trena3DAnchorGroundMesh.visible = false;
    if (this._trena3DAnchorLine) this._trena3DAnchorLine.visible = false;
    if (this._trena3DPreviewLabelEl) this._trena3DPreviewLabelEl.style.display = 'none';
    // [16/09/2026 UTC] NOVO — idem, linha+rótulo de altura do 1º ponto "no ar".
    if (this._trena3DP1HeightLine) this._trena3DP1HeightLine.visible = false;
    if (this._trena3DP1HeightLabelEl) this._trena3DP1HeightLabelEl.style.display = 'none';
    // [16/09/2026 UTC] NOVO — idem, linha+rótulo de altura "ao vivo" (segue o
    // ponto que o cursor está mirando agora, antes de qualquer clique).
    if (this._trena3DLiveHeightLine) this._trena3DLiveHeightLine.visible = false;
    if (this._trena3DLiveHeightLabelEl) this._trena3DLiveHeightLabelEl.style.display = 'none';
    // [16/09/2026 UTC] NOVO (RODADA 94) — idem, linha+rótulo da guia rente
    // ao chão (`_trena3DGuiaChaoLine`).
    if (this._trena3DGuiaChaoLine) this._trena3DGuiaChaoLine.visible = false;
    if (this._trena3DGuiaChaoLabelEl) this._trena3DGuiaChaoLabelEl.style.display = 'none';
    // [16/09/2026 UTC] NOVO — idem, as 2 linhas+rótulos de "guia de grade do
    // mundo" (`_trena3DAtualizarGuiaGrade`).
    if (this._trena3DGuiaGradeXLine) this._trena3DGuiaGradeXLine.visible = false;
    if (this._trena3DGuiaGradeZLine) this._trena3DGuiaGradeZLine.visible = false;
    if (this._trena3DGuiaGradeXLabelEl) this._trena3DGuiaGradeXLabelEl.style.display = 'none';
    if (this._trena3DGuiaGradeZLabelEl) this._trena3DGuiaGradeZLabelEl.style.display = 'none';
    // [18/09/2026 UTC] NOVO (RODADA 155) — idem, 2ª instância da guia de
    // grade ("▦2 Mostrar no 2º ponto...", sufixo '2') — faltava aqui, ver
    // comentário grande junto de `_trena3DUpdateLabels`.
    if (this._trena3DGuiaGradeXLine2) this._trena3DGuiaGradeXLine2.visible = false;
    if (this._trena3DGuiaGradeZLine2) this._trena3DGuiaGradeZLine2.visible = false;
    if (this._trena3DGuiaGradeXLabelEl2) this._trena3DGuiaGradeXLabelEl2.style.display = 'none';
    if (this._trena3DGuiaGradeZLabelEl2) this._trena3DGuiaGradeZLabelEl2.style.display = 'none';
    // [16/09/2026 UTC] NOVO — idem, o "gradeado" interno do ladrilho mirado
    // (`_trena3DAtualizarGradeSnapLadrilho`).
    if (this._trena3DGradeSnapLines) this._trena3DGradeSnapLines.visible = false;
  }

  // ---------------------------------------------------------------------
  // Ciclo de vida — chamar `mount()` ao abrir a visão 3D e `destroy()` ao
  // fechar (mesmo par que `view3d.js` já chamava, só que antes era ~105
  // linhas soltas espalhadas dentro de `mount()`/`unmount()` do módulo
  // maior — reunidas aqui, comportamento idêntico, só que encapsulado).
  /** [16/09/2026 UTC] RODADA 101 — liga o `ResizeObserver` de
   *  `this._container` (reposiciona a janelinha de ajustes rápidos se o
   *  container encolher) — ver `_trena3DClampPainelRapidoNoContainer`. */
  mount() {
    if (this._container) {
      this._container.style.position = this._container.style.position || 'relative';
      this._container.style.overflow = 'hidden';
      if (typeof ResizeObserver !== 'undefined') {
        this._trena3DContainerResizeObserver = new ResizeObserver(() => { this._trena3DClampPainelRapidoNoContainer(); });
        this._trena3DContainerResizeObserver.observe(this._container);
      }
    }
  }

  /** Zera TODO o estado (grupos THREE, linhas/rótulos DOM soltos,
   *  observers) — extraído tal e qual do antigo `unmount()` de
   *  `view3d.js` (RODADA 191), só que como método próprio, chamável de
   *  fora (`this._trena3D.destroy()`) sem precisar saber quais ~40 campos
   *  internos existem. A instância em si continua viva/reutilizável
   *  depois (mesmo espírito de singleton reaproveitado do `view3d.js`
   *  original) — só o ESTADO é limpo, pronto pra um próximo `mount()`. */
  destroy() {
    if (this._trena3DContainerResizeObserver) { this._trena3DContainerResizeObserver.disconnect(); this._trena3DContainerResizeObserver = null; }
    (this._trena3DLabelEls || []).forEach((el) => el.remove());
    this._trena3DLabelEls = null;
    this._trena3DGroup = null;
    // [18/09/2026 UTC] NOVO (RODADA 141) — overlay 2D da Trena 3D (ver
    // `_trena3DEnsure2DOverlayCanvas`/`_trena3DDesenhar2DOverlay`) — é
    // filho de `#v3d-camzoom-wrap` (dentro de `this._container`, some
    // sozinho quando o container é destruído), mas a REFERÊNCIA em JS
    // precisa ser limpa aqui mesmo assim (mesmo padrão de todo o resto
    // deste bloco), senão uma futura chamada a `_trena3DEnsure2DOverlayCanvas`
    // acharia `cv.isConnected === false` e recriaria de qualquer forma — só
    // por clareza/consistência com o resto da função.
    this._trena3D2DOverlayEl = null;
    this._trena3D2DMedidas = null;
    if (this._trena3DPreviewLabelEl) this._trena3DPreviewLabelEl.remove();
    this._trena3DPreviewLabelEl = null;
    this._trena3DPreviewGroup = null;
    this._trena3DHoverMesh = null;
    this._trena3DGuideLine = null;
    this._trena3DAnchorGroundMesh = null;
    this._trena3DAnchorLine = null;
    if (this._trena3DP1HeightLabelEl) this._trena3DP1HeightLabelEl.remove();
    this._trena3DP1HeightLabelEl = null;
    this._trena3DP1HeightLine = null;
    if (this._trena3DLiveHeightLabelEl) this._trena3DLiveHeightLabelEl.remove();
    this._trena3DLiveHeightLabelEl = null;
    this._trena3DLiveHeightLine = null;
    if (this._trena3DGuiaGradeXLabelEl) this._trena3DGuiaGradeXLabelEl.remove();
    this._trena3DGuiaGradeXLabelEl = null;
    this._trena3DGuiaGradeXLine = null;
    if (this._trena3DGuiaGradeZLabelEl) this._trena3DGuiaGradeZLabelEl.remove();
    this._trena3DGuiaGradeZLabelEl = null;
    this._trena3DGuiaGradeZLine = null;
    // [18/09/2026 UTC] NOVO (RODADA 155) — 2ª instância da guia de grade
    // ("▦2 Mostrar no 2º ponto..."), criada com sufixo '2' (ver
    // `_trena3DAtualizarGuiaGrade`, RODADA 154) — mesmo descarte da
    // instância sem sufixo logo acima, faltava aqui (bug: os elementos
    // ficavam "penduradas" no DOM entre uma abertura de "Ver em 3D" e
    // outra).
    if (this._trena3DGuiaGradeXLabelEl2) this._trena3DGuiaGradeXLabelEl2.remove();
    this._trena3DGuiaGradeXLabelEl2 = null;
    this._trena3DGuiaGradeXLine2 = null;
    if (this._trena3DGuiaGradeZLabelEl2) this._trena3DGuiaGradeZLabelEl2.remove();
    this._trena3DGuiaGradeZLabelEl2 = null;
    this._trena3DGuiaGradeZLine2 = null;
    // [17/09/2026 UTC] NOVO (RODADA 119) — as 2 linhas verticais de apoio
    // (ver `_trena3DAtualizarLinhaVerticalDoLabel`) vivem no MESMO `grupo`
    // (`_trena3DPreviewGroup`, descartado por inteiro em outro lugar deste
    // dispose) — só zera a referência JS aqui, igual às demais linhas AO
    // VIVO desta seção.
    this._trena3DGuiaGradeXLineLinhaVertical = null;
    this._trena3DGuiaGradeZLineLinhaVertical = null;
    this._trena3DGradeSnapLines = null;
    this._trena3DGradeNivelHelper = null; // [16/09/2026 UTC] RODADA 101 — "Continuar no nível do 1º ponto"
    this._trena3DEntries = [];
    this._trena3DRaycaster = null;
    this._trena3DPendingRebuild = false;
    this._trena3DUltimoRetrato = null;
    this._trena3DPendingP1 = null;
    this._trena3DVerticalAnchor = null;
    this._trena3DLastClickAt = null;
    // [18/09/2026 UTC] NOVO (RODADA 148) — desmontar a cena 3D também fecha
    // um grupo de "medidas agrupadas" em andamento (ver comentário grande
    // em `_trena3DFinalize`).
    this._trena3DGrupoAtualId = null;
    this._trena3DGrupoAtualOrdem = 0;
    // [16/09/2026 UTC] NOVO — REFORÇO extra pro mesmo bug: varredura direta
    // no DOM por classe (`.v3d-trena3d-label`, ver `_trena3DUpdatePreview`/
    // `_trena3DRebuildLines`), cobrindo qualquer rótulo que por algum motivo
    // não estivesse mais referenciado nas variáveis acima (ex.: uma sessão
    // 3D anterior cujo `unmount()` teria sido pulado por completo, sem
    // `this` ter sido reiniciado entre uma sessão e outra — o módulo View3D
    // é um singleton reaproveitado por toda a vida da página).
    document.querySelectorAll('.v3d-trena3d-label').forEach((el) => el.remove());
    // [16/09/2026 UTC] NOVO — janelinha de acesso rápido da Trena 3D (ver
    // `_trena3DEnsurePainelRapido`), mesmo tratamento de limpeza acima.
    // [16/09/2026 UTC] MUDANÇA — agora é filha de `this._container` (não mais
    // de `document.body`, ver comentário na própria função), então já seria
    // removida junto se `this._container` fosse descartado — mas a limpeza
    // explícita aqui continua, por segurança e porque `this._container` é
    // zerado (`= null`) mais abaixo nesta mesma `unmount()`.
    if (this._trena3DPainelRapidoEl) this._trena3DPainelRapidoEl.remove();
    this._trena3DPainelRapidoEl = null;
    // [16/09/2026 UTC] NOVO (RODADA 94) — desconecta o `ResizeObserver` do
    // redimensionamento manual (ver `_trena3DEnsurePainelRapido`) junto com
    // o resto da limpeza — sem isso, o observer continuaria "vivo"
    // observando um elemento já removido do DOM até o garbage collector
    // eventualmente descartá-lo.
    if (this._trena3DPainelRapidoResizeObserver) { this._trena3DPainelRapidoResizeObserver.disconnect(); this._trena3DPainelRapidoResizeObserver = null; }
    document.querySelectorAll('.v3d-trena3d-painel-rapido').forEach((el) => el.remove());
    // [16/09/2026 UTC] NOVO — botão flutuante de reabrir (ver
    // `_trena3DMostrarBotaoReabrirPainelRapido`), mesmo tratamento acima.
    if (this._trena3DBotaoReabrirEl) this._trena3DBotaoReabrirEl.remove();
    this._trena3DBotaoReabrirEl = null;
    this._trena3DPainelRapidoFechadoManualmente = false;
    document.querySelectorAll('.v3d-trena3d-painel-rapido-reabrir').forEach((el) => el.remove());
  }

  /** Compara um "retrato" (snapshot JSON) das opções da seção "📏 Trena 3D"
   *  que afetam a APARÊNCIA das medidas JÁ DESENHADAS — se algo relevante
   *  mudou desde a última chamada, refaz as linhas (+ reaplica oclusão) NA
   *  HORA, sem esperar uma medida nova ou reabrir o 3D. Extraído tal e
   *  qual do antigo handler `_onMapConfigChange` de `view3d.js` (RODADA
   *  191) — chamar isto sempre que a config mudar (`configAdapter`
   *  disparando cada `set()`, ou o próprio host reagindo a isso do jeito
   *  que preferir). `c` é o objeto de config completo mais recente (mesmo
   *  formato do `MapConfig._cache`/evento `onChange` original). */
  onMapConfigChange(c) {
        const trena3DRetratoAgora = JSON.stringify({
          le: c.trena3DLabelEstilo, vi: c.trena3DVisibilidade, es: c.trena3DEspessuraCm,
          cl: c.trena3DCorLinha, ca: c.trena3DCorAncora, cm: c.trena3DCorMira, po: c.trena3DPonta,
          lf: c.trena3DMostrarLinhasAncoraFinalizada, lfm: c.trena3DLinhasAncoraFinalizadaModo,
          // [16/09/2026 UTC] NOVO — "coloque como outra opção para aparecer
          // após finalizar a medida. Isto acabará afetando a todas as
          // medidas no mapa." Precisa estar aqui pra ligar/desligar a opção
          // (ou trocar o "jeito"/modo) redesenhar todas as medidas JÁ
          // existentes na hora, sem precisar fazer uma medida nova.
          ggf: c.trena3DGuiaGradeFinalizada, ggm: c.trena3DGuiaGradeModoMedida,
          // [16/09/2026 UTC] NOVO — as 2 cores novas da guia de grade
          // (`trena3DGuiaGradeCorLinha`/`trena3DGuiaGradeCorTexto`) também
          // precisam estar aqui — mesmo raciocínio já documentado nesta
          // função pras cores da "guia rente ao chão" (`gcl`/`gct`): sem
          // isso, mudar a cor só surtiria efeito na próxima medida nova ou
          // reabertura do 3D, nunca nas medidas já finalizadas na tela.
          ggcl: c.trena3DGuiaGradeCorLinha, ggct: c.trena3DGuiaGradeCorTexto,
          // [16/09/2026 UTC] CORRIGIDO — BUG relatado verbatim: "a opção
          // 'Mostrar guia depois que a medida foi finalizada' não está
          // funcionando." CAUSA RAIZ: mesma classe de bug já documentada
          // acima (campo novo esquecido neste "retrato") — `guiaChaoFinalizada`
          // (RODADA 107) e suas cores nunca entraram aqui, então ligar/
          // desligar a opção só surtia efeito na PRÓXIMA medida nova ou
          // reabertura do 3D, nunca imediatamente nas medidas já existentes.
          gcf: c.trena3DGuiaChaoFinalizada, gcl: c.trena3DGuiaChaoCorLinha, gct: c.trena3DGuiaChaoCorTexto,
          // [16/09/2026 UTC] NOVO (RODADA 92) — BUG CRÍTICO relatado
          // verbatim: "a aplicação das configurações feitas [na seção
          // 'Pontas'] não está sendo aplicada ao vivo [...] tendo que
          // clicar em outra opção e, depois, voltar para a opção inicial
          // para que surta efeito." CAUSA: todos os campos NOVOS da
          // Rodada 91 (tamanho/término da esfera, dimensões do cone da
          // seta, dimensões da seta de 2 traços, dimensões/alinhamento/
          // modo do traço perpendicular) faltavam neste "retrato" —
          // mudar QUALQUER um deles não disparava `_trena3DRebuildLines()`
          // sozinho; só surtia efeito quando outra mudança (trocar de
          // ponta e voltar) alterava um campo QUE JÁ estava aqui (`po`),
          // arrastando o rebuild "de carona" e só então lendo o valor novo
          // do campo que faltava. CORRIGIDO: todos os campos abaixo
          // adicionados ao retrato.
          et: c.trena3DEsferaTamanho, etl: c.trena3DEsferaTerminoLinha,
          scr: c.trena3DSetaConeRaio, sca: c.trena3DSetaConeAltura,
          s2a: c.trena3DSetaDoisTracosAbertura, s2c: c.trena3DSetaDoisTracosComprimento,
          tpc: c.trena3DTracoPerpComprimento, tpa: c.trena3DTracoPerpAlinhamento, tpm: c.trena3DTracoPerpModoRender,
          // [17/09/2026 UTC] CORRIGIDO (RODADA 118) — MESMA classe de bug
          // documentada acima, de novo: os campos de espessura/estilo/dash
          // das RODADA 114/117 ("Guia de grade do mundo", "Guia rente ao
          // chão" + a ponta simplificada dela, "Linhas verticais
          // ancoradas") nunca tinham entrado neste "retrato" — mudar
          // qualquer um deles só surtia efeito nas medidas JÁ finalizadas
          // (linhas guia/âncora que ficam desenhadas mesmo depois de
          // pronta a medida) na próxima medida nova ou mexendo em outra
          // opção "de carona" — bugs relatados verbatim: "ao variar entre
          // 'Sólida', 'Tracejada' e 'Pontilhada' [...] 'Sem pontas',
          // 'Esfera', 'Seta', '2 traços' e 'Traço' [na Guia rente ao
          // chão], as aplicações não estão sendo imediatas" e "[na Guia de
          // grade do mundo] ao variar a 'Espessura', a espessura está
          // ficando a mesma". As linhas AO VIVO (enquanto mede, antes de
          // finalizar) já refletiam na hora sempre (`_trena3DUpdatePreview`
          // lê a config do zero a cada quadro, não depende deste
          // "retrato") — só as medidas JÁ FINALIZADAS na tela dependiam
          // deste rebuild explícito, que faltava disparar.
          ggec: c.trena3DGuiaGradeEspessuraCm, ggel: c.trena3DGuiaGradeEstiloLinha, ggdc: c.trena3DGuiaGradeDashCm, gggc: c.trena3DGuiaGradeGapCm,
          gcec: c.trena3DGuiaChaoEspessuraCm, gcel: c.trena3DGuiaChaoEstiloLinha, gcdc: c.trena3DGuiaChaoDashCm, gcgc: c.trena3DGuiaChaoGapCm, gcp: c.trena3DGuiaChaoPonta,
          lacor: c.trena3DLinhaAncoraCor, laec: c.trena3DLinhaAncoraEspessuraCm, lael: c.trena3DLinhaAncoraEstiloLinha, ladc: c.trena3DLinhaAncoraDashCm, lagc: c.trena3DLinhaAncoraGapCm,
          // [17/09/2026 UTC] NOVO (RODADA 119) — MESMA classe de bug
          // documentada acima ("campo novo esquecido neste retrato"), desta
          // vez preventivamente: os 3 novos campos de deslocamento vertical
          // de texto que afetam medidas JÁ FINALIZADAS ("Aparência da
          // medida", "Guia rente ao chão", "Linhas guia da grade do mundo" —
          // "Linhas verticais ancoradas" não tem rótulo em nenhuma versão
          // finalizada, só ao vivo, então não precisa entrar aqui) + o
          // enable da linha vertical de apoio (só "Linhas guia da grade do
          // mundo").
          ldv: c.trena3DLabelDeslocVerticalM, gcldv: c.trena3DGuiaChaoLabelDeslocVerticalM,
          ggldv: c.trena3DGuiaGradeLabelDeslocVerticalM, gglv: c.trena3DGuiaGradeLabelLinhaVertical,
          // [RODADA 128] CORRIGIDO — MESMA classe de bug documentada ao
          // longo desta função ("campo novo esquecido neste retrato"), bug
          // relatado verbatim: "ao trocar a cor [do 'Ponto médio da
          // medida'], só é alterada de imediato na primeira vez [...]
          // tendo que fechar a janela de 'configurações 3D' e reabri-la de
          // novo [...] para ter o efeito". CAUSA RAIZ: `trena3DMostrarPontoMedio`/
          // `trena3DCorPontoMedio` (RODADA 125) afetam a APARÊNCIA das
          // medidas JÁ DESENHADAS (esfera do ponto médio, ver
          // `_trena3DRebuildLines`) mas nunca entraram neste "retrato" — a
          // 1ª troca de cor "colava de carona" num rebuild disparado por
          // OUTRO campo que mudou junto (ex.: reabrir o modal recalcula
          // tudo), e a 2ª troca em diante, sem mais nada mudando, não
          // disparava rebuild nenhum sozinha. Adicionados aqui, mesmo
          // padrão de todos os outros campos desta seção.
          pm: c.trena3DMostrarPontoMedio, cpm: c.trena3DCorPontoMedio,
          // [RODADA 133] CORRIGIDO -- MESMA classe de bug documentada ao
          // longo desta funcao ("campo novo esquecido neste retrato"), bug
          // relatado verbatim: "As mudancas feitas na subsecao 'Guia rente
          // ao chao' devem ser imediatas [...] as vezes demora para que a
          // aplicacao aconteca, dependendo de mudar outras opcoes para que
          // a alteracao tenha efeito." CAUSA RAIZ: trena3DGuiaChaoModo/
          // trena3DGuiaChaoAlturaLivreM (RODADA 131/132) e os 3 toggles de
          // "Caixa de texto" (trena3DLinhaAncoraLabelVisivel/
          // trena3DGuiaChaoLabelVisivel/trena3DGuiaGradeLabelVisivel, tambem
          // RODADA 131) nunca entraram neste retrato -- mudar qualquer um
          // deles so surtia efeito nas medidas JA finalizadas na proxima
          // medida nova ou mexendo em outra opcao "de carona".
          gcm: c.trena3DGuiaChaoModo, gcalv: c.trena3DGuiaChaoAlturaLivreM,
          lalv: c.trena3DLinhaAncoraLabelVisivel, gclv: c.trena3DGuiaChaoLabelVisivel, gglv2: c.trena3DGuiaGradeLabelVisivel,
          // [RODADA 134] NOVO -- pedido verbatim: "Faça todas as opções
          // da seção 'Trena 3D' entrarem no 'retrato' de campos que
          // disparam redesenho imediato." Todos os campos trena3D* que
          // AINDA não estavam neste retrato (a maioria só afeta a PRÉVIA
          // ao vivo, que já lê a config do zero a cada quadro -- incluídos
          // aqui mesmo assim, por precaução/consistência, igual pedido:
          // um rebuild a mais nunca quebra nada, um campo esquecido aqui
          // já causou vários bugs de "não aplica na hora" documentados ao
          // longo desta função).
          trena3DContinuarLinhaAncoraAposPonto: c.trena3DContinuarLinhaAncoraAposPonto, trena3DContinuarNoNivel: c.trena3DContinuarNoNivel, trena3DGhostCor: c.trena3DGhostCor,
          trena3DGhostDashCm: c.trena3DGhostDashCm, trena3DGhostEspessuraCm: c.trena3DGhostEspessuraCm, trena3DGhostEstiloLinha: c.trena3DGhostEstiloLinha,
          trena3DGhostGapCm: c.trena3DGhostGapCm, trena3DGradeSnapCor: c.trena3DGradeSnapCor, trena3DGradeSnapDashCm: c.trena3DGradeSnapDashCm,
          trena3DGradeSnapEspessuraPx: c.trena3DGradeSnapEspessuraPx, trena3DGradeSnapGapCm: c.trena3DGradeSnapGapCm, trena3DGradeSnapLadrilhoAtiva: c.trena3DGradeSnapLadrilhoAtiva,
          trena3DGradeSnapLadrilhoModo: c.trena3DGradeSnapLadrilhoModo, trena3DGuiaChaoLabelEstilo: c.trena3DGuiaChaoLabelEstilo, trena3DGuiaGradeAposPrimeiroPonto: c.trena3DGuiaGradeAposPrimeiroPonto,
          // [18/09/2026 UTC] NOVO (RODADA 154) — "▦2 Mostrar no 2º ponto,
          // enquanto define o 2º", opção irmã da acima — mesma precaução
          // (campo novo sempre entra neste "retrato" desde já).
          trena3DGuiaGradeNoSegundoPonto: c.trena3DGuiaGradeNoSegundoPonto,
          trena3DGuiaGradeAtiva: c.trena3DGuiaGradeAtiva, trena3DGuiaGradeLabelEstilo: c.trena3DGuiaGradeLabelEstilo, trena3DLabelRaioAtivo: c.trena3DLabelRaioAtivo,
          trena3DLabelRaioM: c.trena3DLabelRaioM, trena3DLabelReorganizarSobreposicao: c.trena3DLabelReorganizarSobreposicao, trena3DLabelVisivel: c.trena3DLabelVisivel,
          trena3DLinhaAncoraAposPontoModo: c.trena3DLinhaAncoraAposPontoModo, trena3DLinhaAncoraLabelDeslocVerticalM: c.trena3DLinhaAncoraLabelDeslocVerticalM, trena3DMiraCor: c.trena3DMiraCor,
          trena3DMiraTamanho: c.trena3DMiraTamanho, trena3DModoAncora: c.trena3DModoAncora, trena3DMostrarAlturaAoVivoAntesDoPonto: c.trena3DMostrarAlturaAoVivoAntesDoPonto,
          trena3DMostrarGuiaChaoAoVivo: c.trena3DMostrarGuiaChaoAoVivo, trena3DMostrarMedidaNaLinhaAncoraAposPonto: c.trena3DMostrarMedidaNaLinhaAncoraAposPonto, trena3DPainelRapidoAtivo: c.trena3DPainelRapidoAtivo,
          trena3DPainelRapidoGruposOcultos: c.trena3DPainelRapidoGruposOcultos, trena3DPainelRapidoModo: c.trena3DPainelRapidoModo, trena3DPainelRapidoOcultos: c.trena3DPainelRapidoOcultos,
          trena3DPainelRapidoOrdem: c.trena3DPainelRapidoOrdem, trena3DPainelRapidoOrdemGrupos: c.trena3DPainelRapidoOrdemGrupos, trena3DPermitirSuperficiesLaterais: c.trena3DPermitirSuperficiesLaterais,
          trena3DSnapAtivo: c.trena3DSnapAtivo, trena3DSnapMetros: c.trena3DSnapMetros, trena3DSuprimirDestaqueDuranteAncora: c.trena3DSuprimirDestaqueDuranteAncora,
          // [18/09/2026 UTC] CORRIGIDO (RODADA 142) — MESMA classe de bug
          // documentada ao longo desta função ("campo novo esquecido neste
          // retrato"), bug relatado verbatim: trocar pra "Formas 2D" (modo
          // de renderização da RODADA 141) "não tem efeito imediato — é
          // preciso 'Sair do 3D' e voltar". CAUSA RAIZ: `trena3DModoRenderizacao`
          // nunca entrou neste retrato — mudar a opção só surtia efeito ao
          // fechar/reabrir "Ver em 3D" (que chama `_rebuildScene`, refazendo
          // tudo do zero), nunca imediatamente com a cena já aberta.
          trena3DModoRenderizacao: c.trena3DModoRenderizacao,
        });
        const trena3DHouveRebuildAgora = this._trena3DUltimoRetrato != null && this._trena3DUltimoRetrato !== trena3DRetratoAgora;
        if (trena3DHouveRebuildAgora) {
          this._trena3DRebuildLines();
        }
        this._trena3DUltimoRetrato = trena3DRetratoAgora;
        // [18/09/2026 UTC] CORRIGIDO (RODADA 143) — bug relatado verbatim:
        // "Quando troca de 'Formas 2D' para 'Formas 3D', as medidas
        // desaparecem, tendo que 'Sair do 3D' e voltar de novo para que elas
        // apareçam novamente." A troca INVERSA (3D→2D, RODADA 142) já
        // funcionava, porque o `_trena3DRebuildLines()` acima (disparado
        // pelo "retrato" mudar, já que `trena3DModoRenderizacao` está nele
        // desde a Rodada 142) reconstrói tudo do zero a cada troca — em
        // TEORIA já cobria as duas direções. CAUSA RAIZ ENCONTRADA: o
        // rebuild de fato roda e recria as malhas 3D certinho (mesmo código
        // usado ao abrir "Ver em 3D" do zero) — mas a VISIBILIDADE de cada
        // malha nova (`entry.obj3d`/`entry.segMeshes`/pontas) só é decidida
        // no quadro SEGUINTE, dentro de `_trena3DAtualizarOclusao()` (chamada
        // 1x por quadro no `_loop`, ANTES do render) — entre o instante deste
        // rebuild síncrono (disparado pelo evento 'change' do rádio,
        // totalmente fora do loop de animação) e o próximo quadro, existe
        // uma janela onde as malhas acabaram de nascer com `visible` no
        // valor DEFAULT do Three.js (`true`) — inofensivo sozinho — MAS,
        // combinado com o fato de o modo 2D ter acabado de deixar
        // `cfg.visibilidade` possivelmente em 'seVisivel' (teste de oclusão
        // ligado) e a câmera/raycaster do motor (`this._camera`) não ter
        // sido "tocada" nenhuma vez com as malhas novas na cena, o PRIMEIRO
        // teste de oclusão feito sobre elas (no próximo quadro) partia de um
        // raycaster que, nesse exato ciclo de troca de modo, podia acusar
        // "bloqueado" incorretamente pra TODOS os pedaços (nenhum dado de
        // profundidade/posição da malha nova ainda tinha sido consultado
        // antes) e a medida ficava com todos os `segMeshes`/pontas
        // `visible=false` — sem mais nenhum evento reagendando outro
        // rebuild/reteste, ficava assim até fechar/reabrir "Ver em 3D"
        // (que remonta a cena inteira do zero, incluindo o primeiro teste de
        // oclusão já "aquecido"). CORRIGIDO: depois do rebuild, chama
        // IMEDIATAMENTE (na hora, síncrono, sem esperar o próximo quadro)
        // `_trena3DAtualizarOclusao()` de novo — igual ao `_loop` já faz a
        // cada quadro — garantindo que toda malha recém-criada nasça com a
        // visibilidade CORRETA (testada de verdade, ou `true` se o teste de
        // oclusão estiver desligado) antes mesmo do primeiro `render()`
        // seguinte, eliminando a janela de 1 quadro "errado" que causava o
        // sumiço. Também cobre, pelo mesmo motivo, a transição 3D→2D
        // (esconder tudo na hora) e qualquer outro rebuild síncrono disparado
        // fora do loop (ex.: mudar qualquer opção desta seção com o 3D já
        // aberto).
        if (trena3DHouveRebuildAgora) this._trena3DAtualizarOclusao();
  }

  // ---------------------------------------------------------------------
  // Pequenos consolidadores — cada um substitui um punhado de linhas que,
  // no `view3d.js` original, mexiam DIRETO em campos internos da Trena 3D
  // (`this._trena3DPendingP1 = null` etc.) de dentro de outras funções do
  // módulo maior (trocar de ferramenta, tecla Esc...). Encapsulados aqui
  // como métodos próprios pra ninguém de fora precisar conhecer os nomes
  // dos campos internos.
  /** Cancela uma medida a meio caminho por troca de ferramenta (mesmo
   *  espírito do cancelamento de uma parede em cadeia pendente) — NÃO
   *  mostra toast (troca de ferramenta é uma ação explícita do usuário,
   *  diferente do Esc, que já teve seu próprio toast/aviso). */
  cancelarMedidaPendente() {
    this._trena3DPendingP1 = null;
    this._trena3DVerticalAnchor = null;
    this._trena3DGrupoAtualId = null;
    this._trena3DGrupoAtualOrdem = 0;
    this._trena3DClearPreview();
  }
  /** true se uma âncora vertical (Ctrl no 1º ponto) já foi commitada —
   *  usado pelo Esc pra saber se deve desfazer só ela (1º Esc) ou a
   *  medida inteira (2º Esc, ver `cancelarMedidaEmAndamento`/
   *  `_trena3DCancelarMedidaEmAndamento`). */
  temAncoraVertical() { return !!this._trena3DVerticalAnchor; }
  desfazerAncoraVertical() { this._trena3DVerticalAnchor = null; }
  /** true se o 1º ponto de uma medida já foi marcado (mirando o 2º). */
  temMedidaPendente() { return !!this._trena3DPendingP1; }
  /** Força esconder a linha+rótulo de "altura ao vivo" (bug relatado:
   *  "às vezes fica travada a linha laranja tracejada... o Esc deve
   *  desativar") — chamado pelo Esc sempre que a Trena 3D está ativa,
   *  mesmo sem medida/âncora pendente nenhuma. */
  esconderLinhaAlturaAoVivo() {
    if (this._trena3DLiveHeightLine) this._trena3DLiveHeightLine.visible = false;
    if (this._trena3DLiveHeightLabelEl) this._trena3DLiveHeightLabelEl.style.display = 'none';
  }
  /** Tenta de novo um rebuild que falhou cedo (cena do motor ainda não
   *  existia na 1ª tentativa, ver `_trena3DRebuildLines`) — chamar 1x por
   *  quadro; sai sozinho sem custo quando não há nada pendente. */
  tentarRebuildPendente() {
    if (this._trena3DPendingRebuild) this._trena3DRebuildLines();
  }

  // ---------------------------------------------------------------------
  // Atalhos de nome "amigável" pro contrato público (ver cabeçalho) — cada
  // um só encaminha pro método interno `_trena3DXxx` correspondente, sem
  // duplicar lógica nenhuma; existem só pra quem for reaproveitar esta
  // classe em outro site não precisar decorar os nomes internos.
  click(ctrlHeld) { return this._trena3DClick(ctrlHeld); }
  /** Chamar 1x por quadro, ANTES do `engine.render(...)` do host — decide
   *  visibilidade/oclusão das medidas já finalizadas e tenta de novo um
   *  rebuild pendente (ver `_trena3DAtualizarOclusao`/
   *  `_trena3DAtualizarDestaqueSuprimido`/`tentarRebuildPendente`). */
  beforeRender() {
    this._trena3DAtualizarOclusao();
    this._trena3DAtualizarDestaqueSuprimido();
    this.tentarRebuildPendente();
  }
  /** Chamar 1x por quadro, DEPOIS do `engine.render(...)` do host (mesma
   *  ordem do `view3d.js` original — ver comentário grande no método
   *  interno `_trena3DUpdateLabels`). `camera3` é a câmera THREE "de
   *  verdade" (já atualizada com a pose deste quadro). */
  afterRender(camera3) {
    this._trena3DUpdatePreview();
    this._trena3DUpdateLabels(camera3);
    this._trena3DDesenhar2DOverlay(camera3);
  }
  cancelarMedidaEmAndamento() { return this._trena3DCancelarMedidaEmAndamento(); }
  pickAtRay(ray) { return this._trena3DPickAtRay(ray); }
  removerMedida(id) { return this._trena3DRemoverMedida(id); }

  /** **NOVO (RODADA 191)** — pedido verbatim: "Faça um método para gerar o
   *  que aparece nas 'configurações 3D' atualmente para poder imprimir em
   *  uma janela genérica." Gera o MESMO conteúdo (grupos de ajustes +
   *  todo o wiring dos controles — sliders, cores, tri-estados...) que
   *  hoje só aparecia dentro da janelinha flutuante de acesso rápido
   *  (`_trena3DEnsurePainelRapido`/`_trena3DConstruirConteudoPainelRapido`)
   *  e imprime dentro de QUALQUER `containerEl` passado — uma `<div>` de
   *  um modal genérico, um painel lateral, uma aba nova, o que o site
   *  hospedeiro quiser. Não depende da janelinha flutuante existir — pode
   *  ser chamado standalone, mesmo sem nunca ter aberto o "Ver em 3D".
   *
   *  @param {HTMLElement} containerEl — elemento onde o HTML é inserido (o
   *    conteúdo SUBSTITUI o `innerHTML` atual dele).
   *  @param {object} [opts]
   *  @param {boolean} [opts.incluirOcultos=true] — inclui também os campos
   *    que o usuário escondeu manualmente na janelinha flutuante (faz
   *    sentido numa janela genérica de configurações completas — na
   *    janelinha flutuante em si, `incluirOcultos` é sempre `false`).
   *  @returns {HTMLElement} o próprio `containerEl`, por conveniência.
   */
  renderConfigPanel(containerEl, opts = {}) {
    if (!containerEl) return containerEl;
    const incluirOcultos = opts.incluirOcultos !== false;
    const grupos = this._trena3DGruposAjustesEfetivos(incluirOcultos);
    containerEl.innerHTML = this._trena3DHtmlAjustesPainelRapido(grupos);
    this._trena3DWireAjustesPainelRapido(containerEl, grupos);
    return containerEl;
  }
}

if (typeof window !== 'undefined') window.Trena3D = Trena3D;
if (typeof module !== 'undefined' && module.exports) module.exports = Trena3D;
