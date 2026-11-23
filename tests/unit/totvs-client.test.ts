import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CAMINHO_CONSULTA,
  cabecalhoBasic,
  criarClienteTotvs,
  montarUrl,
} from '../../src/infra/totvs-client.js';

const BASE = 'https://totvs.teste';
const URL_CONSULTA = `${BASE}${CAMINHO_CONSULTA}`;
const servidor = setupServer();

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }));
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());

const cliente = (extra: Partial<Parameters<typeof criarClienteTotvs>[0]> = {}) =>
  criarClienteTotvs({
    baseUrl: BASE,
    coligada: '2',
    sistema: 'S',
    usuario: 'u',
    senha: 'p',
    timeoutMs: 1000,
    tentativas: 2,
    atrasoBaseMs: 1,
    ...extra,
  });

describe('montarUrl / cabecalhoBasic', () => {
  it('monta a URL com parameters vazio', () => {
    expect(montarUrl('https://gestaoescolar.fiepb.org.br', '2', 'S', 'EDU.BI.004')).toBe(
      'https://gestaoescolar.fiepb.org.br/FrameHTML/rm/api/TOTVSCustomizacao/ConsultasSQL/ExecutaConsultaSQL' +
        '?codColigada=2&codSistema=S&codSentenca=EDU.BI.004&parameters=',
    );
    expect(montarUrl('https://x.com/', '1', 'S', 'A')).toContain('https://x.com/FrameHTML/');
  });

  it('gera cabeçalho Basic', () => {
    expect(cabecalhoBasic('usuário', 'senha')).toBe(
      `Basic ${Buffer.from('usuário:senha').toString('base64')}`,
    );
  });
});

describe('criarClienteTotvs', () => {
  it('envia Basic auth e os parâmetros, e devolve o envelope', async () => {
    let recebido: Request | undefined;
    servidor.use(
      http.get(URL_CONSULTA, ({ request }) => {
        recebido = request;
        return HttpResponse.json({ Row: [{ a: 1 }] });
      }),
    );
    const env = await cliente().buscarSentenca('EDU.BI.005');
    expect(env.Row).toHaveLength(1);
    expect(recebido?.headers.get('authorization')).toBe(cabecalhoBasic('u', 'p'));
    const url = new URL(recebido!.url);
    expect(url.searchParams.get('codSentenca')).toBe('EDU.BI.005');
    expect(url.searchParams.get('codColigada')).toBe('2');
  });

  it('repete em 5xx e depois tem sucesso', async () => {
    let chamadas = 0;
    servidor.use(
      http.get(URL_CONSULTA, () => {
        chamadas++;
        return chamadas < 3 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ Row: [] });
      }),
    );
    const aoTentarNovamente = vi.fn();
    await expect(cliente({ aoTentarNovamente }).buscarSentenca('EDU.BI.004')).resolves.toEqual({ Row: [] });
    expect(chamadas).toBe(3);
    expect(aoTentarNovamente).toHaveBeenCalledTimes(2);
    expect(aoTentarNovamente.mock.calls[1]?.[0]).toMatchObject({ tentativa: 2, esperaMs: 2 });
  });

  it('desiste após esgotar as tentativas', async () => {
    servidor.use(http.get(URL_CONSULTA, () => new HttpResponse(null, { status: 500 })));
    await expect(cliente().buscarSentenca('EDU.BI.004')).rejects.toMatchObject({
      codigo: 'TOTVS_INDISPONIVEL',
      message: expect.stringContaining('após 3 tentativa(s)'),
    });
  });

  it('não repete em 4xx', async () => {
    let chamadas = 0;
    servidor.use(
      http.get(URL_CONSULTA, () => {
        chamadas++;
        return new HttpResponse(null, { status: 400 });
      }),
    );
    await expect(cliente().buscarSentenca('EDU.BI.004')).rejects.toMatchObject({
      codigo: 'TOTVS_HTTP',
      status: 400,
    });
    expect(chamadas).toBe(1);
  });

  it.each([401, 403])('mensagem clara para %i', async (status) => {
    servidor.use(http.get(URL_CONSULTA, () => new HttpResponse(null, { status })));
    await expect(cliente().buscarSentenca('EDU.BI.004')).rejects.toThrow(/TOTVS_USER e TOTVS_PASSWORD/);
  });

  it('mensagem clara para 404', async () => {
    servidor.use(http.get(URL_CONSULTA, () => new HttpResponse(null, { status: 404 })));
    await expect(cliente().buscarSentenca('EDU.BI.006')).rejects.toMatchObject({
      codigo: 'TOTVS_NAO_ENCONTRADA',
    });
  });

  it('timeout é transitório e gera mensagem clara', async () => {
    servidor.use(
      http.get(URL_CONSULTA, async () => {
        await delay(200);
        return HttpResponse.json({ Row: [] });
      }),
    );
    await expect(cliente({ timeoutMs: 20, tentativas: 1 }).buscarSentenca('EDU.BI.004')).rejects.toThrow(
      /tempo limite de 20 ms/,
    );
  });

  it('falha de rede é transitória', async () => {
    servidor.use(http.get(URL_CONSULTA, () => HttpResponse.error()));
    await expect(cliente({ tentativas: 0 }).buscarSentenca('EDU.BI.004')).rejects.toThrow(/falha de rede/);
  });

  it('rejeita JSON inválido', async () => {
    servidor.use(http.get(URL_CONSULTA, () => new HttpResponse('<html>', { status: 200 })));
    await expect(cliente().buscarSentenca('EDU.BI.004')).rejects.toMatchObject({ codigo: 'TOTVS_JSON' });
  });

  it('rejeita envelope fora do formato', async () => {
    servidor.use(http.get(URL_CONSULTA, () => HttpResponse.json([{ a: 1 }])));
    await expect(cliente().buscarSentenca('EDU.BI.004')).rejects.toMatchObject({ codigo: 'TOTVS_ENVELOPE' });
  });
});
