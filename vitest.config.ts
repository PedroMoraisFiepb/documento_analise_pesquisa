import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    env: { TZ: 'America/Recife', NODE_ENV: 'test' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'mock/**/*.ts'],
      // Pontos de entrada de CLI só fazem "parse de argv + chamada"; são exercitados pelo e2e em subprocesso.
      exclude: ['src/cli.ts', 'mock/generate.ts', 'mock/serve.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
        'src/domain/**': { lines: 95, functions: 95, branches: 95, statements: 95 },
      },
    },
  },
});
