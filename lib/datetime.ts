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
 * `yyyy-MM-dd` no fuso do app, para preencher `<input type="date">`.
 * Nunca `toISOString().slice(0, 10)`: aquilo é o dia em UTC, que às 21h de
 * São Paulo já é o dia seguinte.
 */
export function toDateInputValue(instant: Date): string {
  const { year, month, day } = civilDateOf(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
