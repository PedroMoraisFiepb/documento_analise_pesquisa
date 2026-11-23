export const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
export type Letra = (typeof LETRAS)[number];

/** `trim` + colapsa espaços internos. */
export function limparTexto(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim();
}

/** Remove o prefixo "Unidade " (qualquer caixa) e limpa espaços. Forma usada para exibição. */
export function normalizarUnidade(valor: string): string {
  return limparTexto(limparTexto(valor).replace(/^unidade\s+/i, ''));
}

/** Chave de comparação: sem acento, minúscula, espaços colapsados. */
export function chave(valor: string): string {
  return limparTexto(valor).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Chave de unidade (com ou sem prefixo "Unidade "). */
export function chaveUnidade(valor: string): string {
  return chave(normalizarUnidade(valor));
}

/** Normaliza CODRESPOSTA: aceita minúscula/espaços; fora de A–E → null (resposta inválida). */
export function normalizarResposta(valor: string): Letra | null {
  const letra = valor.trim().toUpperCase();
  return (LETRAS as readonly string[]).includes(letra) ? (letra as Letra) : null;
}
