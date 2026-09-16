import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/errors";

/** O proxy é otimista; a autorização real acontece aqui, perto dos dados. */
export const dynamic = "force-dynamic";

/**
 * Em desenvolvimento, diz no terminal **por que** mandou de volta ao login.
 *
 * Sem isto, os dois motivos chegam como a mesma coisa na tela — um GET /login —
 * e quem está preso no laço não tem como distinguir "o cookie não chegou" de
 * "o cookie chegou e a pessoa não é membro do workspace". São defeitos
 * diferentes, procurados em lugares diferentes.
 *
 * Não imprime nada em produção, e nunca imprime o cookie nem o e-mail.
 */
function explicarEmDesenvolvimento(motivo: string, detalhe: string): void {
  if (process.env.NODE_ENV === "production") return;

  console.warn(
    `\n[DATE] Voltando para /login — ${motivo}.\n       ${detalhe}\n`,
  );
}

export default async function PrivateLayout({ children }: LayoutProps<"/">) {
  try {
    await requireAuthorizedContext();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      explicarEmDesenvolvimento(
        "o servidor não recebeu uma sessão válida",
        "O cookie não chegou nesta requisição, ou o provedor não o reconheceu. " +
          "Confira a origem no navegador: fora de HTTPS, localhost ou 127.0.0.1 " +
          "o cookie `__Secure-` é descartado em silêncio.",
      );
      redirect("/login");
    }
    if (error instanceof ForbiddenError) {
      explicarEmDesenvolvimento(
        "a sessão é válida, mas a conta não tem acesso",
        "A pessoa está autenticada e não está na allowlist, ou não é membro de " +
          "exatamente um workspace. Rode `pnpm auth:bootstrap-dev`.",
      );
      redirect("/login?erro=sem-acesso");
    }
    throw error;
  }

  return <AppShell>{children}</AppShell>;
}
