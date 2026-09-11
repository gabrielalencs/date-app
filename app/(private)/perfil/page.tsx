import { ShieldCheck, UserRound, Palette } from "lucide-react";
import {
  PageIntro,
  PhotoStory,
  EditorialNote,
} from "@/components/brand/editorial";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { requireAuthorizedContext } from "@/lib/auth/authorization";

export default async function Page() {
  const context = await requireAuthorizedContext();
  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Seu espaço no DATE"
        title="Perfil"
        description="Um lugar para cuidar dos planos e do seu jeito de estar aqui."
      />
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="panel flex flex-col gap-8">
          <div className="flex items-center gap-5">
            <span className="bg-mist-soft grid size-16 shrink-0 place-items-center rounded-full">
              <UserRound
                aria-hidden="true"
                className="size-7"
                strokeWidth={1.5}
              />
            </span>
            <div>
              <p className="section-heading">Um espaço para dois.</p>
              <p className="type-body-s text-text-muted mt-2">
                A vida de vocês, com mais planos juntos.
              </p>
            </div>
          </div>
          <dl className="border-border-subtle border-y py-6">
            <dt className="type-label text-text-muted">Papel</dt>
            <dd className="mt-3 flex items-center gap-3">
              <ShieldCheck aria-hidden="true" className="size-5" />
              {context.role === "owner" ? "Proprietário" : "Membro"}
            </dd>
          </dl>
          <section className="flex flex-col gap-4">
            <h2 className="section-heading flex items-center gap-3">
              <Palette aria-hidden="true" className="size-5" />
              Do seu jeito
            </h2>
            <p className="type-body-s text-text-muted">
              Escolha o tema ou acompanhe a aparência do seu aparelho.
            </p>
            <ThemeToggle />
          </section>
          <div className="border-border-subtle border-t pt-5">
            <SignOutButton />
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <PhotoStory className="min-h-80" priority>
            <p className="type-title max-w-[16ch]">
              Tempo de qualidade começa com presença.
            </p>
            <span className="editorial-rule mt-5" />
          </PhotoStory>
          <EditorialNote tone="sage">
            Mais planos.
            <br />
            Mais vida. Juntos.
          </EditorialNote>
        </div>
      </div>
    </div>
  );
}
