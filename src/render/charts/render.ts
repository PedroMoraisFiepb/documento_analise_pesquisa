import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Relatorio } from '../../domain/model.js';
import { type ConfigGraficos, GRAFICOS_PADRAO, type TipoGrafico } from '../../shared/graficos.js';
import { nomeImagem, nomeImagemQuestao } from '../labels.js';
import { type EChartsOption, initSsr } from './echarts.js';
import { opcaoGraficoProfessor, opcaoGraficoProva, opcaoGraficoQuestao } from './options.js';

/** Tamanho lógico do gráfico; a imagem final é renderizada em 2x (1600×900). */
export const LARGURA = 800;
export const ALTURA = 450;
export const ESCALA = 2;
export const QUALIDADE_JPG = 90;

export interface Grafico {
  tipo: TipoGrafico;
  /** Nome base dos arquivos em `imagens/` (sem extensão). */
  nome: string;
  /** Texto alternativo da imagem no docx. */
  descricao: string;
  opcao: EChartsOption;
}

/** Lista os gráficos de um relatório, na ordem em que aparecem no documento. */
export function graficosDoRelatorio(r: Relatorio, config: ConfigGraficos = GRAFICOS_PADRAO): Grafico[] {
  const tipos = r.tipo === 'professor' ? config.professor : config.prova;
  const titulo = r.tipo === 'professor' ? r.professor : r.nome;
  return tipos.flatMap((tipo): Grafico[] => {
    if (tipo === 'media') {
      return [
        {
          tipo,
          nome: nomeImagem(r),
          descricao:
            r.tipo === 'professor' ? `Média do professor – ${titulo}` : `Média por questão – ${titulo}`,
          opcao: opcaoDoRelatorio(r),
        },
      ];
    }
    return r.questoes.map((q) => ({
      tipo,
      nome: nomeImagemQuestao(q.codQuestao),
      descricao: `Respostas da questão ${q.codQuestao} – ${titulo}`,
      opcao: opcaoGraficoQuestao(q, `${titulo} · ${r.unidade}`),
    }));
  });
}

export function opcaoDoRelatorio(r: Relatorio): EChartsOption {
  return r.tipo === 'professor' ? opcaoGraficoProfessor(r) : opcaoGraficoProva(r);
}

/** Renderiza a opção ECharts em SVG (SSR, sem canvas). */
export function renderizarSvg(opcao: EChartsOption, largura = LARGURA, altura = ALTURA): string {
  const chart = initSsr(null, null, { renderer: 'svg', ssr: true, width: largura, height: altura });
  try {
    chart.setOption(opcao);
    return chart.renderToSVGString();
  } finally {
    chart.dispose();
  }
}

export interface ImagemGerada {
  nome: string;
  png: string;
  jpg: string;
  svg: string;
}

/** Converte cada gráfico do relatório em PNG e JPG (fundo branco, 2x) dentro de `<pasta>/imagens/`. */
export async function gerarImagens(
  r: Relatorio,
  pastaRelatorio: string,
  config: ConfigGraficos = GRAFICOS_PADRAO,
): Promise<ImagemGerada[]> {
  const pasta = path.join(pastaRelatorio, 'imagens');
  await mkdir(pasta, { recursive: true });
  const geradas: ImagemGerada[] = [];
  for (const g of graficosDoRelatorio(r, config)) {
    const svg = renderizarSvg(g.opcao);
    const png = path.join(pasta, `${g.nome}.png`);
    const jpg = path.join(pasta, `${g.nome}.jpg`);
    const base = () => sharp(Buffer.from(svg), { density: 72 * ESCALA }).flatten({ background: '#ffffff' });
    await Promise.all([
      base().png().toFile(png),
      base().jpeg({ quality: QUALIDADE_JPG, mozjpeg: true }).toFile(jpg),
    ]);
    geradas.push({ nome: g.nome, png, jpg, svg });
  }
  return geradas;
}

export function caminhoImagemPng(pastaRelatorio: string, nome: string): string {
  return path.join(pastaRelatorio, 'imagens', `${nome}.png`);
}
