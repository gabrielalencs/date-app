# DATE — Passo a passo do primeiro deploy

Onde achar cada valor, para onde ele vai, e em que ordem.

`docs/PRODUCTION.md` explica **por que** cada trava existe. Este documento é o
que você segue com o navegador aberto.

Regra que vale do começo ao fim: **valor de development nunca vira valor de
produção.** Cada segredo de produção é gerado novo.

---

## Mapa dos valores

Três lugares diferentes recebem variáveis. Confundi-los é o erro mais comum.

| Lugar | O que é | Quem lê |
|---|---|---|
| `.env.local` | sua máquina, development | `pnpm dev`, testes |
| `.env.production.local` | sua máquina, **só** os 4 comandos de produção | `db:migrate:prod` e companhia |
| Vercel → Environment Variables → **Production** | o app rodando | o DATE em produção |

Nenhum arquivo dos dois primeiros vai para o Git. Nenhum valor do primeiro vai
para os outros dois.

---

## Parte 0 — Rotacionar o que vazou

**Faça isto antes de tudo.** Não depende de nenhuma decisão sua e não pode ser
adiado: o `.env.local` esteve versionado e foi enviado ao GitHub.

| O que trocar | Onde |
|---|---|
| Senha da conexão Neon `development` | Neon Console → projeto → seletor **BRANCH** = `development` → **Postgres database** → **Roles** → menu do role → **Reset password** |
| Token R2 de development | Cloudflare → **R2** → **Manage API Tokens** → apaga o antigo, cria outro |
| `NEON_AUTH_COOKIE_SECRET` | gere novo (Parte 4) e troque no `.env.local` |
| Par VAPID de development | gere novo (Parte 4) e troque no `.env.local` |
| `CRON_SECRET` de development | gere novo (Parte 4) |
| Senhas das duas contas de development | Neon Console → **Auth** → **Users** |
| Certificado local `certificates/*.pem` | `pnpm dev:https` regenera |

Depois de trocar, rode `pnpm test:db` para confirmar que o `.env.local` ainda
funciona.

---

## Parte 1 — Decidir a URL, antes de instalar no celular

Duas opções:

- **grátis:** a URL da Vercel, tipo `date-app.vercel.app`;
- **domínio próprio:** `app.seudominio.com`.

Decida agora. Trocar de domínio depois muda a origem da PWA — na prática você
reinstala no celular e faz login de novo, e as notificações precisam ser
reativadas. A URL `vercel.app` já tem HTTPS e serve perfeitamente.

Daqui em diante, `https://SUA-URL` é essa URL, sem barra no final.

---

## Parte 2 — Neon, branch `production`

Neon Console → projeto `date-app`.

### 2.1 As duas connection strings

Botão **Connect** no dashboard do projeto. No modal **Connect to your
database**, escolha:

- **Branch:** `production` ← confira duas vezes, o padrão pode vir outro
- **Database** e **Role:** os mesmos que você usa em development

Você precisa das **duas** versões:

| Toggle **Connection pooling** | Host | Guarde como | Vai para |
|---|---|---|---|
| ligado | tem `-pooler` | `DATABASE_URL` | **Vercel** |
| desligado | sem `-pooler` | `DATABASE_URL_UNPOOLED` | **só sua máquina** |

A direta é para migration, que precisa da mesma sessão do começo ao fim. O
`db:migrate:prod` **recusa** uma string com `-pooler` no host.

### 2.2 A URL do Auth

Neon Console → **Branch `production`** → **Auth** → **Configuration**.

Copie a **Auth base URL** dessa branch. Cada branch tem a sua — a de
`production` é diferente da de `development`.

Guarde como `NEON_AUTH_BASE_URL`. Trate como dado sensível: quem a conhece
consegue falar com o serviço de cadastro direto (D-043).

### 2.3 Domínio confiável

Mesma tela, **Auth → Configuration → Domains**.

Adicione `https://SUA-URL`, com protocolo e **sem** barra no final. Sem isso o
login redireciona para lugar nenhum.

---

## Parte 3 — Cloudflare R2, token de produção

O bucket `date-media-prod` já existe. **Não crie outro.**

### 3.1 Account ID

Cloudflare → **R2 Object Storage**. O **Account ID** aparece em **Account
Details**, na lateral. Guarde como `R2_ACCOUNT_ID`.

Com ele você monta `R2_ENDPOINT`:

```
https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

Sem o nome do bucket no final. O app confere que o endpoint pertence à conta e
aborta se não bater.

### 3.2 O token

**R2 Object Storage** → em **Account Details**, **Manage** ao lado de **API
Tokens** → **Create Account API token**.

- **Permissions:** `Object Read & Write`
- **Specify bucket(s):** escolha **somente** `date-media-prod`

Ao criar, a tela mostra uma vez só:

| Campo mostrado | Guarde como |
|---|---|
| Access Key ID | `R2_ACCESS_KEY_ID` |
| Secret Access Key | `R2_SECRET_ACCESS_KEY` |

O Secret não é mostrado de novo. Se perder, apague o token e crie outro.

`R2_BUCKET` é literalmente `date-media-prod`.

### 3.3 CORS do bucket

**R2** → bucket `date-media-prod` → **Settings** → **CORS Policy**:

```json
[
  {
    "AllowedOrigins": ["https://SUA-URL"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Nunca `"*"`. O upload é um PUT assinado que sai do navegador direto para o
bucket; sem CORS a foto não sobe e o erro só aparece no console do navegador.

O bucket continua **privado**. Não habilite acesso público.

---

## Parte 4 — Gerar os segredos que são só seus

Nenhum destes vem de painel. Você gera.

### 4.1 `NEON_AUTH_COOKIE_SECRET`

Mínimo de 32 caracteres. No terminal:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 4.2 `CRON_SECRET`

Mesmo comando, valor diferente. Gere separado — não reaproveite o de cima.

A Vercel envia esse valor automaticamente como header `Authorization: Bearer ...`
quando dispara o Cron. Você não configura nada além da variável.

### 4.3 Par VAPID

```bash
npx web-push generate-vapid-keys
```

Saem duas chaves:

| Saída | Variável |
|---|---|
| Public Key | `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` |
| Private Key | `WEB_PUSH_VAPID_PRIVATE_KEY` |

A pública tem prefixo `NEXT_PUBLIC_` de propósito: ela viaja dentro da própria
subscription que o navegador monta. É a única exceção sancionada.

`WEB_PUSH_VAPID_SUBJECT` é `mailto:seu@email.com`.

**Gere um par novo e não reaproveite.** Trocar VAPID depois que os celulares já
estão inscritos exige reativar as notificações em cada aparelho.

### 4.4 As duas senhas das contas reais

Escolha as senhas que vocês dois vão usar. Mínimo 8 caracteres e **sem
vírgula** — a vírgula é o separador do formato.

---

## Parte 5 — Montar o `.env.production.local`

```bash
cp .env.production.example .env.production.local
```

Preencha:

```bash
NEON_BRANCH=production
DATABASE_URL_UNPOOLED=<2.1, a SEM -pooler>
NEON_AUTH_BASE_URL=<2.2>
NEON_AUTH_COOKIE_SECRET=<4.1>
ALLOWED_EMAILS=email-um@exemplo.com,email-dois@exemplo.com
DATE_OWNER_EMAIL=email-um@exemplo.com
DATE_PROD_ORIGIN=https://SUA-URL
DATE_PROD_USER_CREDENTIALS=email-um@exemplo.com:senha1,email-dois@exemplo.com:senha2
DATE_PROD_AUTH_USERS=              # fica vazio por enquanto (Parte 11)
```

`DATE_OWNER_EMAIL` tem que ser um dos dois de `ALLOWED_EMAILS` — ele vira
`owner`, o outro vira `member`.

Este arquivo não é lido pelo `pnpm dev` e nunca é commitado.

---

## Parte 6 — Aplicar as migrations em `production`

```bash
pnpm db:migrate:prod
```

Roda sem a flag de propósito: imprime branch e host e **para**. Leia o host. Se
for o da `production`, rode de novo:

```bash
pnpm db:migrate:prod --eu-confirmo
```

Saem as 7 migrations (`0000` a `0006`). Nenhuma é destrutiva.

**Não rode `pnpm db:seed`.** Ele é o seed fictício e aborta fora de
`development`, mas a regra é essa: produção não recebe dado de teste.

---

## Parte 7 — Colocar o código na `main`

A Vercel só publica o que está no GitHub.

```bash
git status
git add .
git commit -m "feat: B12 — webhook, comandos de produção e limpeza de segredos"
git push origin develop
```

No GitHub, abra o Pull Request `develop → main` e faça o merge.

> **Confira antes do merge:** a `main` **não pode** conter `.env.local`. O
> commit acima o retira do índice. Uma `main` com `.env.local` publica os
> valores de development junto com o app.

---

## Parte 8 — Criar o projeto na Vercel

[vercel.com](https://vercel.com) → **Add New** → **Project** → conecte o GitHub
→ importe o repositório privado do DATE.

| Campo | Valor |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `./` |
| Build Command | automático (`next build`) |
| Install Command | automático (detecta pnpm) |
| Production Branch | `main` |

**Não clique em Deploy ainda.** Configure as variáveis primeiro — o build já
precisa delas.

---

## Parte 9 — Variáveis na Vercel

**Settings** → **Environment Variables**. Marque **somente Production** em cada
uma.

```bash
NEON_BRANCH=production
DATABASE_URL=<2.1, a COM -pooler>

NEON_AUTH_BASE_URL=<2.2>
NEON_AUTH_COOKIE_SECRET=<4.1, o MESMO do .env.production.local>
ALLOWED_EMAILS=email-um@exemplo.com,email-dois@exemplo.com
DATE_OWNER_EMAIL=email-um@exemplo.com

R2_ACCOUNT_ID=<3.1>
R2_ACCESS_KEY_ID=<3.2>
R2_SECRET_ACCESS_KEY=<3.2>
R2_BUCKET=date-media-prod
R2_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com

NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=<4.3>
WEB_PUSH_VAPID_PRIVATE_KEY=<4.3>
WEB_PUSH_VAPID_SUBJECT=mailto:seu@email.com

CRON_SECRET=<4.2>
```

São 15. Duas armadilhas:

- `ALLOWED_EMAILS` aqui e no `.env.production.local` têm que ser **idênticas**.
  Se divergirem, o webhook recusa a conta real na Parte 11 e o script reporta
  `BLOQUEADA`;
- `NEON_AUTH_COOKIE_SECRET` também tem que ser o mesmo nos dois lugares.

**Nunca coloque na Vercel:**

```
DATABASE_URL_UNPOOLED       só migration, só sua máquina
DATE_ENABLE_KITCHEN_SINK    abriria /kitchen-sink em produção
DATE_DEV_USER_CREDENTIALS   senhas de development
DATE_DEV_AUTH_USERS
DATE_TEST_EMAIL
DATE_PROD_USER_CREDENTIALS  senhas reais, usadas uma vez, na sua máquina
DATE_PROD_ORIGIN
DATE_PROD_AUTH_USERS
```

---

## Parte 10 — Primeiro deploy

**Deploy** e espere **Ready**.

Abra `https://SUA-URL/login`. A tela precisa aparecer. **Não tente entrar
ainda** — não existe conta.

> **Janela aberta.** Deste momento até a Parte 11 terminar, o serviço de Auth
> aceita cadastro de quem conhecer a `NEON_AUTH_BASE_URL`. É por isso que a
> ordem é essa: a rota do webhook precisa de uma URL HTTPS pública para poder
> ser cadastrada. Faça a Parte 11 em seguida, sem pausa.

---

## Parte 11 — Fechar a porta do cadastro

### 11.1 Cadastrar o webhook

Neon Console → branch `production` → **Auth** → **Configuration** →
**Webhooks**:

| Campo | Valor |
|---|---|
| Enable | ligado |
| Webhook URL | `https://SUA-URL/api/webhooks/neon-auth` |
| Events | **somente** `user.before_create` |
| Timeout | 5 |

Salve.

### 11.2 Provar que fechou

```bash
pnpm auth:probe-prod --eu-confirmo
```

Tenta cadastrar um e-mail aleatório de domínio reservado, chamando o provedor
direto — que é o único ataque que o webhook existe para impedir.

- **`RECUSADO — HTTP 4xx`** → é o resultado esperado, siga;
- **`PROBLEMA SÉRIO: o cadastro foi ACEITO`** → o webhook não está ligado ou
  está apontando para o lugar errado. O script imprime o id de uma conta que foi
  criada; apague no Neon Console → **Auth** → **Users**. Corrija e rode de novo.

**Não passe daqui sem o RECUSADO.**

### 11.3 Criar as duas contas reais

```bash
pnpm auth:create-prod-users --eu-confirmo
```

No fim ele imprime:

```
DATE_PROD_AUTH_USERS=<id1>:<email1>,<id2>:<email2>
```

Cole essa linha no `.env.production.local`.

Se aparecer `BLOQUEADA`, a `ALLOWED_EMAILS` da Vercel está diferente da sua.
Corrija na Vercel, faça novo deploy, rode de novo.

### 11.4 Workspace e permissões

```bash
pnpm db:bootstrap:prod --eu-confirmo
```

Cria o workspace e liga as duas contas: `DATE_OWNER_EMAIL` como `owner`, a outra
como `member`. Termina com `memberships no workspace: 2`.

É idempotente — rodar de novo depois não apaga nem toca em nada.

---

## Parte 12 — Verificar

Na URL de produção, pelo navegador do computador:

1. `/login` abre e não oferece criar conta;
2. entra com a primeira conta;
3. sai e entra com a segunda;
4. cria um DATE de teste;
5. sobe uma foto;
6. a foto aparece em Cloudflare → R2 → `date-media-prod`;
7. Perfil → ativar notificações;
8. Vercel → **Settings** → **Cron Jobs** lista `/api/notifications/recovery`.

> No plano Hobby da Vercel o Cron roda **uma vez por dia** e em qualquer minuto
> da hora marcada. O do DATE é diário (`0 12 * * *`), então está compatível.

---

## Parte 13 — Instalar no celular

### Android (Chrome)

1. abra `https://SUA-URL`;
2. faça login;
3. menu de três pontos;
4. **Instalar app**;
5. confirme.

### iPhone (Safari — tem que ser o Safari)

1. abra `https://SUA-URL`;
2. botão **Compartilhar**;
3. **Adicionar à Tela de Início**;
4. **Adicionar**;
5. abra pelo ícone novo;
6. **faça login de novo** — o app instalado tem cookie jar separado do Safari.
   Isso é comportamento do iOS, não defeito (D-139);
7. Perfil → ativar notificações, dentro do app instalado.

---

## Parte 14 — Daqui pra frente

```
develop → commit → push → PR → merge na main → Vercel publica sozinha
```

Não precisa reinstalar no celular. Fechar e abrir o app pega a versão nova.

Três exceções:

| Situação | O que fazer a mais |
|---|---|
| mudou variável na Vercel | novo deploy (variável não entra sozinha) |
| tem migration nova | `pnpm db:migrate:prod --eu-confirmo` antes do merge |
| mudou o domínio | reinstalar no celular, login e notificações de novo |

---

## Checklist

```
[ ] 0  segredos de development rotacionados
[ ] 1  URL definitiva decidida
[ ] 2  duas connection strings + Auth base URL da production
[ ] 2  domínio em Auth → Configuration → Domains
[ ] 3  token R2 limitado a date-media-prod + CORS sem "*"
[ ] 4  cookie secret, CRON_SECRET e par VAPID gerados novos
[ ] 5  .env.production.local preenchido
[ ] 6  pnpm db:migrate:prod --eu-confirmo
[ ] 7  main sem .env.local, com o código todo
[ ] 8  projeto criado na Vercel
[ ] 9  15 variáveis no ambiente Production
[ ] 10 primeiro deploy Ready
[ ] 11 webhook cadastrado
[ ] 11 pnpm auth:probe-prod --eu-confirmo  →  RECUSADO
[ ] 11 pnpm auth:create-prod-users --eu-confirmo
[ ] 11 pnpm db:bootstrap:prod --eu-confirmo  →  2 memberships
[ ] 12 login, DATE de teste, foto no bucket, notificação
[ ] 13 instalado nos dois celulares
```
