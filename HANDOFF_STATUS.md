# DATE — Handoff status

Data do handoff: **11/09/2026**

Este arquivo registra o estado factual atual para a continuidade da implementação.

## Já concluído pelo proprietário

- Nome do produto: **DATE**
- Direção visual aprovada e congelada para a V1
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
- `pnpm test:crud` deixa planos na branch e quebra o `pnpm test:db`, que afirma que o workspace tem exatamente os oito ids do seed. O e2e arquiva em vez de apagar, e arquivar não remove a linha. Defeito herdado do B4, ainda aberto.
- Próximo bloco: **B6 — Datas e votação**.

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
| `pnpm test:db` | Neon `development` |
| `pnpm test:media` | Neon `development` + R2 `date-media-dev` |
| `pnpm test:media-e2e` · `shots:media` | os dois acima + sessão de development |
| `pnpm r2:check` | confere bucket e endpoint sem conectar |

## Próxima ação

B6 — Datas e votação. Nenhum bloqueio humano conhecido: banco, auth e mídia já estão provados em `development`.
