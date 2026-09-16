/**
 * Ligação entre conta do Neon Auth e as tabelas de negócio, compartilhada pelo
 * bootstrap de development e pelo de produção.
 *
 * Os ids vêm por variável de ambiente e não por consulta ao schema `neon_auth`:
 * CLAUDE.md proíbe mexer nele, e um script que só lê o que o provedor já
 * devolveu não precisa de sessão de admin para existir.
 *
 * Nada aqui apaga linha. `onConflictDoUpdate` nos dois inserts torna o comando
 * idempotente: rodar duas vezes produz o mesmo estado, e rodar depois de o
 * casal já ter usado o app não toca em plano, foto nem memória.
 */
import { eq } from "drizzle-orm";

import * as schema from "./schema/index.ts";

export type Identity = { readonly id: string; readonly email: string };

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

/** Formato: id:email,id:email. O e-mail pode conter dois pontos? Não pode. */
export function parseIdentities(
  raw: string | undefined,
  variavel: string,
): readonly Identity[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator === -1) {
        throw new Error(
          `${variavel} espera pares id:email separados por vírgula.`,
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

/** As duas identidades informadas têm de ser exatamente as da allowlist. */
export function assertCoversAllowlist(
  identities: readonly Identity[],
  allowedEmails: readonly string[],
  variavel: string,
): void {
  if (identities.length !== 2) {
    throw new Error(
      "\nABORTADO: são necessárias exatamente duas identidades.\n\n" +
        `Informe os ids em ${variavel}, no formato:\n` +
        `  ${variavel}=<id1>:<email1>,<id2>:<email2>\n`,
    );
  }

  const informados = identities.map((identity) => identity.email);
  const faltando = allowedEmails.filter(
    (allowed) => !informados.includes(allowed.toLowerCase()),
  );

  if (faltando.length > 0) {
    throw new Error(
      `ABORTADO: as identidades informadas não cobrem ALLOWED_EMAILS. Faltam ${faltando.length}.`,
    );
  }
}

/**
 * O tipo do `drizzle(pool, { schema })` que os dois scripts já constroem.
 * Escrito assim para não redigitar à mão a assinatura que o Drizzle infere —
 * duplicar tipo de banco é exatamente o que o CLAUDE.md proíbe.
 */
type Db = ReturnType<
  typeof import("drizzle-orm/neon-serverless").drizzle<typeof schema>
>;

/**
 * Faz upsert de profile e membership para cada identidade e devolve quantos
 * membros o workspace tem no fim. O papel `owner` sai de `DATE_OWNER_EMAIL`,
 * que `parseAuthConfig` já garantiu pertencer à allowlist.
 */
export async function linkIdentities(
  db: Db,
  workspaceId: string,
  identities: readonly Identity[],
  ownerEmail: string,
): Promise<number> {
  await db.transaction(async (tx) => {
    for (const identity of identities) {
      const role = identity.email === ownerEmail ? "owner" : "member";

      await tx
        .insert(schema.profiles)
        .values({
          id: identity.id,
          displayName: "Pessoa DATE",
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

      console.log(`ligado: ${maskEmail(identity.email)} -> ${role}`);
    }
  });

  const linked = await db
    .select({ profileId: schema.workspaceMembers.profileId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId));

  return linked.length;
}
