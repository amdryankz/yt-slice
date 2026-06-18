export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { db, clips } from '@workspace/db';
import { eq } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const clip = await db.query.clips.findFirst({
      where: eq(clips.id, id),
    });

    if (!clip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    return NextResponse.json({ clip }, { status: 200 });
  } catch (error) {
    console.error('Failed to fetch clip:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import fs from 'node:fs/promises';
import path from 'node:path';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const clip = await db.query.clips.findFirst({
      where: eq(clips.id, id),
    });

    if (!clip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    // Physically delete the mp4 file if it exists
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

    await db.delete(clips).where(eq(clips.id, id));

    return NextResponse.json({ success: true, message: 'Clip deleted' }, { status: 200 });
  } catch (error) {
    console.error('Failed to delete clip:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.caption !== undefined) updateData.caption = body.caption;

    const [updatedClip] = await db
      .update(clips)
      .set(updateData)
      .where(eq(clips.id, id))
      .returning();

    if (!updatedClip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    return NextResponse.json({ clip: updatedClip }, { status: 200 });
  } catch (error) {
    console.error('Failed to update clip:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
