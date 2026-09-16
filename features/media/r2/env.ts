/**
 * Guarda de ambiente do R2, espelhando a do banco em `db/env.ts`
 * (seção 8 do docs/MEDIA_R2.md).
 *
 * Regra: se a branch do Neon é `development`, o bucket tem que ser
 * `date-media-dev`. Qualquer outro valor aborta antes de o primeiro byte sair.
 *
 * Imprime bucket e endpoint. Nunca imprime credencial, nem mascarada — chave
 * mascarada em log é chave em log com passos a mais.
 *
 * Sem imports de propósito: este módulo roda tanto dentro do Next quanto por
 * `node --experimental-strip-types` no script de conferência, e alias `@/` não
 * existe fora do bundler.
 */
export const DEV_BUCKET = "date-media-dev";
export const PROD_BUCKET = "date-media-prod";
export const DEV_BRANCH = "development";

export type R2Config = {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly endpoint: string;
};

/** O subconjunto que pode ser impresso. */
export type R2Target = {
  readonly bucket: string;
  readonly endpoint: string;
  readonly branch: string;
};

const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_ENDPOINT",
] as const;

export type R2EnvName = (typeof REQUIRED)[number];

export type EnvSource = Readonly<Partial<Record<string, string | undefined>>>;

export class R2ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2ConfigError";
  }
}

/** Lê as cinco variáveis. Erro lista nomes que faltam, nunca valores. */
export function readR2Config(env: EnvSource): R2Config {
  const faltando = REQUIRED.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim() === "";
  });

  if (faltando.length > 0) {
    throw new R2ConfigError(
      `Faltam variáveis do R2 no ambiente: ${faltando.join(", ")}.\n` +
        "Copie .env.example para .env.local e preencha com o token limitado ao " +
        `bucket ${DEV_BUCKET}.`,
    );
  }

  return {
    accountId: env.R2_ACCOUNT_ID!.trim(),
    accessKeyId: env.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!.trim(),
    bucket: env.R2_BUCKET!.trim(),
    endpoint: env.R2_ENDPOINT!.trim(),
  };
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    throw new R2ConfigError(
      `R2_ENDPOINT não é uma URL válida. Esperado algo como ` +
        `https://<account-id>.r2.cloudflarestorage.com`,
    );
  }
}

/**
 * A guarda. Aborta quando a branch de desenvolvimento está apontada para um
 * bucket que não é o de desenvolvimento — inclusive, e principalmente, quando
 * está apontada para o de produção.
 */
export function assertBucketMatchesBranch(
  config: R2Config,
  branch: string | undefined,
): R2Target {
  const host = hostOf(config.endpoint);

  if (!host.includes(config.accountId)) {
    throw new R2ConfigError(
      `ABORTADO: R2_ENDPOINT (${host}) não pertence à conta de R2_ACCOUNT_ID.\n` +
        "Uma das duas variáveis está de outra conta. Confira as duas no " +
        "painel do Cloudflare antes de continuar.",
    );
  }

  if (branch === DEV_BRANCH && config.bucket !== DEV_BUCKET) {
    throw new R2ConfigError(
      `\nABORTADO: NEON_BRANCH é "${branch}" e R2_BUCKET é "${config.bucket}".\n\n` +
        `Em desenvolvimento o único bucket permitido é "${DEV_BUCKET}".\n` +
        (config.bucket === PROD_BUCKET
          ? `"${PROD_BUCKET}" guarda as fotos reais do casal e não é tocado por este bloco.\n`
          : "") +
        `\nO que fazer:\n` +
        `  1. Abra .env.local\n` +
        `  2. Deixe R2_BUCKET=${DEV_BUCKET}\n` +
        `  3. Confirme que o token de acesso é o limitado a esse bucket\n`,
    );
  }

  return {
    bucket: config.bucket,
    endpoint: host,
    branch: branch ?? "(não definida)",
  };
}

/** Lê, valida e devolve o que pode ser impresso junto. */
export function resolveR2(env: EnvSource): {
  config: R2Config;
  target: R2Target;
} {
  const config = readR2Config(env);
  const target = assertBucketMatchesBranch(config, env.NEON_BRANCH);
  return { config, target };
}

export function describeTarget(target: R2Target): string {
  return [
    `Neon branch : ${target.branch}`,
    `R2 bucket   : ${target.bucket}`,
    `R2 endpoint : ${target.endpoint}`,
  ].join("\n");
}
