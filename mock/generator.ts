/**
 * Gerador de dados fictícios coerentes entre EDU.BI.004, 005, 006 e 009 (seed fixa → saída determinística).
 * Papéis: 004 = alunos avaliam professores; 005 = adesão; 006 = demais provas dos alunos; 009 = professores respondem.
 * Respeita exatamente os campos de .claude/structure/ e inclui os casos de borda de ARQUITETURA §6.
 */
import type { Envelope, Sentenca } from '../src/domain/schemas.js';

export const SEED_PADRAO = 2026;
const ANO = '2026';

/** PRNG mulberry32: rápido e determinístico. */
export function criarAleatorio(seed: number) {
  let a = seed >>> 0;
  const proximo = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    proximo,
    inteiro: (min: number, max: number) => min + Math.floor(proximo() * (max - min + 1)),
    escolher: <T>(lista: readonly T[]): T => lista[Math.floor(proximo() * lista.length)] as T,
  };
}
type Aleatorio = ReturnType<typeof criarAleatorio>;

const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;

/** Sorteia uma resposta em torno de uma "qualidade" (1–5): quanto maior, mais A/B. */
function sortearResposta(rnd: Aleatorio, qualidade: number): string {
  const nota = Math.round(Math.min(5, Math.max(1, qualidade + (rnd.proximo() - 0.5) * 2.4)));
  return LETRAS[5 - nota] as string;
}

interface Turma {
  codTurma: string;
  turma: string;
  serie: string;
  curso: string;
  cursoTratado: string;
  habilitacao: string;
  modalidade: 'REGULAR' | 'EJA';
  alunos: number;
}

const TURMAS_REGULAR: Omit<Turma, 'alunos'>[] = [
  {
    codTurma: '1AEM',
    turma: '1º Ano A',
    serie: '1º Ano',
    curso: 'Ensino Médio',
    cursoTratado: 'ENSINO MÉDIO',
    habilitacao: '1EM',
    modalidade: 'REGULAR',
  },
  {
    codTurma: '2BEM',
    turma: '2º Ano B',
    serie: '2º Ano',
    curso: 'Ensino Médio',
    cursoTratado: 'ENSINO MÉDIO',
    habilitacao: '2EM',
    modalidade: 'REGULAR',
  },
  {
    codTurma: '3AEM',
    turma: '3º Ano A',
    serie: '3º Ano',
    curso: 'Ensino Médio',
    cursoTratado: 'ENSINO MÉDIO',
    habilitacao: '3EM',
    modalidade: 'REGULAR',
  },
];
const TURMA_EJA: Omit<Turma, 'alunos'> = {
  codTurma: 'EJA01',
  turma: 'EJA Noturno',
  serie: 'Módulo I',
  curso: 'EJA Profissionalizante',
  cursoTratado: 'EJA PROFISSIONALIZANTE ENSINO MÉDIO',
  habilitacao: 'EJAPRO',
  modalidade: 'EJA',
};

interface Atribuicao {
  turma: Turma;
  disciplina: string;
  /** Fração da turma que respondeu (adesão). */
  adesao: number;
}

interface Professor {
  nome: string;
  qualidade: number;
  atribuicoes: Atribuicao[];
  /** Existe no 005 mas não tem respostas no 006. */
  semRespostas?: boolean;
}

interface Unidade {
  nome: string;
  professores: Professor[];
}

const QUESTOES_PROFESSOR = [
  'O professor utiliza metodologias que facilitam a aprendizagem?',
  'O professor esclarece dúvidas durante as aulas?',
  'O professor é pontual e assíduo?',
  'O professor apresenta o conteúdo de forma organizada?',
  'O professor trata os alunos com respeito?',
];
const QUESTOES_SATISFACAO = [
  'Você está satisfeito com a escola?',
  'O atendimento da secretaria é adequado?',
  'Você recomendaria a escola a um amigo?',
  'As atividades extracurriculares atendem às suas expectativas?',
];
const QUESTOES_INFRA = [
  'As salas de aula são confortáveis?',
  'Os laboratórios estão bem equipados?',
  'A biblioteca atende às necessidades?',
  'Os banheiros estão limpos e conservados?',
];
const QUESTOES_DIRECAO = [
  'A direção é acessível aos professores?',
  'A direção comunica as decisões com clareza?',
  'A direção apoia as iniciativas pedagógicas?',
  'A direção resolve conflitos de forma adequada?',
];
const QUESTOES_COORDENACAO = [
  'A coordenação acompanha o planejamento das aulas?',
  'A coordenação oferece retorno sobre o trabalho docente?',
  'A coordenação promove formações relevantes?',
  'A coordenação apoia o atendimento a alunos com dificuldades?',
];
const questoesGestao = (setor: string) => [
  `${setor} atende às demandas no prazo?`,
  `${setor} se comunica bem com os professores?`,
];

function montarUnidades(rnd: Aleatorio): Unidade[] {
  const turma = (base: Omit<Turma, 'alunos'>): Turma => ({ ...base, alunos: rnd.inteiro(20, 36) });
  const t = (i: number) => turma(TURMAS_REGULAR[i] as Omit<Turma, 'alunos'>);
  const at = (tu: Turma, disciplina: string, adesao = 0.55 + rnd.proximo() * 0.45): Atribuicao => ({
    turma: tu,
    disciplina,
    adesao,
  });

  const cg = [t(0), t(1), t(2)];
  const cgEja = turma(TURMA_EJA);
  const jp = [t(0), t(1), t(2)];
  const jpEja = turma(TURMA_EJA);
  const pt = [t(0), t(1)];
  const sj = [t(0), t(2)];

  return [
    {
      nome: 'Campina Grande',
      professores: [
        // Exemplo de média entre disciplinas (amostra da estrutura).
        {
          nome: 'João da Silva',
          qualidade: 4.4,
          atribuicoes: [at(cg[0]!, 'Matemática'), at(cg[0]!, 'Física')],
        },
        {
          nome: 'Ana-Clara Mendes',
          qualidade: 3.6,
          atribuicoes: [at(cg[1]!, 'Química'), at(cg[2]!, 'Química')],
        },
        { nome: 'Roberto Nunes', qualidade: 2.4, atribuicoes: [at(cg[2]!, 'Geografia')] },
        // EJA com adesão abaixo de 50% (9 de 20 na amostra).
        {
          nome: 'Carlos Souza',
          qualidade: 3.2,
          atribuicoes: [at({ ...cgEja, alunos: 20 }, 'História', 0.45)],
        },
        { nome: 'Fernanda Lima', qualidade: 4.1, atribuicoes: [at(cgEja, 'Língua Portuguesa')] },
      ],
    },
    {
      nome: 'João Pessoa',
      professores: [
        {
          nome: 'Maria Oliveira',
          qualidade: 4.6,
          atribuicoes: [at(jp[1]!, 'Língua Portuguesa'), at(jp[2]!, 'Literatura')],
        },
        // Hífen com espaços no nome: o parser divide pela direita.
        { nome: 'Luiz Carlos - Neto', qualidade: 3.4, atribuicoes: [at(jp[0]!, 'Biologia')] },
        {
          nome: 'Patrícia Gomes',
          qualidade: 2.8,
          atribuicoes: [at(jp[0]!, 'Inglês', 0.38), at(jp[1]!, 'Inglês')],
        },
        // Professor no 005 sem nenhuma resposta no 006.
        { nome: 'Sérgio Ramos', qualidade: 3, atribuicoes: [at(jp[2]!, 'Filosofia', 0)], semRespostas: true },
        { nome: 'Juliana Costa', qualidade: 3.9, atribuicoes: [at(jpEja, 'Matemática')] },
      ],
    },
    {
      nome: 'Patos',
      professores: [
        {
          nome: 'Antônio Pereira',
          qualidade: 3.7,
          atribuicoes: [at(pt[0]!, 'Matemática'), at(pt[1]!, 'Matemática')],
        },
        { nome: 'Beatriz Santos', qualidade: 4.3, atribuicoes: [at(pt[0]!, 'História')] },
        { nome: 'Marcos Vieira', qualidade: 2.6, atribuicoes: [at(pt[1]!, 'Física')] },
      ],
    },
    {
      nome: 'São José de Piranhas',
      professores: [
        {
          nome: 'Lúcia Fernandes',
          qualidade: 4,
          atribuicoes: [at(sj[0]!, 'Língua Portuguesa'), at(sj[1]!, 'Redação')],
        },
        { nome: 'Paulo Henrique', qualidade: 3.3, atribuicoes: [at(sj[1]!, 'Química')] },
        // DESCOBJETOAVALIADO com mais de 100 caracteres (truncado) e hífen no nome da disciplina.
        {
          nome: 'Maria Eduarda dos Santos Albuquerque',
          qualidade: 3.8,
          atribuicoes: [at(sj[0]!, 'Linguagens - Produção Textual e Leitura Crítica Aplicada')],
        },
      ],
    },
  ];
}

/** O TOTVS corta o DESCOBJETOAVALIADO em 100 caracteres (no 004 e no 005). */
export const LIMITE_DESCOBJETO = 100;
const objetoProfessor = (prof: string, codTurma: string, disciplina: string) =>
  `Professor - Turma - Disciplina: ${prof} - ${codTurma} - ${disciplina}`.slice(0, LIMITE_DESCOBJETO);

const PROVA_PROFESSORES = 'Avaliação dos Professores pelos Alunos 2026';

type Linha = Record<string, unknown>;

export type DadosMock = Record<Sentenca, Envelope>;

/** Linha do 004 (avaliação do professor pelo aluno), com os campos de turma/curso. */
function linha004(
  u: Unidade,
  p: Professor,
  a: Atribuicao,
  id: number,
  codQuestao: number,
  texto: string,
  resposta: string,
): Linha {
  return {
    CODPROVA: 20,
    NOME: PROVA_PROFESSORES,
    TEXTO: texto,
    ID_INSCRICAO: id,
    CODQUESTAO: codQuestao,
    CODRESPOSTA: resposta,
    PROFESSOR: p.nome,
    DESCOBJETOAVALIADO: objetoProfessor(p.nome, a.turma.codTurma, a.disciplina),
    UNIDADE: `Unidade ${u.nome}`,
    MODALIDADE: a.turma.modalidade,
    CURSO_NOME_TRATADO: a.turma.cursoTratado,
    CURSO: a.turma.curso,
    CODHABILITACAO: a.turma.habilitacao,
    SERIE: a.turma.serie,
    ANO,
    CODTURMA: a.turma.codTurma,
    TURMA: a.turma.turma,
  };
}

/**
 * Gera os envelopes. Mesma seed → mesmos dados.
 * - 004: avaliação de professores pelos alunos (campos completos de turma/modalidade);
 * - 005: adesão (quantitativos) de cada professor × turma × disciplina;
 * - 006: demais provas dos alunos (+ algumas linhas de professor, que o transform ignora);
 * - 009: provas respondidas por professores.
 */
export function gerarDadosMock(seed = SEED_PADRAO): DadosMock {
  const rnd = criarAleatorio(seed);
  const unidades = montarUnidades(rnd);
  const l004: Linha[] = [];
  const l005: Linha[] = [];
  const l006: Linha[] = [];
  let inscricao = 100000;

  for (const u of unidades) {
    // ---------------- 004 + 005 (avaliação de professores pelos alunos) ----------------
    for (const p of u.professores) {
      for (const a of p.atribuicoes) {
        const quantAlunos = Math.round(a.turma.alunos * a.adesao);
        l005.push({
          DESCOBJETOAVALIADO: objetoProfessor(p.nome, a.turma.codTurma, a.disciplina),
          PROFESSOR: p.nome,
          DISCIPLINA: a.disciplina,
          CODTURMA: a.turma.codTurma,
          TURMA: a.turma.turma,
          QUANT_ALUNOS: quantAlunos,
          QUANT_RESPOSTAS: quantAlunos * QUESTOES_PROFESSOR.length,
          PORCENTAGEM_RESPOSTAS: Math.round((quantAlunos / a.turma.alunos) * 100),
          QUANTIDADE_ALUNOS_TURMA: a.turma.alunos,
          UNIDADE: `Unidade ${u.nome}`,
          CURSO: a.turma.curso,
          SERIE: a.turma.serie,
          ANO,
          MODALIDADE: a.turma.modalidade,
        });
        if (p.semRespostas) continue;
        const qualidadeTurma = p.qualidade + (rnd.proximo() - 0.5) * 0.6;
        for (let aluno = 0; aluno < quantAlunos; aluno++) {
          const id = ++inscricao;
          QUESTOES_PROFESSOR.forEach((texto, qi) => {
            l004.push(linha004(u, p, a, id, qi + 1, texto, sortearResposta(rnd, qualidadeTurma)));
          });
        }
      }
    }

    // ---------------- 006 (outras provas dos alunos) ----------------
    const outras: [number, string, string[], string, number][] = [
      [21, 'Pesquisa de Satisfação 2026', QUESTOES_SATISFACAO, '', 3.2 + rnd.proximo() * 1.4],
      [22, 'Avaliação de Infraestrutura 2026', QUESTOES_INFRA, 'INFRAESTRUTURA', 2.4 + rnd.proximo() * 2],
    ];
    for (const [codProva, prova, questoes, objeto, qualidade] of outras) {
      const respondentes = rnd.inteiro(25, 60);
      for (let r = 0; r < respondentes; r++) {
        const id = ++inscricao;
        questoes.forEach((texto, qi) => {
          l006.push({
            CODPROVA: codProva,
            PROVA: prova,
            TEXTO: texto,
            ID_INSCRICAO: id,
            CODQUESTAO: qi + 1,
            CODRESPOSTA: sortearResposta(rnd, qualidade),
            DESCOBJETOAVALIADO: objeto,
            UNIDADE: u.nome,
          });
        });
      }
    }
  }

  inserirCasosDeBorda(unidades, l004, l006);
  // PRNG próprio para o 009: não depende da geração das outras sentenças.
  const l009 = gerar009(unidades, criarAleatorio(seed ^ SALT_009));
  return {
    'EDU.BI.004': { Row: l004 },
    'EDU.BI.005': { Row: l005 },
    'EDU.BI.006': { Row: l006 },
    'EDU.BI.009': { Row: l009 },
  };
}

/** Casos de borda explícitos (ver TESTES.md). */
function inserirCasosDeBorda(unidades: Unidade[], l004: Linha[], l006: Linha[]): void {
  // CODRESPOSTA: minúscula com espaço (aceita), inválida e vazia (descartadas) — no 004 e no 006.
  if (l004[0]) l004[0].CODRESPOSTA = ' b ';
  if (l004[1]) l004[1].CODRESPOSTA = 'X';
  if (l004[2]) l004[2].CODRESPOSTA = '';
  if (l006[0]) l006[0].CODRESPOSTA = 'Z';
  // Linhas duplicadas.
  if (l004[10]) l004.push({ ...l004[10] });
  if (l006[5]) l006.push({ ...l006[5] });

  const patos = unidades.find((u) => u.nome === 'Patos') as Unidade;
  const cg = unidades.find((u) => u.nome === 'Campina Grande') as Unidade;
  const carlos = cg.professores.find((p) => p.nome === 'Carlos Souza') as Professor;
  const antonio = patos.professores.find((p) => p.nome === 'Antônio Pereira') as Professor;
  const q1 = QUESTOES_PROFESSOR[0] as string;
  // 004 sem par no 005 (professor de outra unidade).
  l004.push(linha004(patos, carlos, carlos.atribuicoes[0] as Atribuicao, 990001, 1, q1, 'C'));
  // Prefixo com caixa diferente e espaços extras (casa com o 005 de Antônio Pereira em Patos).
  l004.push({
    ...linha004(patos, antonio, antonio.atribuicoes[0] as Atribuicao, 990002, 1, q1, 'A'),
    DESCOBJETOAVALIADO: 'PROFESSOR - TURMA - DISCIPLINA:  Antônio Pereira  -  1AEM  -  Matemática ',
  });
  // Formato quebrado → aviso; professor e turma vêm dos campos próprios.
  l004.push({
    ...linha004(patos, antonio, antonio.atribuicoes[0] as Atribuicao, 990003, 1, q1, 'B'),
    DESCOBJETOAVALIADO: 'Professor - Turma - Disciplina: Antônio Pereira',
  });

  // 006: avaliação de professor (deve ser ignorada; vem do 004) e formato quebrado (vira outra prova).
  const base006 = { CODPROVA: 20, PROVA: PROVA_PROFESSORES, TEXTO: q1, CODQUESTAO: 1, UNIDADE: 'Patos' };
  l006.push(
    {
      ...base006,
      ID_INSCRICAO: 990004,
      CODRESPOSTA: 'A',
      DESCOBJETOAVALIADO: objetoProfessor('Antônio Pereira', '1AEM', 'Matemática'),
    },
    {
      ...base006,
      ID_INSCRICAO: 990005,
      CODRESPOSTA: 'B',
      DESCOBJETOAVALIADO: 'Professor - Turma - Disciplina: Fulano de Tal',
    },
  );
}

// ---------------- EDU.BI.009 (respostas de professores; mesmos campos do 006) ----------------

const SALT_009 = 0x9009;
export const INSCRICAO_INICIAL_009 = 300000;

const QUESTOES_PSICOLOGIA = [
  'A psicologia escolar apoia os professores no atendimento aos alunos?',
  'Os encaminhamentos à psicologia têm retorno adequado?',
];
const QUESTOES_SECRETARIA = [
  'A secretaria atende às demandas dos professores no prazo?',
  'As informações da secretaria são claras e corretas?',
];
const QUESTOES_INFRA_PROFESSOR = [
  'As salas de aula oferecem condições adequadas para lecionar?',
  'Os recursos audiovisuais estão disponíveis quando necessários?',
  'A sala dos professores é adequada?',
];

/**
 * Provas do 009: [CODPROVA, PROVA, [DESCOBJETOAVALIADO, questões][]]. Segue o padrão real do 006
 * (`AVALIAÇÃO INSTITUCIONAL 2026 ... - <setor>`, objeto = setor). A "Gestão Escolar" avalia vários objetos numa só
 * prova; "Infraestrutura" vem com objeto vazio (como as provas sem objeto do 006).
 */
const PROVAS_009: [number, string, [string, string[]][]][] = [
  [30, 'Avaliação Institucional 2026 Professores - Direção', [['Direção', QUESTOES_DIRECAO]]],
  [
    31,
    'Avaliação Institucional 2026 Professores - Coord. Pedagógica',
    [['Coord. Pedagógica', QUESTOES_COORDENACAO]],
  ],
  [
    32,
    'Avaliação Institucional 2026 Professores - Psicologia Escolar',
    [['Psicologia Escolar', QUESTOES_PSICOLOGIA]],
  ],
  [
    33,
    'Avaliação Institucional 2026 Professores - Gestão Escolar',
    [
      ['Direção', questoesGestao('A direção')],
      ['Coord. Pedagógica', questoesGestao('A coordenação pedagógica')],
      ['Secretaria', QUESTOES_SECRETARIA],
    ],
  ],
  [34, 'Avaliação Institucional 2026 Professores - Infraestrutura', [['', QUESTOES_INFRA_PROFESSOR]]],
];

/** Cada professor da unidade responde cada prova uma vez (uma inscrição por professor × prova). */
function gerar009(unidades: Unidade[], rnd: Aleatorio): Linha[] {
  const linhas: Linha[] = [];
  let inscricao = INSCRICAO_INICIAL_009;
  for (const u of unidades) {
    const qualidadeSetor = new Map<string, number>();
    const qualidade = (objeto: string) => {
      if (!qualidadeSetor.has(objeto)) qualidadeSetor.set(objeto, 2.6 + rnd.proximo() * 2.2);
      return qualidadeSetor.get(objeto) as number;
    };
    for (const [codProva, prova, objetos] of PROVAS_009) {
      for (let i = 0; i < u.professores.length; i++) {
        const id = ++inscricao;
        let codQuestao = 0;
        for (const [objeto, questoes] of objetos) {
          for (const texto of questoes) {
            linhas.push({
              CODPROVA: codProva,
              PROVA: prova,
              TEXTO: texto,
              ID_INSCRICAO: id,
              CODQUESTAO: ++codQuestao,
              CODRESPOSTA: sortearResposta(rnd, qualidade(objeto)),
              DESCOBJETOAVALIADO: objeto,
              UNIDADE: u.nome,
            });
          }
        }
      }
    }
  }
  inserirCasosDeBorda009(linhas);
  return linhas;
}

/** Casos de borda do 009 (mesmos do 006: CODRESPOSTA minúscula/inválida/vazia, duplicada, espaços extras). */
function inserirCasosDeBorda009(l009: Linha[]): void {
  if (l009[0]) l009[0].CODRESPOSTA = ' a ';
  if (l009[1]) l009[1].CODRESPOSTA = 'Z';
  if (l009[2]) l009[2].CODRESPOSTA = '';
  if (l009[7]) l009.push({ ...l009[7] });
  // Unidade com espaços extras e objeto com espaço final (como no dado real: "Apoios (...) ").
  l009.push({
    CODPROVA: 32,
    PROVA: 'Avaliação Institucional 2026 Professores - Psicologia Escolar',
    TEXTO: (QUESTOES_PSICOLOGIA as [string, string])[0],
    ID_INSCRICAO: 399999,
    CODQUESTAO: 1,
    CODRESPOSTA: 'B',
    DESCOBJETOAVALIADO: 'Psicologia Escolar ',
    UNIDADE: '  Patos ',
  });
}
