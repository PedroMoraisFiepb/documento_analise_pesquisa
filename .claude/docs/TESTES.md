# Estratégia de testes

Ferramenta: `vitest` (cobertura `v8`). HTTP simulado com `msw`. **Nunca** acessar o TOTVS real.

## Comandos

```bash
npm test                # tudo: unitários + integração + e2e
npm run test:unit
npm run test:integration   # integração sem o e2e
npm run test:e2e           # pipeline completo em subprocessos contra o mock (lento em /mnt/c no WSL: ~3 min)
npm run test:coverage      # unit + integração, falha abaixo dos limites
```

Situação em 2026-11-13: 163 testes passando (162 + e2e); cobertura global ≈ 98% linhas / 94% branches;
`src/domain` 99,6% linhas / 96% branches.

## Limites de cobertura

| Escopo | Linhas / funções / branches |
|--------|-----------------------------|
| `src/domain/**` | 95% |
| Global | 85% |

## Unitários (`tests/unit`)

| Módulo | Casos obrigatórios |
|--------|--------------------|
| `normalize` | prefixo `Unidade `, acentos, espaços, `CODRESPOSTA` minúscula/inválida/vazia |
| `classify` | padrão professor válido; hífen no nome do professor; prefixo com caixa diferente; vazio; formato quebrado → aviso; disciplina do 004 pelos campos (hífen na disciplina, texto truncado) |
| `scoring` | escala A=5…E=1; média ponderada ≠ média das médias; distribuição soma 100%; zero respostas |
| `join` | casamento 004×005 por `DESCOBJETOAVALIADO` e por professor/turma/disciplina; unidade com/sem prefixo; sem par → aviso; EJA |
| `report-tree` | estrutura de §6 das regras; pasta EJA só com dados; professor sem respostas |
| `paths` | caracteres inválidos no Windows; limite de tamanho; colisões com sufixo |
| `totvs-client` | URL montada; header Basic; retry em 5xx; sem retry em 4xx; timeout; envelope inválido |
| formatação | número pt-BR com vírgula, datas |
| `charts` | gráfico por questão (A–E, cores, rótulo “qtd (%)”, título quebrado); catálogo `graficosDoRelatorio` por config |
| `docx-template` | marcador inserido/preservado, largura útil pelas margens, template inválido |
| `mock-generator` | determinismo; papéis de D29 (004 só avaliação de professor, 006 demais provas, 009 setores); `DESCOBJETOAVALIADO` truncado igual no 004/005; campos do 009 = 006; casos de borda |
| `config` | `GRAFICOS_PROFESSOR`/`GRAFICOS_PROVA` (lista, duplicados, valor inválido), `DOCX_TEMPLATE` |

## Integração (`tests/integration`)

- `fetch` contra `msw` com os fixtures → arquivos em `data/raw` e `manifest.json` corretos.
- `transform` a partir de fixtures → `model.json` com snapshot estável.
- `render:charts` → PNG e JPG existem, dimensões esperadas, assinatura de arquivo válida.
- `render:xlsx` → reabrir com `exceljs` e conferir abas, cabeçalhos e médias.
- `render:docx` → abrir o zip do docx e conferir textos-chave (unidade, professor, média), imagens embutidas,
  timbre/margens/estilos do template, seção de perguntas abertas no final e ausência de `EDU.BI`.
- Gráficos configuráveis (`GRAFICOS_*`) e template ausente → mensagem clara.
- `package` → listar o zip e comparar a árvore de pastas com a esperada.
- `pipeline` ponta a ponta usando o servidor do mock em porta aleatória.

Testes de integração usam diretório temporário (`os.tmpdir()`) e limpam ao final (helper `tests/helpers/contexto.ts`).
Snapshots: `tests/unit/__snapshots__/charts.test.ts.snap` (SVG) e `tests/integration/__snapshots__/transform.test.ts.snap`
(`model.json` e `warnings.json`). Ao mudar uma regra intencionalmente, revise o diff e rode `npx vitest run -u`.
O fuso dos testes é fixo (`TZ=America/Recife` em `vitest.config.ts`).

## Fixtures

- `tests/fixtures/minimal/` — as amostras de `../structure/` com os papéis de D29 (004 = alunos avaliam professores,
  006 = demais provas + 1 linha de professor ignorada, 009 = professores respondem).
- `tests/fixtures/edge/` — casos de borda: CODRESPOSTA minúscula/inválida/vazia, duplicadas no 005/006/009, hífen no
  nome do professor, unidade com espaços extras, `PORCENTAGEM_RESPOSTAS` ausente, professor sem respostas, EJA,
  modalidade "TÉCNICO", 004 sem par e com formato quebrado, 006 com formato quebrado, nome de prova inválido no
  Windows, colisão de pastas, linhas rejeitadas pelo schema (005 e 009), `ANO` diferente no 004 (filtro `ANO_LETIVO`).
- O mock (`mock/data`) é gerado com seed fixa; testes não dependem dele exceto o e2e do pipeline.
