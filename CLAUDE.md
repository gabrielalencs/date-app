# CLAUDE.md — Regras obrigatórias do DATE

Leia primeiro:
- `DATE_PROJECT_SPEC.md`
- `HANDOFF_STATUS.md`
- `docs/ROADMAP.md`
- `docs/DEFINITION_OF_DONE.md`
- `docs/DECISION_LOG.md`

Regras de agente e bloco gerenciado do Next:

@AGENTS.md

Este arquivo tem precedência sobre decisões improvisadas do agente.

## Missão

Implementar o DATE exatamente conforme a especificação, de forma incremental, segura e testável.

## Stack obrigatória

- Next.js App Router
- React + TypeScript strict
- Tailwind CSS
- shadcn/ui customizado
- Motion
- Lucide
- React Hook Form + Zod
- date-fns
- Neon PostgreSQL
- Drizzle ORM
- Managed Better Auth / Neon Auth
- Cloudflare R2
- Vercel
- Vitest + Playwright
- pnpm

Não trocar a stack sem autorização explícita do proprietário.

## Neon Auth: atenção

O Neon Auth atual é o **Managed Better Auth branchable**.

- Use o SDK atual `@neondatabase/auth`.
- Para Next.js server-side, prefira a API atual baseada em `createNeonAuth()`.
- Não use Stack Auth / StackFrame.
- Não execute tutoriais legados que criem `@stackframe/*`.
- Se exemplos encontrados contradisserem os docs atuais do Neon, consulte documentação oficial atual antes de codar.

A UI de Auth do projeto deve ser customizada. Não deixar UI default de provedor.

## Segurança de ambientes

### Local / dev
- somente Neon `development`
- somente R2 `date-media-dev`

### Produção
- Neon `production`
- R2 `date-media-prod`

Se houver dúvida sobre qual connection string/bucket está ativo: **pare** antes de rodar migration, seed, delete ou upload.

## Banco

- Schema de negócio é code-first.
- Alterações de schema exigem migration versionada.
- `drizzle-kit generate` + `drizzle-kit migrate` é o caminho padrão.
- Não usar `drizzle-kit push` em produção.
- Não editar tabelas de negócio manualmente no Neon Console.
- Não mexer diretamente no schema `neon_auth`.
- Não habilitar Neon Data API sem decisão explícita.

## Auth e autorização

V1 tem exatamente dois usuários.

- Não criar rota/página/botão de signup.
- Implementar `ALLOWED_EMAILS` como variável server-only.
- Implementar autorização por `workspace_members`.
- Toda query/mutation de entidade deve ser workspace-scoped.
- Antes de produção, implementar webhook `user.before_create` do Managed Better Auth para bloquear qualquer e-mail fora da allowlist.
- Verificar assinatura do webhook conforme docs oficiais.
- O frontend nunca é fonte de autoridade para permissões.

## Secrets

Nunca:
- commitar `.env.local`;
- imprimir connection string;
- logar token;
- expor `R2_SECRET_ACCESS_KEY`;
- usar prefixo `NEXT_PUBLIC_` para segredos;
- colocar segredos em README, docs ou fixtures.

Criar `.env.example` somente com placeholders.

## R2

- Buckets existentes: `date-media-dev`, `date-media-prod`.
- Não criar bucket novo sem necessidade.
- Buckets permanecem privados.
- Upload/download via server ou presigned URLs curtas.
- Token dev deve ser limitado ao bucket dev.
- Token prod deve ser limitado ao bucket prod.
- CORS restrito a localhost e domínio DATE; nunca `*` por conveniência.
- Validar tamanho, MIME e chave do objeto no servidor.
- Nunca aceitar uma object key arbitrária fornecida pelo cliente para delete/read.

## UI

A identidade DATE é requisito.

- Fraunces para display/editorial.
- Inter para UI.
- Navy `#1E2D3D`.
- Coral `#E76F51`.
- Sage `#A7B89F`.
- Sand `#F6EDE4`.
- Graphite `#282B2B`.
- Dark `#0E171D` / `#15232C`.
- Ícones: Lucide.
- Não usar emoji como ícone principal.
- Não usar glassmorphism, glow neon ou estética genérica de IA.
- Não criar componentes shadcn com aparência default; adaptar tokens, radius, spacing e states.
- Fotografias são protagonistas.
- Respeitar `prefers-reduced-motion`.

## Mobile-first

O mobile é o cliente principal.

- touch target mínimo ~44px;
- bottom nav no mobile;
- sidebar no desktop;
- sheets no mobile quando forem melhores que modals;
- safe-area para PWA instalada;
- testar 320px, 375px/390px e desktop.

## Arquitetura de código

Preferir:

```text
app/
components/
features/
lib/
db/
docs/
public/
tests/
```

- Server Components por padrão.
- Client Components somente quando interação exigir.
- Regras de negócio fora de componentes visuais.
- Funções de autorização centralizadas.
- Sem `any`.
- Sem duplicação de tipos de banco manualmente quando Drizzle consegue inferir.
- Zod no boundary de input.
- Não instalar dependência por conveniência para algo trivial.

## Git

- Não force-push em `main`.
- Não reescrever histórico existente.
- Commits pequenos por milestone.
- Antes de commit: lint, typecheck, tests relevantes e build.
- Não commitar artefatos locais, secrets ou dumps.

## Alterações destrutivas

Antes de:
- migration destrutiva;
- drop/rename de coluna;
- apagar objetos R2;
- reset de branch;
- tocar produção;

parar e pedir confirmação ao proprietário.

## Definition of Done

Nunca declarar uma fase pronta apenas porque "renderizou".

Ver `docs/11_DEFINITION_OF_DONE.md`.
