export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { db, clips } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id: clipId } = await props.params;
    if (!clipId) return new NextResponse('Missing ID', { status: 400 });

    const clip = await db.query.clips.findFirst({
      where: eq(clips.id, clipId),
    });

    if (!clip || !clip.thumbnailPath) {
      return new NextResponse('Thumbnail not found or not rendered', { status: 404 });
    }

    // Extract filename from the public URL (e.g. https://pub-....r2.dev/clip-uuid-thumb.jpg)
    const key = clip.thumbnailPath.split('/').pop();
    if (!key) {
      return new NextResponse('Invalid clip path', { status: 400 });
    }

    const url = new URL(req.url);
    const isDownload = url.searchParams.get('download') === '1';

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: isDownload ? `attachment; filename="${key}"` : undefined
    });

    // Generate a presigned URL valid for 1 hour
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // Redirect the browser to the presigned URL
    return NextResponse.redirect(presignedUrl);
  } catch (err) {
    console.error('[Video Proxy] Failed to proxy video:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
