import path from 'node:path';
import type { Config } from '../config/env.js';
import type { Sentenca } from '../domain/schemas.js';

export interface Caminhos {
  raw: string;
  processed: string;
  work: string;
  output: string;
  manifest: string;
  modelo: string;
  avisos: string;
  sentenca: (s: Sentenca) => string;
}

/** Caminhos absolutos dos artefatos intermediários e finais (ARQUITETURA §2). */
export function resolverCaminhos(config: Pick<Config, 'DATA_DIR' | 'WORK_DIR' | 'OUTPUT_DIR'>): Caminhos {
  const raw = path.resolve(config.DATA_DIR, 'raw');
  const processed = path.resolve(config.DATA_DIR, 'processed');
  return {
    raw,
    processed,
    work: path.resolve(config.WORK_DIR),
    output: path.resolve(config.OUTPUT_DIR),
    manifest: path.join(raw, 'manifest.json'),
    modelo: path.join(processed, 'model.json'),
    avisos: path.join(processed, 'warnings.json'),
    sentenca: (s) => path.join(raw, `${s}.json`),
  };
}

/** Pasta absoluta de um relatório dentro de work/relatorios_<ts>/. */
export function pastaDoRelatorio(work: string, pastaRaiz: string, caminho: readonly string[]): string {
  return path.join(work, pastaRaiz, ...caminho);
}
