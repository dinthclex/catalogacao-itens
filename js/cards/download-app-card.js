/* js/cards/download-app-card.js
 * Cards extraídos de `js/mapview.js` (`MapView._openDownloadAppModal` e
 * `MapView._openMobileNoServerModal`) — pedido verbatim: "As inserções de
 * innerHTML devem se tornar Cards". Conteúdo 100% estático, sem parâmetros.
 * Registrados em `window.ModalCards` (ver `js/cards/changelog-card.js` pra
 * doc completa do contrato — mesmo host de modais de app inteiro).
 *
 * USO (em mapview.js): `window.ModalCards.open('download-app')` /
 * `window.ModalCards.open('mobile-noserver')`.
 */
window.ModalCards.register('download-app', () => `
      <div class="modal-sheet" style="text-align:center">
        <div class="handle"></div>
        <h3 style="margin-top:0">⬇️ Baixar o app</h3>
        <p style="font-size:13.5px; color:var(--text-dim); line-height:1.6">
          O código do app fica disponível no GitHub, neste link:
        </p>
        <p style="font-size:13.5px; line-height:1.6; word-break:break-all">
          <a href="https://github.com/dinthclex/catalogacao-itens" target="_blank" rel="noopener noreferrer">https://github.com/dinthclex/catalogacao-itens</a>
        </p>
        <p style="font-size:13.5px; color:var(--text-dim); line-height:1.6">
          Depois de baixar, procure pelo arquivo <b>index.html</b> e dê duplo clique nele para abrir o app.
        </p>
        <!-- Pedido do usuário (03/09/2026): "coloque a informação de que por
             conta de no celular dar duplo clique no index.html não funciona,
             pois é necessário ter um servidor local. Também, um botão com
             métodos para que, no celular, funcione o index.html sem precisar
             de servidor local." O aviso abaixo é sincero sobre o PORQUÊ (os
             navegadores de celular bloqueiam recursos carregados de
             file:///, então o app simplesmente não roda por duplo clique lá)
             — e o botão abre _openMobileNoServerModal (logo abaixo), que
             lista os métodos com MENOS fricção pra contornar isso (nenhum é
             "zero servidor" de verdade — algum programinha precisa SERVIR os
             arquivos por http:// — mas os listados lá cabem num único toque/
             comando, bem mais simples que o passo a passo completo do XAMPP/
             PHP já documentado em server/LEIA-ME-servidor.txt). -->
        <p style="font-size:13.5px; color:#ffb236; line-height:1.6; background:rgba(255,178,54,.12); border:1px solid rgba(255,178,54,.35); border-radius:8px; padding:8px 10px; text-align:left">
          ⚠️ <b>No celular, dar duplo clique no index.html NÃO funciona</b> —
          os navegadores de celular bloqueiam o carregamento de arquivos
          abertos direto do armazenamento (sem servidor nenhum por trás), por
          isso a tela fica em branco ou quebrada. É necessário ter algum tipo
          de servidor local rodando (mesmo que bem simples) pra abrir pelo
          navegador do celular.
        </p>
        <button class="btn secondary block" id="download-app-mobile" style="margin-top:8px">📱 Rodar no celular (sem precisar de servidor "de verdade")</button>
        <button class="btn secondary block" id="download-app-fechar" style="margin-top:10px">Fechar</button>
      </div>`);

window.ModalCards.register('mobile-noserver', () => `
      <div class="modal-sheet" style="text-align:left">
        <div class="handle"></div>
        <h3 style="margin-top:0; text-align:center">📱 App no celular sem montar um servidor "de verdade"</h3>
        <p style="font-size:13px; color:var(--text-dim); line-height:1.6">
          Nenhum navegador de celular abre este app direto de um arquivo
          (duplo clique/toque no index.html) — precisa de ALGUM programinha
          "servindo" os arquivos por http://, mesmo que bem simples. As
          opções abaixo, da mais fácil pra mais avançada, pedem só um toque
          ou um comando — nada perto da configuração completa de XAMPP/PHP
          (essa continua no arquivo <b>server/LEIA-ME-servidor.txt</b>, útil
          se você já quer o "modo servidor" com sincronização entre
          aparelhos).
        </p>
        <p style="font-size:13px; line-height:1.7">
          <b>1) App de servidor local (mais fácil, sem digitar nada):</b><br>
          Instale um app de "servidor web local"/"servidor HTTP" da loja do
          seu celular (ex.: buscando por "Servidor Web Local" ou "HTTP
          Server" na Play Store/App Store), aponte-o pra pasta onde
          descompactou este app, toque em "Iniciar" e abra o endereço que
          ele mostrar (algo como http://localhost:8080) no navegador do
          celular.
        </p>
        <p style="font-size:13px; line-height:1.7">
          <b>2) Termux (Android, um comando só):</b><br>
          Instale o Termux (F-Droid ou Play Store), rode
          <code style="background:rgba(255,255,255,.08); padding:1px 5px; border-radius:4px">pkg install python -y</code>,
          entre na pasta do app (<code style="background:rgba(255,255,255,.08); padding:1px 5px; border-radius:4px">cd</code> até lá) e rode
          <code style="background:rgba(255,255,255,.08); padding:1px 5px; border-radius:4px">python -m http.server 8080</code>.
          Depois abra <code style="background:rgba(255,255,255,.08); padding:1px 5px; border-radius:4px">http://localhost:8080</code>
          no navegador do celular.
        </p>
        <p style="font-size:13px; line-height:1.7">
          <b>3) Modo Servidor do próprio app (recomendado se for usar por um
          tempo):</b><br>
          O mesmo "modo servidor" via Termux+PHP já documentado em
          <b>server/LEIA-ME-servidor.txt</b> (cenário 2, "servidor e câmera
          no mesmo celular") também resolve isso — e de quebra já vem com
          salvamento automático e sincronização entre aparelhos.
        </p>
        <p style="font-size:12px; color:var(--text-dim); line-height:1.6">
          Em qualquer uma das opções, os arquivos continuam só no seu
          celular — nada é enviado pra fora (o "servidor" aqui só serve os
          arquivos localmente, pro próprio navegador do aparelho).
        </p>
        <button class="btn secondary block" id="mobile-noserver-fechar" style="margin-top:6px">Fechar</button>
      </div>`);
