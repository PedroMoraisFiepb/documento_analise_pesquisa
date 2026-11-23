import type { Relatorio, RelatorioProva, ResumoTurmaDisciplina } from '../domain/model.js';

/** Encurta textos longos para rótulos de gráfico/tabela. */
export function truncar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Quebra o texto em linhas de até `max` caracteres (por palavra), com no máximo `maxLinhas` linhas;
 * o excedente é truncado com reticências.
 */
export function quebrarLinhas(texto: string, max: number, maxLinhas: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const candidata = atual ? `${atual} ${palavra}` : palavra;
    if (candidata.length <= max || !atual) {
      atual = candidata;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  const cortadas = linhas.map((l) => truncar(l, max));
  if (cortadas.length <= maxLinhas) return cortadas;
  const visiveis = cortadas.slice(0, maxLinhas);
  visiveis[maxLinhas - 1] = truncar(`${visiveis[maxLinhas - 1]} …`, max).replace(/\s…$/, '…');
  return visiveis;
}

export function rotuloQuestao(codQuestao: number, texto: string, max = 60): string {
  return truncar(texto ? `Q${codQuestao} – ${texto}` : `Q${codQuestao}`, max);
}

export function rotuloTurmaDisciplina(
  t: Pick<ResumoTurmaDisciplina, 'disciplina' | 'turma' | 'codTurma'>,
): string {
  return `${t.disciplina} – ${t.turma || t.codTurma}`;
}

export function nomeImagem(r: Relatorio): 'media_unidade' | 'media_professor' {
  return r.tipo === 'professor' ? 'media_professor' : 'media_unidade';
}

/** Quem respondeu a prova, para exibição (sem citar o código da consulta). */
export function rotuloRespondentes(r: Pick<RelatorioProva, 'fonte'>): 'Professores' | 'Alunos' {
  return r.fonte === 'EDU.BI.009' ? 'Professores' : 'Alunos';
}

/** Nome base das imagens do gráfico de uma questão (ex.: `questao_03`). */
export function nomeImagemQuestao(codQuestao: number): string {
  return `questao_${String(codQuestao).padStart(2, '0')}`;
}

/** Rótulo da modalidade para exibição (REGULAR → Regular). */
export function rotuloModalidade(modalidade: string): string {
  return modalidade
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    .replace(/\bEja\b/, 'EJA');
}
