# Documentação — Automação de Relatórios de Avaliação (TOTVS RM)

Automação em Node.js (CLI via `npm run`) que busca os dados das sentenças `EDU.BI.004`, `EDU.BI.005`,
`EDU.BI.006` e `EDU.BI.009` (004 = alunos avaliam professores; 005 = adesão; 006 = demais provas dos alunos;
009 = provas respondidas por professores — D29) no TOTVS RM (SGE), calcula médias e gera, por unidade, arquivos `.docx`, `.xlsx` e imagens
(`.png` e `.jpg`), empacotando tudo num `.zip` no final.

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [REGRAS_DE_NEGOCIO.md](REGRAS_DE_NEGOCIO.md) | O que cada consulta significa, classificação, cálculos, estrutura de pastas, conteúdo dos relatórios, pendências (§8) |
| [ARQUITETURA.md](ARQUITETURA.md) | Stack, módulos, etapas do pipeline, artefatos intermediários, Docker, configuração |
| [PLANO_IMPLEMENTACAO.md](PLANO_IMPLEMENTACAO.md) | Fases de implementação, entregáveis e critérios de aceite |
| [TESTES.md](TESTES.md) | Estratégia de testes, fixtures, cobertura mínima |
| [DECISOES.md](DECISOES.md) | Registro de decisões (ADR curto), com data e motivo |
| [../structure/](../structure/) | Amostras de resposta das sentenças 004, 005, 006 e 009 (referência de campos) |

## Regras para quem for desenvolver

1. Leia `REGRAS_DE_NEGOCIO.md` antes de qualquer tarefa.
2. Ao mudar regra de negócio, arquitetura ou tomar decisão relevante, **atualize estes documentos** e
   registre em `DECISOES.md`.
3. Todo código novo tem testes unitários e de integração. **Nunca** chamar o TOTVS real nos testes.
4. Textos de interface, logs voltados ao usuário e documentação em português.
5. Paleta: `#164194` (azul escuro), `#008BD2` (azul), `#6CC2BA` (verde-água), `#52AE32` (verde), `#E84910` (laranja).

## Comandos (visão rápida)

```bash
npm run fetch          # 1. busca as sentenças no SGE  -> data/raw/
npm run transform      # 2. normaliza, classifica, calcula -> data/processed/
npm run render:charts  # 3. gera imagens png/jpg (pesado)
npm run render:xlsx    # 4. gera planilhas
npm run render:docx    # 5. gera documentos Word (usa as imagens)
npm run package        # 6. gera o .zip final em output/
npm run pipeline       # executa 1→6 em sequência (cada etapa num subprocesso)
npm run clean          # remove data/ e work/

npm run mock:generate  # (re)gera mock/data/ com seed fixa
npm run mock:serve     # sobe o mock do TOTVS em :3001 (usa .env.mock)
npm run pipeline:mock  # pipeline completo contra o mock local
npm run docker:mock    # mock + pipeline no Docker → ./output/*.zip
npm run docker:prod    # pipeline no Docker contra o TOTVS real (.env.prod)

npm run lint && npm run typecheck && npm test
```

Etapas de renderização aceitam `-- --only=<unidade>` (ex.: `npm run render:charts -- --only="João Pessoa"`).

Detalhes em [ARQUITETURA.md](ARQUITETURA.md).
