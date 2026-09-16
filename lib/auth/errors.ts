export class UnauthenticatedError extends Error {
  constructor() {
    super("Sessão autenticada obrigatória.");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("A sessão não possui acesso a este workspace.");
    this.name = "ForbiddenError";
  }
}
