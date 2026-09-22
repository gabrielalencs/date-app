ALTER TYPE "public"."reaction_type" ADD VALUE 'like';--> statement-breakpoint
ALTER TYPE "public"."reaction_type" ADD VALUE 'meh';--> statement-breakpoint
ALTER TYPE "public"."reaction_type" ADD VALUE 'pass';--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_one_opinion_per_plan_profile" ON "reactions" USING btree ("plan_id","profile_id") WHERE "reactions"."type" <> 'favorite';