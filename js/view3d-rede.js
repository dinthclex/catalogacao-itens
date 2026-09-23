/* ============================================================================
 * js/view3d-rede.js  --  [18/09/2026 UTC] RODADA 167 (+ RODADA 169)
 * Extensao do View3D ("Ver em 3D") para o ecossistema de infraestrutura PASSIVA de rede:
 *
 *   1) PEGAR E CARREGAR (tecla E): o item de rede mirado (switch, patch panel, DIO, PDU, guia...) e
 *      realmente pego: some do lugar, acompanha a mira/o personagem ("na mao") e e pousado no chao,
 *      sobre uma mesa/rack ou ENCAIXADO numa U do rack (snap magnetico com previa azul).
 *        E = soltar/encaixar    Q = devolver ao lugar de origem    R = girar 90 graus
 *        clique esquerdo = soltar    Esc = devolver
 *   3) ROTULO (labelID) em cabos/patch panels/espelhos: overlay HTML ao apontar (hover da mira).
 *   4) Menu do Modo Edicao: `_openRedeMenu` (equipamentos).
 *   5) [18/09/2026 UTC] RODADA 169 -- LIGAR CABO CLICANDO NAS PORTAS (tecla L liga/desliga o modo, tambem
 *      acessivel pelo botao "🔌 Ligar clicando nas portas" do menu de qualquer equipamento com porta):
 *      em vez de abrir o menu e escolher nos <select> "Ligar a"/"Porta"/"Conectar cabo", basta MIRAR numa
 *      porta e CLICAR (1o clique marca, um 2o clique na MESMA porta confirma — evita ligar por engano com
 *      a mira tremendo) para marcar a ORIGEM, depois mirar/clicar/confirmar numa porta de DESTINO (pode
 *      ser de outro equipamento OU do mesmo rack/equipamento) -- ao confirmar o destino, o cabo e criado
 *      na hora (`RedeEquip.conectar`, mesmas regras/avisos de compatibilidade de sempre) e o modo continua
 *      ativo, pronto pra ligar a PROXIMA porta em seguida, sem reabrir nada -- ver `_caboLigIniciar`/
 *      `_caboLigClique`/`_caboLigCancelar`/`_caboLigAtualizarDica` abaixo. Esc ou a tecla L de novo encerra.
 *
 * Carregado DEPOIS de js/view3d.js (que define `window.View3D`); os metodos abaixo sao mesclados nele
 * com `Object.assign`. Depende de RedeEquip (rede-equip.js), RedePassiva (rede-passiva.js) e Engine3D.
 * ========================================================================== */
(function (raiz) {
  'use strict';
  const View3D = raiz.View3D;
  if (!View3D) { console.warn('[view3d-rede] View3D ausente — extensao nao instalada.'); return; }

  const ALCANCE_PEGAR = 3.6;      // m: distancia maxima para pegar (e para pousar)
  const BTN = 'cursor:pointer;border:1px solid #4a5568;border-radius:6px;background:#2a3140;color:#e8ecf2;padding:4px 10px;font:inherit';
  const INP = 'background:#151a22;color:#e8ecf2;border:1px solid #3a4250;border-radius:6px;padding:3px 6px;font:inherit;max-width:100%';
  const esc = (t) => (raiz.Utils && raiz.Utils.escapeHtml) ? raiz.Utils.escapeHtml(String(t == null ? '' : t)) : String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (msg, opt) => { try { raiz.Utils.toast(msg, opt || { duration: 2200 }); } catch (e) { /* sem toast */ } };
  const ehCampoTexto = (e) => { const t = e && e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
  // [22/09/2026] NOVO -- opções de densidade dos raios do motor avançado ("mostrar raios" -- ver
  // `avancadoDensidadeRaios` em wifi-signal.js). Fração dos raios primários que ganham linha desenhada;
  // sempre inclui o valor atual (mesmo que não bata com nenhuma opção padrão) pra nunca "sumir" a seleção.
  // [28/09/2026] NOVO -- pedido verbatim: "Faça uma separação visual do que é da 'Varredura normal', do que
  // é da 'Varredura avançada' e do que é sobre o 2D." Rótulo de seção reaproveitado nos 2 painéis (principal
  // + janelinha) — maiúsculas pequenas + traço acima, mesmo padrão visual dos outros divisores já existentes.
  // [29/09/2026] MUDADO -- pedido verbatim: "Visualmente, '📶 Varredura normal', '🛰️ Varredura avançada' e
  // '🗺️ Mapa 2D' devem ficar separados com algum destaque entre eles os separando." A linha fina de cima
  // (1px, mesma cor da borda do painel) passava despercebida -- agora é uma faixa com fundo tintado +
  // borda de cor de destaque (azul, mesma do resto da UI), bem mais visível como divisor de seção.
  const SEC_HDR = (emoji, texto) => '<div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.9;color:#9db8e8;margin-top:14px;padding:6px 8px;border-top:2px solid #4f8cff;border-radius:0 0 4px 4px;background:rgba(79,140,255,.10)">' + emoji + ' ' + texto + '</div>';
  const DENSIDADES_RAIOS = [1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01];
  const DENSIDADES_RAIOS_OPTS = (atual) => {
    const vals = DENSIDADES_RAIOS.slice();
    if (atual > 0 && !vals.some((v) => Math.abs(v - atual) < 1e-6)) vals.push(atual);
    vals.sort((a, b) => b - a);
    return vals.map((v) => '<option value="' + v + '"' + (Math.abs(v - atual) < 1e-6 ? ' selected' : '') + '>' + Math.round(v * 100) + '%</option>').join('');
  };

  const M = {

    // ======================================================================
    // 0) RAYCASTER DO AP -- pontos/raios por nível de sinal (reaproveitado pelo
    //    painel principal do AP e pela "janelinha" compacta -- ver `_wfMiniHtml`/`_wfMiniWire`)
    // ======================================================================
    /** [28/09/2026] NOVO -- pedido verbatim: "Os botões que indicam a intensidade (fraco/baixo/médio/bom/
     *  excelente) devem ter um novo formato. Em vez de ser um checkbox com um label do lado, deve ser um
     *  botão ativa/desativa. Dentro do botão, deve ter a bolinha com a cor e o texto do label. Coloque os 5
     *  botões colados um do lado do outro." 1 `<button>` por nível (em vez de `<label><input type=checkbox>`),
     *  bordas coladas (só o 1º/último arredondados, `margin-left:-1px` nos do meio pra fundir a borda com o
     *  vizinho). Estado "ativo" muda cor de fundo/texto/bolinha via `data-ativo`.
     *  [29/09/2026] MUDADO -- pedido verbatim: "As sequências de botões 'fraco', 'baixo', 'médio', 'bom' e
     *  'excelente' devem ter só o tamanho necessário para a bolinha com a cor e o texto parecerem com um
     *  pouco de padding lateral. Não devem obrigatoriamente ocupar a linha toda." Trocado `flex:1` (esticava
     *  cada botão pra dividir a linha toda em partes iguais) por `flex:0 0 auto` (tamanho pelo conteúdo) +
     *  padding lateral maior (2px -> 10px); a fileira (`_wfFileiraNiveisHtml`) ganhou `flex-wrap:wrap` pra
     *  não estourar a largura do painel quando os 5 juntos não cabem numa linha só. */
    _wfBotaoNivelHtml(niv, k, n, attr, ativo) {
      const r = Math.round(niv.cor[0] * 255), g = Math.round(niv.cor[1] * 255), b = Math.round(niv.cor[2] * 255);
      const raio = k === 0 ? '6px 0 0 6px' : (k === n - 1 ? '0 6px 6px 0' : '0');
      return '<button type="button" data-' + attr + '="' + k + '" data-ativo="' + (ativo ? '1' : '0') + '" data-rgb="' + r + ',' + g + ',' + b + '" title="' + esc(niv.nome) + '" style="flex:0 0 auto;' + (k > 0 ? 'margin-left:-1px;' : '') + 'display:flex;align-items:center;justify-content:center;gap:4px;padding:4px 10px;font:inherit;font-size:10px;line-height:1;border:1px solid #3a4250;border-radius:' + raio + ';background:' + (ativo ? 'rgba(' + r + ',' + g + ',' + b + ',.22)' : 'transparent') + ';color:' + (ativo ? '#e8ecf2' : '#7a8391') + ';cursor:pointer;white-space:nowrap">'
        + '<span style="flex:0 0 auto;display:inline-block;width:8px;height:8px;border-radius:50%;background:rgb(' + r + ',' + g + ',' + b + ')' + (ativo ? '' : ';opacity:.4') + '"></span>'
        + '<span>' + esc(niv.nome) + '</span></button>';
    },
    /** 1 fileira de 5 `_wfBotaoNivelHtml`, todos colados (sem gap — as bordas negativas fazem a colagem).
     *  `flex-wrap:wrap` [29/09/2026 NOVO] -- os botões não são mais `flex:1` (ver `_wfBotaoNivelHtml`), então
     *  os 5 juntos podem não caber numa linha só num painel estreito; quebram em vez de estourar a largura. */
    _wfFileiraNiveisHtml(arr, attr) {
      const WS = raiz.WifiSignal, n = WS.NIVEIS.length;
      return '<div style="display:flex;flex-wrap:wrap">' + WS.NIVEIS.map((niv, k) => this._wfBotaoNivelHtml(niv, k, n, attr, !!arr[k])).join('') + '</div>';
    },
    /** Liga os botões de `_wfFileiraNiveisHtml` a `toggleFn(k, novoValor)`, alternando o próprio estado a
     *  cada clique (lê o estado atual do `data-ativo` do botão -- não depende de reconstruir o HTML) e
     *  repinta na hora (cor de fundo/texto/bolinha), sem `render()` nenhum. */
    _wfFileiraNiveisWire(root, attr, toggleFn) {
      root.querySelectorAll('[data-' + attr + ']').forEach((btn) => {
        btn.onclick = () => {
          const k = Number(btn.getAttribute('data-' + attr));
          const ativo = btn.getAttribute('data-ativo') !== '1';
          btn.setAttribute('data-ativo', ativo ? '1' : '0');
          const dot = btn.querySelector('span');
          const rgb = btn.getAttribute('data-rgb') || '255,255,255';
          btn.style.background = ativo ? 'rgba(' + rgb + ',.22)' : 'transparent';
          btn.style.color = ativo ? '#e8ecf2' : '#7a8391';
          dot.style.opacity = ativo ? '1' : '.4';
          toggleFn(k, ativo);
        };
      });
    },
    /** [25/09/2026] NOVO -- pedido verbatim: "Faça os 'raios do raycaster' ir trocando a cor conforme os
     *  níveis da malha de cor dos 5 níveis que tem [...] deve ser possível escolher quais partes do raio
     *  ficam aparecendo [...] Cada parte do raio pode ser ativada individualmente." 2 fileiras de 5 botões
     *  (pontos/raios, ver `_wfFileiraNiveisHtml`), 1 por nível de `WS.NIVEIS` (0=fraco/vermelho ..
     *  4=excelente/verde), cada bolinha colorida na cor real daquele nível -- mesma paleta da malha de calor. */
    _wfNiveisHtml(ap) {
      const pontos = ap.mostrarPontosNiveis, raios = ap.mostrarRaiosNiveis, modoColisao = ap.pontosRaycasterModo === 'colisao';
      // [22/09/2026] NOVO -- pedido verbatim: "deve haver dois modos para os pontos do raycaster (por
      // nível). O jeito atual (até o limite de atenuação para aquele nível) e o outro jeito (apenas onde,
      // dentro daquele nível, houve batida em alguma superfície com raycaster) [...] os raios [...] devem
      // seguir estes pontos." `<select>` compartilhado pelos dois (pontos E raios, já que os raios sempre
      // seguem os pontos -- ver wifi-signal.js).
      return '<div style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="font-size:11px;opacity:.7">Modo dos pontos/raios</span><select data-wf-pontos-modo="1" style="' + INP + '" title="Alcance: ponto na borda de alcance do nível, exista ou não parede ali (comportamento de sempre). Colisão real: ponto só onde o raycaster realmente bateu numa superfície dentro da faixa daquele nível.">'
        + '<option value="alcance"' + (modoColisao ? '' : ' selected') + '>Alcance (borda do nível)</option>'
        + '<option value="colisao"' + (modoColisao ? ' selected' : '') + '>Colisão real (só onde bateu)</option>'
        + '</select></div>'
        + '<div style="font-size:11px;opacity:.7;margin-top:4px" title="Mostra/esconde os pontos 3D onde os raios da varredura normal bateram, separados por nível de sinal.">pontos do raycaster (por nível)</div>' + this._wfFileiraNiveisHtml(pontos, 'wf-nivpt')
        + '<div style="font-size:11px;opacity:.7;margin-top:3px" title="Mostra/esconde as linhas 3D dos raios da varredura normal, separadas por nível de sinal.">raios do raycaster (por nível)</div>' + this._wfFileiraNiveisHtml(raios, 'wf-nivray');
    },
    /** Liga os botões de `_wfNiveisHtml` a `ap.setMostrarPontosNivel`/`setMostrarRaiosNivel` + o `<select>` de
     *  modo a `ap.pontosRaycasterModo`. `render`/`renderAgora` (mesmo parâmetro de `_wfCorteWire`) refaz o
     *  HTML pra os botões/pontos refletirem o novo modo imediatamente após a troca. */
    _wfNiveisWire(root, ap, render) {
      this._wfFileiraNiveisWire(root, 'wf-nivpt', (k, v) => ap.setMostrarPontosNivel(k, v));
      this._wfFileiraNiveisWire(root, 'wf-nivray', (k, v) => ap.setMostrarRaiosNivel(k, v));
      const modo = root.querySelector('[data-wf-pontos-modo]');
      if (modo) modo.onchange = (e) => { ap.pontosRaycasterModo = e.target.value; if (typeof render === 'function') render(); };
    },
    /** [22/09/2026] NOVO -- pedido verbatim: "coloque os botões de níveis para os pontos e para os raios,
     *  assim como na varredura normal. Retire os checkbox 'mostrar pontos' e 'mostrar raios', pois os botões
     *  de níveis já vão executar esta função." Mesmíssimo padrão visual/técnico de `_wfNiveisHtml`/
     *  `_wfNiveisWire` acima, só que ligado aos toggles POR NÍVEL do motor avançado
     *  (`avancadoMostrarPontosNiveis`/`avancadoMostrarRaiosNiveis`, ver wifi-signal.js) -- substitui os antigos
     *  checkboxes únicos `avancadoMostrarPontos`/`avancadoMostrarRaios` (e a "grade quadriculada", removida
     *  inteira, código incluso). */
    _wfNiveisAvancadaHtml(ap) {
      const pontos = ap.avancadoMostrarPontosNiveis, raios = ap.avancadoMostrarRaiosNiveis;
      return '<div style="font-size:11px;opacity:.7;margin-top:4px" title="Mostra/esconde os pontos 3D onde os raios do motor avançado bateram, separados por nível de sinal.">pontos do motor avançado (por nível)</div>' + this._wfFileiraNiveisHtml(pontos, 'wfa-nivpt')
        + '<div style="font-size:11px;opacity:.7;margin-top:3px" title="Mostra/esconde as linhas 3D dos raios do motor avançado, separadas por nível de sinal.">raios do motor avançado (por nível)</div>' + this._wfFileiraNiveisHtml(raios, 'wfa-nivray');
    },
    _wfNiveisAvancadaWire(root, ap) {
      this._wfFileiraNiveisWire(root, 'wfa-nivpt', (k, v) => ap.setAvancadoMostrarPontosNivel(k, v));
      this._wfFileiraNiveisWire(root, 'wfa-nivray', (k, v) => ap.setAvancadoMostrarRaiosNivel(k, v));
    },
    /** [26/09/2026] NOVO -- pedido verbatim: "Deve ser possível habilitar as formas 3D produzidas
     *  independentemente também [...] mostrá-las individualmente. E também só habilitar a superfície mais
     *  externa [...] Deve ser possível selecionar se vai ser sólido ou wireframe." Mesmo padrão visual de
     *  `_wfNiveisHtml` (1 fileira de 5 botões, ver `_wfFileiraNiveisHtml`) + 1 checkbox extra "wireframe". */
    _wfMalhaNiveisHtml(ap) {
      const niveis = ap.mostrarMalhaNiveis;
      return '<div style="font-size:11px;opacity:.7;margin-top:4px" title="Ativa/desativa a superfície 3D de cada nível de sinal individualmente (nível 0/\'fraco\' = casca mais externa, os demais ficam por dentro dela).">superfície da malha (por nível — nível 0/"fraco" = superfície mais externa)</div>' + this._wfFileiraNiveisHtml(niveis, 'wf-nivmalha')
        + '<label style="font-size:11px;display:block;margin-top:3px" title="Desenha as superfícies acima em linhas (wireframe) em vez de preenchidas (sólido)."><input type="checkbox" data-wf-malha-wireframe="1"' + (ap.malhaWireframe ? ' checked' : '') + '> wireframe (em vez de sólido)</label>';
    },
    /** Liga os controles de `_wfMalhaNiveisHtml`, mesmo padrão de `_wfNiveisWire`. */
    _wfMalhaNiveisWire(root, ap) {
      this._wfFileiraNiveisWire(root, 'wf-nivmalha', (k, v) => ap.setMostrarMalhaNivel(k, v));
      const wf = root.querySelector('[data-wf-malha-wireframe]'); if (wf) wf.onchange = (e) => { ap.malhaWireframe = e.target.checked; };
    },
    /** [29/09/2026] NOVO -- pedido verbatim: "Na varredura avançada, deve ser possível ver a forma 3D gerada
     *  com o mapa de calor do sinal (superfície mais externa (como na varredura normal) e forma. Ambas por
     *  nível, os 5 níveis)." Mesmíssimo padrão visual/técnico de `_wfMalhaNiveisHtml` (fileira de 5 botões +
     *  checkbox de wireframe), só que ligado aos toggles PRÓPRIOS do motor avançado
     *  (`avancadoMostrarMalhaNiveis`/`avancadoMalhaWireframe`, ver wifi-signal.js) -- a malha do motor
     *  avançado é um `THREE.Mesh` À PARTE (`ap.malhaAvancada`), convive com a nuvem de pontos/grade dele. */
    _wfMalhaNiveisAvancadaHtml(ap) {
      const niveis = ap.avancadoMostrarMalhaNiveis;
      return '<div style="font-size:12px;opacity:.7;margin-top:6px" title="Forma 3D (casca) do motor avançado, por nível -- mesma técnica da varredura normal (nível 0/\'fraco\' = superfície mais externa), calculada sem reflexão/refração.">superfície 3D do motor avançado (por nível)</div>' + this._wfFileiraNiveisHtml(niveis, 'wfa-nivmalha')
        + '<label style="font-size:12px;display:block;margin-top:3px" title="Desenha a superfície acima em linhas (wireframe) em vez de preenchida (sólido)."><input type="checkbox" data-wfa-malha-wireframe="1"' + (ap.avancadoMalhaWireframe ? ' checked' : '') + '> wireframe (em vez de sólido)</label>';
    },
    _wfMalhaNiveisAvancadaWire(root, ap) {
      this._wfFileiraNiveisWire(root, 'wfa-nivmalha', (k, v) => ap.setAvancadoMostrarMalhaNivel(k, v));
      const wf = root.querySelector('[data-wfa-malha-wireframe]'); if (wf) wf.onchange = (e) => { ap.avancadoMalhaWireframe = e.target.checked; };
    },
    /** [29/09/2026] NOVO -- pedido verbatim: "Faça a opção de 'Vista em Corte' para a varredura normal [...]
     *  uma superfície paralela ao chão que se pode controlar a altura Y [...] controlar a opacidade [...]
     *  Uma barra de 0 a 100% [...] Um campo de entrada numérico [...] alterando um, altera o outro [...] até
     *  totalmente aparente." Checkbox liga/desliga (`ap.corteAtivo`) + `<input type=range>` E `<input
     *  type=number>` SINCRONIZADOS (mesmo valor, `ap.corteAltura01`, 0..100%) + slider de opacidade do
     *  plano visual (`ap.corteOpacidade`) -- ver `atualizarCorte`/wifi-signal.js pra física do recorte. */
    // [22/09/2026] MUDADO -- pedido verbatim: "deve ter um outro modo o corte de giro [...] Deve ser possível
    // definir um ângulo fixo (que será o 0) e usar o outro ângulo para variar de 0 até 100% do cardioide
    // visível [...] Por padrão, fica o modo de corte de superfície de cima para baixo (deve ser possível mover
    // este eixo de deslocamento por meio de dois eixos de giro, assim, poder-se-à mover a superfície em um
    // eixo inclinado a 30°, por exemplo)." Acrescenta um `<select>` de modo ('superficie'/'giro') + 2 campos
    // de inclinação (graus, -89..89) no modo 'superficie' + ângulo fixo/percentual no modo 'giro' -- só o
    // bloco do modo ATIVO fica visível (os dois ficam sempre no HTML, alternando com `display:none`, pra não
    // perder o wiring ao trocar de modo). Opacidade continua compartilhada pelos dois (vale pro plano visual
    // OU pras "mãos de relógio", conforme o modo).
    _wfCorteHtml(ap) {
      const pct = Math.round(ap.corteAltura01 * 100), opPct = Math.round(ap.corteOpacidade * 100);
      const giroPct = Math.round(ap.corteGiroPercentual01 * 100), giroFixo = Math.round(ap.corteGiroAnguloFixo);
      const modoGiro = ap.corteModo === 'giro';
      return SEC_HDR('✂️', 'Vista em corte')
        + '<label style="font-size:12px" title="Recorta as formas 3D da varredura normal, no modo escolhido abaixo."><input type="checkbox" data-wf-corte-ativo="1"' + (ap.corteAtivo ? ' checked' : '') + '> ativar vista em corte</label>'
        + '<div style="display:flex;align-items:center;gap:6px;margin-top:4px' + (ap.corteAtivo ? '' : ';opacity:.45;pointer-events:none') + '" data-wf-corte-campos="1">'
        + '<span style="font-size:12px">Modo</span><select data-wf-corte-modo="1" style="' + INP + '" title="Superfície: plano horizontal (ou inclinado) de cima para baixo. Giro: recorte circular em torno do AP, como ponteiros de relógio se afastando.">'
        + '<option value="superficie"' + (modoGiro ? '' : ' selected') + '>Superfície (cima↓baixo)</option>'
        + '<option value="giro"' + (modoGiro ? ' selected' : '') + '>Giro (circular, eixo Y)</option>'
        + '</select></div>'
        + '<div style="display:grid;grid-template-columns:auto 1fr auto;gap:6px 8px;align-items:center;margin-top:4px' + (ap.corteAtivo && !modoGiro ? '' : ';opacity:.45;pointer-events:none') + (modoGiro ? ';display:none' : '') + '" data-wf-corte-campos-superficie="1">'
        + '<span>Altura do corte</span><input data-wf-corte-altura="1" type="range" min="0" max="100" step="1" value="' + pct + '" style="width:100%" title="Posição do plano de corte: 0% = base das formas (tudo oculto), 100% = topo (tudo aparente).">'
        + '<input data-wf-corte-altura-num="1" type="number" min="0" max="100" step="1" value="' + pct + '" style="' + INP + ';width:56px" title="Mesmo valor da barra ao lado, em número (0-100%).">'
        + '<span>Eixo externo</span><input data-wf-corte-eixoext="1" type="range" min="0" max="359" step="1" value="' + Math.round(ap.corteEixoExterno) + '" style="width:100%" title="Gira em torno do eixo Y do mundo, posicionando pra qual lado o eixo interno vai inclinar o plano (graus, 0-359).">'
        + '<input data-wf-corte-eixoext-num="1" type="number" min="0" max="359" step="1" value="' + Math.round(ap.corteEixoExterno) + '" style="' + INP + ';width:56px" title="Mesmo valor da barra ao lado, em graus (0-359).">'
        + '<span>Eixo interno</span><input data-wf-corte-eixoint="1" type="range" min="-89" max="89" step="1" value="' + Math.round(ap.corteEixoInterno) + '" style="width:100%" title="Inclina o plano em torno do eixo já posicionado pelo \'Eixo externo\' acima (graus). 0° = plano perfeitamente horizontal.">'
        + '<input data-wf-corte-eixoint-num="1" type="number" min="-89" max="89" step="1" value="' + Math.round(ap.corteEixoInterno) + '" style="' + INP + ';width:56px" title="Mesmo valor da barra ao lado, em graus (-89 a 89).">'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:auto 1fr auto;gap:6px 8px;align-items:center;margin-top:4px' + (ap.corteAtivo && modoGiro ? '' : ';opacity:.45;pointer-events:none') + (modoGiro ? '' : ';display:none') + '" data-wf-corte-campos-giro="1">'
        + '<span>Ângulo fixo (0%)</span><input data-wf-corte-giro-fixo="1" type="range" min="0" max="359" step="1" value="' + giroFixo + '" style="width:100%" title="Ângulo (visto de cima) da \'mão\' fixa de referência -- é o 0% do giro.">'
        + '<input data-wf-corte-giro-fixo-num="1" type="number" min="0" max="359" step="1" value="' + giroFixo + '" style="' + INP + ';width:56px" title="Mesmo valor da barra ao lado, em graus (0-359).">'
        + '<span>Giro visível</span><input data-wf-corte-giro-pct="1" type="range" min="0" max="100" step="1" value="' + giroPct + '" style="width:100%" title="0% = as duas \'mãos\' coincidem (nada visível). 100% = volta completa (tudo visível). A \'mão\' móvel gira sempre no sentido crescente a partir do ângulo fixo.">'
        + '<input data-wf-corte-giro-pct-num="1" type="number" min="0" max="100" step="1" value="' + giroPct + '" style="' + INP + ';width:56px" title="Mesmo valor da barra ao lado, em número (0-100%).">'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:auto 1fr auto;gap:6px 8px;align-items:center;margin-top:4px' + (ap.corteAtivo ? '' : ';opacity:.45;pointer-events:none') + '" data-wf-corte-campos-opacidade="1">'
        + '<span>Opacidade visual</span><input data-wf-corte-opacidade="1" type="range" min="0" max="100" step="1" value="' + opPct + '" style="width:100%" title="Opacidade da referência visual do corte (o plano ou as \'mãos\' -- não afeta as formas recortadas em si).">'
        + '<input data-wf-corte-opacidade-num="1" type="number" min="0" max="100" step="1" value="' + opPct + '" style="' + INP + ';width:56px" title="Mesmo valor da barra ao lado, em número (0-100%).">'
        + '</div>'
        + '<div style="font-size:11px;opacity:.6;margin-top:3px">' + (modoGiro
          ? 'Giro de 0% (mãos coincidentes, nada visível) a 100% (volta completa, tudo visível) -- só afeta a varredura normal (malha de calor), não a nuvem de pontos do motor avançado.'
          : 'Desliza de 0% (formas totalmente ocultas) a 100% (formas totalmente aparentes) -- só afeta a varredura normal (malha de calor), não a nuvem de pontos do motor avançado.') + '</div>';
    },
    _wfCorteWire(root, ap, render) {
      const campos = root.querySelector('[data-wf-corte-campos]');
      const camposSup = root.querySelector('[data-wf-corte-campos-superficie]');
      const camposGiro = root.querySelector('[data-wf-corte-campos-giro]');
      const camposOp = root.querySelector('[data-wf-corte-campos-opacidade]');
      const aplicarAtivo = () => {
        [camposSup, camposGiro, camposOp].forEach((el) => { if (el) { el.style.opacity = ap.corteAtivo ? '' : '.45'; el.style.pointerEvents = ap.corteAtivo ? '' : 'none'; } });
        if (campos) { campos.style.opacity = ap.corteAtivo ? '' : '.45'; campos.style.pointerEvents = ap.corteAtivo ? '' : 'none'; }
      };
      const ativo = root.querySelector('[data-wf-corte-ativo]');
      if (ativo) ativo.onchange = (e) => { ap.corteAtivo = e.target.checked; aplicarAtivo(); };
      const modo = root.querySelector('[data-wf-corte-modo]');
      // [22/09/2026] NOVO -- troca de modo refaz o HTML inteiro (`render()`, já disponível nos dois
      // chamadores -- painel principal e janelinha) pra alternar qual bloco de campos (superfície/giro) fica
      // visível -- mais simples/confiável que alternar `display` manualmente aqui igual `aplicarAtivo` faz
      // pro `corteAtivo` (que não muda QUAL bloco existe, só se está habilitado).
      if (modo) modo.onchange = (e) => { ap.corteModo = e.target.value; render(); };
      const alt = root.querySelector('[data-wf-corte-altura]'), altNum = root.querySelector('[data-wf-corte-altura-num]');
      if (alt) alt.oninput = (e) => { const v = Number(e.target.value); ap.corteAltura01 = v / 100; if (altNum) altNum.value = v; };
      if (altNum) altNum.oninput = (e) => { let v = Number(e.target.value); if (!Number.isFinite(v)) return; v = Math.max(0, Math.min(100, v)); ap.corteAltura01 = v / 100; if (alt) alt.value = v; };
      const eixoExt = root.querySelector('[data-wf-corte-eixoext]'), eixoExtNum = root.querySelector('[data-wf-corte-eixoext-num]');
      if (eixoExt) eixoExt.oninput = (e) => { const v = Number(e.target.value); ap.corteEixoExterno = v; if (eixoExtNum) eixoExtNum.value = v; };
      if (eixoExtNum) eixoExtNum.oninput = (e) => { let v = Number(e.target.value); if (!Number.isFinite(v)) return; v = Math.max(0, Math.min(359, v)); ap.corteEixoExterno = v; if (eixoExt) eixoExt.value = v; };
      const eixoInt = root.querySelector('[data-wf-corte-eixoint]'), eixoIntNum = root.querySelector('[data-wf-corte-eixoint-num]');
      if (eixoInt) eixoInt.oninput = (e) => { const v = Number(e.target.value); ap.corteEixoInterno = v; if (eixoIntNum) eixoIntNum.value = v; };
      if (eixoIntNum) eixoIntNum.oninput = (e) => { let v = Number(e.target.value); if (!Number.isFinite(v)) return; v = Math.max(-89, Math.min(89, v)); ap.corteEixoInterno = v; if (eixoInt) eixoInt.value = v; };
      const giroFixo = root.querySelector('[data-wf-corte-giro-fixo]'), giroFixoNum = root.querySelector('[data-wf-corte-giro-fixo-num]');
      if (giroFixo) giroFixo.oninput = (e) => { const v = Number(e.target.value); ap.corteGiroAnguloFixo = v; if (giroFixoNum) giroFixoNum.value = v; };
      if (giroFixoNum) giroFixoNum.oninput = (e) => { let v = Number(e.target.value); if (!Number.isFinite(v)) return; v = Math.max(0, Math.min(359, v)); ap.corteGiroAnguloFixo = v; if (giroFixo) giroFixo.value = v; };
      const giroPct = root.querySelector('[data-wf-corte-giro-pct]'), giroPctNum = root.querySelector('[data-wf-corte-giro-pct-num]');
      if (giroPct) giroPct.oninput = (e) => { const v = Number(e.target.value); ap.corteGiroPercentual01 = v / 100; if (giroPctNum) giroPctNum.value = v; };
      if (giroPctNum) giroPctNum.oninput = (e) => { let v = Number(e.target.value); if (!Number.isFinite(v)) return; v = Math.max(0, Math.min(100, v)); ap.corteGiroPercentual01 = v / 100; if (giroPct) giroPct.value = v; };
      const op = root.querySelector('[data-wf-corte-opacidade]'), opNum = root.querySelector('[data-wf-corte-opacidade-num]');
      if (op) op.oninput = (e) => { const v = Number(e.target.value); ap.corteOpacidade = v / 100; if (opNum) opNum.value = v; };
      if (opNum) opNum.oninput = (e) => { let v = Number(e.target.value); if (!Number.isFinite(v)) return; v = Math.max(0, Math.min(100, v)); ap.corteOpacidade = v / 100; if (op) op.value = v; };
    },

    // ======================================================================
    // 0b) "JANELINHA" SIMPLISTA DO AP -- pedido verbatim: "deve ter uma opção para habilitar uma
    //     janelinha simplista do AP (mesmo fechando a janela do AP, a janelinha deve ficar ativa [...]
    //     Nesta janelinha, deve ser possível trocar a fixa, A potência, a Densidade de varredura, o Modo
    //     de malha. Deve ter o botão 'Refazer Varredura de Sinal' e todos os checkbox [...] Deve ter os
    //     botões e opções da varredura avançada também. Deve ter só os botões, checkbox e pouco texto,
    //     uma janela compacta e prática para configurar o AP." -- flutua fixa no canto da tela (não é um
    //     painel 3D), sobrevive ao fechar o menu principal do AP (`_openRedeMenu`), controlada só por
    //     `ap.miniJanela` (persistido, ver wifi-signal.js). Reaproveita `_wfNiveisHtml`/`_wfNiveisWire`.
    // ======================================================================
    /** Container fixo (cobre a viewport 3D inteira, mas não intercepta cliques -- `pointer-events:none`,
     *  só as janelinhas em si têm `pointer-events:auto`) onde as janelinhas de todos os APs com
     *  `miniJanela === true` ficam. Cada janelinha tem posição PRÓPRIA (`position:absolute;left/top`, ver
     *  `_wfMiniCriar`/`_wfMiniHabilitarArrastar`) -- pedido verbatim: "Deve ser possível mover a janelinha
     *  simplista do AP." Criado sob demanda, 1 só pra toda a sessão de `Ver em 3D`. */
    _wfMiniContainer() {
      if (this._wfMiniEls && this._wfMiniEls._box && this._wfMiniEls._box.isConnected) return this._wfMiniEls._box;
      const box = document.createElement('div');
      // [22/09/2026] MUDADO -- pedido verbatim: "deve ser possível movê-la por toda a tela do app [...] para
      // além da tela do 'Ver em 3D'." Antes o container era filho de `this._container` (só a área do canvas
      // 3D, `position:absolute`), limitando o arrasto (e o clamp em `_wfMiniHabilitarArrastar`, que usa o
      // retângulo deste box) a essa região. Agora é `position:fixed;inset:0` direto em `document.body` --
      // cobre a JANELA inteira do app, e sobrevive normalmente à troca de tela (recriado sob demanda).
      box.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:visible';
      document.body.appendChild(box);
      if (!this._wfMiniEls) this._wfMiniEls = {};
      this._wfMiniEls._box = box;
      return box;
    },
    /** HTML compacto da janelinha de 1 AP -- só botões/checkbox/selects e pouco texto (pedido verbatim).
     *  [26/09/2026] MUDADO -- pedido verbatim: "Os botões dela devem ser espelho dos botões da janela do
     *  AP [...] Os textos dos nomes dos checkbox devem ser exatamente os mesmos [...] Na varredura
     *  avançada, a quantidade de refração e reflexão devem aparecer também." Textos/rótulos abaixo copiados
     *  literalmente do painel principal (ver bloco `if (ehAp)` em `_openRedeMenu`/`render` mais abaixo). */
    _wfMiniHtml(obj, ap) {
      const WS = raiz.WifiSignal, emite = ap.emiteSinal;
      const opts = (mapa, atual) => Object.keys(mapa).map((k) => '<option value="' + k + '"' + (atual === k ? ' selected' : '') + '>' + esc(mapa[k].rotulo) + '</option>').join('');
      const nome = esc(obj.nome || (WS.ehAP(obj) ? 'Access Point' : obj.nome));
      // Cabeçalho: área de arrastar (ver `_wfMiniHabilitarArrastar` -- tudo aqui exceto o botão ✕ arrasta a janela).
      let h = '<div data-wfm-cabecalho="1" style="display:flex;align-items:center;gap:6px;margin-bottom:5px;cursor:move"><b style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none">📡 ' + nome + '</b><button type="button" data-wfm="fechar" style="background:transparent;border:none;color:#9aa3ad;cursor:pointer;font-size:14px;line-height:1;padding:0 2px">✕</button></div>';
      h += SEC_HDR('📶', 'Varredura normal')
        + '<div style="display:grid;grid-template-columns:auto 1fr;gap:3px 6px;align-items:center">'
        + '<span>Faixa</span><select data-wfm="frequencia" style="' + INP + '" title="Faixa de frequência do rádio — muda o alcance físico e a potência padrão.">' + opts(WS.FAIXAS, ap.signalFrequency) + '</select>'
        + '<span>Potência (W)</span><input data-wfm="potencia" type="number" min="0.01" max="2" step="0.001" value="' + ap.powerWatts + '" style="' + INP + '" title="Potência de transmissão, em watts.">'
        + '<span>Densidade da varredura</span><select data-wfm="densidade" style="' + INP + '" title="Quantos raios são lançados pra medir o sinal. Mais denso = mais fiel, porém mais lento.">' + opts(WS.DENSIDADES, ap.densidade) + '</select>'
        + '<span>Modo de malha</span><select data-wfm="meshMode" style="' + INP + '" title="Malha real: 1 vértice por raio. Malha simplificada: funde regiões planas — recomendado.">' + opts(WS.MODOS_MALHA, ap.meshMode) + '</select>'
        + '</div>'
        + '<div style="display:flex;gap:6px;align-items:center;margin-top:5px;flex-wrap:wrap"><button type="button" data-wfm="scan" style="' + BTN + (emite ? '' : ';opacity:.5') + '"' + (ap.scanning ? ' disabled' : '') + '>🔄 Refazer Varredura de Sinal</button>'
        + (ap.scanning ? '<button type="button" data-wfm="cancel" style="' + BTN + '">Cancelar</button>' : '') + '</div>'
        + '<div class="wf-bar' + (ap.scanning ? '' : ' wf-fim') + '" data-wfm-bar="1"><div class="wf-fill" style="width:' + ap.scanProgress + '%"></div></div>'
        // [22/09/2026] REMOVIDO -- pedido verbatim: "Retire o botão 'mostrar mapa' da varredura normal."
        // `ap.mostrar`/`mostrar2D` continuam existindo (ainda usados internamente -- ver `_v3dSairDesligarMapasAP`/
        // "Vista em Corte" a 0%/"Desligar o mapa de calor ao sair do Ver em 3D" em Configurações 3D), só o
        // controle manual (checkbox) na janela do AP foi removido.
        + this._wfMalhaNiveisHtml(ap)
        + this._wfNiveisHtml(ap)
        // [29/09/2026] NOVO -- espelha a "Vista em Corte" da janela principal (ver `_wfCorteHtml`).
        + this._wfCorteHtml(ap)
        + SEC_HDR('🛰️', 'Varredura avançada')
        // [29/09/2026] MUDADO -- espelha a mesma mudança da janela principal do AP (checkbox antes do texto,
        // sem "habilitada", número colado à direita -- ver comentário grande em `render()`/`_openRedeMenu`).
        + '<div style="display:grid;grid-template-columns:auto 1fr;gap:3px 6px;align-items:center">'
        + '<label style="font-size:11px;display:flex;align-items:center;gap:5px"><input type="checkbox" data-wfm="enableReflection"' + (ap.enableReflection ? ' checked' : '') + '> 🛰️ Reflexão</label><input data-wfm="maxReflections" type="number" min="0" max="5" step="1" value="' + ap.maxReflections + '" style="' + INP + '"' + (ap.enableReflection ? '' : ' disabled') + '>'
        + '<label style="font-size:11px;display:flex;align-items:center;gap:5px"><input type="checkbox" data-wfm="enableRefraction"' + (ap.enableRefraction ? ' checked' : '') + '> 🛰️ Refração</label><input data-wfm="maxRefractions" type="number" min="0" max="3" step="1" value="' + ap.maxRefractions + '" style="' + INP + '"' + (ap.enableRefraction ? '' : ' disabled') + '>'
        + '</div>'
        // [29/09/2026] NOVO -- espelha a superfície 3D por nível do motor avançado (ver `_wfMalhaNiveisAvancadaHtml`).
        + this._wfMalhaNiveisAvancadaHtml(ap)
        // [22/09/2026] MUDADO -- pedido verbatim: "coloque os botões de níveis para os pontos e para os
        // raios, assim como na varredura normal. Retire os checkbox 'mostrar pontos' e 'mostrar raios'."
        // Antigos checkboxes únicos ("mostrar pontos"/"grade quadriculada"/"mostrar raios") substituídos
        // pelos botões de nível de `_wfNiveisAvancadaHtml` (mesmo padrão da varredura normal).
        + this._wfNiveisAvancadaHtml(ap)
        + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px"><span style="font-size:11px;opacity:.7">Densidade dos raios</span><select data-wfm="avancadoDensidadeRaios" style="' + INP + '">' + DENSIDADES_RAIOS_OPTS(ap.avancadoDensidadeRaios) + '</select></div>'
        + '<div style="display:flex;gap:6px;align-items:center;margin-top:5px;flex-wrap:wrap"><button type="button" data-wfm="scanav" style="' + BTN + (emite ? '' : ';opacity:.5') + '"' + (ap.motorAvancado.scanning ? ' disabled' : '') + '>🛰️ Varredura avançada (reflexão/refração)</button>'
        + (ap.motorAvancado.scanning ? '<button type="button" data-wfm="cancelav" style="' + BTN + '">Cancelar</button>' : '') + '</div>'
        + '<div class="wf-bar' + (ap.motorAvancado.scanning ? '' : ' wf-fim') + '" data-wfm-barav="1"><div class="wf-fill" style="width:' + (ap.motorAvancado.progress || 0) + '%"></div></div>';
      return h;
    },
    /** Liga todos os controles da janelinha (`el` = elemento raiz dessa 1 janela). `renderAgora` refaz o
     *  HTML inteiro dessa janela (usado após scan/cancel, pra atualizar barra/estado dos botões -- SÓ
     *  chamado em transições de estado agora, ver `_wfMiniAtualizarTodas`, nunca mais a cada quadro). */
    _wfMiniWireEl(el, obj, ap, renderAgora) {
      const q = (sel) => el.querySelector(sel);
      if (q('[data-wfm="fechar"]')) q('[data-wfm="fechar"]').onclick = () => { ap.miniJanela = false; try { raiz.App && raiz.App.salvarMapaAtual && raiz.App.salvarMapaAtual(); } catch (e) { /* noop */ } this._wfMiniAtualizarTodas(); };
      el.querySelectorAll('[data-wfm]').forEach((c) => {
        const k = c.getAttribute('data-wfm');
        if (['fechar', 'scan', 'cancel', 'scanav', 'cancelav'].includes(k)) return;
        const ev = (c.tagName === 'SELECT' || c.type === 'checkbox') ? 'onchange' : 'oninput';
        c[ev] = (e) => {
          const v = c.type === 'checkbox' ? e.target.checked : e.target.value;
          if (k === 'frequencia') ap.signalFrequency = v;
          else if (k === 'potencia') ap.powerWatts = v;
          else if (k === 'densidade') ap.densidade = v;
          else if (k === 'meshMode') ap.meshMode = v;
          else if (k === 'enableReflection') { ap.enableReflection = v; renderAgora(); return; }
          else if (k === 'enableRefraction') { ap.enableRefraction = v; renderAgora(); return; }
          else if (k === 'maxReflections') ap.maxReflections = v;
          else if (k === 'maxRefractions') ap.maxRefractions = v;
          else if (k === 'avancadoDensidadeRaios') ap.avancadoDensidadeRaios = v;
        };
      });
      this._wfNiveisWire(el, ap, renderAgora);
      this._wfMalhaNiveisWire(el, ap);
      // [29/09/2026] NOVO -- superfície 3D por nível do motor avançado + "Vista em Corte" (espelham a janela
      // principal, ver `_wfMalhaNiveisAvancadaWire`/`_wfCorteWire` acima).
      this._wfMalhaNiveisAvancadaWire(el, ap);
      // [22/09/2026] NOVO -- botões de nível dos pontos/raios do motor avançado (ver `_wfNiveisAvancadaHtml`).
      this._wfNiveisAvancadaWire(el, ap);
      this._wfCorteWire(el, ap, renderAgora);
      // [26/09/2026] CORRIGIDO -- pedido verbatim: "iniciei uma varredura e [...] cliquei no botão
      // 'cancelar', porém não funcionava [...] na janela do AP, ao clicar em cancelar [...] cancela
      // imediatamente" -- o motivo real não era o `onclick` em si (idêntico ao do painel principal), e sim
      // a janelinha inteira sendo refeita a CADA QUADRO enquanto `ap.scanning` (ver bug corrigido em
      // `_wfMiniAtualizarTodas`), que destruía o botão antes do clique terminar de disparar.
      if (q('[data-wfm="scan"]')) q('[data-wfm="scan"]').onclick = () => { ap.startScan({ densidade: ap.densidade, meshMode: ap.meshMode }); renderAgora(); };
      if (q('[data-wfm="cancel"]')) q('[data-wfm="cancel"]').onclick = () => { ap.cancelScan(); renderAgora(); };
      if (q('[data-wfm="scanav"]')) q('[data-wfm="scanav"]').onclick = () => { ap.startScanAvancado(); renderAgora(); };
      if (q('[data-wfm="cancelav"]')) q('[data-wfm="cancelav"]').onclick = () => { ap.cancelScanAvancado(); renderAgora(); };
    },
    /** Atualização LEVE (sem refazer HTML) das 2 barras de progresso -- chamada todo quadro enquanto uma
     *  varredura está em andamento (ver `_wfMiniAtualizarTodas`), pra "a barrinha enchendo aparecer na
     *  janelinha também" (pedido verbatim) sem o custo/bug de recriar o DOM inteiro a cada quadro. */
    _wfMiniAtualizarBarra(el, ap) {
      const barra = el.querySelector('[data-wfm-bar]');
      if (barra) { barra.classList.toggle('wf-fim', !ap.scanning); const f = barra.querySelector('.wf-fill'); if (f) f.style.width = ap.scanProgress + '%'; }
      const barraAv = el.querySelector('[data-wfm-barav]');
      if (barraAv) { barraAv.classList.toggle('wf-fim', !ap.motorAvancado.scanning); const f = barraAv.querySelector('.wf-fill'); if (f) f.style.width = (ap.motorAvancado.progress || 0) + '%'; }
    },
    /** Pedido verbatim: "Deve ser possível mover a janelinha simplista do AP." Arrasta pela área marcada
     *  `[data-wfm-cabecalho]` (tudo do cabeçalho, exceto o botão ✕) -- delegado em `el` (nunca é substituído,
     *  só seu `innerHTML`, ver `renderAgora`), então funciona mesmo depois de um refazer de HTML. */
    _wfMiniHabilitarArrastar(el) {
      let arrastando = false, dx = 0, dy = 0;
      const onDown = (e) => {
        const cab = e.target.closest && e.target.closest('[data-wfm-cabecalho]'); if (!cab) return;
        if (e.target.closest('button')) return;   // botão ✕ continua clicável, não inicia arrasto
        const box = el.parentElement; if (!box) return;
        const r = el.getBoundingClientRect(), rb = box.getBoundingClientRect();
        dx = e.clientX - r.left; dy = e.clientY - r.top; arrastando = true;
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!arrastando) return;
        const box = el.parentElement; if (!box) return;
        const rb = box.getBoundingClientRect();
        let left = e.clientX - rb.left - dx, top = e.clientY - rb.top - dy;
        // [28/09/2026] MUDADO -- pedido verbatim: "Deve ser possível mover a parte de baixo da janelinha do
        // AP para fora da área visível da tela do navegador." Antes `top` tinha teto em
        // `rb.height - el.offsetHeight` (a janela inteira ficava sempre 100% visível verticalmente) -- como
        // a janelinha pode crescer bastante (várias seções, ver `max-height`/scroll interno em
        // `_wfMiniCriar`), isso podia até travar o arrasto vertical perto do fim da tela. Agora só o
        // CABEÇALHO (o que dá pra arrastar) precisa ficar alcançável -- `top` não tem mais teto, só piso
        // (0), deixando a parte de baixo sair da tela livremente. Horizontal continua 100% dentro (nenhum
        // pedido pra mudar isso, e evita perder a janela de vista pros lados).
        left = Math.max(0, Math.min(Math.max(0, rb.width - el.offsetWidth), left));
        top = Math.max(0, top);
        el.style.left = left + 'px'; el.style.top = top + 'px';
      };
      const onUp = () => { arrastando = false; };
      el.addEventListener('mousedown', onDown);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      el._wfMiniDragCleanup = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    },
    /** Cria a janelinha (DOM + wiring) de 1 AP e devolve `{el, renderAgora}`. Posição inicial em cascata
     *  (cada nova janelinha some um pouco mais pro canto), depois disso só muda arrastando (posição fica em
     *  `el.style.left/top`, que sobrevive a `renderAgora` -- só o `innerHTML` de dentro é trocado). */
    _wfMiniCriar(obj, ap) {
      const box = this._wfMiniContainer();
      const el = document.createElement('div');
      const n = box.children.length, desloc = 16 * n;
      // [27/09/2026] MUDADO -- pedido verbatim: "Dê um jeito de tudo caber na tela na janelinha do AP."
      // Com as seções todas (malha por nível, pontos/raios por nível, avançado...) a janelinha ficava mais
      // alta que a tela em telas menores/zoom maior, sem nenhuma forma de rolar até o fim -- agora tem
      // `max-height` (deixando uma margem no topo/rodapé) + `overflow-y:auto` (rola por dentro dela mesma,
      // sem empurrar o resto da tela).
      // [22/09/2026] MUDADO -- pedido verbatim: "Deve ser possível redimensionar a janelinha do AP, a barra
      // de título dela, com o botão 'fechar', deve ficar sempre visível." `el` vira um container flex-column
      // com `resize:both` (nativo do navegador, alça no canto inferior-direito) + `overflow:hidden` (a
      // ROLAGEM em si fica só em `_wfmCorpo`, o cabeçalho nunca rola/desaparece). `padding` saiu do `el` (foi
      // pros dois filhos), senão a alça de resize ficaria por cima do padding.
      el.style.cssText = 'position:absolute;left:' + (12 + desloc) + 'px;top:' + (12 + desloc) + 'px;pointer-events:auto;background:rgba(16,20,27,.92);border:1px solid #3a4250;border-radius:8px;padding:0;width:230px;height:min(70vh,520px);max-width:min(90vw,480px);max-height:calc(100vh - 24px);min-width:190px;min-height:90px;color:#e8ecf2;font:12px/1.3 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);backdrop-filter:blur(4px);display:flex;flex-direction:column;resize:both;overflow:hidden';
      const head = document.createElement('div');
      head.setAttribute('data-wfm-head', '1');
      head.style.cssText = 'flex:0 0 auto;padding:8px 8px 0 8px';
      const corpo = document.createElement('div');
      corpo.setAttribute('data-wfm-corpo', '1');
      corpo.style.cssText = 'flex:1 1 auto;overflow-y:auto;padding:0 8px 8px 8px;min-height:0';
      el.appendChild(head); el.appendChild(corpo);
      box.appendChild(el);
      // [22/09/2026] NOVO -- separa o cabeçalho (`[data-wfm-cabecalho]`, 1º elemento do HTML de `_wfMiniHtml`)
      // do resto: o cabeçalho vai pra `head` (fixo, nunca rola), o restante vai pra `corpo` (rola por dentro).
      const renderAgora = () => {
        const tmp = document.createElement('div');
        tmp.innerHTML = this._wfMiniHtml(obj, ap);
        const cab = tmp.querySelector('[data-wfm-cabecalho]');
        head.innerHTML = cab ? cab.outerHTML : '';
        if (cab) cab.remove();
        corpo.innerHTML = tmp.innerHTML;
        this._wfMiniWireEl(el, obj, ap, renderAgora);
      };
      renderAgora();
      this._wfMiniHabilitarArrastar(el);
      return { el, renderAgora };
    },
    /** Chamado a CADA quadro por `_updateRedeInteracao`: cria/atualiza/remove as janelinhas de todos os
     *  APs conforme `ap.miniJanela`. [26/09/2026] CORRIGIDO -- pedido verbatim: "A janelinha deve ser
     *  estática, não ficar sendo refeita a cada quadro [...] Não está dando para trocar as opções de
     *  dropdown e potência, parece que fica sempre sendo atualizado." Bug real: antes, `ap.scanning` (true
     *  o tempo todo durante uma varredura) forçava `renderAgora()` -- refazer o HTML inteiro -- em TODO
     *  quadro (60x/s), destruindo o foco/clique de qualquer campo/botão no meio da interação (inclusive o
     *  "Cancelar"). Agora: o HTML inteiro só é refeito (a) no 1º quadro em que a janelinha aparece, (b)
     *  quando o comando de fechar/mexer nela mesma chama `renderAgora()` diretamente, e (c) numa TRANSIÇÃO
     *  de `scanning`/`motorAvancado.scanning` (começou ou terminou uma varredura, pra atualizar botões
     *  scan/cancelar) -- durante a varredura em si, só a barra de progresso é atualizada (leve, sem tocar
     *  no resto do DOM, ver `_wfMiniAtualizarBarra`). */
    _wfMiniAtualizarTodas(dt) {
      const WS = raiz.WifiSignal; if (!WS || !this._map) return;
      if (!this._wfMiniEls) this._wfMiniEls = {};
      const janelas = this._wfMiniEls;
      const vivos = new Set();
      this._map.objects.forEach((o) => {
        if (!WS.ehAP(o)) return;
        const ap = WS.para(o, this._engine);
        if (!ap.miniJanela) return;
        vivos.add(o.id);
        if (!janelas[o.id]) {
          janelas[o.id] = this._wfMiniCriar(o, ap);
          janelas[o.id]._scanPrev = ap.scanning; janelas[o.id]._scanAvPrev = ap.motorAvancado.scanning;
          return;
        }
        const j = janelas[o.id];
        const mudouEstado = (j._scanPrev !== ap.scanning) || (j._scanAvPrev !== ap.motorAvancado.scanning);
        j._scanPrev = ap.scanning; j._scanAvPrev = ap.motorAvancado.scanning;
        if (mudouEstado) { j.renderAgora(); return; }
        if (ap.scanning || ap.motorAvancado.scanning) this._wfMiniAtualizarBarra(j.el, ap);
      });
      Object.keys(janelas).forEach((id) => {
        if (id === '_box') return;
        if (!vivos.has(id)) { try { janelas[id].el._wfMiniDragCleanup && janelas[id].el._wfMiniDragCleanup(); janelas[id].el.remove(); } catch (e) { /* noop */ } delete janelas[id]; }
      });
    },

    // ======================================================================
    // 1) PEGAR E CARREGAR
    // ======================================================================

    /** Gancho de teclado (chamado por `onKeyDown` do View3D). Retorna true quando CONSUMIU a tecla.
     *  Esc nunca consome (o fluxo normal do Esc — soltar o ponteiro — continua), so cancela o que estiver ativo. */
    _redeTeclas(e) {
      const RE = raiz.RedeEquip; if (!RE) return false;
      const carga = this._redeCargaSt, lig = this._caboLigSt, moldar = this._caboMoldarSt;
      // [19/09/2026 UTC] AMPLIADO (RODADA 202) -- `lig` (modo "Ligar cabo") passou a usar `_caboLigEscStack`
      // (pilha: desfaz 1 nível por vez -- marcação pendente, depois origem, só então sai do modo) no lugar
      // de `_caboLigCancelar(true)` direto (que saía do modo inteiro de uma vez). Continua devolvendo
      // `false` (Esc nunca "consome" a tecla) -- o resto do tratamento de Esc do View3D (soltar o ponteiro
      // etc.) continua rodando normalmente depois; só a lógica ESPECÍFICA do modo muda de nível em vez de
      // encerrar tudo de uma vez.
      if (e.code === 'Escape') { if (carga) this._redeCancelar(); if (lig) this._caboLigEscStack(); if (moldar) this._caboMoldarCancelar(true); return false; }
      if (ehCampoTexto(e)) return false;
      if (carga) {
        if (e.code === 'KeyE') { e.preventDefault(); if (!e.repeat) this._redeSoltar(); return true; }
        if (e.code === 'KeyQ') { e.preventDefault(); if (!e.repeat) this._redeCancelar(true); return true; }
        if (e.code === 'KeyR') { e.preventDefault(); if (!e.repeat) carga.extraAng += Math.PI / 2; return true; }
        return false;
      }
      // [18/09/2026 UTC] NOVO (RODADA 169) -- modo "Ligar cabo clicando nas portas" ativo: a tecla L
      // (mesma que liga) encerra o modo; toda outra tecla (WASD, etc.) segue funcionando normalmente
      // (mesmo padrao de `carga` acima -- so intercepta a tecla dedicada do proprio modo).
      if (lig) {
        if (e.code === 'KeyL') { e.preventDefault(); if (!e.repeat) this._caboLigCancelar(true); return true; }
        // [19/09/2026 UTC] NOVO (RODADA 202) -- Q desseleciona a porta marcada (1º clique de origem OU
        // de destino) SEM sair do modo -- mesmo espírito do Q de "Moldar cabo" (`_caboMoldarDesselecionar`).
        if (e.code === 'KeyQ') { e.preventDefault(); if (!e.repeat) this._caboLigDesselecionar(); return true; }
        return false;
      }
      // [19/09/2026 UTC] NOVO (RODADA 189) -- modo "Moldar cabo" ativo: a tecla M (mesma que liga)
      // encerra; mesmo padrão de `lig` acima -- só intercepta a tecla dedicada do próprio modo.
      if (moldar) {
        if (e.code === 'KeyM') { e.preventDefault(); if (!e.repeat) this._caboMoldarCancelar(true); return true; }
        // [19/09/2026 UTC] NOVO (RODADA 192) -- X exclui o nó segurado/mirado, B alterna bézier/reta
        // do trecho seguinte -- ver `_caboMoldarExcluirNo`/`_caboMoldarAlternarBezier`.
        if (e.code === 'KeyX') { e.preventDefault(); if (!e.repeat) this._caboMoldarExcluirNo(); return true; }
        if (e.code === 'KeyB') { e.preventDefault(); if (!e.repeat) this._caboMoldarAlternarBezier(); return true; }
        // [19/09/2026 UTC] NOVO (RODADA 194) -- Q desseleciona o nó sendo segurado (ver
        // `_caboMoldarDesselecionar`) -- só faz algo se houver um nó em mãos no momento.
        if (e.code === 'KeyQ') { e.preventDefault(); if (!e.repeat) this._caboMoldarDesselecionar(); return true; }
        return false;
      }
      if (e.code === 'KeyE' && !e.repeat && !this._carroControlado && !this._buildTool && document.pointerLockElement) { e.preventDefault(); this._redePegar(null); return true; }
      // [18/09/2026 UTC] NOVO (RODADA 169) -- tecla L inicia o modo "Ligar cabo clicando nas portas"
      // (ver comentario grande no topo do arquivo). Mesmas guardas de KeyE logo acima (sem carro/
      // ferramenta de construcao ativa, ponteiro travado).
      if (e.code === 'KeyL' && !e.repeat && !this._carroControlado && !this._buildTool && document.pointerLockElement) { e.preventDefault(); this._caboLigIniciar(); return true; }
      // [19/09/2026 UTC] NOVO (RODADA 189) -- tecla M inicia o modo "Moldar cabo" (ver comentário grande
      // na seção 2b acima). Mesmas guardas de KeyL/KeyE.
      if (e.code === 'KeyM' && !e.repeat && !this._carroControlado && !this._buildTool && document.pointerLockElement) { e.preventDefault(); this._caboMoldarIniciar(); return true; }
      return false;
    },

    /** Pega `pre` (ou o item de rede mirado). O item e retirado do rack (se estava) e passa a ser carregado. */
    _redePegar(pre) {
      const RE = raiz.RedeEquip, eng = this._engine;
      if (!RE || !eng || this._redeCargaSt) return false;
      let obj = pre;
      if (!obj) { const ray = eng.centerRay(this._camera); obj = eng.redeAlvoParaPegar(ray.origin, ray.dir, ALCANCE_PEGAR); }
      if (!obj) { toast('Mire num item de rede (switch, patch panel, DIO...) a até ' + ALCANCE_PEGAR.toString().replace('.', ',') + ' m e aperte E.', { duration: 2400 }); return false; }
      const orig = { x: obj.x, y: obj.y, elevacao: obj.elevacao || 0, angulo: obj.angulo || 0, piso: obj.piso || 0, rackId: obj.rackId || null, rackU: obj.rackU || null };
      if (obj.rackId) { RE.retirarDoRack(this._map, obj); }
      eng.rebuildObjectIncremental(obj);                 // sem parafusos/rack: malha "solta"
      if (!eng.redeCarregarIniciar(obj)) { Object.assign(obj, orig); eng.rebuildObjectIncremental(obj); return false; }
      this._redeCargaSt = { obj, orig, extraAng: 0, est: null };
      this._container && this._container.querySelectorAll('.v3d-rede-menu,.v3d-rack-menu').forEach((n) => n.remove());
      this._redeHint('');
      toast('✋ Pegou: ' + RE.especificar(obj.tipo).rotulo + '. Mire onde quer deixar (E solta · Q devolve · R gira). Se o mouse estiver solto, clique na tela.', { type: 'ok', duration: 2600 });
      return true;
    },

    /** Solta o item onde a previa esta (chao, mesa, topo do rack ou U do rack). */
    _redeSoltar() {
      const c = this._redeCargaSt; if (!c) return;
      const RE = raiz.RedeEquip, eng = this._engine, obj = c.obj, est = c.est;
      if (!est) return;
      if (est.modo === 'rack-cheio') { toast('Sem U livre nessa altura do rack — mire outra posição.', { type: 'warn', duration: 2000 }); return; }
      let alvo = est;
      if (est.modo === 'mao') {                          // solto no ar: cai ate a superficie de baixo
        const pisoBase = (obj.piso || 0) * (this._map.alturaPiso || 2.8);
        const hit = eng.raycastSurface({ x: est.x, y: est.y + 0.15, z: est.z }, { x: 0, y: -1, z: 0 });
        alvo = Object.assign({}, est, { modo: hit && hit.restingOnId ? 'apoio' : 'chao', y: hit ? hit.y : pisoBase, elevacao: (hit ? hit.y : pisoBase) - pisoBase });
      }
      if (alvo.modo === 'rack') {
        const res = RE.instalarNoRack(this._map, obj, alvo.rack, 0, alvo.yRelMm);
        if (!res.ok) { toast(res.erro || 'Não coube nesse rack.', { type: 'warn', duration: 2200 }); return; }
      } else {
        obj.x = alvo.x; obj.y = alvo.z; obj.elevacao = alvo.elevacao; obj.angulo = alvo.angulo; obj.rackId = null; obj.rackU = null;
      }
      eng.redeCarregarFim(obj);
      this._redeCargaSt = null; this._redeHint(null);
      raiz.DB.saveMap(this._map);
      eng.rebuildObjectIncremental(obj);
      const r = RE.especificar(obj.tipo).rotulo;
      toast(alvo.modo === 'rack' ? (r + ' encaixado no rack — U' + obj.rackU + '.') : alvo.modo === 'apoio' ? (r + ' colocado sobre o objeto.') : (r + ' colocado no chão.'), { type: 'ok', duration: 1900 });
    },

    /** Devolve o item onde ele estava (rack/U ou posicao original). `avisar` = mostra toast. */
    _redeCancelar(avisar) {
      const c = this._redeCargaSt; if (!c) return;
      const RE = raiz.RedeEquip, eng = this._engine, obj = c.obj, o = c.orig;
      Object.assign(obj, { x: o.x, y: o.y, elevacao: o.elevacao, angulo: o.angulo, piso: o.piso, rackId: null, rackU: null });
      if (o.rackId) {
        const rack = (this._map.objects || []).find((q) => q.id === o.rackId);
        if (rack) { const res = RE.instalarNoRack(this._map, obj, rack, o.rackU); if (!res.ok) RE.instalarNoRack(this._map, obj, rack, 0, undefined); }
      }
      eng.redeCarregarFim(obj);
      this._redeCargaSt = null; this._redeHint(null);
      raiz.DB.saveMap(this._map);
      eng.rebuildObjectIncremental(obj);
      if (avisar) toast('Item devolvido ao lugar de origem.', { duration: 1600 });
    },

    /** Faixa de ajuda na parte de baixo da tela enquanto carrega. null = remove. */
    _redeHint(txt) {
      let el = this._redeHintEl;
      if (txt === null) { if (el) { el.remove(); this._redeHintEl = null; } return; }
      if (!this._container) return;
      if (!el) {
        el = document.createElement('div'); el.className = 'v3d-rede-hint';
        el.style.cssText = 'position:absolute;left:50%;bottom:84px;transform:translateX(-50%);z-index:55;pointer-events:none;background:rgba(15,20,28,.88);color:#e8ecf2;border:1px solid #3a4250;border-radius:8px;padding:6px 12px;font:12.5px system-ui,sans-serif;text-align:center;max-width:92vw';
        this._container.appendChild(el); this._redeHintEl = el;
      }
      if (el._t !== txt) { el._t = txt; el.innerHTML = txt; }
    },

    /** Por quadro: posiciona o item carregado, atualiza a faixa, guarda-costas do traçado e rotulos. */
    /** [21/09/2026] Faixa DESTACADA no meio da tela, logo abaixo da linha de botões do cabeçalho, informando o modo
     *  ativo (E = carregar equipamento · L = ligar cabo · M = moldar cabo). Some quando nenhum modo está ativo. */
    _modoBannerTick() {
      const ct = this._container; if (!ct) return;
      let modo = null;
      if (this._redeCargaSt) modo = { t: '✋ MODO E — Carregando equipamento', d: 'E solta · Q devolve · R gira 90°', c: '#1f8f4a' };
      else if (this._caboLigSt) modo = { t: '🔌 MODO L — Ligar cabo', d: 'clique nas portas · Q desmarca · L sai', c: '#2f6fdb' };
      else if (this._caboMoldarSt) modo = { t: '✏️ MODO M — Moldar cabo', d: 'arraste os nós · B reta/curva · X exclui · Q solta · M sai', c: '#d98a1a' };
      let el = this._modoBannerEl;
      if (!modo) { if (el) { el.remove(); this._modoBannerEl = null; } return; }
      if (!el || !el.isConnected) {
        el = document.createElement('div'); el.className = 'v3d-modo-banner';
        el.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);z-index:60;pointer-events:none;text-align:center;color:#fff;border-radius:10px;padding:7px 18px;box-shadow:0 4px 18px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.35);white-space:nowrap;max-width:94%;';
        ct.appendChild(el); this._modoBannerEl = el;
      }
      const key = modo.t + '|' + modo.d;
      if (el._k !== key) { el._k = key; el.style.background = modo.c; el.innerHTML = '<div style="font-weight:700;font-size:15px;letter-spacing:.3px">' + modo.t + '</div><div style="font-size:11.5px;opacity:.92">' + modo.d + '</div>'; }
      const tb = ct.querySelector('.camera-topbar');
      const top = tb ? (tb.getBoundingClientRect().bottom - ct.getBoundingClientRect().top + 8) : 56;
      const t = Math.round(top) + 'px'; if (el.style.top !== t) el.style.top = t;
    },

    _updateRedeInteracao(dt) {
      const eng = this._engine; if (!eng || !eng._ready) return;
      try { this._modoBannerTick(); } catch (e) { /* faixa é só visual */ }
      const c = this._redeCargaSt;
      if (c) {
        try {
          const ray = eng.centerRay(this._camera);
          const est = eng.redeCarregarAlvo(c.obj, ray, { alcance: ALCANCE_PEGAR + 0.4, extraAng: c.extraAng });
          c.est = est; eng.redeCarregarAplicar(c.obj, est);
          const RE = raiz.RedeEquip, nome = RE.especificar(c.obj.tipo).rotulo;
          const msg = { rack: '🟦 Encaixa na <b>U' + est.u + '</b> do rack', 'rack-cheio': '🟥 Sem U livre aqui', apoio: '🟩 Sobre o objeto', chao: '🟩 No chão', mao: '✋ Na mão (solte para cair)' }[est.modo];
          this._redeHint('<b>' + esc(nome) + '</b> — ' + msg + '<br><span style="opacity:.75">E / clique: soltar · Q: devolver · R: girar 90°</span>');
        } catch (err) { console.error('[View3D] carregar item falhou:', err); this._redeCancelar(false); }
        return;
      }
      // [18/09/2026 UTC] NOVO (RODADA 169) -- modo "Ligar cabo" ativo: atualiza a faixa de ajuda com a
      // porta sob a mira a cada quadro (sem raycast quando ha uma confirmacao pendente, pra nao "piscar"
      // o texto que pede o 2o clique) em vez do hover de rotulo normal.
      if (this._caboLigSt) { this._caboLigAtualizarDica(); return; }
      // [19/09/2026 UTC] NOVO (RODADA 189) -- modo "Moldar cabo" ativo: atualiza a posição do nó sendo
      // arrastado a cada quadro (ver `_caboMoldarAtualizar`), mesmo padrão de `_caboLigSt` acima.
      if (this._caboMoldarSt) { this._caboMoldarAtualizar(); return; }
      this._hoverRotulo3D(dt);
      this._rotulosSempreAtualizar(); // [20/09/2026 UTC] RODADA 221 -- etiquetas 'always' (ver método abaixo)
      // [22/09/2026] MUDADO -- pedido verbatim: remover "a caixa de texto que aparece próxima ao
      // AP" (a etiqueta flutuante em Sprite/canvas), sem mexer no AP em si nem no resto da
      // funcionalidade de Wi-Fi. Chamada removida; `_atualizarEtiquetasAP` (abaixo) fica sem uso.
      // [22/09/2026] NOVO -- pedido verbatim: "Mesmo que saia do tela do AP e a varredura ainda
      // estiver acontecendo, uma barra deve aparecer próxima ao AP." Roda a cada quadro,
      // independente de qual painel/objeto está selecionado (ver `_atualizarBarrasProgressoAP`).
      this._atualizarBarrasProgressoAP();
      this._wfMiniAtualizarTodas(dt);
    },

    // ======================================================================
    // 3d) BARRA DE PROGRESSO (Sprite/canvas) de todo AP em varredura no mapa
    // ======================================================================
    /** [22/09/2026] NOVO -- itera todo AP do mapa que esteja `scanning === true` (não só o mirado/
     *  selecionado) e atualiza sua barra de progresso flutuante (`WifiSignal.AccessPoint#
     *  atualizarBarraProgresso`, ver comentário grande dela em wifi-signal.js) -- a varredura roda em
     *  segundo plano (rAF próprio, ver `AccessPoint._passo`) mesmo com o painel de propriedades fechado
     *  ou outro objeto selecionado, então a barra precisa do mesmo tratamento (mirror exato de
     *  `_atualizarEtiquetasAP`, que ficou sem uso — ver comentário acima). Um AP que NÃO está varrendo
     *  não paga custo nenhum aqui (`WS.para` só cria/reaponta a instância; `atualizarBarraProgresso`
     *  devolve cedo e remove a barra, se houver, quando `scanning` é `false`). */
    /** [22/09/2026] NOVO -- "Configurações 3D" → seção "📡 Access Point" → "Desligar o mapa de calor ao
     *  sair do 'Ver em 3D'". Chamada 1x por `View3D.unmount()` (ver view3d.js). Só entra em ação se a
     *  opção estiver ligada (padrão desligado -- comportamento de sempre preservado). Desliga `ap.mostrar`
     *  (o SETTER, não só a malha -- grava `mostrar2D = false` de verdade em `obj.rede.ap`), então a
     *  checkbox "mostrar mapa" do painel do AP volta DESMARCADA na próxima abertura -- "espelho do que
     *  realmente acontece" (pedido verbatim), já que o mapa de fato não vai estar visível. */
    _v3dSairDesligarMapasAP() {
      const WS = raiz.WifiSignal, cfg = window.MapConfig && window.MapConfig._cache;
      if (!WS || !cfg || !cfg.apDesligarMapaAoSairDoVer3D || !this._map || !Array.isArray(this._map.objects)) return;
      this._map.objects.forEach((o) => {
        if (!WS.ehAP(o)) return;
        const ap = WS.para(o, this._engine);
        if (ap.mostrar !== false) ap.mostrar = false;
      });
    },

    /** Chamado junto de `_v3dSairDesligarMapasAP` (ver `View3D.unmount()`). [28/09/2026] CORRIGIDO -- pedido
     *  verbatim: "Ao sair do 'Ver em 3D' (deixei a janelinha aberta lá) e, depois, voltar [...] ficou com
     *  duas janelinhas." Causa: desde que o container (`_wfMiniContainer`) passou a viver em
     *  `document.body` com `position:fixed` (pedido anterior: "mover por toda a tela do app", não mais só
     *  dentro de `this._container`), ele deixou de ser destruído junto com o resto da cena 3D ao sair do
     *  'Ver em 3D' -- só a REFERÊNCIA em memória (`this._wfMiniEls`) era limpa aqui, o `<div>` de verdade
     *  ficava órfão no body. Ao voltar pro 'Ver em 3D', uma instância NOVA de View3D criava outro container
     *  do zero (`_wfMiniAtualizarTodas`/`_wfMiniContainer`), daí 2 janelinhas pro mesmo AP. Agora remove o
     *  `<div>` de verdade do DOM antes de soltar a referência (`ap.miniJanela` continua salvo, a janelinha
     *  reaparece sozinha ao voltar). */
    _wfMiniLimparContainer() {
      if (this._wfMiniEls) {
        Object.keys(this._wfMiniEls).forEach((id) => {
          if (id === '_box') return;
          try { this._wfMiniEls[id].el._wfMiniDragCleanup && this._wfMiniEls[id].el._wfMiniDragCleanup(); } catch (e) { /* noop */ }
        });
        const box = this._wfMiniEls._box;
        if (box && box.parentNode) box.parentNode.removeChild(box);
      }
      this._wfMiniEls = null; this._wfMiniAcc = 0;
    },

    _atualizarBarrasProgressoAP() {
      const WS = raiz.WifiSignal, RE = raiz.RedeEquip, eng = this._engine;
      if (!WS || !RE || !this._map || !Array.isArray(this._map.objects)) return;
      // [22/09/2026] CORRIGIDO -- pedido verbatim: "ao fazer a varredura pelo AP, sair do 'Ver em 3D' e
      // entrar de novo, mesmo a opção 'mostrar mapa' do AP estando ativa, o mapa de calor do AP deixa de
      // ser mostrado." Causa: a malha (`ap.malha`, um `THREE.Mesh`) foi criada dentro do `_group` da cena
      // 3D ANTERIOR; ao sair do 'Ver em 3D' aquela cena/grupo é descartada, e ao entrar de novo uma engine
      // NOVA é criada (`this._engine` muda) -- `ap.malha` continua existindo no objeto `AccessPoint`
      // (que sobrevive entre entradas, ver `instancias` em wifi-signal.js), mas seu `.parent` é o GRUPO
      // VELHO, então `engine._group.add` nunca foi chamado de novo e nada aparece na cena nova, mesmo com
      // `mostrar2D` continuando `true` (daí o checkbox "mostrar mapa" continuar marcado, mas o mapa sumido).
      // Fix: uma vez por engine (`eng._wfRestaurado`, evita refazer a cada quadro), para cada AP com
      // `mostrar` ativo e uma varredura anterior (`ultimoResultado`) mas cuja malha não está mais anexada
      // à cena ATUAL, refaz a varredura (mesma config salva -- densidade/meshMode) em segundo plano, que
      // recria a malha já dentro do `_group` novo.
      if (eng && !eng._wfRestaurado) {
        eng._wfRestaurado = true;
        // [25/09/2026] NOVO -- pedido verbatim: "Ao voltar para o 'Ver em 3D', o AP acaba refazendo a sua
        // Varredura. Coloque isso como uma opção nas 'configurações 3D' [...] Por padrão desabilitada. A
        // outra opção é 'Manter a Varredura de Sinal Anterior'." Ver DEFAULTS.apRefazerVarreduraAoEntrarNoVer3D
        // em mapconfig.js. Com "Manter" (padrão), em vez de refazer o raycast do zero, só REANEXA a malha/
        // pontos/raios já calculados (sobrevivem entre entradas em "Ver em 3D", ver `instancias` em
        // wifi-signal.js) no grupo da cena NOVA -- `.add()` troca o `.parent` sozinho, sem custo nenhum de
        // raycasting. Só refaz de verdade quando NUNCA houve varredura nenhuma (`!ap.ultimoResultado`,
        // AP novo/nunca escaneado) -- aí não há nada pra reanexar.
        const cfg = window.MapConfig && window.MapConfig._cache;
        const refazer = !!(cfg && cfg.apRefazerVarreduraAoEntrarNoVer3D);
        this._map.objects.forEach((o) => {
          if (!WS.ehAP(o)) return;
          const ap = WS.para(o, eng);
          if (ap.mostrar === false) return;
          const jaNaCenaAtual = ap.malha && ap.malha.parent === eng._group;
          if (jaNaCenaAtual || ap.scanning || !ap.emiteSinal) return;
          if (!ap.ultimoResultado || refazer) {
            ap.startScan({ densidade: ap.densidade, meshMode: ap.meshMode });
          } else {
            if (ap.malha) eng._group.add(ap.malha);
            ap.cloudRaycastPorNivel.forEach((p) => { if (p) eng._group.add(p); });
            ap.raiosRaycastPorNivel.forEach((l) => { if (l) eng._group.add(l); });
          }
        });
      }
      this._map.objects.forEach((o) => {
        if (!WS.ehAP(o)) return;
        const ap = WS.para(o, eng);
        ap.atualizarBarraProgresso();
        // [29/09/2026] NOVO -- pedido verbatim: "ao clicar em 'Varredura avançada' deve aparecer uma
        // barrinha enchendo também [...] Se um botão for clicado e a barrinha do outro estiver lá ainda,
        // elas devem coexistir." Mesmo padrão da chamada acima, só que pro motor avançado (Sprite SEPARADO,
        // ver `atualizarBarraProgressoAvancado`/wifi-signal.js -- por isso as duas convivem sem conflito).
        ap.atualizarBarraProgressoAvancado();
      });
    },

    // ======================================================================
    // 3c) ETIQUETA (Sprite/canvas) de todo Access Point do mapa
    // ======================================================================
    /** [22/09/2026] DESATIVADO -- pedido verbatim: "a caixa de texto que aparece próxima ao AP,
     *  não o AP e tudo dele [deve ser removida]." Método mantido (não é mais chamado por
     *  `_updateRedeInteracao` acima) só para não quebrar nada que porventura ainda referencie
     *  `WifiSignal.AccessPoint#atualizarEtiqueta`/`#removerEtiqueta` diretamente. */
    _atualizarEtiquetasAP() {
      const WS = raiz.WifiSignal, RE = raiz.RedeEquip, eng = this._engine;
      if (!WS || !RE || !this._map || !Array.isArray(this._map.objects)) return;
      this._map.objects.forEach((o) => {
        if (!WS.ehAP(o)) return;
        const ap = WS.para(o, eng), r = RE.garantirRede(o);
        ap.atualizarEtiqueta(r.labelID || RE.especificar(o.tipo).rotulo);
      });
    },

    // ======================================================================
    // 3b) ROTULOS 'always' -- overlay HTML fixo no meio do cabo, projetado 3D->2D
    // ======================================================================
    /** [20/09/2026 UTC] NOVO (RODADA 221) -- implementação real do modo `cabo.etiquetaModo === 'always'`,
     *  deixado pra depois na RODADA 219 (até aqui se comportava como 'hover', ou seja, era um no-op).
     *  Cria/atualiza UM `<div>` HTML por cabo em modo 'always' (mapa `this._rotulosSempreEl`, chave
     *  `caboId`), ancorado na projeção 2D do ponto médio 3D da curva do cabo -- reaproveita a MESMA
     *  amostra de pontos (`eng._cabosInfo.get(id).pts`) que `Engine3D.rebuildCabos` já calculou pra
     *  montar o tubo (`_buildTuboEstavel`/`_curvaDeRotaCabo`), pegando o ponto do meio da polilinha
     *  (índice `Math.floor(pts.length/2)`) em vez de recalcular uma curva/ponto médio diferente.
     *  Projeção 3D->2D: `THREE.Vector3.project(eng.camera3)` (câmera real usada pro render, não o
     *  estado `{x,y,z,yaw,pitch}` de `this._camera`) devolve coordenadas normalizadas (-1..1); convertidas
     *  em pixels usando o tamanho do container (mesma base de referência já usada pelo overlay de hover
     *  em `_hoverRotulo3D`, que também é posicionado como filho de `this._container`).
     *  Chamado a CADA quadro por `_updateRedeInteracao` (mesmo loop de render que já roda continuamente
     *  neste app) -- não há aqui nenhuma detecção de "câmera parada" pra só recalcular quando necessário;
     *  seria um refinamento de desempenho válido pra uma rodada futura, mas como o loop já roda a cada
     *  quadro de qualquer forma (sem isso, o resto da interação em 1ª pessoa também pararia), reprojetar
     *  estas divs a cada quadro não adiciona um custo novo de categoria (só umas multiplicações de
     *  matriz + um `style.transform` por cabo 'always', tipicamente poucas unidades). */
    _rotulosSempreAtualizar() {
      const eng = this._engine, THREE = eng && eng.THREE;
      if (!this._rotulosSempreEl) this._rotulosSempreEl = new Map(); // caboId -> <div>
      const vivos = new Set();
      if (eng && eng._ready && eng.camera3 && this._container && this._map && Array.isArray(this._map.cabos)) {
        const cw = this._container.clientWidth || 1, ch = this._container.clientHeight || 1;
        const vetorTmp = this._rotulosSempreVetor || (this._rotulosSempreVetor = new THREE.Vector3());
        this._map.cabos.forEach((c) => {
          if (c.etiquetaModo !== 'always') return;
          const info = eng._cabosInfo && eng._cabosInfo.get(c.id);
          if (!info || !Array.isArray(info.pts) || !info.pts.length) return;
          const meio = info.pts[Math.floor(info.pts.length / 2)];
          vetorTmp.set(meio.x, meio.y, meio.z).project(eng.camera3);
          // atras da camera (z>1 fora do frustum de perto) -- some, sem "teletransportar" pra tela
          if (vetorTmp.z > 1 || vetorTmp.z < -1) return;
          vivos.add(c.id);
          let div = this._rotulosSempreEl.get(c.id);
          if (!div) {
            div = document.createElement('div');
            div.className = 'v3d-rede-rotulo-fixo';
            div.style.cssText = 'position:absolute;transform:translate(-50%,-100%);z-index:53;pointer-events:none;background:rgba(15,20,28,.85);color:#e8ecf2;border:1px solid #4a5568;border-radius:6px;padding:3px 7px;font:11px system-ui,sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.35)';
            this._container.appendChild(div);
            this._rotulosSempreEl.set(c.id, div);
          }
          const txt = '🏷️ ' + esc(c.labelID || 'Cabo');
          if (div._txt !== txt) { div._txt = txt; div.innerHTML = txt; }
          const px = (vetorTmp.x * 0.5 + 0.5) * cw, py = (1 - (vetorTmp.y * 0.5 + 0.5)) * ch;
          div.style.left = px + 'px'; div.style.top = py + 'px';
          div.style.display = 'block';
        });
      }
      // remove/some as divs de cabos que saíram do modo 'always' (mudaram de modo, foram desligados,
      // ficaram fora do frustum, ou o mapa/engine ainda não está pronto)
      this._rotulosSempreEl.forEach((div, id) => {
        if (!vivos.has(id)) { div.remove(); this._rotulosSempreEl.delete(id); }
      });
    },

    // ======================================================================
    // 2b) [19/09/2026 UTC] NOVO (RODADA 189) -- MOLDAR CABO (tecla M liga/desliga o modo)
    // Pedido verbatim do usuário: "tento clicar nele para gerar uma subdivisão arrastável por aquele nó,
    // porém não acontece" -- essa mecânica não existia integrada ao app (só numa arquitetura de
    // referência isolada, `structured-cable-engine.js`, entregue antes mas nunca ligada ao projeto).
    // Mesmo padrão de modo dos outros 2 (`_redeCargaSt`/tecla E, `_caboLigSt`/tecla L): liga com a tecla
    // M (mira central, ponteiro travado, nenhuma ferramenta de construção ativa), Esc ou M de novo
    // encerra. Estado: `this._caboMoldarSt = { segurando: {caboId, index} | null }`.
    //   1º clique mirando o CORPO de um cabo (fora de qualquer ponto já existente) -- cria um ponto de
    //     controle novo ali (`Engine3D.caboInserirPontoExtra`) e já entra segurando ele.
    //   1º clique mirando um ponto de controle JÁ EXISTENTE (esferinha, ver `_caboMoldarDesenharAlcas`)
    //     -- pega ele pra mover, sem criar nada novo.
    //   Enquanto segurando: o ponto acompanha a mira a cada quadro, na MESMA distância da câmera em que
    //     foi pego/criado (`_caboMoldarAtualizar`) -- controle intuitivo sem precisar de um plano de
    //     arraste dedicado; ao mover a geometria usa `caboAtualizarTuboVivo` (barato, só este cabo, sem
    //     recalcular bunching de todos os outros cabos -- ver comentário em engine3d.js).
    //   2º clique -- solta o ponto onde está e roda 1 `rebuildCabos()` completo (reconcilia bunching/
    //     feixes com a nova forma), o modo continua ativo pra moldar mais pontos em seguida.
    // RESSALVA HONESTA: sem plano de arraste dedicado (o gizmo de referência tinha Ctrl pra trocar pra
    // plano horizontal) -- aqui o controle é só "acompanha a mira na distância atual da câmera", que cobre
    // a maioria dos casos mas é menos preciso pra ajustar SÓ a altura (Y) sem also mexer em X/Z. Também
    // não foi implementada remoção de ponto por tecla (ficou só `Engine3D.caboRemoverPontoExtra`,
    // acessível por código/futuro menu) -- fora do escopo verbatim desta rodada (só pediu a moldagem por
    // arraste + o conserto do encurvamento). NÃO TESTADO em navegador de verdade nesta sessão (sem
    // device_bash/Playwright disponível).
    // ======================================================================

    /** Liga o modo. */
    _caboMoldarIniciar() {
      if (this._redeCargaSt || this._caboLigSt) { toast('Termine a ação atual antes de moldar um cabo.', { type: 'warn', duration: 2400 }); return; }
      this._caboMoldarSt = { segurando: null };
      // [19/09/2026 UTC] NOVO (RODADA 190) -- liga a visibilidade das esferinhas dos nós (ver
      // `Engine3D.caboMoldarSetAtivo`) e reconstrói pra elas aparecerem já ao entrar no modo.
      if (this._engine && this._engine.caboMoldarSetAtivo) { this._engine.caboMoldarSetAtivo(true); this._engine.rebuildCabos(); }
      this._caboMoldarDesenharHud();
      if (this._container && !document.pointerLockElement) { const canvas = this._container.querySelector('canvas'); canvas && canvas.requestPointerLock && canvas.requestPointerLock().catch(() => {}); }
      toast('🧵 Modo "Moldar cabo" ativo — clique no corpo de um cabo pra criar um nó, ou num nó existente pra movê-lo.', { duration: 2800 });
    },

    /** Desliga o modo (Esc ou tecla M de novo). Se havia um ponto sendo segurado, a posição já fica na
     *  última posição (foi atualizado ao vivo a cada quadro). SEMPRE reconstrói ao sair (RODADA 190) —
     *  antes só reconstruía se houvesse um ponto em mãos, o que deixava as esferinhas visíveis mesmo
     *  depois de sair do modo quando o usuário saía sem estar segurando nada (pedido verbatim: "Ao sair
     *  deste modo, as esferas dos nós deixam de aparecer"). */
    _caboMoldarCancelar(avisar) {
      const st = this._caboMoldarSt; if (!st) return;
      this._caboMoldarSt = null; this._redeHint(null);
      this._caboMoldarLimparHud();
      // [19/09/2026 UTC] NOVO (RODADA 193) -- limpa os 2 indicadores visuais novos (destaque de
      // hover + guia vertical do Ctrl, ver `_caboMoldarAtualizar`/`_caboMoldarAtualizarGuiaVertical`
      // abaixo) -- senão ficariam "presos" na cena depois de sair do modo.
      if (this._engine && this._engine.scene) {
        if (this._caboMoldarHoverMesh) { this._engine.scene.remove(this._caboMoldarHoverMesh); this._caboMoldarHoverMesh.geometry?.dispose?.(); this._caboMoldarHoverMesh.material?.dispose?.(); this._caboMoldarHoverMesh = null; }
        this._caboMoldarAtualizarGuiaVertical(false);
      }
      if (this._engine) {
        if (this._engine.caboMoldarSetAtivo) this._engine.caboMoldarSetAtivo(false);
        this._engine.rebuildCabos();
      }
      if (avisar) toast('Modo "Moldar cabo" encerrado.', { duration: 1500 });
    },

    /** Clique enquanto o modo está ativo -- ver descrição do fluxo no comentário grande acima. */
    _caboMoldarClique() {
      const st = this._caboMoldarSt; if (!st) return;
      const eng = this._engine; if (!eng) return;
      if (st.segurando) {
        // solta: a posição já foi atualizada ao vivo em `_caboMoldarAtualizar` a cada quadro -- só falta
        // reconciliar bunching/feixes com 1 rebuild completo (mais caro, mas só roda ao SOLTAR, não a cada quadro).
        eng.rebuildCabos();
        st.segurando = null;
        toast('Nó fixado. Clique em outro cabo pra continuar moldando, ou Esc/M pra sair.', { duration: 2000 });
        return;
      }
      const ray = eng.centerRay(this._camera);
      // tenta pegar um ponto de controle JÁ EXISTENTE primeiro (senão, clicar em cima de um nó sempre criaria outro em cima)
      const alvoPonto = eng.caboPontoExtraSob ? eng.caboPontoExtraSob(ray.origin, ray.dir, 4.5, 0.06) : null;
      if (alvoPonto) {
        // [19/09/2026 UTC] NOVO (RODADA 194) -- guarda a posição de ORIGEM deste nó (a que ele já tinha
        // antes de ser pego agora) -- pedido verbatim: "Estando no modo 'M', ao clicar em um nó, deve
        // ser possível deselecioná-lo, de modo que o nó volte para a sua posição de origem." Ver a tecla
        // Q (mesmo espírito do Q de "devolver ao lugar de origem" já usado em `_redePegar`/`_redeCargaSt`
        // pra equipamentos de rede) em `_redeTeclas`/`_caboMoldarDesselecionar` logo abaixo -- desselecionar
        // um nó RECÉM-CRIADO (`novo:true`) o EXCLUI de volta (ele não tinha "origem" nenhuma antes deste
        // clique); desselecionar um nó JÁ EXISTENTE (`novo:false`) devolve pra este `origem` gravado aqui.
        const c = (this._map.cabos || []).find((x) => x.id === alvoPonto.caboId);
        const p = c && Array.isArray(c.pontosExtras) && c.pontosExtras[alvoPonto.index];
        st.segurando = { caboId: alvoPonto.caboId, index: alvoPonto.index, novo: false, origem: p ? { x: p.x, y: p.y, z: p.z } : null };
        toast('Movendo o nó — clique de novo pra soltar, Q desseleciona (volta à posição original).', { duration: 2200 });
        return;
      }
      const hit = eng.redeCaboSob ? eng.redeCaboSob(ray.origin, ray.dir, 4.5, 0.04) : null;
      if (!hit) { toast('Mire no corpo de um cabo pra criar um nó de controle.', { type: 'warn', duration: 1800 }); return; }
      const ponto = { x: ray.origin.x + ray.dir.x * hit.dist, y: ray.origin.y + ray.dir.y * hit.dist, z: ray.origin.z + ray.dir.z * hit.dist };
      const idx = eng.caboInserirPontoExtra(hit.caboId, ponto);
      if (idx == null) return;
      eng.caboAtualizarTuboVivo(hit.caboId);
      st.segurando = { caboId: hit.caboId, index: idx, novo: true, origem: null };
      toast('Nó criado — mova o mouse e clique de novo pra soltar, Q desseleciona (desfaz a criação).', { duration: 2400 });
    },

    /** [19/09/2026 UTC] NOVO (RODADA 194) -- tecla Q: desseleciona o nó sendo segurado (ver `st.segurando`
     *  em `_caboMoldarClique`) SEM confirmar a posição atual -- ao contrário do clique normal (que sempre
     *  FIXA a posição de onde a mira está no momento), Q desfaz a ação: um nó recém-CRIADO (`novo:true`)
     *  é removido de volta (`caboRemoverPontoExtra`, mesmo que não tivesse sido tocado nenhuma vez); um nó
     *  que já EXISTIA (`novo:false`) volta pra posição que tinha antes de ser pego (`origem`, gravado no
     *  instante do clique que o pegou). Mesmo espírito do Q de "devolver ao lugar de origem" já usado por
     *  `_redeCargaSt` (carregar equipamento de rede) -- só ativo enquanto `st.segurando` (Q sem nada
     *  segurado não faz nada, não sai do modo). */
    _caboMoldarDesselecionar() {
      const st = this._caboMoldarSt; if (!st || !st.segurando) return;
      const eng = this._engine; if (!eng) return;
      const { caboId, index, novo, origem } = st.segurando;
      if (novo) {
        if (eng.caboRemoverPontoExtra) eng.caboRemoverPontoExtra(caboId, index);
        toast('Criação de nó desfeita.', { duration: 1600 });
      } else if (origem && eng.caboMoverPontoExtra) {
        eng.caboMoverPontoExtra(caboId, index, origem);
        toast('Nó desselecionado — voltou para a posição original.', { duration: 1800 });
      }
      st.segurando = null;
      this._caboMoldarAtualizarGuiaVertical(false);
      if (eng.caboAtualizarTuboVivo) eng.caboAtualizarTuboVivo(caboId);
      eng.rebuildCabos();
    },

    /** [19/09/2026 UTC] NOVO (RODADA 192) -- ache o nó "alvo" da tecla B/X: o que está SENDO SEGURO
     *  (`st.segurando`), se houver, senão o que está sob a mira agora (mesma busca de `_caboMoldarClique`,
     *  `Engine3D.caboPontoExtraSob`). Devolve `{ caboId, index }` ou `null`. Compartilhado pelas duas
     *  ações abaixo -- pedido verbatim: "Deve ser possível excluir os nós do cabo e ativar desativar o
     *  bézier em partes do cabo [...] uma tecla pode servir para trocar de bézier para linha reta". */
    _caboMoldarAlvoNo() {
      const st = this._caboMoldarSt; if (!st) return null;
      if (st.segurando) return st.segurando;
      const eng = this._engine; if (!eng || !eng.caboPontoExtraSob) return null;
      const ray = eng.centerRay(this._camera);
      const alvo = eng.caboPontoExtraSob(ray.origin, ray.dir, 4.5, 0.06);
      return alvo ? { caboId: alvo.caboId, index: alvo.index } : null;
    },

    /** [19/09/2026 UTC] NOVO (RODADA 192) -- tecla X: exclui o nó segurado ou mirado (ver `_caboMoldarAlvoNo`).
     *  Pedido verbatim: "Deve ser possível excluir os nós do cabo". Se o nó excluído era o que estava sendo
     *  segurado, solta (`st.segurando = null`) antes -- senão o próximo `_caboMoldarAtualizar()` tentaria
     *  mexer num índice que não existe mais. Um `rebuildCabos()` completo reconcilia tudo (geometria do
     *  cabo, esferinhas restantes com índices recontados, bunching/feixes). */
    _caboMoldarExcluirNo() {
      const st = this._caboMoldarSt; if (!st) return;
      const alvo = this._caboMoldarAlvoNo();
      if (!alvo) { toast('Mire num nó (ou segure um) pra excluir.', { type: 'warn', duration: 1800 }); return; }
      const eng = this._engine; if (!eng || !eng.caboRemoverPontoExtra) return;
      const ok = eng.caboRemoverPontoExtra(alvo.caboId, alvo.index);
      if (!ok) return;
      if (st.segurando && st.segurando.caboId === alvo.caboId && st.segurando.index === alvo.index) st.segurando = null;
      eng.rebuildCabos();
      toast('Nó excluído.', { duration: 1500 });
    },

    /** [19/09/2026 UTC] NOVO (RODADA 192) -- tecla B: alterna o flag `reto` do nó segurado ou mirado (ver
     *  `_caboMoldarAlvoNo`) -- liga/desliga se o SEGMENTO SEGUINTE (deste nó até o próximo, na ordem
     *  geométrica do cabo) é bézier (curva, padrão) ou reta pura. Pedido verbatim: "ativar desativar o
     *  bézier em partes do cabo (a cor da bolinha pode ficar diferente para isso, uma tecla pode servir
     *  para trocar de bézier para linha reta), então, fica um traço reto mesmo". A cor da esferinha (ver
     *  `Engine3D.rebuildCabos`/`caboAtualizarTuboVivo`) já reflete o novo estado -- `caboAtualizarTuboVivo`
     *  também recalcula a geometria do tubo na hora (barato, sem reconciliar bunching -- suficiente aqui,
     *  já que só a FORMA do trecho mudou, não a posição de nenhum nó). */
    _caboMoldarAlternarBezier() {
      const alvo = this._caboMoldarAlvoNo();
      if (!alvo) { toast('Mire num nó (ou segure um) pra alternar bézier/reta.', { type: 'warn', duration: 1800 }); return; }
      const eng = this._engine; if (!eng || !eng.caboAlternarRetoPontoExtra) return;
      const reto = eng.caboAlternarRetoPontoExtra(alvo.caboId, alvo.index);
      if (reto == null) return;
      if (eng.caboAtualizarTuboVivo) eng.caboAtualizarTuboVivo(alvo.caboId); else eng.rebuildCabos();
      toast(reto ? '📏 Trecho seguinte: reta.' : '〰️ Trecho seguinte: bézier (curva).', { duration: 1800 });
    },

    /** Por quadro (chamado por `_updateRedeInteracao`): atualiza a faixa de ajuda e, se houver um ponto
     *  sendo segurado, sua posição. [19/09/2026 UTC] REESCRITO (RODADA 190) -- pedido verbatim: "Ao
     *  segurar ctrl dá para deslocá-lo verticalmente (em Y apenas). Se ctrl não estiver pressionado,
     *  então, dá para posicioná-lo no plano Z X." Antes o nó só acompanhava a mira "na mesma distância da
     *  câmera" (uma esfera, sem separar os eixos) -- agora:
     *   - SEM Ctrl: o nó desliza num plano HORIZONTAL (Y fixo, na altura atual do nó) -- interseção do
     *     raio da mira com esse plano, mesma técnica de `THREE.Plane`/`Ray.intersectPlane` já usada em
     *     outras ferramentas do app.
     *   - COM Ctrl (`this._keys.ControlLeft`/`ControlRight`, MESMA leitura de tecla física usada pela
     *     Trena 3D, não `e.ctrlKey` de um evento de clique -- aqui é por quadro, sem clique nenhum
     *     acontecendo): o nó sobe/desce travado no eixo vertical que passa por ele (X/Z fixos), reaproveitando
     *     `_trena3DClosestPointOnVerticalLine` -- a MESMA conta que a Trena 3D usa pra sua âncora vertical,
     *     em vez de duplicar a fórmula. */
    _caboMoldarAtualizar() {
      const st = this._caboMoldarSt; if (!st) return;
      const ctrlSegurado = !!(this._keys && (this._keys.ControlLeft || this._keys.ControlRight));
      this._redeHint(st.segurando
        ? ('🧵 <b>Moldar cabo</b> — ' + (ctrlSegurado ? 'Ctrl: movendo só em <b>Y</b> (altura)' : 'movendo no plano <b>X/Z</b> (solte Ctrl p/ isso, segure Ctrl p/ mover só a altura)') + '<br><span style="opacity:.75">Clique solta · Esc ou M cancela</span>')
        : '🧵 <b>Moldar cabo</b> — mire no corpo de um cabo e clique<br><span style="opacity:.75">Esc ou M cancela</span>');
      const eng = this._engine; if (!eng) return;
      if (!st.segurando) {
        // [19/09/2026 UTC] NOVO (RODADA 193) -- pedido verbatim: "Ao apontar para o cabo, um destaque
        // deve aparecer onde o hit test está batendo no cabo (indicando que, se clicar ali, é ali que o
        // nó será inserido)." Mesma busca (na mesma ordem) de `_caboMoldarClique`/`_caboMoldarAlvoNo` --
        // nó já existente sob a mira ganha um destaque MAIOR (ciano, "vai mover"); corpo do cabo sob a
        // mira, sem nó ali, ganha um marcador MENOR no ponto exato onde o clique inseriria um nó novo
        // (branco, "vai criar"). Sem nada sob a mira, o destaque some.
        const mesh = this._caboMoldarGarantirHoverMesh();
        this._caboMoldarAtualizarGuiaVertical(false);
        if (mesh) {
          const ray = eng.centerRay(this._camera);
          const alvoPonto = eng.caboPontoExtraSob ? eng.caboPontoExtraSob(ray.origin, ray.dir, 4.5, 0.06) : null;
          if (alvoPonto) {
            const c = (this._map.cabos || []).find((x) => x.id === alvoPonto.caboId);
            const p = c && Array.isArray(c.pontosExtras) && c.pontosExtras[alvoPonto.index];
            if (p) {
              mesh.position.set(p.x, p.y, p.z);
              mesh.scale.setScalar(1.35);
              mesh.material.color.setHex(0x35e0ff);
              mesh.visible = true;
            } else mesh.visible = false;
          } else {
            const hit = eng.redeCaboSob ? eng.redeCaboSob(ray.origin, ray.dir, 4.5, 0.04) : null;
            if (hit) {
              mesh.position.set(ray.origin.x + ray.dir.x * hit.dist, ray.origin.y + ray.dir.y * hit.dist, ray.origin.z + ray.dir.z * hit.dist);
              mesh.scale.setScalar(0.7);
              mesh.material.color.setHex(0xffffff);
              mesh.visible = true;
            } else mesh.visible = false;
          }
        }
        return;
      }
      if (this._caboMoldarHoverMesh) this._caboMoldarHoverMesh.visible = false;
      const c = (this._map.cabos || []).find((x) => x.id === st.segurando.caboId);
      const atual = c && Array.isArray(c.pontosExtras) && c.pontosExtras[st.segurando.index];
      if (!atual) { st.segurando = null; return; }
      const ray = eng.centerRay(this._camera);
      let novo;
      if (ctrlSegurado) {
        // trava X/Z no valor atual, só a altura (Y) segue a mira -- reaproveita a mesma conta da âncora vertical da Trena 3D.
        const p = this._trena3D._trena3DClosestPointOnVerticalLine(ray, atual.x, atual.z);
        novo = p ? { x: atual.x, y: p.y, z: atual.z } : atual;
      } else {
        // plano horizontal na altura ATUAL do nó -- interseção simples do raio com Y = atual.y.
        const THREE = eng.THREE;
        const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -atual.y);
        const alvo = new THREE.Vector3();
        const rOrigin = new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z);
        const rDir = new THREE.Vector3(ray.dir.x, ray.dir.y, ray.dir.z);
        const raio3 = new THREE.Ray(rOrigin, rDir);
        novo = raio3.intersectPlane(plano, alvo) ? { x: alvo.x, y: atual.y, z: alvo.z } : atual;
      }
      // [19/09/2026 UTC] NOVO (RODADA 195) -- pedido verbatim: "No modo 'M' do cabo, otimize para
      // quando está movendo o nó e se olha em volta. Cliquei para reposicionar um nó, direcionei o
      // olhar da câmera para o céu e o fps caiu." CAUSA RAIZ: `caboMoverPontoExtra` +
      // `caboAtualizarTuboVivo` (esta última reconstrói a geometria do tubo INTEIRO do cabo -- desde a
      // RODADA 195/item 3, via `_buildTuboEstavel`, mais cara por quadro que o antigo
      // `THREE.TubeGeometry` nativo) rodavam TODO QUADRO enquanto um nó estava sendo segurado, MESMO
      // quando `novo` saía idêntico a `atual` -- que é exatamente o que acontece ao olhar pro céu: o
      // raio da mira fica quase paralelo ao plano horizontal Y=atual.y, `intersectPlane` devolve
      // `null`, e o `else` de `novo = ... : atual` mantém o MESMO ponto de antes -- rebuild completo do
      // tubo por nada, só por a câmera ter girado (posição dela não mudou, só o olhar). Corrigido
      // comparando `novo` com `atual` primeiro (epsilon pequeno, tolerância de ponto flutuante) -- o
      // caro (mover o ponto + reconstruir o tubo) só roda quando a posição de verdade muda.
      const EPS = 1e-6;
      const mudou = Math.abs(novo.x - atual.x) > EPS || Math.abs(novo.y - atual.y) > EPS || Math.abs(novo.z - atual.z) > EPS;
      if (mudou) {
        eng.caboMoverPontoExtra(st.segurando.caboId, st.segurando.index, novo);
        eng.caboAtualizarTuboVivo(st.segurando.caboId);
      }
      // [19/09/2026 UTC] NOVO (RODADA 193) -- pedido verbatim: "Ao segurar o ctrl, uma linha tracejada
      // laranja perpendicular ao chão deve ser desenhada entre o chão e o infinito passando pelo ponto
      // do nó. Para que seja possível visualizar a linha do deslizar em Y do nó alvo." Continua
      // atualizando (barata, só reposiciona uma linha existente) mesmo sem mudança de posição -- ela
      // ainda precisa acompanhar `ctrlSegurado`/existir enquanto o nó estiver em mãos.
      this._caboMoldarAtualizarGuiaVertical(ctrlSegurado, novo.x, novo.z);
    },

    /** [19/09/2026 UTC] NOVO (RODADA 193) -- esferinha de destaque reutilizável (hover, ver
     *  `_caboMoldarAtualizar`) -- `wireframe` + `depthTest:false` pra ficar sempre visível por cima de
     *  tudo, sem disputar sombra/luz com a cena (mesmo espírito das esferinhas de nó normais). Criada uma
     *  única vez por "entrada no modo" (`this._caboMoldarHoverMesh` fica `null` de novo em
     *  `_caboMoldarCancelar`), só reposicionada/recolorida depois. */
    _caboMoldarGarantirHoverMesh() {
      if (this._caboMoldarHoverMesh) return this._caboMoldarHoverMesh;
      const eng = this._engine; if (!eng || !eng.scene || !eng.THREE) return null;
      const THREE = eng.THREE;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x35e0ff, wireframe: true, transparent: true, opacity: 0.85, depthTest: false }),
      );
      mesh.renderOrder = 998;
      mesh.visible = false;
      eng.scene.add(mesh);
      this._caboMoldarHoverMesh = mesh;
      return mesh;
    },

    /** [19/09/2026 UTC] NOVO (RODADA 193) -- liga/desliga/reposiciona a linha vertical tracejada laranja
     *  do guia de Ctrl (ver `_caboMoldarAtualizar`) -- reaproveita `Trena3D._trena3DBuildLinhaEstilizadaUmaVez`
     *  (MESMA técnica/estilo tracejado já usado pelas linhas de apoio da própria Trena 3D, não duplicada),
     *  do chão (y=0) até bem alto (y=60, aproximando o "infinito" pedido — alto o bastante pra cobrir
     *  qualquer pé-direito real do app) passando por `(x, z)`. Reconstrói a linha inteira a cada quadro
     *  enquanto ativa (só acontece durante um arraste com Ctrl segurado — baixo custo, MESMO padrão que
     *  `_caboMoldarAtualizar` já usa pro tubo do cabo em si). `ativo=false` só esconde (sem `x`/`z`). */
    _caboMoldarAtualizarGuiaVertical(ativo, x, z) {
      const eng = this._engine; if (!eng || !eng.scene) return;
      if (!ativo) {
        if (this._caboMoldarGuiaVerticalGroup) this._caboMoldarGuiaVerticalGroup.visible = false;
        return;
      }
      if (this._caboMoldarGuiaVerticalGroup) {
        eng.scene.remove(this._caboMoldarGuiaVerticalGroup);
        this._caboMoldarGuiaVerticalGroup.traverse((n) => { if (n.isMesh) { n.geometry?.dispose?.(); n.material?.dispose?.(); } });
        this._caboMoldarGuiaVerticalGroup = null;
      }
      if (!this._trena3D || !this._trena3D._trena3DBuildLinhaEstilizadaUmaVez) return;
      // [19/09/2026 UTC] CORRIGIDO (RODADA 194) -- pedido verbatim: "Ao segurar o ctrl, não está
      // aparecendo a linha tracejada laranja perpendicular ao chão." CAUSA RAIZ: `_trena3DBuildLinhaEstilizadaUmaVez`
      // (e, por baixo dela, `_trena3DBuildLinhaTracejadaEspessa`) espera `p1`/`p2` como `THREE.Vector3`
      // DE VERDADE -- chama `p1.distanceTo(p2)`, `.clone()` etc. -- mas esta chamada (RODADA 193) estava
      // passando objetos simples `{x,y,z}`, o que lança uma `TypeError` (método inexistente num objeto
      // puro) dentro do loop de render a cada quadro com Ctrl segurado; essa exceção era engolida
      // silenciosamente por quem chama `_caboMoldarAtualizar()` por quadro, então a linha nunca era
      // criada, sem nenhum erro visível na tela. Corrigido convertendo os pontos pra `THREE.Vector3` de
      // verdade antes de repassar adiante (mesmo `eng.THREE` já usado no resto deste arquivo).
      const THREE = eng.THREE;
      const grupo = this._trena3D._trena3DBuildLinhaEstilizadaUmaVez(
        new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 60, z), 0xff8c1a, { estiloLinha: 'tracejada', espessuraCm: 0.5, dashCm: 8, gapCm: 6 },
      );
      if (!grupo) return;
      grupo.renderOrder = 996;
      eng.scene.add(grupo);
      this._caboMoldarGuiaVerticalGroup = grupo;
    },

    /** [19/09/2026 UTC] NOVO (RODADA 190) -- pedido verbatim: "Quando o modo estiver ativo, deve
     *  aparecer na tela os botões de interação disponíveis." Painel fixo (canto superior direito, não
     *  atrapalha a mira central) listando os controles do modo "Moldar cabo" -- mesmo espírito visual da
     *  `_redeHint` (faixa de baixo), mas como uma lista fixa em vez de um texto que muda por quadro (o
     *  texto que MUDA por quadro, ex. "Ctrl: só Y" vs "X/Z", continua na `_redeHint`, ver
     *  `_caboMoldarAtualizar`). Não são botões CLICÁVEIS de verdade (o app inteiro usa mira central +
     *  teclado/clique físico, nunca um cursor de mouse livre em "Ver em 3D") -- são uma legenda visual dos
     *  atalhos disponíveis, o que atende o pedido de "aparecer na tela" as opções de interação. */
    _caboMoldarDesenharHud() {
      if (!this._container) return;
      this._caboMoldarLimparHud();
      const el = document.createElement('div');
      el.className = 'v3d-cabo-moldar-hud';
      el.style.cssText = 'position:absolute;top:12px;right:12px;z-index:55;pointer-events:none;background:rgba(15,20,28,.88);color:#e8ecf2;border:1px solid #3a4250;border-radius:8px;padding:8px 12px;font:12px system-ui,sans-serif;max-width:240px';
      el.innerHTML = '<div style="font-weight:600;margin-bottom:4px">🧵 Moldar cabo</div>'
        + '<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;opacity:.85">'
        + '<span><kbd style="padding:1px 5px;border:1px solid #3a4250;border-radius:4px">Clique</kbd></span><span>criar/pegar/soltar nó</span>'
        + '<span><kbd style="padding:1px 5px;border:1px solid #3a4250;border-radius:4px">Q</kbd></span><span>desselecionar (desfaz, volta à origem)</span>'
        + '<span><kbd style="padding:1px 5px;border:1px solid #3a4250;border-radius:4px">Ctrl</kbd></span><span>mover só em Y (altura)</span>'
        + '<span><kbd style="padding:1px 5px;border:1px solid #3a4250;border-radius:4px">B</kbd></span><span>alternar bézier/reta do nó</span>'
        + '<span><kbd style="padding:1px 5px;border:1px solid #3a4250;border-radius:4px">X</kbd></span><span>excluir o nó</span>'
        + '<span><kbd style="padding:1px 5px;border:1px solid #3a4250;border-radius:4px">M</kbd></span><span>sair do modo</span>'
        + '<span><kbd style="padding:1px 5px;border:1px solid #3a4250;border-radius:4px">Esc</kbd></span><span>sair do modo</span>'
        + '</div>';
      this._container.appendChild(el);
      this._caboMoldarHudEl = el;
    },

    _caboMoldarLimparHud() {
      if (this._caboMoldarHudEl) { this._caboMoldarHudEl.remove(); this._caboMoldarHudEl = null; }
    },

    // ======================================================================
    // 3) ROTULOS (labelID) — overlay ao apontar
    // ======================================================================
    _hoverRotulo3D(dt) {
      const eng = this._engine, RE = raiz.RedeEquip; if (!eng || !RE || !this._container) return;
      this._hoverAcc = (this._hoverAcc || 0) + (dt || 0);
      if (this._hoverAcc < 0.12) return; this._hoverAcc = 0;
      let el = this._hoverRotEl;
      const esconder = () => { if (el) el.style.display = 'none'; };
      if (!document.pointerLockElement || this._container.querySelector('.v3d-rede-menu,.v3d-rack-menu')) return esconder();
      if (!eng.mapData || !(eng.mapData.cabos && eng.mapData.cabos.length) && !(eng._redeRuntime && eng._redeRuntime.size)) return esconder();
      const ray = eng.centerRay(this._camera);
      const cabo = eng.redeCaboSob(ray.origin, ray.dir, 4.5, 0.03), alvo = eng.redeAlvoSob(ray.origin, ray.dir);
      let html = '';
      if (cabo && (!alvo || cabo.dist <= alvo.dist + 0.03)) {
        const c = (this._map.cabos || []).find((x) => x.id === cabo.caboId), info = eng._cabosInfo && eng._cabosInfo.get(cabo.caboId);
        // [20/09/2026 UTC] NOVO (RODADA 219) -- `etiquetaModo` 'hidden' suprime a etiqueta mesmo
        // com a mira em cima do cabo (pedido: "hidden: etiquetas ficam totalmente ocultas"). O modo
        // 'always' ainda cai neste MESMO overlay ancorado na mira central (ver ressalva no
        // changelog -- um overlay flutuante de verdade, projetado no ponto médio 3D da curva do
        // cabo na tela, fica pra uma próxima rodada) -- por ora só 'hidden' muda o comportamento.
        if (c && c.etiquetaModo === 'hidden') { /* segue pro `alvo` (porta) abaixo sem usar este cabo */ }
        else if (c) {
          const cat = RE.REDE_CATALOGO.CABOS[c.tipo] || {};
          html = '<div class="t">' + (c.labelID ? '🏷️ ' + esc(c.labelID) : '🔌 Cabo') + '</div><div class="s">' + esc(cat.rotulo || c.tipo) + (info ? ' · ' + info.comprimentoM.toFixed(2).replace('.', ',') + ' m' : '') + (c.length > 0 ? ' (cabo de ' + c.length + ' m)' : '') + '</div>'
            + (info && info.esticado ? '<div class="w">⚠ Cabo curto: rota maior que o comprimento do cabo</div>' : '') + (c.avisos || []).map((a) => '<div class="w">⚠ ' + esc(a) + '</div>').join('');
        }
      } else if (alvo && alvo.kind === 'rede' && alvo.obj) {
        const o = alvo.obj, r = RE.garantirRede(o), n = eng.redePortaSob ? eng.redePortaSob(o, ray.origin, ray.dir) : null;
        const pr = n && r.portas && r.portas[n];
        if (r.labelID || (pr && pr.rotulo)) {
          html = '<div class="t">🏷️ ' + esc((pr && pr.rotulo) || r.labelID) + '</div><div class="s">' + esc(RE.especificar(o.tipo).rotulo) + (n ? ' · porta ' + n : '') + (r.labelID && pr && pr.rotulo ? ' · ' + esc(r.labelID) : '') + '</div>';
        } else if (RE.ehAP(o.tipo) && raiz.WifiSignal) {
          // [24/09/2026] NOVO -- pedido verbatim: "Ao posicionar o cursor do mouse sobre um AP, deve
          // aparecer informações resumidas também. [ícone] Ponto de Acesso / [Faixa] [Potência] [número de
          // dispositivos conectados]." Sem etiqueta (`labelID`), o AP ainda ganha ESTE resumo (ao contrário
          // do resumo genérico de porta acima, que só aparece quando há rótulo definido).
          const WS = raiz.WifiSignal, ap = WS.para(o, eng), nDisp = ap.numDispositivos;
          html = '<div class="t">📡 Ponto de Acesso</div><div class="s">' + esc(ap.signalFrequency.replace('GHz', ' GHz')) + ' · ' + ap.powerDbm.toFixed(1).replace('.', ',') + ' dBm · ' + nDisp + ' dispositivo' + (nDisp === 1 ? '' : 's') + ' conectado' + (nDisp === 1 ? '' : 's') + '</div>';
        }
      }
      if (!html) return esconder();
      if (!el) {
        el = document.createElement('div'); el.className = 'v3d-rede-hover';
        el.style.cssText = 'position:absolute;left:50%;top:calc(50% + 26px);transform:translateX(-50%);z-index:54;pointer-events:none;background:rgba(15,20,28,.92);color:#e8ecf2;border:1px solid #4a5568;border-radius:8px;padding:5px 10px;font:12px system-ui,sans-serif;max-width:80vw;box-shadow:0 4px 14px rgba(0,0,0,.4)';
        el.innerHTML = '<style>.v3d-rede-hover .t{font-weight:600;font-size:13px}.v3d-rede-hover .s{opacity:.8}.v3d-rede-hover .w{color:#ffb454}</style><div class="c"></div>';
        this._container.appendChild(el); this._hoverRotEl = el;
      }
      const c = el.querySelector('.c'); if (c._h !== html) { c._h = html; c.innerHTML = html; }
      el.style.display = 'block';
    },

    // ======================================================================
    // 5) LIGAR CABO CLICANDO NAS PORTAS -- [18/09/2026 UTC] RODADA 169
    // ======================================================================
    // Pedido verbatim do usuario: "deve ter um jeito de poder ligar uma conexão na outra clicando nas
    // portas, em vez de ficar usando menus. Clica em uma porta confirma para ligar ali, depois, clique em
    // outra porta e confirma para ligar ali e estabelecer a conexão." Fluxo (mira central, sem menu
    // nenhum aberto): 1o clique numa porta MARCA (fica pendente); um 2o clique na MESMA porta CONFIRMA --
    // exige mirar a mesma porta de novo de proposito, pra um clique perdido/mira tremendo nao ligar um
    // cabo sem querer. Confirmada a origem, repete o mesmo mecanismo (marca/confirma) pra escolher o
    // destino -- ao confirmar o destino, `RedeEquip.conectar` cria o cabo na hora (mesmas validacoes/
    // avisos de compatibilidade do menu "Ligar a") e o modo CONTINUA ativo (origem/destino zerados), pra
    // encadear varias ligacoes seguidas sem reabrir nada -- exatamente o "ir no rack e poder ligar ali
    // mesmo... uma conexão na outra" do pedido. Esc ou a tecla L (que tambem liga o modo) encerram.

    /** Liga o modo. `this._caboLigSt = { a: {obj,porta}|null, pend: {obj,porta}|null }` -- `a` = origem ja
     *  confirmada (null = ainda escolhendo a origem); `pend` = porta marcada aguardando o 2o clique. */
    _caboLigIniciar() {
      const RE = raiz.RedeEquip; if (!RE) return;
      if (this._redeCargaSt) { toast('Termine a ação atual (soltar o item) antes de ligar um cabo.', { type: 'warn', duration: 2400 }); return; }
      this._container && this._container.querySelectorAll('.v3d-rede-menu,.v3d-rack-menu').forEach((n) => n.remove());
      this._menuFecharRede = null;
      this._caboLigSt = { a: null, pend: null };
      this._redeHint('🔌 <b>Ligar cabo</b> — mire numa porta<br><span style="opacity:.75">Esc ou L cancela</span>');
      if (this._container && !document.pointerLockElement) { const canvas = this._container.querySelector('canvas'); canvas && canvas.requestPointerLock && canvas.requestPointerLock().catch(() => {}); }
      // [19/09/2026 UTC] NOVO (RODADA 179) -- pedido verbatim: "O hover de destaque não deve cobrir
      // a porta, apenas destacá-la visualmente." O destaque GENÉRICO de raycasting do motor
      // (`Engine3D._hoverPick`, estilo 'hitbox' padrão) desenha uma caixa em volta do objeto
      // MIRADO INTEIRO (o switch/patch panel todo, não só a porta) -- ao mirar numa porta pequena
      // dentro de um equipamento grande, essa caixa acaba envolvendo/"cobrindo" a região da porta
      // visualmente. Suprime esse destaque genérico (mesmo mecanismo já usado pela Trena 3D via
      // `setHoverHighlightSuppressed`) enquanto o modo "Ligar cabo" está ativo -- o destaque da
      // PORTA em si passa a ser só o contorno fino desenhado por `_caboLigPortaDestaqueDesenhar`
      // (ver `_caboLigAtualizarDica`), que NÃO cobre a porta (linha, não caixa preenchida).
      if (this._engine && this._engine.setHoverHighlightSuppressed) this._engine.setHoverHighlightSuppressed(true);
      toast('🔌 Modo "Ligar cabo" ativo — mire numa porta e clique 2x pra confirmar cada ponta.', { duration: 2600 });
    },

    /** Desliga o modo (Esc, tecla L de novo, ou botão "Fechar" de um menu aberto por engano). */
    _caboLigCancelar(avisar) {
      if (!this._caboLigSt) return;
      this._caboLigSt = null; this._redeHint(null);
      this._caboLigGhostLimpar(); this._caboLigHoverLimpar(); this._caboLigPortaDestaqueLimpar();   // [19/09/2026 UTC] RODADA 174/179
      // [19/09/2026 UTC] NOVO (RODADA 179) -- religa o destaque genérico de raycasting do motor
      // (suprimido em `_caboLigIniciar`) ao sair do modo "Ligar cabo".
      if (this._engine && this._engine.setHoverHighlightSuppressed) this._engine.setHoverHighlightSuppressed(false);
      if (avisar) toast('Modo "Ligar cabo" encerrado.', { duration: 1500 });
    },

    /** [19/09/2026 UTC] NOVO (RODADA 202) -- pedido verbatim: "Implemente o Q para deselecionar a porta
     *  selecionada. Tanto para o 1º clique, quanto para o 2º clique de confirmação." Mesmo espírito de
     *  `_caboMoldarDesselecionar` (tecla Q do modo "Moldar cabo") -- desfaz só a marcação PENDENTE do
     *  clique mais recente, sem sair do modo "Ligar cabo" inteiro: com `st.pend` marcado (1º clique de
     *  uma porta, origem OU destino) e SEM origem confirmada ainda, limpa `pend` (volta a "mire numa
     *  porta"); com origem já confirmada (`st.a`) e `pend` marcado pro destino, limpa só `pend` (volta a
     *  "mire no destino", origem intacta); sem nada pendente, Q não faz nada (mesmo comportamento de Q em
     *  "Moldar cabo" sem nó em mãos). Não confundir com `_caboLigEscStack` (Esc) — Q SEMPRE desfaz um
     *  nível, nunca sai do modo inteiro (Esc, no nível mais raso, sai). */
    _caboLigDesselecionar() {
      const st = this._caboLigSt; if (!st) return;
      if (st.pend) {
        st.pend = null;
        this._redeHint(st.a
          ? ('🔌 Origem: <b>' + esc(st.a.obj.nome || raiz.RedeEquip.especificar(st.a.obj.tipo).rotulo) + ' · porta ' + st.a.porta + (st.a.lado === 'tras' ? ' (traseira)' : '') + '</b> — mire no destino<br><span style="opacity:.75">Esc ou L cancela</span>')
          : '🔌 <b>Ligar cabo</b> — mire numa porta<br><span style="opacity:.75">Esc ou L cancela</span>');
        toast('Seleção desfeita.', { duration: 1400 });
      }
      // sem `pend` (nada selecionado no momento) -- Q não faz nada, igual ao Q de "Moldar cabo".
    },

    /** [19/09/2026 UTC] NOVO (RODADA 202) -- pedido verbatim: "Implemente a pilha de esc para quando
     *  clicar em uma porta no modo 'L', pressionar esc e sair da seleção da porta, mas não sair da
     *  interação com o 'Ver em 3D'." Antes, Esc SEMPRE cancelava o modo "Ligar cabo" inteiro de uma vez
     *  (`_caboLigCancelar`), mesmo com uma porta já marcada — a pilha agora desfaz UM nível por vez,
     *  igual ao Esc de "Moldar cabo"/âncora da Trena 3D já fazem: (1) `pend` marcado -> desfaz só a
     *  marcação (mesmo efeito de Q, `_caboLigDesselecionar`); (2) sem `pend` mas com origem confirmada
     *  (`st.a`) -> desfaz a origem, volta a "mire numa porta" (mas continua no modo "Ligar cabo"); (3)
     *  nada marcado -> aí sim sai do modo inteiro (`_caboLigCancelar`, comportamento de sempre). Chamado
     *  de `_redeTeclas` no lugar de `_caboLigCancelar(true)` direto. */
    _caboLigEscStack() {
      const st = this._caboLigSt; if (!st) return;
      if (st.pend) { this._caboLigDesselecionar(); return; }
      if (st.a) {
        st.a = null;
        this._caboLigGhostLimpar();
        this._redeHint('🔌 <b>Ligar cabo</b> — mire numa porta<br><span style="opacity:.75">Esc ou L cancela</span>');
        toast('Origem desfeita.', { duration: 1400 });
        return;
      }
      this._caboLigCancelar(true);
    },

    // ======================================================================
    // 3b) GHOST em tempo real (linha da origem confirmada até a mira) + HOVER nas conexões
    // [19/09/2026 UTC] NOVO (RODADA 174) -- pedidos verbatim: "Implemente o ghost em tempo real
    // após a confirmação da 1ª conexão." e "Implemente hovers ao passar o cursor do mouse em cima
    // das conexões no modo (tecla 'L')." (retomando trabalho perdido numa compactação de sessão
    // anterior -- RODADA 170/173).
    // ======================================================================

    /** Remove a linha-fantasma (chamada ao cancelar/confirmar/trocar de origem). */
    _caboLigGhostLimpar() {
      const eng = this._engine, g = this._caboLigGhostGrp;
      if (!g) return;
      if (eng && eng.scene) eng.scene.remove(g);
      g.traverse((n) => { if (n.isMesh || n.isLine) { n.geometry && n.geometry.dispose(); n.material && n.material.dispose(); } });
      this._caboLigGhostGrp = null;
    },

    /**
     * (Re)desenha o ghost do cabo de `p0` (porta de origem, mundo, com normal `nA`) até `p1`
     * (ponto atual da mira, mundo, com normal aproximada `nB`) -- verde se `confirmando` (mirando
     * uma porta de destino válida), âmbar caso contrário. Recriado a cada quadro.
     * [19/09/2026 UTC] RODADA 180 (1a correção) -- trocado `THREE.Line` (linewidth ignorado na
     * maioria das GPUs, ficava invisível) por um cilindro fino de verdade via
     * `this._trena3D._trena3DBuildFatLine` (mesma técnica da Trena 3D).
     * [19/09/2026 UTC] RODADA 181 (2a correção) -- pedido verbatim do usuário, depois de ver o
     * cilindro reto: "Deve ser o próprio desenho do cabo mudando sua malha em tempo real de acordo
     * com a posição." Ou seja: o ghost não deveria ser uma linha reta simplificada, e sim usar a
     * MESMA malha curva do cabo de verdade (a "barriga"/caimento que um patch cord real tem,
     * calculada por `RedePassiva.rotaCabo`/`amostrarSpline`, e desenhada como um tubo suave via
     * `THREE.CatmullRomCurve3`/`TubeGeometry` -- EXATAMENTE a técnica de `Engine3D.rebuildCabos`,
     * só que recalculada a cada quadro com o ponto de destino ainda solto (a mira), em vez de uma
     * vez só quando o cabo já está confirmado). Isto é uma REIMPLEMENTAÇÃO PRÓPRIA aqui em
     * `view3d-rede.js`, só LENDO `RedePassiva.rotaCabo`/`amostrarSpline` (funções de dados puras,
     * sem nenhuma relação com `_redePortaMundo`/`rebuildCabos`) -- nenhuma linha de
     * `js/engine3d.js` foi tocada, respeitando a restrição em vigor nesta sessão. Se a rota curva
     * não puder ser calculada por qualqur motivo (`RedePassiva` ausente, erro inesperado), cai de
     * volta pro cilindro reto da RODADA 180 (`_trena3DBuildFatLine`) -- nunca fica sem nenhum
     * feedback visual.
     * [19/09/2026 UTC] RODADA 182 (3a correção) -- pedido verbatim do usuário: "Em vez de uma
     * esfera verde, deve ser o conector como vai ficar ali. Deve ser transparente de modo que dê
     * para ver o RJ 45 do switch ou patch panel". A marca na ponta solta (antes uma esfera genérica)
     * agora É o próprio CONECTOR (plug), só que semi-transparente -- MESMA geometria/posição/
     * orientação que `Engine3D.rebuildCabos` usa pro plug do cabo já confirmado
     * (`BoxGeometry(largura,altura,profundidade)`, deslocado `normal * 0.011` da face da porta,
     * girado por `rotY`) -- só a opacidade que muda (semi-transparente aqui, sólido no cabo
     * confirmado), pra dar exatamente a prévia "como vai ficar ali" sem esconder o RJ45/SFP por
     * baixo. `fibraDestino` (calculado em `_caboLigAtualizarDica` a partir do TIPO real da porta
     * sob a mira -- 'sfp'/'lc' = óptico) escolhe as dimensões certas (plug óptico é mais fino que
     * RJ45), mesma lógica de `rebuildCabos`. Só é desenhado quando `p1` vem de uma porta REAL
     * (`_redePortaMundo`, que preenche `p1.rotY`) -- sem porta sob a mira (ponta solta seguindo o
     * mouse), não há um conector "de verdade" pra prever, então volta pra pequena esfera de
     * referência de antes (mantém feedback visual mesmo nesse caso). O destaque da porta em si
     * (contorno fino, `_caboLigPortaDestaqueDesenhar`) já era desenhado tanto na escolha do 1º
     * ponto quanto do 2º -- não precisou de nenhuma mudança pra "também receber o destaque como na
     * definição do 1º ponto" (ver `_caboLigAtualizarDica`, chamada incondicional sempre que há
     * porta sob a mira).
     */
    _caboLigGhostDesenhar(p0, p1, confirmando, nA, nB, fibraDestino) {
      const eng = this._engine; if (!eng || !eng.scene || !eng.THREE) return;
      const THREE = eng.THREE, RP = raiz.RedePassiva;
      this._caboLigGhostLimpar();
      const g = new THREE.Group(); g.name = 'ghost-ligar-cabo';
      const cor = confirmando ? 0x5ad46a : 0xffc94d;

      // ---- malha curva de verdade (mesma técnica de Engine3D.rebuildCabos: rotaCabo -> amostrarSpline
      // -> CatmullRomCurve3 -> TubeGeometry), recalculada a cada quadro com o ponto/normal atuais. ----
      let tuboOk = false;
      if (RP && RP.rotaCabo && RP.amostrarSpline) {
        try {
          const ctrl = RP.rotaCabo(p0, nA || { x: 0, y: 0, z: 1 }, p1, nB || { x: 0, y: 0, z: -1 }, {});
          const pts = RP.amostrarSpline(ctrl, 10);
          if (pts && pts.length >= 2) {
            const vs = pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
            const curva = new THREE.CatmullRomCurve3(vs, false, 'catmullrom', 0.5);
            const segs = Math.min(120, Math.max(16, vs.length * 3));
            const tubo = new THREE.Mesh(
              new THREE.TubeGeometry(curva, segs, 0.0018, 6, false),
              new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: confirmando ? 0.8 : 0.6, depthTest: false, depthWrite: false }),
            );
            tubo.renderOrder = 999; tubo.frustumCulled = false;
            g.add(tubo);
            tuboOk = true;
          }
        } catch (e) { console.warn('[View3D] ghost do cabo: falha ao calcular a rota curva (RedePassiva.rotaCabo/amostrarSpline) -- usando linha reta de reserva.', e); }
      }
      if (!tuboOk) {
        // reserva -- RedePassiva indisponível ou rota inválida (ex.: p0 === p1): cilindro reto simples,
        // mesma técnica da RODADA 180, nunca deixa o modo "Ligar cabo" sem nenhum feedback visual.
        const v0 = new THREE.Vector3(p0.x, p0.y, p0.z), v1 = new THREE.Vector3(p1.x, p1.y, p1.z);
        const linha = this._trena3D._trena3DBuildFatLine ? this._trena3D._trena3DBuildFatLine(v0, v1, cor, 0.0025) : null;
        if (linha) { linha.frustumCulled = false; g.add(linha); }
      }

      // ---- marca na ponta de destino: o CONECTOR de verdade (semi-transparente) quando há uma
      // porta REAL sob a mira (`p1.rotY` só existe quando `p1` veio de `_redePortaMundo`); senão,
      // a pequena esfera de referência de sempre (ponta ainda solta, sem porta pra prever). ----
      if (p1.rotY !== undefined) {
        const larguraM = fibraDestino ? 0.0085 : 0.0125, alturaM = fibraDestino ? 0.0055 : 0.0095, profM = 0.022;
        const nx = p1.nx || 0, nz = p1.nz != null ? p1.nz : -1;
        const plug = new THREE.Mesh(
          new THREE.BoxGeometry(larguraM, alturaM, profM),
          new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false }),
        );
        plug.position.set(p1.x + nx * 0.011, p1.y, p1.z + nz * 0.011);
        plug.rotation.y = p1.rotY;
        plug.renderOrder = 999; plug.frustumCulled = false;
        g.add(plug);
      } else {
        const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
        esfera.position.set(p1.x, p1.y, p1.z); esfera.renderOrder = 999;
        esfera.frustumCulled = false;   // [19/09/2026 UTC] RODADA 179 -- mesmo motivo do comentário grande acima
        g.add(esfera);
      }
      eng.scene.add(g);
      this._caboLigGhostGrp = g;
    },

    /** Remove o contorno de destaque da porta sob a mira (chamado ao trocar/perder a porta-alvo, ou
     *  ao sair do modo "Ligar cabo"). */
    _caboLigPortaDestaqueLimpar() {
      const eng = this._engine, g = this._caboLigPortaDestaqueGrp;
      if (!g) return;
      if (eng && eng.scene) eng.scene.remove(g);
      g.traverse((n) => { if (n.isMesh || n.isLine) { n.geometry && n.geometry.dispose(); n.material && n.material.dispose(); } });
      this._caboLigPortaDestaqueGrp = null;
    },

    /**
     * (Re)desenha o CONTORNO fino (não preenchido) em volta da porta sob a mira -- pedido verbatim
     * do usuário: "O hover de destaque não deve cobrir a porta, apenas destacá-la visualmente."
     * [19/09/2026 UTC] NOVO (RODADA 179). Diferente do destaque genérico do motor (`_hoverPick`,
     * suprimido em `_caboLigIniciar` enquanto este modo está ativo — ver comentário lá), que desenha
     * uma caixa em volta do EQUIPAMENTO INTEIRO, este contorno usa o tamanho REAL da porta
     * (`p.w`/`p.h`, mm, do catálogo em `RedeEquip.especificar(tipo).portaPorN[n]`) e a posição/
     * orientação REAIS dela (`Engine3D._redePortaMundo`, já existente e usado só para LEITURA aqui —
     * nenhuma linha daquela função foi alterada, respeitando a restrição em vigor nesta sessão) --
     * é só uma LINHA fechada (retângulo, `THREE.LineLoop`), nunca uma face preenchida, então nunca
     * "cobre"/obscurece a porta por baixo dela; `depthTest:false` garante que fica sempre visível
     * (a porta pode estar num recuo/entalhe do painel).
     * @param {object} obj  objeto de rede (switch/patch panel/DIO/...) mirado.
     * @param {number} n    número da porta sob a mira.
     */
    // [19/09/2026 UTC] AMPLIADO (RODADA 202, corrigido na RODADA 204) -- pedido verbatim: "Implemente o
    // hover na parte de trás dos conectores." Ganhou o parâmetro `lado` ('frente'|'tras', default
    // 'frente'). RODADA 204: passou a usar `_redePortaMundoConectorTras` (a coordenada EXATA do conector
    // físico -- bloco IDC/jack) em vez de `_redePortaMundoLado` (que aponta pro "ponto de ruptura", 35mm
    // recuado -- usuário relatou "o destaque está no ar, mais atrás do que um objeto sólido", exatamente
    // esse recuo indevido pro contorno visual, que deve ficar colado na peça de verdade).
    _caboLigPortaDestaqueDesenhar(obj, n, lado) {
      const eng = this._engine, RE = raiz.RedeEquip; if (!eng || !eng.scene || !eng.THREE || !RE) return;
      const sp = RE.especificar(obj.tipo), p = sp && sp.portaPorN[n];
      const pm = lado === 'tras'
        ? (eng._redePortaMundoConectorTras ? eng._redePortaMundoConectorTras(obj, n) : null)
        : (eng._redePortaMundo ? eng._redePortaMundo(obj, n) : null);
      if (!p || !pm) { this._caboLigPortaDestaqueLimpar(); return; }
      const THREE = eng.THREE;
      this._caboLigPortaDestaqueLimpar();
      const K = 0.001;   // mm -> m, mesma constante usada em toda a integração com RedeEquip/engine3d
      const wM = (p.w || 14) * K, hM = (p.h || 14) * K;
      const cos = Math.cos(pm.rotY || 0), sin = Math.sin(pm.rotY || 0);
      const eps = 0.0025;   // 2,5 mm à frente da face -- evita "z-fighting" com o painel/entalhe da porta
      const nx = pm.nx || 0, nz = pm.nz != null ? pm.nz : 1;
      const corner = (dx, dy) => new THREE.Vector3(
        pm.x + dx * cos + nx * eps,
        pm.y + dy,
        pm.z - dx * sin + nz * eps,
      );
      const pts = [corner(-wM / 2, -hM / 2), corner(wM / 2, -hM / 2), corner(wM / 2, hM / 2), corner(-wM / 2, hM / 2)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const cor = 0xfff275;   // mesma cor do destaque genérico do motor (_hoverPick/_hoverWall/_hoverTile) -- consistência visual
      const mat = new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
      const loop = new THREE.LineLoop(geo, mat);
      loop.renderOrder = 998;
      loop.frustumCulled = false;
      const g = new THREE.Group(); g.name = 'destaque-porta-ligar-cabo';
      g.add(loop);
      eng.scene.add(g);
      this._caboLigPortaDestaqueGrp = g;
    },

    /** Zera o registro de qual cabo estava em hover (chamado ao sair do modo "Ligar cabo").
     *  [19/09/2026 UTC] RODADA 179 -- pedido verbatim do usuário: "Ao passar o cursor do mouse nos
     *  cabos, eles vão ficando azul claro [...] Isto não deveria acontecer." O hover em cabo NUNCA
     *  mais altera o `material.emissive` deles (ver `_caboLigAtualizarDica`) -- esta função, portanto,
     *  não tem mais nenhum material pra restaurar; mantida só pra zerar `_caboLigHoverCaboId` de forma
     *  simétrica ao resto do ciclo de vida do modo (chamada em `_caboLigCancelar`). */
    _caboLigHoverLimpar() {
      this._caboLigHoverCaboId = null;
    },

    /** Chamado pelo `onClick` do view3d.js (antes de qualquer outra lógica de clique) enquanto o modo
     *  está ativo. Mira numa porta (mesma detecção do menu — `Engine3D.redeAlvoSob`+`redePortaSob`),
     *  marca/confirma origem e destino, e conecta o cabo assim que o destino é confirmado. */
    // [19/09/2026 UTC] AMPLIADO (RODADA 201) -- pedido verbatim do usuario: "Atualmente, ao pressionar 'L',
    // só fica disponível ligar nas portas da frente do painel, deve ser possível ligar na parte de trás do
    // painel [...] não de forma automática". Troca `eng.redePortaSob` (só frente) por `eng.redePortaLadoSob`
    // (frente OU trás -- decide sozinho qual face o raio acerta primeiro, ver comentário grande da função
    // em engine3d.js) -- `st.a`/`st.pend` agora carregam também `lado` (`'frente'`|`'tras'`), repassado pra
    // `RedeEquip.conectar` como `ladoA`/`ladoB`. O restante do fluxo (2 cliques na mesma porta = confirma)
    // não muda.
    _caboLigClique() {
      const st = this._caboLigSt; if (!st) return;
      const RE = raiz.RedeEquip, eng = this._engine; if (!RE || !eng) return;
      const ray = eng.centerRay(this._camera);
      const alvo = eng.redeAlvoSob ? eng.redeAlvoSob(ray.origin, ray.dir) : null;
      if (!alvo || alvo.kind !== 'rede' || !alvo.obj) { toast('Mire numa porta de um switch/patch panel/DIO/tomada... e clique.', { type: 'warn', duration: 1800 }); return; }
      const obj = alvo.obj, sp = RE.especificar(obj.tipo);
      if (!sp || !sp.portas.length) { toast(sp.rotulo + ' não tem portas.', { type: 'warn', duration: 1800 }); return; }
      const alvoPorta = eng.redePortaLadoSob ? eng.redePortaLadoSob(obj, ray.origin, ray.dir) : (eng.redePortaSob(obj, ray.origin, ray.dir) ? { n: eng.redePortaSob(obj, ray.origin, ray.dir), lado: 'frente' } : null);
      if (!alvoPorta) { toast('Mire numa porta específica (mais de perto/de frente ou de trás, num patch panel/tomada).', { type: 'warn', duration: 1800 }); return; }
      const n = alvoPorta.n, lado = alvoPorta.lado;
      const nome = esc(obj.nome || sp.rotulo), ladoTxt = lado === 'tras' ? ' (traseira)' : '';
      if (!st.a) {
        if (st.pend && st.pend.obj === obj && st.pend.porta === n && st.pend.lado === lado) {
          st.a = st.pend; st.pend = null;
          this._redeHint('🔌 Início confirmado: <b>' + nome + ' · porta ' + n + ladoTxt + '</b><br><span style="opacity:.75">Mire na porta de destino e clique para marcar</span>');
          toast('Início: ' + nome + ', porta ' + n + ladoTxt + '. Agora mire no destino.', { duration: 1800 });
        } else {
          st.pend = { obj, porta: n, lado };
          this._redeHint('🔌 <b>' + nome + ' · porta ' + n + ladoTxt + '</b><br><span style="opacity:.75">Clique de novo NESTA porta para confirmar o início · Esc cancela</span>');
        }
        return;
      }
      if (obj === st.a.obj && n === st.a.porta) { toast('Escolha uma porta diferente da de início.', { type: 'warn', duration: 1600 }); return; }
      if (st.pend && st.pend.obj === obj && st.pend.porta === n && st.pend.lado === lado) {
        const origemNome = esc(st.a.obj.nome || RE.especificar(st.a.obj.tipo).rotulo);
        const res = RE.conectar(this._map, st.a.obj, st.a.porta, obj, n, { ladoA: st.a.lado, ladoB: lado });
        if (!res.ok) {
          toast(res.erro || 'Não foi possível conectar.', { type: 'warn', duration: 3200 });
          st.pend = null; st.a = null;
          this._caboLigGhostLimpar();   // [19/09/2026 UTC] NOVO (RODADA 174) -- limpeza na hora, sem esperar o próximo quadro
          this._redeHint('🔌 <b>Ligar cabo</b> — mire numa porta<br><span style="opacity:.75">Esc ou L cancela</span>');
          return;
        }
        raiz.DB.saveMap(this._map);
        this._engine.rebuildCabos();
        toast(res.avisos && res.avisos.length ? ('🔌 Cabo ligado (com aviso): ' + res.avisos[0]) : ('🔌 Cabo ligado: ' + origemNome + ' → ' + nome + ladoTxt + '.'), { type: res.avisos && res.avisos.length ? 'warn' : 'ok', duration: res.avisos && res.avisos.length ? 4200 : 2000 });
        st.a = null; st.pend = null;
        this._caboLigGhostLimpar();   // [19/09/2026 UTC] NOVO (RODADA 174)
        this._redeHint('🔌 <b>Ligar cabo</b> — mire numa porta<br><span style="opacity:.75">Mais uma ligação, se quiser · Esc ou L encerra</span>');
      } else {
        st.pend = { obj, porta: n, lado };
        const origemNome = esc(st.a.obj.nome || RE.especificar(st.a.obj.tipo).rotulo), origemLadoTxt = st.a.lado === 'tras' ? ' (traseira)' : '';
        this._redeHint('🔌 Origem: <b>' + origemNome + ' · porta ' + st.a.porta + origemLadoTxt + '</b> → destino <b>' + nome + ' · porta ' + n + ladoTxt + '</b><br><span style="opacity:.75">Clique de novo NESTA porta para confirmar e ligar o cabo · Esc cancela</span>');
      }
    },

    /** Por quadro (chamada por `_updateRedeInteracao`): mostra qual porta está sob a mira agora — só
     *  quando NÃO há uma confirmação pendente (senão o texto "clique de novo" piscaria a cada quadro).
     *  [19/09/2026 UTC] AMPLIADO (RODADA 174): (1) hover nas CONEXÕES (cabos) já existentes — mostra
     *  um balão com tipo/comprimento; (2) enquanto uma origem já está confirmada (`st.a`), desenha o
     *  GHOST em tempo real (linha da origem até o ponto atual da mira — verde mirando um destino
     *  válido, âmbar caso contrário).
     *  [19/09/2026 UTC] AMPLIADO (RODADA 179) -- 3 correções pedidas pelo usuário:
     *  (a) o hover num CABO não tinge mais o material dele de azul (`n.material.emissive.setHex(0x4a9eff)`,
     *  removido) -- o usuário reportou que os cabos "vão ficando azul claro" sem que isso fosse
     *  esperado; o hover continua detectando o cabo sob a mira (`hoverId`) só pra mostrar o balão de
     *  tipo/comprimento, sem alterar a aparência do cabo.
     *  (b) a porta sob a mira ganha um CONTORNO fino que não cobre a porta (`_caboLigPortaDestaqueDesenhar`
     *  -- ver comentário grande lá), em vez do destaque genérico do motor (caixa em volta do
     *  equipamento inteiro, suprimido em `_caboLigIniciar`).
     *  (c) toda a função agora roda dentro de um try/catch com `console.error` -- diagnóstico: o
     *  usuário reportou que o GHOST (item acima, RODADA 174) "ainda não está aparecendo"; revisão
     *  extensa do código nesta rodada não encontrou nenhum bug de LÓGICA (a condição `if (st.a)`, o
     *  cálculo de `p0`/`p1` via `_redePortaMundo` -- só LIDO aqui, não alterado -- e a chamada de
     *  `_caboLigGhostDesenhar` estão corretos; a técnica de desenhar um `THREE.Group` direto em
     *  `eng.scene` com `depthTest:false`/`renderOrder` alto é a MESMA já usada com sucesso pela Trena
     *  3D neste mesmo arquivo). Sem acesso a navegador nesta sessão pra reproduzir o
     *  problema ao vivo, a causa exata não pôde ser confirmada -- este try/catch garante que, SE
     *  houver uma exceção silenciosa em qualquer parte desta função (cabo hover, porta sob a mira, ou
     *  o próprio ghost), ela agora aparece no console do navegador (F12) em vez de simplesmente abortar
     *  a função sem nenhum rastro -- o que ajuda a identificar a causa real no próximo teste. Também
     *  foram adicionadas 2 proteções de baixo risco em `_caboLigGhostDesenhar` (`frustumCulled = false`
     *  na linha/esfera -- elimina uma classe conhecida de bug de culling incorreto pra geometrias
     *  pequenas/próximas da câmera; `depthWrite:false` -- prática correta pra overlays com
     *  `depthTest:false`, evita corromper o depth buffer pra desenhos seguintes no mesmo quadro). */
    _caboLigAtualizarDica() {
      const st = this._caboLigSt; if (!st || st.pend) return;
      const RE = raiz.RedeEquip, eng = this._engine; if (!RE || !eng) return;
      try {
        const ray = eng.centerRay(this._camera);

        // ---- hover nas conexões (cabos) já existentes -- SÓ detecção pro balão, SEM tingir o cabo
        // (RODADA 179: o tingimento azul foi removido -- pedido verbatim do usuário). ----
        const hit = eng.redeCaboSob ? eng.redeCaboSob(ray.origin, ray.dir, 4.5, 0.03) : null;
        const hoverId = hit ? hit.caboId : null;
        this._caboLigHoverCaboId = hoverId;   // mantido só como registro de estado (balão/possível uso futuro) -- sem efeito visual no cabo
        const caboInfo = hoverId && this._map && Array.isArray(this._map.cabos) ? this._map.cabos.find((c) => c.id === hoverId) : null;
        const cabosInfoEng = hoverId && eng._cabosInfo ? eng._cabosInfo.get(hoverId) : null;

        // ---- porta sob a mira ----
        // [19/09/2026 UTC] AMPLIADO (RODADA 201) -- `redePortaLadoSob` no lugar de `redePortaSob` (só
        // frente): a mira agora também detecta a TRASEIRA de uma porta keystone (patch panel/tomada).
        const alvo = eng.redeAlvoSob ? eng.redeAlvoSob(ray.origin, ray.dir) : null;
        const alvoPorta = (alvo && alvo.kind === 'rede' && alvo.obj) ? (eng.redePortaLadoSob ? eng.redePortaLadoSob(alvo.obj, ray.origin, ray.dir) : (eng.redePortaSob(alvo.obj, ray.origin, ray.dir) ? { n: eng.redePortaSob(alvo.obj, ray.origin, ray.dir), lado: 'frente' } : null)) : null;
        const n = alvoPorta ? alvoPorta.n : null, ladoAlvo = alvoPorta ? alvoPorta.lado : 'frente';

        // ---- contorno da porta sob a mira (RODADA 179 -- substitui o destaque genérico do motor,
        // suprimido em _caboLigIniciar, por um contorno do TAMANHO REAL da porta que não a cobre). ----
        if (alvo && n) this._caboLigPortaDestaqueDesenhar(alvo.obj, n, ladoAlvo);
        else this._caboLigPortaDestaqueLimpar();

        // ---- ghost (só quando já há origem confirmada) ----
        // [19/09/2026 UTC] RODADA 204 -- p0/p1 usam `_redePortaMundoConectorTras` (coordenada exata do
        // conector) quando `lado==='tras'`, em vez de `_redePortaMundoLado` (ponto de ruptura, 35mm
        // recuado) -- consistente com o contorno de destaque logo acima: a linha fantasma deve mirar o
        // mesmo ponto físico mostrado pelo destaque, não o ponto de transição usado só na malha final do
        // cabo já conectado.
        const _pontoLado = (o, po, ld) => ld === 'tras'
          ? (eng._redePortaMundoConectorTras ? eng._redePortaMundoConectorTras(o, po) : null)
          : (eng._redePortaMundo ? eng._redePortaMundo(o, po) : null);
        if (st.a) {
          const p0 = _pontoLado(st.a.obj, st.a.porta, st.a.lado);
          let p1 = null;
          if (alvo && n) p1 = _pontoLado(alvo.obj, n, ladoAlvo);
          // [19/09/2026 UTC] RODADA 181 -- normal de saída de cada ponta, pra `_caboLigGhostDesenhar`
          // calcular a rota curva de verdade (RedePassiva.rotaCabo) em vez de uma linha reta. `p0`/`p1`
          // (quando vêm de `_redePortaMundo`) já trazem `nx`/`nz` -- a mesma normal que `rebuildCabos`
          // usa pro cabo confirmado.
          const nA = p0 ? { x: p0.nx || 0, y: 0, z: p0.nz != null ? p0.nz : 1 } : null;
          // [19/09/2026 UTC] RODADA 182 -- tipo da porta de destino (RJ45 ou óptica), só quando há
          // uma porta REAL sob a mira -- usado por `_caboLigGhostDesenhar` pra desenhar o CONECTOR
          // do tamanho/formato certo (ver comentário grande lá).
          const fibraDestino = (alvo && n) ? (() => { const pDef = RE.especificar(alvo.obj.tipo).portaPorN[n]; return pDef && (pDef.tipo === 'sfp' || pDef.tipo === 'lc'); })() : false;
          let nB;
          if (p1) {
            nB = { x: p1.nx || 0, y: 0, z: p1.nz != null ? p1.nz : -1 };
          } else {
            // sem porta sob a mira: usa um ponto "solto" 2,2 m à frente da câmera na direção da
            // mira, só pra dar feedback visual de onde o cabo terminaria se confirmado agora --
            // a normal aproximada aponta de volta pra câmera (o jeito mais natural de uma ponta de
            // cabo "solta" ficar voltada pra quem está mirando).
            p1 = { x: ray.origin.x + ray.dir.x * 2.2, y: ray.origin.y + ray.dir.y * 2.2, z: ray.origin.z + ray.dir.z * 2.2 };
            const dx = ray.origin.x - p1.x, dz = ray.origin.z - p1.z, dl = Math.hypot(dx, dz) || 1;
            nB = { x: dx / dl, y: 0, z: dz / dl };
          }
          if (p0) this._caboLigGhostDesenhar(p0, p1, !!(alvo && n), nA, nB, fibraDestino);
          else { this._caboLigGhostLimpar(); console.warn('[View3D] modo "Ligar cabo": _redePortaMundo(st.a.obj, st.a.porta) devolveu null -- ghost não desenhado. obj/porta:', st.a.obj && st.a.obj.tipo, st.a.porta); }
        } else {
          this._caboLigGhostLimpar();
        }

        const baseLadoTxt = st.a && st.a.lado === 'tras' ? ' (traseira)' : '';
        const base = st.a ? ('🔌 Origem: <b>' + esc(st.a.obj.nome || RE.especificar(st.a.obj.tipo).rotulo) + ' · porta ' + st.a.porta + baseLadoTxt + '</b> — mire no destino') : '🔌 <b>Ligar cabo</b> — mire numa porta';
        // Hover num cabo tem prioridade no balão (só quando não há porta sob a mira nem origem
        // pendente — senão o texto do fluxo de conexão fica mais importante).
        if (caboInfo && !alvo) {
          const tipoInfo = (RE.REDE_CATALOGO && RE.REDE_CATALOGO.CABOS[caboInfo.tipo]) || {};
          const compTxt = cabosInfoEng ? (cabosInfoEng.comprimentoM.toFixed(2).replace('.', ',') + ' m' + (cabosInfoEng.esticado ? ' ⚠️ esticado' : '')) : '';
          this._redeHint('🧵 <b>' + esc(tipoInfo.rotulo || caboInfo.tipo) + '</b>' + (caboInfo.labelID ? ' · ' + esc(caboInfo.labelID) : '') + (compTxt ? '<br>' + compTxt : '') + '<br><span style="opacity:.75">Esc ou L cancela</span>');
          return;
        }
        if (alvo && n) {
          const nome = esc(alvo.obj.nome || RE.especificar(alvo.obj.tipo).rotulo), miraLadoTxt = ladoAlvo === 'tras' ? ' (traseira)' : '';
          this._redeHint(base + ': <b>' + nome + ' · porta ' + n + miraLadoTxt + '</b><br><span style="opacity:.75">Clique para marcar · Esc ou L cancela</span>');
        } else {
          this._redeHint(base + '<br><span style="opacity:.75">Esc ou L cancela</span>');
        }
      } catch (err) {
        // [19/09/2026 UTC] RODADA 179 -- ver nota grande no topo da função: diagnóstico do "ghost não
        // aparece". Se isto aparecer no console (F12) durante o teste, a mensagem/stack abaixo dizem
        // exatamente onde a função estava abortando antes de chegar no desenho do ghost.
        console.error('[View3D] modo "Ligar cabo" (_caboLigAtualizarDica) falhou:', err);
      }
    },

    // ======================================================================
    // 4) MENUS DO MODO EDICAO
    // ======================================================================

    /**
     * Menu de qualquer equipamento de rede (switch, patch panel, DIO, espelho, PDU, guia, Access Point...).
     * [21/09/2026 UTC] `opts.container`/`opts.map` -- pedido verbatim: "No mapa 2D, nas propriedades do
     * Access Point, deve ter um botão que faz aparecer a mesma janela que aparece no 'Ver em 3D', no 'Modo
     * Edição', quando aponta-se para um AP e clica nele." Fora do "Ver em 3D", `this._container`/`this._map`
     * (a cena/mapa da sessão 3D) podem não existir ainda nesta sessão -- `opts` permite ao chamador (o mapa
     * 2D, ver `abrirPainelEquipamento` mais abaixo) fornecer um container DOM próprio e o `mapData` do mapa
     * 2D. `this._engine` NUNCA é substituído (fica `null`/o que já era) -- todo trecho que dependeria dele
     * (varredura 3D, "Pegar", mirar portas, etc.) já está guardado com `if (this._engine)` neste método.
     */
    _openRedeMenu(obj, ray, opts) {
      opts = opts || {};
      const container = opts.container || this._container;
      if (!container || !raiz.RedeEquip) return;
      if (opts.map && !this._map) this._map = opts.map;   // só preenche se ainda não houver um mapa "vivo" da sessão 3D
      const RE = raiz.RedeEquip, RP = raiz.RedePassiva, DB = raiz.DB;
      if (this._menuFecharRede) this._menuFecharRede();
      container.querySelectorAll('.v3d-rede-menu').forEach((n) => n.remove());
      document.exitPointerLock && document.exitPointerLock();
      const sp = RE.especificar(obj.tipo), ehSw = RE.ehSwitch(obj.tipo), ehAp = RE.ehAP(obj.tipo) && !!raiz.WifiSignal, temPortas = sp.portas.length > 0;
      // [19/09/2026 UTC] NOVO (RODADA 174) -- Storage (baias) e No-break (tomadas de energia) usam
      // o mesmo mecanismo de "portas" do catálogo (RE.especificar), mas NÃO fazem sentido no
      // fluxo genérico de "Ligar a"/cabeamento estruturado (uma baia não é uma porta de rede) --
      // `ehBaia` desliga esse fluxo genérico e liga o painel próprio de baias mais abaixo.
      const ehBaia = sp.familia === 'storage', ehNobreak = RE.ehNobreak(obj.tipo);
      let sel = (ray && temPortas) ? (this._engine.redePortaSob(obj, ray.origin, ray.dir) || null) : null;
      if (!sel && ehAp && sp.portas.length === 1) sel = sp.portas[0].n;   // AP: só há 1 porta RJ-45, já vem selecionada
      // [22/09/2026] NOVO -- pedido verbatim: "Na tela do AP, separe tudo em seções acessíveis por abas na
      // parte superior... Seções: 'Access Point', 'Sinal', 'Porta'." Aba ATIVA guardada aqui (fecha sobre
      // `render`, abaixo) -- sobrevive a re-renders do MESMO painel (trocar de aba/mudar um campo re-chama
      // `render()`), mas reseta pra 'ap' cada vez que o painel é reaberto (nova chamada de `_openRedeMenu`).
      let apTabAtiva = 'ap';
      // [23/09/2026] NOVO -- pedido verbatim: "Deve ter um botão para mudar o modo de visualização da
      // janela do Access Point: 'normal' e 'em abas'. Por padrão, deve ficar 'normal'." Mesmo padrão de
      // `apTabAtiva` (fechado sobre `render`, sobrevive a re-renders do MESMO painel, reseta pra 'normal'
      // toda vez que o painel é reaberto). Em 'normal', as 3 seções (Access Point/Sinal/Porta) aparecem
      // TODAS ao mesmo tempo, uma embaixo da outra (sem a barra de abas nem o truque de altura fixa —
      // ver `dispAptab`/wiring mais abaixo); em 'abas', é o comportamento com abas já existente.
      let apModoPainel = 'normal';
      const el = document.createElement('div'); el.className = 'v3d-rede-menu';
      // [22/09/2026] CORRIGIDO -- pedido verbatim: "está aparecendo com duas barras de scroll". `el` tinha
      // `overflow:auto;max-height:86vh` AQUI *e* `corpo` (abaixo) tinha os dois de novo -- duas caixas com
      // scroll independente, uma dentro da outra, cada uma achando que é ela quem deve rolar. `el` agora só
      // define o tamanho MÁXIMO (sem overflow/scroll próprio); o scroll fica só no `corpo`.
      // [23/09/2026] MUDADO -- pedido verbatim: "a janela não deve ocupar toda a altura do 'Ver em 3D'" +
      // os botões de rodapé ("Ligar clicando nas portas"/"Pegar"/"Ficha do objeto") "devem ficar sempre
      // visíveis (como um rodapé)". `el` vira um FLEX COLUMN de altura máxima menor (78vh, era 86vh) com 3
      // filhos empilhados: `corpo` (o único que rola -- `flex:1;min-height:0`), e `rodape` (fixo embaixo,
      // fora do scroll, `flex:0 0 auto`, ver mais abaixo). O botão ✕ continua sobreposto (position:absolute)
      // por cima de tudo, sem entrar no fluxo flex.
      // [29/09/2026] NOVO -- pedido verbatim: "A janela do AP deve ter tamanho fixo." Antes, TODO equipamento
      // (inclusive o AP) usava só `min-width`/`max-width`/`max-height` -- a janela crescia/encolhia com o
      // conteúdo (nº de seções, abas, etc.), só travando num teto. Só o painel do AP agora ganha `width`/
      // `height` FIXOS (além do teto responsivo `max-width:92vw`/`max-height:78vh`, que ainda protege telas
      // pequenas) -- outros equipamentos (switch, patch panel, DIO...) continuam com o tamanho auto de sempre,
      // já que só o AP foi pedido. Com altura fixa, `corpo` (que já era `overflow:auto`, ver comentário acima)
      // passa a rolar sozinho sempre que o conteúdo não couber -- inclusive no modo 'Abas', onde cada aba tem
      // altura diferente: a aba ativa some se boa parte do espaço fixo, só rolando quando REALMENTE precisa.
      el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;' + (ehAp ? 'width:420px;height:640px;' : 'min-width:340px;') + 'max-width:92vw;max-height:78vh;background:rgba(20,24,32,.96);color:#e8ecf2;border:1px solid #3a4250;border-radius:10px;padding:0;font:13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);display:flex;flex-direction:column';
      // [26/09/2026] NOVO -- pedido verbatim: "Todo o cabeçalho da janela do AP deve ficar sempre
      // aparente. Os textos de título (que ficam acima e à esquerda), o botão 'Normal'/'Abas' e o botão
      // 'fechar'." Antes, o título (nome + subtítulo) entrava dentro de `corpo` (que rola) e o botão
      // Normal/Abas ficava lá dentro também -- ambos somem de vista ao rolar o painel. Agora viram um
      // `cabecalho` fixo (`flex:0 0 auto`, fora do scroll), irmão de `corpo`/`rodape`: título à esquerda
      // (`cabecalhoTitulo`) e os botões Normal/Abas + fechar à direita, na MESMA linha (`cabecalhoBotoes`).
      const cabecalho = document.createElement('div');
      cabecalho.style.cssText = 'flex:0 0 auto;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:10px 10px 8px 12px;border-bottom:1px solid #3a4250';
      const cabecalhoTitulo = document.createElement('div');
      cabecalhoTitulo.style.cssText = 'min-width:0;flex:1 1 auto';
      const cabecalhoBotoes = document.createElement('div');
      cabecalhoBotoes.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:6px';
      cabecalho.appendChild(cabecalhoTitulo); cabecalho.appendChild(cabecalhoBotoes);
      const corpo = document.createElement('div');
      corpo.style.cssText = 'overflow:auto;flex:1 1 auto;min-height:0;padding:4px 34px 12px 12px';
      // [23/09/2026] NOVO -- rodapé fixo (fora do scroll de `corpo`): "Ligar clicando nas portas"/"Pegar"/
      // "Ficha do objeto" + o texto de ajuda, preenchidos em `render()` (ver mais abaixo) e SEMPRE visíveis,
      // mesmo com o conteúdo de `corpo` rolado pra baixo.
      const rodape = document.createElement('div');
      rodape.style.cssText = 'flex:0 0 auto;padding:8px 34px 10px 12px;border-top:1px solid #3a4250';
      const btnX = document.createElement('button');
      btnX.type = 'button'; btnX.setAttribute('aria-label', 'Fechar'); btnX.textContent = '✕';
      btnX.style.cssText = 'flex:0 0 auto;background:transparent;border:none;color:#9aa3ad;font-size:18px;line-height:1;cursor:pointer;padding:2px 5px;border-radius:6px';
      btnX.onmouseenter = () => { btnX.style.background = 'rgba(255,255,255,.1)'; btnX.style.color = '#e8ecf2'; };
      btnX.onmouseleave = () => { btnX.style.background = 'transparent'; btnX.style.color = '#9aa3ad'; };
      cabecalhoBotoes.appendChild(btnX);
      el.appendChild(cabecalho); el.appendChild(corpo); el.appendChild(rodape);
      // [22/09/2026] NOVO -- pedido verbatim: "Toda janela que toma o foco no app, deve ficar mais à
      // frente das outras." Antes, este `el` só tinha um `z-index:60` fixo no `style.cssText` acima, sem
      // NENHUMA chamada de `Utils.bringToFront`/`WindowManager.focus` -- por isso a janela do AP abria por
      // baixo da janela de propriedades do objeto (2D), que já segue o padrão correto (ver `Utils.
      // bringToFront` em mapview.js, ex.: linhas 22449-22454/24749-24752). `Utils.releaseFront` no fechar
      // devolve o elemento pro seu z-index-base normal (mesmo padrão de `_hideOrRemovePanel`/
      // `_closeLayersPanelImpl` em mapview.js).
      const fechar = () => { if (ehAp) { const a0 = raiz.WifiSignal.para(obj, this._engine); a0.onProgress = null; a0.onDone = null; } raiz.Utils.releaseFront(el); el.remove(); window.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onFora, true); if (this._menuFecharRede === fechar) this._menuFecharRede = null; };
      btnX.onclick = () => fechar();
      const salvar = () => { DB.saveMap(this._map); };
      const reconstruir = () => { DB.saveMap(this._map); if (this._engine) this._engine.rebuildObjectIncremental(obj); };
      const nomeDe = (o) => (o.nome || RE.especificar(o.tipo).rotulo || o.tipo);
      const ICONE = { ap: '📡', switch: '🔀', patchpanel: '🧷', dio: '💡', tomada: '🔌', pdu: '⚡', guia: '〰️', bandeja: '🗄️', ventilacao: '🌀', frente: '⬛', abracadeira: '🪢' };
      const CABOS = RE.REDE_CATALOGO.CABOS;
      // [20/09/2026 UTC] NOVO (RODADA 219) -- paleta rápida de cores de mercado p/ cabeamento
      // estruturado (pedido verbatim do usuário) -- usada no seletor de cor por-cabo abaixo.
      const PALETA_CORES_CABO = [
        { hex: '#2f6fdb', nome: 'Azul' },
        { hex: '#d8362f', nome: 'Vermelho' },
        { hex: '#f0c419', nome: 'Amarelo' },
        { hex: '#2fb84a', nome: 'Verde' },
        { hex: '#111318', nome: 'Preto' },
        { hex: '#9aa3ad', nome: 'Cinza' },
        { hex: '#f2f4f7', nome: 'Branco' },
      ];
      const tiposCabo = Object.keys(CABOS).filter((k) => k !== 'console' && k !== 'fibra');
      const render = () => {
        const r = RE.garantirRede(obj), cabosObj = RE.cabosDoObjeto(this._map, obj.id);
        const estados = ehSw ? RE.estadosDasPortas(this._map, obj) : [];
        const ativas = estados.filter((x) => x === 'active').length;
        // [26/09/2026] MUDADO -- título (nome + subtítulo) sai daqui (que ia pra `corpo`, rolável) e vai
        // pro `cabecalhoTitulo`, fixo (ver `cabecalho` acima) -- fica sempre visível mesmo rolando o painel.
        cabecalhoTitulo.innerHTML = '<style>' + RE.REDE_LED_CSS + '</style><div style="font-weight:600;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (ICONE[sp.familia] || '📦') + ' ' + esc(sp.rotulo) + ' — ' + esc(nomeDe(obj)) + '</div>'
          + '<div style="opacity:.7;font-size:12px">' + (sp.alturaU ? sp.alturaU + 'U' : sp.alturaMm + ' mm') + (ehBaia ? ' · ' + sp.nPortas + ' baias' : (temPortas ? ' · ' + sp.nPortas + ' portas · ' + cabosObj.length + ' cabo(s)' : '')) + (obj.rackId && obj.rackU ? ' · rack, U' + obj.rackU : ' · fora de rack') + (ehSw ? ' · ' + ativas + ' porta(s) ativa(s)' : '') + '</div>';
        // [26/09/2026] NOVO -- botão "Normal ⇄ Em abas" (pedido verbatim: "deve ficar no mesmo nível do
        // botão 'fechar'") -- entra em `cabecalhoBotoes`, ANTES do ✕, só pro AP (único que tem abas).
        cabecalhoBotoes.querySelectorAll('[data-apmodo]').forEach((b) => b.remove());
        if (ehAp) {
          const btnModo = document.createElement('button');
          btnModo.type = 'button'; btnModo.setAttribute('data-apmodo', '1');
          btnModo.title = 'Alterna entre mostrar as 3 seções juntas (normal) ou uma aba de cada vez (em abas)';
          btnModo.style.cssText = 'background:transparent;border:1px solid #3a4250;border-radius:6px;color:#9aa3ad;font-size:11px;padding:3px 8px;cursor:pointer;white-space:nowrap';
          btnModo.textContent = apModoPainel === 'normal' ? '⬚ Normal' : '🗂️ Em abas';
          btnModo.onclick = () => { apModoPainel = apModoPainel === 'normal' ? 'abas' : 'normal'; render(); };
          cabecalhoBotoes.insertBefore(btnModo, btnX);
        }
        let html = '';
        // [25/09/2026] MUDADO -- pedido verbatim: "Na janela do AP, no modo de 'Abas', na aba '📡 Access
        // Point', deve ficar o que, atualmente está acima das três abas. O retângulo verde [...], o texto
        // 'Ligado', o botão 'Desligar', o campo para colocar o nome do host, o 'labelId' e o campo para
        // colocar o seu nome." Pro AP, este bloco (LED+Ligado/Desligar+hostname) some daqui de cima e vira
        // `htmlLigadoAp` -- inserido dentro da aba "📡 Access Point" mais abaixo, no lugar de aparecer
        // sempre (independente do modo Normal/Abas). Pra switch/patch panel/etc. (não-AP) nada muda.
        const htmlLigadoAp = (ehSw || ehAp) ? ('<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span class="rede-led ' + (r.ligado ? 'idle' : 'off') + '" title="' + (r.ligado ? 'Ligado — o equipamento está energizado.' : 'Desligado — o equipamento está sem energia.') + '"></span><b>' + (r.ligado ? 'Ligado' : 'Desligado') + '</b><button type="button" data-rp="1" style="' + BTN + '" title="' + (r.ligado ? 'Desliga o equipamento (para de emitir/passar sinal).' : 'Liga o equipamento.') + '">⏻ ' + (r.ligado ? 'Desligar' : 'Ligar') + '</button><input data-rh="1" placeholder="hostname" value="' + esc(r.hostname) + '" style="' + INP + ';flex:1;min-width:80px" title="Nome do equipamento na rede (uso interno de catalogação/identificação), não é o SSID transmitido pelo Wi-Fi."></div>') : '';
        if (!ehAp && htmlLigadoAp) html += htmlLigadoAp;
        // configuracao fisica das portas (DIO: conector/fibra; keystones: categoria/blindagem)
        let cfg = '';
        if (sp.familia === 'dio') {
          cfg += '<span>Conector</span><select data-cc="conector" style="' + INP + '">' + Object.keys(RP.CONECTORES).filter((k) => RP.CONECTORES[k].meio === 'fibra').map((k) => '<option value="' + k + '"' + ((r.conector || 'LC') === k ? ' selected' : '') + '>' + k + '</option>').join('') + '</select>';
          cfg += '<span>Fibra</span><select data-cc="fibra" style="' + INP + '">' + ['SMF', 'OM3', 'OM4'].map((k) => '<option value="' + k + '"' + ((r.fibra || 'SMF') === k ? ' selected' : '') + '>' + (RP.FIBRAS[k] ? RP.FIBRAS[k].rotulo || k : k) + '</option>').join('') + '</select>';
        } else if (sp.familia === 'patchpanel' || sp.familia === 'tomada') {
          cfg += '<span>Keystone</span><select data-cc="categoria" style="' + INP + '">' + Object.keys(RP.CATEGORIAS).map((k) => '<option value="' + k + '"' + ((r.categoria || 'cat6') === k ? ' selected' : '') + '>' + (RP.CATEGORIAS[k].rotulo || k) + '</option>').join('') + '</select>';
          cfg += '<span>Blindagem</span><select data-cc="blindagem" style="' + INP + '">' + Object.keys(RP.BLINDAGENS).map((k) => '<option value="' + k + '"' + ((r.blindagem || 'U/UTP') === k ? ' selected' : '') + '>' + k + '</option>').join('') + '</select>';
        }
        cfg += '<span>labelID</span><input data-lb="1" value="' + esc(r.labelID || '') + '" placeholder="ex.: PP-A01 / TOM-12" style="' + INP + '" title="Etiqueta física de identificação deste item no catálogo (aparece no rótulo ao passar a mira em cima). Não é o SSID nem nenhum nome transmitido pela rede — é só uma referência interna/inventário.">';
        // [25/09/2026] NOVO -- "campo para colocar o seu nome" (pedido verbatim, junto do bloco acima) --
        // não existia campo editável pro NOME do objeto (`obj.nome`) neste painel antes, só o título
        // estático no topo (`nomeDe(obj)`). Pro AP, entra junto do labelID dentro da aba "Access Point".
        const cfgNomeAp = ehAp ? ('<span>Nome</span><input data-on="1" value="' + esc(obj.nome || '') + '" placeholder="' + esc(sp.rotulo) + '" style="' + INP + '" title="Nome deste AP no catálogo (aparece nas listagens e no título desta janela). Vazio usa o nome padrão do tipo.">') : '';
        const htmlCfg = '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;padding:2px 0">' + cfg + cfgNomeAp + '</div>';
        if (!ehAp) html += htmlCfg;
        // [21/09/2026 UTC] NOVO -- painel do Access Point: faixa, potência, densidade da varredura, botão
        // "Refazer Varredura de Sinal" e barra de progresso animada (`scanProgress` 0-100, some ao chegar em 100%).
        if (ehAp) {
          const WS = raiz.WifiSignal, ap = WS.para(obj, this._engine), emite = ap.emiteSinal, res = ap.ultimoResultado, resAv = ap.ultimoResultadoAvancado;
          const opts = (mapa, atual) => Object.keys(mapa).map((k) => '<option value="' + k + '"' + (atual === k ? ' selected' : '') + '>' + esc(mapa[k].rotulo) + '</option>').join('');
          const apTabBtn = (id, label) => '<button type="button" data-aptab-btn="' + id + '" style="flex:1;padding:6px 4px;border:none;border-bottom:2px solid ' + (apTabAtiva === id ? '#4f8cff' : 'transparent') + ';background:transparent;color:' + (apTabAtiva === id ? '#e8ecf2' : '#9aa3ad') + ';cursor:pointer;font:inherit;font-size:12px">' + label + '</button>';
          // [23/09/2026] NOVO -- pedido verbatim: em modo 'normal' as 3 seções aparecem TODAS ao mesmo
          // tempo (sem a barra de abas/truque de altura fixa); em 'abas', só a ativa. Um pequeno
          // subtítulo substitui a aba como separador visual quando em 'normal'.
          const dispAptab = (id) => (apModoPainel === 'normal' ? 'block' : (apTabAtiva === id ? 'block' : 'none'));
          const subtitAptab = (label) => apModoPainel === 'normal' ? ('<div style="font-weight:600;font-size:12px;opacity:.75;margin:8px 0 4px;' + (label === '📡 Access Point' ? 'margin-top:0' : '') + '">' + label + '</div>') : '';
          html += '<style>' + WS.CSS + '</style><div>'
            // [26/09/2026] MUDADO -- o botão "normal ⇄ em abas" saiu daqui, agora vive no `cabecalho` fixo
            // (ver `cabecalhoBotoes` acima, montado no topo de `render()`), junto do botão fechar.
            // [22/09/2026] NOVO -- 3 abas (pedido verbatim, ver comentário grande de `apTabAtiva` acima).
            // Tamanho fixo entre abas: `_apTabsFixarAltura` (chamada no wiring, mais abaixo) mede a altura
            // NATURAL de cada `[data-aptab]` (mesmo as ocultas) e aplica a maior como `min-height` do
            // `#ap-tabs-content` -- trocar de aba nunca encolhe/cresce a janela. Só existe em modo 'abas'.
            + (apModoPainel === 'abas' ? ('<div style="display:flex;border-bottom:1px solid #3a4250;margin-bottom:8px">' + apTabBtn('ap', '📡 Access Point') + apTabBtn('sinal', '📶 Sinal') + apTabBtn('porta', '🔌 Porta') + '</div>') : '')
            + '<div id="ap-tabs-content">'
            + '<div data-aptab="ap" style="display:' + dispAptab('ap') + '">'
            + subtitAptab('📡 Access Point')
            // [25/09/2026] NOVO -- pedido verbatim: "deve ficar o que, atualmente está acima das três
            // abas. O retângulo verde [...], o texto 'Ligado', o botão 'Desligar', o campo para colocar o
            // nome do host, o 'labelId' e o campo para colocar o seu nome." (ver `htmlLigadoAp`/`htmlCfg`,
            // montados mais acima em `render()` — o mesmo bloco de sempre, só que agora só aparece AQUI
            // pro AP, em vez de sempre acima das abas.)
            + htmlLigadoAp + htmlCfg
            // [24/09/2026] NOVO -- pedido verbatim: "[ícone] Ponto de Acesso / [Faixa] [Potência] [número
            // de dispositivos conectados]" no tooltip ao mirar o AP em 3D (ver `_hoverRotulo3D` abaixo) --
            // o número de dispositivos é um CONTADOR PRÓPRIO (Wi-Fi não tem cabo físico por cliente pra
            // contar de verdade), editável aqui.
            + '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:4px"><span>Dispositivos conectados</span><input data-wf="numDispositivos" type="number" min="0" step="1" value="' + ap.numDispositivos + '" style="' + INP + '" title="Só um valor informativo (aparece no resumo ao apontar pro AP) — não afeta a varredura de sinal."></div>'
            // [25/09/2026] NOVO -- pedido verbatim: "deve ter uma opção para habilitar uma janelinha
            // simplista do AP (mesmo fechando a janela do AP, a janelinha deve ficar ativa, se a opção [...]
            // estiver habilitada)." Ver `_wfMiniHtml`/`_wfMiniAtualizarTodas` mais abaixo.
            + '<label style="font-size:12px;margin-top:6px;display:block" title="Mostra uma janelinha compacta e flutuante, com os mesmos controles principais, que continua na tela mesmo depois de fechar esta janela."><input type="checkbox" data-wf-mini="1"' + (ap.miniJanela ? ' checked' : '') + '> janelinha simplista (fica na tela mesmo fechando esta janela)</label>'
            + '</div>'   // fecha data-aptab="ap"
            + '<div data-aptab="sinal" style="display:' + dispAptab('sinal') + '">'
            + subtitAptab('📶 Sinal')
            // [24/09/2026] MUDADO -- pedido verbatim: "o texto 'Emitindo sinal - cabo conectado' deve ir
            // para a aba 'Sinal' [...] aparecendo na mesma ordem em que aparece, quando está no modo de
            // visualização 'Normal'" -- ou seja, primeira coisa dentro da aba/seção Sinal, antes de Faixa/
            // Potência (mantém a ordem visual de cima pra baixo que já existia em modo 'Normal').
            + '<div style="font-size:12px;margin-bottom:4px">📡 <b style="color:' + (emite ? '#3ecb6e' : '#ffb454') + '">' + (emite ? 'Emitindo sinal' : (!ap.isOn ? 'Desligado — sem sinal' : 'Sem cabo na porta RJ-45 — sem sinal')) + '</b> · ' + (ap.hasCableConnected ? 'cabo conectado' : 'sem cabo') + '</div>'
            + SEC_HDR('📶', 'Varredura normal')
            + '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:4px"><span>Faixa</span><select data-wf="frequencia" style="' + INP + '" title="Faixa de frequência do rádio (2,4 GHz / 5 GHz / 6 GHz) — muda o alcance físico e a potência padrão usada na varredura.">' + opts(WS.FAIXAS, ap.signalFrequency) + '</select>'
            // [21/09/2026 UTC] CORRIGIDO -- pedido verbatim: "coloque valores reais de potência de sinal de
            // dispositivos wi-fi do mercado. Por exemplo, 28 dBm (630 mW) em 2,4 GHz e 27 dBm (501 mW) em
            // 5 GHz." O campo continua em Watts (unidade que o motor de física usa), mas agora mostra o
            // equivalente em dBm ao lado (`WS.wattsParaDbm`) e o teto (`max`) foi de 100 W (irreal pra RF de
            // Wi-Fi) pra 2 W -- bem acima de qualquer faixa comercial, só pra não travar valores customizados.
            + '<span>Potência (W)</span><div style="display:flex;gap:6px;align-items:center"><input data-wf="potencia" type="number" min="0.01" max="2" step="0.001" value="' + ap.powerWatts + '" style="' + INP + ';flex:1" title="Potência de transmissão do rádio, em watts. Quanto maior, mais longe o sinal chega antes de cair abaixo do nível mais fraco."><span data-wf-dbm="1" style="font-size:11px;opacity:.7;white-space:nowrap">≈ ' + ap.powerDbm.toFixed(1).replace('.', ',') + ' dBm</span></div>'
            + '<span>Densidade da varredura</span><select data-wf="densidade" style="' + INP + '" title="Quantos raios são lançados pra medir o sinal. Mais denso = malha mais fiel aos obstáculos, porém mais lento.">' + opts(WS.DENSIDADES, ap.densidade) + '</select>'
            // [22/09/2026] NOVO -- seletor de `meshMode` (ver `MODOS_MALHA`/`optimizeSignalMesh` em
            // wifi-signal.js): permite aumentar a densidade da varredura sem inflar a malha renderizada.
            + '<span>Modo de malha</span><select data-wf="meshMode" style="' + INP + '" title="Malha real: 1 vértice por raio (sem otimização). Malha simplificada: mesma precisão de varredura, mas funde regiões planas em poucos polígonos e só refina onde há curvatura/obstáculos — recomendado.">' + opts(WS.MODOS_MALHA, ap.meshMode) + '</select></div>'
            + '<div style="font-size:11px;opacity:.6;margin-top:3px">Mais detalhada = mais raios = mais precisa e mais lenta (não trava a tela: roda em lotes por quadro). Potência padrão baseada em APs comerciais reais (28 dBm/630 mW em 2,4 GHz; 27 dBm/501 mW em 5 GHz).</div>'
            + '<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><button type="button" data-wf-scan="1" title="Relança os raios da varredura normal com a Faixa/Potência/Densidade/Modo de malha configurados acima." style="' + BTN + (emite ? '' : ';opacity:.5') + '"' + (ap.scanning ? ' disabled' : '') + '>🔄 Refazer Varredura de Sinal</button>'
            + (ap.scanning ? '<button type="button" data-wf-cancel="1" style="' + BTN + '" title="Interrompe a varredura normal em andamento.">Cancelar</button>' : '') + '</div>'
            // [22/09/2026] REMOVIDO -- pedido verbatim: "Retire o botão 'mostrar mapa' da varredura normal."
            + this._wfMalhaNiveisHtml(ap)
            // [24/09/2026] NOVO, [25/09/2026] AMPLIADO -- pedido verbatim: "além do controle de 'mostrar
            // mapa', deve ter um outro controle de exibir os pontos da última batida do raycaster [...] e
            // outra opção de ver os raios do raycaster" + "Faça os 'raios do raycaster' ir trocando a cor
            // conforme os níveis da malha de cor dos 5 níveis que tem [...] Cada parte do raio pode ser
            // ativada individualmente." -- 5 checkboxes de pontos + 5 de raios, 1 por nível de sinal (ver
            // `_wfNiveisHtml`/`_wfNiveisWire` mais abaixo, reaproveitados pela janelinha compacta também).
            + this._wfNiveisHtml(ap)
            + '<div class="wf-bar' + (ap.scanning ? '' : ' wf-fim') + '" data-wf-bar="1"><div class="wf-fill" data-wf-fill="1" style="width:' + ap.scanProgress + '%"></div></div>'
            + '<div data-wf-txt="1" style="font-size:11px;opacity:.8;min-height:14px">' + (ap.scanning ? 'Varrendo… ' + ap.scanProgress + '%' : '') + '</div>'
            + '<div style="font-size:11px;margin-top:2px"><span class="wf-leg" style="background:#22c55e;margin-left:0"></span>excelente<span class="wf-leg" style="background:#facc15"></span>médio<span class="wf-leg" style="background:#ef4444"></span>fraco/sem sinal'
            + (res ? ' · última varredura: ' + res.raios + ' raios em ' + res.tempoMs + ' ms · alcance ' + res.alcanceM.toFixed(1).replace('.', ',') + ' m' : '') + '</div>'
            // [22/09/2026] NOVO -- pedido verbatim: "Mostrar quantos pontos são usados para gerar toda a
            // malha dos níveis de sinal." `raiosBrutos` = amostragem física (sempre na densidade escolhida,
            // nunca reduzida); `pontosMalha`/`trianglesMalha` = o que de fato chega à GPU depois do
            // `meshMode` (idênticos entre si no modo 'malha_real' — ver `ultimoResultado` em wifi-signal.js).
            + (res ? '<div style="font-size:11px;opacity:.7;margin-top:2px">🔺 Malha: ' + res.pontosMalha.toLocaleString('pt-BR') + ' pontos / ' + res.trianglesMalha.toLocaleString('pt-BR') + ' triângulos'
              + (res.meshMode === 'malha_simplificada' ? ' (de ' + res.raiosBrutos.toLocaleString('pt-BR') + ' pontos amostrados · −' + Math.max(0, Math.round(100 - (res.pontosMalha / res.raiosBrutos) * 100)) + '%)' : ' (amostragem bruta, sem redução)') + '</div>' : '')
            // [29/09/2026] NOVO -- pedido verbatim: "Faça a opção de 'Vista em Corte' para a varredura
            // normal." Ver comentário grande de `_wfCorteHtml`/`WS.AccessPoint#atualizarCorte` (wifi-signal.js).
            + this._wfCorteHtml(ap)
            // [22/09/2026] NOVO -- painel do motor AVANÇADO (`WS.SignalPropagationEngine`, opt-in, coexiste
            // com a varredura de malha acima): reflexão/refração multi-salto, resultado em nuvem de pontos
            // (`THREE.Points`), só disponível com `this._engine` vivo (precisa da cena 3D pra lançar raios).
            + (this._engine ? (SEC_HDR('🛰️', 'Varredura avançada')
              // [29/09/2026] MUDADO -- pedido verbatim: "coloque o checkbox antes do '🛰️ Reflexão' e remova
              // o texto 'habilitada' [...] o mesmo pra Refração [...] Para os dois, o campo de número deve
              // vir logo à direita." Antes: `<span>🛰️ Reflexão</span><label><input checkbox> habilitada</label>`
              // (2 células de grid separadas, texto do nível redundante). Agora: 1 única célula
              // checkbox+rótulo (`<label>` com o input NA FRENTE do texto "🛰️ Reflexão"), e o campo numérico
              // continua na célula ao lado (2ª coluna do grid), like antes -- só que agora é a PRIMEIRA coisa
              // à direita do checkbox+rótulo, não de um `<span>` textual solto.
              + '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:4px">'
              + '<label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer" title="Raio que bate numa superfície pode ricochetear (mudando de direção) em vez de parar ali."><input type="checkbox" data-wfa="enableReflection"' + (ap.enableReflection ? ' checked' : '') + '> 🛰️ Reflexão</label><input data-wfa="maxReflections" type="number" min="0" max="5" step="1" value="' + ap.maxReflections + '" style="' + INP + '" title="Quantos ricochetes seguidos um mesmo raio pode dar antes de parar."' + (ap.enableReflection ? '' : ' disabled') + '>'
              + '<label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer" title="Raio que bate numa superfície pode continuar reto do outro lado (com perda de sinal pela espessura/material), como sinal atravessando paredes."><input type="checkbox" data-wfa="enableRefraction"' + (ap.enableRefraction ? ' checked' : '') + '> 🛰️ Refração</label><input data-wfa="maxRefractions" type="number" min="0" max="3" step="1" value="' + ap.maxRefractions + '" style="' + INP + '" title="Quantas superfícies seguidas um mesmo raio pode atravessar antes de parar."' + (ap.enableRefraction ? '' : ' disabled') + '>'
              + '<span>Limiar (dBm)</span><input data-wfa="rssiThreshold" type="number" min="-80" max="20" step="1" value="' + ap.rssiThreshold + '" style="' + INP + '" title="Abaixo deste dBm nem o ponto/raio é desenhado, e a varredura para de ricochetear ali — mesmo comportamento do fim de alcance da varredura normal.">'
              + '</div>'
              // [29/09/2026] NOVO -- pedido verbatim: "Na varredura avançada, deve ser possível ver a forma
              // 3D gerada com o mapa de calor do sinal (superfície mais externa (como na varredura normal)
              // e forma. Ambas por nível, os 5 níveis)." Ver comentário grande de `_wfMalhaNiveisAvancadaHtml`
              // acima -- malha calculada SEM reflexão/refração (mesma física da varredura normal, só que com
              // a Faixa/Potência/Densidade do motor avançado), reconstruída a cada "Varredura avançada".
              + this._wfMalhaNiveisAvancadaHtml(ap)
              // [22/09/2026] MUDADO -- pedido verbatim: "coloque os botões de níveis para os pontos e para os
              // raios, assim como na varredura normal. Retire os checkbox 'mostrar pontos' e 'mostrar raios',
              // pois os botões de níveis já vão executar esta função." Substitui os antigos checkboxes únicos
              // ("mostrar pontos"/"grade quadriculada"/"mostrar raios") pelos botões de nível de
              // `_wfNiveisAvancadaHtml` (mesmo padrão visual da varredura normal, `_wfNiveisHtml`).
              + this._wfNiveisAvancadaHtml(ap)
              + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px"><span style="font-size:12px;opacity:.7">Densidade dos raios</span><select data-wfa="avancadoDensidadeRaios" style="' + INP + '" title="Fração dos raios lançados que ganham uma linha desenhada na cena. Só vale a partir da próxima varredura avançada.">' + DENSIDADES_RAIOS_OPTS(ap.avancadoDensidadeRaios) + '</select></div>'
              // [22/09/2026] NOVO -- pedido verbatim: "configuração própria (com 'usar mesmas configurações')"
              // pro motor avançado: Faixa/Potência/Densidade PRÓPRIAS, ou espelhando o motor original (padrão).
              + '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #3a4250">'
              + '<label style="font-size:12px" title="Quando marcado, a varredura avançada usa a mesma Faixa/Potência/Densidade configuradas na Varredura normal acima, em vez de valores próprios."><input type="checkbox" data-wfa="avancadoUsarMesmoConfig"' + (ap.avancadoUsarMesmoConfig ? ' checked' : '') + '> usar as mesmas configurações do motor original (Faixa/Potência/Densidade)</label>'
              + (ap.avancadoUsarMesmoConfig ? '' : ('<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:4px">'
                + '<span>Faixa (motor avançado)</span><select data-wfa="avancadoFrequencia" style="' + INP + '" title="Faixa de frequência usada só pela varredura avançada.">' + opts(WS.FAIXAS, ap.avancadoFrequencia) + '</select>'
                + '<span>Potência (W, motor avançado)</span><input data-wfa="avancadoPotenciaW" type="number" min="0.01" max="2" step="0.001" value="' + ap.avancadoPotenciaW + '" style="' + INP + '" title="Potência de transmissão usada só pela varredura avançada.">'
                + '<span>Densidade (motor avançado)</span><select data-wfa="avancadoDensidade" style="' + INP + '" title="Densidade de raios usada só pela varredura avançada.">' + opts(WS.DENSIDADES, ap.avancadoDensidade) + '</select>'
                + '</div>'))
              + '</div>'
              + '<div style="font-size:11px;opacity:.6;margin-top:3px">Motor alternativo (Ray Launching multi-bounce): simula ricochete em paredes/vidros/metal e atravessamento com perda por material, gerando uma nuvem de pontos 3D à parte da malha acima. Mais realista, porém mais lento com densidade alta + reflexão/refração juntas.</div>'
              + '<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><button type="button" data-wfa-scan="1" title="Lança o motor de reflexão/refração multi-salto com as configurações acima, gerando uma nuvem de pontos 3D à parte da malha da varredura normal." style="' + BTN + (emite ? '' : ';opacity:.5') + '"' + (ap.motorAvancado.scanning ? ' disabled' : '') + '>🛰️ Varredura avançada (reflexão/refração)</button>'
              + (ap.motorAvancado.scanning ? '<button type="button" data-wfa-cancel="1" style="' + BTN + '" title="Interrompe a varredura avançada em andamento.">Cancelar</button>' : '')
              + (ap.cloudAvancado ? '<button type="button" data-wfa-clear="1" style="' + BTN + '" title="Remove a nuvem de pontos da última varredura avançada.">🗑️ Limpar nuvem</button>' : '') + '</div>'
              + '<div class="wf-bar' + (ap.motorAvancado.scanning ? '' : ' wf-fim') + '" data-wfa-bar="1"><div class="wf-fill" data-wfa-fill="1" style="width:' + (ap.motorAvancado.progress || 0) + '%"></div></div>'
              + '<div data-wfa-txt="1" style="font-size:11px;opacity:.8;min-height:14px">' + (ap.motorAvancado.scanning ? 'Varrendo (avançado)… ' + (ap.motorAvancado.progress || 0) + '%' : '') + '</div>'
              // [28/09/2026] NOVO -- pedido verbatim: "Na varredura avançada, coloque as mesmas informações
              // quanto a varredura avançada feita." Mesmo formato de 2 linhas do motor original (legenda +
              // 'última varredura: raios/tempo/alcance' e '🔺 Malha: pontos/triângulos'), usando
              // `ultimoResultadoAvancado` (ver wifi-signal.js) -- aqui não há malha fechada (é nuvem de
              // pontos), então a 2ª linha mostra raios totais/primários em vez de triângulos.
              + '<div style="font-size:11px;margin-top:2px"><span class="wf-leg" style="background:#22c55e;margin-left:0"></span>excelente<span class="wf-leg" style="background:#facc15"></span>médio<span class="wf-leg" style="background:#ef4444"></span>fraco/sem sinal'
              + (resAv ? ' · última varredura avançada: ' + resAv.raiosTotais.toLocaleString('pt-BR') + ' raios em ' + resAv.tempoMs + ' ms · alcance ' + resAv.alcanceM.toFixed(1).replace('.', ',') + ' m' : '') + '</div>'
              + (resAv ? '<div style="font-size:11px;opacity:.7;margin-top:2px">🛰️ Nuvem: ' + resAv.n.toLocaleString('pt-BR') + ' pontos de colisão (' + resAv.raiosPrimarios.toLocaleString('pt-BR') + ' raios primários)</div>' : '')) : '')
            // [21/09/2026 UTC] NOVO -- projeção do mapa de calor sobre o mapa 2D (Planta Baixa): método
            // ('fatiamento' = Opção A, corte vetorial da própria malha 3D, padrão; 'textura' = Opção B,
            // bitmap renderizado por câmera ortográfica) e opacidade (0–100%, equivalente ao pedido
            // "heatmap2D.material.opacity"). Ver comentário grande em wifi-signal.js (`METODOS2D`).
            // [23/09/2026] MUDADO -- pedido verbatim: "remova a opção 'Varredura 2D' [...] remova do código
            // também" -- a 3ª opção ('varredura2d', motor `SignalPropagationEngine2D` em plano horizontal
            // próprio) foi removida por completo (UI e código em wifi-signal.js/mapview-rede-2d.js); ficam
            // só 'fatiamento' e 'textura'.
            + SEC_HDR('🗺️', 'Mapa 2D')
            + '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:4px">'
            + '<span>Mapa 2D — método</span><select data-wf="metodo2D" style="' + INP + '" title="Como o mapa de calor 3D é projetado sobre a Planta Baixa (2D): fatiamento (corte vetorial da própria malha 3D) ou textura (bitmap renderizado por câmera ortográfica).">' + opts(WS.METODOS2D, ap.metodo2D) + '</select>'
            + '<span>Mapa 2D — opacidade</span><input data-wf-opacidade="1" type="range" min="0" max="100" step="5" value="' + Math.round(ap.opacidade2D * 100) + '" style="width:100%" title="Opacidade do mapa de calor projetado sobre a Planta Baixa (2D).">'
            + '</div>'
            + '<div style="font-size:11px;opacity:.6;margin-top:3px">O mapa 2D (Planta Baixa) reaproveita a malha 3D já varrida acima — mesmos obstáculos (paredes, portas, janelas, pilares, vigas, piso, escada).</div></div>';
        }
        // [22/09/2026] NOVO -- pra um AP, o resto desta função (seleção de porta/conectar cabo, abaixo)
        // é a 3ª aba ("🔌 Porta") -- abre o wrapper aqui (fecha logo depois dos dois `if` que montam esse
        // conteúdo, e junto fecha `#ap-tabs-content`/o wrapper externo abertos lá em cima). Pra qualquer
        // OUTRO equipamento com porta (switch, patch panel...), `ehAp` é falso e nada disto entra em jogo
        // -- o painel deles continua idêntico a sempre, sem abas.
        if (ehAp) html += '<div data-aptab="porta" style="display:' + (apModoPainel === 'normal' ? 'block' : (apTabAtiva === 'porta' ? 'block' : 'none')) + '">' + (apModoPainel === 'normal' ? '<div style="font-weight:600;font-size:12px;opacity:.75;margin:8px 0 4px">🔌 Porta</div>' : '');
        if (temPortas && !ehBaia) {
          const opcoes = sp.portas.map((p) => { const c = RE.caboDaPorta(this._map, obj.id, p.n, 'frente'); return '<option value="' + p.n + '"' + (p.n === sel ? ' selected' : '') + '>' + (p.tipo === 'sfp' ? 'SFP ' : '') + p.n + ((r.portas[p.n] && r.portas[p.n].rotulo) ? ' — ' + esc(r.portas[p.n].rotulo) : '') + (c ? '  ● cabeada' : '') + '</option>'; }).join('');
          html += '<div style="border-top:1px solid #3a4250;margin-top:6px;padding-top:6px"><label title="Porta física deste equipamento a destacar/selecionar (ou mire numa porta em 3D pra selecioná-la automaticamente).">Porta: <select data-rs="1" style="' + INP + '"><option value="">— escolha (ou mire) —</option>' + opcoes + '</select></label></div>';
        }
        // [19/09/2026 UTC] NOVO (RODADA 174) -- painel de BAIAS do Storage: grade com o status de
        // cada slot + botões inserir/remover disco (config simples: HDD_SATA 4TB por padrão, ver
        // RE.baiaInserir). Pedido do usuário: "storage.insertDrive(driveUnit, slotIndex)... o
        // objeto Storage deve recalcular sua capacidade total dinamicamente" -- aqui é a ponta de
        // INTERFACE que chama RE.baiaInserir/baiaRemover (que por sua vez espelham StorageDevice).
        if (ehBaia) {
          const res = RE.storageResumo(obj);
          html += '<div style="border-top:1px solid #3a4250;margin-top:6px;padding-top:6px">'
            + '<div style="font-size:12px;opacity:.85;margin-bottom:6px">💽 ' + res.ocupados + '/' + res.nBaias + ' baias ocupadas · <b>' + res.totalCapacity.toFixed(1).replace(/\.0$/, '') + ' TB</b> instalados · ' + res.watts + ' W</div>'
            + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px">'
            + sp.portas.map((p) => {
              const d = r.baias[p.slotIndex], cor = d ? (d.status === 'failed' ? '#d8362f' : '#3ecb6e') : '#545a63';
              const label = d ? (d.tecnologia.replace('_', ' ') + '<br>' + d.capacidadeTB + ' TB') : 'vazio';
              return '<div style="background:#1b2028;border:1px solid #333a45;border-radius:6px;padding:6px;text-align:center;font-size:11px">'
                + '<div style="width:100%;height:5px;border-radius:3px;background:' + cor + ';margin-bottom:4px"></div>'
                + '<div style="opacity:.85">Baia ' + (p.slotIndex + 1) + '</div><div style="opacity:.65;min-height:28px">' + label + '</div>'
                + '<button type="button" data-baia="' + p.slotIndex + '" style="' + BTN + ';width:100%;margin-top:3px;font-size:11px;padding:3px 4px">' + (d ? '🗑️ Remover' : '➕ Inserir HD') + '</button></div>';
            }).join('')
            + '</div></div>';
        }
        // [19/09/2026 UTC] NOVO (RODADA 174) -- painel de CARGA/AUTONOMIA do No-break: soma o
        // consumo (W) dos Storages ligados a ele por cabo tipo "energia" e calcula a autonomia
        // restante (RE.upsCarga -> RedeStorageEnergia.UPSDevice.calculateLoad quando disponível).
        // Pedido do usuário: "ups.calculateLoad(totalWatts)... atualiza dinamicamente a autonomia
        // restante da bateria na interface" -- aqui é a interface que mostra o resultado.
        if (ehNobreak) {
          const carga = RE.upsCarga(this._map, obj);
          if (carga) {
            const cor = carga.sobrecarregado ? '#d8362f' : (carga.cargaPercentual > 80 ? '#ffb454' : '#3ecb6e');
            html += '<div style="border-top:1px solid #3a4250;margin-top:6px;padding-top:6px">'
              + '<div style="font-size:12px;opacity:.85">🔋 Carga: <b style="color:' + cor + '">' + carga.cargaWatts.toFixed(0) + ' W (' + carga.cargaPercentual.toFixed(0) + '%)</b>' + (carga.sobrecarregado ? ' ⚠️ SOBRECARGA' : '') + ' · ' + carga.nDispositivos + ' dispositivo(s) ligado(s)</div>'
              + '<div style="font-size:12px;opacity:.85;margin-top:2px">⏱️ Autonomia estimada: <b>' + carga.autonomiaMinutos.toFixed(1).replace('.', ',') + ' min</b> (nominal: ' + sp.autonomiaMinutos + ' min a ' + (sp.potenciaVA * 0.9).toFixed(0) + ' W)</div>'
              + '<div style="font-size:11px;opacity:.55;margin-top:2px">Soma os Storages/switches instalados no MESMO rack (não é preciso ligar um cabo — as baias do Storage não são portas de energia).</div>'
              + '</div>';
          }
        }
        if (sel && !ehBaia) {
          const pd = sp.portaPorN[sel], pr = r.portas[sel] || {}, cabo = RE.caboDaPorta(this._map, obj.id, sel, 'frente');
          html += '<div style="padding:6px 0;display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center"><span>Rótulo</span><input data-rr="1" value="' + esc(pr.rotulo || '') + '" placeholder="ex.: Sala 12 / AP-03" style="' + INP + '">';
          if (ehSw) html += '<span>LED</span><select data-rst="1" style="' + INP + '">' + ['auto', 'active', 'idle', 'off'].map((v) => '<option value="' + v + '"' + ((pr.status || 'auto') === v ? ' selected' : '') + '>' + (v === 'auto' ? 'Automático (segue o cabo)' : RE.LED_ESTILOS[v].rotulo) + '</option>').join('') + '</select>';
          html += '</div>';
          if (cabo) {
            const lado = RE.outroLado(cabo, obj.id, sel), outro = this._map.objects.find((o) => o.id === lado.obj), info = this._engine && this._engine._cabosInfo && this._engine._cabosInfo.get(cabo.id);
            html += '<div style="padding:6px 8px;background:#1b2a3d;border-radius:6px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>🔌 ' + esc((CABOS[cabo.tipo] || {}).rotulo || cabo.tipo) + ' → ' + esc(outro ? nomeDe(outro) : '?') + ' · porta ' + lado.porta + '</span><button type="button" data-rdc="' + cabo.id + '" style="' + BTN + '">Desconectar</button></div>'
              + '<div style="font-size:12px;opacity:.8;margin-top:3px">Percurso ' + (info ? info.comprimentoM.toFixed(2).replace('.', ',') + ' m' : '—') + (cabo.length > 0 ? ' · cabo de ' + cabo.length + ' m' : ' · comprimento automático') + (cabo.labelID ? ' · 🏷️ ' + esc(cabo.labelID) : '') + '</div>'
              + (info && info.esticado ? '<div style="color:#ff8787;font-size:12px">⚠ Cabo curto: o percurso é maior que o comprimento do cabo.</div>' : '')
              + (cabo.avisos || []).map((a) => '<div style="color:#ffb454;font-size:12px">⚠ ' + esc(a) + '</div>').join('')
              + '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:5px"><span>Comprimento (m)</span><input data-cl="' + cabo.id + '" type="number" min="0" step="0.5" value="' + (cabo.length || 0) + '" placeholder="0 = automático" style="' + INP + '" title="0 = automático"><span>labelID do cabo</span><input data-cb="' + cabo.id + '" value="' + esc(cabo.labelID || '') + '" style="' + INP + '">'
              + '</div>'
              // [22/09/2026] MUDADO -- cor individual do cabo (`cabo.cor`, campo já
              // existente e já usado por `Engine3D.rebuildCabos` -- ver comentário da rodada mais
              // abaixo). A opção "Etiqueta (rótulo flutuante)" (cabo.etiquetaModo) foi removida
              // a pedido: não faz mais parte do painel de propriedades do equipamento.
              + '<div style="margin-top:6px"><span style="font-size:12px;opacity:.8">Cor do cabo</span><div style="display:flex;gap:4px;align-items:center;margin-top:3px;flex-wrap:wrap">'
              + PALETA_CORES_CABO.map((p) => '<button type="button" data-ccorswatch="' + cabo.id + '" data-hex="' + p.hex + '" title="' + p.nome + '" style="width:20px;height:20px;border-radius:4px;border:2px solid ' + (String(cabo.cor || '').toLowerCase() === p.hex ? '#fff' : 'transparent') + ';background:' + p.hex + ';cursor:pointer;padding:0"></button>').join('')
              + '<input data-ccor="' + cabo.id + '" type="color" value="' + esc(cabo.cor || (CABOS[cabo.tipo] || {}).cor || '#2f6fdb') + '" style="width:26px;height:22px;padding:0;border:none;border-radius:4px;cursor:pointer" title="Cor personalizada"></div></div>';
          } else {
            const outros = this._map.objects.filter((o) => RE.ehEquipRede(o.tipo) && RE.especificar(o.tipo).portas.length);
            const padrao = pd.tipo === 'sfp' ? 'fibra_om3' : pd.tipo === 'lc' ? ('fibra_' + String(r.fibra || 'SMF').toLowerCase()) : (pd.tipo === 'keystone' ? (r.categoria || 'cat6') : 'cat6');
            html += '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;padding-top:4px"><span>Ligar a</span><select data-ro="1" style="' + INP + '">' + outros.map((o) => '<option value="' + o.id + '">' + esc(nomeDe(o)) + ' (' + esc(RE.especificar(o.tipo).rotulo) + ')</option>').join('') + '</select>'
              + '<span>Porta</span><select data-rop="1" style="' + INP + '"></select>'
              + '<span>Cabo</span><select data-rct="1" style="' + INP + '">' + tiposCabo.map((k) => '<option value="' + k + '"' + (padrao === k ? ' selected' : '') + '>' + esc(CABOS[k].rotulo) + '</option>').join('') + '</select>'
              + '<span>Conector</span><select data-rcx="1" style="' + INP + '"><option value="">automático</option>' + ['LC', 'SC', 'ST'].map((k) => '<option value="' + k + '">' + k + '</option>').join('') + '</select>'
              + '<span>Comprimento (m)</span><input data-rcl="1" type="number" min="0" step="0.5" value="" placeholder="0 = automático" style="' + INP + '" title="0 = automático"><span>labelID</span><input data-rcb="1" placeholder="ex.: CB-0142" style="' + INP + '"></div>'
              + '<div style="font-size:11px;opacity:.6;margin-top:3px">Cobre em porta óptica (ou conector diferente) é recusado; categoria/blindagem menor que a da porta, ou fibra SMF↔MMF, conecta com aviso.</div>'
              + '<div style="margin-top:6px"><button type="button" data-rcn="1" style="' + BTN + '">🔌 Conectar cabo</button></div>';
          }
        }
        // [22/09/2026] NOVO -- fecha data-aptab="porta" + #ap-tabs-content + o wrapper externo (border-top)
        // abertos lá em cima, todos só quando `ehAp` (ver comentário grande logo acima).
        if (ehAp) html += '</div></div></div>';
        // [21/09/2026 UTC] NOVO -- estas ações (mirar/clicar portas, "Pegar", retirar do rack, "Ficha do
        // objeto") dependem da cena 3D viva (`this._engine`) -- quando este painel é aberto pelo mapa 2D
        // (ver `abrirPainelEquipamento`), não fazem sentido e ficam OCULTAS (o resto do painel -- estado
        // ligado/desligado, config do AP, conectar cabo por nome -- continua funcionando normalmente).
        // [23/09/2026] MUDADO -- pedido verbatim: "os botões mais abaixo [...] devem ficar sempre visíveis
        // (como um rodapé)". Este bloco NÃO entra mais em `html`/`corpo` (que rola) -- vira `rodapeHtml`,
        // aplicado em `rodape.innerHTML` (fixo, fora do scroll) logo abaixo. De quebra, corrige um bug
        // (achado nesta mesma revisão): o texto de ajuda "Esc fecha..." tinha virado uma instrução `+
        // 'string'` ÓRFÃ (fora da concatenação de `html`, por causa de uma chave `}` fechando o `if`
        // ANTES dela) -- nunca aparecia, o `+` unário era só descartado silenciosamente.
        let rodapeHtml = '';
        if (this._engine) {
          rodapeHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (temPortas && !ehBaia ? '<button type="button" data-lig="1" style="' + BTN + '">🔌 Ligar clicando nas portas (L)</button>' : '') + '<button type="button" data-pg="1" style="' + BTN + '">✋ Pegar (E)</button>';
          if (obj.rackId) rodapeHtml += '<button type="button" data-rret="1" style="' + BTN + '">Retirar do rack</button>';
          rodapeHtml += '<button type="button" data-rf="1" style="' + BTN + '">Ficha do objeto</button></div>'
            + '<div style="opacity:.55;margin-top:6px;font-size:11px">Esc fecha. “Pegar” leva o item com você e permite encaixá-lo numa U do rack. “Ligar clicando nas portas” fecha este menu e deixa mirar/clicar direto nas portas (2 cliques por ponta) pra ligar o cabo, sem menu nenhum — tecla L liga/desliga esse modo a qualquer momento. No Modo Navegação, dois cliques ' + (ehSw ? 'ligam/desligam o switch' : 'mostram o resumo do item') + '.</div>';
        }
        rodape.style.display = rodapeHtml ? '' : 'none';
        rodape.innerHTML = rodapeHtml;
        corpo.innerHTML = html;
        // [23/09/2026] MUDADO -- `q` agora busca em `el` inteiro (não só `corpo`), já que o rodapé fixo
        // (`rodape`, ver comentário grande acima) é um irmão de `corpo`, fora do scroll.
        const q = (s2) => el.querySelector(s2);
        // [22/09/2026] NOVO -- wiring das abas do AP (ver comentário grande de `apTabAtiva`/`apTabBtn`
        // acima). Clicar numa aba só troca `apTabAtiva` (fechada nesta chamada de `_openRedeMenu`,
        // sobrevive ao `render()` seguinte) e re-renderiza -- qualquer varredura em andamento continua
        // (os motores vivem no `AccessPoint`, não no DOM).
        // [27/09/2026] MUDADO -- pedido verbatim: "no modo 'Abas', o scroll só deve aparecer se for
        // necessário na parte do conteúdo daquela aba." Antes, `tabsWrap.style.minHeight` era fixado na
        // MAIOR altura entre TODAS as abas (mesmo as ocultas) -- evitava a janela encolher/crescer ao
        // trocar de aba, mas o efeito colateral era `corpo` reservar aquele espaço todo (e rolar) mesmo
        // numa aba bem mais curta que as outras (ex.: "Porta", curta, herdava a altura de "Sinal", que
        // agora tem bem mais seções). Removido -- `corpo` agora sempre segue só a altura REAL da aba
        // ativa (o scroll só aparece quando o conteúdo DELA não cabe).
        if (ehAp) {
          corpo.querySelectorAll('[data-aptab-btn]').forEach((btn) => {
            btn.onclick = () => { apTabAtiva = btn.getAttribute('data-aptab-btn'); render(); };
          });
        }
        // Access Point: sincroniza malha de sinal + LED do corpo do AP (ligado/cabo) e liga a UI à varredura.
        // [21/09/2026 UTC] `this._engine` guardado (`&&`) -- este painel agora também pode ser aberto pelo
        // mapa 2D (Planta Baixa), sem nenhuma engine 3D viva (ver `abrirPainelEquipamento`/botão "⚙️
        // Configurações" no mapa 2D); sem engine, só o estado (`ligado`, config do AP) é sincronizado, a
        // malha 3D em si (se existir) é atualizada na próxima vez que "Ver em 3D" for aberto.
        const apSync = () => { if (!ehAp) return; raiz.WifiSignal.para(obj, this._engine).atualizarVisibilidade(); if (this._engine) this._engine.rebuildObjectIncremental(obj); };
        if (q('[data-rp]')) q('[data-rp]').onclick = () => { r.ligado = !r.ligado; salvar(); apSync(); render(); };
        if (ehAp) {
          const ap = raiz.WifiSignal.para(obj, this._engine);
          ap.onProgress = (p) => {
            const bar = corpo.querySelector('[data-wf-bar]'), fill = corpo.querySelector('[data-wf-fill]'), txt = corpo.querySelector('[data-wf-txt]');
            if (!fill) return;
            fill.style.width = p + '%'; if (txt) txt.textContent = p < 100 ? 'Varrendo… ' + p + '%' : '';
            if (bar) bar.classList.toggle('wf-fim', p >= 100);
          };
          ap.onDone = () => { render(); };
          corpo.querySelectorAll('[data-wf]').forEach((c) => { c.onchange = (e) => {
            const k = c.getAttribute('data-wf');
            if (k === 'frequencia') ap.signalFrequency = e.target.value;
            else if (k === 'potencia') ap.powerWatts = e.target.value;
            else if (k === 'metodo2D') ap.metodo2D = e.target.value;   // [21/09/2026] Opção A (fatiamento) / B (textura), ver wifi-signal.js
            // [22/09/2026] NOVO -- só toma efeito na PRÓXIMA varredura ("Refazer Varredura de Sinal"), como
            // Densidade/Faixa/Potência acima -- não altera uma malha já construída sem refazer o raycast.
            else if (k === 'meshMode') ap.meshMode = e.target.value;
            else if (k === 'numDispositivos') ap.numDispositivos = e.target.value;
            else ap.densidade = e.target.value;
            salvar(); render();
          }; });
          // [21/09/2026 UTC] NOVO -- slider de opacidade do mapa 2D (não recria o painel a cada `input`,
          // só salva -- `render()` reconstruiria o slider no meio do arraste do usuário, perdendo o foco).
          if (q('[data-wf-opacidade]')) q('[data-wf-opacidade]').oninput = (e) => { ap.opacidade2D = Number(e.target.value) / 100; salvar(); };
          // [22/09/2026] NOVO -- pedido verbatim: "ao alterar o valor de potência (deixando o botão do input
          // clicado), o valor dos dBm deve variar imediatamente. Atualmente, só varia depois de soltar o
          // botão do mouse." O handler em `[data-wf]` acima só ouve `change` (dispara só ao soltar/perder
          // foco); aqui, um `oninput` À PARTE no campo de potência atualiza `ap.powerWatts` + o `≈ N dBm` ao
          // lado a CADA tecla/clique-segurando das setinhas do <input type=number>, sem chamar `render()`
          // (que reconstruiria o campo inteiro e derrubaria o foco/o "segurar" do usuário).
          if (q('[data-wf="potencia"]')) q('[data-wf="potencia"]').oninput = (e) => {
            const v = Number(e.target.value);
            if (v > 0) { ap.powerWatts = v; salvar(); const dbm = q('[data-wf-dbm]'); if (dbm) dbm.textContent = '≈ ' + ap.powerDbm.toFixed(1).replace('.', ',') + ' dBm'; }
          };
          if (q('[data-wf-scan]')) q('[data-wf-scan]').onclick = () => {
            const res = ap.startScan({ densidade: ap.densidade, meshMode: ap.meshMode });
            if (!res.ok) toast(res.erro, { type: 'warn', duration: 3000 });
            render();
          };
          if (q('[data-wf-cancel]')) q('[data-wf-cancel]').onclick = () => { ap.cancelScan(); render(); };
          this._wfNiveisWire(corpo, ap, render);
          this._wfMalhaNiveisWire(corpo, ap);
          // [29/09/2026] NOVO -- "Vista em Corte" (varredura normal) -- ver `_wfCorteHtml`/`_wfCorteWire` acima.
          this._wfCorteWire(corpo, ap, render);
          if (q('[data-wf-mini]')) q('[data-wf-mini]').onchange = (e) => { ap.miniJanela = e.target.checked; salvar(); this._wfMiniAtualizarTodas(); };
          // [22/09/2026] NOVO -- wiring do painel do motor AVANÇADO (reflexão/refração, `ap.motorAvancado`/
          // `startScanAvancado`). Checkboxes/números tomam efeito só na PRÓXIMA "Varredura avançada", mesmo
          // padrão de Densidade/Faixa/Potência/Modo de malha acima (não refaz o raycast sozinho).
          if (this._engine) {
            ap.onProgressAvancado = (p) => {
              const bar = corpo.querySelector('[data-wfa-bar]'), fill = corpo.querySelector('[data-wfa-fill]'), txt = corpo.querySelector('[data-wfa-txt]');
              if (!fill) return;
              fill.style.width = p + '%'; if (txt) txt.textContent = p < 100 ? 'Varrendo (avançado)… ' + p + '%' : '';
              if (bar) bar.classList.toggle('wf-fim', p >= 100);
            };
            ap.onDoneAvancado = () => { render(); };
            corpo.querySelectorAll('[data-wfa]').forEach((c) => { c.onchange = (e) => {
              const k = c.getAttribute('data-wfa'), v = c.type === 'checkbox' ? c.checked : e.target.value;
              if (k === 'enableReflection') ap.enableReflection = v;
              else if (k === 'maxReflections') ap.maxReflections = v;
              else if (k === 'enableRefraction') ap.enableRefraction = v;
              else if (k === 'maxRefractions') ap.maxRefractions = v;
              else if (k === 'rssiThreshold') ap.rssiThreshold = v;
              else if (k === 'avancadoDensidadeRaios') ap.avancadoDensidadeRaios = v;
              else if (k === 'avancadoUsarMesmoConfig') ap.avancadoUsarMesmoConfig = v;
              else if (k === 'avancadoFrequencia') ap.avancadoFrequencia = v;
              else if (k === 'avancadoPotenciaW') ap.avancadoPotenciaW = v;
              else if (k === 'avancadoDensidade') ap.avancadoDensidade = v;
              salvar(); render();
            }; });
            if (q('[data-wfa-scan]')) q('[data-wfa-scan]').onclick = () => {
              const res = ap.startScanAvancado();
              if (!res.ok) toast(res.erro, { type: 'warn', duration: 3000 });
              render();
            };
            if (q('[data-wfa-cancel]')) q('[data-wfa-cancel]').onclick = () => { ap.cancelScanAvancado(); render(); };
            if (q('[data-wfa-clear]')) q('[data-wfa-clear]').onclick = () => { ap.clearAvancado(); render(); };
            // [29/09/2026] NOVO -- superfície 3D do motor avançado, por nível (ver `_wfMalhaNiveisAvancadaHtml` acima).
            this._wfMalhaNiveisAvancadaWire(corpo, ap);
            // [22/09/2026] NOVO -- botões de nível dos pontos/raios do motor avançado (ver `_wfNiveisAvancadaHtml`).
            this._wfNiveisAvancadaWire(corpo, ap);
          }
        }
        if (q('[data-rh]')) q('[data-rh]').onchange = (e) => { r.hostname = e.target.value.trim(); salvar(); };
        corpo.querySelectorAll('[data-cc]').forEach((s2) => { s2.onchange = (e) => { r[s2.getAttribute('data-cc')] = e.target.value; reconstruir(); render(); }; });
        q('[data-lb]').onchange = (e) => { r.labelID = e.target.value.trim(); salvar(); };
        if (q('[data-on]')) q('[data-on]').onchange = (e) => { obj.nome = e.target.value.trim(); salvar(); render(); };
        if (q('[data-rs]')) q('[data-rs]').onchange = (e) => { sel = Number(e.target.value) || null; render(); };
        if (q('[data-rr]')) q('[data-rr]').onchange = (e) => { r.portas[sel] = r.portas[sel] || {}; r.portas[sel].rotulo = e.target.value.trim(); RE.notificarMudanca(this._map, {}); render(); };
        if (q('[data-rst]')) q('[data-rst]').onchange = (e) => { r.portas[sel] = r.portas[sel] || {}; r.portas[sel].status = e.target.value; salvar(); };
        if (q('[data-rdc]')) q('[data-rdc]').onclick = () => { RE.desconectar(this._map, q('[data-rdc]').getAttribute('data-rdc')); apSync(); render(); };
        corpo.querySelectorAll('[data-cl]').forEach((i) => { i.onchange = (e) => { const c = this._map.cabos.find((x) => x.id === i.getAttribute('data-cl')); if (c) { c.length = Math.max(0, Number(e.target.value) || 0); RE.notificarMudanca(this._map, { cabos: true }); render(); } }; });
        corpo.querySelectorAll('[data-cb]').forEach((i) => { i.onchange = (e) => { const c = this._map.cabos.find((x) => x.id === i.getAttribute('data-cb')); if (c) { c.labelID = e.target.value.trim(); c.rotulo = c.labelID; salvar(); } }; });
        // [20/09/2026 UTC] NOVO (RODADA 219) -- cor individual (swatch da paleta ou picker livre) e
        // modo de exibição da etiqueta flutuante, por cabo. `reconstruir(true)` chama
        // `Engine3D.rebuildCabos()` (a malha/material do tubo é recriada do zero -- não há, hoje,
        // um material MUTÁVEL persistente por-cabo que permita só trocar `.color` sem reconstruir;
        // ver ressalva no changelog) -- é o mesmo padrão já usado por `data-cl`/`data-cp` acima.
        corpo.querySelectorAll('[data-ccorswatch]').forEach((b) => { b.onclick = () => { const c = this._map.cabos.find((x) => x.id === b.getAttribute('data-ccorswatch')); if (c) { c.cor = b.getAttribute('data-hex'); RE.notificarMudanca(this._map, { cabos: true }); if (this._engine) this._engine.rebuildCabos(); render(); } }; });
        corpo.querySelectorAll('[data-ccor]').forEach((i) => { i.onchange = (e) => { const c = this._map.cabos.find((x) => x.id === i.getAttribute('data-ccor')); if (c) { c.cor = e.target.value; RE.notificarMudanca(this._map, { cabos: true }); if (this._engine) this._engine.rebuildCabos(); render(); } }; });
        if (q('[data-ro]')) {
          const preencher = () => {
            const alvo = this._map.objects.find((o) => o.id === q('[data-ro]').value), sa = alvo && RE.especificar(alvo.tipo);
            q('[data-rop]').innerHTML = sa ? sa.portas.filter((p) => !RE.caboDaPorta(this._map, alvo.id, p.n, 'frente') && !(alvo.id === obj.id && p.n === sel)).map((p) => '<option value="' + p.n + '">' + (p.tipo === 'sfp' ? 'SFP ' : '') + p.n + ((((alvo.rede || {}).portas || {})[p.n] || {}).rotulo ? ' — ' + esc(alvo.rede.portas[p.n].rotulo) : '') + '</option>').join('') : '';
          };
          q('[data-ro]').onchange = preencher; preencher();
          q('[data-rcn]').onclick = () => {
            const res = RE.conectar(this._map, obj, sel, q('[data-ro]').value, Number(q('[data-rop]').value), { tipo: q('[data-rct]').value, conector: q('[data-rcx]').value || undefined, length: Number(q('[data-rcl]').value) || 0, labelID: q('[data-rcb]').value.trim() });
            if (!res.ok) toast(res.erro || 'Não foi possível conectar.', { type: 'warn', duration: 3400 });
            else toast(res.avisos && res.avisos.length ? ('Cabo conectado com aviso: ' + res.avisos[0]) : 'Cabo conectado 🔌', { type: res.avisos && res.avisos.length ? 'warn' : 'ok', duration: res.avisos && res.avisos.length ? 4200 : 1400 });
            if (res.ok) apSync();
            render();
          };
        }
        // [19/09/2026 UTC] NOVO (RODADA 174) -- botão inserir/remover de cada baia. Config simples
        // (HDD_SATA 4TB por padrão) -- não há, ainda, uma lista pra escolher tecnologia/capacidade
        // na hora de inserir; remover sempre funciona.
        corpo.querySelectorAll('[data-baia]').forEach((b) => {
          b.onclick = () => {
            const slot = Number(b.getAttribute('data-baia'));
            const jaTem = RE.garantirRede(obj).baias[slot];
            const res = jaTem ? RE.baiaRemover(obj, slot) : RE.baiaInserir(obj, slot, { tecnologia: 'HDD_SATA', capacidadeTB: 4 });
            if (!res.ok) { toast(res.erro || 'Não foi possível.', { type: 'warn', duration: 2200 }); return; }
            salvar(); if (this._engine) this._engine.rebuildObjectIncremental(obj);
            toast(jaTem ? ('💽 Disco removido da baia ' + (slot + 1) + '.') : ('💽 Disco inserido na baia ' + (slot + 1) + ' (HDD_SATA 4 TB).'), { duration: 1600 });
            render();
          };
        });
        if (q('[data-lig]')) q('[data-lig]').onclick = () => { fechar(); this._caboLigIniciar(); };
        if (q('[data-pg]')) q('[data-pg]').onclick = () => { fechar(); this._redePegar(obj); };
        if (q('[data-rret]')) q('[data-rret]').onclick = () => { RE.retirarDoRack(this._map, obj); salvar(); if (this._engine) this._engine.rebuildObjectIncremental(obj); fechar(); };
        if (q('[data-rf]')) q('[data-rf]').onclick = () => { fechar(); const pk = this._engine.pickables && this._engine.pickables.find((p) => p.ref === obj && p.type === 'object'); if (pk) this._tryPick(pk); };
      };
      const onKey = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); } };
      // [28/09/2026] MUDADO -- pedido verbatim: "Ao clicar na AP e abrir a sua janela, ela deve permanecer
      // aberta, mesmo clicando fora dela. Só deve fechar ao clicar no seu botão de 'fechar'." Só pro AP
      // (`ehAp`) -- os demais equipamentos continuam fechando ao clicar fora, comportamento inalterado.
      const onFora = (e) => { if (ehAp) return; if (!el.contains(e.target)) fechar(); };
      container.appendChild(el); render(); this._menuFecharRede = fechar;
      raiz.Utils.bringToFront(el);
      el.addEventListener('pointerdown', () => raiz.Utils.bringToFront(el), true);
      window.addEventListener('keydown', onKey, true);
      if (!ehAp) setTimeout(() => document.addEventListener('mousedown', onFora, true), 0);
    },

    /**
     * [21/09/2026 UTC] NOVO -- ponto de entrada público usado pelo mapa 2D (Planta Baixa) pra abrir a MESMA
     * janela de propriedades de equipamento de rede (`_openRedeMenu`) que aparece no "Ver em 3D" ao mirar
     * num equipamento e clicar -- pedido verbatim: "No mapa 2D, nas propriedades do Access Point, deve ter
     * um botão que faz aparecer a mesma janela que aparece no 'Ver em 3D' [...] quando aponta-se para um AP
     * e clica nele." `container` é o elemento onde a janela será anexada (o mapa 2D passa `document.body`,
     * já que a janela se auto-centraliza via `position:absolute;left:50%;top:50%` -- funciona em qualquer
     * container posicionado ou no próprio body) e `mapa` é o `mapData` do mapa 2D (só usado se ainda não
     * houver um `this._map` "vivo" de uma sessão "Ver em 3D" já aberta).
     * @param {object} obj        Objeto do mapa (equipamento de rede -- switch, AP, patch panel...).
     * @param {HTMLElement} container
     * @param {object} mapa
     */
    abrirPainelEquipamento(obj, container, mapa) {
      this._openRedeMenu(obj, null, { container, map: mapa });
    },
  };

  Object.assign(View3D, M);
})(typeof window !== 'undefined' ? window : globalThis);
