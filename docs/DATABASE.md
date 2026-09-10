# DATE — Banco de dados

Substitui a referência a `docs/05_DATABASE.md`. Normativo.

---

## 1. Princípios

**Code-first.** O schema Drizzle é a fonte da verdade. Nada é criado pelo Neon Console. Toda mudança gera migration versionada em Git.

**`workspace_id` em toda tabela de negócio**, mesmo quando o valor é derivável pelo pai. É denormalização deliberada: torna a autorização um predicado único e transforma IDOR em erro de compilação em vez de erro de revisão. Uma consulta que esquece o `workspace_id` deve ser visivelmente errada.

**Dinheiro é inteiro em centavos.** `numeric` vira string no driver e float perde centavo. Moeda fixa em BRL na V1; a coluna de moeda não existe até existir um segundo país.

**Tempo é sempre `timestamptz`**, armazenado em UTC. `America/Sao_Paulo` é decisão de apresentação, aplicada na borda com date-fns. Nenhuma coluna `timestamp` sem fuso entra no schema.

**Append-only onde faz sentido.** `activity_events` nunca sofre update ou delete.

---

## 2. Identidade e a fronteira com o Neon Auth

Os usuários vivem em `neon_auth.user`, schema gerenciado pelo Neon. O `CLAUDE.md` proíbe mexer nele, e uma FK apontando para uma tabela que o provedor pode recriar é dívida esperando acontecer.

Solução: uma tabela local `profiles`, com `id` igual ao id do usuário do Neon Auth, sem FK entre schemas. O perfil é criado por upsert no primeiro login autorizado. Toda FK de autoria no produto aponta para `profiles.id`, nunca para `neon_auth.user`.

Isso custa uma tabela e resolve integridade referencial, nome de exibição, avatar e o dia em que o Neon mudar o formato do schema de auth.

---

## 3. RLS

Não na V1. A Data API está desligada, o banco só é acessado pelo servidor, e a autorização vive num helper central obrigatório. Ligar RLS agora adiciona uma segunda camada de regra para manter sincronizada sem existir um atacante que ela impeça. Reavaliar se a Data API algum dia for ligada.

---

## 4. Entidades

Quatorze tabelas. O `ROADMAP.md` dizia doze; `profiles` e `memory_ratings` foram acrescentadas pelos motivos acima e abaixo.

### `profiles`

`id` (text, PK, id do Neon Auth) · `display_name` · `avatar_media_id` (FK nullable) · `created_at` · `updated_at`

### `workspaces`

`id` (uuid, PK) · `name` · `created_at`

Na V1 existe exatamente um. A tabela existe para que a autorização não seja um `if` por e-mail espalhado no código.

### `workspace_members`

`workspace_id` (FK) · `profile_id` (FK) · `role` (`owner` | `member`) · `created_at`
PK composta (`workspace_id`, `profile_id`).

É esta tabela que decide o acesso. Sessão válida sem linha aqui é 403.

### `plans`

O centro do produto.

`id` · `workspace_id` · `title` · `description` · `category` · `status` (enum) · `priority` (smallint 0–3) · `cover_media_id` (FK nullable) · `place_name` · `address` · `city` · `state` · `country` · `lat` · `lng` · `source_url` · `estimated_budget_cents` (integer nullable) · `duration_minutes` (integer nullable) · `requires_booking` (boolean) · `notes` · `archived_at` (nullable) · `created_by` (FK profiles) · `created_at` · `updated_at`

`archived_at` é ocultação; `cancelled` é status. Não são a mesma coisa e não se confundem.

### `plan_links`

`id` · `workspace_id` · `plan_id` · `type` (enum) · `url` · `label` · `position` · `created_at`

### `plan_date_options`

`id` · `workspace_id` · `plan_id` · `starts_at` (timestamptz) · `ends_at` (nullable) · `all_day` (boolean) · `note` · `is_confirmed` (boolean, default false) · `created_by` · `created_at`

Índice único parcial em (`plan_id`) onde `is_confirmed` — garante no máximo uma data oficial por plano no banco, não na aplicação. Evita FK circular entre `plans` e `plan_date_options`.

### `plan_date_votes`

`id` · `workspace_id` · `option_id` (FK) · `profile_id` (FK) · `vote` (enum `yes` | `maybe` | `no`) · `created_at` · `updated_at`
Único em (`option_id`, `profile_id`).

### `checklist_items`

`id` · `workspace_id` · `plan_id` · `label` · `position` (integer) · `done_at` (nullable) · `done_by` (FK nullable) · `created_at`

Ordenação por `position` com reordenação em transação. `done_at` e `done_by` andam juntos: ou os dois nulos, ou os dois preenchidos — garantido por CHECK.

### `expenses`

`id` · `workspace_id` · `plan_id` · `label` · `amount_cents` (integer) · `paid_by` (FK nullable) · `spent_on` (date nullable) · `created_at`

Gasto real. O orçamento estimado mora em `plans`. Não existe divisão de conta — isso seria outro produto.

### `reactions`

`id` · `workspace_id` · `plan_id` · `profile_id` · `type` (enum `favorite` | `want_a_lot`) · `created_at`
Único em (`plan_id`, `profile_id`, `type`).

### `media`

`id` · `workspace_id` · `object_key` (text, único) · `mime_type` · `size_bytes` · `width` · `height` · `purpose` (enum `cover` | `gallery` | `memory` | `avatar`) · `plan_id` (FK nullable) · `position` · `uploaded_by` · `created_at`

`object_key` é sempre gerado pelo servidor e nunca aceito do cliente. Formato: `{workspace_id}/{plan_id|misc}/{uuid}.{ext}`.

### `memories`

`id` · `workspace_id` · `plan_id` (FK, único) · `highlight` · `notes` · `created_at` · `updated_at`

Uma memória por plano, existindo só depois de `completed`.

### `memory_ratings`

`id` · `workspace_id` · `memory_id` (FK) · `profile_id` (FK) · `rating` (smallint 1–5, CHECK) · `would_repeat` (enum `yes` | `maybe` | `no`) · `created_at` · `updated_at`
Único em (`memory_id`, `profile_id`).

Tabela separada porque são duas pessoas avaliando de forma independente, e colar isso em colunas `rating_user_a`/`rating_user_b` seria exatamente o tipo de atalho que trava a V2.

### `activity_events`

`id` · `workspace_id` · `actor_profile_id` · `verb` (enum) · `subject_type` · `subject_id` (uuid) · `metadata` (jsonb) · `created_at`

Append-only. Sem update, sem delete, sem FK para o sujeito — o evento sobrevive ao plano apagado.

---

## 5. Enums

- `plan_status`: `idea` · `deciding` · `planned` · `reserved` · `completed` · `cancelled`
- `vote_value` e `repeat_answer`: `yes` · `maybe` · `no`
- `link_type`: `instagram` · `tiktok` · `website` · `google_maps` · `waze` · `booking` · `ticket` · `lodging` · `other`
- `reaction_type`: `favorite` · `want_a_lot`
- `media_purpose`: `cover` · `gallery` · `memory` · `avatar`
- `member_role`: `owner` · `member`
- `activity_verb`: `plan_created` · `date_suggested` · `vote_cast` · `date_confirmed` · `booking_updated` · `plan_completed` · `memory_added`

Enum de Postgres, não `text` com CHECK. Alterar enum exige migration, o que é a intenção.

---

## 6. Índices

Além das PKs e dos únicos já citados: `workspace_id` em todas as tabelas de negócio; (`workspace_id`, `status`) e (`workspace_id`, `created_at DESC`) em `plans`; (`workspace_id`, `starts_at`) em `plan_date_options`; (`plan_id`) em toda tabela filha; (`workspace_id`, `created_at DESC`) em `activity_events`.

Índice em coluna de FK não é automático no Postgres. Criar explicitamente.

---

## 7. Driver e transações

O produto precisa de transação de verdade: registrar voto e mover status, reordenar checklist, confirmar data e emitir evento. Isso tem que ser atômico.

O driver HTTP do Neon não cobre transação com múltiplos statements da mesma forma que a conexão por WebSocket. Verifique na documentação atual do Drizzle e do `@neondatabase/serverless` qual combinação suporta transação interativa na versão instalada, escolha essa, e reporte o que descobriu. Não presuma pelo que você lembra.

Migrations usam a connection string direta (unpooled). O runtime usa a pooled. São duas variáveis distintas no ambiente.

---

## 8. Estrutura

```text
db/
├── client.ts          conexão, server-only
├── schema/
│   ├── index.ts
│   ├── enums.ts
│   ├── identity.ts    profiles, workspaces, workspace_members
│   ├── plans.ts       plans, plan_links, plan_date_options, plan_date_votes
│   ├── planning.ts    checklist_items, expenses
│   ├── media.ts       media, reactions
│   └── memories.ts    memories, memory_ratings, activity_events
├── migrations/        gerado pelo drizzle-kit, versionado
└── seed.ts
```

`db/client.ts` carrega `server-only`. Se alguém importar do cliente, o build quebra — que é o comportamento desejado.

---

## 9. Proteção de ambiente

O seed e a migration só rodam com `NEON_BRANCH=development` no ambiente, e abortam com mensagem clara em qualquer outro valor. Antes de agir, imprimem o host do endpoint — nunca a credencial — e o nome da branch.

O seed é idempotente e recriável. Dados fictícios, nenhum nome ou foto real do casal.

`production` não é tocada no B2 sob nenhuma circunstância.
