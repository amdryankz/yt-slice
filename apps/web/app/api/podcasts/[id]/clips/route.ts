export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { db, clips, podcasts } from '@workspace/db';
import { eq } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: podcastId } = await params;
    const allClips = await db.query.clips.findMany({
      where: eq(clips.podcastId, podcastId),
      orderBy: (clips, { asc }) => [asc(clips.startTime)]
    });
    return NextResponse.json({ clips: allClips }, { status: 200 });
  } catch (error) {
    console.error('Failed to fetch clips:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: podcastId } = await params;
    const body = await req.json();

    const { startTime, endTime } = body;

    if (typeof startTime !== 'number' || typeof endTime !== 'number') {
      return NextResponse.json({ error: 'Valid startTime and endTime are required' }, { status: 400 });
    }

    // Check if podcast exists
    const podcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.id, podcastId),
    });

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    // Insert new manual clip
    const [newClip] = await db.insert(clips).values({
      podcastId: podcastId,
      title: 'Klip Custom Manual',
      startTime,
      endTime,
      viralityScore: 100,
      explanation: 'Klip ditambahkan secara manual oleh pengguna.',
      caption: 'Tonton momen menarik ini! #podcast #indonesia',
      status: 'pending',
    }).returning();

    return NextResponse.json({ success: true, clip: newClip }, { status: 201 });
  } catch (error) {
    console.error('Failed to create manual clip:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
