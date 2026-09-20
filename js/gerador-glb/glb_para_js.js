#!/usr/bin/env node
/* js/gerador-glb/glb_para_js.js
 * [16/09/2026 UTC] NOVO — pedido verbatim: "Implemente o ObjMeshSource para
 * .glb como você mencionou." Gera o arquivo `assets/modelos/<tipo>.glb.js`
 * (texto JS válido, base64 do `.glb` bruto embrulhado numa chamada
 * `window.GlbMeshSource.register(...)`) a partir de um `.glb` já existente —
 * MESMA relação que `obj_para_malha_js.js` (neste mesmo diretório) tem com
 * o `.obj` puro. Ver comentário grande no topo de `js/glbmeshsource.js`
 * pra explicação completa de por que precisa desse embrulho (o mesmo
 * motivo de sempre: `<script src="x.js">` nunca sofre bloqueio de CORS em
 * `file:///`, `fetch()` de arquivo binário local sofre).
 *
 * USO:
 *   node assets/obj/gerador-glb/glb_para_js.js <caminho/do/modelo.glb> <nome-do-tipo>
 *
 * Exemplo (regenerar o wrapper dos 3 tipos que já têm .glb nesta rodada):
 *   node assets/obj/gerador-glb/glb_para_js.js assets/modelos/luminaria.glb luminaria
 *   node assets/obj/gerador-glb/glb_para_js.js assets/modelos/poste.glb poste
 *   node assets/obj/gerador-glb/glb_para_js.js assets/modelos/relogio.glb relogio
 *
 * Chamado automaticamente pelo `main()` deste arquivo pros 3 tipos acima
 * quando rodado SEM argumentos (`node glb_para_js.js`) — ver final do
 * arquivo.
 */
const fs = require('fs');
const path = require('path');

function gerarWrapper(glbPath, tipo) {
  const bytes = fs.readFileSync(glbPath);
  const base64 = bytes.toString('base64');
  const outDir = path.resolve(__dirname, '..', '..', 'assets', 'modelos');
  const outPath = path.join(outDir, `${tipo}.glb.js`);
  const conteudo = `/* assets/modelos/${tipo}.glb.js
 * GERADO por assets/obj/gerador-glb/glb_para_js.js a partir de
 * "${path.basename(glbPath)}" — [16/09/2026 UTC]. NÃO É CÓDIGO DE VERDADE:
 * é o \`.glb\` bruto (binário) convertido pra base64 e embrulhado numa
 * chamada JS válida (ver comentário grande no topo de
 * js/glbmeshsource.js pra explicação completa de por que isso é
 * necessário pra funcionar com 'file:///' e não ser executado como
 * lógica). Referencie de ${tipo}.model.js com \`malhaGlb: true\`.
 * Pra regenerar depois de reexportar o .glb: rode o mesmo comando de novo.
 */
window.GlbMeshSource.register(${JSON.stringify(tipo)}, ${JSON.stringify(base64)});
`;
  fs.writeFileSync(outPath, conteudo, 'utf8');
  console.log(`Gerado: ${path.relative(process.cwd(), outPath)} (${(conteudo.length / 1024).toFixed(1)} KB, .glb original ${(bytes.length / 1024).toFixed(1)} KB)`);
}

function main() {
  const [, , glbArg, tipoArg] = process.argv;
  if (glbArg && tipoArg) {
    const glbPath = path.resolve(glbArg);
    if (!fs.existsSync(glbPath)) { console.error(`Arquivo não encontrado: ${glbPath}`); process.exit(1); }
    gerarWrapper(glbPath, tipoArg);
    return;
  }
  // Sem argumentos — regenera os 3 tipos que já têm `.glb` nesta rodada
  // (conveniência; passar os argumentos continua funcionando pra qualquer
  // outro tipo/arquivo).
  const modelosDir = path.resolve(__dirname, '..', '..', 'assets', 'modelos');
  for (const tipo of ['luminaria', 'poste', 'relogio']) {
    const glbPath = path.join(modelosDir, `${tipo}.glb`);
    if (fs.existsSync(glbPath)) gerarWrapper(glbPath, tipo);
    else console.warn(`⚠️  ${tipo}.glb não encontrado em ${modelosDir} — pulado.`);
  }
}

main();
