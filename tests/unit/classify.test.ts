import { describe, expect, it } from 'vitest';
import { classificarAvaliacao004, classificarObjetoAvaliado } from '../../src/domain/classify.js';

describe('classificarObjetoAvaliado', () => {
  it('reconhece o padrão de professor', () => {
    expect(
      classificarObjetoAvaliado('Professor - Turma - Disciplina: João da Silva - 1AEM - Matemática'),
    ).toEqual({
      tipo: 'professor',
      professor: 'João da Silva',
      codTurma: '1AEM',
      disciplina: 'Matemática',
    });
  });

  it('tolera hífen (com e sem espaços) no nome do professor', () => {
    expect(
      classificarObjetoAvaliado('Professor - Turma - Disciplina: Luiz Carlos - Neto - 1AEM - Biologia'),
    ).toMatchObject({
      professor: 'Luiz Carlos - Neto',
      codTurma: '1AEM',
      disciplina: 'Biologia',
    });
    expect(
      classificarObjetoAvaliado('Professor - Turma - Disciplina: Ana-Clara Mendes - 2BEM - Química'),
    ).toMatchObject({
      professor: 'Ana-Clara Mendes',
    });
  });

  it('aceita prefixo com caixa diferente e espaços extras', () => {
    expect(
      classificarObjetoAvaliado('  PROFESSOR  -  turma -  Disciplina :  Ana  -  1AEM  -  Física  '),
    ).toEqual({
      tipo: 'professor',
      professor: 'Ana',
      codTurma: '1AEM',
      disciplina: 'Física',
    });
  });

  it.each(['', 'INFRAESTRUTURA', 'DIREÇÃO', 'Professor João'])('trata %j como outra prova', (desc) => {
    expect(classificarObjetoAvaliado(desc)).toEqual({ tipo: 'outra' });
  });

  it('trata null/undefined como outra prova', () => {
    expect(classificarObjetoAvaliado(undefined as unknown as string)).toEqual({ tipo: 'outra' });
  });

  it('marca formato quebrado como malformado', () => {
    expect(classificarObjetoAvaliado('Professor - Turma - Disciplina: Fulano').tipo).toBe('malformado');
    expect(classificarObjetoAvaliado('Professor - Turma - Disciplina: Fulano - 1AEM').tipo).toBe(
      'malformado',
    );
  });

  it('marca trecho vazio como malformado', () => {
    expect(classificarObjetoAvaliado('Professor - Turma - Disciplina:  - 1AEM - Física')).toMatchObject({
      tipo: 'malformado',
    });
    expect(classificarObjetoAvaliado('Professor - Turma - Disciplina:').tipo).toBe('malformado');
  });
});

describe('classificarAvaliacao004 (disciplina pelos campos PROFESSOR/CODTURMA)', () => {
  const P = 'Professor - Turma - Disciplina: ';

  it('usa todo o restante como disciplina, mesmo com hífen', () => {
    expect(
      classificarAvaliacao004(
        `${P}Wedell Jackson - NEM-SEE-2A-M - Núcleo Comum - Tecnologia`,
        'Wedell Jackson',
        'NEM-SEE-2A-M',
      ),
    ).toEqual({
      tipo: 'professor',
      professor: 'Wedell Jackson',
      codTurma: 'NEM-SEE-2A-M',
      disciplina: 'Núcleo Comum - Tecnologia',
    });
  });

  it('aceita texto truncado, caixa diferente e espaços extras', () => {
    const r = classificarAvaliacao004(
      `PROFESSOR - TURMA - DISCIPLINA:  maria  -  1AEM  -  Linguagens - Produção Tex`,
      'Maria',
      '1AEM',
    );
    expect(r).toEqual({
      tipo: 'professor',
      professor: 'Maria',
      codTurma: '1AEM',
      disciplina: 'Linguagens - Produção Tex',
    });
  });

  it('cai no parser genérico quando o texto não começa pelos campos', () => {
    expect(classificarAvaliacao004(`${P}Luiz Carlos - Neto - 1AEM - Biologia`, '', '')).toEqual({
      tipo: 'professor',
      professor: 'Luiz Carlos - Neto',
      codTurma: '1AEM',
      disciplina: 'Biologia',
    });
    // Campos preenchidos têm prioridade sobre o texto.
    expect(classificarAvaliacao004(`${P}Outro - T9 - Artes`, 'Ana', '1AEM')).toMatchObject({
      professor: 'Ana',
      codTurma: '1AEM',
      disciplina: 'Artes',
    });
  });

  it('formato quebrado e texto sem prefixo', () => {
    expect(classificarAvaliacao004(`${P}Ana`, 'Ana', '1AEM').tipo).toBe('malformado');
    expect(classificarAvaliacao004(`${P}Ana - 1AEM - `, 'Ana', '1AEM').tipo).toBe('malformado');
    expect(classificarAvaliacao004('DIREÇÃO', 'Ana', '1AEM').tipo).toBe('outra');
  });
});
