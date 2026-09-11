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
  async upsertProfile(profile) {
    await db
      .insert(profiles)
      .values(profile)
      .onConflictDoUpdate({
        target: profiles.id,
        set: { displayName: profile.displayName, updatedAt: new Date() },
      });
  },

  async findMemberships(profileId) {
    return db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.profileId, profileId));
  },
};
