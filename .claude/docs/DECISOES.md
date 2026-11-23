# Registro de decisões

Formato: data — decisão — motivo. Mais recentes no topo.

## 2026-11-13 (papéis das consultas 004/005/006/009)

- **D29 — Papéis das consultas (substitui D01 e D02):** 004 = avaliação de professores **pelos alunos** (com professor,
  turma e modalidade); 005 = adesão (quantitativos de quem respondeu e não); 006 = **demais provas** dos alunos; 009 =
  provas **respondidas por professores**. O relatório do professor passa a vir do 004 + 005 e “Provas respondidas por
  professores” do 009. `VERSAO_MODELO` = 2. *Motivo:* definido pelo responsável.
- **D30 — Junção 004 × 005 pelo `DESCOBJETOAVALIADO` + unidade**, com fallback em professor/turma/disciplina/unidade.
  Disciplina do 004 = texto após `<PROFESSOR> - <CODTURMA> - ` (campos próprios do 004); com par no 005, exibe-se a
  disciplina completa do 005. *Motivo:* o TOTVS corta o `DESCOBJETOAVALIADO` em 100 caracteres e disciplinas podem ter
  hífen; dividir o texto pela direita gerava professor/disciplina errados (ex.: professor com o código da turma no nome).
- **D31 — Linhas de avaliação de professor no 006 são ignoradas** (um aviso `professor-no-006` com o total). *Motivo:*
  a mesma avaliação vem completa no 004; usá-las contaria em dobro.
- **D32 — Mock refeito com os papéis de D29**, incluindo `DESCOBJETOAVALIADO` truncado em 100 caracteres (professora
  com disciplina longa e com hífen), 004 com formato quebrado e linhas de professor no 006. Os fixtures `minimal`/`edge`
  foram convertidos (antigo 006-professor → 004; antigo 004 → 009). Sem uso de dados reais.

## 2026-11-13 (nova consulta EDU.BI.009)

- **D27 — Nova sentença `EDU.BI.009` = respostas de professores, com os mesmos campos do 006.** Criada pelo responsável
  porque o 004 real veio só com a prova “ESTUDANTES - Professores” (alunos avaliando professores, a mesma do 006),
  ou seja, não traz professores respondendo (contradiz D01). Nesta etapa: entra em `SENTENCAS` (o `fetch` busca e
  grava `data/raw/EDU.BI.009.json`), tem schema (`linha009Schema` = `linha006Schema`), mock, fixtures e amostra em
  `.claude/structure/edu_bi_009.txt`. Os campos são premissa (P7). Uso no `transform`: ver D29.
- **D28 — Mock do 009 com PRNG próprio** (`seed ^ 0x9009`) e inscrições a partir de 300000. *Motivo:* o 009 não
  depende da geração das outras sentenças.

## 2026-11-13 (ajustes pedidos pelo responsável)

- **D22 — Sem códigos de consulta no resultado final.** Pastas viram `Provas respondidas por professores`,
  `Alunos do Regular`, `Alunos da EJA`, `Alunos - <Modalidade>`; “Respondida por” mostra `Professores`/`Alunos`;
  avisos do relatório não citam `EDU.BI.00X`; a aba `Resumo` do xlsx de prova troca `Fonte` por `Respondida por`; o
  docx deixa de mostrar o código da prova ao lado do nome. Os códigos seguem em `warnings.json` e no código.
  *Motivo:* pedido do responsável — o documento final é lido por gestores e professores.
- **D23 — Gráficos configuráveis por tipo de relatório** (`GRAFICOS_PROFESSOR`, `GRAFICOS_PROVA`; tipos `media` e
  `questoes`). Padrão: professor → um gráfico de respostas A–E por questão; prova → média por questão. O catálogo fica
  em `render/charts/render.ts` (`graficosDoRelatorio`), usado tanto por `render:charts` quanto por `render:docx`.
  *Motivo:* o responsável pediu gráficos de respostas por questão para professores e avisou que isso pode mudar.
- **D24 — Todos os `.docx` usam o template `templates/relatorio.docx`** via `patchDocument` do `docx`: o corpo do
  template é trocado pelo marcador `{{conteudo}}` (ou usado como está se já tiver o marcador), preservando timbre,
  margens, estilos e cabeçalho/rodapé. Títulos usam formatação direta (o template não tem Heading 1/2) e herdam a fonte
  do template; a largura de tabelas e imagens vem das margens do template. O cabeçalho/rodapé próprios (com número de
  página) foram removidos em favor dos do template. `jszip` passou a dependência de produção.
- **D25 — Seção “Respostas de perguntas abertas” ao final de todo `.docx`**, em página nova, com quadro em branco
  (30 linhas) para preenchimento manual. *Motivo:* pedido do responsável; as perguntas abertas não vêm das consultas.
- **D26 — `HTTP_TIMEOUT_MS` padrão passa de 120000 para 600000 (10 min)** por requisição ao TOTVS (código e
  `.env*`). *Motivo:* pedido do responsável; as consultas grandes podem passar de 2 min.

## 2026-11-12 (implementação das fases 0–9)

- **D10 — Sanitização de nomes em `src/domain/paths.ts`** (pura), e não em `infra/paths.ts`. `infra/paths.ts` só
  resolve caminhos absolutos. *Motivo:* `report-tree` precisa alocar nomes de pasta e `domain` não pode importar `infra`.
- **D11 — Modelo como árvore com caminhos prontos.** Cada relatório em `model.json` já traz `caminho` (segmentos de
  pasta) e `arquivoBase`; os renderizadores não recalculam nomes. *Motivo:* uma única fonte de verdade para colisões.
- **D12 — "Média da unidade" no relatório do professor = média ponderada de todas as respostas de avaliação de
  professores da mesma unidade × modalidade.** *Motivo:* referência comparável ao professor (mesmo público).
- **D13 — Aviso "sem par no 005" emitido uma vez por (unidade, DESCOBJETOAVALIADO)**, não por linha. *Motivo:* evitar
  milhares de avisos repetidos (um por questão/aluno).
- **D14 — Pastas reservadas e colisões.** Dentro do grupo de alunos, `Provas de Professores` é alocada antes das outras
  provas; uma prova com o mesmo nome recebe ` (2)`. Comparação de colisão sem diferenciar caixa (Windows).
- **D15 — Cores no xlsx aplicadas como preenchimento estático** (não regra de formatação condicional). *Motivo:*
  renderiza igual no Excel e LibreOffice e é verificável nos testes. A tabela "média por objeto avaliado" do 004
  vai na aba `Resumo` (abaixo dos indicadores) quando houver mais de um objeto.
- **D16 — ECharts 5 tipado por ponte (`render/charts/echarts.ts`).** As declarações do pacote não funcionam com
  `moduleResolution: NodeNext`; os tipos vêm de `echarts/types/dist/echarts`. Imagens: SVG 800×450 rasterizado a
  144 dpi → 1600×900.
- **D17 — `loadConfig` não altera `process.env`.** Lê `ENV_FILE` (ou `.env`) com `util.parseEnv`; variáveis do ambiente
  têm prioridade. Novas variáveis `DATA_DIR`, `WORK_DIR` (permitem testes em diretório temporário) e `ENV_FILE`.
- **D18 — Uso local do mock com `tsx --env-file=.env.mock`** (`npm run mock:serve` + `npm run pipeline:mock`). No Docker,
  `TOTVS_BASE_URL` é sobrescrita para `http://mock-totvs:3001`. O mock expõe `/health` para o healthcheck do compose.
- **D19 — Docker com `TZ=America/Recife` e `fonts-dejavu-core`.** *Motivo:* carimbo da pasta na hora local da Paraíba e
  texto dos gráficos renderizado pelo librsvg.
- **D20 — E2E separado (`npm run test:e2e`).** Roda `tsx src/cli.ts pipeline` (6 subprocessos) contra o mock em porta
  aleatória. Fica fora de `test:integration`/`test:coverage` por ser lento em `/mnt/c` (WSL); `npm test` roda tudo.
- **D21 — Versões:** TypeScript 6, archiver 8 (`ZipArchive`), docx 9, zod 3, echarts 5, sharp 0.35, vitest 3, msw 2.

## 2026-11-12 (planejamento)

- **D01 — (substituída por D29)** EDU.BI.004 = provas respondidas por professores. `PROFESSOR` é o respondente;
  `DESCOBJETOAVALIADO` é o avaliado (Direção, Coordenação…). Os campos da amostra estão certos, os valores não.
  *Motivo:* confirmado pelo responsável; corrige a interpretação anterior do `structure/README.md`.
- **D02 — (substituída por D29)** Notas dos alunos para professores vêm do EDU.BI.006, nas linhas cujo `DESCOBJETOAVALIADO` segue
  `Professor - Turma - Disciplina: ...`. O EDU.BI.005 fornece só a adesão e a modalidade.
  *Motivo:* o 005 não tem `CODRESPOSTA`; confirmado pelo responsável.
- **D03 — Escala A=5, B=4, C=3, D=2, E=1.** *Motivo:* escolhido pelo responsável.
- **D04 — Média geral ponderada por resposta** (não média das médias). *Motivo:* evita que disciplinas com poucos respondentes distorçam a média.
- **D05 — EJA em pasta separada** (`Alunos da EJA`), com a mesma estrutura do regular. *Motivo:* escolhido pelo responsável.
- **D06 — Pipeline em etapas com artefatos em disco** (`fetch` → `transform` → `render:charts` → `render:xlsx`
  → `render:docx` → `package`). *Motivo:* pedido de separar etapas pesadas em comandos próprios; permite reexecutar só uma etapa.
- **D07 — Imagens via ECharts SSR (SVG) + sharp**, gerando PNG e JPG do mesmo gráfico. *Motivo:* evitar `node-canvas` (dependência nativa difícil em Windows/Docker slim).
- **D08 — TypeScript strict + vitest + msw.** *Motivo:* qualidade e testes sem rede.
- **D09 — Escopo sem PDF e sem interface web**, conforme `pre_plan.txt` (docx, xlsx, png, jpg, zip; interação só por `npm run`).
  O `CLAUDE.md` foi ajustado.
