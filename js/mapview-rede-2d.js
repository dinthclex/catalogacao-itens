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
