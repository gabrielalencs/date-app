# DATE — Bloco 11.5: Notificações push e lembretes

Bloco extraordinário entre B11 e B12.

Documentos normativos: `docs/NOTIFICATIONS.md` e `docs/NOTIFICATION_COPY.md`.

Objetivo: implementar Web Push privado para as duas pessoas do DATE, com subscription por dispositivo, permissão consciente, VAPID, Service Worker, intents transacionais, Vercel Workflow durável, revalidação antes do envio, delays/debounce, reminders 7/5/3/1, privacidade de lock screen e dedupe/idempotência.

## 0. Leitura e hard stop

Leia integralmente: `CLAUDE.md`, `AGENTS.md`, `DATE_PROJECT_SPEC.md`, `HANDOFF_STATUS.md`, `docs/ROADMAP.md`, `docs/DEFINITION_OF_DONE.md`, `docs/DECISION_LOG.md`, `docs/DESIGN_SYSTEM.md`, `docs/DATABASE.md`, `docs/DATA_ACCESS.md`, `docs/AUTH_AND_SECURITY.md`, `docs/DATES_AND_VOTING.md`, `docs/CALENDAR.md`, `docs/PLANNING.md`, `docs/MEMORIES.md`, `docs/REACTIONS_AND_ACTIVITY.md`, `docs/PWA_AND_HARDENING.md`, `docs/NOTIFICATIONS.md`, `docs/NOTIFICATION_COPY.md`, além do Service Worker, manifest, `package.json`, `vercel.json`, env/config e migrations atuais.

Depois: `git status` e `git log --oneline -20`. Procure marcadores de conflito.

**Pare e reporte se:** B11 não estiver concluído; o Service Worker/PWA real divergir materialmente do documento; houver conflito Git; a árvore começar suja; o B10 tiver alterado `activity_events` de forma incompatível; o schema real divergir dos docs normativos.

Não toque `production`. Ambientes: Neon `development`, R2 `date-media-dev`.

## 1. Confirme a plataforma atual

Antes de escolher API ou dependência, consulte documentação oficial atual para Web Push, Push API, Notifications API, Web Push em iOS Home Screen, VAPID, Vercel Workflow estável atual, a forma atual de iniciar workflow e suspender por tempo, Vercel Cron/`CRON_SECRET` e os limites do plano realmente usado.

Não codifique API antiga ou beta de memória. Registre no relatório: baseline de browsers, limitação iOS, versão do Workflow SDK, biblioteca Web Push escolhida e motivo, dependências novas.

Não adicione Firebase/OneSignal por conveniência.

## 2. Levantamento das mutations reais

Antes da migration, produza uma tabela com: MUTATION, FEATURE, `activity_event` atual, estado final, gera `notification_intent`, kind, destinatário, delay, dedupe, revalidação.

Percorra de verdade: criar/editar/arquivar/cancelar plano; favorite/want_a_lot; sugerir/apagar data; votar; confirmar/desconfirmar; reserva; checklist; gastos; completed; memory rating; mídia.

Compare com `docs/NOTIFICATIONS.md`. Não invente `activity_event` novo só para push quando a intent resolve.

## 3. Banco

Migration incremental em `development`: `push_subscriptions`, `notification_preferences`, `notification_intents`, `notification_deliveries`.

Regras: `workspace_id` nas quatro; FKs coerentes com `profiles`; `endpoint` unique; unique `(intent_id, subscription_id)`; índice `(status, due_at)` em intents; índices de recipient/workspace; estados finitos protegidos; `kind` text + lista canônica na aplicação; timestamps UTC; zero endpoint ou chave real em fixture versionada.

Leia o SQL gerado antes de aplicar. Aplique somente em `development`. Amplie `test:db` para scoping com dois workspaces.

## 4. Feature isolada

```text
features/notifications/
  data/ policy/ templates/ actions/ components/ workflow/
```

**Policy**: funções puras para recipient, delay, quiet hours, dedupe key, `shouldNotify`, revalidação e reminder offsets.

**Templates**: funções puras, nenhum banco.

**Data**: segue `docs/DATA_ACCESS.md` para operações de usuário. Workers e cron server-to-server não inventam um `AuthorizedContext` de usuário: crie uma fronteira de sistema explícita e mínima, limitada ao `intentId` persistido, sem aceitar `workspaceId` arbitrário do caller HTTP. Documente essa exceção arquitetural.

## 5. Outbox transacional

```text
BEGIN
  domínio
  activity_event se o contrato já exigir
  notification_intent
COMMIT
```

Depois do commit: `startNotificationWorkflow(intentId)`.

Workflow e Web Push nunca rodam dentro da transação Neon. Se iniciar o Workflow falhar: não reverta o domínio; a intent permanece `pending`; o recovery resolve. Prove em teste.

## 6. Matriz obrigatória

Implemente a política normativa da seção 8 do documento: `plan_created` 15 min; `want_a_lot` 5 min; `date_suggested` 20 min de debounce agregando opções; `vote_cast` 15 min pelo estado final; `date_confirmed` às 09:00 do próximo dia civil em `America/Sao_Paulo` com revalidação de opção/data/plano ativo; `booking_updated` 60 min; `cancelled`/`archived` 60 min; `plan_completed` 30 min; `memory_added` 15 min apenas na primeira avaliação.

Não envia: editar texto, endereço, observação, fotos, gastos, checklist, favorito, tema, login/logout e edição ordinária.

## 7. Reminders

Ao confirmar data futura, agende 7d, 5d, 3d e 1d às 09:00 em `America/Sao_Paulo`, somente offsets ainda futuros.

A intent revalida no mínimo `confirmedOptionId`, `dayKey` e `offset`. Mudou a data → intent antiga não envia. Cancelado/arquivado/completed → reminder pendente não envia.

O cálculo entra em `pnpm test:tz`. Plante um defeito UTC, prove vermelho, reverta e prove verde (D-081).

## 8. Workflow

Vercel Workflow é o scheduler principal. Payload do run: **apenas** `intentId`.

Fluxo: load intent → wait até due → claim idempotente → load fatos atuais → revalidate → load preferences/subscriptions → render copy → send → record deliveries → finish `sent`/`suppressed`/`failed`.

Use a API estável atual; não invente assinatura de memória.

**Claim**: duas execuções não processam a mesma intent em paralelo. **Delivery**: uma subscription já `sent` para aquela intent não recebe de novo. 404/410 → stale; 429/5xx → retry; erro de VAPID/config → operacional, não apagar subscription às cegas.

## 9. Recovery Cron

Cron diário apenas para reparar outbox: protegido pelo mecanismo oficial vigente; busca `pending` vencidas ou sem workflow; reinicia só o necessário; idempotente. Request sem autenticação precisa falhar.

## 10. VAPID / Web Push

Gere somente chaves de development agora. `.env.example` recebe `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` e `WEB_PUSH_VAPID_SUBJECT`.

A public key pode legitimamente usar `NEXT_PUBLIC_`. A private nunca vai ao client.

Sender testável por interface injetada. Unit tests não fazem push externo.

## 11. Subscribe / unsubscribe

UI em Perfil, integrada ao R1: feature detection → explicação → clique humano → `Notification.requestPermission()` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → Server Action valida e associa ao profile atual.

O browser nunca envia `profileId` como autoridade. Profile e workspace vêm de `requireAuthorizedContext()`.

Unsubscribe: navegador; servidor desativa somente o endpoint do profile atual; idempotente. `denied` não gera loop.

## 12. iOS

Capability detection, não versão nem browser hardcoded. Quando push não estiver disponível porque a web app precisa estar instalada, a UI orienta: Compartilhar → Adicionar à Tela de Início → abrir pelo ícone → Perfil → Notificações → Ativar.

A aceitação real no iPhone é manual em dispositivo físico. Não diga que Playwright provou isso.

## 13. Service Worker

Integre ao SW do B11 sem quebrar install/activate/cache/update. Adicionar `push`, `notificationclick` e `pushsubscriptionchange` quando aplicável.

Handler: valida payload; usa assets DATE; monta apenas URL interna; `showNotification()`; não executa conteúdo vindo do payload; Badging API como enhancement.

## 14. Copy e privacidade

Implemente `docs/NOTIFICATION_COPY.md`. Variação determinística. `preview_mode=private` por default.

## 15. Perfil / preferences

Seção mínima com Ativar notificações, Atividades do casal, Lembretes de dates e Mostrar detalhes na tela bloqueada. Estados humanos para não suportado, precisa instalar PWA, ainda não permitido, ativo, bloqueado pelo sistema e erro recuperável. Sem dashboard. Touch targets ≥44px.

## 16. Backfill

Não reproduzir eventos antigos. Somente: planos com data confirmada futura recebem os reminders 7/5/3/1 ainda futuros. Development-only e idempotente.

## 17. Testes obrigatórios

Unit (policy matrix completa); timezone (reminder e "próximo dia 09:00" nos três fusos); DB (dois workspaces); idempotência (workflow, delivery e recovery duplicados); stale state (seis provas); Service Worker (payload seguro, URL interna, icon/badge, payload malformado); browser UI (Perfil em 320/390/1280 nos dois temas); regressão de todas as suítes anteriores.

## 18. Prova do instrumento

D-081 vale. Antes de aceitar: quebre dedupe → vermelho; quebre revalidation → vermelho; quebre timezone de reminder → `test:tz` vermelho; reverta; rode verde. Nada plantado fica no Git.

## 19. Integração com B12

O B12 deve incluir `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT` e `CRON_SECRET` se aplicável, além do smoke de produção. Não gere VAPID production neste bloco.

## 20. Portões

Leia `package.json` e rode os scripts reais: `pnpm lint`, `typecheck`, `test`, `build`, `test:tz`, `test:db`, mais os runners existentes. Não invente nome de script.

## 21. Screenshots

Se Perfil mudou, capture e abra 320/390/1280 em claro e escuro.

## 22. Documentação

Atualize `docs/ROADMAP.md`, `docs/DATABASE.md`, `docs/DATA_ACCESS.md` se necessário, `docs/DECISION_LOG.md`, `docs/DEFINITION_OF_DONE.md` se houver portão permanente, `HANDOFF_STATUS.md`, o doc de PWA do B11, o material do B12 e `.env.example`.

Não apagar decisões antigas; reversão vira nova decisão.

## 23. Git

Trabalho na `develop`, commits pequenos por unidade lógica. Sem `main`, sem `production`, sem segredo.

## 24. Relatório final

A) resultado; B) plataforma; C) schema; D) matriz; E) fluxo; F) push; G) reminders; H) testes; I) defeitos plantados; J) screenshots; K) B12 pendente; L) não feito; M) git.

A feature só está pronta se o push puder falhar sem quebrar o domínio e se um estado desfeito antes do `due_at` não puder produzir uma notificação mentirosa.
