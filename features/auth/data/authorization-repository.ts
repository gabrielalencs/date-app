import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { profiles, workspaceMembers } from "@/db/schema/index.ts";
import type { AuthorizationRepository } from "@/lib/auth/authorization-core";

/**
 * Único ponto que fala com o banco na resolução de identidade. Fica sob
 * `features/auth/data/` porque é ali que a zona de importação do ESLint
 * permite alcançar `@/db/client` (D-037).
 */
export const authorizationRepository: AuthorizationRepository = {
  /**
   * Uma consulta, com LEFT JOIN, porque o profile pode existir sem membership —
   * é o estado de quem autenticou e ainda não foi autorizado, e ele precisa
   * chegar ao core como 403 e não como "profile não existe".
   *
   * Zero linhas significa profile ausente: primeiro login.
   */
  async loadProfileSnapshot(profileId) {
    const linhas = await db
      .select({
        displayName: profiles.displayName,
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
      })
      .from(profiles)
      .leftJoin(workspaceMembers, eq(workspaceMembers.profileId, profiles.id))
      .where(eq(profiles.id, profileId));

    if (linhas.length === 0) {
      return { displayName: null, memberships: [] };
    }

    return {
      displayName: linhas[0]!.displayName,
      memberships: linhas
        .filter((linha) => linha.workspaceId !== null && linha.role !== null)
        .map((linha) => ({
          workspaceId: linha.workspaceId!,
          role: linha.role!,
        })),
    };
  },

  async upsertProfile(profile) {
    await db
      .insert(profiles)
      .values(profile)
      .onConflictDoUpdate({
        target: profiles.id,
        set: { displayName: profile.displayName, updatedAt: new Date() },
      });
  },
};
