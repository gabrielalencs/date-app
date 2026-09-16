/**
 * A lista canônica de `kind` (seção 5 do docs/NOTIFICATIONS.md).
 *
 * A coluna é `text` no banco pelo mesmo motivo de `plans.category` (D-026):
 * acrescentar uma copy nova não pode exigir migration. A validação mora aqui.
 *
 * Nenhum módulo deste diretório importa banco: `kinds`, `policy` e `templates`
 * são puros de propósito, para caberem inteiros na suíte de unidade.
 */
export const NOTIFICATION_KINDS = [
  "plan_created",
  "want_a_lot",
  "date_suggested",
  "vote_cast",
  "date_confirmed",
  "booking_updated",
  "plan_cancelled",
  "plan_archived",
  "plan_completed",
  "memory_added",
  "date_reminder",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function isNotificationKind(value: unknown): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly unknown[]).includes(value);
}

/**
 * Quais kinds são "atividade do casal" e quais são lembrete de calendário.
 *
 * A separação existe porque a pessoa pode querer os lembretes do date que já
 * está marcado sem querer saber, no mesmo instante, que o outro acabou de
 * guardar uma ideia. São dois interruptores no Perfil, e é esta função que os
 * liga à matriz.
 */
export function isReminderKind(kind: NotificationKind): boolean {
  return kind === "date_reminder";
}
