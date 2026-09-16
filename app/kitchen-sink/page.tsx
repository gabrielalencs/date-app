import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KitchenSinkShowcase } from "@/app/kitchen-sink/showcase";

/**
 * Vitrine do design system. Existe apenas sob DATE_ENABLE_KITCHEN_SINK (D-034):
 * sem a variável a rota não existe — 404 de verdade, não rota pública
 * protegida. A variável fica no .env.local e nunca vai para a Vercel.
 */
export const metadata: Metadata = { title: "Kitchen sink" };

export default function Page() {
  if (process.env.DATE_ENABLE_KITCHEN_SINK !== "true") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <KitchenSinkShowcase />
    </main>
  );
}
