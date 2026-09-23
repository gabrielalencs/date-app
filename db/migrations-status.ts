import { readdirSync } from "node:fs";

import { Pool } from "@neondatabase/serverless";

/**
 * Quais migrations do repositório ainda **não** foram aplicadas na branch que o
 * arquivo de ambiente carregado aponta. Somente leitura: não escreve nada, não
 * exige confirmação, e por isso pode rodar antes de qualquer deploy.
 *
 * Existe por causa de um defeito real. A migration `0007` foi aplicada em
 * `development` e não em `production`; o app publicado subiu com o código novo
 * e o banco antigo, e as três opiniões novas passaram a estourar no insert —
 * `invalid input value for enum reaction_type`. Toda a verificação automatizada
 * roda contra `development`, então nenhum teste podia ver isso: a suíte estava
 * verde e o produto, quebrado.
 *
 * A seção 3 do `docs/PRODUCTION.md` já mandava migrar antes de publicar. O que
 * faltava era um jeito barato de **perguntar** se a branch está em dia, sem
 * digitar `--eu-confirmo` e sem risco de escrever por engano.
 *
 *   node --env-file=.env.local  ... db/migrations-status.ts
 *   node --env-file=.env.deploy ... db/migrations-status.ts
 *
 * Sai com código 1 quando há migration pendente, para servir de portão.
 */
const FOLDER = "db/migrations";

function hostOf(url: string): string {
  const encontrado = /@([^/:]+)/.exec(url);
  return encontrado?.[1] ?? "(host ilegível)";
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "ABORTADO: DATABASE_URL_UNPOOLED não está definida. Carregue um arquivo de ambiente com --env-file.",
    );
  }

  const branch = process.env.NEON_BRANCH ?? "(não definida)";
  console.log(`Neon branch : ${branch}`);
  console.log(`Neon host   : ${hostOf(url)}`);

  const arquivos = readdirSync(FOLDER)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();

  const pool = new Pool({ connectionString: url });
  try {
    /* A tabela do Drizzle guarda o hash do arquivo, não o nome. Comparar por
       contagem é o que dá para fazer sem reimplementar o hash dele — e é o
       suficiente para a pergunta que este comando responde. */
    let aplicadas = 0;
    try {
      const r = await pool.query<{ total: number }>(
        "select count(*)::int as total from drizzle.__drizzle_migrations",
      );
      aplicadas = r.rows[0]?.total ?? 0;
    } catch {
      console.log("\nA tabela de migrations ainda não existe nesta branch.");
    }

    const pendentes = arquivos.length - aplicadas;

    console.log(`\nNo repositório : ${arquivos.length}`);
    console.log(`Aplicadas      : ${aplicadas}`);

    if (pendentes <= 0) {
      console.log("\nEsta branch está em dia.");
      return;
    }

    console.log(`Pendentes      : ${pendentes}\n`);
    for (const nome of arquivos.slice(aplicadas)) {
      console.log(`  falta aplicar: ${nome}`);
    }
    console.log(
      "\nPublicar código novo antes de aplicar estas deixa o app com o banco atrás.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
