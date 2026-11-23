import { z } from 'zod';

export const SENTENCAS = ['EDU.BI.004', 'EDU.BI.005', 'EDU.BI.006', 'EDU.BI.009'] as const;
export type Sentenca = (typeof SENTENCAS)[number];

/** Texto tolerante: null/undefined → "", números → string. */
const texto = z.preprocess((v) => (v === null || v === undefined ? '' : String(v)), z.string());
/** Identificador (pode vir como número ou texto) normalizado para string. */
const id = z.preprocess(
  (v) => (v === null || v === undefined ? v : String(v).trim()),
  z.string().min(1, 'identificador vazio'),
);
const inteiro = z.coerce.number().int();
const numeroOpcional = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? null : v),
  z.coerce.number().nullable(),
);

export const envelopeSchema = z.object({ Row: z.array(z.unknown()) });
export type Envelope = z.infer<typeof envelopeSchema>;

export const linha004Schema = z.object({
  CODPROVA: inteiro,
  NOME: texto,
  TEXTO: texto,
  ID_INSCRICAO: id,
  CODQUESTAO: inteiro,
  CODRESPOSTA: texto,
  PROFESSOR: texto,
  DESCOBJETOAVALIADO: texto,
  UNIDADE: texto,
  MODALIDADE: texto,
  CURSO_NOME_TRATADO: texto,
  CURSO: texto,
  CODHABILITACAO: texto,
  SERIE: texto,
  ANO: texto,
  CODTURMA: texto,
  TURMA: texto,
});
export type Linha004 = z.infer<typeof linha004Schema>;

export const linha005Schema = z.object({
  DESCOBJETOAVALIADO: texto,
  PROFESSOR: texto,
  DISCIPLINA: texto,
  CODTURMA: texto,
  TURMA: texto,
  QUANT_ALUNOS: z.coerce.number().int().min(0),
  QUANT_RESPOSTAS: z.coerce.number().int().min(0),
  PORCENTAGEM_RESPOSTAS: numeroOpcional,
  QUANTIDADE_ALUNOS_TURMA: z.coerce.number().int().min(0),
  UNIDADE: texto,
  CURSO: texto,
  SERIE: texto,
  ANO: texto,
  MODALIDADE: texto,
});
export type Linha005 = z.infer<typeof linha005Schema>;

export const linha006Schema = z.object({
  CODPROVA: inteiro,
  PROVA: texto,
  TEXTO: texto,
  ID_INSCRICAO: id,
  CODQUESTAO: inteiro,
  CODRESPOSTA: texto,
  DESCOBJETOAVALIADO: texto,
  UNIDADE: texto,
});
export type Linha006 = z.infer<typeof linha006Schema>;

/** EDU.BI.009 — provas respondidas por **professores** (mesmos campos do 006; o respondente é o professor). */
export const linha009Schema = linha006Schema;
export type Linha009 = z.infer<typeof linha009Schema>;

const schemasPorSentenca = {
  'EDU.BI.004': linha004Schema,
  'EDU.BI.005': linha005Schema,
  'EDU.BI.006': linha006Schema,
  'EDU.BI.009': linha009Schema,
} as const;

export interface LinhaRejeitada {
  indice: number;
  erro: string;
}

export interface ResultadoParse<T> {
  linhas: T[];
  rejeitadas: LinhaRejeitada[];
}

/** Valida cada linha da sentença; linhas inválidas são separadas (não interrompem o processamento). */
export function parseLinhas<S extends Sentenca>(
  sentenca: S,
  envelope: Envelope,
): ResultadoParse<z.infer<(typeof schemasPorSentenca)[S]>> {
  const schema = schemasPorSentenca[sentenca];
  const linhas: z.infer<(typeof schemasPorSentenca)[S]>[] = [];
  const rejeitadas: LinhaRejeitada[] = [];
  envelope.Row.forEach((bruta, indice) => {
    const r = schema.safeParse(bruta);
    if (r.success) linhas.push(r.data as z.infer<(typeof schemasPorSentenca)[S]>);
    else
      rejeitadas.push({
        indice,
        erro: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
  });
  return { linhas, rejeitadas };
}
