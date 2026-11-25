export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { db, podcasts, clips } from '@workspace/db';
import { eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deleteClipFiles } from '@/lib/storage';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const deleted = await db.transaction(async (tx) => {
      const [podcast] = await tx.select({ videoPath: podcasts.videoPath }).from(podcasts)
        .where(eq(podcasts.id, id)).for('update');
      if (!podcast) return null;

      const clipFiles = await tx.select({ clipPath: clips.clipPath, thumbnailPath: clips.thumbnailPath })
        .from(clips).where(eq(clips.podcastId, id)).for('update');
      await tx.delete(podcasts).where(eq(podcasts.id, id));
      return { podcast, clipFiles };
    });

    if (!deleted) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    const { podcast, clipFiles } = deleted;
    for (const clip of clipFiles) await deleteClipFiles(clip);

    // Optionally delete the source video file if we store it locally (if videoPath exists)
    if (podcast.videoPath) {
      const videoFilePath = path.join(process.cwd(), "public", podcast.videoPath);
      try {
        await fs.unlink(videoFilePath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.error(`Failed to delete podcast video ${videoFilePath}:`, err);
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Podcast deleted' }, { status: 200 });
  } catch (error) {
    console.error('Failed to delete podcast:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
