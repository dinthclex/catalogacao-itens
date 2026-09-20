/* js/objecttypes/object-type-registry.js
 * Infraestrutura de registro de TIPO DE OBJETO do catálogo (Mapa -> Planta
 * baixa -> janela "Ferramentas" -> "Objetos") -- pedido verbatim: "O app
 * deve se tornar modular inclusive para mexer nele, enquanto ele está todo
 * 'montado'. [...] se decidir mexer num objeto do catálogo [...] deve ser
 * simples e rápida. Transforme em classe do objeto, métodos, propriedades.
 * Existe o objeto global (objeto MapView, por exemplo) e existe os objetos
 * e classes vinculadas ao objeto global."
 *
 * PADRÃO: cada tipo de objeto (impressora, rack, mesa, cadeira, ...) vira
 * UM ARQUIVO em `js/objecttypes/<tipo>.js`, que se AUTO-REGISTRA aqui
 * chamando `ObjectTypes.register(tipo, def)`. `def` é um objeto plano (não
 * precisa ser `class`, mas pode -- ver comentário no fim) com até 4 partes,
 * todas opcionais:
 *
 *   ObjectTypes.register('impressora', {
 *     // Quando este registro e o dono da malha 3D de `obj`.
 *     matchesMesh3D(obj, perfil) { return obj.tipo === 'impressora' && perfil.shape === 'box'; },
 *     buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) { ... },
 *
 *     // Desenho no Mapa 2D (Map2DRenderer) -- só necessário quando o tipo
 *     // não usa o desenho GENÉRICO por forma (_drawFormaShape para
 *     // retangulo/poligono, ou o ícone padrão do catálogo).
 *     matchesDraw2D(obj) { return ...; },
 *     draw2D(renderer, ctx, obj, selected, destaque) { ... },
 *
 *     // Hit-test 2D dedicado (além do hit-test genérico por forma/ícone).
 *     hitTest2D(mapview, sx, sy, thresholdPx) { ... }, // devolve o achado ou null
 *
 *     // Metadados/propriedades usados pelo painel de propriedades do
 *     // objeto (object-panel-card.js) e por outros pontos que hoje leem
 *     // `OBJECT3D_PROFILES[tipo]`/checagens `obj.tipo === '...'` --
 *     // preenchido caso a caso conforme cada tipo migra (não obrigatório
 *     // logo de cara: o painel genérico já cobre os campos comuns).
 *     properties: { camposExtras: [...] },
 *   });
 *
 * DISPATCH: `engine3d.js`/`mapview.js` NÃO ficam com um `if (obj.tipo ===
 * 'eletrocalha')` a mais por tipo migrado -- ficam com UMA chamada
 * genérica (`ObjectTypes.tryBuildMesh3D(...)`/`tryDraw2D(...)`) no exato
 * ponto onde os `if`s antigos viviam, que percorre os tipos REGISTRADOS
 * (na ordem de registro -- por isso a ORDEM dos `<script>` de
 * `js/objecttypes/*.js` no index.html importa, mesma ordem dos `if`s que
 * eles substituem) e usa o primeiro cujo `matches*` bater. Tipos AINDA NÃO
 * migrados continuam com o `if` antigo, inalterado, logo depois da
 * chamada genérica -- migração incremental, sem quebrar os que faltam.
 *
 * `def` pode ser os métodos de uma instância de `class` também -- ex.:
 *   class EletrocalhaType { matchesMesh3D(...) {...} buildMesh3D(...) {...} }
 *   window.ObjectTypes.register('eletrocalha', new EletrocalhaType());
 * (ver js/objecttypes/rack.js pro primeiro exemplo migrado, usando este
 * formato de classe.)
 */
window.ObjectTypes = {
  _defs: {},       // tipo -> def (o registro mais recente pro tipo -- 1 def por tipo)
  _order: [],      // ordem de registro (prioridade = ordem de registro)

  /** Registra (ou substitui) a definição do tipo `tipo`. Chamado pelo
   *  próprio arquivo `js/objecttypes/<tipo>.js` ao carregar. */
  register(tipo, def) {
    if (!this._defs[tipo]) this._order.push(tipo);
    this._defs[tipo] = def || {};
  },

  get(tipo) { return this._defs[tipo]; },

  /** Percorre os tipos registrados (ordem de registro) e chama
   *  `buildMesh3D` do primeiro cujo `matchesMesh3D(obj, perfil)` for
   *  verdadeiro. Devolve `true` se algum tipo assumiu a malha (o chamador
   *  em engine3d.js deve dar `return` na sequência, mesmo padrão dos `if`s
   *  que esta chamada substitui); `false` se nenhum tipo registrado bateu
   *  (o chamador continua pro resto do dispatcher, tipos ainda não
   *  migrados). Erros de um tipo são isolados (console.error) e tratados
   *  como "não bateu" -- um tipo migrado com bug não deve travar o mapa
   *  inteiro nem impedir os outros tipos de renderizar. */
  tryBuildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    for (const tipo of this._order) {
      const def = this._defs[tipo];
      if (typeof def.matchesMesh3D !== 'function' || typeof def.buildMesh3D !== 'function') continue;
      let bate = false;
      try { bate = !!def.matchesMesh3D(obj, perfil); } catch (err) { console.error(`[ObjectTypes] erro em matchesMesh3D('${tipo}'):`, err); continue; }
      if (!bate) continue;
      try {
        def.buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe);
        return true;
      } catch (err) {
        console.error(`[ObjectTypes] erro em buildMesh3D('${tipo}'):`, err);
        return false; // deixa o dispatcher antigo tentar como fallback
      }
    }
    return false;
  },

  /** Mesmo espírito de `tryBuildMesh3D`, pro desenho no Mapa 2D
   *  (`Map2DRenderer._drawFormaShape`). Devolve `true` se algum tipo
   *  registrado desenhou `obj` POR INTEIRO (o chamador não deve cair no
   *  ícone genérico depois) -- ex.: "relogio" (mostrador com ponteiros,
   *  nunca desenha o ícone comum por cima). `ctx` já está transladado/
   *  rotacionado pro CENTRO local do objeto (mesma convenção de
   *  `_drawFormaShape`) quando isto é chamado -- `draw2D(renderer, ctx,
   *  obj, iconBoxPx, strokeColor, strokeW)` só precisa desenhar em
   *  coordenadas LOCAIS (0,0 = centro), igual o corpo original de cada
   *  `if` fazia.
   *  [22/09/2026 UTC] Assinatura definida nesta rodada (primeiro uso real
   *  do hook) -- `iconBoxPx`/`strokeColor`/`strokeW` são os mesmos locais
   *  que `_drawFormaShape` já calcula antes de chegar aqui. */
  tryDraw2D(renderer, ctx, obj, iconBoxPx, strokeColor, strokeW) {
    for (const tipo of this._order) {
      const def = this._defs[tipo];
      if (typeof def.matchesDraw2D !== 'function' || typeof def.draw2D !== 'function') continue;
      let bate = false;
      try { bate = !!def.matchesDraw2D(obj); } catch (err) { console.error(`[ObjectTypes] erro em matchesDraw2D('${tipo}'):`, err); continue; }
      if (!bate) continue;
      try {
        def.draw2D(renderer, ctx, obj, iconBoxPx, strokeColor, strokeW);
        return true;
      } catch (err) {
        console.error(`[ObjectTypes] erro em draw2D('${tipo}'):`, err);
        return false;
      }
    }
    return false;
  },

  /** Hit-test 2D dedicado -- percorre os tipos registrados chamando
   *  `hitTest2D(mapview, sx, sy, thresholdPx)`; devolve o primeiro
   *  resultado truthy, ou `null`. [22/09/2026 UTC] Nenhum tipo usa este
   *  hook ainda -- `_hitTestObject` (mapview.js) é hoje 100% genérico por
   *  geometria, sem nenhum caso especial por `obj.tipo` -- a infra fica
   *  pronta pra quando um tipo futuro precisar. */
  tryHitTest2D(mapview, sx, sy, thresholdPx) {
    for (const tipo of this._order) {
      const def = this._defs[tipo];
      if (typeof def.hitTest2D !== 'function') continue;
      let res = null;
      try { res = def.hitTest2D(mapview, sx, sy, thresholdPx); } catch (err) { console.error(`[ObjectTypes] erro em hitTest2D('${tipo}'):`, err); continue; }
      if (res) return res;
    }
    return null;
  },
};
