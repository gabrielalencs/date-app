import {
  isReminderKind,
  type NotificationKind,
} from "@/features/notifications/kinds";

/**
 * Quem recebe (seção 7 do docs/NOTIFICATIONS.md).
 *
 * Duas regras, e a primeira é a que importa: **nunca notificar o próprio
 * ator**. Receber no celular um aviso do que você acabou de fazer no celular é
 * o defeito mais óbvio de produto de notificação, e o único jeito de garantir
 * que ele não acontece é o destinatário nunca ser escolhido no local da ação.
 */
export function recipientsFor(input: {
  kind: NotificationKind;
  memberProfileIds: readonly string[];
  actorProfileId: string | null;
}): string[] {
  const { kind, memberProfileIds, actorProfileId } = input;

  /* Lembrete de calendário não tem ator: o date é dos dois, e os dois recebem —
     cada um filtrado depois pelas próprias preferences e subscriptions. */
  if (isReminderKind(kind)) {
    return [...memberProfileIds];
  }

  return memberProfileIds.filter((id) => id !== actorProfileId);
}

/**
 * O interruptor do Perfil que governa este kind.
 *
 * `push_enabled` é o geral e é conferido à parte; estes dois são o recorte que
 * a pessoa escolhe: quero os lembretes do que já está marcado sem querer saber
 * de cada ideia nova, ou o contrário.
 */
export function preferenceGateFor(
  kind: NotificationKind,
): "dateRemindersEnabled" | "activityEnabled" {
  return isReminderKind(kind) ? "dateRemindersEnabled" : "activityEnabled";
}
