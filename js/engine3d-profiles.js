/**
 * engine3d-profiles.js — "Receitas" dos modelos 3D dos objetos padrão do
 * mapa (mesa, cadeira, coluna, luminária, extintor, etc.): que FORMA básica
 * usar (caixa/cilindro/cone), as dimensões/proporções e a cor de cada tipo.
 * Extraído de engine3d.js (pedido do usuário, rodada 51: "Coloque em um
 * arquivo separado do restante do código as 'receitas' para montar os
 * modelos 3D dos objetos") — antes vivia misturado com o resto do motor 3D
 * (câmera, física, raycasting, malhas de parede/porta/janela); agora é só
 * dados + a matemática mais simples de "quais dimensões esse tipo tem",
 * sem nada de Three.js/WebGL/estado de cena.
 *
 * Carregado como `<script>` clássico ANTES de engine3d.js (ver
 * index.html/sw.js APP_SHELL) — `const`/`function` de topo de script NÃO
 * viram propriedade de `window` sozinhos, mas em scripts clássicos (sem
 * type="module") todos compartilham o MESMO escopo léxico de nível
 * superior na ordem em que são carregados, então `OBJECT3D_PROFILES` etc.
 * continuam visíveis dentro de engine3d.js como identificador solto, sem
 * precisar escrever `window.OBJECT3D_PROFILES` ali (mesmo comportamento de
 * antes, quando tudo vivia no mesmo arquivo). As atribuições a `window`
 * abaixo continuam existindo porque OUTROS arquivos (mapping.js/
 * mapview.js/view3d.js) já liam esses valores assim.
 *
 * NÃO fazem parte deste arquivo (ficaram de propósito em engine3d.js, por
 * dependerem de THREE.js/estado da cena — não são só "receita", são a
 * MONTAGEM de verdade da malha): `_buildMesaMesh`/`_buildLuminariaMesh`/
 * `_buildImagemMesh` (métodos de Engine3D) e toda a construção de
 * parede/porta/janela (closures dentro de `setScene`, muito entrelaçadas
 * com dezenas de variáveis locais — extrair aquilo com segurança exigiria
 * uma refatoração bem maior, de risco real sem um navegador pra testar ao
 * vivo nesta sessão).
 */

// Ângulo de OBJETOS do mapa (retângulo/polígono/mesa/pilar/luminária —
// `obj.angulo`) -> mesh.rotation.y do Three.js. Ver o comentário grande
// original (agora aqui): no 2D (Map2DRenderer._drawFormaShape) o objeto é
// desenhado com `ctx.translate(sx,sy); ctx.rotate(obj.angulo)` — a LARGURA
// (obj.largura) fica ao longo do eixo local X (antes de girar) e a
// PROFUNDIDADE (obj.profundidade) ao longo do eixo local Y; esses dois
// eixos batem exatamente com os eixos X e Z da BoxGeometry usada no 3D
// (perfil.w -> X, perfil.d -> Z). Igualando a rotação dos DOIS eixos entre
// os dois sistemas dá φ = -θ: mesh.rotation.y é simplesmente o NEGATIVO do
// ângulo do 2D.
function objAnguloToRotY(angulo) { return -(angulo || 0); }

// ---------- Perfis 3D simples para os "objetos" do mapa (mapview.js) ----------
// Não é uma malha 3D fiel por tipo (seriam ~30 modelos) — é uma forma
// básica (caixa/cilindro/cone) com dimensões/cor plausíveis por categoria,
// suficiente pra "ver que ali tem uma mesa/coluna/planta..." andando pelo
// ambiente em 3D. `y0` é a altura (m) da base da forma em relação ao chão
// daquele andar (0 = apoiado no chão; usado por objetos de parede/teto).
const OBJECT3D_PROFILES = {
  // [15/09/2026 UTC] ALTERADO — pedido verbatim (RODADA "refatoração de
  // Mesa/Pilar"): "O objeto mesa deve ter 1,2m x 0,6m de tampa e 0,74m de
  // altura (do chão até a parte de cima da tampa)." `h`/`y0` antigos (y0:
  // 0.72 + h: 0.05 = 0.77m) somavam 0.77m, não 0.74m — trocado pra
  // convenção 'retangulo' (y0:0, h já é a altura TOTAL do chão até o topo
  // do tampo, ver `_makeMesaMeshes`, engine3d.js). "Mesa" voltou a ser um
  // objeto comum de catálogo (sem o mecanismo de "forma com gizmo"
  // eliminado nesta mesma rodada — pedido verbatim: "Agora não tem mais o
  // gizmo integrado, é só um objeto comum") — este perfil (e
  // `_buildMesaMesh`, já existente, sem nenhuma mudança nela) é a ÚNICA
  // fonte de tamanho agora, não mais `mapview.js _MESA_FORMA_DEF` (removida).
  mesa: { shape: 'box', w: 1.2, d: 0.6, h: 0.74, y0: 0, color: 0x8a6a4a },
  // [15/09/2026 UTC] NOVO — pedido verbatim: "faça dois novos objetos:
  // 'Mesa' e 'Pilar' [...] O objeto 'Pilar' deve ter a altura que define a
  // distância entre um andar e outro e dimensões de 120cmx60cm [...] é só
  // um objeto comum." `h:2.8` aqui é só o valor de FÁBRICA/fallback (usado
  // pro ghost de posicionamento e pelo cálculo de footprint/colisão, ver
  // `computeObjectFootprint` abaixo) — a malha de VERDADE (`_buildPilarMesh`,
  // engine3d.js) sempre usa `mapData.alturaPiso` (a distância real entre
  // andares configurada no mapa, padrão 2.8m — MESMA fonte que toda parede/
  // escada/objeto empilhado por andar já usa, ver `baseY = piso *
  // mapData.alturaPiso` espalhado por engine3d.js/view3d.js), nunca um
  // valor fixo — então um pilar sempre vai do chão até o teto do andar
  // onde foi colocado, não importa o pé-direito configurado.
  pilar: { shape: 'box', w: 1.2, d: 0.6, h: 2.8, y0: 0, color: 0x9aa4b2 },
  // [15/09/2026 UTC] ALTERADO — pedido verbatim: "Faça um modelo 3D
  // diferente para a cadeira (substituindo-o), faça uma 'cadeira de
  // verdade' com pernas e encosto. Não uma caixa genérica como é
  // atualmente." Antes: `h:0.45, y0:0.42` (convenção antiga, igual a mesa
  // tinha — `h` era só a "caixa" do assento+encosto elevada, sem pernas de
  // verdade desenhadas, só um bloco). Convertido pra MESMA convenção que
  // `mesa`/`pilar` já usam (`y0:0`, `h` = altura TOTAL do chão até o topo
  // do encosto, ~0.9m — assento de cadeira real fica a ~0.45m do chão,
  // encosto sobe mais ~0.45m) — ver `_buildCadeiraMesh` (engine3d.js), novo
  // builder dedicado com assento fino + 4 pernas finas recuadas das quinas
  // + encosto vertical na borda de trás, mesmo padrão de `_buildMesaMesh`.
  cadeira: { shape: 'box', w: 0.45, d: 0.45, h: 0.9, y0: 0, color: 0x5a5f6b },
  poltrona: { shape: 'box', w: 0.75, d: 0.75, h: 0.5, y0: 0.4, color: 0x6a5a4a },
  armario: { shape: 'box', w: 0.8, d: 0.45, h: 1.9, y0: 0, color: 0x7c8494 },
  arquivo: { shape: 'box', w: 0.45, d: 0.5, h: 1.3, y0: 0, color: 0x7c8494 },
  estante: { shape: 'box', w: 0.9, d: 0.35, h: 1.8, y0: 0, color: 0x8a7455 },
  quadro: { shape: 'box', w: 1.2, d: 0.05, h: 0.8, y0: 1.1, color: 0xe8ecf2 },
  // [15/09/2026] NOVO — "quadro-parede": item decorativo distinto do
  // `quadro` acima (que é um QUADRO BRANCO/lousa, cor clara — usado pra
  // escrever, ver o resto do catálogo) — este é um QUADRO/PINTURA de
  // parede, decorativo. Tipo NOVO e INDEPENDENTE (não substitui `quadro`),
  // mesmo padrão de gabinete/gabinete2 já usado no catálogo. Passa pelo
  // MESMO ramo genérico de objeto de parede (nenhum builder dedicado
  // necessário — só um box fino, igual `quadro`/`interruptor`/
  // `disjuntor`), então herda o MESMO comportamento de posicionamento
  // deles (usuário encosta na parede no editor 2D, sem offset automático —
  // ver comentário grande em `Engine3D._buildRelogioMesh`, engine3d.js,
  // pra explicação completa de por que não existe um "offset de parede"
  // separado neste motor).
  // SIMPLIFICAÇÃO DELIBERADA: uma moldura+tela de verdade (2 cores, moldura
  // marrom-escura ao redor de uma "pintura" central) exigiria um objeto
  // COMPOSTO (2+ malhas, como mesa/luminária/poste têm) — fora de escopo
  // desta rodada, que só pediu "um quadro na parede". Em vez disso, uma
  // ÚNICA cor representativa: azul-petróleo escuro (`0x1f3b4d`), lembrando
  // uma pintura abstrata escura emoldurada — mais claramente "um quadro"
  // do que a cor clara do `quadro`/lousa (0xe8ecf2) já usada. Dimensões
  // ~40x60cm (tamanho comum de quadro decorativo), 3cm de espessura
  // (`d`), y0:1.4 (altura de centro de quadro na parede, tipicamente mais
  // alto que interruptor/disjuntor — ~1.1m a ~1.7m de centro pra um quadro
  // de 60cm de altura).
  'quadro-parede': { shape: 'box', w: 0.4, d: 0.03, h: 0.6, y0: 1.4, color: 0x1f3b4d },
  // [15/09/2026] NOVO — "quadro-mesa": porta-retrato pequeno DE SUPERFÍCIE
  // (mesa/estante — sem NENHUMA lógica de parede, diferente do
  // `quadro-parede` acima: `y0:0`, mesmo raciocínio de objetos empilháveis
  // de sempre — Mapping.addObject/_findTopObjectAt decide a altura real
  // conforme o usuário empilha em cima de uma mesa/estante). Moldura clara/
  // dourada (`0xd4af6a`) — outra simplificação de 1 cor só (ver
  // `quadro-parede` acima pro mesmo raciocínio: um porta-retrato de
  // verdade teria moldura+foto em 2 cores, fora de escopo). Dimensões
  // ~10x15cm (tamanho comum de porta-retrato de mesa pequeno), 3cm de
  // espessura.
  'quadro-mesa': { shape: 'box', w: 0.1, d: 0.03, h: 0.15, y0: 0, color: 0xd4af6a },
  // [13/09/2026] NOVO — "carro dirigível" (pedido verbatim: "Faça um
  // carro, que é possível entrar nele e sair andando [...] considerando a
  // inércia de movimento [...] Deve ter rodas, vidros e um formato de
  // carro de verdade"). SÓ a "receita" de tamanho/cor entra aqui (mesmo
  // espírito de mesa/luminária/poste/escada/teto-gesso/quadro-mesa acima —
  // todos são builders BESPOKE de múltiplas malhas, então também têm
  // checagem defensiva de shape:'box' em `_buildOneObjectMesh`,
  // engine3d.js, e um método `_buildCarroMesh` dedicado ali, não o ramo
  // genérico de caixa única). `w`/`d`/`h` aqui descrevem a CARROCERIA
  // (largura x comprimento x altura da base, sem contar cabine/teto nem
  // rodas, que `_buildCarroMesh` empilha por cima/embaixo) — usado também
  // como caixa delimitadora aproximada pro pick/seleção/footprint 2D (ver
  // `computeObjectFootprint` abaixo). Cor default um vermelho "carro de
  // brinquedo" — sobrescrita por instância via `obj.cor` (mesmo campo hex
  // já usado por retângulo/polígono), lido em `_buildCarroMesh`.
  carro: { shape: 'box', w: 1.75, d: 4.3, h: 1.4, y0: 0, color: 0xb33a3a },
  geladeira: { shape: 'box', w: 0.6, d: 0.6, h: 1.7, y0: 0, color: 0xd7dee6 },
  'ar-condicionado': { shape: 'box', w: 0.8, d: 0.2, h: 0.3, y0: 2.1, color: 0xd7dee6 },
  gabinete: { shape: 'box', w: 0.2, d: 0.45, h: 0.42, y0: 0.3, color: 0x2c313a },
  monitor: { shape: 'box', w: 0.5, d: 0.08, h: 0.35, y0: 0.75, color: 0x1c1f26 },
  notebook: { shape: 'box', w: 0.34, d: 0.24, h: 0.02, y0: 0.75, color: 0x2c313a },
  impressora: { shape: 'box', w: 0.45, d: 0.4, h: 0.3, y0: 0.75, color: 0xd7dee6 },
  switch: { shape: 'box', w: 0.3, d: 0.15, h: 0.05, y0: 1.6, color: 0x1c1f26 },
  estabilizador: { shape: 'box', w: 0.2, d: 0.35, h: 0.15, y0: 0.05, color: 0x2c313a },
  teclado: { shape: 'box', w: 0.4, d: 0.15, h: 0.03, y0: 0.75, color: 0x2c313a },
  mouse: { shape: 'box', w: 0.1, d: 0.06, h: 0.03, y0: 0.75, color: 0x2c313a },
  telefone: { shape: 'box', w: 0.18, d: 0.18, h: 0.12, y0: 0.75, color: 0x2c313a },
  grampeador: { shape: 'box', w: 0.16, d: 0.05, h: 0.05, y0: 0.75, color: 0x3a4048 },
  'caixa-som': { shape: 'box', w: 0.18, d: 0.18, h: 0.35, y0: 0, color: 0x2c313a },
  calculadora: { shape: 'box', w: 0.12, d: 0.02, h: 0.18, y0: 0.75, color: 0x2c313a },
  ventilador: { shape: 'cylinder', r: 0.25, h: 0.06, y0: 1.9, color: 0xd7dee6 },
  extintor: { shape: 'cylinder', r: 0.09, h: 0.55, y0: 0, color: 0xc0392b },
  bebedouro: { shape: 'cylinder', r: 0.18, h: 1.0, y0: 0, color: 0xd7dee6 },
  lixeira: { shape: 'cylinder', r: 0.16, h: 0.5, y0: 0, color: 0x556070 },
  coluna: { shape: 'cylinder', r: 0.18, h: 2.6, y0: 0, color: 0x9aa4b2 },
  // [15/09/2026 UTC] ALTERADO — pedido verbatim: "Faça o mesmo para o
  // vaso." (mesmo tratamento dado à cadeira acima: um modelo de verdade em
  // vez de uma forma única genérica). `r`/`h` continuam com o MESMO
  // significado de antes (raio/altura total da "caixa" do objeto, usados
  // pelo ghost de colocação e por `computeObjectFootprint`) — a malha de
  // VERDADE (`_buildPlantaMesh`, engine3d.js) agora desenha um vaso
  // (tronco de cone, mais largo em cima) de terracota + a folhagem (cone
  // verde) sentada em CIMA do vaso, em vez de um cone verde solto saindo
  // direto do chão.
  planta: { shape: 'cone', r: 0.3, h: 0.7, y0: 0, color: 0x3f7d43 },
  porta: { shape: 'box', w: 0.9, d: 0.05, h: 2.05, y0: 0, color: 0x8a6a4a },
  janela: { shape: 'box', w: 1.0, d: 0.05, h: 1.1, y0: 0.9, color: 0xa9c9e6 },
  // Luminária de teto, 2 lâmpadas fluorescentes compridas (pedido do
  // usuário) — y0:0 aqui de propósito: a elevação padrão de 3m do chão NÃO
  // vem deste perfil (que só define w/d/h/cor pro corpo da peça), e sim de
  // `obj.elevacao` (ver Mapping.addObject, que aplica os 3m por padrão, e
  // view3d.js _placeWithBuildTool, que usa a mira/raycastSurface) — um único
  // lugar decide a altura, em vez de duas fontes que pudessem divergir. Ver
  // `_buildLuminariaMesh` em engine3d.js pro corpo de verdade (2 tubos +
  // folha metálica + caixas nas pontas) em vez desta caixa genérica.
  luminaria: { shape: 'box', w: 1.2, d: 0.16, h: 0.09, y0: 0, color: 0xf2f3f5 },
  'caixa-generica': { shape: 'box', w: 0.4, d: 0.4, h: 0.4, y0: 0, color: 0x8a92a3 },
  // [13/09/2026] NOVO — "Piso" como um NOVO TIPO DE OBJETO (não um campo
  // numérico solto em cada entidade — abordagem descartada; ver comentário
  // GRANDE em js/mapping.js, funções `getPisos`/`getAndarDaEntidade`, pra
  // decisão de design completa). Reaproveita 100% o mecanismo já existente
  // de "objeto genérico retangular" (Mapping.defaultShapeForTipo, acima) —
  // registrar aqui já basta pra ele nascer com uma forma/cor padrão tanto
  // no 2D (Map2DRenderer desenha `forma:'retangulo'` normalmente) quanto no
  // 3D (engine3d.js usa o mesmo caminho de objeto retangular de sempre) —
  // ZERO código novo de desenho precisou ser escrito pra isso.
  // Dimensões: uma LAJE grande (10x10m por padrão — o usuário redimensiona
  // como qualquer outro objeto retangular, via os campos largura/
  // profundidade de sempre) e FINA (0.2m de espessura) — cor concreto
  // (#b0b0b0, cinza-claro) pra ficar visualmente óbvio que é uma "fatia" de
  // piso, não um móvel. O usuário planta um objeto "Piso" por andar, na
  // elevação (`obj.elevacao`) correspondente à base daquele andar — ver
  // `getAndarDaEntidade` em mapping.js pra como o "andar" de QUALQUER outra
  // entidade é DERIVADO da posição dela em relação a estes objetos, ao
  // invés de ser um campo manual.
  piso: { shape: 'box', w: 10, d: 10, h: 0.2, y0: 0, color: 0xb0b0b0 },
  // [13/09/2026] NOVO — "Teto modular" e "Teto de gesso", pedido do usuário:
  // "chão lajotado, teto modular (escritórios), teto de gesso com rodelas
  // de acesso (gabinete/chefia)". Mesmo raciocínio de design do "Piso"
  // acima (reaproveita o mecanismo de objeto genérico retangular, ZERO
  // desenho novo no 2D) — a única diferença de verdade entre os três é
  // COR/TEXTURA (ver `_buildOneObjectMesh`/`_tetoTexture` em engine3d.js,
  // que troca a cor sólida do `MeshLambertMaterial` por uma
  // `THREE.CanvasTexture` procedural quando o tipo é `teto-modular` ou o
  // piso tem `obj.acabamento === 'lajota'`) e a ORIENTAÇÃO vertical: o
  // "Piso" é uma laje no CHÃO do andar (`obj.elevacao` = base do andar),
  // enquanto os dois tetos ficam no TOPO da sala — o usuário posiciona a
  // `obj.elevacao` na altura do teto (ex.: pé-direito de 2.8m), igual
  // qualquer outro objeto; não há inversão automática de posição (o app
  // não sabe "a altura do teto daquela sala" sozinho), só a CONVENÇÃO de uso
  // (documentada aqui e no rótulo do tipo, `_labelForObjectType` em
  // mapping.js) de plantar este objeto encostado no teto, não no chão.
  // Dimensões iguais ao "Piso" (10x10m, redimensionável) e mesma espessura
  // fina (0.2m) — cor branco-gelo (mais clara que o cinza-concreto do
  // piso) pra parecer forro, não laje estrutural.
  'teto-modular': { shape: 'box', w: 10, d: 10, h: 0.2, y0: 0, color: 0xf3f4f6 },
  // Teto de gesso: liso, branco puro, SEM textura de grade (ao contrário do
  // modular) — as "rodelas de acesso" (pequenos discos cinza-claro,
  // simulando as tampas circulares de acesso a fiação/dutos comuns em forro
  // de gesso de salas de gabinete/chefia) são meshes-FILHOS deste objeto,
  // criados em `_buildTetoGessoMesh` (engine3d.js), não fazem parte deste
  // perfil (que só descreve a PLACA base).
  'teto-gesso': { shape: 'box', w: 10, d: 10, h: 0.2, y0: 0, color: 0xffffff },
  // Relógio (pedido do usuário, 26/08/2026) — disco fino (mostrador), do
  // tamanho de um relógio de parede pequeno/de mesa. y0:0 de propósito
  // (mesmo raciocínio da luminária, acima): sem elevação própria aqui — se o
  // usuário colocar em cima de outro objeto (mesa, estante) ou encostado na
  // lateral dele, quem decide a altura é o empilhamento automático de
  // sempre (ver Mapping.addObject/_findTopObjectAt), igual a qualquer outro
  // objeto — não é exclusividade do relógio.
  // [15/09/2026] CORRIGIDO — bug confirmado pelo usuário: "os relógios...
  // ficam deitados... é só girar o relógio para que fique na parede".
  // Este `perfil` aqui (r/h/y0/color) não muda — o `shape:'cylinder'` cru
  // sempre foi só o suficiente pro footprint 2D circular certo (mesmo
  // espírito do poste/robô, ver comentários deles) — o que mudou foi a
  // MONTAGEM de verdade: `relogio` agora tem um builder dedicado
  // (`Engine3D._buildRelogioMesh`, engine3d.js, chamado no lugar do ramo
  // genérico de objeto — mesmo padrão de mesa/luminária/poste/escada) que
  // roda o disco 90° pra ficar DE PÉ (mostrador virado pra fora, não pro
  // teto) antes de aplicar a rotação de sempre (`obj.angulo`), e monta 3
  // ponteiros de verdade (hora/minuto/segundo) — ver lá pro porquê da
  // ordem das rotações e a fórmula dos ponteiros. Ponteiros agora são
  // animados TAMBÉM no 3D (não só no mapa 2D, mapview.js Map2DRenderer.
  // _drawFormaShape) — a partir de `window.RelogioMundo.getHoraAtual()`
  // (hora do MUNDO, não do aparelho do usuário — js/relogio-mundo.js),
  // via `Engine3D._updateRelogiosParede`, chamado todo quadro por
  // view3d.js, mesmo padrão de `_updateCamerasLive`/`_updateDoorAnimations`.
  relogio: { shape: 'cylinder', r: 0.15, h: 0.04, y0: 0, color: 0xf2ede0 },
  // NOVO (01/09/2026), item #11 do pedido de 12 itens, verbatim: "Faça um
  // novo objeto 3D, o poste de iluminação pública." `shape:'cylinder'` aqui
  // é só o suficiente pra dar o footprint 2D circular certo (ver
  // Mapping.defaultShapeForTipo) — a haste/braço/luminária de verdade (não
  // um cilindro sólido do chão até o topo) vêm de `_buildPosteMesh` em
  // engine3d.js, mesmo padrão de mesa/luminária acima. `r`/`h` aqui = raio/
  // altura da HASTE (não da luminária na ponta do braço). y0:0 — apoiado no
  // chão, diferente da luminária de teto (que soma 3m de elevação padrão em
  // Mapping.addObject): um poste é sempre externo/no nível do chão, nunca
  // colocado em cima de outro objeto.
  poste: { shape: 'cylinder', r: 0.07, h: 4.5, y0: 0, color: 0x494e57 },
  // NOVO (01/09/2026), item GRANDE #9 do pedido de 12 itens, verbatim:
  // "Escadas e outros andares também [devem poder ser representados]" — 34º
  // tipo do catálogo (o 1º novo desde 'poste'). Este profile é só o valor
  // INICIAL usado por `Mapping.defaultShapeForTipo`/`applyDefaultShapeToObject`
  // na hora de CRIAR o objeto no mapa 2D (vira `obj.largura`/`obj.profundidade`/
  // `obj.altura` editáveis, ver mapview.js `_openObjectPanel`) — o 3D de
  // verdade (degrau a degrau) é gerado à parte, ver `Engine3D._buildEscadaMesh`
  // em engine3d.js.
  // ATUALIZADO (01/09/2026) — pedido verbatim (arquivo "prompts para o
  // Claude.txt"): "O objeto escada no 3D deve ter a sua representação
  // equivalente. É possível escolher a quantidade de degraus, por padrão é
  // 11. O tamanho dos degraus se ajusta conforme o tamanho (medida que é
  // observada no 2D, profundidade) e quantidade de degraus da escada e
  // largura (padrão 130cm) também configuráveis. A altura é de 2 metros
  // (percebido, apenas no 3D)." `w` (largura) mudou de 1.0 pra 1.3 (130cm,
  // valor pedido). `h` mudou de 0.2 pra 2.0 só pra o campo "Altura (m)" do
  // painel 2D já nascer mostrando o valor que será usado de verdade no 3D
  // (a altura real do lance é SEMPRE fixa em 2m no 3D, mesmo que o campo
  // "Altura" seja editado depois — ver comentário grande em
  // `_buildEscadaMesh`); `d` (profundidade, 3.0) continua sendo o tamanho
  // total do lance, do qual cada um dos degraus (`obj.escadaDegraus`, campo
  // NOVO, painel de objeto) ocupa uma fatia igual.
  escada: { shape: 'box', w: 1.3, d: 3.0, h: 2.0, y0: 0, color: 0x8a92a3 },
  // [14/09/2026] NOVO — "Interruptor de luz": caixinha pequena de parede
  // (mesma altura de tomada/interruptor real, ~1.1m do chão), acionada por
  // clique (ver assets/modelos/interruptor.model.js) — acende/apaga as
  // luminárias dentro do `raioControle` dela. `y0:1.1` (não 0): igual ao
  // `switch`/`gabinete` acima, é um objeto de PAREDE, não de chão — o
  // usuário ainda pode reposicionar livremente (empilhamento/elevação
  // manual de sempre), isto só é a altura PADRÃO ao criar.
  interruptor: { shape: 'box', w: 0.09, d: 0.04, h: 0.14, y0: 1.1, color: 0xe8ecf2 },
  // [13/09/2026] NOVO — "variantes 2" de Gabinete/Monitor/Teclado/Mouse,
  // pedido verbatim: "Faça novos modelos para o Gabinete, Monitor, Teclado
  // e Mouse [...] Faça um jeito de acrescentar esses novos modelos como
  // objetos independentes. [...] fica, por exemplo, o Gabinete que já tem
  // (gabinete.model.js) e o novo 'gabinete2.model.js'." Cada um é um TIPO
  // NOVO e INDEPENDENTE do catálogo (não substitui gabinete/monitor/
  // teclado/mouse — os dois aparecem lado a lado em Ferramentas→Objetos),
  // usando o MESMO branch genérico acima (nenhum builder bespoke
  // necessário — ver `else { perfil = OBJECT3D_PROFILES[obj.tipo] || ...}`
  // em engine3d.js, confirmado que gabinete/monitor/teclado/mouse não têm
  // nenhum `if (obj.tipo === '...')` dedicado tipo mesa/luminária/poste/
  // escada). Proporções escolhidas pra ter uma diferença VISUAL real da
  // variante 1, não um clone idêntico:
  //  - gabinete2 ("Torre"): variante 1 é uma caixa baixa e larga (deitada,
  //    tipo desktop slim); esta é uma TORRE vertical — mais estreita e bem
  //    mais alta (0.42m -> 0.55m), profundidade um pouco maior (0.45).
  gabinete2: { shape: 'box', w: 0.18, d: 0.45, h: 0.55, y0: 0.3, color: 0x1c1f26 },
  //  - monitor2 ("LED/moderno"): variante 1 é mais grossa (0.08m, estilo
  //    CRT/LCD antigo); esta é BEM mais fina (0.03m, estilo LED moderno) e
  //    um pouco mais larga (tela maior, 0.58m).
  monitor2: { shape: 'box', w: 0.58, d: 0.03, h: 0.34, y0: 0.75, color: 0x14161b },
  //  - teclado2 ("Compacto", sem numérico): variante 1 é o teclado padrão
  //    full-size (0.4m de largura); este é o compacto (~75%, sem teclado
  //    numérico à direita), mesma profundidade/altura.
  teclado2: { shape: 'box', w: 0.29, d: 0.15, h: 0.03, y0: 0.75, color: 0x2c313a },
  //  - mouse2 ("Ergonômico"): variante 1 é o mouse simétrico padrão
  //    (0.1x0.06); este é maior/mais alto, formato ergonômico (corpo mais
  //    largo e mais alto pra apoiar a mão lateralmente).
  mouse2: { shape: 'box', w: 0.12, d: 0.075, h: 0.045, y0: 0.75, color: 0x3a4048 },
  // [13/09/2026] NOVO — "robo": tipo BASE do catálogo pra infraestrutura de
  // robôs (limpeza/copa/recepcionista — backlog grande do usuário). Corpo
  // simples tipo "robô aspirador/robô de serviço": cilindro baixo e largo,
  // ~40cm de diâmetro (r=0.2), ~30cm de altura, cor neutra cinza-claro. Só
  // a FORMA/tamanho — o comportamento de trajeto vem de um componente
  // Script anexado ao objeto (ver assets/modelos/_exemplo-script-robo-
  // trajeto.txt), não deste perfil. y0:0 — apoiado no chão, como qualquer
  // robô móvel de serviço.
  robo: { shape: 'cylinder', r: 0.2, h: 0.3, y0: 0, color: 0xc7ccd4 },
  // As 3 variantes especializadas abaixo reaproveitam a MESMA forma/
  // tamanho do tipo base ('robo') — só a COR muda, pra dar uma pista visual
  // de qual é qual já no mapa 2D/3D, mesmo sem um modelo humanoide/
  // detalhado dedicado (ver assets/modelos/robo-*.model.js pro
  // comportamento de cada um, e o README-ROBOS.md pra limitações honestas
  // desta rodada).
  //  - robo-limpeza: cinza mais escuro + tom "amarelo aviso" (aqui só dá
  //    pra escolher 1 cor — optei pelo cinza-escuro típico de robô
  //    aspirador; a faixa amarela de verdade exigiria multi-material, fora
  //    de escopo desta rodada de infraestrutura).
  'robo-limpeza': { shape: 'cylinder', r: 0.2, h: 0.28, y0: 0, color: 0x5a5f6b },
  //  - robo-copa: um pouco mais alto (compartimento/bandeja no topo,
  //    aproximado pela altura extra — sem geometria de bandeja de verdade
  //    nesta rodada) e cor branca (higiene/copa).
  'robo-copa': { shape: 'cylinder', r: 0.2, h: 0.4, y0: 0, color: 0xf2f3f5 },
  //  - robo-recepcionista: mais alto que os outros dois (aproximação de
  //    "mais estilizado", já visualmente diferenciado mesmo sem ser
  //    humanoide ainda — ver limitação HONESTA documentada em
  //    robo-recepcionista.model.js/README-ROBOS.md: isto NÃO é o robô
  //    humanoide com holograma pedido, é só a base de trajeto) e cor azul
  //    corporativo.
  'robo-recepcionista': { shape: 'cylinder', r: 0.22, h: 0.9, y0: 0, color: 0x3a6ea5 },
  // [13/09/2026] NOVO — 4 tipos de catálogo pra infraestrutura de geração de
  // Copa/Banheiro (pedido verbatim: "Copas (de café) [...] banheiros
  // feminino e masculino por andar" — ver js/geradores-salas.js
  // `gerarCopa`/`gerarBanheiro`, que são quem de fato planta estes objetos
  // num mapa). Catálogo checado ANTES de criar estes 4: não existia nada
  // parecido (nem "pia", nem "vaso"/privada, nem "cafeteira"/"mictorio") —
  // são tipos NOVOS, cada um uma forma básica simples (mesmo espírito do
  // resto deste arquivo: "suficiente pra reconhecer o que é", não um modelo
  // detalhado de catálogo de loja de banheiro).
  //  - pia: bacia rasa e larga (aproximação de balcão+cuba, uma peça só) +
  //    altura de bancada padrão (~0.85m do chão até o topo da forma).
  pia: { shape: 'box', w: 0.55, d: 0.45, h: 0.15, y0: 0.78, color: 0xe8ecf2 },
  //  - cafeteira: corpo baixo (base+bule aproximados numa caixa só — sem
  //    bule cilíndrico separado nesta rodada, ver limitação em
  //    geradores-salas.js), cor escura (plástico/vidro escuro típico).
  cafeteira: { shape: 'box', w: 0.22, d: 0.22, h: 0.32, y0: 0.78, color: 0x2c313a },
  //  - vaso-sanitario: bloco baixo aproximando bacia+caixa acoplada (sem
  //    geometria arredondada de verdade — documentado como simplificação
  //    deliberada no pedido original: "sem geometria de vaso sanitário
  //    detalhada nesta rodada").
  'vaso-sanitario': { shape: 'box', w: 0.38, d: 0.55, h: 0.4, y0: 0, color: 0xf2f3f5 },
  //  - mictorio: peça de parede mais estreita/rasa que o vaso, montada mais
  //    alta (aproximação de mictório de parede) — só pro banheiro masculino.
  mictorio: { shape: 'box', w: 0.35, d: 0.28, h: 0.5, y0: 0.3, color: 0xe8ecf2 },

  // ---------------------------------------------------------------------
  // [13/09/2026] NOVO — tipos do backlog "elevadores/disjuntores/casas dos
  // robôs/estacionamento/postes com controle remoto" (5 itens do backlog,
  // ver assets/modelos/*.model.js e js/geradores-salas.js pra cada um).
  // ---------------------------------------------------------------------
  //  - elevador-cabine: caixa simples ~2x2.2x2m (largura x altura x
  //    profundidade), representando a cabine do elevador de corpo inteiro
  //    (não modelamos porta/parede internas separadas nesta rodada — ver
  //    LIMITAÇÃO documentada em _exemplo-script-elevador-cabine.txt).
  'elevador-cabine': { shape: 'box', w: 2.0, d: 2.0, h: 2.2, y0: 0, color: 0xb8c0cc },
  //  - elevador-botao-chamada: painel pequeno de parede (~30x40x5cm),
  //    mesma família visual do "interruptor" já existente (peça de
  //    parede), só maior (é um painel de botão de chamada, não um
  //    interruptor de luz).
  'elevador-botao-chamada': { shape: 'box', w: 0.3, d: 0.05, h: 0.4, y0: 1.1, color: 0xe8ecf2 },
  //  - disjuntor: quadro elétrico de parede (painel retangular com várias
  //    alavancas pequenas — ver disjuntor.model.js pra descrição de como
  //    isso é desenhado; a "receita" de caixa aqui é só o CORPO do
  //    quadro, maior que o interruptor comum por ter várias alavancas).
  disjuntor: { shape: 'box', w: 0.5, d: 0.12, h: 0.6, y0: 1.0, color: 0x3a4048 },
  //  - casa-robo: corpo (caixinha) da casa — o telhado é uma peça
  //    SEPARADA (forma 'cone' já suportada, ver planta) aproximando um
  //    telhado triangular (geometria básica, "nada elaborado" como o
  //    pedido explicitamente permitiu) — ver casa-robo.model.js, que
  //    planta corpo+telhado como 2 objetos do mapa (nenhuma peça única
  //    "casa" existia pra reaproveitar, então compomos 2 formas prontas).
  'casa-robo': { shape: 'box', w: 2.2, d: 2.2, h: 1.6, y0: 0, color: 0xd8c6a0 },
  'casa-robo-telhado': { shape: 'cone', r: 1.7, h: 0.9, y0: 1.6, color: 0x9a4b3a },
  //  - vaga-estacionamento: marcação fina no chão (mesma ideia do tipo
  //    "piso"/formas 'retangulo', só que bem baixo — quase decalque),
  //    cor de linha demarcatória amarela.
  'vaga-estacionamento': { shape: 'box', w: 2.5, d: 5.0, h: 0.02, y0: 0, color: 0xe0c93a },
  //  - cancela-poste: poste vertical (corpo FIXO, não anima) da cancela.
  'cancela-poste': { shape: 'box', w: 0.12, d: 0.12, h: 1.0, y0: 0, color: 0xd23a3a },
  //  - cancela-haste: a haste horizontal que ergue/abaixa via
  //    `entity.anguloAbertura` (0°=abaixada/bloqueando, 90°=erguida) —
  //    mesmo mecanismo de porta animada já usado no resto do app (ver
  //    _exemplo-script-cancela.txt). Comprida e fina.
  'cancela-haste': { shape: 'box', w: 2.2, d: 0.08, h: 0.08, y0: 0.9, color: 0xe8ecf2 },
  //  - interruptor-remoto: variante do "interruptor" comum (mesma forma/
  //    tamanho), só que controla postes por LISTA (não por raio) — ver
  //    interruptor-remoto.model.js. Cor levemente diferente (azulada) pra
  //    reconhecer visualmente que é o painel "remoto", não o de raio.
  'interruptor-remoto': { shape: 'box', w: 0.09, d: 0.04, h: 0.14, y0: 1.1, color: 0xcfe0f2 },
};
const OBJECT3D_DEFAULT_PROFILE = { shape: 'box', w: 0.4, d: 0.4, h: 0.5, y0: 0, color: 0x8a92a3 };
// Exposto em `window` (pedido do usuário: "relacione as formas na
// representação 2D" — um switch, por exemplo, virava uma bolinha genérica
// no mapa 2D, não um retângulo de verdade) — mapping.js/mapview.js reusam
// ESTE MESMO catálogo de dimensões/formato pra dar ao objeto um formato
// (retângulo ou "círculo") plausível já na hora de colocar no mapa 2D, em
// vez de duplicar uma segunda tabela separada que pudesse divergir da usada
// aqui no 3D. `const` de topo de script não vaza pra `window` sozinho (ao
// contrário de `var`), por isso a atribuição explícita abaixo.
window.OBJECT3D_PROFILES = OBJECT3D_PROFILES;
window.OBJECT3D_DEFAULT_PROFILE = OBJECT3D_DEFAULT_PROFILE;

/** "#rrggbb" -> inteiro 0xrrggbb (cor do Three.js) — usado pelas formas
 *  desenhadas (obj.forma: 'retangulo'/'poligono'), que guardam a cor como
 *  string (mesmo formato do <input type="color">) em vez de um perfil fixo
 *  de OBJECT3D_PROFILES. Cai num cinza neutro se o formato vier inesperado. */
function _hexToThreeColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  return m ? parseInt(m[1], 16) : 0x8a92a3;
}

/** Largura/profundidade/altura da caixa delimitadora de um tipo de objeto —
 *  usada tanto pelo ghost de colocação quanto pelo teste de colisão
 *  objeto×parede/objeto×objeto (ver view3d.js `_resolveObjectWallSnap`/
 *  `raycastLateral`). Mesa/coluna/cubo: mesmas dimensões explícitas
 *  passadas ao colocar de verdade (ver view3d.js `_placeWithBuildTool`,
 *  tool 'objeto') — não o perfil velho de `OBJECT3D_PROFILES` (que pra mesa
 *  é só o tampo fino a 0.72m, sem pernas; a caixa genérica ficaria do
 *  tamanho errado). Extraído de `Engine3D.objectFootprint` (rodada 51) —
 *  função livre, sem nenhuma dependência de `this`/THREE.js/estado de cena,
 *  por isso pôde vir pra este arquivo de "receitas". */
function computeObjectFootprint(tipoKey) {
  let perfil;
  if (tipoKey === 'mesa') perfil = { shape: 'box', w: 1.2, d: 0.6, h: 0.74 }; // 0.74m — ver mapview.js _MESA_FORMA_DEF
  else if (tipoKey === 'coluna') perfil = { shape: 'cylinder', r: 0.18, h: 2.6 };
  else if (tipoKey === 'cubo') perfil = { shape: 'box', w: 0.4, d: 0.4, h: 0.4 };
  else perfil = OBJECT3D_PROFILES[tipoKey] || OBJECT3D_DEFAULT_PROFILE;
  const isCircle = perfil.shape === 'cylinder' || perfil.shape === 'cone';
  const w = isCircle ? (perfil.r || 0.3) * 2 : (perfil.w || 0.4);
  const d = isCircle ? (perfil.r || 0.3) * 2 : (perfil.d || 0.4);
  const h = perfil.h || 0.5;
  return { w, d, h, shape: isCircle ? 'circle' : 'box' };
}

window.Engine3DProfiles = { OBJECT3D_PROFILES, OBJECT3D_DEFAULT_PROFILE, objAnguloToRotY, computeObjectFootprint, hexToThreeColor: _hexToThreeColor };
