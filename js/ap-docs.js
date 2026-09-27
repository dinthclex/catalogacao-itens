/**
 * ap-docs.js — [24/09/2026] NOVO
 *
 * Pedido verbatim: "Faça um botão de documentação do AP explicando as funcionalidades com
 * renderizações também e coloque como um botão. Ao clicar neste botão, abre-se uma janela com as
 * informações da documentação. Deve estar presente nas 'configurações 3D' e na janela do AP. Não
 * precisa colocar na janelinha do AP. A implementação deve ser como foi feito nas 'configurações 2D',
 * na seção '🔌 Infraestrutura de rede'."
 *
 * Janela de DOCUMENTACAO (sem nenhum campo de configuracao): `ApDocs.abrir()` — mesmo padrão de
 * js/rede-docs.js (RedeDocs.abrir), reaproveitando a mesma estrutura de modal/handle/chips/seções.
 * Em vez de renderizações 3D (rede-docs.js usa RedeEquipView3D), aqui as ilustrações são diagramas
 * SVG simples e estáticos (raio direto, refletido e refratado) — mais adequados a este conteúdo, que
 * é sobre COMO o raycast do sinal Wi-Fi se comporta, não sobre a aparência 3D de um objeto do catálogo.
 * Textos das opções copiados/adaptados literalmente dos `title=` (tooltips) já escritos em
 * js/view3d-rede.js (_wfNiveisHtml, _wfMalhaNiveisHtml, _wfAvancadaHtml, _wfConfigApHtml), pra manter
 * a mesma linguagem/precisão usada nos controles de verdade.
 * Módulo UMD (window.ApDocs / module.exports), igual a rede-docs.js.
 */
(function (raiz) {
  'use strict';

  const _esc = (s) => (raiz.Utils && raiz.Utils.escapeHtml) ? raiz.Utils.escapeHtml(String(s)) : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _lista = (arr) => '<ul style="margin:4px 0 8px; padding-left:18px">' + arr.map((x) => '<li>' + _esc(x) + '</li>').join('') + '</ul>';

  // ==========================================================================
  // 1) ILUSTRAÇÕES (SVG estático — direto / refletido / refratado)
  // ==========================================================================
  /** Diagrama comum: um AP (triângulo) à esquerda, uma parede (retângulo cinza) no meio, e um "receptor"
   *  (ponto) à direita. `variante` decide o caminho do raio: 'direto' (sem parede no caminho, vai reto
   *  até o receptor), 'refletido' (bate na parede e volta, sem atravessar) ou 'refratado' (atravessa a
   *  parede com um pequeno deslocamento lateral ao entrar/sair, como a luz na água). */
  function _svgRaio(variante) {
    const apX = 24, apY = 70, wallX = 150, wallW = 14, wallTop = 20, wallBot = 120, rxDireto = { x: 270, y: 70 }, rxRefl = { x: 60, y: 20 }, rxRefr = { x: 270, y: 78 };
    const cor = variante === 'refletido' ? '#ef4444' : (variante === 'refratado' ? '#facc15' : '#22c55e');
    let raioPath = '';
    let rxPonto = rxDireto;
    let extra = '';
    if (variante === 'direto') {
      raioPath = `M ${apX + 10} ${apY} L ${rxDireto.x} ${rxDireto.y}`;
    } else if (variante === 'refletido') {
      // Raio sobe, bate na FACE esquerda da parede e volta (ricocheteia) — não atravessa.
      raioPath = `M ${apX + 10} ${apY} L ${wallX} 40 L ${rxRefl.x} ${rxRefl.y}`;
      rxPonto = rxRefl;
    } else {
      // Raio atravessa a parede com leve deslocamento (refração) ao entrar e ao sair.
      raioPath = `M ${apX + 10} ${apY} L ${wallX} 72 L ${wallX + wallW} 84 L ${rxRefr.x} ${rxRefr.y}`;
      rxPonto = rxRefr;
      extra = `<line x1="${wallX}" y1="60" x2="${wallX}" y2="90" stroke="#facc15" stroke-width="1" stroke-dasharray="2,2" opacity="0.5"/>`;
    }
    return `<svg width="280" height="140" viewBox="0 0 280 140" style="background:rgba(255,255,255,0.04); border-radius:8px">
      <!-- parede -->
      <rect x="${wallX}" y="${wallTop}" width="${wallW}" height="${wallBot - wallTop}" fill="#6b7280" opacity="0.55"/>
      <!-- AP (triângulo estilizado, sinal saindo pela frente) -->
      <g transform="translate(${apX},${apY})">
        <circle r="7" fill="#3ecb6e"/>
        <path d="M -3 -10 L -3 10 L 12 0 Z" fill="#3ecb6e" opacity="0.8"/>
        <text x="-16" y="26" font-size="9" fill="currentColor" opacity="0.7">AP</text>
      </g>
      <!-- receptor -->
      <g transform="translate(${rxPonto.x},${rxPonto.y})">
        <circle r="5" fill="${cor}"/>
        <!-- [26/09/2026] CORRIGIDO -- pedido verbatim: "Na documentação do Acess Point (AP), em duas renderizaçãoes ('Raio direto (sempre existe)' e 'Raio refratado (refração — só na varredura avançada)') aparece 'rece' (acho que o texto ficou cortado)." — o receptor fica em x=270 (borda do SVG de 280px); o rótulo agora é ancorado pelo FIM (text-anchor=end), crescendo para a esquerda. -->
        <text x="${variante === 'refletido' ? -8 : 6}" y="-10" font-size="9" fill="currentColor" opacity="0.7" text-anchor="${variante === 'refletido' ? 'start' : 'end'}">${variante === 'refletido' ? 'volta' : 'recebe'}</text>
      </g>
      ${extra}
      <path d="${raioPath}" fill="none" stroke="${cor}" stroke-width="2" stroke-dasharray="${variante === 'direto' ? 'none' : '5,3'}"/>
    </svg>`;
  }

  const ILUSTRACOES = [
    { id: 'direto', titulo: 'Raio direto (sempre existe)', variante: 'direto',
      texto: 'O raio sai do AP e vai direto até o ponto medido, perdendo potência com a distância. Se um obstáculo estiver no caminho, o raio sempre o ATRAVESSA (penetração), perdendo potência extra conforme o material — esse é o comportamento-base da varredura normal e da avançada.' },
    { id: 'refletido', titulo: 'Raio refletido (reflexão — só na varredura avançada)', variante: 'refletido',
      texto: 'Com "reflexão" ativada, além de atravessar a superfície (penetração, sempre ativa), o raio também "quica" de volta ao ambiente (ângulo de saída = ângulo de entrada, espelhado pela normal da superfície), com a perda de reflexão do material daquela superfície. Cada raio pode ricochetear várias vezes seguidas (limite configurável em "Máx. de reflexões por raio").' },
    { id: 'refratado', titulo: 'Raio refratado (refração — só na varredura avançada)', variante: 'refratado',
      texto: 'Com "refração" ativada, o raio que atravessa uma parede/objeto dobra pela lei de Snell ao entrar e ao sair (deslocamento lateral, como a luz na água), em vez de seguir reto — além da perda de penetração normal. Cada raio pode atravessar várias paredes/objetos seguidos (limite configurável em "Máx. de refrações por raio").' },
  ];

  // ==========================================================================
  // 2) CONTEÚDO — SEÇÕES DE OPÇÕES (textos adaptados dos title= de view3d-rede.js)
  // ==========================================================================
  const SECOES = [
    { id: 'varreduras', icone: '📶', nome: 'As duas varreduras (normal e avançada)',
      itens: [
        'Varredura normal: lança raios do AP em todas as direções (dentro do padrão semi-direcional do equipamento) e calcula onde o sinal atravessa cada obstáculo (penetração), sem reflexão nem refração — resultado em 5 níveis de cor, do vermelho (fraco) ao verde (excelente).',
        'Varredura avançada: usa a MESMA Faixa, Potência, Densidade, Limiar e Modo de malha da varredura normal, mas acrescenta reflexão e/ou refração (ver ilustrações acima). Com as duas desligadas, o resultado é idêntico ao da varredura normal.',
        'As duas varreduras coexistem — dá pra ligar/desligar cada mapa de calor independentemente e comparar.',
      ] },
    { id: 'reflexao-refracao', icone: '↩↪', nome: 'Reflexão, refração e seus limites (varredura avançada)',
      itens: [
        'Reflexão: ativa os raios REFLETIDOS. Pode ser ligada/desligada a qualquer momento DEPOIS da varredura, sem refazer o raycast — só refiltra o resultado já calculado.',
        'Máx. de reflexões por raio: quantas vezes seguidas um mesmo raio pode ricochetear numa superfície antes de parar (0 a 6; padrão 6). Não conta penetrações/refrações, só reflexões — é um limite de segurança contra loop infinito (o raio já para sozinho antes disso se a potência cair abaixo do Limiar em dBm). Vale a partir da próxima varredura avançada.',
        'Refração: ativa o desvio do raio (lei de Snell) ao atravessar paredes/objetos. Também pode ser ligada/desligada a qualquer momento depois da varredura, sem refazer o raycast.',
        'Máx. de refrações por raio: quantas paredes/objetos seguidos um mesmo raio pode atravessar antes de parar (0 a 8; padrão 4). Mesma lógica de limite de segurança da reflexão. Vale a partir da próxima varredura avançada.',
      ] },
    { id: 'malha-pontos-raios', icone: '🧊', nome: 'Superfície da malha, pontos e raios do raycaster',
      itens: [
        'Superfície da malha (por nível): ativa/desativa a superfície 3D de cada nível de sinal individualmente (nível 0/"fraco" = casca mais externa, os demais ficam por dentro dela). Pode ser desenhada em wireframe (linhas) em vez de sólida.',
        'Pontos do raycaster (por nível): mostra/esconde os pontos 3D onde os raios da varredura bateram, separados por nível de sinal.',
        'Raios do raycaster: mostra/esconde as linhas 3D dos próprios raios da varredura, também separadas por nível de sinal — cada parte (cada nível) pode ser ativada individualmente.',
        'Modo dos pontos/raios/malha: "Alcance (borda de nível)" — pontos, raios e a malha vão até a borda de alcance do nível, exista ou não parede ali (comportamento de sempre); "Colisão real" — só aparecem onde o raycaster realmente bateu numa superfície dentro da faixa daquele nível.',
        'Extensão dos raios/malha: "Por nível (fatiado)" — cada raio vai só da borda interna até a externa daquele nível; "Completo" — cada raio vai da origem do AP até a extremidade externa daquele nível (com Colisão real, a malha fica contínua, sem furos).',
      ] },
    // [25/09/2026] NOVO -- decisão verbatim do usuário: "Sobre o Access Point (IGNORAR_PERTO = 0.03), deve ignorar
    // a caixa 3D do AP, sim. Está informação deve ficar em algum lugar, também na documentação do AP."
    { id: 'ignora', icone: '📦', nome: 'O que o raio ignora ao sair do AP',
      itens: [
        'A caixa 3D do próprio Access Point é sempre ignorada: os raios nascem dentro dela e saem sem colidir, perder potência, refletir nem refratar nela. Isso vale para as duas varreduras (normal e avançada) e para o mapa 2D.',
        'Qualquer outra superfície, por mais perto que esteja do AP, conta normalmente: uma viga, laje, parede ou objeto encostado no AP (mesmo a poucos milímetros) causa perda por penetração e, na varredura avançada, reflexão/refração.',
        'Antes, tudo o que estivesse a menos de 3 cm da origem do AP era ignorado, e isso escondia reflexões numa viga ou laje colada no AP. Agora sobra só uma tolerância numérica de 1 mm na origem, usada para evitar que o raio colida com o próprio ponto de saída.',
      ] },
    { id: 'config-ap', icone: '⚙️', nome: 'Configurações do Access Point',
      itens: [
        'Manter a varredura normal/avançada anterior visível ao fazer uma nova: desligado (padrão) — a varredura anterior some assim que a nova começa; ligado — a anterior continua na tela até a nova terminar de rodar, útil pra comparar/acompanhar sem a tela ficar vazia durante a varredura.',
        'Desligar o mapa de calor ao sair do "Ver em 3D": desligado (padrão) — o mapa de calor de cada AP (normal e avançado) volta a aparecer sozinho ao reentrar, se já tiver sido feito e "mostrar mapa" estiver marcado; ligado — ao fechar o "Ver em 3D", o mapa de calor de TODO Access Point é desligado. Vale para as duas varreduras.',
        'Ao reentrar no "Ver em 3D": duas opções mutuamente exclusivas — "Refazer Varredura de Sinal ao entrar" (todo AP com mapa ativo refaz o raycast do zero, mais lento, mas reflete mudanças na cena desde a última varredura) ou "Manter a Varredura Anterior" (reaproveita a varredura já calculada, reabre na hora, mas não reflete mudanças feitas desde então — habilitada por padrão). Vale para as duas varreduras.',
        'As opções desta seção valem para TODOS os Access Points do mapa (não só o AP aberto no momento) — por isso aparecem tanto na janela de cada AP quanto nas "Configurações 3D".',
      ] },
  ];

  // ==========================================================================
  // 3) JANELA
  // ==========================================================================
  function html() {
    const chips = SECOES.map((s) => `<a href="#ad-g-${s.id}" data-ad-go="ad-g-${s.id}" style="display:inline-block; padding:3px 9px; margin:2px; border-radius:12px; background:rgba(255,255,255,0.07); font-size:12px; text-decoration:none; color:inherit">${s.icone} ${_esc(s.nome.split(' (')[0])}</a>`).join('');
    const ilustracoesHtml = '<div style="display:flex; gap:14px; flex-wrap:wrap; margin:8px 0 16px">' + ILUSTRACOES.map((i) => `
      <div style="flex:1 1 260px; min-width:240px; border:1px solid var(--border); border-radius:10px; padding:10px; background:rgba(255,255,255,0.03)">
        <div style="font-weight:600; font-size:13px; margin-bottom:6px">${_esc(i.titulo)}</div>
        ${_svgRaio(i.variante)}
        <div style="font-size:12px; color:var(--text-dim); margin-top:6px; line-height:1.5">${_esc(i.texto)}</div>
      </div>`).join('') + '</div>';
    const secoesHtml = SECOES.map((s) => `<h4 id="ad-g-${s.id}" style="margin:16px 0 8px">${s.icone} ${_esc(s.nome)}</h4>${_lista(s.itens)}`).join('');
    return `<div class="modal-sheet" style="max-width:820px; max-height:88vh; overflow:auto">
      <div class="handle"></div>
      <div style="position:sticky; top:-16px; z-index:2; background:var(--bg-elev); margin:-16px -16px 0; padding:16px 16px 8px; display:flex; align-items:center; justify-content:space-between; gap:8px">
        <h3 style="margin:0">📡 Access Point — guia da varredura de sinal</h3>
        <button type="button" class="icon-btn sm" id="ad-close-top" title="Fechar" style="flex:none">✕</button>
      </div>
      <div style="line-height:1.5; font-size:13px">
        <p style="color:var(--text-dim); margin:6px 0">Como o Access Point simula a cobertura Wi-Fi (varredura normal e avançada, com reflexão/refração), o que cada opção faz, e uma ilustração de cada tipo de raio.</p>
        <div style="margin:6px 0 2px">${chips}<a href="#ad-g-ilustracoes" data-ad-go="ad-g-ilustracoes" style="display:inline-block; padding:3px 9px; margin:2px; border-radius:12px; background:rgba(255,255,255,0.07); font-size:12px; text-decoration:none; color:inherit">🖼️ Ilustrações</a></div>
        <h4 id="ad-g-ilustracoes" style="margin:16px 0 8px">🖼️ Tipos de raio</h4>
        ${ilustracoesHtml}
        ${secoesHtml}
      </div>
      <div style="display:flex; gap:10px; margin-top:14px"><button type="button" class="btn" id="ad-close" style="flex:1">Fechar</button></div>
    </div>`;
  }

  function abrir() {
    document.getElementById('ad-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'ad-modal'; modal.className = 'modal-backdrop'; modal.style.zIndex = '10002';
    modal.innerHTML = html();
    document.body.appendChild(modal);
    const fechar = () => modal.remove();
    modal.querySelector('#ad-close-top').onclick = fechar;
    modal.querySelector('#ad-close').onclick = fechar;
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) fechar(); });
    modal.querySelectorAll('[data-ad-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); modal.querySelector('#' + a.dataset.adGo)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    return modal;
  }

  const API = { SECOES, ILUSTRACOES, abrir, html };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.ApDocs = API;
})(typeof window !== 'undefined' ? window : globalThis);
