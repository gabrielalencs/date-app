/**
 * Guarda de ambiente do R2, espelhando a do banco em `db/env.ts`
 * (seção 8 do docs/MEDIA_R2.md).
 *
 * Regra, nos dois sentidos desde o B12: branch `development` exige bucket
 * `date-media-dev`, e branch `production` exige `date-media-prod`. Qualquer
 * outro par aborta antes de o primeiro byte sair.
 *
 * O sentido novo protege contra o erro mais provável do deploy: copiar as
 * variáveis de development para a Vercel e deixar o `R2_BUCKET` para trás. Sem
 * ele, o app de produção escreveria fotos reais no bucket de teste em silêncio.
 *
 * Desde o D-170 há uma segunda guarda, de formato de credencial, pelo mesmo
 * motivo: o erro que ela pega não falha em lugar nenhum até o PUT que sai do
 * navegador. Ver `assertCredentialShape`.
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
export const PROD_BRANCH = "production";

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
 * Formato das credenciais, conferido antes de qualquer byte sair.
 *
 * **Por que esta guarda existe.** O painel do Cloudflare mostra tres valores
 * quando um token de R2 e criado, e so dois deles entram aqui:
 *
 *   Token value        cfat_...   serve para a API REST do Cloudflare
 *   Access Key ID      32 hex     -> R2_ACCESS_KEY_ID
 *   Secret Access Key  64 hex     -> R2_SECRET_ACCESS_KEY
 *
 * O primeiro e o que aparece em destaque, e e o erro facil de cometer. Com ele
 * em `R2_ACCESS_KEY_ID` nada falha no boot, nada falha no login e nada falha ao
 * abrir a pagina: o servidor assina a URL normalmente e o R2 so recusa la na
 * frente, no PUT que sai do navegador, com `400 InvalidArgument` — medido
 * contra o bucket de desenvolvimento, resposta de 149 bytes. Uma chave com o
 * formato certo mas inexistente responde `401 Unauthorized`; e a diferenca
 * entre "nao consigo ler isto" e "isto nao e de ninguem".
 *
 * Como o Access Key ID viaja em toda URL assinada, por o token de API nesse
 * campo tambem o entrega ao navegador a cada upload.
 *
 * A guarda compara formato, nunca valor, e a mensagem nomeia o campo do painel
 * sem repetir nada do que leu.
 */
const FORMATO_ACCESS_KEY_ID = /^[0-9a-f]{32}$/;
const FORMATO_SECRET = /^[0-9a-f]{64}$/;

export function assertCredentialShape(config: R2Config): void {
  if (!FORMATO_ACCESS_KEY_ID.test(config.accessKeyId)) {
    const pareceToken = config.accessKeyId.startsWith("cfat_");

    throw new R2ConfigError(
      [
        "",
        "ABORTADO: R2_ACCESS_KEY_ID nao tem o formato de um Access Key ID do R2.",
        "",
        "Esperado: 32 caracteres hexadecimais minusculos.",
        `Recebido: ${config.accessKeyId.length} caracteres` +
          (pareceToken ? ", comecando em cfat_." : "."),
        ...(pareceToken
          ? [
              "",
              "Esse prefixo e o do Token value, que serve para a API REST do",
              "Cloudflare e nao para assinar requisicao S3. O R2 recusa o PUT",
              "assinado com 400 InvalidArgument, e o sintoma e uma foto que nao",
              "sobe.",
              "",
              "Alem disso: o Access Key ID viaja em toda URL assinada, entao um",
              "token de API nesse campo vai para o navegador a cada upload. Se",
              "ja foi usado, gire o token no painel.",
            ]
          : []),
        "",
        "O que fazer:",
        "  1. Cloudflare -> R2 -> Manage API tokens -> o token deste bucket",
        "  2. Copie o campo Access Key ID (nao o Token value)",
        "  3. Copie o campo Secret Access Key para R2_SECRET_ACCESS_KEY",
        "  4. Reimplante para o ambiente reler as variaveis",
      ].join("\n"),
    );
  }

  if (!FORMATO_SECRET.test(config.secretAccessKey)) {
    throw new R2ConfigError(
      [
        "",
        "ABORTADO: R2_SECRET_ACCESS_KEY nao tem o formato de um Secret Access",
        "Key do R2.",
        "",
        "Esperado: 64 caracteres hexadecimais minusculos.",
        `Recebido: ${config.secretAccessKey.length} caracteres.`,
        "",
        "Copie o campo Secret Access Key do mesmo token, no painel do",
        "Cloudflare em R2 -> Manage API tokens.",
      ].join("\n"),
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

  if (branch === PROD_BRANCH && config.bucket !== PROD_BUCKET) {
    throw new R2ConfigError(
      `\nABORTADO: NEON_BRANCH é "${branch}" e R2_BUCKET é "${config.bucket}".\n\n` +
        `Em produção o único bucket permitido é "${PROD_BUCKET}".\n` +
        (config.bucket === DEV_BUCKET
          ? "As fotos reais do casal iriam para o bucket de teste, e o token " +
            "de development nem tem permissão nele.\n"
          : "") +
        `\nO que fazer:\n` +
        `  1. Abra as variáveis de ambiente do projeto na Vercel\n` +
        `  2. Deixe R2_BUCKET=${PROD_BUCKET} no ambiente Production\n` +
        `  3. Confirme que o token de acesso é o limitado a esse bucket\n`,
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
  assertCredentialShape(config);
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
