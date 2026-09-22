import { formatCents } from "@/lib/money";

/**
 * O que ainda falta para a ideia virar um plano.
 *
 * Até o R2, "Editar detalhes" era uma gaveta fechada no fim da página, depois
 * de datas, checklist, gastos e fotos. Quem acabava de salvar uma ideia com
 * título e categoria — que é como toda ideia nasce, por decisão do B4 — tinha
 * de rolar a página inteira, passando por seis seções vazias, para descobrir
 * onde se escreve o resto. A tela dizia "está tudo aqui" e escondia justamente
 * a parte em que se trabalha.
 *
 * Isto inverte a ordem: a página abre dizendo o que falta. Módulo puro e sem
 * `server-only` de propósito — é regra de produto, não consulta, e o tipo de
 * entrada é estrutural para poder ser testado sem banco nem sessão.
 */

export type PlanFacts = {
  description: string | null;
  placeName: string | null;
  /** Legado: preenchido até o R3, quando o formulário perdeu o campo. */
  city: string | null;
  estimatedBudgetCents: number | null;
  sourceUrl: string | null;
  notes: string | null;
  coverMediaId: string | null;
};

export type GapKey =
  | "description"
  | "place"
  | "budget"
  | "sourceUrl"
  | "notes"
  | "cover";

export type PlanGap = {
  key: GapKey;
  label: string;
  filled: boolean;
  /** O que está lá, quando está. O convite, quando não está. */
  detail: string;
};

/** Texto em branco não conta como preenchido. */
function trimmed(value: string | null): string | null {
  const limpo = value?.trim();
  return limpo ? limpo : null;
}

/**
 * O domínio do link, que é o que identifica uma referência de relance.
 *
 * A URL já passou pelo Zod na escrita, mas a leitura não confia nisso: uma
 * linha antiga, um seed ou um dado colado à mão não passaram por lá, e um
 * `new URL` que lança derrubaria a página de detalhe inteira por causa de um
 * rótulo.
 */
export function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Abrir referência";
  }
}

export function planGaps(plan: PlanFacts): PlanGap[] {
  const onde = trimmed(plan.placeName) ?? trimmed(plan.city);
  const referencia = trimmed(plan.sourceUrl);

  return [
    {
      key: "cover",
      /* "Foto de capa", e nao "Capa": o selo que a grade de fotos coloca na
         foto escolhida já se chama "Capa", e as duas coisas dividem a mesma
         página. Dois rótulos idênticos para coisas diferentes confundem quem
         lê a tela e quem a testa. */
      label: "Foto de capa",
      filled: plan.coverMediaId !== null,
      detail: plan.coverMediaId !== null ? "escolhida" : "Nenhuma foto ainda",
    },
    {
      key: "place",
      label: "Onde",
      filled: onde !== null,
      detail: onde ?? "Um lugar para escolher",
    },
    {
      key: "budget",
      label: "Orçamento",
      filled: plan.estimatedBudgetCents !== null,
      detail:
        plan.estimatedBudgetCents === null
          ? "Para combinar"
          : formatCents(plan.estimatedBudgetCents),
    },
    {
      key: "description",
      label: "Descrição",
      filled: trimmed(plan.description) !== null,
      detail:
        trimmed(plan.description) !== null
          ? "escrita"
          : "O que faz esse plano especial?",
    },
    {
      key: "sourceUrl",
      label: "Referência",
      filled: referencia !== null,
      detail: referencia === null ? "De onde veio a ideia" : linkLabel(referencia),
    },
    /* O formulário sempre teve "Observações" e a lista não o contava, então o
       contador dizia 5 de 5 com um campo ainda em branco — e a pessoa que
       escreveu ali não via o registro disso em lugar nenhum. */
    {
      key: "notes",
      label: "Observações",
      filled: trimmed(plan.notes) !== null,
      detail:
        trimmed(plan.notes) !== null ? "anotadas" : "Algo mais para lembrar?",
    },
  ];
}

export function countFilled(gaps: readonly PlanGap[]): number {
  return gaps.filter((gap) => gap.filled).length;
}

export function isComplete(gaps: readonly PlanGap[]): boolean {
  return countFilled(gaps) === gaps.length;
}
