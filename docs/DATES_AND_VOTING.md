# DATE — Datas e votação

Documento normativo do B6.

---

## 1. Princípio

Este é o núcleo do produto. Um plano sem data é uma ideia; a data é o que transforma "a gente devia ir" em algo que acontece.

O fluxo, da seção 3 do `DATE_PROJECT_SPEC.md`:

```text
IDEIA → datas possíveis → votos dos dois → data confirmada → PLANEJADO
```

Duas pessoas, nenhuma negociação assíncrona complexa, nenhum convite, nenhum calendário externo. A decisão é pequena e o produto tem que fazê-la parecer pequena.

---

## 2. Tempo — a parte difícil

Esta seção vale mais que todas as outras juntas, porque é a única onde o erro não aparece na máquina de quem desenvolve.

### Armazenamento

`timestamptz`, sempre UTC, como já diz o D-025. Isso não muda.

### Apresentação

Sempre `America/Sao_Paulo`, declarado explicitamente. Nunca o fuso do processo, nunca o fuso do navegador.

A sua máquina está em São Paulo, então formatar sem declarar o fuso funciona nela e quebra na Vercel, que roda em UTC. O sintoma é um "sábado, 14 de junho" virando "sexta, 13 de junho" — e ele não aparece em nenhum teste rodado localmente.

### O módulo dono do tempo

`lib/datetime.ts` é o único lugar do projeto autorizado a formatar ou interpretar data e hora. Ele exporta `APP_TIMEZONE` e as funções de formatação que o produto usa.

Fora dele, ESLint proíbe:

- `toLocaleDateString`, `toLocaleTimeString`, `toLocaleString`
- `Intl.DateTimeFormat`
- `getHours`, `getDate`, `getDay`, `getMonth`, `getFullYear` e os demais leitores locais de `Date`

É a mesma zona que fechou o acesso ao banco no D-037, pelo mesmo motivo: convenção escrita em documento não sobrevive a seis blocos de distância.

### Dia inteiro

`all_day: true` significa um dia do calendário, não um instante.

Guardado como a meia-noite daquele dia em `America/Sao_Paulo`, convertida para UTC. Renderizado sempre de volta em `America/Sao_Paulo`, o que devolve o mesmo dia.

Nunca comparar, somar ou truncar data de dia inteiro usando aritmética de UTC. A pergunta "é hoje?" é respondida convertendo os dois lados para o fuso do app e comparando o dia civil, nunca subtraindo milissegundos.

### Horário de verão

O Brasil não tem mais horário de verão desde 2019, então `America/Sao_Paulo` é estável em UTC−3 hoje. Isso não autoriza fixar −3 em lugar nenhum. A base de fusos resolve, e a decisão pode mudar por lei — já mudou várias vezes.

### Teste

Os testes de tempo rodam com `TZ=UTC` e com `TZ=America/New_York`, além do fuso local. Um teste de data que só roda no fuso de quem escreveu não testa nada.

Confirme que a versão instalada do Node respeita `TZ` no Windows antes de montar o script, em vez de presumir.

---

## 3. Opção de data

`plan_date_options`, criada no B2. Campos que o produto usa: `starts_at`, `ends_at` (nulo), `all_day`, `note`, `is_confirmed`.

Regras:

- no máximo **10 opções por plano**, validado na aplicação. Não vira constraint de banco: é limite de usabilidade, não invariante de correção;
- opção duplicada (mesmo instante, mesmo plano) é barrada na aplicação, pelo mesmo motivo. Contraste deliberado com o único parcial de `is_confirmed`, que é invariante e por isso vive no banco;
- `ends_at`, quando existe, tem que ser posterior a `starts_at`;
- opção no passado **pode** ser criada. Alguém registrando um date que já rolou é uso legítimo, e o produto não sabe mais que a pessoa sobre a agenda dela.

Apagar uma opção apaga os votos dela, por cascata. Apagar a opção confirmada exige desconfirmar antes — ver seção 6.

---

## 4. Voto

`plan_date_votes`, único em (`option_id`, `profile_id`). Valores: `yes`, `maybe`, `no`.

- o voto é alterável a qualquer momento, por upsert. `updated_at` registra a mudança;
- **não votar é um estado distinto de votar `no`.** Ausência é "ainda não respondeu", e a interface diz isso;
- **os dois votos são sempre visíveis.** Esconder o voto da outra pessoa até você votar evitaria ancoragem, mas são duas pessoas decidindo juntas — a transparência é o produto. Decisão consciente, não omissão;
- votar não muda status de plano. Só a confirmação muda.

---

## 5. Consenso

Calculado por função pura, a partir dos dois votos, e testado sem banco.

| Estado | Quando | Rótulo |
|---|---|---|
| `both_yes` | os dois `yes` | Vocês dois querem |
| `leaning` | um `yes`, outro `maybe` | Quase |
| `maybe` | os dois `maybe` | Em dúvida |
| `blocked` | qualquer `no` | Alguém não pode |
| `waiting` | um votou, outro não | Falta {Nome} |
| `untouched` | ninguém votou | — |

`untouched` não exibe rótulo. Uma opção recém-criada não precisa de um aviso dizendo que ninguém votou ainda; a ausência dos dois votos já diz isso.

Cor entra como ponto ou preenchimento, nunca como texto (D-020). O rótulo é sempre `--text` ou `--text-muted`.

---

## 6. Confirmação

O momento em que o plano vira compromisso. É transacional, e a ordem importa.

Dentro de uma transação, com a linha do plano travada (`FOR UPDATE`, D-055):

1. verificar que a opção pertence ao plano e ao workspace do contexto;
2. **desmarcar** qualquer outra opção confirmada daquele plano — antes de marcar a nova, senão o único parcial de `is_confirmed` recusa;
3. marcar a escolhida;
4. mover o status conforme a seção 7;
5. gravar `date_confirmed` em `activity_events`.

Falhar em qualquer passo desfaz tudo.

### Desconfirmar

Permitido somente com o plano em `planned`. De `reserved` **não** se desconfirma: existe reserva presa àquela data, e desfazer sem tratar a reserva deixaria os dois em desacordo. Quem quiser mudar a data de um plano reservado volta para `planned` primeiro, de forma explícita.

Desconfirmar devolve o plano a `deciding`.

---

## 7. Acoplamento com a máquina de status

A máquina do `docs/DATA_ACCESS.md` seção 5 não muda. O que o B6 acrescenta são transições automáticas e uma pré-condição.

Automáticas, sempre na mesma transação do que as causou:

- criar a **primeira** opção num plano `idea` → `deciding`;
- confirmar uma opção em `deciding` → `planned`;
- desconfirmar em `planned` → `deciding`.

Transição automática emite evento como qualquer outra. Ninguém descobre depois que o status mudou sozinho e não ficou registrado.

Pré-condição, agora exigível:

- `deciding` → `planned` **manual** exige uma opção confirmada. É o que a seção 5 do `DATA_ACCESS.md` antecipava. Sem data confirmada, `planned` é um estado que mente.

---

## 8. Eventos

Três verbos do enum entram aqui, todos na mesma transação da escrita:

- `date_suggested` — opção criada;
- `vote_cast` — voto registrado ou alterado;
- `date_confirmed` — opção promovida a data oficial.

`metadata` carrega o mínimo para o feed do B10 fazer sentido depois: id da opção, e o valor do voto quando for o caso. Nada de texto pronto para exibição — rótulo é decisão de apresentação e muda.

---

## 9. Interface

Seção "Datas" no detalhe do plano, entre as fotos e o restante.

**Cada opção é uma linha, não um card.** Card por opção transformaria cinco datas candidatas em cinco caixas empilhadas, que é exatamente o "cards por todo lado sem hierarquia" que a seção 11 do spec proíbe.

Cada linha traz:

- o **dia da semana** e a data em Fraunces — o dia da semana é o que importa para decidir, mais que o número;
- o horário em Inter com tabular-nums, ou "dia inteiro";
- os dois votos, um por pessoa, identificados pela inicial;
- o rótulo de consenso, quando houver;
- a ação de confirmar, apenas quando a máquina permitir.

**Controle de voto:** três opções num controle segmentado, com a escolhida em preenchimento. Sim, talvez, não. Sem ícone, sem emoji, sem cor como único portador de significado.

**Adicionar data:** dia obrigatório, horário opcional, alternador de dia inteiro, observação opcional. Sheet no mobile.

**Próximo DATE na Home:** quando existe plano com data confirmada no futuro, ele aparece em destaque com a contagem em dias. A contagem é calculada no servidor e renderizada como texto estático. Não conta segundos: além de ser animação gratuita, contador calculado no cliente diverge do servidor e produz erro de hidratação.

---

## 10. O que não existe na V1

Recorrência, convite para terceiros, integração com calendário externo, lembrete, notificação, fuso por pessoa, negociação com mais de duas pessoas, sugestão automática de data.
