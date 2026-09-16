# DATE — Banco de dados

Substitui a referência a `docs/05_DATABASE.md`. Normativo.

---

## 1. Princípios

**Code-first.** O schema Drizzle é a fonte da verdade. Nada é criado pelo Neon Console. Toda mudança gera migration versionada em Git.

**`workspace_id` em toda tabela de negócio**, mesmo quando o valor é derivável pelo pai. É denormalização deliberada: torna a autorização um predicado único e transforma IDOR em erro de compilação em vez de erro de revisão. Uma consulta que esquece o `workspace_id` deve ser visivelmente errada. As únicas exceções são `profiles`, que representa identidade local espelhada do Neon Auth, e `workspaces`, que é a própria raiz do escopo.

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

Catorze tabelas. O `ROADMAP.md` dizia doze; `profiles` e `memory_ratings` foram acrescentadas pelos motivos acima e abaixo, `reservations` entrou no B8 e `memories` saiu no B9 (D-099).

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

`category` permanece `text`; a taxonomia será validada no boundary da aplicação a partir do B4. `lat` e `lng` usam `double precision`.

### `plan_links`

`id` · `workspace_id` · `plan_id` · `type` (enum) · `url` · `label` · `position` · `created_at`

### `plan_date_options`

`id` · `workspace_id` · `plan_id` · `starts_at` (timestamptz) · `ends_at` (nullable) · `all_day` (boolean) · `note` · `is_confirmed` (boolean, default false) · `created_by` · `created_at`

Índice único parcial em (`plan_id`) onde `is_confirmed` — garante no máximo uma data oficial por plano no banco, não na aplicação. Evita FK circular entre `plans` e `plan_date_options`.

### `plan_date_votes`

`id` · `workspace_id` · `option_id` (FK) · `profile_id` (FK) · `vote` (enum `yes` | `maybe` | `no`) · `created_at` · `updated_at`
Único em (`option_id`, `profile_id`).

### `reservations`

`id` · `workspace_id` · `plan_id` · `status` (enum `pending` | `confirmed` | `cancelled`) · `code` (nullable) · `reserved_time` (`time` nullable) · `url` (nullable) · `notes` (nullable) · `created_by` (FK) · `created_at` · `updated_at`
Único em (`plan_id`): uma reserva por plano.

Acrescentada no B8. `plans.requires_booking` diz se o plano precisa de reserva; esta tabela é a reserva em si, e só existe quando alguém começou a tratá-la.

`reserved_time` é hora de parede — `20:30`, sem dia e sem fuso —, não `timestamptz`. O dia da reserva **é** o dia da data confirmada, por construção: reserva exige data confirmada. Guardar um instante completo duplicaria o dia em dois lugares, e dois lugares divergem — bastaria a data confirmada mudar para a reserva exibir um dia que contradiz o plano, em silêncio.

`confirmed` é o fato que o status `reserved` do plano afirma, e as duas coisas se movem na mesma transação (D-088).

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

`id` · `workspace_id` · `object_key` (text, único) · `thumb_object_key` (text) · `mime_type` · `size_bytes` · `width` · `height` · `purpose` (enum `cover` | `gallery` | `memory` | `avatar`) · `plan_id` (FK nullable) · `position` · `uploaded_by` · `created_at`

As duas chaves são sempre geradas pelo servidor e nunca aceitas do cliente. Formato (D-054, `docs/MEDIA_R2.md` seção 4):

```text
{workspace_id}/{plan_id}/{uuid}/full.webp
{workspace_id}/{plan_id}/{uuid}/thumb.webp
```

Cada foto tem duas saídas: `object_key` guarda a do `full`, `thumb_object_key` a da miniatura. `NOT NULL` nas duas, porque a linha só nasce depois de `HeadObject` confirmar os dois objetos no R2.

O `UNIQUE` de `object_key` é global. Como a chave começa pelo `workspace_id`, não existe unique composto adicional — e ele cobre as duas, porque `full` e `thumb` compartilham o segmento uuid, então thumb duplicado implicaria full duplicado.

Qual foto é a capa de um plano é decidido por `plans.cover_media_id`, não por `purpose`. O `purpose` registra por onde a foto entrou e é normalizado por `setPlanCover` na mesma transação, para que exista no máximo um `cover` por plano.

O formato anterior descrito aqui, `{workspace_id}/{plan_id|misc}/{uuid}.{ext}`, foi substituído no B5 e não existe em lugar nenhum do código.

### `memory_ratings`

`id` · `workspace_id` · `plan_id` (FK) · `profile_id` (FK) · `rating` (smallint 1–5, CHECK) · `would_repeat` (enum `yes` | `maybe` | `no`) · `highlight` · `notes` · `created_at` · `updated_at`
Único em (`plan_id`, `profile_id`).

Uma avaliação por pessoa por plano, existindo só depois de `completed` — e a checagem do status vive na aplicação, dentro da transação, porque status muda.

`would_repeat`, `highlight` e `notes` são nullable: a avaliação nasce pela nota, que é NOT NULL, e o resto vem depois se vier.

Tabela separada de `plans` porque são duas pessoas avaliando de forma independente, e colar isso em colunas `rating_user_a`/`rating_user_b` seria exatamente o tipo de atalho que trava a V2.

**Não existe tabela `memories`.** O B2 criou uma, com `highlight` e `notes` dentro, compartilhados pelo plano; a seção 4 do `docs/MEMORIES.md` põe os dois na avaliação de cada pessoa, o que esvaziava aquela tabela de conteúdo próprio. Ela foi dropada na migration `0004` (D-099). Memória não é entidade nova: é o plano, depois — título, data, local, gastos e fotos continuam onde já estavam (D-100).

### `activity_events`

`id` · `workspace_id` · `actor_profile_id` · `verb` (enum) · `subject_type` · `subject_id` (uuid) · `metadata` (jsonb) · `created_at`

Append-only. Sem update, sem delete, sem FK para o sujeito — o evento sobrevive ao plano apagado.

Na V1, append-only é contrato da camada de aplicação: a camada de acesso não expõe update/delete de `activity_events`. Não há trigger ou RLS para isso nesta fase.

---

## 5. Enums

São nove enums PostgreSQL. `vote_value` e `repeat_answer` permanecem tipos distintos porque representam conceitos diferentes e podem divergir no futuro.

- `plan_status`: `idea` · `deciding` · `planned` · `reserved` · `completed` · `cancelled`
- `vote_value` e `repeat_answer`: `yes` · `maybe` · `no`
- `link_type`: `instagram` · `tiktok` · `website` · `google_maps` · `waze` · `booking` · `ticket` · `lodging` · `other`
- `reaction_type`: `favorite` · `want_a_lot`
- `media_purpose`: `cover` · `gallery` · `memory` · `avatar`
- `member_role`: `owner` · `member`
- `reservation_status`: `pending` · `confirmed` · `cancelled`
- `activity_verb`: `plan_created` · `date_suggested` · `vote_cast` · `date_confirmed` · `booking_updated` · `plan_completed` · `memory_added` · `want_a_lot`

Enum de Postgres, não `text` com CHECK. Alterar enum exige migration, o que é a intenção.

---

## 6. Índices

Além das PKs e dos únicos já citados: `workspace_id` em todas as tabelas de negócio; (`workspace_id`, `status`) e (`workspace_id`, `created_at DESC`) em `plans`; (`workspace_id`, `starts_at`) em `plan_date_options`; (`plan_id`) em toda tabela filha, único em `reservations`; (`workspace_id`, `created_at DESC`) em `activity_events`.

O (`workspace_id`, `status`) de `plans` é o índice que a timeline do B9 usa: ela lê `completed` não arquivado com `inner join` na opção confirmada, em duas consultas fixas, independentemente de quantos planos existirem (D-108).

Índice em coluna de FK não é automático no Postgres. Criar explicitamente.

---

## 7. Driver e transações

O produto precisa de transação de verdade: registrar voto e mover status, reordenar checklist, confirmar data e emitir evento. Isso tem que ser atômico.

O runtime usa `drizzle-orm/neon-serverless` com `Pool` de `@neondatabase/serverless`, combinação que suporta transações interativas. `DATABASE_URL` aponta para o endpoint pooled.

Migrations e seed usam `DATABASE_URL_UNPOOLED`, a connection string direta. São duas variáveis distintas no ambiente porque esses processos finitos não usam o pooler do runtime.

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
│   └── memories.ts    memory_ratings, activity_events
├── migrations/        gerado pelo drizzle-kit, versionado
└── seed.ts
```

`db/client.ts` carrega `server-only`. Se alguém importar do cliente, o build quebra — que é o comportamento desejado.

---

## 9. Proteção de ambiente

O seed e a migration só rodam com `NEON_BRANCH=development` no ambiente, e abortam com mensagem clara em qualquer outro valor. Antes de agir, imprimem o host do endpoint — nunca a credencial — e o nome da branch.

O seed é idempotente e recriável. Dados fictícios, nenhum nome ou foto real do casal.

`production` não é tocada no B2 sob nenhuma circunstância.
