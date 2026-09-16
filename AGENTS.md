# AGENTS.md — DATE

Regras compartilhadas por Claude Code, Codex e qualquer outro agente.

## Ordem de leitura
1. `CLAUDE.md`
2. `DATE_PROJECT_SPEC.md`
3. `HANDOFF_STATUS.md`
4. arquivos em `docs/`

## Princípio
Os agentes implementam uma especificação já definida. Não redesenham o produto sem solicitação.

## Ambiente seguro
- Desenvolvimento: Neon `development`, R2 `date-media-dev`.
- Produção: Neon `production`, R2 `date-media-prod`.
- Nunca executar ação destrutiva em produção sem autorização humana.

## Antes de editar
- inspecione o repo;
- leia arquivos relacionados;
- confirme scripts no `package.json`;
- confirme ambiente ativo;
- confira `git status`.

## Depois de editar
- lint;
- typecheck;
- testes relevantes;
- build;
- revisar `git diff`;
- informar arquivos modificados e decisões.

## Proibições
- Stack Auth/StackFrame legado.
- signup público.
- segredo no client.
- banco acessado diretamente pelo browser.
- R2 público.
- alteração manual de schema como source of truth.
- `any` para escapar de types.
- UI genérica de template.
- escopo extra não pedido.
- dependências sem justificativa.

## Documentação
Quando uma decisão arquitetural mudar, atualizar:
- `DATE_PROJECT_SPEC.md`;
- documento específico em `docs/`;
- decision log quando aplicável.

## Produção
O agente pode preparar scripts/configurações, mas deve solicitar confirmação humana antes do primeiro deploy de produção, primeira migration em `production`, criação de credencial R2 prod ou qualquer ação irreversível.

---

<!-- O bloco abaixo é gerado e reescrito automaticamente pelo `next dev`; ver D-009 em docs/DECISION_LOG.md. Não apagar: ele volta. -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
