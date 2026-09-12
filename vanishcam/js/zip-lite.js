'use strict';
/* ==========================================================================
   VanishCam — micro gerador de arquivos .zip, sem compressão (método STORE)
   e sem nenhuma biblioteca externa.

   --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO (mais recente primeiro)
   --------------------------------------------------------------------------
   Rodada 32 (2026-09-09): arquivo CRIADO — pedido do usuário: o botão
     "Baixar esta versão" (janela Sobre) usava até então um arquivo
     vanishcam-embed.zip ESTÁTICO, gerado por nós e guardado dentro da pasta
     do projeto — o usuário não queria esse arquivo extra ali (só duplicava
     o que já está na pasta, e ficaria desatualizado a cada rodada nova).
     Este arquivo monta o .zip DIRETO NO NAVEGADOR, a partir do conteúdo
     ATUAL dos arquivos (buscados via fetch no momento do clique — ver
     downloadEmbedZipBtn em js/ui-controls.js), então nunca fica
     desatualizado e nenhum arquivo extra precisa ficar salvo no projeto.
     Formato ZIP sem compressão é simples o bastante para não precisar de
     nenhuma biblioteca de deflate — o arquivo final é um pouco maior do que
     seria com compressão, mas o conteúdo (código-fonte texto, poucos KB) é
     pequeno o suficiente para isso não importar na prática.
   ========================================================================== */

// Tabela de CRC-32 (padrão usado pelo formato ZIP) — cada arquivo do pacote precisa do seu
// próprio CRC-32 nos cabeçalhos local e central, para o descompactador conseguir validar o
// conteúdo.
const ZIP_CRC_TABLE = (function(){
  const table = new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c = n;
    for(let k=0;k<8;k++){ c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    table[n] = c >>> 0;
  }
  return table;
})();
function zipCrc32(bytes){
  let crc = 0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++){
    crc = ZIP_CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Monta um Blob no formato .zip a partir de `files` — um array de {name, bytes}, onde `name` é o
// caminho dentro do .zip (ex.: "js/state.js") e `bytes` é um Uint8Array com o conteúdo do
// arquivo. Sem compressão (método 0 = STORE) — todo descompactador padrão (Windows, macOS, 7-Zip,
// etc.) sabe ler isso normalmente, é só um jeito mais simples de agrupar arquivos, não uma
// limitação do formato.
function buildZipStore(files){
  // Data/hora fixas no valor mínimo válido do formato DOS usado pelo ZIP (1980-01-01, meia-noite)
  // — o conteúdo empacotado é sempre "a versão atual agora", então a data exata de cada arquivo
  // dentro do .zip não importa para o propósito deste botão.
  const DOS_TIME = 0, DOS_DATE = 0x21;
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(f=>{
    const nameBytes = new TextEncoder().encode(f.name);
    const crc = zipCrc32(f.bytes);
    const size = f.bytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);   // assinatura do cabeçalho local
    lv.setUint16(4, 20, true);           // versão mínima necessária para extrair
    lv.setUint16(6, 0, true);            // flags gerais
    lv.setUint16(8, 0, true);            // método de compressão: 0 = STORE (sem compressão)
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);        // tamanho comprimido (= tamanho real, sem compressão)
    lv.setUint32(22, size, true);        // tamanho original
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // tamanho do campo "extra" (nenhum)
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, f.bytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);   // assinatura do cabeçalho do diretório central
    cv.setUint16(4, 20, true);           // versão de quem gerou o arquivo
    cv.setUint16(6, 20, true);           // versão mínima necessária para extrair
    cv.setUint16(8, 0, true);            // flags gerais
    cv.setUint16(10, 0, true);           // método de compressão
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);           // tamanho do campo "extra"
    cv.setUint16(32, 0, true);           // tamanho do comentário do arquivo
    cv.setUint16(34, 0, true);           // número do disco onde o arquivo começa
    cv.setUint16(36, 0, true);           // atributos internos
    cv.setUint32(38, 0, true);           // atributos externos
    cv.setUint32(42, offset, true);      // posição (offset) do cabeçalho local deste arquivo
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + f.bytes.length;
  });

  const centralStart = offset;
  const centralSize = centralParts.reduce((sum,p)=>sum+p.length, 0);

  // Fim do diretório central — o "índice" que todo leitor de .zip lê primeiro (procurando essa
  // assinatura a partir do FIM do arquivo) para saber quantos arquivos há e onde cada um começa.
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);             // número deste disco
  ev.setUint16(6, 0, true);             // disco onde o diretório central começa
  ev.setUint16(8, files.length, true);  // nº de arquivos neste disco
  ev.setUint16(10, files.length, true); // nº de arquivos, total
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true);            // tamanho do comentário do .zip

  return new Blob([...localParts, ...centralParts, eocd], {type:'application/zip'});
}
