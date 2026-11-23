/**
 * Tipos de gráfico disponíveis (D23):
 * - `media`: barras com as médias (por questão no relatório de prova; por disciplina/turma no do professor);
 * - `questoes`: um gráfico por questão com a distribuição das respostas A–E.
 */
export const TIPOS_GRAFICO = ['media', 'questoes'] as const;
export type TipoGrafico = (typeof TIPOS_GRAFICO)[number];

/** Quais gráficos cada tipo de relatório recebe (env `GRAFICOS_PROFESSOR` / `GRAFICOS_PROVA`). */
export interface ConfigGraficos {
  professor: readonly TipoGrafico[];
  prova: readonly TipoGrafico[];
}

export const GRAFICOS_PADRAO: ConfigGraficos = { professor: ['questoes'], prova: ['media'] };
