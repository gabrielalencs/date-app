export const REACTION_TYPES = ["favorite", "want_a_lot"] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];
