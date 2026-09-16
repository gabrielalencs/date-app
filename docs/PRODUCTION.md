# DATE — Produção (B12)

O que o B12 construiu, o que ele deliberadamente **não** faz sozinho, e a ordem
em que as coisas acontecem.

Nenhum comando deste documento roda por iniciativa do agente. Os quatro
comandos de produção exigem confirmação digitada, e a ordem entre eles não é
preferência: cada um depende de um fato que o anterior estabelece.

---

## 1. O problema que o webhook resolve

A allowlist de `lib/auth/http-policy.ts` protege o **nosso domínio**. Ela não
protege o serviço do Neon.

O provedor aceita cadastro de qualquer origem que conheça a
`NEON_AUTH_BASE_URL` — é exatamente o que o `pnpm auth:create-dev-users` faz,
de fora da aplicação, sem sessão. Enquanto essa porta existir, "a V1 tem
exatamente dois usuários" é uma afirmação sobre a nossa interface, não sobre o
sistema (D-043).

O webhook `user.before_create` é o único lugar em que essa regra vira regra do
provedor. Por isso ele é **pré-condição do primeiro deploy**, e não item de
checklist.

### Como funciona

`app/api/webhooks/neon-auth/route.ts` recebe a entrega, verifica a assinatura e
devolve `{ "allowed": true }` ou `{ "allowed": false, ... }`.

A verificação é EdDSA (Ed25519) sobre um **JWS destacado** — não há segredo
compartilhado. A chave pública vem de `<NEON_AUTH_BASE_URL>/.well-known/jwks.json`,
escolhida pelo `kid` do header `X-Neon-Signature-Kid`. Rotação de chave do lado
do Neon não exige tocar em nada aqui.

O detalhe em que toda implementação ingênua falha, e que tem teste próprio: o
payload assinado é **base64url duas vezes**.

```
payloadB64          = base64url(corpo cru)
signaturePayload    = `${timestamp}.${payloadB64}`
signaturePayloadB64 = base64url(signaturePayload)
signingInput        = `${headerB64}.${signaturePayloadB64}`
```

Reconstruir `${timestamp}.${corpo}` produz assinatura sempre inválida, e o
sintoma é indistinguível de chave errada no JWKS.

### O que ele recusa

Fecha por padrão em todos os caminhos: headers ausentes, assinatura inválida,
entrega fora da janela de cinco minutos, `kid` desconhecido, corpo ilegível,
envelope sem `user.email`, e-mail fora da `ALLOWED_EMAILS`, e ambiente sem
`ALLOWED_EMAILS` configurada.

A recusa sai com status **200**, não 4xx. O provedor só lê a decisão em resposta
2xx; um 401 também barraria o cadastro, mas por falha de entrega, com três
tentativas de retry, e a pessoa veria erro genérico em vez da recusa.

### Duas coisas que o proxy precisa saber

`/api/webhooks/neon-auth` está em `PUBLIC_PREFIXES` no `proxy.ts`. Sem isso a
rota responderia um redirect para `/login`, o provedor leria resposta inválida
e — porque ele também falha fechado — **todo** cadastro passaria a ser recusado,
inclusive o das duas contas reais. Há teste de fronteira para exatamente isso em
`tests/e2e/auth-boundary.spec.ts`.

Deduplicação de entrega: o provedor reenvia com o mesmo `X-Neon-Event-Id` e pede
a mesma resposta. A decisão é função pura do corpo — mesmo e-mail, mesma
resposta — então não há estado a guardar.

---

## 2. Os quatro comandos, e as três travas

| Comando | O que faz |
|---|---|
| `pnpm db:migrate:prod` | aplica `db/migrations` na branch `production` |
| `pnpm auth:probe-prod` | prova que o webhook barra um terceiro |
| `pnpm auth:create-prod-users` | cria as duas contas reais no Neon Auth |
| `pnpm db:bootstrap:prod` | cria o workspace e liga as duas contas a ele |

Cada um aborta a menos que as três travas estejam satisfeitas:

1. **`NEON_BRANCH=production`**, que só existe no `.env.deploy` —
   arquivo separado, nunca commitado, carregado por `--env-file` explícito. O
   `next dev` não o enxerga;
2. **`--eu-confirmo`** digitado à mão na linha de comando;
3. **o host impresso antes da escrita**, que só uma pessoa lê.

```bash
pnpm db:migrate:prod --eu-confirmo
```

Sem a flag, o comando imprime branch e host e para. É de propósito: a primeira
execução serve para você ler o host.

As travas de development continuam de pé e **não devem ser removidas**:
`pnpm db:migrate` e `pnpm auth:bootstrap-dev` seguem abortando se a branch não
for `development`. O B12 não afrouxou nenhuma delas; abriu uma porta nova, com
fechadura própria.

`drizzle-kit push` continua proibido em produção.

---

## 3. Ordem de execução

A ordem importa. Cada passo depende de um fato do anterior.

### 3.1 Antes de qualquer coisa: rotacionar os segredos de development

O `.env.local` esteve versionado no repositório. Todos os valores de
development precisam ser trocados, e **nenhum** deles pode ser reaproveitado em
produção:

- senha da conexão Neon `development`;
- token R2 de development;
- `NEON_AUTH_COOKIE_SECRET`;
- par VAPID;
- `CRON_SECRET`;
- senhas das duas contas de development.

### 3.2 Preparar o arquivo local

```bash
cp .env.deploy.example .env.deploy
```

Preencha com os valores da branch `production`. A `DATABASE_URL_UNPOOLED` é a
connection string **direta** — o script recusa uma com `-pooler` no host, porque
migration precisa da mesma sessão do começo ao fim.

Este arquivo nunca vai para a Vercel e nunca é commitado.

### 3.3 Variáveis na Vercel, ambiente Production

A lista está no `.env.deploy.example` mais as do runtime. A pooled
(`DATABASE_URL`) vai para a Vercel; a direta fica só na sua máquina.

Nunca coloque na Vercel: `DATABASE_URL_UNPOOLED`, `DATE_ENABLE_KITCHEN_SINK`,
`DATE_DEV_USER_CREDENTIALS`, `DATE_DEV_AUTH_USERS`, `DATE_TEST_EMAIL`,
`DATE_PROD_USER_CREDENTIALS`.

`R2_BUCKET` tem que ser `date-media-prod`. Desde o B12 a guarda é simétrica: com
`NEON_BRANCH=production` e qualquer outro bucket, a aplicação aborta antes do
primeiro byte. Isso existe para o erro mais provável do deploy — copiar as
variáveis de development e deixar o bucket para trás, mandando foto real para o
bucket de teste em silêncio.

### 3.4 Migrations

```bash
pnpm db:migrate:prod --eu-confirmo
```

Imprime as migrations do repositório, quantas já estavam aplicadas e quantas
ficaram. Nenhuma das `0000`–`0006` é destrutiva. **Não rode o seed**: produção
nunca recebe dado fictício.

### 3.5 Primeiro deploy

A rota do webhook precisa existir numa URL HTTPS pública antes de poder ser
configurada — o Neon recusa `http`, `localhost` e IP. Então o deploy vem antes
da configuração do webhook.

Nessa janela o serviço de Auth ainda está desprotegido. Ela é curta de
propósito: configure o webhook logo em seguida, e não crie conta nenhuma antes
de 3.7 passar.

### 3.6 Configurar o webhook no Neon

Console, CLI ou API, na branch `production`:

```bash
neon neon-auth config webhook update --enabled \
  --url https://SEU-DOMINIO/api/webhooks/neon-auth \
  --enabled-events user.before_create --timeout 5
```

Só `user.before_create`. Os outros seis eventos não são tratados — a rota
responde 200 sem efeito se algum chegar.

Registre também a URL final nos Trusted Origins do Neon Auth (D-046).

### 3.7 Provar que o webhook barra terceiros

```bash
pnpm auth:probe-prod --eu-confirmo
```

Tenta cadastrar um e-mail aleatório de domínio reservado, chamando o provedor
**direto** — que é o único ataque que o webhook existe para impedir. Testar sem
chamar direto seria testar outra coisa.

Risco declarado: se o webhook não estiver ligado, esta chamada cria uma conta de
verdade. Ela nasce sem profile e sem membership, então não alcança nenhum dado —
a autorização do DATE é `workspace_members`, não a sessão. Mesmo assim o script
imprime o id e manda apagá-la no console.

**Não siga adiante enquanto este comando não passar.**

### 3.8 Criar as duas contas reais

```bash
pnpm auth:create-prod-users --eu-confirmo
```

Imprime, no fim, a linha `DATE_PROD_AUTH_USERS=<id>:<email>,<id>:<email>`. Cole
no `.env.deploy`.

Se ele reportar `BLOQUEADA`, o webhook recusou um e-mail que está na sua
`ALLOWED_EMAILS` local — quase sempre porque a variável da Vercel está
diferente. Corrija lá, faça novo deploy, rode de novo.

### 3.9 Workspace e memberships

```bash
pnpm db:bootstrap:prod --eu-confirmo
```

Cria o workspace na primeira execução e reusa nas seguintes. Faz upsert de
profile e membership: `DATE_OWNER_EMAIL` vira `owner`, o outro vira `member`.
Nenhum DELETE, nenhum TRUNCATE. Aborta se o workspace terminar com um número de
membros diferente de dois.

Idempotente: rodar de novo depois de o casal já ter usado o app não toca em
plano, foto nem memória.

---

## 4. Verificação depois do deploy

- `/login` abre e não oferece criar conta;
- as duas pessoas entram;
- um DATE de teste é criado;
- uma foto sobe e aparece no bucket `date-media-prod`;
- notificações são ativadas pelo Perfil;
- o Cron diário aparece em Settings → Cron Jobs na Vercel.

Três coisas **não** são verificáveis fora de um aparelho e ficam para o
proprietário (D-139): área segura num telefone com recorte, cor da barra de
status no app instalado, e o cookie jar separado do iOS — no iPhone o app
instalado pede login de novo, e isso é comportamento do sistema, não defeito.

---

## 5. O que o B12 não fez

- Não criou projeto na Vercel, nem token R2 de produção, nem conta no Neon Auth:
  tudo isso é ato humano no painel de cada serviço.
- Não configurou o webhook: o endpoint existe, o cadastro dele no Neon é seu.
- Não tocou a branch `production`. Ela segue sem migration, sem dado e sem conta
  até você rodar os comandos acima.
- Não rotacionou nenhum segredo.
