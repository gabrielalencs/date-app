import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema/index.ts";
import { dedupeKeyFor } from "../features/notifications/policy/dedupe.ts";
import { reminderSchedule } from "../features/notifications/policy/schedule.ts";
import { dayKey } from "../lib/datetime.ts";

/**
 * Backfill do B11.5 (seção 20 do docs/NOTIFICATIONS.md).
 *
 * **O que ele não faz**, e isso é o principal: não reproduz nada do passado.
 * Nenhum "nova ideia" retroativo, nenhum voto antigo, nenhuma reação de três
 * meses atrás. Ligar notificações não pode significar despejar o histórico do
 * casal na tela bloqueada das duas pessoas de uma vez.
 *
 * O que ele faz é uma coisa só: planos com **data confirmada futura** passam a
 * ter os lembretes 7/5/3/1 que ainda estão no futuro. Sem isso, os dates já
 * marcados antes deste bloco nunca teriam lembrete, e a feature só valeria para
 * quem marcasse dali em diante.
 *
 * Idempotente pelo mesmo índice parcial que faz o debounce: rodar duas vezes
 * não cria a segunda intent. Roda só em development — produção é do B12, com
 * confirmação humana.
 */

const DEV_BRANCH = "development";

async function main(): Promise<void> {
  const branch = process.env.NEON_BRANCH;
  if (branch !== DEV_BRANCH) {
    throw new Error(
      `ABORTADO: NEON_BRANCH é "${branch ?? "(não definida)"}" e o backfill do ` +
        "B11.5 só roda em development.",
    );
  }

  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("ABORTADO: DATABASE_URL_UNPOOLED não está definida.");
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  const agora = new Date();

  console.log(`Neon branch : ${branch}`);

  /* Só o que ainda pode acontecer: data confirmada no futuro, plano não
     arquivado, não cancelado e não concluído. */
  const confirmadas = await db
    .select({
      workspaceId: schema.plans.workspaceId,
      planId: schema.plans.id,
      title: schema.plans.title,
      optionId: schema.planDateOptions.id,
      startsAt: schema.planDateOptions.startsAt,
    })
    .from(schema.planDateOptions)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.planDateOptions.planId))
    .where(
      and(
        eq(schema.planDateOptions.isConfirmed, true),
        gt(schema.planDateOptions.startsAt, agora),
        isNull(schema.plans.archivedAt),
        ne(schema.plans.status, "cancelled"),
        ne(schema.plans.status, "completed"),
      ),
    );

  console.log(`Planos com data confirmada futura: ${confirmadas.length}`);

  let criadas = 0;
  let jaExistiam = 0;

  for (const plano of confirmadas) {
    const membros = await db
      .select({ profileId: schema.workspaceMembers.profileId })
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, plano.workspaceId));

    const chaveDoDia = dayKey(plano.startsAt);

    for (const slot of reminderSchedule(plano.startsAt, agora)) {
      const dedupeKey = dedupeKeyFor({
        kind: "date_reminder",
        planId: plano.planId,
        offsetDays: slot.offsetDays,
      });

      for (const membro of membros) {
        const linhas = await db
          .insert(schema.notificationIntents)
          .values({
            workspaceId: plano.workspaceId,
            recipientProfileId: membro.profileId,
            actorProfileId: null,
            planId: plano.planId,
            kind: "date_reminder",
            dedupeKey,
            dueAt: slot.dueAt,
            expected: {
              confirmedOptionId: plano.optionId,
              dayKey: chaveDoDia,
              offsetDays: slot.offsetDays,
            },
          })
          /* O índice parcial de intents abertas é o que torna a repetição
             inofensiva: a segunda execução colide e não insere. */
          .onConflictDoNothing()
          .returning({ id: schema.notificationIntents.id });

        if (linhas.length > 0) criadas += 1;
        else jaExistiam += 1;
      }
    }
  }

  console.log(`Lembretes criados   : ${criadas}`);
  console.log(`Já existiam         : ${jaExistiam}`);
  console.log(
    "\nNenhum evento antigo foi reproduzido: o backfill só agenda lembretes " +
      "futuros.\nOs workflows destes lembretes são iniciados pelo recovery.",
  );

  await pool.end();
}

await main();
