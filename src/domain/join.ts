import { chave, chaveUnidade, limparTexto, normalizarUnidade } from './normalize.js';
import type { Linha005 } from './schemas.js';

export const LIMITE_ADESAO_BAIXA = 50;

export interface Adesao {
  professor: string;
  disciplina: string;
  codTurma: string;
  turma: string;
  unidade: string;
  quantAlunos: number;
  quantRespostas: number;
  porcentagem: number;
  quantidadeAlunosTurma: number;
  curso: string;
  serie: string;
  ano: string;
  modalidade: string;
  baixa: boolean;
}

/** Chave de junção 004 × 005 (§2.3): professor, turma, disciplina e unidade normalizados. */
export function chaveAdesao(
  professor: string,
  codTurma: string,
  disciplina: string,
  unidade: string,
): string {
  return [chave(professor), chave(codTurma), chave(disciplina), chaveUnidade(unidade)].join('|');
}

/** Usa PORCENTAGEM_RESPOSTAS; se ausente, calcula QUANT_ALUNOS / QUANTIDADE_ALUNOS_TURMA × 100 (arredondado). */
export function calcularPorcentagem(
  linha: Pick<Linha005, 'PORCENTAGEM_RESPOSTAS' | 'QUANT_ALUNOS' | 'QUANTIDADE_ALUNOS_TURMA'>,
): number {
  if (linha.PORCENTAGEM_RESPOSTAS !== null) return linha.PORCENTAGEM_RESPOSTAS;
  if (linha.QUANTIDADE_ALUNOS_TURMA === 0) return 0;
  return Math.round((linha.QUANT_ALUNOS / linha.QUANTIDADE_ALUNOS_TURMA) * 100);
}

export function paraAdesao(linha: Linha005): Adesao {
  const porcentagem = calcularPorcentagem(linha);
  return {
    professor: limparTexto(linha.PROFESSOR),
    disciplina: limparTexto(linha.DISCIPLINA),
    codTurma: limparTexto(linha.CODTURMA),
    turma: limparTexto(linha.TURMA),
    unidade: normalizarUnidade(linha.UNIDADE),
    quantAlunos: linha.QUANT_ALUNOS,
    quantRespostas: linha.QUANT_RESPOSTAS,
    porcentagem,
    quantidadeAlunosTurma: linha.QUANTIDADE_ALUNOS_TURMA,
    curso: limparTexto(linha.CURSO),
    serie: limparTexto(linha.SERIE),
    ano: limparTexto(linha.ANO),
    modalidade: limparTexto(linha.MODALIDADE),
    baixa: porcentagem < LIMITE_ADESAO_BAIXA,
  };
}

/**
 * Chave alternativa 004 × 005: o próprio DESCOBJETOAVALIADO + unidade. Casa mesmo quando o texto vem truncado pelo
 * TOTVS (os dois lados são gerados da mesma descrição), situação em que a disciplina extraída do texto é parcial.
 */
export function chaveObjetoAdesao(descObjeto: string, unidade: string): string {
  return [chave(descObjeto), chaveUnidade(unidade)].join('|');
}

export interface IndiceAdesao {
  porChave: Map<string, Adesao>;
  /** Por DESCOBJETOAVALIADO + unidade (só linhas do 005 com o campo preenchido). */
  porObjeto: Map<string, Adesao>;
  duplicadas: Adesao[];
}

/** Indexa o 005 pela chave de junção. Repetições mantêm a primeira ocorrência. */
export function indexarAdesao(linhas: readonly Linha005[]): IndiceAdesao {
  const porChave = new Map<string, Adesao>();
  const porObjeto = new Map<string, Adesao>();
  const duplicadas: Adesao[] = [];
  for (const linha of linhas) {
    const a = paraAdesao(linha);
    const k = chaveAdesao(a.professor, a.codTurma, a.disciplina, a.unidade);
    if (porChave.has(k)) {
      duplicadas.push(a);
      continue;
    }
    porChave.set(k, a);
    const desc = limparTexto(linha.DESCOBJETOAVALIADO);
    const ko = chaveObjetoAdesao(desc, a.unidade);
    if (desc && !porObjeto.has(ko)) porObjeto.set(ko, a);
  }
  return { porChave, porObjeto, duplicadas };
}
