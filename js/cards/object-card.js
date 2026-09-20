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
    // "🔧 Modelar em 3D" só aparece se o botão "🛠️ Modelar objetos" do
    // rodapé estiver LIGADO (`_modelarObjetosHabilitado`, padrão
    // desligado). Desligado, o cartão fica só com histórico/fechar.
    const modelarLigado = !!view3d._modelarObjetosHabilitado;

    // Botões PADRÃO — cada um com `id` estável (é esse `id` que
    // `onModelCardButtons` usa em `remover`) e `wire(elCartao)` chamado
    // DEPOIS do innerHTML já estar no DOM, pra prender o listener certo.
    const botoesPadrao = [
      modelarLigado && {
        id: 'modelar',
        html: `<button class="btn secondary block sm" id="v3d-fc-modelar" title="Editar a malha 3D deste objeto vértice a vértice, como no Blender">🔧 Modelar em 3D</button>`,
        wire: (elCartao) => elCartao.querySelector('#v3d-fc-modelar')?.addEventListener('click', () => {
          elCartao.remove();
          const alvo = (view3d._map.objects || []).find((o) => o.id === obj.id) || obj;
          // A malha do Modelador é montada (e só gravada ao aplicar) dentro de Modeler3D.enter — nada é semeado/salvo aqui.
          // Se estiver no modo "Ver através desta câmera", a câmera deve
          // permanecer na perspectiva da câmera selecionada, não orbital.
          window.Modeler3D?.enter(view3d, alvo, { enterOrbital: !(view3d._orbCamMode || view3d._fotoCamMode) });
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
      // [13/09/2026] NOVO — pedido verbatim: "Implemente um pipeline de
      // carregamento de modelo (ex. GLTFLoader do three.js) e um novo
      // campo no perfil tipo modeloArquivo [...] Para poder substituir os
      // modelos 3D por outros modelados em um programa de modelagem 3D."
      // Ver comentário grande em `js/model3dloader.js`/`js/engine3d.js`
      // `_buildModeloArquivoMesh` pro pipeline completo. Só aparece com
      // "🛠️ Modelar objetos" ligado (mesmo gate do botão "🔧 Modelar em
      // 3D" acima) — é uma ação de EDIÇÃO do objeto, mesmo espírito. Usa um
      // `<input type="file">` NATIVO (funciona normal em `file:///`, sem
      // nenhum plugin — é só um controle de formulário do próprio
      // navegador) escondido, clicado programaticamente pelo botão visível
      // (padrão comum pra estilizar o botão de escolher arquivo).
      modelarLigado && {
        id: 'importar-modelo-arquivo',
        html: `
          <button type="button" class="btn secondary block sm" id="v3d-fc-importar-modelo" style="margin-top:6px" title="Substitui a geometria 3D deste objeto por um arquivo .glb/.gltf modelado externamente (ex. Blender) — se remover o arquivo depois, volta pra geometria automática">📥 Importar modelo 3D (.glb)</button>
          <input type="file" id="v3d-fc-importar-modelo-input" accept=".glb,.gltf" style="display:none">
          ${obj.modeloArquivo ? `<button type="button" class="btn secondary block sm" id="v3d-fc-remover-modelo-arquivo" style="margin-top:6px" title="Volta este objeto pra geometria 3D automática (não apaga o arquivo importado — outros objetos podem estar usando o mesmo)">↩️ Usar geometria automática (remover "${Utils.escapeHtml(obj.modeloArquivo)}")</button>` : ''}
        `,
        wire: (elCartao) => {
          const input = elCartao.querySelector('#v3d-fc-importar-modelo-input');
          elCartao.querySelector('#v3d-fc-importar-modelo')?.addEventListener('click', () => input?.click());
          input?.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const alvo = (view3d._map.objects || []).find((o) => o.id === obj.id) || obj;
            try {
              Utils.toast?.(`Importando "${file.name}"…`, { duration: 2500 });
              const nome = await window.Model3DLoader.registerFromFile(file, file.name);
              Mapping.updateObject(view3d._map, alvo.id, { modeloArquivo: nome });
              await DB.saveMap(view3d._map);
              elCartao.remove();
              await view3d._rebuildScene();
              Utils.toast?.(`Modelo "${nome}" aplicado a este objeto.`, { type: 'success' });
            } catch (err) {
              // registerFromFile já persiste os bytes no IndexedDB mesmo
              // quando o parse falha (ver comentário grande no arquivo) —
              // então um erro aqui NÃO perde o arquivo, só não aplica ele
              // (o objeto continua na geometria automática de antes).
              console.error('[CardSystem/object] falha ao importar modelo 3D', err);
              Utils.toast?.(`Falha ao importar "${file.name}": ${err?.message || err} (geometria automática mantida)`, { type: 'danger', duration: 7000 });
            }
          });
          elCartao.querySelector('#v3d-fc-remover-modelo-arquivo')?.addEventListener('click', async () => {
            const alvo = (view3d._map.objects || []).find((o) => o.id === obj.id) || obj;
            Mapping.updateObject(view3d._map, alvo.id, { modeloArquivo: null });
            await DB.saveMap(view3d._map);
            elCartao.remove();
            await view3d._rebuildScene();
          });
        },
      },
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

    const html = `
      <div style="text-align:center; font-weight:700; margin-bottom:8px">${emoji} ${Utils.escapeHtml(label)}</div>
      ${botoesFinais.map((b) => b.html).join('\n')}
      ${botoesExtrasHtml}
      <button type="button" class="btn secondary block sm" id="v3d-obj-hist-toggle" style="margin-top:6px">📜 Histórico deste objeto${window.ObjectStandard?.indicadorHtml(obj) || ''}</button>
      <div id="v3d-obj-hist" class="hidden"></div>
      <button class="btn block sm" id="v3d-fc-close" style="margin-top:6px" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;

    const wire = (el) => {
      el.querySelector('#v3d-fc-close').onclick = () => el.remove();
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
    };

    return { html, wire };
  },
});
