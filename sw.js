const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/modeler3d.css',
  './lib/quagga.min.js',
  './lib/three.module.js',
  './lib/three.global.js',
  './lib/jszip.min.js',
  './js/lib/tweenengine.js',   // [26/09/2026] NOVO -- motor de tween/interpolação (window.TWEEN), sintaxe Tween.js, sem dependência de rede
  './lib/codemirror/lib/codemirror.js',
  './lib/codemirror/lib/codemirror.css',
  './lib/codemirror/mode/javascript/javascript.js',
  './js/dbmonitor.js',   // [01/10/2026] NOVO -- monitor do IndexedDB
  './js/db.js',
  './js/utils.js',
  './js/modulehost.js',
  './js/flip.js',
  './js/botoeslayout.js',
  './js/camcontrol3d.js',
  './js/eventlog.js',
  './js/icons.js',
  './js/objimport.js',
  './js/devicefingerprint.js',
  './js/session.js',
  './js/geo.js',
  './js/perf.js',
  './js/history.js',
  './js/avatar.js',
  './js/barcode.js',
  './js/libloader.js',
  './js/mapping.js',
  './js/objecttypes/object-type-registry.js',
  './js/objecttypes/camera.js',
  './js/organizeview.js',
  './js/automation.js',   // [26/09/2026] NOVO -- Módulo de Automação e Scripts globais (window.AutomationManager)
  './js/ambientephotos.js',
  './js/model3dloader.js',
  './js/glbmeshsource.js',
  './js/objmeshsource.js',
  './js/objectassets.js',
  './assets/js/mostrador-canvas.js',
  './js/engine3d-profiles.js',
  './js/objcategorias.js',
  './js/novosobjetos.js',
  './assets/modelos/js/_novos-objetos.js',
  './js/rack-modular.js',
  './js/rack-cable-routing.js',
  './js/wifi-signal.js',
  './js/radio-wave-raytracer.js',
  './js/wifi-signal-avancado.js',
  './js/rede-passiva.js',
  './js/rede-docs.js',
  './js/ap-docs.js',   // [25/09/2026] NOVO -- documentação do Access Point (faltava no pré-cache)
  './js/scripts-docs.js',   // [27/09/2026] NOVO -- documentação do painel Scripts (parser/API)
  './js/hardware-catalog.js',   // [28/09/2026] NOVO -- catálogo/matriz de compatibilidade do Simulador de Hardware
  './js/hardware-sim.js',   // [28/09/2026] NOVO -- motor de simulação (montagem, cabos internos, snap) do Simulador de Hardware
  './js/hardware-docs.js',   // [28/09/2026] NOVO -- documentação do Simulador de Hardware
  './js/hardware-exploded.js',   // [28/09/2026] NOVO -- motor de "Exploded View Assembly" (montar/desmontar peças do gabinete)
  './js/personagem-mapa.js',   // [26/09/2026] NOVO -- personagem guardado junto com cada mapa
  './js/rede-equip.js',
  './js/rede-storage-energia.js',
  './js/patch-cord.js',
  './js/maptxt.js',
  './js/engine3d.js',
  './js/engine3d-rede-mesh.js',
  './js/modeler/modeler-font.js',
  './js/objecttypes/texto3d.js',
  './js/texto3d-cruz.js',
  './js/polybool2d.js',
  './js/objecttypes/piso-custom.js',
  './js/objecttypes/teto-custom.js',
  './js/objecttypes/telha-custom.js',
  './js/piso-custom-edit.js',
  './js/modeler/modeler-mesh.js',
  './js/modeler/modeler-gizmo.js',
  './js/modeler/modeler-render.js',
  './js/modeler/modeler-input.js',
  './js/modeler/modeler-ui.js',
  './js/modeler/modeler-core.js',
  './js/email.js',
  './js/autosave.js',
  './js/sync.js',
  './js/autoexport.js',
  './js/serverprefs.js',
  './js/p2p.js',
  './js/localbackup.js',
  './js/storagestatus.js',
  './js/table.js',
  './js/flashcards.js',
  './js/capture.js',
  './js/mapconfig.js',
  './js/mapselection.js',
  './js/mapview.js',
  './js/mapview-camadas.js',   // [01/10/2026] NOVO -- janela Camadas extraída de mapview.js
  './js/photogrid.js',
  './js/view3d.js',
  './js/view3d-rede.js',
  './js/modelos3d.js',
  './js/search.js',
  './js/verlistasimples.js',
  './js/exportdeps.js',
  './js/settings.js',
  './js/unify.js',
  './js/app.js',
  './js/steprecorder.js',   // [63ª] gravador de passos (step events)
  './js/cards/cards.css',
  './js/cards/object-card.js',
  './js/cards/foto-pin-card.js',
  './js/cards/tijolo-aglomerado-card.js',
  './js/cards/orphan-patrimonio-card.js',
  './js/cards/confirm-card.js',
  './js/cards/importar-objeto-card.js',
  './js/cards/object-panel-card.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(APP_SHELL.map((url) => fetch(url, { cache: 'reload' }).then((res) => cache.put(url, res)))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = isSameOrigin && (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html'));
  if (isNavigation) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html'))),
    );
  } else if (isSameOrigin) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req)),
    );
  }
});
const CACHE_VERSION = 'catalogo-v872';   // [03/10/2026, 93ª rodada] ícone da Janela nas configurações 3D = o da ferramenta Janela.  ANTERIOR: v871 —  //    // [03/10/2026, 92ª rodada] botões do gizmo dentro do mapa (abaixo das janelas); Porta/Janela separados nas configurações; vidro 'Leve'/'Translúcido PBR'.  ANTERIOR: v870 —   // [03/10/2026, 91ª rodada] janela de propriedades acima dos botões do gizmo; opção de vidro da janela (3D); botão 🗒️ também no modo vértices; Andar/Y global/Y local em porta, janela, imagem e rack.  ANTERIOR: v869 —   // [03/10/2026, 90ª rodada] rodapé 2D quebra a partir do ◀; toggle de união por telhado; refração dos vidros nas Configurações 3D.  ANTERIOR: v868 —   // [03/10/2026, 89ª rodada] telha: ghost, toggle gizmo/vértices, clique no contorno, personagem nas águas, união em cadeia, otimização 3D.  ANTERIOR: v867 —   // [03/10/2026, 88ª rodada] desenho de referência (Piso/Teto); Telha com 1–4 águas e união de telhados.  ANTERIOR: v866 —   // [03/10/2026, 87ª rodada] snap nos vértices; Teto ligado ao CustomCeiling; objeto Telha (CustomRoof).  ANTERIOR: v865 —   // [03/10/2026, 86ª rodada] chão do Piso com cache; vértice 3D segue a mira; tolerância de borda padrão ligada; Teto sem gizmo na inserção; CustomCeiling.  ANTERIOR: v864 —   // [03/10/2026, 85ª rodada] chão só na superfície do Piso; arrasto de vértice 3D sem salto; sem camada Recuperados; Trena: sem Polilinha, tolerância de borda, janelinha segue o botão.  ANTERIOR: v863 —   // [03/10/2026, 84ª rodada] picking (far do raycaster); Piso: ghost, Recorte liga/desliga, ícone, caixa real; camada Recuperados; OBJETOS PADRÃO.  ANTERIOR: v862 —   // [03/10/2026, 83ª rodada] malha individual (especial/modificado); duplo clique abre janela nas ferramentas com hover; ordem das seções 3D; catálogo Padrão × Especiais.  ANTERIOR: v861 —   // [03/10/2026, 82ª rodada] 2D/3D mesmos objetos; gizmo ao vivo no 3D; escala dos moldes pelo tamanho real (pilar).  ANTERIOR: v860 —   // [03/10/2026, 81ª rodada] malhaPropria: dados do 2D > moldes (regra geral); Piso sempre malha própria; vértices só com seleção.  ANTERIOR: v859 —   // [03/10/2026, 80ª rodada] Piso editado ignora o molde estático (malhaPropria) e 2D<->3D em tempo real.  ANTERIOR: v858 —   // [03/10/2026, 79ª rodada c] Piso: 3D atualizado direto por id após cada edição no 2D (PisoCustom.forcar3D).  ANTERIOR: v857 —   // [02/10/2026, 79ª rodada b] cliques no mapa desmontado não dão erro.  ANTERIOR: v856 —   // [02/10/2026, 79ª rodada] ＋ Vértice por clique grava e atualiza o 3D (Workspace).  ANTERIOR: v855 —   // [02/10/2026, 78ª rodada] Configurações › Mapa, 3D e aparelho: seções do HUD em diante voltam a ser cards (</div> sobrando).  ANTERIOR: v854 —   // [02/10/2026, 77ª rodada] malha 3D do Piso atualiza ao vivo; ＋ Vértice na linha do piso; recorte desenhado como polilinha (forma livre).  ANTERIOR: v853 —   // [02/10/2026, 76ª rodada] Trena sem '(de medir)'; ghost/gizmo do Piso; botões do Piso no cabeçalho 2D; recortes (polybool2d); 3D aplica recortes.  ANTERIOR: v852 —   // [02/10/2026, 75ª rodada] Piso com contorno livre/furos (CustomFloor), vértices arrastáveis no 2D e no 3D.  ANTERIOR: v851 —   // [02/10/2026, 74ª rodada] caixa de hover do Texto = caixa do Texto; sem gizmo próprio (só o do Modelador); cruz de origem na aba Texto; ícone recolher esquerdo preenchido.  ANTERIOR: v850 —   // [02/10/2026, 73ª rodada] gizmo do Texto = caixa (estica o Texto); gizmo 3D XYZ; recolher do menu esquerdo; Objetos com todos.  ANTERIOR: v849 —   // [02/10/2026, 72ª rodada] gizmo do Texto no 2D; subtítulos Modificação/Chanfro; destaque dos alinhamentos; aba Texto segue o Texto selecionado.  ANTERIOR: v848 —   // [02/10/2026, 71ª rodada] caixa de seleção do Texto 2D = caixa amarela; aba Texto do 3D com scroll e seções recolhíveis.  ANTERIOR: v847 —   // [02/10/2026, 70ª rodada] aba Texto na barra lateral 3D; Lápis só colinear; junção de cantos não distorce curvas.  ANTERIOR: v846 —   // [02/10/2026, 69ª rodada] Texto unificado 2D/3D (tipo texto3d), alinhamento pela origem, subtítulos, Lápis funde colineares.  ANTERIOR: v845 —   // [02/10/2026, 68ª rodada] Texto 3D (Blender) no Modelador; cartão de porta/janela = cartão de objeto.  ANTERIOR: v844 —   // [02/10/2026, 67ª rodada] cartão de opções de porta/janela no Modo Edição 3D; ⇔ da pílula.  ANTERIOR: v843 —   // [02/10/2026, 66ª rodada] modelos fixos/malha própria seguem dimensões; gravador de passos desligado + seções 2D/3D.  ANTERIOR: v842 —   // [02/10/2026, 65ª rodada] modelo fixo escala com as dimensões; seção do gravador nas configurações.  ANTERIOR: v841 —   // [02/10/2026, 64ª rodada] diagnóstico do painel 3D no gravador.  ANTERIOR: v840 —   // [01/10/2026, 63ª rodada] gravador de passos (step events).  ANTERIOR: v839 —   // [01/10/2026, 62ª rodada] propriedades -> Transformação espelha Dimensões/Escala.  ANTERIOR: v838 —   // [01/10/2026, 61ª rodada] janela de propriedades espelha dimensões/cores (Transformação).  ANTERIOR: v837 —   // [01/10/2026, 60ª rodada] dimensões ao vivo também em formas redondas (Transformação).  ANTERIOR: v836 —   // [01/10/2026, 59ª rodada] dimensões do objeto sempre prevalecem (pilar, escada).  ANTERIOR: v835 —   // [01/10/2026, 58ª rodada] pilar/formas redondas/luminária de mesa seguem as dimensões.  ANTERIOR: v834 —   // [01/10/2026, 57ª rodada] luminária de mesa: script de duplo clique liga/desliga.  ANTERIOR: v833 —   // [01/10/2026, 56ª rodada] luminária de mesa redesenhada.  ANTERIOR: v832 —   // [01/10/2026, 55ª rodada] quebra de linha do editor = a do 3D; edição de texto otimizada.  ANTERIOR: v831 —   // [01/10/2026, 54ª rodada c] rolagem só na área da folha.  ANTERIOR: v830 —   // [01/10/2026, 54ª rodada b] folha do editor maior, modal com rolagem.  ANTERIOR: v829 —   // [01/10/2026, 54ª rodada] Trena: esfera do ponto médio respeita oclusão; editor da folha = folha A4 com pauta.  ANTERIOR: v828 —   // [01/10/2026, 53ª rodada] Workspace: foco do teclado por painel.  ANTERIOR: v827 —   // [01/10/2026, 52ª rodada] folha em edição fixada na camada alta do atlas.  ANTERIOR: v826 —   // [01/10/2026, 51ª rodada] atlas: anti-vazamento, LOD 256/512/1024, instanciamento ligado, correção do desenho duplo de instâncias.  ANTERIOR: v825 —   // [01/10/2026, 50ª rodada] atlas de texturas das folhas de papel.  ANTERIOR: v824 —   // [01/10/2026, 49ª rodada] hit-test por topo (Selecionar); editor da folha reorganizado.  ANTERIOR: v823 —   // [01/10/2026, 48ª rodada] clique por topo; texto da folha a cada tecla; fonte/linhas da folha.  ANTERIOR: v822 —   // [01/10/2026, 47ª rodada] clique 2D por elevação; texto da folha no 3D após 3 s.  ANTERIOR: v821 —   // [01/10/2026, 46ª rodada] GridHelper; centralização; sincronia Propriedades⇄Transformação; destaque da bússola.  ANTERIOR: v820 —   // [01/10/2026, 35ª rodada] cor do objeto no 3D; animação 2D em Configurações 2D (fora da ficha do patrimônio); colar mantém camada; fichas 3D abaixo do cabeçalho.  ANTERIOR: v809 —    // [01/10/2026, 34ª rodada] seletor de animação 2D/3D na ficha do patrimônio; colar objetos = clone exato (sem empilhamento).  ANTERIOR: v808 —    // [01/10/2026, 33ª rodada] posição do patrimônio = objeto vinculado; X/Z; 👁️2D abre Planta baixa; Enter no histórico.  ANTERIOR: v807 —    // [01/10/2026, 32ª rodada] Enter nas especificações; patrimônio acima de especificações; '+ Novo' no seletor de patrimônio; histórico na ficha 3D Completa.  ANTERIOR: v806 —    // [01/10/2026, 31ª rodada] Monitor do IndexedDB: aba 'Funções que gravam' (contador + último/mais rápido/mais demorado).  ANTERIOR: v805 —    // [30/09/2026, 16ª rodada] selos 3D (patrimônio/Histórico/Especificações) empilhados na vertical, sem sobreposição.  ANTERIOR (15ª rodada): [30/09/2026, 15ª rodada] fichas renumeradas pelas ativas; configurações 3D com rádio (2 estados); selos Histórico/Especificações em todos os construtores + ao vivo.  ANTERIOR (14ª rodada): [30/09/2026, 14ª rodada] reaplica a 13ª em view3d.js/mapview.js; seção Ficha do objeto resumida c/ subtítulos; caixa de parede no 2º ponto; ficha flutuante como padrão; raycaster só no 'i' + destaque; fichas recortadas nas bordas.  ANTERIOR (13ª rodada): [30/09/2026, 13ª rodada] caixa de medida de parede ancorada no mundo; busca de Objetos com padrão 'Compactar'; 'ℹ️' ativo até fechar a ficha; múltiplas fichas flutuantes com cor+número+linha.  ANTERIOR (12ª rodada): [30/09/2026, 12ª rodada] caixa de medida de parede na posição do clique; rodapé x/y/z durante o voo; janela Objetos 500x500 em paisagem; busca de objetos (títulos fixos + modo compacto); selo 'i' nítido; ficha flutuante sobre o objeto.  ANTERIOR (11ª rodada): [30/09/2026, 11ª rodada] MUDADO: 'Ver em 3D' agora mostra uma caixa de medida PRÓPRIA por parede colocada (fade independente); CORRIGIDO: 'A camada que estava ativa no 2D' passa a ser o padrão de verdade (migração única + reset apaga chaves legadas).  ANTERIOR (10ª rodada): [30/09/2026, 10ª rodada] CORRIGIDO: botão "Unir à parede" (porta/janela) podia unir a uma parede errada quando havia outra parede próxima em camada diferente (agora prioriza a parede mais PRÓXIMA, camada só desempata paredes coincidentes); NOVO: no "Ver em 3D", a medida da parede recém-colocada agora fica visível por ~1,8s e desvanece antes de a medida ao vivo assumir de novo; confirmado que "Itens construídos dentro do 3D" já volta para "A camada que estava ativa no 2D" nas Configurações de Fábrica (padrão já correto no DEFAULTS e no fallback do 3D)
