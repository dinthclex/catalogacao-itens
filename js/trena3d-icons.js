/**
 * js/trena3d-icons.js — Ícones/rótulos dos botões da janelinha de acesso
 * rápido da "📏 Trena 3D" (RODADA 191).
 *
 * [19/09/2026 UTC] NOVO — pedido verbatim: "Ícones, CSS, tudo deve ficar
 * modular e em arquivos separados." Cada entrada é um botão-toggle da
 * janelinha (`_trena3DConstruirConteudoPainelRapido`, em `js/trena3d.js`):
 * `campo` é o sufixo da config (`trena3D<campo>`, lido/escrito via
 * `this._cfgAdapter`), `icone` (emoji) OU `svgIcone` (SVG inline) é o
 * glifo do botão, `titulo` é o texto do tooltip e `grupo` é o nome da
 * subseção correspondente em "⚙️ Configurações 3D" (mesmo agrupamento
 * visual usado lá — ver `js/mapconfig.js`).
 *
 * Puramente DADOS — sem nenhuma lógica. Isso é o que torna possível trocar/
 * reordenar/adicionar ícones sem tocar em `js/trena3d.js` (o motor em si).
 * Precisa carregar ANTES de `js/trena3d.js`.
 *
 * [19/09/2026 UTC] REORDENADO (esta rodada) — pedido verbatim (vários itens
 * no mesmo turno) sobre a ORDEM dos grupos de botões na janelinha (o grupo
 * "Como funciona a ancoragem", sempre 1º e fixo por código — ver
 * `NOME_GRUPO_ANCORAGEM` em `js/trena3d.js` — nunca muda de posição, só o
 * que vem DEPOIS dele, que é 100% determinado pela ORDEM DESTE ARRAY, na
 * primeira vez que cada `grupo` aparece ao percorrê-lo):
 * 1. "Continuar no nível do 1º ponto — deve ficar 'ao lado' do botão de
 *    'Modo de ancoragem (ctrl)'": já era o 1º grupo deste array (posição já
 *    correta, logo depois do grupo fixo) — nenhuma mudança de POSIÇÃO
 *    necessária aqui.
 * 2. "Os DOIS botões da subseção 'Continuar no nível do 1º ponto' devem
 *    ficar juntos e em sequência": no HTML de `mapconfig.js`, a opção
 *    'Medidas em sequência' (⛓️, `ModoSequencia`) mora DENTRO da MESMA
 *    subseção/`<div class="mapconfig-section">` de 'Continuar no nível do
 *    1º ponto' (⇔▦, `ContinuarNoNivel`) — só na janelinha os 2 acabavam em
 *    grupos DIFERENTES ('Continuar no nível do 1º ponto' vs. 'Medidas em
 *    sequência', criado por engano como se fosse uma subseção própria).
 *    CORRIGIDO: `grupo` de `ModoSequencia` trocado para
 *    'Continuar no nível do 1º ponto' (mesmo grupo de `ContinuarNoNivel`,
 *    logo em seguida no array) — os 2 botões caem no MESMO container
 *    visual, um do lado do outro, exatamente como aparecem juntos na mesma
 *    subseção das Configurações 3D.
 * 3. (SUBSTITUÍDO, ver 3b abaixo) "'Mostrar ponto médio da medida' (⊙) deve
 *    ficar logo antes do botão de 'Desativar o destaque do raycaster...'
 *    (subseção 'Destaque de mira durante a âncora')": `MostrarPontoMedio`
 *    tinha `grupo: 'Medidas em sequência'` (RODADA 151, ao lado de
 *    `ModoSequencia`) — como `ModoSequencia` mudou de grupo (item 2 acima),
 *    esse grupo deixaria de fazer sentido pra ele sozinho. Ganhou um grupo
 *    PRÓPRIO ('Ponto médio da medida') e foi movido pra logo antes de
 *    `SuprimirDestaqueDuranteAncora`.
 * 3b. [19/09/2026 UTC] MUDANÇA (pedido verbatim, mesmo turno, logo depois do
 *    item 3): "esta opção ('⊙ Mostrar ponto médio da medida') deve ficar ao
 *    lado de '⛓️ Medidas em sequência' na janela da 'Trena 3D'." Volta o
 *    `grupo` de `MostrarPontoMedio` pra 'Continuar no nível do 1º ponto'
 *    (MESMO grupo de `ContinuarNoNivel`/`ModoSequencia`, item 2 acima) — os
 *    3 botões (⇔▦/⛓️/⊙) ficam juntos, lado a lado, logo depois do botão de
 *    ancoragem. O grupo dedicado 'Ponto médio da medida' (item 3) deixou de
 *    existir.
 * 4. "'Gradeado do ladrilho mirado' deve ficar ANTES do grupo 'Linhas guia
 *    da grade do mundo'": `GradeSnapLadrilhoAtiva` movido pra antes do
 *    bloco de 4 opções de `GuiaGrade*` — não tinha aparecido nenhuma vez
 *    ainda nessa altura do array, então essa é a primeira ocorrência do seu
 *    grupo, fixando a posição pedida.
 * 5. "As 4 opções de 'Linhas guia da grade do mundo' devem aparecer na
 *    MESMA sequência da subseção": já é o caso (checado contra o HTML de
 *    `mapconfig.js`: `GuiaGradeAtiva` → `GuiaGradeAposPrimeiroPonto` →
 *    `GuiaGradeNoSegundoPonto` → `GuiaGradeFinalizada`) — nenhuma mudança
 *    de ORDEM INTERNA necessária, só preservada ao mover o bloco inteiro.
 * 6. "As 2 opções de 'Guia rente ao chão' devem ficar por ÚLTIMO na
 *    janelinha": bloco (`MostrarGuiaChaoAoVivo`, `GuiaChaoFinalizada`)
 *    movido pro final do array — última posição = última a aparecer pela
 *    primeira vez = último grupo criado na janelinha.
 */
window.TRENA3D_ICONS_PAINEL_RAPIDO = [
      // [16/09/2026 UTC] NOVO (RODADA 101) — pedido verbatim: "Deve haver
      // uma subseção para isso na seção 'Trena 3D', consequentemente, na
      // janelinha, também." Posicionado PRIMEIRO na lista (logo depois do
      // grupo fixo "Como funciona a ancoragem", sempre 1º por código) — ver
      // comentário grande no topo do arquivo, item 1.
      { campo: 'ContinuarNoNivel', icone: '⇔▦', titulo: 'Depois de fixar o 1º ponto, continuar medindo livre em X/Z na MESMA altura (Y) dele, com um gradeado infinito de referência nesse nível', grupo: 'Continuar no nível do 1º ponto' },
      // [18/09/2026 UTC] NOVO (RODADA 148) — pedido verbatim: "Deve ter um
      // ícone intuitivo para a troca entre 'apenas uma medida' e 'medidas em
      // sequência'. Também na janela da 'Trena 3D'." Ícone '⛓️' (corrente),
      // MESMO ícone usado no badge da opção em mapconfig.js (ver comentário
      // grande lá, "Ícone escolhido..."). `campo: 'ModoSequencia'` segue a
      // convenção genérica de toggle booleano já usada por todo este array
      // (clique alterna `trena3DModoSequencia` — ver
      // `_trena3DAtualizarPainelRapido`, `this._cfgAdapter.set({[trena3D+campo]:...})`).
      // [19/09/2026 UTC] MUDANÇA (esta rodada) — `grupo` trocado de 'Medidas
      // em sequência' (grupo próprio, RODADA 148) para 'Continuar no nível
      // do 1º ponto' — ver item 2 do comentário grande no topo do arquivo:
      // as 2 opções moram na MESMA subseção real de `mapconfig.js`, então
      // agora também caem no MESMO grupo visual da janelinha, lado a lado.
      { campo: 'ModoSequencia', icone: '⛓️', titulo: 'Alternar entre "apenas uma medida" (padrão) e "medidas em sequência" — o 2º ponto de cada medida vira o 1º ponto da próxima, encadeando', grupo: 'Continuar no nível do 1º ponto' },
      // [17/09/2026 UTC] NOVO (RODADA 125) — pedido verbatim: "deve ter uma
      // opção para imprimir a esfera vermelha, mas com o nome de 'mostrar
      // ponto médio da medida'." Ícone '⊙' (RODADA 141), mesmo usado em
      // mapconfig.js ("📏 Trena 3D — Visibilidade", subtítulo "Ponto médio
      // da medida").
      // [19/09/2026 UTC] MUDANÇA (RODADA 199) — `grupo` trocado de 'Medidas
      // em sequência' (RODADA 151) pra um grupo PRÓPRIO ('Ponto médio da
      // medida') e movido pra logo antes de 'Destaque de mira durante a
      // âncora'.
      // [19/09/2026 UTC] MUDANÇA (esta rodada, pedido verbatim: "esta opção
      // deve ficar ao lado de '⛓️ Medidas em sequência' na janela da 'Trena
      // 3D'") — volta a ficar no MESMO grupo de `ModoSequencia` (que por sua
      // vez já está no grupo de `ContinuarNoNivel`, ver comentário acima) —
      // os 3 botões (`⇔▦`/`⛓️`/`⊙`) ficam juntos, lado a lado, logo depois
      // do botão de ancoragem. Grupo dedicado 'Ponto médio da medida' deixa
      // de existir.
      { campo: 'MostrarPontoMedio', icone: '⊙', titulo: 'Mostrar a esfera do ponto médio da medida', grupo: 'Continuar no nível do 1º ponto' },
      // [16/09/2026 UTC] MUDANÇA (RODADA 92) — pedido verbatim: "o que faz
      // a opção 'Suprimir destaque de hover durante a ancoragem'?" Tooltip
      // reescrito com a explicação completa (era só o nome curto da opção,
      // repetido — confuso por si só). O que ela faz: enquanto você está
      // ancorando um ponto (Ctrl segurado, ou âncora já marcada com um
      // clique), a mira normalmente destacaria com um contorno qualquer
      // parede/chão/objeto que estivesse "por baixo" dela (o mesmo
      // contorno de hover de sempre, fora da Trena 3D) — mas nesse momento
      // a mira já não está escolhendo um OBJETO, está escolhendo uma
      // ALTURA ao longo da reta vertical da âncora. Esta opção (ativada por
      // padrão) desliga esse contorno de destaque enquanto isso, pra não
      // confundir visualmente "isto é o que vou selecionar" com "isto é só
      // a mira passando por cima enquanto escolho uma altura".
      // [16/09/2026 UTC] MUDANÇA (RODADA 96) — pedido verbatim: "o ícone [...]
      // deve ser trocado pelo render do cubo com destaque pontilhado
      // (presente na seção '📏 Trena 3D — Destaque de mira durante a
      // âncora')." Miniatura SVG (24×24, reduzida pro tamanho do botão)
      // reproduzindo a MESMA silhueta/cores do preview de canvas de
      // `_trena3DDesenharPreviewDestaqueMira` (mapconfig.js): cubo
      // isométrico de 3 faces (topo mais claro, laterais mais escuras) +
      // contorno tracejado amarelo (`rgba(255,242,117,0.85)`) ao redor da
      // silhueta hexagonal — mostrado sempre com o contorno ATIVO (é o
      // "antes"/estado normal que esta opção suprime durante a ancoragem).
      {
        campo: 'SuprimirDestaqueDuranteAncora',
        svgIcone: '<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polygon points="12,3 20,7 12,11 4,7" fill="#6b7280"/><polygon points="4,7 12,11 12,19 4,15" fill="#454b58"/><polygon points="20,7 12,11 12,19 20,15" fill="#565c6a"/><polyline points="12,3 20,7 20,15 12,19 4,15 4,7 12,3" fill="none" stroke="rgba(255,242,117,0.85)" stroke-width="1.3" stroke-dasharray="2.4,1.8"/></svg>',
        titulo: 'Enquanto ancorando um ponto (Ctrl segurado/âncora marcada), esconde o contorno de destaque de hover que normalmente apareceria sob a mira — nesse momento a mira escolhe uma ALTURA na reta vertical, não um objeto de verdade (padrão: ativado)',
        grupo: 'Destaque de mira durante a âncora',
      },
      // [18/09/2026 UTC] MUDANÇA (RODADA 141) — pedido verbatim: os 4 botões
      // '⬍⚓', '┆1', '🔤┆' e '🏁┆' devem ficar juntos, no MESMO grupo visual
      // da janelinha. `grupo` unificado para 'Linhas verticais ancoradas'
      // (nome da subseção real em mapconfig.js que reúne as 4 opções).
      { campo: 'MostrarAlturaAoVivoAntesDoPonto', icone: '⬍⚓', titulo: 'Mostrar a medida entre a âncora e a bolinha "no ar" antes de fixar o ponto', grupo: 'Linhas verticais ancoradas' },
      { campo: 'ContinuarLinhaAncoraAposPonto', icone: '┆1', titulo: 'Continuar a linha tracejada da âncora depois do 1º ponto ser definido', grupo: 'Linhas verticais ancoradas' },
      { campo: 'MostrarMedidaNaLinhaAncoraAposPonto', icone: '🔤┆', titulo: 'Mostrar o texto da medida junto com essa linha continuada', grupo: 'Linhas verticais ancoradas' },
      { campo: 'MostrarLinhasAncoraFinalizada', icone: '🏁┆', titulo: 'Manter as linhas de âncora depois da medida já finalizada', grupo: 'Linhas verticais ancoradas' },
      // [19/09/2026 UTC] MUDANÇA (esta rodada) — pedido verbatim: "a opção
      // '⣿ Mostrar gradeado (pontilhado)...' deve ficar antes do grupo de
      // botões da subseção 'Linhas guia da grade do mundo'." Bloco inteiro
      // ('Gradeado do ladrilho mirado', 1 item) movido pra ANTES do bloco
      // de 'Linhas guia da grade do mundo' logo abaixo (era depois) — ver
      // item 4 do comentário grande no topo do arquivo.
      { campo: 'GradeSnapLadrilhoAtiva', icone: '⣿', titulo: 'Mostrar gradeado (pontilhado) dentro da área mirada', grupo: 'Gradeado do ladrilho mirado' },
      { campo: 'GuiaGradeAtiva', icone: '▦', titulo: 'Mostrar linhas guia até o ladrilho do mundo mais próximo dentro da área mirada', grupo: 'Linhas guia da grade do mundo' },
      // [18/09/2026 UTC] RENOMEADO (RODADA 154) — pedido verbatim: "a opção
      // '▦1 Continuar mostrando depois do 1º ponto, enquanto mira o 2º'
      // deve trocar de nome para '▦1 Mostrar no 1º ponto, enquanto mira o
      // 2º'." [19/09/2026 UTC] RENOMEADO DE NOVO (esta rodada) — pedido
      // verbatim: "a opção '▦1 Mostrar no 1º ponto, enquanto mira o 2º'
      // deve passar a se chamar '▦1 mostrar no 1º ponto'." Só o `titulo`
      // (tooltip do botão) mudou — mesmo `campo`/ícone/comportamento.
      { campo: 'GuiaGradeAposPrimeiroPonto', icone: '▦1', titulo: 'mostrar no 1º ponto', grupo: 'Linhas guia da grade do mundo' },
      // [18/09/2026 UTC] NOVO (RODADA 154) — opção IRMÃ da acima.
      // [19/09/2026 UTC] RENOMEADO (esta rodada) — pedido verbatim: "a opção
      // '▦2 Mostrar no 2º ponto, enquanto define o 2º' deve passar a se
      // chamar '▦2 mostrar no 2º ponto'." Só o `titulo` mudou.
      { campo: 'GuiaGradeNoSegundoPonto', icone: '▦2', titulo: 'mostrar no 2º ponto', grupo: 'Linhas guia da grade do mundo' },
      { campo: 'GuiaGradeFinalizada', icone: '🏁▦', titulo: 'Mostrar a guia de grade do mundo também nas medidas já finalizadas', grupo: 'Linhas guia da grade do mundo' },
      // [19/09/2026 UTC] MUDANÇA (esta rodada) — pedido verbatim: "os dois
      // botões [de 'Guia rente ao chão'] devem aparecer em sequência e
      // posicionados por último na janela da 'Trena 3D'." Bloco (2 itens)
      // movido pro FINAL do array — ver item 6 do comentário grande no topo
      // do arquivo.
      { campo: 'MostrarGuiaChaoAoVivo', icone: '⬌', titulo: 'Mostrar guia rente ao chão (verde) até o cursor, com a distância horizontal', grupo: 'Guia rente ao chão' },
      { campo: 'GuiaChaoFinalizada', icone: '🏁⬌', titulo: 'Mostrar a guia rente ao chão também nas medidas já finalizadas', grupo: 'Guia rente ao chão' },
];
if (typeof module !== 'undefined' && module.exports) module.exports = window.TRENA3D_ICONS_PAINEL_RAPIDO;
