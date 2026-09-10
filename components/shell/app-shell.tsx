import type { ReactNode } from "react";

import { BottomNav } from "@/components/shell/bottom-nav";
import { Sidebar } from "@/components/shell/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:pl-60">
      <Sidebar />
      {/* pb generoso no mobile para o conteúdo não morrer atrás da bottom nav. */}
      <main className="mx-auto w-full max-w-[1120px] px-4 pt-8 pb-32 md:px-8 md:pb-12">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
