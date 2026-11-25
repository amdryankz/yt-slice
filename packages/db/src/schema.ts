import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, integer, uuid } from 'drizzle-orm/pg-core';
import { contentLanguages } from './content-language';

export const podcasts = pgTable('podcasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  sourceUrl: text('source_url').notNull(),
  contentLanguage: text('content_language', { enum: contentLanguages }),
  videoPath: text('video_path'),
  transcript: text('transcript'),
  durationSeconds: integer('duration_seconds'),
  status: text('status').default('processing').notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  check('podcasts_content_language_check', sql`${table.contentLanguage} in ('en', 'id')`),
]);

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
  captionEn: text('caption_en'),
  status: text('status').default('draft').notNull(),
  exportStage: text('export_stage', { enum: ['queued', 'downloading', 'transcribing', 'rendering', 'uploading', 'retrying'] }),
  exportFormat: text('export_format'),
  exportWatermarkText: text('export_watermark_text'),
  exportAttemptId: uuid('export_attempt_id'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
