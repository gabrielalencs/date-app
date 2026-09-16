import { Pool } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { parseAuthConfig } from "../lib/auth/config.ts";
import { requireDevelopmentBranch } from "./env.ts";
import * as schema from "./schema/index.ts";

/**
 * Liga as duas contas Auth de development ao workspace da V1.
 *
 * Não cria conta: criação é ato administrativo no Neon Console. Aqui só se faz
 * upsert de profile e membership, a partir dos ids que o provedor já tem.
 * Nada é apagado, nada é truncado, e a guarda de branch roda antes de tudo.
 */
type Identity = { id: string; email: string; name?: string | null };

function mask(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

/**
 * Os ids vêm por env para o script não consultar o schema neon_auth nem
 * depender de sessão de admin. Formato: id:email,id:email.
 */
function parseIdentities(raw: string | undefined): readonly Identity[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator === -1) {
        throw new Error(
          "DATE_DEV_AUTH_USERS espera pares id:email separados por vírgula.",
        );
      }
      return {
        id: entry.slice(0, separator).trim(),
        email: entry
          .slice(separator + 1)
          .trim()
          .toLowerCase(),
      };
    });
}

async function main(): Promise<void> {
  const target = requireDevelopmentBranch();

  const auth = parseAuthConfig({
    NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET,
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
    DATE_OWNER_EMAIL: process.env.DATE_OWNER_EMAIL,
  });

  const identities = parseIdentities(process.env.DATE_DEV_AUTH_USERS);

  if (identities.length !== 2) {
    throw new Error(
      "\nABORTADO: são necessárias exatamente duas identidades.\n\n" +
        "Crie as duas contas no Neon Console (Auth > Users, branch development)\n" +
        "e informe os ids em DATE_DEV_AUTH_USERS no .env.local, no formato:\n" +
        "  DATE_DEV_AUTH_USERS=<id1>:<email1>,<id2>:<email2>\n",
    );
  }

  const emails = identities.map((identity) => identity.email);
  const missing = auth.allowedEmails.filter(
    (allowed) => !emails.includes(allowed),
  );
  if (missing.length > 0) {
    throw new Error(
      `ABORTADO: as identidades informadas não cobrem ALLOWED_EMAILS. Faltam ${missing.length}.`,
    );
  }

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

    const workspaceId = workspaces[0]!.id;

    await db.transaction(async (tx) => {
      for (const identity of identities) {
        const role = identity.email === auth.ownerEmail ? "owner" : "member";

        await tx
          .insert(schema.profiles)
          .values({
            id: identity.id,
            displayName: identity.name?.trim() ?? "Pessoa DATE",
          })
          .onConflictDoUpdate({
            target: schema.profiles.id,
            set: { updatedAt: new Date() },
          });

        await tx
          .insert(schema.workspaceMembers)
          .values({ workspaceId, profileId: identity.id, role })
          .onConflictDoUpdate({
            target: [
              schema.workspaceMembers.workspaceId,
              schema.workspaceMembers.profileId,
            ],
            set: { role },
          });

        console.log(`ligado: ${mask(identity.email)} -> ${role}`);
      }
    });

    const linked = await db
      .select({ profileId: schema.workspaceMembers.profileId })
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, workspaceId));

    console.log(`memberships no workspace: ${linked.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
