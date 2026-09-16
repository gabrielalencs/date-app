# DATE — Notificações push, lembretes e estabilização

Documento normativo do bloco extraordinário **B11.5 — Notificações**.

Entra depois do B11 (PWA e endurecimento) e antes do B12 (Produção). Revoga apenas o item "notificação fora da V1" dos documentos antigos.

---

## 1. Princípio

O DATE é um produto de duas pessoas. A notificação existe para fazer uma ação de uma pessoa chegar à outra **quando aquilo virou verdade**.

**Notificar o estado estável, não o clique.**

Uma mutation não dispara uma mensagem que afirma um estado mutável. Ela cria uma **intenção** de notificação. A intenção espera. Quando chega a hora, o servidor relê o estado atual e só envia se a afirmação continuar verdadeira.

```text
ação relevante
  ↓
transação grava domínio + activity_event (se houver) + notification_intent
  ↓
commit
  ↓
Vercel Workflow espera até due_at
  ↓
relê estado atual
  ↓
continua verdadeiro? → envia
mudou/desfez?       → suprime
```

Isso resolve o caso central: **clicar errado e desfazer antes do prazo não pode gerar push mentiroso.**

---

## 2. Plataforma

Web Push padrão: Service Worker + Push API + Notifications API + VAPID.

Firebase, OneSignal ou outro provedor **não** são obrigatórios e não entram.

### iPhone/iPad

Web Push funciona na PWA adicionada à Tela de Início. A permissão deve nascer de **ação direta** do usuário — tocar em *Ativar notificações* dentro do DATE.

### Android/desktop

Feature detection sobre `serviceWorker`, `PushManager` e `Notification`. O DATE continua funcionando se Push não existir ou for negado.

---

## 3. Personalização

O DATE controla: título e corpo, ícone, badge, imagem quando suportada, tag/dedupe visual, deep link, timing, copy, destinatário e badge numérico da PWA quando suportado.

O sistema operacional controla: fundo do card, tipografia, tamanho e posição, som, lock screen e boa parte das actions.

Não existe CSS completo para notificação do sistema. A personalidade vem de **copy + timing + contexto + ícone DATE**, não de desenhar o card.

---

## 4. Arquitetura

### 4.1 Subscription

Cada navegador/dispositivo autorizado tem sua própria `PushSubscription`. Uma pessoa pode ter celular e notebook; o push vai para todas as subscriptions ativas dela.

### 4.2 Intent / outbox

Uma ação relevante cria `notification_intents` **dentro da transação do domínio** quando possível. A intent registra destinatário, ator (quando houver), `kind`, plano, `due_at`, os fatos mínimos esperados para revalidação e o dedupe.

Ela **não** guarda o texto final da notificação.

### 4.3 Workflow

Depois do commit, iniciar Vercel Workflow com apenas `intentId`.

O workflow espera até `due_at`, relê a intent, relê os fatos atuais, aplica a política, envia ou suprime, e registra deliveries.

Não serializar título, subscription ou dado privado como input durável do workflow.

### 4.4 Recovery

Um Cron diário existe **somente como reparo de outbox**, nunca como scheduler principal. Procura intents pendentes sem workflow ou atrasadas e tenta recuperá-las de forma idempotente.

---

## 5. Banco

Todas as tabelas seguem o padrão DATE: `workspace_id`, autorização central, Drizzle code-first e migration versionada.

### `push_subscriptions`

```text
id · workspace_id · profile_id · endpoint · p256dh · auth
created_at · updated_at · last_success_at · disabled_at
```

- `endpoint` unique;
- endpoint e chaves são sensíveis e **nunca** entram em log;
- unsubscribe só atua no profile atual;
- 404/410 do push service desativa a subscription;
- erro temporário **não** remove subscription saudável.

### `notification_preferences`

```text
workspace_id · profile_id · push_enabled · activity_enabled
date_reminders_enabled · preview_mode · created_at · updated_at
```

`preview_mode`:

- `private` — sem título, local ou data privada no lock screen;
- `full` — contexto completo permitido.

Default: **`private`**.

### `notification_intents`

```text
id · workspace_id · recipient_profile_id · actor_profile_id (nullable)
plan_id (nullable) · kind (text) · dedupe_key · due_at (timestamptz)
expected (jsonb) · status · workflow_run_id (nullable)
created_at · updated_at · sent_at · cancelled_at
attempt_count · last_error_code
```

Status: `pending`, `processing`, `sent`, `suppressed`, `cancelled`, `failed`.

`kind` fica `text`, validado por lista canônica na aplicação. Acrescentar copy nova não deve exigir migration.

`expected` guarda só fatos de revalidação:

```json
{"confirmedOptionId":"...","dayKey":"2026-10-03"}
```

### `notification_deliveries`

```text
id · workspace_id · intent_id · subscription_id · status
attempt_count · last_status_code · last_error_code · sent_at
created_at · updated_at
```

Unique `(intent_id, subscription_id)` — o envio é idempotente mesmo se um step do Workflow repetir.

---

## 6. Relação com `activity_events`

`activity_events` **não** vira fila de push.

O feed registra a história do date. Push é política de entrega. Uma mutation pode gravar `activity_event + notification_intent`, ou apenas `notification_intent` quando a mudança merece avisar o parceiro sem virar linha histórica do feed.

---

## 7. Destinatário

**Ação de uma pessoa** → destinatário é o outro membro do workspace. **Nunca notificar o próprio ator.**

**Lembrete de calendário** → destinatários são os dois membros, cada um respeitando as próprias preferences e subscriptions.

---

## 8. Matriz de produto

| Evento | Destinatário | Delay | Revalidação |
|---|---|---|---|
| nova ideia | parceiro | 15 min | plano existe, ativo |
| quero muito | parceiro | 5 min | reação ainda existe |
| datas sugeridas | parceiro | 20 min debounce | opções ainda existem |
| voto | parceiro | 15 min debounce | voto final ainda existe |
| data confirmada / planejado | parceiro | 09:00 do próximo dia civil | mesma opção/data; plano ativo |
| reserva confirmada/desfeita | parceiro | 60 min | estado da reserva continua |
| cancelamento | parceiro | 60 min | continua `cancelled` |
| arquivamento | parceiro | 60 min | continua arquivado |
| realizado | parceiro | 30 min | continua `completed` |
| primeira avaliação | parceiro | 15 min | avaliação existe |
| reminder | os dois | 7/5/3/1 dias | mesma data confirmada; plano ativo |

**Nova ideia.** `plan_created` → 15 minutos. Se arquivada ou cancelada antes, `suppressed`. Usar o título atual.

**Quero muito.** 5 minutos. Se retirar a reação, suprimir. Favorito continua silencioso.

**Datas sugeridas.** 20 minutos por plano+ator. Quatro datas geram **uma** notificação agregada, não quatro pushes.

**Voto.** 15 minutos por plano+ator. `sim → talvez → sim`: somente o estado final pode gerar notificação.

**Data confirmada / planejamento.** Não enviar imediatamente. Agendar para **09:00 do próximo dia civil em `America/Sao_Paulo`**. No envio, provar: mesma opção confirmada, mesma data, plano não cancelado nem arquivado, status compatível (`planned` ou `reserved`). A mensagem descreve o estado — "X está planejado para sábado", nunca "você clicou em planned".

**Reserva.** 60 minutos. Se `confirmed` voltar para `pending`/`cancelled`, o push de confirmação é suprimido. O inverso também é revalidado.

**Cancelamento / arquivamento.** 60 minutos. Se a ação for revertida antes, suprimir.

**Realizado.** 30 minutos; a ação já é irreversível e passa por confirmação.

**Avaliação.** 15 minutos. Apenas a **primeira** avaliação, mantendo o contrato do B9. Editar a nota depois não dispara outro push.

---

## 9. O que NÃO envia push

Editar título, descrição, endereço ou observação; mudar capa; subir ou reordenar foto; gasto; checklist; favorito; navegar; tema; login/logout; cada save ou keystroke.

Push comunica mudança relevante ao casal, não log de edição.

---

## 10. Lembretes do calendário

Somente para data confirmada **futura**.

Offsets default: **7, 5, 3 e 1 dias**, às **09:00 `America/Sao_Paulo`**. Sem reminder no mesmo dia na primeira versão.

Ao confirmar data, criar apenas offsets ainda futuros. Ao mudar a data, intents antigas são canceladas ou superadas quando possível; mesmo que um workflow antigo acorde, a revalidação por `confirmedOptionId` + `dayKey` impede envio errado.

Cancelar, arquivar ou completar cancela reminders pendentes.

---

## 11. Janela silenciosa

Nenhum push não urgente entre **22:00 e 08:59**. Se um delay cair aí, mover para 09:00 no fuso do app.

---

## 12. Templates

Texto vive em módulo único (`features/notifications/templates`). Template recebe fatos; **nunca** lê banco.

Variações são determinísticas, por hash estável de `intentId`; não usar `Math.random()` em comportamento testável.

Ver `docs/NOTIFICATION_COPY.md`.

---

## 13. Privacidade de lock screen

`preview_mode = private` é o default.

**Private**

```text
Tem novidade no DATE
Abra para ver o que mudou.
```

**Full**

```text
Agora tem data
“Jantar no Centro” está planejado para sábado.
```

O usuário escolhe conscientemente mostrar detalhes.

---

## 14. Ícone e badge

Usar os assets DATE do B11.

- `icon`: ícone colorido oficial;
- `badge`: asset monocromático próprio para notification badge;
- não usar o wordmark inteiro como badge.

A cor do card não é controlável de forma consistente. Quando suportada, a Badging API pode refletir notificações relevantes não abertas, sem virar requisito cross-browser.

---

## 15. Clique

Deep links internos conhecidos:

```text
/planos/{id}
/agenda?mes=...
/memorias
```

**Nunca** aceitar URL externa arbitrária do payload.

Ao clicar: fechar a notification; focar a janela DATE existente e navegar quando possível; senão `clients.openWindow()`. A rota continua protegida por Auth.

---

## 16. Subscription UX

Perfil recebe uma seção:

```text
Notificações
[ Ativar / desativar ]
[ Atividades do casal ]
[ Lembretes de dates ]
[ Mostrar detalhes na tela bloqueada ]
```

Estados: `unsupported`, `not-installed-when-required`, `default`, `granted`, `denied`, `subscribed`, `stale`.

No iOS sem PWA instalada, orientar a adicionar à Tela de Início antes de pedir permissão.

**Nunca** pedir permissão on-load. Só após clique explícito.

---

## 17. VAPID

Par de chaves por ambiente.

```text
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
WEB_PUSH_VAPID_PRIVATE_KEY
WEB_PUSH_VAPID_SUBJECT
```

A public key é pública por definição e é **exceção legítima** ao alerta sobre `NEXT_PUBLIC_`. A private é server-only.

Não rotacionar sem necessidade: mudar `applicationServerKey` pode exigir nova subscription.

---

## 18. Envio

Preferir implementação Web Push pequena, atual e mantida. Antes de instalar dependência, conferir se o B11 já trouxe primitive.

Não implementar criptografia Web Push à mão se uma biblioteca específica e consolidada resolve.

Tratamento:

- sucesso → delivery `sent`;
- 404/410 → subscription stale, desativar;
- 429/5xx → temporário, retry;
- erro de VAPID/config → erro operacional, **não** apagar subscription cegamente.

---

## 19. Outbox e side effects

```text
BEGIN
  mutation domínio
  activity_event, se aplicável
  notification_intent
COMMIT

start workflow(intentId)
```

**Nunca** chamar Workflow ou Web Push dentro da transação Neon.

Se o start falhar, o domínio continua válido; a intent fica `pending` e o recovery tenta depois.

---

## 20. Backfill

Ao ativar o B11.5: não reproduzir activity antigo, não mandar "nova ideia" retroativa, não mandar voto antigo.

Para planos com data confirmada futura, criar apenas os reminders 7/5/3/1 **ainda futuros**. Backfill é idempotente.

---

## 21. B12

O B12 deve auditar também:

```text
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
WEB_PUSH_VAPID_PRIVATE_KEY
WEB_PUSH_VAPID_SUBJECT
CRON_SECRET   # se recovery usar Vercel Cron
```

Antes de abrir produção: Service Worker final; VAPID prod estável; Workflow deployado; recovery protegido; subscriptions reais só após consentimento; push real testado em dispositivo compatível; teste manual em iPhone Home Screen se iOS fizer parte do uso real.

---

## 22. Testes

**Unit.** Destinatário, delays, quiet hours, dedupe, templates, preview private/full e a matriz completa.

**Tempo.** Entrar em `pnpm test:tz`: 7/5/3/1, próximo dia 09:00, com `TZ=UTC`, `TZ=America/New_York` e fuso local.

**Banco.** Dois workspaces, provando que subscription, intent e delivery de fora são invisíveis.

**Idempotência.** Mesmo intent+subscription envia no máximo uma vez; Workflow duplicado não duplica; recovery duplicado não duplica.

**Stale state.** Provar `suppressed` para: criar → arquivar antes do due; want → retirar; voto mudado; `confirmed A → confirmed B`; booking `confirmed → pending`; `cancelled → restored`.

**Service Worker.** Payload válido; URL interna; icon/badge; payload malformado falha seguro; nada executa script vindo do payload.

Push externo real fica em smoke separado, nunca em unit test.

---

## 23. Observabilidade

Sem SaaS novo. Métricas mínimas: `pending`, `sent`, `suppressed`, `failed`, subscriptions ativas e stale.

Logs podem conter `intent_id`, `kind`, `status` e `http_status`. **Nunca** logar endpoint completo, chaves de subscription, VAPID private key ou corpo privado.

---

## 24. Falha de push

Push é **best effort**. O domínio nunca depende dele: plano continua criado, voto continua registrado, reserva continua confirmada, date continua no calendário.

Retry de push nunca repete a mutation de negócio.

---

## 25. Fora

SMS; WhatsApp; e-mail; Firebase/OneSignal obrigatório; campanhas; terceiros; geofence; custom sound; Live Activities; widgets; notification center neste bloco; IA escrevendo copy em runtime.

O B11.5 entrega Web Push privado, contextual e estável para duas pessoas.
