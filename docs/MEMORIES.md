# DATE — Memórias

Documento normativo do B9.

---

## 1. Princípio

Quarto e último pilar: **descobrir → decidir → planejar → lembrar**.

E a decisão que organiza o bloco inteiro:

> **A memória não é uma entidade nova. É o plano, depois.**

O título já existe. A data é a opção confirmada do B6. O local está na `plans`. Os gastos reais são do B8. As fotos são a mesma tabela `media` do B5. Nada disso é copiado para lugar nenhum.

A tentação é criar uma tabela `memories` com título, data e local dentro. Ela parece organizada por uma semana, e no primeiro plano editado depois de realizado as duas versões divergem em silêncio, sem ninguém saber qual está certa.

O B2 já acertou isso: `memories` tem apenas `plan_id`, `highlight` e `notes`. Nenhum título, nenhuma data, nenhum lugar.

O que o B9 acrescenta de fato é pequeno: a travessia para `completed`, e a avaliação de cada pessoa. O resto é uma segunda leitura do que já está gravado — como o calendário do B7 foi para as datas.

---

## 2. A travessia para `completed`

É a ação mais séria do produto. `completed` é terminal na máquina de status: não há volta, de propósito, porque desfazer um date realizado deixaria a avaliação e as fotos penduradas num plano que voltou a ser ideia.

### Pré-condição

A regra do B8 continua valendo (D-091), e aqui ela fica evidente:

> Um status só é alcançável quando o fato que ele afirma existe.

`completed` afirma que o date aconteceu. Então a transição exige:

1. **data confirmada**, e
2. essa data num **dia civil não futuro** — hoje conta, amanhã não.

Marcar como realizado um date que é semana que vem não é um caso de uso, é erro de digitação. A comparação é de dia civil, pela aritmética do B7 (`civilDaysBetween`), nunca por subtração de milissegundos.

A pré-condição mora no módulo que o B8 criou, `lib/plan-preconditions.ts`, e é consultada **duas vezes**: para decidir se a interface oferece a ação, e dentro da transação, antes de escrever (D-092).

### Confirmação

Ação irreversível passa por confirmação em **modal** — o segundo uso sancionado do modal neste produto, ao lado da remoção de foto (D-080). O texto diz que não tem volta, em português de gente, sem drama.

### O que muda de lugar

Quando o plano vira `completed`, ele muda de casa: sai de `/ideias` (que lista `OPEN_STATUSES`), sai do "Próximo DATE" da Home, sai dos próximos da agenda, e passa a existir em `/memorias`.

Continua no calendário, na data em que aconteceu — o B7 já decidiu isso (D-079), e é o que transforma a agenda em arquivo.

---

## 3. Terminal não é congelado

Ponto que precisa ficar escrito, porque a palavra "terminal" convida ao erro oposto:

> `completed` é o estado em que **metade deste bloco começa a funcionar**.

- **avaliação**: só existe depois;
- **fotos de memória**: só existem depois;
- **gastos**: continuam editáveis, e o B8 já disse por quê — é depois que se sabe quanto custou;
- **checklist**: leitura.

O que é terminal é a **transição**, não a escrita. Uma regra do tipo "status terminal é somente leitura" mataria a funcionalidade inteira.

Cancelado e arquivado continuam sendo leitura em tudo, como no B8 (D-098).

---

## 4. Avaliação

### O que é de cada pessoa e o que é do casal

Aqui o schema do B2 já tinha resolvido melhor do que a descrição inicial deste bloco, e o schema manda:

| Campo | Onde vive | De quem é |
|---|---|---|
| `rating` (1–5) | `memory_ratings` | **de cada pessoa** |
| `would_repeat` (`yes`/`maybe`/`no`) | `memory_ratings` | **de cada pessoa** |
| `highlight` — a melhor parte | `memories` | **do casal**, uma por plano |
| `notes` — observações | `memories` | **do casal**, uma por plano |

E isso é melhor do que quatro campos por pessoa: a melhor parte de uma noite é uma coisa só, escrita junto, e duplicá-la por pessoa transformaria uma lembrança compartilhada em dois depoimentos paralelos. A nota é de cada um porque opinião é de cada um.

`would_repeat` é **nullable**: dá para dar a nota antes de decidir se repetiria.

### As mesmas regras da votação

Este bloco não reinventa o que o B6 já decidiu sobre duas pessoas opinando:

- **as duas avaliações são sempre visíveis.** Esconder até avaliar evitaria ancoragem, e de novo a transparência é o produto (D-062);
- **não avaliar é estado distinto de dar nota baixa.** A ausência aparece como "Alex ainda não avaliou", não como zero;
- **reenviar a mesma nota a retira**, como no controle de voto;
- a nota é alterável a qualquer momento.

### Média

Com uma pessoa só avaliando, **não existe média** — existe a nota daquela pessoa. Mostrar "4,0" quando metade do casal não respondeu é uma mentira pequena que o bloco de estatísticas depois amplifica.

A média só aparece quando as duas avaliaram.

### Interface

A nota é um **radiogroup com legenda**, não cinco ícones soltos. Cada estrela tem nome acessível próprio ("3 de 5"), e a distinção é por **preenchimento**, não por cor — a mesma exigência do marcador do calendário, verificável em escala de cinza.

"Repetiria?" reaproveita o controle segmentado do B6. Mesmo componente, mesmo comportamento, rótulos próprios.

---

## 5. Fotos: `gallery` é antes, `memory` é depois

O enum de `purpose` do B5 já previa os dois, e a distinção é semântica e vale a pena:

| `purpose` | O quê | Quando |
|---|---|---|
| `cover` | a capa do plano | sempre |
| `gallery` | inspiração, referência, o print do restaurante | antes |
| `memory` | o que vocês fotografaram | depois |

São a mesma tabela, o mesmo fluxo de upload assinado, a mesma rota autenticada de leitura, o mesmo reprocessamento no cliente que descarta EXIF. **Nada do B5 é reescrito** — o que muda é o `purpose` e onde a grade aparece.

`avatar` continua no enum e continua sem uso.

### A capa

Uma foto de memória pode virar a capa do plano, com o `setPlanCover` que já existe.

Vale dizer em voz alta o que isso faz: é o momento em que o card em `/memorias` deixa de mostrar a foto do site do restaurante e passa a mostrar a foto que as duas pessoas tiraram lá. É a promessa da prancha, e é quando o produto para de parecer um catálogo.

---

## 6. A timeline

`/memorias` deixa de ser placeholder. Histórico cronológico de dates realizados, do mais recente para o mais antigo, agrupado por mês.

### Agrupamento

Pelo **dia civil** da data confirmada, com a aritmética do B7. Este bloco não inventa nenhuma função de data: `dayKey`, `monthOf` e `formatMonthTitle` já existem, e a zona do ESLint (D-073) garante que nada escape.

Se isso parecer redundante, lembre do que o B7 provou: um date às 23:00 de 30 de setembro é `2026-10-01T02:00Z`, e agrupado por UTC ele **muda de mês**. A timeline erraria o mês de metade dos dates noturnos.

### Paginação

Por número de página, na URL: `/memorias?pagina=2`.

Cursor seria mais correto num feed vivo, mas aqui a lista é de passado e praticamente imóvel — um plano só entra nela quando alguém marca algo como realizado, o que acontece uma vez por date. Cursor composto de instante mais id numa URL é feio e não compra nada neste caso.

Navegação por link, como o mês da agenda (D-078): a leitura funciona sem JavaScript e cada página é uma URL de verdade. Página inválida cai na primeira, sem erro.

---

## 7. Escala — a tela que só fica lenta com dados que você não tem

O seed tem oito planos. Com oito planos, uma timeline que faz três consultas por linha responde igual a uma que faz uma. **Nada vai ficar vermelho, nunca, na máquina de ninguém.**

Um casal com dois anos de uso tem uns 150 dates realizados. O banco é Neon serverless, em `sa-east-1`, e cada consulta é uma ida e volta pela rede — algo entre 20 e 50 ms. Uma página de 24 memórias que busca capa, contagem de fotos e avaliações por linha faz 72 idas e voltas em vez de 2, e a tela leva três segundos para aparecer.

Então a exigência deste bloco é **medida, não opinião**:

> O número de consultas da timeline é **constante** em relação ao número de planos.

E se prova com um fixture em escala — sessenta planos realizados num workspace de teste —, contando as consultas com um plano e com sessenta e mostrando que o número é o mesmo. **Provar com o seed não prova nada.**

O mesmo vale para o detalhe do plano realizado: avaliações, fotos de memória e gastos são três consultas, não três por linha.

---

## 8. Eventos

Dois verbos, **os dois já existentes no enum desde o B2** — `plan_completed` e `memory_added`. Nenhuma migration, e com isso nenhuma investigação de `ALTER TYPE ... ADD VALUE` dentro de transação.

- `plan_completed` — na travessia para `completed`;
- `memory_added` — na **primeira** avaliação de cada pessoa.

Editar a nota depois **não** emite evento. O feed do B10 conta o que aconteceu, não quantas vezes alguém mudou de ideia sobre um jantar de três meses atrás.

Isso diverge de propósito do `vote_cast` do B6, que emite a cada mudança. Lá a mudança de voto é a negociação acontecendo e faz parte da história; aqui não é. **O B6 fica como está.**

Foto de memória não emite evento, pelo mesmo motivo do checklist no B8 (D-097).

---

## 9. Interface e o texto

### `/memorias`

Fotografia é a protagonista, e esta é a tela onde isso é literal. Grade de capas, cabeçalho de mês em Fraunces, e por card o mínimo: foto, título, dia e cidade. Contagem do mês como meta discreta, se ajudar.

Plano realizado sem foto continua com a capa tipográfica (D-041). É estado definitivo, não espera.

### O detalhe do plano depois de realizado

A página se reorganiza: a seção de datas encolhe para a data que aconteceu, a de reserva vira leitura, e aparece **"Como foi?"** com as duas avaliações, as fotos de memória e o total gasto.

### O texto

Esta é a tela do produto em que a escrita erra mais fácil, para os dois lados.

- *"Nenhuma memória ainda."* — frio, e não ajuda ninguém;
- *"Que tal criar sua primeira memória inesquecível? ✨"* — é exatamente a copy com cara de IA que a seção 11 do spec proíbe, e emoji como ícone por cima.

O estado vazio de `/memorias` é uma frase escrita por uma pessoa, que diz **o que produz memória neste produto**: um date marcado como realizado. Sem exclamação, sem emoji, sem promessa.

O `docs/DESIGN_SYSTEM.md` na versão do R1 manda sobre cor e tipografia.

---

## 10. Banco ou aplicação

O contraste de sempre (D-065):

| Regra | Onde | Por quê |
|---|---|---|
| uma avaliação por pessoa por memória | banco, único em (`memory_id`, `profile_id`) | estado impossível, como o voto do B6 — **já existia** |
| uma memória por plano | banco, único em (`plan_id`) | idem — **já existia** |
| nota entre 1 e 5 | banco **e** Zod | o banco garante, o Zod explica — **CHECK já existia** |
| avaliação só em plano `completed` | aplicação, na transação | depende do status, que muda |
| pré-condição de dia não futuro | aplicação, na transação | depende do relógio |
| tamanho dos textos | aplicação | usabilidade |

O único em `memory_ratings` é por `memory_id`, não por `plan_id` — e como `memories` já é único por plano, o efeito é o mesmo com uma FK a menos.

---

## 11. O que não existe na V1

Estatísticas e gráficos — a seção 4.16 do spec é explicitamente fase posterior, e o bloco dela virá com a ordem de não virar BI corporativo. Também fora: compartilhar memória, exportar, álbum, vídeo, comentário em foto, marcação de pessoas, mapa das memórias, "neste dia há um ano", notificação, avaliação por categoria, e qualquer coisa gerada por IA.

O `/memorias` da V1 é uma coisa só: **o que vocês já fizeram, em ordem, com as fotos grandes.**
