import { readFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { SENTENCAS, type Sentenca } from '../src/domain/schemas.js';
import { CAMINHO_CONSULTA, cabecalhoBasic } from '../src/infra/totvs-client.js';
import { type DadosMock, gerarDadosMock } from './generator.js';

export interface OpcoesServidorMock {
  dados: DadosMock;
  usuario: string;
  senha: string;
}

function json(res: import('node:http').ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

/** Servidor HTTP que imita o endpoint ExecutaConsultaSQL do TOTVS RM (com Basic auth). */
export function criarServidorMock({ dados, usuario, senha }: OpcoesServidorMock): Server {
  const esperado = cabecalhoBasic(usuario, senha);
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
    if (req.method !== 'GET' || url.pathname !== CAMINHO_CONSULTA) {
      return json(res, 404, { message: 'Recurso não encontrado' });
    }
    if (req.headers.authorization !== esperado) {
      res.setHeader('WWW-Authenticate', 'Basic realm="TOTVS"');
      return json(res, 401, { message: 'Não autorizado' });
    }
    const sentenca = url.searchParams.get('codSentenca') ?? '';
    if (!(SENTENCAS as readonly string[]).includes(sentenca)) {
      return json(res, 404, { message: `Sentença ${sentenca} não encontrada` });
    }
    return json(res, 200, dados[sentenca as Sentenca]);
  });
}

/** Sobe o servidor e devolve a URL base (porta 0 → porta aleatória). */
export async function iniciarServidorMock(
  opcoes: OpcoesServidorMock,
  porta = 0,
): Promise<{ servidor: Server; url: string; fechar: () => Promise<void> }> {
  const servidor = criarServidorMock(opcoes);
  await new Promise<void>((resolve) => servidor.listen(porta, resolve));
  const { port } = servidor.address() as AddressInfo;
  return {
    servidor,
    url: `http://127.0.0.1:${port}`,
    fechar: () => new Promise<void>((resolve, reject) => servidor.close((e) => (e ? reject(e) : resolve()))),
  };
}

/** Lê mock/data/*.json; se ausentes, gera em memória com a seed padrão. */
export async function carregarDadosMock(pasta: string): Promise<DadosMock> {
  try {
    const entradas = await Promise.all(
      SENTENCAS.map(
        async (s) => [s, JSON.parse(await readFile(path.join(pasta, `${s}.json`), 'utf8'))] as const,
      ),
    );
    return Object.fromEntries(entradas) as DadosMock;
  } catch {
    return gerarDadosMock();
  }
}
