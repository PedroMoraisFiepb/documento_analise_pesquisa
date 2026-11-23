import type { EChartsOption } from './echarts.js';
import type { RelatorioProfessor, RelatorioProva, ResumoQuestao } from '../../domain/model.js';
import { LETRAS, type Letra } from '../../domain/normalize.js';
import { NOTA, percentuais } from '../../domain/scoring.js';
import { formatNumero } from '../../shared/format.js';
import { CORES, corDaMedia } from '../../shared/theme.js';
import { quebrarLinhas, rotuloQuestao, rotuloTurmaDisciplina, truncar } from '../labels.js';

export const FONTE = 'DejaVu Sans, Arial, Helvetica, sans-serif';
export const ESCALA_MAX = 5;

function base(titulo: string, subtitulo: string): EChartsOption {
  return {
    animation: false,
    backgroundColor: CORES.branco,
    textStyle: { fontFamily: FONTE, color: CORES.cinzaTexto },
    title: {
      text: truncar(titulo, 70),
      subtext: subtitulo,
      left: 'center',
      top: 12,
      textStyle: { color: CORES.azulEscuro, fontSize: 20, fontWeight: 'bold', fontFamily: FONTE },
      subtextStyle: { color: CORES.cinzaTexto, fontSize: 13, fontFamily: FONTE },
    },
    grid: { left: 24, right: 72, top: 110, bottom: 24, containLabel: true },
    xAxis: {
      type: 'value',
      min: 0,
      max: ESCALA_MAX,
      interval: 1,
      axisLabel: { color: CORES.cinzaTexto, fontFamily: FONTE },
      splitLine: { lineStyle: { color: '#E5E5E5' } },
    },
  };
}

function linhaReferencia(valor: number | null, rotulo: string) {
  if (valor === null) return undefined;
  return {
    symbol: 'none',
    silent: true,
    lineStyle: { color: CORES.verdeAgua, width: 3, type: 'dashed' as const },
    label: {
      formatter: `${rotulo}: ${formatNumero(valor)}`,
      color: CORES.azulEscuro,
      fontFamily: FONTE,
      fontWeight: 'bold' as const,
      position: 'start' as const,
      distance: 6,
    },
    data: [{ xAxis: valor }],
  };
}

function rotuloBarra() {
  return {
    show: true,
    position: 'right' as const,
    backgroundColor: CORES.branco,
    padding: [2, 4],
    fontFamily: FONTE,
    color: CORES.azulEscuro,
    fontWeight: 'bold' as const,
    formatter: (p: { value: unknown }) => (typeof p.value === 'number' ? formatNumero(p.value) : '—'),
  };
}

/** Gráfico do relatório de prova: média por questão + linha da média geral da unidade (§7.1). */
export function opcaoGraficoProva(r: RelatorioProva): EChartsOption {
  const media = r.resumo.media;
  return {
    ...base(
      r.nome,
      `${r.unidade} · Média da unidade: ${formatNumero(media)} · ${r.resumo.respondentes} respondente(s)`,
    ),
    yAxis: {
      type: 'category',
      inverse: true,
      data: r.questoes.map((q) => rotuloQuestao(q.codQuestao, q.texto, 55)),
      axisLabel: { color: CORES.cinzaTexto, fontFamily: FONTE, fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 36,
        data: r.questoes.map((q) => ({
          value: q.estatistica.media ?? 0,
          itemStyle: { color: corDaMedia(q.estatistica.media) },
        })),
        label: rotuloBarra(),
        ...(media !== null ? { markLine: linhaReferencia(media, 'Média da unidade') } : {}),
      },
    ],
  };
}

/**
 * Gráfico do relatório do professor (§7.2): média por disciplina/turma, barra da média geral do professor
 * (azul-escuro) e linha de referência com a média da unidade (verde-água).
 */
export function opcaoGraficoProfessor(r: RelatorioProfessor): EChartsOption {
  const comRespostas = r.porTurmaDisciplina.filter((t) => t.estatistica.respostas > 0);
  const categorias = r.semRespostas
    ? []
    : [...comRespostas.map((t) => truncar(rotuloTurmaDisciplina(t), 50)), 'Média geral do professor'];
  const dados = r.semRespostas
    ? []
    : [
        ...comRespostas.map((t) => ({
          value: t.estatistica.media ?? 0,
          itemStyle: { color: corDaMedia(t.estatistica.media) },
        })),
        { value: r.resumo.media ?? 0, itemStyle: { color: CORES.azulEscuro } },
      ];
  const opcao: EChartsOption = {
    ...base(
      r.professor,
      `${r.unidade} · Média do professor: ${formatNumero(r.resumo.media)} · Média da unidade: ${formatNumero(r.mediaUnidade)}`,
    ),
    yAxis: {
      type: 'category',
      inverse: true,
      data: categorias,
      axisLabel: { color: CORES.cinzaTexto, fontFamily: FONTE, fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 36,
        data: dados,
        label: rotuloBarra(),
        ...(r.mediaUnidade !== null ? { markLine: linhaReferencia(r.mediaUnidade, 'Média da unidade') } : {}),
      },
    ],
  };
  if (r.semRespostas) {
    opcao.graphic = [
      {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: { text: 'Sem respostas registradas', fill: CORES.laranja, fontSize: 28, fontFamily: FONTE },
      },
    ];
  }
  return opcao;
}

/** Cor de cada alternativa no gráfico de respostas (A = melhor nota … E = pior). */
export const COR_ALTERNATIVA: Readonly<Record<Letra, string>> = {
  A: CORES.verde,
  B: CORES.verdeAgua,
  C: CORES.azul,
  D: CORES.azulEscuro,
  E: CORES.laranja,
};

/** Máximo de caracteres por linha e de linhas do enunciado no título do gráfico da questão. */
const TITULO_QUESTAO_COLUNAS = 75;
const TITULO_QUESTAO_LINHAS = 3;

/**
 * Gráfico de respostas de uma questão (relatório do professor, §7.2): colunas A–E com a quantidade de respostas,
 * rótulo "quantidade (percentual)" e cor por alternativa. O enunciado vai no título, quebrado em até 3 linhas.
 */
export function opcaoGraficoQuestao(q: ResumoQuestao, contexto: string): EChartsOption {
  const { distribuicao, media, respostas } = q.estatistica;
  const pct = percentuais(distribuicao);
  const linhas = quebrarLinhas(
    q.texto ? `Q${q.codQuestao} – ${q.texto}` : `Questão ${q.codQuestao}`,
    TITULO_QUESTAO_COLUNAS,
    TITULO_QUESTAO_LINHAS,
  );
  const alturaTitulo = 12 + linhas.length * 22;
  return {
    animation: false,
    backgroundColor: CORES.branco,
    textStyle: { fontFamily: FONTE, color: CORES.cinzaTexto },
    title: {
      text: linhas.join('\n'),
      subtext: `${contexto} · Média da questão: ${formatNumero(media)} · ${respostas} resposta(s)`,
      left: 'center',
      top: 12,
      itemGap: 8,
      textStyle: {
        color: CORES.azulEscuro,
        fontSize: 16,
        lineHeight: 22,
        fontWeight: 'bold',
        fontFamily: FONTE,
      },
      subtextStyle: { color: CORES.cinzaTexto, fontSize: 13, fontFamily: FONTE },
    },
    grid: { left: 24, right: 24, top: alturaTitulo + 60, bottom: 16, containLabel: true },
    xAxis: {
      type: 'category',
      data: LETRAS.map((l) => `${l} (nota ${NOTA[l]})`),
      axisLabel: { color: CORES.cinzaTexto, fontFamily: FONTE, fontSize: 13 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      name: 'Respostas',
      nameTextStyle: { color: CORES.cinzaTexto, fontFamily: FONTE },
      axisLabel: { color: CORES.cinzaTexto, fontFamily: FONTE },
      splitLine: { lineStyle: { color: '#E5E5E5' } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 72,
        data: LETRAS.map((l) => ({ value: distribuicao[l], itemStyle: { color: COR_ALTERNATIVA[l] } })),
        label: {
          show: true,
          position: 'top',
          fontFamily: FONTE,
          color: CORES.azulEscuro,
          fontWeight: 'bold',
          formatter: (p: { dataIndex: number; value: unknown }) => {
            const letra = LETRAS[p.dataIndex] as Letra;
            return `${String(p.value)} (${Math.round(pct[letra])}%)`;
          },
        },
      },
    ],
  };
}
