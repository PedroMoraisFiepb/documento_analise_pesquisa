import { readFile, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { lerModelo } from '../../src/commands/context.js';
import { executarTransform } from '../../src/commands/transform.js';
import type { Aviso } from '../../src/domain/model.js';
import { AGORA, type Ambiente, copiarFixture, criarAmbiente } from '../helpers/contexto.js';

let amb: Ambiente;
afterEach(() => amb?.limpar());

describe('npm run transform', () => {
  it.each(['minimal', 'edge'] as const)('gera model.json estável para a fixture %s', async (nome) => {
    amb = await criarAmbiente();
    await copiarFixture(amb.ctx, nome);
    await executarTransform(amb.ctx, AGORA);
    const modelo = JSON.parse(await readFile(amb.ctx.caminhos.modelo, 'utf8'));
    const avisos = JSON.parse(await readFile(amb.ctx.caminhos.avisos, 'utf8')) as Aviso[];
    expect(modelo.totais.avisos).toBe(avisos.length);
    expect(modelo).toMatchSnapshot();
    expect(avisos).toMatchSnapshot();
  });

  it('registra linhas rejeitadas pelo schema em warnings.json', async () => {
    amb = await criarAmbiente();
    await copiarFixture(amb.ctx, 'edge');
    const { avisos } = await executarTransform(amb.ctx, AGORA);
    expect(avisos.filter((a) => a.tipo === 'linha-rejeitada').map((a) => a.sentenca)).toEqual([
      'EDU.BI.005',
      'EDU.BI.009',
    ]);
  });

  it('orienta a executar fetch quando faltam dados brutos', async () => {
    amb = await criarAmbiente();
    await expect(executarTransform(amb.ctx, AGORA)).rejects.toThrow(/npm run fetch/);
  });

  it('rejeita arquivo bruto fora do formato', async () => {
    amb = await criarAmbiente();
    await copiarFixture(amb.ctx, 'minimal');
    await writeFile(amb.ctx.caminhos.sentenca('EDU.BI.004'), '[]');
    await expect(executarTransform(amb.ctx, AGORA)).rejects.toThrow(/fora do formato/);
  });

  it('rejeita JSON corrompido e model.json de outra versão', async () => {
    amb = await criarAmbiente();
    await copiarFixture(amb.ctx, 'minimal');
    await writeFile(amb.ctx.caminhos.sentenca('EDU.BI.005'), '{');
    await expect(executarTransform(amb.ctx, AGORA)).rejects.toThrow(/corrompido/);
    await copiarFixture(amb.ctx, 'minimal');
    await executarTransform(amb.ctx, AGORA);
    const m = JSON.parse(await readFile(amb.ctx.caminhos.modelo, 'utf8'));
    await writeFile(amb.ctx.caminhos.modelo, JSON.stringify({ ...m, versao: 99 }));
    await expect(lerModelo(amb.ctx)).rejects.toThrow(/versão 99/);
  });
});
