import type { Adesao } from './join.js';
import type { Letra } from './normalize.js';
import type { Sentenca } from './schemas.js';
import type { Estatistica } from './scoring.js';

export const VERSAO_MODELO = 2;

/** Sentenças que geram relatórios de prova: 009 (professores respondem) e 006 (demais provas dos alunos). */
export type FonteProva = 'EDU.BI.009' | 'EDU.BI.006';

export const GRUPO_PROFESSORES = 'Provas respondidas por professores';
export const PASTA_PROVAS_DE_PROFESSORES = 'Provas de Professores';

/** Resposta válida usada no cálculo (aba "Respostas"). */
export interface RespostaNormalizada {
  codProva: number;
  prova: string;
  codQuestao: number;
  texto: string;
  idInscricao: string;
  resposta: Letra;
  nota: number;
  objetoAvaliado: string;
  /** 004: professor avaliado pelos alunos. Ausente no 006 e no 009. */
  professor?: string;
  codTurma?: string;
  disciplina?: string;
}

export interface ResumoQuestao {
  codQuestao: number;
  texto: string;
  estatistica: Estatistica;
}

export interface ResumoObjeto {
  objeto: string;
  estatistica: Estatistica;
}

export interface ResumoTurmaDisciplina {
  codTurma: string;
  turma: string;
  disciplina: string;
  estatistica: Estatistica;
  adesao: Adesao | null;
}

interface RelatorioBase {
  /** Caminho relativo da pasta do relatório (segmentos), a partir da pasta raiz relatorios_<ts>. */
  caminho: string[];
  /** Nome base dos arquivos (.docx/.xlsx) dentro da pasta. */
  arquivoBase: string;
  unidade: string;
  grupo: string;
  resumo: Estatistica;
  respostasInvalidas: number;
  duplicadas: number;
  questoes: ResumoQuestao[];
  respostas: RespostaNormalizada[];
  avisos: string[];
}

export interface RelatorioProva extends RelatorioBase {
  tipo: 'prova';
  fonte: FonteProva;
  codProva: number;
  nome: string;
  /** Média por DESCOBJETOAVALIADO (preenchida no 009; relevante quando há mais de um objeto). */
  porObjeto: ResumoObjeto[];
}

export interface RelatorioProfessor extends RelatorioBase {
  tipo: 'professor';
  professor: string;
  modalidade: string;
  /** Média de todas as avaliações de professores da unidade × modalidade (referência). */
  mediaUnidade: number | null;
  porTurmaDisciplina: ResumoTurmaDisciplina[];
  adesao: Adesao[];
  semRespostas: boolean;
}

export type Relatorio = RelatorioProva | RelatorioProfessor;

export interface Grupo {
  nome: string;
  relatorios: Relatorio[];
}

export interface Unidade {
  nome: string;
  pasta: string;
  grupos: Grupo[];
}

export type TipoAviso =
  | 'linha-rejeitada'
  | 'resposta-invalida'
  | 'duplicada'
  | 'sem-par-005'
  | 'objeto-malformado'
  | 'adesao-duplicada'
  | 'adesao-baixa'
  | 'sem-respostas'
  | 'professor-no-006';

export interface Aviso {
  tipo: TipoAviso;
  sentenca: Sentenca;
  mensagem: string;
  detalhe?: Record<string, unknown>;
}

export interface Modelo {
  versao: typeof VERSAO_MODELO;
  carimbo: string;
  geradoEm: string;
  pastaRaiz: string;
  anoLetivo: string | null;
  unidades: Unidade[];
  totais: {
    unidades: number;
    relatorios: number;
    relatoriosProva: number;
    relatoriosProfessor: number;
    avisos: number;
  };
}

/** Lista todos os relatórios do modelo, na ordem da árvore. */
export function listarRelatorios(modelo: Modelo): Relatorio[] {
  return modelo.unidades.flatMap((u) => u.grupos.flatMap((g) => g.relatorios));
}

export function tituloRelatorio(r: Relatorio): string {
  return r.tipo === 'prova' ? r.nome : r.professor;
}
