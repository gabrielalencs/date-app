import { LogOut } from "lucide-react";

import { signOutAction } from "@/features/auth/actions/sign-out";

/** Form real: sem JS a sessão ainda é invalidada no servidor. */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="type-body-s text-text-muted hover:bg-surface-sunken hover:text-text flex min-h-11 w-full items-center gap-3 rounded-md px-3"
      >
        <LogOut aria-hidden="true" className="size-5" />
        Sair
      </button>
    </form>
  );
}
