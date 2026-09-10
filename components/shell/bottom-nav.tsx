"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { isActivePath, MOBILE_NAV, NEW_PLAN_HREF } from "@/lib/nav";

export function BottomNav() {
  const pathname = usePathname();
  const left = MOBILE_NAV.slice(0, 2);
  const right = MOBILE_NAV.slice(2);

  return (
    <nav
      aria-label="Navegação principal"
      className="border-border-subtle bg-surface fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-[1fr_1fr_3.5rem_1fr_1fr] items-end">
        {left.map((item) => (
          <NavSlot key={item.href} item={item} pathname={pathname} />
        ))}

        <li className="grid place-items-center">
          {/* O + é o único elemento coral da barra, meio passo acima dela. */}
          <Link
            href={NEW_PLAN_HREF}
            aria-label="Novo DATE"
            title="Novo DATE"
            className="bg-accent text-accent-fg ease-standard -mt-5 grid size-14 place-items-center rounded-full shadow-[var(--shadow-raised)] transition-transform duration-[var(--duration-micro)] active:scale-95"
          >
            <Plus aria-hidden="true" className="size-6" />
          </Link>
        </li>

        {right.map((item) => (
          <NavSlot key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}

function NavSlot({
  item,
  pathname,
}: {
  item: (typeof MOBILE_NAV)[number];
  pathname: string;
}) {
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2"
      >
        <Icon
          aria-hidden="true"
          className={cn("size-5", active ? "text-accent" : "text-text-muted")}
        />
        <span
          className={cn(
            "type-label-nav",
            active ? "text-text" : "text-text-muted",
          )}
        >
          {item.label}
        </span>
      </Link>
    </li>
  );
}
