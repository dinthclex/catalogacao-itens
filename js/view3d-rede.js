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

  const M = {

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
      const el = document.createElement('div'); el.className = 'v3d-rede-menu';
      el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;min-width:340px;max-width:92vw;max-height:86vh;overflow:auto;background:rgba(20,24,32,.96);color:#e8ecf2;border:1px solid #3a4250;border-radius:10px;padding:12px;font:13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
      // [21/09/2026 UTC] NOVO -- pedido verbatim: "O 'fechar' desta janela deve ser acima e à direita, não"
      // "um botão 'fechar' lá em baixo e à direita." `el` vira só a MOLDURA (posição/tamanho/scroll fica no
      // `corpo` -- um filho por dentro), com um botão ✕ fixo no canto superior direito que NÃO rola junto
      // com o conteúdo (`corpo` é quem tem `overflow:auto`, não `el`).
      el.style.padding = '0';
      const corpo = document.createElement('div');
      corpo.style.cssText = 'overflow:auto;max-height:86vh;padding:12px 34px 12px 12px';
      const btnX = document.createElement('button');
      btnX.type = 'button'; btnX.setAttribute('aria-label', 'Fechar'); btnX.textContent = '✕';
      btnX.style.cssText = 'position:absolute;top:6px;right:8px;z-index:2;background:transparent;border:none;color:#9aa3ad;font-size:18px;line-height:1;cursor:pointer;padding:4px 7px;border-radius:6px';
      btnX.onmouseenter = () => { btnX.style.background = 'rgba(255,255,255,.1)'; btnX.style.color = '#e8ecf2'; };
      btnX.onmouseleave = () => { btnX.style.background = 'transparent'; btnX.style.color = '#9aa3ad'; };
      el.appendChild(btnX); el.appendChild(corpo);
      const fechar = () => { if (ehAp) { const a0 = raiz.WifiSignal.para(obj, this._engine); a0.onProgress = null; a0.onDone = null; } el.remove(); window.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onFora, true); if (this._menuFecharRede === fechar) this._menuFecharRede = null; };
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
        let html = '<style>' + RE.REDE_LED_CSS + '</style><div style="font-weight:600;margin-bottom:2px">' + (ICONE[sp.familia] || '📦') + ' ' + esc(sp.rotulo) + ' — ' + esc(nomeDe(obj)) + '</div>';
        html += '<div style="opacity:.7;font-size:12px;margin-bottom:6px">' + (sp.alturaU ? sp.alturaU + 'U' : sp.alturaMm + ' mm') + (ehBaia ? ' · ' + sp.nPortas + ' baias' : (temPortas ? ' · ' + sp.nPortas + ' portas · ' + cabosObj.length + ' cabo(s)' : '')) + (obj.rackId && obj.rackU ? ' · rack, U' + obj.rackU : ' · fora de rack') + (ehSw ? ' · ' + ativas + ' porta(s) ativa(s)' : '') + '</div>';
        if (ehSw || ehAp) html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span class="rede-led ' + (r.ligado ? 'idle' : 'off') + '"></span><b>' + (r.ligado ? 'Ligado' : 'Desligado') + '</b><button type="button" data-rp="1" style="' + BTN + '">⏻ ' + (r.ligado ? 'Desligar' : 'Ligar') + '</button><input data-rh="1" placeholder="hostname" value="' + esc(r.hostname) + '" style="' + INP + ';flex:1;min-width:80px"></div>';
        // configuracao fisica das portas (DIO: conector/fibra; keystones: categoria/blindagem)
        let cfg = '';
        if (sp.familia === 'dio') {
          cfg += '<span>Conector</span><select data-cc="conector" style="' + INP + '">' + Object.keys(RP.CONECTORES).filter((k) => RP.CONECTORES[k].meio === 'fibra').map((k) => '<option value="' + k + '"' + ((r.conector || 'LC') === k ? ' selected' : '') + '>' + k + '</option>').join('') + '</select>';
          cfg += '<span>Fibra</span><select data-cc="fibra" style="' + INP + '">' + ['SMF', 'OM3', 'OM4'].map((k) => '<option value="' + k + '"' + ((r.fibra || 'SMF') === k ? ' selected' : '') + '>' + (RP.FIBRAS[k] ? RP.FIBRAS[k].rotulo || k : k) + '</option>').join('') + '</select>';
        } else if (sp.familia === 'patchpanel' || sp.familia === 'tomada') {
          cfg += '<span>Keystone</span><select data-cc="categoria" style="' + INP + '">' + Object.keys(RP.CATEGORIAS).map((k) => '<option value="' + k + '"' + ((r.categoria || 'cat6') === k ? ' selected' : '') + '>' + (RP.CATEGORIAS[k].rotulo || k) + '</option>').join('') + '</select>';
          cfg += '<span>Blindagem</span><select data-cc="blindagem" style="' + INP + '">' + Object.keys(RP.BLINDAGENS).map((k) => '<option value="' + k + '"' + ((r.blindagem || 'U/UTP') === k ? ' selected' : '') + '>' + k + '</option>').join('') + '</select>';
        }
        cfg += '<span>labelID</span><input data-lb="1" value="' + esc(r.labelID || '') + '" placeholder="ex.: PP-A01 / TOM-12" style="' + INP + '">';
        html += '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;padding:2px 0">' + cfg + '</div>';
        // [21/09/2026 UTC] NOVO -- painel do Access Point: faixa, potência, densidade da varredura, botão
        // "Refazer Varredura de Sinal" e barra de progresso animada (`scanProgress` 0-100, some ao chegar em 100%).
        if (ehAp) {
          const WS = raiz.WifiSignal, ap = WS.para(obj, this._engine), emite = ap.emiteSinal, res = ap.ultimoResultado;
          const opts = (mapa, atual) => Object.keys(mapa).map((k) => '<option value="' + k + '"' + (atual === k ? ' selected' : '') + '>' + esc(mapa[k].rotulo) + '</option>').join('');
          html += '<style>' + WS.CSS + '</style><div style="border-top:1px solid #3a4250;margin-top:6px;padding-top:6px">'
            + '<div style="font-size:12px;margin-bottom:4px">📡 <b style="color:' + (emite ? '#3ecb6e' : '#ffb454') + '">' + (emite ? 'Emitindo sinal' : (!ap.isOn ? 'Desligado — sem sinal' : 'Sem cabo na porta RJ-45 — sem sinal')) + '</b> · ' + (ap.hasCableConnected ? 'cabo conectado' : 'sem cabo') + '</div>'
            + '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center"><span>Faixa</span><select data-wf="frequencia" style="' + INP + '">' + opts(WS.FAIXAS, ap.signalFrequency) + '</select>'
            // [21/09/2026 UTC] CORRIGIDO -- pedido verbatim: "coloque valores reais de potência de sinal de
            // dispositivos wi-fi do mercado. Por exemplo, 28 dBm (630 mW) em 2,4 GHz e 27 dBm (501 mW) em
            // 5 GHz." O campo continua em Watts (unidade que o motor de física usa), mas agora mostra o
            // equivalente em dBm ao lado (`WS.wattsParaDbm`) e o teto (`max`) foi de 100 W (irreal pra RF de
            // Wi-Fi) pra 2 W -- bem acima de qualquer faixa comercial, só pra não travar valores customizados.
            + '<span>Potência (W)</span><div style="display:flex;gap:6px;align-items:center"><input data-wf="potencia" type="number" min="0.01" max="2" step="0.001" value="' + ap.powerWatts + '" style="' + INP + ';flex:1"><span data-wf-dbm="1" style="font-size:11px;opacity:.7;white-space:nowrap">≈ ' + ap.powerDbm.toFixed(1).replace('.', ',') + ' dBm</span></div>'
            + '<span>Densidade da varredura</span><select data-wf="densidade" style="' + INP + '">' + opts(WS.DENSIDADES, ap.densidade) + '</select></div>'
            + '<div style="font-size:11px;opacity:.6;margin-top:3px">Mais detalhada = mais raios = mais precisa e mais lenta (não trava a tela: roda em lotes por quadro). Potência padrão baseada em APs comerciais reais (28 dBm/630 mW em 2,4 GHz; 27 dBm/501 mW em 5 GHz).</div>'
            + '<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><button type="button" data-wf-scan="1" style="' + BTN + (emite ? '' : ';opacity:.5') + '"' + (ap.scanning ? ' disabled' : '') + '>🔄 Refazer Varredura de Sinal</button>'
            + (ap.scanning ? '<button type="button" data-wf-cancel="1" style="' + BTN + '">Cancelar</button>' : '')
            + '<label style="font-size:12px"><input type="checkbox" data-wf-show="1"' + (ap.mostrar || !ap.temMalha ? ' checked' : '') + '> mostrar mapa</label></div>'
            + '<div class="wf-bar' + (ap.scanning ? '' : ' wf-fim') + '" data-wf-bar="1"><div class="wf-fill" data-wf-fill="1" style="width:' + ap.scanProgress + '%"></div></div>'
            + '<div data-wf-txt="1" style="font-size:11px;opacity:.8;min-height:14px">' + (ap.scanning ? 'Varrendo… ' + ap.scanProgress + '%' : '') + '</div>'
            + '<div style="font-size:11px;margin-top:2px"><span class="wf-leg" style="background:#22c55e;margin-left:0"></span>excelente<span class="wf-leg" style="background:#facc15"></span>médio<span class="wf-leg" style="background:#ef4444"></span>fraco/sem sinal'
            + (res ? ' · última varredura: ' + res.raios + ' raios em ' + res.tempoMs + ' ms · alcance ' + res.alcanceM.toFixed(1).replace('.', ',') + ' m' : '') + '</div>'
            // [21/09/2026 UTC] NOVO -- projeção do mapa de calor sobre o mapa 2D (Planta Baixa): método
            // ('fatiamento' = Opção A, corte vetorial da própria malha 3D, padrão; 'textura' = Opção B,
            // bitmap renderizado por câmera ortográfica) e opacidade (0–100%, equivalente ao pedido
            // "heatmap2D.material.opacity"). Ver comentário grande em wifi-signal.js (`METODOS2D`).
            + '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:6px;border-top:1px solid #3a4250;padding-top:6px">'
            + '<span>Mapa 2D — método</span><select data-wf="metodo2D" style="' + INP + '">' + opts(WS.METODOS2D, ap.metodo2D) + '</select>'
            + '<span>Mapa 2D — opacidade</span><input data-wf-opacidade="1" type="range" min="0" max="100" step="5" value="' + Math.round(ap.opacidade2D * 100) + '" style="width:100%">'
            + '</div>'
            + '<div style="font-size:11px;opacity:.6;margin-top:3px">O mapa 2D (Planta Baixa) reaproveita a malha 3D já varrida acima — mesmos obstáculos (paredes, portas, janelas, pilares, vigas, piso/teto, escada).</div></div>';
        }
        if (temPortas && !ehBaia) {
          const opcoes = sp.portas.map((p) => { const c = RE.caboDaPorta(this._map, obj.id, p.n, 'frente'); return '<option value="' + p.n + '"' + (p.n === sel ? ' selected' : '') + '>' + (p.tipo === 'sfp' ? 'SFP ' : '') + p.n + ((r.portas[p.n] && r.portas[p.n].rotulo) ? ' — ' + esc(r.portas[p.n].rotulo) : '') + (c ? '  ● cabeada' : '') + '</option>'; }).join('');
          html += '<div style="border-top:1px solid #3a4250;margin-top:6px;padding-top:6px"><label>Porta: <select data-rs="1" style="' + INP + '"><option value="">— escolha (ou mire) —</option>' + opcoes + '</select></label></div>';
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
              + '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;margin-top:5px"><span>Comprimento (m)</span><input data-cl="' + cabo.id + '" type="number" min="0" step="0.5" value="' + (cabo.length || 0) + '" style="' + INP + '" title="0 = automático"><span>labelID do cabo</span><input data-cb="' + cabo.id + '" value="' + esc(cabo.labelID || '') + '" style="' + INP + '">'
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
              + '<span>Comprimento (m)</span><input data-rcl="1" type="number" min="0" step="0.5" value="0" style="' + INP + '" title="0 = automático"><span>labelID</span><input data-rcb="1" placeholder="ex.: CB-0142" style="' + INP + '"></div>'
              + '<div style="font-size:11px;opacity:.6;margin-top:3px">Cobre em porta óptica (ou conector diferente) é recusado; categoria/blindagem menor que a da porta, ou fibra SMF↔MMF, conecta com aviso.</div>'
              + '<div style="margin-top:6px"><button type="button" data-rcn="1" style="' + BTN + '">🔌 Conectar cabo</button></div>';
          }
        }
        // [21/09/2026 UTC] NOVO -- estas ações (mirar/clicar portas, "Pegar", retirar do rack, "Ficha do
        // objeto") dependem da cena 3D viva (`this._engine`) -- quando este painel é aberto pelo mapa 2D
        // (ver `abrirPainelEquipamento`), não fazem sentido e ficam OCULTAS (o resto do painel -- estado
        // ligado/desligado, config do AP, conectar cabo por nome -- continua funcionando normalmente).
        if (this._engine) {
          html += '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' + (temPortas && !ehBaia ? '<button type="button" data-lig="1" style="' + BTN + '">🔌 Ligar clicando nas portas (L)</button>' : '') + '<button type="button" data-pg="1" style="' + BTN + '">✋ Pegar (E)</button>';
          if (obj.rackId) html += '<button type="button" data-rret="1" style="' + BTN + '">Retirar do rack</button>';
          html += '<button type="button" data-rf="1" style="' + BTN + '">Ficha do objeto</button></div>';
        }
          + '<div style="opacity:.55;margin-top:6px;font-size:11px">Esc fecha. “Pegar” leva o item com você e permite encaixá-lo numa U do rack. “Ligar clicando nas portas” fecha este menu e deixa mirar/clicar direto nas portas (2 cliques por ponta) pra ligar o cabo, sem menu nenhum — tecla L liga/desliga esse modo a qualquer momento. No Modo Navegação, dois cliques ' + (ehSw ? 'ligam/desligam o switch' : 'mostram o resumo do item') + '.</div>';
        corpo.innerHTML = html;
        const q = (s2) => corpo.querySelector(s2);
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
            else ap.densidade = e.target.value;
            salvar(); render();
          }; });
          // [21/09/2026 UTC] NOVO -- slider de opacidade do mapa 2D (não recria o painel a cada `input`,
          // só salva -- `render()` reconstruiria o slider no meio do arraste do usuário, perdendo o foco).
          if (q('[data-wf-opacidade]')) q('[data-wf-opacidade]').oninput = (e) => { ap.opacidade2D = Number(e.target.value) / 100; salvar(); };
          if (q('[data-wf-scan]')) q('[data-wf-scan]').onclick = () => {
            const res = ap.startScan({ densidade: ap.densidade });
            if (!res.ok) toast(res.erro, { type: 'warn', duration: 3000 });
            render();
          };
          if (q('[data-wf-cancel]')) q('[data-wf-cancel]').onclick = () => { ap.cancelScan(); render(); };
          if (q('[data-wf-show]')) q('[data-wf-show]').onchange = (e) => { ap.mostrar = e.target.checked; };
        }
        if (q('[data-rh]')) q('[data-rh]').onchange = (e) => { r.hostname = e.target.value.trim(); salvar(); };
        corpo.querySelectorAll('[data-cc]').forEach((s2) => { s2.onchange = (e) => { r[s2.getAttribute('data-cc')] = e.target.value; reconstruir(); render(); }; });
        q('[data-lb]').onchange = (e) => { r.labelID = e.target.value.trim(); salvar(); };
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
      const onFora = (e) => { if (!el.contains(e.target)) fechar(); };
      container.appendChild(el); render(); this._menuFecharRede = fechar;
      window.addEventListener('keydown', onKey, true);
      setTimeout(() => document.addEventListener('mousedown', onFora, true), 0);
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
