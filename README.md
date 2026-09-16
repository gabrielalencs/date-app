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

## Rodando local

```bash
pnpm dev          # http://localhost:3000
pnpm dev:https    # https://localhost:3000
```

### Se o login "funciona" e a próxima página devolve para /login

O cookie de sessão do Neon Auth é `__Secure-` e o pacote fixa `secure: true`,
sem opção de desligar. O navegador **descarta esse cookie em silêncio** fora de
uma origem que ele considere confiável, e o sintoma é cruel: a senha é aceita,
a Home às vezes chega a aparecer, e a navegação seguinte volta ao login sem
erro nenhum na tela.

Em ordem de probabilidade:

1. **Origem errada.** `http://localhost:3000` funciona. O endereço que o próprio
   `next dev` imprime como "Network" — `http://192.168.x.x:3000` — não. A tela
   de login avisa quando você está numa origem dessas.
2. **`http://127.0.0.1:3000`** falha antes disso: o provedor recusa a origem e
   o login nem chega a criar cookie.
3. **O navegador bloqueando cookies.** Abra o DevTools em Application → Cookies
   logo depois do login. Se `__Secure-neon-auth.session_token` não estiver lá,
   é o navegador, não a aplicação.

**`pnpm dev:https` resolve os três de uma vez**: com HTTPS o cookie é válido em
qualquer navegador e em qualquer host, inclusive pelo IP da rede. Na primeira
execução o Next gera um certificado local com `mkcert` e instala a CA no
sistema, então não aparece aviso de certificado. A pasta `certificates/` já está
no `.gitignore`.

Quando a volta ao login for de autorização e não de cookie, o terminal diz qual
é — `pnpm auth:bootstrap-dev` religa as contas ao workspace.

## Marca

A identidade visual aprovada está em `public/brand/`.

As pranchas de referência estão em:

`public/brand/reference/date-brand-board-initial.png`
`public/brand/reference/date-brand-board-complet.png`

Os SVGs são a fonte principal dos assets. Os PNGs/ICO são exports para PWA/fallback.
