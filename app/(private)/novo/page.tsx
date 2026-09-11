import { NewPlanForm } from "@/features/plans/components/new-plan-form";
import { requireAuthorizedContext } from "@/lib/auth/authorization";

export default async function Page() {
  // Não usa o contexto para renderizar, mas exige sessão antes de oferecer o form.
  await requireAuthorizedContext();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="type-display-l text-text">Nova ideia</h1>
        <p className="type-body text-text-muted max-w-[46ch]">
          Título e categoria bastam agora. Local, orçamento e o resto entram
          depois, quando vocês souberem.
        </p>
      </header>

      <NewPlanForm />
    </div>
  );
}
