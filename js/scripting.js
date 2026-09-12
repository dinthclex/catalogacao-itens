/* js/scripting.js
 * NOVO (07/09/2026), pedido verbatim: "scripts para os objetos como no
 * Unity, só que em JavaScript. Útil para animações e interações por meio de
 * botões configuráveis no cenário. Desse modo, não é necessário programar um
 * app novo, pois os scripts podem mudar. Nessa parte, o app entra só como
 * interpretador e visualizador. [...] Tudo no objeto pode ser acessado e
 * alterado via script: vértices, cor, opacidade, ativo/não ativo,
 * selecionado/não selecionado, nome, etc. Por meio do próprio JavaScript
 * acessar os objetos, mudar suas propriedades."
 *
 * DECISÃO DE ESCOPO TRANSPARENTE (versão "enxuta" desta rodada, escolhida
 * explicitamente pelo usuário via pergunta de sequenciamento — "Tentar os
 * dois nesta rodada"): este motor cobre o que foi pedido de forma literal —
 * (1) um espaço pra guardar/editar/EXECUTAR um script JS por objeto
 * (`obj.scriptCode`, ver botão "🎬 Script"/"▶️ Executar script" no painel de
 * propriedades — mapview.js `_openObjectPanel`), com acesso de leitura/
 * escrita a QUALQUER propriedade do objeto (não uma lista fixa — o script
 * recebe a referência de verdade via SceneObjects.get, então `obj.cor = ...`
 * já é "tudo pode ser acessado e alterado"); (2) um registro genérico de
 * animações por quadro (`Scripting.tween`/`Scripting.tick`), que ANTES não
 * existia em lugar nenhum do app (`view3d.js` `_loop` só tinha comportamento
 * fixo, sem nenhum jeito de "agendar" uma animação de fora); (3) o exemplo
 * concreto pedido (botão descendo + parede de tijolos se empilhando), como
 * uma função de demonstração (`Scripting.runDemoWallBuild`) chamada por um
 * botão nas "Configurações 3D" (mapconfig.js, seção "🎬 Scripts (exemplo)").
 * NÃO foi implementado nesta rodada (escopo enxuto, reportado no changelog):
 * um sistema de "botões configuráveis DENTRO do cenário 3D" (ex.: um botão
 * clicável como malha 3D que players interativos apertam para disparar um
 * script) — o botão de demonstração hoje mora só no menu de Configurações
 * 3D, não como um objeto 3D clicável na cena; e disparo automático de script
 * por EVENTO (colisão, clique num objeto real da cena) — hoje a execução é
 * sempre manual, pelo botão "▶️ Executar script" do painel.
 *
 * [11/09/2026] ÍNDICE DE FUNÇÕES — cabeçalho adicionado pra evitar buscas
 * exaustivas (mesmo padrão de ambientephotos.js/mapping.js/db.js). Nota:
 * o disparo "ao clicar" foi migrado pro sistema de Componentes (ver
 * js/components.js `SceneEventBus`/`LegacyRawScript`), que chama de volta
 * `Scripting.run` internamente pra scripts legados — nenhuma função abaixo
 * mudou de lugar, só ganhou um chamador novo.
 * - tween: registra uma animação genérica por quadro (duração/easing/onUpdate).
 * - cancelTween: cancela uma animação em andamento pelo handle de `tween`.
 * - tick: avança todas as animações registradas em 1 quadro — chamado pelo
 *   loop de render de view3d.js/engine3d.js.
 * - run: executa o `scriptCode` de um objeto (acesso de leitura/escrita a
 *   qualquer propriedade dele via `SceneObjects.get`) — botão "▶️ Executar
 *   script" do painel de propriedades (mapview.js `_openObjectPanel`).
 * - runDemoWallBuild: demonstração concreta pedida (botão descendo + parede
 *   de tijolos se empilhando) — chamada pelo botão em "Configurações 3D"
 *   (mapconfig.js, seção "🎬 Scripts (exemplo)").
 * - _demoBuildBrickWall: monta a geometria/animação da parede de tijolos
 *   usada pela demonstração acima.
 * - _delay: helper interno (Promise/setTimeout) pra sequenciar passos com
 *   atraso dentro de um script/demonstração.
 */
window.Scripting = {
  _tweens: [],

  /** Registra uma animação genérica por quadro — o "motor de tween" que
   *  faltava no app (ver decisão de escopo acima). `opts`:
   *    - duration: segundos (obrigatório)
   *    - onUpdate(p, elapsed): chamado a cada quadro com `p` = progresso
   *      0..1 (já passado pela função de easing, se houver) e `elapsed` em
   *      segundos — quem chama decide o que fazer com isso (mover um
   *      THREE.Object3D, mudar uma propriedade de `obj`, etc.).
   *    - onComplete(): opcional, chamado uma vez quando `p` chega em 1.
   *    - easing: opcional, função (t:0..1) => 0..1 — padrão linear.
   *  Devolve um handle (objeto) que pode ser passado a `cancelTween` pra
   *  interromper antes da hora. */
  tween(opts) {
    const t = {
      elapsed: 0,
      duration: Math.max(0.001, opts.duration || 1),
      onUpdate: opts.onUpdate || (() => {}),
      onComplete: opts.onComplete || null,
      easing: opts.easing || ((x) => x),
      done: false,
    };
    this._tweens.push(t);
    return t;
  },

  /** Cancela uma animação em andamento (devolvida por `tween`) antes dela
   *  terminar sozinha — não chama `onComplete`. */
  cancelTween(handle) {
    if (!handle) return;
    handle.done = true;
    const i = this._tweens.indexOf(handle);
    if (i !== -1) this._tweens.splice(i, 1);
  },

  /** Avança todas as animações registradas em `dt` segundos — chamado a
   *  cada quadro pelo loop principal do 3D (ver view3d.js `_loop`/
   *  `_update`). Fica em silêncio (não faz nada) se não houver nenhuma
   *  animação pendente — custo zero no caminho comum. */
  tick(dt) {
    if (!this._tweens.length || !dt) return;
    // Percorre de trás pra frente pra poder remover terminadas com
    // `splice` sem bagunçar os índices dos que ainda faltam processar.
    for (let i = this._tweens.length - 1; i >= 0; i--) {
      const t = this._tweens[i];
      if (t.done) { this._tweens.splice(i, 1); continue; }
      t.elapsed += dt;
      const raw = Math.min(1, t.elapsed / t.duration);
      const p = t.easing(raw);
      try { t.onUpdate(p, t.elapsed); } catch (err) { console.error('[Scripting] erro num onUpdate de tween:', err); }
      if (raw >= 1) {
        t.done = true;
        this._tweens.splice(i, 1);
        if (t.onComplete) { try { t.onComplete(); } catch (err) { console.error('[Scripting] erro num onComplete de tween:', err); } }
      }
    }
  },

  // Easings prontos mais comuns — pra quem escrever um script não precisar
  // digitar a fórmula toda vez.
  EASE: {
    linear: (x) => x,
    easeInOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    easeOutBounce: (x) => {
      const n1 = 7.5625, d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    },
  },

  /** Executa o texto de um script JS no "contexto" de UM objeto da cena
   *  (`nome`, resolvido via SceneObjects — ver js/sceneobjects.js). O
   *  código recebe, como variáveis já prontas (sem precisar de import/
   *  require nenhum — "o app entra só como interpretador"):
   *    - obj: a referência de verdade do objeto (mutar `obj.x`/`obj.cor`/
   *      etc. já é mutar o mapa em memória — quem chamou `run` decide
   *      quando persistir, ver mapview.js `_openObjectPanel`, que chama
   *      `this._saveMap()` logo depois).
   *    - SceneObjects: pra acessar/mudar QUALQUER OUTRO objeto da cena pelo
   *      nome (o "dicionário" bpy.data.objects-like pedido pelo usuário).
   *    - Scripting: o próprio módulo, pra agendar animações (`Scripting.
   *      tween(...)`) de dentro do script.
   *    - THREE: a biblioteca Three.js (já carregada globalmente pelo app),
   *      pra quem quiser matemática/vetores prontos.
   *    - map: o mapa inteiro (objeto bruto) — acesso de escape-hatch pra
   *      casos que `obj`/`SceneObjects` não cobrem.
   *  Erros de sintaxe/execução são pegos e mostrados num toast (nunca
   *  travam o app) — "o app entra só como interpretador e visualizador",
   *  não deve quebrar por causa de um script com bug. */
  run(map, nome, codigo, extra = {}) {
    if (!codigo || !codigo.trim()) return;
    const rawObj = window.SceneObjects?.get?.(map, nome) || null;
    // [11/09/2026] NOVO — mesmo Proxy de alias inglês↔português usado pelo
    // executor de Componentes (`js/components.js` `_wrapScriptObj`/
    // `wrapScriptObj`): `obj.color` (etc.) lê/escreve o campo real
    // `obj.cor` por trás, sem mudar o dado de verdade salvo no mapa — ver
    // comentário grande em `js/components.js` (`DEFAULT_SCRIPT_CODE`).
    const obj = window.Components?.wrapScriptObj ? window.Components.wrapScriptObj(rawObj) : rawObj;
    try {
      // NOVO (07/09/2026) — `new Function(...)` (não `eval`) delimita o
      // script ao seu próprio escopo de parâmetros — ele NÃO enxerga
      // variáveis locais desta função (`map`, `nome`, `extra`, etc.), só o
      // que é passado explicitamente aqui. Não é um sandbox de segurança de
      // verdade (o script ainda roda com o mesmo acesso ao DOM/`window` que
      // o resto do app — pedido do usuário é justamente "o próprio
      // JavaScript acessar os objetos", sem isolamento de segurança
      // solicitado), só organização de escopo.
      const fn = new Function('obj', 'SceneObjects', 'Scripting', 'map', 'THREE', 'Utils', 'view3d', codigo);
      fn(obj, window.SceneObjects, window.Scripting, map, window.THREE, window.Utils, extra.view3d || null);
    } catch (err) {
      console.error('[Scripting] erro ao executar script:', err);
      window.Utils?.toast?.(`⚠️ Erro no script${nome ? ` de "${nome}"` : ''}: ${err.message || err}`, { type: 'danger', duration: 5000 });
    }
  },

  /** Exemplo de código PRONTO (texto, editável) equivalente ao que o botão
   *  de demonstração faz via `runDemoWallBuild` — só pra quem abrir o painel
   *  de um objeto e clicar em "Executar script" ter um ponto de partida
   *  visível/copiável (cola isto no campo "🎬 Script" de qualquer objeto e
   *  clica em "Executar"). */
  DEMO_SCRIPT_TEXT: [
    "// Exemplo: muda a cor e faz o objeto 'respirar' de tamanho (tween contínuo).",
    "obj.color = '#5ac8fa';",
    "obj.opacidade = 1;",
    "obj.ativo = true;",
    "Scripting.tween({",
    "  duration: 1.2,",
    "  easing: Scripting.EASE.easeInOutQuad,",
    "  onUpdate: (p) => { obj.height = 0.4 + p * 0.3; },",
    "  onComplete: () => console.log('animação concluída para', obj.nome),",
    "});",
  ].join('\n'),

  /** O exemplo de verdade pedido pelo usuário: "um botão [...] tem a
   *  animação de descida (um cubo esticado que desce). E, depois da
   *  animação [...], outros cubos (cubos escalados para ficarem no formato
   *  de tijolo) começam a se empilhar (em uma animação) de modo a construir
   *  uma parede." Roda direto na cena Three.js ATIVA (`engineScene`,
   *  `THREE.Scene` de verdade do View3D aberto no momento — ver
   *  mapconfig.js, que passa `opts.view3d._engine.scene`), com malhas
   *  TEMPORÁRIAS criadas na hora (não objetos persistidos no mapa — é uma
   *  demonstração do MOTOR de animação, não um gerador de parede de
   *  verdade para o mapa; ver decisão de escopo no topo do arquivo).
   *  Devolve `true` se conseguiu iniciar, `false` se não há uma cena 3D
   *  disponível agora (ex.: Visualização 3D fechada). */
  runDemoWallBuild(engineScene) {
    if (!engineScene || typeof THREE === 'undefined') {
      window.Utils?.toast?.('Abra a Visualização 3D primeiro — o exemplo precisa de uma cena 3D ativa.', { type: 'warn' });
      return false;
    }
    const grupo = new THREE.Group();
    grupo.name = 'ScriptingDemoWallBuild';
    engineScene.add(grupo);
    // Ponto de partida da demo — um pouco à frente da origem, pra não cair
    // exatamente em cima de paredes/objetos reais do mapa que já estejam ali.
    const baseX = 0, baseZ = -3, baseY = 0;
    // (1) "Botão": um cubo esticado (alto/fino, como um pistão) que desce
    // do alto até "encostar" no chão — a animação de descida pedida.
    const botaoGeo = new THREE.BoxGeometry(0.5, 1.4, 0.5);
    const botaoMat = new THREE.MeshStandardMaterial({ color: 0xff5a5f, roughness: 0.6, metalness: 0.1 });
    const botao = new THREE.Mesh(botaoGeo, botaoMat);
    botao.position.set(baseX, baseY + 3, baseZ);
    grupo.add(botao);
    const ALTURA_FINAL_BOTAO = baseY + 0.7;
    this.tween({
      duration: 0.8,
      easing: this.EASE.easeInOutQuad,
      onUpdate: (p) => { botao.position.y = (baseY + 3) + (ALTURA_FINAL_BOTAO - (baseY + 3)) * p; },
      onComplete: () => {
        // "depois da animação (ativado alguma coisa, por exemplo, a
        // execução de um script), outros cubos [...] começam a se
        // empilhar [...] de modo a construir uma parede."
        window.Scripting._demoBuildBrickWall(grupo, baseX, baseY, baseZ);
      },
    });
    window.Utils?.toast?.('🎬 Demo iniciada: aguarde o botão descer — a parede de tijolos começa a se empilhar em seguida.', { type: 'ok', duration: 4000 });
    return true;
  },

  /** Parte 2 do exemplo acima — chamada automaticamente quando o "botão"
   *  termina de descer. Cada tijolo (cubo ACHATADO, no formato de tijolo —
   *  "cubos escalados para ficarem no formato de tijolo", pedido do
   *  usuário) nasce longe, no alto, e anima até seu lugar final na fileira/
   *  camada da parede, uma leva de cada vez (empilhamento em camadas, não
   *  tudo de uma vez), com um pequeno atraso entre tijolos pra dar a
   *  sensação de "construção" acontecendo aos poucos. */
  _demoBuildBrickWall(grupo, baseX, baseY, baseZ) {
    const LARGURA_TIJOLO = 0.5, ALTURA_TIJOLO = 0.22, PROFUNDIDADE_TIJOLO = 0.24;
    const JUNTA = 0.02;
    const TIJOLOS_POR_FILEIRA = 6;
    const FILEIRAS = 4;
    const tijoloGeo = new THREE.BoxGeometry(LARGURA_TIJOLO, ALTURA_TIJOLO, PROFUNDIDADE_TIJOLO);
    const tijoloMat = new THREE.MeshStandardMaterial({ color: 0xb35a3a, roughness: 0.9, metalness: 0.02 });
    let atraso = 0;
    for (let fileira = 0; fileira < FILEIRAS; fileira++) {
      // Fileiras alternadas descolam meio tijolo (padrão real de alvenaria,
      // já que era fácil e deixa a demonstração mais parecida com uma
      // parede de verdade — não foi pedido explicitamente, mas é o
      // comportamento natural de "empilhar tijolos").
      const offsetFileira = (fileira % 2 === 1) ? (LARGURA_TIJOLO + JUNTA) / 2 : 0;
      for (let col = 0; col < TIJOLOS_POR_FILEIRA; col++) {
        const destinoX = baseX - ((TIJOLOS_POR_FILEIRA * (LARGURA_TIJOLO + JUNTA)) / 2) + col * (LARGURA_TIJOLO + JUNTA) + offsetFileira;
        const destinoY = baseY + ALTURA_TIJOLO / 2 + fileira * (ALTURA_TIJOLO + JUNTA);
        const destinoZ = baseZ;
        const tijolo = new THREE.Mesh(tijoloGeo, tijoloMat);
        tijolo.position.set(destinoX, destinoY + 4, destinoZ); // nasce no alto, cai até o lugar
        grupo.add(tijolo);
        const yInicial = destinoY + 4;
        const atrasoDoTijolo = atraso;
        atraso += 0.05; // cada tijolo começa um pouquinho depois do anterior
        window.Scripting._delay(atrasoDoTijolo, () => {
          window.Scripting.tween({
            duration: 0.35,
            easing: window.Scripting.EASE.easeOutBounce,
            onUpdate: (p) => { tijolo.position.y = yInicial + (destinoY - yInicial) * p; },
          });
        });
      }
    }
  },

  /** Atalho pra "espera X segundos e então roda". Como este módulo não tem
   *  `setTimeout` de verdade sincronizado com o loop do 3D (poderia disparar
   *  enquanto a Visualização 3D estivesse fechada/pausada), implementa o
   *  atraso como um tween "vazio" que só chama `onComplete` — reaproveita o
   *  mesmo `tick()` já ligado ao loop principal. */
  _delay(segundos, fn) {
    if (segundos <= 0) { fn(); return; }
    this.tween({ duration: segundos, onUpdate: () => {}, onComplete: fn });
  },
};
