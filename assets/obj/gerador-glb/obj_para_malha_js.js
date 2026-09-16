#!/usr/bin/env node
/* assets/obj/gerador-glb/obj_para_malha_js.js
 * [15/09/2026 UTC] NOVO — pedido verbatim: "Há algum jeito de apenas
 * renomear o '.obj' para '.js', fazendo algum parser interno lê-lo de modo
 * diferente para não considerá-lo como javaScript, mesmo sendo '.js'?"
 *
 * Um "renomear" puro NÃO funciona (ver explicação completa no comentário
 * grande do topo de js/objmeshsource.js) — o navegador sempre tenta
 * interpretar QUALQUER `<script src="x.js">` como JavaScript de verdade,
 * não importa a extensão original. A saída viável é EMBRULHAR o texto do
 * `.obj` dentro de uma chamada JS válida
 * (`window.ObjMeshSource.register(...)`) — este script FAZ esse embrulho
 * automaticamente, pra ninguém precisar escrever/escapar isso à mão.
 *
 * [15/09/2026 UTC] ALTERADO — pedido verbatim: "Sobre os materiais, use
 * <nome>.mtl para preserválos. [...] os que precisarem ter materiais coloque
 * no arquivo .mtl. Atualize os arquivos .obj respectivos que usam materiais
 * (por exemplo, adicionando 'mtllib <nome>.mtl'). Assim, verdadeiramente não
 * haverá perdas, nem limitações." Agora, além do `.obj`, este script também
 * lê (quando existir) o `.mtl` referenciado por uma linha `mtllib <arquivo>`
 * dentro do próprio `.obj` — resolvido relativo à PASTA do `.obj` (convenção
 * Wavefront padrão: o `.mtl` mora do lado do `.obj` que o referencia,
 * exatamente como qualquer programa de modelagem exporta). Cada bloco
 * `newmtl <nome>` / `Kd r g b` (cor difusa, 0-1) / `d <opacidade>` (opcional,
 * < 1 = semitransparente) vira uma entrada em `opts.materiais` no
 * `register(...)` gerado — `js/objmeshsource.js` usa isso pra montar UM
 * material por grupo de faces (`usemtl <nome>` dentro do `.obj`), em vez da
 * cor única de sempre. Objetos SEM `mtllib`/`usemtl` continuam gerando
 * exatamente o mesmo `.malha.js` de antes (só `opts.cor`, sem `materiais`) —
 * nenhuma mudança de comportamento pra quem não usa material nenhum.
 *
 * USO:
 *   node assets/obj/gerador-glb/obj_para_malha_js.js <caminho/do/modelo.obj> <nome-do-tipo> [corHex]
 *
 * Exemplos:
 *   node assets/obj/gerador-glb/obj_para_malha_js.js ~/Desktop/cadeira.obj cadeira
 *   node assets/obj/gerador-glb/obj_para_malha_js.js ~/Desktop/vaso.obj planta 0xb5651d
 *   node assets/obj/gerador-glb/obj_para_malha_js.js ~/Desktop/carro/carro.obj carro
 *     (se "carro.obj" tiver "mtllib carro.mtl" e "carro.mtl" estiver na MESMA
 *     pasta, os materiais são lidos e embutidos automaticamente — não
 *     precisa passar nada a mais na linha de comando)
 *
 * [16/09/2026 UTC] NOTA — a mesma conversão (com a mesma lógica de
 * materiais .mtl acima) agora também está disponível como página web
 * interativa: `assets/obj/conversor-obj-js.html` (arrastar/soltar,
 * múltiplos arquivos, preview do .js gerado, funciona em `file:///`). Este
 * script de linha de comando NÃO foi removido — continua útil para
 * conversão em lote/scriptada — mas quem preferir uma interface visual
 * pode abrir o .html direto no navegador.
 *
 * [corHex] continua sendo a cor de FALLBACK (`opts.cor`) — usada quando o
 * `.obj` NÃO tem `usemtl`/`mtllib` nenhum (objeto de 1 cor só) ou como cor
 * de qualquer face sem grupo de material explícito.
 *
 * Gera (ou sobrescreve) `assets/modelos/<nome-do-tipo>.malha.js`, pronto
 * pra ser referenciado por `assets/modelos/<nome-do-tipo>.model.js` via
 * `malhaEstatica: true` (ver `assets/modelos/_exemplo-model-malha-obj.txt`
 * e o comentário grande em `ObjectAssets.registerModel`,
 * js/objectassets.js). NÃO faz nenhuma validação de geometria (vértices/
 * faces) — isso acontece em tempo de execução, no navegador, por
 * `ObjMeshSource.parseObjText` (js/objmeshsource.js) — este script só lê o
 * arquivo, escapa o texto com segurança (`JSON.stringify`, cobre
 * quebra de linha/aspas/backslash automaticamente) e escreve o embrulho.
 */
const fs = require('fs');
const path = require('path');

/** Parser mínimo de `.mtl` — só o que `js/objmeshsource.js` de fato usa:
 *  `newmtl <nome>` abre um material, `Kd r g b` (0-1 cada) vira a cor
 *  difusa (convertida pra hex 0xRRGGBB), `d <opacidade>` (opcional, < 1)
 *  marca semitransparência. Tudo mais (`Ka`/`Ks`/`Ns`/`illum`/mapas
 *  `map_Kd` etc.) é ignorado de propósito — mesmo espírito "escopo honesto"
 *  do parser `.obj` em objmeshsource.js. Nunca lança erro: um `.mtl`
 *  malformado só vira um aviso no console, e os materiais que deu pra ler
 *  ainda são usados (fail-soft, igual o resto do pipeline deste projeto). */
function parseMtlText(texto) {
  const materiais = {};
  let atual = null;
  const linhas = String(texto || '').split('\n');
  for (const linhaCrua of linhas) {
    const linha = linhaCrua.trim();
    if (!linha || linha[0] === '#') continue;
    const partes = linha.split(/\s+/);
    const cmd = partes[0];
    if (cmd === 'newmtl') {
      atual = partes[1];
      if (atual) materiais[atual] = {};
    } else if (cmd === 'Kd' && atual) {
      const r = parseFloat(partes[1]), g = parseFloat(partes[2]), b = parseFloat(partes[3]);
      if (![r, g, b].some(Number.isNaN)) {
        const hex = [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c * 255))));
        materiais[atual].corHex = hex.map((c) => c.toString(16).padStart(2, '0')).join('');
      }
    } else if (cmd === 'd' && atual) {
      const d = parseFloat(partes[1]);
      if (!Number.isNaN(d)) materiais[atual].opacidade = d;
    }
  }
  return materiais;
}

/** Acha `mtllib <arquivo>` no texto do `.obj` (1ª ocorrência — Wavefront
 *  permite várias, mas nenhum builder deste projeto gera mais de uma) e lê
 *  o `.mtl` correspondente, resolvido relativo à PASTA do `.obj` (convenção
 *  padrão do formato). Devolve `null` se não houver `mtllib` ou se o
 *  arquivo referenciado não existir (aviso no console, nunca erro fatal —
 *  o `.obj` sozinho continua gerando um `.malha.js` válido, só sem
 *  `materiais`). */
function lerMateriaisDoObj(textoObj, objPath) {
  const m = /^\s*mtllib\s+(\S+)/m.exec(textoObj);
  if (!m) return null;
  const mtlPath = path.resolve(path.dirname(objPath), m[1]);
  if (!fs.existsSync(mtlPath)) {
    console.warn(`⚠️  Aviso: "${path.basename(objPath)}" referencia "mtllib ${m[1]}" mas o arquivo não foi encontrado em ${mtlPath} — gerando sem materiais.`);
    return null;
  }
  const materiais = parseMtlText(fs.readFileSync(mtlPath, 'utf8'));
  if (!Object.keys(materiais).length) return null;
  return materiais;
}

function main() {
  const [, , objPathArg, tipoArg, corArg] = process.argv;
  if (!objPathArg || !tipoArg) {
    console.error('Uso: node assets/obj/gerador-glb/obj_para_malha_js.js <caminho/do/modelo.obj> <nome-do-tipo> [corHex]');
    process.exit(1);
  }
  const objPath = path.resolve(objPathArg);
  if (!fs.existsSync(objPath)) {
    console.error(`Arquivo não encontrado: ${objPath}`);
    process.exit(1);
  }
  const textoObj = fs.readFileSync(objPath, 'utf8');
  // Checagem rápida (não é o parser de verdade — só um aviso cedo, o
  // parser real roda no navegador em js/objmeshsource.js): confere se
  // existe pelo menos 1 linha 'v ' e 1 linha 'f ' antes de gerar o arquivo.
  const temVertice = /^\s*v\s+-?\d/m.test(textoObj);
  const temFace = /^\s*f\s+\d/m.test(textoObj);
  if (!temVertice || !temFace) {
    console.warn('⚠️  Aviso: o arquivo não parece ter linhas "v " (vértice) e/ou "f " (face) reconhecíveis — confira se é mesmo um .obj Wavefront de texto.');
  }

  const materiaisMtl = lerMateriaisDoObj(textoObj, objPath);

  const outDir = path.resolve(__dirname, '..', '..', 'modelos');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${tipoArg}.malha.js`);

  // Monta o literal do 3º argumento de `register(nome, texto, opts)` à mão
  // (não com JSON.stringify de um objeto JS) pra preservar `cor`/cada cor de
  // material como LITERAL hexadecimal (`0xrrggbb`, mais legível/editável à
  // mão do que o decimal que JSON.stringify produziria).
  const optsPartes = [];
  if (corArg) optsPartes.push(`cor: ${corArg}`);
  if (materiaisMtl) {
    const matsLiteral = Object.entries(materiaisMtl)
      .filter(([, info]) => info.corHex) // material sem Kd não tem cor pra usar — ignora, evita 'undefined' na malha
      .map(([nome, info]) => {
        let inner = `cor: 0x${info.corHex}`;
        if (typeof info.opacidade === 'number' && info.opacidade < 1) inner += `, opacidade: ${info.opacidade}`;
        return `    ${JSON.stringify(nome)}: { ${inner} }`;
      });
    if (matsLiteral.length) optsPartes.push(`materiais: {\n${matsLiteral.join(',\n')}\n  }`);
  }
  const optsLiteral = optsPartes.length ? `, {\n  ${optsPartes.join(',\n  ')}\n}` : '';

  const notaMateriais = materiaisMtl
    ? ` Materiais lidos de "${path.basename(objPath, '.obj')}.mtl" (referenciado via "mtllib" no .obj) — ${Object.keys(materiaisMtl).length} material(is), embutidos em \`opts.materiais\` abaixo.`
    : '';
  const conteudo = `/* assets/modelos/${tipoArg}.malha.js
 * GERADO AUTOMATICAMENTE por assets/obj/gerador-glb/obj_para_malha_js.js a partir de
 * "${path.basename(objPath)}" — [15/09/2026 UTC]. NÃO É CÓDIGO DE VERDADE:
 * é o texto do .obj embrulhado numa chamada JS válida (ver comentário
 * grande no topo de js/objmeshsource.js pra explicação completa de por
 * que isso é necessário pra funcionar com 'file:///' e não ser executado
 * como lógica).${notaMateriais} Referencie de ${tipoArg}.model.js com
 * \`malhaEstatica: true\` (ver assets/modelos/_exemplo-model-malha-obj.txt).
 * Pra regenerar depois de remodelar: rode o mesmo comando de novo.
 */
window.ObjMeshSource.register(${JSON.stringify(tipoArg)}, ${JSON.stringify(textoObj)}${optsLiteral});
`;
  fs.writeFileSync(outPath, conteudo, 'utf8');
  console.log(`Gerado: ${path.relative(process.cwd(), outPath)} (${(conteudo.length / 1024).toFixed(1)} KB)${materiaisMtl ? ` [+${Object.keys(materiaisMtl).length} material(is) do .mtl]` : ''}`);
}

main();
