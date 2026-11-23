# Plano de implementação

> Criado em 2026-11-12. Cada fase termina com testes passando, lint limpo e docs atualizados.
> Marque o status aqui ao concluir cada fase.
>
> **Situação em 2026-11-12:** fases 0–9 concluídas (134 testes passando, lint limpo, `docker:mock` gera o zip).
> Falta a Fase 10 (homologação com dados reais), que depende das pendências P1–P6.

| Fase | Tema | Status |
|------|------|--------|
| 0 | Fundação do projeto | ✅ 2026-11-12 |
| 1 | Domínio (regras puras) | ✅ 2026-11-12 |
| 2 | Mock e servidor fake | ✅ 2026-11-12 |
| 3 | Etapa `fetch` | ✅ 2026-11-12 |
| 4 | Etapa `transform` | ✅ 2026-11-12 |
| 5 | Etapa `render:charts` | ✅ 2026-11-12 |
| 6 | Etapa `render:xlsx` | ✅ 2026-11-12 |
| 7 | Etapa `render:docx` | ✅ 2026-11-12 |
| 8 | Etapa `package` + `pipeline` | ✅ 2026-11-12 |
| 9 | Docker (mock e produção) | ✅ 2026-11-12 |
| 10 | Homologação com dados reais | ⬜ |

---

## Fase 0 — Fundação

- `package.json` (Node 22, `"type": "module"`), `tsconfig` strict, ESLint + Prettier, `vitest.config.ts` com limites de cobertura.
- Scripts `npm run` vazios para todas as etapas (ver `ARQUITETURA.md` §2) + `lint`, `typecheck`, `test*`.
- `src/config` com validação de env por `zod`; `src/shared/logger` (pino) e `src/shared/theme` (paleta).
- `.env.example`, `.gitignore` (`data/`, `work/`, `output/`, `.env.prod`).
- **Aceite:** `npm run lint && npm run typecheck && npm test` passam com um teste de fumaça.

## Fase 1 — Domínio

- `schemas.ts` (zod das 3 sentenças), `normalize.ts`, `classify.ts`, `scoring.ts`, `join.ts`, `report-tree.ts`.
- Tipos do modelo: `ReportTree → Unidade → Grupo (004 | Alunos <modalidade>) → Relatório (prova | professor)`.
- **Aceite:** todos os casos de `TESTES.md` (unitários de domínio) passando; cobertura ≥ 95% em `domain/`.

## Fase 2 — Mock

- `mock/generator.ts` com seed fixa e casos de borda; `npm run mock:generate` grava `mock/data/`.
- Corrigir os valores da amostra 004 em `../structure/` para a semântica “professor responde” (pendência P1).
- `mock/server.ts` (HTTP nativo) imitando o endpoint, com Basic auth; `npm run mock:serve`.
- **Aceite:** teste de integração que sobe o servidor em porta aleatória e lê as 3 sentenças.

## Fase 3 — `fetch`

- `infra/totvs-client.ts`: monta URL, Basic auth, timeout, retry exponencial (5xx/rede), valida envelope.
- Busca as 3 sentenças em paralelo, grava `data/raw/*.json` e `manifest.json`.
- Mensagens claras para 401 (credencial), 404 (sentença) e timeout.
- **Aceite:** integração com `msw` cobrindo sucesso, 401, 500→retry→sucesso, JSON inválido.

## Fase 4 — `transform`

- Lê `data/raw`, valida, normaliza, classifica 006, junta com 005, aplica filtro `ANO_LETIVO`, agrega e monta a árvore.
- Grava `model.json` (inclui `<ts>` da execução) e `warnings.json` (sem par, inválidas, duplicadas).
- Resumo no console: unidades, relatórios por grupo, avisos.
- **Aceite:** snapshot do `model.json` para fixtures `minimal` e `edge`.

## Fase 5 — `render:charts` (pesado)

- Tema ECharts com a paleta; gráfico de prova (média por questão + média da unidade) e de professor
  (média por disciplina/turma + média do professor + referência da unidade).
- SVG → PNG (fundo branco, 1600×900, 2x) e JPG (qualidade 90) com `sharp`; concorrência limitada.
- **Aceite:** arquivos gerados, dimensões e assinatura corretas; teste visual por snapshot do SVG.

## Fase 6 — `render:xlsx`

- Abas conforme `REGRAS_DE_NEGOCIO.md` §7; cabeçalho `#164194` com texto branco; formatação condicional por faixa (§4.3); adesão < 50% em `#E84910`; congelar cabeçalho; autofiltro.
- **Aceite:** integração reabre a planilha e confere valores.

## Fase 7 — `render:docx`

- Template com cabeçalho/rodapé, títulos na paleta, imagem embutida, tabelas por questão/disciplina, avisos.
- Falha clara se a imagem esperada não existir (exige `render:charts` antes).
- **Aceite:** integração confere textos-chave e presença da imagem no `.docx`.

## Fase 8 — `package` e `pipeline`

- `archiver` gera `output/relatorios_<ts>.zip`; imprime caminho e tamanho.
- `pipeline` executa as etapas em sequência como subprocessos `node` (isola memória das etapas pesadas) e para no primeiro erro com código de saída ≠ 0.
- **Aceite:** e2e com o servidor de mock gera zip com a árvore esperada.

## Fase 9 — Docker

- `Dockerfile` multi-stage, usuário não-root; `docker-compose.yml` com perfis `mock` e `prod`; volume `output/`.
- Scripts `npm run docker:mock` e `npm run docker:prod`.
- **Aceite:** `docker:mock` produz o zip em `./output` em máquina limpa.

## Fase 10 — Homologação

- Rodar `fetch` real (fora dos testes) e comparar campos com `../structure/`; resolver pendências P1–P6.
- Revisar relatórios com a área de negócio; ajustar layout; registrar decisões.

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Volume grande de linhas | Etapas separadas em subprocessos; concorrência configurável; medir na Fase 10 |
| Formato de `DESCOBJETOAVALIADO` variar em produção | Parser tolerante + `warnings.json` para revisar |
| `sharp` em ambiente Windows/WSL | Binários pré-compilados; Docker como caminho oficial |
| Nomes de professor iguais em unidades diferentes | Chave sempre inclui unidade normalizada |
