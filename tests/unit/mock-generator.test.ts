import { describe, expect, it } from 'vitest';
import { classificarObjetoAvaliado } from '../../src/domain/classify.js';
import { parseLinhas } from '../../src/domain/schemas.js';
import {
  INSCRICAO_INICIAL_009,
  LIMITE_DESCOBJETO,
  criarAleatorio,
  gerarDadosMock,
} from '../../mock/generator.js';

describe('gerador do mock', () => {
  const dados = gerarDadosMock();

  it('é determinístico para a mesma seed', () => {
    expect(gerarDadosMock()).toEqual(dados);
    expect(gerarDadosMock(1)).not.toEqual(dados);
  });

  it('respeita os campos das sentenças', () => {
    expect(parseLinhas('EDU.BI.004', dados['EDU.BI.004']).rejeitadas).toEqual([]);
    expect(parseLinhas('EDU.BI.005', dados['EDU.BI.005']).rejeitadas).toEqual([]);
    expect(parseLinhas('EDU.BI.006', dados['EDU.BI.006']).rejeitadas).toEqual([]);
    expect(parseLinhas('EDU.BI.009', dados['EDU.BI.009']).rejeitadas).toEqual([]);
    // 009 tem exatamente os campos do 006.
    expect(Object.keys(dados['EDU.BI.009'].Row[0] as object).sort()).toEqual(
      Object.keys(dados['EDU.BI.006'].Row[0] as object).sort(),
    );
    expect(Object.keys(dados['EDU.BI.006'].Row[0] as object).sort()).toEqual(
      [
        'CODPROVA',
        'CODQUESTAO',
        'CODRESPOSTA',
        'DESCOBJETOAVALIADO',
        'ID_INSCRICAO',
        'PROVA',
        'TEXTO',
        'UNIDADE',
      ].sort(),
    );
  });

  it('004 traz a avaliação de professores pelos alunos (com campos de turma) e casos de borda', () => {
    const r004 = dados['EDU.BI.004'].Row as Record<string, unknown>[];
    const r005 = dados['EDU.BI.005'].Row as Record<string, unknown>[];
    const tipos = r004.map((r) => classificarObjetoAvaliado(String(r.DESCOBJETOAVALIADO)).tipo);
    expect(tipos.filter((t) => t !== 'professor')).toEqual(['malformado']);
    expect(r004.every((r) => String(r.UNIDADE).startsWith('Unidade '))).toBe(true);
    expect(r004.some((r) => r.MODALIDADE === 'EJA')).toBe(true);
    expect(r004.some((r) => r.CODRESPOSTA === 'X')).toBe(true);
    expect(r004.some((r) => r.CODRESPOSTA === '')).toBe(true);
    // DESCOBJETOAVALIADO truncado em 100 caracteres, igual no 004 e no 005.
    const truncado = r004.find((r) => String(r.DESCOBJETOAVALIADO).length === LIMITE_DESCOBJETO);
    expect(truncado).toBeDefined();
    expect(r005.some((r) => r.DESCOBJETOAVALIADO === truncado?.DESCOBJETOAVALIADO)).toBe(true);
  });

  it('005 traz adesão baixa, EJA, hífen no nome e professor sem respostas', () => {
    const r004 = dados['EDU.BI.004'].Row as Record<string, unknown>[];
    const r005 = dados['EDU.BI.005'].Row as Record<string, unknown>[];
    expect(r005.some((r) => (r.PORCENTAGEM_RESPOSTAS as number) < 50)).toBe(true);
    expect(r005.some((r) => r.MODALIDADE === 'EJA')).toBe(true);
    expect(r005.some((r) => String(r.PROFESSOR).includes(' - '))).toBe(true);
    const semRespostas = r005.find((r) => r.QUANT_ALUNOS === 0);
    expect(semRespostas).toBeDefined();
    expect(r004.some((r) => r.PROFESSOR === semRespostas?.PROFESSOR)).toBe(false);
  });

  it('006 traz as demais provas, com casos de borda e só linhas avulsas de professor', () => {
    const r006 = dados['EDU.BI.006'].Row as Record<string, unknown>[];
    expect(r006.some((r) => r.CODRESPOSTA === 'Z')).toBe(true);
    expect(r006.some((r) => r.DESCOBJETOAVALIADO === '')).toBe(true);
    const tipos = r006.map((r) => classificarObjetoAvaliado(String(r.DESCOBJETOAVALIADO)).tipo);
    expect(tipos.filter((t) => t === 'professor')).toHaveLength(1);
    expect(tipos.filter((t) => t === 'malformado')).toHaveLength(1);
    expect(r006.every((r) => !String(r.UNIDADE).startsWith('Unidade '))).toBe(true);
  });

  it('EDU.BI.009: professores respondem provas de setores, sem avaliação de professor', () => {
    const r009 = dados['EDU.BI.009'].Row as Record<string, unknown>[];
    const r005 = dados['EDU.BI.005'].Row as Record<string, unknown>[];
    expect(r009.length).toBeGreaterThan(0);
    // Nenhuma linha no formato de avaliação de professor (essas são do 006).
    expect(r009.every((r) => classificarObjetoAvaliado(String(r.DESCOBJETOAVALIADO)).tipo === 'outra')).toBe(
      true,
    );
    // Unidades sem prefixo, como no 006, e as mesmas unidades do 005.
    const unidades = new Set(r009.map((r) => String(r.UNIDADE).trim()));
    expect([...unidades].every((u) => !u.startsWith('Unidade '))).toBe(true);
    expect(unidades).toEqual(new Set(r005.map((r) => String(r.UNIDADE).replace(/^Unidade /, ''))));
    // Respondentes = professores da unidade (uma inscrição por professor × prova).
    const professoresCG = new Set(
      r005.filter((r) => r.UNIDADE === 'Unidade Campina Grande').map((r) => r.PROFESSOR),
    ).size;
    const inscricoesDirecaoCG = new Set(
      r009.filter((r) => r.UNIDADE === 'Campina Grande' && r.CODPROVA === 30).map((r) => r.ID_INSCRICAO),
    ).size;
    expect(inscricoesDirecaoCG).toBe(professoresCG);
    // Prova com mais de um objeto avaliado e prova sem objeto.
    expect(new Set(r009.filter((r) => r.CODPROVA === 33).map((r) => r.DESCOBJETOAVALIADO)).size).toBe(3);
    expect(r009.some((r) => r.DESCOBJETOAVALIADO === '')).toBe(true);
    // Casos de borda.
    expect(r009.some((r) => r.CODRESPOSTA === ' a ')).toBe(true);
    expect(r009.some((r) => r.CODRESPOSTA === 'Z')).toBe(true);
    expect(r009.some((r) => r.CODRESPOSTA === '')).toBe(true);
    const chaves = r009.map((r) => `${r.CODPROVA}|${r.ID_INSCRICAO}|${r.CODQUESTAO}|${r.DESCOBJETOAVALIADO}`);
    expect(new Set(chaves).size).toBeLessThan(chaves.length);
  });

  it('EDU.BI.009 usa faixa própria de inscrições', () => {
    expect(
      (dados['EDU.BI.009'].Row as Record<string, unknown>[]).every(
        (r) => (r.ID_INSCRICAO as number) > INSCRICAO_INICIAL_009,
      ),
    ).toBe(true);
  });

  it('PRNG gera números no intervalo', () => {
    const rnd = criarAleatorio(1);
    for (let i = 0; i < 100; i++) {
      const n = rnd.inteiro(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(['a', 'b']).toContain(rnd.escolher(['a', 'b']));
  });
});
