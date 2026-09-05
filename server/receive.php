<?php
// receive.php — recebe os dados do app (POST JSON). Usos:
//   1) "salvar-item": salvamento automático de UM item por vez (chamado a cada
//      item confirmado na captura, se ativado nas configurações) — grava em
//      arquivo individual e/ou num único arquivo com o catálogo completo,
//      conforme o "modoArquivo" enviado pelo app. Vários PCs/celulares podem
//      chamar isso ao mesmo tempo com segurança: cada item tem um id
//      globalmente único (gerado no navegador), então dois aparelhos nunca
//      sobrescrevem o item um do outro — mesmo cadastrando o MESMO número de
//      patrimônio ao mesmo tempo, os dois catálogos ficam salvos separados.
//   2) "listar": usado pela sincronização entre aparelhos (sync.js) — devolve
//      os itens do catálogo central (catalogo-unico.json), opcionalmente só
//      os alterados a partir de um instante ("desde"), para cada aparelho
//      puxar o que os outros enviaram.
//   3) "salvar-preferencias" / "carregar-preferencias" — NOVO (03/09/2026),
//      mesma API de receive.js: configurações/opções de menu num arquivo
//      SEPARADO (preferencias-usuario.json) do catálogo de itens.
//   4) "salvar-backup-completo" / "carregar-backup-completo" — NOVO
//      (03/09/2026), mesma API de receive.js: espelha DB.exportAll() inteiro
//      (itens+tipos+setores+mapas+fotos+configurações) — "recuperar tudo"
//      se os dados do navegador forem apagados sem "exportar" antes.
//   5) "status-armazenamento" / "configurar-pasta-dados" — NOVO
//      (03/09/2026): consulta/altera a PASTA DE DADOS onde tudo acima é
//      gravado (padrão: server/dados/, configurável — ver pastaDadosAtual()
//      abaixo e config.json, mesmo arquivo/formato usado por receive.js).
//   6) envio em lote (email/backup manual) — mantém o comportamento anterior:
//      salva uma cópia e opcionalmente dispara email.
// Modo "servidor" é OPCIONAL — o app funciona inteiramente no navegador sem isto.
// Veja LEIA-ME-servidor.txt para instruções completas de instalação.
//
// IMPORTANTE: os cabeçalhos CORS/JSON abaixo vêm ANTES de qualquer outra coisa
// (inclusive antes de carregar config.php). Se isso viesse depois e config.php
// estivesse faltando ou desse erro, o PHP pararia ali sem nunca enviar o
// cabeçalho "Access-Control-Allow-Origin" — e o navegador reporta isso como um
// erro de CORS (mesmo o problema real sendo outro), fazendo o app "parar de
// funcionar" sem nenhuma mensagem clara. Por isso os headers vêm primeiro, e o
// config.php ausente também não derruba mais o script (vira apenas "sem email
// configurado").
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['erro' => 'Use POST']); exit; }

$configPath = __DIR__ . '/config.php';
if (file_exists($configPath)) {
  require_once $configPath;
} else {
  // Sem config.php ainda: salvamento automático e sincronização continuam
  // funcionando normalmente — só o envio automático de email fica desativado
  // até você criar o config.php (copie config.php.example e preencha).
  if (!defined('DESTINO_EMAIL')) define('DESTINO_EMAIL', '');
  if (!defined('EMAIL_REMETENTE')) define('EMAIL_REMETENTE', 'catalogo@localhost');
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data) { http_response_code(400); echo json_encode(['erro' => 'JSON inválido']); exit; }

function slugify($str) {
  $s = preg_replace('/[^A-Za-z0-9_-]+/', '_', (string) $str);
  return trim($s, '_') ?: 'sem_id';
}

// NOVO (03/09/2026) — Pedido do usuário: "Quando o app estiver rodando em um
// servidor, deve guardar os arquivos em uma pasta dentro do app (esta pasta
// pode ser em outro lugar, deve ser possível configurar. Por padrão é em uma
// pasta dentro do app)." Mesma ideia/mesmo arquivo `config.json` (chave
// "pastaDados") já usado pela versão Node deste servidor (ver receive.js) —
// os dois falam o mesmo formato, então trocar de PHP pra Node (ou vice-
// versa) mantém a pasta configurada. Antes desta rodada, receive.php também
// não tinha as ações "salvar-preferencias"/"salvar-backup-completo" que
// receive.js já tinha (de uma rodada anterior) — adicionadas agora, pra as
// duas versões (Node/PHP) oferecerem exatamente a mesma API.
function caminhoConfigJson() { return __DIR__ . '/config.json'; }

function carregarConfigJson() {
  $p = caminhoConfigJson();
  if (!file_exists($p)) return [];
  $dado = json_decode(file_get_contents($p), true);
  return is_array($dado) ? $dado : [];
}

function salvarConfigJson($cfg) {
  file_put_contents(caminhoConfigJson(), json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

// Relida a cada chamada (arquivo pequeno) pra "configurar-pasta-dados" valer
// na hora, sem precisar reiniciar nada (PHP não tem processo persistente
// mesmo, cada requisição já é nova).
function pastaDadosAtual() {
  $cfg = carregarConfigJson();
  $pasta = isset($cfg['pastaDados']) ? trim((string) $cfg['pastaDados']) : '';
  if ($pasta === '') $pasta = __DIR__ . '/dados';
  $abs = (strpos($pasta, '/') === 0 || preg_match('/^[A-Za-z]:[\\\\\/]/', $pasta)) ? $pasta : (__DIR__ . '/' . $pasta);
  if (!is_dir($abs)) mkdir($abs, 0777, true);
  return $abs;
}

// ---------- Formatos extras (derivados do catálogo, além do .json sempre mantido) ----------
// "Formato simples" (.txt): cabeçalho com setor(es) + data, uma linha por item
// com os campos/ordem escolhidos — mesma lógica de js/utils.js
// Utils.itemsToSimpleTxt(), pra ficar IGUAL ao gerado direto no navegador (em
// "👁️ Ver lista" ou nos downloads de sessão/catálogo). $campos e
// $organizarPorSetor vêm no payload de "salvar-item" (ver autosave.js —
// Utils.getTxtConfig()); sem eles (chamada antiga, ou nenhuma configuração
// salva ainda), cai no padrão de sempre: patrimônio + tipo, sem agrupar.
function valorCampoItemTxt($it, $chave) {
  if ($chave === 'patrimonio') return !empty($it['patrimonio']) ? $it['patrimonio'] : '(sem número)';
  if ($chave === 'descricao') return $it['descricao'] ?? '';
  if ($chave === 'tipo') return $it['tipo'] ?? '';
  if ($chave === 'setor') return $it['setor'] ?? '';
  return '';
}

function txtSimplesFromItens($itens, $campos = null, $organizarPorSetor = false) {
  $camposAtivos = [];
  if (is_array($campos) && count($campos)) {
    foreach ($campos as $c) { if (!empty($c['ativo']) && !empty($c['key'])) $camposAtivos[] = $c['key']; }
  }
  if (!count($camposAtivos)) $camposAtivos = ['patrimonio', 'tipo']; // padrão de fábrica

  $linhaDoItem = function ($it) use ($camposAtivos) {
    $partes = [];
    foreach ($camposAtivos as $chave) {
      $v = trim((string) valorCampoItemTxt($it, $chave));
      if ($v !== '') $partes[] = $v;
    }
    return count($partes) ? implode(' ', $partes) : (!empty($it['patrimonio']) ? $it['patrimonio'] : '(sem informação)');
  };

  $setores = [];
  foreach ($itens as $it) { if (!empty($it['setor'])) $setores[$it['setor']] = true; }
  $setorTxt = empty($setores) ? '(vários / não informado)' : implode(', ', array_keys($setores));
  $linhas = [];
  $linhas[] = 'Setor: ' . $setorTxt;
  $linhas[] = 'Data: ' . date('d/m/Y H:i');
  $linhas[] = 'Total de itens: ' . count($itens);
  $linhas[] = '';

  if ($organizarPorSetor) {
    $grupos = [];
    foreach ($itens as $it) {
      $chave = trim((string) ($it['setor'] ?? ''));
      if ($chave === '') $chave = '(sem setor / local)';
      if (!isset($grupos[$chave])) $grupos[$chave] = [];
      $grupos[$chave][] = $it;
    }
    $chaves = array_keys($grupos);
    sort($chaves, SORT_NATURAL | SORT_FLAG_CASE);
    $primeiro = true;
    foreach ($chaves as $chave) {
      if (!$primeiro) $linhas[] = '';
      $primeiro = false;
      $linhas[] = "--- $chave ---";
      foreach ($grupos[$chave] as $it) $linhas[] = $linhaDoItem($it);
    }
  } else {
    foreach ($itens as $it) $linhas[] = $linhaDoItem($it);
  }

  return implode("\r\n", $linhas);
}

// "Formato completo" (.csv): mesmas colunas de Utils.itemsToCSV, separador ";",
// com BOM pra acentuação abrir certo no Excel.
function csvCompletoFromItens($itens) {
  $cols = ['patrimonio', 'descricao', 'tipo', 'setor', 'geoLat', 'geoLng', 'origemSessaoLabel', 'origemDispositivoInfo', 'capturaIpPublico', 'criadoEm', 'modificadoEm', 'ultimaConsultaEm'];
  $headers = ['Patrimônio', 'Descrição', 'Tipo', 'Setor', 'Latitude', 'Longitude', 'Cadastrado por', 'Aparelho (SO/navegador)', 'IP público (rede)', 'Inserido em', 'Modificado em', 'Última consulta'];
  $esc = function ($v) { return '"' . str_replace('"', '""', (string) ($v ?? '')) . '"'; };
  $linhas = [implode(';', array_map($esc, $headers))];
  foreach ($itens as $it) {
    $linhas[] = implode(';', array_map(function ($c) use ($it, $esc) { return $esc($it[$c] ?? ''); }, $cols));
  }
  return "\xEF\xBB\xBF" . implode("\r\n", $linhas);
}

// ---------- 1) Salvamento automático de um item ----------
if (($data['acao'] ?? '') === 'salvar-item') {
  $item = $data['item'] ?? null;
  $modo = $data['modoArquivo'] ?? 'unico'; // individual | unico | ambos
  $formatoExtra = $data['formatoExtra'] ?? 'nenhum'; // nenhum | txt-simples | csv-completo | ambos-formatos
  $txtCampos = $data['txtCampos'] ?? null; // [{key, ativo}, ...] — ver Utils.getTxtConfig() no navegador
  $txtOrganizarPorSetor = !empty($data['txtOrganizarPorSetor']);
  if (!$item || empty($item['id'])) { http_response_code(400); echo json_encode(['erro' => 'item ausente ou sem id']); exit; }

  // "caminhos" reúne o caminho REAL no servidor de cada arquivo tocado nesta
  // chamada — é isso que o app mostra na mensagem "salvo em ..." (o
  // navegador nunca sabe esse caminho sozinho; só o servidor sabe onde está
  // gravando no disco dele).
  $resultado = ['ok' => true, 'acao' => 'salvar-item', 'modoArquivo' => $modo, 'caminhos' => []];
  $pastaDados = pastaDadosAtual(); // NOVO (03/09/2026)

  if ($modo === 'individual' || $modo === 'ambos') {
    $itensDir = $pastaDados . '/itens';
    if (!is_dir($itensDir)) mkdir($itensDir, 0777, true);
    // O nome do arquivo usa o ID ÚNICO do item (não só o patrimônio!) — assim,
    // se dois aparelhos catalogarem o MESMO número de patrimônio (ao mesmo
    // tempo ou não), cada catálogo vira um arquivo próprio, e nenhum some por
    // cima do outro.
    $baseSlug = slugify($item['patrimonio'] ?? '');
    $nome = ($baseSlug !== 'sem_id' ? $baseSlug . '__' : '') . slugify($item['id']);
    $path = $itensDir . '/' . $nome . '.json';
    file_put_contents($path, json_encode($item, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    $resultado['arquivoIndividual'] = basename($path);
    $resultado['caminhos'][] = realpath($path) ?: $path;
  }

  // catalogo-unico.json é SEMPRE mantido (independente do modo de arquivo
  // escolhido no app) — além de ser o arquivo combinado legível, ele é o
  // índice central usado pela sincronização entre aparelhos ("listar" abaixo).
  // O bloqueio (flock) garante que vários PCs/celulares gravando ao mesmo
  // tempo não corrompam o arquivo nem se pisem: cada gravação espera a
  // anterior liberar o arquivo. A comparação é sempre pelo ID único do item —
  // nunca pelo patrimônio — então dois catálogos do mesmo patrimônio nunca
  // se fundem em um só; ambos permanecem na lista.
  $catalogoPath = $pastaDados . '/catalogo-unico.json';
  $fp = fopen($catalogoPath, 'c+');
  if ($fp) {
    flock($fp, LOCK_EX);
    $existingRaw = stream_get_contents($fp);
    $catalogo = $existingRaw ? json_decode($existingRaw, true) : null;
    if (!is_array($catalogo) || !isset($catalogo['itens'])) $catalogo = ['itens' => []];
    $found = false;
    foreach ($catalogo['itens'] as &$it2) {
      if (($it2['id'] ?? null) === $item['id']) { $it2 = $item; $found = true; break; }
    }
    unset($it2);
    if (!$found) $catalogo['itens'][] = $item; // patrimônio repetido = catálogo próprio, mantém os dois
    $catalogo['atualizadoEm'] = date('c');
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($catalogo, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    $resultado['totalNoCatalogoUnico'] = count($catalogo['itens']);
    $resultado['caminhos'][] = realpath($catalogoPath) ?: $catalogoPath;

    // Formatos extras (opcionais) — regenerados por INTEIRO a partir do
    // catálogo atualizado, então sempre refletem todos os itens já salvos
    // (não só o item desta chamada).
    if ($formatoExtra === 'txt-simples' || $formatoExtra === 'ambos-formatos') {
      $txtPath = $pastaDados . '/catalogo-simples.txt';
      file_put_contents($txtPath, txtSimplesFromItens($catalogo['itens'], $txtCampos, $txtOrganizarPorSetor));
      $resultado['caminhos'][] = realpath($txtPath) ?: $txtPath;
    }
    if ($formatoExtra === 'csv-completo' || $formatoExtra === 'ambos-formatos') {
      $csvPath = $pastaDados . '/catalogo-completo.csv';
      file_put_contents($csvPath, csvCompletoFromItens($catalogo['itens']));
      $resultado['caminhos'][] = realpath($csvPath) ?: $csvPath;
    }
  }

  echo json_encode($resultado);
  exit;
}

// ---------- 2) Sincronização: listar itens para outros aparelhos puxarem ----------
if (($data['acao'] ?? '') === 'listar') {
  $catalogoPath = pastaDadosAtual() . '/catalogo-unico.json';
  $itens = [];
  if (file_exists($catalogoPath)) {
    $fp = fopen($catalogoPath, 'r');
    if ($fp) {
      flock($fp, LOCK_SH);
      $raw = stream_get_contents($fp);
      flock($fp, LOCK_UN);
      fclose($fp);
      $catalogo = json_decode($raw, true);
      if (is_array($catalogo) && isset($catalogo['itens'])) $itens = $catalogo['itens'];
    }
  }
  $desde = $data['desde'] ?? null;
  if ($desde) {
    $itens = array_values(array_filter($itens, function ($it) use ($desde) {
      return (($it['modificadoEm'] ?? '') >= $desde) || (($it['criadoEm'] ?? '') >= $desde);
    }));
  }
  echo json_encode(['ok' => true, 'itens' => $itens, 'servidorEm' => date('c')]);
  exit;
}

// ---------- 3) NOVO (03/09/2026): preferências do usuário, em arquivo
// SEPARADO — mesma ação/mesmo formato de receive.js (ver comentário grande
// lá), adicionada aqui pra receive.php oferecer a MESMA API. ----------
if (($data['acao'] ?? '') === 'salvar-preferencias') {
  $preferencias = $data['preferencias'] ?? null;
  if (!is_array($preferencias)) { http_response_code(400); echo json_encode(['erro' => 'preferencias ausente ou inválida']); exit; }
  $p = pastaDadosAtual() . '/preferencias-usuario.json';
  file_put_contents($p, json_encode(['preferencias' => $preferencias, 'atualizadoEm' => date('c')], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
  echo json_encode(['ok' => true, 'acao' => 'salvar-preferencias', 'caminho' => realpath($p) ?: $p]);
  exit;
}
if (($data['acao'] ?? '') === 'carregar-preferencias') {
  $p = pastaDadosAtual() . '/preferencias-usuario.json';
  if (!file_exists($p)) { echo json_encode(['ok' => true, 'preferencias' => null, 'atualizadoEm' => null]); exit; }
  $dado = json_decode(file_get_contents($p), true);
  echo json_encode(['ok' => true, 'preferencias' => $dado['preferencias'] ?? null, 'atualizadoEm' => $dado['atualizadoEm'] ?? null]);
  exit;
}

// ---------- 4) NOVO (03/09/2026): backup completo recuperável — mesma ação/
// mesmo formato de receive.js (espelha DB.exportAll() inteiro). ----------
if (($data['acao'] ?? '') === 'salvar-backup-completo') {
  $backup = $data['backup'] ?? null;
  if (!is_array($backup)) { http_response_code(400); echo json_encode(['erro' => 'backup ausente ou inválido']); exit; }
  $p = pastaDadosAtual() . '/backup-completo.json';
  file_put_contents($p, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
  echo json_encode(['ok' => true, 'acao' => 'salvar-backup-completo', 'caminho' => realpath($p) ?: $p, 'totalItens' => isset($backup['items']) && is_array($backup['items']) ? count($backup['items']) : null]);
  exit;
}
if (($data['acao'] ?? '') === 'carregar-backup-completo') {
  $p = pastaDadosAtual() . '/backup-completo.json';
  if (!file_exists($p)) { echo json_encode(['ok' => true, 'backup' => null]); exit; }
  $backup = json_decode(file_get_contents($p), true);
  echo json_encode(['ok' => true, 'backup' => $backup]);
  exit;
}

// ---------- 5) NOVO (03/09/2026): status/configuração da pasta de dados —
// pedido verbatim: "deve ser possível configurar. Por padrão é em uma pasta
// dentro do app [...] Isto deve ficar claro visualmente." ----------
if (($data['acao'] ?? '') === 'status-armazenamento') {
  echo json_encode(['ok' => true, 'pastaDadosAtual' => pastaDadosAtual(), 'pastaDadosPadrao' => __DIR__ . '/dados']);
  exit;
}
if (($data['acao'] ?? '') === 'configurar-pasta-dados') {
  $pastaNova = trim((string) ($data['pastaDados'] ?? ''));
  $cfg = carregarConfigJson();
  if ($pastaNova !== '') $cfg['pastaDados'] = $pastaNova; else unset($cfg['pastaDados']);
  salvarConfigJson($cfg);
  echo json_encode(['ok' => true, 'acao' => 'configurar-pasta-dados', 'pastaDadosAtual' => pastaDadosAtual()]);
  exit;
}

// ---------- 6) Envio em lote (backup/email manual) ----------
$dir = pastaDadosAtual() . '/recebidos'; // NOVO (03/09/2026): também dentro da pasta de dados
if (!is_dir($dir)) mkdir($dir, 0777, true);
$fname = $dir . '/catalogo-' . date('Y-m-d_H-i-s') . '.json';
file_put_contents($fname, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$enviado = false;
if (defined('DESTINO_EMAIL') && DESTINO_EMAIL) {
  $assunto = 'Catalogação de itens — ' . date('d/m/Y H:i');
  $corpo = ($data['textoAcompanhante'] ?? '') . "\n\n";
  foreach (($data['items'] ?? []) as $it) {
    $corpo .= "- Patrimônio: " . ($it['patrimonio'] ?? '—') . " | " . ($it['descricao'] ?? '') . "\n";
  }
  $headers = 'Content-Type: text/plain; charset=UTF-8' . "\r\n" . 'From: ' . (defined('EMAIL_REMETENTE') ? EMAIL_REMETENTE : 'catalogo@localhost');
  $enviado = @mail(DESTINO_EMAIL, $assunto, $corpo, $headers);
}

echo json_encode(['ok' => true, 'salvo' => basename($fname), 'emailEnviado' => $enviado]);
