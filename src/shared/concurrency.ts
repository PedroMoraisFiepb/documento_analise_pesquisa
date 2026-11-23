/** Executa `fn` sobre `itens` com no máximo `limite` tarefas simultâneas, preservando a ordem do resultado. */
export async function mapLimit<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i] as T, i);
    }
  });
  await Promise.all(trabalhadores);
  return resultados;
}
