import type { Aviso, Modelo } from '../domain/model.js';
import { avisosDeRejeicao, construirModelo } from '../domain/report-tree.js';
import { type Envelope, envelopeSchema, parseLinhas, type Sentenca } from '../domain/schemas.js';
import { gravarJson, lerJson } from '../infra/fs-store.js';
import { AppError } from '../shared/errors.js';
import type { Contexto } from './context.js';

async function lerSentenca(ctx: Contexto, s: Sentenca): Promise<Envelope> {
  const bruto = await lerJson<unknown>(ctx.caminhos.sentenca(s), 'fetch');
  const r = envelopeSchema.safeParse(bruto);
  if (!r.success)
    throw new AppError(`${s}.json fora do formato { "Row": [...] }. Execute \`npm run fetch\`.`, 'RAW');
  return r.data;
}

export interface ResultadoTransform {
  modelo: Modelo;
  avisos: Aviso[];
}

/** Etapa 2: valida, normaliza, junta 004×005 e agrega 004 (professores), 006 (outras provas) e 009 (professores respondem). */
export async function executarTransform(
  ctx: Contexto,
  agora: Date = new Date(),
): Promise<ResultadoTransform> {
  const { logger, caminhos, config } = ctx;
  const p004 = parseLinhas('EDU.BI.004', await lerSentenca(ctx, 'EDU.BI.004'));
  const p005 = parseLinhas('EDU.BI.005', await lerSentenca(ctx, 'EDU.BI.005'));
  const p006 = parseLinhas('EDU.BI.006', await lerSentenca(ctx, 'EDU.BI.006'));
  const p009 = parseLinhas('EDU.BI.009', await lerSentenca(ctx, 'EDU.BI.009'));

  const { modelo, avisos: avisosModelo } = construirModelo(
    { linhas004: p004.linhas, linhas005: p005.linhas, linhas006: p006.linhas, linhas009: p009.linhas },
    { agora, anoLetivo: config.ANO_LETIVO },
  );
  const avisos = [
    ...avisosDeRejeicao('EDU.BI.004', p004.rejeitadas),
    ...avisosDeRejeicao('EDU.BI.005', p005.rejeitadas),
    ...avisosDeRejeicao('EDU.BI.006', p006.rejeitadas),
    ...avisosDeRejeicao('EDU.BI.009', p009.rejeitadas),
    ...avisosModelo,
  ];
  modelo.totais.avisos = avisos.length;

  await gravarJson(caminhos.modelo, modelo);
  await gravarJson(caminhos.avisos, avisos);

  logger.info(`Pasta de saída: ${modelo.pastaRaiz}`);
  for (const u of modelo.unidades) {
    const grupos = u.grupos.map((g) => `${g.nome}: ${g.relatorios.length}`).join(' | ');
    logger.info(`Unidade ${u.nome} → ${grupos}`);
  }
  const porTipo = avisos.reduce<Record<string, number>>(
    (acc, a) => ({ ...acc, [a.tipo]: (acc[a.tipo] ?? 0) + 1 }),
    {},
  );
  logger.info(
    `${modelo.totais.unidades} unidade(s), ${modelo.totais.relatorios} relatório(s) ` +
      `(${modelo.totais.relatoriosProva} de prova, ${modelo.totais.relatoriosProfessor} de professor).`,
  );
  if (avisos.length > 0) {
    logger.warn(`${avisos.length} aviso(s): ${JSON.stringify(porTipo)}. Detalhes em ${caminhos.avisos}`);
  }
  return { modelo, avisos };
}
