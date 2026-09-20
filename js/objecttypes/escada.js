/* js/objecttypes/escada.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- mesmo padrão de mesa.js/pilar.js/cadeira.js. Malha 3D
 * extraída ao pé da letra de `js/engine3d.js` (_buildEscadaMesh); a
 * condição de `matchesMesh3D` é cópia EXATA do `if` que existia no
 * dispatcher original (`_buildOneObjectMeshCore`), preservando a mesma
 * prioridade/comportamento.
 *
 * IMPORTANTE: a Escada é SEMPRE gerada por código a partir das propriedades
 * do próprio objeto (largura, profundidade, altura, degraus) — nunca é
 * carregada de modelo de arquivo (assets/modelos/js/escada.malha.js e
 * escada.config.js existem mas NÃO são usados). Cada escada tem a sua
 * própria malha, altura e detecção de degraus (Mapping.objectTopHeightAt).
 */
class EscadaMeshBuilder {
    _buildEscadaMesh(obj, perfil, baseY, wireframe, colWireframe) {
      const THREE = this.THREE;
      const largura = Math.max(0.05, obj.largura || perfil.w || 1.3);
      const profundidadeTotal = Math.max(0.05, obj.profundidade || perfil.d || 3.0);
      const alturaTotal = Math.max(0.05, obj.alturaEscada || obj.altura || perfil.h || 2.0); // própria desta escada
      // Degraus: se `obj.escadaDegraus` não foi configurado pelo usuário, o
      // padrão agora ESCALA com `alturaTotal` visando ~18cm por degrau (medida
      // realista de escada de verdade — ~17-19cm é o padrão de construção).
      // Pra um andar de 4m isso dá `4/0.18 ≈ 22` degraus, bem mais realista
      // que o antigo padrão fixo de 11 (que, aplicado a 4m em vez dos 2m
      // originais, resultaria em degraus de ~36cm de altura — quase o dobro do
      // realista, e beirando o limite de STEP_MAX=0.6m em view3d.js que
      // permite ao jogador "subir andando" sem pular; degraus muito mais altos
      // que isso travariam a subida). Um valor CUSTOMIZADO pelo usuário
      // (`obj.escadaDegraus`) sempre tem prioridade — nunca sobrescrito aqui.
      const degraus = Math.max(1, Math.round(obj.escadaDegraus) || 11); // padrão de fábrica = 11, o mesmo mostrado na janela de propriedades
      const stepDepth = profundidadeTotal / degraus;
      const stepHeight = alturaTotal / degraus;
      const mat = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: perfil.color });
      const rotY = objAnguloToRotY(obj.angulo); // ver objAnguloToRotY — bate com a rotação do 2D
      const cos = Math.cos(rotY), sin = Math.sin(rotY);
      const meshes = [];
      for (let i = 0; i < degraus; i++) {
        const h = stepHeight * (i + 1);
        const geo = new THREE.BoxGeometry(largura, h, stepDepth);
        const m = new THREE.Mesh(geo, mat);
        // Desloca cada degrau ao longo da profundidade LOCAL (eixo Z antes de
        // girar), a partir do início do lance — MESMA convenção local->mundo
        // de `_buildMesaMesh` (wx = x + lx·cos + lz·sin; wz = y - lx·sin + lz·cos).
        const lx = 0, lz = -profundidadeTotal / 2 + stepDepth * (i + 0.5);
        const wx = obj.x + lx * cos + lz * sin;
        const wz = obj.y - lx * sin + lz * cos;
        m.position.set(wx, baseY + h / 2, wz);
        m.rotation.y = rotY;
        meshes.push(m);
      }
      meshes.forEach((m) => this._group.add(m));
      const objPos = { x: obj.x, y: baseY + alturaTotal / 2, z: obj.y };
      const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(largura, profundidadeTotal) * 0.6, ref: obj, obb: { half: { x: largura / 2, y: alturaTotal / 2, z: profundidadeTotal / 2 }, rotY, shape: 'box', segments: 14 } };
      this.pickables.push(objPick);
      meshes.forEach((m) => { m.userData.pick = objPick; this._pickMeshes.push(m); });
    }
}

/* [20/09/2026 UTC] Desenho 2D (Mapa) -- extraído de `mapview.js`
 * `Map2DRenderer._drawFormaShape`. MESMO FORMATO que os demais tipos
 * (`matchesDraw2D`/`draw2D`, substituição completa -- pedido verbatim do
 * usuário: "Relógio e escada devem ficar no mesmo 'formato' que os demais
 * objetos") -- antes este arquivo usava um hook `drawOverlay2D` aditivo só
 * seu (desenhava as linhas dos degraus e deixava o ícone comum ser
 * desenhado depois, fora daqui); agora desenha as linhas dos degraus E o
 * ícone do catálogo, os dois por conta própria, igual `relogio.js` faz com
 * o mostrador/ponteiros. `ctx` já chega transladado/rotacionado pro centro
 * local do objeto (mesma convenção 0,0=centro de sempre). */
function escadaDraw2D(renderer, ctx, obj, iconBoxPx, strokeColor, strokeW) {
  // Cor de contraste FIXA (preto ou branco translúcido, escolhida pela
  // luminância de `obj.cor`) -- nunca a mesma cor do preenchimento
  // (`strokeColor`), senão a linha do degrau fica invisível (0% de
  // contraste) quando o preenchimento é sólido.
  const degraus = Math.max(1, Math.round(obj.escadaDegraus) || 11);
  const [dr, dg, db] = _hexToRgbArr(obj.cor || '#8a92a3');
  const luminanciaFill = (0.299 * dr + 0.587 * dg + 0.114 * db) / 255;
  const corDegrau = luminanciaFill > 0.55 ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.5)';
  ctx.save();
  ctx.strokeStyle = corDegrau;
  ctx.lineWidth = Math.max(1, strokeW * 0.6);
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let i = 1; i < degraus; i++) {
    const ly = -iconBoxPx.h / 2 + (iconBoxPx.h / degraus) * i;
    ctx.moveTo(-iconBoxPx.w / 2, ly);
    ctx.lineTo(iconBoxPx.w / 2, ly);
  }
  ctx.stroke();
  ctx.restore();
  // Ícone do catálogo por cima -- mesmo trecho que `_drawFormaShape` fazia
  // pra QUALQUER `obj.tipo` sem tratamento especial (ver `_getIconImage`
  // em mapview.js); replicado aqui pra escada ficar auto-suficiente, igual
  // os demais tipos que usam `draw2D`.
  const img = renderer._getIconImage(obj.tipo);
  if (img && img.complete && img.naturalWidth) {
    const iconSize = Math.min(iconBoxPx.w, iconBoxPx.h) * 0.6;
    ctx.drawImage(img, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
  }
}

window.ObjectTypes.register('escada', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'escada' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    EscadaMeshBuilder.prototype._buildEscadaMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
  matchesDraw2D(obj) { return obj.tipo === 'escada'; },
  draw2D: escadaDraw2D,
});
