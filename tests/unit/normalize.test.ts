import { describe, expect, it } from 'vitest';
import {
  chave,
  chaveUnidade,
  limparTexto,
  normalizarResposta,
  normalizarUnidade,
} from '../../src/domain/normalize.js';

describe('normalize', () => {
  it('remove o prefixo "Unidade " e espaços extras', () => {
    expect(normalizarUnidade('Unidade Campina Grande')).toBe('Campina Grande');
    expect(normalizarUnidade('  unidade   João   Pessoa ')).toBe('João Pessoa');
    expect(normalizarUnidade('Patos')).toBe('Patos');
  });

  it('não remove "Unidade" quando não é prefixo', () => {
    expect(normalizarUnidade('Nova Unidade')).toBe('Nova Unidade');
  });

  it('gera chave sem acento e minúscula', () => {
    expect(chave('  São  José ')).toBe('sao jose');
    expect(chaveUnidade('Unidade João Pessoa')).toBe(chaveUnidade('joao pessoa'));
  });

  it('colapsa espaços', () => {
    expect(limparTexto('  a \t b\n c ')).toBe('a b c');
  });

  it.each([
    ['A', 'A'],
    [' b ', 'B'],
    ['e', 'E'],
  ])('aceita CODRESPOSTA %j → %s', (entrada, esperado) => {
    expect(normalizarResposta(entrada)).toBe(esperado);
  });

  it.each(['', '  ', 'X', 'AB', 'F', '1'])('rejeita CODRESPOSTA inválida %j', (entrada) => {
    expect(normalizarResposta(entrada)).toBeNull();
  });
});
