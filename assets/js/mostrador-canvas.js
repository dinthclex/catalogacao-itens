/* assets/js/mostrador-canvas.js
 * [16/09/2026 UTC] NOVO — pedido verbatim: "faça um arquivo específico do
 * projeto, se for preciso, para gerar a textura 2D do relógio (colocando a
 * sequência de comandos de canvas para gerá-lo) e carregue para gerar a
 * mesma imagem. Para não precisar guardar uma imagem de tamanho fixo e
 * gerar a imagem por código ainda, mas o código (comandos do canvas 2D)
 * fica em um arquivo."
 *
 * Antes desta rodada, o desenho do mostrador (fundo + moldura + 12
 * marcações de hora) morava DENTRO de `js/engine3d.js`
 * (`_getProceduralMostradorTexture`), como uma sequência de chamadas
 * `ctx.fillRect`/`ctx.arc`/`ctx.moveTo`/`ctx.lineTo`/`ctx.stroke` escritas
 * inline. Esta rodada EXTRAI essa sequência de comandos pra um arquivo
 * próprio (este), fazendo DUAS coisas usarem exatamente o mesmo código-fonte
 * (nunca duas cópias que podem divergir):
 *   1) `js/engine3d.js` (`_getProceduralMostradorTexture`) — carrega este
 *      arquivo (ver `<script src="assets/js/mostrador-canvas.js">` no
 *      index.html, ANTES de `js/engine3d.js`) e chama
 *      `window.MostradorCanvas.desenhar(ctx, tamanhoPx, corHex)` num
 *      `<canvas>` de verdade do navegador — MESMO resultado de antes,
 *      pixel a pixel, só que a lógica agora mora aqui.
 *   2) `ferramentas/conversor-obj-js.html` (a página de conversão .obj->.js
 *      desta mesma rodada) e/ou `ferramentas/gerar_malhas.js`, quando
 *      precisam ASSAR essa textura numa imagem PNG embutida num `.glb`
 *      (ver `_buildRelogioGlb` em `gerar_malhas.js`) — rodando em Node, SEM
 *      `document`/`<canvas>` de navegador disponível. Esta função aceita
 *      QUALQUER objeto que implemente o mesmo subconjunto de métodos de
 *      `CanvasRenderingContext2D` usado aqui (`fillStyle`/`strokeStyle`/
 *      `lineWidth`/`fillRect`/`beginPath`/`arc`/`moveTo`/`lineTo`/`stroke`)
 *      — em Node, `ferramentas/canvas2d-node.js` (também desta rodada)
 *      implementa esse subconjunto sem nenhuma dependência nativa (sem
 *      `npm install canvas`, que precisaria compilar bindings C++/Cairo —
 *      indisponível neste projeto offline-first). O RESULTADO (os pixels
 *      desenhados) é idêntico nos dois ambientes porque É O MESMO código de
 *      desenho — só o "papel" (`ctx`) muda.
 *
 * Por isso "não precisa guardar uma imagem de tamanho fixo": nenhum PNG do
 * mostrador fica versionado como arquivo estático pronto — a imagem
 * continua sendo GERADA por código (agora só um lugar só, não mais
 * duplicado), em QUALQUER resolução que quem chama pedir (`tamanhoPx`), na
 * hora que for preciso (textura ao vivo no navegador OU textura assada
 * dentro de um `.glb` gerado por uma ferramenta).
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
