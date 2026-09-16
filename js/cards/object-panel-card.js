// [13/09/2026 UTC] REFATORAÇÃO — pedido verbatim do usuário: "Em vez de
// ser um template gigante de HTML, transforme-o em um card e coloque na
// pasta 'js/cards/'. Também deixe como '.js' para poder continuar
// funcionando com 'file:///'."
//
// Isto é a janela de propriedades de um OBJETO do mapa 2D (mesa, cadeira,
// robô, retângulo/polígono desenhado, "Piso", "Retículo métrico", etc.) —
// a mais usada de todo o app, antes um template HTML gigante (~800 linhas)
// dentro de `js/mapview.js` (`_openObjectPanel`). Movida pra cá seguindo
// EXATAMENTE o mesmo espírito/convenção já usado pelos cards do "Ver em
// 3D" (ver `js/cards/README.md`, que explica por que esta pasta existe e por
// que é sempre `.js` — resumo: o app roda 100% via `file:///`, sem
// servidor, e `fetch()` de arquivo local é bloqueado por CORS; uma tag
// `<script src="...">` não sofre essa restrição).
//
// DIFERENÇA em relação aos 5 cards de `js/cards/README.md`: aqueles são
// "cartões" leves (`.flashcard3d-overlay`) que aparecem SÓ dentro do "Ver
// em 3D" e são montados via `window.CardSystem.mount(...)`. Este aqui é a
// janela de propriedades do MAPA 2D (`.map2d-props-panel`, arrastável,
// minimizável, com z-index próprio) — mecanismo bem mais antigo e mais
// específico do mapview.js (`_openPanel`/`_makePanelDraggable`/
// `_bringPanelToFront`), que não faz sentido forçar por dentro do
// `CardSystem` (duplicaria a criação do container). Por isso este arquivo
// segue um formato PRÓPRIO — `window.ObjectPanelCard.build(obj, opts)` —
// em vez de `window.CardSystem.register(...)`, mas com o MESMO objetivo:
// tirar de `js/mapview.js` o HTML/estilo/lógica de clique deste painel
// específico, deixando lá só um "wrapper" fino (ver `_openObjectPanel` em
// mapview.js) que busca os itens associados (a única parte
// ASSÍNCRONA — precisa ficar no wrapper, que já é `async`), monta o `opts`
// e chama `ObjectPanelCard.build(...)`.
//
// `build(obj, { formasTool, itemEntries, linkedItems, ctx })`:
//  - `obj`: o objeto do mapa cuja janela está sendo aberta/atualizada.
//  - `formasTool`: mesma flag que `_openObjectPanel` já recebia (o painel
//    foi aberto pela ferramenta "Formas", não pelo modo antigo "Objetos").
//  - `itemEntries`/`linkedItems`: já resolvidos pelo wrapper (evita este
//    arquivo precisar ser `async`/repetir o `await Promise.all(...)`).
//  - `ctx`: a própria instância de `MapView` (`this`, no `mapview.js`) —
//    igual à decisão já documentada em `js/cards/README.md` pros cards do
//    "Ver em 3D" ("Acoplamento com View3D mantido de propósito"): aqui
//    também, de propósito, pra não duplicar/expor por uma API nova toda a
//    lógica de `_startFormaReedit`/`_saveMap`/`_closePanel`/
//    `_wireScriptFieldset`/etc. que este painel já dependia intimamente —
//    risco maior que o benefício nesta rodada. `Utils`/`Mapping`/`DB`/
//    `History`/`Icons`/`App` continuam acessados como GLOBAIS (mesmo
//    padrão de sempre no projeto, não precisam vir pelo `ctx`).
//  - Devolve `{ html, wire }`: `html` é a string pronta pra
//    `ctx._openPanel(html)`; `wire(panel)` é chamada logo depois, já com o
//    elemento do painel de verdade no DOM, e liga todos os campos/botões
//    (idêntico ao que rodava antes, só que agora recebendo `panel` por
//    parâmetro em vez de fechar sobre uma `const panel` da mesma função).
//
// Extração LITERAL — nenhuma lógica foi reescrita, só movida e com
// `this.` trocado por `ctx.` (verificado antes: nenhuma função não-arrow
// aninhada neste trecho, então `this` sempre se referia à mesma instância
// de MapView em TODO o código original — a troca é segura e mecânica).
// Não testado ao vivo em navegador nesta rodada (sem acesso a navegador
// nesta sessão) — só `node --check` (sintaxe) e reprodução isolada em
// Node chamando `build(...)` com objetos de stub (mesma técnica usada pra
// achar a causa raiz do bug da RODADA 17 do progresso-sessao.md),
// confirmando que o HTML/wiring são gerados sem lançar exceção pros casos
// testados (objeto comum e "Piso"). Vale um teste manual na janela de
// propriedades de alguns tipos diferentes de objeto antes de confiar
// cegamente que ficou 100% idêntico ao comportamento anterior.

window.ObjectPanelCard = {
  // [15/09/2026 UTC] `modoVer3D` (NOVO, opcional) — pedido verbatim: "No
  // 'Ver em 3D', ao clicar em 'propriedades', deve aparecer a mesma janela
  // que nas propriedades do mapa 2D. Um novo botão 'transformação' deve
  // aparecer ali." `true` quando este card é montado a partir de
  // `view3d.js` `_openObjectProperties3D` (ver `js/mapview.js`
  // `_openObjectPanel`, que repassa o flag pra cá). Usado só pra: (1)
  // esconder "🔧 Modelar em 3D"/"🔄 Trocar tipo/forma" (dependem de
  // ferramentas/gizmo do Mapa 2D que não existem dentro do "Ver em 3D" — a
  // 1ª já tem seu PRÓPRIO botão equivalente no cartão de clique do objeto,
  // ver js/cards/object-card.js); (2) mostrar o botão novo "🔄 Transformação"
  // no lugar deles.
  build(obj, { formasTool, itemEntries, linkedItems, ctx, modoVer3D = false }) {
    const grausAngulo = Math.round((obj.angulo || 0) * 180 / Math.PI);
    const isRetangulo = obj.forma === 'retangulo';
    const isPoligono = obj.forma === 'poligono';
    const isImagem = obj.forma === 'imagem';
    // Forma com um `tipo` de catálogo associado (ex.: "mesa" — ver
    // _MESA_FORMA_DEF) mostra o nome DAQUELE tipo ("Mesa"), não o rótulo
    // genérico da forma ("Retângulo/quadrado desenhado") — mantém a
    // identidade do objeto mesmo sendo editável como uma forma desenhada.
    const label = (obj.tipo && (isRetangulo || isPoligono)) ? (window.Icons?.labelForAnyKey?.(obj.tipo) || obj.tipo)
      : isRetangulo ? 'Retângulo/quadrado desenhado'
      : isPoligono ? `Polígono desenhado (${Math.max(3, Math.round(obj.lados || 24))} lados)`
      : isImagem ? 'Imagem'
      : (window.Icons?.labelForAnyKey?.(obj.tipo) || obj.tipo);
    const emoji = isRetangulo ? '▭' : isPoligono ? '⬡' : isImagem ? '🖼️' : '🧱';
    // Objeto pode opcionalmente representar MAIS DE UM item já catalogado
    // (obj.itemIds — pedido do usuário, 26/08/2026: "se houver um único
    // objeto com mais de um patrimônio marcado nele") — o mesmo objeto
    // (ícone ou forma desenhada) vira também o "marcador" desses itens
    // (equivalente a um orb/pino, mas com forma/aparência própria).
    // Reaproveita o MESMO índice de duplicação do desenho no canvas (ver
    // Map2DRenderer._computeItemAssocIndex/_drawItemBadges) — "algum jeito
    // de saber, visualmente, se foi a primeira, segunda ou outra
    // duplicação" — aqui como texto, no painel, em vez de um selo no mapa.
    // [15/09/2026 UTC] `ctx._renderer` opcional (`?.`) — quando este card é
    // montado a partir do "Ver em 3D" (`modoVer3D`), `ctx` é o `View3D`
    // (singleton), que não tem `_renderer` (isso é exclusivo do canvas 2D,
    // `Map2DRenderer`) — sem o índice de duplicação, o selo "🔁 Nª" só não
    // aparece (degrada graciosamente, não quebra o painel inteiro).
    const assocIndex = ctx._renderer?._computeItemAssocIndex(ctx._map) || new Map();
    const itemRows = itemEntries.map((entry, i) => {
      const item = linkedItems[i];
      const ocorrencias = assocIndex.get(entry.id);
      const ordinal = (ocorrencias && ocorrencias.length > 1) ? ocorrencias.findIndex((o) => o.objId === obj.id) + 1 : 0;
      const dupBadge = ordinal > 0
        ? `<span class="obj-item-dup-badge" title="Este patrimônio está associado a ${ocorrencias.length} objetos diferentes no mapa — este é o ${ordinal}º (em ordem de quando cada associação foi feita).">🔁 ${ordinal}ª</span>`
        : '';
      return `
        <div class="obj-item-row">
          <span class="obj-item-row-desc">${item ? `🔗 ${Utils.escapeHtml(item.descricao || '(sem nome)')}${item.patrimonio ? ` <small>(${Utils.escapeHtml(item.patrimonio)})</small>` : ''}` : `⚠️ item removido${entry.patrimonio ? ` — patrimônio <small>${Utils.escapeHtml(entry.patrimonio)}</small>` : ''}`}</span>
          ${dupBadge}
          ${item ? `<button type="button" class="icon-btn sm obj-item-ver" data-id="${entry.id}" title="Ver detalhes do item">👁️</button>` : ''}
          <button type="button" class="icon-btn sm obj-item-remover" data-id="${entry.id}" title="Remover esta associação">✂️</button>
        </div>`;
    }).join('');
    // Quando é só UM patrimônio (o caso mais comum), mantém o atalho de
    // edição rápida do campo "Patrimônio" direto aqui (comportamento de
    // sempre) — com mais de um fica ambíguo qual editar, aí só via "👁️ Ver
    // detalhes do item" mesmo.
    const linkedItem = linkedItems.length === 1 ? linkedItems[0] : null;
    // NOVO (07/09/2026), pedido verbatim: "ligar objetos separados como no
    // Blender. [...] deve ser possível agrupá-los para que, ao abrir o
    // Modelador para editá-los, seja possível modificar ambos." Dados reais
    // em Mapping.linkObjects/unlinkObject/groupMembers (js/mapping.js,
    // testado isoladamente em Node) — aqui só a UI: lista os OUTROS membros
    // do grupo (se houver) + um seletor "Ligar a outro objeto" com todos os
    // demais objetos do mapa (evita precisar de um modo "clique no outro
    // objeto" novo no canvas — mais simples/seguro, funciona mesmo se o
    // outro objeto não estiver visível na tela agora).
    const grupoMembros = window.Mapping ? Mapping.groupMembers(ctx._map, obj) : [];
    const grupoMembrosHtml = grupoMembros.map((o) => `
      <div class="obj-item-row">
        <span class="obj-item-row-desc">🔗 ${Utils.escapeHtml(o.nome || o.tipo || '(objeto)')}</span>
        <button type="button" class="icon-btn sm obj-grupo-remover-membro" data-id="${o.id}" title="Tirar este objeto do grupo">✂️</button>
      </div>`).join('');
    const outrosObjetos = (ctx._map.objects || []).filter((o) => o.id !== obj.id && o.grupoId !== obj.grupoId);
    const outrosObjetosOptions = outrosObjetos.map((o) => `<option value="${o.id}">${Utils.escapeHtml(o.nome || o.tipo || o.id)}</option>`).join('');
    const grupoFieldHtml = `
      <div class="map-panel-field" title="Objetos ligados num grupo são editados JUNTOS ao abrir o Modelador 3D em qualquer um deles (ver botão 'Editar este' dentro do Modelador, seção Grupo).">
        <span>🔗 Grupo${grupoMembros.length ? ` (${grupoMembros.length + 1} objetos)` : ''}</span>
        ${grupoMembros.length ? `<div id="obj-grupo-lista">${grupoMembrosHtml}</div>` : '<div style="font-size:12.5px; color:var(--text-dim)">Nenhum — objeto solto</div>'}
        ${outrosObjetos.length ? `
          <div style="display:flex; gap:4px; margin-top:4px">
            <select id="obj-grupo-select" style="flex:1"><option value="">Ligar a outro objeto...</option>${outrosObjetosOptions}</select>
            <button type="button" class="btn secondary sm" id="obj-grupo-ligar">🔗 Ligar</button>
          </div>` : ''}
        ${obj.grupoId ? '<button type="button" class="btn secondary sm" id="obj-grupo-sair" style="width:100%; margin-top:4px">✂️ Sair do grupo</button>' : ''}
      </div>`;
    // NOVO (01/09/2026) — pedido verbatim (escada 3D paramétrica, "itens
    // grandes"): "É possível escolher a quantidade de degraus, por padrão é
    // 11". Campo só aparece pra objetos tipo 'escada' (o único que lê
    // `obj.escadaDegraus`, ver Engine3D._buildEscadaMesh); título explica
    // que a altura mostrada acima é sempre fixa em 2m no 3D (não editável
    // de verdade, só existe pra uniformidade com outras formas retângulo).
    const isEscada = obj.tipo === 'escada';
    const escadaDegrausField = isEscada
      ? `<label class="map-panel-field" title="A altura do lance no 3D é sempre 2 metros fixos, independente do campo 'Altura' acima."><span>Degraus</span><input type="number" step="1" min="1" max="60" id="obj-escada-degraus" value="${Math.max(1, Math.round(obj.escadaDegraus) || 11)}"></label>`
      : '';
    // [13/09/2026] NOVO — "Acabamento" do objeto "Piso" (pedido do usuário:
    // "chão lajotado"). Só aparece pra `obj.tipo === 'piso'` (nenhum outro
    // retângulo comum ganha esse campo — não faz sentido pra mesa/armário/
    // etc.). `'liso'` é o padrão (ausente = 'liso' em todo lugar que lê,
    // ver engine3d.js `_buildOneObjectMesh` — cor sólida, comportamento
    // IDÊNTICO ao de antes desta rodada pra quem nunca mexer aqui);
    // `'lajota'` liga a textura procedural (ver `_getProceduralFloorTexture`
    // em engine3d.js). Campo salvo direto em `obj.acabamento` — mesmo
    // padrão de `salvarCampo` de qualquer outro campo deste painel.
    const acabamentoField = obj.tipo === 'piso' ? `
      <label class="map-panel-field" title="'Liso' (padrão): cor sólida, do jeito de sempre. 'Lajota': gera uma textura procedural de piso lajotado (quadrados com rejunte), em escala real (lajota de 0,6m), sobre este Piso.">
        <span>Acabamento</span>
        <select id="obj-acabamento">
          <option value="liso" ${(obj.acabamento || 'liso') === 'liso' ? 'selected' : ''}>Liso</option>
          <option value="lajota" ${obj.acabamento === 'lajota' ? 'selected' : ''}>Lajota</option>
        </select>
      </label>
    ` : '';
    const formaFields = isRetangulo ? `
      <label class="map-panel-field"><span>Largura (m)</span><input type="number" step="0.05" min="0.05" id="obj-largura" value="${(obj.largura ?? 0.5).toFixed(2)}"></label>
      <label class="map-panel-field"><span>Profundidade (m)</span><input type="number" step="0.05" min="0.05" id="obj-profundidade" value="${(obj.profundidade ?? 0.5).toFixed(2)}"></label>
      <label class="map-panel-field"><span>Altura (m)</span><input type="number" step="0.05" min="0.05" id="obj-altura" value="${(obj.altura ?? 0.5).toFixed(2)}"></label>
      ${escadaDegrausField}
      ${acabamentoField}
      <label class="map-panel-field"><span>Preenchimento</span><input type="color" id="obj-cor" value="${obj.cor || '#8a92a3'}"></label>
      <label class="map-panel-field" title="Cor do contorno — independente do preenchimento (ver também a janela 🎨 Cores, na barra de cima)"><span>Contorno</span><input type="color" id="obj-cor-contorno" value="${obj.corContorno || obj.cor || '#8a92a3'}"></label>
    ` : isPoligono ? `
      <label class="map-panel-field"><span>Raio (m)</span><input type="number" step="0.05" min="0.05" id="obj-raio" value="${(obj.largura != null ? (obj.largura + (obj.profundidade ?? obj.largura)) / 4 : (obj.raio ?? 0.3)).toFixed(2)}" title="Formas desenhadas pela ferramenta Formas podem ter largura/profundidade diferentes (elípticas) — editar aqui volta a deixar simétrico (círculo/polígono regular)."></label>
      <label class="map-panel-field"><span>Lados</span><input type="number" step="1" min="3" max="64" id="obj-lados" value="${Math.max(3, Math.round(obj.lados || 24))}"></label>
      <label class="map-panel-field"><span>Altura (m)</span><input type="number" step="0.05" min="0.05" id="obj-altura" value="${(obj.altura ?? 0.5).toFixed(2)}"></label>
      <label class="map-panel-field"><span>Preenchimento</span><input type="color" id="obj-cor" value="${obj.cor || '#8a92a3'}"></label>
      <label class="map-panel-field" title="Cor do contorno — independente do preenchimento (ver também a janela 🎨 Cores, na barra de cima)"><span>Contorno</span><input type="color" id="obj-cor-contorno" value="${obj.corContorno || obj.cor || '#8a92a3'}"></label>
    ` : isImagem ? `
      <label class="map-panel-field" title="Distância vertical entre o chão daquele andar/piso e a base da imagem — 0 = deitada no chão (comportamento de sempre). Só tem efeito no 3D (o 2D é vista de cima, sem eixo vertical) — mesmo campo obj.elevacao já usado por outros objetos (ex.: luminária de teto), ver engine3d.js/mapping.js objectTopHeight."><span>Altura em relação ao chão (m)</span><input type="number" step="0.05" min="0" id="obj-elevacao" value="${(obj.elevacao || 0).toFixed(2)}"></label>
    ` : '';
    // NOVO (05/09/2026), pedido verbatim: "no cabeçalho de propriedades da
    // ferramenta, deve ter mais um controle. O método atual de desenho da
    // grade interna ('na origem do retículo') e outro que deve ser orientado
    // na origem do mundo [...] entra algo semelhante ao que estava antes, só
    // que todos os retículos que tiverem esta opção marcada ('na origem do
    // mundo') compartilharão uma mesma grade infinita e o retículo apenas
    // será uma janela para esta grade infinita." — só aparece pro Retículo
    // métrico de verdade (`obj.reticuloMetrico`), nunca pra um
    // retângulo/polígono comum da ferramenta Formas. Nome do campo escolhido:
    // `obj.reticuloOrigemModo` ('retangulo' | 'mundo') — ver
    // _drawFormaShape (leitura/desenho), _startFormaReedit/
    // _applyFormaDraftFieldPatch/_finalizeFormaDraft (persistência durante a
    // reedição). Retículos salvos ANTES desta rodada não têm este campo —
    // tratado como 'retangulo' em todo lugar que lê (`obj.reticuloOrigemModo
    // || 'retangulo'`), preservando o comportamento de sempre pra eles.
    const reticuloOrigemModoField = obj.reticuloMetrico ? `
      <label class="map-panel-field" title="'Na origem do retículo' (padrão, comportamento de sempre): a grade 1×1m é ancorada no canto onde ESTE retículo foi desenhado. 'Na origem do mundo': a grade vira uma janela para uma grade infinita ÚNICA, compartilhada por TODOS os retículos com esta opção marcada, alinhada ao (0,0) do mapa — o retículo fica verde floresta enquanto este modo estiver ativo.">
        <span>Origem da grade</span>
        <select id="obj-reticulo-origem-modo">
          <option value="retangulo" ${(obj.reticuloOrigemModo || 'retangulo') === 'retangulo' ? 'selected' : ''}>📐 Na origem do retículo</option>
          <option value="mundo" ${obj.reticuloOrigemModo === 'mundo' ? 'selected' : ''}>🌐 Na origem do mundo (compartilhada)</option>
        </select>
      </label>
    ` : '';
    // BUG CORRIGIDO (06/09/2026) — ver comentário grande no topo desta
    // função (`_objPanelOpenSeq`): se uma chamada MAIS NOVA desta mesma
    // função já começou enquanto esta aguardava os itens associados
    // (`await Promise.all(...)`, lá em cima), esta é uma chamada
    // OBSOLETA — abortar aqui, antes de tocar em `ctx._panelEl`, evita que
    // ela apague/substitua por baixo do usuário o painel que a chamada mais
    // nova já colocou (ou está prestes a colocar) na tela.
    // NOVO (07/09/2026), pedido verbatim: "a possibilidade de mudar de cor
    // as faces [...] Definir cor para as faces." — só faz sentido pra um
    // objeto MODELADO (customMesh, ver Modelador 3D/"Novo Cubo 3D") — é o
    // único tipo de objeto deste app que tem uma lista de FACES de verdade
    // (`obj.customMesh.faces`); um objeto de perfil fixo (mesa/cadeira/
    // forma geométrica simples) não tem "faces" endereçáveis uma a uma.
    const faceCount = obj.customMesh?.faces?.length || 0;
    const faceColorsMap = obj.customMesh?.faceColors || {};
    const faceColorEntriesHtml = Object.keys(faceColorsMap).length
      ? Object.entries(faceColorsMap).map(([idx, hex]) => `
        <div style="display:flex; align-items:center; gap:6px; margin-top:4px; font-size:12px">
          <span style="width:14px; height:14px; border-radius:3px; background:${Utils.escapeHtml(hex)}; border:1px solid var(--border); flex:0 0 auto"></span>
          <span style="flex:1">Face #${idx}</span>
          <button type="button" class="icon-btn sm obj-facecolor-remover" data-idx="${idx}" title="Remover cor desta face">✕</button>
        </div>`).join('')
      : '<div style="font-size:12px; color:var(--text-dim); margin-top:4px">Nenhuma face com cor própria.</div>';
    const faceColorFieldHtml = faceCount ? `
      <div class="map-panel-field">
        <span>🎨 Cor por face (${faceCount} face${faceCount === 1 ? '' : 's'})</span>
        <div style="display:flex; align-items:center; gap:8px; margin-top:6px">
          <input type="number" id="obj-facecolor-idx" min="0" max="${faceCount - 1}" value="0" style="width:64px" title="Índice da face (0 a ${faceCount - 1})">
          <input type="color" id="obj-facecolor-cor" value="${obj.cor || '#8a92a3'}">
          <button type="button" class="btn secondary sm" id="obj-facecolor-aplicar">Aplicar nesta face</button>
        </div>
        <div id="obj-facecolor-lista">${faceColorEntriesHtml}</div>
      </div>
    ` : '';
    const html = `
      <div class="map-panel-head"><b>${emoji} ${Utils.escapeHtml(label)}</b>
        <button type="button" class="icon-btn sm map-panel-toggle" id="obj-panel-toggle" title="${ctx._objPanelCollapsed ? 'Mostrar os campos deste painel' : 'Ocultar os campos deste painel'}">${ctx._objPanelCollapsed ? '▸' : '▾'}</button>
        <button type="button" class="icon-btn sm map-panel-close" title="Fechar">✕</button>
      </div>
      ${reticuloOrigemModoField}
      <label class="map-panel-field"><span>Nome</span><input type="text" id="obj-nome" value="${Utils.escapeHtml(obj.nome || '')}" placeholder="ex: Mesa.001" title="Nome próprio desta instância — aparece na lista de navegação do mapa e ajuda a diferenciar objetos do mesmo tipo. Gerado automaticamente ao criar (estilo 'Tipo.001', como no Blender), mas pode ser alterado livremente aqui."></label>
      <!-- [13/09/2026 UTC] NOVO — pedido verbatim: "o atributo 'class',
           então, deve ser implementado." Mesmo espírito do 'class' do
           HTML: várias classes por objeto, separadas por vírgula/espaço
           (ver 'Mapping.parseClassesInput'). Usado pelo painel '🏷️
           Grupos' (mapview.js/view3d.js) pra ocultar/destacar todo
           objeto de uma mesma classe de uma vez. -->
      <label class="map-panel-field"><span>🏷️ Classes</span><input type="text" id="obj-classes" value="${Utils.escapeHtml((Mapping.getObjectClasses(obj) || []).join(', '))}" placeholder="ex: sala-reuniao, mobiliario" title="Uma ou mais 'classes' (separadas por vírgula ou espaço) — igual ao atributo 'class' do HTML. Use o painel '🏷️ Grupos' pra ocultar/destacar todos os objetos de uma mesma classe de uma vez."></label>
      ${grupoFieldHtml}
      <label class="map-panel-field"><span>Posição X (m)</span><input type="number" step="0.1" id="obj-x" value="${obj.x.toFixed(2)}"></label>
      <label class="map-panel-field"><span>Posição Y (m)</span><input type="number" step="0.1" id="obj-y" value="${obj.y.toFixed(2)}"></label>
      <label class="map-panel-field"><span>Rotação (°)</span><input type="number" step="1" id="obj-angulo" value="${grausAngulo}"></label>
      <label class="map-panel-field"><span>Andar / piso</span><input type="number" step="1" id="obj-piso" value="${obj.piso || 0}"></label>
      ${formaFields}
      <div class="map-panel-field">
        <span>Patrimônio(s) associado(s)${itemEntries.length ? ` (${itemEntries.length})` : ''}</span>
        <div class="obj-item-list">${itemRows || '<div style="font-size:12.5px; color:var(--text-dim)">Nenhum</div>'}</div>
      </div>
      ${linkedItem ? `<label class="map-panel-field"><span>Patrimônio</span><input type="text" id="obj-patrimonio" value="${Utils.escapeHtml(linkedItem.patrimonio || '')}"></label>` : ''}
      <label class="map-panel-field" title="Pedido do usuário (28/08/2026, Modelador 3D): objeto marcado aqui pode servir de 'chão' para navegação entre andares vista de cima. NOTA: este campo hoje só é PERSISTIDO/EXPOSTO — a movimentação em 1ª pessoa de verdade que subiria em cima dele (e trocaria de andar) ainda não existe neste app (só câmera orbital/andar no chão fixo do piso atual), ver changelog."><span>🧱 Colisão (serve de chão visto de cima)</span><input type="checkbox" id="obj-colisao-topo" ${obj.colisaoTopo ? 'checked' : ''}></label>
      <!-- NOVO (07/09/2026), pedido verbatim: "carregar imagens como
           texturas... a possibilidade de mudar de cor as faces. Deve ser
           possível texturizar as faces. Definir cor para as faces. Também,
           carregar materiais e definir luz ambiente, configurar rugosidade
           da superfície, etc." — ver engine3d.js
           _buildStandardMaterialForObj (só tem efeito visual em objetos
           modelados/"Novo Cubo 3D" ou com molde 3D customizado salvo — ver
           decisão de escopo lá; os campos ficam salvos em qualquer objeto,
           mas objetos de perfil fixo (mesa/cadeira/etc, geometria
           hard-coded por tipo) ainda não LEEM estes campos nesta rodada). -->
      <div class="map-panel-field">
        <span>🧪 Material 3D</span>
        <label style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:12.5px">
          <span style="flex:0 0 90px">Rugosidade</span>
          <input type="range" id="obj-rugosidade" min="0" max="1" step="0.05" value="${obj.rugosidade ?? 0.85}" style="flex:1">
          <span id="obj-rugosidade-val" style="width:32px; text-align:right">${(obj.rugosidade ?? 0.85).toFixed(2)}</span>
        </label>
        <label style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:12.5px">
          <span style="flex:0 0 90px">Metálico</span>
          <input type="range" id="obj-metalico" min="0" max="1" step="0.05" value="${obj.metalico ?? 0.05}" style="flex:1">
          <span id="obj-metalico-val" style="width:32px; text-align:right">${(obj.metalico ?? 0.05).toFixed(2)}</span>
        </label>
        <label style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:12.5px">
          <span style="flex:0 0 90px">Opacidade</span>
          <input type="range" id="obj-opacidade" min="0" max="1" step="0.05" value="${obj.opacidade ?? 1}" style="flex:1">
          <span id="obj-opacidade-val" style="width:32px; text-align:right">${(obj.opacidade ?? 1).toFixed(2)}</span>
        </label>
        <div style="display:flex; align-items:center; gap:8px; margin-top:8px">
          <label class="btn secondary sm" style="margin:0; cursor:pointer" title="Carregar uma imagem como textura da superfície do objeto">🖼️ ${obj.texturaUrl ? 'Trocar textura' : 'Carregar textura'}<input type="file" accept="image/*" id="obj-textura-input" style="display:none"></label>
          ${obj.texturaUrl ? '<button class="btn secondary sm" id="obj-textura-remover">✕ Remover textura</button>' : ''}
        </div>
      </div>
      ${faceColorFieldHtml}
      <!-- NOVO (07/09/2026), pedido verbatim: "scripts para os objetos como
           no Unity, só que em JavaScript... Deve ter algum lugar em que haja
           um botão para 'adicionar script' para o objeto... Tudo no objeto
           pode ser acessado e alterado via script: vértices, cor, opacidade,
           ativo/não ativo, selecionado/não selecionado, nome, etc.
           Útil para animações e interações por meio de botões configuráveis
           no cenário." — ver js/scripting.js (window.Scripting) e
           js/sceneobjects.js (window.SceneObjects, o "obj" que o script
           recebe). O código fica salvo em obj.scriptCode. Além do botão
           "Executar" manual, o objeto pode virar um "botão do cenário" de
           verdade — 2 gatilhos automáticos (ver view3d.js _tryPick/
           _updateScriptProximityTriggers): ao clicar/mirar+tocar nele
           (mesma interação de sempre do 3D) ou ao o jogador se aproximar
           (raio configurável — este app não tem física de colisão
           jogador×objeto de verdade, proximidade é o substituto honesto). -->
      <!-- [09/09/2026] Ajuste solicitado pelo usuário: "Organize a
           apresentação dos botões de script que, atualmente, ficam no
           final da janela de propriedades." Antes o código/gatilhos do
           script eram só mais um '.map-panel-field' solto no meio dos
           outros campos, e o botão "▶️ Executar script" ficava misturado
           na barra de ações do FIM do painel, junto de "🔧 Modelar em
           3D"/"🔄 Trocar tipo"/"🗑️ Excluir" — sem nenhuma separação visual
           clara do resto. Agrupado agora num '<fieldset>' PRÓPRIO, com
           '<legend>' "🎬 Scripts" (mesmo padrão de agrupamento visual do
           resto da UI do app), reunindo código + os 2 gatilhos + o botão
           "Executar" logo ali dentro — nenhuma funcionalidade mudou, só a
           apresentação/organização (mesmos ids, mesmo comportamento).
           [13/09/2026 UTC] CAUSA RAIZ REAL do bug "janela de propriedades
           do Piso não abre" (relatado pelo usuário): as 3 CRASES que
           existiam aqui antes desta correção (em volta de
           '.map-panel-field', '<fieldset>' e '<legend>', na versão
           anterior deste comentário) fechavam PREMATURAMENTE o template
           literal gigante de 'ctx._openPanel(...)' desta função —
           exatamente a "⚠️ RESSALVA GLOBAL DO PROJETO (07/09/2026)"
           documentada no topo deste arquivo, mas violada aqui 2 dias
           depois, sem querer. O texto ".map-panel-field" logo após a 1ª
           crase virava CÓDIGO JS de verdade: ".map - panel - field" — um
           acesso de propriedade seguido de SUBTRAÇÃO da variável 'panel'
           (a mesma 'const panel = ctx._openPanel(...)' desta função)
           ANTES dela ser inicializada — daí o erro
           "ReferenceError: Cannot access 'panel' before initialization",
           sempre, pra QUALQUER objeto (não só Piso — só que ninguém tinha
           notado antes porque todo lugar que chamava
           'ctx._openObjectPanel(...)' fazia isso sem 'await'/'.catch',
           engolindo o erro em silêncio; o botão novo do gizmo, com o
           try/catch desta rodada, foi o que finalmente revelou o erro).
           Confirmado por reprodução isolada em Node (fora do navegador,
           chamando esta função com objetos de stub) — não é só uma
           suposição. Corrigido trocando as crases por aspas simples,
           igual à regra já documentada pede (nesta correção, inclusive
           este próprio comentário evita crases, pra não repetir o
           mesmo erro pela 3ª vez). -->
      ${ctx._scriptFieldsetHtml('obj', obj)}
      ${ctx._trajetoFieldsetHtml('obj', obj)}
      ${ctx._historicoFieldsetHtml('obj', obj)}
      <div class="map-panel-actions">
        ${modoVer3D ? `
        <!-- [15/09/2026 UTC] NOVO — pedido verbatim: "Um novo botão
             'transformação' deve aparecer ali. Ao clicar nele, então,
             aparece a transformação." No lugar de "Modelar em 3D" (já tem
             botão próprio no cartão de clique do objeto, ver
             js/cards/object-card.js) e "Trocar tipo/forma" (ferramenta do
             Mapa 2D, sem sentido dentro do "Ver em 3D") — os dois somem
             quando modoVer3D é verdadeiro. -->
        <button class="btn secondary sm" id="obj-transformacao" title="Posição/Rotação (X/Y/Z)/Escala (X/Y/Z) deste objeto, com os mesmos controles do Modelador — aplicado em tempo real">🔄 Transformação</button>
        ` : `
        <button class="btn secondary sm" id="obj-modelar" title="Editar a malha 3D deste objeto vértice a vértice, como no Blender (abre a Visualização 3D já no Modo de Edição)">🔧 Modelar em 3D</button>
        <button class="btn secondary sm" id="obj-tipo-trocar">🔄 Trocar tipo/forma</button>
        `}
        <button class="btn secondary sm" id="obj-item-associar">🔗 ${itemEntries.length ? 'Associar outro patrimônio' : 'Associar a um item'}</button>
        <button class="btn danger sm" id="obj-excluir">🗑️ Excluir</button>
      </div>`;

    const wire = (panel) => {
    panel.querySelector('.map-panel-close').onclick = () => {
      // "Concluído: [nome]" — só quando o painel foi aberto PELA ferramenta
      // Formas (formasTool), não pelo modo antigo "Objetos" (ali um objeto
      // comum não passa pelos rótulos Desenho/Ajustado/Concluído do pedido
      // do usuário, só as formas geométricas da ferramenta nova). É só um
      // marcador de fim de edição — a forma em si já foi salva a cada campo
      // mexido (ver salvarCampo/handles), então desfazer/refazer aqui não
      // precisam reverter nada, só existem pra aparecer na lista.
      if (formasTool) History.push({ label: `Concluído: ${ctx._formaNome(obj)}`, undo: async () => {}, redo: async () => {} });
      ctx._closePanel();
    };
    // Mostrar/ocultar (pedido do usuário: um botão próprio no cabeçalho desta
    // janela, distinto do "✕" de fechar) — colapsa só os campos/ações,
    // deixando o cabeçalho visível pra reabrir; NÃO fecha o painel nem
    // interrompe uma reedição-com-alças em progresso (ver _startFormaReedit),
    // as duas coisas são independentes.
    // AUDITORIA (06/09/2026), pedido verbatim: "Ao clicar em '▾' [...], ele
    // não deve ser recriado, deve permanecer, apenas seu conteúdo [...] deve
    // ser recolhido. Mesmo que múltiplos cliques sejam dados, o máximo que
    // vai acontecer é abrir e fechar várias vezes. E não ser recriado." —
    // reaudita do zero: este handler JÁ SÓ alterna `.collapsed`/texto/title,
    // sem NUNCA chamar `_openObjectPanel`/`_openPanel`/`_closePanel` (que são
    // os únicos pontos deste arquivo que destroem/recriam `ctx._panelEl` —
    // ver `_openPanel`) — `panel`/`toggleBtn` acima são a MESMA referência de
    // elemento DOM em todo o ciclo de vida do painel, nunca trocada aqui.
    // Também não existe, em lugar nenhum do arquivo, um listener de "clique
    // fora fecha o painel" genérico para este painel de objeto (só o painel
    // do pino de foto tem um — `_fotoPinOutsideHandler` — e ele já usa
    // `.contains(e.target)`, não `e.target === ctx._panelEl`, então cliques
    // DENTRO do painel, incluindo neste botão, nunca contam como "fora").
    // `e.stopPropagation()` abaixo é só um reforço defensivo (nunca chegou a
    // ser necessário nos testes de leitura de código, mas evita por completo
    // qualquer efeito colateral de um clique aqui "vazar" pra algum listener
    // de nível mais alto que venha a existir no futuro).
    panel.classList.toggle('collapsed', ctx._objPanelCollapsed);
    const toggleBtn = panel.querySelector('#obj-panel-toggle');
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      // BUG CORRIGIDO (06/09/2026), pedido verbatim: "Quando clica no botão
      // '▾' (sem ter movido, logo que a janela aparece), a posição de Y dela
      // solta para um valor mais alto que a faz ficar fora da tela. Saiu de
      // 271 para 661." — CAUSA RAIZ ENCONTRADA (a auditoria anterior, que só
      // olhou o handler em si e concluiu que ele "já só alterna .collapsed/
      // texto/title", estava olhando pro lugar certo mas não seguiu até o
      // CSS): enquanto o painel nunca foi arrastado (sem a classe
      // `.dragged`), ele fica ANCORADO por `bottom:10px` no CSS
      // (`.map2d-props-panel`), SEM `top` nenhum definido — ou seja, quem
      // "segura" o painel no lugar é a borda de BAIXO, não a de cima; o
      // navegador calcula `top` sozinho a partir da altura do conteúdo
      // (`top = viewportHeight - bottom - altura`). Colapsar
      // (`.collapsed > *:not(.map-panel-head){display:none}`, ver CSS)
      // encolhe MUITO essa altura (de ~toda a lista de campos pra só o
      // cabeçalho) — como `bottom` continua fixo, o navegador recalcula um
      // `top` BEM MAIOR pra manter a borda de baixo no mesmo lugar (altura
      // menor ⇒ top maior ⇒ o painel "desce"/salta), exatamente o 271→661
      // relatado — nada em JS estava movendo o painel, era só a própria
      // matemática do ancoramento por `bottom` reagindo à mudança de altura.
      // Corrigido "congelando" a posição em pixels (left/top/width) ANTES de
      // alternar `.collapsed`, com a MESMA classe `dragged` que
      // `_makePanelDraggable` já usa ao começar um arraste (ela desliga
      // `bottom`/`right`/margin do CSS — ver `.map2d-props-panel.dragged`) —
      // assim o painel passa a ser ancorado pelo TOPO (fixo, explícito) em
      // vez de pela base, e colapsar/expandir só muda a altura visível,
      // nunca `top`/`left`. Funciona tanto no 1º toggle (painel ainda
      // ancorado no canto padrão) quanto nos seguintes (já `.dragged`, onde
      // `top` já era explícito e por isso nunca teve este bug).
      const r = panel.getBoundingClientRect();
      panel.classList.add('dragged');
      panel.style.left = r.left + 'px';
      panel.style.top = r.top + 'px';
      panel.style.width = r.width + 'px';
      ctx._objPanelCollapsed = !ctx._objPanelCollapsed;
      panel.classList.toggle('collapsed', ctx._objPanelCollapsed);
      toggleBtn.textContent = ctx._objPanelCollapsed ? '▸' : '▾';
      toggleBtn.title = ctx._objPanelCollapsed ? 'Mostrar os campos deste painel' : 'Ocultar os campos deste painel';
    };
    // Enquanto esta forma está em reedição-com-alças (_formaDraft.reedit —
    // ver _startFormaReedit), o objeto de verdade foi tirado de
    // ctx._map.objects, então Mapping.updateObject não acharia nada: os
    // campos escrevem no rascunho em vez disso (ver _applyFormaDraftFieldPatch).
    // Ações "estruturais" (excluir/trocar tipo/associar item) finalizam a
    // reedição primeiro (ensureCommitted), devolvendo a forma pra grade,
    // antes de operar nela do jeito de sempre.
    const emReedit = () => ctx._formaDraft?.reedit?.id === obj.id;
    const ensureCommitted = () => { if (emReedit()) ctx._finalizeFormaDraft(); };
    const salvarCampo = (patch) => {
      if (emReedit()) ctx._applyFormaDraftFieldPatch(patch);
      else { Mapping.updateObject(ctx._map, obj.id, patch); ctx._saveMap(); }
    };
    // NOVO (07/09/2026), pedido verbatim: "Todos os objetos, agora, devem
    // ter um nome." — objetos criados ANTES desta rodada (Mapping.addObject
    // só passou a gerar `obj.nome` a partir de agora) não têm o campo ainda;
    // preenche retroativamente, no estilo Blender ("Tipo.001"), na primeira
    // vez que o painel de propriedades é aberto pra ele (sem esperar o
    // usuário digitar nada) — reflete na hora no campo "Nome" acima e já
    // persiste no mapa, do mesmo jeito que qualquer outro campo editado.
    if (!obj.nome && !emReedit()) {
      const nomeGerado = Mapping._nextObjectName(ctx._map, Mapping._labelForObjectType(obj.tipo));
      obj.nome = nomeGerado;
      const campoNome = panel.querySelector('#obj-nome');
      if (campoNome) campoNome.value = nomeGerado;
      salvarCampo({ nome: nomeGerado });
    }
    panel.querySelector('#obj-nome').oninput = (e) => salvarCampo({ nome: e.target.value });
    panel.querySelector('#obj-classes').oninput = (e) => salvarCampo({ classes: Mapping.parseClassesInput(e.target.value) });
    // NOVO (07/09/2026), pedido verbatim: "ligar objetos separados como no
    // Blender" — wiring do campo "🔗 Grupo" (HTML montado em
    // `grupoFieldHtml`, acima). Reabre o painel (`_openObjectPanel`) depois
    // de qualquer mudança pra lista de membros refletir na hora, MESMO
    // padrão já usado alhures neste painel (ex.: `_openObjectPanel` de novo
    // após remover associação de patrimônio).
    panel.querySelector('#obj-grupo-ligar')?.addEventListener('click', () => {
      const outroId = panel.querySelector('#obj-grupo-select')?.value;
      if (!outroId) { Utils.toast('Escolha um objeto pra ligar', { type: 'warn' }); return; }
      const grupoId = Mapping.linkObjects(ctx._map, obj.id, outroId);
      if (!grupoId) { Utils.toast('Não foi possível ligar (objeto não encontrado)', { type: 'warn' }); return; }
      ctx._saveMap();
      Utils.toast('🔗 Objetos ligados', { type: 'ok' });
      ctx._openObjectPanel((ctx._map.objects || []).find((o) => o.id === obj.id) || obj);
    });
    panel.querySelector('#obj-grupo-sair')?.addEventListener('click', () => {
      Mapping.unlinkObject(ctx._map, obj.id);
      ctx._saveMap();
      Utils.toast('✂️ Objeto saiu do grupo', { type: 'ok' });
      ctx._openObjectPanel((ctx._map.objects || []).find((o) => o.id === obj.id) || obj);
    });
    panel.querySelectorAll('.obj-grupo-remover-membro').forEach((btn) => {
      btn.onclick = () => {
        Mapping.unlinkObject(ctx._map, btn.dataset.id);
        ctx._saveMap();
        Utils.toast('✂️ Objeto tirado do grupo', { type: 'ok' });
        ctx._openObjectPanel((ctx._map.objects || []).find((o) => o.id === obj.id) || obj);
      };
    });
    // NOVO (07/09/2026), pedido verbatim: "carregar imagens como
    // texturas... configurar rugosidade da superfície, etc." — ver
    // engine3d.js _buildStandardMaterialForObj.
    panel.querySelector('#obj-rugosidade').oninput = (e) => {
      const v = parseFloat(e.target.value) || 0;
      panel.querySelector('#obj-rugosidade-val').textContent = v.toFixed(2);
      salvarCampo({ rugosidade: v });
    };
    panel.querySelector('#obj-metalico').oninput = (e) => {
      const v = parseFloat(e.target.value) || 0;
      panel.querySelector('#obj-metalico-val').textContent = v.toFixed(2);
      salvarCampo({ metalico: v });
    };
    panel.querySelector('#obj-opacidade').oninput = (e) => {
      const v = parseFloat(e.target.value) || 0;
      panel.querySelector('#obj-opacidade-val').textContent = v.toFixed(2);
      salvarCampo({ opacidade: v });
    };
    panel.querySelector('#obj-textura-input').onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        salvarCampo({ texturaUrl: reader.result });
        const fresh = (ctx._map.objects || []).find((o) => o.id === obj.id) || { ...obj, texturaUrl: reader.result };
        ctx._openObjectPanel(fresh, { formasTool });
      };
      reader.readAsDataURL(file);
    };
    panel.querySelector('#obj-textura-remover')?.addEventListener('click', () => {
      salvarCampo({ texturaUrl: null });
      const fresh = (ctx._map.objects || []).find((o) => o.id === obj.id) || { ...obj, texturaUrl: null };
      ctx._openObjectPanel(fresh, { formasTool });
    });
    // NOVO (07/09/2026), pedido verbatim: "a possibilidade de mudar de cor
    // as faces [...] Definir cor para as faces." — grava em
    // `obj.customMesh.faceColors` (objeto plano, chaves = índice da face
    // como string), reabrindo o painel pra atualizar a listinha/prévia 3D
    // (mesmo padrão de "Cor padrão"/"Soltar da parede" usado em outros
    // painéis deste arquivo).
    panel.querySelector('#obj-facecolor-aplicar')?.addEventListener('click', () => {
      const idx = parseInt(panel.querySelector('#obj-facecolor-idx').value, 10);
      const cor = panel.querySelector('#obj-facecolor-cor').value;
      if (!Number.isFinite(idx) || idx < 0) return;
      const cm = { ...(obj.customMesh || {}) };
      cm.faceColors = { ...(cm.faceColors || {}), [idx]: cor };
      salvarCampo({ customMesh: cm });
      const fresh = (ctx._map.objects || []).find((o) => o.id === obj.id) || { ...obj, customMesh: cm };
      ctx._openObjectPanel(fresh, { formasTool });
    });
    panel.querySelectorAll('.obj-facecolor-remover').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.idx;
        const cm = { ...(obj.customMesh || {}) };
        cm.faceColors = { ...(cm.faceColors || {}) };
        delete cm.faceColors[idx];
        salvarCampo({ customMesh: cm });
        const fresh = (ctx._map.objects || []).find((o) => o.id === obj.id) || { ...obj, customMesh: cm };
        ctx._openObjectPanel(fresh, { formasTool });
      });
    });
    // [11/09/2026] ATUALIZADO — pedido verbatim: "Separe os Gatilhos em um
    // Sistema de Eventos [...] Campos Serializados [...] Múltiplos
    // Componentes (Add Component)." Bloco fixo de script (textarea + 2
    // checkboxes) substituído pelo mesmo renderizador GENÉRICO de
    // componentes usado por parede/porta/janela/câmera/texto — ver
    // `_scriptFieldsetHtml`/`_wireScriptFieldset` (abre um editor
    // tela-cheia, não mais campos soltos aqui).
    // [11/09/2026, mesmo dia — REESCRITO] pedido verbatim: "elimine tudo do
    // projeto que é legado [...] o app está em construção ainda." Os campos
    // antigos `scriptCode`/`scriptAtivarAoClicar`/`scriptAtivarAoAproximar`/
    // `scriptRaioAproximacao` NÃO têm mais nenhum caminho de migração — se
    // sobrarem num objeto salvo de uma sessão anterior, ficam inertes (sem
    // UI/runtime que os leia). Todo comportamento de script agora vive
    // 100% em `entity.components` (Script = folha de código de verdade,
    // ver js/components.js).
    ctx._wireScriptFieldset(panel, 'obj', obj, salvarCampo);
    // [13/09/2026] NOVO — ver comentário grande acima de `_trajetoFieldsetHtml`
    // (correção de arquitetura: trajeto de robô agora é dado estruturado em
    // `obj.propriedades.trajeto`, editável aqui). `reabrir` reusa o objeto
    // mais atual do mapa (mesma convenção de outros botões deste painel,
    // ex.: `#obj-textura-remover` acima) pra refletir a lista já persistida.
    ctx._wireTrajetoFieldset(panel, 'obj', obj, salvarCampo, () => {
      ctx._openObjectPanel((ctx._map.objects || []).find((o) => o.id === obj.id) || obj, { formasTool });
    });
    ctx._wireHistoricoFieldset(panel, 'obj', obj, salvarCampo);
    // NOVO (05/09/2026), pedido verbatim: "Ao mover e redimensionar, pela
    // janela de propriedades, está acontecendo o mesmo problema de antes"
    // (a grade do Retículo métrico "descolando" do retângulo) — lê o estado
    // MAIS RECENTE do objeto (não o snapshot `obj` de quando o painel abriu,
    // que fica desatualizado depois da 1ª tecla digitada em qualquer campo)
    // — do rascunho de reedição quando for o caso (ver emReedit acima), ou
    // direto de `ctx._map.objects` senão.
    const objAtual = () => (emReedit() ? ctx._formaDraft : ((ctx._map.objects || []).find((o) => o.id === obj.id) || obj));
    // NOVO (05/09/2026) — seletor "Origem da grade" do Retículo métrico (ver
    // `reticuloOrigemModoField` acima/_drawFormaShape) — só existe no HTML
    // quando `obj.reticuloMetrico`, daí o `?.`. `salvarCampo` já sabe
    // escrever tanto no rascunho de reedição (`_applyFormaDraftFieldPatch`,
    // que agora também entende `reticuloOrigemModo`, ver lá) quanto direto
    // no objeto salvo, então não precisa de nenhum tratamento especial aqui.
    panel.querySelector('#obj-reticulo-origem-modo')?.addEventListener('change', (e) => {
      salvarCampo({ reticuloOrigemModo: e.target.value });
      // NOVO (05/09/2026) — os mesmos 2 botões agora também existem na barra
      // de contexto da ferramenta "Retículo métrico" no cabeçalho (ver
      // _reticuloToolctxHtml/_wireReticuloToolctx) — atualiza o estado
      // "aceso" deles aqui pra ficarem espelhados com o que acabou de ser
      // escolhido no painel, mesmo espírito de _syncMap2DDrawerUI.
      // [15/09/2026 UTC RODADA 65] `?.` — barra de contexto de ferramenta é
      // exclusiva do Mapa 2D (`ctx` pode ser `View3D`, que não tem
      // `_updateToolCtx`); mesmo motivo/padrão do `reentrarReedit` acima.
      ctx._updateToolCtx?.();
    });
    panel.querySelector('#obj-x').oninput = (e) => {
      const novoX = parseFloat(e.target.value) || 0;
      const patch = { x: novoX };
      // BUG CORRIGIDO (05/09/2026) — mesma causa raiz já corrigida nos
      // outros 3 jeitos de mover um Retículo métrico (arrastar direto,
      // arrastar pela ferramenta Formas, ferramenta "Selecionar"): editar
      // a Posição X aqui também precisa transladar `reticuloOrigemX` pelo
      // MESMO delta, senão a origem da grade fica parada no mundo enquanto
      // o retângulo "anda" pelo campo numérico.
      const d = objAtual();
      if (d?.reticuloMetrico) patch.reticuloOrigemX = (d.reticuloOrigemX ?? d.x) + (novoX - d.x);
      salvarCampo(patch);
    };
    panel.querySelector('#obj-y').oninput = (e) => {
      const novoY = parseFloat(e.target.value) || 0;
      const patch = { y: novoY };
      const d = objAtual();
      if (d?.reticuloMetrico) patch.reticuloOrigemY = (d.reticuloOrigemY ?? d.y) + (novoY - d.y);
      salvarCampo(patch);
    };
    panel.querySelector('#obj-angulo').oninput = (e) => salvarCampo({ angulo: (parseFloat(e.target.value) || 0) * Math.PI / 180 });
    panel.querySelector('#obj-piso').oninput = (e) => salvarCampo({ piso: parseInt(e.target.value, 10) || 0 });
    // [13/09/2026] NOVO — "Acabamento" do Piso ('liso'/'lajota', ver
    // `acabamentoField` acima e engine3d.js `_getProceduralFloorTexture`).
    panel.querySelector('#obj-acabamento')?.addEventListener('change', (e) => salvarCampo({ acabamento: e.target.value }));
    panel.querySelector('#obj-colisao-topo').onchange = (e) => salvarCampo({ colisaoTopo: !!e.target.checked });
    // "🔧 Modelar em 3D" (pedido do usuário, 28/08/2026 — Modelador 3D):
    // abre a Visualização 3D (view3d.js) já no Modo de Edição do modelador
    // (js/modeler/*.js), pra editar a malha deste objeto vértice a vértice,
    // "ao vivo". Objeto ainda sem `customMesh` (a esmagadora maioria — todo
    // objeto de sempre) ganha um agora, um CUBO inicial do tamanho da
    // caixa delimitadora atual dele (mantém o "lugar" físico que o objeto já
    // ocupava no mapa em vez de resetar pra um cubo de 0,5m genérico) — ver
    // Modeler3D.defaultCubeMesh/ensureCustomMesh. `window.__modelerPendingObjectId`
    // é um "combinado" simples (lido por view3d.js logo depois de montar a
    // cena) em vez de mudar a assinatura de App.openView3D/View3D.mount só
    // pra isso — mais simples e não arrisca quebrar nenhum outro caminho que
    // já chama essas duas funções sem esse parâmetro.
    // [15/09/2026 UTC] `?.` — este botão some do HTML quando `modoVer3D`
    // (ver template acima, substituído por "🔄 Transformação"), então o
    // elemento pode não existir aqui.
    const _btnObjModelar = panel.querySelector('#obj-modelar');
    if (_btnObjModelar) _btnObjModelar.onclick = () => {
      if (ctx._elLayerLocked(obj.layerId)) { Utils.toast('🔒 Este objeto está numa camada bloqueada.', { type: 'warn' }); return; }
      ensureCommitted();
      const alvo = (ctx._map.objects || []).find((o) => o.id === obj.id) || obj;
      if (!alvo.customMesh && window.Modeler3D?.ensureCustomMesh) {
        window.Modeler3D.ensureCustomMesh(alvo);
        Mapping.updateObject(ctx._map, alvo.id, { customMesh: alvo.customMesh, customMeshXform: alvo.customMeshXform, forma: alvo.forma, largura: alvo.largura, profundidade: alvo.profundidade, altura: alvo.altura });
        ctx._saveMap();
      }
      window.__modelerPendingObjectId = alvo.id;
      App.openView3D(ctx._map.id);
    };
    // [15/09/2026 UTC] NOVO — pedido verbatim: "Um novo botão
    // 'transformação' deve aparecer ali. Ao clicar nele, então, aparece a
    // transformação." Só existe no HTML quando `modoVer3D` (ver template
    // acima) — `ctx` aqui é o `View3D` (singleton, ver
    // `_openObjectProperties3D`/`_openObjectTransformSidebar3D` em
    // js/view3d.js), então `ctx._openObjectTransformSidebar3D` é o método
    // de VERDADE que já existia (renomeado nesta mesma rodada) pra abrir a
    // seção "Transformação" do painel lateral direito — MESMO widget do
    // Modelador (`ModelerUI.buildStandaloneObjectTransformPanel`), agora
    // com rotX/rotZ/escala pra QUALQUER objeto (ver engine3d.js
    // `_applyObjectExtraTransform`) e aplicado em tempo real (ver
    // `Engine3D.rebuildObjectIncremental`).
    panel.querySelector('#obj-transformacao')?.addEventListener('click', () => {
      ctx._openObjectTransformSidebar3D?.(obj);
    });
    // Patrimônio (pedido do usuário) — edita direto o campo do ITEM ligado
    // (não do objeto — o objeto em si não tem patrimônio próprio, quem tem é
    // o item catalogado associado a ele, ver `linkedItem`/obj.itemIds), sem
    // precisar abrir a ficha completa do item só pra isso.
    if (linkedItem) {
      panel.querySelector('#obj-patrimonio').oninput = async (e) => {
        await DB.updateItem(linkedItem.id, { patrimonio: e.target.value });
      };
    }
    if (isRetangulo) {
      // BUG CORRIGIDO (05/09/2026), pedido verbatim: "Ao mover e
      // redimensionar, pela janela de propriedades, está acontecendo o
      // mesmo problema de antes." — Largura/Profundidade, do jeito que
      // sempre funcionaram (`salvarCampo({largura:...})`), só mudam o
      // tamanho e deixam o CENTRO (x,y) parado — o retângulo cresce/encolhe
      // simetricamente pros 2 lados. Isso desloca o CANTO onde a origem da
      // grade mora (a origem em si, mundo, fica parada, do jeito certo —
      // resize nunca deveria mexer nela, mesmo tratamento já usado no
      // redimensionar por arraste das alças) pra longe de onde ele
      // realmente fica agora, dando a mesma impressão de "grade descolada".
      // Corrigido só pro Retículo métrico: em vez de deixar o centro parado,
      // recalcula x/y pra manter o CANTO do retângulo mais próximo da
      // origem no MESMO lugar do mundo de antes (mesmo princípio da âncora
      // usada no redimensionar por arraste de uma alça — ver
      // _formaDraftDrag "kind==='resize'"), só que aqui a "alça" é sempre o
      // canto oposto ao canto da origem. Formas comuns (sem
      // reticuloMetrico) continuam com o comportamento de sempre.
      const resizeMantendoCantoOrigem = (dim, valor) => {
        const d = objAtual();
        if (!d?.reticuloMetrico) { salvarCampo({ [dim]: valor }); return; }
        const ang = d.angulo || 0;
        const cos = Math.cos(-ang), sin = Math.sin(-ang);
        const dwx = (d.reticuloOrigemX ?? d.x) - d.x, dwy = (d.reticuloOrigemY ?? d.y) - d.y;
        const lx = dwx * cos - dwy * sin, ly = dwx * sin + dwy * cos; // origem em espaço local (sem rotação)
        const oldHalfW = (d.largura ?? 0.5) / 2, oldHalfD = (d.profundidade ?? 0.5) / 2;
        const signX = lx >= 0 ? 1 : -1, signY = ly >= 0 ? 1 : -1;
        const newLargura = dim === 'largura' ? valor : (d.largura ?? 0.5);
        const newProfundidade = dim === 'profundidade' ? valor : (d.profundidade ?? 0.5);
        const cosF = Math.cos(ang), sinF = Math.sin(ang); // local -> mundo (rotação direta, inversa da acima)
        const cornerLocalOld = { x: signX * oldHalfW, y: signY * oldHalfD };
        const cornerLocalNew = { x: signX * (newLargura / 2), y: signY * (newProfundidade / 2) };
        const cornerWorldOld = { x: d.x + (cornerLocalOld.x * cosF - cornerLocalOld.y * sinF), y: d.y + (cornerLocalOld.x * sinF + cornerLocalOld.y * cosF) };
        const novoX = cornerWorldOld.x - (cornerLocalNew.x * cosF - cornerLocalNew.y * sinF);
        const novoY = cornerWorldOld.y - (cornerLocalNew.x * sinF + cornerLocalNew.y * cosF);
        salvarCampo({ [dim]: valor, x: novoX, y: novoY });
      };
      panel.querySelector('#obj-largura').oninput = (e) => resizeMantendoCantoOrigem('largura', parseFloat(e.target.value) || 0.05);
      panel.querySelector('#obj-profundidade').oninput = (e) => resizeMantendoCantoOrigem('profundidade', parseFloat(e.target.value) || 0.05);
      panel.querySelector('#obj-altura').oninput = (e) => salvarCampo({ altura: parseFloat(e.target.value) || 0.05 });
      // NOVO (01/09/2026) — escada 3D paramétrica, ver comentário grande em formaFields.
      if (isEscada) panel.querySelector('#obj-escada-degraus').oninput = (e) => salvarCampo({ escadaDegraus: Utils.clamp(parseInt(e.target.value, 10) || 11, 1, 60) });
      panel.querySelector('#obj-cor').oninput = (e) => salvarCampo({ cor: e.target.value });
      panel.querySelector('#obj-cor-contorno').oninput = (e) => salvarCampo({ corContorno: e.target.value });
    } else if (isPoligono) {
      // Editar o raio aqui sempre volta a forma a ficar simétrica (círculo/
      // polígono regular "de verdade") — zera largura/profundidade
      // elípticas (herdadas do retângulo-molde da ferramenta Formas, ver
      // _finalizeFormaDraft), senão elas continuariam tendo prioridade no
      // desenho (ver Map2DRenderer._drawFormaShape) e o campo pareceria não
      // fazer efeito nenhum.
      panel.querySelector('#obj-raio').oninput = (e) => {
        const r = parseFloat(e.target.value) || 0.05;
        salvarCampo({ raio: r, largura: null, profundidade: null });
      };
      panel.querySelector('#obj-lados').oninput = (e) => salvarCampo({ lados: Utils.clamp(parseInt(e.target.value, 10) || 3, 3, 64) });
      panel.querySelector('#obj-altura').oninput = (e) => salvarCampo({ altura: parseFloat(e.target.value) || 0.05 });
      panel.querySelector('#obj-cor').oninput = (e) => salvarCampo({ cor: e.target.value });
      panel.querySelector('#obj-cor-contorno').oninput = (e) => salvarCampo({ corContorno: e.target.value });
    } else if (isImagem) {
      // "Altura em relação ao chão" pra imagem — pedido do usuário
      // (25/08/2026): "Deve ser possível definir uma altura em relação ao
      // chão para a imagem". O campo em si (`obj.elevacao`, metros ACIMA do
      // chão daquele piso) já existia de ponta a ponta — mapping.js já
      // considera ele em objectTopHeight/addObject (default 0, exceto
      // luminária), e engine3d.js já soma ele no `baseY` de QUALQUER objeto,
      // imagem incluída (`_buildImagemMesh`, ver comentário lá — "ao mirar
      // em cima da mesa, deve ser possível colocar coisas em cima dela"). O
      // que faltava era só um jeito de EDITAR esse valor manualmente pra
      // imagem — antes só era possível defini-lo automaticamente mirando por
      // cima de outro objeto no 3D. Sem `min`/`max` alto de propósito
      // (diferente do peitoril de porta/janela, travado em 3m) — uma imagem
      // pode ser pendurada em qualquer altura de parede/teto.
      panel.querySelector('#obj-elevacao').oninput = (e) => salvarCampo({ elevacao: Math.max(0, parseFloat(e.target.value) || 0) });
    }
    // ATUALIZADO (06/09/2026) — lógica de exclusão movida pra
    // `_deleteObjectById` (reaproveitada agora também pela tecla DEL/
    // Backspace com um objeto selecionado, ver _onEscCancel), pedido
    // explícito do usuário de não duplicar essa lógica em dois lugares.
    // `ensureCommitted()` continua chamado aqui antes (sai de uma
    // reedição-com-alças em progresso), mas `_deleteObjectById` já cobre
    // esse mesmo passo sozinho — mantido aqui só por clareza/paralelismo
    // com as outras ações deste painel (trocar tipo/associar item), que
    // também chamam `ensureCommitted()` explicitamente.
    panel.querySelector('#obj-excluir').onclick = () => {
      ensureCommitted();
      ctx._deleteObjectById(obj.id);
    };
    // As 3 ações abaixo (trocar tipo/associar/desassociar item) chamam
    // `ensureCommitted()`, que finaliza um rascunho-com-alças em progresso
    // (ver _startFormaReedit) — sem reabrir a reedição depois, o objeto
    // reaparecia "selecionado" (painel aberto) mas SEM alças/orb de giro
    // nenhum na grade (bug relatado pelo usuário: "ao selecionar a imagem,
    // as alças e o orb de giro devem aparecer de novo"). `reentrarReedit`
    // reabre o MESMO modo de rascunho-com-alças no objeto fresco, só quando
    // ele ainda é uma forma desenhada (retângulo/polígono/imagem) e o
    // painel foi aberto pela ferramenta Formas — um objeto-ícone comum
    // nunca teve esse gizmo, então não faz sentido tentar reabrir nele.
    // [14/09/2026 UTC] CORRIGIDO — pedido verbatim: "ao trocar de objeto (na
    // janela de propriedades) de 'Teto' para 'Robô', o gizmo acaba ficando
    // ativo no robô, porém o 'Robô' não tem gizmo ainda." CAUSA RAIZ: o
    // teste acima (`o.forma === 'retangulo'/'poligono'/'imagem'`) NÃO
    // distinguia uma forma desenhada de propósito (ferramenta Formas) de um
    // objeto-ícone comum do catálogo — `Mapping.applyDefaultShapeToObject`
    // (chamado por `addObject` em TODO objeto novo, e também pelo
    // `shapeDoTipo` do "Trocar tipo" acima) grava esses MESMOS valores de
    // `forma` (poligono/retangulo) em objetos-ícone só pra guardar o
    // formato/tamanho real do footprint (usado no hit-test/2D) — não
    // significa que aquele objeto é uma forma desenhada com gizmo. A
    // diferença de verdade é `tipo`: uma forma desenhada de propósito
    // sempre tem `tipo: null` (ver o branch `isShape` do "Trocar tipo"
    // acima); um objeto-ícone do catálogo sempre tem um `tipo` (string)
    // preenchido. Adicionado `!o.tipo` à condição — só reabre o gizmo pra
    // formas de verdade (sem tipo) ou pros tipos que TÊM gizmo próprio
    // (Piso/Teto, ver `_tipoObjetoTemGizmo`), nunca mais pra um ícone comum
    // como o "Robô de limpeza".
    // [15/09/2026 UTC] `ctx._tipoObjetoTemGizmo(o.tipo)` (era
    // `ctx._isTipoComGizmo(o.tipo)`) — RODADA 50, unificação com o helper
    // que a RODADA 49 criou pra Mesa/Coluna (`_objectStampHasGizmo`); ver
    // comentário grande de `_tipoObjetoTemGizmo` em mapview.js.
    // [15/09/2026 UTC RODADA 65] `?.` em `_tipoObjetoTemGizmo`/`_startFormaReedit`
    // — bug encontrado na mesma auditoria do `_componentsSummaryHtml`
    // (ver view3d.js `_ensureObjectPanelInfraFromMapView`): reentrarReedit é
    // chamada após associar/desassociar patrimônio (linhas ~906/947/958),
    // reabilitado desde a RODADA 64 pro painel completo do Mapa 2D funcionar
    // também dentro do "Ver em 3D" (`ctx` = `View3D`). O gizmo de
    // arraste/reedição com alças é uma feature exclusiva do CANVAS 2D
    // (`Map2DRenderer`) — não existe nem faz sentido equivalente no 3D — por
    // isso, ao contrário de `_componentsSummaryHtml`/`_updateBbmItemCount`
    // (que FORAM adicionadas à lista de cópia por serem seguras/genéricas),
    // aqui a correção é só tornar a chamada opcional (`?.`), deixando o
    // "re-entrar no gizmo" silenciosamente não fazer nada no 3D em vez de
    // estourar `TypeError`, igual à limitação já documentada nesta rodada.
    const reentrarReedit = (o) => {
      if (!o) return;
      if (formasTool && !o.tipo && (o.forma === 'retangulo' || o.forma === 'poligono' || o.forma === 'imagem')) { ctx._startFormaReedit?.(o); return; }
      if (ctx._tipoObjetoTemGizmo?.(o.tipo)) ctx._startFormaReedit?.(o);
    };
    // `?.` — some do HTML quando `modoVer3D` (mesma nota de `#obj-modelar`
    // acima).
    const _btnObjTipoTrocar = panel.querySelector('#obj-tipo-trocar');
    if (_btnObjTipoTrocar) _btnObjTipoTrocar.onclick = async () => {
      const stamp = await ctx._pickObjectType();
      if (!stamp) return;
      ensureCommitted();
      ctx._objectStampType = stamp;
      const isShape = typeof stamp === 'object';
      // Trocar pra um tipo de ícone do catálogo (não uma forma desenhada
      // manual) já aplica o formato físico dele na hora (ex.: virar um
      // "switch" já fica retângulo, não precisa esperar recarregar o mapa
      // pra ensureNewFields migrar — ver Mapping.defaultShapeForTipo).
      const shapeDoTipo = !isShape ? Mapping.defaultShapeForTipo(stamp) : null;
      // [14/09/2026 UTC] CORREÇÃO — pedido verbatim: "o desenho do 'Robô de
      // limpeza' que aparece no mapa 2D é tão grande quanto a forma que
      // estava o 'Teto de gesso' [...] no mapa 2D, ele deve aparecer na sua
      // representação, do tamanho que é realmente." + "Essa inconsistência
      // está acontecendo com o objeto 'Pilar' também [...] veja se é um
      // glitch de código esquecido e se está afetando outros objetos
      // também." CAUSA RAIZ: `salvarCampo`/`Mapping.updateObject` faz um
      // MERGE (`Object.assign`), nunca um replace — trocar de um tipo
      // 'retangulo' (`largura`/`profundidade` grandes, ex. "Teto de gesso")
      // pra um tipo 'poligono' (`raio` pequeno, ex. "Robô de limpeza"/
      // "Pilar") só ESCREVIA os campos novos (`raio`/`lados`), nunca
      // LIMPAVA os antigos (`largura`/`profundidade`) — e
      // `Map2DRenderer._drawFormaShape` (forma 'poligono') prioriza
      // `obj.largura`/`obj.profundidade` SE presentes, só caindo pra
      // `obj.raio` quando ausentes (pensado pra permitir uma "elipse"
      // manual — não é bug em si). Resultado: o raio novo, correto, nunca
      // era usado — o objeto continuava do tamanho antigo (também no
      // sentido contrário: retângulo herdando um `raio`/`lados` vestigiais,
      // embora nesse sentido `_drawFormaShape` não os leia hoje). Afeta
      // TODO objeto do catálogo (não só "Robô de limpeza"/"Pilar" — mais de
      // 30 tipos usam este mesmo botão "Trocar tipo/forma"), sempre que a
      // troca muda a FAMÍLIA de forma (retângulo ⇄ polígono). Corrigido
      // zerando explicitamente os 4 campos dimensionais antes de aplicar o
      // formato do tipo novo — só os que pertencem à forma nova sobrevivem.
      // [14/09/2026 UTC] AMPLIADO na rodada seguinte — pedido verbatim:
      // "Aquele botão 'Trocar tipo' [...] deve ser como colocar na grade
      // aquele objeto escolhido desde o início, porém está sendo tratado
      // de modo diferente. Deve ser uma total substituição de objeto
      // naquela posição do mapa." A limpeza acima (largura/profundidade/
      // raio/lados) resolvia só o sintoma de TAMANHO; para ser uma
      // "substituição total" de verdade, todo campo de APARÊNCIA/malha do
      // tipo ANTERIOR precisa ser zerado antes de aplicar o novo — não só
      // os 4 dimensionais. `RESET_TROCA_TIPO` cobre: cor/altura (forma),
      // espelhamento e recorte de imagem (`flipH`/`flipV`/`src`/`aspect`),
      // estilo de traço/preenchimento da ferramenta Formas (`fillMode`/
      // `strokeWidth`/`strokeStyle`/`fillType`), e a malha customizada do
      // Modelador 3D (`customMesh`/`customMeshXform` — sem isto, um objeto
      // "esculpido" no Modelador e depois trocado de tipo continuaria
      // renderizando a malha esculpida antiga por cima do tipo novo).
      // Deliberadamente NÃO reseta: `id`/`x`/`y`/`piso`/`layerId`/`angulo`
      // (é uma troca NA MESMA posição/andar/camada/rotação, não um
      // "excluir e recriar do zero") nem `nome`/`classes`/`itemIds`/
      // grupo/scripts (identidade/organização/comportamento do usuário,
      // que o pedido não menciona querer perder).
      const RESET_TROCA_TIPO = {
        largura: null, profundidade: null, raio: null, lados: null,
        cor: null, altura: null, flipH: null, flipV: null, src: null, aspect: null,
        fillMode: null, strokeWidth: null, strokeStyle: null, fillType: null,
        customMesh: null, customMeshXform: null,
      };
      salvarCampo(isShape
        ? { tipo: null, ...RESET_TROCA_TIPO, ...stamp }
        : { tipo: stamp, forma: 'icone', ...RESET_TROCA_TIPO, ...shapeDoTipo });
      const fresh = (ctx._map.objects || []).find((o) => o.id === obj.id);
      reentrarReedit(fresh);
      ctx._openObjectPanel(fresh || obj);
    };
    // "Associar outro patrimônio" — pedido do usuário (26/08/2026): um
    // objeto pode ter MAIS DE UM patrimônio associado agora, então este
    // botão ADICIONA à lista (Mapping.addItemToObject) em vez de SUBSTITUIR
    // o único existente (era `salvarCampo({itemId})`, uma troca). Também
    // avisa na hora se o patrimônio escolhido JÁ está associado a algum
    // outro objeto do mapa ("será uma duplicação" — reaproveita o mesmo
    // Mapping.addItemToObject/_computeItemAssocIndex do resto da feature).
    panel.querySelector('#obj-item-associar').onclick = async () => {
      const itemId = await Utils.pickItem({ ambienteId: ctx._map.id, title: itemEntries.length ? 'Associar outro patrimônio a este objeto' : 'Associar item a este objeto' });
      if (!itemId) return;
      // Pedido do usuário (27/08/2026): guarda uma CÓPIA do número do
      // patrimônio junto da associação (ver Mapping.addItemToObject) — pra
      // sobreviver caso este item seja excluído do catálogo depois.
      const itemEscolhido = await DB.getItem(itemId);
      ensureCommitted();
      // `ensureCommitted()` já devolveu o objeto pra `ctx._map.objects`
      // (se estava em reedição) — busca de novo aqui, não usa o `obj`
      // capturado no fechamento (pode estar desatualizado/removido do array
      // durante a reedição).
      const alvo = (ctx._map.objects || []).find((o) => o.id === obj.id) || obj;
      const adicionou = Mapping.addItemToObject(ctx._map, alvo.id, itemId, itemEscolhido?.patrimonio);
      if (!adicionou) {
        Utils.toast('Este patrimônio já está associado a este objeto.', { type: 'warn' });
        return;
      }
      ctx._saveMap();
      // Avisa se este patrimônio JÁ estava em outro objeto do mapa (mesmo
      // conceito da flag 🔁 desenhada na grade) — o usuário pode não
      // perceber na hora, já que a busca não filtra itens já associados em
      // OUTRO lugar (só nunca duplica no MESMO objeto, ver addItemToObject).
      const outrasOcorrencias = ctx._renderer?._computeItemAssocIndex(ctx._map).get(itemId) || []; // ver nota "ctx._renderer opcional" acima
      if (outrasOcorrencias.length > 1) {
        const ordinal = outrasOcorrencias.findIndex((o) => o.objId === alvo.id) + 1;
        Utils.toast(`🔁 Este patrimônio já estava associado a outro objeto — esta é a ${ordinal}ª associação dele no mapa.`, { type: 'warn', duration: 4000 });
      } else {
        Utils.toast('Patrimônio associado ✓', { type: 'ok' });
      }
      const fresh = (ctx._map.objects || []).find((o) => o.id === obj.id);
      reentrarReedit(fresh);
      ctx._openObjectPanel(fresh || obj);
    };
    panel.querySelectorAll('.obj-item-remover').forEach((btn) => {
      btn.addEventListener('click', () => {
        ensureCommitted();
        const alvo = (ctx._map.objects || []).find((o) => o.id === obj.id) || obj;
        Mapping.removeItemFromObject(ctx._map, alvo.id, btn.dataset.id);
        ctx._saveMap();
        Utils.toast('Associação removida.', { type: 'warn' });
        const fresh = (ctx._map.objects || []).find((o) => o.id === obj.id);
        reentrarReedit(fresh);
        ctx._openObjectPanel(fresh || obj);
      });
    });
    panel.querySelectorAll('.obj-item-ver').forEach((btn) => {
      btn.addEventListener('click', () => { ensureCommitted(); App.showItemDetail(btn.dataset.id); });
    });
    };

    return { html, wire };

  },
};
