import { NextResponse } from 'next/server';
import { db, podcasts } from '@workspace/db';
import { videoQueue } from '@workspace/jobs';
import { z } from 'zod';

const podcastSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  sourceUrl: z.string().url('Must be a valid URL'),
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

    const { title, sourceUrl } = parsed.data;

    // Insert into DB
    const [insertedPodcast] = await db
      .insert(podcasts)
      .values({
        title,
        sourceUrl,
        status: 'processing',
      })
      .returning({ id: podcasts.id });
      
    if (!insertedPodcast) {
      throw new Error('Failed to insert podcast');
    }

    // Add to BullMQ
    await videoQueue.add('process-video', {
      podcastId: insertedPodcast.id,
      sourceUrl,
    });

    return NextResponse.json({ id: insertedPodcast.id, success: true }, { status: 200 });
  } catch (error) {
    console.error('Failed to submit podcast:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
