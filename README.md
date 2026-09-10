# DATE

**DATE** é um PWA privado, mobile-first, criado para duas pessoas organizarem ideias de rolês, escolherem datas, planejarem experiências e guardarem memórias.

> Descobrir → decidir → planejar → lembrar.

A aplicação une a descoberta visual de um app de lifestyle com organização de agenda e status, sem estética corporativa e sem transformar o produto em uma rede social.

## Stack

- Next.js App Router + React + TypeScript
- Tailwind CSS
- shadcn/ui, sempre customizado para a identidade DATE
- Motion para microinterações
- Lucide para ícones
- React Hook Form + Zod
- date-fns
- PostgreSQL no Neon
- Drizzle ORM + migrations versionadas
- Managed Better Auth / Neon Auth
- Cloudflare R2 privado para mídia
- Vercel para deploy
- PWA mobile-first
- Vitest + Playwright
- pnpm

## Ambientes

| Ambiente | Neon | R2 |
|---|---|---|
| Desenvolvimento | `development` | `date-media-dev` |
| Produção | `production` | `date-media-prod` |

## Documentação obrigatória

Antes de modificar a aplicação, leia:

1. `DATE_PROJECT_SPEC.md`
2. `HANDOFF_STATUS.md`
3. `CLAUDE.md`
4. `AGENTS.md`
5. `docs/ROADMAP.md`
6. `docs/DEFINITION_OF_DONE.md`
7. `docs/DECISION_LOG.md`

Os quatro documentos restantes da estrutura (`docs/DESIGN_SYSTEM.md`, `docs/DATABASE.md`, `docs/AUTH_AND_SECURITY.md` e `docs/MEDIA_R2.md`) são entregues no bloco que consome cada um — ver D-003 em `docs/DECISION_LOG.md`.

## Regras fundamentais

- Nunca usar `production` durante desenvolvimento local.
- Nunca usar `date-media-prod` no localhost.
- Nunca expor segredo com prefixo `NEXT_PUBLIC_`.
- Nunca criar schema manualmente no Console; usar migrations Drizzle.
- Nunca implementar cadastro público.
- Nunca usar documentação antiga do Stack Auth/StackFrame para Neon Auth.
- Nunca trocar a stack sem decisão explícita.
- Nunca introduzir visual genérico “AI-generated”.
- Mobile-first é requisito, não melhoria futura.
- Nenhuma fase é concluída com `build`, lint ou testes relevantes quebrados.

## Marca

A identidade visual aprovada está em `public/brand/`.

A prancha de referência está em:

`public/brand/reference/date-brand-board.png`

Os SVGs são a fonte principal dos assets. Os PNGs/ICO são exports para PWA/fallback.
