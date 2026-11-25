ALTER TABLE "clips" ADD COLUMN "export_stage" text;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "export_format" text;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "export_watermark_text" text;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "export_attempt_id" uuid;