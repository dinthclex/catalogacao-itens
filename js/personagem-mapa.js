/**
 * personagem-mapa.js — estado do PERSONAGEM guardado junto com cada mapa.
 *
 * [26/09/2026] NOVO -- pedido verbatim: "Ao exportar o mapa, a informações do personagem devem ser guardadas
 * junto com o mapa (posição, apontamento de câmera)."
 *
 * O personagem é um só no app (MapView._personagem2D no 2D; View3D._camera / View3D._v3dEstadoSalvo no 3D --
 * ver comentários grandes em view3d.js mount()/unmount()). Este módulo:
 *  - captura o estado atual (posição x/y + ângulo do 2D; posição x/y/z, yaw/pitch da câmera e gravidade do 3D);
 *  - guarda um estado POR MAPA na configuração 'personagemPorMapa' ({ [mapId]: estado }) -- sem gravar no
 *    registro do mapa (gravar no mapa mudaria o carimbo atualizadoEm e o hash de identidade, ver db.js fpMapa);
 *  - ao exportar, anexa `personagem` a cada mapa exportado (mapa atual = estado ao vivo; outros = o guardado);
 *  - ao importar, guarda o `personagem` que veio no mapa (só em mapas criados/substituídos, nunca em "manter")
 *    e, se for o mapa atual, já aplica;
 *  - ao trocar de mapa (DB.setCurrentMap), guarda o do mapa que sai e aplica o do mapa que entra (se houver).
 * O campo `personagem` é ignorado no hash de identidade do mapa (é estado de visualização, não conteúdo).
 */
(function (raiz) {
  'use strict';

  const _num = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

  const PersonagemMapa = {
    _KEY: 'personagemPorMapa',

    /** Estado atual do personagem (ou null se nunca foi posicionado nesta sessão). */
    capturarAtual() {
      let personagem2D = null;
      try {
        const p = raiz.MapView && raiz.MapView._personagem2D;
        if (p && _num(p.x) !== null && _num(p.y) !== null) personagem2D = { x: p.x, y: p.y, angulo: _num(p.angulo) ?? 0 };
      } catch (e) { /* ignora */ }
      let camera3D = null;
      try {
        const V = raiz.View3D;
        if (V && V._container && V._camera) {
          const c = V._camera;
          camera3D = { x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch, gravityEnabled: V._gravityEnabled !== false };
        } else if (V && V._v3dEstadoSalvo) {
          camera3D = { ...V._v3dEstadoSalvo };
        }
        if (camera3D && ![camera3D.x, camera3D.y, camera3D.z, camera3D.yaw, camera3D.pitch].every((n) => _num(n) !== null)) camera3D = null;
      } catch (e) { /* ignora */ }
      if (!personagem2D && !camera3D) return null;
      return { versao: 1, personagem2D, camera3D, guardadoEm: (raiz.DB && DB.nowISO) ? DB.nowISO() : new Date().toISOString() };
    },

    /** Aplica um estado guardado ao personagem (2D e 3D). */
    aplicar(estado) {
      if (!estado) return;
      try {
        const p = estado.personagem2D;
        if (p && _num(p.x) !== null && _num(p.y) !== null && raiz.MapView) raiz.MapView._personagem2D = { x: p.x, y: p.y, angulo: _num(p.angulo) ?? 0 };
      } catch (e) { /* ignora */ }
      try {
        const c = estado.camera3D;
        if (c && raiz.View3D && [c.x, c.y, c.z, c.yaw, c.pitch].every((n) => _num(n) !== null)) {
          raiz.View3D._v3dEstadoSalvo = { x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch, gravityEnabled: c.gravityEnabled !== false };
        }
      } catch (e) { /* ignora */ }
    },

    async _todos() {
      try { const t = await DB.getSetting(this._KEY, null); return (t && typeof t === 'object') ? { ...t } : {}; } catch (e) { return {}; }
    },
    async guardarParaMapa(mapId, estado) {
      if (!mapId || !estado) return;
      const todos = await this._todos();
      todos[mapId] = estado;
      try { await DB.setSetting(this._KEY, todos); } catch (e) { console.warn('[PersonagemMapa] falha ao guardar:', e); }
    },

    /** Estado do personagem de um mapa: o mapa atual usa o estado AO VIVO; os outros, o guardado (ou o que veio
     *  num backup importado, `mapa.personagem`). */
    async obterDoMapa(mapa, atualId, todos) {
      if (!mapa) return null;
      if (mapa.id === atualId) { const vivo = this.capturarAtual(); if (vivo) return vivo; }
      return (todos && todos[mapa.id]) || mapa.personagem || null;
    },

    /** Devolve CÓPIAS dos mapas com o campo `personagem` preenchido (quando houver) -- usado na exportação. */
    async anexarAosMapas(mapas) {
      if (!Array.isArray(mapas) || !mapas.length) return mapas;
      let atualId = null;
      try { atualId = await DB.getSetting('ambienteAtualId', null); } catch (e) { /* ignora */ }
      const todos = await this._todos();
      const saida = [];
      for (const m of mapas) {
        if (!m) { saida.push(m); continue; }
        const est = await this.obterDoMapa(m, atualId, todos);
        saida.push(est ? { ...m, personagem: est } : m);
      }
      return saida;
    },

    /** Chamado por DB.setCurrentMap: guarda o estado do mapa que sai e aplica o do mapa que entra. */
    async aoTrocarMapa(antigoId, novoId) {
      if (!novoId || antigoId === novoId) return;
      if (antigoId) { const vivo = this.capturarAtual(); if (vivo) await this.guardarParaMapa(antigoId, vivo); }
      const todos = await this._todos();
      let est = todos[novoId] || null;
      if (!est) { try { est = (await DB.getMap(novoId))?.personagem || null; } catch (e) { est = null; } }
      if (est) this.aplicar(est);
    },

    /** Chamado depois de DB.importMaps (settings.js #st-import): guarda o personagem de cada mapa CRIADO ou com a
     *  planta SUBSTITUÍDA pelo backup (mapa "mantido" continua com o personagem local) e aplica se for o atual. */
    async aoImportarMapas(resultadoImportMaps) {
      if (!resultadoImportMaps) return;
      const pares = [];
      (resultadoImportMaps.criadosMaps || []).forEach((rec) => { if (rec && rec.personagem) pares.push([rec.id, rec.personagem]); });
      (resultadoImportMaps.atualizadosAntes || []).forEach((a) => { if (a && a.importado && a.importado.personagem && a.before) pares.push([a.before.id, a.importado.personagem]); });
      if (!pares.length) return;
      const todos = await this._todos();
      pares.forEach(([id, est]) => { todos[id] = est; });
      try { await DB.setSetting(this._KEY, todos); } catch (e) { console.warn('[PersonagemMapa] falha ao guardar (import):', e); }
      let atualId = null;
      try { atualId = await DB.getSetting('ambienteAtualId', null); } catch (e) { /* ignora */ }
      const doAtual = pares.find(([id]) => id === atualId);
      if (doAtual) this.aplicar(doAtual[1]);
    },
  };

  raiz.PersonagemMapa = PersonagemMapa;
})(typeof window !== 'undefined' ? window : globalThis);
