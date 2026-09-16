import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { parseAuthConfig } from "../lib/auth/config.ts";
import {
  assertCoversAllowlist,
  linkIdentities,
  parseIdentities,
} from "./identities.ts";
import { requireProductionBranch } from "./production.ts";
import * as schema from "./schema/index.ts";

/**
 * Cria o workspace de produção e liga a ele as duas contas reais (B12).
 *
 * Diferença em relação ao `auth:bootstrap-dev`: lá o workspace já existia,
 * criado pelo seed fictício, e o script exigia encontrar exatamente um. Aqui
 * não há seed — produção nunca recebe dado de teste —, então o workspace
 * precisa nascer, e nascer uma vez só.
 *
 * Idempotente: com o workspace já criado, a segunda execução reusa o que existe
 * e só reafirma profiles e memberships. Nenhum DELETE, nenhum TRUNCATE.
 */
const NOME_PADRAO = "DATE";

async function main(): Promise<void> {
  const target = requireProductionBranch("pnpm db:bootstrap:prod");

  const auth = parseAuthConfig({
    NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET,
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
    DATE_OWNER_EMAIL: process.env.DATE_OWNER_EMAIL,
  });

  const identities = parseIdentities(
    process.env.DATE_PROD_AUTH_USERS,
    "DATE_PROD_AUTH_USERS",
  );
  assertCoversAllowlist(identities, auth.allowedEmails, "DATE_PROD_AUTH_USERS");

  const nome = process.env.DATE_WORKSPACE_NAME?.trim() || NOME_PADRAO;

  const pool = new Pool({ connectionString: target.url });
  const db = drizzle(pool, { schema });

  try {
    const existentes = await db
      .select({ id: schema.workspaces.id, name: schema.workspaces.name })
      .from(schema.workspaces);

    if (existentes.length > 1) {
      throw new Error(
        `ABORTADO: a V1 exige exatamente um workspace; production tem ${existentes.length}.\n` +
          "Isto não se resolve por script: pare e investigue como o segundo apareceu.",
      );
    }

    let workspaceId: string;

    if (existentes.length === 1) {
      workspaceId = existentes[0]!.id;
      console.log(`workspace existente reusado: "${existentes[0]!.name}"`);
    } else {
      const [criado] = await db
        .insert(schema.workspaces)
        .values({ name: nome })
        .returning({ id: schema.workspaces.id });

      if (!criado) {
        throw new Error("ABORTADO: o insert do workspace não devolveu id.");
      }

      workspaceId = criado.id;
      console.log(`workspace criado: "${nome}"`);
    }

    const membros = await linkIdentities(
      db,
      workspaceId,
      identities,
      auth.ownerEmail,
    );

    console.log(`\nmemberships no workspace: ${membros}`);

    if (membros !== 2) {
      throw new Error(
        `ABORTADO: o workspace terminou com ${membros} membros, e a V1 tem exatamente dois.\n` +
          "Nada foi apagado; confira as identidades informadas.",
      );
    }

    console.log("Bootstrap de produção concluído.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
