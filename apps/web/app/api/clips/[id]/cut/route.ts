export const dynamic = "force-dynamic";
import { randomUUID } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { db, clips } from '@workspace/db';
import { notifyPodcastChanged, videoQueue, type CutClipJobPayload } from '@workspace/jobs';
import { isClipFormat } from '@workspace/jobs/clip-format';
import { eq } from 'drizzle-orm';

function validTime(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 2_147_483_647;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const retry = body?.retry === true;

    const result = await db.transaction(async (tx) => {
      const [clip] = await tx.select().from(clips).where(eq(clips.id, id)).for('update');
      if (!clip) {
        return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
      }
      if (clip.status === 'processing') {
        return NextResponse.json({ error: 'This clip is already exporting' }, { status: 409 });
      }
      if (retry && (clip.status !== 'failed' || !clip.exportFormat)) {
        return NextResponse.json({ error: 'This clip has no failed export with saved settings' }, { status: 409 });
      }

      const format: unknown = retry ? clip.exportFormat : body?.format ?? 'original';
      if (!isClipFormat(format) || (format === 'speaker-crop' && process.env.SPEAKER_CROP_ENABLED !== 'true')) {
        return NextResponse.json({ error: 'Video format is unavailable' }, { status: 400 });
      }

      const startTime = retry ? clip.startTime : body?.startTime ?? clip.startTime;
      const endTime = retry ? clip.endTime : body?.endTime ?? clip.endTime;
      if (!validTime(startTime) || !validTime(endTime) || endTime <= startTime) {
        return NextResponse.json({ error: 'Choose a valid clip start and end time' }, { status: 400 });
      }

      const watermarkText = retry ? clip.exportWatermarkText : typeof body?.watermarkText === 'string' ? body.watermarkText : null;
      const exportAttemptId = randomUUID();
      await tx.update(clips).set({
        status: 'processing',
        errorMessage: null,
        startTime,
        endTime,
        exportStage: 'queued',
        exportFormat: format,
        exportWatermarkText: watermarkText,
        exportAttemptId,
      }).where(eq(clips.id, id));

      const payload: CutClipJobPayload = {
        clipId: clip.id,
        exportAttemptId,
        format,
        watermarkText: watermarkText ?? undefined,
      };
      await videoQueue.add('cut-clip', payload, { jobId: exportAttemptId });

      return { podcastId: clip.podcastId };
    });
    if (result instanceof NextResponse) return result;
    const { podcastId } = result;
    if (podcastId) after(() => notifyPodcastChanged(podcastId));

    return NextResponse.json({ success: true, message: 'Job started' }, { status: 200 });
  } catch (error) {
    console.error('Failed to trigger clip cut:', error);
    return NextResponse.json({ error: 'Could not queue this export. Please try again.' }, { status: 500 });
  }
}
