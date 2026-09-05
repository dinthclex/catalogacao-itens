/**
 * autoexport.js — Exportação automática periódica dos itens NOVOS (cadastrados
 * desde a última exportação automática), a cada X minutos.
 *
 * IMPORTANTE (limitação real do navegador, não deste app): isto só roda
 * enquanto o app estiver ABERTO nesta aba — uma página web comum não
 * consegue rodar em segundo plano depois de fechada/a aba trocada por muito
 * tempo (o navegador pausa os timers). Não é um "serviço" instalado no
 * sistema. Serve pra quem deixa o app aberto durante uma conferência longa
 * e quer backups automáticos a cada tanto tempo, sem precisar lembrar de
 * exportar manualmente.
 *
 * Os itens já são enviados ao servidor local (se configurado em "📡
 * Sincronização") no INSTANTE em que são cadastrados — isto aqui é adicional:
 * gera um arquivo de backup (JSON) com só os itens novos desde a última
 * rodada, e baixa no aparelho.
 */

const AutoExport = {
  ENABLED_KEY: 'autoExportAtivo',
  INTERVAL_KEY: 'autoExportIntervaloMin',
  DEST_KEY: 'autoExportDestinos', // array: só 'download' por enquanto (Google Drive foi removido do app)
  INCLUIR_IMAGENS_KEY: 'autoExportIncluirImagens',
  LAST_KEY: 'autoExportUltimoEm', // ISO da última exportação automática bem-sucedida

  _timer: null,
  _rodando: false, // evita duas rodadas simultâneas (ex: "Exportar agora" + o timer batendo junto)

  async isEnabled() { try { return !!(await DB.getSetting(this.ENABLED_KEY, false)); } catch (e) { return false; } },
  async setEnabled(v) { try { await DB.setSetting(this.ENABLED_KEY, !!v); } catch (e) { /* ignora */ } },

  async getIntervalMin() { try { return Math.max(1, Number(await DB.getSetting(this.INTERVAL_KEY, 15)) || 15); } catch (e) { return 15; } },
  async setIntervalMin(v) { try { await DB.setSetting(this.INTERVAL_KEY, Math.max(1, Number(v) || 15)); } catch (e) { /* ignora */ } },

  async getDestinos() { try { const v = await DB.getSetting(this.DEST_KEY, ['download']); return Array.isArray(v) && v.length ? v : ['download']; } catch (e) { return ['download']; } },
  async setDestinos(arr) { try { await DB.setSetting(this.DEST_KEY, Array.isArray(arr) ? arr : []); } catch (e) { /* ignora */ } },

  async getIncluirImagens() { try { return !!(await DB.getSetting(this.INCLUIR_IMAGENS_KEY, true)); } catch (e) { return true; } },
  async setIncluirImagens(v) { try { await DB.setSetting(this.INCLUIR_IMAGENS_KEY, !!v); } catch (e) { /* ignora */ } },

  async getLastExportAt() { try { return await DB.getSetting(this.LAST_KEY, null); } catch (e) { return null; } },

  /** Carimbo de data/hora "legível" pro NOME do arquivo — pedido do usuário
   *  (28/08/2026): "(exportação automática 2026-ago-28-21h20min)". Mês
   *  abreviado em pt-BR (3 letras minúsculas), hora/minuto sempre com 2
   *  dígitos — bem diferente do carimbo ISO cru (`2026-08-28T21-20-00-000Z`)
   *  usado noutros exports do app, propositalmente mais fácil de ler direto
   *  na lista de arquivos baixados. */
  _carimboArquivo(date) {
    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${date.getFullYear()}-${MESES[date.getMonth()]}-${dd}-${hh}h${min}min`;
  },

  /** Liga (ou religa, se o intervalo mudou) o cronômetro — chamar de novo é
   *  seguro, sempre reinicia do zero com a configuração atual. */
  async start() {
    this.stop();
    if (!(await this.isEnabled())) return;
    const minutos = await this.getIntervalMin();
    this._timer = setInterval(() => {
      this._tick().catch((e) => window.EventLog?.log?.(`Exportação automática: erro inesperado — ${e?.message || e}`, { tipo: 'erro' }));
    }, minutos * 60 * 1000);
    window.EventLog?.log?.(`Exportação automática: ativada, a cada ${minutos} minuto(s).`, { tipo: 'info' });
  },

  stop() { if (this._timer) { clearInterval(this._timer); this._timer = null; } },

  /** Roda uma rodada agora mesmo, fora do cronômetro — usado tanto pelo timer
   *  quanto pelo botão "Exportar agora" nas Configurações. */
  async runNow() { return this._tick(true); }, // forcarSemNovos: mesmo texto de aviso, mas chamado manualmente

  async _tick(chamadoManualmente = false) {
    if (this._rodando) return { ok: false, motivo: 'ja-rodando' };
    this._rodando = true;
    try {
      const desdeIso = await this.getLastExportAt();
      const desde = desdeIso ? new Date(desdeIso) : null;
      const todos = await DB.getAllItems();
      const novos = desde ? todos.filter((it) => it.criadoEm && new Date(it.criadoEm) > desde) : todos;

      if (!novos.length) {
        if (chamadoManualmente) Utils.toast('Nenhum item novo desde a última exportação automática.', { type: 'warn' });
        // Pedido do usuário (27/08/2026): "no log de eventos, deve ser
        // adicionado ao log quando o backup automático é feito também" —
        // antes, uma rodada do cronômetro sem nenhum item novo passava em
        // BRANCO no log (só as rodadas com sucesso/falha apareciam), então
        // não dava pra confirmar, olhando só o log, que o backup automático
        // continuava rodando de verdade. Agora toda rodada deixa rastro,
        // mesmo quando não há nada novo pra exportar.
        window.EventLog?.log?.('Exportação automática: rodada executada, nenhum item novo desde a última — nada para gerar backup desta vez.', { tipo: 'info' });
        return { ok: true, quantidade: 0 };
      }

      const incluirImagens = await this.getIncluirImagens();
      // Pedido do usuário (27/08/2026): "avatarDataUrl" e "thumbDataUrl"
      // (imagens duplicadas/legadas) removidos de TODO patrimônio exportado
      // — inclusive aqui, na exportação automática — substituídos por uma
      // única imagem representativa em SVG (`avatarSvg`, ver
      // Avatar.itemIconSvg). Não depende de "incluir imagens" (é texto leve,
      // não uma foto de verdade) — esse toggle continua controlando só
      // `fotoDataUrl` (a foto real, pesada), como antes.
      const iconStateAuto = await Avatar.loadIconState();
      const itensParaExportar = novos.map((it) => {
        const { avatarDataUrl, thumbDataUrl, fotoDataUrl, ...resto } = it;
        resto.avatarSvg = it.avatarSvg || Avatar.itemIconSvg(it, iconStateAuto);
        if (incluirImagens) resto.fotoDataUrl = fotoDataUrl || null;
        return resto;
      });
      const agora = DB.nowISO();
      // Pedido do usuário (28/08/2026): "o nome do arquivo gerado deve ter
      // do que se trata ('fotos', 'patrimônios', 'mapas') e no final, entre
      // parênteses, '(exportação automática 2026-ago-28-21h20min)'." — esta
      // exportação automática, hoje, só cobre PATRIMÔNIOS (itens novos
      // desde a última rodada — ver cabeçalho do arquivo), com as FOTOS
      // deles embutidas quando "Incluir imagens" está ligado; nunca inclui
      // mapas (não é algo que esta função gera) — o nome reflete só o que
      // de fato entra no arquivo, pra não dizer "mapas" num arquivo que não
      // tem nenhum.
      const partesConteudo = ['patrimonios'];
      if (incluirImagens) partesConteudo.push('fotos');
      const nomeArquivo = `catalogacao-${partesConteudo.join('-e-')} (exportação automática ${this._carimboArquivo(new Date(agora))}).json`;
      const conteudo = JSON.stringify({ versao: 1, exportadoEm: agora, quantidade: itensParaExportar.length, items: itensParaExportar }, null, 2);

      const destinos = await this.getDestinos();
      const sucessos = [];
      const falhas = [];

      if (destinos.includes('download')) {
        try { Utils.downloadText(conteudo, nomeArquivo, 'application/json', { notify: false }); sucessos.push('aparelho'); }
        catch (e) { falhas.push(`aparelho (${e?.message || e})`); }
      }

      if (sucessos.length) {
        await DB.setSetting(this.LAST_KEY, agora);
        window.EventLog?.log?.(`Exportação automática: ${itensParaExportar.length} item(ns) novo(s) enviado(s) para: ${sucessos.join(', ')}.`, { tipo: 'ok' });
        if (chamadoManualmente) Utils.toast(`${itensParaExportar.length} item(ns) exportado(s) ✓`, { type: 'ok' });
      }
      if (falhas.length) {
        window.EventLog?.log?.(`Exportação automática: falhou em: ${falhas.join(' · ')}.`, { tipo: 'erro' });
        if (chamadoManualmente) Utils.toast('Falha ao exportar: ' + falhas.join(' · '), { type: 'danger', duration: 5000 });
      }
      return { ok: sucessos.length > 0, quantidade: itensParaExportar.length, sucessos, falhas };
    } finally {
      this._rodando = false;
    }
  },
};

window.AutoExport = AutoExport;
