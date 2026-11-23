export const LIMITE_NOME = 80;

/** Nome de pasta/arquivo seguro no Windows (§3): sem <>:"/\|?* e controle, sem ponto/espaço final, ≤ 80. */
export function sanitizarNome(nome: string): string {
  let s = nome
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.slice(0, LIMITE_NOME);
  s = s.replace(/[. ]+$/g, '');
  return s || 'sem nome';
}

/** Distribui nomes únicos dentro de uma mesma pasta: colisões recebem " (2)", " (3)"… */
export class AlocadorDeNomes {
  private readonly usados = new Set<string>();

  alocar(nome: string): string {
    const base = sanitizarNome(nome);
    let candidato = base;
    let n = 2;
    // Comparação case-insensitive: o sistema de arquivos do Windows não diferencia caixa.
    while (this.usados.has(candidato.toLowerCase())) {
      const sufixo = ` (${n++})`;
      candidato = `${base.slice(0, LIMITE_NOME - sufixo.length).replace(/[. ]+$/g, '')}${sufixo}`;
    }
    this.usados.add(candidato.toLowerCase());
    return candidato;
  }
}
