/** Paleta oficial do projeto (ver .claude/docs/REGRAS_DE_NEGOCIO.md §4.3). */
export const CORES = {
  azulEscuro: '#164194',
  azul: '#008BD2',
  verdeAgua: '#6CC2BA',
  verde: '#52AE32',
  laranja: '#E84910',
  branco: '#FFFFFF',
  cinzaTexto: '#333333',
} as const;

export const FAIXAS = {
  boa: 4,
  regular: 3,
} as const;

/** Cor da faixa de uma média (≥4 verde, ≥3 azul, <3 laranja). Sem média → azul-escuro (neutro). */
export function corDaMedia(media: number | null): string {
  if (media === null || Number.isNaN(media)) return CORES.azulEscuro;
  if (media >= FAIXAS.boa) return CORES.verde;
  if (media >= FAIXAS.regular) return CORES.azul;
  return CORES.laranja;
}

/** Cor sem o "#", formato usado por docx/exceljs. */
export function hex(cor: string): string {
  return cor.replace('#', '').toUpperCase();
}
