import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "@neondatabase/serverless";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema/index.ts";
import { resolveR2 } from "@/features/media/r2/env.ts";

/**
 * Conexão própria para o teste de navegador montar o estado que vai provar.
 *
 * Não importa `@/db/client` de propósito: aquele módulo carrega `server-only`,
 * que estoura fora do runtime do Next — os configs do Vitest contornam isso com
 * um alias, e o Playwright não tem onde declarar um. É a mesma solução que
 * `db/seed.ts` e `db/migrate.ts` já usam: pool próprio, connection string
 * direta, guarda de branch antes de qualquer escrita.
 */
let pool: Pool | undefined;

export function fixtureDb() {
  if (!pool) {
    if (process.env.NEON_BRANCH !== "development") {
      throw new Error(
        `ABORTADO: NEON_BRANCH é "${process.env.NEON_BRANCH ?? "(não definida)"}" ` +
          "e só development pode receber fixture de teste.",
      );
    }

    const connectionString = process.env.DATABASE_URL_UNPOOLED;
    if (!connectionString) {
      throw new Error("DATABASE_URL_UNPOOLED não está definida.");
    }

    pool = new Pool({ connectionString });
  }

  return drizzle(pool, { schema });
}

export async function closeFixtureDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/**
 * Limpa a mídia dos planos que o teste usou — linhas **e** objetos.
 *
 * Apagar só as linhas deixaria o bucket enchendo de órfão a cada execução. O
 * cliente do R2 do produto é `server-only`, então aqui se monta um próprio a
 * partir de `r2/env.ts`, que não importa nada e passa pela mesma guarda de
 * bucket.
 */
export async function limparMidiaDosPlanos(
  planIds: readonly string[],
): Promise<number> {
  const db = fixtureDb();

  const linhas = await db
    .select({
      id: schema.media.id,
      objectKey: schema.media.objectKey,
      thumbObjectKey: schema.media.thumbObjectKey,
    })
    .from(schema.media)
    .where(inArray(schema.media.planId, [...planIds]));

  if (linhas.length === 0) {
    return 0;
  }

  await db.delete(schema.media).where(
    inArray(
      schema.media.id,
      linhas.map((linha) => linha.id),
    ),
  );

  const { config } = resolveR2(process.env);
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  for (const linha of linhas) {
    for (const Key of [linha.objectKey, linha.thumbObjectKey]) {
      await client
        .send(new DeleteObjectCommand({ Bucket: config.bucket, Key }))
        .catch(() => {});
    }
  }

  return linhas.length;
}

export { schema };
