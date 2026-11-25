import './env';
import { randomUUID } from 'node:crypto';
import fs from 'fs/promises';
import path, { join } from 'path';
import { Worker, Job } from 'bullmq';
import { connection, videoQueue, notifyPodcastChanged, type AnyJobPayload, type VideoJobPayload, type CutClipJobPayload, type RegenerateJobPayload } from '@workspace/jobs';
import { db, podcasts, clips } from '@workspace/db';
import { eq, lt, isNull, isNotNull, and, ne } from 'drizzle-orm';
import { downloadAudio, followSpeakerSourceError, getAudioDuration } from './lib/downloader';
import { transcribeAudio } from './lib/transcriber';
import { analyzeTranscript, type ClipSuggestion } from './lib/gemini';
import { cutVideoSegment, generateThumbnail } from './lib/clipper';
import { deleteUploadedFile, uploadFile } from './lib/storage';

if (!process.env.DEEPGRAM_API_KEY) {
  console.warn('WARNING: DEEPGRAM_API_KEY is missing from environment variables.');
}

console.log('Worker is starting up and connecting to Redis at', connection.host, connection.port);

async function saveClipSuggestions(
  podcast: Pick<typeof podcasts.$inferSelect, 'id' | 'sourceUrl' | 'contentLanguage'>,
  suggestions: ClipSuggestion[],
  replaceDrafts = false,
) {
  const rows = suggestions.map((suggestion) => {
    let caption = suggestion.caption;
    if (podcast.contentLanguage === null && !caption?.includes(podcast.sourceUrl)) {
      const footer = `📺 Tonton video selengkapnya:\n${podcast.sourceUrl}`;
      caption = caption ? `${caption.trim()}\n\n${footer}` : footer;
    }

    return { ...suggestion, caption, podcastId: podcast.id, status: 'draft' };
  });

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(podcasts)
      .set({ status: 'completed', errorMessage: null })
      .where(and(eq(podcasts.id, podcast.id), replaceDrafts ? undefined : ne(podcasts.status, 'completed')))
      .returning({ id: podcasts.id });
    if (!updated) return false;

    if (replaceDrafts) {
      await tx.delete(clips).where(and(
        eq(clips.podcastId, podcast.id),
        eq(clips.status, 'draft'),
      ));
    }
    await tx.insert(clips).values(rows);
    return true;
  });
}

function activeExport({ clipId, exportAttemptId }: CutClipJobPayload) {
  return and(
    eq(clips.id, clipId),
    eq(clips.status, 'processing'),
    exportAttemptId ? eq(clips.exportAttemptId, exportAttemptId) : isNull(clips.exportAttemptId),
  );
}

function exportFailureMessage(reason?: string) {
  return reason === followSpeakerSourceError
    ? followSpeakerSourceError
    : 'The export could not be completed. Try exporting again.';
}

async function updateActiveExport(exportRequest: CutClipJobPayload, values: Partial<typeof clips.$inferInsert>) {
  const [updated] = await db.update(clips).set(values).where(activeExport(exportRequest))
    .returning({ podcastId: clips.podcastId });
  if (updated?.podcastId) void notifyPodcastChanged(updated.podcastId);
  return updated;
}

const worker = new Worker(
  'video-processing',
  async (job: Job<AnyJobPayload>) => {
    if (job.name === 'process-video') {
      const { podcastId, sourceUrl } = job.data as VideoJobPayload;
      
      console.log(`[Job ${job.id}] Processing podcast ${podcastId} from ${sourceUrl}`);
      
      const workDir = join('/tmp/clip-ai', `job-${job.id}`);
      
      try {
        await fs.mkdir(workDir, { recursive: true });
        
        console.log(`[Job ${job.id}] Downloading audio to ${workDir}...`);
        const audioPath = await downloadAudio(sourceUrl, workDir);
        console.log(`[Job ${job.id}] Download successful! File saved at: ${audioPath}`);
        
        console.log(`[Job ${job.id}] Calculating exact audio duration...`);
        const durationSeconds = await getAudioDuration(audioPath);
        console.log(`[Job ${job.id}] Duration is ${durationSeconds} seconds.`);

        console.log(`[Job ${job.id}] Transcribing audio with Deepgram...`);
        const transcript = await transcribeAudio(audioPath);
        console.log(`[Job ${job.id}] Transcription successful. Length: ${transcript.length} characters.`);

        // Save transcript to database for future regeneration
        const [podcast] = await db.update(podcasts).set({
          transcript: transcript,
          durationSeconds: Math.floor(durationSeconds)
        }).where(and(eq(podcasts.id, podcastId), ne(podcasts.status, 'completed'))).returning({
          id: podcasts.id,
          sourceUrl: podcasts.sourceUrl,
          contentLanguage: podcasts.contentLanguage,
        });
        if (!podcast) return { skipped: true, reason: 'Podcast was deleted or already processed' };

        console.log(`[Job ${job.id}] Analyzing transcript directly with Gemini...`);
        const suggestions = await analyzeTranscript(transcript, durationSeconds, podcast.contentLanguage);
        console.log(`[Job ${job.id}] Gemini Analysis Complete. Suggested clips:`);
        console.log(JSON.stringify(suggestions, null, 2));
        
        console.log(`[Job ${job.id}] Saving clips to the database...`);
        if (!await saveClipSuggestions(podcast, suggestions)) {
          return { skipped: true, reason: 'Podcast was deleted or already processed' };
        }
        await notifyPodcastChanged(podcastId);
          
        console.log(`[Job ${job.id}] Completed processing podcast ${podcastId}`);
        return { success: true, audioPath, suggestionsCount: suggestions.length };
      } finally {
        // Cleanup temporary directory to prevent disk space leaks
        console.log(`[Job ${job.id}] Cleaning up temporary directory ${workDir}...`);
        await fs.rm(workDir, { recursive: true, force: true }).catch((err) => {
          console.error(`[Job ${job.id}] Failed to cleanup directory:`, err);
        });
      }
    } else if (job.name === 'regenerate-clips') {
      const { podcastId } = job.data as RegenerateJobPayload;
      console.log(`[Job ${job.id}] Regenerating clips for podcast ${podcastId}`);
      
      const podcast = await db.query.podcasts.findFirst({
        where: eq(podcasts.id, podcastId),
      });

      if (!podcast || !podcast.transcript || !podcast.durationSeconds) {
        throw new Error(`Podcast ${podcastId} not found, or missing transcript/duration data.`);
      }

      console.log(`[Job ${job.id}] Analyzing existing transcript directly with Gemini...`);
      const suggestions = await analyzeTranscript(podcast.transcript, podcast.durationSeconds, podcast.contentLanguage);
      
      console.log(`[Job ${job.id}] Saving regenerated clips to the database...`);
      if (!await saveClipSuggestions(podcast, suggestions, true)) {
        return { skipped: true, reason: 'Podcast deleted mid-processing' };
      }
      await notifyPodcastChanged(podcastId);
      console.log(`[Job ${job.id}] Completed regenerating clips for ${podcastId}`);
      return { success: true, suggestionsCount: suggestions.length };
      
    } else if (job.name === 'cut-clip') {
      const exportRequest = job.data as CutClipJobPayload;
      const { clipId, exportAttemptId, format = 'original', watermarkText } = exportRequest;
      
      console.log(`[Job ${job.id}] Cutting clip ${clipId}`);
      let workDir: string | undefined;
      let uploadedKeys: string[] = [];
      
      try {
        // Wait for the cut request to commit its timings after enqueueing.
        const [clip] = await db.select().from(clips).where(eq(clips.id, clipId)).for('update');
        if (!clip || clip.status !== 'processing' || clip.exportAttemptId !== (exportAttemptId ?? null)) {
          return { skipped: true };
        }
        
        const podcast = await db.query.podcasts.findFirst({
          where: eq(podcasts.id, clip.podcastId!),
        });
        
        if (!podcast) {
          throw new Error(`Podcast ${clip.podcastId} not found for clip ${clipId}.`);
        }

        const tmpDir = '/tmp/clip-ai';
        await fs.mkdir(tmpDir, { recursive: true });
        workDir = await fs.mkdtemp(path.join(tmpDir, 'cut-'));
        const outputKey = `clip-${clip.id}-${randomUUID()}`;
        const fileName = `${outputKey}.mp4`;
        const outputPath = path.join(workDir, fileName);
        
        console.log(`[Job ${job.id}] Downloading and formatting video segment to ${outputPath}...`);
        const started = await updateActiveExport(exportRequest, {
          exportStage: 'downloading', exportFormat: format, exportWatermarkText: watermarkText ?? null,
        });
        if (!started) return { skipped: true };
        const speakerFilter = await cutVideoSegment(podcast.sourceUrl, clip.startTime, clip.endTime, outputPath, format, watermarkText, async (exportStage) => {
          await updateActiveExport(exportRequest, { exportStage });
        });
        
        console.log(`[Job ${job.id}] Cut successful! Generating thumbnail...`);
        const thumbnailPath = `${outputPath}.thumb.jpg`;
        const thumbFileName = `${outputKey}-thumb.jpg`;
        // Pass the raw video (.tmp.mp4) before subtitles are added, and pass the format
        await generateThumbnail(`${outputPath}.tmp.mp4`, thumbnailPath, clip.title, format, speakerFilter);
        
        console.log(`[Job ${job.id}] Uploading to S3...`);
        const uploading = await updateActiveExport(exportRequest, { exportStage: 'uploading' });
        if (!uploading) return { skipped: true };
        uploadedKeys.push(fileName);
        const publicUrl = await uploadFile(outputPath, fileName);
        uploadedKeys.push(thumbFileName);
        const thumbPublicUrl = await uploadFile(thumbnailPath, thumbFileName, 'image/jpeg');
        console.log(`[Job ${job.id}] Upload successful: ${publicUrl}`);
        
        // A database connection loss can hide a successful commit. Preserve the files in that case.
        uploadedKeys = [];
        const completed = await updateActiveExport(exportRequest, {
          status: 'completed', exportStage: null, errorMessage: null, clipPath: publicUrl, thumbnailPath: thumbPublicUrl,
        });
        if (!completed) {
          uploadedKeys = [fileName, thumbFileName];
          return { skipped: true };
        }

        const replacedKeys = [clip.clipPath, clip.thumbnailPath].flatMap((url) => {
          const key = url?.startsWith('http') ? url.split('/').at(-1) : undefined;
          return key ? [key] : [];
        });
        await Promise.all(replacedKeys.map(deleteUploadedFile));
          
        return { success: true, clipPath: publicUrl, thumbnailPath: thumbPublicUrl };
      } finally {
        await Promise.all(uploadedKeys.map(deleteUploadedFile));
        if (workDir) {
          await fs.rm(workDir, { recursive: true, force: true }).catch((error) => {
            console.warn(`[Job ${job.id}] Failed to clean up ${workDir}:`, error);
          });
        }
      }
    } else if (job.name === 'cleanup-temp-files') {
      console.log(`[Job ${job.id}] Running scheduled auto-cleanup...`);
      const baseTmpDir = '/tmp/clip-ai';
      try {
        const files = await fs.readdir(baseTmpDir);
        const now = Date.now();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        
        let deletedCount = 0;
        for (const file of files) {
          const filePath = join(baseTmpDir, file);
          const stats = await fs.stat(filePath);
          if (now - stats.mtimeMs > TWENTY_FOUR_HOURS) {
            await fs.rm(filePath, { recursive: true, force: true });
            deletedCount++;
          }
        }
        
        // Remove old suggestions while keeping failed exports available to retry.
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        const sevenDaysAgo = new Date(now - SEVEN_DAYS);
        
        const deletedClips = await db.delete(clips).where(
          and(
            lt(clips.createdAt, sevenDaysAgo),
            eq(clips.status, 'draft')
          )
        ).returning();
        
        console.log(`[Job ${job.id}] Auto-cleanup completed. Deleted ${deletedCount} temp folders, ${deletedClips.length} old clips.`);
        return { success: true, deletedCount, deletedClipsCount: deletedClips.length };
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.error(`[Job ${job.id}] Auto-cleanup failed:`, err);
          throw err;
        }
        return { success: true, deletedCount: 0, deletedClipsCount: 0 };
      }
    } else {
      throw new Error(`Unknown job name: ${job.name}`);
    }
  },
  { 
    connection,
    concurrency: 1
  }
);

// Schedule the auto-cleanup job
async function scheduleCleanup() {
  await videoQueue.add('cleanup-temp-files', {}, {
    repeat: { pattern: '0 3 * * *' }, // Run every day at 3:00 AM
    jobId: 'system-auto-cleanup', // Ensure we only have one repeated job
  });
  console.log('Scheduled system auto-cleanup job at 03:00 AM.');
}
scheduleCleanup().catch(console.error);

let checkingExports = false;
async function recoverFinishedExports() {
  if (checkingExports) return;
  checkingExports = true;
  try {
    const active = await db.select({ clipId: clips.id, exportAttemptId: clips.exportAttemptId })
      .from(clips).where(and(eq(clips.status, 'processing'), isNotNull(clips.exportAttemptId)));
    for (const { clipId, exportAttemptId } of active) {
      if (!exportAttemptId) continue;
      const state = await videoQueue.getJobState(exportAttemptId);
      if (state !== 'failed' && state !== 'completed' && state !== 'unknown') continue;
      const reason = state === 'failed' ? (await videoQueue.getJob(exportAttemptId))?.failedReason : undefined;
      await updateActiveExport({ clipId, exportAttemptId }, {
        status: 'failed', exportStage: null, errorMessage: exportFailureMessage(reason),
      });
    }
  } catch (error) {
    console.error('[Worker] Could not reconcile export status:', error);
  } finally {
    checkingExports = false;
  }
}

const exportRecoveryTimer = setInterval(() => void recoverFinishedExports(), 30_000);
void recoverFinishedExports();

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} has completed successfully!`);
});

worker.on('failed', async (job, err) => {
  console.error(`[Worker] Job ${job?.id} (${job?.name}) has failed with error: ${err.message}`);
  
  if (!job || (!job.finishedOn && job.name !== 'cut-clip')) return;

  const errorMessage = err.message || 'Unknown error occurred';

  try {
    if (job.name === 'process-video') {
      const { podcastId } = job.data as VideoJobPayload;
      await db.update(podcasts).set({ status: 'failed', errorMessage })
        .where(and(eq(podcasts.id, podcastId), ne(podcasts.status, 'completed')));
      await notifyPodcastChanged(podcastId);
    } else if (job.name === 'regenerate-clips') {
      const { podcastId } = job.data as RegenerateJobPayload;
      // We can also save the error to the podcast for regeneration failures
      await db.update(podcasts).set({ status: 'failed', errorMessage }).where(eq(podcasts.id, podcastId));
      await notifyPodcastChanged(podcastId);
    } else if (job.name === 'cut-clip') {
      const exportRequest = job.data as CutClipJobPayload;
      const { format = 'original', watermarkText } = exportRequest;
      await updateActiveExport(exportRequest, job.finishedOn ? {
        status: 'failed',
        errorMessage: exportFailureMessage(errorMessage),
        exportStage: null,
        exportFormat: format,
        exportWatermarkText: watermarkText ?? null,
      } : { exportStage: 'retrying' });
    }
  } catch (dbErr) {
    console.error(`[Worker] Failed to update database state after job failure:`, dbErr);
  }
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  clearInterval(exportRecoveryTimer);
  await worker.close();
  process.exit(0);
});
