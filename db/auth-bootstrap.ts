import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { parseAuthConfig } from "../lib/auth/config.ts";
import { requireDevelopmentBranch } from "./env.ts";
import {
  assertCoversAllowlist,
  linkIdentities,
  parseIdentities,
} from "./identities.ts";
import * as schema from "./schema/index.ts";

/**
 * Liga as duas contas Auth de development ao workspace da V1.
 *
 * Não cria conta e não cria workspace: em development o workspace vem do seed
 * fictício, e criação de conta é do `auth:create-dev-users`. Aqui só se faz
 * upsert de profile e membership, a partir dos ids que o provedor já tem.
 * Nada é apagado, nada é truncado, e a guarda de branch roda antes de tudo.
 *
 * A mecânica de ligação mora em `db/identities.ts`, compartilhada com o
 * bootstrap de produção — a diferença entre os dois é só de onde vem o
 * workspace, e ela está escrita em cada script.
 */
async function main(): Promise<void> {
  const target = requireDevelopmentBranch();

  const auth = parseAuthConfig({
    NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET,
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
    DATE_OWNER_EMAIL: process.env.DATE_OWNER_EMAIL,
  });

  const identities = parseIdentities(
    process.env.DATE_DEV_AUTH_USERS,
    "DATE_DEV_AUTH_USERS",
  );
  assertCoversAllowlist(identities, auth.allowedEmails, "DATE_DEV_AUTH_USERS");

  const pool = new Pool({ connectionString: target.url });
  const db = drizzle(pool, { schema });

  try {
    const workspaces = await db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces);

    if (workspaces.length !== 1) {
      throw new Error(
        `ABORTADO: a V1 exige exatamente um workspace; o banco tem ${workspaces.length}.`,
      );
    }

    const membros = await linkIdentities(
      db,
      workspaces[0]!.id,
      identities,
      auth.ownerEmail,
    );

    console.log(`memberships no workspace: ${membros}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
