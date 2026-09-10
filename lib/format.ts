const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError("formatBRL espera um número finito");
  }
  return BRL.format(value);
}
