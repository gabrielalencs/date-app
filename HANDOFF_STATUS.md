# DATE — Handoff status

Data do handoff: **11/09/2026**

Este arquivo registra o estado factual atual para a continuidade da implementação.

## Já concluído pelo proprietário

- Nome do produto: **DATE**
- Identidade de marca aprovada; linguagem de interface reformulada no R1 por solicitação do proprietário (ver `docs/DESIGN_SYSTEM.md`)
- Repositório GitHub **privado já criado**
- Scaffold Next.js 16 com TypeScript strict, ESLint, Tailwind CSS 4, Vitest e Playwright
- B1 concluído: design system, tema e app shell existem
- B2 concluído: schema Drizzle com 14 tabelas e migration inicial versionada
- Migration inicial aplicada somente na branch Neon `development`
- Seed fictício idempotente executado duas vezes e validado por teste de integração
- B3 concluído em `development`: sessão, login, logout e autorização por workspace
- Duas contas de development provisionadas e autorizadas, ligadas a `profiles` e `workspace_members` — a do proprietário como `owner`, a outra como `member`
- Signup público bloqueado na fronteira HTTP da aplicação por allowlist positiva, provado por teste
- Login, sessão, contexto autorizado e logout validados contra o Neon Auth real (`pnpm test:auth`)
- B4 concluído: CRUD do plano com camada de dados fechada por construção
- B5 concluído: mídia em `date-media-dev`, upload por URL assinada, capa e galeria
- B6 concluído: opções de data, votos, consenso, confirmação e o acoplamento com a máquina de status
- R1 implementado e verificado: rebrand das nove telas atuais, Select DATE, Motion, fotografia e sistema visual permanente. Ver `docs/R1_VISUAL_REBRAND.md` para testes e capturas; a avaliação estética final cabe ao proprietário.
- B7 concluído: calendário mensal da `/agenda`, com navegação por URL, dia selecionado em painel e filtro por categoria. Sem escrita nova e sem migration — o calendário só lê o que o B6 grava. Ver `docs/CALENDAR.md`.
- Workspace de development normalizado para **exatamente dois membros**, as duas contas reais (D-084). Alex e Nina seguem como autores de planos e opções, não como membros; o seed corrige isso sozinho a cada execução.
- B8 concluído: reserva com estado, checklist com autor e horário, gastos em centavos com total. A máquina de status passa a exigir o fato que cada etiqueta afirma, nos dois sentidos. Ver `docs/PLANNING.md`.
- B9 implementado: travessia para `completed` com pré-condição e confirmação em modal, avaliação de cada pessoa, fotos com `purpose = 'memory'` e a timeline em `/memorias`. A tabela `memories` do B2 foi removida (D-099); memória é o plano depois, não entidade nova. Ver `docs/MEMORIES.md`.
- Migrations `0003` e `0004` **geradas e não aplicadas**: o `.env.local` não existe nesta máquina, então nada rodou contra `development`.
- `lib/money.ts` é o dono do dinheiro; `formatBRL` não existe mais. Zona no ESLint barra `parseFloat`, `Number.parseFloat` e `toFixed` fora dele.
- Migration `0002` (`reservations` mais o CHECK de valor não negativo em `expenses`) aplicada somente em `development`
- Migration `0001` (`media.thumb_object_key`) aplicada somente em `development`
- Ambiente local já preparado e atualizado:
  - Git
  - Node.js
  - pnpm
  - VS Code
  - Claude Code
  - Codex
- Cloudflare configurado:
  - R2 ativo
  - bucket privado `date-media-dev`
  - bucket privado `date-media-prod`
  - orçamento/uso será monitorado
- Neon configurado:
  - projeto: `date-app`
  - região: AWS South America East 1 / São Paulo (`sa-east-1`)
  - branch default: `production`
  - branch filha: `development`
  - Managed Better Auth / Neon Auth habilitado
  - 2FA da conta Neon habilitado
  - Data API não deve ser habilitada sem necessidade arquitetural explícita

## Ainda NÃO concluído

- Vercel ainda precisa ser conectada/deployada.
- Token R2 de **produção** não existe; é do B12. O de development está limitado a `date-media-dev`.
- Webhook `user.before_create` **pendente e obrigatório antes do primeiro deploy**: o serviço aceita cadastro de qualquer origem que conheça a base URL, e a allowlist da aplicação não protege o provedor (D-043).
- O domínio de produção precisa ser registrado como origem confiável no Neon Auth antes do deploy (D-046).
- `production` intocada: nenhuma migration, nenhum dado, nenhuma conta.
- Próximo bloco funcional: **B10 — Descoberta**.
- **Pendente do B9, por falta de `.env.local` nesta máquina:** aplicar as migrations `0003`/`0004` em `development`, rodar o seed, e executar `pnpm test:db`, `pnpm test:memories` e `pnpm shots:memories`. Todo o resto do B9 está verificado (lint, typecheck, `pnpm test`, `pnpm test:tz` nos três fusos e `pnpm build`).

## Regra de ambientes

### Local / desenvolvimento

- Neon: `development`
- R2: `date-media-dev`
- Dados: fictícios/teste
- Nunca usar segredos ou dados reais de produção.

### Produção

- Neon: `production`
- R2: `date-media-prod`
- Dados: reais do casal
- Só recebe migrations e código depois de validação em desenvolvimento.

## Não recriar infraestrutura

O agente **não deve criar** outro projeto Neon, outros buckets R2, outro repositório ou outro backend. Ele deve integrar-se aos recursos existentes.

## Comandos de verificação

| Comando | O que exige |
|---|---|
| `pnpm lint` · `typecheck` · `test` · `build` | nada além do repo |
| `pnpm test:tz` | nada — roda a suíte de tempo em UTC, Nova York e no fuso local |
| `pnpm test:db` | Neon `development` |
| `pnpm test:media` | Neon `development` + R2 `date-media-dev` |
| `pnpm test:media-e2e` · `shots:media` | os dois acima + sessão de development |
| `pnpm test:dates` · `shots:dates` | Neon `development` + sessão de development |
| `pnpm test:planning` · `shots:planning` | Neon `development` + sessão de development |
| `pnpm test:memories` · `shots:memories` | Neon `development` + sessão de development |
| `pnpm r2:check` | confere bucket e endpoint sem conectar |

## Próxima ação

A continuidade visual segue obrigatoriamente os tokens, primitives e padrões do R1 em `docs/DESIGN_SYSTEM.md`. O relatório de implementação, capturas e verificações está em `docs/R1_VISUAL_REBRAND.md`. `/kitchen-sink` demonstra o sistema novo; os mockups fornecidos são referência de direção, sem autorização para inventar features ou dados.

B10 — Descoberta. Nenhum bloqueio humano conhecido: banco, auth, mídia, datas, calendário, planejamento e memórias já estão implementados.

Antes do B10, porém, o B9 precisa ser fechado contra o banco real: recriar o `.env.local` a partir do `.env.example`, aplicar `pnpm db:migrate` (migrations `0003` e `0004`), rodar `pnpm db:seed` e então `pnpm test:db`, `pnpm test:memories` e `pnpm shots:memories`. A `0004` dropa a tabela `memories`, que está vazia de conteúdo próprio desde a `0003`; a conferência de linhas antes do `NOT NULL` está escrita na própria migration e aborta com mensagem se o backfill não tiver coberto tudo.

O B10 herda duas coisas do B9: o `activity_events` já tem os verbos que o feed vai ler, e `db/query-counter.ts` é o instrumento para provar que o feed também não consulta por linha.
