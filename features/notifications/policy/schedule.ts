import {
  addCivilDays,
  civilDateOf,
  fromCivil,
  toCivil,
  type CivilDate,
} from "@/lib/datetime";

import type { NotificationKind } from "@/features/notifications/kinds";

/**
 * Quando a notificação pode sair (seções 8, 10 e 11 do docs/NOTIFICATIONS.md).
 *
 * Funções puras: recebem `now` e devolvem instante. Nada aqui lê o relógio do
 * processo nem o fuso do sistema — toda aritmética de dia civil passa por
 * `lib/datetime.ts`, que é o dono único das regras de data (D-073). É o que
 * permite a suíte inteira rodar em UTC, em Nova York e no fuso local com o
 * mesmo resultado.
 */

/** Hora em que o DATE fala com as pessoas. */
export const QUIET_END_HOUR = 9;

/** A partir daqui ninguém recebe push não urgente. */
export const QUIET_START_HOUR = 22;

/**
 * O atraso de cada kind, em minutos.
 *
 * `date_confirmed` não está aqui: ele não é um atraso, é um horário — 09:00 do
 * próximo dia civil. Confirmar uma data às 23h e receber "está planejado para
 * sábado" às 23h05 seria notificar o clique; o produto notifica o estado
 * depois de ele ter tido a noite inteira para ser desfeito.
 */
export const DELAY_MINUTES = {
  plan_created: 15,
  want_a_lot: 5,
  date_suggested: 20,
  vote_cast: 15,
  booking_updated: 60,
  plan_cancelled: 60,
  plan_archived: 60,
  plan_completed: 30,
  memory_added: 15,
} as const satisfies Partial<Record<NotificationKind, number>>;

export type DelayedKind = keyof typeof DELAY_MINUTES;

export function isDelayedKind(kind: NotificationKind): kind is DelayedKind {
  return kind in DELAY_MINUTES;
}

/** 09:00 do dia civil informado, como instante. */
export function morningOf(civil: CivilDate): Date {
  return fromCivil({ ...civil, hour: QUIET_END_HOUR, minute: 0 });
}

/**
 * A janela silenciosa: nada entre 22:00 e 08:59.
 *
 * Um push às 03:00 não é urgente em produto nenhum, e neste menos ainda — não
 * existe nada aqui que não possa esperar o café. Quem cai depois das 22h vai
 * para as 09:00 do dia seguinte; quem cai de madrugada vai para as 09:00 do
 * mesmo dia.
 */
export function applyQuietHours(instant: Date): Date {
  const civil = toCivil(instant);

  if (civil.hour >= QUIET_START_HOUR) {
    return morningOf(addCivilDays(civil, 1));
  }

  if (civil.hour < QUIET_END_HOUR) {
    return morningOf(civil);
  }

  return instant;
}

/** 09:00 do **próximo** dia civil, no fuso do app. */
export function nextMorning(now: Date): Date {
  return morningOf(addCivilDays(civilDateOf(now), 1));
}

/**
 * O instante em que a intent vence.
 *
 * `date_confirmed` e `date_reminder` têm horário próprio e não passam pelo
 * atraso em minutos; os dois já nascem às 09:00 e por isso a janela silenciosa
 * não muda nada neles — mas ela é aplicada assim mesmo, porque a regra é da
 * política e não do chamador.
 */
export function dueAtFor(kind: NotificationKind, now: Date): Date {
  if (kind === "date_confirmed") {
    return applyQuietHours(nextMorning(now));
  }

  if (kind === "date_reminder") {
    throw new Error(
      "date_reminder tem horário próprio: use reminderSchedule(startsAt, now).",
    );
  }

  if (!isDelayedKind(kind)) {
    throw new Error(`Kind sem atraso definido: ${kind}`);
  }

  const bruto = new Date(now.getTime() + DELAY_MINUTES[kind] * 60_000);
  return applyQuietHours(bruto);
}

/** Os offsets de lembrete, em dias. Sem lembrete no mesmo dia na V1. */
export const REMINDER_OFFSET_DAYS = [7, 5, 3, 1] as const;

export type ReminderOffset = (typeof REMINDER_OFFSET_DAYS)[number];

export type ReminderSlot = {
  offsetDays: ReminderOffset;
  dueAt: Date;
};

/**
 * Os lembretes que ainda cabem para uma data confirmada.
 *
 * "Daqui a 7 dias" é contado em **dias civis**, não em 168 horas: um date no
 * sábado às 20h tem o lembrete de 1 dia na sexta às 09:00, e não na sexta às
 * 20h. É essa diferença que faz a mensagem "é amanhã" ser verdade quando a
 * pessoa lê.
 *
 * Só devolve os que ainda estão no futuro: confirmar hoje um date de depois de
 * amanhã não pode agendar o lembrete de 7 dias no passado.
 */
export function reminderSchedule(startsAt: Date, now: Date): ReminderSlot[] {
  const diaDoDate = civilDateOf(startsAt);

  return REMINDER_OFFSET_DAYS.map((offsetDays) => ({
    offsetDays,
    dueAt: morningOf(addCivilDays(diaDoDate, -offsetDays)),
  })).filter((slot) => slot.dueAt.getTime() > now.getTime());
}
