import type { NotificationKind } from "@/features/notifications/kinds";

/**
 * A linguagem das notificações (docs/NOTIFICATION_COPY.md).
 *
 * Funções puras. Nenhum banco, nenhum relógio, nenhuma formatação de data: o
 * `dateLabel` chega pronto, porque quem sabe formatar data neste projeto é
 * `lib/datetime.ts` e ter uma segunda formatação aqui seria a porta dos fundos
 * do dia em UTC (D-073).
 *
 * Trocar copy não toca política. É por isso que este arquivo não decide nada
 * além de texto.
 */

export type PreviewMode = "private" | "full";

export type TemplateFacts = {
  /** Primeiro nome de quem agiu. Ausente em lembrete. */
  actorName?: string;
  planTitle?: string;
  /** "sábado, 3 de outubro" — já formatado no fuso do app. */
  dateLabel?: string;
  optionCount?: number;
  vote?: "yes" | "maybe" | "no";
  reservationStatus?: "pending" | "confirmed" | "cancelled";
  offsetDays?: number;
};

export type RenderedNotification = {
  title: string;
  body: string;
};

/**
 * Escolha de variante determinística.
 *
 * Nada de `Math.random()`: o mesmo intent renderiza a mesma frase em toda
 * tentativa, o que faz o retry ser idêntico ao original e faz o teste medir a
 * copy em vez de medir a sorte. É a mesma regra que o sorteador do B10 seguiu
 * por outro caminho (D-123).
 */
export function variantIndex(seed: string, total: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % total;
}

/** O que o lock screen mostra quando a pessoa escolheu não mostrar detalhes. */
const PRIVADO_ATIVIDADE: RenderedNotification = {
  title: "Tem novidade no DATE",
  body: "Abra para ver o que mudou.",
};

const PRIVADO_LEMBRETE: RenderedNotification = {
  title: "Vocês têm um date chegando",
  body: "Abra o DATE para conferir.",
};

function aspas(valor: string | undefined): string {
  return `“${valor ?? "um date"}”`;
}

function ator(facts: TemplateFacts): string {
  return facts.actorName ?? "Alguém";
}

function full(
  kind: NotificationKind,
  facts: TemplateFacts,
  seed: string,
): RenderedNotification {
  const plano = aspas(facts.planTitle);

  switch (kind) {
    case "plan_created": {
      const variantes: RenderedNotification[] = [
        {
          title: "Nova ideia por aqui",
          body: `${ator(facts)} adicionou ${plano}.`,
        },
        {
          title: "Entrou na lista",
          body: `${ator(facts)} guardou ${plano} para vocês.`,
        },
        {
          title: "Tem date novo na fila",
          body: `${plano} acabou de entrar nas ideias.`,
        },
      ];
      return variantes[variantIndex(seed, variantes.length)]!;
    }

    case "want_a_lot": {
      const variantes: RenderedNotification[] = [
        {
          title: "Isso ganhou prioridade",
          body: `${ator(facts)} marcou ${plano} como quero muito.`,
        },
        {
          title: "Recado entendido",
          body: `${ator(facts)} quer muito fazer ${plano}.`,
        },
      ];
      return variantes[variantIndex(seed, variantes.length)]!;
    }

    case "date_suggested": {
      const quantas = facts.optionCount ?? 1;
      if (quantas > 1) {
        return {
          title: "Tem opções para escolher",
          body: `${ator(facts)} sugeriu ${quantas} datas para ${plano}.`,
        };
      }
      return {
        title: "Tem data na mesa",
        body: `${ator(facts)} sugeriu uma data para ${plano}.`,
      };
    }

    case "vote_cast": {
      if (facts.vote === "yes") {
        return {
          title: "Um voto chegou",
          body: `${ator(facts)} topa essa data para ${plano}.`,
        };
      }
      if (facts.vote === "maybe") {
        return {
          title: "Ainda está em aberto",
          body: `${ator(facts)} marcou talvez em uma data de ${plano}.`,
        };
      }
      return {
        title: "Melhor olhar outra data",
        body: `${ator(facts)} não consegue nessa opção de ${plano}.`,
      };
    }

    case "date_confirmed": {
      const variantes: RenderedNotification[] = [
        {
          title: "Agora tem data",
          body: `${plano} está planejado para ${facts.dateLabel ?? "a data marcada"}.`,
        },
        {
          title: "Entrou no calendário",
          body: `${plano} ficou marcado para ${facts.dateLabel ?? "a data marcada"}.`,
        },
      ];
      return variantes[variantIndex(seed, variantes.length)]!;
    }

    case "booking_updated":
      return facts.reservationStatus === "confirmed"
        ? { title: "Reserva confirmada", body: `${plano} já tem reserva.` }
        : {
            title: "A reserva mudou",
            body: `${plano} não está mais com a reserva confirmada.`,
          };

    case "plan_cancelled":
      return { title: "Mudança de planos", body: `${plano} foi cancelado.` };

    case "plan_archived":
      /* "Arquivou", nunca "excluiu": a operação real é arquivar, e chamar de
         exclusão faria a pessoa procurar um plano que continua existindo. */
      return {
        title: "Saiu da lista ativa",
        body: `${ator(facts)} arquivou ${plano}.`,
      };

    case "plan_completed":
      return {
        title: "Esse date virou memória",
        body: `${plano} foi marcado como realizado.`,
      };

    case "memory_added":
      /* Sem a nota: quanto a pessoa deu para o date de vocês não é assunto de
         tela bloqueada. */
      return {
        title: "Tem avaliação nova",
        body: `${ator(facts)} contou como foi ${plano}.`,
      };

    case "date_reminder": {
      switch (facts.offsetDays) {
        case 7:
          return { title: "Uma semana", body: `${plano} é daqui a 7 dias.` };
        case 5:
          return { title: "Tá chegando", body: `Faltam 5 dias para ${plano}.` };
        case 3:
          return {
            title: "Já dá para entrar no clima",
            body: `${plano} é daqui a 3 dias.`,
          };
        default:
          return {
            title: "É amanhã",
            body: `${plano} está no calendário de amanhã.`,
          };
      }
    }

    default: {
      const inalcancavel: never = kind;
      throw new Error(`Kind sem copy: ${String(inalcancavel)}`);
    }
  }
}

export function renderNotification(input: {
  kind: NotificationKind;
  facts: TemplateFacts;
  previewMode: PreviewMode;
  /** `intentId`: é ele que torna a variante determinística. */
  seed: string;
}): RenderedNotification {
  if (input.previewMode === "private") {
    return input.kind === "date_reminder"
      ? PRIVADO_LEMBRETE
      : PRIVADO_ATIVIDADE;
  }

  return full(input.kind, input.facts, input.seed);
}
