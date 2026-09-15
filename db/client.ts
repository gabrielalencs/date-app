import "server-only";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { queryCounter } from "@/db/query-counter.ts";
import * as schema from "@/db/schema/index.ts";

/**
 * neon-serverless (WebSocket) e não neon-http: o driver HTTP lança
 * "No transactions support in neon-http driver" em db.transaction().
 * O produto precisa de transação interativa — voto mais mudança de status,
 * reordenação de checklist, confirmação de data mais evento.
 *
 * Runtime usa a connection string pooled; migration e seed usam a direta.
 */
function pooledUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Copie .env.example para .env.local.",
    );
  }
  return url;
}

const pool = new Pool({ connectionString: pooledUrl() });

/* O `logger` é o contador de consultas do B9, desligado por padrão: fora de
   uma medição ele testa um booleano e retorna. É assim que a exigência de
   escala da seção 7 do docs/MEMORIES.md deixa de ser opinião e vira número. */
export const db = drizzle(pool, { schema, logger: queryCounter });

/** Encerra o pool em processos finitos, como o teste de integração. */
export async function closeDatabasePool(): Promise<void> {
  await pool.end();
}

export type Db = typeof db;
