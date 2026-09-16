# DATE — Auth e segurança

Substitui a referência a `docs/06_AUTH_AND_SECURITY.md`. Normativo.

---

## 1. Princípio

O DATE tem exatamente duas pessoas e nenhuma porta de entrada nova. Segurança aqui não é feature: é a ausência de superfície.

Três camadas, em ordem de confiança crescente:

1. **`proxy.ts`** — otimista. Decide navegação, não acesso a dado.
2. **Fronteira HTTP** — a rota de auth só encaminha operações de uma allowlist positiva.
3. **`requireAuthorizedContext()`** — autoridade final, sempre perto da query.

Nenhuma das três sozinha é suficiente. A terceira é obrigatória.

---

## 2. Provedor

Managed Better Auth via `@neondatabase/auth`, instância criada por `createNeonAuth()` de `@neondatabase/auth/next/server` (D-029).

O SDK devolve `{ data, error }` em vez de lançar. O produto nunca repassa `error.message` para a interface.

Variáveis, todas server-only, nenhuma com prefixo `NEXT_PUBLIC_`:

| Variável | Papel |
|---|---|
| `NEON_AUTH_BASE_URL` | endpoint do Neon Auth da branch |
| `NEON_AUTH_COOKIE_SECRET` | assinatura do cookie de sessão, mínimo 32 caracteres |
| `ALLOWED_EMAILS` | exatamente dois e-mails, separados por vírgula |
| `DATE_OWNER_EMAIL` | um dos dois acima; recebe `owner` no bootstrap |

`lib/auth/config.ts` valida tudo com Zod e é puro — dá para testar sem processo Next. `lib/auth/env.ts` é a fachada `server-only` que lê `process.env`.

---

## 3. Signup não existe

A V1 não tem cadastro. Omitir o botão não é proteção: `auth.handler()` encaminha **toda** a superfície do provedor, incluindo `sign-up/email`, `sign-in/social`, `sign-in/magic-link`, `sign-in/email-otp`, `delete-user`, `update-user` e o namespace `admin/*` inteiro — `admin/create-user`, `admin/set-role`, `admin/impersonate-user`.

Por isso `app/api/auth/[...path]/route.ts` **não reexporta o handler**. Cada requisição passa antes por `lib/auth/http-policy.ts`, uma allowlist positiva de três operações:

```text
GET  get-session
POST sign-in/email
POST sign-out
```

Qualquer outra coisa recebe 404 e não chega ao Neon. `PUT`, `DELETE` e `PATCH` não são exportados, então o Next responde 405.

A allowlist é positiva de propósito: operação nova do provedor nasce bloqueada, não liberada.

O webhook `user.before_create` continua **obrigatório antes de production**. A allowlist protege a nossa fronteira; o webhook protege o provedor.

Desde o B12 ele existe em código, em `app/api/webhooks/neon-auth/route.ts`: verificação Ed25519 do JWS destacado contra o JWKS do provedor, recusa em 200 e `PUBLIC_PREFIXES` no proxy. O que ainda não aconteceu é o cadastro dele no console do Neon — e enquanto isso não for feito e provado por `pnpm auth:probe-prod`, a porta do D-043 continua aberta. Mecânica, ordem e riscos em `docs/PRODUCTION.md`.

---

## 4. Sessão e allowlist

`auth.getSession()` no servidor. O e-mail da sessão é normalizado (trim + lowercase) antes de qualquer comparação.

Conta válida no Neon fora de `ALLOWED_EMAILS` **não entra no DATE**. A verificação acontece duas vezes: no login, antes de gastar tentativa no provedor, e em toda resolução de contexto.

---

## 5. Identidade local

`profiles.id` espelha `session.user.id` (D-023). Sem FK para `neon_auth`, sem query ao schema do provedor.

O upsert acontece na resolução do contexto, depois da allowlist. Nome vem da sessão; sem nome utilizável, o fallback é `Pessoa DATE`. O e-mail **não** é chave de domínio.

---

## 6. Autorização

```ts
type AuthorizedContext = {
  userId: string;
  profileId: string;
  workspaceId: string;
  role: "owner" | "member";
};
```

`requireAuthorizedContext()` é a única forma de obter `workspaceId`.

O fluxo: sessão → usuário → e-mail normalizado → allowlist → upsert de profile → `workspace_members` pelo profile → exatamente uma membership → contexto.

**O caller não fornece `workspaceId`.** A assinatura não aceita. Toda função de domínio futura recebe o contexto:

```ts
getPlan(context, planId)   // certo
getPlan(planId, workspaceId) // nunca
```

Sessão válida sem membership é 403. Não se escolhe "o primeiro workspace", não há workspace hardcoded, não se lê workspace de query param nem de localStorage.

A lógica vive em `lib/auth/authorization-core.ts`, pura e com repositório injetado, para ser testável sem banco. `lib/auth/authorization.ts` é a ligação `server-only` com Drizzle, memoizada por request com `cache()` do React.

---

## 7. Proxy é camada otimista

`proxy.ts` (convenção do Next 16, sucessora de `middleware.ts`) redireciona quem não tem cookie para `/login` (D-032).

Ele **não** consulta `workspace_members` e **não** é autoridade. Os docs do Next pedem que o proxy não dependa de módulos compartilhados, então ele monta a própria instância a partir do env.

Públicos: `/login`, `/api/auth/*`, `/_next`, `/favicon.ico`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`, `/apple-touch-icon.png`, qualquer caminho com extensão de arquivo (assets de `public/`) e — somente sob `DATE_ENABLE_KITCHEN_SINK` — `/kitchen-sink`.

> Os quatro caminhos da PWA já passariam pela regra de extensão. Estão nomeados porque o navegador os busca **sem credenciais**: um redirect para `/login` aqui tira a instalação do ar sem nenhum erro visível (seção 6 do `docs/PWA_AND_HARDENING.md`).

> `/kitchen-sink` era exceção permanente para uma rota que só existe em desenvolvimento. Reavaliada no B11 (D-135): a exceção passou a ser condicionada à mesma `DATE_ENABLE_KITCHEN_SINK` que cria a rota. Sem a variável, a página responde 404 e o proxy não conhece o caminho.

Desde o B11 o proxy também é o dono único da Content-Security-Policy, porque o nonce é por requisição e porque dois headers de CSP são somados pelo navegador, não substituídos (D-132). Documentos recebem a política com nonce; `/api/*` recebe `default-src 'none'`. Os headers estáticos ficam no `next.config.ts` e não tocam CSP.

**A regra da extensão, auditada no B11.** `proxy.ts` libera qualquer caminho que contenha um ponto — regra por forma, não por rota. Existem exatamente três rotas cujo caminho pode conter um ponto, e cada uma resolve o contexto por conta própria:

| Rota | Quem resolve o contexto |
|---|---|
| `/planos/[id]` | `app/(private)/layout.tsx` chama `requireAuthorizedContext()` |
| `/api/media/[id]` | a própria rota chama `requireAuthorizedContext()` |
| `/api/auth/[...path]` | já é público; protegido pela allowlist positiva da seção 3 |

Provado sem cookie: `/planos/{uuid}.png` responde 307 para `/login` (o proxy deixa passar, a autoridade barra) e `/api/media/{id}.png` responde 404.

Se a configuração de auth estiver inválida, o proxy **nega por redirecionamento** em vez de estourar 500 — falha fechada.

O layout de `app/(private)/` chama `requireAuthorizedContext()` de novo. `/login` fica fora desse grupo, então não herda shell: esconder navegação por CSS não seria proteção.

---

## 8. Logout

Server Action que chama `auth.signOut()` e redireciona para `/login`. É um `<form>` real: sem JavaScript a sessão ainda é invalidada no servidor. Não é limpeza de estado do React.

---

## 9. Provisionamento

Contas são criadas **administrativamente** no Neon Console, na branch `development` (D-033). Não existe rota temporária de criação.

`pnpm auth:bootstrap-dev` liga as contas ao workspace da V1. Guardas:

- aborta se `NEON_BRANCH` não for exatamente `development`;
- imprime host e branch, nunca credencial;
- exige exatamente duas identidades, cobrindo `ALLOWED_EMAILS`;
- exige exatamente um workspace no banco;
- `DATE_OWNER_EMAIL` recebe `owner`, a outra conta `member`;
- upsert de profile e membership, idempotente;
- nunca apaga, nunca trunca, nunca toca `production`.

Os ids vêm de `DATE_DEV_AUTH_USERS` (`id:email,id:email`) para o script não consultar `neon_auth` nem depender de sessão de admin.

---

## 10. Erros

A interface recebe **uma** mensagem: `E-mail ou senha inválidos.`

Vale para credencial errada, e-mail fora da allowlist, payload inválido e falha de configuração. Não se diz se o e-mail existe. Mensagem do provedor não chega ao usuário. Senha nunca é logada, nunca volta no retorno da action.

Falha de configuração é registrada no servidor sem detalhe e sem segredo, e a pessoa vê a mesma mensagem genérica em vez de um 500.

---

## 11. O que não existe na V1

Signup, login social, magic link, OTP, recuperação de senha, convite, troca de e-mail, segundo workspace, terceiro usuário, RLS (D-024), Data API.
