import type { Config } from '../config/env.js';
import { type Modelo, VERSAO_MODELO } from '../domain/model.js';
import { lerJson } from '../infra/fs-store.js';
import { type Caminhos, resolverCaminhos } from '../infra/paths.js';
import { AppError } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';

export interface Contexto {
  config: Config;
  logger: Logger;
  caminhos: Caminhos;
}

export function criarContexto(config: Config, logger: Logger): Contexto {
  return { config, logger, caminhos: resolverCaminhos(config) };
}

/** Lê data/processed/model.json, validando a versão. */
export async function lerModelo(ctx: Contexto): Promise<Modelo> {
  const modelo = await lerJson<Modelo>(ctx.caminhos.modelo, 'transform');
  if (modelo.versao !== VERSAO_MODELO) {
    throw new AppError(
      `model.json na versão ${String(modelo.versao)}, esperada ${VERSAO_MODELO}. Execute \`npm run transform\` novamente.`,
      'MODELO_VERSAO',
    );
  }
  return modelo;
}
