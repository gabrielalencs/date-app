import type { NotificationKind } from "@/features/notifications/kinds";
import type { ReminderOffset } from "@/features/notifications/policy/schedule";

/**
 * A chave de agregação (seção 8 do docs/NOTIFICATIONS.md).
 *
 * O único parcial do banco cobre `(workspace, recipient, dedupe_key)` enquanto
 * a intent está aberta. A consequência prática é a que o produto pede: quatro
 * datas sugeridas dentro da janela de 20 minutos colidem na mesma chave e viram
 * **uma** notificação agregada; trocar o voto de sim para talvez e de volta
 * para sim atualiza a mesma intent e o que sai é o estado final.
 *
 * A chave inclui o ator onde o debounce é por pessoa. Sem isso, as duas pessoas
 * sugerindo datas no mesmo plano se calariam mutuamente, e o segundo a agir
 * sumiria da notificação do primeiro.
 */
export function dedupeKeyFor(input: {
  kind: NotificationKind;
  planId?: string | null;
  actorProfileId?: string | null;
  offsetDays?: ReminderOffset;
}): string {
  const { kind, planId, actorProfileId, offsetDays } = input;

  switch (kind) {
    /* Por plano e por ator: é a negociação de uma pessoa sobre um plano. */
    case "date_suggested":
    case "vote_cast":
      return `${kind}:${planId}:${actorProfileId}`;

    /* Por plano e por offset: os quatro lembretes do mesmo date são quatro
       intents distintas e nenhuma delas pode engolir as outras. */
    case "date_reminder":
      return `${kind}:${planId}:${offsetDays}`;

    /* Por plano. Dois cliques em "quero muito" no mesmo minuto são um fato só;
       arquivar, desarquivar e arquivar de novo dentro da hora também. */
    default:
      return `${kind}:${planId}`;
  }
}
