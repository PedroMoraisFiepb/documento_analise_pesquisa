import { describe, expect, it } from 'vitest';
import { mapLimit } from '../../src/shared/concurrency.js';
import { AppError } from '../../src/shared/errors.js';
import {
  formatBytes,
  formatCarimbo,
  formatDataHora,
  formatNumero,
  formatPercentual,
} from '../../src/shared/format.js';
import { createLogger, createSilentLogger } from '../../src/shared/logger.js';
import { CORES, corDaMedia, hex } from '../../src/shared/theme.js';

describe('formatação pt-BR', () => {
  it('usa vírgula decimal e 2 casas', () => {
    expect(formatNumero(4.256)).toBe('4,26');
    expect(formatNumero(3)).toBe('3,00');
    expect(formatNumero(1234.5)).toBe('1.234,50');
    expect(formatNumero(null)).toBe('—');
    expect(formatNumero(Number.NaN)).toBe('—');
  });

  it('formata percentuais', () => {
    expect(formatPercentual(45)).toBe('45,0%');
    expect(formatPercentual(undefined)).toBe('—');
  });

  it('formata datas e carimbo em hora local', () => {
    const d = new Date(2026, 0, 5, 9, 7);
    expect(formatDataHora(d)).toBe('05/01/2026 09:07');
    expect(formatCarimbo(d)).toBe('2026-01-05_0907');
  });

  it('formata bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB');
  });
});

describe('tema', () => {
  it('aplica as faixas de cor de §4.3', () => {
    expect(corDaMedia(4)).toBe(CORES.verde);
    expect(corDaMedia(3.99)).toBe(CORES.azul);
    expect(corDaMedia(3)).toBe(CORES.azul);
    expect(corDaMedia(2.99)).toBe(CORES.laranja);
    expect(corDaMedia(null)).toBe(CORES.azulEscuro);
    expect(hex('#164194')).toBe('164194');
  });
});

describe('mapLimit', () => {
  it('respeita o limite e preserva a ordem', async () => {
    let ativos = 0;
    let pico = 0;
    const r = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      ativos++;
      pico = Math.max(pico, ativos);
      await new Promise((res) => setTimeout(res, 5));
      ativos--;
      return n * 2;
    });
    expect(r).toEqual([2, 4, 6, 8, 10, 12]);
    expect(pico).toBe(2);
  });

  it('lida com lista vazia', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});

describe('logger e erros', () => {
  it('cria loggers', () => {
    expect(createLogger('warn').level).toBe('warn');
    expect(createSilentLogger().level).toBe('silent');
  });

  it('AppError guarda código', () => {
    const e = new AppError('msg', 'X');
    expect(e.codigo).toBe('X');
    expect(new AppError('m').codigo).toBe('ERRO');
  });
});
