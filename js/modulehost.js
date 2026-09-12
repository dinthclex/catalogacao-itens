'use strict';

// NOVO (07/09/2026), pedido verbatim do usuário: "inquebrável, tudo com
// estrutura try{}catch(){} para evitar o app quebrar. Apresentando uma
// mensagem como 'não consegui carregar aquele módulo' (caso dê problema). E
// um botão com exatamente o que apareceu no console (como copiar o que
// apareceu no console (F12 no navegador) e colar na janela desse botão de
// detalhes do erro. A descrição do erro)."
//
// Este arquivo é o PRIMEIRO passo da modularização pedida junto ("modularizar
// tudo, para fazer divisões de tela como no blender reaproveitando os
// códigos como instâncias de partes do app [...] Faça a modularização do app
// de tal jeito que cada parte do app possa ser como um app a parte"). Dado o
// tamanho do código existente (mapview.js + view3d.js + engine3d.js +
// organizeview.js somados passam de 1.5MB) e a impossibilidade de testar em
// navegador de verdade neste ambiente, a modularização plena está sendo
// feita EM ETAPAS, começando pela infraestrutura de "módulo inquebrável"
// (este arquivo) e por um caso concreto de uso dela: a Miniatura 3D do mapa
// 2D (ver mapview.js _mountMinimap3D/_rebuildMinimapScene/_updateMinimap3D),
// que é hoje a única parte do app que já tenta montar uma 2ª instância do
// motor 3D (Engine3D) num container diferente da tela "Ver em 3D" — ou seja,
// já é, na prática, o primeiro "módulo" candidato a virar peça independente
// reaproveitável (ex.: várias câmeras, cada uma com seu próprio viewport 3D).
//
// `ModuleHost` é deliberadamente um arquivo SEM dependência de nenhum outro
// (nem Utils, nem CSS de style.css) — carregado logo depois de db.js/
// utils.js no index.html, mas escrito pra funcionar mesmo se o resto do CSS
// do app não tiver carregado ainda (por isso os estilos do modal de erro são
// 100% inline/injetados aqui, em vez de reaproveitar `.modal-backdrop`/
// `.modal-sheet` de style.css) — a ideia é que ele seja a ÚLTIMA linha de
// defesa quando algo dá errado, então não pode depender de mais nada que
// também possa falhar.
const ModuleHost = {
  _styleInjected: false,
  _lastErrors: [], // histórico curto (debug/telemetria manual futura) — ver showLoadError

  _injectStyle() {
    if (this._styleInjected) return;
    this._styleInjected = true;
    const style = document.createElement('style');
    style.id = 'modulehost-style';
    // Comentário sobre o hazard de backtick dentro de comentário HTML dentro
    // de template literal (ver convenção do projeto): aqui não há NENHUM
    // comentário HTML <!-- --> dentro do template abaixo, então não se
    // aplica, mas fica registrado por que este bloco de CSS é puro texto sem
    // aspas simples/duplas conflitantes.
    style.textContent = `
      .modulehost-backdrop {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,.6);
        display: flex; align-items: center; justify-content: center;
        padding: 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      .modulehost-sheet {
        background: #1b1f26; color: #eef1f5; border: 1px solid #3a4150;
        border-radius: 14px; padding: 18px; max-width: min(560px, 92vw);
        max-height: 86vh; overflow: auto; box-shadow: 0 12px 40px rgba(0,0,0,.5);
      }
      .modulehost-sheet h3 { margin: 0 0 8px; font-size: 16px; }
      .modulehost-sheet p { margin: 0 0 14px; font-size: 13.5px; line-height: 1.5; color: #c7ccd4; }
      .modulehost-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .modulehost-btn {
        appearance: none; border: 1px solid #4a5262; background: #2a3040; color: #eef1f5;
        border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer;
      }
      .modulehost-btn:hover { background: #333a4c; }
      .modulehost-btn.primary { background: #3b6fd6; border-color: #3b6fd6; }
      .modulehost-btn.primary:hover { background: #4a7de0; }
      .modulehost-details { margin-top: 12px; display: none; }
      .modulehost-details.open { display: block; }
      .modulehost-details textarea {
        width: 100%; min-height: 160px; box-sizing: border-box; resize: vertical;
        background: #0f1216; color: #d7dbe2; border: 1px solid #3a4150; border-radius: 8px;
        padding: 8px; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .modulehost-copyok { color: #6fd67f; font-size: 12px; margin-left: 8px; }
    `;
    document.head.appendChild(style);
  },

  /** Formata um erro (Error de verdade, ou qualquer outra coisa lançada) num
   *  texto único, completo, pronto pra ser colado — igual ao que apareceria
   *  no console do navegador (F12), incluindo stack trace quando existir.
   *  `contexto` é um rótulo curto de ONDE aconteceu (ex.: "Miniatura 3D —
   *  _rebuildMinimapScene"), pra quem for ler o texto colado já saber o que
   *  procurar no código sem precisar que o usuário descreva verbalmente. */
  formatError(contexto, err) {
    const linhas = [];
    linhas.push(`[${new Date().toISOString()}] ${contexto || '(sem contexto)'}`);
    if (err instanceof Error) {
      linhas.push(`${err.name}: ${err.message}`);
      if (err.stack) linhas.push(err.stack);
    } else {
      linhas.push(String(err));
      try { linhas.push(JSON.stringify(err)); } catch (_e) { /* não serializável — ok, já tem o String() acima */ }
    }
    if (typeof navigator !== 'undefined') linhas.push(`User-Agent: ${navigator.userAgent}`);
    return linhas.join('\n');
  },

  /** Mostra o modal "Não consegui carregar [label]" com um botão "Detalhes
   *  do erro" que revela uma caixa de texto (já selecionável e com botão
   *  "Copiar") contendo exatamente o texto que iria pro console — pedido
   *  verbatim do usuário (ver comentário grande no topo do arquivo). Sempre
   *  também faz `console.error(...)` (nunca esconde o erro do console de
   *  verdade, só ACRESCENTA um jeito de ver sem abrir o F12). Retorna sem
   *  lançar nada — chamar isto nunca pode, por si só, quebrar o app (é
   *  literalmente a rede de segurança final).
   *  `opts.onClose` (opcional): chamado ao fechar o modal (clique fora, X,
   *  ou botão "Ok"). */
  showLoadError(label, err, opts = {}) {
    try {
      console.error(`ModuleHost: falha em "${label}"`, err);
      this._lastErrors.push({ label, at: Date.now(), texto: this.formatError(label, err) });
      if (this._lastErrors.length > 20) this._lastErrors.shift();
      this._injectStyle();
      const texto = this.formatError(label, err);
      const backdrop = document.createElement('div');
      backdrop.className = 'modulehost-backdrop';
      const safeLabel = String(label || 'módulo').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      backdrop.innerHTML = `
        <div class="modulehost-sheet" role="alertdialog" aria-modal="true">
          <h3>⚠️ Não consegui carregar ${safeLabel}</h3>
          <p>Essa parte do app encontrou um erro e foi interrompida antes de travar o resto do aplicativo. Você pode continuar usando o resto do app normalmente. Se quiser reportar o problema, clique em "Detalhes do erro" e depois em "Copiar".</p>
          <div class="modulehost-actions">
            <button type="button" class="modulehost-btn" id="modulehost-toggle-details">Detalhes do erro</button>
            <button type="button" class="modulehost-btn primary" id="modulehost-ok">Ok</button>
          </div>
          <div class="modulehost-details" id="modulehost-details">
            <textarea readonly id="modulehost-textarea"></textarea>
            <div style="margin-top:8px">
              <button type="button" class="modulehost-btn" id="modulehost-copy">Copiar</button>
              <span class="modulehost-copyok" id="modulehost-copyok" style="display:none">Copiado ✓</span>
            </div>
          </div>
        </div>
      `;
      const ta = backdrop.querySelector('#modulehost-textarea');
      ta.value = texto;
      const close = () => { backdrop.remove(); try { opts.onClose?.(); } catch (_e) { /* onClose não pode derrubar o fechamento do modal */ } };
      backdrop.querySelector('#modulehost-ok').onclick = close;
      backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector('#modulehost-toggle-details').onclick = () => {
        backdrop.querySelector('#modulehost-details').classList.toggle('open');
      };
      backdrop.querySelector('#modulehost-copy').onclick = async () => {
        const okEl = backdrop.querySelector('#modulehost-copyok');
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(texto);
          } else {
            // Sem Clipboard API (contexto não-seguro/http, navegador antigo) —
            // mesmo truque clássico de fallback: seleciona o texto do próprio
            // textarea e usa o comando de cópia legado do navegador.
            ta.focus(); ta.select();
            document.execCommand('copy');
          }
          okEl.style.display = '';
          setTimeout(() => { okEl.style.display = 'none'; }, 2000);
        } catch (_e) {
          // Cópia falhou (raro) — não é o fim do mundo, o texto já está
          // visível e selecionável manualmente na textarea.
          ta.focus(); ta.select();
        }
      };
      document.body.appendChild(backdrop);
    } catch (metaErr) {
      // Se ATÉ o próprio código de mostrar o erro falhar (ex.: DOM
      // indisponível), cai pro console puro — nunca deixa lançar de volta
      // pra quem chamou (isto quebraria a garantia de "inquebrável").
      console.error('ModuleHost: falha ao exibir modal de erro (meta-falha)', metaErr, 'erro original:', err);
    }
  },

  /** Envolve uma função (sync OU async) num try/catch — se ela lançar (ou a
   *  Promise retornada rejeitar), mostra `showLoadError(label, erro)` e
   *  retorna `undefined` em vez de propagar a exceção. Uso típico:
   *    await ModuleHost.safeRun('Miniatura 3D', () => this._mountMinimap3D());
   *  Preferir isto a espalhar try/catch manual em toda função — um só ponto
   *  central de "o que fazer quando um módulo quebra", reaproveitável em
   *  qualquer parte do app (mapview.js, view3d.js, organizeview.js, etc.). */
  async safeRun(label, fn, opts = {}) {
    try {
      return await fn();
    } catch (err) {
      this.showLoadError(label, err, opts);
      return undefined;
    }
  },

  /** Versão síncrona de safeRun, pra código que não pode/precisa ser async
   *  (ex.: dentro de um loop de render chamado a cada quadro, onde `await`
   *  quebraria o ritmo de requestAnimationFrame). `fn` deve ser síncrona —
   *  se ela mesma disparar uma Promise internamente e essa Promise rejeitar
   *  sem ser aguardada, isto NÃO pega (use safeRun/async pra esses casos). */
  safeRunSync(label, fn, opts = {}) {
    try {
      return fn();
    } catch (err) {
      this.showLoadError(label, err, opts);
      return undefined;
    }
  },
};

if (typeof window !== 'undefined') window.ModuleHost = ModuleHost;
