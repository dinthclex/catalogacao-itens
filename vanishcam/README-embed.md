# VanishCam — versão embutida (embed)

Este README documenta como integrar o VanishCam como uma tela dentro de outro app JavaScript,
passando uma foto própria do app e lendo os dados de calibração gerados diretamente em JS —
sem precisar salvar/abrir nenhum arquivo.

Pedido original (rodada 31, 2026-09-09): *"O vanishCam deverá ser integrado como uma tela em
outro app para ser usado dentro dele com imagens próprias do app... [ele] deve ser integrado a
ele de modo que seja possível atualizado apenas substituindo arquivos em uma pasta do projeto,
por exemplo, uma pasta chamada vanishCam."*

## Como funciona

Todo o markup visível da interface do VanishCam vive dentro de um elemento `#vanishcamRoot` em
`index.html`. O arquivo `js/embed-api.js` expõe 5 funções globais (`vanishCamMount`,
`vanishCamUnmount`, `vanishCamLoadImage`, `vanishCamGetCamProps`, `vanishCamIsMounted`) que, na
primeira chamada a `vanishCamMount()`, **buscam o próprio `index.html` da pasta vanishCam** (via
`fetch`), extraem dele o `#vanishcamRoot` e o inserem no container do app hospedeiro — carregando
depois, na ordem certa, os demais arquivos `.js`/`.css` da mesma pasta.

Isso significa que o app hospedeiro **não precisa copiar/colar nada** do HTML/CSS/JS do
VanishCam na própria página — só precisa apontar para a pasta. Assim, atualizar o VanishCam é
literalmente **substituir os arquivos desta pasta** (a mesma que você está olhando agora) por uma
versão mais nova — nada no código do app hospedeiro precisa mudar.

## Passo a passo

### 1. Copie esta pasta para o seu projeto

Copie a pasta `vanishCam/` (com `index.html`, `css/`, `js/`) para dentro do seu projeto, por
exemplo em `meu-app/vendor/vanishCam/`.

### 2. Inclua UM único `<script>` na sua página

```html
<script src="vendor/vanishCam/js/embed-api.js"></script>
```

Não é preciso incluir os outros 8 arquivos `.js` nem o `css/style.css` à mão — `vanishCamMount()`
cuida disso.

### 3. Reserve um container com altura definida

```html
<div id="vanishcam-container" style="width:100%; height:600px;"></div>
```

Um `<div>` comum não tem altura própria — dê a ele uma altura fixa, ou um layout (flex/grid) que
lhe dê espaço. O VanishCam ocupa 100% da largura/altura desse container.

### 4. Monte o VanishCam quando o usuário tirar a foto

```js
async function abrirVanishCam(fotoBlob){
  const container = document.getElementById('vanishcam-container');
  await vanishCamMount(container, { imageFile: fotoBlob });
  // A interface do VanishCam já está visível dentro de #vanishcam-container, com a foto carregada.
}
```

`imageFile` é **opcional** — sem ele, o VanishCam abre na tela inicial de sempre (o usuário pode
abrir uma imagem pela própria UI). Aceita um `File` ou `Blob` de imagem (ex.: vindo direto de uma
captura de câmera, de um `<input type=file>`, etc.).

### 5. Leia os dados de calibração quando precisar

```js
const props = vanishCamGetCamProps();
if(props){
  console.log(props.horizontalFieldOfView, props.cameraTransform, props.principalPoint, ...);
} else {
  console.log('Ainda não há calibração válida (poucos pontos de fuga, eixos duplicados, etc.)');
}
```

`vanishCamGetCamProps()` pode ser chamada a qualquer momento, quantas vezes quiser — não depende
de nenhum botão específico do VanishCam. Ela devolve `null` quando a calibração atual não é
válida (os mesmos casos em que o painel direito do VanishCam mostra "—"), ou o mesmo objeto que
"Arquivo > Exportar > Parâmetros da câmera como JSON" grava num arquivo `.json`:

```jsonc
{
  "principalPoint": { "x": ..., "y": ... },
  "viewTransform": { "rows": [...] },
  "cameraTransform": { "rows": [...] },
  "horizontalFieldOfView": ...,
  "verticalFieldOfView": ...,
  "vanishingPoints": [...],
  "vanishingPointAxes": [...],
  "relativeFocalLength": ...,
  "imageWidth": ...,
  "imageHeight": ...
}
```

Um jeito comum de usar isso é consultar periodicamente (ex.: a cada 500ms com `setInterval`, ou
sempre que o usuário interage) para mostrar os valores "ao vivo" no seu próprio app enquanto ele
ajusta os pontos de fuga dentro do VanishCam.

### 6. Troque a foto (opcional)

```js
vanishCamLoadImage(outroFotoBlob);
```

Troca só a imagem de fundo, preservando a calibração/pontos já desenhados quando possível (o
mesmo comportamento de "Arquivo > Abrir imagem" na UI avulsa).

### 7. Desmonte quando terminar

```js
vanishCamUnmount();
```

Esconde a interface e a retira do seu container (mas mantém tudo em memória — uma nova chamada a
`vanishCamMount()` remonta do ponto em que parou, a menos que você chame com
`{ keepState: false }`, o padrão, que sempre começa do zero).

## Referência das funções

| Função | Retorno | Descrição |
|---|---|---|
| `vanishCamMount(container, opts?)` | `Promise<true>` | Monta a interface dentro de `container` (um elemento DOM). `opts.imageFile`: `File`/`Blob` opcional. `opts.keepState`: `true` para preservar a calibração/imagem atuais ao remontar (padrão: `false`, sempre começa do zero, sem confirmação). |
| `vanishCamUnmount()` | `boolean` | Esconde a interface e a retira do container atual. `false` se o VanishCam nunca chegou a ser montado. |
| `vanishCamIsMounted()` | `boolean` | Se a interface está montada/visível agora. |
| `vanishCamLoadImage(fileOrBlob)` | `true` | Carrega/troca a foto sendo calibrada. Requer que `vanishCamMount()` já tenha sido chamado (e aguardado) antes. |
| `vanishCamGetCamProps()` | `object \| null` | Os parâmetros de câmera calculados agora (mesmo formato do `.json` exportado), ou `null` sem calibração válida. |

## Limitações conhecidas

- **Variáveis globais**: o VanishCam não usa módulos — todas as suas funções/variáveis internas
  (`state`, `render`, `ctx`, `s`, etc.) são globais no `window`. Evite ter globais com esses MESMOS
  nomes no seu próprio app, ou haverá colisão.
- **Mesma origem (CORS)**: `vanishCamMount()` usa `fetch()` para buscar o próprio `index.html` da
  pasta vanishCam — funciona normalmente quando a pasta é servida pelo mesmo servidor/origem do seu
  app (o caso comum: uma pasta dentro do seu próprio projeto). Pode falhar em alguns navegadores
  se a página do seu app for aberta via `file://` direto (sem nenhum servidor local) — nesse caso,
  sirva seu app (e a pasta vanishCam dentro dele) por um servidor local simples durante o
  desenvolvimento.
- **Um container por vez**: `vanishCamMount()` foi pensado para UMA instância por página. Chamar
  de novo com um container diferente REMONTA a mesma instância nesse novo lugar (não cria uma
  segunda instância independente).
- **Sobreposições em tela cheia**: janelas/menus/popups internos do VanishCam (ex.: "Sobre",
  "Atalhos", o popup do cubo 3D) usam `position:fixed`, cobrindo a JANELA inteira do navegador, não
  só o container onde o VanishCam foi montado — comportamento igual ao do fSpy original e da
  maioria dos modais, mas vale saber se seu app espera que tudo fique contido dentro do container.

## Uso avulso (sem nenhum app hospedeiro)

Nada muda: abra `index.html` direto no navegador (ou sirva a pasta por um servidor local) — o
VanishCam funciona exatamente como sempre funcionou, ocupando a janela inteira. `js/embed-api.js`
só define as funções `vanishCam*` acima; elas não fazem nada a menos que algum código externo
(o app hospedeiro) as chame.
