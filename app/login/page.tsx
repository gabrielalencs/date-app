import type { Metadata } from "next";
import Image from "next/image";

import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Entrar · date",
};

function Wordmark() {
  return (
    <>
      <Image
        src="/brand/logos/date-logo.svg"
        alt="date"
        width={168}
        height={70}
        priority
        unoptimized
        className="dark:hidden"
      />
      <Image
        src="/brand/logos/date-logo-on-dark.svg"
        alt="date"
        width={168}
        height={70}
        priority
        unoptimized
        className="hidden dark:block"
      />
    </>
  );
}

/* Sem shell, sem bottom nav, sem sidebar, sem "criar conta": o DATE não tem
   signup, nem na interface nem na fronteira HTTP.

   No desktop a tela é um split editorial em vez de um formulário solto no meio
   do vazio — "desktop não é mobile esticado". Sem fotografia até o B5, quem
   sustenta o lado esquerdo é a Fraunces grande. */
export default function LoginPage() {
  return (
    <main className="min-h-dvh md:grid md:grid-cols-2">
      <section className="flex flex-col justify-end gap-6 px-6 pt-16 pb-8 md:justify-center md:px-12 md:py-12">
        <Wordmark />
        <p className="type-display-l text-text max-w-[22ch]">
          Continue de onde vocês pararam.
        </p>
      </section>

      <section className="border-border-subtle flex flex-col justify-start px-6 pb-16 md:justify-center md:border-l md:px-12 md:py-12">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <h1 className="type-heading text-text">Entrar</h1>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
