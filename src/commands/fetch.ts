import { type Envelope, SENTENCAS, type Sentenca } from '../domain/schemas.js';
import { gravarJson } from '../infra/fs-store.js';
import { type ClienteTotvs, criarClienteTotvs } from '../infra/totvs-client.js';
import { AppError } from '../shared/errors.js';
import type { Contexto } from './context.js';

export interface Manifesto {
  geradoEm: string;
  origem: string;
  sentencas: Record<Sentenca, { arquivo: string; linhas: number; sha256: string }>;
}

export function clienteDaConfig(ctx: Contexto): ClienteTotvs {
  const { config, logger } = ctx;
  if (!config.TOTVS_USER || !config.TOTVS_PASSWORD) {
    throw new AppError(
      'Defina TOTVS_USER e TOTVS_PASSWORD (variáveis de ambiente ou arquivo .env).',
      'CONFIG',
    );
  }
  return criarClienteTotvs({
    baseUrl: config.TOTVS_BASE_URL,
    coligada: config.TOTVS_COLIGADA,
    sistema: config.TOTVS_SISTEMA,
    usuario: config.TOTVS_USER,
    senha: config.TOTVS_PASSWORD,
    timeoutMs: config.HTTP_TIMEOUT_MS,
    tentativas: config.HTTP_RETRIES,
    aoTentarNovamente: ({ sentenca, tentativa, motivo, esperaMs }) =>
      logger.warn(`${sentenca}: ${motivo}; nova tentativa ${tentativa} em ${esperaMs} ms`),
  });
}

/** Etapa 1: busca as sentenças (SENTENCAS) em paralelo e grava data/raw/*.json + manifest.json. */
export async function executarFetch(
  ctx: Contexto,
  cliente: ClienteTotvs = clienteDaConfig(ctx),
): Promise<Manifesto> {
  const { logger, caminhos, config } = ctx;
  logger.info(`Buscando ${SENTENCAS.join(', ')} em ${config.TOTVS_BASE_URL}…`);
  const envelopes = await Promise.all(
    SENTENCAS.map(async (s): Promise<[Sentenca, Envelope]> => {
      const inicio = Date.now();
      const env = await cliente.buscarSentenca(s);
      logger.info(`${s}: ${env.Row.length} linha(s) em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
      return [s, env];
    }),
  );

  const sentencas = {} as Manifesto['sentencas'];
  for (const [s, env] of envelopes) {
    const arquivo = caminhos.sentenca(s);
    const sha256 = await gravarJson(arquivo, env);
    sentencas[s] = { arquivo: `${s}.json`, linhas: env.Row.length, sha256 };
  }
  const manifesto: Manifesto = {
    geradoEm: new Date().toISOString(),
    origem: config.TOTVS_BASE_URL,
    sentencas,
  };
  await gravarJson(caminhos.manifest, manifesto);
  logger.info(`Dados brutos gravados em ${caminhos.raw}`);
  return manifesto;
}
