/* js/maptxt.js
 * ---------------------------------------------------------------------------
 * NOVO (01/09/2026) — item GRANDE #9 do pedido de 12 itens do usuário
 * (verbatim): "Novo formato de arquivo para o mapa, um formato simples, com
 * possibilidade de ver em um editor de texto com a quebra de linha automática
 * desativada. Podendo representar portas, janelas, paredes, objetos padrão
 * (de uma lista pré-definida) e vinculação de patrimônios. Escadas e outros
 * andares também. Acredito que fica mais limitado, porém prático (e é só
 * abrir um arquivo de texto com a quebra de linha automática desativada que
 * é possível ver o mapa pela disposição dos caracteres)."
 *
 * Decisões do usuário (AskUserQuestion, 01/09/2026):
 *   - Direção: "Ida e volta (exportar E importar)" — bidirecional, não só exportar.
 *   - Onde fica: "Junto do ⬇️ Exportar" — vive na tela de Configurações, dentro
 *     do modal de exportação existente (categoria "Mapas"), não um botão
 *     dedicado na tela do Mapa.
 *   - Andares: "Andares de verdade" — paredes/portas/janelas ganham campo
 *     `piso` (ver mapping.js), empilhando de verdade em altura no 3D
 *     (mesmo mecanismo `piso*2.8` que objetos já usavam). O editor 2D
 *     continua desenhando todos os andares sobrepostos nesta rodada — é uma
 *     limitação aceita/documentada, não um bug.
 *
 * DECISÃO DE PROJETO (minha, consistente com o "mais limitado, porém
 * prático" do próprio pedido): a GRADE de caracteres (o "desenho" visível
 * abrindo o .txt num editor comum) é só uma PRÉVIA VISUAL, regenerada do
 * zero a cada exportação — ela NUNCA é relida/reconstruída na importação.
 * Quem realmente é lido de volta é a seção "---DADOS---" de cada andar, uma
 * linha por parede/porta/janela/objeto com todos os campos em texto
 * (chave=valor), com precisão total. Isso evita todo o problema de
 * reconhecer "traços de parede" em ASCII art (o que exigiria detectar
 * segmentos de reta a partir de caracteres — complexo e sujeito a erro) e
 * ainda cumpre 100% do pedido: dá pra "ver o mapa pela disposição dos
 * caracteres" (a grade), é simples de olhar num editor de texto comum, e a
 * importação é fiel (na verdade mais fiel que reconstruir a partir da
 * grade, que perderia precisão pelo arredondamento nas células).
 *
 * FORA DE ESCOPO NESTA RODADA (documentado, não esquecido):
 *   - Sem seletor de andar no editor 2D (decisão do usuário acima).
 *   - `layerId` (camada) de paredes/portas/janelas/objetos NÃO é preservado
 *     — o formato de texto não descreve as camadas em si (nome/cor/visível),
 *     então gravar só o id apontaria pra uma camada que não existe depois de
 *     importar num mapa/aparelho novo. Objetos voltam sem camada (like solto).
 *   - `customMesh` (molde 3D editado point-a-point PARA UM OBJETO específico,
 *     ver js/modeler/*) não é serializado — objetos com molde customizado
 *     voltam com a forma padrão do tipo (ou do molde de catálogo, se algum
 *     foi definido via "🛠️ Acessar modelos" — ver js/modelos3d.js). Só o
 *     tipo, posição e patrimônios vinculados é que importam de verdade pro
 *     "achar as coisas de novo" que é o objetivo do formato.
 *   - Pinos de item "soltos" no mapa (campos `item.mapaX/mapaY/mapaPiso`, a
 *     ferramenta "🎯 Itens") NÃO fazem parte deste formato — só a vinculação
 *     via `obj.itemIds` (objeto do mapa com patrimônio(s) associado(s)) é
 *     representada. São dois mecanismos independentes já no app original.
 *   - Câmeras, textos, trilha (modo assistido) e pontos de referência soltos
 *     não são representados — o pedido fala especificamente em portas,
 *     janelas, paredes, objetos padrão e patrimônios.
 *   - `modo` do mapa (assistido 2D/3D) não é preservado — mapas reimportados
 *     voltam no modo padrão do app.
 *   - Paredes curvas (`wall.curve`) são representadas como retas (x1,y1 até
 *     x2,y2) na seção DADOS — a curvatura em si não é um campo hoje coberto
 *     por este formato; a grade visual mostra só uma linha reta aproximada.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // Escala da grade de caracteres — pedido do usuário: "é só abrir um
  // arquivo de texto com a quebra de linha automática desativada que é
  // possível ver o mapa pela disposição dos caracteres". MC (metros por
  // COLUNA) e MR (metros por LINHA) são diferentes de propósito: a maioria
  // das fontes monoespaçadas tem caracteres bem mais altos que largos (perto
  // de 2:1) — usando a mesma escala nos dois eixos, uma sala quadrada no
  // mundo real apareceria ESTICADA verticalmente no editor de texto. Com
  // MC = 0.2 e MR = 0.4 (proporção 1:2, combinando com a proporção típica de
  // largura:altura de um caractere), uma área quadrada real fica
  // visualmente quase quadrada na grade também.
  const MC = 0.2; // metros por coluna
  const MR = 0.4; // metros por linha
  const MAX_COLS = 220; // teto de segurança — mapas muito grandes não geram um arquivo gigante
  const MAX_ROWS = 140;

  // Pool de símbolos ASCII pros 34 tipos de OBJECT3D_PROFILES, na ORDEM DE
  // INSERÇÃO do objeto (estável — ver comentário grande em
  // engine3d-profiles.js: novos tipos só são ACRESCENTADOS ao final, nunca
  // reordenados, senão a legenda de arquivos .txt antigos ficaria errada).
  // 24 letras (sem D/W, reservadas pra porta/janela) + 10 dígitos = 34.
  const SYMBOL_POOL = ['A', 'B', 'C', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const SYM_VAZIO = '.';
  const SYM_PAREDE = '#';
  const SYM_PORTA = 'D';
  const SYM_JANELA = 'W';

  /** Lista de tipos (Object.keys(OBJECT3D_PROFILES), ordem estável) e os dois
   *  mapas símbolo<->tipo derivados dela — recalculado a cada chamada (não
   *  cacheado) porque OBJECT3D_PROFILES já está pronto antes deste módulo
   *  rodar (ver ordem de <script> no index.html), mas más pequeno o custo de
   *  recalcular sempre é imperceptível e evita qualquer problema de cache
   *  desatualizado se algum dia os perfis forem carregados de forma tardia. */
  function _tipos() {
    return Object.keys(window.OBJECT3D_PROFILES || {});
  }
  function _tipoParaSimbolo() {
    const tipos = _tipos();
    const m = {};
    tipos.forEach((t, i) => { if (SYMBOL_POOL[i]) m[t] = SYMBOL_POOL[i]; });
    return m;
  }
  function _simboloParaTipo() {
    const tipos = _tipos();
    const m = {};
    tipos.forEach((t, i) => { if (SYMBOL_POOL[i]) m[SYMBOL_POOL[i]] = t; });
    return m;
  }

  // ---------- Helpers de formatação de valor (linha DADOS) ----------
  // Números com precisão de milímetro (3 casas) pra medidas, e de
  // microrradiano (6 casas) pra ângulos — suficiente pra nunca se notar
  // arredondamento visual, sem gerar floats gigantes ilegíveis no arquivo.
  function _num(v, casas) {
    if (v == null || Number.isNaN(v)) return '';
    const f = Math.pow(10, casas == null ? 3 : casas);
    return String(Math.round(v * f) / f);
  }
  function _ang(v) { return _num(v, 6); }
  function _str(v) { return v == null ? '' : String(v).replace(/\s+/g, '_'); }
  function _bool(v) { return v ? '1' : '0'; }
  function _rgb(arr) { return Array.isArray(arr) ? arr.join(',') : ''; }
  function _parseRgb(s) {
    if (!s) return null;
    const p = s.split(',').map((x) => parseInt(x, 10));
    return p.length === 3 && p.every((x) => !Number.isNaN(x)) ? p : null;
  }
  function _parseNum(s, def) {
    if (s === '' || s == null) return def == null ? undefined : def;
    const n = Number(s);
    return Number.isNaN(n) ? (def == null ? undefined : def) : n;
  }

  /** Monta uma linha "TIPO chave=valor chave2=valor2 ..." — campos com
   *  valor vazio ('') ainda aparecem (chave=) pra manter a mesma ordem de
   *  colunas em toda linha do mesmo tipo (mais fácil de olhar/alinhar num
   *  editor de texto, e mais simples de fazer o parser). */
  function _linha(tipo, campos) {
    const partes = Object.keys(campos).map((k) => `${k}=${campos[k]}`);
    return `${tipo} ${partes.join(' ')}`;
  }

  /** Faz o parser de uma linha de DADOS de volta num objeto {chave: valorTexto}. */
  function _parseLinha(linha) {
    const espaco = linha.indexOf(' ');
    if (espaco < 0) return { tipo: linha.trim(), campos: {} };
    const tipo = linha.slice(0, espaco);
    const resto = linha.slice(espaco + 1);
    const campos = {};
    // Split simples por espaço — os valores nunca têm espaço (ver _str acima,
    // que troca qualquer espaço por "_" na exportação).
    resto.trim().split(/\s+/).forEach((tok) => {
      const i = tok.indexOf('=');
      if (i < 0) return;
      campos[tok.slice(0, i)] = tok.slice(i + 1);
    });
    return { tipo, campos };
  }

  // ---------- Piso "efetivo" de porta/janela pra fins de agrupamento por
  // andar — presa numa parede usa o piso DA PAREDE (nunca o próprio campo),
  // exatamente a mesma regra usada na renderização 3D (ver engine3d.js
  // buildDoorOrWindowMesh) — pedido implícito de consistência: a porta tem
  // que aparecer no MESMO andar-texto que ela aparece no 3D. ----------
  function _pisoEfetivo(map, el) {
    if (el.parentWallId) {
      const w = (map.walls || []).find((ww) => ww.id === el.parentWallId);
      if (w) return w.piso || 0;
    }
    return el.piso || 0;
  }

  /** Lista todos os pisos usados no mapa (paredes/portas/janelas/objetos),
   *  sempre incluindo pelo menos o piso 0 (mapas sem nenhum elemento ainda
   *  geram um arquivo com um andar vazio, em vez de zero andares). */
  function _listarPisos(map) {
    const s = new Set([0]);
    (map.walls || []).forEach((w) => s.add(w.piso || 0));
    (map.portas || []).forEach((d) => s.add(_pisoEfetivo(map, d)));
    (map.janelas || []).forEach((j) => s.add(_pisoEfetivo(map, j)));
    (map.objects || []).forEach((o) => s.add(o.piso || 0));
    return [...s].sort((a, b) => a - b);
  }

  // ---------- Rasterização da grade de UM andar (só visual, ver decisão de
  // projeto no topo do arquivo) ----------
  function _montarGrade(map, piso, tipoParaSimbolo) {
    const walls = (map.walls || []).filter((w) => (w.piso || 0) === piso);
    const objects = (map.objects || []).filter((o) => (o.piso || 0) === piso);
    const portas = (map.portas || []).filter((d) => _pisoEfetivo(map, d) === piso);
    const janelas = (map.janelas || []).filter((j) => _pisoEfetivo(map, j) === piso);

    const pontos = [];
    walls.forEach((w) => { pontos.push([w.x1, w.y1], [w.x2, w.y2]); });
    objects.forEach((o) => pontos.push([o.x, o.y]));
    portas.forEach((d) => { const p = window.Mapping.resolveDoorWindowPos(map, d); pontos.push([p.x, p.y]); });
    janelas.forEach((j) => { const p = window.Mapping.resolveDoorWindowPos(map, j); pontos.push([p.x, p.y]); });

    if (!pontos.length) pontos.push([0, 0], [1, 1]); // andar sem nada ainda — grade mínima 1x1 (com margem vira algo pequeno)

    const margem = 0.3; // metros de folga nas bordas — evita parede colada na borda do "desenho"
    let minX = Math.min(...pontos.map((p) => p[0])) - margem;
    let maxX = Math.max(...pontos.map((p) => p[0])) + margem;
    let minY = Math.min(...pontos.map((p) => p[1])) - margem;
    let maxY = Math.max(...pontos.map((p) => p[1])) + margem;

    // Teto de segurança (MAX_COLS/MAX_ROWS) — mapa gigante não gera um
    // arquivo com uma grade absurdamente grande; a escala só desta grade
    // aumenta (fica menos detalhada), sem afetar os DADOS (que continuam com
    // precisão total, independente do tamanho da grade).
    let mc = MC, mr = MR;
    const colsNecessarias = (maxX - minX) / mc;
    const rowsNecessarias = (maxY - minY) / mr;
    if (colsNecessarias > MAX_COLS) mc = (maxX - minX) / MAX_COLS;
    if (rowsNecessarias > MAX_ROWS) mr = (maxY - minY) / MAX_ROWS;

    const cols = Math.max(1, Math.min(MAX_COLS, Math.ceil((maxX - minX) / mc) + 1));
    const rows = Math.max(1, Math.min(MAX_ROWS, Math.ceil((maxY - minY) / mr) + 1));
    const grid = Array.from({ length: rows }, () => Array(cols).fill(SYM_VAZIO));

    const toCol = (x) => Math.max(0, Math.min(cols - 1, Math.round((x - minX) / mc)));
    const toRow = (y) => Math.max(0, Math.min(rows - 1, Math.round((y - minY) / mr)));

    // 1) Paredes — linha reta simples (DDA) entre as duas pontas.
    walls.forEach((w) => {
      const c1 = toCol(w.x1), r1 = toRow(w.y1), c2 = toCol(w.x2), r2 = toRow(w.y2);
      const passos = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1), 1);
      for (let i = 0; i <= passos; i++) {
        const c = Math.round(c1 + ((c2 - c1) * i) / passos);
        const r = Math.round(r1 + ((r2 - r1) * i) / passos);
        grid[r][c] = SYM_PAREDE;
      }
    });

    // 2) Objetos — um símbolo por tipo (célula única, ver limitação documentada).
    objects.forEach((o) => {
      const sim = tipoParaSimbolo[o.tipo] || '?';
      grid[toRow(o.y)][toCol(o.x)] = sim;
    });

    // 3) Portas/janelas por último — sempre visíveis mesmo em cima de parede/objeto.
    portas.forEach((d) => { const p = window.Mapping.resolveDoorWindowPos(map, d); grid[toRow(p.y)][toCol(p.x)] = SYM_PORTA; });
    janelas.forEach((j) => { const p = window.Mapping.resolveDoorWindowPos(map, j); grid[toRow(p.y)][toCol(p.x)] = SYM_JANELA; });

    return { grid, cols, rows, minX, minY, mc, mr };
  }

  // ---------- Explicação completa (cabeçalho comentado) ----------
  // NOVO (01/09/2026) — pedido do usuário verbatim: "Deve ficar em algum
  // lugar os padrões utilizados, por exemplo, uma parede é representada
  // assim: '|', '-', '+'. Deve poder exportar um mapa de exemplo e como
  // comentário todas os significados dos caracteres e como funciona a
  // estrutura do arquivo." A LEGENDA anterior só listava símbolo→tipo (uma
  // linha por tipo de objeto) sem explicar a ESTRUTURA do arquivo em si
  // (o que é o cabeçalho, o que é "---DADOS---", o que cada campo de cada
  // linha PAREDE/PORTA/JANELA/OBJETO significa) — um usuário abrindo o
  // arquivo pela primeira vez não tinha como entender sozinho. Expandido
  // pra um bloco de comentários completo, reaproveitado tanto pelo export
  // de um mapa de verdade (`exportarMapa`) quanto pelo mapa de EXEMPLO
  // (`exportarExemplo`, abaixo) — os dois usam exatamente o mesmo texto
  // explicativo, então o exemplo serve de referência válida pra qualquer
  // arquivo real também. Nota: os símbolos de parede citados pelo usuário
  // ("|", "-", "+") são os clássicos de ASCII art de planta baixa — este
  // formato usa só "#" pra QUALQUER trecho de parede (sem distinguir
  // horizontal/vertical/quina), decisão já tomada na 1ª versão (rodada 79)
  // pra manter o desenho simples; documentado aqui explicitamente pra não
  // haver dúvida de que "#" cobre os três casos que "|"/"-"/"+" cobririam
  // num ASCII art tradicional.
  function _blocoExplicativo(tipoParaSimbolo) {
    const linhas = [];
    linhas.push('# ===================================================================');
    linhas.push('# CATALOGAÇÃO DE ITENS — mapa em formato de texto (.txt), versão 1');
    linhas.push('# ===================================================================');
    linhas.push('# COMO LER ESTE ARQUIVO');
    linhas.push('#   Abra num editor de texto qualquer com a "quebra de linha automática"');
    linhas.push('#   DESLIGADA (Bloco de Notas: menu Formatar > desmarque "Quebra automática');
    linhas.push('#   de linha"; VS Code: desligue "Word Wrap", atalho Alt+Z) — assim a grade');
    linhas.push('#   de cada andar fica alinhada, formando o "desenho" do mapa pela própria');
    linhas.push('#   disposição dos caracteres.');
    linhas.push('#');
    linhas.push('# ESTRUTURA DO ARQUIVO');
    linhas.push('#   1) CABEÇALHO (linhas chave=valor, ANTES do primeiro "===ANDAR"):');
    linhas.push('#        mapa=             nome do mapa/ambiente');
    linhas.push('#        mapa_id=          identificador único — reimportar o MESMO arquivo');
    linhas.push('#                          atualiza o MESMO mapa (não cria um duplicado)');
    linhas.push('#        exportado_em=     data/hora da exportação (só informativo)');
    linhas.push('#        escala_coluna_m=  quantos metros cada COLUNA da grade representa');
    linhas.push('#        escala_linha_m=   quantos metros cada LINHA da grade representa');
    linhas.push('#        andares=          lista dos números de andar presentes no arquivo');
    linhas.push('#   2) Um bloco por ANDAR, entre "===ANDAR N===" e "===FIM-ANDAR===":');
    linhas.push('#        a) a GRADE — um "desenho" em caracteres do andar (símbolos abaixo).');
    linhas.push('#           É SÓ VISUAL, uma prévia aproximada — editar os caracteres da');
    linhas.push('#           grade NÃO muda nada ao reimportar o arquivo.');
    linhas.push('#        b) "---DADOS---" seguido de uma linha por elemento (parede, porta,');
    linhas.push('#           janela, objeto), no formato "TIPO campo1=valor1 campo2=valor2 ...".');
    linhas.push('#           É ESTA seção que é lida de volta na importação, com precisão');
    linhas.push('#           total (ao contrário da grade, que é só aproximada).');
    linhas.push('#');
    linhas.push('# SÍMBOLOS DA GRADE (visual — ver acima, não afeta a importação)');
    linhas.push(`#   ${SYM_VAZIO}  vazio`);
    linhas.push(`#   ${SYM_PAREDE}  parede (qualquer trecho — horizontal, vertical ou quina; este`);
    linhas.push('#      formato usa um símbolo só pros três casos, ao contrário do ASCII');
    linhas.push('#      art tradicional que costuma usar "|"/"-"/"+" separados)');
    linhas.push(`#   ${SYM_PORTA}  porta (vão numa parede)`);
    linhas.push(`#   ${SYM_JANELA}  janela (vão numa parede)`);
    linhas.push('#   ?  objeto de um tipo desconhecido (arquivo mais novo que este app)');
    linhas.push('#   [demais letras/números — um símbolo por tipo de objeto do catálogo,');
    linhas.push('#    lista completa logo abaixo]');
    linhas.push('#');
    linhas.push('# CAMPOS DE CADA LINHA DE DADOS');
    linhas.push('#   PAREDE    id, x1,y1,x2,y2 (as duas pontas, em metros), altura, espessura,');
    linhas.push('#             cor (R,G,B de 0 a 255), tipo');
    linhas.push('#   PORTA/    id, parede (id da parede onde está presa — vazio = solta),');
    linhas.push('#   JANELA    pos (posição ao longo da parede, em metros, se presa),');
    linhas.push('#             angulo, anguloExtra, x,y (posição absoluta, se solta), largura,');
    linhas.push('#             altura, peitoril (altura do parapeito da janela), abertura');
    linhas.push('#             (só porta: "direita" ou "esquerda"), aberta (0 ou 1), grade,');
    linhas.push('#             bandeira (só janela, 0 ou 1), tipo, cor');
    linhas.push('#   OBJETO    id, tipo (ver símbolos acima), x,y, angulo, elevacao, forma,');
    linhas.push('#             largura, profundidade, altura, raio, lados, cor, colorRGB,');
    linhas.push('#             patrimonios (números de patrimônio vinculados, separados por');
    linhas.push('#             vírgula — na importação, um número não encontrado neste');
    linhas.push('#             aparelho vira só um AVISO, nunca trava a importação)');
    linhas.push('#');
    linhas.push('# LEGENDA DE TIPOS DE OBJETO (símbolo → tipo do catálogo)');
    _tipos().forEach((t) => { if (tipoParaSimbolo[t]) linhas.push(`#   ${tipoParaSimbolo[t]}  ${t}`); });
    linhas.push('# ===================================================================');
    return linhas;
  }

  // ---------- Exportação ----------
  /** Gera o texto completo de UM mapa no novo formato. Síncrono — tudo que
   *  precisa (patrimônio vinculado) já está copiado em `obj.itemIds[].patrimonio`
   *  (ver Mapping.addItemToObject), sem precisar consultar o DB. */
  function exportarMapa(map) {
    const tipoParaSimbolo = _tipoParaSimbolo();
    const pisos = _listarPisos(map);
    const linhas = [];

    linhas.push('CATALOGACAO-MAPA-TXT-V1');
    linhas.push(`mapa=${_str(map.nome || 'Ambiente sem nome')}`);
    linhas.push(`mapa_id=${_str(map.id)}`);
    linhas.push(`exportado_em=${window.DB ? window.DB.nowISO() : new Date().toISOString()}`);
    linhas.push(`escala_coluna_m=${MC}`);
    linhas.push(`escala_linha_m=${MR}`);
    linhas.push(`andares=${pisos.join(',')}`);
    linhas.push('');
    linhas.push(..._blocoExplicativo(tipoParaSimbolo));

    pisos.forEach((piso) => {
      const { grid } = _montarGrade(map, piso, tipoParaSimbolo);
      linhas.push('');
      linhas.push(`===ANDAR ${piso}===`);
      grid.forEach((row) => linhas.push(row.join('')));
      linhas.push('---DADOS---');

      (map.walls || []).filter((w) => (w.piso || 0) === piso).forEach((w) => {
        linhas.push(_linha('PAREDE', {
          id: _str(w.id), x1: _num(w.x1), y1: _num(w.y1), x2: _num(w.x2), y2: _num(w.y2),
          altura: _num(w.height), espessura: _num(w.espessura), cor: _rgb(w.colorRGB), tipo: _str(w.tipo || 'padrao'),
        }));
      });
      (map.portas || []).filter((d) => _pisoEfetivo(map, d) === piso).forEach((d) => {
        linhas.push(_linha('PORTA', {
          id: _str(d.id), parede: _str(d.parentWallId), pos: _num(d.posAoLongoDaParede), angulo: _ang(d.angulo),
          anguloExtra: _ang(d.anguloExtra), x: _num(d.x), y: _num(d.y), largura: _num(d.largura), altura: _num(d.altura),
          peitoril: _num(d.alturaPeitoril), abertura: _str(d.abertura || 'direita'), aberta: _bool(d.aberta),
          tipo: _str(d.tipo || 'padrao'), cor: _rgb(d.colorRGB),
        }));
      });
      (map.janelas || []).filter((j) => _pisoEfetivo(map, j) === piso).forEach((j) => {
        linhas.push(_linha('JANELA', {
          id: _str(j.id), parede: _str(j.parentWallId), pos: _num(j.posAoLongoDaParede), angulo: _ang(j.angulo),
          anguloExtra: _ang(j.anguloExtra), x: _num(j.x), y: _num(j.y), largura: _num(j.largura), altura: _num(j.altura),
          peitoril: _num(j.alturaPeitoril), grade: _bool(j.grade), bandeira: _bool(j.bandeira), aberta: _bool(j.aberta),
          tipo: _str(j.tipo || 'padrao'), cor: _rgb(j.colorRGB),
        }));
      });
      (map.objects || []).filter((o) => (o.piso || 0) === piso).forEach((o) => {
        const patrimonios = (o.itemIds || []).map((e) => e.patrimonio).filter((p) => p != null && p !== '').join(',');
        linhas.push(_linha('OBJETO', {
          id: _str(o.id), tipo: _str(o.tipo), x: _num(o.x), y: _num(o.y), angulo: _ang(o.angulo),
          elevacao: _num(o.elevacao), forma: _str(o.forma), largura: _num(o.largura), profundidade: _num(o.profundidade),
          altura: _num(o.altura), raio: _num(o.raio), lados: _num(o.lados, 0), cor: _str(o.cor), colorRGB: _rgb(o.colorRGB),
          patrimonios: _str(patrimonios),
        }));
      });

      linhas.push('===FIM-ANDAR===');
    });

    return linhas.join('\n');
  }

  /** NOVO (01/09/2026) — "Deve poder exportar um mapa de exemplo e como
   *  comentário todas os significados dos caracteres e como funciona a
   *  estrutura do arquivo." Monta um mapa FICTÍCIO em memória (nunca gravado
   *  no banco) — uma salinha simples de 4x3m com 1 parede-porta, 1
   *  parede-janela, 1 objeto com um patrimônio de exemplo, mais um 2º andar
   *  bem pequeno só pra também demonstrar o campo `andares` — e reaproveita
   *  o MESMO `exportarMapa`/`_blocoExplicativo` de um mapa de verdade, então
   *  o texto de exemplo é garantidamente representativo do formato real
   *  (nunca pode "ficar desatualizado" em relação ao formato de verdade,
   *  já que é gerado pelo mesmo código). Acrescenta só um aviso extra no
   *  topo deixando claro que é ilustrativo, não um mapa de catálogo real. */
  function exportarExemplo() {
    const tipos = _tipos();
    // Prioriza 'escada' se existir no catálogo (tipo mais novo, ilustra bem
    // o campo `patrimonios` junto de um objeto "reconhecível"); cai pro
    // primeiro tipo da lista se por algum motivo não existir.
    const tipoObjeto = tipos.includes('escada') ? 'escada' : (tipos[0] || 'caixa-generica');
    const mapaExemplo = {
      id: 'exemplo-demonstrativo-nao-e-um-mapa-real',
      nome: 'Mapa de EXEMPLO (ilustrativo — não é um mapa real)',
      walls: [
        { id: 'parede-sul', x1: 0, y1: 0, x2: 4, y2: 0, height: 2.6, espessura: 0.12, piso: 0, tipo: 'padrao' },
        { id: 'parede-leste', x1: 4, y1: 0, x2: 4, y2: 3, height: 2.6, espessura: 0.12, piso: 0, tipo: 'padrao' },
        { id: 'parede-norte', x1: 4, y1: 3, x2: 0, y2: 3, height: 2.6, espessura: 0.12, piso: 0, tipo: 'padrao' },
        { id: 'parede-oeste', x1: 0, y1: 3, x2: 0, y2: 0, height: 2.6, espessura: 0.12, piso: 0, tipo: 'padrao' },
        // 2º andar — só uma parede curta, o suficiente pra aparecer na
        // lista `andares=` e mostrar como fica o bloco "===ANDAR 1===".
        { id: 'parede-2o-andar', x1: 0, y1: 0, x2: 4, y2: 0, height: 2.6, espessura: 0.12, piso: 1, tipo: 'padrao' },
      ],
      portas: [
        {
          id: 'porta-exemplo', parentWallId: 'parede-sul', posAoLongoDaParede: 1.5, angulo: 0, anguloExtra: 0,
          x: 1.5, y: 0, largura: 0.8, altura: 2.1, alturaPeitoril: 0, abertura: 'direita', aberta: false,
          tipo: 'padrao', colorRGB: null, piso: 0,
        },
      ],
      janelas: [
        {
          id: 'janela-exemplo', parentWallId: 'parede-norte', posAoLongoDaParede: 1.5, angulo: 0, anguloExtra: 0,
          x: 2.5, y: 3, largura: 1.2, altura: 1.2, alturaPeitoril: 1.0, grade: false, bandeira: false, aberta: false,
          tipo: 'padrao', colorRGB: null, piso: 0,
        },
      ],
      objects: [
        {
          id: 'objeto-exemplo', tipo: tipoObjeto, x: 2, y: 1.5, angulo: 0, piso: 0,
          itemIds: [{ id: 'exemplo', em: '', patrimonio: 'EXEMPLO-0001' }],
        },
      ],
    };
    const linhas = exportarMapa(mapaExemplo).split('\n');
    // Aviso extra, ANTES de tudo (primeira coisa que aparece ao abrir o
    // arquivo) — evita que alguém confunda este exemplo com um mapa de
    // verdade exportado do próprio catálogo.
    const aviso = [
      '# #####################################################################',
      '# ESTE ARQUIVO É SÓ UM EXEMPLO ILUSTRATIVO — não corresponde a nenhum',
      '# mapa real deste app. Serve de referência do formato de texto (ver a',
      '# explicação completa logo abaixo). Se quiser, pode importar este',
      '# arquivo de teste (menu Configurações > "📄 Importar mapa (.txt)") —',
      '# ele vira um mapa novo chamado "Mapa de EXEMPLO (ilustrativo — não é',
      '# um mapa real)", que dá pra excluir depois sem afetar nada.',
      '# #####################################################################',
      '',
    ];
    return [...aviso, ...linhas].join('\n');
  }

  // ---------- Importação ----------
  /** Faz o parser do texto de volta num objeto {map, avisos}. `map` já sai
   *  no formato pronto pra entrar em `{versao:1, maps:[map]}` e ser
   *  alimentado no MESMO pipeline de importação de backup já existente (ver
   *  settings.js #st-import) — inclusive o `id` vem do cabeçalho
   *  (`mapa_id=`), então reimportar o MESMO mapa aciona naturalmente a
   *  janela de conflito "já existe um mapa com esse id" que já existia.
   *  Assíncrono só por causa da resolução de `patrimonios=` via
   *  DB.getItemByPatrimonio (ver OBJETO abaixo). */
  async function parseTexto(texto) {
    const simboloParaTipo = _simboloParaTipo();
    const linhasTexto = String(texto || '').split(/\r\n|\r|\n/);
    const avisos = [];

    let mapaNome = 'Mapa importado (.txt)';
    let mapaId = null;
    let li = 0;
    // Cabeçalho: linhas "chave=valor" até a primeira linha vazia/comentário/marcador.
    for (; li < linhasTexto.length; li++) {
      const l = linhasTexto[li];
      if (!l || l.startsWith('#') || l.startsWith('===')) break;
      const i = l.indexOf('=');
      if (i < 0) continue;
      const chave = l.slice(0, i), valor = l.slice(i + 1);
      if (chave === 'mapa') mapaNome = valor || mapaNome;
      if (chave === 'mapa_id') mapaId = valor || null;
      if (chave !== 'CATALOGACAO-MAPA-TXT-V1' && !valor && chave.indexOf(' ') >= 0) continue; // ignora linha que não é cabeçalho de verdade
    }

    const walls = [], portas = [], janelas = [], objects = [];
    let dentroDados = false;
    for (; li < linhasTexto.length; li++) {
      const l = linhasTexto[li];
      if (l.startsWith('===ANDAR')) { dentroDados = false; continue; }
      if (l === '---DADOS---') { dentroDados = true; continue; }
      if (l === '===FIM-ANDAR===') { dentroDados = false; continue; }
      if (!dentroDados) continue; // ignora as linhas da GRADE de propósito (ver decisão de projeto no topo do arquivo) e comentários/linhas em branco
      if (!l.trim()) continue;
      const { tipo, campos } = _parseLinha(l);
      if (tipo === 'PAREDE') {
        walls.push({
          id: campos.id || window.Utils.uid('wall'), x1: _parseNum(campos.x1, 0), y1: _parseNum(campos.y1, 0),
          x2: _parseNum(campos.x2, 0), y2: _parseNum(campos.y2, 0), height: _parseNum(campos.altura, 2.6),
          espessura: _parseNum(campos.espessura, 0.12), colorRGB: _parseRgb(campos.cor), tipo: campos.tipo || 'padrao',
          piso: 0, layerId: null,
        });
      } else if (tipo === 'PORTA' || tipo === 'JANELA') {
        const alvo = tipo === 'PORTA' ? portas : janelas;
        const base = {
          id: campos.id || window.Utils.uid(tipo === 'PORTA' ? 'porta' : 'janela'),
          parentWallId: campos.parede || null, posAoLongoDaParede: _parseNum(campos.pos, 0),
          anguloExtra: _parseNum(campos.anguloExtra, 0), x: _parseNum(campos.x, 0), y: _parseNum(campos.y, 0),
          angulo: _parseNum(campos.angulo, 0), alturaPeitoril: _parseNum(campos.peitoril, tipo === 'PORTA' ? 0 : 1.0),
          largura: _parseNum(campos.largura, tipo === 'PORTA' ? 0.8 : 1.2), altura: _parseNum(campos.altura, tipo === 'PORTA' ? 2.1 : 1.2),
          tipo: campos.tipo || 'padrao', aberta: campos.aberta === '1', colorRGB: _parseRgb(campos.cor), layerId: null,
          piso: 0, criadoEm: window.DB ? window.DB.nowISO() : new Date().toISOString(),
        };
        if (tipo === 'PORTA') base.abertura = campos.abertura || 'direita';
        else { base.grade = campos.grade === '1'; base.bandeira = campos.bandeira === '1'; }
        alvo.push(base);
      } else if (tipo === 'OBJETO') {
        const o = {
          id: campos.id || window.Utils.uid('obj'), tipo: campos.tipo || 'caixa-generica',
          x: _parseNum(campos.x, 0), y: _parseNum(campos.y, 0), angulo: _parseNum(campos.angulo, 0),
          piso: 0, criadoEm: window.DB ? window.DB.nowISO() : new Date().toISOString(),
        };
        if (campos.elevacao !== '') o.elevacao = _parseNum(campos.elevacao);
        if (campos.forma) o.forma = campos.forma;
        if (campos.largura !== '') o.largura = _parseNum(campos.largura);
        if (campos.profundidade !== '') o.profundidade = _parseNum(campos.profundidade);
        if (campos.altura !== '') o.altura = _parseNum(campos.altura);
        if (campos.raio !== '') o.raio = _parseNum(campos.raio);
        if (campos.lados !== '') o.lados = _parseNum(campos.lados, 0);
        if (campos.cor) o.cor = campos.cor;
        const rgb = _parseRgb(campos.colorRGB); if (rgb) o.colorRGB = rgb;
        // `patrimonios=` — resolve cada número pra um item já cadastrado
        // (DB.getItemByPatrimonio); números não encontrados são ignorados
        // silenciosamente (limitação documentada — ver topo do arquivo),
        // mas registrados em `avisos` pra quem chamou poder avisar o usuário.
        if (campos.patrimonios) {
          o.itemIds = [];
          const nums = campos.patrimonios.split(',').map((s) => s.trim()).filter(Boolean);
          for (const num of nums) {
            const item = window.DB ? await window.DB.getItemByPatrimonio(num) : null;
            if (item) o.itemIds.push({ id: item.id, em: window.DB.nowISO(), patrimonio: num });
            else avisos.push(`Patrimônio "${num}" (objeto ${o.id}) não encontrado neste aparelho — vinculação não recriada.`);
          }
        }
        objects.push(o);
      }
    }

    // Registra o PISO de cada andar nos elementos coletados. Pra manter o
    // parser principal acima simples de ler/revisar (só olha DADOS/campos,
    // não precisa carregar o "andar corrente" junto), o `piso` real de cada
    // elemento é aplicado aqui numa segunda passada rápida pelas mesmas
    // linhas, andando em paralelo com a ordem em que cada registro foi
    // empilhado em walls/portas/janelas/objects acima (mesma ordem de
    // aparição no arquivo, garantida por percorrer as linhas uma única vez
    // de cada lado).
    let pisoCorrente = 0;
    let idxWall = 0, idxPorta = 0, idxJanela = 0, idxObj = 0;
    for (const l of linhasTexto) {
      const m = /^===ANDAR (-?\d+)===$/.exec(l);
      if (m) { pisoCorrente = parseInt(m[1], 10); continue; }
      if (!l || l === '---DADOS---' || l === '===FIM-ANDAR===') continue;
      if (l.startsWith('PAREDE ')) { if (walls[idxWall]) walls[idxWall].piso = pisoCorrente; idxWall++; }
      else if (l.startsWith('PORTA ')) { if (portas[idxPorta]) portas[idxPorta].piso = pisoCorrente; idxPorta++; }
      else if (l.startsWith('JANELA ')) { if (janelas[idxJanela]) janelas[idxJanela].piso = pisoCorrente; idxJanela++; }
      else if (l.startsWith('OBJETO ')) { if (objects[idxObj]) objects[idxObj].piso = pisoCorrente; idxObj++; }
    }

    const map = {
      id: mapaId || window.Utils.uid('map'), nome: mapaNome, walls, points: [], trilha: [], cameras: [],
      objects, textos: [], portas, janelas, layers: [], parentId: null,
      criadoEm: window.DB ? window.DB.nowISO() : new Date().toISOString(),
      atualizadoEm: window.DB ? window.DB.nowISO() : new Date().toISOString(),
    };
    if (window.Mapping && window.Mapping.recalcBounds) window.Mapping.recalcBounds(map);

    return { map, avisos, simboloParaTipo };
  }

  window.MapTxt = { exportarMapa, exportarExemplo, parseTexto, MC, MR };
})();
