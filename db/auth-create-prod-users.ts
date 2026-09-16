import { parseAllowedEmails } from "../lib/auth/config.ts";
import {
  credentialsMatchAllowlist,
  parseDevCredentials,
  signUpUrl,
  type DevCredential,
} from "../lib/auth/dev-provisioning.ts";
import { requireProductionAuth } from "./production.ts";

/**
 * Cria as duas contas reais no Neon Auth de produção (B12).
 *
 * Mesmo mecanismo do `auth:create-dev-users` (D-042): fala com o
 * `sign-up/email` do provedor, fora da aplicação, porque conta criada pelo
 * console não tem senha e a API de admin exige sessão autenticada.
 *
 * A diferença é a ordem, e ela é obrigatória: em produção o webhook
 * `user.before_create` já precisa estar ligado quando este script roda. Se
 * estiver, o próprio provedor recusa qualquer e-mail fora da allowlist — e a
 * criação das duas contas certas passa a ser a prova de que ele não recusa
 * demais. Rodar isto antes do webhook cria conta em produção sem a rede de
 * proteção que o D-043 exige.
 *
 * O script não abre conexão com o banco. Ligar conta a profile e membership é
 * do `db:bootstrap:prod`, que roda depois, com os ids impressos aqui.
 */
type SignUpOutcome =
  | { status: "created"; email: string; id: string }
  | { status: "exists"; email: string }
  | { status: "blocked"; email: string; detail: string }
  | { status: "failed"; email: string; detail: string };

/** O código que o nosso webhook devolve ao recusar. */
const CODIGO_RECUSA = "DATE_SIGNUP_CLOSED";

function mensagemDe(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const registro = payload as Record<string, unknown>;
    for (const chave of ["message", "error_message", "error"]) {
      const valor = registro[chave];
      if (typeof valor === "string") return valor;
    }
  }
  return fallback;
}

async function createUser(
  url: string,
  origin: string,
  credential: DevCredential,
): Promise<SignUpOutcome> {
  const name = credential.email.split("@")[0] ?? "Pessoa DATE";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      email: credential.email,
      password: credential.password,
      name,
    }),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = mensagemDe(payload, response.statusText);

    if (/exist|already|duplicate|unique/i.test(message)) {
      return { status: "exists", email: credential.email };
    }

    /* Recusa do nosso próprio webhook para um e-mail da allowlist significa
       allowlist dessincronizada entre a Vercel e este arquivo — e é um erro
       diferente de "o serviço caiu". */
    if (
      message.includes(CODIGO_RECUSA) ||
      /não aceita cadastro/i.test(message)
    ) {
      return {
        status: "blocked",
        email: credential.email,
        detail:
          "o webhook recusou um e-mail que está em ALLOWED_EMAILS aqui. " +
          "A variável ALLOWED_EMAILS da Vercel provavelmente está diferente.",
      };
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
    return {
      status: "failed",
      email: credential.email,
      detail: "conta criada, mas o id não veio onde esperado.",
    };
  }

  return { status: "created", email: credential.email, id };
}

async function main(): Promise<void> {
  const { baseUrl, origin } = requireProductionAuth(
    "pnpm auth:create-prod-users",
  );

  const allowed = parseAllowedEmails(process.env.ALLOWED_EMAILS);
  const credentials = parseDevCredentials(
    process.env.DATE_PROD_USER_CREDENTIALS,
    "DATE_PROD_USER_CREDENTIALS",
  );

  if (!credentialsMatchAllowlist(credentials, allowed)) {
    throw new Error(
      "ABORTADO: os e-mails de DATE_PROD_USER_CREDENTIALS não são exatamente os de ALLOWED_EMAILS.",
    );
  }

  const url = signUpUrl(baseUrl);
  console.log(`Endpoint       : ${url}\n`);

  const created: { id: string; email: string }[] = [];
  const failures: string[] = [];

  for (const credential of credentials) {
    const outcome = await createUser(url, origin, credential);

    switch (outcome.status) {
      case "created":
        console.log(`criada    : ${outcome.email}`);
        created.push({ id: outcome.id, email: outcome.email });
        break;
      case "exists":
        console.log(`já existe : ${outcome.email} (pulando)`);
        break;
      case "blocked":
        console.log(`BLOQUEADA : ${outcome.email} — ${outcome.detail}`);
        failures.push(outcome.email);
        break;
      case "failed":
        console.log(`falhou    : ${outcome.email} — ${outcome.detail}`);
        failures.push(outcome.email);
        break;
    }
  }

  if (created.length > 0) {
    console.log("\nCole no .env.production.local:\n");
    console.log(
      `DATE_PROD_AUTH_USERS=${created
        .map(({ id, email }) => `${id}:${email}`)
        .join(",")}`,
    );
  }

  if (created.length < credentials.length && failures.length === 0) {
    console.log(
      "\nAlguma conta já existia. O id dela está no Neon Console,\n" +
        "em Auth > Users, na branch production.",
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
