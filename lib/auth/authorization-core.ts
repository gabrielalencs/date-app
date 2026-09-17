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

/** O que uma única consulta devolve sobre a identidade. */
export type ProfileSnapshot = {
  /** `null` quando o profile ainda não existe — primeiro login. */
  displayName: string | null;
  memberships: readonly WorkspaceMembership[];
};

export type AuthorizationRepository = {
  /**
   * Perfil e memberships numa consulta só.
   *
   * Eram duas idas e voltas — um UPSERT e um SELECT — em **toda** requisição
   * autenticada, inclusive em cada `/api/media/[id]` de uma grade de fotos.
   * Medido em desenvolvimento, com o banco a ~14 ms: 28 ms por requisição, ou
   * metade do tempo de servidor da página. Com a função longe do banco, como
   * numa região dos Estados Unidos contra `sa-east-1`, os mesmos dois saltos
   * passam de 240 ms — antes de a página ler o primeiro dado dela.
   */
  loadProfileSnapshot(profileId: string): Promise<ProfileSnapshot>;
  upsertProfile(profile: { id: string; displayName: string }): Promise<void>;
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

  const desejado = displayNameFor(identity);
  const snapshot = await repository.loadProfileSnapshot(identity.id);

  /* A escrita só acontece quando há o que escrever: no primeiro login, quando o
     profile ainda não existe, e quando a pessoa trocou o nome no provedor. No
     estado normal — que é todo o resto do tempo — a resolução de contexto é uma
     leitura e nada mais.

     Gravar a cada requisição também mantinha uma linha de `profiles` sob
     escrita constante sem que nada mudasse nela. */
  if (snapshot.displayName !== desejado) {
    await repository.upsertProfile({ id: identity.id, displayName: desejado });
  }

  const memberships = snapshot.memberships;
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
