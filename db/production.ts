/**
 * Guarda da branch `production`, espelho invertido de `db/env.ts`.
 *
 * O `db/env.ts` existe para IMPEDIR que um comando de desenvolvimento alcance
 * produção. Este existe para permitir que três comandos a alcancem — e a
 * diferença entre os dois arquivos é toda a superfície em que produção pode ser
 * tocada. Ela é pequena de propósito.
 *
 * Três travas independentes, e o comando só roda com as três:
 *
 *   1. `NEON_BRANCH=production`, que só existe no `.env.deploy` —
 *      arquivo separado, nunca commitado, carregado por `--env-file` explícito;
 *   2. o argumento `--eu-confirmo` digitado à mão na linha de comando;
 *   3. a leitura do host impresso antes da escrita, que é humana.
 *
 * Nenhuma delas dispara sozinha, e nenhuma acontece por engano de terminal.
 */
const REQUIRED_BRANCH = "production";
const CONFIRMATION_FLAG = "--eu-confirmo";

export type ProductionTarget = {
  readonly url: string;
  readonly host: string;
  readonly branch: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "host ilegível";
  }
}

/**
 * O pooler não serve para migration: ele multiplexa sessões, e `CREATE TYPE`,
 * lock de tabela e transação longa precisam da mesma sessão do começo ao fim.
 */
function unpooledUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "DATABASE_URL_UNPOOLED não está definida.\n" +
        "Copie .env.deploy.example para .env.deploy e preencha " +
        "com a connection string DIRETA (sem -pooler) da branch production.",
    );
  }

  if (url.includes("-pooler.")) {
    throw new Error(
      "ABORTADO: DATABASE_URL_UNPOOLED aponta para o endpoint com pooler.\n" +
        "Migration precisa da conexão direta: use a string SEM '-pooler' no host.",
    );
  }

  return url;
}

function confirmationGiven(argv: readonly string[]): boolean {
  return argv.includes(CONFIRMATION_FLAG);
}

/**
 * Aborta a menos que a branch seja `production` E a confirmação tenha sido
 * digitada. Imprime branch e host — nunca a connection string.
 */
export function requireProductionBranch(
  comando: string,
  argv: readonly string[] = process.argv.slice(2),
): ProductionTarget {
  const branch = process.env.NEON_BRANCH;
  const url = unpooledUrl();
  const host = hostOf(url);

  console.log(`Neon branch : ${branch ?? "(não definida)"}`);
  console.log(`Neon host   : ${host}`);

  if (branch !== REQUIRED_BRANCH) {
    throw new Error(
      `\nABORTADO: NEON_BRANCH é "${branch ?? "(não definida)"}", e ${comando} só roda em "${REQUIRED_BRANCH}".\n\n` +
        "Este comando é carregado com --env-file=.env.deploy.\n" +
        "Se a branch veio diferente, o arquivo carregado não é o de produção —\n" +
        "pare e confira antes de qualquer outra coisa.",
    );
  }

  if (!confirmationGiven(argv)) {
    throw new Error(
      `\nABORTADO: falta a confirmação explícita.\n\n` +
        `${comando} escreve na branch ${REQUIRED_BRANCH} do Neon, no host acima.\n` +
        `Leia o host impresso. Se for o certo, rode de novo com:\n\n` +
        `    ${CONFIRMATION_FLAG}\n`,
    );
  }

  return { url, host, branch };
}

/**
 * Mesma trava para os comandos que falam com o serviço de Auth e não abrem
 * conexão com o banco: não existe `DATABASE_URL_UNPOOLED` a exigir ali.
 */
export function requireProductionAuth(
  comando: string,
  argv: readonly string[] = process.argv.slice(2),
): { readonly baseUrl: string; readonly origin: string } {
  const branch = process.env.NEON_BRANCH;
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const origin = process.env.DATE_PROD_ORIGIN;

  if (!baseUrl) {
    throw new Error("ABORTADO: NEON_AUTH_BASE_URL não está definida.");
  }

  /* O serviço recusa cadastro sem header Origin (D-045), e em produção não
     existe padrão razoável: a origem é a URL final do app, e ela precisa ser
     declarada, não adivinhada. */
  if (!origin) {
    throw new Error(
      "ABORTADO: DATE_PROD_ORIGIN não está definida.\n" +
        "Preencha com a URL final do DATE, por exemplo https://date.vercel.app",
    );
  }

  console.log(`Neon branch    : ${branch ?? "(não definida)"}`);
  console.log(`Neon Auth host : ${hostOf(baseUrl)}`);
  console.log(`Origin         : ${origin}`);

  if (branch !== REQUIRED_BRANCH) {
    throw new Error(
      `\nABORTADO: NEON_BRANCH é "${branch ?? "(não definida)"}", e ${comando} só roda em "${REQUIRED_BRANCH}".`,
    );
  }

  if (!confirmationGiven(argv)) {
    throw new Error(
      `\nABORTADO: falta a confirmação explícita.\n\n` +
        `${comando} escreve no serviço de Auth acima.\n` +
        `Se o host e a origem estiverem certos, rode de novo com:\n\n` +
        `    ${CONFIRMATION_FLAG}\n`,
    );
  }

  return { baseUrl, origin };
}
