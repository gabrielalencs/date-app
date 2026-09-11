import type { ReactNode } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";

import { BottomNav } from "@/components/shell/bottom-nav";
import { Sidebar } from "@/components/shell/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:pl-60">
      <a
        href="#conteudo"
        className="bg-brand text-brand-fg sr-only z-50 rounded-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:min-h-11 focus:p-3"
      >
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4 px-5 py-5 md:px-10 md:py-6">
        <Link href="/" aria-label="date · Início" className="md:hidden">
          <Wordmark className="origin-left scale-75" />
        </Link>
        <span className="type-label text-text-muted hidden md:block">
          Um tempo só de vocês
        </span>
        <Link
          href="/perfil"
          className="text-text-muted hover:bg-mist-soft flex min-h-11 items-center gap-2 rounded-full px-3 text-xs"
        >
          <UserRound className="size-4" aria-hidden="true" />
          Perfil
        </Link>
      </div>
      {/* pb generoso no mobile para o conteúdo não morrer atrás da bottom nav. */}
      <main
        id="conteudo"
        className="mx-auto w-full max-w-[1360px] px-5 pt-3 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-10 md:pt-6 md:pb-12"
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
