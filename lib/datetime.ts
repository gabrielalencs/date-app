/**
 * O único módulo do projeto autorizado a formatar ou interpretar data e hora
 * (seção 2 do docs/DATES_AND_VOTING.md, D-059).
 *
 * Fora daqui o ESLint proíbe `toLocaleDateString`, `toLocaleTimeString`,
 * `toLocaleString`, `Intl.DateTimeFormat` e os leitores locais de `Date`. É a
 * mesma zona que fechou o banco no D-037, pelo mesmo motivo: formatar sem
 * declarar o fuso funciona na máquina de quem escreve — que está em São Paulo —
 * e quebra na Vercel, que roda em UTC. O sintoma é um "sábado, 14 de junho"
 * virando "sexta, 13 de junho", e nenhum teste local acusa.
 *
 * Nada aqui lê o fuso do processo nem o do navegador. `APP_TIMEZONE` vai
 * declarado em toda chamada.
 *
 * Nenhum offset fixo. O Brasil não tem horário de verão desde 2019, então
 * `America/Sao_Paulo` está estável em UTC−3 hoje — o que não autoriza escrever
 * −3 em lugar nenhum. A regra já mudou várias vezes por lei.
 */
export const APP_TIMEZONE = "America/Sao_Paulo";
export const APP_LOCALE = "pt-BR";

/** Campos de calendário de um instante, no fuso do app. */
export type CivilDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type CivilDate = Pick<CivilDateTime, "year" | "month" | "day">;

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function parts(instant: Date): Record<string, number> {
  const out: Record<string, number> = {};

  for (const { type, value } of PARTS.formatToParts(instant)) {
    if (type !== "literal") {
      // `hour` volta como "24" à meia-noite em hour12:false; normaliza.
      out[type] = type === "hour" && value === "24" ? 0 : Number(value);
    }
  }

  return out;
}

/** Campos de calendário do instante, vistos de São Paulo. */
export function toCivil(instant: Date): CivilDateTime {
  const p = parts(instant);
  return {
    year: p.year!,
    month: p.month!,
    day: p.day!,
    hour: p.hour!,
    minute: p.minute!,
  };
}

/** Deslocamento do fuso do app naquele instante, em milissegundos. */
function offsetAt(instant: Date): number {
  const p = parts(instant);
  const comoSeFosseUtc = Date.UTC(
    p.year!,
    p.month! - 1,
    p.day!,
    p.hour!,
    p.minute!,
    p.second!,
  );
  return comoSeFosseUtc - instant.getTime();
}

/**
 * Hora de parede em São Paulo → instante UTC.
 *
 * Duas passadas: a primeira estima o deslocamento, a segunda o corrige para o
 * instante certo. É o que qualquer biblioteca de fuso faz por baixo, e é o que
 * mantém a conversão correta se a regra de horário de verão voltar.
 */
export function fromCivil(civil: CivilDateTime): Date {
  const comoUtc = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
  );

  const primeira = new Date(comoUtc - offsetAt(new Date(comoUtc)));
  return new Date(comoUtc - offsetAt(primeira));
}

/**
 * Meia-noite do dia civil, em São Paulo, como instante UTC. É assim que uma
 * opção de dia inteiro é guardada (D-061).
 */
export function startOfDayInApp(civil: CivilDate): Date {
  return fromCivil({ ...civil, hour: 0, minute: 0 });
}

/** Dia civil do instante, no fuso do app. */
export function civilDateOf(instant: Date): CivilDate {
  const { year, month, day } = toCivil(instant);
  return { year, month, day };
}

export function isSameCivilDay(a: Date, b: Date): boolean {
  const x = civilDateOf(a);
  const y = civilDateOf(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

/**
 * Diferença em dias de calendário, no fuso do app. Negativo é passado.
 *
 * Conta dias civis, não períodos de 24 horas: de sábado 23h para domingo 1h é
 * 1 dia, e subtrair milissegundos daria 0. É a diferença entre "amanhã" e
 * "daqui a 2 horas" (D-061).
 */
export function civilDaysBetween(from: Date, to: Date): number {
  const a = civilDateOf(from);
  const b = civilDateOf(to);

  const diaA = Date.UTC(a.year, a.month - 1, a.day);
  const diaB = Date.UTC(b.year, b.month - 1, b.day);

  return Math.round((diaB - diaA) / 86_400_000);
}

/** `true` quando o instante cai num dia civil posterior ao de referência. */
export function isFutureCivilDay(instant: Date, now: Date): boolean {
  return civilDaysBetween(now, instant) > 0;
}

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    ...options,
  });
}

const DIA_SEMANA = formatter({ weekday: "long" });
const DIA_E_MES = formatter({ day: "numeric", month: "long" });
const DIA_MES_ANO = formatter({
  day: "numeric",
  month: "long",
  year: "numeric",
});
const HORA = formatter({ hour: "2-digit", minute: "2-digit", hour12: false });
const CURTA = formatter({ day: "2-digit", month: "2-digit" });

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "Sábado" — o que mais importa para decidir uma data. */
export function formatWeekday(instant: Date): string {
  return capitalizar(DIA_SEMANA.format(instant));
}

/** "14 de junho", ou "14 de junho de 2027" quando o ano não é o de agora. */
export function formatDay(instant: Date, now: Date = new Date()): string {
  const mesmoAno = civilDateOf(instant).year === civilDateOf(now).year;
  return mesmoAno ? DIA_E_MES.format(instant) : DIA_MES_ANO.format(instant);
}

/** "20:30". Sempre 24 horas: o produto é em português e não usa AM/PM. */
export function formatTime(instant: Date): string {
  return HORA.format(instant);
}

/** "14/06", para onde o espaço é curto. */
export function formatShortDate(instant: Date): string {
  return CURTA.format(instant);
}

/** "Sábado, 14 de junho, 20:30" — ou sem a hora, quando é dia inteiro. */
export function formatDateTime(
  instant: Date,
  options: { allDay?: boolean; now?: Date } = {},
): string {
  const base = `${formatWeekday(instant)}, ${formatDay(instant, options.now)}`;
  return options.allDay ? base : `${base}, ${formatTime(instant)}`;
}

/**
 * Distância em dias, escrita para gente: "hoje", "amanhã", "em 3 dias",
 * "há 2 dias". Calculada no servidor e renderizada como texto estático — um
 * contador no cliente divergiria do servidor e produziria erro de hidratação
 * (seção 9 do docs/DATES_AND_VOTING.md).
 */
export function formatRelativeDay(
  instant: Date,
  now: Date = new Date(),
): string {
  const dias = civilDaysBetween(now, instant);

  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias === -1) return "ontem";
  if (dias > 1) return `em ${dias} dias`;
  return `há ${Math.abs(dias)} dias`;
}

/**
 * Distância de um evento passado em horas, calculada no servidor.
 *
 * O feed recebe `now` da página para todas as linhas compartilharem o mesmo
 * relógio e para a hidratação nunca depender da hora do aparelho.
 */
export function formatRelativeHours(
  instant: Date,
  now: Date = new Date(),
): string {
  const elapsedMs = Math.max(0, now.getTime() - instant.getTime());
  const hours = Math.floor(elapsedMs / 3_600_000);

  if (hours === 0) return "há menos de 1 hora";
  if (hours === 1) return "há 1 hora";
  return `há ${hours} horas`;
}

/** `yyyy-MM-dd` de uma tripla civil já convertida. */
export function civilDayKey(civil: CivilDate): string {
  const mes = String(civil.month).padStart(2, "0");
  const dia = String(civil.day).padStart(2, "0");
  return `${civil.year}-${mes}-${dia}`;
}

/**
 * A chave do dia: `yyyy-MM-dd` daquele instante no fuso do app.
 *
 * **É a única forma autorizada de agrupar qualquer coisa por dia** (D-073).
 *
 * Tem o mesmo corpo de `toDateInputValue` e existe assim mesmo, porque o nome
 * é o ponto: ninguém agrupa um calendário com uma função chamada "valor de
 * input de formulário", e o nome errado é exatamente como
 * `toISOString().slice(0, 10)` volta pela porta dos fundos. Aquilo é o dia em
 * UTC, que às 21h de São Paulo já é o dia seguinte — e como nenhuma data do
 * seed cruza a meia-noite UTC, a suíte inteira passaria.
 */
export function dayKey(instant: Date): string {
  return civilDayKey(civilDateOf(instant));
}

/**
 * `yyyy-MM-dd` no fuso do app, para preencher `<input type="date">`.
 * Nunca `toISOString().slice(0, 10)`: aquilo é o dia em UTC, que às 21h de
 * São Paulo já é o dia seguinte.
 */
export function toDateInputValue(instant: Date): string {
  return dayKey(instant);
}

/** `HH:mm` no fuso do app, para preencher `<input type="time">`. */
export function toTimeInputValue(instant: Date): string {
  const { hour, minute } = toCivil(instant);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export class InvalidDateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDateInputError";
  }
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORARIO = /^(\d{2}):(\d{2})$/;

/**
 * `yyyy-MM-dd` + `HH:mm` opcional, vindos do formulário, → instante UTC.
 *
 * Sem horário, devolve a meia-noite daquele dia em São Paulo, que é como
 * `all_day` é guardado. Nunca `new Date("2026-06-14")`, que o motor interpreta
 * como meia-noite **UTC** e desloca o dia.
 */
export function parseDateInput(date: string, time?: string | null): Date {
  const d = DATA.exec(date.trim());
  if (!d) {
    throw new InvalidDateInputError("Escolha um dia válido.");
  }

  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new InvalidDateInputError("Escolha um dia válido.");
  }

  let hour = 0;
  let minute = 0;

  const bruto = time?.trim();
  if (bruto) {
    const t = HORARIO.exec(bruto);
    if (!t) {
      throw new InvalidDateInputError("Escolha um horário válido.");
    }
    hour = Number(t[1]);
    minute = Number(t[2]);
    if (hour > 23 || minute > 59) {
      throw new InvalidDateInputError("Escolha um horário válido.");
    }
  }

  const instante = fromCivil({ year, month, day, hour, minute });

  // 31 de fevereiro vira 3 de março em silêncio; a volta ao civil denuncia.
  const volta = toCivil(instante);
  if (volta.year !== year || volta.month !== month || volta.day !== day) {
    throw new InvalidDateInputError("Esse dia não existe no calendário.");
  }

  return instante;
}

/* ------------------------------------------------------------------------ *
 * Calendário (B7)
 *
 * Tudo aqui opera sobre tripla civil, nunca sobre instante. A distinção é a
 * regra do D-074, e os dois usos de `Date.UTC` parecem iguais e não são:
 *
 *   sobre INSTANTE, para descobrir que dia é      → proibido
 *   sobre TRIPLA CIVIL já convertida, para somar
 *   dias ou achar o dia da semana                 → calculadora, sancionado
 *
 * A entrada em dia civil vem de `civilDateOf`/`dayKey`, que passam pelo
 * `Intl` com `America/Sao_Paulo` declarado. Depois disso o UTC vira só um
 * eixo numérico sem fuso, que é exatamente o que se quer de um calendário.
 * ------------------------------------------------------------------------ */

/** Um mês civil, sem dia. É o que mora na URL como `yyyy-MM`. */
export type CivilMonth = {
  year: number;
  month: number;
};

const DIA_EM_MS = 86_400_000;

/** O eixo numérico de dias. Só recebe tripla civil. */
function indiceDoDia(civil: CivilDate): number {
  return Date.UTC(civil.year, civil.month - 1, civil.day);
}

/**
 * 0 = segunda, 6 = domingo (D-072).
 *
 * `getDay()` cru devolve 0 = domingo e produz um erro de um dia que ninguém vê
 * até o mês começar num domingo — e fevereiro de 2026 começa num domingo.
 */
export function weekdayIndex(civil: CivilDate): number {
  const domingoZero = new Date(indiceDoDia(civil)).getUTCDay();
  return (domingoZero + 6) % 7;
}

/** Soma dias de calendário. Negativo anda para trás. */
export function addCivilDays(civil: CivilDate, days: number): CivilDate {
  const alvo = new Date(indiceDoDia(civil) + days * DIA_EM_MS);
  return {
    year: alvo.getUTCFullYear(),
    month: alvo.getUTCMonth() + 1,
    day: alvo.getUTCDate(),
  };
}

/** Primeiro dia do mês, como tripla civil. */
export function startOfMonth(month: CivilMonth): CivilDate {
  return { year: month.year, month: month.month, day: 1 };
}

/** Anda meses. `Date.UTC` normaliza dezembro + 1 para janeiro do ano seguinte. */
export function addMonths(month: CivilMonth, delta: number): CivilMonth {
  const alvo = new Date(Date.UTC(month.year, month.month - 1 + delta, 1));
  return { year: alvo.getUTCFullYear(), month: alvo.getUTCMonth() + 1 };
}

/** O mês civil de um instante, no fuso do app. */
export function monthOf(instant: Date): CivilMonth {
  const { year, month } = civilDateOf(instant);
  return { year, month };
}

export function isSameCivilMonth(a: CivilMonth, b: CivilMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** `true` quando a tripla cai dentro daquele mês. */
export function isInMonth(civil: CivilDate, month: CivilMonth): boolean {
  return civil.year === month.year && civil.month === month.month;
}

/** Quantas células a grade tem, sempre (D-076). */
export const MONTH_GRID_CELLS = 42;

/**
 * As 42 triplas civis da grade do mês, da segunda-feira da semana do dia 1 em
 * diante.
 *
 * Seis linhas sempre, independentemente do mês (D-076). Um mês de 28 dias
 * começando numa segunda caberia em 4 linhas, mas grade de altura variável faz
 * o botão de "mês seguinte" escorregar sob o dedo entre um toque e o outro — e
 * navegar é o gesto principal desta tela.
 */
export function monthGrid(month: CivilMonth): CivilDate[] {
  const primeiro = startOfMonth(month);
  const inicio = addCivilDays(primeiro, -weekdayIndex(primeiro));

  return Array.from({ length: MONTH_GRID_CELLS }, (_, i) =>
    addCivilDays(inicio, i),
  );
}

/** `yyyy-MM`, como o mês viaja na URL. */
export function toMonthParam(month: CivilMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

const MES_PARAM = /^(\d{4})-(\d{2})$/;

/**
 * `yyyy-MM` → mês civil, ou `null`.
 *
 * Nunca passa por `new Date()`: `new Date("2026-09")` é meia-noite **UTC**, que
 * em São Paulo ainda é 31 de agosto. O par é lido como dois números e pronto.
 *
 * Devolve `null` em vez de lançar porque quem chama é uma URL, e URL ruim cai
 * no mês corrente sem erro (D-078).
 */
export function parseMonthParam(
  raw: string | null | undefined,
): CivilMonth | null {
  const m = MES_PARAM.exec(raw?.trim() ?? "");
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);

  if (month < 1 || month > 12) return null;
  if (year < 1970 || year > 9999) return null;

  return { year, month };
}

/**
 * `yyyy-MM-dd` → dia civil, ou `null`. Mesma razão de não lançar.
 *
 * Rejeita dia que não existe — 31 de fevereiro — comparando a volta, do mesmo
 * jeito que `parseDateInput` faz.
 */
export function parseDayParam(
  raw: string | null | undefined,
): CivilDate | null {
  const m = DATA.exec(raw?.trim() ?? "");
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1970 || year > 9999) return null;

  const civil = { year, month, day };
  const volta = new Date(indiceDoDia(civil));

  if (
    volta.getUTCFullYear() !== year ||
    volta.getUTCMonth() + 1 !== month ||
    volta.getUTCDate() !== day
  ) {
    return null;
  }

  return civil;
}

/**
 * Cabeçalhos da grade, na ordem do `weekdayIndex` (D-072).
 *
 * Ficam aqui, e não na interface, porque a ordem é consequência da convenção
 * de índice: separar as duas coisas é como se acerta o índice e se esquece o
 * cabeçalho. `long` vai no `<abbr title>` da seção 10.
 */
export const WEEKDAY_HEADERS: readonly { short: string; long: string }[] = [
  { short: "Seg", long: "Segunda-feira" },
  { short: "Ter", long: "Terça-feira" },
  { short: "Qua", long: "Quarta-feira" },
  { short: "Qui", long: "Quinta-feira" },
  { short: "Sex", long: "Sexta-feira" },
  { short: "Sáb", long: "Sábado" },
  { short: "Dom", long: "Domingo" },
];

const MES_LONGO = formatter({ month: "long" });

/** "Setembro de 2026", para o título editorial do mês. */
export function formatMonthTitle(month: CivilMonth): string {
  const referencia = startOfDayInApp(startOfMonth(month));
  return `${capitalizar(MES_LONGO.format(referencia))} de ${month.year}`;
}

/** "14 de setembro", a partir de uma tripla civil. */
export function formatCivilDay(civil: CivilDate): string {
  return DIA_E_MES.format(startOfDayInApp(civil));
}
