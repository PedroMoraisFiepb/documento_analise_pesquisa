import { describe, expect, it } from 'vitest';
import {
  calcularPorcentagem,
  chaveAdesao,
  chaveObjetoAdesao,
  indexarAdesao,
  paraAdesao,
} from '../../src/domain/join.js';
import type { Linha005 } from '../../src/domain/schemas.js';

const linha = (extra: Partial<Linha005> = {}): Linha005 => ({
  DESCOBJETOAVALIADO: 'Professor - Turma - Disciplina: João da Silva - 1AEM - Matemática',
  PROFESSOR: 'João da Silva',
  DISCIPLINA: 'Matemática',
  CODTURMA: '1AEM',
  TURMA: '1º Ano A',
  QUANT_ALUNOS: 9,
  QUANT_RESPOSTAS: 90,
  PORCENTAGEM_RESPOSTAS: 45,
  QUANTIDADE_ALUNOS_TURMA: 20,
  UNIDADE: 'Unidade Campina Grande',
  CURSO: 'Ensino Médio',
  SERIE: '1º Ano',
  ANO: '2026',
  MODALIDADE: 'EJA',
  ...extra,
});

describe('join 004 × 005', () => {
  it('casa unidade com e sem prefixo, ignorando acento e caixa', () => {
    expect(chaveAdesao('João da Silva', '1AEM', 'Matemática', 'Unidade Campina Grande')).toBe(
      chaveAdesao('JOAO DA SILVA', '1aem', 'matematica', 'campina  grande'),
    );
  });

  it('não casa unidades diferentes', () => {
    expect(chaveAdesao('A', '1', 'X', 'Patos')).not.toBe(chaveAdesao('A', '1', 'X', 'Campina Grande'));
  });

  it('indexa e marca adesão baixa (< 50%) e modalidade EJA', () => {
    const { porChave, duplicadas } = indexarAdesao([linha()]);
    const a = porChave.get(chaveAdesao('João da Silva', '1AEM', 'Matemática', 'Campina Grande'));
    expect(a).toMatchObject({ unidade: 'Campina Grande', porcentagem: 45, baixa: true, modalidade: 'EJA' });
    expect(duplicadas).toHaveLength(0);
  });

  it('mantém a primeira ocorrência em chaves repetidas', () => {
    const { porChave, duplicadas } = indexarAdesao([linha(), linha({ QUANT_ALUNOS: 1 })]);
    expect(porChave.size).toBe(1);
    expect([...porChave.values()][0]?.quantAlunos).toBe(9);
    expect(duplicadas).toHaveLength(1);
  });

  it('calcula a porcentagem quando ausente', () => {
    expect(
      calcularPorcentagem({ PORCENTAGEM_RESPOSTAS: null, QUANT_ALUNOS: 10, QUANTIDADE_ALUNOS_TURMA: 40 }),
    ).toBe(25);
    expect(
      calcularPorcentagem({ PORCENTAGEM_RESPOSTAS: null, QUANT_ALUNOS: 2, QUANTIDADE_ALUNOS_TURMA: 3 }),
    ).toBe(67);
    expect(
      calcularPorcentagem({ PORCENTAGEM_RESPOSTAS: null, QUANT_ALUNOS: 0, QUANTIDADE_ALUNOS_TURMA: 0 }),
    ).toBe(0);
    expect(paraAdesao(linha({ PORCENTAGEM_RESPOSTAS: 50 })).baixa).toBe(false);
  });
});

describe('índice por DESCOBJETOAVALIADO (texto truncado)', () => {
  it('casa pelo objeto + unidade, ignorando acento, caixa e espaços', () => {
    const truncado = 'Professor - Turma - Disciplina: Maria - 1AEM - Linguagens - Produção Tex';
    const { porObjeto } = indexarAdesao([
      linha({
        DESCOBJETOAVALIADO: truncado,
        PROFESSOR: 'Maria',
        DISCIPLINA: 'Linguagens - Produção Textual',
      }),
    ]);
    const a = porObjeto.get(chaveObjetoAdesao(`  ${truncado.toUpperCase()} `, 'campina grande'));
    expect(a?.disciplina).toBe('Linguagens - Produção Textual');
    expect(porObjeto.get(chaveObjetoAdesao(truncado, 'Patos'))).toBeUndefined();
  });

  it('não indexa objeto vazio e mantém a primeira linha em duplicadas', () => {
    const { porObjeto, duplicadas } = indexarAdesao([
      linha({ DESCOBJETOAVALIADO: '' }),
      linha({ PORCENTAGEM_RESPOSTAS: 90 }),
      linha({ DISCIPLINA: 'Física' }),
    ]);
    expect(porObjeto.size).toBe(1);
    expect(duplicadas).toHaveLength(1);
    expect([...porObjeto.values()][0]?.disciplina).toBe('Física');
  });
});
