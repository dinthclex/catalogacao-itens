/* js/mapview-rede-2d.js
 * Extraido de `js/mapview.js` -- pedido verbatim: "No arquivo
 * 'outputs/js/mapview.js', deixe apenas o core do projeto quanto ao Mapa.
 * O que [...] usa o core no seu funcionamento e adiciona novos metodos e
 * propriedades deve ser 'recortado' [...] e colocado em um arquivo a
 * parte." Cobre a parte de rede do editor 2D: desenho (Map2DRenderer) e
 * hit-test (MapView) dos cabos entre portas.
 *
 *   - `Map2DRenderer` e uma `class` -- classe auxiliar + Object.assign(prototype).
 *   - `MapView` e um OBJETO LITERAL (`const MapView = {...}`) -- os metodos
 *     abaixo sao adicionados a ele via `Object.assign(MapView, {...})`,
 *     carregado depois que `window.MapView` existe (ultima linha de
 *     mapview.js).
 *
 * Precisa carregar DEPOIS de `js/mapview.js` (que declara `class
 * Map2DRenderer` e expoe `window.MapView`).
 */

class Map2DRendererRedeMixin {
  /** [19/09/2026 UTC] NOVO (RODADA 190) — pedido verbatim do usuário: "A ligação feita deve aparecer no
   *  modo 2D, as alturas (y) devem ser colapsadas." Até aqui os cabos (`mapData.cabos`) só eram desenhados
   *  no 3D (`Engine3D.rebuildCabos`) — o mapa 2D não mostrava NENHUMA linha de conexão. Desenha uma
   *  polilinha suave (mesma spline centrípeta de `RedePassiva.amostrarSpline`, RODADA 189) ligando a
   *  posição 2D (x, y — que no MUNDO 3D correspondem a X, Z; ver correção de rótulos "Posição Y"→"Posição
   *  Z" desta mesma rodada) do objeto de ORIGEM até o de DESTINO, passando pelos pontos de controle
   *  manuais (`c.pontosExtras`, "Moldar cabo") já ordenados por projeção no eixo — a "altura colapsada"
   *  do pedido é justamente ISSO: a coordenada de altura verdadeira (Y do mundo 3D) é ignorada por
   *  completo aqui, só X/Z (a "Y" do mapa 2D) importa, dando uma projeção de cima limpa mesmo quando o
   *  cabo sobe/desce de nível no 3D. RESSALVA HONESTA: usa `obj.x`/`obj.y` do equipamento (que
   *  `RedeEquip.sincronizarUm`/posicionamento no rack já mantém igual ao do rack quando encaixado — ver
   *  rede-equip.js linha ~640/651), não a posição exata da PORTA dentro do equipamento (isso exigiria
   *  reproduzir `Engine3D._redePortaMundo`, que depende de geometria 3D do rack, aqui no 2D) — pra uma
   *  visão de topo "por onde o cabo passa" isso é suficiente; a rota real porta-a-porta com abertura
   *  angular fica só no 3D. */
  // [19/09/2026 UTC] NOVO (RODADA 195) -- pedido verbatim: "Ao selecionar a ferramenta 'Apagar', no
  // mapa 2D, ao posicionar o cursor em cima do cabo, o cabo deve receber um destaque de linha
  // tracejada branca sobre toda a sua extensão." `hoverEl` (novo 2º parâmetro, `opts.hoverEl` do
  // chamador -- ver `_computeHoverEl`/`_hitTestCaboRede2D`, que já reconhecem `{kind:'cabo', id}` desde
  // a RODADA 194) chega aqui pra saber se ALGUM cabo está sob o cursor agora; quando é o caso, a MESMA
  // polilinha já calculada pra desenhar o cabo (`pts`, reaproveitada -- sem duplicar a equação de
  // construção da rota) recebe uma 2ª passada por cima, tracejada branca, um pouco mais grossa que o
  // traço real do cabo (senão o tracejado fica invisível/escondido atrás do próprio cabo em cabos
  // finos), no mesmo espírito visual do contorno de hover genérico dos outros tipos de elemento
  // (`_drawObjectSelHoverRing`/`_isHovered`) -- só que como LINHA acompanhando o trajeto inteiro (um
  // "anel" não faz sentido pra um elemento que é uma polilinha, não um ponto/forma).
  _drawCabosRede2D(ctx, hoverEl) {
    const RE = window.RedeEquip, RP = window.RedePassiva;
    if (!RE || !RP || !this.mapData || !Array.isArray(this.mapData.cabos) || !this.mapData.cabos.length) return;
    const objs = new Map((this.mapData.objects || []).map((o) => [o.id, o]));
    this.mapData.cabos.forEach((c) => {
      const A = objs.get(c.de.obj), B = objs.get(c.para.obj);
      if (!A || !B) return;
      const pa = { x: A.x, y: 0, z: A.y }, pb = { x: B.x, y: 0, z: B.y }; // Y (altura) colapsada em 0 de proposito
      // [19/09/2026 UTC] RODADA 192 -- preserva `.reto` (bézier/linha reta por trecho, ver "Moldar
      // cabo" em view3d-rede.js/tecla B) ao levar `pontosExtras` pra esta projeção 2D, e troca
      // `amostrarSpline` por `amostrarRotaComRetas` -- sem isso, um trecho marcado reto no 3D
      // continuava aparecendo curvo no mapa 2D (inconsistência visual).
      // [19/09/2026 UTC] RODADA 193 -- pedido verbatim: "Os nós não devem se reordenar dinamicamente
      // [...] a ordem dos nós deve ser preservada." Removida a reordenação por projeção geométrica
      // daqui (só existiam nós MANUAIS nesta lista, sem nenhuma zona-guia automática pra justificar
      // reordenar) -- a ordem de `c.pontosExtras` (ordem de criação) É a ordem do trajeto agora, igual
      // ao 3D (ver `Engine3D._caboRota`/`RedePassiva.rotaCabo`, mesmo pedido).
      const extras = (Array.isArray(c.pontosExtras) ? c.pontosExtras : []).map((p) => ({ x: p.x, y: 0, z: p.z, reto: !!p.reto }));
      const ctrl = [pa, ...extras, pb];
      const pts = RP.amostrarRotaComRetas(ctrl, 10);
      const fibra = String(c.tipo || '').startsWith('fibra');
      const dMm = RE.diametroCabo ? RE.diametroCabo(c) : (fibra ? 3 : 6);
      const lw = Math.max(1, (dMm / 1000) * this.view.zoom);
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * 0.85;
      ctx.strokeStyle = c.cor || '#2f6fdb';
      ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => { const s = this.worldToScreen(p.x, p.z); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      ctx.stroke();
      ctx.restore();
      // Destaque de hover (ferramenta "Apagar", ver comentário grande acima) -- por cima do traço
      // real do cabo, tracejado branco, ao longo da MESMA polilinha (`pts`) já calculada.
      if (hoverEl && hoverEl.kind === 'cabo' && hoverEl.id === c.id) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, lw + 2);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.setLineDash([Math.max(4, lw * 1.5), Math.max(3, lw)]);
        ctx.beginPath();
        pts.forEach((p, i) => { const s = this.worldToScreen(p.x, p.z); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  /** [21/09/2026 UTC] pedido verbatim: "Sobre o objeto Access Point, se a opção 'mostrar mapa' estiver
   *  ligada, então, no mapa 2D, deve ter uma representação 2D em recorte (plano XZ) do nível do AP (em Y)."
   *  [ATUALIZAÇÃO 21/09/2026] pedido de refinamento: "projetando os dados volumétricos tridimensionais
   *  diretamente sobre o mapa/planta baixa 2D. Não fazendo apenas uma forma que interage com paredes
   *  apenas" + "Assim como no versão do 3D, deve considerar paredes, portas, janelas, pilares, vigas,
   *  piso/teto, escada." Caminho PRINCIPAL agora: se o AP já tem uma varredura 3D feita nesta sessão
   *  (`WifiSignal.instanciaExistente` -- sobrevive mesmo depois de fechar "Ver em 3D", enquanto a página não
   *  recarrega), usa a PRÓPRIA malha 3D (que já considera paredes/portas/janelas/pilares/vigas/lajes/escada
   *  via `atenuacaoDoPick`) projetada em 2D por um dos dois métodos configuráveis nas propriedades do AP
   *  (`ap.metodo2D`, ver `object-panel-card.js`/`view3d-rede.js`):
   *   - 'fatiamento' (Opção A, padrão) -- `ap.projectHeatmapTo2D()`: fatia a malha 3D por um plano horizontal
   *     e devolve polígono(s) 2D exatos por nível (ver comentário grande em wifi-signal.js).
   *   - 'textura' (Opção B) -- `ap.projectHeatmapToTexture()`: bitmap já renderizado (câmera ortográfica de
   *     cima) colado com `ctx.drawImage`.
   *  Só quando NÃO existe nenhuma varredura 3D ainda (mapa aberto sem nunca ter entrado no "Ver em 3D" nesta
   *  sessão) cai no fallback `WifiSignal.calcularCorte2D` -- uma física 2D independente da engine, mas mais
   *  simples (considera só paredes) -- RESSALVA HONESTA: esse fallback não reflete portas/janelas/pilares/
   *  vigas/lajes/escada; assim que o usuário abrir "Ver em 3D" e fazer 1 varredura, o mapa 2D passa a usar a
   *  malha real (com todos os obstáculos) automaticamente, sem nenhuma ação extra.
   */
  _drawApSinal2D(ctx) {
    const WS = window.WifiSignal;
    if (!WS || !this.mapData || !Array.isArray(this.mapData.objects)) return;
    this.mapData.objects.forEach((obj) => {
      if (!WS.ehAP(obj)) return;
      const apExistente = WS.instanciaExistente(obj.id);
      const opacidade = (apExistente && apExistente.opacidade2D != null) ? apExistente.opacidade2D
        : ((obj.rede && obj.rede.ap && obj.rede.ap.opacidade2D) != null ? obj.rede.ap.opacidade2D : 1);
      if (opacidade <= 0) return;
      // [22/09/2026] NOVO -- pedido verbatim: "mesmo estando a opção 'mostrar mapa' já ativada ... tem que
      // desativar e ativar de novo para o desenho do mapa de calor do sinal aparecer no mapa 2D." Causa raiz:
      // nem o caminho principal (malha 3D projetada, logo abaixo) nem este método como um todo checavam
      // `mostrar`/`mostrar2D` -- só o FALLBACK (`WS.calcularCorte2D`, mais abaixo) respeitava o toggle. Ou
      // seja, assim que existisse uma instância de AP com malha 3D anexada (`apExistente.temMalha`), o mapa
      // de calor 2D era desenhado incondicionalmente, ignorando "mostrar mapa" -- e só "desligava" de fato
      // quando `temMalha` ficava falso (engine 3D não mais viva) e caía no fallback, que aí sim checava o
      // flag. Agora este método consulta `mostrar` (fonte única de verdade -- `ap.mostrar`/`obj.rede.ap.
      // mostrar2D`, ver getter/setter em wifi-signal.js) UMA VEZ, ANTES de escolher qualquer caminho, então o
      // toggle vale pros dois (principal e fallback) e é respeitado a cada quadro, sem precisar re-clicar o
      // checkbox pra "forçar" um redesenho.
      const mostrarLigado = apExistente ? apExistente.mostrar : !(obj.rede && obj.rede.ap && obj.rede.ap.mostrar2D === false);
      if (!mostrarLigado) return;

      // Caminho principal (malha 3D real, com todos os obstáculos) -- só disponível depois de 1 varredura.
      if (apExistente && apExistente.emiteSinal && apExistente.temMalha) {
        const metodo = apExistente.metodo2D;
        if (metodo === 'textura') {
          let tex; try { tex = apExistente.projectHeatmapToTexture(); } catch (e) { tex = null; }
          if (tex) { this._desenharApTextura2D(ctx, tex, opacidade); return; }
          // se a Opção B falhar por algum motivo (ex.: sem `engine.renderer` nesta chamada), cai pra A.
        }
        let corte; try { corte = apExistente.projectHeatmapTo2D(); } catch (e) { corte = null; }
        if (corte) { this._desenharApNiveis2D(ctx, corte.niveis, opacidade, 'loops'); return; }
      }

      // Fallback: nenhuma varredura 3D ainda -- física 2D simplificada (só paredes).
      let corte; try { corte = WS.calcularCorte2D(obj, this.mapData); } catch (e) { corte = null; }
      if (corte) this._desenharApNiveis2D(ctx, corte.niveis, opacidade, 'pontos');
    });
  }

  /** Desenha, do nível mais fraco (mais externo) pro mais forte (mais interno, por cima), os polígonos de
   *  sinal de um corte 2D -- `formato` é `'loops'` (Opção A, `{x,z}[][]`, um ou mais laços por nível) ou
   *  `'pontos'` (fallback leve, `{x,z}[]`, um único anel por nível). */
  _desenharApNiveis2D(ctx, niveis, opacidade, formato) {
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * 0.9 * opacidade;
    niveis.forEach((N) => {
      const grupos = formato === 'loops' ? N.loops : (N.pontos && N.pontos.length >= 3 ? [N.pontos] : []);
      const r = Math.round(N.cor[0] * 255), g = Math.round(N.cor[1] * 255), b = Math.round(N.cor[2] * 255);
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + N.alfa + ')';
      grupos.forEach((pontos) => {
        if (!pontos || pontos.length < 3) return;
        ctx.beginPath();
        pontos.forEach((p, i) => { const s = this.worldToScreen(p.x, p.z); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
        ctx.closePath();
        ctx.fill();
      });
    });
    ctx.restore();
  }

  /** Desenha o bitmap já renderizado da Opção B (`ap.projectHeatmapToTexture()`) sobre a Planta Baixa,
   *  posicionado/escalado pelas coordenadas de mundo (`minX/maxX/minZ/maxZ`) do resultado via `worldToScreen`
   *  -- é só um `ctx.drawImage`, o trabalho pesado (renderizar a malha 3D vista de cima) já foi feito. */
  _desenharApTextura2D(ctx, tex, opacidade) {
    const p0 = this.worldToScreen(tex.minX, tex.minZ), p1 = this.worldToScreen(tex.maxX, tex.maxZ);
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * 0.9 * opacidade;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tex.canvas, Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
    ctx.restore();
  }
}
// Métodos de `class` não são enumeráveis: `Object.assign` os ignora — copia pelo nome.
Object.getOwnPropertyNames(Map2DRendererRedeMixin.prototype).forEach((k) => {
  if (k !== 'constructor') Map2DRenderer.prototype[k] = Map2DRendererRedeMixin.prototype[k];
});

Object.assign(window.MapView, {
  /** [19/09/2026 UTC] NOVO (RODADA 194) -- ver comentário grande em `_hitTestDrawable` (chamador único).
   *  Devolve `{id}` do cabo mais próximo dentro da tolerância, ou `null`. */
  _hitTestCaboRede2D(sx, sy, thresholdPx = 16) {
    const RE = window.RedeEquip, RP = window.RedePassiva;
    if (!RE || !RP || !this._map || !Array.isArray(this._map.cabos) || !this._map.cabos.length) return null;
    const objs = new Map((this._map.objects || []).map((o) => [o.id, o]));
    let best = null, bestD = thresholdPx;
    this._map.cabos.forEach((c) => {
      const A = objs.get(c.de.obj), B = objs.get(c.para.obj);
      if (!A || !B) return;
      const pa = { x: A.x, y: 0, z: A.y }, pb = { x: B.x, y: 0, z: B.y };
      const extras = (Array.isArray(c.pontosExtras) ? c.pontosExtras : []).map((p) => ({ x: p.x, y: 0, z: p.z, reto: !!p.reto }));
      const ctrl = [pa, ...extras, pb];
      let pts; try { pts = RP.amostrarRotaComRetas(ctrl, 10); } catch (e) { pts = ctrl; }
      if (!pts || pts.length < 2) return;
      for (let i = 1; i < pts.length; i++) {
        const a = this._renderer.worldToScreen(pts[i - 1].x, pts[i - 1].z);
        const b = this._renderer.worldToScreen(pts[i].x, pts[i].z);
        const d = this._distToSegment(sx, sy, a.x, a.y, b.x, b.y);
        if (d < bestD) { bestD = d; best = c; }
      }
    });
    return best;
  }
});
