#!/usr/bin/env node
'use strict';
/* ==========================================================================
   VanishCam — gerador de js/embed-root-template.js a partir de index.html.

   --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO (mais recente primeiro)
   --------------------------------------------------------------------------
   Rodada 33 (2026-09-09): arquivo CRIADO — pedido do usuário: tanto o
     vanishCam quanto o outro app hospedeiro rodam abertos direto como
     file:///, e fetch()/XMLHttpRequest para outro arquivo local FALHA nesse
     protocolo ("Failed to fetch") — foi o que quebrou vanishCamMount() (ele
     buscava index.html com fetch() para extrair #vanishcamRoot). Carregar um
     arquivo .js por uma tag <script src> (ao contrário de fetch/XHR) FUNCIONA
     em file://, então a solução é: o markup de #vanishcamRoot passa a viver
     também dentro de um arquivo .js (embed-root-template.js, ao lado deste
     mesmo arquivo, gerado por este script), carregado por uma <script>
     comum — sem fetch nenhum. Este script Node.js é o que MANTÉM esse
     arquivo sincronizado com index.html (que continua sendo a fonte da
     verdade "visual" — este script só copia o que já está lá dentro de
     #vanishcamRoot para uma forma que funcione em file://); rode-o
     (node js/build-embed-template.js, a partir da raiz do projeto) sempre
     que o markup dentro de #vanishcamRoot em index.html mudar. Ver
     embed-api.js (ensureLoaded()) para quem consome o arquivo gerado.
   Rodada 33, ajuste (2026-09-09): pedido do usuário — movido da raiz do
     projeto para dentro de js/ (junto com os demais arquivos .js), para
     manter a pasta organizada — só arquivos de app na raiz (index.html,
     README-embed.md), tudo o que é código em js/.
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const JS_DIR = __dirname;
const INDEX_HTML = path.join(JS_DIR, '..', 'index.html');
const OUT_FILE = path.join(JS_DIR, 'embed-root-template.js');

const html = fs.readFileSync(INDEX_HTML, 'utf8');

const OPEN_TAG = '<div id="vanishcamRoot">';
const CLOSE_MARKER = '</div><!-- /#vanishcamRoot -->';

const openIdx = html.indexOf(OPEN_TAG);
if(openIdx === -1){
  console.error('build-embed-template: não encontrei ' + JSON.stringify(OPEN_TAG) + ' em index.html.');
  process.exit(1);
}
const closeIdx = html.indexOf(CLOSE_MARKER, openIdx);
if(closeIdx === -1){
  console.error('build-embed-template: não encontrei ' + JSON.stringify(CLOSE_MARKER) + ' em index.html (depois de #vanishcamRoot).');
  process.exit(1);
}

// Inclui a própria tag de abertura e a </div> de fechamento (mas não o comentário
// "<!-- /#vanishcamRoot -->" depois dela) — o resultado é markup completo e autocontido:
// "<div id="vanishcamRoot">...tudo...</div>".
const markup = html.slice(openIdx, closeIdx + '</div>'.length);

const out = "'use strict';\n"
  + "/* ==========================================================================\n"
  + "   VanishCam — ARQUIVO GERADO AUTOMATICAMENTE a partir de index.html.\n"
  + "   Não editar à mão — rode `node js/build-embed-template.js` (na raiz do\n"
  + "   projeto) depois de qualquer mudança dentro de #vanishcamRoot em index.html.\n"
  + "   Ver js/build-embed-template.js (motivo) e js/embed-api.js (ensureLoaded()).\n"
  + "   ========================================================================== */\n"
  + "window.__VANISHCAM_ROOT_HTML__ = " + JSON.stringify(markup) + ";\n";

fs.writeFileSync(OUT_FILE, out, 'utf8');
console.log('build-embed-template: js/embed-root-template.js atualizado (' + markup.length + ' caracteres de markup).');
