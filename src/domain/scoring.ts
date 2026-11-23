import { LETRAS, type Letra } from './normalize.js';

/** Escala (D03): A=5, B=4, C=3, D=2, E=1. */
export const NOTA: Readonly<Record<Letra, number>> = { A: 5, B: 4, C: 3, D: 2, E: 1 };

export type Distribuicao = Record<Letra, number>;

export interface Estatistica {
  respostas: number;
  soma: number;
  media: number | null;
  respondentes: number;
  distribuicao: Distribuicao;
}

/** Acumulador incremental de respostas válidas. */
export class Acumulador {
  private soma = 0;
  private total = 0;
  private readonly inscricoes = new Set<string>();
  private readonly contagem: Distribuicao = { A: 0, B: 0, C: 0, D: 0, E: 0 };

  adicionar(letra: Letra, idInscricao: string): void {
    this.soma += NOTA[letra];
    this.total += 1;
    this.contagem[letra] += 1;
    this.inscricoes.add(idInscricao);
  }

  /** Incorpora outro acumulador (respondentes são unidos, não somados). */
  mesclar(outro: Acumulador): void {
    this.soma += outro.soma;
    this.total += outro.total;
    for (const l of LETRAS) this.contagem[l] += outro.contagem[l];
    for (const i of outro.inscricoes) this.inscricoes.add(i);
  }

  resumo(): Estatistica {
    return {
      respostas: this.total,
      soma: this.soma,
      media: media(this.soma, this.total),
      respondentes: this.inscricoes.size,
      distribuicao: { ...this.contagem },
    };
  }
}

/** Média ponderada por resposta (D04). Sem respostas → null. */
export function media(soma: number, total: number): number | null {
  return total === 0 ? null : soma / total;
}

/** Percentual (0–100) de cada alternativa. Sem respostas → tudo 0. */
export function percentuais(distribuicao: Distribuicao): Distribuicao {
  const total = LETRAS.reduce((s, l) => s + distribuicao[l], 0);
  const r = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  if (total === 0) return r;
  for (const l of LETRAS) r[l] = (distribuicao[l] / total) * 100;
  return r;
}

export function estatisticaVazia(): Estatistica {
  return new Acumulador().resumo();
}
