/* js/objecttypes/camera.js
 * [22/09/2026] NOVO MÓDULO — pedido verbatim do usuário: "Vasculhe nos
 * arquivos sobre a Câmera e desvincule a necessidade de ter uma foto. A
 * foto deve ser só um acessório da Câmera. Assim como um objeto pode ter
 * patrimônio associado ou não." + "faça a separação, pois o objeto Câmera
 * é um objeto independente de foto." + "Unifique e modularize." + "O objeto
 * Câmera deve ser autocontido e ter os seus próprios métodos, assim como o
 * padrão para os objetos em janela 'Ferramentas'->'Objetos'."
 *
 * Por isso este arquivo mora em `js/objecttypes/`, ao lado dos demais tipos
 * de objeto do catálogo (ver `object-type-registry.js` no mesmo diretório
 * pro padrão geral: 1 arquivo por tipo, autoregistrado via
 * `ObjectTypes.register(tipo, def)`) — `CameraPin` abaixo é o `def`
 * autocontido da Câmera (todos os métodos de criar/ler/gravar/anexar foto/
 * excluir centralizados aqui, nada espalhado). A Câmera é registrada no
 * mesmo `ObjectTypes` (pra aparecer junto na listagem de tipos), mas
 * DELIBERADAMENTE não implementa `buildMesh3D`/`draw2D` como os tipos
 * "sólidos" (mesa, rack, pilar...): ela reaproveita o desenho de "pino"
 * (seta de direção, ícone 📷, retângulo texturizado no 3D só quando há
 * foto) que já existe e também é usado pelas fotos legadas (ver
 * mapview.js/engine3d.js, bloco "fotos vinculadas ao mapa") — problema
 * diferente dos objetos sólidos do catálogo (sem colisão, sem malha 3D
 * própria quando não tem foto), então não faz sentido forçar os mesmos
 * hooks. O que É igual ao padrão dos objetos: guardada em array PRÓPRIO no
 * documento do mapa (`map.cameras`, mesma família de `map.objects`/
 * `map.textos`/`map.portas`), gravada por `DB.saveMap`, NUNCA pela tabela
 * de fotos — e 100% autocontida neste único arquivo.
 *
 * CONTEXTO: antes desta rodada, um "objeto Câmera" (ferramenta 'foto-orb'
 * na janela 'Ferramentas') NASCIA como uma linha da tabela de AmbientePhotos
 * (`DB.addAmbientePhoto`, ver mapview.js `_placeFotoOrbAtWorld` antigo) —
 * ou seja, "Câmera" e "foto" eram sempre o MESMO registro no banco, mesmo
 * sem nenhuma imagem anexada. Isso é correto e continua sendo usado por
 * "Foto" → tirar/escolher foto → "🗺️ Marcar aqui" (ali sim as duas coisas
 * nascem juntas de propósito — ver mapview.js `_placePhotoPinAtWorld`,
 * NÃO tocado por este módulo). O problema era só a ferramenta "Câmera" do
 * mapa 2D: colocar uma Câmera sem foto nenhuma gerava uma linha "fantasma"
 * na tabela de fotos (sem dataUrl), que vazava pra 'Mapa'->'Fotos' e pra
 * qualquer contagem de fotos do ambiente.
 *
 * SOLUÇÃO: uma Câmera criada por essa ferramenta agora é um objeto
 * INDEPENDENTE, gravado direto no documento do mapa (`map.cameras`, ver
 * `Mapping.ensureNewFields` — mesma família de `map.objects`/`map.textos`/
 * `map.portas`), com todos os seus próprios campos (posição, camada, nome,
 * direção/altura/inclinação, propriedades de câmera, scripts, histórico).
 * Uma foto de verdade (`fotoId`, apontando pra uma linha normal de
 * AmbientePhotos que guarda só `dataUrl`/`thumbDataUrl`) é um ACESSÓRIO
 * opcional — só passa a existir quando alguém de fato anexa uma imagem
 * (`attachPhoto` abaixo), exatamente como um objeto do catálogo pode ou não
 * ter um patrimônio associado.
 *
 * Este módulo é o ÚNICO lugar que decide "esta Câmera é independente
 * (map.cameras) ou é uma foto legada com posição (mapaX/mapaY na tabela de
 * AmbientePhotos)?" — todo o resto do app (mapview.js, view3d.js,
 * js/cards/foto-pin-card.js) continua enxergando os dois casos através do
 * MESMO formato "achatado" de sempre (`map.fotos[i]`), sem precisar saber
 * qual dos dois é. `buildFotosArray` substitui a lógica que antes vivia
 * duplicada (e por isso já tinha gerado bug de dessincronia antes) em
 * `mapview.js _refreshFotosNoMapa` e `view3d.js _buildFotosNoMapa` — as
 * duas agora só chamam esta função.
 */
window.CameraPin = {
  /** [22/09/2026] NOVO — pedido verbatim: "ao clicar na grade do mapa 2D
   *  (estando o objeto Câmera selecionado), então, deve ser colocado
   *  imediatamente [...] não deve esperar por uma resposta do banco" (e o
   *  mesmo pra excluir com a ferramenta 'Apagar'). CAUSA RAIZ: `DB.saveMap`
   *  (js/db.js) já é otimista na MEMÓRIA (`map.set(id, rec)` acontece na
   *  hora), mas a PROMISE que ele devolve só resolve depois de uma janela
   *  de debounce (⏱️ "Velocidade de salvamento do mapa", ~1-2s por padrão)
   *  — `await DB.saveMap(map)` no meio de `create`/`delete`/etc. fazia
   *  quem chamava (mapview.js) esperar essa janela inteira antes de
   *  atualizar a tela, mesmo o dado já estando salvo em memória. Corrigido
   *  chamando `DB.saveMap` SEM `await` (fire-and-forget, com `.catch` pra
   *  não sumir um erro de gravação em silêncio) — mesmo espírito do
   *  `_saveMap()` de mapview.js (chamado sem `await` em dezenas de outros
   *  pontos do próprio arquivo). */
  _persistMap(map) {
    DB.saveMap(map).catch((e) => {
      console.error('[CameraPin] falha ao salvar o mapa:', e);
      window.Utils?.toast?.('⚠️ Falha ao salvar o mapa — tente novamente.', { type: 'danger', duration: 5000 });
    });
  },

  /** Câmera nova/independente → linha da tabela de AmbientePhotos, se
   *  houver (`fotoId`) → mesmo formato achatado de sempre. */
  async _fromCameraObj(map, c) {
    let dataUrl = null, thumbDataUrl = null;
    if (c.fotoId) {
      const foto = await DB.getAmbientePhoto(c.fotoId);
      if (foto) { dataUrl = foto.dataUrl || null; thumbDataUrl = foto.thumbDataUrl || null; }
      else c.fotoId = null; // foto apagada por fora (não deveria acontecer, ver delete/detachPhoto) — não deixa um fotoId órfão
    }
    return {
      id: c.id, x: c.x, y: c.y, piso: c.piso || 0, nome: c.nome || '', layerId: c.layerId || null,
      dirAngulo: c.dirAngulo || 0, altura: c.altura ?? 1.6, rotPerp: c.rotPerp || 0, roll: c.roll || 0,
      dataUrl, thumbDataUrl, vanishCam: c.vanishCam || null, camProps: c.camProps || null,
      components: c.components || [], historico: c.historico || [],
      fotoId: c.fotoId || null, __cameraObjeto: true,
    };
  },

  /** Linha legada da tabela de AmbientePhotos, já posicionada (mapaX/mapaY)
   *  — MESMO mapeamento que existia em `_refreshFotosNoMapa`/
   *  `_buildFotosNoMapa` antes desta rodada, só centralizado aqui. */
  _fromLegacyRow(f, layerId) {
    return {
      id: f.id, x: f.mapaX, y: f.mapaY, piso: f.mapaPiso || 0, nome: f.nome || '', layerId,
      dirAngulo: f.mapaDirAngulo || 0, altura: f.mapaAltura ?? 1.6, rotPerp: f.mapaRotPerp || 0, roll: f.mapaRoll || 0,
      dataUrl: f.dataUrl || null, thumbDataUrl: f.thumbDataUrl || null, vanishCam: f.mapaVanishCam || null,
      camProps: f.mapaCamProps || null, components: f.mapaComponents || [], historico: f.historico || [],
      fotoId: null, __cameraObjeto: false,
    };
  },

  /** Monta `map.fotos` (o array achatado que 2D/3D/painéis consomem) —
   *  mescla as Câmeras independentes novas (`map.cameras`) com as fotos
   *  legadas já posicionadas (`DB.getAllAmbientePhotos`, filtradas por
   *  `mapaX`/`mapaY`). Também cura `layerId` órfão nos dois casos (mesmo
   *  comportamento de antes). ÚNICA fonte de verdade — chamada tanto por
   *  `mapview.js _refreshFotosNoMapa` (2D) quanto por `view3d.js
   *  _buildFotosNoMapa` (3D). */
  async buildFotosArray(map) {
    if (!map) return [];
    const todasFotos = await DB.getAllAmbientePhotos();
    const legadoPosicionado = todasFotos.filter((f) => typeof f.mapaX === 'number' && typeof f.mapaY === 'number');
    const curarLegado = [];
    const listaLegado = legadoPosicionado.map((f) => {
      const layerId = Mapping.resolveLayerId(map, f.mapaLayerId);
      if (layerId && layerId !== (f.mapaLayerId || null)) curarLegado.push({ id: f.id, layerId });
      return this._fromLegacyRow(f, layerId);
    });
    for (const c of curarLegado) { const p = await DB.getAmbientePhoto(c.id); if (p) await DB.saveAmbientePhoto({ ...p, mapaLayerId: c.layerId }); }

    const cameras = map.cameras || [];
    let mudouMapa = false;
    const listaCameras = [];
    for (const c of cameras) {
      const layerId = Mapping.resolveLayerId(map, c.layerId);
      if (layerId && layerId !== (c.layerId || null)) { c.layerId = layerId; mudouMapa = true; }
      listaCameras.push(await this._fromCameraObj(map, c));
    }
    if (mudouMapa) this._persistMap(map);

    return [...listaLegado, ...listaCameras];
  },

  isCameraId(map, id) { return this._findIdx(map, id) !== -1; },
  _findIdx(map, id) { return (map?.cameras || []).findIndex((c) => c.id === id); },

  /** Cria uma Câmera nova e independente — SEM foto nenhuma, sem tocar a
   *  tabela de AmbientePhotos (pedido verbatim: "Ao colocar uma câmera no
   *  mapa, não deve gerar uma foto junto"). */
  async create(map, { x, y, piso = 0, layerId = null, nome, altura = 1.6 } = {}) {
    if (!map.cameras) map.cameras = [];
    const cam = {
      id: Utils.uid('camera'), x, y, piso, layerId,
      nome: nome || Mapping._nextObjectName(map, 'Câmera'),
      dirAngulo: 0, altura, rotPerp: 0, roll: 0,
      camProps: null, components: [], historico: [], vanishCam: null, fotoId: null,
      criadoEm: DB.nowISO(),
    };
    map.cameras.push(cam);
    this._persistMap(map);
    return cam;
  },

  /** Lê um "pino" de Câmera/foto no formato achatado de sempre — usar no
   *  lugar de `DB.getAmbientePhoto(id)` em qualquer trecho que edita um
   *  pino de Câmera (mapview.js `_openFotoPinPopover` e afins, js/cards/
   *  foto-pin-card.js). Continua funcionando sem diferença nenhuma pras
   *  fotos legadas (repassa pra `DB.getAmbientePhoto` puro). */
  async get(map, id) {
    const idx = this._findIdx(map, id);
    if (idx !== -1) return this._fromCameraObj(map, map.cameras[idx]);
    return DB.getAmbientePhoto(id);
  },

  /** Grava um patch no MESMO formato usado nos vários `{...photo, ...patch}`
   *  espalhados pelo app (chaves `mapaX`/`mapaY`/`mapaPiso`/`mapaLayerId`/
   *  `mapaDirAngulo`/`mapaAltura`/`mapaRotPerp`/`mapaRoll`/`mapaVanishCam`/
   *  `mapaVanishCamDefinidoEm`/`mapaCamProps`/`mapaComponents`/`historico`/
   *  `nome`/`dataUrl`/`thumbDataUrl`) — decide sozinho se escreve no objeto
   *  Câmera independente ou na linha legada de AmbientePhoto. */
  async save(map, id, patch) {
    const idx = this._findIdx(map, id);
    if (idx === -1) {
      const atual = await DB.getAmbientePhoto(id);
      if (!atual) return null;
      return DB.saveAmbientePhoto({ ...atual, ...patch });
    }
    const FIELD_MAP = {
      mapaX: 'x', mapaY: 'y', mapaPiso: 'piso', mapaLayerId: 'layerId',
      mapaDirAngulo: 'dirAngulo', mapaAltura: 'altura', mapaRotPerp: 'rotPerp', mapaRoll: 'roll',
      mapaVanishCam: 'vanishCam', mapaVanishCamDefinidoEm: 'vanishCamDefinidoEm',
      mapaCamProps: 'camProps', mapaComponents: 'components',
    };
    const cam = { ...map.cameras[idx] };
    for (const [de, para] of Object.entries(FIELD_MAP)) { if (de in patch) cam[para] = patch[de]; }
    if ('nome' in patch) cam.nome = patch.nome;
    if ('historico' in patch) cam.historico = patch.historico;
    // dataUrl/thumbDataUrl soltos num patch (compatibilidade com quem ainda
    // chama assim) — o caminho recomendado pra anexar/trocar é
    // `attachPhoto`/`detachPhoto` abaixo, mas cobre aqui também.
    if ('dataUrl' in patch || 'thumbDataUrl' in patch) {
      if (patch.dataUrl == null && patch.thumbDataUrl == null) {
        if (cam.fotoId) { await DB.deleteAmbientePhoto(cam.fotoId); cam.fotoId = null; }
      } else {
        await this._escreverFotoAcessorio(map, cam, patch.dataUrl, patch.thumbDataUrl);
      }
    }
    map.cameras[idx] = cam;
    this._persistMap(map);
    return this._fromCameraObj(map, cam);
  },

  async _escreverFotoAcessorio(map, cam, dataUrl, thumbDataUrl) {
    if (cam.fotoId) {
      const atual = await DB.getAmbientePhoto(cam.fotoId);
      await DB.saveAmbientePhoto({ ...(atual || { id: cam.fotoId, ambienteId: map.id }), dataUrl, thumbDataUrl });
    } else {
      const novo = await DB.addAmbientePhoto({ ambienteId: map.id, nome: cam.nome, dataUrl, thumbDataUrl });
      cam.fotoId = novo.id;
    }
  },

  /** Anexa/troca a foto "acessório" desta Câmera — só AQUI (ou em `save`
   *  acima, por compatibilidade) uma linha de AmbientePhotos chega a ser
   *  criada para uma Câmera independente. Pra uma foto legada (câmera
   *  fundida com a foto, ver `_fromLegacyRow`), é só uma troca normal de
   *  dataUrl na própria linha. */
  async attachPhoto(map, id, { dataUrl, thumbDataUrl }) {
    const idx = this._findIdx(map, id);
    if (idx === -1) {
      const atual = await DB.getAmbientePhoto(id);
      if (!atual) return null;
      return DB.saveAmbientePhoto({ ...atual, dataUrl, thumbDataUrl });
    }
    const cam = { ...map.cameras[idx] };
    await this._escreverFotoAcessorio(map, cam, dataUrl, thumbDataUrl);
    map.cameras[idx] = cam;
    this._persistMap(map);
    return this._fromCameraObj(map, cam);
  },

  /** Remove só a foto "acessório" desta Câmera — o objeto continua no mapa
   *  (posição/direção/altura/campo de visão/scripts/histórico intactos),
   *  só sem imagem nenhuma até anexar outra. */
  async detachPhoto(map, id) {
    const idx = this._findIdx(map, id);
    if (idx === -1) {
      const atual = await DB.getAmbientePhoto(id);
      if (!atual) return null;
      return DB.saveAmbientePhoto({ ...atual, dataUrl: null, thumbDataUrl: null });
    }
    const cam = { ...map.cameras[idx] };
    if (cam.fotoId) { await DB.deleteAmbientePhoto(cam.fotoId); cam.fotoId = null; }
    map.cameras[idx] = cam;
    this._persistMap(map);
    return this._fromCameraObj(map, cam);
  },

  /** Exclui a Câmera inteira — objeto independente + foto acessório
   *  vinculada, se houver. Pra uma foto legada, é a exclusão de sempre
   *  (`DB.deleteAmbientePhoto`, que já apagava câmera+foto juntas). */
  async delete(map, id) {
    const idx = this._findIdx(map, id);
    if (idx === -1) return DB.deleteAmbientePhoto(id);
    const cam = map.cameras[idx];
    if (cam.fotoId) await DB.deleteAmbientePhoto(cam.fotoId);
    map.cameras.splice(idx, 1);
    this._persistMap(map);
  },

  /** Dado o id de uma FOTO de verdade (linha da tabela de AmbientePhotos),
   *  acha a Câmera independente (se houver) que a usa como acessório —
   *  usado por ambientephotos.js `_deletePhoto`: excluir essa foto por lá
   *  nunca deve excluir a Câmera (ela é independente), só desvincular. */
  findCameraByFotoId(map, fotoId) {
    return (map?.cameras || []).find((c) => c.fotoId === fotoId) || null;
  },
};

// Autoregistro no MESMO catálogo dos demais tipos de objeto (ver
// object-type-registry.js) — sem `matchesMesh3D`/`draw2D`/`hitTest2D`
// (motivo no comentário grande no topo do arquivo), só pra Câmera constar
// como um tipo de verdade do sistema, igual aos outros.
window.ObjectTypes?.register('camera', window.CameraPin);
