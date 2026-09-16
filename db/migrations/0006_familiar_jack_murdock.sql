CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'sent', 'stale', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_intent_status" AS ENUM('pending', 'processing', 'sent', 'suppressed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_preview_mode" AS ENUM('private', 'full');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"intent_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_status_code" integer,
	"last_error_code" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_unique" UNIQUE("intent_id","subscription_id")
);
--> statement-breakpoint
CREATE TABLE "notification_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"recipient_profile_id" text NOT NULL,
	"actor_profile_id" text,
	"plan_id" uuid,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"expected" jsonb,
	"status" "notification_intent_status" DEFAULT 'pending' NOT NULL,
	"workflow_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"workspace_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"activity_enabled" boolean DEFAULT true NOT NULL,
	"date_reminders_enabled" boolean DEFAULT true NOT NULL,
	"preview_mode" "notification_preview_mode" DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_workspace_id_profile_id_pk" PRIMARY KEY("workspace_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_intent_id_notification_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."notification_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_intents" ADD CONSTRAINT "notification_intents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_intents" ADD CONSTRAINT "notification_intents_recipient_profile_id_profiles_id_fk" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_intents" ADD CONSTRAINT "notification_intents_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_intents" ADD CONSTRAINT "notification_intents_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_intent_idx" ON "notification_deliveries" USING btree ("intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_intents_open_dedupe_idx" ON "notification_intents" USING btree ("workspace_id","recipient_profile_id","dedupe_key") WHERE "notification_intents"."status" in ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "notification_intents_due_idx" ON "notification_intents" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "notification_intents_recipient_idx" ON "notification_intents" USING btree ("workspace_id","recipient_profile_id");--> statement-breakpoint
CREATE INDEX "notification_intents_plan_idx" ON "notification_intents" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_profile_idx" ON "push_subscriptions" USING btree ("workspace_id","profile_id");