import { Pool } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import { requireDevelopmentBranch } from "./env.ts";
import * as schema from "./schema/index.ts";

/**
 * Dados 100% fictícios. Nenhum nome, foto ou lugar real do casal.
 * Idempotente: apaga o workspace de seed (cascata) e recria tudo do zero,
 * então rodar duas vezes dá o mesmo resultado.
 */
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

const ALEX = "seed_profile_alex";
const NINA = "seed_profile_nina";

/** Datas fixas em UTC para o seed ser determinístico. */
const utc = (iso: string) => new Date(`${iso}Z`);

type PlanSeed = {
  id: string;
  title: string;
  category: string;
  status: (typeof schema.planStatus.enumValues)[number];
  priority: number;
  city: string;
  placeName: string;
  estimatedBudgetCents: number | null;
  requiresBooking: boolean;
  createdBy: string;
};

const PLANS: PlanSeed[] = [
  {
    id: "22222222-0000-4000-8000-000000000001",
    title: "Feira de vinil no centro",
    category: "Cultura",
    status: "idea",
    priority: 1,
    city: "São Paulo",
    placeName: "Galpão da feira",
    estimatedBudgetCents: 8000,
    requiresBooking: false,
    createdBy: ALEX,
  },
  {
    id: "22222222-0000-4000-8000-000000000002",
    title: "Sorveteria nova do bairro",
    category: "Comida",
    status: "idea",
    priority: 0,
    city: "São Paulo",
    placeName: "Sorveteria da esquina",
    estimatedBudgetCents: 4500,
    requiresBooking: false,
    createdBy: NINA,
  },
  {
    id: "22222222-0000-4000-8000-000000000003",
    title: "Trilha do mirante",
    category: "Natureza",
    status: "deciding",
    priority: 2,
    city: "Campos do Jordão",
    placeName: "Portaria da trilha",
    estimatedBudgetCents: 12000,
    requiresBooking: false,
    createdBy: ALEX,
  },
  {
    id: "22222222-0000-4000-8000-000000000004",
    title: "Cinema de rua na praça",
    category: "Cultura",
    status: "deciding",
    priority: 1,
    city: "São Paulo",
    placeName: "Praça central",
    estimatedBudgetCents: 0,
    requiresBooking: false,
    createdBy: NINA,
  },
  {
    id: "22222222-0000-4000-8000-000000000005",
    title: "Jantar na cantina",
    category: "Comida",
    status: "planned",
    priority: 3,
    city: "São Paulo",
    placeName: "Cantina da esquina",
    estimatedBudgetCents: 22000,
    requiresBooking: true,
    createdBy: ALEX,
  },
  {
    id: "22222222-0000-4000-8000-000000000006",
    title: "Fim de semana na serra",
    category: "Viagem",
    status: "reserved",
    priority: 3,
    city: "Monte Verde",
    placeName: "Pousada fictícia",
    estimatedBudgetCents: 95000,
    requiresBooking: true,
    createdBy: NINA,
  },
  {
    id: "22222222-0000-4000-8000-000000000007",
    title: "Show de jazz no bar",
    category: "Música",
    status: "completed",
    priority: 2,
    city: "São Paulo",
    placeName: "Bar de jazz",
    estimatedBudgetCents: 18000,
    requiresBooking: true,
    createdBy: ALEX,
  },
  {
    id: "22222222-0000-4000-8000-000000000008",
    title: "Passeio de bike no parque",
    category: "Esporte",
    status: "cancelled",
    priority: 0,
    city: "São Paulo",
    placeName: "Parque municipal",
    estimatedBudgetCents: 3000,
    requiresBooking: false,
    createdBy: NINA,
  },
];

const DECIDING_PLAN = PLANS[2]!;
const PLANNED_PLAN = PLANS[4]!;
const RESERVED_PLAN = PLANS[5]!;
const COMPLETED_PLAN = PLANS[6]!;

async function main(): Promise<void> {
  const target = requireDevelopmentBranch();

  const pool = new Pool({ connectionString: target.url });
  const db = drizzle(pool, { schema });

  try {
    await db.transaction(async (tx) => {
      // Cascata limpa todas as tabelas de negócio deste workspace.
      await tx
        .delete(schema.workspaces)
        .where(eq(schema.workspaces.id, WORKSPACE_ID));

      for (const profile of [
        { id: ALEX, displayName: "Alex" },
        { id: NINA, displayName: "Nina" },
      ]) {
        await tx
          .insert(schema.profiles)
          .values(profile)
          .onConflictDoUpdate({
            target: schema.profiles.id,
            set: { displayName: profile.displayName, updatedAt: new Date() },
          });
      }

      await tx
        .insert(schema.workspaces)
        .values({ id: WORKSPACE_ID, name: "DATE de teste" });

      await tx.insert(schema.workspaceMembers).values([
        { workspaceId: WORKSPACE_ID, profileId: ALEX, role: "owner" },
        { workspaceId: WORKSPACE_ID, profileId: NINA, role: "member" },
      ]);

      await tx.insert(schema.plans).values(
        PLANS.map((plan) => ({
          id: plan.id,
          workspaceId: WORKSPACE_ID,
          title: plan.title,
          category: plan.category,
          status: plan.status,
          priority: plan.priority,
          city: plan.city,
          state: "SP",
          country: "BR",
          placeName: plan.placeName,
          estimatedBudgetCents: plan.estimatedBudgetCents,
          requiresBooking: plan.requiresBooking,
          createdBy: plan.createdBy,
        })),
      );

      await tx.insert(schema.planLinks).values([
        {
          workspaceId: WORKSPACE_ID,
          planId: DECIDING_PLAN.id,
          type: "google_maps",
          url: "https://example.invalid/mapa-trilha",
          label: "Como chegar",
          position: 0,
        },
        {
          workspaceId: WORKSPACE_ID,
          planId: PLANNED_PLAN.id,
          type: "booking",
          url: "https://example.invalid/reserva-cantina",
          label: "Reserva",
          position: 0,
        },
      ]);

      /* Três opções de data no plano em decisão, com votos divergentes:
         a primeira tem sim/não, a segunda talvez/sim. */
      const options = await tx
        .insert(schema.planDateOptions)
        .values([
          {
            workspaceId: WORKSPACE_ID,
            planId: DECIDING_PLAN.id,
            startsAt: utc("2026-10-03T12:00:00"),
            createdBy: ALEX,
          },
          {
            workspaceId: WORKSPACE_ID,
            planId: DECIDING_PLAN.id,
            startsAt: utc("2026-10-10T12:00:00"),
            createdBy: NINA,
          },
          {
            workspaceId: WORKSPACE_ID,
            planId: DECIDING_PLAN.id,
            startsAt: utc("2026-10-17T12:00:00"),
            allDay: true,
            createdBy: NINA,
          },
          {
            workspaceId: WORKSPACE_ID,
            planId: PLANNED_PLAN.id,
            startsAt: utc("2026-09-26T23:00:00"),
            isConfirmed: true,
            createdBy: ALEX,
          },
          {
            workspaceId: WORKSPACE_ID,
            planId: RESERVED_PLAN.id,
            startsAt: utc("2026-11-14T14:00:00"),
            endsAt: utc("2026-11-16T18:00:00"),
            isConfirmed: true,
            createdBy: NINA,
          },
        ])
        .returning({ id: schema.planDateOptions.id });

      const [first, second] = options;
      if (first && second) {
        await tx.insert(schema.planDateVotes).values([
          {
            workspaceId: WORKSPACE_ID,
            optionId: first.id,
            profileId: ALEX,
            vote: "yes",
          },
          {
            workspaceId: WORKSPACE_ID,
            optionId: first.id,
            profileId: NINA,
            vote: "no",
          },
          {
            workspaceId: WORKSPACE_ID,
            optionId: second.id,
            profileId: ALEX,
            vote: "maybe",
          },
          {
            workspaceId: WORKSPACE_ID,
            optionId: second.id,
            profileId: NINA,
            vote: "yes",
          },
        ]);
      }

      await tx.insert(schema.checklistItems).values([
        {
          workspaceId: WORKSPACE_ID,
          planId: RESERVED_PLAN.id,
          label: "Confirmar horário do check-in",
          position: 0,
          doneAt: utc("2026-09-08T13:00:00"),
          doneBy: NINA,
        },
        {
          workspaceId: WORKSPACE_ID,
          planId: RESERVED_PLAN.id,
          label: "Levar casaco",
          position: 1,
        },
        {
          workspaceId: WORKSPACE_ID,
          planId: RESERVED_PLAN.id,
          label: "Abastecer o carro",
          position: 2,
        },
      ]);

      await tx.insert(schema.expenses).values([
        {
          workspaceId: WORKSPACE_ID,
          planId: COMPLETED_PLAN.id,
          label: "Ingressos",
          amountCents: 14000,
          paidBy: ALEX,
          spentOn: "2026-08-22",
        },
        {
          workspaceId: WORKSPACE_ID,
          planId: COMPLETED_PLAN.id,
          label: "Táxi",
          amountCents: 4200,
          paidBy: NINA,
          spentOn: "2026-08-22",
        },
      ]);

      await tx.insert(schema.reactions).values([
        {
          workspaceId: WORKSPACE_ID,
          planId: DECIDING_PLAN.id,
          profileId: NINA,
          type: "want_a_lot",
        },
        {
          workspaceId: WORKSPACE_ID,
          planId: PLANNED_PLAN.id,
          profileId: ALEX,
          type: "favorite",
        },
        {
          workspaceId: WORKSPACE_ID,
          planId: COMPLETED_PLAN.id,
          profileId: NINA,
          type: "favorite",
        },
      ]);

      const [memory] = await tx
        .insert(schema.memories)
        .values({
          workspaceId: WORKSPACE_ID,
          planId: COMPLETED_PLAN.id,
          highlight: "O segundo set, quando o baixista assumiu o solo.",
          notes: "Chegar mais cedo na próxima para pegar mesa perto do palco.",
        })
        .returning({ id: schema.memories.id });

      if (memory) {
        await tx.insert(schema.memoryRatings).values([
          {
            workspaceId: WORKSPACE_ID,
            memoryId: memory.id,
            profileId: ALEX,
            rating: 5,
            wouldRepeat: "yes",
          },
          {
            workspaceId: WORKSPACE_ID,
            memoryId: memory.id,
            profileId: NINA,
            rating: 4,
            wouldRepeat: "maybe",
          },
        ]);
      }
    });

    console.log(`Seed aplicado no workspace ${WORKSPACE_ID}.`);
    console.log(`Planos: ${PLANS.length}. Perfis: 2.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
