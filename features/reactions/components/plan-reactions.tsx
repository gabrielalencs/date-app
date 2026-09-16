"use client";

import { useActionState } from "react";
import { Bookmark, Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  toggleReactionAction,
  type ReactionActionState,
} from "@/features/discovery/actions/discovery-actions";
import type { MemberReactions } from "@/features/reactions/data/queries";

const INITIAL: ReactionActionState = {};

export function PlanReactions({
  planId,
  members,
}: {
  planId: string;
  members: readonly MemberReactions[];
}) {
  const current = members.find((member) => member.isCurrent);
  const [favoriteState, favoriteAction, favoritePending] = useActionState(
    toggleReactionAction,
    INITIAL,
  );
  const [wantState, wantAction, wantPending] = useActionState(
    toggleReactionAction,
    INITIAL,
  );

  return (
    <section className="panel flex flex-col gap-5 !p-5">
      <div>
        <span className="type-label text-text-muted">Entre vocês</span>
        <h2 className="section-heading mt-2">Reações</h2>
      </div>

      <div className="grid gap-2">
        <form action={favoriteAction}>
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="type" value="favorite" />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            fullWidth
            aria-pressed={current?.favorite ?? false}
            loading={favoritePending}
            loadingLabel="Salvando"
            className="justify-start"
          >
            <Bookmark
              aria-hidden="true"
              className="size-4"
              fill={current?.favorite ? "currentColor" : "none"}
            />
            {current?.favorite ? "Remover dos favoritos" : "Favoritar"}
          </Button>
        </form>
        <form action={wantAction}>
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="type" value="want_a_lot" />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            fullWidth
            aria-pressed={current?.wantALot ?? false}
            loading={wantPending}
            loadingLabel="Salvando"
            className="justify-start"
          >
            <Heart
              aria-hidden="true"
              className="size-4"
              fill={current?.wantALot ? "currentColor" : "none"}
            />
            {current?.wantALot ? "Retirar quero muito" : "Quero muito"}
          </Button>
        </form>
      </div>

      <ul className="border-border-subtle divide-border-subtle divide-y border-y">
        {members.map((member) => (
          <li
            key={member.profileId}
            className="flex min-h-11 items-center justify-between gap-3 py-2"
          >
            <span className="type-meta font-medium">
              {member.isCurrent ? "Você" : member.displayName}
            </span>
            <span className="type-meta text-text-muted text-right">
              {member.favorite || member.wantALot
                ? [
                    member.favorite ? "favoritou" : null,
                    member.wantALot ? "quer muito" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "sem reação"}
            </span>
          </li>
        ))}
      </ul>

      {favoriteState.error || wantState.error ? (
        <p role="alert" className="type-body-s text-danger">
          {favoriteState.error ?? wantState.error}
        </p>
      ) : null}
    </section>
  );
}
