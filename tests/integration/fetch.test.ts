import { readFile } from 'node:fs/promises';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clienteDaConfig, executarFetch, type Manifesto } from '../../src/commands/fetch.js';
import { SENTENCAS } from '../../src/domain/schemas.js';
import { CAMINHO_CONSULTA } from '../../src/infra/totvs-client.js';
import { type Ambiente, criarAmbiente, lerFixture } from '../helpers/contexto.js';

const BASE = 'http://totvs.msw';
const servidor = setupServer();
beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }));
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());

let amb: Ambiente;
afterEach(() => amb?.limpar());

describe('npm run fetch', () => {
  it('grava todas as sentenças e o manifest', async () => {
    const fixture = await lerFixture('minimal');
    servidor.use(
      http.get(`${BASE}${CAMINHO_CONSULTA}`, ({ request }) => {
        const s = new URL(request.url).searchParams.get('codSentenca') as keyof typeof fixture;
        return HttpResponse.json(fixture[s]);
      }),
    );
    amb = await criarAmbiente({ TOTVS_BASE_URL: BASE });
    const manifesto = await executarFetch(amb.ctx);
    expect(manifesto.sentencas['EDU.BI.004'].linhas).toBe(fixture['EDU.BI.004'].Row.length);
    expect(manifesto.sentencas['EDU.BI.006'].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifesto.sentencas['EDU.BI.009'].linhas).toBe(fixture['EDU.BI.009'].Row.length);
    const raw = JSON.parse(await readFile(amb.ctx.caminhos.sentenca('EDU.BI.005'), 'utf8'));
    expect(raw).toEqual(fixture['EDU.BI.005']);
    const gravado = JSON.parse(await readFile(amb.ctx.caminhos.manifest, 'utf8')) as Manifesto;
    expect(gravado.origem).toBe(BASE);
  });

  it('repete após 500 e conclui', async () => {
    let chamadas = 0;
    servidor.use(
      http.get(`${BASE}${CAMINHO_CONSULTA}`, () =>
        chamadas++ === 0 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ Row: [] }),
      ),
    );
    amb = await criarAmbiente({ TOTVS_BASE_URL: BASE });
    const manifesto = await executarFetch(amb.ctx);
    expect(Object.values(manifesto.sentencas).every((s) => s.linhas === 0)).toBe(true);
    expect(chamadas).toBe(SENTENCAS.length + 1); // uma por sentença + 1 nova tentativa
  });

  it('falha com mensagem clara em 401', async () => {
    servidor.use(http.get(`${BASE}${CAMINHO_CONSULTA}`, () => new HttpResponse(null, { status: 401 })));
    amb = await criarAmbiente({ TOTVS_BASE_URL: BASE });
    await expect(executarFetch(amb.ctx)).rejects.toThrow(/Verifique TOTVS_USER e TOTVS_PASSWORD/);
  });

  it('falha com JSON inválido', async () => {
    servidor.use(http.get(`${BASE}${CAMINHO_CONSULTA}`, () => new HttpResponse('nada', { status: 200 })));
    amb = await criarAmbiente({ TOTVS_BASE_URL: BASE });
    await expect(executarFetch(amb.ctx)).rejects.toThrow(/não é um JSON válido/);
  });

  it('exige credenciais', async () => {
    amb = await criarAmbiente({ TOTVS_BASE_URL: BASE, TOTVS_USER: '', TOTVS_PASSWORD: '' });
    expect(() => clienteDaConfig(amb.ctx)).toThrow(/Defina TOTVS_USER e TOTVS_PASSWORD/);
  });
});
