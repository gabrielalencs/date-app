import { Images, ArrowRight } from "lucide-react";
import { PageIntro, PhotoStory } from "@/components/brand/editorial";
import { ButtonLink } from "@/components/ui/button-link";

export default function Page() {
  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="O que fica com a gente"
        title="Memórias"
        description="Pequenos detalhes. Dias que merecem ser lembrados."
      />
      <div className="grid items-center gap-8 lg:grid-cols-2">
        <PhotoStory className="min-h-96" priority>
          <p className="type-display-l max-w-[13ch]">
            Tem momentos
            <br />
            que ficam.
          </p>
          <span className="editorial-rule mt-5" />
        </PhotoStory>
        <section className="flex flex-col items-start gap-5 py-6">
          <span className="bg-sage-soft grid size-16 place-items-center rounded-lg">
            <Images aria-hidden="true" className="size-7" strokeWidth={1.5} />
          </span>
          <h2 className="type-display-l max-w-[16ch]">
            As histórias de vocês vão morar aqui.
          </h2>
          <p className="type-body text-text-muted max-w-[42ch]">
            O álbum de memórias está chegando. Enquanto isso, guardem as fotos
            nos seus planos para ter o que revisitar depois.
          </p>
          <ButtonLink href="/ideias" variant="secondary">
            Revisitar nossos planos
            <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
        </section>
      </div>
    </div>
  );
}
