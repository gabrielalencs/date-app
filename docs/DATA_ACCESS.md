# DATE — Camada de dados

Documento normativo do B4. Acrescenta-se aos sete previstos no `ROADMAP.md`, porque o padrão descrito aqui vale para todos os blocos seguintes e não cabe no `DATABASE.md`, que trata de schema.

---

## 1. O problema que este documento resolve

O B3 entregou `requireAuthorizedContext()`, a única fonte legítima de `workspaceId`. Mas um tipo não impede ninguém de importar `db` e escrever:

```ts
await db.select().from(plans).where(eq(plans.id, id));
```

Isso compila, passa no lint, passa nos testes e vaza o workspace inteiro. Convenção escrita em documento não sobrevive a seis blocos de distância.

Três camadas que se sobrepõem:

1. **Zona de importação** — o handle do banco é inalcançável fora dos módulos de dados.
2. **Assinatura obrigatória** — o contexto é sempre o primeiro parâmetro; `workspaceId` nunca é parâmetro.
3. **Teste com dois workspaces** — prova comportamental de que o de fora é invisível.

Nenhuma sozinha basta. A terceira é a que pega o erro que as outras duas deixarem passar.

---

## 2. Zona de importação

`@/db/client` só pode ser importado por:

- `db/**` — seed, migrate, bootstrap;
- `features/*/data/**` — os módulos de dados.

Em qualquer outro lugar, ESLint `no-restricted-imports` falha o portão. Página, componente, Server Action e helper de UI acessam o banco exclusivamente pelas funções de `features/*/data/`.

Isso não é estilo. É a diferença entre uma consulta sem escopo ser um erro de revisão e ser um erro de build.

---

## 3. Forma das funções de dados

Toda função exportada de `features/*/data/` recebe o contexto como primeiro parâmetro:

```ts
export async function getPlan(
  ctx: AuthorizedContext,
  planId: string,
): Promise<Plan>;

export async function listPlans(
  ctx: AuthorizedContext,
  options: ListOptions,
): Promise<PlanSummary[]>;
```

Proibido, sem exceção:

- `workspaceId: string` como parâmetro de qualquer função de dados;
- ler workspace de `FormData`, query param, segmento de rota, header ou cookie;
- aceitar um objeto de opções que contenha `workspaceId`.

Se uma função precisa do workspace, ela o tira de `ctx`. Se o caller não tem `ctx`, ele não deveria estar consultando o banco.

### Leitura

Todo `where` de entidade começa por `eq(tabela.workspaceId, ctx.workspaceId)`. Sempre, inclusive quando o filtro por id pareceria suficiente.

### Escrita

Nunca buscar por id e depois atualizar. O predicado de workspace vai **dentro** do UPDATE:

```sql
UPDATE plans SET ... WHERE id = $1 AND workspace_id = $2 RETURNING *
```

Zero linhas retornadas é `NotFoundError`. Fazer `select` e depois `update` cria uma janela entre a checagem e a escrita, e a janela é o bug.

---

## 4. Erros de domínio

| Erro | Quando |
|---|---|
| `NotFoundError` | entidade inexistente ou de outro workspace |
| `InvalidTransitionError` | mudança de status não permitida pela máquina |
| `ValidationError` | entrada reprovada pelo Zod |

Entidade de outro workspace responde "não encontrado", nunca "proibido". Distinguir os dois confirma que o id existe, que é informação que o atacante não tinha. É a mesma lógica da mensagem única de login do B3.

---

## 5. Máquina de status

Transições permitidas, validadas no servidor por uma função pura:

| De | Para |
|---|---|
| `idea` | `deciding`, `cancelled` |
| `deciding` | `idea`, `planned`, `cancelled` |
| `planned` | `deciding`, `reserved`, `completed`, `cancelled` |
| `reserved` | `planned`, `completed`, `cancelled` |
| `completed` | — terminal |
| `cancelled` | `idea` |

Qualquer outra combinação é `InvalidTransitionError`, não um no-op silencioso.

`completed` é terminal de propósito: desfazer um date realizado apagaria a memória associada. Se algum dia precisar, vira decisão explícita com migration.

A partir do B6, `deciding → planned` ganha uma pré-condição extra: precisa existir uma opção de data confirmada. A máquina em si não muda; a pré-condição é acrescentada na camada de dados.

`archived_at` é ortogonal a status. Arquivar esconde da lista; cancelar é um estado do plano. Um plano cancelado pode estar visível; um arquivado pode estar em qualquer status.

---

## 6. Eventos

Toda mutação relevante grava uma linha em `activity_events` dentro da **mesma transação** da escrita. Se o evento falhar, a escrita reverte.

O B4 emite `plan_created` e `plan_completed`. Os outros verbos entram com os blocos que os produzem.

Retroencaixar emissão de evento depois de o CRUD existir é muito mais caro que emitir desde a primeira escrita, e é por isso que isso entra agora e não no B10.

---

## 7. Categorias

A coluna `plans.category` continua `text` (D-026). A lista canônica vive na aplicação, em `lib/categories.ts`:

Gastronomia · Cinema e teatro · Música · Viagem · Ar livre · Cultura · Em casa · Outro

A interface só oferece essas. Um valor desconhecido vindo do banco renderiza como **Outro** em vez de quebrar a tela. Acrescentar categoria não exige migration — que é exatamente o motivo de a coluna ser texto.

---

## 8. Revalidação

Server Actions chamam `revalidatePath` nas rotas afetadas. Não existe busca de dados no cliente: nem `useEffect` com `fetch`, nem rota de API para consumo próprio, nem biblioteca de cache no browser.

Server Component lê, Server Action escreve e revalida. É o modelo do framework e não há motivo para fugir dele num app de duas pessoas.

---

## 9. Estrutura

```text
features/
  plans/
    data/
      queries.ts     leituras
      mutations.ts   escritas, transações, eventos
    actions/         Server Actions, Zod no boundary
    components/      UI
lib/
  categories.ts
  plan-status.ts     máquina pura, testável sem banco
```

A máquina de status e as categorias ficam em `lib/` porque são lógica pura, sem banco e sem contexto — e porque a UI precisa delas para renderizar rótulo e ordem.
