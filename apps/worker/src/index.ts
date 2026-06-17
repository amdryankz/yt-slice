import './env';
import fs from 'fs/promises';
import os from 'os';
import path, { join } from 'path';
import { Worker, Job } from 'bullmq';
import { connection, type AnyJobPayload, type VideoJobPayload, type CutClipJobPayload } from '@workspace/jobs';
import { db, podcasts, clips } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { downloadAudio, getAudioDuration } from './lib/downloader';
import { transcribeAudio } from './lib/transcriber';
import { analyzeTranscript } from './lib/gemini';
import { cutVideoSegment } from './lib/clipper';
import { uploadFile } from './lib/storage';

if (!process.env.DEEPGRAM_API_KEY) {
  console.warn('WARNING: DEEPGRAM_API_KEY is missing from environment variables.');
}

console.log('Worker is starting up and connecting to Redis at', connection.host, connection.port);

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

        console.log(`[Job ${job.id}] Analyzing transcript directly with Gemini...`);
        const suggestions = await analyzeTranscript(transcript, durationSeconds);
        console.log(`[Job ${job.id}] Gemini Analysis Complete. Suggested clips:`);
        console.log(JSON.stringify(suggestions, null, 2));
        
        console.log(`[Job ${job.id}] Saving clips to the database...`);
        if (suggestions.length > 0) {
          await db.insert(clips).values(
            suggestions.map((suggestion) => ({
              podcastId,
              title: suggestion.title,
              startTime: suggestion.startTime,
              endTime: suggestion.endTime,
              viralityScore: suggestion.viralityScore,
              explanation: suggestion.explanation,
              caption: suggestion.caption,
              status: 'draft',
            }))
          );
        }
        
        // Update the database status to 'completed'
        await db
          .update(podcasts)
          .set({ status: 'completed' })
          .where(eq(podcasts.id, podcastId));
          
        console.log(`[Job ${job.id}] Completed processing podcast ${podcastId}`);
        return { success: true, audioPath, suggestionsCount: suggestions.length };
      } finally {
        // Cleanup temporary directory to prevent disk space leaks
        console.log(`[Job ${job.id}] Cleaning up temporary directory ${workDir}...`);
        await fs.rm(workDir, { recursive: true, force: true }).catch((err) => {
          console.error(`[Job ${job.id}] Failed to cleanup directory:`, err);
        });
      }
    } else if (job.name === 'cut-clip') {
      const { clipId } = job.data as CutClipJobPayload;
      
      console.log(`[Job ${job.id}] Cutting clip ${clipId}`);
      
      try {
        const clip = await db.query.clips.findFirst({
          where: eq(clips.id, clipId),
        });
        
        if (!clip) {
          throw new Error(`Clip ${clipId} not found in database.`);
        }
        
        const podcast = await db.query.podcasts.findFirst({
          where: eq(podcasts.id, clip.podcastId!),
        });
        
        if (!podcast) {
          throw new Error(`Podcast ${clip.podcastId} not found for clip ${clipId}.`);
        }
        
        const tmpDir = os.tmpdir();
        const fileName = `clip-${clip.id}.mp4`;
        const outputPath = path.join(tmpDir, fileName);
        
        console.log(`[Job ${job.id}] Downloading and formatting video segment to ${outputPath}...`);
        
        await cutVideoSegment(podcast.sourceUrl, clip.startTime, clip.endTime, outputPath, job.data.format as any, job.data.watermarkText);
        
        console.log(`[Job ${job.id}] Cut successful! Uploading to S3...`);
        
        const publicUrl = await uploadFile(outputPath, fileName);
        console.log(`[Job ${job.id}] Upload successful: ${publicUrl}`);
        
        await db
          .update(clips)
          .set({ status: 'completed', clipPath: publicUrl })
          .where(eq(clips.id, clipId));
          
        // Cleanup temp files
        await fs.unlink(outputPath).catch(() => {});
        await fs.unlink(`${outputPath}.tmp.mp4`).catch(() => {});
        await fs.unlink(`${outputPath}.tmp.ass`).catch(() => {});
          
        return { success: true, clipPath: publicUrl };
      } catch (error: any) {
        console.error(`[Job ${job.id}] Failed to cut clip:`, error);
        await db
          .update(clips)
          .set({ status: 'failed' })
          .where(eq(clips.id, clipId));
        throw error;
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

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} has completed successfully!`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} has failed with error: ${err.message}`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
});
