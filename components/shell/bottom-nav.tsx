"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { isActivePath, NAV, NEW_PLAN_HREF } from "@/lib/nav";

export function BottomNav() {
  const pathname = usePathname();
  const left = NAV.slice(0, 2);
  const right = NAV.slice(2);

  return (
    <nav
      aria-label="Navegação principal"
      /* Somado, não substituído: com max() a barra encosta no indicador de
         gestos do aparelho, porque o inset (34px no iPhone) simplesmente vence
         o respiro de 0.5rem em vez de se somar a ele. */
      className="border-border-subtle bg-surface shadow-raised fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-30 rounded-lg border px-1 md:hidden"
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
            className="bg-brand text-brand-fg ease-standard my-2 grid size-12 place-items-center rounded-full transition-transform duration-[var(--duration-micro)] motion-safe:active:scale-95"
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
  item: (typeof NAV)[number];
  pathname: string;
}) {
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className="relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2"
      >
        <Icon
          aria-hidden="true"
          className={cn("size-5", active ? "text-text" : "text-text-muted")}
        />
        <span
          className={cn(
            "type-label-nav",
            active ? "text-text" : "text-text-muted",
          )}
        >
          {item.label}
        </span>
        {active ? (
          <span
            aria-hidden="true"
            className="bg-accent absolute bottom-1 h-0.5 w-4 rounded-full"
          />
        ) : null}
      </Link>
    </li>
  );
}
