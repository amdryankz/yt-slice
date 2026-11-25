export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { db, clips } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { deleteClipFiles } from '@/lib/storage';

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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [clip] = await db.delete(clips).where(eq(clips.id, id))
      .returning({ clipPath: clips.clipPath, thumbnailPath: clips.thumbnailPath });

    if (!clip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    await deleteClipFiles(clip);

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
    
    const updateData: Partial<Pick<typeof clips.$inferInsert, 'title' | 'caption' | 'captionEn'>> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.caption !== undefined) updateData.caption = body.caption;
    if (body.captionEn !== undefined) {
      if (typeof body.captionEn !== 'string' || !body.captionEn.trim()) {
        return NextResponse.json({ error: 'English caption must be non-empty text' }, { status: 400 });
      }
      updateData.captionEn = body.captionEn;
    }

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
