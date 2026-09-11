"use client";

import { Plus, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";
import { isActivePath, NAV, NEW_PLAN_HREF, PROFILE_HREF } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      data-shell="sidebar"
      className="border-border-subtle bg-surface fixed inset-y-0 left-0 hidden w-60 flex-col border-r md:flex"
    >
      <div className="px-5 py-3">
        <Link
          href="/"
          className="type-title text-text inline-flex min-h-11 items-center"
        >
          date
        </Link>
      </div>

      <div className="px-4">
        <Link
          href={NEW_PLAN_HREF}
          className="bg-accent text-accent-fg hover:bg-accent-hover flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-[1.1875rem] font-semibold transition-opacity duration-[var(--duration-micro)]"
        >
          <Plus aria-hidden="true" className="size-5" />
          Novo DATE
        </Link>
      </div>

      <nav aria-label="Navegação principal" className="mt-6 flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "type-body flex min-h-11 items-center gap-3 rounded-md px-3",
                    active
                      ? "bg-surface-sunken text-text"
                      : "text-text-muted hover:bg-surface-sunken hover:text-text",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-5",
                      active ? "text-accent" : "text-text-muted",
                    )}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-border-subtle flex flex-col gap-3 border-t p-4">
        <ThemeToggle />
        <Link
          href={PROFILE_HREF}
          className="type-body-s text-text-muted hover:bg-surface-sunken hover:text-text flex min-h-11 items-center gap-3 rounded-md px-3"
        >
          <User aria-hidden="true" className="size-5" />
          Perfil
        </Link>
        <SignOutButton />
      </div>
    </aside>
  );
}
