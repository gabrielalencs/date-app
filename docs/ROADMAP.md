# DATE — Roadmap

Este documento substitui a referência a `docs/10_ROADMAP.md`.

## Regra de execução

Um bloco por vez. Um bloco = uma branch = um review = um merge.

```
branch feat/bXX-nome
   ↓
implementação pelo Claude Code
   ↓
review do Codex (read-only)
   ↓
correções
   ↓
Definition of Done atendida
   ↓
merge em main pelo proprietário
```

Nenhum bloco começa com o anterior sem merge. Nenhum agente abre dois blocos simultâneos.

---

## B0 — Fundação

Scaffold do Next 16, estrutura de pastas, scripts, `.gitignore`, assets de marca em `public/brand/`, documentação corrigida, Vitest com um teste de fumaça. Zero serviço externo, zero segredo.

**Entrega:** `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passando num repositório vazio de features.
**Passo humano ao final:** importar o repo na Vercel e confirmar deploy do Next vazio.

## B1 — Design System

Tokens CSS da paleta DATE, Fraunces e Inter via `next/font`, tema `light`/`dark`/`system` por token (nunca inversão automática), primitivas de componente (botão, campo, card, sheet, badge, skeleton, estado vazio), app shell com bottom nav no mobile e sidebar no desktop, primitivas de movimento respeitando `prefers-reduced-motion`.

**Entrega:** uma rota `/_kitchen-sink` (não linkada) exibindo todos os componentes nos dois temas, em 320px, 390px e desktop.
**Documento:** `docs/DESIGN_SYSTEM.md`.

## B2 — Banco

Drizzle code-first. Entidades: `workspaces`, `workspace_members`, `plans`, `plan_links`, `plan_date_options`, `plan_date_votes`, `checklist_items`, `expenses`, `reactions`, `media`, `memories`, `activity_events`. Primeira migration aplicada **somente** em `development`. Seed com dados fictícios.

**Entrega:** migration versionada em Git, aplicada em `development`, seed reproduzível.
**Documento:** `docs/DATABASE.md`.
**Bloqueio humano:** connection string da branch `development`.

## B3 — Auth

`createNeonAuth()` de `@neondatabase/auth/next/server`. Tela de login própria com identidade DATE. Sem rota, botão ou link de signup em lugar nenhum. `ALLOWED_EMAILS` server-only. Resolução de workspace por `workspace_members`. Helper central de autorização que toda query de negócio é obrigada a atravessar.

**Entrega:** login funcional, sessão persistente, logout, rota protegida retornando 403 para e-mail fora da allowlist.
**Documento:** `docs/AUTH_AND_SECURITY.md`.
**Bloqueio humano:** Auth Base URL e cookie secret.

## B4 — CRUD do DATE

Criar, listar, ver, editar e arquivar plano. Cadastro rápido primeiro (título e categoria bastam), detalhes opcionais depois. Máquina de status `idea → deciding → planned → reserved → completed | cancelled` com transições validadas no servidor. Grid de Ideias com busca e ordenação.

**Entrega:** ciclo completo sem imagem, com estados de loading, vazio e erro escritos à mão.

## B5 — Mídia R2

Upload via presigned URL curta, validação de MIME e tamanho no servidor, object key gerada pelo servidor e nunca aceita do cliente, capa e galeria do plano, leitura por URL assinada.

**Entrega:** upload e exibição funcionando contra `date-media-dev`.
**Documento:** `docs/MEDIA_R2.md`.
**Bloqueio humano:** Access Key do token limitado ao bucket dev.

## B6 — Datas e votação

Várias opções de data por plano. Voto `sim`/`talvez`/`não` por usuário. Consenso visível. Promoção de uma opção a data oficial, com efeito no status.

**Entrega:** o fluxo central do produto, ponta a ponta, com dois usuários de teste.

## B7 — Calendário

Visão mensal, dates confirmados em destaque, opções de data em aparência secundária, sheet no mobile, criação a partir do dia. Fuso `America/Sao_Paulo` tratado explicitamente.

## B8 — Planejamento

Reserva (necessidade, status, código, horário, link, observações), checklist ordenável com registro de quem marcou e quando, orçamento estimado e gastos reais com resumo.

## B9 — Memórias e timeline

Pós-`completed`: galeria, avaliação por usuário, "repetiria?", destaque, gastos reais. Timeline cronológica por mês e ano.

## B10 — Descoberta

Favoritos e "quero muito", filtros combinados, sorteador "escolhe pra gente" com animação curta, activity feed leve.

## B11 — PWA e endurecimento

Manifest, ícones 192/512/maskable/apple-touch/favicon, `display: standalone`, safe-area, headers de segurança, Playwright nos fluxos críticos, auditoria de acessibilidade e performance mobile.

## B12 — Produção

Webhook `user.before_create` com verificação de assinatura, migration em `production`, token R2 prod, variáveis na Vercel, criação dos dois usuários reais, deploy.

**Nenhuma etapa do B12 acontece sem confirmação explícita do proprietário, uma por uma.**

---

## Fora de escopo na V1

Push notifications, sincronização offline, preview de Open Graph, estatísticas avançadas, qualquer IA dentro do produto, terceiro usuário.
