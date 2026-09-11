import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  planDateOptions,
  planDateVotes,
  plans,
  profiles,
  workspaceMembers,
} from "@/db/schema/index.ts";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import {
  consensusOf,
  consensusRank,
  type Consensus,
  type MemberVote,
  type VoteValue,
} from "@/lib/consensus";
import { civilDaysBetween } from "@/lib/datetime";
import { NotFoundError } from "@/lib/errors";
import type { PlanStatus } from "@/lib/status";

/**
 * Leituras de datas e votos. Contexto em primeiro lugar, `workspaceId` nunca é
 * parâmetro, todo `where` começa pelo predicado de workspace (D-037).
 */
export type WorkspaceMember = {
  profileId: string;
  displayName: string;
};

/** Os dois do workspace, em ordem estável, para os votos aparecerem sempre na mesma. */
export async function listWorkspaceMembers(
  ctx: AuthorizedContext,
): Promise<WorkspaceMember[]> {
  return db
    .select({
      profileId: profiles.id,
      displayName: profiles.displayName,
    })
    .from(workspaceMembers)
    .innerJoin(profiles, eq(profiles.id, workspaceMembers.profileId))
    .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))
    .orderBy(asc(workspaceMembers.createdAt), asc(profiles.id));
}

export type DateOption = {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  note: string | null;
  isConfirmed: boolean;
  createdBy: string;
  votes: readonly MemberVote[];
  consensus: Consensus;
  /** O voto de quem está olhando, para o controle segmentado. */
  myVote: VoteValue | null;
};

/**
 * Opções de um plano com os dois votos de cada uma, já com o consenso
 * calculado. A ordem é por consenso e depois por data: quem decide olha "qual
 * data a gente já concorda", não qual foi criada primeiro.
 */
export async function listPlanDateOptions(
  ctx: AuthorizedContext,
  planId: string,
): Promise<DateOption[]> {
  const [membros, opcoes] = await Promise.all([
    listWorkspaceMembers(ctx),
    db
      .select()
      .from(planDateOptions)
      .where(
        and(
          eq(planDateOptions.workspaceId, ctx.workspaceId),
          eq(planDateOptions.planId, planId),
        ),
      )
      .orderBy(asc(planDateOptions.startsAt)),
  ]);

  if (opcoes.length === 0) {
    return [];
  }

  const votos = await db
    .select({
      optionId: planDateVotes.optionId,
      profileId: planDateVotes.profileId,
      vote: planDateVotes.vote,
    })
    .from(planDateVotes)
    .where(
      and(
        eq(planDateVotes.workspaceId, ctx.workspaceId),
        inArray(
          planDateVotes.optionId,
          opcoes.map((opcao) => opcao.id),
        ),
      ),
    );

  const porOpcao = new Map<string, Map<string, VoteValue>>();
  for (const voto of votos) {
    const mapa = porOpcao.get(voto.optionId) ?? new Map<string, VoteValue>();
    mapa.set(voto.profileId, voto.vote);
    porOpcao.set(voto.optionId, mapa);
  }

  const montadas = opcoes.map((opcao): DateOption => {
    const mapa = porOpcao.get(opcao.id);

    /* Membro sem linha de voto entra com `null`: ausência é "ainda não
       respondeu", que é estado distinto de ter votado `no` (seção 4). */
    const votosDaOpcao: MemberVote[] = membros.map((membro) => ({
      profileId: membro.profileId,
      displayName: membro.displayName,
      vote: mapa?.get(membro.profileId) ?? null,
    }));

    return {
      id: opcao.id,
      startsAt: opcao.startsAt,
      endsAt: opcao.endsAt,
      allDay: opcao.allDay,
      note: opcao.note,
      isConfirmed: opcao.isConfirmed,
      createdBy: opcao.createdBy,
      votes: votosDaOpcao,
      consensus: consensusOf(votosDaOpcao),
      myVote: mapa?.get(ctx.profileId) ?? null,
    };
  });

  return montadas.sort((a, b) => {
    // A confirmada sempre primeiro: ela deixou de ser candidata.
    if (a.isConfirmed !== b.isConfirmed) return a.isConfirmed ? -1 : 1;

    const peso =
      consensusRank(a.consensus.state) - consensusRank(b.consensus.state);
    if (peso !== 0) return peso;

    return a.startsAt.getTime() - b.startsAt.getTime();
  });
}

export type ConfirmedDate = {
  optionId: string;
  planId: string;
  planTitle: string;
  planStatus: PlanStatus;
  coverMediaId: string | null;
  city: string | null;
  placeName: string | null;
  startsAt: Date;
  allDay: boolean;
};

/**
 * O próximo DATE: plano com data confirmada em dia civil futuro.
 *
 * "Futuro" é dia de calendário no fuso do app, não instante — um date marcado
 * para hoje às 20h ainda é hoje às 23h, e não deve sumir da Home só porque o
 * relógio passou (D-061).
 */
export async function getNextConfirmedDate(
  ctx: AuthorizedContext,
  now: Date = new Date(),
): Promise<ConfirmedDate | null> {
  const linhas = await db
    .select({
      optionId: planDateOptions.id,
      planId: plans.id,
      planTitle: plans.title,
      planStatus: plans.status,
      coverMediaId: plans.coverMediaId,
      city: plans.city,
      placeName: plans.placeName,
      startsAt: planDateOptions.startsAt,
      allDay: planDateOptions.allDay,
      archivedAt: plans.archivedAt,
    })
    .from(planDateOptions)
    .innerJoin(plans, eq(plans.id, planDateOptions.planId))
    .where(
      and(
        eq(planDateOptions.workspaceId, ctx.workspaceId),
        eq(plans.workspaceId, ctx.workspaceId),
        eq(planDateOptions.isConfirmed, true),
      ),
    )
    .orderBy(asc(planDateOptions.startsAt));

  const proxima = linhas.find(
    (linha) =>
      linha.archivedAt === null &&
      linha.planStatus !== "cancelled" &&
      linha.planStatus !== "completed" &&
      // Hoje conta como próximo; só dia civil anterior sai.
      civilDaysBetween(now, linha.startsAt) >= 0,
  );

  if (!proxima) {
    return null;
  }

  return {
    optionId: proxima.optionId,
    planId: proxima.planId,
    planTitle: proxima.planTitle,
    planStatus: proxima.planStatus,
    coverMediaId: proxima.coverMediaId,
    city: proxima.city,
    placeName: proxima.placeName,
    startsAt: proxima.startsAt,
    allDay: proxima.allDay,
  };
}

/** A data oficial de um plano, quando existe. */
export async function getConfirmedOption(
  ctx: AuthorizedContext,
  planId: string,
): Promise<{ id: string; startsAt: Date; allDay: boolean } | null> {
  const [linha] = await db
    .select({
      id: planDateOptions.id,
      startsAt: planDateOptions.startsAt,
      allDay: planDateOptions.allDay,
    })
    .from(planDateOptions)
    .where(
      and(
        eq(planDateOptions.workspaceId, ctx.workspaceId),
        eq(planDateOptions.planId, planId),
        eq(planDateOptions.isConfirmed, true),
      ),
    )
    .limit(1);

  return linha ?? null;
}

/** Usado pela interface para saber se o plano existe neste workspace. */
export async function assertPlanVisible(
  ctx: AuthorizedContext,
  planId: string,
): Promise<void> {
  const [plano] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
    .limit(1);

  if (!plano) {
    throw new NotFoundError("Plano");
  }
}
