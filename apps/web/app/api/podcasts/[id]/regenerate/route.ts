export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { db, podcasts } from '@workspace/db';
import { eq } from 'drizzle-orm';
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

    if (!podcast.transcript || !podcast.durationSeconds) {
      return NextResponse.json({ error: 'Podcast does not have transcript data. Regeneration only works for newly created podcasts.' }, { status: 400 });
    }

    await videoQueue.add('regenerate-clips', { podcastId }, {
      deduplication: { id: `regenerate-${podcastId}` },
    });

    return NextResponse.json({ message: 'Regeneration started' }, { status: 200 });
  } catch (error) {
    console.error('Failed to start regeneration:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
