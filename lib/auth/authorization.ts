import "server-only";

import { cache } from "react";

import { authorizationRepository } from "@/features/auth/data/authorization-repository";
import {
  resolveAuthorizedContext,
  type AuthSession,
  type AuthorizedContext,
} from "@/lib/auth/authorization-core";
import { getAuthConfig } from "@/lib/auth/env";
import { getAuth } from "@/lib/auth/server";

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

/** Fronteira obrigatória para toda query ou mutation de domínio. */
export const requireAuthorizedContext = cache(loadAuthorizedContext);
