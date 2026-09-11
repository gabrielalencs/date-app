import { CalendarDays, ArrowRight } from "lucide-react";
import { PageIntro, PhotoStory } from "@/components/brand/editorial";
import { ButtonLink } from "@/components/ui/button-link";

export default function Page() {
  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Mais tempo juntos"
        title="Nossa agenda"
        description="Mais do que compromissos, momentos para viver a dois."
      />
      <div className="grid items-center gap-8 lg:grid-cols-2">
        <section className="flex flex-col items-start gap-5 py-6">
          <span className="bg-mist-soft grid size-16 place-items-center rounded-lg">
            <CalendarDays
              aria-hidden="true"
              className="size-7"
              strokeWidth={1.5}
            />
          </span>
          <h2 className="type-display-l max-w-[16ch]">
            Um tempo reservado para vocês.
          </h2>
          <p className="type-body text-text-muted max-w-[42ch]">
            Em breve, os planos vão se encontrar aqui no calendário. Por
            enquanto, vocês podem combinar as datas dentro de cada plano.
          </p>
          <ButtonLink href="/ideias" variant="secondary">
            Ver nossas ideias
            <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </section>
        <PhotoStory image="table" className="min-h-96" priority>
          <p className="type-title max-w-[16ch]">
            Um bom encontro começa muito antes da hora marcada.
          </p>
          <span className="editorial-rule mt-5" />
        </PhotoStory>
      </div>
    </div>
  );
}
