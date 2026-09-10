# DATE — Handoff status

Data do handoff: **10/09/2026**

Este arquivo registra exatamente onde o projeto está antes do primeiro scaffold de código.

## Já concluído pelo proprietário

- Nome do produto: **DATE**
- Direção visual aprovada e congelada para a V1
- Repositório GitHub **privado já criado**
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

- O repositório ainda precisa receber o scaffold do Next.js.
- Vercel ainda precisa ser conectada/deployada.
- Não existem tabelas de negócio do DATE.
- Não existem migrations Drizzle.
- Não existem credenciais R2 da aplicação.
- Não existem variáveis `.env.local` do projeto.
- Os dois usuários finais ainda não devem ser criados/ativados até o fluxo de auth estar implementado e testado.
- Não há UI de produto implementada.

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

Ler `DATE_PROJECT_SPEC.md`, `CLAUDE.md`, `AGENTS.md` e `prompts/BLOCO_00_FUNDACAO.md`; em seguida executar o bootstrap de forma segura dentro do repositório já existente.
