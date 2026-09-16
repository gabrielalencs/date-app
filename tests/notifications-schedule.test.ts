import { describe, expect, it } from "vitest";

import {
  applyQuietHours,
  DELAY_MINUTES,
  dueAtFor,
  nextMorning,
  REMINDER_OFFSET_DAYS,
  reminderSchedule,
} from "@/features/notifications/policy/schedule";
import { fromCivil, toCivil } from "@/lib/datetime";

/**
 * O agendamento (seções 8, 10 e 11 do docs/NOTIFICATIONS.md).
 *
 * Este arquivo entra em `pnpm test:tz` e roda em UTC, Nova York e no fuso local.
 * É a suíte que prova que "09:00" quer dizer 09:00 em São Paulo em qualquer
 * máquina — o defeito de fuso é justamente o que não aparece no fuso de quem
 * escreve o código.
 */

/** Instante a partir do dia civil de São Paulo, sem passar pelo relógio local. */
function saoPaulo(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  return fromCivil({ year, month, day, hour, minute });
}

function horaCivil(instant: Date): { dia: number; hora: number; minuto: number } {
  const civil = toCivil(instant);
  return { dia: civil.day, hora: civil.hour, minuto: civil.minute };
}

describe("atraso por kind", () => {
  it("cada kind atrasa o que a matriz manda", () => {
    expect(DELAY_MINUTES.plan_created).toBe(15);
    expect(DELAY_MINUTES.want_a_lot).toBe(5);
    expect(DELAY_MINUTES.date_suggested).toBe(20);
    expect(DELAY_MINUTES.vote_cast).toBe(15);
    expect(DELAY_MINUTES.booking_updated).toBe(60);
    expect(DELAY_MINUTES.plan_cancelled).toBe(60);
    expect(DELAY_MINUTES.plan_archived).toBe(60);
    expect(DELAY_MINUTES.plan_completed).toBe(30);
    expect(DELAY_MINUTES.memory_added).toBe(15);
  });

  it("soma o atraso ao instante da ação, dentro do horário comercial", () => {
    const agora = saoPaulo(2026, 10, 3, 14, 0);
    expect(horaCivil(dueAtFor("plan_created", agora))).toEqual({
      dia: 3,
      hora: 14,
      minuto: 15,
    });
    expect(horaCivil(dueAtFor("booking_updated", agora))).toEqual({
      dia: 3,
      hora: 15,
      minuto: 0,
    });
  });
});

describe("janela silenciosa", () => {
  it("o que cai depois das 22h vai para as 09:00 do dia seguinte", () => {
    const tarde = saoPaulo(2026, 10, 3, 23, 30);
    expect(horaCivil(applyQuietHours(tarde))).toEqual({
      dia: 4,
      hora: 9,
      minuto: 0,
    });
  });

  it("o que cai de madrugada vai para as 09:00 do mesmo dia", () => {
    const madrugada = saoPaulo(2026, 10, 3, 3, 15);
    expect(horaCivil(applyQuietHours(madrugada))).toEqual({
      dia: 3,
      hora: 9,
      minuto: 0,
    });
  });

  it("08:59 ainda é madrugada e 09:00 já não é", () => {
    expect(horaCivil(applyQuietHours(saoPaulo(2026, 10, 3, 8, 59)))).toEqual({
      dia: 3,
      hora: 9,
      minuto: 0,
    });
    const nove = saoPaulo(2026, 10, 3, 9, 0);
    expect(applyQuietHours(nove).getTime()).toBe(nove.getTime());
  });

  it("uma ação às 21:50 com atraso de 60 min atravessa a janela e espera", () => {
    /* O caso que só aparece somando: 21:50 + 60 min = 22:50, que é silêncio. */
    const due = dueAtFor("booking_updated", saoPaulo(2026, 10, 3, 21, 50));
    expect(horaCivil(due)).toEqual({ dia: 4, hora: 9, minuto: 0 });
  });
});

describe("data confirmada às 09:00 do próximo dia civil", () => {
  it("confirmar às 23:59 notifica na manhã seguinte, não em dois dias", () => {
    const due = dueAtFor("date_confirmed", saoPaulo(2026, 10, 3, 23, 59));
    expect(horaCivil(due)).toEqual({ dia: 4, hora: 9, minuto: 0 });
  });

  it("confirmar às 00:01 também espera a manhã seguinte", () => {
    /* É a decisão de produto: notifica o estado estável, não o clique. Quem
       confirmou à meia-noite e desfez às 08h não gera push nenhum. */
    const due = dueAtFor("date_confirmed", saoPaulo(2026, 10, 3, 0, 1));
    expect(horaCivil(due)).toEqual({ dia: 4, hora: 9, minuto: 0 });
  });

  it("vira o mês e o ano sem aritmética de 24 horas", () => {
    const due = nextMorning(saoPaulo(2026, 12, 31, 20, 0));
    const civil = toCivil(due);
    expect([civil.year, civil.month, civil.day, civil.hour]).toEqual([
      2027, 1, 1, 9,
    ]);
  });
});

describe("lembretes 7/5/3/1", () => {
  it("os quatro offsets caem às 09:00 dos dias civis certos", () => {
    const date = saoPaulo(2026, 10, 20, 20, 0);
    const agora = saoPaulo(2026, 10, 1, 10, 0);

    const slots = reminderSchedule(date, agora);
    expect(slots.map((s) => s.offsetDays)).toEqual([...REMINDER_OFFSET_DAYS]);
    expect(slots.map((s) => horaCivil(s.dueAt))).toEqual([
      { dia: 13, hora: 9, minuto: 0 },
      { dia: 15, hora: 9, minuto: 0 },
      { dia: 17, hora: 9, minuto: 0 },
      { dia: 19, hora: 9, minuto: 0 },
    ]);
  });

  it("o lembrete de 1 dia é a manhã da véspera, não 24 horas antes", () => {
    /* Um date sábado às 20h tem "é amanhã" na sexta às 09:00. Contar 24 horas
       daria sexta às 20h, e a frase seria lida quando já não serve. */
    const date = saoPaulo(2026, 10, 20, 20, 0);
    const [um] = reminderSchedule(date, saoPaulo(2026, 10, 18, 8, 0)).slice(-1);
    expect(horaCivil(um!.dueAt)).toEqual({ dia: 19, hora: 9, minuto: 0 });
  });

  it("só cria offsets ainda futuros", () => {
    const date = saoPaulo(2026, 10, 20, 20, 0);
    /* Confirmando no dia 16, os lembretes de 7 e 5 dias já passaram. */
    const slots = reminderSchedule(date, saoPaulo(2026, 10, 16, 12, 0));
    expect(slots.map((s) => s.offsetDays)).toEqual([3, 1]);
  });

  it("um date para daqui a poucas horas não agenda lembrete nenhum", () => {
    const date = saoPaulo(2026, 10, 20, 20, 0);
    expect(reminderSchedule(date, saoPaulo(2026, 10, 20, 12, 0))).toEqual([]);
  });

  it("atravessa a virada do mês contando dias civis", () => {
    const date = saoPaulo(2026, 11, 3, 19, 30);
    const slots = reminderSchedule(date, saoPaulo(2026, 10, 20, 9, 0));
    expect(
      slots.map((s) => {
        const civil = toCivil(s.dueAt);
        return `${civil.month}-${civil.day} ${civil.hour}h`;
      }),
    ).toEqual(["10-27 9h", "10-29 9h", "10-31 9h", "11-2 9h"]);
  });
});
