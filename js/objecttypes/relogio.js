/* js/objecttypes/relogio.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- mesmo padrão de mesa.js/pilar.js/cadeira.js. Malha 3D
 * extraída ao pé da letra de `js/engine3d.js` (_buildRelogioMesh); a
 * condição de `matchesMesh3D` é cópia EXATA do `if` que existia no
 * dispatcher original (`_buildOneObjectMeshCore`), preservando a mesma
 * prioridade/comportamento.
 */
class RelogioMeshBuilder {
    /** [20/09/2026 UTC] MOVIDO de `js/engine3d.js` (`Engine3D.prototype.
     *  _getProceduralMostradorTexture`) pra cá -- pedido verbatim: "O
     *  arquivo 'mostrador-canvas.js' é para gerar a imagem do relógio. Dê
     *  algum jeito de integrar isso ao relógio." Só o relógio usa esta
     *  textura (marcações de hora do mostrador), então deixa de ser um
     *  método genérico de `Engine3D` e passa a viver aqui, junto do resto
     *  do tipo -- chamado via `RelogioMeshBuilder.prototype.
     *  _getProceduralMostradorTexture.call(this, ...)` dentro de
     *  `_buildRelogioMesh` abaixo (`this` ali é o `engine`, igual antes --
     *  o cache `this._texturaProceduralCache` continua vivendo no próprio
     *  `engine`, sem mudança de comportamento). MESMO padrão de cache de
     *  `_getProceduralFloorTexture` (engine3d.js) — canvas 2D desenhado UMA
     *  vez, cacheado por chave (só a cor de fundo, `perfil.color`). DESENHO
     *  — delega pra `window.MostradorCanvas.desenhar` (`js/objecttypes/
     *  mostrador-canvas.js`, carregado ANTES deste arquivo no index.html —
     *  também usado pela ferramenta de geração de `.glb` do relógio,
     *  `js/gerador-glb/gerar_glb.js`, rodando em Node -- MESMO código-fonte,
     *  garantindo a MESMA imagem nos dois casos). */
    _getProceduralMostradorTexture(corFundo) {
      const THREE = this.THREE;
      this._texturaProceduralCache = this._texturaProceduralCache || {};
      const cor = (corFundo === undefined || corFundo === null) ? 0xf2ede0 : corFundo;
      const cacheKey = 'mostrador::' + cor.toString(16);
      let tex = this._texturaProceduralCache[cacheKey];
      if (tex) return tex;
      const CANVAS_PX = 256;
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_PX; canvas.height = CANVAS_PX;
      const ctx = canvas.getContext('2d');
      const corHex = '#' + ('000000' + (cor >>> 0).toString(16)).slice(-6);
      window.MostradorCanvas.desenhar(ctx, CANVAS_PX, corHex);
      tex = new THREE.CanvasTexture(canvas);
      // Sem `repeat`/wrap especial — a textura cobre o disco inteiro de uma
      // vez só (UV padrão do `CylinderGeometry` já mapeia a face circular do
      // topo/base 1:1 num círculo centralizado no quadrado da textura, que é
      // exatamente como este canvas foi desenhado).
      this._texturaProceduralCache[cacheKey] = tex;
      return tex;
    }

    _buildRelogioMesh(obj, perfil, baseY, wireframe, colWireframe) {
      const THREE = this.THREE;
      const r = perfil.r || 0.15;
      const h = perfil.h || 0.04;
      const rotY = objAnguloToRotY(obj.angulo);
      const geo = new THREE.CylinderGeometry(r, r, h, perfil.segments || 14);
      // Marcações de hora — textura procedural (canvas 2D, gerada/cacheada
      // UMA vez, ver `_getProceduralMostradorTexture` acima) aplicada como
      // `map` do disco do mostrador. `color: 0xffffff` é OBRIGATÓRIO junto
      // com `map`: `MeshLambertMaterial.color` MULTIPLICA a textura — deixar
      // a cor do perfil (creme) aqui escureceria/tingiria os traços desenhados
      // no canvas; a cor de fundo do mostrador já está pintada DENTRO do
      // próprio canvas (mesma cor do perfil, ver função), então o resultado
      // final bate com o visual de sempre, só que com os tracinhos por cima.
      // Wireframe não ganha textura (não faz sentido/não aparece mesmo).
      const mat = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: 0xffffff, map: RelogioMeshBuilder.prototype._getProceduralMostradorTexture.call(this, perfil.color) });
      const mesh = new THREE.Mesh(geo, mat);
      const centerY = baseY + perfil.y0 + r; // r, não h/2: de pé, a "altura" ocupada é o DIÂMETRO do mostrador, não a espessura do disco
      mesh.position.set(obj.x, centerY, obj.y);
      // Ver comentário grande acima pro porquê de X-antes-de-Y (Euler 'XYZ' padrão).
      mesh.rotation.set(Math.PI / 2, rotY, 0);
      this._group.add(mesh);

      // Ponteiros — caixas finas e curtas, cor escura (contraste com o
      // mostrador claro do perfil). São FILHOS de `mesh`: herdam
      // automaticamente a posição/rotação de "de pé + virado pro ângulo
      // certo" dele, então só precisam girar em `rotation.y` (ver comentário
      // grande acima e o de `_updateRelogiosParede`) pra apontar a hora —
      // nenhuma conta de mundo precisa ser refeita a cada quadro.
      const matPonteiro = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: 0x2c313a });
      const fazPonteiro = (comprimento, largura, espessura) => {
        // Geometria com o PIVÔ na base (não no centro): X=largura (visível de
        // frente), Y=espessura (fininho, no sentido que sai da parede),
        // Z=comprimento (eixo em que o ponteiro se estende) — desloca a
        // geometria em -comprimento/2 no eixo Z LOCAL, então a ORIGEM do mesh
        // (em torno de onde `rotation.y` gira, ver comentário grande da
        // função) fica no "eixo" do relógio, e o ponteiro nasce apontando
        // pro -Z local, que cai em "12 horas" (+Y mundo, pra cima) antes de
        // qualquer rotação de hora — exatamente como um ponteiro parado no
        // 12 antes do relógio começar a andar.
        const g = new THREE.BoxGeometry(largura, espessura, comprimento);
        g.translate(0, 0, -comprimento / 2);
        const m = new THREE.Mesh(g, matPonteiro);
        // Levemente à frente do mostrador (eixo Y LOCAL do `mesh` — depois da
        // rotação X acima, é ele quem cai na normal que sai da parede, +Z
        // mundo — ver comentário grande da função) — evita z-fighting/
        // "ponteiro sumindo dentro do disco".
        m.position.y = h / 2 + 0.002;
        mesh.add(m);
        return m;
      };
      const ponteiroHora = fazPonteiro(r * 0.5, 0.012, 0.003);
      const ponteiroMinuto = fazPonteiro(r * 0.72, 0.008, 0.0025);
      const ponteiroSegundo = fazPonteiro(r * 0.8, 0.003, 0.002);

      const raioPick = r * 1.3;
      const objPos = { x: obj.x, y: centerY, z: obj.y };
      const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: raioPick, ref: obj, obb: { half: { x: r, y: r, z: h }, rotY, shape: 'box', segments: perfil.segments || 14 } };
      this.pickables.push(objPick);
      mesh.userData.pick = objPick;
      this._pickMeshes.push(mesh);

      // Registra pra `_updateRelogiosParede` (chamado todo quadro por
      // view3d.js) girar os ponteiros conforme a hora do MUNDO
      // (`window.RelogioMundo`, ver js/relogio-mundo.js) — não a hora do
      // aparelho do usuário (`new Date()`), decisão consistente com o resto
      // da infraestrutura do prédio (robôs de copa/limpeza/recepcionista já
      // usam `RelogioMundo` pra saber se é hora do almoço etc.).
      // [15/09/2026 UTC] BUG CORRIGIDO — pedido verbatim do usuário: "Acrescentei
      // um script [fixando horaPonteiro/minutoPonteiro/segundoPonteiro], porém
      // o relógio seguiu funcionando normalmente [ignorando o script]." CAUSA
      // RAIZ: este `push` nunca guardava `obj` (só os 3 meshes de ponteiro) —
      // `_updateRelogiosParede` já lia `r.obj?.horaPonteiro` etc. (ver
      // comentário grande lá, RODADA anterior), mas `r.obj` era SEMPRE
      // `undefined` porque a referência nunca tinha sido incluída aqui, então
      // o `Number.isFinite(obj?.horaPonteiro)` sempre falhava e o relógio
      // caía no fallback (hora do `RelogioMundo`) mesmo com um Script válido
      // escrevendo os 3 campos todo quadro. Corrigido incluindo `obj` no
      // objeto registrado.
      this._relogiosParede.push({ obj, ponteiroHora, ponteiroMinuto, ponteiroSegundo });
    }
}

/* [22/09/2026 UTC] Desenho 2D (Mapa) -- extraído de `mapview.js`
 * `Map2DRenderer._drawFormaShape` (pedido verbatim: "Parta para os hooks
 * matchesDraw2D/hitTest2D/properties"). SUBSTITUI o ícone genérico por
 * inteiro (mostrador analógico com ponteiros, nunca desenha o ícone
 * comum por cima) -- por isso usa `draw2D` (troca completa), não
 * `drawOverlay2D` (aditivo, ver escada.js). `ctx` já chega transladado/
 * rotacionado pro centro local do objeto (mesma convenção 0,0=centro que
 * o corpo original já assumia dentro de `_drawFormaShape`). */
function relogioDraw2D(renderer, ctx, obj, iconBoxPx, strokeColor) {
  const rMin = Math.min(iconBoxPx.w, iconBoxPx.h) / 2;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const marcaLonga = i % 3 === 0; // 12/3/6/9 — traço mais grosso/longo
    const r0 = rMin * (marcaLonga ? 0.7 : 0.8), r1 = rMin * 0.92;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(1, rMin * (marcaLonga ? 0.08 : 0.05));
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  // Mesma fonte de 3 números que `Engine3D._updateRelogiosParede`:
  // `obj.horaPonteiro`/`minutoPonteiro`/`segundoPonteiro` quando um Script
  // os escreveu, com fallback pra `window.RelogioMundo.getHoraAtual()`.
  const hMundo = window.RelogioMundo?.getHoraAtual?.();
  const horas = (Number.isFinite(obj.horaPonteiro) ? obj.horaPonteiro : (hMundo?.horas ?? new Date().getHours())) % 12;
  const minutos = Number.isFinite(obj.minutoPonteiro) ? obj.minutoPonteiro : (hMundo?.minutos ?? new Date().getMinutes());
  const segundos = Number.isFinite(obj.segundoPonteiro) ? obj.segundoPonteiro : (hMundo?.segundos ?? new Date().getSeconds());
  const drawHand = (ang, lenFactor, widthFactor, color) => {
    ctx.strokeStyle = color || strokeColor;
    ctx.lineWidth = Math.max(1, rMin * widthFactor);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * rMin * lenFactor, Math.sin(ang) * rMin * lenFactor);
    ctx.stroke();
  };
  drawHand(((horas + minutos / 60) / 12) * Math.PI * 2 - Math.PI / 2, 0.5, 0.09); // ponteiro das horas
  drawHand(((minutos + segundos / 60) / 60) * Math.PI * 2 - Math.PI / 2, 0.72, 0.06); // ponteiro dos minutos
  drawHand((segundos / 60) * Math.PI * 2 - Math.PI / 2, 0.8, 0.02, '#e35b5b'); // ponteiro dos segundos, sempre vermelho
  ctx.beginPath(); ctx.arc(0, 0, Math.max(1.5, rMin * 0.07), 0, Math.PI * 2);
  ctx.fillStyle = strokeColor; ctx.fill();
  ctx.restore();
}

window.ObjectTypes.register('relogio', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'relogio' && perfil.shape === 'cylinder'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    RelogioMeshBuilder.prototype._buildRelogioMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
  matchesDraw2D(obj) { return obj.tipo === 'relogio'; },
  draw2D: relogioDraw2D,
});
