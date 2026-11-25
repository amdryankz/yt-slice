import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export async function deleteFile(fileUrl: string) {
  try {
    if (!fileUrl) return;
    const key = fileUrl.split('/').pop();
    if (!key) return;

    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });
    
    await s3Client.send(command, { abortSignal: AbortSignal.timeout(5_000) });
    console.log(`[Storage] Deleted ${key} from S3.`);
  } catch (err) {
    console.error(`[Storage] Failed to delete ${fileUrl} from S3:`, err);
  }
}

export async function deleteClipFiles(clip: { clipPath: string | null; thumbnailPath: string | null }) {
  const publicDir = path.join(process.cwd(), 'public');
  await Promise.all([clip.clipPath, clip.thumbnailPath].map(async (file) => {
    if (!file) return;
    if (file.startsWith('http')) {
      await deleteFile(file);
      return;
    }
    const filePath = path.join(publicDir, file);
    if (!filePath.startsWith(publicDir + path.sep)) return;
    await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') console.error(`Failed to delete file ${filePath}:`, error);
    });
  }));
}
