import pino, { type Logger } from 'pino';

export type { Logger };

/** Logger da aplicação. Usa pino-pretty quando a saída é um terminal interativo. */
export function createLogger(level = 'info'): Logger {
  const pretty = process.stdout.isTTY && process.env.NODE_ENV !== 'production';
  return pino({
    level,
    base: undefined,
    redact: { paths: ['password', '*.password', 'authorization', '*.authorization'], censor: '***' },
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  });
}

/** Logger silencioso (testes). */
export function createSilentLogger(): Logger {
  return pino({ level: 'silent' });
}
