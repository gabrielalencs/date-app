# DATE — Handoff status

Data do handoff: **10/09/2026**

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
- Não existem credenciais R2 da aplicação; mídia e upload são do B5.
- Webhook `user.before_create` **pendente e obrigatório antes do primeiro deploy**: o serviço aceita cadastro de qualquer origem que conheça a base URL, e a allowlist da aplicação não protege o provedor (D-043).
- O domínio de produção precisa ser registrado como origem confiável no Neon Auth antes do deploy (D-046).
- `production` intocada: nenhuma migration, nenhum dado, nenhuma conta.
- Não há CRUD ou outra UI de produto implementada além do app shell, da tela de login e da vitrine do design system.
- Próximo bloco: **B4 — CRUD do DATE**.

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

## Próxima ação

B3 — Auth e autorização. Exigirá as configurações humanas do Managed Better Auth descritas no prompt do bloco, sem criar usuários reais antes de o fluxo estar protegido e testado.
