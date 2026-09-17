import { ArrowLeft } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";

/**
 * O 404 dentro do app.
 *
 * Vale para plano inexistente, plano de outro workspace e caminho digitado
 * errado — os três chegam aqui como a mesma coisa, de propósito: para quem está
 * de fora, "não é seu" e "não existe" precisam ser indistinguíveis (D-038).
 *
 * Sem este arquivo, o `notFound()` que o B4 já chamava caía na página padrão do
 * Next, fora do shell e fora da identidade.
 */
export default function NotFound() {
  return (
    <div className="page-stack">
      <div className="flex max-w-prose flex-col gap-4">
        <span className="type-label text-text-muted">Não encontrado</span>
        <h1 className="type-display-l">Essa página não existe.</h1>
        <p className="type-body text-text-muted">
          O link pode estar velho, ou o plano pode ter sido apagado.
        </p>

        <div className="pt-2">
          <ButtonLink href="/ideias" variant="secondary" className="w-fit">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Voltar às ideias
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
