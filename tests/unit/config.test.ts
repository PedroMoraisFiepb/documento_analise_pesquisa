import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, parseConfig } from '../../src/config/env.js';

describe('config', () => {
  it('aplica valores padrão', () => {
    const c = parseConfig({});
    expect(c).toMatchObject({
      TOTVS_BASE_URL: 'https://gestaoescolar.fiepb.org.br',
      TOTVS_COLIGADA: '2',
      TOTVS_SISTEMA: 'S',
      HTTP_TIMEOUT_MS: 600000,
      HTTP_RETRIES: 3,
      RENDER_CONCURRENCY: 4,
      OUTPUT_DIR: './output',
      LOG_LEVEL: 'info',
    });
    expect(c.TOTVS_USER).toBeUndefined();
    expect(c.ANO_LETIVO).toBeUndefined();
  });

  it('converte números e trata texto vazio como ausente', () => {
    const c = parseConfig({ HTTP_RETRIES: '0', RENDER_CONCURRENCY: '8', ANO_LETIVO: ' ', TOTVS_USER: ' u ' });
    expect(c.HTTP_RETRIES).toBe(0);
    expect(c.RENDER_CONCURRENCY).toBe(8);
    expect(c.ANO_LETIVO).toBeUndefined();
    expect(c.TOTVS_USER).toBe('u');
  });

  it('lê a lista de gráficos e o template do Word', () => {
    const padrao = parseConfig({});
    expect(padrao.GRAFICOS_PROFESSOR).toEqual(['questoes']);
    expect(padrao.GRAFICOS_PROVA).toEqual(['media']);
    expect(padrao.DOCX_TEMPLATE).toBe('./templates/relatorio.docx');
    const c = parseConfig({ GRAFICOS_PROFESSOR: ' Media , questoes,media', GRAFICOS_PROVA: '' });
    expect(c.GRAFICOS_PROFESSOR).toEqual(['media', 'questoes']);
    expect(c.GRAFICOS_PROVA).toEqual([]);
    expect(() => parseConfig({ GRAFICOS_PROVA: 'pizza' })).toThrow(/GRAFICOS_PROVA/);
  });

  it('rejeita valores inválidos com mensagem em português', () => {
    expect(() => parseConfig({ TOTVS_BASE_URL: 'não é url' })).toThrow(
      /Configuração inválida: TOTVS_BASE_URL/,
    );
    expect(() => parseConfig({ RENDER_CONCURRENCY: '0' })).toThrow(/RENDER_CONCURRENCY/);
  });

  it('carrega ENV_FILE sem sobrescrever variáveis existentes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cfg-'));
    try {
      const arquivo = path.join(dir, '.env.teste');
      await writeFile(arquivo, 'ANO_LETIVO=2026\nLOG_LEVEL=debug\n');
      const c = loadConfig({ ENV_FILE: arquivo, LOG_LEVEL: 'warn' });
      expect(c.ANO_LETIVO).toBe('2026');
      expect(c.LOG_LEVEL).toBe('warn');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('sem arquivo usa só o ambiente', () => {
    expect(loadConfig({ ENV_FILE: undefined, LOG_LEVEL: 'error' } as NodeJS.ProcessEnv).LOG_LEVEL).toBe(
      'error',
    );
  });

  it('falha se ENV_FILE não existir', () => {
    expect(() => loadConfig({ ENV_FILE: '/caminho/inexistente/.env' })).toThrow(/não encontrado/);
  });
});
