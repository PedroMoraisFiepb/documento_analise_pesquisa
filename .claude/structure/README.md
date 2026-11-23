# Estrutura das consultas do TOTVS RM

Amostras de resposta das sentenças `EDU.BI.004`, `EDU.BI.005`, `EDU.BI.006` e `EDU.BI.009`
(`GET .../ConsultasSQL/ExecutaConsultaSQL?codColigada=2&codSistema=S&codSentenca=<SENTENCA>&parameters=`).

> **O que é real e o que é ilustrativo**
> - **Real:** nomes dos campos, tipos e o envelope `{ "Row": [ ... ] }`.
>   `CODRESPOSTA` vem como **letra A–E** (confirmado em 2026-11-12).
> - **Ilustrativo:** todos os valores (nomes, códigos, quantidades, textos). Eles foram ajustados
>   para contar uma história coerente entre as 3 sentenças (ver "Cenário das amostras").
> - Nenhum campo foi inventado: os campos de cada arquivo são exatamente os da consulta original.

## Papéis das consultas (D29 em `../docs/DECISOES.md`)

| Sentença | Quem responde | Conteúdo |
|----------|---------------|----------|
| `EDU.BI.004` | Alunos | Avaliação dos **professores** pelos alunos (com professor, turma e modalidade) |
| `EDU.BI.005` | — | Adesão: quantos alunos responderam a avaliação de cada professor × turma × disciplina |
| `EDU.BI.006` | Alunos | **Demais provas** (satisfação, infraestrutura…); linhas de professor aqui são ignoradas |
| `EDU.BI.009` | Professores | Provas que os professores respondem sobre setores (Direção, Coordenação…) |

## Cenário das amostras

| Professor      | Unidade        | Turma (CODTURMA)       | Disciplinas            | Onde aparece |
|----------------|----------------|------------------------|------------------------|--------------|
| João da Silva  | Campina Grande | 1º Ano A (`1AEM`)      | Matemática, Física     | 004 e 005 → exemplo de **média entre disciplinas** |
| Maria Oliveira | João Pessoa    | 2º Ano B (`2BEM`)      | Língua Portuguesa      | 004 e 005 |
| Carlos Souza   | Campina Grande | EJA Noturno (`EJA01`)  | História               | 004 e 005 → exemplo de **adesão abaixo de 50%** (9 de 20) |
| Carlos Souza   | Patos          | EJA Noturno (`EJA01`)  | História               | só 004 → exemplo de **sem par no 005** |

- O aluno `987654` responde à avaliação de João da Silva em Matemática **e** em Física.
- O 006 traz outras provas (Pesquisa de Satisfação, Avaliação de Infraestrutura) e uma linha de professor (ignorada).
- O 009 traz professores respondendo “Avaliação da Direção 2026” e “Avaliação da Coordenação Pedagógica 2026”.

## EDU.BI.004 — avaliação de professores pelos alunos

Uma linha = **uma resposta** (inscrição × questão) de um aluno na avaliação de um professor.

| Campo | Tipo | Significado |
|-------|------|-------------|
| `CODPROVA` | número | Código da prova (avaliação de professores) |
| `NOME` | texto | Nome da prova |
| `TEXTO` | texto | Enunciado da questão |
| `ID_INSCRICAO` | número | Inscrição do aluno na prova |
| `CODQUESTAO` | número | Código da questão |
| `CODRESPOSTA` | texto | Alternativa escolhida: `A` (melhor) … `E` (pior) |
| `PROFESSOR` | texto | Professor **avaliado** |
| `DESCOBJETOAVALIADO` | texto | `Professor - Turma - Disciplina: <PROFESSOR> - <CODTURMA> - <DISCIPLINA>` (cortado em 100 caracteres) |
| `UNIDADE` | texto | Unidade **com** prefixo: `Unidade Campina Grande` |
| `MODALIDADE` | texto | `REGULAR`, `EJA`… |
| `CURSO_NOME_TRATADO`, `CURSO`, `CODHABILITACAO`, `SERIE` | texto | Dados do curso |
| `ANO` | texto | Ano letivo (`"2026"`, string) |
| `CODTURMA`, `TURMA` | texto | Código e nome da turma |

## EDU.BI.005 — adesão dos alunos à avaliação de professores

Uma linha = **um objeto avaliado** (professor × turma × disciplina) com a contagem de participação.
Não tem `CODPROVA`: relaciona-se às notas do **004** pelo `DESCOBJETOAVALIADO` + unidade (ou `PROFESSOR` + `CODTURMA` +
`DISCIPLINA` + unidade).

| Campo | Tipo | Significado |
|-------|------|-------------|
| `DESCOBJETOAVALIADO` | texto | `Professor - Turma - Disciplina: <PROFESSOR> - <CODTURMA> - <DISCIPLINA>` |
| `PROFESSOR`, `DISCIPLINA`, `CODTURMA`, `TURMA` | texto | Objeto avaliado já decomposto |
| `QUANT_ALUNOS` | número | Alunos que responderam |
| `QUANT_RESPOSTAS` | número | Total de respostas (alunos × questões) |
| `PORCENTAGEM_RESPOSTAS` | número | `QUANT_ALUNOS / QUANTIDADE_ALUNOS_TURMA × 100` (arredondado) |
| `QUANTIDADE_ALUNOS_TURMA` | número | Alunos matriculados na turma |
| `UNIDADE` | texto | Unidade **com** prefixo `Unidade ` |
| `CURSO`, `SERIE`, `ANO`, `MODALIDADE` | texto | Contexto da turma |

## EDU.BI.006 — demais provas dos alunos

Uma linha = **uma resposta** (inscrição × questão) de um aluno nas demais provas (satisfação, infraestrutura…).
Linhas com `DESCOBJETOAVALIADO` no formato `Professor - Turma - Disciplina: ...` são **ignoradas** (vêm do 004).

| Campo | Tipo | Significado |
|-------|------|-------------|
| `CODPROVA` | número | Código da prova |
| `PROVA` | texto | Nome da prova |
| `TEXTO` | texto | Enunciado da questão |
| `ID_INSCRICAO` | número | Inscrição do aluno |
| `CODQUESTAO` | número | Código da questão |
| `CODRESPOSTA` | texto | Alternativa escolhida: `A` … `E` |
| `DESCOBJETOAVALIADO` | texto | Objeto avaliado (pode vir vazio) |
| `UNIDADE` | texto | Unidade **sem** prefixo: `Campina Grande` |

## EDU.BI.009 — respostas de professores (nova, 2026-11-13)

> Consulta criada pelo responsável para as provas **respondidas por professores** (D27/D29 em
> `../docs/DECISOES.md`). **Campos assumidos iguais aos do 006** (P7); valores de `edu_bi_009.txt` são ilustrativos.

Uma linha = **uma resposta** (inscrição × questão) de um professor.

| Campo | Tipo | Significado |
|-------|------|-------------|
| `CODPROVA` | número | Código da prova |
| `PROVA` | texto | Nome da prova (ex.: `Avaliação Institucional 2026 Professores - Direção`) |
| `TEXTO` | texto | Enunciado da questão |
| `ID_INSCRICAO` | número | Inscrição do **professor** respondente |
| `CODQUESTAO` | número | Código da questão |
| `CODRESPOSTA` | texto | Alternativa escolhida: `A` … `E` |
| `DESCOBJETOAVALIADO` | texto | Setor avaliado (`Direção`, `Coord. Pedagógica`, `Secretaria`…) ou vazio |
| `UNIDADE` | texto | Unidade **sem** prefixo: `Campina Grande` |
