import { describe, expect, it } from 'vitest';
import { Acumulador, NOTA, estatisticaVazia, media, percentuais } from '../../src/domain/scoring.js';

describe('scoring', () => {
  it('usa a escala A=5 … E=1', () => {
    expect(NOTA).toEqual({ A: 5, B: 4, C: 3, D: 2, E: 1 });
  });

  it('calcula média, respondentes distintos e distribuição', () => {
    const acc = new Acumulador();
    acc.adicionar('A', '1');
    acc.adicionar('B', '1');
    acc.adicionar('E', '2');
    expect(acc.resumo()).toEqual({
      respostas: 3,
      soma: 10,
      media: 10 / 3,
      respondentes: 2,
      distribuicao: { A: 1, B: 1, C: 0, D: 0, E: 1 },
    });
  });

  it('média ponderada por resposta difere da média das médias', () => {
    // Disciplina 1: 1 resposta A (5). Disciplina 2: 3 respostas E (1).
    const d1 = new Acumulador();
    d1.adicionar('A', 'x');
    const d2 = new Acumulador();
    for (const id of ['a', 'b', 'c']) d2.adicionar('E', id);
    const geral = new Acumulador();
    geral.mesclar(d1);
    geral.mesclar(d2);
    const mediaDasMedias = (5 + 1) / 2;
    expect(geral.resumo().media).toBe(2); // (5 + 1 + 1 + 1) / 4
    expect(geral.resumo().media).not.toBe(mediaDasMedias);
    expect(geral.resumo().respondentes).toBe(4);
  });

  it('mesclar une respondentes repetidos', () => {
    const a = new Acumulador();
    a.adicionar('A', '1');
    const b = new Acumulador();
    b.adicionar('C', '1');
    a.mesclar(b);
    expect(a.resumo().respondentes).toBe(1);
    expect(a.resumo().distribuicao).toMatchObject({ A: 1, C: 1 });
  });

  it('distribuição percentual soma 100%', () => {
    const p = percentuais({ A: 3, B: 1, C: 1, D: 1, E: 1 });
    expect(Object.values(p).reduce((s, v) => s + v, 0)).toBeCloseTo(100, 10);
    expect(p.A).toBeCloseTo(42.857, 2);
  });

  it('sem respostas → média null e percentuais zerados', () => {
    expect(media(0, 0)).toBeNull();
    expect(estatisticaVazia()).toMatchObject({ respostas: 0, media: null, respondentes: 0 });
    expect(percentuais({ A: 0, B: 0, C: 0, D: 0, E: 0 })).toEqual({ A: 0, B: 0, C: 0, D: 0, E: 0 });
  });
});
