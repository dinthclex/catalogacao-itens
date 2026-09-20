/* js/objecttypes/carro.js
 * Tipo de objeto migrado pro registro (`js/objecttypes/object-type-
 * registry.js`) -- mesmo padrão dos demais. Malha 3D extraída ao pé da
 * letra de `js/engine3d.js` (_buildCarroMesh); a condição de
 * `matchesMesh3D` é cópia EXATA do `if` que existia no dispatcher
 * original (`_buildOneObjectMeshCore`).
 */
class CarroMeshBuilder {
    /** [13/09/2026] NOVO — "carro dirigível" (pedido verbatim: "Faça um
     *  carro, que é possível entrar nele e sair andando [...] Deve ter
     *  rodas, vidros e um formato de carro de verdade"). Geometria composta
     *  com THREE puro, mesmo padrão dos outros builders bespoke deste
     *  arquivo (mesa/luminária/poste/escada/teto-gesso — TODAS malhas filhas
     *  de um único `THREE.Group`, registrado inteiro em `pickables`/
     *  `_pickMeshes` como se fosse UMA peça só, igual `_buildTetoGessoMesh`
     *  logo acima):
     *    - Carroceria: 1 caixa larga (base, `perfil.w x perfil.h x perfil.d`
     *      — perfil vem de `OBJECT3D_PROFILES.carro`, engine3d-profiles.js:
     *      1.75 x 1.4 x 4.3m por padrão) + 1 caixa mais estreita/baixa por
     *      cima simulando a cabine/teto (proporção fixa: 70% da largura, 45%
     *      do comprimento, 45% da altura da base — não configurável por
     *      instância nesta rodada, mesmo espírito "1 forma plausível, não um
     *      modelo fiel por tipo" documentado no topo de engine3d-profiles.js).
     *    - 4 rodas: cilindros pretos nos 4 cantos inferiores da carroceria,
     *      raio 0.32m / largura(altura do cilindro) 0.22m, EIXO alinhado ao
     *      comprimento do carro (CylinderGeometry nasce com o eixo em Y —
     *      girado 90° em Z pra "deitar", ficando com o eixo ao longo de X
     *      local do carro, que é a LARGURA — mesma convenção w=eixo local X/
     *      d=eixo local Z de todo objeto 'retangulo' deste arquivo, ver
     *      `objAnguloToRotY`).
     *    - "Vidros": planos finos (BoxGeometry bem fina, não PlaneGeometry —
     *      evita o problema de um Plane ficar invisível vista de trás/de
     *      lado por causa de backface culling, já que o jogador pode olhar o
     *      carro de qualquer ângulo) nas 2 laterais + frente + trás da
     *      cabine, material `MeshLambertMaterial({color:0x88bbdd,
     *      transparent:true, opacity:0.4})` — pedido verbatim de cor/opacidade.
     *  Cor da carroceria/cabine: `obj.cor` (mesmo campo hex de sempre,
     *  retângulo/polígono) se definido, senão `perfil.color` (vermelho
     *  default do profile, já passado por `_tintForLight` pelo chamador).
     *  Registrado no pick/`_pickMeshes` (clicável — `carro.model.js` usa
     *  `onModelClick` pra entrar no carro, ver `view3d.js
     *  _entrarNoCarro`). LIMITAÇÃO — ver comentário grande em
     *  `_updateCarrosControlados` (view3d.js) pra tudo que este carro NÃO
     *  faz ainda (colisão contra paredes, suspensão/inclinação em curva). */
    _buildCarroMesh(obj, perfil, baseY, wireframe, colWireframe) {
      const THREE = this.THREE;
      const group = new THREE.Group();
      const corCarroceria = obj.cor ? _hexToThreeColor(obj.cor) : perfil.color;
      const matCarroceria = wireframe
        ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true })
        : new THREE.MeshLambertMaterial({ color: corCarroceria });

      // Carroceria (base) — apoiada no chão (y local 0 = topo das rodas,
      // ver `alturaRoda` abaixo definir onde a base do carro fica).
      const raioRoda = 0.32, larguraRoda = 0.22;
      const alturaCarroceria = perfil.h; // 1.4m default
      const yCarroceriaBase = raioRoda * 0.75; // carroceria fica um pouco acima do centro da roda, "encaixada" nela
      const carroceriaGeo = new THREE.BoxGeometry(perfil.w, alturaCarroceria, perfil.d);
      const carroceria = new THREE.Mesh(carroceriaGeo, matCarroceria);
      carroceria.position.set(0, yCarroceriaBase + alturaCarroceria / 2, 0);
      group.add(carroceria);

      // Cabine/teto — caixa mais estreita/baixa, centralizada e puxada um
      // pouco pra trás do centro (proporção fixa documentada no comentário
      // grande acima do método).
      const cabineW = perfil.w * 0.7, cabineD = perfil.d * 0.45, cabineH = alturaCarroceria * 0.45;
      const cabineGeo = new THREE.BoxGeometry(cabineW, cabineH, cabineD);
      const cabine = new THREE.Mesh(cabineGeo, matCarroceria);
      const yCabineBase = yCarroceriaBase + alturaCarroceria; // apoiada no topo da carroceria
      cabine.position.set(0, yCabineBase + cabineH / 2, -perfil.d * 0.05); // leve deslocamento pra trás
      group.add(cabine);

      // 4 rodas — cantos inferiores da carroceria, giradas 90° em Z (eixo do
      // cilindro passa a apontar ao longo de X local, "deitando" a roda).
      if (!wireframe) {
        const matRoda = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
        const rodaGeo = new THREE.CylinderGeometry(raioRoda, raioRoda, larguraRoda, 16);
        const offsetX = perfil.w / 2 - larguraRoda * 0.15; // roda quase na borda externa da carroceria
        const offsetZ = perfil.d / 2 - raioRoda * 1.1; // um pouco pra dentro das extremidades dianteira/traseira
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const roda = new THREE.Mesh(rodaGeo, matRoda);
            roda.rotation.z = Math.PI / 2;
            roda.position.set(sx * offsetX, raioRoda, sz * offsetZ);
            group.add(roda);
          }
        }
      }

      // "Vidros" — 4 placas finas (BoxGeometry, não Plane — ver comentário
      // grande acima do método) nas laterais/frente/trás da cabine.
      if (!wireframe) {
        const matVidro = new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.4 });
        const ESPESSURA = 0.02;
        const yVidro = yCabineBase + cabineH / 2;
        // Laterais (esquerda/direita) — placa fina ao longo de Z (comprimento
        // da cabine), quase da largura total da cabine.
        const vidroLatGeo = new THREE.BoxGeometry(ESPESSURA, cabineH * 0.65, cabineD * 0.9);
        for (const sx of [-1, 1]) {
          const vidro = new THREE.Mesh(vidroLatGeo, matVidro);
          vidro.position.set(sx * (cabineW / 2 - ESPESSURA / 2), yVidro, cabine.position.z);
          group.add(vidro);
        }
        // Frente/trás — placa fina ao longo de X (largura da cabine).
        const vidroFrenteGeo = new THREE.BoxGeometry(cabineW * 0.85, cabineH * 0.6, ESPESSURA);
        for (const sz of [-1, 1]) {
          const vidro = new THREE.Mesh(vidroFrenteGeo, matVidro);
          vidro.position.set(0, yVidro, cabine.position.z + sz * (cabineD / 2 - ESPESSURA / 2));
          group.add(vidro);
        }
      }

      const centerY = baseY + perfil.y0; // grupo já tem a geometria toda posicionada relativa ao chão (y local 0 = chão)
      group.position.set(obj.x, centerY, obj.y);
      group.rotation.y = objAnguloToRotY(obj.angulo);
      this._group.add(group);
      const alturaTotal = yCabineBase + cabineH;
      const raioPick = Math.max(perfil.w, perfil.d) * 0.6;
      const objPos = { x: obj.x, y: centerY + alturaTotal / 2, z: obj.y };
      const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: raioPick, ref: obj, obb: { half: { x: perfil.w / 2, y: alturaTotal / 2, z: perfil.d / 2 }, rotY: group.rotation.y, shape: 'box', segments: 14 } };
      this.pickables.push(objPick);
      group.userData.pick = objPick;
      this._pickMeshes.push(group);
      // Guarda a referência do Group real desta instância pra
      // `view3d._updateCarroCamera`/física poderem reposicionar o carro TODO
      // quadro enquanto controlado (ver `entity._velocidade` em
      // `_updateCarrosControlados`, view3d.js) sem precisar reconstruir a
      // cena a cada frame — mesmo espírito de `_camPs1RefsById`/refs vivas já
      // usadas por câmera/relógio neste arquivo. [correção 13/09/2026] Guarda
      // em `this._carroRefsById` (por id), NÃO em `obj` — ver comentário
      // grande em `setScene` sobre `_doorRuntime`/por que anexar um
      // THREE.Group direto na entidade persistida quebrava o IndexedDB.
      this._carroRefsById[obj.id] = group;
      // [13/09/2026] SEMPRE marcado (diferente do `if (temScriptAtivo)`
      // condicional usado pelos outros builders acima) — um carro não
      // precisa de nenhum `ScriptComponent` pra se mover: a física de
      // inércia (`view3d.js _updateCarrosControlados`) muda `obj.x`/`obj.y`/
      // `obj.angulo` diretamente enquanto o jogador dirige, e reaproveitar
      // `_syncScriptedObjectTransforms` (chamado TODO quadro por
      // `_updateScriptLifecycle`, ver lá) já resolve "refletir esses valores
      // na malha de verdade" de graça, sem precisar duplicar a lógica de
      // reposicionamento aqui.
      this._tagScriptBase(group, obj, baseY);
    }
}

window.ObjectTypes.register('carro', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'carro' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    CarroMeshBuilder.prototype._buildCarroMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
