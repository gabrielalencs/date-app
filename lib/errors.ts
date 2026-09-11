/**
 * Erros de domínio da seção 4 do docs/DATA_ACCESS.md.
 *
 * Entidade de outro workspace responde "não encontrado", nunca "proibido"
 * (D-038): distinguir os dois confirmaria que o id existe, que é informação
 * que quem procura não tinha. Mesma lógica da mensagem única de login.
 */
export class NotFoundError extends Error {
  constructor(what = "Registro") {
    super(`${what} não encontrado.`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  readonly fieldErrors: Readonly<Record<string, string>>;

  constructor(
    message = "Dados inválidos.",
    fieldErrors: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}
