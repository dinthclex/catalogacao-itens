/* js/objecttypes/luminaria-mesa.js
 * [01/10/2026] NOVO (37ª rodada) — "Faça um objeto luminária também." Aproveitado de spawnObject('lamp') do HTML enviado (base + haste + cúpula
 * inclinada + PointLight quente), em escala real de luminária de mesa (~0,2 x 0,36 x 0,5 m) e como tipo SEPARADO ('luminaria-mesa'): o tipo
 * 'luminaria' que já existia é a de TETO (2 lâmpadas fluorescentes) e continua intacto. A luz respeita o modo "Render das luminárias"
 * (dinâmico/leve) e o limite de luzes reais, e carrega os mesmos marcadores (ownerObjId/_intensidadeOriginal) que o interruptor usa.
 */
class LuminariaMesaMeshBuilder {
  _buildLuminariaMesaMesh(obj, perfil, baseY, wireframe, colWireframe) {
    const THREE = this.THREE;
    const rotY = objAnguloToRotY(obj.angulo);
    const mk = (c, extra) => wireframe ? new THREE.MeshBasicMaterial({ color: colWireframe, wireframe: true }) : new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {}));
    const corPeca = perfil.color || 0xf59e0b;
    const g = new THREE.Group();
    g.position.set(obj.x, baseY, obj.y);
    g.rotation.y = rotY;
    // [58ª rodada] a malha é desenhada nas medidas de fábrica; largura/altura/profundidade editadas (perfil vem do objeto) escalam o conjunto
    const fab = (window.OBJECT3D_PROFILES && window.OBJECT3D_PROFILES['luminaria-mesa']) || { w: 0.2, d: 0.36, h: 0.5 };
    if (perfil.w && perfil.h && perfil.d) g.scale.set(perfil.w / fab.w, perfil.h / fab.h, perfil.d / fab.d);
    // [55ª rodada] redesenhada como luminária de mesa articulada (tipo "escritório"): base redonda pesada, braço inferior inclinado, articulação, braço superior
    // e cúpula cônica (lathe, aberta embaixo) inclinada para a mesa, com a lâmpada dentro. ~0,20 (L) x 0,36 (P, o braço avança) x 0,50 m (A); a base fica atrás do centro.
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const barra = (p1, p2, r, cor) => {
      const d = p2.clone().sub(p1), len = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mk(cor));
      m.position.copy(p1).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
      return m;
    };
    const cinza = 0x3f3f46, corCupula = corPeca;
    const zb = -0.09, p0 = V(0, 0.025, zb), pJ = V(0, 0.29, zb + 0.07), pT = V(0, 0.43, 0.075);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.025, 28), mk(cinza));
    base.position.set(0, 0.0125, zb);
    const anel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.02, 16), mk(cinza));   // pescoço da base
    anel.position.set(0, 0.035, zb);
    const braco1 = barra(V(0, 0.04, zb), pJ, 0.008, cinza);
    const junta = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), mk(cinza));
    junta.position.copy(pJ);
    const braco2 = barra(pJ, pT, 0.007, cinza);
    // cúpula: perfil de revolução (topo estreito -> boca larga), aberta; eixo inclinado ~35° para frente/baixo
    const perfilCupula = [V(0.0, 0.0, 0), V(0.03, 0.0, 0), V(0.05, -0.03, 0), V(0.075, -0.085, 0), V(0.09, -0.115, 0)].map((v) => new THREE.Vector2(v.x, v.y));
    const cupula = new THREE.Mesh(new THREE.LatheGeometry(perfilCupula, 28), mk(corCupula, { side: THREE.DoubleSide }));
    cupula.position.copy(pT); cupula.rotation.x = -0.6;
    const tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), mk(cinza));
    tampa.position.set(0, 0.006, 0); cupula.add(tampa);
    const meshes = [base, anel, braco1, junta, braco2, cupula];
    if (!wireframe) {
      // lâmpada "acesa" dentro da cúpula: cor própria (Basic), não depende da luz da cena
      const bulbo = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), new THREE.MeshBasicMaterial({ color: obj.ligada === false ? 0x6b6b6b : 0xfff2d6 }));
      bulbo.userData.lampBulbOf = obj.id;
      bulbo.position.set(0, -0.07, 0); cupula.add(bulbo);
      // interruptor de botão na base
      const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), mk(0xe5e7eb));
      bt.position.set(0.05, 0.03, zb + 0.04); bt.rotation.z = Math.PI / 2; meshes.push(bt);
    }
    meshes.forEach((m) => g.add(m));
    this._group.add(g);
    const hTot = perfil.h || 0.5;
    const objPos = { x: obj.x, y: baseY + hTot / 2, z: obj.y };
    const objPick = { id: obj.id, type: 'object', pos: objPos, center: objPos, radius: Math.max(perfil.w, perfil.d, hTot) * 0.6, ref: obj, obb: { half: { x: perfil.w / 2, y: hTot / 2, z: perfil.d / 2 }, rotY, shape: 'box', segments: 14 } };
    this.pickables.push(objPick);
    meshes.forEach((m) => { m.userData.pick = objPick; this._pickMeshes.push(m); });
    if (this._config.modoLuminarias3D !== 'leve' && (this._dynamicLights?.length || 0) < this._maxLuzesReais()) {
      const I = Engine3D.LUZ_LUMINARIA_INTENSITY * 0.7;
      const luz = new THREE.PointLight(0xffedd5, obj.ligada === false ? 0 : I, Engine3D.LUZ_LUMINARIA_DISTANCE * 0.65, 2);
      luz.position.set(obj.x, baseY + 0.36, obj.y + 0.1 * Math.cos(rotY));
      luz.position.x = obj.x + 0.1 * Math.sin(rotY);
      luz.userData.ownerObjId = obj.id;
      luz.userData._intensidadeOriginal = I;
      luz.visible = obj.ligada !== false;
      this.scene.add(luz);
      this._dynamicLights = this._dynamicLights || [];
      this._dynamicLights.push(luz);
    }
  }
}

/** [57ª rodada] Liga/desliga AO VIVO (sem reconstruir a malha): luz real (intensidade/visibilidade) + cor do bulbo. `obj.ligada` (undefined = ligada). */
const LuminariaMesaLigada = {
  aplicar(engine, obj) {
    if (!engine || !obj) return;
    const on = obj.ligada !== false;
    (engine._dynamicLights || []).forEach((l) => { if (l.userData && l.userData.ownerObjId === obj.id) { l.intensity = on ? (l.userData._intensidadeOriginal || 1) : 0; l.visible = on; } });
    if (engine._group) engine._group.traverse((m) => { if (m.userData && m.userData.lampBulbOf === obj.id && m.material && m.material.color) m.material.color.setHex(on ? 0xfff2d6 : 0x6b6b6b); });
  },
};
window.LuminariaMesaLigada = LuminariaMesaLigada;

/** Script de fábrica (mesmo padrão da Porta): duplo clique alterna ligada/desligada. */
const LUMINARIA_MESA_SCRIPT = [
  '/**',
  ' * Luminária de mesa — duplo clique liga/desliga. O estado fica em obj.ligada (true/false; ausente = ligada).',
  ' * Funções: ligar(), desligar(), alternar(). Gatilho "Ao Clicar Duas Vezes" -> aoClicarDuasVezes().',
  ' */',
  'function Start() {',
  '  if (obj.ligada === undefined) obj.ligada = true;',
  '}',
  '',
  'function Update() {',
  '}',
  '',
  'var _debounceAte = 0;',
  '',
  'function _aplicar() {',
  "  if (typeof view3d !== 'undefined' && view3d && view3d._engine && window.LuminariaMesaLigada) window.LuminariaMesaLigada.aplicar(view3d._engine, obj);",
  '}',
  'function ligar() { obj.ligada = true; _aplicar(); }',
  'function desligar() { obj.ligada = false; _aplicar(); }',
  'function alternar() { obj.ligada = (obj.ligada === false); _aplicar(); }',
  '',
  'function aoClicarDuasVezes() {',
  '  var agora = Date.now();',
  '  if (agora < _debounceAte) return;',
  '  _debounceAte = agora + 250;',
  '  alternar();',
  '}',
  '',
].join('\n');

/** Componentes de fábrica: Script + Gatilho onDoubleClick -> aoClicarDuasVezes (ids novos). */
function luminariaMesaComponentesPadrao(uid) {
  const gerar = uid || ((p) => p + '_' + Math.random().toString(36).slice(2, 10));
  const scriptId = gerar('comp'), trigId = gerar('comp');
  return [
    { id: scriptId, type: 'Script', enabled: true, code: LUMINARIA_MESA_SCRIPT },
    { id: trigId, type: 'EventTrigger', enabled: true, events: [{ event: 'onDoubleClick', actions: [{ targetComponentId: scriptId, method: 'aoClicarDuasVezes', args: [] }] }] },
  ];
}
window.LuminariaMesaLigada.componentesPadrao = luminariaMesaComponentesPadrao;

window.ObjectTypes.register('luminaria-mesa', {
  matchesMesh3D(obj, perfil) { return obj.tipo === 'luminaria-mesa' && perfil.shape === 'box'; },
  buildMesh3D(engine, obj, perfil, baseY, wireframe, colWireframe) {
    LuminariaMesaMeshBuilder.prototype._buildLuminariaMesaMesh.call(engine, obj, perfil, baseY, wireframe, colWireframe);
  },
});
