import { type Envelope, envelopeSchema, type Sentenca } from '../domain/schemas.js';
import { AppError } from '../shared/errors.js';

export const CAMINHO_CONSULTA = '/FrameHTML/rm/api/TOTVSCustomizacao/ConsultasSQL/ExecutaConsultaSQL';

export interface OpcoesTotvs {
  baseUrl: string;
  coligada: string;
  sistema: string;
  usuario: string;
  senha: string;
  timeoutMs: number;
  tentativas: number;
  /** Atraso base do backoff exponencial (ms). */
  atrasoBaseMs?: number;
  fetchImpl?: typeof fetch;
  aoTentarNovamente?: (info: {
    sentenca: Sentenca;
    tentativa: number;
    motivo: string;
    esperaMs: number;
  }) => void;
}

export class TotvsError extends AppError {
  constructor(
    message: string,
    codigo: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, codigo, options);
    this.name = 'TotvsError';
  }
}

/** Monta a URL da sentença (`parameters=` sempre vazio, P4). */
export function montarUrl(baseUrl: string, coligada: string, sistema: string, sentenca: string): string {
  const url = new URL(CAMINHO_CONSULTA, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.searchParams.set('codColigada', coligada);
  url.searchParams.set('codSistema', sistema);
  url.searchParams.set('codSentenca', sentenca);
  url.searchParams.set('parameters', '');
  return url.toString();
}

export function cabecalhoBasic(usuario: string, senha: string): string {
  return `Basic ${Buffer.from(`${usuario}:${senha}`, 'utf8').toString('base64')}`;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Erro transitório: pode ser repetido (5xx, rede, timeout). */
class ErroTransitorio extends Error {}

export function criarClienteTotvs(opcoes: OpcoesTotvs) {
  const doFetch = opcoes.fetchImpl ?? fetch;
  const atrasoBase = opcoes.atrasoBaseMs ?? 1000;

  async function tentar(sentenca: Sentenca): Promise<Envelope> {
    const url = montarUrl(opcoes.baseUrl, opcoes.coligada, opcoes.sistema, sentenca);
    let resposta: Response;
    try {
      resposta = await doFetch(url, {
        headers: { Authorization: cabecalhoBasic(opcoes.usuario, opcoes.senha), Accept: 'application/json' },
        signal: AbortSignal.timeout(opcoes.timeoutMs),
      });
    } catch (erro) {
      const nome = (erro as Error).name;
      const motivo =
        nome === 'TimeoutError' || nome === 'AbortError'
          ? `tempo limite de ${opcoes.timeoutMs} ms excedido`
          : `falha de rede (${(erro as Error).message})`;
      throw new ErroTransitorio(motivo, { cause: erro });
    }

    if (resposta.status === 401 || resposta.status === 403) {
      throw new TotvsError(
        `Acesso negado ao TOTVS (${resposta.status}) ao buscar ${sentenca}. Verifique TOTVS_USER e TOTVS_PASSWORD.`,
        'TOTVS_AUTH',
        resposta.status,
      );
    }
    if (resposta.status === 404) {
      throw new TotvsError(
        `Sentença ${sentenca} não encontrada (404). Confira o código da sentença, a coligada e o sistema.`,
        'TOTVS_NAO_ENCONTRADA',
        404,
      );
    }
    if (resposta.status >= 500) throw new ErroTransitorio(`erro do servidor (${resposta.status})`);
    if (!resposta.ok) {
      throw new TotvsError(
        `Erro HTTP ${resposta.status} ao buscar ${sentenca}.`,
        'TOTVS_HTTP',
        resposta.status,
      );
    }

    let corpo: unknown;
    try {
      corpo = await resposta.json();
    } catch (erro) {
      throw new TotvsError(`Resposta de ${sentenca} não é um JSON válido.`, 'TOTVS_JSON', resposta.status, {
        cause: erro,
      });
    }
    const envelope = envelopeSchema.safeParse(corpo);
    if (!envelope.success) {
      throw new TotvsError(
        `Resposta de ${sentenca} fora do formato esperado { "Row": [...] }.`,
        'TOTVS_ENVELOPE',
        resposta.status,
      );
    }
    return envelope.data;
  }

  /** Busca uma sentença com retry exponencial em erros transitórios (5xx, rede, timeout). */
  async function buscarSentenca(sentenca: Sentenca): Promise<Envelope> {
    for (let tentativa = 0; ; tentativa++) {
      try {
        return await tentar(sentenca);
      } catch (erro) {
        if (!(erro instanceof ErroTransitorio)) throw erro;
        if (tentativa >= opcoes.tentativas) {
          throw new TotvsError(
            `Não foi possível buscar ${sentenca} após ${tentativa + 1} tentativa(s): ${erro.message}.`,
            'TOTVS_INDISPONIVEL',
            undefined,
            { cause: erro },
          );
        }
        const esperaMs = atrasoBase * 2 ** tentativa;
        opcoes.aoTentarNovamente?.({ sentenca, tentativa: tentativa + 1, motivo: erro.message, esperaMs });
        await esperar(esperaMs);
      }
    }
  }

  return { buscarSentenca };
}

export type ClienteTotvs = ReturnType<typeof criarClienteTotvs>;
