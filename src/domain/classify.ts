import { limparTexto } from './normalize.js';

const PREFIXO = /^\s*professor\s*-\s*turma\s*-\s*disciplina\s*:\s*(.*)$/is;

export type Classificacao =
  | { tipo: 'professor'; professor: string; codTurma: string; disciplina: string }
  | { tipo: 'outra' }
  | { tipo: 'malformado'; motivo: string };

/**
 * Classifica o DESCOBJETOAVALIADO (EDU.BI.004/006) (REGRAS_DE_NEGOCIO §2.2).
 * "Professor - Turma - Disciplina: <PROFESSOR> - <CODTURMA> - <DISCIPLINA>" → avaliação de professor.
 * Os trechos são separados por " - " a partir da direita, para tolerar hífen no nome do professor.
 */
export function classificarObjetoAvaliado(descricao: string): Classificacao {
  const m = PREFIXO.exec(descricao ?? '');
  if (!m) return { tipo: 'outra' };
  // Após limparTexto, o separador exige espaço dos dois lados; logo nenhum trecho fica vazio.
  const partes = limparTexto(m[1] ?? '').split(/\s+-\s+/);
  if (partes.length < 3) {
    return { tipo: 'malformado', motivo: 'esperados 3 trechos (professor - turma - disciplina)' };
  }
  const disciplina = partes.pop() as string;
  const codTurma = partes.pop() as string;
  const professor = partes.join(' - ');
  return { tipo: 'professor', professor, codTurma, disciplina };
}

/**
 * Avaliação de professor do EDU.BI.004 (§2.1): PROFESSOR e CODTURMA vêm em campos próprios; a disciplina só existe
 * no DESCOBJETOAVALIADO. Quando o texto começa por "<PROFESSOR> - <CODTURMA> - ", a disciplina é todo o restante
 * (tolera hífen no nome da disciplina e texto truncado). Senão, usa o parser genérico (divisão pela direita).
 */
export function classificarAvaliacao004(
  descricao: string,
  professorCampo: string,
  codTurmaCampo: string,
): Classificacao {
  const professor = limparTexto(professorCampo);
  const codTurma = limparTexto(codTurmaCampo);
  const m = PREFIXO.exec(descricao ?? '');
  if (m && professor && codTurma) {
    const resto = limparTexto(m[1] ?? '');
    const comparar = (s: string) => s.toLocaleLowerCase('pt-BR');
    const inicio = `${professor} - ${codTurma} - `;
    if (comparar(resto).startsWith(comparar(inicio)) && resto.length > inicio.length) {
      return { tipo: 'professor', professor, codTurma, disciplina: resto.slice(inicio.length) };
    }
  }
  const c = classificarObjetoAvaliado(descricao);
  if (c.tipo !== 'professor') return c;
  return {
    tipo: 'professor',
    professor: professor || c.professor,
    codTurma: codTurma || c.codTurma,
    disciplina: c.disciplina,
  };
}
