/* js/cards/object-card.js
 * Card genérico mostrado ao mirar/selecionar QUALQUER objeto do catálogo
 * (móveis, robôs, portas, retângulos/polígonos soltos, etc.) no "Ver em
 * 3D" — o mais usado e mais complexo dos 5 cards. Extraído de
 * `View3D._showObjectCard3DBody` (js/view3d.js) — ver comentário grande no
 * topo de `js/cardsystem.js` pro porquê da extração.
 *
 * `data` é o objeto do mapa (`this._map.objects[i]`). Usa `build()` (em
 * vez de `bodyHtml`+`wire` separados) por um motivo importante: a lista de
 * botões finais (padrão + extras de `onModelCardButtons`, ver
 * `assets/modelos/<tipo>.model.js`/comentário grande no topo de
 * `js/objectassets.js`) precisa ser calculada UMA VEZ SÓ e o MESMO
 * resultado usado tanto pra montar o HTML quanto pra prender os
 * listeners — se fossem duas passadas separadas (`bodyHtml` então
 * `wire`, cada uma recalculando do zero), `onModelCardButtons` do Modelo
 * do objeto seria chamado DUAS vezes por abertura de card, arriscando
 * efeito colateral duplicado num Modelo customizado que faça algo além de
 * só devolver botões (nada impede um script de usuário de ter efeito
 * colateral ali, mesmo não sendo o uso pretendido da API).
 *
 * ACOPLAMENTO COM `View3D` MANTIDO DE PROPÓSITO (documentado honestamente,
 * conforme pedido): `_modelarObjetosHabilitado` (estado do toggle "🛠️
 * Modelar objetos" do rodapé), `_openObjectPropsAndScripts3D`/
 * `_openRoboMonitoringApp3D` (telas cheias específicas do 3D) e
 * `Modeler3D.enter`/`Mapping.updateObject`/`DB.saveMap` continuam sendo
 * acessados via `ctx.view3d`/globals — não dava pra mover isso pra fora
 * sem duplicar bastante estado interno do View3D, e o pedido do usuário é
 * poder editar TEXTO/ESTILO/comportamento de alto nível de cada card, não
 * reescrever a integração profunda com o motor 3D.
 */
window.CardSystem.register('object', {
  build(obj, ctx) {
    const Utils = ctx.Utils;
    const view3d = ctx.view3d;
    const DB = ctx.DB;
    const Mapping = window.Mapping;

    const isRetangulo = obj.forma === 'retangulo';
    const isPoligono = obj.forma === 'poligono';
    // O nome do catálogo tem prioridade sobre o rótulo genérico de
    // forma (retângulo/polígono) — só cai pro rótulo genérico quando NÃO
    // há tipo de catálogo (obj "solto"/customizado, ex.: cubo do
    // Modelador, que já nasce com `tipo:null`).
    const catalogLabel = window.Icons?.labelForAnyKey?.(obj.tipo);
    const label = catalogLabel || (isRetangulo ? 'Retângulo/quadrado'
      : isPoligono ? `Polígono (${Math.max(3, Math.round(obj.lados || 24))} lados)`
      : (obj.tipo || 'Objeto'));
    const emoji = catalogLabel ? '🏷️' : (isRetangulo ? '▭' : isPoligono ? '⬡' : '🧱');
    // [67ª rodada] Porta/Janela (entidades de parede, não objetos do catálogo): mesmo cartão, via `ctx.abertura` ('porta' | 'janela') — ver View3D._showAberturaCard3D.
    const abertura = ctx.abertura || null;
    const labelFinal = abertura ? (abertura === 'porta' ? 'Porta' : 'Janela') + (obj.nome ? ' — ' + obj.nome : '') : label;
    const emojiFinal = abertura ? (abertura === 'porta' ? '🚪' : '🪟') : emoji;
    // "🔧 Modelar em 3D" só aparece se o botão "🛠️ Modelar objetos" do
    // rodapé estiver LIGADO (`_modelarObjetosHabilitado`, padrão
    // desligado). Desligado, o cartão fica só com histórico/fechar.
    const modelarLigado = !!view3d._modelarObjetosHabilitado;

    // Botões PADRÃO — cada um com `id` estável (é esse `id` que
    // `onModelCardButtons` usa em `remover`) e `wire(elCartao)` chamado
    // DEPOIS do innerHTML já estar no DOM, pra prender o listener certo.
    const botoesPadrao = [
      modelarLigado && !abertura && {
        id: 'modelar',
        html: `<button class="btn secondary block sm" id="v3d-fc-modelar" title="Editar a malha 3D deste objeto vértice a vértice, como no Blender">🔧 Modelar em 3D</button>`,
        wire: (elCartao) => elCartao.querySelector('#v3d-fc-modelar')?.addEventListener('click', () => {
          elCartao.remove();
          const alvo = (view3d._map.objects || []).find((o) => o.id === obj.id) || obj;
          // A malha do Modelador é montada (e só gravada ao aplicar) dentro de Modeler3D.enter — nada é semeado/salvo aqui.
          // Se estiver no modo "Ver através desta câmera", a câmera deve
          // permanecer na perspectiva da câmera selecionada, não orbital.
          window.Modeler3D?.enter(view3d, alvo, { enterOrbital: !view3d._fotoCamMode });
        }),
      },
      // [15/09/2026 UTC] ALTERADO — pedido verbatim: "No 'Ver em 3D', ao
      // apontar e clicar com o mouse em um objeto, aparece a opção
      // 'Propriedades e Scripts'. Deve ser um botão para cada coisa, botão
      // 'Propriedades' e botão 'Scripts'. Estes dois botões só devem
      // aparecer no 'Modo Edição'." Antes era um único botão sempre
      // visível chamando `_openObjectPropsAndScripts3D`; agora são dois
      // botões separados, ambos gateados por `modelarLigado` (mesmo gate
      // do botão "🔧 Modelar em 3D" acima = "Modo Edição"). "Propriedades"
      // chama o novo `_openObjectProperties3D` (Posição/Rotação/Escala/
      // Dimensões, sem precisar entrar no Modelador). "Scripts" chama o
      // renomeado `_openObjectScripts3D` (era `_openObjectPropsAndScripts3D`).
      modelarLigado && {
        id: 'props',
        html: `<button type="button" class="btn secondary block sm" id="v3d-fc-props" style="margin-top:6px" title="Ver/editar posição, rotação, escala e dimensões deste objeto, sem entrar no Modelador">📐 Propriedades</button>`,
        wire: (elCartao) => elCartao.querySelector('#v3d-fc-props')?.addEventListener('click', () => {
          if (abertura) { elCartao.style.display = 'none'; view3d._abrirPropsAbertura3D(obj, abertura === 'porta', () => { if (elCartao.isConnected) elCartao.style.display = ''; }); return; }
          const alvo = (view3d._map.objects || []).find((o) => o.id === obj.id) || obj;
          view3d._openObjectProperties3D(alvo);
        }),
      },
      modelarLigado && {
        id: 'scripts',
        html: `<button type="button" class="btn secondary block sm" id="v3d-fc-scripts" style="margin-top:6px" title="Ver/editar o tipo e a lista de componentes (Scripts/Gatilhos de Evento) deste objeto, sem sair do 3D">📜 Scripts</button>`,
        // [15/09/2026 UTC] ALTERADO — pedido verbatim: "a janela de opções
        // que aparece deve ter pilha de janelas [...] clicando em uma
        // opção, o botão de 'fechar' dela deve voltar para a janela
        // anterior [...] Deve ser assim para todas as opções." Antes,
        // `_openObjectScripts3D` removia este cartão (`elCartao.remove()`
        // embutido nela) ao abrir o editor de Scripts tela-cheia — o botão
        // "Fechar" de lá só fechava o editor, sem devolver o cartão de
        // opções. Agora o cartão só fica ESCONDIDO (`display:none`,
        // continua no DOM) e reaparece via o `onAfterClose` que
        // `_openObjectScripts3D` já repassa pra `_openComponentsEditorFullscreen`
        // (mecanismo que já existia, só não era usado por este caminho).
        wire: (elCartao) => elCartao.querySelector('#v3d-fc-scripts')?.addEventListener('click', () => {
          const alvo = (view3d._map.objects || []).find((o) => o.id === obj.id) || obj;
          elCartao.style.display = 'none';
          view3d._openObjectScripts3D(alvo, () => { if (elCartao.isConnected) elCartao.style.display = ''; });
        }),
      },
      // [30/09/2026] REMOVIDO — pedido verbatim: "Retire o botão '📥
      // Importar modelo 3D (.glb)' desta janela." O botão "importar-modelo-
      // arquivo" (pipeline de substituição da geometria 3D por um arquivo
      // .glb/.gltf externo, `Model3DLoader.registerFromFile`) existia aqui
      // desde 13/09/2026 — a FUNCIONALIDADE em si (`js/model3dloader.js`,
      // `js/engine3d.js` `_buildModeloArquivoMesh`, o campo `modeloArquivo`
      // no perfil do objeto) continua intacta e utilizável por outros
      // caminhos (ex. o painel de propriedades completo, se algum dia
      // expuser o mesmo controle) — só este ATALHO no cartão de clique do
      // objeto em "Ver em 3D" foi removido, por pedido explícito do
      // usuário.
      // Só aparece no cartão de objetos do tipo "monitor"/"monitor2" (os 2
      // tipos de catálogo de "computador"/monitor de mesa — ver
      // js/engine3d-profiles.js e assets/modelos/monitor*.model.js).
      (obj.tipo === 'monitor' || obj.tipo === 'monitor2') && {
        id: 'robo-app',
        html: `<button type="button" class="btn secondary block sm" id="v3d-fc-robo-app" style="margin-top:6px" title="Abre o aplicativo de monitoramento dos robôs deste prédio, como se estivesse usando este computador">💻 Abrir aplicativo: Monitoramento de Robôs</button>`,
        // [15/09/2026 UTC] ALTERADO — mesma "pilha de janelas" pedida pro
        // botão "Scripts" acima (ver comentário grande lá) — o cartão de
        // opções fica escondido, não removido, e volta ao fechar o
        // aplicativo de monitoramento (`opts.onClose`, já suportado por
        // `_openRoboMonitoringApp3D`/`_abrirJanelaMonitoramento3D`).
        wire: (elCartao) => elCartao.querySelector('#v3d-fc-robo-app')?.addEventListener('click', () => {
          elCartao.style.display = 'none';
          const alvo = (view3d._map.objects || []).find((o) => o.id === obj.id) || obj;
          view3d._openRoboMonitoringApp3D(alvo, { onClose: () => { if (elCartao.isConnected) elCartao.style.display = ''; } });
        }),
      },
      abertura && {
        id: 'excluir-abertura',
        html: `<button type="button" class="btn danger block sm" id="v3d-fc-excluir-ab" style="margin-top:6px">🗑️ Excluir ${abertura}</button>`,
        wire: (elCartao) => elCartao.querySelector('#v3d-fc-excluir-ab')?.addEventListener('click', async () => {
          elCartao.remove();
          if (abertura === 'porta') Mapping.removeDoor(view3d._map, obj.id); else Mapping.removeWindow(view3d._map, obj.id);
          Utils.toast('Removido 🗑️', { type: 'ok', duration: 1400 });
          await view3d._afterMapMutated();
        }),
      },
    ].filter(Boolean);

    // Ponto de extensão — ver comentário grande em `js/objectassets.js`
    // (topo do arquivo). `onModelCardButtons` é OPCIONAL: sem ele (imensa
    // maioria dos tipos), `remover`/`adicionar` ficam vazios e o resultado
    // é IDÊNTICO ao de antes desta API existir.
    let remover = [];
    let adicionar = [];
    try {
      const modelDef = window.ObjectAssets?.getModel?.(obj.tipo);
      const resultado = modelDef?.onModelCardButtons?.(obj, ctx);
      if (Array.isArray(resultado)) {
        adicionar = resultado;
      } else if (resultado && typeof resultado === 'object') {
        remover = Array.isArray(resultado.remover) ? resultado.remover : [];
        adicionar = Array.isArray(resultado.adicionar) ? resultado.adicionar : [];
      }
    } catch (err) {
      // Um Modelo customizado com bug em `onModelCardButtons` não pode
      // derrubar o cartão inteiro — loga e segue só com os botões padrão,
      // como se a função não existisse.
      console.error('[CardSystem/object] onModelCardButtons falhou pro tipo', obj.tipo, err);
    }

    const botoesFinais = botoesPadrao.filter((b) => !remover.includes(b.id));
    // Botões extras — mesmo formato visual dos padrão, `id` gerado se o
    // Modelo não passar um (só usado internamente pro querySelector abaixo,
    // não precisa ser estável entre chamadas).
    const botoesExtrasHtml = adicionar.map((btn, i) => {
      const idExtra = `v3d-fc-extra-${i}`;
      const titleAttr = btn.title ? ` title="${Utils.escapeHtml(btn.title)}"` : '';
      return `<button type="button" class="btn secondary block sm" id="${idExtra}" style="margin-top:6px"${titleAttr}>${btn.label || ''}</button>`;
    }).join('');

    // NOVO (29/09/2026) — pedido verbatim: "Coloque um botão na janela que
    // se abre ao clicar no objeto no 'Modo Edição', no 'Ver em 3D'. [...]
    // Deve haver algum jeito de mostrar esta folha com a descrição e as
    // entradas de itens no 'Modo Navegação' de algum jeito que não polua a
    // tela." Um botão "📋 Especificações" — SEMPRE visível (nos dois modos,
    // ao contrário dos botões de edição acima que só aparecem com
    // `modelarLigado`) — mesmo padrão visual/mecânico do "📜 Histórico deste
    // objeto" logo abaixo (um `<div class="hidden">` que só monta o
    // conteúdo na hora de abrir, ver `especBody.innerHTML` no wire): fica
    // FECHADO por padrão, então não ocupa espaço nenhum na tela até o
    // usuário clicar — "não polui a tela" tanto em Modo Navegação (só
    // leitura: descrição + lista label/valor) quanto em Modo Edição (mesmo
    // conteúdo, com um botão extra "✏️ Editar especificações" que abre a
    // janela de propriedades completa — a mesma do mapa 2D, ver
    // `_openObjectProperties3D`/`ObjectPanelCard` — já com a seção
    // "📋 Especificações/Hardware" expandida).
    const especItensCount = Array.isArray(obj.especificacoes) ? obj.especificacoes.length : 0;
    // [30/09/2026] ALTERADO — pedido verbatim: "Coloque o botão Scripts [...]
    // acima do botão 'Especificações'. [...] a sequência que aparece dos
    // campos deve ser a mesma [...] ficando: 'Scripts', 'Especificações' e
    // 'Histórico'." Por isso o botão "📜 Scripts" é renderizado SEPARADO dos
    // demais botões padrão (que continuam antes, na ordem de sempre) e
    // colocado IMEDIATAMENTE acima do toggle de Especificações — o resto
    // (Modelar/Propriedades/app de monitoramento/botões extras de Modelo)
    // não tem posição exigida pelo pedido, então fica tudo ANTES do bloco
    // Scripts→Especificações→Histórico, preservando a ordem relativa entre
    // si que já tinham.
    const btnScripts = botoesFinais.find((b) => b.id === 'scripts');
    const outrosBotoes = botoesFinais.filter((b) => b.id !== 'scripts');
    // [30/09/2026] NOVO (17ª rodada) — pedido: acessar propriedades E patrimônio em Modo Edição; o clique agora abre este cartão, e o patrimônio vira botão aqui.
    const nPatrim = (obj.itemIds || []).filter((e) => e && e.id).length;
    const html = `
      <div style="text-align:center; font-weight:700; margin-bottom:8px">${emojiFinal} ${Utils.escapeHtml(labelFinal)}</div>
      ${outrosBotoes.map((b) => b.html).join('\n')}
      ${botoesExtrasHtml}
      ${btnScripts ? btnScripts.html : ''}
      ${nPatrim ? `<button type="button" class="btn secondary block sm" id="v3d-fc-patrimonio" style="margin-top:6px">🔗 Patrimônio${nPatrim > 1 ? 's' : ''} (${nPatrim})</button>` : ''}
      <button type="button" class="btn secondary block sm" id="v3d-fc-espec-toggle" style="margin-top:6px">📋 Especificações${especItensCount ? ` (${especItensCount})` : ''}${window.ObjectStandard?.indicadorEspecHtml(obj) || ''}</button>
      <div id="v3d-fc-espec-body" class="hidden" style="margin-top:6px; font-size:12.5px; text-align:left"></div>
      <button type="button" class="btn secondary block sm" id="v3d-obj-hist-toggle" style="margin-top:6px">📜 Histórico deste objeto${window.ObjectStandard?.indicadorHtml(obj) || ''}</button>
      <div id="v3d-obj-hist" class="hidden"></div>
      <button class="btn block sm" id="v3d-fc-close" style="margin-top:6px" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;

    const wire = (el) => {
      el.querySelector('#v3d-fc-close').onclick = () => el.remove();
      el.querySelector('#v3d-fc-patrimonio')?.addEventListener('click', () => view3d._abrirPatrimoniosDoObjeto3D(obj));
      for (const b of botoesFinais) b.wire(el);
      // Liga os botões extras chamando `onClick(entity, ctx)` do Modelo —
      // o MESMO `entity`/`ctx` que o resto do cartão usa, pra o botão
      // custom ter acesso a `ctx.view3d`/`ctx.DB`/etc igual qualquer outro
      // hook de Modelo.
      adicionar.forEach((btn, i) => {
        if (typeof btn.onClick !== 'function') return;
        el.querySelector(`#v3d-fc-extra-${i}`)?.addEventListener('click', () => {
          try { btn.onClick(obj, ctx); } catch (err) { console.error('[CardSystem/object] onClick de botão custom do card 3D falhou', err); }
        });
      });
      view3d._wireHistoricoCard(el, 'v3d-obj-hist', obj);
      // NOVO (29/09/2026) — ver comentário grande acima. Monta o conteúdo só
      // na hora de abrir (lê o objeto FRESCO de `view3d._map.objects`, não a
      // cópia `obj` capturada quando o cartão foi montado — mesmo cuidado já
      // tomado alhures neste app pra não mostrar dado desatualizado se algo
      // mudou entre o cartão abrir e o usuário clicar aqui).
      const especToggle = el.querySelector('#v3d-fc-espec-toggle');
      const especBody = el.querySelector('#v3d-fc-espec-body');
      especToggle.onclick = () => {
        if (!especBody.classList.contains('hidden')) { especBody.classList.add('hidden'); return; }
        const alvo = (view3d._map.objects || []).find((o) => o.id === obj.id) || obj;
        const itens = Array.isArray(alvo.especificacoes) ? alvo.especificacoes : [];
        const descricaoHtml = alvo.descricao
          ? `<div style="margin-bottom:6px; white-space:pre-wrap">${Utils.escapeHtml(alvo.descricao)}</div>`
          : '<div style="color:var(--text-dim); margin-bottom:6px">Sem descrição.</div>';
        const itensHtml = itens.length
          ? itens.map((it) => `<div style="display:flex; justify-content:space-between; gap:8px; padding:2px 0; border-bottom:1px solid var(--border)"><span style="color:var(--text-dim)">${Utils.escapeHtml(it.label || '(sem rótulo)')}</span><span>${Utils.escapeHtml(it.value || '')}</span></div>`).join('')
          : '<div style="color:var(--text-dim)">Nenhuma especificação cadastrada.</div>';
        // [30/09/2026] MUDADO (20ª rodada) — pedido verbatim: "Para o botão de 'especificações', deve ser algo semelhante [ao Histórico]: [descrição] [botão editar] / [entrada] [botão editar] [botão excluir] ... [entrada nova][botão para adicionar]." Em Modo Edição a seção agora é uma lista editável inline (ObjectStandard.especHtml/wireEspecUi, mesmo molde do Histórico); em Modo Navegação continua só leitura. O botão antigo '✏️ Editar especificações' (abria o painel de propriedades) saiu — o listener abaixo ficou inofensivo (`?.`, elemento não existe mais).
        if (window.ObjectStandard?.especHtml) {
          especBody.innerHTML = window.ObjectStandard.especHtml(alvo, 'v3d-fc', modelarLigado);
          window.ObjectStandard.wireEspecUi(especBody, alvo, 'v3d-fc', () => {
            try { (window.DB || ctx.DB).saveMap(view3d._map); } catch (err) { console.warn('[CardSystem/object] salvar especificações:', err); }
            try { if ((view3d._map?.objects || []).some((o) => o.id === alvo.id)) view3d._engine?.rebuildObjectIncremental?.(alvo); } catch (err) { console.warn('[CardSystem/object] atualizar selo de especificações ao vivo:', err); }
            const n = Array.isArray(alvo.especificacoes) ? alvo.especificacoes.length : 0;
            especToggle.innerHTML = '📋 Especificações' + (n ? ' (' + n + ')' : '') + (window.ObjectStandard.indicadorEspecHtml(alvo) || '');
          }, modelarLigado);
        } else {
          especBody.innerHTML = descricaoHtml + itensHtml;
        }
        especBody.classList.remove('hidden');
        especBody.querySelector('#v3d-fc-espec-editar')?.addEventListener('click', () => {
          // [30/09/2026] CORRIGIDO — pedido verbatim: "Deve ser uma pilha de
          // janelas, ao clicar em 'fechar' uma janela que foi aberta em pelo
          // clicar de um botão em uma janela anterior, deve voltar para a
          // janela anterior." Antes fazia `el.remove()` (destruía o cartão
          // de opções pra sempre) — igual ao bug que "📜 Scripts"/"💻 Abrir
          // aplicativo" já corrigiam (ver comentários grandes acima nos
          // botões `scripts`/`robo-app`). O painel de propriedades
          // (`_openObjectProperties3D`) não tem um `onClose` embutido pra
          // repassar (ao contrário de `_openObjectScripts3D`/
          // `_openRoboMonitoringApp3D`) — mas ele É um "card persistente"
          // (`panel.dataset.persistCard==='true'`, ver `_hideOrRemovePanel`
          // em js/mapview.js): fechar só faz `style.display='none'`, nunca
          // `.remove()`. Por isso basta ESCONDER (não remover) este cartão e
          // observar o painel de propriedades com um `MutationObserver` no
          // atributo `style` — quando ele for escondido (fechado pelo
          // usuário) ou removido do DOM, o cartão de opções reaparece,
          // preservando seu estado (scroll, seção de Especificações já
          // aberta, etc.) — nenhuma reconstrução envolvida.
          view3d._objEspecCollapsed = false; // abre a janela de propriedades já com a seção expandida
          el.style.display = 'none';
          const abrir = view3d._openObjectProperties3D(alvo);
          Promise.resolve(abrir).then(() => {
            const panel = view3d._panelEl || document.querySelector('.map2d-props-panel');
            const reexibirCartao = () => { if (el.isConnected) el.style.display = ''; };
            if (!panel) { reexibirCartao(); return; }
            const fechouOuSumiu = () => panel.style.display === 'none' || !panel.isConnected;
            if (fechouOuSumiu()) { reexibirCartao(); return; }
            const obs = new MutationObserver(() => {
              if (!fechouOuSumiu()) return;
              obs.disconnect();
              reexibirCartao();
            });
            obs.observe(panel, { attributes: true, attributeFilter: ['style'] });
            // Cobre o caso de o painel ser removido de vez do DOM (em vez de
            // só escondido) — `attributes` não pega isso, então observa
            // também o pai pra filhos removidos.
            if (panel.parentNode) {
              const obsPai = new MutationObserver(() => {
                if (panel.isConnected) return;
                obsPai.disconnect();
                obs.disconnect();
                reexibirCartao();
              });
              obsPai.observe(panel.parentNode, { childList: true });
            }
          }).catch(() => { if (el.isConnected) el.style.display = ''; });
        });
      };
    };

    return { html, wire };
  },
});
