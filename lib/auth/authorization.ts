import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { profiles, workspaceMembers } from "@/db/schema/index.ts";
import {
  resolveAuthorizedContext,
  type AuthSession,
  type AuthorizedContext,
  type AuthorizationRepository,
} from "@/lib/auth/authorization-core";
import { getAuthConfig } from "@/lib/auth/env";
import { getAuth } from "@/lib/auth/server";

const authorizationRepository: AuthorizationRepository = {
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

async function loadAuthorizedContext(): Promise<AuthorizedContext> {
  const { data, error } = await getAuth().getSession();
  const session: AuthSession =
    !error && data?.user?.id && data.user.email
      ? {
          user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
          },
        }
      : null;

  return resolveAuthorizedContext(
    { session, allowedEmails: getAuthConfig().allowedEmails },
    authorizationRepository,
  );
}

/** Fronteira obrigatória para toda futura query ou mutation de domínio. */
export const requireAuthorizedContext = cache(loadAuthorizedContext);
