import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
    
    await s3Client.send(command);
    console.log(`[Storage] Deleted ${key} from S3.`);
  } catch (err) {
    console.error(`[Storage] Failed to delete ${fileUrl} from S3:`, err);
  }
}
