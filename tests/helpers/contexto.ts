import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type Contexto, criarContexto } from '../../src/commands/context.js';
import { parseConfig } from '../../src/config/env.js';
import { type Envelope, SENTENCAS } from '../../src/domain/schemas.js';
import { createSilentLogger } from '../../src/shared/logger.js';

export const FIXTURES = path.resolve('tests/fixtures');
/** Data fixa usada nos testes (15h30 em America/Recife). */
export const AGORA = new Date('2026-11-12T18:30:00.000Z');

export interface Ambiente {
  dir: string;
  ctx: Contexto;
  limpar: () => Promise<void>;
}

/** Cria um diretório temporário com data/, work/ e output/ e um contexto apontando para ele. */
export async function criarAmbiente(env: Record<string, string> = {}): Promise<Ambiente> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'relatorios-teste-'));
  const config = parseConfig({
    DATA_DIR: path.join(dir, 'data'),
    WORK_DIR: path.join(dir, 'work'),
    OUTPUT_DIR: path.join(dir, 'output'),
    TOTVS_USER: 'usuario',
    TOTVS_PASSWORD: 'senha',
    HTTP_RETRIES: '2',
    LOG_LEVEL: 'silent',
    ...env,
  });
  return {
    dir,
    ctx: criarContexto(config, createSilentLogger()),
    limpar: () => rm(dir, { recursive: true, force: true }),
  };
}

/** Copia um conjunto de fixtures (minimal | edge) para data/raw. */
export async function copiarFixture(ctx: Contexto, nome: 'minimal' | 'edge'): Promise<void> {
  for (const s of SENTENCAS) await cp(path.join(FIXTURES, nome, `${s}.json`), ctx.caminhos.sentenca(s));
}

export async function lerFixture(
  nome: 'minimal' | 'edge',
): Promise<Record<(typeof SENTENCAS)[number], Envelope>> {
  const entradas = await Promise.all(
    SENTENCAS.map(
      async (s) => [s, JSON.parse(await readFile(path.join(FIXTURES, nome, `${s}.json`), 'utf8'))] as const,
    ),
  );
  return Object.fromEntries(entradas) as Record<(typeof SENTENCAS)[number], Envelope>;
}
