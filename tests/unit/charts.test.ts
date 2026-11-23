import { beforeAll, describe, expect, it } from 'vitest';
import {
  type Modelo,
  type RelatorioProfessor,
  type RelatorioProva,
  listarRelatorios,
} from '../../src/domain/model.js';
import { construirModelo } from '../../src/domain/report-tree.js';
import {
  type Linha004,
  type Linha005,
  type Linha006,
  type Linha009,
  parseLinhas,
} from '../../src/domain/schemas.js';
import {
  COR_ALTERNATIVA,
  opcaoGraficoProfessor,
  opcaoGraficoProva,
  opcaoGraficoQuestao,
} from '../../src/render/charts/options.js';
import {
  ALTURA,
  LARGURA,
  graficosDoRelatorio,
  opcaoDoRelatorio,
  renderizarSvg,
} from '../../src/render/charts/render.js';
import {
  nomeImagem,
  nomeImagemQuestao,
  quebrarLinhas,
  rotuloModalidade,
  rotuloRespondentes,
  rotuloQuestao,
  rotuloTurmaDisciplina,
  truncar,
} from '../../src/render/labels.js';
import { CORES } from '../../src/shared/theme.js';
import { AGORA, lerFixture } from '../helpers/contexto.js';

let modelo: Modelo;
beforeAll(async () => {
  const f = await lerFixture('edge');
  modelo = construirModelo(
    {
      linhas004: parseLinhas('EDU.BI.004', f['EDU.BI.004']).linhas as Linha004[],
      linhas005: parseLinhas('EDU.BI.005', f['EDU.BI.005']).linhas as Linha005[],
      linhas006: parseLinhas('EDU.BI.006', f['EDU.BI.006']).linhas as Linha006[],
      linhas009: parseLinhas('EDU.BI.009', f['EDU.BI.009']).linhas as Linha009[],
    },
    { agora: AGORA },
  ).modelo;
});
const professor = (nome: string) =>
  listarRelatorios(modelo).find((r) => r.tipo === 'professor' && r.professor === nome) as RelatorioProfessor;
const prova = (cod: number) =>
  listarRelatorios(modelo).find((r) => r.tipo === 'prova' && r.codProva === cod) as RelatorioProva;

type Serie = {
  data: { value: number; itemStyle: { color: string } }[];
  markLine?: { data: { xAxis: number }[] };
};

describe('opções de gráfico', () => {
  it('prova: barras por questão coloridas por faixa e linha da média da unidade', () => {
    const r = prova(103);
    const op = opcaoGraficoProva(r);
    const serie = (op.series as Serie[])[0]!;
    expect(serie.data.map((d) => d.itemStyle.color)).toEqual([CORES.verde, CORES.laranja]);
    expect(serie.markLine?.data[0]?.xAxis).toBe(3);
  });

  it('professor: barras por disciplina/turma + média geral + referência da unidade', () => {
    const r = professor('Luiz Carlos - Neto');
    const op = opcaoGraficoProfessor(r);
    const serie = (op.series as Serie[])[0]!;
    expect((op.yAxis as { data: string[] }).data).toEqual([
      'Biologia – 1º Ano A',
      'Média geral do professor',
    ]);
    expect(serie.data.at(-1)?.itemStyle.color).toBe(CORES.azulEscuro);
    expect(serie.markLine?.data[0]?.xAxis).toBeCloseTo(17 / 6); // inclui o professor com formato quebrado
  });

  it('professor sem respostas mostra aviso e nenhuma barra', () => {
    const op = opcaoGraficoProfessor(professor('Sérgio Ramos'));
    expect((op.series as Serie[])[0]!.data).toEqual([]);
    expect(JSON.stringify(op.graphic)).toContain('Sem respostas registradas');
  });

  it('prova sem média não desenha linha de referência', () => {
    const r = { ...prova(103), resumo: { ...prova(103).resumo, media: null } };
    expect((opcaoGraficoProva(r).series as Serie[])[0]!.markLine).toBeUndefined();
  });
});

describe('SVG', () => {
  it('renderiza SVG estável (snapshot)', () => {
    const svg = renderizarSvg(opcaoDoRelatorio(professor('Luiz Carlos - Neto')));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`width="${LARGURA}"`);
    expect(svg).toContain(`height="${ALTURA}"`);
    expect(svg).toContain('Luiz Carlos - Neto');
    expect(svg).toContain('4,00');
    expect(svg).toMatchSnapshot();
  });

  it('renderiza gráfico de prova', () => {
    const svg = renderizarSvg(opcaoDoRelatorio(prova(103)));
    expect(svg).toContain('Avaliação da Gestão 2026');
    expect(svg).toContain('Média da unidade: 3,00');
  });
});

describe('rótulos', () => {
  it('trunca textos longos', () => {
    expect(truncar('abcdef', 4)).toBe('abc…');
    expect(truncar('abc', 4)).toBe('abc');
    expect(rotuloQuestao(1, '')).toBe('Q1');
    expect(rotuloQuestao(2, 'Texto')).toBe('Q2 – Texto');
    expect(rotuloTurmaDisciplina({ disciplina: 'X', turma: '', codTurma: 'T1' })).toBe('X – T1');
    expect(rotuloModalidade('EJA')).toBe('EJA');
    expect(rotuloModalidade('REGULAR')).toBe('Regular');
    expect(nomeImagem(prova(103))).toBe('media_unidade');
    expect(nomeImagem(professor('Sérgio Ramos'))).toBe('media_professor');
  });
});

describe('gráfico de respostas por questão', () => {
  it('colunas A–E com contagens, cores por alternativa e rótulo quantidade (%)', () => {
    const r = prova(103);
    const q = r.questoes[0]!;
    const op = opcaoGraficoQuestao(q, 'Contexto');
    const serie = (op.series as Serie[])[0]!;
    expect(serie.data.map((d) => d.value)).toEqual(
      ['A', 'B', 'C', 'D', 'E'].map((l) => q.estatistica.distribuicao[l as 'A']),
    );
    expect(serie.data.map((d) => d.itemStyle.color)).toEqual(Object.values(COR_ALTERNATIVA));
    expect((op.xAxis as { data: string[] }).data[0]).toBe('A (nota 5)');
    const fmt = (op.series as { label: { formatter: (p: unknown) => string } }[])[0]!.label.formatter;
    const total = q.estatistica.respostas;
    const a = q.estatistica.distribuicao.A;
    expect(fmt({ dataIndex: 0, value: a })).toBe(`${a} (${Math.round((a / total) * 100)}%)`);
    expect(JSON.stringify(op.title)).toContain('Contexto · Média da questão');
  });

  it('enunciado longo quebra em no máximo 3 linhas; sem enunciado usa "Questão N"', () => {
    const q = { ...prova(103).questoes[0]!, texto: 'palavra '.repeat(60).trim() };
    const titulo = (opcaoGraficoQuestao(q, 'x').title as { text: string }).text;
    expect(titulo.split('\n')).toHaveLength(3);
    expect(titulo.endsWith('…')).toBe(true);
    const semTexto = { ...q, texto: '' };
    expect((opcaoGraficoQuestao(semTexto, 'x').title as { text: string }).text).toBe(
      `Questão ${q.codQuestao}`,
    );
  });

  it('renderiza SVG com o enunciado e os rótulos', () => {
    const svg = renderizarSvg(opcaoGraficoQuestao(prova(103).questoes[0]!, 'Unidade X'));
    expect(svg).toContain('A (nota 5)');
    expect(svg).toContain('Unidade X');
  });
});

describe('catálogo de gráficos', () => {
  it('padrão: professor → um por questão; prova → média', () => {
    const p = professor('Luiz Carlos - Neto');
    const gp = graficosDoRelatorio(p);
    expect(gp.map((g) => g.nome)).toEqual(p.questoes.map((q) => nomeImagemQuestao(q.codQuestao)));
    expect(gp.every((g) => g.tipo === 'questoes')).toBe(true);
    expect(graficosDoRelatorio(prova(103)).map((g) => g.nome)).toEqual(['media_unidade']);
  });

  it('respeita a configuração e a ordem', () => {
    const p = professor('Luiz Carlos - Neto');
    const g = graficosDoRelatorio(p, { professor: ['media', 'questoes'], prova: [] });
    expect(g[0]!.nome).toBe('media_professor');
    expect(g).toHaveLength(1 + p.questoes.length);
    expect(graficosDoRelatorio(prova(103), { professor: [], prova: [] })).toEqual([]);
  });

  it('professor sem respostas não tem gráficos por questão', () => {
    expect(graficosDoRelatorio(professor('Sérgio Ramos'))).toEqual([]);
  });
});

describe('rótulos novos', () => {
  it('quebrarLinhas', () => {
    expect(quebrarLinhas('a b c', 3, 3)).toEqual(['a b', 'c']);
    expect(quebrarLinhas('', 10, 2)).toEqual([]);
    expect(quebrarLinhas('abcdefghij', 4, 2)).toEqual(['abc…']);
    expect(quebrarLinhas('aa bb cc dd', 2, 2)).toEqual(['aa', 'b…']);
  });

  it('rotuloRespondentes e nomeImagemQuestao não citam códigos de consulta', () => {
    expect(rotuloRespondentes({ fonte: 'EDU.BI.009' })).toBe('Professores');
    expect(rotuloRespondentes({ fonte: 'EDU.BI.006' })).toBe('Alunos');
    expect(nomeImagemQuestao(3)).toBe('questao_03');
    expect(nomeImagemQuestao(12)).toBe('questao_12');
  });
});
