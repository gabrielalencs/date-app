"use client";

import { ArrowUpRight, Plus, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { EditorialNote } from "@/components/brand/editorial";
import { ThemeToggle } from "@/components/theme-toggle";
import { ButtonLink } from "@/components/ui/button-link";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { cn } from "@/lib/cn";
import { isActivePath, NAV, NEW_PLAN_HREF, PROFILE_HREF } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside
      data-shell="sidebar"
      className="border-border-subtle bg-surface fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r px-5 py-8 md:flex"
    >
      <Link
        href="/"
        aria-label="date · Início"
        className="mx-auto mb-8 rounded-sm"
      >
        <Wordmark tagline />
      </Link>
      <ButtonLink href={NEW_PLAN_HREF} variant="accent" fullWidth>
        <Plus aria-hidden="true" className="size-5" />
        Novo DATE
      </ButtonLink>
      <nav aria-label="Navegação principal" className="mt-7">
        <ul className="flex flex-col gap-2">
          {NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-h-12 items-center gap-3 rounded-md px-4 text-sm",
                    active
                      ? "bg-mist-soft text-text font-semibold"
                      : "text-text-muted hover:bg-surface-soft hover:text-text",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5"
                    strokeWidth={1.6}
                  />
                  {item.label}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="bg-accent ml-auto size-1.5 rounded-full"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto pt-8">
        <EditorialNote className="mb-6 min-h-40 p-5" tone="sage">
          Mais planos.
          <br />
          Mais vida.
          <br />
          Juntos.
        </EditorialNote>
        <ThemeToggle />
        <Link
          href={PROFILE_HREF}
          aria-current={pathname === PROFILE_HREF ? "page" : undefined}
          className="text-text-muted hover:bg-surface-soft mt-3 flex min-h-12 items-center gap-3 rounded-md px-3 text-sm"
        >
          <User aria-hidden="true" className="size-5" />
          Perfil
          <ArrowUpRight aria-hidden="true" className="ml-auto size-4" />
        </Link>
        <SignOutButton />
      </div>
    </aside>
  );
}
