# DATE — Handoff status

Data do handoff: **16/09/2026**

Este arquivo registra o estado factual atual para a continuidade da implementação.

## Já concluído pelo proprietário

- Nome do produto: **DATE**
- Identidade de marca aprovada; linguagem de interface reformulada no R1 por solicitação do proprietário (ver `docs/DESIGN_SYSTEM.md`)
- Repositório GitHub **privado já criado**
- Scaffold Next.js 16 com TypeScript strict, ESLint, Tailwind CSS 4, Vitest e Playwright
- B1 concluído: design system, tema e app shell existem
- B2 concluído: schema Drizzle com 14 tabelas e migration inicial versionada
- Migration inicial aplicada somente na branch Neon `development`
- Seed fictício idempotente executado duas vezes e validado por teste de integração
- B3 concluído em `development`: sessão, login, logout e autorização por workspace
- Duas contas de development provisionadas e autorizadas, ligadas a `profiles` e `workspace_members` — a do proprietário como `owner`, a outra como `member`
- Signup público bloqueado na fronteira HTTP da aplicação por allowlist positiva, provado por teste
- Login, sessão, contexto autorizado e logout validados contra o Neon Auth real (`pnpm test:auth`)
- B4 concluído: CRUD do plano com camada de dados fechada por construção
- B5 concluído: mídia em `date-media-dev`, upload por URL assinada, capa e galeria
- B6 concluído: opções de data, votos, consenso, confirmação e o acoplamento com a máquina de status
- R1 implementado e verificado: rebrand das nove telas atuais, Select DATE, Motion, fotografia e sistema visual permanente. Ver `docs/R1_VISUAL_REBRAND.md` para testes e capturas; a avaliação estética final cabe ao proprietário.
- B7 concluído: calendário mensal da `/agenda`, com navegação por URL, dia selecionado em painel e filtro por categoria. Sem escrita nova e sem migration — o calendário só lê o que o B6 grava. Ver `docs/CALENDAR.md`.
- Workspace de development normalizado para **exatamente dois membros**, as duas contas reais (D-084). Alex e Nina seguem como autores de planos e opções, não como membros; o seed corrige isso sozinho a cada execução.
- B8 concluído: reserva com estado, checklist com autor e horário, gastos em centavos com total. A máquina de status passa a exigir o fato que cada etiqueta afirma, nos dois sentidos. Ver `docs/PLANNING.md`.
- B9 concluído: travessia para `completed` com pré-condição e confirmação em modal, avaliação de cada pessoa, fotos com `purpose = 'memory'` e a timeline em `/memorias`. A tabela `memories` do B2 foi removida (D-099); memória é o plano depois, não entidade nova. Ver `docs/MEMORIES.md`.
- Migrations `0003` e `0004` aplicadas em `development`. `pnpm db:seed` rodado, `pnpm test:db` (136 testes), `pnpm test:memories` (9) e `pnpm shots:memories` (8) passando contra o banco real. Duas correções feitas nessa verificação: a asserção de escala comparava `entries.length` (limitado por `MEMORIES_PER_PAGE`) em vez de `total`, e os dois cliques de mouse no radio de nota precisaram de `force: true` no teste — o radio é `sr-only` e o clique real chega por encaminhamento nativo do `<label>`, que o hit-test do Playwright não reconhece.
- B10 concluído: favoritos pessoais e silenciosos, “quero muito” compartilhado, filtros combinados em `/ideias`, sorteador por Server Action e feed paginado no detalhe. Eventos novos de data carregam `startsAt`; os antigos degradam sem inventar informação. Ver `docs/REACTIONS_AND_ACTIVITY.md`.
- Migration `0005` aplicada somente em `development`, acrescentando `want_a_lot` ao enum `activity_verb`. A tabela `reactions`, seu enum e o único por plano/pessoa/tipo já existiam desde o B2.
- B10 fechado contra o banco e o navegador reais: `pnpm test` (395), `pnpm test:db` (144), `pnpm test:tz` (116 em cada um dos três fusos), `pnpm test:media` (8) e Playwright completo com um worker (172) passando, mais a prova visual de escala de cinza acrescentada e executada isoladamente. O feed manteve 2 consultas com 10 e 200 eventos. As 24 capturas da matriz cobrem quatro estados, três larguras e dois temas; uma 25ª captura prova “quero muito” sem cor.
- A limpeza das fixtures agora remove eventos cujo plano aparece em `metadata.planId`, além dos eventos que apontam direto para o plano. Dezessete eventos órfãos criados pelas próprias execuções de teste foram removidos de `development`; nenhuma linha de produto foi tocada.
- B11 concluído: aplicativo instalável (manifest em rota, cinco ícones auditados, área segura, `apple-touch-icon` sem alfa), CSP com nonce em modo de aplicação, headers de segurança, auditoria de caminho público provada sem cookie, suíte crítica consolidada em `pnpm test:e2e` com arnês que reprova em erro de console, `pageerror`, violação de CSP e resposta inesperada, e axe zerado nas oito rotas nos dois temas. Ver `docs/PWA_AND_HARDENING.md`.
- Sem migration no B11: o bloco não toca o banco. Nenhuma variável de ambiente nova.
- B11.5 concluído: Web Push privado com intents transacionais, Vercel Workflow como agendador e revalidação antes do envio. A tese do bloco é a do D-148 — notifica-se o **estado estável**, não o clique: a mutation grava uma intenção com os fatos mínimos, e no vencimento o servidor relê o estado e só envia se a afirmação continuar verdadeira. Ver `docs/NOTIFICATIONS.md` e `docs/NOTIFICATION_COPY.md`.
- Migration `0006` aplicada somente em `development`: quatro tabelas (`push_subscriptions`, `notification_preferences`, `notification_intents`, `notification_deliveries`) e três enums. Puramente aditiva.
- Duas dependências acrescentadas: `workflow@4.8.8` (SDK do Vercel Workflows, GA) e `web-push@3.6.7`, mais `@types/web-push` em dev. Sem Firebase, sem OneSignal (D-153).
- `.well-known/workflow/` saiu do matcher do `proxy.ts` (D-155) — interceptar as rotas internas do Workflow quebra a execução com erro de `ArrayBuffer` destacado.
- Push é best effort e o domínio não depende dele: se o Workflow estiver fora do ar, o plano continua criado e a intent fica `pending` para o recovery diário em `/api/notifications/recovery`, protegido por `CRON_SECRET` em tempo constante e respondendo 404 sem a variável (D-150).
- O handler de push do Service Worker é provado em `tests/service-worker-push.test.ts`, que carrega o `public/sw.js` do disco: o Chromium headless nega permissão de notificação incondicionalmente e um teste de navegador mediria o ambiente, não o produto (D-157).
- Quatro defeitos reais de acessibilidade foram encontrados pelo axe e corrigidos: contraste do botão coral (o D-017 supunha semibold, e a WCAG conta negrito a partir de 700 — D-136), contraste do dia de hoje no calendário e do mês vizinho, `<dl>` com `<dt>`/`<dd>` aninhados demais em `/planos/[id]`, e o input de arquivo sem rótulo.
- `@axe-core/playwright` é a única dependência acrescentada, em `devDependencies`.
- `playwright.config.ts` passou a `workers: 1` e `timeout: 90_000`: existe um workspace de development e uma conta no Neon Auth, então paralelismo aqui produz teste instável, não velocidade (D-138).
- Service worker escrito à mão, cacheando **apenas** `/offline.html`. `public/sw-kill.js` é o caminho de reversão e está testado. Nada de `next-pwa`, nada de Workbox (D-128, D-129).
- `lib/money.ts` é o dono do dinheiro; `formatBRL` não existe mais. Zona no ESLint barra `parseFloat`, `Number.parseFloat` e `toFixed` fora dele.
- Migration `0002` (`reservations` mais o CHECK de valor não negativo em `expenses`) aplicada somente em `development`
- Migration `0001` (`media.thumb_object_key`) aplicada somente em `development`
- Ambiente local já preparado e atualizado:
  - Git
  - Node.js
  - pnpm
  - VS Code
  - Claude Code
  - Codex
- Cloudflare configurado:
  - R2 ativo
  - bucket privado `date-media-dev`
  - bucket privado `date-media-prod`
  - orçamento/uso será monitorado
- Neon configurado:
  - projeto: `date-app`
  - região: AWS South America East 1 / São Paulo (`sa-east-1`)
  - branch default: `production`
  - branch filha: `development`
  - Managed Better Auth / Neon Auth habilitado
  - 2FA da conta Neon habilitado
  - Data API não deve ser habilitada sem necessidade arquitetural explícita

- B12, parte de código, concluída: endpoint `/api/webhooks/neon-auth` com verificação Ed25519 do JWS destacado contra o JWKS do provedor (D-142), recusa em 200 (D-143), guarda de branch `production` com três travas independentes (D-144), guarda simétrica do R2 (D-145) e os quatro comandos de produção. Ver `docs/PRODUCTION.md`.
- Nenhuma migration no B12: o bloco não toca o schema. Variáveis novas só no `.env.deploy.example`, que nunca é carregado pelo `next dev`.

## Atenção imediata — segredos vazados (D-146)

O `.env.local` e a chave privada `certificates/localhost-key.pem` estiveram **versionados e enviados ao `origin/main`**. Saíram do índice; o histórico não foi reescrito.

Antes de usar o app com dado real, rotacionar: senha da conexão Neon `development`, token R2 de development, `NEON_AUTH_COOKIE_SECRET`, par VAPID, `CRON_SECRET` e as senhas das duas contas de development. Nenhum desses valores pode ser reaproveitado em produção.

## Ainda NÃO concluído

- Vercel ainda precisa ser conectada/deployada.
- Token R2 de **produção** não existe. O de development está limitado a `date-media-dev`.
- O webhook `user.before_create` existe em código, mas **ainda não está cadastrado** no console do Neon. Enquanto não estiver, o serviço aceita cadastro de qualquer origem que conheça a base URL (D-043). `pnpm auth:probe-prod` é a prova de que ele está barrando; ela não foi executada.
- O domínio de produção precisa ser registrado como origem confiável no Neon Auth antes do deploy (D-046).
- `production` intocada: nenhuma migration, nenhum dado, nenhuma conta.
- ~~Dois testes de `tests/schema.test.ts` falham: o schema tem 18 tabelas e 12 enums, e `docs/DATABASE.md` documenta 14 e 9.~~ **Fechado no B11.5**: a seção 4 do `docs/DATABASE.md` passou a descrever as quatro tabelas de notificação, a seção 5 os três enums novos, e o teste voltou a contar dezoito e doze. `pnpm test` verde.

## Regra de ambientes

### Local / desenvolvimento

- Neon: `development`
- R2: `date-media-dev`
- Dados: fictícios/teste
- Nunca usar segredos ou dados reais de produção.

### Produção

- Neon: `production`
- R2: `date-media-prod`
- Dados: reais do casal
- Só recebe migrations e código depois de validação em desenvolvimento.

## Não recriar infraestrutura

O agente **não deve criar** outro projeto Neon, outros buckets R2, outro repositório ou outro backend. Ele deve integrar-se aos recursos existentes.

## Comandos de verificação

| Comando | O que exige |
|---|---|
| `pnpm lint` · `typecheck` · `test` · `build` | nada além do repo |
| `pnpm test:tz` | nada — roda a suíte de tempo em UTC, Nova York e no fuso local |
| `pnpm test:db` | Neon `development` |
| `pnpm test:media` | Neon `development` + R2 `date-media-dev` |
| `pnpm test:media-e2e` · `shots:media` | os dois acima + sessão de development |
| `pnpm test:dates` · `shots:dates` | Neon `development` + sessão de development |
| `pnpm test:planning` · `shots:planning` | Neon `development` + sessão de development |
| `pnpm test:memories` · `shots:memories` | Neon `development` + sessão de development |
| `pnpm test:discovery` · `shots:discovery` | Neon `development` + sessão de development |
| `pnpm test:e2e` | Neon `development` + R2 `date-media-dev` + sessão — os seis fluxos críticos, PWA e axe |
| `pnpm test:pwa` · `test:a11y` · `test:teclado` | os mesmos pré-requisitos, recortados |
| `pnpm test:measure` | idem; cria e remove 30 planos com foto, e imprime bytes e contagem de miniatura |
| `pnpm shots:pwa` | capturas em standalone emulado e a troca de tema com CSP |
| `pnpm test:notifications` · `shots:notifications` | Neon `development` + sessão — seção do Perfil e as duas rotas de notificação |
| `pnpm notifications:backfill` | Neon `development` — agenda os lembretes futuros dos dates já confirmados; idempotente |
| `pnpm r2:check` | confere bucket e endpoint sem conectar |
| `pnpm db:migrate:prod --eu-confirmo` | `.env.deploy` + Neon `production` |
| `pnpm auth:probe-prod --eu-confirmo` | idem + webhook já cadastrado no console |
| `pnpm auth:create-prod-users --eu-confirmo` | idem + a sonda acima tendo passado |
| `pnpm db:bootstrap:prod --eu-confirmo` | idem + os ids impressos pelo comando anterior |

Os quatro últimos abortam sem `NEON_BRANCH=production` e sem a flag digitada. A ordem entre eles não é preferência — ver `docs/PRODUCTION.md`.

## Próxima ação

A continuidade visual segue obrigatoriamente os tokens, primitives e padrões do R1 em `docs/DESIGN_SYSTEM.md`. O relatório de implementação, capturas e verificações está em `docs/R1_VISUAL_REBRAND.md`. `/kitchen-sink` demonstra o sistema novo; os mockups fornecidos são referência de direção, sem autorização para inventar features ou dados.

B12 — o código está pronto e verificado; o que falta é configuração e confirmação humana, na ordem da seção 3 de `docs/PRODUCTION.md`. Comece pela rotação dos segredos (D-146), que independe de tudo o mais.

Três verificações do B11 **não são possíveis fora de um aparelho** e ficam para o proprietário: a área segura real num telefone com recorte ou barra de gestos, a cor da barra de status no app instalado, e o fato de que no iPhone o app instalado tem cookie jar separado do Safari — o login dentro dele é pedido de novo, e isso é comportamento do sistema, não defeito. A lista escrita está no relatório do B11.
