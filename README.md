# Relatórios de Avaliação (TOTVS RM)

Automação Node.js que busca as sentenças `EDU.BI.004`, `EDU.BI.005` e `EDU.BI.006` no TOTVS RM e gera, por
unidade, relatórios `.docx`, `.xlsx` e imagens `.png`/`.jpg`, empacotados em `output/relatorios_<data>.zip`.

Documentação completa (regras de negócio, arquitetura, decisões, testes): [`.claude/docs/`](.claude/docs/README.md).

## Início rápido

```bash
npm ci

# Com dados fictícios (mock), em dois terminais:
npm run mock:serve
npm run pipeline:mock

# Ou tudo no Docker:
npm run docker:mock

# Produção: copie .env.example para .env (local) ou .env.prod.example para .env.prod (Docker) e preencha.
npm run pipeline        # ou: npm run docker:prod
```

Etapas individuais: `fetch` → `transform` → `render:charts` → `render:xlsx` → `render:docx` → `package`.

## Qualidade

```bash
npm run lint && npm run typecheck && npm test
npm run test:coverage
```
