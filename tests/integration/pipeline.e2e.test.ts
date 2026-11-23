import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gerarDadosMock } from '../../mock/generator.js';
import { iniciarServidorMock } from '../../mock/server.js';
import { type Ambiente, criarAmbiente } from '../helpers/contexto.js';

/** E2E: `tsx src/cli.ts pipeline` (6 subprocessos) contra o servidor do mock em porta aleatória. */
describe('pipeline ponta a ponta com o mock', () => {
  let amb: Ambiente;
  let srv: Awaited<ReturnType<typeof iniciarServidorMock>>;

  beforeAll(async () => {
    srv = await iniciarServidorMock({ dados: gerarDadosMock(), usuario: 'e2e', senha: 'e2e' });
    amb = await criarAmbiente();
  });
  afterAll(async () => {
    await srv.fechar();
    await amb.limpar();
  });

  it(
    'gera o zip final com a árvore de relatórios',
    async () => {
      const env = {
        ...process.env,
        ENV_FILE: '',
        TOTVS_BASE_URL: srv.url,
        TOTVS_USER: 'e2e',
        TOTVS_PASSWORD: 'e2e',
        DATA_DIR: path.join(amb.dir, 'data'),
        WORK_DIR: path.join(amb.dir, 'work'),
        OUTPUT_DIR: path.join(amb.dir, 'output'),
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
      };
      const tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
      const codigo = await new Promise<number | null>((resolve, reject) => {
        const p = spawn(process.execPath, [tsx, 'src/cli.ts', 'pipeline'], { env, stdio: 'inherit' });
        p.on('error', reject);
        p.on('exit', resolve);
      });
      expect(codigo).toBe(0);

      const zips = await readdir(path.join(amb.dir, 'output'));
      expect(zips).toHaveLength(1);
      expect(zips[0]).toMatch(/^relatorios_\d{4}-\d{2}-\d{2}_\d{4}\.zip$/);
      const zip = await JSZip.loadAsync(await readFile(path.join(amb.dir, 'output', zips[0]!)));
      const nomes = Object.keys(zip.files).filter((n) => !n.endsWith('/'));
      const unidades = new Set(nomes.map((n) => n.split('/')[1]));
      expect([...unidades].sort()).toEqual([
        'Campina Grande',
        'João Pessoa',
        'Patos',
        'São José de Piranhas',
      ]);
      expect(nomes.filter((n) => n.endsWith('.docx')).length).toBe(
        nomes.filter((n) => n.endsWith('.xlsx')).length,
      );
      expect(nomes.filter((n) => n.endsWith('.png')).length).toBe(
        nomes.filter((n) => n.endsWith('.jpg')).length,
      );
      expect(nomes.some((n) => /\/Provas de Professores\/[^/]+\/imagens\/questao_\d+\.png$/.test(n))).toBe(
        true,
      );
      expect(nomes.some((n) => n.includes('EDU.BI'))).toBe(false);
      expect(nomes.some((n) => n.includes('/Alunos da EJA/Provas de Professores/'))).toBe(true);
      expect(nomes.some((n) => n.includes('Luiz Carlos - Neto/Luiz Carlos - Neto.docx'))).toBe(true);
    },
    15 * 60_000,
  );
});
