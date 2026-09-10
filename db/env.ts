/**
 * Guarda de ambiente para migration e seed. Nunca imprime credencial:
 * só o host do endpoint e o nome da branch.
 */
const REQUIRED_BRANCH = "development";

export type DbTarget = {
  url: string;
  host: string;
  branch: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "host ilegível";
  }
}

/** Connection string direta, usada por migration e seed. */
export function unpooledUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "DATABASE_URL_UNPOOLED não está definida.\n" +
        "Copie .env.example para .env.local e preencha com a connection string " +
        "direta (unpooled) da branch development do Neon.",
    );
  }
  return url;
}

/**
 * Aborta se a branch ativa não for exatamente `development`. Chamado antes de
 * qualquer escrita — migration ou seed.
 */
export function requireDevelopmentBranch(): DbTarget {
  const branch = process.env.NEON_BRANCH;
  const url = unpooledUrl();
  const host = hostOf(url);

  console.log(`Neon branch : ${branch ?? "(não definida)"}`);
  console.log(`Neon host   : ${host}`);

  if (branch !== REQUIRED_BRANCH) {
    throw new Error(
      `\nABORTADO: NEON_BRANCH é "${branch ?? "(não definida)"}", e só "${REQUIRED_BRANCH}" pode receber migration ou seed.\n\n` +
        `O que fazer:\n` +
        `  1. Abra .env.local\n` +
        `  2. Garanta NEON_BRANCH=${REQUIRED_BRANCH}\n` +
        `  3. Garanta que DATABASE_URL_UNPOOLED aponta para o endpoint da branch ${REQUIRED_BRANCH}\n\n` +
        `Nunca aponte estes comandos para production.`,
    );
  }

  return { url, host, branch };
}
