/**
 * avatar.js — Ícone colorido do item (o que aparece na Tabela e nos Cartões
 * quando não há foto anexada) — DESENHADO EM SVG EM TEMPO DE EXECUÇÃO, nunca
 * guardado como imagem dentro do item.
 *
 * Pedido do usuário (27/08/2026): antes disto, cada item guardava DOIS
 * campos — `avatarDataUrl` e `thumbDataUrl` — quase sempre com a MESMA
 * imagem dentro (um PNG rasterizado num <canvas>, ver `generatePlaceholder`
 * que existia aqui), dobrando à toa o tamanho de cada item no catálogo só
 * pra guardar duas cópias idênticas. Agora NENHUM dos dois é gravado: o
 * ícone é montado como uma string SVG (`iconSvgMarkup` abaixo) na hora de
 * desenhar a tela — a partir só do tipo/descrição do item (que já existem
 * no registro) e da configuração de ícones (ver icons.js) — bem mais leve
 * (SVG é texto, não um PNG em base64) e sempre reflete a configuração
 * ATUAL de ícones (mudar uma palavra-chave nas Configurações passa a valer
 * pros itens já cadastrados também, sem precisar regravar nada).
 *
 * Quem desenha uma lista de itens (Tabela, Cartões, Buscar, etc.) chama
 * `Avatar.loadIconState()` UMA VEZ (é assíncrono só porque lê Configurações,
 * que passam por Promise — ver db.js) e reusa o mesmo objeto para cada item
 * com `iconSvgMarkup(texto, iconState)`, que é 100% síncrono — assim uma
 * lista com milhares de itens não faz milhares de idas ao banco, só uma.
 */
const Avatar = {
  /** Carrega, de uma vez só, tudo que a resolução de ícone precisa das
   *  Configurações. Chame antes de desenhar uma lista inteira de itens. */
  async loadIconState() {
    const enabled = await window.Icons.isEnabled();
    if (!enabled) return { enabled: false, aliases: {}, remoteCache: {}, fallbackMode: null };
    const [aliases, fallbackMode, remoteCache] = await Promise.all([
      window.Icons.getAliases(),
      window.Icons.getFallbackMode(),
      window.Icons.getRemoteIconCache(),
    ]);
    return { enabled: true, aliases, fallbackMode, remoteCache };
  },

  /** Acha, sem tocar no banco (usa só o `iconState` já carregado), qual
   *  ícone usar pro texto: 1) biblioteca local por palavra-chave; 2) ícone
   *  baixado da internet numa rodada anterior (cache — ver icons.js
   *  maybeEnrichWithRemoteIcon); 3) conforme o modo de fallback configurado
   *  (caixa genérica, ou nada — cai pras iniciais). Devolve {svg,key} ou null. */
  resolveIcon(text, iconState) {
    if (!iconState?.enabled) return null;
    const key = window.Icons.matchByTipoSync(text, iconState.aliases);
    if (key) return { svg: window.Icons.svgForKey(key), key };
    const cacheKey = window.Icons.normalize(text);
    if (iconState.remoteCache?.[cacheKey]) return { svg: iconState.remoteCache[cacheKey], key: null };
    if (iconState.fallbackMode === window.Icons.FALLBACK_PADRAO) return { svg: window.Icons.defaultSvg(), key: 'genérico' };
    return null;
  },

  /** Monta o SVG completo do "avatar" do item (fundo degradê + ícone ou
   *  iniciais/formas decorativas) como MARKUP (string) — inserir direto num
   *  `innerHTML`, sem `<img>` nem dataURL nenhuma. `text` é o mesmo texto
   *  usado antes para cor/hash/iniciais (normalmente descrição OU tipo);
   *  `matchText` é opcional e é o que decide o ÍCONE (normalmente tipo +
   *  descrição juntos) — mesma separação que `generatePlaceholder` já fazia
   *  antes de virar este método. */
  iconSvgMarkup(text, iconState, { size = 96, matchText = null } = {}) {
    const safeText = text || 'item';
    const hash = this._hashStr(safeText);
    const hue = hash % 360;
    const bg1 = `hsl(${hue},55%,32%)`;
    const bg2 = `hsl(${(hue + 40) % 360},55%,18%)`;
    const gradId = `avatargrad${hash}`;
    const r = size * 0.14;
    const resolvido = this.resolveIcon(matchText || safeText, iconState);
    const inner = resolvido?.svg ? this._embedIcon(resolvido.svg, size) : this._decorativeShapesAndInitials(safeText, hash, size);
    return `<svg class="item-avatar-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${this._escapeXml(safeText)}">`
      + `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>`
      + `<rect width="${size}" height="${size}" rx="${r}" fill="url(#${gradId})"/>`
      + inner
      + `</svg>`;
  },

  /**
   * Pedido do usuário (27/08/2026): "ao exportar [...] deve haver apenas uma
   * imagem representativa em SVG no arquivo exportado. Quando for
   * importado, então sim, o SVG é renderizado para produzir a imagem que
   * será mostrada no app." — na exportação (ver settings.js
   * _openExportModal), cada patrimônio leva consigo um `avatarSvg` (a MESMA
   * string que `iconSvgMarkup` geraria) no lugar dos antigos
   * `avatarDataUrl`/`thumbDataUrl` (removidos, eram sempre a mesma imagem
   * duplicada). Ao importar esse arquivo de volta (ver db.js addItem), o
   * item guarda esse MESMO campo/nome tal como veio — isto aqui é o ÚNICO
   * ponto de leitura dela: se existir, é ela quem vira a imagem mostrada
   * (fidelidade ao que foi exportado, mesmo que a biblioteca de ícones
   * deste aparelho tenha mudado desde então); senão, cai no cálculo
   * dinâmico de sempre (`iconSvgMarkup`). Use ESTE método (em vez de
   * `iconSvgMarkup` direto) em qualquer tela que desenhe o "avatar" de um
   * item já existente (Tabela, Cartões, Buscar, detalhe, 3D, Unificar...)
   * — um item recém-criado neste aparelho nunca tem `avatarSvg`, então cai
   * no dinâmico normalmente. */
  itemIconSvg(item, iconState, { size = 96 } = {}) {
    if (item?.avatarSvg) return item.avatarSvg;
    const text = item?.descricao || item?.tipo;
    const matchText = [item?.tipo, item?.descricao].filter(Boolean).join(' ');
    return this.iconSvgMarkup(text, iconState, { size, matchText });
  },

  /** Embute um ícone da biblioteca (um `<svg viewBox="0 0 24 24">...</svg>`
   *  inteiro) DENTRO do svg do avatar, como um `<svg>` aninhado posicionado/
   *  dimensionado no centro — recolore "currentColor" pra branco (não existe
   *  CSS herdado dentro de um SVG solto). */
  _embedIcon(iconSvgFull, size) {
    const inner = iconSvgFull.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const iconSize = size * 0.5;
    const off = (size - iconSize) / 2;
    return `<svg x="${off}" y="${off}" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner.replace(/currentColor/g, '#ffffff')}</svg>`;
  },

  /** Fallback de sempre quando não há ícone (nem local nem baixado): as
   *  mesmas formas "lowpoly" decorativas + iniciais que o gerador em canvas
   *  já desenhava, só que como elementos SVG (`<polygon>`/`<text>`) em vez de
   *  pixels — determinístico a partir do hash do texto (mesmo item sempre
   *  gera as mesmas formas). */
  _decorativeShapesAndInitials(text, hash, size) {
    let seed = hash;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 1000) / 1000; };
    let shapes = '';
    for (let i = 0; i < 6; i++) {
      shapes += `<polygon points="${(rand() * size).toFixed(1)},${(rand() * size).toFixed(1)} ${(rand() * size).toFixed(1)},${(rand() * size).toFixed(1)} ${(rand() * size).toFixed(1)},${(rand() * size).toFixed(1)}" fill="#ffffff" opacity="0.18"/>`;
    }
    const initials = (text || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
    const fontSize = Math.round(size * 0.36);
    return shapes + `<text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="-apple-system,sans-serif" font-weight="700" font-size="${fontSize}">${this._escapeXml(initials)}</text>`;
  },

  _escapeXml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  },

  _hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  },
};

window.Avatar = Avatar;
