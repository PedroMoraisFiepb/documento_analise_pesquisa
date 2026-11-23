import { spawn } from 'node:child_process';
import { AppError } from '../shared/errors.js';
import type { Contexto } from './context.js';

export const ETAPAS = [
  'fetch',
  'transform',
  'render:charts',
  'render:xlsx',
  'render:docx',
  'package',
] as const;
export type Etapa = (typeof ETAPAS)[number];

/** Executa uma etapa num subprocesso `node` (isola a memória das etapas pesadas). Resolve com o código de saída. */
export type ExecutorEtapa = (etapa: Etapa) => Promise<number>;

export function executorSubprocesso(script: string = process.argv[1] ?? ''): ExecutorEtapa {
  return (etapa) =>
    new Promise((resolve, reject) => {
      const filho = spawn(process.execPath, [...process.execArgv, script, etapa], {
        stdio: 'inherit',
        env: process.env,
      });
      filho.on('error', reject);
      filho.on('exit', (codigo, sinal) => resolve(codigo ?? (sinal ? 1 : 0)));
    });
}

/** Executa as etapas 1→6 em sequência; para no primeiro erro. */
export async function executarPipeline(
  ctx: Contexto,
  executar: ExecutorEtapa = executorSubprocesso(),
  etapas: readonly Etapa[] = ETAPAS,
): Promise<void> {
  const inicio = Date.now();
  for (const [i, etapa] of etapas.entries()) {
    ctx.logger.info(`▶ Etapa ${i + 1}/${etapas.length}: ${etapa}`);
    const codigo = await executar(etapa);
    if (codigo !== 0) {
      throw new AppError(`Etapa "${etapa}" falhou (código ${codigo}). Pipeline interrompido.`, 'PIPELINE');
    }
  }
  ctx.logger.info(`✔ Pipeline concluído em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
}
