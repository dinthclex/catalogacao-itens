/**
 * icons.js — Ícones SVG PRÉ-CONFIGURADOS para itens comuns de conferência de
 * patrimônio (informática e materiais de escritório), usados como imagem do
 * item quando NÃO há foto (câmera bloqueada/indisponível, ou cadastro manual).
 *
 * Dois níveis, nesta ordem:
 *  1. Biblioteca local (esta lista, sempre disponível, 100% offline) — o tipo/
 *     descrição digitado é comparado com uma lista de palavras-chave por
 *     ícone (editável nas Configurações: "🖼️ Ícones para itens sem foto").
 *  2. Opcional — se ativado nas Configurações, e só quando nenhum ícone local
 *     bateu, tenta baixar um ícone gratuito de um repositório público na
 *     internet (Iconify — api.iconify.design, sem chave/cadastro). Se falhar
 *     (sem internet, bloqueado, não encontrado), fica registrado no log de
 *     eventos (ver eventlog.js) — o item continua salvo normalmente, só sem
 *     ícone extra.
 */
 
function _iconSvg(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}
 
const ICON_LIBRARY = {
  gabinete: { label: 'Gabinete / CPU', svg: _iconSvg(`
    <rect x="7" y="2.5" width="8" height="19" rx="1.2"/>
    <circle cx="11" cy="5.5" r="0.6" fill="currentColor" stroke="none"/>
    <line x1="8.5" y1="9" x2="13.5" y2="9"/><line x1="8.5" y1="12" x2="13.5" y2="12"/><line x1="8.5" y1="15" x2="11.5" y2="15"/>
  `) },
  monitor: { label: 'Monitor', svg: _iconSvg(`
    <rect x="3" y="4" width="18" height="12" rx="1.2"/>
    <line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/>
  `) },
  teclado: { label: 'Teclado', svg: _iconSvg(`
    <rect x="2.5" y="7" width="19" height="11" rx="1.4"/>
    <line x1="5" y1="10" x2="5.01" y2="10"/><line x1="8" y1="10" x2="8.01" y2="10"/><line x1="11" y1="10" x2="11.01" y2="10"/>
    <line x1="14" y1="10" x2="14.01" y2="10"/><line x1="17" y1="10" x2="17.01" y2="10"/><line x1="19" y1="10" x2="19.01" y2="10"/>
    <line x1="7" y1="14.5" x2="17" y2="14.5"/>
  `) },
  mouse: { label: 'Mouse', svg: _iconSvg(`
    <path d="M12 2.5c-3 0-5 2.4-5 6v7c0 3.6 2 6 5 6s5-2.4 5-6v-7c0-3.6-2-6-5-6z"/>
    <line x1="12" y1="2.5" x2="12" y2="9"/>
  `) },
  // [13/09/2026] NOVO — ícones das "variantes 2" de gabinete/monitor/
  // teclado/mouse (ver js/engine3d-profiles.js OBJECT3D_PROFILES.gabinete2
  // etc.) — reaproveita o desenho do ícone original, com uma pequena
  // variação pra diferenciar visualmente na lista (mesmo padrão de
  // "editável nas Configurações" do topo do arquivo).
  gabinete2: { label: 'Gabinete / CPU (Torre)', svg: _iconSvg(`
    <rect x="8" y="1.5" width="6" height="21" rx="1"/>
    <circle cx="11" cy="4" r="0.5" fill="currentColor" stroke="none"/>
    <line x1="9" y1="8" x2="13" y2="8"/><line x1="9" y1="11" x2="13" y2="11"/><line x1="9" y1="14" x2="13" y2="14"/><line x1="9" y1="17" x2="13" y2="17"/>
  `) },
  monitor2: { label: 'Monitor (LED)', svg: _iconSvg(`
    <rect x="2.5" y="5" width="19" height="10.5" rx="0.8"/>
    <line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="15.5" x2="12" y2="20"/>
  `) },
  teclado2: { label: 'Teclado (Compacto)', svg: _iconSvg(`
    <rect x="5" y="7" width="14" height="11" rx="1.4"/>
    <line x1="7.5" y1="10" x2="7.51" y2="10"/><line x1="10.5" y1="10" x2="10.51" y2="10"/><line x1="13.5" y1="10" x2="13.51" y2="10"/><line x1="16.5" y1="10" x2="16.51" y2="10"/>
    <line x1="7" y1="14.5" x2="17" y2="14.5"/>
  `) },
  mouse2: { label: 'Mouse (Ergonômico)', svg: _iconSvg(`
    <path d="M12 2.5c-3.6 0-6 2.6-6 6.5v6.5c0 3.9 2.4 6.5 6 6.5s6-2.6 6-6.5V9c0-3.9-2.4-6.5-6-6.5z"/>
    <line x1="12" y1="2.5" x2="12" y2="10"/><line x1="9" y1="10" x2="15" y2="10"/>
  `) },
  notebook: { label: 'Notebook', svg: _iconSvg(`
    <rect x="4" y="5" width="16" height="10" rx="1"/>
    <path d="M2 18h20l-1.5-3h-17z"/>
  `) },
  impressora: { label: 'Impressora', svg: _iconSvg(`
    <rect x="5" y="8" width="14" height="7" rx="1"/>
    <path d="M7 8V4h10v4"/><path d="M7 15v5h10v-5"/><line x1="8" y1="11" x2="8.01" y2="11"/>
  `) },
  switch: { label: 'Switch / roteador', svg: _iconSvg(`
    <rect x="3" y="9" width="18" height="6" rx="1"/>
    <line x1="6" y1="12" x2="6.01" y2="12"/><line x1="9" y1="12" x2="9.01" y2="12"/>
    <path d="M8 9V6"/><path d="M12 9V4"/><path d="M16 9V6"/>
  `) },
  estabilizador: { label: 'Estabilizador / nobreak', svg: _iconSvg(`
    <rect x="4" y="5" width="16" height="14" rx="1.4"/>
    <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none"/>
    <line x1="13" y1="8" x2="18" y2="8"/><line x1="13" y1="10" x2="18" y2="10"/>
    <line x1="7" y1="14" x2="17" y2="14"/><line x1="7" y1="16.5" x2="17" y2="16.5"/>
  `) },
  telefone: { label: 'Telefone', svg: _iconSvg(`
    <path d="M6 3h4l1.5 4-2 2c1 2.5 3 4.5 5.5 5.5l2-2 4 1.5v4c0 1-1 2-2 2-8 0-15-7-15-15 0-1 1-2 2-2z"/>
  `) },
  mesa: { label: 'Mesa', svg: _iconSvg(`
    <rect x="2" y="5" width="20" height="2.2" rx="0.6"/>
    <line x1="4" y1="7.2" x2="4" y2="20"/><line x1="20" y1="7.2" x2="20" y2="20"/>
  `) },
  cadeira: { label: 'Cadeira', svg: _iconSvg(`
    <rect x="6" y="3" width="12" height="8" rx="1.4"/>
    <path d="M6 11v4h12v-4"/>
    <line x1="12" y1="15" x2="12" y2="19"/><line x1="7" y1="21" x2="17" y2="21"/>
    <line x1="9" y1="19" x2="9" y2="21"/><line x1="15" y1="19" x2="15" y2="21"/>
  `) },
  poltrona: { label: 'Poltrona / sofá', svg: _iconSvg(`
    <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/>
    <rect x="3" y="11" width="18" height="7" rx="1.5"/>
    <line x1="3" y1="18" x2="3" y2="21"/><line x1="21" y1="18" x2="21" y2="21"/>
    <line x1="6" y1="18" x2="6" y2="21"/><line x1="18" y1="18" x2="18" y2="21"/>
  `) },
  grampeador: { label: 'Grampeador', svg: _iconSvg(`
    <path d="M3 16l16-6 2 5-16 6z"/>
    <path d="M5 18h14"/><line x1="8" y1="12" x2="9" y2="16"/>
  `) },
  armario: { label: 'Armário', svg: _iconSvg(`
    <rect x="5" y="2.5" width="14" height="19" rx="1"/>
    <line x1="12" y1="2.5" x2="12" y2="21.5"/>
    <line x1="9.5" y1="11" x2="9.5" y2="11.01"/><line x1="14.5" y1="11" x2="14.5" y2="11.01"/>
  `) },
  arquivo: { label: 'Arquivo / gaveteiro', svg: _iconSvg(`
    <rect x="5" y="2.5" width="14" height="19" rx="1"/>
    <line x1="5" y1="9" x2="19" y2="9"/><line x1="5" y1="15.5" x2="19" y2="15.5"/>
    <line x1="9" y1="5.7" x2="15" y2="5.7"/><line x1="9" y1="12.2" x2="15" y2="12.2"/><line x1="9" y1="18.7" x2="15" y2="18.7"/>
  `) },
  ventilador: { label: 'Ventilador', svg: _iconSvg(`
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>
    <path d="M12 10.5c0-3.5 1.5-6 4-6 1.2 0 1.6 1.6 0 3-1.3 1.2-2.8 2.2-4 3z"/>
    <path d="M10.5 12c-3.5 0-6-1.5-6-4 0-1.2 1.6-1.6 3 0 1.2 1.3 2.2 2.8 3 4z"/>
    <path d="M12 13.5c0 3.5-1.5 6-4 6-1.2 0-1.6-1.6 0-3 1.3-1.2 2.8-2.2 4-3z"/>
    <circle cx="12" cy="12" r="9.5" opacity="0.5"/>
  `) },
  'ar-condicionado': { label: 'Ar-condicionado', svg: _iconSvg(`
    <rect x="2.5" y="6" width="19" height="7" rx="1.5"/>
    <line x1="5" y1="9.5" x2="19" y2="9.5"/>
    <path d="M6 13l-1 4"/><path d="M12 13l0 4"/><path d="M18 13l1 4"/>
  `) },
  extintor: { label: 'Extintor', svg: _iconSvg(`
    <rect x="9" y="7" width="6" height="14" rx="2"/>
    <path d="M12 7V4"/><path d="M10 4h4"/><path d="M9 9l-4-1"/><line x1="5" y1="8" x2="5" y2="6"/>
  `) },
  bebedouro: { label: 'Bebedouro', svg: _iconSvg(`
    <rect x="7" y="9" width="10" height="12" rx="1.4"/>
    <circle cx="12" cy="5" r="3.2"/><line x1="9" y1="13" x2="9" y2="13.01"/>
  `) },
  geladeira: { label: 'Geladeira / frigobar', svg: _iconSvg(`
    <rect x="6" y="2.5" width="12" height="19" rx="1.2"/>
    <line x1="6" y1="10" x2="18" y2="10"/>
    <line x1="9" y1="5" x2="9" y2="7"/><line x1="9" y1="13" x2="9" y2="15"/>
  `) },
  'caixa-som': { label: 'Caixa de som', svg: _iconSvg(`
    <rect x="6" y="2.5" width="12" height="19" rx="1.4"/>
    <circle cx="12" cy="8" r="2.4"/><circle cx="12" cy="16" r="3.4"/>
  `) },
  calculadora: { label: 'Calculadora', svg: _iconSvg(`
    <rect x="5" y="2.5" width="14" height="19" rx="1.4"/>
    <rect x="7.5" y="5" width="9" height="3.5" rx="0.6"/>
    <line x1="8" y1="12" x2="8.01" y2="12"/><line x1="12" y1="12" x2="12.01" y2="12"/><line x1="16" y1="12" x2="16.01" y2="12"/>
    <line x1="8" y1="15.5" x2="8.01" y2="15.5"/><line x1="12" y1="15.5" x2="12.01" y2="15.5"/><line x1="16" y1="15.5" x2="16.01" y2="15.5"/>
    <line x1="8" y1="19" x2="8.01" y2="19"/><line x1="12" y1="19" x2="12.01" y2="19"/>
  `) },
  lixeira: { label: 'Lixeira', svg: _iconSvg(`
    <path d="M4 7h16"/>
    <path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7"/>
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>
    <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
  `) },
  estante: { label: 'Estante / prateleira', svg: _iconSvg(`
    <rect x="4" y="3" width="16" height="18" rx="1"/>
    <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
  `) },
  quadro: { label: 'Quadro branco', svg: _iconSvg(`
    <rect x="3" y="4" width="18" height="12" rx="1"/>
    <line x1="12" y1="16" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/>
    <path d="M7 8h6M7 11h9"/>
  `) },
};
 
/**
 * Ícone GENÉRICO (uma caixa/pacote) — não faz parte de ICON_LIBRARY porque não
 * é escolhido por palavra-chave, então não aparece na lista de "palavras-chave
 * por ícone" das Configurações. É usado como ícone PADRÃO quando "Usar ícones
 * prontos quando não há foto" está ativo mas o tipo/descrição digitado não bate
 * com nenhum ícone específico — em vez de cair no avatar de iniciais/cor (que
 * só é usado quando a opção está DESATIVADA).
 */
const ICON_GENERIC_SVG = _iconSvg(`
  <path d="M21 7.5L12 3 3 7.5l9 4.5 9-4.5z"/>
  <path d="M3 7.5v9l9 4.5 9-4.5v-9"/>
  <line x1="12" y1="12" x2="12" y2="21"/>
  <path d="M16.5 5.25l-9 4.5"/>
`);

/**
 * SVG_WIFI_DEVICES — ícone da seção "Conexão direta com outro aparelho
 * (Wi-Fi, sem servidor)" das Configurações (aba "🖥️ Servidor e rede") —
 * pedido do usuário (27/08/2026), substitui o emoji 📶 usado antes: "o
 * símbolo do wi-fi [...] no meio, na esquerda e na direita deve haver a
 * representação de um dispositivo em cada lado [...] entre o dispositivo e
 * o símbolo de wi-fi deve haver uma seta bidirecional [...] curvada,
 * seguindo o traço [do arco]".
 *
 * Layout (viewBox 24x24): dois retângulos arredondados (dispositivo
 * genérico, com uma bolinha de "botão" perto da base) nas pontas esquerda/
 * direita; no meio, o símbolo de wi-fi de verdade (uma bolinha embaixo +
 * QUATRO arcos concêntricos aumentando de raio pra cima, calculados por
 * trigonometria a partir do mesmo centro da bolinha — não são arcos
 * arbitrários); entre cada dispositivo e o símbolo, uma curva (Bézier
 * quadrática, saindo tangente na mesma direção dos arcos — "como se
 * seguisse o traço do arco") com uma seta em CADA ponta (`marker-start`/
 * `marker-end`, `orient="auto-start-reverse"` faz o SVG apontar cada seta
 * sozinho na direção certa em cada extremidade, sem precisar calcular o
 * ângulo à mão) — daí a bidirecionalidade.
 */
const SVG_WIFI_DEVICES = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" style="vertical-align:-5px" aria-hidden="true">
  <defs>
    <marker id="icon-wifi-devices-arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" stroke="none"/>
    </marker>
  </defs>
  <rect x="0.6" y="9.5" width="4.2" height="9" rx="1.1"/>
  <circle cx="2.7" cy="17.2" r="0.4" fill="currentColor" stroke="none"/>
  <rect x="19.2" y="9.5" width="4.2" height="9" rx="1.1"/>
  <circle cx="21.3" cy="17.2" r="0.4" fill="currentColor" stroke="none"/>
  <path d="M4.8,14.2 Q6.2,9.3 7.56,12.77" stroke-width="1.3" marker-start="url(#icon-wifi-devices-arrow)" marker-end="url(#icon-wifi-devices-arrow)"/>
  <path d="M16.44,12.77 Q17.8,9.3 19.2,14.2" stroke-width="1.3" marker-start="url(#icon-wifi-devices-arrow)" marker-end="url(#icon-wifi-devices-arrow)"/>
  <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none"/>
  <path d="M10.77,15.47 A1.6,1.6 0 0 1 13.23,15.47"/>
  <path d="M9.70,14.57 A3.0,3.0 0 0 1 14.30,14.57"/>
  <path d="M8.63,13.67 A4.4,4.4 0 0 1 15.37,13.67"/>
  <path d="M7.56,12.77 A5.8,5.8 0 0 1 16.44,12.77"/>
</svg>`;

const ICON_DEFAULT_ALIASES = {
  gabinete: ['gabinete', 'cpu', 'computador', 'desktop', 'torre do computador', 'pc de mesa'],
  monitor: ['monitor', 'tela', 'display'],
  teclado: ['teclado', 'keyboard'],
  mouse: ['mouse', 'rato'],
  notebook: ['notebook', 'laptop', 'note'],
  impressora: ['impressora', 'printer', 'multifuncional'],
  switch: ['switch', 'roteador', 'router', 'hub de rede', 'modem', 'access point', 'ponto de acesso'],
  estabilizador: ['estabilizador', 'nobreak', 'no-break', 'ups', 'filtro de linha'],
  telefone: ['telefone', 'ramal', 'aparelho telefonico'],
  mesa: ['mesa', 'escrivaninha', 'bancada'],
  cadeira: ['cadeira'],
  poltrona: ['poltrona', 'sofa'],
  grampeador: ['grampeador'],
  armario: ['armario', 'guarda-roupa', 'guarda roupa'],
  arquivo: ['arquivo', 'gaveteiro', 'fichario'],
  ventilador: ['ventilador', 'climatizador'],
  'ar-condicionado': ['ar condicionado', 'ar-condicionado', 'split', 'climatizador de ar'],
  extintor: ['extintor'],
  bebedouro: ['bebedouro', 'purificador de agua'],
  geladeira: ['geladeira', 'frigobar', 'refrigerador'],
  'caixa-som': ['caixa de som', 'caixa som', 'speaker', 'som ambiente'],
  calculadora: ['calculadora'],
  lixeira: ['lixeira', 'lixo'],
  estante: ['estante', 'prateleira', 'biblioteca'],
  quadro: ['quadro branco', 'quadro', 'lousa'],
};
 
/**
 * MAP_OBJECT_EXTRAS — ícones SÓ para objetos do mapa 2D/3D (mapview.js),
 * sem correspondente entre os tipos de item de ICON_LIBRARY acima (não
 * entram no reconhecimento automático por palavra-chave nem na tela de
 * "Ícones para itens sem foto" — são um catálogo à parte, próprio pra
 * mobiliário/elementos de planta que não fazem sentido como "tipo de item").
 */
const MAP_OBJECT_EXTRAS = {
  // Pedido do usuário (rodada 47): "Deve ser possível colocar um novo cubo
  // no cenário 3D pelo botão do rodapé, o botão objeto." — antes só existia
  // via "🧊 Novo Cubo 3D"/"Modelar em 3D" (que também JÁ abre o Modelador —
  // ver view3d.js #v3d-newcube3d), sem opção nenhuma de colocar um cubo
  // "solto", sem editar, pelo fluxo normal do botão 📦 Objeto do rodapé
  // (roleta). Ícone: cubo isométrico simples (3 faces visíveis, mesmo
  // estilo de traço dos outros ícones deste arquivo).
  cubo: { label: 'Cubo', svg: _iconSvg(`
    <path d="M12 2l8 4.5v11L12 22l-8-4.5v-11z"/>
    <path d="M12 2v9.5M12 11.5l8-4.5M12 11.5l-8-4.5M12 11.5V22"/>
  `) },
  coluna: { label: 'Coluna / pilar', svg: _iconSvg(`
    <rect x="8" y="2" width="8" height="2" rx="0.6"/>
    <rect x="9" y="4" width="6" height="16"/>
    <rect x="8" y="20" width="8" height="2" rx="0.6"/>
  `) },
  // [15/09/2026 UTC] NOVO — pedido verbatim: "faça dois novos objetos:
  // 'Mesa' e 'Pilar' [...] O objeto 'Pilar' deve ter a altura que define a
  // distância entre um andar e outro e dimensões de 120cmx60cm." Ícone
  // NOVO, retangular/robusto (bem mais largo que 'coluna' acima, que
  // continua existindo — só não aparece mais na grade de escolha, ver
  // `mapObjectCatalog` abaixo — pra sugerir a planta retangular de VERDADE
  // do novo Pilar, em vez da coluna cilíndrica antiga).
  pilar: { label: 'Pilar', svg: _iconSvg(`
    <rect x="8.5" y="2" width="7" height="20" rx="0.8"/>
    <path d="M8.5 6h7M8.5 18h7"/>
  `) },
  // [20/09/2026 UTC] NOVO -- "Viga": peça estrutural HORIZONTAL (o Pilar é a vertical).
  viga: { label: 'Viga', svg: _iconSvg(`
    <rect x="2" y="8.5" width="20" height="7" rx="0.8"/>
    <path d="M6 8.5v7M18 8.5v7"/>
  `) },
  // [18/09/2026 UTC] NOVO -- "Rack" (rack modular de 19", objeto parametrico
  // de catalogo, ver js/rack-modular.js): gabinete visto de frente, com
  // porta, unidades de rack (tracinhos) e fechadura.
  rack: { label: 'Rack', svg: _iconSvg(`
    <rect x="5" y="2.5" width="14" height="19" rx="1"/>
    <path d="M8 6h8M8 9h8M8 12h8M8 15h8"/>
    <circle cx="16.5" cy="18.5" r="0.7" fill="currentColor" stroke="none"/>
  `) },
  // [18/09/2026 UTC] RODADA 166 -- Equipamentos de rede de RACK 19" (ver js/rede-equip.js):
  // "Switch de 24 portas", "Switch de 48 portas" (1U) e "Patch panel" de 24 (1U) / 48 (2U)
  // portas. SUBSTITUEM o antigo "Switch / roteador" da grade "Objetos" (a chave `switch`
  // continua em LIBRARY so para os TIPOS DE ITEM/inventario e mapas antigos).
  switch24: { label: 'Switch de 24 portas', svg: _iconSvg(`
    <rect x="1.5" y="8" width="21" height="8" rx="0.8"/>
    <path d="M4 10.4h1.6v1.6H4zM7 10.4h1.6v1.6H7zM10 10.4h1.6v1.6H10zM13 10.4h1.6v1.6H13zM4 12.8h1.6v1.6H4zM7 12.8h1.6v1.6H7zM10 12.8h1.6v1.6H10zM13 12.8h1.6v1.6H13z"/>
    <path d="M16.5 10.4h1.6v1.6h-1.6zM19 10.4h1.6v1.6H19zM16.5 12.8h1.6v1.6h-1.6zM19 12.8h1.6v1.6H19z"/>
  `) },
  switch48: { label: 'Switch de 48 portas', svg: _iconSvg(`
    <rect x="1.5" y="7" width="21" height="10" rx="0.8"/>
    <path d="M3.5 9h1.4v1.6H3.5zM6 9h1.4v1.6H6zM8.5 9h1.4v1.6H8.5zM11 9h1.4v1.6H11zM13.5 9h1.4v1.6h-1.4zM3.5 13.4h1.4V15H3.5zM6 13.4h1.4V15H6zM8.5 13.4h1.4V15H8.5zM11 13.4h1.4V15H11zM13.5 13.4h1.4V15h-1.4z"/>
    <path d="M17 9h1.6v1.6H17zM19.6 9h1.6v1.6h-1.6zM17 13.4h1.6V15H17zM19.6 13.4h1.6V15h-1.6z"/>
    <path d="M3.5 11.9h11.4"/>
  `) },
  patchpanel24: { label: 'Patch panel de 24 portas', svg: _iconSvg(`
    <rect x="1.5" y="8.5" width="21" height="7" rx="0.8"/>
    <path d="M3.4 10.5h2.2v3H3.4zM6.4 10.5h2.2v3H6.4zM9.4 10.5h2.2v3H9.4zM13 10.5h2.2v3H13zM16 10.5h2.2v3H16zM19 10.5h2.2v3H19z"/>
  `) },
  patchpanel48: { label: 'Patch panel de 48 portas', svg: _iconSvg(`
    <rect x="1.5" y="5.5" width="21" height="13" rx="0.8"/>
    <path d="M3.4 7.5h2.2v3H3.4zM6.4 7.5h2.2v3H6.4zM9.4 7.5h2.2v3H9.4zM13 7.5h2.2v3H13zM16 7.5h2.2v3H16zM19 7.5h2.2v3H19z"/>
    <path d="M3.4 13.5h2.2v3H3.4zM6.4 13.5h2.2v3H6.4zM9.4 13.5h2.2v3H9.4zM13 13.5h2.2v3H13zM16 13.5h2.2v3H16zM19 13.5h2.2v3H19z"/>
  `) },
  // [18/09/2026 UTC] RODADA 167 -- Ecossistema de infraestrutura PASSIVA de rede (ver js/rede-passiva.js):
  // DIO, guias, bandejas, PDU, frente falsa, ventilacao, espelhos/caixas de piso, abracadeiras e
  // (eletrocalha, leito, canaleta e eletroduto são peças comuns de tamanho fixo).
  dio12: { label: 'DIO de 12 fibras (1U)', svg: _iconSvg(`
    <rect x="1.5" y="8.5" width="21" height="7" rx="0.8"/>
    <path d="M4 10.7 h2 v2.6 h-2z M8 10.7 h2 v2.6 h-2z M12 10.7 h2 v2.6 h-2z M16 10.7 h2 v2.6 h-2z"/>
    <path d="M3 15.9 c1.5 -3 3 -3 4.5 0" />
  `) },
  dio24: { label: 'DIO de 24 fibras (1U)', svg: _iconSvg(`
    <rect x="1.5" y="8.5" width="21" height="7" rx="0.8"/>
    <path d="M4 10.7 h2 v2.6 h-2z M8 10.7 h2 v2.6 h-2z M12 10.7 h2 v2.6 h-2z M16 10.7 h2 v2.6 h-2z"/>
    <path d="M3 15.9 c1.5 -3 3 -3 4.5 0" />
  `) },
  dio48: { label: 'DIO de 48 fibras (2U)', svg: _iconSvg(`
    <rect x="1.5" y="6" width="21" height="12" rx="0.8"/>
    <path d="M4 10.7 h2 v2.6 h-2z M8 10.7 h2 v2.6 h-2z M12 10.7 h2 v2.6 h-2z M16 10.7 h2 v2.6 h-2z"/>
    <path d="M3 18.4 c1.5 -3 3 -3 4.5 0" />
  `) },
  guia_h1: { label: 'Guia de cabos horizontal 1U', svg: _iconSvg(`
    <rect x="1.5" y="8.5" width="21" height="7" rx="0.8"/>
    <path d="M5 8.5v7M9 8.5v7M13 8.5v7M17 8.5v7"/>
  `) },
  guia_h2: { label: 'Guia de cabos horizontal 2U', svg: _iconSvg(`
    <rect x="1.5" y="6" width="21" height="12" rx="0.8"/>
    <path d="M5 6v12M9 6v12M13 6v12M17 6v12"/>
  `) },
  guia_v: { label: 'Guia de cabos vertical', svg: _iconSvg(`
    <rect x="8" y="2.5" width="8" height="19" rx="1"/>
    <path d="M8 6h5M11 10h5M8 14h5M11 18h5"/>
  `) },
  bandeja_fixa: { label: 'Bandeja fixa 1U', svg: _iconSvg(`
    <rect x="1.5" y="9" width="21" height="6" rx="0.8"/>
    <path d="M4 12h16" stroke-dasharray="2 2"/>
  `) },
  bandeja_basc: { label: 'Bandeja basculante 2U', svg: _iconSvg(`
    <rect x="1.5" y="6" width="21" height="12" rx="0.8"/>
    <path d="M3 14l18-3"/><path d="M4 17h16"/>
  `) },
  pdu8: { label: 'Régua de tomadas (PDU) 1U', svg: _iconSvg(`
    <rect x="1.5" y="8.5" width="21" height="7" rx="0.8"/>
    <path d="M5 10.5h2.4v3H5zM9 10.5h2.4v3H9zM13 10.5h2.4v3H13zM17 10.5h2.4v3H17z"/>
  `) },
  // [19/09/2026 UTC] NOVO (RODADA 171) -- No-break/UPS, Storage (NAS/SAN/Disk Shelf).
  nobreak_torre: { label: 'No-break torre (Interactive)', svg: _iconSvg(`
    <rect x="6" y="2" width="12" height="20" rx="1.4"/>
    <rect x="8.4" y="5" width="7.2" height="4" rx="0.6"/>
    <circle cx="12" cy="16.5" r="1.6"/>
  `) },
  nobreak_1u: { label: 'No-break rack 1U (Interactive)', svg: _iconSvg(`
    <rect x="1.5" y="8.5" width="21" height="7" rx="0.8"/>
    <circle cx="6.4" cy="12" r="1.6"/>
    <path d="M10.5 10h2.4v4h-2.4zM14.5 10h2.4v4h-2.4z"/>
  `) },
  nobreak_2u: { label: 'No-break rack 2U (Interactive)', svg: _iconSvg(`
    <rect x="1.5" y="6" width="21" height="12" rx="0.8"/>
    <circle cx="6.4" cy="12" r="2"/>
    <path d="M10.5 9.5h2.4v5h-2.4zM14.5 9.5h2.4v5h-2.4zM17.6 9.5h2.4v5h-2.4z"/>
  `) },
  nobreak_corporativo: { label: 'No-break corporativo (Online Double Conversion)', svg: _iconSvg(`
    <rect x="2.5" y="1.5" width="19" height="21" rx="1.2"/>
    <rect x="5.5" y="4" width="13" height="5" rx="0.6"/>
    <circle cx="12" cy="16" r="2.4"/>
  `) },
  storage_12: { label: 'Storage NAS/SAN 12 baias (2U)', svg: _iconSvg(`
    <rect x="1.5" y="6" width="21" height="12" rx="0.8"/>
    <path d="M4 8.5h4v7H4zM9 8.5h4v7H9zM14 8.5h4v7h-4zM19 8.5h2v7h-2z"/>
  `) },
  storage_24: { label: 'Storage NAS/SAN 24 baias (2U)', svg: _iconSvg(`
    <rect x="1.5" y="6" width="21" height="12" rx="0.8"/>
    <path d="M3.5 8.5h2.6v7H3.5zM7 8.5h2.6v7H7zM10.5 8.5h2.6v7h-2.6zM14 8.5h2.6v7H14zM17.5 8.5h2.6v7h-2.6z"/>
  `) },
  storage_60: { label: 'Storage NAS/SAN 60 baias (4U)', svg: _iconSvg(`
    <rect x="1.5" y="3" width="21" height="18" rx="0.8"/>
    <path d="M3.5 5.5h2.2v13H3.5zM6.4 5.5h2.2v13H6.4zM9.3 5.5h2.2v13H9.3zM12.2 5.5h2.2v13h-2.2zM15.1 5.5h2.2v13h-2.2zM18 5.5h2.2v13H18z"/>
  `) },
  frente_falsa: { label: 'Frente falsa 1U (blanking panel)', svg: _iconSvg(`
    <rect x="1.5" y="9.5" width="21" height="5" rx="0.8"/>
    <circle cx="4" cy="12" r="0.7"/><circle cx="20" cy="12" r="0.7"/>
  `) },
  kit_vent: { label: 'Kit de ventilação 1U', svg: _iconSvg(`
    <rect x="1.5" y="8.5" width="21" height="7" rx="0.8"/>
    <circle cx="8" cy="12" r="2.6"/><circle cx="16" cy="12" r="2.6"/><path d="M8 9.6v4.8M5.6 12h4.8M16 9.6v4.8M13.6 12h4.8"/>
  `) },
  access_point: { label: 'Access Point Wi-Fi (AP)', svg: _iconSvg(`
    <rect x="6" y="11" width="12" height="8" rx="1.6"/><circle cx="12" cy="15" r="0.8"/>
    <path d="M8.5 8.5a5 5 0 0 1 7 0M6.2 6.2a8.2 8.2 0 0 1 11.6 0"/>
  `) },
  espelho1: { label: 'Espelho de parede 1 módulo', svg: _iconSvg(`
    <rect x="6" y="6" width="12" height="12" rx="1.4"/>
    <path d="M10 10h4v4h-4z"/>
  `) },
  espelho2: { label: 'Espelho de parede 2 módulos', svg: _iconSvg(`
    <rect x="6" y="6" width="12" height="12" rx="1.4"/>
    <path d="M8.6 8.6h6.8v2.6H8.6zM8.6 12.8h6.8v2.6H8.6z"/>
  `) },
  espelho4: { label: 'Espelho de parede 4 módulos', svg: _iconSvg(`
    <rect x="5" y="5" width="14" height="14" rx="1.4"/>
    <path d="M7.6 7.6h3.6v3.6H7.6zM12.8 7.6h3.6v3.6h-3.6zM7.6 12.8h3.6v3.6H7.6zM12.8 12.8h3.6v3.6h-3.6z"/>
  `) },
  caixa_piso2: { label: 'Caixa de piso 2 módulos', svg: _iconSvg(`
    <rect x="4" y="7" width="16" height="10" rx="1.4"/>
    <path d="M7 10h4v4H7zM13 10h4v4h-4z"/>
  `) },
  caixa_piso4: { label: 'Caixa de piso 4 módulos', svg: _iconSvg(`
    <rect x="3" y="5" width="18" height="14" rx="1.4"/>
    <path d="M6 8h3v3H6zM10.5 8h3v3h-3zM15 8h3v3h-3zM6 13h3v3H6z"/>
  `) },
  abracadeira_velcro: { label: 'Abraçadeira de velcro', svg: _iconSvg(`
    <rect x="9" y="15" width="6" height="4" rx="0.8"/>
    <circle cx="12" cy="10" r="6"/>
  `) },
  abracadeira_nylon: { label: 'Abraçadeira de nylon', svg: _iconSvg(`
    <rect x="10" y="15" width="4" height="4" rx="0.6"/>
    <circle cx="12" cy="10" r="5"/><path d="M12 5V3"/>
  `) },
  // Eletrocalha: peça de tamanho fixo (comprimento padrão 2m, editável em `profundidade`), como qualquer objeto de catálogo.
  eletrocalha: { label: 'Eletrocalha', svg: _iconSvg(`
    <path d="M3 8h18M3 16h18M3 8v8M21 8v8"/>
    <path d="M7 11.5h10M7 13.5h10" stroke-dasharray="2 1.5"/>
  `) },
  // Leito aramado: peça de tamanho fixo (comprimento padrão 2m, editável em `profundidade`), como qualquer objeto de catálogo.
  leito: { label: 'Leito aramado', svg: _iconSvg(`
    <path d="M3 9h18v6H3z"/>
    <path d="M6 9v6M9 9v6M12 9v6M15 9v6M18 9v6"/>
  `) },
  // Canaleta PVC: peça de tamanho fixo (comprimento padrão 2m, editável em `profundidade`), como qualquer objeto de catálogo.
  canaleta: { label: 'Canaleta PVC', svg: _iconSvg(`
    <rect x="3" y="10" width="18" height="4" rx="0.8"/>
    <path d="M3 12h18" stroke-dasharray="1.5 1.5"/>
  `) },
  // Eletroduto: peça de tamanho fixo (comprimento padrão 2m, editável em `profundidade`), como qualquer objeto de catálogo.
  eletroduto: { label: 'Eletroduto', svg: _iconSvg(`
    <path d="M3 9.5h18M3 14.5h18"/>
    <path d="M3 9.5a2.5 2.5 0 0 0 0 5M21 9.5a2.5 2.5 0 0 1 0 5"/>
  `) },
  planta: { label: 'Planta / vaso', svg: _iconSvg(`
    <path d="M12 11v10"/>
    <path d="M12 11c0-3.5-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z"/>
    <path d="M12 11c0-4 2.8-6.5 6.5-6.5 0 4-2.8 6.5-6.5 6.5z"/>
    <path d="M8 21h8l-1-6H9z"/>
  `) },
  porta: { label: 'Porta', svg: _iconSvg(`
    <path d="M5 21V4a1 1 0 0 1 1-1h9v18"/>
    <path d="M5 21h13"/>
    <path d="M6 21V3l9 1.5V21"/>
    <circle cx="12.5" cy="12.5" r="0.7" fill="currentColor" stroke="none"/>
  `) },
  // [13/09/2026 UTC] TROCADO — pedido verbatim do usuário: "Na janela
  // 'Ferramentas', troque o ícone do objeto 'Janela' para um ícone
  // intuitivo (que faça lembrar que se trata de uma janela) e que não seja
  // igual ao objeto 'Piso'." O ícone anterior (retângulo + cruz central,
  // sem preenchimento) lia como um quadriculado genérico visto de cima —
  // MESMA família visual do ícone de 'piso' (retângulo + cruz, só que com
  // fundo preenchido, ver comentário grande de 'piso' logo abaixo), fácil
  // de confundir num relance. NOVO: vista em ELEVAÇÃO (de frente, como se
  // vê uma janela de verdade numa parede) — moldura com 4 vidraças (cruz),
  // um PEITORIL saliente na base (linha mais larga que a moldura, o detalhe
  // que só janela tem — piso não tem "peitoril") e um brilho diagonal
  // sugerindo vidro reflexivo — nada disso existe no ícone de 'piso' (visto
  // de CIMA, sem peitoril nem brilho).
  janela: { label: 'Janela', svg: _iconSvg(`
    <line x1="3" y1="20" x2="21" y2="20"/>
    <rect x="5.5" y="3.5" width="13" height="15" rx="0.6"/>
    <line x1="12" y1="3.5" x2="12" y2="18.5"/><line x1="5.5" y1="11" x2="18.5" y2="11"/>
    <line x1="7.5" y1="6" x2="10" y2="8.5" stroke-opacity="0.55"/>
  `) },
  'caixa-generica': { label: 'Caixa / objeto genérico', svg: _iconSvg(`
    <path d="M3 8l9-4 9 4-9 4-9-4z"/>
    <path d="M3 8v9l9 4 9-4V8"/><line x1="12" y1="12" x2="12" y2="21"/>
  `) },
  // [13/09/2026] AJUSTE — pedido verbatim do usuário: "O ícone do piso deve
  // ser intuitivo (deve trazer uma ideia de que se trata de um piso)." O
  // ícone anterior (retângulo cheio liso) foi trocado por um padrão de
  // lajotas 2x2 vistas de cima (mesma família visual do `teto-modular`
  // abaixo, que também usa grade — mas aqui SÓ 2x2, mais espaçado, e com
  // fundo levemente preenchido, pra ler como "piso lajotado" e não se
  // confundir com o teto modular, que é mais denso/sem preenchimento). Esta
  // entrada continua existindo em `MAP_OBJECT_EXTRAS` mesmo tendo saído do
  // catálogo "Objetos" (ver `mapObjectCatalog()` acima) por dois motivos: 1)
  // objetos 'piso' já colocados antes de o "Piso" ganhar ferramenta própria
  // continuam desenhando normalmente a partir daqui; 2) este `svg` é
  // reaproveitado como ícone do novo botão dedicado 'piso' em mapview.js
  // PTOOLS (mesmo esquema já usado para reaproveitar o ícone de 'janela').
  parede: { label: 'Parede', svg: _iconSvg(`
    <rect x="3" y="5" width="18" height="14" rx="1"/>
    <path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 9.7v4.6M9 14.3V19"/>
  `) },
  piso: { label: 'Piso (laje de andar)', svg: _iconSvg(`
    <rect x="3" y="3" width="18" height="18" rx="1" fill="currentColor" fill-opacity="0.12"/>
    <rect x="3" y="3" width="18" height="18" rx="1"/>
    <line x1="12" y1="3" x2="12" y2="21"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
  `) },
  // [13/09/2026] NOVO — "Teto modular" e "Teto de gesso" (pedido do
  // usuário: "chão lajotado, teto modular (escritórios), teto de gesso com
  // rodelas de acesso"). Os dois entram no catálogo normal, pra o
  // usuário conseguir colocá-los na cena como qualquer outro objeto comum
  // (mesmo raio-x/redimensionamento/edição de painel de um retângulo
  // qualquer). Ícone: grade de quadrados vista de cima (mesmo espírito
  // visual do padrão procedural de textura usado nos dois, ver
  // engine3d.js `_getProceduralFloorTexture`) — só muda o traço mais denso
  // (modular, quadrados menores) do mais esparso com um círculo central
  // (gesso, sugerindo UMA rodela de acesso).
  'teto-modular': { label: 'Teto modular (escritório)', svg: _iconSvg(`
    <rect x="3" y="3" width="18" height="18" rx="1"/>
    <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
    <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
  `) },
  'teto-gesso': { label: 'Teto de gesso (c/ rodelas de acesso)', svg: _iconSvg(`
    <rect x="3" y="3" width="18" height="18" rx="1"/>
    <circle cx="8" cy="8" r="1.4"/><circle cx="16" cy="8" r="1.4"/>
    <circle cx="8" cy="16" r="1.4"/><circle cx="16" cy="16" r="1.4"/>
  `) },
  // Luminária de teto (2 lâmpadas fluorescentes compridas) — pedido do
  // usuário ("faça uma luminária... 2 lâmpadas compridas... para deixar o
  // que está próximo mais claro"). Vista de cima (igual ao resto do mapa
  // 2D): a carcaça retangular com as 2 lâmpadas por dentro.
  luminaria: { label: 'Luminária (2 lâmpadas)', svg: _iconSvg(`
    <rect x="2" y="7" width="20" height="10" rx="1.4"/>
    <line x1="4.5" y1="10" x2="19.5" y2="10"/><line x1="4.5" y1="14" x2="19.5" y2="14"/>
  `) },
  // Relógio (de ponteiros/analógico — pedido do usuário, 26/08/2026: "Crie o
  // objeto relógio, ele exibe a hora da máquina em que o app roda"). Este
  // ícone aqui é só o desenho ESTÁTICO usado no catálogo/botão de escolher
  // objeto (mostrador parado, 10h10 — posição clássica de mostruário); o
  // objeto DE VERDADE, já colocado no mapa, mostra os ponteiros se movendo
  // com a hora ATUAL do aparelho — ver mapview.js Map2DRenderer._drawFormaShape
  // (`obj.tipo === 'relogio'`), que substitui este ícone parado por um
  // mostrador desenhado na hora, a cada quadro.
  relogio: { label: 'Relógio (mostra a hora do aparelho)', svg: _iconSvg(`
    <circle cx="12" cy="12" r="9"/>
    <line x1="12" y1="12" x2="12" y2="7"/>
    <line x1="12" y1="12" x2="15.2" y2="13.6"/>
    <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>
  `) },
  // NOVO (01/09/2026), item #11 do pedido de 12 itens, verbatim: "Faça um
  // novo objeto 3D, o poste de iluminação pública." Vista de cima (igual ao
  // resto do mapa 2D — mesmo raciocínio da luminária, acima): um círculo
  // (a haste, vista de topo) com raios de luz irradiando — símbolo
  // cartográfico clássico de poste de luz, distinto da luminária de teto
  // (retângulo com 2 lâmpadas) pra não confundir os dois no catálogo.
  poste: { label: 'Poste de iluminação pública', svg: _iconSvg(`
    <circle cx="12" cy="12" r="3.4"/>
    <line x1="12" y1="3" x2="12" y2="6.2"/>
    <line x1="12" y1="17.8" x2="12" y2="21"/>
    <line x1="3" y1="12" x2="6.2" y2="12"/>
    <line x1="17.8" y1="12" x2="21" y2="12"/>
    <line x1="6" y1="6" x2="8.1" y2="8.1"/>
    <line x1="15.9" y1="15.9" x2="18" y2="18"/>
    <line x1="18" y1="6" x2="15.9" y2="8.1"/>
    <line x1="8.1" y1="15.9" x2="6" y2="18"/>
  `) },
  // NOVO (01/09/2026), item GRANDE #9 do pedido de 12 itens, verbatim:
  // "Escadas e outros andares também [devem poder ser representados]" — ver
  // engine3d-profiles.js `OBJECT3D_PROFILES.escada`. Vista de cima clássica
  // de planta arquitetônica: degraus em "V" (linhas paralelas encurtando
  // até o topo) + uma seta indicando o sentido de subida.
  escada: { label: 'Escada', svg: _iconSvg(`
    <line x1="4" y1="20" x2="20" y2="4"/>
    <line x1="4" y1="20" x2="9" y2="20"/>
    <line x1="4" y1="15" x2="9" y2="15"/>
    <line x1="4" y1="10" x2="9" y2="10"/>
    <line x1="9" y1="20" x2="9" y2="15"/>
    <line x1="15" y1="9" x2="15" y2="4"/>
    <line x1="20" y1="9" x2="15" y2="9"/>
    <line x1="20" y1="4" x2="15" y2="4"/>
    <path d="M13 6 L16.5 3.2 L16 7.2 Z"/>
  `) },
  // [14/09/2026] NOVO — "Interruptor de luz" (ver engine3d-profiles.js
  // `OBJECT3D_PROFILES.interruptor`/assets/modelos/interruptor.model.js):
  // placa de parede + alavanca, ícone simples de interruptor.
  interruptor: { label: 'Interruptor', svg: _iconSvg(`
    <rect x="6" y="3" width="12" height="18" rx="1.4"/>
    <rect x="9.5" y="6.5" width="5" height="8" rx="1.2"/>
  `) },
  // [15/09/2026] NOVO — "quadro-parede" (quadro/pintura decorativo de
  // parede, ver engine3d-profiles.js OBJECT3D_PROFILES['quadro-parede']).
  // Vista de cima simples: moldura retangular + um "X" central sugerindo
  // uma pintura emoldurada (distinto do ícone do `quadro`/lousa acima, que
  // tem linhas de texto — este é decorativo, não de escrever).
  'quadro-parede': { label: 'Quadro de Parede', svg: _iconSvg(`
    <rect x="4" y="4" width="16" height="16" rx="1"/>
    <path d="M7 14l3.5-4.5L13 12.5l2-2.5L17 14"/>
    <circle cx="9.2" cy="8" r="1.1"/>
  `) },
  // [15/09/2026] NOVO — "quadro-mesa" (porta-retrato pequeno de mesa/
  // estante, ver engine3d-profiles.js OBJECT3D_PROFILES['quadro-mesa']).
  // Mesma ideia do ícone acima, só menor/mais "quadrado" e com um pezinho
  // de apoio na base — sugerindo o porta-retrato em pé sobre uma mesa,
  // distinto do `quadro-parede` (retangular, sem pé).
  'quadro-mesa': { label: 'Porta-retrato de Mesa', svg: _iconSvg(`
    <rect x="6" y="4" width="12" height="14" rx="1"/>
    <path d="M8.5 13l2.5-3 1.7 2 1.3-1.6L15.5 13"/>
    <circle cx="10" cy="7.5" r="0.9"/>
    <line x1="9" y1="20" x2="15" y2="20"/>
    <line x1="12" y1="18" x2="12" y2="20"/>
  `) },
  // [13/09/2026] NOVO — infraestrutura de robôs (limpeza/copa/
  // recepcionista, ver js/engine3d-profiles.js OBJECT3D_PROFILES.robo*).
  // Vista de cima simples: corpo circular (aspirador/robô de serviço) +
  // sensor/antena no centro.
  robo: { label: 'Robô (Base)', svg: _iconSvg(`
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
    <line x1="12" y1="3" x2="12" y2="5.5"/>
  `) },
  'robo-limpeza': { label: 'Robô de Limpeza', svg: _iconSvg(`
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
    <path d="M4 9 A9 9 0 0 1 20 9"/>
  `) },
  'robo-copa': { label: 'Robô de Copa', svg: _iconSvg(`
    <circle cx="12" cy="12" r="9"/>
    <rect x="9" y="8.5" width="6" height="7" rx="1"/>
  `) },
  'robo-recepcionista': { label: 'Robô Recepcionista', svg: _iconSvg(`
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
    <line x1="12" y1="3" x2="12" y2="5.5"/>
    <line x1="7.5" y1="4.5" x2="8.7" y2="6.6"/>
    <line x1="16.5" y1="4.5" x2="15.3" y2="6.6"/>
  `) },

  // [15/09/2026 UTC] NOVO — pedido verbatim do usuário: "Todos os objetos
  // que aparecem em 'Objetos'->'Acessar modelo' devem aparecer em
  // 'Objetos'. Cada um deve ter a sua representação 2D. Atualmente, há
  // objetos que aparecem em 'Acessar objetos' que não aparecem na lista de
  // objetos da janela da ferramenta 'Objstos'. Lista dos objetos que não
  // aparecem na janela 'Objetos': 'cafeteira', 'cancela-haste',
  // 'cancela-poste', 'carro', 'casa-robo', 'casa-robo-telhado',
  // 'disjuntor', 'elevador-botao-chamada', 'elevador-cabine',
  // 'interruptor-remoto', 'mictorio', 'pia', 'vaga-estacionamento' e
  // 'vaso-sanitario'. Todos eles, também, não tem uma representação 2D.
  // Devem tê-la." Estes 14 tipos já existiam em `OBJECT3D_PROFILES` (ver
  // js/engine3d-profiles.js — usados pelo catálogo "Acessar modelos", que
  // lista `Object.keys(OBJECT3D_PROFILES)`), mas NUNCA tinham entrada aqui
  // em `MAP_OBJECT_EXTRAS` — e como `Icons.mapObjectCatalog()` (grade da
  // janela "Objetos") e a "representação 2D" desenhada no mapa
  // (`Map2DRenderer._drawFormaShape` -> `_getIconImage` ->
  // `Icons.dataUrlForKey` -> `Icons.svgForAnyKey`, ver js/mapview.js) são
  // AMBOS resolvidos a partir de `ICON_LIBRARY`/`MAP_OBJECT_EXTRAS`, uma
  // única entrada aqui resolve as duas metades do pedido de uma vez: 1)
  // passam a aparecer na grade de "Objetos" e 2) ganham a mesma
  // "representação 2D" (ícone desenhado sobre o retângulo/forma do objeto
  // no mapa) que qualquer outro tipo já tem — sem precisar de nenhuma
  // função de desenho nova/separada (o mecanismo já é genérico, por SVG).
  // Vista de CIMA (planta), mesmo espírito de traço fino dos ícones acima.
  // Labels em português: usados o nome já citado no PEDIDO verbatim do
  // usuário quando havia um sugerido; nos demais, o nome mais claro/comum
  // do objeto (não havia nome "oficial" pré-existente em nenhum catálogo
  // pra estes 14 tipos — só a chave técnica em OBJECT3D_PROFILES).
  cafeteira: { label: 'Cafeteira', svg: _iconSvg(`
    <rect x="7" y="9" width="9" height="11" rx="1.4"/>
    <path d="M16 12h2.5a1.6 1.6 0 0 1 0 5H16"/>
    <path d="M9.5 9V6.5a2.5 2.5 0 0 1 5 0V9"/>
    <line x1="9.5" y1="13" x2="13.5" y2="13"/>
  `) },
  'vaso-sanitario': { label: 'Vaso Sanitário', svg: _iconSvg(`
    <rect x="7" y="3" width="7" height="4" rx="1"/>
    <path d="M6.5 9.5c0-1.4 1.6-2.5 5-2.5s5 1.1 5 2.5c0 6-2.2 10.5-5 10.5s-5-4.5-5-10.5z"/>
    <ellipse cx="11.5" cy="9.6" rx="4.6" ry="1.7"/>
  `) },
  mictorio: { label: 'Mictório', svg: _iconSvg(`
    <path d="M9 3h6v5.2c2 .6 3.2 2.4 3.2 4.8 0 3.6-2.7 8-6.2 8s-6.2-4.4-6.2-8c0-2.4 1.2-4.2 3.2-4.8V3z"/>
    <line x1="9" y1="6" x2="15" y2="6"/>
  `) },
  pia: { label: 'Pia', svg: _iconSvg(`
    <rect x="3" y="7" width="18" height="9" rx="1.4"/>
    <ellipse cx="12" cy="11.5" rx="6" ry="2.6"/>
    <line x1="12" y1="7" x2="12" y2="3.4"/>
    <path d="M9.5 3.4h5"/>
  `) },
  carro: { label: 'Carro', svg: _iconSvg(`
    <rect x="2.5" y="9" width="19" height="7" rx="2"/>
    <path d="M5.5 9l2-4.4h9l2 4.4"/>
    <line x1="9" y1="9" x2="9" y2="4.6"/>
    <line x1="15" y1="9" x2="15" y2="4.6"/>
    <circle cx="7" cy="16.5" r="1.6" fill="currentColor" stroke="none"/>
    <circle cx="17" cy="16.5" r="1.6" fill="currentColor" stroke="none"/>
  `) },
  'vaga-estacionamento': { label: 'Vaga de Estacionamento', svg: _iconSvg(`
    <rect x="3" y="3" width="18" height="18" rx="1" fill="currentColor" fill-opacity="0.08"/>
    <path d="M8 6v12"/>
    <path d="M16 6v12"/>
    <path d="M8 6h5a3 3 0 0 1 0 6H8"/>
  `) },
  'cancela-haste': { label: 'Cancela (Haste)', svg: _iconSvg(`
    <rect x="2" y="10.5" width="17" height="3" rx="1"/>
    <line x1="4" y1="12" x2="17" y2="12" stroke-dasharray="2 2"/>
    <rect x="19" y="4" width="2.4" height="16" rx="1"/>
  `) },
  'cancela-poste': { label: 'Cancela (Poste)', svg: _iconSvg(`
    <circle cx="12" cy="12" r="3.2"/>
    <line x1="12" y1="3" x2="12" y2="8.4"/>
    <line x1="12" y1="15.6" x2="12" y2="21"/>
    <line x1="3" y1="12" x2="8.4" y2="12"/>
    <line x1="15.6" y1="12" x2="21" y2="12"/>
  `) },
  'elevador-cabine': { label: 'Cabine do Elevador', svg: _iconSvg(`
    <rect x="4" y="3" width="16" height="18" rx="1"/>
    <line x1="12" y1="3" x2="12" y2="21"/>
    <path d="M8 8l-1.6 4L8 16"/>
    <path d="M16 8l1.6 4L16 16"/>
  `) },
  'elevador-botao-chamada': { label: 'Botão de Chamada do Elevador', svg: _iconSvg(`
    <rect x="5" y="3" width="14" height="18" rx="1.4"/>
    <circle cx="12" cy="9.5" r="2.6"/>
    <path d="M9.6 15.5l2.4-2.6 2.4 2.6"/>
  `) },
  disjuntor: { label: 'Disjuntor', svg: _iconSvg(`
    <rect x="4" y="3" width="16" height="18" rx="1.2"/>
    <rect x="7" y="6" width="4" height="6" rx="0.8"/>
    <rect x="13" y="6" width="4" height="6" rx="0.8"/>
    <line x1="9" y1="16" x2="9" y2="18.4"/>
    <line x1="15" y1="16" x2="15" y2="18.4"/>
  `) },
  'interruptor-remoto': { label: 'Interruptor Remoto', svg: _iconSvg(`
    <rect x="6" y="3" width="12" height="18" rx="1.4"/>
    <rect x="9.5" y="6.5" width="5" height="8" rx="1.2"/>
    <path d="M16.5 4.2l1.8-1.8"/>
    <path d="M18.5 6.2l2-1"/>
  `) },
  'casa-robo': { label: 'Casa do Robô', svg: _iconSvg(`
    <rect x="4" y="11" width="16" height="9" rx="1"/>
    <path d="M3 12l9-8 9 8"/>
    <rect x="9.5" y="14.5" width="5" height="5.5"/>
  `) },
  'casa-robo-telhado': { label: 'Casa do Robô (Telhado)', svg: _iconSvg(`
    <path d="M2.5 13l9.5-9.5 9.5 9.5"/>
    <path d="M5.5 12.5v3.5l6.5 3.5 6.5-3.5v-3.5"/>
  `) },
};
 
const Icons = {
  LIBRARY: ICON_LIBRARY,
  DEFAULT_ALIASES: ICON_DEFAULT_ALIASES,
  GENERIC_SVG: ICON_GENERIC_SVG,
  SVG_WIFI_DEVICES,
  MAP_OBJECT_EXTRAS,
  ENABLED_KEY: 'iconesSvgAtivo',
  REMOTE_KEY: 'iconesSvgBaixarInternet',
  ALIASES_KEY: 'iconesSvgAliases',
  CACHE_KEY: 'iconesSvgBaixados',
  FALLBACK_KEY: 'iconesSvgFallback',
  FALLBACK_DESCRITIVO: 'descritivo',
  FALLBACK_PADRAO: 'padrao',
 
  /** minúsculas, sem acento, só letras/números/espaço/hífen — pra comparar de forma tolerante. */
  normalize(s) {
    return (s || '').toString().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  },
 
  async isEnabled() {
    try { return !!(await window.DB?.getSetting?.(this.ENABLED_KEY, true)); } catch (e) { return true; }
  },
  async setEnabled(v) { try { await window.DB?.setSetting?.(this.ENABLED_KEY, !!v); } catch (e) { /* ignora */ } },
 
  async remoteEnabled() {
    try { return !!(await window.DB?.getSetting?.(this.REMOTE_KEY, false)); } catch (e) { return false; }
  },
  async setRemoteEnabled(v) { try { await window.DB?.setSetting?.(this.REMOTE_KEY, !!v); } catch (e) { /* ignora */ } },
 
  /** O que usar quando "Usar ícones prontos" está ativo mas nenhum ícone
   *  específico bateu com o tipo/descrição: 'descritivo' (padrão — iniciais +
   *  formas geométricas, igual à opção desativada) ou 'padrao' (a caixa
   *  genérica). */
  async getFallbackMode() {
    try {
      const v = await window.DB?.getSetting?.(this.FALLBACK_KEY, this.FALLBACK_DESCRITIVO);
      return v === this.FALLBACK_PADRAO ? this.FALLBACK_PADRAO : this.FALLBACK_DESCRITIVO;
    } catch (e) { return this.FALLBACK_DESCRITIVO; }
  },
  async setFallbackMode(v) {
    try { await window.DB?.setSetting?.(this.FALLBACK_KEY, v === this.FALLBACK_PADRAO ? this.FALLBACK_PADRAO : this.FALLBACK_DESCRITIVO); } catch (e) { /* ignora */ }
  },
 
  /** Palavras-chave por ícone: as salvas nas Configurações substituem as
   *  padrão (ícone por ícone) — os ícones sem override continuam com o padrão. */
  async getAliases() {
    let saved = {};
    try { saved = (await window.DB?.getSetting?.(this.ALIASES_KEY, {})) || {}; } catch (e) { /* usa só o padrão */ }
    const out = {};
    Object.keys(this.DEFAULT_ALIASES).forEach((k) => {
      out[k] = Array.isArray(saved[k]) ? saved[k] : this.DEFAULT_ALIASES[k];
    });
    return out;
  },
 
  textToAliases(txt) {
    return (txt || '').split(',').map((s) => this.normalize(s)).filter(Boolean);
  },
  aliasesToText(arr) { return (arr || []).join(', '); },
 
  async setAliasesForKey(key, textoOuLista) {
    const arr = Array.isArray(textoOuLista) ? textoOuLista.map((s) => this.normalize(s)).filter(Boolean) : this.textToAliases(textoOuLista);
    let saved = {};
    try { saved = (await window.DB?.getSetting?.(this.ALIASES_KEY, {})) || {}; } catch (e) { /* recomeça do zero */ }
    saved[key] = arr;
    await window.DB?.setSetting?.(this.ALIASES_KEY, saved);
  },
 
  /** Restaura as palavras-chave de TODOS os ícones para o padrão de fábrica. */
  async resetAliases() { try { await window.DB?.setSetting?.(this.ALIASES_KEY, {}); } catch (e) { /* ignora */ } },
 
  /**
   * Acha o ícone local cuja lista de palavras-chave bate com o texto (tipo/
   * descrição). A comparação é por PALAVRA(S) INTEIRA(S), com espaço nos dois
   * lados (não é um "includes" cru) — sem isso, uma palavra-chave curta podia
   * bater por acidente DENTRO de outra palavra (ex: o alias "rato" do ícone
   * de mouse batendo com "giRATOria" em "cadeira giratória azul", escondendo
   * o ícone certo de cadeira).
   */
  async matchByTipo(texto) {
    return this.matchByTipoSync(texto, await this.getAliases());
  },

  /** Núcleo síncrono de matchByTipo — usado por quem já tem os aliases
   *  carregados de antemão (ver avatar.js Avatar.resolveIcon), pra desenhar
   *  uma lista inteira de itens sem uma ida ao banco por item. */
  matchByTipoSync(texto, aliases) {
    const norm = this.normalize(texto);
    if (!norm) return null;
    const normEspacado = ` ${norm} `;
    for (const key of Object.keys(this.LIBRARY)) {
      const lista = (aliases && aliases[key]) || [];
      for (const alias of lista) {
        if (alias && normEspacado.includes(` ${alias} `)) return key;
      }
    }
    return null;
  },

  /** Cache de ícones já baixados da internet (ver _fetchRemoteIcon), pronta
   *  pra usar em Avatar.loadIconState — o mesmo dado que _fetchRemoteIcon já
   *  lê/grava, só exposto aqui pra quem for montar o `iconState` de uma vez. */
  async getRemoteIconCache() {
    try { return (await window.DB?.getSetting?.(this.CACHE_KEY, {})) || {}; } catch (e) { return {}; }
  },
 
  svgForKey(key) { return this.LIBRARY[key]?.svg || null; },
 
  /** Igual a svgForKey, mas também busca nos ícones extras só-de-mapa
   *  (MAP_OBJECT_EXTRAS) — usado pelos "objetos" do mapa 2D/3D, que podem ser
   *  um tipo de item comum (ex: "mesa") OU um dos extras (ex: "coluna"). */
  svgForAnyKey(key) { return this.LIBRARY[key]?.svg || this.MAP_OBJECT_EXTRAS[key]?.svg || null; },
  labelForAnyKey(key) { return this.LIBRARY[key]?.label || this.MAP_OBJECT_EXTRAS[key]?.label || key; },
 
  /** Catálogo de objetos que dá para colocar no mapa 2D (e que ganham um
   *  correspondente simples em 3D, ver engine3d.js): os mesmos ícones dos
   *  tipos de item (quando fizer sentido como objeto de planta) mais os
   *  extras só-de-mapa (coluna, planta, porta, janela, caixa genérica). */
  mapObjectCatalog() {
    const out = [];
    // [15/09/2026 UTC] 'mesa' DE VOLTA — pedido verbatim (rodada seguinte à
    // que a excluiu): "faça dois novos objetos: 'Mesa' e 'Pilar' [...]
    // Agora não tem mais o gizmo integrado, é só um objeto comum tanto
    // para o pilar quanto para a mesa." Volta a ser um objeto de catálogo
    // comum igual qualquer outro (ver `OBJECT3D_PROFILES.mesa`/
    // `_buildMesaMesh`, engine3d.js) — sem o mecanismo de "forma com
    // gizmo"/`_MESA_FORMA_DEF` de antes (removido, não volta).
    // [18/09/2026 UTC] RODADA 166 -- 'switch' ("Switch / roteador") SAIU da grade: virou dois
    // objetos independentes, "Switch de 24 portas" e "Switch de 48 portas" (MAP_OBJECT_EXTRAS).
    Object.keys(this.LIBRARY).filter((key) => key !== 'switch').forEach((key) => out.push({ key, label: this.LIBRARY[key].label, svg: this.LIBRARY[key].svg }));
    // 'porta'/'janela' SAÍRAM daqui (pedido do usuário: "como porta e janela
    // têm ferramentas separadas, as que estão ali dentro dos objetos deve
    // ser eliminada") — já existem como ferramentas dedicadas (🚪 Porta / 🪟
    // Janela, ver mapview.js PTOOLS), que fazem muito mais (encaixe na
    // parede, tipo/dimensões/dobradiça, etc.) do que o objeto genérico de
    // ícone fixo que havia aqui; duplicar não fazia sentido. As entradas em
    // si continuam existindo em MAP_OBJECT_EXTRAS (não apagadas) só pra: 1)
    // objetos JÁ colocados por essa via antes desta mudança continuarem
    // desenhando normalmente; 2) o ícone de janela poder ser reaproveitado
    // como ícone da própria ferramenta "Janela" (pedido do usuário —
    // "aproveite apenas o ícone da janela" — ver mapview.js PTOOLS).
    // [13/09/2026] NOVO — 'piso' SAIU daqui também (mesmo raciocínio de porta/
    // janela acima): pedido do usuário para dar ao "Piso" sua própria
    // ferramenta dedicada no toolbar (ver mapview.js PTOOLS, id 'piso'), que
    // faz uma colocação simples (sem raio-x de parede) de uma laje 10x10m —
    // duplicar como item solto dentro de "Objetos" não fazia mais sentido. A
    // entrada em MAP_OBJECT_EXTRAS.piso continua existindo (não apagada) só
    // pra objetos já colocados antes desta mudança continuarem desenhando, e
    // pro ícone poder ser reaproveitado pelo botão da nova ferramenta.
    Object.keys(this.MAP_OBJECT_EXTRAS)
      // [15/09/2026 UTC] 'coluna' ACRESCENTADO ao filtro — pedido verbatim:
      // "Remova os objetos 'Mesa' e 'Coluna / Pilar' do app [...] não há a
      // preocupação de quebrar mapas legados." MESMO tratamento já dado a
      // porta/janela/piso (comentário grande logo acima) — a entrada em
      // MAP_OBJECT_EXTRAS.coluna fica, só sai da grade de escolha (não pode
      // mais ser colocada); como o pedido dispensa compatibilidade com mapas
      // antigos, os pontos que ainda desenhavam/tratavam 'coluna'/'mesa'
      // especificamente foram removidos à parte (ver mapview.js
      // _MESA_FORMA_DEF/_PILAR_FORMA_DEF, engine3d.js/engine3d-profiles.js).
      // [15/09/2026 UTC] 'coluna' continua fora (substituída por 'pilar',
      // objeto comum retangular novo, incluído normalmente abaixo por não
      // estar nesta lista de exclusão).
      .filter((key) => key !== 'porta' && key !== 'janela' && key !== 'piso' && key !== 'parede' && key !== 'coluna')
      .forEach((key) => out.push({ key, label: this.MAP_OBJECT_EXTRAS[key].label, svg: this.MAP_OBJECT_EXTRAS[key].svg }));
    // Objetos excluídos em "Acessar modelos" (Set preenchido por Modelos3DView._carregarExcluidos) somem do catálogo.
    const exc = this._objetosExcluidos;
    return exc && exc.size ? out.filter((o) => !exc.has(o.key)) : out;
  },
 
  /** Elementos que são criados por FERRAMENTAS próprias do Mapa 2D (Porta, Janela, Piso, Parede) e que também
   *  aparecem no catálogo de objetos ("Objetos" e "Acessar modelos"): clicar num deles ativa a ferramenta
   *  correspondente em vez de escolher um carimbo. Mesmo formato de `mapObjectCatalog()`, com `ferramenta: true`. */
  ferramentaCatalog() {
    const out = [
      { key: 'porta', label: this.MAP_OBJECT_EXTRAS.porta.label, svg: this.MAP_OBJECT_EXTRAS.porta.svg },
      { key: 'janela', label: this.MAP_OBJECT_EXTRAS.janela.label, svg: this.MAP_OBJECT_EXTRAS.janela.svg },
      { key: 'piso', label: 'Piso', svg: this.MAP_OBJECT_EXTRAS.piso.svg },
      { key: 'parede', label: 'Parede', svg: this.MAP_OBJECT_EXTRAS.parede.svg },
    ].map((o) => Object.assign(o, { ferramenta: true }));
    const exc = this._objetosExcluidos;
    return exc && exc.size ? out.filter((o) => !exc.has(o.key)) : out;
  },

  /** Converte um ícone (por key) numa data URL utilizável em <img>/drawImage
   *  no canvas — troca "currentColor" (que só funciona dentro do CSS de uma
   *  página, não dentro de uma imagem standalone) pela cor explícita pedida. */
  dataUrlForKey(key, color = '#dfe6f2') {
    const svg = this.svgForAnyKey(key);
    if (!svg) return null;
    const recolorido = svg.replaceAll('currentColor', color);
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(recolorido);
  },
 
  /** Ícone genérico (caixa/pacote) usado quando a opção está ativa mas nenhuma
   *  palavra-chave bateu com o tipo/descrição — ver ICON_GENERIC_SVG acima. */
  defaultSvg() { return this.GENERIC_SVG; },
 
  _slugsFrom(texto) {
    const norm = this.normalize(texto);
    const palavras = norm.split(' ').filter((w) => w.length > 2 && !['de', 'da', 'do', 'com', 'para', 'sem'].includes(w));
    const candidatos = [];
    if (palavras.length) candidatos.push(palavras.join('-'));
    palavras.forEach((w) => candidatos.push(w));
    return Array.from(new Set(candidatos)).slice(0, 4);
  },
 
  _timeoutSignal(ms) {
    try { return AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined; } catch (e) { return undefined; }
  },
 
  /**
   * Tenta baixar um ícone gratuito compatível com o texto num repositório
   * público (Iconify — sem chave, sem cadastro). Guarda em cache (Configurações)
   * pra não tentar de novo o mesmo texto. Devolve null se não achar nada — quem
   * chamou decide o que registrar no log de eventos.
   */
  async _fetchRemoteIcon(texto) {
    const chaveCache = this.normalize(texto);
    let cache = {};
    try { cache = (await window.DB?.getSetting?.(this.CACHE_KEY, {})) || {}; } catch (e) { /* segue sem cache */ }
    if (cache[chaveCache]) return cache[chaveCache];
 
    const slugs = this._slugsFrom(texto);
    for (const slug of slugs) {
      for (const prefixo of ['mdi', 'material-symbols']) {
        try {
          const url = `https://api.iconify.design/${prefixo}:${slug}.svg`;
          const res = await fetch(url, { signal: this._timeoutSignal(4000) });
          if (!res.ok) continue;
          const svgTxt = (await res.text()).trim();
          if (!svgTxt.startsWith('<svg')) continue;
          const recolorido = svgTxt.replace('<svg ', '<svg fill="currentColor" ');
          cache[chaveCache] = recolorido;
          try { await window.DB?.setSetting?.(this.CACHE_KEY, cache); } catch (e) { /* ignora falha ao salvar cache */ }
          return recolorido;
        } catch (e) { /* tenta o próximo candidato */ }
      }
    }
    return null;
  },
 
  /**
   * Chamado DEPOIS de um item já ter sido salvo (não bloqueia o botão
   * "Salvar" — a busca na internet roda em segundo plano). Só age quando: a
   * opção de baixar da internet está ativa, e nenhum ícone local já bateu
   * com o tipo/descrição. Sucesso só GRAVA o SVG no cache de ícones baixados
   * (ver getRemoteIconCache/_fetchRemoteIcon) — o item em si não guarda mais
   * nada (o ícone é desenhado em tempo de execução, ver avatar.js); por
   * isso, depois de cachear, só precisa mandar a tela atual redesenhar pra
   * já aparecer. Falha (ou nada encontrado) só fica no log.
   */
  async maybeEnrichWithRemoteIcon(item) {
    try {
      if (!item) return;
      if (!(await this.isEnabled())) return;
      if (!(await this.remoteEnabled())) return;
      const texto = (item.descricao || item.tipo || '').trim();
      if (!texto) return;
      // Considera tipo + descrição juntos pra decidir se já tem ícone local
      // (não só o campo usado pra gerar o texto de busca abaixo) — evita ir
      // buscar na internet quando o tipo sozinho já bate com um ícone pronto.
      const textoCombinado = [item.tipo, item.descricao].filter(Boolean).join(' ');
      if (await this.matchByTipo(textoCombinado)) return; // já tem ícone local, não precisa de internet

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        window.EventLog?.log?.(`Ícone: sem conexão com a internet — não tentou buscar ícone para "${texto}".`, { tipo: 'aviso' });
        return;
      }

      const svg = await this._fetchRemoteIcon(texto);
      if (!svg) {
        window.EventLog?.log?.(`Ícone: nenhum ícone gratuito encontrado na internet para "${texto}".`, { tipo: 'aviso' });
        return;
      }
      window.App?._refreshCurrentView?.();
      window.EventLog?.log?.(`Ícone baixado da internet e aplicado ao item "${texto}".`, { tipo: 'ok' });
    } catch (e) {
      window.EventLog?.log?.(`Ícone: falha ao tentar buscar ícone na internet para "${item?.descricao || item?.tipo || '(sem texto)'}": ${e?.message || e}`, { tipo: 'erro' });
    }
  },
};
 
window.Icons = Icons;