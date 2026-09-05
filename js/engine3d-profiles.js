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
  mesa: { shape: 'box', w: 1.2, d: 0.6, h: 0.05, y0: 0.72, color: 0x8a6a4a },
  cadeira: { shape: 'box', w: 0.45, d: 0.45, h: 0.45, y0: 0.42, color: 0x5a5f6b },
  poltrona: { shape: 'box', w: 0.75, d: 0.75, h: 0.5, y0: 0.4, color: 0x6a5a4a },
  armario: { shape: 'box', w: 0.8, d: 0.45, h: 1.9, y0: 0, color: 0x7c8494 },
  arquivo: { shape: 'box', w: 0.45, d: 0.5, h: 1.3, y0: 0, color: 0x7c8494 },
  estante: { shape: 'box', w: 0.9, d: 0.35, h: 1.8, y0: 0, color: 0x8a7455 },
  quadro: { shape: 'box', w: 1.2, d: 0.05, h: 0.8, y0: 1.1, color: 0xe8ecf2 },
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
  // Relógio (pedido do usuário, 26/08/2026) — disco fino (mostrador), do
  // tamanho de um relógio de parede pequeno/de mesa. y0:0 de propósito
  // (mesmo raciocínio da luminária, acima): sem elevação própria aqui — se o
  // usuário colocar em cima de outro objeto (mesa, estante) ou encostado na
  // lateral dele, quem decide a altura é o empilhamento automático de
  // sempre (ver Mapping.addObject/_findTopObjectAt), igual a qualquer outro
  // objeto — não é exclusividade do relógio. Os ponteiros (hora ATUAL do
  // aparelho, ao vivo) só existem no mapa 2D por enquanto — ver mapview.js
  // Map2DRenderer._drawFormaShape; aqui no 3D o relógio aparece como este
  // disco parado (mostrador simples), sem ponteiros animados.
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
