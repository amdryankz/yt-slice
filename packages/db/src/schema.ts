import { pgTable, text, timestamp, integer, uuid } from 'drizzle-orm/pg-core';

export const podcasts = pgTable('podcasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  sourceUrl: text('source_url').notNull(),
  videoPath: text('video_path'),
  transcript: text('transcript'),
  durationSeconds: integer('duration_seconds'),
  status: text('status').default('processing').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const clips = pgTable('clips', {
  id: uuid('id').primaryKey().defaultRandom(),
  podcastId: uuid('podcast_id')
    .references(() => podcasts.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  startTime: integer('start_time').notNull(),
  endTime: integer('end_time').notNull(),
  clipPath: text('clip_path'),
  thumbnailPath: text('thumbnail_path'),
  viralityScore: integer('virality_score'),
  explanation: text('explanation'),
  caption: text('caption'),
  status: text('status').default('draft').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
