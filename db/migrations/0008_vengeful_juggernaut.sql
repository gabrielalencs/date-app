ALTER TABLE "media" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_duration_positive" CHECK ("media"."duration_ms" is null or "media"."duration_ms" > 0);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_duration_iff_video" CHECK (("media"."mime_type" like 'video/%') = ("media"."duration_ms" is not null));