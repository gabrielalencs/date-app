# DATE — Planejamento: reserva, checklist e gastos

Documento normativo do B8.

---

## 1. Princípio

Terceiro pilar do `DATE_PROJECT_SPEC.md`: **descobrir → decidir → planejar → lembrar**.

O B6 fechou o "decidir": existe uma data. Este bloco é o que acontece entre a data existir e o date acontecer — reservar a mesa, lembrar de levar a garrafa, e saber quanto custou.

Três funcionalidades pequenas e um ponto de arquitetura que vale mais que as três: **é aqui que a máquina de status deixa de ser etiqueta e vira afirmação sobre o mundo.** Um plano em `reserved` afirma que existe uma reserva. Se a etiqueta puder ser posta sem o fato, ela mente, e um produto que mente sobre estar reservado é pior que um produto sem reserva.

---

## 2. Dinheiro — a parte perigosa

Esta seção vale mais que as outras juntas, porque nada aqui estoura. Dinheiro errado não lança exceção; ele aparece na tela com um número plausível.

### Centavos inteiros, sempre

Valor monetário é `integer` de centavos, no banco, na camada de dados, no domínio e no componente. Nunca `float`, nunca `numeric` convertido em `number`, nunca reais fracionários.

Soma de inteiros é exata. Não existe arredondamento em lugar nenhum deste bloco — e a razão é a mesma pela qual o spec proíbe virar Splitwise: **não há divisão.** A ausência de rateio não é só decisão de produto, é o que mantém a aritmética exata de ponta a ponta.

### A unidade mora no nome

`lib/format.ts` exporta `formatBRL(value: number)` e não diz se `value` é real ou centavo. Essa ambiguidade é exatamente como dinheiro erra por cem — e o produto já a tinha, com `formatBRL(plan.estimatedBudgetCents / 100)` em dois componentes: o nome da variável diz centavos, a chamada passa reais, e só a divisão solta no meio segura a diferença.

O dono do dinheiro passa a ser `lib/money.ts`, e toda função carrega a unidade no nome: `parseBRLToCents`, `formatCents`, `centsToInputValue`, `sumCents`, `MAX_CENTS`. `formatBRL` sai de cena; todo uso existente é migrado.

### O parse é o lugar onde erra

Três erros que se escondem um atrás do outro:

```text
parseFloat("1.234,56")            →  1.234        um real e vinte e três centavos
<input type="number"> com vírgula →  value === "" campo vazio, em pt-BR, no Chrome
0.1 + 0.2                         →  0.30000000000000004
```

Nenhum dos três quebra nada. O primeiro grava R$ 1,23 onde deveria gravar R$ 1.234,56.

Por isso o campo é `type="text"` com `inputMode="decimal"` — nunca `type="number"`, que em pt-BR recusa a vírgula que o teclado do celular oferece, tem spinner que ninguém quer e aceita notação científica.

### As regras do parse

Determinísticas, e recusam o ambíguo em vez de adivinhar.

1. `R$`, espaços e espaço não separável são descartados.
2. Havendo vírgula: a vírgula é o decimal, pontos antes dela são milhar, e a parte decimal tem 1 ou 2 dígitos.
3. Sem vírgula, com pontos: se **todos** os grupos depois dos pontos tiverem três dígitos, os pontos são milhar; se houver **um** ponto com 1 ou 2 dígitos depois, ele é decimal; qualquer outra combinação é recusada.
4. Só dígitos: reais inteiros.
5. Negativo, vazio, notação científica ou qualquer outro caractere: recusado.
6. Acima de `MAX_CENTS`: recusado, com mensagem própria.

A tabela abaixo é o teste:

| Entrada | Centavos | Por quê |
|---|---|---|
| `80` | 8000 | |
| `80,50` | 8050 | |
| `1.234,56` | 123456 | ponto milhar, vírgula decimal |
| `1.234` | 123400 | três dígitos depois do ponto é milhar, e em pt-BR isso é mil duzentos e trinta e quatro |
| `1.23` | 123 | dois dígitos não é milhar |
| `1234.56` | 123456 | idem |
| `R$ 1.234,56` | 123456 | prefixo e espaço descartados |
| `0,05` | 5 | |
| `12.3456` | recusa | não é milhar nem decimal |
| `1,234` | recusa | três casas decimais |
| `1.234.567,89` | 123456789 | |
| `-10` | recusa | gasto negativo não existe neste produto |
| `1e3` | recusa | |
| vazio | recusa | |
| `abc` | recusa | |

Mensagem de recusa escrita por gente, que ensina o formato em vez de dizer "valor inválido".

### A conversão também não usa float

`parseBRLToCents` monta o inteiro a partir dos dígitos, não de `Number(x) * 100`. Multiplicar float por cem e arredondar acerta nos casos comuns e é a porta pela qual o float volta.

### Teto

`integer` do Postgres para em 2.147.483.647 centavos, ou R$ 21.474.836,47. `MAX_CENTS` valida isso no Zod, com mensagem própria, para o banco nunca ser quem recusa — erro de driver não tem como ser explicado a quem digitou.

### Zona no ESLint

Fora de `lib/money.ts`, ficam proibidos `parseFloat`, `Number.parseFloat` e `toFixed`. Mesma forma do D-037, do D-059 e do D-073, pelo mesmo motivo.

A zona vale para `app/`, `components/`, `features/`, `lib/` e `db/`. `tests/` fica de fora: medir pixel com `parseFloat` em navegador é uso legítimo e não tem nada a ver com dinheiro.

---

## 3. Reserva

Uma reserva por plano, na V1. **A tabela não existe**: o B2 criou `plans.requires_booking` e mais nada. É a única migration deste bloco.

### Campos

- **requer reserva** — `plans.requires_booking`, que já existe. Não requer, a seção inteira não existe na tela;
- **estado** — `pending`, `confirmed`, `cancelled`;
- **código** — o localizador, o número da mesa, o que o lugar mandou;
- **horário** — opcional, e distinto da data confirmada: o restaurante marcou 20h30 e a data do plano é o dia;
- **link** — a página da reserva;
- **observações**.

`cancelled` cobre também "tentamos e não tinha vaga". É informação que muda a decisão de data, e o lugar dela é o campo de observações, não um quarto estado.

### O horário é hora de parede, não instante

`reserved_time` é `time` — `20:30`, sem dia e sem fuso —, não `timestamptz`.

O dia da reserva **é** o dia da data confirmada, por construção: reserva exige data confirmada (seção 8). Guardar um instante completo duplicaria o dia em dois lugares, e dois lugares divergem: bastaria a data confirmada mudar para a reserva passar a exibir um dia que contradiz o plano, em silêncio.

Hora de parede não tem esse problema porque não carrega dia nenhum. É também literalmente o que o restaurante disse.

### Sem anexo

Voucher em arquivo fica fora, como o `DATE_PROJECT_SPEC.md` seção 4.9 já previa. Código e link resolvem o caso real; arquivo é mídia, e mídia tem bloco próprio.

---

## 4. O acoplamento com a máquina de status

A regra geral, que o B6 começou e este bloco fecha:

> **Um status só é alcançável quando o fato que ele afirma existe. E transição manual não desfaz fato de domínio.**

`planned` afirma que há data confirmada. `reserved` afirma que há reserva confirmada.

### Automáticas, na mesma transação

- confirmar a reserva em `planned` → `reserved`;
- desfazer a reserva (de `confirmed` para `pending` ou `cancelled`) em `reserved` → `planned`.

Simetria exata com o que o B6 fez com a confirmação de data. Toda transição automática emite evento.

### Pré-condições do movimento manual

- `deciding` → `planned` exige data confirmada. Já existe, do B6;
- `planned` → `reserved` exige reserva confirmada;
- `reserved` → `planned` exige que **não** haja reserva confirmada.

A terceira é a que fecha o loop. Quem desfaz reserva é a reserva, não o botão de status.

### O que isso conserta no B6

O `unconfirmDateOption` recusa em `reserved` com a mensagem "Volte para Planejado antes de desmarcar a data". Com a pré-condição nova, esse caminho deixa de existir: o botão de voltar para planejado é recusado enquanto a reserva estiver confirmada.

A ordem correta passa a ser de fora para dentro — desfaz a reserva, o plano volta a `planned` sozinho, e só então a data se desmarca. A mensagem do B6 precisa dizer isso: **"Esse plano tem reserva. Desfaça a reserva antes de mudar a data."**

### Onde as pré-condições moram

`lib/plan-status.ts` continua puro: ele conhece o grafo, não conhece o mundo. As pré-condições vivem num lugar só, no servidor, e são usadas duas vezes:

1. para calcular **quais transições oferecer** na interface;
2. dentro da transação da mutation, de novo, antes de escrever.

As duas, não uma. A interface que não pergunta oferece um botão que falha; a mutation que não pergunta confia no frontend, e o frontend nunca é fonte de autoridade (`CLAUDE.md`).

---

## 5. Checklist

A tabela `checklist_items` **já existe** desde o B2, com `label`, `position`, `done_at` e `done_by` — e com o CHECK `checklist_items_done_together` já no banco. Nenhuma migration.

- qualquer membro marca e desmarca;
- marcar grava **quem** e **quando**;
- `done_by` e `done_at` são nulos juntos ou preenchidos juntos. Isso é invariante de correção e vive no banco, como o único parcial de `is_confirmed` (D-065). O teto de itens por plano é usabilidade e vive na aplicação;
- ordenação por posição inteira, reordenada por par de setas, não por arrastar — distinguir arrasto de rolagem em toque exige biblioteca, e o par de setas funciona no teclado (decisão do B5, mantida);
- apagar um item não reindexa nada que importe.

Quem marcou aparece na linha, discreto: "Nina, ontem". É o único lugar do produto onde a outra pessoa aparece por nome fora da votação, e é o que faz o checklist parecer coisa de dois.

---

## 6. Gastos

A tabela `expenses` **já existe** desde o B2, com `label`, `amount_cents` inteiro, `paid_by` e `spent_on`. Nenhuma migration.

- descrição, valor em centavos, **quem pagou** opcional;
- o total é soma de inteiros;
- o orçamento estimado do plano aparece ao lado do total.

### "Quem pagou" é registro, não contabilidade

Não existe saldo, não existe divisão, não existe "fulano deve", não existe acerto. O campo serve para lembrar quem passou o cartão, e para nada mais.

Se em algum momento parecer natural somar por pessoa e mostrar a diferença, é aí que o produto vira Splitwise — e o spec proíbe.

### Orçamento estimado

`plans.estimated_budget_cents` é **inteiro de centavos, nulo quando não informado** — valor, não faixa. O `$ / $$ / $$$` da prancha não chegou ao schema.

Então o resumo mostra a diferença de verdade: "R$ 320,00 de R$ 280,00 estimados · R$ 40,00 acima". Sem orçamento informado, mostra só o total — e não inventa comparação com um número que não existe.

### Depois do date

Gasto continua editável em `completed`. É justamente depois que se sabe quanto custou.

---

## 7. Eventos

Só a reserva entra no `activity_events`. O verbo é **`booking_updated`**, que já existe no enum desde o B2 — não é preciso migration, e com isso não é preciso investigar como `ALTER TYPE ... ADD VALUE` se comporta dentro de transação.

Marcar item de checklist e lançar gasto **não** emitem evento. O feed do B10 é a história do plano — criou, sugeriu, votou, confirmou, reservou, concluiu, lembrou —, não o log de edição. Quatro itens marcados num sábado à noite afogariam a história inteira.

---

## 8. Disponibilidade por status

| | `idea` / `deciding` | `planned` | `reserved` | `completed` | `cancelled` / arquivado |
|---|---|---|---|---|---|
| Checklist | sim | sim | sim | sim | leitura |
| Gastos | sim | sim | sim | sim | leitura |
| Reserva | não | sim | sim | leitura | leitura |

Reserva exige data confirmada, porque reserva sem data não é reserva. Gasto e checklist não exigem nada: dinheiro sai antes da data com mais frequência do que se gostaria, e "levar guarda-chuva" é um pensamento que ocorre quando ocorre.

Plano cancelado ou arquivado não aceita escrita em nenhuma das três.

---

## 9. Interface

As três seções entram no detalhe do plano, e a página já tem capa, título, datas e fotos. Densidade é o risco.

- **Seção só existe quando tem o que mostrar.** Reserva não requerida não aparece. Checklist e gastos vazios aparecem como uma linha e um botão de acrescentar, não como bloco vazio com borda tracejada. Três caixas vazias empilhadas são o "cards por todo lado sem hierarquia" que a seção 11 do spec proíbe;
- **desktop**: a coluna lateral recebe status e reserva; a coluna principal segue com capa, título, datas, fotos, checklist e gastos;
- **mobile**: tudo empilhado, na ordem em que se usa — reserva antes de checklist, checklist antes de gastos;
- **valor em Inter tabular**, alinhado à direita na lista de gastos. Coluna de número que não alinha é a coisa que mais rápido faz um produto parecer amador;
- item de checklist: o alvo de toque cresce por padding invisível no label, nunca pelo quadrado (design system, e a medição do B5 já tropeçou nisso uma vez);
- sem modal. Formulário de gasto e de item entram embutidos, como o de sugerir data. Modal aqui é só confirmação destrutiva (D-080).

O `docs/DESIGN_SYSTEM.md` na versão saída do R1 manda sobre qualquer coisa que este documento diga de cor ou tipografia.

---

## 10. Banco ou aplicação

O contraste do D-065, aplicado de novo:

| Regra | Onde | Por quê |
|---|---|---|
| `done_by` e `done_at` nulos juntos | banco | estado impossível — **já existia** |
| uma reserva por plano | banco | estado impossível |
| valor não negativo | banco **e** Zod | o banco é a garantia, o Zod é a mensagem |
| teto de itens de checklist | aplicação | usabilidade, e mudar de ideia não deve exigir migration |
| teto de valor | aplicação | idem, mais a mensagem escrita por gente |
| pré-condição de status | aplicação, dentro da transação | depende de outras tabelas |

---

## 11. O que não existe na V1

Divisão de conta, saldo entre as duas pessoas, acerto, múltiplas moedas, conversão, anexo de voucher, reserva múltipla por plano, lembrete de reserva, integração com qualquer serviço de reserva, checklist reaproveitável entre planos, modelo de checklist, subitem, prazo por item, categoria de gasto, gráfico de gasto.

O gráfico é B-mais-tarde e vem no bloco de estatísticas, que o spec já manda manter longe de BI corporativo.
