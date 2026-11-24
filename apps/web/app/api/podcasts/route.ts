import { NextResponse } from 'next/server';
import { db, podcasts } from '@workspace/db';
import { contentLanguages } from '@workspace/db/content-language';
import { videoQueue } from '@workspace/jobs';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const podcastSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  sourceUrl: z.string().url('Must be a valid URL'),
  contentLanguage: z.enum(contentLanguages, 'Choose English or Bahasa Indonesia'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = podcastSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { title, sourceUrl, contentLanguage } = parsed.data;

    // Insert into DB
    const [insertedPodcast] = await db
      .insert(podcasts)
      .values({
        title,
        sourceUrl,
        contentLanguage,
        status: 'processing',
      })
      .returning({ id: podcasts.id });
      
    if (!insertedPodcast) {
      throw new Error('Failed to insert podcast');
    }

    try {
      await videoQueue.add('process-video', { podcastId: insertedPodcast.id, sourceUrl });
    } catch (error) {
      console.error('Failed to queue podcast:', error);
      const errorMessage = 'The processing queue was unavailable. Please try creating the project again.';
      await db.update(podcasts).set({ status: 'failed', errorMessage })
        .where(and(eq(podcasts.id, insertedPodcast.id), eq(podcasts.status, 'processing')));
      return NextResponse.json({ error: errorMessage }, { status: 503 });
    }

    return NextResponse.json({ id: insertedPodcast.id, success: true }, { status: 200 });
  } catch (error) {
    console.error('Failed to submit podcast:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
