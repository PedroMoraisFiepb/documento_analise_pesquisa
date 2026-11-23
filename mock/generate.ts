import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SENTENCAS } from '../src/domain/schemas.js';
import { SEED_PADRAO, gerarDadosMock } from './generator.js';

const pasta = path.resolve(process.env.MOCK_DATA_DIR ?? 'mock/data');
const seed = Number(process.env.MOCK_SEED ?? SEED_PADRAO);
const dados = gerarDadosMock(seed);
await mkdir(pasta, { recursive: true });
for (const s of SENTENCAS) {
  await writeFile(path.join(pasta, `${s}.json`), `${JSON.stringify(dados[s], null, 2)}\n`, 'utf8');
  console.log(`${s}: ${dados[s].Row.length} linha(s) → ${path.join(pasta, `${s}.json`)}`);
}
