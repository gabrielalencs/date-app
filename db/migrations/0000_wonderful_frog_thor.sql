CREATE TYPE "public"."activity_verb" AS ENUM('plan_created', 'date_suggested', 'vote_cast', 'date_confirmed', 'booking_updated', 'plan_completed', 'memory_added');--> statement-breakpoint
CREATE TYPE "public"."link_type" AS ENUM('instagram', 'tiktok', 'website', 'google_maps', 'waze', 'booking', 'ticket', 'lodging', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_purpose" AS ENUM('cover', 'gallery', 'memory', 'avatar');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('idea', 'deciding', 'planned', 'reserved', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reaction_type" AS ENUM('favorite', 'want_a_lot');--> statement-breakpoint
CREATE TYPE "public"."repeat_answer" AS ENUM('yes', 'maybe', 'no');--> statement-breakpoint
CREATE TYPE "public"."vote_value" AS ENUM('yes', 'maybe', 'no');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar_media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_profile_id_pk" PRIMARY KEY("workspace_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_date_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"note" text,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_date_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"vote" "vote_value" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_date_votes_option_profile_unique" UNIQUE("option_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "plan_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"type" "link_type" DEFAULT 'other' NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"status" "plan_status" DEFAULT 'idea' NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"cover_media_id" uuid,
	"place_name" text,
	"address" text,
	"city" text,
	"state" text,
	"country" text,
	"lat" double precision,
	"lng" double precision,
	"source_url" text,
	"estimated_budget_cents" integer,
	"duration_minutes" integer,
	"requires_booking" boolean DEFAULT false NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_priority_range" CHECK ("plans"."priority" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_items_done_together" CHECK (("checklist_items"."done_at" is null and "checklist_items"."done_by" is null) or ("checklist_items"."done_at" is not null and "checklist_items"."done_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_by" text,
	"spent_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"purpose" "media_purpose" NOT NULL,
	"plan_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"type" "reaction_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_plan_profile_type_unique" UNIQUE("plan_id","profile_id","type")
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_profile_id" text NOT NULL,
	"verb" "activity_verb" NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"highlight" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memories_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
CREATE TABLE "memory_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"rating" smallint NOT NULL,
	"would_repeat" "repeat_answer",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_ratings_memory_profile_unique" UNIQUE("memory_id","profile_id"),
	CONSTRAINT "memory_ratings_rating_range" CHECK ("memory_ratings"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_date_options" ADD CONSTRAINT "plan_date_options_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_date_options" ADD CONSTRAINT "plan_date_options_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_date_options" ADD CONSTRAINT "plan_date_options_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_date_votes" ADD CONSTRAINT "plan_date_votes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_date_votes" ADD CONSTRAINT "plan_date_votes_option_id_plan_date_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."plan_date_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_date_votes" ADD CONSTRAINT "plan_date_votes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_links" ADD CONSTRAINT "plan_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_links" ADD CONSTRAINT "plan_links_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_done_by_profiles_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_profiles_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_ratings" ADD CONSTRAINT "memory_ratings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_ratings" ADD CONSTRAINT "memory_ratings_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_ratings" ADD CONSTRAINT "memory_ratings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_avatar_media_id_idx" ON "profiles" USING btree ("avatar_media_id");--> statement-breakpoint
CREATE INDEX "workspace_members_profile_id_idx" ON "workspace_members" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_date_options_one_confirmed_per_plan" ON "plan_date_options" USING btree ("plan_id") WHERE "plan_date_options"."is_confirmed";--> statement-breakpoint
CREATE INDEX "plan_date_options_workspace_id_idx" ON "plan_date_options" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "plan_date_options_workspace_starts_at_idx" ON "plan_date_options" USING btree ("workspace_id","starts_at");--> statement-breakpoint
CREATE INDEX "plan_date_options_plan_id_idx" ON "plan_date_options" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_date_options_created_by_idx" ON "plan_date_options" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "plan_date_votes_workspace_id_idx" ON "plan_date_votes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "plan_date_votes_option_id_idx" ON "plan_date_votes" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "plan_date_votes_profile_id_idx" ON "plan_date_votes" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "plan_links_workspace_id_idx" ON "plan_links" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "plan_links_plan_id_idx" ON "plan_links" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plans_workspace_id_idx" ON "plans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "plans_workspace_status_idx" ON "plans" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "plans_workspace_created_at_idx" ON "plans" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "plans_cover_media_id_idx" ON "plans" USING btree ("cover_media_id");--> statement-breakpoint
CREATE INDEX "plans_created_by_idx" ON "plans" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "checklist_items_workspace_id_idx" ON "checklist_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "checklist_items_plan_id_idx" ON "checklist_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "checklist_items_plan_position_idx" ON "checklist_items" USING btree ("plan_id","position");--> statement-breakpoint
CREATE INDEX "checklist_items_done_by_idx" ON "checklist_items" USING btree ("done_by");--> statement-breakpoint
CREATE INDEX "expenses_workspace_id_idx" ON "expenses" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "expenses_plan_id_idx" ON "expenses" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "expenses_paid_by_idx" ON "expenses" USING btree ("paid_by");--> statement-breakpoint
CREATE INDEX "media_workspace_id_idx" ON "media" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "media_plan_id_idx" ON "media" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "media_uploaded_by_idx" ON "media" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "reactions_workspace_id_idx" ON "reactions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "reactions_plan_id_idx" ON "reactions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "reactions_profile_id_idx" ON "reactions" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "activity_events_workspace_id_idx" ON "activity_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "activity_events_workspace_created_at_idx" ON "activity_events" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_events_actor_profile_id_idx" ON "activity_events" USING btree ("actor_profile_id");--> statement-breakpoint
CREATE INDEX "memories_workspace_id_idx" ON "memories" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "memory_ratings_workspace_id_idx" ON "memory_ratings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "memory_ratings_memory_id_idx" ON "memory_ratings" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_ratings_profile_id_idx" ON "memory_ratings" USING btree ("profile_id");