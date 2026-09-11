import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/errors";

/** O proxy é otimista; a autorização real acontece aqui, perto dos dados. */
export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: LayoutProps<"/">) {
  try {
    await requireAuthorizedContext();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }
    if (error instanceof ForbiddenError) {
      redirect("/login?erro=sem-acesso");
    }
    throw error;
  }

  return <AppShell>{children}</AppShell>;
}
