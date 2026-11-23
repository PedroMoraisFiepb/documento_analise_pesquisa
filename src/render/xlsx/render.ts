import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { Adesao } from '../../domain/join.js';
import type { Relatorio, RelatorioProfessor, RelatorioProva, ResumoQuestao } from '../../domain/model.js';
import { LETRAS } from '../../domain/normalize.js';
import { percentuais } from '../../domain/scoring.js';
import { formatDataHora } from '../../shared/format.js';
import { CORES, corDaMedia, hex } from '../../shared/theme.js';
import { rotuloModalidade, rotuloRespondentes } from '../labels.js';

type Valor = string | number | null;

export interface Coluna {
  titulo: string;
  largura: number;
  formato?: string;
}

const FORMATO_MEDIA = '0.00';
const FORMATO_PCT = '0.0"%"';

const argb = (cor: string) => `FF${hex(cor)}`;

function preencher(celula: ExcelJS.Cell, cor: string, fonteBranca = true): void {
  celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(cor) } };
  if (fonteBranca) celula.font = { ...celula.font, color: { argb: argb(CORES.branco) }, bold: true };
}

/**
 * Escreve uma tabela a partir de `linhaInicial`: cabeçalho azul-escuro com texto branco, larguras e formatos.
 * Devolve o número da última linha escrita.
 */
export function escreverTabela(
  ws: ExcelJS.Worksheet,
  colunas: readonly Coluna[],
  linhas: readonly Valor[][],
  linhaInicial = 1,
): number {
  const cabecalho = ws.getRow(linhaInicial);
  colunas.forEach((c, i) => {
    const cel = cabecalho.getCell(i + 1);
    cel.value = c.titulo;
    preencher(cel, CORES.azulEscuro);
    cel.alignment = { vertical: 'middle', wrapText: true };
    const col = ws.getColumn(i + 1);
    col.width = Math.max(col.width ?? 0, c.largura);
  });
  linhas.forEach((valores, li) => {
    const row = ws.getRow(linhaInicial + 1 + li);
    valores.forEach((v, ci) => {
      const cel = row.getCell(ci + 1);
      cel.value = v;
      const formato = colunas[ci]?.formato;
      if (formato && typeof v === 'number') cel.numFmt = formato;
    });
  });
  return linhaInicial + linhas.length;
}

/** Tabela principal da aba: congela o cabeçalho e aplica autofiltro. */
function tabelaPrincipal(
  ws: ExcelJS.Worksheet,
  colunas: readonly Coluna[],
  linhas: readonly Valor[][],
): void {
  escreverTabela(ws, colunas, linhas, 1);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, linhas.length + 1), column: colunas.length },
  };
}

/** Pinta células de média conforme a faixa (§4.3). */
function colorirMedias(ws: ExcelJS.Worksheet, coluna: number, primeira: number, ultima: number): void {
  for (let l = primeira; l <= ultima; l++) {
    const cel = ws.getRow(l).getCell(coluna);
    if (typeof cel.value === 'number') preencher(cel, corDaMedia(cel.value));
  }
}

function colorirAdesaoBaixa(ws: ExcelJS.Worksheet, coluna: number, primeira: number, ultima: number): void {
  for (let l = primeira; l <= ultima; l++) {
    const cel = ws.getRow(l).getCell(coluna);
    if (typeof cel.value === 'number' && cel.value < 50) preencher(cel, CORES.laranja);
  }
}

function abaResumo(
  wb: ExcelJS.Workbook,
  pares: [string, Valor][],
  formatos: Record<string, string> = {},
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Resumo');
  escreverTabela(
    ws,
    [
      { titulo: 'Indicador', largura: 38 },
      { titulo: 'Valor', largura: 60 },
    ],
    pares,
  );
  pares.forEach(([chave], i) => {
    const cel = ws.getRow(i + 2).getCell(2);
    const formato = formatos[chave];
    if (formato) cel.numFmt = formato;
    if (chave.startsWith('Média') && typeof cel.value === 'number') preencher(cel, corDaMedia(cel.value));
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

function abaPorQuestao(wb: ExcelJS.Workbook, questoes: readonly ResumoQuestao[]): void {
  const ws = wb.addWorksheet('Por questão');
  const colunas: Coluna[] = [
    { titulo: 'Questão', largura: 10 },
    { titulo: 'Enunciado', largura: 60 },
    ...LETRAS.flatMap((l) => [
      { titulo: `${l} (qtd)`, largura: 9 },
      { titulo: `${l} (%)`, largura: 9, formato: FORMATO_PCT },
    ]),
    { titulo: 'Respostas', largura: 11 },
    { titulo: 'Média', largura: 9, formato: FORMATO_MEDIA },
  ];
  const linhas = questoes.map((q) => {
    const pct = percentuais(q.estatistica.distribuicao);
    return [
      q.codQuestao,
      q.texto,
      ...LETRAS.flatMap((l) => [q.estatistica.distribuicao[l], pct[l]]),
      q.estatistica.respostas,
      q.estatistica.media,
    ];
  });
  tabelaPrincipal(ws, colunas, linhas);
  colorirMedias(ws, colunas.length, 2, linhas.length + 1);
}

function abaRespostas(wb: ExcelJS.Workbook, r: Relatorio): void {
  const ws = wb.addWorksheet('Respostas');
  const professor = r.tipo === 'professor';
  const colunas: Coluna[] = [
    { titulo: 'Cód. prova', largura: 11 },
    { titulo: 'Prova', largura: 36 },
    { titulo: 'Questão', largura: 9 },
    { titulo: 'Enunciado', largura: 50 },
    { titulo: 'Inscrição', largura: 12 },
    { titulo: 'Resposta', largura: 10 },
    { titulo: 'Nota', largura: 7 },
    { titulo: 'Objeto avaliado', largura: 40 },
    // 006/009 não identificam o respondente: a coluna de professor só existe no relatório do professor.
    ...(professor
      ? [
          { titulo: 'Professor avaliado', largura: 28 },
          { titulo: 'Cód. turma', largura: 12 },
          { titulo: 'Disciplina', largura: 24 },
        ]
      : []),
  ];
  const linhas = r.respostas.map((x) => [
    x.codProva,
    x.prova,
    x.codQuestao,
    x.texto,
    x.idInscricao,
    x.resposta,
    x.nota,
    x.objetoAvaliado,
    ...(professor ? [x.professor ?? '', x.codTurma ?? '', x.disciplina ?? ''] : []),
  ]);
  tabelaPrincipal(ws, colunas, linhas);
}

function linhaAdesao(a: Adesao): Valor[] {
  return [
    a.professor,
    a.disciplina,
    a.codTurma,
    a.turma,
    a.quantAlunos,
    a.quantRespostas,
    a.porcentagem,
    a.quantidadeAlunosTurma,
    a.curso,
    a.serie,
    a.ano,
    a.modalidade,
  ];
}

function livroProva(wb: ExcelJS.Workbook, r: RelatorioProva, geradoEm: Date): void {
  const ws = abaResumo(
    wb,
    [
      ['Unidade', r.unidade],
      ['Prova', r.nome],
      ['Código da prova', r.codProva],
      ['Respondida por', rotuloRespondentes(r)],
      ['Data de geração', formatDataHora(geradoEm)],
      ['Respondentes', r.resumo.respondentes],
      ['Respostas válidas', r.resumo.respostas],
      ['Respostas inválidas', r.respostasInvalidas],
      ['Linhas duplicadas ignoradas', r.duplicadas],
      ['Média da unidade', r.resumo.media],
    ],
    { 'Média da unidade': FORMATO_MEDIA },
  );
  if (r.porObjeto.length > 1) {
    const inicio = 14;
    escreverTabela(
      ws,
      [
        { titulo: 'Objeto avaliado', largura: 38 },
        { titulo: 'Média', largura: 12, formato: FORMATO_MEDIA },
        { titulo: 'Respostas', largura: 12 },
        { titulo: 'Respondentes', largura: 12 },
      ],
      r.porObjeto.map((o) => [
        o.objeto,
        o.estatistica.media,
        o.estatistica.respostas,
        o.estatistica.respondentes,
      ]),
      inicio,
    );
    colorirMedias(ws, 2, inicio + 1, inicio + r.porObjeto.length);
  }
  abaPorQuestao(wb, r.questoes);
  abaRespostas(wb, r);
}

function livroProfessor(wb: ExcelJS.Workbook, r: RelatorioProfessor, geradoEm: Date): void {
  abaResumo(
    wb,
    [
      ['Unidade', r.unidade],
      ['Modalidade', rotuloModalidade(r.modalidade)],
      ['Professor', r.professor],
      ['Data de geração', formatDataHora(geradoEm)],
      ['Média geral do professor', r.resumo.media],
      ['Média da unidade (referência)', r.mediaUnidade],
      ['Respondentes', r.resumo.respondentes],
      ['Respostas válidas', r.resumo.respostas],
      ['Respostas inválidas', r.respostasInvalidas],
      ['Avisos', r.avisos.length > 0 ? r.avisos.join('\n') : 'Nenhum'],
    ],
    { 'Média geral do professor': FORMATO_MEDIA, 'Média da unidade (referência)': FORMATO_MEDIA },
  );

  const wsTurmas = wb.addWorksheet('Por disciplina e turma');
  const colTurmas: Coluna[] = [
    { titulo: 'Disciplina', largura: 26 },
    { titulo: 'Cód. turma', largura: 12 },
    { titulo: 'Turma', largura: 20 },
    { titulo: 'Média', largura: 9, formato: FORMATO_MEDIA },
    { titulo: 'Respostas', largura: 11 },
    { titulo: 'Respondentes', largura: 13 },
    { titulo: 'Adesão (%)', largura: 11, formato: FORMATO_PCT },
    { titulo: 'Alunos que responderam', largura: 14 },
    { titulo: 'Alunos na turma', largura: 12 },
  ];
  const linhasTurmas = r.porTurmaDisciplina.map((t) => [
    t.disciplina,
    t.codTurma,
    t.turma,
    t.estatistica.media,
    t.estatistica.respostas,
    t.estatistica.respondentes,
    t.adesao?.porcentagem ?? null,
    t.adesao?.quantAlunos ?? null,
    t.adesao?.quantidadeAlunosTurma ?? null,
  ]);
  tabelaPrincipal(wsTurmas, colTurmas, linhasTurmas);
  colorirMedias(wsTurmas, 4, 2, linhasTurmas.length + 1);
  colorirAdesaoBaixa(wsTurmas, 7, 2, linhasTurmas.length + 1);

  abaPorQuestao(wb, r.questoes);

  const wsAdesao = wb.addWorksheet('Adesão');
  const colAdesao: Coluna[] = [
    { titulo: 'PROFESSOR', largura: 26 },
    { titulo: 'DISCIPLINA', largura: 24 },
    { titulo: 'CODTURMA', largura: 11 },
    { titulo: 'TURMA', largura: 18 },
    { titulo: 'QUANT_ALUNOS', largura: 14 },
    { titulo: 'QUANT_RESPOSTAS', largura: 16 },
    { titulo: 'PORCENTAGEM_RESPOSTAS', largura: 14, formato: FORMATO_PCT },
    { titulo: 'QUANTIDADE_ALUNOS_TURMA', largura: 14 },
    { titulo: 'CURSO', largura: 24 },
    { titulo: 'SERIE', largura: 12 },
    { titulo: 'ANO', largura: 8 },
    { titulo: 'MODALIDADE', largura: 12 },
  ];
  tabelaPrincipal(wsAdesao, colAdesao, r.adesao.map(linhaAdesao));
  colorirAdesaoBaixa(wsAdesao, 7, 2, r.adesao.length + 1);

  abaRespostas(wb, r);
}

/** Gera `<pasta>/<arquivoBase>.xlsx` (abas conforme REGRAS_DE_NEGOCIO §7). */
export async function gerarXlsx(r: Relatorio, pastaRelatorio: string, geradoEm: Date): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Relatórios de Avaliação';
  wb.created = geradoEm;
  if (r.tipo === 'professor') livroProfessor(wb, r, geradoEm);
  else livroProva(wb, r, geradoEm);
  await mkdir(pastaRelatorio, { recursive: true });
  const arquivo = path.join(pastaRelatorio, `${r.arquivoBase}.xlsx`);
  await wb.xlsx.writeFile(arquivo);
  return arquivo;
}
