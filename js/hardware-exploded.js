/* js/hardware-exploded.js
 * NOVO (28/09/2026) — pedido verbatim: "Ainda não está sendo possível interagir no 3D. Para
 * tirar a tampa do Gabinete e trocar peças no seu interior. [...] Preciso implementar um sistema
 * mecânico e interativo de um gabinete de computador detalhado em nível industrial/realista [...]
 * O gabinete não pode ser um bloco único. Ele deve ser um 'Exploded View Assembly' (Visão
 * Explodida/Montagem), onde o usuário pode interagir e montar/desmontar as peças reais através de
 * cliques na tela ou comandos na interface 2D/3D."
 *
 * HONESTIDADE DE ESCOPO — LEIA ANTES DE ACHAR QUE FALTA ALGO SEM EXPLICAÇÃO:
 * O pedido presume um modelo GLTF/GLB "detalhado em nível industrial/realista" com 8 sub-malhas
 * já modeladas (chapa_lateral_esquerda, painel_frontal, filtro_poeira_topo/inferior,
 * esqueleto_chassis, espelho_traseiro_i_o, gavetas_hd_ssd...). Esse ARQUIVO 3D não existe no
 * projeto (é trabalho de modelagem, não de programação, e nenhum modelador/artista 3D está
 * disponível aqui) -- então este módulo é o MOTOR completo (busca de nós, raycaster, estado,
 * animação de trilho, integração 2D/3D), desacoplado de qualquer malha específica:
 *   - Se `js/hardware-catalog.js`/perfil do objeto já apontar um `modeloArquivo` (.glb) carregável
 *     por `js/model3dloader.js` (ver honestidade de escopo NAQUELE arquivo -- é um parser próprio,
 *     não o GLTFLoader oficial) contendo nós com EXATAMENTE os nomes da tabela `PECAS_REMOVIVEIS`
 *     abaixo, o motor os usa direto via `getObjectByName` -- é só apontar o arquivo.
 *   - Enquanto isso não existir, `construirGabinetePlaceholder()` monta um grupo com uma caixa por
 *     peça (mesmas proporções/posições relativas de um gabinete ATX real), já com os MESMOS nomes
 *     de nó -- então TODA a interação (clicar, desmontar, montar, animação de trilho, luz interna)
 *     já funciona hoje, sem esperar o modelo definitivo; quando o .glb chegar, o motor não muda
 *     uma linha, só passa a herdar a geometria de verdade.
 *
 * PADRÃO UMD do projeto (ver `js/hardware-sim.js`/`js/rede-equip.js`) -- dá pra `require()` direto
 * em Node (testes de lerp/estado sem precisar de WebGL) e funciona normal no navegador via
 * `<script>` comum (`window.HardwareExploded`).
 */
(function (raiz) {
  'use strict';

  // ============================================================================================
  // 1) Tabela das peças removíveis — nome do NÓ na hierarquia 3D (convenção do pedido: minúsculo,
  //    snake_case, igual export comum de Blender) -> chave em `estadoGabinete` (camelCase, igual
  //    ao exemplo verbatim do pedido) -> "trilho" de desmontagem (eixo local + sentido + distância
  //    em metros que a peça percorre pra "sair" do gabinete, simulando o trilho/guia real).
  // ============================================================================================
  // [28/09/2026] Cada peça agora também carrega `caixaInteracao` -- as meia-dimensões (metros) de
  // um VOLUME DE INTERAÇÃO (não confundir com a malha visual, que continua fina/realista, ex. a
  // chapa lateral tem 6mm de espessura de verdade). Pedido verbatim (bug relatado): "As chapas
  // laterais devem ter o raycaster funcionais em qualquer ângulo. Atualmente tem que ficar bem de
  // frente para elas para montar/desmontar." CAUSA RAIZ: o raycaster de verdade (`THREE.Raycaster`
  // contra a malha real) só acerta uma chapa de 6mm quando o raio viaja quase exatamente ao longo
  // do eixo fino dela -- de qualquer outro ângulo (ex. olhando mais de frente pro gabinete, só de
  // "rabo de olho" pra chapa), o raio atravessa esse "papel" sem cruzar nunca os 6mm de espessura.
  // CORRIGIDO: a detecção de clique (`pecaSobRaio`, mais abaixo) passou a testar uma caixa
  // orientada (OBB) BEM mais grossa no eixo fino de cada peça (só pra fins de "o que foi
  // clicado" -- a malha desenhada continua fina/realista), mesma técnica (e mesmo código) que
  // `Engine3D.prototype._rayBoxT`/`rackParteSob` já usam em todo o resto do app pra objetos
  // grandes -- aqui só precisa ser mais generosa por serem peças finas de chapa.
  const PECAS_REMOVIVEIS = [
    { no: 'chapa_lateral_esquerda', chave: 'chapaLateralEsquerda', eixo: 'x', sentido: -1, distanciaM: 0.32, caixaInteracao: { x: 0.05, y: 0.22, z: 0.22 } },
    { no: 'chapa_lateral_direita', chave: 'chapaLateralDireita', eixo: 'x', sentido: 1, distanciaM: 0.32, caixaInteracao: { x: 0.05, y: 0.22, z: 0.22 } },
    // [28/09/2026] CORRIGIDO (bug relatado): "O painel frontal está tendo a animação para dentro.
    // Deveria ser para fora." -- o painel fica no lado Z NEGATIVO do gabinete (frente); sentido
    // ERRADO (+1) empurrava a posição Z em direção ao INTERIOR (z crescendo rumo a 0); sentido
    // CERTO (-1) empurra pra fora, afastando ainda mais da frente -- igual um bezel de verdade,
    // que se solta pra frente/longe do gabinete, não pra dentro dele.
    { no: 'painel_frontal', chave: 'painelFrontal', eixo: 'z', sentido: -1, distanciaM: 0.22, caixaInteracao: { x: 0.1, y: 0.22, z: 0.06 } },
    // [29/09/2026] REMOVIDO -- pedido verbatim: "A parte preta de cima, não deve sair." O nó
    // `filtro_poeira_topo` continua sendo CONSTRUÍDO (ver `construirGabinetePlaceholder`), só não
    // entra mais aqui -- sem entrada em `PECAS_REMOVIVEIS`, `ExplodedAssembly` nunca cria estado
    // pra ele (não anima, `pecaSobRaio` nunca o devolve como alvo de clique).
    { no: 'filtro_poeira_inferior', chave: 'filtroPoeiraInferior', eixo: 'y', sentido: -1, distanciaM: 0.12, caixaInteracao: { x: 0.095, y: 0.05, z: 0.2 } },
    // [28/09/2026] CORRIGIDO -- pedido novo: "a fonte deve ser posicionada em cima, o espelho deve
    // ser vertical e do lado em que, mesmo tirando a chapa, fica uma placa de alumínio no interior".
    // O espelho passou a morar no MESMO lado da bandeja da placa-mãe (x positivo, ver
    // `_construirEstruturaCentral`) e no fundo do gabinete (z positivo aqui -- a frente é z
    // negativo, ver `painel_frontal` acima); sentido CERTO pra sair é +1 (afasta do fundo, pra
    // fora), não -1 (empurrava pra dentro do chassi).
    { no: 'espelho_traseiro_i_o', chave: 'espelhoTraseiroIO', eixo: 'z', sentido: 1, distanciaM: 0.15, caixaInteracao: { x: 0.035, y: 0.11, z: 0.03 } },
    { no: 'gavetas_hd_ssd', chave: 'gavetasHdSsd', eixo: 'z', sentido: 1, distanciaM: 0.28, caixaInteracao: { x: 0.06, y: 0.08, z: 0.09 } },
  ];
  // `esqueleto_chassis` é a estrutura CENTRAL (não removível — é nela que todas as outras peças se
  // apoiam/encaixam), por isso fica de fora de `PECAS_REMOVIVEIS`, mas ainda é buscada e guardada
  // (útil pra quem quiser, por exemplo, destacá-la/dar highlight nela via Scripts quando as outras
  // peças forem tiradas — ver `estruturaCentral` no estado, abaixo).
  const NO_ESTRUTURA_CENTRAL = 'esqueleto_chassis';

  const DURACAO_ANIMACAO_MS = 650; // duração do "trilho" (desmontar/montar) — mesma ordem de grandeza da tampa (Scripts) e das portas (500ms), pra sensação consistente no app inteiro

  /** Easing simples (ease-out cúbico) — começa rápido, desacelera perto do fim, como uma peça
   *  freando contra o batente do trilho. Só matemática pura, sem depender de nenhuma lib de tween
   *  (pedido: "priorize JS puro se for simples"). */
  function easeOutCubic(t) { const u = 1 - t; return 1 - u * u * u; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ============================================================================================
  // 2) Geometria PLACEHOLDER do gabinete — só usada enquanto não existe um .glb de verdade
  //    carregado (ver "HONESTIDADE DE ESCOPO" no topo). Proporções aproximadas de um gabinete ATX
  //    médio (larg 0.21m x alt 0.45m x prof 0.45m).
  //
  //    [28/09/2026] PESQUISADO/REESCRITO -- pedido verbatim: "Pesquise em sites especializados
  //    sobre a arquitetura de gabinetes [...] Pesquise na internet como é a carcaça interna de um
  //    gabinete e replique de forma realista [...] o espelho traseiro removível com perfurações de
  //    acordo com uma placa-mãe comum do mercado [...] O painel frontal deve ser mais detalhado
  //    [...] entrada de CD/DVD, LEDs [...] entradas USB, som (verde), microfone (rosa)."
  //    Referências gerais de indústria consultadas (arquitetura ATX/gabinete, não um produto
  //    específico): bandeja da placa-mãe com pés separadores ("standoffs") no padrão de furação
  //    ATX (Wikipedia "ATX"; fóruns de hardware sobre distância dos standoffs); abertura do
  //    espelho traseiro de E/S (I/O shield) com ~159×44,5mm de vão pros conectores onboard
  //    (discussões técnicas de fabricantes de gabinete/placa sobre o recorte padrão ATX); e as
  //    cores convencionadas dos conectores de áudio do painel frontal/traseiro (verde = saída de
  //    som/fone, rosa = entrada de microfone -- convenção herdada do PC 99/AC'97, ainda usada hoje
  //    em qualquer placa-mãe comum). Não há acesso a um arquivo/imagem específico de fabricante
  //    aqui -- as proporções abaixo são fiéis à ARQUITETURA real (onde cada peça fica e como se
  //    relaciona), não a um modelo comercial exato.
  // ============================================================================================
  const COR_PLACEHOLDER = Object.freeze({
    chapa_lateral_esquerda: 0x3a3f47, chapa_lateral_direita: 0x3a3f47,
    painel_frontal: 0x14161a, filtro_poeira_topo: 0x1c1f24,
    esqueleto_chassis: 0x8a92a3, espelho_traseiro_i_o: 0xb9c0cc, gavetas_hd_ssd: 0x24272c,
  });

  // [29/09/2026] NOVO — pedido verbatim: "A parte de baixo do PC deve ser de alumínio e sem tampa
  // preta [...] As partes do chassis internas do gabinete devem ter a mesma cor de alumínio." 1
  // tom só de alumínio pra TUDO que é "estrutura"/"parte de baixo" (moldura, bandeja, parede
  // traseira, shroud da fonte, gaiola de drives E o painel inferior, que deixou de ser a "tampa
  // preta" de poeira) -- antes cada peça dessas tinha um cinza/preto ligeiramente diferente.
  const ALUMINIO_INTERNO = 0x9aa2ac;
  const ALUMINIO_OPTS = { metalness: 0.55, roughness: 0.4 };

  // [29/09/2026] NOVO — pedido verbatim: "Tanto as chapas laterais pretas quanto a chapa preta de
  // cima devem ter uma dobra de 1,3cm voltadas para a parte de trás do chassis do gabinete. De
  // modo que a dobra de cada chapa fique paralela a parte de trás do chassis" + "Os cantos das
  // dobras na parte de trás devem ter um recorte de modo que se encaixem como a moldura de um
  // quadro" + "Use geometria (não [notch]) para as dobras ficarem em 45°". `DOBRA_PROFUNDIDADE` é
  // o quanto a aba dobrada avança (1,3cm) -- numa esquadria de moldura de verdade, o corte a 45°
  // remove um triângulo retângulo cujos 2 catetos MEDEM exatamente essa profundidade (é assim que
  // as 2 abas perpendiculares se encontram formando uma única linha diagonal contínua no canto),
  // então o recorte não precisa mais de uma constante própria -- ver
  // `_abaLateralMitrada45`/`_abaTopoMitrada45` abaixo, que desenham essa diagonal de verdade com
  // `THREE.Shape`/`THREE.ExtrudeGeometry` (não é mais uma caixa reta encurtada).
  const DOBRA_ESPESSURA = 0.006; // mesma espessura de qualquer chapa do gabinete
  const DOBRA_PROFUNDIDADE = 0.013;

  /** [29/09/2026] NOVO — aba dobrada da chapa LATERAL (esquerda/direita), com corte a 45° de
   *  verdade (geometria, não caixa encurtada) na ponta de CIMA, onde encontra a aba da chapa de
   *  cima (`_abaTopoMitrada45`). As 2 chapas ficam finas no eixo Z (a aba "dobra" 90° e passa a
   *  encarar Z, igual a parede de trás) -- por isso o perfil 2D abaixo é desenhado no plano X/Y e
   *  extrudado em Z (`THREE.ExtrudeGeometry` extrude sempre ao longo de Z a partir de um
   *  `THREE.Shape` em X/Y — encaixe perfeito, sem precisar rotacionar nada depois).
   *  `sentidoParaDentro` = +1 (chapa esquerda, dobra avança em +X) ou -1 (chapa direita, -X).
   *  A base (ponta de baixo) fica RETA (sem corte) -- pedido não menciona dobra na chapa de baixo,
   *  então não há aba vizinha pra encontrar ali. */
  function _abaLateralMitrada45(THREE, cor, alturaPainel, profundidadePainel, sentidoParaDentro, opts) {
    const p = DOBRA_PROFUNDIDADE;
    const hMeio = alturaPainel / 2;
    const xNear = sentidoParaDentro * (DOBRA_ESPESSURA / 2); // encostado na face interna da chapa (linha de dobra)
    const xFar = sentidoParaDentro * (DOBRA_ESPESSURA / 2 + p); // ponta livre da aba
    const shape = new THREE.Shape();
    shape.moveTo(xNear, -hMeio);
    shape.lineTo(xFar, -hMeio);
    shape.lineTo(xFar, hMeio - p); // início do corte a 45° (a ponta livre recua `p` antes do topo)
    shape.lineTo(xNear, hMeio); // linha de dobra continua até o topo de verdade -- a DIAGONAL entre este ponto e o anterior é o corte de 45°
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: DOBRA_ESPESSURA, bevelEnabled: false, curveSegments: 1 });
    const mat = new THREE.MeshStandardMaterial(Object.assign({ color: cor, metalness: 0.8, roughness: 0.2, side: THREE.DoubleSide }, opts || {}));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = profundidadePainel / 2 - DOBRA_ESPESSURA; // extrude local (0..DOBRA_ESPESSURA) recentralizado na borda traseira da chapa
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** [29/09/2026] NOVO — aba dobrada da chapa de CIMA, com corte a 45° de verdade nas DUAS pontas
   *  (encontra uma aba lateral de cada lado, esquerda E direita) -- mesma técnica de
   *  `_abaLateralMitrada45` (Shape em X/Y extrudado em Z), só que a aba desce em -Y (dobra pra
   *  baixo, rumo ao interior) em vez de avançar em X. */
  function _abaTopoMitrada45(THREE, cor, larguraPainel, profundidadePainel, opts) {
    const p = DOBRA_PROFUNDIDADE;
    const xMeio = larguraPainel / 2;
    const yNear = -(DOBRA_ESPESSURA / 2); // face interna da chapa de cima (linha de dobra)
    const yFar = -(DOBRA_ESPESSURA / 2 + p); // ponta livre da aba
    const shape = new THREE.Shape();
    shape.moveTo(-xMeio + p, yFar); // corte a 45° do canto ESQUERDO já feito (ponta livre recua `p`)
    shape.lineTo(xMeio - p, yFar); // corte a 45° do canto DIREITO já feito
    shape.lineTo(xMeio, yNear); // diagonal até a linha de dobra, no canto direito de verdade
    shape.lineTo(-xMeio, yNear); // linha de dobra continua até o canto esquerdo de verdade -- e a diagonal de volta ao 1º ponto fecha o corte esquerdo
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: DOBRA_ESPESSURA, bevelEnabled: false, curveSegments: 1 });
    const mat = new THREE.MeshStandardMaterial(Object.assign({ color: cor, metalness: 0.8, roughness: 0.2, side: THREE.DoubleSide }, opts || {}));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = profundidadePainel / 2 - DOBRA_ESPESSURA;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Cria 1 `THREE.Mesh` (caixa) com material PBR e sombra ligada -- função de baixo nível
   *  reaproveitada por TODOS os montadores de peça abaixo (estrutura interna, espelho furado,
   *  painel frontal detalhado...), pra não repetir a mesma configuração de material/sombra em
   *  cada um. `opts` sobrescreve metalness/roughness/emissive por peça. */
  function _caixa(THREE, cor, largura, altura, profundidade, x, y, z, opts) {
    const mat = new THREE.MeshStandardMaterial(Object.assign({ color: cor, metalness: 0.8, roughness: 0.2 }, opts || {}));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(largura, altura, profundidade), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  function _cilindro(THREE, cor, raio, altura, x, y, z, rotEixoX, opts) {
    const mat = new THREE.MeshStandardMaterial(Object.assign({ color: cor, metalness: 0.6, roughness: 0.35 }, opts || {}));
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, altura, 14), mat);
    mesh.position.set(x, y, z);
    if (rotEixoX) mesh.rotation.x = Math.PI / 2; // deitado (eixo do cilindro apontando em Z) -- usado pros pinos "standoff" (em pé, padrão) e pros botões/LEDs redondos do painel (deitado, apontando pra fora do gabinete)
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** [29/09/2026] NOVO — chapa lateral (esquerda OU direita) com a aba dobrada na borda traseira,
   *  agora com corte a 45° DE VERDADE (`_abaLateralMitrada45`, ver comentário grande de
   *  `DOBRA_PROFUNDIDADE` acima). A chapa em si é
   *  fina no eixo X (fica "de pé", encarando X); a aba dobra 90° na borda traseira (Z positivo) e
   *  passa a encarar Z -- igual a parede de trás do chassi --, avançando `DOBRA_PROFUNDIDADE` em
   *  direção ao INTERIOR do gabinete (eixo X, rumo a x=0). `sentidoParaDentro` = +1 se "pra dentro"
   *  é +X (chapa esquerda) ou -1 se é -X (chapa direita). Devolve um `THREE.Group` já posicionado
   *  em `x` (mesma convenção de posição de sempre — quem chama não precisa saber que agora é um
   *  Group, não 1 Mesh só). */
  function _chapaLateralComDobra(THREE, cor, x, sentidoParaDentro, opts) {
    const g = new THREE.Group();
    const alturaPainel = 0.44, profundidadePainel = 0.44;
    g.add(_caixa(THREE, cor, 0.006, alturaPainel, profundidadePainel, 0, 0, 0, opts));
    g.add(_abaLateralMitrada45(THREE, cor, alturaPainel, profundidadePainel, sentidoParaDentro, opts));
    g.position.set(x, 0, 0);
    return g;
  }

  /** [29/09/2026] NOVO — mesma ideia de `_chapaLateralComDobra`, só que pra chapa de CIMA (fina no
   *  eixo Y, encarando Y) -- a aba dobra pra baixo (rumo ao interior, -Y) na borda traseira. */
  function _chapaTopoComDobra(THREE, cor, y, opts) {
    const g = new THREE.Group();
    const larguraPainel = 0.19, profundidadePainel = 0.4;
    g.add(_caixa(THREE, cor, larguraPainel, 0.006, profundidadePainel, 0, 0, 0, opts));
    g.add(_abaTopoMitrada45(THREE, cor, larguraPainel, profundidadePainel, opts));
    g.position.set(0, y, 0);
    return g;
  }

  /** [28/09/2026] NOVO — "esqueleto_chassis" deixou de ser uma caixa cinza única. Pedido verbatim:
   *  "Ao tirar as chapas laterais e o painel frontal, fica uma caixa cinza. Não deve ser
   *  simplesmente uma caixa cinza, deve ser a estrutura de alumínio interna, podendo ver o
   *  interior do gabinete. Inspire-se no objeto Rack." (o Rack -- `js/rack-modular.js`/
   *  `_buildRackMesh` -- também é montado como VÁRIAS peças finas/estrutura, nunca um bloco só).
   *  Monta a ARQUITETURA real de dentro de um gabinete ATX (pesquisa no topo do arquivo):
   *    - 4 colunas + 2 travessas (superior/inferior) = a "moldura" de alumínio que dá forma ao
   *      chassi -- é isso que fica visível quando as chapas saem, não mais um bloco sólido.
   *    - Bandeja da placa-mãe: uma placa vertical fina encostada no lado DIREITO (é o lado
   *      convencional -- o painel que normalmente abre pra acesso/manutenção é o ESQUERDO, ficando
   *      os componentes montados contra o direito) + pinos "standoff" (separadores rosca-fêmea de
   *      verdade existem pra isolar a placa-mãe eletricamente do chassi) num padrão retangular
   *      aproximado do furação ATX (9 furos usuais).
   *    - Shroud (cobertura) da fonte: caixa baixa no canto INFERIOR-TRASEIRO -- é onde a PSU ATX
   *      fica alojada e é normal ficar parcialmente encoberta por uma chapa própria, separada do
   *      resto do interior.
   *    - Gaiola de drives: suporte fixo próximo da frente-baixo pra onde as GAVETAS removíveis
   *      (`gavetas_hd_ssd`, peça própria já existente) deslizam -- a gaiola em si NÃO é removível
   *      (por isso mora dentro da estrutura central, não em `PECAS_REMOVIVEIS`).
   *  Devolve um `THREE.Group` nomeado `esqueleto_chassis` (mesmo nome de nó de sempre -- resto do
   *  motor não muda nada, `ExplodedAssembly` só precisa achar ESSE nome, não importa se por baixo
   *  é 1 malha ou uma dúzia). */
  function _construirEstruturaCentral(THREE) {
    const g = new THREE.Group();
    g.name = NO_ESTRUTURA_CENTRAL;
    const alumínio = ALUMINIO_OPTS;
    const add = (m) => g.add(m);

    // Moldura: 4 colunas verticais (quinas) + travessas de cima/baixo -- perfil fino (barra "L" de
    // verdade seria chanfrada; aqui uma barra reta já comunica "estrutura", não "caixa sólida").
    const meiaL = 0.09, meiaP = 0.2, h = 0.42;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      add(_caixa(THREE, ALUMINIO_INTERNO, 0.012, h, 0.012, sx * meiaL, 0, sz * meiaP, alumínio));
    });
    [-1, 1].forEach((sy) => {
      add(_caixa(THREE, ALUMINIO_INTERNO, meiaL * 2, 0.012, meiaP * 2, 0, sy * (h / 2 - 0.006), 0, alumínio));
    });

    // Bandeja da placa-mãe -- placa vertical fina encostada no lado direito (x positivo).
    const bandeja = _caixa(THREE, ALUMINIO_INTERNO, 0.006, 0.36, 0.34, meiaL - 0.006, -0.02, 0, alumínio);
    bandeja.name = 'bandeja_placa_mae';
    add(bandeja);
    // Pinos "standoff" -- padrão retangular aproximado (9 furos, formato ATX comum), saindo da
    // bandeja em direção ao centro do gabinete (eixo X).
    const colunasStandoff = [-0.13, -0.02, 0.09, 0.15];
    const linhasStandoff = [-0.15, -0.02, 0.11, 0.16];
    let i = 0;
    linhasStandoff.forEach((z) => {
      colunasStandoff.forEach((y) => {
        if (i === 5 && z === 0.16) return; // pula 1 furo -- padrão ATX real não é uma grade cheia/retangular perfeita, tem furos "faltando" nos cantos
        add(_cilindro(THREE, 0xb8bec8, 0.0035, 0.012, meiaL - 0.012, y, z, false, { metalness: 0.9, roughness: 0.25 }));
        i++;
      });
    });

    // [29/09/2026] NOVO — parede traseira do chassi -- pedido verbatim: "a parte de trás do
    // chassis desapareceu" (nunca existiu de fato uma parede ali, só a moldura/postes -- ESTA é a
    // correção). Fecha o vão entre os postes/travessas traseiros (mesmo Z, mesma altura `h`, então
    // encosta nos dois sem deixar vão -- pedido: "as conexões entre as partes do chassis não devem
    // ficar 'no ar'"). Só cobre até `meiaL - 0.02` no lado da bandeja (x positivo) -- o restante
    // daquele canto já é coberto pela própria bandeja + espelho traseiro (ver
    // `_construirEspelhoTraseiro`/posição em `construirGabinetePlaceholder`), então a parede não
    // avança até lá pra não atravessar/sobrepor essas 2 peças.
    const paredeLargura = 2 * meiaL - 0.02, paredeX = -0.01;
    add(_caixa(THREE, ALUMINIO_INTERNO, paredeLargura, h, 0.008, paredeX, 0, meiaP, alumínio));

    // Janela de abertura pra fonte -- pedido verbatim: "A parte de cima da parte de trás do
    // chassis (onde é encaixada a fonte) deve ter uma janela de abertura para que a fonte
    // preencha. Esta janela deve entrar para dentro (em cima) 1,3cm em relação a chapa de cima do
    // gabinete. Do lado da lateral que tem a chapa de alumínio dentro do chassis, a janela deve
    // entrar 2cm. Do lado da lateral que não tem a chapa de alumínio dentro do chassis, a janela
    // deve entrar para dentro 2,6cm." -- 3 reentrâncias (não é do tamanho da fonte; a PSU de
    // verdade tem uma aba/flange que cobre essas bordas recuadas, "preenchendo" por cima).
    const janelaTopo = h / 2 - 0.013; // recuo de 1,3cm da chapa de cima
    const janelaAltura = 0.1; // mesma altura do shroud da fonte, abaixo
    const janelaXBandeja = meiaL - 0.02; // recuo de 2cm do lado da bandeja (== borda direita da própria parede, ver acima)
    const janelaXOutroLado = -meiaL + 0.026; // recuo de 2,6cm do lado sem bandeja
    const janelaLargura = janelaXBandeja - janelaXOutroLado;
    const janelaXCentro = (janelaXBandeja + janelaXOutroLado) / 2;
    const janelaYCentro = janelaTopo - janelaAltura / 2;
    add(_caixa(THREE, 0x05050a, janelaLargura, janelaAltura, 0.02, janelaXCentro, janelaYCentro, meiaP, { metalness: 0.1, roughness: 0.9 }));

    // Furos de parafuso da fonte, nos 4 cantos da janela -- pedido novo: "As reentrâncias da
    // janela da fonte devem ser tais que se possa colocar os parafusos da fonte para segurá-la [...]
    // Na maioria dos chassis, o parafuso da parte de cima do lado da lateral que tem a chapa de
    // alumínio dentro, é um pouco mais para dentro ainda." -- o furo superior do lado da bandeja
    // (x positivo) fica deslocado mais 0,6cm pra dentro (rumo a x menor) que os outros 3.
    const margemParafuso = 0.008;
    const furosParafuso = [
      { x: janelaXOutroLado + margemParafuso, y: janelaTopo - margemParafuso },
      { x: janelaXBandeja - margemParafuso - 0.006, y: janelaTopo - margemParafuso }, // superior do lado da bandeja -- mais pra dentro ainda
      { x: janelaXOutroLado + margemParafuso, y: janelaYCentro - janelaAltura / 2 + margemParafuso },
      { x: janelaXBandeja - margemParafuso, y: janelaYCentro - janelaAltura / 2 + margemParafuso },
    ];
    furosParafuso.forEach((p) => add(_cilindro(THREE, 0x1a1a1c, 0.0028, 0.01, p.x, p.y, meiaP, false, { metalness: 0.3, roughness: 0.7 })));

    // Shroud da fonte -- pedido novo: "a fonte deve ser posicionada em cima" (bastante gabinete
    // ATX moderno já monta a PSU no topo-traseiro, não mais embaixo -- ver também a âncora
    // `PERFIL_SLOTS.pc_gabinete.fonte` em `js/hardware-sim.js`, y=0.38, já perto do topo dentro do
    // espaço local do simulador de montagem -- este placeholder visual segue a MESMA ideia).
    // Alinhado com a janela acima (mesmo Y central, e largura MAIOR que a janela — "ainda sim, a
    // fonte deve preencher aquele espaço", a aba da PSU cobre as reentrâncias) e encostado na
    // parede (sem vão -- "não devem ficar no ar").
    add(_caixa(THREE, ALUMINIO_INTERNO, meiaL * 2 - 0.02, janelaAltura, 0.12, 0, janelaYCentro, meiaP - 0.06, alumínio));

    // Gaiola de drives (suporte FIXO -- diferente da gaveta removível `gavetas_hd_ssd`) -- perto da
    // frente-baixo, feita de 2 trilhos finos horizontais (onde a gaveta desliza) + 1 parede lateral.
    const gaiolaZ = -meiaP + 0.09;
    add(_caixa(THREE, ALUMINIO_INTERNO, meiaL * 1.1, 0.006, 0.14, -0.01, -0.02, gaiolaZ, alumínio));
    add(_caixa(THREE, ALUMINIO_INTERNO, meiaL * 1.1, 0.006, 0.14, -0.01, -0.16, gaiolaZ, alumínio));
    add(_caixa(THREE, ALUMINIO_INTERNO, 0.006, 0.16, 0.14, -0.01 - meiaL * 0.55, -0.09, gaiolaZ, alumínio));

    return g;
  }

  /** [28/09/2026] NOVO — espelho traseiro de E/S (I/O shield) com as perfurações de verdade em vez
   *  de um bloco sólido. Pedido: "espelho traseiro removível com perfurações de acordo com uma
   *  placa-mãe comum do mercado [...] pesquise sobre isso também como é o espelho para as conexões
   *  onboard da placa-mãe". Toda placa ATX comum tem, na parte de trás: uma pilha de portas USB (2
   *  a 4, empilhadas em 2 alturas), rede (RJ45, retangular maior), vídeo (HDMI/DisplayPort, mais
   *  estreitos e compridos) e uma fileira de conectores de áudio redondos (3 a 6 furos). Aqui: uma
   *  placa metálica fina com recortes ESCUROS (simulando furo vazado) nesse padrão -- não é o
   *  recorte exato de nenhum modelo comercial, mas segue a MESMA lógica de organização (USB
   *  empilhado + rede + vídeo + áudio em fileira) que qualquer placa-mãe comum do mercado usa. */
  // [28/09/2026] NOVO — catálogo de variantes reais de espelho traseiro (ATX I/O shield),
  // pesquisado por família de placa-mãe (arquitetura real, não um produto específico):
  //   - 'padrao'      -- placa-mãe atual comum de mercado: USB empilhado + RJ45 + vídeo
  //                       (HDMI+DisplayPort) + fileira de áudio (verde/rosa/pretos).
  //   - 'legado'       -- placa mais antiga/econômica: acrescenta os 2 conectores redondos PS/2
  //                       (roxo = teclado, verde = mouse -- convenção PC99 ainda documentada em
  //                       qualquer guia de "legacy ports") + 1 porta serial DB9, com menos USB e
  //                       sem vídeo digital (só VGA).
  //   - 'workstation'  -- placa de servidor/estação de trabalho: 2x RJ45 (rede redundante/dupla
  //                       NIC, padrão comum em boards de servidor), mais portas USB, sem áudio
  //                       (comum em boards server-grade, que dispensam saída de som).
  const ESPELHO_IO_TIPOS = ['padrao', 'legado', 'workstation'];
  function _construirEspelhoTraseiro(THREE, tipo) {
    const t = ESPELHO_IO_TIPOS.indexOf(tipo) >= 0 ? tipo : 'padrao';
    const g = new THREE.Group();
    g.name = 'espelho_traseiro_i_o';
    g.userData.tipoEspelhoIO = t;
    const placaMat = { metalness: 0.85, roughness: 0.15 };
    const furoMat = { metalness: 0.1, roughness: 0.9, emissive: 0x000000 };
    // Placa VERTICAL (pedido: "o espelho deve ser vertical") -- mais alta do que larga, encostada
    // na bandeja da placa-mãe (ver `_construirEstruturaCentral`/posição em
    // `construirGabinetePlaceholder`, que fica no MESMO lado x positivo desta placa).
    const base = _caixa(THREE, COR_PLACEHOLDER.espelho_traseiro_i_o, 0.004, 0.16, 0.05, 0, 0, 0, placaMat);
    g.add(base);
    // Eixo "ao longo da placa" agora é Y (vertical) -- linhas de conectores empilhadas de baixo
    // pra cima, cada linha com sua largura no eixo Z (profundidade da placa).
    const linha = (yBase, itens) => itens.forEach(([cor, dz, w, hh, emis]) => {
      g.add(_caixa(THREE, cor, 0.006, hh, w, 0, yBase, dz, Object.assign({}, furoMat, emis ? { emissive: cor, emissiveIntensity: 0.15 } : {})));
    });
    if (t === 'padrao') {
      linha(0.055, [[0x0a0a0c, -0.012, 0.02, 0.018, false], [0x0a0a0c, 0.012, 0.02, 0.018, false]]); // USB empilhado (2 alturas)
      linha(0.015, [[0x0a0a0c, -0.01, 0.018, 0.014, false]]); // RJ45
      linha(-0.02, [[0x0a0a0c, -0.014, 0.022, 0.006, false], [0x0a0a0c, 0.01, 0.018, 0.005, false]]); // HDMI + DisplayPort
      const coresAudio = [0x1a1a1c, 0x1a1a1c, 0x3fae4a, 0xd6668f];
      coresAudio.forEach((cor, idx) => g.add(_cilindro(THREE, cor, 0.003, 0.006, 0, -0.06, -0.02 + idx * 0.009, false, { metalness: 0.3, roughness: 0.5, emissive: cor, emissiveIntensity: 0.15 })));
    } else if (t === 'legado') {
      // PS/2 -- 2 conectores redondos empilhados: roxo (teclado) + verde (mouse), convenção PC99.
      g.add(_cilindro(THREE, 0x6a4fb0, 0.006, 0.006, 0, 0.06, -0.015, false, { metalness: 0.5, roughness: 0.4, emissive: 0x6a4fb0, emissiveIntensity: 0.1 }));
      g.add(_cilindro(THREE, 0x3fae4a, 0.006, 0.006, 0, 0.06, 0.015, false, { metalness: 0.5, roughness: 0.4, emissive: 0x3fae4a, emissiveIntensity: 0.1 }));
      linha(0.03, [[0x0a0a0c, 0, 0.02, 0.014, false]]); // 1 única porta USB
      linha(0.0, [[0x0a0a0c, -0.01, 0.018, 0.014, false]]); // RJ45
      g.add(_caixa(THREE, 0x8a92a3, 0.006, 0.012, 0.018, 0, -0.03, -0.005, { metalness: 0.6, roughness: 0.3 })); // VGA (trapézio aproximado por caixa)
      g.add(_caixa(THREE, 0x0a0a0c, 0.006, 0.008, 0.014, 0, -0.055, 0.01, furoMat)); // serial DB9
    } else { // workstation
      linha(0.05, [[0x0a0a0c, -0.01, 0.02, 0.014, false]]); // RJ45 #1
      linha(0.015, [[0x0a0a0c, -0.01, 0.02, 0.014, false]]); // RJ45 #2 (dupla NIC)
      linha(-0.02, [[0x0a0a0c, -0.012, 0.018, 0.016, false], [0x0a0a0c, 0.01, 0.018, 0.016, false]]); // mais USB, sem áudio/vídeo digital
      g.add(_caixa(THREE, 0x8a92a3, 0.006, 0.012, 0.018, 0, -0.055, -0.005, { metalness: 0.6, roughness: 0.3 })); // VGA (gerência remota/IPMI)
    }
    return g;
  }

  /** [29/09/2026] REESCRITO — pedido verbatim: "O painel frontal da gabinete deve ser oco e
   *  visível. Não deve ser simplesmente uma superfície plana ali, mas sim deve ser aberto para
   *  poder ver os botões, conexões do painel e LEDs, por trás do painel frontal do gabinete, com
   *  ele estando afastado do restante do gabinete, na visão explodida." O painel frontal deixou de
   *  ser 1 bezel sólido com os botões/LEDs colados nele: virou 2 peças separadas --
   *    - `_construirPainelFrontalMoldura` (esta função, nó `'painel_frontal'`, REMOVÍVEL, é a que
   *      anima no trilho) — só a moldura externa (borda + aro da baia 5.25"), com um vão grande
   *      ABERTO no meio (sem "superfície plana" nenhuma cobrindo o miolo).
   *    - `_construirPainelFrontalInterno` (abaixo, FIXO no chassi, nunca sai) — os botões/LEDs/
   *      baia/USB/áudio, que ficam parados no lugar quando a moldura é puxada pra fora -- exatamente
   *      o "ver os botões, LEDs por trás, com ele afastado" pedido.
   *  `botao_power`/`led_power`/`led_atividade` continuam com os MESMOS nomes de sempre (agora
   *  dentro do miolo fixo) -- `botaoPowerSobRaio`/`_atualizarLeds` não precisaram mudar 1 linha. */
  function _construirPainelFrontalMoldura(THREE) {
    const g = new THREE.Group();
    g.name = 'painel_frontal';
    const plasticoBase = { metalness: 0.08, roughness: 0.8 };
    // Moldura externa (borda) -- MESMAS 4 tiras de sempre, só que agora SÃO o painel (não mais uma
    // decoração por cima de uma caixa sólida de fundo -- não existe mais caixa de fundo nenhuma).
    [[-0.098, 0], [0.098, 0], [0, 0.218], [0, -0.218]].forEach(([x, y]) => {
      const horizontal = y !== 0;
      g.add(_caixa(THREE, COR_PLACEHOLDER.painel_frontal, horizontal ? 0.2 : 0.02, horizontal ? 0.02 : 0.44, 0.014, x, y, 0, plasticoBase));
    });
    // Aro fino ao redor da baia 5.25" -- fica na moldura (parte "de fora"), mas sem tampar o vão:
    // só uma borda decorativa em volta do buraco da baia (a baia em si -- fenda/fresta -- é FIXA,
    // ver `_construirPainelFrontalInterno`, senão a bandeja de CD/DVD "sairia" junto com a moldura).
    [[-0.078, 0.16, 0.006, 0.045], [0.078, 0.16, 0.006, 0.045], [0, 0.1825, 0.15, 0.006], [0, 0.1375, 0.15, 0.006]].forEach(([x, y, w, hh]) => {
      g.add(_caixa(THREE, 0x0e0f12, w, hh, 0.01, x, y, -0.001, plasticoBase));
    });
    return g;
  }

  /** [29/09/2026] NOVO — miolo FIXO do painel frontal (botões, LEDs, baia de CD/DVD, USB/áudio) --
   *  ver comentário grande de `_construirPainelFrontalMoldura` acima. NÃO tem `.name` de peça
   *  removível (não entra em `PECAS_REMOVIVEIS`/`marcarPeca`) -- é adicionado direto na raiz do
   *  gabinete em `construirGabinetePlaceholder`, na MESMA posição em que a moldura nasce, só um
   *  pouco mais "pra dentro" em Z (mais perto do chassi) do que a moldura, pra ficar visível
   *  atrás dela quando a moldura estiver montada, e sobrar bem exposto quando ela for puxada pra
   *  fora (explodida). */
  function _construirPainelFrontalInterno(THREE) {
    const g = new THREE.Group();
    g.name = 'painel_frontal_interno';
    const plasticoBase = { metalness: 0.08, roughness: 0.8 };

    // Placa de fundo pequena só onde os componentes realmente precisam de apoio (NÃO é mais uma
    // superfície plana cobrindo o painel inteiro -- pedido: "não deve ser simplesmente uma
    // superfície plana ali").
    g.add(_caixa(THREE, 0x1c1f24, 0.1, 0.32, 0.006, -0.01, -0.03, 0.006, plasticoBase));

    // Baia 5.25" (entrada de CD/DVD) -- fenda horizontal recuada perto do topo (fica FIXA, não sai
    // junto com a moldura -- é a bandeja/mecanismo, presa no chassi).
    g.add(_caixa(THREE, 0x050506, 0.15, 0.035, 0.01, 0, 0.16, 0.004, { metalness: 0.2, roughness: 0.85 }));
    g.add(_caixa(THREE, 0x0a0a0c, 0.14, 0.006, 0.012, 0, 0.16, 0, { metalness: 0.3, roughness: 0.7 })); // fresta fina da bandeja em si

    // Botões — power (maior, centro) + reset (menor, ao lado), cilindros deitados (apontando pra
    // fora, -Z) com uma leve saliência. `botao_power` ganhou NOME próprio + raio um pouco maior --
    // pedido: "O Gabinete [...] deve estar apontando para o botão ligar/desligar. Use pixel
    // perfect para isso" -- `ExplodedAssembly.prototype.botaoPowerSobRaio` faz um raycast de
    // VERDADE (triângulo-a-triângulo, não o OBB grosso das tampas) só contra ESTA malha.
    const botaoPower = _cilindro(THREE, 0xd7dbe2, 0.015, 0.007, -0.02, 0.02, 0.009, true, { metalness: 0.7, roughness: 0.25 });
    botaoPower.name = 'botao_power';
    g.add(botaoPower);
    g.add(_cilindro(THREE, 0xaab0ba, 0.008, 0.005, 0.02, 0.02, 0.01, true, { metalness: 0.7, roughness: 0.3 })); // reset

    // LEDs — indicador de "PC ligado" (branco/azul) e "HD em uso" (vermelho), pontinhos emissivos
    // ao lado dos botões. Nomeados (`led_power`/`led_atividade`) -- `_atualizarLeds` acha estas
    // malhas por nome e muda `emissiveIntensity`/cor conforme `this.ligado`, mesmo espírito de
    // `RedeEquip.atualizarLeds`/`LED_ESTILOS` (js/rede-equip.js) pro Switch.
    const ledPower = _cilindro(THREE, 0x8fd4ff, 0.0035, 0.004, -0.045, 0.02, 0.009, true, { metalness: 0.1, roughness: 0.3, emissive: 0x2fa8ff, emissiveIntensity: 0 });
    ledPower.name = 'led_power';
    g.add(ledPower);
    const ledAtividade = _cilindro(THREE, 0xff8f8f, 0.0035, 0.004, -0.045, 0.008, 0.009, true, { metalness: 0.1, roughness: 0.3, emissive: 0xff3030, emissiveIntensity: 0 });
    ledAtividade.name = 'led_atividade';
    g.add(ledAtividade);

    // USB frontais (2 portas) + áudio verde/rosa -- fileira baixa, mesma convenção de cor do
    // espelho traseiro (PC99/AC'97: verde = saída/fone, rosa = microfone).
    [-0.01, 0.012].forEach((x) => g.add(_caixa(THREE, 0x0a0a0c, 0.014, 0.007, 0.008, x, -0.14, 0.011, { metalness: 0.2, roughness: 0.8 })));
    g.add(_cilindro(THREE, 0x3fae4a, 0.0045, 0.005, 0.035, -0.14, 0.01, true, { metalness: 0.3, roughness: 0.5, emissive: 0x3fae4a, emissiveIntensity: 0.2 })); // fone (verde)
    g.add(_cilindro(THREE, 0xd6668f, 0.0045, 0.005, 0.05, -0.14, 0.01, true, { metalness: 0.3, roughness: 0.5, emissive: 0xd6668f, emissiveIntensity: 0.2 })); // mic (rosa)

    return g;
  }

  /** Monta um `THREE.Group` "gabinete-exploded-view" com a geometria PLACEHOLDER completa (agora
   *  em VÁRIAS peças por nó, não mais 1 caixa por nó -- ver `_construirEstruturaCentral`/
   *  `_construirEspelhoTraseiro`/`_construirPainelFrontal` acima), cada NÓ RAIZ (o que
   *  `PECAS_REMOVIVEIS`/`NO_ESTRUTURA_CENTRAL` esperam) já com `.name` certo, pra `ExplodedAssembly`
   *  achar tudo com `getObjectByName` igual faria com o modelo definitivo. Devolve
   *  `{grupo, luzInterna}`. */
  function construirGabinetePlaceholder(THREE, tipoEspelhoIO) {
    const grupo = new THREE.Group();
    grupo.name = 'gabinete-exploded-view';

    function marcarPeca(no, nome) {
      no.name = nome;
      no.userData.pecaHardware = true;
      grupo.add(no);
      return no;
    }

    marcarPeca(_construirEstruturaCentral(THREE), NO_ESTRUTURA_CENTRAL);
    // [29/09/2026] Chapas laterais e de cima ganharam a dobra de 1,3cm na borda traseira (pedido:
    // "Tanto as chapas laterais pretas quanto a chapa preta de cima devem ter uma dobra de
    // 1,3cm..." -- ver `_chapaLateralComDobra`/`_chapaTopoComDobra` acima).
    marcarPeca(_chapaLateralComDobra(THREE, COR_PLACEHOLDER.chapa_lateral_esquerda, -0.105, 1, {}), 'chapa_lateral_esquerda');
    marcarPeca(_chapaLateralComDobra(THREE, COR_PLACEHOLDER.chapa_lateral_direita, 0.105, -1, {}), 'chapa_lateral_direita');
    marcarPeca(_construirPainelFrontalMoldura(THREE), 'painel_frontal').position.set(0, 0, -0.216);
    // [29/09/2026] "A parte preta de cima, não deve sair" -- `filtro_poeira_topo` deixou de estar
    // em `PECAS_REMOVIVEIS` (ver comentário lá), mas continua construído/nomeado normalmente aqui.
    marcarPeca(_chapaTopoComDobra(THREE, COR_PLACEHOLDER.filtro_poeira_topo, 0.223, { metalness: 0.3, roughness: 0.6 }), 'filtro_poeira_topo');
    // [29/09/2026] "A parte de baixo do PC deve ser de alumínio e sem tampa preta" -- cor trocada
    // pra `ALUMINIO_INTERNO` (mesma de toda a estrutura interna), sem dobra (só as 2 laterais + a
    // de cima ganharam dobra, pedido não menciona a de baixo).
    marcarPeca(_caixa(THREE, ALUMINIO_INTERNO, 0.19, 0.006, 0.4, 0, -0.223, 0, ALUMINIO_OPTS), 'filtro_poeira_inferior');
    // [28/09/2026] Espelho reposicionado -- MESMO lado x da bandeja da placa-mãe (`meiaL - 0.006`
    // em `_construirEstruturaCentral`, ~0.084), pra remover a chapa lateral direita e revelar
    // bandeja + espelho juntos, do jeito que um gabinete de verdade mostra ("do lado em que, mesmo
    // tirando a chapa, fica uma placa de alumínio no interior").
    marcarPeca(_construirEspelhoTraseiro(THREE, tipoEspelhoIO), 'espelho_traseiro_i_o').position.set(0.084, 0.06, 0.203);
    marcarPeca(_caixa(THREE, COR_PLACEHOLDER.gavetas_hd_ssd, 0.1, 0.14, 0.16, 0.03, -0.1, 0.06, { metalness: 0.6, roughness: 0.3 }), 'gavetas_hd_ssd');

    // [29/09/2026] NOVO — miolo FIXO do painel frontal (botões/LEDs/baia/USB/áudio), ver comentário
    // grande em `_construirPainelFrontalInterno`. Fica um pouco menos "pra fora" (Z menos negativo)
    // que a moldura removível, pra sobrar exposto quando ela for puxada pra fora -- pedido: "com
    // ele [o painel] estando afastado do restante do gabinete, na visão explodida" deve deixar os
    // botões/LEDs visíveis por trás. NÃO passa por `marcarPeca` (não é removível, não anima).
    const painelInterno = _construirPainelFrontalInterno(THREE);
    painelInterno.position.set(0, 0, -0.2);
    grupo.add(painelInterno);

    // Luz interna de preenchimento (pedido: "PointLight suave dentro do chassi", pra estrutura e
    // encaixes ficarem visíveis quando as tampas saem) — fica desligada por padrão (só entra em
    // cena de fato ao remover a 1ª tampa, ver ExplodedAssembly._atualizarLuzInterna).
    const luzInterna = new THREE.PointLight(0xfff2d0, 0, 0.6); // intensidade 0 = apagada
    luzInterna.name = 'luz-interna-gabinete';
    luzInterna.position.set(0, 0, 0);
    grupo.add(luzInterna);

    return { grupo, luzInterna };
  }

  /** Ativa sombras de alta definição no renderer + confere/ajusta materiais PBR das peças
   *  metálicas do gabinete já carregado (placeholder OU .glb real, funciona pros dois — só
   *  precisa achar os nós pelos MESMOS nomes de `PECAS_REMOVIVEIS`). Chame 1x depois de montar o
   *  grupo (placeholder ou modelo real) e adicioná-lo à cena. Pedido verbatim: "Ative sombras de
   *  alta definição (renderer.shadowMap.type = THREE.PCFSoftShadowMap)" + "materiais PBR corretas
   *  (metalness: 0.8, roughness: 0.2 pra partes metálicas e conectores banhados)". */
  function configurarRealismoGabinete(THREE, renderer, grupoGabinete) {
    if (renderer) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    if (!grupoGabinete) return;
    grupoGabinete.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      // Só mexe em material que já seja PBR (MeshStandardMaterial/MeshPhysicalMaterial) -- se o
      // .glb real vier com outra classe de material (ex. MeshLambertMaterial, convenção do resto
      // do motor 3D deste projeto -- ver honestidade de escopo em model3dloader.js), não força
      // troca aqui pra não quebrar a cor/textura já carregada; quem quiser força PBR de verdade
      // troca o material na hora de montar o grupo (como `construirGabinetePlaceholder` já faz).
      if (!obj.material || (!obj.material.isMeshStandardMaterial && !obj.material.isMeshPhysicalMaterial)) return;
      const conectorOuChapa = obj.name === 'espelho_traseiro_i_o' || obj.name.indexOf('chapa_lateral') === 0;
      obj.material.metalness = conectorOuChapa ? 0.85 : 0.7;
      obj.material.roughness = conectorOuChapa ? 0.15 : 0.3;
    });
  }

  // ============================================================================================
  // 3) ExplodedAssembly — a classe principal: acha os nós, guarda o estado, anima o trilho,
  //    detecta clique via Raycaster e expõe as funções globais pra UI 2D/3D chamar.
  // ============================================================================================

  /** `grupoRaiz` = o `THREE.Group`/`THREE.Object3D` que contém o gabinete inteiro (devolvido por
   *  `construirGabinetePlaceholder` OU a raiz de um `.glb` carregado via `model3dloader.js`) — a
   *  única exigência é ter, em algum nível de `traverse`, um nó pra cada `PECAS_REMOVIVEIS[i].no`
   *  (ver `getObjectByName`, pedido verbatim no requisito técnico #1). */
  function ExplodedAssembly(grupoRaiz, THREE) {
    this.grupoRaiz = grupoRaiz;
    // [28/09/2026] THREE agora é opcional aqui -- só precisa de verdade pra `botaoPowerSobRaio`
    // (um `THREE.Raycaster` de VERDADE, não o OBB dos outros métodos) e pra `trocarEspelhoIO`
    // (reconstrói a geometria da peça). Cai pra `raiz.THREE`/`window.THREE` se não vier explícito,
    // então código antigo que chamava `new ExplodedAssembly(grupo)` sem 2º argumento continua
    // funcionando (só perde essas 2 funcionalidades novas se nenhum THREE global existir).
    this._THREE = THREE || (raiz && raiz.THREE) || null;
    this.estruturaCentral = grupoRaiz.getObjectByName(NO_ESTRUTURA_CENTRAL) || null;
    this.luzInterna = grupoRaiz.getObjectByName('luz-interna-gabinete') || null;
    // [28/09/2026] NOVO — estado de energia + referências aos LEDs do painel frontal. Pedido
    // verbatim: "Observe como o objeto Switch liga/desliga. O Gabinete deve ser do mesmo jeito [...]
    // Assim como no switch, os LEDs devem funcionar." `ligado` começa `false` (gabinete desligado
    // por padrão, igual um PC recém-montado antes de ligar na tomada).
    this.ligado = false;
    this._botaoPowerMesh = grupoRaiz.getObjectByName('botao_power') || null;
    this._ledPowerMesh = grupoRaiz.getObjectByName('led_power') || null;
    this._ledAtividadeMesh = grupoRaiz.getObjectByName('led_atividade') || null;
    this.tipoEspelhoIO = (grupoRaiz.getObjectByName('espelho_traseiro_i_o') || {}).userData?.tipoEspelhoIO || 'padrao';
    // [28/09/2026] NOVO — ponte pro backend de montagem/encaixe já existente (`js/hardware-sim.js`,
    // `HardwareSimulator`/`PERFIL_SLOTS.pc_gabinete`), pedido novo: "implemente isso também" (modo
    // 'E'-like de encaixar HD/RAM/fonte/placa-mãe dentro do gabinete). HONESTIDADE DE ESCOPO: o
    // Modo E/L de verdade (tecla, "carregar" o objeto na mão, indicador 3D de encaixe) é uma
    // interação de MAPA 2D (`js/view3d-rede.js`), desenhada pra objetos de rede que existem como
    // item solto no mapa (Switch/patch panel) -- HD/RAM/fonte/placa-mãe do gabinete NÃO são objetos
    // de mapa, são peças internas geridas pelo próprio simulador de montagem. Por isso a integração
    // aqui é no NÍVEL DE DADOS: mesmos métodos (`instalar`/`remover`/`tentarEncaixar`) do
    // `HardwareSimulator`, expostos na instância do gabinete (`instalarComponente`/
    // `removerComponente` abaixo) e via `window.HardwareExploded.instanciaAtiva`, pronto pra uma UI
    // (menu/context-menu) chamar -- mesmo padrão "função global pronta pra botão HTML" já usado por
    // `desmontarTudo`/`montarTudo`/`alternarPeca`.
    this.simulador = null;
    if (raiz.HardwareSimulator && typeof raiz.HardwareSimulator.HardwareSimulator === 'function') {
      try { this.simulador = new raiz.HardwareSimulator.HardwareSimulator('pc_gabinete'); } catch (erro) { console.warn('[HardwareExploded] falha ao criar HardwareSimulator interno:', erro); }
    }

    /** `estadoGabinete` — EXATAMENTE o formato pedido verbatim: uma entrada por peça, com
     *  `montada`, `posicaoOriginal` (THREE.Vector3, copiada da posição em que o nó já estava
     *  no modelo/placeholder) e `posicaoDesmontada` (THREE.Vector3 = original + deslocamento no
     *  eixo/sentido/distância do "trilho" configurado em `PECAS_REMOVIVEIS`). */
    this.estadoGabinete = {};
    this._animando = []; // lista interna de { chave, mesh, inicio:Vector3, fim:Vector3, t0Ms } em andamento

    PECAS_REMOVIVEIS.forEach((def) => {
      const mesh = grupoRaiz.getObjectByName(def.no);
      if (!mesh) {
        console.warn(`[HardwareExploded] nó "${def.no}" não encontrado na hierarquia do modelo -- essa peça não poderá ser desmontada (ver PECAS_REMOVIVEIS em js/hardware-exploded.js).`);
        return;
      }
      const posOriginal = mesh.position.clone();
      const posDesmontada = posOriginal.clone();
      posDesmontada[def.eixo] += def.sentido * def.distanciaM;
      mesh.userData.pecaHardware = true;
      mesh.userData.chaveEstado = def.chave;
      this.estadoGabinete[def.chave] = {
        mesh, montada: true, animando: false,
        posicaoOriginal: posOriginal, posicaoDesmontada: posDesmontada,
        no: def.no, caixaInteracao: def.caixaInteracao || null,
      };
    });
  }

  /** Interseção raio-caixa ORIENTADA (rotação só no eixo Y) -- MESMO algoritmo (slab test) de
   *  `Engine3D.prototype._rayBoxT` (js/engine3d.js), copiado aqui pra este módulo continuar
   *  autocontido/testável fora do navegador (não depende de `window.Engine3D`). `o`/`d` já devem
   *  estar no espaço LOCAL da caixa (ver `pecaSobRaio`, que faz essa transformação antes de
   *  chamar). Devolve a distância `t` do primeiro cruzamento, ou `null` se o raio não cruza. */
  function _rayBoxLocalT(o, d, half) {
    let tmin = -Infinity, tmax = Infinity;
    const eixos = [[o.x, d.x, half.x], [o.y, d.y, half.y], [o.z, d.z, half.z]];
    for (const [op, dp, h] of eixos) {
      if (Math.abs(dp) < 1e-9) { if (op < -h || op > h) return null; continue; }
      let t1 = (-h - op) / dp, t2 = (h - op) / dp;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    return tmin > 0 ? tmin : tmax;
  }

  /** Requisito técnico #1 (Raycasting Interativo), versão ROBUSTA -- pedido verbatim (bug
   *  relatado): "As chapas laterais devem ter o raycaster funcionais em qualquer ângulo.
   *  Atualmente tem que ficar bem de frente para elas para montar/desmontar." Em vez de testar a
   *  malha VISUAL fina de cada peça (o problema original -- ver comentário grande em
   *  `PECAS_REMOVIVEIS`), testa a caixa orientada `caixaInteracao` de cada peça (bem mais grossa
   *  no eixo fino, sem mudar nada do desenho) contra o raio, já no espaço LOCAL do `grupoRaiz`
   *  (desfaz a MESMA translação/rotação Y que `js/objecttypes/hardware-gabinete.js` aplica no
   *  grupo inteiro ao posicioná-lo no mapa). Testa a posição ATUAL de cada peça (`peca.mesh.
   *  position`), então uma peça já puxada pra fora continua clicável no lugar novo (fora do
   *  gabinete), e uma peça sobreposta por outra na frente é resolvida por MENOR distância (`t`),
   *  igual qualquer raycast de verdade. `origin`/`dir` em coordenadas de MUNDO. Devolve a CHAVE da
   *  peça mais próxima cruzada pelo raio, ou `null`. */
  ExplodedAssembly.prototype.pecaSobRaio = function pecaSobRaio(origin, dir) {
    const g = this.grupoRaiz;
    const rotY = g.rotation ? g.rotation.y || 0 : 0;
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const gp = g.position || { x: 0, y: 0, z: 0 };
    const ox = origin.x - gp.x, oy = origin.y - gp.y, oz = origin.z - gp.z;
    // Mesma convenção de `Engine3D.prototype._rayBoxT` (transformar MUNDO -> LOCAL de uma caixa
    // rotacionada por `rotY` no eixo Y).
    const lox = ox * c - oz * s, loy = oy, loz = ox * s + oz * c;
    const ldx = dir.x * c - dir.z * s, ldy = dir.y, ldz = dir.x * s + dir.z * c;
    let melhorChave = null, melhorT = Infinity;
    Object.keys(this.estadoGabinete).forEach((chave) => {
      const peca = this.estadoGabinete[chave];
      if (!peca.caixaInteracao) return;
      const centro = peca.mesh.position;
      const t = _rayBoxLocalT({ x: lox - centro.x, y: loy - centro.y, z: loz - centro.z }, { x: ldx, y: ldy, z: ldz }, peca.caixaInteracao);
      if (t !== null && t < melhorT) { melhorT = t; melhorChave = chave; }
    });
    return melhorChave;
  };

  /** Requisito técnico #1 — "Raycasting Interativo: ao clicar em uma peça removível [...] o
   *  sistema deve detectá-la." Recebe o array `intersects` que `THREE.Raycaster.intersectObjects`
   *  já devolveria (não reimplementa o raycaster em si -- o projeto já tem um real em
   *  `engine3d.js`/`view3d.js`, é só apontar ele pras malhas do gabinete + este método aqui). Sobe
   *  pela cadeia de pais de cada resultado até achar um `userData.chaveEstado` conhecido (cobre o
   *  caso de a malha clicada ser uma SUB-parte de uma peça, ex. um parafuso filho da chapa lateral
   *  num .glb real com mais detalhe do que o placeholder). Devolve a CHAVE da peça (string) ou
   *  `null` se o clique não bateu em nenhuma peça removível (ex. bateu no esqueleto central). */
  ExplodedAssembly.prototype.detectarPecaClicada = function detectarPecaClicada(intersects) {
    if (!intersects || !intersects.length) return null;
    for (let i = 0; i < intersects.length; i++) {
      let obj = intersects[i].object;
      while (obj) {
        if (obj.userData && obj.userData.chaveEstado && this.estadoGabinete[obj.userData.chaveEstado]) {
          return obj.userData.chaveEstado;
        }
        obj = obj.parent;
      }
    }
    return null;
  };

  /** Inicia a animação de trilho de UMA peça, do ponto onde ela está agora até o alvo (posição
   *  original, se `montar`, ou desmontada, se não) — não teleporta: quem avança a posição de
   *  verdade, quadro a quadro, é `tick()` (ver mais abaixo), chamado no loop `animate` de quem for
   *  dono da cena. Requisito técnico #2 (animação de desmontagem via lerp/loop animate). */
  ExplodedAssembly.prototype._iniciarAnimacao = function _iniciarAnimacao(chave, montar) {
    const peca = this.estadoGabinete[chave];
    if (!peca) return;
    peca.montada = montar;
    peca.animando = true;
    this._animando = this._animando.filter((a) => a.chave !== chave); // cancela uma animação anterior da mesma peça, se houver (clique duplo rápido)
    this._animando.push({
      chave,
      mesh: peca.mesh,
      inicio: peca.mesh.position.clone(),
      fim: (montar ? peca.posicaoOriginal : peca.posicaoDesmontada).clone(),
      t0Ms: (raiz.performance && raiz.performance.now) ? raiz.performance.now() : Date.now(),
    });
  };

  /** Requisito técnico #4 — "alternarPeca(nomePeca)": alterna UMA peça entre montada/desmontada.
   *  `chave` é a chave em `estadoGabinete` (camelCase, ex. `'chapaLateralEsquerda'`) -- aceita
   *  também o nome de nó snake_case (ex. `'chapa_lateral_esquerda'`) por conveniência de quem
   *  estiver chamando a partir de um resultado de `detectarPecaClicada`/nome de malha direto. */
  ExplodedAssembly.prototype.alternarPeca = function alternarPeca(chaveOuNo) {
    const chave = this.estadoGabinete[chaveOuNo] ? chaveOuNo : (PECAS_REMOVIVEIS.find((d) => d.no === chaveOuNo) || {}).chave;
    const peca = chave && this.estadoGabinete[chave];
    if (!peca) { console.warn(`[HardwareExploded] alternarPeca: peça "${chaveOuNo}" não existe.`); return; }
    this._iniciarAnimacao(chave, /* montar = */ !peca.montada);
    this._atualizarLuzInterna();
  };

  /** [28/09/2026] NOVO — Requisito técnico #1 versão "botão real": pedido verbatim "Observe como o
   *  objeto Switch liga/desliga. O Gabinete deve ser do mesmo jeito, só que deve estar apontando
   *  para o botão ligar/desligar. Use pixel perfect para isso." Ao contrário de `pecaSobRaio`
   *  (que usa um OBB deliberadamente GROSSO pras tampas, porque são chapas finas), o botão de
   *  power precisa do oposto: só contar como "acertou" se o raio bater NA MALHA REAL e pequena do
   *  botão -- por isso este método faz um `THREE.Raycaster` de verdade (triângulo-a-triângulo,
   *  igual o modo 'pixelperfect' já existente em "Configurações 3D" faz pro resto da cena, ver
   *  `Engine3D`/`js/mapconfig.js` `#mc-raycast-precision`) contra SÓ a malha `botao_power`, não o
   *  gabinete inteiro. `origin`/`dir` em coordenadas de MUNDO. Devolve `true`/`false`. */
  ExplodedAssembly.prototype.botaoPowerSobRaio = function botaoPowerSobRaio(origin, dir) {
    const THREE = this._THREE;
    if (!THREE || !this._botaoPowerMesh) return false;
    this.grupoRaiz.updateMatrixWorld(true); // garante que a malha do botão reflita a posição/rotação atual do gabinete (e do painel frontal, se estiver animando)
    const rc = new THREE.Raycaster(
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
    );
    const hits = rc.intersectObject(this._botaoPowerMesh, false);
    return hits.length > 0;
  };

  /** [28/09/2026] NOVO — liga/desliga o gabinete, mesmo espírito de `RedeEquip.prototype.
   *  alternarEnergia` (js/rede-equip.js) pro Switch: alterna `this.ligado` e atualiza os LEDs do
   *  painel frontal (`_atualizarLeds`, abaixo) — luz de energia acesa/apagada, LED de atividade só
   *  pisca quando ligado. */
  ExplodedAssembly.prototype.alternarEnergia = function alternarEnergia() {
    this.ligado = !this.ligado;
    this._atualizarLeds(0);
    return this.ligado;
  };

  /** [28/09/2026] NOVO — atualiza a cor/intensidade emissiva dos LEDs do painel frontal conforme
   *  `this.ligado`, mesmo padrão de `RedeEquip`'s `LED_ESTILOS`/`atualizarLeds` (js/rede-equip.js)
   *  pro Switch: LED de energia fica ACESO ESTÁVEL quando ligado, apagado quando desligado; LED de
   *  atividade PISCA (liga/desliga por um seno do tempo) só enquanto ligado, simulando atividade de
   *  disco -- apagado de vez quando desligado. `tSeg` = segundos decorridos (de `tick`), usado só
   *  pra cadência do piscar. */
  ExplodedAssembly.prototype._atualizarLeds = function _atualizarLeds(tSeg) {
    if (this._ledPowerMesh) {
      this._ledPowerMesh.material.emissiveIntensity = this.ligado ? 1.4 : 0;
    }
    if (this._ledAtividadeMesh) {
      if (!this.ligado) {
        this._ledAtividadeMesh.material.emissiveIntensity = 0;
      } else {
        // Pisca em ~2.5Hz, com "rajadas" ocasionais (mistura 2 senos) pra parecer atividade real
        // de disco, não um metrônomo perfeito -- mesma ideia informal do `LED_ESTILOS.active`
        // (piscando) do Switch, só que sem depender de `RedeEquip` (este módulo continua
        // autocontido, ver PADRÃO UMD no topo do arquivo).
        const fase = (tSeg || 0) * 2.5 * Math.PI * 2;
        const aceso = Math.sin(fase) > 0.15 || Math.sin(fase * 2.7) > 0.85;
        this._ledAtividadeMesh.material.emissiveIntensity = aceso ? 1.2 : 0.05;
      }
    }
  };

  /** [28/09/2026] NOVO — troca o espelho traseiro por outra variante do catálogo
   *  (`ESPELHO_IO_TIPOS`: `'padrao'`/`'legado'`/`'workstation'`) SEM precisar reconstruir o
   *  gabinete inteiro -- pedido: "Deve ser possível trocar o espelho traseiro (ATX I/O plates for
   *  motherboard rear connectors, pesquise os vários tipos)." Remove a malha antiga do
   *  `espelho_traseiro_i_o` e põe a nova NO MESMO LUGAR (posição atual -- montada ou já puxada pra
   *  fora, preserva o estado de montagem). Devolve `true`/`false` (falha se `tipo` for inválido ou
   *  faltar THREE). */
  ExplodedAssembly.prototype.trocarEspelhoIO = function trocarEspelhoIO(tipo) {
    const THREE = this._THREE;
    if (!THREE || ESPELHO_IO_TIPOS.indexOf(tipo) < 0) return false;
    const estado = this.estadoGabinete.espelhoTraseiroIO;
    if (!estado) return false;
    const antigo = estado.mesh;
    const pai = antigo.parent;
    if (!pai) return false;
    const posAtual = antigo.position.clone();
    pai.remove(antigo);
    const novo = _construirEspelhoTraseiro(THREE, tipo);
    novo.name = 'espelho_traseiro_i_o';
    novo.userData.pecaHardware = true;
    novo.userData.chaveEstado = 'espelhoTraseiroIO';
    novo.position.copy(posAtual);
    pai.add(novo);
    estado.mesh = novo;
    this.tipoEspelhoIO = tipo;
    return true;
  };

  /** [28/09/2026] NOVO — ponte de dados pro backend de montagem (`HardwareSimulator`, ver
   *  comentário grande no construtor) -- pedido: "Deve ser possível mover uma peça (HD, RAm,
   *  fonte, placa-mãe, etc) e encaixar dentro do gabinete do PC" (análogo ao Modo E). Tenta
   *  encaixar `chave` (chave de catálogo, ex. `'atx_500w'`) na família `familia` (`'fonte'`,
   *  `'placaMae'`, `'cpu'`, `'ram'`, `'armazenamento'`, `'offboard'`) usando a 1ª âncora livre (ou
   *  `slotPreferido`, se vier). Devolve `{ok, motivo}` (mesmo formato de
   *  `HardwareSimulator.prototype.instalar`). */
  ExplodedAssembly.prototype.instalarComponente = function instalarComponente(familia, chave, slotPreferido) {
    if (!this.simulador) return { ok: false, motivo: 'Simulador de montagem indisponível.' };
    return this.simulador.instalar(familia, chave, slotPreferido);
  };

  /** [28/09/2026] NOVO — remove uma peça já instalada (contraparte de `instalarComponente`).
   *  `indice` só é relevante pras famílias de várias vias (`ram`/`armazenamento`/`offboard`) --
   *  ignorado (opcional) pras de via única (`fonte`/`placaMae`/`cpu`). */
  ExplodedAssembly.prototype.removerComponente = function removerComponente(familia, indice) {
    if (!this.simulador) return { ok: false, motivo: 'Simulador de montagem indisponível.' };
    return this.simulador.remover(familia, indice);
  };

  /** Requisito técnico #4 — "desmontarTudo()"/"montarTudo()". */
  ExplodedAssembly.prototype.desmontarTudo = function desmontarTudo() {
    Object.keys(this.estadoGabinete).forEach((chave) => this._iniciarAnimacao(chave, false));
    this._atualizarLuzInterna();
  };
  ExplodedAssembly.prototype.montarTudo = function montarTudo() {
    Object.keys(this.estadoGabinete).forEach((chave) => this._iniciarAnimacao(chave, true));
    this._atualizarLuzInterna();
  };

  /** Liga a luz de preenchimento interna (pedido: "para que o esqueleto e os encaixes internos
   *  fiquem visíveis quando as tampas forem removidas") assim que QUALQUER peça estiver
   *  desmontada, apaga de novo quando tudo estiver remontado -- em vez de sempre acesa (o que
   *  vazaria luz por baixo do gabinete fechado, sem sentido visualmente). */
  ExplodedAssembly.prototype._atualizarLuzInterna = function _atualizarLuzInterna() {
    if (!this.luzInterna) return;
    const algumaDesmontada = Object.keys(this.estadoGabinete).some((c) => !this.estadoGabinete[c].montada);
    this.luzInterna.intensity = algumaDesmontada ? 0.6 : 0;
  };

  /** Requisito técnico #2 — avança as animações em andamento; chame 1x por quadro do loop
   *  `animate()` de quem for dono da cena (mesmo espírito de `HardwareSimulator.tick`, ver
   *  `js/hardware-sim.js`), passando quantos ms se passaram desde o quadro anterior. Sem
   *  dependência de nenhuma lib de tween -- lerp puro com easing (ver `easeOutCubic` no topo do
   *  arquivo), como o pedido permitia ("JS puro se for simples"). Devolve `true` se ainda há
   *  alguma peça em movimento (útil pra quem só quiser re-renderizar a cena enquanto houver
   *  animação rolando, e parar de gastar quadro depois). */
  ExplodedAssembly.prototype.tick = function tick(agoraMs) {
    const agora = agoraMs != null ? agoraMs : ((raiz.performance && raiz.performance.now) ? raiz.performance.now() : Date.now());
    // [28/09/2026] LED de atividade precisa piscar mesmo sem nenhuma peça em animação -- por isso
    // este `if` de saída antecipada, que existia antes, agora só se aplica ao trilho das tampas; o
    // piscar dos LEDs roda toda vez que `tick` é chamado (1x por quadro, ver `js/view3d.js`).
    this._atualizarLeds(agora / 1000);
    if (!this._animando.length) return false;
    this._animando = this._animando.filter((a) => {
      const t = Math.min(1, (agora - a.t0Ms) / DURACAO_ANIMACAO_MS);
      const te = easeOutCubic(t);
      a.mesh.position.set(
        lerp(a.inicio.x, a.fim.x, te),
        lerp(a.inicio.y, a.fim.y, te),
        lerp(a.inicio.z, a.fim.z, te),
      );
      if (t >= 1) { this.estadoGabinete[a.chave].animando = false; return false; }
      return true;
    });
    return this._animando.length > 0;
  };

  /** Requisito técnico #4 — "Interface 2D/3D Conectada: funções globais para que botões HTML
   *  externos possam disparar `desmontarTudo()`, `montarTudo()` ou `alternarPeca(nomePeca)`."
   *  Namespacea tudo em `window.HardwareExploded.*` (convenção do projeto inteiro -- ver
   *  `js/hardware-sim.js`/`js/rede-equip.js`/etc., nenhum outro módulo pendura função solta direto
   *  em `window`) E, além disso, cria as 3 funções soltas com o nome EXATO pedido
   *  (`window.desmontarTudo`/`window.montarTudo`/`window.alternarPeca`) só se esses nomes ainda
   *  não existirem em `window` -- assim um botão HTML simples (`onclick="desmontarTudo()"`)
   *  funciona igual ao pedido, sem risco de sobrescrever alguma função de outro módulo do app com
   *  o mesmo nome. As 3 sempre operam sobre a ÚLTIMA instância que chamou este método (o caso
   *  comum é 1 gabinete "ativo" por vez no "Ver em 3D" -- pra vários gabinetes ao mesmo tempo,
   *  chame os métodos direto na instância de cada um, sem passar por aqui). */
  ExplodedAssembly.prototype.anexarInterfaceGlobal = function anexarInterfaceGlobal() {
    raiz.HardwareExploded = raiz.HardwareExploded || {};
    raiz.HardwareExploded.instanciaAtiva = this;
    raiz.HardwareExploded.desmontarTudo = () => this.desmontarTudo();
    raiz.HardwareExploded.montarTudo = () => this.montarTudo();
    raiz.HardwareExploded.alternarPeca = (nomePeca) => this.alternarPeca(nomePeca);
    // [28/09/2026] NOVO — mesmo padrão pras funcionalidades novas (energia/espelho/montagem),
    // sempre namespaceadas em `window.HardwareExploded.*` (as 3 soltas de sempre continuam só
    // `desmontarTudo`/`montarTudo`/`alternarPeca`, pedido verbatim original -- não polui `window`
    // com mais nomes soltos além dos 3 já pedidos).
    raiz.HardwareExploded.alternarEnergia = () => this.alternarEnergia();
    raiz.HardwareExploded.trocarEspelhoIO = (tipo) => this.trocarEspelhoIO(tipo);
    raiz.HardwareExploded.instalarComponente = (familia, chave, slotPreferido) => this.instalarComponente(familia, chave, slotPreferido);
    raiz.HardwareExploded.removerComponente = (familia, indice) => this.removerComponente(familia, indice);
    if (typeof raiz.desmontarTudo !== 'function') raiz.desmontarTudo = () => raiz.HardwareExploded.instanciaAtiva && raiz.HardwareExploded.instanciaAtiva.desmontarTudo();
    if (typeof raiz.montarTudo !== 'function') raiz.montarTudo = () => raiz.HardwareExploded.instanciaAtiva && raiz.HardwareExploded.instanciaAtiva.montarTudo();
    if (typeof raiz.alternarPeca !== 'function') raiz.alternarPeca = (nomePeca) => raiz.HardwareExploded.instanciaAtiva && raiz.HardwareExploded.instanciaAtiva.alternarPeca(nomePeca);
    return this;
  };

  const API = {
    PECAS_REMOVIVEIS,
    NO_ESTRUTURA_CENTRAL,
    DURACAO_ANIMACAO_MS,
    ESPELHO_IO_TIPOS,
    ExplodedAssembly,
    construirGabinetePlaceholder,
    configurarRealismoGabinete,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  raiz.HardwareExploded = Object.assign(raiz.HardwareExploded || {}, API);
})(typeof window !== 'undefined' ? window : this);
