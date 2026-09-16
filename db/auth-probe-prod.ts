import { randomUUID } from "node:crypto";

import { parseAllowedEmails } from "../lib/auth/config.ts";
import { signUpUrl } from "../lib/auth/dev-provisioning.ts";
import { requireProductionAuth } from "./production.ts";

/**
 * Prova que o webhook `user.before_create` está mesmo barrando terceiros (B12).
 *
 * É a única verificação honesta possível: o webhook só existe para o caso em
 * que alguém conhece a `NEON_AUTH_BASE_URL` e chama o provedor direto, sem
 * passar pela nossa aplicação (D-043). Testar isso sem chamar o provedor direto
 * seria testar outra coisa.
 *
 * Roda DEPOIS de configurar o webhook no console e ANTES de criar as contas
 * reais. O e-mail usado é aleatório, de domínio reservado pela RFC 2606, e
 * nunca está na allowlist.
 *
 * Risco declarado: se o webhook NÃO estiver ligado, esta chamada cria uma conta
 * de verdade no Auth de produção. Ela nasce sem profile e sem membership, então
 * não alcança nenhum dado do casal — a autorização do DATE é `workspace_members`,
 * não a sessão. Mesmo assim o script imprime o id e manda apagá-la no console,
 * porque conta órfã em produção é exatamente o tipo de coisa que ninguém lembra
 * depois.
 */
const DOMINIO_RESERVADO = "example.invalid";

async function main(): Promise<void> {
  const { baseUrl, origin } = requireProductionAuth("pnpm auth:probe-prod");

  const allowed = parseAllowedEmails(process.env.ALLOWED_EMAILS);
  const email = `date-probe-${randomUUID()}@${DOMINIO_RESERVADO}`;

  if (allowed.includes(email)) {
    throw new Error(
      "ABORTADO: o e-mail sorteado caiu na allowlist. Rode de novo.",
    );
  }

  console.log(`\nTentando cadastrar um e-mail de fora da allowlist:`);
  console.log(`  ${email}\n`);

  const response = await fetch(signUpUrl(baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email,
      password: randomUUID() + randomUUID(),
      name: "Sonda",
    }),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    console.log(`RECUSADO — HTTP ${response.status}.`);
    console.log("O webhook está barrando terceiros. É o resultado esperado.\n");
    return;
  }

  const id =
    payload && typeof payload === "object" && "user" in payload
      ? ((payload as { user?: { id?: unknown } }).user?.id ?? "(sem id)")
      : "(sem id)";

  console.error(
    "\nPROBLEMA SÉRIO: o cadastro foi ACEITO.\n\n" +
      "O webhook user.before_create não está ligado, não está apontando para\n" +
      "esta aplicação, ou está devolvendo allowed: true para qualquer e-mail.\n\n" +
      `Conta criada em produção — apague no Neon Console (Auth > Users):\n  id: ${String(id)}\n  ${email}\n\n` +
      "Não crie as contas reais e não faça o deploy até isto passar.",
  );

  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
