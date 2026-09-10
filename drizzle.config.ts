import { defineConfig } from "drizzle-kit";

// `generate` é offline e não usa credencial; `migrate` usa a direta (unpooled).
export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? "",
  },
});
