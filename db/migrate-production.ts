import { readdirSync } from "node:fs";

import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import { requireProductionBranch } from "./production.ts";

/**
 * Aplica as migrations versionadas na branch `production` (B12).
 *
 * É o único caminho autorizado: `drizzle-kit push` está proibido em produção
 * pelo CLAUDE.md, e o `db:migrate` de development aborta se a branch não for
 * `development`. As duas travas continuam de pé; este comando é a terceira
 * porta, com confirmação digitada.
 *
 * Só aplica o que está em `db/migrations`. Não cria dado, não roda seed e não
 * apaga nada — migration destrutiva exige autorização do proprietário, por
 * decisão registrada, e nenhuma das 0000–0006 é destrutiva.
 */
const FOLDER = "db/migrations";

/** Quantas migrations o Drizzle já registrou nesta branch. */
async function appliedCount(
  db: ReturnType<typeof drizzle>,
): Promise<number | "tabela ainda não existe"> {
  try {
    const result = await db.execute<{ total: string }>(
      sql`select count(*)::text as total from drizzle.__drizzle_migrations`,
    );
    return Number(result.rows[0]?.total ?? 0);
  } catch {
    return "tabela ainda não existe";
  }
}

function migrationFiles(): readonly string[] {
  return readdirSync(FOLDER)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

async function main(): Promise<void> {
  const target = requireProductionBranch("pnpm db:migrate:prod");

  const arquivos = migrationFiles();
  console.log(`\nMigrations no repositório: ${arquivos.length}`);
  for (const arquivo of arquivos) console.log(`  ${arquivo}`);

  const pool = new Pool({ connectionString: target.url });
  try {
    const db = drizzle(pool);

    const antes = await appliedCount(db);
    console.log(`\nJá aplicadas em production: ${antes}`);

    await migrate(db, { migrationsFolder: FOLDER });

    const depois = await appliedCount(db);
    console.log(`Aplicadas agora           : ${depois}`);

    if (typeof depois === "number" && depois !== arquivos.length) {
      /* Divergência não é falha: uma migration pode ter sido registrada num
         lote anterior. É um fato que precisa ser lido, não engolido. */
      console.warn(
        `\nATENÇÃO: ${arquivos.length} arquivos no repositório e ${depois} registros na tabela.\n` +
          "Confira antes de seguir para o bootstrap.",
      );
    } else {
      console.log("\nMigration concluída.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
