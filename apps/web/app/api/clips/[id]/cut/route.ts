export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { db, clips } from '@workspace/db';
import { videoQueue, type CutClipJobPayload } from '@workspace/jobs';
import { isClipFormat } from '@workspace/jobs/clip-format';
import { eq } from 'drizzle-orm';

function validTime(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 2_147_483_647;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const format: unknown = body?.format ?? 'original';
    if (!isClipFormat(format) || (format === 'speaker-crop' && process.env.SPEAKER_CROP_ENABLED !== 'true')) {
      return NextResponse.json({ error: 'Video format is unavailable' }, { status: 400 });
    }

    return await db.transaction(async (tx) => {
      const [clip] = await tx.select().from(clips).where(eq(clips.id, id)).for('update');
      if (!clip) {
        return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
      }
      if (clip.status === 'processing') {
        return NextResponse.json({ error: 'This clip is already exporting' }, { status: 409 });
      }

      const startTime = body?.startTime ?? clip.startTime;
      const endTime = body?.endTime ?? clip.endTime;
      if (!validTime(startTime) || !validTime(endTime) || endTime <= startTime) {
        return NextResponse.json({ error: 'Choose a valid clip start and end time' }, { status: 400 });
      }

      await tx.update(clips).set({ status: 'processing', errorMessage: null, startTime, endTime }).where(eq(clips.id, id));

      const payload: CutClipJobPayload = {
        clipId: clip.id,
        format,
        watermarkText: typeof body?.watermarkText === 'string' ? body.watermarkText : undefined,
      };
      await videoQueue.add('cut-clip', payload);

      return NextResponse.json({ success: true, message: 'Job started' }, { status: 200 });
    });
  } catch (error) {
    console.error('Failed to trigger clip cut:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
