import { formatCarimbo } from '../shared/format.js';
import { classificarAvaliacao004, classificarObjetoAvaliado } from './classify.js';
import { type Adesao, type IndiceAdesao, chaveAdesao, chaveObjetoAdesao, indexarAdesao } from './join.js';
import {
  type Aviso,
  type FonteProva,
  GRUPO_PROFESSORES,
  type Grupo,
  type Modelo,
  PASTA_PROVAS_DE_PROFESSORES,
  type Relatorio,
  type RelatorioProfessor,
  type RelatorioProva,
  type RespostaNormalizada,
  type ResumoQuestao,
  type Unidade,
  VERSAO_MODELO,
} from './model.js';
import { chave, chaveUnidade, limparTexto, normalizarResposta, normalizarUnidade } from './normalize.js';
import { AlocadorDeNomes } from './paths.js';
import type { LinhaRejeitada, Linha004, Linha005, Linha006, Linha009, Sentenca } from './schemas.js';
import { Acumulador, NOTA } from './scoring.js';

export interface EntradaModelo {
  /** Avaliação de professores pelos alunos. */
  linhas004: readonly Linha004[];
  /** Adesão (quantitativos de quem respondeu). */
  linhas005: readonly Linha005[];
  /** Demais provas dos alunos. */
  linhas006: readonly Linha006[];
  /** Provas respondidas por professores. */
  linhas009: readonly Linha009[];
}

export interface OpcoesModelo {
  agora: Date;
  /** Filtro local opcional (P4): aplicado ao 004 e ao 005 pelo campo ANO. */
  anoLetivo?: string | undefined;
}

export interface ResultadoModelo {
  modelo: Modelo;
  avisos: Aviso[];
}

const ORDEM_GRUPO_REGULAR = 1;
const ORDEM_GRUPO_EJA = 2;
const ORDEM_GRUPO_OUTROS = 3;

// ---------------------------------------------------------------------------------------------
// Modalidade
// ---------------------------------------------------------------------------------------------

/** Modalidade canônica: vazio → REGULAR; demais em maiúsculas. */
export function modalidadeCanonica(modalidade: string): string {
  const m = limparTexto(modalidade).toUpperCase();
  return m === '' ? 'REGULAR' : m;
}

/** Nome da pasta do grupo de alunos para a modalidade (§5). */
export function nomeGrupoAlunos(modalidade: string): string {
  const m = modalidadeCanonica(modalidade);
  if (chave(m) === 'regular') return 'Alunos do Regular';
  if (chave(m) === 'eja') return 'Alunos da EJA';
  const titulo = m.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return `Alunos - ${titulo}`;
}

function ordemGrupoAlunos(modalidade: string): number {
  const k = chave(modalidadeCanonica(modalidade));
  if (k === 'regular') return ORDEM_GRUPO_REGULAR;
  if (k === 'eja') return ORDEM_GRUPO_EJA;
  return ORDEM_GRUPO_OUTROS;
}

// ---------------------------------------------------------------------------------------------
// Acúmulo
// ---------------------------------------------------------------------------------------------

class AcumuladorQuestoes {
  private readonly mapa = new Map<number, { texto: string; acc: Acumulador }>();

  adicionar(r: RespostaNormalizada): void {
    let q = this.mapa.get(r.codQuestao);
    if (!q) {
      q = { texto: r.texto, acc: new Acumulador() };
      this.mapa.set(r.codQuestao, q);
    }
    if (!q.texto && r.texto) q.texto = r.texto;
    q.acc.adicionar(r.resposta, r.idInscricao);
  }

  resumo(): ResumoQuestao[] {
    return [...this.mapa.entries()]
      .sort(([a], [b]) => a - b)
      .map(([codQuestao, q]) => ({ codQuestao, texto: q.texto, estatistica: q.acc.resumo() }));
  }
}

interface BaldeComum {
  unidadeChave: string;
  total: Acumulador;
  questoes: AcumuladorQuestoes;
  respostas: RespostaNormalizada[];
  invalidas: number;
  duplicadas: number;
}

interface BaldeProva extends BaldeComum {
  tipo: 'prova';
  fonte: FonteProva;
  grupoChave: string;
  codProva: number;
  nome: string;
  objetos: Map<string, { objeto: string; acc: Acumulador }>;
}

interface TurmaDisciplina {
  codTurma: string;
  turma: string;
  disciplina: string;
  acc: Acumulador;
  adesao: Adesao | null;
}

interface BaldeProfessor extends BaldeComum {
  tipo: 'professor';
  modalidade: string;
  professor: string;
  turmas: Map<string, TurmaDisciplina>;
}

function novoComum(unidadeChave: string): BaldeComum {
  return {
    unidadeChave,
    total: new Acumulador(),
    questoes: new AcumuladorQuestoes(),
    respostas: [],
    invalidas: 0,
    duplicadas: 0,
  };
}

const DISCIPLINA_NAO_INFORMADA = 'Disciplina não informada';

/** Grupo da árvore: provas respondidas por professores (009) ou "alunos:<MODALIDADE>". */
const GRUPO_PROFESSORES_RESPONDEM = 'professores';
const grupoAlunosChave = (modalidade: string) => `alunos:${modalidadeCanonica(modalidade)}`;

class Construtor {
  readonly avisos: Aviso[] = [];
  private readonly nomesUnidade = new Map<string, string>();
  private readonly provas = new Map<string, BaldeProva>();
  private readonly professores = new Map<string, BaldeProfessor>();
  private readonly vistos = {
    'EDU.BI.004': new Set<string>(),
    'EDU.BI.006': new Set<string>(),
    'EDU.BI.009': new Set<string>(),
  };

  constructor(private readonly opcoes: OpcoesModelo) {}

  private registrarUnidade(bruta: string): string {
    const k = chaveUnidade(bruta);
    if (!this.nomesUnidade.has(k)) this.nomesUnidade.set(k, normalizarUnidade(bruta) || 'Sem unidade');
    return k;
  }

  private filtraAno(ano: string): boolean {
    return !this.opcoes.anoLetivo || limparTexto(ano) === this.opcoes.anoLetivo;
  }

  /** Verifica duplicidade (§3). Retorna true se a linha já foi vista. */
  private duplicada(
    sentenca: 'EDU.BI.004' | FonteProva,
    linha: { CODPROVA: number; ID_INSCRICAO: string; CODQUESTAO: number; DESCOBJETOAVALIADO: string },
  ): boolean {
    const k = [
      linha.CODPROVA,
      linha.ID_INSCRICAO,
      linha.CODQUESTAO,
      limparTexto(linha.DESCOBJETOAVALIADO),
    ].join('|');
    const set = this.vistos[sentenca];
    if (set.has(k)) {
      this.avisos.push({
        tipo: 'duplicada',
        sentenca,
        mensagem: 'Linha duplicada ignorada (mesma prova, inscrição, questão e objeto avaliado).',
        detalhe: { CODPROVA: linha.CODPROVA, ID_INSCRICAO: linha.ID_INSCRICAO, CODQUESTAO: linha.CODQUESTAO },
      });
      return true;
    }
    set.add(k);
    return false;
  }

  private respostaInvalida(sentenca: Sentenca, codResposta: string, detalhe: Record<string, unknown>): void {
    this.avisos.push({
      tipo: 'resposta-invalida',
      sentenca,
      mensagem: `CODRESPOSTA inválido ("${codResposta}"); resposta descartada do cálculo.`,
      detalhe,
    });
  }

  private baldeProva(
    fonte: FonteProva,
    grupoChave: string,
    unidadeChave: string,
    codProva: number,
    nome: string,
  ): BaldeProva {
    const k = [fonte, grupoChave, unidadeChave, codProva].join('|');
    let b = this.provas.get(k);
    if (!b) {
      b = {
        ...novoComum(unidadeChave),
        tipo: 'prova',
        fonte,
        grupoChave,
        codProva,
        nome: limparTexto(nome) || `Prova ${codProva}`,
        objetos: new Map(),
      };
      this.provas.set(k, b);
    }
    return b;
  }

  private baldeProfessor(unidadeChave: string, modalidade: string, professor: string): BaldeProfessor {
    const mod = modalidadeCanonica(modalidade);
    const k = [unidadeChave, mod, chave(professor)].join('|');
    let b = this.professores.get(k);
    if (!b) {
      b = { ...novoComum(unidadeChave), tipo: 'professor', modalidade: mod, professor, turmas: new Map() };
      this.professores.set(k, b);
    }
    return b;
  }

  private static turma(
    b: BaldeProfessor,
    codTurma: string,
    disciplina: string,
    adesao: Adesao | null,
    nomeTurma = '',
  ): TurmaDisciplina {
    // Com par no 005, a chave usa a disciplina completa do 005 (o texto do 004 pode vir truncado).
    const k = adesao
      ? `${chave(adesao.codTurma)}|${chave(adesao.disciplina)}`
      : `${chave(codTurma)}|${chave(disciplina)}`;
    let t = b.turmas.get(k);
    if (!t) {
      t = {
        codTurma: adesao?.codTurma ?? codTurma,
        turma: adesao?.turma || nomeTurma || codTurma,
        disciplina: adesao?.disciplina ?? disciplina,
        acc: new Acumulador(),
        adesao,
      };
      b.turmas.set(k, t);
    }
    return t;
  }

  private static registrarResposta(b: BaldeComum, r: RespostaNormalizada): void {
    b.total.adicionar(r.resposta, r.idInscricao);
    b.questoes.adicionar(r);
    b.respostas.push(r);
  }

  // ----- EDU.BI.004 + EDU.BI.005 (avaliação de professores pelos alunos) --------------------------

  processar004(linhas: readonly Linha004[], indice: IndiceAdesao): void {
    for (const l of linhas) {
      if (!this.filtraAno(l.ANO)) continue;
      const unidadeChave = this.registrarUnidade(l.UNIDADE);
      const classe = classificarAvaliacao004(l.DESCOBJETOAVALIADO, l.PROFESSOR, l.CODTURMA);
      let professorLinha = limparTexto(l.PROFESSOR);
      let codTurma = limparTexto(l.CODTURMA);
      let disciplina = DISCIPLINA_NAO_INFORMADA;
      if (classe.tipo === 'professor') {
        ({ disciplina } = classe);
        professorLinha ||= classe.professor;
        codTurma ||= classe.codTurma;
      } else if (!this.malformadoJaAvisado(l)) {
        this.avisos.push({
          tipo: 'objeto-malformado',
          sentenca: 'EDU.BI.004',
          mensagem:
            'DESCOBJETOAVALIADO fora do formato "Professor - Turma - Disciplina: ..."; disciplina não identificada.',
          detalhe: { PROFESSOR: l.PROFESSOR, CODTURMA: l.CODTURMA, DESCOBJETOAVALIADO: l.DESCOBJETOAVALIADO },
        });
      }
      professorLinha ||= 'Professor não informado';

      const adesao =
        indice.porObjeto.get(chaveObjetoAdesao(limparTexto(l.DESCOBJETOAVALIADO), l.UNIDADE)) ??
        indice.porChave.get(chaveAdesao(professorLinha, codTurma, disciplina, l.UNIDADE));
      if (!adesao && !this.semParJaAvisado(l)) {
        this.avisos.push({
          tipo: 'sem-par-005',
          sentenca: 'EDU.BI.004',
          mensagem: 'Avaliação de professor sem correspondência no EDU.BI.005 (sem dados de adesão).',
          detalhe: {
            PROFESSOR: professorLinha,
            CODTURMA: codTurma,
            DISCIPLINA: disciplina,
            UNIDADE: l.UNIDADE,
          },
        });
      }
      const professor = adesao?.professor || professorLinha;
      const modalidade = adesao?.modalidade || l.MODALIDADE;
      const balde = this.baldeProfessor(unidadeChave, modalidade, professor);
      const turma = Construtor.turma(balde, codTurma, disciplina, adesao ?? null, limparTexto(l.TURMA));
      if (this.duplicada('EDU.BI.004', l)) {
        balde.duplicadas++;
        continue;
      }
      const letra = normalizarResposta(l.CODRESPOSTA);
      if (!letra) {
        balde.invalidas++;
        this.respostaInvalida('EDU.BI.004', l.CODRESPOSTA, {
          CODPROVA: l.CODPROVA,
          ID_INSCRICAO: l.ID_INSCRICAO,
        });
        continue;
      }
      Construtor.registrarResposta(balde, {
        codProva: l.CODPROVA,
        prova: limparTexto(l.NOME),
        codQuestao: l.CODQUESTAO,
        texto: limparTexto(l.TEXTO),
        idInscricao: l.ID_INSCRICAO,
        resposta: letra,
        nota: NOTA[letra],
        objetoAvaliado: limparTexto(l.DESCOBJETOAVALIADO),
        professor,
        codTurma: turma.codTurma,
        disciplina: turma.disciplina,
      });
      turma.acc.adicionar(letra, l.ID_INSCRICAO);
    }

    // Professores/turmas presentes no 005 (inclusive sem respostas no 004).
    for (const a of indice.porChave.values()) {
      const unidadeChave = this.registrarUnidade(a.unidade);
      const balde = this.baldeProfessor(unidadeChave, a.modalidade, a.professor);
      Construtor.turma(balde, a.codTurma, a.disciplina, a);
    }
  }

  /** Avisos "sem par" e "malformado" só na 1ª ocorrência de (unidade, DESCOBJETOAVALIADO) (D13). */
  private readonly semParAvisados = new Set<string>();
  private semParJaAvisado(l: Linha004): boolean {
    return Construtor.jaVisto(this.semParAvisados, l);
  }
  private readonly malformadosAvisados = new Set<string>();
  private malformadoJaAvisado(l: Linha004): boolean {
    return Construtor.jaVisto(this.malformadosAvisados, l);
  }
  private static jaVisto(set: Set<string>, l: Linha004): boolean {
    const k = `${chaveUnidade(l.UNIDADE)}|${chave(l.DESCOBJETOAVALIADO)}`;
    if (set.has(k)) return true;
    set.add(k);
    return false;
  }

  // ----- EDU.BI.006 (demais provas dos alunos) -----------------------------------------------------

  processar006(linhas: readonly Linha006[]): void {
    let ignoradas = 0;
    for (const l of linhas) {
      let classe = classificarObjetoAvaliado(l.DESCOBJETOAVALIADO);
      if (classe.tipo === 'professor') {
        // A avaliação de professores vem do 004 (D29); no 006 seria contada em dobro.
        ignoradas++;
        continue;
      }
      const unidadeChave = this.registrarUnidade(l.UNIDADE);
      if (classe.tipo === 'malformado') {
        this.avisos.push({
          tipo: 'objeto-malformado',
          sentenca: 'EDU.BI.006',
          mensagem: `DESCOBJETOAVALIADO com prefixo de professor mas formato inválido (${classe.motivo}); tratado como outra prova.`,
          detalhe: { CODPROVA: l.CODPROVA, DESCOBJETOAVALIADO: l.DESCOBJETOAVALIADO },
        });
        classe = { tipo: 'outra' };
      }
      // P3: "outras provas" não têm modalidade → Alunos do Regular.
      const balde = this.baldeProva(
        'EDU.BI.006',
        grupoAlunosChave('REGULAR'),
        unidadeChave,
        l.CODPROVA,
        l.PROVA,
      );
      this.registrarProva('EDU.BI.006', balde, l);
    }
    if (ignoradas > 0) {
      this.avisos.push({
        tipo: 'professor-no-006',
        sentenca: 'EDU.BI.006',
        mensagem: `${ignoradas} linha(s) de avaliação de professor ignorada(s) no EDU.BI.006 (essa avaliação vem do EDU.BI.004).`,
        detalhe: { linhas: ignoradas },
      });
    }
  }

  // ----- EDU.BI.009 (provas respondidas por professores) -------------------------------------------

  processar009(linhas: readonly Linha009[]): void {
    for (const l of linhas) {
      const unidadeChave = this.registrarUnidade(l.UNIDADE);
      const balde = this.baldeProva(
        'EDU.BI.009',
        GRUPO_PROFESSORES_RESPONDEM,
        unidadeChave,
        l.CODPROVA,
        l.PROVA,
      );
      this.registrarProva('EDU.BI.009', balde, l);
    }
  }

  /** Registra uma linha de prova (006/009): duplicidade, resposta inválida, questão e objeto avaliado. */
  private registrarProva(sentenca: FonteProva, balde: BaldeProva, l: Linha006 | Linha009): void {
    if (this.duplicada(sentenca, l)) {
      balde.duplicadas++;
      return;
    }
    const letra = normalizarResposta(l.CODRESPOSTA);
    if (!letra) {
      balde.invalidas++;
      this.respostaInvalida(sentenca, l.CODRESPOSTA, { CODPROVA: l.CODPROVA, ID_INSCRICAO: l.ID_INSCRICAO });
      return;
    }
    const objetoBruto = limparTexto(l.DESCOBJETOAVALIADO);
    Construtor.registrarResposta(balde, {
      codProva: l.CODPROVA,
      prova: balde.nome,
      codQuestao: l.CODQUESTAO,
      texto: limparTexto(l.TEXTO),
      idInscricao: l.ID_INSCRICAO,
      resposta: letra,
      nota: NOTA[letra],
      objetoAvaliado: objetoBruto,
    });
    if (sentenca === 'EDU.BI.009') {
      const objeto = objetoBruto || 'Não informado';
      let o = balde.objetos.get(chave(objeto));
      if (!o) {
        o = { objeto, acc: new Acumulador() };
        balde.objetos.set(chave(objeto), o);
      }
      o.acc.adicionar(letra, l.ID_INSCRICAO);
    }
  }

  avisarAdesaoDuplicada(indice: IndiceAdesao): void {
    for (const a of indice.duplicadas) {
      this.avisos.push({
        tipo: 'adesao-duplicada',
        sentenca: 'EDU.BI.005',
        mensagem:
          'Linha de adesão repetida (mesmo professor, turma, disciplina e unidade); mantida a primeira.',
        detalhe: {
          PROFESSOR: a.professor,
          CODTURMA: a.codTurma,
          DISCIPLINA: a.disciplina,
          UNIDADE: a.unidade,
        },
      });
    }
  }

  // ----- Montagem final ---------------------------------------------------------------------------

  montar(): Modelo {
    const carimbo = formatCarimbo(this.opcoes.agora);
    const mediasUnidade = this.mediasDaUnidade();

    const unidadesOrdenadas = [...this.nomesUnidade.entries()].sort(([, a], [, b]) =>
      a.localeCompare(b, 'pt-BR'),
    );
    const alocUnidades = new AlocadorDeNomes();
    const unidades: Unidade[] = [];

    for (const [uChave, uNome] of unidadesOrdenadas) {
      const pastaUnidade = alocUnidades.alocar(uNome);
      const alocGrupos = new AlocadorDeNomes();
      const grupos: Grupo[] = [];

      for (const g of this.gruposDaUnidade(uChave)) {
        const pastaGrupo = alocGrupos.alocar(g.nome);
        const relatorios: Relatorio[] = [];
        const alocRel = new AlocadorDeNomes();

        const profs = g.professores.sort((a, b) => a.professor.localeCompare(b.professor, 'pt-BR'));
        if (profs.length > 0) {
          const pastaProfs = alocRel.alocar(PASTA_PROVAS_DE_PROFESSORES);
          const alocProfs = new AlocadorDeNomes();
          for (const p of profs) {
            const pasta = alocProfs.alocar(p.professor);
            const media = mediasUnidade.get(`${uChave}|${p.modalidade}`) ?? null;
            relatorios.push(
              finalizarProfessor(p, uNome, pastaGrupo, [pastaUnidade, pastaGrupo, pastaProfs, pasta], media),
            );
          }
        }
        const provas = g.provas.sort(
          (a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.codProva - b.codProva,
        );
        for (const p of provas) {
          const pasta = alocRel.alocar(p.nome);
          relatorios.push(finalizarProva(p, uNome, pastaGrupo, [pastaUnidade, pastaGrupo, pasta]));
        }
        grupos.push({ nome: pastaGrupo, relatorios });
      }
      if (grupos.length > 0) unidades.push({ nome: uNome, pasta: pastaUnidade, grupos });
    }

    const todos = unidades.flatMap((u) => u.grupos.flatMap((g) => g.relatorios));
    for (const r of todos) {
      if (r.tipo !== 'professor') continue;
      if (r.semRespostas) {
        this.avisos.push({
          tipo: 'sem-respostas',
          sentenca: 'EDU.BI.005',
          mensagem: `Professor sem respostas registradas no EDU.BI.004: ${r.professor} (${r.unidade}).`,
        });
      }
      for (const a of r.adesao.filter((x) => x.baixa)) {
        this.avisos.push({
          tipo: 'adesao-baixa',
          sentenca: 'EDU.BI.005',
          mensagem: `Adesão abaixo de 50%: ${a.professor} – ${a.disciplina} (${a.turma || a.codTurma}) – ${a.porcentagem}%.`,
          detalhe: { UNIDADE: a.unidade },
        });
      }
    }

    return {
      versao: VERSAO_MODELO,
      carimbo,
      geradoEm: this.opcoes.agora.toISOString(),
      pastaRaiz: `relatorios_${carimbo}`,
      anoLetivo: this.opcoes.anoLetivo ?? null,
      unidades,
      totais: {
        unidades: unidades.length,
        relatorios: todos.length,
        relatoriosProva: todos.filter((r) => r.tipo === 'prova').length,
        relatoriosProfessor: todos.filter((r) => r.tipo === 'professor').length,
        avisos: this.avisos.length,
      },
    };
  }

  /** Média de todas as avaliações de professores da unidade × modalidade. */
  private mediasDaUnidade(): Map<string, number | null> {
    const accs = new Map<string, Acumulador>();
    for (const p of this.professores.values()) {
      const k = `${p.unidadeChave}|${p.modalidade}`;
      const acc = accs.get(k) ?? new Acumulador();
      acc.mesclar(p.total);
      accs.set(k, acc);
    }
    return new Map([...accs.entries()].map(([k, a]) => [k, a.resumo().media]));
  }

  private gruposDaUnidade(
    unidadeChave: string,
  ): { nome: string; ordem: number; provas: BaldeProva[]; professores: BaldeProfessor[] }[] {
    const grupos = new Map<
      string,
      { nome: string; ordem: number; provas: BaldeProva[]; professores: BaldeProfessor[] }
    >();
    const obter = (k: string) => {
      let g = grupos.get(k);
      if (!g) {
        const modalidade = k.slice('alunos:'.length);
        g =
          k === GRUPO_PROFESSORES_RESPONDEM
            ? { nome: GRUPO_PROFESSORES, ordem: 0, provas: [], professores: [] }
            : {
                nome: nomeGrupoAlunos(modalidade),
                ordem: ordemGrupoAlunos(modalidade),
                provas: [],
                professores: [],
              };
        grupos.set(k, g);
      }
      return g;
    };
    for (const p of this.provas.values())
      if (p.unidadeChave === unidadeChave) obter(p.grupoChave).provas.push(p);
    for (const p of this.professores.values())
      if (p.unidadeChave === unidadeChave) obter(grupoAlunosChave(p.modalidade)).professores.push(p);
    return [...grupos.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}

function avisosDeQualidade(b: BaldeComum): string[] {
  const avisos: string[] = [];
  if (b.invalidas > 0)
    avisos.push(`${b.invalidas} resposta(s) com CODRESPOSTA inválido descartada(s) do cálculo.`);
  if (b.duplicadas > 0) avisos.push(`${b.duplicadas} linha(s) duplicada(s) ignorada(s).`);
  return avisos;
}

function finalizarProva(b: BaldeProva, unidade: string, grupo: string, caminho: string[]): RelatorioProva {
  return {
    tipo: 'prova',
    fonte: b.fonte,
    codProva: b.codProva,
    nome: b.nome,
    unidade,
    grupo,
    caminho,
    arquivoBase: caminho[caminho.length - 1] as string,
    resumo: b.total.resumo(),
    respostasInvalidas: b.invalidas,
    duplicadas: b.duplicadas,
    questoes: b.questoes.resumo(),
    porObjeto: [...b.objetos.values()]
      .sort((x, y) => x.objeto.localeCompare(y.objeto, 'pt-BR'))
      .map((o) => ({ objeto: o.objeto, estatistica: o.acc.resumo() })),
    respostas: b.respostas,
    avisos: avisosDeQualidade(b),
  };
}

function finalizarProfessor(
  b: BaldeProfessor,
  unidade: string,
  grupo: string,
  caminho: string[],
  mediaUnidade: number | null,
): RelatorioProfessor {
  const turmas = [...b.turmas.values()].sort(
    (x, y) =>
      x.disciplina.localeCompare(y.disciplina, 'pt-BR') || x.codTurma.localeCompare(y.codTurma, 'pt-BR'),
  );
  const adesao = turmas.flatMap((t) => (t.adesao ? [t.adesao] : []));
  const resumo = b.total.resumo();
  const semRespostas = resumo.respostas === 0;

  const avisos: string[] = [];
  if (semRespostas) avisos.push('Sem respostas registradas para este professor.');
  for (const a of adesao.filter((x) => x.baixa)) {
    avisos.push(
      `Adesão baixa em ${a.disciplina} (${a.turma || a.codTurma}): ${a.porcentagem}% ` +
        `(${a.quantAlunos} de ${a.quantidadeAlunosTurma} alunos responderam).`,
    );
  }
  for (const t of turmas.filter((x) => !x.adesao)) {
    avisos.push(`Sem dados de adesão para ${t.disciplina} (${t.codTurma}).`);
  }
  avisos.push(...avisosDeQualidade(b));

  return {
    tipo: 'professor',
    professor: b.professor,
    modalidade: b.modalidade,
    unidade,
    grupo,
    caminho,
    arquivoBase: caminho[caminho.length - 1] as string,
    resumo,
    mediaUnidade,
    respostasInvalidas: b.invalidas,
    duplicadas: b.duplicadas,
    questoes: b.questoes.resumo(),
    porTurmaDisciplina: turmas.map((t) => ({
      codTurma: t.codTurma,
      turma: t.turma,
      disciplina: t.disciplina,
      estatistica: t.acc.resumo(),
      adesao: t.adesao,
    })),
    adesao,
    semRespostas,
    respostas: b.respostas,
    avisos,
  };
}

/** Avisos para linhas que não passaram na validação do schema. */
export function avisosDeRejeicao(sentenca: Sentenca, rejeitadas: readonly LinhaRejeitada[]): Aviso[] {
  return rejeitadas.map((r) => ({
    tipo: 'linha-rejeitada' as const,
    sentenca,
    mensagem: `Linha ${r.indice} ignorada por formato inválido: ${r.erro}`,
    detalhe: { indice: r.indice },
  }));
}

/** Monta o modelo completo (árvore de relatórios + agregados) a partir das 4 sentenças. Função pura. */
export function construirModelo(entrada: EntradaModelo, opcoes: OpcoesModelo): ResultadoModelo {
  const c = new Construtor(opcoes);
  const linhas005 = opcoes.anoLetivo
    ? entrada.linhas005.filter((l) => limparTexto(l.ANO) === opcoes.anoLetivo)
    : entrada.linhas005;
  const indice = indexarAdesao(linhas005);
  c.avisarAdesaoDuplicada(indice);
  c.processar004(entrada.linhas004, indice);
  c.processar006(entrada.linhas006);
  c.processar009(entrada.linhas009);
  const modelo = c.montar();
  return { modelo, avisos: c.avisos };
}
