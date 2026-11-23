import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gerarDadosMock } from '../../mock/generator.js';
import { carregarDadosMock, iniciarServidorMock } from '../../mock/server.js';
import { SENTENCAS } from '../../src/domain/schemas.js';
import {
  CAMINHO_CONSULTA,
  cabecalhoBasic,
  criarClienteTotvs,
  montarUrl,
} from '../../src/infra/totvs-client.js';

describe('servidor do mock', () => {
  const dados = gerarDadosMock();
  let srv: Awaited<ReturnType<typeof iniciarServidorMock>>;
  beforeAll(async () => {
    srv = await iniciarServidorMock({ dados, usuario: 'mock', senha: 'segredo' });
  });
  afterAll(() => srv.fechar());

  it('responde todas as sentenças (inclusive EDU.BI.009) com Basic auth em porta aleatória', async () => {
    const cliente = criarClienteTotvs({
      baseUrl: srv.url,
      coligada: '2',
      sistema: 'S',
      usuario: 'mock',
      senha: 'segredo',
      timeoutMs: 5000,
      tentativas: 0,
    });
    for (const s of SENTENCAS) {
      const env = await cliente.buscarSentenca(s);
      expect(env.Row.length).toBe(dados[s].Row.length);
    }
  });

  it('exige autenticação', async () => {
    const r = await fetch(montarUrl(srv.url, '2', 'S', 'EDU.BI.004'), {
      headers: { Authorization: cabecalhoBasic('mock', 'errada') },
    });
    expect(r.status).toBe(401);
  });

  it('404 para sentença desconhecida e para outros caminhos', async () => {
    const auth = { Authorization: cabecalhoBasic('mock', 'segredo') };
    expect((await fetch(montarUrl(srv.url, '2', 'S', 'EDU.BI.999'), { headers: auth })).status).toBe(404);
    expect((await fetch(`${srv.url}/outro`, { headers: auth })).status).toBe(404);
    expect((await fetch(`${srv.url}${CAMINHO_CONSULTA}`, { method: 'POST', headers: auth })).status).toBe(
      404,
    );
    expect((await fetch(`${srv.url}/health`)).status).toBe(200);
  });

  it('carrega mock/data e, na ausência, gera em memória', async () => {
    const versionados = await carregarDadosMock(path.resolve('mock/data'));
    expect(versionados).toEqual(dados);
    const vazio = await mkdtemp(path.join(os.tmpdir(), 'mock-vazio-'));
    expect(await carregarDadosMock(vazio)).toEqual(dados);
    await rm(vazio, { recursive: true, force: true });
  });
});
