import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import { requireDevelopmentBranch } from "./env.ts";

async function main(): Promise<void> {
  const target = requireDevelopmentBranch();

  const pool = new Pool({ connectionString: target.url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "db/migrations" });
    console.log("Migration aplicada.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
