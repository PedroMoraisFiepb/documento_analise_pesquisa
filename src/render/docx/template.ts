import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { AppError } from '../../shared/errors.js';

/** Marcador onde o conteúdo do relatório é inserido no template (D24). */
export const MARCADOR_CONTEUDO = 'conteudo';
const MARCADOR_TEXTO = `{{${MARCADOR_CONTEUDO}}}`;
const PARAGRAFO_MARCADOR = `<w:p><w:r><w:t>${MARCADOR_TEXTO}</w:t></w:r></w:p>`;

/** Largura útil padrão (A4 com margens de 1080 DXA), usada se o template não declarar página/margens. */
const LARGURA_UTIL_PADRAO = 9746;

export interface TemplateDocx {
  /** Template pronto para `patchDocument` (com o marcador `{{conteudo}}` no corpo). */
  dados: Buffer;
  /** Largura útil da página do template (twips/DXA). */
  larguraUtil: number;
}

function atributoNumerico(xml: string, elemento: string, atributo: string): number | null {
  const tag = new RegExp(`<w:${elemento}\\b[^>]*>`).exec(xml)?.[0];
  const valor = tag ? new RegExp(`w:${atributo}="(\\d+)"`).exec(tag)?.[1] : undefined;
  return valor === undefined ? null : Number(valor);
}

/** Largura útil = largura da página − margens esquerda/direita (da última seção do corpo). */
export function larguraUtilDoTemplate(documentXml: string): number {
  const ultimaSecao = documentXml.slice(documentXml.lastIndexOf('<w:sectPr'));
  const pagina = atributoNumerico(ultimaSecao, 'pgSz', 'w');
  const esquerda = atributoNumerico(ultimaSecao, 'pgMar', 'left');
  const direita = atributoNumerico(ultimaSecao, 'pgMar', 'right');
  if (pagina === null || esquerda === null || direita === null) return LARGURA_UTIL_PADRAO;
  return pagina - esquerda - direita;
}

/**
 * Prepara o template: se o corpo já tiver `{{conteudo}}`, usa como está (permite texto fixo antes/depois);
 * senão, substitui o conteúdo do corpo por um parágrafo com o marcador, preservando a seção (página, margens,
 * cabeçalhos e rodapés do template).
 */
export async function prepararTemplate(original: Buffer): Promise<TemplateDocx> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(original);
  } catch {
    throw new AppError('Template do Word inválido: o arquivo não é um .docx.', 'TEMPLATE');
  }
  const arquivo = zip.file('word/document.xml');
  if (!arquivo) throw new AppError('Template do Word inválido: word/document.xml ausente.', 'TEMPLATE');
  const xml = await arquivo.async('string');
  const larguraUtil = larguraUtilDoTemplate(xml);
  if (xml.includes(MARCADOR_TEXTO)) return { dados: original, larguraUtil };

  const inicioCorpo = /<w:body>/.exec(xml);
  const inicioSecao = xml.lastIndexOf('<w:sectPr');
  if (!inicioCorpo || inicioSecao < inicioCorpo.index) {
    throw new AppError('Template do Word inválido: corpo sem seção (w:sectPr).', 'TEMPLATE');
  }
  const fimTagCorpo = inicioCorpo.index + inicioCorpo[0].length;
  const novo = `${xml.slice(0, fimTagCorpo)}${PARAGRAFO_MARCADOR}${xml.slice(inicioSecao)}`;
  zip.file('word/document.xml', novo);
  const dados = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { dados, larguraUtil };
}

const cache = new Map<string, Promise<TemplateDocx>>();

/** Lê e prepara o template uma vez por processo (por caminho absoluto). */
export function carregarTemplate(caminho: string): Promise<TemplateDocx> {
  const absoluto = path.resolve(caminho);
  let pronto = cache.get(absoluto);
  if (!pronto) {
    pronto = readFile(absoluto)
      .catch(() => {
        throw new AppError(`Template do Word não encontrado: ${absoluto}. Ajuste DOCX_TEMPLATE.`, 'TEMPLATE');
      })
      .then(prepararTemplate);
    pronto.catch(() => cache.delete(absoluto));
    cache.set(absoluto, pronto);
  }
  return pronto;
}
