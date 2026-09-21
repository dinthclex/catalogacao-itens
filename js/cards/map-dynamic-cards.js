/* js/cards/map-dynamic-cards.js
 * Cards extraídos de `js/mapview.js` -- os 9 templates innerHTML GRANDES
 * restantes que dependem de dados em tempo real (this.*, parametros do
 * metodo que os monta), pedido verbatim: "As insercoes de innerHTML devem
 * se tornar Cards" + "os maiores transforme em cards. E os menores deixe."
 * (os inferiores a ~1000 caracteres permaneceram como estavam).
 *
 * Diferente de `js/cards/map-panel-cards.js` (esqueletos 100% estaticos,
 * montados uma vez), estas funcoes sao chamadas TODA VEZ que o respectivo
 * elemento precisa ser (re)montado/re-renderizado -- por isso continuam
 * recebendo `this` (a instancia de MapView, via `.call(this, ...)` no
 * `mapview.js`) e os poucos parametros locais que o template usa e que nao
 * sao propriedade de `this` (identificados um a um, checando cada
 * `${...}` do bloco original antes de mover).
 *
 * `window.MapDynamicCards.<nome>` = funcao que devolve a string HTML.
 * `mapview.js` so faz `<alvo>.innerHTML = window.MapDynamicCards.<nome>.call(this, ...)`.
 */
window.MapDynamicCards = window.MapDynamicCards || {};

/** MapView._mountPlanta -- esqueleto principal da tela do Mapa 2D (toolbar
 *  lateral, canvas, drawer inferior; topbar/bottombar-mapa sao montados a
 *  parte, por _mountTopbarMapa/_mountBottombarMapa). Usa apenas `this.*`. */
window.MapDynamicCards.mountPlanta = function () {
  return `
      <div class="map2d-wrap">
        <canvas id="map-canvas"></canvas>
        <div class="map2d-toolsidebar" id="map-toolsidebar" title="Ferramentas de edição (estilo Paint.NET)">
          <div class="map-panel-head" id="map-toolsidebar-head">
            <span>🧰 Ferramentas</span>
            <button type="button" class="icon-btn sm map-panel-close" id="map-toolsidebar-close" title="Fechar barra de ferramentas">✕</button>
          </div>
          <div class="map2d-toolsidebar-grid">
            ${this.PTOOLS.map((t) => this._ptoolBtnHtml(t)).join('')}
            <!-- [14/09/2026 UTC] REMOVIDO — botões próprios de
                 "Adicionar orb"/"Objetos" (#map-mode-itens/#map-mode-objects).
                 Pedido verbatim: "Unifique os sistemas (sem considerar
                 compatibilidade com código legado) na janela 'Ferramenta'."
                 Agora 'itens'/'objects' são entradas de verdade em PTOOLS
                 (ver comentário grande lá) e já saem renderizadas pela linha
                 'this.PTOOLS.map(...)' logo acima — manter os <button>
                 hand-coded aqui criaria ids duplicados ('#ptool-itens'
                 convivendo com '#map-mode-itens', ambos representando a
                 mesma ferramenta). "🧊 Novo Cubo 3D" e "🔍 Buscar" também
                 saíram daqui (pedido verbatim: "retire... e coloque em
                 algum lugar no cabeçalho") — são ações de disparo único,
                 nunca deixam nenhum modo "selecionado" pra trás, então não
                 fazem sentido numa barra de FERRAMENTAS (ver
                 _currentToolInfo, que já os excluía do indicador por este
                 mesmo motivo) — movidos pro cabeçalho, cluster de botões
                 de #tbm-history/#map-cores/#map-layers/#map-grupos, ver
                 _mountTopbarMapa. -->
          </div>
        </div>
        <div class="map2d-modelabel" id="map-modelabel" title="Modo/ferramenta ativa no mapa agora"></div>
        <!-- NOVO (03/09/2026) — Pedido do usuário: "Coloque no mapa 2D, no
             canto inferior do mapa 2D, dois botões para poder girar toda a
             grade e o que está nela. Um botão... antihorário e o outro...
             horário. Um terceiro botão em cima dos dois deve fazer voltar a
             se orientar para o norte (deve ter o ícone de bússola com o
             norte destacado)." Canto inferior DIREITO (o esquerdo já é
             ocupado pelo .map2d-modelabel acima) — bússola em cima, os dois
             botões de giro lado a lado embaixo dela. Handlers em
             _giroMapa2DAntihorario/_giroMapa2DHorario/
             _giroMapa2DResetarNorte (mapview.js), só mutam
             Map2DRenderer.view.rot (o "funil" worldToScreen/screenToWorld
             cuida do resto — ver comentário grande no construtor de
             Map2DRenderer). -->
        <div class="map2d-rotatewidget" id="map-rotatewidget">
          <!-- NOVO (07/09/2026), pedido verbatim: "Deve ter um botão
               habilitador de snap para a rotação da grade do mapa 2D. Deve
               ficar no lado do botão 'norte' [...] (ficando 5 botões ali. O
               botão 'norte' continua no centro daquela bandeja na parte de
               cima dela. O novo botão deve ficar a sua direita)." Norte +
               este novo toggle agora formam a linha DE CIMA da bandeja
               (mesma classe '.map2d-rotate-row' da linha ↺/↻/arrastar logo
               abaixo, reaproveitada — os dois ficam centralizados como um
               par, "Norte" continua sendo o botão da esquerda/referência
               central de sempre). Ver _toggleMapRotationSnap/
               _mapRotationSnapAtivo. -->
          <div class="map2d-rotate-row">
            <button type="button" class="icon-btn sm map2d-rotate-north" id="map-rotate-north" title="Orientar para o norte (0°)">
              <!-- NOVO (07/09/2026), pedido verbatim: "Faça o desenho do
                   ícone de 'norte' ser maior na bandeja no canto inferior
                   direito da grade de modo que o círculo do seu ícone seja
                   quase todo o tamanho do botão." — só o width/height de
                   renderização do svg aumentado (18px -> 26px, o botão em
                   si tem 30px, ou 26px em telas menores — ver
                   .map2d-rotatewidget .icon-btn.sm no style.css); viewBox e
                   os paths internos (círculo já ocupa 20 dos 24 units do
                   viewBox) continuam intactos, só a escala final na tela. -->
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55"/>
                <path d="M12 4 L15 12 L12 12 Z" fill="#ff5a5f"/>
                <path d="M12 4 L9 12 L12 12 Z" fill="#ff5a5f"/>
                <path d="M12 12 L15 12 L12 20 Z" fill="currentColor" opacity="0.55"/>
                <path d="M12 12 L9 12 L12 20 Z" fill="currentColor" opacity="0.55"/>
                <circle cx="12" cy="12" r="1.3" fill="currentColor"/>
              </svg>
            </button>
            <button type="button" class="icon-btn sm" id="map-rotate-snap-toggle" title="Snap de rotação: liga/desliga o encaixe da rotação (botões ↺/↻ e 'Girar arrastando') no múltiplo de graus configurado — desligado, a rotação fica livre">🧲</button>
          </div>
          <div class="map2d-rotate-row">
            <button type="button" class="icon-btn sm" id="map-rotate-ccw" title="Girar a grade no sentido anti-horário">↺</button>
            <button type="button" class="icon-btn sm" id="map-rotate-cw" title="Girar a grade no sentido horário">↻</button>
            <!-- NOVO (07/09/2026), pedido verbatim: "Um outro botão deve ser
                 acrescentado ali. Quando clicado é possível girar o mapa com
                 o 'clicar e arrastar' orientado ao centro do mapa 2D." —
                 toggle (ver _toggleMapDragRotate/_mapDragRotateAtivo); os 2
                 botões ↺/↻ acima continuam preservados/inalterados. -->
            <button type="button" class="icon-btn sm" id="map-rotate-drag" title="Girar arrastando: ative e depois clique-e-arraste na grade — o mapa gira pela variação do arrasto em relação ao centro (uma cruz marca o centro de rotação enquanto ativo)">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3 a9 9 0 1 1 -7.79 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M3.2 3.2 v6 h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
        <!-- NOVO (07/09/2026) — cruz fixa no CENTRO da tela, só visível
             enquanto "🔄 Girar arrastando" (#map-rotate-drag acima) estiver
             ativo, pra identificar visualmente o centro de rotação (pedido
             verbatim: "A cruz pode aparecer no centro de rotação para
             melhor identificação"). Mesma técnica/posicionamento da cruz de
             vincular foto (ver _showPhotoPlacementCrosshair/
             .map-photo-placement-crosshair), cor própria pra não se
             confundir visualmente com aquela (não coexistem na prática, mas
             mantidas como elementos/classes distintos por clareza). Escondida
             por padrão (atributo "hidden") — ver _toggleMapDragRotate. -->
        <div class="map-rotate-center-crosshair" id="map-rotate-center-crosshair" hidden>
          <div class="map-rotate-center-crosshair-v"></div>
          <div class="map-rotate-center-crosshair-h"></div>
        </div>
        <!-- BUG CORRIGIDO (07/09/2026), pedido verbatim: "ao clicar em
             'Buscar', a retângulo azul claro da cena da minatura fica
             aparecendo na posição na tela do navegador em que a janelinha
             foi deixada. A miniatura fica ativa independente de qual aba do
             app está [...] O botão 'fechar' dela servirá para fechá-la,
             caso esteja em outra aba." — o painel "Miniatura 3D" NÃO nasce
             mais aqui dentro do HTML da Planta baixa (que é substituído por
             container.innerHTML='' toda vez que se sai do Mapa, ver
             App.navigate/_unmountPlanta) — ele virou um elemento PERSISTENTE
             de nível de app, criado 1 única vez em document.body por
             _ensureMinimap3DPanel() (ver mais abaixo), pra sobreviver a
             trocas de aba por padrão (comportamento agora INTENCIONAL, não
             mais um vazamento — ver _startMinimap3DLoop/_unmountPlanta
             e a nova opção "Fechar a miniatura 3D ao sair do Mapa" em
             Configurações do mapa, DESLIGADA por padrão). -->
        <!-- NOVO (03/09/2026) — Bandeja lateral expansível, pedido do
             usuário, EXPLICITAMENTE no mesmo modelo da bandeja de
             "Mapa"->"Foto" (ver ambientephotos.js .ambphotos-sidemenu-
             toggle/.ambphotos-sidemenu): botão transparente com seta no
             meio da lateral direita, expande um painel com as ferramentas
             que devem continuar acessíveis MESMO em "🧭 Modo Navegação" —
             "Retículo métrico" (3 botões: liga/desliga + os 2 modos de
             desenho), "Régua" e "Traço guia". Ver
             _toggleMap2DDrawer/_syncMap2DDrawerUI.
             REMOVIDO (03/09/2026), pedido verbatim: "No mapa 2D, no botão
             lateral direito expansível, sobre o botão 'Adicionar orb (de
             foto)', remova-o." — o botão "📍 Adicionar orb (de foto)" desta
             bandeja (atalho pra abrir 'Mapa'->'Foto') foi removido daqui; a
             ferramenta de orb de ITEM continua acessível normalmente pela
             janela "Ferramentas" (id="map-mode-itens", ver PTOOLS acima), e
             o fluxo de vincular FOTO ao mapa continua acessível de dentro de
             'Mapa'->'Foto' (botão "🗺️" de cada foto) — nada foi perdido,
             só este atalho específico da bandeja. -->
        <button type="button" class="ambphotos-sidemenu-toggle map2d-drawer-toggle" id="map2d-drawer-toggle" title="Mais ferramentas (disponíveis também em Modo Navegação)">◀</button>
        <!-- ATUALIZADO (05/09/2026), pedido verbatim: na bandeja do botão
             lateral direito expansível, todas as ferramentas devem estar
             ali para poderem ser marcadas ou não (também os botões do
             cabeçalho)... Os dois botões ('Réguas' e 'Exibir a grade')
             devem aparecer no botão lateral direito expansível. Gerada
             dinamicamente a partir de this.PTOOLS (grupo Ferramentas) e
             MapConfig.NAV_HEADER_BUTTONS (grupo Botões do cabeçalho),
             separados por um traço (.map2d-drawer-sep-groups) —
             visibilidade de cada botão controlada em
             _applyFerramentasNavVisiveis (⚙️ Configurações do mapa › 2D ›
             'Ferramentas visíveis em Modo Navegação'). 'Retículo métrico'
             continua um caso especial (3 botões: liga/desliga + os 2 modos
             de desenho, pedido explícito do usuário de rodada anterior). -->
        <div class="ambphotos-sidemenu map2d-drawer" id="map2d-drawer">
          <!-- "Retículo métrico": pedido explícito do usuário — "na verdade
               três botões: um quadrado maior... ativa e desativa a
               ferramenta, e os outros dois... uma segunda maneira de fazer
               o desenho" — o botão grande fica em cima, os 2 pequenos
               (arrastar/clique) embaixo, mesmo grupo visual. -->
          <button type="button" class="icon-btn map2d-drawer-btn" id="map2d-drawer-reticulo-toggle" title="Retículo métrico: liga/desliga a ferramenta — desenha um retângulo com grade de 1m x 1m, a partir do 1º ponto tocado (origem da grade). Funciona mesmo em Modo Navegação.">📐</button>
          <div class="map2d-drawer-subrow">
            <button type="button" class="icon-btn sm map2d-drawer-btn" id="map2d-drawer-reticulo-arrastar" title="Modo Arrastar: clica na origem, arrasta até o tamanho e solta">🖐️</button>
            <button type="button" class="icon-btn sm map2d-drawer-btn" id="map2d-drawer-reticulo-clique" title="Modo Clique/toque (2 toques): útil quando o arrastar por toque não estiver respondendo bem no celular">👆</button>
          </div>
          ${this.PTOOLS.filter((t) => t.id !== 'reticulo').map((t) => `
          <button type="button" class="icon-btn sm2 map2d-drawer-btn" id="map2d-drawer-tool-${t.id}" title="${(t.title || t.label).replace(/"/g, '&quot;')} Funciona mesmo em Modo Navegação.">${t.icon}</button>`).join('')}
          <div class="map2d-drawer-sep-groups"></div>
          ${(typeof MapConfig !== 'undefined' ? MapConfig.NAV_HEADER_BUTTONS : []).map((b) => b.chave === 'encaixar' ? `
          <!-- NOVO (05/09/2026), pedido verbatim: "sobre o 'encaixar', deve
               ser possível definir o seu valor de snap por ali também...
               expandir para a direita este botão para aparecer a entrada
               do valor de snap. Assim não fica ocupando mais espaço na
               bandeja e aparece só quando for selecionado." O campo
               (.map2d-drawer-encaixar-field) só aparece (max-width
               animado) enquanto "Encaixar" estiver LIGADO — ver
               _syncMap2DDrawerUI/_syncGridSnapField, que agora também
               sincroniza este campo (além do #tbm-gridsnap-val do
               cabeçalho). -->
          <div class="map2d-drawer-encaixar-wrap">
            <button type="button" class="icon-btn sm2 map2d-drawer-btn" id="map2d-drawer-hdr-encaixar" title="Encaixar (snap) na grade — toque pra ligar/desligar. Enquanto ligado, expande pra digitar a distância do encaixe.">🧲</button>
            <label class="map2d-drawer-encaixar-field" id="map2d-drawer-encaixar-field" title="Distância do snap na grade">
              <input type="number" id="map2d-drawer-gridsnap-val" step="0.5" min="0.1">
              <span id="map2d-drawer-gridsnap-unit">cm</span>
            </label>
          </div>` : `
          <button type="button" class="icon-btn sm2 map2d-drawer-btn" id="map2d-drawer-hdr-${b.chave}" title="${b.label} (mesmo botão do cabeçalho de cima).">${b.icon}</button>`).join('')}
        </div>
      </div>
    `;
};

/** MapView._mountTopbarMapa -- 4 linhas do cabecalho do Mapa 2D.
 *  `layersIcon` (SVG do botao "Camadas", 3 quadrados em cascata) continua
 *  calculado em mapview.js e passado aqui, por ser montado ali mesmo
 *  antes da chamada. */
window.MapDynamicCards.mountTopbarMapa = function (layersIcon) {
  return `
      <div class="topbar-mapa-row-wrap">
        <div class="topbar-mapa-row" id="tbm-row0">
          <button class="icon-btn sm" id="tbm-voltar-planta" title="Voltar para a tela inicial do Mapa (Planta baixa/Foto/Caixa)">← Voltar</button>
          <!-- Pedido do usuário (27/08/2026): "No mapa 2D, o nome do mapa deve
               ficar sendo exibido em algum lugar" — não aparecia em nenhum
               lugar DENTRO da Planta baixa (só na tela de entrada, ver
               _mountEntryScreen "🗺️ {nome} ▾"). Clicável, de propósito: abre
               o mesmo seletor de mapas da tela de entrada (_openMapSwitcherModal),
               então também dá pra trocar/renomear/criar sem precisar voltar. -->
          <button type="button" class="icon-btn sm" id="tbm-map-nome" title="Nome deste mapa — toque para trocar, renomear, excluir ou criar outro">🗺️ ${Utils.escapeHtml(this._displayName(this._map))}</button>
          <!-- Pedido do usuário (rodada 51): "O botão 'configurações 2D'
               deve ficar maior, do mesmo tamanho que o botão 'configurações
               3D'." — 3D usa só "icon-btn icon-btn-corner" (sem ".sm", ver
               view3d.js #v3d-config); tirado o "sm" daqui pra igualar. -->
          <button class="icon-btn icon-btn-corner" id="map-config" title="Configurações do mapa 2D">⚙️<span class="icon-btn-corner-badge">2D</span></button>
          <!-- "Ver em 3D" ao lado de "Configurações 2D" (pedido do usuário,
               rodada 51: "O botão 'Ver em 3D' deve ficar do lado do botão
               'configurações 2D'.") — antes existiam DUAS instâncias
               diferentes (uma no conjunto Navegação, outra no conjunto
               Desenho); consolidado numa única, aqui em #tbm-row0 (sempre
               visível, igual "Configurações 2D"), em vez de duplicado
               dentro de cada conjunto. -->
          <!-- BUG corrigido (pedido do usuário, rodada 52: "Os botões
               'configurações 2D' e 'Ver em 3D' devem ficar maiores. Não
               ficaram desde a última atualização.") — #map-config já tinha
               perdido a classe "sm" na rodada 51 (mesmo tamanho do 3D
               desde então), mas este botão, movido pra cá na MESMA rodada,
               nasceu já com "sm" por descuido — nunca tinha ficado do
               tamanho normal. Corrigido tirando o "sm" (mesma classe base
               "icon-btn" dos outros dois, sem herdar nada de menor). -->
          <button class="icon-btn" id="tbm-view3d-btn" title="Ver este ambiente em 3D, em primeira pessoa">🧊 Ver em 3D</button>
          <!-- [14/09/2026 UTC] REMOVIDO — pedido verbatim: "Parece que o
               botão 'Andar', agora, se chama 'Piso' (id='tbm-piso-select'),
               ele deve ser removido do projeto. Pois o botão 'Grupos' já
               cumpre esta função." O seletor "Piso: [Todos ▾]" (13/09/2026)
               filtrava o desenho da grade por andar (this._pisoFiltro, ver
               Map2DRenderer._pisoVisible); o painel "🏷️ Grupos" (ver
               _openGruposPanel) já tem sua PRÓPRIA filtragem por andar
               (map.andaresOcultos, checada em Mapping.isEntityGroupHidden)
               — as duas faziam essencialmente a mesma coisa por caminhos
               diferentes. O span do seletor e sua montagem
               (Map2DRenderer._syncPisoSeletor, chamada logo abaixo)
               removidos; this._pisoFiltro fica sempre null pra sempre
               (nunca mais setado por ninguém), então _pisoVisible continua
               funcionando normalmente — só a filtragem "Piso" (a antiga,
               redundante) nunca mais filtra nada, ficando só com a
               filtragem de andaresOcultos do "Grupos". -->
          <!-- (span removido — ver comentário acima) -->
          <!-- Alternador Desenho/Navegação (pedido do usuário: à direita de
               "Configurações 2D") — mora aqui em #tbm-row0, FORA dos dois
               conjuntos (Navegação/Desenho, ver logo abaixo), pra ficar
               visível o tempo todo em QUALQUER modo — senão, estando dentro
               de um dos dois conjuntos, ficaria inacessível sempre que o
               outro conjunto estivesse ativo (era exatamente esse o problema
               antes, quando morava só dentro do conjunto Desenho). -->
          <button class="icon-btn sm" id="map-navtoggle" title="Alterna entre modo Desenho (editar/mover/selecionar tudo no mapa) e modo Navegação (só mover e dar zoom na grade — nada no mapa responde a toque, útil pra só olhar em volta sem risco de mexer em algo sem querer)">🧭 Modo Navegação</button>
        </div>
      </div>
      <div class="topbar-mapa-set topbar-mapa-set-nav" id="tbm-set-nav">
        <div class="topbar-mapa-row-wrap">
        <div class="topbar-mapa-row topbar-mapa-row-lg">
          <!-- "🖼️ Fotos" removido daqui (pedido do usuário, rodada 51: "Em
               'Mapa'->'Planta baixa', remova o botão 'Fotos'."). "🧊 Ver em
               3D" mudou pra #tbm-row0, ao lado de "Configurações 2D" (ver
               comentário lá). "🗂️ Organizar" mudou pra tela "Mapa" (a de
               entrada, antes da Planta baixa — ver _mountEntryScreen),
               ao lado do seletor de mapas. -->
        </div>
        </div>
      </div>
      <div class="topbar-mapa-set topbar-mapa-set-desenho" id="tbm-set-desenho">
        <div class="topbar-mapa-row-wrap">
        <div class="topbar-mapa-row" id="tbm-row1">
          <!-- "🧊 Ver em 3D"/"🖼️ Fotos"/"🗂️ Organizar" removidos daqui
               (rodada 51) — ver comentário equivalente no conjunto
               Navegação, acima. -->
          <div class="topbar-mapa-sep"></div>
          <!-- Botões que moravam na linha 3 (recortar/copiar/colar/imagem/
               anular seleção, desfazer/refazer, grade/réguas/snap) — pedido
               do usuário: subiram pra esta linha, logo à direita da barra
               vertical que já separava "Organizar" do trio Histórico/
               Camadas/Ferramentas. A linha 3 (id="tbm-row3") deixou de
               existir; a barra de contexto da ferramenta atual (ex-linha 4)
               agora é a última linha do cabeçalho. -->
          <button class="icon-btn sm" id="tbm-cut" title="Recortar seleção (Ctrl+X)">✂️</button>
          <button class="icon-btn sm" id="tbm-copy" title="Copiar seleção (Ctrl+C)">📋</button>
          <button class="icon-btn sm" id="tbm-paste" title="Colar (Ctrl+V)">📄</button>
          <button class="icon-btn sm" id="tbm-image" title="Colar (Ctrl+V) ou carregar uma imagem do dispositivo — vira uma forma editável (alças de redimensionar/girar) na camada ativa. Também dá pra soltar/arrastar um arquivo de imagem direto na grade.">🖼️➕</button>
          <button class="icon-btn sm" id="tbm-deselect" title="Anular seleção">🚫</button>
          <div class="topbar-mapa-sep"></div>
          <button class="icon-btn sm" id="tbm-undo" title="Desfazer (Ctrl+Z)">↶</button>
          <button class="icon-btn sm" id="tbm-redo" title="Refazer (Ctrl+Y)">↷</button>
          <div class="topbar-mapa-sep"></div>
          <button class="icon-btn sm" id="tbm-grid" title="Exibir a grade (linhas de 1m tracejadas + subgrade de pontos de 10cm — sempre visível, se ajusta em passos de 10x conforme o zoom)">▦</button>
          <button class="icon-btn sm" id="tbm-rulers" title="Réguas">📐</button>
          <div class="topbar-mapa-sep"></div>
          <button class="icon-btn sm" id="tbm-gridsnap" title="Encaixar (snap) na grade: ao desenhar ou mover qualquer coisa na grade (parede, câmera, objeto, texto, forma...), a posição encaixa no múltiplo mais próximo da distância ao lado, em vez de ficar livre">🧲</button>
          <label class="tbm-gridsnap-field" title="Distância do snap na grade — distância real do mundo, mostrada na unidade escolhida ao lado do mapa (cm/m, polegadas ou pixels) — quanto maior, mais grosso o encaixe">
            <input type="number" id="tbm-gridsnap-val" step="0.5" min="0.1">
            <span id="tbm-gridsnap-unit">cm</span>
          </label>
          <div class="topbar-mapa-sep"></div>
          <!-- Histórico/Camadas/barra-de-ferramentas agrupados no canto
               superior direito (pedido do usuário) — margin-left:auto no
               grupo inteiro empurra tudo pra direita, ver
               _updateTopbarMapaState pro estado .active de cada um.
               O alternador Desenho/Navegação NÃO mora mais aqui embaixo do
               trio (pedido anterior) — mudou pra #tbm-row0, à direita de
               "Configurações 2D" (pedido do usuário mais recente, ver lá).
               "Ajuda" (❓) NÃO mora mais aqui (pedido do usuário, 31/08/2026)
               — mudou pro cabeçalho GLOBAL do app (#btn-ajuda-top, ao lado
               de "⚙️ Configurações"), já que seu conteúdo (Log de
               alterações/Sobre) não é específico do Mapa — ver index.html
               e app.js _wireNav. -->
          <div class="tbm-toggle-cluster" style="margin-left:auto">
            <div class="tbm-toggle-cluster-row">
              <button class="icon-btn sm" id="tbm-history" title="Histórico: lista de ações — desfazer/refazer ou pular direto pra um ponto dela">🕘</button>
              <button class="icon-btn sm" id="map-cores" title="Cores: contorno/preenchimento do(s) item(ns) selecionado(s) na grade, pelo seletor de cor padrão do navegador">${this._coresBtnIconSvg()}</button>
              <button class="icon-btn sm" id="map-layers" title="Camadas: organize paredes/câmeras/objetos/textos em grupos, com visibilidade e bloqueio próprios (itens do catálogo ficam de fora, sempre visíveis)">${layersIcon}</button>
              <button class="icon-btn sm" id="map-grupos" title="Grupos: ative/desative a renderização ou destaque visualmente todo objeto de uma mesma 'classe' de uma vez (igual ao atributo 'class' do HTML) — inclui também uma opção pra ocultar todas as paredes/piso de uma vez e um toggle por andar">🏷️</button>
              <!-- [14/09/2026 UTC] "🧊 Novo Cubo 3D"/"🔍 Buscar" mudaram pra
                   cá (cabeçalho) — pedido verbatim: "Como não são uma
                   ferramenta/modo de verdade, retire... de 'Ferramentas' e
                   coloque em algum lugar no cabeçalho." Onclick idêntico ao
                   de antes, só o id/local mudaram — ver wiring em mount(). -->
              <button class="icon-btn sm" id="tbm-newcube3d" title="Cria um cubo novo (editável no Modelador 3D — vértices/arestas/faces) direto no mapa e já abre a Visualização 3D pra esculpi-lo">🧊</button>
              <button class="icon-btn sm" id="tbm-search2d" title="Buscar patrimônio, objeto ou coordenada (x,y) e viajar até lá no mapa">🔍</button>
              <button class="icon-btn sm" id="tbm-toolsidebar" title="Mostrar/ocultar a barra lateral de ferramentas">🔨</button>
            </div>
          </div>
        </div>
        </div>
        <div class="topbar-mapa-row-wrap">
        <div class="topbar-mapa-row" id="tbm-row4">
          <button class="icon-btn sm" id="tbm-tool" title="Ferramenta atual — toque pra trocar">🖱️</button>
          <div class="topbar-mapa-sep"></div>
          <div class="map2d-toolctx in-topbar" id="map-toolctx"></div>
        </div>
        </div>
      </div>
    `;
};

/** MapView._mountBottombarMapa -- 1 linha do rodape do Mapa 2D (unidade/
 *  zoom%/coordenadas + controles de zoom). `zoomStepsPct` e a constante
 *  de modulo `ZOOM_STEPS_PCT` de mapview.js, passada explicitamente (nao
 *  e propriedade de `this`). */
window.MapDynamicCards.mountBottombarMapa = function (zoomStepsPct) {
  return `
      <div class="bottombar-mapa-row" id="bbm-row-main">
        <div class="bbm-row-left" id="bbm-row-left">
          <div class="bbm-unit-wrap" id="bbm-unit-wrap">
            <button type="button" class="bbm-field bbm-unit-btn" id="bbm-unit-btn" title="Unidade usada para exibir coordenadas/comprimento abaixo — clique para alternar entre pixels, polegadas e centímetros/metros"></button>
            <button type="button" class="bbm-unit-arrow" id="bbm-unit-arrow" title="Escolher a unidade diretamente numa lista">▾</button>
            <div class="bbm-unit-dropdown hidden" id="bbm-unit-dropdown"></div>
          </div>
          <span class="bbm-field bbm-coords-readout" id="bbm-coords-readout" title="Posição do cursor sobre a planta, na unidade escolhida ao lado">X: — Y: —</span>
          <!-- [13/09/2026 UTC] NOVO — pedido verbatim: "No mapa 2D, ao
               clicar com o 'Selecionar' em um objeto, na barra de rodapé da
               grade, ao lado de onde aparece 'X: [valor] Y: [valor]', deve
               aparecer o tipo de objeto e o seu nome." Escondido (mesmo
               padrão de #bbm-length-readout ao lado) quando não há NADA
               selecionado com a ferramenta "Selecionar" — ver
               _updateBottombarMapa, mais abaixo, quem escreve o texto e
               alterna o hidden. -->
          <span class="bbm-field bbm-selection-readout hidden" id="bbm-selection-readout" title="Tipo e nome do objeto selecionado com a ferramenta Selecionar">—</span>
          <span class="bbm-field bbm-length-readout hidden" id="bbm-length-readout" title="Comprimento do que está sendo desenhado agora (Lápis: comprimento total do traço; Reta/Curva: distância entre as pontas) — só aparece enquanto cabível">Comprimento: —</span>
        </div>
        <!-- NOVO (03/09/2026), pedido verbatim: reflow em 2 estágios por largura de tela
             (ver CSS @media em torno de #bbm-row-main/.bbm-row-nav) — "Ajustar a tela",
             "anterior"/"próximo" e "Itens:" separados do resto de .bbm-row-right (que fica só
             com os controles de zoom) num grupo PRÓPRIO (.bbm-row-nav), pra poder virar uma
             linha à parte no 2º estágio (tela ainda mais estreita) sem arrastar o zoom junto. -->
        <div class="bbm-row-nav" id="bbm-row-nav">
          <!-- [14/09/2026] MOVIDO — pedido verbatim: "No mapa 2D, coloque
               os botões 'Enquadrar mapa' e 'Ir para o personagem' à
               esquerda do botão de 100% (com id='bbm-zoom-100')." Os 2
               botões (#bbm-fit-elements/"⛶ Enquadrar mapa" e
               #bbm-goto-personagem/"🧍 Ir para o personagem") SAÍRAM deste
               grupo (.bbm-row-nav) e foram pra dentro de .bbm-row-right,
               logo antes de #bbm-zoom-100 — ver os 2 comentários grandes
               de cada um, agora lá embaixo, com o histórico completo. -->
          <button type="button" class="icon-btn sm" id="bbm-nav-prev" title="Ir para o elemento anterior da grade (centraliza a tela nele, sem mudar o zoom)">◀</button>
          <button type="button" class="icon-btn sm" id="bbm-nav-next" title="Ir para o próximo elemento da grade (centraliza a tela nele, sem mudar o zoom)">▶</button>
          <span class="bbm-field bbm-itemcount-readout" id="bbm-itemcount-readout" title="Quantidade de elementos navegáveis nesta planta baixa (parede/reta, câmera, objeto, texto, item do catálogo, foto) — a MESMA lista que ◀/▶ percorrem">Itens: <span id="bbm-itemcount-value">—</span></span>
          <!-- NOVO (06/09/2026), pedido verbatim: "Crie um botão de debug
               para o mapa 2D separado em sessão expansíveis, tudo deve
               aparecer ali, janelas, objetos, fotos, itens, tudo." — ver
               _toggleDebugWindow/_renderDebugWindow. Posicionado neste
               grupo (.bbm-row-nav, junto de ◀/▶/"Itens:") por ser o
               canto do rodapé com mais espaço sobrando e menos risco de
               atrapalhar botões existentes. -->
          <!-- NOVO (07/09/2026), pedido verbatim: "Coloque um botão, do lado
               esquerdo do botão de debug no rodapé da grade do mapa 2D, para
               dar toggle na miniatura 3D." — atalho rápido pra ligar/
               desligar a Miniatura 3D sem abrir "⚙️ Configurações do mapa"
               (checkbox #mc-miniatura3d, mapconfig.js, continua existindo e
               sincronizado com este botão nos dois sentidos — mesmo padrão
               já usado por #bbm-hud-btn/#st-hud, ver comentário grande no
               botão logo abaixo). Classe 'active' reflete o estado atual
               (!!this._minimapEngine, ver '_updateBottombarMapa', que já
               roda com frequência e agora também sincroniza este botão). -->
          <button type="button" class="icon-btn sm" id="bbm-minimap3d-btn" title="🧊 Mostrar/ocultar a miniatura 3D sobre a grade — mesma opção de '⚙️ Configurações do mapa › Miniatura 3D'. A janelinha pode ser arrastada clicando e segurando no título dela.">🧊</button>
          <button type="button" class="icon-btn sm" id="bbm-debug-btn" title="🐞 Depuração do mapa 2D — lista janelas/painéis, objetos, fotos e itens ativos agora, com posição de cada janela flutuante (útil pra achar uma janela 'perdida' fora da tela)">🐞</button>
          <!-- NOVO (07/09/2026), pedido verbatim: "Deve ter um botão de
               toggle para ele [o HUD] no rodapé, ao lado do 'debug'." — o
               HUD de performance (FPS/CPU~/RAM, ver js/perf.js) já tinha um
               liga/desliga em "⚙️ Configurações do app › 🗺️ Mapa, 3D e
               aparelho" (checkbox #st-hud, settings.js), mas nada aqui no
               rodapé do mapa — atalho mais rápido pra ligar/desligar sem
               sair da tela do mapa. Classe 'active' reflete o estado atual
               (ver função '_updateBottombarMapa', que já roda com
               frequência e agora também sincroniza este botão) — mesmo
               padrão visual de "ligado" já usado noutros toggles do app
               (ver CSS '.icon-btn.active'). -->
          <button type="button" class="icon-btn sm" id="bbm-hud-btn" title="📊 Mostrar/ocultar o HUD de performance (FPS/CPU~/RAM) — mesma opção de '⚙️ Configurações do app › 🗺️ Mapa, 3D e aparelho'. O HUD pode ser arrastado clicando e segurando nele.">📊</button>
        </div>
        <div class="bbm-row-right" id="bbm-row-right">
          <span class="bbm-field bbm-zoom-readout" id="bbm-zoom-readout" title="A que fração do tamanho físico real os objetos aparecem na tela neste zoom — 100% = uma régua encostada na tela mediria do mesmo tanto. Assume 96px/polegada (padrão da web, ≈38px/cm — mesma referência que o Paint.NET usa).">Zoom: <span id="bbm-zoom-value" title="Clique pra digitar um valor exato (número inteiro)">—</span></span>
          <!-- [13/09/2026] NOVO, [14/09/2026] CORRIGIDO (title + o próprio
               botão era outro, ver comentário no HTML de #bbm-fit-elements
               MOVIDO daqui em cima, .bbm-row-nav), [14/09/2026, RODADA
               SEGUINTE] MOVIDO — pedido verbatim: "No mapa 2D, coloque os
               botões 'Enquadrar mapa' e 'Ir para o personagem' à esquerda
               do botão de 100% (com id='bbm-zoom-100')." — este é o MESMO
               botão de sempre (#bbm-fit-elements, "⛶ Ajustar a
               tela"/"Enquadrar mapa" — ver _fitViewToAllElements), só
               reposicionado: antes ficava em .bbm-row-nav (junto de
               ◀/▶), agora entra em .bbm-row-right (junto do zoom),
               imediatamente antes de #bbm-zoom-100. -->
          <button type="button" class="icon-btn sm" id="bbm-fit-elements" title="Enquadrar mapa: ajusta a tela para cobrir do elemento mais distante de um lado até o mais distante do outro (cima/baixo e esquerda/direita) — útil quando há elementos pequenos difíceis de achar">⛶</button>
          <!-- [13/09/2026] NOVO, [14/09/2026] CORRIGIDO (zoom), [14/09/2026,
               RODADA SEGUINTE] MOVIDO — pedido verbatim (13/09): "Botão de
               'Ir para o personagem', centra na posição do personagem na
               grade com nível de zoom 0.8%."; pedido verbatim (14/09,
               esclarecendo o valor): "No botão 'Ir para o personagem', o
               zoom deve ser de 0,5% (meio por cento)."; pedido verbatim
               (14/09, rodada seguinte, reposicionando): "coloque os botões
               'Enquadrar mapa' e 'Ir para o personagem' à esquerda do
               botão de 100%." — zoom fixo em 0,5% de verdade (valor exato
               via zoomPctToViewZoom, mesmo padrão de
               _setZoomToPercentValue), centralizado na posição atual de
               this._personagem2D (o mesmo boneco sincronizado com a 1ª
               pessoa do 3D — ver comentário grande em _personagem2D,
               início do arquivo). Sem personagem ainda posicionado nesta
               grade (Modo Navegação nunca usado), não faz nada além de
               avisar — não existe posição nenhuma pra ir. Movido de
               .bbm-row-nav pra .bbm-row-right, logo antes de
               #bbm-zoom-100, junto com #bbm-fit-elements acima. -->
          <button type="button" class="icon-btn sm" id="bbm-goto-personagem" title="Ir para o personagem: centraliza a tela na posição atual do personagem, com zoom de 0,5%">🧍</button>
          <button type="button" class="icon-btn sm bbm-zoom-match" id="bbm-zoom-100" title="Ir para 100% de zoom (tamanho real)"></button>
          <button type="button" class="icon-btn sm" id="bbm-zoom-minus" title="Diminuir zoom (degrau anterior)">−</button>
          <input type="range" id="bbm-zoom-slider" min="0" max="${zoomStepsPct.length - 1}" step="1" value="15" title="Zoom (degraus fixos: ${zoomStepsPct.map((p) => `${p}%`).join(', ')})">
          <button type="button" class="icon-btn sm" id="bbm-zoom-plus" title="Aumentar zoom (próximo degrau)">+</button>
        </div>
      </div>
    `;
};

/** MapView._mountEntryScreen -- tela de entrada do Mapa (nome do mapa +
 *  contagem de fotos sem organizar). `unsorted` vem de
 *  `await PhotoGrid.getUnsorted()`, calculado em mapview.js antes da
 *  chamada (e assincrono, nao da pra recalcular aqui dentro). */
window.MapDynamicCards.mountEntryScreen = function (unsorted) {
  return `
      <div class="mapa-entry-wrap view-pad">
        <button type="button" class="btn secondary sm mapa-entry-switch" id="mapa-entry-switch" title="Trocar de mapa, criar um novo, renomear ou excluir">
          🗺️ ${Utils.escapeHtml(this._displayName(this._map))} <span aria-hidden="true">▾</span>
          <!-- Pedido do usuário (rodada 52): "Enquanto os arquivos estão
               sendo processados (os que vieram pelo botão de importação),
               no botão de lista de mapas em 'Mapa' deve aparecer um ícone
               com mensagem avisando que está carregando ainda." — objetos
               .obj importados (ver js/objimport.js: isBusy/onBusyChange);
               começa escondido, _wireObjImportBusyBadge abaixo liga/
               desliga a classe .visible ao vivo. -->
          <span class="mapa-entry-importing" id="mapa-entry-importing" title="Importando objeto(s) .obj em segundo plano...">⏳ importando objetos…</span>
        </button>
        <!-- "🗂️ Organizar" mudou pra cá (pedido do usuário, rodada 51:
             "Remova o botão 'Organizar' dali [Planta baixa] e coloque em
             'Mapa', ao lado do botão de seleção do mapa.") — antes vivia
             dentro da Planta baixa (ver #tbm-organize-btn/#map-organize,
             removidos de lá). MESMO método de sempre (_openOrganizeView). -->
        <button type="button" class="btn secondary sm" id="mapa-entry-organize" title="Ver como patrimônios/mapas/fotos/vínculos se relacionam, num desenho único">🗂️ Organizar</button>
        <button type="button" class="mapa-entry-caixa" id="mapa-entry-caixa" title="Itens e fotos ainda sem lugar definido no mapa">
          📦 Caixa <span class="badge mapa-entry-caixa-badge" id="mapa-entry-caixa-badge">${unsorted.total}</span>
        </button>
        <div class="mapa-entry-btns">
          <button type="button" class="mapa-entry-btn" id="mapa-entry-planta" title="Editar a planta baixa 2D: paredes, câmeras, objetos e itens posicionados">
            ${this._floorplanIconSvg()}
            <span>Planta baixa</span>
          </button>
          <!-- [15/09/2026 UTC] MUDADO — pedido verbatim: "Mudar nome do
               botão 'Foto' ('Mapa'->'Foto') para 'Fotos'. Preserve o
               ícone." Ícone (_photoIconSvg) intocado, só o texto. -->
          <button type="button" class="mapa-entry-btn" id="mapa-entry-foto" title="Ver todas as fotos do ambiente numa grade, com os orbs já marcados em cada uma">
            ${this._photoIconSvg()}
            <span>Fotos</span>
          </button>
        </div>
      </div>
    `;
};

/** MapView._updateToolCtx (ramo "Parede") -- barra de contexto da
 *  ferramenta Parede, no topbar-mapa. So usa `this.*`. */
window.MapDynamicCards.wallToolCtx = function () {
  return `
        <span class="map2d-toolctx-label">🧱 Parede</span>
        <span class="map2d-toolctx-info">${this._paredeStart ? `clique no 2º ponto para criar a parede — ângulo livre${this._shiftDown ? ', travado em 15° (Shift)' : ' (segure Shift pra travar em passos de 15°)'} (Esc cancela)` : 'clique no 1º ponto — encoste numa ponta ou no corpo de outra parede (✕) pra começar já conectada'}</span>
        <div class="topbar-mapa-sep"></div>
        <label class="map2d-toolctx-numfield" title="Espessura da parede sendo desenhada, em metros (afeta só paredes NOVAS — editar uma já colocada continua sendo pelo painel dela)">
          <span>Espessura (m)</span>
          <input type="number" step="0.01" min="0.02" max="0.6" id="toolctx-parede-esp" value="${this._paredeEspessura.toFixed(2)}">
        </label>
        <div class="topbar-mapa-sep"></div>
        <button type="button" class="icon-btn sm ${this._wallSnapEnabled ? 'active' : ''}" id="toolctx-parede-snap" title="Snap PRÓPRIO da parede: encaixa o ponto sendo posicionado na linha de centro de qualquer parede próxima (útil pra continuar alinhado numa parede transversal ao desenho)">🧲 Snap de parede</button>
        <label class="map2d-toolctx-numfield" title="Distância do snap de parede — distância real do mundo, na unidade escolhida ao lado do mapa (cm/m, polegadas ou pixels), igual ao 🧲 Snap na grade">
          <input type="number" id="toolctx-parede-snap-val" min="${this._gridSnapUnitInfo().min}" step="${this._gridSnapUnitInfo().step}" value="${this._gridSnapUnitInfo().toDisplay(this._wallSnapMeters)}">
          <span>${this._gridSnapUnitInfo().suffix}</span>
        </label>
        <button type="button" class="icon-btn sm" id="toolctx-parede-snap-align" title="Iguala a distância do snap de parede à do snap da grade (🧲 na linha 1) — útil quando a grade está desligada e só o snap de parede fica ativo, pra não ficarem desalinhados entre si">🔗 Alinhar</button>
      `;
};

/** MapView._renderScriptCodeEditor -- editor de codigo de um componente
 *  Script (folha cheia). `entity`/`comp` sao os mesmos parametros que
 *  `_renderScriptCodeEditor(overlay, entity, comp, salvar)` ja recebia;
 *  `fns` e recalculado aqui dentro exatamente como antes
 *  (`window.Components.extractFunctionNames(comp.code || '')`). */
window.MapDynamicCards.scriptCodeEditor = function (entity, comp) {
  const fns = window.Components.extractFunctionNames(comp.code || '');
  return `
      <div class="comp-code-head-sticky" style="position:sticky; top:0; z-index:1; background:#0a0d11">
        <div class="map-panel-head" style="padding:10px 12px">
          <b>📄 Código do Script — ${Utils.escapeHtml(entity.nome || '')}</b>
          <button type="button" class="icon-btn sm" id="comp-code-back" title="Voltar para a lista de componentes">⬅️</button>
        </div>
        <div class="comp-code-error-banner" id="comp-code-error-banner" data-comp-id="${comp.id}">${Utils.escapeHtml(this._scriptErrorBannerText(comp))}</div>
      </div>
      <div style="padding:12px; max-width:820px; margin:0 auto; display:flex; flex-direction:column; gap:8px">
        <textarea id="comp-code-textarea" class="comp-code-textarea" spellcheck="false" rows="26">${Utils.escapeHtml(comp.code || '')}</textarea>
        <div class="map2d-toolctx-info" id="comp-code-fns">${fns.length ? `Funções detectadas nesta folha: ${fns.map((f) => Utils.escapeHtml(f) + '()').join(', ')} — qualquer uma pode ser chamada por uma ação de Gatilho de Evento.` : 'Nenhuma função de nível superior detectada ainda (escreva "function NomeQualquer() { ... }").'}</div>
        <div class="map2d-toolctx-info">Variáveis já prontas no escopo: <code>obj</code> (o próprio objeto — aceita tanto <code>obj.color</code>/<code>obj.rotation</code>/<code>obj.width</code>/<code>obj.depth</code>/<code>obj.height</code>/<code>obj.name</code> em inglês quanto <code>obj.cor</code>/<code>obj.angulo</code>/<code>obj.largura</code>/<code>obj.profundidade</code>/<code>obj.altura</code>/<code>obj.nome</code> em português — são o MESMO campo), <code>SceneObjects</code>, <code>Scripting</code>, <code>map</code>, <code>THREE</code>, <code>Utils</code>, <code>view3d</code>. <code>Start()</code> roda uma vez antes do primeiro quadro; <code>Update()</code> roda a cada quadro — ambas automáticas, sem precisar de Gatilho de Evento.</div>
      </div>`;
};

/** MapView._openLayerPropertiesPanelImpl -- painel "Propriedades da
 *  camada". `l` e o objeto da camada (`this._map.layers.find(...)`),
 *  ja resolvido em mapview.js antes da chamada. */
window.MapDynamicCards.layerPropertiesPanel = function (l) {
  return `
      <div class="map2d-props-panel map-layerprops-modal" style="position:static; max-width:340px; width:90vw; max-height:85vh; overflow:auto;">
        <div class="map-panel-head"><b>⚙️ Propriedades da camada</b></div>
        <label class="map-panel-field"><span>Nome</span><input type="text" id="layerprops-nome" class="map-layerprops-nome" value="${Utils.escapeHtml(l.nome)}"></label>
        <label class="map-panel-field"><span>Visível</span><input type="checkbox" id="layerprops-visivel" ${l.visivel !== false ? 'checked' : ''}></label>
        <label class="map-panel-field"><span>Bloqueada</span><input type="checkbox" id="layerprops-bloqueada" ${l.bloqueada ? 'checked' : ''}></label>
        <label class="map-panel-field"><span>Opacidade</span>
          <input type="range" id="layerprops-opacidade" min="0" max="255" step="1" value="${l.opacidade ?? 255}" style="flex:1">
          <input type="number" id="layerprops-opacidade-num" min="0" max="255" step="1" value="${l.opacidade ?? 255}" style="width:4.4em">
        </label>
        <div class="map-panel-actions" style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
          <button type="button" class="btn secondary sm" id="layerprops-cancelar">Cancelar</button>
          <button type="button" class="btn sm" id="layerprops-ok">OK</button>
        </div>
      </div>
    `;
};

/** MapView._renderComponentsEditor -- folha cheia "Componentes" de um
 *  objeto/camera. `entity` e o mesmo parametro do metodo original;
 *  `templateOptionsHtml` e recalculado aqui dentro exatamente como antes
 *  (lista de modelos de script, `window.Components.SCRIPT_TEMPLATES`). */
window.MapDynamicCards.componentsEditor = function (entity, helpers) {
  const { comps, scriptBlockHtml, eventTriggerBlockHtml } = helpers;
  const templateOptionsHtml = window.Components.SCRIPT_TEMPLATES.map((t) => `<option value="${Utils.escapeHtml(t.id)}">${Utils.escapeHtml(t.label)}</option>`).join('');
  return `
      <div class="map-panel-head" style="position:sticky; top:0; background:#0a0d11; padding:10px 12px; z-index:1">
        <b>🧩 Componentes — ${Utils.escapeHtml(entity.nome || '')}</b>
        <button type="button" class="icon-btn sm" id="comp-editor-close" title="Fechar">✕</button>
      </div>
      <div style="padding:12px; max-width:640px; margin:0 auto; display:flex; flex-direction:column; gap:12px">
        ${comps.map((c) => c.type === 'Script' ? scriptBlockHtml(c) : (c.type === 'EventTrigger' ? eventTriggerBlockHtml(c) : '')).join('')}
        <div class="map-panel-actions" style="position:relative; flex-wrap:wrap">
          <label style="display:flex; align-items:center; gap:4px; font-size:12px">
            <span>Modelo:</span>
            <select id="comp-add-script-template">${templateOptionsHtml}</select>
          </label>
          <button type="button" class="btn sm" id="comp-add-script" title="Cria um Script com o modelo escolhido acima, fica na lista">➕ Adicionar componente Script</button>
          <button type="button" class="btn sm" id="comp-add-trigger">➕ Adicionar Gatilho de Evento</button>
        </div>
      </div>`;
};

/** MapView._renderCoresPanel -- painel "Cores". Recalcula, com `this`
 *  (via `.call(this)` em mapview.js), exatamente os mesmos locais que o
 *  metodo original calculava antes de montar o HTML. */
window.MapDynamicCards.coresPanel = function () {
  const refs = this._toolSelection.size ? this._collectSelectedRefs() : [];
  const temSelecao = refs.length > 0;
  const temForma = refs.some((r) => r.kind === 'object' && (r.ref.forma === 'retangulo' || r.ref.forma === 'poligono' || r.ref.forma === 'imagem'));
  const desabilitaContorno = temSelecao && !temForma;
  const primeiraForma = refs.find((r) => r.kind === 'object' && (r.ref.forma === 'retangulo' || r.ref.forma === 'poligono' || r.ref.forma === 'imagem'));
  const fillHex = temSelecao ? this._coresRefColorHex(refs[0].ref) : (this._coresLastFill || '#8a92a3');
  const strokeHex = primeiraForma ? (primeiraForma.ref.corContorno || primeiraForma.ref.cor || '#8a92a3') : (this._coresLastStroke || '#8a92a3');
  return `
      <div class="map-obj-picker-head map-panel-head map-colors-head"><b>🎨 Cores</b><button type="button" class="icon-btn sm map-panel-close map-colors-close" title="Fechar">✕</button></div>
      <div class="map-colors-body">
        ${!temSelecao ? `<p class="map-colors-empty">Nada selecionado — as cores abaixo valem só como padrão pras PRÓXIMAS formas desenhadas. Selecione algo (ferramenta 🖱️ Selecionar) pra editar a cor de itens já colocados.</p>` : ''}
        <label class="map-panel-field"><span>Preenchimento</span><input type="color" id="cores-fill" value="${fillHex}"></label>
        <label class="map-panel-field" title="${desabilitaContorno ? 'Nenhum item desenhável (retângulo/polígono/imagem — ex.: mesa/pilar/Formas) está selecionado, então o contorno não tem o que afetar na seleção — mas ainda vale como padrão pra próxima forma desenhada' : 'Cor do contorno — na seleção, só afeta formas desenháveis (retângulo/polígono/imagem: mesa, pilar, Formas); sempre vale também como padrão pra próxima forma desenhada'}">
          <span>Contorno</span><input type="color" id="cores-stroke" value="${strokeHex}">
        </label>
      </div>
    `;
};
