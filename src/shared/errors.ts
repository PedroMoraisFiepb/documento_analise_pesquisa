/** Erro com mensagem destinada ao usuário (exibida sem stack trace pela CLI). */
export class AppError extends Error {
  constructor(
    message: string,
    readonly codigo: string = 'ERRO',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}
