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
  janela: { label: 'Janela', svg: _iconSvg(`
    <rect x="4" y="4" width="16" height="16" rx="1"/>
    <line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/>
  `) },
  'caixa-generica': { label: 'Caixa / objeto genérico', svg: _iconSvg(`
    <path d="M3 8l9-4 9 4-9 4-9-4z"/>
    <path d="M3 8v9l9 4 9-4V8"/><line x1="12" y1="12" x2="12" y2="21"/>
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
    Object.keys(this.LIBRARY).forEach((key) => out.push({ key, label: this.LIBRARY[key].label, svg: this.LIBRARY[key].svg }));
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
    Object.keys(this.MAP_OBJECT_EXTRAS)
      .filter((key) => key !== 'porta' && key !== 'janela')
      .forEach((key) => out.push({ key, label: this.MAP_OBJECT_EXTRAS[key].label, svg: this.MAP_OBJECT_EXTRAS[key].svg }));
    return out;
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