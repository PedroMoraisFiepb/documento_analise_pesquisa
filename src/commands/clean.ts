import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { Contexto } from './context.js';

/** Remove data/ e work/ (artefatos intermediários). Não apaga output/. */
export async function executarClean(ctx: Contexto): Promise<string[]> {
  const alvos = [path.dirname(ctx.caminhos.raw), ctx.caminhos.work];
  for (const alvo of alvos) await rm(alvo, { recursive: true, force: true });
  ctx.logger.info(`Removido: ${alvos.join(', ')}`);
  return alvos;
}
