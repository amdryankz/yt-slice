import { NextResponse } from 'next/server';
import { db, clips } from '@workspace/db';
import { videoQueue } from '@workspace/jobs';
import { eq } from 'drizzle-orm';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let customStartTime, customEndTime, format = 'original', watermarkText;
    try {
      const body = await req.json();
      customStartTime = body.startTime;
      customEndTime = body.endTime;
      if (body.format) format = body.format;
      if (body.watermarkText) watermarkText = body.watermarkText;
    } catch (e) {
      // Ignore if no body
    }

    // Verify clip exists
    const clip = await db.query.clips.findFirst({
      where: eq(clips.id, id),
    });

    if (!clip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const updatePayload: any = { status: 'processing' };
    if (typeof customStartTime === 'number') updatePayload.startTime = customStartTime;
    if (typeof customEndTime === 'number') updatePayload.endTime = customEndTime;

    // Update status to processing (and optionally new timings)
    await db
      .update(clips)
      .set(updatePayload)
      .where(eq(clips.id, id));

    // Enqueue a new job
    await videoQueue.add('cut-clip', {
      clipId: clip.id,
      format: format as any,
      watermarkText,
    });

    return NextResponse.json({ success: true, message: 'Job started' }, { status: 200 });
  } catch (error) {
    console.error('Failed to trigger clip cut:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
