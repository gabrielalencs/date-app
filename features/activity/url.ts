const POSITIVE_INTEGER = /^[1-9]\d*$/;

/** URL hostil cai na primeira página; nunca vira exceção ou número parcial. */
export function parseActivityPage(raw: string | undefined): number {
  if (!raw || !POSITIVE_INTEGER.test(raw)) return 1;

  const page = Number(raw);
  return Number.isSafeInteger(page) ? page : 1;
}
