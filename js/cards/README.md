# `cards/` — janelinhas ("cards") que aparecem ao clicar em algo no "Ver em 3D"

Pedido verbatim do usuário (13/09/2026) que gerou esta pasta: "faça algum
jeito para poder configurá-las [as janelinhas de card], os estilos e
textos quando clica o que acontece. Estava pensando em fazer uma pasta
chamada 'cards/' e todos eles ficam ali. São as janelas do app. Em vez de
ser injeções em innerHTML nos arquivos do projeto."

## O que tem aqui hoje (5 cards fixos)

| arquivo | quando aparece |
|---|---|
| `object-card.js` | ao mirar/clicar em QUALQUER objeto do catálogo (mesa, cadeira, robô, porta, retângulo/polígono solto, etc.) — o mais usado |
| `camera-card.js` | ao mirar/clicar num objeto "Câmera" |
| `foto-pin-card.js` | ao mirar/clicar no retângulo 3D de uma foto vinculada ao mapa |
| `tijolo-aglomerado-card.js` | ao mirar/clicar num "aglomerado" de tijolos soltos (parede feita com a ferramenta de tijolo, ainda sem virar objeto) |
| `orphan-patrimonio-card.js` | ao clicar num objeto cujo(s) patrimônio(s) vinculado(s) já foi(ram) excluído(s) do catálogo |

Cada um se AUTO-REGISTRA em `window.CardSystem` ao ser carregado — o motor
fica em `js/cardsystem.js` (leia o comentário grande no topo de lá pra
entender a arquitetura completa, incluindo por que isso tudo é `.js` e não
`.html`/`.json` puro — resumo: o app roda 100% via `file:///`, sem
servidor, e `fetch()` de arquivo local é bloqueado por CORS; uma tag
`<script src="...">`, não).

## Por que EDITAR um card daqui muda o app

`js/view3d.js` NÃO tem mais nenhum HTML/estilo/lógica de clique desses 5
cards — só um método "wrapper" fino por card, que monta o `ctx` (o objeto
do mapa, `view3d`, `DB`, `Utils`, etc.) e manda `CardSystem.mount(...)`
montar o card de verdade usando o arquivo daqui. Ou seja: pra mudar o
TEXTO, o ESTILO ou O QUE ACONTECE AO CLICAR num botão de um card
específico, abra só o arquivo dele em `cards/` — não precisa (nem deve)
mexer em `view3d.js`.

## Formato de um arquivo de card

```js
window.CardSystem.register('meu-card', {
  // CAMINHO SIMPLES (a maioria dos casos) — HTML e wiring em funções
  // separadas. `data` é o dado relevante (o objeto do mapa, a câmera, a
  // foto, etc.); `ctx` é o mesmo formato que `assets/modelos/*.model.js`
  // já recebe em `onModelClick`/`onModelSpawn` — `{view3d, DB, Utils, map,
  // Components, Scripting, SceneObjects, SceneEventBus, ObjectStandard,
  // RelogioMundo}` (ver `ObjectAssets.buildCtx`, js/objectassets.js).
  bodyHtml(data, ctx) {
    return `
      <div style="text-align:center; font-weight:700; margin-bottom:8px">🔧 Meu card</div>
      <button class="btn block sm" id="meu-botao">Fazer algo</button>
      <button class="btn block sm" id="v3d-fc-close">Fechar</button>
    `;
  },

  // Chamado DEPOIS do HTML de bodyHtml() já estar no DOM (dentro do
  // elemento `.flashcard3d-overlay` que o CardSystem cria e anexa) — é
  // aqui que se "liga" cada botão/campo a uma ação de verdade.
  wire(elCartao, data, ctx) {
    elCartao.querySelector('#v3d-fc-close').onclick = () => elCartao.remove();
    elCartao.querySelector('#meu-botao').onclick = () => {
      // qualquer coisa: ctx.view3d.<método>, ctx.DB.saveMap(ctx.map), etc.
    };
  },
});
```

### Caminho alternativo: `build(data, ctx)`

Use isto em vez de `bodyHtml`+`wire` só quando o HTML e o wiring
PRECISAREM compartilhar um cálculo feito UMA VEZ SÓ (exemplo real:
`object-card.js` decide a lista final de botões — padrão + extras vindos
de `onModelCardButtons` do Modelo do objeto, ver `js/objectassets.js` — e
usa o MESMO resultado tanto pra gerar o HTML quanto pra prender os
listeners; se fosse `bodyHtml`+`wire` separados, teria que recalcular a
lista duas vezes, rodando `onModelCardButtons` duas vezes por abertura de
card — arriscado se o Modelo tiver algum efeito colateral ali).

```js
window.CardSystem.register('meu-card', {
  build(data, ctx) {
    const algumCalculo = /* ... feito uma vez só ... */;
    const html = `<div>${algumCalculo}</div>`;
    const wire = (elCartao) => {
      // pode fechar sobre `algumCalculo`/`data`/`ctx` livremente
    };
    return { html, wire };
  },
});
```

`CardSystem.mount(container, id, data, ctx)` (em `js/cardsystem.js`) é
quem decide qual dos dois caminhos usar — se o `def` tem `build`, usa ele;
senão usa `bodyHtml`/`wire`.

## Estilo (CSS)

- O "cartão" (fundo, borda, posição fixa na tela) já vem de graça pela
  classe `.flashcard3d-overlay` (definida em `css/style.css`, compartilhada
  com outros overlays do app — não duplicada aqui). O elemento que o
  `CardSystem.mount` cria já nasce com essa classe.
- Pra estilizar o CONTEÚDO do seu card, use `style="..."` inline no HTML
  retornado (é o que todos os 5 cards atuais fazem, seguindo o padrão que
  já existia antes desta pasta existir) ou classes já definidas em
  `css/style.css` (ex.: `.detail-grid`, `.map-fotopin-thumb`).
- Existe também `cards/cards.css`, carregado por `<link rel="stylesheet">`
  no `index.html` (funciona normalmente de `file://` — CSS não sofre a
  mesma restrição de CORS que `fetch()` sofre, só `fetch()`/
  `XMLHttpRequest` são bloqueados; uma tag `<link>` sempre pôde carregar de
  arquivo local sem bloqueio nenhum). Adicione uma classe reaproveitável
  ali quando 2+ cards precisarem do MESMO estilo customizado, pra não
  repetir a mesma regra em cada `cards/*.js`.
- Se um card específico precisar de um CSS só dele, pode incluir um
  `<style>...</style>` inline no próprio HTML retornado por
  `bodyHtml`/`build` — funciona normalmente (um `<style>` dentro de
  `innerHTML` é interpretado pelo navegador igual qualquer outro).

## Como registrar um card NOVO

1. Crie `cards/meu-novo-card.js` com `window.CardSystem.register('meu-id', {...})`.
2. Adicione `<script src="cards/meu-novo-card.js"></script>` no `index.html`,
   na mesma seção onde os outros 5 já estão (perto de `js/cardsystem.js`).
   Cards são um conjunto FIXO — não há carregamento sob demanda aqui
   (diferente de `assets/modelos/`, que tem ~60+ tipos possíveis e por
   isso usa `<script>` injetada dinamicamente via `ObjectAssets._tryLoadScript`).
3. Em `js/view3d.js` (ou onde quer que a decisão "mostrar este card agora"
   aconteça), monte o `ctx` (mesmo padrão de `ObjectAssets.buildCtx`) e
   chame `window.CardSystem.mount(this._container, 'meu-id', dadoRelevante, ctx)`.

## Limitações/decisões honestas desta refatoração (13/09/2026)

- **Acoplamento com `View3D` mantido de propósito em vários cards** (ex.:
  `object-card.js` usa `ctx.view3d._modelarObjetosHabilitado`/
  `_openObjectPropsAndScripts3D`/`_openRoboMonitoringApp3D`; `camera-card.js`
  e `foto-pin-card.js` usam bastante `ctx.view3d._engine`/`_afterMapMutated`/
  `_orbCamMode`/`_fotoCamMode`/etc.). Isso é INTENCIONAL — o pedido do
  usuário foi poder configurar TEXTO/ESTILO/comportamento de alto nível de
  cada card sem mexer no resto do app, não reescrever a integração
  profunda com o motor 3D. Forçar uma separação total teria significado
  duplicar (ou expor por uma API nova, não testável nesta rodada) bastante
  estado interno do `View3D` — risco maior que o benefício. Documentado
  aqui e em cada arquivo, sem fingir que ficou 100% desacoplado.
- **`_showObjectCard3D` (view3d.js) continua com um fallback hardcoded**
  (um cartão mínimo "🧱 Objeto" + "Fechar") pro caso de `_showObjectCard3DBody`
  (que agora só delega pro `CardSystem`) estourar uma exceção — decisão
  deliberada de manter esse fallback de EMERGÊNCIA em `view3d.js` (não em
  `cards/`), já que ele existe justamente pra quando algo em `cards/object-card.js`
  falhar (um card quebrado não pode derrubar a experiência inteira).
- **Não testado ao vivo em navegador nesta rodada** (sem acesso a
  navegador nesta sessão) — a extração foi cuidadosa (texto/HTML/lógica
  movidos literalmente, variável por variável, sem reescrever nada), mas
  vale um teste manual de cada um dos 5 cards (abrir "Ver em 3D", clicar
  em: um objeto qualquer, uma câmera, um pino de foto, um aglomerado de
  tijolos soltos, um objeto com patrimônio excluído) antes de confiar
  cegamente que ficou 100% idêntico ao comportamento anterior.
