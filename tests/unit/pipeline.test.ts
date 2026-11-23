import { describe, expect, it, vi } from 'vitest';
import { ETAPAS, executarPipeline, executorSubprocesso } from '../../src/commands/pipeline.js';
import { criarAmbiente } from '../helpers/contexto.js';

describe('pipeline', () => {
  it('executa as 6 etapas em ordem', async () => {
    const amb = await criarAmbiente();
    const executar = vi.fn(async (_etapa: string) => 0);
    await executarPipeline(amb.ctx, executar);
    expect(executar.mock.calls.map((c) => c[0])).toEqual([...ETAPAS]);
    expect(ETAPAS).toEqual(['fetch', 'transform', 'render:charts', 'render:xlsx', 'render:docx', 'package']);
    await amb.limpar();
  });

  it('para no primeiro erro', async () => {
    const amb = await criarAmbiente();
    const executar = vi.fn(async (e: string) => (e === 'transform' ? 3 : 0));
    await expect(executarPipeline(amb.ctx, executar)).rejects.toThrow('Etapa "transform" falhou (código 3)');
    expect(executar).toHaveBeenCalledTimes(2);
    await amb.limpar();
  });

  it('executor de subprocesso devolve o código de saída do processo filho', async () => {
    const script = new URL('../helpers/sai-com-codigo.mjs', import.meta.url).pathname;
    expect(await executorSubprocesso(script)('fetch')).toBe(0);
    expect(await executorSubprocesso(script)('package')).toBe(7);
  });
});
