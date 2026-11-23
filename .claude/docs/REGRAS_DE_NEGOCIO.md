# Regras de negócio

> Última atualização: 2026-11-13 (papéis 004/005/006/009 — D29; sem códigos de consulta no resultado, gráficos por questão, template Word, perguntas abertas). Fonte: `pre_plan.txt` + respostas do responsável pelo projeto.

## 1. Fonte dos dados

API de consultas SQL do TOTVS RM (SGE):

```
GET https://gestaoescolar.fiepb.org.br/FrameHTML/rm/api/TOTVSCustomizacao/ConsultasSQL/ExecutaConsultaSQL
    ?codColigada=2&codSistema=S&codSentenca=<SENTENCA>&parameters=
```

Resposta: `{ "Row": [ { ...campos... } ] }`. Campos de cada sentença em `../structure/`.

## 2. Significado de cada sentença

> Papéis definidos pelo responsável em 2026-11-13 (D29), substituindo D01/D02.

| Sentença | Quem responde | Uma linha é… | Uso |
|----------|---------------|--------------|-----|
| **EDU.BI.004** | **Alunos** | uma resposta (inscrição × questão) de um aluno na **avaliação de um professor** (traz professor, turma, modalidade) | Relatórios do professor (`Provas de Professores/<Professor>`) |
| **EDU.BI.005** | — (agregado de alunos) | a **adesão** (quantos alunos responderam e quantos não) à avaliação de um professor numa turma/disciplina | Tabela de adesão no relatório do professor |
| **EDU.BI.006** | **Alunos** | uma resposta de um aluno nas **demais provas** (satisfação, infraestrutura, cantina…) | Relatórios de prova em `Alunos do Regular` |
| **EDU.BI.009** | **Professores** | uma resposta (inscrição × questão) de um professor numa prova que avalia setores (Direção, Coordenação…) | Relatórios de “Provas respondidas por professores” |

### 2.1 EDU.BI.004 (alunos avaliam professores)

- Campos: `CODPROVA`, `NOME`, `TEXTO`, `ID_INSCRICAO`, `CODQUESTAO`, `CODRESPOSTA`, `PROFESSOR`, `DESCOBJETOAVALIADO`,
  `UNIDADE` (com prefixo `Unidade `), `MODALIDADE`, `CURSO_NOME_TRATADO`, `CURSO`, `CODHABILITACAO`, `SERIE`, `ANO`,
  `CODTURMA`, `TURMA`.
- `PROFESSOR` = **professor avaliado**; `DESCOBJETOAVALIADO` = `Professor - Turma - Disciplina: <PROFESSOR> - <CODTURMA> - <DISCIPLINA>`.
- **Disciplina:** só existe no `DESCOBJETOAVALIADO`. Se o texto (após o prefixo) começar por
  `<PROFESSOR> - <CODTURMA> - `, a disciplina é todo o restante — tolera hífen na disciplina e texto **truncado**
  (o TOTVS corta o campo em 100 caracteres). Senão, usa o parser genérico (divisão por ` - ` pela direita, que tolera
  hífen no nome do professor). Com par no 005, a disciplina exibida é a **completa** do 005 (D30).
- Professor/turma vazios nos campos → vêm do `DESCOBJETOAVALIADO`; sem professor em nenhum → `Professor não informado`.
- `DESCOBJETOAVALIADO` fora do padrão → aviso `objeto-malformado` (uma vez por unidade × objeto) e disciplina
  `Disciplina não informada`; o relatório do professor é gerado com professor/turma dos campos.
- Filtro `ANO_LETIVO` aplica-se ao 004 (campo `ANO`).

### 2.2 EDU.BI.006 (demais provas dos alunos)

| Padrão de `DESCOBJETOAVALIADO` | Tratamento |
|--------------------------------|------------|
| vazio ou qualquer outro formato | **Outra prova** → pasta com o nome da prova (`PROVA`) em `Alunos do Regular` |
| `Professor - Turma - Disciplina: <PROF> - <TURMA> - <DISC>` | **Ignorada** (a avaliação de professores vem do 004; evitaria contagem dupla). Um aviso `professor-no-006` com o total de linhas ignoradas (D31) |
| começa com o prefixo mas sem os 3 trechos | aviso `objeto-malformado` e tratada como **outra prova** |

O parser do padrão aceita espaços extras e é insensível a maiúsculas no prefixo.

### 2.2.1 EDU.BI.009 (professores respondem) — D27

- Campos idênticos ao 006: `CODPROVA`, `PROVA`, `TEXTO`, `ID_INSCRICAO`, `CODQUESTAO`, `CODRESPOSTA`,
  `DESCOBJETOAVALIADO`, `UNIDADE` (sem prefixo `Unidade `).
- `ID_INSCRICAO` = inscrição do **professor** respondente; `DESCOBJETOAVALIADO` = setor avaliado (`Direção`,
  `Coord. Pedagógica`, `Psicologia Escolar`, `Secretaria`…) ou vazio (`Não informado`).
- Agrupamento por unidade × `CODPROVA`; média por objeto avaliado quando a prova avalia mais de um setor.
- Não tem `ANO`: o filtro `ANO_LETIVO` não se aplica. Não identifica o professor respondente (anônimo).

### 2.3 EDU.BI.005 (adesão)

- Relaciona-se ao 004 por **(`DESCOBJETOAVALIADO`, UNIDADE normalizada)** e, se não casar, por
  **(PROFESSOR, CODTURMA, DISCIPLINA, UNIDADE normalizada)** (D30).
- Fornece `MODALIDADE`, `TURMA`, `SERIE`, `CURSO`, `ANO` e a disciplina completa. A modalidade do professor vem do 005;
  sem par, da `MODALIDADE` do próprio 004.
- `PORCENTAGEM_RESPOSTAS` é usada como veio; se ausente, calcula-se `QUANT_ALUNOS / QUANTIDADE_ALUNOS_TURMA × 100`
  (arredondado, 0 se a turma tiver 0 alunos).
- **Adesão baixa:** `PORCENTAGEM_RESPOSTAS < 50` → destaque em laranja (`#E84910`) e aviso no relatório.
- Linhas do 005 repetidas na mesma chave → mantém a primeira e registra aviso (`adesao-duplicada`).
- Linha do 004 sem par no 005 → aviso `sem-par-005` uma única vez por (unidade, `DESCOBJETOAVALIADO`) (D13).
- Professor/turma do 005 sem respostas no 004 → relatório só com a adesão e aviso `sem-respostas`.

## 3. Normalizações

- **Unidade:** remover o prefixo `Unidade ` (004 e 005 trazem; 006 e 009 não), `trim`, colapsar espaços.
  Comparações usam a forma sem acento e em minúsculas; exibição usa a forma original sem prefixo.
- **Professor / disciplina / turma:** `trim` e colapsar espaços; comparação sem acento e case-insensitive.
- **Nomes de pasta/arquivo:** remover caracteres inválidos no Windows (`<>:"/\|?*` e controle), remover
  pontos/espaços finais, limitar a 80 caracteres. Colisões após a limpeza recebem sufixo ` (2)`, ` (3)`…
- **`CODRESPOSTA`** fora de `A–E` (vazio, minúscula com espaço é aceita após `trim().toUpperCase()`) → linha
  descartada do cálculo e contada em “respostas inválidas” no relatório.
- **Linhas duplicadas** (mesmo `CODPROVA` + `ID_INSCRICAO` + `CODQUESTAO` + `DESCOBJETOAVALIADO`) → manter a primeira, contar como duplicada.

## 4. Cálculos

### 4.1 Escala

| Resposta | A | B | C | D | E |
|----------|---|---|---|---|---|
| Nota     | 5 | 4 | 3 | 2 | 1 |

### 4.2 Médias

- **Média da questão** = soma das notas ÷ número de respostas válidas da questão.
- **Média geral** (de uma prova, de um professor, de uma unidade) = média **ponderada por resposta**
  (soma de todas as notas ÷ total de respostas válidas). Não é média das médias.
- **Média do professor** (004) = média geral de todas as respostas dos alunos ao professor, em todas as
  turmas/disciplinas; também calculada separadamente por disciplina/turma.
- **Média da unidade** = média geral de todas as respostas da prova naquela unidade.
- **Média da unidade (referência no relatório do professor)** = média geral de todas as respostas de avaliação de
  professores da mesma unidade **e modalidade** (D12).
- Exibição com **2 casas decimais**, vírgula como separador decimal; cálculos internos sem arredondar.
- **Respondentes** = quantidade de `ID_INSCRICAO` distintos no recorte.
- **Distribuição** = contagem e percentual de A, B, C, D, E por questão.

### 4.3 Faixas de cor (gráficos)

| Média | Cor |
|-------|-----|
| ≥ 4,00 | `#52AE32` |
| ≥ 3,00 e < 4,00 | `#008BD2` |
| < 3,00 | `#E84910` |

Elementos neutros/títulos: `#164194`; séries secundárias/referência (ex.: média da unidade): `#6CC2BA`.

## 5. Modalidade (Regular × EJA)

- Avaliação de professor (004) usa a `MODALIDADE` do 005 (chave de §2.3); sem par, a `MODALIDADE` do próprio 004
  (vazia → `REGULAR`).
- `REGULAR` → `Alunos do Regular`; `EJA` → `Alunos da EJA`. Outras modalidades → `Alunos - <Modalidade>`.
- Provas do 006 não têm modalidade → `Alunos do Regular` (ver §8, P3).
- EDU.BI.009 (professores respondem) **não** é separado por modalidade.

## 6. Estrutura de pastas gerada

```
relatorios_<AAAA-MM-DD_HHmm>/
└── <Unidade>/
    ├── Provas respondidas por professores/       # dados do EDU.BI.009
    │   └── <Nome da Prova>/                      # ex.: Avaliação da Direção, Avaliação da Coordenação
    │       ├── <Nome da Prova>.docx
    │       ├── <Nome da Prova>.xlsx
    │       └── imagens/
    │           ├── media_unidade.png
    │           └── media_unidade.jpg
    ├── Alunos do Regular/                         # 004 + 005 (professores) e 006 (demais provas)
    │   ├── Provas de Professores/
    │   │   └── <Nome do Professor>/
    │   │       ├── <Nome do Professor>.docx
    │   │       ├── <Nome do Professor>.xlsx
    │   │       └── imagens/
    │   │           ├── questao_01.png            # um gráfico por questão (GRAFICOS_PROFESSOR)
    │   │           ├── questao_01.jpg
    │   │           └── …
    │   └── <Nome da Prova>/                      # demais provas do 006 (satisfação, infraestrutura…)
    │       ├── <Nome da Prova>.docx
    │       ├── <Nome da Prova>.xlsx
    │       └── imagens/media_unidade.{png,jpg}
    └── Alunos da EJA/                             # mesma estrutura, só se houver dados
```

- **Os códigos das consultas (`EDU.BI.004/005/006`) não aparecem no resultado final** — nem em nomes de pasta,
  nem no texto dos `.docx`/`.xlsx` (D22). Ficam apenas nos artefatos internos (`data/`, `warnings.json`).
- Pastas só são criadas quando há dados.
- Ordem: unidades em ordem alfabética; grupos na ordem professores respondem (009) → Regular → EJA → demais modalidades.
- Colisão de nomes na mesma pasta (após sanitização, sem diferenciar caixa) → sufixo ` (2)`, ` (3)`… A pasta
  `Provas de Professores` tem prioridade sobre uma prova homônima (D14).
- Avisos de todo o processamento ficam em `data/processed/warnings.json` (tipos: `linha-rejeitada`,
  `resposta-invalida`, `duplicada`, `sem-par-005`, `objeto-malformado`, `adesao-duplicada`, `adesao-baixa`, `sem-respostas`,
  `professor-no-006`).
- Saída final: `output/relatorios_<AAAA-MM-DD_HHmm>.zip` contendo a árvore acima.

## 7. Conteúdo dos relatórios

### 7.0 Regras comuns a todos os `.docx`

- **Template:** todo documento é gerado a partir de `templates/relatorio.docx` (cópia de `.claude/template.docx`;
  configurável em `DOCX_TEMPLATE`). Do template vêm timbre (cabeçalho/rodapé), página, margens, fonte e estilos; o
  conteúdo entra no lugar do marcador `{{conteudo}}` ou, se o template não tiver o marcador, substitui o corpo (D24).
- **Perguntas abertas:** ao final de todo documento há a seção **“Respostas de perguntas abertas”**, em página
  própria, com um quadro em branco para registro manual (D25).
- Sem códigos de consulta no texto (D22). “Respondida por” mostra `Professores` ou `Alunos`.

### 7.1 Relatório de prova (009 e demais provas do 006) — escopo: unidade × prova

- **docx:** cabeçalho (unidade, prova, quem respondeu, data de geração), resumo (respondentes, respostas
  válidas/inválidas, média da unidade), gráficos configurados em `GRAFICOS_PROVA` (padrão: `media_unidade.png`),
  tabela por questão (enunciado, distribuição A–E em quantidade e %, média). No 009, também média por objeto avaliado
  (`DESCOBJETOAVALIADO`) quando houver mais de um. Por último, o quadro de perguntas abertas.
- **xlsx:** abas `Resumo`, `Por questão`, `Respostas` (linhas normalizadas usadas no cálculo; sem coluna de professor,
  pois 006/009 não identificam o respondente). No 009 com mais de
  um objeto avaliado, a tabela de média por objeto fica na aba `Resumo` (D15).
- **Imagem `media`:** barras horizontais com a média de cada questão + linha da média geral da unidade.

### 7.2 Relatório do professor (004 + 005) — escopo: unidade × modalidade × professor

- **docx:** cabeçalho (unidade, modalidade, professor), resumo (média geral do professor, respondentes,
  média da unidade como referência), tabela por disciplina/turma (média, respondentes, adesão do 005), seção
  **“Respostas por questão”** com os gráficos de `GRAFICOS_PROFESSOR`, tabela por questão, avisos de adesão < 50% e
  o quadro de perguntas abertas.
- **xlsx:** abas `Resumo`, `Por disciplina e turma`, `Por questão`, `Adesão` (linhas do 005), `Respostas`.
- **Gráficos (configuráveis — a escolha pode mudar, D23):**
  - `questoes` (**padrão**): um gráfico por questão (`imagens/questao_NN.{png,jpg}`), colunas A–E com a quantidade de
    respostas e o rótulo “quantidade (%)”; enunciado no título (até 3 linhas) e média da questão no subtítulo.
    Cores por alternativa: A `#52AE32`, B `#6CC2BA`, C `#008BD2`, D `#164194`, E `#E84910`.
  - `media`: barras com a média por disciplina/turma + barra da média geral do professor e linha de referência com a
    média da unidade (`#6CC2BA`) — `imagens/media_professor.{png,jpg}`.
  - Ex.: `GRAFICOS_PROFESSOR=media,questoes` gera os dois, nessa ordem.
- Professor que existe no 005 mas sem respostas no 004 → relatório gerado só com a adesão e o aviso
  “sem respostas registradas” (sem gráficos por questão).

## 8. Pendências e premissas (confirmar com o responsável)

| # | Pendência | Premissa adotada até confirmação |
|---|-----------|----------------------------------|
| P1 | ~~Amostra do 004 com professores respondendo~~ | Resolvida (D29): o 004 é a avaliação de professores pelos alunos; professores respondem no 009 |
| P2 | Autenticação da API do TOTVS | HTTP Basic com `TOTVS_USER`/`TOTVS_PASSWORD` em variáveis de ambiente |
| P3 | Modalidade das provas do 006 | Enviar para `Alunos do Regular` (004 sem par no 005 usa a própria `MODALIDADE`) |
| P4 | Filtro de ano letivo (`parameters=` vem vazio) | Sem filtro na API; `ANO_LETIVO` opcional filtra localmente no 004/005 |
| P5 | Anonimização: `ID_INSCRICAO` na aba `Respostas` | Mantido; avaliar remoção se os arquivos forem distribuídos a professores |
| P7 | Campos reais do EDU.BI.009 | Campos = 006 (mock e amostra `structure/edu_bi_009.txt`); validar com a consulta real |
| P6 | Volume esperado de linhas por sentença | Projetado para até ~500 mil linhas por sentença (streaming não necessário a princípio) |
