import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AlignmentType,
  BorderStyle,
  ImageRun,
  Paragraph,
  PatchType,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  patchDocument,
} from 'docx';
import type { Relatorio, RelatorioProfessor, RelatorioProva, ResumoQuestao } from '../../domain/model.js';
import { LETRAS } from '../../domain/normalize.js';
import { percentuais } from '../../domain/scoring.js';
import { AppError } from '../../shared/errors.js';
import { formatDataHora, formatNumero, formatPercentual } from '../../shared/format.js';
import { type ConfigGraficos, GRAFICOS_PADRAO } from '../../shared/graficos.js';
import { CORES, corDaMedia, hex } from '../../shared/theme.js';
import { ALTURA, type Grafico, LARGURA, caminhoImagemPng, graficosDoRelatorio } from '../charts/render.js';
import { rotuloModalidade, rotuloRespondentes } from '../labels.js';
import { MARCADOR_CONTEUDO, carregarTemplate } from './template.js';

/** Largura máxima da imagem no documento (px a 96 dpi); a altura segue a proporção do gráfico. */
const IMG_LARGURA_MAX = 600;
/** 1 px (96 dpi) = 15 twips. */
const TWIPS_POR_PX = 15;
/** Linhas em branco no quadro de respostas de perguntas abertas (D25). */
export const LINHAS_PERGUNTAS_ABERTAS = 30;
export const TITULO_PERGUNTAS_ABERTAS = 'Respostas de perguntas abertas';

type Conteudo = Paragraph | Table;

interface Celula {
  texto: string;
  cor?: string;
  fundo?: string;
  negrito?: boolean;
  alinhamento?: (typeof AlignmentType)[keyof typeof AlignmentType];
}

const c = (texto: string | number, extra: Omit<Celula, 'texto'> = {}): Celula => ({
  texto: String(texto),
  ...extra,
});

function celulaMedia(media: number | null): Celula {
  return c(formatNumero(media), {
    fundo: corDaMedia(media),
    cor: CORES.branco,
    negrito: true,
    alinhamento: AlignmentType.CENTER,
  });
}

/** Converte proporções de coluna em larguras DXA que somam a largura útil. */
function larguras(proporcoes: readonly number[], larguraUtil: number): number[] {
  const total = proporcoes.reduce((a, b) => a + b, 0);
  return proporcoes.map((p) => Math.floor((p / total) * larguraUtil));
}

/** Contexto de montagem: dimensões vindas do template. */
interface Pagina {
  larguraUtil: number;
}

function tabela(
  pagina: Pagina,
  cabecalho: readonly string[],
  linhas: readonly Celula[][],
  proporcoes?: readonly number[],
): Table {
  const colunas = proporcoes ? larguras(proporcoes, pagina.larguraUtil) : undefined;
  const largura = (i: number) => (colunas ? { width: { size: colunas[i] ?? 0, type: WidthType.DXA } } : {});
  const linhaCab = new TableRow({
    tableHeader: true,
    children: cabecalho.map(
      (t, i) =>
        new TableCell({
          ...largura(i),
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(CORES.azulEscuro) },
          children: [
            new Paragraph({
              children: [new TextRun({ text: t, bold: true, color: hex(CORES.branco), size: 18 })],
            }),
          ],
        }),
    ),
  });
  const corpo = linhas.map(
    (cels) =>
      new TableRow({
        children: cels.map(
          (cel, i) =>
            new TableCell({
              ...largura(i),
              ...(cel.fundo
                ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(cel.fundo) } }
                : {}),
              children: [
                new Paragraph({
                  alignment: cel.alinhamento ?? AlignmentType.LEFT,
                  children: [
                    new TextRun({
                      text: cel.texto,
                      size: 18,
                      ...(cel.cor ? { color: hex(cel.cor) } : {}),
                      ...(cel.negrito ? { bold: true } : {}),
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    ...(colunas ? { columnWidths: colunas, layout: TableLayoutType.FIXED } : {}),
    rows: [linhaCab, ...corpo],
  });
}

// Títulos com formatação direta: o template não define estilos de título (Heading 1/2) e os textos
// devem herdar a fonte do template.
function titulo(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 160 },
    keepNext: true,
    children: [new TextRun({ text: texto, bold: true, size: 36, color: hex(CORES.azulEscuro) })],
  });
}

function secao(texto: string, opcoes: { novaPagina?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 240, after: 120 },
    keepNext: true,
    ...(opcoes.novaPagina ? { pageBreakBefore: true } : {}),
    children: [new TextRun({ text: texto, bold: true, size: 26, color: hex(CORES.azul) })],
  });
}

function info(rotulo: string, valor: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [
      new TextRun({ text: `${rotulo}: `, bold: true, color: hex(CORES.azulEscuro) }),
      new TextRun(valor),
    ],
  });
}

function tabelaResumo(pagina: Pagina, pares: [string, Celula][]): Table {
  return tabela(
    pagina,
    ['Indicador', 'Valor'],
    pares.map(([k, v]) => [c(k, { negrito: true }), v]),
    [1, 1],
  );
}

export interface ImagemDocx {
  grafico: Pick<Grafico, 'nome' | 'descricao'>;
  png: Buffer;
}

function imagem(pagina: Pagina, { grafico, png }: ImagemDocx): Paragraph {
  const largura = Math.min(IMG_LARGURA_MAX, Math.floor(pagina.larguraUtil / TWIPS_POR_PX));
  const altura = Math.round((largura * ALTURA) / LARGURA);
  const descricao = grafico.descricao;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [
      new ImageRun({
        type: 'png',
        data: png,
        transformation: { width: largura, height: altura },
        altText: { title: descricao, description: descricao, name: descricao },
      }),
    ],
  });
}

function tabelaQuestoes(pagina: Pagina, questoes: readonly ResumoQuestao[]): Table {
  return tabela(
    pagina,
    ['Nº', 'Enunciado', ...LETRAS, 'Média'],
    questoes.map((q) => {
      const pct = percentuais(q.estatistica.distribuicao);
      return [
        c(q.codQuestao, { alinhamento: AlignmentType.CENTER }),
        c(q.texto || '—'),
        ...LETRAS.map((l) =>
          c(`${q.estatistica.distribuicao[l]} (${Math.round(pct[l])}%)`, {
            alinhamento: AlignmentType.CENTER,
          }),
        ),
        celulaMedia(q.estatistica.media),
      ];
    }),
    [5, 35, 10, 10, 10, 10, 10, 10],
  );
}

function blocoAvisos(avisos: readonly string[]): Conteudo[] {
  if (avisos.length === 0) return [];
  return [
    secao('Avisos'),
    ...avisos.map(
      (a) =>
        new Paragraph({
          alignment: AlignmentType.LEFT,
          indent: { left: 360, hanging: 360 },
          children: [new TextRun({ text: `•\t${a}`, color: hex(CORES.laranja), bold: true })],
        }),
    ),
  ];
}

/**
 * Espaço no final do documento para transcrição manual das respostas de perguntas abertas (D25):
 * quadro com bordas e linhas em branco, em página própria.
 */
export function blocoPerguntasAbertas(pagina: Pagina, linhas = LINHAS_PERGUNTAS_ABERTAS): Conteudo[] {
  const borda = { style: BorderStyle.SINGLE, size: 8, color: hex(CORES.azulEscuro) };
  return [
    secao(TITULO_PERGUNTAS_ABERTAS, { novaPagina: true }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: 'Espaço reservado para registrar manualmente as respostas às perguntas abertas.',
          italics: true,
          size: 20,
        }),
      ],
    }),
    new Table({
      width: { size: pagina.larguraUtil, type: WidthType.DXA },
      columnWidths: [pagina.larguraUtil],
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: pagina.larguraUtil, type: WidthType.DXA },
              borders: { top: borda, bottom: borda, left: borda, right: borda },
              children: Array.from(
                { length: Math.max(1, linhas) },
                () => new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 360 }, children: [] }),
              ),
            }),
          ],
        }),
      ],
    }),
  ];
}

function blocoGraficos(pagina: Pagina, imagens: readonly ImagemDocx[], tituloSecao: string): Conteudo[] {
  if (imagens.length === 0) return [];
  return [secao(tituloSecao), ...imagens.map((i) => imagem(pagina, i))];
}

function conteudoProva(
  r: RelatorioProva,
  imagens: readonly ImagemDocx[],
  geradoEm: Date,
  pagina: Pagina,
): Conteudo[] {
  const conteudo: Conteudo[] = [
    titulo(r.nome),
    info('Unidade', r.unidade),
    info('Prova', r.nome),
    info('Respondida por', rotuloRespondentes(r)),
    info('Data de geração', formatDataHora(geradoEm)),
    secao('Resumo'),
    tabelaResumo(pagina, [
      ['Respondentes', c(r.resumo.respondentes)],
      ['Respostas válidas', c(r.resumo.respostas)],
      ['Respostas inválidas', c(r.respostasInvalidas)],
      ['Média da unidade', celulaMedia(r.resumo.media)],
    ]),
    ...imagens.map((i) => imagem(pagina, i)),
  ];
  if (r.fonte === 'EDU.BI.009' && r.porObjeto.length > 1) {
    conteudo.push(
      secao('Média por objeto avaliado'),
      tabela(
        pagina,
        ['Objeto avaliado', 'Respondentes', 'Respostas', 'Média'],
        r.porObjeto.map((o) => [
          c(o.objeto),
          c(o.estatistica.respondentes, { alinhamento: AlignmentType.CENTER }),
          c(o.estatistica.respostas, { alinhamento: AlignmentType.CENTER }),
          celulaMedia(o.estatistica.media),
        ]),
        [46, 18, 18, 18],
      ),
    );
  }
  conteudo.push(secao('Resultado por questão'), tabelaQuestoes(pagina, r.questoes), ...blocoAvisos(r.avisos));
  return conteudo;
}

function conteudoProfessor(
  r: RelatorioProfessor,
  imagens: readonly ImagemDocx[],
  geradoEm: Date,
  pagina: Pagina,
): Conteudo[] {
  const media = imagens.filter((i) => !i.grafico.nome.startsWith('questao_'));
  const questoes = imagens.filter((i) => i.grafico.nome.startsWith('questao_'));
  return [
    titulo(r.professor),
    info('Unidade', r.unidade),
    info('Modalidade', rotuloModalidade(r.modalidade)),
    info('Professor', r.professor),
    info('Data de geração', formatDataHora(geradoEm)),
    secao('Resumo'),
    tabelaResumo(pagina, [
      ['Média geral do professor', celulaMedia(r.resumo.media)],
      ['Respondentes', c(r.resumo.respondentes)],
      ['Respostas válidas', c(r.resumo.respostas)],
      ['Média da unidade (referência)', celulaMedia(r.mediaUnidade)],
    ]),
    ...media.map((i) => imagem(pagina, i)),
    secao('Por disciplina e turma'),
    tabela(
      pagina,
      ['Disciplina', 'Turma', 'Média', 'Respondentes', 'Adesão'],
      r.porTurmaDisciplina.map((t) => {
        const adesao = t.adesao
          ? c(
              `${formatPercentual(t.adesao.porcentagem)} (${t.adesao.quantAlunos}/${t.adesao.quantidadeAlunosTurma})`,
              {
                alinhamento: AlignmentType.CENTER,
                ...(t.adesao.baixa ? { fundo: CORES.laranja, cor: CORES.branco, negrito: true } : {}),
              },
            )
          : c('—', { alinhamento: AlignmentType.CENTER });
        return [
          c(t.disciplina),
          c(`${t.turma} (${t.codTurma})`),
          celulaMedia(t.estatistica.media),
          c(t.estatistica.respondentes, { alinhamento: AlignmentType.CENTER }),
          adesao,
        ];
      }),
      [26, 24, 14, 16, 20],
    ),
    ...blocoGraficos(pagina, questoes, 'Respostas por questão'),
    secao('Resultado por questão'),
    ...(r.questoes.length > 0
      ? [tabelaQuestoes(pagina, r.questoes)]
      : [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: 'Sem respostas registradas.', italics: true })],
          }),
        ]),
    ...blocoAvisos(r.avisos),
  ];
}

/** Monta o corpo do relatório (inserido no marcador `{{conteudo}}` do template). */
export function montarConteudo(
  r: Relatorio,
  imagens: readonly ImagemDocx[],
  geradoEm: Date,
  pagina: Pagina,
): Conteudo[] {
  const corpo =
    r.tipo === 'professor'
      ? conteudoProfessor(r, imagens, geradoEm, pagina)
      : conteudoProva(r, imagens, geradoEm, pagina);
  return [...corpo, ...blocoPerguntasAbertas(pagina)];
}

export interface OpcoesDocx {
  /** Caminho do template .docx (env `DOCX_TEMPLATE`). */
  template: string;
  graficos?: ConfigGraficos;
}

/** Gera o .docx do relatório a partir do template (D24). Retorna o conteúdo do arquivo. */
export async function montarDocx(
  r: Relatorio,
  imagens: readonly ImagemDocx[],
  geradoEm: Date,
  template: string,
): Promise<Buffer> {
  const { dados, larguraUtil } = await carregarTemplate(template);
  const resultado = await patchDocument({
    outputType: 'nodebuffer',
    data: dados,
    keepOriginalStyles: false,
    patches: {
      [MARCADOR_CONTEUDO]: {
        type: PatchType.DOCUMENT,
        children: montarConteudo(r, imagens, geradoEm, { larguraUtil }),
      },
    },
    properties: {
      title: r.tipo === 'professor' ? r.professor : r.nome,
      creator: 'Relatórios de Avaliação',
    },
  });
  return Buffer.from(resultado);
}

/** Gera `<pasta>/<arquivoBase>.docx`. Exige as imagens PNG geradas por `render:charts`. */
export async function gerarDocx(
  r: Relatorio,
  pastaRelatorio: string,
  geradoEm: Date,
  opcoes: OpcoesDocx,
): Promise<string> {
  const imagens: ImagemDocx[] = [];
  for (const grafico of graficosDoRelatorio(r, opcoes.graficos ?? GRAFICOS_PADRAO)) {
    const png = caminhoImagemPng(pastaRelatorio, grafico.nome);
    try {
      await access(png);
    } catch {
      throw new AppError(
        `Imagem não encontrada: ${png}. Execute \`npm run render:charts\` antes.`,
        'IMAGEM_AUSENTE',
      );
    }
    imagens.push({ grafico, png: await readFile(png) });
  }
  const conteudo = await montarDocx(r, imagens, geradoEm, opcoes.template);
  await mkdir(pastaRelatorio, { recursive: true });
  const arquivo = path.join(pastaRelatorio, `${r.arquivoBase}.docx`);
  await writeFile(arquivo, conteudo);
  return arquivo;
}
