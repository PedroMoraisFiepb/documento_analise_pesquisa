import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseLinhas } from '../../src/domain/schemas.js';

describe('schemas', () => {
  it('aceita linhas válidas e converte tipos', () => {
    const { linhas, rejeitadas } = parseLinhas('EDU.BI.006', {
      Row: [
        {
          CODPROVA: '21',
          PROVA: 'P',
          TEXTO: null,
          ID_INSCRICAO: 100001,
          CODQUESTAO: 1,
          CODRESPOSTA: 'A',
          DESCOBJETOAVALIADO: null,
          UNIDADE: 'Patos',
        },
      ],
    });
    expect(rejeitadas).toEqual([]);
    expect(linhas[0]).toMatchObject({
      CODPROVA: 21,
      TEXTO: '',
      ID_INSCRICAO: '100001',
      DESCOBJETOAVALIADO: '',
    });
  });

  it('EDU.BI.009 usa os campos do 006 (fixtures minimal e edge)', async () => {
    const ler = async (n: string) =>
      JSON.parse(await readFile(`tests/fixtures/${n}/EDU.BI.009.json`, 'utf8')) as { Row: unknown[] };
    const minimal = parseLinhas('EDU.BI.009', await ler('minimal'));
    expect(minimal.rejeitadas).toEqual([]);
    expect(minimal.linhas[0]).toMatchObject({
      CODPROVA: 101,
      ID_INSCRICAO: '500101',
      DESCOBJETOAVALIADO: 'DIREÇÃO',
      UNIDADE: 'Campina Grande',
    });
    const edge = parseLinhas('EDU.BI.009', await ler('edge'));
    expect(edge.rejeitadas).toHaveLength(1);
    expect(edge.rejeitadas[0]?.erro).toMatch(/CODPROVA|ID_INSCRICAO/);
    expect(edge.linhas.find((l) => l.CODPROVA === 104)?.PROVA).toBe('Avaliação: Direção/Coordenação?');
  });

  it('separa linhas inválidas com o motivo', () => {
    const { linhas, rejeitadas } = parseLinhas('EDU.BI.004', { Row: [{ CODPROVA: 'abc' }, null] });
    expect(linhas).toHaveLength(0);
    expect(rejeitadas.map((r) => r.indice)).toEqual([0, 1]);
    expect(rejeitadas[0]?.erro).toContain('CODPROVA');
  });

  it('PORCENTAGEM_RESPOSTAS ausente vira null', () => {
    const { linhas } = parseLinhas('EDU.BI.005', {
      Row: [
        {
          PROFESSOR: 'A',
          QUANT_ALUNOS: 1,
          QUANT_RESPOSTAS: 1,
          QUANTIDADE_ALUNOS_TURMA: 2,
          PORCENTAGEM_RESPOSTAS: '',
        },
      ],
    });
    expect(linhas[0]?.PORCENTAGEM_RESPOSTAS).toBeNull();
  });
});
