import { readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executarClean } from '../../src/commands/clean.js';
import { executarPackage } from '../../src/commands/package.js';
import { executarRenderCharts, executarRenderDocx, executarRenderXlsx } from '../../src/commands/render.js';
import { executarTransform } from '../../src/commands/transform.js';
import type { Modelo } from '../../src/domain/model.js';
import { CORES, hex } from '../../src/shared/theme.js';
import { AGORA, type Ambiente, copiarFixture, criarAmbiente } from '../helpers/contexto.js';

const REGULAR = 'Alunos do Regular';
const EJA = 'Alunos da EJA';
const PROF = 'Provas respondidas por professores';

let amb: Ambiente;
let modelo: Modelo;
let raiz: string;

beforeAll(async () => {
  amb = await criarAmbiente();
  await copiarFixture(amb.ctx, 'minimal');
  ({ modelo } = await executarTransform(amb.ctx, AGORA));
  raiz = path.join(amb.ctx.caminhos.work, modelo.pastaRaiz);
});
afterAll(() => amb.limpar());

const pastaJoao = () => path.join(raiz, 'Campina Grande', REGULAR, 'Provas de Professores', 'João da Silva');
const pastaDirecao = () => path.join(raiz, 'Campina Grande', PROF, 'Avaliação da Direção 2026');

describe('render:docx sem imagens', () => {
  it('falha claramente se render:charts não foi executado', async () => {
    await expect(executarRenderDocx(amb.ctx)).rejects.toThrow(/npm run render:charts/);
  });
});

describe('npm run render:charts', () => {
  it('gera PNG e JPG 1600×900 para cada relatório', async () => {
    const total = await executarRenderCharts(amb.ctx);
    expect(total).toBe(modelo.totais.relatorios);
    // Professor: um gráfico de respostas por questão (padrão GRAFICOS_PROFESSOR=questoes).
    const png = path.join(pastaJoao(), 'imagens', 'questao_01.png');
    const jpg = path.join(pastaJoao(), 'imagens', 'questao_01.jpg');
    const imagensJoao = (await readdir(path.join(pastaJoao(), 'imagens'))).sort();
    const joao = modelo.unidades
      .flatMap((u) => u.grupos.flatMap((g) => g.relatorios))
      .find((r) => r.tipo === 'professor' && r.professor === 'João da Silva')!;
    expect(imagensJoao).toHaveLength(joao.questoes.length * 2);
    expect(imagensJoao.every((n) => n.startsWith('questao_'))).toBe(true);
    const pngBuf = await readFile(png);
    const jpgBuf = await readFile(jpg);
    expect(pngBuf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(jpgBuf.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(await sharp(pngBuf).metadata()).toMatchObject({ width: 1600, height: 900, format: 'png' });
    expect(await sharp(jpgBuf).metadata()).toMatchObject({ width: 1600, height: 900, format: 'jpeg' });
    await stat(path.join(pastaDirecao(), 'imagens', 'media_unidade.png'));
  });

  it('--only restringe a uma unidade e valida o nome', async () => {
    expect(await executarRenderCharts(amb.ctx, { apenasUnidade: 'joao pessoa' })).toBe(
      modelo.unidades.find((u) => u.nome === 'João Pessoa')!.grupos.flatMap((g) => g.relatorios).length,
    );
    await expect(executarRenderCharts(amb.ctx, { apenasUnidade: 'Inexistente' })).rejects.toThrow(
      /não encontrada/,
    );
  });
});

describe('npm run render:xlsx', () => {
  it('gera planilha do professor com as abas e valores corretos', async () => {
    await executarRenderXlsx(amb.ctx);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(pastaJoao(), 'João da Silva.xlsx'));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Resumo',
      'Por disciplina e turma',
      'Por questão',
      'Adesão',
      'Respostas',
    ]);
    const resumo = wb.getWorksheet('Resumo')!;
    const valores = Object.fromEntries(
      resumo.getRows(2, resumo.rowCount - 1)!.map((r) => [r.getCell(1).value, r.getCell(2).value]),
    );
    expect(valores['Média geral do professor']).toBe(4.25);
    expect(valores.Modalidade).toBe('Regular');
    const turmas = wb.getWorksheet('Por disciplina e turma')!;
    expect(turmas.getRow(1).getCell(1).value).toBe('Disciplina');
    expect((turmas.getRow(1).getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe(
      `FF${hex(CORES.azulEscuro)}`,
    );
    expect(turmas.getRow(2).getCell(1).value).toBe('Física');
    expect(turmas.getRow(2).getCell(4).value).toBe(3);
    expect((turmas.getRow(2).getCell(4).fill as ExcelJS.FillPattern).fgColor?.argb).toBe(
      `FF${hex(CORES.azul)}`,
    );
    expect(turmas.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(wb.getWorksheet('Respostas')!.rowCount).toBe(1 + 4);
  });

  it('destaca adesão < 50% em laranja', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(
      path.join(raiz, 'Campina Grande', EJA, 'Provas de Professores', 'Carlos Souza', 'Carlos Souza.xlsx'),
    );
    const cel = wb.getWorksheet('Adesão')!.getRow(2).getCell(7);
    expect(cel.value).toBe(45);
    expect((cel.fill as ExcelJS.FillPattern).fgColor?.argb).toBe(`FF${hex(CORES.laranja)}`);
  });

  it('gera planilha de prova com Resumo, Por questão e Respostas', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(pastaDirecao(), 'Avaliação da Direção 2026.xlsx'));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Por questão', 'Respostas']);
    const q = wb.getWorksheet('Por questão')!;
    expect(q.getRow(2).getCell(1).value).toBe(1);
    expect(q.getRow(2).getCell(14).value).toBe(4); // (A=5 + C=3) / 2
  });
});

describe('npm run render:docx', () => {
  it('gera docx com textos-chave e imagem embutida', async () => {
    await executarRenderDocx(amb.ctx);
    const zip = await JSZip.loadAsync(await readFile(path.join(pastaJoao(), 'João da Silva.docx')));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('João da Silva');
    expect(xml).toContain('Campina Grande');
    expect(xml).toContain('4,25');
    expect(xml).toContain('Média da unidade (referência)');
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/') && f.endsWith('.png'))).toBe(true);
    expect(xml).toContain('Respostas por questão');
    expect(xml).toContain('Respostas de perguntas abertas');
    expect(xml).not.toContain('EDU.BI');
    expect(xml).not.toContain('{{conteudo}}');
  });

  it('usa o template: cabeçalho/rodapé, timbre e margens do template.docx', async () => {
    const zip = await JSZip.loadAsync(await readFile(path.join(pastaJoao(), 'João da Silva.docx')));
    const tpl = await JSZip.loadAsync(await readFile('templates/relatorio.docx'));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('w:left="1080"');
    expect(xml).toContain('w:bottom="1985"');
    // Timbre (imagem de página inteira no cabeçalho) preservado byte a byte.
    expect(await zip.file('word/header2.xml')!.async('string')).toContain('r:embed="rId1"');
    expect(Buffer.from(await zip.file('word/media/image1.png')!.async('uint8array'))).toEqual(
      Buffer.from(await tpl.file('word/media/image1.png')!.async('uint8array')),
    );
    expect(await zip.file('word/styles.xml')!.async('string')).toBe(
      await tpl.file('word/styles.xml')!.async('string'),
    );
    // Gráficos por questão + timbre do template.
    const midias = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
    expect(midias.length).toBeGreaterThan(1);
    expect(xml.indexOf('Respostas de perguntas abertas')).toBeGreaterThan(
      xml.indexOf('Resultado por questão'),
    );
  });

  it('inclui avisos de adesão baixa e média por objeto no 004', async () => {
    const carlos = await JSZip.loadAsync(
      await readFile(
        path.join(raiz, 'Campina Grande', EJA, 'Provas de Professores', 'Carlos Souza', 'Carlos Souza.docx'),
      ),
    );
    expect(await carlos.file('word/document.xml')!.async('string')).toContain('Adesão baixa em História');
    const dir = await JSZip.loadAsync(
      await readFile(path.join(pastaDirecao(), 'Avaliação da Direção 2026.docx')),
    );
    const xml = await dir.file('word/document.xml')!.async('string');
    expect(xml).toContain('Professores');
    expect(xml).not.toContain('EDU.BI');
    expect(xml).toContain('Resultado por questão');
    expect(xml).toContain('Respostas de perguntas abertas');
  });
});

describe('npm run package', () => {
  it('gera o zip com a árvore esperada', async () => {
    const { arquivo, bytes } = await executarPackage(amb.ctx);
    expect(path.basename(arquivo)).toBe(`${modelo.pastaRaiz}.zip`);
    expect(bytes).toBeGreaterThan(0);
    const zip = await JSZip.loadAsync(await readFile(arquivo));
    const nomes = Object.keys(zip.files);
    const r = modelo.pastaRaiz;
    for (const esperado of [
      `${r}/Campina Grande/${PROF}/Avaliação da Direção 2026/Avaliação da Direção 2026.docx`,
      `${r}/Campina Grande/${PROF}/Avaliação da Direção 2026/Avaliação da Direção 2026.xlsx`,
      `${r}/Campina Grande/${PROF}/Avaliação da Direção 2026/imagens/media_unidade.png`,
      `${r}/Campina Grande/${PROF}/Avaliação da Direção 2026/imagens/media_unidade.jpg`,
      `${r}/Campina Grande/${REGULAR}/Provas de Professores/João da Silva/João da Silva.docx`,
      `${r}/Campina Grande/${REGULAR}/Provas de Professores/João da Silva/imagens/questao_01.jpg`,
      `${r}/Campina Grande/${REGULAR}/Pesquisa de Satisfação 2026/Pesquisa de Satisfação 2026.xlsx`,
      `${r}/Campina Grande/${EJA}/Provas de Professores/Carlos Souza/Carlos Souza.xlsx`,
    ]) {
      expect(nomes).toContain(esperado);
    }
    expect(nomes.some((n) => n.includes('Patos/Alunos da EJA/Provas de Professores/Carlos Souza'))).toBe(
      true,
    );
    expect(nomes.some((n) => n.includes('São José de Piranhas/Alunos da EJA'))).toBe(false);
    expect(nomes.some((n) => n.includes('EDU.BI'))).toBe(false);
  });

  it('npm run clean remove data/ e work/', async () => {
    await executarClean(amb.ctx);
    const conteudo = await readdir(amb.dir);
    expect(conteudo).toEqual(['output']);
  });

  it('falha se a pasta de trabalho não existir', async () => {
    await copiarFixture(amb.ctx, 'minimal');
    await executarTransform(amb.ctx, AGORA);
    await rm(amb.ctx.caminhos.work, { recursive: true, force: true });
    await expect(executarPackage(amb.ctx)).rejects.toThrow(/Pasta não encontrada/);
  });
});

describe('gráficos configuráveis (GRAFICOS_PROFESSOR / GRAFICOS_PROVA)', () => {
  it('gera e embute os gráficos escolhidos em cada tipo de relatório', async () => {
    const outro = await criarAmbiente({ GRAFICOS_PROFESSOR: 'media,questoes', GRAFICOS_PROVA: 'questoes' });
    try {
      await copiarFixture(outro.ctx, 'minimal');
      const { modelo: m } = await executarTransform(outro.ctx, AGORA);
      await executarRenderCharts(outro.ctx);
      await executarRenderDocx(outro.ctx);
      const base = path.join(outro.ctx.caminhos.work, m.pastaRaiz, 'Campina Grande');
      const joao = path.join(base, REGULAR, 'Provas de Professores', 'João da Silva', 'imagens');
      const direcao = path.join(base, PROF, 'Avaliação da Direção 2026', 'imagens');
      expect(await readdir(joao)).toContain('media_professor.png');
      expect(await readdir(joao)).toContain('questao_01.png');
      expect(await readdir(direcao)).not.toContain('media_unidade.png');
      expect(await readdir(direcao)).toContain('questao_01.png');
    } finally {
      await outro.limpar();
    }
  });

  it('falha com mensagem clara se o template não existir', async () => {
    const outro = await criarAmbiente({ DOCX_TEMPLATE: '/nao/existe/template.docx' });
    try {
      await copiarFixture(outro.ctx, 'minimal');
      await executarTransform(outro.ctx, AGORA);
      await executarRenderCharts(outro.ctx);
      await expect(executarRenderDocx(outro.ctx)).rejects.toThrow(/Template do Word não encontrado/);
    } finally {
      await outro.limpar();
    }
  });
});
