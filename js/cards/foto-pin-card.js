/* js/cards/foto-pin-card.js
 * Card mostrado ao mirar/selecionar o retângulo 3D de uma foto vinculada
 * ao mapa (ver engine3d.js setScene, bloco "fotos vinculadas ao mapa",
 * pickable tipo 'fotoPin'). Extraído de `View3D._showFotoPinCard3D`
 * (js/view3d.js) — ver comentário grande no topo de `js/cardsystem.js` pro
 * porquê da extração.
 *
 * A foto SEMPRE
 * existe (o retângulo só é construído quando `foto.thumbDataUrl`/`dataUrl`
 * estão presentes) — sem estado "sem foto associada" pra tratar. `data`
 * (chamado `foto` aqui) é o registro já achatado de `mapview.js
 * _refreshFotosNoMapa` (`this._map.fotos`), com `id` == id da mapPhoto de
 * verdade (js/db.js).
 *
 * Usa `build()` (em vez de `bodyHtml`+`wire` separados) porque o `wire`
 * precisa criar uma closure (`v3dPropsApi`) que é preenchida DEPOIS que o
 * HTML já está montado e usada por dois pontos diferentes do próprio wire
 * (trocar foto / abrir propriedades) — mais simples manter tudo numa função
 * só aqui do que espalhar estado entre `bodyHtml` e `wire`.
 */
window.CardSystem.register('foto-pin', {
  build(foto, ctx) {
    const html = `
      <div style="position:sticky; top:-14px; z-index:3; margin:-14px -14px 8px; padding:10px 40px 6px; background:rgba(23,27,33,.98); border-radius:var(--radius-lg) var(--radius-lg) 0 0; text-align:center; font-weight:700">📷 Câmera
        <button type="button" id="v3d-fc-x" class="icon-btn sm" title="Fechar" style="position:absolute; top:6px; right:8px">✕</button>
      </div>
      <div class="map-fotopin-thumb-wrap" id="v3d-foto-thumb-wrap" title="Clique na foto para trocá-la ou desvinculá-la">
        <img id="v3d-foto-thumb" class="map-fotopin-thumb hidden" alt="">
        <button type="button" class="btn secondary sm hidden" id="v3d-foto-anexar" title="Escolher uma imagem para esta câmera">📎 Anexar foto</button>
        <input type="file" id="v3d-foto-anexar-file" accept="image/*" style="display:none">
      </div>
      <button class="btn block sm" id="v3d-foto-vercamera" title="Ver o cenário 3D pela perspectiva desta foto, com a foto sobreposta semitransparente (como 'ver através da câmera' no Blender)">👁️ Ver através desta câmera</button>
      <button class="btn block sm" id="v3d-foto-abrir" style="margin-top:6px" title="Abrir esta foto em 'Mapa' → 'Fotos'">🖼️ Abrir foto</button>
      <button type="button" class="btn secondary block sm" id="v3d-foto-props-toggle" style="margin-top:6px">⚙️ Propriedades da câmera</button>
      <div id="v3d-foto-props" class="hidden"></div>
      <button type="button" class="btn secondary block sm" id="v3d-foto-hist-toggle" style="margin-top:6px">📜 Histórico deste objeto${window.ObjectStandard?.indicadorHtml(foto) || ''}</button>
      <div id="v3d-foto-hist" class="hidden"></div>
      <button class="btn secondary block sm" id="v3d-fc-close" style="margin-top:6px" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;

    const wire = (el) => {
      const view3d = ctx.view3d;
      const DB = ctx.DB;
      const Utils = ctx.Utils;
      const AmbientePhotos = window.AmbientePhotos;

      el.querySelector('#v3d-fc-close').onclick = () => el.remove();
      el.querySelector('#v3d-fc-x').onclick = () => el.remove();
      {
        const toggle = el.querySelector('#v3d-foto-hist-toggle');
        const host = el.querySelector('#v3d-foto-hist');
        if (toggle && host && window.ObjectStandard) {
          toggle.onclick = () => {
            if (host.classList.contains('hidden') && !host.dataset.built) {
              host.innerHTML = window.ObjectStandard.historicoHtml(foto, 'v3d-foto-hist');
              window.ObjectStandard.wireHistoricoUi(host, foto, 'v3d-foto-hist', async () => {
                // [22/09/2026] MUDADO — `CameraPin.save` cobre Câmera nova
                // independente de foto e linha legada (ver
                // js/objecttypes/camera.js).
                await window.CameraPin.save(view3d._map, foto.id, { historico: foto.historico });
              });
              host.dataset.built = '1';
            }
            host.classList.toggle('hidden');
          };
        }
      }

      // Miniatura + trocar foto — MESMO padrão de mapview.js
      // `atualizarThumbOuBotaoAnexar`/`#fotopin-anexar-file` (painel 2D):
      // mostra a miniatura se já há imagem, senão o botão "📎 Anexar foto";
      // escolher um arquivo novo reprocessa (mesmas 2 resoluções) e
      // substitui `dataUrl`/`thumbDataUrl` do registro, sem mexer em mais
      // nada (posição/rotação/nome/câmera/script continuam intactos).
      const v3dAtualizarThumb = (photo) => {
        const img = el.querySelector('#v3d-foto-thumb');
        const btn = el.querySelector('#v3d-foto-anexar');
        const temFoto = !!(photo && photo.dataUrl);
        if (img) { img.classList.toggle('hidden', !temFoto); if (temFoto) img.src = photo.thumbDataUrl || photo.dataUrl || ''; }
        if (btn) btn.classList.toggle('hidden', temFoto);
        try { foto.dataUrl = temFoto ? photo.dataUrl : null; foto.thumbDataUrl = temFoto ? (photo.thumbDataUrl || photo.dataUrl) : null; } catch (e) { /* ignora */ }   // mantém o registro em memória em sincronia (sobreposição da câmera)
        // "Ao carregar uma foto, a câmera deve assumir a resolução da
        // foto" — `v3dPropsApi` só existe depois que o fieldset de
        // propriedades é montado (1ª vez que "⚙️ Propriedades da câmera" é
        // aberto, ver `propsToggle.onclick` abaixo).
        if (temFoto && v3dPropsApi?.setResolutionFromPhoto) {
          const im = new Image();
          im.onload = () => {
            if (!el.isConnected) return; // cartão fechado enquanto a imagem carregava
            v3dPropsApi.setResolutionFromPhoto(im.naturalWidth, im.naturalHeight);
          };
          im.src = photo.dataUrl;
        }
      };
      let v3dPropsApi = null;
      // [22/09/2026] MUDADO — `CameraPin.get` acha a foto acessória certa
      // mesmo quando `foto.id` é uma Câmera nova independente (id real da
      // foto é outro, via `fotoId` — ver js/objecttypes/camera.js).
      window.CameraPin.get(view3d._map, foto.id).then((photo) => v3dAtualizarThumb(photo));
      // [20/09/2026] Anexar/trocar foto: arquivo do aparelho OU foto já tirada em Mapa → Fotos (com botão de retorno).
      const escolherOrigemFoto = async () => {
        const imgAtual = el.querySelector('#v3d-foto-thumb');
        const temFotoAgora = !!(imgAtual && !imgAtual.classList.contains('hidden'));
        const origem = await Utils.showChoiceModal({
          title: temFotoAgora ? 'Foto da câmera' : 'Anexar foto à câmera', message: temFotoAgora ? 'O que fazer com a foto desta câmera?' : 'De onde vem a foto?',
          choices: [
            { value: 'arquivo', label: '📁 Escolher um arquivo do aparelho' },
            { value: 'fotos', label: '📷 Usar uma foto já tirada (Mapa → Fotos)' },
            ...(temFotoAgora ? [{ value: 'desvincular', label: '🔗 Desvincular foto desta Câmera' }] : []),
            { value: 'cancelar', label: 'Cancelar', secondary: true },
          ],
        });
        if (!origem || origem === 'cancelar') return;
        if (origem === 'arquivo') { el.querySelector('#v3d-foto-anexar-file').click(); return; }
        if (origem === 'desvincular') {
          const ok = await Utils.showChoiceModal({
            title: 'Desvincular foto', message: 'A Câmera continua no mapa (posição, direção, altura, campo de visão e scripts), mas fica sem nenhuma foto. Se a imagem só existir nesta Câmera, ela será perdida.',
            choices: [{ value: 'sim', label: 'Desvincular' }, { value: 'nao', label: 'Cancelar', secondary: true }],
          });
          if (ok !== 'sim') return;
          try {
            // [22/09/2026] MUDADO — `CameraPin.detachPhoto` cobre os dois
            // casos: Câmera nova (some só o "acessório" foto) e foto legada
            // (zera dataUrl na própria linha, como sempre).
            const novo = await window.CameraPin.detachPhoto(view3d._map, foto.id);
            if (!novo) return;
            v3dAtualizarThumb(novo);
            if (el.isConnected) { await view3d._buildFotosNoMapa(); await view3d._afterMapMutated(); }
            Utils.toast('Foto desvinculada da câmera ✓', { type: 'ok' });
          } catch (err) { console.error('Falha ao desvincular a foto da câmera:', err); Utils.toast('Não foi possível desvincular a foto: ' + (err?.message || err), { type: 'danger', duration: 5000 }); }
          return;
        }
        const displayAntes = el.style.display;
        el.style.display = 'none';
        const volta = () => { if (el.isConnected) { el.style.display = displayAntes || ''; try { window.WindowManager?.focus(el); } catch (e) { /* ignora */ } } };
        AmbientePhotos.open(view3d._map, {
          returnToLabel: 'a câmera', onExit: volta,
          pickPhoto: async (idEscolhido) => {
            volta();
            try {
              const escolhida = await DB.getAmbientePhoto(idEscolhido);
              if (!escolhida) return;
              // [22/09/2026] MUDADO — `CameraPin.attachPhoto` decide sozinho
              // se cria a linha de foto agora (Câmera nova, SEM foto até
              // este momento) ou só troca o dataUrl (foto legada).
              const novo = await window.CameraPin.attachPhoto(view3d._map, foto.id, { dataUrl: escolhida.dataUrl, thumbDataUrl: escolhida.thumbDataUrl || escolhida.dataUrl });
              if (!novo) return;
              v3dAtualizarThumb(novo);
              // [22/09/2026] Bug relatado: "a foto selecionada não está sendo
              // anexada à câmera". Causa raiz: o retângulo 3D texturizado da
              // câmera é construído só uma vez, a partir de `this._map.fotos`
              // (achatado por `_buildFotosNoMapa`, ver comentário grande lá) —
              // salvar no banco não bastava, a cena 3D continuava mostrando a
              // textura antiga (ou nenhuma) até um rebuild manual qualquer.
              // Mesmo padrão já usado em `tool === 'orbfoto-novo'` acima na
              // classe: resincroniza `this._map.fotos` e reconstrói a cena.
              if (el.isConnected) { await view3d._buildFotosNoMapa(); await view3d._afterMapMutated(); }
              Utils.toast('Foto anexada ✓', { type: 'ok' });
            } catch (err) { console.error('Falha ao anexar foto de Mapa → Fotos:', err); Utils.toast('Não foi possível anexar esta foto: ' + (err?.message || err), { type: 'danger', duration: 5000 }); }
          },
        });
      };
      el.querySelector('#v3d-foto-anexar').onclick = escolherOrigemFoto;
      el.querySelector('#v3d-foto-thumb-wrap').addEventListener('click', (e) => {
        if (e.target.closest('#v3d-foto-anexar')) return; // já tem handler próprio
        escolherOrigemFoto();
      });
      el.querySelector('#v3d-foto-anexar-file').onchange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        Utils.toast('Processando foto…');
        try {
          const dataUrl = await Utils.resizeImage(file, 2400, 0.85);
          const thumbDataUrl = await Utils.resizeImage(file, 220, 0.75);
          // [22/09/2026] MUDADO — `CameraPin.attachPhoto` (ver acima).
          const photo = await window.CameraPin.attachPhoto(view3d._map, foto.id, { dataUrl, thumbDataUrl });
          if (!photo) return;
          v3dAtualizarThumb(photo);
          if (el.isConnected) { await view3d._buildFotosNoMapa(); await view3d._afterMapMutated(); }
          Utils.toast('Foto trocada ✓', { type: 'ok' });
        } catch (err) {
          console.error('Falha ao trocar a foto desta câmera:', err);
          Utils.toast('Não foi possível processar esta foto: ' + (err?.message || err), { type: 'danger', duration: 5000 });
        }
      };
      // Propriedades da câmera (Blender), aqui pro orb de FOTO —
      // persistido em `mapaCamProps` (ver mapview.js
      // _refreshFotosNoMapa/_openFotoPinPopover, mesmo campo). Os 2
      // caminhos ("clicar no objeto Câmera" e "Ver através desta
      // câmera"->Propriedades) editam o MESMO `foto.camProps`/
      // `mapaCamProps` e aplicam `updateCameraFrustumGeometry`/`setFov`/
      // `setClipPlanes` na hora quando este MESMO orb está sendo "visto
      // através" neste exato momento — mantém o retângulo amarelo do 2D e
      // a visão ao vivo sempre em sincronia.
      const propsToggle = el.querySelector('#v3d-foto-props-toggle');
      const propsHost = el.querySelector('#v3d-foto-props');
      propsToggle.onclick = () => {
        if (propsHost.classList.contains('hidden') && !propsHost.dataset.built) {
          propsHost.innerHTML = window.MapView?._camPropsFieldsetHtml?.('v3dfoto', foto.camProps || {}) || '';
          v3dPropsApi = window.MapView?._wireCamPropsFieldset?.(propsHost, 'v3dfoto', foto.camProps || {}, (props) => {
            foto.camProps = props;
            view3d._engine?.updateCameraFrustumGeometry?.(foto.id, props);
            if (view3d._fotoCamMode?.fotoId === foto.id) {
              const novoFovDeg = Math.max(1, Math.min(170, ((props.fov ?? Math.PI / 3) * 180) / Math.PI));
              const fovMudou = Math.abs(novoFovDeg - view3d._fotoCamMode.calibFov) > 0.001;
              view3d._fotoCamMode.calibFov = novoFovDeg;
              if (fovMudou) { view3d._fotoCamMode.zoomFov = novoFovDeg; view3d._engine?.setFov?.(novoFovDeg); }
              view3d._engine?.setClipPlanes?.(props.clipStartM ?? 0.1, props.clipEndM ?? 100);
              view3d._updateFotoCamOverlayZoomScale?.();
            }
            if (view3d._v3dFotoPropsSaveTimer) clearTimeout(view3d._v3dFotoPropsSaveTimer);
            view3d._v3dFotoPropsSaveTimer = setTimeout(() => {
              view3d._v3dFotoPropsSaveTimer = null;
              // [22/09/2026] MUDADO — `CameraPin.save` (cobre Câmera nova e
              // linha legada; FIELD_MAP interno já traduz `mapaCamProps`).
              window.CameraPin.save(view3d._map, foto.id, { mapaCamProps: props })
                .catch((err) => console.error('[view3d] falha ao salvar camProps (cartão Câmera):', err));
            }, 300);
          });
          // Se a foto já estava carregada ANTES de abrir as propriedades
          // pela 1ª vez, adota a resolução dela agora que o widget passou a
          // existir. Busca `dataUrl` de resolução PLENA de novo (não
          // `thumbDataUrl`, já reduzido a 220px pela miniatura).
          window.CameraPin.get(view3d._map, foto.id).then((photoFull) => {
            if (!photoFull?.dataUrl || !el.isConnected) return;
            const im2 = new Image();
            im2.onload = () => { if (el.isConnected) v3dPropsApi?.setResolutionFromPhoto(im2.naturalWidth, im2.naturalHeight); };
            im2.src = photoFull.dataUrl;
          });
          propsHost.dataset.built = '1';
        }
        propsHost.classList.toggle('hidden');
        propsToggle.classList.toggle('v3d-camprops-toggle-active', !propsHost.classList.contains('hidden'));
      };
      el.querySelector('#v3d-foto-vercamera').onclick = () => {
        el.remove();
        view3d._enterFotoCameraView(foto.id);
      };
      el.querySelector('#v3d-foto-abrir').onclick = async () => {
        // [22/09/2026] MUDADO — pra uma Câmera nova independente, o id real
        // da foto (linha `DB.mapPhotos`, pra abrir em "Mapa"->"Fotos") é
        // `cam.fotoId`, diferente de `foto.id` (id da Câmera) — busca o
        // objeto Câmera cru quando for o caso; linha legada continua igual.
        let realPhotoId = foto.id;
        if (window.CameraPin.isCameraId(view3d._map, foto.id)) {
          const cam = view3d._map.cameras.find((c) => c.id === foto.id);
          realPhotoId = cam?.fotoId || null;
        }
        if (!realPhotoId) { Utils.toast('Esta Câmera ainda não tem foto anexada.', { type: 'warn' }); return; }
        const photo = await DB.getAmbientePhoto(realPhotoId);
        if (!photo) { Utils.toast('Esta foto não foi encontrada (pode ter sido excluída).', { type: 'warn' }); return; }
        const owningMap = photo.ambienteId === view3d._map.id ? view3d._map : (await DB.getMap(photo.ambienteId)) || view3d._map;
        el.remove();
        // Sem onExit: fechar a tela de Fotos só revela o 3D de novo,
        // exatamente onde a pessoa estava.
        await AmbientePhotos.open(owningMap, { startPhotoId: photo.id });
      };
    };

    return { html, wire };
  },
});
