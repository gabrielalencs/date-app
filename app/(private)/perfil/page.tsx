import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { requireAuthorizedContext } from "@/lib/auth/authorization";

export default async function Page() {
  const context = await requireAuthorizedContext();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="type-display-l text-text">Perfil</h1>

      <dl className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <dt className="type-label text-text-muted">Papel</dt>
          <dd className="type-body text-text">
            {context.role === "owner" ? "Proprietário" : "Membro"}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 md:hidden">
        <span className="type-label text-text-muted">Tema</span>
        <ThemeToggle />
      </div>

      <div className="border-border-subtle border-t pt-6">
        <SignOutButton />
      </div>
    </div>
  );
}
