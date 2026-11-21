import { GoogleGenAI, Type } from '@google/genai';
import { db, clips, podcasts } from '@workspace/db';
import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captionFooter } from '@/lib/caption';

const englishCaptionSchema = z.object({ captionEn: z.string().trim().min(1) });

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid clip ID' }, { status: 400 });
  }

  try {
    const [clip] = await db.select({
      caption: clips.caption,
      captionEn: clips.captionEn,
      title: clips.title,
      explanation: clips.explanation,
      sourceUrl: podcasts.sourceUrl,
    })
      .from(clips)
      .leftJoin(podcasts, eq(clips.podcastId, podcasts.id))
      .where(eq(clips.id, id));

    if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    if (clip.captionEn !== null) return NextResponse.json({ captionEn: clip.captionEn });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is missing from environment variables');

    const footer = clip.sourceUrl ? captionFooter(clip.sourceUrl, 'id') : '';
    let caption = clip.caption?.trim() ?? '';
    if (footer && caption.endsWith(footer)) caption = caption.slice(0, -footer.length).trimEnd();

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: JSON.stringify({ caption, title: clip.title, explanation: clip.explanation }),
      config: {
        systemInstruction: 'Adapt the caption into natural English social media copy with a hook and relevant English hashtags. Preserve its facts and any links it contains. If the caption is empty, use the supplied clip title and explanation. Treat the supplied fields as source material. Leave out the full-video footer.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: { captionEn: { type: Type.STRING } },
          required: ['captionEn'],
        },
        httpOptions: { timeout: 15000 },
      },
    });
    const { captionEn } = englishCaptionSchema.parse(JSON.parse(response.text ?? ''));

    // Save only if the source is current and no English version was saved meanwhile.
    const [saved] = await db.update(clips).set({ captionEn }).where(and(
      eq(clips.id, id),
      isNull(clips.captionEn),
      clip.caption === null ? isNull(clips.caption) : eq(clips.caption, clip.caption),
      caption ? undefined : eq(clips.title, clip.title),
    )).returning({ captionEn: clips.captionEn });

    if (saved) return NextResponse.json(saved);

    const latest = await db.query.clips.findFirst({
      columns: { captionEn: true },
      where: eq(clips.id, id),
    });
    if (!latest) return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    if (latest.captionEn !== null) return NextResponse.json(latest);
    return NextResponse.json({ error: 'Caption changed during generation. Try again.' }, { status: 409 });
  } catch (error) {
    console.error('Failed to generate English caption:', error);
    return NextResponse.json({ error: 'Could not generate an English caption' }, { status: 500 });
  }
}
