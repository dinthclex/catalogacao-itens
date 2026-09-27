/**
 * scripts-docs.js — [27/09/2026] NOVO
 *
 * Pedido verbatim: "Coloque nas 'configurações 2D', uma seção com a documentação sobre o
 * 'Scripts', tudo detalhado, o parser, 'Select()' como querySelectorAll(), porém adaptado ao
 * app, tudo. Faça do mesmo jeito que na seção '🔌 Infraestrutura de rede', onde tem uma breve
 * descrição e um botão que dá acesso à documentação."
 *
 * Janela de DOCUMENTAÇÃO (sem nenhum campo de configuração): `ScriptsDocs.abrir()` — mesmo
 * padrão de js/rede-docs.js (RedeDocs.abrir)/js/ap-docs.js (ApDocs.abrir), reaproveitando a
 * mesma estrutura de modal/handle/chips/seções. Sem ilustrações 3D/SVG (não faz sentido pra
 * este conteúdo, que é sobre o MOTOR de seleção/API de scripts, não sobre a aparência de um
 * objeto) — em vez disso, blocos de código (<pre>) com exemplos reais, copiados/adaptados dos
 * comentários grandes de js/automation.js, pra manter a mesma precisão do comportamento real.
 * Módulo UMD (window.ScriptsDocs / module.exports), igual a rede-docs.js/ap-docs.js.
 */
(function (raiz) {
  'use strict';

  const _esc = (s) => (raiz.Utils && raiz.Utils.escapeHtml) ? raiz.Utils.escapeHtml(String(s)) : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _lista = (arr) => '<ul style="margin:4px 0 8px; padding-left:18px">' + arr.map((x) => '<li>' + x + '</li>').join('') + '</ul>'; // itens já vêm com _esc aplicado onde precisa (alguns têm <code>)
  const _codigo = (txt) => `<pre style="margin:6px 0 10px; padding:10px 12px; border-radius:8px; background:rgba(0,0,0,0.35); border:1px solid var(--border); overflow-x:auto; font-size:12px; line-height:1.5"><code>${_esc(txt)}</code></pre>`;

  // ==========================================================================
  // 1) SEÇÕES
  // ==========================================================================
  const SECOES = [
    { id: 'visao-geral', icone: '🎬', nome: 'O que é o painel "Scripts"',
      itens: [
        'Scripts são GLOBAIS (não vivem dentro de um mapa específico) — a lista aparece igual em qualquer mapa aberto. Cada script tem: nome, código (JavaScript), uma "entrada para seletores" (opcional), um <code>&lt;select&gt;</code> de "método" (roda ao Executar) e o checkbox "Manter alterações ao desexecutar/excluir".',
        'O botão alternador 🚫/👁️ de cada linha liga/desliga o script — chama <code>AutomationManager.run()</code> (ícone muda pra 👁️, script "em execução") ou <code>.stop()</code> (ícone volta pra 🚫) no mesmo botão.',
        'O código de nível superior (tudo que NÃO está dentro de uma função) roda sempre, ao clicar no botão alternador 🚫/👁️ pra EXECUTAR — mesmo que o script só declare funções (nada "solto" pra fazer). Uma função só roda se for escolhida no <code>&lt;select&gt;</code> de "método" (ou for um dos 4 ganchos de nome fixo, ver seção própria abaixo).',
      ] },
    { id: 'select-parser', icone: '🔎', nome: '"Select(seletor)" — como o querySelectorAll(), adaptado ao app',
      itens: [
        '<code>Select(seletor)</code> é o equivalente do <code>document.querySelectorAll(seletor)</code> do DOM, só que pesquisando os OBJETOS DA CENA (paredes, pisos, objetos, portas, janelas, textos, medidas, traços) em vez de elementos HTML — devolve uma <code>SelectionCollection</code> (ver próxima seção), nunca uma lista "morta": os itens são as referências DE VERDADE do mapa, mutáveis direto.',
        'A sintaxe é PRÓPRIA do app (não é o motor de seletor CSS do navegador) — inspirada em CSS, mas com alguns símbolos com significado diferente do CSS puro. Suporta:',
      ] },
    { id: 'select-sintaxe', icone: '📖', nome: 'Sintaxe completa do seletor', itens: [] }, // preenchida via bloco de código abaixo (ver `html()`)
    { id: 'select-metodos', icone: '🧰', nome: 'Métodos de uma seleção (SelectionCollection)',
      itens: [
        '<code>.each(fn)</code> / <code>.forEach(fn)</code> — escape-hatch: roda <code>fn(objeto)</code> em cada item, JS puro (leitura/escrita de qualquer propriedade).',
        '<code>.set(prop, valor)</code> — atalho de <code>.each()</code> pra escrever a MESMA propriedade em todos os itens de uma vez.',
        '<code>.hide()</code> / <code>.show()</code> — escreve <code>visibility = false/true</code> direto no objeto (2D e 3D) — como <code>visibility:hidden</code> no DOM: o objeto continua de verdade na cena (raycastável, "em funcionamento"), só não é desenhado.',
        '<code>.opacity(v)</code> (0 a 1) — escreve <code>opacidade = v</code> direto no objeto (2D e 3D) — mesmo padrão simples de <code>.hide()</code>/<code>.show()</code> com <code>visibility</code>.',
        '<code>.highlight(ligar = true)</code> — escreve <code>destacado = ligar</code> direto no objeto — efeito "✨ Destacar" (2D e 3D). Chamado sem nada (<code>.highlight()</code>) LIGA o destaque; <code>.highlight(false)</code> DESLIGA (ver seção "Chamar com ou sem argumento" mais abaixo pra entender esse padrão).',
        '<code>.blink(opts)</code> — pisca a opacidade via tween em loop (efeito de alerta).',
        '<code>.animate(propsFinais, duracaoMs, opts)</code> — anima QUALQUER propriedade numérica até um valor (absoluto, ex. <code>0.4</code>, ou relativo, ex. <code>\'+=0.06\'</code>) usando o motor Tween.js do app — aceita <code>yoyo</code>, <code>repeat</code> e <code>easing</code> (<code>TWEEN.Easing...</code>).',
        '<code>.move(dx, dy, dz)</code> / <code>.moveTo(x, y, z)</code> — desloca/define posição (usa o campo <code>elevacao</code> pra altura, quando só o 3º argumento é dado).',
        '<code>.rotate(graus)</code> — soma graus ao <code>angulo</code> do objeto.',
        '<code>.scale(fator)</code> — multiplica <code>largura</code>/<code>altura</code>/<code>profundidade</code> pelo fator (o app não tem um campo de "escala" separado — mexe direto nas dimensões).',
        '<code>.ligar()</code> / <code>.desligar()</code> — liga/desliga equipamentos de rede (mesmo campo <code>rede.ligado</code> que Access Point/Rack já leem).',
        '<code>.trancar()</code> / <code>.destrancar()</code>, <code>.abrirTampa()</code> / <code>.fecharTampa()</code>, <code>.abrirPorta()</code> / <code>.fecharPorta()</code>, <code>.iniciarVarredura()</code> — ações específicas de porta/gabinete/Access Point.',
        '<code>.aparecer(duracaoMs)</code> / <code>.desaparecer(duracaoMs)</code> — fade de opacidade animado (0↔1), diferente de <code>.opacity()</code> instantâneo.',
        '<code>.filhos()</code> / <code>.pai()</code> — navega a hierarquia real (<code>paiId</code>), quando existir.',
      ] },
    { id: 'chamada-argumentos', icone: '🎚️', nome: 'Chamar COM ou SEM argumento — quando cada forma faz sentido',
      itens: [
        'Regra geral (JavaScript comum, não é nada especial deste app): uma função pode ter um "valor padrão" declarado pro argumento (escrito <code>= algumaCoisa</code> na definição dela) — chamando SEM nada dentro dos parênteses, esse valor padrão é usado; chamando COM um valor explícito, ele troca o padrão. As DUAS formas são só JEITOS DIFERENTES de chamar a MESMA função — nunca duas funções diferentes.',
        '<b><code>Select()</code> vs <code>Select(\'*\')</code></b> — os dois SELECIONAM (mesma função, <code>Select</code>), mas com um padrão diferente de "nenhum argumento": <code>Select()</code> (ou <code>Select(\'\')</code>, string vazia) usa a "entrada para seletores" da PRÓPRIA linha do script (ver seção própria acima) — se essa entrada estiver vazia, não seleciona NADA. <code>Select(\'*\')</code> é um argumento EXPLÍCITO (o caractere <code>*</code>) que sempre seleciona TUDO, mesmo que a entrada da linha esteja vazia ou tenha outra coisa escrita — um argumento explícito sempre vence sobre o padrão. Qualquer outro seletor explícito (<code>Select(\'.classe\')</code>, <code>Select(\'parede\')</code>...) funciona do mesmo jeito: ignora a entrada da linha e usa exatamente o que foi passado.',
        '<b><code>.highlight()</code> vs <code>.highlight(false)</code></b> — mesma função (<code>highlight</code>), o argumento <code>ligar</code> tem padrão <code>true</code>: <code>.highlight()</code> (nada dentro dos parênteses) = <code>.highlight(true)</code> = LIGA o destaque. <code>.highlight(false)</code> passa o valor explícito <code>false</code> = DESLIGA o destaque nesse mesmo objeto (funciona dentro do MESMO script, sem precisar clicar em 👁️/🚫 — é só uma escrita direta de propriedade por baixo, igual <code>.hide()</code>/<code>.show()</code>).',
        'A mesma ideia vale pra vários outros métodos da lista acima — cada um com seu próprio padrão, sempre documentado entre parênteses aqui: <code>.abrirTampa(anguloAbertura = 100)</code>/<code>.fecharTampa(anguloAbertura = 100)</code> (sem argumento = 100°), <code>.abrirPorta(duracaoMs = 500, grausAbertura = 90)</code> (sem argumento nenhum = 500ms/90° — <code>.abrirPorta(1200)</code> só troca a duração, mantendo 90°; <code>.abrirPorta(1200, 45)</code> troca os dois), <code>.fecharPorta(duracaoMs = 500)</code>, <code>.aparecer(duracaoMs = 400)</code>/<code>.desaparecer(duracaoMs = 400)</code>, <code>.animate(propsFinais, duracaoMs = 800, opts = {})</code> (só <code>propsFinais</code> é obrigatório), <code>.blink(opts = {})</code> (sem nada usa <code>{ min: 0.15, duration: 300 }</code> e repete pra sempre).',
        'Métodos SEM nenhum argumento opcional (sempre chamados vazios, não têm "padrão" pra trocar): <code>.hide()</code>, <code>.show()</code>, <code>.ligar()</code>, <code>.desligar()</code>, <code>.trancar()</code>, <code>.destrancar()</code>, <code>.iniciarVarredura()</code>, <code>.filhos()</code>, <code>.pai()</code>.',
        'Métodos SEM valor padrão (o argumento é OBRIGATÓRIO — chamar sem nada dá <code>undefined</code>/erro, não um "padrão razoável"): <code>.opacity(v)</code>, <code>.move(dx, dy, dz)</code>, <code>.moveTo(x, y, z)</code>, <code>.rotate(graus)</code>, <code>.scale(fator)</code>, <code>.set(prop, valor)</code>. Sempre passe o(s) valor(es) pra estes.',
      ] },
    { id: 'object-fn', icone: '🎯', nome: '"Object(nome)" — equivalente a bpy.data.objects[nome] do Blender',
      itens: [
        '<code>Object(\'NomeDoObjeto\')</code> acha UM objeto específico pelo Nome (aba "Propriedades" dele) e devolve ele já "rastreado" (mesmo Proxy do <code>Select()</code>, com rollback automático e refresh 3D ao vivo) — permite atribuição DIRETA de propriedade, sem chamar <code>.hide()</code>/<code>.set()</code> nem embrulhar num <code>SelectionCollection</code> de 1 item: <code>Object(\'AP1\').visibility = false;</code>. Devolve <code>null</code> se não achar nenhum objeto com esse nome.',
        'Os Nomes são únicos em toda a cena (mesmo entre coleções diferentes — parede, objeto, porta... — ver <code>Mapping._allSceneNames</code>), então <code>Object(nome)</code> nunca é ambíguo.',
        'Por baixo dos panos, <code>Object(nome)</code> é um atalho pro dicionário global <code>SceneObjects</code> (mesma ideia do <code>bpy.data.objects</code> do Blender, mas SEM o rastreamento/rollback do <code>Object()</code> acima — use estes quando só precisa LER/LISTAR, não escrever): <code>SceneObjects.all(map)</code> devolve TODOS os objetos nomeados da cena, como <code>{ kind, nome, ref, colecao }</code> (<code>kind</code> é <code>\'objeto\'</code>/<code>\'parede\'</code>/<code>\'porta\'</code>/<code>\'janela\'</code>/<code>\'texto\'</code>/<code>\'medida2d\'</code>/<code>\'traco2d\'</code>); <code>SceneObjects.names(map)</code> só os Nomes; <code>SceneObjects.byName(map, nome)</code> uma entrada específica (com <code>colecao</code>); <code>SceneObjects.get(map, nome)</code> só a referência <code>ref</code> de verdade (o mesmo que <code>Object(nome)</code> devolve, mas sem o Proxy/rollback). Dentro de um script, <code>map</code> é implícito — use o mapa atual do próprio ambiente de execução (o mesmo que <code>Select()</code> já usa).',
      ] },
    { id: 'atribuicao-metodo-vs-direta', icone: '🖊️', nome: 'Duas formas de mudar um objeto: por método (<code>()</code>) ou por atribuição direta (<code>=</code>)',
      itens: [
        'MÉTODO (<code>.algo()</code>) — chamado numa <code>SelectionCollection</code> (<code>Select(...).hide()</code>) ou no resultado de <code>Object(nome)</code> (<code>Object(nome).algo()</code>, quando esse método também existir num objeto único — ver lista completa na seção anterior). Cada método já sabe QUAL propriedade mexer e às vezes faz mais que uma escrita simples (ex.: <code>.opacity()</code> cria uma regra sintética em vez de escrever um campo solto; <code>.animate()</code> usa o motor de tween; <code>.scale()</code> multiplica 3 campos de uma vez). Prefira método quando um existir pro que você quer fazer.',
        'ATRIBUIÇÃO DIRETA (<code>propriedade = valor</code>) — só em <code>Object(nome)</code> (um objeto só) ou dentro de <code>.each(obj => { ... })</code>/<code>.forEach(...)</code> de uma <code>SelectionCollection</code> (um por vez, à mão). Escreve o CAMPO relacionado sem passar por um método — é a única forma de mudar uma propriedade que NÃO tem método próprio (ex.: <code>largura</code>/<code>altura</code>/<code>profundidade</code> INDIVIDUALMENTE — <code>.scale()</code> só multiplica as 3 juntas — ou qualquer campo específico de um tipo de objeto, como <code>anguloAbertura</code> de uma porta).',
        'Ambas as formas passam pelo MESMO rastreamento/rollback (ver "Rastreamento e rollback automático") — não importa se a mudança veio de um método ou de uma atribuição direta, o valor de ANTES é guardado do mesmo jeito.',
        'Propriedades comuns que aceitam atribuição direta (não é uma lista fechada — QUALQUER campo real do objeto pode ser lido/escrito assim, inclusive campos específicos de um tipo que não tem seletor `[atributo=valor]` nem método dedicado): <code>visibility</code> (bool — o mesmo que <code>.hide()</code>/<code>.show()</code> escrevem), <code>nome</code> (string — cuidado: precisa continuar único na cena), <code>x</code>/<code>y</code>/<code>elevacao</code> (posição — <code>.move()</code>/<code>.moveTo()</code> são o jeito recomendado, que já tratam a conversão), <code>angulo</code> (graus — <code>.rotate()</code> SOMA a ele, atribuição direta TROCA o valor), <code>largura</code>/<code>altura</code>/<code>profundidade</code> (dimensões — individualmente, sem passar pelo fator único de <code>.scale()</code>), <code>classes</code> (array de strings — o que <code>.classe</code> no seletor lê), <code>ligado</code>/<code>rede.ligado</code> (equipamentos de rede — mesmo campo de <code>.ligar()</code>/<code>.desligar()</code>), <code>trancado</code> (portas/gabinetes), <code>tampaAberta</code> (gabinetes/racks), <code>anguloAbertura</code> (portas — o ÂNGULO de abertura em graus, animado automaticamente por <code>_updateDoorAnimations</code> quando muda de valor — é o campo por trás de <code>.abrirPorta()</code>/<code>.fecharPorta()</code>), <code>comManeneta</code>/<code>colorManeta</code> (porta com maçaneta), <code>alturaPeitoril</code> (janelas), <code>tipo</code> (o tipo cadastrado do objeto — cuidado ao trocar, ele decide a malha 3D/ícone).',
        'Pra descobrir o nome exato de um campo que não está nesta lista: abra "🧩 Editar componentes…"/aba "Propriedades" do objeto no app — o rótulo de cada campo na UI geralmente é bem parecido com o nome do campo por dentro (ex.: campo "Classes" → <code>classes</code>), ou peça pra alguém checar <code>Mapping.js</code>/<code>objecttypes/</code> no código.',
      ] },
    { id: 'seletor-externo', icone: '🧭', nome: '"Entrada para seletores" da linha (Select() sem argumento)',
      itens: [
        'Cada script tem uma "entrada para seletores" (campo de texto na linha do script, mesma sintaxe da seção anterior). <code>Select()</code> chamado SEM argumento nenhum (ou com argumento vazio) usa ESSE valor automaticamente.',
        'IMPORTANTE: se essa entrada estiver vazia, <code>Select()</code> sozinho NÃO seleciona "tudo" — não seleciona NADA (o script roda sem erro, só não afeta nenhum objeto). Pra afetar tudo mesmo sem preencher a entrada, use <code>Select(\'*\')</code> explícito dentro do código.',
        '<code>Select(\'algo\')</code> com argumento explícito sempre vence — o seletor externo só entra quando o script não passou nada pro <code>Select()</code>.',
      ] },
    { id: 'metodo', icone: '🎛️', nome: '"Método" (roda ao Executar)',
      itens: [
        'O código de nível superior do script SEMPRE roda primeiro, mesmo quando um método é escolhido — escolher uma função no <code>&lt;select&gt;</code> não troca isso, só ACRESCENTA um passo extra, depois.',
        '<code>&lt;select&gt;</code> "método" — escolhe UMA função de nível superior do próprio código (o app acha toda <code>function Nome() {}</code> automaticamente) pra rodar UMA VEZ, DEPOIS do código de nível superior, ao clicar no botão alternador 🚫/👁️ pra EXECUTAR. Vazio (opção "— código de nível superior —") = nenhum passo extra.',
        '<b>Não existe um <code>&lt;select&gt;</code> equivalente "ao parar"</b> — pra rodar algo ao DESEXECUTAR, declare a função de nome fixo <code>AoDesexecutarScript()</code> dentro do próprio código do script (ver próxima seção): ela roda SOZINHA, sem precisar escolher nada em nenhum <code>&lt;select&gt;</code>. Antes existiam os dois mecanismos separados (um <code>&lt;select&gt;</code> "método ao parar" E o gancho fixo); foram unificados num só, já que resolviam a mesma coisa.',
      ] },
    { id: 'start', icone: '🚀', nome: '"Start()" — roda 1 ÚNICA VEZ (nome fixo, já vem em todo modelo)',
      itens: [
        '<code>function Start() {}</code> já vem declarada (vazia) em TODOS os modelos de script — diferente dos 4 ganchos da próxima seção (que vêm comentados/opcionais), <code>Start()</code> já nasce ATIVA, pronta pra preencher.',
        'Roda automaticamente, SEM precisar escolher nada em nenhum <code>&lt;select&gt;</code> (nem aparece na lista de método — escolhê-la manualmente não faria sentido) — SEMPRE antes do "método"/<code>AoExecutarScript()</code>, DEPOIS do código de nível superior.',
        '<b>Roda só na 1ª vez</b> — clicar em 👁️/🚫 várias vezes (executar, desexecutar, executar de novo...), ou trocar o "método" escolhido, NUNCA dispara <code>Start()</code> outra vez, até a página ser recarregada OU o código deste script ser editado (o que rearma pra rodar de novo na próxima execução — faz sentido, o código novo pode precisar de uma inicialização diferente).',
        'Pensada pra preparar valores/objetos que os outros métodos do script vão usar depois (ex.: achar referências a objetos específicos por nome, montar uma lista, calcular algo caro 1 vez só) — mesmo espírito de um <code>Start()</code> de ciclo de vida "roda uma vez, no início" (como em "🧩 Editar componentes…", por objeto), só que aqui é 1 vez por PÁGINA CARREGADA (não por objeto).',
      ] },
    { id: 'ganchos-ciclo-vida', icone: '🪝', nome: 'Os 4 ganchos de ciclo de vida (nomes fixos, opcionais)',
      itens: [
        'São 4 funções de nome EXATO que, se o script as declarar, o app chama SOZINHO, sem precisar escolher nada em nenhum <code>&lt;select&gt;</code> — diferente do "método" (que exige escolha manual) e de <code>Start()</code> (que roda só 1x — ver seção anterior), estas rodam automaticamente TODA VEZ, no momento certo:',
        '<code>AoCriarScript()</code> — roda 1x, no momento em que o script é criado (botão "➕ Novo script"). Não deixa o script marcado como "em execução".',
        '<code>AoExcluirScript()</code> — roda 1x, no momento em que o script é excluído (🗑️), ANTES de sumir da lista.',
        '<code>AoExecutarScript()</code> — roda 1x ao clicar no botão alternador 🚫/👁️ pra EXECUTAR, depois do código de nível superior e do "método" (se houver).',
        '<code>AoDesexecutarScript()</code> — roda 1x ao clicar no botão alternador 🚫/👁️ pra DESEXECUTAR (ou ao excluir um script que estava em execução), ANTES do rollback automático.',
        'Pensados especialmente pra scripts que iniciam algo por FORA do sistema de tweens/regras do app (ex.: um <code>requestAnimationFrame</code> cru, escrito à mão, sem Tween.js) — sem <code>AoExecutarScript()</code>/<code>AoDesexecutarScript()</code>, não haveria NENHUM jeito de "desligar" esse tipo de laço a partir do botão, só manualmente pelo console do navegador.',
        'As 4 funções vivem no MESMO escopo de nível superior do script — uma variável declarada fora delas (ex.: <code>let raf = null;</code>) é compartilhada entre todas, o que permite uma "lembrar" o que a outra iniciou.',
        'Como toda função declarada no código aparece no <code>&lt;select&gt;</code> de "método" (mesmo estas 4, que já rodam sozinhas), cole a linha de comentário <code>// @ocultarMetodo</code> IMEDIATAMENTE ACIMA de uma função pra escondê-la só da LISTA do <code>&lt;select&gt;</code> — a função continua existindo e podendo ser chamada normalmente. Precisa ser uma linha SOZINHA, com exatamente esse texto (sem nada mais na mesma linha) — mencionar "@ocultarMetodo" dentro de uma frase maior (como esta) não conta, de propósito, pra nunca esconder uma função por engano. Repita a linha acima de cada função que quiser esconder.',
      ] },
    { id: 'persistir', icone: '📌', nome: '"Manter alterações ao desexecutar/excluir" (checkbox)',
      itens: [
        'Por padrão, desexecutar (clicando no botão alternador 🚫/👁️) — e excluir um script que estava em execução — desfazem TUDO que o script mudou — cada propriedade escrita volta ao valor de ANTES da 1ª escrita daquele script (ver "Rastreamento e rollback automático" abaixo).',
        'Marcando esse checkbox na linha do script, essa reversão de propriedades é PULADA — as alterações ficam pra sempre, mesmo desexecutando ou excluindo o script depois. Laços/animações em andamento (tweens, <code>requestAnimationFrame</code>) ainda são parados normalmente — só os VALORES não voltam ao que eram.',
        'Vale também pros ganchos <code>AoCriarScript()</code>/<code>AoExcluirScript()</code>: como eles precisam rodar o código de nível superior pra existir (não tem como "só declarar as funções" sem executar o resto), qualquer mudança feita nesse meio-tempo também é desfeita ao final — a MENOS que este checkbox esteja marcado.',
      ] },
    { id: 'rollback', icone: '↩️', nome: 'Rastreamento e rollback automático',
      itens: [
        'Toda propriedade escrita via <code>Select()</code>/<code>Object()</code> (não uma escrita solta em outra referência qualquer) é rastreada: na PRIMEIRA escrita de cada propriedade, o app guarda o valor que ela tinha ANTES — por objeto E por propriedade (não o objeto inteiro), então vários scripts podem coexistir sem um pisar no rollback do outro.',
        'O rollback resolve até objetos "trocados de referência" no meio do caminho (ex.: o mapa foi recarregado do banco entre o Executar e o Desexecutar) — ele acha o objeto de verdade ATUAL pelo mesmo id, não só pela referência antiga.',
        'Erro de SINTAXE (chave/parêntese não fechado etc.) é detectado na hora que você digita, sem precisar rodar nada. Erro de RUNTIME (algo que só quebra executando de verdade) é pego ao clicar em "Executar" — nesse caso, o que já rodou até o erro continua rastreado, então "Desexecutar" continua disponível e não deixa sujeira pra trás.',
      ] },
  ];

  const SINTAXE_SELETOR = [
    ['*', 'Bate TODOS os objetos da cena.'],
    ['tipo', 'SEM ponto — seletor de TIPO: bate só objetos cujo tipo cadastrado é EXATAMENTE esse (ex.: parede, piso, pilar, viga, switch24...).'],
    ['.classe', 'COM ponto — seletor de CLASSE: bate qualquer objeto (de qualquer tipo) que tenha essa palavra cadastrada nas "Classes" dele, nas propriedades.'],
    ['#id', 'Bate o objeto com esse id exato (raramente usado à mão — mais útil quando o próprio script gera o id).'],
    ['[atributo=valor]', 'Bate objetos cujo campo "atributo" (qualquer propriedade real do objeto) seja EXATAMENTE "valor".'],
    ['[atributo^=valor]', '"Começa com" — bate qualquer objeto cujo "atributo" COMECE com "valor" (ex.: [tipo^=mouse] bate "mouse", "mouse2", "mouse-ergonomico"... sem listar cada variante).'],
    ['andar=N', 'Bate objetos do andar N (aproximação por altura, quando não há hierarquia real).'],
    [':not(seletor)', 'Nega — bate tudo que NÃO casa com o seletor de dentro.'],
    ['seletorA, seletorB', 'Vírgula = OU — bate tudo que casa com A OU com B (sem duplicar quem casa nos dois).'],
    ['A > B', 'Combinador FILHO DIRETO — B cujo paiId é (o id de) algum A. Sem hierarquia real (paiId) declarada em nenhum lado, cai no fallback: mesmo andar.'],
    ['A B', 'Combinador DESCENDENTE (espaço) — B com QUALQUER ancestral (não só o pai direto) em A. Mesmo fallback por andar sem hierarquia real.'],
    ['A + B / A ~ B', 'Combinadores IRMÃO — B que compartilha o mesmo pai de algum A (mas não é o próprio A). Mesmo fallback por andar sem hierarquia real.'],
  ];

  const EXEMPLO_CODIGO = [
    '// Seleciona tudo do tipo "gabinete" OU cuja classe seja "destacado":',
    'Select(\'gabinete, .destacado\').highlight();',
    '',
    '// Qualquer tipo que COMECE com "mouse" (mouse, mouse2, mouse-ergonomico...):',
    'Select(\'[tipo^=mouse]\').hide();',
    '',
    '// Tudo que NÃO seja parede:',
    'Select(\':not(parede)\').opacity(0.5);',
    '',
    '// Um objeto específico, por Nome (equivalente a bpy.data.objects[\'AP1\']):',
    'Object(\'AP1\').visibility = false;',
  ].join('\n');

  // ==========================================================================
  // 2) JANELA
  // ==========================================================================
  function html() {
    const chips = SECOES.map((s) => `<a href="#sd-g-${s.id}" data-sd-go="sd-g-${s.id}" style="display:inline-block; padding:3px 9px; margin:2px; border-radius:12px; background:rgba(255,255,255,0.07); font-size:12px; text-decoration:none; color:inherit">${s.icone} ${_esc(s.nome.split(' (')[0])}</a>`).join('');
    const tabelaSintaxe = '<table style="width:100%; border-collapse:collapse; font-size:12.5px; margin:6px 0 10px">' + SINTAXE_SELETOR.map((s) => `<tr><td style="padding:4px 10px 4px 0; white-space:nowrap; vertical-align:top"><code style="padding:1px 6px; border:1px solid var(--border); border-radius:4px; background:rgba(255,255,255,0.06)">${_esc(s[0])}</code></td><td style="padding:4px 0">${_esc(s[1])}</td></tr>`).join('') + '</table>';
    const secoesHtml = SECOES.map((s) => {
      let extra = '';
      if (s.id === 'select-parser') extra = ''; // continua na próxima seção (tabela)
      if (s.id === 'select-sintaxe') extra = tabelaSintaxe + _codigo(EXEMPLO_CODIGO);
      return `<h4 id="sd-g-${s.id}" style="margin:16px 0 8px">${s.icone} ${_esc(s.nome)}</h4>${s.itens.length ? _lista(s.itens) : ''}${extra}`;
    }).join('');
    return `<div class="modal-sheet" style="max-width:820px; max-height:88vh; overflow:auto">
      <div class="handle"></div>
      <div style="position:sticky; top:-16px; z-index:2; background:var(--bg-elev); margin:-16px -16px 0; padding:16px 16px 8px; display:flex; align-items:center; justify-content:space-between; gap:8px">
        <h3 style="margin:0">🎬 Scripts — guia do parser e da API</h3>
        <button type="button" class="icon-btn sm" id="sd-close-top" title="Fechar" style="flex:none">✕</button>
      </div>
      <div style="line-height:1.5; font-size:13px">
        <p style="color:var(--text-dim); margin:6px 0">Como o painel "🎬 Scripts" funciona: o motor de seleção (<code>Select()</code>, equivalente ao <code>querySelectorAll()</code> do DOM, adaptado ao app), a API de cada seleção, <code>Object(nome)</code>, os ganchos de ciclo de vida e o rollback automático.</p>
        <div style="margin:6px 0 2px">${chips}</div>
        ${secoesHtml}
      </div>
      <div style="display:flex; gap:10px; margin-top:14px"><button type="button" class="btn" id="sd-close" style="flex:1">Fechar</button></div>
    </div>`;
  }

  function abrir() {
    document.getElementById('sd-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'sd-modal'; modal.className = 'modal-backdrop'; modal.style.zIndex = '10002';
    modal.innerHTML = html();
    document.body.appendChild(modal);
    const fechar = () => modal.remove();
    modal.querySelector('#sd-close-top').onclick = fechar;
    modal.querySelector('#sd-close').onclick = fechar;
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) fechar(); });
    modal.querySelectorAll('[data-sd-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); modal.querySelector('#' + a.dataset.sdGo)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    return modal;
  }

  const API = { SECOES, SINTAXE_SELETOR, abrir, html };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.ScriptsDocs = API;
})(typeof window !== 'undefined' ? window : globalThis);
