/* js/cards/camera-card.js
 * Card mostrado ao mirar/selecionar um objeto "Câmera" do mapa no "Ver em
 * 3D". Extraído de `View3D._showCameraCard3D` (js/view3d.js) — ver
 * comentário grande no topo de `js/cardsystem.js` pro porquê da extração.
 *
 * `data` é a câmera (`this._map.cameras[i]`, mesma referência usada em
 * mapping.js/mapview.js). Usa o `ctx` completo (`view3d`/`DB`/`Utils`/
 * `map`) porque precisa de bastante integração com estado do View3D
 * (`_afterMapMutated`, `_orbCamMode`, `_engine`, `_enterCameraOrbView`,
 * `_wireHistoricoCard`) — documentado honestamente: esse acoplamento NÃO
 * foi removido na extração (seria reescrever a feature, não só mudar onde
 * ela mora), o card só passou a acessar tudo isso via `ctx.view3d` em vez
 * de `this` direto.
 *
 * Se a câmera tiver uma foto associada, o botão "🖼️ Abrir foto associada"
 * abre a tela de Fotos (a foto pode ser de OUTRO ambiente, escolhida pela
 * galeria geral — por isso busca o ambiente dono dela antes de abrir).
 */
window.CardSystem.register('camera', {
  bodyHtml(cam) {
    return `
      <div style="text-align:center; font-weight:700; margin-bottom:8px">📷 Câmera</div>
      <div class="detail-grid">
        <div class="k">Direção</div><div class="v">${Math.round((cam.angulo || 0) * 180 / Math.PI)}°</div>
        <div class="k">Campo de visão</div><div class="v">${Math.round((cam.fov || Math.PI / 3) * 180 / Math.PI)}°</div>
      </div>
      <button class="btn block sm" id="v3d-cam-vertravado" title="Travar a câmera do personagem na pose calibrada desta câmera, com a foto associada (se houver) sobreposta como guia — como 'ver através da câmera' no Blender. Continua dando pra selecionar/posicionar objetos normalmente; só o olhar em volta fica travado.">👁️ Ver através desta câmera (Camera Match)</button>
      <button class="btn block sm" id="v3d-cam-foto" ${cam.fotoId ? '' : 'disabled'} title="${cam.fotoId ? 'Abrir a foto associada a esta câmera' : 'Esta câmera não tem foto associada'}">🖼️ ${cam.fotoId ? 'Abrir foto associada' : 'Sem foto associada'}</button>
      <button type="button" class="btn secondary block sm" id="v3d-cam-props-toggle" style="margin-top:6px">⚙️ Propriedades da câmera</button>
      <div id="v3d-cam-props" class="hidden"></div>
      <!-- Câmera estilo PS1: os 2 botões abaixo só fazem sentido pro modelo
           PS1 (a varredura/lente giratória não existe no modelo padrão
           caixa+cone) — por isso ficam ESCONDIDOS quando o modelo NÃO é
           PS1, reaparecendo assim que o botão de troca de modelo é
           clicado (sem precisar fechar/reabrir o cartão). Ver
           Engine3D._updateCamerasLive/assets/modelos/_exemplo-script-
           camera-vigilancia.txt. -->
      <button type="button" class="btn secondary block sm" id="v3d-cam-modelo-toggle" style="margin-top:6px" title="Alterna a APARÊNCIA 3D desta câmera entre o modelo padrão (caixa+cone) e o modelo estilo câmera de vigilância de videogame (base+cúpula+lente giratória com LED). Não muda nenhum outro comportamento da câmera.">🎥 Modelo: ${cam.modeloVisual === 'ps1' ? 'PS1 (vigilância)' : 'Padrão'} — trocar</button>
      <button type="button" class="btn secondary block sm ${cam.modeloVisual === 'ps1' ? '' : 'hidden'}" id="v3d-cam-varredura-toggle" style="margin-top:6px" title="Liga/desliga o movimento automático de 'vai e volta' da cabeça/lente (precisa de um componente Script na câmera usando assets/modelos/_exemplo-script-camera-vigilancia.txt para o movimento em si — este botão só liga/desliga o campo que esse script consulta).">🔄 Varredura automática: ${cam.varreduraAtiva === false ? 'DESLIGADA' : 'ligada'} — alternar</button>
      <button type="button" class="btn secondary block sm" id="v3d-cam-hist-toggle" style="margin-top:6px">📜 Histórico deste objeto${window.ObjectStandard?.indicadorHtml(cam) || ''}</button>
      <div id="v3d-cam-hist" class="hidden"></div>
      <button class="btn secondary block sm" id="v3d-fc-close" style="margin-top:6px" title="Fechar este cartão e voltar a andar">Fechar</button>
    `;
  },
  wire(el, cam, ctx) {
    const view3d = ctx.view3d;
    const DB = ctx.DB;
    const Mapping = window.Mapping;
    const AmbientePhotos = window.AmbientePhotos;
    el.querySelector('#v3d-fc-close').onclick = () => el.remove();
    view3d._wireHistoricoCard(el, 'v3d-cam-hist', cam);

    // Reaproveita o MESMO fieldset/wiring do painel 2D
    // (window.MapView._camPropsFieldsetHtml/_wireCamPropsFieldset), pra
    // nunca divergir do que o 2D lê/escreve nos MESMOS campos do objeto.
    const propsToggle = el.querySelector('#v3d-cam-props-toggle');
    const propsHost = el.querySelector('#v3d-cam-props');
    propsToggle.onclick = () => {
      if (propsHost.classList.contains('hidden') && !propsHost.dataset.built) {
        propsHost.innerHTML = window.MapView?._camPropsFieldsetHtml?.('v3dcam', cam) || '';
        window.MapView?._wireCamPropsFieldset?.(propsHost, 'v3dcam', cam, async (props) => {
          Mapping.updateCamera(view3d._map, cam.id, props);
          Object.assign(cam, props);
          await view3d._afterMapMutated();
          // Câmera calibrada mudou enquanto o próprio orb dela está sendo
          // "vista através" agora — atualiza FOV renderizado na hora.
          if (view3d._orbCamMode?.camId === cam.id) {
            view3d._engine?.setFov?.(view3d._camOrbFovDeg(cam));
            view3d._engine?.setClipPlanes?.();
          }
        });
        propsHost.dataset.built = '1';
      }
      propsHost.classList.toggle('hidden');
      propsToggle.classList.toggle('v3d-camprops-toggle-active', !propsHost.classList.contains('hidden'));
    };
    // "trocar de câmera ao vivo" — troca a APARÊNCIA/modelo 3D (ver
    // comentário grande em engine3d.js `setScene`, bloco "câmeras").
    el.querySelector('#v3d-cam-modelo-toggle').onclick = async () => {
      const novoModelo = cam.modeloVisual === 'ps1' ? undefined : 'ps1';
      Mapping.updateCamera(view3d._map, cam.id, { modeloVisual: novoModelo });
      cam.modeloVisual = novoModelo;
      await view3d._afterMapMutated();
      view3d._rebuildScene();
      el.remove();
      view3d._showCameraCard3D(cam); // reabre o cartão já refletindo o modelo novo (botões atualizados)
    };
    // "ligar/desligar aquele movimento de 'um lado para o outro'".
    // `entity.varreduraAtiva` é o campo que
    // `_exemplo-script-camera-vigilancia.txt` consulta no início do
    // `Update()` antes de mover a lente — este botão só alterna o campo,
    // quem de fato PARA o movimento é o próprio script.
    el.querySelector('#v3d-cam-varredura-toggle')?.addEventListener('click', async () => {
      const ligar = cam.varreduraAtiva === false; // estava desligada -> liga (e vice-versa)
      Mapping.updateCamera(view3d._map, cam.id, { varreduraAtiva: ligar });
      cam.varreduraAtiva = ligar;
      await view3d._afterMapMutated();
      el.remove();
      view3d._showCameraCard3D(cam);
    });
    el.querySelector('#v3d-cam-vertravado').onclick = () => {
      el.remove();
      view3d._enterCameraOrbView(cam.id);
    };
    el.querySelector('#v3d-cam-foto').onclick = async () => {
      if (!cam.fotoId) return;
      const photo = await DB.getAmbientePhoto(cam.fotoId);
      if (!photo) { ctx.Utils.toast('A foto associada a esta câmera não foi encontrada (pode ter sido excluída).', { type: 'warn' }); return; }
      const owningMap = photo.ambienteId === view3d._map.id ? view3d._map : (await DB.getMap(photo.ambienteId)) || view3d._map;
      el.remove();
      // Sem onExit: fechar a tela de Fotos só remove a sobreposição dela e
      // volta a mostrar o 3D por trás, exatamente onde a pessoa estava.
      await AmbientePhotos.open(owningMap, { startPhotoId: photo.id });
    };
  },
});
