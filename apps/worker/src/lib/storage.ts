import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs/promises';
import { env } from '../env';

const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export async function uploadFile(filePath: string, destinationKey: string, contentType: string = 'video/mp4'): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: destinationKey,
    Body: fileBuffer,
    ContentType: contentType,
  });

  await s3Client.send(command);

  // Return the public URL
  return `${env.S3_PUBLIC_URL}/${destinationKey}`;
}
