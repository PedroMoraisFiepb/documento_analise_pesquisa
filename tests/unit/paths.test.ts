import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AlocadorDeNomes, LIMITE_NOME, sanitizarNome } from '../../src/domain/paths.js';
import { pastaDoRelatorio, resolverCaminhos } from '../../src/infra/paths.js';

describe('sanitizarNome', () => {
  it('remove caracteres inválidos no Windows e de controle', () => {
    expect(sanitizarNome('Avaliação: Direção/Coordenação?')).toBe('Avaliação Direção Coordenação');
    expect(sanitizarNome('a<b>c"d|e*f\\g\u0001h')).toBe('a b c d e f g h');
  });

  it('remove pontos e espaços finais', () => {
    expect(sanitizarNome('Prova final...  ')).toBe('Prova final');
  });

  it('limita a 80 caracteres', () => {
    const s = sanitizarNome('x'.repeat(200));
    expect(s).toHaveLength(LIMITE_NOME);
  });

  it('nome vazio vira "sem nome"', () => {
    expect(sanitizarNome('???')).toBe('sem nome');
  });
});

describe('AlocadorDeNomes', () => {
  it('adiciona sufixo em colisões (inclusive por caixa)', () => {
    const a = new AlocadorDeNomes();
    expect(a.alocar('Prova')).toBe('Prova');
    expect(a.alocar('prova')).toBe('prova (2)');
    expect(a.alocar('Prova?')).toBe('Prova (3)');
  });

  it('respeita o limite com sufixo', () => {
    const a = new AlocadorDeNomes();
    const longo = 'y'.repeat(100);
    a.alocar(longo);
    const segundo = a.alocar(longo);
    expect(segundo.endsWith(' (2)')).toBe(true);
    expect(segundo.length).toBeLessThanOrEqual(LIMITE_NOME);
  });
});

describe('infra/paths', () => {
  it('resolve os caminhos dos artefatos', () => {
    const c = resolverCaminhos({ DATA_DIR: '/d', WORK_DIR: '/w', OUTPUT_DIR: '/o' });
    expect(c.sentenca('EDU.BI.004')).toBe(path.resolve('/d/raw/EDU.BI.004.json'));
    expect(c.modelo).toBe(path.resolve('/d/processed/model.json'));
    expect(c.avisos).toBe(path.resolve('/d/processed/warnings.json'));
    expect(c.manifest).toBe(path.resolve('/d/raw/manifest.json'));
    expect(pastaDoRelatorio('/w', 'relatorios_x', ['A', 'B'])).toBe(
      path.join('/w', 'relatorios_x', 'A', 'B'),
    );
  });
});
