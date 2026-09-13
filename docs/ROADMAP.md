# DATE — Roadmap

Este documento substitui a referência a `docs/10_ROADMAP.md`.

## Regra de execução

Um bloco por vez. Todo trabalho acontece na `develop`; `main` é a branch estável.

```
develop
   ↓
implementação pelo agente
   ↓
auto-verificação do bloco
   ↓
Definition of Done atendida
   ↓
merge em main pelo proprietário
```

Nenhum bloco começa com o anterior incompleto. Nenhum agente abre dois blocos simultâneos. A auditoria independente é um comando sob demanda do proprietário, não uma etapa fixa do fluxo — ver D-013 e D-014.

---

## B0 — Fundação

Scaffold do Next 16, estrutura de pastas, scripts, `.gitignore`, assets de marca em `public/brand/`, documentação corrigida, Vitest com um teste de fumaça. Zero serviço externo, zero segredo.

**Entrega:** `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` passando num repositório vazio de features.
**Passo humano ao final:** importar o repo na Vercel e confirmar deploy do Next vazio.

## B1 — Design System

Tokens CSS da paleta DATE, Fraunces e Inter via `next/font`, tema `light`/`dark`/`system` por token (nunca inversão automática), primitivas de componente (botão, campo, card, sheet, badge, skeleton, estado vazio), app shell com bottom nav no mobile e sidebar no desktop, primitivas de movimento respeitando `prefers-reduced-motion`.

**Entrega:** uma rota `/_kitchen-sink` (não linkada) exibindo todos os componentes nos dois temas, em 320px, 390px e desktop.
**Documento:** `docs/DESIGN_SYSTEM.md`.

## B2 — Banco

Drizzle code-first. Entidades: `workspaces`, `workspace_members`, `plans`, `plan_links`, `plan_date_options`, `plan_date_votes`, `checklist_items`, `expenses`, `reactions`, `media`, `memories`, `activity_events`. Primeira migration aplicada **somente** em `development`. Seed com dados fictícios.

**Entrega:** migration versionada em Git, aplicada em `development`, seed reproduzível.
**Documento:** `docs/DATABASE.md`.
**Bloqueio humano:** connection string da branch `development`.

## B3 — Auth

`createNeonAuth()` de `@neondatabase/auth/next/server`. Tela de login própria com identidade DATE. Sem rota, botão ou link de signup em lugar nenhum. `ALLOWED_EMAILS` server-only. Resolução de workspace por `workspace_members`. Helper central de autorização que toda query de negócio é obrigada a atravessar.

**Entrega:** login funcional, sessão persistente, logout, rota protegida retornando 403 para e-mail fora da allowlist.
**Documento:** `docs/AUTH_AND_SECURITY.md`.
**Bloqueio humano:** Auth Base URL e cookie secret.

## B4 — CRUD do DATE

Criar, listar, ver, editar e arquivar plano. Cadastro rápido primeiro (título e categoria bastam), detalhes opcionais depois. Máquina de status `idea → deciding → planned → reserved → completed | cancelled` com transições validadas no servidor. Grid de Ideias com busca e ordenação.

**Entrega:** ciclo completo sem imagem, com estados de loading, vazio e erro escritos à mão.

## B5 — Mídia R2

Upload via presigned URL curta, validação de MIME e tamanho no servidor, object key gerada pelo servidor e nunca aceita do cliente, capa e galeria do plano, leitura por URL assinada.

**Entrega:** upload e exibição funcionando contra `date-media-dev`.
**Documento:** `docs/MEDIA_R2.md`.
**Bloqueio humano:** Access Key do token limitado ao bucket dev.

## R1 — Rebrand visual global (extraordinário)

Bloco solicitado entre B5 e B6. Na base efetivamente recebida, B6 já estava implementado: o R1 preserva e reestiliza suas telas, sem adicionar funcionalidade de B7/B8/B9. A linguagem do B1 é substituída por composição editorial, fotografia, navy estrutural, coral pontual, superfícies sage/blue/blush/taupe, controles DATE, Select Radix e Motion.

**Entrega:** sistema e nove telas atuais em claro/escuro; capturas abertas em 320/390/1280; comportamento acessível do Select e regressões de auth/HTTP/CRUD/mídia/datas verificados.

**Documentos:** `docs/DESIGN_SYSTEM.md`, `docs/BRAND_ASSETS.md` e `docs/R1_VISUAL_REBRAND.md`. Estes padrões se aplicam a todos os blocos seguintes.

## B6 — Datas e votação

Várias opções de data por plano. Voto `sim`/`talvez`/`não` por usuário. Consenso visível. Promoção de uma opção a data oficial, com efeito no status.

**Entrega:** o fluxo central do produto, ponta a ponta, com dois usuários de teste.

## B7 — Calendário

Visão mensal da `/agenda`: seis linhas sempre, semana começando na segunda, confirmadas e candidatas distinguidas por forma, navegação entre meses por link, dia selecionado em **painel** e volta para o plano. Filtro por categoria e faixa de próximos entregues junto. Fuso `America/Sao_Paulo` tratado explicitamente — agrupamento por `dayKey()`, janela semiaberta por `startOfDayInApp` e a zona do ESLint ampliada para barrar leitores UTC e recorte de ISO.

**Entrega:** a `/agenda` deixa de ser placeholder. Nenhuma escrita nova — o calendário lê o que o B6 grava.

**Revisões:** sheet no mobile e criação a partir do dia saíram (D-077, D-080). Modal passa a ser exclusivo de confirmação destrutiva; criar plano a partir da célula tornaria as 42 células interativas por um ganho que `/novo` já entrega.

**Documento:** `docs/CALENDAR.md`.

## B8 — Planejamento

Reserva com estado e o acoplamento com a máquina de status nos dois sentidos, checklist ordenável com autor e horário, gastos em centavos com total. As três no detalhe do plano.

**Entrega:** o ponto de arquitetura vale mais que as três funcionalidades — um status só é alcançável quando o fato que ele afirma existe, e transição manual não desfaz fato de domínio (D-091). `lib/money.ts` passa a ser o dono do dinheiro, com zona no ESLint e parse pt-BR que recusa o ambíguo em vez de adivinhar.

**Migration:** só `reservations` e o CHECK de valor não negativo em `expenses`. `checklist_items` e `expenses` já existiam desde o B2 na forma certa, e o verbo `booking_updated` já existia no enum.

**Revisões:** a mensagem do B6 sobre voltar para Planejado antes de desmarcar a data saiu, porque aquele caminho deixou de existir. `formatBRL` saiu de cena.

**Documento:** `docs/PLANNING.md`.

## B9 — Memórias e timeline

Pós-`completed`: galeria, avaliação por usuário, "repetiria?", destaque, gastos reais. Timeline cronológica por mês e ano.

## B10 — Descoberta

Favoritos e "quero muito", filtros combinados, sorteador "escolhe pra gente" com animação curta, activity feed leve.

## B11 — PWA e endurecimento

Manifest, ícones 192/512/maskable/apple-touch/favicon, `display: standalone`, safe-area, headers de segurança, Playwright nos fluxos críticos, auditoria de acessibilidade e performance mobile.

## B12 — Produção

Webhook `user.before_create` com verificação de assinatura, migration em `production`, token R2 prod, variáveis na Vercel, criação dos dois usuários reais, deploy.

**Nenhuma etapa do B12 acontece sem confirmação explícita do proprietário, uma por uma.**

---

## Fora de escopo na V1

Push notifications, sincronização offline, preview de Open Graph, estatísticas avançadas, qualquer IA dentro do produto, terceiro usuário.
