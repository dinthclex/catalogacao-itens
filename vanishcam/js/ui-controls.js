'use strict';
/* ==========================================================================
   VanishCam — menu, modal, dropdowns customizados (dotselect) e todos os
   listeners dos painéis esquerdo e direito.
   ========================================================================== */

/* --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO (mais recente primeiro)
   --------------------------------------------------------------------------
   Rodada 33 (2026-09-09): AJUSTE — pedido do usuário: tanto o vanishCam
     quanto o app hospedeiro rodam abertos direto como file:///, onde
     fetch() para outro arquivo local falha. O listener de
     #downloadEmbedZipBtn (rodada 32) precisa de fetch() para ler o
     CONTEÚDO de cada arquivo (não só carregá-lo, como um <script>) — não dá
     pra evitar isso, então agora ele detecta location.protocol==='file:' e
     mostra um alert() explicando a limitação e a alternativa (copiar a
     pasta manualmente), em vez de falhar com um erro técnico. Ver também
     Rodada 33 em js/embed-api.js, que resolveu o mesmo tipo de problema
     para vanishCamMount() (esse sim sem precisar de fetch).
   Rodada 32 (2026-09-09): pedido do usuário — não queria manter o arquivo
     vanishcam-embed.zip ESTÁTICO dentro da pasta do projeto (só duplicava os
     arquivos que já estão na pasta, e desatualizava a cada rodada). Novo
     listener de #downloadEmbedZipBtn (janela Sobre) que MONTA o .zip no
     navegador na hora do clique — busca (fetch) os arquivos atuais via
     vanishCamFileList()/vanishCamBasePath() (js/embed-api.js) e empacota com
     buildZipStore() (js/zip-lite.js, arquivo novo desta rodada). Ver também
     index.html (botão no lugar do antigo link <a download>, novo
     <script src="js/zip-lite.js">) e embed-api.js (funções novas expostas).
   Rodada 30 (2026-09-09): pedido do usuário — em "Ponto principal: Manual",
     removidos os listeners de #manualPPShowThirdAxisLines/
     #manualPPThirdAxisLinesInfinite (checkbox+subopção removidos de
     index.html); updateVisibilityRules() troca a antiga condição de
     #manualPPThirdAxisField (visível só em 'manual') pela de #axis3ExtField
     (visível em 'manual' OU 'fromThirdVP'+2 VPs) — os botões
     .axisExtBtn/.axisInfBtn do eixo 3, que já existiam, passam a cobrir os 2
     modos sem precisar de um checkbox de mestre separado.
   Rodada 29 (2026-09-09): pedido do usuário — SEGUNDO botão-ícone por eixo
     (.axisInfBtn, 1/2/3), irmão do .axisExtBtn da rodada 28: nova
     updateAxisInfBtnsVisual() + listeners de clique, controlando
     state.axisLineInfiniteExtension[axisIdx] (desligado por padrão nos 3
     eixos) — ver drawVpLinePair()/computeFarPointExtension() em
     canvas-render.js. Os demais itens desta rodada (reordenar
     #move3VPField/#movePPFrom3VPField, remover o texto "Mover 3º ponto de
     fuga", aspas simples em "Linhas diagonais") só mexeram em index.html.
   Rodada 28 (2026-09-09): pedido do usuário — vários itens envolvendo "Ponto
     principal: Manual" e "Linhas diagonais": (c) 3 novos botões-ícone
     .axisExtBtn (um por eixo de fuga) ligando/desligando
     state.axisLineExtension[axisIdx], afixados a controles SEMPRE visíveis
     (linha do dropdown dos eixos 1/2, cabeçalho de "Mover 3º ponto de fuga")
     para não bagunçar o layout já definido — ver updateAxisExtBtnsVisual() e
     drawVpLinePair()/drawAxisLines() em canvas-render.js; (b) novo listener
     #manualPPThirdAxisLinesInfinite (subopção de "Mostrar linhas do 3º eixo
     de fuga", desabilitada por padrão — ver state.js e
     drawManualPPThirdAxisLines() em canvas-render.js); (d) #diagonalsEnabled
     (checkbox) virou #diagonalsEnabledBtn (botão retangular com 2 linhas
     cruzando as diagonais); nova updateDiagonalsToggleVisual() sincroniza a
     cor das linhas do ícone com state.diagonals.color, chamada tanto no
     toggle quanto ao trocar a cor no color picker. Os itens (a) documentação
     em "O que é isso?" e (e) "canto a canto" sem hífen não mexeram neste
     arquivo — ver index.html.
   Rodada 26 (2026-09-09): novo listener #explainerBannerOffBtn — botão
     "Desativar" da faixa #explainerActiveBanner (index.html, mostrada enquanto
     o "explicador visual" está ativo — ver histórico completo em
     canvas-render.js) chama setExplainerModeActive(false) direto, sem precisar
     reabrir a janela "O que é isso?". O outro pedido desta rodada (linhas do
     3º eixo partindo de vp3) não mexeu neste arquivo.
   Rodada 25 (2026-09-09): pedido do usuário — novo item de menu "O que é isso?"
     (acima de "Sobre"), abrindo openWhatIsThisModal()/closeWhatIsThisModal()
     (nova janela #whatIsThisOverlay/#whatIsThisBox em index.html, mesmo padrão
     de abrir/fechar de openAboutModal()/closeAboutModal() logo abaixo) — com
     definições/dicas de uso do app e o botão #explainerToggleBtn, que liga/
     desliga o "explicador visual" chamando setExplainerModeActive() (definida
     em js/canvas-render.js — é lá que fica toda a lógica de detectar o elemento
     sob o mouse, desenhar a seta e decidir o texto de cada tipo de elemento;
     ver o histórico completo lá). O outro pedido desta rodada (linhas do 3º
     eixo em "Ponto principal: Manual" ficando infinitas só num sentido) não
     mexeu neste arquivo — ver histórico de canvas-render.js.
   Rodada 24 (2026-09-09): 2 pedidos do usuário sobre a janela "Sobre"
     (rodada 23): (a) o texto ali devia ser SELECIONÁVEL; (b) nova seção
     "Código-fonte do VanishCam" com o link do repositório. O showModal()
     genérico usado antes só aceita texto puro (sem link) e herda
     user-select:none do body — por isso openAboutModal()/closeAboutModal()
     foram reescritas para controlar uma janela própria (#aboutOverlay/
     #aboutBox, HTML novo em index.html, no mesmo padrão visual/de listeners
     de #shortcutsOverlay logo abaixo) em vez do modal genérico. showModal()
     em si NÃO mudou — continua sendo usado por confirmações/avisos curtos
     em outros lugares do app (doNew(), doExit() em project-io.js), que não
     precisam de texto selecionável nem de links.
   Rodada 23 (2026-09-09): rebranding para VanishCam (pedido do usuário — ver
     histórico completo em index.html/project-io.js). Aqui: novo item de menu
     "Sobre" (data-action="about") tratado em handleMenuAction(), abrindo
     openAboutModal() — usa o showModal() genérico já existente para exibir o
     texto de atribuição ao fSpy original (Per Gantelius, stuffmatic.com),
     deixando claro que o VanishCam é uma implementação independente, sem
     compartilhar código com o projeto original.
   Rodada 17 (2026-09-08): novo updateVpLockBadge(axisIdx) — selo de
     quantidade (1 a 4, escondido se 0) no botão "Travar" (🔒) de cada eixo,
     refletindo quantas das 4 extremidades do par de linhas estão travadas
     agora (pedido do usuário: "deve se perceber a quantidade"). Chamado no
     init (junto de updateVpModeBtnsVisual/updateVpDistModeBtnsVisual) e no
     listener de [modificador]+clique do botão "Travar" (trava/destrava as
     4 de uma vez); os outros 2 pontos que alteram o travamento — clique
     direto numa extremidade — ficam em canvas-render.js e chamam esta
     função lá diretamente.
   Rodada 16 (2026-09-08): novo botão auxiliar "proporcional/comprimento fixo"
     (📏, '.vpMoveBtn[data-action="distmode"]') colado à esquerda de "Mover"
     em cada eixo — updateVpDistModeBtnsVisual(axisIdx) (novo, espelha
     updateVpModeBtnsVisual) + um listener genérico de clique que alterna
     state.vpMove[axisIdx].distMode entre 'proportional' e 'preserveLength'
     (mesmo padrão dos outros botões-ícone .vpMoveBtn já existentes).
   Rodada 14 (2026-09-08): (a) novo listener #bringCloseBtn -> bringFarPointsClose()
     (canvas-render.js). (b) o listener de #shortcutModifierSelect passou a
     chamar markDirty() além de saveShortcuts() — a tecla modificadora agora
     também é salva DENTRO do arquivo de projeto (ver histórico de
     project-io.js desta rodada), então mudar essa preferência marca o
     projeto como tendo alterações não salvas, como qualquer outro campo.
   Rodada 13 (2026-09-08): lista grande de ajustes pedidos pelo usuário (ver
     também o histórico, mais detalhado, no topo de index.html/css/style.css/
     canvas-render.js/corner-guide.js/project-io.js/state.js). Nesta parte:
     (a) o 3º eixo ("Mover 3º ponto de fuga") deixou de ter o checkbox
     #move3VP e o botão #vp3LockBtn tratados como casos especiais — o HTML
     passou a usar o MESMO grupo .vpMoveIconsRow (com botão-ícone "Mover")
     dos eixos 1/2, então os loops genéricos '.vpMoveBtn[data-action="move"/
     "lock"]' já tratam os 3 eixos igual (o `if(axisIdx===3) return` do loop
     de "lock" foi removido). Isso também CORRIGE um bug visual: o cadeado do
     3º eixo não recebia o destaque azul de "ativo" porque não tinha a classe
     .vpMoveBtn (só .active, que sozinha não tem estilo). (b) os cliques nos
     botões-ícone de "Travar" (.vpMoveBtn[data-action="lock"]) agora também
     respeitam [modificador]+clique (shortcuts.modifierKey, padrão Ctrl — ver
     state.js): em vez de alternar o "botão de travar" (modo em que cliques
     subsequentes nas extremidades travam/destravam uma a uma), trava/destrava
     as 4 extremidades daquele eixo de uma vez só. (c) novo caso 'shortcuts'
     em handleMenuAction() (novo item de menu "Atalhos") — abre
     openShortcutsModal(), que lê/grava shortcuts.modifierKey (state.js) e
     persiste via saveShortcuts() (localStorage, não faz parte do projeto).
     (d) o listener de '#guide3d' passou a chamar autoSelectCornerForGizmo()
     (nova função em js/corner-guide.js) ao trocar PARA 'corner' quando ainda
     não há canto escolhido — seleciona automaticamente o canto do cubo mais
     alinhado com a orientação real do gizmo da imagem, em vez de deixar a
     guia sem desenhar nada até o usuário abrir o popup manualmente.
   Rodada 11 (2026-09-08): generalização de "Mover"/"Travar" (antes só o 3º
     eixo) para os 3 eixos. (a) os antigos listeners de #move3VP/#vp3LockBtn
     foram substituídos por listeners genéricos em .vpMoveBtn[data-action=move],
     .vpMoveBtn[data-action=lock] e .vpModeBtn[data-mode] (delegados por
     data-axis), cobrindo os 3 eixos — usam state.vpMove[axisIdx] (novo, ver
     state.js) e setVpLockToolActive(axisIdx,v)/vpLockToolActive (novos nomes
     em canvas-render.js). (b) novos listeners #movePPFrom3VP e
     #manualPPShowThirdAxisLines. (c) updateVisibilityRules() ganhou regras
     para mostrar/esconder #vpMoveIcons1/#vpMoveRectNote1 e
     #vpMoveIcons2/#vpMoveRectNote2 (escondidos com Modo retângulo ativo,
     via isRectActive()) e para #movePPFrom3VPField/#manualPPThirdAxisField
     (conforme ppMode). (d) listener de #rectMode passou a chamar
     updateVisibilityRules() também (antes só markDirty()+render()), pois
     ligar/desligar o Modo retângulo agora afeta a visibilidade dos ícones
     de mover/travar dos eixos 1/2.
   Rodada 10 (2026-09-08): (a) novos listeners: #diagonalsEnabled/#diagonalsColorBtn/
     #diagonalsColorInput (linhas diagonais); #move3VP/#vp3LockBtn (mover/
     travar o 3º ponto de fuga — a lógica de arraste/travamento em si fica em
     canvas-render.js, aqui só os controles do painel esquerdo); #cornerGuideBtn
     (abre o popup do cubo 3D interativo — lógica em js/corner-guide.js, novo
     arquivo). (b) onPPModeChange() e o listener de '#guide3d' passaram a
     chamar updateVisibilityRules() (antes só markDirty()+render()) — necessário
     para mostrar/esconder o novo bloco "Mover 3º ponto de fuga" (só com
     ppMode='fromThirdVP') e o botão do cubo do "Canto" (só com guide3d='corner').
     (c) updateVisibilityRules() ganhou essas 2 regras novas.
   Rodada 9 (2026-09-07): adicionado este histórico de alterações (ver
     mesma nota em state.js). Sem mudança de comportamento.
   Rodada 7 (2026-09-07): (a) ppModeDS deixou de ser construído uma única vez
     com uma lista fixa de opções — agora ppModeOptions()/refreshPPModeOptions()
     reconstroem o dotselect toda vez que os eixos 1/2 mudam (ou um projeto é
     carregado), porque a cor da "bolinha" da opção "A partir do 3º ponto de
     fuga" passou a depender dinamicamente de thirdAxisLetter() (calibration.js)
     em vez de usar sempre a cor do eixo z (VP3_COLOR, removida). (b) novo
     listener no checkbox #showUnits — liga/desliga state.showUnits (toggle
     "Mostrar unidades" pedido pelo usuário, no painel direito).
   Rodada 6 (2026-09-06): (a) listener do checkbox #rectMode reescrito: ao
     LIGAR o Modo retângulo, os 4 cantos passaram a vir diretamente dos 4
     pontos do par '1' (que fica intocado) em vez de uma média entre os
     pares '1' e '2' — é o par '2' que "se encaixa" nesses cantos, conforme
     pedido explícito do usuário. Ao DESLIGAR, axisPoints[1]/[2] deixaram de
     ser sobrescritos (antes eram sincronizados com a posição do retângulo
     no momento do toggle) — como eles nunca são tocados enquanto o modo
     está ligado, desligar agora sempre restaura a orientação livre que as
     linhas tinham ANTES de ligar, como pedido. (b) novos listeners para os
     sliders #handleRadius/#lineThickness (controles novos do painel
     esquerdo, "Tamanho das bolinhas"/"Espessura da linha").
   -------------------------------------------------------------------------- */

/* ============================= UI: MENU ================================ */
const fileMenuBtn = document.getElementById('fileMenuBtn');
const fileMenuDropdown = document.getElementById('fileMenuDropdown');
fileMenuBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  const opening = fileMenuDropdown.classList.contains('hidden');
  closeAllMenus();
  if(opening){ fileMenuDropdown.classList.remove('hidden'); fileMenuBtn.classList.add('open'); }
});
document.addEventListener('click', closeAllMenus);
function closeAllMenus(){
  fileMenuDropdown.classList.add('hidden');
  fileMenuBtn.classList.remove('open');
}
fileMenuDropdown.addEventListener('click', (e)=>{
  const mi = e.target.closest('.mi[data-action]');
  if(!mi) return;
  closeAllMenus();
  handleMenuAction(mi.dataset.action);
});

function handleMenuAction(action){
  switch(action){
    case 'new': doNew(); break;
    case 'open': document.getElementById('fileInputProject').click(); break;
    case 'openSample': loadSampleProject(); break;
    case 'openImage': document.getElementById('fileInputImage').click(); break;
    case 'save': doSave(); break;
    case 'saveAs': doSave(true); break;
    case 'exportJSON': exportCameraJSON(); break;
    case 'exportImage': exportProjectImage(); break;
    case 'shortcuts': openShortcutsModal(); break;
    case 'whatIsThis': openWhatIsThisModal(); break;
    case 'about': openAboutModal(); break;
    case 'exit': doExit(); break;
  }
}

// Janela "Sobre" (menu Arquivo > Sobre). Rodada 23: créditos ao fSpy original, parte do
// rebranding para VanishCam. Rodada 24 (2026-09-09): pedido do usuário — texto selecionável e
// nova seção "Código-fonte do VanishCam" com o link do GitHub; por isso deixou de usar o
// showModal() genérico (só texto puro, sem link, sem user-select:text) e passou a controlar sua
// própria janela (#aboutOverlay/#aboutBox em index.html), no mesmo padrão de openShortcutsModal()/
// closeShortcutsModal() logo abaixo (inclusive fechar clicando no fundo escurecido).
function openAboutModal(){
  document.getElementById('aboutOverlay').classList.remove('hidden');
}
function closeAboutModal(){
  document.getElementById('aboutOverlay').classList.add('hidden');
}
document.getElementById('aboutCloseBtn').addEventListener('click', closeAboutModal);
document.getElementById('aboutOverlay').addEventListener('mousedown', (e)=>{
  if(e.target.id==='aboutOverlay') closeAboutModal();
});

// Botão "Baixar esta versão" (janela Sobre). Rodada 32 (2026-09-09): pedido do usuário — removido
// o vanishcam-embed.zip ESTÁTICO que ficava guardado dentro da pasta do projeto (ele só duplicava
// os mesmos arquivos que já estão na pasta, e ficava desatualizado a cada rodada nova). Agora o
// .zip é MONTADO NO NAVEGADOR, na hora do clique — busca (fetch) os arquivos ATUAIS da própria
// pasta vanishCam (lista dada por vanishCamFileList(), embed-api.js) e os empacota com
// buildZipStore() (js/zip-lite.js, formato zip sem compressão, sem nenhuma biblioteca externa).
// Assim o .zip baixado sempre reflete os arquivos reais da pasta nesse momento, e não fica nenhum
// arquivo extra armazenado no projeto.
// Rodada 33 (2026-09-09): AJUSTE — este botão usa fetch() para ler cada arquivo (precisa do
// CONTEÚDO deles para montar o .zip, e não dá pra fazer isso com uma <script> comum como fizemos
// em embed-api.js para o markup de #vanishcamRoot). fetch() para arquivo local FALHA quando a
// página está aberta como file:// (ver Rodada 33 em js/embed-api.js) — então, nesse caso, avisamos
// o usuário em vez de deixar o clique falhar silenciosamente com um erro técnico no console.
document.getElementById('downloadEmbedZipBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('downloadEmbedZipBtn');
  const originalText = btn.textContent;
  if(location.protocol === 'file:'){
    alert('Para baixar esta versão, abra o VanishCam por um servidor local (http/https) em vez de abrir o index.html direto como arquivo — nesse modo (file://) o navegador não permite ler o conteúdo de outros arquivos da pasta para montar o .zip.\n\nAlternativa: copie a pasta vanishCam inteira manualmente (ela já é a versão para embutir — não precisa do .zip).');
    return;
  }
  btn.disabled = true; btn.textContent = 'Preparando…';
  try{
    const base = (typeof vanishCamBasePath==='function') ? vanishCamBasePath() : '';
    const fileList = (typeof vanishCamFileList==='function') ? vanishCamFileList() : ['index.html'];
    const files = [];
    for(const name of fileList){
      const res = await fetch(base + name);
      if(!res.ok) throw new Error('Falha ao buscar '+name+' (HTTP '+res.status+')');
      const buf = await res.arrayBuffer();
      files.push({ name, bytes: new Uint8Array(buf) });
    }
    const blob = buildZipStore(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'vanishcam-embed.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
  } catch(err){
    alert('Não foi possível gerar o arquivo para download: '+err.message);
  } finally {
    btn.disabled = false; btn.textContent = originalText;
  }
});

// Janela "O que é isso?" (menu Arquivo > O que é isso?, rodada 25 — 2026-09-09, pedido do
// usuário) — mesmo padrão de abrir/fechar de openAboutModal()/closeAboutModal() logo acima
// (própria janela, não o showModal() genérico, por ter texto selecionável e ser bem mais longa).
// Fecha o "explicador visual" continua LIGADO mesmo depois de fechar esta janela, de propósito —
// o usuário pode querer explorar o app com ele ativo sem a janela de texto atrapalhando; para
// desligá-lo, basta reabrir esta janela e clicar em #explainerToggleBtn de novo.
function openWhatIsThisModal(){
  document.getElementById('whatIsThisOverlay').classList.remove('hidden');
}
function closeWhatIsThisModal(){
  document.getElementById('whatIsThisOverlay').classList.add('hidden');
}
document.getElementById('whatIsThisCloseBtn').addEventListener('click', closeWhatIsThisModal);
document.getElementById('whatIsThisOverlay').addEventListener('mousedown', (e)=>{
  if(e.target.id==='whatIsThisOverlay') closeWhatIsThisModal();
});
// Liga/desliga o "explicador visual" (setExplainerModeActive()/explainerModeActive vivem em
// js/canvas-render.js, carregado DEPOIS deste arquivo — ver a ordem de <script> em index.html;
// como isto só executa dentro do clique, não na carga da página, a função já existe a essa altura,
// mas o guard typeof=== 'function' segue o mesmo padrão defensivo já usado para outras funções
// definidas em arquivos carregados depois deste, ex.: #bringCloseBtn/#cornerGuideBtn acima).
document.getElementById('explainerToggleBtn').addEventListener('click', ()=>{
  if(typeof setExplainerModeActive==='function') setExplainerModeActive(!explainerModeActive);
});
// Rodada 26 (2026-09-09): botão "Desativar" da faixa #explainerActiveBanner (index.html/
// canvas-render.js) — desliga o explicador direto da imagem, sem precisar reabrir esta janela.
document.getElementById('explainerBannerOffBtn').addEventListener('click', ()=>{
  if(typeof setExplainerModeActive==='function') setExplainerModeActive(false);
});

/* ------------------------------ Modal genérico --------------------------- */
function showModal(title, msg, buttons){
  return new Promise((resolve)=>{
    const overlay = document.getElementById('modalOverlay');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMsg').textContent = msg;
    const btnsWrap = document.getElementById('modalBtns');
    btnsWrap.innerHTML = '';
    buttons.forEach(b=>{
      const el = document.createElement('button');
      el.textContent = b.label;
      if(b.primary) el.className = 'primary';
      el.addEventListener('click', ()=>{
        overlay.classList.add('hidden');
        resolve(b.value);
      });
      btnsWrap.appendChild(el);
    });
    overlay.classList.remove('hidden');
  });
}

/* --------- dropdown customizado com "bolinha" colorida antes do texto --------- */
function buildDotSelect(containerId, options, initialValue, onChange){
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const btn = document.createElement('button');
  btn.type='button'; btn.className='dotselect-btn';
  const list = document.createElement('div');
  list.className='dotselect-list hidden';
  function dotHtml(opt){
    if(!opt.dot) return '';
    const style = opt.dot.type==='outline'
      ? `border:2px solid ${opt.dot.color}; background:transparent;`
      : `background:${opt.dot.color}; border:1px solid rgba(0,0,0,.35);`;
    return `<span class="dot" style="${style}"></span>`;
  }
  function renderBtn(){
    const opt = options.find(o=>o.value===container.dataset.value) || options[0];
    btn.innerHTML = dotHtml(opt) + `<span class="dotselect-label">${opt.label}</span><span class="dotselect-caret">▾</span>`;
  }
  options.forEach(opt=>{
    const item=document.createElement('div');
    item.className='dotselect-item';
    item.innerHTML = dotHtml(opt) + `<span class="dotselect-label">${opt.label}</span>`;
    item.addEventListener('click', (e)=>{
      e.stopPropagation();
      container.dataset.value = opt.value;
      renderBtn();
      list.classList.add('hidden');
      onChange(opt.value);
    });
    list.appendChild(item);
  });
  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const willOpen = list.classList.contains('hidden');
    document.querySelectorAll('.dotselect-list').forEach(l=>l.classList.add('hidden'));
    if(willOpen) list.classList.remove('hidden');
  });
  document.addEventListener('click', ()=>list.classList.add('hidden'));
  container.appendChild(btn); container.appendChild(list);
  container.dataset.value = initialValue;
  renderBtn();
  return { setValue(v){ container.dataset.value=v; renderBtn(); } };
}

/* ---- opções de eixo (x/-x/y/-y/z/-z): a cor da bolinha depende SEMPRE da letra do   ----
   ---- eixo (x=vermelho, y=#70BF41, z=azul), nunca do slot '1' ou '2' do ponto de fuga. ---- */
const AXIS_OPTIONS_TEMPLATE = ['-x','x','-y','y','-z','z'].map(v=>({value:v, label:v}));
function axisOptionsColored(){
  return AXIS_OPTIONS_TEMPLATE.map(o=>({...o, dot:{type:'fill', color:colorForAxisLetter(axisLetter(o.value))}}));
}

const vpCountDS = buildDotSelect('vpCountSelect', [{value:'1',label:'1'},{value:'2',label:'2'}], String(state.vpCount), (v)=>{
  state.vpCount = parseInt(v,10);
  updateVisibilityRules(); markDirty(); render();
});
const axis1DS = buildDotSelect('axis1Select', axisOptionsColored(), state.axis1, (v)=>{
  state.axis1=v; refreshPPModeOptions(); markDirty(); render();
});
const axis2DS = buildDotSelect('axis2Select', axisOptionsColored(), state.axis2, (v)=>{
  state.axis2=v; refreshPPModeOptions(); markDirty(); render();
});
// As opções do "Ponto principal" incluem a bolinha do 3º ponto de fuga, cuja cor depende dos
// eixos escolhidos em '1'/'2' (ver thirdAxisLetter()) — por isso o dotselect é reconstruído
// (não só atualizado) toda vez que axis1/axis2 mudam, para refletir a cor correta.
function ppModeOptions(){
  return [
    {value:'midpoint', label:'Ponto médio da imagem', dot:{type:'outline', color:'#f1c40f'}},
    {value:'manual', label:'Manual', dot:{type:'fill', color:'#f1c40f'}},
    {value:'fromThirdVP', label:'A partir do 3º ponto de fuga', dot:{type:'fill', color:colorForAxisLetter(thirdAxisLetter())}},
  ];
}
function onPPModeChange(v){ state.ppMode=v; updateVisibilityRules(); markDirty(); render(); }
let ppModeDS = buildDotSelect('ppMode', ppModeOptions(), state.ppMode, onPPModeChange);
function refreshPPModeOptions(){
  ppModeDS = buildDotSelect('ppMode', ppModeOptions(), state.ppMode, onPPModeChange);
}

document.getElementById('oneVpFov').addEventListener('input', (e)=>{ state.oneVpFovDeg=parseFloat(e.target.value)||1; markDirty(); render(); });

document.getElementById('refDistMode').addEventListener('change', (e)=>{
  state.refDistMode = e.target.value; updateVisibilityRules(); markDirty(); render();
});
document.getElementById('refDistValue').addEventListener('input', (e)=>{ state.refDistValue=parseFloat(e.target.value)||0; markDirty(); render(); });
document.getElementById('refDistUnit').addEventListener('change', (e)=>{ state.refDistUnit=e.target.value; markDirty(); render(); });

document.getElementById('rectMode').addEventListener('change', (e)=>{
  const turningOn = e.target.checked;
  if(turningOn){
    // O par de linhas '1' mantém sua posição/orientação tal como estava; o retângulo é
    // formado usando diretamente os 4 pontos desse par como cantos — é o par '2' que "se
    // move" para se encaixar nesses mesmos cantos (TL-BL vira a linha 1 do eixo 2; TR-BR vira
    // a linha 2 do eixo 2 — ver getAxisLinePoints()).
    state.rectCorners = {
      TL: state.axisPoints[1].l1[0].slice(),
      TR: state.axisPoints[1].l1[1].slice(),
      BL: state.axisPoints[1].l2[0].slice(),
      BR: state.axisPoints[1].l2[1].slice(),
    };
  }
  // Ao DESLIGAR o modo retângulo, propositalmente NÃO tocamos em axisPoints[1]/[2]: eles nunca
  // são sobrescritos enquanto o modo retângulo está ativo (só os rectCorners mudam durante o
  // arraste), então eles continuam guardando o estado "livre" de como as linhas estavam ANTES
  // de ligar o modo retângulo — desligá-lo simplesmente volta a exibir esse estado anterior.
  state.rectMode = turningOn;
  updateVisibilityRules(); markDirty(); render();
});
document.getElementById('guide3d').addEventListener('change', (e)=>{
  state.guide3d=e.target.value;
  // updateVisibilityRules() PRIMEIRO (rodada 14): precisa revelar #cornerGuideBtnWrap antes de
  // autoSelectCornerForGizmo() chamar updateCornerIcon(), que agora mede o tamanho REAL do botão
  // via getBoundingClientRect() — um elemento ainda com .hidden (display:none) mediria 0x0.
  updateVisibilityRules();
  // Rodada 13: ao trocar PARA "Canto" sem nenhum canto ainda escolhido, seleciona automaticamente
  // o canto do cubo mais alinhado com a orientação real do gizmo da imagem (em vez de deixar a
  // guia sem desenhar nada até o usuário abrir o popup e clicar num canto manualmente) — ver
  // autoSelectCornerForGizmo() em js/corner-guide.js.
  if(state.guide3d==='corner' && !state.cornerGuide.selected && typeof autoSelectCornerForGizmo==='function'){
    autoSelectCornerForGizmo();
  }
  markDirty(); render();
});
document.getElementById('darkenImage').addEventListener('change', (e)=>{ state.darkenImage=e.target.checked; render(); });

/* --------------------------- Linhas diagonais --------------------------- */
// Rodada 28: #diagonalsEnabled (checkbox) virou #diagonalsEnabledBtn (botão-ícone retangular com
// 2 linhas cruzando as diagonais, representando visualmente a função). A cor das linhas do ícone
// (#diagonalsEnabledIconA/#diagonalsEnabledIconB) acompanha state.diagonals.color — por isso
// updateDiagonalsToggleVisual() é chamada tanto no toggle quanto ao trocar a cor.
function updateDiagonalsToggleVisual(){
  const btn = document.getElementById('diagonalsEnabledBtn');
  btn.classList.toggle('active', state.diagonals.enabled);
  document.getElementById('diagonalsEnabledIconA').setAttribute('stroke', state.diagonals.color);
  document.getElementById('diagonalsEnabledIconB').setAttribute('stroke', state.diagonals.color);
}
document.getElementById('diagonalsEnabledBtn').addEventListener('click', ()=>{
  state.diagonals.enabled = !state.diagonals.enabled;
  updateDiagonalsToggleVisual();
  markDirty(); render();
});
document.getElementById('diagonalsColorBtn').addEventListener('click', ()=>{
  document.getElementById('diagonalsColorInput').click();
});
document.getElementById('diagonalsColorInput').addEventListener('input', (e)=>{
  state.diagonals.color = e.target.value;
  document.getElementById('diagonalsColorBtn').style.background = e.target.value;
  updateDiagonalsToggleVisual();
  markDirty(); render();
});
updateDiagonalsToggleVisual();

/* ------------------- Mover / travar pontos de fuga (eixos 1, 2 e 3) ------------------ */
// Rodada 13: o 3º eixo deixou de ter um checkbox+botão avulsos (#move3VP/#vp3LockBtn) — agora usa
// o MESMO grupo de botões-ícone (.vpMoveIconsRow) dos eixos 1/2, então "Mover" e "Travar" do 3º
// eixo já são cobertos pelos loops genéricos '.vpMoveBtn[data-action="move"/"lock"]' logo abaixo
// (o cadeado do 3º eixo também passou a ganhar a classe .vpMoveBtn, e com ela o destaque azul de
// "ativo", que antes faltava). setVpLockToolActive(axisIdx,v)/vpLockToolActive vivem em
// canvas-render.js (é lá que o clique nas extremidades dos pares de linhas é interceptado para
// travar/destravar, em vez de arrastar).
function updateVpModeBtnsVisual(axisIdx){
  const mode = state.vpMove[axisIdx].mode;
  document.querySelectorAll(`.vpModeBtn[data-axis="${axisIdx}"]`).forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.mode===mode);
  });
}
// Rodada 16: botão auxiliar "proporcional / comprimento fixo" (📏), colado à esquerda de
// "Mover" — reflete state.vpMove[axisIdx].distMode ('proportional' padrão, ou 'preserveLength').
// Ver pivotEndpoint()/adjustAxisLine() em canvas-render.js para o efeito de cada modo.
function updateVpDistModeBtnsVisual(axisIdx){
  const distMode = state.vpMove[axisIdx].distMode || 'proportional';
  document.querySelectorAll(`.vpMoveBtn[data-action="distmode"][data-axis="${axisIdx}"]`).forEach(btn=>{
    btn.classList.toggle('active', distMode==='preserveLength');
  });
}
// Rodada 17: selo de quantidade no botão "Travar" (🔒) — quantas das 4 extremidades do par de
// linhas desse eixo estão travadas agora (0 = nenhum selo, 1 a 4 = número). O <span> é criado sob
// demanda (lazy) dentro do próprio botão, então não depende de nada extra no HTML.
function updateVpLockBadge(axisIdx){
  const lk = state.vpMove[axisIdx].lock;
  const count = [lk.l1[0],lk.l1[1],lk.l2[0],lk.l2[1]].filter(Boolean).length;
  document.querySelectorAll(`.vpMoveBtn[data-action="lock"][data-axis="${axisIdx}"]`).forEach(btn=>{
    let span = btn.querySelector('.lockCount');
    if(!span){ span = document.createElement('span'); span.className='lockCount'; btn.appendChild(span); }
    span.textContent = count>0 ? String(count) : '';
  });
}
[1,2,3].forEach(axisIdx=>{
  updateVpModeBtnsVisual(axisIdx);
  updateVpDistModeBtnsVisual(axisIdx);
  updateVpLockBadge(axisIdx);
});
document.querySelectorAll('.vpMoveBtn[data-action="distmode"]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const axisIdx = parseInt(btn.dataset.axis, 10);
    const vm = state.vpMove[axisIdx];
    vm.distMode = (vm.distMode==='preserveLength') ? 'proportional' : 'preserveLength';
    updateVpDistModeBtnsVisual(axisIdx);
    markDirty(); render();
  });
});
document.querySelectorAll('.vpModeBtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const axisIdx = parseInt(btn.dataset.axis, 10);
    state.vpMove[axisIdx].mode = btn.dataset.mode;
    updateVpModeBtnsVisual(axisIdx);
    markDirty(); render();
  });
});
// Ícones de "Mover" e "Travar" dos eixos 1 e 2 (grupo .vpMoveBtn dentro de .vpMoveIconsRow).
document.querySelectorAll('.vpMoveBtn[data-action="move"]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const axisIdx = parseInt(btn.dataset.axis, 10);
    state.vpMove[axisIdx].enabled = !state.vpMove[axisIdx].enabled;
    btn.classList.toggle('active', state.vpMove[axisIdx].enabled);
    markDirty(); render();
  });
});
document.querySelectorAll('.vpMoveBtn[data-action="lock"]').forEach(btn=>{
  const axisIdx = parseInt(btn.dataset.axis, 10);
  btn.addEventListener('click', (e)=>{
    // Rodada 13: [modificador]+clique no botão "Travar" trava/destrava as 4 extremidades do
    // eixo de UMA VEZ, sem entrar no "modo de travar clicando" (shortcutModifierActive(), state.js).
    if(shortcutModifierActive(e)){
      const lk = state.vpMove[axisIdx].lock;
      const allLocked = lk.l1[0] && lk.l1[1] && lk.l2[0] && lk.l2[1];
      const v = !allLocked;
      lk.l1 = [v,v]; lk.l2 = [v,v];
      updateVpLockBadge(axisIdx);
      markDirty(); render();
      return;
    }
    const active = !vpLockToolActive[axisIdx];
    setVpLockToolActive(axisIdx, active);
    btn.classList.toggle('active', active);
  });
});

/* ------------------- Mover ponto principal / linhas do 3º eixo (Manual) ------------------ */
document.getElementById('movePPFrom3VP').addEventListener('change', (e)=>{
  state.movePPFrom3VP = e.target.checked; markDirty(); render();
});
// Rodada 30 (2026-09-09): pedido do usuário — removidos os listeners de #manualPPShowThirdAxisLines
// e #manualPPThirdAxisLinesInfinite (checkbox + subopção REMOVIDOS de index.html). As linhas do 3º
// eixo em modo Manual agora são sempre mostradas, controladas pelos botões .axisExtBtn/.axisInfBtn
// do eixo 3 (ver bloco abaixo e drawManualPPThirdAxisLines() em canvas-render.js).

/* ------- Rodada 28: botões "prolongamento até o vp" por eixo (.axisExtBtn) ------- */
// Um botão por eixo de fuga (1, 2 e 3), afixado a controles que já são sempre visíveis (linha do
// dropdown do eixo 1/2, e o campo #axis3ExtField para o eixo 3 — ver index.html, rodada 30), para
// não bagunçar o layout já definido nem depender de blocos que ficam ocultos conforme o modo
// (.vpMoveIconsRow). Controla state.axisLineExtension[axisIdx] — usado por
// drawVpLinePair()/drawAxisLines() em canvas-render.js para decidir se desenha o segmento fino de
// prolongamento do lado PRÓXIMO do ponto de fuga (até ele, ou até a borda da tela).
function updateAxisExtBtnsVisual(axisIdx){
  const on = state.axisLineExtension[axisIdx] !== false;
  document.querySelectorAll(`.axisExtBtn[data-axis="${axisIdx}"]`).forEach(btn=>{
    btn.classList.toggle('active', on);
  });
}
document.querySelectorAll('.axisExtBtn').forEach(btn=>{
  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const axisIdx = parseInt(btn.dataset.axis, 10);
    state.axisLineExtension[axisIdx] = !(state.axisLineExtension[axisIdx] !== false);
    updateAxisExtBtnsVisual(axisIdx);
    markDirty(); render();
  });
});
[1,2,3].forEach(axisIdx=> updateAxisExtBtnsVisual(axisIdx));

/* ------- Rodada 29: SEGUNDO botão por eixo, "prolongamento ao infinito" (.axisInfBtn) ------- */
// Mesmo padrão do bloco acima, mas para o botão irmão (lado DISTANTE do ponto de fuga, sempre até
// a borda da tela — nunca até o próprio vp) — controla state.axisLineInfiniteExtension[axisIdx],
// usado por drawVpLinePair() via computeFarPointExtension() em canvas-render.js. Desligado por
// padrão nos 3 eixos (pedido explícito do usuário).
function updateAxisInfBtnsVisual(axisIdx){
  const on = state.axisLineInfiniteExtension && state.axisLineInfiniteExtension[axisIdx]===true;
  document.querySelectorAll(`.axisInfBtn[data-axis="${axisIdx}"]`).forEach(btn=>{
    btn.classList.toggle('active', on);
  });
}
document.querySelectorAll('.axisInfBtn').forEach(btn=>{
  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const axisIdx = parseInt(btn.dataset.axis, 10);
    state.axisLineInfiniteExtension[axisIdx] = !(state.axisLineInfiniteExtension[axisIdx]===true);
    updateAxisInfBtnsVisual(axisIdx);
    markDirty(); render();
  });
});
[1,2,3].forEach(axisIdx=> updateAxisInfBtnsVisual(axisIdx));

/* ---------------------- Guia 3D "Canto" (cubo 3D) ------------------------ */
// A lógica do popup (orbit, seleção de canto, animação, ícone) fica em js/corner-guide.js —
// aqui só o botão que abre o popup.
document.getElementById('cornerGuideBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  openCornerPopup();
});

/* ---------------------------- Janela "Atalhos" (rodada 13) --------------------------- */
// menu Arquivo > Atalhos. Só edita shortcuts.modifierKey por enquanto (os demais atalhos
// listados na janela — pan com o botão do meio, setas para ciclar sobreposição — são fixos,
// mostrados ali só como referência). shortcuts/loadShortcuts()/saveShortcuts() vivem em state.js.
function openShortcutsModal(){
  document.getElementById('shortcutModifierSelect').value = shortcuts.modifierKey;
  document.getElementById('shortcutsOverlay').classList.remove('hidden');
}
function closeShortcutsModal(){
  document.getElementById('shortcutsOverlay').classList.add('hidden');
}
document.getElementById('shortcutModifierSelect').addEventListener('change', (e)=>{
  shortcuts.modifierKey = e.target.value;
  saveShortcuts(); // grava também como padrão deste navegador/computador (novos projetos)
  markDirty(); render(); // rodada 14: agora também é salvo DENTRO do projeto (project-io.js)
});
document.getElementById('shortcutsCloseBtn').addEventListener('click', closeShortcutsModal);
// Rodada 14: novo botão "Trazer para perto" — bringFarPointsClose() vive em canvas-render.js.
document.getElementById('bringCloseBtn').addEventListener('click', ()=>{
  if(typeof bringFarPointsClose==='function') bringFarPointsClose();
});
document.getElementById('shortcutsOverlay').addEventListener('mousedown', (e)=>{
  if(e.target.id==='shortcutsOverlay') closeShortcutsModal();
});

document.getElementById('handleRadius').addEventListener('input', (e)=>{
  state.handleRadius = parseInt(e.target.value,10);
  document.getElementById('handleRadiusVal').textContent = state.handleRadius;
  markDirty(); render();
});
document.getElementById('lineThickness').addEventListener('input', (e)=>{
  state.lineThickness = parseFloat(e.target.value);
  document.getElementById('lineThicknessVal').textContent = state.lineThickness;
  markDirty(); render();
});

function updateVisibilityRules(){
  document.getElementById('axis2Row').classList.toggle('hidden', state.vpCount!==2);
  document.getElementById('oneVpFovField').classList.toggle('hidden', state.vpCount!==1);
  document.getElementById('rectModeField').classList.toggle('hidden', state.vpCount!==2);
  document.getElementById('refDistValueRow').classList.toggle('hidden', state.refDistMode==='none');
  document.getElementById('outOrientWRow').classList.toggle('hidden', state.orientMode!=='quat');
  // "Mover 3º ponto de fuga" só faz sentido com o 3º ponto de fuga em uso (ppMode='fromThirdVP'
  // e 2 pontos de fuga, já que o par axisPoints[3] só é desenhado/usado nessas condições).
  document.getElementById('move3VPField').classList.toggle('hidden', !(state.ppMode==='fromThirdVP' && state.vpCount===2));
  // "Mover ponto médio gerado pelos 3 pontos de fuga" — mesma condição do bloco acima.
  document.getElementById('movePPFrom3VPField').classList.toggle('hidden', !(state.ppMode==='fromThirdVP' && state.vpCount===2));
  // Rodada 30 (2026-09-09): pedido do usuário — #manualPPThirdAxisField (checkbox "Mostrar linhas
  // do 3º eixo de fuga" + subopção "Prolongamento infinito") foi REMOVIDO; os botões de
  // prolongamento do eixo 3 (#axis3ExtField) agora aparecem em AMBOS os modos que usam o par
  // axisPoints[3]: 'manual' (linhas recalculadas a partir do ponto principal manual — ver
  // drawManualPPThirdAxisLines() em canvas-render.js) e 'fromThirdVP' (o par editável de sempre).
  document.getElementById('axis3ExtField').classList.toggle('hidden', !(state.ppMode==='manual' || (state.ppMode==='fromThirdVP' && state.vpCount===2)));
  // Ícones de "Mover"/"Travar" dos eixos 1 e 2: indisponíveis com o Modo retângulo ativo, pois
  // nesse modo os eixos 1/2 compartilham os cantos do retângulo (ver isRectActive()) — travamentos
  // independentes por eixo seriam geometricamente ambíguos/conflitantes para um canto compartilhado.
  const rectActive = isRectActive();
  document.getElementById('vpMoveIcons1').classList.toggle('hidden', rectActive);
  document.getElementById('vpMoveRectNote1').classList.toggle('hidden', !rectActive);
  const axis2Available = state.vpCount===2 && !rectActive;
  document.getElementById('vpMoveIcons2').classList.toggle('hidden', !axis2Available);
  document.getElementById('vpMoveRectNote2').classList.toggle('hidden', !(state.vpCount===2 && rectActive));
  // Botão do cubo 3D interativo só aparece com a Guia 3D "Canto" selecionada.
  document.getElementById('cornerGuideBtnWrap').classList.toggle('hidden', state.guide3d!=='corner');
}

/* ============================ Controles direita =========================== */
document.getElementById('showUnits').addEventListener('change', (e)=>{
  state.showUnits = e.target.checked; updateReadouts();
});
document.getElementById('fovUnitSel').addEventListener('change', (e)=>{
  state.fovUnit=e.target.value; updateReadouts();
});
document.getElementById('orientMode').addEventListener('change', (e)=>{
  state.orientMode=e.target.value; updateVisibilityRules(); updateReadouts();
});
document.getElementById('ppUnitSel').addEventListener('change', (e)=>{
  state.ppUnit=e.target.value; updateReadouts();
});
document.getElementById('focalEnabled').addEventListener('change', (e)=>{
  state.focalEnabled=e.target.checked;
  document.getElementById('focalBody').classList.toggle('hidden', !state.focalEnabled);
  updateReadouts();
});
document.getElementById('sensorW').addEventListener('input', (e)=>{ state.sensorW=parseFloat(e.target.value)||1; state.cameraPresetKey='custom'; document.getElementById('cameraPreset').value='custom'; updateReadouts(); });
document.getElementById('sensorH').addEventListener('input', (e)=>{ state.sensorH=parseFloat(e.target.value)||1; state.cameraPresetKey='custom'; document.getElementById('cameraPreset').value='custom'; updateReadouts(); });

const cameraPresetSel = document.getElementById('cameraPreset');
CAMERA_PRESETS.forEach(p=>{
  const o=document.createElement('option'); o.value=p.key; o.textContent=p.name; cameraPresetSel.appendChild(o);
});
cameraPresetSel.addEventListener('change', ()=>{
  const p = CAMERA_PRESETS.find(x=>x.key===cameraPresetSel.value);
  state.cameraPresetKey = p.key;
  if(p.key!=='custom'){ state.sensorW=p.w; state.sensorH=p.h; document.getElementById('sensorW').value=p.w; document.getElementById('sensorH').value=p.h; }
  updateReadouts();
});

document.querySelectorAll('.copyBtn').forEach(btn=>{
  btn.title = 'Copiar valor';
  btn.addEventListener('click', ()=>{
    const el = document.getElementById(btn.dataset.copy);
    if(!el) return;
    const text = el.value;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).catch(()=>fallbackCopy(el));
    } else fallbackCopy(el);
    btn.textContent='✓'; setTimeout(()=>btn.textContent='⧉',700);
  });
});
function fallbackCopy(el){ el.removeAttribute('readonly'); el.select(); document.execCommand('copy'); el.setAttribute('readonly','');}
