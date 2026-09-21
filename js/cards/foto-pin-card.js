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
      <div style="text-align:center; font-weight:700; margin-bottom:8px">📷 Câmera</div>
      <div class="map-fotopin-thumb-wrap" id="v3d-foto-thumb-wrap" title="Toque para trocar a foto">
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
      {
        const toggle = el.querySelector('#v3d-foto-hist-toggle');
        const host = el.querySelector('#v3d-foto-hist');
        if (toggle && host && window.ObjectStandard) {
          toggle.onclick = () => {
            if (host.classList.contains('hidden') && !host.dataset.built) {
              host.innerHTML = window.ObjectStandard.historicoHtml(foto, 'v3d-foto-hist');
              window.ObjectStandard.wireHistoricoUi(host, foto, 'v3d-foto-hist', async () => {
                const photoFull = await DB.getAmbientePhoto(foto.id);
                if (photoFull) await DB.saveAmbientePhoto({ ...photoFull, historico: foto.historico });
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
      DB.getAmbientePhoto(foto.id).then((photo) => v3dAtualizarThumb(photo));
      // [20/09/2026] Anexar/trocar foto: arquivo do aparelho OU foto já tirada em Mapa → Fotos (com botão de retorno).
      const escolherOrigemFoto = async () => {
        const origem = await Utils.showChoiceModal({
          title: 'Anexar foto à câmera', message: 'De onde vem a foto?',
          choices: [
            { value: 'arquivo', label: '📁 Escolher um arquivo do aparelho' },
            { value: 'fotos', label: '📷 Usar uma foto já tirada (Mapa → Fotos)' },
            { value: 'cancelar', label: 'Cancelar', secondary: true },
          ],
        });
        if (!origem || origem === 'cancelar') return;
        if (origem === 'arquivo') { el.querySelector('#v3d-foto-anexar-file').click(); return; }
        const displayAntes = el.style.display;
        el.style.display = 'none';
        const volta = () => { if (el.isConnected) { el.style.display = displayAntes || ''; try { window.WindowManager?.focus(el); } catch (e) { /* ignora */ } } };
        AmbientePhotos.open(view3d._map, {
          returnToLabel: 'a câmera', onExit: volta,
          pickPhoto: async (idEscolhido) => {
            volta();
            try {
              const escolhida = await DB.getAmbientePhoto(idEscolhido);
              const atual = await DB.getAmbientePhoto(foto.id);
              if (!escolhida || !atual) return;
              const novo = { ...atual, dataUrl: escolhida.dataUrl, thumbDataUrl: escolhida.thumbDataUrl || escolhida.dataUrl };
              await DB.saveAmbientePhoto(novo);
              v3dAtualizarThumb(novo);
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
          const photo = await DB.getAmbientePhoto(foto.id);
          if (!photo) return;
          await DB.saveAmbientePhoto({ ...photo, dataUrl, thumbDataUrl });
          v3dAtualizarThumb({ ...photo, dataUrl, thumbDataUrl });
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
              DB.getAmbientePhoto(foto.id).then((photoFull) => {
                if (photoFull) return DB.saveAmbientePhoto({ ...photoFull, mapaCamProps: props });
              }).catch((err) => console.error('[view3d] falha ao salvar camProps (cartão Câmera):', err));
            }, 300);
          });
          // Se a foto já estava carregada ANTES de abrir as propriedades
          // pela 1ª vez, adota a resolução dela agora que o widget passou a
          // existir. Busca `dataUrl` de resolução PLENA de novo (não
          // `thumbDataUrl`, já reduzido a 220px pela miniatura).
          DB.getAmbientePhoto(foto.id).then((photoFull) => {
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
        const photo = await DB.getAmbientePhoto(foto.id);
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
