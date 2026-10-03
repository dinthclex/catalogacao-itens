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
// achar a causa raiz do bug da RODADA 17),
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
    // [18/09/2026 UTC] NOVO -- "Rack" modular de 19" (js/rack-modular.js): em
    // vez de Largura/Profundidade/Altura livres, so 2 parametros (Us e
    // Profundidade em mm, restritos a matriz de mercado); as medidas 2D/3D
    // sao derivadas deles por `RackModular.patchParaObjeto`.
    const isRack = obj.tipo === 'rack' && !!window.RackModular && !!window.RACK_CATALOGO;
    // [18/09/2026 UTC] RODADA 166 -- Switch 24/48 e Patch Panel 24/48 (js/rede-equip.js): medidas fixas
    // (19" x 1U/2U reais); o painel ganha energia, instalacao no rack, tabela de portas (rotulo/LED/cabo)
    // e conexao de cabos.
    const isRede = !!window.RedeEquip && window.RedeEquip.ehEquipRede(obj.tipo);
    // Forma com um `tipo` de catálogo associado (ex.: "mesa" — ver
    // _MESA_FORMA_DEF) mostra o nome DAQUELE tipo ("Mesa"), não o rótulo
    // genérico da forma ("Retângulo/quadrado desenhado") — mantém a
    // identidade do objeto mesmo sendo editável como uma forma desenhada.
    const label = (obj.tipo && (isRetangulo || isPoligono)) ? ((obj.tipo === 'texto3d') ? 'Texto' : (window.Icons?.labelForAnyKey?.(obj.tipo) || obj.tipo))
      : isRetangulo ? 'Retângulo/quadrado desenhado'
      : isPoligono ? `Polígono desenhado (${Math.max(3, Math.round(obj.lados || 24))} lados)`
      : isImagem ? 'Imagem'
      : ((obj.tipo === 'texto3d') ? 'Texto' : (window.Icons?.labelForAnyKey?.(obj.tipo) || obj.tipo));
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
          <button type="button" class="icon-btn sm obj-item-editar" data-id="${entry.id}" title="Editar: trocar este patrimônio por outro">✏️</button>
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
      ? `<label class="map-panel-field" title="A escada é gerada por código a partir de Largura, Profundidade, Altura e Degraus desta janela (o 3D e o Modelador usam estes valores)."><span>Degraus</span><input type="number" step="1" min="1" max="60" id="obj-escada-degraus" value="${Math.max(1, Math.round(obj.escadaDegraus) || 11)}"></label>`
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
    const acabamentoField = (window.PisoCustom && (obj.tipo === 'piso' || window.PisoCustom.ehTeto(obj.tipo))) ? (() => {
      // [88ª rodada] "Desenho de referência" (Piso e Teto): sem (liso/cinza, padrão do Piso), lajota 30×30 (rejunte 1 mm), lajota 60×60 ou placas de forro 60×60. Teto: vale nas duas faces (cima e baixo).
      const PCx = window.PisoCustom, atual = PCx.padraoDe(obj);
      return `
      <label class="map-panel-field" title="Desenho de referência sobre a superfície, em escala real. 'Sem' mantém o objeto liso (cinza). No Teto aparece nos dois lados (em cima e embaixo).">
        <span>Desenho de referência</span>
        <select id="obj-padrao">${Object.keys(PCx.PADROES).map((k) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${PCx.PADROES[k]}</option>`).join('')}</select>
      </label>`;
    })() : '';
    // [87ª rodada] Telha (CustomRoof): material comercial × formato × inclinação (graus). Troca ao vivo no 3D (só material/textura; a inclinação refaz só a geometria).
    const telhaField = obj.tipo === 'telha' ? (() => {
      const R = window.CustomRoof, t = R ? R.cfgDe(obj) : {};
      const opt = (D, sel) => Object.keys(D).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${D[k].rotulo}</option>`).join('');
      const optA = Object.keys(R ? R.AGUAS : {}).map((k) => `<option value="${k}" ${+k === +t.aguas ? 'selected' : ''}>${R.AGUAS[k]}</option>`).join('');
      // [88ª] União: lista os outros telhados do mapa (✓ = encostam/sobrepõem o contorno deste); quem já está unido mostra o botão de separar.
      const outros = (ctx._map.objects || []).filter((o) => o.tipo === 'telha' && o.id !== obj.id);
      const bb = (o) => { const b = window.PisoCustom.bbox(o), c = Math.cos(o.angulo || 0), s = Math.sin(o.angulo || 0); const xs = [b.x0, b.x1], ys = [b.y0, b.y1]; let a = 1e9, z = -1e9, c2 = 1e9, d = -1e9; xs.forEach((x) => ys.forEach((y) => { const X = (o.x || 0) + x * c - y * s, Y = (o.y || 0) + x * s + y * c; a = Math.min(a, X); z = Math.max(z, X); c2 = Math.min(c2, Y); d = Math.max(d, Y); })); return [a, z, c2, d]; };
      const me = R ? bb(obj) : null, toca = (o) => { const q = bb(o); return !(q[1] < me[0] - 0.2 || q[0] > me[1] + 0.2 || q[3] < me[2] - 0.2 || q[2] > me[3] + 0.2); };
      const todosT = (ctx._map.objects || []).filter((x) => x.tipo === 'telha'), nomeT = (o) => 'Telhado ' + (todosT.indexOf(o) + 1);
      const sobrepoe = (o) => { try { return Mapping._boxesOverlap(Mapping._footprintBox(obj), Mapping._footprintBox(o)); } catch (e) { return false; } };
      // [90ª] União: um toggle por telhado (✓ = toca/sobrepõe). Ligar = entra no grupo (funde grupos); desligar = sai só ele.
      const linhasU = outros.map((o) => { const unido = !!(t.grupo && R.cfgDe(o).grupo === t.grupo); return `<label style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:12.5px;cursor:pointer"><input type="checkbox" data-telha-toggle="${o.id}" ${unido ? 'checked' : ''}><span style="flex:1">${nomeT(o)}${toca(o) || sobrepoe(o) ? ' <span title="toca ou se sobrepõe a este telhado">✓</span>' : ''}</span><span>${unido ? '🔗' : ''}</span></label>`; }).join('');
      return R ? `
      <label class="map-panel-field" title="Material da telha (comercial): concreto, zinco, PVC, cerâmica, fibra de vidro, vidro, PET ou painel fotovoltaico."><span>Material da telha</span><select id="obj-telha-material">${opt(R.MATERIAIS, t.material)}</select></label>
      <label class="map-panel-field" title="Formato: ondulada, trapezoidal, romana/portuguesa ou plana (shingle). Muda o desenho no 2D e no 3D na hora."><span>Formato</span><select id="obj-telha-formato">${opt(R.FORMATOS, t.formato)}</select></label>
      <label class="map-panel-field" title="Inclinação das águas, em graus (0 = plano)."><span>Inclinação (°)</span><input type="number" id="obj-telha-incl" min="0" max="75" step="1" value="${t.inclinacao}"></label>
      <label class="map-panel-field" title="Número de águas (planos inclinados) do mercado: 1 = meia-água, 2 = duas águas, 3 = três águas (uma ponta em meia-água), 4 = quatro águas (espigões nos cantos). As divisões aparecem tracejadas no 2D."><span>Águas</span><select id="obj-telha-aguas">${optA}</select></label>
      <div id="obj-telha-unir-lista" style="margin:6px 0;padding:6px 8px;border:1px solid var(--border,#555);border-radius:6px" title="Une este telhado a outros: as águas se encontram (cumeeiras e vales) e viram uma peça única no 3D. A união aparece em laranja no 2D. Dá para unir vários (todos) ao mesmo tempo."><div style="font-size:11.5px;color:var(--text-dim);margin-bottom:2px">Unir telhados (águas se encontram):</div>${linhasU || '<div style="font-size:12px;color:var(--text-dim)">Não há outros telhados no mapa.</div>'}</div>` : '';
    })() : '';
    // [76ª rodada] Os botões de edição do Piso (vértices/furo/recorte) saíram da janela de propriedades: ficam no cabeçalho do mapa 2D (#tbm-piso-bar, js/piso-custom-edit.js).
    const pisoEditField = '';
    const rackFieldsHtml = isRack ? (() => {
      const RC = window.RACK_CATALOGO;
      const r = window.RackModular.fromObjeto(obj);
      const optUs = RC.ALTURAS_U.map((u) => `<option value="${u}" ${u === r.us ? 'selected' : ''}>${u}U</option>`).join('');
      const optProf = RC.PROFUNDIDADES_MM.map((pf) => `<option value="${pf}" ${pf === r.profundidade ? 'selected' : ''}>${pf} mm</option>`).join('');
      const elevField = r.tipo === 'parede'
        ? `<label class="map-panel-field" title="Distancia do chao ate a base do rack de parede."><span>Altura da base (m)</span><input type="number" step="0.05" min="0" id="obj-rack-elev" value="${(obj.elevacao || 0).toFixed(2)}"></label>`
        : '';
      // [18/09/2026 UTC] RODADA 164 -- Montagem (pecas desmontaveis) e Equipamentos.
      const mont = Object.assign({ frente: true, traseira: true, lateralEsq: true, lateralDir: true, topo: true, base: true }, obj.rackMontagem || {});
      // [21/09/2026] topo/base refletem `rackTampaEstado` (fonte real desde a RODADA 205 -- ver
      // `RackModular.patchMontagem`), não o espelho legado `rackMontagem`: em racks salvos antes
      // da correção acima, os dois podiam estar dessincronizados (checkbox marcado sem efeito
      // nenhum no 3D) -- isto faz o checkbox mostrar o que REALMENTE está montado.
      const teAtual = obj.rackTampaEstado || {};
      if (teAtual.topo) mont.topo = teAtual.topo !== 'sem_tampa';
      if (teAtual.base) mont.base = teAtual.base !== 'sem_tampa';
      const tt = obj.rackTraseiraTipo === 'chapa' ? 'chapa' : 'porta';
      const checks = RC.PECAS.map((p) => {
        const rot = p.chave === 'traseira' ? (tt === 'chapa' ? 'Chapa de tr\u00e1s' : 'Porta de tr\u00e1s') : p.rotulo;
        return `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" data-rack-peca="${p.chave}" ${mont[p.chave] ? 'checked' : ''}> ${Utils.escapeHtml(rot)}</label>`;
      }).join('');
      const acessAtuais = r.acessorios();
      const listaAcess = acessAtuais.length ? acessAtuais.map((a) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px"><span>${Utils.escapeHtml((RC.ACESSORIOS[a.tipo] && RC.ACESSORIOS[a.tipo].rotulo) || a.tipo)} &mdash; U${a.uInicial}${a.alturaU > 1 ? '&ndash;' + (a.uInicial + a.alturaU - 1) : ''}</span><button type="button" class="btn btn-sm" data-rack-rem="${Utils.escapeHtml(a.id)}">Remover</button></div>`).join('')
        : '<div style="font-size:12.5px;color:var(--text-dim)">Nenhum equipamento instalado.</div>';
      const optTipos = Object.keys(RC.ACESSORIOS).filter((k) => k === 'organizador' || k === 'bandeja').map((k) => `<option value="${k}">${Utils.escapeHtml(RC.ACESSORIOS[k].rotulo)}</option>`).join('');
      const RE0 = window.RedeEquip;
      const eqRede = RE0 ? RE0.equipDoRack(ctx._map, obj.id).sort((a, b) => (a.rackU || 0) - (b.rackU || 0)) : [];
      const redeRackHtml = RE0 ? `<fieldset class="map-panel-field" style="border:1px solid var(--border,#3a4250);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px">
        <legend style="font-size:12.5px;padding:0 4px">Equipamentos de rede (por U): switches, patch panels, DIO, guias, PDU...</legend>
        ${eqRede.length ? eqRede.map((e) => { const sq = RE0.especificar(e.tipo); return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px"><span>U${e.rackU}${sq.alturaU > 1 ? '\u2013' + (e.rackU + sq.alturaU - 1) : ''} \u00b7 ${Utils.escapeHtml(sq.rotulo)} \u2014 ${Utils.escapeHtml(e.nome || '')}</span><button type="button" class="btn btn-sm" data-rack-rede-ret="${e.id}">Retirar</button></div>`; }).join('') : '<div style="font-size:12.5px;color:var(--text-dim)">Nenhum instalado.</div>'}
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><select id="obj-rack-rede-tipo">${RE0.TIPOS_RACKAVEIS.map((t) => `<option value="${t}">${Utils.escapeHtml(RE0.especificar(t).rotulo)}</option>`).join('')}</select><button type="button" class="btn btn-sm" data-rack-rede-add="sel">\uff0b Instalar na 1\u00aa U livre</button></div>
      </fieldset>` : '';
      const montagemHtml = `
      <fieldset class="map-panel-field" style="border:1px solid var(--border,#3a4250);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px">
        <legend style="font-size:12.5px;padding:0 4px">Montagem (pe\u00e7as)</legend>
        ${checks}
        <div style="border-top:1px solid var(--border,#3a4250);padding-top:6px;display:flex;flex-direction:column;gap:6px" title="Roteamento autom\u00e1tico dos cabos traseiros do patch panel: barra de apoio (5 cm) \u2192 guia vertical \u2192 furo da tampa.">
          <div style="font-size:12.5px">\ud83d\udd0c Sa\u00edda de cabos</div>
          <label style="display:flex;gap:8px;align-items:center;font-size:13px"><span>Dire\u00e7\u00e3o:</span><select id="obj-rack-saida-dir"><option value="nenhum" ${obj.rackCableEntry !== 'top' && obj.rackCableEntry !== 'bottom' ? 'selected' : ''}>Desligado</option><option value="top" ${obj.rackCableEntry === 'top' ? 'selected' : ''}>Topo</option><option value="bottom" ${obj.rackCableEntry === 'bottom' ? 'selected' : ''}>Base</option></select></label>
          <label style="display:flex;gap:8px;align-items:center;font-size:13px" title="Abre as duas tampas ao mesmo tempo (independente da Dire\u00e7\u00e3o escolhida acima) -- \u00fatil quando parte dos cabos sai por cima e parte por baixo."><input type="checkbox" id="obj-rack-saida-ambas" ${(() => { const te = obj.rackTampaEstado || {}; return te.topo === 'com_abertura' && te.base === 'com_abertura' ? 'checked' : ''; })()}> Abrir as duas tampas ao mesmo tempo</label>
          <label style="display:flex;gap:8px;align-items:center;font-size:13px"><span>Alinhamento:</span><select id="obj-rack-saida-alin">${['center:Centro', 'left_corner:Canto esquerdo', 'right_corner:Canto direito', 'custom:Personalizado'].map((x) => { const [v, r] = x.split(':'); return `<option value="${v}" ${(obj.rackCableExitAlignment || 'center') === v ? 'selected' : ''}>${r}</option>`; }).join('')}</select></label>
          <div id="obj-rack-saida-custom" style="display:${obj.rackCableExitAlignment === 'custom' ? 'flex' : 'none'};gap:8px;align-items:center;font-size:13px"><span>Offset X/Z (m):</span><input type="number" step="0.01" id="obj-rack-saida-x" value="${(obj.rackCustomExitOffset && obj.rackCustomExitOffset.x) || 0}" style="width:70px"><input type="number" step="0.01" id="obj-rack-saida-z" value="${(obj.rackCustomExitOffset && obj.rackCustomExitOffset.z) || 0}" style="width:70px"></div>
          <label style="display:flex;gap:8px;align-items:center;font-size:13px" title="Retangular: cada patch panel forma uma grade (colunas x raias), vista de corte retangular. Cil\u00edndrico: grade quase quadrada, feixe mais redondo (usa mais altura livre acima do patch panel)."><span>Formato do feixe:</span><select id="obj-rack-cabos-fmt"><option value="retangular" ${obj.rackCabosFormato !== 'cilindrico' ? 'selected' : ''}>Retangular</option><option value="cilindrico" ${obj.rackCabosFormato === 'cilindrico' ? 'selected' : ''}>Cil\u00edndrico</option></select></label>
          <label style="display:flex;gap:8px;align-items:center;font-size:13px" title="Dist\u00e2ncia entre os cabos do feixe. Junto = colados (0,87 \u00d7 di\u00e2metro: as faces do cabo se tocam, padr\u00e3o); Afastado = 1,06 \u00d7 di\u00e2metro; Livre = voc\u00ea define (0,87 a 3,00)."><span>Espa\u00e7amento:</span><select id="obj-rack-cabos-esp"><option value="afastado" ${obj.rackCabosEspacamento === 'afastado' ? 'selected' : ''}>Afastado</option><option value="junto" ${(obj.rackCabosEspacamento || 'junto') === 'junto' ? 'selected' : ''}>Junto (colados)</option><option value="livre" ${obj.rackCabosEspacamento === 'livre' ? 'selected' : ''}>Livre</option></select></label>
          <label id="obj-rack-cabos-fator-wrap" style="display:${obj.rackCabosEspacamento === 'livre' ? 'flex' : 'none'};gap:8px;align-items:center;font-size:13px" title="Dist\u00e2ncia centro a centro entre cabos, em m\u00faltiplos do di\u00e2metro. 0,87 = colados (as faces se tocam)."><span>Dist\u00e2ncia (\u00d7 di\u00e2metro):</span><input type="number" step="0.01" min="0.87" max="3" id="obj-rack-cabos-fator" value="${(Number.isFinite(Number(obj.rackCabosFator)) ? Number(obj.rackCabosFator) : 1.5).toFixed(2)}" style="width:70px"></label>
          <label style="display:flex;gap:8px;align-items:center;font-size:13px" title="Dist\u00e2ncia VERTICAL entre os agrupamentos (feixes correndo na horizontal, junto \u00e0 tampa). Junto = colados (padr\u00e3o); Afastado; Livre = voc\u00ea define."><span>Espa\u00e7amento vertical:</span><select id="obj-rack-cabos-espv"><option value="afastado" ${obj.rackCabosEspacamentoV === 'afastado' ? 'selected' : ''}>Afastado</option><option value="junto" ${(obj.rackCabosEspacamentoV || 'junto') === 'junto' ? 'selected' : ''}>Junto (colados)</option><option value="livre" ${obj.rackCabosEspacamentoV === 'livre' ? 'selected' : ''}>Livre</option></select></label>
          <label id="obj-rack-cabos-fatorv-wrap" style="display:${obj.rackCabosEspacamentoV === 'livre' ? 'flex' : 'none'};gap:8px;align-items:center;font-size:13px" title="Dist\u00e2ncia vertical entre agrupamentos, em m\u00faltiplos do di\u00e2metro do cabo. 0,87 = colados (as faces se tocam)."><span>Dist\u00e2ncia vert. (\u00d7 di\u00e2metro):</span><input type="number" step="0.01" min="0.87" max="6" id="obj-rack-cabos-fatorv" value="${(Number.isFinite(Number(obj.rackCabosFatorV)) ? Number(obj.rackCabosFatorV) : 2).toFixed(2)}" style="width:70px"></label>
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px" title="O que fecha a traseira do rack: uma porta articulada (com grelha) ou uma chapa met\u00e1lica fixa."><span>Traseira:</span><select id="obj-rack-traseira"><option value="porta" ${tt === 'porta' ? 'selected' : ''}>Porta</option><option value="chapa" ${tt === 'chapa' ? 'selected' : ''}>Chapa met\u00e1lica</option></select></label>
        <div style="display:flex;gap:6px"><button type="button" class="btn btn-sm" id="obj-rack-desmontar">Desmontar tudo (s\u00f3 a arma\u00e7\u00e3o)</button><button type="button" class="btn btn-sm" id="obj-rack-montar">Montar tudo</button></div>
        <div style="font-size:11.5px;color:var(--text-dim)">No Ver em 3D: dois cliques na porta abrem/fecham (Modo Navega\u00e7\u00e3o); clique esquerdo no Modo Edi\u00e7\u00e3o abre o menu (remover a pe\u00e7a mirada, recolocar, equipamentos).</div>
      </fieldset>
      <fieldset class="map-panel-field" style="border:1px solid var(--border,#3a4250);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px">
        <legend style="font-size:12.5px;padding:0 4px">Acess\u00f3rios (organizador/bandeja, por U)</legend>
        ${listaAcess}
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <select id="obj-rack-acc-tipo">${optTipos}</select>
          <label style="font-size:12.5px">Altura <input type="number" id="obj-rack-acc-h" min="1" max="${r.us}" step="1" value="1" style="width:52px">U</label>
          <label style="font-size:12.5px" title="Vazio = primeira U livre">U inicial <input type="number" id="obj-rack-acc-u" min="1" max="${r.us}" step="1" placeholder="auto" style="width:60px"></label>
          <button type="button" class="btn btn-sm" id="obj-rack-acc-add">Adicionar</button>
        </div>
      </fieldset>
      ${redeRackHtml}`;
      return `
      <label class="map-panel-field" title="Altura util em Us (1U = 44,45 mm). Ate 14U o rack e de parede; a partir de 16U e de piso (com rodizios)."><span>Altura (Us)</span><select id="obj-rack-us">${optUs}</select></label>
      <label class="map-panel-field"><span>Profundidade (mm)</span><select id="obj-rack-prof">${optProf}</select></label>
      <div class="map-panel-field" style="font-size:12.5px; color:var(--text-dim)">Tipo: <b>${r.tipo === 'parede' ? 'Parede' : 'Piso'}</b> &middot; ${Math.round(r.dim.largura)} &times; ${r.dim.profundidade} &times; ${Math.round(r.dim.alturaTotal)} mm (L &times; P &times; A) &middot; ${r.us} pontos de encaixe (1 por U)</div>
      ${elevField}
      ${montagemHtml}
      <label class="map-panel-field"><span>Preenchimento</span><input type="color" id="obj-cor" value="${obj.cor || '#2b2f36'}"></label>
      <label class="map-panel-field" title="Cor do contorno no mapa 2D"><span>Contorno</span><input type="color" id="obj-cor-contorno" value="${obj.corContorno || obj.cor || '#2b2f36'}"></label>
    `;
    })() : '';
    const redeFieldsHtml = isRede ? (() => {
      const RE = window.RedeEquip, esc = (t) => Utils.escapeHtml(String(t == null ? '' : t));
      const sp = RE.especificar(obj.tipo), ehSw = RE.ehSwitch(obj.tipo), r = RE.garantirRede(obj), mapa = ctx._map;
      const racks = (mapa.objects || []).filter((o) => o.tipo === 'rack');
      const rackAtual = obj.rackId ? racks.find((o) => o.id === obj.rackId) : null;
      const optRacks = racks.map((o) => `<option value="${o.id}">${esc(o.nome || 'Rack')} (${o.rackUs || 12}U)</option>`).join('');
      const instHtml = rackAtual
        ? `<div style="font-size:13px">Instalado em <b>${esc(rackAtual.nome || 'Rack')}</b> · U${obj.rackU}${sp.alturaU > 1 ? '–' + (obj.rackU + sp.alturaU - 1) : ''}</div><div><button type="button" class="btn btn-sm" id="obj-rede-retirar">Retirar do rack</button></div>`
        : (racks.length ? `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><select id="obj-rede-rack">${optRacks}</select><label style="font-size:12.5px" title="Vazio = 1ª U livre">U <input type="number" id="obj-rede-u" min="1" step="1" placeholder="auto" style="width:56px"></label><button type="button" class="btn btn-sm" id="obj-rede-instalar">Instalar no rack</button></div>`
          : '<div style="font-size:12.5px;color:var(--text-dim)">Nenhum rack no mapa. Solte o equipamento sobre um rack para encaixar na U mais próxima.</div>');
      const linhas = sp.portas.map((pt) => {
        const pr = r.portas[pt.n] || {}, cabo = RE.caboDaPorta(mapa, obj.id, pt.n);
        let cab = '—';
        if (cabo) { const l = RE.outroLado(cabo, obj.id, pt.n), o = (mapa.objects || []).find((x) => x.id === l.obj); cab = `🔌 ${esc(o ? (o.nome || o.tipo) : '?')}:${l.porta} <button type="button" class="btn btn-sm" data-rede-des="${pt.n}" title="Desconectar">×</button>`; }
        const st = ehSw ? `<td><select data-rede-st="${pt.n}">${['auto', 'active', 'idle', 'off'].map((v) => `<option value="${v}" ${(pr.status || 'auto') === v ? 'selected' : ''}>${v === 'auto' ? 'auto' : v === 'active' ? 'pisca' : v === 'idle' ? 'fixo' : 'apagado'}</option>`).join('')}</select></td>` : '';
        return `<tr><td style="white-space:nowrap">${pt.tipo === 'sfp' ? 'SFP ' : ''}${pt.n}</td><td><input data-rede-rot="${pt.n}" value="${esc(pr.rotulo || '')}" style="width:100%;min-width:70px"></td>${st}<td style="white-space:nowrap">${cab}</td></tr>`;
      }).join('');
      const outros = (mapa.objects || []).filter((o) => RE.ehEquipRede(o.tipo));
      const optDe = sp.portas.filter((pt) => !RE.caboDaPorta(mapa, obj.id, pt.n)).map((pt) => `<option value="${pt.n}">${pt.tipo === 'sfp' ? 'SFP ' : ''}${pt.n}</option>`).join('');
      const optCabo = Object.keys(RE.REDE_CATALOGO.CABOS).filter((k) => k !== 'console' && k !== 'fibra').map((k) => `<option value="${k}">${esc(RE.REDE_CATALOGO.CABOS[k].rotulo)}</option>`).join('');
      return `
      <div class="map-panel-field" style="font-size:12.5px;color:var(--text-dim)">${esc(sp.modelo)} · ${sp.largura} × ${sp.profundidade} × ${sp.alturaMm} mm${sp.alturaU ? ' (' + sp.alturaU + 'U, rack 19")' : ''} · ${sp.portas.length} porta(s)</div>
      <fieldset class="map-panel-field" style="border:1px solid var(--border,#3a4250);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px"><legend style="font-size:12.5px;padding:0 4px">Identificação e portas</legend>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px"><span>labelID</span><input type="text" id="obj-rede-label" value="${esc(r.labelID || '')}" placeholder="ex.: PP-A01 / TOM-12" style="flex:1"></label>
        ${sp.familia === 'dio' ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><span>Conector</span><select data-rede-cfg="conector">${['LC', 'SC', 'ST'].map((k) => `<option value="${k}" ${(r.conector || 'LC') === k ? 'selected' : ''}>${k}</option>`).join('')}</select><span>Fibra</span><select data-rede-cfg="fibra">${['SMF', 'OM3', 'OM4'].map((k) => `<option value="${k}" ${(r.fibra || 'SMF') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>` : ''}
        ${(sp.familia === 'patchpanel' || sp.familia === 'tomada') ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><span>Keystone</span><select data-rede-cfg="categoria">${['cat5e', 'cat6', 'cat6a', 'cat7'].map((k) => `<option value="${k}" ${(r.categoria || 'cat6') === k ? 'selected' : ''}>${({ cat5e: 'Cat5e', cat6: 'Cat6', cat6a: 'Cat6A', cat7: 'Cat7' })[k]}</option>`).join('')}</select><span>Blindagem</span><select data-rede-cfg="blindagem">${['U/UTP', 'F/UTP', 'S/FTP'].map((k) => `<option value="${k}" ${(r.blindagem || 'U/UTP') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>` : ''}
      </fieldset>
      ${(RE.ehAP(obj.tipo) && !modoVer3D && window.View3D) ? `<fieldset class="map-panel-field" style="border:1px solid var(--border,#3a4250);border-radius:8px;padding:8px">
        <legend style="font-size:12.5px;padding:0 4px">📡 Wi-Fi</legend>
        <button type="button" class="btn secondary sm" id="obj-rede-ap-config" style="width:100%">⚙️ Configurações de Rede / Wi-Fi</button>
        <div style="font-size:11.5px;color:var(--text-dim);margin-top:4px">Faixa, potência, densidade da varredura, "mostrar mapa" e o método de projeção no mapa 2D (fatiamento/textura) — a mesma janela do "Ver em 3D".</div>
      </fieldset>` : ''}
      ${ehSw ? `<fieldset class="map-panel-field" style="border:1px solid var(--border,#3a4250);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px"><legend style="font-size:12.5px;padding:0 4px">Energia</legend>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="obj-rede-ligado" ${r.ligado ? 'checked' : ''}> Ligado (LEDs acendem conforme os cabos)</label>
        <label style="display:flex;gap:8px;align-items:center;font-size:13px"><span>Hostname</span><input type="text" id="obj-rede-host" value="${esc(r.hostname)}" style="flex:1"></label>
        <div style="font-size:11.5px;color:var(--text-dim)">No Ver em 3D: dois cliques (Modo Navegação) ligam/desligam; clique esquerdo (Modo Edição) abre as opções.</div></fieldset>` : ''}
      ${RE.ehRackavel(obj.tipo) ? `<fieldset class="map-panel-field" style="border:1px solid var(--border,#3a4250);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px"><legend style="font-size:12.5px;padding:0 4px">Rack</legend>${instHtml}</fieldset>` : ''}
      ${sp.portas.length ? `<fieldset class="map-panel-field" style="border:1px solid var(--border,#3a4250);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px"><legend style="font-size:12.5px;padding:0 4px">Portas e cabos</legend>
        <div style="max-height:220px;overflow:auto"><table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead><tr><th align="left">Porta</th><th align="left">Rótulo</th>${ehSw ? '<th align="left">LED</th>' : ''}<th align="left">Cabo</th></tr></thead><tbody>${linhas}</tbody></table></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="font-size:12.5px">Cabear porta</span><select id="obj-rede-cn-de">${optDe}</select><span style="font-size:12.5px">a</span><select id="obj-rede-cn-para">${outros.map((o) => `<option value="${o.id}">${esc(o.nome || o.tipo)}</option>`).join('')}</select><select id="obj-rede-cn-pp"></select><select id="obj-rede-cn-tipo">${optCabo}</select><button type="button" class="btn btn-sm" id="obj-rede-cn-btn">Conectar</button></div>
      </fieldset>` : ''}
      <label class="map-panel-field"><span>Preenchimento</span><input type="color" id="obj-cor" value="${obj.cor || (ehSw ? '#363c44' : '#1f2225')}"></label>
      <label class="map-panel-field" title="Cor do contorno no mapa 2D"><span>Contorno</span><input type="color" id="obj-cor-contorno" value="${obj.corContorno || obj.cor || '#363c44'}"></label>
    `;
    })() : '';
    // [69ª rodada] Texto 3D: campos do gerador de texto (mesmos do Modelador) no lugar de Largura/Profundidade/Altura (que seguem o texto).
    const isTexto3d = obj.tipo === 'texto3d' && !obj.customMesh && !!window.Texto3D && !!window.ModelerMesh;
    const texto3dFields = isTexto3d ? `${window.Texto3D.fieldsHtml(obj)}
      <label class="map-panel-field"><span>Preenchimento</span><input type="color" id="obj-cor" value="${obj.cor || '#e6e9ee'}"></label>
      <label class="map-panel-field" title="Cor do contorno no mapa 2D"><span>Contorno</span><input type="color" id="obj-cor-contorno" value="${obj.corContorno || '#222222'}"></label>` : '';
    const formaFields = isTexto3d ? texto3dFields : isRede ? redeFieldsHtml : isRack ? rackFieldsHtml : isRetangulo ? `
      <!-- [01/10/2026] NOVO — "Na seção 'FORMA', deve haver, também, os caracteres (com titles correspondentes) que indicam a direção e o sentido em que cada campo (Largura,Profundidade e Altura) atua." --><label class="map-panel-field"><span>Largura (m) <span class="map-panel-axis-arrow" title="Largura: atua ao longo do eixo X — direção horizontal, aumentando para a direita no mapa 2D">→</span></span><input type="number" step="0.05" min="0.05" id="obj-largura" value="${(obj.largura ?? 0.5).toFixed(2)}"></label>
      <label class="map-panel-field"><span>Profundidade (m) <span class="map-panel-axis-arrow" title="Profundidade: atua ao longo do eixo Z — direção vertical na tela do mapa 2D, aumentando para baixo">↓</span></span><input type="number" step="0.05" min="0.05" id="obj-profundidade" value="${(obj.profundidade ?? 0.5).toFixed(2)}"></label>
      <label class="map-panel-field"><span>Altura (m) <span class="map-panel-axis-arrow" title="Altura: atua ao longo do eixo Y — a seta aponta para você, para fora da tela (no mapa 2D, visto de cima, a altura vem na sua direção); só aparece no Ver em 3D">⊙</span></span><input type="number" step="0.05" min="0.05" id="obj-altura" value="${(isEscada ? (obj.altura || obj.alturaEscada || 2.0) : (obj.altura ?? 0.5)).toFixed(2)}"></label>
      ${escadaDegrausField}
      ${acabamentoField}
      ${telhaField}
      ${pisoEditField}
      <label class="map-panel-field"><span>Preenchimento</span><input type="color" id="obj-cor" value="${obj.cor || '#8a92a3'}"></label>
      <label class="map-panel-field" title="Cor do contorno — independente do preenchimento (ver também a janela 🎨 Cores, na barra de cima)"><span>Contorno</span><input type="color" id="obj-cor-contorno" value="${obj.corContorno || obj.cor || '#8a92a3'}"></label>
    ` : isPoligono ? `
      <label class="map-panel-field"><span>Raio (m)</span><input type="number" step="0.05" min="0.05" id="obj-raio" value="${(obj.largura != null ? (obj.largura + (obj.profundidade ?? obj.largura)) / 4 : (obj.raio ?? 0.3)).toFixed(2)}" title="Formas desenhadas pela ferramenta Formas podem ter largura/profundidade diferentes (elípticas) — editar aqui volta a deixar simétrico (círculo/polígono regular)."></label>
      <label class="map-panel-field"><span>Lados</span><input type="number" step="1" min="3" max="64" id="obj-lados" value="${Math.max(3, Math.round(obj.lados || 24))}"></label>
      <label class="map-panel-field"><span>Altura (m) <span class="map-panel-axis-arrow" title="Altura: atua ao longo do eixo Y — a seta aponta para você, para fora da tela (no mapa 2D, visto de cima, a altura vem na sua direção); só aparece no Ver em 3D">⊙</span></span><input type="number" step="0.05" min="0.05" id="obj-altura" value="${(obj.altura ?? 0.5).toFixed(2)}"></label>
      <label class="map-panel-field"><span>Preenchimento</span><input type="color" id="obj-cor" value="${obj.cor || '#8a92a3'}"></label>
      <label class="map-panel-field" title="Cor do contorno — independente do preenchimento (ver também a janela 🎨 Cores, na barra de cima)"><span>Contorno</span><input type="color" id="obj-cor-contorno" value="${obj.corContorno || obj.cor || '#8a92a3'}"></label>
    ` : isImagem ? `
      <label class="map-panel-field" title="Distância vertical entre o chão daquele andar/piso e a base da imagem — 0 = deitada no chão (comportamento de sempre). Só tem efeito no 3D (o 2D é vista de cima, sem eixo vertical) — mesmo campo obj.elevacao já usado por outros objetos (ex.: luminária de teto), ver engine3d.js/mapping.js objectTopHeight."><span>Altura em relação ao chão (m)</span><input type="number" step="0.05" min="0" id="obj-elevacao" value="${(obj.elevacao || 0).toFixed(2)}"></label>
    ` : '';
    // [21/09/2026] "Ver em 3D": campo Posição Y (altura) junto de X/Z — pedido verbatim: "deve aparecer o campo Y (para definir a
    // altura). Atualmente, só aparece os campos Z e X. O andar fica como offset." Y = obj.elevacao (metros acima do chão do
    // andar); a altura no mundo é (andar × altura do piso) + Y. Imagem e rack de parede já trazem o próprio campo de elevação.
    const temElevacaoPropria = isImagem || /id="obj-rack-elev"/.test(formaFields || '');
    const _aPiso = (ctx._map && ctx._map.alturaPiso) || 2.8, _y0e = window.Mapping ? window.Mapping.y0Efetivo(obj) : 0;
    const _yLocal = (obj.elevacao || 0) + _y0e, _yGlobal = (obj.piso || 0) * _aPiso + _yLocal;
    // [01/10/2026] MUDADO — "o caractere que indica a direção e sentido do eixo Y não deve ser o '↑', mas deve ser algum caractere que indique que a 'flecha' está apontando para a tela. Redefina o title de forma equivalente também." (vale também pra Altura, na seção Forma). Causa raiz: o '↑' sugeria "para cima na tela" — mas o Y é o eixo que aponta PARA O OBSERVADOR (o mapa 2D é visto de cima: X→ direita, Z↓ baixo, Y saindo da tela). Agora '⊙' (ponto num círculo = seta apontando pra quem olha), com title equivalente.
    // [91ª] TODO objeto mostra Y global e Y local (2D e 3D). Imagem/Rack de parede já têm o próprio campo de elevação (= Y local): mostram só o Y global ao lado.
    const _lblY = '<span class="map-panel-axis-arrow" title="Sentido em que o eixo Y aumenta seus valores: apontando para você, para fora da tela (no mapa 2D, visto de cima, o Y é a altura)">⊙</span>';
    const _fYG = `<label class="map-panel-field" title="Altura da base do objeto no MUNDO (referência 0 = chão do andar 0). Y global = andar × altura do andar + Y local. Aceita valores negativos."><span>Y global (m) ${_lblY} <small style="opacity:.7">(mundo)</small></span><input type="number" step="0.05" id="obj-pos-y" value="${_yGlobal.toFixed(2)}"></label>`;
    const _fYL = `<label class="map-panel-field" title="Altura da base do objeto RELATIVA ao chão do andar dele (Y global − andar × altura do andar). Aceita valores negativos."><span>Y local (m) ${_lblY} <small style="opacity:.7">(no andar)</small></span><input type="number" step="0.05" id="obj-pos-yl" value="${_yLocal.toFixed(2)}"></label>`;
    const campoYHtml = temElevacaoPropria ? _fYG : (_fYG + _fYL);
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
    // NOVO (29/09/2026) — pedido verbatim: "estender o sistema de
    // propriedades para incluir o gerenciamento e a exibição de metadados
    // técnicos avançados/especificações de hardware nos objetos (ex: em um
    // gabinete, informar modelo de processador, quantidade de memória RAM,
    // discos rígidos/HDs, número de patrimônio, etc.)... Na janela de
    // propriedades existente do objeto selecionado, adicione um botão
    // dedicado ou uma aba chamada 'Especificações / Hardware'... É como a
    // descrição (já existe o nome do objeto, agora, deve haver, também um
    // campo para descrição do objeto)... Modo Navegação: só leitura; Modo
    // Edição: adicionar/editar/remover." ESTRUTURA DE DADOS: `obj.descricao`
    // (string livre) + `obj.especificacoes` (array de `{id, label, value}`,
    // NUNCA um Map/objeto do Three.js — puro JSON, salvo junto do resto do
    // objeto no mapa via `Mapping.updateObject`/`DB.saveMap`, os mesmos
    // mecanismos de sempre; o vínculo com a malha 3D/elemento 2D continua
    // sendo `obj.id` (== `userData.entityId`/`pick.id`, já usado por TUDO
    // neste app — nenhum campo NOVO de vínculo era necessário). Painel
    // colapsável PRÓPRIO (mesmo padrão visual/mecânico do '▾' do cabeçalho
    // deste painel, ver `#obj-panel-toggle`/`ctx._objPanelCollapsed` acima —
    // aqui com estado independente, `ctx._objEspecCollapsed`, default
    // FECHADO pra não poluir a janela por padrão) em vez de vários campos
    // soltos — o "botão dedicado" pedido.
    //
    // SOMENTE LEITURA em "🧭 Modo Navegação": no mapa 2D esse é
    // `ctx._navMode` (MapView); dentro do "Ver em 3D" (`modoVer3D`) o
    // equivalente é `!ctx._modelarObjetosHabilitado` (ver
    // `_syncModelarToggleUI3D`/comentário grande em view3d.js — desligado
    // por padrão = Modo Navegação, igual ao 2D). `especReadOnly` decide isso
    // uma vez só, aqui embaixo os campos só ficam com `disabled`/escondem os
    // botões de adicionar/remover conforme o valor — a leitura em si (ver
    // os valores) nunca é bloqueada em NENHUM modo.
    const especReadOnly = modoVer3D ? !ctx._modelarObjetosHabilitado : !!ctx._navMode;
    const especItens = Array.isArray(obj.especificacoes) ? obj.especificacoes : [];
    // [30/09/2026] `data-specid` (o `it.id` estável) em vez de `data-idx` —
    // ver comentário grande de `_criarEspecRowHtml`/wiring mais abaixo:
    // desde esta rodada, adicionar/remover uma linha NÃO reabre mais o
    // painel inteiro (só insere/remove o `<div>` daquela linha específica no
    // DOM) — um índice posicional ficaria errado assim que qualquer linha no
    // MEIO da lista fosse removida; o `id` de cada item nunca muda.
    const _criarEspecRowHtml = (it) => `
      <div class="obj-espec-row" data-specid="${it.id}" style="display:flex; gap:6px; align-items:center; margin-top:4px">
        <input type="text" class="obj-espec-label" data-specid="${it.id}" value="${Utils.escapeHtml(it.label || '')}" placeholder="ex: Processador" style="flex:1" ${especReadOnly ? 'disabled' : ''}>
        <input type="text" class="obj-espec-value" data-specid="${it.id}" value="${Utils.escapeHtml(it.value || '')}" placeholder="ex: Intel i5-10400" style="flex:1" ${especReadOnly ? 'disabled' : ''}>
        ${especReadOnly ? '' : `<button type="button" class="icon-btn sm obj-espec-remover" data-specid="${it.id}" title="Remover esta especificação">🗑️</button>`}
      </div>`;
    const especRowsHtml = especItens.map(_criarEspecRowHtml).join('');
    const especVazioHtml = `<div id="obj-espec-vazio" style="font-size:12.5px; color:var(--text-dim)">${especReadOnly ? 'Nenhuma especificação cadastrada.' : 'Nenhuma ainda — use "+ Adicionar" abaixo.'}</div>`;
    // [30/09/2026] ALTERADO — pedido verbatim (rodada anterior): "coloque o
    // campo 'Patrimônio(s) associado(s)' logo acima dos 'Scripts'." Só a
    // POSIÇÃO mudou (antes ficava lá em cima, perto de "Forma") — o visual
    // tentou virar um cabeçalho colapsável igual "📋 Especificações", mas o
    // pedido seguinte foi explícito: "Deixe o visual anterior do campo
    // patrimônio." Revertido pro campo simples de sempre (sempre expandido,
    // sem cabeçalho clicável nem estado de colapso) — só reposicionado.
    const patrimonioFieldsetHtml = `
      <div class="map-panel-field">
        <span>🔗 Patrimônio(s) associado(s)</span>
        <div class="obj-item-list">${itemRows || '<div style="font-size:12.5px; color:var(--text-dim)">Nenhum</div>'}</div>
        <button type="button" class="btn secondary sm" id="obj-item-associar" style="margin-top:6px">🔗 ${itemEntries.length ? 'Associar outro' : 'Associar'}</button>
      </div>`;
    // [01/10/2026] MUDADO (32ª rodada) — pedido verbatim: "Na janela de propriedades do objeto, coloque o campo de patrimônio logo acima do campo de especificações." Só a ORDEM mudou: o bloco de patrimônio(s) agora vem logo antes de "Especificações / Hardware" (antes ficava acima de Scripts/Trajeto).
    const especFieldsetHtml = `
      <div class="map-panel-field">
        <span style="display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer" id="obj-espec-header">
          <span id="obj-espec-titulo">📋 Especificações / Hardware${especItens.length ? ` (${especItens.length})` : ''}</span>
          <button type="button" class="icon-btn sm" id="obj-espec-toggle" title="${ctx._objEspecCollapsed === false ? 'Ocultar' : 'Mostrar'}">${ctx._objEspecCollapsed === false ? '▾' : '▸'}</button>
        </span>
        <div id="obj-espec-body" style="${ctx._objEspecCollapsed === false ? '' : 'display:none'}; margin-top:6px">
          <label style="display:block; font-size:12.5px; color:var(--text-dim); margin-bottom:2px">Descrição</label>
          <textarea id="obj-espec-descricao" rows="2" placeholder="Descrição livre deste objeto/equipamento..." style="width:100%; resize:vertical" ${especReadOnly ? 'disabled' : ''}>${Utils.escapeHtml(obj.descricao || '')}</textarea>
          <label style="display:block; font-size:12.5px; color:var(--text-dim); margin:8px 0 2px">Itens (ex: Processador, RAM, HD, Nº de patrimônio...)</label>
          <div id="obj-espec-lista">${especRowsHtml || especVazioHtml}</div>
          ${especReadOnly ? '' : '<button type="button" class="btn secondary sm" id="obj-espec-adicionar" style="margin-top:6px">+ Adicionar especificação</button>'}
        </div>
      </div>`;
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
           (ver 'Mapping.parseClassesInput'). Usado pelo painel '🎬
           Scripts' (mapview.js/view3d.js, via seletor '.classe') pra
           ocultar/destacar todo objeto de uma mesma classe de uma vez. -->
      <label class="map-panel-field"><span>🏷️ Classes</span><input type="text" id="obj-classes" value="${Utils.escapeHtml((Mapping.getObjectClasses(obj) || []).join(', '))}" placeholder="ex: sala-reuniao, mobiliario" title="Uma ou mais 'classes' (separadas por vírgula ou espaço) — igual ao atributo 'class' do HTML. Use o painel '🎬 Scripts' (seletor '.classe') pra ocultar/destacar todos os objetos de uma mesma classe de uma vez."></label>
      ${grupoFieldHtml}
      <!-- [19/09/2026 UTC] CORRIGIDO (RODADA 194) -- pedido verbatim: "Implemente as setas na janela de
           propriedades para todos os objetos que há no catálogo [...] é uma janela padrão que carrega
           valores dos objetos." Este É o painel padrão (Mapa->Planta baixa->Ferramentas->Objetos, também
           usado por qualquer objeto do catálogo colocado no mapa) -- a RODADA 193 tinha implementado as
           setas só em porta/janela/câmera/texto/trajeto (ver mapview.js) e uma varredura por grep na época
           não achou campos "obj-x"/"obj-y" em mapview.js porque o HTML deste painel foi extraído pra este
           arquivo (js/cards/object-panel-card.js) numa refatoração anterior -- não fazia parte daquela
           varredura. Mesmo padrão visual/rótulo ("→" pro X, "↓" pro Z, mesmo quando o campo/propriedade se
           chama "y" internamente, igual porta-y/janela-y/cam-y/txt-y) das outras janelas.-->
      <div class="map-panel-group-title" style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--accent,#4f8cff);border-bottom:1px solid var(--border,#3a4250);padding:6px 0 2px;margin-top:4px">Posição</div>
      <label class="map-panel-field"><span>Posição X (m) <span class="map-panel-axis-arrow" title="Sentido em que este eixo aumenta seus valores (para a direita no mapa 2D)">→</span></span><input type="number" step="0.1" id="obj-x" value="${obj.x.toFixed(2)}"></label>
      <label class="map-panel-field"><span>Posição Z (m) <span class="map-panel-axis-arrow" title="Sentido em que este eixo aumenta seus valores (para baixo no mapa 2D)">↓</span></span><input type="number" step="0.1" id="obj-y" value="${obj.y.toFixed(2)}"></label>
      ${campoYHtml}
      <!-- [01/10/2026] MUDADO — "O ' (offset)' deve ser retirado, pois parece que pode aceitar outros valores, senão inteiros para este campo." O offset em metros agora vive no campo 'Posição Y'. --><label class="map-panel-field"><span title="Número inteiro do andar (0 = térreo, 1 = primeiro andar, -1 = subsolo...). Cada andar soma a altura do andar ao Y local do objeto (Y global = andar × altura do andar + Y local).">Andar / piso</span><input type="number" step="1" id="obj-piso" value="${obj.piso || 0}"></label>
      <div class="map-panel-group-title" style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--accent,#4f8cff);border-bottom:1px solid var(--border,#3a4250);padding:6px 0 2px;margin-top:4px">Rotação</div>
      <!-- [01/10/2026] NOVO — "Na seção 'Rotação', deve haver um title explicando que a rotação ali é em Y no mapa 2D." --><label class="map-panel-field" title="Rotação em torno do eixo Y (o eixo vertical). No mapa 2D, que é visto de cima, girar o objeto é sempre girar em Y."><span title="Rotação em torno do eixo Y (vertical) — é a rotação do mapa 2D, visto de cima">Rotação (°) <span class="map-panel-axis-arrow" title="Rotação em torno do eixo Y (vertical) — é a rotação do mapa 2D, visto de cima">⟳Y</span></span><input type="number" step="1" id="obj-angulo" value="${grausAngulo}"></label>
      ${/id="obj-(largura|altura|profundidade|raio)"/.test(formaFields || '') ? `<div class="map-panel-group-title" style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--accent,#4f8cff);border-bottom:1px solid var(--border,#3a4250);padding:6px 0 2px;margin-top:4px">Forma</div>` : ''}
      ${formaFields}
      <label class="map-panel-field" title="Pedido do usuário (28/08/2026, Modelador 3D): objeto marcado aqui pode servir de 'chão' para navegação entre andares vista de cima. NOTA: este campo hoje só é PERSISTIDO/EXPOSTO — a movimentação em 1ª pessoa de verdade que subiria em cima dele (e trocaria de andar) ainda não existe neste app (só câmera orbital/andar no chão fixo do piso atual), ver changelog."><span>🧱 Colisão (serve de chão visto de cima)</span><input type="checkbox" id="obj-colisao-topo" ${obj.colisaoTopo !== false ? 'checked' : ''}></label>
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
      ${obj.tipo === 'folha-papel' ? `<div class="map-panel-field">
        <span>📄 Folha de papel</span>
        <button type="button" class="btn sm" id="obj-papel-editor" style="margin-top:6px; width:100%" title="Abre o editor da folha (o mesmo do HTML enviado): cor da folha, cor do texto, fonte e texto, com a folha 3D mudando na hora">✏️ Editar folha</button>
        <textarea id="obj-papel-texto" rows="5" style="width:100%; margin-top:6px" placeholder="Escreva a anotação...">${Utils.escapeHtml(obj.texto != null ? obj.texto : '')}</textarea>
        <label style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:12.5px">
          <span style="flex:0 0 90px">Fonte</span>
          <select id="obj-papel-fonte" style="flex:1">
            <option value="'Caveat', 'Segoe Print', cursive" ${(!obj.papelFonte || obj.papelFonte.indexOf('Caveat') >= 0) ? 'selected' : ''}>Manuscrita</option>
            <option value="'Inter', Arial, sans-serif" ${(obj.papelFonte || '').indexOf('Inter') >= 0 ? 'selected' : ''}>Moderna</option>
            <option value="'Roboto Mono', monospace" ${(obj.papelFonte || '').indexOf('Mono') >= 0 ? 'selected' : ''}>Máquina</option>
          </select>
        </label>
        <label style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:12.5px">
          <span style="flex:0 0 90px">Cor do texto</span>
          <input type="color" id="obj-papel-cortexto" value="${obj.papelCorTexto || '#1e293b'}">
        </label>
        <label style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:12.5px" title="Tamanho da letra impressa na folha (px da textura; a linha da pauta acompanha)">
          <span style="flex:0 0 90px">Tam. da fonte</span>
          <input type="range" id="obj-papel-fonte-tam" min="12" max="60" step="1" value="${obj.papelFonteTam || 30}" style="flex:1">
          <span id="obj-papel-fonte-tam-val" style="flex:0 0 28px; text-align:right">${obj.papelFonteTam || 30}</span>
        </label>
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:6px"><input type="checkbox" id="obj-papel-linhas" ${obj.papelLinhas !== false ? 'checked' : ''}> Imprimir linhas horizontais (pauta)</label>
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:6px"><input type="checkbox" id="obj-papel-margem" ${obj.papelMargem !== false ? 'checked' : ''}> Imprimir linha vertical (margem)</label>
        <div style="font-size:11.5px; opacity:.75; margin-top:4px">A cor da folha é o campo Cor acima.</div>
      </div>` : ''}
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
      ${patrimonioFieldsetHtml}
      ${especFieldsetHtml}
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
        <!-- [30/09/2026] REMOVIDO (18ª rodada) — pedido verbatim: "No mapa 2D, na janela de propriedades há um botão 'Modelar em 3D'. Remova-o." O botão #obj-modelar saiu do HTML; o handler mais abaixo (wire) ficou intacto e inofensivo (querySelector retorna null, protegido por if). O Modelador continua acessível pelo cartão de opções do objeto no Ver em 3D (Modo Edição). -->
        <!-- [19/09/2026 UTC] REMOVIDO (RODADA 171) -- pedido verbatim do usuário: "No mapa 2D, na
             janela de propriedades dos objetos, remova o botão 'Trocar tipo/forma'." O botão
             #obj-tipo-trocar e todo o fluxo de _pickObjectType/substituição de tipo foram
             mantidos intactos no restante do arquivo (função "wire" mais abaixo) só que agora
             inofensivos: o querySelector('#obj-tipo-trocar') sempre retorna null (elemento não
             existe mais no HTML) e o if (_btnObjTipoTrocar) que envolve o .onclick já existente
             evita qualquer erro -- nada mais precisou mudar. -->
        `}
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
      // [30/09/2026] NOVO -- pedido verbatim: o selo de "Especificações" no 3D
      // (losango) também deve indicar o TEMPO decorrido por cor (igual ao
      // pontinho de Histórico), então carimba `especModificadoEm` sempre que
      // o patch mexe em `especificacoes` OU `descricao` -- ver
      // ObjectStandard.corIndicadorEspec (objectstandard.js).
      if (patch && (Object.prototype.hasOwnProperty.call(patch, 'especificacoes') || Object.prototype.hasOwnProperty.call(patch, 'descricao'))) {
        patch = { ...patch, especModificadoEm: Date.now() };
      }
      if (emReedit()) ctx._applyFormaDraftFieldPatch(patch);
      else {
        // [65ª rodada] Objeto com MALHA PRÓPRIA (Modelador): Largura/Profundidade/Altura daqui = Dimensões X/Z/Y do Modelador/Transformação,
        // ou seja, escala = dimensão desejada / dimensão da malha. Sem isto o 3D ignorava a forma (a malha só segue customMeshXform).
        if (patch && obj.customMesh && Array.isArray(obj.customMesh.vertices) && window.ModelerMesh && ('largura' in patch || 'profundidade' in patch || 'altura' in patch)) {
          try {
            const bb = window.ModelerMesh.localBBox(obj.customMesh.vertices);
            const base = { scaleX: Math.max(1e-4, bb.maxX - bb.minX), scaleY: Math.max(1e-4, bb.maxY - bb.minY), scaleZ: Math.max(1e-4, bb.maxZ - bb.minZ) };
            const xf = { ...(obj.customMeshXform || {}) };
            if ('largura' in patch) xf.scaleX = Math.max(0.01, patch.largura) / base.scaleX;
            if ('altura' in patch) xf.scaleY = Math.max(0.01, patch.altura) / base.scaleY;
            if ('profundidade' in patch) xf.scaleZ = Math.max(0.01, patch.profundidade) / base.scaleZ;
            patch = { ...patch, customMeshXform: xf };
          } catch (_) { /* segue sem escala */ }
        }
        // [74ª rodada] Piso editável: Largura/Profundidade do painel esticam o contorno e os furos proporcionalmente (a caixa do contorno passa a ter a medida pedida).
        // `pisoPoligono: null` (voltar a retângulo) remove o contorno (updateObject ignora null? — tratado abaixo).
        if (patch && window.PisoCustom && window.PisoCustom.tem(obj) && !('pisoPoligono' in patch) && ('largura' in patch || 'profundidade' in patch)) {
          const cur = (ctx._map.objects || []).find((o) => o.id === obj.id) || obj, pp = JSON.parse(JSON.stringify(cur.pisoPoligono)), bb = window.PisoCustom.bbox(cur);
          const kx = 'largura' in patch ? Math.max(0.05, patch.largura) / Math.max(1e-6, bb.x1 - bb.x0) : 1, ky = 'profundidade' in patch ? Math.max(0.05, patch.profundidade) / Math.max(1e-6, bb.y1 - bb.y0) : 1;
          const esc = (p) => { p[0] *= kx; p[1] *= ky; }; pp.contorno.forEach(esc); pp.furos.forEach((f) => f.forEach(esc));
          patch = { ...patch, pisoPoligono: pp };
        }
        const alvo = Mapping.updateObject(ctx._map, obj.id, patch);
        ctx._saveMap();
        // [46ª rodada] espelha no widget "Transformação" da barra lateral (se aberto) -- campos equivalentes
        if (ctx._objTransformUI?.id === obj.id) { try { ctx._objTransformUI.sync(); } catch (_) {} }
        // [18/09/2026 UTC] RODADA 165 -- no "Ver em 3D" (ctx = View3D, tem `_engine`) o
        // painel so gravava no mapa: a malha 3D so refletia ao sair/entrar do 3D
        // (ex.: "Desmontar tudo" do Rack). Agora reconstroi SO este objeto na hora.
        let _rb;
        if (alvo && ctx._engine && typeof ctx._engine.rebuildObjectIncremental === 'function') {
          try { _rb = ctx._engine.rebuildObjectIncremental(alvo); } catch (err) { _rb = 'erro'; console.warn('[ObjectPanel] rebuild 3D ao vivo falhou (dado ja salvo):', err); }
        }
        // [64ª rodada] diagnóstico para o gravador de passos (só quando ele está gravando): o que o painel fez no 3D ao mudar este campo
        if (window.StepRecorder && window.StepRecorder.ativo && window.StepRecorder.ativo() && patch && ('largura' in patch || 'profundidade' in patch || 'altura' in patch || 'raio' in patch)) {
          try {
            const eng = ctx._engine; let malhas = null, caixa = null;
            if (eng && eng._group && eng.THREE && alvo) {
              const B = new eng.THREE.Box3(); let n = 0;
              eng._group.children.forEach((ch) => { let ok = false; ch.traverse((m) => { if (m.userData && m.userData.pick && m.userData.pick.ref === alvo) ok = true; }); if (ok) { n++; ch.updateMatrixWorld(true); B.expandByObject(ch); } });
              const sz = B.getSize(new eng.THREE.Vector3()); malhas = n; caixa = n ? [+sz.x.toFixed(3), +sz.y.toFixed(3), +sz.z.toFixed(3)] : null;
            }
            window.StepRecorder.diag('painel-3d', { objTipo: alvo && alvo.tipo, forma: alvo && alvo.forma, patch, dados: alvo ? [alvo.largura, alvo.profundidade, alvo.altura, alvo.raio] : null, temAlvo: !!alvo, temMotor: !!eng, motorPronto: !!(eng && eng._ready), rebuild: _rb === undefined ? 'nao-chamado' : _rb, noMapaDoMotor: !!(eng && eng.mapData && alvo && ['objects'].some((k) => (eng.mapData[k] || []).includes(alvo))), malhas, caixaMalha: caixa, customMesh: !!(alvo && alvo.customMesh), escala: alvo && alvo.customMeshXform ? alvo.customMeshXform : null });
          } catch (e) { /* ignora */ }
        }
      }
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
    // [27/09/2026] NOVO — ver comentário grande de `Mapping.ensureUniqueName`:
    // garante nome único em TODA a cena ao sair do campo (não a cada tecla —
    // corrigir "no meio" da digitação, tipo virar ".001" antes do usuário
    // terminar de escrever, seria uma experiência ruim). Corrige o valor
    // exibido no campo também, pra não ficar mostrando um nome que na
    // prática já foi trocado por outro (por colisão) por baixo dos panos.
    panel.querySelector('#obj-nome').onchange = (e) => {
      const corrigido = Mapping.ensureUniqueName(ctx._map, e.target.value, obj);
      if (corrigido !== e.target.value) { e.target.value = corrigido; }
      salvarCampo({ nome: corrigido });
    };
    panel.querySelector('#obj-classes').oninput = (e) => salvarCampo({ classes: Mapping.parseClassesInput(e.target.value) });
    // NOVO (29/09/2026) — wiring da seção "📋 Especificações / Hardware"
    // (HTML montado em `especFieldsetHtml`, acima — ver o comentário grande
    // lá para o pedido/estrutura de dados completos). O botão "▸/▾" só
    // alterna `ctx._objEspecCollapsed` (mesmo espírito do "▾" do cabeçalho
    // do painel inteiro, `#obj-panel-toggle`) — NÃO precisa reabrir o
    // painel, só mostrar/esconder `#obj-espec-body` e trocar o ícone.
    // `especReadOnly` (calculado acima) já deixou os campos `disabled` e
    // escondeu os botões de adicionar/remover no HTML — os handlers abaixo
    // não recisam checar de novo (campos desabilitados não disparam
    // `oninput`/`onclick` nenhum; os botões nem existem no DOM quando
    // somente leitura).
    const especHeader = panel.querySelector('#obj-espec-header');
    const especToggleBtn = panel.querySelector('#obj-espec-toggle');
    const especBody = panel.querySelector('#obj-espec-body');
    const toggleEspec = () => {
      ctx._objEspecCollapsed = ctx._objEspecCollapsed === false ? true : false;
      const aberto = ctx._objEspecCollapsed === false;
      especBody.style.display = aberto ? '' : 'none';
      especToggleBtn.textContent = aberto ? '▾' : '▸';
      especToggleBtn.title = aberto ? 'Ocultar' : 'Mostrar';
    };
    especHeader.onclick = (e) => { if (e.target === especToggleBtn) return; toggleEspec(); };
    especToggleBtn.onclick = (e) => { e.stopPropagation(); toggleEspec(); };
    // [30/09/2026] REVERTIDO — pedido verbatim: "Deixe o visual anterior do
    // campo patrimônio." O campo voltou a ser simples/sempre expandido (ver
    // `patrimonioFieldsetHtml`), então não há mais cabeçalho/toggle pra
    // ligar aqui.
    panel.querySelector('#obj-espec-descricao')?.addEventListener('input', (e) => salvarCampo({ descricao: e.target.value }));
    // BUG CORRIGIDO (29/09/2026) — ver histórico completo da causa raiz no
    // changelog: os handlers liam uma CÓPIA congelada da lista (`especItens`,
    // capturada só na montagem do painel) — editar um campo sem reabrir o
    // painel (de propósito, pra não perder o foco) gravava certo no objeto,
    // mas "+ Adicionar"/🗑️ partiam da cópia desatualizada e sobrescreviam a
    // edição recente. Corrigido usando `especAtuais()` (lê `obj.especificacoes`
    // ao vivo) em vez da cópia.
    // [30/09/2026] REFEITO — pedido verbatim: "No caso da janela de
    // propriedades, só o campo que está sendo alterado é que deve mudar,
    // todo o restante da janela deve permanecer estático." Antes, "+
    // Adicionar"/🗑️ chamavam `ctx._openObjectPanel(...)` de novo pra
    // atualizar a CONTAGEM de itens/mostrar a linha nova — reconstruindo a
    // janela INTEIRA (perdendo o scroll, fechando outras seções abertas,
    // etc., além de ter sido a causa do bug "this._rewireDragResize is not
    // a function" relatado, já corrigido à parte). Agora as duas ações só
    // inserem/removem o `<div class="obj-espec-row">` daquela linha
    // específica no DOM (`#obj-espec-lista`) e atualizam o contador do
    // título (`#obj-espec-titulo`) — o resto do painel nunca é tocado.
    // `data-specid` (o `it.id` estável, nunca um índice — ver
    // `_criarEspecRowHtml` acima) identifica cada linha mesmo depois de
    // outras serem inseridas/removidas no meio da lista.
    const especAtuais = () => (Array.isArray(obj.especificacoes) ? obj.especificacoes : []);
    const especLista = panel.querySelector('#obj-espec-lista');
    const especTitulo = panel.querySelector('#obj-espec-titulo');
    const atualizarEspecTitulo = () => {
      const n = especAtuais().length;
      especTitulo.textContent = `📋 Especificações / Hardware${n ? ` (${n})` : ''}`;
    };
    // [01/10/2026] NOVO (32ª rodada) — pedido verbatim: "Na janela de propriedades do objeto, ao colocar uma especificação e pressionar enter, deve dar autofocus no próximo campo de especificação vazio." Enter (rótulo ou valor) foca o PRÓXIMO campo vazio (rótulo/valor) depois deste, em ordem de tela; se não houver nenhum depois, volta aos vazios anteriores; se não houver NENHUM vazio e este campo tem texto, cria uma linha nova (igual ao botão "+ Adicionar especificação") e foca o rótulo dela.
    const irParaProximoEspecVazio = (inp) => {
      const campos = [...especLista.querySelectorAll('.obj-espec-label, .obj-espec-value')];
      const i = campos.indexOf(inp);
      const vazio = (c) => !String(c.value || '').trim() && !c.disabled;
      const prox = campos.slice(i + 1).find(vazio) || campos.slice(0, i).find(vazio);
      if (prox) { prox.focus(); return; }
      if (String(inp.value || '').trim()) adicionarEspecLinha();
    };
    const wireEspecRow = (rowEl) => {
      const specid = rowEl.dataset.specid;
      [rowEl.querySelector('.obj-espec-label'), rowEl.querySelector('.obj-espec-value')].forEach((inp) => {
        if (inp) inp.addEventListener('keydown', (e) => { if (e.key !== 'Enter' || e.isComposing) return; e.preventDefault(); irParaProximoEspecVazio(inp); });
      });
      rowEl.querySelector('.obj-espec-label').oninput = (e) => {
        const lista = especAtuais().map((it) => (it.id === specid ? { ...it, label: e.target.value } : it));
        salvarCampo({ especificacoes: lista });
      };
      rowEl.querySelector('.obj-espec-value').oninput = (e) => {
        const lista = especAtuais().map((it) => (it.id === specid ? { ...it, value: e.target.value } : it));
        salvarCampo({ especificacoes: lista });
      };
      rowEl.querySelector('.obj-espec-remover')?.addEventListener('click', () => {
        const lista = especAtuais().filter((it) => it.id !== specid);
        salvarCampo({ especificacoes: lista });
        rowEl.remove();
        if (!lista.length) especLista.innerHTML = especVazioHtml;
        atualizarEspecTitulo();
        Utils.toast('🗑️ Especificação removida', { type: 'ok' });
      });
    };
    panel.querySelectorAll('.obj-espec-row').forEach(wireEspecRow);
    const adicionarEspecLinha = () => {
      const novoItem = { id: Utils.uid('espec'), label: '', value: '' };
      salvarCampo({ especificacoes: [...especAtuais(), novoItem] });
      panel.querySelector('#obj-espec-vazio')?.remove();
      especLista.insertAdjacentHTML('beforeend', _criarEspecRowHtml(novoItem));
      wireEspecRow(especLista.lastElementChild);
      atualizarEspecTitulo();
      especLista.lastElementChild.querySelector('.obj-espec-label')?.focus();
    };
    panel.querySelector('#obj-espec-adicionar')?.addEventListener('click', adicionarEspecLinha);
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
    // [01/10/2026] NOVO (37ª rodada) — campos da Folha de Papel (ver js/objecttypes/folha-papel.js). Cada mudança reconstrói a textura via salvarCampo.
    // [01/10/2026] NOVO (39ª rodada) — "Implemente o HTML do arquivo que te enviei e coloque como um botão nas propriedades do objeto 'Folha' para que se possa editá-lo daquele jeito."
    // Porta o modal "Escrever na Folha de Papel" do HTML (editor_2d_3d_com_folhas_de_anota_o_realistas.html): 5 cores de folha, 5 cores de texto, seletor de fonte e textarea
    // que mostra a folha (fundo/cor/fonte) e atualiza a folha no mapa/3D a cada alteração (via salvarCampo, que já reconstrói a malha do 3D).
    panel.querySelector('#obj-papel-editor')?.addEventListener('click', () => {
      if (document.getElementById('papel-editor-backdrop')) return;
      const CORES_FOLHA = [['Amarelo Post-it', '#fef08a', '#1e293b'], ['Branco', '#ffffff', '#0f172a'], ['Azul Claro', '#bae6fd', '#0369a1'], ['Verde Claro', '#bbf7d0', '#15803d'], ['Rosa', '#fbcfe8', '#be185d']];
      const CORES_TEXTO = ['#000000', '#1e3a8a', '#b91c1c', '#047857', '#6b21a8'];
      const FONTES = [["'Caveat', 'Segoe Print', cursive", 'Manuscrita'], ["'Inter', Arial, sans-serif", 'Moderna'], ["'Roboto Mono', monospace", 'Máquina']];
      const bd = document.createElement('div');
      bd.id = 'papel-editor-backdrop';
      bd.className = 'modal-backdrop';
      bd.style.zIndex = '99999';
      const sw = (c, cls, t) => `<button type="button" class="${cls}" data-c="${c}" title="${t || c}" style="width:28px; height:28px; border-radius:50%; border:1px solid #64748b; background:${c}; cursor:pointer"></button>`;
      bd.innerHTML = `<div class="modal-sheet" style="max-width:640px; width:94vw">
        <h3 style="margin-top:0">✏️ Escrever na Folha de Papel</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:10px">
          <div><div style="font-size:12px; opacity:.8; margin-bottom:4px">Cor da Folha</div><div style="display:flex; gap:6px; flex-wrap:wrap">${CORES_FOLHA.map((c) => sw(c[1], 'pe-cf', c[0])).join('')}</div><label style="display:inline-flex; align-items:center; gap:4px; margin-top:6px; font-size:11px; opacity:.85" title="Escolher qualquer cor para a folha">🎨 outra <input type="color" id="pe-cf-livre" value="${obj.cor || '#fef08a'}" style="width:26px; height:20px; padding:0; border:1px solid #64748b; background:none; cursor:pointer"></label></div>
          <div><div style="font-size:12px; opacity:.8; margin-bottom:4px">Cor do Texto</div><div style="display:flex; gap:6px; flex-wrap:wrap">${CORES_TEXTO.map((c) => sw(c, 'pe-ct')).join('')}</div><label style="display:inline-flex; align-items:center; gap:4px; margin-top:6px; font-size:11px; opacity:.85" title="Escolher qualquer cor para o texto">🎨 outra <input type="color" id="pe-ct-livre" value="${obj.papelCorTexto || '#1e293b'}" style="width:26px; height:20px; padding:0; border:1px solid #64748b; background:none; cursor:pointer"></label></div>
          <div><div style="font-size:12px; opacity:.8; margin-bottom:4px">Estilo da Fonte</div><select id="pe-fonte" style="width:100%">${FONTES.map((f) => `<option value="${f[0]}">${f[1]}</option>`).join('')}</select></div>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:4px">
          <span style="font-size:12px; opacity:.8">Conteúdo da Anotação</span>
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; opacity:.9" title="Tamanho da letra impressa na folha"><span>Tam. da fonte</span><input type="range" id="pe-tam" min="12" max="60" step="1" value="${obj.papelFonteTam || 30}" style="width:120px"><span id="pe-tam-val" style="min-width:24px; text-align:right">${obj.papelFonteTam || 30}</span></label>
        </div>
        <div id="pe-folha-scroll" style="max-height:min(40vh, 300px); min-height:180px; overflow-y:auto; overflow-x:hidden; border-radius:4px; background:rgba(0,0,0,.18); padding:6px 0"><textarea id="pe-texto" placeholder="Escreva sua anotação aqui..." spellcheck="false" style="display:block; margin:0 auto; box-sizing:border-box; border:1px solid rgba(0,0,0,.25); border-radius:3px; resize:none; overflow:hidden; outline:none; box-shadow:0 6px 22px rgba(0,0,0,.35)"></textarea></div>
        <div style="display:flex; gap:18px; flex-wrap:wrap; margin-top:8px; font-size:12.5px">
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="pe-linhas" ${obj.papelLinhas !== false ? 'checked' : ''}> Imprimir linhas horizontais (pauta)</label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="pe-margem" ${obj.papelMargem !== false ? 'checked' : ''}> Imprimir linha vertical (margem)</label>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; gap:10px">
          <span style="font-size:12px; opacity:.7">As alterações aparecem na folha na hora.</span>
          <button type="button" class="btn" id="pe-ok">Concluído</button>
        </div></div>`;
      document.body.appendChild(bd);
      const ta = bd.querySelector('#pe-texto'), sel = bd.querySelector('#pe-fonte');
      const estado = () => ({ cor: obj.cor || '#fef08a', txt: obj.papelCorTexto || '#1e293b', fonte: obj.papelFonte || FONTES[0][0] });
      // [54ª rodada] A caixa de texto agora É a folha: proporção A4 (512 x 724), pauta, linha de margem, fonte/tamanho e cores iguais ao desenho 3D (ver FolhaAtlas/desenharFolha).
      // Escala k = largura da folha na tela / 512 (espaço de desenho da textura). Linhas da pauta em y = (46 + lh) + n*lh; o texto "senta" nelas (linha de base).
      // a folha cresce com o texto (mínimo = A4); quem rola é o contêiner #pe-folha-scroll, não a caixa
      // [55ª] altura calculada pelo nº de linhas visuais (sem forçar reflow com scrollHeight a cada tecla)
      let real = obj.texto != null ? String(obj.texto) : '', lay = { display: real, softs: [] }, geo = { L: 30, pt: 0 };
      const ajustarAltura = () => { const h = parseInt(ta.dataset.hA4, 10) || 0; const n = lay.display.split('\n').length; const need = Math.ceil(geo.pt + (n + 1) * geo.L); ta.style.height = Math.max(h, need) + 'px'; };
      // [55ª] quebra de linha do painel = a do 3D (FolhaAtlas.layout): o textarea não quebra sozinho (white-space:pre) e mostra o texto já com as quebras automáticas
      const refazer = () => { const e = estado(); lay = window.FolhaAtlas ? window.FolhaAtlas.layout(real, e.fonte, obj.papelFonteTam) : { display: real, softs: [] }; };
      const rToD = (r) => { let k = 0; for (const q of lay.softs) { if (q - k < r) k++; else break; } return r + k; };   // índice real -> índice no display
      const dToR = (d, softs) => { let k = 0; for (const q of softs) { if (q < d) k++; else break; } return d - k; };    // índice no display -> índice real
      const mostrar = (caretReal) => { if (ta.value !== lay.display) ta.value = lay.display; if (caretReal != null) { const c = rToD(caretReal); ta.setSelectionRange(c, c); } ajustarAltura(); };
      // [55ª] salvar: 1 vez por quadro (rAF) em vez de 1 por tecla; ao fechar, grava o que faltar
      let pend = null, raf = 0;
      const gravar = () => { raf = 0; if (pend == null) return; const t = pend; pend = null; salvarCampo({ texto: t }); };
      const salvarTexto = (t) => { pend = t; const t2 = panel.querySelector('#obj-papel-texto'); if (t2 && t2.value !== t) t2.value = t; if (!raf) raf = requestAnimationFrame(gravar); };
      const descarregar = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } gravar(); };
      const pintar = () => {
        const e = estado();
        const W = Math.round(Math.max(260, Math.min(560, bd.clientWidth * 0.9 - 40)));   // grande (até 560 px de largura); se não couber na altura da janela, o modal rola na vertical
        const k = W / 512, tam = Math.max(8, Math.min(80, Number(obj.papelFonteTam) || 30)), lh = Math.round(tam * 34 / 30);
        const L = lh * k, f = tam * k, y0 = (46 + lh) * k;   // L = altura da linha; y0 = 1ª linha da pauta
        const pauta = obj.papelLinhas !== false, margem = obj.papelMargem !== false;
        ta.style.width = W + 'px'; ta.dataset.hA4 = String(Math.round(W * 724 / 512)); ta.style.height = ta.dataset.hA4 + 'px';
        ta.style.color = e.txt; ta.style.fontFamily = e.fonte; ta.style.fontSize = f + 'px'; ta.style.lineHeight = L + 'px';
        // 1ª linha de base em y0: baseline = padding-top + (L - f)/2 + ~0,8 f  =>  padding-top
        geo = { L, pt: Math.max(0, y0 - (L - f) / 2 - 0.8 * f) }; ta.style.whiteSpace = 'pre'; ta.setAttribute('wrap', 'off'); ta.style.padding = geo.pt + 'px ' + (30 * k) + 'px 0 ' + (60 * k) + 'px';
        const camadas = [], tamanhos = [], posicoes = [], repeticoes = [];
        // cobre o que está ACIMA da 1ª linha (a pauta do 3D só começa em y0) com a cor da folha
        camadas.push(`linear-gradient(${e.cor}, ${e.cor})`); tamanhos.push(`100% ${Math.max(0, y0 - 1)}px`); posicoes.push('0 0'); repeticoes.push('no-repeat');
        if (pauta) { camadas.push('linear-gradient(to bottom, transparent calc(100% - 1px), rgba(0,0,0,.09) 0)'); tamanhos.push(`100% ${L}px`); posicoes.push(`0 ${y0 - L}px`); repeticoes.push('repeat-y'); }
        if (margem) { camadas.push(`linear-gradient(to right, transparent ${50 * k}px, rgba(239,68,68,.3) ${50 * k}px, rgba(239,68,68,.3) ${50 * k + 1.2}px, transparent ${50 * k + 1.2}px)`); tamanhos.push('100% 100%'); posicoes.push('0 0'); repeticoes.push('no-repeat'); }
        ta.style.backgroundColor = e.cor;
        ta.style.backgroundImage = camadas.join(','); ta.style.backgroundSize = tamanhos.join(','); ta.style.backgroundPosition = posicoes.join(','); ta.style.backgroundRepeat = repeticoes.join(',');
        ta.style.backgroundAttachment = 'local';   // a pauta rola junto com o texto
        refazer(); mostrar(null);
        const f2 = FONTES.find((x) => e.fonte.indexOf(x[0].split(',')[0].replace(/'/g, '')) >= 0);
        sel.value = f2 ? f2[0] : FONTES[0][0];
      };
      pintar();
      ta.addEventListener('input', (ev) => {
        const D1 = lay.display, S1 = lay.softs, D2 = ta.value;
        if (D2 === D1) return;
        // diferença mínima entre o display anterior e o atual (prefixo/sufixo comuns) e mapeamento para o texto real
        let p = 0; const m = Math.min(D1.length, D2.length);
        while (p < m && D1.charCodeAt(p) === D2.charCodeAt(p)) p++;
        let sfx = 0; while (sfx < m - p && D1.charCodeAt(D1.length - 1 - sfx) === D2.charCodeAt(D2.length - 1 - sfx)) sfx++;
        let a = dToR(p, S1), b = dToR(D1.length - sfx, S1);
        const ins = D2.slice(p, D2.length - sfx);
        if (!ins && a === b) {   // só apagou quebra(s) automática(s): apaga o caractere real vizinho (Backspace = anterior; Delete = seguinte)
          if (ev && ev.inputType === 'deleteContentForward') b = Math.min(real.length, b + 1); else a = Math.max(0, a - 1);
        }
        real = real.slice(0, a) + ins + real.slice(b);
        const caret = a + ins.length;
        refazer(); mostrar(caret);
        salvarTexto(real);
      });
      sel.addEventListener('change', () => { salvarCampo({ papelFonte: sel.value }); pintar(); });
      bd.querySelectorAll('.pe-cf').forEach((b) => b.addEventListener('click', () => {
        const c = CORES_FOLHA.find((x) => x[1] === b.dataset.c);
        salvarCampo({ cor: c[1], papelCorTexto: c[2] });   // como no HTML: cada folha colorida traz a cor de texto combinando; dá pra trocar logo em seguida
        const ic = panel.querySelector('#obj-cor'); if (ic) ic.value = c[1];
        const l1 = bd.querySelector('#pe-cf-livre'); if (l1) l1.value = c[1]; const l2 = bd.querySelector('#pe-ct-livre'); if (l2) l2.value = c[2];
        const ict = panel.querySelector('#obj-papel-cortexto'); if (ict) ict.value = c[2];
        pintar();
      }));
      bd.querySelectorAll('.pe-ct').forEach((b) => b.addEventListener('click', () => {
        salvarCampo({ papelCorTexto: b.dataset.c });
        const l2 = bd.querySelector('#pe-ct-livre'); if (l2) l2.value = b.dataset.c; const ict2 = panel.querySelector('#obj-papel-cortexto'); if (ict2) ict2.value = b.dataset.c;
        pintar();
      }));
      bd.querySelector('#pe-cf-livre')?.addEventListener('input', (e) => { salvarCampo({ cor: e.target.value }); const ic = panel.querySelector('#obj-cor'); if (ic) ic.value = e.target.value; pintar(); });
      bd.querySelector('#pe-ct-livre')?.addEventListener('input', (e) => { salvarCampo({ papelCorTexto: e.target.value }); const ict3 = panel.querySelector('#obj-papel-cortexto'); if (ict3) ict3.value = e.target.value; pintar(); });
      bd.querySelector('#pe-tam')?.addEventListener('input', (e) => { const v = parseInt(e.target.value, 10) || 30; const l = bd.querySelector('#pe-tam-val'); if (l) l.textContent = v; const pt = panel.querySelector('#obj-papel-fonte-tam'); if (pt) pt.value = v; const pl = panel.querySelector('#obj-papel-fonte-tam-val'); if (pl) pl.textContent = v; salvarCampo({ papelFonteTam: v }); pintar(); });
      bd.querySelector('#pe-linhas')?.addEventListener('change', (e) => { const pc = panel.querySelector('#obj-papel-linhas'); if (pc) pc.checked = e.target.checked; salvarCampo({ papelLinhas: e.target.checked }); pintar(); });
      bd.querySelector('#pe-margem')?.addEventListener('change', (e) => { const pc = panel.querySelector('#obj-papel-margem'); if (pc) pc.checked = e.target.checked; salvarCampo({ papelMargem: e.target.checked }); pintar(); });
      const fechar = () => { descarregar(); bd.remove(); };
      bd.querySelector('#pe-ok').addEventListener('click', fechar);
      bd.addEventListener('click', (ev) => { if (ev.target === bd) fechar(); });
      setTimeout(() => ta.focus(), 30);
    });
    panel.querySelector('#obj-papel-fonte-tam')?.addEventListener('input', (e) => { const v = parseInt(e.target.value, 10) || 30; const l = panel.querySelector('#obj-papel-fonte-tam-val'); if (l) l.textContent = v; salvarCampo({ papelFonteTam: v }); });
    panel.querySelector('#obj-papel-linhas')?.addEventListener('change', (e) => salvarCampo({ papelLinhas: e.target.checked }));
    panel.querySelector('#obj-papel-margem')?.addEventListener('change', (e) => salvarCampo({ papelMargem: e.target.checked }));
    panel.querySelector('#obj-papel-fonte')?.addEventListener('change', (e) => salvarCampo({ papelFonte: e.target.value }));
    panel.querySelector('#obj-papel-cortexto')?.addEventListener('input', (e) => salvarCampo({ papelCorTexto: e.target.value }));
    panel.querySelector('#obj-papel-texto')?.addEventListener('input', (e) => salvarCampo({ texto: e.target.value }));
    if (isTexto3d) window.Texto3D.wireFields(panel, () => ((ctx._map.objects || []).find((o) => o.id === obj.id) || obj), (patch) => salvarCampo(patch)); // [69ª]
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
    // [46ª rodada] sentido inverso: barra lateral "Transformação" -> campos deste painel (não toca em campo com foco)
    ctx._objPanelSyncFromObject = (o) => {
      if (!o || o.id !== obj.id || !panel.isConnected) return;
      const aP = (ctx._map && ctx._map.alturaPiso) || 2.8;
      const set = (sel, v, dec) => { const el = panel.querySelector(sel); if (el && document.activeElement !== el && Number.isFinite(v)) el.value = dec == null ? String(v) : v.toFixed(dec); };
      set('#obj-x', o.x, 2); set('#obj-y', o.y, 2);
      set('#obj-piso', o.piso || 0);
      const loc = (o.elevacao || 0) + window.Mapping.y0Efetivo(o);
      set('#obj-pos-yl', loc, 2);
      set('#obj-pos-y', (o.piso || 0) * aP + loc, 2);
      const g = Math.round((o.angulo || 0) * 180 / Math.PI * 100) / 100; set('#obj-angulo', g);
      // [61ª rodada] CORRIGIDO -- as dimensões (Largura/Profundidade/Altura/Raio/Lados) e as cores NÃO eram espelhadas: editar pela janela "Transformação" deixava esses campos mostrando o valor ANTIGO, e digitar neles o mesmo valor que o objeto já tinha não mudava nada ("os campos não funcionam").
      set('#obj-largura', o.largura, 2); set('#obj-profundidade', o.profundidade, 2);
      set('#obj-altura', Number(o.tipo === 'escada' ? (o.altura || o.alturaEscada) : o.altura), 2);
      if (o.forma === 'poligono') { set('#obj-raio', o.largura != null ? (o.largura + (o.profundidade != null ? o.profundidade : o.largura)) / 4 : o.raio, 2); set('#obj-lados', o.lados); }
      const setCor = (sel, v) => { const el = panel.querySelector(sel); if (el && typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) && document.activeElement !== el) el.value = v; };
      setCor('#obj-cor', o.cor); setCor('#obj-cor-contorno', o.corContorno);
    };
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
    // Y global (mundo) e Y local (no andar) — o outro campo acompanha; grava `elevacao` = Y local − y0 efetivo (negativo permitido).
    {
      const yG = panel.querySelector('#obj-pos-y'), yL = panel.querySelector('#obj-pos-yl'), aP = () => (ctx._map && ctx._map.alturaPiso) || 2.8;
      const gravar = (local) => { const o = objAtual(); salvarCampo({ elevacao: local - window.Mapping.y0Efetivo(o) }); };
      if (yG) yG.addEventListener('input', (e) => { const v = parseFloat(e.target.value); if (!Number.isFinite(v)) return; const o = objAtual(), local = v - (o.piso || 0) * aP(); if (yL) yL.value = local.toFixed(2); const pe = panel.querySelector('#obj-elevacao') || panel.querySelector('#obj-rack-elev'); if (pe) pe.value = local.toFixed(2); gravar(local); });
      if (yL) yL.addEventListener('input', (e) => { const v = parseFloat(e.target.value); if (!Number.isFinite(v)) return; const o = objAtual(); if (yG) yG.value = (v + (o.piso || 0) * aP()).toFixed(2); gravar(v); });
    }
    // [91ª] Imagem/Rack: ao mexer no próprio campo de elevação (= Y local), o Y global acompanha
    ['#obj-elevacao', '#obj-rack-elev'].forEach((q) => { const el = panel.querySelector(q), g = panel.querySelector('#obj-pos-y'); if (el && g) el.addEventListener('input', () => { const v = parseFloat(el.value); if (Number.isFinite(v)) g.value = (v + (objAtual().piso || 0) * ((ctx._map && ctx._map.alturaPiso) || 2.8)).toFixed(2); }); });
    panel.querySelector('#obj-angulo').oninput = (e) => salvarCampo({ angulo: (parseFloat(e.target.value) || 0) * Math.PI / 180 });
    panel.querySelector('#obj-piso').oninput = (e) => {
      salvarCampo({ piso: parseInt(e.target.value, 10) || 0 });
      const yG = panel.querySelector('#obj-pos-y'), yL = panel.querySelector('#obj-pos-yl') || panel.querySelector('#obj-elevacao') || panel.querySelector('#obj-rack-elev'); // Y global acompanha o andar (o local não muda)
      if (yG && yL) yG.value = (parseFloat(yL.value) + (parseInt(e.target.value, 10) || 0) * ((ctx._map && ctx._map.alturaPiso) || 2.8)).toFixed(2);
    };
    // [13/09/2026] NOVO — "Acabamento" do Piso ('liso'/'lajota', ver
    // `acabamentoField` acima e engine3d.js `_getProceduralFloorTexture`).
    {
      const tl = () => window.CustomRoof.cfgDe((ctx._map.objects || []).find((o) => o.id === obj.id) || obj);
      panel.querySelector('#obj-telha-material')?.addEventListener('change', (e) => salvarCampo({ telha: { ...tl(), material: e.target.value } }));
      panel.querySelector('#obj-telha-formato')?.addEventListener('change', (e) => salvarCampo({ telha: { ...tl(), formato: e.target.value } }));
      panel.querySelector('#obj-telha-incl')?.addEventListener('input', (e) => { const v = Math.max(0, Math.min(75, parseFloat(e.target.value) || 0)); salvarCampo({ telha: { ...tl(), inclinacao: v } }); });
      panel.querySelector('#obj-telha-aguas')?.addEventListener('change', (e) => salvarCampo({ telha: { ...tl(), aguas: +e.target.value } }));
      // [88ª] União: todos os membros dos dois grupos passam a ter o mesmo grupo; o motor refaz o telhado e os vizinhos (rebuildObjectIncremental).
      const tels = () => (ctx._map.objects || []).filter((o) => o.tipo === 'telha');
      panel.querySelectorAll('[data-telha-toggle]').forEach((cb) => cb.addEventListener('change', () => {
        const R = window.CustomRoof, id = cb.dataset.telhaToggle, outro = tels().find((o) => String(o.id) === String(id)), eu = tels().find((o) => o.id === obj.id) || obj;
        if (!outro) return;
        if (cb.checked) {
          // une: os dois grupos (e todos os seus membros) viram um só — dá para unir 3, 4... em sequência
          const gs = new Set([R.cfgDe(eu).grupo, R.cfgDe(outro).grupo].filter(Boolean));
          const g = [...gs][0] || ('tg' + Date.now().toString(36));
          const membros = tels().filter((o) => o.id === outro.id || o.id === eu.id || gs.has(R.cfgDe(o).grupo));
          membros.forEach((o) => { if (o.id !== obj.id) Mapping.updateObject(ctx._map, o.id, { telha: { ...R.cfgDe(o), grupo: g } }); });
          salvarCampo({ telha: { ...tl(), grupo: g } });
        } else {
          // desune só este par: o outro telhado sai do grupo; se sobrar um membro sozinho, o grupo se desfaz
          const g = R.cfgDe(eu).grupo;
          Mapping.updateObject(ctx._map, outro.id, { telha: { ...R.cfgDe(outro), grupo: '' } });
          const resto = tels().filter((o) => o.id !== outro.id && R.cfgDe(o).grupo === g);
          if (resto.length === 1) { if (resto[0].id === obj.id) salvarCampo({ telha: { ...tl(), grupo: '' } }); else Mapping.updateObject(ctx._map, resto[0].id, { telha: { ...R.cfgDe(resto[0]), grupo: '' } }); }
          ctx._saveMap();
          if (ctx._engine && ctx._engine.rebuildObjectIncremental) tels().filter((o) => o.id === outro.id || resto.indexOf(o) >= 0).forEach((o) => { try { ctx._engine.rebuildObjectIncremental(o); } catch (_) { /* segue */ } });
        }
        ctx._openObjectPanel(tels().find((o) => o.id === obj.id) || obj);
      }));
    }
    panel.querySelector('#obj-padrao')?.addEventListener('change', (e) => salvarCampo({ padrao: e.target.value, acabamento: e.target.value === 'lajota60' ? 'lajota' : 'liso' }));   // [88ª] muda na hora no 3D (a assinatura de sincronização inclui `padrao`)
    // [74ª rodada] Piso editável: converter / + furo / − furo / voltar a retângulo (copia o contorno atual, edita e grava via salvarCampo).
    const _pisoAtual = () => (ctx._map.objects || []).find((o) => o.id === obj.id) || obj;
    const _pisoPP = () => JSON.parse(JSON.stringify(_pisoAtual().pisoPoligono || null));
    panel.querySelector('#obj-piso-editar')?.addEventListener('click', () => { const o = JSON.parse(JSON.stringify(_pisoAtual())); window.PisoCustom.tornarEditavel(o); salvarCampo({ pisoPoligono: o.pisoPoligono }); ctx._openObjectPanel(_pisoAtual()); });
    panel.querySelector('#obj-piso-furo')?.addEventListener('click', () => { const o = JSON.parse(JSON.stringify(_pisoAtual())); window.PisoCustom.adicionarFuro(o); salvarCampo({ pisoPoligono: o.pisoPoligono }); ctx._openObjectPanel(_pisoAtual()); });
    panel.querySelector('#obj-piso-furo-rm')?.addEventListener('click', () => { const o = JSON.parse(JSON.stringify(_pisoAtual())); window.PisoCustom.removerUltimoFuro(o); salvarCampo({ pisoPoligono: o.pisoPoligono }); ctx._openObjectPanel(_pisoAtual()); });
    panel.querySelector('#obj-piso-rect')?.addEventListener('click', () => { salvarCampo({ pisoPoligono: null }); ctx._openObjectPanel(_pisoAtual()); });
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
    if (isRede) {
      // [18/09/2026 UTC] RODADA 166 -- equipamento de rede: energia, rack, portas e cabos.
      const RE = window.RedeEquip;
      const reabrir = () => ctx._openObjectPanel?.((ctx._map.objects || []).find((o) => o.id === obj.id) || obj, modoVer3D ? { modoVer3D: true } : undefined);
      const persistir = (o) => { ctx._saveMap(); if (ctx._engine && ctx._engine.rebuildObjectIncremental) { try { ctx._engine.rebuildObjectIncremental(o); } catch (err) { console.warn('[ObjectPanel] rebuild 3D falhou:', err); } } };
      const sp = RE.especificar(obj.tipo);
      const r = () => RE.garantirRede(objAtual());
      const q = (s2) => panel.querySelector(s2);
      if (q('#obj-rede-ligado')) q('#obj-rede-ligado').onchange = (e) => { r().ligado = e.target.checked; ctx._saveMap(); };
      if (q('#obj-rede-label')) q('#obj-rede-label').oninput = (e) => { r().labelID = e.target.value; ctx._saveMap(); };
      // [21/09/2026 UTC] NOVO -- pedido verbatim: "No mapa 2D, nas propriedades do Access Point, deve ter
      // um botão que faz aparecer a mesma janela que aparece no 'Ver em 3D' [...] quando aponta-se para um
      // AP e clica nele." Reaproveita `View3D.abrirPainelEquipamento` (view3d-rede.js) -- a MESMA janela,
      // sem duplicar os campos de faixa/potência/varredura/mapa 2D aqui.
      if (q('#obj-rede-ap-config')) q('#obj-rede-ap-config').onclick = () => { window.View3D.abrirPainelEquipamento(objAtual(), document.body, ctx._map); };
      panel.querySelectorAll('[data-rede-cfg]').forEach((sel) => { sel.onchange = (e) => { r()[sel.getAttribute('data-rede-cfg')] = e.target.value; persistir(objAtual()); }; });
      if (q('#obj-rede-host')) q('#obj-rede-host').oninput = (e) => { r().hostname = e.target.value; ctx._saveMap(); };
      if (q('#obj-rede-instalar')) q('#obj-rede-instalar').onclick = () => {
        const rack = (ctx._map.objects || []).find((o) => o.id === q('#obj-rede-rack').value);
        const res = RE.instalarNoRack(ctx._map, objAtual(), rack, parseInt(q('#obj-rede-u').value, 10) || 0);
        if (!res.ok) { Utils.toast(res.erro || 'Não foi possível instalar.', { type: 'warn' }); return; }
        persistir(objAtual()); if (ctx._engine && ctx._engine.rebuildCabos) ctx._engine.rebuildCabos(); reabrir();
      };
      if (q('#obj-rede-retirar')) q('#obj-rede-retirar').onclick = () => { RE.retirarDoRack(ctx._map, objAtual()); persistir(objAtual()); if (ctx._engine && ctx._engine.rebuildCabos) ctx._engine.rebuildCabos(); reabrir(); };
      panel.querySelectorAll('[data-rede-rot]').forEach((inp) => {
        inp.onchange = () => { const n = inp.getAttribute('data-rede-rot'); const rr = r(); rr.portas[n] = rr.portas[n] || {}; rr.portas[n].rotulo = inp.value.trim(); ctx._saveMap(); };
      });
      panel.querySelectorAll('[data-rede-st]').forEach((sel) => {
        sel.onchange = () => { const n = sel.getAttribute('data-rede-st'); const rr = r(); rr.portas[n] = rr.portas[n] || {}; rr.portas[n].status = sel.value; ctx._saveMap(); };
      });
      panel.querySelectorAll('[data-rede-des]').forEach((b) => { b.onclick = () => { RE.desconectarPorta(ctx._map, obj.id, parseInt(b.getAttribute('data-rede-des'), 10)); reabrir(); }; });
      const preencherPP = () => {
        const alvo = (ctx._map.objects || []).find((o) => o.id === q('#obj-rede-cn-para').value), sa = alvo && RE.especificar(alvo.tipo);
        q('#obj-rede-cn-pp').innerHTML = sa ? sa.portas.filter((pt) => !RE.caboDaPorta(ctx._map, alvo.id, pt.n)).map((pt) => `<option value="${pt.n}">${pt.tipo === 'sfp' ? 'SFP ' : ''}${pt.n}</option>`).join('') : '';
      };
      q('#obj-rede-cn-para').onchange = preencherPP; preencherPP();
      q('#obj-rede-cn-btn').onclick = () => {
        const de = parseInt(q('#obj-rede-cn-de').value, 10), pp = parseInt(q('#obj-rede-cn-pp').value, 10);
        if (!de || !pp) { Utils.toast('Escolha a porta de origem e a de destino.', { type: 'warn' }); return; }
        const res = RE.conectar(ctx._map, objAtual(), de, q('#obj-rede-cn-para').value, pp, { tipo: q('#obj-rede-cn-tipo').value });
        if (!res.ok) { Utils.toast(res.erro || 'Não foi possível conectar.', { type: 'warn' }); return; }
        reabrir();
      };
      q('#obj-cor').oninput = (e) => salvarCampo({ cor: e.target.value });
      q('#obj-cor-contorno').oninput = (e) => salvarCampo({ corContorno: e.target.value });
    } else if (isRack) {
      // [18/09/2026 UTC] Rack modular: aplica Us/profundidade de uma vez
      // (patch derivado de RackModular.patchParaObjeto) e reabre o painel pra
      // refletir tipo (parede/piso), medidas e o campo de altura da base.
      const reabrir = () => ctx._openObjectPanel?.((ctx._map.objects || []).find((o) => o.id === obj.id) || obj, modoVer3D ? { modoVer3D: true } : undefined);
      const aplicarRack = (us, prof) => {
        const patch = window.RackModular.patchParaObjeto(objAtual(), us, prof), o = objAtual();
        // trocou o tipo (parede/piso): quem está embaixo (Piso, mesa...) manda na elevação; sem nada embaixo vale a do tipo.
        if (patch.elevacao != null && window.Mapping) {
          const base = window.Mapping._findTopObjectAt(ctx._map, o.x, o.y, o.id, Object.assign({}, o, patch));
          if (base) {
            // [21/09/2026] pedido verbatim: "se é um rack de parede, ao ficar em cima de outra
            // coisa ou objeto Piso, deve também ter a altura padrão em relação a este outro
            // objeto ou objeto Piso que tem (quando está referenciado ao chão)." Antes, em cima de
            // outro objeto o rack de parede ficava ENCOSTADO nele (sem o 1,2 m padrão), diferente
            // de quando está direto no chão -- agora soma a mesma altura padrão sobre o apoio.
            const ehParede = window.RackModular.fromObjeto(Object.assign({}, o, patch)).tipo === 'parede';
            const RC = window.RACK_CATALOGO;
            patch.elevacao = window.Mapping.objectTopHeight(base) + (ehParede && RC ? RC.ELEVACAO_PAREDE_M : 0);
          }
        }
        salvarCampo(patch);
        reabrir();
      };
      panel.querySelector('#obj-rack-us').onchange = (e) => aplicarRack(parseInt(e.target.value, 10), objAtual().rackProfundidade || 600);
      panel.querySelector('#obj-rack-prof').onchange = (e) => aplicarRack(objAtual().rackUs || 12, parseInt(e.target.value, 10));
      const campoElev = panel.querySelector('#obj-rack-elev');
      if (campoElev) campoElev.oninput = (e) => salvarCampo({ elevacao: Math.max(0, parseFloat(e.target.value) || 0) });
      // [18/09/2026 UTC] RODADA 164 -- montagem + equipamentos (o 3D reconstroi so este rack).
      const RM = window.RackModular;
      panel.querySelectorAll('[data-rack-peca]').forEach((cb) => {
        cb.onchange = () => { salvarCampo(RM.patchMontagem(objAtual(), { [cb.getAttribute('data-rack-peca')]: cb.checked })); reabrir(); };
      });
      // [21/09/2026] CORRIGIDO -- pedido verbatim: "Na 'Direção' Ao trocar de Topo para Base,
      // acabam ficando abertas as duas tampas. Deveria ser apenas a tampa selecionada. Faça
      // outra opção para que as duas tampas fiquem abertas ao mesmo tempo." Unifica a lógica
      // de abrir/fechar tampa num só lugar (chamada pela Direção E pelo novo checkbox
      // "Abrir as duas tampas"): sem o checkbox marcado, só o lado escolhido abre -- o OUTRO
      // lado fecha se estava aberto por uma escolha anterior (essa era a causa do bug: nada
      // fechava o lado antigo ao trocar de Topo pra Base ou vice-versa). Nunca mexe em quem
      // está 'sem_tampa' (removida por completo -- escolha independente da saída de cabos).
      const aplicarSaidaCabos = () => {
        const dir = panel.querySelector('#obj-rack-saida-dir').value;
        const ambas = panel.querySelector('#obj-rack-saida-ambas').checked;
        const patch = RM.patchCableExitDirection(objAtual(), dir);
        const lado = dir === 'top' ? 'topo' : dir === 'bottom' ? 'base' : null;
        const atual = Object.assign({ topo: 'fechada', base: 'fechada' }, objAtual().rackTampaEstado);
        const novo = { topo: atual.topo, base: atual.base };
        const abrir = (k) => { if (novo[k] !== 'sem_tampa') novo[k] = 'com_abertura'; };
        const fechar = (k) => { if (novo[k] === 'com_abertura') novo[k] = 'fechada'; };
        if (ambas) { abrir('topo'); abrir('base'); }
        else if (lado) { abrir(lado); fechar(lado === 'topo' ? 'base' : 'topo'); }
        else { fechar('topo'); fechar('base'); }
        if (novo.topo !== atual.topo || novo.base !== atual.base) patch.rackTampaEstado = novo;
        salvarCampo(patch); reabrir();
      };
      panel.querySelector('#obj-rack-saida-dir').onchange = aplicarSaidaCabos;
      panel.querySelector('#obj-rack-saida-ambas').onchange = aplicarSaidaCabos;
      panel.querySelector('#obj-rack-saida-alin').onchange = (e) => { salvarCampo(RM.patchCableExitAlignment(objAtual(), e.target.value)); reabrir(); };
      const salvarOffsetSaida = () => salvarCampo(RM.patchCustomExitOffset(objAtual(), parseFloat(panel.querySelector('#obj-rack-saida-x').value), parseFloat(panel.querySelector('#obj-rack-saida-z').value)));
      panel.querySelector('#obj-rack-saida-x').oninput = salvarOffsetSaida;
      panel.querySelector('#obj-rack-saida-z').oninput = salvarOffsetSaida;
      panel.querySelector('#obj-rack-cabos-fmt').onchange = (e) => { salvarCampo(RM.patchCabosFormato(objAtual(), e.target.value)); reabrir(); };
      panel.querySelector('#obj-rack-cabos-esp').onchange = (e) => {
        const patch = RM.patchCabosEspacamento(objAtual(), e.target.value);
        if (e.target.value === 'livre' && objAtual().rackCabosFator == null) Object.assign(patch, RM.patchCabosFator(objAtual(), 1.5));
        salvarCampo(patch); reabrir();
      };
      panel.querySelector('#obj-rack-cabos-espv').onchange = (e) => {
        const patch = RM.patchCabosEspacamentoV(objAtual(), e.target.value);
        if (e.target.value === 'livre' && objAtual().rackCabosFatorV == null) Object.assign(patch, RM.patchCabosFatorV(objAtual(), 2));
        salvarCampo(patch); reabrir();
      };
      panel.querySelector('#obj-rack-cabos-fatorv').onchange = (e) => { salvarCampo(RM.patchCabosFatorV(objAtual(), parseFloat(e.target.value))); reabrir(); };
      panel.querySelector('#obj-rack-cabos-fator').onchange = (e) => { salvarCampo(RM.patchCabosFator(objAtual(), parseFloat(e.target.value))); reabrir(); };
      panel.querySelector('#obj-rack-traseira').onchange = (e) => { salvarCampo(RM.patchTraseiraTipo(objAtual(), e.target.value)); reabrir(); };
      panel.querySelector('#obj-rack-desmontar').onclick = () => { salvarCampo(RM.patchDesmontarTudo(objAtual())); reabrir(); };
      panel.querySelector('#obj-rack-montar').onclick = () => { salvarCampo(RM.patchMontarTudo(objAtual())); reabrir(); };
      panel.querySelectorAll('[data-rack-rem]').forEach((b) => {
        b.onclick = () => { salvarCampo(RM.patchRemoveAcessorio(objAtual(), b.getAttribute('data-rack-rem'))); reabrir(); };
      });
      panel.querySelector('#obj-rack-acc-add').onclick = () => {
        const tipo = panel.querySelector('#obj-rack-acc-tipo').value;
        const h = parseInt(panel.querySelector('#obj-rack-acc-h').value, 10) || 1;
        const u = parseInt(panel.querySelector('#obj-rack-acc-u').value, 10) || 0;
        const patch = RM.patchAddAcessorio(objAtual(), tipo, h, u, Utils.uid('acc'));
        if (!patch) { Utils.toast('N\u00e3o h\u00e1 espa\u00e7o livre para ' + h + 'U neste rack.', { type: 'warn' }); return; }
        salvarCampo(patch); reabrir();
      };
      // [18/09/2026 UTC] RODADA 166 -- switches/patch panels reais do rack (por U).
      panel.querySelectorAll('[data-rack-rede-add]').forEach((b) => {
        b.onclick = () => {
          const RE = window.RedeEquip, novo = RE.criarNoRack(ctx._map, objAtual(), (b.getAttribute('data-rack-rede-add') === 'sel' ? panel.querySelector('#obj-rack-rede-tipo').value : b.getAttribute('data-rack-rede-add')), 0);
          if (!novo) { Utils.toast('N\u00e3o h\u00e1 espa\u00e7o livre neste rack.', { type: 'warn' }); return; }
          ctx._saveMap();
          if (ctx._engine && ctx._engine.addObjectIncremental) { try { ctx._engine.addObjectIncremental(novo); } catch (err) { console.warn('[ObjectPanel] 3D:', err); } }
          reabrir();
        };
      });
      panel.querySelectorAll('[data-rack-rede-ret]').forEach((b) => {
        b.onclick = () => {
          const e = (ctx._map.objects || []).find((o) => o.id === b.getAttribute('data-rack-rede-ret'));
          if (e) { window.RedeEquip.retirarDoRack(ctx._map, e); ctx._saveMap(); if (ctx._engine && ctx._engine.rebuildObjectIncremental) ctx._engine.rebuildObjectIncremental(e); if (ctx._engine && ctx._engine.rebuildCabos) ctx._engine.rebuildCabos(); }
          reabrir();
        };
      });
      panel.querySelector('#obj-cor').oninput = (e) => salvarCampo({ cor: e.target.value });
      panel.querySelector('#obj-cor-contorno').oninput = (e) => salvarCampo({ corContorno: e.target.value });
    } else if (isTexto3d) {
      panel.querySelector('#obj-cor').oninput = (e) => salvarCampo({ cor: e.target.value });
      panel.querySelector('#obj-cor-contorno').oninput = (e) => salvarCampo({ corContorno: e.target.value });
    } else if (isRetangulo) {
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
      panel.querySelector('#obj-altura').oninput = (e) => { const h = parseFloat(e.target.value) || 0.05; salvarCampo(isEscada ? { altura: h, alturaEscada: h } : { altura: h }); };
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
      if (ctx._engine && ctx._rebuildScene) ctx._rebuildScene();   // no "Ver em 3D": redesenha o objeto com o destaque de item associado
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
    panel.querySelectorAll('.obj-item-editar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemId = await Utils.pickItem({ ambienteId: ctx._map.id, title: 'Trocar este patrimônio por' });
        if (!itemId) return;
        const itemEscolhido = await DB.getItem(itemId);
        ensureCommitted();
        const alvo = (ctx._map.objects || []).find((o) => o.id === obj.id) || obj;
        if (!Mapping.replaceItemInObject(ctx._map, alvo.id, btn.dataset.id, itemId, itemEscolhido?.patrimonio)) {
          Utils.toast('Este patrimônio já está associado a este objeto.', { type: 'warn' });
          return;
        }
        ctx._saveMap();
        if (ctx._engine && ctx._rebuildScene) ctx._rebuildScene();
        Utils.toast('Patrimônio atualizado ✓', { type: 'ok' });
        const fresh = (ctx._map.objects || []).find((o) => o.id === obj.id);
        reentrarReedit(fresh);
        ctx._openObjectPanel(fresh || obj);
      });
    });
    panel.querySelectorAll('.obj-item-remover').forEach((btn) => {
      btn.addEventListener('click', () => {
        ensureCommitted();
        const alvo = (ctx._map.objects || []).find((o) => o.id === obj.id) || obj;
        Mapping.removeItemFromObject(ctx._map, alvo.id, btn.dataset.id);
        ctx._saveMap();
        if (ctx._engine && ctx._rebuildScene) ctx._rebuildScene();
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
