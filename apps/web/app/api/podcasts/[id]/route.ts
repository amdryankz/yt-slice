export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { db, podcasts, clips } from '@workspace/db';
import { eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const podcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.id, id),
    });

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    // Fetch all associated clips to delete their physical files
    const associatedClips = await db.query.clips.findMany({
      where: eq(clips.podcastId, id),
    });

    // Delete clip files
    for (const clip of associatedClips) {
      if (clip.clipPath) {
        if (clip.clipPath.startsWith('http')) {
          const { deleteFile } = await import('../../../../lib/storage');
          await deleteFile(clip.clipPath);
        } else {
          const filePath = path.join(process.cwd(), "public", clip.clipPath);
          try {
            await fs.unlink(filePath);
          } catch (err: any) {
            if (err.code !== 'ENOENT') {
              console.error(`Failed to delete file ${filePath}:`, err);
            }
          }
        }
      }
    }

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

    // Delete podcast from db (will cascade delete clips in db)
    await db.delete(podcasts).where(eq(podcasts.id, id));

    return NextResponse.json({ success: true, message: 'Podcast deleted' }, { status: 200 });
  } catch (error) {
    console.error('Failed to delete podcast:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
