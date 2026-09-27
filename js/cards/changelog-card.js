/* js/cards/changelog-card.js
 * Card extraído de `js/mapview.js` (`MapView._openChangelogModal`), que
 * antes montava a janela "🗒️ Log de alterações" via `modal.innerHTML =`
 * direto no meio do arquivo do Mapa — pedido verbatim: "As inserções de
 * innerHTML devem se tornar Cards (que ficam em 'outputs/js/cards/')".
 *
 * Este NÃO usa `window.CardSystem` (aquele é o contrato específico das
 * janelinhas do "Ver em 3D", ancoradas no container do View3D — ver
 * `js/cardsystem.js`). O changelog é um modal de app inteiro
 * (`.modal-backdrop`/`.modal-sheet`, anexado em `document.body`), mesmo
 * padrão usado por outras janelas do app (ex.: `_openSobreModal`,
 * `_openConfirmModal` em mapview.js). Por isso ele se registra num
 * segundo pequeno "host" de cards de modal, `window.ModalCards`,
 * seguindo o mesmo espírito (arquivo isolado, auto-registro via
 * `<script>` — sem `fetch()`/import, já que o app roda em `file:///`,
 * ver comentário grande em `js/cardsystem.js`).
 *
 * CONTEÚDO: 100% estático (nenhum `${...}` dinâmico) — é só o texto do
 * changelog, então a extração aqui é literal, sem precisar de parâmetros.
 *
 * USO (em mapview.js): `window.ModalCards.open('changelog')`.
 */
window.ModalCards = window.ModalCards || {
  _cards: {},
  register(id, buildFn) { this._cards[id] = buildFn; },
  /** Monta e abre o modal `id`: cria `.modal-backdrop`, injeta o HTML
   *  devolvido por `buildFn()`, anexa em `document.body` e liga o
   *  fechamento padrão (botão com classe `.modal-card-fechar` OU clique
   *  fora do `.modal-sheet`). Devolve o elemento do backdrop. */
  open(id, ...args) {
    const buildFn = this._cards[id];
    if (!buildFn) {
      console.error(`[ModalCards] card "${id}" não está registrado (arquivo js/cards/${id}-card.js ausente ou com erro de sintaxe?)`);
      return null;
    }
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = buildFn(...args);
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelectorAll('.modal-card-fechar').forEach((btn) => { btn.onclick = close; });
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    return modal;
  },
};

window.ModalCards.register('changelog', () => `
      <div class="modal-sheet" style="max-width:560px; text-align:left">
        <div class="handle"></div>
        <h3 style="margin-top:0">🗒️ Log de alterações</h3>
        <div style="font-size:13px; color:var(--text-dim); line-height:1.6">
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">27/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li><b>Nova seção na documentação do '🎬 Scripts': "🎚️ Chamar COM ou SEM argumento"</b> — explica o padrão de "valor padrão" (JavaScript comum) usado em vários métodos: <code>Select()</code> vs <code>Select('*')</code> (mesma função, "nenhum argumento" tem um padrão diferente de um argumento explícito), <code>.highlight()</code> vs <code>.highlight(false)</code>, e a lista de qual "padrão" cada método usa quando chamado vazio (<code>.abrirPorta()</code>, <code>.aparecer()</code>, <code>.blink()</code>...), quais não têm argumento nenhum (<code>.hide()</code>, <code>.ligar()</code>...) e quais exigem argumento sempre (<code>.opacity(v)</code>, <code>.move()</code>...).</li>
            <li><b>Removido <code>map.grupoRegras</code> por completo (o motor de regras que sobrava por baixo do antigo painel "Grupos")</b> — pedido verbatim: "Remova 'map.grupoRegras'. O motor de regras por baixo (grupoRegras) deve ser integrado a 'Scripts'." <code>.opacity()</code>/<code>.highlight()</code> dos Scripts, que ainda usavam esse motor internamente (uma classe sintética temporária + uma "regra" registrada em <code>map.grupoRegras</code>), agora escrevem campos DIRETO no objeto (<code>entity.opacidade</code>/<code>entity.destacado</code>) — mesmo padrão simples que <code>.hide()</code>/<code>.show()</code> já usavam com <code>entity.visibility</code>, com desfazer automático ao "↩️ Desexecutar", sem regra nem classe temporária nenhuma no meio. Bônus: <code>.highlight(false)</code> passa a funcionar de verdade dentro do mesmo script (antes só dava pra desfazer pelo botão 👁️/🚫). Mapas antigos que ainda tinham <code>map.grupoRegras</code> salvo o perdem ao serem carregados (nada nunca mais lê nem escreve nele).</li>
            <li><b>Removido o painel "🏷️ Grupos" (2D e "Ver em 3D")</b> — pedido verbatim: "Elimine do código o 'Grupos', pois tudo já está implementado em 'Scripts'." O efeito equivalente (Ocultar/Opacidade/Destacar por seletor) já existe no modelo de script "🏷️ Ocultar / Opacidade / Destacar" (renomeado — antes tinha "(equivalente ao Grupos)" no nome, que deixou de fazer sentido).</li>
            <li><b>Padronizado: <code>Start()</code> agora só some do <select> de "método" com <code>// @ocultarMetodo</code> acima dela — igual a qualquer outra função</b> (antes era removida do <select> incondicionalmente, sem jeito de mudar isso). Pedido verbatim: "Todas as funções declaradas devem aparecer no seletor (inclusive a Start()), exceto se tiverem '// @ocultarMetodo' [...] fica tudo padronizado". Todos os modelos já vêm com essa linha acima do <code>Start()</code> deles (mesmo comportamento de antes, por padrão) — remova a linha se quiser escolhê-la manualmente também no <select>, além dela rodar automaticamente na 1ª vez.</li>
            <li><b>CORRIGIDO — um objeto já existente podia ficar com uma classe "fantasma" tipo <code>__auto_tag_xxxxxxx</code> no campo "Classes"</b> — sobra de uma tag sintética temporária que <code>.opacity()</code>/<code>.highlight()</code> dos Scripts criam enquanto o script "está rodando" (removida ao Desexecutar); se a página fosse recarregada com o script ainda em execução, a tag ficava presa pra sempre no objeto salvo. Agora é limpa automaticamente (ela e a regra sintética correspondente) toda vez que o mapa é carregado.</li>
            <li><b>Novo: <code>Start()</code> — roda 1 ÚNICA VEZ (nome fixo, já vem em TODOS os modelos de script, inclusive "Em branco"):</b> diferente do "método" (escolhido no <select>, roda a cada Executar) e dos 4 ganchos de ciclo de vida (rodam toda vez), <code>Start()</code> roda automaticamente só na 1ª execução do script desde que a página carregou — clicar em 👁️/🚫 de novo, ou trocar o "método" escolhido, nunca a dispara outra vez, até recarregar a página OU editar o código do script (o que rearma pra rodar de novo). Pensada pra preparar valores/objetos que os outros métodos vão usar, sem repetir isso a cada clique. Não aparece no <select> de "método" (roda sozinha).</li>
            <li><b>CORRIGIDO — guia de '🎬 Scripts' (Configurações 2D) quebrava a própria janela:</b> alguns textos explicativos citavam <code>&lt;select&gt;</code> como palavra comum, sem escapar os símbolos <code>&lt;</code>/<code>&gt;</code> — o navegador lia isso como uma tag de verdade, abrindo um elemento <code>&lt;select&gt;</code> real que "engolia" boa parte do conteúdo seguinte (títulos, tabela de sintaxe, blocos de código) para dentro de si, sem mostrar nada. Corrigido escapando todas as menções.</li>
            <li><b>Unificado: "método ao parar" (<select> antigo) e <code>AoDesexecutarScript()</code> tratavam da mesma coisa</b> — removido o <select> "método ao parar"; agora só existe <code>AoDesexecutarScript()</code> (declarada dentro do próprio código do script) pra rodar algo ao desexecutar.</li>
            <li><b>Nova sintaxe pra ocultar uma função do <select> de "método":</b> em vez da lista de nomes por texto livre (<code>// @ocultarMetodos: Nome1, Nome2</code>, que causava erro de sintaxe se "descomentada" removendo as barras de comentário e podia ser confundida com texto explicativo em qualquer lugar do código), agora é <code>// @ocultarMetodo</code> (singular) numa linha SOZINHA, imediatamente acima da função — sempre um comentário de verdade, nunca precisa ser "descomentado", e só conta quando a linha é EXATAMENTE isso (nunca dentro de uma frase maior).</li>
            <li><b>CORRIGIDO — textos, traços-guia e medidas da Trena nunca respeitavam <code>visibility</code>/'🚫 Ocultar' do Grupos</b> (mesma classe do bug já corrigido em portas/janelas) — <code>.hide()</code>/Grupos agora também escondem esses 3 tipos no mapa 2D.</li>
            <li><b>CORRIGIDO — refresh "ao vivo" (sem reconstruir a cena inteira) de uma porta/janela no "Ver em 3D" reconstruía a malha ERRADA</b> (a de um objeto genérico, em cima da malha de verdade) — <code>Engine3D.rebuildObjectIncremental</code> agora despacha pro builder certo de porta/janela antes de cair no genérico.</li>
            <li>Ocultar/desocultar tudo (<code>Select('*')</code>) no "Ver em 3D" pode parecer "em etapas" quando o seletor bate em paredes JUNTO com objetos/portas/janelas: paredes ainda não têm atualização instantânea ao vivo (caem numa reconstrução completa da cena, que leva pelo menos 1 quadro extra) — objetos/portas/janelas já somem/aparecem no mesmo quadro da mudança. Não é um bug de "partes aleatórias" — é sempre a MESMA categoria (parede) atrasada em relação ao resto.</li>
            <li><b>CORRIGIDO — <code>.hide()</code>/<code>.opacity()</code>/<code>.highlight()</code> (Grupos/Scripts) não tinham NENHUM efeito em portas/janelas no "Ver em 3D"</b> (só em objetos/piso/parede — 2D já funcionava certinho pra todo mundo). Portas/janelas são desenhadas por uma função separada da dos objetos genéricos, e ela nunca chegou a checar <code>visibility</code>/opacidade/destaque. Corrigido — vale pra qualquer tipo de porta/janela, incluindo a de correr de 2 folhas.</li>
            <li><b>'➕ Novo script' não reconstrói mais o painel inteiro</b> — igual ao '➕' do '🏷️ Grupos', agora só a linha nova é criada e inserida, sem redesenhar as outras.</li>
            <li><b>Novo: oculte funções específicas do <select> de "método"/"método ao parar" com <code>// @ocultarMetodos: Nome1, Nome2</code></b> dentro do próprio código do script — por padrão TODA função declarada aparece nos dois <select>s (comportamento de sempre); com essa linha, só as listadas ali ficam de fora (a função continua existindo/podendo ser chamada normalmente, só some da lista de escolha).</li>
            <li>Os 4 ganchos de ciclo de vida (<code>AoCriarScript()</code>/<code>AoExcluirScript()</code>/<code>AoExecutarScript()</code>/<code>AoDesexecutarScript()</code>) agora vêm como um bloco comentado (pronto pra descomentar) em TODOS os modelos de script, inclusive o "Em branco" — antes só quem sabia os nomes de cor conseguia usá-los.</li>
            <li>Novo modelo de script: "🫥 Faça tudo desaparecer" (<code>Select('*').hide()</code>) — companheiro do já existente "✨ Faça tudo aparecer".</li>
            <li>Comentário da função <code>Start()</code> (modelo "Ocultar/Opacidade/Destacar") reescrito — explica só a função e o que ela faz, sem citar o pedido original que a gerou.</li>
            <li>Nova seção "🎬 Scripts" nas Configurações 2D, com um guia completo do parser de seletores/API de Scripts (botão "📖 Guia do parser e da API de Scripts") — mesmo padrão da seção "🔌 Infraestrutura de rede". Guia ampliado com uma seção nova sobre as duas formas de mudar um objeto (por método, <code>.algo()</code>, ou por atribuição direta, <code>propriedade = valor</code>), a lista de propriedades comuns atribuíveis direto, e os outros jeitos de acessar o dicionário global de objetos (<code>SceneObjects.all/names/byName/get</code>), além de terminologia atualizada pro botão alternador 🚫/👁️ (não mais "▶️ Executar"/"↩️ Desexecutar").</li>
            <li><b>CORRIGIDO — a linha de exemplo do <code>// @ocultarMetodos:</code> (nos comentários do bloco de ganchos, acima) citava os nomes REAIS dos 4 ganchos de ciclo de vida</b> — como o parser da diretiva acha o texto em QUALQUER lugar do código, mesmo dentro de um comentário explicativo, isso escondia os 4 ganchos dos <select>s de TODO script, em TODO modelo, mesmo sem o usuário ter pedido. Trocado por nomes de exemplo genéricos.</li>
            <li>Removidas as fallbacks <code>AoExecutar()</code>/<code>AoDesexecutar()</code> — só <code>AoExecutarScript()</code>/<code>AoDesexecutarScript()</code> são reconhecidos agora.</li>
            <li><b>'🎬 Scripts' — <code>.hide()</code>/<code>.show()</code> agora são só opacidade:</b> antes reaproveitavam o efeito 'ocultar' do painel 'Grupos', que remove o item de verdade da cena 3D (<code>display:none</code>) — um Access Point assim "ocultado" parava de funcionar (a varredura falhava, "AP ainda não está na cena 3D"). Agora é <code>opacity:0</code>/<code>opacity:1</code> — o objeto continua funcionando escondido, igual no DOM — e já funciona ida-e-volta dentro do mesmo script, sem precisar de "↩️ Desexecutar" no meio.</li>
            <li>Painéis '🏷️ Grupos' e '🎬 Scripts': corrigido os dois se redimensionarem sozinhos (encolher/crescer pela parte de baixo) ao serem arrastados — e agora ambos são redimensionáveis de verdade pelas bordas/cantos, com o tamanho lembrado entre aberturas.</li>
            <li>'🎬 Scripts': a janela continua podendo ser arrastada mesmo depois de abrir "📄 Ver/editar código" de um script (antes travava no lugar ao entrar na folha de código).</li>
            <li>'🎬 Scripts': o botão de excluir (🗑️) de cada script ganhou o mesmo destaque de hover do botão de excluir do '🏷️ Grupos'.</li>
            <li>'🏷️ Grupos': o campo do seletor (ex. <code>.ap</code>, <code>andar=0</code>) ficava espremido/ilegível numa regra com o efeito 'Opacidade' (o campo "valor" extra ao lado tomava o espaço dele). Agora o campo "valor" pula para a linha de baixo quando falta espaço, em vez de espremer o seletor.</li>
            <li><b>CORRIGIDO — clicar em '🎬 Scripts' com pelo menos 1 script dava o erro "grupos is not defined":</b> um comentário dentro do código usava crase (o acento grave, <code>&#96;</code>) pra citar o nome de uma classe CSS — como esse comentário mora dentro do HTML gerado (não é um comentário de JS de verdade ali), a crase fechava o texto sozinha e quebrava o restante em código de verdade por engano. Já estava documentado como um risco conhecido do projeto (por isso foi achado rápido); corrigido trocando por aspas simples.</li>
            <li><b>CORRIGIDO — 'Script 1'/'Script 2' ao contrário:</b> um script novo (que vai pro TOPO da lista) estava sendo numerado como "Script 1" — a numeração contava pela posição na lista, não pela ordem de criação. Agora conta certo (o mais antigo é sempre "Script 1", crescendo a partir dele).</li>
            <li>'🧩 Editar componentes…': o nome do script (ex. "Script 1") agora aparece no cabeçalho do próprio bloco, ao lado de "🎬 Script".</li>
            <li><b>CORRIGIDO — painéis '🏷️ Grupos' e '🎬 Scripts' reconstruindo a janela inteira a cada clique:</b> agora cada botão/campo muda só a própria linha (ou nada visualmente) — a janela fica parada, sem perder o scroll nem o foco de outro campo que você estivesse editando.</li>
            <li><b>'🎬 Scripts' agora igual ao '🏷️ Grupos':</b> um botão só (👁️/🚫) pra executar/desexecutar em vez de dois ("▶️ Executar"/"↩️ Desexecutar") — vale pro Mapa 2D e pro "Ver em 3D". Cada script ganhou uma "entrada para seletores" (opcional — capturada de dentro do próprio script por <code>Select()</code> sem argumento nenhum) e uma "seleção do método" (qual função de nível superior do código roda ao executar — mesmo mecanismo do <select> de método em '🧩 Componentes').</li>
            <li>Novo modelo de script: "🏷️ Ocultar / Opacidade / Destacar (equivalente ao Grupos)" — declara os 3 efeitos do painel 'Grupos' como métodos escolhíveis, usando o seletor da própria linha.</li>
            <li><b>CORRIGIDO — "Ver em 3D": não dava pra mover as janelas dos botões 'Grupos' e 'Scripts'.</b> Agora arrastam e lembram a posição, iguais aos outros painéis.</li>
            <li><b>CORRIGIDO — painéis '🏷️ Grupos'/'🎬 Scripts' "desapareciam" ao ir pro "Ver em 3D" e voltar:</b> o botão continuava marcado como ativo, mas a janela não estava mais lá de verdade (ficava uma referência morta de antes de trocar de tela). Agora, se estavam abertos antes de ir pro 3D, reabrem automaticamente ao voltar pra Planta baixa, na mesma posição.</li>
            <li>'🎬 Scripts': o modelo "Ocultar / Opacidade / Destacar" ganhou um aviso no próprio código de exemplo — <code>Select()</code> sem argumento nenhum usa o seletor da "entrada para seletores" da linha; se essa entrada ficar vazia, <code>Select()</code> sem argumento não seleciona nada (não seleciona "tudo" por padrão).</li>
            <li><b><code>.hide()</code>/<code>.show()</code> voltaram a ser simples (desenha ou não desenha):</b> a rodada anterior tinha trocado por baixo dos panos pra <code>opacity(0)</code>/<code>opacity(1)</code>, mas isso trazia de volta a mesma limitação da opacidade (só 2D) e nem resolvia de verdade o ida-e-volta dentro do mesmo script. Agora <code>.hide()</code>/<code>.show()</code> gravam um campo simples direto no objeto — mesmo mecanismo que o "🚫 Ocultar" do 'Grupos' já usa — funcionando em 2D e 3D de novo, com ida-e-volta instantâneo. Efeito aceito de propósito: um Access Point oculto assim volta a sair da cena 3D de verdade (não "funciona escondido") — pra isso, use <code>.opacity(0)</code> no lugar.</li>
            <li><b>'Opacidade' e 'Destacar' (tanto do 'Grupos' quanto dos 'Scripts') agora também funcionam no "Ver em 3D"</b> — antes só tinham efeito visual no mapa 2D. O objeto some do agrupamento de desempenho (<code>InstancedMesh</code>) só quando precisa mesmo (tem uma dessas regras batendo nele), pra não pesar no restante da cena. A parte ANIMADA (<code>.blink()</code>/<code>.aparecer()</code>/<code>.desaparecer()</code>) continua só visual no 2D — o 3D só atualiza a opacidade a cada vez que a cena é reconstruída, não quadro a quadro.</li>
            <li>'🎬 Scripts': o <select> de "seleção do método" ganhou uma explicação melhor — deixa claro que TODO o código de nível superior do script sempre roda primeiro, e a função escolhida (se houver) roda depois, como um passo extra.</li>
            <li>Campo de seletor do '🎬 Scripts' ganhou a mesma explicação de <code>piso</code> (tipo) vs. <code>.piso</code> (classe) que já existia no '🏷️ Grupos'.</li>
            <li><b><code>.hide()</code>/<code>.show()</code> agora gravam <code>visibility</code> (não mais um campo interno) — e opacidade/visibilidade NÃO retiram mais o objeto da cena de verdade:</b> o objeto continua presente (raycastável, em funcionamento) tanto em 2D quanto em 3D, só não é desenhado — igual <code>visibility:hidden</code> no DOM. O "🚫 Ocultar" NATIVO do painel 'Grupos' continua removendo de vez, sem mudança.</li>
            <li><b>'Ver/editar código' do '🎬 Scripts' ganhou barra de rolagem</b> quando o código não cabe na altura da janela — antes o conteúdo simplesmente vazava pra fora, sem scroll nenhum.</li>
            <li><b>Grande parte das mudanças feitas com os painéis '🏷️ Grupos'/'🎬 Scripts' (ou por um script em execução) agora aparece AO VIVO no "Ver em 3D", sem precisar sair e entrar de novo</b> — visibilidade, opacidade, destaque e qualquer outra propriedade que um script mude (posição, rotação, escala, cor...) refazem só a malha do objeto afetado (<code>Engine3D.rebuildObjectIncremental</code>), nunca o cenário inteiro. Continuam precisando de uma reconstrução completa: o "🚫 Ocultar" nativo do 'Grupos' (remove/inclui objetos de vez das listas da cena) e qualquer efeito que afete PAREDES (ainda sem um jeito de reconstruir uma parede só). A parte ANIMADA de um script (<code>.animate()</code>, <code>.blink()</code>, tweens em geral) é refeita a cada quadro que o script escrever nela — funciona, mas custa uma reconstrução de malha por quadro por objeto animado, então evite animar dezenas de objetos ao mesmo tempo assim.</li>
            <li><b>Opacidade/Destacar agora também afetam PAREDES no "Ver em 3D"</b> (antes só objetos/piso recebiam o efeito — um seletor como <code>parede, piso</code> deixava a parede de fora). Bônus: 'Destacar' com seletor <code>parede</code> também passou a funcionar de verdade (o parâmetro que decide "isto é uma parede?" estava sendo ignorado nesse efeito específico).</li>
            <li><b>Novo: <code>Objeto(nome)</code> nos 'Scripts'</b> — acha um objeto específico pelo Nome dele (igual <code>bpy.data.objects['Nome']</code> do Blender) e devolve pra atribuição direta de propriedade, sem precisar de <code>Select()</code>/<code>.set()</code>: <code>Objeto('AP1').visibility = false</code>.</li>
            <li>Novo modelo de script: "🎯 Objeto específico por nome — visibility direto" — exemplo completo de <code>Objeto(nome)</code> com atribuição direta de propriedade.</li>
            <li>Modelo "Ocultar / Opacidade / Destacar" ganhou um exemplo comentado mostrando a alternativa de alternar a propriedade <code>visibility</code> direto, em vez de chamar <code>.hide()</code>.</li>
            <li><b>CORRIGIDO — '🎬 Scripts': <code>.hide()</code>/<code>.show()</code> (e o campo <code>visibility</code> em geral) não tinham efeito nenhum no mapa 2D:</b> o desenho 2D nunca chegou a checar de verdade o campo <code>visibility</code> do objeto/parede — só checava o "🚫 Ocultar" nativo do 'Grupos'. Agora <code>visibility:false</code> some do 2D também, para objetos, pisos e paredes.</li>
            <li><b>CORRIGIDO — 'Destacar()'/'Opacidade()' não afetavam PAREDES no mapa 2D</b> (só objetos/piso recebiam o efeito ali — igual ao bug já corrigido no "Ver em 3D"). Agora o corpo de cada parede lê a mesma regra de Grupos/Scripts que os objetos já liam, com o mesmo anel dourado de destaque.</li>
            <li><b>CORRIGIDO — 'Ocultar()'/'Opacidade()'/'Destacar()' via Grupos/Scripts podiam fazer uma PAREDE desaparecer de vez do "Ver em 3D"</b> (bug grave): o refresh "ao vivo" (sem reconstruir o cenário inteiro) usava o mesmo mecanismo dos objetos pra qualquer entidade, mas esse mecanismo não sabe reconstruir parede — a malha antiga era descartada e nada a substituía. Agora uma mudança em parede cai automaticamente para uma reconstrução completa da cena (paredes ainda não têm rebuild individual), sem apagar nada.</li>
            <li><b>Novo: atribuição direta de propriedade na própria seleção — <code>Select(seletor).visibility = false</code></b>, sem precisar chamar <code>.set('visibility', false)</code> (o método antigo continua funcionando igual).</li>
            <li><b>Renomeado <code>Objeto(nome)</code> para <code>Object(nome)</code></b> nos 'Scripts' (padronizado em inglês, igual <code>visibility</code>) — nomes de função criados por você dentro do script continuam podendo ser em português.</li>
            <li><b>CORRIGIDO — 'Ocultar()' com objetos do tipo Piso não funcionava no "Ver em 3D"</b> (mesmo depois de a parede já ter sido corrigida): o culling por distância (que roda todo quadro, escondendo/mostrando conforme a câmera se move) sobrescrevia a visibilidade de volta pra "visível" no quadro seguinte, sem saber nada sobre <code>visibility</code> — o Piso chegava a sumir por 1 quadro e reaparecia na hora. Paredes nunca tinham esse problema (não entram nesse cálculo). Corrigido: <code>visibility:false</code> agora tem prioridade absoluta sobre o culling por distância, todo quadro.</li>
            <li><b>'Ver/editar código' do '🎬 Scripts' agora abre numa janela EXPANDIDA de verdade</b> (mesmo overlay tela-cheia da folha de código de '🧩 Componentes'), em vez de rolar dentro do painel pequeno — resolve a falta de espaço horizontal pra ler o código.</li>
            <li><b>Analisador de sintaxe corrigido/novo:</b> tanto '🧩 Editar componentes…' quanto '🎬 Scripts' agora avisam erro de sintaxe (chave/parêntese não fechado etc.) na hora que você digita, sem precisar que o script esteja rodando de verdade no "Ver em 3D" — antes só detectava erro de execução, então parecia "não funcionar" pra maioria dos erros de digitação.</li>
            <li>Modelo "🏷️ Ocultar / Opacidade / Destacar" agora já vem com o seletor de exemplo preenchido (<code>parede, piso, pilar, viga</code>) — antes só o código vinha, e a "entrada para seletores" ficava vazia (as 3 funções do modelo usam <code>Select()</code> sem argumento, que depende dessa entrada).</li>
            <li><b>CORRIGIDO — criar um novo script abria direto a folha de código:</b> agora "➕ Novo script" só cria e mostra a linha na lista, igual ao "➕" do painel '🏷️ Grupos' — abrir a folha é sempre uma ação separada ("Ver/editar código").</li>
            <li><b>Nomes únicos em toda a cena, também ao RENOMEAR</b> (a criação já gerava nome único automático, ex. "Mesa.001" — agora renomear um objeto/porta/janela/texto pra um nome já usado por OUTRA coisa na cena acrescenta ".001"/".002"... automaticamente, ao sair do campo, em vez de permitir dois itens com o mesmo nome) — garante que <code>Object(nome)</code> nos 'Scripts' sempre ache o item certo, sem ambiguidade.</li>
            <li><b>CORRIGIDO — painéis '🏷️ Grupos' e '🎬 Scripts' "desapareciam" de novo ao sair e voltar do "Ver em 3D" (e o botão exigia 2 cliques):</b> o "Ver em 3D" reaproveita a mesma instância entre uma entrada e outra, e a referência à janela antiga (de antes de sair) ficava "pendurada" — o botão achava, por engano, que a janela ainda existia, então o 1º clique só "fechava" o que já não existia de verdade, e só o 2º clique de fato reabria. Agora, ao entrar no "Ver em 3D", as janelas de 'Grupos'/'Scripts' que estavam abertas reabrem sozinhas (sem precisar de clique nenhum) e o botão já nasce com o destaque certo.</li>
            <li><b>CORRIGIDO — '🎬 Scripts' → "Ver/editar código": ficavam dois botões de fechar ('⬅️' e '✕').</b> Agora só '⬅️ Voltar', igual à folha de código de '🧩 Editar componentes…'.</li>
            <li><b>CORRIGIDO — janela de "Objetos" (Mapa → Planta baixa → Ferramentas) reabria sozinha depois do "Ver em 3D":</b> fechar essa janela e depois ir e voltar do "Ver em 3D" fazia ela reaparecer, ignorando que você tinha fechado de propósito. Agora ela lembra que foi fechada manualmente e só reabre se a ferramenta "Objetos" for escolhida de novo.</li>
            <li>'🎬 Scripts': o seletor de "Modelo de script" ganhou um title explicativo (antes não tinha nenhum).</li>
            <li><b>Novo modelo de script: "🎈 Levitação suave (gabinete/monitor/teclado/mouse)"</b> — faz esses objetos flutuarem "no ar", subindo e descendo suavemente, sem parar (só visível no "Ver em 3D"). O seletor de exemplo usa <code>[tipo^=mouse]</code> (bate qualquer tipo que COMECE com "mouse" — cobre "mouse" e "mouse-ergonomico" ao mesmo tempo, sem listar cada variante à mão) — mesma ideia pra gabinete/monitor/teclado.</li>
            <li><b>CORRIGIDO — motor de animação (<code>Select().animate()</code>, usado pelo modelo "🎈 Levitação suave" e por qualquer script que anime valores) nunca avançava de verdade:</b> nada no app chamava a função que "empurra" as animações a cada quadro — elas ficavam registradas, mas paradas, sem erro nenhum. Agora tanto o mapa 2D quanto o "Ver em 3D" avançam as animações a cada quadro.</li>
            <li>Modelo "🏷️ Ocultar / Opacidade / Destacar" ganhou um comentário mostrando como trocar o texto das opções do <select> de método (de "Ocultar()"/"Opacidade()"/"Destacar()" para algo como "🚫 Ocultar"/"🌗 Opacidade"/"✨ Destacar") por seleção no DOM.</li>
            <li><b>Novo: ao inserir um objeto na grade do mapa 2D, o campo "Classes" (nas propriedades do objeto) já vem preenchido com o tipo do objeto</b> (ex.: um Piso nasce já com a classe "piso") — uma classe que já reflete o próprio tipo, útil pra seletores de 'Grupos'/'Scripts' baseados em classe.</li>
            <li><b>CORRIGIDO — a janela de "Objetos" (Mapa → Planta baixa → Ferramentas) "esquecia" de estar ABERTA ao sair e voltar do "Ver em 3D":</b> mesmo deixando-a aberta de propósito, ela desaparecia e só voltava trocando pra outra ferramenta e de volta pra "Objetos". Causa: o mesmo fechamento usado internamente (só pra descartar a janela antiga ao trocar de tela) estava sendo tratado como se você tivesse fechado por conta própria. Agora só um fechamento de verdade (clique no "✕") marca isso — sair e voltar do "Ver em 3D" preserva o estado de aberta/fechada como estava.</li>
            <li><b>CORRIGIDO — 'Ocultar()'/'Opacidade()'/'Destacar()' numa PAREDE (via 'Grupos' ou 'Scripts') só refletiam na cena 3D um quadro (ou mais) depois da mudança de verdade</b> (objetos normais já eram instantâneos) — a reconstrução completa da cena, único jeito de atualizar uma parede ao vivo hoje, sempre esperava por 3 fontes assíncronas (config salva, modelos 3D pré-carregados) antes de desenhar de novo, mesmo quando nada nelas tinha mudado desde a última vez. Agora essa atualização ao vivo reaproveita o que já foi carregado e roda 100% no mesmo quadro.</li>
            <li>Modelo "🏷️ Ocultar / Opacidade / Destacar": a troca do texto das opções do método (🚫/🌗/✨) agora é uma função <code>Start()</code> de verdade no código do modelo (não só um comentário) — selecionável no <select> de método como qualquer outra função, então dá pra rodar clicando em "👁️ Executar" mesmo sem abrir o "Ver em 3D". O exemplo agora troca cada opção diretamente pelo próprio <code>value</code>, sem <code>forEach</code>/loop nenhum.</li>
            <li>Modelo "🎈 Levitação suave" ganhou uma versão comentada do mesmo efeito em JavaScript puro (sem Tween.js), como referência.</li>
            <li><b>CORRIGIDO — a ferramenta "Objetos" ficava "surda" ao próprio botão:</b> com a janela fechada mas a ferramenta ainda selecionada, clicar de novo no botão "🧰 Objetos" não fazia nada — a janela só voltava trocando pra outra ferramenta e de volta. Agora um clique de verdade no botão sempre reabre a janela se ela estiver fechada — e, se ela já estiver aberta, o clique não reconstrói nada (fica exatamente como estava).</li>
            <li><b>CORRIGIDO — fechar e abrir a janela de "🎬 Scripts" reconstruía tudo do zero</b> (lista de scripts, listeners, tamanho salvo) a cada vez. Agora um fechamento manual (botão de novo, ou "✕" da própria janela) só ESCONDE a janela — reabrir mostra a MESMA instância, sem reconstruir nada; sair e voltar do "Ver em 3D" continua respeitando se a janela estava mesmo visível ou só escondida antes de sair.</li>
            <li><b>Novo: funções de ciclo de vida <code>AoExecutar()</code>/<code>AoDesexecutar()</code> nos 'Scripts'</b> — se o script declarar essas 2 funções, o app chama <code>AoExecutar()</code> automaticamente ao clicar em "👁️ Executar" e <code>AoDesexecutar()</code> ao clicar em "↩️ Desexecutar", mesmo sem escolher nada no <select> de método. Pensado pra scripts que iniciam algo por fora do sistema de animação do app (ex.: um <code>requestAnimationFrame</code> escrito à mão, sem Tween.js) — agora dá pra "desligar" isso de dentro do próprio script, sem precisar do console do navegador. O modelo "🎈 Levitação suave" (versão em JavaScript puro) já usa esse mecanismo como exemplo.</li>
            <li><b>CORRIGIDO — em certos casos, ocultar objetos com 'Scripts'/'Grupos' e depois excluir o script podia deixá-los ocultos pra sempre</b> (mesmo criando um script novo): se o mapa foi recarregado no meio do caminho (ex.: indo e voltando do "Ver em 3D"), o "↩️ Desexecutar"/exclusão tentava restaurar a visibilidade na referência ANTIGA do objeto, que já não era mais a mesma coisa desenhada na tela. Agora o rollback também acha e corrige o objeto de verdade, atual, pelo mesmo id — mesmo depois de uma recarga assim.</li>
            <li>Modelo "🏷️ Ocultar / Opacidade / Destacar": a função <code>Start()</code> agora mostra os DOIS exemplos de como trocar o texto das opções do método — um com <code>forEach</code> (um loop só) e outro com cada opção trocada independente, sem loop nenhum (a versão que roda de verdade).</li>
            <li><b>Lista de "Modelo" de script reduzida</b> — ficaram só "Em branco", "🏷️ Ocultar / Opacidade / Destacar", "🎯 Objeto específico por nome" e "🎈 Levitação suave"; os demais exemplos (Modo Raio-X, Hierarquia Gabinete/AP, e os 6 por categoria de Infraestrutura/Segurança/Apresentação) foram removidos do seletor.</li>
            <li><b>Novo modelo de script: "👁️‍🗨️ Faça tudo aparecer"</b> — deixa TODOS os objetos da cena visíveis de uma vez (<code>visibility=true</code> e <code>opacidade=100%</code> em tudo), útil pra desfazer efeitos de ocultação de outros scripts/testes sem precisar achar cada objeto um por um.</li>
            <li>Modelo "🎈 Levitação suave" (versão em JavaScript puro): a função <code>AoExecutar()</code> agora verifica se o laço de animação já está rodando antes de começar outro — evita empilhar 2+ laços da mesma animação se "👁️ Executar" for clicado de novo sem "↩️ Desexecutar" antes.</li>
            <li><b>Novo: "método ao parar" em '🎬 Scripts'</b> — além do <select> que escolhe uma função pra rodar ao "👁️ Executar", agora cada script tem um segundo <select>, opcional, pra escolher uma função que roda ao "↩️ Desexecutar" (depois do rollback automático e do <code>AoDesexecutar()</code>, se houver). Ajuda a garantir que algo iniciado pelo script realmente pare, mesmo em casos onde o gancho de ciclo de vida sozinho não bastava.</li>
            <li>Modelo "🏷️ Ocultar / Opacidade / Destacar": a função <code>Start()</code> agora é a PRIMEIRA função declarada no código (antes vinha depois de Ocultar/Opacidade/Destacar) — continua mostrando os dois exemplos (<code>forEach</code> e "cada um independente") de como trocar o texto das opções do método.</li>
            <li><b>Ganchos de ciclo de vida dos 'Scripts' ampliados — agora são 4:</b> <code>AoCriarScript()</code> (roda 1x ao criar o script), <code>AoExcluirScript()</code> (roda 1x ao excluir), <code>AoExecutarScript()</code> e <code>AoDesexecutarScript()</code>. <code>AoCriarScript()</code>/<code>AoExcluirScript()</code> rodam uma vez só, sem deixar o script marcado como "em execução".</li>
            <li><b>Novo: "Manter alterações ao desexecutar/excluir"</b> — checkbox opcional em cada script (linha de '🎬 Scripts'). Por padrão, "↩️ Desexecutar" (e excluir o script) sempre desfazem tudo que ele mudou. Marcando essa opção, as alterações do script ficam PRA SEMPRE, mesmo desexecutando ou excluindo o script depois — só laços/animações em andamento são parados, os valores não voltam ao que eram antes.</li>
            <li><b>CORRIGIDO — os nomes antigos <code>AoExecutar()</code>/<code>AoDesexecutar()</code> (sem o sufixo "Script") foram removidos</b> — só <code>AoExecutarScript()</code>/<code>AoDesexecutarScript()</code> são reconhecidos agora (app ainda em construção, sem scripts salvos com o nome antigo).</li>
            <li>Modelo "🏷️ Ocultar / Opacidade / Destacar": a troca do texto das opções do método em <code>Start()</code> agora usa o <code>forEach</code> como código ATIVO (a versão "cada um independente" ficou comentada, só de referência) — antes era o contrário.</li>
            <li><b>Nova seção "🎬 Scripts" nas 'Configurações 2D'</b> — mesmo padrão da seção "🔌 Infraestrutura de rede": breve descrição + botão "📖 Guia do parser e da API de Scripts", que abre uma janela com toda a documentação do painel '🎬 Scripts' — a sintaxe completa do seletor de <code>Select()</code> (equivalente ao <code>querySelectorAll()</code> do DOM, adaptado ao app), todos os métodos de uma seleção, <code>Object(nome)</code>, "entrada para seletores", "método"/"método ao parar", os 4 ganchos de ciclo de vida, "Manter alterações" e como funciona o rollback automático.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">26/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Exportar mapa/backup: o estado do personagem (posição no 2D, posição e apontamento da câmera no 3D e gravidade) vai junto com cada mapa; ao importar, é restaurado. Cada mapa passa a lembrar o seu próprio personagem ao trocar de mapa.</li>
            <li>Configurações 3D: voltaram os botões de atalho no cabeçalho que levam direto a cada seção (com seta ▾ para as subseções), iguais aos das Configurações 2D.</li>
            <li>Documentação do Access Point: corrigido o texto 'recebe' que aparecia cortado ('rece') nas ilustrações do raio direto e do raio refratado.</li>
            <li>Ver em 3D: os botões ↶/↷ flutuantes só aparecem se 'Sempre mostrar os botões ↶/↷ na tela' estiver marcado (igual à Planta baixa).</li>
            <li>Configurações do app: 'Mostrar HUD (FPS / CPU~ / RAM)' e 'Sempre mostrar os botões ↶/↷ na tela' têm efeito imediato e aparecem à frente da própria tela de Configurações.</li>
            <li>Rodapé: o botão destacado sempre corresponde à tela aberta — ao trocar o modo de operação (vai para 'Caixa' em Mapeamento de ambientes; sai de '3D'/'Caixa' para 'Tabela' em Conferência de patrimônios) e ao sair do 3D/Modelos 3D no layout Clássico.</li>
            <li>Exportar backup: 'O que vai nessa exportação' e a lista de Imagens não contam mais as fotos de patrimônio também como fotos de ambiente (ex.: 1 de ambiente + 2 de patrimônio, e não 3 de ambiente). O mesmo no resumo do Importar backup e no painel de armazenamento.</li>
            <li>Carregar Configurações de Fábrica: o app volta no modo 'Mapeamento de ambientes', inclusive a tela e o rodapé que aparecem por trás da Tela de Abertura.</li>
            <li>Anexar foto (Foto desse patrimônio): seletor '🗺️ Só do mapa atual' (padrão) / '🌐 Todos os mapas'; botão '📷 Tirar foto' maior.</li>
            <li>Importar backup: patrimônios exatamente iguais (mesmo id e mesmas informações, posição, foto e carimbos de tempo) vindos em vários arquivos/mapas, ou já existentes no aparelho, não viram mais duplicados — entram uma vez só e aparecem no resumo como 'idêntico(s) — sem alteração'.</li>
            <li>Importar backup → 'Mapas já existentes encontrados': mostra, para cada mapa, patrimônios, fotos de ambiente, fotos de patrimônio, objetos e um hash dos dois lados, com o selo '✅ Idênticos', '🟰 Planta idêntica' ou '≠ Diferentes'. 'Cancelar' na janela de mesclagem volta para a janela anterior.</li>
            <li>Carregar Configurações de Fábrica: corrigido — a caixa amarela 'Defina o nome para a conferência de patrimônios' (só faz sentido no modo Conferência) não aparece mais atrás da Tela de Abertura, já que a Fábrica deixa o app em 'Mapeamento de ambientes'.</li>
            <li>Importar backup: a gravação de cada mapa novo/atualizado não espera mais o 1 segundo de agrupamento pensado para edição manual — importar vários mapas ficou bem mais rápido. O tempo de 'Salvando mapas, tipos e fotos…' que sobra é a gravação real das fotos no banco do aparelho.</li>
            <li>Importar backup: corrigido o cálculo de 'idêntico' — reimportar o mesmo arquivo de backup, sem nenhuma mudança, agora sempre aparece como '✅ Idênticos' (antes podia aparecer só '🟰 Planta idêntica' por causa de campos internos do aparelho que não fazem parte do conteúdo do patrimônio/mapa).</li>
            <li>'Trocar/criar/renomear/excluir mapa': ao excluir um mapa, a janela não fecha mais — continua mostrando a lista atualizada.</li>
            <li>'Trocar/criar/renomear/excluir mapa': renomear e clicar em 'Ok' não deixa mais os outros botões (ex.: 'Exportar apenas este mapa') travados por um tempo até o salvamento no IndexedDB terminar.</li>
            <li>Tela de Abertura: corrigido para aparecer só uma vez ao carregar a página (inclusive após 'Carregar Configurações de Fábrica') — antes podia reabrir sozinha mesmo depois de clicar fora pra fechá-la.</li>
            <li>'Mapa' → 'Organizar', modo Grade: o botão '← Voltar' da Planta baixa aberta a partir de um patrimônio vinculado agora volta pra tela e posição exatas de onde se saiu (em vez de ir sempre pra 'Mapa').</li>
            <li>Mover patrimônio/foto de um mapa pra outro: clicar em 'Cancelar' na janela de confirmação agora cancela de fato — antes a animação da seta acontecia e o item era movido mesmo assim.</li>
            <li>Mover um patrimônio vinculado a uma foto de ambiente para outro mapa: a foto de patrimônio dele (se houver) vai junto por padrão — a opção passou a ser 'mover tudo que está vinculado' em vez de só o item.</li>
            <li>Cadastrar um patrimônio ou tirar uma foto e 'Deixar sem vínculo por enquanto': o item/foto fica realmente sem nenhuma posição no mapa até ser vinculado manualmente — antes ainda ganhava uma posição 'reserva' automática (periferia do mapa, ou grade, no caso de fotos) sem ninguém pedir.</li>
            <li>'Mapas' → 'Trocar de mapa, criar um novo...': criar um novo mapa também mantém a janela aberta agora (mesma correção já feita para excluir).</li>
            <li>'Mapa' → 'Organizar', modo Grade: fotos de ambiente e fotos de patrimônio agora têm um selo (🖼️/🏷️) na miniatura pra diferenciar uma da outra.</li>
            <li>'Mapa' → 'Organizar', modo Grade: quando um mapa não tem nenhum patrimônio vinculado, os botões de busca/modo/ordem somem também — fica só a mensagem 'Nenhum patrimônio vinculado a este mapa.'.</li>
            <li>'Mapa' → 'Organizar', modo Grade: mapas nunca editados (planta vazia) agora mostram o aviso 'planta vazia' na miniatura, igual ao modo Cartões.</li>
            <li>'Mapa' → 'Organizar': ao clicar no nome de um mapa pra renomear, o texto não fica mais cortado embaixo; clicar em qualquer lugar fora da caixa de texto agora sai do modo de edição (antes só saía clicando no nome de outro mapa).</li>
            <li>'Mapa' → 'Organizar', modo Grade: fotos de patrimônio (o anexo de um item) agora aparecem numa seção própria, com título '🏷️ Fotos de patrimônio', abaixo das '🖼️ Fotos de ambiente' — antes nunca eram buscadas/mostradas nesta tela (por isso o selo de tipo só mostrava 🖼️, nunca 🏷️).</li>
            <li>'Mapa' → 'Organizar', modo Grade: se o mapa não tem nenhuma foto (nem de ambiente, nem de patrimônio), o botão 'Colunas' também some, ficando só a mensagem 'Nenhuma foto vinculada a este mapa.'.</li>
            <li>'Mapa' → 'Organizar', modo Grade: dar 2 cliques numa planta pra abri-la e depois clicar em '← Voltar' volta direto pro Organizar, sem mostrar rapidamente a tela 'Mapa' no meio do caminho.</li>
            <li>'Mapa' → 'Organizar': aumentada a altura da caixa de edição do nome do mapa — o texto não fica mais cortado embaixo.</li>
            <li>'Mapa' → 'Organizar', modo Grade: a lista de vinculações de patrimônio com a planta (parte do meio do cartão) não vaza mais visualmente por cima da coluna de fotos vizinha quando tem muitas colunas.</li>
            <li>'Mapa' → 'Organizar', modo Grade: fotos de ambiente e de patrimônio agora ficam em caixas visualmente separadas (borda própria, uma abaixo da outra) — e a separação passou a ser garantida pelo próprio código (se algum item aponta pra ela como sua foto anexada), não só pelo campo salvo da foto, então não tem mais mistura mesmo com fotos antigas.</li>
            <li>'Mapa' → 'Organizar', modo Grade: as caixas de vinculação de patrimônio com a planta não precisam mais de rolagem própria — a grade quebra linha sozinha, sempre dentro da própria caixa.</li>
            <li>'Mapa' → 'Organizar', modo Grade: eliminada a piscada residual da tela 'Mapa' ao voltar de uma planta aberta com 2 cliques (o fundo do Organizar tinha uma transição de opacidade que deixava a tela de baixo espiar por um instante).</li>
            <li>Excluir um mapa vazio ("nome e esqueleto"): a mensagem de confirmação agora deixa explícito, entre parênteses, os números (planta vazia, 0 patrimônios, 0 fotos).</li>
            <li>'Mapa' → 'Organizar': excluir e aplicar a exclusão do mapa que estava selecionado em 'Mapa' agora troca automaticamente pro próximo mapa disponível — antes o botão de troca de mapas continuava mostrando o nome do mapa já excluído.</li>
            <li>As mensagens de importação ('Lendo arquivo…', 'Salvando mapas, tipos e fotos…', 'Salvando (x/x)…') agora ficam garantidamente acima de qualquer outra tela/painel, inclusive as Configurações do app.</li>
            <li>Importar backup → '🔀 Mesclar — escolher versão de cada mapa': cada mapa ganhou um botão '🔍 Detalhes' que mostra exatamente o que diverge entre 'Já existe neste aparelho' e 'Versão nova' — planta, patrimônios e fotos, campo a campo.</li>
            <li>Refatoração: a gravação de patrimônios/mapas/fotos e o cálculo do hash de identidade agora usam a MESMA função de normalização de campos — reimportar um backup sem nenhuma alteração real sempre bate como '✅ Idênticos', mesmo se algum campo opcional vier ausente em vez de com o valor padrão.</li>
            <li>'Mapa' → 'Organizar', modo Grade: dar 2 cliques numa foto agora mostra o botão '↩️ Organizar' no lugar do '✕ Fechar' normal (mesmo destino: volta pro Organizar de onde veio).</li>
            <li>'Mapa' → 'Organizar', modo Grade: dar 2 cliques numa foto de patrimônio agora abre a foto de patrimônio certa — antes abria a 1ª foto de ambiente do mapa.</li>
            <li>'Mapa' → 'Organizar', modo Grade: passar o cursor por cima de um chip de vinculação de patrimônio com a planta não aciona mais o scroll da tela (o destaque no hover deixou de aumentar o chip, só realça a borda).</li>
            <li>'Mapa' → 'Organizar', modo Grade: ao arrastar um item pra outro mapa, o "ghost" tracejado azul no mapa de destino agora também aparece para a foto de patrimônio anexada ao item (antes só apareciam o do próprio item e o da foto de ambiente).</li>
            <li>'Mapa' → 'Organizar', modo Grade: corrigido um arrasto "perdido" — clicar e arrastar bem rápido às vezes fazia o item não seguir o cursor; ao passar o mouse de volta por cima dele depois (sem clicar), ele se vinculava ao cursor sozinho. Causa: a captura do ponteiro só começava depois de cruzar um limiar de distância, então um arrasto rápido podia deixar os controles do gesto "presos", disparando um arrasto fantasma depois.</li>
            <li>'Mapa' → 'Organizar', modo Grade: corrigido de vez dar 2 cliques numa foto de AMBIENTE não abrir mais nada — regressão da correção do "arrasto perdido" acima. Uma 1ª tentativa (soltar a captura do ponteiro no momento de soltar o clique) não bastou, porque o navegador decide o alvo do duplo-clique ANTES disso. Corrigido de raiz: o arrasto passou a escutar o movimento/soltar do mouse no documento inteiro (em vez de só no próprio item), o que já resolve o "arrasto perdido" sem precisar capturar nada num clique normal — dar 2 cliques numa foto (de ambiente ou de patrimônio) volta a abrir a foto certa.</li>
            <li>'Mapa' → 'Organizar', modo Grade: eliminada a piscada da tela 'Mapa' também ao voltar (botão '↩️ Organizar') da tela de uma foto de patrimônio aberta com 2 cliques — a correção anterior (25/09) só cobria o retorno da planta baixa/3D aberta externamente.</li>
            <li>'Mapa' → 'Organizar': ao arrastar uma FOTO DE AMBIENTE (não o item) pra outro mapa, os patrimônios marcados nela vão junto — e agora a foto de patrimônio anexada a cada um desses patrimônios também vai, igual já acontecia ao arrastar o item diretamente.</li>
            <li>'Mapa' → 'Organizar', modo Cartões: fotos de patrimônio agora aparecem também (antes só no modo Grade) — numa fileira própria, com 1/4 do tamanho da foto de ambiente, abaixo da lista de fotos de ambiente.</li>
            <li>'Mapa' → 'Organizar': o modo padrão ao abrir passou a ser 'Grade' (antes: 'Cartões') — pode ser trocado a qualquer momento pelos botões de alternância, como sempre.</li>
            <li>'Buscar': o mapa 2D que aparece embaixo da busca agora pode ser arrastado (pan) e tem zoom pela roda do mouse (ancorado no cursor) — antes ficava travado, sem nenhum jeito de mover ou ampliar a prévia.</li>
            <li>'Buscar': corrigido um loop entre 'Sair do 3D' e 'Ver em 3D' — ao escolher '3D' na busca e depois sair do visualizador, o app voltava a entrar no 3D em vez de voltar pra tela 'Buscar'.</li>
            <li>Configurações do app: o botão '⬆️ Importar backup' agora mostra ' (.json)' no final, igual já acontecia no botão '⬇️ Exportar backup'.</li>
            <li>Novo motor de animação/interpolação próprio do app (mesma sintaxe da Tween.js: <code>TWEEN.Tween</code>, <code>.to()</code>, <code>.easing()</code> etc.) — funciona tanto abrindo o app direto como arquivo (file:///) quanto por servidor, sem precisar de internet.</li>
            <li><b>Novo: 'Mapa' → 'Planta baixa' → botão '🎬 Scripts'</b> (ao lado de '🏷️ Grupos') — Módulo de Automação: uma lista de rotinas globais com botões Executar/Desexecutar/Editar/Renomear/Excluir. Cada rotina seleciona objetos por classe/tipo (mesmo seletor tipo <code>querySelector</code> do 'Grupos': <code>.classe</code>, <code>#id</code>, <code>tipo=valor</code>, vírgula = OU) e pode Ocultar, mudar Opacidade, Destacar, Mover, Girar, Escalonar, Animar (com easing/loop, Tween.js de verdade) ou Piscar — e "Desexecutar" desfaz tudo certinho, mesmo com vários scripts rodando ao mesmo tempo sobre os mesmos objetos.</li>
            <li>'🎬 Scripts': corrigido o botão que não abria o painel (uma falha ao carregar os scripts salvos ficava silenciosa — agora aparece um aviso na tela, em vez de nada acontecer).</li>
            <li>'🎬 Scripts' — seletor (<code>Select(...)</code>) ganhou o motor completo de seletores estilo CSS: <code>:not(...)</code>, seletor de tipo sem prefixo (<code>Select('pc')</code>), seletores de atributo (<code>[andar=0]</code>, <code>[nome^=Sala]</code>, <code>[classes~=vip]</code>, <code>!= ^= $= *= ~=</code>), pseudo-classes estruturais (<code>:first-child</code>, <code>:last-child</code>, <code>:nth-child(2n+1)</code>, <code>:only-child</code>, <code>:empty</code>) e combinadores (<code>&gt; + ~</code> e espaço) — combinadores usam o andar como a única relação "de verdade" que existe entre os objetos do catálogo (documentado no topo de <code>js/automation.js</code>).</li>
            <li>'🎬 Scripts': a folha de código de cada script agora é a MESMA usada em '🧩 Componentes → 🧩 Editar componentes…' (mesmo cabeçalho fixo, mesma caixa de código, mesmo CodeMirror) — só troca a linha de variáveis disponíveis (<code>Select</code>/<code>TWEEN</code>/<code>THREE</code>/<code>map</code>...).</li>
            <li>'🎬 Scripts': 6 modelos prontos pra usar como ponto de partida ao criar um script novo (escolha em "Modelo:"), em 3 categorias — Infraestrutura/Manutenção (Modo Manutenção Hidráulica/Elétrica; Isolar Seleção Atendida), Segurança/Alarmes (Alerta de Incêndio/Evacuação; Simulação de Falha de Equipamento) e Apresentação/Exploração (Efeito de Explosão/Exploded View; Animação de Entrada/Spawn Effect) — além de "Em branco" e o exemplo original "Modo Raio-X".</li>
            <li>'🎬 Scripts' — <code>.animate(props, ms)</code> aceita valores relativos ao estilo Tween.js/jQuery (ex.: <code>{ y: "+=10" }</code> — soma 10 ao valor ATUAL de cada objeto, em vez de todos irem pro mesmo valor absoluto).</li>
            <li><b>'🎬 Scripts' — hierarquia real tipo-DOM:</b> qualquer entidade do mapa pode ter um campo <code>paiId</code> apontando pra outra (sua "mãe") — <code>Select('#gab1').filhos()</code> seleciona o que está "dentro" dela, <code>.pai()</code> volta pra mãe, e os combinadores <code>&gt; + ~</code>/espaço passam a usar essa relação de verdade (em vez do fallback por andar) sempre que algum lado do seletor tiver <code>paiId</code>.</li>
            <li>'🎬 Scripts' — novas ações de equipamento: <code>.ligar()</code>/<code>.desligar()</code> (mesmo campo <code>rede.ligado</code> que Access Point/Rack já usam), <code>.abrirTampa()</code>/<code>.fecharTampa()</code> (gira a peça marcada <code>.tampa</code>, funciona chamado no próprio objeto ou num filho), <code>.iniciarVarredura()</code> e <code>.aparecer()</code>/<code>.desaparecer()</code> (fade de opacidade). Novo modelo "🗄️ Hierarquia: Gabinete e Access Point" demonstra as quatro.</li>
            <li>'🎬 Scripts': a janela ficou maior (340px → 560px, mais alta) e ganhou uma barra rápida no topo — um seletor só com os scripts + botões "▶️ Executar"/"↩️ Desexecutar" — pra rodar um script sem precisar achar o card certo na lista.</li>
            <li>Novo mapa de exemplo pronto pra importar ("Configurações" → "⬆️ Importar backup"): "🏢 Prédio de Exemplo (2 andares)" — 2 andares com salas e uma Sala de TI (Gabinete com tampa, Access Point, Rack, extintor, quadro elétrico, tubulação), pensado pra testar/ver os modelos de script acima em ação. Arquivo entregue separado do app (não faz parte do backup do aparelho).</li>
            <li><b>'🎬 Scripts' — <code>.iniciarVarredura()</code> agora dispara a varredura de AP de VERDADE:</b> quando o 'Ver em 3D' está aberto, ou a 'Miniatura 3D' (painel 'Ferramentas' da Planta baixa) está ativa, o script chama o mesmo raytracing 3D real do Access Point (não só liga o AP). Sem nenhum dos dois abertos, avisa com um aviso na tela em vez de fingir uma varredura.</li>
            <li>Mapa 2D: um Access Point com varredura em andamento (disparada por um script, ou pelo próprio 'Ver em 3D'/Miniatura 3D) mostra uma barrinha de progresso flutuando perto dele, igual à do 'Ver em 3D' — continua aparecendo mesmo alternando entre os dois modos.</li>
            <li><b>Novo: 'Ver em 3D' → botão '🎬 Scripts'</b> (ao lado de '🏷️ Grupos') — mesmo formato reduzido do '🏷️ Grupos' aqui dentro: nome do script + botões "▶️"/"↩️" pra executar/desexecutar direto na cena 3D aberta (sem o editor completo, que continua só no Mapa 2D).</li>
            <li>'🎬 Scripts' (Mapa 2D): corrigida a janela se redimensionar sozinha (encolher/crescer pela parte de baixo) ao ser arrastada pelo título — e agora é possível redimensioná-la de verdade, arrastando pelas bordas/cantos (mesmas alças de Camadas/Objetos), com o tamanho lembrado entre aberturas.</li>
            <li><b>Portas: a folha agora abre/fecha DE VERDADE no Mapa 2D</b> (antes era só um símbolo fixo, sempre a 90°, que nunca mudava) — novas ações de script <code>.abrirPorta()</code>/<code>.fecharPorta()</code> (animam de verdade, mesmo campo <code>anguloAbertura</code> já usado no 3D) e <code>.trancar()</code>/<code>.destrancar()</code> ("fechadura" — uma porta trancada não abre por script).</li>
            <li>Importar backup: um arquivo agora também pode trazer <code>scripts</code> (os scripts globais de automação do '🎬 Scripts') — importados junto com os mapas, sem duplicar ao reimportar o mesmo arquivo.</li>
            <li>Mapa de exemplo "🏢 Prédio de Exemplo (2 andares)" regenerado: portas e janelas agora ficam de verdade presas às paredes (uma porta da Sala de TI vem trancada, pra testar <code>.destrancar()</code>/<code>.abrirPorta()</code>) e o arquivo já chega com os 8 scripts de exemplo criados no '🎬 Scripts' — nenhum precisa ser criado manualmente antes de testar.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">25/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Padrão de fábrica do app passou a ser o layout Clássico (antes: Workspace); o botão 🔀 no cabeçalho continua alternando entre os dois. 'Redefinir padrões' também volta para o Clássico.</li>
            <li>Importar backup: um ícone girando acompanha a barrinha no canto superior direito durante TODO o processo (leitura, mapas, fotos, patrimônios e atualização das telas) e só some quando tudo terminou.</li>
            <li>Mapa → Fotos: as fotos tiradas em 'Foto desse patrimônio' → 'Anexar foto' não aparecem mais junto das fotos do ambiente; ficam numa fileira separada, revelada pelo botão '📎 Fotos de patrimônio (N)'. Fotos antigas desse tipo (anexadas a um patrimônio, sem marcações e sem posição no mapa) são reclassificadas uma vez.</li>
            <li>Tabela: ao editar um patrimônio (ex.: trocar o tipo), o ícone é atualizado na hora — inclusive em itens vindos de backup importado, que guardavam o ícone antigo.</li>
            <li>Exportar backup: ordenação igual à da Tabela ('Criado ↓', 'Modificado ↓', 'Última consulta ↓', 'Patrimônio A-Z'), aplicada às listas e à ordem dentro do arquivo exportado.</li>
            <li>Exportar backup: as marcações e opções da janela ficam guardadas até a página ser recarregada (fechar e reabrir a janela mantém tudo).</li>
            <li>Exportar backup: opção 'Vincular itens associados' (ligada por padrão) em Patrimônios, Imagens e Mapas — marcar um item marca automaticamente o que está ligado a ele (mapa, fotos, patrimônios marcados na foto, mapa da Câmera); nunca desmarca nada sozinho.</li>
            <li>Novos botões 'Exportar': na lista de mapas (à esquerda de 'Renomear', exporta tudo daquele mapa) e na ficha do patrimônio na Tabela (exporta o patrimônio, a(s) foto(s) em que aparece e o mapa dele).</li>
            <li>Ficha do patrimônio: o botão de voltar da foto aberta por 'Ver a marcação deste patrimônio na foto' volta para a tela anterior com a mesma ficha ainda aberta (não é refeita).</li>
            <li>Corrigido: a janela de 'Carregar Configurações de Fábrica' às vezes ficava escondida atrás de outros painéis (camadas/z-index).</li>
            <li>Access Point: o raio ignora apenas a caixa 3D do próprio AP; superfícies reais encostadas nele (viga, laje, parede — mesmo a menos de 3 cm) passam a contar nas duas varreduras (antes eram ignoradas). Explicado na Documentação do Access Point.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">24/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Varredura avançada do Access Point (reflexão + refração, ambas ligadas por padrão), coexistindo com a normal: nuvem de pontos, raios e malha próprios, cada um com os 5 níveis, barra de progresso (na janela e junto ao AP) e cancelamento a qualquer momento. Reflexão/refração podem ser ligadas/desligadas depois da varredura; sem nenhuma, o resultado é idêntico ao da normal.</li>
            <li>Nova seção 'Configurações do Access Point' (janela e janelinha espelhadas): manter varredura anterior (normal e avançada) e as opções que estavam em Configurações 3D → Access Point.</li>
            <li>Varredura avançada: limites padrão ajustados para 6 reflexões e 4 refrações por raio; confirmado que o 'Limiar (dBm)'/perda por distância sempre encerra o raio primeiro, mesmo com esses limites ainda não atingidos.</li>
            <li>As duas barras de progresso próximas ao AP (normal e avançada) agora aparecem numa única caixa; a linha da varredura avançada é azul.</li>
            <li>'Configurações 3D → Access Point' passou a ter as mesmas 5 opções da janela do AP (as 2 de 'manter varredura anterior' funcionam como padrão global, aplicado a todo AP do mapa aberto), com um traço separando-as das 3 que já valiam para as duas varreduras.</li>
            <li>Barras de progresso próximas ao AP redesenhadas: 1 caixa maior com o nome do AP e, dentro dela, 1 caixa por varredura em andamento (normal em cima, avançada embaixo), cada uma com seu título numa linha e a barrinha noutra, sem mais texto sobreposto.</li>
            <li>Varredura avançada: agora também dá pra controlar o número de refrações por raio (além das reflexões), cada campo logo abaixo do checkbox correspondente ('reflexão'/'refração').</li>
            <li>'Refazer Varredura de Sinal ao entrar no "Ver em 3D"'/'Manter a Varredura de Sinal Anterior' viraram um par de opções (rádio) em vez de checkboxes, deixando claro que é uma escolha entre as duas (nos três lugares: janela do AP, janelinha e Configurações 3D).</li>
            <li>Corrigido: ligar/desligar reflexão ou refração depois da varredura avançada não faz mais a malha "piscar" (a troca agora é instantânea).</li>
            <li>Trocada a ordem de 'pontos do raycaster'/'raios do raycaster' (raios primeiro); removido o sufixo '(por nível)' de 'superfície da malha' e 'raios do raycaster'.</li>
            <li>'Configurações 3D' reorganizadas: ordem das seções ajustada; removida a seção 'Rotação do mapa 2D' (pertencia às 'Configurações 2D'); removidas as seções duplicadas 'Apresentação', 'Modo de voo 3D', 'Hora do dia', 'Raycasting (mira do 3D)', 'Scripts (exemplo)', 'Luz ambiente', 'Access Point' e 'Item associado', que apareciam repetidas; removidos os botões de atalho do cabeçalho.</li>
            <li>Novo botão '📖 Documentação do Access Point' (em 'Configurações 3D' e na janela completa do AP — não aparece na janelinha), que abre uma janela com a explicação de toda a varredura de sinal Wi-Fi (normal e avançada, reflexão/refração e demais opções) e ilustrações de raio direto, refletido e refratado.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">21/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Novo objeto Access Point Wi-Fi (Redes): 1 porta RJ-45 que recebe cabo; só emite sinal ligado e com cabo conectado.</li>
            <li>Mapa volumétrico de sinal 3D: varredura por raios (antena semi-direcional, queda 1/d², paredes/pilares/vigas -80%, portas de madeira -30%, vidro/janela -15%), em verde/amarelo/vermelho.</li>
            <li>Painel do AP: faixa (2,4/5/6 GHz), potência, densidade da varredura e botão 'Refazer Varredura de Sinal' com barra de progresso; roda em lotes por quadro sem travar a tela.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">20/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Cabos 3D mantêm formato de cilindro em curvas fechadas; sombreamento corrigido e saída do patch cord reduzida para 4 cm.</li>
            <li>Cabos de rede: cor individual por cabo (paleta ou livre) e etiqueta com modo passar o mouse, sempre visível ou oculta.</li>
            <li>Tela 'Tabela' não aparece mais por trás ao abrir o app; cor por seção em Configurações 3D corrigida.</li>
            <li>Configurações 2D: opções de manter posição, zoom e apontamento da câmera do personagem ao recarregar a página.</li>
            <li>Modo M do cabo mais fluido ao mover nó; ferramenta Apagar destaca o cabo com linha tracejada branca no mapa 2D.</li>
            <li>Junção de eletrocalhas revertida: sem perguntas de união ou derivação em T, cada segmento fica independente.</li>
            <li>Eletrocalha, Leito aramado, Canaleta PVC e Eletroduto voltam a ser peças únicas de tamanho fixo (como a Impressora), sem motor de desenho por pontos; o motor procedural foi removido do projeto.</li>
            <li>Câmera (foto): giro em Y das rotações manuais invertido no botão e no preview; o botão ‹ volta ao painel com as duas opções; Inclinação passa a inclinar a câmera no 3D sem girar em torno do apontamento.</li>
            <li>Patrimônios: botões Associar/Editar dentro de 'Patrimônio(s) associado(s)'; a ferramenta 'Adicionar orb' sobre um objeto pergunta se deseja vincular um patrimônio.</li>
            <li>Escada: modelo 3D e Modelador seguem as propriedades do próprio objeto (padrão de fábrica 11 degraus).</li>
            <li>Modelador: carrega a malha real do objeto; alterações só são gravadas em 'Aplicar alterações' (botão vermelho) ou ao aplicar na saída; sair com alterações pergunta aplicar ou descartar, comparando valores exatos.</li>
            <li>Janelas novas (modais e cartões) sempre surgem à frente das demais, gerenciadas pelo windowmanager.</li>
            <li>Escada: altura, degraus e detecção ao subir são de cada escada (duas escadas com alturas diferentes não se misturam); é sempre gerada por código.</li>
            <li>Modelador: 'Aplicar alterações' azul e 'Sair do Modelador' vermelho transparentes; 'Sair da câmera' também vermelho transparente; Switch, Patch panel e Rack entram inteiros (caixa, conectores e portas) no grupo editado, e entrar e sair sem alterações não muda mais o objeto.</li>
            <li>Roda das rotações: marcador azul do giro em Y volta a girar no sentido do arrasto.</li>
            <li>Escada: nasce com os valores de fábrica do catálogo (11 degraus, altura e medidas do modelo) gravados no próprio objeto; o que for alterado vale só para aquela escada, sem depender de outras escadas nem do mapa.</li>
            <li>Modelador: peças com cor própria e vidro translúcido simples são preservados (Rack, Switch, Patch panel), também fora do Modelador; faces coplanares viram quadriláteros e a oclusão/projeção passam a ser guardadas em cache e calculadas aos poucos, mantendo o fps.</li>
          
            <li>Corrigida a tela preta de 'Comportamento do objeto' (Acessar modelos): o editor de componentes e scripts abre normalmente.</li>
            <li>'Acessar modelos': 'Importar .obj' virou 'Importar objeto' e abre uma janela com o conversor .obj integrado (arrastar/selecionar) e o passo a passo completo de como adicionar um objeto ao app, incluindo o motivo de ser feito assim (abertura por file:///).</li>
            <li>Objetos importados aparecem na lista como os demais, com selo 'novo' (1 dia por padrão); Configurações 2D → Objeto: duração, selo fixo ou variável, texto ('agora mesmo', 'há 1 minuto'…) e posição (junto, início ou fim).</li>
            <li>Ferramenta Objetos: 'Por tipo' virou 'Por categoria' (padrão), com subtítulos coloridos por categoria (Estrutura, Mobiliário, Robótica, Redes, etc.).</li>
            <li>Novo objeto Viga (horizontal, 20x40 cm, 3 m); Pilar passou ao padrão de mercado (30x30 cm).</li>
            <li>Rack editado no Modelador continua interagindo: as portas seguem articuladas (duplo clique), com o vidro do cenário; equipamentos não entram no Modelador e continuam nas posições do rack.</li>
            <li>Modelador: o vidro usa a mesma textura do cenário (no Modelador e depois de aplicar); cores e vidro são preservados ao aplicar.</li>
            <li>Ctrl+Z depois de sair do Modelador (com alterações aplicadas) devolve o objeto à versão de antes de entrar; Ctrl+Y refaz.</li>
            <li>Importar objeto: botão '⬇ Baixar .bat' (ativo ao escolher os arquivos) que instala o objeto por dois cliques na pasta do index.html, com verificação de pasta, progresso no prompt e texto do manifesto exibido; campos de nome com contraste corrigido e dicas nos botões; conversor web atualizado.</li>
            <li>Acessar modelos: 'Excluir' objeto (com confirmação, janela de arquivos/alterações e .bat de exclusão) e 'Restaurar objetos'.</li>
            <li>Selo 'novo' também em modelos criados por 'Criar novo modelo' e objetos carregados; importação antiga substituída pela janela nova também no Ver em 3D.</li>
            <li>Ctrl+Z/Ctrl+Y mostram um aviso 'Aplicando desfazer/refazer' enquanto a ação é processada; o widget ↶/↷ 'Sempre mostrar' agora aparece também no Mapa e acima das janelas (registrado no windowmanager).</li>
            <li>Modelador: Patch panel e Switch mantêm interação (tecla E, portas, LEDs piscando) e não ganham mais textura de vidro na frente; a serigrafia deixou de ser tratada como vidro.</li>
            <li>Modelador: ao mover o Rack, os equipamentos instalados acompanham (desfazer também os restaura).</li>
            <li>Selo 'novo' também em 'Acessar modelos', com opção em Configurações 2D → Objeto; botão Excluir mais à direita e janela de exclusão (.bat e instruções) sempre exibida.</li>
            <li>Importar objeto: método manual em passos numerados; área 'Manifesto' com só a linha a copiar, em aspecto de editor de texto.</li>
            <li>Mapa: 'Excluir todos os mapas' na troca de mapa.</li>
            <li>Configurações do app: novo botão 'Carregar Configurações de Fábrica' (restaura tudo e desvincula os dados do IndexedDB do app).</li>
            <li>Foto 'Deixar sem vínculo por enquanto': a foto (posição de reserva) agora aparece de fato na Caixa até ser vinculada a um lugar.</li>
            <li>Modelador: ao pegar com E um switch/patch panel modelado, o ghost mantém a forma editada e recebe a tinta verde/azul/vermelha como os demais.</li>
            <li>Acessar modelos: rolagem vertical sempre disponível (eventos de roda não vão mais para o mapa por baixo); janela de exclusão mostra o nome dado ao objeto e usa verbos no imperativo ('apague', 'altere', 'remova').</li>
            <li>Configurações do app: a seção 'Workspace — abrir em tela cheia?' só aparece no layout Workspace.</li>
            <li>Janela 'Ferramentas' (Mapa 2D) e rodapé do 'Ver em 3D': distribuição editável (✏️) — arrastar para mudar de lugar, remover e adicionar botões, com 'Padrão' para restaurar.</li>
            <li>Porta, Janela, Piso e Parede continuam na janela 'Ferramentas' e agora também aparecem em 'Objetos' e 'Acessar modelos'.</li>
            <li>2D: 'Guardar apontamento da câmera e posição do personagem' agora guarda também a posição do personagem.</li>
            <li>'Acessar modelos': barra de rolagem igual à da janela 'Ferramentas'; Porta, Janela, Piso e Parede têm modelo (gerado por código) como a escada.</li>
            <li>O layout da janela 'Ferramentas' e do rodapé do 'Ver em 3D' agora é editado nas configurações 2D/3D (arrastar, remover e adicionar objetos do catálogo); ícones iguais aos de 'Objetos'.</li>
            <li>3D: propriedades do objeto abrem expandidas e centralizadas; destaque de 'Item associado' aplicado a todos os objetos; no 2D, os destaques valem para todos os patrimônios.</li>
            <li>Lista de patrimônios associados a um objeto não é mais espremida em uma linha só.</li>
            <li>Colisão de topo dos objetos: agora vem marcada por padrão e, quando desmarcada, o personagem não sobe/pisa no objeto.</li>
            <li>Apontamento da câmera e posição do personagem passam a ser guardados automaticamente (só depois de parados pelo tempo de salvamento configurado e só se mudaram), sobrevivendo ao F5.</li>
            <li>'Acessar modelos': a porta nasce com maçanetas e a janela com moldura e vidro, iguais ao 'Ver em 3D'.</li>
            <li>Propriedades do objeto: removido o campo 'Patrimônio' digitável (use o ✏️).</li>
            <li>Propriedades da câmera (mapa 2D): 'Anexar foto' aceita um arquivo do aparelho ou uma foto já tirada em 'Mapa' → 'Fotos' (com botão para voltar às propriedades da câmera).</li>
            <li>Toda janela ativada por um botão agora toma a frente das demais.</li>
            <li>Painel e gimbal de 'Ver através desta câmera' ficam sempre na frente e dentro da área visível.</li>
            <li>Câmera (Ferramentas): 'Anexar foto' agora pergunta se a foto vem do aparelho ou de 'Mapa → Fotos' (com botão de retorno às propriedades).</li>
            <li>'Ver através desta câmera': a dica 'Clique para interagir com o cenário 3D' não aparece mais; o painel de controle da câmera é criado antes do overlay e com logs '[CamControl3D]' + linha de debug visível no painel.</li>
            <li>'Ver em 3D': HUD de debug do controle de câmera sempre visível (canto inferior esquerdo) e logs [CamControl3D] no console.</li>
            <li>'Ver através desta câmera' (objeto Câmera/orb de foto): agora abre o painel Pitch/Yaw/Roll/Altura + gimbal. Também 'Anexar foto' no cartão 3D da câmera oferece aparelho ou Mapa → Fotos.</li>
            <li>Controle de câmera: yaw agora é rumo de bússola (0° = norte do mundo, horário +) e a câmera do personagem gira no mesmo sentido do gimbal (que ganhou marca 'N'); novo anel + barras de pitch/roll + direcional em vidro; botões '🎥 Controle' e '◎ Anéis' para ocultar; HUD e informações de debug agora são opções em Configurações 3D → Debug (desligadas por padrão).</li>
            <li>Controle de câmera: sem bandeja; anel circular = roll, barra inferior = yaw, barra vertical = pitch (4× maior, centralizados, cursor infinito via Pointer Lock); yaw da cena espelhado em relação ao gimbal (e D-pad acompanha).</li>
            <li>Controle de câmera: roll do anel corrigido (sentido) e só na faixa do anel; miolo do anel controla yaw+pitch como o gimbal; só gira enquanto o botão está apertado; mão aberta/fechada como cursor; cliques nos anéis não atravessam para a cena; D-pad centralizado abaixo da caixa do Controle.</li>
            <li>Controle de câmera: botão '🎯 Fino' (×1 / ×10 / ×100 mais devagar na mesma passada); botões Controle/Anéis/Fino no canto inferior direito da área do Ver em 3D; marcadores das barras não saltam mais ao ocultar/mostrar os anéis.</li>
            <li>Controle de câmera: os 4 valores (Pitch, Yaw, Roll, Altura) agora são o botão triplo (setas, arrastar, clicar para digitar); 'Controle' e 'Anéis' trazem a janela para a frente ao serem ligados (e clicar na janela/anel também); removido o desfoque do miolo do anel.</li>
            <li>Câmera: clicar na foto (painel do Mapa 2D e cartão do Ver em 3D) abre as opções 'Escolher um arquivo do aparelho', 'Usar uma foto já tirada (Mapa → Fotos)', 'Desvincular foto desta Câmera' e 'Cancelar'; dá para deixar a Câmera sem foto. Sem foto, continua o botão 'Anexar foto'. O antigo duplo clique da miniatura no 2D foi substituído por esse menu.</li>
            <li>Câmera (Ver em 3D): botão 'X' no canto superior direito da janela de propriedades. Mapa 2D: o botão 'Ver em tela cheia' do painel da foto voltou a funcionar.</li>
            <li>Mapa 2D: quando objetos se sobrepõem (ex.: monitor sobre a mesa), o objeto colocado por último recebe o clique e o arrastar. No empilhamento, o objeto pousa no que está sob o seu centro — um monitor colocado na mesa ao lado do gabinete fica rente ao tampo, e só sobe no gabinete se for colocado nele.</li>
            <li>Propriedades do objeto (Ver em 3D): novo campo 'Posição Y (m)' para a altura; 'Andar / piso' passa a ser um deslocamento (offset).</li>
            <li>Rack: roteamento automático dos cabos traseiros do patch panel — recuo reto de 5 cm, desvio reto até a guia vertical, curva de 90° e subida/descida em super feixe até a furação da tampa. Novo painel 'Saída de cabos' (Desligado/Topo/Base; Centro/Canto esquerdo/Canto direito/Personalizado com offset X/Z). Racks novos nascem com saída pelo Topo; racks já existentes também passam a se auto-organizar pelo Topo (escolha 'Desligado' para manter o desenho antigo). Mudou direção ou alinhamento, os cabos se refazem sozinhos.</li>
            <li>Empilhamento: monitor, teclado e mouse postos numa mesa (mesmo ao lado de um gabinete) agora ficam rentes ao tampo. O deslocamento 'y0' do catálogo (0,75 m do monitor etc.) era somado por cima da altura da mesa e os fazia voar acima do gabinete; objetos com elevação definida (pelo apoio ou pela mira) não somam mais o 'y0'.</li>
            <li>Propriedades do objeto (Ver em 3D): 'Y global (m)' (mundo: andar × altura do piso + Y local) e 'Y local (m)' (relativo ao andar) — editáveis, aceitam valores negativos e se atualizam juntos, inclusive ao trocar o 'Andar / piso (offset)'. Um objeto rente ao tampo de uma mesa de 0,74 m mostra Y global 0,74.</li>
            <li>Rack: cabos traseiros agora formam feixes organizados sem se atravessar. Cada patch panel vira um sub-feixe por lado (raias de profundidade + coluna na calha vertical); esquerdo e direito se unem lado a lado na furação, e cada patch panel a mais engrossa o super feixe em mais uma coluna.</li>
            <li>Ver em 3D: tecla E (carregar equipamento) muito mais leve com muitos cabos ligados — só os cabos do item carregado são atualizados durante o movimento e tudo é reconstruído uma vez ao soltar.</li>
            <li>Ver em 3D: os modos E, L e M mostram uma faixa destacada no centro, logo abaixo dos botões do cabeçalho, informando o modo ativo enquanto ele durar.</li>
            <li>Rack sobre um objeto 'Piso' (ou mesa) no mapa 2D: o rack agora nasce na altura do topo do objeto, em vez de no chão do 3D (o padrão de elevação 0 do rack impedia o empilhamento).</li>
            <li>Mouse e Mouse ergonômico: a maior dimensão agora fica na vertical do mapa 2D (largura e profundidade trocadas).</li>
            <li>Propriedades do objeto: grupos 'Posição' (X, Z, Y global, Y local, Andar / piso), 'Rotação' e 'Forma' destacados; 'Andar / piso' passou para logo acima da Rotação.</li>
            <li>Rack, 'Saída de cabos': novo 'Formato do feixe' (Retangular ou Cilíndrico) e 'Espaçamento' entre cabos (Afastado, Junto/colados ou Livre, com distância em múltiplos do diâmetro do cabo).</li>
            <li>Mapa 2D: o Rack (de piso ou de parede) também passa a ficar em cima do que já estiver na grade (Piso, mesa etc.); sem nada embaixo, fica no chão (rack de parede mantém 1,2 m). Vale também ao trocar U/profundidade do rack.</li>
            <li>Rack, 'Saída de cabos': a distância entre cabos agora chega até colados (0,87 × diâmetro: as faces do tubo se encostam); novo 'Espaçamento vertical' (Afastado, Junto ou Livre) para a distância entre os agrupamentos que correm na horizontal, nos formatos Retangular e Cilíndrico. Cantos dos cabos agora são arcos circulares concêntricos.</li>
            <li>Removido do app o antigo objeto de câmera do mapa (câmera de vigilância / orb de câmera / modo assistindo): dados do mapa, painel 2D, cartão 3D, modelo 3D, ferramenta da hotbar 3D e script de exemplo. Resta só a Câmera (foto) de Ferramentas.</li>
            <li>Removido do app o Camera Match (perspmatch.js e perspmatch-math.js, armazenamento de sessões no db.js e o bloco comentado no index.html).</li>
            <li>'Acessar modelos': porta e janela usam exatamente a malha do 'Ver em 3D' (maçanetas reais; vidro com um só reflexo). O painel/gimbal de 'Ver através desta câmera' foi movido para a camada correta da tela.</li>
            <li>'Ver através desta câmera' (3D, Modo Edição): novo painel com Pitch, Yaw, Roll e Altura (campos, botões − / +, segurar para repetir) e um gimbal 3D para clicar e arrastar.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">19/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Menus e cartões de objetos no 3D agora aparecem acima da imagem da câmera.</li>
            <li>Ao sair do Modelador em 'Ver através desta câmera', o gizmo não fica mais desenhado sobre a foto.</li>
            <li>O gizmo do objeto selecionado no Modelador passa a ser desenhado por cima da imagem, em 'Frente' e 'Trás'.</li>
            <li>'Cortar' agora amplia a foto proporcionalmente até cobrir o retângulo amarelo, sem ser cortada por ele.</li>
            <li>Eletrocalha, canaleta, eletroduto e leito aramado podem ser desenhados em polilinha, continuando de uma infra existente, com juntas ajustadas.</li>
            <li>Trena 3D: opções renomeadas e reorganizadas na janela rápida.</li>
            <li>Corrigido: laterais cortavam a passagem de cabos em cruzamentos de eletrocalhas.</li>
            <li>Patch panel e espelho: cabos podem ser ligados na parte de trás, com os 8 fios visíveis por trás, independentes da frente.</li>
            <li>Ver em 3D (rede): Esc sai da seleção de porta sem sair do modo; tecla Q desmarca a porta escolhida.</li>
            <li>Clique e destaque nos conectores da parte de trás do patch panel e do espelho corrigidos; botão do meio deixa Espaço e setas mais lentos.</li>
            <li>Trocar Cat6/Cat5e no patch panel atualiza imediatamente o nome exibido no 3D.</li>
            <li>Rack: controle das tampas (fechada, com abertura, sem tampa), chicote traseiro opcional e alerta de saída de cabos bloqueada.</li>
            <li>Mapa 2D: hover da eletrocalha em todo o trecho, com contorno tracejado, pontas retas e destaque no formato real do traçado.</li>
            <li>3D: abas da eletrocalha recortadas nas curvas sem deformar; corrigido cabo escurecido em dobras; arraste de nó com Shift encaixa em 45°.</li>
            <li>Ao recarregar a página, a tela inicial agora abre no Caixa, respeitando o modo Mapeamento de ambientes já escolhido.</li>
            <li>Modo Moldar cabo: destaque ao apontar para o cabo, guia vertical tracejada com Ctrl, excluir nó (X) e alternar curva/reta (B); ordem dos nós preservada.</li>
            <li>Mapa 2D: agora volta ao mesmo zoom e posição ao retornar do 3D ou trocar de aba, com opções em Configurações 2D, inclusive manter após recarregar.</li>
            <li>Trena 3D: Enter conclui a medida em sequência, e ela virou um módulo reutilizável, com painel de ajustes que pode ser exibido em qualquer janela.</li>
            <li>Modo Ligar cabo: prévia em tempo real do cabo curvo com conector transparente, destaque só de contorno na porta e sem tingir cabos ao passar o mouse.</li>
            <li>Novos equipamentos de TI: no-breaks e storages, além de setas de direção nos campos de posição X e Z e cabos exibidos no mapa 2D.</li>
          </ul>
<p style="font-weight:600; color:var(--text); margin-bottom:4px">18/09/2026 (continuação)</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li><b>Novo: ligar cabo clicando direto nas portas</b> — no "Ver em 3D", aperte <b>L</b> (ou use o botão "🔌 Ligar clicando nas portas" no menu de um switch/patch panel/rack) para entrar no modo de ligação: mire numa porta e clique — um 2º clique na MESMA porta confirma o início; repita mirando/clicando na porta de destino para confirmar e ligar o cabo na hora, sem abrir nenhum menu. O modo continua ativo para ligar vários cabos em sequência; Esc ou a tecla L de novo encerra.</li>
          </ul>
<p style="font-weight:600; color:var(--text); margin-bottom:4px">18/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li><b>Novo: guia dos objetos de rede</b> — em "⚙️ Configurações 2D" há agora a seção "🔌 Infraestrutura de rede" com o botão "📖 Descrição dos objetos de rede", que abre uma janela com TODOS os objetos (switch, patch panel, DIO, guias de cabos, bandejas, régua de tomadas, frente falsa, ventilação, espelhos e caixas de piso, abraçadeiras, eletrocalha, leito, canaleta e eletroduto): o que são, o que fazem e podem fazer, as teclas usadas e uma ilustração de cada (ícone do mapa 2D + renderização 3D).</li>
            <li><b>Infraestrutura passiva de rede:</b> DIO (12/24/48 fibras), guias de cabos horizontais e vertical, bandejas fixa e basculante, régua de tomadas (PDU), frente falsa, kit de ventilação, espelhos de parede (1/2/4 módulos), caixas de piso (2/4 módulos) e abraçadeiras de velcro/nylon — os de rack encaixam por U, alinhados aos furos.</li>
            <li><b>Caminhos de cabos:</b> eletrocalha, leito aramado, canaleta e eletroduto são desenhados por pontos (clique adiciona ponto, Enter conclui, Backspace desfaz, Esc cancela). O app calcula a taxa de ocupação (soma das seções dos cabos ÷ seção útil): fica âmbar a partir de 32 % e vermelha acima de 40 %, o limite da norma (TIA-569 / NBR 14565).</li>
            <li><b>Validação de cabos:</b> cobre em porta óptica e fibra monomodo em porta multimodo são recusados (erro); OM3 em OM4, Cat6A em keystone Cat6 e cabo blindado em porta sem blindagem geram aviso.</li>
            <li><b>Ver em 3D — pegar e carregar:</b> aponte para um switch, patch panel ou outro item de rede (até ~3,6 m) e aperte <b>E</b> para pegá-lo de verdade; ele vai junto com o personagem. Clique para soltar no chão, numa mesa, em cima do rack ou encaixar num U livre; <b>R</b> gira 90°, <b>Q</b> devolve ao lugar de origem (o Esc também cancela, mas o Chrome pode engoli-lo — use o Q).</li>
            <li><b>Etiquetas:</b> ao apontar para um item ou porta, o labelID aparece num balão sobre a tela.</li>
            <li><b>Rack modular, switch e patch panel (rodadas anteriores):</b> rack de 19" desmontável com porta de vidro, switch de 24/48 portas com LEDs e patch panel de 24/48 portas, com cabos entre portas; regras de clique diferentes no Modo Navegação (dois cliques) e no Modo Edição (clique esquerdo).</li>
            <li><b>Configurações do app:</b> a versão e a data da "última atualização" no topo agora estão em dia (v564 · 18/09/2026) — estavam paradas numa versão antiga.</li>
            <li><b>Limites conhecidos:</b> tudo isso ainda foi conferido só por testes automáticos (sem navegador real); não há simulação térmica, cálculo de carga elétrica nem raio de curvatura por cabo.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">18/09/2026 (demais alterações)</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Trena 3D: novo modo de medidas em sequência, com opção de medidas únicas ou agrupadas.</li>
            <li>Nova opção para ancorar a medida na ponta de uma medida já feita.</li>
            <li>Corrigido o salto na direção da câmera ao apertar ESC no Ver em 3D.</li>
            <li>Painel de debug da câmera agora é arrastável e só aparece se ativado nas Configurações 3D.</li>
            <li>O HUD do Ver em 3D passou a mostrar yaw e pitch da câmera.</li>
            <li>Portas e janelas podem ser apoiadas sobre outros objetos no mapa 2D; corrigido sumiço das medidas ao trocar Formas 2D/3D.</li>
            <li>O botão de orbitar em torno do objeto no Modelador voltou a aparecer logo acima do 'Modo Objeto'.</li>
            <li>'Esticar' agora cobre todo o retângulo amarelo mesmo após mudar a resolução da câmera.</li>
            <li>Ver em 3D: corrigido o ESC com captura do mouse e o botão de depuração que sumia ao sair e reentrar.</li>
            <li>Trena 3D: rótulos das linhas guia do 2º ponto passam a aparecer corretamente.</li>
            <li>Portas: já nascem com maçaneta e script de abrir/fechar por duplo clique; portas antigas também recebem; velocidade segue o duplo clique.</li>
            <li>Maçaneta: corrigidos lado e sentido do giro; duplo clique em portas e janelas funciona com o raycast "pixelperfect".</li>
            <li>Corrigido o editor de componentes/scripts, que às vezes não abria e ficava atrás de outras janelas.</li>
            <li>Novo objeto Rack modular (portas de vidro, armadura, equipamentos por U) e infraestrutura passiva de rede; novo modo "Ligar cabo" (tecla L).</li>
            <li>Maçaneta da porta: giro de 45° imediato ao fechada; ao fechar, ocorre quando falta 1/3 da abertura.</li>
            <li>Ver em 3D: clique esquerdo abre as opções no Modo Edição e dois cliques no Modo Navegação.</li>
            <li>Novos equipamentos de rack: switches de 24/48 portas e patch panels de 24/48 com portas RJ-45, SFP, LEDs e cabos entre portas.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">17/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Trena 3D: guias e linhas verticais com espessura, cor e estilo (sólida, tracejada, pontilhada); nova opção 'Sem pontas'.</li>
            <li>Caixas de texto das medidas: posição ajustável, opção de mostrar/ocultar e correção do deslocamento em relação ao ponto.</li>
            <li>Janelinha da Trena 3D: botões personalizáveis e reordenáveis, com controles de espessura, cor e texto.</li>
            <li>Configurações 3D: modo árvore compacto, prévias em ícone geradas em segundo plano e campos numéricos de arrastar.</li>
            <li>Novo aviso explicando como baixar o vanishCam quando a pasta está ausente ou incompleta.</li>
            <li>Ferramenta Objeto ganhou 'Organizar' (alfabética, por tipo ou livre); mensagens repetidas agora somam 'x2', 'x3'.</li>
            <li>O escurecimento fora do retângulo amarelo agora é recalculado a cada variação de zoom.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">16/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Trena 3D: nova opção de continuar medindo no nível do 1º ponto, com grade infinita e clique fixado nesse plano.</li>
            <li>Trena 3D agora pode medir em paredes, portas, janelas e laterais de objetos (opção nas Configurações 3D).</li>
            <li>Janelinha da Trena 3D redimensionável pelas laterais, com altura automática e tamanho salvo separado por modo.</li>
            <li>Configurações 3D: atalhos por seção com menu de subseções, faixa lateral nas seções e correção do 'Seguir relógio do mundo'.</li>
            <li>Novas guias na Trena 3D: guia rente ao chão e linhas guia da grade do mundo, com cores configuráveis; âncoras sem limite de 6 m.</li>
            <li>Corrigido o HUD de desempenho que ficava esticado quando colocado no canto da tela.</li>
            <li>Trena 3D: rótulos de medida só aparecem quando estão à frente da câmera e dentro do campo de visão.</li>
            <li>Trena 3D: novas pontas (esfera, seta, seta com dois traços, traço perpendicular) configuráveis e com aplicação imediata.</li>
            <li>Trena 3D: janelinha de acesso rápido agora fica no canto do 'Ver em 3D', com grupos por seção e sincronizada com as Configurações 3D.</li>
            <li>Trena 3D: botão 'Restaurar padrões', cor do gradeado configurável, guia de grade nas medidas finalizadas e ESC destrava a linha laranja.</li>
            <li>Trena 3D: corrigido erro ao usar Ctrl ou 4 cliques para fixar ponto no ar; o modo 'sempre 4 cliques' agora funciona.</li>
            <li>Câmera: a foto de referência é desenhada em 2D e 'Esticar', 'Caber' e 'Cortar' foram refeitos, sem 'zoom respirando' ao girar.</li>
            <li>Com internet, o app agora busca sempre os arquivos mais novos do servidor; sem internet, usa o cache local.</li>
            <li>Corrigidos arquivos que faltavam no modo offline.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">15/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Modelos 3D: a malha (.obj) pode ficar em arquivo separado do modelo e continua funcionando ao abrir o app direto do disco.</li>
            <li>Mapa 2D: a janela 'Camadas' redimensiona sem travar e as janelas vêm para a frente ao clicar, voltando ao normal ao fechar.</li>
            <li>'Ver em 3D': modos de visualização reduzidos a 'Sólido' e 'Wireframe'; vaso com visual novo e maçaneta da porta nas duas faces.</li>
            <li>Novo prédio de demonstração com 2 andares, salas, robôs, relógios e câmeras, cobrindo todos os objetos do catálogo.</li>
            <li>Retângulo amarelo das câmeras sempre visível e atualizado ao vivo ao mudar a resolução; nova seção 'Corte' (Início/Fim).</li>
            <li>Propriedades passou para dentro do botão '+' com seções Transformação, Fundo e Câmera; 'Sair da câmera' foi para o topo da tela.</li>
            <li>Corrigido erro que persistia após atualizar o app: agora os arquivos novos são sempre buscados do servidor na instalação.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">14/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Corrigido: a foto em 'Trás' cobria a tela inteira em vez de ficar dentro do retângulo amarelo.</li>
            <li>O zoom da roda do mouse agora converge em direção ao cursor, ao ampliar e ao reduzir.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">13/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Câmera unificada no mapa 2D e no 3D, com ferramenta única 'Câmera'.</li>
            <li>Corrigido: 'Trás' fazia a foto sumir por causa do chão do cenário.</li>
            <li>Modelador aberto a partir de 'Ver através desta câmera' fica travado na perspectiva da câmera, sem atrapalhar a edição.</li>
            <li>Painel 'Imagem': opacidade dentro do painel, deslocamento em metros e ajuste 'Esticar/Caber/Cortar' pelo sensor da câmera.</li>
          </ul>
<p style="font-weight:600; color:var(--text); margin-bottom:4px">12/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li><b>Ver em 3D — foto marcada como "Trás" (atrás dos objetos):</b> esta rodada arrumou uma sequência de bugs que foram aparecendo um atrás do outro, nesta ordem: <br>
            (1) <i>Problema:</i> o chão ficava escondido na TELA INTEIRA em vez de só na região da foto. <i>Solução:</i> o material do chão passou a "decidir sozinho", pixel a pixel, se aquele ponto está dentro do retângulo da foto — só ali ele desaparece; no resto da tela continua aparecendo normal. <br>
            (2) <i>Problema:</i> o vidro das janelas ficava ROSA CHOQUE por cima da foto. <i>Solução:</i> o vidro passou a ser desenhado À PARTE, num "desenho" separado que reaproveita o depth buffer/z-buffer que a cena já calcula (pra continuar ficando escondido atrás de paredes/móveis de verdade) e um shader próprio — sem precisar adicionar nenhum plano 3D novo à cena — e só DEPOIS esse resultado é "colado" por cima da imagem final. <br>
            (3) <i>Problema:</i> depois da correção acima, o vidro passou a ficar meio ACINZENTADO. <i>Solução:</i> a cor do vidro nesse "desenho à parte" estava sendo escurecida em dobro ao ser colada por cima da foto (um detalhe de como a transparência é calculada); corrigido revertendo esse escurecimento antes de colar, deixando o vidro de volta branco/claro, igual ao modo normal. <br>
            (4) <i>Problema:</i> ao segurar Shift + botão do meio do mouse e arrastar bastante a vista pra cima, um RETÂNGULO PRETO aparecia atrás da foto. <i>Solução:</i> o cálculo que decide ONDE "furar" a tela pra foto aparecer estava travando numa posição errada assim que a foto saía bastante da área visível; corrigido pra sempre recalcular esse recorte corretamente em qualquer nível de arrasto, inclusive quando a foto sai 100% da tela (aí simplesmente não há nada pra "furar").</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">12/09/2026 (demais alterações)</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Corrigido: a foto em 'Trás' aparecia espelhada na horizontal.</li>
            <li>'Cortar' agora mostra a imagem por inteira, sem esconder partes que não deveriam ser cortadas.</li>
            <li>Corrigido: 'Trás' deixava de aparecer ao fechar e reabrir o 'Ver em 3D'; a opacidade agora também vale em 'Trás'.</li>
            <li>Sair de 'Ver através desta câmera' sempre restaura o campo de visão anterior; seções 'Sair da câmera' unificadas.</li>
            <li>Novo painel 'Imagem' com Trás/Frente, Esticar/Caber/Cortar, deslocamento, espelhar e rotação.</li>
            <li>Configuração 'Sair da câmera' separada entre o objeto 'Câmeras' e o 'Orb de foto'</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">11/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Enquadramento amarelo agora é desenhado por cima da foto e acompanha o deslocamento (Shift + botão do meio).</li>
            <li>Novo controle de opacidade do 'Escurecer o entorno' (padrão 0,5) e campo único de FOV/distância focal com seletor de unidade.</li>
            <li>Editar resolução ou corte da câmera não altera mais o zoom, e as duas telas de 'Propriedades da câmera' ficam sincronizadas.</li>
            <li>Corrigido: foto em 'Trás' desalinhada dentro do Modelador e faixa vermelha nas bordas de 'Caber'/'Esticar'.</li>
            <li>Rotação e deslocamento da imagem não deixam mais cantos vazios no retângulo amarelo.</li>
            <li>Corrigido: cursor saltando ao soltar o mouse no Modelador e botão 'Sair do Modelador' que ficava preso.</li>
            <li>Editor de scripts com CodeMirror para JavaScript; obj.color como alias de obj.cor</li>
            <li>Removido o botão redundante 'Novo script'; novo componente entra no topo da lista</li>
            <li>Ver através da câmera esconde a malha da própria câmera; ao sair mantém a pose travada</li>
            <li>Corrigido o layout da janela 'Camadas' que não atualizava por causa de cache</li>
            <li>Editor de código (CodeMirror) passou a funcionar embutido no app, inclusive offline.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">10/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>'Ver através desta câmera': a própria câmera não pode mais ser clicada e o destaque de mira segue o cursor.</li>
            <li>Ao abrir o Modelador a partir de uma câmera, a perspectiva da câmera é mantida.</li>
            <li>Shift + botão do meio desloca a cena como uma foto arrastada, sem alterar a perspectiva.</li>
            <li>Botão de enquadramento agora é por câmera, na barra inferior junto de 'Sair da câmera'.</li>
            <li>Ver através da câmera: cursor de mouse aparece, objetos são selecionáveis e os menus normais abrem</li>
            <li>Zoom da câmera refeito com campo de visão real: cena nítida, zoom maior e afastamento além do enquadramento; botões não sofrem zoom</li>
            <li>Shift+B com o mouse faz pan panorâmico ao ver através da câmera</li>
            <li>Novo botão 'Enquadramento' mostra o retângulo amarelo do campo de visão de cada câmera</li>
            <li>Ver em 3D: painéis laterais unificados em um só '+' com abas 'Objetos' e 'Tijolos'</li>
            <li>Corrigida a duplicação de 'Orb de foto' e 'Câmera' no painel de objetos; ficou só 'Câmera'</li>
          </ul>
<p style="font-weight:600; color:var(--text); margin-bottom:4px">09/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li><b>Tela "Info":</b> corrigido um bug em que trocar de tela e voltar pra "Info" fazia os botões "Ver lista simples", "⚙️ Configurações do app", "❓ Ajuda" e o botão de nome do layout (o "quádruplo") sumirem — a causa era um mecanismo antigo ("modo Info", ligado a um seletor que também foi removido) que ficou desatualizado depois da tela "Info" virar parte permanente da divisão de telas.</li>
            <li><b>Tela "Info":</b> removido o seletor (dropdown) de trocar de tela que ficava dentro dela — era redundante com o seletor próprio de cada divisão da tela.</li>
            <li><b>Configurações do app:</b> o botão "⚙️" agora abre a tela de Configurações OCUPANDO A TELA INTEIRA (antes só revelava/redimensionava uma divisão pequena, que às vezes passava despercebida).</li>
            <li><b>Planta baixa:</b> corrigido um bug que fazia a barra de cabeçalho inteira (Copiar/Colar/Recortar/Ferramentas/Camadas/Histórico) sumir ao trocar de tela e voltar — a causa raiz era mais geral (afetava qualquer tela que "empresta" elementos fixos do topo do app) e foi corrigida na raiz.</li>
            <li><b>"Ver em 3D" — aglomerado de tijolos:</b> agora é um objeto que pode ser modelado (fundido numa malha editável, vértice a vértice) ou excluído — apontando com "Mirar" e clicando nele, abre um cartão com as opções "🔧 Modelar em 3D" e "🗑️ Excluir".</li>
            <li><b>Info — nome do layout:</b> a caixinha que guarda o nome agora tem tamanho fixo (não estica/encolhe mais) e o texto fica alinhado à esquerda, em vez de centralizado.</li>
            <li><b>Info — excluir layout:</b> corrigido um "piscar" da tela "Botões" ao excluir vários layouts com a mesma configuração em sequência rápida.</li>
            <li><b>Botão "Workflow" removido</b> — não fazia mais sentido dentro da tela "Botões".</li>
            <li><b>Layout padrão do app mudou:</b> "Info" em cima (largura toda), "Tabela" e "Ver em 3D" lado a lado no meio (largura toda), "Botões" embaixo (largura toda).</li>
            <li><b>Novo: layout "Clássico"</b> — um jeito ALTERNATIVO de usar o app, igual era antes do "Workspace" (blocos redimensionáveis) existir: uma tela por vez, em tela cheia, com barra de navegação fixa embaixo (Tabela/Cartões/Fotos/Mapa/Buscar). Liga/desliga a qualquer momento pelo botão "🔀" no cabeçalho (ao lado de "⚙️ Configurações"/"❓ Ajuda") ou em "⚙️ Configurações do app → 📦 Catálogo → 🖥️ Layout do app" — a escolha fica salva para a próxima vez que o app abrir.</li>
            <li><b>Workspace — divisões empilhadas:</b> corrigido um bug em que arrastar a barra de uma divisão que tinha 2 ou mais outras empilhadas por dentro dela conseguia espremer o espaço além do que essas divisões internas suportavam — as barras internas ficavam "furando" umas às outras (se sobrepondo) em vez de se travarem no limite umas das outras. Essa checagem de colisão agora acontece EM TEMPO REAL, a cada movimento do mouse durante o arrasto — antes só era corrigida no instante de soltar o botão do mouse, então dava pra ver as divisões se sobrepondo por uma fração de segundo até o ajuste final.</li>
            <li><b>Workspace — divisões lado a lado:</b> corrigido um bug parecido, na direção horizontal: um limite de segurança que eu tinha colocado no cálculo estava, sem querer, deixando o arrasto ir ALÉM do que era seguro em telas com painéis bem largos travados de um dos lados — o conteúdo desses painéis transbordava e dava a impressão de "várias divisões encolhendo" ao mesmo tempo. Agora o limite usa sempre o valor calculado de verdade, sem esse piso artificial.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">08/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Workspace: cada tela nas divisões abre só no espaço da divisão por padrão, com opção de tela cheia nas configurações.</li>
            <li>Arrastar um divisor redimensiona apenas as duas divisões vizinhas; divisão vertical pode encolher até a altura do cabeçalho.</li>
            <li>Cabeçalho e rodapé do Mapa ficam dentro da própria divisão; corrigido o erro 'Não consegui carregar Planta baixa' em divisão sem tamanho.</li>
            <li>Layouts nomeados no Workspace: barra com lista, nome editável, adicionar e excluir; nova tela 'Info' no dropdown, além de Caixa e Planta baixa.</li>
            <li>Corrigido: Modelador 3D com cenário preto/congelado; na tela Foto, redimensionar a divisão não estica mais a imagem.</li>
            <li>App inteiro passa a ser um layout de telas divisíveis (estilo Blender): Info no topo, Telas e Ver em 3D no meio, Botões embaixo</li>
            <li>Dropdown de cada divisão ganha 'Foto' e 'Organizar'; configurações do app ganham tela própria</li>
            <li>Botões da tela 'Botoes' carregam Tabela e Mapa corretamente na tela 'Telas' (Mapa abre a tela de entrada)</li>
            <li>Tijolos: correção de faces invisíveis, wireframe, ghost, cunha girando 90° por clique e botão direito para excluir</li>
            <li>Aglomerado de tijolos vira um objeto único, modelável e excluível; ghost da cunha com a forma correta</li>
            <li>Tela 'Conteúdo do app' removida; correção da tela preta ao trocar de modo no Modelador</li>
            <li>Divisões de tela agora ocupam toda a área disponível e as alturas não mudam sozinhas ao arrastar.</li>
            <li>Corrigido: alterações nas divisões do Workspace eram perdidas ao trocar de tela.</li>
            <li>Botão do nome do layout maior e com tamanho fixo.</li>
            <li>Novo modo Info no dropdown do cabeçalho, independente dos botões do rodapé.</li>
            <li>Cabeçalho, Botões e Telas viram telas dockáveis; Tabela, Cartões e Capturar também podem ser divididas.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">07/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Corrigido: no mapa 2D, o HUD de desempenho agora move ao arrastar; Trena e Traço guia podem ser arrastados, inclusive com a ferramenta Selecionar.</li>
            <li>Miniatura 3D corrigida (tela preta, transparente e fantasma ao fechar); agora aparece, é movível, persiste entre abas e tem botão de ligar/desligar no rodapé do mapa.</li>
            <li>Nova opção nas Configurações 2D: fechar a miniatura ao sair do Mapa (desligada por padrão).</li>
            <li>App mais resistente a falhas: mensagem 'Não consegui carregar' com botão de detalhes e cópia do erro.</li>
            <li>Nova opção 'Efeitos de tela' nas Configurações 3D (escurecimento), com aviso para reentrar no 3D se não aplicar na hora.</li>
            <li>Novo modo servidor: pasta storage organizada por tipo, detecção automática do servidor local, guardar no servidor e/ou no IndexedDB, botão Gravar tudo no servidor e visualização da estrutura de arquivos.</li>
            <li>Mapa 2D: setas do teclado movem qualquer objeto selecionado; o snap corrige posições desalinhadas para a grade</li>
            <li>Mapa 2D: 1 clique seleciona qualquer objeto e 2 cliques abrem as propriedades; trena e traço guia movíveis por arrasto, com destaque de hover</li>
            <li>Rotação do mapa 2D: nova seção nas configurações, girar arrastando, botão de snap de rotação e ícone de norte maior</li>
            <li>Reticulo métrico: corrigido o desvio da grade interna ao girar o mapa; painel de Camadas desativado na vinculação de fotos</li>
            <li>Todos os objetos ganham nomes únicos; scripts em JavaScript por objeto (editor CodeMirror); materiais, texturas e cor por face no 3D</li>
            <li>Blocos de construção (tijolos autofundíveis) com desfazer/refazer, preencher volume, carimbos, cunhas e rotação em 90°; layout em painéis estilo Blender</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">06/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Fotos: ao marcar a posição, permanece na Planta baixa (padrão) ou volta a Fotos, configurável nas configurações 2D</li>
            <li>Fotos (vinculação): rotações em Y e de inclinação corrigidas, preview animado até o modo atrelado e snap com ícone de ímã</li>
            <li>Mapa 2D: clicar seleciona objetos (contorno tracejado) e DEL exclui; orb de foto excluído de verdade e com contorno azul</li>
            <li>Reticulo métrico: corrigidos sumiço ao selecionar, janela de propriedades que desaparecia e salto de posição ao recolher</li>
            <li>Janela de debug mantém a rolagem e permite alterar posições e visibilidade</li>
            <li>Toda inserção de objeto no mapa 2D atualiza o contador de itens do rodapé; todos são selecionáveis e excluíveis</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">05/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Réguas ligam por padrão ao entrar no Modo Navegação, com opção configurável (ligar, desligar ou manter); a Grade ganhou a mesma opção.</li>
            <li>Configurações 2D: escolha de todas as ferramentas e botões do cabeçalho que aparecem em Modo Navegação, com separador na bandeja lateral.</li>
            <li>Botão Encaixar da bandeja expande e mostra o valor de snap apenas enquanto está ligado.</li>
            <li>Origem da grade do Retículo métrico volta a seguir o ponto do primeiro toque.</li>
            <li>Em Mapa &gt; Foto, Medida e Traço guia ganharam círculo de destaque ao passar o cursor sobre as pontas.</li>
            <li>Reticulo métrico: correção dos pontos de ancoragem do gizmo, com redimensionamento mais coerente e âncora no lado oposto ao arrastado</li>
            <li>Reticulo métrico: clique seleciona e mostra o gizmo; duplo clique abre as propriedades no centro da tela; setas movem conforme o snap</li>
            <li>Reticulo métrico: novo modo de grade ancorada na origem do mundo (compartilhada entre reticulos), com controles no cabeçalho</li>
            <li>Fotos (vinculação no mapa): preview 3D com rotação corrigida, arraste interage com a câmera, snap de 15° ativável e linha tracejada imediata</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">04/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Ficha do patrimônio: botão Marcação em foto leva direto à foto e destaca o orb; Buscar ganhou botão de ficha.</li>
            <li>Nova ferramenta Orb de foto, que pode ser colocada no mapa sem foto e receber a imagem depois.</li>
            <li>Trena e Traço guia: reposicionar pontas corrigido e disponível também em Mapa &gt; Foto, com cadeado no menu lateral.</li>
            <li>Retículo métrico: origem sempre no canto superior esquerdo e grade acompanha mover e redimensionar.</li>
            <li>Trena e Traço guia: Shift trava ângulo em 15° e Ctrl trava perpendicular; modo de voo 3D virou configuração.</li>
            <li>Corrigidos giro em Y do orb, pouso suave da busca 3D e zoom da foto do patrimônio.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">03/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Mapa 2D: removido o botão de adicionar orb a partir de foto da bandeja lateral.</li>
            <li>Ao vincular um novo patrimônio ao mapa, agora há cruz fixa, faixa informativa e botão 'Marcar aqui'.</li>
            <li>Nova opção na ficha do item para editar/vincular a posição do patrimônio no mapa.</li>
            <li>Fotos de número de patrimônio ficam separadas das fotos de ambiente na grade de fotos.</li>
            <li>Trena: janela para digitar a medida, pontas em seta, e excluir só pela ferramenta Apagar; opção de reposicionar pelas extremidades.</li>
            <li>Traço guia: clicar sobre um traço já feito não o apaga mais.</li>
            <li>Mapa 2D: novas ferramentas Retículo métrico, Trena e Traço guia em bandeja lateral; girar o mapa; zoom por pinça no celular.</li>
            <li>Patrimônio e foto ganham botões para ver no mapa 2D e 3D com voo de câmera; nova busca dentro do mapa 2D e do 3D.</li>
            <li>Foto no mapa: orb arrastável, painel de propriedades em tela cheia com preview 3D e retângulo texturizado no Ver em 3D.</li>
            <li>Ver em 3D: anel de bússola, opção de hora do dia (manhã, dia, tarde, noite) e correção de altura de objetos altos.</li>
            <li>Modelador: menu lateral unificado, definir origem, união de objetos e câmera preservada ao sair.</li>
            <li>Corrigidos: isolamento por camada e camada 'Recuperados' que reaparecia; novo botão Baixar o app e pasta de dados do servidor configurável.</li>
          </ul>
<p style="font-weight:600; color:var(--text); margin-bottom:4px">02/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li><b>Organizar — arrastar e soltar dentro do mesmo mapa (Grade):</b> agora dá pra arrastar uma plaquinha de patrimônio ou uma foto pra reordenar a lista, com animação de "flipagem" nos vizinhos (mesmo efeito visual do "Ver lista simples") e uma caixa tracejada azul marcando o lugar — a foto continua carregando as vinculações dela junto.</li>
            <li><b>Organizar — arrastar entre mapas diferentes:</b> corrigido um bug em que clicar numa plaquinha destacava TODAS as vinculadas à mesma foto — agora só a plaquinha clicada é destacada, e a foto/os outros patrimônios só se juntam ao grupo quando o arrasto realmente cruza pra outro mapa. O fantasma que segue o cursor também ficou fiel ao tamanho de fonte/cantos/contorno originais em qualquer zoom da grade, e aparecem caixas tracejadas mostrando onde cada item vai ser acomodado no mapa de destino. Arrastar uma foto agora funciona clicando direto em cima da miniatura, não só ao redor dela.</li>
            <li><b>Organizar — miniatura ao vivo da planta:</b> corrigido um deslocamento errado ("paralax") ao clicar e arrastar dentro da miniatura pra navegar.</li>
            <li><b>Organizar — menu "Ver todas as opções de ordem":</b> fundo mais escuro, com mais contraste em relação às plaquinhas claras.</li>
            <li><b>Organizar:</b> a lista expansível de objetos do mapa agora usa o mesmo visual/animação das outras listas de vinculação, com botão de tesoura pra desvincular.</li>
            <li><b>Ver em 3D:</b> o botão "+" do lado esquerdo (atalho pro Modelador) agora fica sempre visível, mirando o objeto na frente da câmera — não só dentro do próprio Modelador.</li>
            <li><b>Modelador — escada:</b> corrigido um bug em que só entrar e sair do Modelador (mesmo sem editar nada) trocava a escada por uma caixa genérica no 3D.</li>
            <li><b>Iluminação — poste de luz:</b> ilumina ainda mais forte agora (9x o valor de uma luminária comum, no total).</li>
          </ul>
<p style="font-weight:600; color:var(--text); margin-bottom:4px">02/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li><b>Organizar — arrastar e soltar (Grade):</b> agora dá pra clicar e arrastar uma foto ou um patrimônio (plaquinha) pra outro mapa — os dois vão sempre juntos quando a foto tem patrimônios vinculados. Enquanto arrasta, aparece um "cartão fantasma" seguindo o cursor e uma caixa tracejada no lugar de origem; soltar em cima do mesmo mapa (ou numa área vazia) cancela e tudo volta pro lugar; ao concluir uma transferência, uma seta animada mostra o caminho percorrido. Também dá pra arrastar um patrimônio pra reordenar a lista dentro do mesmo mapa (no modo de ordem "Personalizado").</li>
            <li><b>Iluminação — poste de luz:</b> agora ilumina 3x mais forte (intensidade e alcance) do que uma luminária comum.</li>
            <li><b>Iluminação — mais luminárias acesas ao mesmo tempo:</b> corrigido um limite baixo demais que fazia algumas luminárias não acenderem quando várias eram colocadas perto umas das outras — o limite agora acompanha a qualidade 3D escolhida nas configurações.</li>
            <li><b>Modelador — botão do meio do mouse:</b> não dispara mais a rolagem automática do navegador (que travava a movimentação da câmera) dentro do "Editar" de um modelo 3D.</li>
            <li><b>Organizar — exclusões mais rápidas:</b> a primeira marcação de exclusão de uma sequência não fica mais lenta em mapas com muitas fotos.</li>
            <li><b>Organizar:</b> nova lista expansível com os objetos do mapa (móveis, luminárias etc.) embaixo da miniatura da planta, nos dois modos (Cartões e Grade); e, na Grade, a foto ganhou o mesmo ícone "📏" com a quantidade de medidas que já existia no modo Cartões.</li>
          </ul>
<p style="font-weight:600; color:var(--text); margin-bottom:4px">02/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li><b>Modelador — silhueta dourada corrigida:</b> o contorno do objeto selecionado (Modo Objeto) usa agora a técnica de "casco invertido" — corrigido um bug em que a silhueta aparecia como um bloco dourado sólido em vez de um contorno fino.</li>
            <li><b>Modelador — lâmpadas geram luz de verdade:</b> ao criar uma lâmpada (Ponto, Sol, Spot, Hemisfério ou Área) em "Criar", ela agora ilumina a cena de acordo com o tipo escolhido, e acompanha o objeto ao mover/girar/escalar o grupo.</li>
            <li><b>Modelador — divisória redimensionável</b> entre "Adicionar primitiva" e as propriedades do objeto criado, no menu lateral "Criar" (clique e arraste pra ajustar).</li>
            <li>Corrigido: a orientação de objetos (retângulo/polígono/mesa/pilar/luminária) girados no 2D aparecia 90° torta no 3D. Agora a rotação do 3D bate exatamente com a do 2D.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">02/09/2026 (demais alterações)</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Organizar: arrastar fotos e patrimônios entre mapas ou reordenar no mesmo mapa, com animações e caixas tracejadas de destino.</li>
            <li>Organizar: orb de colunas nas fotos, lista expansível de objetos do mapa e ícone com a quantidade de medidas por foto.</li>
            <li>Luminárias e postes iluminam mais e sem o limite baixo de luzes; lâmpadas do Modelador geram luz de verdade.</li>
            <li>Modelador: silhueta dourada de contorno, divisória redimensionável no menu Criar e botão + também no visualizador de modelos.</li>
            <li>Modelos padrão: criar novo modelo, renomear e editar a representação 2D do ícone.</li>
            <li>Corrigidos: escada virando caixa ao entrar e sair do Modelador, câmera Livre não preservada e botão do meio do mouse no editor.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">01/09/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Organizar: plaquinhas não crescem a caixa no hover e ficam sempre visíveis, mesmo com zoom afastado.</li>
            <li>Organizar: itens marcados para exclusão mantêm posição; mapa marcado ganha borda tracejada vermelha; vinculações têm botão reverter.</li>
            <li>Escada do mapa 3D agora pode ser subida andando; no 2D os degraus aparecem desenhados.</li>
            <li>Modelos 3D: corrigido movimento vertical invertido e baixa resolução ao editar.</li>
            <li>Modelador: duplicar funciona em Modo Objeto; propriedades sempre visíveis no menu Criar; seta do menu corrigida.</li>
            <li>Novo formato de mapa em texto (.txt): exportar e importar, com legenda explicativa, mapa de exemplo comentado e suporte a andares.</li>
            <li>Novo botão "Traço guia" nas fotos, para linhas tracejadas finas de referência visual.</li>
            <li>Novo botão "Redefinir padrões do app" nas Configurações do app.</li>
            <li>Sol e Lua no cenário 3D e novo objeto poste de iluminação pública.</li>
            <li>Salvamento em arquivo pelo servidor local, com preferências em arquivo separado e backup completo recuperável.</li>
            <li>Objetos padrão na planta 2D ficam sólidos sem transparência; duplicados são indicados em mais telas; HUD atualiza em qualquer tela.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">31/08/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Organizar (Grade): exclusão de fotos, mapas, patrimônios e vinculações com confirmação e destaque vermelho tracejado, aplicada só ao confirmar.</li>
            <li>Organizar: busca de patrimônio por mapa, ajuste de colunas (1 a 10), reordenação (crescente, decrescente, personalizada) e planta baixa ao vivo.</li>
            <li>Organizar: zoom mais fluido e grade de pontos desenhada como no mapa 2D; limites de zoom ajustáveis no cabeçalho.</li>
            <li>Organizar: desfazer só a última exclusão; ficam visíveis as vinculações com a planta baixa; lista de patrimônios sempre exibida.</li>
            <li>Corrigido: blocos não se sobrepõem mais, plaquinhas ficam com tamanho certo e o HUD de desempenho aparece no Organizar.</li>
            <li>Corrigido: ao mesclar mapas, o mapa selecionado passa a ser o mapa resultante.</li>
          </ul>
          <p style="font-weight:600; color:var(--text); margin-bottom:4px">30/08/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Organizar: novo modo de visualização "Grade", com arrastar para mover e zoom, ao lado do modo Cartões.</li>
            <li>Organizar: fotos e patrimônios podem ser movidos entre mapas; as alterações ficam pendentes até "Aplicar alterações" (ou "Reverter").</li>
            <li>Importação de backup com vários arquivos agora mostra progresso (lendo/salvando N de total) e o aviso de salvamento ficou estável.</li>
            <li>Novas opções em Configurações 2D: formato de download de fotos (JPG, PNG ou WEBP).</li>
            <li>Corrigidos vários detalhes do modo Grade: botão do meio faz pan, cartão inteiro arrasta, pontos de fundo acompanham o zoom.</li>
          </ul>
<p style="font-weight:600; color:var(--text); margin-bottom:4px">19/08/2026</p>
          <ul style="margin:0 0 14px; padding-left:18px">
            <li>Seleções (retângulo/laço/elipse) sobrepostas agora aparecem como um único contorno tracejado "andando" (marching ants), em vez de vários contornos distintos.</li>
            <li>Texto do mapa agora pode ser girado, e ganhou um retângulo de molde com alças (redimensionar/girar), além da janela de edição (que também ganhou campos de posição X/Y e rotação).</li>
            <li><b>Ferramenta "Selecionar" unificada:</b> um clique simples continua selecionando/desmarcando; clicar e arrastar a partir de uma área vazia da grade desenha a seleção (como sempre); clicar e arrastar a partir de CIMA de um item agora MOVE esse item — e, com Ctrl pressionado (havendo mais de um item selecionado no momento do clique), move todos os selecionados juntos.</li>
            <li>Novo botão de Ajuda (❓) no cabeçalho do Mapa, com este log de alterações e a janela "Sobre".</li>
            <li>Corrigido: o preenchimento azulado da seleção não sumia mais em certos níveis de zoom; e o contorno de seleções curvas (elipse/laço) não fica mais "serrilhado" quando é só uma seleção sozinha.</li>
            <li>A unificação visual de seleções sobrepostas agora só acontece ao SOLTAR o mouse (finalizar) — enquanto ainda está arrastando, a seleção em andamento aparece como forma própria, separada das já feitas. Um clique (dentro ou fora de uma seleção já feita) sem Ctrl sempre zera as seleções anteriores.</li>
            <li>Tela "Organizar": o cabeçalho com todos os botões agora começa recolhido (como uma cortina) — toque no botão "▾ Controles" pra abrir/fechar, liberando a tela no celular.</li>
            <li>Barras de botões que rolam na horizontal (cabeçalho do Mapa) agora mostram um gradiente nas bordas indicando que há mais botões pra rolar naquele sentido.</li>
            <li>Os painéis "Ferramentas", "Histórico" e "Camadas" agora preservam a posição em que foram arrastados ao fechar/reabrir (ajustando automaticamente se parte ficar fora da tela).</li>
            <li>Ícone do botão "Camadas" redesenhado: três quadrados sobrepostos em cascata.</li>
          </ul>
          
<p style="font-weight:600; color:var(--text); margin-bottom:4px">Também já implementado (rodadas anteriores)</p>
          <ul style="margin:0; padding-left:18px">
            <li>Atualização automática do app: o Service Worker busca a versão mais nova na rede antes de usar o cache, e recarrega sozinho quando detecta uma versão nova.</li>
            <li>Ferramenta "Formas": desenhar retângulos/polígonos na grade via retângulo de molde (clicar, arrastar, soltar — com alças de redimensionar/girar/mover), reeditar uma forma já colocada do mesmo jeito que uma recém-criada, e um painel de valores com mostrar/ocultar.</li>
            <li>Colar (Ctrl+V) ou carregar (botão 🖼️➕) uma imagem em qualquer camada da grade — vira uma forma editável com o mesmo gizmo de alças/rotação da ferramenta Formas; segurar Shift ao redimensionar mantém a proporção original. Também dá pra soltar/arrastar um arquivo de imagem direto na grade.</li>
            <li>Ferramenta "Reta/Curva": pontos de controle preservados ao reeditar, quadrado de mover corrigido.</li>
            <li>Camadas: organizar paredes/câmeras/objetos/textos em grupos, com visibilidade e bloqueio próprios.</li>
            <li>Histórico, Camadas e mostrar/ocultar barra de ferramentas agrupados no canto superior direito da tela.</li>
            <li>Ambiente único: não existe mais troca/criação/renomeação/exclusão de "ambientes" separados — todo o catálogo (fotos, orbs, câmeras, itens marcados no mapa) vive num único ambiente, sempre.</li>
            <li>Tela "Organizar": nível de detalhe por zoom, organização automática, exportar como PNG, atalhos de teclado, legenda dos símbolos, e vários ajustes de layout/espaçamento.</li>
            <li>Mapa 2D: câmeras, objetos, itens marcados na planta, texto livre, réguas, grade e encaixe (snap) configurável.</li>
            <li>Tabela: cabeçalhos redimensionáveis acompanhando as colunas, e a aba "Cartões".</li>
            <li>Captura de fotos com reconhecimento de texto (OCR) e sugestão de tipo por reconhecimento de objeto — tudo rodando localmente no aparelho, sem precisar de internet.</li>
            <li>Backup local, sincronização e exportação automática.</li>
          </ul>
        </div>
        <button class="btn secondary block modal-card-fechar" id="changelog-fechar" style="margin-top:14px">Fechar</button>
      </div>`);
