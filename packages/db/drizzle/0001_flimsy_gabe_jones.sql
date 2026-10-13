ALTER TABLE "clips" ADD COLUMN IF NOT EXISTS "error_message" text;--> statement-breakpoint
ALTER TABLE "podcasts" ADD COLUMN IF NOT EXISTS "transcript" text;--> statement-breakpoint
ALTER TABLE "podcasts" ADD COLUMN IF NOT EXISTS "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "podcasts" ADD COLUMN IF NOT EXISTS "error_message" text;
