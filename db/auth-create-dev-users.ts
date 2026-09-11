import { parseAllowedEmails } from "../lib/auth/config.ts";
import {
  credentialsMatchAllowlist,
  parseDevCredentials,
  signUpUrl,
  type DevCredential,
} from "../lib/auth/dev-provisioning.ts";

/**
 * Cria as duas contas de development chamando o `sign-up/email` do serviço Neon
 * diretamente, fora da aplicação (D-042).
 *
 * Por que não o SDK: `@neondatabase/auth/next/server` importa `next/headers`,
 * que não existe num script Node, e `createAuthServer` de `./server` exige um
 * `RequestContextFactory` (cookies, origin, framework) — maquinaria de adapter
 * para um endpoint que não usa sessão nenhuma.
 *
 * Por que não a API de admin: `admin/*` exige sessão autenticada, e a conta
 * criada pelo console não tem senha para autenticar. É o impasse que motivou
 * este script.
 *
 * A allowlist de `lib/auth/http-policy.ts` NÃO é tocada: o cadastro continua
 * inalcançável pelo produto. Isto fala com o provedor, não com o DATE.
 *
 * Este script não abre conexão com o banco. Ligar conta a profile e membership
 * é trabalho do `auth:bootstrap-dev`, que já existe.
 */
const REQUIRED_BRANCH = "development";

/**
 * O serviço recusa o cadastro com "Origin header is required when callbackURL
 * is not an absolute URL". O SDK preenche isso a partir do contexto da
 * requisição (`ctx.getOrigin()`); num script não existe requisição, então vai
 * a origem de desenvolvimento local.
 */
const DEV_ORIGIN = process.env.DATE_DEV_ORIGIN ?? "http://localhost:3000";

function requireDevelopment(baseUrl: string): void {
  const branch = process.env.NEON_BRANCH;
  const host = (() => {
    try {
      return new URL(baseUrl).host;
    } catch {
      return "host ilegível";
    }
  })();

  console.log(`Neon branch     : ${branch ?? "(não definida)"}`);
  console.log(`Neon Auth host  : ${host}`);

  if (branch !== REQUIRED_BRANCH) {
    throw new Error(
      `\nABORTADO: NEON_BRANCH é "${branch ?? "(não definida)"}", e só "${REQUIRED_BRANCH}" pode receber criação de conta.\n\n` +
        "O que fazer:\n" +
        "  1. Abra .env.local\n" +
        `  2. Garanta NEON_BRANCH=${REQUIRED_BRANCH}\n` +
        `  3. Garanta que NEON_AUTH_BASE_URL aponta para a instância da branch ${REQUIRED_BRANCH}\n\n` +
        "Nunca aponte este script para production.",
    );
  }
}

type SignUpOutcome =
  | { status: "created"; email: string; id: string }
  | { status: "exists"; email: string }
  | { status: "failed"; email: string; detail: string };

async function createUser(
  url: string,
  credential: DevCredential,
): Promise<SignUpOutcome> {
  const name = credential.email.split("@")[0] ?? "Pessoa DATE";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: DEV_ORIGIN,
    },
    body: JSON.stringify({
      email: credential.email,
      password: credential.password,
      name,
    }),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : response.statusText;

    // Conta já existente não é erro: reporta e segue para a próxima.
    if (/exist|already|duplicate|unique/i.test(message)) {
      return { status: "exists", email: credential.email };
    }

    return {
      status: "failed",
      email: credential.email,
      detail: `${response.status} ${message}`,
    };
  }

  const user =
    payload && typeof payload === "object" && "user" in payload
      ? (payload as { user?: { id?: unknown } }).user
      : undefined;
  const id = typeof user?.id === "string" ? user.id : undefined;

  if (!id) {
    const keys =
      payload && typeof payload === "object" ? Object.keys(payload) : [];
    return {
      status: "failed",
      email: credential.email,
      detail:
        "conta criada, mas o id não veio onde esperado. Chaves da resposta: " +
        (keys.join(", ") || "(nenhuma)"),
    };
  }

  return { status: "created", email: credential.email, id };
}

async function main(): Promise<void> {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!baseUrl) {
    throw new Error("ABORTADO: NEON_AUTH_BASE_URL não está definida.");
  }

  requireDevelopment(baseUrl);

  const allowed = parseAllowedEmails(process.env.ALLOWED_EMAILS);
  const credentials = parseDevCredentials(
    process.env.DATE_DEV_USER_CREDENTIALS,
  );

  // E-mail fora da allowlist geraria conta que nunca consegue entrar no DATE.
  if (!credentialsMatchAllowlist(credentials, allowed)) {
    throw new Error(
      "ABORTADO: os e-mails de DATE_DEV_USER_CREDENTIALS não são exatamente os de ALLOWED_EMAILS.",
    );
  }

  const url = signUpUrl(baseUrl);
  console.log(`Endpoint        : ${url}\n`);

  const created: { id: string; email: string }[] = [];
  const failures: string[] = [];

  for (const credential of credentials) {
    const outcome = await createUser(url, credential);

    switch (outcome.status) {
      case "created":
        console.log(`criada    : ${outcome.email}`);
        created.push({ id: outcome.id, email: outcome.email });
        break;
      case "exists":
        console.log(`já existe : ${outcome.email} (pulando)`);
        break;
      case "failed":
        console.log(`falhou    : ${outcome.email} — ${outcome.detail}`);
        failures.push(outcome.email);
        break;
    }
  }

  if (created.length > 0) {
    console.log("\nCole no .env.local:\n");
    console.log(
      `DATE_DEV_AUTH_USERS=${created
        .map(({ id, email }) => `${id}:${email}`)
        .join(",")}`,
    );
  }

  if (created.length < credentials.length && failures.length === 0) {
    console.log(
      "\nAlguma conta já existia. O id dela está no Neon Console,\n" +
        "em Auth > Users, na branch development.",
    );
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
