CREATE TABLE "clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"podcast_id" uuid,
	"title" text NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"clip_path" text,
	"virality_score" integer,
	"explanation" text,
	"caption" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "podcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"video_path" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;