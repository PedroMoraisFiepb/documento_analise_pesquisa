# Arquitetura

## 1. Stack

| Necessidade | Escolha | Motivo |
|-------------|---------|--------|
| Runtime | Node.js 22 LTS | Pedido: interação apenas via `node`/`npm` |
| Linguagem | TypeScript (strict) executado com `tsx`, build com `tsc` | Tipagem dos contratos das sentenças |
| HTTP | `fetch` nativo (undici) com timeout + retry exponencial | Sem dependência extra |
| Validação | `zod` | Validar o envelope `{ Row: [] }` e cada linha |
| Gráficos | `echarts` (SSR → SVG) + `sharp` (SVG → PNG/JPG) | Sem dependência nativa de canvas; `sharp` tem binários prontos |
| Word | `docx` (`patchDocument`) + `jszip` | Conteúdo gerado programaticamente e inserido no template `templates/relatorio.docx` |
| Excel | `exceljs` | Estilos, larguras, cabeçalhos coloridos |
| Zip | `archiver` | Streaming, sem carregar tudo em memória |
| Log | `pino` (+ `pino-pretty` em dev) | Log estruturado, mensagens em português |
| Testes | `vitest` + `msw` (mock HTTP) | Rápido, cobertura `v8` integrada |
| Qualidade | ESLint (typescript-eslint) + Prettier + `tsc --noEmit` | Padrão de código |

## 2. Pipeline em etapas

Cada etapa é um comando `npm run` independente que **lê o artefato da etapa anterior do disco** e grava o
seu. Assim uma etapa pesada pode ser reexecutada sozinha.

```
 npm run fetch          npm run transform        npm run render:charts   npm run render:xlsx   npm run render:docx   npm run package
┌──────────────┐  raw  ┌──────────────────┐ mod ┌──────────────────┐    ┌────────────────┐    ┌────────────────┐   ┌──────────────┐
│ TOTVS / mock │──────▶│ normaliza,        │────▶│ imagens png/jpg  │──▶ │ .xlsx          │──▶ │ .docx (+imgs)  │──▶│ .zip         │
│ 004,005,     │ json  │ classifica,       │json │ (pesado)         │    │                │    │                │   │              │
└──────────────┘       │ agrega, médias    │     └──────────────────┘    └────────────────┘    └────────────────┘   └──────────────┘
                       └──────────────────┘
```

| Etapa | Comando | Entrada | Saída |
|-------|---------|---------|-------|
| 1 | `npm run fetch` | API (`TOTVS_BASE_URL`) | `data/raw/EDU.BI.00X.json` (004, 005, 006, 009) + `data/raw/manifest.json` (data, contagens, hash) |
| 2 | `npm run transform` | `data/raw/` | `data/processed/model.json` (árvore de relatórios com agregados) + `data/processed/warnings.json` |
| 3 | `npm run render:charts` | `model.json` + `GRAFICOS_*` | `work/relatorios_<ts>/**/imagens/*.{png,jpg}` |
| 4 | `npm run render:xlsx` | `model.json` | `work/relatorios_<ts>/**/*.xlsx` |
| 5 | `npm run render:docx` | `model.json` + imagens + template | `work/relatorios_<ts>/**/*.docx` |
| 6 | `npm run package` | `work/relatorios_<ts>/` | `output/relatorios_<ts>.zip` |
| — | `npm run pipeline` | — | Executa 1→6; para no primeiro erro |
| — | `npm run clean` | — | Remove `data/`, `work/` |

- O `<ts>` é definido no `transform` e gravado em `model.json`, para que todas as etapas usem a mesma pasta.
- Renderização com concorrência limitada (`RENDER_CONCURRENCY`, padrão 4) para não estourar memória.
- Etapas de renderização aceitam `--only=<unidade>` para depuração.

## 3. Estrutura do código

```
src/
├── cli.ts             # ponto de entrada: `tsx src/cli.ts <comando>` (dev) / `node dist/src/cli.js <comando>` (Docker)
├── config/env.ts      # leitura e validação de env (zod); ENV_FILE ou .env
├── domain/            # REGRAS PURAS (sem I/O) — 100% testável
│   ├── schemas.ts     # zod das sentenças (004, 005, 006, 009) + envelope
│   ├── normalize.ts   # unidade, nomes, chave de comparação, CODRESPOSTA
│   ├── classify.ts    # parser de DESCOBJETOAVALIADO (006) e disciplina do 004 pelos campos PROFESSOR/CODTURMA
│   ├── scoring.ts     # escala A–E, Acumulador (média ponderada, distribuição, respondentes)
│   ├── join.ts        # 004 × 005 (DESCOBJETOAVALIADO+unidade; fallback professor/turma/disciplina/unidade), adesão
│   ├── paths.ts       # sanitização de nomes e alocação sem colisão (D10)
│   ├── model.ts       # tipos do model.json (Unidade → Grupo → Relatório)
│   └── report-tree.ts # construirModelo(): monta a árvore com agregados e avisos
├── infra/
│   ├── totvs-client.ts   # HTTP + retry + timeout + Basic auth + validação do envelope
│   ├── fs-store.ts       # JSON atômico (tmp + rename) e leitura com mensagem orientando o comando anterior
│   └── paths.ts          # caminhos absolutos de data/, work/, output/
├── render/
│   ├── labels.ts      # rótulos compartilhados (questão, turma, modalidade)
│   ├── charts/        # options.ts (ECharts), echarts.ts (ponte tipada), render.ts (catálogo de gráficos, SVG → png/jpg)
│   ├── xlsx/render.ts
│   └── docx/          # render.ts (conteúdo + patchDocument), template.ts (prepara o template, largura útil)
├── commands/          # context, fetch, transform, render (3 etapas), package, pipeline, clean
└── shared/            # logger (pino), theme (paleta/faixas), format (pt-BR), graficos (tipos/config), concurrency, errors
templates/
└── relatorio.docx     # template Word de todos os documentos (cópia de .claude/template.docx; copiado na imagem Docker)
mock/
├── generator.ts       # gera dados coerentes entre as 3 sentenças (seed fixa, casos de borda)
├── generate.ts        # `npm run mock:generate` → mock/data/
├── data/              # JSON gerado (versionado) usado pelo servidor
├── server.ts          # servidor HTTP que imita o endpoint ExecutaConsultaSQL (+ /health)
└── serve.ts           # `npm run mock:serve`
tests/
├── unit/              # domínio, cliente TOTVS (msw), gráficos (snapshot SVG), config, mock, pipeline
├── integration/       # comandos completos em diretório temporário; pipeline.e2e.test.ts
├── helpers/
└── fixtures/          # minimal/ e edge/
```

Regra de dependência: `commands → (domain, infra, render)`; `render → domain (tipos)`; `domain` não importa nada de `infra`/`render`.

## 4. Configuração (variáveis de ambiente)

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `TOTVS_BASE_URL` | `https://gestaoescolar.fiepb.org.br` | Base da API (no mock: `http://mock-totvs:3001`) |
| `TOTVS_COLIGADA` | `2` | `codColigada` |
| `TOTVS_SISTEMA` | `S` | `codSistema` |
| `TOTVS_USER` / `TOTVS_PASSWORD` | — | Credenciais (Basic). Obrigatórias fora do mock |
| `HTTP_TIMEOUT_MS` | `600000` | Timeout por requisição (10 min) |
| `HTTP_RETRIES` | `3` | Tentativas com backoff exponencial (só em 5xx/rede) |
| `ANO_LETIVO` | — | Filtro local opcional (004/005) |
| `RENDER_CONCURRENCY` | `4` | Paralelismo de renderização |
| `OUTPUT_DIR` | `./output` | Destino do zip |
| `GRAFICOS_PROFESSOR` | `questoes` | Gráficos do relatório do professor: lista de `media`, `questoes` (vazio = nenhum) |
| `GRAFICOS_PROVA` | `media` | Gráficos do relatório de prova (mesmos valores) |
| `DOCX_TEMPLATE` | `./templates/relatorio.docx` | Template Word usado em todos os `.docx` |
| `LOG_LEVEL` | `info` | Nível do pino |
| `DATA_DIR` | `./data` | Artefatos intermediários (`raw/`, `processed/`) |
| `WORK_DIR` | `./work` | Árvore de relatórios antes do zip |
| `ENV_FILE` | `.env` | Arquivo de ambiente lido pela CLI (variáveis já definidas têm prioridade) |
| `MOCK_PORT` / `MOCK_DATA_DIR` / `MOCK_SEED` | `3001` / `mock/data` / `2026` | Servidor e gerador do mock |

Arquivos: `.env.example` e `.env.prod.example` (versionados), `.env.mock` (versionado, credenciais fictícias),
`.env.prod` (não versionado). Credenciais nunca em log (pino com `redact`).

## 5. Docker

- `Dockerfile` multi-stage (`node:22-bookworm-slim`): `deps` → `build` (tsc) → `runtime` (só `dist/` e `node_modules` de produção, usuário não-root).
- `docker-compose.yml` com perfis:

| Perfil | Serviços | Uso |
|--------|----------|-----|
| `mock` | `mock-totvs` (servidor do mock) + `pipeline` com `.env.mock` | `docker compose --profile mock up --abort-on-container-exit` |
| `prod` | `pipeline` com `.env.prod` | `docker compose --profile prod run --rm pipeline` |

- Volume `./output:/app/output` para receber o zip.
- Atalhos npm: `npm run docker:mock`, `npm run docker:prod`.
- Imagem `runtime` inclui `fonts-dejavu-core` (texto dos gráficos) e `TZ=America/Recife` (D19).
- `mock-totvs` usa a mesma imagem (`node dist/mock/serve.js`) e tem healthcheck em `/health`.

## 6. Mock

- `npm run mock:generate` gera `mock/data/EDU.BI.00X.json` (004, 005, 006 e 009) com seed fixa: N unidades, professores com várias
  turmas/disciplinas, casos de borda (adesão < 50%, professor sem respostas, `CODRESPOSTA` inválido,
  hífen no nome, unidade com acento, linha duplicada, prova do 006 sem `DESCOBJETOAVALIADO`, EJA).
- Uso local: `npm run mock:serve` (terminal 1) e `npm run pipeline:mock` (terminal 2).
- `npm run mock:serve` sobe o servidor em `:3001` respondendo no mesmo caminho do TOTVS, exigindo Basic auth
  (usuário/senha do `.env.mock`) e respondendo 404 para sentença desconhecida.
- Papéis (D29): 004 = alunos avaliam professores (com turma/modalidade); 005 = adesão; 006 = demais provas dos alunos
  (+ uma linha avulsa de professor, ignorada, e uma com formato quebrado); 009 = professores de cada unidade respondem
  provas de setores (Direção, Coord. Pedagógica, Psicologia Escolar, Gestão Escolar com 3 objetos, Infraestrutura sem
  objeto), com PRNG próprio (D28).
- `DESCOBJETOAVALIADO` truncado em 100 caracteres no 004 e no 005, como no TOTVS (D30).
- Os dados respeitam exatamente os campos de `../structure/` (ver `REGRAS_DE_NEGOCIO.md` §2).
