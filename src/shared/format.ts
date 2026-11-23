const numero2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const SEM_VALOR = '—';

/** Número com 2 casas e vírgula decimal (ex.: 4,25). `null` → "—". */
export function formatNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return SEM_VALOR;
  return numero2.format(valor);
}

/** Percentual com 1 casa (ex.: 45,0%). Recebe o valor já em 0–100. */
export function formatPercentual(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return SEM_VALOR;
  return `${numero1.format(valor)}%`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data/hora no formato dd/mm/aaaa HH:MM (hora local). */
export function formatDataHora(data: Date): string {
  return `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()} ${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

/** Carimbo usado no nome da pasta/zip: AAAA-MM-DD_HHmm (hora local). */
export function formatCarimbo(data: Date): string {
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}_${pad(data.getHours())}${pad(data.getMinutes())}`;
}

/** Tamanho de arquivo legível (ex.: 1,5 MB). */
export function formatBytes(bytes: number): string {
  const unidades = ['B', 'KB', 'MB', 'GB'];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return i === 0 ? `${valor} B` : `${numero1.format(valor)} ${unidades[i]}`;
}
