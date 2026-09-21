/* js/sceneobjects.js
 * NOVO (07/09/2026), pedido verbatim: "Assim como no Blender, há um
 * dicionário para todos os objetos em cena (bpy.data.objects[...]),
 * implemente algo semelhante no app."
 *
 * Este módulo é o equivalente a `bpy.data.objects` do Blender: um "dicionário"
 * central que agrega TODOS os objetos nomeados de um mapa (`map`), não
 * importa em qual coleção interna eles moram de verdade (`map.objects`,
 * `map.walls`, `map.portas`, `map.janelas`, `map.textos`,
 * `map.medidas2d`, `map.tracos2d`) — cada um desses arrays já ganha um
 * `nome` único (globalmente, entre TODAS as coleções — ver
 * `Mapping._allSceneNames`/`_nextObjectName` em mapping.js) no momento em
 * que é criado.
 *
 * DECISÃO DE ESCOPO TRANSPARENTE: dois tipos citados no pedido do usuário
 * NÃO entram neste dicionário, por razão arquitetural, não por esquecimento:
 *   - "Orb de foto": o registro de verdade (`AmbientePhoto`, com o `nome`)
 *     mora no banco (`DB`/IndexedDB), assíncrono — o "pino" em `map.fotos`
 *     é só a posição no mapa. Continua tendo nome (ver
 *     mapview.js `_placeFotoOrbAtWorld`), só não é acessável de forma
 *     SÍNCRONA por este dicionário (que só lê o objeto `map` já carregado
 *     em memória).
 *   - "Adicionar orb"/pinos de item: não são um tipo de objeto novo — são
 *     campos de posição (`mapaX`/`mapaY`/etc.) escritos DIRETO num item já
 *     catalogado (que já tem identidade própria via `patrimonio`/
 *     `descricao`) — não fazem sentido como uma entrada extra e
 *     redundante neste dicionário.
 *
 * Uso típico (equivalente ao `bpy.data.objects['Cube.001']` do Blender):
 *   SceneObjects.get(map, 'Cube.001')       -> { kind, nome, ref, coleção... }
 *   SceneObjects.byName(map, 'Cube.001').ref.cor = '#ff0000'
 *   SceneObjects.names(map)                 -> ['Cube.001', 'Parede.001', ...]
 *   SceneObjects.all(map)                   -> [ {kind, nome, ref}, ... ]
 *   SceneObjects.setProperty(map, 'Cube.001', 'cor', '#ff0000')
 *
 * Cada entrada devolvida tem: `{ kind, nome, ref, colecao }` — `kind` é um
 * rótulo curto do tipo ('objeto'|'parede'|'porta'|'janela'|'texto'|
 * 'medida2d'|'traco2d'), `ref` é o objeto de VERDADE (a mesma
 * referência dentro do array do mapa — mutar `ref` já é mutar o mapa, sem
 * cópia), `colecao` é o nome do array (`map.objects`, etc.) onde ele mora —
 * útil pra quem precisa chamar `Mapping.update*`/`Mapping.remove*` depois.
 *
 * Esta é a base sobre a qual o novo `js/scripting.js` (engine de scripts
 * por objeto, estilo Unity — ver pedido do usuário na mesma rodada) lê/
 * escreve propriedades de objetos por nome.
 */
window.SceneObjects = {
  // Mapeia cada coleção nomeável do mapa pro seu "kind" (rótulo curto).
  _COLLECTIONS: [
    { key: 'objects', kind: 'objeto' },
    { key: 'walls', kind: 'parede' },
    { key: 'portas', kind: 'porta' },
    { key: 'janelas', kind: 'janela' },
    { key: 'textos', kind: 'texto' },
    { key: 'medidas2d', kind: 'medida2d' },
    { key: 'tracos2d', kind: 'traco2d' },
  ],

  /** Lista TODOS os objetos nomeados do mapa, cada um como
   *  `{ kind, nome, ref, colecao }` — equivalente a iterar
   *  `bpy.data.objects` inteiro no Blender. */
  all(map) {
    if (!map) return [];
    const out = [];
    for (const { key, kind } of this._COLLECTIONS) {
      const arr = map[key];
      if (!arr) continue;
      for (const ref of arr) {
        if (ref && ref.nome) out.push({ kind, nome: ref.nome, ref, colecao: key });
      }
    }
    return out;
  },

  /** Lista só os NOMES (mais barato que `all()` quando só se precisa
   *  preencher um `<select>`/autocompletar, por exemplo). */
  names(map) {
    return this.all(map).map((e) => e.nome);
  },

  /** Acha UM objeto pelo nome — equivalente a `bpy.data.objects['Nome']`.
   *  Devolve `{ kind, nome, ref, colecao }` ou `null` se não achar. Em caso
   *  de (teoricamente impossível, já que os nomes são únicos globalmente —
   *  ver Mapping._allSceneNames) duas entradas com o mesmo nome, devolve a
   *  primeira encontrada, na ordem das coleções listada em `_COLLECTIONS`. */
  byName(map, nome) {
    if (!map || !nome) return null;
    for (const { key, kind } of this._COLLECTIONS) {
      const arr = map[key];
      if (!arr) continue;
      const ref = arr.find((it) => it && it.nome === nome);
      if (ref) return { kind, nome, ref, colecao: key };
    }
    return null;
  },

  /** Atalho pra pegar só a referência (`ref`) direto, sem o envelope
   *  `{kind,nome,ref,colecao}` — mais parecido com o `bpy.data.objects[...]`
   *  literal do Blender, que devolve o objeto em si. */
  get(map, nome) {
    return this.byName(map, nome)?.ref || null;
  },

  /** Muda UMA propriedade de um objeto pelo nome, direto no objeto de
   *  verdade (mutação em memória — quem chamar ainda precisa persistir,
   *  ex.: `DB.saveMap`/`this._saveMap()`, como qualquer outra mudança feita
   *  fora dos `Mapping.update*` normais). Devolve `true` se achou e mudou,
   *  `false` se o nome não existe. Usado pelo motor de scripts
   *  (js/scripting.js) pra "vértices, cor, opacidade, ativo/não ativo,
   *  selecionado/não selecionado, nome, etc." (pedido do usuário) — todos
   *  são só campos comuns do objeto, então uma atribuição direta resolve
   *  qualquer propriedade, não só uma lista fixa. */
  setProperty(map, nome, prop, valor) {
    const entry = this.byName(map, nome);
    if (!entry) return false;
    entry.ref[prop] = valor;
    return true;
  },

  /** Renomeia um objeto — atalho que também valida que o novo nome não
   *  colide com outro já existente no mapa (mesma checagem usada na
   *  criação, `Mapping._allSceneNames`). Devolve `true` se renomeou,
   *  `false` se o nome de origem não existe ou o novo nome já está em uso
   *  por OUTRO objeto. */
  rename(map, nomeAtual, novoNome) {
    if (!novoNome) return false;
    const entry = this.byName(map, nomeAtual);
    if (!entry) return false;
    if (novoNome !== nomeAtual && window.Mapping?._allSceneNames?.(map).includes(novoNome)) return false;
    entry.ref.nome = novoNome;
    return true;
  },
};
