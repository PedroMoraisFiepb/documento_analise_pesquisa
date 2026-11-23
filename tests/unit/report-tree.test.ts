import { beforeAll, describe, expect, it } from 'vitest';
import {
  type Modelo,
  type Relatorio,
  type RelatorioProfessor,
  type RelatorioProva,
  listarRelatorios,
  tituloRelatorio,
} from '../../src/domain/model.js';
import {
  avisosDeRejeicao,
  construirModelo,
  modalidadeCanonica,
  nomeGrupoAlunos,
} from '../../src/domain/report-tree.js';
import {
  type Linha004,
  type Linha005,
  type Linha006,
  type Linha009,
  parseLinhas,
} from '../../src/domain/schemas.js';
import { AGORA, lerFixture } from '../helpers/contexto.js';

const REGULAR = 'Alunos do Regular';
const EJA = 'Alunos da EJA';
const PROF = 'Provas respondidas por professores';

async function entrada(nome: 'minimal' | 'edge') {
  const f = await lerFixture(nome);
  return {
    linhas004: parseLinhas('EDU.BI.004', f['EDU.BI.004']).linhas as Linha004[],
    linhas005: parseLinhas('EDU.BI.005', f['EDU.BI.005']).linhas as Linha005[],
    linhas006: parseLinhas('EDU.BI.006', f['EDU.BI.006']).linhas as Linha006[],
    linhas009: parseLinhas('EDU.BI.009', f['EDU.BI.009']).linhas as Linha009[],
  };
}

const buscar = (m: Modelo, caminho: string) => {
  const r = listarRelatorios(m).find((x) => x.caminho.join('/') === caminho);
  if (!r)
    throw new Error(
      `Relatório não encontrado: ${caminho}\n${listarRelatorios(m)
        .map((x) => x.caminho.join('/'))
        .join('\n')}`,
    );
  return r;
};
const prof = (m: Modelo, c: string) => buscar(m, c) as RelatorioProfessor;
const prova = (m: Modelo, c: string) => buscar(m, c) as RelatorioProva;

describe('construirModelo — fixture minimal', () => {
  let m: Modelo;
  let avisos: ReturnType<typeof construirModelo>['avisos'];
  beforeAll(async () => {
    ({ modelo: m, avisos } = construirModelo(await entrada('minimal'), { agora: AGORA }));
  });

  it('gera a estrutura de pastas de §6', () => {
    expect(m.pastaRaiz).toBe('relatorios_2026-11-12_1530');
    expect(m.unidades.map((u) => u.nome)).toEqual([
      'Campina Grande',
      'João Pessoa',
      'Patos',
      'São José de Piranhas',
    ]);
    const cg = m.unidades[0]!;
    expect(cg.grupos.map((g) => g.nome)).toEqual([PROF, REGULAR, EJA]);
    expect(listarRelatorios(m).map((r) => r.caminho.join('/'))).toContain(
      `Campina Grande/${REGULAR}/Provas de Professores/João da Silva`,
    );
    expect(listarRelatorios(m).map((r) => r.caminho.join('/'))).toContain(
      `Campina Grande/${PROF}/Avaliação da Direção 2026`,
    );
  });

  it('calcula a média ponderada do professor e por disciplina/turma', () => {
    const joao = prof(m, `Campina Grande/${REGULAR}/Provas de Professores/João da Silva`);
    expect(joao.resumo.media).toBeCloseTo(17 / 4, 10);
    expect(joao.resumo.respondentes).toBe(2);
    expect(
      joao.porTurmaDisciplina.map((t) => [t.disciplina, t.estatistica.media, t.adesao?.porcentagem]),
    ).toEqual([
      ['Física', 3, 80],
      ['Matemática', 14 / 3, 100],
    ]);
    expect(joao.mediaUnidade).toBeCloseTo(17 / 4, 10);
    expect(joao.modalidade).toBe('REGULAR');
    expect(joao.arquivoBase).toBe('João da Silva');
  });

  it('separa EJA e destaca adesão baixa', () => {
    const carlos = prof(m, `Campina Grande/${EJA}/Provas de Professores/Carlos Souza`);
    expect(carlos.modalidade).toBe('EJA');
    expect(carlos.adesao[0]).toMatchObject({ porcentagem: 45, baixa: true });
    expect(carlos.avisos.some((a) => a.includes('Adesão baixa'))).toBe(true);
    expect(avisos.some((a) => a.tipo === 'adesao-baixa')).toBe(true);
  });

  it('avaliação do 004 sem par no 005 usa a MODALIDADE do próprio 004, com aviso', () => {
    const r = prof(m, `Patos/${EJA}/Provas de Professores/Carlos Souza`);
    expect(r.adesao).toEqual([]);
    expect(r.porTurmaDisciplina[0]).toMatchObject({
      codTurma: 'EJA01',
      turma: 'EJA Noturno',
      disciplina: 'História',
    });
    expect(r.avisos.some((a) => a.includes('Sem dados de adesão'))).toBe(true);
    expect(avisos.filter((a) => a.tipo === 'sem-par-005')).toEqual([
      expect.objectContaining({ sentenca: 'EDU.BI.004' }),
    ]);
  });

  it('respostas do professor vêm do 004 com professor, turma e disciplina', () => {
    const joao = prof(m, `Campina Grande/${REGULAR}/Provas de Professores/João da Silva`);
    expect(joao.respostas[0]).toMatchObject({
      professor: 'João da Silva',
      codTurma: '1AEM',
      disciplina: 'Matemática',
      prova: 'Avaliação dos Professores pelos Alunos 2026',
    });
  });

  it('provas do 009 (professores respondem) calculam média da unidade e por objeto', () => {
    const dir = prova(m, `Campina Grande/${PROF}/Avaliação da Direção 2026`);
    expect(dir.fonte).toBe('EDU.BI.009');
    expect(dir.resumo).toMatchObject({ respostas: 3, respondentes: 2, media: (5 + 4 + 3) / 3 });
    expect(dir.porObjeto.map((o) => o.objeto)).toEqual(['DIREÇÃO']);
    expect(dir.respostas[0]?.professor).toBeUndefined();
  });

  it('outras provas do 006 ficam no Regular; avaliação de professor no 006 é ignorada', () => {
    const r = prova(m, `Campina Grande/${REGULAR}/Pesquisa de Satisfação 2026`);
    expect(r.fonte).toBe('EDU.BI.006');
    expect(r.questoes.map((q) => q.codQuestao)).toEqual([1, 2]);
    const infra = prova(m, `São José de Piranhas/${REGULAR}/Avaliação de Infraestrutura 2026`);
    expect(infra.resumo.respostas).toBe(1);
    expect(avisos.filter((a) => a.tipo === 'professor-no-006')).toEqual([
      expect.objectContaining({ sentenca: 'EDU.BI.006', detalhe: { linhas: 1 } }),
    ]);
  });

  it('totaliza relatórios', () => {
    expect(m.totais.relatorios).toBe(listarRelatorios(m).length);
    expect(m.totais.relatoriosProva + m.totais.relatoriosProfessor).toBe(m.totais.relatorios);
    expect(listarRelatorios(m).map(tituloRelatorio)).toContain('Maria Oliveira');
  });
});

describe('construirModelo — fixture edge', () => {
  let m: Modelo;
  let avisos: ReturnType<typeof construirModelo>['avisos'];
  beforeAll(async () => {
    ({ modelo: m, avisos } = construirModelo(await entrada('edge'), { agora: AGORA }));
  });

  const caminhos = () => listarRelatorios(m).map((r: Relatorio) => r.caminho.join('/'));

  it('descarta respostas inválidas e duplicadas, contando-as', () => {
    const r = listarRelatorios(m).find((x) => x.tipo === 'prova' && x.codProva === 101) as RelatorioProva;
    expect(r.resumo.respostas).toBe(1);
    expect(r.respostasInvalidas).toBe(2);
    expect(r.duplicadas).toBe(1);
    expect(r.avisos).toHaveLength(2);
    expect(avisos.filter((a) => a.tipo === 'resposta-invalida' && a.sentenca === 'EDU.BI.009')).toHaveLength(
      2,
    );
  });

  it('sanitiza nomes e resolve colisões com sufixo', () => {
    expect(caminhos()).toContain(`Campina Grande/${PROF}/Avaliação Direção Coordenação`);
    const direcao = caminhos().filter((c) => c.toLowerCase().includes('avaliação da direção 2026'));
    expect(direcao).toHaveLength(2);
    expect(direcao.some((c) => c.endsWith(' (2)'))).toBe(true);
    expect(caminhos()).toContain(`João Pessoa/${REGULAR}/Provas de Professores (2)`);
  });

  it('calcula média por objeto avaliado no 009', () => {
    const r = listarRelatorios(m).find((x) => x.tipo === 'prova' && x.codProva === 103) as RelatorioProva;
    expect(r.porObjeto.map((o) => [o.objeto, o.estatistica.media])).toEqual([
      ['DIREÇÃO', 5],
      ['SECRETARIA', 1],
    ]);
  });

  it('casa unidade com espaços extras, professor com hífen e calcula porcentagem ausente', () => {
    const r = prof(m, `João Pessoa/${REGULAR}/Provas de Professores/Luiz Carlos - Neto`);
    expect(r.resumo).toMatchObject({ respostas: 3, media: 4, respondentes: 2 });
    expect(r.adesao[0]).toMatchObject({ porcentagem: 25, baixa: true });
  });

  it('professor sem respostas gera relatório só com adesão', () => {
    const r = prof(m, `João Pessoa/${REGULAR}/Provas de Professores/Sérgio Ramos`);
    expect(r.semRespostas).toBe(true);
    expect(r.resumo.media).toBeNull();
    expect(r.avisos[0]).toContain('Sem respostas registradas');
    expect(avisos.some((a) => a.tipo === 'sem-respostas')).toBe(true);
  });

  it('cria grupos por modalidade (EJA e outras)', () => {
    const jp = m.unidades.find((u) => u.nome === 'João Pessoa')!;
    expect(jp.grupos.map((g) => g.nome)).toEqual([REGULAR, EJA, 'Alunos - Técnico']);
    const ju = prof(m, `João Pessoa/${EJA}/Provas de Professores/Juliana Costa`);
    expect(ju.mediaUnidade).toBe(5);
    expect(avisos.filter((a) => a.tipo === 'adesao-duplicada')).toHaveLength(1);
  });

  it('média da unidade do professor considera todos os professores da unidade × modalidade', () => {
    const r = prof(m, `João Pessoa/${REGULAR}/Provas de Professores/Desconhecido`);
    // 14 pontos em 5 respostas + 3 (C) de "Fulano Quebrado".
    expect(r.mediaUnidade).toBeCloseTo(17 / 6, 10);
    expect(avisos.filter((a) => a.tipo === 'sem-par-005')).toHaveLength(2);
  });

  it('004 com formato quebrado: professor e turma dos campos, disciplina não informada, com aviso', () => {
    const r = prof(m, `João Pessoa/${REGULAR}/Provas de Professores/Fulano Quebrado`);
    expect(r.porTurmaDisciplina[0]).toMatchObject({
      codTurma: '1AEM',
      disciplina: 'Disciplina não informada',
    });
    expect(avisos.filter((a) => a.tipo === 'objeto-malformado').map((a) => a.sentenca)).toEqual([
      'EDU.BI.004',
      'EDU.BI.006',
    ]);
  });

  it('006 com formato quebrado vira outra prova', () => {
    expect(caminhos()).toContain(`João Pessoa/${REGULAR}/Avaliação Geral 2026`);
  });

  it('pasta EJA só existe quando há dados', () => {
    const cg = m.unidades.find((u) => u.nome === 'Campina Grande')!;
    expect(cg.grupos.map((g) => g.nome)).toEqual([PROF]);
  });

  it('modelo vazio sem linhas', () => {
    const { modelo } = construirModelo(
      { linhas004: [], linhas005: [], linhas006: [], linhas009: [] },
      { agora: AGORA },
    );
    expect(modelo.unidades).toEqual([]);
  });
});

describe('construirModelo — ANO_LETIVO', () => {
  it('descarta linhas de outros anos no 004 e no 005', async () => {
    const { modelo, avisos } = construirModelo(await entrada('edge'), { agora: AGORA, anoLetivo: '2025' });
    expect(modelo.anoLetivo).toBe('2025');
    const profs = listarRelatorios(modelo).filter((r) => r.tipo === 'professor') as RelatorioProfessor[];
    expect(profs.map((r) => [r.professor, r.resumo.respostas])).toEqual([['Rita Alves', 1]]);
    // 005 vazio após o filtro → a avaliação fica sem par; 009 e 006 não têm ANO e não são filtrados.
    expect(avisos.filter((a) => a.tipo === 'sem-par-005')).toHaveLength(1);
    expect(listarRelatorios(modelo).some((r) => r.tipo === 'prova' && r.fonte === 'EDU.BI.009')).toBe(true);
  });
});

describe('construirModelo — valores ausentes', () => {
  it('aplica rótulos padrão para unidade, prova, objeto, professor e turma vazios', () => {
    const l009 = parseLinhas('EDU.BI.009', {
      Row: [
        { CODPROVA: 7, PROVA: '', TEXTO: '', ID_INSCRICAO: 1, CODQUESTAO: 1, CODRESPOSTA: 'A', UNIDADE: '' },
      ],
    }).linhas as Linha009[];
    const l005 = parseLinhas('EDU.BI.005', {
      Row: [
        {
          PROFESSOR: 'P',
          DISCIPLINA: 'D',
          CODTURMA: 'T',
          TURMA: '',
          QUANT_ALUNOS: 1,
          QUANT_RESPOSTAS: 1,
          QUANTIDADE_ALUNOS_TURMA: 1,
          UNIDADE: 'X',
        },
      ],
    }).linhas as Linha005[];
    const l006 = parseLinhas('EDU.BI.006', {
      Row: [
        {
          CODPROVA: 8,
          PROVA: '',
          TEXTO: '',
          ID_INSCRICAO: 2,
          CODQUESTAO: 1,
          CODRESPOSTA: 'B',
          DESCOBJETOAVALIADO: '',
          UNIDADE: 'X',
        },
        {
          CODPROVA: 8,
          PROVA: '',
          TEXTO: 'Enunciado tardio',
          ID_INSCRICAO: 3,
          CODQUESTAO: 1,
          CODRESPOSTA: 'C',
          DESCOBJETOAVALIADO: '',
          UNIDADE: 'X',
        },
      ],
    }).linhas as Linha006[];
    const l004 = parseLinhas('EDU.BI.004', {
      Row: [
        // Sem PROFESSOR/CODTURMA: vêm do DESCOBJETOAVALIADO.
        {
          CODPROVA: 20,
          NOME: 'P',
          TEXTO: 'q',
          ID_INSCRICAO: 4,
          CODQUESTAO: 1,
          CODRESPOSTA: 'Q',
          DESCOBJETOAVALIADO: 'Professor - Turma - Disciplina: P - T - D',
          UNIDADE: 'X',
        },
        // Sem professor em lugar nenhum.
        { CODPROVA: 20, NOME: 'P', ID_INSCRICAO: 5, CODQUESTAO: 1, CODRESPOSTA: 'A', UNIDADE: 'X' },
      ],
    }).linhas as Linha004[];
    const { modelo } = construirModelo(
      { linhas004: l004, linhas005: l005, linhas006: l006, linhas009: l009 },
      { agora: AGORA },
    );
    const rels = listarRelatorios(modelo);
    const p009 = rels.find((r) => r.tipo === 'prova' && r.codProva === 7) as RelatorioProva;
    expect(p009.unidade).toBe('Sem unidade');
    expect(p009.nome).toBe('Prova 7');
    expect(p009.porObjeto[0]?.objeto).toBe('Não informado');
    const p006 = rels.find((r) => r.tipo === 'prova' && r.codProva === 8) as RelatorioProva;
    expect(p006.questoes[0]?.texto).toBe('Enunciado tardio');
    const p = rels.find((r) => r.tipo === 'professor' && r.professor === 'P') as RelatorioProfessor;
    expect(p.porTurmaDisciplina[0]).toMatchObject({ turma: 'T', codTurma: 'T' });
    expect(p.respostasInvalidas).toBe(1);
    expect(p.avisos.some((a) => a.includes('inválido'))).toBe(true);
    expect(rels.some((r) => r.tipo === 'professor' && r.professor === 'Professor não informado')).toBe(true);
  });
});

describe('auxiliares', () => {
  it('nomeia grupos por modalidade', () => {
    expect(nomeGrupoAlunos('')).toBe(REGULAR);
    expect(nomeGrupoAlunos('regular')).toBe(REGULAR);
    expect(nomeGrupoAlunos('EJA')).toBe(EJA);
    expect(nomeGrupoAlunos('ensino técnico')).toBe('Alunos - Ensino Técnico');
    expect(modalidadeCanonica('  eja ')).toBe('EJA');
  });

  it('gera avisos para linhas rejeitadas', () => {
    expect(avisosDeRejeicao('EDU.BI.005', [{ indice: 3, erro: 'x' }])).toEqual([
      {
        tipo: 'linha-rejeitada',
        sentenca: 'EDU.BI.005',
        mensagem: 'Linha 3 ignorada por formato inválido: x',
        detalhe: { indice: 3 },
      },
    ]);
  });
});
