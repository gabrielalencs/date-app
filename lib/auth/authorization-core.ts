import { z } from "zod";

import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/errors";
import { isAllowedEmail, normalizedEmail } from "@/lib/auth/config";

export type SessionIdentity = {
  id: string;
  email: string;
  name?: string | null;
};

export type AuthSession = {
  user: SessionIdentity;
} | null;

export type WorkspaceMembership = {
  workspaceId: string;
  role: "owner" | "member";
};

export type AuthorizedContext = {
  userId: string;
  profileId: string;
  workspaceId: string;
  role: "owner" | "member";
};

export type AuthorizationRepository = {
  upsertProfile(profile: { id: string; displayName: string }): Promise<void>;
  findMemberships(profileId: string): Promise<readonly WorkspaceMembership[]>;
};

export type AuthorizationInput = {
  session: AuthSession;
  allowedEmails: readonly string[];
};

const identitySchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  name: z.string().nullable().optional(),
});

function displayNameFor(identity: SessionIdentity): string {
  const name = identity.name?.trim();
  return name ? name : "Pessoa DATE";
}

/**
 * Resolve identidade e tenant exclusivamente a partir da sessão e da membership.
 * Não existe parâmetro de workspace; input do browser não participa da decisão.
 */
export async function resolveAuthorizedContext(
  input: AuthorizationInput,
  repository: AuthorizationRepository,
): Promise<AuthorizedContext> {
  if (!input.session) {
    throw new UnauthenticatedError();
  }

  const parsedIdentity = identitySchema.safeParse({
    ...input.session.user,
    email: normalizedEmail(input.session.user.email),
  });
  if (!parsedIdentity.success) {
    throw new UnauthenticatedError();
  }

  const identity = parsedIdentity.data;
  if (!isAllowedEmail(identity.email, input.allowedEmails)) {
    throw new ForbiddenError();
  }

  await repository.upsertProfile({
    id: identity.id,
    displayName: displayNameFor(identity),
  });

  const memberships = await repository.findMemberships(identity.id);
  if (memberships.length !== 1) {
    throw new ForbiddenError();
  }

  const membership = memberships[0]!;
  return {
    userId: identity.id,
    profileId: identity.id,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
}
