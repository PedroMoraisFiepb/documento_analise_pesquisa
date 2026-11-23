import { type Relatorio, listarRelatorios, tituloRelatorio } from '../domain/model.js';
import { chave } from '../domain/normalize.js';
import { pastaDoRelatorio } from '../infra/paths.js';
import { gerarImagens } from '../render/charts/render.js';
import { gerarDocx } from '../render/docx/render.js';
import { gerarXlsx } from '../render/xlsx/render.js';
import type { ConfigGraficos } from '../shared/graficos.js';
import { mapLimit } from '../shared/concurrency.js';
import { AppError } from '../shared/errors.js';
import { type Contexto, lerModelo } from './context.js';

export interface OpcoesRender {
  /** Restringe a uma unidade (depuração): `--only=<unidade>`. */
  apenasUnidade?: string | undefined;
}

type Gerador = (r: Relatorio, pasta: string, geradoEm: Date) => Promise<unknown>;

async function renderizar(
  ctx: Contexto,
  etapa: string,
  gerador: Gerador,
  opcoes: OpcoesRender,
): Promise<number> {
  const modelo = await lerModelo(ctx);
  let relatorios = listarRelatorios(modelo);
  if (opcoes.apenasUnidade) {
    const alvo = chave(opcoes.apenasUnidade);
    relatorios = relatorios.filter((r) => chave(r.unidade) === alvo);
    if (relatorios.length === 0)
      throw new AppError(`Unidade não encontrada: ${opcoes.apenasUnidade}`, 'UNIDADE');
  }
  const geradoEm = new Date(modelo.geradoEm);
  const total = relatorios.length;
  let feitos = 0;
  const inicio = Date.now();
  await mapLimit(relatorios, ctx.config.RENDER_CONCURRENCY, async (r) => {
    await gerador(r, pastaDoRelatorio(ctx.caminhos.work, modelo.pastaRaiz, r.caminho), geradoEm);
    feitos++;
    ctx.logger.debug(`[${etapa}] ${feitos}/${total} ${r.unidade} › ${tituloRelatorio(r)}`);
  });
  ctx.logger.info(`[${etapa}] ${total} relatório(s) em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  return total;
}

/** Gráficos configurados para cada tipo de relatório (GRAFICOS_PROFESSOR / GRAFICOS_PROVA). */
export function configGraficos(ctx: Contexto): ConfigGraficos {
  return { professor: ctx.config.GRAFICOS_PROFESSOR, prova: ctx.config.GRAFICOS_PROVA };
}

/** Etapa 3 (pesada): imagens PNG e JPG. */
export const executarRenderCharts = (ctx: Contexto, opcoes: OpcoesRender = {}) =>
  renderizar(ctx, 'render:charts', (r, pasta) => gerarImagens(r, pasta, configGraficos(ctx)), opcoes);

/** Etapa 4: planilhas. */
export const executarRenderXlsx = (ctx: Contexto, opcoes: OpcoesRender = {}) =>
  renderizar(ctx, 'render:xlsx', gerarXlsx, opcoes);

/** Etapa 5: documentos Word (usa as imagens da etapa 3). */
export const executarRenderDocx = (ctx: Contexto, opcoes: OpcoesRender = {}) =>
  renderizar(
    ctx,
    'render:docx',
    (r, pasta, geradoEm) =>
      gerarDocx(r, pasta, geradoEm, { template: ctx.config.DOCX_TEMPLATE, graficos: configGraficos(ctx) }),
    opcoes,
  );
