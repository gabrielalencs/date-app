# DATE — Decision log

Decisões arquiteturais e o motivo. Entrada nova vai no topo. Nenhuma entrada é editada depois de registrada; decisão revertida vira entrada nova apontando para a antiga.

---

### D-085 — Ordem das opções de data ratificada
**11/09/2026.** Confirmada no topo, depois consenso, depois data. Era regra tácita que só existia no `sort` de `listPlanDateOptions`; passa a estar escrita na seção 5 do `docs/DATES_AND_VOTING.md`. A ordem é de produto, não de apresentação, e por isso é calculada na camada de dados: quem decide olha "qual data a gente já concorda", não qual foi criada primeiro. `blocked` vai para o fim porque um `no` já resolveu aquela linha.

### D-084 — O workspace de development tem exatamente dois membros
**11/09/2026.** As duas contas reais, e mais ninguém. Os perfis `seed_profile_alex` e `seed_profile_nina` continuam existindo como **autores** — `created_by` de planos e opções — e deixam de ser membros. Com quatro memberships, toda captura mostrava quatro pessoas votando num app para duas, e o dado não tinha a forma do produto. O seed passa a remover as memberships dos dois perfis que ele mesmo cria, escopado a esses dois ids, nunca tocando nas memberships das contas reais (a armadilha do B5). Consequência: voto é ato de membro, então o seed passa a lançar os votos de demonstração como os membros que encontrar no workspace, e não lança nenhum quando o `auth:bootstrap-dev` ainda não rodou.

### D-083 — Teste afirma sobre contrato de dado, não sobre rótulo visível
**11/09/2026.** Quando o rótulo é decisão de design, afirmar sobre ele é afirmar sobre algo que muda por motivo estético. "Decidindo" era ao mesmo tempo a StatusPill e o nome de um botão de transição, e o seletor por texto pegava os dois. O contrato é o atributo `data-*` — `data-status`, `data-day`, `data-confirmed` —, que existe para ser afirmado e não muda quando a copy muda. Generaliza o que o B6 fez no StatusPill.

### D-082 — Fixture restaura o estado anterior
**11/09/2026.** Nenhuma suíte deste projeto "limpa" destruindo dado que não criou. O `snapshotPlanos` do B6 é o modelo: guarda o que estava, deixa o teste mexer, devolve ao que estava. Apagar tudo e recriar do zero funciona até o dia em que a suíte roda contra um banco com dado do proprietário dentro. Generaliza o D-071 de fixtures de mídia para toda suíte.

### D-081 — Aparato de verificação novo não conta como verde até um defeito plantado tê-lo feito vermelho
**11/09/2026.** Três execuções verdes de uma suíte nova provam que os testes rodam, não que eles medem. A prova é plantar o defeito que a suíte existe para pegar e mostrar a saída vermelha, depois removê-lo e mostrar a verde. O B6 fez isso removendo o `timeZone` da formatação; o B7 faz agrupando por `toISOString().slice(0,10)`. Vale para todo instrumento novo — runner, fixture, medida em navegador, varredura. Complementa o D-058: lá o código não muda por teste vermelho, aqui o teste não é aceito por estar verde.

### D-080 — Modal só para confirmação destrutiva
**11/09/2026.** Conteúdo, formulário e detalhe moram em rota ou painel, porque não são interrupção — são destino. Modal e sheet ficam reservados ao que precisa de resposta antes de continuar, e na V1 isso é exatamente a confirmação de remover foto do R1. Revoga "abrir detalhes em sheet/modal no mobile" da seção 4.8 do `DATE_PROJECT_SPEC.md` e "sheet no mobile" da seção 9 do `docs/DATES_AND_VOTING.md`: o formulário de sugerir data fica embutido, e o dia selecionado do calendário é painel.

### D-079 — `completed` continua no calendário; `cancelled` e arquivado não
**11/09/2026.** Um date realizado continuar visível não é sujeira: é o registro de que aquele sábado teve alguma coisa, e o calendário é o primeiro lugar do produto onde ele vira arquivo de memória. Cancelado e arquivado saem porque não aconteceram e não vão acontecer — deixá-los ocuparia célula com ruído. O filtro é da consulta, não da interface.

### D-078 — Mês e dia moram na URL
**11/09/2026.** `/agenda?mes=2026-09&dia=2026-09-14`. A agenda é navegação, não estado de cliente: cada mês é uma URL de verdade, recarregar e compartilhar funcionam, o histórico do navegador se comporta e a leitura funciona sem JavaScript. Anterior, seguinte e "Hoje" são links, não botões com estado. Entrada ruim — `2026-13`, `abc`, vazio — cai no mês corrente **sem erro**: URL é entrada de usuário, e a resposta a uma entrada ruim aqui é o estado padrão, não uma tela de erro. `now` desce do servidor, como no B6, senão a hidratação diverge.

### D-077 — Só célula com conteúdo é link
**11/09/2026.** Uma grade de 42 células linkáveis são 42 paradas de tabulação antes de chegar ao resto da página, e dia sem nada não tem detalhe para abrir. Célula com pelo menos uma opção vira link para `?dia=...`; célula vazia é texto. Em consequência, criar plano a partir do dia selecionado fica fora da V1 do calendário — ela tornaria as 42 células interativas por um ganho que `/novo` seguido de sugerir data já entrega. Corrige a seção 4.8 do spec, que prometia o contrário.

### D-076 — Grade com seis linhas sempre
**11/09/2026.** 42 células, independentemente do mês. Um mês de 28 dias começando numa segunda cabe em 4 linhas e um de 31 começando num domingo precisa de 6; grade de altura variável faz o botão de "mês seguinte" escorregar sob o dedo entre um toque e o outro, e navegar é o gesto principal desta tela. O custo é um fevereiro ocasional mostrando duas semanas de março em tom apagado, e as células de fora do mês mostram conteúdo real — meio-mês vazio por conveniência de implementação seria mentira visual.

### D-075 — Janela da consulta semiaberta, por `startOfDayInApp`
**11/09/2026.** Da meia-noite da primeira célula à meia-noite do dia seguinte à última, as duas calculadas por `startOfDayInApp`, com `starts_at >= inicio and starts_at < fim`. Com `Date.UTC` no lugar de `startOfDayInApp` a janela começa três horas cedo demais, traz um date do dia anterior à noite como se fosse do primeiro dia e perde o da última célula depois das 21h. Semiaberta em vez de fechada porque o fim é uma meia-noite, e meia-noite pertence ao dia que começa. Usa o índice `plan_date_options_workspace_starts_at_idx`, que já existia.

### D-074 — `Date.UTC` é calculadora de calendário, nunca leitor de dia
**11/09/2026.** Os dois usos parecem iguais e não são. Sobre uma **tripla civil** já convertida — `Date.UTC(y, m-1, d)` para somar dias ou descobrir o dia da semana — é aritmética de calendário e é sancionado; é o que o `civilDaysBetween` já fazia. Sobre um **instante**, para descobrir que dia ele é, continua proibido: aquilo responde em UTC, e às 21h de São Paulo o UTC já é o dia seguinte. A regra em uma frase: converta para dia civil primeiro; depois de estar em dia civil, `Date.UTC` pode ser usada à vontade.

### D-073 — `dayKey()` é a única forma autorizada de agrupar por dia
**11/09/2026.** `lib/datetime.ts` passa a exportar `dayKey(instant)`, o `yyyy-MM-dd` daquele instante no fuso do app. Mesmo corpo de `toDateInputValue`, mas com nome próprio: ninguém agrupa um calendário com uma função chamada "valor de input de formulário", e o nome errado é como o recorte de ISO volta. A zona do D-059 cresce para barrar, fora do módulo, os leitores UTC de `Date` — `getUTCDate`, `getUTCDay`, `getUTCMonth`, `getUTCFullYear`, `getUTCHours` — e qualquer `.toISOString()` seguido de `.slice`, `.substring`, `.substr` ou `.split`. `toISOString()` sozinho continua permitido, porque serialização é uso legítimo; o que se proíbe é usá-lo para responder "que dia é".

### D-072 — A semana começa na segunda-feira
**11/09/2026.** SEG TER QUA QUI SEX SÁB DOM, como a prancha da marca mostra, e como se fala de fim de semana: sábado e domingo ficam juntos no fim da linha, que é onde a maior parte dos dates cai. Índice 0 = segunda, 6 = domingo, por `weekdayIndex()`. `getDay()` cru está fora de questão — devolve 0 = domingo e produz um erro de um dia que ninguém vê até o mês começar num domingo.

### D-071 — Fixtures mutáveis pertencem ao teste
**11/09/2026.** As suítes de mídia, datas e capturas criam planos temporários com UUID próprio e limpam apenas seus registros/objetos em development. Evita apagar mídia adicionada pelo proprietário em planos do seed ao rodar regressão visual. Capturas de mídia usam as fotografias editoriais como uploads explícitos de teste, sem povoar o produto com dados permanentes.

### D-070 — Fotografia editorial separada da mídia privada
**11/09/2026.** Duas fotografias de marca geradas para o R1 ficam em WebP local, com origem em `docs/BRAND_ASSETS.md`. São inspiração estática, nunca substitutas silenciosas da capa de um plano. Capa real continua pela rota autenticada; plano sem foto usa tipografia, categoria e horizonte. Logos existentes são reutilizados integralmente, sem recomposição tipográfica.

### D-069 — Motion pequeno, overlays com comportamento Radix
**11/09/2026.** Motion entra no grupo editorial Reveal e no dropdown do Select; páginas de dados permanecem Server Components. CSS atende hover/press e entrada de sheets/dialogs. Reduced motion remove deslocamento e loops. A confirmação nativa de remover foto passa para Dialog DATE, preservando a ação e adicionando cancelamento/foco verificáveis.

### D-068 — Select DATE headless com serialização explícita
**11/09/2026.** `@radix-ui/react-select` entrega teclado, foco, Escape, portal e seleção; a aparência usa tokens DATE. A opção vazia dos filtros é mapeada internamente e enviada por hidden input com o valor real. Reset e disabled fazem parte do contrato. Playwright usa roles/options em vez de selectOption e verifica valor chegando à Server Action. Não instalar shadcn ou outra biblioteca visual: mantém D-022 e a stack existente.

### D-067 — R1 substitui a direção de interface do B1
**11/09/2026.** Rebrand solicitado pelo proprietário: editorial + lifestyle + planejamento pessoal + fotografia. Navy é primary; coral fica em CTA de marca e pequenos sinais; cream, white, sage, blue, blush e taupe ganham papéis semânticos nos dois temas. Revisa D-004: prancha e mockups fornecidos agora orientam a composição, preservando acessibilidade e o escopo funcional. O sistema permanente está em `docs/DESIGN_SYSTEM.md`; raio editorial pode chegar a 20px. O R1 foi solicitado entre B5/B6, mas B6 já estava implementado na base recebida: preservá-lo, sem iniciar B7 ou posteriores.

### D-066 — Cache de mídia reduzido para 7 dias
**11/09/2026.** `immutable` permanece, porque a chave é uuid e o conteúdo nunca muda. O prazo cai de um ano para `max-age=604800`: em celular o cache é despejado muito antes disso, então o ano não comprava desempenho — só alargava a janela em que a foto fica no disco depois do logout. Revisa a seção 6 do `docs/MEDIA_R2.md`.

### D-065 — Limite de opções e duplicata vivem na aplicação
**11/09/2026.** O teto de 10 opções por plano e a recusa de opção duplicada são validados na camada de dados, não no schema. São limites de usabilidade, e virar constraint significaria migration para mudar de ideia. Contraste deliberado com o único parcial de `is_confirmed`, que é invariante de correção — duas datas oficiais seriam um estado impossível — e por isso vive no banco.

### D-064 — Desconfirmar só a partir de `planned`
**11/09/2026.** De `reserved` não se desconfirma: existe reserva presa àquela data, e desfazer sem tratar a reserva deixaria os dois em desacordo sobre o que está marcado. Quem quiser trocar a data de um plano reservado volta para `planned` de forma explícita, e aí desconfirma. A recusa é da camada de dados, não da interface.

### D-063 — Transições automáticas de status na mesma transação
**11/09/2026.** Criar a primeira opção move `idea` → `deciding`; confirmar move `deciding` → `planned`; desconfirmar volta para `deciding`. Sempre na transação da escrita que as causou, e sempre emitindo evento — ninguém descobre depois que o status mudou sozinho e não ficou registrado. Acrescenta também a pré-condição que o `DATA_ACCESS.md` antecipava: `deciding` → `planned` manual exige opção confirmada, porque sem data confirmada `planned` é um estado que mente.

### D-062 — Os dois votos são sempre visíveis
**11/09/2026.** Esconder o voto da outra pessoa até você votar evitaria ancoragem, que é um efeito real. Mas são duas pessoas decidindo juntas, e a transparência é o produto: ver que a outra pessoa marcou "talvez" é informação para conversar, não viés a eliminar. Decisão consciente, registrada para não ser relida como omissão.

### D-061 — `all_day` é dia do calendário, não instante
**11/09/2026.** Guardado como a meia-noite daquele dia em `America/Sao_Paulo` convertida para UTC, e renderizado de volta no mesmo fuso, o que devolve o mesmo dia. Comparação de dia civil — "é hoje?", "é futuro?" — nunca por aritmética de milissegundos: os dois lados vão para o fuso do app e comparam-se os campos de calendário.

### D-060 — Testes de tempo rodam em três fusos
**11/09/2026.** `TZ=UTC`, `TZ=America/New_York` e o fuso local. Teste de data que só roda no fuso de quem escreveu não testa nada — e este projeto é escrito em São Paulo e roda na Vercel em UTC, que é exatamente o par que produz o "sábado vira sexta". O Node 24 honra `TZ` no Windows, mas o Git Bash descarta a variável para zonas IANA nomeadas, então o runner é um script Node que passa `TZ` ao processo filho em vez de uma linha de shell.

### D-059 — `lib/datetime.ts` é o único dono do tempo
**11/09/2026.** Todo formato e toda interpretação de data e hora passam por ele, com `America/Sao_Paulo` declarado explicitamente. Fora dele o ESLint proíbe `toLocaleDateString`, `toLocaleTimeString`, `toLocaleString`, `Intl.DateTimeFormat` e os leitores locais de `Date` (`getHours`, `getDate`, `getDay`, `getMonth`, `getFullYear`, …). Mesma forma do D-037 e pelo mesmo motivo: formatar sem declarar o fuso funciona na máquina de quem escreve e quebra em produção, e nenhum teste local acusa. Convenção em documento não sobrevive a seis blocos de distância.

### D-058 — Código de produção não muda por teste vermelho
**11/09/2026.** Enquanto não estiver provado que o teste mede o que se pensa que ele mede, o vermelho é hipótese sobre o teste, não diagnóstico do produto. No B4 o `proxy.ts` foi alterado com base num teste que estava clicando no botão errado; a alteração foi revertida depois da verificação. Primeiro prova-se o instrumento, depois se toca no código.

### D-057 — Linha de corte declarada antes do bloco
**11/09/2026.** Todo prompt de bloco passa a nomear, em ordem, o que sai se o escopo esticar. Corte declarado no relatório é resultado; corte silencioso é dívida escondida. Nasce do escopo grande demais do B4.

### D-056 — Mutations exigem JavaScript
**11/09/2026.** Sem JS o DATE é navegável e privado — as páginas são Server Components e a autorização é do servidor —, mas não é operável: upload direto para o R2, reordenação e confirmação dependem do cliente. Não haverá esforço de progressive enhancement para escrita. Fecha a afirmação otimista do D-039.

### D-055 — `FOR UPDATE` dentro de transação é exceção sancionada
**11/09/2026.** A seção 3 do `docs/DATA_ACCESS.md` proibia ler-e-escrever por causa da janela entre a checagem e a escrita. Com a linha travada dentro da mesma transação a janela não existe, e escrita que depende do estado atual — validar transição, calcular a próxima `position` — precisa dessa forma. O proibido passa a ser leitura **sem trava** seguida de escrita.

### D-054 — `media.thumb_object_key` como coluna própria
**11/09/2026.** Cada foto tem duas saídas, `full` e `thumb`, e a miniatura precisa de chave própria em vez de ser derivada por convenção de string. É também a primeira migration incremental desde o B2: provar `generate → ler o SQL → aplicar em development` num caso de uma coluna vale antes de o B6 precisar do ciclo num caso grande.

### D-053 — Remoção apaga a linha antes do objeto
**11/09/2026.** O banco primeiro, o R2 depois. Se o R2 falhar sobra um objeto órfão, que custa alguns kilobytes; a ordem inversa deixaria uma linha apontando para objeto inexistente, que é imagem quebrada na tela. Coletor de órfãos é faxina futura, não correção — não entra agora.

### D-052 — Leitura de mídia por rota autenticada, nunca por URL assinada
**11/09/2026.** `/api/media/[id]` resolve o `AuthorizedContext` a cada requisição, busca a linha escopada por workspace e só então lê o objeto. URL assinada de leitura continua válida depois que a aba fecha, é compartilhável por acidente e muda a cada render, o que destrói cache. `next/image` com `unoptimized` e sem `remotePatterns`: o browser não precisa conhecer o host do R2.

### D-051 — Redimensionamento e reencode no cliente
**11/09/2026.** O browser decodifica, reduz para 2000px (e 640px na miniatura) e reencoda em WebP. Reencodar descarta o EXIF por construção, o que importa porque foto de celular carrega coordenada de GPS e um álbum de dates seria um mapa da casa do casal. Etapa separada de limpeza de metadado é etapa que alguém esquece. `sharp` permanece desligado no `pnpm-workspace.yaml`: o servidor não processa imagem.

### D-050 — Upload direto do browser para o R2 por URL assinada curta
**11/09/2026.** O limite de corpo de Server Action da Vercel é da ordem de 1 MB e foto de celular tem 3 a 8 MB. Passar pelo servidor exigiria levantar o limite, segurar o arquivo em memória de função e pagar duração por foto. A URL assinada expõe host e access key id na query string — inerente à assinatura e aceitável, porque vale para um método, uma object key e poucos minutos.

### D-049 — O seed não apaga o workspace
**10/09/2026.** O seed apagava o workspace por id e recriava; a cascata levava junto as memberships das contas Auth ligadas pelo `auth:bootstrap-dev`, e o app ficava inacessível depois de cada seed. Agora a limpeza é escopada ao que o seed cria — planos, que cascateiam, e eventos, que não têm FK — e o workspace e as memberships sobrevivem.

### D-048 — Playwright não reaproveita servidor
**10/09/2026.** `reuseExistingServer: false`. Um `next start` esquecido serviu build antigo e produziu dois diagnósticos errados: uma tela "quebrada" que era só stale, e um teste que media o build anterior. O custo é rebuildar a cada suíte; o benefício é a suíte nunca mentir sobre qual código rodou.

### D-047 — Seletor de teste por papel e nome, nunca por tipo
**10/09/2026.** `page.click('button[type="submit"]')` não é estrito e pega o primeiro do DOM — que, dentro do shell, é o "Sair" da sidebar. O teste deslogava e acusava o CRUD de quebrado. Teste de UI usa `getByRole` com nome.

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

### D-041 — Capa tipográfica até o B5
**10/09/2026.** Sem fotografia, a capa do card é o próprio título em Fraunces sobre `--surface-sunken`, com a categoria como rótulo. Um bloco cinza vazio de 300px é a diferença entre um app sem fotos e um app quebrado.

### D-040 — Categorias como lista canônica na aplicação
**10/09/2026.** `lib/categories.ts` guarda os oito slugs; a coluna segue `text` (D-026), então acrescentar categoria não exige migration. Valor desconhecido vindo do banco renderiza como **Outro** em vez de quebrar a tela. O seed do B2 usava rótulos livres e foi alinhado aos slugs.

### D-039 — Sem React Hook Form
**10/09/2026.** `<form>` + Server Action + Zod resolve com menos código e entrega funcionamento sem JavaScript. Reavaliar quando existir formulário com campos repetíveis ou validação dependente.

### D-038 — Entidade de outro workspace responde "não encontrado"
**10/09/2026.** Nunca "proibido": distinguir os dois confirmaria que o id existe, que é informação que quem procura não tinha. Mesma lógica da mensagem única de login do B3.

### D-037 — Camada de dados fechada estruturalmente
**10/09/2026.** Três camadas que se sobrepõem: zona de importação no ESLint deixando `@/db/client` inalcançável fora de `db/` e dos módulos de dados; contexto como primeiro parâmetro, com `workspaceId` nunca aceito como parâmetro; e teste com dois workspaces provando que o de fora é invisível. Convenção em documento não sobrevive a seis blocos de distância — isto sobrevive porque quebra o build.

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
