import { NextResponse } from 'next/server';
import { db, clips, podcasts } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { videoQueue } from '@workspace/jobs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: podcastId } = await params;

    // Check if the podcast has transcript data
    const podcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.id, podcastId),
    });

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    if (!podcast.transcript) {
      return NextResponse.json({ error: 'Podcast does not have transcript data. Regeneration only works for newly created podcasts.' }, { status: 400 });
    }

    // Delete all existing 'draft' and 'failed' clips for this podcast to clear out bad ideas
    // We keep 'completed' and 'processing' (if any cut-clip is still rendering)
    await db.delete(clips).where(
      and(
        eq(clips.podcastId, podcastId),
        eq(clips.status, 'draft')
      )
    );
    await db.delete(clips).where(
      and(
        eq(clips.podcastId, podcastId),
        eq(clips.status, 'failed')
      )
    );

    // Queue the regenerate job
    await videoQueue.add('regenerate-clips', {
      podcastId,
    });

    return NextResponse.json({ message: 'Regeneration started' }, { status: 200 });
  } catch (error) {
    console.error('Failed to start regeneration:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
