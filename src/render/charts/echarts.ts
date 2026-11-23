/**
 * Ponte tipada para o ECharts 5: as declarações de tipo do pacote (`export =`) não funcionam com
 * `moduleResolution: NodeNext`, então os tipos vêm de `echarts/types/dist/echarts` e o `init` é tipado aqui.
 */
import type { EChartsInitOpts, EChartsOption, EChartsType } from 'echarts/types/dist/echarts';
// @ts-expect-error -- ver comentário acima; em tempo de execução o ESM do echarts exporta `init`.
import { init as initBruto } from 'echarts';

export type { EChartsOption };

export const initSsr = initBruto as (dom: null, tema: null, opcoes: EChartsInitOpts) => EChartsType;
