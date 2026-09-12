'use strict';
/* ==========================================================================
   VanishCam — ações de arquivo (novo/abrir/salvar/exportar), carregamento de
   imagens/projetos e o projeto de exemplo (foto real "exemplos/escada.jpg"
   com fallback para uma imagem sintética gerada por código).
   ========================================================================== */

/* --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO (mais recente primeiro)
   --------------------------------------------------------------------------
   Rodada 31 (2026-09-09): pedido do usuário — nova versão embutida do
     vanishCam (ver js/embed-api.js/README-embed.md). Aqui: exportCameraJSON()
     foi DIVIDIDA em 2 — buildCameraDataObject() (nova) monta e retorna só o
     OBJETO com os parâmetros da câmera (o que antes era a variável local
     `out`), sem baixar nada; exportCameraJSON() agora só chama essa função e
     cuida do download do .json (comportamento idêntico a antes para quem usa
     "Exportar > Parâmetros da câmera"). Motivo: a versão embutida precisa do
     MESMO objeto entregue direto em JS (vanishCamGetCamProps(), em
     embed-api.js), sem nenhum arquivo envolvido.
   Rodada 30 (2026-09-09): pedido do usuário — REMOVIDOS settings.
     manualPPShowThirdAxisLines e settings.manualPPThirdAxisLinesInfinite de
     resetProject()/serializeProject()/syncControlsFromState() (os elementos
     de index.html que sincronizavam não existem mais). loadProjectData()
     simplesmente ignora esses 2 campos quando presentes em arquivos salvos
     antes desta rodada — nenhuma migração necessária, pois
     axisLineExtension[3]/axisLineInfiniteExtension[3] (rodadas 28/29) já
     cobrem o mesmo papel com os mesmos defaults de sempre.
   Rodada 29 (2026-09-09): novo campo settings.axisLineInfiniteExtension (ver
     state.js) — SEGUNDO prolongamento por eixo, a partir da extremidade mais
     distante do ponto de fuga até a borda da tela, desligado por padrão nos 3
     eixos. Mesmo tratamento do axisLineExtension da rodada 28 em
     resetProject()/serializeProject()/loadProjectData() (default preservado
     para arquivos salvos antes desta rodada). syncControlsFromState() ganhou
     a chamada a updateAxisInfBtnsVisual() (novos botões .axisInfBtn em
     ui-controls.js/index.html).
   Rodada 28 (2026-09-09): novos campos settings.manualPPThirdAxisLinesInfinite
     e settings.axisLineExtension (ver state.js para o que cada um faz) —
     serializeProject()/loadProjectData() (arquivos salvos ANTES desta rodada
     não têm esses campos: caem nos padrões de sempre, comportamento igual ao
     de antes) e resetProject(). syncControlsFromState() ganhou a sincronização
     do novo checkbox #manualPPThirdAxisLinesInfinite e dos novos botões-ícone
     .axisExtBtn (1/2/3, fora de .vpMoveIconsRow, por isso fora dos loops
     genéricos já existentes) — ver updateAxisExtBtnsVisual()/
     updateDiagonalsToggleVisual() em ui-controls.js. #diagonalsEnabled
     (checkbox) virou #diagonalsEnabledBtn (botão-ícone) — sincronizado por
     updateDiagonalsToggleVisual() em vez de setar .checked diretamente aqui.
   Rodada 23 (2026-09-09): rebranding para VanishCam (pedido do usuário). Este
     app tinha seu PRÓPRIO formato de projeto salvo com a extensão ".fspy.json"
     e type:'fspy-web-project' — isso NUNCA foi o formato real/binário do fSpy
     original (esse é só o de exportCameraJSON(), ver comentário mais abaixo),
     era apenas o nome escolhido para o arquivo deste app antes do rebranding.
     Mudanças: (a) doSave() agora sugere/gera nomes com ".vanishcam.json"; (b)
     serializeProject() grava type:'vanishcam-project'; (c) loadProjectData()
     passa a aceitar tanto 'vanishcam-project' quanto o antigo 'fspy-web-project'
     como válidos, para que projetos salvos ANTES deste rebranding continuem
     abrindo normalmente; (d) loadImageFile() (troca de imagem sem projeto)
     também passa a sugerir ".vanishcam.json" como nome de arquivo; (e) os dados
     do projeto de exemplo embutido (buildEscadaProjectData()/
     buildSyntheticProjectData()) passam a usar o novo type/nome também. NADA
     que se refere ao fSpy ORIGINAL de verdade (Per Gantelius) foi alterado —
     axisTokenToFspyName(), o schema de exportCameraJSON() e os comentários que
     descrevem compatibilidade com esse formato real continuam iguais.
   Rodada 16 (2026-09-08): novo campo vpMove[eixo].distMode ('proportional'
     padrão) — os 2 lugares que constroem vpMove do zero (resetProject() e o
     fallback de projetos antigos em loadProjectData()) passaram a incluí-lo.
     Além disso, loadProjectData() ganhou uma normalização logo após montar
     `state`: se um arquivo salvo nas rodadas 11-15 já tem vpMove mas sem o
     subcampo distMode em algum eixo, ele é preenchido com 'proportional'
     (comportamento legado) — sem isso o botão 📏 ficaria com estado
     indefinido ao abrir um projeto salvo antes desta rodada.
   Rodada 15 (2026-09-08): novo sistema de desfazer/refazer (Ctrl+Z/Ctrl+Y,
     implementado em state.js — ver o histórico lá para o design completo)
     precisa de uma "linha de base" sempre que um projeto/imagem é carregado
     ou o app é resetado — sem isso o Ctrl+Z podia voltar para um estado de
     ANTES do carregamento (de uma sessão anterior) em vez de parar no estado
     recém-carregado. Adicionada a chamada resetUndoHistory() em 3 pontos:
     resetProject() (menu Novo), no finish() interno de loadProjectData()
     (abrir projeto — depois da imagem, se houver, já estar carregada em
     state.image) e em loadImageFile() (Abrir imagem), logo após
     centerImage(). loadSampleProject() não precisou de alteração própria:
     ela só monta os dados e chama loadProjectData(), que já cobre o caso.
   Rodada 14 (2026-09-08): (a) settings.mode padrão de vpMove{1,2,3} mudou de
     'translate' para 'anchor' nos 2 lugares que criam esse objeto aqui
     (resetProject() e o fallback de projetos antigos sem vpMove) — mesma
     mudança do valor inicial em state.js (pedido do usuário). (b) NOVO campo
     settings.shortcuts:{modifierKey} — a tecla modificadora dos atalhos
     (state.js/shortcuts, antes só salva em localStorage) agora também é
     salva DENTRO do arquivo de projeto .fspy.json (pedido explícito do
     usuário) e restaurada em loadProjectData(); ao carregar um arquivo SEM
     esse campo (rodadas anteriores), mantém o valor atual em memória (ex.:
     vindo do localStorage) em vez de forçar 'ctrl'.
   Rodada 13 (2026-09-08): syncControlsFromState() simplificado — os elementos
     #move3VP (checkbox) e #vp3LockBtn deixaram de existir com tratamento
     especial no HTML (o 3º eixo agora usa o mesmo grupo .vpMoveIconsRow dos
     eixos 1/2 — ver histórico de index.html/ui-controls.js desta rodada),
     então os 2 loops genéricos '.vpMoveBtn[data-action="move"/"lock"]' que já
     existiam aqui passaram a cobrir o eixo 3 também, sem precisar de linhas
     dedicadas para #move3VP/#vp3LockBtn.
   Rodada 11 (2026-09-08): settings.move3VPEnabled/vp3Lock (campos únicos do
     3º eixo) foram substituídos por settings.vpMove (objeto com as chaves
     '1','2','3', cada uma {enabled,mode,lock} — ver state.js), além dos novos
     settings.movePPFrom3VP e settings.manualPPShowThirdAxisLines. loadProjectData()
     lê arquivos antigos (sem vpMove) migrando move3VPEnabled/vp3Lock para
     vpMove['3'], para compatibilidade com projetos salvos na rodada 10.
     resetProject() e syncControlsFromState() atualizados para o novo formato
     (incluindo os botões-ícone .vpModeBtn/.vpMoveBtn dos eixos 1/2/3, via
     updateVpModeBtnsVisual() de ui-controls.js).
   Rodada 10 (2026-09-08): settings ganhou diagonalsEnabled/diagonalsColor,
     move3VPEnabled, vp3Lock, movableGrids, cornerGuideSelected, zoom/panX/panY
     — TODOS os novos estados da rodada (linhas diagonais, mover/travar o 3º
     ponto de fuga, "Pisos móveis", "Canto") e também o zoom/posição da
     imagem no viewport, que agora são salvos/restaurados (antes eram sempre
     resetados/recalculados via fitZoom() ao abrir um projeto — o usuário
     pediu explicitamente que isso passasse a ser guardado no arquivo).
   Rodada 9 (2026-09-07): adicionado este histórico de alterações (ver
     mesma nota em state.js). Sem mudança de comportamento.
   Rodada 8 (2026-09-07): exportCameraJSON() corrigido para exportar a
     posição da câmera (cameraTransform/viewTransform) já convertida pelo
     mesmo fator de sceneDisplayUnitFactor() (calibration.js) usado na
     leitura do painel direito — antes exportava sempre em metros, o que
     ficaria inconsistente com a leitura corrigida na mesma rodada (ver
     histórico de calibration.js para o detalhe do bug de escala).
   Rodada 7 (2026-09-07): (a) settings ganhou o campo showUnits (persistido
     no .fspy.json — novo toggle "Mostrar unidades"). (b) syncControlsFromState()
     passou a chamar refreshPPModeOptions() (definida em ui-controls.js) em
     vez de só ppModeDS.setValue() — necessário porque a cor da opção "3º
     ponto de fuga" do seletor de Ponto Principal depende dos eixos 1/2 do
     projeto que acabou de ser carregado.
   Rodada 6 (2026-09-06): (a) nova função shiftPointsToNewImageCenter() —
     usada por loadImageFile() quando já havia uma imagem carregada: desloca
     TODOS os pontos de controle (linhas, cantos do retângulo, ponto
     principal manual, origem do gizmo) pela diferença entre o centro da
     imagem antiga e o centro da nova, preservando a distância relativa ao
     ponto médio da imagem em vez de manter coordenadas absolutas — pedido
     explícito do usuário para quando a nova imagem tem tamanho diferente.
     (b) initDefaultControlPoints(): os 4 cantos do retângulo padrão agora
     vêm diretamente dos 4 pontos do par '1' (em vez de uma média entre os
     pares '1' e '2'), consistente com a nova regra de "o par 1 domina ao
     ligar o Modo retângulo" (ver ui-controls.js). (c) settings ganhou os
     campos handleRadius/lineThickness (persistidos no .fspy.json).
   Rodada 5 (2026-09-06): (a) JSON indentado: doSave() e exportCameraJSON()
     passaram a usar JSON.stringify(obj, null, 2) em vez de sem indentação —
     pedido do usuário para os arquivos salvos/exportados ficarem legíveis
     num editor de texto. (b) serializeProject() ganhou um comentário
     explicando cada campo salvo (pedido do usuário) — incluindo a resposta
     de que originPoint é o campo que guarda a posição do gizmo. (c)
     loadImageFile() passou a preservar todo o estado desenhado (linhas,
     retângulo, ponto principal, gizmo, distância de referência) ao trocar
     de imagem via "Abrir imagem" — antes resetava tudo para os padrões a
     cada troca; agora só reseta na primeiríssima imagem carregada (flag
     hadImage). (d) exportCameraJSON() reescrito para bater com o schema
     real do fSpy (principalPoint/viewTransform/cameraTransform/vanishing-
     Points/vanishingPointAxes/relativeFocalLength), a partir de um arquivo
     de exemplo real do fSpy fornecido pelo usuário. (e) exportProjectImage()
     corrigido para nunca redesenhar a imagem via canvas (usa sempre a URL/
     data URL original) — evitava um erro real de "tainted canvas" ao
     exportar a imagem do projeto de exemplo com foto real carregada de um
     arquivo file:// diferente. (f) buildEscadaProjectData() reescrita para
     usar as coordenadas REAIS e exatas da calibração manual que o próprio
     usuário fez no app (extraídas do arquivo exemplos/escada.fspy.json que
     ele enviou), em vez de estimativas proporcionais aproximadas.
   -------------------------------------------------------------------------- */

/* ------------------------------- Arquivo -------------------------------- */
async function doNew(){
  if(state.image){
    const res = await showModal('Abandonar projeto?',
      'Há alterações não salvas. Deseja realmente abandonar o projeto atual e começar um novo?',
      [{label:'Cancelar', value:'cancel'}, {label:'Abandonar', value:'ok', primary:true}]);
    if(res !== 'ok') return;
  }
  resetProject();
}

function resetProject(){
  state.image=null; state.imageEl=null; state.imageW=0; state.imageH=0; state.imageDataURL=null;
  state.fileName=null; state.dirty=false;
  state.zoom=1; state.panX=0; state.panY=0;
  state.diagonals = { enabled:false, color:'#ffffff' };
  state.vpMove = {
    1:{ enabled:false, mode:'anchor', distMode:'proportional', lock:{l1:[false,false], l2:[false,false]} },
    2:{ enabled:false, mode:'anchor', distMode:'proportional', lock:{l1:[false,false], l2:[false,false]} },
    3:{ enabled:false, mode:'anchor', distMode:'proportional', lock:{l1:[false,false], l2:[false,false]} },
  };
  state.movePPFrom3VP = false;
  // Rodada 30: manualPPShowThirdAxisLines/manualPPThirdAxisLinesInfinite REMOVIDOS (ver state.js).
  state.axisLineExtension = {1:true, 2:true, 3:true}; // rodada 28
  state.axisLineInfiniteExtension = {1:false, 2:false, 3:false}; // rodada 29
  state.movableGrids = { YZ:{offset:[0,0]}, XZ:{offset:[0,0]}, XY:{offset:[0,0]} };
  state.cornerGuide = { selected:null, iconDataURL:null };
  if(typeof setVpLockToolActive==='function'){ setVpLockToolActive(1,false); setVpLockToolActive(2,false); setVpLockToolActive(3,false); }
  const cornerBtn = document.getElementById('cornerGuideBtn');
  if(cornerBtn){ cornerBtn.style.backgroundImage=''; cornerBtn.textContent='🧊'; }
  document.getElementById('dropScreen').classList.remove('hidden');
  updateTitle();
  // Rodada 15: zera o histórico de desfazer/refazer (Ctrl+Z/Ctrl+Y) junto com o resto do estado —
  // sem isso, "Novo" deixaria o usuário desfazer de volta para um projeto que já não existe mais.
  if(typeof resetUndoHistory==='function') resetUndoHistory();
  render();
}

function doExit(){
  showModal('Sair', 'Fechar a aplicação? Você pode simplesmente fechar esta aba do navegador.', [{label:'OK', value:'ok', primary:true}])
    .then(()=>{ try{ window.close(); }catch(e){} });
}

function doSave(forceAs){
  if(!state.image){ return; }
  const shouldPrompt = forceAs || !state.fileName;
  let name = state.fileName || 'projeto.vanishcam.json';
  if(shouldPrompt){
    name = prompt('Salvar projeto como (nome do arquivo):', name) || null;
    if(!name) return;
    // Rodada 23: extensão própria do app renomeada para .vanishcam.json (era .fspy.json antes do
    // rebranding) — ".fspy"/".json" ainda são aceitos aqui como extensão já presente no nome
    // digitado pelo usuário (não força a troca de um nome que já termina em .fspy ou .json).
    if(!/\.(json|fspy|vanishcam)$/i.test(name)) name += '.vanishcam.json';
  }
  const data = serializeProject();
  // Indentado (2 espaços) para o arquivo .vanishcam.json ficar legível caso o usuário o abra num
  // editor de texto.
  downloadTextFile(name, JSON.stringify(data, null, 2));
  state.fileName = name; state.dirty = false; updateTitle();
}

// Estrutura do arquivo de projeto (.vanishcam.json — antes do rebranding da Rodada 23, .fspy.json)
// salvo/aberto por este app. Guarda TUDO que é necessário para reconstruir o projeto exatamente
// como estava: a imagem em si, todas as opções selecionáveis nos painéis esquerdo/direito, e a
// posição de cada elemento desenhável sobre a imagem (pares de linha dos pontos de fuga, cantos
// do modo retângulo, ponto principal manual, gizmo do mundo e distância de referência). Isso é
// DIFERENTE do JSON gerado por "Exportar > Parâmetros da câmera como JSON" (ver exportCameraJSON),
// que é só o resultado matemático da calibração, no formato do fSpy original — não serve para
// reabrir o projeto.
function serializeProject(){
  return {
    type:'vanishcam-project', // identifica o arquivo como um projeto deste app (obrigatório) —
                               // Rodada 23: era 'fspy-web-project' antes do rebranding; ver
                               // loadProjectData() logo abaixo, que ainda aceita o valor antigo
                               // ao ABRIR projetos salvos antes desta rodada.
    version:1,
    // Imagem do projeto, embutida como data URL (base64) — ou, no caso do projeto de exemplo
    // com a foto real, pode ser a própria URL relativa/local do arquivo de imagem.
    imageDataURL: state.imageDataURL,
    imageW: state.imageW, imageH: state.imageH, // dimensões da imagem, em pixels

    // Todas as opções configuráveis nos painéis esquerdo e direito.
    settings:{
      vpCount: state.vpCount,             // número de pontos de fuga usados: 1 ou 2
      axis1: state.axis1,                 // eixo do mundo atribuído ao ponto de fuga 1 ('x','-x','y','-y','z','-z')
      axis2: state.axis2,                 // eixo do mundo atribuído ao ponto de fuga 2 (ignorado se vpCount=1)
      oneVpFovDeg: state.oneVpFovDeg,      // campo de visão horizontal (graus), usado só no modo de 1 ponto de fuga
      refDistMode: state.refDistMode,      // eixo usado como "distância de referência": 'none','x','y' ou 'z'
      refDistValue: state.refDistValue,    // valor numérico da distância de referência, na unidade abaixo
      refDistUnit: state.refDistUnit,      // unidade do valor acima: 'none','mm','cm','m','km','in','ft','mi'
      ppMode: state.ppMode,                // como o ponto principal é definido: 'midpoint','manual' ou 'fromThirdVP'
      rectMode: state.rectMode,            // se true, os 2 pares de linha formam um retângulo com cantos ligados
      guide3d: state.guide3d,              // guia 3D exibida sobre a imagem: 'off','box','gridYZ','gridXZ','gridXY'
      darkenImage: state.darkenImage,      // se true, escurece a imagem para destacar os desenhos por cima
      fovUnit: state.fovUnit,              // unidade da leitura "Campo de Visão": 'deg' ou 'rad'
      orientMode: state.orientMode,        // formato da leitura "Orientação da câmera": 'axisDeg','axisRad' ou 'quat'
      ppUnit: state.ppUnit,                // unidade da leitura "Ponto Principal": 'abs' (pixels) ou 'rel' (0..1)
      focalEnabled: state.focalEnabled,    // se a seção "Distância Focal" está habilitada
      sensorW: state.sensorW, sensorH: state.sensorH, // dimensões do sensor da câmera, em mm
      cameraPresetKey: state.cameraPresetKey, // chave do preset de câmera selecionado (ver CAMERA_PRESETS)
      handleRadius: state.handleRadius,    // raio (px de tela) das bolinhas de extremidade das linhas: 0 a 11
      lineThickness: state.lineThickness,  // espessura (px de tela) das linhas dos pares de pontos de fuga
      showUnits: state.showUnits,          // se os valores do painel direito exibem sufixos de unidade

      // Linhas diagonais (canto-a-canto) sobre a imagem.
      diagonalsEnabled: state.diagonals.enabled,
      diagonalsColor: state.diagonals.color,
      // Mover/travar os pontos de fuga dos 3 eixos (eixos 1/2 indisponíveis com Modo retângulo
      // ativo na UI, mas o estado em si é salvo normalmente). Cada entrada: {enabled,mode,lock}.
      vpMove: state.vpMove,
      // Mover o ponto principal derivado dos 3 pontos de fuga (só usado com ppMode='fromThirdVP').
      movePPFrom3VP: state.movePPFrom3VP,
      // Rodada 30: manualPPShowThirdAxisLines/manualPPThirdAxisLinesInfinite REMOVIDOS (pedido do
      // usuário) — o par de linhas do 3º eixo em modo 'manual' agora é sempre mostrado, controlado
      // pelos mesmos axisLineExtension[3]/axisLineInfiniteExtension[3] abaixo.
      // Rodada 28: liga/desliga, por eixo (1, 2 e 3), o prolongamento fino até o ponto de fuga
      // desenhado por drawVpLinePair() (canvas-render.js) — ver state.js para o detalhe de cada um.
      axisLineExtension: state.axisLineExtension,
      // Rodada 29: liga/desliga, por eixo (1, 2 e 3), o SEGUNDO prolongamento — a partir da
      // extremidade mais distante do ponto de fuga, até a borda da tela (padrão: desligado).
      axisLineInfiniteExtension: state.axisLineInfiniteExtension,
      // Guia 3D "Pisos móveis": offset 2D de cada uma das 3 grades, dentro do seu próprio plano.
      movableGrids: state.movableGrids,
      // Guia 3D "Canto": qual dos 8 cantos do cubo está selecionado (sinais x/y/z), ou null.
      cornerGuideSelected: state.cornerGuide.selected,
      // Zoom e posição do pan no viewport — antes eram sempre resetados/recalculados ao abrir um
      // projeto (fitZoom()); agora ficam salvos para reabrir exatamente como estava.
      zoom: state.zoom, panX: state.panX, panY: state.panY,
      // Atalhos configuráveis do app (rodada 13: só localStorage; rodada 14: pedido do usuário
      // para também ficarem salvos DENTRO do projeto, não só no navegador — ver `shortcuts` em
      // state.js). Só a tecla modificadora por enquanto (é a única coisa configurável hoje).
      shortcuts: { modifierKey: shortcuts.modifierKey },
    },

    // Pontos de controle (em pixels de imagem) dos pares de linha de cada ponto de fuga.
    // axisPoints[1] e axisPoints[2] são os pares usados para calibrar (eixo 1 e eixo 2);
    // axisPoints[3] é o par auxiliar usado só quando ppMode='fromThirdVP'. Cada par tem duas
    // linhas (l1,l2), cada linha com 2 pontos [ [x,y], [x,y] ].
    axisPoints: state.axisPoints,
    // Cantos do "modo retângulo" (TL/TR/BL/BR, em pixels de imagem) — usados no lugar dos
    // axisPoints[1]/[2] quando rectMode está ativo (ver isRectActive()/getAxisLinePoints()).
    rectCorners: state.rectCorners,
    // Posição (pixels de imagem) do ponto principal quando ppMode='manual'.
    principalPointManual: state.principalPointManual,
    // Posição 2D (pixels de imagem) do GIZMO DO MUNDO sobre a imagem — o ponto a partir do
    // qual as 3 setas dos eixos x/y/z são desenhadas (o "ponto de origem" do mundo 3D).
    originPoint: state.originPoint,
    // Os 2 pontos que delimitam o segmento de "distância de referência", como parâmetros
    // escalares (t) ao longo do raio do eixo escolhido (ver getAxisRay()) — não são pontos
    // [x,y] soltos, e sim distâncias (em pixels de imagem) a partir de originPoint.
    refDistT: state.refDistT,
  };
}

function loadProjectData(data){
  // Rodada 23: aceita tanto o type novo ('vanishcam-project') quanto o antigo ('fspy-web-project',
  // usado antes do rebranding) — projetos salvos em versões anteriores do app continuam abrindo.
  if(!data || (data.type!=='vanishcam-project' && data.type!=='fspy-web-project')){ alert('Arquivo de projeto inválido.'); return; }
  const s = data.settings||{};
  // Se o arquivo já traz zoom salvo (rodada 10+), restauramos a posição/zoom exatos em vez de
  // recalcular com fitZoom() — arquivos mais antigos (sem esse campo) continuam usando fitZoom().
  const hasSavedView = s.zoom!=null;
  Object.assign(state,{
    vpCount:s.vpCount||2, axis1:s.axis1||'-x', axis2:s.axis2||'-z', oneVpFovDeg:s.oneVpFovDeg||50,
    refDistMode:s.refDistMode||'none', refDistValue:s.refDistValue!=null?s.refDistValue:0.2, refDistUnit:s.refDistUnit||'m',
    ppMode:s.ppMode||'midpoint', rectMode: s.rectMode!==false, guide3d:s.guide3d||'off', darkenImage: s.darkenImage!==false,
    fovUnit:s.fovUnit||'deg', orientMode:s.orientMode||'axisDeg', ppUnit:s.ppUnit||'abs',
    focalEnabled: s.focalEnabled!==false, sensorW:s.sensorW||36, sensorH:s.sensorH||24, cameraPresetKey:s.cameraPresetKey||'custom',
    handleRadius: s.handleRadius!=null? s.handleRadius:6, lineThickness: s.lineThickness!=null? s.lineThickness:2,
    showUnits: !!s.showUnits,
    diagonals: { enabled: !!s.diagonalsEnabled, color: s.diagonalsColor || '#ffffff' },
    // vpMove é a rodada 11; arquivos da rodada 10 só têm move3VPEnabled/vp3Lock (eixo 3 apenas) —
    // migramos esses campos legados para vpMove['3'] quando vpMove não existir no arquivo.
    vpMove: s.vpMove || {
      1:{ enabled:false, mode:'anchor', distMode:'proportional', lock:{l1:[false,false], l2:[false,false]} },
      2:{ enabled:false, mode:'anchor', distMode:'proportional', lock:{l1:[false,false], l2:[false,false]} },
      3:{ enabled: !!s.move3VPEnabled, mode:'anchor', distMode:'proportional', lock: s.vp3Lock || { l1:[false,false], l2:[false,false] } },
    },
    movePPFrom3VP: !!s.movePPFrom3VP,
    // Rodada 30: manualPPShowThirdAxisLines/manualPPThirdAxisLinesInfinite REMOVIDOS — arquivos
    // salvos ANTES desta rodada podem ter esses 2 campos no JSON, mas eles são simplesmente
    // ignorados aqui (não fazem mais parte de state{}); axisLineExtension[3]/
    // axisLineInfiniteExtension[3] abaixo já cobrem o mesmo papel, com os mesmos defaults de sempre.
    axisLineExtension: s.axisLineExtension || {1:true, 2:true, 3:true},
    // Rodada 29: mesmo tratamento — ausente em arquivos antigos, default desligado (false).
    axisLineInfiniteExtension: s.axisLineInfiniteExtension || {1:false, 2:false, 3:false},
    movableGrids: s.movableGrids || { YZ:{offset:[0,0]}, XZ:{offset:[0,0]}, XY:{offset:[0,0]} },
    cornerGuide: { selected: s.cornerGuideSelected || null, iconDataURL: null },
    zoom: hasSavedView ? s.zoom : state.zoom, panX: hasSavedView ? s.panX : state.panX, panY: hasSavedView ? s.panY : state.panY,
  });
  // Rodada 14: restaura a tecla modificadora dos atalhos salva NO PROJETO, se houver — arquivos
  // de rodadas anteriores não têm settings.shortcuts, então mantém o valor atual em memória
  // (ex.: o último usado neste navegador, via localStorage — ver state.js) em vez de forçar 'ctrl'.
  if(s.shortcuts && (s.shortcuts.modifierKey==='ctrl'||s.shortcuts.modifierKey==='alt'||s.shortcuts.modifierKey==='shift')){
    shortcuts.modifierKey = s.shortcuts.modifierKey;
    if(typeof saveShortcuts==='function') saveShortcuts();
  }
  // Rodada 16: arquivos de rodadas anteriores (<=15) não têm vpMove[eixo].distMode — garante o
  // padrão 'proportional' (comportamento legado) em cada eixo, para o botão 📏 refletir certo.
  [1,2,3].forEach(ax=>{
    if(state.vpMove[ax] && !state.vpMove[ax].distMode) state.vpMove[ax].distMode = 'proportional';
  });
  state.axisPoints = data.axisPoints || state.axisPoints;
  state.rectCorners = data.rectCorners || state.rectCorners;
  state.principalPointManual = data.principalPointManual || [0,0];
  state.originPoint = data.originPoint || [0,0];
  state.refDistT = data.refDistT || [40,90];
  syncControlsFromState();
  const finish = ()=>{
    document.getElementById('dropScreen').classList.add('hidden');
    state.dirty=false; state.fileName = data.__fileName || state.fileName; updateTitle();
    if(!hasSavedView) fitZoom();
    // Rodada 15: nova "linha de base" do histórico de desfazer/refazer — o estado recém-carregado
    // do arquivo passa a ser o ponto a partir do qual Ctrl+Z pode desfazer as próximas ações
    // (sem isso, um Ctrl+Z logo após abrir um projeto poderia voltar para o estado de ANTES dele
    // ter sido aberto, de uma sessão anterior).
    if(typeof resetUndoHistory==='function') resetUndoHistory();
    render();
  };
  if(data.imageDataURL){
    const img = new Image();
    img.onload = ()=>{ state.image=img; state.imageEl=img; state.imageDataURL=data.imageDataURL;
      state.imageW=img.naturalWidth; state.imageH=img.naturalHeight; finish(); };
    img.src = data.imageDataURL;
  } else { finish(); }
}

function syncControlsFromState(){
  // Rodada 14: reflete a tecla modificadora (possivelmente restaurada do PROJETO recém-aberto —
  // ver loadProjectData()) no seletor da janela "Atalhos", mesmo que ela não esteja aberta agora.
  const shortcutSel = document.getElementById('shortcutModifierSelect');
  if(shortcutSel) shortcutSel.value = shortcuts.modifierKey;
  vpCountDS.setValue(String(state.vpCount));
  axis1DS.setValue(state.axis1);
  axis2DS.setValue(state.axis2);
  document.getElementById('oneVpFov').value = state.oneVpFovDeg;
  document.getElementById('refDistMode').value = state.refDistMode;
  document.getElementById('refDistValue').value = state.refDistValue;
  document.getElementById('refDistUnit').value = state.refDistUnit;
  // Reconstrói (não só atualiza) o dotselect do ponto principal: a cor da opção "3º ponto de
  // fuga" depende dos eixos 1/2 recém-carregados (ver thirdAxisLetter()/refreshPPModeOptions()).
  refreshPPModeOptions();
  document.getElementById('rectMode').checked = state.rectMode;
  document.getElementById('guide3d').value = state.guide3d;
  document.getElementById('darkenImage').checked = state.darkenImage;
  document.getElementById('fovUnitSel').value = state.fovUnit;
  document.getElementById('orientMode').value = state.orientMode;
  document.getElementById('ppUnitSel').value = state.ppUnit;
  document.getElementById('focalEnabled').checked = state.focalEnabled;
  document.getElementById('sensorW').value = state.sensorW;
  document.getElementById('sensorH').value = state.sensorH;
  document.getElementById('cameraPreset').value = state.cameraPresetKey;
  document.getElementById('handleRadius').value = state.handleRadius;
  document.getElementById('handleRadiusVal').textContent = state.handleRadius;
  document.getElementById('lineThickness').value = state.lineThickness;
  document.getElementById('lineThicknessVal').textContent = state.lineThickness;
  document.getElementById('showUnits').checked = state.showUnits;
  // Rodada 28: #diagonalsEnabled (checkbox) virou #diagonalsEnabledBtn (botão-ícone retangular,
  // colorido conforme state.diagonals.color) — updateDiagonalsToggleVisual() (ui-controls.js)
  // reflete tanto o enabled quanto a cor de uma vez.
  if(typeof updateDiagonalsToggleVisual==='function') updateDiagonalsToggleVisual();
  document.getElementById('diagonalsColorBtn').style.background = state.diagonals.color;
  document.getElementById('diagonalsColorInput').value = state.diagonals.color;
  document.getElementById('movePPFrom3VP').checked = state.movePPFrom3VP;
  // Rodada 30: #manualPPShowThirdAxisLines/#manualPPThirdAxisLinesInfinite REMOVIDOS de index.html
  // (não existem mais como elementos) — nada a sincronizar aqui; os botões-ícone abaixo já cobrem
  // o papel de mostrar/prolongar as linhas do 3º eixo em modo Manual.
  // Rodada 28: botões-ícone "prolongamento até o vp" dos 3 eixos (fora de .vpMoveIconsRow —
  // ver index.html — por isso não cobertos pelos loops '.vpMoveBtn[data-action=...]' abaixo).
  if(typeof updateAxisExtBtnsVisual==='function'){ updateAxisExtBtnsVisual(1); updateAxisExtBtnsVisual(2); updateAxisExtBtnsVisual(3); }
  // Rodada 29: SEGUNDO botão-ícone por eixo ("prolongamento ao infinito", a partir da extremidade
  // mais distante do ponto de fuga) — mesmo padrão do de cima, ver updateAxisInfBtnsVisual()
  // em ui-controls.js.
  if(typeof updateAxisInfBtnsVisual==='function'){ updateAxisInfBtnsVisual(1); updateAxisInfBtnsVisual(2); updateAxisInfBtnsVisual(3); }
  // Rodada 13: #move3VP/#vp3LockBtn não existem mais como casos especiais — os 2 loops
  // genéricos abaixo ('.vpMoveBtn[data-action="move"/"lock"]') já cobrem o eixo 3 também.
  if(typeof setVpLockToolActive==='function'){ setVpLockToolActive(1,false); setVpLockToolActive(2,false); setVpLockToolActive(3,false); }
  document.querySelectorAll('.vpMoveBtn[data-action="move"]').forEach(btn=>{
    const axisIdx = parseInt(btn.dataset.axis, 10);
    btn.classList.toggle('active', state.vpMove[axisIdx].enabled);
  });
  document.querySelectorAll('.vpMoveBtn[data-action="lock"]').forEach(btn=>btn.classList.remove('active'));
  if(typeof updateVpModeBtnsVisual==='function'){ updateVpModeBtnsVisual(1); updateVpModeBtnsVisual(2); updateVpModeBtnsVisual(3); }
  // Rodada 16: idem para o botão auxiliar "proporcional/comprimento fixo" (distMode).
  if(typeof updateVpDistModeBtnsVisual==='function'){ updateVpDistModeBtnsVisual(1); updateVpDistModeBtnsVisual(2); updateVpDistModeBtnsVisual(3); }
  // Rodada 17: idem para o selo de quantidade travada no botão "Travar" de cada eixo.
  if(typeof updateVpLockBadge==='function'){ updateVpLockBadge(1); updateVpLockBadge(2); updateVpLockBadge(3); }
  // O ícone do botão "Canto" é uma FOTO gerada do cubo interativo (não persistida no arquivo de
  // projeto — ver state.cornerGuide.iconDataURL) — some após carregar um projeto até o usuário
  // reabrir o popup; a guia na imagem principal, porém, já usa o canto restaurado imediatamente.
  const cornerBtn = document.getElementById('cornerGuideBtn');
  if(cornerBtn){ cornerBtn.style.backgroundImage=''; cornerBtn.textContent='🧊'; }
  updateVisibilityRules();
}

function downloadTextFile(name, text){
  const blob = new Blob([text], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

// Converte um token de eixo ('x','-x','y', etc.) para o nome usado pelo fSpy original
// no JSON de parâmetros da câmera (ex.: 'x' -> 'xPositive', '-z' -> 'zNegative').
function axisTokenToFspyName(token){
  return axisLetter(token) + (axisSign(token)<0 ? 'Negative' : 'Positive');
}
// Coordenada normalizada usada pelo fSpy no JSON exportado: origem no CENTRO da imagem,
// escala = metade da LARGURA da imagem (mesmo divisor usado para x e y, e para o focal
// relativo) — confirmado batendo os valores do arquivo de exemplo real do fSpy.
function toRelativeCoord(px){
  const halfW = state.imageW/2;
  return { x:(px[0]-state.imageW/2)/halfW, y:(px[1]-state.imageH/2)/halfW };
}
// Monta as 4 linhas (row-major) de uma transformação homogênea a partir de uma rotação
// armazenada no nosso formato (array de 3 colunas) e um vetor de translação.
function buildTransformRows(rotColMajor, translation){
  const rm = M3.transpose(rotColMajor); // reinterpretação column-major -> row-major
  return [
    [rm[0][0], rm[0][1], rm[0][2], translation[0]],
    [rm[1][0], rm[1][1], rm[1][2], translation[1]],
    [rm[2][0], rm[2][1], rm[2][2], translation[2]],
    [0,0,0,1],
  ];
}

// Rodada 31 (2026-09-09): pedido do usuário — separado o MONTAR do objeto de dados da câmera (esta
// função) do ATO de baixar um arquivo .json (feito só em exportCameraJSON() abaixo, que agora
// chama esta função e só cuida do download). Motivo: a versão embutida do vanishCam
// (js/embed-api.js) precisa do MESMO objeto — na mesma forma exportada no .json de sempre — mas
// entregue direto em JS para o app hospedeiro (VanishCam.getCurrentCameraData()), sem nenhum
// arquivo envolvido ("usar as informações geradas diretamente sem a necessidade de guardar em
// arquivo", pedido do usuário). Retorna null se nada foi calibrado ainda (equivalente ao alerta de
// exportCameraJSON(), mas sem popup — quem decide o que fazer com null é quem chamou).
function buildCameraDataObject(){
  if(!state.calib) return null;
  const c = state.calib;
  const w = state.imageW, h = state.imageH;

  // Ordem dos eixos no JSON: os escolhidos pelo usuário primeiro (1, depois 2 se houver),
  // seguidos da(s) letra(s) restante(s), na ordem natural x,y,z — igual ao fSpy original.
  const chosen = state.vpCount===2 ? [axisLetter(state.axis1), axisLetter(state.axis2)] : [axisLetter(state.axis1)];
  const order = chosen.concat(['x','y','z'].filter(l=>!chosen.includes(l)));

  const vanishingPoints = [];
  const vanishingPointAxes = [];
  order.forEach(letter=>{
    const camVec = c.axisVec[letter]; // vetor cam-space do eixo "+letter", vindo da calibração
    let sign, vpCamVec;
    if(camVec[2] < 0){ sign='Positive'; vpCamVec=camVec; }
    else { sign='Negative'; vpCamVec=V3.neg(camVec); }
    const vpPx = [ c.pp[0] + c.f*vpCamVec[0]/(-vpCamVec[2]), c.pp[1] + c.f*vpCamVec[1]/(-vpCamVec[2]) ];
    vanishingPointAxes.push(letter+sign);
    vanishingPoints.push(toRelativeCoord(vpPx));
  });

  // c.camPos é sempre calculado em METROS internamente (ver computeCalibration()); convertemos
  // para a unidade escolhida em "Distância de referência" (ex.: cm) antes de exportar, para que
  // a posição no JSON bata com a mesma unidade mostrada na leitura "Posição da câmera" do
  // painel direito (ver sceneDisplayUnitFactor()).
  const posConv = sceneDisplayUnitFactor();
  const camPosOut = posConv!==1 ? V3.scale(c.camPos, 1/posConv) : c.camPos;
  const cameraTransformRows = buildTransformRows(c.R_cw, camPosOut);
  const viewTranslation = V3.neg(M3.mulVec(c.R_wc, camPosOut));
  const viewTransformRows = buildTransformRows(c.R_wc, viewTranslation);

  return {
    principalPoint: toRelativeCoord(c.pp),
    viewTransform: { rows: viewTransformRows },
    cameraTransform: { rows: cameraTransformRows },
    horizontalFieldOfView: c.fovH,
    verticalFieldOfView: c.fovV,
    vanishingPoints,
    vanishingPointAxes,
    relativeFocalLength: c.f/(w/2),
    imageWidth: w,
    imageHeight: h,
  };
}

function exportCameraJSON(){
  const out = buildCameraDataObject();
  if(!out){ alert('Nada calibrado ainda.'); return; }
  downloadTextFile((state.fileName||'camera').replace(/\.[^.]+$/,'')+'.json', JSON.stringify(out, null, 2));
}

// Exporta APENAS a imagem usada no projeto (sem os desenhos/overlays do canvas, sem o
// escurecimento) — a imagem original, tal como carregada. Usa sempre a própria URL/data URL
// original da imagem (nunca redesenha via canvas), para nunca esbarrar em "tainted canvas"
// quando a imagem vem de um arquivo local diferente sob file:// (ex.: exemplos/escada.jpg).
function exportProjectImage(){
  if(!state.image){ alert('Nenhuma imagem carregada.'); return; }
  const url = state.imageDataURL || state.image.src;
  let ext = 'png';
  const mm = /^data:image\/(\w+);/.exec(url);
  if(mm) ext = (mm[1]==='jpeg') ? 'jpg' : mm[1];
  else { const m2 = /\.([a-zA-Z0-9]+)(?:[?#]|$)/.exec(url); if(m2) ext = m2[1]; }
  const a = document.createElement('a');
  a.href = url; a.download = (state.fileName||'imagem').replace(/\.[^.]+$/,'') + '.' + ext;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* -------------------------- Carregar imagem/projeto ----------------------- */
document.getElementById('fileInputImage').addEventListener('change', (e)=>{
  const f = e.target.files[0]; if(f) loadImageFile(f); e.target.value='';
});
document.getElementById('fileInputProject').addEventListener('change', (e)=>{
  const f = e.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{ try{ const data = JSON.parse(reader.result); data.__fileName=f.name; loadProjectData(data); } catch(err){ alert('Erro ao abrir projeto: '+err.message); } };
  reader.readAsText(f);
  e.target.value='';
});

function loadImageFile(file){
  // Se já havia uma imagem carregada, "Abrir imagem" deve TROCAR só a imagem, preservando
  // tudo o que estiver desenhado por cima (pares de linha dos eixos, cantos do retângulo,
  // ponto principal manual, gizmo/origem, distância de referência) — só quando não havia
  // nenhuma imagem ainda (primeiro carregamento) é que usamos posições padrão genéricas.
  const hadImage = !!state.image;
  const oldW = state.imageW, oldH = state.imageH;
  const reader = new FileReader();
  reader.onload = ()=>{
    const img = new Image();
    img.onload = ()=>{
      const newW = img.naturalWidth, newH = img.naturalHeight;
      if(hadImage) shiftPointsToNewImageCenter(oldW, oldH, newW, newH);
      state.image = img; state.imageEl = img; state.imageDataURL = reader.result;
      state.imageW = newW; state.imageH = newH;
      if(!hadImage) initDefaultControlPoints();
      document.getElementById('dropScreen').classList.add('hidden');
      state.fileName = file.name.replace(/\.[^.]+$/, '') + '.vanishcam.json'; // Rodada 23: era .fspy.json
      state.dirty = true; updateTitle();
      // Apenas centraliza a imagem, sem alterar o nível de zoom atual.
      centerImage();
      // Rodada 15: nova imagem carregada = nova linha de base do histórico de desfazer/refazer.
      if(typeof resetUndoHistory==='function') resetUndoHistory();
      render();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// Ao trocar de imagem via "Abrir imagem" preservando os desenhos existentes (ver acima), a
// NOVA imagem é carregada "no ponto médio da imagem antiga": todo ponto de controle (pontas das
// linhas de eixo, cantos do retângulo, ponto principal manual, origem do gizmo) é deslocado pela
// diferença entre o centro da imagem antiga e o centro da nova imagem — preservando a distância
// relativa de cada elemento ao ponto médio da imagem, em vez de manter as mesmas coordenadas
// absolutas em pixel (que só fariam sentido se a nova imagem tivesse exatamente o mesmo
// tamanho da anterior). Sem efeito quando as duas imagens têm o mesmo tamanho (delta = 0,0).
function shiftPointsToNewImageCenter(oldW, oldH, newW, newH){
  const dx = newW/2 - oldW/2, dy = newH/2 - oldH/2;
  if(dx===0 && dy===0) return;
  const shift = (p)=>[p[0]+dx, p[1]+dy];
  [1,2,3].forEach(idx=>{
    const ap = state.axisPoints[idx];
    ap.l1 = [shift(ap.l1[0]), shift(ap.l1[1])];
    ap.l2 = [shift(ap.l2[0]), shift(ap.l2[1])];
  });
  Object.keys(state.rectCorners).forEach(k=>{ state.rectCorners[k] = shift(state.rectCorners[k]); });
  state.principalPointManual = shift(state.principalPointManual);
  state.originPoint = shift(state.originPoint);
  // refDistT são distâncias ESCALARES ao longo do raio do eixo (não pontos [x,y] soltos) — não
  // fazem sentido deslocar por um delta de posição; permanecem como estão.
}

function initDefaultControlPoints(){
  const w = state.imageW, h = state.imageH;
  const mx = w/2, my = h/2;
  const dx = w*0.28, dy = h*0.22;
  // Eixo 1 (padrão '-x'): par de linhas mais na HORIZONTAL.
  state.axisPoints[1].l1 = [[mx-dx*1.05, my+dy*0.55], [mx+dx*0.9, my+dy*0.85]];
  state.axisPoints[1].l2 = [[mx-dx*0.9, my-dy*0.85], [mx+dx*1.05, my-dy*0.5]];
  // Eixo 2 (padrão '-z'): par de linhas mais na VERTICAL, convergindo para cima.
  state.axisPoints[2].l1 = [[mx-dx, my-dy*0.2],[mx-dx*0.35, my-dy*1.3]];
  state.axisPoints[2].l2 = [[mx+dx*0.2, my+dy*1.1],[mx+dx*0.85, my-dy*0.6]];
  state.principalPointManual = [mx, my];
  state.originPoint = [mx, my*1.15 > h ? my : my+ h*0.05];
  state.axisPoints[3].l1 = [[w*0.08,h*0.12],[w*0.42,h*0.4]];
  state.axisPoints[3].l2 = [[w*0.92,h*0.1],[w*0.62,h*0.42]];
  // O par de linhas '1' é quem define os 4 cantos do retângulo (o par '2' "se encaixa" neles —
  // ver o listener de 'rectMode' em ui-controls.js para a mesma regra ao ligar o modo).
  state.rectCorners = {
    TL: state.axisPoints[1].l1[0].slice(),
    TR: state.axisPoints[1].l1[1].slice(),
    BL: state.axisPoints[1].l2[0].slice(),
    BR: state.axisPoints[1].l2[1].slice(),
  };
  state.refDistT = [Math.max(20,w*0.03), Math.max(40,w*0.07)];
}

/* --------------------------- Projeto de exemplo --------------------------- */
function buildSampleImage(){
  // Gera sinteticamente uma "sala" em perspectiva de 2 pontos de fuga, sem depender de rede.
  // Usado como último recurso, caso "exemplos/escada.jpg" não possa ser carregada.
  const w=1200,h=800;
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfd8dc'; ctx.fillRect(0,0,w,h);
  // chão
  const vpL=[-400,320], vpR=[1600,300];
  ctx.fillStyle = '#a1887f';
  ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(w,h); ctx.lineTo(vpR[0],vpR[1]); ctx.lineTo(vpL[0],vpL[1]); ctx.closePath(); ctx.fill();
  // parede
  ctx.fillStyle = '#eceff1';
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,0); ctx.lineTo(vpR[0],vpR[1]); ctx.lineTo(vpL[0],vpL[1]); ctx.closePath(); ctx.fill();
  // caixa (cubo) em perspectiva simples
  ctx.strokeStyle = '#37474f'; ctx.lineWidth=3;
  function lineTo(p1,p2){ ctx.beginPath(); ctx.moveTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.stroke(); }
  const boxFrontTL=[430,420], boxFrontTR=[760,430], boxFrontBR=[760,650], boxFrontBL=[430,640];
  lineTo(boxFrontTL,boxFrontTR); lineTo(boxFrontTR,boxFrontBR); lineTo(boxFrontBR,boxFrontBL); lineTo(boxFrontBL,boxFrontTL);
  function towards(p, vp, t){ return [p[0]+(vp[0]-p[0])*t, p[1]+(vp[1]-p[1])*t]; }
  const t=0.22;
  const boxBackTL=towards(boxFrontTL, vpR, t), boxBackTR=towards(boxFrontTR, vpR, t);
  const boxBackBR=towards(boxFrontBR, vpR, t), boxBackBL=towards(boxFrontBL, vpR, t);
  lineTo(boxBackTL,boxBackTR); lineTo(boxBackTR,boxBackBR); lineTo(boxBackBR,boxBackBL); lineTo(boxBackBL,boxBackTL);
  lineTo(boxFrontTL,boxBackTL); lineTo(boxFrontTR,boxBackTR); lineTo(boxFrontBR,boxBackBR); lineTo(boxFrontBL,boxBackBL);
  ctx.fillStyle='rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.moveTo(...boxFrontTL); ctx.lineTo(...boxFrontTR); ctx.lineTo(...boxFrontBR); ctx.lineTo(...boxFrontBL); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#455a64'; ctx.font='24px sans-serif';
  ctx.fillText('Imagem de exemplo gerada localmente (sem internet)', 30, 40);
  return c.toDataURL('image/png');
}

// O projeto de exemplo é montado como um objeto com a MESMA estrutura de arquivo usada por
// qualquer projeto salvo/aberto (ver serializeProject()/loadProjectData()) — a imagem entra
// como dado (data URL) dentro do próprio objeto — e é carregado através do mesmo caminho de
// código de "Abrir" (loadProjectData), garantindo que tudo que é selecionável nos painéis, a
// posição dos pares de linha, do gizmo do mundo e da distância de referência fiquem definidos
// de forma consistente com qualquer outro projeto.
function baseSampleSettings(overrides){
  return Object.assign({
    vpCount:2, axis1:'-x', axis2:'-z', oneVpFovDeg:50,
    refDistMode:'none', refDistValue:0.2, refDistUnit:'m',
    ppMode:'midpoint', rectMode:true, guide3d:'off', darkenImage:true,
    fovUnit:'deg', orientMode:'axisDeg', ppUnit:'abs',
    focalEnabled:true, sensorW:36, sensorH:24, cameraPresetKey:'custom',
    handleRadius:6, lineThickness:2, showUnits:false,
  }, overrides||{});
}

// Projeto de exemplo baseado na foto real "exemplos/escada.jpg". As coordenadas abaixo NÃO são
// estimativas: são a calibração real, feita manualmente pelo usuário nesta mesma aplicação, do
// arquivo "exemplos/escada.fspy.json" (imagem original 5184x3456). Os valores são expressos como
// frações de w/h (em vez de pixels absolutos fixos) para continuarem proporcionalmente corretos
// caso a foto "escada.jpg" seja substituída por outra versão com dimensões diferentes.
function buildEscadaProjectData(imageSrc, w, h){
  const REF_W = 5184, REF_H = 3456; // dimensões da foto original usada nesta calibração
  const fx = w/REF_W, fy = h/REF_H;
  const P = (x,y)=>[x*fx, y*fy];
  const axisPoints = {
    1:{ l1:[P(1067.9039999999998,2146.176), P(3898.3680000000004,2374.272)],
        l2:[P(1285.6319999999998,1081.728), P(4116.0960000000005,1347.84)] },
    2:{ l1:[P(1140.4799999999998,1575.936), P(2083.968,739.584)],
        l2:[P(2882.304,2564.352), P(3825.7920000000004,1271.808)] },
    3:{ l1:[P(414.72,414.71999999999997), P(2177.2799999999997,1382.4)],
        l2:[P(4769.280000000001,345.6), P(3214.08,1451.52)] },
  };
  const rectCorners = {
    TL:P(1104.1919999999998,1861.056), TR:P(3390.3360000000002,2469.312),
    BL:P(1684.7999999999997,910.656), BR:P(3970.9440000000004,1309.824),
  };
  return {
    type:'vanishcam-project', version:1,
    imageDataURL: imageSrc, imageW:w, imageH:h,
    settings: baseSampleSettings(),
    axisPoints,
    rectCorners,
    principalPointManual: P(2592,1728),
    originPoint: P(2592,1900.8),
    refDistT: [155.51999999999998*fx, 362.88000000000005*fx],
    __fileName:'exemplo.vanishcam.json', // Rodada 23: era exemplo.fspy.json
  };
}

// Projeto de exemplo com a imagem sintética gerada por código (fallback, sem depender de
// internet nem do arquivo real) — mantém a disposição de linhas já testada da rodada anterior.
function buildSyntheticProjectData(dataURL, w, h){
  return {
    type:'vanishcam-project', version:1,
    imageDataURL: dataURL, imageW:w, imageH:h,
    settings: baseSampleSettings({ axis1:'y', axis2:'x', refDistMode:'x', refDistValue:1.5 }),
    axisPoints:{
      1:{ l1:[[430,420],[451.7,420-230*0.22]], l2:[[760,430],[760+ (1600-760)*0.22, 430+(300-430)*0.22]] },
      2:{ l1:[[50,700],[515,580]], l2:[[50,150],[515,195]] },
      3:{ l1:[[w*0.06,h*0.08],[w*0.35,h*0.32]], l2:[[w*0.95,h*0.05],[w*0.68,h*0.30]] },
    },
    rectCorners:{
      TL: avgPt([430,420],[50,700]),
      TR: avgPt([451.7,420-230*0.22],[50,150]),
      BL: avgPt([760,430],[515,580]),
      BR: avgPt([760+(1600-760)*0.22,430+(300-430)*0.22],[515,195]),
    },
    principalPointManual:[w/2,h/2],
    originPoint:[595,535],
    refDistT:[70,170],
    __fileName:'exemplo.vanishcam.json', // Rodada 23: era exemplo.fspy.json
  };
}

function loadSampleProject(){
  // Tenta primeiro carregar a foto real da pasta de exemplos. Se não existir ou não puder
  // ser carregada (aberto via file:// sem a imagem ter sido colocada lá, erro de rede, etc.),
  // cai automaticamente para a imagem de exemplo gerada por código (sem depender de internet).
  const realImg = new Image();
  realImg.onload = ()=>{
    const data = buildEscadaProjectData(realImg.src, realImg.naturalWidth, realImg.naturalHeight);
    loadProjectData(data);
  };
  realImg.onerror = ()=>{
    const dataURL = buildSampleImage();
    const probe = new Image();
    probe.onload = ()=>{
      const data = buildSyntheticProjectData(dataURL, probe.naturalWidth, probe.naturalHeight);
      loadProjectData(data);
    };
    probe.src = dataURL;
  };
  realImg.src = 'exemplos/escada.jpg';
}
document.getElementById('loadSampleBtn').addEventListener('click', loadSampleProject);

/* ============================ Drag & drop ================================ */
const dropScreen = document.getElementById('dropScreen');
const viewportWrap = document.getElementById('viewportWrap');
['dragenter','dragover'].forEach(ev=>viewportWrap.addEventListener(ev, (e)=>{
  e.preventDefault(); if(!state.image) dropScreen.classList.add('dragover');
}));
['dragleave','drop'].forEach(ev=>viewportWrap.addEventListener(ev, (e)=>{
  e.preventDefault(); dropScreen.classList.remove('dragover');
}));
viewportWrap.addEventListener('drop', (e)=>{
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if(f && f.type.startsWith('image/')) loadImageFile(f);
});
