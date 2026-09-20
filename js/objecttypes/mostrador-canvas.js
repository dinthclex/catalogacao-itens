/* js/objecttypes/mostrador-canvas.js
 * [16/09/2026 UTC] NOVO — pedido verbatim: "faça um arquivo específico do
 * projeto, se for preciso, para gerar a textura 2D do relógio (colocando a
 * sequência de comandos de canvas para gerá-lo) e carregue para gerar a
 * mesma imagem. Para não precisar guardar uma imagem de tamanho fixo e
 * gerar a imagem por código ainda, mas o código (comandos do canvas 2D)
 * fica em um arquivo."
 *
 * [20/09/2026 UTC] RELOCADO de `assets/js/mostrador-canvas.js` pra cá —
 * pedido verbatim: "Em 'outputs/assets/' deve ficar apenas 'exemplos/' e
 * 'modelos/' [...] O arquivo 'mostrador-canvas.js' é para gerar a imagem do
 * relógio. Dê algum jeito de integrar isso ao relógio." `assets/` passa a
 * conter só modelos 3D e exemplos; este arquivo é CÓDIGO do app (gera a
 * textura do mostrador), então muda pra `js/`, e especificamente pra
 * `js/objecttypes/` (ao lado de `relogio.js`, o único tipo que o usa) —
 * MESMA integração de sempre, só que fisicamente junto do tipo de objeto
 * que o consome, carregado no index.html IMEDIATAMENTE ANTES de
 * `js/objecttypes/relogio.js`, não mais antes de `js/engine3d.js`:
 *   1) `js/objecttypes/relogio.js`
 *      (`RelogioMeshBuilder.prototype._getProceduralMostradorTexture` —
 *      MOVIDO de `Engine3D.prototype` em `js/engine3d.js` na mesma rodada)
 *      chama `window.MostradorCanvas.desenhar(ctx, tamanhoPx, corHex)` num
 *      `<canvas>` de verdade do navegador.
 *   2) `js/gerador-glb/gerar_glb.js` (RELOCADO de
 *      `assets/obj/gerador-glb/gerar_glb.js` na mesma rodada) e/ou
 *      `js/gerador-glb/conversor-obj-js.html` (RELOCADO de
 *      `assets/obj/conversor-obj-js.html`), quando precisam ASSAR essa
 *      textura numa imagem PNG embutida num `.glb` (ver `_buildRelogioGlb`
 *      em `gerar_malhas.js`) — rodando em Node, SEM `document`/`<canvas>`
 *      de navegador disponível. Esta função aceita QUALQUER objeto que
 *      implemente o mesmo subconjunto de métodos de
 *      `CanvasRenderingContext2D` usado aqui (`fillStyle`/`strokeStyle`/
 *      `lineWidth`/`fillRect`/`beginPath`/`arc`/`moveTo`/`lineTo`/`stroke`)
 *      — em Node, `js/gerador-glb/canvas2d-node.js` implementa esse
 *      subconjunto sem nenhuma dependência nativa (sem `npm install
 *      canvas`, que precisaria compilar bindings C++/Cairo — indisponível
 *      neste projeto offline-first). O RESULTADO (os pixels desenhados) é
 *      idêntico nos dois ambientes porque É O MESMO código de desenho — só
 *      o "papel" (`ctx`) muda.
 *
 * Por isso "não precisa guardar uma imagem de tamanho fixo": nenhum PNG do
 * mostrador fica versionado como arquivo estático pronto — a imagem
 * continua sendo GERADA por código (um lugar só, não duplicado), em
 * QUALQUER resolução que quem chama pedir (`tamanhoPx`), na hora que for
 * preciso (textura ao vivo no navegador OU textura assada dentro de um
 * `.glb` gerado por uma ferramenta).
 *
 * Funciona nos dois ambientes (browser via `<script>` clássico E Node via
 * `require(...)`) pelo mesmo padrão UMD simples já usado noutros módulos
 * pequenos deste projeto.
 */
(function (root) {
  /** Desenha o mostrador completo (fundo + moldura + 12 marcações de hora)
   *  no contexto 2D `ctx` já criado por quem chama (browser: `canvas.
   *  getContext('2d')`; Node: `ferramentas/canvas2d-node.js`), assumindo um
   *  canvas QUADRADO de `tamanhoPx` × `tamanhoPx`. `corFundoHex` é uma
   *  string CSS de cor (ex. `'#f2ede0'`) — quem chama já resolve o hex
   *  numérico do perfil (`0xrrggbb`) pra essa string antes de passar aqui
   *  (ver `_getProceduralMostradorTexture`/`gerar_malhas.js` pra exemplos).
   *  Nenhuma escala/proporção é fixa em pixels absolutos — tudo é fração de
   *  `tamanhoPx`, então o MESMO desenho funciona em qualquer resolução (256
   *  no navegador, 512+ numa textura assada de `.glb`, por exemplo). */
  function desenhar(ctx, tamanhoPx, corFundoHex) {
    const cx = tamanhoPx / 2, cy = tamanhoPx / 2, raioPx = tamanhoPx / 2;
    // Fundo — mesma cor do perfil do disco (o material zera a própria cor
    // pra branco e usa esta textura como `map`, ver `_buildRelogioMesh` em
    // engine3d.js).
    ctx.fillStyle = corFundoHex;
    ctx.fillRect(0, 0, tamanhoPx, tamanhoPx);
    // Moldura fina (contraste sutil com a borda do disco 3D).
    const espMoldura = Math.max(1, tamanhoPx / 64);
    ctx.strokeStyle = 'rgba(30,25,15,0.35)';
    ctx.lineWidth = espMoldura;
    ctx.beginPath();
    ctx.arc(cx, cy, raioPx - espMoldura, 0, Math.PI * 2);
    ctx.stroke();
    // 12 marcações — mesma convenção de ângulo/sentido de sempre (ver
    // comentário original em engine3d.js, preservado aqui): ângulo 0 =
    // "3 horas" na convenção do `ctx.arc`, giramos -90° pra começar em "12
    // horas" no topo, sentido horário na tela (Y cresce pra baixo).
    ctx.strokeStyle = 'rgba(30,25,15,0.8)';
    const margemBorda = tamanhoPx / 25.6; // == 10px num canvas de 256px
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const cardinal = (i % 3 === 0); // 12/3/6/9 — marcador mais destacado
      const compMarca = cardinal ? raioPx * 0.16 : raioPx * 0.09;
      const r1 = raioPx - margemBorda;
      const r2 = r1 - compMarca;
      ctx.lineWidth = cardinal ? tamanhoPx / 42.6 : tamanhoPx / 85.3; // == 6px/3px num canvas de 256px
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.stroke();
    }
  }

  const api = { desenhar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MostradorCanvas = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
