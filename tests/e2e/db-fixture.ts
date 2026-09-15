import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "@neondatabase/serverless";
import { eq, inArray, or, sql } from "drizzle-orm";
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

/** Planos exclusivos da execução: testes de interface nunca apagam fotos do seed. */
export async function prepareOwnedPlans(ids: readonly string[]): Promise<void> {
  const db = fixtureDb();
  await db.insert(schema.plans).values(
    ids.map((id, index) => ({
      id,
      workspaceId: "11111111-1111-4111-8111-111111111111",
      createdBy: "seed_profile_alex",
      title: `Plano de teste ${index + 1}`,
      category: "cultura",
      status: "idea" as const,
    })),
  );
}

export async function removeOwnedPlans(ids: readonly string[]): Promise<void> {
  await limparMidiaDosPlanos(ids);
  const db = fixtureDb();
  await db
    .delete(schema.activityEvents)
    .where(
      or(
        inArray(schema.activityEvents.subjectId, [...ids]),
        inArray(sql<string>`${schema.activityEvents.metadata} ->> 'planId'`, [
          ...ids,
        ]),
      ),
    );
  await db.delete(schema.plans).where(inArray(schema.plans.id, [...ids]));
}

export type SnapshotDePlanos = {
  restaurar: () => Promise<void>;
};

/**
 * Fotografa o estado dos planos que o teste vai mexer, e devolve como voltar.
 *
 * Existe porque a primeira versão dos testes de data apagava as opções do seed
 * e forçava o status para `idea` — o que quebrava o
 * `database.integration.test.ts`, que afirma que o seed cobre os seis status.
 * É a mesma armadilha do `test:crud` do B4: limpar não é apagar tudo, é
 * devolver o que estava.
 */
export async function snapshotPlanos(
  planIds: readonly string[],
): Promise<SnapshotDePlanos> {
  const db = fixtureDb();

  const statusOriginal = await db
    .select({ id: schema.plans.id, status: schema.plans.status })
    .from(schema.plans)
    .where(inArray(schema.plans.id, [...planIds]));

  const opcoesOriginais = await db
    .select({ id: schema.planDateOptions.id })
    .from(schema.planDateOptions)
    .where(inArray(schema.planDateOptions.planId, [...planIds]));

  const conhecidas = new Set(opcoesOriginais.map((linha) => linha.id));

  return {
    async restaurar() {
      const agora = await db
        .select({ id: schema.planDateOptions.id })
        .from(schema.planDateOptions)
        .where(inArray(schema.planDateOptions.planId, [...planIds]));

      const criadas = agora
        .map((linha) => linha.id)
        .filter((id) => !conhecidas.has(id));

      if (criadas.length > 0) {
        await db
          .delete(schema.planDateOptions)
          .where(inArray(schema.planDateOptions.id, criadas));
      }

      for (const plano of statusOriginal) {
        await db
          .update(schema.plans)
          .set({ status: plano.status })
          .where(eq(schema.plans.id, plano.id));
      }
    },
  };
}
