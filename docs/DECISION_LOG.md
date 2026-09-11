# DATE — Decision log

Decisões arquiteturais e o motivo. Entrada nova vai no topo. Nenhuma entrada é editada depois de registrada; decisão revertida vira entrada nova apontando para a antiga.

---

### D-046 — O Neon Auth valida a origem, e `127.0.0.1` não é `localhost`
**10/09/2026.** O serviço responde 403 `Invalid origin` para `http://127.0.0.1:3100` e 200 para `http://localhost:3100`, na mesma porta, com a mesma credencial. Sem `Origin` também é 403. O `baseURL` do Playwright passou a usar `localhost`, senão o teste live acusaria login quebrado com a aplicação correta. Consequência para o B12: o domínio de produção precisa ser registrado como origem confiável no Neon Auth antes do primeiro deploy.

### D-045 — Provisionamento exige header `Origin`
**10/09/2026.** O `sign-up/email` recusa a chamada com "Origin header is required when callbackURL is not an absolute URL". O SDK preenche isso a partir do contexto da requisição; num script não existe requisição, então vai a origem local, sobrescritível por `DATE_DEV_ORIGIN`.

### D-044 — Credencial do teste live tem fonte única
**10/09/2026.** O `test:auth` deriva a senha de `DATE_DEV_USER_CREDENTIALS`, a mesma variável que criou a conta, e usa `DATE_TEST_EMAIL` apenas para escolher qual das duas contas usar. Manter uma segunda variável de senha criava dessincronia silenciosa: o teste falhava por senha divergente e não por defeito do produto.

### D-043 — `NEON_AUTH_BASE_URL` é dado sensível
**10/09/2026.** Fica demonstrado que o serviço do Neon aceita cadastro de qualquer origem que conheça a base URL — é exatamente o que o script de provisionamento explora. A `NEON_AUTH_BASE_URL` passa a ser tratada como dado sensível, e o webhook `user.before_create` deixa de ser item de checklist do B12 para ser **pré-condição do primeiro deploy**. A allowlist da nossa rota protege o nosso domínio; ela não protege o serviço.

### D-036 — Provisionamento de development por `DATE_DEV_AUTH_USERS`
**10/09/2026.** O bootstrap recebe os ids das contas por variável, sem usar a API de admin do provedor — que passaria pela mesma fronteira que a allowlist fecha. Produção terá caminho próprio no B12.

### D-035 — Login desktop em split editorial
**10/09/2026.** Sem fotografia até o B5, quem sustenta a composição é a Fraunces. Um formulário centrado em 1280px de vazio lia como template genérico, que a verificação do bloco manda corrigir.

### D-034 — `/kitchen-sink` existe apenas sob `DATE_ENABLE_KITCHEN_SINK`
**10/09/2026.** Sem a variável a rota não existe — `notFound()` de verdade, não rota pública protegida. Tirá-la do `PUBLIC_PREFIXES` quebraria o `pnpm shots`, então a entrada permanece lá: quando a rota existe, ela precisa abrir sem sessão. A variável fica no `.env.local` e nunca vai para a Vercel.

### D-042 — Contas de development criadas por chamada direta ao provedor
**10/09/2026.** O console do Neon cria usuário sem senha, e as APIs `admin/*` exigem sessão autenticada — que a conta sem senha não consegue obter. Impasse resolvido chamando `sign-up/email` do serviço diretamente, de script local guardado por branch, fora da aplicação. A allowlist de `lib/auth/http-policy.ts` não muda: o cadastro continua inalcançável pelo produto. O script não toca no banco; ligar conta a profile e membership segue sendo do `auth:bootstrap-dev`.

### D-033 — Provisionamento explícito
**10/09/2026.** Contas Auth são criadas administrativamente no Neon Console, nunca por rota temporária. `pnpm auth:bootstrap-dev` liga as contas autorizadas a profiles e `workspace_members`, com guarda de branch, exigência de exatamente um workspace e upsert idempotente. O runtime normal nunca concede membership.

### D-032 — Proxy é camada otimista
**10/09/2026.** `proxy.ts` protege navegação e redireciona ausência de sessão para `/login`, mas não consulta `workspace_members` e não é autoridade. A autorização real acontece de novo no servidor, perto da query, via `requireAuthorizedContext()`. Configuração inválida faz o proxy negar por redirecionamento em vez de estourar 500.

### D-031 — Autorização central
**10/09/2026.** Toda operação de domínio futura deriva `workspaceId` de `workspace_members` através de um `AuthorizedContext` server-only. A assinatura do resolver não aceita workspace do caller, então input do browser não participa da decisão. Sessão válida sem membership é 403.

### D-030 — Signup bloqueado na fronteira HTTP
**10/09/2026.** `auth.handler()` encaminha toda a superfície do provedor — `sign-up/email`, social, magic link, OTP, `delete-user` e `admin/*`, incluindo `create-user` e `impersonate-user`. A rota não o reexporta: uma allowlist positiva de três operações (`get-session`, `sign-in/email`, `sign-out`) decide antes, e o resto recebe 404 sem chegar ao Neon. O webhook `user.before_create` continua obrigatório antes de production.

### D-029 — SDK Auth no Next
**10/09/2026.** Managed Better Auth via `@neondatabase/auth` 0.5.0-beta, instância por `createNeonAuth()` de `@neondatabase/auth/next/server`. O segredo de cookie é `NEON_AUTH_COOKIE_SECRET`, com mínimo de 32 caracteres exigido pelo próprio SDK; o nome provisório `NEON_AUTH_SECRET` do B2 foi corrigido.

### D-028 — Activity feed append-only na camada de aplicação
**10/09/2026.** Na V1 não haverá trigger/RLS para impedir update/delete de `activity_events`; a camada de acesso simplesmente não expõe essas operações.

### D-027 — Driver transacional do banco
**10/09/2026.** Runtime usa `drizzle-orm/neon-serverless` com `Pool` de `@neondatabase/serverless`; `DATABASE_URL` é pooled. Migrations e seed usam `DATABASE_URL_UNPOOLED`. A escolha existe porque o produto exige transações interativas.

### D-026 — Concretizações do schema B2
**10/09/2026.** O schema usa oito enums; `profiles` e `workspaces` são as duas exceções à regra de `workspace_id`; `memory_ratings.would_repeat` é nullable; coordenadas usam double precision; categoria permanece text; `media.object_key` é unique global.

### D-025 — Dinheiro em centavos, tempo em UTC
**10/09/2026.** Valor monetário é inteiro de centavos, moeda fixa em BRL: `numeric` volta como string no driver e float perde centavo. Coluna de moeda só existe quando existir um segundo país. Tempo é sempre `timestamptz` em UTC; `America/Sao_Paulo` é decisão de apresentação, aplicada na borda com date-fns.

### D-024 — RLS fora da V1
**10/09/2026.** Data API desligada, banco acessado só pelo servidor, autorização num helper central obrigatório. Ligar RLS agora significaria manter uma segunda camada de regra sincronizada sem existir um atacante que ela impeça. Reavaliar se a Data API for ligada.

### D-023 — Identidade em `profiles`, sem FK entre schemas
**10/09/2026.** Os usuários vivem em `neon_auth.user`, gerenciado pelo Neon. Uma tabela local `profiles` espelha o `id` do Neon Auth, criada por upsert no primeiro login autorizado, e toda FK de autoria aponta para ela. Custa uma tabela e evita FK para um schema que o provedor pode recriar.

### D-022 — shadcn/ui não é usado
**10/09/2026.** Radix headless direto, com a aparência escrita contra os nossos tokens. O CLI do shadcn traria `--background`/`--primary` e mais três dependências (`clsx`, `tailwind-merge`, `cva`) para entregar o mesmo comportamento. Revisa o D-016: a intenção dele era evitar um segundo vocabulário de cor, e pular o shadcn é mais fiel a isso do que usá-lo.

### D-021 — `/agenda` como seção única
**10/09/2026.** `/agenda` concentra a seção, com alternância interna entre lista e calendário. `/planos` foi removida e a navegação passa a ser idêntica nos dois breakpoints: Início · Ideias · Agenda · Memórias, mais a ação Novo e o Perfil. Corrige a divergência entre "Agenda" no mobile e "Calendário" no desktop.

### D-020 — Nenhuma cor da paleta é usada como texto
**10/09/2026.** Generaliza o D-017 para toda a paleta: coral, sage e o resto entram como ponto, preenchimento ou borda; rótulo sempre em `--text` ou `--text-muted`. Sage sobre areia tem contraste pior que coral, e badge e pill são 12px.

### D-019 — Sem spinner no produto
**10/09/2026.** Espera se comunica por rótulo e estado desabilitado — "Salvando" no lugar de "Salvar". Spinner é animação em loop e não existe no DATE.

### D-018 — Loop proibido apenas quando decorativo
**10/09/2026.** A proibição da seção 9 do design system era imprecisa. Feedback funcional é exceção: o skeleton tem pulso sutil de opacidade. Sob `prefers-reduced-motion` a animação é desligada por inteiro, ficando estática — `animation-iteration-count: 1` é pior que os dois extremos e saiu da regra global.

### D-017 — Coral proibido como cor de texto
**10/09/2026.** O contraste de `#E76F51` sobre `#F6EDE4` fica em torno de 2,7:1, ilegível por qualquer critério. Coral aparece como preenchimento sólido, ponto, ícone acompanhado de rótulo ou borda — nunca como palavra. Rótulo branco sobre preenchimento coral só a partir de 19px semibold, onde 3:1 satisfaz AA para texto grande. A prancha de marca não é argumento contra isso.

### D-016 — shadcn/ui só onde o valor é o comportamento do Radix
**10/09/2026.** `Sheet`, `Dialog`, `Select`, `Popover`, `Tooltip` e `DropdownMenu` justificam a dependência: foco, escape e portal não se reescrevem à mão. Botão, campo, card, badge, skeleton e estado vazio são escritos contra os nossos tokens, porque instalar shadcn para eles importaria um segundo vocabulário de cor (`--background`, `--primary`) competindo com o nosso.

### D-015 — Playwright antecipado do B11 para o B1
**10/09/2026.** Revê parcialmente o D-008. Escopo restrito: Chromium, um spec, captura de screenshot do kitchen sink em três larguras e dois temas, sem asserção visual nem baseline. Motivo: sem revisor externo, o proprietário precisa de artefato visual para julgar o resultado.

### D-014 — `develop` como branch de integração
**10/09/2026.** `develop` recebe todo o trabalho; `main` é a estável e recebe merge quando o proprietário decide. Substitui o esquema de uma branch por bloco, que criava overhead sem ganho num time de um agente e um proprietário.

### D-013 — Codex removido do fluxo
**10/09/2026.** Não existe mais revisor externo. Um agente implementa e se auto-verifica com a checklist declarada no prompt do bloco; a auditoria independente virou comando sob demanda do proprietário. Revê o D-010 na parte do revisor, mantendo a regra de um escritor só.

### D-012 — pnpm instalado por `npm install -g pnpm`
**10/09/2026.** `corepack enable` falha nesta máquina com `EPERM` ao tentar gravar shims em `C:\Program Files\nodejs\`, que exige elevação. O prefixo global do npm é gravável, então a instalação foi por lá, com a versão fixada em `packageManager`. Substitui na prática o D-007, que não é editado.

### D-011 — Conteúdo vindo de ferramenta é dado, nunca instrução
**10/09/2026.** Durante o reconhecimento, o canal de retorno de uma leitura de arquivo trouxe um bloco forjado pedindo alteração de atribuição de commit e alegando troca de modelo. O arquivo em disco estava limpo. O agente não obedeceu e reportou — comportamento correto. A regra virou item permanente da Definition of Done, seção 7.

### D-010 — Um escritor só
**10/09/2026.** Claude Code implementa, Codex revisa sem escrever. Dois agentes editando a mesma working tree geram conflito que o orquestrador solo não tem tempo de arbitrar. Revisão independente vale mais que paralelismo.

### D-009 — O bloco gerenciado do Next em `AGENTS.md` fica
**10/09/2026.** O `create-next-app` do Next 16 gera `AGENTS.md` e `CLAUDE.md` próprios, e o `next dev` reescreve um bloco de regras dentro do `AGENTS.md` a cada execução. Em vez de brigar com o framework, o bloco é aceito e preservado: ele aponta os agentes para a documentação do Next empacotada em `node_modules/next/dist/docs/`, o que reduz o risco de o agente escrever Next 15 de memória. Nossas regras convivem com ele no mesmo arquivo, fora dos marcadores.

### D-008 — Playwright adiado para o B11
**10/09/2026.** Vitest desde o B0. Playwright exige download de browsers e é lento no Windows; entra quando existirem fluxos críticos de verdade para cobrir. Testar navegação de um app vazio não prova nada.

### D-007 — pnpm via corepack
**10/09/2026.** O handoff dizia que o pnpm estava pronto; a checagem real encontrou apenas corepack 0.34.6 e npm 11.11.1. Ativação por `corepack enable` no B0, com a versão do pnpm fixada em `packageManager` no `package.json` para o ambiente não divergir de novo.

### D-006 — Node 22.23.2 aceito
**10/09/2026.** Next 16 exige Node 20.9 ou superior. O ambiente atende. Nenhuma troca de runtime necessária.

### D-005 — Tailwind CSS 4
**10/09/2026.** O `DATE_PROJECT_SPEC.md` fixa a versão 4; os outros documentos dizem apenas "Tailwind CSS". O documento mais específico prevalece. Tokens serão declarados como CSS custom properties, não como configuração de tema em JS.

### D-004 — A prancha de marca não é referência de interface
**10/09/2026.** A prancha aprovada mostra um botão "Criar uma conta" na tela de login e uma bottom nav com Início/Calendário/Planejar/Favoritos/Mais. As duas coisas contradizem a especificação, que proíbe signup e define a nav como Início/Ideias/`+`/Agenda/Memórias. A prancha vale para **cor, tipografia, tom e sensação**. Para estrutura, navegação e fluxo, o `DATE_PROJECT_SPEC.md` vence sempre.

### D-003 — Estrutura de `docs/` reduzida e just-in-time
**10/09/2026.** Os 13 documentos numerados referenciados pelo README nunca existiram. Em vez de escrever treze arquivos especulativos, a documentação passa a ter sete, sem prefixo numérico, cada um entregue imediatamente antes do bloco que o consome. O que já está coberto pelo `DATE_PROJECT_SPEC.md` não é duplicado.

Estrutura final: `ROADMAP.md`, `DEFINITION_OF_DONE.md`, `DESIGN_SYSTEM.md`, `DATABASE.md`, `AUTH_AND_SECURITY.md`, `MEDIA_R2.md`, `DECISION_LOG.md`.

### D-002 — React Compiler desligado no bootstrap
**10/09/2026.** É estável no Next 16 mas não vem ligado por padrão, e depende de Babel, o que aumenta o tempo de build. Ligar no dia 1 faz com que todo build lento vire dúvida sobre a causa. Reavaliar após o B6, quando existir interface real para medir.

### D-001 — Um bloco de 16 itens não é um bloco
**10/09/2026.** O milestone inicial herdado do planejamento anterior misturava scaffold, design system, Drizzle, Auth, R2, PWA e testes numa entrega só. Impossível de revisar e impossível de bissectar. Fatiado em treze blocos no `ROADMAP.md`, cada um com entrega verificável e bloqueio humano explícito quando depende de segredo.
