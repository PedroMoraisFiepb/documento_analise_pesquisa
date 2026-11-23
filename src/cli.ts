import { executarClean } from './commands/clean.js';
import { criarContexto } from './commands/context.js';
import { executarFetch } from './commands/fetch.js';
import { executarPackage } from './commands/package.js';
import { executarPipeline } from './commands/pipeline.js';
import { executarRenderCharts, executarRenderDocx, executarRenderXlsx } from './commands/render.js';
import { executarTransform } from './commands/transform.js';
import { loadConfig } from './config/env.js';
import { AppError } from './shared/errors.js';
import { createLogger } from './shared/logger.js';

const COMANDOS = [
  'fetch',
  'transform',
  'render:charts',
  'render:xlsx',
  'render:docx',
  'package',
  'pipeline',
  'clean',
];

function opcao(args: string[], nome: string): string | undefined {
  const prefixo = `--${nome}=`;
  return args.find((a) => a.startsWith(prefixo))?.slice(prefixo.length);
}

async function main(): Promise<void> {
  const [comando, ...args] = process.argv.slice(2);
  if (!comando || !COMANDOS.includes(comando)) {
    console.error(`Uso: npm run <comando>\nComandos: ${COMANDOS.join(', ')}`);
    process.exitCode = 2;
    return;
  }
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const ctx = criarContexto(config, logger);
  const render = { apenasUnidade: opcao(args, 'only') };
  try {
    switch (comando) {
      case 'fetch':
        await executarFetch(ctx);
        break;
      case 'transform':
        await executarTransform(ctx);
        break;
      case 'render:charts':
        await executarRenderCharts(ctx, render);
        break;
      case 'render:xlsx':
        await executarRenderXlsx(ctx, render);
        break;
      case 'render:docx':
        await executarRenderDocx(ctx, render);
        break;
      case 'package':
        await executarPackage(ctx);
        break;
      case 'pipeline':
        await executarPipeline(ctx);
        break;
      case 'clean':
        await executarClean(ctx);
        break;
    }
  } catch (erro) {
    if (erro instanceof AppError) logger.error(erro.message);
    else logger.error({ err: erro }, 'Erro inesperado');
    process.exitCode = 1;
  } finally {
    logger.flush();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof AppError ? erro.message : erro);
  process.exitCode = 1;
});
