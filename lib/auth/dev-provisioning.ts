/**
 * Lógica pura do provisionamento de development (D-042). Sem rede, sem env,
 * sem banco — para a parte que erra silencioso ser testável.
 */
export const SIGN_UP_PATH = "sign-up/email";
export const MIN_PASSWORD_LENGTH = 8;

export type DevCredential = { email: string; password: string };

/**
 * Réplica da composição do SDK em `dist/server-b0OzGjXl.mjs:920`:
 *
 *   new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
 *
 * A barra final é o detalhe que importa. A base termina em `/auth`, e
 * `new URL("sign-up/email", "https://host/auth")` sem a barra resolveria para
 * `https://host/sign-up/email`, descartando o segmento e batendo fora do
 * serviço. O caminho veio de `API_ENDPOINTS` no pacote instalado.
 */
export function signUpUrl(baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(SIGN_UP_PATH, base).toString();
}

/**
 * Formato: email:senha,email:senha. A senha não pode conter vírgula.
 *
 * O nome da variável entra por parâmetro porque o provisionamento de produção
 * (B12) usa a mesma gramática numa variável própria, e mensagem de erro que
 * cita a variável errada manda a pessoa editar o arquivo errado.
 */
export function parseDevCredentials(
  raw: string | undefined,
  variavel = "DATE_DEV_USER_CREDENTIALS",
): readonly DevCredential[] {
  if (!raw?.trim()) {
    throw new Error(
      `${variavel} não está definida. Formato: email1:senha1,email2:senha2`,
    );
  }

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length !== 2) {
    throw new Error(
      `Esperava exatamente dois pares email:senha, encontrei ${entries.length}. ` +
        "Se alguma senha tem vírgula, troque a senha — a vírgula é o separador.",
    );
  }

  return entries.map((entry) => {
    const separator = entry.indexOf(":");
    if (separator === -1) {
      throw new Error("Cada entrada precisa ser email:senha.");
    }

    const email = entry.slice(0, separator).trim().toLowerCase();
    const password = entry.slice(separator + 1);

    if (email.length === 0) {
      throw new Error("Entrada sem e-mail antes dos dois pontos.");
    }

    // Diz o mínimo exigido, nunca a senha nem o tamanho informado.
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `A senha de ${email} tem menos de ${MIN_PASSWORD_LENGTH} caracteres.`,
      );
    }

    return { email, password };
  });
}

/** Os e-mails informados têm de ser exatamente os da allowlist. */
export function credentialsMatchAllowlist(
  credentials: readonly DevCredential[],
  allowedEmails: readonly string[],
): boolean {
  const informed = credentials.map((credential) => credential.email).sort();
  const expected = [...allowedEmails]
    .map((email) => email.toLowerCase())
    .sort();

  return informed.join("|") === expected.join("|");
}
