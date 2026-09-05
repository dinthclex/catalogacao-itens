// receive.js — servidor local opcional deste app, versão Node.js.
//
// NOVO (01/09/2026), item GRANDE #3 do pedido de 12 itens, verbatim: "Deve
// ser possível guardar direto em arquivo pelo servidor local, além do
// indexedDB. [...] Deve ser possível guardar em uma pasta dentro do projeto
// (para caso se exclua os dados do navegador e não se tenha 'exportado',
// então, seja possível recuperar tudo). As configurações e opções de menu
// devem ser guardadas em um arquivo a parte, algo como 'preferências do
// usuário'." Mensagem de acompanhamento do usuário, também verbatim: "Deve
// funcionar independente de navegador."
//
// ANTES deste arquivo, o "servidor local" só existia como TEXTO/STRING
// dentro de js/settings.js (`_downloadServerBundleNode`), baixado sob
// demanda pelo botão "⬇️ Baixar receive.js" — nenhum servidor de verdade
// ficava versionado no projeto. Este arquivo agora é REAL e fica DENTRO da
// pasta do projeto (`server/`, ao lado deste próprio arquivo) — é isso que
// torna a persistência "independente do navegador": uma vez rodando
// ("node server/receive.js"), este processo continua de pé sozinho,
// gravando em disco, MESMO com o navegador/aba fechados — só reabrir o app
// mais tarde (ou noutro aparelho) e ele volta a escrever/ler daqui. O botão
// de baixar bundle em Configurações continua existindo (útil pra quem só
// tem a pasta `outputs/` isolada, sem o resto do repositório, ou quer rodar
// em outra máquina) — a versão gerada por ele foi atualizada nesta mesma
// rodada pra ter a MESMA API deste arquivo (ver settings.js).
//
// Não precisa instalar NADA além do próprio Node.js — "node
// server/receive.js" já sobe o servidor (porta 8000 por padrão, PORTA=xxxx
// muda). Sem dependências externas (só os módulos nativos http/fs/path).
//
// API (POST, corpo JSON, sempre com {acao, ...}):
//   1) "salvar-item" — salvamento automático de UM item por vez (a cada
//      item confirmado na captura, se ativado nas Configurações) — grava em
//      arquivo individual (itens/<patrimonio>__<id>.json) e/ou no catálogo
//      único (catalogo-unico.json), conforme "modoArquivo".
//   2) "listar" — usado pela sincronização entre aparelhos (sync.js) —
//      devolve os itens do catálogo central, opcionalmente só os alterados
//      a partir de um instante ("desde").
//   3) "listarObjs" — objetos 3D .obj importados (pasta objetos/ ao lado
//      deste arquivo).
//   4) "salvar-preferencias" / "carregar-preferencias" — NOVO nesta rodada.
//      Arquivo SEPARADO (preferencias-usuario.json) das configurações e
//      opções de menu do app (pedido verbatim acima: "em um arquivo a
//      parte") — nunca mistura com os itens do catálogo.
//   5) "salvar-backup-completo" / "carregar-backup-completo" — NOVO nesta
//      rodada. Espelha `DB.exportAll()` (itens+tipos+setores+mapas+
//      fotos+configurações) inteiro num arquivo (backup-completo.json) —
//      é o que permite "recuperar tudo" se os dados do navegador forem
//      apagados sem um "exportar" manual ter sido feito antes.
//   6) "status-armazenamento" / "configurar-pasta-dados" — NOVO (03/09/2026).
//      Consulta e altera a PASTA DE DADOS onde tudo acima é gravado (padrão:
//      server/dados/, "uma pasta dentro do app"; configurável pra qualquer
//      outro caminho, relativo ou absoluto) — ver comentário grande acima de
//      `CONFIG_PATH`/`pastaDadosAtual`.
//   7) qualquer outra ação (ou nenhuma) — envio em lote (fallback do
//      email.js): só salva uma cópia em recebidos/, sem enviar email
//      automaticamente (email de verdade só na versão PHP, que tem acesso
//      a mail(); ver receive.php gerado em Configurações).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORTA = process.env.PORTA || 8000;
const DIR = __dirname;

// NOVO (03/09/2026) — Pedido do usuário: "Quando o app estiver rodando em um
// servidor, deve guardar os arquivos em uma pasta dentro do app (esta pasta
// pode ser em outro lugar, deve ser possível configurar. Por padrão é em uma
// pasta dentro do app). Além de guardar (como sempre) no indexedDB. Isto deve
// ficar claro visualmente."
//
// ANTES desta rodada, todo arquivo de dados (catalogo-unico.json, itens/,
// preferencias-usuario.json, backup-completo.json, recebidos/) era gravado
// direto dentro de `server/` (a mesma pasta do próprio receive.js/receive.php/
// config.php) — sem nenhuma pasta dedicada e sem jeito nenhum de mudar isso.
// Agora existe uma pasta de DADOS dedicada (padrão: `server/dados/`, "uma
// pasta dentro do app" como pedido), configurável de duas formas:
//   1) Editando `server/config.json` (chave "pastaDados") diretamente — pode
//      ser um caminho relativo (à pasta `server/`) ou absoluto ("pode ser em
//      outro lugar").
//   2) Pelo próprio app: Configurações → 🖥️ Servidor local → campo "Pasta de
//      dados no servidor" → ação "configurar-pasta-dados" abaixo, que
//      persiste em `config.json` e já passa a valer na mesma hora, sem
//      reiniciar o processo (ver `carregarConfig`/`DADOS_DIR`, recarregado a
//      cada leitura em vez de fixado uma vez só no boot).
// `objetos/` (import de .obj) continua fora da pasta de dados de propósito —
// é uma pasta de ENTRADA que a pessoa preenche manualmente, não um destino de
// "guardar os arquivos" gerado pelo app.
const CONFIG_PATH = path.join(DIR, 'config.json');

function carregarConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {}; } catch (e) { return {}; }
}

function salvarConfig(cfg) {
  salvarArquivoAtomico(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// Resolve a pasta de dados ATUAL (relida a cada chamada — barata, é um JSON
// pequeno — pra "configurar-pasta-dados" valer na hora, sem reiniciar o
// servidor) e garante que ela existe no disco.
function pastaDadosAtual() {
  const cfg = carregarConfig();
  const pasta = (cfg.pastaDados && String(cfg.pastaDados).trim()) || path.join(DIR, 'dados');
  const abs = path.isAbsolute(pasta) ? pasta : path.join(DIR, pasta);
  if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
  return abs;
}

function slugify(str) {
  const s = String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return s || 'sem_id';
}

function txtSimplesFromItens(itens) {
  const setores = new Set();
  itens.forEach((it) => { if (it.setor) setores.add(it.setor); });
  const setorTxt = setores.size ? [...setores].join(', ') : '(vários / não informado)';
  const linhas = [`Setor: ${setorTxt}`, `Data: ${new Date().toLocaleString('pt-BR')}`, `Total de itens: ${itens.length}`, ''];
  itens.forEach((it) => {
    const patrimonio = it.patrimonio || '(sem número)';
    const tipo = it.tipo || it.descricao || '';
    linhas.push(`${patrimonio}${tipo ? ' ' + tipo : ''}`.trim());
  });
  return linhas.join('\r\n');
}

function csvCompletoFromItens(itens) {
  const cols = ['patrimonio', 'descricao', 'tipo', 'setor', 'geoLat', 'geoLng', 'origemSessaoLabel', 'criadoOriginalmenteEm', 'modificadoEm', 'ultimaConsultaEm'];
  const headers = ['Patrimônio', 'Descrição', 'Tipo', 'Setor', 'Latitude', 'Longitude', 'Cadastrado por', 'Criado originalmente em', 'Modificado em', 'Última consulta'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [headers.map(esc).join(';')];
  itens.forEach((it) => { linhas.push(cols.map((c) => esc(it[c])).join(';')); });
  return '﻿' + linhas.join('\r\n');
}

function lerCatalogo() {
  // NOVO (03/09/2026): `pastaDadosAtual()` no lugar de `DIR` direto — ver
  // comentário grande acima sobre a pasta de dados configurável.
  const p = path.join(pastaDadosAtual(), 'catalogo-unico.json');
  if (!fs.existsSync(p)) return { itens: [] };
  try {
    const dado = JSON.parse(fs.readFileSync(p, 'utf8'));
    return (dado && Array.isArray(dado.itens)) ? dado : { itens: [] };
  } catch (e) { return { itens: [] }; }
}

function salvarCatalogo(catalogo) {
  catalogo.atualizadoEm = new Date().toISOString();
  fs.writeFileSync(path.join(pastaDadosAtual(), 'catalogo-unico.json'), JSON.stringify(catalogo, null, 2), 'utf8');
}

// Grava em ARQUIVO TEMPORÁRIO + renomeia por cima do definitivo
// (fs.renameSync é atômico no mesmo sistema de arquivos) — usado nos 2
// arquivos NOVOS desta rodada (preferências/backup completo), que só são
// escritos raramente mas de uma vez só, cada um com um payload grande;
// um crash/queda de energia NO MEIO da escrita não pode deixar um JSON
// pela metade, ilegível, sendo o ÚNICO exemplar de "recuperar tudo" que o
// pedido do usuário existe pra proteger. Os arquivos já existentes (item
// individual/catalogo-unico) continuam com `writeFileSync` direto, sem
// mudar o comportamento de antes desta rodada (fora do escopo pedido).
function salvarArquivoAtomico(caminho, conteudo) {
  const tmp = `${caminho}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, conteudo, 'utf8');
  fs.renameSync(tmp, caminho);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405); res.end(JSON.stringify({ erro: 'Use POST' })); return; }

  let corpo = '';
  req.on('data', (chunk) => { corpo += chunk; });
  req.on('end', () => {
    let data;
    try { data = JSON.parse(corpo); } catch (e) { res.writeHead(400); res.end(JSON.stringify({ erro: 'JSON inválido' })); return; }

    // ---------- 1) Salvamento automático de um item ----------
    if (data.acao === 'salvar-item') {
      const item = data.item;
      const modo = data.modoArquivo || 'unico';
      const formatoExtra = data.formatoExtra || 'nenhum';
      if (!item || !item.id) { res.writeHead(400); res.end(JSON.stringify({ erro: 'item ausente ou sem id' })); return; }

      const resultado = { ok: true, acao: 'salvar-item', modoArquivo: modo, caminhos: [] };

      const pastaDados = pastaDadosAtual(); // NOVO (03/09/2026) — ver comentário grande acima
      if (modo === 'individual' || modo === 'ambos') {
        const itensDir = path.join(pastaDados, 'itens');
        if (!fs.existsSync(itensDir)) fs.mkdirSync(itensDir, { recursive: true });
        const baseSlug = slugify(item.patrimonio);
        const nome = `${baseSlug !== 'sem_id' ? baseSlug + '__' : ''}${slugify(item.id)}.json`;
        const p = path.join(itensDir, nome);
        fs.writeFileSync(p, JSON.stringify(item, null, 2), 'utf8');
        resultado.arquivoIndividual = nome;
        resultado.caminhos.push(p);
      }

      const catalogo = lerCatalogo();
      const idx = catalogo.itens.findIndex((it) => it.id === item.id);
      if (idx >= 0) catalogo.itens[idx] = item; else catalogo.itens.push(item);
      salvarCatalogo(catalogo);
      resultado.totalNoCatalogoUnico = catalogo.itens.length;
      resultado.caminhos.push(path.join(pastaDados, 'catalogo-unico.json'));

      if (formatoExtra === 'txt-simples' || formatoExtra === 'ambos-formatos') {
        const p = path.join(pastaDados, 'catalogo-simples.txt');
        fs.writeFileSync(p, txtSimplesFromItens(catalogo.itens), 'utf8');
        resultado.caminhos.push(p);
      }
      if (formatoExtra === 'csv-completo' || formatoExtra === 'ambos-formatos') {
        const p = path.join(pastaDados, 'catalogo-completo.csv');
        fs.writeFileSync(p, csvCompletoFromItens(catalogo.itens), 'utf8');
        resultado.caminhos.push(p);
      }

      res.end(JSON.stringify(resultado));
      return;
    }

    // ---------- 2) Sincronização: listar itens para outros aparelhos puxarem ----------
    if (data.acao === 'listar') {
      let itens = lerCatalogo().itens;
      const desde = data.desde;
      if (desde) itens = itens.filter((it) => (it.modificadoEm || '') >= desde || (it.criadoEm || '') >= desde);
      res.end(JSON.stringify({ ok: true, itens, servidorEm: new Date().toISOString() }));
      return;
    }

    // ---------- 3) Importar objetos 3D (.obj) — basta criar a pasta
    // "objetos" ao lado deste receive.js e colocar arquivos .obj dentro. ----------
    if (data.acao === 'listarObjs') {
      const dirObjs = path.join(DIR, 'objetos');
      let arquivos = [];
      if (fs.existsSync(dirObjs)) {
        arquivos = fs.readdirSync(dirObjs)
          .filter((nome) => nome.toLowerCase().endsWith('.obj'))
          .map((nome) => ({ nome, conteudo: fs.readFileSync(path.join(dirObjs, nome), 'utf8') }));
      }
      res.end(JSON.stringify({ ok: true, arquivos }));
      return;
    }

    // ---------- 4) NOVO (01/09/2026): preferências do usuário, EM ARQUIVO
    // SEPARADO (nunca dentro de catalogo-unico.json/itens/) — pedido
    // verbatim: "As configurações e opções de menu devem ser guardadas em
    // um arquivo a parte, algo como 'preferências do usuário'." `preferencias`
    // é um objeto chave->valor (mesmo formato de `DB.getAllSettings()`,
    // já filtrado no cliente pra só as chaves de PREFERÊNCIA de verdade —
    // ver js/serverprefs.js/`_CHAVES_PREFERENCIA_SERVIDOR` — nunca estado/
    // identidade/dado, mesmo critério já usado pelo botão "Redefinir
    // padrões do app"). ----------
    if (data.acao === 'salvar-preferencias') {
      const preferencias = data.preferencias;
      if (!preferencias || typeof preferencias !== 'object') { res.writeHead(400); res.end(JSON.stringify({ erro: 'preferencias ausente ou inválida' })); return; }
      const p = path.join(pastaDadosAtual(), 'preferencias-usuario.json'); // NOVO (03/09/2026)
      salvarArquivoAtomico(p, JSON.stringify({ preferencias, atualizadoEm: new Date().toISOString() }, null, 2));
      res.end(JSON.stringify({ ok: true, acao: 'salvar-preferencias', caminho: p }));
      return;
    }
    if (data.acao === 'carregar-preferencias') {
      const p = path.join(pastaDadosAtual(), 'preferencias-usuario.json');
      if (!fs.existsSync(p)) { res.end(JSON.stringify({ ok: true, preferencias: null, atualizadoEm: null })); return; }
      try {
        const dado = JSON.parse(fs.readFileSync(p, 'utf8'));
        res.end(JSON.stringify({ ok: true, preferencias: dado.preferencias || null, atualizadoEm: dado.atualizadoEm || null }));
      } catch (e) { res.end(JSON.stringify({ ok: true, preferencias: null, atualizadoEm: null })); }
      return;
    }

    // ---------- 5) NOVO (01/09/2026): backup completo recuperável — pedido
    // verbatim: "Deve ser possível guardar em uma pasta dentro do projeto
    // (para caso se exclua os dados do navegador e não se tenha
    // 'exportado', então, seja possível recuperar tudo)." `backup` chega
    // pronto do cliente no MESMO formato de `DB.exportAll()` (o mesmo JSON
    // que o botão "⬇️ Exportar backup" já gera hoje) — este servidor só
    // guarda/devolve, sem entender/validar o conteúdo (mesma filosofia dos
    // itens acima: o app já sabe importar esse formato de volta, ver
    // js/app.js importBackupData). ----------
    if (data.acao === 'salvar-backup-completo') {
      const backup = data.backup;
      if (!backup || typeof backup !== 'object') { res.writeHead(400); res.end(JSON.stringify({ erro: 'backup ausente ou inválido' })); return; }
      const p = path.join(pastaDadosAtual(), 'backup-completo.json'); // NOVO (03/09/2026)
      salvarArquivoAtomico(p, JSON.stringify(backup, null, 2));
      res.end(JSON.stringify({ ok: true, acao: 'salvar-backup-completo', caminho: p, totalItens: Array.isArray(backup.items) ? backup.items.length : undefined }));
      return;
    }
    if (data.acao === 'carregar-backup-completo') {
      const p = path.join(pastaDadosAtual(), 'backup-completo.json');
      if (!fs.existsSync(p)) { res.end(JSON.stringify({ ok: true, backup: null })); return; }
      try {
        const backup = JSON.parse(fs.readFileSync(p, 'utf8'));
        res.end(JSON.stringify({ ok: true, backup }));
      } catch (e) { res.end(JSON.stringify({ ok: true, backup: null })); }
      return;
    }

    // ---------- 6) NOVO (03/09/2026): status/configuração da pasta de dados
    // — pedido verbatim: "deve ser possível configurar. Por padrão é em uma
    // pasta dentro do app [...] Isto deve ficar claro visualmente." Devolve
    // o caminho ABSOLUTO real em disco (o navegador nunca saberia isso
    // sozinho) pra o app mostrar na tela de Configurações (ver
    // js/serverprefs.js/settings.js). ----------
    if (data.acao === 'status-armazenamento') {
      res.end(JSON.stringify({ ok: true, pastaDadosAtual: pastaDadosAtual(), pastaDadosPadrao: path.join(DIR, 'dados') }));
      return;
    }
    if (data.acao === 'configurar-pasta-dados') {
      const pastaNova = String(data.pastaDados || '').trim();
      const cfg = carregarConfig();
      if (pastaNova) cfg.pastaDados = pastaNova; else delete cfg.pastaDados; // string vazia = volta ao padrão
      salvarConfig(cfg);
      let caminhoFinal;
      try { caminhoFinal = pastaDadosAtual(); } catch (e) { res.writeHead(400); res.end(JSON.stringify({ erro: 'Não foi possível criar/acessar essa pasta: ' + e.message })); return; }
      res.end(JSON.stringify({ ok: true, acao: 'configurar-pasta-dados', pastaDadosAtual: caminhoFinal }));
      return;
    }

    // ---------- 7) Envio em lote (backup manual) — email automático NÃO
    // implementado nesta versão (só na PHP, que tem mail() nativo) ----------
    const dir = path.join(pastaDadosAtual(), 'recebidos'); // NOVO (03/09/2026): também dentro da pasta de dados
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fname = path.join(dir, `catalogo-${stamp}.json`);
    fs.writeFileSync(fname, JSON.stringify(data, null, 2), 'utf8');
    res.end(JSON.stringify({ ok: true, salvo: path.basename(fname), emailEnviado: false }));
  });
});

server.listen(PORTA, () => {
  console.log(`Servidor do Catalogação de Itens rodando em http://localhost:${PORTA}/`);
  console.log('Deixe esta janela aberta enquanto for usar o app (ou rode em segundo plano — este processo não depende de nenhum navegador aberto). Ctrl+C para parar.');
  // NOVO (03/09/2026) — deixa claro, já no boot, ONDE os arquivos estão
  // sendo gravados (pedido do usuário: "isto deve ficar claro visualmente" —
  // este log complementa o indicativo dentro do app, ver serverprefs.js/
  // settings.js).
  console.log(`Pasta de dados: ${pastaDadosAtual()} (configurável em server/config.json, chave "pastaDados", ou pelo próprio app em Configurações → Servidor local)`);
});
