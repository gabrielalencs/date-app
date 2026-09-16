# DATE — B3b: provisionar as contas de development

Bloco curto, entre o B3 e o B4.

Antes do B4, falta uma peça do B3: as duas contas de `development` existem no Neon, mas foram criadas pelo console, que **não pede senha**. Sem credencial, `signIn.email()` não tem o que validar e o `test:auth` não tem o que provar.

O papel de admin não resolve o impasse: as APIs de admin exigem uma sessão autenticada, e autenticar exige a senha que não existe.

## O que fazer

O serviço do Neon aceita `sign-up/email`. Quem bloqueia isso é a nossa rota, não o provedor. Então as contas são criadas chamando o serviço **diretamente**, de um script local, fora da aplicação — provisionamento out-of-band, coerente com o D-033 e o D-036. A aplicação continua sem qualquer porta de cadastro, e a allowlist da rota **não muda**.

As duas contas atuais serão apagadas pelo proprietário no console antes de rodar o script, porque elas ocupam os e-mails.

## Antes de escrever

Confirmar no pacote instalado, não de memória:

- qual subpath do `@neondatabase/auth` funciona **fora do Next** — `./server` ou `./vanilla` existem justamente para isso, e o `./next/server` depende de `next/headers`, que não existe num script Node;
- como a URL final de `sign-up/email` é composta a partir da base URL, já que a base já termina em `/auth` e a doc do Neon descreve o caminho de um jeito que pode confundir;
- qual a forma exata do retorno, incluindo o id do usuário criado.

Se o SDK não servir num script puro, usar `fetch` direto contra o endpoint, documentando de onde saiu o caminho.

## O script

`pnpm auth:create-dev-users`, ao lado do `auth:bootstrap-dev` que já existe.

Requisitos:

1. **Aborta** se `NEON_BRANCH` não for exatamente `development`. Imprime branch e host antes de qualquer chamada, nunca credencial.
2. Lê as credenciais de uma variável nova, `DATE_DEV_USER_CREDENTIALS`, no formato `email:senha,email:senha`. Placeholder no `.env.example`, valor só no `.env.local`.
3. Exige que os dois e-mails sejam exatamente os de `ALLOWED_EMAILS`. Qualquer divergência aborta — e-mail que não bate com a allowlist gera uma conta que nunca vai conseguir entrar.
4. **Nunca imprime senha**, em nenhuma circunstância, nem em erro, nem em log de debug.
5. É idempotente no sentido prático: se a conta já existe, reporta isso e segue para a próxima em vez de estourar.
6. Ao final, imprime a linha pronta para colar no `.env.local`: `DATE_DEV_AUTH_USERS=<id>:<email>,<id>:<email>`. Ids não são segredo e o proprietário precisa deles. Senhas não aparecem.
7. Não toca no banco. Não cria profile, não cria membership — isso é o `auth:bootstrap-dev`, que já existe e foi testado.

Provar a guarda de ambiente rodando com `NEON_BRANCH=production` e colar a saída do abort.

## Depois

Parar e avisar, para o proprietário colar a linha de `DATE_DEV_AUTH_USERS` e o `DATE_TEST_EMAIL`/`DATE_TEST_PASSWORD`. Então o agente retoma exatamente o Passo 0 do B4: `auth:bootstrap-dev`, `test:auth`, cinco portões, `HANDOFF_STATUS.md`, e só aí o CRUD.

## Decision log

- **D-042** — Contas de development provisionadas por chamada direta ao `sign-up/email` do provedor, a partir de script local guardado por branch.
- **D-043** — Fica demonstrado que o serviço do Neon aceita cadastro de qualquer origem que conheça a base URL. A `NEON_AUTH_BASE_URL` passa a ser tratada como dado sensível, e o webhook `user.before_create` deixa de ser item de checklist do B12 para ser pré-condição do primeiro deploy.

## Fora de escopo

Nenhum CRUD, nenhuma tela, nenhuma mudança na allowlist de `lib/auth/http-policy.ts`, nenhuma rota nova, nenhum schema. Não alterar o `auth:bootstrap-dev`.

## Origem de instrução

Seção 7 do `docs/DEFINITION_OF_DONE.md`.
