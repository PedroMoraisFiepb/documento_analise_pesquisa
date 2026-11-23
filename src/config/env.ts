import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { AppError } from '../shared/errors.js';
import { GRAFICOS_PADRAO, TIPOS_GRAFICO, type TipoGrafico } from '../shared/graficos.js';

const inteiroPositivo = (padrao: number) => z.coerce.number().int().positive().default(padrao);
const textoOpcional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

/** Lista separada por vírgula de tipos de gráfico (ex.: `questoes,media`); vazio → nenhum gráfico. */
const listaGraficos = (padrao: readonly TipoGrafico[]) =>
  z
    .string()
    .default(padrao.join(','))
    .transform((v) => [
      ...new Set(
        v
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.enum(TIPOS_GRAFICO)));

export const configSchema = z.object({
  TOTVS_BASE_URL: z.string().url().default('https://gestaoescolar.fiepb.org.br'),
  TOTVS_COLIGADA: z.string().default('2'),
  TOTVS_SISTEMA: z.string().default('S'),
  TOTVS_USER: textoOpcional,
  TOTVS_PASSWORD: textoOpcional,
  HTTP_TIMEOUT_MS: inteiroPositivo(600_000),
  HTTP_RETRIES: z.coerce.number().int().min(0).default(3),
  ANO_LETIVO: textoOpcional,
  RENDER_CONCURRENCY: inteiroPositivo(4),
  DATA_DIR: z.string().default('./data'),
  WORK_DIR: z.string().default('./work'),
  OUTPUT_DIR: z.string().default('./output'),
  GRAFICOS_PROFESSOR: listaGraficos(GRAFICOS_PADRAO.professor),
  GRAFICOS_PROVA: listaGraficos(GRAFICOS_PADRAO.prova),
  DOCX_TEMPLATE: z.string().default('./templates/relatorio.docx'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

/** Valida as variáveis de ambiente. Lança AppError com a lista de problemas em português. */
export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const resultado = configSchema.safeParse(env);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new AppError(`Configuração inválida: ${problemas}`, 'CONFIG');
  }
  return resultado.data;
}

/**
 * Lê o arquivo de ambiente (ENV_FILE ou .env, se existir) e devolve a configuração validada.
 * Variáveis já definidas no ambiente têm prioridade sobre o arquivo. Não altera `process.env`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const arquivo = env.ENV_FILE ?? '.env';
  if (!existsSync(arquivo)) {
    if (env.ENV_FILE) throw new AppError(`Arquivo de ambiente não encontrado: ${arquivo}`, 'CONFIG');
    return parseConfig(env);
  }
  const doArquivo = parseEnv(readFileSync(arquivo, 'utf8'));
  return parseConfig({ ...doArquivo, ...env });
}
