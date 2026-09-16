'use strict';
/* ==========================================================================
   VanishCam — API de integração para uso EMBUTIDO dentro de outro app JS.

   --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO (mais recente primeiro)
   --------------------------------------------------------------------------
   Rodada 33 (2026-09-09): CORREÇÃO — pedido do usuário: tanto o vanishCam
     quanto o app hospedeiro rodam abertos direto como file:///, e
     vanishCamMount() estava falhando ali com "TypeError: Failed to fetch"
     (em ensureLoaded()) porque fetch()/XHR para outro arquivo local NÃO
     funciona em file://. Trocado: em vez de fetch(base+'index.html') +
     DOMParser + importNode, ensureLoaded() agora carrega
     js/embed-root-template.js (novo, gerado a partir de index.html por
     js/build-embed-template.js, novo) como um <script>
     comum — isso FUNCIONA em file:// (e continua funcionando servido por
     http(s)) — e usa a string global que ele define
     (window.__VANISHCAM_ROOT_HTML__) para montar o #vanishcamRoot via
     innerHTML, sem nenhum fetch envolvido. index.html continua sendo a
     fonte da verdade "visual" do markup; embed-root-template.js é só uma
     cópia dele em formato que carrega em file:// (regenerar com
     `node js/build-embed-template.js` sempre que o markup de #vanishcamRoot
     mudar). ALL_FILES ganhou 'js/embed-root-template.js'.
   Rodada 33, ajuste (2026-09-09): pedido do usuário — build-embed-template.js
     movido da raiz do projeto para dentro de js/ (organização de pastas).
   Rodada 32 (2026-09-09): pedido do usuário — (a) scriptBasePath() agora é
     calculada UMA VEZ, na carga do arquivo (não mais só na primeira chamada
     a vanishCamMount()), e exposta como vanishCamBasePath() — usada pelo
     botão "Baixar esta versão" (janela Sobre, js/ui-controls.js) para saber
     de onde buscar (fetch) os arquivos da pasta vanishCam, tanto no uso
     avulso quanto no embutido. (b) nova vanishCamFileList() — lista completa
     dos arquivos da pasta (a mesma usada por esse botão para montar o .zip
     no navegador, sem depender de um .zip estático guardado no projeto — ver
     js/zip-lite.js, novo). (c) js/zip-lite.js entrou na lista SCRIPTS (ordem
     de carregamento no uso embutido).
   Rodada 31 (2026-09-09): arquivo CRIADO — pedido do usuário (ver bloco
     completo abaixo para o motivo e o design). Ver também: index.html
     (#vanishcamRoot), css/style.css (.embedded), js/project-io.js
     (buildCameraDataObject()), README-embed.md (guia de uso).
   --------------------------------------------------------------------------

   Pedido do usuário (rodada 31, 2026-09-09): "O vanishCam deverá ser integrado como uma tela em
   outro app para ser usado dentro dele com imagens próprias do app... o vanishCam deve ser
   integrado a ele de modo que seja possível atualizar apenas substituindo arquivos em uma pasta
   do projeto, por exemplo, uma pasta chamada vanishCam." + "funções como, por exemplo,
   vanishCamGetCamProps(), vanishCamLoadImage()... para invocar uma instância do vanishCam de
   dentro de outro app JavaScript."

   COMO O APP HOSPEDEIRO USA ISTO (resumo — ver README-embed.md para o guia completo):
     1. No HTML do app hospedeiro, uma única linha:
          <script src="vanishCam/js/embed-api.js"></script>
        (NÃO é preciso incluir os outros 8 arquivos .js nem o css/style.css do vanishCam à mão —
        vanishCamMount() busca e injeta tudo isso sozinho, a partir da MESMA pasta de onde este
        próprio arquivo foi carregado, na hora em que é chamado.)
     2. Quando o usuário tira a foto e clica no botão "Definir câmera" do app hospedeiro:
          const container = document.getElementById('meu-container-do-vanishcam');
          await vanishCamMount(container, { imageFile: blobOuFileDaFoto });
        (imageFile é OPCIONAL — pode chamar vanishCamMount(container) sem foto e usar
        vanishCamLoadImage() depois, ou deixar o próprio usuário abrir uma pela UI do vanishCam.)
     3. Em qualquer momento (por exemplo, a cada poucos segundos, ou quando o usuário aperta um
        botão "Usar esta calibração" NO PRÓPRIO app hospedeiro — vanishCam não precisa de um botão
        próprio para isso):
          const props = vanishCamGetCamProps(); // mesmo formato do .json exportado por
                                                  // "Arquivo > Exportar > Parâmetros da câmera",
                                                  // ou null se ainda não há calibração válida.
     4. Quando o app hospedeiro terminar de usar a tela do vanishCam (ex.: usuário fechou aquela
        etapa do fluxo):
          vanishCamUnmount();

   PRINCÍPIO DE DESIGN — por que "carregar e injetar tudo" em vez de pedir que o hospedeiro cole o
   HTML/CSS/JS na própria página: o pedido do usuário foi explícito em "atualizar apenas
   substituindo arquivos [na pasta vanishCam]" — se o hospedeiro precisasse copiar/colar o markup
   do app na PRÓPRIA página, cada atualização da pasta vanishCam exigiria também atualizar essa
   cópia colada, quebrando exatamente a promessa de "só substituir arquivos". Por isso,
   vanishCamMount() carrega (via <script src>, ver Rodada 33 abaixo) o markup de #vanishcamRoot a
   partir da PRÓPRIA pasta vanishCam (que contém TODO o markup da interface — ver index.html) e o
   insere no container do hospedeiro, carregando os demais scripts (state.js, math3d.js, ...) na
   sequência certa só depois disso — a pasta vanishCam continua sendo a ÚNICA fonte da verdade
   (index.html), e o hospedeiro nunca precisa saber o que tem lá dentro.

   LIMITAÇÕES CONHECIDAS (ver README-embed.md):
   - vanishCam usa variáveis/funções GLOBAIS (sem módulos) — o app hospedeiro não deve ter globais
     com os MESMOS nomes (ex.: "state", "render", "ctx"), ou haverá colisão.
   - Funciona tanto servido por http(s) quanto aberto direto como file:// (ver Rodada 33 abaixo) —
     únicas exigências: a pasta vanishCam precisa estar acessível a partir da página do hospedeiro
     por um caminho relativo comum (mesmo servidor, ou mesmo disco local), e os <script>/<link>
     apontando pra ela não podem ser bloqueados (ex.: por uma Content-Security-Policy restritiva).
   - vanishCamMount() só pode ser chamado depois que este próprio <script> já carregou (óbvio, mas
     vale registrar: chamadas antes disso falham porque a função ainda não existe).
   ========================================================================== */

(function(){
  // Descobre a pasta de onde ESTE arquivo (embed-api.js) foi carregado, olhando a própria tag
  // <script> que o trouxe — assim os outros arquivos (css/js, index.html) são buscados
  // relativamente a ELA, sem o hospedeiro precisar informar onde a pasta vanishCam está, e sem
  // depender do nome da pasta (funciona igual se ela se chamar "vanishCam", "lib/vanishcam" etc.).
  // Rodada 32 (2026-09-09): calculada uma ÚNICA vez, aqui em cima (em vez de só na primeira
  // chamada a vanishCamMount()), e exposta como vanishCamBasePath() — o botão "Baixar esta
  // versão" (janela Sobre, js/ui-controls.js) também precisa dela, tanto no uso avulso (onde vale
  // '' — a própria página já É o index.html da pasta vanishCam) quanto no embutido (onde vale o
  // caminho até a pasta vanishCam a partir da página do hospedeiro).
  function scriptBasePath(){
    const scripts = document.getElementsByTagName('script');
    for(let i=scripts.length-1;i>=0;i--){
      const src = scripts[i].getAttribute('src') || '';
      if(/(^|\/)embed-api\.js(\?.*)?$/.test(src)){
        return src.replace(/js\/embed-api\.js(\?.*)?$/, '');
      }
    }
    return './'; // fallback: assume que a página atual já está na raiz da pasta vanishCam
  }

  const STATE = { mounted:false, loaded:false, loadingPromise:null, resizeObserver:null, basePath: scriptBasePath() };

  function loadStylesheet(href){
    return new Promise((resolve, reject)=>{
      if(document.querySelector('link[data-vanishcam-css]')){ resolve(); return; }
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = href; link.setAttribute('data-vanishcam-css','1');
      link.onload = ()=>resolve();
      link.onerror = ()=>reject(new Error('vanishCam: falha ao carregar o CSS ('+href+')'));
      document.head.appendChild(link);
    });
  }

  function loadScriptSeq(src){
    return new Promise((resolve, reject)=>{
      const el = document.createElement('script');
      el.src = src;
      el.onload = ()=>resolve();
      el.onerror = ()=>reject(new Error('vanishCam: falha ao carregar o script ('+src+')'));
      document.body.appendChild(el);
    });
  }

  // Ordem EXATA de carregamento dos demais arquivos — a mesma ordem fixa dos <script> em
  // index.html (cada arquivo depende do que os anteriores definem; ver o comentário no topo de
  // js/main.js). embed-api.js NÃO entra nesta lista: ele é o próprio arquivo já carregado (é o que
  // está executando este código agora).
  const SCRIPTS = [
    'js/state.js', 'js/math3d.js', 'js/zip-lite.js', 'js/calibration.js', 'js/ui-controls.js',
    'js/project-io.js', 'js/canvas-render.js', 'js/corner-guide.js', 'js/main.js',
  ];

  // Rodada 32 (2026-09-09): lista COMPLETA de arquivos da pasta vanishCam (esta SCRIPTS acima +
  // index.html/css/README-embed.md/o próprio embed-api.js) — usada pelo botão "Baixar esta
  // versão" (janela Sobre, js/ui-controls.js) para saber quais arquivos buscar (fetch) e
  // empacotar num .zip montado no navegador (js/zip-lite.js), sem precisar manter uma cópia
  // estática desse .zip guardada na pasta do projeto.
  const ALL_FILES = ['index.html', 'css/style.css', 'README-embed.md', 'js/embed-api.js', 'js/embed-root-template.js'].concat(SCRIPTS);
  window.vanishCamFileList = function vanishCamFileList(){ return ALL_FILES.slice(); };

  // vanishCamBasePath() — caminho (relativo à página atual) até a raiz da pasta vanishCam. Vale
  // '' no uso avulso (a própria página é o index.html do vanishCam); no uso embutido, é o caminho
  // até a pasta vanishCam a partir da página do app hospedeiro (ex.: "vendor/vanishCam/").
  window.vanishCamBasePath = function vanishCamBasePath(){ return STATE.basePath; };

  // Insere (ainda escondido) o markup de #vanishcamRoot (todo o markup visível da interface — ver
  // index.html) no <body> do documento do HOSPEDEIRO, e carrega o CSS e os demais scripts na
  // sequência certa depois disso — eles fazem document.getElementById(...) já na primeira
  // execução, então o markup TEM que já estar no documento antes de qualquer um deles rodar.
  //
  // Rodada 33 (2026-09-09): pedido do usuário — antes, este markup era obtido com
  // fetch(base+'index.html'), mas fetch()/XMLHttpRequest para outro arquivo local FALHA quando a
  // página (tanto o vanishCam quanto o app hospedeiro) é aberta direto como file:// ("Failed to
  // fetch") — que é como o usuário roda os dois apps. Uma tag <script src> comum, ao contrário,
  // FUNCIONA em file://, então o markup de #vanishcamRoot passou a viver também dentro de um
  // arquivo .js (js/embed-root-template.js, gerado a partir de index.html por
  // js/build-embed-template.js — ver esse arquivo para o motivo completo), carregado abaixo como
  // qualquer outro <script> — sem fetch nenhum, funciona em file:// e também servido por http(s).
  async function ensureLoaded(base){
    if(STATE.loaded) return;
    if(STATE.loadingPromise) return STATE.loadingPromise;
    STATE.loadingPromise = (async ()=>{
      await loadStylesheet(base + 'css/style.css');
      await loadScriptSeq(base + 'js/embed-root-template.js');
      const html = window.__VANISHCAM_ROOT_HTML__;
      if(!html) throw new Error('vanishCam: js/embed-root-template.js não definiu __VANISHCAM_ROOT_HTML__ — a pasta vanishCam está desatualizada ou corrompida? (rode js/build-embed-template.js se você editou index.html à mão).');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      const root = wrapper.firstElementChild;
      if(!root || root.id !== 'vanishcamRoot') throw new Error('vanishCam: markup de #vanishcamRoot inválido em js/embed-root-template.js.');
      root.classList.add('hidden');
      document.body.appendChild(root);
      for(const src of SCRIPTS){ await loadScriptSeq(base + src); }
      STATE.loaded = true;
    })();
    return STATE.loadingPromise;
  }

  // vanishCamMount(container, opts?) — monta (ou remonta) a interface do vanishCam dentro do
  // elemento `container` fornecido pelo app hospedeiro. Retorna uma Promise (aguarde com
  // `await`/`.then()` — a primeira chamada busca e carrega todos os arquivos, o que não é
  // instantâneo). opts:
  //   - imageFile: um File ou Blob de imagem (ex.: vindo da câmera do dispositivo) para já
  //     carregar como a foto a calibrar. Opcional — sem ele, o vanishCam abre na tela inicial
  //     ("arraste uma imagem" / menu Arquivo), do jeito que abre avulso.
  //   - keepState: por padrão (false), toda chamada a vanishCamMount() começa uma instância NOVA
  //     e limpa (equivalente a "Novo", mas sem pedir confirmação — quem decide remontar já sabe o
  //     que está fazendo). Passe true para preservar a calibração/imagem atuais ao remontar (útil
  //     se o hospedeiro só escondeu/mostrou o container, sem querer perder o que estava lá).
  window.vanishCamMount = async function vanishCamMount(container, opts){
    opts = opts || {};
    if(!container || !(container instanceof Element)){
      throw new Error('vanishCamMount: informe um elemento DOM (ex.: document.getElementById(...)) como container.');
    }
    await ensureLoaded(STATE.basePath);
    const root = document.getElementById('vanishcamRoot');
    if(!opts.keepState && typeof resetProject === 'function') resetProject();
    root.classList.remove('hidden');
    root.classList.add('embedded');
    container.appendChild(root);
    STATE.mounted = true;
    // [15/09/2026 UTC] NOVO — `opts.skipCenterImage` (opcional, padrão false) repassado como
    // `{skipCenter:true}` pra `vanishCamLoadImage`/`loadImageFile` (js/project-io.js) — ver
    // comentário grande lá pro pedido/motivo completo (app hospedeiro: "se já tiver algo salvo
    // [para aquela foto], a imagem NÃO deve aparecer centralizada ao abrir").
    if(opts.imageFile) window.vanishCamLoadImage(opts.imageFile, { skipCenter: !!opts.skipCenterImage });
    // O container pode ainda não ter um tamanho definitivo no instante exato deste appendChild
    // (depende de quando o hospedeiro chama isto em relação ao próprio layout dele) — recalcula o
    // tamanho do canvas no próximo frame, já com o layout assentado.
    requestAnimationFrame(()=>{ if(typeof resizeCanvas === 'function') resizeCanvas(); });
    // Acompanha o TAMANHO do container do hospedeiro (não só da janela — o 'resize' da janela já
    // é tratado dentro do vanishCam, em canvas-render.js) — importante se o hospedeiro redimensiona
    // esse container sozinho (ex.: um layout flex/grid que dá mais ou menos espaço a ele) sem que a
    // janela do navegador mude de tamanho.
    if(typeof ResizeObserver !== 'undefined'){
      if(STATE.resizeObserver) STATE.resizeObserver.disconnect();
      STATE.resizeObserver = new ResizeObserver(()=>{ if(typeof resizeCanvas === 'function') resizeCanvas(); });
      STATE.resizeObserver.observe(container);
    }
    return true;
  };

  // vanishCamUnmount() — retira a interface do vanishCam do container onde estava, escondendo-a
  // (mas mantendo-a no documento, presa ao <body>) para o caso de o hospedeiro chamar
  // vanishCamMount() de novo depois. Retorna false se o vanishCam nunca chegou a ser carregado.
  window.vanishCamUnmount = function vanishCamUnmount(){
    const root = document.getElementById('vanishcamRoot');
    if(!root) return false;
    if(STATE.resizeObserver){ STATE.resizeObserver.disconnect(); STATE.resizeObserver = null; }
    root.classList.remove('embedded');
    root.classList.add('hidden');
    document.body.appendChild(root);
    STATE.mounted = false;
    return true;
  };

  // vanishCamIsMounted() — true enquanto a interface está montada/visível dentro do container do
  // hospedeiro (entre uma chamada a vanishCamMount() e a próxima vanishCamUnmount()).
  window.vanishCamIsMounted = function vanishCamIsMounted(){ return STATE.mounted; };

  // vanishCamLoadImage(fileOrBlob) — carrega (ou troca) a foto sendo calibrada, a partir de um
  // File ou Blob (ex.: vindo de <input type=file>, de uma captura de câmera, ou de qualquer outra
  // fonte do app hospedeiro) — o MESMO caminho usado por "Arquivo > Abrir imagem" na UI do
  // vanishCam (loadImageFile(), js/project-io.js): se já havia uma imagem carregada, troca só a
  // imagem preservando os pontos/calibração já desenhados; se é a primeira, usa posições padrão.
  // Só funciona depois de vanishCamMount() (é o que carrega loadImageFile() no documento).
  // [15/09/2026 UTC] `opts.skipCenter` (opcional) — ver comentário grande em `loadImageFile`
  // (js/project-io.js) e em `vanishCamMount` (`opts.skipCenterImage`) acima.
  window.vanishCamLoadImage = function vanishCamLoadImage(fileOrBlob, opts){
    if(!fileOrBlob) throw new Error('vanishCamLoadImage: informe um File ou Blob de imagem.');
    if(typeof loadImageFile !== 'function'){
      throw new Error('vanishCamLoadImage: vanishCam ainda não foi montado — chame (e aguarde) vanishCamMount() primeiro.');
    }
    loadImageFile(fileOrBlob, opts);
    return true;
  };

  // vanishCamGetCamProps() — devolve, DIRETO em JS (sem nenhum arquivo envolvido), os parâmetros
  // de câmera calculados a partir da calibração atual: o MESMO objeto que "Arquivo > Exportar >
  // Parâmetros da câmera como JSON" grava num arquivo .json (principalPoint, viewTransform,
  // cameraTransform, horizontalFieldOfView, verticalFieldOfView, vanishingPoints,
  // vanishingPointAxes, relativeFocalLength, imageWidth, imageHeight — ver
  // buildCameraDataObject(), js/project-io.js). Pode ser chamada a qualquer momento, quantas vezes
  // quiser (ex.: o hospedeiro consultando periodicamente para mostrar os valores "ao vivo" enquanto
  // o usuário ajusta os pontos de fuga). Retorna null se ainda não há calibração válida (nenhum
  // ponto de fuga suficiente, eixos duplicados, etc. — os mesmos casos que deixariam os campos do
  // painel direito mostrando "—").
  window.vanishCamGetCamProps = function vanishCamGetCamProps(){
    if(typeof buildCameraDataObject !== 'function') return null;
    return buildCameraDataObject();
  };
})();
