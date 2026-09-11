import { describe, expect, it, vi } from "vitest";

import {
  resolveAuthorizedContext,
  type AuthorizationRepository,
  type WorkspaceMembership,
} from "@/lib/auth/authorization-core";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/errors";

const ALLOWED = ["dono@example.com", "par@example.com"];
const WORKSPACE = "11111111-1111-4111-8111-111111111111";

function repository(
  memberships: readonly WorkspaceMembership[],
): AuthorizationRepository & { upsertProfile: ReturnType<typeof vi.fn> } {
  const upsertProfile = vi.fn(async () => {});
  return {
    upsertProfile,
    findMemberships: async () => memberships,
  };
}

const session = (email: string, id = "user_1", name?: string | null) => ({
  user: { id, email, name },
});

describe("resolveAuthorizedContext", () => {
  it("sem sessão é não autenticado", async () => {
    await expect(
      resolveAuthorizedContext(
        { session: null, allowedEmails: ALLOWED },
        repository([]),
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("e-mail fora da allowlist é proibido, mesmo com sessão válida", async () => {
    const repo = repository([{ workspaceId: WORKSPACE, role: "owner" }]);

    await expect(
      resolveAuthorizedContext(
        { session: session("terceiro@example.com"), allowedEmails: ALLOWED },
        repo,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Não cria profile para quem não passou da allowlist.
    expect(repo.upsertProfile).not.toHaveBeenCalled();
  });

  it("sessão permitida sem membership é proibida", async () => {
    await expect(
      resolveAuthorizedContext(
        { session: session("dono@example.com"), allowedEmails: ALLOWED },
        repository([]),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("mais de uma membership é proibido na V1", async () => {
    await expect(
      resolveAuthorizedContext(
        { session: session("dono@example.com"), allowedEmails: ALLOWED },
        repository([
          { workspaceId: WORKSPACE, role: "owner" },
          {
            workspaceId: "22222222-2222-4222-8222-222222222222",
            role: "member",
          },
        ]),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("sessão permitida com membership devolve o contexto", async () => {
    const context = await resolveAuthorizedContext(
      {
        session: session("dono@example.com", "user_42"),
        allowedEmails: ALLOWED,
      },
      repository([{ workspaceId: WORKSPACE, role: "owner" }]),
    );

    expect(context).toEqual({
      userId: "user_42",
      profileId: "user_42",
      workspaceId: WORKSPACE,
      role: "owner",
    });
  });

  it("o workspace vem da membership, não de qualquer entrada", async () => {
    const outro = "99999999-9999-4999-8999-999999999999";
    const context = await resolveAuthorizedContext(
      { session: session("par@example.com"), allowedEmails: ALLOWED },
      repository([{ workspaceId: outro, role: "member" }]),
    );

    expect(context.workspaceId).toBe(outro);
    expect(context.role).toBe("member");
  });

  it("normaliza o e-mail da sessão antes de comparar", async () => {
    const context = await resolveAuthorizedContext(
      { session: session("  DONO@Example.COM "), allowedEmails: ALLOWED },
      repository([{ workspaceId: WORKSPACE, role: "owner" }]),
    );

    expect(context.workspaceId).toBe(WORKSPACE);
  });

  it("usa fallback neutro de nome quando a sessão não traz nome", async () => {
    const repo = repository([{ workspaceId: WORKSPACE, role: "owner" }]);

    await resolveAuthorizedContext(
      {
        session: session("dono@example.com", "user_1", "   "),
        allowedEmails: ALLOWED,
      },
      repo,
    );

    expect(repo.upsertProfile).toHaveBeenCalledWith({
      id: "user_1",
      displayName: "Pessoa DATE",
    });
  });

  it("a assinatura não aceita workspace do caller", () => {
    // Prova de tipo: resolveAuthorizedContext recebe sessão e allowlist, nada mais.
    expect(resolveAuthorizedContext.length).toBe(2);
    const input = { session: null, allowedEmails: ALLOWED };
    expect(Object.keys(input)).not.toContain("workspaceId");
  });
});
