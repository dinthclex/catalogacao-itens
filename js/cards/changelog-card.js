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
