/**
 * exportdeps.js — Manipulador de DEPENDÊNCIAS entre categorias na hora de
 * exportar (Configurações → ⬇️ Exportar backup, ver settings.js
 * _openExportModal).
 *
 * Pedido do usuário (27/08/2026): antes disto, dava pra exportar só um
 * patrimônio (categoria Imagens desmarcada) mesmo que ele tivesse uma FOTO
 * vinculada (item.fotoAnexadaId, ver js/db.js) — o arquivo exportado ficava
 * com uma referência "solta": aponta pra uma foto que não vai junto. Este
 * módulo centraliza essas checagens (cresce aqui conforme mais dependências
 * entre categorias forem aparecendo — ex.: um mapa que referencia uma foto
 * colada nele) e pergunta, ANTES de gerar os arquivos, se a pessoa quer
 * mesmo seguir sem a(s) foto(s) referenciada(s) (mostrando qual é a foto).
 */
const ExportDeps = {
  /**
   * Confere a dependência "patrimônio → foto vinculada" quando a categoria
   * Imagens NÃO foi marcada para a exportação. `itensParaExportar` já deve
   * ser só os itens que VÃO de fato ser exportados (depois de qualquer
   * seleção específica feita na janela).
   * @returns {Promise<boolean>} true = pode continuar (usuário confirmou
   *   seguir sem a foto, ou não havia nenhuma dependência); false = a pessoa
   *   preferiu cancelar (provavelmente para marcar Imagens também).
   */
  async checkPatrimonioSemFoto({ itensParaExportar, imagensIncluida }) {
    if (imagensIncluida) return true;
    const comFoto = (itensParaExportar || []).filter((it) => it.fotoAnexadaId);
    if (!comFoto.length) return true;

    const fotos = (await Promise.all(comFoto.map((it) => window.DB.getAmbientePhoto(it.fotoAnexadaId)))).filter(Boolean);
    const singular = comFoto.length === 1;
    const pergunta = singular
      ? 'Deseja exportar apenas o patrimônio, sem a foto que tem uma referência a ele?'
      : `Deseja exportar os ${comFoto.length} patrimônios, sem as fotos que têm referência a eles?`;

    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-sheet" style="text-align:center">
          <div class="handle"></div>
          <h3 style="margin-top:0">📎 Patrimônio com foto vinculada</h3>
          <p style="font-size:13px; color:var(--text-dim)">${window.Utils.escapeHtml(pergunta)}</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin:10px 0">
            ${fotos.map((f) => `<img src="${f.thumbDataUrl || f.dataUrl}" alt="" style="width:72px; height:72px; object-fit:cover; border-radius:10px; background:var(--bg-elev-2)">`).join('')}
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px">
            <button type="button" class="btn block" id="expdep-sem-foto" title="Continua a exportação, sem incluir a(s) foto(s) vinculada(s)">Exportar só o patrimônio, sem a foto</button>
            <button type="button" class="btn secondary block" id="expdep-cancelar" title="Cancela para você marcar a categoria Imagens antes de exportar">Cancelar (marcar Imagens também)</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      let resolved = false;
      const finish = (v) => { if (resolved) return; resolved = true; modal.remove(); resolve(v); };
      modal.addEventListener('mousedown', (e) => { if (e.target === modal) finish(false); });
      modal.querySelector('#expdep-sem-foto').onclick = () => finish(true);
      modal.querySelector('#expdep-cancelar').onclick = () => finish(false);
    });
  },
};

window.ExportDeps = ExportDeps;
