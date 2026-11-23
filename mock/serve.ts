import path from 'node:path';
import { carregarDadosMock, iniciarServidorMock } from './server.js';

const pasta = path.resolve(process.env.MOCK_DATA_DIR ?? 'mock/data');
const porta = Number(process.env.MOCK_PORT ?? 3001);
const usuario = process.env.TOTVS_USER ?? 'mock';
const senha = process.env.TOTVS_PASSWORD ?? 'mock123';

const dados = await carregarDadosMock(pasta);
const { url, fechar } = await iniciarServidorMock({ dados, usuario, senha }, porta);
console.log(`Mock do TOTVS ouvindo em ${url} (dados: ${pasta}). Ctrl+C para encerrar.`);
for (const s of ['SIGINT', 'SIGTERM'] as const)
  process.on(s, () => void fechar().then(() => process.exit(0)));
