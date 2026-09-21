/* js/geradores-salas.js
 * NOVO (13/09/2026) — INFRAESTRUTURA DE GERAÇÃO DE SALAS reutilizável,
 * pedida em 2 itens separados do backlog do usuário:
 *
 *  (A) "sala de monitoramento no térreo [...] deve ser como uma de verdade
 *      em uma cidade (pois, como o prédio será maior, ficará grande)."
 *  (B) "Copas (de café) [...] Faça um prédio maior, com banheiros feminino e
 *      masculino por andar."
 *
 * HONESTIDADE DE ESCOPO — LEIA ANTES DE ACHAR QUE O PRÉDIO V2 JÁ TEM ISSO:
 * esta rodada NÃO gera o prédio-exemplo inteiro com estas salas já
 * plantadas (a v2 completa do prédio, com estas peças montadas em cada
 * andar de verdade, fica pra uma rodada FUTURA dedicada a isso, como já
 * combinado com o usuário — ver dados_gerados/gerar_predio_v2.js). O que
 * ESTA rodada entrega é a FUNDAÇÃO REUTILIZÁVEL: 4 funções geradoras
 * prontas, testadas por `node --check` (análise estática — sem navegador
 * pra validar visualmente a geometria nesta sessão), que tanto
 * `gerar_predio_v2.js` (rodando em Node, fora do navegador) quanto o
 * próprio app do usuário (rodando no navegador, se algum dia expuser um
 * "motor de geração de mapas" pro usuário usar em qualquer prédio, não só
 * este) podem chamar.
 *
 * POR QUE UM ARQUIVO SEPARADO (não dentro de gerar_predio_v2.js direto):
 * pedido verbatim do escopo desta rodada — "um novo arquivo js/geradores-
 * salas.js se fizer mais sentido ter isso disponível pro motor de geração
 * de mapas do usuário usar depois em qualquer prédio, não só neste." Faz
 * mais sentido: gerar_predio_v2.js é um SCRIPT específico deste prédio-
 * exemplo (dimensões/paredes fixas dele); estas 4 funções não sabem nada
 * sobre "prédio de 40 andares" — recebem só coordenadas/parâmetros soltos,
 * então servem pra QUALQUER mapa.
 *
 * FORMATO UMD SIMPLES (não é um módulo ES/CommonJS "de verdade", só o
 * mínimo pra funcionar nos 2 ambientes que este projeto já usa pra código
 * gerador): `module.exports` quando rodando em Node (`require()`, como
 * gerar_predio_v2.js faz — ver dados_gerados/README-*.txt sobre como esses
 * scripts rodam), `window.GeradoresSalas` quando carregado como `<script>`
 * clássico no navegador (mesmo padrão de exposição em `window` já usado por
 * js/engine3d-profiles.js/js/scripting.js/etc.).
 *
 * DEPENDÊNCIAS INJETADAS (`deps`) — cada função recebe um objeto `deps` com
 * as operações de baixo nível que ELE JÁ TEM disponíveis (nunca importamos
 * nada global daqui, pra funcionar em Node OU no navegador sem duplicar
 * lógica):
 *   - deps.addWall(map, x1, y1, x2, y2, piso, extra?) -> parede criada
 *   - deps.addObject(map, x, y, tipo, piso, extra?) -> objeto criado
 *   - deps.addText(map, x, y, content, piso, extra?) -> texto/placa criado
 *     (ver js/mapping.js `Mapping.addText`)
 * Nenhuma das 4 funções abaixo lê/escreve `window`/`require` diretamente —
 * só usa o que vier em `deps`, o que também as deixa fáceis de testar
 * isoladamente (bastam mocks simples de `deps`, sem precisar de DOM nem de
 * um mapa real).
 *
 * [ÍNDICE]
 * - gerarSalaMonitoramento(map, deps, origemX, origemY, larguraDisponivel,
 *   numMonitores, piso?) — sala grande no térreo com parede de monitores +
 *   mesas/cadeiras de operador + boa iluminação (item A).
 * - gerarCopa(map, deps, origemX, origemY, piso) — copa de café pequena
 *   (item B).
 * - gerarBanheiro(map, deps, origemX, origemY, piso, genero) — banheiro
 *   feminino/masculino (item B).
 */

/** [item A.1] Sala de Monitoramento — "como uma de verdade em uma cidade":
 *  uma parede inteira coberta de monitores (fileira, reaproveitando os
 *  tipos "monitor"/"monitor2" já existentes no catálogo — ver
 *  js/engine3d-profiles.js — alternados pra dar variedade visual, como uma
 *  sala de controle de verdade raramente tem só um modelo de tela igual em
 *  todo lugar), mesas/cadeiras de operador em frente a cada bloco de
 *  monitores, e luminárias de teto extras (boa iluminação, pedido
 *  verbatim). Retangular, encostada numa "parede de monitores" imaginária
 *  no lado NORTE do retângulo (y = origemY) — quem chama decide onde essa
 *  parede física de verdade fica (não CRIAMOS uma parede aqui: a "parede de
 *  monitores" normalmente já É uma parede externa/interna que o prédio já
 *  tem — plantar os monitores encostados nela evita duplicar geometria de
 *  parede).
 *
 *  `origemX,origemY`: canto inferior-esquerdo (sudoeste) da sala, em
 *  metros. `larguraDisponivel`: quantos metros de parede (eixo X) estão
 *  disponíveis pra fileira de monitores. `numMonitores`: quantos monitores
 *  plantar nessa fileira (espaçados uniformemente dentro da largura
 *  disponível). `piso`: andar (padrão 0 — térreo, como pedido). Devolve
 *  `{ monitores, mesas, cadeiras, luminarias }` (arrays dos objetos
 *  criados) pra quem chamou poder ajustar/inspecionar depois, se quiser. */
function gerarSalaMonitoramento(map, deps, origemX, origemY, larguraDisponivel, numMonitores, piso = 0) {
  const monitores = [], mesas = [], cadeiras = [], luminarias = [];
  const ALTURA_PROFUNDIDADE_SALA = 6; // metros — "grande", como pedido ("o prédio será maior, ficará grande")
  const PASSO_MONITOR = larguraDisponivel / Math.max(1, numMonitores);
  const PROFUNDIDADE_MESA_A_PAREDE = 1.4; // distância da mesa/cadeira do operador até a parede de monitores

  for (let i = 0; i < numMonitores; i++) {
    const cx = origemX + PASSO_MONITOR * (i + 0.5);
    // Alterna monitor/monitor2 (2 modelos já existentes no catálogo) —
    // "uma parede de telas" com um pouco de variedade, não clones idênticos.
    const tipoMonitor = (i % 2 === 0) ? 'monitor' : 'monitor2';
    monitores.push(deps.addObject(map, cx, origemY + 0.05, tipoMonitor, piso, { angulo: Math.PI / 2, nome: `Monitor Sala Monitoramento ${i + 1}` }));
    // 1 mesa+cadeira de operador a cada 2 monitores (uma estação típica de
    // sala de controle costuma acompanhar 2-4 telas por operador, não 1:1).
    // [15/09/2026 UTC] ALTERADO — pedido verbatim: "Remova os objetos
    // 'Mesa' e 'Coluna / Pilar' do app [...] não há a preocupação de
    // quebrar mapas legados." O tipo 'mesa' não existe mais no catálogo —
    // só a cadeira de operador continua sendo plantada aqui.
    if (i % 2 === 0) {
      const mesaY = origemY + PROFUNDIDADE_MESA_A_PAREDE;
      cadeiras.push(deps.addObject(map, cx + PASSO_MONITOR / 2, mesaY + 0.7, 'cadeira', piso, { angulo: Math.PI / 2, nome: `Cadeira Operador ${Math.floor(i / 2) + 1}` }));
    }
  }

  // "Boa iluminação" (pedido verbatim) — fileira de luminárias de teto ao
  // longo da profundidade da sala, espaçadas ~3m (cobertura uniforme, sem
  // pontos escuros — importante numa sala onde operadores precisam
  // enxergar bem as telas e os próprios controles).
  const numLuminarias = Math.max(2, Math.round(ALTURA_PROFUNDIDADE_SALA / 3) + 1);
  for (let i = 0; i < numLuminarias; i++) {
    const ly = origemY + (ALTURA_PROFUNDIDADE_SALA / Math.max(1, numLuminarias - 1)) * i;
    luminarias.push(deps.addObject(map, origemX + larguraDisponivel / 2, ly, 'luminaria', piso, { nome: `Luminária Sala Monitoramento ${i + 1}` }));
  }

  return { monitores, mesas, cadeiras, luminarias };
}

/** [item B.1] Copa (café) — salinha pequena com pia, cafeteira, mesa
 *  pequena, algumas cadeiras e um armário. SIMPLIFICAÇÃO DELIBERADA:
 *  "pia"/"cafeteira" (ver js/engine3d-profiles.js, tipos NOVOS desta
 *  rodada) são formas básicas (caixa) — não modelos de catálogo de loja
 *  de cozinha detalhados; o objetivo é "reconhecível como copa", não
 *  fidelidade de móveis. `origemX,origemY`: canto sudoeste da salinha.
 *  Devolve `{ pia, cafeteira, mesa, cadeiras, armario }`. */
function gerarCopa(map, deps, origemX, origemY, piso = 0) {
  const pia = deps.addObject(map, origemX + 0.3, origemY + 0.25, 'pia', piso, { nome: 'Pia da Copa' });
  const cafeteira = deps.addObject(map, origemX + 0.9, origemY + 0.25, 'cafeteira', piso, { nome: 'Cafeteira' });
  // [15/09/2026 UTC] REMOVIDO — pedido verbatim: "Remova os objetos 'Mesa'
  // e 'Coluna / Pilar' do app." A copa fica só com pia/cafeteira/cadeiras/armário.
  const cadeiras = [
    deps.addObject(map, origemX + 1.3, origemY + 1.0, 'cadeira', piso, { angulo: Math.PI / 4, nome: 'Cadeira Copa 1' }),
    deps.addObject(map, origemX + 1.9, origemY + 1.0, 'cadeira', piso, { angulo: 3 * Math.PI / 4, nome: 'Cadeira Copa 2' }),
    deps.addObject(map, origemX + 1.3, origemY + 1.6, 'cadeira', piso, { angulo: -Math.PI / 4, nome: 'Cadeira Copa 3' }),
    deps.addObject(map, origemX + 1.9, origemY + 1.6, 'cadeira', piso, { angulo: -3 * Math.PI / 4, nome: 'Cadeira Copa 4' }),
  ];
  const armario = deps.addObject(map, origemX + 0.3, origemY + 2.2, 'armario', piso, { angulo: Math.PI / 2, nome: 'Armário da Copa' });
  return { pia, cafeteira, cadeiras, armario };
}

/** [item B.2] Banheiro (feminino/masculino) por andar — pedido verbatim:
 *  "banheiros feminino e masculino por andar." SIMPLIFICAÇÃO DELIBERADA
 *  (assumida por julgamento próprio, dentro da margem dada pelo pedido —
 *  "sem geometria de vaso sanitário detalhada nesta rodada [...] algo
 *  reconhecível como banheiro já cumpre o pedido, não precisa ser
 *  hiper-detalhado"): cada cabine é representada por uma DIVISÓRIA simples
 *  (parede interna curta, `deps.addWall` com altura reduzida ~1.8m — não
 *  vai até o teto, como divisória real de banheiro público) + um objeto
 *  "vaso-sanitario" dentro dela (tipo NOVO desta rodada, forma básica —
 *  ver js/engine3d-profiles.js). Pia(s) na entrada, fora das cabines.
 *  Banheiro masculino GANHA, além das cabines, uma fileira de "mictorio"
 *  (tipo NOVO, também forma básica) — banheiro feminino não. A ENTRADA de
 *  cada banheiro ganha uma placa de texto flutuante ("Feminino"/
 *  "Masculino", reaproveitando `deps.addText`/o sistema de Texto já
 *  existente no mapa) — sinalização visual pedida explicitamente:
 *  "Sinalize visualmente a porta/entrada de cada banheiro com um ícone ou
 *  placa."
 *  `genero`: 'feminino' | 'masculino'. Devolve `{ pias, cabines, vasos,
 *  mictorios, placa }`. */
function gerarBanheiro(map, deps, origemX, origemY, piso, genero) {
  const ehMasculino = genero === 'masculino';
  const ALTURA_DIVISORIA = 1.8; // metros — divisória de cabine (não vai até o teto, como no mundo real)
  const NUM_CABINES = 2;
  const LARGURA_CABINE = 0.9;

  // Pia(s) na entrada — 2 pias lado a lado, fora de qualquer cabine.
  const pias = [
    deps.addObject(map, origemX + 0.35, origemY + 0.25, 'pia', piso, { nome: `Pia Banheiro ${ehMasculino ? 'Masculino' : 'Feminino'} 1` }),
    deps.addObject(map, origemX + 1.0, origemY + 0.25, 'pia', piso, { nome: `Pia Banheiro ${ehMasculino ? 'Masculino' : 'Feminino'} 2` }),
  ];

  // Cabines — cada uma é 1 divisória (parede baixa) fechando 3 lados
  // (esquerda, direita, fundo) + o vaso sanitário dentro. Simplificação:
  // não modelamos a "porta da cabine" em si (bastaria um retângulo mais —
  // fora do escopo desta rodada; a divisória já sinaliza "isto é uma
  // cabine" o suficiente pro pedido).
  const cabines = [];
  const vasos = [];
  const baseCabineY = origemY + 1.2;
  for (let i = 0; i < NUM_CABINES; i++) {
    const cx0 = origemX + i * (LARGURA_CABINE + 0.1);
    const cx1 = cx0 + LARGURA_CABINE;
    const cy0 = baseCabineY;
    const cy1 = baseCabineY + 1.4;
    cabines.push(
      deps.addWall(map, cx0, cy0, cx0, cy1, piso, { height: ALTURA_DIVISORIA, nome: `Divisória Cabine ${i + 1} (esq.)` }),
      deps.addWall(map, cx1, cy0, cx1, cy1, piso, { height: ALTURA_DIVISORIA, nome: `Divisória Cabine ${i + 1} (dir.)` }),
      deps.addWall(map, cx0, cy1, cx1, cy1, piso, { height: ALTURA_DIVISORIA, nome: `Divisória Cabine ${i + 1} (fundo)` }),
    );
    vasos.push(deps.addObject(map, (cx0 + cx1) / 2, cy1 - 0.35, 'vaso-sanitario', piso, { angulo: -Math.PI / 2, nome: `Vaso Sanitário Cabine ${i + 1}` }));
  }

  // Mictórios — só no masculino, fileira numa parede lateral imaginária
  // (não criamos a parede física aqui — assume-se que o cômodo real já tem
  // uma parede lateral onde montar; ver mesma observação em
  // `gerarSalaMonitoramento` sobre não duplicar geometria de parede).
  const mictorios = [];
  if (ehMasculino) {
    const NUM_MICTORIOS = 2;
    for (let i = 0; i < NUM_MICTORIOS; i++) {
      mictorios.push(deps.addObject(map, origemX + 2.2, origemY + 0.3 + i * 0.55, 'mictorio', piso, { angulo: Math.PI, nome: `Mictório ${i + 1}` }));
    }
  }

  // Placa de sinalização da entrada — pedido verbatim: "Sinalize
  // visualmente a porta/entrada de cada banheiro com um ícone ou placa."
  const rotulo = ehMasculino ? '🚹 Masculino' : '🚺 Feminino';
  const placa = deps.addText(map, origemX + 0.6, origemY - 0.3, rotulo, piso, { nome: `Placa Banheiro ${ehMasculino ? 'Masculino' : 'Feminino'}`, tamanho: 18 });

  return { pias, cabines, vasos, mictorios, placa };
}

/** [TAREFA 2 do backlog 13/09/2026] Sala de disjuntores por andar —
 *  "Uma sala por andar com os disjuntores (devem funcionar de verdade)."
 *  Planta `numDisjuntores` quadros elétricos (`tipo:'disjuntor'`) numa
 *  fileira ao longo de uma parede imaginária (mesmo raciocínio de "não
 *  duplicar parede" de `gerarSalaMonitoramento`/`gerarCopa` — quem chama
 *  decide onde a sala física de verdade fica, este gerador só planta os
 *  quadros). Cada disjuntor sai com `raioControle=15` (metros — "sala
 *  inteira", ver disjuntor.model.js) por padrão, editável depois por
 *  instância no painel do objeto. `x,y`: canto sudoeste da fileira.
 *  Devolve `{ disjuntores, placa }`. */
function gerarSalaDisjuntores(map, deps, x, y, piso, numDisjuntores = 8) {
  const ESPACAMENTO = 0.65; // metros entre quadros — cabem lado a lado numa parede curta
  const disjuntores = [];
  for (let i = 0; i < numDisjuntores; i++) {
    disjuntores.push(deps.addObject(map, x + i * ESPACAMENTO, y, 'disjuntor', piso, {
      angulo: Math.PI / 2,
      raioControle: 15,
      nome: `Disjuntor ${i + 1} (Piso ${piso})`,
    }));
  }
  const placa = deps.addText(map, x, y - 0.4, '⚡ Sala de Disjuntores', piso, { nome: `Placa Sala de Disjuntores (Piso ${piso})`, tamanho: 16 });
  return { disjuntores, placa };
}

/** [TAREFA 3 do backlog 13/09/2026] Casas dos robôs — "Eles devem ter
 *  casas de verdade em algum lugar mais afastado do mapa. Alguns 'moram
 *  perto', outro moram mais distante." Espalha `quantidade` casas
 *  (`tipo:'casa-robo'` + `tipo:'casa-robo-telhado'`, 2 objetos por casa —
 *  ver js/engine3d-profiles.js) ao redor de `(centroOrigemX,
 *  centroOrigemY)` (tipicamente o centro do prédio), METADE a distância
 *  "perto" (30-80m) e METADE "longe" (150-400m) do centro, cada uma num
 *  ÂNGULO aleatório (0-360°) — distribuição simples pedida
 *  explicitamente ("distribuição simples"), sem tentar evitar sobreposição
 *  entre casas nem desviar de obstáculos do mapa (fora de escopo: um
 *  posicionamento "inteligente" evitando colisão exigiria conhecer a
 *  geometria do prédio/terreno inteiro, que este gerador genérico não
 *  recebe). Devolve `{ corpos, telhados }` (arrays paralelos, mesmo
 *  índice = mesma casa). `piso` sempre 0 (térreo/nível do chão — casas
 *  ficam fora do prédio, não empilhadas em andares).
 *
 * PRÓXIMA ETAPA (documentada, NÃO implementada nesta rodada): esta
 * função só planta a EXISTÊNCIA FÍSICA das casas. A funcionalidade maior
 * do backlog ("no início/fim do expediente os robôs vão pra casa/vêm de
 * casa, estacionam o carro nas vagas") exigiria integrar com um relógio
 * de tempo real do prédio (ainda não implementado neste projeto —
 * nenhum "relógio de simulação" com horário de expediente foi achado
 * nesta rodada, só o `relogio` decorativo do catálogo) + um sistema de
 * trajeto casa↔prédio pros robôs (reaproveitando o sistema de waypoints
 * já existente, ver _exemplo-script-robo-trajeto.txt, só que disparado
 * por HORÁRIO em vez de rodar em loop fixo). Fica pra uma rodada futura
 * dedicada a isso. */
function gerarCasasRobos(map, deps, centroOrigemX, centroOrigemY, quantidade = 6) {
  const corpos = [], telhados = [];
  const metadePerto = Math.ceil(quantidade / 2);
  for (let i = 0; i < quantidade; i++) {
    const perto = i < metadePerto;
    const distancia = perto
      ? 30 + Math.random() * 50   // 30-80m — "moram perto"
      : 150 + Math.random() * 250; // 150-400m — "moram mais distante"
    const anguloGraus = Math.random() * 360;
    const rad = anguloGraus * Math.PI / 180;
    const cx = centroOrigemX + Math.cos(rad) * distancia;
    const cy = centroOrigemY + Math.sin(rad) * distancia;
    const anguloCasa = rad + Math.PI; // casa "de frente" pro centro do prédio (aproximação simples, não perfeita)
    const rotulo = perto ? 'perto' : 'longe';
    corpos.push(deps.addObject(map, cx, cy, 'casa-robo', 0, { angulo: anguloCasa, nome: `Casa de Robô ${i + 1} (${rotulo}, ~${Math.round(distancia)}m)` }));
    telhados.push(deps.addObject(map, cx, cy, 'casa-robo-telhado', 0, { angulo: anguloCasa, nome: `Telhado Casa de Robô ${i + 1}` }));
  }
  return { corpos, telhados };
}

/** [TAREFA 4 do backlog 13/09/2026] Pátio de estacionamento — planta
 *  `numVagas` marcações (`tipo:'vaga-estacionamento'`) em fileira, todas
 *  com o mesmo `orientacao` (radianos — mesmo sistema de `obj.angulo` do
 *  resto do app). `x,y`: canto da primeira vaga. Vagas de 2.5x5m (padrão
 *  comum de vaga de carro), espaçadas 2.7m entre centros (0.2m de
 *  "pintura" entre uma vaga e outra). Devolve o array de vagas. */
function gerarPatioEstacionamento(map, deps, x, y, numVagas = 10, orientacao = 0) {
  const ESPACAMENTO = 2.7;
  const vagas = [];
  const perpX = -Math.sin(orientacao), perpY = Math.cos(orientacao);
  for (let i = 0; i < numVagas; i++) {
    vagas.push(deps.addObject(map, x + perpX * ESPACAMENTO * i, y + perpY * ESPACAMENTO * i, 'vaga-estacionamento', 0, {
      angulo: orientacao,
      nome: `Vaga ${i + 1}`,
    }));
  }
  return vagas;
}

/** [TAREFA 4 do backlog 13/09/2026] Cancela de estacionamento — planta o
 *  POSTE fixo (`cancela-poste`) e a HASTE articulada (`cancela`, ver
 *  cancela.model.js/_exemplo-script-cancela.txt pra a animação) juntos,
 *  a haste saindo do poste na direção `angulo` (radianos — 0 = haste
 *  alinhada ao eixo X). Devolve `{ poste, haste }`. NOTA: a haste sai com
 *  Script/EventTrigger vazios — quem for usar a cancela funcional
 *  precisa adicionar o componente Script (`_exemplo-script-cancela.txt`)
 *  manualmente (mesma decisão de robôs/elevadores: geração automática
 *  planta o OBJETO, o COMPORTAMENTO por Script fica pro usuário colar,
 *  já que a lista de componentes de um objeto não é um dado geométrico
 *  simples pra este gerador injetar às cegas). */
function gerarCancela(map, deps, x, y, angulo = 0) {
  const poste = deps.addObject(map, x, y, 'cancela-poste', 0, { angulo, nome: 'Poste da Cancela' });
  // A haste nasce ABAIXADA (alinhada com `angulo`, mesma orientação do
  // poste) — encostada no poste, como uma cancela de verdade em repouso.
  const cos = Math.cos(angulo), sin = Math.sin(angulo);
  const hasteX = x + cos * 1.1, hasteY = y + sin * 1.1; // desloca a haste pra "sair" do poste, não ficar sobreposta
  const haste = deps.addObject(map, hasteX, hasteY, 'cancela', 0, { angulo, nome: 'Haste da Cancela' });
  return { poste, haste };
}

/** [TAREFA 4 do backlog 13/09/2026] Cerca — segmento(s) de cerca simples,
 *  reaproveitando 100% a infraestrutura de PAREDE já testada (pedido
 *  verbatim: "reaproveitar parede baixa com uma textura/cor de grade é
 *  mais simples e são reaproveita 100% infraestrutura já testada" —
 *  DECISÃO TOMADA: reaproveitar parede, não criar um objeto de catálogo
 *  novo). `pontos`: array de `{x,y}` (mínimo 2) formando o PERÍMETRO —
 *  gera um segmento de parede baixa entre cada par de pontos
 *  CONSECUTIVOS (não fecha o polígono sozinho — repita o primeiro ponto
 *  no fim de `pontos` se quiser um perímetro fechado). Altura baixa
 *  (1.2m, bem menor que uma parede comum do prédio) e `material:'cerca'`
 *  (campo NOVO em `extra`, só uma marcação de dado — não muda a
 *  RENDERIZAÇÃO da parede nesta rodada: o motor 3D não lê `material` pra
 *  trocar textura ainda, ver LIMITAÇÃO abaixo). Devolve o array de
 *  segmentos de parede criados.
 *
 * LIMITAÇÃO CONHECIDA: sem textura "de grade"/vazada de verdade — é uma
 * parede baixa sólida e opaca, na cor padrão de parede (não foi
 * encontrado, nesta investigação, nenhum sistema de textura/material
 * customizável por parede em js/mapping.js/js/engine3d.js pra reaproveitar
 * — implementar textura vazada de verdade exigiria mexer em
 * `setScene`/os builders de parede do motor 3D, arriscado sem navegador
 * pra testar ao vivo nesta sessão; fica pra uma rodada futura dedicada a
 * texturas). O campo `material:'cerca'` já fica salvo no dado, pronto
 * pra quando essa renderização existir. */
function gerarCerca(map, deps, pontos) {
  const ALTURA_CERCA = 1.2;
  const segmentos = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i], b = pontos[i + 1];
    segmentos.push(deps.addWall(map, a.x, a.y, b.x, b.y, 0, { height: ALTURA_CERCA, material: 'cerca', nome: `Cerca ${i + 1}` }));
  }
  return segmentos;
}

const API = {
  gerarSalaMonitoramento, gerarCopa, gerarBanheiro,
  gerarSalaDisjuntores, gerarCasasRobos,
  gerarPatioEstacionamento, gerarCancela, gerarCerca,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API; // Node (ex.: dados_gerados/gerar_predio_v2.js via require())
} else if (typeof window !== 'undefined') {
  window.GeradoresSalas = API; // navegador (<script> clássico, mesmo padrão de engine3d-profiles.js)
}
