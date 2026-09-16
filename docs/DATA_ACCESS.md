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

Nunca buscar por id **sem trava** e depois atualizar. O predicado de workspace vai **dentro** do UPDATE:

```sql
UPDATE plans SET ... WHERE id = $1 AND workspace_id = $2 RETURNING *
```

Zero linhas retornadas é `NotFoundError`. Um `select` sem trava seguido de `update` cria uma janela entre a checagem e a escrita, e a janela é o bug.

#### Exceção sancionada: `FOR UPDATE` dentro de transação (D-055)

O proibido é a janela, não a leitura. Quando a escrita depende do estado atual — validar uma transição de status, conferir uma pré-condição, calcular a próxima `position` —, o caminho correto é ler **com trava de linha, dentro da mesma transação**:

```ts
await db.transaction(async (tx) => {
  const [atual] = await tx
    .select({ id: plans.id, status: plans.status })
    .from(plans)
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
    .for("update")
    .limit(1);

  if (!atual) throw new NotFoundError("Plano");
  assertTransition(atual.status, proximo);

  await tx
    .update(plans)
    .set({ status: proximo })
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)));
});
```

A linha fica travada da leitura até o commit, então não existe janela para outra transação escrever no meio. Três condições, todas obrigatórias:

1. a leitura usa `.for("update")`;
2. leitura e escrita acontecem na **mesma** transação;
3. o predicado de workspace continua nas duas, e não só na leitura.

Faltando qualquer uma das três, volta a ser o padrão proibido. Ler sem trava, fechar a transação entre as duas, ou confiar no `select` para o escopo e deixar o `update` só com o id — nenhum dos três é aceitável.

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

Terminal na **transição**, não na escrita (D-103). É depois de `completed` que a avaliação e as fotos de memória passam a existir, e os gastos continuam editáveis porque é depois que se sabe quanto custou. Uma regra do tipo "status terminal é somente leitura" mataria metade do B9. Quem é leitura em tudo é `cancelled` e o plano arquivado.

A partir do B6, `deciding → planned` ganha uma pré-condição extra: precisa existir uma opção de data confirmada. A máquina em si não muda; a pré-condição é acrescentada na camada de dados.

Desde o B8 as pré-condições moram todas em `lib/plan-preconditions.ts`, puro, recebendo os fatos prontos em `PlanFacts`, e são consultadas **duas vezes**: pela interface, para decidir quais botões existem, e dentro da transação da mutation, antes de escrever. O B9 acrescentou o terceiro fato, `confirmedDateHasArrived`, e as duas recusas de `completed`: sem data confirmada, e com data confirmada num dia civil ainda por vir. A comparação é de dia civil pela aritmética do B7, nunca por subtração de milissegundos — um date hoje às 20h tem `starts_at` no futuro a tarde inteira e precisa ser aceito igual (D-102).

`archived_at` é ortogonal a status. Arquivar esconde da lista; cancelar é um estado do plano. Um plano cancelado pode estar visível; um arquivado pode estar em qualquer status.

---

## 6. Eventos

Toda mutação relevante grava uma linha em `activity_events` dentro da **mesma transação** da escrita. Se o evento falhar, a escrita reverte.

O B4 emite `plan_created` e `plan_completed`. Os outros verbos entram com os blocos que os produzem.

Nem toda escrita emite. A régua, fixada do B8 ao B9: entra no feed o que aconteceu com o date, não o log de edição. Checklist, gasto e foto de memória não emitem (D-097, D-110); a **primeira** avaliação de cada pessoa emite `memory_added`, e editar a nota depois não emite (D-109). O `vote_cast` do B6, que emite a cada mudança, é a exceção deliberada: lá a mudança de voto é a negociação acontecendo.

O B10 passou a consumir esse histórico. Favoritar continua silencioso; acrescentar `want_a_lot` emite na mesma transação da reação, enquanto retirar preserva o evento antigo. Os três escritores de data passaram a carregar `startsAt` como fato mínimo. Não existe backfill do histórico anterior: evento antigo sem esse fato degrada sem inventar data (D-112, D-116 a D-118).

O feed lê total e página em duas consultas constantes. O último voto por ator e opção é colapsado por janela SQL sem apagar o histórico; nenhuma resolução acontece linha por linha (D-119, D-120).

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
