# DATE — Linguagem das notificações

Complemento de `docs/NOTIFICATIONS.md`.

A notificação deve parecer uma mensagem do produto sobre algo que o casal realmente fez, não marketing de retenção.

---

## 1. Voz

Curta, íntima, adulta e direta.

Evitar: urgência falsa; culpa; streak; infantilização; excesso de emoji; "corre!", "você não vai querer perder"; copy genérica de app.

---

## 2. Estrutura

```text
Título: 2–6 palavras
Corpo: 1 frase curta
```

---

## 3. Privacy mode

**Private**

```text
Tem novidade no DATE
Abra para ver o que mudou.

Vocês têm um date chegando
Tem um lembrete esperando no DATE.
```

**Full** pode usar título, nome e data necessários ao contexto.

---

## 4. Nova ideia

```text
Nova ideia por aqui
{actor} adicionou “{plan}”.

Entrou na lista
{actor} guardou “{plan}” para vocês.

Tem date novo na fila
“{plan}” acabou de entrar nas ideias.
```

Escolha de variante é determinística por intent.

---

## 5. Quero muito

```text
Isso ganhou prioridade
{actor} marcou “{plan}” como quero muito.

Recado entendido
{actor} quer muito fazer “{plan}”.
```

Favorito não envia.

---

## 6. Datas sugeridas

Uma:

```text
Tem data na mesa
{actor} sugeriu uma data para “{plan}”.
```

Múltiplas:

```text
Tem opções para escolher
{actor} sugeriu {count} datas para “{plan}”.
```

---

## 7. Voto

Sim:

```text
Um voto chegou
{actor} topa essa data para “{plan}”.
```

Talvez:

```text
Ainda está em aberto
{actor} marcou talvez em uma data de “{plan}”.
```

Não:

```text
Melhor olhar outra data
{actor} não consegue nessa opção de “{plan}”.
```

---

## 8. Data confirmada / planejamento

```text
Agora tem data
“{plan}” está planejado para {dateLabel}.

Entrou no calendário
“{plan}” ficou marcado para {dateLabel}.
```

Nunca dizer "status alterado para planned".

---

## 9. Reserva

Confirmada:

```text
Reserva confirmada
“{plan}” já tem reserva.
```

Desfeita:

```text
A reserva mudou
“{plan}” não está mais com a reserva confirmada.
```

---

## 10. Cancelamento

```text
Mudança de planos
“{plan}” foi cancelado.
```

---

## 11. Arquivamento

```text
Saiu da lista ativa
{actor} arquivou “{plan}”.
```

Não chamar de excluído quando a operação real é arquivar.

---

## 12. Realizado

```text
Esse date virou memória
“{plan}” foi marcado como realizado.
```

---

## 13. Avaliação

```text
Tem avaliação nova
{actor} contou como foi “{plan}”.
```

Não colocar a nota no lock screen por padrão.

---

## 14. Reminders

```text
7 dias
Uma semana
“{plan}” é daqui a 7 dias.

5 dias
Tá chegando
Faltam 5 dias para “{plan}”.

3 dias
Já dá para entrar no clima
“{plan}” é daqui a 3 dias.

1 dia
É amanhã
“{plan}” está no calendário de amanhã.
```

Private:

```text
Vocês têm um date chegando
Abra o DATE para conferir.
```

---

## 15. Emoji

Pode existir pontualmente no futuro, mas: não substitui ícone; não é necessário para personalidade; nenhuma regra depende dele.

A primeira versão sai sem emoji.

---

## 16. Deep links

| Kind | Destino |
|---|---|
| nova ideia | `/planos/{id}` |
| quero muito | `/planos/{id}` |
| data sugerida | `/planos/{id}` ou âncora real existente |
| voto | `/planos/{id}` |
| data confirmada | `/planos/{id}` |
| reserva | `/planos/{id}` |
| cancelamento | `/planos/{id}` |
| arquivamento | rota real acessível para arquivado |
| realizado | `/planos/{id}` |
| avaliação | `/planos/{id}` |
| reminder | `/planos/{id}` |

Não inventar hash ou rota que o produto não suporta.

---

## 17. Critério

Antes de aprovar uma copy:

> Se essa frase aparecesse na tela bloqueada às 09:00, a pessoa entenderia em dois segundos o que mudou sem sentir que o app está tentando chamar atenção à força?

Se sim, serve ao DATE.
