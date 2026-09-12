import { Wallet } from "lucide-react";

import {
  AddExpenseForm,
  ExpenseRow,
} from "@/features/planning/components/expense-controls";
import type { ExpenseEntry } from "@/features/planning/data/queries";
import { totalCents } from "@/features/planning/data/queries";
import { formatCents } from "@/lib/money";

/**
 * Os gastos e o total.
 *
 * O total é soma de inteiros (`sumCents`), e a comparação com o orçamento só
 * aparece quando há orçamento: `estimated_budget_cents` é nulo quando ninguém
 * informou, e comparar com um número que não existe seria inventar precisão.
 *
 * Sem gráfico, sem divisão, sem saldo — o spec proíbe virar Splitwise, e é essa
 * ausência de divisão que mantém a aritmética exata de ponta a ponta.
 */
export function PlanExpenses({
  planId,
  expenses,
  estimatedBudgetCents,
  members,
  readOnly,
}: {
  planId: string;
  expenses: readonly ExpenseEntry[];
  estimatedBudgetCents: number | null;
  members: readonly { profileId: string; displayName: string }[];
  readOnly: boolean;
}) {
  if (readOnly && expenses.length === 0) return null;

  const total = totalCents(expenses);
  const budget = estimatedBudgetCents;
  const diferenca = budget === null ? null : total - budget;

  return (
    <section className="panel flex flex-col gap-5" aria-label="Gastos">
      <h2 className="section-heading flex items-center gap-3">
        <Wallet aria-hidden="true" className="size-5" strokeWidth={1.5} />
        Gastos
      </h2>

      {expenses.length === 0 ? (
        <p className="type-body-s text-text-muted">
          Nenhum gasto lançado. Dá para anotar antes mesmo do date acontecer.
        </p>
      ) : (
        <>
          <ul className="flex flex-col">
            {expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                planId={planId}
                expense={expense}
                readOnly={readOnly}
              />
            ))}
          </ul>

          <div className="border-border-subtle flex flex-wrap items-baseline justify-between gap-2 border-t pt-4">
            <span className="type-label text-text-muted">Total</span>
            <span data-expense-total={total} className="type-title tnum">
              {formatCents(total)}
            </span>
          </div>

          {diferenca === null || budget === null ? null : (
            <p className="type-meta text-text-muted tnum">
              {formatCents(budget)} estimados
              {diferenca === 0
                ? " · bateu certinho"
                : diferenca > 0
                  ? ` · ${formatCents(diferenca)} acima`
                  : ` · ${formatCents(-diferenca)} abaixo`}
            </p>
          )}
        </>
      )}

      {readOnly ? null : <AddExpenseForm planId={planId} members={members} />}
    </section>
  );
}
