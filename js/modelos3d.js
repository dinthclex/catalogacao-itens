/**
 * modelos3d.js — NOVO (01/09/2026), item GRANDE #5 do pedido de 12 itens,
 * verbatim: "Deve ser possível editar o modelo dos objetos 3D padrão.
 * Também devem ter dois modelos: um mais detalhado e um low poly (para
 * melhorar desempenho). Para isso deve ter um botão de 'acessar modelos',
 * então, abre-se uma janela que cobre toda a tela (como nas 'configurações
 * do app'). Ali é possível acessar os modelos e suas duas versões. Um 'Ver
 * em 3D' a parte pode ser invocado, só que sem o mapa sendo renderizado em
 * 3D, mas apenas o modelo 3D escolhido."
 *
 * Decisões do usuário (AskUserQuestion, mesma rodada) que moldam este
 * arquivo:
 *  - O botão "🛠️ Acessar modelos" fica NO PAINEL DE OBJETOS DO MAPA (Mapa >
 *    Planta baixa > Ferramentas > Objetos), não em Configurações do app —
 *    ver mapview.js `_openObjectPickerPanel`.
 *  - Troca de nível (detalhado/low poly) É AUTOMÁTICA POR DISTÂNCIA
 *    (THREE.LOD de verdade, não um interruptor manual) — ver engine3d.js
 *    `_buildTypeMoldeMesh`/`render()` (`this._lodObjects`).
 *  - Cobre TODOS OS 33 TIPOS de OBJECT3D_PROFILES, incluindo mesa/
 *    luminária/poste (que já têm construtores dedicados/hard-coded) — um
 *    molde customizado passa a valer, sobrepondo até o construtor dedicado
 *    (ver engine3d.js `_buildOneObjectMesh`).
 *
 * Esta tela (`Modelos3DView`, rota "modelos3d" — ver App.views/App.navigate
 * em app.js) lista os 33 tipos × 2 níveis, cada um com status
 * (customizado/padrão) e até três ações: ✏️ Editar (abre o Modelador 3D já
 * existente — ver js/modeler/*.js, reaproveitado por completo, não
 * duplicado), 👁️ Ver em 3D (visualizador orbital SÓ do modelo, sem mapa
 * nenhum — pedido explícito do usuário, só habilitado quando já existe um
 * molde customizado) e 🗑️ Remover (volta a usar o construtor padrão/
 * hard-coded daquele tipo).
 *
 * REAPROVEITAMENTO DO MODELADOR 3D EXISTENTE (em vez de duplicar toda a
 * lógica de esculpir vértice/aresta/face): `Modeler3D.enter(view3d, obj)`
 * espera um `view3d` "de verdade" (View3D, ver view3d.js) só pra ler uma
 * meia dúzia de campos/métodos dele (`_engine`, `_map`, `_container`,
 * `_camera`, `EYE_HEIGHT`, `_surfaceHeightAt`, `_onModelerToggleForLockBadge`,
 * `_rebuildScene`) — nada ali amarra o Modelador a um MAPA de verdade por
 * dentro. `_montarCenaMolde` monta um `view3d` FALSO (objeto comum, nunca
 * uma instância de View3D) com só esses campos, apontando pra uma cena 3D
 * própria (um `Engine3D` novo, só com o objeto sendo editado — sem parede/
 * chão/outros objetos) — o Modelador nem percebe a diferença.
 * `Modeler3D.exit({skipRebuild:true})` evita as DUAS únicas chamadas que
 * pressupõem um mapa de verdade (`DB.saveMap`/`view3d._rebuildScene`) — o
 * `_commit` interno (SEMPRE chamado, com skipRebuild ou sem) continua
 * gravando a malha editada de volta no objeto FALSO, que este arquivo lê
 * na sequência pra persistir em `DB.setObjectModel` (store própria, ver
 * db.js) — nunca em `Mapping.updateObject` de um mapa de verdade.
 */
const Modelos3DView = {
  _container: null,
  // Sessão de edição/visualização atual (só existe uma de cada vez — os
  // botões da lista ficam ATRÁS do overlay em tela cheia enquanto ela
  // dura, então não há como disparar duas ao mesmo tempo por um clique
  // duplo comum): { modo:'editor'|'ver', tipo, nivel, engine, overlay, obj,
  // fakeView3d?, orbitCtl? }.
  _sessao: null,

  // NOVO (08/09/2026), pedido verbatim: "No 'Mapa 2D', como o 'Acessar
  // modelos' pertence a tela 'Mapa 2D', então, fica dentro dela [...]" —
  // `opts.onClose` permite quem montou (js/mapview.js, _openAcessarModelos)
  // decidir o que "✕ Fechar" faz, em vez do padrão fixo App.closeModelos3D()
  // (que sempre navega de volta pra rota 'mapa' — errado quando Modelos3D
  // foi montado CONFINADO dentro do próprio Mapa 2D, sem trocar de rota).
  // 100% compatível: nenhum outro chamador (App.navigate, js/app.js) passa
  // um 2º argumento, então `this._onCloseOverride` fica `null` e o botão
  // continua chamando App.closeModelos3D() exatamente como antes.
  async mount(container, opts = {}) {
    this._container = container;
    this._onCloseOverride = opts?.onClose || null;
    await this.ensureCustomTypesRegistered();
    await this._render();
  },

  // ==================== NOVO (02/09/2026) — "criar novo modelo" +
  // "trocar o nome do modelo" + representação 2D (SVG), pedido verbatim do
  // usuário: "Nessa mesma janela dos 'modelos padrão' deve ser possível
  // 'criar novo modelo'. Deve ser possível trocar o nome do modelo. Deve
  // ser possível fazer uma representação 2D dele. Com formas SVG em um
  // editor 2D de SVG para isso." ====================
  //
  // ARQUITETURA (documentada aqui por ser a única vez que aparece):
  // um "modelo customizado" NOVO (criado pelo usuário, não um dos 33 tipos
  // fixos de OBJECT3D_PROFILES) precisa aparecer nesta lista, ser editável/
  // visualizável (reaproveita 100% de `_abrirEditor`/`_abrirVisualizador`/
  // `_persistirMolde` — todos já genéricos por `tipo`, nenhuma mudança
  // necessária neles) E precisar dar pra COLOCAR no mapa (catálogo de
  // objetos do "Ver em 3D"/rodapé 2D). Em vez de inventar um sistema
  // paralelo, aproveita a mesma tabela `OBJECT3D_PROFILES` (perfil-padrão
  // genérico "caixa cinza", usado por QUALQUER tipo sem construtor
  // dedicado — confirmado lendo engine3d.js `_buildOneObjectMesh`/
  // `_buildTypeMoldeMesh`: o lookup do molde customizado é sempre por
  // `obj.tipo` como STRING livre, `this._objectModelsByTipo[obj.tipo]`,
  // nunca uma lista fixa de 33 chaves) e `Icons.MAP_OBJECT_EXTRAS` (pro
  // ícone/rótulo aparecerem no catálogo de colocar objetos,
  // `Icons.mapObjectCatalog()`, que já lê as chaves de `MAP_OBJECT_EXTRAS`
  // DINAMICAMENTE a cada chamada — nenhuma mudança necessária lá também).
  // A LISTA de quais tipos são customizados (nome escolhido pelo usuário,
  // pra sobreviver a um F5) é persistida em `DB.setting`
  // ('customObjectModelTypes' — reaproveita o mecanismo genérico de
  // configuração já existente, `DB.getSetting`/`setSetting`, em vez de
  // criar uma IndexedDB object store NOVA, que exigiria mexer no
  // `onupgradeneeded`/versão do banco — delicado demais pra fazer sem
  // poder testar ao vivo nesta sessão). `ensureCustomTypesRegistered`
  // aplica essa lista em `OBJECT3D_PROFILES`/`Icons.MAP_OBJECT_EXTRAS` — só
  // precisa rodar UMA VEZ por carregamento da página, cedo o bastante
  // pra valer tanto aqui (esta tela) quanto no "Ver em 3D" (chamada
  // também no `mount()` de view3d.js, ver lá). Idempotente (`_registered`
  // guarda se já rodou) — seguro chamar de mais de um lugar.
  //
  // Representação 2D (SVG): guardada à parte, em OUTRA configuração
  // (`customIconSvgOverrides`, tipo -> string SVG) — vale tanto pra um tipo
  // CUSTOMIZADO quanto pra um dos 33 tipos FIXOS (o pedido não distingue
  // "dele" a um tipo específico — faz sentido poder redesenhar o ícone 2D
  // de qualquer um). Aplicada por cima do ícone padrão (`Icons.LIBRARY`/
  // `MAP_OBJECT_EXTRAS`) no mesmo `ensureCustomTypesRegistered`.
  _customTypesRegistered: false,

  async ensureCustomTypesRegistered() {
    if (this._customTypesRegistered) return;
    const customTipos = await DB.getSetting('customObjectModelTypes', []);
    (customTipos || []).forEach((c) => {
      if (!c || !c.tipo) return;
      if (window.OBJECT3D_PROFILES && !window.OBJECT3D_PROFILES[c.tipo]) {
        window.OBJECT3D_PROFILES[c.tipo] = { shape: 'box', w: 0.4, d: 0.4, h: 0.4, y0: 0, color: 0x8a92a3 };
      }
      if (window.Icons?.MAP_OBJECT_EXTRAS) {
        const existente = window.Icons.MAP_OBJECT_EXTRAS[c.tipo];
        if (existente) existente.label = c.nome || existente.label; // nome pode ter sido trocado (renomear) desde o último carregamento
        else window.Icons.MAP_OBJECT_EXTRAS[c.tipo] = { label: c.nome || c.tipo, svg: this._DEFAULT_CUSTOM_SVG };
      }
    });
    const overrides = await DB.getSetting('customIconSvgOverrides', {});
    Object.keys(overrides || {}).forEach((tipo) => {
      const svg = overrides[tipo];
      if (!svg) return;
      if (window.Icons?.LIBRARY?.[tipo]) window.Icons.LIBRARY[tipo].svg = svg;
      else if (window.Icons?.MAP_OBJECT_EXTRAS?.[tipo]) window.Icons.MAP_OBJECT_EXTRAS[tipo].svg = svg;
    });
    this._customTypesRegistered = true;
  },

  _DEFAULT_CUSTOM_SVG: '<rect x="20" y="20" width="60" height="60" rx="8" fill="#8a92a3"/>',

  /** "Criar novo modelo" — pedido verbatim (ver comentário grande acima).
   *  Pede só o NOME (o `tipo`/id interno é gerado, nunca digitado — evita
   *  colisão com os 33 tipos fixos ou com outro modelo customizado). Nasce
   *  sem nenhum nível customizado ainda (⬜ Padrão do app/caixa cinza
   *  genérica, igual a qualquer tipo novo) — o usuário edita normalmente
   *  pelos botões ✏️ Editar de sempre, já reaproveitados. */
  async _criarNovoModelo() {
    const nome = (prompt('Nome do novo modelo:') || '').trim();
    if (!nome) return;
    const tipo = `custom-${Utils.uid ? Utils.uid('m') : Date.now()}`;
    const lista = await DB.getSetting('customObjectModelTypes', []);
    lista.push({ tipo, nome, criadoEm: DB.nowISO?.() || new Date().toISOString() });
    await DB.setSetting('customObjectModelTypes', lista);
    this._customTypesRegistered = false; // força reaplicar (inclui o novo tipo) na próxima checagem
    await this.ensureCustomTypesRegistered();
    Utils.toast?.(`"${nome}" criado — edite os níveis Detalhado/Low poly abaixo.`, { type: 'ok' });
    await this._render();
  },

  /** "Trocar o nome do modelo" — pedido verbatim. Só pros modelos
   *  CUSTOMIZADOS (criados pelo usuário) — os 33 tipos fixos do catálogo
   *  (mesa/cadeira/etc.) mantêm o nome do catálogo, usado em vários outros
   *  lugares do app além desta tela (ficha de item, filtros...), então
   *  renomear especificamente ELES fica fora do escopo deste pedido. */
  async _renomearCustom(tipo) {
    const lista = await DB.getSetting('customObjectModelTypes', []);
    const entrada = lista.find((c) => c.tipo === tipo);
    if (!entrada) return;
    const novoNome = (prompt('Novo nome:', entrada.nome) || '').trim();
    if (!novoNome || novoNome === entrada.nome) return;
    entrada.nome = novoNome;
    await DB.setSetting('customObjectModelTypes', lista);
    if (window.Icons?.MAP_OBJECT_EXTRAS?.[tipo]) window.Icons.MAP_OBJECT_EXTRAS[tipo].label = novoNome;
    Utils.toast?.('Nome atualizado.', { type: 'ok' });
    await this._render();
  },

  /** NOVO (12/09/2026), pedido verbatim: "deve ser possível definir
   *  características de cada objeto [...] adicionar scrips para os
   *  objetos [...] Esta padronização é para que ao criar novos objetos,
   *  eles possam seguir os mesmos modelos." Abre o MESMO editor de
   *  componentes tela-cheia que `js/mapview.js` já usa pra um objeto
   *  individual (`_openComponentsEditorFullscreen`/
   *  `_renderComponentsEditor`) — zero UI nova/duplicada — só que o
   *  "entity" passado pra ele é um objeto de MENTIRA (`{ components }`),
   *  representando o MOLDE padrão deste `tipo` (ver js/objectstandard.js),
   *  não uma entidade real do mapa. `salvar` grava o resultado de volta em
   *  `ObjectStandard.setDefaultComponents(tipo, ...)` em vez de
   *  `DB.saveMap` (não há mapa aberto nesta tela). Exige `window.MapView`
   *  já montado no DOM em algum lugar — como esta tela ("Ferramentas" >
   *  "Objetos" > "Acessar modelos") só é alcançável de DENTRO do Mapa 2D
   *  (ver comentário no topo do arquivo: "fica NO PAINEL DE OBJETOS DO
   *  MAPA"), `MapView` sempre está montado quando este botão é clicável —
   *  por isso não precisa (re)montá-lo aqui. */
  async _abrirComportamentoPadrao(tipo) {
    if (!window.MapView || !window.ObjectStandard) {
      Utils.toast?.('Não foi possível abrir o editor de comportamento agora.', { type: 'danger' });
      return;
    }
    const componentsAtuais = await window.ObjectStandard.getDefaultComponents(tipo);
    const molde = { components: componentsAtuais };
    const salvar = async (patch) => {
      if (Array.isArray(patch?.components)) {
        molde.components = patch.components;
        await window.ObjectStandard.setDefaultComponents(tipo, patch.components);
      }
    };
    window.MapView._openComponentsEditorFullscreen(molde, salvar, () => {
      Utils.toast?.(`💾 Comportamento padrão de "${this._label(tipo)}" salvo — vale só pra objetos NOVOS deste tipo, a partir de agora.`, { type: 'ok', duration: 4000 });
    });
  },

  /** Editor 2D de SVG (pedido verbatim: "Deve ser possível fazer uma
   *  representação 2D dele. Com formas SVG em um editor 2D de SVG para
   *  isso.") — modal simples: desenha formas básicas (retângulo/círculo/
   *  linha/traço livre) num `<svg viewBox="0 0 100 100">` (mesmo viewBox
   *  convencionado pelos ícones já existentes do app, ver ICON_LIBRARY em
   *  icons.js — todos usam 0 0 100 100), com cor de preenchimento/traço
   *  escolhível. "Salvar" grava o `innerHTML` do `<svg>` como o ícone 2D
   *  desse tipo (`customIconSvgOverrides`, ver `ensureCustomTypesRegistered`
   *  acima) — vale tanto pra um tipo customizado quanto pra um dos 33 fixos.
   *  Vale tanto pro editor 2D em si (usado pelo restante do app pra
   *  desenhar o objeto na planta baixa/miniatura) quanto pro ícone que
   *  aparece nesta própria lista/no catálogo de colocar objetos. */
  async _abrirEditor2D(tipo) {
    if (this._sessao) return;
    const overrides = await DB.getSetting('customIconSvgOverrides', {});
    const svgAtual = overrides[tipo] || this._svg(tipo) || '';

    const overlay = document.createElement('div');
    overlay.className = 'modelos3d-svg-overlay';
    overlay.innerHTML = `
      <div class="modelos3d-svg-modal">
        <div class="modelos3d-svg-head">
          <strong>🎨 Representação 2D — ${Utils.escapeHtml(this._label(tipo))}</strong>
          <button type="button" class="btn secondary sm" id="m3dv-svg-fechar">✕ Fechar</button>
        </div>
        <div class="modelos3d-svg-toolbar">
          <button type="button" class="btn secondary sm modelos3d-svg-tool active" data-tool="retangulo" title="Desenhar retângulo (clique e arraste)">▭ Retângulo</button>
          <button type="button" class="btn secondary sm modelos3d-svg-tool" data-tool="circulo" title="Desenhar círculo (clique e arraste do centro pra fora)">◯ Círculo</button>
          <button type="button" class="btn secondary sm modelos3d-svg-tool" data-tool="linha" title="Desenhar linha (clique e arraste)">／ Linha</button>
          <button type="button" class="btn secondary sm modelos3d-svg-tool" data-tool="livre" title="Traço livre (clique, arraste, solte)">✏️ Traço livre</button>
          <label class="modelos3d-svg-color-label" title="Cor de preenchimento">🎨 <input type="color" id="m3dv-svg-fill" value="#8a92a3"></label>
          <label class="modelos3d-svg-color-label" title="Cor do traço">✏️ <input type="color" id="m3dv-svg-stroke" value="#1a1f26"></label>
          <!-- NOVO (03/09/2026), pedido do usuário: "Na representação 2D do
               modelo, deve ser possível definir a espessura da linha."
               Controla o stroke-width de toda forma NOVA desenhada a
               partir de agora (retângulo/círculo/linha/traço livre) — não
               reaplica retroativamente nas formas já existentes no SVG (elas
               mantêm a espessura que tinham quando foram desenhadas, igual a
               cor de preenchimento/traço, que também só valem pras formas
               novas). Unidades do viewBox (0-100), não px de tela. -->
          <label class="modelos3d-svg-color-label" title="Espessura da linha (borda/traço) das formas novas">📏 <input type="number" id="m3dv-svg-espessura" min="0.5" max="10" step="0.5" value="2" style="width:48px"></label>
          <button type="button" class="btn secondary sm" id="m3dv-svg-undo" title="Desfazer a última forma desenhada (Ctrl+Z)">↩️ Desfazer</button>
          <button type="button" class="btn secondary sm" id="m3dv-svg-clear" title="Apagar tudo e começar do zero">🗑️ Limpar</button>
        </div>
        <div class="modelos3d-svg-canvas-wrap">
          <svg id="m3dv-svg-canvas" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${svgAtual}</svg>
        </div>
        <div class="modelos3d-svg-foot">
          <button type="button" class="btn secondary sm" id="m3dv-svg-restaurar">↺ Restaurar ícone padrão</button>
          <button type="button" class="btn primary sm" id="m3dv-svg-salvar">💾 Salvar</button>
        </div>
      </div>`;
    this._container.appendChild(overlay);

    const svgEl = overlay.querySelector('#m3dv-svg-canvas');
    const fillInput = overlay.querySelector('#m3dv-svg-fill');
    const strokeInput = overlay.querySelector('#m3dv-svg-stroke');
    const espessuraInput = overlay.querySelector('#m3dv-svg-espessura');
    // CORRIGIDO (03/09/2026), pedido do usuário: "O ctrl+z deve voltar ao
    // início. Fiz um teste, apertei ctrl+z, mesmo não tendo feito nada, e o
    // desenho desapareceu." Causa raiz: "↩️ Desfazer" removia
    // `svgEl.lastElementChild` incondicionalmente — sem NENHUMA pilha de
    // histórico, sem distinguir "forma desenhada NESTA sessão" de "forma que
    // já existia no ícone original" (`svgAtual`, carregado logo acima) — ou
    // seja, tanto o botão quanto (agora) Ctrl+Z simplesmente iam apagando o
    // desenho ORIGINAL, elemento por elemento, mesmo sem o usuário ter
    // desenhado nada de novo. Corrigido com uma pilha de verdade
    // (`addedEls`), que só registra formas ADICIONADAS nesta sessão de
    // edição — desfazer (botão OU Ctrl+Z, adicionado agora) tira só do topo
    // dela e é um NO-OP quando ela está vazia (nunca mexe no desenho
    // original), exatamente "voltar ao início" e nada além disso.
    const addedEls = [];
    let tool = 'retangulo';
    overlay.querySelectorAll('.modelos3d-svg-tool').forEach((btn) => {
      btn.onclick = () => {
        overlay.querySelectorAll('.modelos3d-svg-tool').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        tool = btn.dataset.tool;
      };
    });

    // Converte um clique/arraste em cima do <svg> pra coordenadas do
    // viewBox (0-100), independente do tamanho real em tela do elemento —
    // mesma técnica padrão de qualquer editor SVG baseado em ponteiro.
    const svgPoint = (ev) => {
      const r = svgEl.getBoundingClientRect();
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
    };
    const NS = 'http://www.w3.org/2000/svg';
    let drawing = null; // { el, tool, start } — forma sendo desenhada NESTE arraste
    let freePoints = [];
    const onDown = (ev) => {
      ev.preventDefault();
      const p = svgPoint(ev);
      const fill = fillInput.value, stroke = strokeInput.value;
      // NOVO (03/09/2026) — "espessura da linha" (ver input #m3dv-svg-espessura
      // acima): lida a cada nova forma (não muda formas já desenhadas).
      const esp = String(parseFloat(espessuraInput.value) || 2);
      if (tool === 'retangulo') {
        const el = document.createElementNS(NS, 'rect');
        el.setAttribute('x', p.x); el.setAttribute('y', p.y); el.setAttribute('width', 0); el.setAttribute('height', 0);
        el.setAttribute('fill', fill); el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', esp);
        svgEl.appendChild(el);
        drawing = { el, tool, start: p };
      } else if (tool === 'circulo') {
        const el = document.createElementNS(NS, 'circle');
        el.setAttribute('cx', p.x); el.setAttribute('cy', p.y); el.setAttribute('r', 0);
        el.setAttribute('fill', fill); el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', esp);
        svgEl.appendChild(el);
        drawing = { el, tool, start: p };
      } else if (tool === 'linha') {
        const el = document.createElementNS(NS, 'line');
        el.setAttribute('x1', p.x); el.setAttribute('y1', p.y); el.setAttribute('x2', p.x); el.setAttribute('y2', p.y);
        el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', esp); el.setAttribute('stroke-linecap', 'round');
        svgEl.appendChild(el);
        drawing = { el, tool, start: p };
      } else if (tool === 'livre') {
        freePoints = [p];
        const el = document.createElementNS(NS, 'path');
        el.setAttribute('d', `M ${p.x} ${p.y}`);
        el.setAttribute('fill', 'none'); el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', esp);
        el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
        svgEl.appendChild(el);
        drawing = { el, tool, start: p };
      }
    };
    const onMove = (ev) => {
      if (!drawing) return;
      ev.preventDefault();
      const p = svgPoint(ev);
      if (drawing.tool === 'retangulo') {
        const x = Math.min(drawing.start.x, p.x), y = Math.min(drawing.start.y, p.y);
        drawing.el.setAttribute('x', x); drawing.el.setAttribute('y', y);
        drawing.el.setAttribute('width', Math.abs(p.x - drawing.start.x));
        drawing.el.setAttribute('height', Math.abs(p.y - drawing.start.y));
      } else if (drawing.tool === 'circulo') {
        const r = Math.hypot(p.x - drawing.start.x, p.y - drawing.start.y);
        drawing.el.setAttribute('r', r);
      } else if (drawing.tool === 'linha') {
        drawing.el.setAttribute('x2', p.x); drawing.el.setAttribute('y2', p.y);
      } else if (drawing.tool === 'livre') {
        freePoints.push(p);
        drawing.el.setAttribute('d', 'M ' + freePoints.map((pt) => `${pt.x} ${pt.y}`).join(' L '));
      }
    };
    const onUp = () => {
      if (drawing && (drawing.tool === 'retangulo' || drawing.tool === 'circulo')) {
        // Forma minúscula (clique sem arrastar de verdade) — remove, não
        // deixa "lixo" invisível acumulando no SVG salvo.
        const w = parseFloat(drawing.el.getAttribute('width') || drawing.el.getAttribute('r') || '0');
        if (w < 1) drawing.el.remove();
        else addedEls.push(drawing.el); // ver comentário grande em `addedEls` acima
      } else if (drawing) {
        addedEls.push(drawing.el); // linha/traço livre — sempre contam (sem teste de tamanho mínimo, igual ao comportamento de sempre)
      }
      drawing = null;
      freePoints = [];
    };
    svgEl.addEventListener('pointerdown', onDown);
    svgEl.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // Desfazer (botão OU Ctrl+Z, ver keydown abaixo) — ver comentário grande
    // em `addedEls` acima pro porquê (bug corrigido 03/09/2026).
    const desfazer = () => {
      const el = addedEls.pop();
      if (el) el.remove(); // no-op silencioso se `addedEls` já está vazio — "voltar ao início" nunca vai além dele
    };
    overlay.querySelector('#m3dv-svg-undo').onclick = desfazer;
    // NOVO (03/09/2026) — pedido do usuário testou literalmente "apertei
    // ctrl+z"; o atalho de teclado não existia antes (só o botão), então o
    // teste dele na certa estava caindo no undo GLOBAL do app (History.js,
    // ligado ao documento inteiro) — que nada tem a ver com este editor.
    // Adiciona o atalho de verdade AQUI, escutado só enquanto este overlay
    // está aberto, e para propagação (`stopPropagation`) pra não disparar
    // TAMBÉM o undo global do resto do app ao mesmo tempo.
    const onKeyDown = (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.code === 'KeyZ') {
        ev.preventDefault(); ev.stopPropagation();
        desfazer();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    overlay.querySelector('#m3dv-svg-clear').onclick = () => {
      if (confirm('Apagar todo o desenho e começar do zero?')) { svgEl.innerHTML = ''; addedEls.length = 0; }
    };
    overlay.querySelector('#m3dv-svg-restaurar').onclick = async () => {
      if (!confirm('Restaurar o ícone padrão do app pra este tipo (descarta o desenho customizado salvo)?')) return;
      const ov = await DB.getSetting('customIconSvgOverrides', {});
      delete ov[tipo];
      await DB.setSetting('customIconSvgOverrides', ov);
      Utils.toast?.('Ícone restaurado ao padrão.', { type: 'ok' });
      fechar();
      await this._render();
    };
    const fechar = () => {
      svgEl.removeEventListener('pointerdown', onDown);
      svgEl.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
    };
    overlay.querySelector('#m3dv-svg-fechar').onclick = fechar;
    overlay.querySelector('#m3dv-svg-salvar').onclick = async () => {
      const svgMarkup = svgEl.innerHTML.trim();
      const ov = await DB.getSetting('customIconSvgOverrides', {});
      if (svgMarkup) ov[tipo] = svgMarkup; else delete ov[tipo];
      await DB.setSetting('customIconSvgOverrides', ov);
      if (window.Icons?.LIBRARY?.[tipo]) window.Icons.LIBRARY[tipo].svg = svgMarkup || this._DEFAULT_CUSTOM_SVG;
      else if (window.Icons?.MAP_OBJECT_EXTRAS?.[tipo]) window.Icons.MAP_OBJECT_EXTRAS[tipo].svg = svgMarkup || this._DEFAULT_CUSTOM_SVG;
      Utils.toast?.('💾 Representação 2D salva.', { type: 'ok' });
      fechar();
      await this._render();
    };
  },

  /** Chamado por App.navigate ao sair desta tela (bottomnav, outro botão de
   *  rota etc.) — se havia uma sessão de EDIÇÃO em andamento sem o usuário
   *  ter clicado em "Salvar e sair" primeiro, ainda assim persiste o que já
   *  estava editado (mesmo espírito de "nunca perder o que a pessoa já fez"
   *  do resto do app) antes de descartar o contexto WebGL — sem isso, sair
   *  no meio de uma edição pelo bottomnav perderia o trabalho em silêncio. */
  unmount() {
    this._encerrarSessao().catch(() => {});
    this._container = null;
    this._onCloseOverride = null;
  },

  _label(tipo) {
    return window.Icons?.LIBRARY?.[tipo]?.label || window.Icons?.MAP_OBJECT_EXTRAS?.[tipo]?.label || tipo;
  },
  _svg(tipo) {
    return window.Icons?.LIBRARY?.[tipo]?.svg || window.Icons?.MAP_OBJECT_EXTRAS?.[tipo]?.svg || '';
  },

  async _render() {
    const container = this._container;
    if (!container) return;
    const modelos = await DB.getAllObjectModels();
    const porTipo = {};
    modelos.forEach((m) => { (porTipo[m.tipo] || (porTipo[m.tipo] = {}))[m.nivel] = true; });
    const tipos = Object.keys(window.OBJECT3D_PROFILES || {}).sort((a, b) => this._label(a).localeCompare(this._label(b), 'pt-BR'));
    // NOVO (07/09/2026) — ver comentário grande no botão "📥 Importar .obj"
    // logo abaixo (HTML do toolbar).
    const importados = window.ObjImport?.listImported?.() || [];

    container.innerHTML = `
      <div class="view-pad">
        <div class="settings-close-bar">
          <button class="btn secondary sm" id="m3dv-close" title="Fechar e voltar">✕ Fechar</button>
        </div>
        <p class="modelos3d-intro">
          Edite o modelo 3D de cada tipo de objeto padrão do catálogo — em dois níveis, um mais <b>detalhado</b> e um <b>low poly</b> (mais leve, menos detalhes). Quando os DOIS níveis de um tipo estão customizados, o app troca entre eles sozinho conforme a distância da câmera, pra melhorar o desempenho. Um tipo sem nenhum nível customizado continua usando o modelo padrão do app normalmente — customizar é opcional, tipo a tipo.
        </p>
        <div class="modelos3d-toolbar">
          <button type="button" class="btn primary sm" id="m3dv-novo-modelo" title="Criar um modelo 3D novo do zero, com nome escolhido por você">➕ Criar novo modelo</button>
          <!-- NOVO (07/09/2026), pedido verbatim: "poder carregar modelos 3D
               externos [...] Os objetos carregados devem poder ser
               acessados pela ferramenta 'Objetos' no 2D e no 3D. No 2D,
               pela ferramenta 'Objetos', no botão 'Acessar modelos' deve
               ser possível visualizar os objetos carregados e, também,
               definir um ícone 2D para cada objeto." — mesmo parser/
               mecanismo de importação já existente (js/objimport.js,
               rodada 51 — .obj em memória, some com F5), só que agora
               também acessível DAQUI (antes só existia dentro do painel de
               objetos do "Ver em 3D"), pra caber no pedido de "no 2D E no
               3D". Lista/ícone dos importados aparecem na seção
               "📥 Objetos importados (.obj)" logo abaixo da lista de tipos
               padrão — ver _render (bloco importados). -->
          <label class="btn secondary sm modelos3d-import-btn" title="Escolher um ou mais arquivos .obj do seu aparelho — fica disponível na ferramenta Objetos (2D e 3D) até a página recarregar">
            📥 Importar .obj<input type="file" accept=".obj" multiple id="m3dv-obj-input" style="display:none">
          </label>
        </div>
        <div class="modelos3d-list" id="m3dv-list">
          ${tipos.map((tipo) => this._rowHtml(tipo, porTipo[tipo] || {})).join('')}
        </div>
        ${importados.length ? `
          <h3 style="margin-top:18px">📥 Objetos importados (.obj)</h3>
          <p class="modelos3d-intro">Carregados nesta sessão a partir de arquivos .obj — ficam só na memória do navegador (somem se a página recarregar). Aqui dá pra definir a representação 2D (ícone) de cada um; o modelo 3D em si é o do próprio arquivo carregado, sem edição de vértices/low poly.</p>
          <div class="modelos3d-list" id="m3dv-list-importados">
            ${importados.map((i) => `
              <div class="modelos3d-row">
                <div class="modelos3d-row-head">
                  <span class="ic">${this._svg(i.key)}</span><span class="t">${Utils.escapeHtml(i.label)}</span>
                  <span class="modelos3d-row-head-actions">
                    <button type="button" class="btn secondary sm m3dv-2d-import" data-tipo="${Utils.escapeHtml(i.key)}" title="Editar a representação 2D (ícone SVG) deste objeto importado, usado na planta baixa">🎨 Representação 2D</button>
                  </span>
                </div>
              </div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
    // CORRIGIDO (03/09/2026) — pedido do usuário: "ao clicar em 'Fechar'
    // deve voltar para o mapa com a janela dos objetos aberta, não deve
    // voltar a tela do 'Mapa'." `App.back('mapa')` sempre reiniciava a tela
    // do Mapa na tela de ENTRADA — ver App.closeModelos3D (app.js) pra
    // causa raiz completa/correção (mesmo padrão de App.closeView3D).
    container.querySelector('#m3dv-close').onclick = () => (this._onCloseOverride ? this._onCloseOverride() : App.closeModelos3D());
    // NOVO (02/09/2026) — botão "criar novo modelo" (item 3 do pedido),
    // ver bloco grande de comentário acima de `_criarNovoModelo`.
    container.querySelector('#m3dv-novo-modelo').onclick = () => this._criarNovoModelo();
    // NOVO (07/09/2026) — ver comentário grande no HTML do botão acima.
    const objInput = container.querySelector('#m3dv-obj-input');
    if (objInput) {
      objInput.onchange = async () => {
        const n = await window.ObjImport?.importFiles?.(objInput.files);
        if (n > 0) Utils.toast?.(`${n} objeto(s) .obj importado(s) ✓ — já disponível na ferramenta Objetos.`, { type: 'ok' });
        await this._render(); // reconstrói já com a nova seção "Objetos importados"
      };
    }
    container.querySelectorAll('.m3dv-2d-import').forEach((btn) => {
      btn.onclick = () => this._abrirEditor2D(btn.dataset.tipo);
    });
    tipos.forEach((tipo) => {
      // NOVO (02/09/2026) — "trocar o nome do modelo" (item 4, só pros
      // tipos CUSTOMIZADOS — ver comentário em `_renomearCustom`) e
      // "representação 2D" (item 5, qualquer tipo — ver `_abrirEditor2D`).
      const btnRenomear = container.querySelector(`.m3dv-renomear[data-tipo="${CSS.escape(tipo)}"]`);
      if (btnRenomear) btnRenomear.onclick = () => this._renomearCustom(tipo);
      const btn2D = container.querySelector(`.m3dv-2d[data-tipo="${CSS.escape(tipo)}"]`);
      if (btn2D) btn2D.onclick = () => this._abrirEditor2D(tipo);
      // NOVO (12/09/2026) — ver comentário grande junto ao botão, acima.
      const btnComportamento = container.querySelector(`.m3dv-comportamento[data-tipo="${CSS.escape(tipo)}"]`);
      if (btnComportamento) btnComportamento.onclick = () => this._abrirComportamentoPadrao(tipo);
    });
    tipos.forEach((tipo) => {
      ['detalhado', 'lowpoly'].forEach((nivel) => {
        const row = container.querySelector(`.modelos3d-nivel[data-tipo="${CSS.escape(tipo)}"][data-nivel="${nivel}"]`);
        if (!row) return;
        row.querySelector('.m3dv-editar').onclick = () => this._abrirEditor(tipo, nivel);
        // CORRIGIDO (01/09/2026) — pedido verbatim (item grande "correções no
        // visualizador/editor de Modelos 3D"): "O 3D dos dois modelos dos
        // objetos deve ser possível visualizá-los, mesmo sem ter editado eles
        // ainda. Atualmente, aparece a mensagem 'Só disponível depois de
        // customizar este nível'." Causa raiz: o botão "Ver em 3D" ficava
        // `disabled` (e o handler nem era ligado) quando o nível ainda não
        // tinha molde customizado salvo — mas `_montarCenaMolde` já lida
        // perfeitamente com a ausência de `customMesh` (o Engine3D cai no
        // profile/construtor padrão daquele tipo, igual ao mapa normal).
        // Botão sempre habilitado agora, ligado incondicionalmente.
        const btnVer = row.querySelector('.m3dv-ver');
        if (btnVer) btnVer.onclick = () => this._abrirVisualizador(tipo, nivel);
        const btnRemover = row.querySelector('.m3dv-remover');
        if (btnRemover) btnRemover.onclick = () => this._remover(tipo, nivel);
      });
    });
  },

  // NOVO (02/09/2026) — tipo customizado (criado via "➕ Criar novo
  // modelo") sempre começa com "custom-" (gerado em `_criarNovoModelo`,
  // nunca digitado pelo usuário) — usado aqui só pra decidir se mostra o
  // botão "✏️ Renomear" (só faz sentido pra estes, ver `_renomearCustom`).
  _isCustomType(tipo) {
    return typeof tipo === 'string' && tipo.startsWith('custom-');
  },

  _rowHtml(tipo, status) {
    const nivelHtml = (nivel, nomeNivel) => {
      const customizado = !!status[nivel];
      return `
        <div class="modelos3d-nivel" data-tipo="${Utils.escapeHtml(tipo)}" data-nivel="${nivel}">
          <div class="modelos3d-nivel-status">${customizado ? '✅ Customizado' : '⬜ Padrão do app'} — <b>${nomeNivel}</b></div>
          <div class="modelos3d-nivel-actions">
            <button type="button" class="btn secondary sm m3dv-editar" title="Editar este nível no Modelador 3D (vértices/arestas/faces)">✏️ Editar</button>
            <button type="button" class="btn secondary sm m3dv-ver" title="${customizado ? 'Ver este molde em 3D, sozinho, sem o mapa' : 'Ver o modelo padrão do app em 3D, sozinho, sem o mapa (ainda não customizado)'}">👁️ Ver em 3D</button>
            <!-- RENOMEADO (03/09/2026) — pedido do usuário: "Ao editar um
                 modelo, o botão que aparece, não deve se chamar 'Remover',
                 deve ser 'Restaurar padrão'." O comportamento já ERA
                 exatamente isso (o atributo title já dizia "volta a usar o modelo
                 padrão do app" — ver confirm() no handler, .m3dv-remover,
                 mais abaixo), só o RÓTULO visível estava enganoso — só texto
                 mudou, handler/classe/id continuam os mesmos.
                 BUG CORRIGIDO (03/09/2026, mesmo dia): este comentário tinha
                 caracteres de crase em volta de ".m3dv-remover" — como ele
                 mora DENTRO do template literal JS desta função (delimitado
                 por crase no início/fim do "return"), a 1ª crase FECHAVA a
                 string de verdade no meio do HTML e o resto virava código JS
                 de verdade (".m3dv-remover" interpretado como ".m3dv -
                 remover", uma subtração pelo identificador "remover", que
                 não existe em lugar nenhum) — quebrando a tela inteira com
                 "ReferenceError: remover is not defined" só ao MONTAR a
                 lista (nem chegava a abrir). Trocadas por texto simples,
                 sem nenhum caractere de crase. -->
            ${customizado ? '<button type="button" class="btn secondary sm m3dv-remover" title="Restaura o modelo padrão do app — descarta esta customização">↺ Restaurar padrão</button>' : ''}
          </div>
        </div>`;
    };
    const isCustom = this._isCustomType(tipo);
    return `
      <div class="modelos3d-row">
        <div class="modelos3d-row-head">
          <span class="ic">${this._svg(tipo)}</span><span class="t">${Utils.escapeHtml(this._label(tipo))}</span>
          ${tipo === 'escada' ? '<span class="modelos3d-badge-codigo" title="A escada continua sendo gerada por código quando suas dimensões/degraus são alterados dos valores padrão do catálogo — só nesse caso ela não usa a malha do arquivo.">🧩 gerado por código (se modificada)</span>' : ''}
          <span class="modelos3d-row-head-actions">
            ${isCustom ? `<button type="button" class="btn secondary sm m3dv-renomear" data-tipo="${Utils.escapeHtml(tipo)}" title="Trocar o nome deste modelo customizado">✏️ Renomear</button>` : ''}
            <button type="button" class="btn secondary sm m3dv-2d" data-tipo="${Utils.escapeHtml(tipo)}" title="Editar a representação 2D (ícone SVG) deste tipo, usado na planta baixa">🎨 Representação 2D</button>
            <!-- NOVO (12/09/2026), pedido verbatim: "deve ser possível
                 definir características de cada objeto [...] Esta
                 padronização é para que ao criar novos objetos, eles
                 possam seguir os mesmos modelos." Abre o MESMO editor de
                 componentes (Script/Gatilho de Evento) que um objeto
                 individual já usa (js/mapview.js, renderComponentsEditor)
                 — só que apontando pro MOLDE deste tipo (ver
                 abrirComportamentoPadrao abaixo), não uma entidade real
                 do mapa. Todo objeto NOVO deste tipo nasce com uma cópia
                 do que for salvo aqui (ver js/objectstandard.js/
                 js/mapping.js). -->
            <button type="button" class="btn secondary sm m3dv-comportamento" data-tipo="${Utils.escapeHtml(tipo)}" title="Configurar o comportamento padrão (scripts/gatilhos de evento) de objetos NOVOS deste tipo">⚙️ Comportamento padrão</button>
          </span>
        </div>
        <div class="modelos3d-niveis">
          ${nivelHtml('detalhado', 'Detalhado')}
          ${nivelHtml('lowpoly', 'Low poly')}
        </div>
      </div>`;
  },

  async _remover(tipo, nivel) {
    const nomeNivel = nivel === 'detalhado' ? 'Detalhado' : 'Low poly';
    if (!confirm(`Remover o molde customizado de "${this._label(tipo)}" (${nomeNivel})?\n\nVolta a usar o modelo padrão do app pra este nível.`)) return;
    await DB.deleteObjectModel(tipo, nivel);
    Utils.toast?.('Molde removido — voltou ao padrão do app.', { type: 'ok' });
    await this._render();
  },

  /** Monta uma cena 3D ISOLADA (Engine3D próprio, sem mapa/parede/outros
   *  objetos) com UM objeto fabricado do `tipo` pedido, já com o molde
   *  EXISTENTE daquele nível carregado nele (se houver — `obj.customMesh`),
   *  ou nenhum (novo, o Modelador cria um cubo padrão sozinho ao entrar —
   *  ver `Modeler3D.ensureCustomMesh`). Reaproveitado por `_abrirEditor` E
   *  `_abrirVisualizador`. `obj.tipo`/`largura`/`profundidade`/`altura`
   *  partem do PERFIL de catálogo daquele tipo (`OBJECT3D_PROFILES`) — só
   *  pra dar um tamanho inicial plausível a um molde novo; sem efeito
   *  nenhum quando já existe um molde salvo (a malha dele manda). */
  async _montarCenaMolde(tipo, nivel) {
    const perfil = window.OBJECT3D_PROFILES?.[tipo] || window.OBJECT3D_DEFAULT_PROFILE || { shape: 'box', w: 0.4, d: 0.4, h: 0.4, y0: 0, color: 0x8a92a3 };
    const existente = await DB.getObjectModel(tipo, nivel);
    // [15/09/2026 UTC] CORRIGIDO — pedido verbatim: "Em 'Objetos'->'Acessar
    // modelo'->'Editar', o modelo da mesa está aparecendo com as pernas
    // encurtadas. Porém ao colocar no mapa 2D e, depois, ir em 'Ver em 3D'
    // está sendo exibido normalmente." CAUSA RAIZ: para tipos que usam a
    // convenção "antiga" de `OBJECT3D_PROFILES` (`h` = só a ESPESSURA/altura
    // da peça, `y0` = elevação do chão até a base dela — caso de `mesa`:
    // `{ h: 0.05, y0: 0.72 }`, ver engine3d-profiles.js), esta linha lia só
    // `perfil.h` (0.05m — a espessura do TAMPO) como se fosse a altura TOTAL
    // do objeto falso montado aqui pro preview, ignorando `perfil.y0`
    // (0.72m, a elevação real do tampo). O objeto falso nasce sempre com
    // `forma:'retangulo'` (ver `ehCilindroOuCone` abaixo) e `obj.altura`
    // vira a altura TOTAL que `engine3d.js` usa pra essa forma (ramo
    // `obj.forma==='retangulo'` reconstrói `perfil` como `{h:obj.altura,
    // y0:0}`) — com `obj.altura` errado (0.05m em vez de 0.77m),
    // `_makeMesaMeshes` calculava `pernaAltura = max(0.05, h - tampoEsp) =
    // max(0.05, 0.05-0.03) = 0.05m`, pernas de 5cm só, "encolhidas". Já na
    // colocação normal no mapa 2D ("Ver em 3D" de verdade), o objeto vem de
    // `_MESA_FORMA_DEF` (mapview.js) com `obj.altura=0.74` (altura total de
    // verdade), por isso aparecia correto lá — não é um problema da malha da
    // Mesa em si, só deste preview isolado montando um `obj.altura` errado.
    // CORREÇÃO: somar `perfil.y0` (quando existir) a `perfil.h`, MESMA
    // normalização já usada por `_makeMesaMeshes` (engine3d.js, ver
    // comentário datado 13/09/2026 lá) — cobre as duas convenções sem
    // quebrar tipos que já usam `y0:0` (a soma não muda nada pra eles).
    const altura = (perfil.y0 || 0) + (perfil.h != null ? perfil.h : 0.5);
    const corHex = typeof perfil.color === 'number' ? '#' + perfil.color.toString(16).padStart(6, '0') : '#8a92a3';
    // [16/09/2026 UTC] CORRIGIDO — pedido verbatim: "nenhum objeto mais deve
    // ser por aproximação, deve sempre ser o próprio modelo real a ser
    // carregado... O que deve aparecer ali no editar/'Ver em 3D' é o que
    // aparece no 'Ver em 3D' [normal, da Planta baixa] — o mesmo que é
    // feito lá deve ser feito aqui." CAUSA RAIZ (bem mais profunda do que
    // parecia): este objeto FALSO sempre nascia com `forma:'retangulo'`,
    // não importa o tipo — mas `engine3d.js` `_buildOneObjectMesh` decide
    // TUDO a partir de `obj.forma` (não de `obj.tipo` sozinho): o ramo
    // `if (obj.forma === 'retangulo')` reconstrói `perfil` do zero como
    // `{shape:'box', w:obj.largura, ...}` — ou seja, ATÉ os tipos cujo
    // perfil de catálogo é `shape:'cylinder'`/`'cone'` (relógio, poste,
    // coluna, extintor, bebedouro, lixeira, ventilador, planta, robô)
    // ficavam com `perfil.shape` forçado pra `'box'` aqui, e as checagens
    // defensivas dos builders dedicados (`if (obj.tipo==='poste' &&
    // perfil.shape==='cylinder')`, `'relogio'` etc.) NUNCA batiam — todos
    // esses tipos caíam sempre numa CAIXA, tanto no preview do "Editar"
    // quanto no "Ver em 3D" (que nem chega a ter `customMesh` nenhum pra um
    // tipo nunca customizado — usava só este `obj` "cru", direto). Objetos
    // REAIS do catálogo nunca têm esse problema porque `Mapping.
    // defaultShapeForTipo` (mapping.js) já escolhe `forma:'poligono'`
    // (com `raio`/`lados`) pra esses tipos, nunca `'retangulo'` — este
    // objeto FALSO simplesmente não reproduzia essa mesma escolha.
    // CORRIGIDO: `forma`/campos agora espelham `defaultShapeForTipo`
    // exatamente — `'poligono'` (raio/lados) pra `shape:'cylinder'`/
    // `'cone'`, `'retangulo'` (largura/profundidade) pra `shape:'box'` —
    // fazendo `_buildOneObjectMesh` tomar EXATAMENTE o mesmo caminho (e
    // os MESMOS builders dedicados: mesa/luminária/escada/poste/relógio/
    // quadro-mesa/teto-gesso/carro) que a tela "Ver em 3D" normal da Planta
    // baixa usaria pro mesmo tipo — nenhuma aproximação, mesmo código.
    const ehCilindroOuCone = perfil.shape === 'cylinder' || perfil.shape === 'cone';
    const obj = {
      id: `molde-preview-${tipo}-${nivel}`,
      tipo,
      x: 0, y: 0, angulo: 0, piso: 0, elevacao: 0,
      altura,
      cor: corHex,
      ...(ehCilindroOuCone
        ? { forma: 'poligono', raio: perfil.r || 0.3, lados: Math.max(3, Math.round(perfil.segments || 24)) }
        : { forma: 'retangulo', largura: perfil.w || 0.5, profundidade: perfil.d || 0.5 }),
    };
    if (existente?.mesh && Array.isArray(existente.mesh.vertices) && existente.mesh.vertices.length >= 3) {
      obj.customMesh = {
        vertices: existente.mesh.vertices.map((v) => v.slice()),
        edges: (existente.mesh.edges || []).map((e) => e.slice()),
        faces: existente.mesh.faces.map((f) => f.slice()),
      };
      obj.customMeshXform = { rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    }
    const mapaFalso = { id: 'molde-preview-map', bounds: { minX: -3, minY: -3, maxX: 3, maxY: 3 }, objects: [obj], walls: [] };

    const overlay = document.createElement('div');
    overlay.className = 'modelos3d-overlay';
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'view3d-wrap';
    const canvas = document.createElement('canvas');
    canvas.id = 'v3d-canvas';
    canvasWrap.appendChild(canvas);
    overlay.appendChild(canvasWrap);
    this._container.appendChild(overlay);

    // CORRIGIDO (01/09/2026) — pedido verbatim: "O 'editar' dos modelos 3D
    // parece estar com baixíssima resolução tanto para o preenchimento do
    // modelo quanto para o gizmo." Causa raiz: `new Engine3D(canvas, {})`
    // passava config VAZIA — o Engine3D cai nos defaults internos fixos
    // (`engine3d.js`, entre eles `antialiasing3D: false`), **ignorando** a
    // preferência real do usuário salva em Configurações (MapConfig), ao
    // contrário da tela "Ver em 3D" normal (view3d.js, que sempre lê
    // `MapConfig.get()` antes de criar o Engine3D). Corrigido lendo a MESMA
    // config real aqui.
    const cfgReal = (typeof MapConfig !== 'undefined') ? await MapConfig.get() : {};
    // NOVO (07/09/2026), pedido verbatim: "tanto o 'Ver em 3D' quanto a
    // miniatura e, também, qualquer outro retângulo que possa ser colocado
    // um 'olho' para ver a cena" — este preview/editor de molde é o
    // 3º "olho" do app (ver engine3d.js, comentário grande "MODO EYE"),
    // reaproveitando o MESMO contexto WebGL único de tudo o mais, em vez de
    // criar o SEU PRÓPRIO (era exatamente esse padrão, repetido em 3
    // lugares diferentes do app, que causava o "Cannot read properties of
    // null (reading precision)" na miniatura quando 2 desses coexistiam).
    const engine = new Engine3D(canvas, cfgReal, { eye: true });
    await engine._loadPromise; // ver comentário grande no topo do arquivo — garante this._ready antes de setScene
    engine.setScene(mapaFalso);

    return { overlay, canvasWrap, canvas, engine, obj, mapaFalso };
  },

  /** NOVO (02/09/2026), pedido verbatim: "se abriu pelo botão 'editar' e
   *  não fez alteração alguma ou fez alterações, mas retrocedeu todas com
   *  CTRL+Z, de modo que voltasse ao seu modelo original, então, não deve
   *  ficar como 'Customizado', pois continua no modelo padrão." Serializa a
   *  malha/transform tal como estão AGORA — comparada byte a byte (mesmos
   *  números exatos, sem nenhum arredondamento) com o snapshot tirado no
   *  INÍCIO da sessão (`s.initialSnapshot`, ver `_abrirEditor`) pra decidir,
   *  em `_persistirMolde`, se algo mudou DE VERDADE. Cobre os dois casos do
   *  pedido: "não fez alteração alguma" (a malha nunca mudou) e "desfez tudo
   *  com Ctrl+Z" (a malha voltou a ser IDÊNTICA à inicial — undo/redo neste
   *  Modelador sempre restaura o snapshot exato, sem operação aritmética
   *  nenhuma no meio, ver `ModelerMesh._applyFullSnapshot`, então não há
   *  risco de "quase igual" por arredondamento de ponto flutuante). */
  _snapshotMesh(obj) {
    const cm = obj.customMesh;
    if (!cm) return null;
    return JSON.stringify({ v: cm.vertices, e: cm.edges || [], f: cm.faces, x: obj.customMeshXform || {} });
  },

  async _abrirEditor(tipo, nivel) {
    if (this._sessao) return; // defensivo — não deveria disparar 2x (overlay cobre a lista inteira)
    let ctx;
    try {
      ctx = await this._montarCenaMolde(tipo, nivel);
    } catch (e) {
      Utils.toast?.(`Não consegui abrir o editor: ${e.message || e}`, { type: 'danger' });
      return;
    }
    // `hadExisting` precisa ser lido AGORA, ANTES de `Modeler3D.enter` (mais
    // abaixo) rodar — `enter` chama `ensureCustomMesh` internamente, que
    // preenche `ctx.obj.customMesh` com um cubo padrão se ainda estiver
    // vazio (nenhuma customização salva pra este nível ainda) — depois
    // disso não dá mais pra distinguir "já tinha molde salvo" de "acabou de
    // nascer o cubo padrão desta sessão" só olhando `ctx.obj.customMesh`.
    const hadExisting = !!ctx.obj.customMesh;
    const fakeView3d = {
      _engine: ctx.engine,
      _map: ctx.mapaFalso,
      _container: ctx.overlay,
      // Pose inicial (só usada por Modeler3D._initOrbitFromCamera pra
      // calcular a distância/ângulo de partida da órbita, ver modeler-
      // core.js) — arbitrária, um canto em diagonal olhando pro objeto.
      _camera: { x: 2.5, y: 1.6, z: 2.5, yaw: Math.PI * 0.75, pitch: -0.25 },
      EYE_HEIGHT: 1.65,
      _surfaceHeightAt: () => 0, // sem chão de verdade nesta cena isolada — só afeta a física da câmera Livre com gravidade LIGADA (recurso raro/opcional, ver modeler-input.js), que aqui simplesmente não tem chão nenhum pra "cair"
      _rebuildScene: () => {}, // nunca chamado de verdade (Modeler3D.exit só chama isto sem skipRebuild:true, que este arquivo nunca usa)
      _onModelerToggleForLockBadge: () => {},
    };
    this._sessao = { modo: 'editor', tipo, nivel, engine: ctx.engine, overlay: ctx.overlay, obj: ctx.obj, fakeView3d, hadExisting };

    // [15/09/2026 UTC] Barra flutuante trocada — pedido verbatim: "Em vez de
    // só um botão 'Salvar e sair do editor', coloque um botão 'Sair' (se foi
    // feita alguma alteração, ao clicar nele, deve aparecer uma janela de
    // confirmação informando para salvar as alterações) e um botão 'Salvar'
    // (aplica todas as alterações feitas no modelo do objeto, guardando no
    // IndexedDB). Retire o botão 'Sair do Modelador', pois a tela é para
    // edição mesmo." — "💾 Salvar" grava no IndexedDB sem fechar o editor
    // (ver handler abaixo); "🚪 Sair" fecha, perguntando antes se há
    // alteração não salva (ver `_sairEditor`, reescrito).
    // [15/09/2026 UTC] Ordem trocada — pedido verbatim: "Inverta a ordem dos
    // botões: 'Salvar' e 'Sair'. Troque-os de posição." (antes: Salvar,
    // Sair — agora: Sair, Salvar).
    const barra = document.createElement('div');
    barra.className = 'modelos3d-editor-bar';
    barra.innerHTML = `
      <button type="button" class="btn primary sm" id="m3dv-editor-sair" title="Fecha o editor — avisa antes se houver alteração ainda não salva">🚪 Sair</button>
      <button type="button" class="btn secondary sm" id="m3dv-editor-salvar" title="Aplica as alterações feitas no modelo, gravando no IndexedDB — sem fechar o editor">💾 Salvar</button>
    `;
    ctx.overlay.appendChild(barra);
    barra.querySelector('#m3dv-editor-salvar').onclick = () => this._salvarEditor();
    barra.querySelector('#m3dv-editor-sair').onclick = () => this._sairEditor();

    // NOVO (07/09/2026), pedido verbatim: "inquebrável, tudo com estrutura
    // try{}catch(){} [...]" — `this._sessao` (linha acima) já foi definida
    // ANTES de `Modeler3D.enter` rodar (precisa existir pra `_sairEditor`/
    // `_persistirMolde` funcionarem) — sem proteção própria aqui, uma falha
    // dentro de `enter` deixava `this._sessao` "meio pronta" (aponta pra um
    // Modelador que nunca terminou de entrar) e a barra flutuante "✅ Salvar
    // e sair" já no DOM, sem editor nenhum funcionando por trás — um estado
    // travado, sem aviso. Corrigido: desfaz tudo que já foi montado (barra +
    // overlay/cena, via `_montarCenaMolde`/`ctx.engine.dispose()`) e limpa
    // `this._sessao`, deixando a lista de tipos/níveis como se o clique em
    // "editar" nunca tivesse acontecido — igual ao caminho de erro já
    // existente logo acima, quando é `_montarCenaMolde` que falha.
    try {
      Modeler3D.enter(fakeView3d, ctx.obj);
    } catch (err) {
      barra.remove();
      try { ctx.engine.dispose(); } catch (_e) { /* já em falha — melhor esforço, não pode lançar de novo aqui */ }
      ctx.overlay.remove();
      this._sessao = null;
      if (typeof ModuleHost !== 'undefined') ModuleHost.showLoadError(`Editor de molde — ${this._label(tipo)}`, err);
      else console.error('Falha ao entrar no Modelador (editor de molde):', err);
      return;
    }
    // [15/09/2026 UTC] NOVO — pedido verbatim: "Logo que entra no modo editar,
    // o apontamento da câmera fica na mesma direção do eixo y. Faça o
    // objeto aparecer de modo que o gizmo fique visualmente na tela com o
    // eixo y apontando para cima, o eixo x apontando para baixo e à
    // direita (+110° em relação à linha vertical do eixo y) e o eixo z
    // apontando para baixo e à esquerda (-110° em relação à linha vertical
    // do eixo y)." Causa raiz: `Modeler3D.enter()` calcula a órbita inicial
    // com `_initOrbitFromCamera(state, _poseFromCurrentCamera(state))` — ou
    // seja, a partir da câmera REAL do motor (`state.camera`, já
    // posicionada por `engine.setScene()` dentro de `_montarCenaMolde`,
    // acima), NUNCA do `fakeView3d._camera` (aquele objeto é só um valor de
    // reserva — ver comentário antigo na sua declaração — nunca chega a ser
    // usado de fato neste caminho). Sem controle sobre a pose inicial do
    // motor, ela podia nascer olhando quase reto pra baixo (perto do eixo
    // Y), tornando o eixo Y do gizmo um pontinho degenerado na tela.
    // Corrigido sobrescrevendo `state.orbit.yaw`/`pitch` DIRETO, com os
    // ângulos exatos (derivados por trigonometria, conferidos numericamente
    // — yaw=45° dá simetria perfeita entre X e Z; pitch≈21,34° faz X cair
    // exatamente a +110° da vertical e Z a -110°, com Y sempre reto pra
    // cima nesta convenção de câmera, qualquer que seja o pitch) — não
    // mexe em `orbit.dist`/`orbit.target` (posição/zoom continuam como
    // `_initOrbitFromCamera` já calculou).
    if (window.Modeler3D?._state?.orbit) {
      window.Modeler3D._state.orbit.yaw = Math.PI / 4; // 45°
      window.Modeler3D._state.orbit.pitch = 0.37252696585266126; // ~21,34°
    }
    // Snapshot do PONTO DE PARTIDA — só depois de `enter` (que já garantiu
    // `ctx.obj.customMesh` preenchido, cubo padrão ou molde existente, ver
    // `hadExisting` acima) — comparado em `_persistirMolde` pra decidir se
    // algo mudou de verdade nesta sessão.
    this._sessao.initialSnapshot = this._snapshotMesh(ctx.obj);
    // [15/09/2026 UTC] Esconde o "✕ Sair do Modelador" nativo (modeler-ui.js
    // `#m3d-exit-btn`) — pedido verbatim: "Retire o botão 'Sair do
    // Modelador', pois a tela é para edição mesmo." Causa raiz do porquê
    // não fazia sentido aqui: aquele botão chama `Modeler3D.exit()` direto
    // (sem `skipRebuild`/sem persistir o molde no IndexedDB — ver
    // `_encerrarSessao`), deixando a barra flutuante e o overlay deste
    // arquivo órfãos na tela (um 2º botão de saída, incompleto, disputando
    // com "🚪 Sair" logo abaixo). Só oculto (`hidden`) — nunca removido do
    // DOM — pra não interferir em nada mais do módulo compartilhado
    // `modeler-ui.js`, usado normalmente (com o botão visível) pelo
    // Modelador de objeto único dentro de "Ver em 3D".
    const btnExitNativo = ctx.overlay.querySelector('#m3d-exit-btn');
    if (btnExitNativo) btnExitNativo.hidden = true;
    Utils.toast?.(`🔧 Editando "${this._label(tipo)}" — ${nivel === 'detalhado' ? 'Detalhado' : 'Low poly'}`, { duration: 3200 });
  },

  /** [15/09/2026 UTC] NOVO — botão "💾 Salvar" da barra flutuante (ver
   *  `_abrirEditor`): grava o molde no IndexedDB SEM fechar o editor —
   *  reaproveita a mesma sequência testada de "salvar e reabrir"  já usada
   *  pelo "+" de `_abrirVisualizador` (sai de verdade — `Modeler3D.exit`
   *  só sabe commitar/persistir no fechamento — e reabre imediatamente no
   *  MESMO tipo/nível, já com o molde recém-salvo carregado). */
  async _salvarEditor() {
    if (!this._sessao || this._sessao.modo !== 'editor') return;
    const { tipo, nivel } = this._sessao;
    await this._encerrarSessao({ persist: true });
    await this._abrirEditor(tipo, nivel);
  },

  /** [15/09/2026 UTC] REESCRITO — botão "🚪 Sair" da barra flutuante: pedido
   *  verbatim "se foi feita alguma alteração, ao clicar nele, deve aparecer
   *  uma janela de confirmação informando para salvar as alterações".
   *  DETECÇÃO DE MUDANÇA CORRIGIDA nesta rodada — pedido verbatim: "Mesmo
   *  clicando em 'Salvar', ao clicar em sair, logo em seguida, ainda
   *  aparece a pergunta de confirmação. Se não há mais nada para salvar,
   *  então, não deveria aparecer a pergunta." Causa raiz: a versão anterior
   *  comparava um SNAPSHOT (`JSON.stringify` da malha) antes/depois — mas
   *  `Modeler3D.exit()`/`_commit()` reconstrói a malha a partir do estado
   *  interno do editor (Three.js) ao sair, o que pode reformatar/arredondar
   *  os números de um jeito levemente diferente do snapshot inicial mesmo
   *  SEM nenhuma edição de verdade ter acontecido — um "falso positivo"
   *  (detecta mudança que não existe). Corrigido usando `state.actionLog`
   *  (o MESMO mecanismo que `_commit`/`enter` já usam pra decisões
   *  idênticas, ver comentário grande em `enter()`/`_commit()`,
   *  modeler-core.js — só ações de edição DE VERDADE, nunca reformatação
   *  interna, empurram algo pra lá): lido de `Modeler3D._state.actionLog`
   *  ANTES de sair (`Modeler3D.exit()` zera `Modeler3D._state`). Cada
   *  sessão do editor (`_abrirEditor`, inclusive a reaberta por
   *  `_salvarEditor` depois de salvar) começa com um `state` NOVO — logo,
   *  `actionLog` sempre nasce vazio de novo a cada abertura, garantindo que
   *  "Salvar" seguido de "Sair" sem tocar em mais nada nunca pergunta de
   *  novo. Sem alteração: fecha direto, sem diálogo. Com alteração: card de
   *  confirmação (`cards/confirm-card.js`, pedido verbatim: "deve ser um
   *  card... não um 'alert()'") — "💾 Salvar e sair" grava no IndexedDB
   *  antes de fechar, "🗑️ Sair sem salvar" fecha descartando a edição desta
   *  sessão (o molde salvo anteriormente, se havia, continua intacto),
   *  "✕ Cancelar" fecha o card e mantém o editor aberto, sem fazer nada. */
  async _sairEditor() {
    if (!this._sessao || this._sessao.modo !== 'editor') return;
    const s = this._sessao;
    // Lê `actionLog` com o Modelador AINDA ATIVO (não chama `Modeler3D.exit()`
    // aqui) — assim, escolhendo "✕ Cancelar" no card abaixo, o editor
    // simplesmente continua exatamente como estava, sem precisar desfazer
    // nenhum `exit()` já feito (não dava pra "religar" a UI do Modelador
    // depois de destruída). Só quando a escolha é "salvar"/"descartar" é
    // que `_encerrarSessao` (chamada dentro de `onChoose`) sai de verdade.
    const mudou = !!(window.Modeler3D?._state?.actionLog?.length);
    if (!mudou) {
      await this._encerrarSessao({ persist: false });
      await this._render();
      return;
    }
    window.CardSystem.mount(s.overlay, 'confirm', {
      title: 'Alterações não salvas',
      message: 'Este modelo tem alterações que ainda não foram gravadas no IndexedDB.',
      buttons: [
        { id: 'salvar', label: '💾 Salvar e sair', variant: 'primary' },
        { id: 'descartar', label: '🗑️ Sair sem salvar', variant: 'danger' },
        { id: 'cancelar', label: '✕ Cancelar', variant: 'secondary' },
      ],
      onChoose: async (id) => {
        if (id === 'cancelar') return; // fecha só o card — o editor continua aberto e intacto, nada foi tocado
        await this._encerrarSessao({ persist: id === 'salvar' });
        await this._render();
      },
    }, {});
  },

  async _abrirVisualizador(tipo, nivel) {
    if (this._sessao) return;
    // CORRIGIDO (01/09/2026) — ver comentário grande na chamada deste botão,
    // em `_render`. Antes, chegar aqui sem molde salvo travava com um toast
    // de aviso e nada abria; agora `_montarCenaMolde` monta a cena com o
    // profile/construtor PADRÃO do tipo (sem `customMesh`) e o aviso vira só
    // informativo, não bloqueia mais a visualização.
    const existente = await DB.getObjectModel(tipo, nivel);
    if (!existente?.mesh) Utils.toast?.('Este nível ainda não tem um molde customizado — mostrando o modelo padrão do app.', { type: 'info' });
    let ctx;
    try {
      ctx = await this._montarCenaMolde(tipo, nivel);
    } catch (e) {
      Utils.toast?.(`Não consegui abrir a visualização: ${e.message || e}`, { type: 'danger' });
      return;
    }
    this._sessao = { modo: 'ver', tipo, nivel, engine: ctx.engine, overlay: ctx.overlay, obj: ctx.obj };
    const barra = document.createElement('div');
    barra.className = 'modelos3d-editor-bar';
    barra.innerHTML = `<button type="button" class="btn primary sm" id="m3dv-ver-sair">✕ Fechar visualização</button>`;
    ctx.overlay.appendChild(barra);
    barra.querySelector('#m3dv-ver-sair').onclick = () => { this._encerrarSessao(); };

    // NOVO (01/09/2026), pedido verbatim (item 8 da rodada de 13 itens):
    // "O '+' (menu lateral esquerdo) deve ficar sempre ativo, não somente no
    // Modelador." O botão "+" (`.m3d-sidebar-toggle`, ver modeler-ui.js/
    // modeler3d.css) que abre a barra lateral "Ferramentas"/"Criar" só
    // existia DENTRO do Modelador (`_abrirEditor`, acima) — no visualizador
    // "👁️ Ver em 3D" (SÓ ÓRBITA, sem nenhuma ferramenta de edição — este
    // método) não existia nenhum "+", então quem queria mexer na malha
    // precisava fechar a visualização e clicar em "✏️ Editar" de novo, do
    // zero. Adiciona o MESMO botão "+" aqui (mesma classe CSS, reaproveita o
    // posicionamento/visual já existente — `overlay` já é o mesmo tipo de
    // contêiner `position:fixed` que o `.m3d-root` do Modelador usa, então
    // fica no mesmo lugar em tela) — clicar nele encerra esta sessão de
    // visualização e abre o editor de verdade pro MESMO tipo/nível, sem
    // precisar voltar pra lista. Não duplica lógica nenhuma do Modelador em
    // si (o "+" DENTRO dele, pra abrir Ferramentas/Criar, continua existindo
    // normalmente assim que `_abrirEditor` monta a UI completa).
    const btnMais = document.createElement('button');
    btnMais.type = 'button';
    btnMais.className = 'm3d-btn m3d-sidebar-toggle';
    btnMais.id = 'm3dv-ver-abrir-editor';
    btnMais.title = 'Abrir as ferramentas de edição (Modelador 3D) pra este modelo';
    btnMais.textContent = '+';
    ctx.overlay.appendChild(btnMais);
    btnMais.onclick = async () => {
      await this._encerrarSessao();
      await this._abrirEditor(tipo, nivel);
    };
    // Alvo da órbita = mesmo ponto (0, 0.4, 0) que Modeler3D._initOrbitFromCamera
    // usa por padrão pro objeto único (baseY + 0.4) — nosso objeto FALSO
    // sempre nasce em x:0/y:0/piso:0/elevacao:0 (ver _montarCenaMolde), então
    // baseY é sempre 0 aqui.
    this._sessao.orbitCtl = this._iniciarOrbitPreview(ctx.engine, { x: 0, y: 0.4, z: 0 }, ctx.canvas);
    Utils.toast?.('👁️ Arraste pra girar, roda do mouse pra aproximar/afastar', { duration: 3200 });
  },

  /** Converte a malha `{vertices,...}` da sessão de edição, aplicando o
   *  `customMeshXform` (Modo Objeto do Modelador — mover/girar/escalar)
   *  DIRETO nos vértices, na mesma composição que o Three.js usaria pra
   *  desenhar (rotação+escala, sem translação — a posição de mundo do
   *  objeto nunca faz parte do MOLDE em si, cada instância no mapa tem a
   *  sua própria). Sem isto, girar/escalar o objeto no Modo Objeto durante
   *  a edição do molde pareceria funcionar na hora (o preview mostra
   *  certo), mas seria silenciosamente PERDIDO ao salvar — só
   *  `obj.customMesh` (vértices em espaço LOCAL, sem xform nenhum) é
   *  gravado em `DB.setObjectModel`, nunca `customMeshXform` (que só faz
   *  sentido pra UM objeto específico do mapa, não pra um molde
   *  reutilizável por TODOS os objetos daquele tipo). */
  _bakeXform(THREE, vertices, xform) {
    const hasXform = (xform.rotX || xform.rotY || xform.rotZ || (xform.scaleX && xform.scaleX !== 1) || (xform.scaleY && xform.scaleY !== 1) || (xform.scaleZ && xform.scaleZ !== 1));
    if (!hasXform) return vertices.map((v) => v.slice());
    const euler = new THREE.Euler(xform.rotX || 0, xform.rotY || 0, xform.rotZ || 0, 'XYZ');
    const quat = new THREE.Quaternion().setFromEuler(euler);
    const scale = new THREE.Vector3(xform.scaleX || 1, xform.scaleY || 1, xform.scaleZ || 1);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), quat, scale);
    return vertices.map((v) => { const p = new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(m); return [p.x, p.y, p.z]; });
  },

  async _persistirMolde(s) {
    const cm = s.obj?.customMesh;
    if (!cm || !Array.isArray(cm.vertices) || cm.vertices.length < 3) {
      Utils.toast?.('Nada foi salvo (malha vazia).', { type: 'warn' });
      return;
    }
    // NOVO (02/09/2026), pedido verbatim: "se abriu pelo botão 'editar' e
    // não fez alteração alguma ou fez alterações, mas retrocedeu todas com
    // CTRL+Z, de modo que voltasse ao seu modelo original, então, não deve
    // ficar como 'Customizado', pois continua no modelo padrão." Compara o
    // estado FINAL (`s.obj`, já com tudo que `Modeler3D.exit`/`_commit`
    // escreveu de volta nele) com o snapshot tirado no INÍCIO da sessão
    // (`s.initialSnapshot`, ver `_abrirEditor`) — sem NENHUMA mudança de
    // verdade, não grava nada: se não havia customização antes
    // (`!s.hadExisting`), o tipo continua "⬜ Padrão do app"; se já havia
    // uma, ela permanece exatamente como estava (regravar o MESMO conteúdo
    // de novo seria só trabalho redundante em `DB`).
    if (s.initialSnapshot != null && this._snapshotMesh(s.obj) === s.initialSnapshot) {
      Utils.toast?.(
        s.hadExisting ? 'Nada foi alterado — a customização já salva foi mantida.' : 'Nada foi alterado — continua com o modelo padrão do app.',
        { type: 'info' },
      );
      return;
    }
    const verticesBaked = this._bakeXform(s.engine.THREE, cm.vertices, s.obj.customMeshXform || {});
    await DB.setObjectModel(s.tipo, s.nivel, { vertices: verticesBaked, edges: cm.edges || [], faces: cm.faces });
    Utils.toast?.('💾 Molde salvo.', { type: 'ok' });
  },

  /** Descarta a sessão de edição/visualização atual — por padrão persiste
   *  antes se era uma edição em andamento (ver comentário grande em
   *  `unmount()`). Libera o contexto WebGL (`engine.dispose()`) e remove o
   *  overlay da tela — chamado pelos botões "💾 Salvar"/"🚪 Sair"/"Fechar
   *  visualização" e por `unmount()` (navegação forçada pra outra tela).
   *  [15/09/2026 UTC] `opts.persist` (padrão `true`) — pedido verbatim: "Sair"
   *  pode fechar SEM gravar no IndexedDB quando o usuário escolhe descartar
   *  a alteração no diálogo de confirmação (ver `_sairEditor`, que também
   *  passa `jaSaiuDoModelador:true` quando ele mesmo já chamou
   *  `Modeler3D.exit()` antes, pra não chamar de novo aqui). */
  async _encerrarSessao(opts = {}) {
    const s = this._sessao;
    if (!s) return;
    const persist = opts.persist !== false;
    if (s.modo === 'editor' && !opts.jaSaiuDoModelador && window.Modeler3D?.isActive?.()) {
      Modeler3D.exit({ skipRebuild: true }); // grava a malha editada de volta em s.obj (ver _commit em modeler-core.js) — nunca em DB.saveMap/mapa de verdade
    }
    if (s.modo === 'editor' && persist) await this._persistirMolde(s);
    if (s.orbitCtl) s.orbitCtl.dispose();
    s.engine?.dispose?.();
    s.overlay?.remove?.();
    this._sessao = null;
  },

  /** Visualizador orbital "cru" (sem Modelador nenhum, só câmera de órbita
   *  arrastável + roda do mouse pro zoom) — pedido do usuário, verbatim:
   *  "Um 'Ver em 3D' a parte pode ser invocado, só que sem o mapa sendo
   *  renderizado em 3D, mas apenas o modelo 3D escolhido." Não reaproveita
   *  `Modeler3D._updateOrbitCamera` (amarrado a todo o `state` do
   *  Modelador) nem `engine.render(camera)` (faz trabalho extra — destaque
   *  de mira, oclusão de selo, corte por distância — irrelevante aqui, um
   *  único objeto parado numa cena vazia): chama `engine.renderer.render`
   *  DIRETO, manipulando `engine.camera3` (a câmera Three.js de verdade) só
   *  com posição/`lookAt`, mesma técnica mais simples que `_updateOrbitCamera`
   *  já usa por baixo. */
  _iniciarOrbitPreview(engine, target, canvas) {
    const st = { yaw: 0.7, pitch: 0.35, dist: 3, dragging: false, lastX: 0, lastY: 0 };
    // CORRIGIDO (01/09/2026), pedido verbatim (item 4 da rodada B): "No
    // visualizador 3D dos modelos, desabilite a ação padrão do navegador
    // para o botão do meio do mouse. Pois, em vez de só mudar a perspectiva
    // da câmera, fica aparecendo aquele ícone de movimentação de página web
    // do botão do meio do mouse." `e.preventDefault()` num `pointerdown` de
    // botão 1 evita o navegador entrar no modo de "autoscroll" nativo (o
    // ícone de bolinha com setas) — sem isso, o clique do meio arrastava a
    // câmera (via `onMove` abaixo, que já funciona pra qualquer botão) E, ao
    // mesmo tempo, o navegador tentava iniciar o autoscroll da PÁGINA por
    // trás, mostrando o ícone por cima da cena 3D. Só limitado ao botão 1
    // (meio) — não interfere no botão esquerdo (0), que já orbita
    // normalmente sem esse problema.
    const onDown = (e) => { if (e.button === 1) e.preventDefault(); st.dragging = true; st.lastX = e.clientX; st.lastY = e.clientY; try { canvas.setPointerCapture?.(e.pointerId); } catch (err) { /* ignora */ } };
    const onMove = (e) => {
      if (!st.dragging) return;
      st.yaw -= (e.clientX - st.lastX) * 0.008;
      // CORRIGIDO (01/09/2026), pedido verbatim: "No 'Ver em 3D' dos
      // modelos, o mover vertical está invertido." Causa: sinal trocado —
      // a órbita "boa" e já usada em outro lugar do app (Modelador,
      // `modeler-input.js` `_onMouseMove`, `target.pitch = target.pitch +
      // dy * 0.006`, com `dy = e.clientY - lastY`, mesma convenção de sinal
      // daqui) SOMA o delta Y, nunca subtrai — este visualizador orbital
      // "cru" usava `st.pitch - (...)`, o inverso. Trocado pra `+`, igual
      // ao Modelador.
      st.pitch = Math.max(-1.4, Math.min(1.4, st.pitch + (e.clientY - st.lastY) * 0.008));
      st.lastX = e.clientX; st.lastY = e.clientY;
    };
    const onUp = () => { st.dragging = false; };
    const onWheel = (e) => { st.dist = Math.max(0.6, Math.min(20, st.dist + e.deltaY * 0.004)); e.preventDefault(); };
    // `mousedown` extra (além do `pointerdown` acima) — mesmo motivo/mesmo
    // padrão de reforço já usado em view3d.js (`onMouseDownMiddle`,
    // comentário lá: "alguns navegadores já iniciam o modo de autoscroll no
    // próprio mousedown, antes do [...] terminar"): cobre o caso raro de um
    // navegador que dispara o autoscroll a partir do evento de mouse
    // "clássico" em vez do de ponteiro.
    const onMouseDownMiddleGuard = (e) => { if (e.button === 1) e.preventDefault(); };
    canvas.addEventListener('mousedown', onMouseDownMiddleGuard);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    let raf = null;
    let ativo = true;
    const loop = () => {
      if (!ativo) return;
      // [14/09/2026 UTC] CORRIGIDO — pedido verbatim: "a tela do canvas
      // fica toda preta [...] verifique se o motor 3D está sendo chamado e
      // se há atualização no canvas usado nesta tela." CAUSA RAIZ: desde a
      // arquitetura "MODO EYE" (ver comentário grande no construtor de
      // Engine3D, engine3d.js), o `<canvas>` visível de QUALQUER instância
      // deixou de ser um canvas WebGL de verdade — é um canvas 2D puro, e
      // só recebe o resultado do render através de `_presentFrame()`
      // (posiciona/redimensiona + desenha no WebGLRenderTarget PRÓPRIO
      // desta instância + copia pro canvas 2D visível via
      // `_presentToCanvas()`). Chamar `engine.renderer.render(...)` DIRETO
      // (como este loop fazia) desenha no render target que estiver ativo
      // no `Engine3D._sharedRenderer` (compartilhado por TODAS as
      // instâncias) naquele instante, mas NUNCA copia o resultado pro
      // canvas 2D visível — exatamente o mesmo bug já identificado e
      // corrigido em `Modeler3D._renderFrame` (modeler-core.js, ver
      // comentário grande em `_presentFrame`, engine3d.js) em rodada
      // anterior, só que aqui, no visualizador "Ver em 3D" de "Acessar
      // modelos", nunca tinha sido corrigido — por isso o canvas ficava
      // sempre preto (nunca chegou a receber um 1º quadro). Corrigido
      // chamando `engine._presentFrame()` (mesmo método/mesmo padrão que
      // `Modeler3D` já usa) no lugar de `renderer.render()` direto —
      // `_presentFrame()` já chama `_resize()` internamente, então o
      // `engine._resize?.()` manual daqui também foi removido (duplicado).
      const x = target.x + st.dist * Math.cos(st.pitch) * Math.sin(st.yaw);
      const y = target.y + st.dist * Math.sin(st.pitch);
      const z = target.z + st.dist * Math.cos(st.pitch) * Math.cos(st.yaw);
      engine.camera3.position.set(x, y, z);
      engine.camera3.lookAt(target.x, target.y, target.z);
      engine._presentFrame();
      raf = requestAnimationFrame(loop);
    };
    loop();
    return {
      dispose() {
        ativo = false;
        if (raf) cancelAnimationFrame(raf);
        canvas.removeEventListener('mousedown', onMouseDownMiddleGuard);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('wheel', onWheel);
      },
    };
  },
};

window.Modelos3DView = Modelos3DView;
