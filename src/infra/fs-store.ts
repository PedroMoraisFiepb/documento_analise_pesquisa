import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../shared/errors.js';

/** Grava JSON de forma atômica (arquivo temporário + rename). Devolve o SHA-256 do conteúdo. */
export async function gravarJson(arquivo: string, dados: unknown): Promise<string> {
  await mkdir(path.dirname(arquivo), { recursive: true });
  const conteudo = JSON.stringify(dados, null, 2);
  const temp = `${arquivo}.${process.pid}.tmp`;
  await writeFile(temp, conteudo, 'utf8');
  await rename(temp, arquivo);
  return createHash('sha256').update(conteudo).digest('hex');
}

/** Lê JSON; se o arquivo não existir, orienta qual comando executar antes. */
export async function lerJson<T>(arquivo: string, comandoAnterior: string): Promise<T> {
  let conteudo: string;
  try {
    conteudo = await readFile(arquivo, 'utf8');
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AppError(
        `Arquivo não encontrado: ${arquivo}. Execute \`npm run ${comandoAnterior}\` antes.`,
        'ARTEFATO_AUSENTE',
      );
    }
    throw erro;
  }
  try {
    return JSON.parse(conteudo) as T;
  } catch (erro) {
    throw new AppError(
      `Arquivo JSON corrompido: ${arquivo}. Execute \`npm run ${comandoAnterior}\` novamente.`,
      'JSON',
      {
        cause: erro,
      },
    );
  }
}
