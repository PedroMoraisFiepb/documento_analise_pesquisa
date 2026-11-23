import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipArchive } from 'archiver';
import { AppError } from '../shared/errors.js';
import { formatBytes } from '../shared/format.js';
import { type Contexto, lerModelo } from './context.js';

export interface ResultadoPackage {
  arquivo: string;
  bytes: number;
}

/** Etapa 6: compacta work/relatorios_<ts>/ em output/relatorios_<ts>.zip. */
export async function executarPackage(ctx: Contexto): Promise<ResultadoPackage> {
  const modelo = await lerModelo(ctx);
  const origem = path.join(ctx.caminhos.work, modelo.pastaRaiz);
  try {
    await stat(origem);
  } catch {
    throw new AppError(
      `Pasta não encontrada: ${origem}. Execute as etapas de renderização antes.`,
      'ARTEFATO_AUSENTE',
    );
  }
  await mkdir(ctx.caminhos.output, { recursive: true });
  const arquivo = path.join(ctx.caminhos.output, `${modelo.pastaRaiz}.zip`);

  const zip = new ZipArchive({ zlib: { level: 9 } });
  zip.on('warning', (e) => ctx.logger.warn(`Aviso ao compactar: ${e.message}`));
  zip.directory(origem, modelo.pastaRaiz);
  const escrita = pipeline(zip, createWriteStream(arquivo));
  await zip.finalize();
  await escrita;

  const { size } = await stat(arquivo);
  ctx.logger.info(`Pacote gerado: ${arquivo} (${formatBytes(size)})`);
  return { arquivo, bytes: size };
}
