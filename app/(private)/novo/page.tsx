import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Lightbulb } from "lucide-react";
import {
  PageIntro,
  PhotoStory,
  EditorialNote,
} from "@/components/brand/editorial";
import { NewPlanForm } from "@/features/plans/components/new-plan-form";
import { requireAuthorizedContext } from "@/lib/auth/authorization";

export const metadata: Metadata = { title: "Novo DATE" };

export default async function Page() {
  await requireAuthorizedContext();
  return (
    <div className="page-stack">
      <Link
        href="/ideias"
        className="text-text-muted inline-flex min-h-11 w-fit items-center gap-2 text-sm"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar às ideias
      </Link>
      <PageIntro
        eyebrow="O começo de um bom plano"
        title="Nova ideia"
        description="Aquele lugar, uma vontade, um dia diferente. Salve agora e planejem juntos depois."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <NewPlanForm />
        <aside className="flex flex-col gap-5">
          <PhotoStory image="table" className="min-h-80" priority>
            <p className="type-display-l max-w-[12ch]">
              Boas ideias.
              <br />
              Melhores histórias.
            </p>
            <span className="editorial-rule mt-5" />
          </PhotoStory>
          <div className="bg-sage-soft rounded-lg p-6">
            <h2 className="section-heading flex items-center gap-3">
              <Lightbulb aria-hidden="true" className="size-5 shrink-0" />
              Para lembrar depois
            </h2>
            <ul className="type-body-s mt-5 flex flex-col gap-4">
              {[
                "Escolha um nome que faça sentido para vocês.",
                "Guarde o link de onde veio a inspiração.",
                "A data pode ficar para a próxima conversa.",
              ].map((text) => (
                <li key={text} className="flex gap-3">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <EditorialNote tone="blush">
            Planos de hoje,
            <br />
            memórias para sempre.
          </EditorialNote>
        </aside>
      </div>
    </div>
  );
}
