# DATE — Calendário

Documento normativo do B7.

---

## 1. Princípio

O calendário não é uma funcionalidade nova: é uma segunda leitura do que o B6 já grava. Ele responde a uma pergunta que a tela do plano não responde — "como está o nosso mês?" — e é a única tela do produto onde as datas de planos diferentes se encontram.

Por isso ele não cria nada. Ele mostra, agrupa e leva de volta ao plano. Toda escrita continua acontecendo no detalhe do plano, onde já está testada.

Consequência direta: a `/agenda` é navegação, não estado de cliente. Mês e dia moram na URL, a página é Server Component, e recarregar, compartilhar ou voltar no histórico funciona sem nenhum cuidado especial.

---

## 2. Tempo, de novo — e a armadilha mudou de lugar

O B6 fechou a **formatação** dentro do `lib/datetime.ts` (D-059). O B7 abre um segundo buraco, que a zona atual não cobre: **agrupamento e aritmética**.

### A regra em uma frase

Converta para dia civil primeiro; depois de estar em dia civil, `Date.UTC` é uma calculadora de calendário e pode ser usada à vontade.

O que é proibido é o inverso: usar UTC para **descobrir que dia é**.

```text
PROIBIDO                                   SANCIONADO
instante → getUTCDate()                    instante → toCivil() → {y,m,d}
instante → toISOString().slice(0,10)       {y,m,d} → Date.UTC(y,m-1,d) → somar dias
instante → getDate()  (fuso do processo)   {y,m,d} → Date.UTC(...).getUTCDay() → dia da semana
```

O `civilDaysBetween` que já existe faz exatamente isso e é o modelo a seguir: ele converte os dois lados para dia civil e só então usa `Date.UTC` como índice.

### A chave do dia

`lib/datetime.ts` passa a exportar `dayKey(instant): string`, o `yyyy-MM-dd` daquele instante no fuso do app. É a **única** forma autorizada de agrupar qualquer coisa por dia.

`toDateInputValue` já faz isso; `dayKey` pode ser o mesmo corpo com outro nome, mas precisa do nome próprio — ninguém vai agrupar um calendário com uma função chamada "valor de input de formulário".

### Por que isso é a armadilha deste bloco

Um date às 23:00 de 30 de setembro é `2026-10-01T02:00Z`.

Agrupado por UTC, ele aparece em 1º de outubro. E a maior parte dos dates deste produto é à noite.

Pior: **o seed não pega isso.** As datas do seed estão em 09:00, 11:00 e 20:00 de São Paulo; nenhuma cruza a meia-noite UTC. Uma grade inteira construída com `toISOString().slice(0,10)` passa em todos os testes atuais, passa na sua máquina, passa na Vercel, e erra o dia de metade dos dates reais assim que alguém marcar um jantar às 21h.

Então este bloco exige um dado de teste que o seed não tem: uma opção às 23:30 do último dia de um mês, provada na célula certa, com a asserção rodando em `TZ=UTC`.

### A janela da consulta

Mesmo erro, nas duas bordas.

A grade mostra dias de meses vizinhos. A janela vai da meia-noite da primeira célula à meia-noite do dia seguinte à última célula, ambas calculadas com `startOfDayInApp`, e o intervalo é **semiaberto**:

```text
inicio = startOfDayInApp(primeiraCelula)              // ex.: 2026-08-31T03:00Z
fim    = startOfDayInApp(addCivilDays(ultimaCelula, 1))

where starts_at >= inicio and starts_at < fim
```

Com `Date.UTC(2026, 7, 31)` no lugar de `startOfDayInApp`, a janela começa três horas cedo demais e traz um date do dia 30 à noite como se fosse do dia 31 — e perde, na outra ponta, o date da última célula depois das 21h.

O índice `plan_date_options_workspace_starts_at_idx` já existe e é exatamente isto: `(workspace_id, starts_at)`. A consulta tem que usá-lo.

### Zona do ESLint, ampliada

A zona do D-059 ganha, fora do `lib/datetime.ts`:

- os leitores UTC de `Date`: `getUTCDate`, `getUTCDay`, `getUTCMonth`, `getUTCFullYear`, `getUTCHours`;
- o recorte de ISO, por `no-restricted-syntax`: qualquer `.toISOString()` seguido de `.slice`, `.substring`, `.substr` ou `.split`.

`toISOString()` sozinho continua permitido — é serialização legítima. O que se proíbe é usá-lo para responder "que dia é".

Como sempre: prove que a zona barra, com um arquivo temporário, e apague o arquivo.

### Teste

Toda função nova entra no `pnpm test:tz`, que roda em `TZ=UTC`, `TZ=America/New_York` e no fuso local. O runner passa a incluir a suíte do calendário na lista padrão.

---

## 3. A grade

### Início da semana

**Segunda-feira.** É o que a prancha da marca mostra (SEG TER QUA QUI SEX SÁB DOM) e é como se fala de fim de semana: sábado e domingo ficam juntos no fim da linha, que é onde a maior parte dos dates cai.

Índice 0 = segunda, 6 = domingo. Nada de `getDay()` cru, que devolve 0 = domingo e produz um erro de um dia que ninguém vê até o mês começar num domingo.

### Seis linhas, sempre

42 células, independentemente do mês.

Um mês de 28 dias começando numa segunda cabe em 4 linhas; um de 31 começando num domingo precisa de 6. Grade de altura variável faz o botão de "mês seguinte" escorregar sob o dedo entre um toque e o outro, e navegar é o gesto principal desta tela.

O custo é um fevereiro ocasional mostrando duas semanas de março em tom apagado. É um custo pequeno e previsível.

### Células de fora do mês

Aparecem apagadas, mas o conteúdo delas é **real**: se há um date no dia 31 de agosto e a grade de setembro mostra aquela célula, o date aparece nela. Meio-mês vazio por decisão de implementação seria mentira visual.

### Só células com conteúdo são links

Uma grade de 42 células linkáveis são 42 paradas de tabulação antes de chegar ao resto da página. Dia sem nada não tem detalhe para abrir.

Então: célula com pelo menos uma opção é um link para `?dia=...`; célula vazia é texto.

Isso decide, de tabela, que "adicionar plano a partir do dia selecionado" fica **fora** deste bloco — ela tornaria todas as 42 células interativas para um ganho que `/novo` + sugerir data já entrega. A linha da seção 4.8 do `DATE_PROJECT_SPEC.md` precisa registrar o adiamento em vez de ficar contradita em silêncio.

---

## 4. A consulta

**Uma** consulta de opções por render da página. Nunca uma por célula, nunca uma por plano.

```text
plan_date_options  ⋈  plans
  workspace do contexto em primeiro lugar
  starts_at dentro da janela semiaberta
  plano não arquivado
  status do plano ≠ cancelled
  ordenado por starts_at
```

Devolve o mínimo que a célula e o painel precisam: id da opção, id/título/status/categoria/capa do plano, `starts_at`, `all_day`, `is_confirmed`.

O agrupamento em células é **função pura, separada da consulta**: recebe a grade e a lista de entradas, devolve as 42 células com suas entradas. É essa função que os testes de fuso atacam, sem banco.

### Reuso, não duplicação

`getNextConfirmedDate` do B6 vira caso particular de `listUpcomingConfirmed(ctx, now, limit)`. A Home continua com o comportamento dela; a faixa de "próximos" da agenda consome a mesma função com outro limite. Duas consultas quase iguais divergem em seis meses.

---

## 5. O que aparece

| | Aparece? | Como |
|---|---|---|
| Opção confirmada | sim | destaque |
| Opção candidata | sim | secundário |
| Plano `completed` | sim | na data em que aconteceu |
| Plano `cancelled` | não | |
| Plano arquivado | não | |

Um date realizado continuar no calendário não é sujeira: é o registro de que aquele sábado teve alguma coisa. O produto vira arquivo de memória, e o calendário é o primeiro lugar onde isso aparece.

Candidatas aparecem porque ver onde as opções caem no mês é o motivo de existir da tela. Se a densidade ficar ilegível com muitas candidatas, **reporte** — não invente um alternador para esconder.

---

## 6. Navegação

Tudo na URL:

```text
/agenda?mes=2026-09
/agenda?mes=2026-09&dia=2026-09-14
/agenda?mes=2026-09&categoria=gastronomia
```

- `mes` é `yyyy-MM`, interpretado como par civil, sem passar por `new Date()`;
- ausente, inválido, `2026-13`, `abc` → mês corrente, **sem erro**. URL é entrada de usuário, e a resposta a uma entrada ruim aqui é o estado padrão, não uma tela de erro;
- `dia` fora do mês visível é ignorado;
- Zod no boundary, como em toda entrada.

Anterior, seguinte e "Hoje" são **links**, não botões com estado. Cada mês é uma URL de verdade, a leitura funciona sem JavaScript (D-056 vale para escrita), e o histórico do navegador se comporta.

"Hoje" é o dia civil de `now`, e `now` desce do servidor como no B6 — um `new Date()` em componente cliente divergiria do HTML do servidor e produziria erro de hidratação.

---

## 7. O dia selecionado

**Painel, não modal.** Abaixo da grade no mobile, ao lado no desktop.

Modal no DATE é só para confirmação destrutiva — o diálogo de remover foto do R1 é o caso. Conteúdo, formulário e detalhe moram em rota ou painel, porque não são interrupção, são destino.

Cada item do dia traz:

- miniatura da capa, ou a capa tipográfica quando não há foto (D-041);
- título do plano, em Fraunces;
- horário em Inter tabular, ou "Dia inteiro";
- a pill de status;
- o rótulo de consenso quando é candidata — reaproveitando o componente do B6, não reescrevendo a regra;
- link para `/planos/[id]`.

Dia sem nada: uma linha escrita por gente, e o convite para criar. Nada de retângulo tracejado vazio.

---

## 8. Interface

A referência é a prancha da agenda em `public/brand/reference/`. Ela é **aspiracional**: Semana, Lista, Favoritos e Viagens estão na imagem e não existem na V1. O que se copia dali é a linguagem — grade respirada, tipografia editorial no título do mês, fotografia como contrapeso à densidade, coral pontual.

O `docs/DESIGN_SYSTEM.md` atualizado pelo R1 manda sobre qualquer coisa que este documento diga de cor ou tipografia.

Uma grade de calendário é, por natureza, a coisa mais próxima de planilha que este produto vai ter. É justamente por isso que a página precisa do contrapeso editorial ao lado — sem ele, a agenda é a tela onde o DATE volta a parecer painel administrativo.

### Densidade da célula

- **≥ 768px:** até 3 entradas com rótulo textual curto, e "+N" quando sobra;
- **< 768px:** só marcadores, no máximo 3 e um "+".

### Confirmada versus candidata

A distinção é de **forma**, não só de cor: marcador preenchido para confirmada, contornado para candidata. Cor de categoria, se entrar, é reforço decorativo.

Isso é verificável: uma captura em escala de cinza tem que continuar distinguindo as duas. É o item mais fácil de errar aqui, porque em cor a diferença parece óbvia.

---

## 9. Mobile — a restrição que decide o layout

Em 320px, sete colunas com o padding padrão do shell dão células **abaixo de 44px**. O alvo de toque mínimo é requisito, não meta.

```text
320px − (padding do shell × 2) ÷ 7  <  44px
```

Então a grade sai do padding do container no mobile, encostando nas bordas da viewport, ou a página declara um padding próprio menor. Qual dos dois é decisão de implementação; o que não é negociável é a medida final, e ela tem que ser **medida em navegador**, não estimada.

---

## 10. Acessibilidade

A grade do mês é dado tabular: linhas são semanas, colunas são dias da semana. Então é `<table>`, não `<div role="grid">`.

- `<caption>` com o mês por extenso, visualmente oculto;
- `<th scope="col">` com `<abbr title="Segunda-feira">Seg</abbr>`;
- cada dia com conteúdo é um link com nome acessível completo: `aria-label="14 de setembro, 2 planos, 1 confirmado"`. "14" sozinho não diz nada fora do contexto visual;
- hoje leva `aria-current="date"`;
- sem roving tabindex e sem atalhos de teclado próprios na V1. São links; Tab basta.

---

## 11. O que não existe na V1

Visão de semana, visão de lista, arrastar para mover data, recorrência, exportação, `.ics`, integração com calendário externo, convite, lembrete, notificação, criação a partir da célula, mais de um fuso.

A `/agenda` deixa de ser placeholder e passa a ser exatamente uma coisa: **o mês do casal, com o que já existe dentro dele.**
