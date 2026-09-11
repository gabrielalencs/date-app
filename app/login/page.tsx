import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { PhotoStory } from "@/components/brand/editorial";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Entrar · date" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh p-3 sm:p-5 lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-8">
      <PhotoStory
        priority
        className="min-h-72 justify-between p-6 lg:min-h-[calc(100dvh-2.5rem)] lg:p-12"
      >
        <Wordmark onPhoto className="w-36 lg:w-44" />
        <div className="mt-6 lg:mt-16">
          <p className="font-display max-w-[10ch] text-[2.25rem] leading-none tracking-tight lg:text-[4rem]">
            Mais planos.
            <br />
            Mais vida.
            <br />
            Juntos.
          </p>
          <span className="editorial-rule mt-4 lg:mt-6" />
          <p className="type-body-s mt-6 hidden max-w-[30ch] lg:block">
            Experiências de hoje,
            <br />
            memórias para sempre.
          </p>
        </div>
      </PhotoStory>
      <section className="flex flex-col justify-center px-4 py-10 lg:px-8">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
          <header className="flex flex-col gap-3">
            <span className="type-label text-text-muted">
              O espaço de vocês
            </span>
            <h1 className="type-display-l">
              Que bom ter
              <br />
              você por aqui.
            </h1>
            <p className="type-body-s text-text-muted">
              Entre para continuar os planos de vocês.
            </p>
          </header>
          <LoginForm />
          <div className="border-border-subtle flex flex-col gap-6 border-t pt-6">
            <p className="type-meta text-text-muted flex items-center gap-2">
              <LockKeyhole aria-hidden="true" className="size-4" />
              Um espaço privado, feito para dois.
            </p>
            <div className="w-44">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
