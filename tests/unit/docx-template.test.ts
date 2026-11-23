import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { larguraUtilDoTemplate, prepararTemplate } from '../../src/render/docx/template.js';

const TEMPLATE = 'templates/relatorio.docx';

async function documentXml(buf: Buffer): Promise<string> {
  return (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
}

describe('template do Word', () => {
  it('insere o marcador {{conteudo}} no corpo e preserva a seção do template', async () => {
    const original = await readFile(TEMPLATE);
    const { dados, larguraUtil } = await prepararTemplate(original);
    const xml = await documentXml(dados);
    expect(xml).toContain('{{conteudo}}');
    expect(xml).toContain('<w:headerReference w:type="default"');
    expect(xml).toContain('w:bottom="1985"');
    expect(larguraUtil).toBe(11906 - 1080 - 1080);
  });

  it('usa o template como está se ele já tiver o marcador', async () => {
    const zip = await JSZip.loadAsync(await readFile(TEMPLATE));
    const xml = await zip.file('word/document.xml')!.async('string');
    zip.file(
      'word/document.xml',
      xml.replace(
        '<w:body>',
        '<w:body><w:p><w:r><w:t>Texto fixo</w:t></w:r></w:p><w:p><w:r><w:t>{{conteudo}}</w:t></w:r></w:p>',
      ),
    );
    const comMarcador = await zip.generateAsync({ type: 'nodebuffer' });
    const { dados } = await prepararTemplate(comMarcador);
    expect(dados).toBe(comMarcador);
  });

  it('rejeita arquivo que não é docx ou sem seção', async () => {
    await expect(prepararTemplate(Buffer.from('não é zip'))).rejects.toThrow(/não é um .docx/);
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><w:body><w:p/></w:body></w:document>');
    await expect(prepararTemplate(await zip.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow(
      /sem seção/,
    );
    const vazio = new JSZip();
    vazio.file('x.txt', 'x');
    await expect(prepararTemplate(await vazio.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow(
      /document.xml ausente/,
    );
  });

  it('largura útil cai no padrão A4 se a página não declarar dimensões', () => {
    expect(larguraUtilDoTemplate('<w:body><w:sectPr/></w:body>')).toBe(9746);
    expect(
      larguraUtilDoTemplate(
        '<w:sectPr><w:pgSz w:w="12240"/><w:pgMar w:left="1440" w:right="1440"/></w:sectPr>',
      ),
    ).toBe(9360);
  });
});
